const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
require('../dist/engine.js');

function scene(reduced = false) {
  const game = new DungeonEngine(73);
  game.tiles.fill(1); game.player.x = 22; game.player.y = 15;
  game.enemies = []; game.items = []; game.traps = []; game.monsterHouse = null;
  const frames = [], sprites = [], positions = [];
  let now = 1000;
  const context = new Proxy({}, {
    get: (_, key) => key === 'createRadialGradient' ? () => ({addColorStop() {}}) : (...args) => {
      assert(args.filter(value => typeof value === 'number').every(Number.isFinite));
      if (key === 'translate') positions.push(args);
    }, set: () => true,
  });
  const canvas = {width:880, height:576, getContext:() => context,
    getBoundingClientRect:() => ({left:0, top:0, width:390, height:350})};
  const env = vm.createContext({DungeonData, performance:{now:() => now},
    requestAnimationFrame:callback => frames.push(callback),
    createSpriteRenderer:() => ({ready:Promise.resolve(true), itemsReady:Promise.resolve(true), walkReady:Promise.resolve(true),
      sprite:(...args) => sprites.push(args), paintedSprite:() => false,
      heroSprite:() => 'heroRight', hasAtlas:() => true}),
  });
  vm.runInContext(fs.readFileSync(require.resolve('../dist/renderer.js'), 'utf8'), env);
  const renderer = env.createDungeonRenderer({canvas, minimap:canvas, viewport:canvas, getEngine:() => game, reduced});
  renderer.resize(); renderer.start();
  return {game, renderer,
    move(at) {now = at; const from = {x:game.player.x,y:game.player.y}; game.move(1,0); renderer.movePlayer(from,now);},
    draw(at) {
      now = at; sprites.length = positions.length = 0;
      const saved = game.serialize();
      // Keep the camera on the destination to measure the hero's interpolated world position.
      renderer.setCloseView(true); frames.shift()(now);
      assert.equal(game.serialize(), saved, 'Walking must not change game state, RNG, turns or saves');
      const hero = sprites.find(call => call[1] === 'heroRight');
      return {stride:hero[8], x:game.player.x + (positions.at(-1)[0] - canvas.width / 2) / 96};
    },
  };
}
const normal = scene();
assert.equal(normal.draw(1000).stride, null, 'Standing still cannot cycle feet');
normal.move(1000);
const first = normal.draw(1040);
assert(first.x > 22 && first.x < 23, 'A step interpolates between its two floor cells');
const second = normal.draw(1090);
assert.notEqual(first.stride, second.stride, 'The foot pose must actually change during movement');
normal.move(1090);
assert.equal(normal.draw(1090).x, second.x, 'Repeated input cannot snap the hero back to a tile');
const strides = new Set([first.stride, second.stride, normal.draw(1170).stride, normal.draw(1210).stride]);
assert.equal(strides.size, 4, 'Continuous steps alternate all four foot poses');
const stopped = normal.draw(1250);
assert.equal(stopped.stride, null); assert.equal(stopped.x, 24, 'Stopping settles on the actual destination');
normal.move(1300); normal.game.attack(); normal.renderer.playEffects(normal.game.effects);
assert.equal(normal.draw(1350).stride, null, 'An attack takes priority over walking feet');
normal.renderer.reset(); assert.equal(normal.draw(1400).stride, null, 'Floor/restart reset cancels the walk');
const reduced = scene(true); reduced.move(1000);
assert.equal(reduced.draw(1000).stride, null); assert.equal(reduced.draw(1000).x, 23);
assert.equal(reduced.renderer.remaining(), 0, 'Reduced motion has neither travel animation nor an input wait');
console.log('PASS: alternating walking poses, continuous input, stopping/attack/reset, reduced motion and game/save isolation.');
