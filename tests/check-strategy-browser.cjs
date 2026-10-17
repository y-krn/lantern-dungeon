// Local UI verification with isolated storage. Generated fixtures are not ordinary-play results.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const url = process.argv[2];
assert(url && new URL(url).hostname === '127.0.0.1', 'Use an isolated local test server');
const out = path.resolve(process.argv[3] || `output/playtest-strategy-${Date.now()}`);
fs.mkdirSync(path.dirname(out), {recursive:true});
fs.mkdirSync(out, {recursive:false});
const session = `lantern-strategy-ui-${process.pid}`, report = {cases:[], screenshots:[], errors:[]};
report.sourceHashes=Object.fromEntries(fs.readdirSync(path.join(__dirname,'../dist')).filter(f=>/\.(js|html|css)$/.test(f)).map(f=>[f,createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../dist',f))).digest('hex')]));
const browser = (...args) => {
  const reply = JSON.parse(execFileSync('agent-browser', ['--session',session,'--json',...args], {encoding:'utf8',maxBuffer:8*1024*1024}));
  assert(reply.success,reply.error); return reply.data;
};
const evaluate = code => browser('eval',code).result;
const state = () => evaluate('window.lanternGame.snapshot().state');
const ready = () => browser('wait','--fn','window.lanternGame && window.lanternGame.inputReady');
// Match the regular playtest runner: dispatch through product DOM handlers.
const click = selector => evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)});if(!e || e.disabled)throw new Error('Unavailable control');e.click();})()`);
function screenshot(name) { browser('screenshot',path.join(out,name)); report.screenshots.push(name); }
function fixture(body = '') {
  evaluate(`(() => {
    const e=new StrategyEngine(1017); e.chooseKit('lampSpear');
    e.tiles.fill(1); e.rooms[0]={x:2,y:2,w:25,h:20,cx:14,cy:12};
    Object.assign(e.player,{x:14,y:12,hp:100,maxHp:100,facing:[1,0]});
    e.stairs={x:25,y:20};e.enemies=[];e.items=[];e.traps=[];e.monsterHouse=null;
    ${body}
    e.reveal();const saved=e.serialize();
    if(!StrategyEngine.restore(saved))throw new Error('Invalid strategy fixture');
    localStorage.setItem('lantern-strategy-trial-v2',saved);
    Storage.prototype.setItem=()=>{};
  })()`);
  browser('reload'); ready();
}
function bagUse(kind, action='use') {
  ready(); const index=state().player.bag.findIndex(i => i===kind);
  assert(index>=0,`Missing ${kind}`);
  click('#bag-button');
  const button=`[data-item-action="${action}"][data-index="${index}"]`;
  click(`.bag-entry:has(${button}) > summary`);
  browser('wait','--fn',`document.querySelector('${button}').checkVisibility()`);
  click(button);
}
function checkLayout() {
  const layout=evaluate(`({overflow:document.documentElement.scrollWidth>innerWidth,
    controls:document.querySelector('.touch-controls').getBoundingClientRect().toJSON(),
    game:document.getElementById('game').getBoundingClientRect().toJSON(),
    minimap:document.getElementById('minimap').checkVisibility(),
    viewport:innerHeight})`);
  assert(!layout.overflow);assert(layout.minimap);assert(layout.game.height>=160,`Canvas height ${layout.game.height}`);
  assert(layout.controls.bottom<=layout.viewport+1,'Touch controls remain in the viewport');
  return layout;
}
try {
  browser('open',url);
  // Preserve an ordinary game and progress value while the trial writes only its own keys.
  evaluate(`localStorage.setItem('lantern-dungeon-v1',new DungeonEngine(41).serialize());localStorage.setItem('lantern-dungeon-progress-v1','true');Storage.prototype.setItem=()=>{}`);
  const normal=evaluate(`localStorage.getItem('lantern-dungeon-v1')`);
  browser('open',new URL('?trial=strategy',url).href);
  browser('set','viewport','390','844');
  assert.equal(evaluate(`document.querySelectorAll('[data-kit]').length`),5,'Four weapons and current gear are offered');
  assert(!evaluate(`document.getElementById('modal-content').textContent.includes('鐘打ちの槌') || document.getElementById('modal-content').textContent.includes('返しの盾')`));
  click('[data-kit="lampSpear"]');ready();assert(state().kitChosen);assert.equal(state().floor,1);
  screenshot('trial-start-390.png');checkLayout();
  for(const [width,height] of [[390,844],[320,568]]) {
    browser('set','viewport',String(width),String(height));
    fixture();const before=state();
    bagUse('lightSeed');
    assert(evaluate('!document.getElementById("strategy-aim").hidden'));
    checkLayout();screenshot(`aim-${width}.png`);
    click('#strategy-cancel');ready();assert.deepEqual(state(),before,'Cancel does not change state');
    bagUse('lightSeed');click('#strategy-confirm');ready();
    const placed=state();assert.equal(placed.turn,before.turn+1);assert.equal(placed.strategy.lamp.remaining,5);
    assert.equal(placed.player.bag.filter(i=>i==='lightSeed').length,1);
    screenshot(`light-${width}.png`);checkLayout();
    const stored=evaluate(`JSON.parse(localStorage.getItem('lantern-strategy-trial-v2')).state`);
    fs.writeFileSync(path.join(out,`placed-${width}.json`),JSON.stringify(stored,null,2));
    assert.deepEqual(stored,placed,'The committed targeted action is saved');
    browser('reload');ready();const reloaded=state();
    const expected=structuredClone(placed);expected.log=[{text:'ランタンを灯し直した。冒険の続きへ。',type:'good',turn:expected.turn},...expected.log].slice(0,40);
    assert.deepEqual(reloaded,expected,'Light lifetime and state survive reload');
    fs.writeFileSync(path.join(out,`reloaded-${width}.json`),JSON.stringify(reloaded,null,2));
    // Exact tile selection through the product canvas pointer handler.
    fixture();bagUse('swapTalisman');
    const rect=evaluate('document.getElementById("game").getBoundingClientRect().toJSON()');
    browser('mouse','move',String(Math.round(rect.left+rect.width/2)),String(Math.round(rect.top+rect.height/2)));
    browser('mouse','down');browser('mouse','up');
    assert(evaluate('document.getElementById("strategy-confirm").disabled'),'A self-target without an enemy is invalid');
    click('#strategy-cancel');ready();
    // At capacity, a floor item can still enter targeting and be consumed directly.
    fixture(`e.player.bag=Array(18).fill('bread');e.items=[{kind:'lightSeed',x:14,y:12,amount:1}];`);
    assert.equal(evaluate('window.lanternGame.snapshot().state.player.bag.length'),18);
    click('#ground-use-button');click('#strategy-confirm');ready();
    assert.equal(state().items.length,0);assert(state().strategy.lamp);assert.equal(state().player.bag.length,18);
    // Dumplings are food only, in the bag and directly on the floor.
    fixture(`e.player.hunger=50;`);click('#bag-button');
    assert.equal(evaluate(`document.querySelectorAll('[data-item-action="throw"]').length`),0);
    browser('press','Escape');bagUse('bait');ready();assert.equal(state().player.hunger,65);
    fixture(`e.player.hunger=50;e.player.bag=Array(18).fill('bread');e.items=[{kind:'bait',x:14,y:12,amount:1}];`);
    click('#ground-item-button');assert.equal(evaluate(`document.querySelectorAll('[data-item-action="throw"]').length`),0);
    click('[data-item-action="use"][data-index="ground"]');ready();assert.equal(state().player.hunger,65);assert.equal(state().items.length,0);assert.equal(state().player.bag.length,18);
    fixture();bagUse('vineSeed');ready();assert.equal(state().strategy.vines.length,1);
    fixture(`e.items=[{kind:'potion',amount:1,x:17,y:12}];`);
    bagUse('pullTalisman');click('[data-direction="1,0"]');click('[data-direction="1,0"]');click('#strategy-confirm');ready();
    assert.equal(state().items[0].x,15,'Pull through the targeting UI moves the floor item');
    fixture(`e.enemies=[{...DungeonData.monsterStats('ironBeetle'),hp:18,x:16,y:12,id:0,awake:true}];`);
    bagUse('swapTalisman');click('[data-direction="1,0"]');click('#strategy-confirm');ready();assert.equal(state().player.x,16);
    fixture(`e.strategy.lamp={x:16,y:12,remaining:5};`);bagUse('returnTalisman');ready();assert.equal(state().player.x,16);assert.equal(state().strategy.lamp,null);
    // Directional touch input attacks at reach without stepping or pressing Attack.
    fixture(`e.enemies=[{...DungeonData.monsterStats('cobaltBeetle'),hp:49,x:16,y:12,id:0,awake:true}];`);
    const beforeThrust=state();click('[data-direction="1,0"]');ready();
    const thrust=state();assert.equal(thrust.turn,beforeThrust.turn+1);assert.equal(thrust.player.x,14);
    assert(thrust.enemies[0].hp<beforeThrust.enemies[0].hp);screenshot(`spear-${width}.png`);checkLayout();
    browser('reload');ready();assert.equal(state().turn,thrust.turn);assert.equal(state().enemies[0].hp,thrust.enemies[0].hp);
    fixture(`e.player.facing=[0,1];e.enemies=[{...DungeonData.monsterStats('cobaltBeetle'),hp:49,x:16,y:12,id:0,awake:true}];`);
    click('#turn-button');click('[data-direction="1,0"]');
    assert.equal(state().turn,0);assert.equal(state().enemies[0].hp,49,'Face-only input never attacks');click('#turn-button');
    ready();browser('press','ArrowRight');ready();assert.equal(state().turn,1);assert.equal(state().player.x,14);assert(state().enemies[0].hp<49);
    fixture();click('[data-direction="1,0"]');ready();assert.equal(state().player.x,15,'Empty reach allows walking');
    // A lamp never distracts a visible moth; ordinary pursuit continues.
    fixture(`e.enemies=[{...DungeonData.monsterStats('lanternMoth'),hp:12,x:17,y:14,id:1,awake:true}];`);
    bagUse('lightSeed');click('[data-direction="1,0"]');click('[data-direction="1,0"]');click('#strategy-confirm');ready();
    assert.equal(state().enemies[0].x,16);assert(!Object.hasOwn(state().enemies[0],'lure'));assert(!Object.hasOwn(state().enemies[0],'lureUsed'));
    screenshot(`pursuit-${width}.png`);checkLayout();
    assert(evaluate(`localStorage.getItem('lantern-dungeon-v1')===${JSON.stringify(normal)}`),'The trial preserves the ordinary save exactly');
    assert.equal(evaluate(`localStorage.getItem('lantern-dungeon-progress-v1')`),'true');
    report.cases.push({viewport:[width,height],result:'passed',checks:['target/cancel','single consumption','reload','canvas pointer','floor use at capacity','food-only bag/floor','vine','pull','swap','return','directional spear','face-only','keyboard spear','empty reach movement','ordinary pursuit with lamp','normal save isolation','layout']});
  }
  fixture();bagUse('lightSeed');click('#strategy-confirm');ready();
  const online=state();
  browser('wait','--fn','!!navigator.serviceWorker.controller');
  browser('set','offline','on');browser('reload');ready();
  assert.deepEqual(state().strategy,online.strategy,'The complete trial shell and current light survive an offline reload');
  assert.equal(state().turn,online.turn);browser('set','offline','off');report.offline=true;
  // Unknown future versions remain untouched, even when a fresh trial is shown.
  evaluate(`localStorage.setItem('lantern-strategy-trial-v2','{"version":999,"state":{}}');Storage.prototype.setItem=()=>{}`);
  browser('reload');assert.equal(evaluate(`localStorage.getItem('lantern-strategy-trial-v2')`),'{"version":999,"state":{}}');
  assert(evaluate(`document.getElementById('save-label').textContent.includes('保存無効')`));
  report.errors=browser('errors').errors;
  assert.equal(report.errors.length,0,'No browser errors');
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  console.log(`PASS: trial UI at 390×844 and 320×568; cancellation, targeting, lifetime/reload, capacity, food-only dumplings, ordinary pursuit, directional spear, face-only, normal-save isolation and future-save preservation. Artifacts: ${out}`);
} catch (error) {
  report.failure=String(error);
  try { screenshot('failure.png'); report.visible=evaluate('document.body.innerText'); } catch {}
  throw error;
} finally {
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  browser('close');
}
