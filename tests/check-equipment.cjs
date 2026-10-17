const assert=require('node:assert/strict');
require('../dist/engine.js');
const {EQUIPMENT,MONSTERS,INVENTORY_CAPACITY}=DungeonData;
const legacyKeys={weapon:['woodSword','copperSword','ironSword','starSword'],shield:['travelerShield','copperShield','ironShield','starShield']};
const gear=(variant,bonus=0)=>{const kind=EQUIPMENT[variant]?.slot??'weapon';return{kind,variant,rank:Math.max(0,legacyKeys[kind].indexOf(variant)),bonus,cursed:false,identified:true};};
function arena(){
  const g=new DungeonEngine(42),r=g.roomAt(g.player.x,g.player.y);
  g.player.x=r.cx;g.player.y=r.cy;g.player.facing=[1,0];
  g.enemies=[];g.items=[];g.traps=[];g.monsterHouse=null;g.reveal();return g;
}

// Equipped weapons and shields each occupy one of the same 20 slots.
{
  const g=arena(),p=g.player;assert.equal(INVENTORY_CAPACITY,20);assert.equal(g.inventoryCount(),5);
  p.bag=[gear('starSword'),gear('mirrorShield'),...Array(15).fill('bread')];
  assert.equal(g.inventoryCount(),19);g.items=[{x:p.x,y:p.y,kind:'arrow',amount:10}];g.collect();
  assert.equal(g.inventoryCount(),20);assert.equal(g.arrowCount(),10);
  assert(g.use(0));assert(g.use(1));assert.equal(g.inventoryCount(),20);
  assert(g.equipArrow());assert.equal(g.inventoryCount(),20);assert(g.equipArrow());assert.equal(g.inventoryCount(),20);
  for(const kind of ['bread','starSword','mirrorShield']){
    g.items=[{x:p.x,y:p.y,...(EQUIPMENT[kind]?gear(kind):{kind})}];g.collect();assert.equal(g.items.length,1);assert.equal(g.inventoryCount(),20);
  }
  g.items=[{x:p.x,y:p.y,kind:'arrow',amount:10}];g.collect();assert.equal(g.inventoryCount(),20);assert.equal(g.arrowCount(),20);
  const raw=g.serialize(),restored=DungeonEngine.restore(raw);assert(restored);assert.equal(restored.inventoryCount(),20);assert.equal(restored.serialize(),raw);
  assert(g.use(2));assert.equal(g.inventoryCount(),19);
  g.items=[{x:p.x,y:p.y,kind:'potion'}];g.collect();assert.equal(g.inventoryCount(),20);
  g.items=[];assert(g.dropEquipment(0));assert.equal(g.inventoryCount(),19);g.collect();assert.equal(g.inventoryCount(),20);
  p.bag=Array(18).fill('bread');g.items=[{x:p.x,y:p.y,kind:'arrow',amount:1}];g.collect();assert.equal(g.items.length,1);assert.equal(g.arrowCount(),0);
  p.bag=[...Array(17).fill('bread'),'arrow'];assert.equal(g.inventoryCount(),20);assert(g.equipArrow());assert(g.shoot());assert.equal(g.inventoryCount(),19);
  const legacy=JSON.parse(g.serialize());delete legacy.state.identification;delete legacy.state.player.equipment;legacy.state.player.weapon=2;legacy.state.player.shield=1;legacy.state.player.bag=Array(16).fill('bread');
  const old=DungeonEngine.restore(JSON.stringify(legacy));assert(old);assert.equal(old.inventoryCount(),18);
  for(let i=0;i<3;i++){old.items=[{x:old.player.x,y:old.player.y,kind:'bread'}];old.collect();}
  assert.equal(old.inventoryCount(),20);assert.equal(old.items.length,1);
  const earlier=JSON.parse(g.serialize());delete earlier.state.identification;delete earlier.state.player.equipment;
  earlier.state.player.weapon={kind:'ghostSword',bonus:2};earlier.state.player.shield={kind:'copperShield',bonus:1};
  earlier.state.player.bag=[{kind:'pickaxe',bonus:0},'arrow'];
  earlier.state.items=[{x:p.x,y:p.y,kind:'mirrorShield',amount:1}];
  const variantSave=DungeonEngine.restore(JSON.stringify(earlier));assert(variantSave);
  assert.equal(variantSave.attackPower(),10);assert.equal(variantSave.defense(),4);assert.equal(variantSave.inventoryCount(),4);
  assert(variantSave.use(0));assert.equal(variantSave.attackPower(),9);
  assert.equal(DungeonEngine.restore(variantSave.serialize()).serialize(),variantSave.serialize());
}

