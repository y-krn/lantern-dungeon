const assert = require('node:assert/strict');
require('./dist/engine.js');
require('./check-traits.cjs');
const {W,H,DIRS,ITEMS}=DungeonData;

// A species keeps its identity and combat stats across both dungeons and saves.
{
  const {MONSTERS}=DungeonData,encountered=new Set(),statsByName=new Map();
  for(const dungeon of ['tutorial','depths'])for(let seed=1;seed<=100;seed++){
    const game=new DungeonEngine(seed,dungeon,true);
    for(let floor=1;floor<=game.maxFloor();floor++){
      game.floor=floor;game.generateFloor();
      for(const e of game.enemies){
        const m=MONSTERS[e.species];assert(m);encountered.add(e.species);
        const stats=[e.maxHp,e.attack,e.exp];
        if(statsByName.has(e.name))assert.deepEqual(stats,statsByName.get(e.name));else statsByName.set(e.name,stats);
        assert.equal(e.name,m.name);assert.equal(e.type,m.type);assert.equal(e.hp,m.hp);
      }
      const raw=game.serialize(),restored=DungeonEngine.restore(raw);assert(restored);assert.equal(restored.serialize(),raw);
    }
  }
  assert.deepEqual([...encountered].sort(),Object.keys(MONSTERS).sort());
  for(const dungeon of ['tutorial','depths']){
    const game=new DungeonEngine(71,dungeon,true);game.floor=dungeon==='tutorial'?5:30;game.generateFloor();
    const saved=JSON.parse(game.serialize()),legacyIndex=saved.state.enemies.findIndex(e=>e.type==='bat');assert(legacyIndex>=0);
    // Use a legacy enemy family explicitly; new random rolls may change the first modern species.
    [saved.state.enemies[0],saved.state.enemies[legacyIndex]]=[saved.state.enemies[legacyIndex],saved.state.enemies[0]];
    const legacy=saved.state.enemies[0];
    const species=legacy.species;delete legacy.species;
    legacy.name=legacy.type==='slime'?'苔スライム':legacy.type==='bat'?'洞窟コウモリ':'灯りの亡霊';
    legacy.maxHp+=4;legacy.hp=legacy.maxHp-5;legacy.attack+=2;
    const restored=DungeonEngine.restore(JSON.stringify(saved));assert(restored);
    assert.equal(restored.enemies[0].species,species);assert.equal(restored.enemies[0].hp,MONSTERS[species].hp-5);
    const again=restored.serialize();assert.equal(DungeonEngine.restore(again).serialize(),again);
    legacy.hp=0;assert.equal(DungeonEngine.restore(JSON.stringify(saved)).enemies[0].hp,0);
    legacy.hp=1;assert.equal(DungeonEngine.restore(JSON.stringify(saved)).enemies[0].hp,1);
    legacy.species='unknown';assert.equal(DungeonEngine.restore(JSON.stringify(saved)),null);
  }
  console.log('PASS: all 25 species encountered in 4,000 floors; same-name stats fixed across dungeons; exact save round-trip and damaged/dead legacy migration checked.');
}

{
  const game=new DungeonEngine(42),p=game.player;
  p.hunger=0;p.hp=1;game.turn=27;
  game.items=[{x:p.x,y:p.y,kind:'bread',amount:1}];
  game.traps=[{x:p.x,y:p.y,found:false,spent:false}];
  game.enemies=[{x:p.x+1,y:p.y,id:1,type:'slime',hp:30,maxHp:30,attack:3,awake:true}];
  game.tiles[game.key(p.x-1,p.y)]=0;game.reveal();
  for(const[dx,dy]of DIRS){
    const expected=JSON.parse(game.serialize());expected.state.player.facing=[dx,dy];
    assert(game.face(dx,dy));
    assert.deepEqual(JSON.parse(game.serialize()),expected,'Facing changes no other game state, even beside walls, enemies, items and traps');
    assert.deepEqual(DungeonEngine.restore(game.serialize()).player.facing,[dx,dy]);
  }
  for(const direction of [[0,0],[2,0],[0,-2],[NaN,1],['1',0]]){
    const saved=game.serialize();assert.equal(game.face(...direction),false);assert.equal(game.serialize(),saved);
  }
  for(const status of ['dead','won']){
    game.status=status;const saved=game.serialize();assert.equal(game.face(0,-1),false);assert.equal(game.serialize(),saved);
  }
}
for(const[dx,dy]of DIRS){
  for(const action of ['attack','shoot']){
    const game=new DungeonEngine(42),p=game.player,start={x:p.x,y:p.y};
    game.items=[];game.traps=[];
    for(let y=p.y-2;y<=p.y+2;y++)for(let x=p.x-2;x<=p.x+2;x++)game.tiles[game.key(x,y)]=1;
    const distance=action==='shoot'?2:1;
    const target={x:p.x+dx*distance,y:p.y+dy*distance,id:1,type:'slime',name:'苔スライム',hp:100,maxHp:100,attack:1,exp:1};
    game.enemies=[target];p.bag=['arrow'];p.ammo='arrow';game.reveal();
    assert(game.face(dx,dy));assert.equal(game.turn,0);assert(game[action]());
    assert(target.hp<100,`${action} follows facing ${dx},${dy}`);
    assert.deepEqual({x:p.x,y:p.y},start);assert.equal(game.turn,1);
    if(action==='shoot'){assert.equal(target.hp,88);assert.equal(game.arrowCount(),0);}
  }
}

console.log('PASS: eight facing directions change no other state; invalid/end-state input rejected; saved facing and aimed attacks/shots checked.');

function reachable(game,start=game.player){
  const seen=new Set([game.key(start.x,start.y)]),queue=[[start.x,start.y]];
  for(let i=0;i<queue.length;i++)for(const[dx,dy]of DIRS){const[x,y]=queue[i];if(!game.canStep(x,y,dx,dy))continue;const k=game.key(x+dx,y+dy);if(!seen.has(k)){seen.add(k);queue.push([x+dx,y+dy]);}}
  return seen;
}

