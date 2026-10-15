const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { createHash } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify, isDeepStrictEqual } = require('node:util');
const exec = promisify(execFile);
const createPolicy = require('./playtest-policy.cjs');
const runScenarios = require('./playtest-scenarios.cjs');
require('../dist/engine.js');
const root = path.resolve(__dirname, '..');

function resumedSave(save) {
  const result = structuredClone(save);
  if (result.state.status === 'playing') result.state.log = [
    { text: 'ランタンを灯し直した。冒険の続きへ。', type: 'good', turn: result.state.turn },
    ...result.state.log,
  ].slice(0, 40);
  return result;
}

function markdownReport(report) {
  const lines = ['# ブラウザ自動プレイ結果', '',
    `基準コミット: \`${report.revision}\`。作業ツリー変更: ${report.dirty ? 'あり（sourceHashesで実行ソースを識別）' : 'なし'}。`,
    `条件: ${report.config.dungeon}、${report.config.viewport.join('×')} CSS px、行動間隔 ${report.config.delay} ms、最大 ${report.config.maxTurns} ターン。`,
    '', '探索は発見済み情報に限定しています。自動プレイはDOMクリック、主要ダイアログの確認はブラウザのポインター入力です。', ''];
  for (const run of report.runs) {
    const m = run.metrics, dir = `${run.dungeon}-${run.seed}`;
    lines.push(`## シード ${run.seed}`, '',
      `停止: ${run.stop}。${run.final ? `${run.final.floor}階 / ${run.final.turn}ターン / HP ${run.final.hp} / 満腹度 ${run.final.hunger}。` : ''}`,
      `行動 ${m.actions}、再訪移動 ${m.revisitedMoves}、進展のない往復 ${m.oscillationMoves}、低HPターン ${m.lowHpTurns}、空腹ターン ${m.starvingTurns}、入力停滞 ${m.stalledInputs}。`,
      `判断理由: ${JSON.stringify(m.reasons)}。`,
      `検証: ${JSON.stringify(run.checks)}。実行エラー: ${run.error || 'なし'}。`, '',
      `[詳細](${dir}/run.json) / [初期セーブ](${dir}/initial-save.json)` + (m.actions ? ` / [行動履歴](${dir}/actions.jsonl)` : ''), '');
    if (run.motionFrames) lines.push(`動きの記録: ${run.motionFrames}フレーム。[時刻・向き・画像の対応](${dir}/motion.jsonl)。通常速度と低速で再生して目視確認するための資料で、歩行の自然さを自動判定するものではありません。`, '');
    if (run.artifacts.includes(`${dir}/end.png`)) lines.push(`![終了状態](${dir}/end.png)`, '');
  }
  if (report.scenarios.length) {
    lines.push('## 条件別ブラウザ検証', '');
    for (const scenario of report.scenarios) lines.push(`- ${scenario.name}: ${scenario.error ? `失敗 — ${scenario.error}` : '通過'}。`);
    lines.push('', '条件別検証は専用セーブから開始します。通常探索での到達・クリア率とは分けて集計します。',
      `[条件別の操作履歴](${report.config.dungeon}-${report.config.seeds[0]}/scenarios.json)`, '');
  }
  lines.push('## 結果の読み方', '',
    '- dead / won はゲームの結果です。turn-limit / action-limit は打切りで、クリア失敗の判定ではありません。',
    '- no-known-route は方策の限界です。既知の罠を避けると通れない経路もあり、生成不具合とは断定できません。',
    '- scenario-only は条件別検証だけを実行した結果です。通常探索の成績ではありません。',
    '- driver-error / input-stalled / 検証不一致 / ブラウザエラーは実行失敗です。終了コード1で通知します。',
    '- 再訪移動は寄り道や帰路も含みます。行動履歴の判断理由と合わせて確認してください。',
    '- 進展のない往復は、発見・敵HPや位置・所持品・経験値などに変化がないABABA移動です。戦術上必要な動きも含むため、不具合件数には読み替えません。',
    '- netHpLoss は行動前後のHP減少の合計です。同一ターンの回復で相殺されるため、被ダメージ総量ではありません。',
    '', '## 次に調べる改善点', '',
    '1. 探索と階段の選択: 再訪が多い箇所の行動履歴を見て、補給のための寄り道と方策の往復を分けます。',
    '2. 戦闘と補給: 死亡直前のHP・満腹度・残った道具・予告回避を確認し、方策の使い残しを除いてから配置や数値を比較します。',
    '3. 条件付きUI: --scenarios only で満杯、鑑定取消、呪い、モンスターハウス、死亡、勝利、深淵解放を独立検証します。専用セーブによる通過と通常探索の結果を混ぜません。',
    '4. 体験評価: 選択の納得感、敵の見分け、演出の読みやすさは通常速度の人間プレイで確認します。自動到達率だけでは評価できません。',
    '', '[機械可読サマリー](summary.json)', '');
  return lines.join('\n');
}

