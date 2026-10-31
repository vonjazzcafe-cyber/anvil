// Anvil — 2D physics for Rigidbody2D / Collider2D / Joint2D, on planck.js (a JavaScript port of Box2D, the
// engine Unity's 2D physics is built on). The C# side owns every id and talks to this module through one
// call, exec(commands) -> results, so a whole physics step is a single trip across the JS boundary.
import * as pl from '../../../vendor/planck.js';

const { World, Vec2, Circle, Polygon, Chain, Box, Transform, Distance, DistanceInput, DistanceOutput, SimplexCache, ShapeCast, ShapeCastInput, ShapeCastOutput, testOverlap, AABB } = pl;

let world = null;
let ground = null;                     // static body joints use when they have no connected body
const bodies = new Map();              // id -> { body, constraints, mass settings, move target }
const colliders = new Map();           // id -> { id, body, fixtures, layer, trigger, effector }
const joints = new Map();              // id -> { joint, kind }
let layerMask = new Array(32).fill(-1);
const ignore = new Set();
let touching = new Map();              // "a|b" -> contact record from the last step
const pendingExits = [];               // pairs that stopped touching because a collider went away
let bounceThreshold = 1;
let velIt = 8, posIt = 3;
let stepNo = 0;
let ready = false;

const DEG = Math.PI / 180;
const pairKey = (a, b) => a < b ? a + '|' + b : b + '|' + a;

// Unity: two Collider2Ds collide when the layer matrix allows it and the pair isn't ignored.
// Kinematic/static pairs only make contacts for triggers (or useFullKinematicContacts).
pl.Fixture.prototype.shouldCollide = function (that) {
  const a = this.getUserData(), b = that.getUserData();
  if (!a || !b) return true;
  if (a === b) return false;
  if (!(layerMask[a.layer] & (1 << b.layer)) || !(layerMask[b.layer] & (1 << a.layer))) return false;
  if (ignore.has(pairKey(a.id, b.id))) return false;
  const ba = this.getBody(), bb = that.getBody();
  if (!ba.isDynamic() && !bb.isDynamic()) {
    if (ba.isStatic() && bb.isStatic()) return false;
    const full = (ba.getUserData()?.fullKinematic) || (bb.getUserData()?.fullKinematic);
    if (!this.isSensor() && !that.isSensor() && !full) return false;
  }
  return true;
};
pl.Body.prototype.shouldCollide = function (that) {
  if (this.isStatic() && that.isStatic()) return false;
  for (let jn = this.m_jointList; jn; jn = jn.next) if (jn.other === that && !jn.joint.m_collideConnected) return false;
  return true;
};

export async function initPhysics2D() { ready = true; return true; }
export function physics2dReady() { return ready; }

function newWorld(gx, gy) {
  world = new World({ gravity: Vec2(gx, gy) });
  ground = world.createBody({ type: 'static' });
  bodies.clear(); colliders.clear(); joints.clear(); ignore.clear(); touching = new Map(); pendingExits.length = 0;
  layerMask = new Array(32).fill(-1);
  // planck recycles contact objects: clear the per-contact state Anvil keeps on them when a touch begins
  world.on('begin-contact', c => { c._oneWayOff = undefined; c._rv = null; c._rvStep = -1; c._imp = null; c._timp = null; c._impStep = -1; });
  world.on('pre-solve', preSolve);
  world.on('post-solve', (c, imp) => { c._imp = imp.normalImpulses.slice(0, 2); c._timp = imp.tangentImpulses.slice(0, 2); c._impStep = stepNo; });
}

