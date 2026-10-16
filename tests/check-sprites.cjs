const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const data = require('../dist/data.js');
const createSpriteRenderer = require('../dist/sprites.js');
const source = fs.readFileSync(require.resolve('../dist/sprites.js'), 'utf8');

function load(commonJS) {
  const images = [], textures = [], calls = [];
  const browser = vm.createContext({
    DungeonData: data,
    ...(commonJS ? {module: {exports: {}}, require(file) {
      assert.equal(file, './data.js');
      return data;
    }} : {}),
    Image: class {
      constructor() { images.push(this); }
      set src(value) { this.source = value; }
    },
    document: {createElement(tag) {
      assert.equal(tag, 'canvas');
      const texture = {draws: [], getContext() {
        const stack = []; let filter = 'none';
        return {save() {stack.push(filter);}, restore() {filter = stack.pop();}, translate() {}, rotate() {},
          set filter(value) { filter = texture.filter = value; }, drawImage(image, x, y, w, h, ...destination) {
          assert(x >= 0 && y >= 0 && x + w <= image.naturalWidth && y + h <= image.naturalHeight);
          texture.frame = [image.source, x, y, w, h];
          texture.draws.push({frame: texture.frame, destination, filter});
        }};
      }};
      textures.push(texture);
      return texture;
    }},
  });
  vm.runInContext(source, browser, {filename: 'sprites.js'});
  const factory = commonJS ? browser.module.exports : browser.createSpriteRenderer;
  assert.equal(images.length, 0, 'Loading the module cannot start asset downloads');
  const context = {save() {}, restore() {}, fillRect(...args) { calls.push(['pixel', ...args]); },
    translate(...args) { calls.push(['translate', ...args]); }, scale(...args) { calls.push(['scale', ...args]); },
    drawImage(texture, ...args) { calls.push(['image', texture, ...args]); }};
  function settle(image, ok) {
    image.complete = true;
    if (ok) {
      const png = fs.readFileSync(require.resolve('../dist/' + image.source));
      image.naturalWidth = png.readUInt32BE(16); image.naturalHeight = png.readUInt32BE(20);
      image.onload();
    } else { image.naturalWidth = 0; image.onerror(); }
  }
  return {factory, context, calls, images, textures, settle};
}

