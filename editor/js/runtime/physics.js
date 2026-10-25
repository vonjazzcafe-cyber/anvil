// Anvil — physics backend in the browser (Rapier). C# (PhysicsWorld) drives it through these functions.
// Coordinates are Unity's (left-handed numbers passed straight through; only rendering flips Z).
import RAPIER from '../../../vendor/rapier.mjs';

let R = null;            // RAPIER after init
let world = null;
let eventQueue = null;
let nextId = 1;
const bodies = new Map();     // id -> { body, type, maxAng, maxLin, colliders:Set<id> }
const colliders = new Map();  // id -> { col, body:id, layer, trigger, iid }
const byRapierCollider = new Map(); // rapier handle -> id
const joints = new Map();     // id -> { joint, kind, b1, b2 }
let layerMasks = new Uint32Array(32).fill(0xffffffff);
const ignorePairs = new Set();
const touching = new Map();   // key -> { a, b, sensor, fresh }
let stepsSinceChange = 0;

export async function initPhysics() {
  if (R) return;
  await RAPIER.init();
  R = RAPIER;
}

function key(a, b) { return a < b ? a + '|' + b : b + '|' + a; }
function quat(a, o) { return { x: a[o], y: a[o + 1], z: a[o + 2], w: a[o + 3] }; }
function vec(a, o) { return { x: a[o], y: a[o + 1], z: a[o + 2] }; }
function qmul(a, b) {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y + a.y * b.w + a.z * b.x - a.x * b.z,
    z: a.w * b.z + a.z * b.w + a.x * b.y - a.y * b.x,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}
function qrot(q, v) {
  const x = q.x * 2, y = q.y * 2, z = q.z * 2;
  const xx = q.x * x, yy = q.y * y, zz = q.z * z, xy = q.x * y, xz = q.x * z, yz = q.y * z, wx = q.w * x, wy = q.w * y, wz = q.w * z;
  return {
    x: (1 - (yy + zz)) * v.x + (xy - wz) * v.y + (xz + wy) * v.z,
    y: (xy + wz) * v.x + (1 - (xx + zz)) * v.y + (yz - wx) * v.z,
    z: (xz - wy) * v.x + (yz + wx) * v.y + (1 - (xx + yy)) * v.z,
  };
}
const Q_X90 = { x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 };   // rotate Y axis onto Z
const Q_Z90 = { x: 0, y: 0, z: -Math.SQRT1_2, w: Math.SQRT1_2 };  // rotate Y axis onto X

const hooks = {
  filterContactPair(c1, c2) {
    const a = colliders.get(byRapierCollider.get(c1)), b = colliders.get(byRapierCollider.get(c2));
    if (!a || !b) return R.SolverFlags.COMPUTE_IMPULSE;
    if (((layerMasks[a.layer] >>> b.layer) & 1) === 0) return null;
    if (ignorePairs.size && ignorePairs.has(key(a.iid, b.iid))) return null;
    return R.SolverFlags.COMPUTE_IMPULSE;
  },
  filterIntersectionPair(c1, c2) {
    const a = colliders.get(byRapierCollider.get(c1)), b = colliders.get(byRapierCollider.get(c2));
    if (!a || !b) return true;
    if (((layerMasks[a.layer] >>> b.layer) & 1) === 0) return false;
    if (ignorePairs.size && ignorePairs.has(key(a.iid, b.iid))) return false;
    return true;
  },
};

