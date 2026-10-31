// The mesh format shared by the C# engine and the page (Mesh.Pack / Mesh.Unpack in C#):
// int32 [vertexCount, flags (1 normals, 2 uv, 4 colors, 8 skin), subCount, per sub: start, count, topology]
// float32 positions, normals?, uv?, colors?; int32 indices (all subs); skin?: int32 4 bone indices per vertex,
// float32 4 weights per vertex, int32 bindposeCount, float32 16 per bindpose (column-major). Unity coordinates.
import * as THREE from 'three';

const srgbToLinear = (v) => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);

// builds three.js geometry (z flipped for three.js) from a packed mesh
export function decodePacked(u8) {
  const n4 = u8.byteLength >> 2;
  const i32 = new Int32Array(u8.buffer, u8.byteOffset, n4), f32 = new Float32Array(u8.buffer, u8.byteOffset, n4);
  let o = 0;
  const vc = i32[o++], flags = i32[o++], subCount = i32[o++];
  const subs = [];
  let idxTotal = 0;
  for (let s = 0; s < subCount; s++) { subs.push({ start: i32[o], count: i32[o + 1], topo: i32[o + 2] }); idxTotal = Math.max(idxTotal, i32[o] + i32[o + 1]); o += 3; }
  const pos = new Float32Array(vc * 3);
  for (let i = 0; i < vc; i++) { pos[i * 3] = f32[o++]; pos[i * 3 + 1] = f32[o++]; pos[i * 3 + 2] = -f32[o++]; }
  let nrm = null, uv = null, col = null, skinIdx = null, skinW = null;
  if (flags & 1) { nrm = new Float32Array(vc * 3); for (let i = 0; i < vc; i++) { nrm[i * 3] = f32[o++]; nrm[i * 3 + 1] = f32[o++]; nrm[i * 3 + 2] = -f32[o++]; } }
  if (flags & 2) { uv = f32.slice(o, o + vc * 2); o += vc * 2; }
  if (flags & 4) { col = new Float32Array(vc * 4); for (let i = 0; i < vc * 4; i++) { const v = f32[o++]; col[i] = (i & 3) === 3 ? v : srgbToLinear(Math.max(0, v)); } }
  const idx = i32.subarray(o, o + idxTotal); o += idxTotal;
  if (flags & 8) {
    skinIdx = new Uint16Array(vc * 4); for (let i = 0; i < vc * 4; i++) skinIdx[i] = Math.max(0, i32[o++]);
    skinW = f32.slice(o, o + vc * 4); o += vc * 4;
  }
  // triangles (and quads) become groups of one mesh; lines and points become their own objects
  const tri = [], lineIdx = [], pointIdx = [], groups = [];
  subs.forEach((s, si) => {
    const a = idx.subarray(s.start, s.start + s.count);
    const start = tri.length;
    if (s.topo === 0) for (let i = 0; i + 2 < a.length; i += 3) tri.push(a[i], a[i + 2], a[i + 1]); // flip winding with the z flip
    else if (s.topo === 2) for (let i = 0; i + 3 < a.length; i += 4) tri.push(a[i], a[i + 2], a[i + 1], a[i], a[i + 3], a[i + 2]);
    else if (s.topo === 3) for (const k of a) lineIdx.push(k);
    else if (s.topo === 4) for (let i = 0; i + 1 < a.length; i++) lineIdx.push(a[i], a[i + 1]);
    else if (s.topo === 5) for (const k of a) pointIdx.push(k);
    groups.push({ start, count: tri.length - start, mat: si });
  });
  const mk = (indices) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    if (nrm) g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    if (uv) g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 4));
    if (skinIdx) { g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIdx, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(skinW, 4)); }
    if (indices) g.setIndex(vc > 65535 ? new THREE.Uint32BufferAttribute(indices, 1) : new THREE.Uint16BufferAttribute(indices, 1));
    return g;
  };
  const geo = mk(tri);
  for (const gr of groups) geo.addGroup(gr.start, gr.count, gr.mat);
  if (!nrm && tri.length) geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const entry = { geo, hasColor: !!col, subCount: Math.max(1, subCount), skinned: !!skinIdx };
  if (lineIdx.length) entry.lines = mk(lineIdx);
  if (pointIdx.length) entry.points = mk(pointIdx);
  return entry;
}

// packs Unity-space arrays: { pos, nrm?, uv?, col?, subs: [{ indices, topo }], skinIdx?, skinW?, bindposes?: [Float32Array(16)] }
export function encodePacked(m) {
  const vc = m.pos.length / 3;
  const hasN = !!m.nrm, hasUV = !!m.uv, hasC = !!m.col, hasSkin = !!(m.skinIdx && m.skinW);
  let idxTotal = 0; for (const s of m.subs) idxTotal += s.indices.length;
  const ints = 3 + m.subs.length * 3;
  const floats = vc * 3 + (hasN ? vc * 3 : 0) + (hasUV ? vc * 2 : 0) + (hasC ? vc * 4 : 0);
  const skin = hasSkin ? vc * 8 + 1 + (m.bindposes?.length || 0) * 16 : 0;
  const buf = new ArrayBuffer((ints + floats + idxTotal + skin) * 4);
  const i32 = new Int32Array(buf), f32 = new Float32Array(buf);
  let o = 0;
  i32[o++] = vc; i32[o++] = (hasN ? 1 : 0) | (hasUV ? 2 : 0) | (hasC ? 4 : 0) | (hasSkin ? 8 : 0); i32[o++] = m.subs.length;
  let start = 0;
  for (const s of m.subs) { i32[o++] = start; i32[o++] = s.indices.length; i32[o++] = s.topo || 0; start += s.indices.length; }
  f32.set(m.pos, o); o += vc * 3;
  if (hasN) { f32.set(m.nrm, o); o += vc * 3; }
  if (hasUV) { f32.set(m.uv, o); o += vc * 2; }
  if (hasC) { f32.set(m.col, o); o += vc * 4; }
  for (const s of m.subs) { i32.set(s.indices, o); o += s.indices.length; }
  if (hasSkin) {
    i32.set(m.skinIdx, o); o += vc * 4;
    f32.set(m.skinW, o); o += vc * 4;
    const bp = m.bindposes || [];
    i32[o++] = bp.length;
    for (const b of bp) { f32.set(b, o); o += 16; }
  }
  return new Uint8Array(buf);
}
