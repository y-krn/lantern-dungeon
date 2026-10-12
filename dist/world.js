(function (root) {
  "use strict";
  const {
    W,
    H,
    LAYOUT_NAMES,
    MONSTER_POOLS,
    MONSTERS,
    monsterTier,
    monsterStats,
    EQUIPMENT_NAMES,
    EQUIPMENT_KEYS,
    SCROLLS,
  } =
    typeof module !== "undefined" && module.exports
      ? require("./data.js")
      : root.DungeonData;
  function generateDungeonFloor(game) {
    game.tiles = Array(W * H).fill(0);
    game.seen = Array(W * H).fill(false);
    game.visible = Array(W * H).fill(false);
    game.rooms = [];
    game.enemies = [];
    game.items = [];
    game.traps = [];
    game.monsterHouse = null;
    const cells = Array.from({ length: 9 }, (_, i) => i);
    for (let i = cells.length - 1; i > 0; i--) {
      const j = game.int(0, i);
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    const weights =
      game.floor <= 3 ? [6, 3, 1] : game.floor <= 6 ? [4, 4, 2] : [2, 4, 4];
    const layouts = Object.keys(LAYOUT_NAMES).flatMap((name, i) =>
      name === game.layout ? [] : Array(weights[i]).fill(name),
    );
    game.layout = layouts[game.int(0, layouts.length - 1)];
    const roomCount = game.int(game.layout === "branch" ? 6 : 4, 8),
      perimeter = cells.filter((c) => c !== 4);
    const selected =
      game.layout === "hall"
        ? [4, ...perimeter.slice(0, roomCount - 1)]
        : game.layout === "ring"
          ? perimeter.slice(0, roomCount)
          : cells.slice(0, roomCount);
    for (const cell of selected.sort((a, b) => a - b)) {
      const col = cell % 3,
        row = Math.floor(cell / 3);
      let w = game.int(5, game.layout === "branch" ? 8 : 10),
        h = game.int(4, game.layout === "branch" ? 6 : 7),
        x = 1 + col * 14 + game.int(1, 13 - w),
        y = 1 + row * 9 + game.int(1, 8 - h);
      if (game.layout === "hall") {
        if (cell === 4) {
          w = game.int(16, 19);
          h = game.int(10, 11);
          x = game.int(12, 14);
          y = game.int(9, 10);
        } else if (row === 1) {
          w = game.int(5, 7);
          h = game.int(4, 6);
          x = col === 0 ? 2 : 35;
          y = game.int(12, 15);
        } else {
          h = game.int(4, 6);
          y = (row === 0 ? 2 : 22) + game.int(0, 6 - h);
        }
      }
      const room = {
        x,
        y,
        w,
        h,
        cx: x + Math.floor(w / 2),
        cy: y + Math.floor(h / 2),
      };
      game.rooms.push(room);
      for (let yy = y; yy < y + h; yy++)
        for (let xx = x; xx < x + w; xx++) game.tiles[game.key(xx, yy)] = 1;
    }
    const join = (a, b) => {
      let x = a.cx,
        y = a.cy;
      const horizontalFirst = game.random() < 0.5;
      const horizontal = () => {
        while (x !== b.cx) {
          game.tiles[game.key(x, y)] = 1;
          x += Math.sign(b.cx - x);
        }
      };
      const vertical = () => {
        while (y !== b.cy) {
          game.tiles[game.key(x, y)] = 1;
          y += Math.sign(b.cy - y);
        }
      };
      if (horizontalFirst) {
        horizontal();
        vertical();
      } else {
        vertical();
        horizontal();
      }
      game.tiles[game.key(x, y)] = 1;
    };
    // Each layout changes the actual floor geometry, not just its label.
    if (game.layout === "ring") {
      const left = Math.min(...game.rooms.map((r) => r.cx)),
        right = Math.max(...game.rooms.map((r) => r.cx)),
        top = Math.min(...game.rooms.map((r) => r.cy)),
        bottom = Math.max(...game.rooms.map((r) => r.cy));
      const corners = [
        { cx: left, cy: top },
        { cx: right, cy: top },
        { cx: right, cy: bottom },
        { cx: left, cy: bottom },
      ];
      for (let i = 0; i < 4; i++) join(corners[i], corners[(i + 1) % 4]);
      for (const r of game.rooms) {
        const row = Math.floor(r.y / 9),
          col = Math.floor(r.x / 14);
        join(r, {
          cx: row === 1 ? (col === 0 ? left : right) : r.cx,
          cy: row === 0 ? top : row === 2 ? bottom : r.cy,
        });
      }
    } else if (game.layout === "hall") {
      const hall = game.rooms.find((r) => r.w >= 16);
      for (const r of game.rooms) if (r !== hall) join(hall, r);
    } else {
      const links = [];
      for (let a = 0; a < roomCount; a++)
        for (let b = a + 1; b < roomCount; b++) {
          const distance =
            Math.abs(game.rooms[a].cx - game.rooms[b].cx) +
            Math.abs(game.rooms[a].cy - game.rooms[b].cy);
          links.push({ a, b, weight: distance + game.int(0, 10) });
        }
      links.sort((a, b) => a.weight - b.weight);
      const connected = new Set([game.int(0, roomCount - 1)]);
      while (connected.size < roomCount) {
        const link = links.find(
          (l) => connected.has(l.a) !== connected.has(l.b),
        );
        join(game.rooms[link.a], game.rooms[link.b]);
        connected.add(link.a);
        connected.add(link.b);
      }
    }
    const startRoom = game.rooms[game.int(0, roomCount - 1)],
      otherRooms = game.rooms.filter((r) => r !== startRoom);
    game.player.x = game.int(startRoom.x + 1, startRoom.x + startRoom.w - 2);
    game.player.y = game.int(startRoom.y + 1, startRoom.y + startRoom.h - 2);
    game.player.facing = [0, 1];
    const exitRoom = otherRooms[game.int(0, otherRooms.length - 1)];
    game.stairs = {
      x: game.int(exitRoom.x, exitRoom.x + exitRoom.w - 1),
      y: game.int(exitRoom.y, exitRoom.y + exitRoom.h - 1),
    };
    const used = new Set([
      game.key(game.player.x, game.player.y),
      game.key(game.stairs.x, game.stairs.y),
    ]);
    const emptySpot = (rooms = game.rooms, avoidEntrances = false) => {
      for (let i = 0; i < 500; i++) {
        const r = rooms[game.int(0, rooms.length - 1)],
          x = game.int(r.x, r.x + r.w - 1),
          y = game.int(r.y, r.y + r.h - 1),
          k = game.key(x, y);
        if (!used.has(k) && (!avoidEntrances || !game.isRoomEntrance(x, y))) {
          used.add(k);
          return { x, y };
        }
      }
      return null;
    };
    const hard = game.dungeon === "depths";
    const guardianSpot =
      game.floor === game.maxFloor() ? emptySpot([exitRoom]) : null;
    const deadEnds = otherRooms.filter(
      (r) => r !== exitRoom && game.roomDoorCount(r) === 1,
    );
    const houseRoom =
      game.floor >= 4 &&
      game.floor < game.maxFloor() &&
      deadEnds.length &&
      game.random() < (hard ? 0.2 : 0.15)
        ? deadEnds[game.int(0, deadEnds.length - 1)]
        : null;
    if (houseRoom)
      game.monsterHouse = {
        room: game.rooms.indexOf(houseRoom),
        triggered: false,
      };
    const houseSpots = houseRoom
      ? Array.from({ length: 5 }, () => emptySpot([houseRoom]))
      : [];
    const rewardRooms = deadEnds.filter((r) => r !== houseRoom),
      ordinaryRooms = otherRooms.filter((r) => r !== houseRoom);
    const addItem = (kind, rooms = game.rooms, bias = true) => {
      const preferred = bias
          ? rewardRooms.filter((r) => rooms.includes(r))
          : [],
        pool = preferred.length && game.random() < 0.65 ? preferred : rooms;
      const pos = emptySpot(pool);
      if (pos) {
        const variant = Object.hasOwn(EQUIPMENT_NAMES, kind)
          ? game.rollEquipment(kind)
          : null;
        const equipment = variant
          ? {
              variant,
              rank: Math.max(0, EQUIPMENT_KEYS[kind].indexOf(variant)),
              bonus: game.int(-1, 3),
              cursed: game.random() < 1 / 8,
              identified: false,
            }
          : {};
        game.items.push({
          ...pos,
          kind,
          ...equipment,
          amount:
            kind === "gold"
              ? game.int(20, 65) * game.floor
              : kind === "arrow"
                ? game.int(1, 10)
                : 1,
        });
      }
    };
    // Each floor guarantees food and healing as well as randomly placed supplies.
    [
      ...Array(hard ? 2 : 3).fill("bread"),
      "potion",
      "potion",
      "gold",
      "gold",
      "gold",
      "arrow",
      game.random() < 0.5 ? "map" : "scroll",
    ].forEach((kind) => addItem(kind));
    addItem(SCROLLS[game.int(0, SCROLLS.length - 1)]);
    if (game.random() < 0.4) addItem("weapon", otherRooms);
    if (game.random() < 0.4) addItem("shield", otherRooms);
    if (houseRoom) {
      addItem("gold", [houseRoom], false);
      addItem("gold", [houseRoom], false);
      addItem("scroll", [houseRoom], false);
    }
    const count = 4 + Math.floor(game.floor * 0.75) + (hard ? 2 : 0);
    for (let i = 0; i < count; i++) {
      const pos =
        i < houseSpots.length ? houseSpots[i] : emptySpot(ordinaryRooms);
      if (!pos) continue;
      const tier = monsterTier(game.floor, game.dungeon),
        pool = MONSTER_POOLS[tier];
      const species = tier === 0 ? pool[0] : pool[game.int(0, pool.length - 1)];
      game.enemies.push({
        ...pos,
        id: i,
        ...monsterStats(species),
        hp: MONSTERS[species].hp,
        awake: false,
        house: i < houseSpots.length,
      });
    }
    for (
      let i = 0;
      i < Math.min(game.floor + (hard ? 2 : 0), hard ? 8 : 5);
      i++
    ) {
      const pos = emptySpot(ordinaryRooms, true);
      if (pos) game.traps.push({ ...pos, found: false });
    }
    if (guardianSpot) {
      const species = hard ? "abyssGuardian" : "starGuardian";
      game.enemies.push({
        ...guardianSpot,
        id: 99,
        ...monsterStats(species),
        hp: MONSTERS[species].hp,
        awake: true,
      });
    }
    game.reveal();
  }
  root.generateDungeonFloor = generateDungeonFloor;
  if (typeof module !== "undefined" && module.exports)
    module.exports = generateDungeonFloor;
})(typeof window !== "undefined" ? window : globalThis);
