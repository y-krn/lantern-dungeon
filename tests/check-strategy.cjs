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
{
  const g = arena('bellHammer'), e = enemy(g, 'cobaltBeetle', 11,10);
  g.wait(); assert(g.strategy.charged); replay(g);
  g.traps.push({x:12, y:10, found:false});
  g.attack(); assert(g.traps[0].found, 'A charged hammer pushes onto the trap'); assert(!g.strategy.charged);
  const hp = e.hp; g.face(Math.sign(e.x-g.player.x),Math.sign(e.y-g.player.y)); g.attack(); assert(e.hp < hp, 'Uncharged hammer still attacks');
  g.wait(); g.use(g.player.bag.indexOf('potion')); assert(!g.strategy.charged, 'Another action loses the charge');
}
{
  const g = arena('returnShield'), e = enemy(g, 'frostBat', 13,10);
  e.intent = {x:10,y:10,kind:'ranged'}; const hp = g.player.hp; g.wait();
  assert.equal(g.player.hp,hp); assert(e.hp < e.maxHp, 'Waiting reflects a front projectile');
  assert(!('guarding' in g)); replay(g);
  const h = arena('returnShield');
  const a = enemy(h, 'frostBat', 13,10,0), b = enemy(h, 'frostBat', 10,13,1);
  for (const e of [a,b]) e.intent = {x:10,y:10,kind:'ranged'};
  h.wait(); assert(h.player.hp < 100, 'Another direction still deals damage');
}
{
  const g = arena(); const before = g.serialize();
  assert(!use(g,'lightSeed',{x:15,y:10})); assert.equal(g.serialize(),before,'Invalid targeting preserves RNG, items, turns and knowledge');
  assert(use(g,'lightSeed',{x:13,y:10})); assert.equal(g.strategy.lamp.remaining,5);
  const saved = g.serialize(); assert(!use(g,'lightSeed',{x:12,y:10})); assert.equal(g.serialize(),saved,'Only one light can exist');
  for (let i=0;i<4;i++) g.wait(); assert.equal(g.strategy.lamp.remaining,1);
  const h = replay(g); g.wait(); h.wait(); assert.equal(g.strategy.lamp,null); assert.equal(g.serialize(),h.serialize(),'Expiry has the same timing after restore');
}
{
  const g = arena(); const moth = enemy(g,'lanternMoth',13,12);
  use(g,'lightSeed',{x:13,y:10}); assert(moth.lureUsed,'An alert moth can be distracted');
  assert(moth.lure); const h = replay(g); g.wait(); h.wait(); assert.equal(g.serialize(),h.serialize());
  assert(!moth.lure); g.wait(); assert(moth.lureUsed); assert(!moth.lure,'The same creature cannot be lured repeatedly');
  const food = arena(); food.player.hunger=60; assert(use(food,'bait')); assert.equal(food.player.hunger,75);
  const thrown = arena(), beetle = enemy(thrown,'ironBeetle',13,12);
  assert(use(thrown,'bait',{x:13,y:10},'throw')); assert(beetle.lureUsed); assert.equal(thrown.player.hunger,100);
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
  const g=new StrategyEngine(seed);g.chooseKit(['lampSpear','bellHammer','returnShield'][seed%3]);
  for(let floor=1;floor<=5;floor++){if(floor>1){g.floor=floor;g.generateFloor();}assert.equal(g.enemies.some(e=>e.type==='guardian'),floor===5);replay(g);}
}
assert.deepEqual(Array.from({length:20},(_,i)=>new DungeonEngine(i+1).serialize()),normal,'Even installed trial definitions keep the normal drop and RNG streams unchanged');
console.log('PASS: nine trial items, targeting rollback, spear/corners, charged push/traps, reflection, bait/light lifetime, bind/resistance, fixed intents/friendly fire, floor use at capacity, isolated saves and deterministic replay across 100 generated floors.');