export const physicsImports = {
  reset(gx, gy, gz) {
    if (world) { try { world.free(); } catch (e) {} }
    if (eventQueue) { try { eventQueue.free(); } catch (e) {} }
    world = new R.World({ x: gx, y: gy, z: gz });
    world.timestep = 0.02;
    eventQueue = new R.EventQueue(true);
    bodies.clear(); colliders.clear(); byRapierCollider.clear(); joints.clear(); touching.clear(); ignorePairs.clear();
    layerMasks = new Uint32Array(32).fill(0xffffffff);
    nextId = 1; stepsSinceChange = 0;
  },
  setGravity(gx, gy, gz) { if (world) world.gravity = { x: gx, y: gy, z: gz }; },
  createBody(type, pose) {
    let desc = type === 0 ? R.RigidBodyDesc.fixed() : type === 2 ? R.RigidBodyDesc.kinematicPositionBased() : R.RigidBodyDesc.dynamic();
    desc = desc.setTranslation(pose[0], pose[1], pose[2]).setRotation(quat(pose, 3)).setCanSleep(true);
    if (type === 1) desc = desc.setAngularDamping(0.05);
    const body = world.createRigidBody(desc);
    const id = nextId++;
    bodies.set(id, { body, type, maxAng: 50, maxLin: 1e16, colliders: new Set() });
    stepsSinceChange = 0;
    return id;
  },
  removeBody(id) {
    const b = bodies.get(id); if (!b) return;
    for (const cid of b.colliders) { const c = colliders.get(cid); if (c) { byRapierCollider.delete(c.col.handle); colliders.delete(cid); dropTouching(cid); } }
    for (const [jid, j] of joints) if (j.b1 === id || j.b2 === id) joints.delete(jid);
    world.removeRigidBody(b.body);
    bodies.delete(id);
    stepsSinceChange = 0;
  },
  setBodyType(id, type) {
    const b = bodies.get(id); if (!b || b.type === type) return;
    b.type = type;
    b.body.setBodyType(type === 0 ? R.RigidBodyType.Fixed : type === 2 ? R.RigidBodyType.KinematicPositionBased : R.RigidBodyType.Dynamic, true);
  },
  setBodyProps(id, p) {
    const b = bodies.get(id); if (!b) return;
    const body = b.body;
    body.setLinearDamping(p[0]); body.setAngularDamping(p[1]); body.setGravityScale(p[2], true);
    const m = p[3] | 0;
    body.setEnabledTranslations(!(m & 2), !(m & 4), !(m & 8), true);
    body.setEnabledRotations(!(m & 16), !(m & 32), !(m & 64), true);
    body.enableCcd(!!p[4]);
    b.maxAng = p[5]; b.maxLin = p[6];
    const detect = !!p[7];
    for (const cid of b.colliders) { const c = colliders.get(cid); if (c) c.col.setCollisionGroups(detect ? 0xffffffff : 0xffff0000); }
  },
  createCollider(bodyId, kind, sp, local, trigger, friction, restitution, fc, rc, layer, iid) {
    const b = bodies.get(bodyId); if (!b) return -1;
    let desc;
    const center = { x: sp[3], y: sp[4], z: sp[5] };
    let extraRot = null;
    switch (kind) {
      case 1: desc = R.ColliderDesc.cuboid(Math.max(sp[0], 1e-4), Math.max(sp[1], 1e-4), Math.max(sp[2], 1e-4)); break;
      case 2: desc = R.ColliderDesc.ball(Math.max(sp[0], 1e-4)); break;
      case 3: {
        const dir = sp[2] | 0;
        desc = sp[1] > 1e-5 ? R.ColliderDesc.capsule(sp[1], Math.max(sp[0], 1e-4)) : R.ColliderDesc.ball(Math.max(sp[0], 1e-4));
        if (dir === 0) extraRot = Q_Z90; else if (dir === 2) extraRot = Q_X90;
        break;
      }
      case 4: {
        const code = sp[0] | 0, sx = Math.abs(sp[3]), sy = Math.abs(sp[4]), sz = Math.abs(sp[5]);
        center.x = 0; center.y = 0; center.z = 0;
        if (code === 1) desc = R.ColliderDesc.cuboid(0.5 * sx, 0.5 * sy, 0.5 * sz);
        else if (code === 2) desc = R.ColliderDesc.ball(0.5 * Math.max(sx, sy, sz));
        else if (code === 3) desc = R.ColliderDesc.capsule(Math.max(0, sy - 0.5 * Math.max(sx, sz)), 0.5 * Math.max(sx, sz));
        else if (code === 4) desc = R.ColliderDesc.cylinder(sy, 0.5 * Math.max(sx, sz));
        else if (code === 5) { desc = R.ColliderDesc.cuboid(5 * sx, 0.05, 5 * sz); center.y = -0.05; }
        else if (code === 6) desc = R.ColliderDesc.cuboid(0.5 * sx, 0.5 * sy, 0.005);
        else desc = R.ColliderDesc.cuboid(0.5 * sx, 0.5 * sy, 0.5 * sz);
        break;
      }
      default: desc = R.ColliderDesc.cuboid(0.5, 0.5, 0.5);
    }
    const lr = quat(local, 3);
    const lp = vec(local, 0);
    const c = qrot(lr, center);
    desc = desc.setTranslation(lp.x + c.x, lp.y + c.y, lp.z + c.z).setRotation(extraRot ? qmul(lr, extraRot) : lr);
    desc = desc.setSensor(!!trigger).setFriction(friction).setRestitution(restitution)
      .setFrictionCombineRule(mapCombine(fc)).setRestitutionCombineRule(mapCombine(rc))
      .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS)
      .setActiveHooks(R.ActiveHooks.FILTER_CONTACT_PAIRS | R.ActiveHooks.FILTER_INTERSECTION_PAIRS)
      .setDensity(trigger ? 0 : 1);
    if (trigger) desc = desc.setActiveCollisionTypes(R.ActiveCollisionTypes.DEFAULT | R.ActiveCollisionTypes.KINEMATIC_FIXED | R.ActiveCollisionTypes.KINEMATIC_KINEMATIC);
    const col = world.createCollider(desc, b.body);
    const id = nextId++;
    colliders.set(id, { col, body: bodyId, layer: layer & 31, trigger: !!trigger, iid });
    byRapierCollider.set(col.handle, id);
    b.colliders.add(id);
    stepsSinceChange = 0;
    return id;
  },
  removeCollider(id) {
    const c = colliders.get(id); if (!c) return;
    const b = bodies.get(c.body);
    if (b) b.colliders.delete(id);
    byRapierCollider.delete(c.col.handle);
    try { world.removeCollider(c.col, true); } catch (e) {}
    colliders.delete(id);
    dropTouching(id);
    stepsSinceChange = 0;
  },
  setColliderLayer(id, layer) { const c = colliders.get(id); if (c) c.layer = layer & 31; },
  setMassProps(id, p) {
    // p: mass, hasCom, comx, comy, comz, hasI, ix, iy, iz, qx, qy, qz, qw  -> returns [mass, com(3), inertia(3), frame(4)]
    const b = bodies.get(id); if (!b) return [p[0], 0, 0, 0, 1, 1, 1, 0, 0, 0, 1];
    const body = b.body, mass = Math.max(p[0], 1e-7);
    let vol = 0;
    for (const cid of b.colliders) { const c = colliders.get(cid); if (c && !c.trigger) vol += c.col.volume(); }
    body.setAdditionalMassProperties(0, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, false);
    if (vol > 1e-12) {
      const dens = mass / vol;
      for (const cid of b.colliders) { const c = colliders.get(cid); if (c) c.col.setDensity(c.trigger ? 0 : dens); }
      body.recomputeMassPropertiesFromColliders();
    } else {
      for (const cid of b.colliders) { const c = colliders.get(cid); if (c) c.col.setDensity(0); }
      body.setAdditionalMassProperties(mass, { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }, { x: 0, y: 0, z: 0, w: 1 }, true);
      body.recomputeMassPropertiesFromColliders();
    }
    if (p[1] || p[5]) {
      const com = body.localCom(), I = body.principalInertia(), F = body.principalInertiaLocalFrame();
      for (const cid of b.colliders) { const c = colliders.get(cid); if (c) c.col.setDensity(0); }
      body.setAdditionalMassProperties(mass,
        p[1] ? { x: p[2], y: p[3], z: p[4] } : com,
        p[5] ? { x: p[6], y: p[7], z: p[8] } : I,
        p[5] ? { x: p[9], y: p[10], z: p[11], w: p[12] } : F, true);
      body.recomputeMassPropertiesFromColliders();
    }
    const com = body.localCom(), I = body.principalInertia(), F = body.principalInertiaLocalFrame();
    return [body.mass(), com.x, com.y, com.z, I.x, I.y, I.z, F.x, F.y, F.z, F.w];
  },
  createJoint(kind, b1, b2, a, collide, extra) {
    // a: a1(3) f1(4) a2(3) f2(4)
    const B1 = bodies.get(b1), B2 = bodies.get(b2);
    if (!B1 || !B2) return -1;
    const a1 = vec(a, 0), f1 = quat(a, 3), a2 = vec(a, 7), f2 = quat(a, 10);
    let data, joint;
    if (kind === 2) data = R.JointData.fixed(a1, f1, a2, f2);
    else if (kind === 3) data = R.JointData.spring(Math.max(0, extra[0]), extra[1], extra[2], a1, a2);
    else if (kind === 4) data = R.JointData.spherical(a1, a2);
    else if (kind === 5) {
      // ConfigurableJoint: x/y/z motion then angular x/y/z motion (0 locked, 1 limited, 2 free)
      let mask = 0;
      if (extra[0] === 0) mask |= R.JointAxesMask.LinX;
      if (extra[1] === 0) mask |= R.JointAxesMask.LinY;
      if (extra[2] === 0) mask |= R.JointAxesMask.LinZ;
      if (extra[3] === 0) mask |= R.JointAxesMask.AngX;
      if (extra[4] === 0) mask |= R.JointAxesMask.AngY;
      if (extra[5] === 0) mask |= R.JointAxesMask.AngZ;
      const linLocked = (mask & 7) === 7;
      data = linLocked && (mask & 56) === 0 ? R.JointData.spherical(a1, a2) : R.JointData.generic(a1, a2, { x: 1, y: 0, z: 0 }, mask);
    }
    else data = R.JointData.revolute(a1, a2, { x: 1, y: 0, z: 0 });
    joint = world.createImpulseJoint(data, B1.body, B2.body, true);
    if (kind === 1 || kind === 4 || kind === 5) {
      try { joint.setLocalFrame1(a1, f1); joint.setLocalFrame2(a2, f2); } catch (e) { console.warn('joint frames', e); }
    }
    joint.setContactsEnabled(!!collide);
    if (kind === 1) { joint.configureMotorModel(R.MotorModel.ForceBased); joint.setLimits(-1e6, 1e6); }
    const id = nextId++;
    joints.set(id, { joint, kind, b1, b2 });
    stepsSinceChange = 0;
    return id;
  },
  removeJoint(id) {
    const j = joints.get(id); if (!j) return;
    try { world.removeImpulseJoint(j.joint, true); } catch (e) {}
    joints.delete(id);
  },
  setLayerMatrix(m) { for (let i = 0; i < 32; i++) layerMasks[i] = (m[i] >>> 0); },
  setIgnorePair(c1, c2, ignore) {
    const a = colliders.get(c1), b = colliders.get(c2); if (!a || !b) return;
    const k = key(a.iid, b.iid);
    if (ignore) ignorePairs.add(k); else ignorePairs.delete(k);
  },
  applyCommands(cmd, count) {
    apply(cmd, count);
    if (world) world.propagateModifiedBodyPositionsToColliders();
  },
  step(cmd, count, dt) {
    apply(cmd, count);
    world.timestep = Math.max(1e-5, dt);
    world.step(eventQueue, hooks);
    stepsSinceChange++;
    return collect();
  },
  raycast(o, d, maxDist, layerMask, hitTriggers) {
    const hit = rayQuery(o, d, maxDist, layerMask, hitTriggers);
    return hit || [0];
  },
  raycastAll(o, d, maxDist, layerMask, hitTriggers) {
    const out = [];
    const ray = new R.Ray(vec(o, 0), vec(d, 0));
    const pred = predicate(layerMask, -1);
    const flags = hitTriggers ? undefined : R.QueryFilterFlags.EXCLUDE_SENSORS;
    const hits = [];
    if (stepsSinceChange === 0) {
      for (const [id, c] of colliders) {
        if (!pred(c.col) || (!hitTriggers && c.trigger)) continue;
        const h = c.col.castRayAndGetNormal(ray, finite(maxDist), true);
        if (h) hits.push([id, h.timeOfImpact ?? h.toi, h.normal]);
      }
    } else {
      world.intersectionsWithRay(ray, finite(maxDist), true, (h) => { const id = byRapierCollider.get(h.collider.handle); if (id) hits.push([id, h.timeOfImpact ?? h.toi, h.normal]); return true; }, flags, undefined, undefined, undefined, pred);
    }
    hits.sort((a, b) => a[1] - b[1]);
    for (const [id, toi, n] of hits) out.push(id, o[0] + d[0] * toi, o[1] + d[1] * toi, o[2] + d[2] * toi, n.x, n.y, n.z, toi);
    return out;
  },
  shapeCast(kind, dims, pose, dir, maxDist, layerMask, hitTriggers, exclude) {
    const shape = makeShape(kind, dims);
    const ex = exclude > 0 ? colliders.get(exclude)?.col : undefined;
    const flags = hitTriggers ? undefined : R.QueryFilterFlags.EXCLUDE_SENSORS;
    const h = world.castShape(vec(pose, 0), quat(pose, 3), vec(dir, 0), shape, 0, finite(maxDist), true, flags, undefined, ex, undefined, predicate(layerMask, exclude));
    if (!h) return [0];
    const id = byRapierCollider.get(h.collider.handle);
    const toi = h.time_of_impact;
    const w = h.witness1, n = h.normal1;
    // witness1/normal1 are expressed on the hit collider in world space for the world query
    return [1, id || 0, w.x, w.y, w.z, n.x, n.y, n.z, toi];
  },
  // every collider the shape touches along the sweep (Physics.SphereCastAll/BoxCastAll/CapsuleCastAll)
  shapeCastAll(kind, dims, pose, dir, maxDist, layerMask, hitTriggers) {
    const shape = makeShape(kind, dims);
    const flags = hitTriggers ? undefined : R.QueryFilterFlags.EXCLUDE_SENSORS;
    const found = new Set(), out = [];
    const base = predicate(layerMask, -1);
    const pred = (col) => base(col) && !found.has(byRapierCollider.get(col.handle));
    for (let i = 0; i < 64; i++) {
      const h = world.castShape(vec(pose, 0), quat(pose, 3), vec(dir, 0), shape, 0, finite(maxDist), true, flags, undefined, undefined, undefined, pred);
      if (!h) break;
      const id = byRapierCollider.get(h.collider.handle);
      if (!id) break;
      found.add(id);
      const w = h.witness1, n = h.normal1;
      out.push(id, w.x, w.y, w.z, n.x, n.y, n.z, h.time_of_impact);
    }
    return out;
  },
  overlap(kind, dims, pose, layerMask, hitTriggers) {
    const shape = makeShape(kind, dims);
    const out = [];
    const flags = hitTriggers ? undefined : R.QueryFilterFlags.EXCLUDE_SENSORS;
    if (stepsSinceChange === 0) {
      const p = vec(pose, 0), q = quat(pose, 3);
      const pred = predicate(layerMask, -1);
      for (const [id, c] of colliders) {
        if (!pred(c.col) || (!hitTriggers && c.trigger)) continue;
        if (c.col.intersectsShape(shape, p, q)) out.push(id);
      }
      return out;
    }
    world.intersectionsWithShape(vec(pose, 0), quat(pose, 3), shape, (c) => { const id = byRapierCollider.get(c.handle); if (id) out.push(id); return true; }, flags, undefined, undefined, undefined, predicate(layerMask, -1));
    return out;
  },
  closestPoint(id, x, y, z) {
    const c = colliders.get(id); if (!c) return [x, y, z];
    const pr = c.col.projectPoint({ x, y, z }, true);
    return pr ? [pr.point.x, pr.point.y, pr.point.z] : [x, y, z];
  },
};

