const assert = require('node:assert/strict');
require('../dist/engine.js');

function arena(kind, amount = 1) {
  const game = new DungeonEngine(42), p = game.player;
  const room = game.roomAt(p.x, p.y);
  p.x = room.cx; p.y = room.cy; p.facing = [1, 0];
  p.bag = Array(18).fill('bread'); p.hp = 1; p.hunger = 20;
  game.enemies = []; game.traps = []; game.monsterHouse = null;
  game.items = [{kind, amount, x: p.x, y: p.y}];
  game.reveal();
  return game;
}

// Ground use shares inventory effects, but never inserts/removes a bag item.
for (const kind of ['bread', 'potion', 'scroll', 'map', 'identify', 'uncurse', 'arrow']) {
  const ground = arena(kind), bag = arena(kind);
  ground.identification.known = []; bag.identification.known = [];
  const target = kind === 'identify' ? 'weapon' : undefined;
  for (const game of [ground, bag]) {
    game.player.equipment.weapon.cursed = true;
    game.enemies = [{x: game.player.x + 1, y: game.player.y, id: 1,
      ...DungeonData.monsterStats('mossSlime'), hp: DungeonData.MONSTERS.mossSlime.hp, awake: true}];
    game.reveal();
  }
  const before = structuredClone(ground.player.bag);
  bag.items = []; bag.player.bag.push(kind);
  assert.equal(ground.inventoryCount(), 20);
  assert.equal(ground.scrollNeedsTarget('ground'), kind === 'identify');
  assert(ground.useGround(target)); assert(bag.use(18, target));
  assert.equal(ground.turn, 1); assert.equal(ground.items.length, 0);
  assert.deepEqual(ground.player.bag, before); assert.equal(ground.inventoryCount(), 20);
  assert.deepEqual(ground.player, bag.player);
  assert.deepEqual(ground.enemies, bag.enemies);
  assert.deepEqual(ground.identification, bag.identification);
  assert.deepEqual(ground.effects, bag.effects);
  assert.deepEqual(ground.seen, bag.seen);
  const saved = ground.serialize();
  assert.equal(DungeonEngine.restore(saved).serialize(), saved);
}

// A floor arrow stack loses exactly one arrow and preserves equipped bag ammo.
{
  const game = arena('arrow', 27), p = game.player;
  p.bag = [...Array(17).fill('bread'), 'arrow', 'arrow']; p.ammo = 'arrow';
  const before = [...p.bag];
  assert(game.useGround()); assert.equal(game.items[0].amount, 26);
  assert.equal(game.items.filter(item => item.kind === 'arrow').reduce((sum, item) => sum + item.amount, 0), 27);
  assert.deepEqual(p.bag, before); assert.equal(p.ammo, 'arrow');
  const restored = DungeonEngine.restore(game.serialize());
  assert.equal(restored.items[0].amount, 26);
  restored.items[0].amount = 1;
  assert(restored.useGround()); assert.equal(restored.groundItem(), undefined);
  assert.equal(restored.arrowCount(), 2); assert.equal(restored.player.ammo, 'arrow');
}

