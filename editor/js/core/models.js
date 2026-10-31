// Imported 3D models (.glb/.gltf/.fbx/.obj/.stl). The original file is kept in the project (so it can go back to
// Unity unchanged); on import its materials and textures are extracted into assets next to it, and its node tree is
// stored like a prefab (GameObjects with MeshFilter/MeshRenderer or SkinnedMeshRenderer), so dragging the model into
// the scene works like dragging a prefab. The meshes and animation clips are rebuilt from the file when it's opened.
//
// Axes: three.js loaders give right-handed Y-up data; Unity's importers mirror X (x -> -x), so we do the same:
// position (-x, y, z), rotation (x, -y, -z, w), triangle winding reversed. glTF UVs start at the top (v -> 1 - v).
import * as THREE from 'three';
import { bus, toast } from './events.js';
import { project, baseName, dirName } from './project.js';
import { makeComponent } from './components.js';
import { quatToEuler } from './math.js';
import { encodePacked, decodePacked } from './meshpack.js';

export const MODEL_EXTS = ['glb', 'gltf', 'fbx', 'obj', 'stl'];
let loadersP = null;
const loaders = () => (loadersP ||= import('../../../vendor/loaders.js'));

// path -> { sig, promise, model }   model = { meshes: [{ bytes, geom }], clips: [{ name, length, bytes }] }
const cache = new Map();
const sigOf = (f) => (f?.data?.url?.length || 0) + ':' + (f?.data?.url?.slice(-32) || '');

function dataURLToBuffer(url) {
  const b64 = url.slice(url.indexOf(',') + 1); const bin = atob(b64);
  const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}
function bufferToDataURL(buf, mime) {
  const u8 = new Uint8Array(buf); let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return `data:${mime};base64,` + btoa(s);
}

// ---------------- parsing ----------------
async function parseFile(fmt, buffer) {
  const L = await loaders();
  if (fmt === 'glb' || fmt === 'gltf') {
    const gltf = await new Promise((res, rej) => new L.GLTFLoader().parse(buffer, '', res, rej));
    return { root: gltf.scene || gltf.scenes[0], animations: gltf.animations || [], gltf: true };
  }
  if (fmt === 'fbx') {
    const root = new L.FBXLoader().parse(buffer, '');
    return { root, animations: root.animations || [] };
  }
  if (fmt === 'obj') {
    const root = new L.OBJLoader().parse(new TextDecoder().decode(buffer));
    return { root, animations: [] };
  }
  if (fmt === 'stl') {
    const geo = new L.STLLoader().parse(buffer);
    const root = new THREE.Group(); const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial()); mesh.name = 'Mesh'; root.add(mesh);
    return { root, animations: [] };
  }
  throw new Error('unsupported model format .' + fmt);
}

// ---------------- conversion to Unity space ----------------
const P = (v) => [-v.x, v.y, v.z];
const Q = (q) => [q.x, -q.y, -q.z, q.w];
// S·M·S with S = diag(-1, 1, 1, 1), on a three.js column-major array
function mirrorMatrix(e) { const r = new Float32Array(16); const s = [-1, 1, 1, 1]; for (let c = 0; c < 4; c++) for (let row = 0; row < 4; row++) r[c * 4 + row] = e[c * 4 + row] * s[row] * s[c]; return r; }
const linToSrgb = (v) => v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;