function finite(v) { return Number.isFinite(v) ? v : 1e9; }
function mapCombine(u) { return u === 1 ? R.CoefficientCombineRule.Multiply : u === 2 ? R.CoefficientCombineRule.Min : u === 3 ? R.CoefficientCombineRule.Max : R.CoefficientCombineRule.Average; }
function makeShape(kind, d) {
  if (kind === 1) return new R.Cuboid(Math.max(d[0], 1e-4), Math.max(d[1], 1e-4), Math.max(d[2], 1e-4));
  if (kind === 3) return d[1] > 1e-5 ? new R.Capsule(d[1], Math.max(d[0], 1e-4)) : new R.Ball(Math.max(d[0], 1e-4));
  return new R.Ball(Math.max(d[0], 1e-4));
}
function predicate(layerMask, exclude) {
  const mask = layerMask | 0;
  return (col) => {
    const id = byRapierCollider.get(col.handle);
    if (!id || id === exclude) return false;
    const c = colliders.get(id);
    return c ? ((mask >>> c.layer) & 1) === 1 : false;
  };
}
function rayQuery(o, d, maxDist, layerMask, hitTriggers) {
  const ray = new R.Ray(vec(o, 0), vec(d, 0));
  const pred = predicate(layerMask, -1);
  let best = null;
  if (stepsSinceChange === 0) {
    for (const [id, c] of colliders) {
      if (!pred(c.col) || (!hitTriggers && c.trigger)) continue;
      const h = c.col.castRayAndGetNormal(ray, finite(maxDist), true);
      const toi = h ? (h.timeOfImpact ?? h.toi) : Infinity;
      if (h && (!best || toi < best[0])) best = [toi, id, h.normal];
    }
  } else {
    const flags = hitTriggers ? undefined : R.QueryFilterFlags.EXCLUDE_SENSORS;
    const h = world.castRayAndGetNormal(ray, finite(maxDist), true, flags, undefined, undefined, undefined, pred);
    if (h) best = [h.timeOfImpact ?? h.toi, byRapierCollider.get(h.collider.handle), h.normal];
  }
  if (!best) return null;
  const [toi, id, n] = best;
  return [1, id, o[0] + d[0] * toi, o[1] + d[1] * toi, o[2] + d[2] * toi, n.x, n.y, n.z, toi];
}

