(function (root) {
  'use strict';
  const W = 44, H = 30;
  const DIRS = [[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
  const ITEMS = {
    bread: {name:'焼きたてパン',icon:'◒',description:'満腹度を50回復。お腹が空く前にひと休み。'},
    potion: {name:'回復草',icon:'✿',description:'体力を25回復。ピンチの前に使いましょう。'},
    scroll: {name:'雷の巻物',icon:'▤',description:'見えている敵すべてに18ダメージ。'},
    map: {name:'地図の巻物',icon:'▧',description:'この階の地形と階段の場所を明らかにします。'},
    arrow: {name:'木の矢',icon:'➶',description:'装備して「矢を放つ」で向いている方向へ発射。1本消費し、最初の敵に12ダメージ。'}
  };
  const ITEM_ORDER = Object.keys(ITEMS);
  const FLOOR_NAMES=['苔むした入口','静かな回廊','忘れられた倉庫','ひかり草の庭','古井戸の底','眠れる鉱山','月影の遺跡','深淵の回廊','星を待つ間','ランタンの聖域'];
  const LAYOUT_NAMES={branch:'枝分かれの迷宮',ring:'巡る回廊',hall:'大広間の迷宮'};
  class DungeonEngine {
    constructor(seed = Date.now()) {
      this.seed=seed>>>0; this.rng=this.seed||1; this.floor=1; this.turn=0; this.status='playing'; this.log=[]; this.effects=[];
      this.player={x:0,y:0,hp:30,maxHp:30,hunger:100,level:1,exp:0,nextExp:8,gold:0,weapon:0,shield:0,ammo:null,facing:[0,1],bag:['bread','potion','scroll']};
      this.generateFloor();
      this.say('ランタンを灯した。小さな冒険のはじまり。','good');
      this.say('地下10階に眠る「星のランタン」を探そう。');
    }
    random(){this.rng=(Math.imul(this.rng,1664525)+1013904223)>>>0;return this.rng/4294967296;}
    int(a,b){return a+Math.floor(this.random()*(b-a+1));}
    key(x,y){return y*W+x;}
    inside(x,y){return x>=0&&y>=0&&x<W&&y<H;}
    tile(x,y){return this.inside(x,y)?this.tiles[this.key(x,y)]:0;}
    enemyAt(x,y){return this.enemies.find(e=>e.x===x&&e.y===y&&e.hp>0);}
    attackPower(){return 5+(this.player.level-1)*2+this.player.weapon*3;}
    defense(){return 1+this.player.shield*2;}
    arrowCount(){return this.player.bag.filter(kind=>kind==='arrow').length;}
    inventoryEntries(){
      const entries=[];let arrows;
      this.player.bag.forEach((kind,index)=>{
        if(kind==='arrow'&&arrows){arrows.count++;return;}
        const entry={kind,index,count:1};entries.push(entry);if(kind==='arrow')arrows=entry;
      });
      return entries.sort((a,b)=>ITEM_ORDER.indexOf(a.kind)-ITEM_ORDER.indexOf(b.kind)||a.index-b.index);
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
      const guardianSpot=this.floor===10?emptySpot([exitRoom]):null;
      const deadEnds=otherRooms.filter(r=>r!==exitRoom&&this.roomDoorCount(r)===1);
      const houseRoom=this.floor>=4&&this.floor<10&&deadEnds.length&&this.random()<.15?deadEnds[this.int(0,deadEnds.length-1)]:null;
      if(houseRoom)this.monsterHouse={room:this.rooms.indexOf(houseRoom),triggered:false};
      const houseSpots=houseRoom?Array.from({length:5},()=>emptySpot([houseRoom])):[];
      const rewardRooms=deadEnds.filter(r=>r!==houseRoom),ordinaryRooms=otherRooms.filter(r=>r!==houseRoom);
      const addItem=(kind,rooms=this.rooms,bias=true)=>{
        const preferred=bias?rewardRooms.filter(r=>rooms.includes(r)):[],pool=preferred.length&&this.random()<.65?preferred:rooms;
        const pos=emptySpot(pool);if(pos)this.items.push({...pos,kind,amount:kind==='gold'?this.int(20,65)*this.floor:1});
      };
      // Each floor guarantees food and healing as well as randomly placed supplies.
      ['bread','bread','bread','potion','potion','gold','gold','gold','arrow',this.random()<.5?'map':'scroll'].forEach(kind=>addItem(kind));
      if(this.floor===2||this.floor===5||this.floor===8)addItem('weapon',otherRooms);
      if(this.floor===3||this.floor===6||this.floor===9)addItem('shield',otherRooms);
      if(houseRoom){addItem('gold',[houseRoom],false);addItem('gold',[houseRoom],false);addItem('scroll',[houseRoom],false);}
      const count=4+Math.floor(this.floor*.75);
      for(let i=0;i<count;i++){
        const pos=i<houseSpots.length?houseSpots[i]:emptySpot(ordinaryRooms);if(!pos)continue;
        const type=this.floor<3?'slime':this.floor<6?(this.random()<.45?'bat':'slime'):(this.random()<.5?'ghost':'bat');
        const bonus=type==='ghost'?4:type==='bat'?2:0;
        this.enemies.push({...pos,id:i,type,name:type==='slime'?'苔スライム':type==='bat'?'洞窟コウモリ':'灯りの亡霊',hp:7+this.floor*2+bonus,maxHp:7+this.floor*2+bonus,attack:2+Math.ceil(this.floor*.8)+bonus/2,exp:3+Math.floor(this.floor/2)+bonus,awake:false,house:i<houseSpots.length});
      }
      for(let i=0;i<Math.min(this.floor,5);i++){const pos=emptySpot(ordinaryRooms,true);if(pos)this.traps.push({...pos,found:false,spent:false});}
      if(guardianSpot)this.enemies.push({...guardianSpot,id:99,type:'guardian',name:'星の番人',hp:65,maxHp:65,attack:14,exp:30,awake:true});
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
    move(dx,dy){
      if(this.status!=='playing'||!DIRS.some(d=>d[0]===dx&&d[1]===dy))return false;
      this.player.facing=[dx,dy];if(!this.canStep(this.player.x,this.player.y,dx,dy))return false;
      const x=this.player.x+dx,y=this.player.y+dy,enemy=this.enemyAt(x,y);
      if(enemy){this.hit(enemy,this.attackPower()+this.int(-1,2));}else{this.player.x=x;this.player.y=y;this.collect();this.triggerTrap();}
      this.finishTurn();return true;
    }
    attack(){if(this.status!=='playing')return false;const p=this.player,[dx,dy]=p.facing,e=this.canStep(p.x,p.y,dx,dy)?this.enemyAt(p.x+dx,p.y+dy):null;if(e)this.hit(e,this.attackPower()+this.int(-1,2));else{this.say('剣を振った。目の前に敵はいない。');this.effect('swing',p.x+dx,p.y+dy,0);}this.finishTurn();return true;}
    wait(){if(this.status!=='playing')return false;this.finishTurn();return true;}
    hit(enemy,damage){enemy.hp-=damage;enemy.awake=true;this.say(`${enemy.name}に${damage}ダメージ。`);this.effect('hit',enemy.x,enemy.y,damage);if(enemy.hp<=0){this.say(`${enemy.name}を倒した。経験値 +${enemy.exp}`,'good');this.player.exp+=enemy.exp;this.player.gold+=this.int(3,12)*this.floor;this.effect('kill',enemy.x,enemy.y,0);while(this.player.exp>=this.player.nextExp){this.player.exp-=this.player.nextExp;this.player.level++;this.player.nextExp=Math.floor(this.player.nextExp*1.35)+3;this.player.maxHp+=6;this.player.hp=Math.min(this.player.maxHp,this.player.hp+12);this.say(`レベル${this.player.level}になった！ 体力と攻撃力が上がった。`,'good');this.effect('level',this.player.x,this.player.y,this.player.level);}}}
    collect(){const p=this.player;const item=this.items.find(i=>i.x===p.x&&i.y===p.y);if(!item)return;if(item.kind==='gold'){p.gold+=item.amount;this.say(`${item.amount}Gを拾った。`,'good');}else if(item.kind==='weapon'){p.weapon++;this.say(`${this.weaponName()}を手に入れ、装備した。`,'good');}else if(item.kind==='shield'){p.shield++;this.say(`${this.shieldName()}を手に入れ、装備した。`,'good');}else{const stacks=item.kind==='arrow'&&this.arrowCount()>0;if(this.inventoryEntries().length>=16&&!stacks){this.say('持ち物がいっぱい。アイテムを使って空きを作ろう。');return;}p.bag.push(item.kind);this.say(`${ITEMS[item.kind].name}を拾った。`,'good');}this.effect('pickup',p.x,p.y,item.kind,this.log[0].text);this.items.splice(this.items.indexOf(item),1);}
    triggerTrap(){const p=this.player,t=this.traps.find(t=>t.x===p.x&&t.y===p.y&&!t.spent);if(!t)return;t.found=true;t.spent=true;const d=this.int(2,5);p.hp-=d;this.say(`足元にトゲの罠！ ${d}ダメージ。`,'danger');this.effect('damage',p.x,p.y,d);}
    use(index){
      if(this.status!=='playing')return false;const p=this.player,kind=p.bag[index];if(!ITEMS[kind])return false;
      if(kind==='bread'){const before=p.hunger;p.hunger=Math.min(100,p.hunger+50);this.say(`パンを食べた。満腹度 +${p.hunger-before}%`,'good');this.effect('heal',p.x,p.y,'満腹');}
      if(kind==='potion'){const before=p.hp;p.hp=Math.min(p.maxHp,p.hp+25);this.say(`回復草を使った。体力 +${p.hp-before}`,'good');this.effect('heal',p.x,p.y,p.hp-before);}
      if(kind==='scroll'){this.say('雷の巻物を読んだ！');for(const e of this.enemies)if(e.hp>0&&this.visible[this.key(e.x,e.y)])this.hit(e,18);this.effect('lightning',p.x,p.y,0);}
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
      if(this.onStairs()&&this.floor===10&&this.status==='playing'){
        if(this.enemies.some(e=>e.type==='guardian'&&e.hp>0))this.say('星の番人がランタンを守っている。番人を倒してから手に入れよう。');else{this.status='won';this.say('星のランタンを手に入れた！ 冒険の灯りは、永遠に。','good');this.effect('won',this.player.x,this.player.y,0);}
      }
    }
    enemyTurn(){
      const p=this.player;
      // One breadth-first distance field per turn keeps chasing fair and avoids wall clipping.
      const distance=Array(W*H).fill(Infinity),queue=[[p.x,p.y]];distance[this.key(p.x,p.y)]=0;
      for(let head=0;head<queue.length;head++){const[x,y]=queue[head],d=distance[this.key(x,y)];if(d>=15)continue;for(const[dx,dy]of DIRS){if(!this.canStep(x,y,dx,dy))continue;const nx=x+dx,ny=y+dy,k=this.key(nx,ny);if(distance[k]!==Infinity)continue;distance[k]=d+1;queue.push([nx,ny]);}}
      for(const e of this.enemies){if(e.hp<=0||(e.house&&!e.awake&&!this.monsterHouse?.triggered))continue;const dist=Math.max(Math.abs(e.x-p.x),Math.abs(e.y-p.y));if(dist<=7&&this.visible[this.key(e.x,e.y)])e.awake=true;
        if(dist===1&&this.canStep(e.x,e.y,p.x-e.x,p.y-e.y)){const d=Math.max(1,e.attack-this.defense()+this.int(-1,1));p.hp-=d;this.say(`${e.name}の攻撃。${d}ダメージ。`,'danger');this.effect('damage',p.x,p.y,d);if(p.hp<=0)break;continue;}
        if(!e.awake&&this.random()<.8)continue;
        let candidates=DIRS.filter(([dx,dy])=>this.canStep(e.x,e.y,dx,dy)&&!(e.x+dx===p.x&&e.y+dy===p.y)&&!this.enemyAt(e.x+dx,e.y+dy));
        if(e.awake)candidates=candidates.filter(([dx,dy])=>distance[this.key(e.x+dx,e.y+dy)]<distance[this.key(e.x,e.y)]).sort((a,b)=>distance[this.key(e.x+a[0],e.y+a[1])]-distance[this.key(e.x+b[0],e.y+b[1])]);
        const step=e.awake?candidates[0]:candidates[this.int(0,Math.max(0,candidates.length-1))];if(step){e.x+=step[0];e.y+=step[1];}
      }
    }
    onStairs(){return this.player.x===this.stairs.x&&this.player.y===this.stairs.y;}
    descend(){if(this.status!=='playing'||!this.onStairs()||this.floor===10)return false;this.floor++;this.turn++;this.generateFloor();this.say(`地下${this.floor}階「${FLOOR_NAMES[this.floor-1]}」へ降りた。`,'good');this.effect('descend',this.player.x,this.player.y,this.floor);return true;}
    weaponName(){return ['木の剣','銅の剣','鉄の剣','星鉄の剣'][Math.min(3,this.player.weapon)];}
    shieldName(){return ['旅人の盾','銅の盾','鉄の盾','星鉄の盾'][Math.min(3,this.player.shield)];}
    serialize(){const{effects,...state}=this;return JSON.stringify({version:1,state});}
    static restore(raw){try{const saved=JSON.parse(raw),s=saved.state;if(saved.version!==1||!s||!Array.isArray(s.tiles)||s.tiles.length!==W*H||!Array.isArray(s.seen)||s.seen.length!==W*H||!Array.isArray(s.rooms)||(s.rooms.length<4||s.rooms.length>8)||!Array.isArray(s.enemies)||!Array.isArray(s.items)||!Array.isArray(s.traps)||!Array.isArray(s.log)||!s.stairs||!s.player||!Array.isArray(s.player.bag)||s.player.bag.some(k=>!ITEMS[k])||(s.player.ammo!=null&&s.player.ammo!=='arrow')||!Number.isInteger(s.floor)||s.floor<1||s.floor>10||!Number.isFinite(s.turn)||!Number.isFinite(s.player.hp)||!Number.isFinite(s.player.hunger)||s.player.hunger<0||s.player.hunger>100||!['playing','dead','won'].includes(s.status))return null;if(s.layout!=null&&!Object.hasOwn(LAYOUT_NAMES,s.layout))return null;if(s.monsterHouse!=null&&(!Number.isInteger(s.monsterHouse.room)||s.monsterHouse.room<0||s.monsterHouse.room>=s.rooms.length||typeof s.monsterHouse.triggered!=='boolean'))return null;const game=Object.assign(Object.create(DungeonEngine.prototype),s);game.layout??=null;game.monsterHouse??=null;if(!game.tile(s.player.x,s.player.y))return null;game.player.ammo=game.arrowCount()?game.player.ammo??null:null;game.traps=game.traps.filter(t=>!game.isRoomEntrance(t.x,t.y));game.effects=[];game.reveal();return game;}catch{return null;}}
  }
  Object.assign(root,{DungeonEngine,DungeonData:{W,H,DIRS,ITEMS,FLOOR_NAMES,LAYOUT_NAMES}});
})(typeof window!=='undefined'?window:globalThis);
