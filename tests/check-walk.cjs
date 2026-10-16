const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
require('../dist/engine.js');

function scene(reduced = false, position = [22,15]) {
  const game = new DungeonEngine(73);
  game.tiles.fill(1); [game.player.x,game.player.y] = position;
  const landmark = {kind:'gold', x:position[0], y:position[1]-1, amount:1};
  game.enemies = []; game.items = [landmark]; game.traps = []; game.monsterHouse = null;
  game.visible.fill(true);
  const frames = [], sprites = [], positions = [], markers = [];
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
      sprite:(...args) => sprites.push(args), paintedSprite:(...args) => {markers.push(args); return true;},
      heroSprite:() => 'heroRight', walkFrameCount:() => 6, walkCycleDistance:() => 2, hasAtlas:() => true}),
  });
  vm.runInContext(fs.readFileSync(require.resolve('../dist/renderer.js'), 'utf8'), env);
  const renderer = env.createDungeonRenderer({canvas, minimap:canvas, viewport:canvas, getEngine:() => game, reduced});
  renderer.resize(); renderer.start();
  return {game, renderer, canvas,
    move(at, dx = 1, dy = 0) {now = at; const from = {x:game.player.x,y:game.player.y}; game.move(dx,dy); renderer.movePlayer(from,now);},
    draw(at) {
      now = at; sprites.length = positions.length = markers.length = 0;
      const saved = game.serialize();
      frames.shift()(now);
      assert.equal(game.serialize(), saved, 'Walking must not change game state, RNG, turns or saves');
      const hero = sprites.find(call => call[1] === 'heroRight');
      const marker = markers.find(call => call[1] === 'gold');
      return {stride:hero[8], screen:positions.at(-1),
        x:landmark.x + (positions.at(-1)[0] - 48 - (marker[2] - 12)) / 96};
    },
  };
}
const normal = scene();
assert.equal(normal.draw(1000).stride, -1, 'Standing still uses the planted pose');
normal.move(1000);
const first = normal.draw(1040);
assert(first.x > 22 && first.x < 23, 'A step interpolates between its two floor cells');
const second = normal.draw(1090);
assert.notEqual(first.stride, second.stride, 'The foot pose must actually change during movement');
normal.move(1090);
assert.equal(normal.draw(1090).x, second.x, 'Repeated input cannot snap the hero back to a tile');
assert.notEqual(normal.draw(1130).stride, second.stride, 'Footfall progress continues through repeated input');
const stopped = normal.draw(1250);
assert.equal(stopped.stride, -1); assert.equal(stopped.x, 24, 'Stopping settles on the actual destination');
normal.move(1300); normal.game.attack(); normal.renderer.playEffects(normal.game.effects);
assert.equal(normal.draw(1350).stride, -1, 'An attack takes priority over walking feet');
normal.renderer.reset(); assert.equal(normal.draw(1400).stride, -1, 'Floor/restart reset cancels the walk');
const reduced = scene(true); reduced.move(1000);
assert.equal(reduced.draw(1000).stride, -1); assert.equal(reduced.draw(1000).x, 23);
assert.equal(reduced.renderer.remaining(), 0, 'Reduced motion has neither travel animation nor an input wait');
const single = scene(); single.move(1000);
assert.deepEqual([1005,1060,1115].map(at => single.draw(at).stride), [0,1,2]);
single.draw(1160); single.move(1200);
assert.deepEqual([1205,1260,1315].map(at => single.draw(at).stride), [3,4,5],
  'The second step must use the opposite supporting leg, including after a pause');
// Shared camera projection must remain stable at different refresh rates and across direction changes.
for (const interval of [1000/30, 1000/60, 1000/120]) {
  const tracked = scene(); tracked.draw(1000);
  for (const [at, dx, dy] of [[1000,1,1], [1200,-1,-1], [1400,-1,1], [1600,1,0]]) {
    tracked.move(at,dx,dy);
    for (let elapsed=0; elapsed<=200; elapsed+=interval) {
      const draw = tracked.draw(at+elapsed);
      assert(Math.abs(draw.screen[0]-440)<=.501, 'Camera and interpolated hero share the same horizontal center');
      assert(Math.abs(draw.screen[1]-(tracked.canvas.height/2+96*.3))<=.501, 'Diagonal tracking cannot wobble vertically');
    }
    assert.equal(tracked.draw(at+200).x, tracked.game.player.x, 'The camera stops when travel stops');
  }
}
for (const [position, direction] of [[[3,3],[-1,-1]], [[DungeonData.W-4,DungeonData.H-4],[1,1]]]) {
  const edge = scene(false,position); edge.draw(1000);
  for (const [at, sign] of [[1000,1],[1300,-1]]) {
    const dx = direction[0]*sign, dy = direction[1]*sign;
    edge.move(at,dx,dy);
    let previous = edge.draw(at).screen;
    for (const elapsed of [40,80,120,160,200,250]) {
      const current = edge.draw(at+elapsed).screen;
      assert((current[0]-previous[0])*dx>=-.001 && (current[1]-previous[1])*dy>=-.001,
        'At map edges the hero travels monotonically instead of reversing as the camera catches up');
      if (elapsed>=200) assert.deepEqual(current,previous,'No camera drift after the step ends at a map edge');
      previous = current;
    }
  }
}
console.log('PASS: walking poses, continuous input, stopping/attack/reset, stable 30/60/120Hz camera, map edges, reduced motion and game/save isolation.');
