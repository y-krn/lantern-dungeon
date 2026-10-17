const assert = require('node:assert/strict');
const { isDeepStrictEqual } = require('node:util');
require('../dist/engine.js');

function fixtures() {
  const make = () => {
    const e = new DungeonEngine(901), p = e.player, room = e.roomAt(p.x, p.y);
    p.x = room.cx; p.y = room.cy;
    e.enemies = []; e.items = []; e.traps = []; e.monsterHouse = null; e.log = [];
    return e;
  };
  const gear = (identified = false) => ({ kind: 'weapon', rank: 1, bonus: 2, cursed: false, identified });
  const entries = [];
  for (const kind of ['bread', 'potion']) {
    const e = make(), p = e.player;
    p.bag = Array.from({length:18},()=>({kind:'shield',rank:0,bonus:0,cursed:false,identified:true})); p.hp = 5; p.hunger = 20;
    e.items = [{ kind, x: p.x, y: p.y, amount: 1, discovered: true }];
    entries.push([`full-capacity-${kind}`, e]);
  }
  const exchange = make(); exchange.player.bag = Array.from({length:18},()=>({kind:'shield',rank:0,bonus:0,cursed:false,identified:true}));
  exchange.items = [{ kind: 'potion', x: exchange.player.x, y: exchange.player.y, amount: 1, discovered: true }];
  entries.push(['full-capacity-exchange', exchange]);
  const identify = make(); identify.player.bag = ['identify', gear(), 'bread'];
  entries.push(['identify-cancel-equip', identify]);
  const curse = make(); curse.player.equipment.weapon.cursed = true; curse.player.bag = [gear(true), 'uncurse'];
  entries.push(['curse-uncurse-equip', curse]);
  const house = make(), room = house.rooms[0];
  let entrance;
  for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++)
    for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      if (house.tile(x, y) && house.tile(x - dx, y - dy) && house.roomAt(x - dx, y - dy) !== room
        && house.canStep(x - dx, y - dy, dx, dy)) entrance ||= { x: x - dx, y: y - dy, dx, dy };
    }
  assert(entrance, 'Fixture needs a connected room entrance');
  Object.assign(house.player, { x: entrance.x, y: entrance.y });
  house.monsterHouse = { room: 0, triggered: false };
  house.enemies = [{ ...DungeonData.monsterStats('mossSlime'), id: 1, hp: DungeonData.MONSTERS.mossSlime.hp,
    x: room.cx, y: room.cy, house: true, awake: false }];
  entries.push(['monster-house', house, { dx: entrance.dx, dy: entrance.dy }]);
  const death = make(); death.player.hp = 1; death.player.hunger = 0; death.player.bag = [];
  entries.push(['death-retry', death]);
  const win = make(); win.floor = 10; win.generateFloor();
  const boss = win.enemies.find(e => e.type === 'guardian'); assert(boss);
  win.enemies = [boss]; win.items = []; win.traps = []; win.monsterHouse = null;
  Object.assign(win.player, win.stairs); boss.hp = 1; boss.awake = false;
  const direction = DungeonData.DIRS.find(([dx, dy]) => win.canStep(win.player.x, win.player.y, dx, dy));
  Object.assign(boss, { x: win.player.x + direction[0], y: win.player.y + direction[1] });
  entries.push(['victory-depths-unlock', win, { dx: direction[0], dy: direction[1] }]);
  return entries.map(([name, e, input]) => {
    e.seen.fill(false); e.reveal();
    const save = JSON.parse(e.serialize()), restored = DungeonEngine.restore(JSON.stringify(save));
    assert(restored, `Invalid fixture: ${name}`);
    assert.deepEqual(JSON.parse(restored.serialize()), save, `Fixture must restore without migration: ${name}`);
    return { name, save, input };
  });
}

