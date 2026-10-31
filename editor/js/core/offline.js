// Registers the service worker (../../../sw.js) that keeps a copy of the editor in the browser: reopening Anvil is
// instant and works offline. When a newer version has been uploaded, a notice offers to reload into it.
import { el } from './events.js';

export function initOffline() {
  if (!('serviceWorker' in navigator)) return;
  // works on GitHub Pages and on a local server (localhost). Add ?nosw to the address to skip it.
  // (An unpackaged development copy has an empty file list in sw.js, so it never caches anything.)
  if (location.protocol === 'file:' || new URLSearchParams(location.search).has('nosw')) return;
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
