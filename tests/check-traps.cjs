// Trap variety: generation and the shared spring rules for Rine and forced-moved monsters.
const assert = require('node:assert/strict');
require('../dist/engine.js');
const {MONSTERS, TRAPS, monsterStats} = DungeonData;
function arena(dungeon = 'tutorial') {
  const g = new DungeonEngine(66, dungeon, true);
  g.tiles.fill(1); g.rooms[0] = {x:2, y:2, w:25, h:20, cx:14, cy:12}; g.rooms = g.rooms.slice(0, 4);
  for (let i = 1; i < 4; i++) g.rooms[i] = {x:40, y:i * 5, w:2, h:2, cx:41, cy:i * 5 + 1};
  g.enemies = []; g.items = []; g.traps = []; g.surfaces = []; g.monsterHouse = null; g.shrine = null; g.merchant = null; g.effects = [];
  Object.assign(g.player, {x:10, y:10, hp:60, maxHp:60, hunger:80, facing:[1,0], bag:[]});
  g.stairs = {x:25, y:20}; g.reveal(); return g;
}
function enemy(g, species, x, y) {
  const e = {...monsterStats(species), hp:MONSTERS[species].hp, x, y, id:g.enemies.length, awake:true};
  g.enemies.push(e); g.reveal(); return e;
}
const step = (g, type) => { g.traps.push({x:11, y:10, type, found:false}); assert(g.move(1, 0)); return g; };
function replay(g) {
  const restored = DungeonEngine.restore(g.serialize()); assert(restored); assert.equal(restored.serialize(), g.serialize()); return restored;
}
// Generation: every type appears, fire/oil only from floor 3, no pits on the last floor.
{
  const seen = {}, early = new Set();
  for (let seed = 1; seed <= 300; seed++) for (const floor of [1, 2, 5, 10]) {
    const g = new DungeonEngine(seed, 'tutorial', true); g.floor = floor; g.generateFloor();
    for (const t of g.traps) {
      assert(Object.hasOwn(TRAPS, t.type)); seen[t.type] = (seen[t.type] || 0) + 1;
      if (floor < 3) early.add(t.type);
      if (floor === 10) assert.notEqual(t.type, 'pit', 'No pit on the last floor');
    }
  }
  assert.deepEqual(Object.keys(seen).sort(), Object.keys(TRAPS).sort());
  assert(!early.has('fire') && !early.has('oil'), 'Fire and oil traps start on floor 3');
  assert(seen.spike > seen.pit, 'Spikes stay the most common');
}
// Each trap on Rine.
{
  const spike = step(arena(), 'spike'); assert(spike.player.hp <= 58 && spike.player.hp >= 55); assert(spike.traps[0].found);
  const pit = step(arena(), 'pit'); assert.equal(pit.floor, 2, 'A pit drops Rine a floor'); assert.equal(pit.player.hp, 57);
  assert(pit.log.some(l => l.text.includes('落とし穴')));
  const last = arena(); last.floor = last.maxFloor(); step(last, 'pit'); assert.equal(last.floor, last.maxFloor(), 'No fall from the last floor');
  const warp = step(arena(), 'warp'); assert.notDeepEqual({x:warp.player.x, y:warp.player.y}, {x:11, y:10});
  const rust = arena(); rust.player.equipment.weapon.bonus = 2; step(rust, 'rust'); assert.equal(rust.player.equipment.weapon.bonus, 1);
  const floor = arena(); floor.player.equipment.weapon.bonus = -3; step(floor, 'rust'); assert.equal(floor.player.equipment.weapon.bonus, -3, 'Rust stops at -3');
  const bare = arena(); bare.player.equipment.weapon = null; step(bare, 'rust'); assert.equal(bare.player.hp, 60);
  const alarm = arena(); const sleeper = enemy(alarm, 'mossSlime', 20, 18); sleeper.awake = false; step(alarm, 'alarm'); assert(sleeper.awake);
  const fire = step(arena(), 'fire'); assert(fire.player.hp <= 60 - 6);
  const oil = step(arena(), 'oil'); assert.equal(oil.surfaceAt(12, 11)?.type, 'oil');
  replay(oil);
}
// Forced movement springs the same traps on monsters.
{
  const pushTo = (type, weapon = 'pushMaul') => {
    const g = arena(); g.player.equipment.weapon = {kind:'weapon', variant:weapon, rank:0, bonus:0, cursed:false, identified:true};
    g.traps.push({x:12, y:10, type, found:false}); const e = enemy(g, 'moonPlant', 11, 10); g.attack(); return [g, e];
  };
  const [pitGame, fallen] = pushTo('pit'); assert(!pitGame.enemies.includes(fallen), 'A pushed monster falls away');
  assert.equal(pitGame.player.exp, 0, 'Falling grants nothing'); assert.equal(pitGame.floor, 1);
  const [warpGame, warped] = pushTo('warp'); assert(!(warped.x === 12 && warped.y === 10) && !(warped.x === 13 && warped.y === 10));
  const [oilGame] = pushTo('oil'); assert(oilGame.surfaces.some(s => s.type === 'oil'));
  const [rustGame] = pushTo('rust'); assert.equal(rustGame.player.equipment.weapon.bonus, 0, 'Rust never touches Rine from a monster');
}
// Saves accept old untyped spikes and reject unknown types.
{
  const g = arena(); g.traps.push({x:5, y:5, found:false}, {x:6, y:6, type:'pit', found:true});
  const restored = replay(g); assert.equal(restored.traps.length, 2);
  const bad = JSON.parse(g.serialize()); bad.state.traps[1].type = 'lava'; assert.equal(DungeonEngine.restore(JSON.stringify(bad)), null);
}
console.log('PASS: seven trap types generate by depth (no pits on the last floor), spring on Rine and on forced-moved monsters with their own effects, and save with older untyped spikes.');
