(function (root) {
  "use strict";
  const { MONSTERS } =
    typeof module !== "undefined" && module.exports
      ? require("./data.js")
      : root.DungeonData;

  function createSpriteRenderer() {
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
    // Each row shares a canvas size and ground anchor so changing strides never zooms the hero.
    const walkFrames = [
      [[49,15,206,291],[322,15,206,291],[580,15,201,291],[863,15,203,291]],
      [[49,312,216,288],[326,311,207,288],[583,312,212,288],[870,312,210,288]],
      [[45,606,217,278],[324,606,209,278],[586,606,213,281],[870,606,210,279]],
      [[53,890,218,261],[316,889,220,262],[575,891,226,260],[862,889,228,262]],
      [[52,1156,222,236],[330,1155,215,237],[582,1155,226,236],[865,1155,222,237]],
    ];
    const walkRows = {hero:0, heroDownRight:1, heroRight:2, heroUpRight:3, heroUp:4};
    const sideParts = { body: [203,18,749,802], thigh: [1273,71,136,263],
      shin: [1306,388,98,228], boot: [1285,651,230,186] };
    const directionParts = { hero: [14,84,371,467], heroDownRight: [409,83,364,443],
      heroUpRight: [779,80,377,432], heroUp: [1156,80,371,430],
      frontBoot: [381,673,194,297], backBoot: [961,668,189,302] };
    const walkFrameCount = () => 6;
    const walkCycleDistance = () => 2;
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
    const walkAtlas = typeof root.Image === 'function' ? new root.Image() : null;
    const walkReady = walkAtlas ? new Promise(resolve => {
      walkAtlas.onload = () => resolve(true);
      walkAtlas.onerror = () => resolve(false);
      walkAtlas.src = 'art/hero-walk.png';
    }) : Promise.resolve(false);
    const sideAtlas = typeof root.Image === 'function' ? new root.Image() : null;
    const sideWalkReady = sideAtlas ? new Promise(resolve => {
      sideAtlas.onload = () => resolve(true);
      sideAtlas.onerror = () => resolve(false);
      sideAtlas.src = 'art/hero-side-rig.png';
    }) : Promise.resolve(false);
    const directionAtlas = typeof root.Image === 'function' ? new root.Image() : null;
    const directionWalkReady = directionAtlas ? new Promise(resolve => {
      directionAtlas.onload = () => resolve(true);
      directionAtlas.onerror = () => resolve(false);
      directionAtlas.src = 'art/hero-direction-rig.png';
    }) : Promise.resolve(false);
    function paintWalk(paint, frame, type) {
      const side = type === 'heroRight', frontal = type === 'hero' || type === 'heroUp';
      const back = type === 'heroUp' || type === 'heroUpRight';
      const projection = side ? [38,0] : frontal ? [0, back ? -12 : 12] : [26, back ? -8 : 8];
      const hipX = back ? 158 : 176, hipY = side || type === 'hero' ? 333 : 347;
      function part(name, x, y, width, height, directional = false) {
        paint.drawImage(directional ? directionAtlas : sideAtlas,
          ...(directional ? directionParts : sideParts)[name], x, y, width, height);
      }
      function limb(name, from, to, width) {
        paint.save();
        paint.translate(from.x, from.y);
        paint.rotate(-Math.atan2(to.x - from.x, to.y - from.y));
        const [sx, sy, sw, sh] = sideParts[name];
        // Trim the outlined end caps; overlapping skin joins hide the paper-doll seams.
        paint.drawImage(sideAtlas, sx, sy + 14, sw, sh - 28,
          -width / 2, -3, width, Math.hypot(to.x - from.x, to.y - from.y) + 6);
        paint.restore();
      }
      // The far leg is always behind and shaded; its phase is half a cycle ahead.
      for (const far of [true, false]) {
        const phase = (frame / 6 + (far ? .5 : 0)) % 1, swing = phase >= .5;
        const u = (phase % .5) * 2;
        const travel = swing ? -1 + 2 * u * u * (3 - 2 * u) : 1 - 2 * u;
        const hip = {x: hipX + (frontal ? far ? -16 : 16 : 0), y: hipY};
        const foot = {x: hip.x + projection[0] * travel,
          y: (side ? 480 : 466) + projection[1] * travel - (swing ? 30 * Math.sin(Math.PI * u) : 0)};
        const ankle = {x: foot.x, y: foot.y - 40};
        const dx = ankle.x - hip.x, dy = ankle.y - hip.y, distance = Math.hypot(dx, dy);
        const bend = Math.sqrt(Math.max(0, 58 * 58 - distance * distance / 4));
        const knee = {x: (hip.x + ankle.x) / 2 + (frontal ? 0 : dy / distance * bend),
          y: (hip.y + ankle.y) / 2 - (frontal ? swing ? 8 : 0 : dx / distance * bend)};
        paint.save(); paint.filter = far ? 'brightness(.65)' : 'none';
        limb('thigh', hip, knee, 30); limb('shin', knee, ankle, 25);
        // Keep the sole level while the knee bends and the planted foot travels backward.
        const boot = side ? sideParts.boot : directionParts[back ? 'backBoot' : 'frontBoot'];
        const bootWidth = boot[2] * 55 / boot[3];
        part(side ? 'boot' : back ? 'backBoot' : 'frontBoot',
          foot.x - (side ? 22 : bootWidth / 2), foot.y - 55, bootWidth, 55, !side);
        paint.restore();
      }
      const body = side ? sideParts.body : directionParts[type];
      const height = side ? body[3] * 338 / body[2] : 360, width = body[2] * height / body[3];
      part(side ? 'body' : type, (338 - width) / 2, 0, width, height, !side);
    }
    function tone(hex) {
      const [r, g, b] = hex.match(/\w\w/g).map(value => parseInt(value, 16) / 255);
      const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
      const lightness = (max + min) / 2;
      return {hue: delta ? ((max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4) * 60 + 360) % 360 : 0,
        saturation: delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0};
    }
    function paintedSprite(context, type, x, y, scale, alpha, flip, species, walkFrame = null) {
      const rig = sideAtlas?.complete && sideAtlas.naturalWidth &&
        (type === 'heroRight' || (directionParts[type] && directionAtlas?.complete && directionAtlas.naturalWidth));
      const walking = Number.isInteger(walkFrame) && walkFrame >= 0 && walkFrame < walkFrameCount(type)
        && walkRows[type] !== undefined && (rig || (walkAtlas?.complete && walkAtlas.naturalWidth));
      const useItem = !walking && !!itemFrames[type] && itemAtlas?.complete && itemAtlas.naturalWidth;
      const row = walking ? walkFrames[walkRows[type]] : null;
      const sheet = walking ? rig ? sideAtlas : walkAtlas : useItem ? itemAtlas : atlas;
      const frameBounds = walking ? row[walkFrame % row.length] : useItem ? itemFrames[type] : artFrames[type];
      if (!sheet?.complete || !sheet.naturalWidth || !frameBounds) return false;
      const m = MONSTERS[species];
      if (flip && type.startsWith('hero') && !walking) {
        type = {heroRight: 'heroLeft', heroUpRight: 'heroUpLeft', heroDownRight: 'heroDownLeft'}[type] || type;
        flip = false;
      }
      const key = walking ? `walk:${rig ? 'rig:' : ''}${type}:${rig ? walkFrame : walkFrame % row.length}` : useItem ? `item:${type}` : species || type;
      if (!paintedSprites.has(key)) {
        const [sx, sy, width, height] = walking || useItem ? frameBounds : artFrames[type];
        const image = document.createElement('canvas');
        image.width = walking && rig ? 338 : walking ? Math.max(...row.map(frame => frame[2])) : width;
        image.height = walking && rig ? 484 : walking ? Math.max(...row.map(frame => frame[3])) : height;
        const paint = image.getContext('2d'), base = MONSTERS[baseSpecies[type]];
        if (m && base && m !== base) {
          const target = tone(m.colors[1]), original = tone(base.colors[1]);
          paint.filter = `hue-rotate(${target.hue - original.hue}deg) saturate(${target.saturation / (original.saturation || 1)})`;
        }
        if (walking && rig) paintWalk(paint, walkFrame, type);
        else paint.drawImage(sheet, sx, sy, width, height, (image.width - width) / 2, image.height - height, width, height);
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
      walkFrame = null,
    ) {
      if (paintedSprite(context, type, x, y, scale, alpha, flip, species, walkFrame)) return;
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
    return {
      ready,
      itemsReady,
      walkReady,
      sideWalkReady,
      directionWalkReady,
      walkFrameCount,
      walkCycleDistance,
      paintedSprite,
      sprite,
      heroSprite,
      hasAtlas: () => !!atlas?.complete && !!atlas.naturalWidth,
    };
  }
  root.createSpriteRenderer = createSpriteRenderer;
  if (typeof module !== "undefined" && module.exports)
    module.exports = createSpriteRenderer;
})(typeof window !== "undefined" ? window : globalThis);
