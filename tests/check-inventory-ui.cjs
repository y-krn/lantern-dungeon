const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
require('../dist/engine.js');
const createInventoryUI = require('../dist/inventory-ui.js');
const browser = vm.createContext({});
for (const file of ['data.js', 'inventory-ui.js']) {
  vm.runInContext(fs.readFileSync(require.resolve(`../dist/${file}`), 'utf8'), browser, {filename: file});
}

for (const factory of [createInventoryUI, browser.createInventoryUI]) {
  // Exercise the complete exported module in CommonJS and browser loading modes.
  function inventoryUI(engine) {
    const state = {kind:null, html:'', buttons:[], rows:[], controls:new Map(), open:false};
    function buttons(html) {
      return [...html.matchAll(/<button\b([^>]*)>/g)].map(match => {
        const attrs = Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(value => [value[1],value[2]]));
        const dataset = Object.fromEntries(Object.entries(attrs).filter(([key]) => key.startsWith('data-'))
          .map(([key,value]) => [key.slice(5).replace(/-([a-z])/g,(_,letter) => letter.toUpperCase()),value]));
        return {dataset, disabled:/\bdisabled\b/.test(match[1]), addEventListener(event,listener){this.listener=listener;},
          click(){assert(!this.disabled,'Cannot click a disabled action');assert(this.listener,'Missing action listener');this.listener();}};
      });
    }
    const node = () => ({hidden:true,value:'',focus(){},addEventListener(event,listener){this[event]=listener;},
      setAttribute(name,value){this[name]=value;},append(...children){this.children=children;}});
    const controls = id => {
      if (!state.controls.has(id)) state.controls.set(id,node());
      return state.controls.get(id);
    };
    const caption = {}, hint = {...node(),textContent:'敵が攻撃準備。',closest:()=>caption,after(){}};
    const persistent = new Map([['location-hint',hint],['bag-button',node()]]), created = [];
    const document = {
      createElement(){const element=node();created.push(element);return element;},
      getElementById(id){
        if(id==='modal')return {get open(){return state.open;}};
        if(id==='modal-content')return {
          querySelectorAll(selector){
            if(selector==='.bag-entry')return state.rows;
            const key=selector.slice(6,-1).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase());
            return state.buttons.filter(button=>Object.hasOwn(button.dataset,key));
          },
        };
        return persistent.get(id)||created.find(element=>element.id===id)||controls(id);
      },
    };
    const closeModal = () => {state.open=false;state.kind=null;};
    state.api = factory({getEngine:()=>engine,document,requestAnimationFrame(){},
      modalHeader:title=>`<h2>${title}</h2>`,closeModal,act:action=>action(),save(){},updateUI(){},
      openModal(kind,html){
        state.kind=kind;state.html=html;state.open=true;state.controls.clear();state.buttons=buttons(html);
        state.rows=[...html.matchAll(/<details class="bag-entry"[^>]*>([\s\S]*?)<\/details>/g)].map(match=>{
          const summary={addEventListener(event,listener){this.listener=listener;}};
          const row={open:false,querySelector(selector){
            return selector==='summary'?summary:match[1].includes(selector.slice(1,-1))?{}:null;
          },activate(){summary.listener();row.open=!row.open;}};
          return row;
        });
      },
    });
    state.action=(action,index='ground')=>{
      const button=state.buttons.find(button=>button.dataset.itemAction===action&&button.dataset.index===String(index));
      assert(button,`Missing ${action} action for ${index}`);button.click();
    };
    state.target=target=>{const button=state.buttons.find(button=>button.dataset.target===String(target));assert(button);button.click();};
    state.cancel=id=>{const control=controls(id);assert(control.click);control.click();};
    state.control=controls;state.close=closeModal;state.document=document;state.caption=caption;
    state.switchEngine=next=>{engine=next;};
    return state;
  }
  function quietUI() {
    const engine=new DungeonEngine(42),room=engine.roomAt(engine.player.x,engine.player.y);
    engine.player.x=room.cx;engine.player.y=room.cy;engine.enemies=[];engine.items=[];engine.traps=[];engine.monsterHouse=null;
    return engine;
  }
  {
    const engine=quietUI(),p=engine.player;
    const known={kind:'weapon',variant:'starSword',rank:3,bonus:2,cursed:false,identified:true};
    const unknown={kind:'shield',variant:'mirrorShield',rank:0,bonus:-2,cursed:true,identified:false};
    p.bag=['bread',known,unknown,'arrow','potion','arrow'];const ui=inventoryUI(engine);
    const saved=engine.serialize();ui.api.showBag();assert.equal(engine.serialize(),saved);assert.equal(ui.rows.length,7);
    assert(ui.html.includes(`攻撃力 ${engine.attackPower()}`));assert(ui.html.includes(`防御力 ${engine.defense()}`));
    assert(ui.html.includes(`矢 ${engine.arrowCount()}本`));assert(!/ターン|時間が進|品名を選んで操作/.test(ui.html));
    ui.rows[2].activate();ui.rows[3].activate();assert.equal(ui.rows[2].open,false);assert.equal(ui.rows[3].open,true);
    ui.rows[3].activate();assert(ui.rows.every(row=>!row.open));assert.equal(engine.serialize(),saved);
    const names=[...ui.html.matchAll(/<summary>[\s\S]*?<strong>([^<]+)<\/strong>/g)].map(match=>match[1]);
    assert.deepEqual(names.slice(2),['木の矢 × 2','鏡の盾（未鑑定）','焼きたてパン','回復草','星鉄の剣 +2']);
    ui.action('drop',0);assert.equal(engine.groundItem().kind,'bread');assert.equal(engine.turn,1);
    ui.api.showBag();assert(ui.html.includes('data-ground-row'));assert(ui.html.includes('足元'));
    ui.action('exchange',1);assert.equal(engine.groundItem().variant,'mirrorShield');assert(!engine.groundItem().identified);
    assert.equal(p.bag.at(-1),'bread');assert.equal(engine.turn,2);
  }
  {
    const engine=quietUI(),p=engine.player;
    const gear={...p.equipment.weapon,bonus:-2,cursed:true,identified:false,x:p.x,y:p.y,amount:1};
    engine.items=[gear];p.bag=['identify',{...p.equipment.shield,identified:false},...Array.from({length:16},()=>({kind:'shield',rank:0,bonus:0,cursed:false,identified:true}))];
    const ui=inventoryUI(engine),before=engine.serialize();ui.api.showBag();
    assert(ui.html.includes('data-ground-row'));assert(ui.html.includes('鑑定（灯札1枚）'));assert.equal(engine.serialize(),before);
    ui.action('use',0);assert.equal(ui.kind,'identify');
    assert.deepEqual(ui.buttons.filter(button=>button.dataset.target).map(button=>button.dataset.target),['ground','1']);
    assert(ui.html.includes('足元'));assert(ui.html.includes('持ち物'));assert(!/ターン|時間が進/.test(ui.html));assert.equal(engine.serialize(),before);
    ui.cancel('identify-cancel');assert.equal(ui.kind,'bag');assert.equal(engine.serialize(),before);
    assert(ui.rows.some(row=>row.open),'Cancellation reopens the source item');
    ui.action('use',0);ui.target('ground');assert(gear.identified);assert(gear.cursed);assert.equal(gear.bonus,-2);
    assert.equal(engine.turn,1);assert.equal(engine.inventoryCount(),19);assert.equal(engine.groundItem(),gear);
    gear.identified=false;p.bag.push('identify');ui.api.showBag();ui.action('appraise');
    assert(gear.identified);assert.equal(engine.turn,2);assert.equal(engine.inventoryCount(),19);
    p.bag=Array.from({length:18},()=>({kind:'shield',rank:0,bonus:0,cursed:false,identified:true}));p.hp=1;engine.items=[{kind:'potion',x:p.x,y:p.y}];
    ui.api.showBag();ui.action('use');assert.equal(p.hp,26);assert.equal(engine.turn,3);assert.equal(engine.inventoryCount(),20);
    engine.items=[{...gear,identified:false}];ui.api.useGroundFromField();assert.equal(ui.kind,'ground');
    const beforeExchange=engine.serialize();ui.action('exchange');assert.equal(ui.kind,'exchange');assert.equal(engine.serialize(),beforeExchange);
    ui.cancel('exchange-cancel');assert.equal(ui.kind,'ground');assert.equal(engine.serialize(),beforeExchange);
    ui.action('exchange');ui.buttons.find(button=>button.dataset.exchange==='17').click();
    assert.equal(engine.groundItem().kind,'shield');assert(p.bag.some(item=>item.cursed&&!item.identified));
    assert.equal(engine.inventoryCount(),20);assert.equal(engine.turn,4);
  }
  {
    const engine=quietUI(),p=engine.player;p.bag=['identify',...Array.from({length:17},()=>({kind:'shield',rank:0,bonus:0,cursed:false,identified:true}))];engine.identification.known=[];
    engine.items=[{kind:'map',x:p.x,y:p.y}];const ui=inventoryUI(engine);ui.api.showGround();
    assert(!ui.html.includes('道しるべの灯札'));assert(!ui.buttons.some(button=>button.dataset.itemAction==='appraise'));
    ui.action('name');ui.control('item-name').value='<script>&地図？';
    ui.control('item-name-form').submit({preventDefault(){}});
    assert.equal(ui.kind,'ground');assert(ui.html.includes('&lt;script&gt;&amp;地図？'));assert.equal(engine.turn,0);
    assert.equal(engine.identification.known.length,0);
    ui.close();engine.items=[{kind:'identify',x:p.x,y:p.y}];const before=engine.serialize();
    ui.api.useGroundFromField();assert.equal(ui.kind,'identify');assert.equal(engine.serialize(),before);
    ui.cancel('identify-cancel');assert.equal(ui.kind,null);assert.equal(engine.serialize(),before);
    engine.identification.known=['identify'];engine.items=[];p.bag=['identify','bread'];
    ui.api.showIdentify(0);assert(ui.html.includes('鑑定できる品がありません。'));assert(!ui.buttons.some(button=>button.dataset.target));
  }
  // Field controls keep threats visible and all unknown identities concealed.
  {
    const engine=quietUI(),p=engine.player,ui=inventoryUI(engine);engine.identification.known=[];
    const hint=ui.document.getElementById('location-hint');
    const groundContext=ui.document.getElementById('ground-context');
    const groundUseButton=ui.document.getElementById('ground-use-button');
    const groundItemButton=ui.document.getElementById('ground-item-button');
    for(const kind of ['bread','potion','scroll','map','identify','uncurse','arrow','weapon','shield','gold']){
      engine.items=[{kind,x:p.x,y:p.y,amount:1,...(['weapon','shield'].includes(kind)?p.equipment[kind]:{})}];
      const before=engine.serialize();ui.api.updateGround({threat:{name:'敵'},nearest:null});
      assert(!groundContext.hidden);assert(!hint.hidden);assert(!ui.caption.hidden);assert.equal(engine.serialize(),before);
      if(['scroll','map','identify','uncurse'].includes(kind))assert(!groundItemButton.innerHTML.includes(DungeonData.ITEMS[kind].name));
    }
    hint.textContent='';ui.api.updateGround();assert(hint.hidden,'A floor item replaces empty hints');
    hint.textContent='体力が少ない。 お腹が空いてきた。';
    ui.api.updateGround({danger:true});assert(!hint.hidden);assert(!ui.caption.hidden,'Survival warnings coexist with floor actions');
    ui.api.updateGround({nearest:{name:'敵'}});assert(!hint.hidden,'Nearby enemies remain visible with a floor item');
    engine.items=[];ui.api.updateGround();assert(groundContext.hidden);assert(groundUseButton.hidden);
    engine.items=[{kind:'bread',x:p.x+1,y:p.y}];ui.api.updateGround();assert(groundContext.hidden);
    engine.items=[{kind:'bread',x:p.x,y:p.y}];
    for(const status of ['dead','won']){engine.status=status;ui.api.updateGround();assert(groundContext.hidden);}
    hint.textContent='灯りの届く先へ、進んでみよう。';ui.api.updateGround();assert(ui.caption.hidden);
  }
  // A UI instance follows the replacement run, including callbacks bound before the switch.
  {
    const previous=quietUI(),next=quietUI();
    previous.player.bag=['bread'];next.player.bag=['potion'];next.player.hp=1;
    const ui=inventoryUI(previous),saved=previous.serialize();
    ui.document.getElementById('bag-button').click();assert(ui.html.includes('焼きたてパン'));
    ui.close();ui.switchEngine(next);
    ui.document.getElementById('bag-button').click();assert(ui.html.includes('回復草'));assert(!ui.html.includes('焼きたてパン'));
    ui.action('use',0);assert.equal(next.turn,1);assert.equal(next.player.hp,26);assert.equal(previous.serialize(),saved);
    next.items=[{kind:'bread',x:next.player.x,y:next.player.y}];
    ui.api.updateGround();ui.document.getElementById('ground-item-button').click();assert.equal(ui.kind,'ground');
    ui.close();ui.document.getElementById('ground-use-button').click();assert.equal(next.turn,2);assert.equal(next.items.length,0);
    assert.equal(previous.serialize(),saved);
    next.player.bag=['identify',{...next.player.equipment.shield,identified:false}];
    ui.api.showIdentify(0);
    const replacement=quietUI();replacement.player.bag=['identify',{...replacement.player.equipment.shield,identified:false}];
    const before=next.serialize();ui.switchEngine(replacement);ui.target(1);
    assert(replacement.player.bag[0].identified);assert.equal(replacement.turn,1);assert.equal(next.serialize(),before);
  }
}
console.log('PASS: inventory module browser/CommonJS loading, item locations, ground actions, appraisal/exchange/cancellation, naming privacy, field warnings and replacement runs.');
