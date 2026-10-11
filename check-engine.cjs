const assert = require('node:assert/strict');
require('./dist/engine.js');
const {W,H,DIRS}=DungeonData;

function reachable(game,start=game.player){
  const seen=new Set([game.key(start.x,start.y)]),queue=[[start.x,start.y]];
  for(let i=0;i<queue.length;i++)for(const[dx,dy]of DIRS){const[x,y]=queue[i];if(!game.canStep(x,y,dx,dy))continue;const k=game.key(x+dx,y+dy);if(!seen.has(k)){seen.add(k);queue.push([x+dx,y+dy]);}}
  return seen;
}

for(let seed=1;seed<=100;seed++){
  const game=new DungeonEngine(seed);
  for(let floor=1;floor<=10;floor++){
    game.floor=floor;game.generateFloor();
    const visited=reachable(game);
    assert(visited.has(game.key(game.stairs.x,game.stairs.y)),`Unreachable stairs: seed ${seed}, floor ${floor}`);
    for(let k=0;k<W*H;k++)if(game.tiles[k])assert(visited.has(k),`Disconnected floor: ${seed}/${floor}`);
    const positions=new Set();
    for(const e of [...game.enemies,...game.items,...game.traps]){assert(game.tile(e.x,e.y));const k=game.key(e.x,e.y);assert(!positions.has(k));positions.add(k);}
    assert(!positions.has(game.key(game.player.x,game.player.y)));
    assert(game.items.filter(i=>i.kind==='bread').length>=3);
    if(floor===10)assert(game.enemies.some(e=>e.type==='guardian'));
  }
}
{
  const game=new DungeonEngine(42),p=game.player;
  game.enemies=[];p.x=game.rooms[0].x;p.y=game.rooms[0].y;
  assert.equal(game.move(-1,0),false);assert.equal(game.turn,0);
  game.wait();assert.equal(game.turn,1);
  p.hunger=0;const hp=p.hp;game.wait();assert.equal(p.hp,hp-1);
  p.bag=['bread'];game.use(0);assert.equal(p.hunger,50);assert.equal(p.bag.length,0);
  p.hp=1;p.bag=['potion'];game.use(0);assert.equal(p.hp,26);
  p.bag=['map'];game.use(0);assert(game.seen.every(Boolean));
  const restored=DungeonEngine.restore(game.serialize());assert(restored);assert.equal(restored.turn,game.turn);assert.deepEqual(restored.player,game.player);
  assert.equal(DungeonEngine.restore('broken'),null);
  game.player.x=game.stairs.x;game.player.y=game.stairs.y;assert(game.descend());assert.equal(game.floor,2);
}
{
  const game=new DungeonEngine(11),p=game.player;game.enemies=[];game.items=[];game.traps=[];
  const e={x:p.x+1,y:p.y,id:1,type:'slime',name:'苔スライム',hp:1,maxHp:1,attack:3,exp:8};game.enemies.push(e);
  const turn=game.turn;game.move(1,0);assert.equal(game.turn,turn+1);assert.equal(p.level,2);assert.equal(p.x,game.rooms[0].cx);assert.equal(game.enemies.length,0);
  p.hp=1;p.hunger=0;game.wait();assert.equal(game.status,'dead');assert.equal(p.hp,0);assert.equal(game.wait(),false);
}
{
  const game=new DungeonEngine(33);game.enemies=[];game.items=[];game.traps=[{x:game.player.x+1,y:game.player.y,found:false,spent:false}];game.turn=6;game.player.hp=1;
  game.move(1,0);assert.equal(game.status,'dead','Fatal trap cannot be reversed by passive regeneration');
}
{
  const game=new DungeonEngine(22),p=game.player;game.enemies=[];game.items=[];game.traps=[];
  // A diagonal destination alone is insufficient: both orthogonal sides must be open.
  game.tiles[game.key(p.x+1,p.y)]=0;assert.equal(game.move(1,1),false);assert.equal(game.turn,0);
  game.tiles[game.key(p.x+1,p.y)]=1;
  const enemy={x:p.x+2,y:p.y,id:1,type:'slime',name:'苔スライム',hp:30,maxHp:30,attack:1,exp:1};game.enemies=[enemy];game.reveal();p.facing=[1,0];p.bag=['arrow'];game.use(0);assert.equal(enemy.hp,18);assert.equal(game.turn,1);
  p.bag=['scroll'];game.use(0);assert.equal(game.enemies.length,0);
}
{
  const game=new DungeonEngine(22),p=game.player;game.enemies=[];game.items=[];game.traps=[];
  p.bag=['potion','arrow','bread','arrow','potion','arrow'];
  assert.deepEqual(game.inventoryEntries(),[{kind:'bread',index:2,count:1},{kind:'potion',index:0,count:1},{kind:'potion',index:4,count:1},{kind:'arrow',index:1,count:3}]);
  assert.equal(game.shoot(),false);assert.equal(game.turn,0);
  assert(game.equipArrow());assert.equal(p.ammo,'arrow');assert.equal(game.arrowCount(),3);assert.equal(game.turn,1);assert.equal(p.weapon,0);assert.equal(p.shield,0);
  const restored=DungeonEngine.restore(game.serialize());assert(restored);assert.deepEqual(restored.player,p);assert.equal(restored.arrowCount(),3);
  assert(game.equipArrow());assert.equal(p.ammo,null);assert.equal(game.arrowCount(),3);assert.equal(game.shoot(),false);
  assert(game.equipArrow());p.facing=[1,0];
  const enemy={x:p.x+2,y:p.y,id:1,type:'slime',name:'苔スライム',hp:30,maxHp:30,attack:1,exp:1};game.enemies=[enemy];game.reveal();
  const turn=game.turn;assert(game.shoot());assert.equal(enemy.hp,18);assert.equal(game.arrowCount(),2);assert.equal(p.ammo,'arrow');assert.equal(game.turn,turn+1);
  game.enemies=[];assert(game.shoot());assert(game.shoot());assert.equal(p.ammo,null);assert.equal(game.arrowCount(),0);assert.equal(game.inventoryEntries().length,3);
  const emptyTurn=game.turn;assert.equal(game.shoot(),false);assert.equal(game.equipArrow(),false);assert.equal(game.turn,emptyTurn);
  const legacy=JSON.parse(game.serialize());delete legacy.state.player.ammo;legacy.state.player.bag=['arrow','bread','arrow'];
  const migrated=DungeonEngine.restore(JSON.stringify(legacy));assert(migrated);assert.equal(migrated.player.ammo,null);assert.equal(migrated.inventoryEntries().length,2);assert.equal(migrated.arrowCount(),2);
  legacy.state.player.ammo='potion';assert.equal(DungeonEngine.restore(JSON.stringify(legacy)),null);
  game.status='dead';p.bag=['arrow'];assert.equal(game.equipArrow(),false);p.ammo='arrow';assert.equal(game.shoot(),false);assert.equal(game.arrowCount(),1);
}
{
  const game=new DungeonEngine(22),p=game.player;game.enemies=[];game.items=[];game.traps=[];
  p.bag=['map','arrow','potion','scroll','bread','potion','arrow','bread'];p.hunger=20;p.hp=5;
  const bag=[...p.bag],saved=game.serialize();
  assert.deepEqual(game.inventoryEntries(),[
    {kind:'bread',index:4,count:1},{kind:'bread',index:7,count:1},
    {kind:'potion',index:2,count:1},{kind:'potion',index:5,count:1},
    {kind:'scroll',index:3,count:1},{kind:'map',index:0,count:1},{kind:'arrow',index:1,count:2}
  ]);
  assert.deepEqual(p.bag,bag);assert.equal(game.serialize(),saved);assert.equal(game.turn,0);
  const restored=DungeonEngine.restore(saved);assert(restored);assert.deepEqual(restored.inventoryEntries(),game.inventoryEntries());
  assert(game.use(game.inventoryEntries()[0].index));assert.equal(p.hunger,70);assert.equal(p.hp,5);
  assert.deepEqual(p.bag,['map','arrow','potion','scroll','potion','arrow','bread']);
  assert(game.use(game.inventoryEntries().find(e=>e.kind==='potion').index));assert.equal(p.hp,30);assert.equal(p.hunger,70);
  game.items=[{x:p.x,y:p.y,kind:'bread',amount:1}];game.collect();
  assert.deepEqual(game.inventoryEntries().map(e=>e.kind),['bread','bread','potion','scroll','map','arrow']);
  p.bag=[];assert.deepEqual(game.inventoryEntries(),[]);
}
{
  const game=new DungeonEngine(22),p=game.player;game.enemies=[];game.traps=[];
  p.bag=Array(15).fill('bread');p.bag.push('arrow');
  game.items=[{x:p.x,y:p.y,kind:'arrow',amount:1}];game.collect();assert.equal(game.arrowCount(),2);assert.equal(game.inventoryEntries().length,16);assert.equal(game.items.length,0);
  game.items=[{x:p.x,y:p.y,kind:'potion',amount:1}];game.collect();assert.equal(game.items.length,1);assert.equal(p.bag.includes('potion'),false);
  p.bag=Array(16).fill('bread');game.items=[{x:p.x,y:p.y,kind:'arrow',amount:1}];game.collect();assert.equal(game.items.length,1);assert.equal(game.arrowCount(),0);
}
{
  const game=new DungeonEngine(9);game.floor=10;game.generateFloor();game.enemies=[];game.items=[];game.traps=[];game.player.x=game.stairs.x;game.player.y=game.stairs.y;game.wait();assert.equal(game.status,'won');
}
{
  const game=new DungeonEngine(9);game.floor=10;game.generateFloor();const guardian=game.enemies.find(e=>e.type==='guardian');game.enemies=[guardian];guardian.x=game.rooms[3].cx;guardian.y=game.rooms[3].cy;game.player.x=game.stairs.x;game.player.y=game.stairs.y;game.wait();assert.equal(game.status,'playing');
}
console.log('PASS: 1,000 generated floors connected; collision, entities, food, hunger, inventory, arrow stacking/equipment, level-up, save/load, death and victory checked.');
