// Anvil — what Play mode draws beyond the built-in shapes: meshes built by scripts, textures, each renderer's
// materials, 3D text (TextMesh), and lines, trails and particles (rebuilt every frame to face the camera).
// Everything arrives in Unity's coordinates; the z axis is flipped here for three.js.
import * as THREE from 'three';
import { decodePacked } from '../core/meshpack.js';
import { modelGeometry } from '../core/models.js';

const srgbToLinear = (v) => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);

let softDot = null;
function softDotTexture() {
  if (softDot) return softDot;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.75)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  softDot = new THREE.CanvasTexture(c); softDot.colorSpace = THREE.SRGBColorSpace;
  return softDot;
}

export class RuntimeRender {
  constructor(root) {
    this.root = root;               // play-mode root group
    this.geos = new Map();          // mesh uid -> { geo, lines, points, ver }
    this.texs = new Map();          // texture uid -> { tex, clones: [] }
    this.slots = new Map();         // material slot -> { defs, ver, cache: Map(key -> material | material[]) }
    this.texts = new Map();         // TextMesh id -> { def, ver }
    this.extras = null;             // Float64Array for this frame
    this.extraObjs = new Map();     // key -> { mesh, kind }
  }
  reset() {
    for (const g of this.geos.values()) if (!g.shared) { g.geo.dispose(); g.lines?.dispose(); g.points?.dispose(); }
    for (const t of this.texs.values()) { t.tex.dispose(); t.clones.forEach(c => c.dispose()); }
    for (const s of this.slots.values()) disposeCache(s.cache);
    for (const o of this.extraObjs.values()) { o.mesh.removeFromParent(); if (o.skinned) o.skeleton.dispose(); else o.mesh.geometry.dispose(); }
    this.geos.clear(); this.texs.clear(); this.slots.clear(); this.texts.clear(); this.extraObjs.clear(); this.extras = null;
  }

  // ---------------- meshes ----------------
  uploadMesh(uid, u8) {
    const old = this.geos.get(uid);
    if (old && !old.shared) { old.geo.dispose(); old.lines?.dispose(); old.points?.dispose(); }
    const entry = decodePacked(u8);
    entry.ver = (old?.ver || 0) + 1;
    this.geos.set(uid, entry);
  }
  // a mesh of an imported model: the page already has its geometry
  useModelMesh(uid, key) {
    const g = modelGeometry(key);
    if (!g) return;
    const old = this.geos.get(uid);
    this.geos.set(uid, Object.assign({}, g, { shared: true, ver: (old?.ver || 0) + 1 }));
  }
  meshGone(list) { for (const uid of list) { const g = this.geos.get(uid); if (g) { if (!g.shared) g.geo.dispose(); this.geos.delete(uid); } } }
  geometry(uid) { return this.geos.get(uid) || null; }

