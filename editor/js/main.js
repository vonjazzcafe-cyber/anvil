// Anvil editor entry point: wires panels, menus, shortcuts, compile flow and play mode together.
import { bus, el, debounce, toast, clone } from './core/events.js';
import { project, storage, newProject, baseName, kindOf, newSceneData, fileName } from './core/project.js';
import { editor } from './core/scene.js';
import { Viewport } from './viewport/viewport.js';
import { initHierarchy, startRename } from './ui/hierarchy.js';
import { initInspector, scriptMeta, showSettingsTab, addScriptOrComponent } from './ui/inspector.js';
import { initProjectPanel, download, currentFolder, importAssetsDialog } from './ui/project-panel.js';
import { initConsole, log, setCompileMessages, clearConsole, hasCompileErrors, getEntries } from './ui/console.js';
import { menuBar, showMenu } from './ui/menus.js';
import { createMenuItems } from './ui/create-menu.js';
import { prompt, confirm, dialog, alertBox, pick } from './ui/dialogs.js';
import * as code from './ui/code-editor.js';
import { engine } from './runtime/engine.js';
import { initPlay, play, stop, setPaused, stepOnce } from './runtime/play.js';
import { exportUnityZip, exportProjectZip, importProjectZip } from './export/exporter.js';
import { githubDialog } from './export/github.js';
import { COMPONENTS } from './core/components.js';
import { initOffline } from './core/offline.js';
import { initUiPreview } from './runtime/ui-preview.js';
import { rectSize } from './ui/ui-inspector.js';
import { createUI } from './core/ui-create.js';
import { initLocalFolder, openProjectFolder, saveProjectToFolder, reconnectFolder, disconnectFolder, linkedFolderName, folderSupported } from './core/local-folder.js';

let viewport;
const openTabs = [];          // open script paths (center tabs)
let centerOrder = ['scene', 'game']; // the order the center tabs are shown in (they can be dragged around)
let centerTab = 'scene';
let scriptsDirty = true;
let lastCompileOk = false;

async function boot() {
  initLocalFolder();
  bus.on('folder-status', updateFolderStatus);
  const last = (await storage.get('lastProject')) || 'My Project';
  await project.load(last);
  viewport = new Viewport(document.getElementById('scene-host'), document.getElementById('game-host'));
  viewport.controller.setState(project.data.editor.sceneCamera);
  bus.on('scene-camera-moved', debounce(() => { if (project.data) { project.data.editor.sceneCamera = viewport.controller.state(); project.touch('editor'); } }, 1500));
  initHierarchy();
  initInspector();
  initProjectPanel();
  initConsole();
  initPlay(viewport);
  initUiPreview(viewport);
  initMenus();
  initToolbar();
  initTabs();
  initSplitters();
  initPanels();
  initShortcuts();
  initDrops();
  bus.on('scene-changed', () => { if (!editor.playing) viewport.syncFromScene(); updateTitle(); });
  bus.on('selection-changed', () => { viewport.updateHelpers(); viewport.attachGizmo(); viewport.needsRender = true; });
  bus.on('frame-selected', () => { showCenter('scene'); viewport.frameSelected(); });
  bus.on('open-script', ({ path, line, col }) => openScript(path, line, col));
  bus.on('open-scene', (p) => openScene(p));
  bus.on('scripts-changed', (e) => { scriptsDirty = true; if (e?.compile) compileSoon(); });
  bus.on('show-bottom-tab', showBottom);
  bus.on('show-center-tab', showCenter);
  bus.on('status', (s) => { const m = document.getElementById('status-msg'); if (typeof s === 'string') { m.textContent = s; m.className = ''; } else { m.textContent = s.text; m.className = 't' + s.t; } });
  bus.on('toast', (m) => toast(m));
  bus.on('play-state', updatePlayButtons);
  bus.on('project-loaded', onProjectLoaded);
  bus.on('code-dirty', renderCenterTabs);
  bus.on('asset-renamed', ({ from, to }) => { const i = openTabs.indexOf(from); if (i >= 0) { code.renamedFile(from, to); openTabs[i] = to; const oi = centerOrder.indexOf(from); if (oi >= 0) centerOrder[oi] = to; if (centerTab === from) { centerTab = to; } renderCenterTabs(); if (centerTab === to) code.openFile(to); } });
  bus.on('asset-deleted', (p) => { for (const t of [...openTabs]) if (t === p || t.startsWith(p + '/')) closeTab(t); });
  bus.on('engine-ready', () => { engine.setInputHandling(project.settings.inputHandling); compileNow(); });
  bus.on('engine-failed', (msg) => log(2, 'The C# engine could not start: ' + msg + '\nYou can still build scenes; Play and script compiling need the engine.'));
  bus.on('input-handling-changed', () => { engine.ready && engine.setInputHandling(project.settings.inputHandling); scriptsDirty = true; compileSoon(); });
  onProjectLoaded();
  viewport.setMode('scene');
  engine.load();
  initOffline();
  document.getElementById('boot')?.remove();
  window.anvil = { project, editor, viewport, engine, bus, compileNow, play: () => play(compileBeforePlay), stop, setPaused, stepOnce, scriptMeta, addScriptOrComponent, openScript, showCenter, showBottom, getEntries, rectSize, createUI };
}