// Dropping and exchanging preserve whole arrow stacks and individual gear state.
for(const kind of ['bread','potion','scroll','map','identify','uncurse','arrow']){
  const g=arena(),p=g.player;p.bag=kind==='arrow'?Array(27).fill(kind):[kind];
  if(kind==='arrow')p.ammo='arrow';
  const count=g.arrowCount();assert(g.drop(0));assert.equal(g.turn,1);assert.equal(p.bag.length,0);
  assert.equal(p.ammo,null);assert.equal(g.items[0].kind,kind);assert.equal(g.items[0].amount,kind==='arrow'?27:1);
  const restored=DungeonEngine.restore(g.serialize());assert(restored);restored.collect();
  assert.equal(restored.arrowCount(),count);assert.equal(restored.player.bag.length,kind==='arrow'?27:1);
}
for(const [outgoing,incoming]of [
  ['bread',{...gear('mirrorShield',-2),cursed:true,identified:false}],
  [gear('starSword',3),{kind:'identify'}],
  ['arrow',{kind:'potion'}],
  ['bread',{kind:'arrow',amount:27}],
  ['arrow',{kind:'arrow',amount:4}],
]){
  const g=arena(),p=g.player;p.bag=[outgoing,...Array(17).fill('bread')];
  if(outgoing==='arrow'){p.bag.push(...Array(26).fill('arrow'));p.ammo='arrow';}
  assert.equal(g.inventoryCount(),20);
  g.items=[{...incoming,x:p.x,y:p.y}];assert(g.drop(0,true));assert.equal(g.turn,1);assert.equal(g.inventoryCount(),20);
  assert.equal(g.items.length,1);assert.equal(g.items[0].kind,typeof outgoing==='string'?outgoing:outgoing.kind);
  if(outgoing==='arrow'){
    assert.equal(g.items[0].amount,27);assert.equal(g.arrowCount(),incoming.kind==='arrow'?4:0);
    assert.equal(p.ammo,incoming.kind==='arrow'?'arrow':null);
  }
  if(incoming.kind==='arrow'&&outgoing!=='arrow')assert.equal(g.arrowCount(),27);
  if(incoming.variant)assert.deepEqual(p.bag.at(-1),incoming);
  if(typeof outgoing==='object')for(const key of ['variant','bonus','cursed','identified'])assert.equal(g.items[0][key],outgoing[key]);
  assert.equal(DungeonEngine.restore(g.serialize()).serialize(),g.serialize());
}
{
  const g=arena(),p=g.player;p.bag=['bread'];
  for(const index of [-1,1,0.5,NaN])assert.equal(g.drop(index),false);
  assert.equal(g.drop(0,true),false);
  g.items=[{x:p.x,y:p.y,kind:'gold',amount:30}];
  assert.equal(g.drop(0,true),false);assert.equal(g.drop(0),false);
  assert.deepEqual(p.bag,['bread']);assert.equal(p.gold,0);assert.equal(g.turn,0);
  g.items=[];g.stairs={x:p.x,y:p.y};assert.equal(g.drop(0),false);
  g.items=[{x:p.x,y:p.y,kind:'potion'}];assert.equal(g.drop(0,true),false);
  g.stairs={x:p.x+1,y:p.y};g.status='dead';assert.equal(g.drop(0,true),false);
  assert.deepEqual(p.bag,['bread']);assert.equal(g.items[0].kind,'potion');assert.equal(g.turn,0);
}