async function runScenarios({ ab, evaluate, screenshot, write, resumedSave }) {
  const results = [];
  let active;
  const snapshot = () => evaluate('window.lanternGame.snapshot()');
  const state = async () => (await snapshot()).state;
  const check = (condition, label) => { active.checks[label] = !!condition; assert(condition, label); };
  const same = (a, b, label) => check(isDeepStrictEqual(a, b), label);
  const ready = () => ab('wait', '--fn', 'window.lanternGame.status !== "playing" || document.querySelector("#modal").open || window.lanternGame.inputReady');
  const click = async selector => {
    const before = await snapshot();
    await ab('click', selector); await ready();
    active.steps.push({ selector, before, after: await snapshot() });
  };
  const item = async (index, action = 'use') => {
    if (!await evaluate('document.querySelector("#modal").open')) await click('#bag-button');
    const selector = `[data-item-action="${action}"][data-index="${index}"]`;
    const open = await evaluate(`document.querySelector(${JSON.stringify(selector)})?.closest('details')?.open`);
    if (!open) await click(`.bag-entry:has(${selector}) > summary`);
    await click(selector);
  };
  const reload = async () => {
    const before = await snapshot(); await ab('reload'); await ab('wait', '--fn', '!!window.lanternGame');
    same(await snapshot(), resumedSave(before), 'save-reload');
  };
  for (const fixture of fixtures()) {
    active = { name: fixture.name, checks: {}, steps: [] }; results.push(active);
    try {
      write(`scenario-${fixture.name}-initial.json`, fixture.save);
      // Suppress only the outgoing page's autosave; a reload restores native Storage methods.
      await evaluate(`localStorage.setItem('lantern-dungeon-v1', ${JSON.stringify(JSON.stringify(fixture.save))});
        localStorage.removeItem('lantern-dungeon-progress-v1'); localStorage.removeItem('lantern-dungeon-monsters-v1');
        Storage.prototype.setItem = () => {}; true`);
      await ab('reload'); await ab('wait', '--fn', '!!window.lanternGame');
      same(await snapshot(), resumedSave(fixture.save), 'fixture-loaded');
      await ready(); await screenshot(`scenario-${fixture.name}-before.png`);
      const before = await state();
      if (fixture.name === 'full-capacity-bread' || fixture.name === 'full-capacity-potion') {
        check(before.player.bag.length + 2 === 20, 'capacity-20');
        await click('#ground-use-button');
        const after = await state();
        check(after.turn === before.turn + 1 && after.items.length === 0, 'ground-use-one-turn');
        same(after.player.bag, before.player.bag, 'bag-preserved');
        check(fixture.name.endsWith('bread') ? after.player.hunger === 70 : after.player.hp === 30, 'ground-effect');
      } else if (fixture.name === 'full-capacity-exchange') {
        await click('#ground-item-button'); await click('[data-item-action="exchange"][data-index="ground"]');
        same(await state(), before, 'exchange-selection-free');
        await click('#exchange-cancel'); same(await state(), before, 'exchange-cancel-free');
        await click('[data-item-action="exchange"][data-index="ground"]'); await click('[data-exchange="0"]');
        const after = await state();
        check(after.turn === before.turn + 1 && after.player.bag.length === 18, 'exchange-one-turn-capacity');
        same(after.player.bag, [...before.player.bag.slice(1), 'potion'], 'exchange-preserves-bag-order');
        check(after.items[0].kind === 'bread' && after.items[0].amount === 1, 'exchange-conserves-items');
      } else if (fixture.name === 'identify-cancel-equip') {
        await item(0); same(await state(), before, 'identify-selection-free');
        await screenshot(`scenario-${fixture.name}-selection.png`);
        await click('#identify-cancel'); same(await state(), before, 'identify-cancel-free');
        await item(0); await click('[data-target="1"]');
        const identified = await state();
        check(identified.turn === before.turn + 1 && identified.player.bag[0].identified && !identified.player.bag.includes('identify'), 'identify-consumes-one');
        await item(0); const after = await state();
        check(after.turn === before.turn + 2 && after.player.equipment.weapon.rank === 1 && after.player.equipment.weapon.bonus === 2, 'identified-gear-equipped');
      } else if (fixture.name === 'curse-uncurse-equip') {
        await item(0); const blocked = await state();
        check(blocked.turn === before.turn, 'curse-blocks-turn');
        same(blocked.player.equipment, before.player.equipment, 'curse-blocks-equipment');
        same(blocked.player.bag, before.player.bag, 'curse-blocks-consumption');
        await item(1); check(!(await state()).player.equipment.weapon.cursed, 'uncurse-clears-curse');
        await item(0); const after = await state();
        check(after.turn === before.turn + 2 && after.player.equipment.weapon.rank === 1, 'uncursed-slot-equips');
      } else if (fixture.name === 'monster-house') {
        check(!before.monsterHouse.triggered && before.enemies.every(e => !e.awake), 'house-dormant');
        await click(`[data-direction="${fixture.input.dx},${fixture.input.dy}"]`);
        const after = await state();
        check(after.turn === before.turn + 1 && after.monsterHouse.triggered && after.enemies.every(e => e.awake), 'house-entry-wakes-pack');
      } else if (fixture.name === 'death-retry') {
        await click('#wait-button'); check((await state()).status === 'dead', 'starvation-death');
        await ab('wait', '--fn', 'document.querySelector("#modal").open');
        await screenshot(`scenario-${fixture.name}-result.png`);
        await click('#restart-end'); const after = await state();
        check(after.status === 'playing' && after.floor === 1 && after.turn === 0 && after.player.hp === 30, 'retry-starts-new-run');
      } else if (fixture.name === 'victory-depths-unlock') {
        await click('#new-game-button');
        check(await evaluate('document.querySelector("[data-dungeon=depths]").disabled'), 'depths-initially-locked');
        await click('#modal .close-modal');
        await click(`[data-direction="${fixture.input.dx},${fixture.input.dy}"]`);
        const won = await state();
        check(won.status === 'won' && won.tutorialCleared && won.enemies.every(e => e.type !== 'guardian'), 'guardian-kill-wins');
        check(await evaluate('localStorage.getItem("lantern-dungeon-progress-v1") === "true"'), 'unlock-persisted');
        await ab('wait', '--fn', 'document.querySelector("#modal").open');
        await screenshot(`scenario-${fixture.name}-result.png`);
        await click('#restart-end'); const after = await state();
        check(after.dungeon === 'depths' && after.tutorialCleared && after.floor === 1, 'restart-enters-depths');
      }
      await screenshot(`scenario-${fixture.name}-after.png`);
      await reload(); active.final = await snapshot();
    } catch (error) {
      active.error = error.message;
      try { active.final = await snapshot(); await screenshot(`scenario-${fixture.name}-failure.png`); } catch { /* Keep the original failure. */ }
    }
    write(`scenario-${fixture.name}.json`, active);
  }
  write('scenarios.json', results);
  return results;
}
module.exports = runScenarios;
module.exports.fixtures = fixtures;
