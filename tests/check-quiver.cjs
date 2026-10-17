// Consumable stacking and arrow infusion in ordinary runs.
const assert = require('node:assert/strict');
require('../dist/engine.js');
const {MONSTERS, INVENTORY_CAPACITY, INFUSION_SHOTS, monsterStats} = DungeonData;
const shield = () => ({kind:'shield', rank:0, bonus:0, cursed:false, identified:true});
function arena(dungeon = 'tutorial') {
  const g = new DungeonEngine(77, dungeon, true);
  g.tiles.fill(1); g.rooms[0] = {x:2, y:2, w:25, h:20, cx:14, cy:12};
  g.enemies = []; g.items = []; g.traps = []; g.surfaces = []; g.monsterHouse = null; g.effects = [];
  Object.assign(g.player, {x:10, y:10, hp:80, maxHp:80, facing:[1,0], bag:[]});
  g.stairs = {x:25, y:20}; g.reveal(); return g;
}
function enemy(g, species, x, y) {
  const e = {...monsterStats(species), hp:MONSTERS[species].hp, x, y, id:g.enemies.length, awake:true};
  g.enemies.push(e); g.reveal(); return e;
}
function replay(g) {
  const restored = DungeonEngine.restore(g.serialize()); assert(restored); assert.equal(restored.serialize(), g.serialize()); return restored;
}
// Every item but the arrow bundle takes its own slot out of 24, so choosing what to carry matters.
{
  assert.equal(INVENTORY_CAPACITY, 24);
  const g = arena(); const p = g.player;
  p.bag = ['bread', 'potion', 'bread', 'bread', 'bread', shield(), 'arrow', 'arrow'];
  assert.deepEqual(g.inventoryEntries().filter(e => e.kind === 'bread').map(e => e.count), [1, 1, 1, 1]);
  assert.equal(g.inventoryCount(), 4 + 1 + 1 + 1 + 2, 'four breads, a potion, a shield, one arrow bundle, two equipped');
  p.bag = Array.from({length:INVENTORY_CAPACITY - 2}, () => 'bread');
  assert.equal(g.inventoryCount(), INVENTORY_CAPACITY);
  g.items = [{x:p.x, y:p.y, kind:'bread'}]; assert(!g.collect(), 'A full bag refuses even a matching item');
  g.items = []; replay(g);
}
// Infusion: needs arrows, spends the source, charges five shots, saves, then fades.
{
  const g = arena(), p = g.player;
  p.bag = ['emberStone']; assert(!g.canInfuse(0), 'No arrows, nothing to infuse');
  p.bag = ['emberStone', ...Array(8).fill('arrow')]; p.ammo = 'arrow';
  assert(g.canInfuse(0)); const turn = g.turn; assert(g.infuse(0));
  assert.equal(g.turn, turn + 1); assert(!p.bag.includes('emberStone')); assert.deepEqual(p.infusion, {kind:'fire', shots:INFUSION_SHOTS});
  replay(g);
  g.setSurface(13, 10, 'oil'); g.setSurface(14, 10, 'oil');
  const target = enemy(g, 'moonPlant', 13, 10); assert(g.shoot());
  assert(target.hp < MONSTERS.moonPlant.hp); assert.equal(p.infusion.shots, INFUSION_SHOTS - 1);
  assert(g.surfaces.some(s => s.type === 'fire'), 'A fire arrow ignites where it hits');
  g.enemies = [];
  for (let i = 0; i < 4; i++) { g.surfaces = []; g.shoot(); }
  assert.equal(p.infusion, undefined, 'The charge fades after five arrows'); assert.equal(g.arrowCount(), 3);
  const wall = arena(); wall.player.bag = ['smokeBall', 'arrow', 'arrow']; wall.player.ammo = 'arrow'; wall.infuse(0);
  wall.tiles[wall.key(11, 10)] = 0; wall.shoot(); assert.equal(wall.player.infusion.shots, INFUSION_SHOTS, 'Point-blank wall shots keep the charge');
}
// Thunder arrows conduct through water; smoke arrows lay fog; unknown talismans cannot be infused.
{
  const g = arena(); g.player.bag = ['scroll', 'arrow', 'arrow']; g.player.ammo = 'arrow'; g.infuse(0);
  for (let x = 13; x <= 16; x++) g.setSurface(x, 10, 'water');
  const near = enemy(g, 'moonPlant', 13, 10), far = enemy(g, 'moonPlant', 16, 10);
  g.shoot(); assert(near.hp <= MONSTERS.moonPlant.hp - 12 - 12 + 1 && far.hp === MONSTERS.moonPlant.hp - 12, 'Thunder runs to the far enemy in the same water');
  const dry = arena(); dry.player.bag = ['scroll', 'arrow']; dry.player.ammo = 'arrow'; dry.infuse(0);
  const lone = enemy(dry, 'moonPlant', 13, 10); dry.shoot(); assert.equal(lone.hp, MONSTERS.moonPlant.hp - 18, 'Without water thunder adds 6');
  const smoke = arena(); smoke.player.bag = ['smokeBall', 'arrow']; smoke.player.ammo = 'arrow'; smoke.infuse(0);
  enemy(smoke, 'moonPlant', 14, 10); smoke.shoot(); assert.equal(smoke.surfaceAt(13, 9)?.type, 'fog');
  const depths = arena('depths'); depths.player.bag = ['scroll', 'arrow']; depths.identification.known = [];
  assert(!depths.canInfuse(0), 'An unidentified talisman is not offered for infusion'); assert(!depths.infuse(0));
  depths.identification.known = ['scroll']; assert(depths.canInfuse(0));
  assert(!arena().infuse('nope'));
}
// Saves reject impossible charges and accept older saves without one.
{
  const g = arena(); g.player.infusion = {kind:'fire', shots:2};
  const bad = JSON.parse(g.serialize()); bad.state.player.infusion.shots = 9; assert.equal(DungeonEngine.restore(JSON.stringify(bad)), null);
  const kind = JSON.parse(g.serialize()); kind.state.player.infusion.kind = 'ice'; assert.equal(DungeonEngine.restore(JSON.stringify(kind)), null);
  const legacy = JSON.parse(g.serialize()); delete legacy.state.player.infusion; assert(DungeonEngine.restore(JSON.stringify(legacy)));
}
console.log('PASS: 24 slots with one item per slot (arrows bundled), and thunder/fire/smoke infusions charge five arrows, act on impact, fade, save, and never reveal unknown talismans.');
