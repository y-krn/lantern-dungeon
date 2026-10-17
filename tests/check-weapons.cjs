const assert = require('node:assert/strict');
require('../dist/engine.js');
const StrategyEngine = require('../dist/strategy.js');
function arena(kit, echo = null) {
  const g = new StrategyEngine(57); assert(g.chooseKit(kit));
  g.tiles.fill(1); g.rooms[0] = {x:2, y:2, w:25, h:20, cx:14, cy:12};
  g.enemies = []; g.items = []; g.traps = []; g.monsterHouse = null; g.effects = [];
  Object.assign(g.player, {x:10, y:10, hp:100, maxHp:100, facing:[1,0], echo});
  g.stairs = {x:25, y:20}; g.reveal(); return g;
}
// Tough test dummies by default; real stats when the save must validate.
function enemy(g, species, x, y, real = false) {
  const stats = DungeonData.monsterStats(species);
  const e = {...stats, ...(real ? {hp:stats.maxHp} : {hp:99, maxHp:99}), x, y, id:g.enemies.length, awake:true};
  g.enemies.push(e); g.reveal(); return e;
}
function replay(g) {
  const restored = StrategyEngine.restore(g.serialize()); assert(restored);
  assert.equal(restored.serialize(), g.serialize()); return restored;
}
for (const kind of Object.keys(StrategyEngine.GEAR)) {
  const g = new StrategyEngine(57); assert(g.chooseKit(kind));
  assert.equal(g.player.equipment.weapon.variant, kind); replay(g);
}
// Axe: front and both front diagonals in one turn; direction input sweeps too; not behind.
for (const [dx, dy] of DungeonData.DIRS) {
  const g = arena('sweepAxe'); g.player.facing = [dx, dy];
  const i = DungeonData.DIRS.findIndex(d => d[0] === dx && d[1] === dy);
  const hit = [7, 0, 1].map(o => DungeonData.DIRS[(i + o) % 8]).map(([x, y]) => enemy(g, 'mossSlime', 10 + x, 10 + y));
  const [bx, by] = DungeonData.DIRS[(i + 4) % 8], behind = enemy(g, 'mossSlime', 10 + bx, 10 + by);
  const turn = g.turn; assert(g.attack()); assert.equal(g.turn, turn + 1);
  for (const e of hit) assert(e.hp < 99, 'Axe hits all three front cells');
  assert.equal(behind.hp, 99, 'Axe never hits behind');
}
{
  const g = arena('sweepAxe'), side = enemy(g, 'mossSlime', 11, 9), front = enemy(g, 'mossSlime', 11, 10);
  assert(g.move(1, 0)); assert.equal(g.player.x, 10); assert(side.hp < 99 && front.hp < 99, 'Bumping an enemy sweeps');
  const empty = arena('sweepAxe'); enemy(empty, 'mossSlime', 11, 9); assert(empty.move(1, 0)); assert.equal(empty.player.x, 11, 'No enemy ahead means a step');
  const corner = arena('sweepAxe'); corner.tiles[corner.key(10, 9)] = 0; const hidden = enemy(corner, 'mossSlime', 11, 9);
  corner.attack(); assert.equal(hidden.hp, 99, 'Axe respects blocked corners');
}
// Sickle: reaches two cells, pulls a distant target one step, not through walls.
{
  const g = arena('hookSickle'), e = enemy(g, 'ironBeetle', 12, 10);
  assert(g.move(1, 0)); assert.equal(g.player.x, 10); assert(e.hp < 99); assert.equal(e.x, 11, 'Sickle pulls a target two cells away');
  const near = arena('hookSickle'), n = enemy(near, 'ironBeetle', 11, 10); near.attack(); assert.equal(n.x, 11);
  const wall = arena('hookSickle'); wall.tiles[wall.key(11, 10)] = 0; const w = enemy(wall, 'ironBeetle', 12, 10);
  wall.attack(); assert.equal(w.hp, 99);
  const vine = arena('hookSickle'), v = enemy(vine, 'cobaltBeetle', 12, 10, true); vine.strategy.vines.push({x:11, y:10});
  vine.attack(); assert.equal(v.x, 11); assert(v.hp < v.maxHp); assert(!vine.strategy.vines.length, 'Pulled enemies trigger vines');
  replay(vine);
}
// Maul: pushes two cells, collisions hurt both sides, traps fire along the way.
{
  const g = arena('pushMaul'), e = enemy(g, 'thornPlant', 11, 10);
  assert(g.move(1, 0)); assert.equal(g.player.x, 10); assert.equal(e.x, 13, 'Maul pushes two cells');
  const wall = arena('pushMaul'); wall.tiles[wall.key(12, 10)] = 0; const w = enemy(wall, 'mossSlime', 11, 10);
  const free = arena('pushMaul'), f = enemy(free, 'mossSlime', 11, 10);
  wall.attack(); free.attack(); assert.equal(w.x, 11); assert.equal(f.hp - w.hp, 3, 'Wall collision deals 3');
  const pair = arena('pushMaul'), a = enemy(pair, 'thornPlant', 11, 10), b = enemy(pair, 'thornPlant', 13, 10);
  pair.attack(); assert.equal(a.x, 12); assert.equal(b.hp, 96, 'The struck neighbour also takes 3');
  const trap = arena('pushMaul'), t = enemy(trap, 'mossSlime', 11, 10); trap.traps.push({x:12, y:10, found:false});
  trap.attack(); assert(trap.traps[0].found); assert(t.hp < f.hp + 3);
  const might = arena('pushMaul', 'stoneGolem'), m = enemy(might, 'thornPlant', 11, 10);
  might.attack(); assert.equal(m.x, 14, 'Might adds one cell to the maul push');
  const saved = arena('pushMaul'), s = enemy(saved, 'moonPlant', 11, 10, true);
  saved.attack(); assert.equal(s.x, 13); replay(saved);
}
// Floors 2-4 each place one identified attack shape.
{
  for (let seed = 1; seed <= 10; seed++) {
    const g = new StrategyEngine(seed); g.chooseKit('none');
    for (const [floor, kind] of [[2, 'sweepAxe'], [3, 'hookSickle'], [4, 'pushMaul']]) {
      g.floor = floor; g.generateFloor();
      const item = g.items.find(i => i.kind === 'weapon' && i.variant === kind);
      assert(item && item.identified && !item.cursed && item.bonus === 0, `Floor ${floor} offers ${kind} (seed ${seed})`);
    }
    replay(g);
  }
}
console.log('PASS: axe sweeps three front cells, sickle reaches and pulls, maul pushes with collisions and traps, all kits selectable and floors 2-4 offer each shape.');