  // ---------------- textures ----------------
  uploadTexture(uid, w, h, flags, u8) {
    const filter = flags & 15, wrap = (flags >> 4) & 15;
    let e = this.texs.get(uid);
    if (e && e.tex.image.width === w && e.tex.image.height === h) {
      e.tex.image.data.set(u8); e.tex.needsUpdate = true;
      for (const c of e.clones) c.needsUpdate = true;
      return;
    }
    if (e) { e.tex.dispose(); e.clones.forEach(c => c.dispose()); }
    const tex = new THREE.DataTexture(new Uint8Array(u8), w, h, THREE.RGBAFormat);
    tex.colorSpace = THREE.SRGBColorSpace;
    const wm = wrap === 1 ? THREE.ClampToEdgeWrapping : wrap === 2 ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
    tex.wrapS = tex.wrapT = wm;
    if (filter === 0) { tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; }
    else { tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true; }
    tex.needsUpdate = true;
    this.texs.set(uid, { tex, clones: [] });
    // materials made before this texture arrived need remaking
    for (const s of this.slots.values()) if (s.defs.some(d => d.t === uid)) { disposeCache(s.cache); s.cache = new Map(); }
  }
  // an imported image file (Assets/…png): the engine sends only its path
  uploadTextureAsset(uid, path) {
    if (this.texs.has(uid)) return;
    const f = window.anvil?.project?.file(path); const url = f?.data?.url;
    if (!url) return;
    const tex = new THREE.Texture();
    tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const img = new Image();
    img.onload = () => { tex.image = img; tex.needsUpdate = true; for (const c of e.clones) { c.image = img; c.needsUpdate = true; } };
    img.src = url;
    const e = { tex, clones: [], url, asset: true };
    this.texs.set(uid, e);
    for (const s of this.slots.values()) if (s.defs.some(d => d.t === uid)) { disposeCache(s.cache); s.cache = new Map(); }
  }
  // an image URL of a texture, for the OnGUI overlay (Unity textures start at the bottom row, images at the top)
  textureURL(uid) {
    const e = this.texs.get(uid); if (!e) return null;
    if (e.asset) return e.url;
    const ver = e.tex.version;
    if (e.url && e.urlVer === ver) return e.url;
    const { width: w, height: h, data } = e.tex.image;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) img.data.set(data.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    g.putImageData(img, 0, 0);
    e.url = c.toDataURL(); e.urlVer = ver;
    return e.url;
  }
  texture(uid, st) {
    const e = this.texs.get(uid); if (!e) return null;
    if (!st) return e.tex;
    const c = e.tex.clone(); c.repeat.set(st[0], st[1]); c.offset.set(st[2], st[3]); c.needsUpdate = true; e.clones.push(c);
    return c;
  }

  // ---------------- materials ----------------
  setMats(obj) {
    for (const [k, defs] of Object.entries(obj)) {
      const id = +k; const old = this.slots.get(id);
      if (old) disposeCache(old.cache);
      this.slots.set(id, { defs, ver: (old?.ver || 0) + 1, cache: new Map() });
    }
  }
  // material (or array, one per sub-mesh) for a renderer slot
  materials(slotId, subCount = 1, opts = {}) {
    const s = this.slots.get(slotId);
    const key = subCount + '|' + (opts.vertexColors ? 1 : 0) + (opts.ribbon ? 'r' : '') + (opts.particles ? 'p' : '');
    if (!s) return defaultMat();
    let m = s.cache.get(key);
    if (!m) {
      const list = [];
      for (let i = 0; i < subCount; i++) list.push(this.makeMat(s.defs[Math.min(i, s.defs.length - 1)] || { missing: 1 }, opts));
      m = subCount === 1 ? list[0] : list;
      s.cache.set(key, m);
    }
    return m;
  }
  slotVersion(slotId) { return this.slots.get(slotId)?.ver || 0; }
  makeMat(d, opts) {
    if (d.missing) return new THREE.MeshBasicMaterial({ color: 0xff00ff, side: opts.ribbon || opts.particles ? THREE.DoubleSide : THREE.FrontSide });
    const color = new THREE.Color().setRGB(d.c[0], d.c[1], d.c[2], THREE.SRGBColorSpace);
    const unlit = d.u || opts.particles;
    const m = unlit ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshStandardMaterial({ color, metalness: d.m || 0, roughness: Math.min(1, Math.max(0.05, 1 - (d.s ?? 0.5) * 0.85)) });
    if (d.e && !unlit) { m.emissive = new THREE.Color().setRGB(d.e[0], d.e[1], d.e[2], THREE.SRGBColorSpace); }
    if (d.t) { const t = this.texture(d.t, d.st); if (t) m.map = t; }
    else if (opts.particles) m.map = softDotTexture();
    if (d.tr || opts.particles || d.c[3] < 0.999) { m.transparent = true; m.opacity = d.c[3]; if (d.tr || opts.particles) m.depthWrite = false; }
    if (d.add) { m.blending = THREE.AdditiveBlending; m.transparent = true; m.depthWrite = false; }
    if (d.cut) m.alphaTest = d.cut;
    if (d.ds || opts.ribbon || opts.particles) m.side = THREE.DoubleSide;
    if ((d.vc && opts.vertexColors) || opts.ribbon || opts.particles) m.vertexColors = true;
    return m;
  }

