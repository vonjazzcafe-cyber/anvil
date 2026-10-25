// Unity-convention math for the editor (left-handed, Euler order Z then X then Y, degrees).
export const D2R = Math.PI / 180, R2D = 180 / Math.PI;

export function eulerToQuat(e) {
  const hx = e[0] * D2R * 0.5, hy = e[1] * D2R * 0.5, hz = e[2] * D2R * 0.5;
  const sx = Math.sin(hx), cx = Math.cos(hx), sy = Math.sin(hy), cy = Math.cos(hy), sz = Math.sin(hz), cz = Math.cos(hz);
  const qx = cy * sx, qy = sy * cx, qz = -sy * sx, qw = cy * cx;
  return norm4([qx * cz + qy * sz, qy * cz - qx * sz, qw * sz + qz * cz, qw * cz - qz * sz]);
}
function wrap360(a) { a %= 360; if (a < 0) a += 360; if (a > 359.9999) a = 0; return a === 0 ? 0 : a; }
export function quatToEuler(q) {
  const [x, y, z, w] = norm4(q);
  const m12 = 2 * (y * z - w * x);
  let ex, ey, ez;
  if (m12 < -0.999999 || m12 > 0.999999) {
    ex = m12 < 0 ? 90 : -90;
    const m20 = 2 * (x * z - w * y), m00 = 1 - 2 * (y * y + z * z);
    ey = Math.atan2(-m20, m00) * R2D; ez = 0;
  } else {
    ex = Math.asin(-m12) * R2D;
    ey = Math.atan2(2 * (x * z + w * y), 1 - 2 * (x * x + y * y)) * R2D;
    ez = Math.atan2(2 * (x * y + w * z), 1 - 2 * (x * x + z * z)) * R2D;
  }
  return [wrap360(ex), wrap360(ey), wrap360(ez)];
}
// Pick the Euler representation closest to a previous one (keeps inspector values stable while rotating).
export function quatToEulerNear(q, hint) {
  const e = quatToEuler(q);
  if (!hint) return cleanEuler(e);
  const cands = [e, [180 - e[0], e[1] + 180, e[2] + 180]];
  let best = null, bestD = Infinity;
  for (const c of cands) {
    const r = c.map((v, i) => v + Math.round((hint[i] - v) / 360) * 360);
    const d = Math.abs(r[0] - hint[0]) + Math.abs(r[1] - hint[1]) + Math.abs(r[2] - hint[2]);
    if (d < bestD) { bestD = d; best = r; }
  }
  return cleanEuler(best);
}
export function cleanEuler(e) { return e.map(v => { const r = Math.round(v * 10000) / 10000; return Object.is(r, -0) ? 0 : r; }); }
export function norm4(q) { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; }
export function qmul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] + a[1] * b[3] + a[2] * b[0] - a[0] * b[2],
    a[3] * b[2] + a[2] * b[3] + a[0] * b[1] - a[1] * b[0],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