{
  const game=new DungeonEngine(42),p=game.player;
  game.tiles.fill(0);game.visible.fill(false);game.items=[];game.traps=[];game.monsterHouse=null;
  game.rooms[0]={x:2,y:2,w:3,h:3,cx:3,cy:3};
  game.rooms[1]={x:25,y:10,w:3,h:3,cx:26,cy:11};
  for(const r of game.rooms.slice(0,2))for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++)game.tiles[game.key(x,y)]=1;
  for(let x=5;x<=26;x++)game.tiles[game.key(x,3)]=1;
  for(let y=3;y<10;y++)game.tiles[game.key(26,y)]=1;
  p.x=3;p.y=3;
  const enemy={x:26,y:11,id:1,type:'slime',name:'苔スライム',hp:30,maxHp:30,attack:3,exp:1,awake:true};
  game.enemies=[enemy];
  // Chase out of a room, around a bend, and into another room over 15 steps away.
  let crossedCorridor=false,turned=false;
  for(let turn=0;turn<40&&Math.max(Math.abs(enemy.x-p.x),Math.abs(enemy.y-p.y))>1;turn++){
    const before=[enemy.x,enemy.y];game.wait();
    assert(game.canStep(...before,enemy.x-before[0],enemy.y-before[1]));
    assert.notDeepEqual([enemy.x,enemy.y],before,'Long corridor pursuit must not stall');
    crossedCorridor||=!game.roomAt(enemy.x,enemy.y);turned||=enemy.y===3&&enemy.x<26;
  }
  assert(crossedCorridor&&turned);assert.equal(Math.max(Math.abs(enemy.x-p.x),Math.abs(enemy.y-p.y)),1);
  const hp=p.hp,position=[enemy.x,enemy.y];game.wait();assert(p.hp<hp);assert.deepEqual([enemy.x,enemy.y],position);

  // Unalerted patrols move every turn and keep going around corridor corners.
  enemy.x=20;enemy.y=3;enemy.awake=false;enemy.direction=[1,0];game.visible.fill(false);
  for(let x=21;x<=26;x++){game.enemyTurn();assert.deepEqual([enemy.x,enemy.y],[x,3]);}
  for(let y=4;y<=10;y++){game.enemyTurn();assert.deepEqual([enemy.x,enemy.y],[26,y]);}
  assert.equal(enemy.awake,false);assert.equal(game.roomAt(enemy.x,enemy.y),game.rooms[1]);
  const restored=DungeonEngine.restore(game.serialize());assert(restored);assert.deepEqual(restored.enemies[0].direction,[0,1]);

  // Patrols turn back at dead ends and still move when no path reaches the player.
  for(let x=10;x<=14;x++)game.tiles[game.key(x,20)]=1;
  enemy.x=14;enemy.y=20;enemy.direction=[1,0];enemy.awake=true;
  game.enemyTurn();assert.deepEqual([enemy.x,enemy.y],[13,20]);assert.deepEqual(enemy.direction,[-1,0]);
  const blocker={...enemy,id:2,x:12};game.enemies.push(blocker);
  game.enemyTurn();assert.deepEqual([enemy.x,enemy.y],[14,20]);assert.notDeepEqual([enemy.x,enemy.y],[blocker.x,blocker.y]);
  // A diagonal target across closed corners permits neither movement nor attack.
  game.tiles.fill(0);game.tiles[game.key(14,20)]=1;game.tiles[game.key(13,21)]=1;
  game.enemies=[enemy];p.x=13;p.y=21;const cornerHp=p.hp;
  game.enemyTurn();assert.equal(p.hp,cornerHp);assert.deepEqual([enemy.x,enemy.y],[14,20]);
}
console.log('PASS: monsters patrol and chase through long bent corridors; room entry/exit, dead ends, blocked paths, corners, adjacent attacks and saved direction checked.');