function dropTouching(cid) {
  for (const [k, t] of touching) if (t.a === cid || t.b === cid) touching.delete(k);
}

function apply(cmd, count) {
  let i = 0;
  while (i < count) {
    const op = cmd[i] | 0, id = cmd[i + 1] | 0;
    const b = bodies.get(id);
    switch (op) {
      case 1: // set pose (teleport)
        if (b) { b.body.setTranslation({ x: cmd[i + 2], y: cmd[i + 3], z: cmd[i + 4] }, true); b.body.setRotation({ x: cmd[i + 5], y: cmd[i + 6], z: cmd[i + 7], w: cmd[i + 8] }, true); if (b.type === 2) { b.body.setNextKinematicTranslation({ x: cmd[i + 2], y: cmd[i + 3], z: cmd[i + 4] }); b.body.setNextKinematicRotation({ x: cmd[i + 5], y: cmd[i + 6], z: cmd[i + 7], w: cmd[i + 8] }); } }
        i += 9; break;
      case 2: if (b && b.type === 1) b.body.setLinvel({ x: cmd[i + 2], y: cmd[i + 3], z: cmd[i + 4] }, true); i += 5; break;
      case 3: if (b && b.type === 1) b.body.setAngvel({ x: cmd[i + 2], y: cmd[i + 3], z: cmd[i + 4] }, true); i += 5; break;
      case 4: if (b && b.type === 1) b.body.applyImpulse({ x: cmd[i + 2], y: cmd[i + 3], z: cmd[i + 4] }, true); i += 5; break;
      case 5: if (b && b.type === 1) b.body.applyTorqueImpulse({ x: cmd[i + 2], y: cmd[i + 3], z: cmd[i + 4] }, true); i += 5; break;
      case 6: if (b && b.type === 1) { const w = b.body.angvel(); b.body.setAngvel({ x: w.x + cmd[i + 2], y: w.y + cmd[i + 3], z: w.z + cmd[i + 4] }, true); } i += 5; break;
      case 7: if (b) b.body.wakeUp(); i += 2; break;
      case 8: if (b) b.body.sleep(); i += 2; break;
      case 9: // kinematic target
        if (b) { b.body.setNextKinematicTranslation({ x: cmd[i + 2], y: cmd[i + 3], z: cmd[i + 4] }); b.body.setNextKinematicRotation({ x: cmd[i + 5], y: cmd[i + 6], z: cmd[i + 7], w: cmd[i + 8] }); }
        i += 9; break;
      case 10: { // collider local pose relative to its body
        const c = colliders.get(id);
        if (c) { c.col.setTranslationWrtParent({ x: cmd[i + 2], y: cmd[i + 3], z: cmd[i + 4] }); c.col.setRotationWrtParent({ x: cmd[i + 5], y: cmd[i + 6], z: cmd[i + 7], w: cmd[i + 8] }); }
        i += 9; break;
      }
      case 11: { // hinge drive: mode, targetVel, targetPos, stiffness, damping, maxForce, limits, min, max
        const j = joints.get(id);
        if (j) {
          const J = j.joint, mode = cmd[i + 2] | 0;
          if (mode === 1) { J.configureMotorModel(R.MotorModel.ForceBased); J.configureMotorVelocity(cmd[i + 3], 1e4); J.setMotorMaxForce(cmd[i + 7]); }
          else if (mode === 2) { J.configureMotorModel(R.MotorModel.ForceBased); J.configureMotorPosition(cmd[i + 4], cmd[i + 5], cmd[i + 6]); J.setMotorMaxForce(1e30); }
          else { J.configureMotorVelocity(0, 0); J.setMotorMaxForce(0); }
          if (cmd[i + 8]) J.setLimits(cmd[i + 9], cmd[i + 10]); else J.setLimits(-1e6, 1e6);
          const B = bodies.get(j.b2); if (B) B.body.wakeUp();
        }
        i += 11; break;
      }
      case 12: { // configurable joint drives: 6 axes x (on, targetPos, targetVel, stiffness, damping, maxForce)
        const j = joints.get(id);
        if (j && j.joint.setMotorMaxForce && j.joint.configureMotor && j.joint.configureMotor.length >= 5) {
          const axes = [R.JointAxis.LinX, R.JointAxis.LinY, R.JointAxis.LinZ, R.JointAxis.AngX, R.JointAxis.AngY, R.JointAxis.AngZ];
          for (let a = 0; a < 6; a++) {
            const o = i + 2 + a * 6;
            if (a < 3) continue; // linear drives not supported on spherical joints
            try {
              if (cmd[o]) { j.joint.configureMotorModel(axes[a], R.MotorModel.ForceBased); j.joint.configureMotor(axes[a], cmd[o + 1], cmd[o + 2], cmd[o + 3], cmd[o + 4]); j.joint.setMotorMaxForce(axes[a], cmd[o + 5] > 0 ? cmd[o + 5] : 1e30); }
              else j.joint.setMotorMaxForce(axes[a], 0);
            } catch (e) { }
          }
          const B = bodies.get(j.b2); if (B) B.body.wakeUp();
        }
        i += 38; break;
      }
      default: i = count; break;
    }
  }
}

