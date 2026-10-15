const assert = require('node:assert/strict');
require('../dist/engine.js');
const createPolicy = require('../scripts/playtest-policy.cjs');
const { options, resumedSave } = require('../scripts/browser-playtest.cjs');
const policy = createPolicy(DungeonData);
const { W } = DungeonData;

assert.equal(options(['--seeds', '0,4294967295']).seeds.length, 2);
for (const args of [['--delay', '0'], ['--max-turns', 'NaN'], ['--seeds', '-1'], ['--seeds', '1,1'], ['--viewport', '390'], ['--dungeon', 'missing'], ['--unknown', 'x']])
  assert.throws(() => options(args));

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
o.enemies = [{ x: p.x + 1, y: p.y, hp: 4, species: 'mossSlime', intent: { x: p.x, y: p.y } }];
o.tiles.fill(1); o.traps = [];
assert.equal(policy.choose(o, {}).reason, 'dodge');
o.player.hp = 1;
assert.equal(policy.choose(o, {}).reason, 'heal');
o.player.hp = o.player.maxHp; o.player.hunger = 1;
assert.equal(policy.choose(o, {}).reason, 'eat');
o.player.hunger = 100; o.enemies = []; o.tiles.fill(null);
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
    else if (action.type === 'item') assert(action.action === 'equip-arrow' ? engine.equipArrow() : engine.use(action.index));
    else if (action.selector === '#stairs-button') assert(engine.descend());
    else assert(engine.shoot());
    assert.equal(engine.turn - turn, action.type === 'face' ? 0 : 1);
  }
  assert(actions > 20);
  return engine.serialize();
}
for (const seed of [101, 102, 103]) assert.equal(replay(seed), replay(seed));
console.log('PASS: playtest argument bounds, hidden-information isolation, survival/dodge choices, diagonal collision and deterministic action replay (3 seeds).');
