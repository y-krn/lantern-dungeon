const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

require('./dist/engine.js');
const html = fs.readFileSync(path.join(__dirname, 'dist/index.html'), 'utf8');
const scripts = [...html.matchAll(/<script defer src="([^"]+)"/g)].map(match => match[1]).filter(file => file !== 'pwa.js');
assert.equal(scripts.at(-1), 'game.js', 'The UI starts after its dependencies');
const frames = [];
const browser = vm.createContext({requestAnimationFrame: callback => frames.push(callback)});
for (const script of scripts.slice(0, -1)) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'dist', script), 'utf8'), browser, {filename: script});
}

for (const dungeon of ['tutorial', 'depths']) {
  const nodeGame = new DungeonEngine(73, dungeon, true);
  const browserGame = new browser.DungeonEngine(73, dungeon, true);
  for (let floor = 1; floor <= nodeGame.maxFloor(); floor++) {
    nodeGame.floor = browserGame.floor = floor;
    nodeGame.generateFloor();
    browserGame.generateFloor();
    for (let turn = 0; turn < 4; turn++) {
      nodeGame.wait();
      browserGame.wait();
    }
    assert.equal(browserGame.serialize(), nodeGame.serialize(), `${dungeon}/${floor}: both loading paths preserve RNG and state`);
    assert.equal(browser.DungeonEngine.restore(nodeGame.serialize()).serialize(), nodeGame.serialize());
  }
}

