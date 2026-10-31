// "Work in a folder on this computer": the project is kept as real files on disk, like a Unity project folder.
//   Assets/**                 scripts and text files as they are; images, sounds and 3D models as the real files
//   Assets/Anvil/project.anvil.json   scenes, prefabs, materials, settings (everything else)
// Every change in Anvil is written to the folder within a second. Scripts edited outside Anvil (VS Code, Notepad…)
// are picked up when you come back to the page. Needs Chrome or Edge on a computer (the File System Access API).
import { bus, toast } from './events.js';
import { project, storage, kindOf, dirName } from './project.js';
import { projectToFiles, filesToProject, DATA_PATH } from '../export/format.js';

const BINARY_KINDS = new Set(['texture', 'audio', 'model']);
const TEXT_KINDS = new Set(['script', 'text']);
let root = null;            // FileSystemDirectoryHandle of the linked folder
let linkedProject = null;   // project name it belongs to
const written = new Map();  // path -> signature of what we last wrote / read
const mtimes = new Map();   // path -> lastModified of text files on disk
let saving = null, pendingSave = false, pollTimer = 0;

export const folderSupported = () => typeof window.showDirectoryPicker === 'function';
export const linkedFolderName = () => (root && linkedProject === project.name ? root.name : null);
const handleKey = (name) => 'folder:' + name;