function roomAt(game,p){return game.rooms.find(r=>p.x>=r.x&&p.y>=r.y&&p.x<r.x+r.w&&p.y<r.y+r.h);}
function entranceCells(game){
  const entrances=new Set();
  // Enumerate legal moves from corridors into rooms, including diagonals.
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(game.tile(x,y)&&!roomAt(game,{x,y})){
    for(const[dx,dy]of DIRS)if(game.canStep(x,y,dx,dy)&&roomAt(game,{x:x+dx,y:y+dy}))entrances.add(game.key(x+dx,y+dy));
  }
  return entrances;
}
function arena(seed){
  const game=new DungeonEngine(seed),r=roomAt(game,game.player);
  game.player.x=r.cx;game.player.y=r.cy;game.enemies=[];game.items=[];game.traps=[];game.reveal();return game;
}
function passageTopology(game){
  // Contract each room to one node so its open floor does not count as a loop.
  const nodes=Array(W*H).fill(-1),neighbors=game.rooms.map(()=>new Set());
  game.rooms.forEach((r,i)=>{for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++)nodes[game.key(x,y)]=i;});
  for(let k=0;k<W*H;k++)if(game.tiles[k]&&nodes[k]===-1){nodes[k]=neighbors.length;neighbors.push(new Set());}
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(game.tile(x,y))for(const[dx,dy]of [[1,0],[0,1]]){
    if(!game.tile(x+dx,y+dy))continue;
    const a=nodes[game.key(x,y)],b=nodes[game.key(x+dx,y+dy)];
    if(a!==b){neighbors[a].add(b);neighbors[b].add(a);}
  }
  const edges=neighbors.reduce((n,s)=>n+s.size,0)/2;
  return {loops:edges-neighbors.length+1,deadEnds:neighbors.slice(0,game.rooms.length).filter(s=>s.size===1).length,branches:neighbors.filter(s=>s.size>=3).length,roomDegrees:neighbors.slice(0,game.rooms.length).map(s=>s.size)};
}
function stairDistance(game){
  const distance=new Map([[game.key(game.player.x,game.player.y),0]]),queue=[[game.player.x,game.player.y]];
  for(let i=0;i<queue.length;i++){
    const[x,y]=queue[i],d=distance.get(game.key(x,y));if(x===game.stairs.x&&y===game.stairs.y)return d;
    for(const[dx,dy]of DIRS)if(game.canStep(x,y,dx,dy)){
      const k=game.key(x+dx,y+dy);if(!distance.has(k)){distance.set(k,d+1);queue.push([x+dx,y+dy]);}
    }
  }
  return Infinity;
}
const roomCounts=new Set(),startCells=new Set(),exitCells=new Set(),savedFloors=new Map();
const layouts={branch:0,ring:0,hall:0};
let shallowHalls=0,deepHalls=0,lootHits=0,uniformLootHits=0,emptyDeadEnds=0,houseFloors=0,houseSave;
let loopFloors=0,treeFloors=0,branchFloors=0,deadEndFloors=0,nearStairs=0,minWalk=Infinity,maxWalk=0,offCenterStarts=0;
for(let seed=1;seed<=100;seed++){
  const game=new DungeonEngine(seed);
  for(let floor=1;floor<=10;floor++){
    const previousLayout=game.layout;game.floor=floor;game.generateFloor();assert.notEqual(game.layout,previousLayout);
    layouts[game.layout]++;assert(game.layoutName());
    if(game.layout==='hall'){
      assert.equal(game.rooms.filter(r=>r.w>=16&&r.h>=10).length,1);
      if(floor<=3)shallowHalls++;if(floor>=7)deepHalls++;
    }else if(game.layout==='branch'){assert(game.rooms.length>=6);assert(game.rooms.every(r=>r.w<=8&&r.h<=6));}
    const startRoom=roomAt(game,game.player),exitRoom=roomAt(game,game.stairs);
    assert(game.rooms.length>=4&&game.rooms.length<=8);assert(startRoom);assert(exitRoom);assert.notEqual(startRoom,exitRoom);
    roomCounts.add(game.rooms.length);startCells.add(Math.floor(startRoom.x/14)+3*Math.floor(startRoom.y/9));exitCells.add(Math.floor(exitRoom.x/14)+3*Math.floor(exitRoom.y/9));
    if(game.player.x!==startRoom.cx||game.player.y!==startRoom.cy)offCenterStarts++;
    if(!savedFloors.has(game.rooms.length))savedFloors.set(game.rooms.length,game.serialize());
    for(const r of game.rooms){assert(r.x>0&&r.y>0&&r.x+r.w<W&&r.y+r.h<H);for(const other of game.rooms)if(r!==other)assert(r.x+r.w<other.x||other.x+other.w<r.x||r.y+r.h<other.y||other.y+other.h<r.y);}
    const visited=reachable(game);
    assert(visited.has(game.key(game.stairs.x,game.stairs.y)),`Unreachable stairs: seed ${seed}, floor ${floor}`);
    for(let k=0;k<W*H;k++)if(game.tiles[k])assert(visited.has(k),`Disconnected floor: ${seed}/${floor}`);
    const positions=new Set();
    for(const e of [...game.enemies,...game.items,...game.traps]){assert(game.tile(e.x,e.y));const k=game.key(e.x,e.y);assert(!positions.has(k));positions.add(k);}
    assert(!positions.has(game.key(game.player.x,game.player.y)));
    assert(!positions.has(game.key(game.stairs.x,game.stairs.y)));
    for(const hazard of [...game.enemies,...game.traps]){assert.notEqual(roomAt(game,hazard),startRoom);assert(Math.max(Math.abs(hazard.x-game.player.x),Math.abs(hazard.y-game.player.y))>2);}
    const entrances=entranceCells(game);assert(entrances.size>0);
    assert.equal(game.traps.length,Math.min(floor,5),'Entrance exclusion must preserve the trap budget');
    for(const trap of game.traps)assert(!entrances.has(game.key(trap.x,trap.y)),`Entrance trap: seed ${seed}, floor ${floor}, ${trap.x}/${trap.y}`);
    assert(game.items.filter(i=>i.kind==='bread').length>=3);
    if(floor===10){const guardian=game.enemies.find(e=>e.type==='guardian');assert(guardian);assert.equal(roomAt(game,guardian),exitRoom);}
    const topology=passageTopology(game),walk=stairDistance(game);
    if(game.layout==='ring')assert(topology.loops>0,'Ring layouts must have an actual alternate route');
    const houseRoom=game.monsterHouse?game.rooms[game.monsterHouse.room]:null;
    const leaves=game.rooms.filter((r,i)=>topology.roomDegrees[i]===1&&r!==startRoom&&r!==exitRoom&&r!==houseRoom);
    if(leaves.length){
      const items=game.items.filter(i=>roomAt(game,i)!==houseRoom);
      lootHits+=items.filter(i=>leaves.includes(roomAt(game,i))).length;uniformLootHits+=items.length*leaves.length/game.rooms.length;
      emptyDeadEnds+=leaves.filter(r=>!game.items.some(i=>roomAt(game,i)===r)).length;
    }
    assert.equal(game.enemies.length,4+Math.floor(floor*.75)+(floor===10?1:0),'House enemies use the existing enemy budget');
    if(houseRoom){
      houseFloors++;houseSave||=game.serialize();assert(floor>=4&&floor<10);
      assert.notEqual(houseRoom,startRoom);assert.notEqual(houseRoom,exitRoom);assert.equal(game.monsterHouse.triggered,false);
      const pack=game.enemies.filter(e=>e.house);assert.equal(pack.length,5);assert(pack.every(e=>!e.awake&&roomAt(game,e)===houseRoom));
      const blocked=Object.assign(Object.create(DungeonEngine.prototype),game,{tiles:[...game.tiles]});
      for(let y=houseRoom.y;y<houseRoom.y+houseRoom.h;y++)for(let x=houseRoom.x;x<houseRoom.x+houseRoom.w;x++)blocked.tiles[blocked.key(x,y)]=0;
      assert(reachable(blocked).has(game.key(game.stairs.x,game.stairs.y)),'A house must be an optional detour');
      assert(game.items.some(i=>roomAt(game,i)===houseRoom&&i.kind==='scroll'));
    }
    if(topology.loops)loopFloors++;else treeFloors++;
    if(topology.branches)branchFloors++;if(topology.deadEnds)deadEndFloors++;
    if(walk<=15)nearStairs++;minWalk=Math.min(minWalk,walk);maxWalk=Math.max(maxWalk,walk);
  }
}
assert.deepEqual([...roomCounts].sort(),[4,5,6,7,8]);assert.equal(startCells.size,9);assert.equal(exitCells.size,9);
assert(offCenterStarts>800);assert(loopFloors>100);assert(treeFloors>50);assert(branchFloors>100);assert(deadEndFloors>100);assert(nearStairs>50);
assert(maxWalk<100,'A stair route must fit comfortably within the 400-turn full hunger budget');
assert(Object.values(layouts).every(n=>n>100));assert(deepHalls*3>shallowHalls*4,'Wide halls become more common in deep floors');
assert(lootHits>uniformLootHits*1.5,'Optional dead ends attract more loot than uniform placement');assert(emptyDeadEnds>10,'Dead ends must not guarantee loot');assert(houseFloors>10);
for(const raw of savedFloors.values()){
  const game=DungeonEngine.restore(raw);assert(game);assert.equal(game.serialize(),raw);
  const replay=DungeonEngine.restore(raw);game.generateFloor();replay.generateFloor();assert.equal(game.serialize(),replay.serialize());
}
assert.equal(new DungeonEngine(81234).serialize(),new DungeonEngine(81234).serialize());
{
  const game=new DungeonEngine(42);game.floor=5;game.generateFloor();
  const safeTraps=game.traps.map((t,i)=>({...t,found:i%2===0,spent:i%2===0}));
  game.enemies=[];game.items=[];game.traps=[...safeTraps];
  const expected=game.serialize(),entrances=entranceCells(game);
  game.traps.push(...[...entrances].map(k=>({x:k%W,y:Math.floor(k/W),found:false,spent:false})));
  const restored=DungeonEngine.restore(game.serialize());assert(restored);
  assert.deepEqual(restored.traps,safeTraps,'Loading removes legacy entrance traps and preserves other traps');
  assert.equal(restored.serialize(),expected,'Entrance cleanup must not change other saved state');
  const k=entrances.values().next().value,x=k%W,y=Math.floor(k/W);
  const[dx,dy]=DIRS.find(([dx,dy])=>game.canStep(x,y,dx,dy)&&!roomAt(game,{x:x+dx,y:y+dy}));
  restored.player.x=x+dx;restored.player.y=y+dy;const hp=restored.player.hp;
  assert(restored.move(-dx,-dy));assert.equal(restored.player.hp,hp,'Entering a restored room must not trigger a legacy trap');
}
for(const count of [0,3,9]){const saved=JSON.parse(savedFloors.get(6));saved.state.rooms=Array(count).fill(saved.state.rooms[0]);assert.equal(DungeonEngine.restore(JSON.stringify(saved)),null);}
{
  const saved=JSON.parse(savedFloors.get(6));delete saved.state.layout;delete saved.state.monsterHouse;
  for(const e of saved.state.enemies)delete e.house;
  const game=DungeonEngine.restore(JSON.stringify(saved));assert(game);assert.equal(game.layoutName(),'');assert.equal(game.monsterHouse,null);
  assert.deepEqual(game.tiles,saved.state.tiles);assert.deepEqual(game.player,saved.state.player);
  game.player.x=game.stairs.x;game.player.y=game.stairs.y;assert(game.descend());assert(game.layoutName());
  saved.state.layout='__proto__';assert.equal(DungeonEngine.restore(JSON.stringify(saved)),null);
}
{
  const saved=JSON.parse(houseSave);
  for(const house of [{room:-1,triggered:false},{room:saved.state.rooms.length,triggered:false},{room:0,triggered:'false'}]){saved.state.monsterHouse=house;assert.equal(DungeonEngine.restore(JSON.stringify(saved)),null);}
}
{
  const game=DungeonEngine.restore(houseSave),house=game.monsterHouse,r=game.rooms[house.room],pack=game.enemies.filter(e=>e.house);
  let entry;
  for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++)for(const[dx,dy]of [[0,-1],[1,0],[0,1],[-1,0]]){
    if(game.tile(x+dx,y+dy)&&roomAt(game,{x:x+dx,y:y+dy})!==r)entry={x,y,dx:-dx,dy:-dy,outside:{x:x+dx,y:y+dy}};
  }
  assert(entry);
  const cells=[];for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++)if(x!==entry.x||y!==entry.y)cells.push({x,y});
  pack.forEach((e,i)=>Object.assign(e,cells[cells.length-1-i]));game.enemies=pack;game.items=[];game.traps=[];
  Object.assign(game.player,entry.outside,{hp:1000,maxHp:1000,bag:['map','scroll']});game.reveal();
  const positions=pack.map(e=>[e.x,e.y]);game.use(0);game.wait();
  assert.equal(house.triggered,false);assert(pack.every(e=>!e.awake));assert.deepEqual(pack.map(e=>[e.x,e.y]),positions);
  const dormant=DungeonEngine.restore(game.serialize());assert(dormant);assert.equal(dormant.monsterHouse.triggered,false);assert(dormant.enemies.every(e=>!e.awake));
  assert(game.move(entry.dx,entry.dy));assert.equal(house.triggered,true);assert(pack.every(e=>e.awake));
  const notice=()=>game.log.filter(e=>e.text.startsWith('モンスターハウス！')).length;
  assert.equal(notice(),1);game.wait();assert.equal(notice(),1);
  const active=DungeonEngine.restore(game.serialize());assert(active);assert.equal(active.monsterHouse.triggered,true);assert(active.enemies.every(e=>e.awake));active.wait();
  assert.equal(active.log.filter(e=>e.text.startsWith('モンスターハウス！')).length,1);
  const hp=pack.map(e=>e.hp);assert(game.use(0));assert(pack.every((e,i)=>e.hp===hp[i]-18));
}
{
  const game=DungeonEngine.restore(houseSave),r=game.rooms[game.monsterHouse.room],pack=game.enemies.filter(e=>e.house);
  game.hit(pack[0],1);assert(pack[0].awake);assert(pack.slice(1).every(e=>!e.awake));assert.equal(game.monsterHouse.triggered,false);
  game.enemies=[];game.items=[];game.traps=[];game.player.x=r.cx;game.player.y=r.cy;game.wait();
  assert.equal(game.monsterHouse.triggered,true);assert(!game.log.some(e=>e.text.startsWith('モンスターハウス！')),'An empty house must not announce sleeping monsters');
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
  const game=arena(11),p=game.player,startX=p.x;
  const e={x:p.x+1,y:p.y,id:1,type:'slime',name:'苔スライム',hp:1,maxHp:1,attack:3,exp:8};game.enemies.push(e);
  const turn=game.turn;game.move(1,0);assert.equal(game.turn,turn+1);assert.equal(p.level,2);assert.equal(p.x,startX);assert.equal(game.enemies.length,0);
  p.hp=1;p.hunger=0;game.wait();assert.equal(game.status,'dead');assert.equal(p.hp,0);assert.equal(game.wait(),false);
}
{
  const game=arena(33);game.traps=[{x:game.player.x+1,y:game.player.y,found:false,spent:false}];game.turn=6;game.player.hp=1;
  game.move(1,0);assert.equal(game.status,'dead','Fatal trap cannot be reversed by passive regeneration');
}
{
  const game=arena(33),p=game.player;game.enemies=[];game.items=[];
  const trap={x:p.x+1,y:p.y,found:false};game.traps=[trap];
  let hp=p.hp;
  assert(game.move(1,0));assert(trap.found);assert.equal(game.traps.length,1);
  assert.equal(p.hp,hp-game.effects.at(-1).value);
  hp=p.hp;const effects=game.effects.length;
  assert(game.wait());assert.equal(p.hp,hp);assert.equal(game.effects.length,effects,'Waiting on a trap does not trigger it');
  assert(game.move(-1,0));assert.equal(p.hp,hp);
  assert(game.move(1,0));assert.equal(game.effects.length,effects+1,'Re-entering a trap triggers it again');
  assert.equal(p.hp,hp-game.effects.at(-1).value);
  const saved=JSON.parse(game.serialize());
  for(const legacy of [false,true]){
    if(legacy)saved.state.traps[0].spent=true;
    const restored=DungeonEngine.restore(JSON.stringify(saved));assert(restored);assert(restored.traps[0].found);
    hp=restored.player.hp;
    assert(restored.move(-1,0));assert.equal(restored.player.hp,hp);
    assert(restored.move(1,0));assert.equal(restored.effects.length,1,'Restored traps trigger, including legacy spent traps');
    assert.equal(restored.player.hp,hp-restored.effects[0].value);
    assert(restored.move(-1,0));restored.player.hp=1;
    assert(restored.move(1,0));assert.equal(restored.status,'dead','Re-entering a trap can be fatal');
  }
}
{
  const game=arena(22),p=game.player;
  // A diagonal destination alone is insufficient: both orthogonal sides must be open.
  game.tiles[game.key(p.x+1,p.y)]=0;assert.equal(game.move(1,1),false);assert.equal(game.turn,0);
  game.tiles[game.key(p.x+1,p.y)]=1;
  const enemy={x:p.x+2,y:p.y,id:1,type:'slime',name:'苔スライム',hp:30,maxHp:30,attack:1,exp:1};game.enemies=[enemy];game.reveal();p.facing=[1,0];p.bag=['arrow'];game.use(0);assert.equal(enemy.hp,18);assert.equal(game.turn,1);
  p.bag=['scroll'];game.use(0);assert.equal(game.enemies.length,0);
}
{
  const game=arena(22),p=game.player;
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
  const amounts=new Set();
  for(const dungeon of ['tutorial','depths'])for(let seed=1;seed<=100;seed++){
    const game=new DungeonEngine(seed,dungeon,true),arrow=game.items.find(i=>i.kind==='arrow');
    assert(arrow);assert(Number.isInteger(arrow.amount)&&arrow.amount>=1&&arrow.amount<=10);amounts.add(arrow.amount);
    const restored=DungeonEngine.restore(game.serialize());assert(restored);assert.deepEqual(restored.items,game.items);
    const p=restored.player,before=restored.arrowCount();p.x=arrow.x;p.y=arrow.y;restored.collect();
    assert.equal(restored.arrowCount(),before+arrow.amount);assert.equal(restored.log[0].text,`木の矢を${arrow.amount}本拾った。`);
    assert(!restored.items.some(i=>i.kind==='arrow'));assert.equal(restored.inventoryEntries().filter(i=>i.kind==='arrow').length,1);
  }
  assert.deepEqual([...amounts].sort((a,b)=>a-b),[1,2,3,4,5,6,7,8,9,10]);
  const game=new DungeonEngine(22),p=game.player;p.bag=Array(15).fill('bread');p.bag.push('arrow');p.ammo='arrow';
  game.items=[{x:p.x,y:p.y,kind:'arrow',amount:10}];game.collect();
  assert.equal(game.arrowCount(),11);assert.equal(game.inventoryEntries().length,16);assert.equal(p.ammo,'arrow');assert.equal(game.items.length,0);
  game.items=[{x:p.x,y:p.y,kind:'arrow'}];game.collect();assert.equal(game.arrowCount(),12);
}
{
  const game=new DungeonEngine(22),p=game.player;game.enemies=[];game.traps=[];
  p.bag=Array(15).fill('bread');p.bag.push('arrow');
  game.items=[{x:p.x,y:p.y,kind:'arrow',amount:1}];game.collect();assert.equal(game.arrowCount(),2);assert.equal(game.inventoryEntries().length,16);assert.equal(game.items.length,0);
  game.items=[{x:p.x,y:p.y,kind:'potion',amount:1}];game.collect();assert.equal(game.items.length,1);assert.equal(p.bag.includes('potion'),false);
  p.bag=Array(16).fill('bread');game.items=[{x:p.x,y:p.y,kind:'arrow',amount:1}];game.collect();assert.equal(game.items.length,1);assert.equal(game.arrowCount(),0);
}
{
  const game=new DungeonEngine(22),p=game.player;
  for(const kind of [...Object.keys(ITEMS),'gold','weapon','shield']){
    game.effects=[];game.items=[{x:p.x,y:p.y,kind,amount:42}];game.collect();
    const text=kind==='gold'?'42Gを拾った。':kind==='weapon'?`${game.weaponName()}を手に入れ、装備した。`:kind==='shield'?`${game.shieldName()}を手に入れ、装備した。`:kind==='arrow'?'木の矢を10本拾った。':`${ITEMS[kind].name}を拾った。`;
    assert.deepEqual(game.effects,[{type:'pickup',x:p.x,y:p.y,value:kind,text}]);
    // Later events in the same turn must not replace the pickup message.
    game.say('足元にトゲの罠！ 3ダメージ。','danger');assert.equal(game.effects[0].text,text);
  }
  p.bag=Array(16).fill('bread');game.effects=[];game.items=[{x:p.x,y:p.y,kind:'potion',amount:1}];game.collect();
  assert.equal(game.effects.length,0);assert.equal(game.items.length,1);
}
{
  const game=new DungeonEngine(9);game.floor=10;game.generateFloor();game.enemies=[];game.items=[];game.traps=[];game.player.x=game.stairs.x;game.player.y=game.stairs.y;game.wait();assert.equal(game.status,'won');
}
{
  const game=new DungeonEngine(9);game.floor=10;game.generateFloor();const guardian=game.enemies.find(e=>e.type==='guardian');game.enemies=[guardian];guardian.x=game.rooms[3].cx;guardian.y=game.rooms[3].cy;game.player.x=game.stairs.x;game.player.y=game.stairs.y;game.wait();assert.equal(game.status,'playing');
}
{
  const game=new DungeonEngine(22),p=game.player,home={x:p.x,y:p.y};
  const far=game.rooms.find(r=>!game.visible[game.key(r.cx,r.cy)]);
  const enemy={id:100,x:home.x,y:home.y,hp:5,maxHp:5,type:'slime'};
  const hiddenEnemy={id:101,x:far.cx,y:far.cy,hp:5,maxHp:5,type:'slime'};
  const item={x:home.x+1,y:home.y,kind:'potion',amount:1};
  const hiddenItem={x:far.cx+1,y:far.cy,kind:'bread',amount:1};
  game.enemies=[enemy,hiddenEnemy];game.items=[item,hiddenItem];game.reveal();
  assert.equal(item.discovered,true);assert.deepEqual(enemy.lastSeen,home);
  assert.equal(hiddenItem.discovered,undefined);assert.equal(hiddenEnemy.lastSeen,undefined);
  // Revealing terrain does not reveal its occupants.
  game.seen.fill(true);game.reveal();
  assert.equal(hiddenItem.discovered,undefined);assert.equal(hiddenEnemy.lastSeen,undefined);
  p.x=far.cx;p.y=far.cy;game.reveal();
  assert.equal(hiddenItem.discovered,true);assert.deepEqual(hiddenEnemy.lastSeen,{x:far.cx,y:far.cy});
  assert.equal(game.visible[game.key(item.x,item.y)],false);
  const lastSeen={...hiddenEnemy.lastSeen};p.x=home.x;p.y=home.y;
  hiddenEnemy.x=far.cx+2;game.reveal();assert.deepEqual(hiddenEnemy.lastSeen,lastSeen);
  const restored=DungeonEngine.restore(game.serialize());assert(restored);
  assert.deepEqual(restored.enemies[1].lastSeen,lastSeen);assert.equal(restored.items[1].discovered,true);
  const legacy=JSON.parse(game.serialize());
  legacy.state.items.forEach(i=>delete i.discovered);legacy.state.enemies.forEach(e=>delete e.lastSeen);
  const migrated=DungeonEngine.restore(JSON.stringify(legacy));assert(migrated);
  assert.equal(migrated.items[0].discovered,true);assert.equal(migrated.items[1].discovered,undefined);
  assert.equal(migrated.enemies[1].lastSeen,undefined);
  // Exercise the renderer itself: remembered positions, hidden occupants, removal and marker priority.
  const fs=require('node:fs'),vm=require('node:vm');
  const source=fs.readFileSync(require.resolve('./dist/game.js'),'utf8');
  const draw=source.slice(source.indexOf('  function drawMinimap()'),source.indexOf('  function toggleMinimap()'));
  const calls=[],mini={fillStyle:'',fillRect(...args){calls.push({color:this.fillStyle,args});}};
  function markers(){calls.length=0;vm.runInNewContext(draw+'drawMinimap();',{mini,engine:game,W,H,MONSTERS:DungeonData.MONSTERS});return calls.filter(c=>['#d08288','#ffc857'].includes(c.color));}
  assert.equal(markers().length,4);
  const stairsIndex=calls.findIndex(c=>c.color==='#5ca9ff');
  assert(stairsIndex>0);assert.equal(calls[stairsIndex-1].color,'#131c20');
  assert.deepEqual(calls[stairsIndex-1].args,[calls[stairsIndex].args[0]-1,calls[stairsIndex].args[1]-1,6,6]);
  assert(markers().some(c=>c.color==='#d08288'&&c.args[0]===lastSeen.x*144/W));
  game.enemies.push({x:far.cx,y:far.cy,hp:5});game.items.push({x:far.cx,y:far.cy,kind:'gold'});
  assert.equal(markers().length,4,'Undiscovered entities stay hidden even on revealed terrain');
  p.x=item.x;p.y=item.y;game.collect();enemy.hp=0;
  assert.equal(markers().length,2,'Collected items and dead enemies leave the minimap');
  game.generateFloor();assert(game.enemies.every(e=>!e.lastSeen||game.visible[game.key(e.x,e.y)]));
  assert(game.items.every(i=>!i.discovered||game.visible[game.key(i.x,i.y)]));
}
{
  const fs=require('node:fs'),vm=require('node:vm');
  const source=fs.readFileSync(require.resolve('./dist/game.js'),'utf8');
  const notice={textContent:''},timers=new Map();let nextTimer=0,clock=0;
  const context={pickupNotice:notice,setTimeout(fn,ms){const id=++nextTimer;timers.set(id,{fn,at:clock+ms});return id;},clearTimeout(id){timers.delete(id);}};
  const start=source.indexOf('  let pickupTimer;'),end=source.indexOf('  const SAVE_KEY=',start);
  vm.createContext(context);vm.runInContext(source.slice(start,end),context);
  function advance(ms){clock+=ms;for(const[id,timer]of timers)if(timer.at<=clock){timers.delete(id);timer.fn();}}
  context.showPickupNotice('回復草を拾った。');assert.equal(notice.textContent,'回復草を拾った。');
  advance(999);assert.equal(notice.textContent,'回復草を拾った。');
  advance(1);assert.equal(notice.textContent,'');
  context.showPickupNotice('焼きたてパンを拾った。');advance(500);
  context.showPickupNotice('42Gを拾った。');advance(500);assert.equal(notice.textContent,'42Gを拾った。');
  advance(500);assert.equal(notice.textContent,'');
  context.showPickupNotice('木の矢を拾った。');context.clearPickupNotice();
  assert.equal(notice.textContent,'');assert.equal(timers.size,0);
}
console.log('PASS: pickup toast expires after 1 second; subsequent pickups reset expiry; reset cancels pending timers.');
console.log('PASS: minimap discovery, map-scroll privacy, remembered enemy positions, renderer markers, collection/death, floor reset and save migration.');
console.log('PASS: 1,000 generated floors connected; collision, entities, food, hunger, inventory, arrow stacking/equipment, level-up, save/load, death and victory checked.');
console.log('PASS: no entrance traps in 1,000 floors, including diagonal entry; trap budgets preserved; legacy entrance traps removed on load.');
console.log(`PASS: 4–8 rooms; all 9 start/exit regions; ${loopFloors} loop, ${treeFloors} tree, ${branchFloors} branching, ${deadEndFloors} dead-end floors; stairs ${minWalk}–${maxWalk} steps (${nearStairs} nearby); safe spawns and deterministic save/load checked.`);
console.log(`PASS: layouts ${JSON.stringify(layouts)}, no consecutive repeats; deep/shallow halls ${deepHalls}/${shallowHalls}; dead-end loot ${lootHits} vs uniform ${uniformLootHits.toFixed(1)}, ${emptyDeadEnds} empty dead ends; ${houseFloors} optional houses, dormant/entry activation, scroll and save/load checked.`);