let game = new DungeonEngine(13);
const calls = [];
const gradient = {addColorStop() {}};
const context = new Proxy({}, {
  get: (_, key) => key === 'createRadialGradient' ? () => gradient : (...args) => {
    assert(args.filter(value => typeof value === 'number').every(Number.isFinite), `Invalid ${key} drawing coordinate`);
    calls.push(key);
  },
  set: () => true,
});
const bounds = {left: 0, top: 0, width: 880, height: 576};
const canvas = {width: 880, height: 576, getContext: () => context, getBoundingClientRect: () => bounds};
const renderer = browser.createDungeonRenderer({canvas, minimap: canvas, viewport: canvas, getEngine: () => game, reduced: true});
renderer.resize();
renderer.start();
function draw() {
  const saved = game.serialize();
  calls.length = 0;
  frames.shift()(1000);
  assert(calls.length > 100, 'The scene and minimap render');
  assert.equal(game.serialize(), saved, 'Rendering cannot mutate game state');
  assert.equal(frames.length, 1, 'Exactly one animation loop');
}
draw();
game = new DungeonEngine(21, 'depths', true);
renderer.reset();
draw();
renderer.reset({x: game.player.x + .5, y: game.player.y + .5});
assert.deepEqual(Array.from(renderer.directionAt({clientX: bounds.width / 2 + 40, clientY: bounds.height / 2})), [1, 0]);
bounds.width = 390;
bounds.height = 256;
renderer.resize();
draw();
renderer.reset({x: game.player.x + .5, y: game.player.y + .5});
assert.deepEqual(Array.from(renderer.directionAt({clientX: bounds.width / 2 + 48 / 880 * bounds.width, clientY: bounds.height / 2})), [1, 0]);
// Zoom changes the projection only, including the pointer-to-tile mapping.
{
  const saved = game.serialize();
  for (const [close, size] of [[true, 96], [false, 48]]) {
    renderer.setCloseView(close);
    renderer.reset({x: game.player.x + .5, y: game.player.y + .5});
    assert.deepEqual(Array.from(renderer.directionAt({clientX: bounds.width / 2 + size / 880 * bounds.width, clientY: bounds.height / 2})), [1, 0]);
    assert.deepEqual(Array.from(renderer.directionAt({clientX: bounds.width / 2, clientY: bounds.height / 2 - size / 880 * bounds.width})), [0, -1]);
    assert.equal(game.serialize(), saved, 'Zoom cannot consume a turn or change a save');
  }
}
// Exercise the loaded-art path: all directions and species must use complete, in-bounds frames.
{
  const png = fs.readFileSync(path.join(__dirname, 'dist/art/lantern-atlas.png'));
  const atlasWidth = png.readUInt32BE(16), atlasHeight = png.readUInt32BE(20), sources = [];
  browser.Image = class {
    complete = true; naturalWidth = atlasWidth;
    set src(value) {
      assert(['art/lantern-atlas.png', 'art/lantern-items.png'].includes(value));
      const file = fs.readFileSync(path.join(__dirname, 'dist', value));
      this.source = value; this.naturalWidth = file.readUInt32BE(16); this.naturalHeight = file.readUInt32BE(20);
      this.onload();
    }
  };
  browser.document = {createElement: tag => {
    assert.equal(tag, 'canvas');
    const texture = {getContext: () => ({drawImage(image, x, y, w, h) {
      assert(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= image.naturalWidth && y + h <= image.naturalHeight);
      texture.frame = image.source + ':' + [x, y, w, h].join(',');
      sources.push([x, y, w, h].join(','));
    }})};
    return texture;
  }};
  const painted = browser.createDungeonRenderer({canvas, minimap: canvas, viewport: canvas, getEngine: () => game});
  for (const [type, flip] of [['hero', false], ['heroDownRight', false], ['heroRight', false], ['heroUpRight', false], ['heroUp', false], ['heroUpRight', true], ['heroRight', true], ['heroDownRight', true]])
    painted.sprite(context, type, 0, 0, 3, 1, flip);
  assert.equal(new Set(sources).size, 8, 'Eight directions use eight different painted views');
  const start = sources.length;
  const bookContext = {save() {}, restore() {}, fillRect() {}, drawImage(image, x, y, w, h) {
    assert(x >= -.001 && y >= -.001 && x + w <= 80.001 && y + h <= 80.001, `The bestiary cannot clip ears, wings or lanterns: ${[x, y, w, h]}`);
  }};
  for (const [species, monster] of Object.entries(DungeonData.MONSTERS))
    painted.sprite(bookContext, monster.type, 0, 0, 5, 1, false, species);
  assert.equal(sources.length - start, 25, 'All species have a painted sprite');
  assert.equal(new Set(sources.slice(start)).size, 9, 'Nine monster families have distinct silhouettes');
  const itemTypes = ['bread', 'potion', 'scroll', 'arrow', 'gold', ...Object.keys(DungeonData.EQUIPMENT), 'lantern'];
  const itemSources = {};
  const itemContext = {save() {}, restore() {}, drawImage(image, x, y, w, h) {
    assert(x >= -.001 && y >= -.001 && x + w <= 80.001 && y + h <= 80.001, 'An item must fit its tile');
    assert(image.width >= 170 && image.height >= 190, 'Item textures exceed the former 16px patterns');
    itemSources[itemTypes[Object.keys(itemSources).length]] = image.frame;
  }};
  for (const type of itemTypes) painted.sprite(itemContext, type, 0, 0, 5);
  assert.equal(new Set(Object.values(itemSources)).size, 18, 'Every item family and equipment variant has its own art');

  // Rendering must not reveal talisman effects, appraisal/curse state, or a disguised mimic.
  const fixture = new DungeonEngine(41), {x, y} = fixture.player, drawFrames = [];
  fixture.items = ['scroll', 'map', 'identify', 'uncurse', 'gold'].map(kind => ({kind, x, y}));
  fixture.items.push(...[false, true].map(identified => ({kind:'weapon', variant:'ghostSword', rank:1, identified, cursed:identified, bonus:identified ? 3 : -1, x, y})));
  fixture.enemies = [{...DungeonData.monsterStats('coinMimic'), hp:20, x, y, id:1, revealed:false}];
  const drawContext = new Proxy(context, {get(target, key) {
    return key === 'drawImage' ? image => {drawFrames.push(image.frame);} : target[key];
  }});
  const fixtureCanvas = {...canvas, getContext: () => drawContext};
  const scene = browser.createDungeonRenderer({canvas:fixtureCanvas, minimap:canvas, viewport:canvas, getEngine:() => fixture, reduced:true});
  scene.resize(); const before = fixture.serialize(); scene.start(); frames.pop()(1000);
  assert.equal(fixture.serialize(), before, 'Painting items cannot alter saves, item knowledge or RNG');
  assert.equal(drawFrames.filter(frame => frame === itemSources.scroll).length, 4, 'All four talismans share one appearance');
  assert.equal(drawFrames.filter(frame => frame === itemSources.gold).length, 2, 'An unrevealed mimic looks exactly like gold');
  assert.equal(drawFrames.filter(frame => frame === itemSources.ghostSword).length, 2, 'Appraisal, curses and bonuses cannot change equipment art');
}
// The UI keeps item locations explicit and never mutates state while choosing.
function inventoryUI(engine) {
  const source = fs.readFileSync(path.join(__dirname,'dist/game.js'),'utf8');
  const state = {kind:null, html:'', buttons:[], rows:[], controls:new Map(), open:false};
  function buttons(html) {
    return [...html.matchAll(/<button\b([^>]*)>/g)].map(match => {
      const attrs = Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(value => [value[1],value[2]]));
      const dataset = Object.fromEntries(Object.entries(attrs).filter(([key]) => key.startsWith('data-'))
        .map(([key,value]) => [key.slice(5).replace(/-([a-z])/g,(_,letter) => letter.toUpperCase()),value]));
      return {dataset, disabled:/\bdisabled\b/.test(match[1]), addEventListener(event,listener){this.listener=listener;},
        click(){assert(!this.disabled,'Cannot click a disabled action');assert(this.listener,'Missing action listener');this.listener();}};
    });
  }
  const controls = id => {
    if (!state.controls.has(id)) state.controls.set(id,{value:'',focus(){},addEventListener(event,listener){this[event]=listener;}});
    return state.controls.get(id);
  };
  const closeModal = () => {state.open=false;state.kind=null;};
  const context = vm.createContext({engine,...DungeonData,portraitUI:false,modalHeader:title=>`<h2>${title}</h2>`,
    closeModal,act:action=>action(),requestAnimationFrame(){},save(){},updateUI(){},
    openModal(kind,html){
      state.kind=kind;state.html=html;state.open=true;state.controls.clear();state.buttons=buttons(html);
      state.rows=[...html.matchAll(/<details class="bag-entry"[^>]*>([\s\S]*?)<\/details>/g)].map(match=>{
        const summary={scrollIntoView(){},addEventListener(event,listener){this.listener=listener;}};
        const row={open:false,querySelector(selector){
          return selector==='summary'?summary:match[1].includes(selector.slice(1,-1))?{}:null;
        },activate(){summary.listener();row.open=!row.open;}};
        return row;
      });
    },
    $:id=>id==='modal'?{get open(){return state.open;}}:id==='modal-content'?{
      querySelectorAll(selector){
        if(selector==='.bag-entry')return state.rows;
        const key=selector.slice(6,-1).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase());
        return state.buttons.filter(button=>Object.hasOwn(button.dataset,key));
      },
    }:controls(id),
  });
  vm.runInContext(source.slice(source.indexOf('  const escapeHTML'),source.indexOf('  function showMonsters')),context);
  state.call=code=>vm.runInContext(code,context);
  state.action=(action,index='ground')=>{
    const button=state.buttons.find(button=>button.dataset.itemAction===action&&button.dataset.index===String(index));
    assert(button,`Missing ${action} action for ${index}`);button.click();
  };
  state.target=target=>{const button=state.buttons.find(button=>button.dataset.target===String(target));assert(button);button.click();};
  state.cancel=id=>{const control=controls(id);assert(control.click);control.click();};
  state.control=controls;state.close=closeModal;state.context=context;return state;
}
function quietUI() {
  const engine=new DungeonEngine(42),room=engine.roomAt(engine.player.x,engine.player.y);
  engine.player.x=room.cx;engine.player.y=room.cy;engine.enemies=[];engine.items=[];engine.traps=[];engine.monsterHouse=null;
  return engine;
}
{
  const engine=quietUI(),p=engine.player;
  const known={kind:'weapon',variant:'starSword',rank:3,bonus:2,cursed:false,identified:true};
  const unknown={kind:'shield',variant:'mirrorShield',rank:0,bonus:-2,cursed:true,identified:false};
  p.bag=['bread',known,unknown,'arrow','potion','arrow'];const ui=inventoryUI(engine);
  const saved=engine.serialize();ui.call('showBag()');assert.equal(engine.serialize(),saved);assert.equal(ui.rows.length,7);
  ui.rows[2].activate();ui.rows[3].activate();assert.equal(ui.rows[2].open,false);assert.equal(ui.rows[3].open,true);
  ui.rows[3].activate();assert(ui.rows.every(row=>!row.open));assert.equal(engine.serialize(),saved);
  const names=[...ui.html.matchAll(/<summary>[\s\S]*?<strong>([^<]+)<\/strong>/g)].map(match=>match[1]);
  assert.deepEqual(names.slice(2),['木の矢 × 2','鏡の盾（未鑑定）','焼きたてパン','回復草','星鉄の剣 +2']);
  ui.action('drop',0);assert.equal(engine.groundItem().kind,'bread');assert.equal(engine.turn,1);
  ui.call('showBag()');assert(ui.html.includes('data-ground-row'));assert(ui.html.includes('足元'));
  ui.action('exchange',1);assert.equal(engine.groundItem().variant,'mirrorShield');assert(!engine.groundItem().identified);
  assert.equal(p.bag.at(-1),'bread');assert.equal(engine.turn,2);
}
{
  const engine=quietUI(),p=engine.player;
  const gear={...p.equipment.weapon,bonus:-2,cursed:true,identified:false,x:p.x,y:p.y,amount:1};
  engine.items=[gear];p.bag=['identify',{...p.equipment.shield,identified:false},...Array(16).fill('bread')];
  const ui=inventoryUI(engine),before=engine.serialize();ui.call('showBag()');
  assert(ui.html.includes('data-ground-row'));assert(ui.html.includes('鑑定（灯札1枚）'));assert.equal(engine.serialize(),before);
  ui.action('use',0);assert.equal(ui.kind,'identify');
  assert.deepEqual(ui.buttons.filter(button=>button.dataset.target).map(button=>button.dataset.target),['ground','1']);
  assert(ui.html.includes('足元'));assert(ui.html.includes('持ち物'));assert.equal(engine.serialize(),before);
  ui.cancel('identify-cancel');assert.equal(ui.kind,'bag');assert.equal(engine.serialize(),before);
  assert(ui.rows.some(row=>row.open),'Cancellation reopens the source item');
  ui.action('use',0);ui.target('ground');assert(gear.identified);assert(gear.cursed);assert.equal(gear.bonus,-2);
  assert.equal(engine.turn,1);assert.equal(engine.inventoryCount(),19);assert.equal(engine.groundItem(),gear);
  gear.identified=false;p.bag.push('identify');ui.call('showBag()');ui.action('appraise');
  assert(gear.identified);assert.equal(engine.turn,2);assert.equal(engine.inventoryCount(),19);
  p.bag=Array(18).fill('bread');p.hp=1;engine.items=[{kind:'potion',x:p.x,y:p.y}];
  ui.call('showBag()');ui.action('use');assert.equal(p.hp,26);assert.equal(engine.turn,3);assert.equal(engine.inventoryCount(),20);
  engine.items=[{...gear,identified:false}];ui.call('useGroundFromField()');assert.equal(ui.kind,'ground');
  const beforeExchange=engine.serialize();ui.action('exchange');assert.equal(ui.kind,'exchange');assert.equal(engine.serialize(),beforeExchange);
  ui.cancel('exchange-cancel');assert.equal(ui.kind,'ground');assert.equal(engine.serialize(),beforeExchange);
  ui.action('exchange');ui.buttons.find(button=>button.dataset.exchange==='17').click();
  assert.equal(engine.groundItem().kind,'bread');assert(p.bag.some(item=>item.cursed&&!item.identified));
  assert.equal(engine.inventoryCount(),20);assert.equal(engine.turn,4);
}
{
  const engine=quietUI(),p=engine.player;p.bag=['identify',...Array(17).fill('bread')];engine.identification.known=[];
  engine.items=[{kind:'map',x:p.x,y:p.y}];const ui=inventoryUI(engine);ui.call('showGround()');
  assert(!ui.html.includes('道しるべの灯札'));assert(!ui.buttons.some(button=>button.dataset.itemAction==='appraise'));
  ui.action('name');ui.control('item-name').value='<script>&地図？';
  ui.control('item-name-form').submit({preventDefault(){}});
  assert.equal(ui.kind,'ground');assert(ui.html.includes('&lt;script&gt;&amp;地図？'));assert.equal(engine.turn,0);
  assert.equal(engine.identification.known.length,0);
  ui.close();engine.items=[{kind:'identify',x:p.x,y:p.y}];const before=engine.serialize();
  ui.call('useGroundFromField()');assert.equal(ui.kind,'identify');assert.equal(engine.serialize(),before);
  ui.cancel('identify-cancel');assert.equal(ui.kind,null);assert.equal(engine.serialize(),before);
  engine.identification.known=['identify'];engine.items=[];p.bag=['identify','bread'];
  ui.call('showIdentify(0)');assert(ui.html.includes('鑑定できる品がありません。'));assert(!ui.buttons.some(button=>button.dataset.target));
}
// Field controls keep threats visible and all unknown identities concealed.
{
  const engine=quietUI(),p=engine.player,ui=inventoryUI(engine);engine.identification.known=[];
  const node=()=>({hidden:true,setAttribute(name,value){this[name]=value;}});
  const caption={},hint={textContent:'敵が攻撃準備。',closest:()=>caption};
  Object.assign(ui.context,{p,groundContext:node(),groundUseButton:node(),groundItemButton:node(),threat:{name:'敵'},nearest:null,$:()=>hint});
  const source=fs.readFileSync(path.join(__dirname,'dist/game.js'),'utf8'),start=source.indexOf('    const ground = engine.groundItem();');
  const refresh='{'+source.slice(start,source.indexOf('    const list = $("event-log");',start))+'}';
  for(const kind of ['bread','potion','scroll','map','identify','uncurse','arrow','weapon','shield','gold']){
    engine.items=[{kind,x:p.x,y:p.y,amount:1,...(['weapon','shield'].includes(kind)?p.equipment[kind]:{})}];ui.call(refresh);
    assert(!ui.context.groundContext.hidden);assert(!hint.hidden);assert(!caption.hidden);
    if(['scroll','map','identify','uncurse'].includes(kind))assert(!ui.context.groundItemButton.innerHTML.includes(DungeonData.ITEMS[kind].name));
  }
  engine.items=[];ui.call(refresh);assert(ui.context.groundContext.hidden);assert(ui.context.groundUseButton.hidden);
  engine.items=[{kind:'bread',x:p.x+1,y:p.y}];ui.call(refresh);assert(ui.context.groundContext.hidden);
  engine.items=[{kind:'bread',x:p.x,y:p.y}];
  for(const status of ['dead','won']){engine.status=status;ui.call(refresh);assert(ui.context.groundContext.hidden);}
}
console.log('PASS: item locations, ground action UI, appraisal/exchange targets and cancellation, source-row restoration, naming privacy and field warnings.');
