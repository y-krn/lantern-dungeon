(function (root) {
  "use strict";
  const { W, H, DIRS, MONSTERS } =
    typeof module !== "undefined" && module.exports
      ? require("./data.js")
      : root.DungeonData;
  function runEnemyTurn(game) {
    const p = game.player;
    const distance = Array(W * H).fill(Infinity),
      queue = [[p.x, p.y]];
    distance[game.key(p.x, p.y)] = 0;
    for (let head = 0; head < queue.length; head++) {
      const [x, y] = queue[head],
        d = distance[game.key(x, y)];
      for (const [dx, dy] of DIRS) {
        if (!game.canStep(x, y, dx, dy)) continue;
        const nx = x + dx,
          ny = y + dy,
          k = game.key(nx, ny);
        if (distance[k] !== Infinity) continue;
        distance[k] = d + 1;
        queue.push([nx, ny]);
      }
    }
    for (const e of game.enemies) {
      if (e.hp <= 0 || (e.house && !e.awake && !game.monsterHouse?.triggered))
        continue;
      const m = MONSTERS[e.species] || {},
        dist = Math.max(Math.abs(e.x - p.x), Math.abs(e.y - p.y)),
        visible = game.visible[game.key(e.x, e.y)];
      if (dist <= 7 && visible) e.awake = true;
      if (m.trait === "mimic" && !e.revealed) {
        if (dist === 1 && game.canStep(e.x, e.y, p.x - e.x, p.y - e.y)) {
          e.revealed = true;
          e.awake = true;
          game.say(
            `金貨の山が動いた！ ${e.name}が正体を現した。次の行動で反撃してくる！`,
            "danger",
          );
          game.effect("warning", e.x, e.y, 0);
        }
        continue;
      }
      if (m.regen && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + m.regen);
      if (e.blinkPending) {
        delete e.blinkPending;
        const room = game.roomAt(e.x, e.y),
          spots = [];
        if (room)
          for (let y = room.y; y < room.y + room.h; y++)
            for (let x = room.x; x < room.x + room.w; x++) {
              const d = Math.max(Math.abs(x - e.x), Math.abs(y - e.y)),
                away = Math.max(Math.abs(x - p.x), Math.abs(y - p.y));
              if (
                d > 0 &&
                d <= 3 &&
                away >= 2 &&
                game.tile(x, y) &&
                !game.enemyAt(x, y) &&
                !(x === game.stairs.x && y === game.stairs.y) &&
                !game.items.some((i) => i.x === x && i.y === y)
              )
                spots.push({ x, y });
            }
        if (spots.length) {
          Object.assign(e, spots[game.int(0, spots.length - 1)]);
          if (visible) game.say(`${e.name}が部屋の中へ転移した。`);
          continue;
        }
      }
      if (e.intent) {
        const aim = e.intent;
        delete e.intent;
        if (
          p.x === aim.x &&
          p.y === aim.y &&
          game.clearShot(e, aim, aim.kind === "windup" ? 1 : m.range)
        ) {
          game.enemyHit(e, aim.kind === "ranged");
          if (p.hp <= 0) break;
        } else if (visible) game.say(`${e.name}の攻撃は空を切った。`);
        continue;
      }
      const adjacent =
        dist === 1 && game.canStep(e.x, e.y, p.x - e.x, p.y - e.y);
      const shooting =
        m.trait === "ranged" &&
        e.awake &&
        visible &&
        game.clearShot(e, p, m.range);
      if ((m.trait === "windup" && adjacent) || shooting) {
        e.intent = { x: p.x, y: p.y, kind: shooting ? "ranged" : "windup" };
        game.say(
          `${e.name}が${shooting ? "射撃" : "強打"}の構え！ 狙われたマスから移動しよう。`,
          "danger",
        );
        game.effect("warning", p.x, p.y, 0);
        continue;
      }
      if (adjacent) {
        game.enemyHit(e);
        if (p.hp <= 0) break;
        continue;
      }
      if (m.stationary || (m.cadence && game.turn % m.cadence !== 0)) continue;
      for (
        let stepIndex = 0;
        stepIndex < (e.awake ? m.speed || 1 : 1);
        stepIndex++
      ) {
        if (
          Math.max(Math.abs(e.x - p.x), Math.abs(e.y - p.y)) === 1 &&
          game.canStep(e.x, e.y, p.x - e.x, p.y - e.y)
        )
          break;
        const candidates = DIRS.filter(
          ([dx, dy]) =>
            game.canStep(e.x, e.y, dx, dy) &&
            !(e.x + dx === p.x && e.y + dy === p.y) &&
            !game.enemyAt(e.x + dx, e.y + dy),
        );
        const chase = e.awake
          ? candidates
              .filter(
                ([dx, dy]) =>
                  distance[game.key(e.x + dx, e.y + dy)] <
                  distance[game.key(e.x, e.y)],
              )
              .sort(
                (a, b) =>
                  distance[game.key(e.x + a[0], e.y + a[1])] -
                  distance[game.key(e.x + b[0], e.y + b[1])],
              )[0]
          : null;
        const forward = candidates.filter(
          ([dx, dy]) =>
            !e.direction || dx !== -e.direction[0] || dy !== -e.direction[1],
        );
        const wander = forward.length ? forward : candidates,
          step = chase || wander[game.int(0, Math.max(0, wander.length - 1))];
        if (step) {
          e.x += step[0];
          e.y += step[1];
          e.direction = step;
        } else break;
      }
    }
  }
  root.runEnemyTurn = runEnemyTurn;
  if (typeof module !== "undefined" && module.exports)
    module.exports = runEnemyTurn;
})(typeof window !== "undefined" ? window : globalThis);
