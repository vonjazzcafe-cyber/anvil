// Play mode: compile, start the C# world, feed input, tick every frame, show the results.
import { bus, toast, el } from '../core/events.js';
import { editor } from '../core/scene.js';
import { project, baseName } from '../core/project.js';
import { engine } from './engine.js';
import { drawGui, clearGui, setGuiTextureSource } from './gui.js';
import { applyAudio, uploadClip, stopAllAudio, setAudioPaused, unlockAudio } from './audio.js';
import { log, onPlayStart } from '../ui/console.js';
import { COMPONENTS, defaultFieldValue } from '../core/components.js';
import { ensureModels } from '../core/models.js';
import { usePhysicsEngine } from './engine.js';

let viewport = null;
let raf = 0, lastT = 0;
let gameFocused = false;
const held = new Set(); let downs = new Set(), ups = new Set(); let chars = '';
let mouse = [0, 0], buttonsHeld = 0, buttonsDown = 0, buttonsUp = 0, wheel = 0;
let pointerLocked = false, wantLock = false;
let statsOn = false, frameMs = 0, fps = 0, fpsAcc = 0, fpsN = 0, fpsT = 0;
let wasMode = 'scene';

export function initPlay(vp) {
  viewport = vp;
  setGuiTextureSource((uid) => viewport.rt.textureURL(uid));
  const canvasHost = document.getElementById('game-host');
  const hint = document.getElementById('game-hint');
  // focus handling: clicking the Game view gives it the keyboard
  document.addEventListener('pointerdown', (e) => {
    const inGame = canvasHost.contains(e.target) && viewport.mode === 'game';
    if (inGame !== gameFocused) { gameFocused = inGame; if (!gameFocused) releaseAll(); }
    hint.classList.toggle('hidden', !editor.playing || gameFocused);
  }, true);
  window.addEventListener('keydown', (e) => {
    if (!editor.playing || !gameFocused) return;
    if ((e.ctrlKey || e.metaKey) && ['KeyP', 'KeyS', 'KeyZ', 'KeyY'].includes(e.code)) return; // editor shortcuts
    if (e.code === 'Escape' && pointerLocked) { document.exitPointerLock(); }
    if (!held.has(e.code)) downs.add(e.code);
    held.add(e.code);
    if (e.key.length === 1) chars += e.key; else if (e.key === 'Backspace') chars += '\b'; else if (e.key === 'Enter') chars += '\n';
    e.preventDefault(); e.stopPropagation();
  }, true);
  window.addEventListener('keyup', (e) => {
    if (!editor.playing) return;
    if (held.has(e.code)) { held.delete(e.code); ups.add(e.code); }
    if (gameFocused) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  window.addEventListener('blur', releaseAll);
  const canvasEl = () => viewport.canvas;
  canvasHost.addEventListener('pointermove', (e) => {
    if (!editor.playing) return;
    if (pointerLocked) { mouse[0] += e.movementX; mouse[1] -= e.movementY; return; }
    const r = canvasEl().getBoundingClientRect();
    mouse = [e.clientX - r.left, r.height - (e.clientY - r.top)];
  });
  canvasHost.addEventListener('pointerdown', (e) => {
    if (!editor.playing) return;
    const b = e.button === 0 ? 1 : e.button === 2 ? 2 : e.button === 1 ? 4 : 0;
    buttonsHeld |= b; buttonsDown |= b;
    if (wantLock && !pointerLocked) canvasEl().requestPointerLock?.();
  });
  window.addEventListener('pointerup', (e) => {
    if (!editor.playing) return;
    const b = e.button === 0 ? 1 : e.button === 2 ? 2 : e.button === 1 ? 4 : 0;
    if (buttonsHeld & b) { buttonsHeld &= ~b; buttonsUp |= b; }
  });
  canvasHost.addEventListener('contextmenu', (e) => { if (editor.playing) e.preventDefault(); });
  canvasHost.addEventListener('wheel', (e) => { if (editor.playing && gameFocused) { wheel += e.deltaY < 0 ? 1 : -1; e.preventDefault(); } }, { passive: false });
  document.addEventListener('pointerlockchange', () => { pointerLocked = document.pointerLockElement === canvasEl(); });
  document.getElementById('game-stats').addEventListener('click', (e) => { statsOn = !statsOn; e.target.classList.toggle('active', statsOn); document.getElementById('game-stats-box').classList.toggle('hidden', !statsOn); });
  bus.on('request-pause', () => { if (editor.playing) setPaused(true); });
  bus.on('viewport-resized', ({ w, h, mode }) => { if (editor.playing && engine.ready && mode === 'game') engine.setScreen(w, h); });
}
function releaseAll() { for (const k of held) ups.add(k); held.clear(); if (buttonsHeld) { buttonsUp |= buttonsHeld; buttonsHeld = 0; } }

// Everything the C# side needs to start Play mode, kept small: built-in components only carry the values
// that differ from Unity's defaults, the open scene isn't sent twice, and only the text assets the game can
// reach (input actions, Resources folders, referenced files) are included.
export function buildPayload() {
  const s = project.settings;
  const files = project.data.files;
  const scenes = {};
  const build = project.scenesInBuild();
  for (const p of build) scenes[baseName(p)] = { name: baseName(p), objects: compactObjects(files[p].data.objects) };
  const names = build.map(baseName);
  const cur = baseName(editor.scenePath);
  const inBuild = build.includes(editor.scenePath);
  if (!names.includes(cur)) { names.unshift(cur); }
  const prefabs = {}, materials = {}, physicsMaterials = {}, physicsMaterials2D = {}, assets = {}, texts = {}, textures = {}, audio = {}, models = {}, controllers = {};
  const referenced = new Set();
  const collectRefs = (v) => { if (Array.isArray(v)) v.forEach(collectRefs); else if (v && typeof v === 'object') { if (typeof v.asset === 'string') referenced.add(v.asset); for (const x of Object.values(v)) collectRefs(x); } };
  for (const [p, f] of Object.entries(files)) {
    if (f.kind === 'prefab') { prefabs[p] = { objects: compactObjects(f.data.objects || []), nextId: f.data.nextId }; collectRefs(f.data); }
    else if (f.kind === 'material') materials[p] = f.data;
    else if (f.kind === 'physicsMaterial') physicsMaterials[p] = f.data;
    else if (f.kind === 'physicsMaterial2D') physicsMaterials2D[p] = f.data;
    else if (f.kind === 'asset') { assets[p] = f.data; collectRefs(f.data); }
    else if (f.kind === 'scene') collectRefs(f.data);
    else if (f.kind === 'texture') textures[p] = { w: f.data?.w || 1, h: f.data?.h || 1 };
    else if (f.kind === 'controller') controllers[p] = f.data || {};
    else if (f.kind === 'model') { models[p] = { meshes: f.data?.meshes || [], clips: f.data?.clips || [] }; prefabs[p] = { objects: compactObjects(f.data?.objects || []), nextId: f.data?.nextId }; }
    else if (f.kind === 'audio') audio[p] = { len: f.data?.len || 0, ch: f.data?.ch || 2, freq: f.data?.freq || 44100 };
  }
  for (const [p, f] of Object.entries(files)) {
    if (f.kind !== 'text') continue;
    if (p.endsWith('.inputactions')) { try { texts[p] = JSON.stringify(JSON.parse((f.text || '').replace(/^\uFEFF/, ''))); } catch { texts[p] = f.text || ''; } }
    else if (p.includes('/Resources/') || referenced.has(p)) texts[p] = f.text || '';
  }
  const [w, h] = viewport.gameSize();
  return {
    settings: {
      gravity: s.gravity, fixedTimestep: s.fixedTimestep, maxDeltaTime: s.maxDeltaTime, timeScale: s.timeScale,
      tags: s.tags, layers: s.layers, layerMatrix: s.layerMatrix, inputHandling: s.inputHandling, scenes: names,
      productName: s.productName, executionOrder: s.executionOrder, screen: [w, h], stackTraces: s.stackTraces !== false,
    },
    scene: inBuild ? { name: cur } : { name: cur, objects: compactObjects(editor.objects) },
    scenes, prefabs, materials, physicsMaterials, physicsMaterials2D, assets, texts, textures, audio, models, controllers,
    projectInputActions: files['Assets/InputSystem_Actions.inputactions'] ? 'Assets/InputSystem_Actions.inputactions' : null,
    playerPrefs: project.data.playerPrefs || {},
  };
}
function same(a, b) { return a === b || (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => same(x, b[i]))) || (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => same(a[k], b[k]))); }
function compactObjects(objects) { if (window.__noCompact) return objects;
  return objects.map(o => {
    const c = Object.assign({}, o);
    delete c.e;
    c.comps = o.comps.map(comp => {
      const def = COMPONENTS[comp.type];
      if (!def || def.full) return comp;
      const out = { type: comp.type };
      for (const [k, v] of Object.entries(comp)) {
        if (k === 'type') continue;
        const f = def.fields.find(x => x.key === k);
        if (f && f.type !== 'ref' && k !== 'mesh' && same(v, defaultFieldValue(f))) continue; // the engine already starts at Unity's defaults (a new MeshFilter has no mesh, so 'mesh' is always sent)
        if (k === 'enabled' && v === true) continue;
        out[k] = v;
      }
      return out;
    });
    return c;
  });
}

