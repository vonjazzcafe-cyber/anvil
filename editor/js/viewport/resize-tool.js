// Resize tool (T): a handle on each of the six sides of the selected object. Drag one and that side moves while
// the opposite side stays where it is, so a cube stretches in one direction like pulling out a drawer.
// It changes the object's Scale on that axis and moves its Position to keep the far side fixed.
import * as THREE from 'three';
import { editor } from '../core/scene.js';
import { round } from '../core/math.js';

const AXIS_COLORS = [0xe64545, 0x5fd35f, 0x4a7fe6];
const HOVER = 0xffd34d;

export class ResizeTool {
  constructor(viewport) {
    this.vp = viewport;
    this.group = new THREE.Group(); this.group.renderOrder = 20;
    this.group.visible = false;
    this.handles = [];
    const geo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 6; i++) {
      const axis = i >> 1, sign = i & 1 ? -1 : 1;
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: AXIS_COLORS[axis], depthTest: false, transparent: true, opacity: 0.95 }));
      m.renderOrder = 21; m.userData = { axis, sign };
      this.handles.push(m); this.group.add(m);
    }
    this.box = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.6 }));
    this.box.renderOrder = 20; this.box.matrixAutoUpdate = false;
    this.group.add(this.box);
    this.ray = new THREE.Raycaster();
    this.active = false; this.drag = null; this.hover = null;
    const c = viewport.canvas;
    // capture phase: a click on a handle must not also orbit the camera or select something else
    c.addEventListener('pointerdown', (e) => this.down(e), true);
    window.addEventListener('pointermove', (e) => this.move(e));
    window.addEventListener('pointerup', (e) => this.up(e));
  }
  setActive(on) { this.active = on; if (!on) { this.group.visible = false; this.setHover(null); } }

  target() {
    if (!this.active || editor.playing || this.vp.mode !== 'scene' || editor.selected == null) return null;
    const n = this.vp.nodes.get(editor.selected);
    const t = n && (n.mesh || n.sprite);
    if (!t || !t.visible || !t.geometry) return null;
    if (!t.geometry.boundingBox) t.geometry.computeBoundingBox();
    return { n, t, bb: t.geometry.boundingBox };
  }
  // place the handles on the side centres every frame (they keep the same size on screen)
  update(cam) {
    const T = this.target();
    this.group.visible = !!T;
    if (!T) return;
    const { t, bb } = T;
    t.updateWorldMatrix(true, false);
    const M = t.matrixWorld;
    const ctr = bb.getCenter(new THREE.Vector3()), size = bb.getSize(new THREE.Vector3());
    // outline of the object's box
    this.box.matrix.copy(M).multiply(new THREE.Matrix4().compose(ctr, new THREE.Quaternion(), new THREE.Vector3(Math.max(size.x, 1e-4), Math.max(size.y, 1e-4), Math.max(size.z, 1e-4))));
    this.box.matrixWorldNeedsUpdate = true;
    const q = new THREE.Quaternion(); M.decompose(new THREE.Vector3(), q, new THREE.Vector3());
    for (const h of this.handles) {
      const { axis, sign } = h.userData;
      const p = ctr.clone(); p.setComponent(axis, sign > 0 ? bb.max.getComponent(axis) : bb.min.getComponent(axis));
      p.applyMatrix4(M);
      h.position.copy(p); h.quaternion.copy(q);
      const s = cam.position.distanceTo(p) * 0.024;
      h.scale.setScalar(s);
    }
  }
  pick(e) {
    if (!this.group.visible) return null;
    const r = this.vp.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.vp.sceneCam);
    // a little forgiving: test slightly bigger handles
    let best = null;
    for (const h of this.handles) {
      const s = h.scale.x * 1.6, box = new THREE.Box3().setFromCenterAndSize(h.position, new THREE.Vector3(s, s, s));
      const hit = this.ray.ray.intersectBox(box, new THREE.Vector3());
      if (hit) { const d = hit.distanceTo(this.ray.ray.origin); if (!best || d < best.d) best = { h, d }; }
    }
    return best ? best.h : null;
  }
  setHover(h) {
    if (this.hover === h) return;
    if (this.hover) this.hover.material.color.setHex(AXIS_COLORS[this.hover.userData.axis]);
    this.hover = h;
    if (h) h.material.color.setHex(HOVER);
    this.vp.canvas.style.cursor = h ? 'grab' : '';
    this.vp.needsRender = true;
  }
  // where along the side's line the mouse ray passes closest
  lineParam(e, A, dir) {
    const r = this.vp.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.vp.sceneCam);
    const O = this.ray.ray.origin, D = this.ray.ray.direction;
    const w0 = A.clone().sub(O), b = dir.dot(D), d = dir.dot(w0), ee = D.dot(w0);
    const denom = 1 - b * b;
    if (denom < 1e-5) return null;   // dragging straight towards the camera
    return (b * ee - d) / denom;
  }
  down(e) {
    if (e.button !== 0 || e.altKey) return;
    const T = this.target(); if (!T) return;
    const h = this.pick(e); if (!h) return;
    e.stopImmediatePropagation(); e.preventDefault();
    const { n, t, bb } = T;
    const o = editor.get(editor.selected); if (!o) return;
    const { axis, sign } = h.userData;
    t.updateWorldMatrix(true, false);
    const col = new THREE.Vector3().setFromMatrixColumn(t.matrixWorld, axis);
    const a = col.length(); if (a < 1e-9) return;
    const unit = col.clone().divideScalar(a);
    const lo = bb.min.getComponent(axis), hi = bb.max.getComponent(axis);
    const P = new THREE.Vector3(); n.group.getWorldPosition(P);
    this.drag = {
      id: o.id, axis, sign, a, unit, dir: unit.clone().multiplyScalar(sign), lo, hi,
      L: (hi - lo) * a, fixedU: sign > 0 ? lo : hi, s0: o.s.slice(), P, face: h.position.clone(),
    };
    this.drag.t0 = this.lineParam(e, this.drag.face, this.drag.dir) ?? 0;
    this.vp.dragging = true;
    this.vp.canvas.setPointerCapture?.(e.pointerId);
    this.vp.canvas.style.cursor = 'grabbing';
  }
  move(e) {
    if (!this.drag) { if (this.active && !e.buttons) this.setHover(this.pick(e)); return; }
    const D = this.drag;
    const t = this.lineParam(e, D.face, D.dir); if (t == null) return;
    let L2 = Math.max(D.L * 0.01, 0.001, D.L + (t - D.t0));
    if (this.vp.snap) L2 = Math.max(0.25, Math.round(L2 / 0.25) * 0.25);
    const f = L2 / D.L;
    // keep the far side where it is: the pivot slides by fixedU·a·(1−f) along the axis
    const P2 = D.P.clone().addScaledVector(D.unit, D.fixedU * D.a * (1 - f));
    const n = this.vp.nodes.get(D.id); if (!n) return;
    const parent = n.group.parent;
    const local = parent ? parent.worldToLocal(P2.clone()) : P2;
    const o = editor.get(D.id); if (!o) return;
    const s = D.s0.slice(); s[D.axis] = round(D.s0[D.axis] * f, 4);
    const p = [round(local.x, 4), round(local.y, 4), round(-local.z, 4)];
    editor.change(() => { o.s = s; o.p = p; }, 'Resize', 'resize-' + D.id);
    this.vp.needsRender = true;
  }
  up() {
    if (!this.drag) return;
    this.drag = null;
    this.vp.dragging = false;
    this.vp.canvas.style.cursor = this.hover ? 'grab' : '';
  }
}