function convertGeometry(geo, flipV, materialCount) {
  const pa = geo.attributes.position; if (!pa) return null;
  const vc = pa.count;
  const pos = new Float32Array(vc * 3);
  for (let i = 0; i < vc; i++) { pos[i * 3] = -pa.getX(i); pos[i * 3 + 1] = pa.getY(i); pos[i * 3 + 2] = pa.getZ(i); }
  let nrm = null, uv = null, col = null, skinIdx = null, skinW = null;
  const na = geo.attributes.normal;
  if (na) { nrm = new Float32Array(vc * 3); for (let i = 0; i < vc; i++) { nrm[i * 3] = -na.getX(i); nrm[i * 3 + 1] = na.getY(i); nrm[i * 3 + 2] = na.getZ(i); } }
  const ua = geo.attributes.uv;
  if (ua) { uv = new Float32Array(vc * 2); for (let i = 0; i < vc; i++) { uv[i * 2] = ua.getX(i); uv[i * 2 + 1] = flipV ? 1 - ua.getY(i) : ua.getY(i); } }
  const ca = geo.attributes.color;
  if (ca) { col = new Float32Array(vc * 4); for (let i = 0; i < vc; i++) { col[i * 4] = linToSrgb(ca.getX(i)); col[i * 4 + 1] = linToSrgb(ca.getY(i)); col[i * 4 + 2] = linToSrgb(ca.getZ(i)); col[i * 4 + 3] = ca.itemSize > 3 ? ca.getW(i) : 1; } }
  const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  if (si && sw) {
    skinIdx = new Int32Array(vc * 4); skinW = new Float32Array(vc * 4);
    for (let i = 0; i < vc; i++) {
      const w = [sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)], ix = [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)];
      const sum = w[0] + w[1] + w[2] + w[3] || 1;
      for (let k = 0; k < 4; k++) { skinIdx[i * 4 + k] = ix[k]; skinW[i * 4 + k] = w[k] / sum; }
    }
  }
  // indices with reversed winding (mirrored axes), one sub-mesh per material group
  const index = geo.index ? geo.index.array : null;
  const idxAt = index ? (k) => index[k] : (k) => k;
  const total = index ? index.length : vc;
  const ranges = geo.groups && geo.groups.length && materialCount > 1 ? geo.groups.slice() : [{ start: 0, count: total, materialIndex: 0 }];
  const bySlot = new Map();
  for (const g of ranges) {
    const slot = Math.min(g.materialIndex || 0, Math.max(0, materialCount - 1));
    const list = bySlot.get(slot) || []; bySlot.set(slot, list);
    const end = Math.min(total, g.start + g.count);
    for (let k = g.start; k + 2 < end + 0; k += 3) list.push(idxAt(k), idxAt(k + 2), idxAt(k + 1));
  }
  const nSubs = Math.max(1, materialCount);
  const subs = []; for (let s = 0; s < nSubs; s++) subs.push({ indices: Int32Array.from(bySlot.get(s) || []), topo: 0 });
  // bounds
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < vc; i++) for (let k = 0; k < 3; k++) { const v = pos[i * 3 + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
  const b = vc ? [0, 1, 2].map(k => (mn[k] + mx[k]) / 2).concat([0, 1, 2].map(k => (mx[k] - mn[k]) / 2)) : [0, 0, 0, 0, 0, 0];
  return { pos, nrm, uv, col, skinIdx, skinW, subs, b };
}

// a stable name -> node lookup for animation tracks (three.js sanitizes node names in track names)
function trackNode(trackName, byName) {
  const dot = trackName.lastIndexOf('.');
  let node = trackName.slice(0, dot), prop = trackName.slice(dot + 1);
  const br = node.indexOf('[');
  if (br >= 0) node = node.slice(0, br);
  return { idx: byName.get(node) ?? byName.get(THREE.PropertyBinding.sanitizeNodeName(node)), prop };
}

function convert(parsed, name) {
  const { root, animations } = parsed;
  root.updateMatrixWorld(true);
  const nodes = [], indexOf = new Map(), byName = new Map();
  const walk = (o, parent) => {
    if (o.isLight || o.isCamera) return;
    const i = nodes.length;
    nodes.push({ obj: o, parent });
    indexOf.set(o, i);
    if (o.name && !byName.has(o.name)) byName.set(o.name, i);
    const sn = THREE.PropertyBinding.sanitizeNodeName(o.name || '');
    if (sn && !byName.has(sn)) byName.set(sn, i);
    if (!byName.has(o.uuid)) byName.set(o.uuid, i);
    for (const c of o.children) walk(c, i);
  };
  walk(root, -1);
  // unique child names keep animation paths unambiguous
  const meshes = [], matDefs = [], matIndex = new Map();
  const outNodes = nodes.map(({ obj, parent }, i) => {
    const n = { name: i === 0 ? name : (obj.name || (obj.isMesh ? 'Mesh' : obj.isBone ? 'Bone' : 'Node')), parent, p: P(obj.position), r: Q(obj.quaternion), s: [obj.scale.x, obj.scale.y, obj.scale.z] };
    if (i === 0) { n.p = [0, 0, 0]; n.r = [0, 0, 0, 1]; n.s = [obj.scale.x, obj.scale.y, obj.scale.z]; }
    if (obj.isMesh && obj.geometry) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      const conv = convertGeometry(obj.geometry, !!parsed.gltf, mats.length);
      if (conv) {
        n.mats = mats.map(m => { if (!matIndex.has(m)) { matIndex.set(m, matDefs.length); matDefs.push(m); } return matIndex.get(m); });
        if (obj.isSkinnedMesh && obj.skeleton) {
          n.skin = true;
          n.bones = obj.skeleton.bones.map(b => indexOf.get(b) ?? -1);
          // Unity bindpose = bone inverse * bind matrix (the mesh's own space), mirrored
          conv.bindposes = obj.skeleton.boneInverses.map(inv => mirrorMatrix(new THREE.Matrix4().multiplyMatrices(inv, obj.bindMatrix).elements));
          if (obj.bindMode === 'detached') console.warn('Model', name, 'has a detached skeleton; skinning may be off');
        }
        n.mesh = meshes.length;
        meshes.push({ name: obj.geometry.name || obj.name || 'Mesh', conv });
      }
    }
    return n;
  });
  // root bone = the first bone whose parent isn't a bone
  for (const n of outNodes) if (n.skin && n.bones?.length) { const first = n.bones.find(b => b >= 0 && !nodes[outNodes[b].parent]?.obj?.isBone); n.rootBone = first ?? n.bones[0]; }
  // paths for animation curves (relative to the model root, like Unity)
  const pathOf = (i) => { const parts = []; for (let k = i; k > 0; k = outNodes[k].parent) parts.unshift(outNodes[k].name); return parts.join('/'); };
  const clips = [];
  for (const clip of animations) {
    const fps = 30, length = Math.max(clip.duration, 1 / fps);
    const frames = Math.max(2, Math.round(length * fps) + 1);
    const tracks = [];
    for (const tr of clip.tracks) {
      const { idx, prop } = trackNode(tr.name, byName);
      if (idx == null) continue;
      const kind = prop === 'position' ? 'p' : prop === 'quaternion' ? 'r' : prop === 'scale' ? 's' : null;
      if (!kind) continue;
      const interp = tr.createInterpolant();
      const dim = kind === 'r' ? 4 : 3;
      const values = new Float32Array(frames * dim);
      for (let f = 0; f < frames; f++) {
        const t = Math.min(length, f / fps);
        const v = interp.evaluate(t);
        if (kind === 'p') { values[f * 3] = -v[0]; values[f * 3 + 1] = v[1]; values[f * 3 + 2] = v[2]; }
        else if (kind === 'r') { let x = v[0], y = -v[1], z = -v[2], w = v[3]; const l = Math.hypot(x, y, z, w) || 1; values[f * 4] = x / l; values[f * 4 + 1] = y / l; values[f * 4 + 2] = z / l; values[f * 4 + 3] = w / l; }
        else { values[f * 3] = v[0]; values[f * 3 + 1] = v[1]; values[f * 3 + 2] = v[2]; }
      }
      tracks.push({ path: pathOf(idx), kind, values });
    }
    clips.push({ name: clip.name || 'Take 001', length, fps, frames, tracks });
  }
  return { nodes: outNodes, meshes, matDefs, clips };
}

