const assert = require('node:assert/strict');
require('../dist/engine.js');
const createPolicy = require('../scripts/playtest-policy.cjs');
const { options, resumedSave } = require('../scripts/browser-playtest.cjs');
const { fixtures } = require('../scripts/playtest-scenarios.cjs');
const policy = createPolicy(DungeonData);
const { W } = DungeonData;

assert.equal(options(['--seeds', '0,4294967295']).seeds.length, 2);
for (const args of [['--delay', '0'], ['--max-turns', 'NaN'], ['--seeds', '-1'], ['--seeds', '1,1'], ['--viewport', '390'], ['--dungeon', 'missing'], ['--scenarios', 'missing'], ['--unknown', 'x']])
  assert.throws(() => options(args));
assert.equal(options(['--scenarios', 'only']).scenarios, 'only');

// Unknown terrain, offscreen enemies, hidden traps, RNG and unidentified effects cannot inform decisions.
const game = new DungeonEngine(101, 'depths', true);
const raw = JSON.parse(game.serialize()).state;
raw.player.bag.push({ kind: 'weapon', rank: 1, bonus: 4, cursed: true, identified: false });
const hidden = structuredClone(raw), unseen = hidden.seen.findIndex(v => !v);
hidden.tiles[unseen] = hidden.tiles[unseen] ? 0 : 1;
hidden.enemies.push({ x: unseen % W, y: Math.floor(unseen / W), hp: 99, species: 'mossSlime' });
hidden.traps.push({ x: raw.player.x, y: raw.player.y, found: false });
hidden.rng = 42;
hidden.player.bag.at(-1).bonus = -8;
hidden.player.bag.at(-1).cursed = false;
assert.deepEqual(policy.observe(raw), policy.observe(hidden));
assert.deepEqual(policy.choose(policy.observe(raw), {}), policy.choose(policy.observe(hidden), {}));
assert(!policy.observe(raw).player.bag.some(i => ['scroll', 'map', 'identify', 'uncurse'].includes(i.kind)));
const saved = JSON.parse(game.serialize()), resumed = resumedSave(saved);
assert.equal(resumed.state.log.length, saved.state.log.length + 1);
assert.deepEqual(resumed.state.player, saved.state.player);
assert.deepEqual(resumedSave({ state: { status: 'dead' } }), { state: { status: 'dead' } });
const arrows = structuredClone(raw);
arrows.player.bag.push(...Array(50).fill('arrow'));
assert.equal(policy.observe(arrows).inventoryCount, policy.observe(raw).inventoryCount + 1, 'Arrows occupy one slot');
const disguised = structuredClone(raw);
const species = Object.keys(DungeonData.MONSTERS).find(k => DungeonData.MONSTERS[k].trait === 'mimic');
disguised.enemies = [{ ...raw.player, species, hp: 20, revealed: false }];
assert.equal(policy.observe(disguised).enemies.length, 0);
assert(policy.observe(disguised).items.some(i => i.kind === 'gold' && i.x === raw.player.x && i.y === raw.player.y));
disguised.traps = [{ x: raw.player.x, y: raw.player.y, found: true }];
assert.equal(policy.observe(disguised).traps.length, 1);

const o = policy.observe(raw), p = o.player;
o.enemies = [{ x: p.x + 1, y: p.y, hp: 34, species: 'stoneGolem', intent: { x: p.x, y: p.y } }];
o.tiles.fill(1); o.traps = [];
assert.equal(policy.choose(o, {}).reason, 'dodge');
o.player.hp = 1;
assert.equal(policy.choose(o, {}).reason, 'heal');
o.player.hp = o.player.maxHp; o.player.hunger = 1;
assert.equal(policy.choose(o, {}).reason, 'eat');
o.player.hunger = 100; o.player.bag = []; o.enemies = []; o.tiles.fill(null);
o.tiles[p.y * W + p.x] = 1;
assert.equal(policy.choose(o, {}).reason, 'no-known-route');
o.tiles[p.y * W + p.x + 1] = 1;
o.tiles[(p.y + 1) * W + p.x + 1] = 1;
assert.equal(policy.canStep(o, p.x, p.y, 1, 1), false);

// Same seeds and policy must yield identical game saves, independent of rendering and wall time.
function replay(seed) {
  const engine = new DungeonEngine(seed), memory = {};
  let actions = 0;
  for (; actions < 300 && engine.status === 'playing'; actions++) {
    const observed = policy.observe(JSON.parse(engine.serialize()).state);
    const action = policy.choose(observed, memory);
    if (action.type === 'stop') break;
    const turn = engine.turn;
    if (action.type === 'move') {
      assert(policy.canStep(observed, engine.player.x, engine.player.y, action.dx, action.dy));
      assert(engine.move(action.dx, action.dy));
    } else if (action.type === 'face') assert(engine.face(action.dx, action.dy));
    else if (action.type === 'item') assert(action.action === 'equip-arrow' ? engine.equipArrow()
      : action.action === 'equip-ground' ? engine.equip('ground') : engine.use(action.index, action.target));
    else if (action.selector === '#stairs-button') assert(engine.descend());
    else if (action.selector === '#wait-button') assert(engine.wait());
    else assert(engine.shoot());
    assert.equal(engine.turn - turn, action.type === 'face' ? 0 : 1);
  }
  assert(actions > 20);
  return engine.serialize();
}
for (const seed of [101, 102, 103]) assert.equal(replay(seed), replay(seed));

