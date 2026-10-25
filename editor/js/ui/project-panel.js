// Project panel: folder tree + asset grid (scripts, scenes, prefabs, materials...). Create, rename, move, delete, drag.
import { defaultInputActions } from '../core/input-actions.js';
import { el, bus, toast, clone } from '../core/events.js';
import { project, baseName, dirName, fileName, kindOf, SCRIPT_TEMPLATE, SO_TEMPLATE, newSceneData } from '../core/project.js';
import { editor } from '../core/scene.js';
import { showMenu } from './menus.js';
import { prompt, confirm } from './dialogs.js';
import { scriptMeta } from './inspector.js';

const view = () => document.getElementById('project-view');
let current = 'Assets';
let selected = null;
let renaming = null;
let renameDraft = null;
let collapsed = new Set();
let search = '';

const ICON = { script: '#', scene: '◈', prefab: '❒', material: '', physicsMaterial: '◒', asset: '◆', text: '≡', folder: '📁' };

export function initProjectPanel() {
  bus.on('project-changed', (w) => { if (w === 'files' || w === 'scene' || w === 'settings') render(); });
  bus.on('project-loaded', () => { current = 'Assets'; selected = null; render(); });
  bus.on('ping-asset', (path) => { current = project.data.folders.includes(path) ? path : dirName(path); selected = path; render(); bus.emit('show-bottom-tab', 'project'); bus.emit('asset-selected', path); });
  bus.on('meta-changed', () => render());
  render();
}

export function render() {
  const v = view(); if (!v || !project.data) return;
  v.innerHTML = '';
  // tree
  const tree = el('div', { class: 'proj-tree' });
  const walk = (dir, depth) => {
    const name = fileName(dir);
    const kids = project.data.folders.filter(f => dirName(f) === dir).sort((a, b) => a.localeCompare(b));
    const open = !collapsed.has(dir);
    const row = el('div', { class: 'tree-row' + (current === dir ? ' selected' : '') });
    row.style.paddingLeft = (depth * 12 + 2) + 'px';
    const arrow = el('span', { class: 'tree-arrow', text: kids.length ? (open ? '▾' : '▸') : '' });
    arrow.addEventListener('click', (e) => { e.stopPropagation(); if (collapsed.has(dir)) collapsed.delete(dir); else collapsed.add(dir); render(); });
    row.append(arrow, el('span', { class: 'tree-icon', text: '📁', style: { filter: 'grayscale(.3)' } }), el('span', { class: 'tname', text: name }));
    row.addEventListener('click', () => { current = dir; selected = null; render(); });
    folderDrop(row, dir);
    row.addEventListener('contextmenu', (e) => { e.preventDefault(); current = dir; render(); showMenu(createMenu(dir), e.clientX, e.clientY); });
    tree.append(row);
    if (open) for (const k of kids) walk(k, depth + 1);
  };
  walk('Assets', 0);
  // main
  const main = el('div', { class: 'proj-main' });
  const searchBox = el('input', { type: 'text', placeholder: 'Search', value: search, spellcheck: 'false', style: { width: '160px', height: '18px', borderRadius: '9px', background: 'var(--bg-input)', border: '1px solid #1f1f1f', padding: '0 8px' } });
  searchBox.addEventListener('input', () => { search = searchBox.value; renderGrid(grid); });
  searchBox.addEventListener('keydown', e => e.stopPropagation());
  const addBtn = el('button', { class: 'icon-btn', text: '＋▾', title: 'Create' });
  addBtn.addEventListener('click', (e) => { const r = addBtn.getBoundingClientRect(); showMenu(createMenu(current), r.left, r.bottom); });
  main.append(el('div', { class: 'proj-bar' }, addBtn, el('span', { class: 'proj-crumbs', text: current.split('/').join(' › ') }), searchBox));
  const grid = el('div', { class: 'proj-grid', tabindex: '0' });
  grid.addEventListener('contextmenu', (e) => { if (e.target.closest('.asset')) return; e.preventDefault(); showMenu(createMenu(current), e.clientX, e.clientY); });
  grid.addEventListener('keydown', onKey);
  grid.addEventListener('click', (e) => { if (!e.target.closest('.asset')) { selected = null; renderGrid(grid); bus.emit('asset-selected', null); } });
  folderDrop(grid, () => current);
  // files from the OS
  grid.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
  grid.addEventListener('drop', async (e) => {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    for (const f of e.dataTransfer.files) await importFile(f, current);
  });
  renderGrid(grid);
  main.append(grid);
  v.append(tree, main);
}