(async () => {
  const withoutDOM = createSpriteRenderer();
  assert.equal(await withoutDOM.ready, false);
  assert.equal(await withoutDOM.itemsReady, false);
  assert.equal(await withoutDOM.walkReady, false);
  assert.equal(await withoutDOM.sideWalkReady, false);
  assert.equal(await withoutDOM.directionWalkReady, false);
  assert.equal(withoutDOM.hasAtlas(), false, 'CommonJS remains usable without images or DOM');
  const before = JSON.stringify(data.MONSTERS);
  for (const commonJS of [false, true]) {
    const {factory, context, calls, images, textures, settle} = load(commonJS);
    const art = factory();
    assert.equal(images.length, 5);
    assert.equal(art.hasAtlas(), false);
    assert.equal(art.paintedSprite(context, 'hero', 4, 5, 2, .4, false), false);
    art.sprite(context, 'heroRight', 4, 5, 2, .4, true);
    assert(calls.some(call => call[0] === 'pixel'), 'Unloaded art falls back immediately');
    assert(calls.some(call => call[0] === 'scale' && call[1] === -1), 'Fallback left views are mirrored');
    assert.equal(context.globalAlpha, .4);
    settle(images[0], true); settle(images[1], true); settle(images[2], true); settle(images[3], true); settle(images[4], true);
    assert.equal(await art.ready, true); assert.equal(await art.itemsReady, true);
    assert.equal(await art.walkReady, true);
    assert.equal(await art.sideWalkReady, true);
    assert.equal(art.hasAtlas(), true);
    const directions = data.DIRS.map(direction => {
      const type = art.heroSprite(direction);
      art.sprite(context, type, 0, 0, 3, 1, direction[0] < 0);
      return calls.at(-1)[1].frame.join(':');
    });
    assert.equal(new Set(directions).size, 8, 'Loaded art keeps eight distinct hero views');
    for (const direction of data.DIRS) {
      const poses = [-1,0,2,5].map(frame => {
        calls.length = 0;
        art.sprite(context, art.heroSprite(direction), 0, 0, 3, 1, direction[0]<0, null, frame);
        const image = calls.at(-1), texture = image[1];
        return {body:texture.draws.at(-1), bounds:image.slice(2), width:texture.width, height:texture.height,
          mirrored:calls.some(call => call[0] === 'scale')};
      });
      for (const pose of poses) {
        assert.deepEqual(pose.body, poses[0].body, 'Idle and walking must preserve the exact same head, torso and lantern');
        assert.deepEqual(pose.bounds, poses[0].bounds, 'Idle and walking share scale and ground anchor');
        assert.deepEqual([pose.width,pose.height], [338,484]);
        assert.equal(pose.mirrored, direction[0]<0, 'Idle and walking use the same mirrored direction');
      }
    }
    const count = textures.length;
    art.sprite(context, 'heroRight', 0, 0, 2);
    const firstHeroRight = calls.at(-1)[1];
    art.sprite(context, 'heroRight', 20, 30, 4, .5, true);
    assert.equal(textures.length, count, 'A direction reuses its cropped texture');
    assert.equal(context.globalAlpha, .5);
    assert.equal(context.imageSmoothingQuality, 'high');
    art.sprite(context, 'slime', 0, 0, 2, 1, false, 'mossSlime');
    const base = calls.at(-1)[1];
    const species = Object.keys(data.MONSTERS).find(key => data.MONSTERS[key].type === 'slime' && key !== 'mossSlime');
    art.sprite(context, 'slime', 0, 0, 2, 1, false, species);
    const tinted = textures.at(-1);
    assert.notEqual(tinted, base, 'Species have separate cached artwork');
    assert(tinted.filter.startsWith('hue-rotate('), 'Variant color adjustment survives extraction');
    art.sprite(context, 'slime', 0, 0, 2, 1, false, species);
    assert.equal(textures.at(-1), tinted);
    art.sprite(context, 'lantern', 0, 0, 2);
    assert.equal(calls.at(-1)[1].frame[0], 'art/lantern-items.png', 'Items retain atlas priority');
    const second = factory();
    settle(images[5], true); settle(images[6], true); settle(images[7], true); settle(images[8], true); settle(images[9], true);
    second.sprite(context, 'heroRight', 0, 0, 2);
    assert.notEqual(calls.at(-1)[1], firstHeroRight, 'Renderer instances own their textures');

    for (const [characterOK, itemOK, walkOK] of [[false, false, false], [true, false, false], [false, true, false], [true, true, false]]) {
      const failed = factory(), pair = images.slice(-5);
      settle(pair[0], characterOK); settle(pair[1], itemOK); settle(pair[2], walkOK); settle(pair[3], false); settle(pair[4], false);
      assert.equal(await failed.ready, characterOK); assert.equal(await failed.itemsReady, itemOK);
      assert.equal(failed.hasAtlas(), characterOK);
      calls.length = 0;
      failed.sprite(context, 'hero', 0, 0, 2);
      assert.equal(calls.some(call => call[0] === 'image'), characterOK);
      calls.length = 0;
      failed.sprite(context, 'bread', 0, 0, 2);
      assert.equal(calls.some(call => call[0] === 'image'), itemOK);
      assert(calls.length > 0, 'A failed atlas never prevents the available art or pixel fallback');
      failed.sprite(context, 'heroRight', 0, 0, 2, 1, false, null, 2);
      assert.equal(await failed.walkReady, false, 'Missing walk art falls back to the normal hero');
      calls.length = 0;
      failed.sprite(context, 'heroRight', 0, 0, 2, 1, false, null, -1);
      assert(calls.length > 0, 'The planted pose retains normal-art/pixel fallback when rig images fail');
    }
    const strides = new Set();
    for (const direction of data.DIRS) {
      for (let frame = 0; frame < art.walkFrameCount(art.heroSprite(direction)); frame++) {
        calls.length = 0;
        art.sprite(context, art.heroSprite(direction), 0, 0, 3, 1, direction[0] < 0, null, frame);
        const texture = calls.at(-1)[1];
        assert.equal(texture.frame[0], direction[1] === 0 ? 'art/hero-side-rig.png' : 'art/hero-direction-rig.png');
        strides.add(texture);
        const [x,y,w,h] = calls.at(-1).slice(2);
        assert(x >= 0 && y >= 0 && x + w <= 48.001 && y + h <= 54.001, 'Walking keeps hat, boots and lantern inside the sprite');
        assert.equal(calls.some(call => call[0] === 'scale'), direction[0] < 0, 'Left walking mirrors the corresponding right view');
      }
    }
    assert.equal(strides.size, 30, 'Five canonical views have six poses each, mirrored for the other three directions');
    const feet = [];
    for (let frame = 0; frame < 6; frame++) {
      art.sprite(context, 'heroRight', 0, 0, 3, 1, false, null, frame);
      const draws = calls.at(-1)[1].draws;
      const boots = draws.filter(draw => draw.frame[1] === 1285);
      assert.equal(boots.length, 2, 'Every pose must draw exactly two boots');
      assert.equal(boots[0].filter, 'brightness(.65)', 'The far leg keeps its visual identity');
      assert.equal(boots[1].filter, 'none', 'The near leg keeps its visual identity');
      feet.push(boots.map(boot => boot.destination));
      assert(draws.at(-1).frame[1] === 203, 'The body covers both hip joints');
    }
    assert(feet[0][1][0] > feet[0][0][0], 'Near boot leads on the first contact');
    assert(feet[3][1][0] < feet[3][0][0], 'Far boot leads on the opposite contact');
    for (const frame of [1,2]) {
      assert.equal(feet[frame][1][1], feet[0][1][1], 'Near sole stays grounded during support');
      assert(feet[frame][0][1] < feet[frame][1][1] - 20, 'Far foot lifts during its forward swing');
      assert.equal(feet[frame+3][0][1], feet[3][0][1], 'Far sole stays grounded on the next step');
      assert(feet[frame+3][1][1] < feet[frame+3][0][1] - 20, 'Near foot lifts on the next step');
    }
    assert(feet[1][1][0] > feet[2][1][0] && feet[4][0][0] > feet[5][0][0],
      'Each supporting foot travels backward, instead of sliding forward with the torso');
    for (const type of ['hero', 'heroDownRight', 'heroUpRight', 'heroUp']) {
      const contacts = [0,3].map(frame => {
        art.sprite(context, type, 0, 0, 3, 1, false, null, frame);
        return calls.at(-1)[1].draws.filter(draw => draw.frame[1] === 381 || draw.frame[1] === 961);
      });
      assert(contacts.every(boots => boots.length === 2));
      const axis = type === 'hero' || type === 'heroUp' ? 1 : 0;
      const lead = boots => Math.sign(boots[1].destination[axis] - boots[0].destination[axis]);
      assert.notEqual(lead(contacts[0]), 0);
      assert.equal(lead(contacts[0]), -lead(contacts[1]), `${type} must exchange its leading foot`);
    }
    const sideFailed = factory(), fallbackImages = images.slice(-5);
    for (let i = 0; i < 5; i++) settle(fallbackImages[i], i !== 3);
    assert.equal(await sideFailed.sideWalkReady, false);
    for (let frame = 0; frame < 6; frame++) {
      sideFailed.sprite(context, 'heroRight', 0, 0, 3, 1, false, null, frame);
      assert.equal(calls.at(-1)[1].frame[0], 'art/hero-walk.png', 'A failed side sheet must not make the final two footfalls disappear');
    }
    const directionFailed = factory(), remaining = images.slice(-5);
    for (let i = 0; i < 5; i++) settle(remaining[i], i !== 4);
    assert.equal(await directionFailed.directionWalkReady, false);
    directionFailed.sprite(context, 'hero', 0, 0, 3, 1, false, null, 5);
    assert.equal(calls.at(-1)[1].frame[0], 'art/hero-walk.png');
    directionFailed.sprite(context, 'heroRight', 0, 0, 3, 1, false, null, 5);
    assert.equal(calls.at(-1)[1].frame[0], 'art/hero-side-rig.png', 'A failed direction sheet cannot disable the side rig');
  }
  assert.equal(JSON.stringify(data.MONSTERS), before, 'Sprite rendering cannot mutate species definitions');
  console.log('PASS: browser/CommonJS sprite loading, readiness/failure, direction identity, tint/cache, item priority and pixel fallback.');
})().catch(error => { console.error(error); process.exitCode = 1; });