function collect() {
  const out = [];
  // bodies
  let n = 0;
  const nIdx = out.length; out.push(0);
  for (const [id, b] of bodies) {
    if (b.type === 0) continue;
    const body = b.body;
    if (b.type === 1) {
      const w = body.angvel();
      const wm = Math.hypot(w.x, w.y, w.z);
      if (wm > b.maxAng && wm > 0) { const s = b.maxAng / wm; body.setAngvel({ x: w.x * s, y: w.y * s, z: w.z * s }, false); }
      const v = body.linvel(); const vm = Math.hypot(v.x, v.y, v.z);
      if (vm > b.maxLin && vm > 0) { const s = b.maxLin / vm; body.setLinvel({ x: v.x * s, y: v.y * s, z: v.z * s }, false); }
    }
    const p = body.translation(), q = body.rotation(), v = body.linvel(), w = body.angvel(), c = body.worldCom();
    out.push(id, p.x, p.y, p.z, q.x, q.y, q.z, q.w, v.x, v.y, v.z, w.x, w.y, w.z, c.x, c.y, c.z, body.isSleeping() ? 1 : 0);
    n++;
  }
  out[nIdx] = n;

  // collision events -> touching set
  const started = new Set();
  eventQueue.drainCollisionEvents((h1, h2, isStarted) => {
    const a = byRapierCollider.get(h1), b = byRapierCollider.get(h2);
    if (!a || !b) return;
    const k = key(a, b);
    const ca = colliders.get(a), cb = colliders.get(b);
    const sensor = (ca && ca.trigger) || (cb && cb.trigger);
    if (isStarted) {
      if (!touching.has(k)) { touching.set(k, { a, b, sensor, fresh: true }); started.add(k); }
    } else {
      const t = touching.get(k);
      if (t) { touching.delete(k); t.exit = true; exits.push(t); }
    }
  });
  const contacts = [], triggers = [];
  for (const [k, t] of touching) {
    const kind = started.has(k) ? 0 : 1;
    if (t.sensor) triggers.push(t.a, t.b, kind);
    else contacts.push(contactRecord(t.a, t.b, kind));
  }
  for (const t of exits) {
    if (t.sensor) triggers.push(t.a, t.b, 2);
    else contacts.push([t.a, t.b, 2, 0, 0, 0, 0, 0, 0, 0, 0]);
  }
  exits.length = 0;
  out.push(contacts.length);
  for (const c of contacts) for (const v of c) out.push(v);
  out.push(triggers.length / 3);
  for (const v of triggers) out.push(v);
  return out;
}
const exits = [];

