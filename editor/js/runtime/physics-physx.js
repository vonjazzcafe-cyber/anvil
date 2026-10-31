// Anvil — the PhysX physics backend (NVIDIA PhysX 5, the same physics engine family Unity's 3D physics runs on),
// with Unity's settings: PGS solver, 6 position / 1 velocity iterations, contact offset 0.01, bounce threshold 2,
// sleep threshold 0.005, max depenetration velocity 10, D6 joints for Hinge/Character/Configurable/Fixed joints.
// Same functions as physics.js (Rapier), so the C# side doesn't know which one runs.
// Coordinates are Unity's numbers passed straight through, exactly like Unity passes them to PhysX.

let P = null, physics = null, scene = null, cooking = null, tol = null;
let nextId = 1;
const bodies = new Map();     // id -> { actor, type, colliders:Set<id>, maxAng, maxLin, detect }
const colliders = new Map();  // id -> { shape, geom, body:id, layer, trigger, iid, local:[7] }
const byShape = new Map();    // shape pointer -> collider id
const joints = new Map();     // id -> { joint, kind, b1, b2, d6 }
const materials = new Map();
let layerMasks = new Uint32Array(32).fill(0xffffffff);
const ignorePairs = new Set();
const touching = new Map();   // key -> { a, b, sensor }
let events = [];              // this step's contact events from PhysX
let broken = [];              // joints PhysX broke this step
let worldStatic = null;       // for joints connected to "the world"

// static functions of the bindings live on the class or its prototype depending on the build
const statCache = new Map();
function stat(cls, fn) { const k = cls + '.' + fn; let f = statCache.get(k); if (!f) { const C = P[cls]; const g = C[fn] || C.prototype[fn]; f = (...a) => g.apply(C.prototype, a); statCache.set(k, f); } return f; }
const key = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
let V = null, V2 = null, Q = null, T = null, T2 = null; // reusable temporaries
function vec(x, y, z, out = V) { out.set_x(x); out.set_y(y); out.set_z(z); return out; }
function quat(x, y, z, w, out = Q) { out.set_x(x); out.set_y(y); out.set_z(z); out.set_w(w); return out; }
function tr(a, o, out = T) { const p = out.get_p(), q = out.get_q(); p.set_x(a[o]); p.set_y(a[o + 1]); p.set_z(a[o + 2]); q.set_x(a[o + 3]); q.set_y(a[o + 4]); q.set_z(a[o + 5]); q.set_w(a[o + 6]); return out; }
function trv(px, py, pz, qx, qy, qz, qw, out = T) { const p = out.get_p(), q = out.get_q(); p.set_x(px); p.set_y(py); p.set_z(pz); q.set_x(qx); q.set_y(qy); q.set_z(qz); q.set_w(qw); return out; }
const rd = (v) => [v.get_x(), v.get_y(), v.get_z()];
function qmul(a, b) { return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] + a[1] * b[3] + a[2] * b[0] - a[0] * b[2], a[3] * b[2] + a[2] * b[3] + a[0] * b[1] - a[1] * b[0], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]]; }
function qrot(q, v) {
  const x = q[0] * 2, y = q[1] * 2, z = q[2] * 2;
  const xx = q[0] * x, yy = q[1] * y, zz = q[2] * z, xy = q[0] * y, xz = q[0] * z, yz = q[1] * z, wx = q[3] * x, wy = q[3] * y, wz = q[3] * z;
  return [(1 - (yy + zz)) * v[0] + (xy - wz) * v[1] + (xz + wy) * v[2], (xy + wz) * v[0] + (1 - (xx + zz)) * v[1] + (yz - wx) * v[2], (xz - wy) * v[0] + (yz + wx) * v[1] + (1 - (xx + yy)) * v[2]];
}
const S2 = Math.SQRT1_2;
const X_TO_Y = [0, 0, S2, S2];   // PhysX capsules lie along X; Unity's along Y (or X/Z by direction)
const X_TO_Z = [0, -S2, 0, S2];
// Unity's Quaternion.Euler (degrees in, ZXY order) from radians
function eulerQ(x, y, z) {
  const qx = [Math.sin(x / 2), 0, 0, Math.cos(x / 2)], qy = [0, Math.sin(y / 2), 0, Math.cos(y / 2)], qz = [0, 0, Math.sin(z / 2), Math.cos(z / 2)];
  return qmul(qmul(qy, qx), qz);
}

export async function initPhysX() {
  if (P) return;
  const { default: PhysX } = await import('../../../vendor/physx/physx-js-webidl.mjs');
  P = await PhysX();
  const ver = P.PHYSICS_VERSION;
  const fnd = P.CreateFoundation(ver, new P.PxDefaultAllocator(), new P.PxDefaultErrorCallback());
  tol = new P.PxTolerancesScale();
  physics = P.CreatePhysics(ver, fnd, tol);
  P.InitExtensions(physics);
  cooking = new P.PxCookingParams(tol);
  V = new P.PxVec3(0, 0, 0); V2 = new P.PxVec3(0, 0, 0); Q = new P.PxQuat(0, 0, 0, 1);
  T = new P.PxTransform(new P.PxVec3(0, 0, 0), new P.PxQuat(0, 0, 0, 1)); T2 = new P.PxTransform(new P.PxVec3(0, 0, 0), new P.PxQuat(0, 0, 0, 1));
}
export const physxReady = () => !!P;

