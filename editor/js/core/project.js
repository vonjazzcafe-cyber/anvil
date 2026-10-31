// Project model + persistence (IndexedDB, autosave). A project is plain JSON: settings + files keyed by Unity-style paths.
import { bus, clone } from './events.js';
import { eulerToQuat } from './math.js';
import { makeComponent } from './components.js';
import { defaultInputActions } from './input-actions.js';

const DB_NAME = 'anvil-editor';
let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { resolve(null); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'name' });
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
  return dbp;
}
async function tx(store, mode, fn) {
  const d = await db();
  if (!d) return fallback(store, mode, fn);
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    const r = fn(s);
    t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
    t.onerror = () => reject(t.error);
  });
}
function fallback(store, mode, fn) {
  // localStorage fallback (private windows without IDB)
  const fake = {
    get: (k) => ({ result: JSON.parse(localStorage.getItem('anvil:' + store + ':' + k) || 'null') }),
    put: (v, k) => { localStorage.setItem('anvil:' + store + ':' + (k ?? v.name), JSON.stringify(v)); return {}; },
    delete: (k) => { localStorage.removeItem('anvil:' + store + ':' + k); return {}; },
    getAllKeys: () => ({ result: Object.keys(localStorage).filter(k => k.startsWith('anvil:' + store + ':')).map(k => k.slice(('anvil:' + store + ':').length)) }),
  };
  const r = fn(fake);
  return Promise.resolve(r && 'result' in r ? r.result : undefined);
}
export const storage = {
  getProject: (name) => tx('projects', 'readonly', s => s.get(name)),
  putProject: (p) => tx('projects', 'readwrite', s => s.put(p)),
  deleteProject: (name) => tx('projects', 'readwrite', s => s.delete(name)),
  listProjects: () => tx('projects', 'readonly', s => s.getAllKeys()),
  get: (k) => tx('kv', 'readonly', s => s.get(k)),
  set: (k, v) => tx('kv', 'readwrite', s => s.put(v, k)),
};

export const SCRIPT_TEMPLATE = (name) => `using UnityEngine;

public class ${name} : MonoBehaviour
{
    // Start is called once before the first execution of Update after the MonoBehaviour is created
    void Start()
    {

    }

    // Update is called once per frame
    void Update()
    {

    }
}
`;
export const SO_TEMPLATE = (name) => `using UnityEngine;

[CreateAssetMenu(fileName = "${name}", menuName = "Scriptable Objects/${name}")]
public class ${name} : ScriptableObject
{

}
`;

export function defaultSettings() {
  return {
    gravity: [0, -9.81, 0], fixedTimestep: 0.02, maxDeltaTime: 0.3333333, timeScale: 1,
    tags: [], layers: {}, layerMatrix: Array(32).fill(0xffffffff),
    inputHandling: 'new', scenes: ['Assets/Scenes/SampleScene.unity'], productName: 'My Project', executionOrder: {},
    createAtOrigin: true, stackTraces: true, physicsEngine: 'physx',
  };
}

export function newSceneData() {
  // what Unity 6 puts in a new 3D scene
  return {
    objects: [
      { id: 1, name: 'Main Camera', parent: 0, active: true, tag: 'MainCamera', layer: 0, p: [0, 1, -10], r: [0, 0, 0, 1], e: [0, 0, 0], s: [1, 1, 1],
        comps: [makeComponent('Camera'), makeComponent('AudioListener')] },
      { id: 2, name: 'Directional Light', parent: 0, active: true, tag: 'Untagged', layer: 0, p: [0, 3, 0], r: eulerToQuat([50, -30, 0]), e: [50, -30, 0], s: [1, 1, 1],
        comps: [Object.assign(makeComponent('Light'), { lightType: 1, color: [1, 0.9568627, 0.8392157, 1], intensity: 1, shadows: 2 })] },
    ],
    nextId: 3,
  };
}

