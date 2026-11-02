// Body tracking (for "shadow mode"): the webcam and Google's MediaPipe Pose, running in this browser tab.
// The video never leaves the computer: each frame is analysed here and thrown away.
// Scripts use it through Anvil.BodyTracking (C#). A small preview with the tracked skeleton sits in the
// corner of the Game view while it runs.
import { bus } from '../core/events.js';

const BASE = new URL('../../../vendor/mediapipe/', import.meta.url).href;
let pose = null, video = null, stream = null, running = false, busy = false, starting = null;
let latest = null, status = 0, error = '', complexity = -1, panel = null, ctx = null, frames = 0, fpsT = 0, fps = 0;
let inject = null; // tests: hand-made landmarks instead of the camera
let arm = 0;        // which arm the preview shows: 0 both, 1 right, 2 left

function loadScript(src) {
  return new Promise((res, rej) => {
    if (window.Pose) return res();
    const s = document.createElement('script'); s.src = src; s.onload = () => res(); s.onerror = () => rej(new Error('could not load ' + src));
    document.head.append(s);
  });
}

// the corner preview: mirrored video (like a mirror) with the tracked arms and shoulders drawn on it
function showPanel() {
  if (panel) { panel.style.display = ''; return; }
  const host = document.getElementById('game-host'); if (!host) return;
  panel = document.createElement('div');
  panel.style.cssText = 'position:absolute;right:8px;bottom:8px;width:240px;z-index:7;background:#111;border:1px solid #444;border-radius:4px;overflow:hidden;font:11px system-ui;color:#ccc;pointer-events:none';
  const c = document.createElement('canvas'); c.width = 320; c.height = 240; c.style.cssText = 'display:block;width:100%;transform:scaleX(-1)';
  const label = document.createElement('div'); label.style.cssText = 'padding:2px 6px;background:#1b1b1b';
  panel.append(c, label); panel.label = label;
  host.append(panel); ctx = c.getContext('2d');
}
function hidePanel() { if (panel) panel.style.display = 'none'; }
const ALL_BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24]];
const ARM_BONES = { 1: [[12, 14], [14, 16]], 2: [[11, 13], [13, 15]] };   // right arm: shoulder 12 → elbow 14 → wrist 16
const ARM_POINTS = { 0: [11, 12, 13, 14, 15, 16], 1: [12, 14, 16], 2: [11, 13, 15] };
function draw(lm) {
  if (!ctx) return;
  const c = ctx.canvas;
  if (video && video.readyState >= 2) ctx.drawImage(video, 0, 0, c.width, c.height); else { ctx.fillStyle = '#111'; ctx.fillRect(0, 0, c.width, c.height); }
  if (lm) {
    ctx.lineWidth = 3;
    for (const [a, b] of (ARM_BONES[arm] || ALL_BONES)) {
      const p = lm[a], q = lm[b]; if (!p || !q || (p.visibility ?? 1) < 0.4 || (q.visibility ?? 1) < 0.4) continue;
      // the upper arms (shoulder to elbow) are what drives the robot shoulder: drawn in orange
      ctx.strokeStyle = (a === 11 && b === 13) || (a === 12 && b === 14) ? '#ff8a2a' : '#5fd3a0';
      ctx.beginPath(); ctx.moveTo(p.x * c.width, p.y * c.height); ctx.lineTo(q.x * c.width, q.y * c.height); ctx.stroke();
    }
    ctx.fillStyle = '#fff';
    for (const i of ARM_POINTS[arm] || ARM_POINTS[0]) { const p = lm[i]; if (p && (p.visibility ?? 1) >= 0.4) { ctx.beginPath(); ctx.arc(p.x * c.width, p.y * c.height, 4, 0, 7); ctx.fill(); } }
  }
  if (panel) panel.label.textContent = status === 3 ? `Tracking · ${fps.toFixed(0)} fps` : status === 2 ? 'Camera on · step back so your head, shoulders and arms are in view' : status === 1 ? 'Starting camera…' : status < 0 ? 'Body tracking: ' + error : '';
}