  // ---------------- 3D text ----------------
  setTexts(obj) { for (const [k, def] of Object.entries(obj)) { const id = +k; const old = this.texts.get(id); this.texts.set(id, { def, ver: (old?.ver || 0) + 1 }); } }
  // keeps node.text (a plane with the text drawn on it) up to date
  updateText(node, textId) {
    const e = this.texts.get(textId); if (!e) return;
    if (node.textVer === e.ver && node.textMesh) return;
    node.textVer = e.ver;
    const d = e.def;
    if (!node.textMesh) {
      node.textCanvas = document.createElement('canvas');
      node.textTex = new THREE.CanvasTexture(node.textCanvas); node.textTex.colorSpace = THREE.SRGBColorSpace;
      node.textMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: node.textTex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      node.group.add(node.textMesh);
    }
    const px = 64, size = d.size > 0 ? d.size : 13;
    const lineWorld = size * (d.cs || 1) * 0.1;
    const lines = String(d.text).split('\n').map(l => d.rich ? richRuns(l) : [{ text: l }]);
    const base = `${d.style & 2 ? 'italic ' : ''}${d.style & 1 ? 'bold ' : ''}`;
    const family = d.font && d.font !== 'LegacyRuntime' && d.font !== 'Font' ? `"${d.font}", Arial, sans-serif` : 'Arial, sans-serif';
    const g = node.textCanvas.getContext('2d');
    const fontFor = (r) => `${r.i ? 'italic ' : ''}${r.b ? 'bold ' : ''}${base}${Math.round(px * (r.size ? r.size / size : 1))}px ${family}`;
    const widths = lines.map(runs => runs.reduce((w, r) => { g.font = fontFor(r); return w + g.measureText(r.text).width; }, 0));
    const lh = px * 1.15 * (d.ls || 1);
    const W = Math.max(2, Math.ceil(Math.max(...widths, 1)) + 4), H = Math.max(2, Math.ceil(lh * lines.length) + 4);
    node.textCanvas.width = W; node.textCanvas.height = H;
    g.clearRect(0, 0, W, H); g.textBaseline = 'middle';
    const col = `rgba(${Math.round(d.c[0] * 255)},${Math.round(d.c[1] * 255)},${Math.round(d.c[2] * 255)},${d.c[3]})`;
    lines.forEach((runs, li) => {
      let x = d.align === 1 ? (W - widths[li]) / 2 : d.align === 2 ? W - 2 - widths[li] : 2;
      const y = 2 + lh * li + lh / 2;
      for (const r of runs) { g.font = fontFor(r); g.fillStyle = r.color || col; g.fillText(r.text, x, y); x += g.measureText(r.text).width; }
    });
    node.textTex.needsUpdate = true;
    const scale = lineWorld / px; // world units per canvas pixel
    const w = W * scale, h = H * scale;
    node.textMesh.scale.set(w, h, 1);
    const ax = d.anchor % 3, ay = Math.floor(d.anchor / 3);
    node.textMesh.position.set(ax === 0 ? w / 2 : ax === 2 ? -w / 2 : 0, ay === 0 ? -h / 2 : ay === 2 ? h / 2 : 0, -(d.z || 0));
  }

