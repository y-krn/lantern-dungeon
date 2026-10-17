(function (root) {
  "use strict";
  const node = typeof module !== "undefined" && module.exports;
  if (node) require("./engine.js");
  const data = node ? require("./data.js") : root.DungeonData;
  const { DIRS, ITEMS, EQUIPMENT, ITEM_ORDER, MONSTERS, equipmentKind, itemKind, monsterStats } = data;
  const extras = {
    lightSeed: { name: "灯種", icon: "♧", description: "直線3マス以内に置き灯を一つ。6ターン灯り、仮宿の灯札の帰還先になります。" },
    vineSeed: { name: "蔓の種", icon: "❧", description: "足元へ蔓を仕込みます。次に踏んだ者の移動を一度封じます。自分もかかり、攻撃は防げません。" },
    bait: { name: "香り団子", icon: "●", description: "食べると満腹度+15。旅の途中で食べる小さな団子。" },
    pullTalisman: { name: "引き寄せの灯札", icon: "✧", description: "直線4マス以内の敵か床の品を、手前へ最大2マス引き寄せます。壁や他の対象は越えません。" },
    swapTalisman: { name: "入れ替えの灯札", icon: "✧", description: "見えている4マス以内の敵と位置を交換します。攻撃予告は元のマスに残り、着地先の罠は発動します。" },
    returnTalisman: { name: "仮宿の灯札", icon: "✧", description: "同じ階の置き灯へ戻り、灯りを消費します。敵が灯りの上にいると使えません。帰還後も敵は動きます。" },
  };
  const gear = {
    lampSpear: { name: "灯守りの槍", slot: "weapon", power: 2, weight: 0, description: "攻撃力 +2。敵の方向へ進むと、直線2マス以内の最初の敵をその場で突きます。壁や手前の敵は越えません。" },
  };
  // Lantern echoes: each monster family lends its own trait to Rine's lantern.
  const ECHOES = {
    moss: { name: "苔の灯影", short: "苔", text: ["5歩進むごとに体力+1。", "5歩進むごとに体力+2。"] },
    wing: { name: "翼の灯影", short: "翼", text: ["見える敵がいない時、1回の移動で2マス進む。", "3マス以内に見える敵がいない時、1回の移動で2マス進む。"] },
    shot: { name: "灯弾の灯影", short: "灯弾", text: ["正面に隣接する敵がいない時、「攻撃」が直線3マス以内の最初の敵に届く（威力半分）。", "正面に隣接する敵がいない時、「攻撃」が直線4マス以内の最初の敵に届く（威力半分）。"] },
    feast: { name: "喰らいの灯影", short: "喰らい", text: ["近接攻撃が当たるたび満腹度+1。", "近接攻撃が当たるたび満腹度+2。"] },
    ember: { name: "金灯の灯影", short: "金灯", text: ["敵を倒すたび体力+3。"] },
    blink: { name: "揺らぎの灯影", short: "揺らぎ", text: ["敵の攻撃を受けた後、1/4の確率で同じ部屋の3マス以内へ転移する。"] },
    shell: { name: "殻の灯影", short: "殻", text: ["防御力+2。", "防御力+4。"] },
    root: { name: "根の灯影", short: "根", text: ["2ターン続けて攻撃を当てると、2回目以降の攻撃+3。", "2ターン続けて攻撃を当てると、2回目以降の攻撃+5。"] },
    veil: { name: "擬態の灯影", short: "擬態", text: ["眠っている敵は3マス以内に近づくまで気づかない。", "眠っている敵は2マス以内に近づくまで気づかない。"] },
    might: { name: "剛腕の灯影", short: "剛腕", text: ["近接攻撃が当たった敵を1マス押し出す。壁や敵にぶつかると追加2ダメージ。", "近接攻撃が当たった敵を1マス押し出す。壁や敵にぶつかると追加4ダメージ。"] },
  };
  const ECHO_SOURCES = {
    mossSlime: ["moss", 0], amberSlime: ["moss", 1],
    caveBat: ["wing", 0], emberBat: ["wing", 0], obsidianBat: ["wing", 1],
    frostBat: ["shot", 0], lanternGhost: ["shot", 0], thunderBat: ["shot", 1], frostGhost: ["shot", 1],
    lanternMoth: ["feast", 0], jadeBat: ["feast", 1], eclipseMoth: ["feast", 1], jadeGhost: ["feast", 1],
    goldGhost: ["ember", 0], abyssGhost: ["blink", 0],
    ironBeetle: ["shell", 0], cobaltBeetle: ["shell", 1],
    thornPlant: ["root", 0], moonPlant: ["root", 1],
    coinMimic: ["veil", 0], starMimic: ["veil", 1],
    stoneGolem: ["might", 0], obsidianGolem: ["might", 1],
  };
  // Trial floors swap a few ordinary monsters so every floor offers different echoes.
  const ECHO_ROSTERS = [["lanternMoth", "ironBeetle"], ["caveBat", "thornPlant"], ["coinMimic", "stoneGolem"], ["emberBat", "lanternGhost"], ["amberSlime", "eclipseMoth"]];
  const ECHO_DROP_PERCENT = 35, ECHO_PITY = 2;
  const echoShard = { name: "灯影の欠片", icon: "✦", description: "倒した魔物の残り火。踏むとランタンに宿り、今の灯影と入れ替わります。" };
  function echoOfSpecies(species) {
    const source = ECHO_SOURCES[species];
    if (!source) return null;
    const [id, tier] = source, echo = ECHOES[id];
    return { id, tier, species, name: echo.name, short: echo.short, text: echo.text[Math.min(tier, echo.text.length - 1)] };
  }
  function install() {
    // Trial definitions are installed only after explicitly entering the trial.
    Object.assign(ITEMS, extras, { echoShard });
    Object.assign(EQUIPMENT, gear);
    for (const kind of Object.keys(extras)) if (!ITEM_ORDER.includes(kind)) ITEM_ORDER.push(kind);
  }
  const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const same = (a, b) => a && b && a.x === b.x && a.y === b.y;
  class StrategyEngine extends root.DungeonEngine {
    constructor(seed = Date.now()) {
      install();
      super(seed);
      this.strategyTrial = true;
      this.kitChosen = false;
      this.strategy = { lamp: null, vines: [] };
      this.player.bag.push("lightSeed", "lightSeed", "vineSeed", "bait", "pullTalisman", "swapTalisman", "returnTalisman");
      this.prepareTrialFloor();
      this.say("分け灯を携えて、五つの回廊へ。", "good");
    }
    dungeonInfo() {
      return { ...data.DUNGEONS.tutorial, name: "分け灯の回廊", label: "試作の冒険", floors: 5, treasure: "分け灯のランタン" };
    }
    floorName() { return ["灯りの庭", "響きの回廊", "返り矢の広間", "仮宿の間", "分け灯の聖域"][this.floor - 1]; }
    prepareTrialFloor() {
      this.strategy = { lamp: null, vines: [] };
      for (const actor of [this.player, ...this.enemies]) {
        for (const key of ["bindUntil", "resistUntil"]) delete actor[key];
      }
      const ordinary = this.enemies.filter(e => !e.house && e.type !== "guardian");
      if (this.floor >= 2 && ordinary[1]) Object.assign(ordinary[1], monsterStats("frostBat"), {hp: MONSTERS.frostBat.hp});
      ECHO_ROSTERS[this.floor - 1].forEach((species, i) => {
        const e = ordinary[this.floor >= 2 ? i + 2 : i + 1];
        if (!e) return;
        delete e.revealed;
        Object.assign(e, monsterStats(species), {hp: MONSTERS[species].hp});
      });
      if (this.floor > 1) {
        const supplies = ["lightSeed", "vineSeed", "bait", ["pullTalisman", "swapTalisman", "returnTalisman"][(this.floor - 2) % 3]];
        for (const kind of supplies) {
          const spot = this.rooms.flatMap(r => {
            const cells = [];
            for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++)
              if (this.tile(x, y) && !this.enemyAt(x, y) && !same({x, y}, this.player) && !same({x, y}, this.stairs) && !this.items.some(i => same(i, {x, y})) && !this.traps.some(i => same(i, {x, y}))) cells.push({x, y});
            return cells;
          })[0];
          if (spot) this.items.push({ ...spot, kind, amount: 1 });
        }
      }
      this.reveal();
    }
    generateFloor() {
      super.generateFloor();
      if (this.strategyTrial) this.prepareTrialFloor();
    }
    chooseKit(variant) {
      if (this.kitChosen || this.turn !== 0 || this.status !== "playing" || (variant !== "none" && !Object.hasOwn(gear, variant))) return false;
      if (variant !== "none") {
        const kind = gear[variant].slot;
        this.player.bag.push(this.player.equipment[kind]);
        this.player.equipment[kind] = { kind, variant, rank: 0, bonus: 0, cursed: false, identified: true };
        this.say(`${gear[variant].name}を携えた。`, "good");
      }
      this.kitChosen = true;
      return true;
    }
    ready() { return this.kitChosen && this.status === "playing"; }
    ray(from, to, range, actors = true) {
      const dx = to.x - from.x, dy = to.y - from.y, n = distance(from, to);
      if (!n || n > range || (dx && dy && Math.abs(dx) !== Math.abs(dy))) return null;
      const sx = Math.sign(dx), sy = Math.sign(dy), cells = [];
      let p = {x: from.x, y: from.y};
      for (let i = 0; i < n; i++) {
        if (!this.canStep(p.x, p.y, sx, sy)) return null;
        p = {x: p.x + sx, y: p.y + sy}; cells.push(p);
        if (actors && i < n - 1 && this.enemyAt(p.x, p.y)) return null;
      }
      return cells;
    }
    requiresAim(index) {
      const kind = itemKind(this.targetItem(index));
      return ["lightSeed", "pullTalisman", "swapTalisman"].includes(kind);
    }
    previewUse(index, target, mode = "use") {
      if (!this.ready()) return null;
      const kind = itemKind(this.targetItem(index)), p = this.player;
      if (!Object.hasOwn(extras, kind)) return null;
      if (mode !== "use") return null;
      if (kind === "bait" && mode === "use") return {kind, label: "香り団子を食べる"};
      if (kind === "vineSeed") return !this.onStairs() && !this.strategy.vines.some(v => same(v, p)) ? {kind, label: "足元へ蔓を仕込む"} : null;
      if (kind === "returnTalisman") {
        const lamp = this.strategy.lamp;
        return lamp && this.tile(lamp.x, lamp.y) && !this.enemyAt(lamp.x, lamp.y) ? {kind, landing: lamp, label: "置き灯へ戻る"} : null;
      }
      if (!target || !Number.isInteger(target.x) || !Number.isInteger(target.y) || !this.inside(target.x, target.y) || !this.visible[this.key(target.x, target.y)] || !this.tile(target.x, target.y)) return null;
      const enemy = this.enemyAt(target.x, target.y), item = this.items.find(i => same(i, target));
      const disguised = enemy && MONSTERS[enemy.species]?.trait === "mimic" && !enemy.revealed;
      if (kind === "lightSeed") {
        if (this.strategy.lamp || enemy || item || same(target, p) || same(target, this.stairs) || !this.ray(p, target, 3)) return null;
        return {kind, landing: target, label: "ここへ灯りを置く"};
      }
      if (kind === "swapTalisman") return enemy && !disguised && distance(p, target) <= 4 && this.lineOfSight(p.x, p.y, target.x, target.y) ? {kind, enemy, landing: target, label: `${enemy.name}と入れ替わる`} : null;
      if (kind === "pullTalisman") {
        if ((!enemy && !item) || !this.ray(p, target, 4)) return null;
        const actor = enemy || item, dx = Math.sign(p.x - actor.x), dy = Math.sign(p.y - actor.y);
        let landing = {x: actor.x, y: actor.y};
        for (let i = 0; i < 2; i++) {
          const next = {x: landing.x + dx, y: landing.y + dy};
          if (!this.canStep(landing.x, landing.y, dx, dy) || same(next, p) || this.enemyAt(next.x, next.y) || (!enemy && this.items.some(v => v !== item && same(v, next)))) break;
          landing = next;
        }
        return same(landing, actor) ? null : {kind, enemy, item, landing, label: `${disguised ? "金貨の山" : enemy ? enemy.name : this.itemName(item)}を引き寄せる`};
      }
      return null;
    }
    use(index, target, mode = "use") {
      if (!this.ready()) return false;
      const kind = itemKind(this.targetItem(index));
      if (!Object.hasOwn(extras, kind)) return super.use(index, target);
      const plan = this.previewUse(index, target, mode);
      if (!plan) return false;
      const p = this.player;
      if (index === "ground") this.items.splice(this.items.indexOf(this.groundItem()), 1);
      else this.player.bag.splice(index, 1);
      if (kind === "lightSeed") {
        this.strategy.lamp = {x: target.x, y: target.y, remaining: 6};
      } else if (kind === "bait") p.hunger = Math.min(100, p.hunger + 15);
      else if (kind === "vineSeed") this.strategy.vines.push({x: p.x, y: p.y});
      else if (kind === "returnTalisman") {
        Object.assign(p, {x: plan.landing.x, y: plan.landing.y}); this.strategy.lamp = null;
        this.collect(); this.strategyLanding(p);
      } else if (kind === "swapTalisman") {
        const origin = {x: p.x, y: p.y};
        Object.assign(p, {x: plan.enemy.x, y: plan.enemy.y}); Object.assign(plan.enemy, origin);
        this.strategyLanding(plan.enemy); this.collect(); this.strategyLanding(p);
      } else if (kind === "pullTalisman") {
        const actor = plan.enemy || plan.item, dx = Math.sign(p.x - actor.x), dy = Math.sign(p.y - actor.y);
        while (!same(actor, plan.landing) && (!plan.enemy || actor.hp > 0)) {
          actor.x += dx; actor.y += dy;
          if (plan.enemy) this.strategyLanding(actor);
        }
      }
      this.say(plan.label + "。", "good");
      this.finishTurn();
      return true;
    }
    hit(enemy, damage, kind = "physical") {
      if (enemy.hp <= 0) return;
      const echo = this.echo(), strike = kind === "melee" || this.lanternShot, p = this.player;
      if (strike && echo?.id === "root" && p.lastStrike === this.turn - 1) damage += echo.tier ? 5 : 3;
      const visible = !!this.visible[this.key(enemy.x, enemy.y)], log = this.log.slice(), count = this.effects.length;
      super.hit(enemy, damage, kind);
      if (!visible) { this.log = log; this.effects.splice(count); }
      if (strike) p.lastStrike = this.turn;
      if (enemy.hp <= 0) {
        if (echo?.id === "ember" && p.hp > 0 && p.hp < p.maxHp) { p.hp = Math.min(p.maxHp, p.hp + 3); this.say("金灯の灯影が体力を3回復した。", "good"); }
        this.dropEcho(enemy);
        return;
      }
      if (kind !== "melee") return;
      if (echo?.id === "feast" && p.hunger < 100) p.hunger = Math.min(100, p.hunger + (echo.tier ? 2 : 1));
      if (echo?.id === "might") this.shove(enemy, echo.tier ? 4 : 2);
    }
    echo() { return this.player.echo ? echoOfSpecies(this.player.echo) : null; }
    echoInfo() {
      const echo = this.echo();
      return echo ? {label: `ランタン：${echo.name}（${MONSTERS[echo.species].name}）`, short: echo.short, text: echo.text}
        : {label: "ランタン：灯影なし", short: "", text: "倒した魔物が残す灯影の欠片を踏むと、その魔物の力が宿ります。"};
    }
    dropEcho(enemy) {
      if (!ECHO_SOURCES[enemy.species] || enemy.type === "guardian") return;
      const p = this.player, pity = p.echoPity || 0;
      if (pity < ECHO_PITY && this.int(1, 100) > ECHO_DROP_PERCENT) { p.echoPity = pity + 1; return; }
      const free = (x, y) => this.tile(x, y) && !same({x, y}, this.stairs) && !same({x, y}, p) && !this.items.some(i => same(i, {x, y}));
      const spot = [[0, 0], ...DIRS].map(([dx, dy]) => ({x: enemy.x + dx, y: enemy.y + dy})).find(v => free(v.x, v.y));
      if (!spot) return;
      p.echoPity = 0;
      this.items.push({...spot, kind: "echoShard", species: enemy.species, amount: 1, discovered: !!this.visible[this.key(spot.x, spot.y)]});
      if (this.visible[this.key(spot.x, spot.y)]) this.say(`${enemy.name}の灯影が残った。踏むとランタンに宿る。`, "good");
    }
    shove(enemy, impact) {
      const dx = Math.sign(enemy.x - this.player.x), dy = Math.sign(enemy.y - this.player.y);
      const x = enemy.x + dx, y = enemy.y + dy;
      if (this.canStep(enemy.x, enemy.y, dx, dy) && !this.enemyAt(x, y) && !same({x, y}, this.player)) {
        Object.assign(enemy, {x, y});
        this.strategyLanding(enemy);
      } else this.hit(enemy, impact, "magic");
    }
    itemName(item) {
      return item?.kind === "echoShard" ? `${MONSTERS[item.species]?.name || "魔物"}の灯影` : super.itemName(item);
    }
    itemDescription(item) {
      if (item?.kind !== "echoShard") return super.itemDescription(item);
      const echo = echoOfSpecies(item.species);
      return `${echo.name}：${echo.text} 踏むとランタンに宿り、今の灯影と入れ替わります。`;
    }
    collect() {
      const item = this.groundItem();
      if (item?.kind !== "echoShard") return super.collect();
      const p = this.player, previous = this.echo(), echo = echoOfSpecies(item.species);
      this.items.splice(this.items.indexOf(item), 1);
      p.echo = item.species; p.echoSteps = 0;
      this.say(`ランタンが${MONSTERS[item.species].name}の灯影を宿した。${echo.name}：${echo.text}${previous ? `（${previous.name}は消えた）` : ""}`, "good");
      this.effect("pickup", p.x, p.y, item.kind, this.log[0].text);
      return true;
    }
    defense() {
      const echo = this.echo();
      return super.defense() + (echo?.id === "shell" ? (echo.tier ? 4 : 2) : 0);
    }
    wakeRange() {
      const echo = this.echo();
      return echo?.id === "veil" ? (echo.tier ? 2 : 3) : 7;
    }
    calm(tier) {
      return !this.enemies.some(e => e.hp > 0 && this.visible[this.key(e.x, e.y)] && !(MONSTERS[e.species]?.trait === "mimic" && !e.revealed) && (!tier || distance(e, this.player) <= 3));
    }
    enemyHit(e, ranged = false) {
      super.enemyHit(e, ranged);
      const p = this.player, room = this.roomAt(p.x, p.y);
      if (this.echo()?.id !== "blink" || p.hp <= 0 || !room || this.int(1, 4) !== 1) return;
      const spots = [];
      for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++)
        if (distance({x, y}, p) >= 1 && distance({x, y}, p) <= 3 && this.tile(x, y) && !this.enemyAt(x, y) && !same({x, y}, this.stairs) && !this.items.some(i => same(i, {x, y}))) spots.push({x, y});
      if (!spots.length) return;
      Object.assign(p, spots[this.int(0, spots.length - 1)]);
      this.say("揺らぎの灯影で、リネは部屋の中へ転移した。", "good");
      this.strategyLanding(p);
    }
    move(dx, dy) {
      if (!this.ready() || !DIRS.some(d => d[0] === dx && d[1] === dy) || !this.canStep(this.player.x, this.player.y, dx, dy)) return false;
      if (equipmentKind(this.player.equipment.weapon) === "lampSpear" && this.spearTarget(dx, dy).enemy) {
        this.face(dx, dy);
        return this.attack();
      }
      const enemy = this.enemyAt(this.player.x + dx, this.player.y + dy);
      if (!enemy && this.player.bindUntil >= this.turn + 1) return false;
      const echo = this.echo();
      if (enemy || echo?.id !== "wing" || !this.calm(echo.tier)) return super.move(dx, dy);
      // The wing echo folds a second step into the same turn while no enemy is in view.
      const p = this.player;
      this.face(dx, dy);
      for (let step = 0; step < 2; step++) {
        if (step) {
          this.reveal();
          if (!this.canStep(p.x, p.y, dx, dy) || this.enemyAt(p.x + dx, p.y + dy) || !this.calm(echo.tier)) break;
        }
        p.x += dx; p.y += dy;
        const found = this.collect();
        this.triggerTrap();
        if (found || p.hp <= 0 || this.onStairs() || this.traps.some(t => same(t, p)) || p.bindUntil >= this.turn + 1) break;
      }
      this.finishTurn();
      return true;
    }
    spearTarget(dx, dy) {
      let {x, y} = this.player;
      for (let i = 0; i < 2 && this.canStep(x, y, dx, dy); i++) {
        x += dx; y += dy;
        const enemy = this.enemyAt(x, y);
        if (enemy) return {x, y, enemy};
      }
      return {x, y, enemy: null};
    }
    shotTarget(range) {
      const p = this.player, [dx, dy] = p.facing;
      let {x, y} = p;
      for (let i = 0; i < range && this.canStep(x, y, dx, dy); i++) {
        x += dx; y += dy;
        const enemy = this.enemyAt(x, y);
        if (enemy) return enemy;
      }
      return null;
    }
    lanternStrike(enemy) {
      this.lanternShot = true;
      try { this.hit(enemy, Math.max(1, Math.floor(this.attackPower() / 2) + this.int(-1, 1)), "arrow"); } finally { delete this.lanternShot; }
      this.finishTurn(); return true;
    }
    attack() {
      if (!this.ready()) return false;
      const p = this.player, [dx, dy] = p.facing, echo = this.echo();
      const spear = equipmentKind(p.equipment.weapon) === "lampSpear";
      const reach = spear ? this.spearTarget(dx, dy).enemy : this.canStep(p.x, p.y, dx, dy) && this.enemyAt(p.x + dx, p.y + dy);
      if (!reach && echo?.id === "shot") {
        const target = this.shotTarget(echo.tier ? 4 : 3);
        if (target) return this.lanternStrike(target);
      }
      if (!spear) return super.attack();
      const {x, y, enemy} = this.spearTarget(dx, dy);
      if (enemy) this.hit(enemy, this.attackPower() + this.int(-1, 2), "melee");
      else { this.say("槍を突き出した。届く先に敵はいない。"); this.effect("swing", x, y, 0, undefined, this.attackVisual(p, {x, y})); }
      this.finishTurn(); return true;
    }
    wait() {
      return this.ready() && super.wait();
    }
    triggerTrap() {
      this.strategyLanding(this.player);
      const p = this.player, echo = this.echo();
      if (echo?.id !== "moss" || p.hp <= 0) return;
      p.echoSteps = ((p.echoSteps || 0) + 1) % 5;
      if (!p.echoSteps && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + (echo.tier ? 2 : 1));
    }
    strategyLanding(actor) {
      const visible = !!this.visible[this.key(actor.x, actor.y)];
      const trap = this.traps.find(v => same(v, actor));
      if (trap) {
        if (actor === this.player || visible) trap.found = true;
        const damage = this.int(2, 5);
        if (actor === this.player) { actor.hp -= damage; this.say(`足元にトゲの罠！ ${damage}ダメージ。`, "danger"); this.effect("damage", actor.x, actor.y, damage); }
        else this.hit(actor, damage, "magic");
      }
      const vine = this.strategy.vines.find(v => same(v, actor));
      if (vine && actor.hp > 0) {
        this.strategy.vines.splice(this.strategy.vines.indexOf(vine), 1);
        const actionTurn = this.turn + (this.inEnemyTurn ? 0 : 1);
        if (!(actor.bindUntil >= actionTurn) && !(actor.resistUntil >= actionTurn)) {
          actor.bindUntil = actor === this.player ? this.turn + 2 : this.turn + 1;
          if (visible || actor === this.player) this.say(`${actor === this.player ? "リネ" : actor.name}の足に蔓が絡んだ。`, "warning");
        }
      }
    }
    resolveStrategyIntent(e, aim) {
      const range = aim.kind === "windup" ? 1 : MONSTERS[e.species].range;
      const cells = this.ray(e, aim, range, false);
      if (!cells) return;
      let target;
      for (const cell of cells) {
        target = same(cell, this.player) ? this.player : this.enemyAt(cell.x, cell.y);
        if (target) break;
      }
      if (target === this.player) this.enemyHit(e, aim.kind === "ranged");
      else if (target) {
        this.hit(target, e.attack + this.int(-1, 1), "physical");
        if (this.visible[this.key(e.x, e.y)] && this.visible[this.key(target.x, target.y)]) this.effect("swing", target.x, target.y, 0, undefined, this.attackVisual(e, target, aim.kind === "ranged" ? "ranged" : "melee"));
      } else if (this.visible[this.key(e.x, e.y)]) {
        this.say(`${e.name}の攻撃は空を切った。`);
        this.effect("swing", aim.x, aim.y, 0, undefined, this.attackVisual(e, aim, aim.kind === "ranged" ? "ranged" : "melee"));
      }
    }
    enemyTurn() {
      this.inEnemyTurn = true;
      this.enemies.sort((a, b) => a.id - b.id);
      try { super.enemyTurn(); } finally { delete this.inEnemyTurn; }
    }
    finishTurn() {
      super.finishTurn();
      this.tutorialCleared = false;
      if (this.status === "won") this.log = this.log.map(entry => entry.text.includes("深淵の迷宮」への道") ? {...entry, text: "分け灯のランタンを手に入れた！ 五つの回廊を踏破した。"} : entry);
      if (this.strategy.lamp && --this.strategy.lamp.remaining <= 0) {
        this.say("分けた灯りが静かに消えた。");
        this.strategy.lamp = null;
      }
      for (const e of [this.player, ...this.enemies]) if (e.bindUntil != null && e.bindUntil <= this.turn) {
        delete e.bindUntil; e.resistUntil = this.turn + 1;
      }
    }
    serialize() {
      const {effects, ...state} = this;
      return JSON.stringify({version: 2, trial: "strategy", state});
    }
    static restore(raw) {
      try {
        const parsed = JSON.parse(raw), s = parsed.state;
        if (parsed.version !== 2 || parsed.trial !== "strategy" || s?.strategyTrial !== true || typeof s.kitChosen !== "boolean" || s.floor > 5 || s.dungeon !== "tutorial" || s.tutorialCleared !== false || ["waiting", "guarding", "inEnemyTurn"].some(key => Object.hasOwn(s,key)) || !s.strategy || (Object.hasOwn(s.strategy, "charged") && typeof s.strategy.charged !== "boolean") || !Array.isArray(s.strategy.vines)) return null;
        // Retired trial equipment keeps its power, bonus, curse and location on resume.
        for (const item of [...Object.values(s.player?.equipment || {}), ...s.player.bag, ...s.items]) {
          if (item?.variant === "bellHammer" && item.kind === "weapon") item.variant = "lampSpear";
          if (item?.variant === "returnShield" && item.kind === "shield") item.variant = "travelerShield";
        }
        delete s.strategy.charged;
        install();
        const game = root.DungeonSave.restoreDungeon(JSON.stringify({version: 1, state: s}), StrategyEngine);
        if (!game) return null;
        const validPosition = v => v && Number.isInteger(v.x) && Number.isInteger(v.y) && game.tile(v.x, v.y);
        for (const key of ["lamp", "bait"]) {
          if (key === "bait" && !Object.hasOwn(s.strategy, key)) continue;
          const v = s.strategy[key];
          if (v !== null && (!validPosition(v) || !Number.isInteger(v.remaining) || v.remaining < 1 || v.remaining > 6)) return null;
        }
        if (s.strategy.vines.some(v => !validPosition(v)) || new Set(s.strategy.vines.map(v => game.key(v.x, v.y))).size !== s.strategy.vines.length) return null;
        for (const e of [game.player, ...game.enemies]) {
          if (!validPosition(e)) return null;
          for (const key of ["bindUntil", "resistUntil"]) if (e[key] != null && (!Number.isInteger(e[key]) || e[key] < 0 || e[key] > game.turn + 2)) return null;
          if (e.lureUsed != null && typeof e.lureUsed !== "boolean") return null;
          if (e.lure && (!["lamp", "bait"].includes(e.lure.kind) || !Number.isInteger(e.lure.remaining) || e.lure.remaining < 1 || e.lure.remaining > 2 || e.lureUsed !== true)) return null;
          delete e.lure; delete e.lureUsed;
        }
        delete game.strategy.bait;
        if (game.enemies.some(e => !Number.isInteger(e.id)) || new Set(game.enemies.map(e => e.id)).size !== game.enemies.length) return null;
        const p = game.player;
        if (p.echo != null && !Object.hasOwn(ECHO_SOURCES, p.echo)) return null;
        if (p.echoSteps != null && (!Number.isInteger(p.echoSteps) || p.echoSteps < 0 || p.echoSteps > 4)) return null;
        if (p.echoPity != null && (!Number.isInteger(p.echoPity) || p.echoPity < 0 || p.echoPity > ECHO_PITY)) return null;
        if (p.lastStrike != null && (!Number.isInteger(p.lastStrike) || p.lastStrike > game.turn)) return null;
        if (game.items.some(i => i.kind === "echoShard" && !Object.hasOwn(ECHO_SOURCES, i.species))) return null;
        return game;
      } catch { return null; }
    }
  }
  StrategyEngine.ECHOES = ECHOES;
  StrategyEngine.ECHO_SOURCES = ECHO_SOURCES;
  root.StrategyEngine = StrategyEngine;
  if (node) module.exports = StrategyEngine;
})(typeof window !== "undefined" ? window : globalThis);
