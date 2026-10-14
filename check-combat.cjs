const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
require('./dist/engine.js');

function arena(hp = 80) {
  const game = new DungeonEngine(73);
  game.tiles.fill(1); game.items = []; game.traps = []; game.monsterHouse = null;
  game.player.x = 15; game.player.y = 10; game.player.facing = [1, 0];
  game.player.hp = game.player.maxHp = 100; game.effects = [];
  game.enemies = [{...DungeonData.monsterStats('mossSlime'), id: 1, x: 16, y: 10, hp, maxHp: hp, awake: true}];
  game.reveal();
  return game;
}
// Visual metadata cannot change RNG, damage, turn costs, inventory or saved state.
for (const action of [game => game.attack(), game => game.move(1, 0), game => game.wait(), game => {
  game.player.bag.push('arrow'); game.use(game.player.bag.length - 1);
}]) {
  const animated = arena(), control = arena();
  control.attackVisual = () => undefined;
  action(animated); action(control);
  assert.equal(animated.serialize(), control.serialize());
}
const game = arena(); game.attack();
const hit = game.effects.find(event => event.type === 'hit');
const damage = game.effects.find(event => event.type === 'damage');
assert.equal(hit.attack.source.id, 'player'); assert.equal(hit.attack.target.id, 1);
assert.equal(damage.attack.source.id, 1); assert.equal(damage.attack.target.id, 'player');
const killed = arena(1); killed.attack();
assert.equal(killed.enemies.length, 0);
const killedHit = killed.effects.find(event => event.type === 'hit');
assert.equal(killedHit.attack.target.type, 'slime'); assert(killedHit.attack.target.hp <= 0);
const miss = arena(); miss.enemies = []; miss.attack();
assert.equal(miss.effects.find(event => event.type === 'swing').attack.target.x, 16);
const hunger = arena(); hunger.enemies = []; hunger.player.hunger = 0; hunger.wait();
assert(!hunger.effects.find(event => event.type === 'damage').attack, 'Hunger must not invent an attacker');
const dodged = arena();
dodged.enemies[0].intent = {x: dodged.player.x, y: dodged.player.y + 1, kind: 'windup'};
dodged.wait();
assert.equal(dodged.effects.find(event => event.type === 'swing').attack.source.id, 1);
assert.equal(dodged.player.hp, 100, 'Animating a dodged attack must not deal damage');

let now = 1000;
const frames = [], translations = [], arcs = [], notices = [];
const gradient = {addColorStop() {}};
const context = new Proxy({}, {
  get: (_, key) => key === 'createRadialGradient' ? () => gradient : (...args) => {
    assert(args.filter(value => typeof value === 'number').every(Number.isFinite), `Invalid ${key}`);
    if (key === 'translate') translations.push(args);
    if (key === 'arc') arcs.push(args);
  }, set: () => true,
});
const canvas = {width: 880, height: 576, getContext: () => context,
  getBoundingClientRect: () => ({left: 0, top: 0, width: 390, height: 350})};
const browser = vm.createContext({DungeonData, performance: {now: () => now},
  requestAnimationFrame: callback => frames.push(callback)});
vm.runInContext(fs.readFileSync('./dist/renderer.js', 'utf8'), browser);
const renderer = browser.createDungeonRenderer({canvas, minimap: canvas, viewport: canvas, getEngine: () => game});
renderer.resize(); renderer.start();
renderer.playEffects(game.effects, event => notices.push(event.type));
const saved = game.serialize();
function draw(at) { now = at; translations.length = 0; arcs.length = 0; frames.shift()(now); assert.equal(game.serialize(), saved); }
draw(1000); assert.equal(notices.length, 0);
const resting = translations.map(pair => pair.slice());
draw(1050); assert(translations.some((pair, i) => pair[0] !== resting[i]?.[0]), 'Attacker visibly lunges');
assert(arcs.length > 0, 'The swing draws an arc');
draw(1071); assert.deepEqual(notices, ['hit']);
draw(1211); assert.deepEqual(notices, ['hit', 'damage']);
draw(1500); assert.equal(renderer.remaining(), 0);
renderer.playEffects(game.effects, event => notices.push(event.type)); renderer.reset();
draw(1800); assert.deepEqual(notices, ['hit', 'damage'], 'Reset cancels old impacts and callbacks');

// A defeated enemy remains drawable through impact and then disappears.
const deadFrames = [];
const death = browser.createDungeonRenderer({canvas, minimap: canvas, viewport: canvas, getEngine: () => killed});
death.resize(); death.start(); death.playEffects(killed.effects);
function deathDraw(at) {now = at; translations.length = 0; frames.pop()(at); deadFrames.push(translations.length);}
deathDraw(1800); deathDraw(1890); deathDraw(2100);
assert(deadFrames[0] > deadFrames[2] && deadFrames[1] > deadFrames[2], 'Defeated sprite persists through impact');

const reducedNotices = [];
const reduced = browser.createDungeonRenderer({canvas, minimap: canvas, viewport: canvas, getEngine: () => game, reduced: true});
reduced.playEffects(game.effects, event => reducedNotices.push(event.type));
assert.equal(reduced.remaining(), 0); reduced.start(); frames.pop()(now);
assert.deepEqual(reducedNotices, ['hit', 'damage'], 'Reduced motion has immediate impacts without blocking input');
const pack = arena();
pack.enemies = DungeonData.DIRS.map(([dx,dy],i) => ({...pack.enemies[0],id:i+1,x:15+dx,y:10+dy}));
pack.attack();
const crowd = browser.createDungeonRenderer({canvas, minimap: canvas, viewport: canvas, getEngine: () => pack});
crowd.playEffects(pack.effects);
assert(crowd.remaining() <= 410, 'Eight attackers must not create a long sequential wait');
console.log('PASS: combat visual snapshots, gameplay/save parity, ordered impacts, lunge/slash, defeated sprite, cancellation and reduced motion.');