// ---------------- filtering (Unity's layer matrix, IgnoreCollision, triggers, kinematic/static rules) ----------------
// simulation filter data: word0 layer, word1 collider instance id, word2 flags (1 trigger, 2 no collisions, 4 static, 8 kinematic)
let shaderImpl = null, shaderWrap = null;
function makeFilterShader() {
  shaderImpl = new P.PassThroughFilterShaderImpl();
  shaderWrap = P.wrapPointer(P.getPointer(shaderImpl), P.PassThroughFilterShader);
  const PF = P.PxPairFlagEnum, SUPPRESS = P.PxFilterFlagEnum.eSUPPRESS;
  const touchFlags = PF.eDETECT_DISCRETE_CONTACT | PF.eNOTIFY_TOUCH_FOUND | PF.eNOTIFY_TOUCH_PERSISTS | PF.eNOTIFY_TOUCH_LOST;
  const solid = touchFlags | PF.eSOLVE_CONTACT | PF.eNOTIFY_CONTACT_POINTS | PF.eDETECT_CCD_CONTACT;
  shaderImpl.filterShader = (a0, l0, i0, f0, w03, a1, l1, i1, f1, w13) => {
    if (((layerMasks[l0 & 31] >>> (l1 & 31)) & 1) === 0) return SUPPRESS;
    if (ignorePairs.size && ignorePairs.has(key(i0 | 0, i1 | 0))) return SUPPRESS;
    const trig = (f0 | f1) & 1;
    if (trig) {
      // triggers: an event when one side can move (Unity doesn't report static vs static)
      if ((f0 & 4) && (f1 & 4)) return SUPPRESS;
      shaderWrap.set_outputPairFlags(touchFlags); return 0;
    }
    if ((f0 | f1) & 2) return SUPPRESS;
    // no collisions between two non-dynamic bodies (kinematic/static)
    if ((f0 & 12) && (f1 & 12)) return SUPPRESS;
    shaderWrap.set_outputPairFlags(solid); return 0;
  };
  return shaderWrap;
}
function setFilter(c) {
  const b = bodies.get(c.body);
  const bit = 1 << (c.layer & 31);
  const flags = (c.trigger ? 1 : 0) | (b && b.detect === false ? 2 : 0) | (b && b.type === 0 ? 4 : 0) | (b && b.type === 2 ? 8 : 0);
  c.shape.setSimulationFilterData(new P.PxFilterData(c.layer & 31, c.iid >>> 0, flags, 0));
  c.shape.setQueryFilterData(new P.PxFilterData(c.trigger ? 0 : bit >>> 0, c.trigger ? bit >>> 0 : 0, 0, 0));
}
function refilter(bodyId) { const b = bodies.get(bodyId); if (b && b.inScene) try { scene.resetFiltering(b.actor); } catch (e) { } }

// ---------------- contact reports ----------------
let simCb = null, helpers = null, ptBuf = 0;
const PT_SIZE = 48, PT_MAX = 64; // PxContactPairPoint: position(12) separation(4) normal(12) face0(4) impulse(12) face1(4)
function makeCallback() {
  simCb = new P.PxSimulationEventCallbackImpl();
  helpers = { pairAt: (base, i) => P.NativeArrayHelpers.prototype.getContactPairAt.call({ ptr: 0 }, base, i) };
  ptBuf = P._malloc(PT_SIZE * PT_MAX);
  const PF = P.PxPairFlagEnum, CF = P.PxContactPairFlagEnum;
  simCb.onContact = (hdrPtr, pairsPtr, n) => {
    const base = P.wrapPointer(pairsPtr, P.PxContactPair);
    for (let i = 0; i < n; i++) {
      const pr = helpers.pairAt(base, i);
      const fl = pr.get_flags();
      if (fl.isSet(CF.eREMOVED_SHAPE_0) || fl.isSet(CF.eREMOVED_SHAPE_1)) continue;
      const a = byShape.get(P.getPointer(pr.get_shapes(0))), b = byShape.get(P.getPointer(pr.get_shapes(1)));
      if (!a || !b) continue;
      const ev = pr.get_events();
      const kind = ev.isSet(PF.eNOTIFY_TOUCH_FOUND) ? 0 : ev.isSet(PF.eNOTIFY_TOUCH_LOST) ? 2 : 1;
      const rec = { a, b, kind, pts: null };
      if (kind !== 2 && pr.get_contactCount() > 0) {
        const n2 = pr.extractContacts(P.wrapPointer(ptBuf, P.PxContactPairPoint), PT_MAX);
        const pts = [];
        for (let k = 0; k < n2; k++) {
          const cp = P.wrapPointer(ptBuf + k * PT_SIZE, P.PxContactPairPoint);
          const pos = cp.get_position(), nrm = cp.get_normal(), imp = cp.get_impulse();
          // PhysX's normal points from shape 1 to shape 0; Anvil reports it from a toward b
          pts.push([pos.get_x(), pos.get_y(), pos.get_z(), cp.get_separation(), -nrm.get_x(), -nrm.get_y(), -nrm.get_z(), Math.hypot(imp.get_x(), imp.get_y(), imp.get_z())]);
        }
        rec.pts = pts;
      }
      events.push(rec);
    }
  };
  simCb.onConstraintBreak = (infoPtr, count) => {
    for (let k = 0; k < count; k++) {
      const info = P.wrapPointer(infoPtr + k * 12, P.PxConstraintInfo);
      const ref = P.getPointer(info.get_externalReference());
      for (const [id, j] of joints) if (j.ptr === ref) { broken.push(id); break; }
    }
  };
  simCb.onTrigger = () => { }; simCb.onWake = () => { }; simCb.onSleep = () => { };
  return simCb;
}

function material(friction, restitution, fc, rc) {
  const k = friction + '|' + restitution + '|' + fc + '|' + rc;
  let m = materials.get(k);
  if (!m) {
    m = physics.createMaterial(friction, friction, restitution);
    const C = P.PxCombineModeEnum;
    const map = (u) => (u === 1 ? C.eMULTIPLY : u === 2 ? C.eMIN : u === 3 ? C.eMAX : C.eAVERAGE);
    m.setFrictionCombineMode(map(fc)); m.setRestitutionCombineMode(map(rc));
    materials.set(k, m);
  }
  return m;
}

function finishCollider(b, bodyId, geom, center, extraRot, local, trigger, friction, restitution, fc, rc, layer, iid) {
  const flags = new P.PxShapeFlags(P.PxShapeFlagEnum.eSCENE_QUERY_SHAPE | P.PxShapeFlagEnum.eSIMULATION_SHAPE);
  const shape = physics.createShape(geom, material(friction, restitution, fc, rc), true, flags);
  P.destroy(flags);
  shape.setContactOffset(0.01); shape.setRestOffset(0);
  const lq = [local[3], local[4], local[5], local[6]];
  const c = qrot(lq, center);
  const rq = extraRot ? qmul(lq, extraRot) : lq;
  shape.setLocalPose(trv(local[0] + c[0], local[1] + c[1], local[2] + c[2], rq[0], rq[1], rq[2], rq[3]));
  const id = nextId++;
  const rec = { shape, geom, body: bodyId, layer: layer & 31, trigger: !!trigger, iid, center, extraRot };
  colliders.set(id, rec);
  byShape.set(P.getPointer(shape), id);
  setFilter(rec);
  b.actor.attachShape(shape);
  b.colliders.add(id);
  return id;
}

