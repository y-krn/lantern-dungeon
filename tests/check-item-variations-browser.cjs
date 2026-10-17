// Isolated real-browser item interactions; fixtures are not ordinary-play results.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {execFileSync} = require('node:child_process');
const url = process.argv[2], out = path.resolve(process.argv[3] || `output/items-${Date.now()}`);
assert(url && new URL(url).hostname === '127.0.0.1', 'Use an isolated local test server');
fs.mkdirSync(out,{recursive:false});
const session = `lantern-items-${process.pid}`, report = {cases:[],screenshots:[],errors:[]};
report.sourceHashes=Object.fromEntries(fs.readdirSync(path.join(__dirname,'../dist')).filter(f=>/\.(js|html|css)$/.test(f)).map(f=>[f,createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../dist',f))).digest('hex')]));
const browser = (...args) => {
  const r = JSON.parse(execFileSync('agent-browser',['--session',session,'--json',...args],{encoding:'utf8',maxBuffer:8*1024*1024}));
  assert(r.success,r.error); return r.data;
};
const evaluate = code => browser('eval',code).result;
const state = () => evaluate('window.lanternGame.snapshot().state');
const ready = () => browser('wait','--fn','window.lanternGame && window.lanternGame.inputReady');
const click = selector => browser('click',selector);
function screenshot(name) { browser('screenshot',path.join(out,name)); report.screenshots.push(name); }
function fixture(body = '') {
  evaluate(`(() => {
    const e=new DungeonEngine(1017,'depths',true),p=e.player;
    e.tiles.fill(1);e.rooms[0]={x:2,y:2,w:25,h:20,cx:14,cy:12};
    Object.assign(p,{x:14,y:12,hp:100,maxHp:100,hunger:70,facing:[1,0],bag:[]});
    e.stairs={x:25,y:20};e.enemies=[];e.items=[];e.traps=[];e.surfaces=[];e.monsterHouse=null;
    ${body}
    e.reveal();const saved=e.serialize();if(!DungeonEngine.restore(saved))throw new Error('Invalid item fixture');
    localStorage.setItem('lantern-dungeon-progress-v1','true');localStorage.setItem('lantern-dungeon-v1',saved);
    Storage.prototype.setItem=()=>{};
  })()`);
  browser('reload'); ready();
}
function action(index, name) {
  click('#bag-button');
  const button=`[data-item-action="${name}"][data-index="${index}"]`;
  click(`.bag-entry:has(${button}) > summary`);browser('scrollintoview',button);click(button);
}
function reloadCheck(label) {
  ready();const before=state(),stored=evaluate(`JSON.parse(localStorage.getItem('lantern-dungeon-v1')).state`);
  assert.deepEqual(stored,before,'Committed actions are saved');browser('reload');ready();
  const expected=structuredClone(before);
  expected.log=[{text:'ランタンを灯し直した。冒険の続きへ。',type:'good',turn:expected.turn},...expected.log].slice(0,40);
  assert.deepEqual(state(),expected,'Reload preserves the whole state');
  fs.writeFileSync(path.join(out,`${label}-save.json`),JSON.stringify(stored,null,2));
}
function checkLayout() {
  const layout=evaluate(`({overflow:document.documentElement.scrollWidth>innerWidth,
    modal:document.getElementById('modal').getBoundingClientRect().toJSON(),
    minimap:document.getElementById('minimap').checkVisibility(),width:innerWidth,height:innerHeight})`);
  assert(!layout.overflow);assert(layout.minimap);
  if(layout.modal.width)assert(layout.modal.right<=layout.width+1 && layout.modal.bottom<=layout.height+1);
}
try {
  browser('open',url);
  for(const [width,height] of [[390,844],[320,568]]) {
    browser('set','viewport',String(width),String(height));
    fixture(`p.bag=[{kind:'keepJar',contents:['sleepTalisman']},'bread','potion',...DungeonData.NEW_ITEM_POOL.map(([kind])=>kind).filter(kind=>kind!=='keepJar'),'arrow'];`);
    const original=state();action(0,'jar-put');checkLayout();screenshot(`jar-put-${width}.png`);
    assert(evaluate(`document.getElementById('modal').classList.contains('bag-dialog')`));
    assert(!evaluate(`document.getElementById('modal-content').textContent.includes('眠りの灯札')`));
    assert(!evaluate(`document.getElementById('modal-content').textContent.includes('木の矢')`));
    click('#jar-cancel');assert.deepEqual(state(),original,'Cancel preserves complete state including RNG');
    click('[data-item-action="jar-put"][data-index="0"]');click('[data-jar-target="1"]');ready();
    assert.equal(state().turn,original.turn+1);assert.deepEqual(state().player.bag[0].contents,['sleepTalisman','bread']);
    action(0,'jar-take');checkLayout();screenshot(`jar-take-${width}.png`);
    assert(!evaluate(`document.getElementById('modal-content').textContent.includes('眠りの灯札')`));
    click('[data-jar-target="0"]');ready();assert.equal(state().player.bag.at(-1),'sleepTalisman');
    assert.deepEqual(state().player.bag[0].contents,['bread']);reloadCheck(`jar-${width}`);
    // Unknown new talismans share the same affordances, including the hidden infusion action.
    fixture(`p.bag=['sleepTalisman','gustTalisman','arrow'];`);
    click('#bag-button');assert(!evaluate(`document.getElementById('modal-content').textContent.includes('眠りの灯札')`));
    assert(!evaluate(`document.querySelector('[data-item-action="infuse"]')`));browser('press','Escape');
    // The full bag disables taking out, but floor consumables remain usable.
    fixture(`p.bag=[{kind:'keepJar',contents:['greatHerb']},...Array(21).fill('bread')];e.items=[{kind:'driedFruit',x:p.x,y:p.y,amount:1}];p.hp=50;`);
    click('#bag-button');assert(evaluate(`document.querySelector('[data-item-action="jar-take"]').disabled`));
    browser('press','Escape');click('#ground-use-button');ready();assert.equal(state().player.hp,55);assert.equal(state().items.length,0);
    fixture(`p.bag=Array(22).fill('bread');e.items=[{kind:'keepJar',contents:['sleepTalisman'],x:p.x,y:p.y,amount:1}];`);
    assert(evaluate(`document.getElementById('ground-use-button').hidden`));click('#ground-item-button');
    assert(!evaluate(`document.querySelector('[data-item-action="use"], [data-item-action="exchange"]')`));
    assert(evaluate(`document.querySelector('[data-item-action="pickup"]').disabled`));browser('press','Escape');
    // All twelve floor items render, and control-state markers survive a browser reload.
    fixture(`
      for(const [index,[kind]] of DungeonData.NEW_ITEM_POOL.entries())e.items.push({kind,contents:[],amount:1,x:p.x+(index%4)-2,y:p.y+Math.floor(index/4)+1,discovered:true});
      e.enemies=[{...DungeonData.monsterStats('moonPlant'),hp:48,x:p.x+2,y:p.y-1,id:1,awake:true,sleepUntil:8},
        {...DungeonData.monsterStats('caveBat'),hp:17,x:p.x-2,y:p.y-1,id:2,awake:true,slowUntil:10}];
    `);
    checkLayout();screenshot(`floor-items-${width}.png`);
    click('#wait-button');ready();reloadCheck(`states-${width}`);
    report.cases.push({viewport:[width,height],result:'PASS',checks:['jar-put/take/cancel','privacy','full-capacity','ground-use','floor-art','save/reload']});
  }
  // Sleep cancels a visible shot through the product bag, then the lit arrow sleeps its target.
  fixture(`p.bag=['sleepTalisman','sleepTalisman','arrow'];p.ammo='arrow';e.identification.known=DungeonData.SCROLLS;
    e.enemies=[{...DungeonData.monsterStats('moonPlant'),hp:48,x:17,y:12,id:1,awake:true,intent:{kind:'ranged',x:14,y:12}}];`);
  action(0,'use');ready();assert(state().enemies[0].sleepUntil);assert(!state().enemies[0].intent);assert.equal(state().player.hp,100);
  action(0,'infuse');ready();click('#shoot-button');ready();assert.equal(state().enemies[0].hp,36);assert.equal(state().player.infusion.kind,'sleep');
  reloadCheck('sleep-arrow');
  report.cases.push({result:'PASS',checks:['sleep-telegraph','sleep-infusion','sleep-arrow','save/reload']});
  report.errors=browser('errors').errors||[];assert.equal(report.errors.length,0,JSON.stringify(report.errors));
  console.log(`PASS: item browser interactions at 390x844 and 320x568. Artifacts: ${out}`);
} catch(error) { report.failure=String(error.stack||error);try { screenshot('failure.png'); report.layout=evaluate(`Array.from(document.querySelectorAll('.bag-list,.bag-entry[open],.bag-actions,#modal-content>.secondary-button')).map(e=>({tag:e.className,rect:e.getBoundingClientRect().toJSON()}))`); } catch {} throw error; }
finally { fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));try { browser('close'); } catch(error) { if(!report.failure)throw error; } }
