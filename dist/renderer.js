(function (root) {
  "use strict";
  const { W, H, MONSTERS, equipmentKind } =
    typeof module !== "undefined" && module.exports
      ? require("./data.js")
      : root.DungeonData;
  const createSpriteRenderer =
    typeof module !== "undefined" && module.exports
      ? require("./sprites.js")
      : root.createSpriteRenderer;
  function createDungeonRenderer({
    canvas,
    minimap,
    viewport,
    getEngine,
    getTarget = () => null,
    reduced = false,
  }) {
    const ctx = canvas.getContext("2d"),
      mini = minimap.getContext("2d");
    let tile = 40,
      camera = { x: 0, y: 0 },
      particles = [],
      labels = [],
      frame = 0,
      playerTween = null,
      playerSettle = null,
      walkDistance = 0,
      enemyMotion = new Map(),
      attacks = [],
      pendingEffects = [],
      busyUntil = 0;
    let closeView = true;
    const { ready, itemsReady, walkReady, sideWalkReady, walkFrameCount, walkCycleDistance, paintedSprite, sprite, heroSprite, hasAtlas } =
      createSpriteRenderer();
    function hash(x, y, s = 0) {
      const engine = getEngine();
      let h =
        Math.imul(x + 101 + s, 374761393) +
        Math.imul(y + 97, 668265263) +
        Math.imul(engine.floor, 1274126177);
      h = (h ^ (h >>> 13)) >>> 0;
      return (h % 10000) / 10000;
    }
    function floorTile(x, y, px, py, visible) {
      const engine = getEngine();
      const r = hash(x, y),
        unit = tile / 16;
      const colors =
        engine.floor >= 7
          ? ["#656c76", "#697080", "#5f6b72", "#707581"]
          : ["#9ca58a", "#a5aa91", "#99a086", "#aab098"];
      ctx.fillStyle = colors[Math.floor(r * 4)];
      ctx.fillRect(px, py, tile, tile);
      ctx.fillStyle = engine.floor >= 7 ? "#4e5863" : "#7b856b";
      ctx.fillRect(px, py, tile, unit);
      ctx.fillRect(px, py, unit, tile);
      ctx.fillStyle = "#98aa7b13";
      ctx.fillRect(px + unit, py + unit, tile - unit * 2, unit);
      ctx.fillRect(px + unit, py + unit, unit, tile - unit * 2);
      const n = hash(x, y, 5);
      if (n < 0.18) {
        ctx.fillStyle = "#657856";
        ctx.fillRect(px + unit * 4, py + unit * 9, unit * 5, unit);
        ctx.fillRect(px + unit * 9, py + unit * 10, unit * 3, unit);
      } else if (n < 0.43) {
        ctx.fillStyle = "#70805065";
        ctx.fillRect(px + unit * 3, py + unit * 12, unit * 2, unit);
        ctx.fillRect(px + unit * 11, py + unit * 4, unit, unit * 2);
      }
      if (n > 0.93) {
        ctx.fillStyle = "#b0c4876b";
        ctx.fillRect(px + unit * 10, py + unit * 11, unit, unit);
        ctx.fillStyle = "#728357";
        ctx.fillRect(px + unit * 9, py + unit * 12, unit * 2, unit);
      }
      if (!visible) {
        ctx.fillStyle = "#0b111acc";
        ctx.fillRect(px, py, tile, tile);
      }
    }
    function wallTile(x, y, px, py, visible) {
      const engine = getEngine();
      const s = tile / 16;
      const below = engine.tile(x, y + 1);
      ctx.fillStyle = engine.floor >= 7 ? "#515e65" : "#728265";
      ctx.fillRect(px, py, tile, tile);
      ctx.fillStyle = engine.floor >= 7 ? "#8a8e90" : "#b6b89e";
      ctx.fillRect(px + s, py + s, tile - s * 2, s * 5);
      ctx.fillStyle = "#131f2299";
      ctx.fillRect(px, py + s * 7, tile, s);
      ctx.fillRect(px + s * 8, py, s, s * 7);
      ctx.fillRect(px + s * 4, py + s * 8, s, s * 7);
      ctx.fillStyle = engine.floor >= 7 ? "#65747a" : "#8e9c7a";
      ctx.fillRect(px + s, py + s * 9, s * 3, s * 5);
      ctx.fillRect(px + s * 5, py + s * 9, s * 10, s * 5);
      ctx.fillStyle = "#98a78125";
      ctx.fillRect(px + s, py + s, tile - s * 2, s);
      if (below) {
        ctx.fillStyle = "#182321";
        ctx.fillRect(px, py + tile - s * 2, tile, s * 2);
        ctx.fillStyle = "#25332a";
        ctx.fillRect(px + s, py + tile - s * 4, tile - s * 2, s * 2);
      }
      if (hash(x, y, 3) < 0.3) {
        ctx.fillStyle = "#5e7844";
        ctx.fillRect(px + s * 2, py + s * 6, s * 5, s);
        ctx.fillRect(px + s * 3, py + s * 7, s, s * 3);
        ctx.fillStyle = "#91a766";
        ctx.fillRect(px + s * 2, py + s * 6, s * 2, s);
      }
      if (
        visible &&
        below &&
        (hash(x, y, 12) < 0.08 ||
          engine.rooms.some((r) => y === r.y - 1 && x === r.x + 2))
      )
        torch(px + tile / 2, py + tile * 0.45);
      if (!visible) {
        ctx.fillStyle = "#0b111ace";
        ctx.fillRect(px, py, tile, tile);
      }
    }
    function torch(x, y) {
      const s = tile / 16,
        t = reduced ? 0 : Math.sin(frame * 0.08 + x) * s;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, tile * 2.8);
      glow.addColorStop(0, "#eeb35e35");
      glow.addColorStop(1, "#eeb35e00");
      ctx.fillStyle = glow;
      ctx.fillRect(x - tile * 3, y - tile * 3, tile * 6, tile * 6);
      if (paintedSprite(ctx, 'lantern', x - tile / 4, y - tile / 4, s / 2, 1, false, null)) return;
      ctx.fillStyle = "#4c332e";
      ctx.fillRect(x - s, y, s * 2, s * 6);
      ctx.fillStyle = "#a88352";
      ctx.fillRect(x - s * 2, y + s * 3, s * 4, s);
      ctx.fillStyle = "#de8b49";
      ctx.fillRect(x - s * 2, y - s * 2 - t, s * 4, s * 5 + t);
      ctx.fillStyle = "#ffd792";
      ctx.fillRect(x - s, y - s * 3 - t, s * 2, s * 4 + t);
      ctx.fillStyle = "#fff1c0";
      ctx.fillRect(x, y - s, s, s * 2);
    }
    function drawStairs(px, py) {
      const s = tile / 16;
      ctx.fillStyle = "#243731";
      ctx.fillRect(px + s * 2, py + s * 2, s * 12, s * 12);
      ctx.fillStyle = "#879b84";
      ctx.fillRect(px + s * 2, py + s * 2, s * 12, s * 2);
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = ["#768a76", "#607563", "#4a6358", "#34514c"][i];
        ctx.fillRect(
          px + s * (3 + i),
          py + s * (5 + i * 2),
          s * (10 - i * 2),
          s,
        );
        ctx.fillStyle = "#152c2b";
        ctx.fillRect(
          px + s * (3 + i),
          py + s * (6 + i * 2),
          s * (10 - i * 2),
          s,
        );
      }
      ctx.fillStyle = "#a6d5bf";
      ctx.fillRect(px + s * 12, py + s * 3, s, s);
    }
    function drawLantern(px, py) {
      const s = tile / 16;
      const glow = ctx.createRadialGradient(
        px + tile / 2,
        py + tile / 2,
        0,
        px + tile / 2,
        py + tile / 2,
        tile * 3,
      );
      glow.addColorStop(0, "#fadf9440");
      glow.addColorStop(1, "#fadf9400");
      ctx.fillStyle = glow;
      ctx.fillRect(px - tile * 3, py - tile * 3, tile * 7, tile * 7);
      if (paintedSprite(ctx, 'lantern', px, py, s, 1, false, null)) return;
      ctx.fillStyle = "#e1ae60";
      ctx.fillRect(px + s * 5, py + s * 4, s * 6, s * 9);
      ctx.fillRect(px + s * 6, py + s * 2, s * 4, s * 2);
      ctx.fillStyle = "#fff0ac";
      ctx.fillRect(px + s * 6, py + s * 6, s * 4, s * 5);
      ctx.fillStyle = "#4c3432";
      ctx.fillRect(px + s * 6, py + s * 3, s * 4, s);
      ctx.fillStyle = "#b2c0a1";
      ctx.fillRect(px + s * 4, py + s * 14, s * 8, s);
    }
    function drawItem(item, px, py, now) {
      {
        const kind = equipmentKind(item) || item.kind;
        // Shaped weapons and echo shards have no painted art yet; trial items only exist in the trial.
        const symbols = {lampSpear: "槍", sweepAxe: "斧", hookSickle: "鎌", pushMaul: "槌", echoShard: "✦",
          ...(getEngine().strategyTrial ? {lightSeed: "♧", vineSeed: "❧", bait: "●", pullTalisman: "↙", swapTalisman: "↔", returnTalisman: "⌂"} : {})};
        if (symbols[kind]) {
          ctx.save(); ctx.fillStyle = kind === "echoShard" ? "#c9b6ff" : "#fff2cc"; ctx.strokeStyle = "#3c4935"; ctx.lineWidth = tile * .06;
          ctx.font = `bold ${tile * .55}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.strokeText(symbols[kind], px + tile / 2, py + tile / 2);
          ctx.fillText(symbols[kind], px + tile / 2, py + tile / 2); ctx.restore(); return;
        }
      }
      const bob = reduced ? 0 : Math.sin(now / 700 + item.x) * tile * 0.035;
      const s = tile / 16;
      ctx.fillStyle = "#09181566";
      ctx.beginPath();
      ctx.ellipse(
        px + tile / 2,
        py + tile * 0.83,
        tile * 0.25,
        tile * 0.09,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      // All lantern talismans share one appearance; neither knowledge nor curses leak into art.
      const type = ['scroll', 'map', 'identify', 'uncurse'].includes(item.kind) ? 'scroll'
        : ['weapon', 'shield'].includes(item.kind) ? equipmentKind(item) || (item.kind === 'weapon' ? 'ironSword' : 'travelerShield')
        : item.kind;
      if (paintedSprite(ctx, type, px + tile * .125, py + tile * .125 + bob, s * .75, 1, false, null)) return;
      if (item.kind === "gold") {
        ctx.fillStyle = "#7c5d32";
        ctx.fillRect(px + s * 5, py + s * 7 + bob, s * 7, s * 5);
        ctx.fillStyle = "#d3a65d";
        ctx.fillRect(px + s * 5, py + s * 6 + bob, s * 7, s * 4);
        ctx.fillStyle = "#f9d995";
        ctx.fillRect(px + s * 6, py + s * 6 + bob, s * 4, s);
        ctx.fillRect(px + s * 6, py + s * 7 + bob, s, s * 2);
      } else if (item.kind === "weapon") {
        ctx.save();
        ctx.translate(px + tile / 2, py + tile / 2);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = "#d1d6bc";
        ctx.fillRect(-s, -s * 6, s * 2, s * 9);
        ctx.fillStyle = "#e8c37e";
        ctx.fillRect(-s * 3, s * 2, s * 6, s);
        ctx.fillStyle = "#977346";
        ctx.fillRect(-s, s * 3, s * 2, s * 4);
        ctx.restore();
      } else if (item.kind === "shield") {
        ctx.fillStyle = "#987b54";
        ctx.fillRect(px + s * 4, py + s * 4, s * 8, s * 7);
        ctx.fillRect(px + s * 5, py + s * 11, s * 6, s);
        ctx.fillRect(px + s * 6, py + s * 12, s * 4, s);
        ctx.fillStyle = "#bcb79c";
        ctx.fillRect(px + s * 5, py + s * 5, s * 6, s * 5);
        ctx.fillStyle = "#6a6657";
        ctx.fillRect(px + s * 7, py + s * 6, s * 2, s * 4);
      } else
        sprite(
          ctx,
          item.kind === "map" ? "scroll" : item.kind,
          px,
          py + bob,
          s,
        );
    }
    function render(now) {
      const engine = getEngine();
      const due = pendingEffects.filter(entry => now >= entry.born);
      pendingEffects = pendingEffects.filter(entry => now < entry.born);
      for (const entry of due) {
        effect(entry.event, entry.born);
        entry.notify?.(entry.event);
      }
      attacks = attacks.filter(attack => now < attack.born + attack.impact + 110);
      frame++;
      ctx.imageSmoothingEnabled = false;
      const p = engine.player;
      let drawX = p.x,
        drawY = p.y,
        walkFrame = -1,
        stride = 1;
      const heroType = heroSprite(p.facing), count = walkFrameCount(heroType);
      // Each step runs passing pose -> contact -> passing pose, so rest is close to the standing pose.
      const gaitFrame = distance => Math.floor((distance + .5) * count / walkCycleDistance(heroType)) % count;
      if (playerTween) {
        const t = Math.max(0, Math.min(1, (now - playerTween.born) / 160));
        drawX = playerTween.from.x + (playerTween.to.x - playerTween.from.x) * t;
        drawY = playerTween.from.y + (playerTween.to.y - playerTween.from.y) * t;
        walkDistance = playerTween.start + playerTween.distance * t;
        if (t === 1) {
          playerTween = null;
          walkDistance = Math.round(walkDistance);
          playerSettle = { born: now, frame: gaitFrame(walkDistance) };
        } else {
          walkFrame = gaitFrame(walkDistance);
          stride = Math.min(1, (walkDistance - playerTween.rest) / .35);
        }
      }
      if (playerSettle) {
        const t = (now - playerSettle.born) / 110;
        if (t >= 1) playerSettle = null;
        else if (!playerTween) { walkFrame = playerSettle.frame; stride = 1 - t; }
      }
      // Project the same interpolated position for the hero and camera, including at map edges.
      const cols = canvas.width / tile,
        rows = canvas.height / tile;
      camera.x = Math.max(cols / 2, Math.min(W - cols / 2, drawX + 0.5));
      camera.y = Math.max(rows / 2, Math.min(H - rows / 2, drawY + 0.5));
      const offsetX = Math.round(canvas.width / 2 - camera.x * tile),
        offsetY = Math.round(canvas.height / 2 - camera.y * tile);
      ctx.fillStyle = "#11191c";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const minX = Math.max(0, Math.floor(-offsetX / tile) - 1),
        maxX = Math.min(W, Math.ceil((canvas.width - offsetX) / tile) + 1),
        minY = Math.max(0, Math.floor(-offsetY / tile) - 1),
        maxY = Math.min(H, Math.ceil((canvas.height - offsetY) / tile) + 1);
      for (let y = minY; y < maxY; y++)
        for (let x = minX; x < maxX; x++) {
          const k = y * W + x,
            px = x * tile + offsetX,
            py = y * tile + offsetY;
          if (engine.seen[k]) {
            if (engine.tiles[k]) floorTile(x, y, px, py, engine.visible[k]);
            else wallTile(x, y, px, py, engine.visible[k]);
          } else {
            ctx.fillStyle = hash(x, y) < 0.5 ? "#131c1d" : "#15201f";
            ctx.fillRect(px, py, tile - 1, tile - 1);
            if (hash(x, y, 2) < 0.18) {
              ctx.fillStyle = "#203027";
              ctx.fillRect(px + tile * 0.3, py + tile * 0.7, 2, 2);
            }
          }
        }
      if (engine.strategyTrial) {
        const lamp = engine.strategy.lamp;
        if (lamp) {
          ctx.fillStyle = "#ffdc6328";
          for (let y = lamp.y - 2; y <= lamp.y + 2; y++) for (let x = lamp.x - 2; x <= lamp.x + 2; x++)
            if (engine.inside(x, y) && engine.visible[engine.key(x, y)] && engine.tile(x, y) && engine.lineOfSight(lamp.x, lamp.y, x, y)) ctx.fillRect(x * tile + offsetX, y * tile + offsetY, tile, tile);
        }
        for (const [kind, entries] of [["lamp", lamp ? [lamp] : []], ["vine", engine.strategy.vines]]) for (const entry of entries) {
          if (!engine.seen[engine.key(entry.x, entry.y)]) continue;
          const x = (entry.x + .5) * tile + offsetX, y = (entry.y + .5) * tile + offsetY;
          ctx.save(); ctx.strokeStyle = kind === "vine" ? "#355837" : "#694123"; ctx.fillStyle = kind === "lamp" ? "#ffe490" : "#5d9654"; ctx.lineWidth = tile * .04;
          if (kind === "vine") {
            ctx.beginPath(); ctx.moveTo(x - tile * .35, y + tile * .2); ctx.quadraticCurveTo(x + tile * .35, y - tile * .3, x - tile * .1, y - tile * .3); ctx.stroke();
            ctx.beginPath(); ctx.ellipse(x - tile * .15, y, tile * .18, tile * .08, -.6, 0, Math.PI * 2); ctx.fill();
          } else {
            ctx.beginPath(); ctx.ellipse(x, y, tile * .18, tile * .23, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            if (kind === "lamp") { ctx.fillStyle = "#fff9dc"; ctx.beginPath(); ctx.ellipse(x, y - tile * .1, tile * .065, tile * .15, 0, 0, Math.PI * 2); ctx.fill(); }
            ctx.font = `bold ${tile * .22}px sans-serif`; ctx.textAlign = "center"; ctx.fillStyle = "#293a2f"; ctx.fillText(String(entry.remaining), x, y + tile * .43);
          }
          ctx.restore();
        }
        const target = getTarget();
        if (target) {
          const points = [target, ...(target.plan?.landing && (target.plan.landing.x !== target.x || target.plan.landing.y !== target.y) ? [target.plan.landing] : [])];
          ctx.save(); ctx.strokeStyle = target.plan ? "#fff4bd" : "#b53f3d"; ctx.lineWidth = tile * .06;
          for (const point of points) { const x = point.x * tile + offsetX, y = point.y * tile + offsetY; ctx.strokeRect(x + tile * .12, y + tile * .12, tile * .76, tile * .76); ctx.beginPath(); ctx.moveTo(x + tile * .5, y + tile * .25); ctx.lineTo(x + tile * .5, y + tile * .75); ctx.moveTo(x + tile * .25, y + tile * .5); ctx.lineTo(x + tile * .75, y + tile * .5); ctx.stroke(); }
          ctx.restore();
        }
      }
      if (engine.seen[engine.key(engine.stairs.x, engine.stairs.y)]) {
        const sx = engine.stairs.x * tile + offsetX,
          sy = engine.stairs.y * tile + offsetY;
        if (
          engine.floor === engine.maxFloor() &&
          engine.visible[engine.key(engine.stairs.x, engine.stairs.y)]
        )
          drawLantern(sx, sy);
        else drawStairs(sx, sy);
        if (!engine.visible[engine.key(engine.stairs.x, engine.stairs.y)]) {
          ctx.fillStyle = "#0b111a99";
          ctx.fillRect(sx, sy, tile, tile);
        }
      }
      for (const t of engine.traps)
        if (t.found && engine.seen[engine.key(t.x, t.y)]) {
          const px = t.x * tile + offsetX,
            py = t.y * tile + offsetY;
          ctx.fillStyle = "#c4976c";
          for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(px + tile * (0.25 + i * 0.2), py + tile * 0.7);
            ctx.lineTo(px + tile * (0.35 + i * 0.2), py + tile * 0.4);
            ctx.lineTo(px + tile * (0.45 + i * 0.2), py + tile * 0.7);
            ctx.fill();
          }
        }
      for (const item of engine.items)
        if (engine.visible[engine.key(item.x, item.y)])
          drawItem(item, item.x * tile + offsetX, item.y * tile + offsetY, now);
      for (const e of engine.enemies)
        if (e.hp > 0 && e.intent && engine.visible[engine.key(e.x, e.y)]) {
          const px = e.intent.x * tile + offsetX,
            py = e.intent.y * tile + offsetY;
          ctx.fillStyle = "#f5c66e40";
          ctx.fillRect(px, py, tile, tile);
          ctx.strokeStyle = "#ffdf85";
          ctx.lineWidth = tile / 12;
          ctx.strokeRect(
            px + tile / 12,
            py + tile / 12,
            (tile * 5) / 6,
            (tile * 5) / 6,
          );
          ctx.beginPath();
          ctx.moveTo(px + tile * 0.3, py + tile * 0.3);
          ctx.lineTo(px + tile * 0.7, py + tile * 0.7);
          ctx.moveTo(px + tile * 0.7, py + tile * 0.3);
          ctx.lineTo(px + tile * 0.3, py + tile * 0.7);
          ctx.stroke();
        }
      const entities = engine.enemies
        .filter((e) => e.hp > 0 && engine.visible[engine.key(e.x, e.y)])
        .map((e) => ({ ...e, isPlayer: false }));
      for (const attack of attacks) {
        const target = attack.target;
        const live = entities.find(entity => entity.id === target.id);
        if (live && target.visible && (live.x !== target.x || live.y !== target.y)) {
          live.x = target.x; live.y = target.y;
        }
        if (target.type && target.visible && target.id !== "player" && !live)
          entities.push({ ...target, isPlayer: false, defeated: target.hp <= 0 });
      }
      for (const e of entities) if (!e.defeated) enemyPosition(e, now);
      for (const [id, motion] of enemyMotion) if (motion.seen !== frame) enemyMotion.delete(id);
      entities.push({ id: "player", x: drawX, y: drawY, isPlayer: true, type: "hero" });
      entities.sort((a, b) => a.y - b.y);
      for (const e of entities) {
        const px = e.x * tile + offsetX,
          py = e.y * tile + offsetY,
          s = tile / 16;
        const style = e.isPlayer ? null : motionStyle(e.type), hop = e.hop || 0;
        ctx.fillStyle = "#06151466";
        ctx.beginPath();
        ctx.ellipse(
          px + tile / 2,
          py + tile * 0.85,
          tile * 0.33 * (1 - hop * .25),
          tile * 0.13 * (1 - hop * .25),
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        let bob = reduced || !style ? 0 : Math.sin(now / style.float + e.id) * s * style.bob;
        bob -= hop * tile * (style?.hop || 0);
        // Idle breathing, stretched while airborne; anchored at the feet so nothing slides.
        let scaleX = 1, scaleY = 1;
        if (!reduced) {
          const breath = Math.sin(now / (e.isPlayer ? 620 : style.breathe) + (e.isPlayer ? 0 : e.id * 1.7));
          const amount = e.isPlayer ? (walkFrame === -1 ? .012 : 0) : style.squash;
          scaleY = 1 + breath * amount + hop * amount * 2;
          scaleX = 1 - breath * amount * .6 - hop * amount;
        }
        if (
          !e.isPlayer &&
          MONSTERS[e.species]?.trait === "mimic" &&
          !e.revealed
        )
          drawItem({ kind: "gold", x: Math.round(e.x) }, px, py, now);
        else {
          let pushX = 0, pushY = 0, opacity = 1, lean = 0;
          for (const attack of attacks) {
            const age = now - attack.born;
            if (age < 0) continue;
            const dx = attack.target.x - attack.source.x, dy = attack.target.y - attack.source.y;
            const length = Math.hypot(dx, dy) || 1;
            if (attack.source.id === e.id && age < 160) {
              if (e.isPlayer) walkFrame = -1;
              const push = Math.sin(Math.PI * age / 160) * (attack.kind === "melee" ? .18 : .06);
              pushX += dx / length * push; pushY += dy / length * push;
              lean = dx / length * Math.sin(Math.PI * age / 160) * .09;
            }
            if (attack.target.id === e.id && age >= attack.impact && !attack.miss) {
              const impact = Math.min(1, (age - attack.impact) / 100);
              const recoil = Math.sin(impact * Math.PI * 3) * (1 - impact) * .08;
              pushX += dx / length * recoil; pushY += dy / length * recoil;
              opacity = e.defeated ? 1 - impact : 1 - Math.sin(impact * Math.PI * 2) ** 2 * .35;
            }
          }
          ctx.save();
          ctx.translate(px + tile / 2 + pushX * tile, py + tile * .8 + pushY * tile);
          ctx.rotate(lean);
          ctx.scale(scaleX, scaleY);
          sprite(
            ctx,
            e.isPlayer ? heroSprite(p.facing) : e.type,
            -tile / 2,
            -tile * .8 - (e.isPlayer ? tile * 0.125 : 0) + bob,
            s,
            opacity,
            e.isPlayer && p.facing[0] < 0,
            e.species,
            e.isPlayer ? walkFrame : null,
            e.isPlayer ? stride : 1,
          );
          ctx.restore();
        }
        if (e.intent) {
          ctx.fillStyle = "#ffdf85";
          ctx.font = `bold ${Math.round(tile * 0.5)}px sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText("!", px + tile / 2, py - tile * 0.05);
        }
        if (!e.isPlayer && !e.defeated && e.hp < e.maxHp) {
          ctx.fillStyle = "#10171ee0";
          ctx.fillRect(px + tile * 0.16, py - tile * 0.12, tile * 0.68, s * 2);
          ctx.fillStyle = "#db8790";
          ctx.fillRect(
            px + tile * 0.18,
            py - tile * 0.1,
            (tile * 0.64 * e.hp) / e.maxHp,
            s,
          );
        }
        if (e.isPlayer) {
          const lx = px + tile * (p.facing[0] < 0 ? 0.15 : 0.85),
            ly = py + tile * 0.68;
          const light = ctx.createRadialGradient(lx, ly, 0, lx, ly, tile * 3.4);
          light.addColorStop(0, "#edca8226");
          light.addColorStop(0.5, "#edca820c");
          light.addColorStop(1, "#edca8200");
          ctx.fillStyle = light;
          ctx.fillRect(lx - tile * 4, ly - tile * 4, tile * 8, tile * 8);
          if (!hasAtlas()) {
            ctx.fillStyle = "#b38954";
            ctx.fillRect(lx - s, ly - s * 2, s * 3, s * 4);
            ctx.fillStyle = "#ffde92";
            ctx.fillRect(lx, ly - s, s, s * 2);
          }
          const [dx, dy] = p.facing,
            length = Math.hypot(dx, dy),
            vx = dx / length,
            vy = dy / length,
            cx = px + tile * 0.5 + vx * tile * 0.8,
            cy = py + tile * 0.5 + vy * tile * 0.8;
          ctx.beginPath();
          ctx.moveTo(cx + vx * s * 2, cy + vy * s * 2);
          ctx.lineTo(
            cx - vx * s * 1.5 - vy * s * 1.5,
            cy - vy * s * 1.5 + vx * s * 1.5,
          );
          ctx.lineTo(
            cx - vx * s * 1.5 + vy * s * 1.5,
            cy - vy * s * 1.5 - vx * s * 1.5,
          );
          ctx.closePath();
          ctx.fillStyle = "#ffe2a1";
          ctx.strokeStyle = "#302831";
          ctx.lineWidth = s * 0.7;
          ctx.stroke();
          ctx.fill();
        }
      }
      for (const attack of attacks) {
        const age = now - attack.born;
        if (attack.kind === "arrow") {
          if (age < 40 || age >= attack.impact) continue;
          let dx = attack.target.x - attack.source.x, dy = attack.target.y - attack.source.y;
          if (!dx && !dy) {
            dx = (attack.source.facing?.[0] || 0) * .35;
            dy = (attack.source.facing?.[1] || 0) * .35;
          }
          const travel = (age - 40) / (attack.impact - 40);
          const x = attack.source.x + dx * travel, y = attack.source.y + dy * travel;
          if (!engine.visible[engine.key(Math.round(x), Math.round(y))]) continue;
          ctx.save();
          ctx.translate((x + .5) * tile + offsetX, (y + .5) * tile + offsetY);
          ctx.rotate(Math.atan2(dy, dx));
          ctx.lineCap = "round";
          ctx.strokeStyle = "#ffe2a166"; ctx.lineWidth = tile * .06;
          ctx.beginPath(); ctx.moveTo(-tile * .65, 0); ctx.lineTo(-tile * .2, 0); ctx.stroke();
          ctx.strokeStyle = "#302831"; ctx.lineWidth = tile * .09;
          ctx.beginPath(); ctx.moveTo(-tile * .3, 0); ctx.lineTo(tile * .28, 0); ctx.stroke();
          ctx.strokeStyle = "#f5ce8d"; ctx.lineWidth = tile * .035; ctx.stroke();
          ctx.fillStyle = "#f5efdf";
          ctx.beginPath(); ctx.moveTo(tile * .37, 0);
          ctx.lineTo(tile * .16, -tile * .09); ctx.lineTo(tile * .16, tile * .09);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = "#c3d5ba"; ctx.lineWidth = tile * .045;
          ctx.beginPath(); ctx.moveTo(-tile * .19, 0); ctx.lineTo(-tile * .32, -tile * .09);
          ctx.moveTo(-tile * .19, 0); ctx.lineTo(-tile * .32, tile * .09); ctx.stroke();
          ctx.restore();
          continue;
        }
        if (age < 20 || age > 135 || !attack.source.visible) continue;
        const dx = attack.target.x - attack.source.x, dy = attack.target.y - attack.source.y;
        const angle = Math.atan2(dy, dx), length = Math.hypot(dx, dy) || 1;
        const hero = attack.source.id === "player";
        ctx.save();
        ctx.globalAlpha = Math.sin(Math.PI * (age - 20) / 115) * (attack.miss ? .45 : .9);
        ctx.strokeStyle = hero ? "#fff1bb" : "#eea092";
        ctx.lineWidth = tile * .055;
        ctx.lineCap = "round";
        ctx.beginPath();
        if (attack.kind === "melee") {
          const x = (attack.source.x + .5 + dx / length * .55) * tile + offsetX;
          const y = (attack.source.y + .45 + dy / length * .55) * tile + offsetY;
          const sweep = (age - 20) / 115;
          ctx.arc(x, y, tile * .42, angle - 1.2 + sweep * .8, angle + .4 + sweep * .8);
        } else {
          const travel = Math.min(1, age / 70);
          const x = (attack.source.x + .5 + dx * travel) * tile + offsetX;
          const y = (attack.source.y + .5 + dy * travel) * tile + offsetY;
          ctx.moveTo(x - dx / length * tile * .25, y - dy / length * tile * .25);
          ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
      }
      for (const particle of particles) {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.vy += 0.0007;
        particle.life -= 0.035;
        ctx.fillStyle = particle.color;
        ctx.globalAlpha = Math.max(0, particle.life);
        ctx.fillRect(
          particle.x * tile + offsetX,
          particle.y * tile + offsetY,
          tile / 12,
          tile / 12,
        );
      }
      ctx.globalAlpha = 1;
      particles = particles.filter((p) => p.life > 0);
      for (const label of labels) {
        const age = (now - label.born) / 900;
        if (age > 1) continue;
        ctx.save();
        ctx.globalAlpha = 1 - age;
        ctx.font = `bold ${Math.round(tile * 0.42)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#181921";
        const x = (label.x + 0.5 + (label.labelOffset?.x || 0)) * tile + offsetX,
          y = (label.y - 0.2 + (label.labelOffset?.y || 0) - age * 0.7) * tile + offsetY;
        ctx.strokeText(label.text, x, y);
        ctx.fillStyle =
          label.type === "damage"
            ? "#ffada9"
            : label.type === "heal"
              ? "#c3edaa"
              : "#fff0b3";
        ctx.fillText(label.text, x, y);
        ctx.restore();
      }
      labels = labels.filter((l) => now - l.born < 900);
      const vignette = ctx.createRadialGradient(
        canvas.width / 2,
        canvas.height / 2,
        canvas.height * 0.25,
        canvas.width / 2,
        canvas.height / 2,
        canvas.width * 0.7,
      );
      vignette.addColorStop(0, "#070e1000");
      vignette.addColorStop(1, "#070e1066");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      drawMinimap();
      requestAnimationFrame(render);
    }
    const motionStyles = {
      slime: { hop: .14, squash: .05, breathe: 420 },
      bat: { hop: 0, squash: 0, bob: 1.2, float: 230 },
      moth: { hop: 0, squash: 0, bob: 1.2, float: 230 },
      ghost: { hop: 0, squash: .015, bob: 1, float: 520, breathe: 700 },
      golem: { hop: .03, squash: .012, breathe: 900 },
      guardian: { hop: .04, squash: .015, breathe: 800 },
    };
    function motionStyle(type) {
      return { hop: .07, squash: .025, bob: 0, float: 1, breathe: 560, ...motionStyles[type] };
    }
    // Enemies glide between cells instead of teleporting; new arrivals and warps still snap.
    function enemyPosition(e, now) {
      let motion = enemyMotion.get(e.id);
      if (!motion || motion.seen !== frame - 1 || reduced)
        motion = { from: { x: e.x, y: e.y }, to: { x: e.x, y: e.y }, born: -Infinity };
      let t = Math.min(1, (now - motion.born) / 170);
      const eased = t * t * (3 - 2 * t);
      let x = motion.from.x + (motion.to.x - motion.from.x) * eased,
        y = motion.from.y + (motion.to.y - motion.from.y) * eased;
      if (e.x !== motion.to.x || e.y !== motion.to.y) {
        const near = Math.max(Math.abs(e.x - x), Math.abs(e.y - y)) <= 2;
        motion = { from: near ? { x, y } : { x: e.x, y: e.y }, to: { x: e.x, y: e.y }, born: now };
        t = near ? 0 : 1;
      }
      motion.seen = frame;
      enemyMotion.set(e.id, motion);
      if (t < 1) {
        e.x = x; e.y = y;
        e.hop = Math.sin(Math.PI * t);
      }
    }
    function drawMinimap() {
      const engine = getEngine();
      mini.fillStyle = "#131c20";
      mini.fillRect(0, 0, 144, 96);
      const sx = 144 / W,
        sy = 96 / H;
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const k = y * W + x;
          if (engine.seen[k] && engine.tiles[k]) {
            mini.fillStyle = engine.visible[k] ? "#a6b192" : "#4a6154";
            mini.fillRect(x * sx, y * sy, Math.ceil(sx), Math.ceil(sy));
          }
        }
      for (const item of engine.items)
        if (item.discovered) {
          mini.fillStyle = "#ffc857";
          mini.fillRect(item.x * sx, item.y * sy, 3, 3);
        }
      for (const e of engine.enemies)
        if (e.hp > 0 && e.lastSeen) {
          mini.fillStyle =
            MONSTERS[e.species]?.trait === "mimic" && !e.revealed
              ? "#ffc857"
              : "#d08288";
          mini.fillRect(e.lastSeen.x * sx, e.lastSeen.y * sy, 3, 3);
        }
      if (engine.seen[engine.key(engine.stairs.x, engine.stairs.y)]) {
        mini.fillStyle = "#131c20";
        mini.fillRect(engine.stairs.x * sx - 1, engine.stairs.y * sy - 1, 6, 6);
        mini.fillStyle = "#5ca9ff";
        mini.fillRect(engine.stairs.x * sx, engine.stairs.y * sy, 4, 4);
      }
      mini.fillStyle = "#ffe2a1";
      mini.fillRect(engine.player.x * sx, engine.player.y * sy, 4, 4);
    }
    function resize() {
      const rect = viewport.getBoundingClientRect();
      canvas.width = 880;
      canvas.height = Math.round((880 * rect.height) / rect.width);
      tile = closeView ? (rect.width < 500 ? 96 : 64) : (rect.width < 500 ? 48 : 40);
      camera.x = 0;
    }

    function effect(e, born = performance.now()) {
      if (["hit", "damage", "heal", "level"].includes(e.type))
        labels.push({
          ...e,
          born,
          text:
            e.type === "damage"
              ? `−${e.value}`
              : e.type === "hit"
                ? `${e.value}`
                : e.type === "level"
                  ? "LEVEL UP"
                  : `+${e.value}`,
        });
      if (
        ["hit", "kill", "pickup", "heal", "lightning", "level", "won"].includes(
          e.type,
        ) &&
        !reduced
      )
        for (let i = 0; i < 10; i++)
          particles.push({
            x: e.x + 0.5,
            y: e.y + 0.5,
            vx: (Math.random() - 0.5) * 0.05,
            vy: -Math.random() * 0.04,
            life: 1,
            color:
              e.type === "heal"
                ? "#b2d694"
                : e.type === "lightning"
                  ? "#e7e9f5"
                  : "#ebc985",
          });
    }
    function playEffects(events, notify) {
      const now = performance.now();
      let heroDelay = 0, enemyIndex = 0, impactAt = now;
      const multipleHits = events.filter(event => event.type === "damage" && event.attack).length > 1;
      let damageIndex = 0;
      for (const event of events) {
        if (event.attack && !reduced) {
          const hero = event.attack.source.id === "player";
          const delay = hero ? 0 : heroDelay + Math.min(enemyIndex++ * 30, 90);
          const born = now + delay;
          const { source, target, kind } = event.attack;
          const impact = kind === "arrow"
            ? 40 + Math.max(100, Math.min(360, Math.max(Math.abs(target.x - source.x), Math.abs(target.y - source.y)) * 55))
            : 70;
          if (hero) heroDelay = kind === "arrow" ? impact + 40 : 140;
          attacks.push({ ...event.attack, born, impact, miss: event.type === "swing" });
          impactAt = born + impact;
          busyUntil = Math.max(busyUntil, impactAt + 110);
        } else if (!["kill", "level", "won", "dead", "arrow"].includes(event.type)) impactAt = now;
        const visual = multipleHits && event.type === "damage" && event.attack
          ? { ...event, labelOffset: { x: (damageIndex % 3 - 1) * .34, y: -Math.floor(damageIndex++ / 3) * .35 } }
          : event;
        pendingEffects.push({ event: visual, born: impactAt, notify });
      }
    }
    function reset(position) {
      camera = { x: position?.x ?? 0, y: position?.y ?? 0 };
      playerTween = null;
      playerSettle = null;
      walkDistance = 0;
      enemyMotion.clear();
      attacks = [];
      pendingEffects = [];
      busyUntil = 0;
      if (!position) {
        particles = [];
        labels = [];
      }
    }
    function movePlayer(from, born) {
      if (reduced) return;
      let origin = { x: from.x, y: from.y };
      if (playerTween) {
        const t = Math.max(0, Math.min(1, (born - playerTween.born) / 160));
        origin = {
          x: playerTween.from.x + (playerTween.to.x - playerTween.from.x) * t,
          y: playerTween.from.y + (playerTween.to.y - playerTween.from.y) * t,
        };
        walkDistance = playerTween.start + playerTween.distance * t;
      }
      const { x, y } = getEngine().player;
      // One cell is one step on every axis, so diagonal steps also come to rest on a passing pose.
      const distance = Math.max(Math.abs(x - origin.x), Math.abs(y - origin.y));
      // Ease the legs in from rest; continuing input keeps the full stride.
      const settling = playerSettle ? Math.max(0, 1 - (born - playerSettle.born) / 110) : 0;
      const rest = playerTween ? playerTween.rest : walkDistance - settling * .35;
      if (distance) playerTween = { from: origin, to: { x, y }, born, start: walkDistance, distance, rest };
      playerSettle = null;
    }
    function tileAt(event) {
      const engine = getEngine(),
        r = canvas.getBoundingClientRect(),
        worldX =
          (((event.clientX - r.left) / r.width) * canvas.width -
            canvas.width / 2) /
            tile +
          camera.x,
        worldY =
          (((event.clientY - r.top) / r.height) * canvas.height -
            canvas.height / 2) /
            tile +
          camera.y;
      return {x: Math.floor(worldX), y: Math.floor(worldY)};
    }
    function directionAt(event) {
      const target = tileAt(event), p = getEngine().player;
      return [Math.sign(target.x - p.x), Math.sign(target.y - p.y)];
    }
    return {
      ready,
      itemsReady,
      walkReady,
      sideWalkReady,
      setCloseView(value) { closeView = value; resize(); },
      sprite,
      heroSprite,
      walkFrameCount,
      walkCycleDistance,
      drawMinimap,
      resize,
      reset,
      movePlayer,
      effect,
      playEffects,
      remaining: () => Math.max(0, busyUntil - performance.now()),
      directionAt,
      tileAt,
      start: () => requestAnimationFrame(render),
    };
  }
  root.createDungeonRenderer = createDungeonRenderer;
  if (typeof module !== "undefined" && module.exports)
    module.exports = createDungeonRenderer;
})(typeof window !== "undefined" ? window : globalThis);
