const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

require('./dist/engine.js');
const html = fs.readFileSync(path.join(__dirname, 'dist/index.html'), 'utf8');
const scripts = [...html.matchAll(/<script defer src="([^"]+)"/g)].map(match => match[1]);
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
console.log('PASS: HTML script order, standalone browser/CommonJS parity, saved-state round trips, renderer engine replacement/read-only state, desktop/mobile pointer coordinates and one animation loop.');