export async function play(compileFn) {
  if (editor.playing) { stop(); return; }
  unlockAudio();
  if (!engine.ready) { toast(engine.error ? 'The C# engine failed to load: ' + engine.error : 'The C# engine is still loading…', engine.error ? 'error' : ''); return; }
  const T = [performance.now()];
  const ok = await compileFn(true);
  await ensureModels(); // the engine reads imported models' meshes and clips from the page
  const physicsEngine = await usePhysicsEngine(project.settings.physicsEngine || 'physx');
  if (physicsEngine !== (project.settings.physicsEngine || 'physx')) log(1, 'PhysX could not load here, so this run uses the Rapier physics engine.');
  T.push(performance.now());
  if (!ok) { toast('All compiler errors have to be fixed before you can enter playmode!', 'error'); bus.emit('show-bottom-tab', 'console'); return; }
  onPlayStart();
  playEdits = 0;
  wasMode = viewport.mode;
  bus.emit('show-center-tab', 'game');
  editor.playing = true; editor.paused = false;
  editor.runtime = null;
  document.getElementById('app').classList.add('playing');
  viewport.enterPlay();
  gameFocused = true;
  document.getElementById('game-hint').classList.add('hidden');
  const [w, h] = viewport.gameSize();
  engine.setScreen(w, h);
  T.push(performance.now());
  let err;
  const payload = JSON.stringify(buildPayload());
  T.push(performance.now());
  try { err = engine.beginPlay(payload); }
  catch (e) { err = String(e); }
  T.push(performance.now());
  try { applyEvents(engine.frame()); } catch (e) { }
  T.push(performance.now());
  const d = T.slice(1).map((t, i) => Math.round(t - T[i]));
  window.__playTiming = { compile: d[0], ui: d[1], payload: d[2], beginPlay: d[3], firstFrame: d[4], cs: engine.playTiming?.() };
  if (err) { log(0, 'Could not enter play mode: ' + err); stop(); return; }
  bus.emit('play-state', { playing: true });
  lastT = performance.now();
  raf = requestAnimationFrame(loop);
}