// ---------------- effectors and contact tweaks ----------------
function preSolve(c) {
  const fa = c.getFixtureA(), fb = c.getFixtureB();
  const A = fa.getUserData(), B = fb.getUserData();
  if (!A || !B) return;
  // relative velocity at the contact before the solver runs (Collision2D.relativeVelocity)
  const wm = c.getWorldManifold(null);
  const p = wm && wm.points && wm.points.length ? wm.points[0] : fa.getBody().getWorldCenter();
  const va = fa.getBody().getLinearVelocityFromWorldPoint(p), vb = fb.getBody().getLinearVelocityFromWorldPoint(p);
  if (c._rvStep !== stepNo) { c._rv = [vb.x - va.x, vb.y - va.y]; c._rvStep = stepNo; }
  for (const [E, O, eIsA] of [[A, B, true], [B, A, false]]) {
    const eff = E.effector;
    if (!eff || !effectorApplies(eff, O)) continue;
    if (eff.type === 1) {   // PlatformEffector2D
      if (c._oneWayOff === undefined) {
        c._oneWayOff = false;
        if (eff.oneWay) {
          // normal pointing from the platform to the other collider; a contact outside the surface arc passes through
          let nx = wm.normal.x, ny = wm.normal.y; if (!eIsA) { nx = -nx; ny = -ny; }
          const ang = E.bodyRef.body.getAngle() + (eff.rotOffset + 90) * DEG;
          const dot = nx * Math.cos(ang) + ny * Math.sin(ang);
          if (dot < Math.cos(eff.arc * DEG / 2) - 1e-4) c._oneWayOff = true;
        }
      }
      if (c._oneWayOff) { c.setEnabled(false); continue; }
      if (!eff.sideFriction || !eff.sideBounce) {
        let nx = wm.normal.x, ny = wm.normal.y; if (!eIsA) { nx = -nx; ny = -ny; }
        const ang = E.bodyRef.body.getAngle() + (eff.rotOffset + 90) * DEG;
        const side = Math.abs(nx * Math.cos(ang) + ny * Math.sin(ang)) < Math.cos((180 - eff.sideArc) * DEG / 2);
        if (side) { if (!eff.sideFriction) c.setFriction(0); if (!eff.sideBounce) c.setRestitution(0); }
      }
    } else if (eff.type === 2) {   // SurfaceEffector2D: a conveyor along the surface
      const v = eff.speed + (eff.speedVar ? (Math.random() * 2 - 1) * eff.speedVar : 0);
      c.setTangentSpeed(eIsA ? v : -v);
      if (!eff.useFriction) c.setFriction(Math.max(c.getFriction(), 0.5));
      if (!eff.useBounce) c.setRestitution(0);
    }
  }
}
function effectorApplies(eff, other) {
  if (!eff.useMask) return true;
  return (eff.mask & (1 << other.layer)) !== 0;
}
function applyFieldEffectors(dt) {
  // AreaEffector2D / PointEffector2D act on whatever is inside their (usually trigger) colliders
  for (const rec of touching.values()) {
    const A = colliders.get(rec.a), B = colliders.get(rec.b);
    if (!A || !B) continue;
    for (const [E, O] of [[A, B], [B, A]]) {
      const eff = E.effector;
      if (!eff || (eff.type !== 3 && eff.type !== 4)) continue;
      if (!effectorApplies(eff, O)) continue;
      const body = O.bodyRef.body;
      if (!body.isDynamic()) continue;
      const target = eff.target === 1 ? fixtureCenter(O) : body.getWorldCenter();
      let fx = 0, fy = 0;
      const mag = eff.mag + (eff.magVar ? (Math.random() * 2 - 1) * eff.magVar : 0);
      if (eff.type === 3) {
        const ang = (eff.angle * DEG) + (eff.global ? 0 : E.bodyRef.body.getAngle() + (eff.localAngle || 0) * DEG);
        fx = Math.cos(ang) * mag; fy = Math.sin(ang) * mag;
      } else {
        const src = eff.source === 1 ? fixtureCenter(E) : E.bodyRef.body.getWorldCenter();
        let dx = target.x - src.x, dy = target.y - src.y; const d = Math.hypot(dx, dy) || 1e-6;
        dx /= d; dy /= d;
        const sd = d * eff.distScale;
        const k = eff.mode === 1 ? 1 / Math.max(sd, 1e-3) : eff.mode === 2 ? 1 / Math.max(sd * sd, 1e-3) : 1;
        fx = dx * mag * k; fy = dy * mag * k;
      }
      body.applyForce(Vec2(fx, fy), target, true);
      if (eff.drag > 0) { const v = body.getLinearVelocity(); body.setLinearVelocity(Vec2(v.x / (1 + dt * eff.drag), v.y / (1 + dt * eff.drag))); }
      if (eff.angDrag > 0) body.setAngularVelocity(body.getAngularVelocity() / (1 + dt * eff.angDrag));
    }
  }
}
function fixtureCenter(C) {
  const aabb = new AABB(); let first = true;
  for (const f of C.fixtures) for (let i = 0; i < f.getShape().getChildCount(); i++) { const a = f.getAABB(i); if (first) { aabb.set(a); first = false; } else aabb.combine(aabb, a); }
  return first ? C.bodyRef.body.getWorldCenter() : aabb.getCenter();
}

// ---------------- shapes ----------------
function polyArea(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.y - q.x * p.y; } return a / 2; }
function isConvex(pts) {
  let sign = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], c = pts[(i + 2) % pts.length];
    const cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cr) < 1e-12) continue;
    const s = cr > 0 ? 1 : -1;
    if (sign === 0) sign = s; else if (s !== sign) return false;
  }
  return true;
}
// ear clipping for concave PolygonCollider2D paths (Unity decomposes them too)
function triangulate(pts) {
  const p = pts.slice(); if (polyArea(p) < 0) p.reverse();
  const out = []; let guard = 0;
  const inside = (a, b, c, q) => {
    const d1 = (b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x), d2 = (c.x - b.x) * (q.y - b.y) - (c.y - b.y) * (q.x - b.x), d3 = (a.x - c.x) * (q.y - c.y) - (a.y - c.y) * (q.x - c.x);
    return d1 > 1e-12 && d2 > 1e-12 && d3 > 1e-12;
  };
  while (p.length > 3 && guard++ < 5000) {
    let clipped = false;
    for (let i = 0; i < p.length; i++) {
      const a = p[(i + p.length - 1) % p.length], b = p[i], c = p[(i + 1) % p.length];
      if ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) <= 1e-12) continue;
      let ok = true;
      for (const q of p) if (q !== a && q !== b && q !== c && inside(a, b, c, q)) { ok = false; break; }
      if (!ok) continue;
      out.push([a, b, c]); p.splice(i, 1); clipped = true; break;
    }
    if (!clipped) break;
  }
  if (p.length === 3) out.push(p);
  return out;
}
function convexPieces(pts) {
  if (pts.length < 3 || Math.abs(polyArea(pts)) < 1e-8) return [];
  if (pts.length <= 8 && isConvex(pts)) return [pts];
  return triangulate(pts).filter(t => Math.abs(polyArea(t)) > 1e-9);
}
function buildShapes(kind, d) {
  const shapes = [];
  if (kind === 1) shapes.push(new Circle(Vec2(d[0], d[1]), Math.max(d[2], 1e-4)));
  else if (kind === 2) {
    // capsule: two circles and a box between them
    const cx = d[0], cy = d[1], ang = d[2], w = Math.max(d[3], 1e-4), h = Math.max(d[4], 1e-4), vertical = d[5] === 0;
    const r = (vertical ? w : h) / 2, half = Math.max(0, (vertical ? h : w) / 2 - r);
    const ax = vertical ? -Math.sin(ang) : Math.cos(ang), ay = vertical ? Math.cos(ang) : Math.sin(ang);
    if (half <= 1e-5) shapes.push(new Circle(Vec2(cx, cy), r));
    else {
      shapes.push(new Circle(Vec2(cx + ax * half, cy + ay * half), r));
      shapes.push(new Circle(Vec2(cx - ax * half, cy - ay * half), r));
      shapes.push(vertical ? new Box(r, half, Vec2(cx, cy), ang) : new Box(half, r, Vec2(cx, cy), ang));
    }
  } else if (kind === 3) {
    let i = 0; const np = d[i++] | 0;
    for (let k = 0; k < np; k++) {
      const n = d[i++] | 0; const pts = [];
      for (let m = 0; m < n; m++) { pts.push(Vec2(d[i], d[i + 1])); i += 2; }
      // drop repeated points
      const clean = pts.filter((q, j) => { const o = pts[(j + pts.length - 1) % pts.length]; return Math.hypot(q.x - o.x, q.y - o.y) > 1e-5; });
      for (const piece of convexPieces(clean)) { try { shapes.push(new Polygon(piece)); } catch (e) { } }
    }
  } else if (kind === 4) {
    let i = 0; const n = d[i++] | 0; const loop = d[i++] !== 0; const pts = [];
    for (let m = 0; m < n; m++) { pts.push(Vec2(d[i], d[i + 1])); i += 2; }
    const clean = pts.filter((q, j) => j === 0 || Math.hypot(q.x - pts[j - 1].x, q.y - pts[j - 1].y) > 1e-5);
    if (clean.length >= 2) shapes.push(new Chain(clean, loop && clean.length >= 3));
  }
  return shapes;
}

