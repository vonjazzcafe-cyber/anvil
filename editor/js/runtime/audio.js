// Plays the game's sounds with Web Audio: AudioSource / PlayOneShot / PlayClipAtPoint commands from the engine.
import { project } from '../core/project.js';

let ctx = null, master = null;
const buffers = new Map();   // clip ref (asset path or "#uid") -> Promise<AudioBuffer>
const voices = new Map();    // source id -> { src, gain, pan, startedAt, offset, loop }

function audioCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ctx = new AC(); master = ctx.createGain(); master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => { });
  return ctx;
}
function dataURLToArrayBuffer(url) {
  const b64 = url.slice(url.indexOf(',') + 1); const bin = atob(b64);
  const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}
function buffer(ref) {
  if (buffers.has(ref)) return buffers.get(ref);
  const f = project.file(ref); const url = f?.data?.url;
  const c = audioCtx();
  const p = url && c ? c.decodeAudioData(dataURLToArrayBuffer(url)).catch(e => { console.warn('Could not decode', ref, e); return null; }) : Promise.resolve(null);
  buffers.set(ref, p);
  return p;
}
// AudioClip.Create / SetData clips: samples from C# (interleaved)
export function uploadClip(uid, channels, frequency, samples) {
  const c = audioCtx(); if (!c) return;
  const frames = Math.max(1, Math.floor(samples.length / channels));
  const b = c.createBuffer(channels, frames, frequency);
  for (let ch = 0; ch < channels; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < frames; i++) d[i] = samples[i * channels + ch]; }
  buffers.set('#' + uid, Promise.resolve(b));
}

function stopVoice(id) {
  const v = voices.get(id); if (!v) return;
  v.stopped = true;
  try { v.src?.stop(); } catch { }
  voices.delete(id);
}
function start(op, oneshot) {
  const c = audioCtx(); if (!c) return;
  if (!oneshot) stopVoice(op.id);
  const v = { op, stopped: false, loop: !!op.loop, gainNode: c.createGain(), panNode: c.createStereoPanner ? c.createStereoPanner() : null };
  v.gainNode.gain.value = op.gain ?? 1;
  if (v.panNode) { v.panNode.pan.value = op.pan ?? 0; v.gainNode.connect(v.panNode); v.panNode.connect(master); } else v.gainNode.connect(master);
  if (!oneshot) voices.set(op.id, v);
  buffer(op.clip).then(b => {
    if (!b || v.stopped) return;
    const src = c.createBufferSource();
    src.buffer = b; src.loop = v.loop; src.playbackRate.value = Math.abs(op.pitch ?? 1) || 1;
    src.connect(v.gainNode);
    const offset = Math.max(0, Math.min(op.t || 0, b.duration - 0.001));
    src.start(c.currentTime + (op.delay || 0), offset);
    if (window.__audioLog) window.__audioLog.push({ started: op.clip, dur: b.duration });
    src.onended = () => { if (!oneshot && voices.get(op.id) === v && !v.loop) voices.delete(op.id); };
    v.src = src;
  });
}

export function applyAudio(ops) {
  if (!ops) return;
  if (window.__audioLog) window.__audioLog.push(...ops);
  for (const op of ops) {
    switch (op.op) {
      case 'play': start(op, false); break;
      case 'oneshot': start(op, true); break;
      case 'stop': case 'pause': stopVoice(op.id); break;
      case 'seek': { const v = voices.get(op.id); if (v) start(Object.assign({}, v.op, { t: op.t, delay: 0 }), false); break; }
      case 'set': {
        const v = voices.get(op.id); if (!v) break;
        v.gainNode.gain.setTargetAtTime(op.gain, ctx.currentTime, 0.02);
        if (v.panNode) v.panNode.pan.setTargetAtTime(op.pan, ctx.currentTime, 0.02);
        if (v.src) { v.src.playbackRate.value = Math.abs(op.pitch) || 1; v.src.loop = !!op.loop; }
        v.loop = !!op.loop;
        break;
      }
      case 'pauseAll': if (master) master.gain.value = op.on ? 0 : 1; break;
    }
  }
}
export function stopAllAudio() { for (const id of [...voices.keys()]) stopVoice(id); if (master) master.gain.value = 1; }
export function setAudioPaused(p) { if (!ctx) return; if (p) ctx.suspend().catch(() => { }); else ctx.resume().catch(() => { }); }
// warm up on the Play click (browsers only allow audio after a user gesture)
export function unlockAudio() { audioCtx(); }
// for importing: duration / channels / sample rate of an audio file
export async function probeAudio(url) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const c = OAC ? new OAC(1, 1, 44100) : audioCtx();
  const b = await c.decodeAudioData(dataURLToArrayBuffer(url));
  return { len: b.duration, ch: b.numberOfChannels, freq: b.sampleRate };
}