// Identical RNG states use identical tables at every depth and in both dungeons.
for(const slot of ['weapon','shield']){
  let baseline;
  for(const dungeon of ['tutorial','depths'])for(const floor of [1,10,30]){
    const g=new DungeonEngine(42,dungeon,true);g.floor=floor;g.rng=123456;
    const rolls=Array.from({length:1000},()=>g.rollEquipment(slot));
    if(baseline)assert.deepEqual(rolls,baseline);else baseline=rolls;
  }
  assert.deepEqual([...new Set(baseline)].sort(),Object.keys(EQUIPMENT).filter(k=>EQUIPMENT[k].slot===slot).sort());
}
// Sample real generation: weak and rare gear both appear on 1F and the last floor.
for(const dungeon of ['tutorial','depths'])for(const floor of [1,dungeon==='tutorial'?10:30]){
  const counts={weapon:0,shield:0},kinds=new Set();
  for(let seed=1;seed<=1000;seed++){
    const g=new DungeonEngine(seed,dungeon,true);g.floor=floor;g.generateFloor();
    for(const item of g.items)if(item.variant){counts[item.kind]++;kinds.add(item.variant);}
  }
  assert.equal(kinds.size,16);
  for(const count of Object.values(counts))assert(count>300&&count<500);
}

{
  const g=arena(),p=g.player;p.bag=[];
  for(const kind of ['starSword','woodSword','starSword','mirrorShield']){g.items=[{x:p.x,y:p.y,...(EQUIPMENT[kind]?gear(kind):{kind})}];g.collect();}
  assert.equal(g.attackPower(),5);assert.equal(g.defense(),1);assert.equal(g.turn,0);
  assert.equal(g.inventoryEntries().length,4);assert(g.use(0));assert.equal(g.attackPower(),14);assert.equal(g.turn,1);
  assert.equal(g.equipmentPower(p.bag[0]),0);
  assert(g.use(2));assert.equal(g.attackPower(),14,'Duplicate equipment must not strengthen the player');
  assert(g.use(1));assert.equal(g.attackPower(),5,'Weaker equipment remains selectable');
  assert(g.use(3));assert.equal(g.defense(),3);
  const saved=g.serialize(),restored=DungeonEngine.restore(saved);assert(restored);assert.equal(restored.serialize(),saved);
  assert.deepEqual(restored.inventoryEntries(),g.inventoryEntries());assert(restored.use(0));assert.equal(restored.attackPower(),5);
  p.bag=Array.from({length:18},()=>gear('woodSword'));g.items=[{x:p.x,y:p.y,...gear('starShield')}];g.collect();
  assert.equal(g.items.length,1);assert.equal(g.inventoryEntries().length,18);assert(g.use(0));assert.equal(g.inventoryEntries().length,18);
  const legacy=JSON.parse(g.serialize());delete legacy.state.identification;delete legacy.state.player.equipment;legacy.state.player.weapon=5;legacy.state.player.shield=7;
  legacy.state.items=[{x:p.x,y:p.y,kind:'weapon'},{x:p.x+1,y:p.y,kind:'shield'}];
  const migrated=DungeonEngine.restore(JSON.stringify(legacy));assert(migrated);
  assert.equal(migrated.attackPower(),20);assert.equal(migrated.defense(),15);
  assert(migrated.items.every(i=>EQUIPMENT[i.variant]));assert.equal(DungeonEngine.restore(JSON.stringify(legacy)).serialize(),migrated.serialize());
  assert(migrated.use(0));assert.equal(migrated.equipmentPower(migrated.player.bag[0]),15);
  assert(migrated.use(0));assert.equal(migrated.attackPower(),20);
  assert.equal(DungeonEngine.restore(migrated.serialize()).serialize(),migrated.serialize());
  migrated.items=[];const turn=migrated.turn;
  assert(migrated.use(0));assert(migrated.dropEquipment(0));assert.equal(migrated.turn,turn+2);
  assert.equal(migrated.player.bag.length,17);assert.equal(migrated.items[0].bonus,6);
  const dropped=DungeonEngine.restore(migrated.serialize());assert(dropped);dropped.collect();
  assert.equal(dropped.equipmentPower(dropped.player.bag[17]),15);assert(dropped.use(17));assert.equal(dropped.attackPower(),20);
  const occupiedTurn=dropped.turn;dropped.items=[{x:dropped.player.x,y:dropped.player.y,kind:'bread'}];
  assert.equal(dropped.dropEquipment(0),false);assert.equal(dropped.turn,occupiedTurn);assert.equal(dropped.player.bag.length,18);
  const badDrop=JSON.parse(dropped.serialize());badDrop.state.items[0]={...badDrop.state.items[0],...gear('starSword'),bonus:-10};
  assert.equal(DungeonEngine.restore(JSON.stringify(badDrop)),null);
  for(const bad of [gear('missing'),gear('copperSword',-10),gear('copperSword',1.5),gear('copperShield')]){
    const s=JSON.parse(saved);s.state.player.equipment.weapon=bad;assert.equal(DungeonEngine.restore(JSON.stringify(s)),null);
  }
  for(const bad of [gear('missing'),gear('copperSword',-10),'copperSword',{kind:'bread',bonus:0}]){
    const s=JSON.parse(saved);s.state.player.bag.push(bad);assert.equal(DungeonEngine.restore(JSON.stringify(s)),null);
  }
}

