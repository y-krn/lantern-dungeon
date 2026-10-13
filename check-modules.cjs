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
// Inventory display sorting must preserve the indices used by item actions.
{
  const engine = new DungeonEngine(42);
  engine.enemies = [];engine.items = [];engine.traps = [];engine.monsterHouse = null;
  const known = {kind:'weapon',variant:'starSword',rank:3,bonus:2,cursed:false,identified:true};
  const unknown = {kind:'shield',variant:'mirrorShield',rank:0,bonus:-2,cursed:true,identified:false};
  engine.player.bag = ['bread', known, unknown, 'arrow', 'potion', 'arrow'];
  const source = fs.readFileSync(path.join(__dirname,'dist/game.js'),'utf8');
  let markup, buttons, rows;
  const ui = vm.createContext({engine, ...DungeonData, portraitUI:false,
    modalHeader: () => '', closeModal() {}, act: action => action(),
    openModal: (kind, html) => {
      markup = html;
      buttons = [...html.matchAll(/<button[^>]*data-(drop|exchange)="(\d+)"[^>]*>/g)].map(match => ({
        type: match[1], dataset: {[match[1]]: match[2]},
        addEventListener(event, listener) {this.click = listener;},
      }));
      rows = [...html.matchAll(/<details class="bag-entry">/g)].map(() => ({open: false}));
      rows.forEach(row => {
        row.querySelector = () => ({addEventListener(event, listener) {row.activate = () => {listener();row.open = !row.open;};}});
      });
    },
    $: () => ({querySelectorAll: selector => selector === '.bag-entry' ? rows : buttons.filter(button => selector === `[data-${button.type}]`)}),
  });
  vm.runInContext(source.slice(source.indexOf('  const escapeHTML'),source.indexOf('  function showIdentify')),ui);
  const raw = engine.serialize();vm.runInContext('showBag()',ui);assert.equal(engine.serialize(),raw);
  assert.equal(rows.length, 7);
  rows[2].activate();assert.equal(rows.filter(row => row.open).length, 1);
  rows[3].activate();assert.equal(rows[2].open, false);assert.equal(rows[3].open, true);
  rows[3].activate();assert.equal(rows.filter(row => row.open).length, 0);
  assert.equal(engine.serialize(), raw, 'Browsing and changing the expanded item cannot advance time or mutate inventory');
  const names = [...markup.matchAll(/<summary>[\s\S]*?<strong>([^<]+)<\/strong>/g)].map(match => match[1]);
  assert.deepEqual(names.slice(2),['木の矢 × 2','鏡の盾（未鑑定）','焼きたてパン','回復草','星鉄の剣 +2']);
  assert.equal(buttons.filter(button => button.type === 'drop').length,5);
  buttons.find(button => button.type === 'drop' && button.dataset.drop === '0').click();
  assert.equal(engine.items[0].kind,'bread');assert.equal(engine.turn,1);
  vm.runInContext('showBag()',ui);assert(markup.includes('足元：焼きたてパン'));
  assert.equal(buttons.filter(button => button.type === 'exchange').length,4);
  buttons.find(button => button.type === 'exchange' && button.dataset.exchange === '1').click();
  assert.equal(engine.items[0].variant,'mirrorShield');assert.equal(engine.items[0].identified,false);
  assert.equal(engine.player.bag.at(-1),'bread');assert.equal(engine.turn,2);
  assert(!engine.player.bag.includes(unknown));
}
console.log('PASS: module parity, renderer, inventory display order/original indices and drop/exchange UI handlers.');
