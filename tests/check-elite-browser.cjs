// Saved scenarios verify crowns and rewards; they do not measure ordinary-play reach rates.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
const url=process.argv[2],out=path.resolve(process.argv[3]||`output/playtest-elite-${Date.now()}`);
assert(url&&new URL(url).hostname==='127.0.0.1');fs.mkdirSync(out,{recursive:false});
const session=`lantern-elite-${process.pid}`,report={cases:[],screenshots:[],sourceHashes:Object.fromEntries(fs.readdirSync(path.join(__dirname,'../dist')).filter(f=>/\.(js|html|css)$/.test(f)).map(f=>[f,createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../dist',f))).digest('hex')]))};
function browser(...args){const r=JSON.parse(execFileSync('agent-browser',['--session',session,'--json',...args],{encoding:'utf8',maxBuffer:8*1024*1024}));assert(r.success,r.error);return r.data;}
const evaluate=code=>browser('eval',code).result;
const ready=()=>browser('wait','--fn','window.lanternGame?.inputReady');
const state=()=>evaluate('window.lanternGame.snapshot().state');
const click=(selector,wait=true)=>{evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);if(wait)ready();};
function fixture(trial,body){
  browser('open',trial?new URL('?trial=strategy',url).href:url);
  browser('wait','--fn','!!window.lanternGame');
  evaluate(`(() => {
    const trial=${trial},e=trial?new StrategyEngine(5454):new DungeonEngine(5454,'depths',true),p=e.player;
    if(trial)e.chooseKit('none');e.floor=5;e.tiles.fill(1);e.rooms[0]={x:2,y:2,w:25,h:20,cx:14,cy:12};
    Object.assign(p,{x:14,y:12,hp:100,maxHp:100,facing:[1,0],bag:[],echoPity:2,nextExp:10000});
    e.enemies=[];e.items=[];e.traps=[];e.surfaces=[];e.monsterHouse=null;e.shrine=null;e.merchant=null;e.stairs={x:25,y:20};
    const add=(species,x,y,elite=true)=>{const v={...DungeonData.monsterStats(species,elite),x,y,id:e.enemies.length,awake:true};v.hp=v.maxHp;e.enemies.push(v);return v;};
    ${body}
    e.reveal();const saved=e.serialize();if(!(trial?StrategyEngine:DungeonEngine).restore(saved))throw Error('Invalid elite fixture');
    localStorage.setItem(trial?'lantern-strategy-trial-v2':'lantern-dungeon-v1',saved);
    localStorage.removeItem(trial?'lantern-strategy-monsters-v2':'lantern-dungeon-monsters-v1');
    Storage.prototype.setItem=()=>{};
  })()`);browser('reload');ready();
}
function reload(){const before=state();browser('reload');ready();const after=state();delete before.log;delete after.log;assert.deepEqual(after,before,'Crown, HP, intent and pity survive reload');}
function screenshot(name){browser('screenshot',path.join(out,name));report.screenshots.push(name);}
function layout(){assert(evaluate(`document.documentElement.scrollWidth<=innerWidth&&document.querySelector('.touch-controls').getBoundingClientRect().bottom<=innerHeight+1&&document.getElementById('game').getBoundingClientRect().height>=160&&document.getElementById('minimap').checkVisibility()`));}
try{
  browser('open',url);browser('wait','--fn','!!window.lanternGame');
  for(const trial of [false,true])for(const [width,height]of [[390,844],[320,568]]){
    browser('set','viewport',String(width),String(height));const label=`${trial?'trial':'normal'}-${width}`;
    fixture(trial,`const e1=add('hornBeetle',16,12);e1.hp-=9;e1.intent={kind:'charge',x:14,y:12,dx:-1,dy:0,length:2};add('mossSlime',12,11);add('wardGolem',16,14);`);
    layout();screenshot(`crowns-${label}.png`);reload();const hp=state().player.hp;
    browser('press','ArrowDown');ready();assert.equal(state().player.hp,hp,'The elite charge is still dodgeable');
    assert.equal(state().enemies.find(e=>e.species==='hornBeetle').x,13);report.cases.push(`crown-hp-warning-charge-reload-${label}`);
    fixture(trial,`const e1=add('mossSlime',15,12);e1.hp=1;`);
    const pity=state().player.echoPity;click('#attack-button');
    assert.equal(state().player.exp,6);assert.equal(state().player.echoPity,pity);
    assert(state().items.some(i=>i.kind==='echoShard'));screenshot(`shard-${label}.png`);reload();
    browser('press','ArrowRight');ready();assert.equal(state().player.echo,'mossSlime');assert.equal(state().player.echoPity,pity);reload();
    report.cases.push(`guaranteed-shard-pity-pickup-${label}`);
    fixture(trial,`add('coinMimic',15,12);`);screenshot(`disguised-${label}.png`);
    click('#world-button',false);click('#world-monsters',false);
    assert(!evaluate(`document.getElementById('modal-content').textContent.includes('ミミック')`),'The elite flag does not reveal disguised enemies in the journal');
    browser('press','Escape');ready();click('#attack-button');assert(state().enemies[0].revealed);
    screenshot(`revealed-${label}.png`);reload();report.cases.push(`mimic-crown-privacy-${label}`);
  }
  const errors=browser('errors');assert.deepEqual(errors.errors||[],[]);report.errors=errors.errors||[];
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  console.log(`PASS: crowns/HP/telegraphs, elite charge, guaranteed shard/pity/pickup/reload and mimic privacy in normal/trial at 390×844 and 320×568. Artifacts: ${out}`);
}finally{browser('close');}