// clip blob: int32 [frames, trackCount], float32 [fps, length], then per track: int32 kind (0 p,1 r,2 s), int32 pathLen,
// utf8 path (padded to 4), float32 values (frames * dim)
function packClip(c) {
  const enc = new TextEncoder();
  const paths = c.tracks.map(t => enc.encode(t.path));
  let words = 4;
  c.tracks.forEach((t, i) => { words += 2 + Math.ceil(paths[i].length / 4) + t.values.length; });
  const buf = new ArrayBuffer(words * 4);
  const i32 = new Int32Array(buf), f32 = new Float32Array(buf), u8 = new Uint8Array(buf);
  let o = 0;
  i32[o++] = c.frames; i32[o++] = c.tracks.length; f32[o++] = c.fps; f32[o++] = c.length;
  c.tracks.forEach((t, i) => {
    i32[o++] = t.kind === 'p' ? 0 : t.kind === 'r' ? 1 : 2; i32[o++] = paths[i].length;
    u8.set(paths[i], o * 4); o += Math.ceil(paths[i].length / 4);
    f32.set(t.values, o); o += t.values.length;
  });
  return new Uint8Array(buf);
}

// ---------------- cache: geometry and clips for open models ----------------
export async function loadModel(path) {
  const f = project.file(path);
  if (!f || f.kind !== 'model' || !f.data?.url) return null;
  const sig = sigOf(f);
  let e = cache.get(path);
  if (e && e.sig === sig) return e.promise;
  e = { sig, model: null };
  e.promise = (async () => {
    const parsed = await parseFile(f.data.fmt, dataURLToBuffer(f.data.url));
    const conv = convert(parsed, baseName(path));
    const model = {
      meshes: conv.meshes.map(m => { const bytes = encodePacked(m.conv); return { bytes, name: m.name, geom: null }; }),
      clips: conv.clips.map(c => ({ name: c.name, length: c.length, bytes: packClip(c) })),
    };
    e.model = model;
    bus.emit('viewport-refresh');
    return model;
  })().catch(err => { console.error(err); toast(`Could not read model ${path}: ${err.message || err}`, 'error'); cache.delete(path); return null; });
  cache.set(path, e);
  return e.promise;
}
function readyModel(path) {
  const e = cache.get(path);
  const f = project.file(path);
  if (!e || !f || e.sig !== sigOf(f)) { if (f?.kind === 'model') loadModel(path); return null; }
  return e.model;
}
function splitKey(key) { const i = key.lastIndexOf('#'); return i < 0 ? null : [key.slice(0, i), +key.slice(i + 1).replace(/^clip/, '')]; }
// packed mesh bytes for the C# engine ("Assets/Robot.fbx#2")
export function modelMeshBytes(key) {
  const k = splitKey(key); if (!k) return null;
  return readyModel(k[0])?.meshes[k[1]]?.bytes || null;
}
// shared three.js geometry for the viewport (null until the model has been read)
export function modelGeometry(key) {
  const k = splitKey(key); if (!k) return null;
  const m = readyModel(k[0])?.meshes[k[1]]; if (!m) return null;
  return m.geom ||= decodePacked(m.bytes);
}
export function modelClipBytes(key) {
  const k = splitKey(key); if (!k) return null;
  return readyModel(k[0])?.clips[k[1]]?.bytes || null;
}
// reads every model the game could use (before Play starts)
export async function ensureModels() {
  const paths = Object.entries(project.data.files).filter(([, f]) => f.kind === 'model').map(([p]) => p);
  await Promise.all(paths.map(loadModel));
}
export function isModelPath(p) { return MODEL_EXTS.includes(p.split('.').pop().toLowerCase()); }

