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
      const texture = {getContext() {
        return {set filter(value) { texture.filter = value; }, drawImage(image, x, y, w, h) {
          assert(x >= 0 && y >= 0 && x + w <= image.naturalWidth && y + h <= image.naturalHeight);
          texture.frame = [image.source, x, y, w, h];
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
  assert.equal(withoutDOM.hasAtlas(), false, 'CommonJS remains usable without images or DOM');
  const before = JSON.stringify(data.MONSTERS);
  for (const commonJS of [false, true]) {
    const {factory, context, calls, images, textures, settle} = load(commonJS);
    const art = factory();
    assert.equal(images.length, 4);
    assert.equal(art.hasAtlas(), false);
    assert.equal(art.paintedSprite(context, 'hero', 4, 5, 2, .4, false), false);
    art.sprite(context, 'heroRight', 4, 5, 2, .4, true);
    assert(calls.some(call => call[0] === 'pixel'), 'Unloaded art falls back immediately');
    assert(calls.some(call => call[0] === 'scale' && call[1] === -1), 'Fallback left views are mirrored');
    assert.equal(context.globalAlpha, .4);
    settle(images[0], true); settle(images[1], true); settle(images[2], true); settle(images[3], true);
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
    settle(images[4], true); settle(images[5], true); settle(images[6], true); settle(images[7], true);
    second.sprite(context, 'heroRight', 0, 0, 2);
    assert.notEqual(calls.at(-1)[1], firstHeroRight, 'Renderer instances own their textures');

    for (const [characterOK, itemOK, walkOK] of [[false, false, false], [true, false, false], [false, true, false], [true, true, false]]) {
      const failed = factory(), pair = images.slice(-4);
      settle(pair[0], characterOK); settle(pair[1], itemOK); settle(pair[2], walkOK); settle(pair[3], false);
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
    }
    const strides = new Set();
    for (const direction of data.DIRS) {
      for (let frame = 0; frame < art.walkFrameCount(art.heroSprite(direction)); frame++) {
        calls.length = 0;
        art.sprite(context, art.heroSprite(direction), 0, 0, 3, 1, direction[0] < 0, null, frame);
        const texture = calls.at(-1)[1];
        assert.equal(texture.frame[0], direction[1] === 0 ? 'art/hero-side-walk.png' : 'art/hero-walk.png');
        strides.add(texture.frame.join(':'));
        const [x,y,w,h] = calls.at(-1).slice(2);
        assert(x >= 0 && y >= 0 && x + w <= 48.001 && y + h <= 54.001, 'Walking keeps hat, boots and lantern inside the sprite');
        assert.equal(calls.some(call => call[0] === 'scale'), direction[0] < 0, 'Left walking mirrors the corresponding right view');
      }
    }
    assert.equal(strides.size, 22, 'Horizontal walking has six footfalls; other directions keep four mirrored strides');
    const sideFailed = factory(), fallbackImages = images.slice(-4);
    for (let i = 0; i < 4; i++) settle(fallbackImages[i], i !== 3);
    assert.equal(await sideFailed.sideWalkReady, false);
    for (let frame = 0; frame < 6; frame++) {
      sideFailed.sprite(context, 'heroRight', 0, 0, 3, 1, false, null, frame);
      assert.equal(calls.at(-1)[1].frame[0], 'art/hero-walk.png', 'A failed side sheet must not make the final two footfalls disappear');
    }
  }
  assert.equal(JSON.stringify(data.MONSTERS), before, 'Sprite rendering cannot mutate species definitions');
  console.log('PASS: browser/CommonJS sprite loading, readiness/failure, direction identity, tint/cache, item priority and pixel fallback.');
})().catch(error => { console.error(error); process.exitCode = 1; });