// Missed arrows remain recoverable only when their flight is stopped by a wall.
function shootingArena(facing = [1, 0], distance = 3) {
  const game = arena('arrow'), p = game.player;
  p.x = 12; p.y = 12; p.hp = p.maxHp; p.hunger = 100;
  p.bag = ['arrow', 'arrow']; p.ammo = 'arrow'; p.facing = facing;
  game.items = []; game.tiles.fill(0);
  game.stairs = {x: 2, y: 2}; game.tiles[game.key(2, 2)] = 1;
  const [dx, dy] = facing;
  for (let i = 0; i <= distance; i++) {
    const x = p.x + dx * i, y = p.y + dy * i;
    game.tiles[game.key(x, y)] = 1;
    if (dx && dy && i < distance) {
      game.tiles[game.key(x + dx, y)] = 1;
      game.tiles[game.key(x, y + dy)] = 1;
    }
  }
  game.reveal();
  return game;
}
for (const facing of DungeonData.DIRS) {
  const game = shootingArena(facing), p = game.player;
  const x = p.x + facing[0] * 3, y = p.y + facing[1] * 3;
  assert(game.shoot()); assert.equal(game.turn, 1); assert.equal(game.arrowCount(), 1);
  assert.equal(p.ammo, 'arrow');
  assert.deepEqual(game.items.map(({kind, x, y, amount}) => ({kind, x, y, amount})),
    [{kind: 'arrow', x, y, amount: 1}]);
  assert(game.log.some(entry => entry.text.includes('床に落ちた')));
  assert(game.shoot()); assert.equal(game.arrowCount(), 0); assert.equal(p.ammo, null);
  assert.equal(game.items.length, 1); assert.equal(game.items[0].amount, 2);
  const saved = game.serialize(), restored = DungeonEngine.restore(saved);
  assert(restored); assert.equal(restored.serialize(), saved);
  for (let i = 0; i < 3; i++) assert(restored.move(...facing));
  assert.equal(restored.arrowCount(), 2); assert.equal(restored.items.length, 0);
}
// The source arrow is consumed before landing, including a shot at an adjacent wall.
for (const amount of [1, 27]) {
  const game = shootingArena([1, 0], 0), p = game.player;
  game.items = [{kind: 'arrow', amount, x: p.x, y: p.y}];
  const bag = [...p.bag];
  assert(game.useGround()); assert.equal(game.turn, 1);
  assert.deepEqual(p.bag, bag); assert.equal(p.ammo, 'arrow');
  assert.equal(game.items.length, 1); assert.equal(game.groundItem().amount, amount);
  const saved = game.serialize(); assert.equal(DungeonEngine.restore(saved).serialize(), saved);
}
// Other floor items and stairs are preserved; the arrow lands on nearby floor.
for (const occupied of ['potion', 'stairs']) {
  const game = shootingArena(), p = game.player, end = {x: p.x + 3, y: p.y};
  if (occupied === 'potion') game.items = [{...end, kind: 'potion', amount: 1}];
  else game.stairs = end;
  assert(game.shoot());
  const arrow = game.items.find(item => item.kind === 'arrow');
  assert(arrow); assert(game.tile(arrow.x, arrow.y));
  assert.notDeepEqual({x: arrow.x, y: arrow.y}, end);
  if (occupied === 'potion') assert.deepEqual(game.items[0], {...end, kind: 'potion', amount: 1, discovered: true});
  assert.equal(new Set(game.items.map(item => game.key(item.x, item.y))).size, game.items.length);
}
{
  const game = shootingArena([1, 0], 12);
  assert(game.shoot()); assert.equal(game.items.length, 0); assert.equal(game.arrowCount(), 1);
}
// Diagonal corner blocking drops on the last reachable tile, never through a wall.
{
  const game = shootingArena([1, 1]), p = game.player;
  game.tiles[game.key(p.x + 1, p.y)] = 0;
  assert(game.shoot()); assert.equal(game.items.length, 1);
  assert.deepEqual({x: game.items[0].x, y: game.items[0].y}, {x: p.x, y: p.y});
  assert(game.pickup()); assert.equal(game.arrowCount(), 2); assert.equal(game.turn, 2);
}
// A packed landing area cannot overwrite or duplicate existing items.
{
  const game = shootingArena(), p = game.player;
  game.items = [2, 3].map(distance => ({kind: 'potion', amount: 1, x: p.x + distance, y: p.y}));
  game.reveal(); const before = structuredClone(game.items);
  assert(game.shoot()); assert.deepEqual(game.items, before); assert.equal(game.arrowCount(), 1);
}
// Recovered arrows can join an inventory stack even at full capacity.
{
  const game = shootingArena(), p = game.player;
  p.bag = [...Array(17).fill('bread'), 'arrow', 'arrow'];
  assert.equal(game.inventoryCount(), 20); assert(game.shoot());
  for (let i = 0; i < 3; i++) assert(game.move(1, 0));
  assert.equal(game.arrowCount(), 2); assert.equal(game.inventoryCount(), 20);
  assert.equal(game.items.length, 0);
}
{
  const game = shootingArena(), p = game.player;
  const enemy = {id: 1, x: p.x + 2, y: p.y, ...DungeonData.monsterStats('mossSlime'), hp: 9, awake: true};
  game.enemies = [enemy];
  assert(game.shoot()); assert(enemy.hp <= 0);
  assert.equal(game.items.length, 0); assert.equal(game.arrowCount(), 1);
}

