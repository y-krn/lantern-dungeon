(function (root) {
  "use strict";
  const node = typeof module !== "undefined" && module.exports;
  if (node) require("./engine.js");
  const data = node ? require("./data.js") : root.DungeonData;
  const { W, H, DIRS, ITEMS, EQUIPMENT, ITEM_ORDER, MONSTERS, equipmentKind, itemKind, monsterStats } = data;
  const extras = {
    lightSeed: { name: "灯種", icon: "♧", description: "直線3マス以内に置き灯を一つ。6ターン灯り、蛾の注意を一度だけそらします。仮宿の帰還先にもなります。" },
    vineSeed: { name: "蔓の種", icon: "❧", description: "足元へ蔓を仕込みます。次に踏んだ者の移動を一度封じます。自分もかかり、攻撃は防げません。" },
    bait: { name: "香り団子", icon: "●", description: "食べると満腹度+15。直線3マス以内へ投げると、スライムや甲虫を一度だけ誘います。餌は6ターン残ります。" },
    pullTalisman: { name: "引き寄せの灯札", icon: "✧", description: "直線4マス以内の敵か床の品を、手前へ最大2マス引き寄せます。壁や他の対象は越えません。" },
    swapTalisman: { name: "入れ替えの灯札", icon: "✧", description: "見えている4マス以内の敵と位置を交換します。攻撃予告は元のマスに残り、着地先の罠は発動します。" },
    returnTalisman: { name: "仮宿の灯札", icon: "✧", description: "同じ階の置き灯へ戻り、灯りを消費します。敵が灯りの上にいると使えません。帰還後も敵は動きます。" },
  };
  const gear = {
    lampSpear: { name: "灯守りの槍", slot: "weapon", power: 2, weight: 0, description: "攻撃力 +2。向いている直線2マスの最初の敵を突きます。壁や手前の敵は越えません。" },
    bellHammer: { name: "鐘打ちの槌", slot: "weapon", power: 2, weight: 0, description: "攻撃力 +2。足踏みで溜め、次の一撃で1マス押します。壁への衝突は追加3ダメージ。音は近くの魔物を起こします。別の行動で溜めは消えます。" },
    returnShield: { name: "返しの盾", slot: "shield", power: 0, weight: 0, description: "防御力 +0。足踏みしたターン、正面からの射撃を一発だけ反射します。近接・強打・罠には効きません。" },
  };
  function install() {
    // Trial definitions are installed only after explicitly entering the trial.
    Object.assign(ITEMS, extras);
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
      this.strategy = { lamp: null, bait: null, vines: [], charged: false };
      this.player.bag.push("lightSeed", "lightSeed", "vineSeed", "bait", "pullTalisman", "swapTalisman", "returnTalisman");
      this.prepareTrialFloor();
      this.say("分け灯を携えて、五つの回廊へ。", "good");
    }
    dungeonInfo() {
      return { ...data.DUNGEONS.tutorial, name: "分け灯の回廊", label: "試作の冒険", floors: 5, treasure: "分け灯のランタン" };
    }
    floorName() { return ["灯りの庭", "響きの回廊", "返り矢の広間", "仮宿の間", "分け灯の聖域"][this.floor - 1]; }
    prepareTrialFloor() {
      this.strategy = { lamp: null, bait: null, vines: [], charged: false };
      for (const actor of [this.player, ...this.enemies]) {
        for (const key of ["bindUntil", "resistUntil", "lureUsed", "lure"]) delete actor[key];
      }
      const ordinary = this.enemies.filter(e => !e.house && e.type !== "guardian");
      if (ordinary[0]) Object.assign(ordinary[0], monsterStats("lanternMoth"), {hp: MONSTERS.lanternMoth.hp});
      if (this.floor >= 2 && ordinary[1]) Object.assign(ordinary[1], monsterStats("frostBat"), {hp: MONSTERS.frostBat.hp});
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
    path(from, to, max = W * H) {
      const values = Array(W * H).fill(Infinity), q = [{x: to.x, y: to.y}];
      values[this.key(to.x, to.y)] = 0;
      for (let h = 0; h < q.length; h++) {
        const v = q[h], d = values[this.key(v.x, v.y)];
        if (d >= max) continue;
        for (const [dx, dy] of DIRS) if (this.canStep(v.x, v.y, dx, dy)) {
          const k = this.key(v.x + dx, v.y + dy);
          if (values[k] === Infinity) { values[k] = d + 1; q.push({x: v.x + dx, y: v.y + dy}); }
        }
      }
      return { values, steps: values[this.key(from.x, from.y)] };
    }
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
    requiresAim(index, mode = "use") {
      const kind = itemKind(this.targetItem(index));
      return ["lightSeed", "pullTalisman", "swapTalisman"].includes(kind) || (kind === "bait" && mode === "throw");
    }
    previewUse(index, target, mode = "use") {
      if (!this.ready()) return null;
      const kind = itemKind(this.targetItem(index)), p = this.player;
      if (!Object.hasOwn(extras, kind)) return null;
      if (kind === "bait" && mode === "use") return {kind, label: "香り団子を食べる"};
      if (kind === "vineSeed") return !this.onStairs() && !this.strategy.vines.some(v => same(v, p)) ? {kind, label: "足元へ蔓を仕込む"} : null;
      if (kind === "returnTalisman") {
        const lamp = this.strategy.lamp;
        return lamp && this.tile(lamp.x, lamp.y) && !this.enemyAt(lamp.x, lamp.y) ? {kind, landing: lamp, label: "置き灯へ戻る"} : null;
      }
      if (!target || !Number.isInteger(target.x) || !Number.isInteger(target.y) || !this.inside(target.x, target.y) || !this.visible[this.key(target.x, target.y)] || !this.tile(target.x, target.y)) return null;
      const enemy = this.enemyAt(target.x, target.y), item = this.items.find(i => same(i, target));
      const disguised = enemy && MONSTERS[enemy.species]?.trait === "mimic" && !enemy.revealed;
      if (kind === "lightSeed" || kind === "bait") {
        if ((kind === "lightSeed" ? this.strategy.lamp : this.strategy.bait) || enemy || item || same(target, p) || same(target, this.stairs) || !this.ray(p, target, 3)) return null;
        return {kind, landing: target, label: kind === "lightSeed" ? "ここへ灯りを置く" : "ここへ団子を投げる"};
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
      if (kind === "lightSeed" || (kind === "bait" && mode === "throw")) {
        this.strategy[kind === "lightSeed" ? "lamp" : "bait"] = {x: target.x, y: target.y, remaining: 6};
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
      const charged = kind === "melee" && this.strategy?.charged && equipmentKind(this.player.equipment.weapon) === "bellHammer";
      const origin = {x: enemy.x, y: enemy.y}, visible = !!this.visible[this.key(enemy.x, enemy.y)], log = this.log.slice(), count = this.effects.length;
      super.hit(enemy, damage, kind);
      delete enemy.lure;
      if (charged) {
        this.strategy.charged = false;
        const dx = Math.sign(origin.x - this.player.x), dy = Math.sign(origin.y - this.player.y);
        if (enemy.hp > 0) {
          if (!this.canStep(enemy.x, enemy.y, dx, dy)) super.hit(enemy, 3, "impact");
          else if (!this.enemyAt(enemy.x + dx, enemy.y + dy)) { enemy.x += dx; enemy.y += dy; this.strategyLanding(enemy); }
        }
        for (const e of this.enemies) if (!e.house && e.hp > 0 && this.path(origin, e, 6).steps <= 6) e.awake = true;
      }
      if (!visible) { this.log = log; this.effects.splice(count); }
    }
    move(dx, dy) {
      if (!this.ready() || !DIRS.some(d => d[0] === dx && d[1] === dy) || !this.canStep(this.player.x, this.player.y, dx, dy)) return false;
      const enemy = this.enemyAt(this.player.x + dx, this.player.y + dy);
      if (!enemy && this.player.bindUntil >= this.turn + 1) return false;
      return super.move(dx, dy);
    }
    attack() {
      if (!this.ready()) return false;
      if (equipmentKind(this.player.equipment.weapon) !== "lampSpear") return super.attack();
      const p = this.player, [dx, dy] = p.facing;
      let x = p.x, y = p.y, hit = false;
      for (let i = 0; i < 2 && this.canStep(x, y, dx, dy); i++) {
        x += dx; y += dy;
        const enemy = this.enemyAt(x, y);
        if (enemy) { this.hit(enemy, this.attackPower() + this.int(-1, 2), "melee"); hit = true; break; }
      }
      if (!hit) { this.say("槍を突き出した。届く先に敵はいない。"); this.effect("swing", x, y, 0, undefined, this.attackVisual(p, {x, y})); }
      this.finishTurn(); return true;
    }
    wait() {
      if (!this.ready()) return false;
      this.strategy.charged = equipmentKind(this.player.equipment.weapon) === "bellHammer";
      this.waiting = true;
      this.guarding = equipmentKind(this.player.equipment.shield) === "returnShield";
      this.finishTurn(); return true;
    }
    triggerTrap() { this.strategyLanding(this.player); }
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
      if (actor !== this.player && same(this.strategy.bait, actor)) this.strategy.bait = null;
    }
    strategyStep(e) {
      const m = MONSTERS[e.species], p = this.player;
      let goal = p;
      if (!e.lureUsed && !e.lure) {
        const light = e.type === "moth", food = ["mossSlime", "amberSlime", "ironBeetle", "cobaltBeetle"].includes(e.species);
        const kind = light && this.strategy.lamp ? "lamp" : food && this.strategy.bait ? "bait" : null;
        if (kind && this.path(e, this.strategy[kind], 4).steps <= 4) {
          e.lure = {kind, remaining: 2}; e.lureUsed = true;
          if (this.visible[this.key(e.x, e.y)]) this.say(`${e.name}が${kind === "lamp" ? "分けた灯り" : "団子の香り"}へ顔を向けた。`);
        }
      }
      if (e.lure) {
        const target = this.strategy[e.lure.kind];
        if (target) goal = target;
        else delete e.lure;
      }
      const field = this.path(e, goal).values;
      const bound = e.bindUntil >= this.turn;
      if (!bound) for (let i = 0; i < (e.awake ? m.speed || 1 : 1); i++) {
        if (same(e, goal) || (goal === p && distance(e, p) === 1 && this.canStep(e.x, e.y, p.x - e.x, p.y - e.y))) break;
        const candidates = DIRS.filter(([dx, dy]) => this.canStep(e.x, e.y, dx, dy) && !same({x: e.x + dx, y: e.y + dy}, p) && !this.enemyAt(e.x + dx, e.y + dy));
        const chase = e.awake || e.lure ? candidates.filter(([dx, dy]) => field[this.key(e.x + dx, e.y + dy)] < field[this.key(e.x, e.y)]).sort((a, b) => field[this.key(e.x + a[0], e.y + a[1])] - field[this.key(e.x + b[0], e.y + b[1])])[0] : null;
        const forward = candidates.filter(([dx, dy]) => !e.direction || dx !== -e.direction[0] || dy !== -e.direction[1]);
        const wander = forward.length ? forward : candidates;
        const step = e.lure ? chase : chase || wander[this.int(0, Math.max(0, wander.length - 1))];
        if (!step) break;
        e.x += step[0]; e.y += step[1]; e.direction = step;
        this.strategyLanding(e);
        if (e.hp <= 0 || e.bindUntil >= this.turn) break;
      }
      if (e.lure && (--e.lure.remaining <= 0 || same(e, goal))) delete e.lure;
      return true;
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
    enemyHit(e, ranged = false) {
      const p = this.player, [dx, dy] = p.facing;
      if (ranged && this.guarding && Math.sign(e.x - p.x) === dx && Math.sign(e.y - p.y) === dy) {
        this.guarding = false;
        this.say("返しの盾が射撃を跳ね返した！", "good");
        const n = distance(p, e);
        let x = p.x, y = p.y;
        for (let i = 0; i < n && this.canStep(x, y, dx, dy); i++) {
          x += dx; y += dy;
          const target = this.enemyAt(x, y);
          if (target) { this.hit(target, e.attack + this.int(-1, 1), "physical"); this.effect("swing", x, y, 0, undefined, this.attackVisual(p, target, "arrow")); break; }
        }
        return;
      }
      super.enemyHit(e, ranged);
    }
    enemyTurn() {
      this.inEnemyTurn = true;
      this.enemies.sort((a, b) => a.id - b.id);
      try { super.enemyTurn(); } finally { delete this.inEnemyTurn; }
    }
    finishTurn() {
      if (!this.waiting) this.strategy.charged = false;
      super.finishTurn();
      delete this.waiting; delete this.guarding;
      this.tutorialCleared = false;
      if (this.status === "won") this.log = this.log.map(entry => entry.text.includes("深淵の迷宮」への道") ? {...entry, text: "分け灯のランタンを手に入れた！ 五つの回廊を踏破した。"} : entry);
      for (const key of ["lamp", "bait"]) if (this.strategy[key] && --this.strategy[key].remaining <= 0) {
        if (key === "lamp") this.say("分けた灯りが静かに消えた。");
        this.strategy[key] = null;
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
        if (parsed.version !== 2 || parsed.trial !== "strategy" || s?.strategyTrial !== true || typeof s.kitChosen !== "boolean" || s.floor > 5 || s.dungeon !== "tutorial" || s.tutorialCleared !== false || ["waiting", "guarding", "inEnemyTurn"].some(key => Object.hasOwn(s,key)) || !s.strategy || typeof s.strategy.charged !== "boolean" || !Array.isArray(s.strategy.vines)) return null;
        install();
        const game = root.DungeonSave.restoreDungeon(JSON.stringify({version: 1, state: s}), StrategyEngine);
        if (!game) return null;
        const validPosition = v => v && Number.isInteger(v.x) && Number.isInteger(v.y) && game.tile(v.x, v.y);
        for (const key of ["lamp", "bait"]) {
          const v = s.strategy[key];
          if (v !== null && (!validPosition(v) || !Number.isInteger(v.remaining) || v.remaining < 1 || v.remaining > 6)) return null;
        }
        if (s.strategy.vines.some(v => !validPosition(v)) || new Set(s.strategy.vines.map(v => game.key(v.x, v.y))).size !== s.strategy.vines.length) return null;
        for (const e of [game.player, ...game.enemies]) {
          if (!validPosition(e)) return null;
          for (const key of ["bindUntil", "resistUntil"]) if (e[key] != null && (!Number.isInteger(e[key]) || e[key] < 0 || e[key] > game.turn + 2)) return null;
          if (e.lureUsed != null && typeof e.lureUsed !== "boolean") return null;
          if (e.lure && (!["lamp", "bait"].includes(e.lure.kind) || !Number.isInteger(e.lure.remaining) || e.lure.remaining < 1 || e.lure.remaining > 2 || e.lureUsed !== true)) return null;
        }
        if (game.enemies.some(e => !Number.isInteger(e.id)) || new Set(game.enemies.map(e => e.id)).size !== game.enemies.length) return null;
        return game;
      } catch { return null; }
    }
  }
  root.StrategyEngine = StrategyEngine;
  if (node) module.exports = StrategyEngine;
})(typeof window !== "undefined" ? window : globalThis);
