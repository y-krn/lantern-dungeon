// Dedicated saved scenarios; these are not ordinary-play success rates.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const url = process.argv[2], out = path.resolve(process.argv[3] || `output/enemy-variations-${Date.now()}`);
assert(url && new URL(url).hostname === '127.0.0.1');
fs.mkdirSync(out,{recursive:false});
const session=`lantern-enemies-${process.pid}`;
const report={cases:[],screenshots:[],sourceHashes:Object.fromEntries(fs.readdirSync(path.join(__dirname,'../dist')).filter(f=>/\.(js|html|css)$/.test(f)).map(f=>[f,createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../dist',f))).digest('hex')]))};
function browser(...args) {
  const r=JSON.parse(execFileSync('agent-browser',['--session',session,'--json',...args],{encoding:'utf8',maxBuffer:8*1024*1024}));
  assert(r.success,r.error);return r.data;
}
const evaluate=code=>browser('eval',code).result;
const ready=()=>browser('wait','--fn','window.lanternGame?.inputReady');
const state=()=>evaluate('window.lanternGame.snapshot().state');
const click=(selector,wait=true)=>{evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);if(wait)ready();};
function fixture(body) {
  evaluate(`(() => {
    const e=new DungeonEngine(1044,'depths',true),p=e.player;
    e.tiles.fill(1);e.rooms[0]={x:2,y:2,w:25,h:20,cx:14,cy:12};
    Object.assign(p,{x:14,y:12,hp:100,maxHp:100,facing:[1,0],bag:[],nextExp:10000});
    e.enemies=[];e.items=[];e.traps=[];e.surfaces=[];e.monsterHouse=null;e.shrine=null;e.merchant=null;e.stairs={x:25,y:20};
    const add=(species,x,y,hp=DungeonData.MONSTERS[species].hp)=>{const v={...DungeonData.monsterStats(species),x,y,hp,id:e.enemies.length,awake:true};e.enemies.push(v);return v;};
    ${body}
    e.reveal();const saved=e.serialize();if(!DungeonEngine.restore(saved))throw Error('Invalid scenario');
    localStorage.setItem('lantern-dungeon-progress-v1','true');localStorage.setItem('lantern-dungeon-v1',saved);Storage.prototype.setItem=()=>{};
  })()`);
  browser('reload');ready();
}
function screenshot(name) {browser('screenshot',path.join(out,name));report.screenshots.push(name);}
function layout() {
  const s=evaluate(`(() => {const b=s=>document.querySelector(s).getBoundingClientRect();return {scroll:document.documentElement.scrollWidth,width:innerWidth,controls:b('.touch-controls').bottom,game:b('#game').height,height:innerHeight};})()`);
  assert(s.scroll<=s.width && s.controls<=s.height+1 && s.game>=160,JSON.stringify(s));
}
function reload() {
  const before=state();browser('reload');ready();
  const after=state();delete before.log;delete after.log;assert.deepEqual(after,before,'Save resume preserves combat state');
}
try {
  browser('open',url);browser('wait','--fn','!!window.lanternGame');
  for(const [width,height] of [[390,844],[320,568]]) {
    browser('set','viewport',String(width),String(height));
    fixture(`const b=add('hornBeetle',17,12);b.intent={kind:'charge',x:14,y:12,dx:-1,dy:0,length:3};add('blastMoth',13,11,9);`);
    layout();screenshot(`charge-burst-${width}.png`);reload();
    const hp=state().player.hp;browser('press','ArrowDown');ready();assert.equal(state().player.hp,hp);
    assert.equal(state().enemies.find(e=>e.species==='hornBeetle').x,13);
    report.cases.push(`charge-locked-line-dodge-and-reload-${width}`);
    fixture(`add('snareVine',17,12);`);click('#wait-button');click('#wait-button');
    const bound=state();assert.equal(bound.player.bindUntil,bound.turn+1);
    assert(evaluate(`document.getElementById('mobile-progress').textContent.includes('移動不可')`));
    screenshot(`snare-${width}.png`);reload();
    const turn=state().turn;browser('press','ArrowDown');ready();assert.equal(state().turn,turn);
    click('#attack-button');browser('press','ArrowDown');ready();assert.equal(state().player.y,13);
    report.cases.push(`snare-visible-block-and-attack-${width}`);
    fixture(`add('mirrorBeetle',17,12);p.bag=['arrow'];p.ammo='arrow';p.infusion={kind:'thunder',shots:5};`);
    click('#shoot-button');assert.equal(state().enemies[0].hp,56);assert.equal(state().player.hp,94);reload();
    report.cases.push(`mirror-arrow-no-thunder-${width}`);
    fixture(`const kinds=['bubbleSlime','rustSlime','mudSlime','thiefBat','bellBat','hornBeetle','mirrorBeetle','snareVine','blastMoth','archerGhost','mendGhost','wardGolem'];
      kinds.forEach((kind,i)=>add(kind,[12,13,15,16][i%4],11+Math.floor(i/4)));`);
    screenshot(`twelve-species-${width}.png`);layout();
    click('#help-button',false);click('#monster-guide-button',false);
    assert(evaluate(`['bellBat','mirrorBeetle','blastMoth'].every(species=>{
      const text=document.querySelector('[data-monster="'+species+'"]').parentElement.textContent,m=DungeonData.MONSTERS[species];return text.includes(m.feature)&&text.includes(m.counter);
    })`),'Encountered enemies show their dangers and counters');
    browser('press','Escape');ready();report.cases.push(`encountered-traits-and-counters-${width}`);
  }
  const errors=browser('errors');assert.deepEqual(errors.errors||[],[]);
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  console.log(`PASS: charge lines/dodge/reload, snare feedback and controls, mirror/thunder and all 12 sprites at 390×844 / 320×568. Artifacts: ${out}`);
} finally {browser('close');}