// Target selection/cancellation, unavailable items and invalid input cost nothing.
{
  const game = arena('identify'); game.identification.known = [];
  const before = game.serialize();
  for (const target of [undefined, -1, 999, 'missing']) {
    assert.equal(game.useGround(target), false); assert.equal(game.serialize(), before);
  }
  assert(game.useGround(0)); assert.equal(game.player.bag.length, 18);
}
for (const setup of [
  game => { game.items = []; },
  game => { game.items[0].x++; },
  game => { game.items[0].kind = 'gold'; },
  game => { game.items[0].kind = 'missing'; },
  game => { game.items[0] = {...game.player.equipment.weapon, x: game.player.x, y: game.player.y}; },
  game => { game.items[0] = {...game.player.equipment.shield, x: game.player.x, y: game.player.y}; },
  game => { game.status = 'dead'; },
  game => { game.status = 'won'; },
]) {
  const game = arena('bread'); setup(game);
  const before = game.serialize();
  assert.equal(game.useGround(), false); assert.equal(game.serialize(), before);
}
{
  const game = arena('bread');
  game.player.x = game.stairs.x; game.player.y = game.stairs.y;
  Object.assign(game.items[0], game.stairs);
  assert(game.useGround()); assert.equal(game.turn, 1);
}
// Inventory appraisal can target the floor without collecting it or changing gear.
{
  const game = arena('weapon'), p = game.player;
  const item = {...p.equipment.weapon, variant:'starSword',rank:3,bonus:-2,cursed:true,identified:false,x:p.x,y:p.y,amount:1};
  game.items = [item]; p.bag[0] = 'identify'; game.identification.known = [];
  const equipped = structuredClone(p.equipment);
  assert.equal(game.targetItem('ground'),item);
  assert(game.use(0,'ground'));assert.equal(game.turn,1);
  assert.equal(game.items[0],item);assert(item.identified);assert(item.cursed);assert.equal(item.bonus,-2);
  assert.equal(game.inventoryCount(),19);assert.deepEqual(p.equipment,equipped);
  assert(game.identification.known.includes('identify'));
  const saved = game.serialize();assert.equal(DungeonEngine.restore(saved).serialize(),saved);
  // Removing the floor target cannot silently consume a second scroll.
  p.bag.push('identify');game.items=[];
  const before = game.serialize();assert.equal(game.use(p.bag.length-1,'ground'),false);
  assert.equal(game.serialize(),before);
}
// A floor scroll can be named or identified with run-wide knowledge preserved.
{
  const game = arena('map');game.identification.known=[];game.player.bag[0]='identify';
  assert(game.nameScroll('ground','地図かも'));assert.equal(game.turn,0);
  assert(game.itemName(game.groundItem()).includes('地図かも'));
  assert(game.use(0,'ground'));assert(game.identification.known.includes('map'));
  assert.equal(game.groundItem().kind,'map');assert.equal(game.inventoryCount(),19);
  const saved=game.serialize();assert.equal(DungeonEngine.restore(saved).serialize(),saved);
  const own=arena('identify'),before=own.serialize();
  assert.equal(own.useGround('ground'),false);assert.equal(own.serialize(),before);
}
// Manual pickup is one turn only on success, including arrow stacking at capacity.
{
  const game=arena('potion'),p=game.player;
  assert.equal(game.pickup(),false);assert.equal(game.turn,0);assert.equal(game.items.length,1);
  p.bag.pop();assert(game.pickup());assert.equal(game.turn,1);assert.equal(game.inventoryCount(),20);
  assert.equal(game.items.length,0);assert.equal(p.bag.at(-1),'potion');
  assert.equal(game.pickup(),false);assert.equal(game.turn,1);
}
{
  const game=arena('arrow',27);game.player.bag[0]='arrow';game.player.ammo='arrow';
  assert(game.pickup());assert.equal(game.turn,1);assert.equal(game.arrowCount(),28);assert.equal(game.inventoryCount(),20);
  const saved=game.serialize();assert.equal(DungeonEngine.restore(saved).serialize(),saved);
}
// Direct equipment swapping leaves the previous gear on the floor, never in the bag.
for(const kind of ['weapon','shield']) {
  const game=arena(kind),p=game.player,old=structuredClone(p.equipment[kind]),bag=structuredClone(p.bag);
  game.items=[{...old,bonus:2,cursed:true,identified:false,x:p.x,y:p.y,amount:1}];
  assert(game.equip('ground'));assert.equal(game.turn,1);assert.equal(game.inventoryCount(),20);
  assert.deepEqual(p.bag,bag);assert(p.equipment[kind].identified);assert(p.equipment[kind].cursed);
  assert.equal(p.equipment[kind].bonus,2);assert(!Object.hasOwn(p.equipment[kind],'x'));
  assert.deepEqual(game.groundItem(),{...old,x:p.x,y:p.y,amount:1,discovered:true});
  const saved=game.serialize();assert.equal(DungeonEngine.restore(saved).serialize(),saved);
  const before=structuredClone(game.items);assert.equal(game.equip('ground'),false);assert.equal(game.turn,1);
  assert.deepEqual(game.items,before);assert.deepEqual(p.bag,bag);
}
{
  const game=arena('weapon'),p=game.player;
  game.items=[{...p.equipment.weapon,x:p.x,y:p.y,amount:1,identified:false}];
  p.equipment.weapon=null;p.weapon=0;p.bag=Array(19).fill('bread');
  assert.equal(game.inventoryCount(),20);assert.equal(game.equip('ground'),false);
  assert.equal(game.turn,0);assert(!game.groundItem().identified);
  p.bag.pop();assert(game.equip('ground'));assert.equal(game.turn,1);assert.equal(game.inventoryCount(),20);
  assert.equal(game.items.length,0);assert(p.equipment.weapon.identified);
}
for(const status of ['dead','won']){
  const game=arena('weapon');game.items=[{...game.player.equipment.weapon,x:game.player.x,y:game.player.y}];game.status=status;
  const before=game.serialize();assert.equal(game.pickup(),false);assert.equal(game.equip('ground'),false);
  assert.equal(game.nameScroll('ground','名前'),false);assert.equal(game.serialize(),before);
}
console.log('PASS: ground actions, wall-arrow recovery in eight directions, stacking/pickup, corners/occupied floor, hit/range consumption, source conservation and exact saves.');