function options(args) {
  const result = { seeds: [101, 102, 103], maxTurns: 600, maxActions: 1000, delay: 120, viewport: [390, 844], dungeon: 'tutorial', out: 'output/playtest', scenarios: 'off', motion: 'off' };
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i], value = args[i + 1];
    if (!value) throw new Error(`Missing value: ${name}`);
    if (name === '--seeds') result.seeds = value.split(',').map(Number);
    else if (name === '--viewport') result.viewport = value.split('x').map(Number);
    else if (name === '--dungeon') result.dungeon = value;
    else if (name === '--out') result.out = value;
    else if (name === '--scenarios') result.scenarios = value;
    else if (name === '--motion') result.motion = value;
    else if (['--max-turns', '--max-actions', '--delay'].includes(name))
      result[{ '--max-turns': 'maxTurns', '--max-actions': 'maxActions', '--delay': 'delay' }[name]] = Number(value);
    else throw new Error(`Unknown option: ${name}`);
  }
  if (!result.seeds.length || result.seeds.length > 100 || new Set(result.seeds).size !== result.seeds.length || result.seeds.some(n => !Number.isInteger(n) || n < 0 || n > 0xffffffff)) throw new Error('Use 1–100 distinct comma-separated uint32 seeds');
  if (result.viewport.length !== 2 || result.viewport.some(n => !Number.isInteger(n) || n < 240 || n > 3000)) throw new Error('Invalid viewport');
  if (!['tutorial', 'depths'].includes(result.dungeon)) throw new Error('Invalid dungeon');
  if (!['off', 'only', 'with-play'].includes(result.scenarios)) throw new Error('Invalid scenarios mode');
  if (!['off', 'on'].includes(result.motion)) throw new Error('Invalid motion capture mode');
  for (const k of ['maxTurns', 'maxActions', 'delay']) if (!Number.isInteger(result[k]) || result[k] < (k === 'delay' ? 110 : 1) || result[k] > (k === 'delay' ? 5000 : 100000)) throw new Error(`Invalid ${k}`);
  return result;
}