function loop(t) {
  if (!editor.playing) return;
  raf = requestAnimationFrame(loop);
  let dt = (t - lastT) / 1000; lastT = t;
  if (editor.paused) return;
  step(dt);
  fpsAcc += dt; fpsN++;
  if (t - fpsT > 500) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; fpsT = t; updateStats(); }
}

function step(dt) {
  try {
    engine.setInput([...held].join('|'), [...downs].join('|'), [...ups].join('|'), chars, mouse[0], mouse[1], buttonsHeld, buttonsDown, buttonsUp, wheel);
    downs = new Set(); ups = new Set(); chars = ''; buttonsDown = 0; buttonsUp = 0; wheel = 0;
    const t0 = performance.now();
    const r = engine.tick(dt);
    frameMs = performance.now() - t0;
    applyEvents(r);
  } catch (e) {
    console.error(e);
    log(4, 'Engine error: ' + (e.message || e) + '\nPlay mode was stopped. If this keeps happening, reload the page.');
    stop(true);
  }
}

function applyEvents(r) {
  const ev = JSON.parse(r.events || '{}');
  // new meshes, textures, materials and text first: the frame refers to them
  viewport.applyRuntimeAssets({ meshes: r.meshes, meshAssets: ev.meshAssets, textures: r.textures, texAssets: ev.texAssets, mats: ev.mats, texts: ev.texts, meshGone: ev.meshGone, extras: r.extras });
  if (r.frame) viewport.applyFrame(r.frame);
  if (r.audioClips) for (const [uid, ch, freq, data] of r.audioClips) uploadClip(uid, ch, freq, data);
  if (ev.audio) applyAudio(ev.audio);
  if (ev.logs) for (const l of ev.logs) log(l.t, l.m, l.s, l.id ? { id: l.id } : {});
  if (ev.hier) { editor.runtime = ev.hier; bus.emit('runtime-hierarchy'); }
  const overlay = document.getElementById('gui-overlay');
  if (ev.gui) {
    const c = viewport.canvas, host = document.getElementById('game-host');
    const cr = c.getBoundingClientRect(), hr = host.getBoundingClientRect();
    drawGui(overlay, viewport.mode === 'game' ? ev.gui : null, 1, 1, cr.left - hr.left, cr.top - hr.top);
  } else clearGui();
  viewport.setDebugLines(ev.lines || null);
  if (ev.prefs) { project.data.playerPrefs = ev.prefs; project.touch('prefs'); }
  if (ev.url) window.open(ev.url, '_blank', 'noopener');
  wantLock = ev.cursorLock === 1;
  if (!wantLock && pointerLocked) document.exitPointerLock?.();
  if (wantLock && gameFocused && !pointerLocked) viewport.canvas.requestPointerLock?.();
  viewport.canvas.style.cursor = ev.cursorVisible === false && gameFocused ? 'none' : '';
  if (ev.pause) setPaused(true);
  if (ev.quit) { log(3, 'Application.Quit() called — play mode stopped (in a build the game would close).'); stop(); }
  bus.lastTime = ev.time;
}