// ---------------- mass ----------------
function applyMass(b) {
  const body = b.body;
  if (!body.isDynamic()) return;
  body.resetMassData();
  const md = { mass: 0, center: Vec2(), I: 0 }; body.getMassData(md);
  const hasShape = md.mass > 0;
  let mass = b.autoMass && hasShape ? md.mass : Math.max(b.mass, 1e-4);
  let center = b.hasCom ? Vec2(b.com[0], b.com[1]) : (hasShape ? Vec2(md.center.x, md.center.y) : Vec2(0, 0));
  // inertia about the centre of mass: Box2D's MassData.I is about the body origin
  let Ic;
  if (b.hasI) Ic = Math.max(b.inertia, 1e-6);
  else if (hasShape) { const Ic0 = md.I - md.mass * (md.center.x * md.center.x + md.center.y * md.center.y); Ic = Ic0 * (mass / md.mass); }
  else Ic = mass * 0.1667;
  if (b.constraints & 4) Ic = 0;
  body.setMassData({ mass, center, I: Ic + mass * (center.x * center.x + center.y * center.y) });
  if (b.constraints & 4) body.setFixedRotation(true);
}

// ---------------- commands ----------------
const TYPES = ['dynamic', 'kinematic', 'static'];
function setBodyProps(b, d, i) {
  const body = b.body;
  const type = TYPES[d[i] | 0] || 'dynamic';
  if (body.getType() !== type) { body.setType(type); }
  body.setLinearDamping(d[i + 1]); body.setAngularDamping(d[i + 2]); body.setGravityScale(d[i + 3]);
  b.constraints = d[i + 4] | 0;
  body.setFixedRotation((b.constraints & 4) !== 0);
  body.setBullet(d[i + 5] !== 0);
  body.setSleepingAllowed((d[i + 6] | 0) !== 0);
  const sim = d[i + 7] !== 0;
  if (body.isActive() !== sim) body.setActive(sim);
  b.fullKinematic = d[i + 8] !== 0; body.setUserData(b);
  b.autoMass = d[i + 9] !== 0; b.mass = d[i + 10];
  b.hasCom = d[i + 11] !== 0; b.com = [d[i + 12], d[i + 13]];
  b.hasI = d[i + 14] !== 0; b.inertia = d[i + 15];
  applyMass(b);
}
const BODY_PROPS = 16;

