const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

for (const file of fs.readdirSync(path.join(__dirname, 'dist')).filter(file => file.endsWith('.js'))) {
  const result = spawnSync(process.execPath, ['--check', path.join(__dirname, 'dist', file)], {stdio: 'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
require('./check-modules.cjs');
require('./check-combat.cjs');
require('./check-engine.cjs');
require('./check-pwa.cjs');
