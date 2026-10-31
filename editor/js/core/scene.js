// Editor-side scene model: objects, hierarchy ops, selection, undo/redo.
import { bus, clone } from './events.js';
import { project, baseName } from './project.js';
import { makeComponent, primitiveComponents, COMPONENTS, NEEDS_RECT, GRAPHIC_TYPES, RECT_DEFAULT } from './components.js';
import { trs, mmul, minv, quatFromMatrix, scaleFromMatrix, eulerToQuat, quatToEulerNear, round } from './math.js';

const undoStack = [], redoStack = [];
let lastCoalesce = null, lastCoalesceTime = 0;

export const editor = {
  selection: [],
  playing: false,
  paused: false,
  runtime: null,            // play-mode hierarchy (from the engine)
  get scenePath() { return project.data?.openScene; },
  get scene() { return project.data?.files[project.data.openScene]?.data; },
  get objects() { return this.scene?.objects || []; },

  get(id) { return this.objects.find(o => o.id === id) || null; },
  children(id) { return this.objects.filter(o => (o.parent || 0) === id); },
  roots() { return this.children(0); },
  descendants(id) {
    const out = []; const walk = (pid) => { for (const c of this.children(pid)) { out.push(c); walk(c.id); } }; walk(id); return out;
  },
  isAncestor(a, b) { // a is ancestor of b
    let o = this.get(b);
    while (o && o.parent) { if (o.parent === a) return true; o = this.get(o.parent); }
    return false;
  },
  path(id) { const parts = []; let o = this.get(id); while (o) { parts.unshift(o.name); o = o.parent ? this.get(o.parent) : null; } return parts.join('/'); },
  newId() { const s = this.scene; s.nextId = Math.max(s.nextId || 1, ...s.objects.map(o => o.id + 1)); return s.nextId++; },

  localMatrix(o) { return trs(o.p, o.r, o.s); },
  worldMatrix(id) {
    const o = this.get(id); if (!o) return trs([0, 0, 0], [0, 0, 0, 1], [1, 1, 1]);
    const l = this.localMatrix(o);
    return o.parent ? mmul(this.worldMatrix(o.parent), l) : l;
  },
  worldPosition(id) { const m = this.worldMatrix(id); return [m[12], m[13], m[14]]; },

  // ---------- undo ----------
  snapshot() { return { path: this.scenePath, data: JSON.stringify(this.scene), sel: this.selection.slice() }; },
  change(fn, label = 'Change', coalesce = null) {
    if (this.playing) { fn(); bus.emit('scene-changed', { label, live: true }); return; }
    const now = performance.now();
    const merge = coalesce && coalesce === lastCoalesce && now - lastCoalesceTime < 800;
    if (!merge) { undoStack.push(Object.assign(this.snapshot(), { label })); if (undoStack.length > 200) undoStack.shift(); redoStack.length = 0; }
    lastCoalesce = coalesce; lastCoalesceTime = now;
    fn();
    project.touch('scene');
    bus.emit('scene-changed', { label });
  },
  undo() {
    if (this.playing) return;
    const s = undoStack.pop(); if (!s) return;
    redoStack.push(Object.assign(this.snapshot(), { label: s.label }));
    this.restore(s);
  },
  redo() {
    if (this.playing) return;
    const s = redoStack.pop(); if (!s) return;
    undoStack.push(Object.assign(this.snapshot(), { label: s.label }));
    this.restore(s);
  },
  restore(s) {
    if (project.data.files[s.path]) project.data.files[s.path].data = JSON.parse(s.data);
    lastCoalesce = null;
    if (s.path !== this.scenePath) { project.data.openScene = s.path; bus.emit('scene-opened'); }
    this.selection = s.sel.filter(id => this.get(id));
    project.touch('scene');
    bus.emit('scene-changed', { label: 'undo' });
    bus.emit('selection-changed');
  },
  clearUndo() { undoStack.length = 0; redoStack.length = 0; },

  // ---------- selection ----------
  select(ids, additive = false) {
    ids = (Array.isArray(ids) ? ids : [ids]).filter(x => x != null);
    if (additive) { for (const id of ids) { const i = this.selection.indexOf(id); if (i >= 0) this.selection.splice(i, 1); else this.selection.push(id); } }
    else this.selection = ids;
    bus.emit('selection-changed');
  },
  get selected() { return this.selection.length ? this.selection[0] : null; },

  // ---------- creation ----------
  create({ name = 'GameObject', parent = 0, comps = [], p, r, s, select = true, label }) {
    const id = this.newId();
    const o = { id, name, parent, active: true, tag: 'Untagged', layer: 0, p: p || [0, 0, 0], r: r || [0, 0, 0, 1], e: null, s: s || [1, 1, 1], comps };
    o.e = quatToEulerNear(o.r, [0, 0, 0]);
    this.change(() => { this.scene.objects.push(o); }, label || ('Create ' + name));
    if (select) this.select(id);
    return id;
  },
  spawnPosition(parent) {
    if (parent) return [0, 0, 0];
    if (project.settings.createAtOrigin) return [0, 0, 0];
    const pv = bus.scenePivot ? bus.scenePivot() : [0, 0, 0];
    return pv.map(v => round(v, 2));
  },
  createEmpty(parent = 0) { return this.create({ name: 'GameObject', parent, p: this.spawnPosition(parent) }); },
  // a GameObject with a Sprite Renderer (dragging an image into the Scene makes one, like Unity)
  createSprite(texPath = null, parent = 0, pos = null) {
    const sr = makeComponent('SpriteRenderer'); if (texPath) sr.sprite = texPath;
    return this.create({ name: texPath ? baseName(texPath) : 'Sprite', parent, comps: [sr], p: pos || this.spawnPosition(parent) });
  },
  createPrimitive(kind, parent = 0) {
    return this.create({ name: kind, parent, comps: primitiveComponents(kind), p: this.spawnPosition(parent) });
  },
  createLight(kind, parent = 0) {
    const type = { Directional: 1, Point: 2, Spot: 0 }[kind];
    const name = kind + ' Light';
    const l = Object.assign(makeComponent('Light'), { lightType: type, color: type === 1 ? [1, 0.9568627, 0.8392157, 1] : [1, 1, 1, 1], shadows: type === 1 ? 2 : 0 });
    return this.create({ name, parent, comps: [l], p: this.spawnPosition(parent), r: type === 1 ? eulerToQuat([50, -30, 0]) : [0, 0, 0, 1] });
  },
  createCamera(parent = 0) {
    return this.create({ name: 'Camera', parent, comps: [makeComponent('Camera'), makeComponent('AudioListener')], p: this.spawnPosition(parent) });
  },

  remove(ids) {
    ids = (Array.isArray(ids) ? ids : [ids]);
    const all = new Set();
    for (const id of ids) { all.add(id); for (const d of this.descendants(id)) all.add(d.id); }
    this.change(() => {
      this.scene.objects = this.scene.objects.filter(o => !all.has(o.id));
      // clear references to deleted objects
      for (const o of this.scene.objects) for (const c of o.comps) scrubRefs(c, all);
    }, 'Delete');
    this.selection = this.selection.filter(id => !all.has(id));
    bus.emit('selection-changed');
  },

  duplicate(ids) {
    ids = (Array.isArray(ids) ? ids : [ids]).filter(id => !ids.some(other => other !== id && this.isAncestor(other, id)));
    const newSel = [];
    this.change(() => {
      for (const id of ids) {
        const src = this.get(id); if (!src) continue;
        const subtree = [src, ...this.descendants(id)];
        const map = new Map();
        for (const o of subtree) map.set(o.id, this.newId());
        const copies = subtree.map(o => {
          const c = clone(o);
          c.id = map.get(o.id);
          if (o.id !== id) c.parent = map.get(o.parent); else c.name = nextName(src.name, this.children(src.parent || 0).map(x => x.name));
          remapRefs(c.comps, map);
          return c;
        });
        // insert right after the source subtree
        const objs = this.scene.objects;
        let idx = Math.max(...subtree.map(o => objs.indexOf(o)));
        objs.splice(idx + 1, 0, ...copies);
        newSel.push(map.get(id));
      }
    }, 'Duplicate');
    this.select(newSel);
  },

  // Unity keeps the world position when you drag an object onto a new parent in the Hierarchy.
  reparent(id, newParent, beforeId = null, keepWorld = true) {
    if (id === newParent || (newParent && this.isAncestor(id, newParent))) return;
    const o = this.get(id); if (!o) return;
    this.change(() => {
      if (keepWorld && (o.parent || 0) !== (newParent || 0)) {
        const world = this.worldMatrix(id);
        const pw = newParent ? this.worldMatrix(newParent) : null;
        const local = pw ? mmul(minv(pw) || pw, world) : world;
        o.p = [round(local[12], 5), round(local[13], 5), round(local[14], 5)];
        o.r = quatFromMatrix(local);
        o.s = scaleFromMatrix(local).map(v => round(v, 5));
        o.e = quatToEulerNear(o.r, o.e);
      }
      o.parent = newParent || 0;
      const objs = this.scene.objects;
      objs.splice(objs.indexOf(o), 1);
      if (beforeId != null) {
        const b = this.get(beforeId);
        objs.splice(b ? objs.indexOf(b) : objs.length, 0, o);
      } else {
        // after the last sibling
        const sibs = objs.filter(x => (x.parent || 0) === (newParent || 0));
        const last = sibs[sibs.length - 1];
        objs.splice(last ? objs.indexOf(last) + 1 : objs.length, 0, o);
      }
    }, 'Parent');
  },

  setTransform(id, part, value, coalesce) {
    const o = this.get(id); if (!o) return;
    this.change(() => {
      if (part === 'p') o.p = value.slice();
      else if (part === 's') o.s = value.slice();
      else if (part === 'e') { o.e = value.slice(); o.r = eulerToQuat(o.e); }
      else if (part === 'r') { o.r = value.slice(); o.e = quatToEulerNear(o.r, o.e); }
    }, 'Transform', coalesce);
  },
  setProp(id, key, value, coalesce) {
    const o = this.get(id); if (!o) return;
    this.change(() => { o[key] = value; }, 'Change ' + key, coalesce);
  },
  setComp(id, ci, key, value, coalesce) {
    const o = this.get(id); if (!o || !o.comps[ci]) return;
    this.change(() => { setPath(o.comps[ci], key, value); }, 'Change ' + key, coalesce);
  },
  setField(id, ci, key, value, coalesce) {
    const o = this.get(id); if (!o || !o.comps[ci]) return;
    this.change(() => { const c = o.comps[ci]; c.fields = c.fields || {}; setPath(c.fields, key, value); }, 'Change ' + key, coalesce);
  },

  addComponent(id, type, script) {
    const o = this.get(id); if (!o) return false;
    const def = COMPONENTS[type];
    if (def?.unique && o.comps.some(c => c.type === type)) { bus.emit('toast', `The component ${def.title} can't be added because ${o.name} already contains the same component.`); return false; }
    this.change(() => {
      if (def?.requires) for (const r of def.requires) if (!o.comps.some(c => c.type === r)) o.comps.push(makeComponent(r));
      // UI components need a RectTransform (Unity swaps the Transform) and graphics a CanvasRenderer
      if ((NEEDS_RECT.has(type) || type === 'RectTransform') && !o.comps.some(c => c.type === 'RectTransform')) { const rt = RECT_DEFAULT(); rt.anchoredPosition = [o.p[0], o.p[1]]; o.comps.unshift(rt); if (type === 'RectTransform') return; }
      if (type === 'RectTransform') return;
      if (GRAPHIC_TYPES.has(type) && !o.comps.some(c => c.type === 'CanvasRenderer')) o.comps.push(makeComponent('CanvasRenderer'));
      if (type === 'Script') {
        const c = { type: 'Script', script, enabled: true, fields: {} };
        o.comps.push(c);
      } else {
        const nc = makeComponent(type);
        // like Unity, a new Mesh Collider takes the object's mesh
        if (type === 'MeshCollider') { const mf = o.comps.find(c => c.type === 'MeshFilter'); if (mf?.mesh) nc.mesh = mf.mesh; }
        // and a new 2D collider fits the object's sprite
        const spr = o.comps.find(c => c.type === 'SpriteRenderer');
        const sd = spr?.sprite ? project.file(spr.sprite)?.data : null;
        if (sd && sd.w && sd.h) {
          const w = spr.drawMode > 0 && spr.size ? spr.size[0] : sd.w / 100, h = spr.drawMode > 0 && spr.size ? spr.size[1] : sd.h / 100;
          if (type === 'BoxCollider2D') nc.size = [w, h];
          else if (type === 'CircleCollider2D') nc.radius = Math.max(w, h) / 2;
          else if (type === 'CapsuleCollider2D') { nc.size = [w, h]; nc.direction = h >= w ? 0 : 1; }
          else if (type === 'PolygonCollider2D') nc.points = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
        }
        o.comps.push(nc);
      }
    }, 'Add Component');
    return true;
  },
  removeComponent(id, ci) {
    const o = this.get(id); if (!o) return;
    const c = o.comps[ci];
    if (c && c.type === 'Rigidbody' && o.comps.some(x => COMPONENTS[x.type]?.requires?.includes('Rigidbody'))) { bus.emit('toast', "Can't remove Rigidbody because a Joint depends on it"); return; }
    this.change(() => { o.comps.splice(ci, 1); }, 'Remove Component');
  },
  moveComponent(id, ci, dir) {
    const o = this.get(id); if (!o) return;
    const j = ci + dir; if (j < 0 || j >= o.comps.length) return;
    this.change(() => { const t = o.comps[ci]; o.comps[ci] = o.comps[j]; o.comps[j] = t; }, 'Move Component');
  },

  // ---------- prefabs ----------
  subtreeData(id) {
    const src = this.get(id); if (!src) return null;
    const subtree = [src, ...this.descendants(id)];
    const map = new Map(); let n = 1;
    for (const o of subtree) map.set(o.id, n++);
    const objects = subtree.map(o => { const c = clone(o); c.id = map.get(o.id); c.parent = o.id === id ? 0 : map.get(o.parent); remapRefs(c.comps, map, true); return c; });
    return { objects, nextId: n };
  },
  instantiatePrefab(path, parent = 0, pos = null) {
    const f = project.file(path); if (!f || !f.data) return null;
    const objs = f.data.objects || [];
    const map = new Map();
    for (const o of objs) map.set(o.id, this.newId());
    const copies = objs.map(o => { const c = clone(o); c.id = map.get(o.id); c.parent = o.parent ? map.get(o.parent) : parent; remapRefs(c.comps, map, true); return c; });
    if (copies[0]) { copies[0].prefab = path; copies[0].name = baseName(path); if (pos) copies[0].p = pos; }
    this.change(() => { this.scene.objects.push(...copies); }, 'Instantiate Prefab');
    if (copies[0]) this.select(copies[0].id);
    return copies[0]?.id;
  },
};