// a convex hull (or triangle mesh) of local-space vertices (data passed through PhysX-owned arrays)
function cookMesh(verts, tris, convex) {
  const nV = verts.length / 3;
  const pts = new P.PxArray_PxVec3(nV);
  for (let i = 0; i < nV; i++) pts.set(i, vec(verts[i * 3], verts[i * 3 + 1], verts[i * 3 + 2]));
  let idx = null;
  try {
    if (convex) {
      const d = new P.PxConvexMeshDesc();
      d.get_points().set_count(nV); d.get_points().set_stride(12); d.get_points().set_data(pts.begin());
      d.set_flags(new P.PxConvexFlags(P.PxConvexFlagEnum.eCOMPUTE_CONVEX));
      const mesh = P.CreateConvexMesh(cooking, d);
      P.destroy(d);
      return mesh ? new P.PxConvexMeshGeometry(mesh) : null;
    }
    const nT = tris.length / 3;
    idx = new P.PxArray_PxU32(tris.length);
    for (let i = 0; i < tris.length; i++) idx.set(i, tris[i]);
    const d = new P.PxTriangleMeshDesc();
    d.get_points().set_count(nV); d.get_points().set_stride(12); d.get_points().set_data(pts.begin());
    d.get_triangles().set_count(nT); d.get_triangles().set_stride(12); d.get_triangles().set_data(idx.begin());
    const mesh = P.CreateTriangleMesh(cooking, d);
    P.destroy(d);
    return mesh ? new P.PxTriangleMeshGeometry(mesh) : null;
  } finally { P.destroy(pts); if (idx) P.destroy(idx); }
}
const cylCache = new Map();
function cylinderGeom(r, halfH) {
  const k = r + '|' + halfH; if (cylCache.has(k)) return cylCache.get(k);
  const v = []; for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; v.push(Math.cos(a) * r, -halfH, Math.sin(a) * r, Math.cos(a) * r, halfH, Math.sin(a) * r); }
  const g = cookMesh(v, null, true); cylCache.set(k, g); return g;
}

// ---------------- mass properties (like PxRigidBodyExt, but triggers don't count, as in Unity) ----------------
function massProps(b) {
  let mass = 0; const com = [0, 0, 0];
  const parts = [];
  for (const cid of b.colliders) {
    const c = colliders.get(cid); if (!c || c.trigger) continue;
    const mp = new P.PxMassProperties(c.geom);
    const m = mp.get_mass();
    const lp = c.shape.getLocalPose(); const p = rd(lp.get_p()); const q = lp.get_q(); const qq = [q.get_x(), q.get_y(), q.get_z(), q.get_w()];
    const cl = qrot(qq, rd(mp.get_centerOfMass())); const cw = [p[0] + cl[0], p[1] + cl[1], p[2] + cl[2]];
    const I = mp.get_inertiaTensor(); const cols = [rd(I.get_column0()), rd(I.get_column1()), rd(I.get_column2())];
    P.destroy(mp);
    parts.push({ m, c: cw, q: qq, I: cols });
    mass += m; com[0] += cw[0] * m; com[1] += cw[1] * m; com[2] += cw[2] * m;
  }
  if (mass <= 1e-12) return null;
  com[0] /= mass; com[1] /= mass; com[2] /= mass;
  // inertia about the centre of mass (body axes), from each part rotated and shifted (parallel axis)
  const T = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const pt of parts) {
    const R = [qrot(pt.q, [1, 0, 0]), qrot(pt.q, [0, 1, 0]), qrot(pt.q, [0, 0, 1])]; // columns
    // I' = R I R^T (I given as columns)
    const Ii = (r, c) => pt.I[c][r];
    const Rm = (r, c) => R[c][r];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      let s = 0; for (let a = 0; a < 3; a++) for (let d = 0; d < 3; d++) s += Rm(r, a) * Ii(a, d) * Rm(c, d);
      T[r][c] += s;
    }
    const d = [pt.c[0] - com[0], pt.c[1] - com[1], pt.c[2] - com[2]], dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) T[r][c] += pt.m * ((r === c ? dd : 0) - d[r] * d[c]);
  }
  return { mass, com, T };
}
// eigen decomposition of a symmetric 3x3 (Jacobi) -> principal moments and the rotation to them
function principal(A) {
  const a = A.map(r => r.slice()); let Vm = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let it = 0; it < 24; it++) {
    let p = 0, q = 1, mx = Math.abs(a[0][1]);
    if (Math.abs(a[0][2]) > mx) { p = 0; q = 2; mx = Math.abs(a[0][2]); }
    if (Math.abs(a[1][2]) > mx) { p = 1; q = 2; mx = Math.abs(a[1][2]); }
    if (mx < 1e-12) break;
    const th = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]), c = Math.cos(th), s = Math.sin(th);
    for (let k = 0; k < 3; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
    for (let k = 0; k < 3; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
    for (let k = 0; k < 3; k++) { const vkp = Vm[k][p], vkq = Vm[k][q]; Vm[k][p] = c * vkp - s * vkq; Vm[k][q] = s * vkp + c * vkq; }
  }
  // right-handed rotation matrix -> quaternion
  let det = Vm[0][0] * (Vm[1][1] * Vm[2][2] - Vm[1][2] * Vm[2][1]) - Vm[0][1] * (Vm[1][0] * Vm[2][2] - Vm[1][2] * Vm[2][0]) + Vm[0][2] * (Vm[1][0] * Vm[2][1] - Vm[1][1] * Vm[2][0]);
  if (det < 0) for (let k = 0; k < 3; k++) Vm[k][2] = -Vm[k][2];
  const m = Vm, tr = m[0][0] + m[1][1] + m[2][2];
  let q;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; q = [(m[2][1] - m[1][2]) / s, (m[0][2] - m[2][0]) / s, (m[1][0] - m[0][1]) / s, 0.25 * s]; }
  else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) { const s = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2; q = [0.25 * s, (m[0][1] + m[1][0]) / s, (m[0][2] + m[2][0]) / s, (m[2][1] - m[1][2]) / s]; }
  else if (m[1][1] > m[2][2]) { const s = Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2; q = [(m[0][1] + m[1][0]) / s, 0.25 * s, (m[1][2] + m[2][1]) / s, (m[0][2] - m[2][0]) / s]; }
  else { const s = Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2; q = [(m[0][2] + m[2][0]) / s, (m[1][2] + m[2][1]) / s, 0.25 * s, (m[1][0] - m[0][1]) / s]; }
  const l = Math.hypot(...q) || 1;
  return { I: [Math.max(a[0][0], 1e-9), Math.max(a[1][1], 1e-9), Math.max(a[2][2], 1e-9)], q: q.map(x => x / l) };
}

