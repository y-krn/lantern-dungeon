const assert = require('node:assert/strict');
require('../dist/engine.js');
const StrategyEngine = require('../dist/strategy.js');
const {MONSTERS, MONSTER_POOLS, ECHO_SOURCES, DIRS, monsterStats} = DungeonData;
function arena(Engine = DungeonEngine) {
  const g = new Engine(1044);
  if (g.strategyTrial) g.chooseKit('none');
  g.tiles.fill(0);
  for (let y = 1; y <= 24; y++) for (let x = 1; x <= 38; x++) g.tiles[g.key(x, y)] = 1;
  g.rooms = [{x:1,y:1,w:18,h:20,cx:10,cy:10}, ...[22,26,30].map(x => ({x,y:2,w:3,h:3,cx:x+1,cy:3}))];
  g.enemies = []; g.items = []; g.traps = []; g.surfaces = []; g.monsterHouse = null; g.shrine = null; g.merchant = null;
  Object.assign(g.player, {x:10,y:10,hp:300,maxHp:300,facing:[1,0],bag:[],exp:0,nextExp:10000});
  g.stairs = {x:18,y:20}; g.log = []; g.effects = []; g.reveal();
  return g;
}
function enemy(g, species, x = 13, y = 10, id = g.enemies.length) {
  const e = {...monsterStats(species), hp:MONSTERS[species].hp, x,y,id,awake:true};
  g.enemies.push(e); g.reveal(); return e;
}
function replay(g) {
  g.reveal();
  const restored = (g.strategyTrial ? StrategyEngine : DungeonEngine).restore(g.serialize());
  assert(restored, 'The new state must restore');
  assert.equal(restored.serialize(), g.serialize());
  return restored;
}
const additions = ['bubbleSlime','rustSlime','mudSlime','thiefBat','bellBat','hornBeetle','mirrorBeetle','snareVine','blastMoth','archerGhost','mendGhost','wardGolem'];
assert.equal(Object.keys(MONSTERS).length, 39);
assert.equal(new Set(Object.values(MONSTERS).map(m => m.type)).size, 9);
assert.deepEqual(MONSTER_POOLS[0], ['mossSlime']);
for (const species of additions) {
  const m = MONSTERS[species];
  assert(m.feature && m.counter && m.story && ECHO_SOURCES[species]);
  assert(MONSTER_POOLS[m.tier].includes(species));
}
for (const s of ['archerGhost','mirrorBeetle','wardGolem']) assert(MONSTER_POOLS[6].includes(s));
for (const Engine of [DungeonEngine, StrategyEngine]) {
  // Splitting preserves total HP, happens at most once, and adds the last ID.
  {
    const g = arena(Engine), e = enemy(g,'bubbleSlime');
    enemy(g,'thornPlant',18,14,7);
    g.hit(e,5,'magic');
    const clone = g.enemies.find(v => v.spawned);
    assert.equal(e.hp,5); assert.equal(clone.hp,4); assert.equal(clone.id,8);
    assert(e.split && clone.split); assert.equal(clone.exp,1); replay(g);
    g.hit(e,1,'magic'); g.hit(clone,1,'magic'); assert.equal(g.enemies.length,3);
    const gold = g.player.gold, pity = g.player.echoPity;
    g.hit(clone,999,'magic'); assert.equal(g.player.exp,1); assert.equal(g.player.gold,gold);
    assert.equal(g.player.echoPity,pity); assert(!g.items.some(i=>i.kind==='echoShard'));
    const low = arena(Engine), tiny = enemy(low,'bubbleSlime'); low.hit(tiny,11,'magic'); assert.equal(low.enemies.length,1);
    const tight = arena(Engine), trapped = enemy(tight,'bubbleSlime');
    for (const [dx,dy] of DIRS) tight.tiles[tight.key(trapped.x+dx,trapped.y+dy)] = 0;
    tight.hit(trapped,1,'magic'); assert.equal(tight.enemies.length,1); assert(!trapped.split);
    const order = arena(Engine), last = enemy(order,'bubbleSlime',14,10,9), first = enemy(order,'thornPlant',16,10,2);
    order.hit(last,1,'magic'); const ids=[];
    order.canStep=()=>false; order.wakeEnemy=e=>{ids.push(e.id);e.awake=true;};
    order.enemyTurn(); assert.deepEqual(ids,[first.id,last.id,10]);
  }
  // Corrosion caps at -3 and does not affect a bare or ranged target.
  {
    const g = arena(Engine), e = enemy(g,'rustSlime',11);
    const shield = g.player.equipment.shield; shield.bonus=0; shield.identified=false;
    g.enemyHit(e); assert.equal(shield.bonus,-1); assert(shield.identified);
    g.enemyHit(e,true); assert.equal(shield.bonus,-1);
    shield.bonus=-3; g.enemyHit(e); assert.equal(shield.bonus,-3);
    g.player.equipment.shield=null; g.enemyHit(e);
  }
  // Mud is laid on the origin only and cannot erase stairs or existing terrain.
  for (const surface of [null,'oil','grass','stairs']) {
    const g = arena(Engine), e = enemy(g,'mudSlime'), origin={x:e.x,y:e.y};
    if (surface==='stairs') g.stairs={...origin}; else if(surface)g.setSurface(e.x,e.y,surface);
    g.enemyTurn(); assert.notDeepEqual({x:e.x,y:e.y},origin);
    assert.equal(g.surfaceAt(origin.x,origin.y)?.type,surface===null?'water':surface==='stairs'?undefined:surface);
    replay(g);
  }
  // Thieves take a single consumable, flee without attacking, return it on death.
  {
    const g = arena(Engine), e = enemy(g,'thiefBat',11);
    const gear = {kind:'weapon',rank:0,bonus:0,cursed:false,identified:true};
    g.player.bag=['arrow',gear,'potion']; g.enemyHit(e);
    assert.equal(e.stolen,'potion'); assert.deepEqual(g.player.bag,['arrow',gear]); replay(g);
    const hp=g.player.hp; g.enemyTurn(); assert.equal(g.player.hp,hp);
    assert(Math.max(Math.abs(e.x-10),Math.abs(e.y-10))===3);
    g.hit(e,999,'magic'); assert(g.items.some(i=>i.kind==='potion'));
    const bare=arena(Engine), bat=enemy(bare,'thiefBat',11);bare.player.bag=['arrow',gear];bare.enemyHit(bat);assert(!bat.stolen);
    const floor=arena(Engine), thief=enemy(floor,'thiefBat',11);floor.player.bag=['bread'];floor.enemyHit(thief);
    floor.floor++;floor.generateFloor();assert(!floor.player.bag.includes('bread'));assert(!floor.enemies.some(v=>v.stolen));
  }
  // Calls occur on the wake transition, include same-room and nearby allies only.
  {
    const g=arena(Engine), bell=enemy(g,'bellBat',17,5), roomMate=enemy(g,'thornPlant',2,2), near=enemy(g,'thornPlant',20,5), far=enemy(g,'thornPlant',31,20);
    for(const e of g.enemies)e.awake=false;
    g.wakeEnemy(bell);assert(roomMate.awake && near.awake);assert(!far.awake);
    roomMate.awake=false;g.wakeEnemy(bell);assert(!roomMate.awake);
    replay(g);
    const h=arena(Engine), hidden=enemy(h,'bellBat',30,20), friend=enemy(h,'thornPlant',31,20);
    hidden.awake=friend.awake=false;h.visible.fill(false);h.log=[];h.effects=[];h.wakeEnemy(hidden);
    assert(friend.awake);assert.equal(h.log.length,0);assert.equal(h.effects.length,0);
  }
  // Locked charge intent, dodge, landing traps, walls/stun and actor collision.
  {
    const g=arena(Engine), e=enemy(g,'hornBeetle',14);
    g.enemyTurn();assert.deepEqual(e.intent,{kind:'charge',x:10,y:10,dx:-1,dy:0,length:4});
    const restored=replay(g);g.player.y=restored.player.y=11;g.enemyTurn();restored.enemyTurn();
    assert.equal(g.serialize(),restored.serialize());assert.equal(e.x,9);assert.equal(g.player.hp,300);
    const h=arena(Engine), charger=enemy(h,'hornBeetle',13);h.int=(a,b)=>a===-1?0:a;
    h.player.equipment.shield=null;h.traps=[{x:9,y:10,type:'spike',found:false}];h.enemyTurn();h.enemyTurn();
    assert.equal(charger.x,11);assert.equal(h.player.x,9);assert(h.traps[0].found);assert.equal(h.player.hp,300-(23-h.defense())-2);
    const wall=arena(Engine), bug=enemy(wall,'hornBeetle',13);wall.enemyTurn();wall.player.y=11;wall.tiles[wall.key(11,10)]=0;
    wall.enemyTurn();assert.equal(bug.hp,30);assert(bug.stunned);replay(wall);
    const before={x:bug.x,y:bug.y};wall.enemyTurn();assert(!bug.stunned);assert.deepEqual({x:bug.x,y:bug.y},before);
    const collide=arena(Engine), beetle=enemy(collide,'hornBeetle',13);collide.enemyTurn();const block=enemy(collide,'wardGolem',12);
    collide.enemyTurn();assert.equal(beetle.hp,28);assert.equal(block.hp,54);
    const trapped=arena(Engine), runner=enemy(trapped,'hornBeetle',13);trapped.enemyTurn();trapped.player.y=11;
    trapped.traps=[{x:12,y:10,type:'fire',found:false}];trapped.enemyTurn();assert.equal(runner.hp,30);assert(trapped.traps[0].found);
    for(const setup of [a=>a.tiles[a.key(12,10)]=0,a=>enemy(a,'thornPlant',12),a=>a.player.y=12,a=>a.player.x=8]) {
      const a=arena(Engine), b=enemy(a,'hornBeetle',13);setup(a);a.enemyTurn();assert(!b.intent);
    }
  }
  // Mirror reflects both projectile paths, never adds thunder, leaves melee/magic intact.
  {
    for(const kind of ['arrow','melee','magic']) {
      const g=arena(Engine), e=enemy(g,'mirrorBeetle');g.hit(e,11,kind);
      assert.equal(e.hp,kind==='arrow'?56:45);assert.equal(g.player.hp,kind==='arrow'?294:300);
    }
    const g=arena(Engine), e=enemy(g,'mirrorBeetle');g.player.echo='lanternGhost';
    g.attack();assert.equal(e.hp,56);assert(g.player.hp<300);
    const h=arena(Engine), mirror=enemy(h,'mirrorBeetle'), other=enemy(h,'wardGolem',14);
    h.player.bag=['arrow'];h.player.ammo='arrow';h.player.infusion={kind:'thunder',shots:5};h.setSurface(13,10,'water');h.setSurface(14,10,'water');
    h.shoot();assert.equal(mirror.hp,56);assert.equal(other.hp,62);assert.equal(h.player.infusion.shots,4);
  }
  // Snare shares the trial binding field: block one move, allow attacks and tools.
  {
    const g=arena(Engine), e=enemy(g,'snareVine');g.wait();g.wait();assert.equal(g.player.bindUntil,g.turn+1);replay(g);
    assert.equal(g.move(0,1),false);g.attack();assert(g.move(0,1));
    const h=arena(Engine);enemy(h,'snareVine');h.wait();h.wait();h.player.bag=['potion'];assert(h.use(0));
    for(const type of ['grass','fog']){const a=arena(Engine),v=enemy(a,'snareVine');a.setSurface(10,10,type,type==='fog'?5:undefined);a.enemyTurn();assert(!v.intent);}
  }
  // Burst chains are queued; all ordinary victims still grant normal rewards.
  {
    const g=arena(Engine), a=enemy(g,'blastMoth',11), b=enemy(g,'blastMoth',12), victim=enemy(g,'mossSlime',12,11), far=enemy(g,'wardGolem',15);
    b.hp=10;g.setSurface(10,11,'oil');g.setSurface(11,11,'grass');g.player.echoPity=4;
    g.hit(a,100,'magic');assert(b.hp<=0 && victim.hp<=0);assert.equal(far.hp,62);assert.equal(g.player.hp,290);
    assert.equal(g.player.exp,31);assert(g.player.gold>0);assert(g.items.some(i=>i.kind==='echoShard'));
    assert.equal(g.surfaceAt(10,11).type,'fire');assert.equal(g.surfaceAt(11,11).type,'fire');assert(!g.burstQueue);
    const hidden=arena(Engine), moth=enemy(hidden,'blastMoth',30,20), ally=enemy(hidden,'mossSlime',31,20);
    hidden.visible.fill(false);hidden.log=[];hidden.effects=[];hidden.hit(moth,100,'magic');
    assert(ally.hp<=0);assert.equal(hidden.log.length,0);assert.equal(hidden.effects.length,0);
  }
  // Ranged spacing retreats; blocked spacing falls back to a melee hit.
  for(const species of ['archerGhost','mendGhost']) {
    const g=arena(Engine), e=enemy(g,species,11);g.enemyTurn();
    assert(Math.max(Math.abs(e.x-10),Math.abs(e.y-10))>=2);assert(!e.intent);assert.equal(g.player.hp,300);
    const h=arena(Engine), boxed=enemy(h,species,11);
    for(const [dx,dy]of DIRS)if(!(boxed.x+dx===10&&boxed.y+dy===10))h.tiles[h.key(boxed.x+dx,boxed.y+dy)]=0;
    h.enemyTurn();assert(h.player.hp<300);assert(!boxed.intent);
    replay(g);
  }
  {
    const g=arena(Engine), healer=enemy(g,'mendGhost',14), a=enemy(g,'wardGolem',15), b=enemy(g,'mirrorBeetle',15,11);
    a.hp=31;b.hp=7;g.enemyTurn();assert.equal(a.hp,31);assert.equal(b.hp,15);assert.equal(healer.x,14);
    const alone=arena(Engine), solo=enemy(alone,'mendGhost',15);alone.enemyTurn();assert.notEqual(solo.x,15);
    const h=arena(Engine), ghost=enemy(h,'archerGhost',14);h.enemyTurn();assert.equal(ghost.intent.kind,'ranged');replay(h);
    h.enemyTurn();assert(h.player.hp<300);
  }
  for(const kind of ['melee','arrow','magic']) {
    const g=arena(Engine), e=enemy(g,'wardGolem');g.hit(e,11,kind);assert.equal(e.hp,kind==='magic'?51:56);
  }
  // Untrusted save fields are rejected while older saves without them still load.
  {
    const g=arena(Engine), e=enemy(g,'hornBeetle');g.enemyTurn();replay(g);
    for(const [key,value]of [['length',0],['length',5],['dx',2],['dy',NaN]]) {
      const bad=JSON.parse(g.serialize());bad.state.enemies[0].intent[key]=value;
      assert.equal(Engine.restore(JSON.stringify(bad)),null);
    }
    for(const patch of [{split:1},{spawned:true},{stolen:'arrow'},{stunned:'yes'}]) {
      const bad=JSON.parse(g.serialize());Object.assign(bad.state.enemies[0],patch);assert.equal(Engine.restore(JSON.stringify(bad)),null);
    }
    delete e.intent;replay(g);
    g.player.bindUntil=g.turn+3;assert.equal(Engine.restore(g.serialize()),null);
  }
}
// Warning geometry and low-HP brightness are render-only, including reduced motion.
{
  const fs=require('node:fs'),vm=require('node:vm');
  for(const reduced of [false,true]) {
    const g=arena(),bug=enemy(g,'hornBeetle',14),moth=enemy(g,'blastMoth',12,11);moth.hp=9;
    bug.intent={kind:'charge',x:10,y:10,dx:-1,dy:0,length:4};g.reveal();
    const frames=[],marks=[],filters=[],style={};
    const ctx=new Proxy({}, {get:(_,key)=>key==='createRadialGradient'?()=>({addColorStop(){}}):(...args)=>{
      if(key==='strokeRect'&&style.strokeStyle==='#ffdf85')marks.push(args);
    },set:(_,key,value)=>{style[key]=value;if(key==='filter')filters.push(value);return true;}});
    const canvas={width:880,height:576,getContext:()=>ctx,getBoundingClientRect:()=>({left:0,top:0,width:390,height:350})};
    const env=vm.createContext({DungeonData,performance:{now:()=>1000},requestAnimationFrame:fn=>frames.push(fn),
      createSpriteRenderer:()=>({sprite(){},paintedSprite:()=>true,heroSprite:()=> 'heroRight',hasAtlas:()=>true,walkFrameCount:()=>12})});
    vm.runInContext(fs.readFileSync(require.resolve('../dist/renderer.js'),'utf8'),env);
    const view=env.createDungeonRenderer({canvas,minimap:canvas,viewport:canvas,getEngine:()=>g,reduced});view.resize();view.start();
    marks.length=filters.length=0;const saved=g.serialize();frames.shift()(1000);
    assert.equal(marks.length,4,'All four charge cells are marked');
    assert(filters.some(v=>v.startsWith('brightness(')),'Low-HP burst moths brighten');
    assert.equal(g.serialize(),saved,'Rendering never changes turns, RNG or saves');
    if(reduced)assert(filters.includes('brightness(1.35)'),'Reduced motion uses steady brightness');
  }
}
console.log('PASS: 12 new species, spawn/echo coverage, split rewards/IDs, corrosion, mud, theft, wake calls, charge/dodge/traps/stun/collision, mirror/thunder, binding, queued burst, kite/mend/ward, hidden information and normal/trial save replay.');
