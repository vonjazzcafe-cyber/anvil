// Registers the service worker (../../../sw.js) that keeps a copy of the editor in the browser: reopening Anvil is
// instant and works offline. When a newer version has been uploaded, a notice offers to reload into it.
import { el } from './events.js';

export function initOffline() {
  if (!('serviceWorker' in navigator)) return;
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const force = new URLSearchParams(location.search).has('sw');
  if ((local && !force) || location.protocol === 'file:') return; // while developing Anvil itself, always load fresh files
  navigator.serviceWorker.register(new URL('../../../sw.js', import.meta.url), { scope: new URL('../../../', import.meta.url).pathname })
    .then((reg) => {
      const offer = (w) => { if (w && navigator.serviceWorker.controller) showUpdate(w); };
      if (reg.waiting) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => { if (w.state === 'installed') offer(w); });
      });
      // look for a new version now and then while the editor stays open
      setInterval(() => reg.update().catch(() => { }), 30 * 60 * 1000);
    })
    .catch((e) => console.warn('Offline copy unavailable:', e));
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; location.reload(); } });
}

function showUpdate(worker) {
  if (document.getElementById('update-notice')) return;
  const btn = el('button', { class: 'btn', text: 'Reload' });
  const later = el('button', { class: 'btn', text: 'Later' });
  const n = el('div', { id: 'update-notice', class: 'toast update' }, el('span', { text: 'A new version of Anvil is ready. Your project is saved.' }), btn, later);
  btn.addEventListener('click', () => { btn.disabled = true; worker.postMessage('skipWaiting'); });
  later.addEventListener('click', () => n.remove());
  document.getElementById('toast-layer')?.append(n);
}
