const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
require('../dist/engine.js');

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
vm.runInContext(fs.readFileSync(require.resolve('../dist/sprites.js'), 'utf8'), browser);
vm.runInContext(fs.readFileSync(require.resolve('../dist/renderer.js'), 'utf8'), browser);
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

function arrowScene(dx, dy, distance = 3, hp = 80) {
  const shot = arena(hp);
  shot.player.facing = [dx, dy]; shot.player.bag.push('arrow'); shot.player.ammo = 'arrow';
  shot.enemies[0].x = shot.player.x + dx * distance;
  shot.enemies[0].y = shot.player.y + dy * distance;
  shot.reveal(); shot.shoot();
  return shot;
}
function playback(shot, reduced = false) {
  let time = 0, origin;
  const callbacks = [], arrows = [], impacts = [];
  const paint = new Proxy({}, {get: (_, key) => key === 'createRadialGradient' ? () => gradient : (...args) => {
    assert(args.filter(value => typeof value === 'number').every(Number.isFinite), `Invalid arrow ${key}`);
    if (key === 'translate') origin = args;
    if (key === 'moveTo' && Math.abs(args[0] + 96 * .65) < .001 && args[1] === 0) arrows.push(origin);
  }, set: () => true});
  const surface = {...canvas, getContext: () => paint};
  const env = vm.createContext({DungeonData, performance: {now: () => time}, requestAnimationFrame: cb => callbacks.push(cb)});
  vm.runInContext(fs.readFileSync(require.resolve('../dist/sprites.js'), 'utf8'), env);
  vm.runInContext(fs.readFileSync(require.resolve('../dist/renderer.js'), 'utf8'), env);
  const view = env.createDungeonRenderer({canvas: surface, minimap: surface, viewport: surface, getEngine: () => shot, reduced});
  view.resize(); view.start(); view.playEffects(shot.effects, event => impacts.push(event.type));
  const state = shot.serialize();
  return {view, impacts, draw(at) {
    time = at; arrows.length = 0; callbacks.shift()(at);
    assert.equal(shot.serialize(), state, 'Arrow drawing cannot mutate gameplay or saves');
    return arrows.map(point => point.slice());
  }};
}
for (const [dx, dy] of DungeonData.DIRS) {
  const shot = arrowScene(dx, dy), flight = playback(shot);
  assert.equal(shot.turn, 1); assert.equal(shot.arrowCount(), 0);
  const first = flight.draw(60), later = flight.draw(150);
  assert.equal(first.length, 1); assert.equal(later.length, 1);
  assert.equal(Math.sign(later[0][0] - first[0][0]), dx, 'Arrow follows horizontal facing');
  assert.equal(Math.sign(later[0][1] - first[0][1]), dy, 'Arrow follows vertical facing');
  assert(!flight.impacts.includes('hit'), 'Damage feedback waits for arrival');
  flight.draw(206); assert(flight.impacts.includes('hit'));
  assert.equal(flight.draw(316).length, 0); assert.equal(flight.view.remaining(), 0);
}
for (const distance of [0, 3, 10]) {
  const shot = arena(); shot.enemies = [];
  shot.player.bag.push('arrow'); shot.player.ammo = 'arrow';
  if (distance < 10) shot.tiles[shot.key(16 + distance, 10)] = 0;
  shot.shoot();
  const flight = playback(shot);
  assert.equal(flight.draw(70).length, 1, 'Misses, adjacent walls and maximum range still animate');
  flight.draw(600); assert.equal(flight.view.remaining(), 0);
}
const retaliation = playback(arrowScene(1, 0, 1));
retaliation.draw(139); assert(!retaliation.impacts.includes('hit'));
retaliation.draw(141); assert(retaliation.impacts.includes('hit')); assert(!retaliation.impacts.includes('damage'));
retaliation.draw(251); assert(retaliation.impacts.includes('damage'), 'Counterattack follows arrow arrival');
const arrowDeath = playback(arrowScene(1, 0, 3, 1));
arrowDeath.draw(150); assert(!arrowDeath.impacts.includes('kill'));
arrowDeath.draw(206); assert(arrowDeath.impacts.includes('kill'), 'Defeat feedback follows arrow arrival');
const cancelled = playback(arrowScene(1, 0));
cancelled.view.reset(); assert.equal(cancelled.draw(100).length, 0); assert.equal(cancelled.impacts.length, 0);
const unseen = arrowScene(1, 0); unseen.visible.fill(false);
assert.equal(playback(unseen).draw(100).length, 0, 'Arrows cannot reveal unlit tiles');
const still = playback(arrowScene(1, 0), true);
assert.equal(still.view.remaining(), 0); assert.equal(still.draw(0).length, 0); assert(still.impacts.includes('hit'));
console.log('PASS: combat snapshots, save parity, melee, eight-direction arrow flight, misses/walls/range, ordered impacts, defeat, cancellation and reduced motion.');