// Run in the page, using production UI handlers. No engine mutation after fixture loading.
async function playBatch(limit, delay, maxTurns, maxActions) {
  const t = window.__playtest, rows = [];
  const click = selector => {
    const button = document.querySelector(selector);
    if (!button || button.disabled || button.hidden) throw new Error(`Unavailable control: ${selector}`);
    button.click();
  };
  const brief = o => ({ floor: o.floor, turn: o.turn, status: o.status, player: o.player,
    explored: o.tiles.filter(v => v !== null).length, visibleEnemies: o.enemies, knownItems: o.items.length });
  let error;
  try {
    for (let i = 0; i < limit && !t.stop; i++) {
      const before = t.policy.observe(window.lanternGame.snapshot().state);
      if (before.status !== 'playing') { t.stop = before.status; break; }
      if (before.turn >= maxTurns) { t.stop = 'turn-limit'; break; }
      if (t.actions >= maxActions) { t.stop = 'action-limit'; break; }
      const deadline = performance.now() + 5000;
      while (!window.lanternGame.inputReady) {
        if (performance.now() > deadline) throw new Error('Input readiness timed out');
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      const action = t.policy.choose(before, t.memory);
      if (action.type === 'stop') { t.stop = action.reason; break; }
      await new Promise(resolve => setTimeout(resolve, delay));
      if (document.querySelector('#modal').open) throw new Error('Unexpected open dialog');
      if (action.type === 'move') click(`[data-direction="${action.dx},${action.dy}"]`);
      else if (action.type === 'face') {
        click('#turn-button'); click(`[data-direction="${action.dx},${action.dy}"]`); click('#turn-button');
      } else if (action.type === 'button') click(action.selector);
      else if (action.type === 'item') {
        click('#bag-button');
        const selector = `[data-item-action="${action.action}"][data-index="${action.index}"]`;
        const button = document.querySelector(selector);
        const row = button?.closest('details');
        if (row && !row.open) row.querySelector('summary').click();
        click(selector);
        if (action.target !== undefined) click(`[data-target="${action.target}"]`);
        if (document.querySelector('#modal').open) click('#modal [data-close]');
      } else throw new Error(`Unknown action: ${action.type}`);
      const after = t.policy.observe(window.lanternGame.snapshot().state);
      t.actions++;
      t.stalls = after.turn === before.turn && action.type !== 'face' ? t.stalls + 1 : 0;
      if (action.type === 'face' && (after.player.facing[0] !== action.dx || after.player.facing[1] !== action.dy))
        throw new Error('Facing input was not applied');
      const logs = after.log.filter(entry => !before.log.some(old => old.turn === entry.turn && old.text === entry.text));
      rows.push({ actionNumber: t.actions, action, before: brief(before), after: brief(after), logs,
        ...(before.floor !== after.floor ? { observation: after } : {}) });
      if (t.stalls >= 5) t.stop = 'input-stalled';
      if (after.floor !== before.floor || after.status !== 'playing') break;
    }
  } catch (e) { error = e.message; t.stop = 'driver-error'; }
  return { rows, stop: t.stop, error };
}

async function main(args = process.argv.slice(2)) {
  const config = options(args), out = path.resolve(config.out);
  fs.mkdirSync(out, { recursive: true });
  // Avoid mixing an old baseline with a new run.
  if (fs.existsSync(path.join(out, 'summary.json'))) throw new Error(`Output already exists: ${out}`);
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const file = path.resolve(root, 'dist', `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
    if (!file.startsWith(path.join(root, 'dist') + path.sep)) { response.writeHead(403).end(); return; }
    fs.readFile(file, (error, data) => {
      if (error) { response.writeHead(404).end(); return; }
      const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }[path.extname(file)] || 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }).end(data);
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const url = `http://127.0.0.1:${server.address().port}/`;
  const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'lantern-playtest-'));
  const env = { ...process.env, AGENT_BROWSER_SOCKET_DIR: runtime };
  const report = { schemaVersion: 2, policyVersion: 3, createdAt: new Date().toISOString(), config, url, runs: [], scenarios: [] };
  try {
    report.revision = (await exec('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim();
    report.dirty = !!(await exec('git', ['status', '--porcelain'], { cwd: root })).stdout.trim();
    report.sourceHashes = Object.fromEntries(['dist', 'scripts', 'dist/art'].flatMap(dir => fs.readdirSync(path.join(root, dir))
      .filter(file => /\.(js|cjs|css|html)$/.test(file) || (dir === 'dist/art' && /^hero.*\.png$/.test(file))).map(file => {
        const relative = `${dir}/${file}`;
        return [relative, createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex')];
      })));
    report.agentBrowser = (await exec('agent-browser', ['--version'], { env })).stdout.trim();
    for (const seed of config.scenarios === 'only' ? config.seeds.slice(0, 1) : config.seeds) {
      const session = `lantern-${process.pid}-${seed}`, dir = path.join(out, `${config.dungeon}-${seed}`);
      fs.mkdirSync(dir, { recursive: false });
      const ab = async (...cmd) => {
        let stdout;
        try { ({ stdout } = await exec('agent-browser', ['--session', session, '--json', ...cmd], { env, timeout: 45000, maxBuffer: 64 * 1024 * 1024 })); }
        catch (error) { throw new Error([error.message, error.stderr?.slice(0, 1000)].filter(Boolean).join('\n')); }
        const response = JSON.parse(stdout);
        if (!response.success) throw new Error(response.error || JSON.stringify(response));
        return response.data;
      };
      const evaluate = async code => (await ab('eval', '-b', Buffer.from(code).toString('base64'))).result;
      const write = (name, value) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2) + '\n');
      const run = { seed, dungeon: config.dungeon, artifacts: [], checks: {}, metrics: { actions: 0, netHpLoss: 0, starvingTurns: 0, lowHpTurns: 0, turnlessActions: 0, stalledInputs: 0, revisitedMoves: 0, oscillationMoves: 0, reasons: {}, floors: {} } };
      const visitedPositions = new Set();
      const moves = [];
      report.runs.push(run);
      const screenshot = async name => {
        await evaluate('window.scrollTo(0, 0); true');
        await ab('screenshot', path.join(dir, name)); run.artifacts.push(`${config.dungeon}-${seed}/${name}`);
        const png = fs.readFileSync(path.join(dir, name));
        if (png.readUInt32BE(16) !== config.viewport[0] || png.readUInt32BE(20) !== config.viewport[1])
          throw new Error(`Screenshot size differs from requested viewport: ${name}`);
      };
      try {
        const initial = new DungeonEngine(seed, config.dungeon, config.dungeon === 'depths').serialize();
        write('initial-save.json', JSON.parse(initial));
        // A session-local guard seeds exactly once, preserving the real autosave during reload checks.
        const init = path.join(dir, 'init.js');
        fs.writeFileSync(init, `if (location.origin === ${JSON.stringify(url.slice(0, -1))} && !sessionStorage.getItem('playtest-seeded')) { localStorage.setItem('lantern-dungeon-v1', ${JSON.stringify(initial)}); sessionStorage.setItem('playtest-seeded', 'true'); }`);
        await ab('open', '--init-script', init, url);
        await ab('wait', '--fn', '!!window.lanternGame');
        // Registering a launch-time init script can relaunch Chrome and reset its viewport.
        // Resize after launch, then reload so portrait-only UI is initialized at the actual size.
        await ab('set', 'viewport', ...config.viewport.map(String));
        await ab('reload'); await ab('wait', '--fn', '!!window.lanternGame');
        run.viewport = await evaluate('({ width: innerWidth, height: innerHeight, portrait: matchMedia("(max-width:600px) and (orientation:portrait)").matches })');
        run.checks.viewport = run.viewport.width === config.viewport[0] && run.viewport.height === config.viewport[1];
        if (!run.checks.viewport) throw new Error('Actual viewport differs from requested viewport');
        const expectedBoot = JSON.stringify(resumedSave(resumedSave(JSON.parse(initial))));
        run.checks.seeded = await evaluate(`JSON.stringify(window.lanternGame.snapshot()) === ${JSON.stringify(expectedBoot)}`);
        if (!run.checks.seeded) throw new Error('Seed fixture did not load exactly');
        await screenshot('start.png');
        // These smoke paths use actual browser pointer input, unlike the DOM-click play policy.
        for (const id of ['help-button', 'world-button', 'bag-button', 'new-game-button']) {
          const before = await evaluate('JSON.stringify(window.lanternGame.snapshot())');
          await ab('click', `#${id}`);
          await ab('wait', '--fn', 'document.querySelector("#modal").open');
          await screenshot(`${id}.png`);
          await ab('click', '#modal .close-modal');
          const unchanged = before === await evaluate('JSON.stringify(window.lanternGame.snapshot())');
          run.checks[id] = unchanged;
          if (!unchanged) throw new Error(`Viewing dialog mutated game: ${id}`);
        }
        await evaluate(`window.__playtest = { policy: (${createPolicy.toString()})(DungeonData), memory: {}, actions: 0, stalls: 0 }; true`);
        write('initial-observation.json', await evaluate('window.__playtest.policy.observe(window.lanternGame.snapshot().state)'));
        if (config.motion === 'on') {
          fs.mkdirSync(path.join(dir, 'motion'));
          await evaluate(`(() => {
            const source = document.getElementById('game'), canvas = document.createElement('canvas');
            canvas.width = ${config.viewport[0]}; canvas.height = Math.round(source.height * canvas.width / source.width);
            const context = canvas.getContext('2d');
            const capture = window.__motion = { frames: [], active: true, start: performance.now(), last: -Infinity };
            function frame(now) {
              if (!capture.active) return;
              if (now - capture.last >= 30) {
                context.drawImage(source, 0, 0, canvas.width, canvas.height);
                const state = window.lanternGame.snapshot().state;
                capture.frames.push({ time: now - capture.start, turn: state.turn, floor: state.floor,
                  x: state.player.x, y: state.player.y, facing: state.player.facing, imageData: canvas.toDataURL('image/jpeg', .85) });
                capture.last = now;
              }
              requestAnimationFrame(frame);
            }
            requestAnimationFrame(frame); return true;
          })()`);
        }
        let motionIndex = 0;
        if (config.scenarios === 'only') run.stop = 'scenario-only';
        while (!run.stop) {
          const batchSize = Math.min(config.motion === 'on' ? 4 : 25, Math.max(1, Math.floor(15000 / (config.delay + 600))));
          const batch = await evaluate(`(${playBatch.toString()})(${batchSize}, ${config.delay}, ${config.maxTurns}, ${config.maxActions})`);
          if (config.motion === 'on') {
            const captured = await evaluate('window.__motion.frames.splice(0)');
            for (const frame of captured) {
              const name = `motion/${String(motionIndex++).padStart(5, '0')}.jpg`;
              fs.writeFileSync(path.join(dir, name), Buffer.from(frame.imageData.split(',')[1], 'base64'));
              delete frame.imageData;
              fs.appendFileSync(path.join(dir, 'motion.jsonl'), JSON.stringify({ ...frame, image: name }) + '\n');
            }
          }
          for (const row of batch.rows) {
            fs.appendFileSync(path.join(dir, 'actions.jsonl'), JSON.stringify(row) + '\n');
            const m = run.metrics, a = row.after, b = row.before;
            m.actions++; m.netHpLoss += Math.max(0, b.player.hp - a.player.hp);
            m.starvingTurns += Number(a.turn > b.turn && a.player.hunger === 0);
            m.lowHpTurns += Number(a.turn > b.turn && a.player.hp <= a.player.maxHp * .25);
            m.turnlessActions += Number(a.turn === b.turn);
            m.stalledInputs += Number(a.turn === b.turn && row.action.type !== 'face');
            visitedPositions.add(`${b.floor}:${b.player.x},${b.player.y}`);
            if (b.floor === a.floor && (b.player.x !== a.player.x || b.player.y !== a.player.y)) {
              const position = `${a.floor}:${a.player.x},${a.player.y}`;
              m.revisitedMoves += Number(visitedPositions.has(position));
              visitedPositions.add(position);
              const progress = JSON.stringify([a.explored, a.player.gold, a.player.exp, a.player.bag, a.player.equipment,
                a.visibleEnemies.map(e => [e.species, e.x, e.y, e.hp])]);
              moves.push({ position, progress });
              if (moves.length > 5) moves.shift();
              if (moves.length === 5 && moves[0].position === moves[2].position && moves[2].position === moves[4].position
                && moves[1].position === moves[3].position && moves[0].position !== moves[1].position
                && moves.every(move => move.progress === progress)) m.oscillationMoves++;
            }
            m.reasons[row.action.reason] = (m.reasons[row.action.reason] || 0) + 1;
            m.floors[a.floor] = { turn: a.turn, hp: a.player.hp, hunger: a.player.hunger, explored: a.explored };
            if (b.floor !== a.floor) await screenshot(`floor-${a.floor}.png`);
          }
          run.stop = batch.stop;
          if (batch.error) throw new Error(batch.error);
        }
        if (config.motion === 'on') {
          await evaluate('window.__motion.active = false');
          run.motionFrames = motionIndex;
          run.artifacts.push(`${config.dungeon}-${seed}/motion.jsonl`);
        }
        const final = await evaluate('window.lanternGame.snapshot()');
        write('final-save.json', final);
        run.final = { floor: final.state.floor, turn: final.state.turn, status: final.state.status, hp: final.state.player.hp, hunger: final.state.player.hunger };
        await screenshot('end.png');
        await ab('reload'); await ab('wait', '--fn', '!!window.lanternGame');
        const reloaded = await evaluate('window.lanternGame.snapshot()');
        write('reloaded-save.json', reloaded);
        run.checks.reload = isDeepStrictEqual(resumedSave(final), reloaded);
        run.checks.noHorizontalOverflow = await evaluate('document.documentElement.scrollWidth <= innerWidth');
        if (!run.checks.reload) throw new Error('Save/reload state mismatch');
        if (!run.checks.noHorizontalOverflow) throw new Error('Horizontal overflow');
        if (run.metrics.stalledInputs) throw new Error(`UI input made no progress ${run.metrics.stalledInputs} times`);
        if (config.scenarios !== 'off' && seed === config.seeds[0]) {
          report.scenarios = await runScenarios({ ab, evaluate, screenshot, write, resumedSave });
          if (report.scenarios.some(scenario => scenario.error)) throw new Error('Conditional browser scenarios failed');
        }
      } catch (error) {
        run.error = error.message; run.stop ||= 'driver-error';
        try { await screenshot('failure.png'); } catch { /* Browser startup can fail before a page exists. */ }
      } finally {
        try {
          run.browserErrors = await ab('errors');
          run.console = await ab('console');
          if (run.browserErrors.errors?.length) run.error ||= 'Browser runtime errors';
          if (run.console.messages?.some(m => m.type === 'error' || m.level === 'error')) run.error ||= 'Browser console errors';
        } catch (error) { run.error ||= `Diagnostics unavailable: ${error.message}`; }
        try { await ab('close'); } catch (error) { run.error ||= `Browser cleanup failed: ${error.message}`; }
        write('run.json', run);
        fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
        fs.writeFileSync(path.join(out, 'report.md'), markdownReport(report));
        console.log(`seed=${seed} stop=${run.stop} floor=${run.final?.floor ?? '?'} turns=${run.final?.turn ?? '?'} actions=${run.metrics.actions}${run.error ? ` error=${run.error}` : ''}`);
      }
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
  console.log(`Report: ${path.join(out, 'summary.json')}`);
  if (report.runs.some(run => run.error)) process.exitCode = 1;
  return report;
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { options, resumedSave, markdownReport, main };