function renderGrid(grid) {
  grid.innerHTML = '';
  let folders, files;
  if (search.trim()) {
    const q = search.toLowerCase();
    folders = [];
    files = Object.keys(project.data.files).filter(p => fileName(p).toLowerCase().includes(q)).sort();
  } else ({ folders, files } = project.listDir(current));
  for (const f of folders) grid.append(item(f, 'folder'));
  for (const f of files) grid.append(item(f, project.file(f).kind));
  if (!folders.length && !files.length) grid.append(el('div', { style: { color: '#777', padding: '10px' }, text: search ? 'No results' : 'This folder is empty. Right-click to create something.' }));
}

function item(path, kind) {
  const isSel = selected === path;
  const a = el('div', { class: 'asset' + (isSel ? ' selected' : ''), draggable: 'true', title: path });
  const icon = el('div', { class: 'aicon ' + ({ folder: 'folder', script: 'script', scene: 'scene', prefab: 'prefab', material: 'material', physicsMaterial: 'physmat', asset: 'asset', text: 'text' }[kind] || 'text'), text: kind === 'script' ? '#' : ICON[kind] || '≡' });
  if (kind === 'material') { const c = project.file(path).data?.color || [1, 1, 1, 1]; icon.style.background = `rgb(${c.slice(0, 3).map(v => Math.round(Math.pow(v, 1 / 1) * 255)).join(',')})`; }
  a.append(icon);
  if (renaming === path) {
    const ext = kind === 'folder' ? '' : fileName(path).slice(baseName(path).length);
    const inp = el('input', { class: 'rename', value: renameDraft ?? baseName(path), spellcheck: 'false' });
    inp.addEventListener('input', () => { renameDraft = inp.value; });
    const finish = (ok) => {
      if (renaming !== path || !inp.isConnected) return;
      renaming = null; renameDraft = null;
      const nn = inp.value.trim();
      if (ok && nn && nn !== baseName(path)) renameAsset(path, nn, ext, kind);
      else render();
    };
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
    inp.addEventListener('blur', () => finish(true));
    a.append(inp);
    const sel = renameDraft == null;
    queueMicrotask(() => { if (inp.isConnected) { inp.focus(); if (sel) inp.select(); } });
  } else a.append(el('div', { class: 'aname', text: kind === 'folder' ? fileName(path) : baseName(path) }));
  a.addEventListener('click', (e) => { e.stopPropagation(); selected = path; renderGrid(a.parentElement); if (kind !== 'folder') bus.emit('asset-selected', path); a.parentElement?.focus?.(); });
  a.addEventListener('dblclick', () => openAsset(path, kind));
  a.addEventListener('contextmenu', (e) => {
    e.preventDefault(); e.stopPropagation(); selected = path; renderGrid(a.parentElement);
    showMenu([
      { label: 'Open', action: () => openAsset(path, kind) },
      { label: 'Rename', shortcut: 'F2', action: () => { renaming = path; render(); } },
      { label: 'Duplicate', shortcut: 'Ctrl+D', disabled: kind === 'folder', action: () => duplicateAsset(path) },
      { label: 'Delete', shortcut: 'Del', action: () => deleteAsset(path) },
      '-',
      kind === 'script' ? { label: 'Copy code to clipboard', action: () => { navigator.clipboard.writeText(project.file(path).text || ''); toast('Script copied — paste it into Unity'); } } : null,
      kind === 'script' ? { label: 'Download .cs file', action: () => download(fileName(path), project.file(path).text || '') } : null,
      kind === 'scene' ? { label: 'Add to Scenes In Build', action: () => { if (!project.settings.scenes.includes(path)) { project.settings.scenes.push(path); project.touch('settings'); } } } : null,
      '-',
      { label: 'Create', submenu: createMenu(kind === 'folder' ? path : current) },
    ], e.clientX, e.clientY);
  });
  a.addEventListener('dragstart', (e) => { e.dataTransfer.setData('anvil/asset', path); e.dataTransfer.setData('text/plain', path); e.dataTransfer.effectAllowed = 'copyMove'; });
  if (kind === 'folder') folderDrop(a, path);
  return a;
}

