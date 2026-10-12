'use strict';

const VERSION = '17696982eca010fc';
const PREFIX = `lantern-dungeon:${self.registration.scope}:`;
const CACHE = PREFIX + VERSION;
const ASSETS = [
  './', 'index.html', 'style.css', 'pwa.js', 'manifest.webmanifest',
  'data.js', 'world.js', 'enemies.js', 'save.js', 'engine.js', 'renderer.js', 'game.js',
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
  if (!ASSETS.includes(url.href)) return;
  if (event.request.mode === 'navigate' && !ASSETS.slice(0, 2).includes(url.href)) return;
  const key = event.request.mode === 'navigate' ? ASSETS[0] : url.href;
  event.respondWith((async () => {
    const cached = await (await caches.open(CACHE)).match(key);
    return cached || fetch(event.request);
  })());
});