// ---------------- joints ----------------
const DEG = Math.PI / 180;
function d6(j) { return j.d6; }
function setDrive(J, axis, stiffness, damping, maxForce) {
  const d = new P.PxD6JointDrive(stiffness, damping, maxForce > 0 ? maxForce : 3.4e38, false);
  J.setDrive(axis, d); P.destroy(d);
}
function angularLimitPair(lo, hi) { return new P.PxJointAngularLimitPair(Math.min(lo, hi), Math.max(lo, hi)); }

export const physxImports = {
  reset(gx, gy, gz) {
    if (scene) { try { scene.release(); } catch (e) { } }
    bodies.clear(); colliders.clear(); byShape.clear(); joints.clear(); touching.clear(); ignorePairs.clear(); events = [];
    layerMasks = new Uint32Array(32).fill(0xffffffff);
    nextId = 1; worldStatic = null;
    const sd = new P.PxSceneDesc(tol);
    sd.set_gravity(vec(gx, gy, gz));
    sd.set_cpuDispatcher(P.DefaultCpuDispatcherCreate(0));
    if (!shaderWrap) makeFilterShader();
    P.setupPassThroughFilterShader(sd, shaderWrap);
    sd.set_staticKineFilteringMode(P.PxPairFilteringModeEnum.eKEEP);
    sd.set_kineKineFilteringMode(P.PxPairFilteringModeEnum.eKEEP);
    sd.set_solverType(P.PxSolverTypeEnum.ePGS);
    sd.set_bounceThresholdVelocity(2);
    const SF = P.PxSceneFlagEnum;
    sd.set_flags(new P.PxSceneFlags(SF.eENABLE_CCD | SF.eENABLE_PCM));
    scene = physics.createScene(sd);
    scene.setSimulationEventCallback(simCb || makeCallback());
    P.destroy(sd);
  },
  setGravity(gx, gy, gz) { if (scene) scene.setGravity(vec(gx, gy, gz)); },
  createBody(type, pose) {
    const t = tr(pose, 0);
    let actor;
    if (type === 0) actor = physics.createRigidStatic(t);
    else {
      actor = physics.createRigidDynamic(t);
      actor.setSolverIterationCounts(6, 1);
      actor.setSleepThreshold(0.005);
      actor.setMaxDepenetrationVelocity(10);
      actor.setAngularDamping(0.05); actor.setLinearDamping(0);
      actor.setMaxAngularVelocity(50);
      if (type === 2) actor.setRigidBodyFlag(P.PxRigidBodyFlagEnum.eKINEMATIC, true);
    }
    scene.addActor(actor);
    const id = nextId++;
    bodies.set(id, { actor, type, colliders: new Set(), maxAng: 50, maxLin: 1e16, detect: true, inScene: true });
    return id;
  },
  removeBody(id) {
    const b = bodies.get(id); if (!b) return;
    for (const cid of b.colliders) { const c = colliders.get(cid); if (c) { byShape.delete(P.getPointer(c.shape)); colliders.delete(cid); dropTouching(cid); } }
    for (const [jid, j] of joints) if (j.b1 === id || j.b2 === id) { try { j.joint.release(); } catch (e) { } joints.delete(jid); }
    try { scene.removeActor(b.actor); b.actor.release(); } catch (e) { }
    bodies.delete(id);
  },
  setBodyType(id, type) {
    const b = bodies.get(id); if (!b || b.type === type || b.type === 0 || type === 0) return;
    b.type = type;
    b.actor.setRigidBodyFlag(P.PxRigidBodyFlagEnum.eKINEMATIC, type === 2);
    for (const cid of b.colliders) { const c = colliders.get(cid); if (c) setFilter(c); }
    refilter(id);
  },
  setBodyProps(id, p) {
    const b = bodies.get(id); if (!b || b.type === 0) return;
    const a = b.actor;
    a.setLinearDamping(p[0]); a.setAngularDamping(p[1]);
    a.setActorFlag(P.PxActorFlagEnum.eDISABLE_GRAVITY, !(p[2] > 0));
    const m = p[3] | 0, L = P.PxRigidDynamicLockFlagEnum;
    const lock = (m & 2 ? L.eLOCK_LINEAR_X : 0) | (m & 4 ? L.eLOCK_LINEAR_Y : 0) | (m & 8 ? L.eLOCK_LINEAR_Z : 0) | (m & 16 ? L.eLOCK_ANGULAR_X : 0) | (m & 32 ? L.eLOCK_ANGULAR_Y : 0) | (m & 64 ? L.eLOCK_ANGULAR_Z : 0);
    const lf = new P.PxRigidDynamicLockFlags(lock); a.setRigidDynamicLockFlags(lf); P.destroy(lf);
    if (b.type === 1) a.setRigidBodyFlag(P.PxRigidBodyFlagEnum.eENABLE_CCD, !!p[4]);
    b.maxAng = p[5]; b.maxLin = p[6];
    a.setMaxAngularVelocity(Math.max(0, p[5])); a.setMaxLinearVelocity(p[6] > 0 ? Math.min(p[6], 1e16) : 1e16);
    if (p.length > 8) { a.setSolverIterationCounts(Math.max(1, p[8] | 0), Math.max(0, p[9] | 0)); a.setSleepThreshold(p[10]); a.setMaxDepenetrationVelocity(p[11] > 0 ? p[11] : 1e16); }
    const detect = !!p[7];
    if (detect !== b.detect) { b.detect = detect; for (const cid of b.colliders) { const c = colliders.get(cid); if (c) setFilter(c); } refilter(id); }
  },
  // Rigidbody.solverIterations, solverVelocityIterations, sleepThreshold, maxDepenetrationVelocity
  setBodySolver(id, it, vit, sleep, depen) {
    const b = bodies.get(id); if (!b || b.type === 0) return;
    b.actor.setSolverIterationCounts(Math.max(1, it | 0), Math.max(0, vit | 0));
    b.actor.setSleepThreshold(Math.max(0, sleep));
    b.actor.setMaxDepenetrationVelocity(depen > 0 ? depen : 1e16);
  },
  createCollider(bodyId, kind, sp, local, trigger, friction, restitution, fc, rc, layer, iid) {
    const b = bodies.get(bodyId); if (!b) return -1;
    let geom, extraRot = null;
    const center = [sp[3], sp[4], sp[5]];
    switch (kind) {
      case 1: geom = new P.PxBoxGeometry(Math.max(sp[0], 1e-4), Math.max(sp[1], 1e-4), Math.max(sp[2], 1e-4)); break;
      case 2: geom = new P.PxSphereGeometry(Math.max(sp[0], 1e-4)); break;
      case 3: {
        const dir = sp[2] | 0;
        if (sp[1] > 1e-5) { geom = new P.PxCapsuleGeometry(Math.max(sp[0], 1e-4), sp[1]); extraRot = dir === 0 ? null : dir === 2 ? X_TO_Z : X_TO_Y; }
        else geom = new P.PxSphereGeometry(Math.max(sp[0], 1e-4));
        break;
      }
      case 4: {
        const code = sp[0] | 0, sx = Math.abs(sp[3]), sy = Math.abs(sp[4]), sz = Math.abs(sp[5]);
        center[0] = 0; center[1] = 0; center[2] = 0;
        if (code === 1) geom = new P.PxBoxGeometry(0.5 * sx, 0.5 * sy, 0.5 * sz);
        else if (code === 2) geom = new P.PxSphereGeometry(0.5 * Math.max(sx, sy, sz));
        else if (code === 3) { const r = 0.5 * Math.max(sx, sz); geom = new P.PxCapsuleGeometry(r, Math.max(1e-4, sy - r)); extraRot = X_TO_Y; }
        else if (code === 4) geom = cylinderGeom(0.5 * Math.max(sx, sz), sy) || new P.PxBoxGeometry(0.5 * sx, sy, 0.5 * sz);
        else if (code === 5) { geom = new P.PxBoxGeometry(5 * sx, 0.05, 5 * sz); center[1] = -0.05; }
        else if (code === 6) geom = new P.PxBoxGeometry(0.5 * sx, 0.5 * sy, 0.005);
        else geom = new P.PxBoxGeometry(0.5 * sx, 0.5 * sy, 0.5 * sz);
        break;
      }
      default: geom = new P.PxBoxGeometry(0.5, 0.5, 0.5);
    }
    return finishCollider(b, bodyId, geom, center, extraRot, local, trigger, friction, restitution, fc, rc, layer, iid);
  },
  createMeshCollider(bodyId, verts, tris, convex, local, trigger, friction, restitution, fc, rc, layer, iid) {
    const b = bodies.get(bodyId); if (!b) return -1;
    const v = Float32Array.from(verts.slice ? verts.slice() : verts), t = Uint32Array.from(tris.slice ? tris.slice() : tris);
    // like Unity: a body that moves can't have a concave mesh, so it gets the convex hull
    let geom = (convex || b.type !== 0) ? cookMesh(v, null, true) : (t.length >= 3 ? cookMesh(v, t, false) : null);
    if (!geom) geom = new P.PxBoxGeometry(0.05, 0.05, 0.05);
    return finishCollider(b, bodyId, geom, [0, 0, 0], null, local, trigger, friction, restitution, fc, rc, layer, iid);
  },
  removeCollider(id) {
    const c = colliders.get(id); if (!c) return;
    const b = bodies.get(c.body);
    if (b) { b.colliders.delete(id); try { b.actor.detachShape(c.shape); } catch (e) { } }
    byShape.delete(P.getPointer(c.shape));
    try { c.shape.release(); } catch (e) { }
    colliders.delete(id);
    dropTouching(id);
  },
  setColliderLayer(id, layer) { const c = colliders.get(id); if (c) { c.layer = layer & 31; setFilter(c); refilter(c.body); } },
  setMassProps(id, p) {
    // p: mass, hasCom, com(3), hasI, inertia(3), rot(4) -> [mass, com(3), inertia(3), frame(4)]
    const b = bodies.get(id); if (!b || b.type === 0) return [p[0], 0, 0, 0, 1, 1, 1, 0, 0, 0, 1];
    const mass = Math.max(p[0], 1e-7);
    const mp = massProps(b);
    let com = [0, 0, 0], I = [mass / 6, mass / 6, mass / 6], fq = [0, 0, 0, 1];
    if (mp) {
      const k = mass / mp.mass;
      const pr = principal(mp.T.map(r => r.map(x => x * k)));
      com = mp.com; I = pr.I; fq = pr.q;
    }
    if (p[1]) com = [p[2], p[3], p[4]];
    if (p[5]) { I = [p[6], p[7], p[8]]; fq = [p[9], p[10], p[11], p[12]]; }
    const a = b.actor;
    a.setMass(mass);
    a.setCMassLocalPose(trv(com[0], com[1], com[2], fq[0], fq[1], fq[2], fq[3]));
    a.setMassSpaceInertiaTensor(vec(Math.max(I[0], 1e-9), Math.max(I[1], 1e-9), Math.max(I[2], 1e-9)));
    return [mass, com[0], com[1], com[2], I[0], I[1], I[2], fq[0], fq[1], fq[2], fq[3]];
  },
  createJoint(kind, b1, b2, a, collide, extra) {
    // a: anchor1(3) frame1(4) anchor2(3) frame2(4); actor0 = connected body (or the world), actor1 = this body
    const B1 = bodies.get(b1), B2 = bodies.get(b2);
    if (!B1 || !B2) return -1;
    const f0 = new P.PxTransform(new P.PxVec3(a[0], a[1], a[2]), new P.PxQuat(a[3], a[4], a[5], a[6]));
    const f1 = new P.PxTransform(new P.PxVec3(a[7], a[8], a[9]), new P.PxQuat(a[10], a[11], a[12], a[13]));
    let J, isD6 = true;
    const A = P.PxD6AxisEnum, M = P.PxD6MotionEnum;
    if (kind === 3) {
      // SpringJoint: a distance joint with a spring outside [min, max]
      isD6 = false;
      J = P.DistanceJointCreate(physics, B1.actor, f0, B2.actor, f1);
      const lo = Math.max(0, Math.min(extra[3], extra[4])), hi = Math.max(lo, extra[3], extra[4]);
      J.setMinDistance(lo); J.setMaxDistance(hi); J.setTolerance(0.025);
      J.setStiffness(Math.max(0, extra[1])); J.setDamping(Math.max(0, extra[2]));
      const F = P.PxDistanceJointFlagEnum;
      J.setDistanceJointFlags(new P.PxDistanceJointFlags(F.eMAX_DISTANCE_ENABLED | F.eMIN_DISTANCE_ENABLED | F.eSPRING_ENABLED));
    } else {
      J = P.D6JointCreate(physics, B1.actor, f0, B2.actor, f1);
      for (const ax of [A.eX, A.eY, A.eZ, A.eTWIST, A.eSWING1, A.eSWING2]) J.setMotion(ax, M.eLOCKED);
      if (kind === 1) J.setMotion(A.eTWIST, M.eFREE);                       // HingeJoint (limits/motor/spring come as commands)
      else if (kind === 4) {                                                 // CharacterJoint
        J.setMotion(A.eTWIST, M.eLIMITED); J.setMotion(A.eSWING1, M.eLIMITED); J.setMotion(A.eSWING2, M.eLIMITED);
        const tl = angularLimitPair(extra[0] * DEG, extra[1] * DEG); J.setTwistLimit(tl); P.destroy(tl);
        const sl = new P.PxJointLimitCone(Math.max(extra[2], 0.1) * DEG, Math.max(extra[3], 0.1) * DEG); J.setSwingLimit(sl); P.destroy(sl);
      } else if (kind === 5) {                                               // ConfigurableJoint
        const mot = (v) => (v === 0 ? M.eLOCKED : v === 1 ? M.eLIMITED : M.eFREE);
        J.setMotion(A.eX, mot(extra[0])); J.setMotion(A.eY, mot(extra[1])); J.setMotion(A.eZ, mot(extra[2]));
        J.setMotion(A.eTWIST, mot(extra[3])); J.setMotion(A.eSWING1, mot(extra[4])); J.setMotion(A.eSWING2, mot(extra[5]));
        if (extra[0] === 1 || extra[1] === 1 || extra[2] === 1) { const ll = new P.PxJointLinearLimit(Math.max(extra[6], 0), new P.PxSpring(0, 0)); J.setDistanceLimit(ll); P.destroy(ll); }
        if (extra[3] === 1) { const tl = angularLimitPair(extra[7] * DEG, extra[8] * DEG); J.setTwistLimit(tl); P.destroy(tl); }
        if (extra[4] === 1 || extra[5] === 1) { const sl = new P.PxJointLimitCone(Math.max(extra[9], 0.1) * DEG, Math.max(extra[10], 0.1) * DEG); J.setSwingLimit(sl); P.destroy(sl); }
      }
      // kind 2 FixedJoint: everything locked
      J.setAngularDriveConfig(P.PxD6AngularDriveConfigEnum.eSWING_TWIST);
    }
    J.setConstraintFlag(P.PxConstraintFlagEnum.eCOLLISION_ENABLED, !!collide);
    if (extra[11] > 0 || extra[12] > 0) J.setBreakForce(extra[11] > 0 ? extra[11] : 3.4e38, extra[12] > 0 ? extra[12] : 3.4e38);
    P.destroy(f0); P.destroy(f1);
    const id = nextId++;
    joints.set(id, { joint: J, kind, b1, b2, d6: isD6 ? J : null, ptr: P.getPointer(J), breakable: extra[11] > 0 || extra[12] > 0 });
    return id;
  },
  removeJoint(id) {
    const j = joints.get(id); if (!j) return;
    try { j.joint.release(); } catch (e) { }
    joints.delete(id);
  },
  setLayerMatrix(m) {
    for (let i = 0; i < 32; i++) layerMasks[i] = (m[i] >>> 0);
    for (const id of bodies.keys()) refilter(id);
  },
  setIgnorePair(c1, c2, ignore) {
    const a = colliders.get(c1), b = colliders.get(c2); if (!a || !b) return;
    const k = key(a.iid | 0, b.iid | 0);
    if (ignore) ignorePairs.add(k); else ignorePairs.delete(k);
    refilter(a.body); refilter(b.body);
  },
  applyCommands(cmd, count) { apply(cmd, count); },
  step(cmd, count, dt) {
    apply(cmd, count);
    events = []; broken = [];
    scene.simulate(Math.max(1e-5, dt));
    scene.fetchResults(true);
    return collect();
  },
  // ---------------- queries ----------------
  raycast(o, d, maxDist, layerMask, hitTriggers) {
    const hits = rayHits(o, d, maxDist, layerMask, hitTriggers);
    if (!hits.length) return [0];
    const h = hits[0];
    return [1, h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7]];
  },
  raycastAll(o, d, maxDist, layerMask, hitTriggers) {
    const out = [];
    for (const h of rayHits(o, d, maxDist, layerMask, hitTriggers)) out.push(...h);
    return out;
  },
  shapeCast(kind, dims, pose, dir, maxDist, layerMask, hitTriggers, exclude) {
    for (const h of sweepHits(kind, dims, pose, dir, maxDist, layerMask, hitTriggers)) {
      if (h.initial || h.id === exclude) continue;
      return [1, h.id, h.p[0], h.p[1], h.p[2], h.n[0], h.n[1], h.n[2], h.dist];
    }
    return [0];
  },
  shapeCastAll(kind, dims, pose, dir, maxDist, layerMask, hitTriggers) {
    const out = [];
    for (const h of sweepHits(kind, dims, pose, dir, maxDist, layerMask, hitTriggers)) {
      // like Unity: colliders already touching at the start get distance 0, point zero, normal against the sweep
      if (h.initial) out.push(h.id, 0, 0, 0, -dir[0], -dir[1], -dir[2], 0);
      else out.push(h.id, h.p[0], h.p[1], h.p[2], h.n[0], h.n[1], h.n[2], h.dist);
    }
    return out;
  },
  overlap(kind, dims, pose, layerMask, hitTriggers) {
    const g = queryGeom(kind, dims), t = queryPose(kind, pose);
    const out = [];
    const mask = layerMask | 0;
    for (const [id, c] of colliders) {
      if (((mask >>> c.layer) & 1) === 0 || (!hitTriggers && c.trigger)) continue;
      const b = bodies.get(c.body); if (!b) continue;
      const sp = stat('PxShapeExt', 'getGlobalPose')(c.shape, b.actor);
      if (stat('PxGeometryQuery', 'overlap')(g, t, c.geom, sp)) out.push(id);
    }
    P.destroy(g);
    return out;
  },
  closestPoint(id, x, y, z) {
    const c = colliders.get(id); if (!c) return [x, y, z];
    const b = bodies.get(c.body);
    const sp = stat('PxShapeExt', 'getGlobalPose')(c.shape, b.actor);
    const out = V2;
    const dist = stat('PxGeometryQuery', 'pointDistance')(vec(x, y, z), c.geom, sp, out);
    return dist > 0 ? rd(out) : [x, y, z];
  },
};

