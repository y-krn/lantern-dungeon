(function (root) {
  "use strict";
  const {
    W,
    H,
    DIRS,
    DUNGEONS,
    LAYOUT_NAMES,
    ITEMS,
    MONSTERS,
    EQUIPMENT,
    SCROLLS,
    SCROLL_NAMES,
    EQUIPMENT_NAMES,
    EQUIPMENT_KEYS,
    validEquipment,
    isEquipment,
    monsterTier,
    monsterStats,
    ECHO_SOURCES,
    SURFACES,
    INFUSIONS,
    INFUSION_SHOTS,
    BOONS,
    TRAPS,
  } =
    typeof module !== "undefined" && module.exports
      ? require("./data.js")
      : root.DungeonData;
  function restoreIdentification(game) {
    const p = game.player,
      legacy = game.identification == null;
    if (legacy) game.initIdentification(true);
    const info = game.identification;
    if (
      !info ||
      typeof info.appearances !== "object" ||
      !info.appearances ||
      !Array.isArray(info.known) ||
      !info.names ||
      typeof info.names !== "object" ||
      Array.isArray(info.names)
    )
      return false;
    // Only built-in legacy labels change; player-written notes keep their original text.
    for (const kind of SCROLLS) {
      const appearance = info.appearances[kind];
      if (
        ["赤い巻物", "青い巻物", "黄色い巻物", "緑の巻物"].includes(appearance)
      )
        info.appearances[kind] = appearance.replace("巻物", "灯札");
    }
    const legacyNames = {
      インパスの巻物: "真名の灯札",
      シャナクの巻物: "清めの灯札",
      雷の巻物: "雷光の灯札",
      地図の巻物: "道しるべの灯札",
      赤い巻物: "赤い灯札",
      青い巻物: "青い灯札",
      黄色い巻物: "黄色い灯札",
      緑の巻物: "緑の灯札",
    };
    for (const entry of game.log)
      if (typeof entry?.text === "string") {
        for (const [oldName, newName] of Object.entries(legacyNames))
          entry.text = entry.text.replaceAll(oldName, newName);
        entry.text = entry.text.replaceAll("灯札を読んだ", "灯札をかざした");
      }
    if (
      Object.keys(info.appearances).length !== SCROLLS.length ||
      SCROLLS.some((kind) => !SCROLL_NAMES.includes(info.appearances[kind])) ||
      new Set(Object.values(info.appearances)).size !== SCROLLS.length ||
      info.known.some((kind) => !SCROLLS.includes(kind)) ||
      new Set(info.known).size !== info.known.length ||
      Object.entries(info.names).some(
        ([kind, name]) =>
          !SCROLLS.includes(kind) ||
          typeof name !== "string" ||
          name.length > 20,
      )
    )
      return false;
    if (p.equipment == null) {
      if (!legacy) return false;
      p.equipment = {};
      for (const kind of Object.keys(EQUIPMENT_NAMES)) {
        const rank = p[kind];
        if (!Number.isInteger(rank) || rank < 0) return false;
        p.equipment[kind] = {
          kind,
          rank: Math.min(3, rank),
          bonus: Math.max(0, rank - 3) * (kind === "weapon" ? 3 : 2),
          cursed: false,
          identified: true,
        };
        p[kind] = Math.min(3, rank);
      }
    }
    if (
      typeof p.equipment !== "object" ||
      Array.isArray(p.equipment) ||
      Object.keys(p.equipment).length !== 2
    )
      return false;
    for (const kind of Object.keys(EQUIPMENT_NAMES)) {
      const item = p.equipment[kind];
      if (
        (item !== null &&
          (!validEquipment(item) || item.kind !== kind || !item.identified)) ||
        !Number.isInteger(p[kind]) ||
        p[kind] < 0 ||
        p[kind] > 3 ||
        p[kind] !== (item?.rank ?? 0)
      )
        return false;
    }
    for (const item of game.items) {
      if (!item || (!Object.hasOwn(ITEMS, item.kind) && item.kind !== "gold"))
        return false;
      if (isEquipment(item)) {
        if (legacy && !Object.hasOwn(item, "rank")) {
          const variant = game.rollEquipment(item.kind);
          Object.assign(item, {
            variant,
            rank: Math.max(0, EQUIPMENT_KEYS[item.kind].indexOf(variant)),
            bonus: 0,
            cursed: false,
            identified: false,
          });
        }
        if (!validEquipment(item)) return false;
      }
    }
    return true;
  }
  function restoreDungeon(raw, DungeonEngine) {
    try {
      const saved = JSON.parse(raw),
        s = saved.state;
      // Migrate the earlier variant-only equipment schema without losing power.
      if (
        s?.player?.equipment == null &&
        s?.identification == null &&
        typeof s?.player?.weapon === "object"
      ) {
        const convert = (item, identified) => {
          const data = EQUIPMENT[item?.kind];
          if (!data || !Number.isInteger(item.bonus) || item.bonus < 0)
            throw new TypeError("Invalid legacy equipment");
          return {
            kind: data.slot,
            variant: item.kind,
            rank: Math.max(0, EQUIPMENT_KEYS[data.slot].indexOf(item.kind)),
            bonus: item.bonus,
            cursed: false,
            identified,
          };
        };
        const p = s.player,
          weapon = convert(p.weapon, true),
          shield = convert(p.shield, true);
        if (weapon.kind !== "weapon" || shield.kind !== "shield") return null;
        p.equipment = { weapon, shield };
        p.weapon = weapon.rank;
        p.shield = shield.rank;
        p.bag = p.bag.map((item) =>
          typeof item === "object" ? convert(item, true) : item,
        );
        s.items = s.items.map((item) =>
          EQUIPMENT[item.kind]
            ? {
                ...item,
                ...convert({ ...item, bonus: item.bonus ?? 0 }, false),
              }
            : item,
        );
      }
      const dungeon = s?.dungeon ?? "tutorial";
      if (
        !Object.hasOwn(DUNGEONS, dungeon) ||
        (s?.tutorialCleared != null &&
          typeof s.tutorialCleared !== "boolean") ||
        (dungeon === "depths" && s.tutorialCleared !== true)
      )
        return null;
      if (
        saved.version !== 1 ||
        !s ||
        !Array.isArray(s.tiles) ||
        s.tiles.length !== W * H ||
        !Array.isArray(s.seen) ||
        s.seen.length !== W * H ||
        !Array.isArray(s.rooms) ||
        s.rooms.length < 4 ||
        s.rooms.length > 8 ||
        !Array.isArray(s.enemies) ||
        !Array.isArray(s.items) ||
        !Array.isArray(s.traps) ||
        !Array.isArray(s.log) ||
        !s.stairs ||
        !s.player ||
        !Array.isArray(s.player.bag) ||
        s.player.bag.some((item) =>
          typeof item === "string"
            ? !Object.hasOwn(ITEMS, item) ||
              Object.hasOwn(EQUIPMENT_NAMES, item)
            : !validEquipment(item),
        ) ||
        (s.player.ammo != null && s.player.ammo !== "arrow") ||
        !Number.isInteger(s.floor) ||
        s.floor < 1 ||
        s.floor > DUNGEONS[dungeon].floors ||
        !Number.isFinite(s.turn) ||
        !Number.isFinite(s.player.hp) ||
        !Number.isFinite(s.player.hunger) ||
        s.player.hunger < 0 ||
        s.player.hunger > 100 ||
        !["playing", "dead", "won"].includes(s.status)
      )
        return null;
      if (s.layout != null && !Object.hasOwn(LAYOUT_NAMES, s.layout))
        return null;
      if (
        s.monsterHouse != null &&
        (!Number.isInteger(s.monsterHouse.room) ||
          s.monsterHouse.room < 0 ||
          s.monsterHouse.room >= s.rooms.length ||
          typeof s.monsterHouse.triggered !== "boolean")
      )
        return null;
      const game = Object.assign(Object.create(DungeonEngine.prototype), s);
      game.dungeon = dungeon;
      game.tutorialCleared =
        s.tutorialCleared === true ||
        (dungeon === "tutorial" && s.status === "won" && s.floor === 10);
      game.layout ??= null;
      game.monsterHouse ??= null;
      if (!game.tile(s.player.x, s.player.y)) return null;
      // Lantern echo state; saves from before echoes simply have none.
      const p = s.player,
        counter = (value, max) => value == null || (Number.isInteger(value) && value >= 0 && value <= max);
      if (
        (p.echo != null && !Object.hasOwn(ECHO_SOURCES, p.echo)) ||
        (p.echoSlots != null && p.echoSlots !== 1 && p.echoSlots !== 2) ||
        (p.echo2 != null && (!Object.hasOwn(ECHO_SOURCES, p.echo2) || p.echoSlots !== 2 || p.echo == null)) ||
        !counter(p.echoSteps, 4) ||
        !counter(p.echoPity, 9) ||
        !counter(p.shrineBonus, 2) ||
        (p.lastStrike != null && (!Number.isInteger(p.lastStrike) || p.lastStrike > s.turn)) ||
        s.items.some((i) => i?.kind === "echoShard" && !Object.hasOwn(ECHO_SOURCES, i.species))
      )
        return null;
      const infusion = s.player.infusion;
      if (
        infusion != null &&
        (!Object.values(INFUSIONS).some((v) => v.id === infusion.kind) ||
          !Number.isInteger(infusion.shots) ||
          infusion.shots < 1 ||
          infusion.shots > INFUSION_SHOTS)
      )
        return null;
      // Shrines, stalls and the starting-kit offer; older saves have none.
      game.shrine ??= null;
      game.merchant ??= null;
      const spot = (v) => v && Number.isInteger(v.x) && Number.isInteger(v.y) && game.tile(v.x, v.y);
      if (
        (s.kitOffered != null && typeof s.kitOffered !== "boolean") ||
        (game.shrine !== null &&
          (!spot(game.shrine) ||
            typeof game.shrine.used !== "boolean" ||
            !Array.isArray(game.shrine.choices) ||
            ![3, 4].includes(game.shrine.choices.length) ||
            (!game.shrine.used && game.shrine.choices.length === 4 && !p.shrineBonus) ||
            game.shrine.choices.some((c) => !c || !Object.hasOwn(BOONS, c.id) || (c.id === "echo") !== Object.hasOwn(ECHO_SOURCES, c.species ?? "")))) ||
        (game.merchant !== null &&
          (!spot(game.merchant) ||
            !Array.isArray(game.merchant.stock) ||
            game.merchant.stock.some(
              (w) => !w || !Object.hasOwn(ITEMS, w.kind) || !Number.isInteger(w.price) || w.price < 0 || !Number.isInteger(w.amount) || w.amount < 1 || typeof w.sold !== "boolean",
            )))
      )
        return null;
      // Older saves only had spike traps, stored without a type.
      if (game.traps.some((t) => t.type != null && !Object.hasOwn(TRAPS, t.type))) return null;
      // Terrain; saves from before terrain have none.
      game.surfaces ??= [];
      const timed = { fire: 3, fog: 5 };
      if (
        !Array.isArray(game.surfaces) ||
        game.surfaces.some(
          (v) =>
            !v ||
            !Object.hasOwn(SURFACES, v.type) ||
            !Number.isInteger(v.x) ||
            !Number.isInteger(v.y) ||
            (timed[v.type]
              ? !Number.isInteger(v.remaining) || v.remaining < 1 || v.remaining > timed[v.type]
              : v.remaining != null),
        ) ||
        new Set(game.surfaces.map((v) => game.key(v.x, v.y))).size !== game.surfaces.length
      )
        return null;
      game.player.ammo = game.arrowCount() ? (game.player.ammo ?? null) : null;
      game.traps = game.traps.filter((t) => !game.isRoomEntrance(t.x, t.y));
      for (const e of game.enemies) {
        if ((e.elite != null && typeof e.elite !== "boolean") || (e.elite && (e.house || e.spawned || e.species == null))) return null;
        if (e.species == null) {
          if (!Number.isFinite(e.hp) || !Number.isFinite(e.maxHp)) return null;
          const tier = monsterTier(game.floor, dungeon);
          e.species =
            e.type === "guardian"
              ? dungeon === "depths"
                ? "abyssGuardian"
                : "starGuardian"
              : e.type === "slime"
                ? tier === 0
                  ? "mossSlime"
                  : "amberSlime"
                : Object.keys(MONSTERS).find(
                    (key) =>
                      MONSTERS[key].type === e.type &&
                      MONSTERS[key].tier ===
                        Math.max(e.type === "ghost" ? 2 : 1, tier),
                  );
          if (!e.species) return null;
          const damage = Math.max(0, e.maxHp - e.hp),
            alive = e.hp > 0;
          Object.assign(e, monsterStats(e.species));
          e.hp = alive ? Math.max(1, e.maxHp - damage) : e.hp;
        } else {
          if (!Object.hasOwn(MONSTERS, e.species)) return null;
          const stats = monsterStats(e.species, e.elite);
          if (e.type !== stats.type || e.name !== stats.name || e.maxHp !== stats.maxHp || e.attack !== stats.attack ||
            e.exp !== (e.spawned ? 1 : stats.exp) || !Number.isFinite(e.hp) || e.hp > e.maxHp) return null;
        }
        const miniboss = MONSTERS[e.species].miniboss;
        if (miniboss && (dungeon !== "depths" || game.floor !== miniboss || e.house)) return null;
        if (e.splitCount != null && (e.species !== "bubbleMother" || e.spawned || !Number.isInteger(e.splitCount) || e.splitCount < 1 || e.splitCount > 3 ||
          !!e.split !== (e.splitCount === 3))) return null;
        if (e.species === "bubbleMother" && !e.spawned && e.split && e.splitCount !== 3) return null;
        if (
          e.intent != null &&
          ((e.intent.kind === "ranged"
            ? !["ranged", "snare", "kite"].includes(MONSTERS[e.species].trait)
            : e.intent.kind === "windup"
              ? MONSTERS[e.species].trait !== "windup"
              : e.intent.kind === "charge"
                ? MONSTERS[e.species].trait !== "charge"
              : true) ||
            !Number.isInteger(e.intent.x) ||
            !Number.isInteger(e.intent.y) ||
            !game.inside(e.intent.x, e.intent.y) ||
            !game.tile(e.intent.x, e.intent.y))
        )
          return null;
        if (e.intent?.kind === "charge") {
          const a = e.intent;
          if (!DIRS.some(([dx, dy]) => dx === a.dx && dy === a.dy) || !Number.isInteger(a.length) || a.length < 1 || a.length > 4) return null;
        }
        if (
          (e.revealed != null && typeof e.revealed !== "boolean") ||
          (e.blinkPending != null && typeof e.blinkPending !== "boolean") ||
          ["split", "spawned", "stunned"].some(key => e[key] != null && typeof e[key] !== "boolean") ||
          ((e.split || e.spawned) && !["bubbleSlime", "bubbleMother"].includes(e.species)) ||
          (e.spawned && !e.split) ||
          (e.stunned && MONSTERS[e.species].trait !== "charge") ||
          (e.stolen != null && (MONSTERS[e.species].trait !== "steal" || typeof e.stolen !== "string" || e.stolen === "arrow" ||
            !Object.hasOwn(ITEMS, e.stolen) || Object.hasOwn(EQUIPMENT_NAMES, e.stolen)))
        )
          return null;
      }
      if (game.enemies.filter(e => MONSTERS[e.species].miniboss && !e.spawned).length > 1) return null;
      for (const actor of [p, ...game.enemies])
        for (const key of ["bindUntil", "resistUntil"])
          if (actor[key] != null && (!Number.isInteger(actor[key]) || actor[key] < 0 || actor[key] > game.turn + 2)) return null;
      if (!game.restoreIdentification()) return null;
      game.effects = [];
      game.reveal();
      return game;
    } catch {
      return null;
    }
  }
  const save = { restoreDungeon, restoreIdentification };
  root.DungeonSave = save;
  if (typeof module !== "undefined" && module.exports) module.exports = save;
})(typeof window !== "undefined" ? window : globalThis);
