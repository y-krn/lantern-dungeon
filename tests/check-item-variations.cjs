// Item effects, control states, legacy appearances and container persistence.
const assert = require('node:assert/strict');
require('../dist/engine.js');
const createPolicy = require('../scripts/playtest-policy.cjs');
const {ITEMS, SCROLLS, SCROLL_NAMES, RESCUE_SCROLLS, NEW_ITEM_POOL, MONSTERS, monsterStats, INVENTORY_CAPACITY, validJar} = DungeonData;
function arena(dungeon = 'tutorial') {
  const g = new DungeonEngine(77, dungeon, true);
  g.tiles.fill(1); g.rooms[0] = {x:2, y:2, w:25, h:20, cx:14, cy:12};
  g.enemies = []; g.items = []; g.traps = []; g.surfaces = []; g.monsterHouse = null; g.effects = [];
  Object.assign(g.player, {x:10, y:10, hp:100, maxHp:100, hunger:50, facing:[1,0], bag:[]});
  g.stairs = {x:25, y:20}; g.reveal(); return g;
}
function enemy(g, species, x = 12, y = 10) {
  const e = {...monsterStats(species), hp:MONSTERS[species].hp, x, y, id:g.enemies.length, awake:true};
  g.enemies.push(e); g.reveal(); return e;
}
function replay(g) {
  const restored = DungeonEngine.restore(g.serialize()); assert(restored, 'Save must load');
  assert.equal(restored.serialize(), g.serialize()); return restored;
}
function use(g, kind) { g.player.bag.push(kind); const turn = g.turn; assert(g.use(g.player.bag.length - 1)); assert.equal(g.turn, turn + 1); }
function invalid(g, action) { const before = g.serialize(); assert.equal(action(), false); assert.equal(g.serialize(), before, 'Invalid actions preserve state and RNG'); }
// 24 consumable kinds; unique labels and a separate appearance RNG stream.
{
  assert.equal(Object.keys(ITEMS).filter(k => !['weapon','shield','echoShard'].includes(k)).length, 24);
  assert.equal(SCROLLS.length, 10); assert.equal(SCROLL_NAMES.length, 10);
  const g = arena('depths'); assert.equal(new Set(Object.values(g.identification.appearances)).size, 10);
  const seed = g.seed; g.initIdentification(); assert.equal(g.seed, seed);
  const old = JSON.parse(g.serialize());
  old.state.identification = {appearances:Object.fromEntries(RESCUE_SCROLLS.map((k,i)=>[k, SCROLL_NAMES[i]])), known:['identify'], names:{map:'地図？'}};
  const restored = DungeonEngine.restore(JSON.stringify(old)); assert(restored);
  for (const k of RESCUE_SCROLLS) assert.equal(restored.identification.appearances[k], old.state.identification.appearances[k]);
  assert.equal(restored.identification.names.map, '地図？'); assert.deepEqual(restored.identification.known, ['identify']);
  assert.equal(restored.seed, old.state.seed); assert.equal(restored.rng, old.state.rng); assert.equal(new Set(Object.values(restored.identification.appearances)).size, 10);
  assert.equal(restored.serialize(), DungeonEngine.restore(JSON.stringify(old)).serialize(), 'Migration is deterministic');
  replay(restored);
  for (const kind of SCROLLS.slice(4)) {
    const h = arena('depths'); h.player.equipment.weapon = null; h.player.equipment.shield = null;
    assert(!h.scrollNeedsTarget(0)); use(h, kind); assert(h.identification.known.includes(kind), `${kind} identifies even without a target`);
  }
}
// Food and herbs clamp their gains; full-health great herbs increase the maximum.
{
  const g = arena(); g.player.hp = 40; use(g, 'driedFruit'); assert.equal(g.player.hp, 45); assert.equal(g.player.hunger, 75);
  g.player.hp = 1; use(g, 'greatHerb'); assert.equal(g.player.hp, 61);
  g.player.hp = 100; use(g, 'greatHerb'); assert.equal(g.player.maxHp, 103); assert.equal(g.player.hp, 103);
  const h = arena(); h.player.hp = 99; h.player.hunger = 99; use(h, 'driedFruit'); assert.equal(h.player.hp, 100); assert.equal(h.player.hunger, 100);
}
// Gust pushes every adjacent enemy, springs intermediate traps, and deals fixed collision damage.
{
  const g = arena(); const e = enemy(g, 'moonPlant', 11, 10), other = enemy(g, 'moonPlant', 10, 11);
  g.traps = [{x:12,y:10,type:'spike',found:false}]; use(g, 'gustTalisman');
  assert.equal(e.x, 13); assert.equal(other.y, 13); assert(e.hp < e.maxHp); assert(g.traps[0].found);
  const h = arena(); const a = enemy(h, 'moonPlant', 11, 10), b = enemy(h, 'moonPlant', 12, 10);
  h.tiles[h.key(10,12)] = 0; const c = enemy(h, 'moonPlant', 10, 11);
  use(h, 'gustTalisman'); assert.equal(a.hp, a.maxHp - 3); assert.equal(b.hp, b.maxHp - 3); assert.equal(c.hp, c.maxHp - 3);
  const fire = arena(); const f = enemy(fire, 'moonPlant', 11, 10); fire.setSurface(12,10,'fire',3);
  use(fire,'gustTalisman'); assert.equal(f.x,13); assert.equal(f.hp,f.maxHp-4,'Forced movement touches intermediate fire');
}
// Sleep cancels attacks and suppresses movement, regeneration and healing for eight actions.
{
  const g = arena(); const e = enemy(g, 'moonPlant', 13, 10); e.intent = {kind:'ranged',x:10,y:10};
  use(g, 'sleepTalisman'); assert.equal(e.sleepUntil, 8); assert(!e.intent); const hp = g.player.hp; replay(g);
  for (let i = 0; i < 7; i++) { g.wait(); assert(!e.intent); assert.equal(g.player.hp,Math.min(g.player.maxHp,hp + Math.floor(g.turn/7))); }
  g.wait(); assert(e.intent); assert.equal(e.sleepUntil, undefined);
  for (const kind of ['melee','arrow','magic']) {
    const h = arena(); const a = enemy(h, 'moonPlant'); h.sleepEnemy(a,8); h.hit(a,1,kind); assert.equal(a.sleepUntil,undefined); assert(a.awake);
  }
  const h = arena(); const healer = enemy(h,'mendGhost',14,10), hurt = enemy(h,'moonPlant',15,10); hurt.hp = 10;
  h.sleepEnemy(healer,8); h.enemyTurn(); assert.equal(hurt.hp,10,'Sleeping healers cannot heal allies');
  const ambush = arena(); ambush.player.echo = 'coinMimic'; ambush.player.echo2 = 'lanternMoth'; ambush.player.echoSlots = 2;
  const a = enemy(ambush, 'moonPlant'); ambush.sleepEnemy(a,8); ambush.hit(a,5,'melee'); assert.equal(a.hp,a.maxHp-10);
}
// Enhancements keep curses and never exceed the save schema's bonus ceiling.
{
  const g = arena(); g.player.equipment.weapon.cursed = true; use(g,'sharpenTalisman');
  assert.equal(g.player.equipment.weapon.bonus,1); assert(g.player.equipment.weapon.cursed);
  g.player.equipment.shield.bonus = -2; use(g,'temperTalisman'); assert.equal(g.player.equipment.shield.bonus,-1);
  g.player.equipment.weapon.bonus = 99; use(g,'sharpenTalisman'); assert.equal(g.player.equipment.weapon.bonus,99); replay(g);
}
// Warp uses exactly the trap's landing rules. Copy leaves the nearest non-guardian's shard, even with full echo slots.
{
  const g = arena(), h = arena(); const start = {x:g.player.x,y:g.player.y};
  use(g,'warpTalisman'); h.springTrap({x:10,y:10,type:'warp'},h.player);
  assert.deepEqual({x:g.player.x,y:g.player.y}, {x:h.player.x,y:h.player.y}); assert.notDeepEqual({x:g.player.x,y:g.player.y},start);
  const c = arena(); enemy(c,'starGuardian',11,10); enemy(c,'moonPlant',13,10); enemy(c,'stoneGolem',14,10);
  c.player.echo = 'mossSlime'; c.items = [{x:10,y:10,kind:'bread'}]; use(c,'copyTalisman');
  const shard = c.items.find(i=>i.kind==='echoShard'); assert(shard); assert.equal(shard.species,'moonPlant'); assert.notDeepEqual({x:shard.x,y:shard.y},start);
  assert.equal(c.player.echo,'mossSlime'); Object.assign(c.player,{x:shard.x,y:shard.y}); assert(!c.collect()); assert(c.echoOffer());
  const empty = arena(); enemy(empty,'starGuardian'); use(empty,'copyTalisman'); assert(!empty.items.some(i=>i.kind==='echoShard'));
}
// Hook reaches five cells, stops at the first enemy/wall, springs traps, and stops when a trap teleports its target.
{
  const g = arena(); const e = enemy(g,'moonPlant',15,10); g.traps = [{x:13,y:10,type:'spike',found:false}];
  use(g,'hookRope'); assert.equal(e.x,11); assert(g.traps[0].found); assert(e.hp<e.maxHp);
  const h = arena(); const near = enemy(h,'moonPlant',13,10), far = enemy(h,'moonPlant',15,10); use(h,'hookRope'); assert.equal(near.x,11); assert.equal(far.x,15);
  const wall = arena(); const a = enemy(wall,'moonPlant',15,10); wall.tiles[wall.key(12,10)] = 0; use(wall,'hookRope'); assert.equal(a.x,15);
  const warp = arena(); const b = enemy(warp,'moonPlant',15,10); warp.traps=[{x:14,y:10,type:'warp',found:false}];
  use(warp,'hookRope'); assert(warp.traps[0].found); assert.notEqual(b.x,11,'Hook stops after teleport');
}
// Slow permits actions only on even turns; flash cancels any telegraph and consumes one action.
{
  const g = arena(); const e = enemy(g,'moonPlant',14,10); use(g,'slowDust'); assert.equal(e.slowUntil,10); assert(!e.intent);
  g.wait(); assert(e.intent); const hp = g.player.hp; g.wait(); assert(e.intent); assert.equal(g.player.hp,hp);
  g.wait(); assert(!e.intent); assert(g.player.hp<hp); replay(g);
  const fast = arena(); const bat = enemy(fast,'caveBat',14,10); use(fast,'slowDust'); assert.equal(bat.x,14); fast.wait(); assert.equal(bat.x,12,'One full fast action on even turns');
  for (const species of ['moonPlant','stoneGolem','hornBeetle']) {
    const h = arena(); const a = enemy(h,species,13,10); a.intent = {kind:species==='hornBeetle'?'charge':species==='moonPlant'?'ranged':'windup',x:10,y:10};
    use(h,'flashBall'); assert(!a.intent); assert(!a.stunned); assert.equal(a.x,13); assert.equal(h.player.hp,100);
  }
  const h = arena(); const a = enemy(h,'caveBat'); a.stunned = true; replay(h); h.enemyTurn(); assert(!a.stunned);
}
// Sleep arrows apply sleep after damage, suppress same-turn retaliation, and do not bypass reflection.
{
  const g = arena(); g.player.bag=['sleepTalisman','arrow']; g.player.ammo='arrow'; assert(g.infuse(0));
  const a = enemy(g,'moonPlant',13,10); const turn = g.turn; assert(g.shoot()); assert.equal(a.hp,a.maxHp-12); assert.equal(a.sleepUntil,turn+5); assert(!a.intent); replay(g);
  const h = arena(); h.player.bag=['sleepTalisman','arrow']; h.player.ammo='arrow'; h.infuse(0);
  const mirror = enemy(h,'mirrorBeetle',13,10); h.shoot(); assert.equal(mirror.sleepUntil,undefined); assert.equal(mirror.hp,mirror.maxHp);
}
// Jar choices cost one turn; invalid targets/full/overflow/cancellation leave the complete state unchanged.
{
  const g = arena('depths'), p = g.player; const jar = {kind:'keepJar',contents:[]}; p.bag=['bread',jar,'sleepTalisman','arrow'];
  assert(g.jarPut(1,0)); assert.equal(g.turn,1); assert.deepEqual(jar.contents,['bread']); assert.equal(p.bag[0],jar);
  assert(g.jarPut(0,1)); assert.equal(g.turn,2); assert.equal(p.bag[1],'arrow');
  assert(g.itemName(jar).includes(g.itemName('sleepTalisman'))); assert(!g.itemName(jar).includes('眠り'));
  const observed = createPolicy(DungeonData).observe(JSON.parse(g.serialize()).state).player.bag[0];
  assert.equal(observed.contents[1].kind,'unknown-scroll'); assert(!JSON.stringify(observed).includes('sleepTalisman'));
  p.bag.push('potion'); assert(g.jarPut(0,2)); assert.equal(jar.contents.length,3);
  invalid(g,()=>g.jarPut(0,1)); invalid(g,()=>g.jarPut(0,0)); invalid(g,()=>g.jarTake(0,-1)); invalid(g,()=>g.jarTake(0,3));
  replay(g); assert(g.jarTake(0,1)); assert.equal(g.turn,4); assert.equal(p.bag.at(-1),'sleepTalisman');
  p.bag.push('bread'); assert(g.jarPut(0,p.bag.length-1));
  p.bag.push(...Array(INVENTORY_CAPACITY - g.inventoryCount()).fill('bread')); invalid(g,()=>g.jarTake(0,0));
  const saved = g.serialize(); invalid(g,()=>g.use(0)); assert.equal(g.serialize(),saved);
  assert(g.drop(0)); assert.deepEqual(g.groundItem().contents,jar.contents); replay(g);
  invalid(g,()=>g.useGround()); assert(g.pickup()); assert.deepEqual(p.bag.at(-1),jar); replay(g);
  const empty = arena(); empty.player.bag=[{kind:'keepJar',contents:[]}, 'arrow', empty.player.equipment.weapon, {kind:'keepJar',contents:[]}];
  for (const target of [0,1,2,3,99]) invalid(empty,()=>empty.jarPut(0,target));
}
// Floor use works at capacity; six new scrolls have identical unknown UI affordances.
{
  for (const kind of NEW_ITEM_POOL.map(([k])=>k).filter(k=>k!=='keepJar')) {
    const g = arena('depths'); g.player.bag=Array(INVENTORY_CAPACITY-2).fill('bread'); g.items=[{kind,x:10,y:10,amount:1}];
    assert(g.useGround(),kind); assert.equal(g.inventoryCount(),INVENTORY_CAPACITY); assert(!g.items.some(i=>i.kind===kind)); replay(g);
  }
}
// Every floor has one additional weighted supply, respecting effective depth; rescue remains a uniform four-way draw.
{
  const kinds = NEW_ITEM_POOL.map(([k])=>k), seen = new Set();
  for (const dungeon of ['tutorial','depths']) for (const floor of [1,2,3,4,8]) for (let seed=1;seed<=60;seed++) {
    const g = new DungeonEngine(seed,dungeon,true); g.floor=floor; g.generateFloor();
    const supply = g.items.filter(i=>kinds.includes(i.kind)); assert.equal(supply.length,1);
    const [, , min] = NEW_ITEM_POOL.find(([k])=>k===supply[0].kind); assert(min<=floor+(dungeon==='depths'?2:0)); seen.add(supply[0].kind);
    if (supply[0].kind==='keepJar') assert(validJar(supply[0]));
    assert(g.items.some(i=>RESCUE_SCROLLS.includes(i.kind)));
    if (g.merchant) { assert.equal(g.merchant.stock.length,6); assert(SCROLLS.includes(g.merchant.stock[4].kind)); assert(kinds.includes(g.merchant.stock[5].kind)); }
  }
  assert.equal(seen.size,12);
  const g = arena(); Object.assign(g.player,{x:10,y:10,gold:999}); g.merchant={x:10,y:10,stock:[{kind:'keepJar',price:150,amount:1,sold:false}]};
  assert(g.buy(0)); assert(validJar(g.player.bag[0])); replay(g);
}
// Reject malformed jars/status timers; accept old saves without status fields.
{
  const g = arena(); enemy(g,'moonPlant');
  for (const contents of [null,['arrow'],['keepJar'],['echoShard'],['weapon'],['nope'],[{kind:'potion'}],Array(4).fill('bread')]) {
    for (const ground of [false,true]) {
      const s=JSON.parse(g.serialize()); const jar={kind:'keepJar',contents};
      if(ground)s.state.items=[{...jar,x:10,y:10}];else s.state.player.bag=[jar];
      assert.equal(DungeonEngine.restore(JSON.stringify(s)),null,JSON.stringify(contents));
    }
  }
  const badString=JSON.parse(g.serialize()); badString.state.player.bag=['keepJar']; assert.equal(DungeonEngine.restore(JSON.stringify(badString)),null);
  for (const key of ['sleepUntil','slowUntil']) for (const value of [-1,1.5,'5',null,100]) {
    const s=JSON.parse(g.serialize());s.state.enemies[0][key]=value;assert.equal(DungeonEngine.restore(JSON.stringify(s)),null,`${key} ${value}`);
  }
  replay(g);
}
console.log('PASS: 24 item kinds, legacy talisman labels, twelve effects, sleep/slow/stun, sleep arrows, jars, depth-gated supplies and valid saves.');
