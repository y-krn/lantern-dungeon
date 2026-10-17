// Starting kits, lantern shrines and roadside stalls in ordinary runs.
const assert = require('node:assert/strict');
require('../dist/engine.js');
const {BOONS, START_KITS, ECHO_SOURCES} = DungeonData;
function replay(g) {
  const restored = DungeonEngine.restore(g.serialize()); assert(restored); assert.equal(restored.serialize(), g.serialize()); return restored;
}
function floorWith(field, floor, dungeon = 'tutorial') {
  for (let seed = 1; seed < 200; seed++) {
    const g = new DungeonEngine(seed, dungeon, true); g.floor = floor; g.generateFloor();
    if (g[field]) { g.enemies = []; Object.assign(g.player, {x:g[field].x, y:g[field].y}); g.reveal(); return g; }
  }
  throw new Error(`No ${field} generated on floor ${floor}`);
}
// Kits are offered only when the UI asks, once, at turn 0.
{
  const plain = new DungeonEngine(3); assert(!plain.chooseStartKit('spear'), 'Fixtures and resumed games have no offer');
  for (const id of Object.keys(START_KITS)) {
    const g = new DungeonEngine(3); g.kitOffered = true; assert(g.chooseStartKit(id)); assert.equal(g.kitOffered, false);
    const kit = START_KITS[id];
    if (kit.weapon) assert.equal(g.player.equipment.weapon.variant, kit.weapon);
    if (kit.echo) assert.equal(g.player.echo, kit.echo);
    assert(!g.chooseStartKit(id), 'Only once'); replay(g);
  }
  const none = new DungeonEngine(3); none.kitOffered = true; const before = none.player.bag.length;
  assert(none.chooseStartKit('none')); assert.equal(none.player.bag.length, before);
  const late = new DungeonEngine(3); late.kitOffered = true; late.wait(); assert(!late.chooseStartKit('spear'), 'Not after the first turn');
  const bad = new DungeonEngine(3); bad.kitOffered = true; assert(!bad.chooseStartKit('rocket'));
}
// Shrines on floors 3/6/9 (depths: every 5th), never the last floor; three distinct boons; free; once.
{
  for (let seed = 1; seed <= 40; seed++) for (const [dungeon, floors] of [['tutorial', [1, 2, 3, 4, 6, 9, 10]], ['depths', [3, 5, 10, 25, 30]]]) for (const floor of floors) {
    const g = new DungeonEngine(seed, dungeon, true); g.floor = floor; g.generateFloor();
    const expected = floor !== g.maxFloor() && floor % (dungeon === 'depths' ? 5 : 3) === 0;
    assert.equal(!!g.shrine, expected, `${dungeon} ${floor}`);
    if (g.shrine) {
      assert.equal(new Set(g.shrine.choices.map(c => c.id)).size, 3);
      assert(dungeon === 'depths' || !g.shrine.choices.some(c => c.id === 'insight'), 'Nothing to reveal in the tutorial');
      assert(!(g.shrine.x === g.stairs.x && g.shrine.y === g.stairs.y));
    }
  }
  const g = floorWith('shrine', 3), turn = g.turn;
  assert.equal(g.site(), 'shrine'); const options = g.boonOptions(); assert.equal(options.length, 3);
  const pick = options.findIndex(o => o.available); assert(g.chooseBoon(pick));
  assert.equal(g.turn, turn, 'Boons are free'); assert(g.shrine.used); assert.equal(g.site(), null); assert(!g.chooseBoon(0));
  replay(g);
  // Each boon does what it says.
  const apply = (id, setup = () => {}) => {
    const h = floorWith('shrine', 3); h.shrine.choices = [{id, ...(id === 'echo' ? {species:'stoneGolem'} : {})}, {id:'vigor'}, {id:'rest'}]; setup(h);
    assert(h.chooseBoon(0), id); return h;
  };
  assert.equal(apply('vigor').player.maxHp, 38);
  assert.equal(apply('whet').player.equipment.weapon.bonus, 1);
  assert.equal(apply('temper').player.equipment.shield.bonus, 1);
  assert.equal(apply('echo').player.echo, 'stoneGolem');
  const rested = apply('rest', h => { h.player.hp = 3; h.player.hunger = 5; }); assert.equal(rested.player.hp, rested.player.maxHp); assert.equal(rested.player.hunger, 100);
  assert.equal(apply('quiver').arrowCount(), 15);
  const seen = apply('insight', h => { h.identification.known = []; h.player.bag.push('map', {kind:'shield', rank:2, bonus:1, cursed:true, identified:false}); });
  assert(seen.identification.known.includes('map')); assert(seen.player.bag.at(-1).identified);
  const bare = floorWith('shrine', 3); bare.player.equipment.weapon = null; bare.shrine.choices = [{id:'whet'}, {id:'vigor'}, {id:'rest'}];
  assert.equal(bare.boonOptions()[0].available, false); assert(!bare.chooseBoon(0));
  const away = floorWith('shrine', 3); away.player.x++; assert.equal(away.boonOptions().length, 0);
  assert.deepEqual(Object.keys(BOONS).sort(), ['echo', 'insight', 'quiver', 'rest', 'temper', 'vigor', 'whet']);
}
// Stalls on floors 4/8 (both dungeons): wares cost gold and slots, services appraise and cleanse, all free of turns.
{
  for (let seed = 1; seed <= 30; seed++) for (const floor of [3, 4, 8, 10]) {
    const g = new DungeonEngine(seed, 'tutorial', true); g.floor = floor; g.generateFloor();
    assert.equal(!!g.merchant, floor === 4 || floor === 8);
  }
  const g = floorWith('merchant', 4), turn = g.turn; assert.equal(g.site(), 'merchant');
  const {wares} = g.shopOffers(); assert.equal(wares.length, 5); assert(wares.every(w => !w.available), 'No gold, no sale');
  g.player.gold = 1000; const bread = g.shopOffers().wares.findIndex(w => w.kind === 'bread');
  assert(g.buy(bread)); assert.equal(g.player.gold, 1000 - wares[bread].price); assert(g.player.bag.includes('bread'));
  assert(!g.buy(bread), 'Sold out'); assert.equal(g.turn, turn);
  const arrows = g.shopOffers().wares.findIndex(w => w.kind === 'arrow'); g.buy(arrows); assert.equal(g.arrowCount(), 10);
  replay(g);
  const full = floorWith('merchant', 4); full.player.gold = 1000;
  full.player.bag = Array.from({length:18}, () => ({kind:'shield', rank:0, bonus:0, cursed:false, identified:true}));
  assert(full.shopOffers().wares.every(w => !w.available), 'A full bag cannot buy');
  const svc = floorWith('merchant', 8); svc.player.gold = 2000; svc.player.equipment.weapon.cursed = true;
  svc.player.bag.push({kind:'shield', rank:1, bonus:2, cursed:false, identified:false});
  const appraise = svc.shopOffers().services.find(s => s.id === 'appraise'); assert(appraise.available && appraise.price > 0);
  assert(svc.service('appraise')); assert(svc.player.bag.at(-1).identified); assert.equal(svc.player.gold, 2000 - appraise.price);
  assert(!svc.service('appraise'), 'Nothing left to appraise');
  assert(svc.service('cleanse')); assert.equal(svc.player.equipment.weapon.cursed, false); assert(!svc.service('cleanse'));
  const deep = new DungeonEngine(1, 'depths', true); deep.floor = 4; deep.generateFloor(); const shallow = floorWith('merchant', 4);
  deep.floor = 28; deep.generateFloor(); assert(deep.merchant);
  assert(deep.merchant.stock.find(w => w.kind === 'bread').price > shallow.merchant.stock.find(w => w.kind === 'bread').price, 'Prices rise with depth');
}
// Saves validate sites and accept older saves without them.
{
  const g = floorWith('shrine', 3);
  const bad = JSON.parse(g.serialize()); bad.state.shrine.choices[0] = {id:'wish'}; assert.equal(DungeonEngine.restore(JSON.stringify(bad)), null);
  const echo = JSON.parse(g.serialize()); echo.state.shrine.choices[0] = {id:'echo', species:'starGuardian'}; assert.equal(DungeonEngine.restore(JSON.stringify(echo)), null);
  const m = floorWith('merchant', 4); const price = JSON.parse(m.serialize()); price.state.merchant.stock[0].price = -1; assert.equal(DungeonEngine.restore(JSON.stringify(price)), null);
  const kit = JSON.parse(m.serialize()); kit.state.kitOffered = 'yes'; assert.equal(DungeonEngine.restore(JSON.stringify(kit)), null);
  const legacy = JSON.parse(m.serialize()); delete legacy.state.merchant; delete legacy.state.shrine; delete legacy.state.kitOffered;
  const old = DungeonEngine.restore(JSON.stringify(legacy)); assert(old); assert.equal(old.merchant, null); assert.equal(old.site(), null);
  assert(Object.keys(ECHO_SOURCES).length > 0);
}
console.log('PASS: kits offered once at turn 0; shrines on floors 3/6/9 (depths every 5) give one of three free boons; stalls on floors 4/8 sell, appraise and cleanse for gold with depth pricing; saves validate sites.');
