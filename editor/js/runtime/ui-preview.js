// Edit-mode UI preview: draws the scene's Canvases in the Game view while not playing, and lets you click a UI
// element there to select it and drag it to move it (changes its anchored position, like dragging in Unity's Scene view).
import { bus } from '../core/events.js';
import { editor } from '../core/scene.js';
import { engine } from './engine.js';
import { drawGui, clearGui } from './gui.js';

let viewport = null, timer = 0, hits = [], lastKey = '', shown = false;

function uiSubset() {
  const objs = editor.objects;
  const byId = new Map(objs.map(o => [o.id, o]));
  const keep = new Set();
  const addUp = (o) => { for (let x = o; x && !keep.has(x.id); x = x.parent ? byId.get(x.parent) : null) keep.add(x.id); };
  const addDown = (id) => { for (const o of objs) if ((o.parent || 0) === id && !keep.has(o.id)) { keep.add(o.id); addDown(o.id); } };
  let any = false;
  for (const o of objs) {
    if (o.comps.some(c => c.type === 'Canvas' || c.type === 'TextMeshPro')) { any = true; addUp(o); keep.add(o.id); addDown(o.id); }
  }
  if (!any) return null;
  for (const o of objs) if (o.comps.some(c => c.type === 'Camera')) addUp(o); // world-space canvases need Camera.main
  const textures = {};
  for (const [p, f] of Object.entries(window.anvil?.project?.data?.files || {})) if (f.kind === 'texture') textures[p] = { w: f.data?.w || 1, h: f.data?.h || 1 };
  return { textures, objects: objs.filter(o => keep.has(o.id)).map(o => Object.assign({}, o, { comps: o.comps.filter(c => c.type !== 'Script') })) };
}

function overlayOffsets() {
  const c = viewport.canvas, host = document.getElementById('game-host');
  const cr = c.getBoundingClientRect(), hr = host.getBoundingClientRect();
  return [cr.left - hr.left, cr.top - hr.top];
}

export function refreshPreview(force = false) {
  clearTimeout(timer);
  timer = setTimeout(() => run(force), 40);
}
function run(force) {
  if (!viewport || editor.playing) return;
  const overlay = document.getElementById('gui-overlay');
  if (viewport.mode !== 'game' || !engine.ready || !engine.uiPreview) { if (shown) { clearGui(); shown = false; } return; }
  const sub = uiSubset();
  if (!sub) { if (shown) { clearGui(); shown = false; } hits = []; return; }
  const [w, h] = viewport.gameSize();
  const json = JSON.stringify(sub);
  const key = w + 'x' + h + ':' + json;
  if (!force && key === lastKey && shown) return;
  lastKey = key;
  let r;
  try { r = JSON.parse(engine.uiPreview(json, w, h)); } catch (e) { console.warn('UI preview failed', e); return; }
  if (r.error) { console.warn('UI preview:', r.error); return; }
  if (r.texAssets) for (const [uid, path] of r.texAssets) viewport.rt.uploadTextureAsset(uid, path);
  const [ox, oy] = overlayOffsets();
  drawGui(overlay, r.gui || [], 1, 1, ox, oy);
  hits = r.hits || [];
  shown = true;
}

// topmost UI element under a point in the Game view (edit mode)
function pickAt(ev) {
  const c = viewport.canvas.getBoundingClientRect();
  const x = ev.clientX - c.left, y = c.height - (ev.clientY - c.top);
  for (let i = hits.length - 1; i >= 0; i--) {
    const [id, x0, y0, x1, y1] = hits[i];
    if (x >= Math.min(x0, x1) && x <= Math.max(x0, x1) && y >= Math.min(y0, y1) && y <= Math.max(y0, y1)) return { id, w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
  }
  return null;
}

export function initUiPreview(vp) {
  viewport = vp;
  bus.on('scene-changed', () => refreshPreview());
  bus.on('scene-opened', () => refreshPreview(true));
  bus.on('viewport-resized', () => refreshPreview(true));
  bus.on('meta-changed', () => refreshPreview(true));
  bus.on('engine-ready', () => refreshPreview(true));
  bus.on('play-state', ({ playing }) => { if (!playing) { lastKey = ''; refreshPreview(true); } else { shown = false; } });
  bus.on('center-view', () => refreshPreview(true));
  const host = document.getElementById('game-host');
  let drag = null;
  host.addEventListener('pointerdown', (ev) => {
    if (editor.playing || ev.button !== 0 || !hits.length) return;
    const hit = pickAt(ev);
    if (!hit || !hit.id) return;
    ev.preventDefault(); ev.stopPropagation();
    editor.select(hit.id);
    const o = editor.get(hit.id); const rt = o?.comps.find(c => c.type === 'RectTransform');
    if (!rt) return;
    drag = { id: hit.id, x: ev.clientX, y: ev.clientY, start: rt.anchoredPosition.slice(), scale: null, moved: false, hit };
    host.setPointerCapture(ev.pointerId);
  }, true);
  host.addEventListener('pointermove', (ev) => {
    if (!drag || editor.playing) return;
    const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
    drag.moved = true;
    const o = editor.get(drag.id); const rt = o?.comps.find(c => c.type === 'RectTransform'); if (!rt) return;
    if (drag.scale == null) {
      // canvas units per screen pixel: compare the element's drawn width with its rect width
      const size = window.anvil?.rectSize?.(o) || [drag.hit.w, drag.hit.h];
      drag.scale = size[0] > 0.01 && drag.hit.w > 0.01 ? size[0] / drag.hit.w : (size[1] > 0.01 && drag.hit.h > 0.01 ? size[1] / drag.hit.h : 1);
    }
    const ci = o.comps.indexOf(rt);
    const np = [Math.round((drag.start[0] + dx * drag.scale) * 10) / 10, Math.round((drag.start[1] - dy * drag.scale) * 10) / 10];
    editor.setComp(drag.id, ci, 'anchoredPosition', np, 'ui-drag-' + drag.id);
  });
  const end = (ev) => { if (drag) { try { host.releasePointerCapture(ev.pointerId); } catch { } drag = null; } };
  host.addEventListener('pointerup', end);
  host.addEventListener('pointercancel', end);
}
