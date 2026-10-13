const assert = require('node:assert/strict');
require('./dist/engine.js');

function arena(kind, amount = 1) {
  const game = new DungeonEngine(42), p = game.player;
  const room = game.roomAt(p.x, p.y);
  p.x = room.cx; p.y = room.cy; p.facing = [1, 0];
  p.bag = Array(18).fill('bread'); p.hp = 1; p.hunger = 20;
  game.enemies = []; game.traps = []; game.monsterHouse = null;
  game.items = [{kind, amount, x: p.x, y: p.y}];
  game.reveal();
  return game;
}

// Ground use shares inventory effects, but never inserts/removes a bag item.
for (const kind of ['bread', 'potion', 'scroll', 'map', 'identify', 'uncurse', 'arrow']) {
  const ground = arena(kind), bag = arena(kind);
  ground.identification.known = []; bag.identification.known = [];
  const target = kind === 'identify' ? 'weapon' : undefined;
  for (const game of [ground, bag]) {
    game.player.equipment.weapon.cursed = true;
    game.enemies = [{x: game.player.x + 1, y: game.player.y, id: 1,
      ...DungeonData.monsterStats('mossSlime'), hp: DungeonData.MONSTERS.mossSlime.hp, awake: true}];
    game.reveal();
  }
  const before = structuredClone(ground.player.bag);
  bag.items = []; bag.player.bag.push(kind);
  assert.equal(ground.inventoryCount(), 20);
  assert.equal(ground.scrollNeedsTarget('ground'), kind === 'identify');
  assert(ground.useGround(target)); assert(bag.use(18, target));
  assert.equal(ground.turn, 1); assert.equal(ground.items.length, 0);
  assert.deepEqual(ground.player.bag, before); assert.equal(ground.inventoryCount(), 20);
  assert.deepEqual(ground.player, bag.player);
  assert.deepEqual(ground.enemies, bag.enemies);
  assert.deepEqual(ground.identification, bag.identification);
  assert.deepEqual(ground.effects, bag.effects);
  assert.deepEqual(ground.seen, bag.seen);
  const saved = ground.serialize();
  assert.equal(DungeonEngine.restore(saved).serialize(), saved);
}

// A floor arrow stack loses exactly one arrow and preserves equipped bag ammo.
{
  const game = arena('arrow', 27), p = game.player;
  p.bag = [...Array(17).fill('bread'), 'arrow', 'arrow']; p.ammo = 'arrow';
  const before = [...p.bag];
  assert(game.useGround()); assert.equal(game.items[0].amount, 26);
  assert.deepEqual(p.bag, before); assert.equal(p.ammo, 'arrow');
  const restored = DungeonEngine.restore(game.serialize());
  assert.equal(restored.items[0].amount, 26);
  restored.items[0].amount = 1;
  assert(restored.useGround()); assert.equal(restored.items.length, 0);
  assert.equal(restored.arrowCount(), 2); assert.equal(restored.player.ammo, 'arrow');
}

// Target selection/cancellation, unavailable items and invalid input cost nothing.
{
  const game = arena('identify'); game.identification.known = [];
  const before = game.serialize();
  for (const target of [undefined, -1, 999, 'missing']) {
    assert.equal(game.useGround(target), false); assert.equal(game.serialize(), before);
  }
  assert(game.useGround(0)); assert.equal(game.player.bag.length, 18);
}
for (const setup of [
  game => { game.items = []; },
  game => { game.items[0].x++; },
  game => { game.items[0].kind = 'gold'; },
  game => { game.items[0].kind = 'missing'; },
  game => { game.items[0] = {...game.player.equipment.weapon, x: game.player.x, y: game.player.y}; },
  game => { game.items[0] = {...game.player.equipment.shield, x: game.player.x, y: game.player.y}; },
  game => { game.status = 'dead'; },
  game => { game.status = 'won'; },
]) {
  const game = arena('bread'); setup(game);
  const before = game.serialize();
  assert.equal(game.useGround(), false); assert.equal(game.serialize(), before);
}
{
  const game = arena('bread');
  game.player.x = game.stairs.x; game.player.y = game.stairs.y;
  Object.assign(game.items[0], game.stairs);
  assert(game.useGround()); assert.equal(game.turn, 1);
}
console.log('PASS: ground consumables at 20/20, effect/turn parity, appraisal, arrow stacks/ammo, invalid actions and save round-trip.');
