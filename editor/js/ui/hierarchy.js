// Hierarchy panel: the scene's GameObjects as a tree, with Unity-style drag-to-parent.
import { el, bus } from '../core/events.js';
import { editor } from '../core/scene.js';
import { project, baseName, kindOf } from '../core/project.js';
import { showMenu } from './menus.js';
import { prompt } from './dialogs.js';
import { createMenuItems } from './create-menu.js';

const host = () => document.getElementById('hierarchy');
const expanded = new Set();
let collapsedAll = new Set();
let renamingId = null;
let renameDraft = null;   // text typed so far, kept if the tree re-renders mid-rename
let pendingFocus = null;
let dragId = null;

export function initHierarchy() {
  const h = host();
  h.tabIndex = 0;
  bus.on('scene-changed', render);
  bus.on('selection-changed', () => { render(); scrollToSelected(); });
  bus.on('scene-opened', render);
  bus.on('runtime-hierarchy', render);
  bus.on('play-state', render);
  document.getElementById('hier-search').addEventListener('input', render);
  document.getElementById('hier-add').addEventListener('click', (e) => { const r = e.target.getBoundingClientRect(); showMenu(createMenuItems(0), r.left, r.bottom); });
  h.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.tree-row')) return;
    e.preventDefault();
    if (!editor.playing) showMenu(createMenuItems(0), e.clientX, e.clientY);
  });
  h.addEventListener('keydown', onKey);
  // dropping on empty space -> root
  h.addEventListener('dragover', (e) => { if (!e.target.closest('.tree-row')) { e.preventDefault(); } });
  h.addEventListener('drop', (e) => {
    if (e.target.closest('.tree-row')) return;
    e.preventDefault();
    const id = +e.dataTransfer.getData('anvil/object');
    if (id && !editor.playing) editor.reparent(id, 0, null, true);
    const asset = e.dataTransfer.getData('anvil/asset');
    if (asset && (kindOf(asset) === 'prefab' || kindOf(asset) === 'model')) editor.instantiatePrefab(asset, 0);
  });
  render();
}

function list() {
  if (editor.playing && editor.runtime) return editor.runtime;
  return editor.objects;
}

export function render() {
  const h = host(); if (!h) return;
  const items = list();
  const q = document.getElementById('hier-search').value.trim().toLowerCase();
  h.innerHTML = '';
  const sceneName = editor.scenePath ? baseName(editor.scenePath) : 'Untitled';
  const sceneRow = el('div', { class: 'tree-row scene-root' }, el('span', { class: 'tree-arrow', text: '▾' }), el('span', { class: 'tree-icon', text: '◈' }), el('span', { class: 'tname', text: sceneName + (project.dirty && !editor.playing ? '*' : '') }));
  sceneRow.addEventListener('contextmenu', (e) => { e.preventDefault(); showMenu(createMenuItems(0), e.clientX, e.clientY); });
  h.append(sceneRow);
  const byParent = new Map();
  for (const o of items) { const p = o.parent || 0; if (!byParent.has(p)) byParent.set(p, []); byParent.get(p).push(o); }
  const sel = new Set(editor.selection);
  if (q) {
    for (const o of items) if (o.name.toLowerCase().includes(q)) h.append(row(o, 0, false, sel));
    applyPendingFocus();
    return;
  }
  const walk = (pid, depth) => {
    for (const o of byParent.get(pid) || []) {
      const kids = byParent.get(o.id) || [];
      const open = isExpanded(o.id);
      h.append(row(o, depth, kids.length > 0 ? (open ? 'open' : 'closed') : false, sel));
      if (kids.length && open) walk(o.id, depth + 1);
    }
  };
  walk(0, 1);
  applyPendingFocus();
}
function isExpanded(id) { return !collapsedAll.has(id); }