export function newProject(name) {
  return {
    format: 'anvil-project', version: 1, name, created: Date.now(), modified: Date.now(),
    settings: defaultSettings(),
    folders: ['Assets', 'Assets/Scenes', 'Assets/Scripts', 'Assets/Materials', 'Assets/Prefabs'],
    files: {
      'Assets/Scenes/SampleScene.unity': { kind: 'scene', data: newSceneData() },
      'Assets/InputSystem_Actions.inputactions': { kind: 'text', text: defaultInputActions() },
    },
    openScene: 'Assets/Scenes/SampleScene.unity',
    playerPrefs: {},
    editor: {},
  };
}

export const KIND_BY_EXT = { wav: 'audio', mp3: 'audio', ogg: 'audio', m4a: 'audio', png: 'texture', jpg: 'texture', jpeg: 'texture', gif: 'texture', webp: 'texture', glb: 'model', controller: 'controller', gltf: 'model', fbx: 'model', obj: 'model', stl: 'model', GLB: 'model', FBX: 'model', OBJ: 'model', cs: 'script', unity: 'scene', prefab: 'prefab', mat: 'material', physicMaterial: 'physicsMaterial', physicsMaterial: 'physicsMaterial', physicsMaterial2D: 'physicsMaterial2D', asset: 'asset', txt: 'text', json: 'text', md: 'text', csv: 'text', xml: 'text' };
export function kindOf(path) { const ext = path.split('.').pop(); return KIND_BY_EXT[ext] || KIND_BY_EXT[ext.toLowerCase()] || 'text'; }
export function baseName(path) { const f = path.split('/').pop(); const i = f.lastIndexOf('.'); return i > 0 ? f.slice(0, i) : f; }
export function dirName(path) { const i = path.lastIndexOf('/'); return i > 0 ? path.slice(0, i) : ''; }
export function fileName(path) { return path.split('/').pop(); }

