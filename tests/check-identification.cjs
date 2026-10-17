const assert = require('node:assert/strict');
require('../dist/engine.js');
const scrolls=['scroll','map','identify','uncurse'];
const gear=(kind='weapon',cursed=false,bonus=2)=>({kind,rank:1,bonus,cursed,identified:false});
function quiet(seed=42,dungeon='depths'){
  const game=new DungeonEngine(seed,dungeon,true);game.enemies=[];game.items=[];game.traps=[];return game;
}

// Knowledge belongs to the run; equipment appraisal belongs to the individual.
{
  const game=quiet(),p=game.player,first=gear(),second=gear();p.bag=[first,second,'identify'];
  assert.equal(game.itemName(first),'銅の剣（未鑑定）');
  assert(!game.itemDescription(first).includes('補正 5'));
  assert.equal(game.use(2,99),false);assert.equal(game.turn,0);assert.equal(p.bag.length,3);
  assert.deepEqual(game.identification.known,['identify'],'Only the appraisal talisman starts known in the depths');
  assert.equal(game.itemName('identify'),'真名の灯札');
  assert(game.use(2,0));assert.equal(game.turn,1);assert.equal(p.bag.length,2);
  assert(first.identified);assert(!second.identified);assert(game.identification.known.includes('identify'));
  const before=game.attackPower();assert(game.equip(0));assert.equal(game.turn,2);
  assert.equal(game.attackPower(),before+5);assert.equal(p.equipment.weapon,first);
  assert.equal(p.bag[0].rank,0);assert.equal(game.itemName(second),'銅の剣（未鑑定）');
  assert(game.unequip('weapon'));assert.equal(game.turn,3);assert.equal(p.equipment.weapon,null);
  assert.equal(game.attackPower(),before);assert(game.equip(p.bag.indexOf(second)));assert(second.identified);
}
{
  const game=quiet(),p=game.player,cursed=gear('weapon',true,-1),spare=gear(),shield=gear('shield',true),bagCurse=gear('shield',true);
  p.bag=[cursed,spare,shield,bagCurse,'uncurse'];
  assert(game.equip(0));assert.equal(game.itemName(cursed),'銅の剣 -1（呪い）');
  assert.equal(game.unequip('weapon'),false);assert.equal(game.equip(1),false);assert(!spare.identified);
  assert.equal(game.turn,1);assert.equal(p.equipment.weapon,cursed);assert.equal(game.attackPower(),7);
  assert(game.equip(2));const power=game.attackPower(),defense=game.defense();
  assert(game.use(4));assert.equal(cursed.cursed,false);assert.equal(shield.cursed,false);
  assert.equal(bagCurse.cursed,true);assert.equal(game.attackPower(),power);assert.equal(game.defense(),defense);
  assert(game.unequip('weapon'));assert(game.equip(p.bag.indexOf(spare)));
}
{
  const game=quiet(),p=game.player,cursed=gear('shield',true);p.bag=[cursed,'identify'];
  assert(game.use(1,0));assert(cursed.identified&&cursed.cursed);
  assert(game.equip(0));p.bag.push('identify');assert(game.use(p.bag.length-1,'shield'));
  assert(cursed.cursed);assert.equal(game.unequip('shield'),false);
}
{
  const game=quiet(),p=game.player;p.bag=['map','map','scroll','identify'];
  assert.equal(new Set(scrolls.map(kind=>game.itemName(kind))).size,4);
  assert(!game.itemDescription('map').includes('地形'));assert(!game.itemName('map').includes('地図'));
  const original=game.itemName('map');assert(game.nameScroll(0,'地図？'));assert.equal(game.turn,0);
  assert(game.itemName('map').includes('地図？'));assert.deepEqual(game.identification.known,['identify']);
  const saved=game.serialize(),restored=DungeonEngine.restore(saved);assert(restored);assert.equal(restored.serialize(),saved);
  assert.equal(restored.itemName('map'),game.itemName('map'));
  assert(game.use(3,1));assert.equal(p.bag.length,3);assert.equal(game.itemName(p.bag[0]),'道しるべの灯札');
  assert.equal(game.itemName(p.bag[1]),'道しるべの灯札');assert(game.itemName('scroll').includes('未識別'));
  game.floor=2;game.generateFloor();assert.equal(game.itemName('map'),'道しるべの灯札');
  assert.equal(game.identification.appearances.map,original.replace('（未識別）',''));
  const again=new DungeonEngine(42,'depths',true);assert.deepEqual(again.identification.known,['identify']);
  assert.deepEqual(again.identification.names,{});assert.equal(again.itemName('map'),original);
  const appearances=new Set(Array.from({length:10},(_,i)=>JSON.stringify(new DungeonEngine(i+1,'depths',true).identification.appearances)));
  assert(appearances.size>1);assert.deepEqual(new DungeonEngine(42).identification.known,scrolls);
}
// Reading without an effective target still identifies a non-targeted scroll.
{
  const game=quiet(),p=game.player;p.bag=['scroll','scroll','uncurse'];
  assert(game.use(0));assert.equal(game.itemName(p.bag[0]),'雷光の灯札');assert.equal(game.turn,1);
  assert(game.use(1));assert.equal(game.itemName('uncurse'),'清めの灯札');
  p.bag=['identify','bread'];const saved=game.serialize();
  assert.equal(game.use(0),false);assert.equal(game.use(0,0),false);assert.equal(game.serialize(),saved);
  assert(game.use(0,1));assert.deepEqual(p.bag,['bread']);
}
// Equipped items occupy the same 24 slots; swaps and unequips preserve the count.
{
  const game=quiet(),p=game.player,item=gear();p.bag=[...Array.from({length:21},()=>({kind:'shield',rank:0,bonus:0,cursed:false,identified:true})),item];
  assert.equal(game.inventoryCount(),24);assert(game.equip(21));assert.equal(game.inventoryCount(),24);
  assert.equal(p.bag[21].rank,0);assert(game.unequip('weapon'));assert.equal(game.inventoryCount(),24);
  assert.equal(p.bag.length,23);assert(game.equip(22));assert.equal(game.inventoryCount(),24);
  assert(game.dropEquipment(21));assert.equal(game.inventoryCount(),23);
  const dropped=game.items[0];assert.equal(dropped.kind,'weapon');assert.equal(dropped.rank,0);
  assert(game.unequip('weapon'));assert.equal(game.inventoryCount(),23);
  game.collect();assert.equal(game.items.length,0);assert.equal(game.inventoryCount(),24);
  const raw=game.serialize();assert.equal(DungeonEngine.restore(raw).serialize(),raw);
}
// Legacy strength and known consumables survive migration without inventing curses.
{
  const game=quiet(),saved=JSON.parse(game.serialize());delete saved.state.identification;delete saved.state.player.equipment;
  saved.state.player.weapon=5;saved.state.player.shield=4;
  saved.state.items=[{x:game.player.x,y:game.player.y,kind:'weapon',amount:1}];
  const restored=DungeonEngine.restore(JSON.stringify(saved));assert(restored);
  assert.equal(restored.attackPower(),20);assert.equal(restored.defense(),9);
  assert.deepEqual(restored.identification.known,scrolls);assert(!restored.player.equipment.weapon.cursed);
  assert.equal(restored.items[0].identified,false);assert.equal(restored.items[0].bonus,0);
  const raw=restored.serialize();assert.equal(DungeonEngine.restore(raw).serialize(),raw);
}
// Old built-in names migrate while notes, inventory, curses and RNG remain intact.
{
  const game=quiet(),saved=JSON.parse(game.serialize()),state=saved.state;
  state.player.bag=['identify','uncurse',gear('weapon',true,-1)];
  state.identification.known=['identify'];state.identification.names.uncurse='解呪？';
  for(const kind of scrolls)state.identification.appearances[kind]=state.identification.appearances[kind].replace('灯札','巻物');
  state.log=[{text:'インパスの巻物とシャナクの巻物を拾った。',type:'normal',turn:0},{text:'雷の巻物を読んだ！',type:'normal',turn:0}];
  const restored=DungeonEngine.restore(JSON.stringify(saved));assert(restored);
  assert.deepEqual(restored.player,state.player);assert.equal(restored.rng,state.rng);assert.equal(restored.turn,state.turn);
  assert.deepEqual(restored.identification.known,['identify']);assert.equal(restored.identification.names.uncurse,'解呪？');
  assert.equal(restored.itemName('identify'),'真名の灯札');assert(restored.itemName('uncurse').includes('灯札'));
  assert.equal(restored.log[0].text,'真名の灯札と清めの灯札を拾った。');assert.equal(restored.log[1].text,'雷光の灯札をかざした！');
  const raw=restored.serialize();assert.equal(DungeonEngine.restore(raw).serialize(),raw);
}
// Reject corrupt appearance maps, notes and equipment instead of silently losing saves.
{
  const game=quiet();game.player.bag=[gear()];
  for(const mutate of [
    s=>s.identification.known.push('unknown'),
    s=>s.identification.appearances.map=s.identification.appearances.scroll,
    s=>s.identification.names.scroll=23,
    s=>s.player.bag[0].bonus=Infinity,
    s=>s.player.bag[0].cursed='true',
    s=>s.player.equipment.weapon.identified=false,
    s=>delete s.player.equipment,
    s=>s.player.bag.push('weapon'),
  ]){
    const saved=JSON.parse(game.serialize());mutate(saved.state);assert.equal(DungeonEngine.restore(JSON.stringify(saved)),null);
  }
}
console.log('PASS: equipment appraisal/curses/swapping, scroll knowledge/naming/target cancellation, save migration and corrupt-state rejection.');