// Exercise both melee entry points; sword traits must never enhance arrows or magic.
for(const action of ['attack','move'])for(const [kind,species,expected]of [['ghostSword','lanternGhost',16],['pickaxe','ironBeetle',9]]){
  const g=arena(),p=g.player,m=MONSTERS[species];p.equipment.weapon=gear(kind);p.weapon=p.equipment.weapon.rank;g.int=()=>0;
  const e={...m,species,maxHp:m.hp,x:p.x+1,y:p.y,hp:m.hp,id:1,awake:true};g.enemies=[e];
  if(action==='attack')g.attack();else g.move(1,0);
  assert.equal(m.hp-e.hp,expected);
  e.hp=m.hp;g.hit(e,12);assert.equal(m.hp-e.hp,12-(m.armor||0));
  e.hp=m.hp;g.hit(e,18,'magic');assert.equal(m.hp-e.hp,18);
}
{
  const g=arena();g.player.equipment.shield=gear('leatherShield');g.player.shield=0;
  for(let i=0;i<8;i++)g.wait();assert.equal(g.player.hunger,99);
  g.player.equipment.shield=gear('travelerShield');g.player.shield=0;for(let i=0;i<8;i++)g.wait();assert.equal(g.player.hunger,97);
  g.player.equipment.shield=gear('mirrorShield');g.player.shield=0;g.int=()=>0;
  for(const [species,distance,expected]of [['thornPlant',2,3],['stoneGolem',1,11],['caveBat',1,4]]){
    const p=g.player,m=MONSTERS[species],before=p.hp;
    const e={...m,species,maxHp:m.hp,x:p.x+distance,y:p.y,hp:m.hp,id:1,awake:true};
    if(species!=='caveBat')e.intent={x:p.x,y:p.y,kind:species==='thornPlant'?'ranged':'windup'};
    g.enemies=[e];g.reveal();g.enemyTurn();assert.equal(before-p.hp,expected);
  }
  g.enemies=[];g.player.hp=30;g.traps=[{x:g.player.x,y:g.player.y,spent:false}];g.int=()=>4;g.triggerTrap();assert.equal(g.player.hp,26);
  g.player.equipment.shield=gear('leatherShield');g.player.shield=0;const before=g.player.hunger;g.int=()=>0;
  g.enemyHit({...MONSTERS.lanternMoth,species:'lanternMoth'});assert.equal(g.player.hunger,before-3);
}
console.log('PASS: 12 equipment variants, depth-independent weighted rolls and 4,000 generated loot samples; pickup/swap/capacity, duplicate/weak gear, special melee/shield effects, exact saves and legacy power preserved.');
