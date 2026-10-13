const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createHash} = require('node:crypto');

const dist = path.join(__dirname, 'dist');
const swPath = path.join(dist, 'sw.js');
let source = fs.readFileSync(swPath, 'utf8');
const scope = 'https://example.test/games/lantern/';
const handlers = {};
const stores = new Map();
let failInstall = false, claimed = 0, skipped = 0, fetched = 0;
const caches = {
  async open(name) {
    if (!stores.has(name)) stores.set(name, new Map());
    const entries = stores.get(name);
    return {
      async addAll(requests) {
        for (const request of requests) {
          assert.equal(request.cache, 'reload');
          assert.equal(request.redirect, 'error', 'Authentication redirects cannot enter the app cache');
          assert.notEqual(request.url, scope + 'index.html', 'Precache the canonical directory URL to avoid static-host redirects');
          if (failInstall) throw new Error('Download failed');
          entries.set(request.url, new Response(request.url));
        }
      },
      async match(key) { return entries.get(key)?.clone(); },
    };
  },
  async keys() { return [...stores.keys()]; },
  async delete(name) { return stores.delete(name); },
};
const context = vm.createContext({
  URL, Request, caches,
  fetch: async () => { fetched++; throw new Error('Offline'); },
  self: {
    registration: {scope},
    addEventListener: (type, handler) => { handlers[type] = handler; },
    clients: {claim: async () => { claimed++; }},
    skipWaiting: async () => { skipped++; },
  },
});
vm.runInContext(source, context);
const config = vm.runInContext('({ASSETS, CACHE, PREFIX, VERSION})', context);
const files = [...new Set(config.ASSETS.map(url => new URL(url).pathname.slice(new URL(scope).pathname.length) || 'index.html'))].sort();
const hash = createHash('sha256').update(source.replace(/const VERSION = '[^']+';/, "const VERSION = '';"));
for (const file of files) hash.update(file).update(fs.readFileSync(path.join(dist, file)));
const version = hash.digest('hex').slice(0, 16);
if (process.argv.includes('--refresh')) {
  fs.writeFileSync(swPath, source.replace(/const VERSION = '[^']+';/, `const VERSION = '${version}';`));
  console.log(`PWA cache version refreshed: ${version}`);
  process.exit(0);
}
assert.equal(config.VERSION, version, 'Assets changed: run node check-pwa.cjs --refresh before publishing');
const localAssets = fs.readdirSync(dist).filter(file => /\.(js|css|html|webmanifest)$/.test(file) && file !== 'sw.js');
for (const file of localAssets) assert(files.includes(file), `Missing offline dependency: ${file}`);
for (const file of fs.readdirSync(path.join(dist, 'art'))) {
  assert(files.includes(`art/${file}`), `Missing offline artwork: ${file}`);
}
const manifest = JSON.parse(fs.readFileSync(path.join(dist, 'manifest.webmanifest'), 'utf8'));
for (const key of ['id', 'scope', 'start_url']) assert.equal(new URL(manifest[key], scope).href, scope);
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.lang, 'ja');
for (const icon of [...manifest.icons, {src: 'icons/apple-touch-icon.png', sizes: '180x180'}]) {
  assert(files.includes(icon.src));
  const png = fs.readFileSync(path.join(dist, icon.src));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
  assert.equal(png[25], 2, 'Icons use opaque RGB');
}
assert(manifest.icons.some(icon => icon.purpose === 'maskable'));
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
assert(html.includes('rel="manifest" href="manifest.webmanifest"'));
assert(html.includes('rel="apple-touch-icon"'));
assert(html.includes('name="apple-mobile-web-app-status-bar-style" content="default"'));
for (const [isSecureContext, protocol, serviceWorker] of [[true, 'file:', {}], [false, 'http:', {}], [true, 'https:', undefined]]) {
  const panel = {hidden: true};
  vm.runInNewContext(fs.readFileSync(path.join(dist, 'pwa.js'), 'utf8'), {
    window: {isSecureContext, location: {protocol}},
    navigator: serviceWorker ? {serviceWorker} : {},
    document: {getElementById: () => panel},
  });
  assert(panel.hidden, 'Unsupported origins and browsers keep ordinary gameplay without registering a worker');
}

async function lifecycle(type, extra = {}) {
  let work;
  handlers[type]({...extra, waitUntil: promise => { work = promise; }});
  await work;
}
async function response(url, mode = 'cors', method = 'GET') {
  let work;
  handlers.fetch({request: {url, mode, method}, respondWith: promise => { work = promise; }});
  return work;
}

(async () => {
  const old = config.PREFIX + 'old';
  stores.set(old, new Map());
  stores.set('another-app', new Map());
  stores.set('lantern-dungeon:https://example.test/other/:old', new Map());
  failInstall = true;
  await assert.rejects(lifecycle('install'), /Download failed/);
  assert(!stores.has(config.CACHE), 'Incomplete releases are discarded');
  assert(stores.has(old), 'A failed update keeps the previous release');
  failInstall = false;
  await lifecycle('install');
  assert.equal(stores.get(config.CACHE).size, config.ASSETS.length);
  assert.equal(skipped, 0, 'Updates wait for user action or all tabs to close');
  await lifecycle('message', {data: 'unrelated'});
  assert.equal(skipped, 0);
  await lifecycle('message', {data: 'ACTIVATE_UPDATE'});
  assert.equal(skipped, 1);
  await lifecycle('activate');
  assert.equal(claimed, 1);
  assert(!stores.has(old));
  assert(stores.has('another-app'));
  assert(stores.has('lantern-dungeon:https://example.test/other/:old'));
  assert.equal(await (await response(scope + '?from=homescreen', 'navigate')).text(), scope);
  assert.equal(await (await response(scope + 'index.html?resume=1', 'navigate')).text(), scope);
  assert.equal(await (await response(scope + 'index.html')).text(), scope);
  for (const url of config.ASSETS) assert.equal(await (await response(url)).text(), url);
  assert.equal(fetched, 0, 'Every game dependency is usable offline');
  for (const [url, mode, method] of [
    ['https://fonts.googleapis.com/style.css', 'cors', 'GET'],
    [scope + 'account', 'navigate', 'GET'],
    [scope + 'game.js', 'navigate', 'GET'],
    [scope, 'cors', 'POST'],
  ]) assert.equal(await response(url, mode, method), undefined, 'Unrelated requests bypass the worker');
  stores.get(config.CACHE).delete(scope + 'game.js');
  await assert.rejects(response(scope + 'game.js'), /Offline/);
  console.log('PASS: PWA manifest/icons, complete offline shell, content version, scoped caches, failed update rollback, explicit activation and request boundaries.');
})().catch(error => { console.error(error); process.exitCode = 1; });