function folderDrop(elem, dirOrFn) {
  elem.addEventListener('dragover', (e) => { const t = e.dataTransfer.types; if (t.includes('anvil/asset') || t.includes('anvil/object')) { e.preventDefault(); e.stopPropagation(); elem.classList.add('drop-into'); } });
  elem.addEventListener('dragleave', () => elem.classList.remove('drop-into'));
  elem.addEventListener('drop', (e) => {
    elem.classList.remove('drop-into');
    const dir = typeof dirOrFn === 'function' ? dirOrFn() : dirOrFn;
    const asset = e.dataTransfer.getData('anvil/asset');
    const objId = e.dataTransfer.getData('anvil/object');
    if (!asset && !objId) return;
    e.preventDefault(); e.stopPropagation();
    if (asset) {
      if (asset === dir || dir.startsWith(asset + '/')) return;
      const np = dir + '/' + fileName(asset);
      if (project.exists(np)) { toast('Something with that name already exists there', 'error'); return; }
      project.rename(asset, np);
      if (kindOf(asset) === 'script') bus.emit('scripts-changed', { compile: true });
    } else if (objId && !editor.playing) {
      // Hierarchy -> Project makes a prefab
      const o = editor.get(+objId); if (!o) return;
      const path = project.uniquePath(dir, o.name, 'prefab');
      project.writeData(path, editor.subtreeData(o.id));
      editor.change(() => { o.prefab = path; }, 'Create Prefab');
      toast(`Prefab ${baseName(path)} created`);
    }
  });
}

function createMenu(dir) {
  const soItems = [...scriptMeta.values()].filter(m => m.kind === 'ScriptableObject' && m.createMenu && !m.abstract)
    .map(m => ({ label: m.createMenu, action: () => createScriptableAsset(dir, m) }));
  const soPlain = [...scriptMeta.values()].filter(m => m.kind === 'ScriptableObject' && !m.createMenu && !m.abstract).map(m => ({ label: m.name, action: () => createScriptableAsset(dir, m) }));
  return [
    { label: 'Folder', action: async () => { const p = project.uniquePath(dir, 'New Folder'); project.ensureFolder(p); project.touch('files'); renaming = p; render(); } },
    '-',
    { label: 'MonoBehaviour Script', action: () => createScript(dir, 'NewMonoBehaviourScript', SCRIPT_TEMPLATE) },
    { label: 'ScriptableObject Script', action: () => createScript(dir, 'NewScriptableObjectScript', SO_TEMPLATE) },
    { label: 'Empty C# Script', action: () => createScript(dir, 'NewEmptyCSharpScript', (n) => `using UnityEngine;\n\npublic class ${n}\n{\n\n}\n`) },
    '-',
    { label: 'Scene', action: () => { const p = project.uniquePath(dir, 'New Scene', 'unity'); project.writeData(p, newSceneData()); renaming = p; render(); } },
    { label: 'Material', action: () => { const p = project.uniquePath(dir, 'New Material', 'mat'); project.writeData(p, { color: [1, 1, 1, 1], metallic: 0, smoothness: 0.5 }); renaming = p; selected = p; render(); bus.emit('asset-selected', p); } },
    { label: 'Physics Material', action: () => { const p = project.uniquePath(dir, 'New Physics Material', 'physicMaterial'); project.writeData(p, { dynamicFriction: 0.6, staticFriction: 0.6, bounciness: 0, frictionCombine: 0, bounceCombine: 0 }); renaming = p; render(); } },
    { label: 'Text File', action: () => { const p = project.uniquePath(dir, 'New Text', 'txt'); project.writeText(p, ''); renaming = p; render(); } },
    { label: 'Input Actions', action: () => { const p = project.uniquePath(dir, 'New Actions', 'inputactions'); project.writeText(p, defaultInputActions().replace('"InputSystem_Actions"', JSON.stringify(baseName(p)))); renaming = p; render(); } },
    soItems.length || soPlain.length ? '-' : null,
    ...soItems,
    soPlain.length ? { label: 'Scriptable Object', submenu: soPlain } : null,
  ];
}

async function createScript(dir, defName, template) {
  const name = await prompt('New C# script', 'Script name (it becomes the class name, so no spaces):', defName, 'Create');
  if (!name) return;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) { toast('Use letters, digits and _ only (a valid C# class name).', 'error'); return; }
  const path = `${dir}/${name}.cs`;
  if (project.exists(path)) { toast('That file already exists', 'error'); return; }
  project.writeText(path, template(name));
  selected = path; render();
  bus.emit('scripts-changed', { path, compile: true });
  bus.emit('asset-selected', path);
}