function makeJoint(kind, A, B, ax, ay, bx, by, collide, p) {
  const la = A.getLocalPoint(Vec2(ax, ay)), lb = B.getLocalPoint(Vec2(bx, by));
  const base = { bodyA: A, bodyB: B, collideConnected: collide, localAnchorA: la, localAnchorB: lb };
  let j = null;
  switch (kind) {
    case 0: // HingeJoint2D
      j = new pl.RevoluteJoint({ ...base, referenceAngle: p[0], enableMotor: p[1] !== 0, motorSpeed: p[2], maxMotorTorque: p[3], enableLimit: p[4] !== 0, lowerAngle: Math.min(p[5], p[6]), upperAngle: Math.max(p[5], p[6]) });
      break;
    case 1: // DistanceJoint2D
      if (p[1] !== 0) j = new pl.RopeJoint({ ...base, maxLength: Math.max(p[0], 0.005) });
      else j = new pl.DistanceJoint({ ...base, length: Math.max(p[0], 0.005), frequencyHz: 0, dampingRatio: 0 });
      break;
    case 2: // SpringJoint2D
      j = new pl.DistanceJoint({ ...base, length: Math.max(p[0], 0.005), frequencyHz: p[1], dampingRatio: p[2] });
      break;
    case 3: // FixedJoint2D
      j = new pl.WeldJoint({ ...base, frequencyHz: p[0], dampingRatio: p[1], referenceAngle: p[2] });
      break;
    case 4: // SliderJoint2D
      j = new pl.PrismaticJoint({ ...base, localAxisA: Vec2(Math.cos(p[0]), Math.sin(p[0])), referenceAngle: p[7], enableMotor: p[1] !== 0, motorSpeed: p[2], maxMotorForce: p[3], enableLimit: p[4] !== 0, lowerTranslation: Math.min(p[5], p[6]), upperTranslation: Math.max(p[5], p[6]) });
      break;
    case 5: // WheelJoint2D
      j = new pl.WheelJoint({ ...base, localAxisA: Vec2(Math.cos(p[0]), Math.sin(p[0])), frequencyHz: p[1], dampingRatio: p[2], enableMotor: p[3] !== 0, motorSpeed: p[4], maxMotorTorque: p[5] });
      break;
    case 6: // RelativeJoint2D
      j = new pl.MotorJoint({ bodyA: A, bodyB: B, collideConnected: collide, maxForce: p[0], maxTorque: p[1], correctionFactor: p[2], linearOffset: Vec2(p[3], p[4]), angularOffset: p[5] });
      break;
    case 7: // FrictionJoint2D
      j = new pl.FrictionJoint({ ...base, maxForce: p[0], maxTorque: p[1] });
      break;
    case 8: // TargetJoint2D: a mouse joint from the ground, grabbed at the anchor
      j = new pl.MouseJoint({ bodyA: A, bodyB: B, collideConnected: false, target: Vec2(bx, by), maxForce: p[2], frequencyHz: p[3], dampingRatio: p[4] });
      j.setTarget(Vec2(p[0], p[1]));
      break;
  }
  return j ? world.createJoint(j) : null;
}
function updateJoint(J, p) {
  const j = J.joint;
  switch (J.kind) {
    case 0: j.enableMotor(p[1] !== 0); j.setMotorSpeed(p[2]); j.setMaxMotorTorque(p[3]); j.enableLimit(p[4] !== 0); j.setLimits(Math.min(p[5], p[6]), Math.max(p[5], p[6])); break;
    case 1: if (j.setLength) j.setLength(Math.max(p[0], 0.005)); else if (j.setMaxLength) j.setMaxLength(Math.max(p[0], 0.005)); break;
    case 2: j.setLength(Math.max(p[0], 0.005)); j.setFrequency(p[1]); j.setDampingRatio(p[2]); break;
    case 3: j.setFrequency(p[0]); j.setDampingRatio(p[1]); break;
    case 4: j.enableMotor(p[1] !== 0); j.setMotorSpeed(p[2]); j.setMaxMotorForce(p[3]); j.enableLimit(p[4] !== 0); j.setLimits(Math.min(p[5], p[6]), Math.max(p[5], p[6])); break;
    case 5: j.setSpringFrequencyHz(p[1]); j.setSpringDampingRatio(p[2]); j.enableMotor(p[3] !== 0); j.setMotorSpeed(p[4]); j.setMaxMotorTorque(p[5]); break;
    case 6: j.setMaxForce(p[0]); j.setMaxTorque(p[1]); j.setCorrectionFactor(p[2]); j.setLinearOffset(Vec2(p[3], p[4])); j.setAngularOffset(p[5]); break;
    case 7: j.setMaxForce(p[0]); j.setMaxTorque(p[1]); break;
    case 8: j.setTarget(Vec2(p[0], p[1])); j.setMaxForce(p[2]); j.setFrequency(p[3]); j.setDampingRatio(p[4]); break;
  }
  j.getBodyA().setAwake(true); j.getBodyB().setAwake(true);
}

function removeColliderNow(id) {
  const c = colliders.get(id); if (!c) return;
  for (const f of c.fixtures) { try { c.bodyRef.body.destroyFixture(f); } catch (e) { } }
  colliders.delete(id);
  for (const [k, rec] of touching) if (rec.a === id || rec.b === id) { pendingExits.push(rec); touching.delete(k); }
  if (bodies.has(c.body)) applyMass(c.bodyRef);
}