function finite(v) { return Number.isFinite(v) ? Math.min(v, 1e9) : 1e9; }
function queryGeom(kind, d) {
  if (kind === 1) return new P.PxBoxGeometry(Math.max(d[0], 1e-4), Math.max(d[1], 1e-4), Math.max(d[2], 1e-4));
  if (kind === 3 && d[1] > 1e-5) return new P.PxCapsuleGeometry(Math.max(d[0], 1e-4), d[1]);
  return new P.PxSphereGeometry(Math.max(d[0], 1e-4));
}
// query capsules are along Y in Anvil's C# (like Rapier); PhysX's are along X
function queryPose(kind, pose, out = T2) {
  if (kind !== 3) return tr(pose, 0, out);
  const q = qmul([pose[3], pose[4], pose[5], pose[6]], X_TO_Y);
  return trv(pose[0], pose[1], pose[2], q[0], q[1], q[2], q[3], out);
}
function rayHits(o, d, maxDist, layerMask, hitTriggers) {
  const res = new P.PxRaycastResult();
  const mask = layerMask >>> 0;
  const fd = new P.PxFilterData(mask, hitTriggers ? mask : 0, 0, 0);
  const QF = P.PxQueryFlagEnum;
  const qf = new P.PxQueryFlags(QF.eSTATIC | QF.eDYNAMIC | QF.eNO_BLOCK);
  const qfd = new P.PxQueryFilterData(fd, qf);
  const hf = new P.PxHitFlags(P.PxHitFlagEnum.ePOSITION | P.PxHitFlagEnum.eNORMAL);
  const len = Math.hypot(d[0], d[1], d[2]) || 1;
  scene.raycast(vec(o[0], o[1], o[2]), vec(d[0] / len, d[1] / len, d[2] / len, V2), finite(maxDist), res, hf, qfd);
  const hits = [];
  const n = res.getNbTouches();
  for (let i = 0; i < n; i++) {
    const h = res.getTouch(i);
    const id = byShape.get(P.getPointer(h.get_shape()));
    if (!id) continue;
    const dist = h.get_distance();
    if (dist <= 0 && h.hadInitialOverlap()) continue; // Unity: rays don't hit colliders they start inside
    const p = rd(h.get_position()), nn = rd(h.get_normal());
    hits.push([id, p[0], p[1], p[2], nn[0], nn[1], nn[2], dist]);
  }
  P.destroy(res); P.destroy(fd); P.destroy(qf); P.destroy(qfd); P.destroy(hf);
  hits.sort((a, b) => a[7] - b[7]);
  return hits;
}
function sweepHits(kind, dims, pose, dir, maxDist, layerMask, hitTriggers) {
  const g = queryGeom(kind, dims), t = queryPose(kind, pose);
  const res = new P.PxSweepBuffer10();
  const mask = layerMask >>> 0;
  const fd = new P.PxFilterData(mask, hitTriggers ? mask : 0, 0, 0);
  const QF = P.PxQueryFlagEnum;
  const qf = new P.PxQueryFlags(QF.eSTATIC | QF.eDYNAMIC | QF.eNO_BLOCK);
  const qfd = new P.PxQueryFilterData(fd, qf);
  const hf = new P.PxHitFlags(P.PxHitFlagEnum.ePOSITION | P.PxHitFlagEnum.eNORMAL);
  const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  scene.sweep(g, t, vec(dir[0] / len, dir[1] / len, dir[2] / len), finite(maxDist), res, hf, qfd);
  const hits = [];
  const n = res.getNbTouches();
  for (let i = 0; i < n; i++) {
    const h = res.getTouch(i);
    const id = byShape.get(P.getPointer(h.get_shape()));
    if (!id) continue;
    const dist = h.get_distance();
    hits.push({ id, p: rd(h.get_position()), n: rd(h.get_normal()), dist, initial: dist <= 0 && h.hadInitialOverlap() });
  }
  P.destroy(res); P.destroy(fd); P.destroy(qf); P.destroy(qfd); P.destroy(hf); P.destroy(g);
  hits.sort((a, b) => a.dist - b.dist);
  return hits;
}

