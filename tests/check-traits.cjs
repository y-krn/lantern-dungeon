const assert=require('node:assert/strict');
require('../dist/engine.js');
const {MONSTERS}=DungeonData;
function arena(species,x=8,y=5){
  const g=new DungeonEngine(73);g.tiles.fill(0);g.items=[];g.traps=[];g.monsterHouse=null;
  g.rooms[0]={x:1,y:1,w:12,h:12,cx:7,cy:7};
  for(let yy=1;yy<=12;yy++)for(let xx=1;xx<=12;xx++)g.tiles[g.key(xx,yy)]=1;
  Object.assign(g.player,{x:5,y:5,hp:100,maxHp:100});g.stairs={x:12,y:12};
  const m=MONSTERS[species];g.enemies=[{species,type:m.type,name:m.name,x,y,id:1,hp:m.hp,maxHp:m.hp,attack:m.attack,exp:m.exp,awake:true}];
  g.reveal();return g;
}
{
  const g=arena('ironBeetle'),e=g.enemies[0];g.hit(e,8);assert.equal(e.hp,12);g.hit(e,8,'magic');assert.equal(e.hp,4);
  const h=arena('cobaltBeetle');h.hit(h.enemies[0],2);assert.equal(h.enemies[0].hp,48);
  h.player.bag=['scroll'];h.use(0);assert.equal(h.enemies[0].hp,30,'Scroll ignores shell armor');
}
{
  const g=arena('mossSlime');g.turn=1;g.enemyTurn();assert.deepEqual([g.enemies[0].x,g.enemies[0].y],[8,5]);
  g.turn=2;g.enemyTurn();assert.notDeepEqual([g.enemies[0].x,g.enemies[0].y],[8,5]);
  Object.assign(g.enemies[0],{x:6,y:5});g.turn=3;g.enemyTurn();assert(g.player.hp<100,'Slow enemies still attack each adjacent turn');
  const h=arena('caveBat',9),e=h.enemies[0];h.enemyTurn();assert.equal(Math.max(Math.abs(e.x-5),Math.abs(e.y-5)),2);assert.equal(h.player.hp,100);
  h.enemyTurn();assert.equal(Math.max(Math.abs(e.x-5),Math.abs(e.y-5)),1);assert.equal(h.player.hp,100,'Fast movement cannot also attack');
  h.enemyTurn();assert(h.player.hp<100);
}
for(const species of ['thornPlant','moonPlant','frostBat','thunderBat','lanternGhost','frostGhost','abyssGuardian']){
  const g=arena(species,8),e=g.enemies[0];g.enemyTurn();assert.deepEqual(e.intent,{x:5,y:5,kind:'ranged'});assert.equal(g.player.hp,100);
  const restored=DungeonEngine.restore(g.serialize());assert(restored);assert.equal(restored.serialize(),g.serialize());
  g.enemyTurn();assert(g.player.hp<100);assert.equal(e.intent,undefined);
  g.player.hp=100;g.enemyTurn();g.player.y=6;g.enemyTurn();assert.equal(g.player.hp,100,'Moving off the locked target dodges');
  if(MONSTERS[species].stationary)assert.deepEqual([e.x,e.y],[8,5]);
}
{
  const g=arena('thornPlant',9),e=g.enemies[0];g.tiles[g.key(7,5)]=0;g.enemyTurn();assert.equal(e.intent,undefined);assert.equal(g.player.hp,100);
  assert.equal(g.clearShot({x:8,y:8},{x:5,y:6},5),false,'Only straight or diagonal rays');
  g.tiles[g.key(7,5)]=1;g.enemies.push({...e,id:2,x:7,y:5,awake:false});assert.equal(g.clearShot(e,g.player,4),false,'Allies block shots');
  g.tiles[g.key(6,5)]=0;assert.equal(g.clearShot({x:7,y:7},g.player,4),false,'Diagonal rays cannot cut wall corners');
}
for(const species of ['starGuardian','stoneGolem','obsidianGolem']){
  const g=arena(species,6),e=g.enemies[0];g.enemyTurn();assert.equal(g.player.hp,100);assert.equal(e.intent.kind,'windup');
  g.player.y=6;g.enemyTurn();assert.equal(g.player.hp,100);assert.equal(e.intent,undefined);
  g.player.y=5;g.enemyTurn();g.enemyTurn();assert(g.player.hp<100);
}
for(const species of ['coinMimic','starMimic']){
  const g=arena(species),e=g.enemies[0];g.enemyTurn();assert.deepEqual([e.x,e.y],[8,5]);assert.equal(e.revealed,undefined);
  e.x=6;g.enemyTurn();assert.equal(e.revealed,true);assert.equal(g.player.hp,100,'Reveal offers a turn to react');
  const restored=DungeonEngine.restore(g.serialize());assert.equal(restored.enemies[0].revealed,true);g.enemyTurn();assert(g.player.hp<100);
  const h=arena(species);h.hit(h.enemies[0],1);assert.equal(h.enemies[0].revealed,true,'Attacking reveals immediately');
}
for(const species of ['jadeBat','jadeGhost','lanternMoth','eclipseMoth']){
  const g=arena(species,6);g.player.equipment.shield.bonus=200;g.enemyTurn();assert.equal(g.player.hp,99);assert.equal(g.player.hunger,100-MONSTERS[species].hunger);
  g.player.hunger=2;g.enemyTurn();assert.equal(g.player.hunger,0);g.enemyTurn();assert.equal(g.player.hunger,0);
}
for(const species of ['amberSlime','goldGhost']){
  const g=arena(species),e=g.enemies[0];e.hp=5;g.enemyTurn();assert.equal(e.hp,5+MONSTERS[species].regen);
  e.hp=e.maxHp-1;g.enemyTurn();assert.equal(e.hp,e.maxHp);e.hp=0;g.enemyTurn();assert.equal(e.hp,0);
}
{
  const g=arena('abyssGhost',8,8),e=g.enemies[0],before={x:e.x,y:e.y};g.hit(e,2);assert.equal(e.blinkPending,true);
  const restored=DungeonEngine.restore(g.serialize());assert(restored);g.enemyTurn();restored.enemyTurn();assert.equal(restored.serialize(),g.serialize(),'Blink replay is deterministic');
  assert.notDeepEqual([e.x,e.y],[before.x,before.y]);assert(Math.max(Math.abs(e.x-before.x),Math.abs(e.y-before.y))<=3);
  assert(Math.max(Math.abs(e.x-g.player.x),Math.abs(e.y-g.player.y))>=2);assert.equal(g.player.hp,100);assert.equal(e.hp,e.maxHp-2);
}
{
  const g=arena('thornPlant');g.enemyTurn();const raw=JSON.parse(g.serialize());raw.state.enemies[0].intent.x=-1;assert.equal(DungeonEngine.restore(JSON.stringify(raw)),null);
  const legacy=arena('lanternGhost');const saved=JSON.parse(legacy.serialize());delete saved.state.enemies[0].intent;assert(DungeonEngine.restore(JSON.stringify(saved)));
  for(const m of Object.values(MONSTERS)){assert(m.feature.length);assert(m.counter.length);}
}
console.log('PASS: armor/magic, cadence/speed, telegraph/dodge/LOS/blockers, stationary plants, mimic grace, hunger floor, regen/death, deterministic blink and saved intents.');