function onResults(r) {
  const now = performance.now();
  frames++; if (now - fpsT > 1000) { fps = frames * 1000 / (now - fpsT); frames = 0; fpsT = now; }
  if (r.poseLandmarks && r.poseWorldLandmarks) { latest = { t: now, lm: r.poseLandmarks, world: r.poseWorldLandmarks }; status = 3; }
  else if (status === 3 && (!latest || now - latest.t > 500)) status = 2;
  else if (status !== 3) status = 2;
  draw(r.poseLandmarks || null);
}

async function loop() {
  if (!running) return;
  requestAnimationFrame(loop);
  if (busy || !video || video.readyState < 2) return;
  busy = true;
  try { await pose.send({ image: video }); } catch (e) { error = e.message || String(e); }
  busy = false;
}

// accurate: the bigger "full" model (steadier, slower) instead of "lite"; whichArm: 0 both, 1 right, 2 left (what the preview draws)
export function start(accurate, whichArm = 0) {
  arm = whichArm | 0;
  const want = accurate ? 1 : 0;
  if (running && complexity === want) return;
  if (running && pose) { complexity = want; pose.setOptions({ modelComplexity: want }); return; }
  if (starting) return;
  status = 1; error = ''; showPanel(); draw(null);
  starting = (async () => {
    try {
      await loadScript(BASE + 'pose.js');
      pose = pose || new window.Pose({ locateFile: (f) => BASE + f });
      complexity = want;
      pose.setOptions({ modelComplexity: want, smoothLandmarks: true, enableSegmentation: false, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5, selfieMode: false });
      pose.onResults(onResults);
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('this browser has no camera access');
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false });
      video = document.createElement('video'); video.srcObject = stream; video.playsInline = true; video.muted = true;
      await video.play();
      running = true; status = 2; fpsT = performance.now(); frames = 0;
      loop();
    } catch (e) {
      status = -1; error = e.name === 'NotAllowedError' ? 'camera permission was refused (click the camera icon in the address bar to allow it)' : (e.message || String(e));
      draw(null);
      bus.emit('toast', 'Body tracking: ' + error);
    } finally { starting = null; }
  })();
}
export function stop() {
  running = false; latest = null; status = 0;
  if (stream) { for (const t of stream.getTracks()) t.stop(); stream = null; }
  video = null; hidePanel();
}

// for C#: [status, age ms, then 33 × (world x, y, z, visibility, image x, image y)]
// status: -1 error, 0 off, 1 starting, 2 camera on but nobody found, 3 tracking
export function get() {
  const src = inject || latest;
  const st = inject ? 3 : status;
  const out = [st, inject ? 0 : src ? performance.now() - src.t : 1e9];
  if (src && (st === 3 || inject)) for (let i = 0; i < 33; i++) {
    const w = src.world[i] || {}, l = src.lm[i] || {};
    out.push(w.x ?? 0, w.y ?? 0, w.z ?? 0, l.visibility ?? w.visibility ?? 0, l.x ?? 0, l.y ?? 0);
  }
  return out;
}
export function bodyTrackError() { return error; }
// tests: pretend the camera sees these world landmarks (index -> [x, y, z]); null goes back to the camera
export function injectPose(points) {
  if (!points) { inject = null; return; }
  const world = [], lm = [];
  for (let i = 0; i < 33; i++) { const p = points[i] || [0, 0, 0]; world.push({ x: p[0], y: p[1], z: p[2], visibility: points[i] ? 1 : 0 }); lm.push({ x: 0.5, y: 0.5, visibility: points[i] ? 1 : 0 }); }
  inject = { t: performance.now(), world, lm };
}
export const bodytrackImports = { start: (accurate, whichArm) => start(!!accurate, whichArm | 0), stop, get };