// ---------------- import ----------------
async function imageToDataURL(img) {
  if (!img) return null;
  const w = img.width || img.naturalWidth, h = img.height || img.naturalHeight;
  if (!w || !h) return null;
  const k = Math.min(1, 2048 / Math.max(w, h));
  const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return { url: c.toDataURL('image/png'), w: c.width, h: c.height };
}
async function waitImage(tex) {
  const img = tex?.image; if (!img) return null;
  if (img instanceof HTMLImageElement && !img.complete) await new Promise(r => { img.onload = r; img.onerror = r; setTimeout(r, 4000); });
  return img;
}

export async function importModelFile(file, dir) {
  const ext = file.name.split('.').pop().toLowerCase();
  const buffer = await file.arrayBuffer();
  const name = file.name.replace(/\.[^.]+$/, '');
  const parsed = await parseFile(ext, buffer);
  const conv = convert(parsed, name);
  const path = project.uniquePath(dir, name, ext);
  const assetBase = baseName(path);
  // materials (and their textures) become assets next to the model, like Unity's "Extract Materials"
  const matPaths = [];
  if (conv.matDefs.length) {
    const folder = `${dir}/${assetBase} Materials`;
    project.addFolder?.(folder);
    if (!project.data.folders.includes(folder)) project.data.folders.push(folder);
    const texDone = new Map();
    for (const m of conv.matDefs) {
      const data = { color: [1, 1, 1, 1], metallic: 0, smoothness: 0.5 };
      if (m.color) { const c = {}; m.color.getRGB(c, THREE.SRGBColorSpace); data.color = [c.r, c.g, c.b, m.opacity ?? 1]; }
      if (m.isMeshStandardMaterial) { data.metallic = m.metalness ?? 0; data.smoothness = 1 - (m.roughness ?? 0.5); }
      else if (m.shininess != null) data.smoothness = Math.min(0.9, Math.sqrt(m.shininess / 100) * 0.6);
      { const k = m.emissiveIntensity ?? 1; if (m.emissive && k > 0 && (m.emissive.r || m.emissive.g || m.emissive.b)) { const c = {}; m.emissive.clone().multiplyScalar(k).getRGB(c, THREE.SRGBColorSpace); data.emission = [c.r, c.g, c.b, 1]; } }
      if (m.transparent && (m.opacity ?? 1) < 1) data.surface = 1;
      if (m.map) {
        let tp = texDone.get(m.map);
        if (tp === undefined) {
          tp = null;
          const img = await waitImage(m.map);
          const d = await imageToDataURL(img).catch(() => null);
          if (d) { tp = project.uniquePath(folder, (m.map.name || m.name || 'Texture').replace(/[\\/:*?"<>|]/g, '_'), 'png'); project.writeData(tp, Object.assign(d, { sprite: false })); }
          texDone.set(m.map, tp);
        }
        if (tp) data.texture = tp;
      }
      const mp = project.uniquePath(folder, (m.name || 'Material').replace(/[\\/:*?"<>|]/g, '_'), 'mat');
      project.writeData(mp, data);
      matPaths.push(mp);
    }
  }
  // the node tree, stored like a prefab
  const ids = conv.nodes.map((_, i) => i + 1);
  const objects = conv.nodes.map((n, i) => {
    const o = { id: ids[i], name: n.name, parent: n.parent >= 0 ? ids[n.parent] : 0, active: true, tag: 'Untagged', layer: 0, p: n.p.map(r4), r: n.r.map(r6), e: quatToEuler(n.r).map(r4), s: n.s.map(r4), comps: [] };
    if (n.mesh != null) {
      const key = `${path}#${n.mesh}`;
      const mats = (n.mats || []).map(k => matPaths[k] || null);
      if (n.skin) {
        o.comps.push(Object.assign(makeComponent('SkinnedMeshRenderer'), { mesh: key, materials: mats, bones: n.bones.map(b => b >= 0 ? { ref: ids[b] } : null), rootBone: n.rootBone >= 0 ? { ref: ids[n.rootBone] } : null }));
      } else {
        o.comps.push(Object.assign(makeComponent('MeshFilter'), { mesh: key }));
        const mr = Object.assign(makeComponent('MeshRenderer'), { material: mats[0] || null });
        if (mats.length > 1) mr.materials = mats;
        o.comps.push(mr);
      }
    }
    return o;
  });
  if (conv.clips.length) objects[0].comps.push(Object.assign(makeComponent('Animator'), {}));
  const data = {
    url: bufferToDataURL(buffer, 'application/octet-stream'), fmt: ext, size: buffer.byteLength,
    objects, nextId: objects.length + 1,
    meshes: conv.meshes.map(m => ({ name: m.name, subs: m.conv.subs.length, b: m.conv.b.map(r6), verts: m.conv.pos.length / 3 })),
    clips: conv.clips.map(c => ({ name: c.name, length: r4(c.length) })),
    materials: matPaths,
  };
  project.writeData(path, data);
  loadModel(path);
  return path;
}
const r4 = (v) => { const r = Math.round(v * 1e4) / 1e4; return Object.is(r, -0) ? 0 : r; };
const r6 = (v) => { const r = Math.round(v * 1e6) / 1e6; return Object.is(r, -0) ? 0 : r; };