function createScriptableAsset(dir, meta) {
  const base = meta.createFile || ('New ' + meta.name);
  const p = project.uniquePath(dir, base, 'asset');
  const fields = {};
  project.writeData(p, { script: meta.name, fields });
  selected = p; renaming = p; render();
  bus.emit('asset-selected', p);
}

function renameAsset(path, newBase, ext, kind) {
  if (/[\\/:*?"<>|]/.test(newBase)) { toast('Invalid characters in name', 'error'); render(); return; }
  const np = dirName(path) + '/' + newBase + (kind === 'folder' ? '' : ext);
  if (!project.rename(path, np)) { toast('A file with that name already exists', 'error'); render(); return; }
  if (selected === path) selected = np;
  if (kind === 'script') {
    const oldClass = baseName(path);
    const f = project.file(np);
    // Unity needs class name == file name for MonoBehaviours; offer the fix automatically like the editor does when creating
    if (f.text && new RegExp(`class\\s+${oldClass}\\b`).test(f.text) && /^[A-Za-z_][A-Za-z0-9_]*$/.test(newBase)) {
      f.text = f.text.replace(new RegExp(`class\\s+${oldClass}\\b`), 'class ' + newBase);
      // update scene references to the renamed script
      for (const file of Object.values(project.data.files)) if (file.data?.objects) for (const o of file.data.objects) for (const c of o.comps) if (c.type === 'Script' && c.script === oldClass) c.script = newBase;
      project.touch('files');
    }
    bus.emit('scripts-changed', { compile: true, renamed: [path, np] });
  }
  bus.emit('asset-renamed', { from: path, to: np });
  render();
}

function duplicateAsset(path) {
  const f = project.file(path); if (!f) return;
  const ext = fileName(path).slice(baseName(path).length + 1);
  const np = project.uniquePath(dirName(path), baseName(path), ext);
  project.data.files[np] = clone(f);
  if (f.kind === 'script') { const nb = baseName(np).replace(/\s+/g, ''); }
  project.touch('files');
  selected = np; render();
}

async function deleteAsset(path) {
  const ok = await confirm('Delete selected asset?', `${path}\n\nYou cannot undo the delete assets action.`, 'Delete', true);
  if (!ok) return;
  const wasScript = kindOf(path) === 'script' || project.data.folders.includes(path);
  if (path === editor.scenePath) { toast("You can't delete the open scene", 'error'); return; }
  project.remove(path);
  if (selected === path) selected = null;
  bus.emit('asset-deleted', path);
  if (wasScript) bus.emit('scripts-changed', { compile: true });
  render();
}

function openAsset(path, kind) {
  if (kind === 'folder') { current = path; selected = null; render(); return; }
  if (kind === 'script' || kind === 'text') bus.emit('open-script', { path });
  else if (kind === 'scene') bus.emit('open-scene', path);
  else bus.emit('asset-selected', path);
}

function onKey(e) {
  if (e.target.tagName === 'INPUT') return;
  if (!selected) return;
  if (e.key === 'Delete') { deleteAsset(selected); e.preventDefault(); }
  else if (e.key === 'F2') { renaming = selected; render(); e.preventDefault(); }
  else if (e.key === 'Enter') { openAsset(selected, project.data.folders.includes(selected) ? 'folder' : project.file(selected)?.kind); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { duplicateAsset(selected); e.preventDefault(); }
}

async function importFile(file, dir) {
  const name = file.name;
  const text = await file.text();
  const path = project.uniquePath(dir, name.replace(/\.[^.]+$/, ''), name.includes('.') ? name.split('.').pop() : 'txt');
  const kind = kindOf(path);
  if (kind === 'scene' || kind === 'prefab' || kind === 'material' || kind === 'asset' || kind === 'physicsMaterial') {
    try { project.writeData(path, JSON.parse(text)); } catch { toast(`${name}: Unity's own ${kind} files can't be read; only Anvil JSON ones.`, 'error'); return; }
  } else project.writeText(path, text);
  if (kind === 'script') bus.emit('scripts-changed', { compile: true });
  toast('Imported ' + name);
}

export function download(name, text, type = 'text/plain') {
  const blob = text instanceof Blob ? text : new Blob([text], { type });
  const a = el('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
export function currentFolder() { return current; }