function onProjectLoaded() {
  editor.selection = []; editor.clearUndo();
  for (const t of [...openTabs]) closeTab(t, true);
  document.getElementById('project-name').textContent = project.name;
  viewport?.syncFromScene();
  bus.emit('scene-changed', { label: 'load' });
  bus.emit('selection-changed');
  scriptsDirty = true;
  engine.setInputHandling(project.settings.inputHandling);
  if (engine.ready) compileNow();
  updateTitle();
}
function updateTitle() { document.title = `Anvil — ${project.name} — ${editor.scenePath ? baseName(editor.scenePath) : ''}${project.dirty ? '*' : ''}`; }

// ---------------- compile ----------------
const compileSoon = debounce(() => compileNow(), 350);
let compilePromise = null;
// Compile all scripts with Roslyn. Calls made while a compile runs wait for it, then recompile if needed.
export function compileNow(force = false) {
  if (engine.error) return Promise.resolve(false);
  if (compilePromise) return compilePromise.then(() => (scriptsDirty || force) ? compileNow(false) : lastCompileOk);
  if (!scriptsDirty && !force && lastCompileOk) return Promise.resolve(true);
  scriptsDirty = true;
  compilePromise = doCompile().finally(() => { compilePromise = null; });
  return compilePromise;
}
async function doCompile() {
  const status = document.getElementById('status-compile');
  status.textContent = 'Compiling…';
  await new Promise(r => setTimeout(r, 20));
  try {
    scriptsDirty = false;
    const scripts = project.scripts();
    const res = await engine.compile(scripts);
    for (const d of res.diags) {   // CS0101 = same class declared twice: say which other file holds the copy
      if (d.id !== 'CS0101') continue;
      const m = /'(\w+)'[^']*$/.exec(d.message); if (!m) continue;
      const others = scripts.filter(f => f.path !== d.file && new RegExp('\\b(class|struct|enum|interface)\\s+' + m[1] + '\\b').test(f.code)).map(f => f.path);
      d.message += others.length ? ` - the other copy is in: ${others.join(', ')}. Delete it or rename the class.` : ` - no other file declares it; the error may be stale, press Ctrl+S.`;
    }
    setCompileMessages(res.diags);
    lastCompileOk = res.ok;
    if (res.ok) {
      scriptMeta.clear();
      for (const m of res.meta) scriptMeta.set(m.name, m);
      warnClassFileMismatch(scripts);
      bus.emit('meta-changed');
      status.textContent = !scripts.length ? '' : res.cached ? 'Scripts up to date' : `Compiled ${scripts.length} script${scripts.length === 1 ? '' : 's'} in ${res.ms} ms`;
    } else {
      status.textContent = 'Compile errors';
      bus.emit('show-bottom-tab', 'console');
    }
    code.relint();
    return res.ok;
  } catch (e) {
    console.error(e);
    log(0, 'Compiler crashed: ' + (e.message || e));
    lastCompileOk = false;
    return false;
  }
}
function warnClassFileMismatch(scripts) {
  for (const [name, m] of scriptMeta) {
    if (m.kind !== 'MonoBehaviour' && m.kind !== 'ScriptableObject') continue;
    if (!scripts.some(s => baseName(s.path) === name)) {
      const file = scripts.find(s => new RegExp('class\\s+' + name + '\\b').test(s.code));
      if (file) log(2, `${m.kind} '${name}' is declared in '${fileName(file.path)}'. Unity only lets you add it to a GameObject if the file is named '${name}.cs'.`);
    }
  }
}
async function compileBeforePlay() {
  code.saveAll();
  if (scriptsDirty || !lastCompileOk) return compileNow(true);
  return !hasCompileErrors();
}

// ---------------- center tabs (Scene | Game | scripts) ----------------
function initTabs() {
  renderCenterTabs();
  document.querySelectorAll('#bottom-tabs .tab').forEach(t => t.addEventListener('click', () => showBottom(t.dataset.tab)));
  document.getElementById('game-aspect').addEventListener('change', (e) => { viewport.aspect = e.target.value; viewport.resize(); });
}
function renderCenterTabs() {
  const bar = document.getElementById('center-tabs');
  bar.innerHTML = '';
  // keep the order list in step with what's open: closed tabs drop out, new ones go on the end
  centerOrder = centerOrder.filter(id => id === 'scene' || id === 'game' || openTabs.includes(id));
  for (const id of ['scene', 'game', ...openTabs]) if (!centerOrder.includes(id)) centerOrder.push(id);
  const tab = (id, label, closable) => {
    const dirty = closable && code.anyDirty && isDirty(id);
    const t = el('div', { class: 'tab' + (centerTab === id ? ' active' : '') + (dirty ? ' dirty' : '') }, el('span', { class: 'tname', text: label }));
    t.dataset.id = id;
    if (closable) { const x = el('span', { class: 'close', text: '✕', title: 'Close' }); x.addEventListener('click', (e) => { e.stopPropagation(); closeTab(id); }); t.append(x); }
    t.addEventListener('click', () => { if (t.dataset.dragged) { delete t.dataset.dragged; return; } showCenter(id); });
    t.addEventListener('auxclick', (e) => { if (e.button === 1 && closable) closeTab(id); });
    t.addEventListener('pointerdown', (e) => startTabDrag(e, t, bar));
    bar.append(t);
  };
  for (const id of centerOrder) {
    if (id === 'scene') tab('scene', '# Scene');
    else if (id === 'game') tab('game', '◉ Game');
    else tab(id, fileName(id), true);
  }
  // keep the active tab in view when the bar is scrolled
  bar.querySelector('.tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  if (!bar.dataset.wheel) {
    bar.dataset.wheel = '1';
    bar.addEventListener('wheel', (e) => { if (bar.scrollWidth > bar.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) { bar.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
  }
}
// drag a center tab sideways to move it; a blue line shows where it will land
function startTabDrag(e, t, bar) {
  if (e.button !== 0 || e.target.closest('.close')) return;
  const startX = e.clientX; let dragging = false, dropAt = -1, scrollTimer = 0, lastX = startX;
  const marker = el('div', { class: 'tab-drop-marker' });
  const others = () => [...bar.querySelectorAll('.tab')].filter(x => x !== t);
  const place = (x) => {
    const list = others(); let i = list.length;
    for (let k = 0; k < list.length; k++) { const r = list[k].getBoundingClientRect(); if (x < r.left + r.width / 2) { i = k; break; } }
    dropAt = i;
    const br = bar.getBoundingClientRect();
    const ref = list[i] ? list[i].getBoundingClientRect().left : (list.length ? list[list.length - 1].getBoundingClientRect().right + 2 : br.left);
    marker.style.left = (ref - br.left + bar.scrollLeft - 2) + 'px';
  };
  const move = (ev) => {
    lastX = ev.clientX;
    if (!dragging) {
      if (Math.abs(ev.clientX - startX) < 6) return;
      dragging = true; t.classList.add('dragging'); bar.append(marker);
      // scroll the bar when dragging near its ends
      scrollTimer = setInterval(() => {
        const br = bar.getBoundingClientRect();
        if (lastX < br.left + 30) bar.scrollLeft -= 12; else if (lastX > br.right - 30) bar.scrollLeft += 12; else return;
        place(lastX);
      }, 30);
    }
    t.style.transform = `translateX(${ev.clientX - startX}px)`;
    place(ev.clientX);
  };
  const up = () => {
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
    clearInterval(scrollTimer); marker.remove();
    if (!dragging) return;
    t.dataset.dragged = '1'; t.classList.remove('dragging'); t.style.transform = '';
    const id = t.dataset.id;
    const rest = others().map(x => x.dataset.id);
    rest.splice(Math.max(0, Math.min(rest.length, dropAt)), 0, id);
    centerOrder = rest;
    renderCenterTabs();
  };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
}
const dirtyMap = new Set();
bus.on('code-dirty', ({ path, dirty }) => { if (dirty) dirtyMap.add(path); else dirtyMap.delete(path); });
function isDirty(p) { return dirtyMap.has(p); }
function showCenter(id) {
  const prev = centerTab;
  centerTab = id;
  document.getElementById('view-scene').classList.toggle('hidden', id !== 'scene');
  document.getElementById('view-game').classList.toggle('hidden', id !== 'game');
  document.getElementById('view-code').classList.toggle('hidden', id === 'scene' || id === 'game');
  if (id === 'scene' || id === 'game') {
    viewport.setMode(id);
    bus.emit('center-view', id);
    // like Unity: coming back from the code editor recompiles
    if (prev !== 'scene' && prev !== 'game') { code.saveAll(); if (scriptsDirty) compileSoon(); }
  } else code.openFile(id);
  renderCenterTabs();
}
function openScript(path, line, col) {
  if (!project.file(path)) { toast('Not found: ' + path, 'error'); return; }
  if (!openTabs.includes(path)) openTabs.push(path);
  showCenter(path);
  if (line) code.goTo(path, line, col);
}
function closeTab(path, silent) {
  const i = openTabs.indexOf(path); if (i < 0) return;
  code.closeFile(path);
  openTabs.splice(i, 1);
  dirtyMap.delete(path);
  if (centerTab === path) showCenter(openTabs[i] || openTabs[i - 1] || 'scene');
  else if (!silent) renderCenterTabs();
}
function showBottom(id) {
  document.querySelectorAll('#bottom-tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === id));
  document.getElementById('project-view').classList.toggle('hidden', id !== 'project');
  document.getElementById('console-view').classList.toggle('hidden', id !== 'console');
  document.getElementById('files-view').classList.toggle('hidden', id !== 'files');
  if (id === 'files') renderFilesView();
}
function renderFilesView() {
  const v = document.getElementById('files-view');
  v.innerHTML = '';
  v.append(el('div', { class: 'insp-note info', text: 'Files your scripts write with System.IO (for example to Application.persistentDataPath) live in the browser while playing. Download them here before you stop playing.' }));
  if (!engine.ready) return;
  const files = engine.listFiles();
  if (!files.length) v.append(el('div', { style: { color: '#888', padding: '8px' }, text: 'No files yet.' }));
  for (const f of files) {
    const dl = el('button', { class: 'btn small', text: 'Download' });
    dl.addEventListener('click', () => download(f.path.split('/').pop(), engine.readFile(f.path)));
    const add = el('button', { class: 'btn small', text: 'Copy into Assets' });
    add.addEventListener('click', () => { const p = project.uniquePath('Assets', f.path.split('/').pop().replace(/\.[^.]+$/, ''), f.path.split('.').pop() || 'txt'); project.writeText(p, engine.readFile(f.path)); toast('Saved as ' + p); });
    v.append(el('div', { class: 'file-row' }, el('span', { class: 'fname', text: f.path }), el('span', { text: f.size + ' B', style: { color: '#888' } }), dl, add));
  }
  const refresh = el('button', { class: 'btn small', text: 'Refresh', style: { marginTop: '8px' } });
  refresh.addEventListener('click', renderFilesView);
  v.append(refresh);
}

// ---------------- toolbar ----------------
function initToolbar() {
  document.querySelectorAll('#transform-tools .tbtn').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
  const space = document.getElementById('btn-space');
  space.addEventListener('click', () => { const local = space.textContent === 'Local'; space.textContent = local ? 'Global' : 'Local'; viewport.setSpace(local ? 'world' : 'local'); });
  const snap = document.getElementById('btn-snap');
  snap.addEventListener('click', () => { const on = !viewport.snap; viewport.setSnap(on); snap.textContent = on ? 'Snap on' : 'Snap off'; snap.classList.toggle('active', on); });
  document.getElementById('btn-play').addEventListener('click', () => play(compileBeforePlay));
  document.getElementById('btn-pause').addEventListener('click', () => { if (editor.playing) setPaused(!editor.paused); });
  document.getElementById('btn-step').addEventListener('click', () => stepOnce());
  document.getElementById('btn-export').addEventListener('click', () => exportUnityZip());
  document.getElementById('btn-github').addEventListener('click', () => githubDialog());
  document.getElementById('scene-grid').addEventListener('click', (e) => { viewport.showGrid = !viewport.showGrid; e.target.classList.toggle('active', viewport.showGrid); viewport.needsRender = true; });
  document.getElementById('scene-gizmos').addEventListener('click', (e) => { viewport.showGizmos = !viewport.showGizmos; e.target.classList.toggle('active', viewport.showGizmos); viewport.updateHelpers(); viewport.needsRender = true; });
  document.getElementById('game-gizmos').addEventListener('click', (e) => { viewport.gameGizmos = !viewport.gameGizmos; e.target.classList.toggle('active', viewport.gameGizmos); viewport.needsRender = true; });
  document.getElementById('scene-2d').addEventListener('click', () => { viewport.controller.lookAlong(new (viewport.sceneCam.position.constructor)(0, 0, -1)); });
  updatePlayButtons();
}
function setTool(t) {
  document.querySelectorAll('#transform-tools .tbtn').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
  viewport.setTool(t);
}
function updatePlayButtons() {
  document.getElementById('btn-play').classList.toggle('on', editor.playing);
  document.getElementById('btn-pause').classList.toggle('on', editor.paused);
}

// ---------------- splitters ----------------
function initSplitters() {
  const root = document.documentElement;
  const saved = project.data.editor.layout;
  if (saved) for (const [k, v] of Object.entries(saved)) root.style.setProperty(k, v);
  document.querySelectorAll('.splitter').forEach(sp => {
    sp.addEventListener('pointerdown', (e) => {
      e.preventDefault(); sp.classList.add('drag'); sp.setPointerCapture(e.pointerId);
      const kind = sp.dataset.split;
      // drag a divider almost to the window edge and its panel closes; drag the strip back out to reopen it
      const MIN = { left: 140, right: 220, bottom: 90 }, MAX = { left: 0.45, right: 0.5, bottom: 0.7 };
      const move = (ev) => {
        const ws = document.getElementById('workspace').getBoundingClientRect();
        const raw = kind === 'left' ? ev.clientX - ws.left : kind === 'right' ? ws.right - ev.clientX : ws.bottom - ev.clientY;
        const close = raw < MIN[kind] / 2;
        window.anvilPanels?.set(kind, close);
        if (close) return;
        const lim = (kind === 'bottom' ? window.innerHeight : window.innerWidth) * MAX[kind];
        root.style.setProperty('--' + kind, Math.max(MIN[kind], Math.min(lim, raw)) + 'px');
      };
      const up = () => {
        sp.classList.remove('drag'); sp.removeEventListener('pointermove', move); sp.removeEventListener('pointerup', up);
        project.data.editor.layout = { '--left': root.style.getPropertyValue('--left'), '--right': root.style.getPropertyValue('--right'), '--bottom': root.style.getPropertyValue('--bottom') };
        project.touch('editor');
      };
      sp.addEventListener('pointermove', move); sp.addEventListener('pointerup', up);
    });
  });
}

// ---------------- collapsible panels ----------------
const PANELS = { left: 'hide-left', right: 'hide-right', bottom: 'hide-bottom' };
function initPanels() {
  const ws = document.getElementById('workspace');
  let saved = {}; try { saved = JSON.parse(localStorage.getItem('anvil-panels') || '{}'); } catch {}
  const apply = () => {
    for (const [k, cls] of Object.entries(PANELS)) {
      ws.classList.toggle(cls, !!saved[k]);
      document.querySelector(`.pan-btn[data-panel="${k}"]`)?.classList.toggle('off', !!saved[k]);
    }
    try { localStorage.setItem('anvil-panels', JSON.stringify(saved)); } catch {}
    window.dispatchEvent(new Event('resize'));
  };
  const toggle = (k) => { saved[k] = !saved[k]; apply(); };
  const set = (k, hidden) => { if (!!saved[k] !== hidden) { saved[k] = hidden; apply(); } };
  window.anvilPanels = {
    toggle, set,
    show: () => { saved = {}; apply(); },
    focusCode: () => { const all = !(saved.left && saved.right && saved.bottom); saved = { left: all, right: all, bottom: all }; apply(); },
  };
  document.querySelectorAll('.pan-btn').forEach(b => b.addEventListener('click', () => toggle(b.dataset.panel)));
  document.querySelectorAll('.splitter').forEach(sp => {
    sp.addEventListener('dblclick', () => toggle(sp.dataset.split));
    sp.title = 'Drag to resize · drag to the edge to close · drag back out (or double-click) to reopen';
  });
  apply();
}

// ---------------- shortcuts ----------------
function initShortcuts() {
  window.addEventListener('keydown', (e) => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || document.activeElement?.closest?.('.cm-editor');
    const mod = e.ctrlKey || e.metaKey;
    if (e.altKey && !mod && !e.shiftKey && window.anvilPanels) {
      const k = { Digit1: 'left', Digit2: 'right', Digit3: 'bottom' }[e.code];
      if (k) { e.preventDefault(); window.anvilPanels.toggle(k); return; }
      if (e.code === 'Digit0') { e.preventDefault(); window.anvilPanels.focusCode(); return; }
    }
    if (mod && e.code === 'KeyP') { e.preventDefault(); if (e.shiftKey) { if (editor.playing) setPaused(!editor.paused); } else if (e.altKey) stepOnce(); else play(compileBeforePlay); return; }
    if (mod && e.code === 'KeyS' && !document.activeElement?.closest?.('.cm-editor')) { e.preventDefault(); saveProject(); return; }
    if (typing) return;
    if (mod && e.code === 'KeyZ') { e.preventDefault(); if (e.shiftKey) editor.redo(); else editor.undo(); return; }
    if (mod && e.code === 'KeyY') { e.preventDefault(); editor.redo(); return; }
    if (mod && e.code === 'KeyD' && editor.selection.length && !editor.playing) { e.preventDefault(); editor.duplicate(editor.selection); return; }
    if (mod && e.shiftKey && e.code === 'KeyN' && !editor.playing) { e.preventDefault(); editor.createEmpty(0); return; }
    if (mod) return;
    if (viewport.controller.mode === 'fly') return;
    const inProject = document.activeElement?.closest?.('#project-view');
    if (e.code === 'Delete' && editor.selection.length && !editor.playing && !inProject) { editor.remove(editor.selection); e.preventDefault(); }
    else if (e.code === 'KeyF' && !inProject) { viewport.frameSelected(); }
    else if (e.code === 'KeyQ') setTool('view');
    else if (e.code === 'KeyW') setTool('translate');
    else if (e.code === 'KeyE') setTool('rotate');
    else if (e.code === 'KeyR') setTool('scale');
    else if (e.code === 'KeyX') document.getElementById('btn-space').click();
    else if (e.code === 'F2' && editor.selected != null && !inProject) startRename(editor.selected);
  });
}

// ---------------- drag & drop of assets ----------------
function initDrops() {
  bus.on('asset-dropped-on-object', ({ id, path }) => applyAssetToObject(id, path));
  const sceneHost = document.getElementById('scene-host');
  sceneHost.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('anvil/asset')) e.preventDefault(); });
  sceneHost.addEventListener('drop', (e) => {
    const path = e.dataTransfer.getData('anvil/asset'); if (!path || editor.playing) return;
    e.preventDefault();
    const kind = kindOf(path);
    if (kind === 'prefab' || kind === 'model') {
      const p = viewport.controller.pivot;
      editor.instantiatePrefab(path, 0, [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100, Math.round(-p.z * 100) / 100]);
    } else if (kind === 'texture') {
      const p = viewport.controller.pivot;
      editor.createSprite(path, 0, [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100, 0]);
    } else if (editor.selected != null) applyAssetToObject(editor.selected, path);
  });
}
function applyAssetToObject(id, path) {
  const o = editor.get(id); if (!o) return;
  const kind = kindOf(path);
  if (kind === 'script') {
    const name = baseName(path);
    const m = scriptMeta.get(name);
    if (!m) { toast(hasCompileErrors() ? 'Fix the compile errors first, then add the script.' : `Can't add script behaviour ${name}. The script needs to derive from MonoBehaviour!`, 'error'); return; }
    if (m.kind !== 'MonoBehaviour') { toast(`${name} is a ${m.kind}, not a MonoBehaviour, so it can't be added to a GameObject.`, 'error'); return; }
    if (m.abstract) { toast(`The script ${name} is abstract and can't be added.`, 'error'); return; }
    addScriptOrComponent(id, { type: 'Script', script: name });
  } else if (kind === 'material') {
    const ci = o.comps.findIndex(c => c.type === 'MeshRenderer');
    if (ci >= 0) editor.setComp(id, ci, 'material', path); else toast('That object has no Mesh Renderer');
  } else if (kind === 'physicsMaterial2D') {
    const ci = o.comps.findIndex(c => /Collider2D$/.test(c.type) || c.type === 'Rigidbody2D');
    if (ci >= 0) editor.setComp(id, ci, 'sharedMaterial', path); else toast('That object has no 2D Collider');
  } else if (kind === 'physicsMaterial') {
    const ci = o.comps.findIndex(c => /Collider$/.test(c.type));
    if (ci >= 0) editor.setComp(id, ci, 'material', path); else toast('That object has no Collider');
  } else if (kind === 'prefab' || kind === 'model') editor.instantiatePrefab(path, id);
  else if (kind === 'texture') {
    const ci = o.comps.findIndex(c => c.type === 'SpriteRenderer' || c.type === 'Image');
    if (ci >= 0) editor.setComp(id, ci, 'sprite', path); else toast('That object has no Sprite Renderer or Image');
  }
}

// ---------------- scenes & projects ----------------
async function openScene(path) {
  if (editor.playing) { toast('Stop playing before opening another scene'); return; }
  if (!project.file(path)) return;
  project.data.openScene = path;
  editor.selection = []; editor.clearUndo();
  project.touch('scene');
  bus.emit('scene-opened');
  bus.emit('scene-changed', { label: 'open' });
  bus.emit('selection-changed');
}
async function newScene() {
  const name = await prompt('New Scene', 'Scene name:', 'New Scene', 'Create');
  if (!name) return;
  const p = project.uniquePath('Assets/Scenes', name, 'unity');
  project.writeData(p, newSceneData());
  openScene(p);
}
async function saveProject() {
  code.saveAll();
  await project.saveNow();
  toast('Saved (in this browser). Use Export or GitHub to move it to another PC.');
  updateTitle();
}
async function newProjectDialog() {
  const name = await prompt('New Project', 'Project name:', 'My Project ' + new Date().toISOString().slice(0, 10), 'Create');
  if (!name) return;
  if ((await storage.listProjects()).includes(name)) { toast('A project with that name already exists', 'error'); return; }
  await project.saveNow();
  const p = newProject(name);
  await project.replace(p);
}
async function openProjectDialog() {
  const names = await storage.listProjects();
  const r = await pick('Open Project', names.map(n => ({ label: n, hint: n === project.name ? 'open' : '', value: n })));
  if (!r || r === project.name) return;
  await project.saveNow();
  await project.load(r);
}
async function deleteProjectDialog() {
  const names = (await storage.listProjects()).filter(n => n !== project.name);
  if (!names.length) { toast('No other projects to delete (you can’t delete the open one).'); return; }
  const r = await pick('Delete Project', names.map(n => ({ label: n, value: n })));
  if (!r) return;
  if (await confirm('Delete project', `Delete "${r}" from this browser? This can't be undone.`, 'Delete', true)) { await storage.deleteProject(r); toast('Deleted ' + r); }
}
async function renameProjectDialog() {
  const name = await prompt('Rename Project', 'New name:', project.name, 'Rename');
  if (!name || name === project.name) return;
  if ((await storage.listProjects()).includes(name)) { toast('That name is taken', 'error'); return; }
  const old = project.name;
  project.data.name = name;
  await project.saveNow();
  await storage.deleteProject(old);
  await storage.set('lastProject', name);
  document.getElementById('project-name').textContent = name;
}

// ---------------- menus ----------------
function initMenus() {
  menuBar(document.getElementById('menus'), [
    ['File', () => [
      { label: 'New Scene', action: newScene },
      { label: 'Open Scene…', action: async () => { const r = await pick('Open Scene', Object.keys(project.data.files).filter(p => project.file(p).kind === 'scene').map(p => ({ label: baseName(p), hint: p, value: p }))); if (r) openScene(r); } },
      { label: 'Save', shortcut: 'Ctrl+S', action: saveProject },
      '-',
      { label: 'New Project…', action: newProjectDialog },
      { label: 'Open Project…', action: openProjectDialog },
      { label: 'Rename Project…', action: renameProjectDialog },
      { label: 'Delete a Project…', action: deleteProjectDialog },
      '-',
      { label: linkedFolderName() ? `Project Folder: ${linkedFolderName()}` : 'Open Project Folder on This Computer…', disabled: !folderSupported() || !!linkedFolderName(), action: () => openProjectFolder() },
      { label: 'Save Project to a Folder…', disabled: !folderSupported(), action: () => saveProjectToFolder() },
      { label: 'Reconnect Project Folder', disabled: !folderSupported() || !!linkedFolderName(), action: () => reconnectFolder() },
      { label: 'Stop Saving to Folder', disabled: !linkedFolderName(), action: () => disconnectFolder() },
      '-',
      { label: 'Export to Unity (.zip)…', action: () => exportUnityZip() },
      { label: 'Download Project Backup (.zip)', action: () => exportProjectZip() },
      { label: 'Import Project Backup (.zip)…', action: () => importProjectZip() },
      { label: 'Sync with GitHub…', action: () => githubDialog() },
    ]],
    ['Edit', () => [
      { label: 'Undo', shortcut: 'Ctrl+Z', disabled: editor.playing, action: () => editor.undo() },
      { label: 'Redo', shortcut: 'Ctrl+Y', disabled: editor.playing, action: () => editor.redo() },
      '-',
      { label: 'Duplicate', shortcut: 'Ctrl+D', disabled: !editor.selection.length || editor.playing, action: () => editor.duplicate(editor.selection) },
      { label: 'Delete', shortcut: 'Del', disabled: !editor.selection.length || editor.playing, action: () => editor.remove(editor.selection) },
      { label: 'Rename', shortcut: 'F2', disabled: editor.selected == null || editor.playing, action: () => startRename(editor.selected) },
      { label: 'Frame Selected', shortcut: 'F', action: () => viewport.frameSelected() },
      '-',
      { label: 'Play', shortcut: 'Ctrl+P', action: () => play(compileBeforePlay) },
      { label: 'Pause', shortcut: 'Ctrl+Shift+P', action: () => editor.playing && setPaused(!editor.paused) },
      { label: 'Step', shortcut: 'Ctrl+Alt+P', action: () => stepOnce() },
      '-',
      { label: 'Project Settings…', action: () => showSettingsTab() },
    ]],
    ['Assets', () => [
      { label: 'Create', submenu: () => { const items = []; return [
        { label: 'MonoBehaviour Script', action: () => document.querySelector('.proj-bar .icon-btn')?.click() },
      ]; } },
      { label: 'Import New Asset…', action: () => importAssetsDialog() },
      { label: 'Recompile Scripts', action: () => { scriptsDirty = true; compileNow(true); } },
      { label: 'Open C# Script…', action: async () => { const r = await pick('Open Script', project.scripts().map(s => ({ label: fileName(s.path), hint: s.path, value: s.path }))); if (r) openScript(r); } },
    ]],
    ['GameObject', () => [
      ...createMenuItems(0),
      '-',
      { label: 'Create Empty Child', disabled: editor.selected == null || editor.playing, action: () => editor.createEmpty(editor.selected) },
      { label: 'Align With View', disabled: editor.selected == null || editor.playing, action: () => alignWithView() },
    ]],
    ['Component', () => [
      ...['Physics', 'Mesh', 'Rendering', 'Audio', 'Input', 'UI', 'Layout', 'Event'].map(cat => ({ label: cat, submenu: Object.entries(COMPONENTS).filter(([, d]) => d.menu === cat).map(([type, d]) => ({ label: d.title, disabled: editor.selected == null || editor.playing, action: () => editor.addComponent(editor.selected, type) })) })),
      { label: 'Scripts', submenu: () => [...scriptMeta.values()].filter(m => m.kind === 'MonoBehaviour' && !m.abstract).map(m => ({ label: m.name, disabled: editor.selected == null || editor.playing, action: () => addScriptOrComponent(editor.selected, { type: 'Script', script: m.name }) })) },
    ]],
    ['Window', () => [
      { label: 'Scene', action: () => showCenter('scene') },
      { label: 'Game', action: () => showCenter('game') },
      { label: 'Console', action: () => showBottom('console') },
      { label: 'Project', action: () => showBottom('project') },
      '-',
      { label: 'Hide / show Hierarchy  (Alt+1)', action: () => window.anvilPanels.toggle('left') },
      { label: 'Hide / show Inspector  (Alt+2)', action: () => window.anvilPanels.toggle('right') },
      { label: 'Hide / show Project & Console  (Alt+3)', action: () => window.anvilPanels.toggle('bottom') },
      { label: 'Focus: hide all side panels  (Alt+0)', action: () => window.anvilPanels.focusCode() },
      '-',
      { label: 'Reset Layout', action: () => { const r = document.documentElement; r.style.removeProperty('--left'); r.style.removeProperty('--right'); r.style.removeProperty('--bottom'); delete project.data.editor.layout; project.touch('editor'); window.anvilPanels.show?.(); } },
    ]],
    ['Help', () => [
      { label: 'How Anvil works', action: helpDialog },
      { label: 'Supported Unity features', action: supportDialog },
      { label: 'Keyboard shortcuts', action: shortcutsDialog },
    ]],
  ]);
}

function alignWithView() {
  const o = editor.get(editor.selected); if (!o) return;
  const cam = viewport.sceneCam;
  const p = cam.position, q = cam.quaternion;
  editor.change(() => { o.p = [p.x, p.y, -p.z].map(v => Math.round(v * 1000) / 1000); o.r = [-q.x, -q.y, q.z, q.w]; o.e = null; }, 'Align With View');
}

function helpDialog() {
  alertBox('How Anvil works', el('div', { style: { maxWidth: '560px', lineHeight: '1.5' } },
    el('p', { text: 'Anvil is a Unity-style editor that runs in your browser. Your C# scripts are compiled by the real C# compiler (Roslyn, C# 9 like Unity 6) and run against a re-implementation of the UnityEngine API, so code you write here can be pasted into Unity unchanged.' }),
    el('p', { text: 'Your project is saved automatically in this browser. To keep it as real files on your computer, use File › Open Project Folder on This Computer (Chrome or Edge). To move it to another PC, use that folder, File › Sync with GitHub, or File › Download Project Backup.' }),
    el('p', { text: 'To take your work into real Unity: File › Export to Unity. Unzip the Assets folder into your Unity project, then use Tools › Anvil › Import Scene in Unity to rebuild the scene with the same objects, components and values.' }),
    el('p', { text: 'Physics runs on a different engine than Unity (Rapier instead of PhysX), so numbers like bounce and friction can differ slightly. Script logic, Transform maths and the order Unity calls your methods are the same.' })));
}
function supportDialog() {
  alertBox('Supported Unity features', el('div', { style: { maxWidth: '600px', lineHeight: '1.5' } },
    el('p', { text: 'Scripting: MonoBehaviour with Awake/OnEnable/Start/Update/FixedUpdate/LateUpdate/OnDisable/OnDestroy, coroutines (WaitForSeconds, WaitForFixedUpdate, WaitUntil…), Invoke, SendMessage, Instantiate/Destroy, prefabs, ScriptableObjects, [SerializeField], [Header], [Range], [Tooltip], [RequireComponent], enums, structs, lists, arrays.' }),
    el('p', { text: 'Engine API: Transform (full), GameObject, Vector2/3/4, Quaternion, Matrix4x4, Mathf, Time, Debug (Log, DrawLine, DrawRay), Gizmos, Random, Color, Camera (ScreenPointToRay etc.), Light, Renderer/Material colour, OnGUI (GUI/GUILayout), PlayerPrefs, SceneManager.LoadScene, Application, System.IO in memory.' }),
    el('p', { text: 'Input: the new Input System (Keyboard.current, Mouse.current, InputAction with bindings and 2D composites) and the old Input class (switch in Project Settings › Player).' }),
    el('p', { text: 'Physics: Rigidbody (forces, torques, all ForceModes, velocities, constraints, centre of mass, inertia), Box/Sphere/Capsule/Mesh colliders, triggers, layers + collision matrix, Physics.Raycast/SphereCast/Overlap…, OnCollisionEnter/Stay/Exit with impulse and relativeVelocity, OnTrigger*, HingeJoint (motor, limits, spring, angle, velocity), FixedJoint, SpringJoint, CharacterController.' }),
    el('p', { text: 'Not supported (yet): imported 3D models and textures, animation (Animator), audio playback, uGUI Canvas/TextMeshPro (use OnGUI), terrain, particles, editor scripts (UnityEditor).' })));
}
function shortcutsDialog() {
  alertBox('Keyboard shortcuts', el('pre', { style: { font: '12px var(--mono)', lineHeight: '1.6' }, text:
`Q W E R      View / Move / Rotate / Scale tool
X            Toggle Local / Global handles
F            Frame selected object
Right-drag   Look around (+ WASD/QE to fly, Shift = faster)
Middle-drag  Pan          Alt+Left-drag  Orbit      Wheel  Zoom
Ctrl+P       Play / Stop   Ctrl+Shift+P  Pause   Ctrl+Alt+P  Step
Ctrl+Z / Y   Undo / Redo   Ctrl+D  Duplicate   Del  Delete   F2  Rename
Ctrl+S       Save (in code: save & compile)
Ctrl+Space   Code completion in the script editor
Alt+Z        Word wrap on/off in the script editor
Alt+1 / 2 / 3  Hide/show Hierarchy / Inspector / bottom panel
Alt+0        Focus: hide/show all side panels  (double-click a divider also works)` }));
}

// boot screen
document.body.append(el('div', { id: 'boot' }, el('div', { text: 'Starting Anvil…' }), el('div', { class: 'bar' }, el('div'))));
boot().catch(e => { console.error(e); const b = document.getElementById('boot'); if (b) b.firstChild.textContent = 'Failed to start: ' + e.message; });

// the "saved in folder" badge next to the project name
function updateFolderStatus(e = {}) {
  let b = document.getElementById('folder-status');
  if (!b) {
    b = el('span', { id: 'folder-status', class: 'engine-status', style: { cursor: 'pointer', marginRight: '6px' } });
    document.getElementById('project-name')?.before(b);
  }
  const name = linkedFolderName();
  if (name) { b.textContent = '📁 ' + name; b.title = 'Saved as files in the folder "' + name + '" on this computer'; b.className = 'engine-status ready'; b.onclick = null; }
  else if (e.needsReconnect) { b.textContent = '📁 Reconnect ' + e.needsReconnect; b.title = 'Click to let Anvil keep saving into this folder'; b.className = 'engine-status loading'; b.onclick = () => reconnectFolder(); }
  else { b.textContent = ''; b.onclick = null; }
}
