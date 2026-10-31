// The C# side of Anvil, as two .NET WebAssembly runtimes:
//  - on the page: the UnityEngine implementation that runs your game in Play mode (needs to be on the
//    page because it talks to the physics engine and the renderer every frame);
//  - in a Web Worker: the Roslyn compiler, code completion and error checking, so they never freeze the editor.
// The compiled DLL is handed from the worker to the page, and cached so a reload can Play straight away.
import { bus } from '../core/events.js';
import { initPhysics, physicsImports } from './physics.js';
import { exec as physics2dExec } from './physics2d.js';
// the C# side calls one set of physics functions; which engine answers is chosen when Play starts
let physicsCurrent = physicsImports;
const physicsDispatch = {};
const PHYSICS_FNS = ['reset', 'setGravity', 'createBody', 'removeBody', 'setBodyType', 'setBodyProps', 'setBodySolver', 'createCollider', 'createMeshCollider', 'removeCollider', 'setColliderLayer', 'setMassProps', 'createJoint', 'removeJoint', 'setLayerMatrix', 'setIgnorePair', 'applyCommands', 'step', 'raycast', 'raycastAll', 'shapeCast', 'shapeCastAll', 'overlap', 'closestPoint'];
for (const k of PHYSICS_FNS) physicsDispatch[k] = (...a) => { const f = physicsCurrent[k]; return f ? f(...a) : undefined; };
export async function usePhysicsEngine(name) {
  if (name === 'physx') {
    try {
      const m = await import('./physics-physx.js');
      await m.initPhysX();
      physicsCurrent = m.physxImports;
      return 'physx';
    } catch (e) { console.error('PhysX failed to load, using Rapier', e); }
  }
  physicsCurrent = physicsImports;
  return 'rapier';
}
import { modelMeshBytes, modelClipBytes } from '../core/models.js';
import { startDotnet, loadRefs, buildVersion, bootTiming } from './dotnet-boot.js';
import { storage, project } from '../core/project.js';

let X = null;          // exported Interop class (page runtime)
let lastFrame = null;  // Float64Array of the last pushed frame
let lastExtras = null; // Float64Array: lines, trails and particles of the last frame
let meshQueue = [], texQueue = [], audioQueue = []; // new mesh / texture data since the last tick
let worker = null, workerReady = null, reqId = 0, workerLoaded = false;
const pending = new Map();
let mainReady = null;
let localCompiler = null; // fallback when Web Workers can't run the compiler
let inputMode = 'new';

const site = () => new URL('.', document.baseURI).href;

// The compiler normally runs in a module Web Worker, so the page runtime can leave the compiler assemblies out
// (less memory, faster start). If this browser can't run it there, the page loads them and compiles itself.
const PAGE_COMPILER_KEY = 'anvil-page-compiler';
function moduleWorkersSupported() {
  let ok = false;
  try {
    const url = URL.createObjectURL(new Blob([''], { type: 'text/javascript' }));
    new Worker(url, { get type() { ok = true; return 'module'; } }).terminate();
    URL.revokeObjectURL(url);
  } catch { }
  return ok;
}
let pageCompiler = false;
try { pageCompiler = localStorage.getItem(PAGE_COMPILER_KEY) === '1'; } catch { }
if (!moduleWorkersSupported()) pageCompiler = true;

function call(op, args) {
  return new Promise((resolve, reject) => {
    const id = ++reqId;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, op, args });
  });
}

