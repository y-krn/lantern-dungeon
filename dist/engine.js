(function (root) {
  'use strict';
  const W = 44, H = 30;
  const DIRS = [[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
  const ITEMS = {
    bread: {name:'焼きたてパン',icon:'◒',description:'満腹度を50回復。お腹が空く前にひと休み。'},
    potion: {name:'回復草',icon:'✿',description:'体力を25回復。ピンチの前に使いましょう。'},
    scroll: {name:'雷の巻物',icon:'▤',description:'見えている敵すべてに18ダメージ。'},
    map: {name:'地図の巻物',icon:'▧',description:'この階の地形と階段の場所を明らかにします。'},
    arrow: {name:'木の矢',icon:'➶',description:'装備して「矢を放つ」で向いている方向へ発射。1本消費し、最初の敵に12ダメージ。'},
    identify: {name:'インパスの巻物',icon:'▤',description:'選んだ持ち物1つを鑑定します。巻物は同じ種類すべて、剣・盾はその1つの補正値と呪いが判明します。'},
    uncurse: {name:'シャナクの巻物',icon:'▤',description:'装備中の剣・盾の呪いをすべて解きます。持ち物にある未装備の品には効きません。'},
    weapon: {name:'剣',icon:'⚔',description:'装備すると補正値と呪いが判明します。呪われた装備は外せません。'},
    shield: {name:'盾',icon:'◈',description:'装備すると補正値と呪いが判明します。呪われた装備は外せません。'}
  };
  const SCROLLS=['scroll','map','identify','uncurse'];
  const SCROLL_NAMES=['赤い巻物','青い巻物','黄色い巻物','緑の巻物'];
  const EQUIPMENT_NAMES={weapon:['木の剣','銅の剣','鉄の剣','星鉄の剣'],shield:['旅人の盾','銅の盾','鉄の盾','星鉄の盾']};
  const itemKind=item=>typeof item==='string'?item:item?.kind;
  const isEquipment=item=>!!item&&typeof item==='object'&&Object.hasOwn(EQUIPMENT_NAMES,item.kind);
  const validEquipment=item=>isEquipment(item)&&Number.isInteger(item.rank)&&item.rank>=0&&item.rank<=3&&Number.isInteger(item.bonus)&&item.bonus>=-9&&item.bonus<=99&&typeof item.cursed==='boolean'&&typeof item.identified==='boolean';
  const ITEM_ORDER = Object.keys(ITEMS);
  const FLOOR_NAMES=['苔むした入口','静かな回廊','忘れられた倉庫','ひかり草の庭','古井戸の底','眠れる鉱山','月影の遺跡','深淵の回廊','星を待つ間','ランタンの聖域'];
  const DEPTH_NAMES=['封じられた入口','冷たい石廊','影の倉庫','枯れ草の庭','底なしの井戸','黒鉄の鉱山','月蝕の遺跡','闇の回廊','沈黙の間','深淵の門','霧の地下道','崩れた礼拝堂','灰の書庫','忘却の庭','凍える水路','古代の採掘場','亡霊の広場','黄昏の回廊','祈りの残響','星なき祭壇','虚ろな石廊','黒曜の倉庫','眠らぬ庭園','奈落の井戸','深層の鉱脈','砕けた王座','影の聖堂','最後の回廊','番人の間','深淵の聖域'];
  const DUNGEONS={
    tutorial:{name:'灯りの迷宮',label:'チュートリアル',floors:10,treasure:'星のランタン',guardian:'星の番人',bossHp:65,bossAttack:14,bossExp:30,names:FLOOR_NAMES},
    depths:{name:'深淵の迷宮',label:'高難度',floors:30,treasure:'深淵のランタン',guardian:'深淵の番人',bossHp:180,bossAttack:34,bossExp:100,names:DEPTH_NAMES}
  };
  const LAYOUT_NAMES={branch:'枝分かれの迷宮',ring:'巡る回廊',hall:'大広間の迷宮'};
  const MONSTERS={
    mossSlime:{type:'slime',tier:0,name:'苔スライム',hp:9,attack:3,exp:3,color:'苔色',colors:['#4e6658','#869374','#a4c69b']},
    amberSlime:{type:'slime',tier:1,name:'琥珀スライム',hp:15,attack:6,exp:5,color:'琥珀色',colors:['#8f482c','#da8b45','#ffd293']},
    caveBat:{type:'bat',tier:1,name:'洞窟コウモリ',hp:17,attack:7,exp:7,color:'紫',colors:['#564764','#87759b','#d49bba']},
    emberBat:{type:'bat',tier:2,name:'紅翼コウモリ',hp:25,attack:10,exp:9,color:'赤',colors:['#83354a','#d85d72','#ffa899']},
    frostBat:{type:'bat',tier:3,name:'氷翼コウモリ',hp:35,attack:14,exp:11,color:'水色',colors:['#365e91','#6cb9e6','#c0edff']},
    thunderBat:{type:'bat',tier:4,name:'雷翼コウモリ',hp:45,attack:18,exp:14,color:'黄',colors:['#8d6933','#e1bd54','#fff2a0']},
    jadeBat:{type:'bat',tier:5,name:'翡翠コウモリ',hp:55,attack:22,exp:16,color:'翡翠色',colors:['#286961','#56b89a','#b2f1cf']},
    obsidianBat:{type:'bat',tier:6,name:'黒曜コウモリ',hp:69,attack:27,exp:20,color:'銀灰色',colors:['#41485f','#8c99ad','#d4deed']},
    lanternGhost:{type:'ghost',tier:2,name:'灯りの亡霊',hp:27,attack:11,exp:11,color:'薄桃色',colors:['#675777','#87759b','#d49bba']},
    frostGhost:{type:'ghost',tier:3,name:'氷灯の亡霊',hp:37,attack:15,exp:13,color:'水色',colors:['#365e91','#6cb9e6','#c0edff']},
    goldGhost:{type:'ghost',tier:4,name:'黄金の亡霊',hp:47,attack:19,exp:16,color:'金色',colors:['#8d6933','#e1bd54','#fff2a0']},
    jadeGhost:{type:'ghost',tier:5,name:'翡翠の亡霊',hp:57,attack:23,exp:18,color:'翡翠色',colors:['#286961','#56b89a','#b2f1cf']},
    abyssGhost:{type:'ghost',tier:6,name:'深淵の亡霊',hp:71,attack:28,exp:22,color:'銀紫色',colors:['#53406d','#a494cc','#e7d9ff']},
    starGuardian:{type:'guardian',tier:4,name:'星の番人',hp:65,attack:14,exp:30,color:'金色',colors:['#76563c','#b99a58','#ffe7a6']},
    abyssGuardian:{type:'guardian',tier:6,name:'深淵の番人',hp:180,attack:34,exp:100,color:'青紫色',colors:['#353e75','#7f8de0','#ccecff']},
    ironBeetle:{type:'beetle',tier:1,name:'鉄殻甲虫',hp:18,attack:5,exp:7,color:'鉄灰色',colors:['#3d4b59','#7f97a2','#c7dde0']},
    cobaltBeetle:{type:'beetle',tier:4,name:'蒼鋼甲虫',hp:49,attack:16,exp:16,color:'鋼青色',colors:['#284a70','#528fcd','#b4e5ff']},
    thornPlant:{type:'plant',tier:2,name:'棘吐き草',hp:20,attack:8,exp:10,color:'若草色',colors:['#3b5e37','#80a855','#dcad81']},
    moonPlant:{type:'plant',tier:5,name:'月光花',hp:48,attack:20,exp:19,color:'月白色',colors:['#4c6083','#9cadce','#f5efcb']},
    coinMimic:{type:'mimic',tier:1,name:'金貨ミミック',hp:20,attack:8,exp:10,color:'金色',colors:['#77552d','#d2a457','#ffdf91']},
    starMimic:{type:'mimic',tier:5,name:'星貨ミミック',hp:64,attack:24,exp:25,color:'白金色',colors:['#647282','#afc9d2','#f4f3d5']},
    lanternMoth:{type:'moth',tier:1,name:'灯喰い蛾',hp:12,attack:4,exp:6,color:'橙色',colors:['#775045','#dc9860','#ffe2a3']},
    eclipseMoth:{type:'moth',tier:4,name:'月蝕蛾',hp:38,attack:15,exp:17,color:'藍紫色',colors:['#433969','#9c85c9','#dce1ff']},
    stoneGolem:{type:'golem',tier:2,name:'石拳ゴーレム',hp:34,attack:14,exp:14,color:'石灰色',colors:['#515852','#909d8a','#d5ddbd']},
    obsidianGolem:{type:'golem',tier:6,name:'黒曜ゴーレム',hp:86,attack:32,exp:30,color:'黒紫色',colors:['#37364d','#77718d','#c8bce5']}
  };
  Object.assign(MONSTERS.mossSlime,{trait:'slow',speed:1,cadence:2,feature:'2ターンに1歩進みます。隣接中は毎ターン攻撃します。',counter:'距離を取って矢で攻撃。追いかけられても離れやすい相手です。'});
  Object.assign(MONSTERS.amberSlime,{trait:'regen',regen:1,feature:'毎ターンHPを1回復します。',counter:'攻撃を続け、回復する隙を与えずに倒しましょう。'});
  for(const key of ['caveBat','emberBat','obsidianBat'])Object.assign(MONSTERS[key],{trait:'fast',speed:2,feature:'1ターンに最大2歩接近します。移動したターンは攻撃しません。',counter:'早めに矢で迎撃。距離2でも次の行動で隣接します。'});
  for(const [key,range]of [['frostBat',3],['thunderBat',4],['lanternGhost',3],['frostGhost',4],['abyssGuardian',5]])Object.assign(MONSTERS[key],{trait:'ranged',range,feature:`直線${range}マス以内の1マスを狙い、次のターンに遠距離攻撃します。`,counter:'狙われたマスから移動。壁や別の敵でも射線を遮れます。'});
  for(const [key,hunger]of [['jadeBat',3],['jadeGhost',4],['lanternMoth',3],['eclipseMoth',5]])Object.assign(MONSTERS[key],{trait:'hunger',hunger,feature:`近接攻撃が当たると、体力に加えて満腹度を${hunger}減らします。`,counter:'矢で先に倒すか、パンを温存して接近戦を短くしましょう。'});
  Object.assign(MONSTERS.goldGhost,{trait:'regen',regen:3,feature:'毎ターンHPを3回復します。',counter:'矢と剣を組み合わせ、短いターンで倒しましょう。'});
  Object.assign(MONSTERS.abyssGhost,{trait:'blink',feature:'攻撃を受けると、次の行動で同じ部屋の3マス以内へ転移します。転移中は攻撃しません。',counter:'転移先を確認して矢で追撃。通路では転移できません。'});
  for(const key of ['ironBeetle','cobaltBeetle']){const armor=key==='ironBeetle'?2:4;Object.assign(MONSTERS[key],{trait:'armor',armor,feature:`剣と矢のダメージを${armor}軽減します。受けるダメージは最低1です。`,counter:'雷の巻物は殻の軽減を無視できます。'});}
  for(const key of ['thornPlant','moonPlant']){const range=key==='thornPlant'?4:5;Object.assign(MONSTERS[key],{trait:'ranged',stationary:true,range,feature:`移動せず、直線${range}マス以内の1マスを狙って次のターンに攻撃します。`,counter:'射線を外して近づくか、予告に合わせて横へ移動しましょう。'});}
  for(const key of ['coinMimic','starMimic'])Object.assign(MONSTERS[key],{trait:'mimic',feature:'金貨の山に化けています。隣接すると正体を現し、そのターンは攻撃しません。攻撃されると即座に正体を現します。',counter:'正体を見たら距離を取り、矢で迎撃。反撃前の1ターンを使いましょう。'});
  for(const key of ['starGuardian','stoneGolem','obsidianGolem'])Object.assign(MONSTERS[key],{trait:'windup',cadence:key==='starGuardian'?1:2,armor:key==='obsidianGolem'?4:0,feature:`隣の1マスを狙い、次のターンに強打します。${key==='starGuardian'?'': '移動は2ターンに1歩です。'}${key==='obsidianGolem'?'剣と矢のダメージを4軽減します。':''}`,counter:'予告のマスから移動し、空振りの隙に攻撃しましょう。'});
  const MONSTER_POOLS=[
    ['mossSlime'],
    ['amberSlime','caveBat','ironBeetle','coinMimic','lanternMoth'],
    ['emberBat','lanternGhost','ironBeetle','coinMimic','lanternMoth','thornPlant','stoneGolem'],
    ['frostBat','frostGhost','ironBeetle','coinMimic','lanternMoth','thornPlant','stoneGolem'],
    ['thunderBat','goldGhost','cobaltBeetle','eclipseMoth','stoneGolem','coinMimic'],
    ['jadeBat','jadeGhost','cobaltBeetle','eclipseMoth','moonPlant','starMimic'],
    ['obsidianBat','abyssGhost','cobaltBeetle','eclipseMoth','moonPlant','starMimic','obsidianGolem']
  ];
  const MONSTER_MARKS=['無印','横線','菱形','山形','十字','王冠','星形'];
  function monsterTier(floor,dungeon){const depth=floor+(dungeon==='depths'?2:0);return depth<3?0:depth<6?1:depth<11?2:depth<16?3:depth<21?4:depth<26?5:6;}
  function monsterStats(species){const m=MONSTERS[species];return{species,type:m.type,name:m.name,maxHp:m.hp,attack:m.attack,exp:m.exp};}
  class DungeonEngine {
    constructor(seed = Date.now(), dungeon = 'tutorial', tutorialCleared = false) {
      if(!Object.hasOwn(DUNGEONS,dungeon)||dungeon==='depths'&&tutorialCleared!==true)throw new RangeError('Dungeon is unknown or locked');
      this.dungeon=dungeon;this.tutorialCleared=tutorialCleared===true;
      this.seed=seed>>>0; this.rng=this.seed||1; this.floor=1; this.turn=0; this.status='playing'; this.log=[]; this.effects=[];
      this.player={x:0,y:0,hp:30,maxHp:30,hunger:100,level:1,exp:0,nextExp:8,gold:0,weapon:0,shield:0,ammo:null,facing:[0,1],bag:['bread','potion','scroll']};
      this.player.equipment={weapon:{kind:'weapon',rank:0,bonus:0,cursed:false,identified:true},shield:{kind:'shield',rank:0,bonus:0,cursed:false,identified:true}};
      this.initIdentification();
      this.generateFloor();
      this.say('ランタンを灯した。小さな冒険のはじまり。','good');
      this.say(`${this.dungeonInfo().name}へ。地下${this.maxFloor()}階に眠る「${this.dungeonInfo().treasure}」を探そう。`);
    }
    dungeonInfo(){return DUNGEONS[this.dungeon];}
    maxFloor(){return this.dungeonInfo().floors;}
    floorName(){return this.dungeonInfo().names[this.floor-1];}
    random(){this.rng=(Math.imul(this.rng,1664525)+1013904223)>>>0;return this.rng/4294967296;}
    int(a,b){return a+Math.floor(this.random()*(b-a+1));}
    key(x,y){return y*W+x;}
    inside(x,y){return x>=0&&y>=0&&x<W&&y<H;}
    tile(x,y){return this.inside(x,y)?this.tiles[this.key(x,y)]:0;}
    enemyAt(x,y){return this.enemies.find(e=>e.x===x&&e.y===y&&e.hp>0);}
    initIdentification(legacy=false){
      // Appearance randomization has its own seed stream so it cannot change floor geometry.
      let random=this.seed^0x9e3779b9;const names=[...SCROLL_NAMES];
      for(let i=names.length-1;i>0;i--){random=(Math.imul(random,1664525)+1013904223)>>>0;const j=random%(i+1);[names[i],names[j]]=[names[j],names[i]];}
      this.identification={appearances:Object.fromEntries(SCROLLS.map((kind,i)=>[kind,names[i]])),known:legacy||this.dungeon==='tutorial'?[...SCROLLS]:[],names:{}};
    }
    itemName(item){
      const kind=itemKind(item);
      if(isEquipment(item))return EQUIPMENT_NAMES[kind][item.rank]+(item.identified?`${item.bonus?` ${item.bonus>0?'+':''}${item.bonus}`:''}${item.cursed?'（呪い）':''}`:'（未鑑定）');
      if(SCROLLS.includes(kind)&&!this.identification.known.includes(kind))return this.identification.appearances[kind]+(this.identification.names[kind]?`「${this.identification.names[kind]}」`:'')+'（未識別）';
      return ITEMS[kind]?.name||'';
    }
    itemDescription(item){
      const kind=itemKind(item);
      if(isEquipment(item))return item.identified?`${kind==='weapon'?'攻撃':'防御'}補正 ${item.rank*(kind==='weapon'?3:2)+item.bonus}。${item.cursed?'呪われています。装備すると外せません。':'呪いはありません。'}`:ITEMS[kind].description;
      return SCROLLS.includes(kind)&&!this.identification.known.includes(kind)?'効果はまだ分かりません。読むか、インパスの巻物で鑑定すると、同じ種類の巻物も識別されます。':ITEMS[kind]?.description||'';
    }
    nameScroll(index,name){
      const kind=itemKind(this.player.bag[index]);
      if(this.status!=='playing'||!SCROLLS.includes(kind)||this.identification.known.includes(kind)||typeof name!=='string')return false;
      this.identification.names[kind]=name.trim().slice(0,20);return true;
    }
    targetItem(target){return typeof target==='number'&&Number.isInteger(target)?this.player.bag[target]:Object.hasOwn(EQUIPMENT_NAMES,target)?this.player.equipment[target]:null;}
    identifyItem(target){
      const item=this.targetItem(target),kind=itemKind(item);if(!ITEMS[kind])return false;
      if(isEquipment(item))item.identified=true;
      if(SCROLLS.includes(kind)&&!this.identification.known.includes(kind))this.identification.known.push(kind);
      this.say(`${this.itemName(item)}と分かった。`,'good');return true;
    }
    equipmentBonus(kind){const item=this.player.equipment[kind];return item?item.bonus:0;}
    attackPower(){return Math.max(1,5+(this.player.level-1)*2+this.player.weapon*3+this.equipmentBonus('weapon'));}
    defense(){return Math.max(0,1+this.player.shield*2+this.equipmentBonus('shield'));}
    arrowCount(){return this.player.bag.filter(kind=>kind==='arrow').length;}
    inventoryEntries(){
      const entries=[];let arrows;
      this.player.bag.forEach((item,index)=>{
        const kind=itemKind(item);
        if(kind==='arrow'&&arrows){arrows.count++;return;}
        const entry={kind,index,count:1};entries.push(entry);if(kind==='arrow')arrows=entry;
      });
      const order=entry=>SCROLLS.includes(entry.kind)&&!this.identification.known.includes(entry.kind)?ITEM_ORDER.indexOf('scroll'):ITEM_ORDER.indexOf(entry.kind);
      return entries.sort((a,b)=>order(a)-order(b)||a.index-b.index);
    }
    equip(index){
      if(this.status!=='playing')return false;const p=this.player,item=p.bag[index];if(!validEquipment(item))return false;
      const old=p.equipment[item.kind];
      if(old?.cursed){this.say(`${this.itemName(old)}は呪われていて外せない！`,'danger');return false;}
      if(old)p.bag[index]=old;else p.bag.splice(index,1);
      p.equipment[item.kind]=item;p[item.kind]=item.rank;item.identified=true;
      this.say(`${this.itemName(item)}を装備した。`,item.cursed?'danger':'good');this.finishTurn();return true;
    }
    unequip(kind){
      if(this.status!=='playing'||!Object.hasOwn(EQUIPMENT_NAMES,kind))return false;
      const p=this.player,item=p.equipment[kind];if(!item)return false;
      if(item.cursed){this.say(`${this.itemName(item)}は呪われていて外せない！`,'danger');return false;}
      if(this.inventoryEntries().length>=16){this.say('持ち物がいっぱい。装備を外すには1枠空けよう。');return false;}
      p.bag.push(item);p.equipment[kind]=null;p[kind]=0;this.say(`${this.itemName(item)}を外した。`);this.finishTurn();return true;
    }
    dropEquipment(index){
      const p=this.player,item=p.bag[index];if(this.status!=='playing'||!validEquipment(item))return false;
      if(this.items.some(i=>i.x===p.x&&i.y===p.y)||this.onStairs()){this.say('足元には置けない。空いている床へ移動しよう。');return false;}
      this.items.push({...item,x:p.x,y:p.y,amount:1,discovered:true});p.bag.splice(index,1);this.say(`${this.itemName(item)}を置いた。`);this.finishTurn();return true;
    }
    equipArrow(){
      if(this.status!=='playing'||!this.arrowCount())return false;
      this.player.ammo=this.player.ammo==='arrow'?null:'arrow';
      this.say(this.player.ammo?'木の矢を装備した。':'木の矢の装備を外した。');this.finishTurn();return true;
    }
    shoot(){if(this.player.ammo!=='arrow')return false;return this.use(this.player.bag.indexOf('arrow'));}
    say(text,type='normal'){this.log.unshift({text,type,turn:this.turn});this.log=this.log.slice(0,40);}
    effect(type,x,y,value,text){this.effects.push({type,x,y,value,text});}
    canStep(x,y,dx,dy){return !!this.tile(x+dx,y+dy)&&(!(dx&&dy)||(!!this.tile(x+dx,y)&&!!this.tile(x,y+dy)));}
    roomAt(x,y){return this.rooms.find(r=>x>=r.x&&y>=r.y&&x<r.x+r.w&&y<r.y+r.h);}
    isRoomEntrance(x,y){const room=this.roomAt(x,y);return !!room&&DIRS.some(([dx,dy])=>this.roomAt(x+dx,y+dy)!==room&&this.canStep(x,y,dx,dy));}
    layoutName(){return LAYOUT_NAMES[this.layout]||'';}
    roomDoorCount(room){
      const doors=new Set();
      for(let x=room.x;x<room.x+room.w;x++)for(const y of [room.y-1,room.y+room.h])if(this.tile(x,y))doors.add(this.key(x,y));
      for(let y=room.y;y<room.y+room.h;y++)for(const x of [room.x-1,room.x+room.w])if(this.tile(x,y))doors.add(this.key(x,y));
      let count=0;
      while(doors.size){
        count++;const first=doors.values().next().value,queue=[first];doors.delete(first);
        for(let i=0;i<queue.length;i++)for(const[dx,dy]of [[0,-1],[1,0],[0,1],[-1,0]]){
          const k=queue[i],x=k%W+dx,y=Math.floor(k/W)+dy,next=this.key(x,y);
          if(this.inside(x,y)&&doors.delete(next))queue.push(next);
        }
      }
      return count;
    }
    generateFloor(){
      this.tiles=Array(W*H).fill(0);this.seen=Array(W*H).fill(false);this.visible=Array(W*H).fill(false);this.rooms=[];this.enemies=[];this.items=[];this.traps=[];this.monsterHouse=null;
      const cells=Array.from({length:9},(_,i)=>i);
      for(let i=cells.length-1;i>0;i--){const j=this.int(0,i);[cells[i],cells[j]]=[cells[j],cells[i]];}
      const weights=this.floor<=3?[6,3,1]:this.floor<=6?[4,4,2]:[2,4,4];
      const layouts=Object.keys(LAYOUT_NAMES).flatMap((name,i)=>name===this.layout?[]:Array(weights[i]).fill(name));
      this.layout=layouts[this.int(0,layouts.length-1)];
      const roomCount=this.int(this.layout==='branch'?6:4,8),perimeter=cells.filter(c=>c!==4);
      const selected=this.layout==='hall'?[4,...perimeter.slice(0,roomCount-1)]:this.layout==='ring'?perimeter.slice(0,roomCount):cells.slice(0,roomCount);
      for(const cell of selected.sort((a,b)=>a-b)){
        const col=cell%3,row=Math.floor(cell/3);
        let w=this.int(5,this.layout==='branch'?8:10),h=this.int(4,this.layout==='branch'?6:7),x=1+col*14+this.int(1,13-w),y=1+row*9+this.int(1,8-h);
        if(this.layout==='hall'){
          if(cell===4){w=this.int(16,19);h=this.int(10,11);x=this.int(12,14);y=this.int(9,10);}
          else if(row===1){w=this.int(5,7);h=this.int(4,6);x=col===0?2:35;y=this.int(12,15);}
          else{h=this.int(4,6);y=(row===0?2:22)+this.int(0,6-h);}
        }
        const room={x,y,w,h,cx:x+Math.floor(w/2),cy:y+Math.floor(h/2)};this.rooms.push(room);
        for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)this.tiles[this.key(xx,yy)]=1;
      }
      const join=(a,b)=>{
        let x=a.cx,y=a.cy;const horizontalFirst=this.random()<.5;
        const horizontal=()=>{while(x!==b.cx){this.tiles[this.key(x,y)]=1;x+=Math.sign(b.cx-x);}};
        const vertical=()=>{while(y!==b.cy){this.tiles[this.key(x,y)]=1;y+=Math.sign(b.cy-y);}};
        if(horizontalFirst){horizontal();vertical();}else{vertical();horizontal();}this.tiles[this.key(x,y)]=1;
      };
      // Each layout changes the actual floor geometry, not just its label.
      if(this.layout==='ring'){
        const left=Math.min(...this.rooms.map(r=>r.cx)),right=Math.max(...this.rooms.map(r=>r.cx)),top=Math.min(...this.rooms.map(r=>r.cy)),bottom=Math.max(...this.rooms.map(r=>r.cy));
        const corners=[{cx:left,cy:top},{cx:right,cy:top},{cx:right,cy:bottom},{cx:left,cy:bottom}];
        for(let i=0;i<4;i++)join(corners[i],corners[(i+1)%4]);
        for(const r of this.rooms){const row=Math.floor(r.y/9),col=Math.floor(r.x/14);join(r,{cx:row===1?(col===0?left:right):r.cx,cy:row===0?top:row===2?bottom:r.cy});}
      }else if(this.layout==='hall'){
        const hall=this.rooms.find(r=>r.w>=16);
        for(const r of this.rooms)if(r!==hall)join(hall,r);
      }else{
        const links=[];
        for(let a=0;a<roomCount;a++)for(let b=a+1;b<roomCount;b++){
          const distance=Math.abs(this.rooms[a].cx-this.rooms[b].cx)+Math.abs(this.rooms[a].cy-this.rooms[b].cy);
          links.push({a,b,weight:distance+this.int(0,10)});
        }
        links.sort((a,b)=>a.weight-b.weight);
        const connected=new Set([this.int(0,roomCount-1)]);
        while(connected.size<roomCount){
          const link=links.find(l=>connected.has(l.a)!==connected.has(l.b));
          join(this.rooms[link.a],this.rooms[link.b]);connected.add(link.a);connected.add(link.b);
        }
      }
      const startRoom=this.rooms[this.int(0,roomCount-1)],otherRooms=this.rooms.filter(r=>r!==startRoom);
      this.player.x=this.int(startRoom.x+1,startRoom.x+startRoom.w-2);this.player.y=this.int(startRoom.y+1,startRoom.y+startRoom.h-2);this.player.facing=[0,1];
      const exitRoom=otherRooms[this.int(0,otherRooms.length-1)];
      this.stairs={x:this.int(exitRoom.x,exitRoom.x+exitRoom.w-1),y:this.int(exitRoom.y,exitRoom.y+exitRoom.h-1)};
      const used=new Set([this.key(this.player.x,this.player.y),this.key(this.stairs.x,this.stairs.y)]);
      const emptySpot=(rooms=this.rooms,avoidEntrances=false)=>{for(let i=0;i<500;i++){const r=rooms[this.int(0,rooms.length-1)],x=this.int(r.x,r.x+r.w-1),y=this.int(r.y,r.y+r.h-1),k=this.key(x,y);if(!used.has(k)&&(!avoidEntrances||!this.isRoomEntrance(x,y))){used.add(k);return{x,y};}}return null;};
      const hard=this.dungeon==='depths';
      const guardianSpot=this.floor===this.maxFloor()?emptySpot([exitRoom]):null;
      const deadEnds=otherRooms.filter(r=>r!==exitRoom&&this.roomDoorCount(r)===1);
      const houseRoom=this.floor>=4&&this.floor<this.maxFloor()&&deadEnds.length&&this.random()<(hard ? .2 : .15)?deadEnds[this.int(0,deadEnds.length-1)]:null;
      if(houseRoom)this.monsterHouse={room:this.rooms.indexOf(houseRoom),triggered:false};
      const houseSpots=houseRoom?Array.from({length:5},()=>emptySpot([houseRoom])):[];
      const rewardRooms=deadEnds.filter(r=>r!==houseRoom),ordinaryRooms=otherRooms.filter(r=>r!==houseRoom);
      const addItem=(kind,rooms=this.rooms,bias=true)=>{
        const preferred=bias?rewardRooms.filter(r=>rooms.includes(r)):[],pool=preferred.length&&this.random()<.65?preferred:rooms;
        const pos=emptySpot(pool);if(pos){
          const tier=Math.floor((this.floor+(kind==='weapon'?1:0))/3);
          const equipment=Object.hasOwn(EQUIPMENT_NAMES,kind)?{rank:Math.min(3,tier),bonus:Math.max(0,tier-3)*(kind==='weapon'?3:2)+this.int(-1,3),cursed:this.random()<1/8,identified:false}:{};
          this.items.push({...pos,kind,...equipment,amount:kind==='gold'?this.int(20,65)*this.floor:kind==='arrow'?this.int(1,10):1});
        }
      };
      // Each floor guarantees food and healing as well as randomly placed supplies.
      [...Array(hard?2:3).fill('bread'),'potion','potion','gold','gold','gold','arrow',this.random()<.5?'map':'scroll'].forEach(kind=>addItem(kind));
      addItem(SCROLLS[this.int(0,SCROLLS.length-1)]);
      if(this.floor%3===2)addItem('weapon',otherRooms);
      if(this.floor%3===0)addItem('shield',otherRooms);
      if(houseRoom){addItem('gold',[houseRoom],false);addItem('gold',[houseRoom],false);addItem('scroll',[houseRoom],false);}
      const count=4+Math.floor(this.floor*.75)+(hard?2:0);
      for(let i=0;i<count;i++){
        const pos=i<houseSpots.length?houseSpots[i]:emptySpot(ordinaryRooms);if(!pos)continue;
        const tier=monsterTier(this.floor,this.dungeon),pool=MONSTER_POOLS[tier];
        const species=tier===0?pool[0]:pool[this.int(0,pool.length-1)];
        this.enemies.push({...pos,id:i,...monsterStats(species),hp:MONSTERS[species].hp,awake:false,house:i<houseSpots.length});
      }
      for(let i=0;i<Math.min(this.floor+(hard?2:0),hard?8:5);i++){const pos=emptySpot(ordinaryRooms,true);if(pos)this.traps.push({...pos,found:false});}
      if(guardianSpot){const species=hard?'abyssGuardian':'starGuardian';this.enemies.push({...guardianSpot,id:99,...monsterStats(species),hp:MONSTERS[species].hp,awake:true});}
      this.reveal();
    }
    lineOfSight(x0,y0,x1,y1){
      let x=x0,y=y0;const dx=Math.abs(x1-x0),dy=Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1;let err=dx-dy;
      for(let i=0;i<W+H;i++){if(x===x1&&y===y1)return true;if((x!==x0||y!==y0)&&!this.tile(x,y))return false;const e=err*2;if(e>-dy){err-=dy;x+=sx;}if(e<dx){err+=dx;y+=sy;}}return false;
    }
    reveal(){
      this.visible.fill(false);const p=this.player;
      const room=this.roomAt(p.x,p.y);
      if(room){for(let y=room.y-1;y<=room.y+room.h;y++)for(let x=room.x-1;x<=room.x+room.w;x++)if(this.inside(x,y))this.visible[this.key(x,y)]=true;}
      for(let y=p.y-3;y<=p.y+3;y++)for(let x=p.x-3;x<=p.x+3;x++)if(this.inside(x,y)&&Math.hypot(x-p.x,y-p.y)<=3.5&&this.lineOfSight(p.x,p.y,x,y))this.visible[this.key(x,y)]=true;
      for(let i=0;i<this.seen.length;i++)if(this.visible[i])this.seen[i]=true;
      for(const item of this.items)if(this.visible[this.key(item.x,item.y)])item.discovered=true;
      for(const enemy of this.enemies)if(enemy.hp>0&&this.visible[this.key(enemy.x,enemy.y)])enemy.lastSeen={x:enemy.x,y:enemy.y};
    }
    face(dx,dy){
      if(this.status!=='playing'||!DIRS.some(d=>d[0]===dx&&d[1]===dy))return false;
      this.player.facing=[dx,dy];return true;
    }
    move(dx,dy){
      if(!this.face(dx,dy))return false;
      if(!this.canStep(this.player.x,this.player.y,dx,dy))return false;
      const x=this.player.x+dx,y=this.player.y+dy,enemy=this.enemyAt(x,y);
      if(enemy){this.hit(enemy,this.attackPower()+this.int(-1,2));}else{this.player.x=x;this.player.y=y;this.collect();this.triggerTrap();}
      this.finishTurn();return true;
    }
    attack(){if(this.status!=='playing')return false;const p=this.player,[dx,dy]=p.facing,e=this.canStep(p.x,p.y,dx,dy)?this.enemyAt(p.x+dx,p.y+dy):null;if(e)this.hit(e,this.attackPower()+this.int(-1,2));else{this.say('剣を振った。目の前に敵はいない。');this.effect('swing',p.x+dx,p.y+dy,0);}this.finishTurn();return true;}
    wait(){if(this.status!=='playing')return false;this.finishTurn();return true;}
    hit(enemy,damage,kind='physical'){const m=MONSTERS[enemy.species];damage=Math.max(1,damage-(kind==='physical'?(m?.armor||0):0));if(m?.trait==='mimic')enemy.revealed=true;enemy.hp-=damage;if(m?.trait==='blink'&&enemy.hp>0)enemy.blinkPending=true;enemy.awake=true;this.say(`${enemy.name}に${damage}ダメージ。`);this.effect('hit',enemy.x,enemy.y,damage);if(enemy.hp<=0){this.say(`${enemy.name}を倒した。経験値 +${enemy.exp}`,'good');this.player.exp+=enemy.exp;this.player.gold+=this.int(3,12)*this.floor;this.effect('kill',enemy.x,enemy.y,0);while(this.player.exp>=this.player.nextExp){this.player.exp-=this.player.nextExp;this.player.level++;this.player.nextExp=Math.floor(this.player.nextExp*1.35)+3;this.player.maxHp+=6;this.player.hp=Math.min(this.player.maxHp,this.player.hp+12);this.say(`レベル${this.player.level}になった！ 体力と攻撃力が上がった。`,'good');this.effect('level',this.player.x,this.player.y,this.player.level);}}}
    collect(){
      const p=this.player,item=this.items.find(i=>i.x===p.x&&i.y===p.y);if(!item)return;
      if(item.kind==='gold'){p.gold+=item.amount;this.say(`${item.amount}Gを拾った。`,'good');}
      else{
        const stacks=item.kind==='arrow'&&this.arrowCount()>0;
        if(this.inventoryEntries().length>=16&&!stacks){this.say('持ち物がいっぱい。アイテムを使うか、未装備の剣・盾を置いて空きを作ろう。');return;}
        const amount=item.kind==='arrow'&&Number.isInteger(item.amount)?Math.max(1,Math.min(10,item.amount)):1;
        const value=isEquipment(item)?{kind:item.kind,rank:item.rank,bonus:item.bonus,cursed:item.cursed,identified:item.identified}:item.kind;
        p.bag.push(...Array(amount).fill(value));this.say(`${this.itemName(value)}を${item.kind==='arrow'?`${amount}本`:''}拾った。`,'good');
      }
      this.effect('pickup',p.x,p.y,item.kind,this.log[0].text);this.items.splice(this.items.indexOf(item),1);
    }
    triggerTrap(){const p=this.player,t=this.traps.find(t=>t.x===p.x&&t.y===p.y);if(!t)return;t.found=true;const d=this.int(2,5);p.hp-=d;this.say(`足元にトゲの罠！ ${d}ダメージ。`,'danger');this.effect('damage',p.x,p.y,d);}
    scrollNeedsTarget(index){return this.player.bag[index]==='identify';}
    use(index,target){
      if(this.status!=='playing'||!Number.isInteger(index))return false;const p=this.player,kind=itemKind(p.bag[index]);if(!ITEMS[kind])return false;
      if(isEquipment(p.bag[index]))return this.equip(index);
      if(kind==='identify'&&(target===index||!ITEMS[itemKind(this.targetItem(target))]))return false;
      if(SCROLLS.includes(kind)&&!this.identification.known.includes(kind)){const appearance=this.itemName(kind);this.identification.known.push(kind);this.say(`${appearance}は${ITEMS[kind].name}だった！`,'good');}
      if(kind==='identify')this.identifyItem(target);
      if(kind==='uncurse'){
        let count=0;for(const item of Object.values(p.equipment))if(item?.cursed){item.cursed=false;count++;}
        this.say(count?'装備中の呪いがすべて解けた！':'装備中の品に呪いはなかった。','good');
      }
      if(kind==='bread'){const before=p.hunger;p.hunger=Math.min(100,p.hunger+50);this.say(`パンを食べた。満腹度 +${p.hunger-before}%`,'good');this.effect('heal',p.x,p.y,'満腹');}
      if(kind==='potion'){const before=p.hp;p.hp=Math.min(p.maxHp,p.hp+25);this.say(`回復草を使った。体力 +${p.hp-before}`,'good');this.effect('heal',p.x,p.y,p.hp-before);}
      if(kind==='scroll'){this.say('雷の巻物を読んだ！');for(const e of this.enemies)if(e.hp>0&&this.visible[this.key(e.x,e.y)])this.hit(e,18,'magic');this.effect('lightning',p.x,p.y,0);}
      if(kind==='map'){this.seen.fill(true);this.say('迷宮の地図が浮かび上がった。階段はミニマップの水色の印。','good');this.effect('map',p.x,p.y,0);}
      if(kind==='arrow'){const[dx,dy]=p.facing;let x=p.x,y=p.y,hit=false;for(let i=0;i<10;i++){if(!this.canStep(x,y,dx,dy))break;x+=dx;y+=dy;const e=this.enemyAt(x,y);if(e){this.hit(e,12);hit=true;break;}}if(!hit)this.say('木の矢を放った。敵には当たらなかった。');this.effect('arrow',x,y,0);}
      p.bag.splice(index,1);if(kind==='arrow'&&!this.arrowCount())p.ammo=null;this.finishTurn();return true;
    }
    finishTurn(){
      this.turn++;this.reveal();
      const house=this.monsterHouse;
      if(house&&!house.triggered&&this.roomAt(this.player.x,this.player.y)===this.rooms[house.room]){
        house.triggered=true;const pack=this.enemies.filter(e=>e.house&&e.hp>0);
        if(pack.length){for(const e of pack)e.awake=true;this.say('モンスターハウス！ 眠っていた魔物たちが一斉に目を覚ました！','danger');}
      }
      if(this.turn%4===0&&this.player.hunger>0)this.player.hunger--;
      if(this.player.hunger===0){this.player.hp--;if(this.turn%4===0)this.say('お腹が空いて、体力が減っている。パンを食べよう！','danger');this.effect('damage',this.player.x,this.player.y,1);}else if(this.turn%7===0&&this.player.hp>0)this.player.hp=Math.min(this.player.maxHp,this.player.hp+1);
      if(this.player.hp>0)this.enemyTurn();
      this.enemies=this.enemies.filter(e=>e.hp>0);this.reveal();
      if(this.player.hp<=0){this.player.hp=0;this.status='dead';this.say('ランタンの灯りが、静かに消えた。','danger');this.effect('dead',this.player.x,this.player.y,0);}
      if(this.onStairs()&&this.floor===this.maxFloor()&&this.status==='playing'){
        if(this.enemies.some(e=>e.type==='guardian'&&e.hp>0))this.say(`${this.dungeonInfo().guardian}がランタンを守っている。番人を倒してから手に入れよう。`);else{this.status='won';if(this.dungeon==='tutorial')this.tutorialCleared=true;this.say(`${this.dungeonInfo().treasure}を手に入れた！ ${this.dungeon==='tutorial'?'チュートリアル完了。「深淵の迷宮」が解放された。':'30階の深淵を踏破した！'}`,'good');this.effect('won',this.player.x,this.player.y,0);}
      }
    }
    clearShot(from,to,range){
      const dx=to.x-from.x,dy=to.y-from.y,dist=Math.max(Math.abs(dx),Math.abs(dy));
      if(!dist||dist>range||(dx&&dy&&Math.abs(dx)!==Math.abs(dy)))return false;
      let x=from.x,y=from.y;const sx=Math.sign(dx),sy=Math.sign(dy);
      for(let i=0;i<dist;i++){if(!this.canStep(x,y,sx,sy))return false;x+=sx;y+=sy;if(this.enemyAt(x,y))return false;}
      return true;
    }
    enemyHit(e){
      const p=this.player,m=MONSTERS[e.species],d=Math.max(1,e.attack-this.defense()+this.int(-1,1));
      p.hp-=d;const loss=m?.hunger?Math.min(p.hunger,m.hunger):0;p.hunger-=loss;
      this.say(`${e.name}の攻撃。${d}ダメージ。${loss?` 満腹度 −${loss}。`:''}`,'danger');this.effect('damage',p.x,p.y,d);
    }
    enemyTurn(){
      const p=this.player;
      const distance=Array(W*H).fill(Infinity),queue=[[p.x,p.y]];distance[this.key(p.x,p.y)]=0;
      for(let head=0;head<queue.length;head++){const[x,y]=queue[head],d=distance[this.key(x,y)];for(const[dx,dy]of DIRS){if(!this.canStep(x,y,dx,dy))continue;const nx=x+dx,ny=y+dy,k=this.key(nx,ny);if(distance[k]!==Infinity)continue;distance[k]=d+1;queue.push([nx,ny]);}}
      for(const e of this.enemies){
        if(e.hp<=0||(e.house&&!e.awake&&!this.monsterHouse?.triggered))continue;
        const m=MONSTERS[e.species]||{},dist=Math.max(Math.abs(e.x-p.x),Math.abs(e.y-p.y)),visible=this.visible[this.key(e.x,e.y)];
        if(dist<=7&&visible)e.awake=true;
        if(m.trait==='mimic'&&!e.revealed){if(dist===1&&this.canStep(e.x,e.y,p.x-e.x,p.y-e.y)){e.revealed=true;e.awake=true;this.say(`金貨の山が動いた！ ${e.name}が正体を現した。次の行動で反撃してくる！`,'danger');this.effect('warning',e.x,e.y,0);}continue;}
        if(m.regen&&e.hp<e.maxHp)e.hp=Math.min(e.maxHp,e.hp+m.regen);
        if(e.blinkPending){delete e.blinkPending;const room=this.roomAt(e.x,e.y),spots=[];
          if(room)for(let y=room.y;y<room.y+room.h;y++)for(let x=room.x;x<room.x+room.w;x++){const d=Math.max(Math.abs(x-e.x),Math.abs(y-e.y)),away=Math.max(Math.abs(x-p.x),Math.abs(y-p.y));if(d>0&&d<=3&&away>=2&&this.tile(x,y)&&!this.enemyAt(x,y)&&!(x===this.stairs.x&&y===this.stairs.y)&&!this.items.some(i=>i.x===x&&i.y===y))spots.push({x,y});}
          if(spots.length){Object.assign(e,spots[this.int(0,spots.length-1)]);if(visible)this.say(`${e.name}が部屋の中へ転移した。`);continue;}
        }
        if(e.intent){const aim=e.intent;delete e.intent;
          if(p.x===aim.x&&p.y===aim.y&&this.clearShot(e,aim,aim.kind==='windup'?1:m.range)){this.enemyHit(e);if(p.hp<=0)break;}
          else if(visible)this.say(`${e.name}の攻撃は空を切った。`);
          continue;
        }
        const adjacent=dist===1&&this.canStep(e.x,e.y,p.x-e.x,p.y-e.y);
        const shooting=m.trait==='ranged'&&e.awake&&visible&&this.clearShot(e,p,m.range);
        if((m.trait==='windup'&&adjacent)||shooting){e.intent={x:p.x,y:p.y,kind:shooting?'ranged':'windup'};this.say(`${e.name}が${shooting?'射撃':'強打'}の構え！ 狙われたマスから移動しよう。`,'danger');this.effect('warning',p.x,p.y,0);continue;}
        if(adjacent){this.enemyHit(e);if(p.hp<=0)break;continue;}
        if(m.stationary||(m.cadence&&this.turn%m.cadence!==0))continue;
        for(let stepIndex=0;stepIndex<(e.awake?(m.speed||1):1);stepIndex++){
          if(Math.max(Math.abs(e.x-p.x),Math.abs(e.y-p.y))===1&&this.canStep(e.x,e.y,p.x-e.x,p.y-e.y))break;
          const candidates=DIRS.filter(([dx,dy])=>this.canStep(e.x,e.y,dx,dy)&&!(e.x+dx===p.x&&e.y+dy===p.y)&&!this.enemyAt(e.x+dx,e.y+dy));
          const chase=e.awake?candidates.filter(([dx,dy])=>distance[this.key(e.x+dx,e.y+dy)]<distance[this.key(e.x,e.y)]).sort((a,b)=>distance[this.key(e.x+a[0],e.y+a[1])]-distance[this.key(e.x+b[0],e.y+b[1])])[0]:null;
          const forward=candidates.filter(([dx,dy])=>!e.direction||dx!==-e.direction[0]||dy!==-e.direction[1]);
          const wander=forward.length?forward:candidates,step=chase||wander[this.int(0,Math.max(0,wander.length-1))];
          if(step){e.x+=step[0];e.y+=step[1];e.direction=step;}else break;
        }
      }
    }
    onStairs(){return this.player.x===this.stairs.x&&this.player.y===this.stairs.y;}
    descend(){if(this.status!=='playing'||!this.onStairs()||this.floor>=this.maxFloor())return false;this.floor++;this.turn++;this.generateFloor();this.say(`地下${this.floor}階「${this.floorName()}」へ降りた。`,'good');this.effect('descend',this.player.x,this.player.y,this.floor);return true;}
    weaponName(){return this.player.equipment.weapon?this.itemName(this.player.equipment.weapon):'未装備';}
    shieldName(){return this.player.equipment.shield?this.itemName(this.player.equipment.shield):'未装備';}
    restoreIdentification(){
      const p=this.player,legacy=this.identification==null;
      if(legacy)this.initIdentification(true);
      const info=this.identification;
      if(!info||typeof info.appearances!=='object'||!info.appearances||!Array.isArray(info.known)||!info.names||typeof info.names!=='object'||Array.isArray(info.names))return false;
      if(Object.keys(info.appearances).length!==SCROLLS.length||SCROLLS.some(kind=>!SCROLL_NAMES.includes(info.appearances[kind]))||new Set(Object.values(info.appearances)).size!==SCROLLS.length||info.known.some(kind=>!SCROLLS.includes(kind))||new Set(info.known).size!==info.known.length||Object.entries(info.names).some(([kind,name])=>!SCROLLS.includes(kind)||typeof name!=='string'||name.length>20))return false;
      if(p.equipment==null){
        if(!legacy)return false;
        p.equipment={};
        for(const kind of Object.keys(EQUIPMENT_NAMES)){
          const rank=p[kind];if(!Number.isInteger(rank)||rank<0)return false;
          p.equipment[kind]={kind,rank:Math.min(3,rank),bonus:Math.max(0,rank-3)*(kind==='weapon'?3:2),cursed:false,identified:true};p[kind]=Math.min(3,rank);
        }
      }
      if(typeof p.equipment!=='object'||Array.isArray(p.equipment)||Object.keys(p.equipment).length!==2)return false;
      for(const kind of Object.keys(EQUIPMENT_NAMES)){
        const item=p.equipment[kind];
        if(item!==null&&(!validEquipment(item)||item.kind!==kind||!item.identified)||!Number.isInteger(p[kind])||p[kind]<0||p[kind]>3||p[kind]!== (item?.rank??0))return false;
      }
      for(const item of this.items){
        if(!item||(!Object.hasOwn(ITEMS,item.kind)&&item.kind!=='gold'))return false;
        if(isEquipment(item)){
          if(legacy&&!Object.hasOwn(item,'rank'))Object.assign(item,{rank:Math.min(3,Math.floor((this.floor+(item.kind==='weapon'?1:0))/3)),bonus:0,cursed:false,identified:false});
          if(!validEquipment(item))return false;
        }
      }
      return true;
    }
    serialize(){const{effects,...state}=this;return JSON.stringify({version:1,state});}
    static restore(raw){try{const saved=JSON.parse(raw),s=saved.state;const dungeon=s?.dungeon??'tutorial';if(!Object.hasOwn(DUNGEONS,dungeon)||(s?.tutorialCleared!=null&&typeof s.tutorialCleared!=='boolean')||(dungeon==='depths'&&s.tutorialCleared!==true))return null;if(saved.version!==1||!s||!Array.isArray(s.tiles)||s.tiles.length!==W*H||!Array.isArray(s.seen)||s.seen.length!==W*H||!Array.isArray(s.rooms)||(s.rooms.length<4||s.rooms.length>8)||!Array.isArray(s.enemies)||!Array.isArray(s.items)||!Array.isArray(s.traps)||!Array.isArray(s.log)||!s.stairs||!s.player||!Array.isArray(s.player.bag)||s.player.bag.some(item=>typeof item==='string'?(!Object.hasOwn(ITEMS,item)||Object.hasOwn(EQUIPMENT_NAMES,item)):!validEquipment(item))||(s.player.ammo!=null&&s.player.ammo!=='arrow')||!Number.isInteger(s.floor)||s.floor<1||s.floor>DUNGEONS[dungeon].floors||!Number.isFinite(s.turn)||!Number.isFinite(s.player.hp)||!Number.isFinite(s.player.hunger)||s.player.hunger<0||s.player.hunger>100||!['playing','dead','won'].includes(s.status))return null;if(s.layout!=null&&!Object.hasOwn(LAYOUT_NAMES,s.layout))return null;if(s.monsterHouse!=null&&(!Number.isInteger(s.monsterHouse.room)||s.monsterHouse.room<0||s.monsterHouse.room>=s.rooms.length||typeof s.monsterHouse.triggered!=='boolean'))return null;const game=Object.assign(Object.create(DungeonEngine.prototype),s);game.dungeon=dungeon;game.tutorialCleared=s.tutorialCleared===true||(dungeon==='tutorial'&&s.status==='won'&&s.floor===10);game.layout??=null;game.monsterHouse??=null;if(!game.tile(s.player.x,s.player.y))return null;game.player.ammo=game.arrowCount()?game.player.ammo??null:null;game.traps=game.traps.filter(t=>!game.isRoomEntrance(t.x,t.y));for(const e of game.enemies){
        if(e.species==null){
          if(!Number.isFinite(e.hp)||!Number.isFinite(e.maxHp))return null;
          const tier=monsterTier(game.floor,dungeon);
          e.species=e.type==='guardian'?(dungeon==='depths'?'abyssGuardian':'starGuardian'):e.type==='slime'?(tier===0?'mossSlime':'amberSlime'):Object.keys(MONSTERS).find(key=>MONSTERS[key].type===e.type&&MONSTERS[key].tier===Math.max(e.type==='ghost'?2:1,tier));
          if(!e.species)return null;
          const damage=Math.max(0,e.maxHp-e.hp),alive=e.hp>0;
          Object.assign(e,monsterStats(e.species));e.hp=alive?Math.max(1,e.maxHp-damage):e.hp;
        }else if(!Object.hasOwn(MONSTERS,e.species)||e.type!==MONSTERS[e.species].type||e.name!==MONSTERS[e.species].name||e.maxHp!==MONSTERS[e.species].hp||e.attack!==MONSTERS[e.species].attack||e.exp!==MONSTERS[e.species].exp||!Number.isFinite(e.hp)||e.hp>e.maxHp)return null;
        if(e.intent!=null&&((e.intent.kind==='ranged'?MONSTERS[e.species].trait!=='ranged':e.intent.kind==='windup'?MONSTERS[e.species].trait!=='windup':true)||!Number.isInteger(e.intent.x)||!Number.isInteger(e.intent.y)||!game.inside(e.intent.x,e.intent.y)||!game.tile(e.intent.x,e.intent.y)))return null;
        if(e.revealed!=null&&typeof e.revealed!=='boolean'||e.blinkPending!=null&&typeof e.blinkPending!=='boolean')return null;
      }
      if(!game.restoreIdentification())return null;game.effects=[];game.reveal();return game;}catch{return null;}}
  }
  Object.assign(root,{DungeonEngine,DungeonData:{W,H,DIRS,ITEMS,FLOOR_NAMES,LAYOUT_NAMES,DUNGEONS,MONSTERS,MONSTER_POOLS,MONSTER_MARKS,monsterTier}});
})(typeof window!=='undefined'?window:globalThis);
