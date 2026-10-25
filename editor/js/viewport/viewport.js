// Anvil — 3D viewport (three.js): Scene view (editor camera, gizmos) and Game view (the scene's camera).
import * as THREE from 'three';
import { TransformControls } from 'three';
import { bus } from '../core/events.js';
import { editor } from '../core/scene.js';
import { project } from '../core/project.js';
import { toThreePos, toThreeQuat, fromThreePos, fromThreeQuat, unityMatrixToThree, quatToEulerNear, round } from '../core/math.js';

const ORANGE = 0xf5a623, CHILD_BLUE = 0x6fb4ff, COLLIDER_GREEN = 0x8dff8d, JOINT_ORANGE = 0xffa040;

// ---------- shared resources ----------
const geoCache = {};
function geometry(kind) {
  if (geoCache[kind]) return geoCache[kind];
  let g;
  switch (kind) {
    case 'Sphere': g = new THREE.SphereGeometry(0.5, 32, 18); break;
    case 'Capsule': g = new THREE.CapsuleGeometry(0.5, 1, 8, 24); break;
    case 'Cylinder': g = new THREE.CylinderGeometry(0.5, 0.5, 2, 32); break;
    case 'Plane': g = new THREE.PlaneGeometry(10, 10, 1, 1); g.rotateX(-Math.PI / 2); break;
    case 'Quad': g = new THREE.PlaneGeometry(1, 1); break;
    default: g = new THREE.BoxGeometry(1, 1, 1);
  }
  geoCache[kind] = g;
  return g;
}
const MESH_BY_CODE = [null, 'Cube', 'Sphere', 'Capsule', 'Cylinder', 'Plane', 'Quad'];
const edgeCache = new Map();
function edges(kind) { if (!edgeCache.has(kind)) edgeCache.set(kind, new THREE.EdgesGeometry(geometry(kind), 25)); return edgeCache.get(kind); }
const matCache = new Map();
function material(color, metallic = 0, smoothness = 0.5) {
  const c = color || [1, 1, 1, 1];
  const key = c.map(v => Math.round(v * 255)).join(',') + '|' + metallic.toFixed(2) + '|' + smoothness.toFixed(2);
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace), metalness: metallic, roughness: Math.min(1, Math.max(0.05, 1 - smoothness * 0.85)) });
    if (c[3] < 0.999) { m.transparent = true; m.opacity = c[3]; m.depthWrite = false; }
    matCache.set(key, m);
  }
  return m;
}
function materialFor(comp) {
  if (comp.material) {
    const f = project.file(comp.material);
    if (f && f.data) return material(f.data.color || [1, 1, 1, 1], f.data.metallic || 0, f.data.smoothness ?? 0.5);
  }
  return material(comp.color || [1, 1, 1, 1]);
}

function makeSky() {
  const g = new THREE.SphereGeometry(4000, 32, 16);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false,
    uniforms: { top: { value: new THREE.Color(0x5a8ccf) }, horizon: { value: new THREE.Color(0xc2cfdc) }, bottom: { value: new THREE.Color(0x3d3a37) } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }',
    fragmentShader: 'uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; varying vec3 vDir; void main(){ float y = vDir.y; vec3 c = y > 0.0 ? mix(horizon, top, pow(min(1.0, y * 1.6), 0.7)) : mix(horizon, bottom, min(1.0, -y * 6.0)); gl_FragColor = vec4(c, 1.0);\n#include <colorspace_fragment>\n}',
  });
  const s = new THREE.Mesh(g, m);
  s.renderOrder = -1000; s.frustumCulled = false;
  return s;
}

