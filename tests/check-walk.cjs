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
      heroSprite:() => 'heroRight', walkFrameCount:() => 12, walkCycleDistance:() => 2, hasAtlas:() => true}),
  });
  vm.runInContext(fs.readFileSync(require.resolve('../dist/renderer.js'), 'utf8'), env);
  const renderer = env.createDungeonRenderer({canvas, minimap:canvas, viewport:canvas, getEngine:() => game, reduced});
  renderer.resize(); renderer.start();
  return {game, renderer, canvas, sprites, positions,
    move(at, dx = 1, dy = 0) {now = at; const from = {x:game.player.x,y:game.player.y}; game.move(dx,dy); renderer.movePlayer(from,now);},
    draw(at) {
      now = at; sprites.length = positions.length = markers.length = 0;
      const saved = game.serialize();
      frames.shift()(now);
      assert.equal(game.serialize(), saved, 'Walking must not change game state, RNG, turns or saves');
      const hero = sprites.find(call => call[1] === 'heroRight');
      const marker = markers.find(call => call[1] === 'gold');
      return {stride:hero[8], blend:hero[9], screen:positions.at(-1),
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
const arrived = normal.draw(1250);
assert.equal(arrived.x, 24, 'Stopping settles on the actual destination');
assert.equal(arrived.stride, 3, 'Arrival rests on the passing pose instead of a wide contact stance');
assert(normal.draw(1300).blend < arrived.blend, 'The legs blend into the standing pose instead of snapping');
const stopped = normal.draw(1370);
assert.equal(stopped.stride, -1); assert.equal(stopped.x, 24);
normal.move(1400); normal.game.attack(); normal.renderer.playEffects(normal.game.effects);
assert.equal(normal.draw(1450).stride, -1, 'An attack takes priority over walking feet');
normal.renderer.reset(); assert.equal(normal.draw(1500).stride, -1, 'Floor/restart reset cancels the walk');
const reduced = scene(true); reduced.move(1000);
assert.equal(reduced.draw(1000).stride, -1); assert.equal(reduced.draw(1000).x, 23);
assert.equal(reduced.renderer.remaining(), 0, 'Reduced motion has neither travel animation nor an input wait');
const single = scene(); single.move(1000);
const starts = [1005,1060,1115].map(at => single.draw(at));
assert.deepEqual(starts.map(draw => draw.stride), [3,5,7], 'A step passes through contact between two passing poses');
assert(starts[0].blend < 1 && starts[2].blend === 1, 'The legs ease in from the standing pose');
single.draw(1160); single.draw(1400); single.move(1400);
assert.deepEqual([1405,1460,1515].map(at => single.draw(at).stride), [9,11,1],
  'The second step must use the opposite supporting leg, including after a pause');
const diagonal = scene(); diagonal.move(1000, 1, 1);
assert.equal(diagonal.draw(1160).stride, 9, 'A diagonal cell is one full step, ending on the passing pose');
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
// Enemies glide between cells with a hop, and snap when they first appear or warp far away.
const watched = scene();
const foe = {id:7, type:'slime', species:'mossSlime', x:25, y:15, hp:5, maxHp:5};
watched.game.enemies = [foe];
function foeAt(at) {
  watched.draw(at);
  const call = watched.sprites.find(args => args[1] === 'slime');
  return {screen:watched.positions[watched.sprites.indexOf(call)], lift:call[3]};
}
const resting = foeAt(1000);
foe.x = 26; foeAt(1016);
const gliding = foeAt(1100);
assert(gliding.screen[0] > resting.screen[0] && gliding.screen[0] < resting.screen[0] + 96, 'Enemy steps interpolate between cells');
assert(gliding.lift < resting.lift - 96 * .05, 'Enemy steps hop instead of sliding flat');
assert.equal(foeAt(1300).screen[0], resting.screen[0] + 96, 'Enemy steps end exactly on the destination cell');
foe.x = 20; assert.equal(foeAt(1316).screen[0], resting.screen[0] - 5 * 96, 'Warps snap instead of streaking across the room');
const still = scene(true); still.game.enemies = [{...foe, x:25}]; still.draw(1000);
still.game.enemies[0].x = 26; still.draw(1016);
assert.equal(still.positions[still.sprites.findIndex(args => args[1] === 'slime')][0] - still.positions.at(-1)[0], 96 * 4,
  'Reduced motion moves enemies without animation');
console.log('PASS: walking poses, continuous input, stopping/attack/reset, stable 30/60/120Hz camera, map edges, reduced motion and game/save isolation.');
