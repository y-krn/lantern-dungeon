(function (root) {
  "use strict";
  const { W, H, MONSTERS, equipmentKind } =
    typeof module !== "undefined" && module.exports
      ? require("./data.js")
      : root.DungeonData;
  function createDungeonRenderer({
    canvas,
    minimap,
    viewport,
    getEngine,
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
      attacks = [],
      pendingEffects = [],
      busyUntil = 0;
    let closeView = true;
    // The painted sheet has uneven gutters; these bounds isolate each complete silhouette.
    const artFrames = {
      hero: [48, 12, 206, 300], heroDownRight: [312, 12, 210, 300],
      heroRight: [575, 8, 224, 304], heroUpRight: [884, 10, 216, 302],
      heroUp: [44, 312, 206, 296], heroUpLeft: [320, 312, 214, 296],
      heroLeft: [580, 312, 228, 296], heroDownLeft: [872, 312, 220, 298],
      slime: [22, 614, 246, 260], bat: [280, 614, 294, 250],
      ghost: [588, 608, 242, 272], beetle: [856, 620, 262, 256],
      plant: [20, 880, 248, 254], mimic: [294, 882, 260, 248],
      moth: [564, 890, 276, 244], golem: [844, 878, 264, 254],
      guardian: [18, 1134, 264, 252], lantern: [358, 1134, 160, 248],
    };
    const itemFrames = {
      bread: [18, 50, 279, 220], potion: [323, 30, 271, 257],
      scroll: [621, 40, 253, 243], arrow: [906, 17, 271, 285],
      gold: [1204, 76, 259, 198], woodSword: [1500, 33, 253, 254],
      copperSword: [29, 305, 246, 273], ironSword: [329, 304, 254, 273],
      starSword: [622, 307, 261, 269], ghostSword: [915, 304, 257, 284],
      pickaxe: [1199, 310, 272, 269], travelerShield: [1502, 315, 243, 262],
      copperShield: [20, 594, 257, 266], ironShield: [325, 577, 242, 291],
      starShield: [628, 576, 242, 291], leatherShield: [912, 598, 256, 263],
      mirrorShield: [1224, 579, 223, 291], lantern: [1543, 582, 179, 283],
    };
    const baseSpecies = {slime: 'mossSlime', bat: 'caveBat', ghost: 'lanternGhost',
      beetle: 'cobaltBeetle', plant: 'thornPlant', mimic: 'coinMimic',
      moth: 'lanternMoth', golem: 'stoneGolem', guardian: 'starGuardian'};
    const paintedSprites = new Map();
    const atlas = typeof root.Image === 'function' ? new root.Image() : null;
    const ready = atlas ? new Promise(resolve => {
      atlas.onload = () => resolve(true);
      atlas.onerror = () => resolve(false);
      atlas.src = 'art/lantern-atlas.png';
    }) : Promise.resolve(false);
    const itemAtlas = typeof root.Image === 'function' ? new root.Image() : null;
    const itemsReady = itemAtlas ? new Promise(resolve => {
      itemAtlas.onload = () => resolve(true);
      itemAtlas.onerror = () => resolve(false);
      itemAtlas.src = 'art/lantern-items.png';
    }) : Promise.resolve(false);
    function tone(hex) {
      const [r, g, b] = hex.match(/\w\w/g).map(value => parseInt(value, 16) / 255);
      const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
      const lightness = (max + min) / 2;
      return {hue: delta ? ((max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4) * 60 + 360) % 360 : 0,
        saturation: delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0};
    }
    function paintedSprite(context, type, x, y, scale, alpha, flip, species) {
      const useItem = !!itemFrames[type] && itemAtlas?.complete && itemAtlas.naturalWidth;
      const sheet = useItem ? itemAtlas : atlas, frameBounds = useItem ? itemFrames[type] : artFrames[type];
      if (!sheet?.complete || !sheet.naturalWidth || !frameBounds) return false;
      const m = MONSTERS[species];
      if (flip && type.startsWith('hero')) {
        type = {heroRight: 'heroLeft', heroUpRight: 'heroUpLeft', heroDownRight: 'heroDownLeft'}[type] || type;
        flip = false;
      }
      const key = useItem ? `item:${type}` : species || type;
      if (!paintedSprites.has(key)) {
        const [sx, sy, width, height] = useItem ? frameBounds : artFrames[type];
        const image = document.createElement('canvas');
        image.width = width; image.height = height;
        const paint = image.getContext('2d'), base = MONSTERS[baseSpecies[type]];
        if (m && base && m !== base) {
          const target = tone(m.colors[1]), original = tone(base.colors[1]);
          paint.filter = `hue-rotate(${target.hue - original.hue}deg) saturate(${target.saturation / (original.saturation || 1)})`;
        }
        paint.drawImage(sheet, sx, sy, width, height, 0, 0, width, height);
        paintedSprites.set(key, image);
      }
      const image = paintedSprites.get(key), hero = type.startsWith('hero');
      const factor = Math.min(16 * scale / image.width, (hero ? 18 : 16) * scale / image.height);
      const width = image.width * factor, height = image.height * factor;
      context.save(); context.globalAlpha = alpha; context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
      if (flip) {context.translate(x + 16 * scale, y); context.scale(-1, 1); x = 0; y = 0;}
      context.drawImage(image, x + 8 * scale - width / 2, y + (hero ? 18 : 16) * scale - height, width, height);
      if (m?.tier) {
        context.fillStyle = '#3c3429';
        context.fillRect(x + 12 * scale, y, 4.5 * scale, 4 * scale);
        context.fillStyle = '#ffe9ab';
        for (const [col, row] of monsterMarks[m.tier])
          context.fillRect(x + (12.3 + (col - 5) * .65) * scale, y + (.5 + (row - 2) * .65) * scale, .7 * scale, .7 * scale);
      }
      context.restore(); return true;
    }
    const palette = {
      ".": null,
      o: "#302831",
      d: "#493744",
      b: "#754c3d",
      c: "#b87545",
      t: "#dea45e",
      l: "#f5ce8d",
      s: "#eabb92",
      w: "#f9e4b6",
      g: "#869374",
      n: "#4e6658",
      a: "#a4c69b",
      p: "#d49bba",
      v: "#87759b",
      k: "#262632",
      h: "#a48e67",
      i: "#dae6bb",
      r: "#d27c80",
    };
    const sprites = {
      hero: [
        ".....oooooo.....",
        "....obbbbbbo....",
        "...obcttttcbo...",
        "..obcttttttcbo..",
        "..obbbbbbbbbbo..",
        "....ossossso....",
        "....osdssdsso...",
        "....osssssso....",
        ".....owwwwo.....",
        "...oonnwnnnoo...",
        "..obonngnnnobo..",
        "..obonnnnnnobo..",
        "..oconnnnnnoco..",
        "..ooonnhhnnooo..",
        "....obbbbbbo....",
        "....obboobbo....",
        "....ohhoohho....",
        "...oohhoohhoo...",
      ],
      heroUp: [
        ".....oooooo.....",
        "....obbbbbbo....",
        "...obcttttcbo...",
        "..obcttttttcbo..",
        "..obbbbbbbbbbo..",
        "....obbbbbbo....",
        "....obbbbbbo....",
        "....obbbbbbo....",
        ".....onnnno.....",
        "...oonnnnnnoo...",
        "..obohhhhhhobo..",
        "..obohllllhobo..",
        "..obohllllhobo..",
        "..ooohhhhhoooo..",
        "....obbbbbbo....",
        "....obboobbo....",
        "....ohhoohho....",
        "...oohhoohhoo...",
      ],
      heroUpRight: [
        "......oooooo....",
        ".....obbbbbbo...",
        "....obcttttcbo..",
        "...obcttttttcbo.",
        "...obbbbbbbbbbo.",
        ".....obbbbsso...",
        ".....obbbbssso..",
        ".....obbbbsso...",
        "......onnwno....",
        "....oonnnnnoo...",
        "...ohhhhhnnobo..",
        "...ohlllhngobo..",
        "...ohlllhnnoco..",
        "...ohhhhhnnooo..",
        ".....obbbbbo....",
        ".....obboobbo...",
        ".....ohhoohho...",
        "....oohhoohhoo..",
      ],
      heroRight: [
        "......ooooo.....",
        ".....obbbbbo....",
        "....obctttcbo...",
        "....obctttttboo.",
        "....obbbbbbbbbo.",
        "......obsssso...",
        "......obsdsso...",
        "......obsssso...",
        "......onwwo.....",
        ".....onnnnoo....",
        "....ohhhnnobo...",
        "....ohllngobo...",
        "....ohllnnoco...",
        "....ohhhnnooo...",
        ".....obbbbo.....",
        ".....obbbbo.....",
        ".....ohhhhho....",
        ".....oohhhhoo...",
      ],
      heroDownRight: [
        "......oooooo....",
        ".....obbbbbbo...",
        "....obcttttcbo..",
        "...obcttttttcbo.",
        "...obbbbbbbbbbo.",
        ".....ossssso....",
        ".....osdssdso...",
        ".....ossssso....",
        "......owwwo.....",
        "....oonwnnnoo...",
        "...obonngnnobo..",
        "...obonnnnnobo..",
        "...oconnnnnoco..",
        "...ooonnhnnooo..",
        ".....obbbbbo....",
        ".....obboobbo...",
        ".....ohhoohho...",
        "....oohhoohhoo..",
      ],
      slime: [
        "................",
        "................",
        "................",
        "................",
        "......oooo......",
        "....oonnnnoo....",
        "...onnggggnno...",
        "..onggaaggagno..",
        "..onggaaaggagno.",
        ".ongggaagggggno.",
        ".onigggggggigno.",
        ".onkigggggikgno.",
        "..onggiiigggno..",
        "...onnnnnnnno...",
        "....ooooooo.....",
        "................",
      ],
      bat: [
        "................",
        "................",
        "....o......o....",
        "...ovoo..oovo...",
        "..ovvvvoovvvvo..",
        ".ovvpvvoovvpvvo.",
        "ovvpvvvkkvvvpvvo",
        "ovvvvkkvvkkvvvvo",
        ".ovvkkwvvwkkvvo.",
        "..ookkvvvvkk oo.",
        "....okvpvvko....",
        ".....ovvvvo.....",
        "......ovvo......",
        ".......oo.......",
        "................",
        "................",
      ],
      ghost: [
        "................",
        "......oooo......",
        ".....ovvvvo.....",
        "....ovppppvo....",
        "...ovppppppvo...",
        "...ovpwpwp pvo..",
        "...ovpkpkppvo...",
        "...ovppppppvo...",
        "...ovvppppvvo...",
        "...ovvvppvvvo...",
        "...ovvvvvvvvo...",
        "...ovvovvovvo...",
        "...ovoovoovoo...",
        "....o..oo..o....",
        "................",
        "................",
      ],
      guardian: [
        "......ohho......",
        ".....ohhhho.....",
        "....ohhllhho....",
        "...ohllllllho...",
        "..ohhhhoohhhho..",
        "..ovvowwowvvo...",
        "..ovvokkokvvo...",
        "...ovvllvvvo....",
        ".oohhvvvvhhoo...",
        "ohhhvvvvvvhhho..",
        "ohhvvlhh lvvhho.",
        "ohhvvllllvvhho..",
        ".ohvvvvvvvhho...",
        "..ovvhllhvvo....",
        "..ohhhoohhho....",
        ".oohho..ohhoo...",
      ],
      beetle: [
        "................",
        "....o......o....",
        "....ovo..ovo....",
        ".....ovvvvo.....",
        "....ovwkkwvo....",
        "...ovvvvvvvvo...",
        "..ovvvvppvvvvo..",
        ".oovvppvvppvvoo.",
        "...ovvpvvpvvo...",
        "..oovvpvvpvvoo..",
        "...ovvppppvvo...",
        "..oovvvvvvvvoo..",
        "....ovvvvvvo....",
        ".....oooooo.....",
        "................",
        "................",
      ],
      plant: [
        "................",
        ".....oooooo.....",
        "....ovppppvo....",
        "...ovppwpppvo...",
        "...ovpkkkppvo...",
        "....ovppppvo....",
        ".....ovvvvo.....",
        ".......no.......",
        "..oo...no...oo..",
        ".ovvo..no..ovvo.",
        "..ovvono.novvo..",
        "...ovvnnnnvvo...",
        "....oonnnoo.....",
        ".....onnno......",
        "....ooooooo.....",
        "................",
      ],
      mimic: [
        "................",
        "................",
        ".....oooooo.....",
        "...oovppppvoo...",
        "..ovvvvvvvvvvo..",
        "..ovwkvvvkwvvo..",
        "..ovvvvvvvvvvo..",
        "..ooooooo.oooo..",
        "..owkwkwkwkwwo..",
        "..okkkkkkkkkko..",
        "..owkwkwkwkwwo..",
        "..ovvvvvvvvvvo..",
        "...ovvppppvvo...",
        "....ooooooo.....",
        "....oo...oo.....",
        "................",
      ],
      moth: [
        "................",
        "....o......o....",
        "...ovoo..oovo...",
        "..ovppvoovppvo..",
        ".ovpppvpvppppvo.",
        "ovppvpvvvvpvppvo",
        "ovpvvvpvpvvvp.pv",
        "ovppvpvvvvpvppvo",
        ".ovppvvwvvppvo..",
        "..ovvppvppvvo...",
        "...ovvvv.vvo....",
        "...ovppvppvo....",
        "....ovvvvvo.....",
        ".....ovvvo......",
        "......ooo.......",
        "................",
      ],
      golem: [
        "................",
        ".....oooooo.....",
        "....ovvvvvvo....",
        "....ovwkkwvo....",
        "....ovvvvvvo....",
        ".....ovvvvo.....",
        "..ooovppppvooo..",
        ".ovvvvppppvvvvo.",
        ".ovvpvvvvvpvvvo.",
        ".ovvpvvvvvpvvvo.",
        ".ovvvvppppvvvvo.",
        "..ooovvvvvvooo..",
        "....ovvoovvo....",
        "....ovvoovvo....",
        "...ovvvoovvvo...",
        "...oooo..oooo...",
      ],
      bread: [
        "................",
        "................",
        "................",
        "......oooo......",
        "....oottttoo....",
        "...otllttllto...",
        "..otllttttllto..",
        "..ottttlttttto..",
        "..otttllttttto..",
        "..otttttttl tto.",
        "...octtttttco...",
        "....occcccco....",
        ".....oooooo.....",
        "................",
        "................",
        "................",
      ],
      potion: [
        "................",
        "................",
        ".......a........",
        "......an..a.....",
        ".....aanngn.....",
        "....aaannnn.....",
        ".....nnann......",
        ".......no.......",
        ".....ooaoo......",
        "....onaggno.....",
        "....ongggno.....",
        ".....onnno......",
        "......ooo.......",
        "................",
        "................",
        "................",
      ],
      scroll: [
        "................",
        ".....oooooo.....",
        ".....ohllho.....",
        ".....ollllo.....",
        ".....olhhlo.....",
        ".....olhhlo.....",
        ".....ollllo.....",
        ".....ollhlo.....",
        ".....olhhlo.....",
        ".....ollhlo.....",
        ".....ollllo.....",
        ".....ohllho.....",
        ".....oooooo.....",
        ".......hh.......",
        ".......hh.......",
        "................",
      ],
      arrow: [
        "................",
        "..........hh....",
        ".........hhh....",
        "........hh......",
        ".......hh.......",
        "......hh........",
        ".....hh.........",
        "....hh..........",
        "...hhhh.........",
        "..hhhh..........",
        "..hh............",
        "................",
        "................",
        "................",
        "................",
        "................",
      ],
    };
    const monsterMarks = [
      [],
      [
        [6, 4],
        [7, 4],
        [8, 4],
        [9, 4],
      ],
      [
        [7, 3],
        [6, 4],
        [8, 4],
        [7, 5],
      ],
      [
        [5, 5],
        [6, 4],
        [7, 3],
        [8, 4],
        [9, 5],
      ],
      [
        [7, 3],
        [7, 4],
        [6, 4],
        [8, 4],
        [7, 5],
      ],
      [
        [5, 3],
        [7, 3],
        [9, 3],
        [5, 4],
        [6, 5],
        [7, 5],
        [8, 5],
        [9, 4],
      ],
      [
        [7, 2],
        [5, 3],
        [7, 3],
        [9, 3],
        [6, 4],
        [7, 4],
        [8, 4],
        [5, 5],
        [9, 5],
      ],
    ];
    function sprite(
      context,
      type,
      x,
      y,
      scale = 2,
      alpha = 1,
      flip = false,
      species = null,
    ) {
      if (paintedSprite(context, type, x, y, scale, alpha, flip, species)) return;
      const m = MONSTERS[species],
        pattern = sprites[type] || sprites.scroll;
      const colors = m
        ? {
            ...palette,
            ...(type === "slime"
              ? {
                  n: m.colors[0],
                  g: m.colors[1],
                  a: m.colors[2],
                  i: m.colors[2],
                }
              : type === "guardian"
                ? { h: m.colors[1], l: m.colors[2], v: m.colors[0] }
                : { v: m.colors[1], p: m.colors[2], n: m.colors[0] }),
          }
        : palette;
      context.save();
      context.globalAlpha = alpha;
      if (flip) {
        context.translate(x + 16 * scale, y);
        context.scale(-1, 1);
        x = 0;
        y = 0;
      }
      for (let row = 0; row < pattern.length; row++)
        for (let col = 0; col < pattern[row].length; col++) {
          const color = colors[pattern[row][col]];
          if (color) {
            context.fillStyle = color;
            context.fillRect(
              Math.round(x + col * scale),
              Math.round(y + row * scale),
              Math.ceil(scale),
              Math.ceil(scale),
            );
          }
        }
      if (m) {
        context.fillStyle = "#fff1c9";
        for (const [col, row] of monsterMarks[m.tier])
          context.fillRect(
            Math.round(x + col * scale),
            Math.round(y + row * scale),
            Math.ceil(scale),
            Math.ceil(scale),
          );
      }
      context.restore();
    }
    function heroSprite([dx, dy]) {
      return dx === 0
        ? dy < 0
          ? "heroUp"
          : "hero"
        : dy < 0
          ? "heroUpRight"
          : dy > 0
            ? "heroDownRight"
            : "heroRight";
    }
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
      attacks = attacks.filter(attack => now < attack.born + 180);
      frame++;
      ctx.imageSmoothingEnabled = false;
      const p = engine.player;
      const cols = canvas.width / tile,
        rows = canvas.height / tile,
        targetX = Math.max(cols / 2, Math.min(W - cols / 2, p.x + 0.5)),
        targetY = Math.max(rows / 2, Math.min(H - rows / 2, p.y + 0.5));
      if (!camera.x || reduced) {
        camera.x = targetX;
        camera.y = targetY;
      } else {
        camera.x += (targetX - camera.x) * 0.2;
        camera.y += (targetY - camera.y) * 0.2;
      }
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
      let drawX = p.x,
        drawY = p.y;
      if (playerTween) {
        const t = Math.min(1, (now - playerTween.born) / 100);
        drawX = playerTween.from.x + (p.x - playerTween.from.x) * t;
        drawY = playerTween.from.y + (p.y - playerTween.from.y) * t;
        if (t === 1) playerTween = null;
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
      entities.push({ id: "player", x: drawX, y: drawY, isPlayer: true, type: "hero" });
      entities.sort((a, b) => a.y - b.y);
      for (const e of entities) {
        const px = e.x * tile + offsetX,
          py = e.y * tile + offsetY,
          s = tile / 16;
        ctx.fillStyle = "#06151466";
        ctx.beginPath();
        ctx.ellipse(
          px + tile / 2,
          py + tile * 0.85,
          tile * 0.33,
          tile * 0.13,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        let bob =
          ["bat", "moth"].includes(e.type) && !reduced
            ? Math.sin(now / 230 + e.id) * s * 1.2
            : 0;
        if (
          !e.isPlayer &&
          MONSTERS[e.species]?.trait === "mimic" &&
          !e.revealed
        )
          drawItem({ kind: "gold", x: e.x }, px, py, now);
        else {
          let pushX = 0, pushY = 0, opacity = 1, lean = 0;
          for (const attack of attacks) {
            const age = now - attack.born;
            if (age < 0) continue;
            const dx = attack.target.x - attack.source.x, dy = attack.target.y - attack.source.y;
            const length = Math.hypot(dx, dy) || 1;
            if (attack.source.id === e.id && age < 160) {
              const push = Math.sin(Math.PI * age / 160) * (attack.kind === "melee" ? .18 : .06);
              pushX += dx / length * push; pushY += dy / length * push;
              lean = dx / length * Math.sin(Math.PI * age / 160) * .09;
            }
            if (attack.target.id === e.id && age >= 70 && !attack.miss) {
              const impact = Math.min(1, (age - 70) / 100);
              const recoil = Math.sin(impact * Math.PI * 3) * (1 - impact) * .08;
              pushX += dx / length * recoil; pushY += dy / length * recoil;
              opacity = e.defeated ? 1 - impact : 1 - Math.sin(impact * Math.PI * 2) ** 2 * .35;
            }
          }
          ctx.save();
          ctx.translate(px + tile / 2 + pushX * tile, py + tile * .8 + pushY * tile);
          ctx.rotate(lean);
          sprite(
            ctx,
            e.isPlayer ? heroSprite(p.facing) : e.type,
            -tile / 2,
            -tile * .8 - (e.isPlayer ? tile * 0.125 : 0) + bob,
            s,
            opacity,
            e.isPlayer && p.facing[0] < 0,
            e.species,
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
          if (!atlas?.complete || !atlas.naturalWidth) {
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
      let heroActed = false, enemyIndex = 0, impactAt = now;
      const multipleHits = events.filter(event => event.type === "damage" && event.attack).length > 1;
      let damageIndex = 0;
      for (const event of events) {
        if (event.attack && !reduced) {
          const hero = event.attack.source.id === "player";
          const delay = hero ? 0 : (heroActed ? 140 : 0) + Math.min(enemyIndex++ * 30, 90);
          const born = now + delay;
          heroActed ||= hero;
          attacks.push({ ...event.attack, born, miss: event.type === "swing" });
          impactAt = born + 70;
          busyUntil = Math.max(busyUntil, born + 180);
        } else if (!["kill", "level", "won", "dead"].includes(event.type)) impactAt = now;
        const visual = multipleHits && event.type === "damage" && event.attack
          ? { ...event, labelOffset: { x: (damageIndex % 3 - 1) * .34, y: -Math.floor(damageIndex++ / 3) * .35 } }
          : event;
        pendingEffects.push({ event: visual, born: impactAt, notify });
      }
    }
    function reset(position) {
      camera = { x: position?.x ?? 0, y: position?.y ?? 0 };
      playerTween = null;
      attacks = [];
      pendingEffects = [];
      busyUntil = 0;
      if (!position) {
        particles = [];
        labels = [];
      }
    }
    function movePlayer(from, born) {
      if (!reduced) playerTween = { from, born };
    }
    function directionAt(event) {
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
      return [
        Math.sign(Math.floor(worldX) - engine.player.x),
        Math.sign(Math.floor(worldY) - engine.player.y),
      ];
    }
    return {
      ready,
      itemsReady,
      setCloseView(value) { closeView = value; resize(); },
      sprite,
      drawMinimap,
      resize,
      reset,
      movePlayer,
      effect,
      playEffects,
      remaining: () => Math.max(0, busyUntil - performance.now()),
      directionAt,
      start: () => requestAnimationFrame(render),
    };
  }
  root.createDungeonRenderer = createDungeonRenderer;
  if (typeof module !== "undefined" && module.exports)
    module.exports = createDungeonRenderer;
})(typeof window !== "undefined" ? window : globalThis);