function step(dt) {
  stepNo++;
  applyFieldEffectors(dt);
  // MovePosition / MoveRotation: reach the target over this step
  const restore = [];
  for (const b of bodies.values()) {
    if (!b.move) continue;
    const body = b.body, p = body.getPosition(), a = body.getAngle();
    const tx = b.move[0], ty = b.move[1], ta = b.move[2];
    const lv = body.getLinearVelocity(), av = body.getAngularVelocity();
    let da = ta - a; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    body.setLinearVelocity(Vec2((tx - p.x) / dt, (ty - p.y) / dt));
    body.setAngularVelocity(da / dt);
    body.setAwake(true);
    restore.push([b, lv.x, lv.y, av]);
    b.move = null;
  }
  const frozen = [];
  for (const b of bodies.values()) if (b.constraints & 3) { const p = b.body.getPosition(); frozen.push([b, p.x, p.y]); }
  world.step(dt, velIt, posIt);
  for (const [b, x, y] of frozen) {
    const body = b.body, p = body.getPosition(), v = body.getLinearVelocity();
    const nx = b.constraints & 1 ? x : p.x, ny = b.constraints & 2 ? y : p.y;
    if (nx !== p.x || ny !== p.y) body.setPosition(Vec2(nx, ny));
    body.setLinearVelocity(Vec2(b.constraints & 1 ? 0 : v.x, b.constraints & 2 ? 0 : v.y));
  }
  for (const [b, vx, vy, w] of restore) {
    // a kinematic body stops after its move; a dynamic one keeps the velocity the move gave it, like Unity
    if (b.body.isKinematic()) { b.body.setLinearVelocity(Vec2(0, 0)); b.body.setAngularVelocity(0); }
  }

  const out = [];
  // bodies
  let nb = 0; const bi = out.length; out.push(0);
  for (const [id, b] of bodies) {
    const body = b.body; if (body.isStatic() && !b.reportStatic) continue;
    const p = body.getPosition(), v = body.getLinearVelocity(), wc = body.getWorldCenter(), lc = body.getLocalCenter();
    const m = body.getMass(), Io = body.getInertia();
    out.push(id, p.x, p.y, body.getAngle(), v.x, v.y, body.getAngularVelocity(), body.isAwake() ? 1 : 0, wc.x, wc.y, m, Math.max(0, Io - m * (lc.x * lc.x + lc.y * lc.y)), lc.x, lc.y);
    nb++;
  }
  out[bi] = nb;
  // contacts: Unity reports Enter / Stay / Exit per collider pair
  const now = new Map();
  for (let c = world.getContactList(); c; c = c.getNext()) {
    if (!c.isTouching()) continue;
    const fa = c.getFixtureA(), fb = c.getFixtureB();
    const A = fa.getUserData(), B = fb.getUserData();
    if (!A || !B) continue;
    const trig = fa.isSensor() || fb.isSensor();
    if (!trig && (c._oneWayOff || !c.isEnabled())) continue;
    const k = pairKey(A.id, B.id);
    let rec = now.get(k);
    if (!rec) { rec = { a: Math.min(A.id, B.id), b: Math.max(A.id, B.id), trig, pts: [], n: [0, 0], rv: [0, 0] }; now.set(k, rec); }
    if (trig) continue;
    const wm = c.getWorldManifold(null);
    const flip = A.id !== rec.a;
    const nx = flip ? -wm.normal.x : wm.normal.x, ny = flip ? -wm.normal.y : wm.normal.y;
    rec.n = [nx, ny];
    if (c._rv) rec.rv = flip ? [-c._rv[0], -c._rv[1]] : c._rv;
    const np = c.getManifold().pointCount;
    for (let m = 0; m < np; m++) {
      const pt = wm.points[m];
      const ni = c._impStep === stepNo && c._imp ? c._imp[m] || 0 : 0, ti = c._impStep === stepNo && c._timp ? c._timp[m] || 0 : 0;
      rec.pts.push(pt.x, pt.y, wm.separations[m] || 0, ni, ti);
    }
  }
  const contacts = [], triggers = [];
  const emit = (rec, kind) => {
    if (rec.trig) { triggers.push(rec.a, rec.b, kind); return; }
    const pts = kind === 2 ? [] : rec.pts;
    contacts.push(rec.a, rec.b, kind, pts.length / 5, rec.n[0], rec.n[1], rec.rv[0], rec.rv[1], ...pts);
  };
  for (const [k, rec] of now) emit(rec, touching.has(k) ? 1 : 0);
  for (const [k, rec] of touching) if (!now.has(k)) emit(rec, 2);
  for (const rec of pendingExits) emit(rec, 2);
  pendingExits.length = 0;
  touching = now;
  let nc = 0; for (let i = 0; i < contacts.length; nc++) i += 8 + contacts[i + 3] * 5;
  out.push(nc, ...contacts);
  out.push(triggers.length / 3, ...triggers);
  // joints: reaction force/torque (Joint2D.reactionForce, breaking) and the hinge/slider readouts
  out.push(joints.size);
  const inv = dt > 0 ? 1 / dt : 0;
  for (const [id, J] of joints) {
    const j = J.joint, f = j.getReactionForce(inv), t = j.getReactionTorque(inv);
    let a = 0, as = 0, tr = 0, ts = 0;
    if (J.kind === 0) { a = j.getJointAngle(); as = j.getJointSpeed(); }
    else if (J.kind === 4 || J.kind === 5) { tr = j.getJointTranslation(); ts = j.getJointSpeed ? j.getJointSpeed() : 0; if (J.kind === 5) { as = j.getBodyB().getAngularVelocity() - j.getBodyA().getAngularVelocity(); } }
    out.push(id, f.x, f.y, t, a, as, tr, ts);
  }
  return out;
}