export const project = {
  data: null,
  dirty: false,
  get name() { return this.data?.name; },
  get settings() { return this.data.settings; },
  async load(name) {
    let p = await storage.getProject(name);
    if (!p) { p = newProject(name); await storage.putProject(p); }
    this.migrate(p);
    this.data = p;
    await storage.set('lastProject', name);
    bus.emit('project-loaded', p);
    return p;
  },
  migrate(p) {
    p.settings = Object.assign(defaultSettings(), p.settings || {});
    p.folders = p.folders || ['Assets'];
    p.files = p.files || {};
    p.playerPrefs = p.playerPrefs || {};
    p.editor = p.editor || {};
    for (const f of Object.values(p.files)) for (const o of (f.data && f.data.objects) || []) for (const c of o.comps || [])
      if (typeof c.type === 'number') { c.lightType = c.type; c.type = 'Light'; }
    if (!p.openScene || !p.files[p.openScene]) p.openScene = Object.keys(p.files).find(f => p.files[f].kind === 'scene') || null;
    if (!p.openScene) { p.files['Assets/Scenes/SampleScene.unity'] = { kind: 'scene', data: newSceneData() }; p.openScene = 'Assets/Scenes/SampleScene.unity'; }
  },
  async replace(p) {
    this.migrate(p);
    this.data = p;
    await storage.putProject(p);
    await storage.set('lastProject', p.name);
    bus.emit('project-loaded', p);
  },
  touch(what = 'files') {
    this.dirty = true;
    this.data.modified = Date.now();
    scheduleSave();
    bus.emit('project-changed', what);
  },
  async saveNow() {
    if (!this.data) return;
    clearTimeout(saveTimer);
    await storage.putProject(this.data);
    this.dirty = false;
    bus.emit('project-saved');
  },
  // ---- files ----
  file(path) { return this.data.files[path]; },
  exists(path) { return !!this.data.files[path] || this.data.folders.includes(path); },
  scripts() { return Object.entries(this.data.files).filter(([p, f]) => f.kind === 'script').map(([path, f]) => ({ path, code: f.text })); },
  writeText(path, text) {
    const f = this.data.files[path];
    if (f) f.text = text; else this.data.files[path] = { kind: kindOf(path), text };
    this.ensureFolder(dirName(path));
    this.touch('files');
    if (kindOf(path) === 'script') bus.emit('scripts-changed', { path });
  },
  writeData(path, data) {
    const f = this.data.files[path];
    if (f) f.data = data; else this.data.files[path] = { kind: kindOf(path), data };
    this.ensureFolder(dirName(path));
    this.touch('files');
  },
  ensureFolder(path) {
    if (!path) return;
    const parts = path.split('/');
    for (let i = 1; i <= parts.length; i++) {
      const p = parts.slice(0, i).join('/');
      if (!this.data.folders.includes(p)) this.data.folders.push(p);
    }
  },
  uniquePath(dir, base, ext) {
    let p = `${dir}/${base}${ext ? '.' + ext : ''}`, i = 1;
    while (this.exists(p)) p = `${dir}/${base} ${i++}${ext ? '.' + ext : ''}`;
    return p;
  },
  rename(oldPath, newPath) {
    if (oldPath === newPath || this.exists(newPath)) return false;
    const d = this.data;
    if (d.folders.includes(oldPath)) {
      d.folders = d.folders.map(f => f === oldPath || f.startsWith(oldPath + '/') ? newPath + f.slice(oldPath.length) : f);
      for (const k of Object.keys(d.files)) if (k.startsWith(oldPath + '/')) { d.files[newPath + k.slice(oldPath.length)] = d.files[k]; delete d.files[k]; }
    } else if (d.files[oldPath]) {
      d.files[newPath] = d.files[oldPath]; delete d.files[oldPath];
    } else return false;
    this.fixReferences(oldPath, newPath);
    bus.emit('scripts-changed', { path: newPath });
    if (d.openScene && (d.openScene === oldPath || d.openScene.startsWith(oldPath + '/'))) d.openScene = newPath + d.openScene.slice(oldPath.length);
    d.settings.scenes = d.settings.scenes.map(s => s === oldPath || s.startsWith(oldPath + '/') ? newPath + s.slice(oldPath.length) : s);
    this.touch('files');
    return true;
  },
  remove(path) {
    const d = this.data;
    if (d.folders.includes(path)) {
      d.folders = d.folders.filter(f => !(f === path || f.startsWith(path + '/')));
      for (const k of Object.keys(d.files)) if (k.startsWith(path + '/')) delete d.files[k];
    } else delete d.files[path];
    bus.emit('scripts-changed', { path });
    d.settings.scenes = d.settings.scenes.filter(s => d.files[s]);
    this.touch('files');
  },
  fixReferences(oldPath, newPath) {
    // asset references inside scenes/prefabs: {"asset": path} and material strings
    const fix = (v) => {
      if (Array.isArray(v)) { v.forEach((x, i) => { if (typeof x === 'string' && (x === oldPath || x.startsWith(oldPath + '/') || x.startsWith(oldPath + '#'))) v[i] = newPath + x.slice(oldPath.length); else fix(x); }); return; }
      if (v && typeof v === 'object') for (const k of Object.keys(v)) {
        const x = v[k];
        if (typeof x === 'string' && (x === oldPath || x.startsWith(oldPath + '/') || x.startsWith(oldPath + '#'))) v[k] = newPath + x.slice(oldPath.length);
        else fix(x);
      }
    };
    for (const f of Object.values(this.data.files)) if (f.data) fix(f.data);
  },
  listDir(dir) {
    const folders = this.data.folders.filter(f => dirName(f) === dir).sort((a, b) => a.localeCompare(b));
    const files = Object.keys(this.data.files).filter(f => dirName(f) === dir).sort((a, b) => a.localeCompare(b));
    return { folders, files };
  },
  scenesInBuild() { return this.data.settings.scenes.filter(s => this.data.files[s]); },
};

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => project.saveNow().catch(e => console.error('save failed', e)), 700);
}
window.addEventListener('beforeunload', () => { if (project.dirty && project.data) { try { project.saveNow(); } catch (e) { } } });
