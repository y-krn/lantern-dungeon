const assert = require('node:assert/strict');
require('../dist/engine.js');
const normal = Array.from({length: 20}, (_, i) => new DungeonEngine(i + 1).serialize());
const StrategyEngine = require('../dist/strategy.js');
assert.deepEqual(Array.from({length: 20}, (_, i) => new DungeonEngine(i + 1).serialize()), normal, 'Loading the trial must not install definitions or change normal runs');
function arena(variant = 'lampSpear') {
  const g = new StrategyEngine(73); g.chooseKit(variant);
  g.tiles.fill(1); g.rooms[0] = {x:2, y:2, w:25, h:20, cx:14, cy:12};
  g.enemies = []; g.items = []; g.traps = []; g.monsterHouse = null; g.effects = [];
  Object.assign(g.player, {x:10, y:10, hp:100, maxHp:100, facing:[1,0]});
  g.stairs = {x:25, y:20}; g.reveal(); return g;
}
function enemy(g, species, x, y, id = g.enemies.length) {
  const e = {...DungeonData.monsterStats(species), hp:DungeonData.MONSTERS[species].hp, x, y, id, awake:true};
  g.enemies.push(e); g.reveal(); return e;
}
function use(g, kind, target, mode) { return g.use(g.player.bag.indexOf(kind), target, mode); }
function replay(g) {
  const restored = StrategyEngine.restore(g.serialize()); assert(restored, 'Valid trial save must restore');
  assert.equal(restored.serialize(), g.serialize()); return restored;
}
{
  const g = arena(); const e = enemy(g, 'frostBat', 12, 10);
  g.attack(); assert(e.hp < e.maxHp, 'Spear hits two cells away');
  const h = arena(); const front = enemy(h, 'ironBeetle', 11, 10), back = enemy(h, 'frostBat', 12, 10);
  h.attack(); assert(front.hp < front.maxHp); assert.equal(back.hp, back.maxHp, 'Spear cannot hit through an enemy');
  const corner = arena(); corner.tiles[corner.key(11,10)] = 0; corner.player.facing = [1,1];
  const hidden = enemy(corner, 'frostBat', 12, 12); corner.attack(); assert.equal(hidden.hp, hidden.maxHp, 'Spear cannot cut a blocked diagonal corner');
}
// Direction input must use exactly the same attack, turn and RNG as the attack button.
for (const [dx, dy] of DungeonData.DIRS) {
  const g = arena(); g.player.facing = [-dx,-dy];
  enemy(g,'ironBeetle',10+dx*2,10+dy*2);
  const h = replay(g), origin = {x:g.player.x,y:g.player.y}, turn = g.turn;
  assert(g.move(dx,dy)); h.face(dx,dy); assert(h.attack());
  assert.deepEqual({x:g.player.x,y:g.player.y},origin,'A spear thrust does not step forward');
  assert.equal(g.turn,turn+1); assert(g.enemies[0].hp < g.enemies[0].maxHp);
  assert.equal(g.serialize(),h.serialize(),'Directional and explicit thrusts have identical results');
}
{
  const g = arena(), front = enemy(g,'ironBeetle',11,10), back = enemy(g,'ironBeetle',12,10);
  assert(g.move(1,0)); assert(front.hp < front.maxHp); assert.equal(back.hp,back.maxHp);
  const corner = arena(); corner.tiles[corner.key(11,10)] = 0; enemy(corner,'frostBat',12,12);
  const blocked = corner.serialize(); assert(!corner.move(1,1)); assert.equal(corner.serialize(),blocked);
  const distantWall = arena(); distantWall.tiles[distantWall.key(12,10)] = 0;
  const hidden = enemy(distantWall,'frostBat',13,10); assert(distantWall.move(1,0));
  assert.equal(distantWall.player.x,11); assert.equal(hidden.hp,hidden.maxHp,'A wall blocks the spear');
  const far = arena(), distant = enemy(far,'ironBeetle',13,10);
  assert(far.move(1,0)); assert.equal(far.player.x,11); assert.equal(distant.hp,distant.maxHp,'Out of range means movement only');
  const empty = arena(); assert(empty.move(1,0)); assert.equal(empty.player.x,11); assert.equal(empty.turn,1);
  const facing = arena(), target = enemy(facing,'ironBeetle',10,8), turn = facing.turn, rng = facing.rng;
  assert(facing.face(0,-1)); assert.equal(facing.turn,turn); assert.equal(facing.rng,rng); assert.equal(target.hp,target.maxHp);
  const ordinary = arena('none'), ordinaryEnemy = enemy(ordinary,'ironBeetle',12,10);
  assert(ordinary.move(1,0)); assert.equal(ordinary.player.x,11); assert.equal(ordinaryEnemy.hp,ordinaryEnemy.maxHp,'Other weapons still require adjacent contact');
  const bound = arena(), boundEnemy = enemy(bound,'ironBeetle',12,10); bound.player.bindUntil=bound.turn+2;
  assert(bound.move(1,0)); assert.equal(bound.player.x,10); assert(boundEnemy.hp < boundEnemy.maxHp,'A bind restricts movement, not ranged melee');
  const invalid = arena(); const saved = invalid.serialize();
  for (const d of [[0,0],[2,0],[NaN,1]]) { assert(!invalid.move(...d)); assert.equal(invalid.serialize(),saved); }
  const unchosen = new StrategyEngine(73), unchosenSave=unchosen.serialize();
  assert(!unchosen.move(1,0)); assert(!unchosen.wait()); assert.equal(unchosen.serialize(),unchosenSave);
}
{
  for (const kind of ['bellHammer','returnShield']) {
    const g = new StrategyEngine(73), before = g.serialize();
    assert(!g.chooseKit(kind)); assert.equal(g.serialize(),before,'Retired equipment cannot be selected');
    assert(!Object.hasOwn(DungeonData.EQUIPMENT,kind),'Retired equipment is no longer installed');
  }
  const g = arena(), old=JSON.parse(g.serialize());
  const hammer={kind:'weapon',variant:'bellHammer',rank:0,bonus:2,cursed:true,identified:true};
  const shield={kind:'shield',variant:'returnShield',rank:0,bonus:-1,cursed:false,identified:true};
  old.state.player.equipment={weapon:hammer,shield};old.state.player.weapon=0;old.state.player.shield=0;
  old.state.player.bag=[{...hammer,cursed:false,identified:false}];
  old.state.items=[{...shield,identified:false,x:12,y:10,amount:1,discovered:true}];old.state.strategy.charged=true;
  const h=StrategyEngine.restore(JSON.stringify(old));assert(h);
  assert.deepEqual(h.player.equipment.weapon,{...hammer,variant:'lampSpear'});
  assert.deepEqual(h.player.equipment.shield,{...shield,variant:'travelerShield'});
  assert.deepEqual(h.player.bag[0],{...old.state.player.bag[0],variant:'lampSpear'});
  assert.deepEqual(h.items[0],{...old.state.items[0],variant:'travelerShield'});
  assert(!Object.hasOwn(h.strategy,'charged'));replay(h);
  const e=enemy(h,'frostBat',13,10);e.intent={x:10,y:10,kind:'ranged'};
  const hp=h.player.hp;h.wait();assert(h.player.hp<hp);assert.equal(e.hp,e.maxHp,'Waiting no longer reflects shots');
  old.state.strategy.charged='yes';assert.equal(StrategyEngine.restore(JSON.stringify(old)),null);
  old.state.strategy.charged=false;old.state.player.equipment.weapon.kind='shield';
  assert.equal(StrategyEngine.restore(JSON.stringify(old)),null,'Migration must not accept equipment in the wrong slot');
}
{
  const g = arena(); const before = g.serialize();
  assert(!use(g,'lightSeed',{x:15,y:10})); assert.equal(g.serialize(),before,'Invalid targeting preserves RNG, items, turns and knowledge');
  assert(use(g,'lightSeed',{x:13,y:10})); assert.equal(g.strategy.lamp.remaining,5);
  const saved = g.serialize(); assert(!use(g,'lightSeed',{x:12,y:10})); assert.equal(g.serialize(),saved,'Only one light can exist');
  for (let i=0;i<4;i++) g.wait(); assert.equal(g.strategy.lamp.remaining,1);
  const h = replay(g); g.wait(); h.wait(); assert.equal(g.strategy.lamp,null); assert.equal(g.serialize(),h.serialize(),'Expiry has the same timing after restore');
}
// Lamps and food never redirect ordinary pursuit.
for (const species of ['lanternMoth','eclipseMoth','mossSlime','amberSlime','ironBeetle','cobaltBeetle']) {
  const g=arena(), e=enemy(g,species,13,12), control=replay(g);
  assert(use(g,'lightSeed',{x:13,y:10})); control.wait();
  assert.deepEqual(g.enemies,control.enemies,'A lamp must not affect any species movement or intent');
  assert.equal(g.rng,control.rng,'A lamp must not consume extra pursuit RNG');
  assert(!Object.hasOwn(e,'lure'));assert(!Object.hasOwn(e,'lureUsed'));replay(g);
}
{
  const food=arena();food.player.hunger=60;assert(use(food,'bait'));assert.equal(food.player.hunger,75);
  const thrown=arena(), before=thrown.serialize();
  assert(!thrown.requiresAim(thrown.player.bag.indexOf('bait'),'throw'));
  assert(!use(thrown,'bait',{x:13,y:10},'throw'));assert.equal(thrown.serialize(),before,'Rejected throwing preserves food, turns and RNG');
  thrown.items=[{kind:'bait',amount:1,x:10,y:10}];const ground=thrown.serialize();
  assert(!thrown.use('ground',{x:13,y:10},'throw'));assert.equal(thrown.serialize(),ground);
  thrown.player.hunger=50;assert(thrown.useGround());assert.equal(thrown.player.hunger,65);assert.equal(thrown.items.length,0);
  const old=JSON.parse(arena().serialize());
  old.state.strategy.lamp={x:13,y:10,remaining:4};old.state.strategy.bait={x:12,y:11,remaining:3};
  old.state.enemies=[{...DungeonData.monsterStats('lanternMoth'),hp:12,x:13,y:12,id:0,awake:true,lureUsed:true,lure:{kind:'lamp',remaining:2}},{...DungeonData.monsterStats('frostBat'),hp:DungeonData.MONSTERS.frostBat.hp,x:10,y:13,id:1,awake:true,intent:{x:10,y:10,kind:'ranged'}}];
  const migrated=StrategyEngine.restore(JSON.stringify(old));assert(migrated);
  assert(!Object.hasOwn(migrated.strategy,'bait'));assert(!Object.hasOwn(migrated.enemies[0],'lure'));assert(!Object.hasOwn(migrated.enemies[0],'lureUsed'));
  assert.deepEqual(migrated.strategy.lamp,old.state.strategy.lamp);assert.deepEqual(migrated.enemies[1].intent,old.state.enemies[1].intent);replay(migrated);
  old.state.strategy.bait.remaining=-1;assert.equal(StrategyEngine.restore(JSON.stringify(old)),null,'Corrupt legacy bait is rejected before removal');
  old.state.strategy.bait.remaining=3;old.state.enemies[0].lure.remaining=9;assert.equal(StrategyEngine.restore(JSON.stringify(old)),null);
}
{
  const g = arena(); use(g,'vineSeed'); assert.equal(g.strategy.vines.length,1); assert(!g.player.bindUntil,'Placing a vine does not immediately bind its owner');
  g.move(1,0); const e = enemy(g,'ironBeetle',9,10); const hp = g.player.hp;
  assert(use(g,'pullTalisman',{x:9,y:10})); assert.equal(g.strategy.vines.length,0); assert(g.player.hp < hp,'A bound adjacent enemy can still attack');
  assert(e.resistUntil > g.turn,'A freed enemy temporarily resists another bind'); replay(g);
  const player = arena(); use(player,'vineSeed'); player.move(1,0); player.move(-1,0);
  const before = player.serialize(); assert(!player.move(1,0)); assert.equal(player.serialize(),before,'A failed bound movement costs nothing');
  player.wait(); assert(player.move(1,0),'Waiting out a bind permits movement again');
}
{
  const g=arena();g.tiles.fill(0);for(let x=2;x<=25;x++)g.tiles[g.key(x,10)]=1;
  g.stairs={x:25,y:10};g.strategy.vines=[{x:12,y:10}];g.traps=[{x:12,y:10,found:false}];
  const fast=enemy(g,'caveBat',13,10);g.wait();
  assert.equal(fast.x,12,'A vine stops the remainder of a fast enemy movement');assert(fast.hp<fast.maxHp);assert(g.traps[0].found);
  g.wait();assert.equal(fast.x,12,'The next movement is also bound');
  g.wait();assert.equal(fast.x,11,'Ordinary pursuit resumes after the bind');
}
{
  const g = arena(); g.items=[{x:14,y:10,kind:'potion',amount:1}];
  assert(use(g,'pullTalisman',{x:14,y:10})); assert.equal(g.items[0].x,12); assert.equal(g.items[0].kind,'potion');
  const h = arena(), shooter = enemy(h,'frostBat',10,13,0), target = enemy(h,'ironBeetle',12,10,1);
  shooter.intent={x:10,y:10,kind:'ranged'};
  assert(use(h,'swapTalisman',{x:12,y:10})); assert.equal(h.player.x,12); assert.equal(h.player.y,10);
  assert(target.hp < target.maxHp,'The original telegraphed tile can hit the swapped enemy'); assert.equal(h.player.hp,100); replay(h);
  const masked = arena(); enemy(masked,'coinMimic',13,10);
  const plan = masked.previewUse(masked.player.bag.indexOf('pullTalisman'),{x:13,y:10});
  assert(plan && !plan.label.includes('ミミック'),'Target selection cannot disclose a mimic');
}
{
  const g = arena(); use(g,'lightSeed',{x:13,y:10});
  const e = enemy(g,'ironBeetle',13,10); const blocked = g.serialize();
  assert(!use(g,'returnTalisman')); assert.equal(g.serialize(),blocked,'An occupied anchor cannot consume the return talisman');
  g.enemies=[]; g.traps=[{x:13,y:10,found:false}];
  assert(use(g,'returnTalisman')); assert.equal(g.player.x,13); assert.equal(g.strategy.lamp,null); assert(g.player.hp<100); assert(g.traps[0].found);
  g.strategy.vines=[{x:12,y:10}]; g.strategy.lamp={x:13,y:11,remaining:5}; g.player.x=g.stairs.x;g.player.y=g.stairs.y;
  assert(g.descend()); assert.equal(g.strategy.lamp,null); assert.equal(g.strategy.vines.length,0); replay(g);
}
{
  const g = arena(); g.player.bag=Array(18).fill('bread');
  assert.equal(g.inventoryCount(),20); g.items=[{x:10,y:10,kind:'lightSeed',amount:1}];
  assert(g.useGround({x:13,y:10})); assert.equal(g.inventoryCount(),20); assert.equal(g.items.length,0,'A full bag can use a targeted floor item directly');
  assert.equal(DungeonEngine.restore(g.serialize()),null,'Normal games reject the trial save version');
  assert.equal(StrategyEngine.restore(normal[0]),null,'Trials reject normal saves');
  const broken=JSON.parse(g.serialize()); broken.state.strategy.lamp.remaining=-1;
  assert.equal(StrategyEngine.restore(JSON.stringify(broken)),null,'Invalid lifetime must not silently restore');
  const restored=replay(g); g.wait(); restored.wait(); assert.equal(g.serialize(),restored.serialize());
}
for (let seed=1;seed<=20;seed++) {
  const g=new StrategyEngine(seed);g.chooseKit(seed%2 ? 'lampSpear' : 'none');
  for(let floor=1;floor<=5;floor++){if(floor>1){g.floor=floor;g.generateFloor();}assert.equal(g.enemies.some(e=>e.type==='guardian'),floor===5);replay(g);}
}
assert.deepEqual(Array.from({length:20},(_,i)=>new DungeonEngine(i+1).serialize()),normal,'Even installed trial definitions keep the normal drop and RNG streams unchanged');
console.log('PASS: seven trial items, directional/explicit spear parity in eight directions, corners/range/binds, retired-gear migration, targeting rollback, no lure AI, food-only dumplings, legacy lure cleanup, light lifetime, bind/resistance, fixed intents/friendly fire, floor use at capacity, isolated saves and deterministic replay across 100 generated floors.');
