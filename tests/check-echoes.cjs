const assert = require('node:assert/strict');
require('../dist/engine.js');
const StrategyEngine = require('../dist/strategy.js');
function arena(echo = null) {
  const g = new StrategyEngine(91); g.chooseKit('none');
  g.tiles.fill(1); g.rooms[0] = {x:2, y:2, w:25, h:20, cx:14, cy:12}; g.rooms = g.rooms.slice(0, 4);
  for (let i = 1; i < 4; i++) g.rooms[i] = {x:40, y:i * 5, w:2, h:2, cx:41, cy:i * 5 + 1};
  g.enemies = []; g.items = []; g.traps = []; g.monsterHouse = null; g.effects = [];
  Object.assign(g.player, {x:10, y:10, hp:60, maxHp:100, hunger:50, facing:[1,0], echo});
  g.stairs = {x:25, y:20}; g.reveal(); return g;
}
function enemy(g, species, x, y, extra = {}) {
  const e = {...DungeonData.monsterStats(species), hp:DungeonData.MONSTERS[species].hp, x, y, id:g.enemies.length, awake:true, ...extra};
  g.enemies.push(e); g.reveal(); return e;
}
function replay(g) {
  const restored = StrategyEngine.restore(g.serialize()); assert(restored, 'Valid echo save must restore');
  assert.equal(restored.serialize(), g.serialize()); return restored;
}
// Every non-guardian monster lends one echo, and every echo has a source.
{
  const {ECHOES, ECHO_SOURCES} = StrategyEngine;
  for (const [species, m] of Object.entries(DungeonData.MONSTERS))
    assert.equal(Object.hasOwn(ECHO_SOURCES, species), m.type !== 'guardian', species);
  assert.deepEqual(new Set(Object.values(ECHO_SOURCES).map(([id]) => id)), new Set(Object.keys(ECHOES)));
}
// Drops: pity guarantees a shard on the corpse; stepping on it swaps the lantern's echo.
{
  const g = arena('mossSlime'); g.player.echoPity = 2;
  const e = enemy(g, 'ironBeetle', 11, 10); e.hp = 1;
  assert(g.attack());
  const shard = g.items.find(i => i.kind === 'echoShard');
  assert.deepEqual({x:shard.x, y:shard.y, species:shard.species}, {x:11, y:10, species:'ironBeetle'});
  assert.equal(g.player.echoPity, 0);
  assert.match(g.itemName(shard), /鉄殻甲虫の灯影/);
  const h = replay(g);
  assert(h.move(1, 0)); assert.equal(h.player.echo, 'ironBeetle');
  assert(!h.items.some(i => i.kind === 'echoShard'), 'Echoes never enter the bag');
  assert(h.log.some(l => l.text.includes('苔の灯影は消えた')));
  replay(h);
  const guardian = arena(); guardian.player.echoPity = 2;
  const boss = enemy(guardian, 'starGuardian', 11, 10); boss.hp = 1; guardian.attack();
  assert(!guardian.items.some(i => i.kind === 'echoShard'), 'Guardians drop no echo');
  // Misses build pity, so a third kill is never empty.
  let drops = 0;
  for (let seed = 0; seed < 30; seed++) {
    const r = arena(); r.rng = seed + 1; let misses = 0;
    for (let k = 0; k < 3; k++) {
      const v = enemy(r, 'mossSlime', 11, 10); v.hp = 1; r.player.x = 10; r.player.y = 10; r.attack();
      const got = r.items.findIndex(i => i.kind === 'echoShard');
      if (got >= 0) { drops++; misses = 0; r.items.splice(got, 1); } else misses++;
      assert(misses < 3, 'Pity guarantees the third kill');
      r.enemies = [];
    }
  }
  assert(drops > 30, 'Echo shards drop regularly');
}
// Shell adds defense; veil delays waking; normal engines are untouched.
{
  const g = arena('cobaltBeetle'), base = arena();
  assert.equal(g.defense(), base.defense() + 4);
  const veiled = arena('coinMimic'), sleeper = enemy(veiled, 'mossSlime', 15, 10, {awake:false});
  veiled.wait(); assert.equal(sleeper.awake, false, 'Veil keeps a distant sleeper asleep');
  const plain = arena(), wakes = enemy(plain, 'mossSlime', 15, 10, {awake:false});
  plain.wait(); assert.equal(wakes.awake, true);
  assert.equal(new DungeonEngine(1).wakeRange(), 7, 'Without the veil echo monsters notice Rine at 7 cells');
}
// Wing: two cells per turn only with no visible enemy; stops on items.
{
  const g = arena('caveBat'), turn = g.turn;
  assert(g.move(1, 0)); assert.equal(g.player.x, 12); assert.equal(g.turn, turn + 1);
  const seen = arena('caveBat'); enemy(seen, 'mossSlime', 20, 18, {awake:false});
  seen.move(1, 0); assert.equal(seen.player.x, 11, 'A visible enemy disables the wing step');
  const loot = arena('caveBat'); loot.items.push({x:11, y:10, kind:'bread', amount:1});
  loot.move(1, 0); assert.equal(loot.player.x, 11, 'Picking something up ends the move');
  const wall = arena('caveBat'); wall.tiles[wall.key(12, 10)] = 0; wall.move(1, 0); assert.equal(wall.player.x, 11);
  replay(g);
}
// Lantern shot: attack reaches 3 cells at half power, never through walls.
{
  const g = arena('frostBat'), e = enemy(g, 'mossSlime', 13, 10);
  e.maxHp = e.hp = 99; assert(g.attack()); assert(e.hp < 99 && e.hp >= 99 - Math.floor(g.attackPower() / 2) - 1);
  const far = arena('frostBat'), f = enemy(far, 'mossSlime', 14, 10); far.attack(); assert.equal(f.hp, f.maxHp);
  const strong = arena('thunderBat'), s = enemy(strong, 'mossSlime', 14, 10); strong.attack(); assert(s.hp < s.maxHp);
  const wall = arena('frostBat'); wall.tiles[wall.key(12, 10)] = 0; const w = enemy(wall, 'mossSlime', 13, 10); wall.attack(); assert.equal(w.hp, w.maxHp);
}
// Feast, root and might change what a melee hit does.
{
  const g = arena('lanternMoth'), e = enemy(g, 'mossSlime', 11, 10); e.hp = e.maxHp = 99;
  g.attack(); assert.equal(g.player.hunger, 51);
  const strike = echo => {
    const r = arena(echo), v = enemy(r, 'mossSlime', 11, 10); v.hp = v.maxHp = 99; r.player.lastStrike = r.turn - 1; r.attack(); return 99 - v.hp;
  };
  assert.equal(strike('thornPlant') - strike(null), 3, 'Root adds +3 to a consecutive hit');
  assert.equal(strike('moonPlant') - strike(null), 5);
  const m = arena('stoneGolem'), pushed = enemy(m, 'mossSlime', 11, 10); pushed.hp = pushed.maxHp = 99;
  m.attack(); assert.equal(pushed.x, 12, 'Might shoves the target one cell');
  const pin = arena('stoneGolem'); pin.tiles[pin.key(12, 10)] = 0; const pinned = enemy(pin, 'mossSlime', 11, 10); pinned.hp = pinned.maxHp = 99;
  const control = arena(), free = enemy(control, 'mossSlime', 11, 10); free.hp = free.maxHp = 99;
  pin.attack(); control.attack(); assert.equal((99 - pinned.hp) - (99 - free.hp), 2, 'A wall collision deals +2');
  const trap = arena('stoneGolem'), t = enemy(trap, 'mossSlime', 11, 10); t.hp = t.maxHp = 99; trap.traps.push({x:12, y:10, found:false});
  trap.attack(); assert(trap.traps[0].found, 'Shoved enemies trigger traps');
}
// Moss heals while walking, ember on kills, blink after a hit.
{
  const g = arena('mossSlime'); g.player.echoSteps = 0;
  for (let i = 0; i < 5; i++) g.move(i % 2 ? -1 : 1, 0);
  assert(g.player.hp >= 61, 'Moss heals once per five steps');
  const e = arena('goldGhost'), v = enemy(e, 'mossSlime', 11, 10); v.hp = 1; e.attack(); assert(e.player.hp >= 63);
  const b = arena('abyssGhost'); b.int = (a) => a; const hitter = enemy(b, 'mossSlime', 11, 10);
  b.enemyHit(hitter); assert.notDeepEqual({x:b.player.x, y:b.player.y}, {x:10, y:10}, 'Blink moves Rine');
  assert(Math.max(Math.abs(b.player.x - 10), Math.abs(b.player.y - 10)) <= 3);
}
// Trial floors offer several families, and bad echo saves are rejected.
{
  const families = new Set();
  for (let seed = 1; seed <= 10; seed++) {
    const g = new StrategyEngine(seed); g.chooseKit('none');
    for (let f = 1; f <= 5; f++) {
      if (f > 1) { g.floor = f; g.generateFloor(); }
      for (const e of g.enemies) if (StrategyEngine.ECHO_SOURCES[e.species]) families.add(StrategyEngine.ECHO_SOURCES[e.species][0]);
    }
  }
  assert(families.size >= 7, `Trial offers many echo families (${[...families]})`);
  const g = arena('ironBeetle'), bad = JSON.parse(g.serialize());
  bad.state.player.echo = 'starGuardian'; assert.equal(StrategyEngine.restore(JSON.stringify(bad)), null);
  const badShard = JSON.parse(g.serialize()); badShard.state.items.push({x:11, y:10, kind:'echoShard', species:'nobody', amount:1});
  assert.equal(StrategyEngine.restore(JSON.stringify(badShard)), null);
  const badPity = JSON.parse(g.serialize()); badPity.state.player.echoPity = 9; assert.equal(StrategyEngine.restore(JSON.stringify(badPity)), null);
}
console.log('PASS: lantern echoes cover every monster family, drop with pity, swap on pickup, and wing/shot/shell/feast/root/might/moss/ember/blink/veil behave as described with save validation.');
