const assert = require('node:assert/strict');
require('../dist/engine.js');
const StrategyEngine = require('../dist/strategy.js');
const {MONSTERS, monsterStats, DIRS} = DungeonData;
function replay(g) {
  g.reveal();const raw=g.serialize(),copy=(g.strategyTrial?StrategyEngine:DungeonEngine).restore(raw);
  assert(copy,'Elite state restores');assert.equal(copy.serialize(),raw);return copy;
}
function arena(Engine= DungeonEngine,species='hornBeetle') {
  const g=new Engine(4545);if(g.strategyTrial)g.chooseKit('none');
  g.floor=5;g.tiles.fill(1);g.rooms[0]={x:2,y:2,w:25,h:20,cx:14,cy:12};
  Object.assign(g.player,{x:10,y:10,hp:300,maxHp:300,exp:0,nextExp:10000,echoPity:2,facing:[1,0]});
  g.enemies=[{...monsterStats(species,true),id:0,x:13,y:10,awake:true}];g.enemies[0].hp=g.enemies[0].maxHp;
  g.items=[];g.traps=[];g.surfaces=[];g.monsterHouse=null;g.shrine=null;g.merchant=null;g.stairs={x:25,y:20};g.reveal();return g;
}
// Explicit arithmetic, independent of the shared generation/save helper.
for(const [species,m] of Object.entries(MONSTERS)) {
  if(m.type==='guardian'||m.miniboss){assert.throws(()=>monsterStats(species,true),RangeError);continue;}
  const s=monsterStats(species,true);
  assert.equal(s.name,`灯冠の${m.name}`);assert.equal(s.maxHp,Math.ceil(m.hp*1.5));
  assert.equal(s.attack,Math.ceil(m.attack*1.2));assert.equal(s.exp,m.exp*2);assert(s.elite);
  assert.equal(monsterStats(species).elite,undefined,'Ordinary saves keep their existing shape');
}
// Sampling proves eligibility/exclusions; a forced boundary roll proves exactly 6/100.
let eligible=0,elites=0,houses=0,guardians=0;
for(const dungeon of ['tutorial','depths'])for(let seed=1;seed<=180;seed++)for(const floor of [1,2,3,4,5,8,10,...(dungeon==='depths'?[20,30]:[])]) {
  const g=new DungeonEngine(seed,dungeon,true);g.floor=floor;g.generateFloor();
  for(const e of g.enemies) {
    const qualifies=floor+(dungeon==='depths'?2:0)>=5&&!e.house&&e.type!=='guardian'&&!MONSTERS[e.species].miniboss;
    if(e.house)houses++;if(e.type==='guardian')guardians++;
    if(!qualifies)assert(!e.elite,'No early, house or guardian elites');
    else {eligible++;if(e.elite)elites++;}
  }
  replay(g);
}
assert(houses>0&&guardians>0);assert(elites/eligible>.045&&elites/eligible<.075,`Elite sample rate ${elites}/${eligible}`);
for(const roll of [6,7]) {
  const g=new DungeonEngine(99);g.floor=5;const int=g.int.bind(g);
  g.int=(a,b)=>a===1&&b===100?roll:int(a,b);g.generateFloor();
  const ordinary=g.enemies.filter(e=>!e.house&&e.type!=='guardian');assert(ordinary.length);
  assert(ordinary.every(e=>!!e.elite===(roll===6)),`Roll ${roll} matches the 6% boundary`);
}
for(const Engine of [DungeonEngine,StrategyEngine]) {
  // Damage, fixed telegraphs, HP loss and reward preserve elite identity after reload.
  const g=arena(Engine),e=g.enemies[0];g.hit(e,3,'magic');g.enemyTurn();assert.equal(e.intent.kind,'charge');
  const copy=replay(g);g.player.y=copy.player.y=11;g.enemyTurn();copy.enemyTurn();assert.equal(g.serialize(),copy.serialize());
  g.player.echoPity=2;const pity=g.player.echoPity,exp=g.player.exp;g.hit(e,999,'magic');
  assert.equal(g.player.exp,exp+32);assert.equal(g.player.echoPity,pity);
  assert.equal(g.items.filter(i=>i.kind==='echoShard').length,1,'Elites always leave a shard');
  // The guaranteed drop neither rolls RNG nor consumes or resets pity, including a full surrounding floor.
  const full=arena(Engine),elite=full.enemies[0];
  full.items=[[0,0],...DIRS].map(([dx,dy])=>({kind:'potion',amount:1,x:elite.x+dx,y:elite.y+dy}));
  full.int=()=>{throw Error('Elite drops must not roll RNG');};full.dropEcho(elite);
  assert(full.items.some(i=>i.kind==='echoShard'));assert.equal(full.player.echoPity,2);replay(full);
  // An elite parent splits into ordinary, unrewarding clones; no inherited elite farming.
  const split=arena(Engine,'bubbleSlime'),parent=split.enemies[0];split.hit(parent,1,'magic');
  const clone=split.enemies.find(v=>v.spawned);assert(clone&&!clone.elite);assert(parent.elite);assert.equal(clone.exp,1);replay(split);
  const oldPity=split.player.echoPity,gold=split.player.gold;split.hit(clone,999,'magic');
  assert.equal(split.player.gold,gold);assert.equal(split.player.echoPity,oldPity);assert.equal(split.items.length,0);
  const fresh=arena(Engine);delete fresh.player.echoPity;fresh.dropEcho(fresh.enemies[0]);
  assert(!Object.hasOwn(fresh.player,'echoPity'),'Elite rewards do not create a pity counter');
  for(const patch of [{elite:'true'},{elite:1},{house:true},{spawned:true,split:true},{maxHp:36},{attack:15},{exp:16},{name:'角甲虫'}]) {
    const bad=JSON.parse(arena(Engine).serialize());Object.assign(bad.state.enemies[0],patch);
    assert.equal(Engine.restore(JSON.stringify(bad)),null,JSON.stringify(patch));
  }
  const ordinary=arena(Engine);Object.assign(ordinary.enemies[0],monsterStats('hornBeetle'),{hp:36});delete ordinary.enemies[0].elite;replay(ordinary);
  const guardian=arena(Engine);guardian.enemies[0]={...monsterStats('starGuardian'),id:0,x:13,y:10,hp:65,elite:true};
  assert.equal(Engine.restore(guardian.serialize()),null,'Guardian saves cannot acquire a crown');
}
// Trial roster replacements must retain the crown and recompute the replacement species' stats.
let trialElites=0;
for(let seed=1;seed<=180;seed++) {
  const g=new StrategyEngine(seed);g.chooseKit('none');g.floor=5;g.generateFloor();
  for(const e of g.enemies)if(e.elite){trialElites++;const m=MONSTERS[e.species];assert.equal(e.maxHp,Math.ceil(m.hp*1.5));assert.equal(e.hp,e.maxHp);assert.equal(e.attack,Math.ceil(m.attack*1.2));}
  replay(g);
}
assert(trialElites>0);
// Crowns are independent shapes; mimic disguises and hidden enemies reveal none.
{
  const fs=require('node:fs'),vm=require('node:vm');
  for(const reduced of [false,true])for(const scenario of ['elite','ordinary','hidden','mimic','revealed']) {
    const g=arena(DungeonEngine,scenario==='mimic'||scenario==='revealed'?'coinMimic':'hornBeetle'),e=g.enemies[0];
    if(scenario==='ordinary'){Object.assign(e,monsterStats('hornBeetle'),{hp:36});delete e.elite;}
    e.hp--;if(scenario==='revealed')e.revealed=true;
    if(scenario==='hidden')g.visible.fill(false);
    if(e.type!=='mimic')e.intent={kind:'charge',x:10,y:10,dx:-1,dy:0,length:3};
    const frames=[],crowns=[],warnings=[],style={};
    const ctx=new Proxy({}, {get:(_,key)=>key==='createRadialGradient'?()=>({addColorStop(){}}):(...args)=>{
      if(key==='fill'&&style.fillStyle==='#f9d576')crowns.push(true);
      if(key==='fillText'&&args[0]==='!')warnings.push(args);
    },set:(_,key,value)=>{style[key]=value;return true;}});
    const canvas={width:880,height:576,getContext:()=>ctx,getBoundingClientRect:()=>({left:0,top:0,width:390,height:350})};
    const env=vm.createContext({DungeonData,performance:{now:()=>1000},requestAnimationFrame:fn=>frames.push(fn),
      createSpriteRenderer:()=>({sprite(){},paintedSprite:()=>true,heroSprite:()=> 'heroRight',hasAtlas:()=>true,walkFrameCount:()=>12})});
    vm.runInContext(fs.readFileSync(require.resolve('../dist/renderer.js'),'utf8'),env);
    const view=env.createDungeonRenderer({canvas,minimap:canvas,viewport:canvas,getEngine:()=>g,reduced});view.resize();view.start();
    crowns.length=warnings.length=0;const saved=g.serialize();frames.shift()(1000);
    assert.equal(crowns.length,scenario==='elite'||scenario==='revealed'?1:0,scenario);
    assert.equal(g.serialize(),saved,'Drawing crowns cannot change RNG, turns, HP or saves');
    if(scenario==='elite'){assert.equal(warnings.length,1);assert(g.attackVisual(e,g.player).source.elite,'Attack snapshots preserve the crown');}
  }
}
console.log(`PASS: elite depth/6% boundaries, house/guardian exclusions, stat rounding, fixed intents/replay, guaranteed no-RNG/no-pity drops (including crowded floors), split rewards, strict saves and trial roster scaling (${elites}/${eligible} eligible enemies).`);