const cases = fixtures();
assert.equal(cases.length, 8);
const identified = DungeonEngine.restore(JSON.stringify(cases.find(c => c.name === 'identify-cancel-equip').save));
let action = policy.choose(policy.observe(JSON.parse(identified.serialize()).state), {});
assert.deepEqual(action, { type: 'item', index: 0, action: 'use', reason: 'identify-gear', target: 1 });
assert(identified.use(action.index, action.target));
action = policy.choose(policy.observe(JSON.parse(identified.serialize()).state), {});
assert.equal(action.reason, 'equip-known'); assert.equal(action.index, 0, 'Use the post-consumption bag index');
const cursed = cases.find(c => c.name === 'curse-uncurse-equip').save.state;
assert.equal(policy.choose(policy.observe(cursed), {}).reason, 'uncurse');
const ground = cases.find(c => c.name === 'full-capacity-potion').save.state;
assert.equal(policy.choose(policy.observe(ground), {}).index, 'ground');
const lastFloor = cases.find(c => c.name === 'victory-depths-unlock').save.state;
assert.notEqual(policy.choose(policy.observe(lastFloor), {}).reason, 'descend');

// A visible stationary shooter around a blocked diagonal needs a flank and an attack opening.
const corner = new DungeonEngine(901), memory = {};
corner.tiles.fill(0); corner.items = []; corner.traps = []; corner.monsterHouse = null;
for (let y = 13; y <= 17; y++) for (let x = 18; x <= 22; x++) corner.tiles[y * W + x] = 1;
corner.tiles[15 * W + 21] = 0;
Object.assign(corner.player, { x: 20, y: 15, bag: [] });
const shooter = { ...DungeonData.monsterStats('thornPlant'), id: 1, hp: DungeonData.MONSTERS.thornPlant.hp,
  x: 21, y: 14, awake: true, intent: { x: 20, y: 15, kind: 'ranged' } };
corner.enemies = [shooter]; corner.seen.fill(true); corner.reveal();
assert(corner.visible[shooter.y * W + shooter.x]);
assert.equal(policy.canStep(policy.observe(JSON.parse(corner.serialize()).state), 20, 15, 1, -1), false);
for (let i = 0; i < 24 && shooter.hp > 0; i++) {
  const action = policy.choose(policy.observe(JSON.parse(corner.serialize()).state), memory);
  assert.equal(action.type, 'move');
  assert(corner.move(action.dx, action.dy));
}
assert(shooter.hp <= 0, 'Avoiding telegraphs must lead to an attack, not endless retreat and re-entry');
assert(corner.player.hp > 0);

// In a one-tile corridor, lure a slow windup enemy instead of walking back into its next warning.
const corridor = new DungeonEngine(902), corridorMemory = {};
corridor.tiles.fill(0); corridor.items = []; corridor.traps = []; corridor.monsterHouse = null;
for (let x = 18; x <= 24; x++) corridor.tiles[15 * W + x] = 1;
Object.assign(corridor.player, { x: 21, y: 15, bag: [], level: 7, hp: 66, maxHp: 66 });
const golem = { ...DungeonData.monsterStats('stoneGolem'), id: 1, hp: DungeonData.MONSTERS.stoneGolem.hp,
  x: 20, y: 15, awake: true, intent: { x: 21, y: 15, kind: 'windup' } };
corridor.enemies = [golem]; corridor.seen.fill(true); corridor.reveal();
const corridorReasons = [];
for (let i = 0; i < 24 && golem.hp > 0; i++) {
  const action = policy.choose(policy.observe(JSON.parse(corridor.serialize()).state), corridorMemory);
  corridorReasons.push(action.reason);
  assert(action.type === 'move' ? corridor.move(action.dx, action.dy) : action.selector === '#wait-button' && corridor.wait());
}
assert(golem.hp <= 0); assert(corridorReasons.includes('lure-counter'));

// A stationary corridor shooter permits one bounded exchange, never the same choice at low HP.
Object.assign(corridor.player, { x: 21, y: 15, level: 1, hp: 30, maxHp: 30 }); corridor.turn = 0;
const cannon = { ...DungeonData.monsterStats('thornPlant'), id: 2, hp: DungeonData.MONSTERS.thornPlant.hp,
  x: 20, y: 15, awake: true, intent: { x: 21, y: 15, kind: 'ranged' } };
corridor.enemies = [cannon]; corridor.reveal();
const exchangeHit = policy.choose(policy.observe(JSON.parse(corridor.serialize()).state), {});
assert.equal(exchangeHit.reason, 'trade-hit'); assert(corridor.move(exchangeHit.dx, exchangeHit.dy));
assert(30 - corridor.player.hp <= exchangeHit.maxIncomingDamage);
corridor.player.hp = 1; cannon.intent = { x: 21, y: 15, kind: 'ranged' };
assert.equal(policy.choose(policy.observe(JSON.parse(corridor.serialize()).state), {}).reason, 'dodge');

const treasure = DungeonEngine.restore(JSON.stringify(cases.find(c => c.name === 'victory-depths-unlock').save));
const landing = DungeonData.DIRS.find(([dx, dy]) => treasure.canStep(treasure.stairs.x, treasure.stairs.y, dx, dy));
treasure.enemies = []; treasure.player.x += landing[0]; treasure.player.y += landing[1];
treasure.seen.fill(true); treasure.reveal(); treasure.say(`${treasure.dungeonInfo().guardian}を倒した。経験値 +30`, 'good');
const returnToTreasure = policy.choose(policy.observe(JSON.parse(treasure.serialize()).state), {});
assert.equal(returnToTreasure.type, 'move'); assert(treasure.move(returnToTreasure.dx, returnToTreasure.dy));
assert.equal(treasure.status, 'won', 'A public guardian defeat must allow routing back to the final treasure');
console.log('PASS: playtest privacy, weighted flanking/attack openings, appraisal/equipment, ground use, final-floor routing, deterministic replay and 8 restorable conditional fixtures.');
