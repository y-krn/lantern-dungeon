// Two echo slots, resonances, weapon evolution and bane gear in ordinary runs.
const assert = require('node:assert/strict');
require('../dist/engine.js');
const {MONSTERS, EQUIPMENT, EVOLUTIONS, EVOLVE_KILLS, RESONANCES, monsterStats} = DungeonData;
function arena(weapon = null) {
  const g = new DungeonEngine(55, 'tutorial', true);
  g.tiles.fill(1); g.rooms[0] = {x:2, y:2, w:25, h:20, cx:14, cy:12};
  g.enemies = []; g.items = []; g.traps = []; g.surfaces = []; g.monsterHouse = null; g.shrine = null; g.merchant = null; g.effects = [];
  Object.assign(g.player, {x:10, y:10, hp:80, maxHp:100, hunger:50, facing:[1,0], bag:[]});
  if (weapon) g.player.equipment.weapon = {kind:'weapon', variant:weapon, rank:0, bonus:0, cursed:false, identified:true};
  g.stairs = {x:25, y:20}; g.reveal(); return g;
}
function enemy(g, species, x, y, extra = {}) {
  const e = {...monsterStats(species), hp:MONSTERS[species].hp, x, y, id:g.enemies.length, awake:true, ...extra};
  g.enemies.push(e); g.reveal(); return e;
}
function replay(g) {
  const restored = DungeonEngine.restore(g.serialize()); assert(restored); assert.equal(restored.serialize(), g.serialize()); return restored;
}
const shard = (g, species) => { g.items.push({x:g.player.x + 1, y:g.player.y, kind:'echoShard', species, amount:1}); g.move(1, 0); };
// Free slots fill on contact; full lanterns offer a choice of which echo to give up; same families use the stronger tier.
{
  const one = arena(); shard(one, 'mossSlime'); shard(one, 'ironBeetle');
  assert.deepEqual(one.echoes().map(e => e.species), ['mossSlime'], 'A full lantern never replaces on its own');
  assert.equal(one.echoOffer().species, 'ironBeetle');
  const two = arena(); two.player.echoSlots = 2;
  shard(two, 'mossSlime'); shard(two, 'ironBeetle'); assert.deepEqual(two.echoes().map(e => e.species), ['mossSlime', 'ironBeetle']);
  shard(two, 'caveBat'); assert.equal(two.site(), 'echo');
  assert(two.replaceEcho(1)); assert.deepEqual(two.echoes().map(e => e.species), ['mossSlime', 'caveBat'], 'Rine picks which echo leaves');
  assert(two.log.some(l => l.text.includes('殻の灯影を手放し'))); replay(two);
  // A shrine echo with full slots becomes a shard underfoot to choose from.
  const shrine = arena(); shrine.player.echo = 'mossSlime'; shrine.shrine = {x:10, y:10, used:false, choices:[{id:'echo', species:'stoneGolem'}, {id:'vigor'}, {id:'rest'}]};
  assert(shrine.chooseBoon(0)); assert.equal(shrine.player.echo, 'mossSlime'); assert.equal(shrine.site(), 'echo');
  assert(shrine.replaceEcho(0)); assert.equal(shrine.player.echo, 'stoneGolem');
  const pair = arena(); Object.assign(pair.player, {echoSlots:2, echo:'ironBeetle', echo2:'cobaltBeetle'});
  assert.equal(pair.echoFor('shell').tier, 1); assert.equal(pair.defense(), arena().defense() + 4, 'Same family does not stack');
  assert.match(pair.echoInfo().label, /殻の灯影.*殻の灯影/);
}
// Resonances.
{
  assert.deepEqual(Object.keys(RESONANCES).sort(), ['ambush', 'meteor', 'mossShell', 'quake']);
  const shot = echoes => { const g = arena(); Object.assign(g.player, {echoSlots:2, ...echoes}); const e = enemy(g, 'moonPlant', 13, 10); g.attack(); return MONSTERS.moonPlant.hp - e.hp; };
  assert(shot({echo:'frostBat', echo2:'caveBat'}) >= shot({echo:'frostBat'}) + 1, 'Meteor shots hit harder than half power');
  const ambush = arena(); Object.assign(ambush.player, {echoSlots:2, echo:'coinMimic', echo2:'lanternMoth'});
  const sleeper = enemy(ambush, 'moonPlant', 11, 10, {awake:false}); const plain = arena(); const control = enemy(plain, 'moonPlant', 11, 10, {awake:false});
  ambush.attack(); plain.attack(); assert((MONSTERS.moonPlant.hp - sleeper.hp) >= 2 * (MONSTERS.moonPlant.hp - control.hp) - 1, 'Ambush doubles a first blow');
  assert(ambush.echoInfo().text.includes('共鳴「奇襲」'));
  const moss = arena(); Object.assign(moss.player, {echoSlots:2, echo:'mossSlime', echo2:'ironBeetle', echoSteps:0, hp:50});
  for (let i = 0; i < 3; i++) moss.move(i % 2 ? -1 : 1, 0);
  assert.equal(moss.player.hp, 51, 'Moss works every third step with the shell');
  const quake = arena('pushMaul'), loose = arena('pushMaul'); Object.assign(quake.player, {echoSlots:2, echo:'stoneGolem', echo2:'thornPlant'}); loose.player.echo = 'stoneGolem';
  for (const g of [quake, loose]) g.tiles[g.key(12, 10)] = 0;
  const a = enemy(quake, 'moonPlant', 11, 10), b = enemy(loose, 'moonPlant', 11, 10); quake.attack(); loose.attack();
  assert.equal(b.hp - a.hp, 3, 'Quake adds 3 to collisions');
}
// Evolution: offered at shrines, gated by kills and the matching echo; evolved weapons behave as described.
{
  const g = arena('lampSpear'); g.shrine = {x:10, y:10, used:false, choices:[{id:'vigor'}, {id:'rest'}, {id:'quiver'}]};
  let offer = g.boonOptions()[3]; assert.equal(offer.id, 'evolve'); assert(!offer.available); assert.match(offer.text, new RegExp(`あと${EVOLVE_KILLS}体`));
  for (let i = 0; i < EVOLVE_KILLS; i++) { const e = enemy(g, 'mossSlime', 11, 10); e.hp = 1; g.player.x = 10; g.player.y = 10; g.attack(); g.enemies = []; g.items = []; }
  assert.equal(g.player.equipment.weapon.kills, EVOLVE_KILLS); assert(!g.boonOptions()[3].available, 'Still needs the shot echo');
  g.player.echo = 'frostBat'; assert(g.boonOptions()[3].available); assert(g.chooseBoon(3));
  assert.equal(g.player.equipment.weapon.variant, 'meteorSpear'); assert.equal(g.player.equipment.weapon.kills, 0); assert(g.shrine.used); replay(g);
  const plain = arena(); plain.shrine = {x:10, y:10, used:false, choices:[{id:'vigor'}, {id:'rest'}, {id:'quiver'}]}; assert.equal(plain.boonOptions().length, 3, 'Swords show no evolution');
  for (const [from, to] of Object.entries(EVOLUTIONS)) assert(EQUIPMENT[to.into] && EQUIPMENT[to.into].weight === 0 && EQUIPMENT[to.into].shape === from);
  const meteor = arena('meteorSpear'), first = enemy(meteor, 'moonPlant', 11, 10), second = enemy(meteor, 'moonPlant', 13, 10), third = enemy(meteor, 'moonPlant', 14, 10);
  meteor.attack(); assert(first.hp < first.maxHp && second.hp < second.maxHp); assert.equal(third.hp, third.maxHp, 'Pierce stops at reach 3');
  const shadow = arena('shadowSickle'), far = enemy(shadow, 'moonPlant', 13, 10); shadow.attack(); assert.equal(far.x, 11, 'Pulled two cells');
  const quakeMaul = arena('quakeMaul'), pushed = enemy(quakeMaul, 'moonPlant', 11, 10); quakeMaul.attack(); assert.equal(pushed.x, 14);
  const gorge = arena('gorgeAxe'); gorge.player.hp = 50; [[11, 9], [11, 10], [11, 11]].forEach(([x, y]) => enemy(gorge, 'moonPlant', x, y)); gorge.attack();
  assert(gorge.player.hp >= 52, 'Each axe hit heals 1');
}
// The wick boon opens a second slot once.
{
  const g = arena(); g.shrine = {x:10, y:10, used:false, choices:[{id:'wick'}, {id:'vigor'}, {id:'rest'}]};
  assert(g.chooseBoon(0)); assert.equal(g.echoSlots(), 2);
  const h = arena(); h.player.echoSlots = 2; h.shrine = {x:10, y:10, used:false, choices:[{id:'wick'}, {id:'vigor'}, {id:'rest'}]};
  assert.equal(h.boonOptions()[0].available, false);
}
// Bane gear: always cursed on the floor, costs while cursed, halved once purified.
{
  let bane = 0;
  for (let seed = 1; seed <= 400; seed++) for (const item of new DungeonEngine(seed, 'tutorial', true).items)
    if (EQUIPMENT[item.variant]?.bane) { bane++; assert.equal(item.cursed, true); }
  assert(bane > 0, 'Bane gear appears');
  const famine = arena('baneScythe'); famine.player.equipment.weapon.cursed = true; famine.player.hunger = 50;
  for (let i = 0; i < 8; i++) famine.wait(); assert.equal(famine.player.hunger, 46, 'Hunger falls every 2 turns');
  assert.equal(famine.attackPower(), 5 + 10);
  famine.player.bag = ['uncurse']; famine.use(0);
  assert(famine.player.equipment.weapon.purified); assert.equal(famine.attackPower(), 5 + 5, 'Purified power is halved');
  const before = famine.player.hunger; for (let i = 0; i < 8; i++) famine.wait(); assert.equal(famine.player.hunger, before - 2);
  const mirror = arena(); mirror.player.equipment.shield = {kind:'shield', variant:'baneMirror', rank:0, bonus:0, cursed:true, identified:true};
  const shooter = enemy(mirror, 'thornPlant', 13, 10); const hp = mirror.player.hp; mirror.enemyHit(shooter, true);
  assert.equal(mirror.player.hp, hp, 'Ranged attacks are reflected'); assert(shooter.hp < shooter.maxHp);
  mirror.player.hp = 10; mirror.player.bag = ['potion']; mirror.use(0); assert.equal(mirror.player.hp, 22, 'Herbs heal half');
  replay(mirror);
}
// Saves validate the new state.
{
  const g = arena(); g.player.echo = 'mossSlime';
  const second = JSON.parse(g.serialize()); second.state.player.echo2 = 'ironBeetle'; assert.equal(DungeonEngine.restore(JSON.stringify(second)), null, 'A second echo needs two slots');
  second.state.player.echoSlots = 2; assert(DungeonEngine.restore(JSON.stringify(second)));
  const slots = JSON.parse(g.serialize()); slots.state.player.echoSlots = 3; assert.equal(DungeonEngine.restore(JSON.stringify(slots)), null);
  const kills = JSON.parse(g.serialize()); kills.state.player.equipment.weapon.kills = -1; assert.equal(DungeonEngine.restore(JSON.stringify(kills)), null);
  const purified = JSON.parse(g.serialize()); purified.state.player.equipment.weapon.purified = 'yes'; assert.equal(DungeonEngine.restore(JSON.stringify(purified)), null);
}
console.log('PASS: two echo slots fill, full lanterns let Rine choose what to give up, four resonances apply, weapons evolve at shrines after 12 kills with the matching echo, the wick boon opens a slot, bane gear is always cursed with costs until purified, and saves validate it all.');
