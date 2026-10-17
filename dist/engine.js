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
    monsterStats,
    SCROLLS,
    SCROLL_NAMES,
    EQUIPMENT_NAMES,
    EQUIPMENT_KEYS,
    equipmentKind,
    itemKind,
    isEquipment,
    jarConsumable,
    validJar,
    validEquipment,
    ITEM_ORDER,
    WEAPON_SHAPES,
    TRAPS,
    RESONANCES,
    EVOLUTIONS,
    EVOLVE_KILLS,
    ECHOES,
    THROWN_ITEMS,
    BOONS,
    SHOP_SERVICES,
    START_KITS,
    INFUSIONS,
    INFUSION_SHOTS,
    SURFACES,
    ECHO_SOURCES,
    echoOfSpecies,
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
  const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const same = (a, b) => !!a && !!b && a.x === b.x && a.y === b.y;
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
      this.say("リネはランタンを灯した。忘れられた灯りを探す旅へ。", "good");
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
        // The appraisal talisman is always known so it can be used to learn the others.
        known: legacy || this.dungeon === "tutorial" ? [...SCROLLS] : ["identify"],
        names: {},
      };
    }
    equipmentPower(item) {
      if (!item) return 0;
      const base = EQUIPMENT[equipmentKind(item)].power;
      return (item.purified ? Math.floor(base / 2) : base) + item.bonus;
    }
    // A bane item's effect and cost hold until it is purified.
    bane(slot) {
      const item = this.player.equipment[slot];
      return item && !item.purified ? EQUIPMENT[equipmentKind(item)]?.bane || null : null;
    }
    cleanse(item) {
      if (!item?.cursed) return false;
      item.cursed = false;
      if (EQUIPMENT[equipmentKind(item)]?.bane) item.purified = true;
      return true;
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
      if (kind === "echoShard") return `${MONSTERS[item.species]?.name || "魔物"}の灯影`;
      if (kind === "keepJar" && typeof item === "object")
        return `灯籠瓶［${item.contents.map((value) => this.itemName(value)).join("・") || "空"}］`;
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
      if (kind === "echoShard") {
        const echo = echoOfSpecies(item.species);
        return `${echo.name}：${echo.text} 踏むとランタンに宿ります。枠が埋まっている時は、入れ替えるかどうかを選べます。`;
      }
      if (isEquipment(item)) {
        const data = EQUIPMENT[equipmentKind(item)],
          old = this.player.equipment[kind];
        const delta = this.equipmentPower(item) - this.equipmentPower(old);
        const stat = kind === "weapon" ? "攻撃力" : "防御力";
        if (!item.identified)
          return `${data.description} 本当の力と呪いの有無は、まだ分かりません。装備するか、真名の灯札で鑑定すると判明します。`;
        const power = this.equipmentPower(item);
        return `${stat} ${power >= 0 ? "+" : ""}${power}。${data.description.replace(/^(攻撃力|防御力) [^。]+。/, "")} ${item.cursed ? "呪われています。装備すると外せません。" : "呪いはありません。"}${item !== old ? ` 現在の装備より${stat} ${delta >= 0 ? "+" : ""}${delta}。` : ""}`;
      }
      return SCROLLS.includes(kind) && !this.identification.known.includes(kind)
        ? "効果はまだ分かりません。かざすか、真名の灯札で鑑定すると、同じ種類の灯札も識別されます。"
        : ITEMS[kind]?.description || "";
    }
    nameScroll(index, name) {
      const kind = itemKind(this.targetItem(index));
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
      if (target === "ground") return this.groundItem();
      return typeof target === "number" && Number.isInteger(target)
        ? this.player.bag[target]
        : Object.hasOwn(EQUIPMENT_NAMES, target)
          ? this.player.equipment[target]
          : null;
    }
    groundItem() {
      return this.items.find((item) => item.x === this.player.x && item.y === this.player.y);
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
      const echo = this.echoFor("shell");
      return Math.max(0, 1 + this.equipmentPower(this.player.equipment.shield)) +
        (echo ? (echo.tier ? 4 : 2) : 0);
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
        fromGround = index === "ground",
        ground = fromGround ? this.groundItem() : null,
        item = fromGround && ground
          ? {kind: ground.kind, rank: ground.rank, bonus: ground.bonus, cursed: ground.cursed, identified: ground.identified, ...(ground.variant ? {variant: ground.variant} : {})}
          : p.bag[index];
      if (!validEquipment(item)) return false;
      const old = p.equipment[item.kind];
      if (old?.cursed) {
        this.say(`${this.itemName(old)}は呪われていて外せない！`, "danger");
        return false;
      }
      if (fromGround) {
        if (!old && this.inventoryCount() >= INVENTORY_CAPACITY) {
          this.say("持ち物がいっぱい。装備する枠がない。");
          return false;
        }
        this.items.splice(this.items.indexOf(ground), 1,
          ...(old ? [{...old, x: p.x, y: p.y, amount: 1, discovered: true}] : []));
      } else if (old) p.bag[index] = old;
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
        ...(isEquipment(item) || validJar(item) ? item : { kind }),
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
    canInfuse(index) {
      const kind = itemKind(this.targetItem(index));
      // An unidentified talisman cannot be infused, so the option never reveals what it is.
      return (
        this.status === "playing" &&
        Object.hasOwn(INFUSIONS, kind) &&
        this.arrowCount() > 0 &&
        (!SCROLLS.includes(kind) || this.identification.known.includes(kind))
      );
    }
    infuse(index) {
      if ((index !== "ground" && !Number.isInteger(index)) || !this.canInfuse(index)) return false;
      const kind = itemKind(this.targetItem(index)),
        infusion = INFUSIONS[kind];
      if (index === "ground") this.items.splice(this.items.indexOf(this.groundItem()), 1);
      else this.player.bag.splice(index, 1);
      this.player.infusion = { kind: infusion.id, shots: INFUSION_SHOTS };
      this.say(`木の矢に${infusion.name}を移した。次の${INFUSION_SHOTS}本：${infusion.text}`, "good");
      this.effect("heal", this.player.x, this.player.y, infusion.name);
      this.finishTurn();
      return true;
    }
    infusionInfo() {
      const infusion = this.player.infusion;
      if (!infusion) return null;
      const data = Object.values(INFUSIONS).find((v) => v.id === infusion.kind);
      return { ...data, shots: infusion.shots };
    }
    // Applies the lantern's charge where an arrow struck or came to rest.
    infusedImpact(x, y, enemy) {
      const p = this.player,
        infusion = p.infusion;
      if (!infusion) return;
      if (infusion.kind === "thunder" && enemy && MONSTERS[enemy.species]?.trait !== "mirror") {
        const water = this.conduct([enemy]);
        if (!water.size) {
          if (enemy.hp > 0) this.hit(enemy, 6, "magic");
        } else {
          this.say("雷の矢が水たまりを伝った！", "danger");
          for (const e of this.enemies)
            if (e.hp > 0 && water.has(this.key(e.x, e.y))) this.hit(e, 12, "magic");
          if (water.has(this.key(p.x, p.y))) {
            p.hp -= 12;
            this.say("水たまりにいたリネも感電した！ 12ダメージ。", "danger");
            this.effect("damage", p.x, p.y, 12);
          }
        }
      }
      if (infusion.kind === "sleep" && enemy && enemy.hp > 0 && MONSTERS[enemy.species]?.trait !== "mirror") this.sleepEnemy(enemy, 5);
      if (infusion.kind === "fire") this.ignite(x, y);
      if (infusion.kind === "smoke")
        for (let fy = y - 1; fy <= y + 1; fy++)
          for (let fx = x - 1; fx <= x + 1; fx++)
            if (this.tile(fx, fy) && this.surfaceAt(fx, fy)?.type !== "fire") this.setSurface(fx, fy, "fog", 5);
      if (--infusion.shots <= 0) {
        delete p.infusion;
        this.say("矢に移した灯りが尽きた。");
      }
    }
    shoot() {
      if (this.player.ammo !== "arrow") return false;
      return this.use(this.player.bag.indexOf("arrow"));
    }
    say(text, type = "normal") {
      this.log.unshift({ text, type, turn: this.turn });
      this.log = this.log.slice(0, 40);
    }
    effect(type, x, y, value, text, attack) {
      this.effects.push({ type, x, y, value, text, ...(attack ? { attack } : {}) });
    }
    attackVisual(source, target, kind = "melee") {
      // Capture appearances now: defeated and blinking enemies leave their impact tile this turn.
      const capture = (actor) => ({
        id: actor === this.player ? "player" : actor.id,
        x: actor.x, y: actor.y, type: actor === this.player ? "hero" : actor.type,
        species: actor.species, hp: actor.hp, maxHp: actor.maxHp,
        revealed: actor.revealed, elite: actor.elite, spawned: actor.spawned, facing: actor.facing?.slice(),
        visible: actor === this.player || !!this.visible[this.key(actor.x, actor.y)],
      });
      return { source: capture(source), target: capture(target), kind };
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
      const p = this.player,
        shape = this.weaponShape();
      if (
        this.enemyAt(p.x + dx, p.y + dy) ||
        ((shape === "lampSpear" || shape === "hookSickle") && this.spearTarget(dx, dy).enemy)
      )
        return this.attack();
      if (p.bindUntil >= this.turn + 1) return false;
      // The wing echo folds a second step into the same turn while no enemy is in view.
      const echo = this.echoFor("wing"),
        steps = echo && this.calm(echo.tier) ? 2 : 1;
      for (let step = 0; step < steps; step++) {
        if (step) {
          this.reveal();
          if (!this.canStep(p.x, p.y, dx, dy) || this.enemyAt(p.x + dx, p.y + dy) || !this.calm(echo.tier)) break;
        }
        p.x += dx;
        p.y += dy;
        const found = this.collect();
        this.triggerTrap();
        this.echoStep();
        if (found || p.hp <= 0 || this.onStairs() || this.traps.some((t) => same(t, p)) || p.bindUntil >= this.turn + 1) break;
      }
      this.finishTurn();
      return true;
    }
    weaponShape() {
      const kind = equipmentKind(this.player.equipment.weapon);
      return EQUIPMENT[kind]?.shape || (WEAPON_SHAPES.includes(kind) ? kind : null);
    }
    spearTarget(dx, dy, skip = null) {
      let { x, y } = this.player;
      const reach = EQUIPMENT[equipmentKind(this.player.equipment.weapon)]?.reach || 2;
      for (let i = 0; i < reach && this.canStep(x, y, dx, dy); i++) {
        x += dx;
        y += dy;
        const enemy = this.enemyAt(x, y);
        if (enemy && enemy !== skip) return { x, y, enemy };
        if (enemy) continue;
      }
      return { x, y, enemy: null };
    }
    meleeTargets(shape, dx, dy) {
      const p = this.player;
      if (shape === "lampSpear" || shape === "hookSickle") {
        const first = this.spearTarget(dx, dy).enemy;
        // A piercing spear also strikes the next enemy in line within reach.
        const second = first && EQUIPMENT[equipmentKind(p.equipment.weapon)]?.pierce ? this.spearTarget(dx, dy, first).enemy : null;
        return [first, second].filter(Boolean);
      }
      const facing = DIRS.findIndex((d) => d[0] === dx && d[1] === dy);
      const dirs = shape === "sweepAxe" ? [facing + 7, facing, facing + 1].map((i) => DIRS[i % 8]) : [[dx, dy]];
      return dirs
        .filter(([x, y]) => this.canStep(p.x, p.y, x, y))
        .map(([x, y]) => this.enemyAt(p.x + x, p.y + y))
        .filter(Boolean);
    }
    shotTarget(range) {
      const [dx, dy] = this.player.facing;
      let { x, y } = this.player;
      for (let i = 0; i < range && this.canStep(x, y, dx, dy); i++) {
        x += dx;
        y += dy;
        const enemy = this.enemyAt(x, y);
        if (enemy) return enemy;
      }
      return null;
    }
    attack() {
      if (this.status !== "playing") return false;
      const p = this.player,
        [dx, dy] = p.facing,
        echo = this.echoFor("shot"),
        shape = this.weaponShape(),
        gear = EQUIPMENT[equipmentKind(p.equipment.weapon)] || {},
        targets = this.meleeTargets(shape, dx, dy);
      if (!targets.length && echo) {
        const target = this.shotTarget(echo.tier ? 4 : 3);
        if (target) {
          // The meteor resonance keeps lantern shots at full strength.
          const power = this.resonance("meteor") ? this.attackPower() : Math.floor(this.attackPower() / 2);
          this.lanternShot = true;
          try {
            this.hit(target, Math.max(1, power + this.int(-1, 1)), "arrow");
          } finally {
            delete this.lanternShot;
          }
          this.finishTurn();
          return true;
        }
      }
      if (!targets.length) {
        const reach = shape === "lampSpear" || shape === "hookSickle" ? this.spearTarget(dx, dy) : { x: p.x + dx, y: p.y + dy };
        this.say(shape ? `${gear.name}を振るった。届く先に敵はいない。` : "武器を振った。目の前に敵はいない。");
        this.effect("swing", reach.x, reach.y, 0, undefined, this.attackVisual(p, reach));
      }
      for (const enemy of targets) {
        if (enemy.hp <= 0) continue;
        this.hit(enemy, this.attackPower() + this.int(-1, 2), "melee");
        if (enemy.hp <= 0) continue;
        if (gear.leech && p.hp > 0) p.hp = Math.min(p.maxHp, p.hp + gear.leech);
        if (shape === "hookSickle") for (let i = 0; i < (gear.pull || 1) && distance(enemy, p) >= 2 && enemy.hp > 0; i++) this.pull(enemy);
        if (shape === "pushMaul") {
          const might = this.echoFor("might");
          this.push(enemy, (gear.push || 2) + (might ? 1 : 0), (gear.impact || 3) + (might ? (might.tier ? 4 : 2) : 0) + (this.resonance("quake") ? 3 : 0));
        }
      }
      this.finishTurn();
      return true;
    }
    pull(enemy) {
      const p = this.player,
        dx = Math.sign(p.x - enemy.x),
        dy = Math.sign(p.y - enemy.y),
        x = enemy.x + dx,
        y = enemy.y + dy;
      if (!this.canStep(enemy.x, enemy.y, dx, dy) || this.enemyAt(x, y) || same({ x, y }, p)) return;
      Object.assign(enemy, { x, y });
      this.landing(enemy);
      return true;
    }
    push(enemy, steps, impact) {
      const dx = Math.sign(enemy.x - this.player.x),
        dy = Math.sign(enemy.y - this.player.y);
      for (let i = 0; i < steps && enemy.hp > 0; i++) {
        const x = enemy.x + dx,
          y = enemy.y + dy,
          other = this.enemyAt(x, y);
        if (!this.canStep(enemy.x, enemy.y, dx, dy) || other || same({ x, y }, this.player)) {
          this.hit(enemy, impact, "magic");
          if (other) this.hit(other, impact, "magic");
          return;
        }
        Object.assign(enemy, { x, y });
        this.landing(enemy);
      }
    }
    // Forced movement onto a trap springs it for monsters as well as for Rine.
    landing(actor) {
      if (actor === this.player) {
        this.triggerTrap();
        return;
      }
      const trap = this.traps.find((t) => same(t, actor));
      if (trap) this.springTrap(trap, actor);
      if (trap?.type !== "fire" && actor.hp > 0 && this.surfaceAt(actor.x, actor.y)?.type === "fire") this.hit(actor, 4, "magic");
    }
    echo() {
      return this.echoes()[0] || null;
    }
    echoes() {
      const p = this.player;
      return [p.echo, p.echo2].filter(Boolean).map(echoOfSpecies);
    }
    echoSlots() {
      return this.player.echoSlots === 2 ? 2 : 1;
    }
    // The strongest held echo of a family, so two of a kind never stack.
    echoFor(id) {
      return this.echoes().filter((e) => e.id === id).sort((a, b) => b.tier - a.tier)[0] || null;
    }
    resonances() {
      const held = new Set(this.echoes().map((e) => e.id));
      return Object.entries(RESONANCES)
        .filter(([, r]) => r.pair.every((id) => held.has(id)))
        .map(([id, r]) => ({ id, ...r }));
    }
    resonance(id) {
      return this.resonances().some((r) => r.id === id);
    }
    echoInfo() {
      const echoes = this.echoes(),
        resonances = this.resonances(),
        slots = this.echoSlots();
      if (!echoes.length)
        return { label: `ランタン：灯影なし（${slots}枠）`, short: "", text: "倒した魔物が残す灯影の欠片を踏むと、その魔物の力が宿ります。" };
      return {
        label: `ランタン：${echoes.map((e) => `${e.name}（${MONSTERS[e.species].name}）`).join("・")}${slots === 2 && echoes.length < 2 ? "・空き1枠" : ""}`,
        short: echoes.map((e) => e.short).join("・"),
        text: [...echoes.map((e) => e.text), ...resonances.map((r) => `共鳴「${r.name}」：${r.text}`)].join(" "),
      };
    }
    // With two slots a new echo fills the empty one, else displaces the older.
    echoSlotFree() {
      return this.echoes().length < this.echoSlots();
    }
    // Fills the first free slot; callers check echoSlotFree() first.
    absorbEcho(species) {
      const p = this.player;
      if (!p.echo) p.echo = species;
      else p.echo2 = species;
      p.echoSteps = 0;
    }
    // The shard under Rine while every slot is taken, offered for an exchange.
    echoOffer() {
      const shard = this.groundItem();
      return this.status === "playing" && shard?.kind === "echoShard" && !this.echoSlotFree() ? echoOfSpecies(shard.species) : null;
    }
    // Replaces the echo in the given slot with the shard underfoot; free, like a shrine boon.
    replaceEcho(slot) {
      const incoming = this.echoOffer(),
        p = this.player,
        key = slot === 0 ? "echo" : slot === 1 && this.echoSlots() === 2 ? "echo2" : null;
      if (!incoming || !key || !p[key]) return false;
      const previous = echoOfSpecies(p[key]),
        shard = this.groundItem();
      this.items.splice(this.items.indexOf(shard), 1);
      p[key] = incoming.species;
      p.echoSteps = 0;
      this.say(`${previous.name}を手放し、${MONSTERS[incoming.species].name}の灯影を宿した。${incoming.name}：${incoming.text}`, "good");
      this.effect("pickup", p.x, p.y, "echoShard", this.log[0].text);
      return true;
    }
    // Guaranteed rewards can share the death cell when every nearby cell is taken.
    placeShard(species, at, guaranteed = false) {
      const p = this.player,
        free = (x, y) => this.tile(x, y) && !same({ x, y }, this.stairs) && !this.items.some((i) => same(i, { x, y })),
        spot = [[0, 0], ...DIRS].map(([dx, dy]) => ({ x: at.x + dx, y: at.y + dy })).find((v) => free(v.x, v.y) && (at === p || !same(v, p)))
          || (guaranteed ? {x: at.x, y: at.y} : null);
      if (!spot) return false;
      const visible = !!this.visible[this.key(spot.x, spot.y)];
      this.items.push({ ...spot, kind: "echoShard", species, amount: 1, discovered: visible });
      return true;
    }
    echoDropRule() {
      return { percent: 15, pity: 4 };
    }
    dropEcho(enemy) {
      if (!ECHO_SOURCES[enemy.species] || enemy.type === "guardian" || enemy.spawned) return;
      const p = this.player,
        pity = p.echoPity || 0,
        rule = this.echoDropRule();
      if (!enemy.elite && pity < rule.pity && this.int(1, 100) > rule.percent) {
        p.echoPity = pity + 1;
        return;
      }
      if (!this.placeShard(enemy.species, enemy, enemy.elite)) return;
      if (!enemy.elite) p.echoPity = 0;
      const shard = this.items.at(-1);
      if (shard.discovered) this.say(`${enemy.name}の灯影が残った。踏むとランタンに宿る。`, "good");
    }
    echoStep() {
      const p = this.player,
        echo = this.echoFor("moss");
      if (!echo || p.hp <= 0) return;
      p.echoSteps = ((p.echoSteps || 0) + 1) % (this.resonance("mossShell") ? 3 : 5);
      if (!p.echoSteps && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + (echo.tier ? 2 : 1));
    }
    wakeRange() {
      const echo = this.echoFor("veil");
      return echo ? (echo.tier ? 2 : 3) : 7;
    }
    calm(tier) {
      return !this.enemies.some(
        (e) =>
          e.hp > 0 &&
          this.visible[this.key(e.x, e.y)] &&
          !(MONSTERS[e.species]?.trait === "mimic" && !e.revealed) &&
          (!tier || distance(e, this.player) <= 3),
      );
    }
    wait() {
      if (this.status !== "playing") return false;
      this.finishTurn();
      return true;
    }
    hit(enemy, damage, kind = "physical") {
      if (enemy.hp <= 0) return;
      const p = this.player,
        root = this.echoFor("root"),
        strike = kind === "melee" || this.lanternShot;
      if (strike && root && p.lastStrike === this.turn - 1) damage += root.tier ? 5 : 3;
      // The ambush resonance doubles blows on monsters that have not noticed Rine.
      if (strike && (!enemy.awake || enemy.sleepUntil >= this.turn) && this.resonance("ambush")) damage *= 2;
      const monster = MONSTERS[enemy.species];
      if (monster?.trait === "mirror" && (kind === "arrow" || this.lanternShot)) {
        const reflected = Math.ceil(Math.max(1, damage) / 2);
        p.hp -= reflected;
        if (this.visible[this.key(enemy.x, enemy.y)]) {
          this.say(`${enemy.name}に${this.lanternShot ? "灯弾" : "矢"}が跳ね返った！ ${reflected}ダメージ。`, "danger");
          this.effect("damage", p.x, p.y, reflected, undefined, this.attackVisual(enemy, p, "ranged"));
        }
        this.wakeEnemy(enemy);
        return;
      }
      if ((monster?.trait === "ward" || monster?.ward) && (kind === "melee" || kind === "arrow" || this.lanternShot)) damage = Math.ceil(damage / 2);
      this.strike(enemy, damage, kind);
      if (strike) p.lastStrike = this.turn;
      if (enemy.hp <= 0) {
        if (kind === "melee" && p.equipment.weapon) p.equipment.weapon.kills = (p.equipment.weapon.kills || 0) + 1;
        if (this.echoFor("ember") && p.hp > 0 && p.hp < p.maxHp) {
          p.hp = Math.min(p.maxHp, p.hp + 3);
          this.say("金灯の灯影が体力を3回復した。", "good");
        }
        if (enemy.stolen) {
          const spot = [[0, 0], ...DIRS].map(([dx, dy]) => ({x: enemy.x + dx, y: enemy.y + dy}))
            .find(v => this.tile(v.x, v.y) && !same(v, this.stairs) && !this.items.some(i => same(i, v))) || {x: enemy.x, y: enemy.y};
          if (spot) {
            this.items.push({...spot, kind: enemy.stolen, amount: 1, discovered: !!this.visible[this.key(spot.x, spot.y)]});
            delete enemy.stolen;
          }
        }
        this.dropEcho(enemy);
        if (monster?.miniboss && !enemy.spawned) {
          p.shrineBonus = Math.min(2, (p.shrineBonus || 0) + 1);
          if (this.shrine && !this.shrine.used && this.shrine.choices.length === 3) {
            const pool = Object.keys(BOONS).filter(id => !this.shrine.choices.some(c => c.id === id)),
              id = pool[this.int(0, pool.length - 1)], species = Object.keys(ECHO_SOURCES);
            this.shrine.choices.push(id === "echo" ? {id, species: species[this.int(0, species.length - 1)]} : {id});
          }
          this.say("迷宮の奥から灯りが届いた。次に触れる灯台の候補が一つ増える。", "good");
          this.effect("level", p.x, p.y, "灯台の灯り");
        }
        if (monster?.trait === "burst") this.burst(enemy);
        return;
      }
      if (monster?.trait === "split" && !enemy.split && enemy.hp >= 4) {
        const spot = DIRS.filter(([dx, dy]) => this.canStep(enemy.x, enemy.y, dx, dy))
          .map(([dx, dy]) => ({x: enemy.x + dx, y: enemy.y + dy}))
          .find(v => !this.enemyAt(v.x, v.y) && !same(v, p) && !same(v, this.stairs));
        if (spot) {
          const hp = Math.floor(enemy.hp / 2), id = Math.max(...this.enemies.map(e => e.id)) + 1;
          enemy.hp -= hp;
          const limit = monster.splitLimit || 1;
          if (limit > 1) enemy.splitCount = (enemy.splitCount || 0) + 1;
          enemy.split = (enemy.splitCount || 1) >= limit;
          this.enemies.push({...spot, ...monsterStats(enemy.species), hp, exp: 1, id, awake: true, split: true, spawned: true});
          if (this.visible[this.key(enemy.x, enemy.y)]) this.say(`${enemy.name}が二つに分かれた！`, "warning");
        }
      }
      if (kind !== "melee") return;
      const feast = this.echoFor("feast"),
        might = this.echoFor("might");
      if (feast && p.hunger < 100) p.hunger = Math.min(100, p.hunger + (feast.tier ? 2 : 1));
      if (might && this.weaponShape() !== "pushMaul") this.push(enemy, 1, (might.tier ? 4 : 2) + (this.resonance("quake") ? 3 : 0));
    }
    strike(enemy, damage, kind) {
      const m = MONSTERS[enemy.species],
        visible = !!this.visible[this.key(enemy.x, enemy.y)],
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
      delete enemy.sleepUntil;
      enemy.hp -= damage;
      if (m?.trait === "blink" && enemy.hp > 0) enemy.blinkPending = true;
      this.wakeEnemy(enemy);
      if (visible) this.say(`${enemy.name}に${damage}ダメージ。`);
      if (visible) this.effect("hit", enemy.x, enemy.y, damage, undefined,
        ["melee", "arrow"].includes(kind) ? this.attackVisual(this.player, enemy, kind) : undefined);
      if (enemy.hp <= 0) {
        if (visible) this.say(`${enemy.name}を倒した。経験値 +${enemy.exp}`, "good");
        this.player.exp += enemy.exp;
        if (!enemy.spawned) this.player.gold += this.int(3, 12) * this.floor;
        if (visible) this.effect("kill", enemy.x, enemy.y, 0);
        while (this.player.exp >= this.player.nextExp) {
          this.player.exp -= this.player.nextExp;
          this.player.level++;
          this.player.nextExp = Math.floor(this.player.nextExp * 1.35) + 3;
          this.player.maxHp += 6;
          if (this.player.hp > 0) this.player.hp = Math.min(this.player.maxHp, this.player.hp + 12);
          if (visible) this.say(
            `レベル${this.player.level}になった！ 体力と攻撃力が上がった。`,
            "good",
          );
          if (visible) this.effect("level", this.player.x, this.player.y, this.player.level);
        }
      }
    }
    // Wake transitions are shared by sight, attacks, alarms and monster houses.
    wakeEnemy(enemy) {
      if (enemy.awake) return;
      const queue = [enemy];
      for (let i = 0; i < queue.length; i++) {
        const e = queue[i];
        if (e.awake) continue;
        e.awake = true;
        if (e.hp <= 0 || MONSTERS[e.species]?.trait !== "call") continue;
        const room = this.roomAt(e.x, e.y);
        if (this.visible[this.key(e.x, e.y)]) this.say(`${e.name}の呼び声で仲間が目を覚ました！`, "warning");
        for (const other of this.enemies)
          if (!other.awake && other.hp > 0 && ((room && this.roomAt(other.x, other.y) === room) || distance(e, other) <= 3)) queue.push(other);
      }
    }
    // Nested deaths append to one queue, so a chain never recurses through explosions.
    burst(enemy) {
      if (this.burstQueue) { this.burstQueue.push(enemy); return; }
      const queue = this.burstQueue = [enemy];
      try {
        for (let i = 0; i < queue.length; i++) {
          const at = queue[i], p = this.player;
          if (this.visible[this.key(at.x, at.y)]) {
            this.say(`${at.name}が爆ぜた！ 周囲に10ダメージ。`, "danger");
            this.effect("burst", at.x, at.y, 10);
          }
          if (distance(p, at) <= 1) {
            p.hp -= 10;
            this.say("爆散に巻き込まれた！ 10ダメージ。", "danger");
            this.effect("damage", p.x, p.y, 10);
          }
          for (const [dx, dy] of [[0, 0], ...DIRS]) {
            const x = at.x + dx, y = at.y + dy, surface = this.surfaceAt(x, y)?.type;
            if (surface === "oil" || surface === "grass") this.ignite(x, y);
            const target = this.enemyAt(x, y);
            if (target) this.hit(target, 10, "magic");
          }
        }
      } finally { delete this.burstQueue; }
    }
    collect() {
      const p = this.player,
        item = this.groundItem();
      if (item?.kind === "echoShard") {
        const echo = echoOfSpecies(item.species);
        // With every slot taken the shard waits on the floor until Rine chooses what to give up.
        if (!this.echoSlotFree()) {
          this.say(`${MONSTERS[item.species].name}の灯影の欠片がある。${echo.name}：${echo.text}「灯影を選ぶ」で今の灯影と入れ替えられる。`);
          return false;
        }
        this.items.splice(this.items.indexOf(item), 1);
        this.absorbEcho(item.species);
        this.say(`ランタンが${MONSTERS[item.species].name}の灯影を宿した。${echo.name}：${echo.text}`, "good");
        this.effect("pickup", p.x, p.y, item.kind, this.log[0].text);
        return true;
      }
      if (!item || (!ITEMS[item.kind] && item.kind !== "gold")) return false;
      if (item.kind === "gold") {
        p.gold += item.amount;
        this.say(`${item.amount}Gを拾った。`, "good");
      } else {
        const stacks = item.kind === "arrow" && this.arrowCount() > 0;
        if (this.inventoryCount() >= INVENTORY_CAPACITY && !stacks) {
          this.say(
            `持ち物がいっぱい。${this.itemName(item)}は足元に残った。`,
          );
          return false;
        }
        const amount =
          item.kind === "arrow" && Number.isInteger(item.amount)
            ? Math.max(1, item.amount)
            : 1;
        const value = validJar(item) ? { kind: "keepJar", contents: [...item.contents] } : isEquipment(item)
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
      return true;
    }
    pickup() {
      if (this.status !== "playing" || !this.collect()) return false;
      this.finishTurn();
      return true;
    }
    triggerTrap() {
      const p = this.player,
        t = this.traps.find((t) => t.x === p.x && t.y === p.y);
      if (t) this.springTrap(t, p);
    }
    // One rule set for every trap, whether Rine steps on it or a monster is forced onto it.
    springTrap(trap, actor) {
      const p = this.player,
        player = actor === p,
        seen = player || !!this.visible[this.key(actor.x, actor.y)],
        type = trap.type || "spike",
        name = TRAPS[type].name;
      if (seen) trap.found = true;
      const hurt = (d) => {
        if (player) {
          p.hp -= d;
          this.effect("damage", p.x, p.y, d);
        } else this.hit(actor, d, "magic");
      };
      const tell = (text, kind = "danger") => {
        if (seen) this.say(`${player ? "足元に" : `${actor.name}の足元で`}${name}！ ${text}`, kind);
      };
      if (type === "spike") {
        const d = this.int(2, 5);
        tell(`${d}ダメージ。`);
        hurt(d);
      } else if (type === "pit") {
        if (player) {
          tell("3ダメージを受け、下の階へ落ちる！");
          hurt(3);
          if (this.floor < this.maxFloor()) this.falling = true;
        } else {
          tell(`${actor.name}は穴の底へ消えた。`, "good");
          actor.hp = 0;
        }
      } else if (type === "warp") {
        tell(player ? "どこかへ飛ばされた。" : `${actor.name}がどこかへ消えた。`, player ? "danger" : "good");
        this.warpActor(actor);
        if (player) this.reveal();
      } else if (type === "rust") {
        const weapon = player && p.equipment.weapon;
        if (weapon && weapon.bonus > -3) {
          weapon.bonus--;
          weapon.identified = true;
          tell("武器が錆びて、補正値が1下がった。");
        } else tell("錆びるものはなかった。", "normal");
      } else if (type === "alarm") {
        for (const e of this.enemies) if (e.hp > 0) this.wakeEnemy(e);
        tell("鐘の音が響き、魔物たちが目を覚ました！");
      } else if (type === "fire") {
        tell("炎が噴き上がった！ 6ダメージ。");
        this.ignite(actor.x, actor.y);
        hurt(6);
      } else if (type === "oil") {
        for (const [dx, dy] of [[0, 0], ...DIRS])
          if (this.tile(actor.x + dx, actor.y + dy) && this.surfaceAt(actor.x + dx, actor.y + dy)?.type !== "fire")
            this.setSurface(actor.x + dx, actor.y + dy, "oil");
        tell("あたりに油が撒かれた。", "warning");
      }
    }
    scrollNeedsTarget(index) {
      return itemKind(this.targetItem(index)) === "identify";
    }
    useGround(target) {
      return this.use("ground", target);
    }
    sleepEnemy(enemy, turns) {
      if (enemy.hp <= 0) return;
      enemy.sleepUntil = this.turn + turns;
      enemy.awake = true;
      delete enemy.intent;
    }
    warpActor(actor) {
      const spots = [];
      for (const room of this.rooms)
        for (let y = room.y; y < room.y + room.h; y++)
          for (let x = room.x; x < room.x + room.w; x++)
            if (this.tile(x, y) && !this.enemyAt(x, y) && !same({ x, y }, this.player) && !same({ x, y }, this.stairs) && !this.traps.some((t) => same(t, { x, y })))
              spots.push({ x, y });
      if (spots.length) Object.assign(actor, spots[this.int(0, spots.length - 1)]);
    }
    jarPut(index, target) {
      const jar = this.player.bag[index], item = this.player.bag[target];
      if (this.status !== "playing" || !Number.isInteger(index) || !Number.isInteger(target) || !validJar(jar) || jar.contents.length >= 3 || !jarConsumable(item)) return false;
      jar.contents.push(item);
      this.player.bag.splice(target, 1);
      this.say(`${this.itemName(item)}を灯籠瓶に入れた。`);
      this.finishTurn();
      return true;
    }
    jarTake(index, target) {
      const jar = this.player.bag[index];
      if (this.status !== "playing" || !Number.isInteger(index) || !Number.isInteger(target) || !validJar(jar) || target < 0 || target >= jar.contents.length || this.inventoryCount() >= INVENTORY_CAPACITY) return false;
      const [item] = jar.contents.splice(target, 1);
      this.player.bag.push(item);
      this.say(`${this.itemName(item)}を灯籠瓶から取り出した。`);
      this.finishTurn();
      return true;
    }
    use(index, target) {
      const fromGround = index === "ground";
      if (this.status !== "playing" || (!fromGround && !Number.isInteger(index))) return false;
      const p = this.player,
        item = this.targetItem(index),
        kind = itemKind(item);
      if (!ITEMS[kind]) return false;
      if (kind === "keepJar" || kind === "echoShard") return false;
      if (fromGround && isEquipment(item)) return false;
      let arrowLanding;
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
        for (const item of Object.values(p.equipment)) if (this.cleanse(item)) count++;
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
        p.hp = Math.min(p.maxHp, p.hp + (this.bane("shield") === "reflect" ? 12 : 25));
        this.say(`回復草を使った。体力 +${p.hp - before}`, "good");
        this.effect("heal", p.x, p.y, p.hp - before);
      }
      if (kind === "driedFruit") {
        const hp = p.hp, hunger = p.hunger;
        p.hp = Math.min(p.maxHp, p.hp + 5);
        p.hunger = Math.min(100, p.hunger + 25);
        this.say(`干し果実を食べた。体力 +${p.hp - hp}、満腹度 +${p.hunger - hunger}%`, "good");
        this.effect("heal", p.x, p.y, p.hp - hp);
      }
      if (kind === "greatHerb") {
        const full = p.hp === p.maxHp, before = p.hp;
        if (full) p.maxHp += 3;
        p.hp = Math.min(p.maxHp, p.hp + 60);
        this.say(full ? "大回復草の力で最大体力が3増えた！" : `大回復草を使った。体力 +${p.hp - before}`, "good");
        this.effect("heal", p.x, p.y, p.hp - before);
      }
      if (kind === "gustTalisman") {
        this.say("突風の灯札から風が吹き抜けた！", "good");
        const targets = this.enemies.filter((e) => e.hp > 0 && distance(e, p) === 1);
        for (const e of targets) this.push(e, 2, 3);
      }
      if (kind === "sleepTalisman") {
        for (const e of this.enemies) if (e.hp > 0 && this.visible[this.key(e.x, e.y)]) this.sleepEnemy(e, 8);
        this.say("眠りの灯札から、まどろみの灯りが広がった。", "good");
      }
      if (kind === "sharpenTalisman" || kind === "temperTalisman") {
        const gear = p.equipment[kind === "sharpenTalisman" ? "weapon" : "shield"];
        if (gear && gear.bonus < 99) {
          gear.bonus++;
          this.say(`${this.itemName(gear)}に灯りが宿った。補正値 +1。`, "good");
        } else this.say("灯りが静かに消えた。");
      }
      if (kind === "warpTalisman") {
        this.warpActor(p);
        this.say("転移の灯札が輝き、別の場所へ移った。", "good");
      }
      if (kind === "copyTalisman") {
        const target = this.enemies.filter((e) => e.hp > 0 && e.type !== "guardian" && ECHO_SOURCES[e.species] && this.visible[this.key(e.x, e.y)])
          .sort((a, b) => distance(a, p) - distance(b, p) || a.id - b.id)[0];
        const copied = target && this.placeShard(target.species, p);
        this.say(copied ? `${target.name}の灯影を足元に写した。` : "写しの灯札の灯りが静かに消えた。", copied ? "good" : "normal");
      }
      if (kind === "scroll") {
        this.say("雷光の灯札をかざした！");
        const struck = this.enemies.filter((e) => e.hp > 0 && this.visible[this.key(e.x, e.y)]),
          water = this.conduct(struck);
        for (const e of struck) this.hit(e, 18, "magic");
        if (water.size) {
          this.say("雷が水たまりを伝った！", "danger");
          for (const e of this.enemies)
            if (e.hp > 0 && !struck.includes(e) && water.has(this.key(e.x, e.y))) this.hit(e, 18, "magic");
          if (water.has(this.key(p.x, p.y))) {
            p.hp -= 18;
            this.say("水たまりにいたリネも感電した！ 18ダメージ。", "danger");
            this.effect("damage", p.x, p.y, 18);
          }
        }
        this.effect("lightning", p.x, p.y, 0);
      }
      if (THROWN_ITEMS.includes(kind)) this.throwItem(kind);
      if (kind === "smokeBall") {
        for (let y = p.y - 2; y <= p.y + 2; y++)
          for (let x = p.x - 2; x <= p.x + 2; x++)
            if (this.tile(x, y) && this.surfaceAt(x, y)?.type !== "fire") this.setSurface(x, y, "fog", 5);
        this.say("煙玉から霧が広がった。", "good");
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
          if (!this.canStep(x, y, dx, dy)) {
            arrowLanding = { x, y };
            break;
          }
          x += dx;
          y += dy;
          const e = this.enemyAt(x, y);
          if (e) {
            this.hit(e, 12, "arrow");
            this.infusedImpact(x, y, e);
            hit = true;
            break;
          }
        }
        if (!hit) {
          this.say("木の矢を放った。敵には当たらなかった。");
          // An arrow loosed straight into a wall never leaves Rine's cell; keep the charge.
          if (x !== p.x || y !== p.y) this.infusedImpact(x, y, null);
        }
        this.effect("arrow", x, y, 0, undefined,
          !hit ? this.attackVisual(p, { x, y }, "arrow") : undefined);
      }
      if (fromGround) {
        if (kind === "arrow" && item.amount > 1) item.amount--;
        else this.items.splice(this.items.indexOf(item), 1);
      } else {
        p.bag.splice(index, 1);
        if (kind === "arrow" && !this.arrowCount()) p.ammo = null;
      }
      if (arrowLanding) {
        const { x, y } = arrowLanding;
        for (const [lx, ly] of [
          [x, y],
          ...DIRS.map(([dx, dy]) => [x + dx, y + dy]),
        ]) {
          if (
            !this.canStep(x, y, lx - x, ly - y) ||
            (lx === this.stairs.x && ly === this.stairs.y)
          ) continue;
          if (this.items.some((value) => value.x === lx && value.y === ly)) continue;
          this.items.push({ kind: "arrow", x: lx, y: ly, amount: 1 });
          this.say("木の矢が壁にぶつかり、床に落ちた。");
          break;
        }
      }
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
          for (const e of pack) this.wakeEnemy(e);
          this.say(
            "モンスターハウス！ 眠っていた魔物たちが一斉に目を覚ました！",
            "danger",
          );
        }
      }
      const famine = this.bane("weapon") === "famine",
        appetite = famine ? 2 : EQUIPMENT[equipmentKind(this.player.equipment.shield)]?.trait === "hunger" ? 8 : 4;
      if (this.turn % appetite === 0 && this.player.hunger > 0)
        this.player.hunger--;
      if (this.player.hunger === 0) {
        this.player.hp--;
        if (this.turn % 4 === 0)
          this.say(
            "お腹が空いて、体力が減っている。",
            "danger",
          );
        this.effect("damage", this.player.x, this.player.y, 1);
      } else if (this.turn % 7 === 0 && this.player.hp > 0)
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + 1);
      if (this.player.hp > 0) this.enemyTurn();
      if (this.player.hp > 0) this.tickSurfaces();
      this.enemies = this.enemies.filter((e) => e.hp > 0);
      if (this.falling) {
        delete this.falling;
        if (this.player.hp > 0 && this.floor < this.maxFloor()) {
          this.floor++;
          this.generateFloor();
          this.say(`落とし穴の先、地下${this.floor}階「${this.floorName()}」へ落ちた。`, "danger");
          this.effect("descend", this.player.x, this.player.y, this.floor);
        }
      }
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
            `${this.dungeonInfo().treasure}を手に入れた！ ${this.dungeon === "tutorial" ? "灯りの迷宮を踏破した。「深淵の迷宮」への道が開かれた。" : "30階の深淵を踏破した！"}`,
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
    enemyHit(e, ranged = false, power = e.attack, knock = null) {
      const p = this.player,
        m = MONSTERS[e.species],
        base = Math.max(1, power - this.defense() + this.int(-1, 1)),
        d =
          ranged &&
          EQUIPMENT[equipmentKind(p.equipment.shield)]?.trait === "ranged"
            ? Math.ceil(base / 2)
            : base;
      if (ranged && this.bane("shield") === "reflect") {
        this.say(`禍つの鏡盾が${e.name}の攻撃を跳ね返した！`, "good");
        this.effect("swing", e.x, e.y, 0, undefined, this.attackVisual(p, e, "ranged"));
        this.hit(e, d, "magic");
        return;
      }
      p.hp -= d;
      const loss = m?.hunger ? Math.min(p.hunger, m.hunger) : 0;
      p.hunger -= loss;
      if (!ranged && m?.trait === "corrode") {
        const shield = p.equipment.shield;
        if (shield && shield.bonus > -3) {
          shield.bonus--;
          shield.identified = true;
          if (this.visible[this.key(e.x, e.y)]) this.say("盾が錆びて、補正値が1下がった。", "danger");
        }
      }
      if (!ranged && m?.trait === "steal" && !e.stolen) {
        const eligible = p.bag.map((item, i) => typeof item === "string" && item !== "arrow" ? i : -1).filter(i => i >= 0);
        if (eligible.length) {
          const index = eligible[this.int(0, eligible.length - 1)];
          e.stolen = p.bag.splice(index, 1)[0];
          if (this.visible[this.key(e.x, e.y)]) this.say(`${e.name}が${this.itemName(e.stolen)}を盗んだ！`, "danger");
        }
      }
      if (ranged && m?.trait === "snare") p.bindUntil = Math.max(p.bindUntil || 0, this.turn + 1);
      this.say(
        `${e.name}の攻撃。${d}ダメージ。${loss ? ` 満腹度 −${loss}。` : ""}`,
        "danger",
      );
      this.effect("damage", p.x, p.y, d, undefined,
        this.attackVisual(e, p, ranged ? "ranged" : "melee"));
      if (knock && p.hp > 0) {
        const [dx, dy] = knock, x = p.x + dx, y = p.y + dy;
        if (this.canStep(p.x, p.y, dx, dy) && !this.enemyAt(x, y)) {
          Object.assign(p, {x, y});
          this.landing(p);
        }
      }
      this.blink();
    }
    enemyTurn() {
      return runEnemyTurn(this);
    }
    resolveCharge(e, aim) {
      for (let i = 0; i < aim.length + 1 && e.hp > 0; i++) {
        const x = e.x + aim.dx, y = e.y + aim.dy;
        if (!this.canStep(e.x, e.y, aim.dx, aim.dy)) {
          this.hit(e, 6, "magic");
          if (e.hp > 0) e.stunned = true;
          return;
        }
        if (same({x, y}, this.player)) {
          this.enemyHit(e, false, Math.ceil(e.attack * 1.5), [aim.dx, aim.dy]);
          return;
        }
        const other = this.enemyAt(x, y);
        if (other) {
          this.hit(e, 8, "magic");
          this.hit(other, 8, "magic");
          return;
        }
        Object.assign(e, {x, y, direction: [aim.dx, aim.dy]});
        this.landing(e);
        if (e.x !== x || e.y !== y || e.bindUntil >= this.turn) return;
      }
    }
    surfaceAt(x, y) {
      return (this.surfaces || []).find((s) => s.x === x && s.y === y) || null;
    }
    setSurface(x, y, type, remaining) {
      if (!this.tile(x, y)) return;
      this.surfaces = (this.surfaces || []).filter((s) => s.x !== x || s.y !== y);
      if (type) this.surfaces.push(remaining ? { x, y, type, remaining } : { x, y, type });
    }
    ignite(x, y) {
      const surface = this.surfaceAt(x, y);
      if (!this.tile(x, y) || surface?.type === "water") return;
      if (surface?.type === "fire") return;
      // Oil burns longest, grass briefly, bare stone only for the moment of the spark.
      this.setSurface(x, y, "fire", surface?.type === "oil" ? 3 : surface?.type === "grass" ? 2 : 1);
    }
    concealed(actor) {
      const type = this.surfaceAt(actor.x, actor.y)?.type;
      return type === "grass" || type === "fog";
    }
    fogAt(x, y) {
      return this.surfaceAt(x, y)?.type === "fog";
    }
    hazard(x, y) {
      return this.surfaceAt(x, y)?.type === "fire";
    }
    // Lightning runs through every water cell connected to a struck cell.
    conduct(sources) {
      const seen = new Set(),
        queue = sources.filter((v) => this.surfaceAt(v.x, v.y)?.type === "water");
      for (const v of queue) seen.add(this.key(v.x, v.y));
      for (let i = 0; i < queue.length; i++)
        for (const [dx, dy] of DIRS) {
          const x = queue[i].x + dx,
            y = queue[i].y + dy,
            k = this.key(x, y);
          if (!seen.has(k) && this.surfaceAt(x, y)?.type === "water") {
            seen.add(k);
            queue.push({ x, y });
          }
        }
      return seen;
    }
    throwLanding(range = 4) {
      const p = this.player,
        [dx, dy] = p.facing;
      let x = p.x,
        y = p.y;
      for (let i = 0; i < range && this.canStep(x, y, dx, dy); i++) {
        x += dx;
        y += dy;
        if (this.enemyAt(x, y)) break;
      }
      return { x, y };
    }
    throwItem(kind) {
      const p = this.player,
        land = this.throwLanding(kind === "hookRope" ? 5 : 4),
        area = [[0, 0], ...DIRS].map(([dx, dy]) => ({ x: land.x + dx, y: land.y + dy })).filter((v) => this.tile(v.x, v.y));
      this.effect("arrow", land.x, land.y, 0, undefined, this.attackVisual(p, land, "arrow"));
      if (kind === "hookRope") {
        const enemy = this.enemyAt(land.x, land.y);
        if (enemy) for (let i = 0; i < 4 && enemy.hp > 0 && distance(enemy, p) > 1; i++) {
          const next = {x: enemy.x + Math.sign(p.x - enemy.x), y: enemy.y + Math.sign(p.y - enemy.y)};
          if (!this.pull(enemy) || !same(enemy, next)) break;
        }
        this.say("鉤縄を投げた。");
      }
      if (kind === "slowDust") {
        const enemy = this.enemyAt(land.x, land.y);
        if (enemy) { enemy.slowUntil = this.turn + 10; this.wakeEnemy(enemy); }
        this.say("鈍りの粉が舞った。");
      }
      if (kind === "flashBall") {
        for (const v of area) {
          const enemy = this.enemyAt(v.x, v.y);
          if (enemy) { delete enemy.intent; enemy.stunned = true; this.wakeEnemy(enemy); }
        }
        this.say("光玉がまぶしく弾け、魔物の動きを止めた。", "good");
      }
      if (kind === "waterSkin") {
        for (const v of area) this.setSurface(v.x, v.y, "water");
        this.say("水袋が弾け、周りが水たまりになった。", "good");
      }
      if (kind === "oilFlask") {
        for (const v of area) if (this.surfaceAt(v.x, v.y)?.type !== "fire") this.setSurface(v.x, v.y, "oil");
        this.say("油瓶が割れ、油が床に広がった。", "good");
      }
      if (kind === "emberStone") {
        this.say("火種が弾けた！", "good");
        this.ignite(land.x, land.y);
        const e = this.enemyAt(land.x, land.y);
        if (e) this.hit(e, 10, "magic");
      }
      if (kind === "blastNut") {
        this.say("爆ぜ実が炸裂した！", "danger");
        for (const v of area) {
          const type = this.surfaceAt(v.x, v.y)?.type;
          if (type === "oil" || type === "grass") this.ignite(v.x, v.y);
          const e = this.enemyAt(v.x, v.y);
          if (e) this.hit(e, 15, "magic");
          if (same(v, p)) {
            p.hp -= 15;
            this.say("爆風に巻き込まれた！ 15ダメージ。", "danger");
            this.effect("damage", p.x, p.y, 15);
          }
        }
      }
    }
    tickSurfaces() {
      const p = this.player,
        fires = (this.surfaces || []).filter((s) => s.type === "fire");
      for (const fire of fires) {
        const e = this.enemyAt(fire.x, fire.y);
        if (e) this.hit(e, 4, "magic");
        if (same(fire, p) && p.hp > 0) {
          p.hp -= 4;
          this.say("炎に焼かれた！ 4ダメージ。", "danger");
          this.effect("damage", p.x, p.y, 4);
        }
      }
      // Flames spread to touching oil and grass before burning down.
      const spread = [];
      for (const fire of fires)
        for (const [dx, dy] of DIRS) {
          const type = this.surfaceAt(fire.x + dx, fire.y + dy)?.type;
          if (type === "oil" || type === "grass") spread.push({ x: fire.x + dx, y: fire.y + dy });
        }
      for (const s of this.surfaces || [])
        if (s.remaining && !spread.some((v) => same(v, s))) s.remaining--;
      this.surfaces = (this.surfaces || []).filter((s) => s.remaining == null || s.remaining > 0);
      for (const v of spread) this.ignite(v.x, v.y);
    }
    // Starting kits: offered once, at turn 0 of a fresh adventure.
    chooseStartKit(id) {
      if (!this.kitOffered || this.turn !== 0 || this.status !== "playing" || (id !== "none" && !Object.hasOwn(START_KITS, id))) return false;
      const kit = START_KITS[id],
        p = this.player;
      if (kit?.weapon) p.equipment.weapon = { kind: "weapon", variant: kit.weapon, rank: 0, bonus: 0, cursed: false, identified: true };
      if (kit?.echo) p.echo = kit.echo;
      if (kit?.items) {
        p.bag.push(...kit.items);
        if (kit.items.includes("arrow")) p.ammo = "arrow";
      }
      this.kitOffered = false;
      this.say(kit ? `${kit.name}の支度で出発した。` : "いつもの支度で出発した。", "good");
      return true;
    }
    site() {
      const p = this.player;
      if (this.status !== "playing") return null;
      if (this.shrine && !this.shrine.used && same(this.shrine, p)) return "shrine";
      if (this.merchant && same(this.merchant, p)) return "merchant";
      if (this.echoOffer()) return "echo";
      return null;
    }
    unknownCount() {
      const p = this.player,
        gear = [...p.bag, ...Object.values(p.equipment)].filter((i) => isEquipment(i) && !i.identified).length,
        scrolls = new Set(p.bag.filter((i) => SCROLLS.includes(i) && !this.identification.known.includes(i))).size;
      return gear + scrolls;
    }
    revealAll() {
      const p = this.player;
      for (const item of [...p.bag, ...Object.values(p.equipment)]) if (isEquipment(item)) item.identified = true;
      for (const kind of p.bag) if (SCROLLS.includes(kind) && !this.identification.known.includes(kind)) this.identification.known.push(kind);
    }
    boonOptions() {
      if (this.site() !== "shrine") return [];
      const p = this.player;
      return this.shrine.choices.map((choice) => {
        const boon = BOONS[choice.id],
          echo = choice.species && echoOfSpecies(choice.species);
        const available =
          (boon.needs !== "weapon" || !!p.equipment.weapon) &&
          (boon.needs !== "shield" || !!p.equipment.shield) &&
          (choice.id !== "quiver" || this.arrowCount() > 0 || this.inventoryCount() < INVENTORY_CAPACITY) &&
          (choice.id !== "insight" || this.unknownCount() > 0) &&
          (choice.id !== "wick" || this.echoSlots() < 2);
        return { ...choice, name: boon.name, text: echo ? `${echo.name}（${MONSTERS[choice.species].name}）を宿す。${echo.text}${this.echoSlotFree() ? "" : "（枠が埋まっているので、足元に欠片を置き、入れ替えるか選べます）"}` : boon.text, available };
      }).concat(this.evolution() || []);
    }
    // The weapon evolution offer, shown at every shrine while the weapon can evolve at all.
    evolution() {
      const weapon = this.player.equipment.weapon,
        path = EVOLUTIONS[equipmentKind(weapon)];
      if (!path) return null;
      const kills = weapon.kills || 0,
        echo = this.echoFor(path.echo),
        need = ECHOES[path.echo].name,
        into = EQUIPMENT[path.into];
      const missing = [kills < EVOLVE_KILLS ? `あと${EVOLVE_KILLS - kills}体倒す` : "", echo ? "" : `${need}を宿す`].filter(Boolean);
      return {
        id: "evolve",
        name: `武器の進化：${into.name}`,
        text: `${EQUIPMENT[equipmentKind(weapon)].name}が${into.name}になる。${into.description.replace(/^攻撃力 [^。]+。/, "")}${missing.length ? `（条件：${missing.join("、")}）` : ""}`,
        available: !missing.length,
      };
    }
    chooseBoon(index) {
      const option = this.boonOptions()[index];
      if (!option?.available) return false;
      const p = this.player;
      if (option.id === "vigor") {
        p.maxHp += 8;
        p.hp = Math.min(p.maxHp, p.hp + 8);
      }
      if (option.id === "whet") p.equipment.weapon.bonus++;
      if (option.id === "temper") p.equipment.shield.bonus++;
      if (option.id === "echo") {
        if (this.echoSlotFree()) this.absorbEcho(option.species);
        else if (!this.placeShard(option.species, p)) return false;
      }
      if (option.id === "wick") p.echoSlots = 2;
      if (option.id === "evolve") {
        const weapon = p.equipment.weapon;
        weapon.variant = EVOLUTIONS[equipmentKind(weapon)].into;
        weapon.identified = true;
        weapon.kills = 0;
      }
      if (option.id === "rest") {
        p.hp = p.maxHp;
        p.hunger = 100;
      }
      if (option.id === "quiver") p.bag.push(...Array(15).fill("arrow"));
      if (option.id === "insight") this.revealAll();
      this.shrine.used = true;
      if (this.shrine.choices.length === 4 && p.shrineBonus) p.shrineBonus--;
      this.say(`灯台の灯りを受け取った。${option.name}：${option.text}`, "good");
      this.effect("level", p.x, p.y, option.name);
      return true;
    }
    shopOffers() {
      if (this.site() !== "merchant") return { wares: [], services: [] };
      const p = this.player,
        scale = (base) => Math.round((base * (1 + this.floor * 0.08)) / 10) * 10,
        unknown = this.unknownCount(),
        cursed = Object.values(p.equipment).some((i) => i?.cursed);
      const wares = this.merchant.stock.map((ware, index) => {
        const fits = ware.kind === "arrow" ? this.arrowCount() > 0 || this.inventoryCount() < INVENTORY_CAPACITY
          : this.inventoryCount() < INVENTORY_CAPACITY;
        return { ...ware, index, name: this.itemName(ware.kind) + (ware.amount > 1 ? ` × ${ware.amount}` : ""), available: !ware.sold && p.gold >= ware.price && fits };
      });
      const services = [
        { id: "appraise", name: unknown ? `${SHOP_SERVICES.appraise.name}（未鑑定 ${unknown}品）` : `${SHOP_SERVICES.appraise.name}（未鑑定の品はありません）`, price: scale(SHOP_SERVICES.appraise.base) * unknown, available: unknown > 0 && p.gold >= scale(SHOP_SERVICES.appraise.base) * unknown },
        { id: "cleanse", name: cursed ? `${SHOP_SERVICES.cleanse.name}（装備中の呪い）` : `${SHOP_SERVICES.cleanse.name}（呪われた装備はありません）`, price: scale(SHOP_SERVICES.cleanse.base), available: cursed && p.gold >= scale(SHOP_SERVICES.cleanse.base) },
      ];
      return { wares, services };
    }
    buy(index) {
      const ware = this.shopOffers().wares[index];
      if (!ware?.available) return false;
      const p = this.player;
      p.gold -= ware.price;
      p.bag.push(...Array.from({ length: ware.amount }, () => ware.kind === "keepJar" ? {kind: "keepJar", contents: []} : ware.kind));
      this.merchant.stock[index].sold = true;
      this.say(`${ware.name}を${ware.price}Gで買った。`, "good");
      this.effect("pickup", p.x, p.y, ware.kind, this.log[0].text);
      return true;
    }
    service(id) {
      const offer = this.shopOffers().services.find((s) => s.id === id);
      if (!offer?.available) return false;
      const p = this.player;
      p.gold -= offer.price;
      if (id === "appraise") this.revealAll();
      if (id === "cleanse") for (const item of Object.values(p.equipment)) this.cleanse(item);
      this.say(id === "appraise" ? `${offer.price}Gで持ち物を鑑定してもらった。` : `${offer.price}Gで装備の呪いを解いてもらった。`, "good");
      return true;
    }
    blink() {
      const p = this.player,
        room = this.roomAt(p.x, p.y);
      if (!this.echoFor("blink") || p.hp <= 0 || !room || this.int(1, 4) !== 1) return;
      const spots = [];
      for (let y = room.y; y < room.y + room.h; y++)
        for (let x = room.x; x < room.x + room.w; x++)
          if (distance({ x, y }, p) >= 1 && distance({ x, y }, p) <= 3 && this.tile(x, y) && !this.enemyAt(x, y) && !same({ x, y }, this.stairs) && !this.items.some((i) => same(i, { x, y })))
            spots.push({ x, y });
      if (!spots.length) return;
      Object.assign(p, spots[this.int(0, spots.length - 1)]);
      this.say("揺らぎの灯影で、リネは部屋の中へ転移した。", "good");
      this.landing(p);
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
