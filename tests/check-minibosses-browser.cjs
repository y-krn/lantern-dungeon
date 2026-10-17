// Dedicated saved scenarios; these are not ordinary-play completion rates.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
const url=process.argv[2],out=path.resolve(process.argv[3]||`output/playtest-minibosses-${Date.now()}`);
assert(url&&new URL(url).hostname==='127.0.0.1');fs.mkdirSync(out,{recursive:false});
const session=`lantern-minibosses-${process.pid}`,report={cases:[],screenshots:[],sourceHashes:Object.fromEntries(fs.readdirSync(path.join(__dirname,'../dist')).filter(f=>/\.(js|html|css)$/.test(f)).map(f=>[f,createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../dist',f))).digest('hex')]))};
function browser(...args){const r=JSON.parse(execFileSync('agent-browser',['--session',session,'--json',...args],{encoding:'utf8',maxBuffer:8*1024*1024}));assert(r.success,r.error);return r.data;}
const evaluate=code=>browser('eval',code).result;
const ready=()=>browser('wait','--fn','window.lanternGame?.inputReady');
const state=()=>evaluate('window.lanternGame.snapshot().state');
const click=(selector,wait=true)=>{evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);if(wait)ready();};
function fixture(species,body=''){
  evaluate(`(() => {
    const e=new DungeonEngine(4747,'depths',true),p=e.player;e.floor=${species?`DungeonData.MONSTERS[${JSON.stringify(species)}].miniboss`:'24'};
    e.tiles.fill(1);e.rooms[0]={x:2,y:2,w:25,h:20,cx:14,cy:12};
    Object.assign(p,{x:14,y:12,hp:500,maxHp:500,facing:[1,0],bag:[],exp:0,nextExp:10000});
    e.enemies=[];e.items=[];e.traps=[];e.surfaces=[];e.monsterHouse=null;e.merchant=null;e.stairs={x:25,y:20};
    e.shrine={x:14,y:13,used:false,choices:[{id:'vigor'},{id:'rest'},{id:'quiver'}]};
    ${species?`const boss={...DungeonData.monsterStats(${JSON.stringify(species)}),id:0,x:15,y:12,awake:true};boss.hp=boss.maxHp;e.enemies.push(boss);`:''}
    ${body}
    e.reveal();const saved=e.serialize();if(!DungeonEngine.restore(saved))throw Error('Invalid miniboss fixture');
    localStorage.setItem('lantern-dungeon-progress-v1','true');localStorage.setItem('lantern-dungeon-v1',saved);
    localStorage.removeItem('lantern-dungeon-monsters-v1');Storage.prototype.setItem=()=>{};
  })()`);browser('reload');ready();
}
function reload(){const before=state();browser('reload');ready();const after=state();delete before.log;delete after.log;assert.deepEqual(after,before);}
function screenshot(name){browser('screenshot',path.join(out,name));report.screenshots.push(name);}
function layout(){assert(evaluate(`document.documentElement.scrollWidth<=innerWidth&&document.querySelector('.touch-controls').getBoundingClientRect().bottom<=innerHeight+1&&document.getElementById('game').getBoundingClientRect().height>=160&&document.getElementById('minimap').checkVisibility()`));}
try{
  browser('open',url);browser('wait','--fn','!!window.lanternGame');
  for(const[width,height]of [[390,844],[320,568]]){
    browser('set','viewport',String(width),String(height));
    fixture('bubbleMother');screenshot(`mother-${width}.png`);layout();
    for(let i=1;i<=3;i++){click('#attack-button');assert.equal(state().enemies.find(e=>!e.spawned).splitCount,i);reload();}
    assert.equal(state().enemies.filter(e=>e.spawned).length,3);screenshot(`three-splits-${width}.png`);layout();report.cases.push(`mother-three-splits-reload-${width}`);
    fixture('gateGolem',`boss.x=17;boss.hp=180;`);click('#wait-button');assert.equal(state().enemies[0].intent.kind,'charge');
    screenshot(`golem-charge-${width}.png`);layout();reload();const hp=state().player.hp;
    browser('press','ArrowDown');ready();assert.equal(state().player.hp,hp);assert.equal(state().enemies[0].x,13);report.cases.push(`golem-charge-dodge-${width}`);
    fixture('gateGolem',`p.bag=['arrow','scroll'];p.ammo='arrow';`);click('#shoot-button');assert.equal(state().enemies[0].hp,194);
    click('#bag-button',false);click('.bag-entry:has([data-item-action="use"][data-index="0"]) > summary',false);
    click('[data-item-action="use"][data-index="0"]');assert.equal(state().enemies[0].hp,176);reload();report.cases.push(`golem-ward-and-magic-${width}`);
    fixture('bubbleMother',`boss.hp=1;`);click('#attack-button');assert.equal(state().player.shrineBonus,1);assert.equal(state().shrine.choices.length,4);reload();
    browser('press','ArrowDown');ready();click('#site-button',false);
    assert.equal(evaluate(`document.querySelectorAll('[data-boon]').length`),4);screenshot(`four-boons-${width}.png`);
    const turn=state().turn;click('[data-boon="1"]');assert.equal(state().turn,turn);assert.equal(state().player.shrineBonus,0);assert(state().shrine.used);reload();
    report.cases.push(`four-boons-free-single-reward-${width}`);
    fixture('gateGolem',`e.shrine.used=true;boss.hp=1;e.stairs={x:14,y:13};`);click('#attack-button');assert.equal(state().player.shrineBonus,1);
    browser('press','ArrowDown');ready();click('#stairs-button');assert.equal(state().floor,21);assert.equal(state().player.shrineBonus,1);reload();
    fixture(null,`p.shrineBonus=1;e.shrine.used=true;e.stairs={x:14,y:13};`);
    browser('press','ArrowDown');ready();click('#stairs-button');assert.equal(state().floor,25);assert.equal(state().shrine.choices.length,4);reload();
    report.cases.push(`used-shrine-reward-carry-and-next-generation-${width}`);
    fixture('gateGolem',`boss.x=20;e.stairs={x:14,y:13};`);
    browser('press','ArrowDown');ready();click('#stairs-button');assert.equal(state().floor,21);assert(!state().player.shrineBonus);report.cases.push(`bypass-living-boss-${width}`);
  }
  const errors=browser('errors');assert.deepEqual(errors.errors||[],[]);report.errors=errors.errors||[];
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  console.log(`PASS: three splits/reload, ward+charge, large silhouettes, four shrine choices/single free claim, carried rewards and bypassable bosses at 390×844 / 320×568. Artifacts: ${out}`);
}finally{browser('close');}