function contactRecord(a, b, kind) {
  const ca = colliders.get(a), cb = colliders.get(b);
  const rec = [a, b, kind, 0, 0, 0, 0, 0, 0, 0, 0];
  if (!ca || !cb) return rec;
  let nx = 0, ny = 0, nz = 0, total = 0;
  const pts = [];
  world.contactPair(ca.col, cb.col, (m, flipped) => {
    const ln = m.localNormal1();
    const owner = flipped ? cb.col : ca.col;
    const n = qrot(owner.rotation(), ln);
    const s = flipped ? -1 : 1;
    const nc = m.numContacts();
    let any = false;
    for (let i = 0; i < nc; i++) {
      const dist = m.contactDist(i);
      if (dist > 0.02) continue;
      const lp = m.localContactPoint1(i);
      if (!lp) continue;
      const wp = qrot(owner.rotation(), lp), t = owner.translation();
      const imp = m.contactImpulse(i);
      pts.push(wp.x + t.x, wp.y + t.y, wp.z + t.z, dist, imp);
      total += imp; any = true;
    }
    if (any || (nx === 0 && ny === 0 && nz === 0)) { nx = n.x * s; ny = n.y * s; nz = n.z * s; }
  });
  rec[3] = nx; rec[4] = ny; rec[5] = nz; rec[6] = total;
  rec[10] = pts.length / 5;
  for (const v of pts) rec.push(v);
  return rec;
}
export function debugCounts() { return { bodies: bodies.size, colliders: colliders.size, steps: stepsSinceChange }; }
