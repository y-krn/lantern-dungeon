const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

require('../dist/engine.js');
const html = fs.readFileSync(path.join(__dirname, '../dist/index.html'), 'utf8');
const scripts = [...html.matchAll(/<script defer src="([^"]+)"/g)].map(match => match[1]).filter(file => file !== 'pwa.js');
assert.equal(scripts.at(-1), 'game.js', 'The UI starts after its dependencies');
for (const file of ['index.html', 'combat-preview.html']) {
  const page = fs.readFileSync(path.join(__dirname, '../dist', file), 'utf8');
  const dependencies = [...page.matchAll(/<script defer src="([^"]+)"/g)].map(match => match[1]);
  assert(dependencies.indexOf('sprites.js') > dependencies.indexOf('data.js'));
  assert(dependencies.indexOf('renderer.js') > dependencies.indexOf('sprites.js'), 'Sprite drawing loads before the scene renderer');
}
const frames = [];
const browser = vm.createContext({requestAnimationFrame: callback => frames.push(callback)});
for (const script of scripts.slice(0, -1)) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist', script), 'utf8'), browser, {filename: script});
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
  const png = fs.readFileSync(path.join(__dirname, '../dist/art/lantern-atlas.png'));
  const atlasWidth = png.readUInt32BE(16), atlasHeight = png.readUInt32BE(20), sources = [];
  browser.Image = class {
    complete = true; naturalWidth = atlasWidth;
    set src(value) {
      assert(['art/lantern-atlas.png', 'art/lantern-items.png', 'art/hero-walk.png', 'art/hero-side-rig.png', 'art/hero-direction-rig.png'].includes(value));
      const file = fs.readFileSync(path.join(__dirname, '../dist', value));
      this.source = value; this.naturalWidth = file.readUInt32BE(16); this.naturalHeight = file.readUInt32BE(20);
      this.onload();
    }
  };
  browser.document = {createElement: tag => {
    assert.equal(tag, 'canvas');
    const texture = {getContext: () => ({save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, drawImage(image, x, y, w, h) {
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
  // Shaped, evolved and bane gear are drawn as glyphs by the renderer until they get painted art.
  const glyphGear = kind => DungeonData.WEAPON_SHAPES.includes(kind) || DungeonData.EQUIPMENT[kind].shape || DungeonData.EQUIPMENT[kind].bane;
  const itemTypes = ['bread', 'potion', 'scroll', 'arrow', 'gold', ...Object.keys(DungeonData.EQUIPMENT).filter(kind => !glyphGear(kind)), 'lantern'];
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
assert.equal(typeof browser.createInventoryUI, 'function', 'Inventory UI loads before the game starts');
console.log('PASS: module loading parity, renderer state isolation, zoom/tap coordinates, artwork identity and item rendering.');
