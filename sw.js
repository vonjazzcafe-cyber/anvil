// Anvil's service worker: keeps a copy of the editor in the browser, so reopening it is instant (no waiting on the
// network) and it works offline. The whole editor is served from one version until a new one is ready; then the
// editor shows "Reload to update". The C# runtime's binaries are cached separately by the .NET loader.
// The file list below is written by tools/sw-manifest.py (run by tools/package.sh) — don't edit it by hand.
const MANIFEST = /*MANIFEST*/{"version":"174e2f3ec40a1243","files":["editor/css/editor.css","editor/img/icon.svg","editor/js/core/components.js","editor/js/core/events.js","editor/js/core/input-actions.js","editor/js/core/local-folder.js","editor/js/core/math.js","editor/js/core/meshpack.js","editor/js/core/models.js","editor/js/core/offline.js","editor/js/core/project.js","editor/js/core/scene.js","editor/js/core/ui-create.js","editor/js/export/exporter.js","editor/js/export/format.js","editor/js/export/github.js","editor/js/main.js","editor/js/runtime/audio.js","editor/js/runtime/compiler-worker.js","editor/js/runtime/dotnet-boot.js","editor/js/runtime/engine.js","editor/js/runtime/gui.js","editor/js/runtime/physics-physx.js","editor/js/runtime/physics.js","editor/js/runtime/physics2d.js","editor/js/runtime/play.js","editor/js/runtime/ui-preview.js","editor/js/ui/code-editor.js","editor/js/ui/console.js","editor/js/ui/controller-editor.js","editor/js/ui/create-menu.js","editor/js/ui/dialogs.js","editor/js/ui/fields.js","editor/js/ui/hierarchy.js","editor/js/ui/inspector.js","editor/js/ui/menus.js","editor/js/ui/project-panel.js","editor/js/ui/settings.js","editor/js/ui/ui-inspector.js","editor/js/viewport/runtime-render.js","editor/js/viewport/viewport.js","engine/dotnet/anvil.pack.gz","engine/dotnet/blazor.boot.json","engine/dotnet/dotnet.js","engine/dotnet/dotnet.native.8.0.32.0nw8qdht41.js","engine/dotnet/dotnet.runtime.8.0.32.v5uxpytycl.js","engine/dotnet/packs.json","engine/refs.bin.gz","index.html","vendor/codemirror.js","vendor/fflate.js","vendor/loaders.js","vendor/physx/physx-js-webidl.mjs","vendor/planck.js","vendor/rapier.mjs","vendor/three.js"]}/*END*/;
const CACHE = 'anvil-shell-' + MANIFEST.version;
const BASE = new URL('./', self.location).href;
const FILES = new Set(MANIFEST.files);

self.addEventListener('install', (e) => {
  if (!FILES.size) return;
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // 'no-cache' revalidates with the server, so a file the browser already has costs no download,
    // and a stale copy in the HTTP cache is never stored as part of the new version
    await Promise.all(MANIFEST.files.map(async (f) => {
      const res = await fetch(new URL(f, BASE), { cache: 'no-cache' });
      if (!res.ok) throw new Error(f + ': ' + res.status);
      await cache.put(new URL(f, BASE).href, res);
    }));
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('anvil-shell-') && k !== CACHE) await caches.delete(k);
  })());
});

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !FILES.size) return;
  const url = new URL(req.url);
  if (!url.href.startsWith(BASE)) return;
  let rel = decodeURIComponent(url.pathname.slice(new URL(BASE).pathname.length));
  if (rel === '') rel = 'index.html';
  if (!FILES.has(rel)) return; // everything else goes to the network as usual
  e.respondWith((async () => {
    const hit = await caches.match(new URL(rel, BASE).href, { cacheName: CACHE });
    return hit || fetch(req);
  })());
});
