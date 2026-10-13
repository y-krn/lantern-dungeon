(function (root) {
  "use strict";
  const {
    W,
    H,
    INVENTORY_CAPACITY,
    DIRS,
    ITEMS,
    EQUIPMENT,
    LAYOUT_NAMES,
    DUNGEONS,
    MONSTERS,
    SCROLLS,
    SCROLL_NAMES,
    EQUIPMENT_NAMES,
    EQUIPMENT_KEYS,
    equipmentKind,
    itemKind,
    isEquipment,
    validEquipment,
    ITEM_ORDER,
  } =
    typeof module !== "undefined" && module.exports
      ? require("./data.js")
      : root.DungeonData;
  const generateDungeonFloor =
    typeof module !== "undefined" && module.exports
      ? require("./world.js")
      : root.generateDungeonFloor;
  const runEnemyTurn =
    typeof module !== "undefined" && module.exports
      ? require("./enemies.js")
      : root.runEnemyTurn;
  const { restoreDungeon, restoreIdentification } =
    typeof module !== "undefined" && module.exports
      ? require("./save.js")
      : root.DungeonSave;
  class DungeonEngine {
    constructor(
      seed = Date.now(),
      dungeon = "tutorial",
      tutorialCleared = false,
    ) {
      if (
        !Object.hasOwn(DUNGEONS, dungeon) ||
        (dungeon === "depths" && tutorialCleared !== true)
      )
        throw new RangeError("Dungeon is unknown or locked");
      this.dungeon = dungeon;
      this.tutorialCleared = tutorialCleared === true;
      this.seed = seed >>> 0;
      this.rng = this.seed || 1;
      this.floor = 1;
      this.turn = 0;
      this.status = "playing";
      this.log = [];
      this.effects = [];
      this.player = {
        x: 0,
        y: 0,
        hp: 30,
        maxHp: 30,
        hunger: 100,
        level: 1,
        exp: 0,
        nextExp: 8,
        gold: 0,
        weapon: 0,
        shield: 0,
        ammo: null,
        facing: [0, 1],
        bag: ["bread", "potion", "scroll"],
      };
      this.player.equipment = {
        weapon: {
          kind: "weapon",
          rank: 0,
          bonus: 0,
          cursed: false,
          identified: true,
        },
        shield: {
          kind: "shield",
          rank: 0,
          bonus: 0,
          cursed: false,
          identified: true,
        },
      };
      this.initIdentification();
      this.generateFloor();
      this.say("ランタンを灯した。小さな冒険のはじまり。", "good");
      this.say(
        `${this.dungeonInfo().name}へ。地下${this.maxFloor()}階に眠る「${this.dungeonInfo().treasure}」を探そう。`,
      );
    }
    dungeonInfo() {
      return DUNGEONS[this.dungeon];
    }
    maxFloor() {
      return this.dungeonInfo().floors;
    }
    floorName() {
      return this.dungeonInfo().names[this.floor - 1];
    }
    random() {
      this.rng = (Math.imul(this.rng, 1664525) + 1013904223) >>> 0;
      return this.rng / 4294967296;
    }
    int(a, b) {
      return a + Math.floor(this.random() * (b - a + 1));
    }
    key(x, y) {
      return y * W + x;
    }
    inside(x, y) {
      return x >= 0 && y >= 0 && x < W && y < H;
    }
    tile(x, y) {
      return this.inside(x, y) ? this.tiles[this.key(x, y)] : 0;
    }
    enemyAt(x, y) {
      return this.enemies.find((e) => e.x === x && e.y === y && e.hp > 0);
    }
    initIdentification(legacy = false) {
      // Appearance randomization has its own seed stream so it cannot change floor geometry.
      let random = this.seed ^ 0x9e3779b9;
      const names = [...SCROLL_NAMES];
      for (let i = names.length - 1; i > 0; i--) {
        random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
        const j = random % (i + 1);
        [names[i], names[j]] = [names[j], names[i]];
      }
      this.identification = {
        appearances: Object.fromEntries(
          SCROLLS.map((kind, i) => [kind, names[i]]),
        ),
        known: legacy || this.dungeon === "tutorial" ? [...SCROLLS] : [],
        names: {},
      };
    }
    equipmentPower(item) {
      return item ? EQUIPMENT[equipmentKind(item)].power + item.bonus : 0;
    }
    rollEquipment(slot) {
      const pool = Object.keys(EQUIPMENT).filter(
        (kind) => EQUIPMENT[kind].slot === slot,
      );
      let roll = this.int(
        1,
        pool.reduce((sum, kind) => sum + EQUIPMENT[kind].weight, 0),
      );
      for (const kind of pool) {
        roll -= EQUIPMENT[kind].weight;
        if (roll <= 0) return kind;
      }
    }
    itemName(item) {
      const kind = itemKind(item);
      if (isEquipment(item))
        return (
          EQUIPMENT[equipmentKind(item)].name +
          (item.identified
            ? `${item.bonus ? ` ${item.bonus > 0 ? "+" : ""}${item.bonus}` : ""}${item.cursed ? "（呪い）" : ""}`
            : "（未鑑定）")
        );
      if (SCROLLS.includes(kind) && !this.identification.known.includes(kind))
        return (
          this.identification.appearances[kind] +
          (this.identification.names[kind]
            ? `「${this.identification.names[kind]}」`
            : "") +
          "（未識別）"
        );
      return ITEMS[kind]?.name || "";
    }
    itemDescription(item) {
      const kind = itemKind(item);
      if (isEquipment(item)) {
        const data = EQUIPMENT[equipmentKind(item)],
          old = this.player.equipment[kind];
        const delta = this.equipmentPower(item) - this.equipmentPower(old);
        return `${data.description} ${item.identified ? `補正値 ${item.bonus > 0 ? "+" : ""}${item.bonus}。${item.cursed ? "呪われています。装備すると外せません。" : "呪いはありません。"}${item !== old ? ` 現在の装備との差：${delta >= 0 ? "+" : ""}${delta}。` : ""}` : "補正値と呪いは未鑑定です。装備するか、真名の灯札で鑑定すると判明します。"}`;
      }
      return SCROLLS.includes(kind) && !this.identification.known.includes(kind)
        ? "効果はまだ分かりません。かざすか、真名の灯札で鑑定すると、同じ種類の灯札も識別されます。"
        : ITEMS[kind]?.description || "";
    }
    nameScroll(index, name) {
      const kind = itemKind(this.player.bag[index]);
      if (
        this.status !== "playing" ||
        !SCROLLS.includes(kind) ||
        this.identification.known.includes(kind) ||
        typeof name !== "string"
      )
        return false;
      this.identification.names[kind] = name.trim().slice(0, 20);
      return true;
    }
    targetItem(target) {
      return typeof target === "number" && Number.isInteger(target)
        ? this.player.bag[target]
        : Object.hasOwn(EQUIPMENT_NAMES, target)
          ? this.player.equipment[target]
          : null;
    }
    identifyItem(target) {
      const item = this.targetItem(target),
        kind = itemKind(item);
      if (!ITEMS[kind]) return false;
      if (isEquipment(item)) item.identified = true;
      if (SCROLLS.includes(kind) && !this.identification.known.includes(kind))
        this.identification.known.push(kind);
      this.say(`${this.itemName(item)}と分かった。`, "good");
      return true;
    }
    equipmentBonus(kind) {
      const item = this.player.equipment[kind];
      return item ? item.bonus : 0;
    }
    attackPower() {
      return Math.max(
        1,
        5 +
          (this.player.level - 1) * 2 +
          this.equipmentPower(this.player.equipment.weapon),
      );
    }
    defense() {
      return Math.max(0, 1 + this.equipmentPower(this.player.equipment.shield));
    }
    arrowCount() {
      return this.player.bag.filter((kind) => kind === "arrow").length;
    }
    inventoryEntries() {
      const entries = [];
      let arrows;
      this.player.bag.forEach((item, index) => {
        const kind = itemKind(item);
        if (kind === "arrow" && arrows) {
          arrows.count++;
          return;
        }
        const entry = { kind, index, count: 1 };
        entries.push(entry);
        if (kind === "arrow") arrows = entry;
      });
      const order = (entry) =>
        SCROLLS.includes(entry.kind) &&
        !this.identification.known.includes(entry.kind)
          ? ITEM_ORDER.indexOf("scroll")
          : ITEM_ORDER.indexOf(entry.kind);
      return entries.sort((a, b) => order(a) - order(b) || a.index - b.index);
    }
    inventoryCount() {
      return (
        this.inventoryEntries().length +
        Object.values(this.player.equipment).filter(Boolean).length
      );
    }
    equip(index) {
      if (this.status !== "playing") return false;
      const p = this.player,
        item = p.bag[index];
      if (!validEquipment(item)) return false;
      const old = p.equipment[item.kind];
      if (old?.cursed) {
        this.say(`${this.itemName(old)}は呪われていて外せない！`, "danger");
        return false;
      }
      if (old) p.bag[index] = old;
      else p.bag.splice(index, 1);
      p.equipment[item.kind] = item;
      p[item.kind] = item.rank;
      item.identified = true;
      this.say(
        `${this.itemName(item)}を装備した。`,
        item.cursed ? "danger" : "good",
      );
      this.finishTurn();
      return true;
    }
    unequip(kind) {
      if (this.status !== "playing" || !Object.hasOwn(EQUIPMENT_NAMES, kind))
        return false;
      const p = this.player,
        item = p.equipment[kind];
      if (!item) return false;
      if (item.cursed) {
        this.say(`${this.itemName(item)}は呪われていて外せない！`, "danger");
        return false;
      }
      p.bag.push(item);
      p.equipment[kind] = null;
      p[kind] = 0;
      this.say(`${this.itemName(item)}を外した。`);
      this.finishTurn();
      return true;
    }
    dropEquipment(index) {
      return this.drop(index);
    }
    drop(index, exchange = false) {
      const p = this.player,
        item = p.bag[index];
      if (this.status !== "playing" || !Number.isInteger(index) || !item)
        return false;
      const ground = this.items.find((i) => i.x === p.x && i.y === p.y);
      if (
        (exchange ? !ground || !ITEMS[ground.kind] : ground) ||
        this.onStairs()
      ) {
        this.say("足元には置けない。空いている床へ移動しよう。");
        return false;
      }
      const kind = itemKind(item),
        amount = kind === "arrow" ? this.arrowCount() : 1;
      if (kind === "arrow") p.bag = p.bag.filter((value) => value !== "arrow");
      else p.bag.splice(index, 1);
      if (exchange) this.collect();
      this.items.push({
        ...(isEquipment(item) ? item : { kind }),
        x: p.x,
        y: p.y,
        amount,
        discovered: true,
      });
      if (!this.arrowCount()) p.ammo = null;
      this.say(
        `${this.itemName(item)}を${kind === "arrow" ? `${amount}本` : ""}${exchange ? "足元のアイテムと交換した" : "置いた"}。`,
      );
      this.finishTurn();
      return true;
    }
    equipArrow() {
      if (this.status !== "playing" || !this.arrowCount()) return false;
      this.player.ammo = this.player.ammo === "arrow" ? null : "arrow";
      this.say(
        this.player.ammo ? "木の矢を装備した。" : "木の矢の装備を外した。",
      );
      this.finishTurn();
      return true;
    }
    shoot() {
      if (this.player.ammo !== "arrow") return false;
      return this.use(this.player.bag.indexOf("arrow"));
    }
    say(text, type = "normal") {
      this.log.unshift({ text, type, turn: this.turn });
      this.log = this.log.slice(0, 40);
    }
    effect(type, x, y, value, text) {
      this.effects.push({ type, x, y, value, text });
    }
    canStep(x, y, dx, dy) {
      return (
        !!this.tile(x + dx, y + dy) &&
        (!(dx && dy) || (!!this.tile(x + dx, y) && !!this.tile(x, y + dy)))
      );
    }
    roomAt(x, y) {
      return this.rooms.find(
        (r) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h,
      );
    }
    isRoomEntrance(x, y) {
      const room = this.roomAt(x, y);
      return (
        !!room &&
        DIRS.some(
          ([dx, dy]) =>
            this.roomAt(x + dx, y + dy) !== room && this.canStep(x, y, dx, dy),
        )
      );
    }
    layoutName() {
      return LAYOUT_NAMES[this.layout] || "";
    }
    roomDoorCount(room) {
      const doors = new Set();
      for (let x = room.x; x < room.x + room.w; x++)
        for (const y of [room.y - 1, room.y + room.h])
          if (this.tile(x, y)) doors.add(this.key(x, y));
      for (let y = room.y; y < room.y + room.h; y++)
        for (const x of [room.x - 1, room.x + room.w])
          if (this.tile(x, y)) doors.add(this.key(x, y));
      let count = 0;
      while (doors.size) {
        count++;
        const first = doors.values().next().value,
          queue = [first];
        doors.delete(first);
        for (let i = 0; i < queue.length; i++)
          for (const [dx, dy] of [
            [0, -1],
            [1, 0],
            [0, 1],
            [-1, 0],
          ]) {
            const k = queue[i],
              x = (k % W) + dx,
              y = Math.floor(k / W) + dy,
              next = this.key(x, y);
            if (this.inside(x, y) && doors.delete(next)) queue.push(next);
          }
      }
      return count;
    }
    generateFloor() {
      return generateDungeonFloor(this);
    }
    lineOfSight(x0, y0, x1, y1) {
      let x = x0,
        y = y0;
      const dx = Math.abs(x1 - x0),
        dy = Math.abs(y1 - y0),
        sx = x0 < x1 ? 1 : -1,
        sy = y0 < y1 ? 1 : -1;
      let err = dx - dy;
      for (let i = 0; i < W + H; i++) {
        if (x === x1 && y === y1) return true;
        if ((x !== x0 || y !== y0) && !this.tile(x, y)) return false;
        const e = err * 2;
        if (e > -dy) {
          err -= dy;
          x += sx;
        }
        if (e < dx) {
          err += dx;
          y += sy;
        }
      }
      return false;
    }
    reveal() {
      this.visible.fill(false);
      const p = this.player;
      const room = this.roomAt(p.x, p.y);
      if (room) {
        for (let y = room.y - 1; y <= room.y + room.h; y++)
          for (let x = room.x - 1; x <= room.x + room.w; x++)
            if (this.inside(x, y)) this.visible[this.key(x, y)] = true;
      }
      for (let y = p.y - 3; y <= p.y + 3; y++)
        for (let x = p.x - 3; x <= p.x + 3; x++)
          if (
            this.inside(x, y) &&
            Math.hypot(x - p.x, y - p.y) <= 3.5 &&
            this.lineOfSight(p.x, p.y, x, y)
          )
            this.visible[this.key(x, y)] = true;
      for (let i = 0; i < this.seen.length; i++)
        if (this.visible[i]) this.seen[i] = true;
      for (const item of this.items)
        if (this.visible[this.key(item.x, item.y)]) item.discovered = true;
      for (const enemy of this.enemies)
        if (enemy.hp > 0 && this.visible[this.key(enemy.x, enemy.y)])
          enemy.lastSeen = { x: enemy.x, y: enemy.y };
    }
    face(dx, dy) {
      if (
        this.status !== "playing" ||
        !DIRS.some((d) => d[0] === dx && d[1] === dy)
      )
        return false;
      this.player.facing = [dx, dy];
      return true;
    }
    move(dx, dy) {
      if (!this.face(dx, dy)) return false;
      if (!this.canStep(this.player.x, this.player.y, dx, dy)) return false;
      const x = this.player.x + dx,
        y = this.player.y + dy,
        enemy = this.enemyAt(x, y);
      if (enemy) {
        this.hit(enemy, this.attackPower() + this.int(-1, 2), "melee");
      } else {
        this.player.x = x;
        this.player.y = y;
        this.collect();
        this.triggerTrap();
      }
      this.finishTurn();
      return true;
    }
    attack() {
      if (this.status !== "playing") return false;
      const p = this.player,
        [dx, dy] = p.facing,
        e = this.canStep(p.x, p.y, dx, dy)
          ? this.enemyAt(p.x + dx, p.y + dy)
          : null;
      if (e) this.hit(e, this.attackPower() + this.int(-1, 2), "melee");
      else {
        this.say("武器を振った。目の前に敵はいない。");
        this.effect("swing", p.x + dx, p.y + dy, 0);
      }
      this.finishTurn();
      return true;
    }
    wait() {
      if (this.status !== "playing") return false;
      this.finishTurn();
      return true;
    }
    hit(enemy, damage, kind = "physical") {
      const m = MONSTERS[enemy.species],
        trait = EQUIPMENT[equipmentKind(this.player.equipment.weapon)]?.trait;
      if (kind === "melee" && trait === "ghost" && enemy.type === "ghost")
        damage *= 2;
      damage = Math.max(
        1,
        damage -
          (kind !== "magic" && !(kind === "melee" && trait === "pierce")
            ? m?.armor || 0
            : 0),
      );
      if (m?.trait === "mimic") enemy.revealed = true;
      enemy.hp -= damage;
      if (m?.trait === "blink" && enemy.hp > 0) enemy.blinkPending = true;
      enemy.awake = true;
      this.say(`${enemy.name}に${damage}ダメージ。`);
      this.effect("hit", enemy.x, enemy.y, damage);
      if (enemy.hp <= 0) {
        this.say(`${enemy.name}を倒した。経験値 +${enemy.exp}`, "good");
        this.player.exp += enemy.exp;
        this.player.gold += this.int(3, 12) * this.floor;
        this.effect("kill", enemy.x, enemy.y, 0);
        while (this.player.exp >= this.player.nextExp) {
          this.player.exp -= this.player.nextExp;
          this.player.level++;
          this.player.nextExp = Math.floor(this.player.nextExp * 1.35) + 3;
          this.player.maxHp += 6;
          this.player.hp = Math.min(this.player.maxHp, this.player.hp + 12);
          this.say(
            `レベル${this.player.level}になった！ 体力と攻撃力が上がった。`,
            "good",
          );
          this.effect("level", this.player.x, this.player.y, this.player.level);
        }
      }
    }
    collect() {
      const p = this.player,
        item = this.items.find((i) => i.x === p.x && i.y === p.y);
      if (!item) return;
      if (item.kind === "gold") {
        p.gold += item.amount;
        this.say(`${item.amount}Gを拾った。`, "good");
      } else {
        const stacks = item.kind === "arrow" && this.arrowCount() > 0;
        if (this.inventoryCount() >= INVENTORY_CAPACITY && !stacks) {
          this.say(
            `持ち物がいっぱい。足元に${this.itemName(item)}がある。アイテムを使うか、空いている床に置くか、持ち物から足元のアイテムと交換しよう。`,
          );
          return;
        }
        const amount =
          item.kind === "arrow" && Number.isInteger(item.amount)
            ? Math.max(1, item.amount)
            : 1;
        const value = isEquipment(item)
          ? {
              kind: item.kind,
              rank: item.rank,
              bonus: item.bonus,
              cursed: item.cursed,
              identified: item.identified,
              ...(item.variant ? { variant: item.variant } : {}),
            }
          : item.kind;
        p.bag.push(...Array(amount).fill(value));
        this.say(
          `${this.itemName(value)}を${item.kind === "arrow" ? `${amount}本` : ""}拾った。`,
          "good",
        );
      }
      this.effect("pickup", p.x, p.y, item.kind, this.log[0].text);
      this.items.splice(this.items.indexOf(item), 1);
    }
    triggerTrap() {
      const p = this.player,
        t = this.traps.find((t) => t.x === p.x && t.y === p.y);
      if (!t) return;
      t.found = true;
      const d = this.int(2, 5);
      p.hp -= d;
      this.say(`足元にトゲの罠！ ${d}ダメージ。`, "danger");
      this.effect("damage", p.x, p.y, d);
    }
    scrollNeedsTarget(index) {
      return this.player.bag[index] === "identify";
    }
    use(index, target) {
      if (this.status !== "playing" || !Number.isInteger(index)) return false;
      const p = this.player,
        kind = itemKind(p.bag[index]);
      if (!ITEMS[kind]) return false;
      if (isEquipment(p.bag[index])) return this.equip(index);
      if (
        kind === "identify" &&
        (target === index || !ITEMS[itemKind(this.targetItem(target))])
      )
        return false;
      if (SCROLLS.includes(kind) && !this.identification.known.includes(kind)) {
        const appearance = this.itemName(kind);
        this.identification.known.push(kind);
        this.say(`${appearance}は${ITEMS[kind].name}だった！`, "good");
      }
      if (kind === "identify") this.identifyItem(target);
      if (kind === "uncurse") {
        let count = 0;
        for (const item of Object.values(p.equipment))
          if (item?.cursed) {
            item.cursed = false;
            count++;
          }
        this.say(
          count
            ? "装備中の呪いがすべて解けた！"
            : "装備中の品に呪いはなかった。",
          "good",
        );
      }
      if (kind === "bread") {
        const before = p.hunger;
        p.hunger = Math.min(100, p.hunger + 50);
        this.say(`パンを食べた。満腹度 +${p.hunger - before}%`, "good");
        this.effect("heal", p.x, p.y, "満腹");
      }
      if (kind === "potion") {
        const before = p.hp;
        p.hp = Math.min(p.maxHp, p.hp + 25);
        this.say(`回復草を使った。体力 +${p.hp - before}`, "good");
        this.effect("heal", p.x, p.y, p.hp - before);
      }
      if (kind === "scroll") {
        this.say("雷光の灯札をかざした！");
        for (const e of this.enemies)
          if (e.hp > 0 && this.visible[this.key(e.x, e.y)])
            this.hit(e, 18, "magic");
        this.effect("lightning", p.x, p.y, 0);
      }
      if (kind === "map") {
        this.seen.fill(true);
        this.say(
          "迷宮の地図が浮かび上がった。階段はミニマップの水色の印。",
          "good",
        );
        this.effect("map", p.x, p.y, 0);
      }
      if (kind === "arrow") {
        const [dx, dy] = p.facing;
        let x = p.x,
          y = p.y,
          hit = false;
        for (let i = 0; i < 10; i++) {
          if (!this.canStep(x, y, dx, dy)) break;
          x += dx;
          y += dy;
          const e = this.enemyAt(x, y);
          if (e) {
            this.hit(e, 12);
            hit = true;
            break;
          }
        }
        if (!hit) this.say("木の矢を放った。敵には当たらなかった。");
        this.effect("arrow", x, y, 0);
      }
      p.bag.splice(index, 1);
      if (kind === "arrow" && !this.arrowCount()) p.ammo = null;
      this.finishTurn();
      return true;
    }
    finishTurn() {
      this.turn++;
      this.reveal();
      const house = this.monsterHouse;
      if (
        house &&
        !house.triggered &&
        this.roomAt(this.player.x, this.player.y) === this.rooms[house.room]
      ) {
        house.triggered = true;
        const pack = this.enemies.filter((e) => e.house && e.hp > 0);
        if (pack.length) {
          for (const e of pack) e.awake = true;
          this.say(
            "モンスターハウス！ 眠っていた魔物たちが一斉に目を覚ました！",
            "danger",
          );
        }
      }
      if (
        this.turn %
          (EQUIPMENT[equipmentKind(this.player.equipment.shield)]?.trait ===
          "hunger"
            ? 8
            : 4) ===
          0 &&
        this.player.hunger > 0
      )
        this.player.hunger--;
      if (this.player.hunger === 0) {
        this.player.hp--;
        if (this.turn % 4 === 0)
          this.say(
            "お腹が空いて、体力が減っている。パンを食べよう！",
            "danger",
          );
        this.effect("damage", this.player.x, this.player.y, 1);
      } else if (this.turn % 7 === 0 && this.player.hp > 0)
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + 1);
      if (this.player.hp > 0) this.enemyTurn();
      this.enemies = this.enemies.filter((e) => e.hp > 0);
      this.reveal();
      if (this.player.hp <= 0) {
        this.player.hp = 0;
        this.status = "dead";
        this.say("ランタンの灯りが、静かに消えた。", "danger");
        this.effect("dead", this.player.x, this.player.y, 0);
      }
      if (
        this.onStairs() &&
        this.floor === this.maxFloor() &&
        this.status === "playing"
      ) {
        if (this.enemies.some((e) => e.type === "guardian" && e.hp > 0))
          this.say(
            `${this.dungeonInfo().guardian}がランタンを守っている。番人を倒してから手に入れよう。`,
          );
        else {
          this.status = "won";
          if (this.dungeon === "tutorial") this.tutorialCleared = true;
          this.say(
            `${this.dungeonInfo().treasure}を手に入れた！ ${this.dungeon === "tutorial" ? "チュートリアル完了。「深淵の迷宮」が解放された。" : "30階の深淵を踏破した！"}`,
            "good",
          );
          this.effect("won", this.player.x, this.player.y, 0);
        }
      }
    }
    clearShot(from, to, range) {
      const dx = to.x - from.x,
        dy = to.y - from.y,
        dist = Math.max(Math.abs(dx), Math.abs(dy));
      if (!dist || dist > range || (dx && dy && Math.abs(dx) !== Math.abs(dy)))
        return false;
      let x = from.x,
        y = from.y;
      const sx = Math.sign(dx),
        sy = Math.sign(dy);
      for (let i = 0; i < dist; i++) {
        if (!this.canStep(x, y, sx, sy)) return false;
        x += sx;
        y += sy;
        if (this.enemyAt(x, y)) return false;
      }
      return true;
    }
    enemyHit(e, ranged = false) {
      const p = this.player,
        m = MONSTERS[e.species],
        base = Math.max(1, e.attack - this.defense() + this.int(-1, 1)),
        d =
          ranged &&
          EQUIPMENT[equipmentKind(p.equipment.shield)]?.trait === "ranged"
            ? Math.ceil(base / 2)
            : base;
      p.hp -= d;
      const loss = m?.hunger ? Math.min(p.hunger, m.hunger) : 0;
      p.hunger -= loss;
      this.say(
        `${e.name}の攻撃。${d}ダメージ。${loss ? ` 満腹度 −${loss}。` : ""}`,
        "danger",
      );
      this.effect("damage", p.x, p.y, d);
    }
    enemyTurn() {
      return runEnemyTurn(this);
    }
    onStairs() {
      return this.player.x === this.stairs.x && this.player.y === this.stairs.y;
    }
    descend() {
      if (
        this.status !== "playing" ||
        !this.onStairs() ||
        this.floor >= this.maxFloor()
      )
        return false;
      this.floor++;
      this.turn++;
      this.generateFloor();
      this.say(`地下${this.floor}階「${this.floorName()}」へ降りた。`, "good");
      this.effect("descend", this.player.x, this.player.y, this.floor);
      return true;
    }
    weaponName() {
      return this.player.equipment.weapon
        ? this.itemName(this.player.equipment.weapon)
        : "未装備";
    }
    shieldName() {
      return this.player.equipment.shield
        ? this.itemName(this.player.equipment.shield)
        : "未装備";
    }
    restoreIdentification() {
      return restoreIdentification(this);
    }
    serialize() {
      const { effects, ...state } = this;
      return JSON.stringify({ version: 1, state });
    }
    static restore(raw) {
      return restoreDungeon(raw, DungeonEngine);
    }
  }
  root.DungeonEngine = DungeonEngine;
})(typeof window !== "undefined" ? window : globalThis);
