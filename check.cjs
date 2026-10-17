const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

for (const file of fs.readdirSync(path.join(__dirname, 'dist')).filter(file => file.endsWith('.js'))) {
  const result = spawnSync(process.execPath, ['--check', path.join(__dirname, 'dist', file)], {stdio: 'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
require('./tests/check-modules.cjs');
require('./tests/check-sprites.cjs');
require('./tests/check-walk.cjs');
require('./tests/check-footfall-art.cjs');
require('./tests/check-inventory-ui.cjs');
require('./tests/check-combat.cjs');
require('./tests/check-traits.cjs');
require('./tests/check-identification.cjs');
require('./tests/check-equipment.cjs');
require('./tests/check-ground.cjs');
require('./tests/check-engine.cjs');
require('./tests/check-pwa.cjs');
require('./tests/check-playtest.cjs');
const strategy = spawnSync(process.execPath, [path.join(__dirname, 'tests/check-strategy.cjs')], {stdio: 'inherit'});
if (strategy.error) throw strategy.error;
if (strategy.status !== 0) process.exit(strategy.status ?? 1);
const echoes = spawnSync(process.execPath, [path.join(__dirname, 'tests/check-echoes.cjs')], {stdio: 'inherit'});
if (echoes.error) throw echoes.error;
if (echoes.status !== 0) process.exit(echoes.status ?? 1);
