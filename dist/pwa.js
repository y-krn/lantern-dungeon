(() => {
  'use strict';
  const panel = document.getElementById('pwa-panel');
  if (!window.isSecureContext || !['http:', 'https:'].includes(window.location.protocol) || !('serviceWorker' in navigator)) return;
  panel.hidden = false;
  const status = document.getElementById('pwa-status');
  const update = document.getElementById('pwa-update');
  const standalone = matchMedia('(display-mode: standalone)');
  function showInstall() {
    document.getElementById('pwa-install').hidden = standalone.matches || navigator.standalone === true;
  }
  showInstall();
  standalone.addEventListener('change', showInstall);
  let ready = false, failed = false, registration, controller = navigator.serviceWorker.controller;
  function showStatus() {
    status.textContent = failed ? 'オフライン用の準備に失敗しました。オンラインで開き直してください。' : ready
      ? (navigator.onLine ? 'オフラインで遊べます。' : 'オフラインで探索中です。冒険は端末に保存されます。')
      : 'オフライン用の準備中です。';
  }
  window.addEventListener('online', showStatus);
  window.addEventListener('offline', showStatus);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // All open tabs switch to the same release after the player accepts an update.
    if (controller) window.location.reload();
    controller = navigator.serviceWorker.controller;
  });
  update.addEventListener('click', () => {
    if (!registration?.waiting) return;
    update.disabled = true;
    registration.waiting.postMessage('ACTIVATE_UPDATE');
  });
  navigator.serviceWorker.register('./sw.js', {scope: './', updateViaCache: 'none'})
    .then(async current => {
      registration = current;
      const showUpdate = () => { update.hidden = !current.waiting; };
      showUpdate();
      function watchInstall() {
        const installing = current.installing;
        installing?.addEventListener('statechange', () => {
          if (installing.state === 'installed') showUpdate();
          if (installing.state === 'redundant' && !current.active) {
            failed = true;
            showStatus();
          }
        });
      }
      watchInstall();
      current.addEventListener('updatefound', watchInstall);
      await navigator.serviceWorker.ready;
      ready = true;
      showStatus();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && navigator.onLine) current.update().catch(() => {});
      });
    })
    .catch(() => {
      failed = true;
      showStatus();
    });
})();