function makeGrid() {
  const group = new THREE.Group();
  const mk = (size, step, color, opacity) => {
    const pts = [];
    for (let i = -size; i <= size; i += step) { pts.push(-size, 0, i, size, 0, i, i, 0, -size, i, 0, size); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
    return new THREE.LineSegments(g, m);
  };
  group.add(mk(100, 1, 0x9a9a9a, 0.22));
  group.add(mk(100, 10, 0xbbbbbb, 0.35));
  return group;
}

// ---------- scene camera controller (Unity controls) ----------
class SceneCamera {
  constructor(camera, dom) {
    this.camera = camera; this.dom = dom;
    this.pivot = new THREE.Vector3(0, 0, 0);
    this.yaw = Math.PI * 0.25 + Math.PI; this.pitch = -0.38; this.distance = 12;
    this.flySpeed = 6; this.keys = new Set(); this.mode = null; this.last = null;
    this.ortho2D = false;
    this.update();
    dom.addEventListener('contextmenu', e => e.preventDefault());
    dom.addEventListener('pointerdown', e => this.down(e));
    window.addEventListener('pointermove', e => this.move(e));
    window.addEventListener('pointerup', e => this.up(e));
    dom.addEventListener('wheel', e => this.wheel(e), { passive: false });
    window.addEventListener('keydown', e => { if (this.mode === 'fly') { this.keys.add(e.code); e.preventDefault(); } });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
  }
  forward() { return new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch)); }
  update() {
    const f = this.forward();
    this.camera.position.copy(this.pivot).addScaledVector(f, -this.distance);
    this.camera.lookAt(this.pivot);
    this.camera.updateMatrixWorld();
    bus.emit('scene-camera-moved');
  }
  down(e) {
    if (e.button === 2) { this.mode = e.altKey ? 'zoom' : 'fly'; }
    else if (e.button === 1) { this.mode = 'pan'; e.preventDefault(); }
    else if (e.button === 0 && e.altKey) { this.mode = 'orbit'; }
    else return;
    this.last = [e.clientX, e.clientY];
    this.dom.setPointerCapture?.(e.pointerId);
    this.flyStart = performance.now();
    if (this.mode === 'fly') this.startFlyLoop();
  }
  move(e) {
    if (!this.mode || !this.last) return;
    const dx = e.clientX - this.last[0], dy = e.clientY - this.last[1];
    this.last = [e.clientX, e.clientY];
    if (this.mode === 'fly') {
      const pos = this.camera.position.clone();
      this.yaw -= dx * 0.0045; this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch - dy * 0.0045));
      this.pivot.copy(pos).addScaledVector(this.forward(), this.distance);
      this.update();
    } else if (this.mode === 'orbit') {
      this.yaw -= dx * 0.006; this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch - dy * 0.006));
      this.update();
    } else if (this.mode === 'pan') {
      const s = this.distance * 0.0018;
      const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
      this.pivot.addScaledVector(right, -dx * s).addScaledVector(up, dy * s);
      this.update();
    } else if (this.mode === 'zoom') {
      this.distance = Math.max(0.05, this.distance * Math.pow(1.01, dx - dy));
      this.update();
    }
  }
  up(e) { if (this.mode) { this.mode = null; this.keys.clear(); } }
  wheel(e) {
    e.preventDefault();
    if (this.mode === 'fly') { this.flySpeed = Math.max(0.5, Math.min(200, this.flySpeed * (e.deltaY < 0 ? 1.2 : 1 / 1.2))); bus.emit('status', `Camera speed ${this.flySpeed.toFixed(1)}`); return; }
    const k = Math.pow(1.0018, e.deltaY);
    this.distance = Math.max(0.05, Math.min(5000, this.distance * k));
    this.update();
  }
  startFlyLoop() {
    let lastT = performance.now();
    const tick = (t) => {
      if (this.mode !== 'fly') return;
      const dt = Math.min(0.05, (t - lastT) / 1000); lastT = t;
      const f = this.forward(), right = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize();
      const v = new THREE.Vector3();
      if (this.keys.has('KeyW')) v.add(f); if (this.keys.has('KeyS')) v.sub(f);
      if (this.keys.has('KeyD')) v.add(right); if (this.keys.has('KeyA')) v.sub(right);
      if (this.keys.has('KeyE')) v.y += 1; if (this.keys.has('KeyQ')) v.y -= 1;
      if (v.lengthSq() > 0) {
        const held = (t - this.flyStart) / 1000;
        const speed = this.flySpeed * (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 4 : 1) * Math.min(4, 1 + held * 0.35);
        v.normalize().multiplyScalar(speed * dt);
        this.pivot.add(v); this.update();
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  frame(center, radius) {
    this.pivot.copy(center);
    const fov = this.camera.fov * Math.PI / 180;
    this.distance = Math.max(0.5, radius / Math.sin(fov / 2) * 1.1);
    this.update();
  }
  lookAlong(dir) {
    // dir in three coords: look along it
    const d = dir.clone().normalize();
    this.pitch = Math.asin(Math.max(-0.999, Math.min(0.999, d.y)));
    if (Math.abs(d.y) < 0.999) this.yaw = Math.atan2(d.x, d.z);
    this.update();
  }
  state() { return { pivot: this.pivot.toArray(), yaw: this.yaw, pitch: this.pitch, distance: this.distance }; }
  setState(s) { if (!s) return; this.pivot.fromArray(s.pivot); this.yaw = s.yaw; this.pitch = s.pitch; this.distance = s.distance; this.update(); }
}

// ---------- viewport ----------
export class Viewport {
  constructor(sceneHost, gameHost) {
    this.sceneHost = sceneHost; this.gameHost = gameHost;
    this.mode = 'scene';
    const quality = project.data?.editor?.quality || 'high';
    this.renderer = new THREE.WebGLRenderer({ antialias: quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1 : 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.tabIndex = 0;
    sceneHost.append(this.canvas);

    this.scene = new THREE.Scene();
    this.sky = makeSky(); this.scene.add(this.sky);
    this.hemi = new THREE.HemisphereLight(0xb7c7dc, 0x4a4540, 0.95); this.scene.add(this.hemi);
    this.grid = makeGrid(); this.scene.add(this.grid);
    this.editRoot = new THREE.Group(); this.scene.add(this.editRoot);
    this.playRoot = new THREE.Group(); this.playRoot.visible = false; this.scene.add(this.playRoot);
    this.helpers = new THREE.Group(); this.scene.add(this.helpers);
    this.debugLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, depthTest: true }));
    this.debugLines.frustumCulled = false; this.scene.add(this.debugLines);

    this.sceneCam = new THREE.PerspectiveCamera(60, 1, 0.03, 5000);
    this.controller = new SceneCamera(this.sceneCam, this.canvas);
    this.gameCam = new THREE.PerspectiveCamera(60, 1, 0.3, 1000);
    this.gameOrtho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.3, 1000);

    this.nodes = new Map();      // edit-mode: id -> node
    this.playNodes = new Map();  // play-mode: id -> node
    this.tool = 'translate';
    this.tc = new TransformControls(this.sceneCam, this.canvas);
    this.tc.setSpace('local');
    this.tc.setSize(0.9);
    this.tcHelper = this.tc.getHelper ? this.tc.getHelper() : this.tc;
    this.scene.add(this.tcHelper);
    this.tc.addEventListener('dragging-changed', (e) => { this.dragging = e.value; if (!e.value) bus.emit('gizmo-drag-end'); });
    this.tc.addEventListener('objectChange', () => this.onGizmoChange());
    this.showGrid = true; this.showGizmos = true; this.gameGizmos = false;
    this.needsRender = true;

    this.raycaster = new THREE.Raycaster();
    this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
    new ResizeObserver(() => this.resize()).observe(sceneHost);
    new ResizeObserver(() => this.resize()).observe(gameHost);
    this.axisGizmo = this.makeAxisGizmo();
    bus.on('scene-camera-moved', () => { this.needsRender = true; });
    bus.scenePivot = () => fromThreePos(this.controller.pivot);
    this.loop();
  }

  setMode(mode) {
    this.mode = mode;
    const host = mode === 'game' ? this.gameHost : this.sceneHost;
    if (this.canvas.parentElement !== host) host.prepend(this.canvas);
    this.axisGizmo.style.display = mode === 'scene' ? '' : 'none';
    this.resize();
    this.needsRender = true;
  }
  resize() {
    const host = this.mode === 'game' ? this.gameHost : this.sceneHost;
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    let cw = w, ch = h;
    if (this.mode === 'game' && this.aspect && this.aspect !== 'free') {
      const [aw, ah] = this.aspect.split(':').map(Number);
      const a = aw / ah;
      if (w / h > a) { cw = Math.round(h * a); } else { ch = Math.round(w / a); }
      this.canvas.style.position = 'absolute';
      this.canvas.style.left = ((w - cw) / 2) + 'px'; this.canvas.style.top = ((h - ch) / 2) + 'px';
      this.canvas.style.width = cw + 'px'; this.canvas.style.height = ch + 'px';
    } else { this.canvas.style.position = ''; this.canvas.style.width = ''; this.canvas.style.height = ''; this.canvas.style.left = ''; this.canvas.style.top = ''; }
    this.renderer.setSize(cw, ch, false);
    this.width = cw; this.height = ch;
    this.sceneCam.aspect = cw / ch; this.sceneCam.updateProjectionMatrix();
    this.gameCam.aspect = cw / ch; this.gameCam.updateProjectionMatrix();
    this.needsRender = true;
    bus.emit('viewport-resized', { w: cw, h: ch, mode: this.mode });
  }
  gameSize() { return [this.mode === 'game' ? this.width : Math.max(1, this.gameHost.clientWidth || this.width), this.mode === 'game' ? this.height : Math.max(1, this.gameHost.clientHeight || this.height)]; }
  setTool(t) {
    this.tool = t;
    if (t === 'view') this.tc.detach();
    else { this.tc.setMode(t); this.attachGizmo(); }
    this.needsRender = true;
  }
  setSpace(space) { this.tc.setSpace(space); this.needsRender = true; }
  setSnap(on) { this.snap = on; this.tc.setTranslationSnap(on ? 0.25 : null); this.tc.setRotationSnap(on ? THREE.MathUtils.degToRad(15) : null); this.tc.setScaleSnap(on ? 0.1 : null); }

  // ---------- edit-mode sync ----------
  syncFromScene() {
    const objs = editor.objects;
    const seen = new Set();
    for (const o of objs) {
      seen.add(o.id);
      let n = this.nodes.get(o.id);
      if (!n) { n = { group: new THREE.Group(), id: o.id, parentId: null }; n.group.userData.id = o.id; this.nodes.set(o.id, n); }
      this.updateNode(n, o);
    }
    for (const [id, n] of this.nodes) if (!seen.has(id)) { n.group.removeFromParent(); this.nodes.delete(id); }
    // parenting (array order keeps siblings stable)
    for (const o of objs) {
      const n = this.nodes.get(o.id);
      const parent = o.parent ? this.nodes.get(o.parent)?.group : this.editRoot;
      if (n.group.parent !== parent) parent.add(n.group);
    }
    this.updateHelpers();
    this.attachGizmo();
    this.needsRender = true;
  }
  updateNode(n, o) {
    const g = n.group;
    toThreePos(o.p, g.position); toThreeQuat(o.r, g.quaternion); g.scale.set(o.s[0], o.s[1], o.s[2]);
    g.visible = o.active !== false;
    const mf = o.comps.find(c => c.type === 'MeshFilter');
    const mr = o.comps.find(c => c.type === 'MeshRenderer');
    const kind = mf && mr ? mf.mesh : null;
    if (kind) {
      if (!n.mesh || n.meshKind !== kind) {
        if (n.mesh) n.mesh.removeFromParent();
        n.mesh = new THREE.Mesh(geometry(kind), materialFor(mr));
        n.mesh.userData.id = o.id; n.meshKind = kind;
        g.add(n.mesh);
      }
      n.mesh.material = materialFor(mr);
      n.mesh.visible = mr.enabled !== false;
      n.mesh.castShadow = (mr.shadowCastingMode ?? 1) !== 0;
      n.mesh.receiveShadow = mr.receiveShadows !== false;
    } else if (n.mesh) { n.mesh.removeFromParent(); n.mesh = null; n.meshKind = null; }
    // lights
    const lc = o.comps.find(c => c.type === 'Light');
    if (lc) {
      const t = lc.lightType;
      if (!n.light || n.lightType !== t) {
        if (n.light) { n.light.removeFromParent(); n.lightTarget?.removeFromParent(); }
        if (t === 1) { n.light = mkLight(THREE.DirectionalLight); n.lightTarget = new THREE.Object3D(); n.lightTarget.position.set(0, 0, -1); g.add(n.lightTarget); n.light.target = n.lightTarget; this.setupShadow(n.light); }
        else if (t === 0) { n.light = mkLight(THREE.SpotLight); n.lightTarget = new THREE.Object3D(); n.lightTarget.position.set(0, 0, -1); g.add(n.lightTarget); n.light.target = n.lightTarget; }
        else n.light = mkLight(THREE.PointLight);
        n.lightType = t; g.add(n.light);
      }
      applyLight(n.light, lc);
      n.light.visible = lc.enabled !== false;
    } else if (n.light) { n.light.removeFromParent(); n.lightTarget?.removeFromParent(); n.light = null; n.lightType = null; }
    // camera marker (for picking + gizmo)
    const cam = o.comps.find(c => c.type === 'Camera');
    n.cameraComp = cam || null;
    if ((cam || lc) && !n.proxy) {
      n.proxy = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), new THREE.MeshBasicMaterial({ visible: false }));
      n.proxy.userData.id = o.id; n.proxy.userData.proxy = true; g.add(n.proxy);
    } else if (!cam && !lc && n.proxy) { n.proxy.removeFromParent(); n.proxy = null; }
  }
  setupShadow(light) {
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    const c = light.shadow.camera; c.left = -25; c.right = 25; c.top = 25; c.bottom = -25; c.near = -60; c.far = 100;
    light.shadow.bias = -0.0004; light.shadow.normalBias = 0.02;
  }

  // ---------- helpers: selection outlines, colliders, cameras, lights, joints ----------
  updateHelpers() {
    this.helpers.clear();
    if (!this.showGizmos) return;
    const sel = new Set(editor.selection);
    const playing = editor.playing;
    const nodes = playing ? null : this.nodes;
    if (playing) return this.updatePlayHelpers(sel);
    const childSel = new Set();
    for (const id of sel) for (const d of editor.descendants(id)) childSel.add(d.id);
    for (const o of editor.objects) {
      const n = nodes.get(o.id); if (!n) continue;
      const g = n.group;
      if (!g.visible) continue;
      const isSel = sel.has(o.id), isChild = childSel.has(o.id);
      if ((isSel || isChild) && n.mesh && n.mesh.visible) {
        const l = new THREE.LineSegments(edges(n.meshKind), new THREE.LineBasicMaterial({ color: isSel ? ORANGE : CHILD_BLUE, depthTest: false, transparent: true, opacity: 0.9 }));
        l.renderOrder = 10;
        this.attachHelper(l, g);
      }
      if (isSel) {
        for (const c of o.comps) {
          if (/Collider$/.test(c.type) && c.enabled !== false) this.attachHelper(colliderWire(c, n), g);
          if (c.type === 'HingeJoint' || c.type === 'ConfigurableJoint') this.attachHelper(jointGizmo(c), g);
          if (c.type === 'CharacterController') this.attachHelper(colliderWire(Object.assign({ type: 'CapsuleCollider', direction: 1 }, c), n), g);
        }
      }
      if (n.cameraComp) this.attachHelper(cameraGizmo(n.cameraComp, isSel, this.gameSize()), g, true);
      if (n.light) this.attachHelper(lightGizmo(n.lightType, isSel), g, true);
    }
  }
  updatePlayHelpers(sel) {
    for (const n of this.playNodes.values()) {
      if (!sel.has(n.id) || !n.mesh || !n.mesh.visible) continue;
      const l = new THREE.LineSegments(edges(n.meshKind), new THREE.LineBasicMaterial({ color: ORANGE, depthTest: false, transparent: true, opacity: 0.9 }));
      l.renderOrder = 10; l.matrixAutoUpdate = false; l.matrix.copy(n.mesh.matrix);
      this.helpers.add(l);
    }
  }
  attachHelper(obj, group, noScale) {
    // helpers follow the object's world transform without becoming part of picking
    obj.matrixAutoUpdate = false;
    obj.userData.follow = group; obj.userData.noScale = !!noScale;
    this.helpers.add(obj);
  }
  refreshHelperTransforms() {
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    for (const h of this.helpers.children) {
      const g = h.userData.follow; if (!g) continue;
      g.updateWorldMatrix(true, false);
      if (h.userData.noScale) { g.matrixWorld.decompose(p, q, s); h.matrix.compose(p, q, new THREE.Vector3(1, 1, 1)); }
      else h.matrix.copy(g.matrixWorld);
    }
  }

  attachGizmo() {
    if (editor.playing || this.tool === 'view') { this.tc.detach(); return; }
    const id = editor.selected;
    const n = id != null ? this.nodes.get(id) : null;
    if (n && n.group.parent) { if (this.tc.object !== n.group) this.tc.attach(n.group); }
    else this.tc.detach();
  }
  onGizmoChange() {
    const g = this.tc.object; if (!g) return;
    const id = g.userData.id; const o = editor.get(id); if (!o) return;
    const key = 'gizmo-' + id + '-' + this.tc.mode;
    if (this.tc.mode === 'translate') editor.setTransform(id, 'p', fromThreePos(g.position).map(v => round(v, 4)), key);
    else if (this.tc.mode === 'rotate') { const r = fromThreeQuat(g.quaternion); editor.change(() => { o.r = r; o.e = quatToEulerNear(r, o.e); }, 'Rotate', key); }
    else if (this.tc.mode === 'scale') editor.setTransform(id, 's', [g.scale.x, g.scale.y, g.scale.z].map(v => round(v, 4)), key);
  }

  // ---------- picking ----------
  onPointerDown(e) {
    this.canvas.focus();
    if (this.mode !== 'scene' || e.button !== 0 || e.altKey) return;
    this.downAt = [e.clientX, e.clientY];
  }
  onPointerUp(e) {
    if (this.mode !== 'scene' || e.button !== 0 || !this.downAt || this.dragging) { this.downAt = null; return; }
    const moved = Math.hypot(e.clientX - this.downAt[0], e.clientY - this.downAt[1]);
    this.downAt = null;
    if (moved > 4 || this.tc.dragging) return;
    if (this.tc.axis) return;
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.sceneCam);
    const root = editor.playing ? this.playRoot : this.editRoot;
    const hits = this.raycaster.intersectObjects(root.children, true).filter(h => h.object.userData.id != null && h.object.visible !== false && (h.object.isMesh) && isVisibleChain(h.object));
    if (hits.length) {
      let id = hits[0].object.userData.id;
      // clicking again on a child of the selected object selects that child (Unity picks the deepest first, then prefab root)
      editor.select(id, e.ctrlKey || e.metaKey || e.shiftKey);
    } else if (!(e.ctrlKey || e.shiftKey)) editor.select([]);
  }

  frameSelected() {
    const id = editor.selected; if (id == null) return;
    const map = editor.playing ? (this.playNodesById || new Map()) : this.nodes;
    const n = map.get(id); if (!n) return;
    const box = new THREE.Box3();
    const target = n.group || n.mesh;
    target.updateWorldMatrix(true, true);
    box.setFromObject(target);
    if (box.isEmpty()) { const p = new THREE.Vector3(); target.getWorldPosition(p); box.setFromCenterAndSize(p, new THREE.Vector3(1, 1, 1)); }
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    this.controller.frame(sphere.center, Math.max(0.3, sphere.radius));
  }

  // ---------- play mode ----------
  enterPlay() {
    this.editRoot.visible = false; this.playRoot.visible = true;
    this.tc.detach();
    for (const n of this.playNodes.values()) n.group.removeFromParent();
    this.playNodes.clear();
    this.frameData = null;
    this.helpers.clear();
    this.needsRender = true;
  }
  exitPlay() {
    this.editRoot.visible = true; this.playRoot.visible = false;
    for (const n of this.playNodes.values()) n.group.removeFromParent();
    this.playNodes.clear();
    this.setDebugLines(null);
    this.playCamera = null;
    this.syncFromScene();
  }
  applyFrame(data) {
    // data: Float64Array [n, items...] stride 28
    this.frameData = data;
    const n = data[0] | 0, S = 28;
    const seen = new Set();
    const m = new THREE.Matrix4();
    this.playCamera = null;
    for (let k = 0; k < n; k++) {
      const o = 1 + k * S;
      const id = data[o] | 0, kind = data[o + 1] | 0;
      const key = id * 4 + kind;
      seen.add(key);
      let node = this.playNodes.get(key);
      if (kind === 2) { this.playCamera = { o, data }; continue; }
      if (!node) {
        node = { group: new THREE.Group(), kind, id };
        node.group.matrixAutoUpdate = false;
        this.playRoot.add(node.group);
        this.playNodes.set(key, node);
      }
      unityMatrixToThree(data, o + 12, m);
      node.group.matrix.copy(m);
      node.group.matrixWorldNeedsUpdate = true;
      if (kind === 0) {
        const meshKind = MESH_BY_CODE[data[o + 2] | 0] || 'Cube';
        if (!node.mesh || node.meshKind !== meshKind) {
          if (node.mesh) node.mesh.removeFromParent();
          node.mesh = new THREE.Mesh(geometry(meshKind)); node.meshKind = meshKind;
          node.mesh.userData.id = id; node.group.add(node.mesh);
        }
        node.mesh.material = material([data[o + 4], data[o + 5], data[o + 6], data[o + 7]], data[o + 8], data[o + 9]);
        node.mesh.visible = data[o + 3] !== 0;
        node.mesh.castShadow = data[o + 10] !== 0; node.mesh.receiveShadow = data[o + 11] !== 0;
      } else if (kind === 1) {
        const t = data[o + 2] | 0;
        if (!node.light || node.lightType !== t) {
          if (node.light) node.light.removeFromParent();
          node.lightTarget?.removeFromParent();
          if (t === 1 || t === 0) {
            node.light = t === 1 ? mkLight(THREE.DirectionalLight) : mkLight(THREE.SpotLight);
            node.lightTarget = new THREE.Object3D(); node.lightTarget.position.set(0, 0, -1);
            node.group.add(node.lightTarget); node.light.target = node.lightTarget;
            if (t === 1) this.setupShadow(node.light);
          } else node.light = mkLight(THREE.PointLight);
          node.lightType = t; node.group.add(node.light);
        }
        applyLight(node.light, { lightType: t, color: [data[o + 4], data[o + 5], data[o + 6], 1], intensity: data[o + 7], range: data[o + 8], spotAngle: data[o + 9], shadows: data[o + 10] });
        node.light.visible = data[o + 3] !== 0;
      }
    }
    for (const [key, node] of this.playNodes) if (!seen.has(key)) { node.group.removeFromParent(); this.playNodes.delete(key); }
    // map ids for picking/selection (mesh nodes only)
    this.playNodesById = new Map();
    for (const node of this.playNodes.values()) if (node.kind === 0) this.playNodesById.set(node.id, node);
    if (editor.selection.length) { this.helpers.clear(); this.updatePlayHelpers(new Set(editor.selection)); }
    this.needsRender = true;
  }
  setDebugLines(lines) {
    const g = this.debugLines.geometry;
    if (!lines || !lines.length) { this.debugLines.visible = false; return; }
    const pos = new Float32Array(lines.length * 6), col = new Float32Array(lines.length * 6);
    const c = new THREE.Color();
    lines.forEach((l, i) => {
      pos.set([l[0], l[1], -l[2], l[3], l[4], -l[5]], i * 6);
      c.set(l[6].slice(0, 7));
      col.set([c.r, c.g, c.b, c.r, c.g, c.b], i * 6);
    });
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeBoundingSphere();
    this.debugLines.visible = true;
  }

  // ---------- render ----------
  configureGameCamera() {
    let cam = null;
    let clear = 1, bg = [0.19, 0.3, 0.47, 1];
    if (editor.playing && this.playCamera) {
      const { o, data } = this.playCamera;
      const ortho = data[o + 5] !== 0;
      cam = ortho ? this.gameOrtho : this.gameCam;
      const m = unityMatrixToThree(data, o + 12, new THREE.Matrix4());
      if (ortho) { const s = data[o + 6], a = this.width / this.height; Object.assign(this.gameOrtho, { left: -s * a, right: s * a, top: s, bottom: -s }); }
      else cam.fov = data[o + 2];
      cam.near = data[o + 3]; cam.far = data[o + 4]; cam.updateProjectionMatrix();
      cam.matrixAutoUpdate = false; cam.matrixWorld.copy(m); cam.matrixWorldInverse.copy(m).invert();
      clear = data[o + 7] | 0; bg = [data[o + 8], data[o + 9], data[o + 10], data[o + 11]];
    } else if (!editor.playing) {
      // edit mode: the highest-depth enabled camera (MainCamera tag preferred)
      let best = null, bestScore = -Infinity;
      for (const o of editor.objects) {
        const c = o.comps.find(x => x.type === 'Camera');
        if (!c || c.enabled === false || o.active === false) continue;
        const n = this.nodes.get(o.id); if (!n || !isVisibleChain(n.group)) continue;
        const score = (c.depth ?? -1) + (o.tag === 'MainCamera' ? 0.5 : 0);
        if (score > bestScore) { bestScore = score; best = { o, c, n }; }
      }
      if (best) {
        const { c, n } = best;
        cam = c.orthographic ? this.gameOrtho : this.gameCam;
        n.group.updateWorldMatrix(true, false);
        const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
        n.group.matrixWorld.decompose(p, q, s);
        const m = new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1));
        if (c.orthographic) { const sz = c.orthographicSize ?? 5, a = this.width / this.height; Object.assign(this.gameOrtho, { left: -sz * a, right: sz * a, top: sz, bottom: -sz }); }
        else cam.fov = c.fieldOfView ?? 60;
        cam.near = c.nearClipPlane ?? 0.3; cam.far = c.farClipPlane ?? 1000; cam.updateProjectionMatrix();
        cam.matrixAutoUpdate = false; cam.matrixWorld.copy(m); cam.matrixWorldInverse.copy(m).invert();
        clear = c.clearFlags ?? 1; bg = c.backgroundColor || bg;
      }
    }
    return { cam, clear, bg };
  }
  render() {
    this.refreshHelperTransforms();
    const isScene = this.mode === 'scene';
    let cam = this.sceneCam;
    this.grid.visible = isScene && this.showGrid;
    this.helpers.visible = isScene || this.gameGizmos;
    this.tcHelper.visible = isScene && !editor.playing;
    this.debugLines.visible = this.debugLines.visible && (isScene || this.gameGizmos);
    this.sky.visible = true;
    this.scene.background = null;
    if (!isScene) {
      const g = this.configureGameCamera();
      if (!g.cam) {
        this.renderer.setClearColor(0x000000, 1); this.renderer.clear();
        this.drawNoCamera();
        return;
      }
      cam = g.cam;
      if (g.clear !== 1) { this.sky.visible = false; this.scene.background = new THREE.Color().setRGB(g.bg[0], g.bg[1], g.bg[2], THREE.SRGBColorSpace); }
    }
    this.sky.position.copy(cam.position.setFromMatrixPosition(cam.matrixWorld));
    this.renderer.render(this.scene, cam);
    if (isScene) this.drawAxisGizmo();
  }
  drawNoCamera() {
    if (!this.noCamEl) { this.noCamEl = document.createElement('div'); Object.assign(this.noCamEl.style, { position: 'absolute', inset: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc', fontSize: '15px', pointerEvents: 'none' }); this.noCamEl.textContent = 'Display 1  No cameras rendering'; this.gameHost.append(this.noCamEl); }
    this.noCamEl.style.display = '';
  }
  loop() {
    const tick = () => {
      requestAnimationFrame(tick);
      if (this.noCamEl) this.noCamEl.style.display = 'none';
      if (this.needsRender || editor.playing || this.dragging) { this.needsRender = false; this.render(); }
    };
    requestAnimationFrame(tick);
  }

  // ---------- axis gizmo (top-right of the Scene view) ----------
  makeAxisGizmo() {
    const c = document.createElement('canvas');
    c.className = 'axis-gizmo'; c.width = 152; c.height = 152;
    this.sceneHost.append(c);
    c.addEventListener('click', (e) => {
      const r = c.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width * 152, y = (e.clientY - r.top) / r.height * 152;
      for (const a of this.axisHit || []) if (Math.hypot(a.x - x, a.y - y) < 16) { this.controller.lookAlong(a.look); return; }
    });
    return c;
  }
  drawAxisGizmo() {
    const c = this.axisGizmo, g = c.getContext('2d');
    g.clearRect(0, 0, 152, 152);
    const inv = this.sceneCam.matrixWorldInverse;
    const axes = [
      { v: new THREE.Vector3(1, 0, 0), col: '#e8443a', label: 'x', look: new THREE.Vector3(-1, 0, 0) },
      { v: new THREE.Vector3(0, 1, 0), col: '#8fd14f', label: 'y', look: new THREE.Vector3(0, -1, 0) },
      { v: new THREE.Vector3(0, 0, -1), col: '#3a7be8', label: 'z', look: new THREE.Vector3(0, 0, 1) },
      { v: new THREE.Vector3(-1, 0, 0), col: '#cfcfcf', label: '', look: new THREE.Vector3(1, 0, 0) },
      { v: new THREE.Vector3(0, -1, 0), col: '#cfcfcf', label: '', look: new THREE.Vector3(0, 1, 0) },
      { v: new THREE.Vector3(0, 0, 1), col: '#cfcfcf', label: '', look: new THREE.Vector3(0, 0, -1) },
    ];
    const pts = axes.map(a => { const d = a.v.clone().transformDirection(inv); return Object.assign({}, a, { x: 76 + d.x * 46, y: 76 - d.y * 46, z: d.z }); });
    pts.sort((a, b) => a.z - b.z);
    g.fillStyle = 'rgba(180,180,180,.9)'; g.beginPath(); g.arc(76, 76, 12, 0, Math.PI * 2); g.fill();
    for (const p of pts) {
      g.strokeStyle = p.col; g.lineWidth = 3; g.beginPath(); g.moveTo(76, 76); g.lineTo(p.x, p.y); g.stroke();
      g.fillStyle = p.col; g.beginPath(); g.arc(p.x, p.y, p.label ? 11 : 7, 0, Math.PI * 2); g.fill();
      if (p.label) { g.fillStyle = '#111'; g.font = 'bold 14px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(p.label, p.x, p.y + 1); }
    }
    g.fillStyle = '#ddd'; g.font = '13px sans-serif'; g.textAlign = 'center'; g.fillText('< Persp', 76, 146);
    this.axisHit = pts;
  }
}

function isVisibleChain(o) { while (o) { if (o.visible === false) return false; o = o.parent; } return true; }

// three.js puts new lights at (0,1,0); Unity lights sit at their GameObject's origin and shine along +Z
function mkLight(Type) { const l = new Type(); l.position.set(0, 0, 0); return l; }

function applyLight(light, c) {
  const col = c.color || [1, 1, 1, 1];
  light.color.setRGB(col[0], col[1], col[2], THREE.SRGBColorSpace);
  const t = c.lightType;
  if (t === 1) { light.intensity = (c.intensity ?? 1) * 2.4; light.castShadow = (c.shadows ?? 0) !== 0; }
  else if (t === 0) { light.intensity = (c.intensity ?? 1) * 12; light.distance = c.range ?? 10; light.angle = THREE.MathUtils.degToRad((c.spotAngle ?? 30) / 2); light.penumbra = 0.3; light.decay = 2; }
  else { light.intensity = (c.intensity ?? 1) * 12; light.distance = c.range ?? 10; light.decay = 2; }
}

function lineObj(points, color, opts = {}) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, depthTest: opts.depthTest ?? true, transparent: true, opacity: opts.opacity ?? 1 }));
  l.renderOrder = 9;
  return l;
}
function circle(pts, cx, cy, cz, r, axis, seg = 32) {
  for (let i = 0; i < seg; i++) {
    const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
    const p = (a) => axis === 0 ? [cx, cy + Math.cos(a) * r, cz + Math.sin(a) * r] : axis === 1 ? [cx + Math.cos(a) * r, cy, cz + Math.sin(a) * r] : [cx + Math.cos(a) * r, cy + Math.sin(a) * r, cz];
    pts.push(...p(a0), ...p(a1));
  }
}
function colliderWire(c, n) {
  const pts = [];
  const ctr = c.center || [0, 0, 0];
  const cx = ctr[0], cy = ctr[1], cz = -ctr[2];
  if (c.type === 'BoxCollider') {
    const s = c.size || [1, 1, 1], hx = s[0] / 2, hy = s[1] / 2, hz = s[2] / 2;
    const v = [];
    for (let i = 0; i < 8; i++) v.push([cx + (i & 1 ? hx : -hx), cy + (i & 2 ? hy : -hy), cz + (i & 4 ? hz : -hz)]);
    for (const [a, b] of [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]) pts.push(...v[a], ...v[b]);
  } else if (c.type === 'SphereCollider') {
    const r = c.radius ?? 0.5;
    for (let a = 0; a < 3; a++) circle(pts, cx, cy, cz, r, a);
  } else if (c.type === 'CapsuleCollider') {
    const r = c.radius ?? 0.5, h = Math.max(c.height ?? 2, r * 2), half = h / 2 - r, dir = c.direction ?? 1;
    const P = (x, y, z) => dir === 1 ? [x, y, z] : dir === 0 ? [y, x, z] : [x, z, y];
    const seg = 24;
    for (const sgn of [1, -1]) {
      for (let i = 0; i < seg; i++) {
        const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
        const q0 = P(Math.cos(a0) * r, sgn * half, Math.sin(a0) * r), q1 = P(Math.cos(a1) * r, sgn * half, Math.sin(a1) * r);
        pts.push(cx + q0[0], cy + q0[1], cz + q0[2], cx + q1[0], cy + q1[1], cz + q1[2]);
      }
      for (const ax of [0, 2]) for (let i = 0; i < seg / 2; i++) {
        const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
        const f = (a) => { const u = Math.cos(a) * r, w = Math.sin(a) * r * sgn; return ax === 0 ? P(u, sgn * half + w, 0) : P(0, sgn * half + w, u); };
        const q0 = f(a0), q1 = f(a1);
        pts.push(cx + q0[0], cy + q0[1], cz + q0[2], cx + q1[0], cy + q1[1], cz + q1[2]);
      }
    }
    for (const [x, z] of [[r, 0], [-r, 0], [0, r], [0, -r]]) { const a = P(x, half, z), b = P(x, -half, z); pts.push(cx + a[0], cy + a[1], cz + a[2], cx + b[0], cy + b[1], cz + b[2]); }
  } else if (c.type === 'MeshCollider') {
    const box = new THREE.Box3().setFromBufferAttribute(geometry(c.mesh || 'Cube').attributes.position);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(geometry(c.mesh || 'Cube'), 25), new THREE.LineBasicMaterial({ color: COLLIDER_GREEN }));
    return e;
  }
  return lineObj(pts, COLLIDER_GREEN, { opacity: 0.9 });
}
function jointGizmo(c) {
  const a = c.anchor || [0, 0, 0], ax = c.axis || [1, 0, 0];
  const l = Math.hypot(ax[0], ax[1], ax[2]) || 1;
  const d = [ax[0] / l * 0.6, ax[1] / l * 0.6, -ax[2] / l * 0.6];
  const p = [a[0], a[1], -a[2]];
  const pts = [p[0], p[1], p[2], p[0] + d[0], p[1] + d[1], p[2] + d[2]];
  circle(pts, p[0], p[1], p[2], 0.06, 1, 12);
  return lineObj(pts, JOINT_ORANGE, { depthTest: false });
}
function cameraGizmo(c, selected, [w, h]) {
  const pts = [];
  const aspect = w / h;
  if (selected) {
    const near = c.nearClipPlane ?? 0.3, far = Math.min(c.farClipPlane ?? 1000, 12);
    const corners = (d) => { const t = Math.tan(((c.fieldOfView ?? 60) * Math.PI / 180) / 2) * d, tx = t * aspect; return [[-tx, -t, -d], [tx, -t, -d], [tx, t, -d], [-tx, t, -d]]; };
    const n = corners(near), f = corners(far);
    for (let i = 0; i < 4; i++) { pts.push(...n[i], ...n[(i + 1) % 4], ...f[i], ...f[(i + 1) % 4], ...n[i], ...f[i]); }
  }
  // small body
  const b = [[-0.15, -0.1, 0.1], [0.15, -0.1, 0.1], [0.15, 0.1, 0.1], [-0.15, 0.1, 0.1], [-0.15, -0.1, -0.12], [0.15, -0.1, -0.12], [0.15, 0.1, -0.12], [-0.15, 0.1, -0.12]];
  for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) pts.push(...b[i], ...b[j]);
  return lineObj(pts, selected ? 0xffffff : 0xb0b0b0, { opacity: selected ? 1 : 0.7 });
}
function lightGizmo(type, selected) {
  const pts = [];
  circle(pts, 0, 0, 0, 0.18, 2, 16);
  if (type === 1) for (const [x, y] of [[0, 0], [0.12, 0], [-0.12, 0], [0, 0.12], [0, -0.12]]) pts.push(x, y, 0, x, y, -1.2);
  else if (type === 0) for (const [x, y] of [[0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]]) pts.push(0, 0, 0, x, y, -1);
  else { circle(pts, 0, 0, 0, 0.3, 0, 16); circle(pts, 0, 0, 0, 0.3, 1, 16); }
  return lineObj(pts, selected ? 0xfff07a : 0xd8c860, { opacity: selected ? 1 : 0.75 });
}