function dropTouching(cid) { for (const [k, t] of touching) if (t.a === cid || t.b === cid) touching.delete(k); }

function apply(cmd, count) {
  let i = 0;
  const F = P.PxForceModeEnum;
  while (i < count) {
    const op = cmd[i] | 0, id = cmd[i + 1] | 0;
    const b = bodies.get(id);
    const dyn = b && b.type === 1;
    switch (op) {
      case 1: // set pose (teleport)
        if (b) {
          const t = trv(cmd[i + 2], cmd[i + 3], cmd[i + 4], cmd[i + 5], cmd[i + 6], cmd[i + 7], cmd[i + 8]);
          b.actor.setGlobalPose(t, true);
          if (b.type === 2) b.actor.setKinematicTarget(t);
        }
        i += 9; break;
      case 2: if (dyn) b.actor.setLinearVelocity(vec(cmd[i + 2], cmd[i + 3], cmd[i + 4]), true); i += 5; break;
      case 3: if (dyn) b.actor.setAngularVelocity(vec(cmd[i + 2], cmd[i + 3], cmd[i + 4]), true); i += 5; break;
      case 4: if (dyn) b.actor.addForce(vec(cmd[i + 2], cmd[i + 3], cmd[i + 4]), F.eIMPULSE, true); i += 5; break;
      case 5: if (dyn) b.actor.addTorque(vec(cmd[i + 2], cmd[i + 3], cmd[i + 4]), F.eIMPULSE, true); i += 5; break;
      case 6: if (dyn) b.actor.addTorque(vec(cmd[i + 2], cmd[i + 3], cmd[i + 4]), F.eVELOCITY_CHANGE, true); i += 5; break;
      case 7: if (b && b.type !== 0 && b.type !== 2) b.actor.wakeUp(); i += 2; break;
      case 8: if (dyn) b.actor.putToSleep(); i += 2; break;
      case 9: if (b && b.type === 2) b.actor.setKinematicTarget(trv(cmd[i + 2], cmd[i + 3], cmd[i + 4], cmd[i + 5], cmd[i + 6], cmd[i + 7], cmd[i + 8])); i += 9; break;
      case 10: { // collider local pose relative to its body
        const c = colliders.get(id);
        if (c) {
          const lq = [cmd[i + 5], cmd[i + 6], cmd[i + 7], cmd[i + 8]];
          const cc = qrot(lq, c.center); const rq = c.extraRot ? qmul(lq, c.extraRot) : lq;
          c.shape.setLocalPose(trv(cmd[i + 2] + cc[0], cmd[i + 3] + cc[1], cmd[i + 4] + cc[2], rq[0], rq[1], rq[2], rq[3]));
        }
        i += 9; break;
      }
      case 11: { // hinge: mode (0 none, 1 motor, 2 spring), targetVel, targetPos, stiffness, damping, maxForce, useLimits, min, max
        const j = joints.get(id), J = j && d6(j);
        if (J) {
          const A = P.PxD6AxisEnum, M = P.PxD6MotionEnum, D = P.PxD6DriveEnum, mode = cmd[i + 2] | 0;
          if (mode === 1) { setDrive(J, D.eTWIST, 0, 1e7, cmd[i + 7]); J.setDriveVelocity(vec(0, 0, 0, V2), vec(-cmd[i + 3], 0, 0)); }
          else if (mode === 2) {
            setDrive(J, D.eTWIST, cmd[i + 5], cmd[i + 6], cmd[i + 7]);
            const h = cmd[i + 4] / 2; J.setDrivePosition(trv(0, 0, 0, Math.sin(h), 0, 0, Math.cos(h)), true);
            J.setDriveVelocity(vec(0, 0, 0, V2), vec(0, 0, 0));
          } else { setDrive(J, D.eTWIST, 0, 0, 0); J.setDriveVelocity(vec(0, 0, 0, V2), vec(0, 0, 0)); }
          if (cmd[i + 8]) { J.setMotion(A.eTWIST, M.eLIMITED); const l = angularLimitPair(cmd[i + 9], cmd[i + 10]); J.setTwistLimit(l); P.destroy(l); }
          else J.setMotion(A.eTWIST, M.eFREE);
          const B = bodies.get(j.b2); if (B && B.type === 1) B.actor.wakeUp();
        }
        i += 11; break;
      }
      case 12: { // configurable joint drives: 6 axes x (on, targetPos, targetVel, stiffness, damping, maxForce)
        const j = joints.get(id), J = j && d6(j);
        if (J) {
          const D = P.PxD6DriveEnum;
          const ax = [D.eX, D.eY, D.eZ, D.eTWIST, D.eSWING1, D.eSWING2];
          const tp = [], tv = [];
          for (let a = 0; a < 6; a++) {
            const o = i + 2 + a * 6;
            if (cmd[o]) setDrive(J, ax[a], cmd[o + 3], cmd[o + 4], cmd[o + 5]); else setDrive(J, ax[a], 0, 0, 0);
            tp.push(cmd[o + 1]); tv.push(cmd[o + 2]);
          }
          const q = eulerQ(tp[3], tp[4], tp[5]);
          J.setDrivePosition(trv(tp[0], tp[1], tp[2], q[0], q[1], q[2], q[3]), true);
          J.setDriveVelocity(vec(-tv[0], -tv[1], -tv[2], V2), vec(-tv[3], -tv[4], -tv[5]));
          const B = bodies.get(j.b2); if (B && B.type === 1) B.actor.wakeUp();
        }
        i += 38; break;
      }
      default: i = count; break;
    }
  }
}

