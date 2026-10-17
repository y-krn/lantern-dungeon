// Terrain surfaces and the tools that create them, in ordinary runs.
const assert = require('node:assert/strict');
require('../dist/engine.js');
const {MONSTERS, SURFACES, TERRAIN_ITEMS, monsterStats} = DungeonData;
function arena(dungeon = 'tutorial') {
  const g = new DungeonEngine(88, dungeon, true);
  g.tiles.fill(1); g.rooms[0] = {x:2, y:2, w:25, h:20, cx:14, cy:12};
  g.enemies = []; g.items = []; g.traps = []; g.surfaces = []; g.monsterHouse = null; g.effects = [];
  Object.assign(g.player, {x:10, y:10, hp:80, maxHp:80, facing:[1,0], bag:[]});
  g.stairs = {x:25, y:20}; g.reveal(); return g;
}
function enemy(g, species, x, y) {
  const e = {...monsterStats(species), hp:MONSTERS[species].hp, x, y, id:g.enemies.length, awake:true};
  g.enemies.push(e); g.reveal(); return e;
}
const give = (g, kind) => { g.player.bag.push(kind); return g.player.bag.length - 1; };
const type = (g, x, y) => g.surfaceAt(x, y)?.type;
function replay(g) {
  const restored = DungeonEngine.restore(g.serialize()); assert(restored); assert.equal(restored.serialize(), g.serialize()); return restored;
}
// Floors generate water and grass (and oil deeper), never on the stairs; each floor offers a terrain tool.
{
  const counts = {water:0, grass:0, oil:0}; let tools = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const g = new DungeonEngine(seed, 'tutorial', true); g.floor = 4; g.generateFloor();
    for (const s of g.surfaces) { counts[s.type]++; assert(g.tile(s.x, s.y)); assert(!(s.x === g.stairs.x && s.y === g.stairs.y)); }
    tools += g.items.filter(i => TERRAIN_ITEMS.includes(i.kind)).length;
    replay(g);
  }
  assert(counts.water > 0 && counts.grass > 0 && counts.oil > 0, JSON.stringify(counts));
  assert(tools >= 190, 'Almost every floor places a terrain tool');
  const first = new DungeonEngine(5); assert(!first.surfaces.some(s => s.type === 'oil'), 'No oil before floor 3');
}
// Thrown tools land at 4 cells, at the first enemy, or before a wall.
{
  const g = arena(); assert(g.use(give(g, 'waterSkin')));
  for (let x = 13; x <= 15; x++) for (let y = 9; y <= 11; y++) assert.equal(type(g, x, y), 'water');
  const stop = arena(); const e = enemy(stop, 'moonPlant', 12, 10); stop.use(give(stop, 'oilFlask'));
  assert.equal(type(stop, 12, 10), 'oil'); assert.equal(type(stop, 14, 10), undefined);
  const wall = arena(); wall.tiles[wall.key(12, 10)] = 0; wall.use(give(wall, 'oilFlask')); assert.equal(type(wall, 11, 10), 'oil');
  replay(stop);
}
// Fire: sparks on stone fade at once, oil burns three turns and spreads through oil and grass, water stops it.
{
  const g = arena(); const e = enemy(g, 'moonPlant', 14, 10); g.use(give(g, 'emberStone'));
  assert(e.hp <= MONSTERS.moonPlant.hp - 14, 'Ember deals 10 and the flame 4');
  assert.equal(type(g, 14, 10), undefined, 'A spark on bare stone goes out');
  const oil = arena(); for (let x = 14; x <= 18; x++) oil.setSurface(x, 10, x === 17 ? 'grass' : 'oil'); oil.setSurface(19, 10, 'water');
  oil.use(give(oil, 'emberStone')); assert.equal(type(oil, 14, 10), 'fire');
  for (let i = 0; i < 6; i++) oil.wait();
  assert.equal(type(oil, 19, 10), 'water', 'Water never burns');
  assert(!oil.surfaces.some(s => s.type === 'fire'), 'Every fire burns out');
  assert(!oil.surfaces.some(s => s.type === 'oil' || s.type === 'grass'), 'The whole oil and grass line burned');
  const douse = arena(); douse.setSurface(14, 10, 'fire', 3); douse.use(give(douse, 'waterSkin')); assert.equal(type(douse, 14, 10), 'water');
  const self = arena(); self.setSurface(10, 10, 'fire', 3); self.wait(); assert.equal(self.player.hp, 76, 'Standing in fire hurts Rine');
  const avoid = arena(); const walker = enemy(avoid, 'mossSlime', 12, 10); avoid.setSurface(11, 10, 'fire', 3); avoid.setSurface(11, 9, 'fire', 3); avoid.setSurface(11, 11, 'fire', 3);
  avoid.turn = 1; avoid.wait(); assert(!avoid.hazard(walker.x, walker.y), 'Monsters do not step into fire');
}
// Lightning conducts through connected water, including into Rine.
{
  const g = arena(); g.player.bag = ['scroll'];
  for (let x = 13; x <= 18; x++) g.setSurface(x, 10, 'water');
  const near = enemy(g, 'moonPlant', 13, 10), far = enemy(g, 'moonPlant', 18, 10), dry = enemy(g, 'moonPlant', 13, 14);
  const hidden = far; g.visible[g.key(18, 10)] = false;
  g.use(0);
  assert(near.hp < MONSTERS.moonPlant.hp && dry.hp < MONSTERS.moonPlant.hp);
  assert(hidden.hp < MONSTERS.moonPlant.hp, 'Conduction reaches an unseen enemy in the same water');
  const wet = arena(); wet.player.bag = ['scroll']; wet.setSurface(10, 10, 'water'); wet.setSurface(11, 10, 'water'); enemy(wet, 'moonPlant', 11, 10);
  wet.use(0); assert.equal(wet.player.hp, 62, 'Rine standing in the same water is shocked');
  const none = arena(); none.player.bag = ['scroll']; none.setSurface(10, 10, 'water'); enemy(none, 'moonPlant', 14, 10);
  none.use(0); assert.equal(none.player.hp, 80, 'Separate water is safe');
}
// Blast: 3x3 damage including Rine, ignites oil.
{
  const g = arena(); const e = enemy(g, 'moonPlant', 11, 10); g.setSurface(12, 11, 'oil');
  g.use(give(g, 'blastNut'));
  assert.equal(g.player.hp, 80 - 15, 'An adjacent blast catches Rine'); assert(e.hp <= MONSTERS.moonPlant.hp - 15);
  assert(g.surfaces.length === 0 || !g.surfaces.some(s => s.type === 'oil'), 'Oil in the blast burns');
}
// Grass and fog: concealed from ranged telegraphs; fog makes prepared shots miss; fog fades in 5 turns.
{
  const g = arena(); g.setSurface(10, 10, 'grass'); const shooter = enemy(g, 'thornPlant', 13, 10);
  g.wait(); assert(!shooter.intent, 'Grass hides Rine from ranged aim');
  const open = arena(); const archer = enemy(open, 'thornPlant', 13, 10); open.wait(); assert(archer.intent);
  const hp = open.player.hp; open.use(give(open, 'smokeBall')); assert.equal(type(open, 10, 10), 'fog');
  assert.equal(open.player.hp, hp, 'The prepared shot hits nothing'); assert(!open.log.some(l => l.text.startsWith(`${archer.name}の攻撃。`)), 'A telegraph into fog misses');
  for (let i = 0; i < 5; i++) open.wait();
  assert(!open.surfaces.some(s => s.type === 'fog'), 'Fog clears');
  replay(open);
}
// Saves validate surfaces; older saves have none.
{
  const g = arena(); g.setSurface(12, 10, 'fire', 2);
  const bad = JSON.parse(g.serialize()); bad.state.surfaces[0].remaining = 9; assert.equal(DungeonEngine.restore(JSON.stringify(bad)), null);
  const kind = JSON.parse(g.serialize()); kind.state.surfaces[0].type = 'lava'; assert.equal(DungeonEngine.restore(JSON.stringify(kind)), null);
  const dup = JSON.parse(g.serialize()); dup.state.surfaces.push({...dup.state.surfaces[0]}); assert.equal(DungeonEngine.restore(JSON.stringify(dup)), null);
  const legacy = JSON.parse(g.serialize()); delete legacy.state.surfaces; const old = DungeonEngine.restore(JSON.stringify(legacy));
  assert(old); assert.deepEqual(old.surfaces, []);
  assert.deepEqual(Object.keys(SURFACES).sort(), ['fire', 'fog', 'grass', 'oil', 'water']);
}
console.log('PASS: floors generate water/grass/oil and a terrain tool; throws land correctly; fire burns, spreads and is doused; lightning conducts through water; blasts, grass and fog behave; saves validate surfaces.');