// ---------------- queries ----------------
function passes(C, mask, triggers) { return C && (mask & (1 << C.layer)) !== 0 && (triggers || !C.trigger); }
function rayAll(ox, oy, dx, dy, dist, mask, triggers, startIn) {
  const hits = [];
  const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
  const far = Math.min(dist, 1e6);
  const p1 = Vec2(ox, oy), p2 = Vec2(ox + dx * far, oy + dy * far);
  const seen = new Set();
  if (startIn) {
    // Unity (queriesStartInColliders): a ray that starts inside a collider hits it at distance 0
    world.queryAABB(new AABB(Vec2(ox - 1e-4, oy - 1e-4), Vec2(ox + 1e-4, oy + 1e-4)), f => {
      const C = f.getUserData();
      if (passes(C, mask, triggers) && !seen.has(C.id) && f.testPoint(p1)) { seen.add(C.id); hits.push([C.id, ox, oy, -dx, -dy, 0]); }
      return true;
    });
  }
  if (far > 0) world.rayCast(p1, p2, (f, point, normal, fraction) => {
    const C = f.getUserData();
    if (!passes(C, mask, triggers)) return -1;
    if (seen.has(C.id)) { const h = hits.find(x => x[0] === C.id); if (h && fraction * far < h[5]) { h[1] = point.x; h[2] = point.y; h[3] = normal.x; h[4] = normal.y; h[5] = fraction * far; } return 1; }
    seen.add(C.id); hits.push([C.id, point.x, point.y, normal.x, normal.y, fraction * far]);
    return 1;
  });
  hits.sort((a, b) => a[5] - b[5]);
  return hits;
}
function castShapes(kind, d) {
  // the shape being cast, in world space at its start pose
  if (kind === 0) return [new Circle(Vec2(d[0], d[1]), Math.max(d[2], 1e-4))];
  if (kind === 1) return [new Box(Math.max(d[2] / 2, 1e-4), Math.max(d[3] / 2, 1e-4), Vec2(d[0], d[1]), d[4] * DEG)];
  if (kind === 2) return buildShapes(2, [d[0], d[1], d[4] * DEG, d[2], d[3], d[5]]);
  if (kind === 3) return [new Polygon([Vec2(d[0], d[1]), Vec2(d[2], d[1]), Vec2(d[2], d[3]), Vec2(d[0], d[3])])];
  return [];
}
const IDENT = Transform.identity();
function shapesAABB(shapes) {
  const box = new AABB(); let first = true;
  for (const s of shapes) for (let i = 0; i < s.getChildCount(); i++) { const a = new AABB(); s.computeAABB(a, IDENT, i); if (first) { box.set(a); first = false; } else box.combine(box, a); }
  return box;
}
function overlapShapes(shapes, mask, triggers) {
  const box = shapesAABB(shapes); const found = new Set(); const res = [];
  world.queryAABB(box, f => {
    const C = f.getUserData();
    if (!passes(C, mask, triggers) || found.has(C.id)) return true;
    const sh = f.getShape(), xf = f.getBody().getTransform();
    for (const s of shapes) for (let i = 0; i < s.getChildCount(); i++) for (let k = 0; k < sh.getChildCount(); k++)
      if (testOverlap(s, i, sh, k, IDENT, xf)) { found.add(C.id); res.push(C.id); return true; }
    return true;
  });
  return res;
}
function shapeCastAll(shapes, dx, dy, dist, mask, triggers, startIn) {
  const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
  const far = Math.min(dist, 1e5);
  const box = shapesAABB(shapes);
  const swept = new AABB(Vec2(Math.min(box.lowerBound.x, box.lowerBound.x + dx * far), Math.min(box.lowerBound.y, box.lowerBound.y + dy * far)), Vec2(Math.max(box.upperBound.x, box.upperBound.x + dx * far), Math.max(box.upperBound.y, box.upperBound.y + dy * far)));
  const best = new Map();
  const input = new ShapeCastInput(), output = new ShapeCastOutput();
  world.queryAABB(swept, f => {
    const C = f.getUserData();
    if (!passes(C, mask, triggers)) return true;
    const sh = f.getShape(), xf = f.getBody().getTransform();
    for (const s of shapes) for (let i = 0; i < s.getChildCount(); i++) for (let k = 0; k < sh.getChildCount(); k++) {
      if (testOverlap(s, i, sh, k, IDENT, xf)) {
        if (!startIn) continue;
        const h = best.get(C.id); if (!h || h[5] > 0) best.set(C.id, [C.id, 0, 0, -dx, -dy, 0, true, sh, k, xf]);
        continue;
      }
      input.proxyA.set(sh, k); input.proxyB.set(s, i);
      input.transformA.set(xf); input.transformB.set(IDENT);
      input.translationB.setNum(dx * far, dy * far);
      if (ShapeCast(output, input)) {
        const dd = output.lambda * far;
        const h = best.get(C.id);
        if (!h || dd < h[5]) best.set(C.id, [C.id, output.point.x, output.point.y, output.normal.x, output.normal.y, dd]);
      }
    }
    return true;
  });
  const hits = [...best.values()];
  // initial overlaps: report the closest point on the hit collider to the shape's centre
  for (const h of hits) if (h[6]) {
    const c = shapesAABB(shapes).getCenter(); const cp = closestOnFixture(h[7], h[8], h[9], c.x, c.y);
    h[1] = cp[0]; h[2] = cp[1]; h.length = 6;
  }
  hits.sort((a, b) => a[5] - b[5]);
  return hits;
}
function closestOnFixture(sh, child, xf, x, y) {
  const input = new DistanceInput(), output = new DistanceOutput(), cache = new SimplexCache();
  const pt = new Circle(Vec2(x, y), 0);
  input.proxyA.set(sh, child); input.proxyB.set(pt, 0);
  input.transformA.set(xf); input.transformB.set(IDENT); input.useRadii = true;
  Distance(output, cache, input);
  return [output.pointA.x, output.pointA.y, output.distance];
}
function colliderDistance(A, B) {
  // ColliderDistance2D: closest points between two colliders (negative distance when they overlap)
  let best = null;
  for (const fa of A.fixtures) for (const fb of B.fixtures) {
    const sa = fa.getShape(), sb = fb.getShape(), xa = fa.getBody().getTransform(), xb = fb.getBody().getTransform();
    for (let i = 0; i < sa.getChildCount(); i++) for (let k = 0; k < sb.getChildCount(); k++) {
      const input = new DistanceInput(), output = new DistanceOutput(), cache = new SimplexCache();
      input.proxyA.set(sa, i); input.proxyB.set(sb, k); input.transformA.set(xa); input.transformB.set(xb); input.useRadii = true;
      Distance(output, cache, input);
      let dist = output.distance;
      const overl = testOverlap(sa, i, sb, k, xa, xb);
      if (overl) dist = -Math.max(estimatePenetration(sa, i, xa, sb, k, xb), 0);
      if (!best || dist < best[4]) best = [output.pointA.x, output.pointA.y, output.pointB.x, output.pointB.y, dist];
    }
  }
  if (!best) return [0, 0, 0, 0, 0, 0, 0, 0];
  let nx = best[2] - best[0], ny = best[3] - best[1]; const l = Math.hypot(nx, ny);
  if (l > 1e-9) { nx /= l; ny /= l; if (best[4] < 0) { nx = -nx; ny = -ny; } } else {
    const ca = A.bodyRef.body.getWorldCenter(), cb = B.bodyRef.body.getWorldCenter(); nx = cb.x - ca.x; ny = cb.y - ca.y; const m = Math.hypot(nx, ny) || 1; nx /= m; ny /= m;
  }
  return [1, best[0], best[1], best[2], best[3], nx, ny, best[4]];
}
function estimatePenetration(sa, i, xa, sb, k, xb) {
  // overlapping shapes: use a manifold-free estimate from the AABB intersection
  const a = new AABB(), b = new AABB(); sa.computeAABB(a, xa, i); sb.computeAABB(b, xb, k);
  return Math.min(a.upperBound.x - b.lowerBound.x, b.upperBound.x - a.lowerBound.x, a.upperBound.y - b.lowerBound.y, b.upperBound.y - a.lowerBound.y);
}

