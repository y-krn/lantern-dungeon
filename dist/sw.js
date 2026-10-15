'use strict';

const VERSION = '07ff886f2f9678e4';
const PREFIX = `lantern-dungeon:${self.registration.scope}:`;
const CACHE = PREFIX + VERSION;
const ASSETS = [
  './', 'art/lantern-atlas.png', 'art/lantern-cover.png', 'art/lantern-items.png', 'style.css', 'pwa.js', 'manifest.webmanifest',
  'data.js', 'world.js', 'enemies.js', 'save.js', 'engine.js', 'sprites.js', 'renderer.js', 'inventory-ui.js', 'game.js',
  'combat-preview', 'combat-preview.css', 'combat-preview.js',
  'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
].map(path => new URL(path, self.registration.scope).href);

self.addEventListener('install', event => {
  // A release is usable only when every local dependency has been downloaded.
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      await cache.addAll(ASSETS.map(url => new Request(url, {cache: 'reload', redirect: 'error'})));
    } catch (error) {
      await caches.delete(CACHE);
      throw error;
    }
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  url.search = '';
  // Never store account pages, external fonts, or unrelated same-origin resources.
  // Static hosts redirect HTML extensions; cache their canonical page URLs.
  const preview = new URL('combat-preview', self.registration.scope).href;
  const key = url.href === new URL('index.html', self.registration.scope).href ? ASSETS[0]
    : url.href === new URL('combat-preview.html', self.registration.scope).href ? preview : url.href;
  if (!ASSETS.includes(key)) return;
  if (event.request.mode === 'navigate' && key !== ASSETS[0] && key !== preview) return;
  event.respondWith((async () => {
    const cached = await (await caches.open(CACHE)).match(key);
    return cached || fetch(event.request);
  })());
});
