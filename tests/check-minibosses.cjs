const assert=require('node:assert/strict');
require('../dist/engine.js');
const {MONSTERS,monsterStats,DIRS,W,H}=DungeonData;
function replay(g){g.reveal();const raw=g.serialize(),copy=DungeonEngine.restore(raw);assert(copy,'Miniboss state restores');assert.equal(copy.serialize(),raw);return copy;}
function arena(species='bubbleMother'){
  const g=new DungeonEngine(4747,'depths',true);g.floor=MONSTERS[species].miniboss;
  g.tiles.fill(1);g.rooms[0]={x:2,y:2,w:25,h:20,cx:14,cy:12};
  Object.assign(g.player,{x:10,y:10,hp:300,maxHp:300,nextExp:10000,exp:0,facing:[1,0]});
  g.enemies=[{...monsterStats(species),id:0,x:13,y:10,hp:MONSTERS[species].hp,awake:true}];
  g.items=[];g.traps=[];g.surfaces=[];g.monsterHouse=null;g.shrine={x:15,y:15,used:false,choices:[{id:'vigor'},{id:'rest'},{id:'quiver'}]};g.merchant=null;g.stairs={x:25,y:20};g.reveal();return g;
}
// Fixed floors, one original, unchanged enemy budgets, no house/start/stair placement and a bypassable exit.
let generated=0;
for(const dungeon of ['tutorial','depths'])for(let seed=1;seed<=160;seed++)for(const floor of dungeon==='depths'?[9,10,11,19,20,21,30]:[5,10]){
  const g=new DungeonEngine(seed,dungeon,true);g.floor=floor;g.generateFloor();
  const bosses=g.enemies.filter(e=>MONSTERS[e.species].miniboss),expected=dungeon==='depths'&&[10,20].includes(floor);
  assert.equal(bosses.length,expected?1:0);
  assert.equal(g.enemies.length,(dungeon==='depths'?6:4)+Math.floor(floor*.75)+(floor===g.maxFloor()?1:0));
  if(expected){
    generated++;const e=bosses[0];assert.equal(e.species,floor===10?'bubbleMother':'gateGolem');assert.equal(e.hp,floor===10?120:200);
    assert(!e.house&&!e.elite&&!e.spawned);assert(!g.isRoomEntrance(e.x,e.y));
    assert.notEqual(g.roomAt(e.x,e.y),g.roomAt(g.player.x,g.player.y));assert.notEqual(g.roomAt(e.x,e.y),g.roomAt(g.stairs.x,g.stairs.y));
    const seen=new Set([g.key(g.player.x,g.player.y)]),queue=[[g.player.x,g.player.y]];
    for(let i=0;i<queue.length;i++)for(const[dx,dy]of DIRS){const[x,y]=queue[i],nx=x+dx,ny=y+dy,k=g.key(nx,ny);
      if(g.canStep(x,y,dx,dy)&&!(nx===e.x&&ny===e.y)&&!seen.has(k)){seen.add(k);queue.push([nx,ny]);}}
    assert(seen.has(g.key(g.stairs.x,g.stairs.y)),'The boss does not seal the only stair route');
    replay(g);Object.assign(g.player,g.stairs);assert(g.descend(),'Living minibosses never lock stairs');
  }
}
// Three HP-conserving divisions; clones never divide or grant the shrine reward.
{
  const g=arena(),mother=g.enemies[0];let total=120;
  for(let i=1;i<=3;i++){
    g.hit(mother,1,'magic');total--;
    assert.equal(g.enemies.length,i+1);assert.equal(mother.splitCount,i);assert.equal(mother.split,i===3);
    assert.equal(g.enemies.reduce((s,e)=>s+e.hp,0),total);replay(g);
  }
  g.hit(mother,1,'magic');assert.equal(g.enemies.length,4);
  const clone=g.enemies.find(e=>e.spawned);assert.equal(clone.exp,1);const gold=g.player.gold;
  g.hit(clone,1,'magic');assert.equal(g.enemies.length,4);g.hit(clone,999,'magic');
  assert.equal(g.player.gold,gold);assert(!g.player.shrineBonus);assert(!g.items.some(i=>i.kind==='echoShard'));
  g.hit(mother,999,'magic');assert.equal(g.player.shrineBonus,1);assert.equal(g.shrine.choices.length,4);
  g.hit(mother,999,'magic');assert.equal(g.player.shrineBonus,1,'One reward per original');replay(g);
  const blocked=arena(),e=blocked.enemies[0];for(const[dx,dy]of DIRS)blocked.tiles[blocked.key(e.x+dx,e.y+dy)]=0;
  blocked.hit(e,1,'magic');assert(!e.splitCount);assert.equal(blocked.enemies.length,1);
}
// Ward and charge compose; physical attacks halve while traps, collisions and magic stay full.
for(const kind of ['melee','arrow','magic']){const g=arena('gateGolem'),e=g.enemies[0];g.hit(e,11,kind);assert.equal(e.hp,kind==='magic'?189:194);}
{
  const g=arena('gateGolem'),e=g.enemies[0];g.enemyTurn();assert.equal(e.intent.kind,'charge');const copy=replay(g);
  g.player.y=copy.player.y=11;g.enemyTurn();copy.enemyTurn();assert.equal(g.serialize(),copy.serialize());assert.equal(e.x,9);
  const wall=arena('gateGolem'),bug=wall.enemies[0];wall.enemyTurn();wall.player.y=11;wall.tiles[wall.key(11,10)]=0;
  wall.enemyTurn();assert.equal(bug.hp,194);assert(bug.stunned);replay(wall);wall.enemyTurn();assert(!bug.stunned);
}
// A fourth candidate costs no turn, consumes one carried reward, and never grants a second boon at one shrine.
{
  const g=arena();g.enemies[0].hp=1;g.hit(g.enemies[0],999,'magic');assert.equal(new Set(g.shrine.choices.map(c=>c.id)).size,4);
  Object.assign(g.player,{x:g.shrine.x,y:g.shrine.y});g.reveal();const turn=g.turn;
  assert.equal(g.boonOptions().length,4);const pick=g.boonOptions().findIndex(o=>o.available);assert(g.chooseBoon(pick));
  assert.equal(g.turn,turn);assert.equal(g.player.shrineBonus,0);assert(!g.chooseBoon(0));replay(g);
  const carry=arena();carry.shrine.used=true;carry.hit(carry.enemies[0],999,'magic');
  assert.equal(carry.player.shrineBonus,1);assert.equal(carry.shrine.choices.length,3);replay(carry);
  carry.floor=15;carry.generateFloor();assert.equal(carry.shrine.choices.length,4);replay(carry);
  carry.floor=20;carry.generateFloor();const second=carry.enemies.find(e=>e.species==='gateGolem');carry.hit(second,999,'magic');
  assert.equal(carry.player.shrineBonus,2);assert.equal(carry.shrine.choices.length,4);
  Object.assign(carry.player,{x:carry.shrine.x,y:carry.shrine.y});assert(carry.chooseBoon(carry.boonOptions().findIndex(o=>o.available)));assert.equal(carry.player.shrineBonus,1);
  carry.floor=25;carry.generateFloor();assert.equal(carry.shrine.choices.length,4);Object.assign(carry.player,{x:carry.shrine.x,y:carry.shrine.y});
  assert(carry.chooseBoon(carry.boonOptions().findIndex(o=>o.available)));assert.equal(carry.player.shrineBonus,0);replay(carry);
}
// Old state without a bonus stays valid; invented counters, elite bosses and duplicate originals do not.
{
  const g=arena();replay(g);
  for(const patch of [{splitCount:4},{splitCount:-1},{splitCount:1,split:true},{split:true},{elite:true},{house:true}]){
    const raw=JSON.parse(g.serialize());Object.assign(raw.state.enemies[0],patch);assert.equal(DungeonEngine.restore(JSON.stringify(raw)),null);
  }
  for(const value of [-1,3,1.5,'1']){const raw=JSON.parse(g.serialize());raw.state.player.shrineBonus=value;assert.equal(DungeonEngine.restore(JSON.stringify(raw)),null);}
  const wrong=JSON.parse(g.serialize());wrong.state.floor=11;assert.equal(DungeonEngine.restore(JSON.stringify(wrong)),null);
  const duplicate=JSON.parse(g.serialize());duplicate.state.enemies.push({...duplicate.state.enemies[0],id:1,x:14});assert.equal(DungeonEngine.restore(JSON.stringify(duplicate)),null);
}
// Larger silhouettes, HP bars and charge warnings are render-only at either motion setting.
{
  const fs=require('node:fs'),vm=require('node:vm');
  for(const species of ['bubbleMother','gateGolem'])for(const reduced of [false,true]){
    const g=arena(species),e=g.enemies[0];e.hp--;
    if(species==='gateGolem')e.intent={kind:'charge',x:10,y:10,dx:-1,dy:0,length:3};
    const frames=[],scales=[],style={},marks=[];
    const ctx=new Proxy({}, {get:(_,key)=>key==='createRadialGradient'?()=>({addColorStop(){}}):(...args)=>{
      assert(args.filter(v=>typeof v==='number').every(Number.isFinite));
      if(key==='scale')scales.push(args);if(key==='strokeRect'&&style.strokeStyle==='#ffdf85')marks.push(args);
    },set:(_,key,value)=>{style[key]=value;return true;}});
    const canvas={width:880,height:576,getContext:()=>ctx,getBoundingClientRect:()=>({left:0,top:0,width:390,height:350})};
    const env=vm.createContext({DungeonData,performance:{now:()=>1000},requestAnimationFrame:fn=>frames.push(fn),
      createSpriteRenderer:()=>({sprite(){},paintedSprite:()=>true,heroSprite:()=> 'heroRight',hasAtlas:()=>true,walkFrameCount:()=>12})});
    vm.runInContext(fs.readFileSync(require.resolve('../dist/renderer.js'),'utf8'),env);
    const view=env.createDungeonRenderer({canvas,minimap:canvas,viewport:canvas,getEngine:()=>g,reduced});view.resize();view.start();
    scales.length=marks.length=0;const saved=g.serialize();frames.shift()(1000);
    assert(scales.some(([x,y])=>x>1.25&&y>1.25),'Both minibosses use a larger silhouette');
    assert.equal(marks.length,species==='gateGolem'?3:0);assert.equal(g.serialize(),saved,'Rendering cannot mutate game state');
  }
}
console.log(`PASS: ${generated} fixed-floor minibosses, unchanged budgets/bypassable stairs, three conserving splits/no farming, ward+charge, carried fourth shrine choices/free single claims, legacy/replay and strict saves.`);