function row(o, depth, arrow, sel) {
  const r = el('div', { class: 'tree-row' + (sel.has(o.id) ? ' selected' : '') + (o.active === false ? ' inactive' : '') + (o.prefab ? ' prefab' : '') + (o.ddol ? ' ddol' : ''), draggable: editor.playing ? 'false' : 'true' });
  r.style.paddingLeft = (depth * 14 - 8) + 'px';
  r.dataset.id = o.id;
  const a = el('span', { class: 'tree-arrow', text: arrow === 'open' ? '▾' : arrow === 'closed' ? '▸' : '' });
  a.addEventListener('click', (e) => { e.stopPropagation(); if (collapsedAll.has(o.id)) collapsedAll.delete(o.id); else collapsedAll.add(o.id); render(); });
  const icon = el('span', { class: 'tree-icon', text: o.prefab ? '❒' : '▢' });
  r.append(a, icon);
  if (renamingId === o.id && !editor.playing) {
    const inp = el('input', { class: 'rename', value: renameDraft ?? o.name, spellcheck: 'false' });
    inp.addEventListener('input', () => { renameDraft = inp.value; });
    const finish = (ok) => { if (renamingId !== o.id || !inp.isConnected) return; renamingId = null; renameDraft = null; if (ok && inp.value.trim()) editor.setProp(o.id, 'name', inp.value.trim()); else render(); };
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
    inp.addEventListener('blur', () => finish(true));
    r.append(inp);
    pendingFocus = { inp, select: renameDraft == null };
  } else r.append(el('span', { class: 'tname', text: o.name }));

  r.addEventListener('click', (e) => {
    if (e.shiftKey && editor.selection.length) {
      // range select in visible order
      const rows = [...host().querySelectorAll('.tree-row[data-id]')].map(x => +x.dataset.id);
      const a1 = rows.indexOf(editor.selection[editor.selection.length - 1]), b1 = rows.indexOf(o.id);
      if (a1 >= 0 && b1 >= 0) { const [s, t] = a1 < b1 ? [a1, b1] : [b1, a1]; editor.select(rows.slice(s, t + 1)); return; }
    }
    editor.select(o.id, e.ctrlKey || e.metaKey);
    host().focus();
  });
  r.addEventListener('dblclick', (e) => { if (e.target.classList.contains('tree-arrow')) return; editor.select(o.id); bus.emit('frame-selected'); });
  r.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!editor.selection.includes(o.id)) editor.select(o.id);
    if (editor.playing) { showMenu([{ label: 'Frame Selected (F)', action: () => bus.emit('frame-selected') }], e.clientX, e.clientY); return; }
    showMenu([
      { label: 'Rename', shortcut: 'F2', action: () => startRename(o.id) },
      { label: 'Duplicate', shortcut: 'Ctrl+D', action: () => editor.duplicate(editor.selection) },
      { label: 'Delete', shortcut: 'Del', action: () => editor.remove(editor.selection) },
      '-',
      { label: 'Create Empty Parent', action: () => createEmptyParent(o.id) },
      ...createMenuItems(o.id),
      '-',
      { label: 'Frame Selected', shortcut: 'F', action: () => bus.emit('frame-selected') },
      { label: o.active === false ? 'Set Active' : 'Set Inactive', action: () => editor.setProp(o.id, 'active', o.active === false) },
    ], e.clientX, e.clientY);
  });
  // drag & drop
  r.addEventListener('dragstart', (e) => { dragId = o.id; e.dataTransfer.setData('anvil/object', String(o.id)); e.dataTransfer.setData('text/plain', o.name); e.dataTransfer.effectAllowed = 'copyMove'; });
  r.addEventListener('dragend', () => { dragId = null; clearDrop(); });
  r.addEventListener('dragover', (e) => {
    if (editor.playing) return;
    const types = e.dataTransfer.types;
    if (!types.includes('anvil/object') && !types.includes('anvil/asset')) return;
    e.preventDefault();
    clearDrop();
    if (types.includes('anvil/asset')) { r.classList.add('drop-into'); return; }
    const b = r.getBoundingClientRect();
    const y = e.clientY - b.top;
    if (y < 5) r.classList.add('drop-above'); else if (y > b.height - 5) r.classList.add('drop-below'); else r.classList.add('drop-into');
  });
  r.addEventListener('dragleave', () => r.classList.remove('drop-above', 'drop-below', 'drop-into'));
  r.addEventListener('drop', (e) => {
    e.preventDefault(); e.stopPropagation();
    const mode = r.classList.contains('drop-above') ? 'above' : r.classList.contains('drop-below') ? 'below' : 'into';
    clearDrop();
    if (editor.playing) return;
    const asset = e.dataTransfer.getData('anvil/asset');
    if (asset) { bus.emit('asset-dropped-on-object', { id: o.id, path: asset }); return; }
    const id = +e.dataTransfer.getData('anvil/object');
    if (!id || id === o.id) return;
    if (mode === 'into') { editor.reparent(id, o.id, null, true); collapsedAll.delete(o.id); }
    else {
      const parent = o.parent || 0;
      let before = o.id;
      if (mode === 'below') {
        const sibs = editor.children(parent); const i = sibs.findIndex(s => s.id === o.id);
        before = sibs[i + 1] ? sibs[i + 1].id : null;
        if (sibs[i + 1]?.id === id) before = sibs[i + 2] ? sibs[i + 2].id : null;
      }
      editor.reparent(id, parent, before, true);
    }
  });
  return r;
}
function clearDrop() { host().querySelectorAll('.drop-above,.drop-below,.drop-into').forEach(x => x.classList.remove('drop-above', 'drop-below', 'drop-into')); }