  // ---------------- lines, trails, particles ----------------
  setExtras(data) { this.extras = data; }
  // rebuilds the camera-facing geometry for the camera about to render
  buildExtras(camera) {
    const data = this.extras;
    const seen = new Set();
    if (data && data.length) {
      const camPos = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
      const fwd = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 2).normalize(); // points back toward the viewer
      let o = 1;
      const count = data[0] | 0;
      for (let k = 0; k < count; k++) {
        const type = data[o] | 0, id = data[o + 1] | 0, slot = data[o + 2] | 0, n = data[o + 3] | 0;
        const key = type + ':' + id; seen.add(key);
        if (type === 1) { o = this.buildLine(key, slot, n, data, o + 4, camPos); }
        else if (type === 2) { o = this.buildParticles(key, slot, n, data, o + 4, camPos, right, up, fwd); }
        else if (type === 3) { o = this.buildSkinned(key, slot, n, data, o + 4); }
        else break;
      }
    }
    for (const [key, obj] of this.extraObjs) if (!seen.has(key)) { obj.mesh.removeFromParent(); if (!obj.skinned) obj.mesh.geometry.dispose(); else obj.skeleton.dispose(); this.extraObjs.delete(key); }
  }
  // a skinned mesh posed by the engine's bone matrices (bone.localToWorldMatrix * bindpose, Unity space)
  buildSkinned(key, slot, nb, d, o) {
    const ref = d[o] | 0, enabled = d[o + 1] !== 0, cast = d[o + 2] !== 0, recv = d[o + 3] !== 0; o += 4;
    const g = ref < 0 ? this.geos.get(-ref) : null;
    let obj = this.extraObjs.get(key);
    if (!g || !g.skinned) { if (obj) obj.mesh.visible = false; return o + nb * 16; }
    if (!obj || !obj.skinned || obj.geo !== g.geo || obj.nb !== nb) {
      if (obj) { obj.mesh.removeFromParent(); if (obj.skinned) obj.skeleton.dispose(); }
      const bones = []; for (let i = 0; i < nb; i++) bones.push(new THREE.Bone());
      const skeleton = new THREE.Skeleton(bones, bones.map(() => new THREE.Matrix4()));
      const mesh = new THREE.SkinnedMesh(g.geo, defaultMat());
      mesh.bind(skeleton, new THREE.Matrix4());
      mesh.frustumCulled = false; mesh.matrixAutoUpdate = false;
      skeleton.update = function () { if (this.boneTexture) this.boneTexture.needsUpdate = true; };
      this.root.add(mesh);
      obj = { mesh, skinned: true, skeleton, geo: g.geo, nb, slot: null, ver: -1 };
      this.extraObjs.set(key, obj);
    }
    const bm = obj.skeleton.boneMatrices;
    for (let b = 0; b < nb; b++, o += 16) {
      // Unity -> three.js: flip z on both sides (S M S, S = diag(1, 1, -1, 1))
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) bm[b * 16 + c * 4 + r] = d[o + c * 4 + r] * ((r === 2) !== (c === 2) ? -1 : 1);
    }
    if (obj.skeleton.boneTexture) obj.skeleton.boneTexture.needsUpdate = true;
    const ver = this.slotVersion(slot);
    if (obj.slot !== slot || obj.ver !== ver) { obj.mesh.material = this.materials(slot, g.subCount, { vertexColors: g.hasColor }); obj.slot = slot; obj.ver = ver; }
    obj.mesh.visible = enabled; obj.mesh.castShadow = cast; obj.mesh.receiveShadow = recv;
    return o;
  }
  extraObj(key, slot, opts) {
    let obj = this.extraObjs.get(key);
    if (!obj) {
      const geo = new THREE.BufferGeometry();
      const mesh = new THREE.Mesh(geo); mesh.frustumCulled = false; mesh.matrixAutoUpdate = false;
      this.root.add(mesh);
      obj = { mesh, cap: 0 }; this.extraObjs.set(key, obj);
    }
    const ver = this.slotVersion(slot);
    if (obj.slot !== slot || obj.ver !== ver) { obj.mesh.material = this.materials(slot, 1, opts); obj.slot = slot; obj.ver = ver; }
    return obj;
  }
  ensureCap(obj, verts, tris) {
    if (obj.cap >= verts && obj.tcap >= tris) return;
    const cap = Math.max(verts, Math.ceil(obj.cap * 1.5), 16), tcap = Math.max(tris, Math.ceil((obj.tcap || 0) * 1.5), 16);
    const g = obj.mesh.geometry;
    obj.pos = new Float32Array(cap * 3); obj.col = new Float32Array(cap * 4); obj.uv = new Float32Array(cap * 2); obj.idx = new Uint32Array(tcap * 3);
    g.setAttribute('position', new THREE.BufferAttribute(obj.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(obj.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(obj.uv, 2).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(obj.idx, 1).setUsage(THREE.DynamicDrawUsage));
    obj.cap = cap; obj.tcap = tcap;
  }
  finish(obj, verts, tris) {
    const g = obj.mesh.geometry;
    for (const a of ['position', 'color', 'uv']) g.attributes[a].needsUpdate = true;
    g.index.needsUpdate = true;
    g.setDrawRange(0, tris * 3);
  }
  buildLine(key, slot, n, d, o, camPos) {
    const alignZ = d[o] === 1, fz = new THREE.Vector3(d[o + 1], d[o + 2], -d[o + 3]); o += 6;
    const obj = this.extraObj(key, slot, { ribbon: true });
    this.ensureCap(obj, n * 2, (n - 1) * 2);
    const P = [], W = [], C = [];
    for (let i = 0; i < n; i++, o += 8) { P.push(new THREE.Vector3(d[o], d[o + 1], -d[o + 2])); W.push(d[o + 3]); C.push([srgbToLinear(d[o + 4]), srgbToLinear(d[o + 5]), srgbToLinear(d[o + 6]), d[o + 7]]); }
    const dir = new THREE.Vector3(), view = new THREE.Vector3(), side = new THREE.Vector3();
    let len = 0;
    for (let i = 0; i < n; i++) {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
      dir.subVectors(b, a); if (dir.lengthSq() < 1e-12) dir.set(1, 0, 0); dir.normalize();
      if (alignZ) view.copy(fz); else view.subVectors(camPos, P[i]);
      side.crossVectors(dir, view); if (side.lengthSq() < 1e-12) side.set(0, 1, 0); side.normalize().multiplyScalar(W[i] * 0.5);
      if (i > 0) len += P[i].distanceTo(P[i - 1]);
      const v = i * 2;
      obj.pos.set([P[i].x - side.x, P[i].y - side.y, P[i].z - side.z, P[i].x + side.x, P[i].y + side.y, P[i].z + side.z], v * 3);
      obj.col.set(C[i], v * 4); obj.col.set(C[i], v * 4 + 4);
      const u = n > 1 ? i / (n - 1) : 0;
      obj.uv.set([u, 0, u, 1], v * 2);
      if (i > 0) obj.idx.set([v - 2, v, v - 1, v - 1, v, v + 1], (i - 1) * 6);
    }
    this.finish(obj, n * 2, (n - 1) * 2);
    return o;
  }
  buildParticles(key, slot, n, d, o, camPos, right, up, fwd) {
    const mode = d[o] | 0, velScale = d[o + 1], lenScale = d[o + 2]; o += 4;
    const obj = this.extraObj(key, slot, { particles: true });
    this.ensureCap(obj, n * 4, n * 2);
    const p = new THREE.Vector3(), v = new THREE.Vector3(), r = new THREE.Vector3(), u = new THREE.Vector3(), axis = new THREE.Vector3(), view = new THREE.Vector3();
    const R = new THREE.Vector3(1, 0, 0), U = new THREE.Vector3(0, 1, 0), Fz = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i < n; i++, o += 12) {
      p.set(d[o], d[o + 1], -d[o + 2]); const size = d[o + 3];
      const c = [srgbToLinear(d[o + 4]), srgbToLinear(d[o + 5]), srgbToLinear(d[o + 6]), d[o + 7]];
      v.set(d[o + 8], d[o + 9], -d[o + 10]); const rot = d[o + 11];
      const h = size * 0.5;
      let a0, a1, a2, a3; // corners
      if (mode === 1) { // stretched along the velocity, head at the particle
        view.subVectors(camPos, p).normalize();
        axis.copy(v).addScaledVector(view, -v.dot(view));
        const speed = v.length();
        if (axis.lengthSq() < 1e-10) axis.copy(up); axis.normalize();
        const L = size * lenScale + speed * velScale;
        r.crossVectors(axis, view).normalize().multiplyScalar(h);
        const tail = p.clone().addScaledVector(axis, -L);
        a0 = tail.clone().sub(r); a1 = tail.clone().add(r); a2 = p.clone().add(r); a3 = p.clone().sub(r);
      } else {
        if (mode === 2) { r.copy(R).multiplyScalar(h); u.copy(Fz).multiplyScalar(-h); }
        else if (mode === 3) { view.subVectors(camPos, p); view.y = 0; if (view.lengthSq() < 1e-10) view.set(0, 0, 1); view.normalize(); r.crossVectors(U, view).normalize().multiplyScalar(h); u.copy(U).multiplyScalar(h); }
        else { r.copy(right).multiplyScalar(h); u.copy(up).multiplyScalar(h); }
        if (rot) { const cs = Math.cos(-rot), sn = Math.sin(-rot); const r2 = r.clone().multiplyScalar(cs).addScaledVector(u, sn); u.multiplyScalar(cs).addScaledVector(r, -sn); r.copy(r2); }
        a0 = p.clone().sub(r).sub(u); a1 = p.clone().add(r).sub(u); a2 = p.clone().add(r).add(u); a3 = p.clone().sub(r).add(u);
      }
      const vb = i * 4;
      obj.pos.set([a0.x, a0.y, a0.z, a1.x, a1.y, a1.z, a2.x, a2.y, a2.z, a3.x, a3.y, a3.z], vb * 3);
      for (let k = 0; k < 4; k++) obj.col.set(c, (vb + k) * 4);
      obj.uv.set([0, 0, 1, 0, 1, 1, 0, 1], vb * 2);
      obj.idx.set([vb, vb + 1, vb + 2, vb, vb + 2, vb + 3], i * 6);
    }
    this.finish(obj, n * 4, n * 2);
    return o;
  }
}