function collect() {
  const out = [];
  let n = 0;
  const nIdx = out.length; out.push(0);
  for (const [id, b] of bodies) {
    if (b.type === 0) continue;
    const a = b.actor;
    const pose = a.getGlobalPose();
    const p = rd(pose.get_p()), qq = pose.get_q(), q = [qq.get_x(), qq.get_y(), qq.get_z(), qq.get_w()];
    const v = rd(a.getLinearVelocity()), w = rd(a.getAngularVelocity());
    const cl = rd(a.getCMassLocalPose().get_p()); const cw = qrot(q, cl);
    out.push(id, p[0], p[1], p[2], q[0], q[1], q[2], q[3], v[0], v[1], v[2], w[0], w[1], w[2], p[0] + cw[0], p[1] + cw[1], p[2] + cw[2], b.type === 1 && a.isSleeping() ? 1 : 0);
    n++;
  }
  out[nIdx] = n;
  // contact events -> enter / stay / exit
  const contacts = [], triggers = [];
  const seen = new Set();
  for (const e of events) {
    const k = key(e.a, e.b);
    const ca = colliders.get(e.a), cb = colliders.get(e.b);
    const sensor = (ca && ca.trigger) || (cb && cb.trigger);
    if (e.kind === 2) { if (!touching.has(k)) continue; touching.delete(k); }
    else if (e.kind === 0) { if (touching.has(k)) e.kind = 1; touching.set(k, { a: e.a, b: e.b, sensor }); }
    else if (!touching.has(k)) { touching.set(k, { a: e.a, b: e.b, sensor }); e.kind = 0; }
    if (seen.has(k + e.kind)) continue; seen.add(k + e.kind);
    if (sensor) { triggers.push(e.a, e.b, e.kind); continue; }
    if (e.kind === 2) { contacts.push([e.a, e.b, 2, 0, 0, 0, 0, 0, 0, 0, 0]); continue; }
    const rec = [e.a, e.b, e.kind, 0, 0, 0, 0, 0, 0, 0, 0];
    let total = 0;
    const pts = e.pts || [];
    for (const pt of pts) total += pt[7];
    if (pts.length) { rec[3] = pts[0][4]; rec[4] = pts[0][5]; rec[5] = pts[0][6]; }
    rec[6] = total;
    rec[10] = pts.length;
    for (const pt of pts) rec.push(pt[0], pt[1], pt[2], pt[3], pt[7]);
    contacts.push(rec);
  }
  out.push(contacts.length);
  for (const c of contacts) for (const v of c) out.push(v);
  out.push(triggers.length / 3);
  for (const v of triggers) out.push(v);
  // PhysX marks broken joints with eBROKEN; check the breakable ones (the callback alone can miss some)
  for (const [id, j] of joints) if (j.breakable && !broken.includes(id)) {
    try { if (j.joint.getConstraintFlags().isSet(P.PxConstraintFlagEnum.eBROKEN)) broken.push(id); } catch (e) { }
  }
  out.push(broken.length);
  for (const id of broken) { out.push(id); const j = joints.get(id); if (j) { try { j.joint.release(); } catch (e) { } joints.delete(id); } }
  return out;
}
export function physxDebugCounts() { return { bodies: bodies.size, colliders: colliders.size, joints: joints.size, touching: touching.size }; }
