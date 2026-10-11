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
  const game=new DungeonEngine(9);game.floor=10;game.generateFloor();game.enemies=[];game.items=[];game.traps=[];game.player.x=game.stairs.x;game.player.y=game.stairs.y;game.wait();assert.equal(game.status,'won');
}
{
  const game=new DungeonEngine(9);game.floor=10;game.generateFloor();const guardian=game.enemies.find(e=>e.type==='guardian');game.enemies=[guardian];guardian.x=game.rooms[3].cx;guardian.y=game.rooms[3].cy;game.player.x=game.stairs.x;game.player.y=game.stairs.y;game.wait();assert.equal(game.status,'playing');
}
console.log('PASS: 1,000 generated floors connected; collision, entities, food, hunger, inventory, level-up, save/load, death and victory checked.');