function defaultMat() { return new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }); }
function disposeCache(cache) { for (const m of cache.values()) (Array.isArray(m) ? m : [m]).forEach(x => x.dispose()); }

// <b>, <i>, <color=#rrggbb>/<color=name>, <size=n> — the rich text tags TextMesh understands
const NAMED = { red: '#ff0000', green: '#008000', blue: '#0000ff', white: '#ffffff', black: '#000000', yellow: '#ffff00', cyan: '#00ffff', magenta: '#ff00ff', grey: '#808080', gray: '#808080', orange: '#ffa500', lime: '#00ff00', aqua: '#00ffff', brown: '#a52a2a', darkblue: '#0000a0', lightblue: '#add8e6', maroon: '#800000', navy: '#000080', olive: '#808000', purple: '#800080', silver: '#c0c0c0', teal: '#008080', fuchsia: '#ff00ff' };
export function richRuns(s) {
  const runs = []; const stack = [{}];
  const re = /<(\/?)(b|i|color|size)(?:=([^>]+))?>/gi;
  let last = 0, m;
  const push = (text) => { if (text) runs.push({ text, ...stack[stack.length - 1] }); };
  while ((m = re.exec(s))) {
    push(s.slice(last, m.index)); last = re.lastIndex;
    const tag = m[2].toLowerCase(), cur = stack[stack.length - 1];
    if (m[1]) { if (stack.length > 1) stack.pop(); continue; }
    if (tag === 'b') stack.push({ ...cur, b: true });
    else if (tag === 'i') stack.push({ ...cur, i: true });
    else if (tag === 'size') stack.push({ ...cur, size: parseFloat(m[3]) || undefined });
    else if (tag === 'color') { let c = (m[3] || '').replace(/["']/g, '').trim(); c = NAMED[c.toLowerCase()] || c; if (/^#[0-9a-f]{8}$/i.test(c)) { const a = parseInt(c.slice(7, 9), 16) / 255; c = `rgba(${parseInt(c.slice(1, 3), 16)},${parseInt(c.slice(3, 5), 16)},${parseInt(c.slice(5, 7), 16)},${a})`; } stack.push({ ...cur, color: c }); }
  }
  push(s.slice(last));
  return runs.length ? runs : [{ text: '' }];
}
