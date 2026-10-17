// Run against a local server: node tests/check-player-ui-browser.cjs http://127.0.0.1:8766
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const session = `lantern-player-ui-${process.pid}`;
const url = process.argv[2];
assert(url && new URL(url).hostname === '127.0.0.1', 'Use an isolated local test server');
const browser = (...args) => {
  const result = JSON.parse(execFileSync('agent-browser', ['--session', session, '--json', ...args], {encoding:'utf8'}));
  assert(result.success, result.error);
  return result.data;
};
const evaluate = code => browser('eval', code).result;
const text = () => evaluate('document.querySelector("#modal").innerText');
const close = () => browser('press', 'Escape');
function fixture(body, resetJournal = false) {
  evaluate(`(() => {
    const e = new DungeonEngine(1015, 'depths', true), p = e.player;
    const room = e.roomAt(p.x, p.y); p.x = room.cx; p.y = room.cy;
    e.enemies = []; e.items = []; e.traps = []; e.monsterHouse = null;
    ${body}
    e.reveal();
    const saved = e.serialize();
    if (!DungeonEngine.restore(saved)) throw new Error('Invalid UI fixture');
    localStorage.setItem('lantern-dungeon-v1', saved);
    ${resetJournal ? "localStorage.removeItem('lantern-dungeon-monsters-v1');" : ''}
    Storage.prototype.setItem = () => {};
  })()`);
  browser('reload');
}
try {
  browser('open', url);
  browser('set', 'viewport', '390', '844');
  fixture(`
    for (const [species, dx] of [['mossSlime', 1], ['coinMimic', -1]]) {
      e.enemies.push({...DungeonData.monsterStats(species), hp:DungeonData.MONSTERS[species].hp,
        id:e.enemies.length, x:p.x+dx, y:p.y, awake:false, revealed:false});
    }
  `, true);
  browser('click', '#world-button');
  browser('click', '#world-monsters');
  assert(text().includes('苔スライム'));
  assert(!/ミミック|番人|HP|攻撃力|経験値/.test(text()), 'The journal must not reveal unseen identities or raw stats');
  assert(text().includes(evaluate('DungeonData.MONSTERS.mossSlime.feature')));
  assert(text().includes(evaluate('DungeonData.MONSTERS.mossSlime.counter')));
  close();
  fixture('');
  browser('click', '#world-button'); browser('click', '#world-monsters');
  assert(text().includes('苔スライム'), 'Encounter records survive reloads and replacement adventures'); close();
  fixture(`e.enemies = [{...DungeonData.monsterStats('coinMimic'), hp:20, id:0, x:p.x+1, y:p.y, awake:true, revealed:true}];`);
  browser('click', '#world-button'); browser('click', '#world-monsters');
  assert(text().includes('金貨ミミック'), 'A revealed mimic can enter the journal'); close();
  console.log('PASS: encountered-only journal, mimic privacy and persistence.');
  for (const [width, height] of [[390,844], [320,568]]) {
    browser('set', 'viewport', String(width), String(height));
    fixture(`
      p.hp = 8; p.hunger = 15;
      p.bag = ['identify','map','arrow','arrow',...Array.from({length:19},()=>({kind:'shield',rank:0,bonus:0,cursed:false,identified:true}))];
      e.identification.known = ['identify'];
      e.items = [{...p.equipment.weapon, x:p.x, y:p.y, amount:1, identified:false}];
    `);
    const state = evaluate(`({hint:document.getElementById('location-hint').innerText,
      hintVisible:document.getElementById('location-hint').checkVisibility(),
      ground:document.getElementById('ground-item-button').checkVisibility(),
      progress:document.getElementById('mobile-progress').innerText,
      progressVisible:document.getElementById('mobile-progress').checkVisibility(),
      saveVisible:document.querySelector('.save-status').checkVisibility(),
      overflow:document.documentElement.scrollWidth > innerWidth})`);
    assert(state.hintVisible && state.ground && state.progressVisible && !state.saveVisible && !state.overflow);
    assert(state.hint.includes('体力が少ない') && state.hint.includes('お腹が空いてきた'));
    assert(state.progress.includes('Lv.1') && state.progress.includes('矢 2本'));
    browser('click', '#ground-item-button');
    assert(!/ターン|時間が進|品名を選んで操作|補正値/.test(text())); close();
    browser('click', '#bag-button');
    assert(/攻撃力 5.*防御力 1.*矢 2本/.test(text()));
    assert(!/ターン|時間が進|品名を選んで操作/.test(text())); close();
    browser('click', '#help-button'); assert(!/ターン|時間が進|全階で同じ確率/.test(text())); close();
    console.log(`PASS: survival warnings, mobile stats and player-facing copy at ${width}px.`);
  }
  // An actual action still advances the original game rules; failures remain visible.
  const before = evaluate('window.lanternGame.snapshot().state.turn');
  evaluate(`Storage.prototype.setItem = () => { throw new Error('Storage unavailable'); };`);
  browser('click', '#wait-button');
  assert.equal(evaluate('window.lanternGame.snapshot().state.turn'), before + 1);
  assert(evaluate('document.querySelector(".save-status").checkVisibility()'));
  assert(evaluate('document.getElementById("save-label").innerText').includes('保存できません'));
  console.log('PASS: encountered-only journal, mimic privacy, persistent encounters, survival/ground coexistence, mobile stats, no action-cost copy, unchanged turns and visible storage failures at 390/320px.');
} finally {
  browser('close');
}