// Dungeon progression: legacy saves, permanent unlocks, and all 30 challenge floors.
{
  assert.throws(()=>new DungeonEngine(1,'depths'),RangeError);
  assert.throws(()=>new DungeonEngine(1,'unknown',true),RangeError);
  const tutorial=new DungeonEngine(9);
  assert.equal(tutorial.dungeon,'tutorial');assert.equal(tutorial.maxFloor(),10);assert.equal(tutorial.tutorialCleared,false);
  const old=JSON.parse(tutorial.serialize());delete old.state.dungeon;delete old.state.tutorialCleared;
  assert.equal(DungeonEngine.restore(JSON.stringify(old)).dungeon,'tutorial');
  tutorial.floor=10;tutorial.generateFloor();
  const guardian=tutorial.enemies.find(e=>e.type==='guardian');
  guardian.x=tutorial.rooms.find(r=>r!==tutorial.roomAt(tutorial.stairs.x,tutorial.stairs.y)).cx;
  guardian.y=tutorial.rooms.find(r=>r!==tutorial.roomAt(tutorial.stairs.x,tutorial.stairs.y)).cy;
  tutorial.enemies=[guardian];tutorial.traps=[];tutorial.items=[];
  tutorial.player.x=tutorial.stairs.x;tutorial.player.y=tutorial.stairs.y;
  tutorial.wait();assert.equal(tutorial.status,'playing');assert.equal(tutorial.tutorialCleared,false);
  tutorial.hit(guardian,guardian.hp);tutorial.wait();
  assert.equal(tutorial.status,'won');assert.equal(tutorial.tutorialCleared,true);assert.equal(tutorial.descend(),false);
  const legacyWin=JSON.parse(tutorial.serialize());delete legacyWin.state.dungeon;delete legacyWin.state.tutorialCleared;
  assert.equal(DungeonEngine.restore(JSON.stringify(legacyWin)).tutorialCleared,true);
  legacyWin.state.status='dead';assert.equal(DungeonEngine.restore(JSON.stringify(legacyWin)).tutorialCleared,false);
  const deep=new DungeonEngine(9,'depths',tutorial.tutorialCleared);
  for(const floor of [10,20,29]){
    deep.floor=floor;deep.generateFloor();assert(!deep.enemies.some(e=>e.type==='guardian'));
    deep.enemies=[];deep.player.x=deep.stairs.x;deep.player.y=deep.stairs.y;deep.wait();
    assert.equal(deep.status,'playing');assert(deep.descend());assert.equal(deep.floor,floor+1);
  }
  const restored=DungeonEngine.restore(deep.serialize());assert(restored);assert.equal(restored.floor,30);assert.equal(restored.dungeon,'depths');
  assert.deepEqual(restored.player,deep.player);assert.equal(restored.tutorialCleared,true);
  const boss=deep.enemies.find(e=>e.type==='guardian');assert.equal(boss.name,'深淵の番人');assert.equal(boss.maxHp,180);assert.equal(boss.attack,34);
  const room=deep.rooms.find(r=>r!==deep.roomAt(deep.stairs.x,deep.stairs.y));boss.x=room.cx;boss.y=room.cy;
  deep.enemies=[boss];deep.traps=[];deep.items=[];deep.player.x=deep.stairs.x;deep.player.y=deep.stairs.y;
  assert.equal(deep.descend(),false);deep.wait();assert.equal(deep.status,'playing');
  deep.hit(boss,boss.hp);deep.wait();assert.equal(deep.status,'won');assert.equal(deep.descend(),false);assert.equal(deep.floor,30);
  assert.equal(DungeonEngine.restore(deep.serialize()).status,'won');
  const invalid=JSON.parse(deep.serialize());
  invalid.state.floor=31;assert.equal(DungeonEngine.restore(JSON.stringify(invalid)),null);
  invalid.state.floor=30;invalid.state.dungeon='tutorial';assert.equal(DungeonEngine.restore(JSON.stringify(invalid)),null);
  invalid.state.dungeon='unknown';assert.equal(DungeonEngine.restore(JSON.stringify(invalid)),null);
  invalid.state.dungeon='depths';invalid.state.tutorialCleared=false;assert.equal(DungeonEngine.restore(JSON.stringify(invalid)),null);
  invalid.state.tutorialCleared='true';assert.equal(DungeonEngine.restore(JSON.stringify(invalid)),null);
  const retry=new DungeonEngine(9,'depths',true);assert.equal(retry.floor,1);assert.equal(retry.player.level,1);assert.equal(retry.player.gold,0);assert.equal(retry.player.weapon,0);
}
for(let seed=1;seed<=100;seed++){
  const game=new DungeonEngine(seed,'depths',true);
  for(let floor=1;floor<=30;floor++){
    game.floor=floor;game.generateFloor();
    assert(game.floorName());const visited=reachable(game),positions=new Set();
    for(let k=0;k<W*H;k++)if(game.tiles[k])assert(visited.has(k),`Disconnected challenge floor ${seed}/${floor}`);
    assert(visited.has(game.key(game.stairs.x,game.stairs.y)));
    for(const entity of [...game.enemies,...game.items,...game.traps]){
      const k=game.key(entity.x,entity.y);assert(game.tile(entity.x,entity.y));assert(!positions.has(k));positions.add(k);
    }
    assert(!positions.has(game.key(game.player.x,game.player.y)));assert(!positions.has(game.key(game.stairs.x,game.stairs.y)));
    for(const hazard of [...game.enemies,...game.traps])assert.notEqual(game.roomAt(hazard.x,hazard.y),game.roomAt(game.player.x,game.player.y));
    assert.equal(game.items.filter(i=>i.kind==='bread').length,2);
    assert.equal(game.items.filter(i=>i.kind==='potion').length,2);
    assert.equal(game.items.some(i=>i.kind==='weapon'),floor%3===2);assert.equal(game.items.some(i=>i.kind==='shield'),floor%3===0);
    assert.equal(game.enemies.length,6+Math.floor(floor*.75)+(floor===30?1:0));
    assert.equal(game.traps.length,Math.min(floor+2,8));assert(game.traps.every(t=>!game.isRoomEntrance(t.x,t.y)));
    const enemies=game.enemies.filter(e=>e.type!=='guardian');
    for(const e of enemies){const m=DungeonData.MONSTERS[e.species];assert.equal(e.maxHp,m.hp);assert.equal(e.attack,m.attack);assert(DungeonData.MONSTER_POOLS[DungeonData.monsterTier(floor,'depths')].includes(e.species));}
    assert.equal(game.enemies.some(e=>e.type==='guardian'),floor===30);
    if(floor===30||floor===11){const restored=DungeonEngine.restore(game.serialize());assert(restored);assert.equal(restored.floor,floor);assert.deepEqual(restored.enemies,game.enemies);}
  }
}
{
  const fs=require('node:fs'),vm=require('node:vm'),source=fs.readFileSync(require.resolve('./dist/game.js'),'utf8');
  const storage=new Map(),context={DungeonEngine,camera:{x:0,y:0},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},$:()=>({textContent:''}),clearPickupNotice(){},closeModal(){},updateUI(){}};
  vm.createContext(context);
  const startup=source.slice(source.indexOf('  const SAVE_KEY='),source.indexOf('  let sound='));
  const save=source.slice(source.indexOf('  function save()'),source.indexOf('  function beep('));
  const startNew=source.slice(source.indexOf('  function startNew('),source.indexOf('  function confirmNew('));
  vm.runInContext(startup+save+startNew,context);
  vm.runInContext("engine.tutorialCleared=true;save();startNew('depths');engine.floor=23;engine.generateFloor();save();",context);
  assert.equal(storage.get('lantern-dungeon-progress-v1'),'true');
  const resumed=DungeonEngine.restore(storage.get('lantern-dungeon-v1'));assert.equal(resumed.floor,23);assert.equal(resumed.dungeon,'depths');
  vm.runInContext("engine.status='dead';save();startNew('tutorial');save();",context);
  assert.equal(DungeonEngine.restore(storage.get('lantern-dungeon-v1')).tutorialCleared,true);
  // Even a missing/corrupt adventure retains the separately saved unlock.
  storage.set('lantern-dungeon-v1','broken');
  const freshContext={...context};vm.createContext(freshContext);vm.runInContext(startup+'globalThis.unlocked=engine.tutorialCleared;',freshContext);assert.equal(freshContext.unlocked,true);
  context.localStorage.setItem=()=>{throw new Error('Storage unavailable');};vm.runInContext('save();globalThis.unlocked=engine.tutorialCleared;',context);assert.equal(context.unlocked,true);
}
console.log('PASS: 3,000 challenge floors connected; stronger enemies, supplies, equipment, safe spawns, 30F guardian gate; legacy migration and permanent unlock across retries/load/storage failures checked.');