function updateStats() {
  if (!statsOn) return;
  document.getElementById('game-stats-box').textContent =
    `FPS ${fps.toFixed(0)}\nC# frame ${frameMs.toFixed(2)} ms\nScreen ${viewport.width}x${viewport.height}\nTime ${bus.lastTime ?? 0}`;
}

export function setPaused(p) {
  if (!editor.playing) return;
  editor.paused = p;
  setAudioPaused(p);
  bus.emit('play-state', { playing: true, paused: p });
}
export function stepOnce() {
  if (!editor.playing) return;
  if (!editor.paused) setPaused(true);
  step(project.settings.fixedTimestep || 0.02);
}

// Like Unity, whatever you change while playing is thrown away at Stop. Anvil says so, because a reference dragged
// into a slot during Play otherwise just quietly disappears.
let playEdits = 0;
bus.on('play-edit', () => {
  if (!editor.playing) return;
  if (playEdits++ === 0) toast('You are playing: this change only lasts until you press Stop.', 'warn', 4500);
});
export function stop(fromError = false) {
  if (!editor.playing) return;
  if (playEdits > 0) {
    toast(`${playEdits} change${playEdits > 1 ? 's' : ''} made while playing ${playEdits > 1 ? 'were' : 'was'} undone, like in Unity. To keep values, use the component's ⋮ › Copy Component while playing, then ⋮ › Paste Component Values after stopping — or just make the change again now.`, 'warn', 9000);
    playEdits = 0;
  }
  cancelAnimationFrame(raf);
  try { if (!fromError) { const ev = engine.endPlay(); applyEvents({ events: ev, frame: null }); } else engine.endPlay(); } catch (e) { }
  editor.playing = false; editor.paused = false; editor.runtime = null;
  stopAllAudio(); setAudioPaused(false);
  releaseAll(); downs.clear(); ups.clear();
  if (document.pointerLockElement) document.exitPointerLock();
  document.getElementById('app').classList.remove('playing');
  document.getElementById('game-hint').classList.add('hidden');
  clearGui();
  viewport.canvas.style.cursor = '';
  viewport.exitPlay();
  editor.selection = editor.selection.filter(id => editor.get(id));
  bus.emit('play-state', { playing: false });
  engine.prepareNextPlay();
  bus.emit('selection-changed');
  bus.emit('show-center-tab', wasMode === 'game' ? 'game' : 'scene');
}
