// Echoes and shaped weapons in ordinary runs (no trial module loaded).
const assert = require('node:assert/strict');
require('../dist/engine.js');
const {DIRS, MONSTERS, WEAPON_SHAPES, ECHO_SOURCES, monsterStats} = DungeonData;
assert.equal(typeof globalThis.StrategyEngine, 'undefined', 'The trial is not loaded here');
function arena(weapon = null, echo = null, dungeon = 'tutorial') {
  const g = new DungeonEngine(64, dungeon, true), r = g.roomAt(g.player.x, g.player.y);
  g.tiles.fill(1); g.rooms[0] = {x:2, y:2, w:25, h:20, cx:14, cy:12};
  g.enemies = []; g.items = []; g.traps = []; g.monsterHouse = null; g.effects = [];
  Object.assign(g.player, {x:10, y:10, hp:60, maxHp:100, hunger:50, facing:[1,0], echo});
  if (weapon) g.player.equipment.weapon = {kind:'weapon', variant:weapon, rank:0, bonus:0, cursed:false, identified:true};
  g.stairs = {x:25, y:20}; g.reveal(); return g;
}
function enemy(g, species, x, y) {
  const e = {...monsterStats(species), hp:MONSTERS[species].hp, x, y, id:g.enemies.length, awake:true};
  g.enemies.push(e); g.reveal(); return e;
}
function replay(g) {
  const restored = DungeonEngine.restore(g.serialize()); assert(restored, 'Ordinary save restores');
  assert.equal(restored.serialize(), g.serialize()); return restored;
}
// Shaped weapons roll in both dungeons and keep identification and curses.
for (const dungeon of ['tutorial', 'depths']) {
  const seen = new Set();
  for (let seed = 1; seed <= 300; seed++) {
    const g = new DungeonEngine(seed, dungeon, true);
    for (const item of g.items) if (WEAPON_SHAPES.includes(item.variant)) { seen.add(item.variant); assert.equal(item.identified, false); }
  }
  assert.deepEqual([...seen].sort(), [...WEAPON_SHAPES].sort(), `${dungeon} generates every shaped weapon`);
}
// Each shape works on the ordinary engine.
{
  const spear = arena('lampSpear'), far = enemy(spear, 'moonPlant', 12, 10);
  assert(spear.move(1, 0)); assert.equal(spear.player.x, 10); assert(far.hp < far.maxHp);
  const axe = arena('sweepAxe'), sides = [[11, 9], [11, 10], [11, 11]].map(([x, y]) => enemy(axe, 'moonPlant', x, y));
  assert(axe.attack()); for (const e of sides) assert(e.hp < e.maxHp);
  const sickle = arena('hookSickle'), hooked = enemy(sickle, 'moonPlant', 12, 10);
  sickle.attack(); assert.equal(hooked.x, 11);
  const maul = arena('pushMaul'), pushed = enemy(maul, 'moonPlant', 11, 10); maul.traps.push({x:12, y:10, found:false});
  const hp = pushed.hp; maul.attack(); assert.equal(pushed.x, 13); assert(maul.traps[0].found, 'A pushed monster springs a trap');
  assert(hp - pushed.hp > maul.attackPower() + 2 - 1 - 4, 'Trap damage adds to the blow');
  const sword = arena(), side = enemy(sword, 'moonPlant', 11, 9); assert(sword.move(1, 0)); assert.equal(sword.player.x, 11); assert.equal(side.hp, side.maxHp);
  replay(maul);
}
// Echo shards drop at 15% with a pity on the fifth kill, never from guardians.
{
  let drops = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const g = arena(); g.rng = seed; let misses = 0;
    for (let k = 0; k < 5; k++) {
      const e = enemy(g, 'mossSlime', 11, 10); e.hp = 1; g.player.x = 10; g.player.y = 10; g.attack(); g.enemies = [];
      const shard = g.items.findIndex(i => i.kind === 'echoShard');
      if (shard >= 0) { drops++; misses = 0; g.items.splice(shard, 1); } else misses++;
      assert(misses < 5, 'The fifth kill is guaranteed');
    }
  }
  assert(drops > 200 && drops < 500, `Ordinary drop rate stays moderate (${drops}/1000)`);
  const boss = arena(); boss.player.echoPity = 4; const b = enemy(boss, 'starGuardian', 11, 10); b.hp = 1; boss.attack();
  assert(!boss.items.some(i => i.kind === 'echoShard'));
}
// Absorbing, effects and saves on the ordinary engine, including depths.
{
  const g = arena(null, null, 'depths'); g.items.push({x:11, y:10, kind:'echoShard', species:'cobaltBeetle', amount:1});
  const def = g.defense(); g.player.bag = Array(20).fill('bread');
  assert(g.move(1, 0)); assert.equal(g.player.echo, 'cobaltBeetle', 'A full bag never blocks an echo'); assert.equal(g.defense(), def + 4);
  replay(g);
  const wing = arena(null, 'caveBat'); assert(wing.move(1, 0)); assert.equal(wing.player.x, 12);
  const veil = arena(null, 'starMimic'); const sleeper = enemy(veil, 'mossSlime', 14, 10); sleeper.awake = false; veil.wait(); assert.equal(sleeper.awake, false);
  const legacy = JSON.parse(arena().serialize()); for (const k of ['echo', 'echoSteps', 'echoPity', 'lastStrike']) delete legacy.state.player[k];
  const old = DungeonEngine.restore(JSON.stringify(legacy)); assert(old); assert.equal(old.echo(), null, 'Older saves resume without an echo');
  const bad = JSON.parse(arena().serialize()); bad.state.player.echo = 'starGuardian'; assert.equal(DungeonEngine.restore(JSON.stringify(bad)), null);
  const badShard = JSON.parse(arena().serialize()); badShard.state.items.push({x:3, y:3, kind:'echoShard', species:'x', amount:1});
  assert.equal(DungeonEngine.restore(JSON.stringify(badShard)), null);
  assert.equal(Object.keys(ECHO_SOURCES).length, Object.values(MONSTERS).filter(m => m.type !== 'guardian').length);
}
console.log('PASS: ordinary runs roll all four shaped weapons, push monsters into traps, drop echoes at 15% with pity, absorb them with a full bag, and save/restore/reject echo state.');