async function startWorker() {
  worker = new Worker(new URL('./compiler-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    if (e.data.loaded) { workerLoaded = true; return; }
    const p = pending.get(e.data.id); if (!p) return;
    pending.delete(e.data.id);
    if (e.data.error) p.reject(new Error(e.data.error)); else p.resolve(e.data.result);
  };
  worker.onerror = (e) => { console.error('compiler worker', e); for (const p of pending.values()) p.reject(new Error('compiler worker failed')); pending.clear(); };
  await call('init', { site: site() });
}

// fallback: compile on the page (slower UI while compiling, but works everywhere)
async function startLocalCompiler() {
  await mainReady;
  const r = X.InitCompiler(await loadRefs(site()));
  if (!String(r).startsWith('ok')) throw new Error(r);
  localCompiler = {
    compile: ({ files }) => { const res = JSON.parse(X.Compile(files)); res.timing = X.LastTiming(); if (res.ok) { res.dll = X.LastDll(); res.pdb = X.LastPdb(); } return res; },
    check: ({ files }) => X.Check(files),
    complete: ({ files, path, pos }) => X.Complete(files, path, pos),
    hover: ({ files, path, pos }) => X.Hover(files, path, pos),
    setInputHandling: ({ mode }) => X.SetInputHandling(mode),
    warm: () => X.WarmCompile(),
  };
}
function compilerCall(op, args) {
  if (localCompiler) return Promise.resolve(localCompiler[op](args));
  return call(op, args);
}

async function sha256(text) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export const engine = {
  ready: false,          // Play mode / inspector runtime is up
  compilerReady: false,  // compiler is up (worker or fallback)
  status: 'loading', error: null,

  async load() {
    const T0 = performance.now(), mark = (m) => console.info('[anvil] ' + m + ' ' + Math.round(performance.now() - T0) + ' ms');
    setStatus('loading', 'Loading C#…');
    // compiler worker and page runtime start at the same time
    workerReady = (async () => {
      if (pageCompiler) { await startLocalCompiler(); mark('compiler (page)'); }
      else {
        try { await startWorker(); mark('compiler (worker)'); }
        catch (e) {
          console.warn('Compiler worker unavailable:', e);
          if (worker) worker.terminate(); worker = null;
          if (workerLoaded) throw e; // the worker runs, but loading the compiler failed (e.g. offline on the first visit)
          try { localStorage.setItem(PAGE_COMPILER_KEY, '1'); } catch { }
          throw new Error('this browser could not run the compiler in a background worker. Reload the page and Anvil will compile on the page instead.');
        }
      }
      await compilerCall('setInputHandling', { mode: inputMode });
      this.compilerReady = true;
      bus.emit('compiler-ready');
      updateStatus();
    })();
    mainReady = (async () => {
      const physics = initPhysics(); // the physics engine and .NET start side by side
      X = await startDotnet(site(), {
        physics: physicsDispatch,
        physics2d: { exec: (cmd) => physics2dExec(cmd) },
        anvil: {
          pushFrame: (view) => { lastFrame = view.slice(); },
          pushExtras: (view) => { lastExtras = view.slice(); },
          uploadMesh: (uid, view) => { meshQueue.push([uid, view.slice()]); },
          uploadTexture: (uid, w, h, flags, view) => { texQueue.push([uid, w, h, flags, view.slice()]); },
          uploadAudio: (uid, ch, freq, view) => { audioQueue.push([uid, ch, freq, view.slice()]); },
          modelMeshSize: (key) => modelMeshBytes(key)?.byteLength || 0,
          modelMeshCopy: (key, view) => { const b = modelMeshBytes(key); if (b) view.set(b); },
          modelClipSize: (key) => modelClipBytes(key)?.byteLength || 0,
          modelClipCopy: (key, view) => { const b = modelClipBytes(key); if (b) view.set(b); },
        },
      }, {}, pageCompiler ? null : /^Microsoft\.CodeAnalysis/);
      await physics;
      X.InitEngine();
      mark('runtime (page) ' + JSON.stringify(bootTiming));
    })();
    try {
      await mainReady;
      this.ready = true;
      updateStatus();
      bus.emit('engine-ready');
    } catch (e) {
      console.error(e);
      this.error = String(e.message || e);
      setStatus('error', 'C# engine unavailable');
      bus.emit('engine-failed', this.error);
      return;
    }
    workerReady.then(() => {
      // warm the compiler up in the background so the first edit compiles quickly
      compilerCall('warm').then(() => mark('compiler warm')).catch(() => { });
    }).catch(e => {
      console.error(e);
      this.error = 'compiler: ' + (e.message || e);
      setStatus('error', 'C# compiler unavailable');
      bus.emit('engine-failed', this.error);
    });
  },

  // Compiles the scripts. Uses the cached DLL when the sources haven't changed since the last compile.
  async compile(files) {
    const json = JSON.stringify(files);
    const key = await sha256(json + '|' + inputMode + '|' + await buildVersion(site()));
    const cacheKey = 'dll:' + (project.name || '');
    try {
      const c = await storage.get(cacheKey);
      if (c && c.key === key && c.dll instanceof Uint8Array) {
        await mainReady;
        X.LoadCompiled(c.dll, c.pdb);
        this.prepareNextPlay();
        return Object.assign({}, c.result, { ms: 0, timing: 'cached', cached: true });
      }
    } catch (e) { /* no cache */ }
    if (!this.compilerReady) setStatus('loading', 'Compiler starting…');
    await workerReady;
    const res = await compilerCall('compile', { files: json });
    if (res.ok) {
      await mainReady;
      X.LoadCompiled(res.dll, res.pdb);
      this.prepareNextPlay();
      const result = { ok: res.ok, ms: res.ms, diags: res.diags, meta: res.meta };
      storage.set(cacheKey, { key, dll: res.dll, pdb: res.pdb, result }).catch(() => { });
    }
    updateStatus();
    return res;
  },
  async check(filesJson) { if (!this.compilerReady) return '[]'; return compilerCall('check', { files: filesJson }); },
  async complete(filesJson, path, pos) { if (!this.compilerReady) return '{}'; return compilerCall('complete', { files: filesJson, path, pos }); },
  async hover(filesJson, path, pos) { if (!this.compilerReady) return 'null'; return compilerCall('hover', { files: filesJson, path, pos }); },
  setInputHandling(mode) {
    inputMode = mode || 'new';
    if (this.compilerReady) compilerCall('setInputHandling', { mode: inputMode }).catch(() => { });
  },
  beginPlay(json) { return X.BeginPlay(json); },
  playTiming() { return X ? X.PlayTiming() : ''; },
  // stage the next fresh copy of the compiled scripts when the browser is idle (makes Play instant)
  prepareNextPlay() {
    if (!X) return;
    const run = () => { try { X.PrepareNextPlay(); } catch (e) { } };
    if (window.requestIdleCallback) requestIdleCallback(run, { timeout: 3000 }); else setTimeout(run, 300);
  },
  endPlay() { X.EndPlay(); const ev = X.Frame(); meshQueue = []; texQueue = []; audioQueue = []; return ev; },
  tick(dt) { const ev = X.Tick(dt); return takeFrame(ev); },
  frame() { const ev = X.Frame(); return takeFrame(ev); },
  setScreen(w, h) { X.SetScreen(w | 0, h | 0); },
  setInput(held, down, up, chars, mx, my, bh, bd, bu, wheel) { X.SetInput(held, down, up, chars, mx, my, bh, bd, bu, wheel); },
  inspect(id) { return X.Inspect(id); },
  uiPreview(json, w, h) { return X && X.UIPreview ? X.UIPreview(json, w | 0, h | 0) : '{}'; },
  setValue(id, comp, member, json) { return X.SetValue(id, comp, member, json); },
  listFiles() { return JSON.parse(X.ListFiles()); },
  readFile(p) { return X.ReadFile(p); },
  writeFile(p, t) { X.WriteFile(p, t); },
  requestHierarchy() { X.RequestHierarchy(); },
};
bus.engine = engine;

function takeFrame(ev) {
  const r = { events: ev, frame: lastFrame, extras: lastExtras, meshes: meshQueue, textures: texQueue, audioClips: audioQueue };
  meshQueue = []; texQueue = []; audioQueue = [];
  return r;
}

function updateStatus() {
  if (engine.error) return;
  if (engine.ready && engine.compilerReady) setStatus('ready', 'C# ready');
  else if (engine.ready) setStatus('loading', 'C# compiler starting…');
}
function setStatus(kind, text) {
  engine.status = kind;
  const s = document.getElementById('engine-status');
  if (s) { s.className = 'engine-status ' + kind; s.textContent = text; s.title = engine.error || text; }
  bus.emit('engine-status', { kind, text });
}