function nextName(name, existing) {
  const m = name.match(/^(.*?)(?: \((\d+)\))?$/);
  const base = m[1];
  let n = m[2] ? +m[2] + 1 : 1;
  while (existing.includes(`${base} (${n})`)) n++;
  return `${base} (${n})`;
}
export function setPath(obj, key, value) {
  const parts = String(key).split('.');
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) { if (o[parts[i]] == null || typeof o[parts[i]] !== 'object') o[parts[i]] = {}; o = o[parts[i]]; }
  o[parts[parts.length - 1]] = value;
}
export function getPath(obj, key) {
  let o = obj;
  for (const p of String(key).split('.')) { if (o == null) return undefined; o = o[p]; }
  return o;
}
function walkRefs(v, fn) {
  if (Array.isArray(v)) { v.forEach((x, i) => { const r = walkRefs(x, fn); if (r !== undefined) v[i] = r; }); return; }
  if (v && typeof v === 'object') {
    if ('ref' in v && typeof v.ref === 'number') return fn(v);
    for (const k of Object.keys(v)) { const r = walkRefs(v[k], fn); if (r !== undefined) v[k] = r; }
  }
}
function scrubRefs(c, deleted) { walkRefs(c, (r) => deleted.has(r.ref) ? null : undefined); }
function remapRefs(comps, map, dropExternal = false) {
  walkRefs(comps, (r) => {
    if (map.has(r.ref)) return Object.assign({}, r, { ref: map.get(r.ref) });
    return dropExternal ? null : undefined;
  });
}