// ---------------- the one entry point ----------------
export function exec(cmd) {
  const d = cmd; let i = 0; const out = [];
  while (i < d.length) {
    const op = d[i++];
    switch (op) {
      case 1: newWorld(d[i], d[i + 1]); velIt = d[i + 2] | 0 || 8; posIt = d[i + 3] | 0 || 3; bounceThreshold = d[i + 4]; pl.Settings.velocityThreshold = bounceThreshold; i += 5; break;
      case 2: world.setGravity(Vec2(d[i], d[i + 1])); velIt = d[i + 2] | 0 || 8; posIt = d[i + 3] | 0 || 3; pl.Settings.velocityThreshold = d[i + 4]; i += 5; break;
      case 10: { // createBody id type x y angle props...
        const id = d[i]; const type = TYPES[d[i + 1] | 0] || 'dynamic';
        const body = world.createBody({ type, position: Vec2(d[i + 2], d[i + 3]), angle: d[i + 4], awake: d[i + 5] !== 2 });
        const b = { id, body, constraints: 0, autoMass: false, mass: 1, hasCom: false, com: [0, 0], hasI: false, inertia: 1, move: null, reportStatic: d[i + 6] !== 0 };
        body.setUserData(b);
        bodies.set(id, b); i += 7;
        setBodyProps(b, d, i); i += BODY_PROPS;
        break;
      }
      case 11: { const b = bodies.get(d[i++]); if (b) { for (const [cid, c] of colliders) if (c.bodyRef === b) removeColliderNow(cid); for (const [jid, J] of joints) if (J.joint.getBodyA() === b.body || J.joint.getBodyB() === b.body) joints.delete(jid); world.destroyBody(b.body); bodies.delete(b.id); } break; }
      case 12: { const b = bodies.get(d[i]); i++; if (b) setBodyProps(b, d, i); i += BODY_PROPS; break; }
      case 13: { const b = bodies.get(d[i]); if (b) { b.body.setTransform(Vec2(d[i + 1], d[i + 2]), d[i + 3]); b.body.setAwake(true); } i += 4; break; }
      case 14: { const b = bodies.get(d[i]); if (b) { b.body.setLinearVelocity(Vec2(d[i + 1], d[i + 2])); if (d[i + 1] || d[i + 2]) b.body.setAwake(true); } i += 3; break; }
      case 15: { const b = bodies.get(d[i]); if (b) { b.body.setAngularVelocity(d[i + 1]); if (d[i + 1]) b.body.setAwake(true); } i += 2; break; }
      case 16: { const b = bodies.get(d[i]); if (b) b.body.applyLinearImpulse(Vec2(d[i + 1], d[i + 2]), isNaN(d[i + 3]) ? b.body.getWorldCenter() : Vec2(d[i + 3], d[i + 4]), true); i += 5; break; }
      case 17: { const b = bodies.get(d[i]); if (b) b.body.applyForce(Vec2(d[i + 1], d[i + 2]), isNaN(d[i + 3]) ? b.body.getWorldCenter() : Vec2(d[i + 3], d[i + 4]), true); i += 5; break; }
      case 18: { const b = bodies.get(d[i]); if (b) b.body.applyTorque(d[i + 1], true); i += 2; break; }
      case 19: { const b = bodies.get(d[i]); if (b) b.body.applyAngularImpulse(d[i + 1], true); i += 2; break; }
      case 21: { const b = bodies.get(d[i]); if (b) b.move = [d[i + 1], d[i + 2], d[i + 3]]; i += 4; break; }
      case 22: { const b = bodies.get(d[i]); if (b) b.body.setAwake(true); i += 1; break; }
      case 23: { const b = bodies.get(d[i]); if (b) b.body.setAwake(false); i += 1; break; }
      case 30: { // createCollider id body kind layer trigger friction bounce density n data...
        const id = d[i], bid = d[i + 1], kind = d[i + 2] | 0, layer = d[i + 3] & 31, trigger = d[i + 4] !== 0, fr = d[i + 5], bo = d[i + 6], dens = d[i + 7], n = d[i + 8] | 0;
        const data = d.slice(i + 9, i + 9 + n); i += 9 + n;
        const b = bodies.get(bid); if (!b) break;
        const C = { id, body: bid, bodyRef: b, fixtures: [], layer, trigger, effector: null };
        for (const s of buildShapes(kind, data)) {
          try { C.fixtures.push(b.body.createFixture(s, { density: Math.max(dens, 0), friction: fr, restitution: bo, isSensor: trigger, userData: C })); } catch (e) { }
        }
        colliders.set(id, C);
        applyMass(b);
        break;
      }
      case 31: removeColliderNow(d[i++]); break;
      case 32: { // setEffector colliderId type useMask mask params(10)
        const C = colliders.get(d[i]); const type = d[i + 1] | 0; const p = d.slice(i + 4, i + 14);
        if (C) {
          if (type === 0) C.effector = null;
          else {
            const e = { type, useMask: d[i + 2] !== 0, mask: d[i + 3] | 0 };
            if (type === 1) Object.assign(e, { oneWay: p[0] !== 0, arc: p[1], rotOffset: p[2], sideFriction: p[3] !== 0, sideBounce: p[4] !== 0, sideArc: p[5] });
            else if (type === 2) Object.assign(e, { speed: p[0], speedVar: p[1], useFriction: p[2] !== 0, useBounce: p[3] !== 0 });
            else if (type === 3) Object.assign(e, { angle: p[0], global: p[1] !== 0, mag: p[2], magVar: p[3], target: p[4] | 0, drag: p[5], angDrag: p[6], localAngle: p[7] });
            else if (type === 4) Object.assign(e, { mag: p[0], magVar: p[1], distScale: p[2], source: p[3] | 0, target: p[4] | 0, mode: p[5] | 0, drag: p[6], angDrag: p[7] });
            C.effector = e;
          }
        }
        i += 14; break;
      }
      case 40: { // createJoint id kind bodyA bodyB collide ax ay bx by n params...
        const id = d[i], kind = d[i + 1] | 0; const A = d[i + 2] < 0 ? ground : bodies.get(d[i + 2])?.body, B = d[i + 3] < 0 ? ground : bodies.get(d[i + 3])?.body;
        const collide = d[i + 4] !== 0, ax = d[i + 5], ay = d[i + 6], bx = d[i + 7], by = d[i + 8], n = d[i + 9] | 0;
        const p = d.slice(i + 10, i + 10 + n); i += 10 + n;
        if (!A || !B || A === B) break;
        const j = makeJoint(kind, A, B, ax, ay, bx, by, collide, p);
        if (j) joints.set(id, { joint: j, kind });
        break;
      }
      case 41: { const J = joints.get(d[i++]); if (J) { try { world.destroyJoint(J.joint); } catch (e) { } joints.delete(d[i - 1]); } break; }
      case 42: { const J = joints.get(d[i]); const n = d[i + 1] | 0; const p = d.slice(i + 2, i + 2 + n); i += 2 + n; if (J) updateJoint(J, p); break; }
      case 50: { for (let k = 0; k < 32; k++) layerMask[k] = d[i + k] | 0; i += 32; for (const C of colliders.values()) for (const f of C.fixtures) f.refilter(); break; }
      case 51: { const k = pairKey(d[i], d[i + 1]); if (d[i + 2]) ignore.add(k); else ignore.delete(k); i += 3; const C = colliders.get(d[i - 3]); if (C) for (const f of C.fixtures) f.refilter(); break; }
      case 60: { const r = step(d[i++]); out.push(...r); break; }
      // queries: results are [count, ...hits]; a hit is [collider, px, py, nx, ny, distance]
      case 70: { const h = rayAll(d[i], d[i + 1], d[i + 2], d[i + 3], d[i + 4], d[i + 5] | 0, d[i + 6] !== 0, d[i + 7] !== 0); i += 8; out.push(h.length); for (const x of h) out.push(...x); break; }
      case 71: { // shapeCast kind data(6) dx dy dist mask triggers startIn
        const sh = castShapes(d[i] | 0, d.slice(i + 1, i + 7)); const h = shapeCastAll(sh, d[i + 7], d[i + 8], d[i + 9], d[i + 10] | 0, d[i + 11] !== 0, d[i + 12] !== 0); i += 13;
        out.push(h.length); for (const x of h) out.push(...x); break;
      }
      case 72: { // overlap kind data(6) mask triggers
        const sh = castShapes(d[i] | 0, d.slice(i + 1, i + 7)); const r = overlapShapes(sh, d[i + 7] | 0, d[i + 8] !== 0); i += 9; out.push(r.length, ...r); break;
      }
      case 73: { // overlapPoint x y mask triggers
        const pt = Vec2(d[i], d[i + 1]); const mask = d[i + 2] | 0, trig = d[i + 3] !== 0; i += 4; const r = new Set();
        world.queryAABB(new AABB(Vec2(pt.x - 1e-4, pt.y - 1e-4), Vec2(pt.x + 1e-4, pt.y + 1e-4)), f => { const C = f.getUserData(); if (passes(C, mask, trig) && f.testPoint(pt)) r.add(C.id); return true; });
        out.push(r.size, ...r); break;
      }
      case 74: { const A = colliders.get(d[i]), B = colliders.get(d[i + 1]); i += 2; out.push(...(A && B ? colliderDistance(A, B) : [0, 0, 0, 0, 0, 0, 0, 0])); break; }
      case 75: { // closestPoint collider x y
        const C = colliders.get(d[i]); const x = d[i + 1], y = d[i + 2]; i += 3; let best = null;
        if (C) for (const f of C.fixtures) for (let k = 0; k < f.getShape().getChildCount(); k++) {
          if (f.testPoint(Vec2(x, y))) { best = [x, y, 0]; break; }
          const r = closestOnFixture(f.getShape(), k, f.getBody().getTransform(), x, y); if (!best || r[2] < best[2]) best = r;
        }
        out.push(...(best || [x, y, 0]).slice(0, 2)); break;
      }
      case 76: { // collider world AABB (Collider2D.bounds)
        const C = colliders.get(d[i++]); const box = new AABB(); let first = true;
        if (C) for (const f of C.fixtures) for (let k = 0; k < f.getShape().getChildCount(); k++) { const a = f.getAABB(k); if (first) { box.set(a); first = false; } else box.combine(box, a); }
        if (first) out.push(0, 0, 0, 0, 0); else out.push(1, box.lowerBound.x, box.lowerBound.y, box.upperBound.x, box.upperBound.y);
        break;
      }
      default: console.warn('physics2d: unknown op', op); return out;
    }
  }
  return out;
}
export const physics2dImports = { exec };
export function physics2dDebug() {
  const t = []; for (const [k, r] of touching) t.push(k + (r.trig ? 'T' : ''));
  const cs = []; for (const [id, c] of colliders) cs.push(id + ':' + c.body + ':' + c.fixtures.length);
  return { touching: t, colliders: cs, bodies: [...bodies.keys()] };
}