export function qinv(q) { return [-q[0], -q[1], -q[2], q[3]]; }
export function qrot(q, v) {
  const x = q[0] * 2, y = q[1] * 2, z = q[2] * 2;
  const xx = q[0] * x, yy = q[1] * y, zz = q[2] * z, xy = q[0] * y, xz = q[0] * z, yz = q[1] * z, wx = q[3] * x, wy = q[3] * y, wz = q[3] * z;
  return [(1 - (yy + zz)) * v[0] + (xy - wz) * v[1] + (xz + wy) * v[2], (xy + wz) * v[0] + (1 - (xx + zz)) * v[1] + (yz - wx) * v[2], (xz - wy) * v[0] + (yz + wx) * v[1] + (1 - (xx + yy)) * v[2]];
}
// 4x4 column-major (m[col*4+row]) like Unity's Matrix4x4 storage order m00 m10 m20 m30 ...
export function trs(p, q, s) {
  const x = q[0] * 2, y = q[1] * 2, z = q[2] * 2;
  const xx = q[0] * x, yy = q[1] * y, zz = q[2] * z, xy = q[0] * y, xz = q[0] * z, yz = q[1] * z, wx = q[3] * x, wy = q[3] * y, wz = q[3] * z;
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    p[0], p[1], p[2], 1,
  ];
}
export function mmul(a, b) {
  const r = new Array(16);
  for (let c = 0; c < 4; c++) for (let rr = 0; rr < 4; rr++) {
    let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + rr] * b[c * 4 + k];
    r[c * 4 + rr] = s;
  }
  return r;
}
export function minv(m) {
  const a = m, inv = new Array(16);
  inv[0] = a[5] * a[10] * a[15] - a[5] * a[11] * a[14] - a[9] * a[6] * a[15] + a[9] * a[7] * a[14] + a[13] * a[6] * a[11] - a[13] * a[7] * a[10];
  inv[4] = -a[4] * a[10] * a[15] + a[4] * a[11] * a[14] + a[8] * a[6] * a[15] - a[8] * a[7] * a[14] - a[12] * a[6] * a[11] + a[12] * a[7] * a[10];
  inv[8] = a[4] * a[9] * a[15] - a[4] * a[11] * a[13] - a[8] * a[5] * a[15] + a[8] * a[7] * a[13] + a[12] * a[5] * a[11] - a[12] * a[7] * a[9];
  inv[12] = -a[4] * a[9] * a[14] + a[4] * a[10] * a[13] + a[8] * a[5] * a[14] - a[8] * a[6] * a[13] - a[12] * a[5] * a[10] + a[12] * a[6] * a[9];
  inv[1] = -a[1] * a[10] * a[15] + a[1] * a[11] * a[14] + a[9] * a[2] * a[15] - a[9] * a[3] * a[14] - a[13] * a[2] * a[11] + a[13] * a[3] * a[10];
  inv[5] = a[0] * a[10] * a[15] - a[0] * a[11] * a[14] - a[8] * a[2] * a[15] + a[8] * a[3] * a[14] + a[12] * a[2] * a[11] - a[12] * a[3] * a[10];
  inv[9] = -a[0] * a[9] * a[15] + a[0] * a[11] * a[13] + a[8] * a[1] * a[15] - a[8] * a[3] * a[13] - a[12] * a[1] * a[11] + a[12] * a[3] * a[9];
  inv[13] = a[0] * a[9] * a[14] - a[0] * a[10] * a[13] - a[8] * a[1] * a[14] + a[8] * a[2] * a[13] + a[12] * a[1] * a[10] - a[12] * a[2] * a[9];
  inv[2] = a[1] * a[6] * a[15] - a[1] * a[7] * a[14] - a[5] * a[2] * a[15] + a[5] * a[3] * a[14] + a[13] * a[2] * a[7] - a[13] * a[3] * a[6];
  inv[6] = -a[0] * a[6] * a[15] + a[0] * a[7] * a[14] + a[4] * a[2] * a[15] - a[4] * a[3] * a[14] - a[12] * a[2] * a[7] + a[12] * a[3] * a[6];
  inv[10] = a[0] * a[5] * a[15] - a[0] * a[7] * a[13] - a[4] * a[1] * a[15] + a[4] * a[3] * a[13] + a[12] * a[1] * a[7] - a[12] * a[3] * a[5];
  inv[14] = -a[0] * a[5] * a[14] + a[0] * a[6] * a[13] + a[4] * a[1] * a[14] - a[4] * a[2] * a[13] - a[12] * a[1] * a[6] + a[12] * a[2] * a[5];
  inv[3] = -a[1] * a[6] * a[11] + a[1] * a[7] * a[10] + a[5] * a[2] * a[11] - a[5] * a[3] * a[10] - a[9] * a[2] * a[7] + a[9] * a[3] * a[6];
  inv[7] = a[0] * a[6] * a[11] - a[0] * a[7] * a[10] - a[4] * a[2] * a[11] + a[4] * a[3] * a[10] + a[8] * a[2] * a[7] - a[8] * a[3] * a[6];
  inv[11] = -a[0] * a[5] * a[11] + a[0] * a[7] * a[9] + a[4] * a[1] * a[11] - a[4] * a[3] * a[9] - a[8] * a[1] * a[7] + a[8] * a[3] * a[5];
  inv[15] = a[0] * a[5] * a[10] - a[0] * a[6] * a[9] - a[4] * a[1] * a[10] + a[4] * a[2] * a[9] + a[8] * a[1] * a[6] - a[8] * a[2] * a[5];
  let det = a[0] * inv[0] + a[1] * inv[4] + a[2] * inv[8] + a[3] * inv[12];
  if (Math.abs(det) < 1e-30) return null;
  det = 1 / det;
  return inv.map(v => v * det);
}
export function mpoint(m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]; }
export function quatFromMatrix(m) {
  // remove scale
  const c0 = norm3([m[0], m[1], m[2]]), c1 = norm3([m[4], m[5], m[6]]), c2 = norm3([m[8], m[9], m[10]]);
  const m00 = c0[0], m10 = c0[1], m20 = c0[2], m01 = c1[0], m11 = c1[1], m21 = c1[2], m02 = c2[0], m12 = c2[1], m22 = c2[2];
  const tr = m00 + m11 + m22;
  let q;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s]; }
  else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]; }
  else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s]; }
  else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s]; }
  return norm4(q);
}
export function norm3(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
export function scaleFromMatrix(m) { return [Math.hypot(m[0], m[1], m[2]), Math.hypot(m[4], m[5], m[6]), Math.hypot(m[8], m[9], m[10])]; }

// three.js is right-handed: flip Z for positions, (-x,-y,z,w) for rotations.
export function toThreePos(p, out) { out.set(p[0], p[1], -p[2]); return out; }
export function toThreeQuat(q, out) { out.set(-q[0], -q[1], q[2], q[3]); return out; }
export function fromThreePos(v) { return [v.x, v.y, -v.z]; }
export function fromThreeQuat(q) { return norm4([-q.x, -q.y, q.z, q.w]); }
// Unity world matrix (column-major array) -> three.js Matrix4 (applies the Z mirror on both sides).
export function unityMatrixToThree(m, o, out) {
  const e = out.elements;
  for (let i = 0; i < 16; i++) e[i] = m[o + i];
  // M' = S M S with S = diag(1,1,-1,1): negate row 2 and column 2 (but element (2,2) stays)
  e[2] = -e[2]; e[6] = -e[6]; e[14] = -e[14];
  e[8] = -e[8]; e[9] = -e[9]; e[11] = -e[11];
  return out;
}
export function round(v, d = 4) { const f = Math.pow(10, d); const r = Math.round(v * f) / f; return Object.is(r, -0) ? 0 : r; }
export function fmt(v) {
  if (typeof v !== 'number' || !isFinite(v)) return String(v);
  const r = round(v, 4);
  return String(r);
}