export function startRename(id) { renamingId = id; renameDraft = null; render(); }
function applyPendingFocus() { if (pendingFocus && pendingFocus.inp.isConnected) { pendingFocus.inp.focus(); if (pendingFocus.select) pendingFocus.inp.select(); else { const n = pendingFocus.inp.value.length; pendingFocus.inp.setSelectionRange(n, n); } } pendingFocus = null; }

function createEmptyParent(id) {
  const o = editor.get(id); if (!o) return;
  const pid = editor.create({ name: 'GameObject', parent: o.parent || 0, p: o.p.slice(), select: false, label: 'Create Empty Parent' });
  editor.reparent(id, pid, null, true);
  editor.select(pid);
}

function scrollToSelected() {
  const id = editor.selected; if (id == null) return;
  const r = host().querySelector(`.tree-row[data-id="${id}"]`);
  if (r) r.scrollIntoView({ block: 'nearest' });
  else {
    // expand ancestors so the selection is visible
    let o = editor.get(id), changed = false;
    while (o && o.parent) { if (collapsedAll.delete(o.parent)) changed = true; o = editor.get(o.parent); }
    if (changed) { render(); host().querySelector(`.tree-row[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' }); }
  }
}

function onKey(e) {
  if (e.target.tagName === 'INPUT') return;
  const id = editor.selected;
  if (e.key === 'F2' && id != null && !editor.playing) { startRename(id); e.preventDefault(); }
  else if ((e.key === 'Delete' || (e.key === 'Backspace' && (e.metaKey || e.ctrlKey))) && editor.selection.length && !editor.playing) { editor.remove(editor.selection); e.preventDefault(); }
  else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    const rows = [...host().querySelectorAll('.tree-row[data-id]')].map(x => +x.dataset.id);
    const i = rows.indexOf(id);
    const j = e.key === 'ArrowDown' ? Math.min(rows.length - 1, i + 1) : Math.max(0, i - 1);
    if (rows[j] != null) editor.select(rows[j]);
    e.preventDefault();
  } else if (e.key === 'ArrowLeft' && id != null) { collapsedAll.add(id); render(); }
  else if (e.key === 'ArrowRight' && id != null) { collapsedAll.delete(id); render(); }
}