function dataURLToBytes(url) {
  const b64 = url.slice(url.indexOf(',') + 1); const bin = atob(b64);
  const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToDataURL(u8, mime) {
  let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return `data:${mime};base64,` + btoa(s);
}
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', wav: 'audio/wav', mp3: 'audio/mpeg', ogg: 'audio/ogg', m4a: 'audio/mp4' };
const mimeOf = (p) => MIME[p.split('.').pop().toLowerCase()] || 'application/octet-stream';
const sigOf = (v) => typeof v === 'string' ? 't' + v.length + ':' + hash(v) : 'u' + v.length + ':' + hash(v.slice(-64));
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

async function dirFor(path, create) {
  let d = root;
  const parts = path.split('/'); parts.pop();
  for (const p of parts) d = await d.getDirectoryHandle(p, { create });
  return d;
}
async function writeFile(path, content) {
  const d = await dirFor(path, true);
  const fh = await d.getFileHandle(path.split('/').pop(), { create: true });
  const w = await fh.createWritable();
  await w.write(content);
  await w.close();
  const f = await fh.getFile();
  mtimes.set(path, f.lastModified);
}
async function deleteFile(path) {
  try { const d = await dirFor(path, false); await d.removeEntry(path.split('/').pop()); } catch { }
  mtimes.delete(path);
}
async function ensureDir(path) { try { let d = root; for (const p of path.split('/')) d = await d.getDirectoryHandle(p, { create: true }); } catch { } }

// project -> the files on disk (binary assets as their real bytes, without the data URL in the JSON)
async function diskFiles() {
  const p = project.data;
  const lean = Object.assign({}, p, { files: {} });
  const binaries = {};
  for (const [path, f] of Object.entries(p.files)) {
    if (BINARY_KINDS.has(f.kind) && f.data?.url) {
      const d = Object.assign({}, f.data); delete d.url; d.file = true;
      lean.files[path] = { kind: f.kind, data: d };
      binaries[path] = f.data.url;
    } else lean.files[path] = f;
  }
  const out = await projectToFiles(lean);
  for (const [path, url] of Object.entries(binaries)) out[path] = { url };
  return out;
}

async function saveToFolder() {
  if (!root || linkedProject !== project.name) return;
  if (saving) { pendingSave = true; return; }
  saving = (async () => {
    try {
      const files = await diskFiles();
      for (const [path, v] of Object.entries(files)) {
        const sig = sigOf(typeof v === 'string' ? v : v.url);
        if (written.get(path) === sig) continue;
        await writeFile(path, typeof v === 'string' ? v : dataURLToBytes(v.url));
        written.set(path, sig);
      }
      // files Anvil wrote before that are no longer in the project
      for (const path of [...written.keys()]) if (!(path in files)) { await deleteFile(path); written.delete(path); }
      for (const f of project.data.folders) if (f.startsWith('Assets')) await ensureDir(f);
      bus.emit('folder-status', { saved: Date.now() });
    } catch (e) {
      console.error(e);
      if (e.name === 'NotAllowedError' || e.name === 'SecurityError') { toast('Lost permission to write to the folder. Use File › Reconnect Project Folder.', 'error'); unlink(false); }
      else toast('Could not save to the folder: ' + (e.message || e), 'error');
    }
  })();
  await saving; saving = null;
  if (pendingSave) { pendingSave = false; saveToFolder(); }
}

// every file under Assets: { path: File }
async function scan(dir = root, prefix = '') {
  const out = {};
  for await (const [name, h] of dir.entries()) {
    const path = prefix ? prefix + '/' + name : name;
    if (h.kind === 'directory') {
      if (!prefix && name !== 'Assets') continue;
      if (name.startsWith('.')) continue;
      Object.assign(out, await scan(h, path));
    } else if (path.startsWith('Assets/') && !name.endsWith('.meta')) out[path] = h;
  }
  return out;
}

// reads a project from the folder (null if it has no Anvil project in it)
async function readFromFolder(fallbackName) {
  const handles = await scan();
  if (!handles[DATA_PATH] && !Object.keys(handles).some(p => kindOf(p) === 'script')) return null;
  const texts = {}, binaries = {};
  written.clear(); mtimes.clear();
  for (const [path, h] of Object.entries(handles)) {
    const kind = kindOf(path);
    const file = await h.getFile();
    if (path === DATA_PATH || TEXT_KINDS.has(kind)) { texts[path] = await file.text(); mtimes.set(path, file.lastModified); written.set(path, sigOf(texts[path])); }
    else if (BINARY_KINDS.has(kind)) binaries[path] = file;
  }
  const p = filesToProject(texts, fallbackName);
  const json = texts[DATA_PATH] ? JSON.parse(texts[DATA_PATH]) : null;
  // binary assets: bytes from disk, details (size, sprite, model tree…) from the JSON
  for (const [path, file] of Object.entries(binaries)) {
    const u8 = new Uint8Array(await file.arrayBuffer());
    const url = bytesToDataURL(u8, mimeOf(path));
    written.set(path, sigOf(url));
    const meta = json?.files?.[path];
    if (meta && meta.kind) { const d = Object.assign({}, meta.data || {}); delete d.file; d.url = url; p.files[path] = { kind: meta.kind, data: d }; }
    else p.__newBinaries = Object.assign(p.__newBinaries || {}, { [path]: file }); // dropped into the folder outside Anvil
    let dir = dirName(path); while (dir && !p.folders.includes(dir)) { p.folders.push(dir); dir = dirName(dir); }
  }
  // JSON entries whose file is gone
  for (const [path, f] of Object.entries(p.files)) if (BINARY_KINDS.has(f.kind) && !f.data?.url) delete p.files[path];
  return p;
}

async function importNewBinaries(files) {
  if (!files) return;
  const { readImage } = await import('../ui/project-panel.js');
  for (const [path, file] of Object.entries(files)) {
    const kind = kindOf(path);
    try {
      if (kind === 'texture') project.writeData(path, Object.assign(await readImage(file), { sprite: true }));
      else if (kind === 'audio') { const url = bytesToDataURL(new Uint8Array(await file.arrayBuffer()), mimeOf(path)); const { probeAudio } = await import('../runtime/audio.js'); project.writeData(path, Object.assign({ url }, await probeAudio(url))); }
      else if (kind === 'model') {
        // re-import through the model importer (it extracts materials too), then put it at the same path
        const { importModelFile } = await import('./models.js');
        await deleteFile(path); written.delete(path);
        await importModelFile(file, dirName(path));
      }
    } catch (e) { console.warn('Could not import', path, e); }
  }
}

function startPolling() {
  stopPolling();
  const tick = async () => {
    if (!root || linkedProject !== project.name || document.hidden) return;
    try { await pullExternalChanges(); } catch (e) { if (e.name === 'NotAllowedError') unlink(false); }
  };
  window.addEventListener('focus', tick);
  pollTimer = setInterval(tick, 2500);
  stopPolling.fn = tick;
}
function stopPolling() { clearInterval(pollTimer); if (stopPolling.fn) window.removeEventListener('focus', stopPolling.fn); }

// scripts and text files changed, added or deleted outside Anvil
async function pullExternalChanges() {
  const handles = await scan();
  let changed = 0;
  for (const [path, h] of Object.entries(handles)) {
    const kind = kindOf(path);
    if (!TEXT_KINDS.has(kind) || path.startsWith('Assets/Anvil/')) continue;
    const file = await h.getFile();
    if (mtimes.get(path) === file.lastModified) continue;
    mtimes.set(path, file.lastModified);
    const text = await file.text();
    written.set(path, sigOf(text));
    const cur = project.file(path);
    if (cur && cur.text === text) continue;
    project.writeText(path, text);
    const code = await import('../ui/code-editor.js'); code.reloadFromProject(path);
    changed++;
  }
  for (const path of Object.keys(project.data.files)) {
    const f = project.file(path);
    if (!TEXT_KINDS.has(f.kind) || path.startsWith('Assets/Anvil/') || handles[path] || !written.has(path)) continue;
    // deleted on disk
    written.delete(path); mtimes.delete(path);
    project.remove(path); changed++;
  }
  if (changed) { toast(`Picked up ${changed} change${changed > 1 ? 's' : ''} from the folder`); bus.emit('project-changed', 'files'); }
}

async function link(handle, { load }) {
  root = handle; linkedProject = null;
  if (load) {
    const p = await readFromFolder(handle.name);
    if (p) {
      const extra = p.__newBinaries; delete p.__newBinaries;
      await project.replace(p);
      linkedProject = project.name;
      await importNewBinaries(extra);
    }
  }
  linkedProject = project.name;
  await storage.set(handleKey(project.name), handle);
  await saveToFolder();
  startPolling();
  bus.emit('folder-status', { linked: true });
}
function unlink(forget = true) {
  if (forget && linkedProject) storage.set(handleKey(linkedProject), null);
  root = null; linkedProject = null; written.clear(); mtimes.clear(); stopPolling();
  bus.emit('folder-status', { linked: false });
}

async function pickFolder() {
  if (!folderSupported()) { toast('Working in a folder needs Chrome or Edge on a computer.', 'error'); return null; }
  try { return await window.showDirectoryPicker({ id: 'anvil-project', mode: 'readwrite' }); }
  catch (e) { if (e.name !== 'AbortError') toast(e.message || String(e), 'error'); return null; }
}

// File › Open Project Folder…: a folder with an Anvil project in it opens it; an empty folder gets this project
export async function openProjectFolder() {
  const h = await pickFolder(); if (!h) return;
  const has = await (async () => { try { for await (const [n] of h.entries()) if (n === 'Assets') return true; } catch { } return false; })();
  if (has) {
    let probe = null;
    try { probe = await (await (await (await h.getDirectoryHandle('Assets')).getDirectoryHandle('Anvil')).getFileHandle('project.anvil.json')).getFile(); } catch { }
    if (probe || has) { await link(h, { load: true }); toast(`Opened the project in folder "${h.name}". Changes are saved there.`); return; }
  }
  await link(h, { load: false });
  toast(`"${project.name}" is now saved in folder "${h.name}" on this computer.`);
}
// File › Save Project to a Folder…: always writes this project into the chosen folder
export async function saveProjectToFolder() {
  const h = await pickFolder(); if (!h) return;
  await link(h, { load: false });
  toast(`"${project.name}" is now saved in folder "${h.name}" on this computer.`);
}
export async function reconnectFolder() {
  const h = await storage.get(handleKey(project.name));
  if (!h) { toast('This project has no folder yet. Use File › Open Project Folder…'); return; }
  try {
    if ((await h.requestPermission({ mode: 'readwrite' })) !== 'granted') { toast('Anvil needs permission to edit that folder.', 'error'); return; }
    await link(h, { load: true });
    toast(`Reconnected to folder "${h.name}".`);
  } catch (e) { toast(e.message || String(e), 'error'); }
}
export function disconnectFolder() { const n = root?.name; unlink(true); if (n) toast(`Stopped saving to folder "${n}". The project stays in this browser.`); }
export async function storedFolderName() { try { return (await storage.get(handleKey(project.name)))?.name || null; } catch { return null; } }

export function initLocalFolder() {
  if (!folderSupported()) return;
  bus.on('project-saved', () => saveToFolder());
  bus.on('project-loaded', async () => {
    if (linkedProject && linkedProject !== project.name) unlink(false);
    // reconnect silently if the browser still allows it; otherwise File › Reconnect asks
    try {
      const h = await storage.get(handleKey(project.name));
      if (!h || root) return;
      if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') await link(h, { load: true });
      else bus.emit('folder-status', { needsReconnect: h.name });
    } catch { }
  });
}
// for tests (and other code): link an already-granted directory handle
export async function linkFolderHandle(handle, load = false) { await link(handle, { load }); }
export async function checkFolderNow() { await pullExternalChanges(); }
