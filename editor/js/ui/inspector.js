// Inspector panel: GameObject header, Transform, components (built-in and scripts), assets, live values in Play mode.
import { el, bus, clone, toast } from '../core/events.js';
import { editor, getPath } from '../core/scene.js';
import { project, baseName, kindOf, SCRIPT_TEMPLATE } from '../core/project.js';
import { COMPONENTS, COMPONENT_MENU, componentTitle, componentIcon, defaultFieldValue } from '../core/components.js';
import { quatToEuler, eulerToQuat, fmt } from '../core/math.js';
import { field, numberInput, vectorEditor, colorEditor, enumEditor, flagsEditor, boolEditor, textEditor, rangeEditor, objectField, scrubbable, foldout, numStr } from './fields.js';
import { showMenu } from './menus.js';
import { pick, prompt } from './dialogs.js';
import { renderSettings } from './settings.js';
import { rectTransformBlock, eventEditor, optionsEditor } from './ui-inspector.js';
import { renderControllerEditor, clipField, clipLabel, newControllerData, allClips, controllerPathFor } from './controller-editor.js';

const host = () => document.getElementById('inspector');
export const scriptMeta = new Map();   // class name -> meta from the last successful compile
let inspected = null;                  // { kind:'object', id } | { kind:'asset', path }
let folded = new Set();
let openFolds = new Set();
let selfEdit = 0;
let transformEditors = null;
let liveState = null, livePoll = null;
let activeTab = 'inspector';

const BUILTIN_BASES = {
  BoxCollider: ['Collider'], SphereCollider: ['Collider'], CapsuleCollider: ['Collider'], MeshCollider: ['Collider'], CharacterController: ['Collider'],
  MeshRenderer: ['Renderer'], Camera: ['Behaviour'], Light: ['Behaviour'], AudioSource: ['Behaviour'], AudioListener: ['Behaviour'],
  HingeJoint: ['Joint'], FixedJoint: ['Joint'], SpringJoint: ['Joint'], ConfigurableJoint: ['Joint'], CharacterJoint: ['Joint'],
  RectTransform: ['Transform'],
};
{
  const UIB = ['UIBehaviour', 'MonoBehaviour', 'Behaviour'];
  for (const k of ['Image', 'RawImage', 'Text']) BUILTIN_BASES[k] = ['MaskableGraphic', 'Graphic', ...UIB];
  for (const k of ['TextMeshProUGUI', 'TextMeshPro']) BUILTIN_BASES[k] = ['TMP_Text', 'MaskableGraphic', 'Graphic', ...UIB];
  for (const k of ['Button', 'Toggle', 'Slider', 'Scrollbar', 'InputField', 'TMP_InputField', 'Dropdown', 'TMP_Dropdown']) BUILTIN_BASES[k] = ['Selectable', ...UIB];
  for (const k of ['ScrollRect', 'Mask', 'RectMask2D', 'CanvasScaler', 'ToggleGroup', 'LayoutElement', 'ContentSizeFitter', 'AspectRatioFitter', 'EventSystem', 'StandaloneInputModule', 'InputSystemUIInputModule']) BUILTIN_BASES[k] = [...UIB];
  for (const k of ['HorizontalLayoutGroup', 'VerticalLayoutGroup']) BUILTIN_BASES[k] = ['HorizontalOrVerticalLayoutGroup', 'LayoutGroup', ...UIB];
  BUILTIN_BASES.GridLayoutGroup = ['LayoutGroup', ...UIB];
  BUILTIN_BASES.GraphicRaycaster = ['BaseRaycaster', ...UIB];
  BUILTIN_BASES.Canvas = ['Behaviour']; BUILTIN_BASES.CanvasGroup = ['Behaviour'];
  BUILTIN_BASES.Shadow = ['BaseMeshEffect', ...UIB]; BUILTIN_BASES.Outline = ['Shadow', 'BaseMeshEffect', ...UIB];
}
function typeChain(compType, script) {
  const chain = [];
  if (compType === 'Script') {
    let n = script, guard = 0;
    while (n && guard++ < 20) { chain.push(n); const m = scriptMeta.get(n); n = m ? m.base : null; if (n === 'MonoBehaviour') break; }
    chain.push('MonoBehaviour', 'Behaviour');
  } else { chain.push(compType, ...(BUILTIN_BASES[compType] || [])); }
  chain.push('Component', 'Object');
  return chain;
}
function compMatches(c, refType) { return typeChain(c.type, c.script).includes(refType); }

export function initInspector() {
  bus.on('selection-changed', () => { if (editor.selection.length) inspected = { kind: 'object', id: editor.selected }; else if (inspected?.kind === 'object') inspected = null; render(); });
  bus.on('asset-selected', (path) => { inspected = path ? { kind: 'asset', path } : null; render(); });
  bus.on('scene-changed', (e) => {
    if (selfEdit > 0) return;
    if (inspected?.kind === 'object' && transformEditors && transformEditors.id === inspected.id && (e.label === 'Transform' || e.label === 'Rotate')) {
      const o = editor.get(inspected.id); if (o) { transformEditors.p.setValues(o.p); transformEditors.e.setValues(o.e || quatToEuler(o.r)); transformEditors.s.setValues(o.s); }
      return;
    }
    render();
  });
  bus.on('meta-changed', () => render());
  bus.on('project-changed', (w) => { if (w === 'files' && inspected?.kind === 'asset' && selfEdit === 0) render(); });
  bus.on('play-state', () => { stopLive(); render(); });
  document.querySelectorAll('#panel-inspector .panel-tabs .tab').forEach(t => t.addEventListener('click', () => {
    activeTab = t.dataset.tab;
    document.querySelectorAll('#panel-inspector .panel-tabs .tab').forEach(x => x.classList.toggle('active', x === t));
    render();
  }));
  render();
}
export function showSettingsTab() {
  activeTab = 'settings';
  document.querySelectorAll('#panel-inspector .panel-tabs .tab').forEach(x => x.classList.toggle('active', x.dataset.tab === 'settings'));
  render();
}

function edit(fn) { selfEdit++; try { fn(); } finally { selfEdit--; } }

export function render() {
  const h = host(); if (!h) return;
  const scroll = h.scrollTop;
  h.innerHTML = '';
  transformEditors = null;
  if (activeTab === 'settings') { renderSettings(h); return; }
  if (editor.playing) { renderLive(h); return; }
  if (!inspected) { h.append(el('div', { class: 'insp-empty', text: 'Select a GameObject or an asset to inspect it.' })); return; }
  if (inspected.kind === 'object') {
    const o = editor.get(inspected.id);
    if (!o) { h.append(el('div', { class: 'insp-empty', text: 'Nothing selected' })); return; }
    if (editor.selection.length > 1) h.append(el('div', { class: 'insp-note info', text: `${editor.selection.length} objects selected — showing the first one (multi-object editing isn't supported).` }));
    renderObject(h, o);
  } else if (inspected.kind === 'asset') renderAsset(h, inspected.path);
  h.scrollTop = scroll;
}

// ---------------- GameObject ----------------
function tagOptions() { return ['Untagged', 'Respawn', 'Finish', 'EditorOnly', 'MainCamera', 'Player', 'GameController', ...project.settings.tags]; }
function layerOptions() {
  const builtin = { 0: 'Default', 1: 'TransparentFX', 2: 'Ignore Raycast', 4: 'Water', 5: 'UI' };
  const out = [];
  for (let i = 0; i < 32; i++) { const n = builtin[i] || project.settings.layers[i]; if (n) out.push([i, n]); }
  return out;
}

function renderObject(h, o) {
  const active = boolEditor(o.active !== false, (v) => edit(() => editor.setProp(o.id, 'active', v)));
  const name = textEditor(o.name, (v) => { if (v.trim()) editor.setProp(o.id, 'name', v.trim()); });
  const stat = boolEditor(!!o.static, (v) => edit(() => editor.setProp(o.id, 'static', v)));
  h.append(el('div', { class: 'insp-header' }, el('span', { class: 'tree-icon', text: o.prefab ? '❒' : '▢', style: { fontSize: '16px' } }), active, name, el('label', { style: { display: 'flex', gap: '4px', alignItems: 'center', color: '#aaa' } }, stat, 'Static')));
  const tagSel = el('select');
  for (const t of tagOptions()) tagSel.append(el('option', { value: t, text: t, selected: t === (o.tag || 'Untagged') }));
  tagSel.append(el('option', { value: '__add', text: 'Add Tag…' }));
  tagSel.addEventListener('change', async () => {
    if (tagSel.value === '__add') { const t = await prompt('Add Tag', 'New tag name:'); if (t && !tagOptions().includes(t)) { project.settings.tags.push(t); project.touch('settings'); editor.setProp(o.id, 'tag', t); } else render(); return; }
    editor.setProp(o.id, 'tag', tagSel.value);
  });
  const layerSel = el('select');
  for (const [i, n] of layerOptions()) layerSel.append(el('option', { value: String(i), text: `${i}: ${n}`, selected: i === (o.layer || 0) }));
  layerSel.append(el('option', { value: '__add', text: 'Add Layer…' }));
  layerSel.addEventListener('change', async () => {
    if (layerSel.value === '__add') { showSettingsTab(); return; }
    editor.setProp(o.id, 'layer', +layerSel.value);
  });
  h.append(el('div', { class: 'insp-row2' }, el('label', {}, 'Tag', tagSel), el('label', {}, 'Layer', layerSel)));
  if (o.prefab) h.append(el('div', { class: 'insp-note info', text: `Copy of prefab ${baseName(o.prefab)}. Changes here don't change the prefab asset.` }));

  // Transform (a RectTransform on UI objects)
  const rti = o.comps.findIndex(c => c.type === 'RectTransform');
  if (rti >= 0) h.append(rectTransformBlock(o, rti, { compHead, showMenu, folded, render, edit, transformEditorsSet: (t) => { transformEditors = t; } }));
  else h.append(transformBlock(o));
  // components
  o.comps.forEach((c, ci) => { if (c.type !== 'RectTransform') h.append(componentBlock(o, c, ci)); });
  const btn = el('button', { class: 'btn', text: 'Add Component' });
  btn.addEventListener('click', () => addComponentDialog(o));
  h.append(el('div', { class: 'add-comp' }, btn));
  // accept drops of scripts on the inspector
  h.ondragover = (e) => { if (e.dataTransfer.types.includes('anvil/asset')) e.preventDefault(); };
  h.ondrop = (e) => { const a = e.dataTransfer.getData('anvil/asset'); if (a) { e.preventDefault(); bus.emit('asset-dropped-on-object', { id: o.id, path: a }); } };
}

function compHead(title, icon, { enabled, onEnable, onMenu, foldKey, missing }) {
  const isFolded = folded.has(foldKey);
  const fold = el('span', { class: 'fold', text: isFolded ? '▸' : '▾' });
  const head = el('div', { class: 'comp-head' }, fold, el('span', { class: 'cicon', text: icon }));
  if (enabled !== undefined) { const cb = boolEditor(enabled, onEnable); head.append(cb); }
  head.append(el('span', { class: 'ctitle', text: title }));
  if (onMenu) { const m = el('span', { class: 'cmenu', text: '⋮' }); m.addEventListener('click', (e) => { e.stopPropagation(); onMenu(e); }); head.append(m); }
  head.addEventListener('click', (e) => { if (e.target.tagName === 'INPUT') return; if (folded.has(foldKey)) folded.delete(foldKey); else folded.add(foldKey); render(); });
  head.addEventListener('contextmenu', (e) => { if (onMenu) { e.preventDefault(); onMenu(e); } });
  return head;
}

function transformBlock(o) {
  const key = 'Transform';
  const box = el('div', { class: 'comp' + (folded.has(key) ? ' folded' : '') });
  box.append(compHead('Transform', '⊹', { foldKey: key, onMenu: (e) => showMenu([
    { label: 'Reset', action: () => editor.change(() => { o.p = [0, 0, 0]; o.r = [0, 0, 0, 1]; o.e = [0, 0, 0]; o.s = [1, 1, 1]; }, 'Reset Transform') },
    { label: 'Reset Position', action: () => editor.setTransform(o.id, 'p', [0, 0, 0]) },
    { label: 'Reset Rotation', action: () => editor.setTransform(o.id, 'e', [0, 0, 0]) },
    { label: 'Reset Scale', action: () => editor.setTransform(o.id, 's', [1, 1, 1]) },
    { label: 'Copy Component', action: () => { window.__anvilClipboard = { type: 'Transform', p: o.p.slice(), e: (o.e || quatToEuler(o.r)).slice(), s: o.s.slice() }; toast('Transform copied'); } },
    { label: 'Paste Component Values', disabled: window.__anvilClipboard?.type !== 'Transform', action: () => { const t = window.__anvilClipboard; editor.change(() => { o.p = t.p.slice(); o.e = t.e.slice(); o.r = eulerToQuat(t.e); o.s = t.s.slice(); }, 'Paste Transform Values'); } },
  ], e.clientX, e.clientY) }));
  const body = el('div', { class: 'comp-body' });
  const mk = (label, part, vals) => {
    const v = vectorEditor(vals, (nv, live) => edit(() => editor.setTransform(o.id, part, nv, 'tr-' + o.id + part)));
    const f = field(label, v, { tip: label + (part === 'p' ? ' — where the object\'s centre is, measured from its parent' : part === 's' ? ' — size multiplier (also scales children)' : ' — degrees turned around X, Y, Z') });
    return [f, v];
  };
  const [fp, vp] = mk('Position', 'p', o.p);
  const [fe, ve] = mk('Rotation', 'e', o.e || quatToEuler(o.r));
  const [fs, vs] = mk('Scale', 's', o.s);
  transformEditors = { id: o.id, p: vp, e: ve, s: vs };
  body.append(fp, fe, fs);
  box.append(body);
  return box;
}

function componentBlock(o, c, ci) {
  const key = o.id + ':' + ci + ':' + c.type;
  const def = COMPONENTS[c.type];
  const isScript = c.type === 'Script';
  const meta = isScript ? scriptMeta.get(c.script) : null;
  const box = el('div', { class: 'comp' + (folded.has(key) ? ' folded' : '') + (isScript && !meta ? ' missing' : '') });
  const hasEnabled = isScript ? (meta ? metaHasEnableToggle(c.script) : true) : !!def?.enabled;
  box.append(compHead(componentTitle(c), componentIcon(c), {
    foldKey: key,
    enabled: hasEnabled ? c.enabled !== false : undefined,
    onEnable: (v) => edit(() => editor.setComp(o.id, ci, 'enabled', v)),
    onMenu: (e) => showMenu([
      { label: 'Reset', action: () => resetComponent(o, ci) },
      '-',
      { label: 'Remove Component', action: () => editor.removeComponent(o.id, ci) },
      { label: 'Move Up', disabled: ci === 0, action: () => editor.moveComponent(o.id, ci, -1) },
      { label: 'Move Down', disabled: ci === o.comps.length - 1, action: () => editor.moveComponent(o.id, ci, 1) },
      '-',
      { label: 'Copy Component', action: () => { window.__anvilClipboard = clone(c); toast('Component copied'); } },
      { label: 'Paste Component Values', disabled: !canPasteOver(c), action: () => editor.change(() => { const clip = window.__anvilClipboard; o.comps[ci] = clip.__live ? pasteLive(c, clip) : clone(clip); }, 'Paste Component Values') },
      { label: 'Paste Component As New', disabled: !window.__anvilClipboard || window.__anvilClipboard.type === 'Transform', action: () => editor.change(() => { const clip = clone(window.__anvilClipboard); delete clip.__live; o.comps.push(clip); }, 'Paste Component') },
      isScript ? '-' : null,
      isScript ? { label: 'Edit Script', action: () => openScriptByClass(c.script) } : null,
    ], e.clientX, e.clientY),
  }));
  const body = el('div', { class: 'comp-body' });
  if (isScript) {
    const scriptPath = findScriptFile(c.script);
    body.append(field('Script', objectField(c.script, 'MonoScript', { onPing: () => scriptPath && bus.emit('ping-asset', scriptPath), onPick: () => { } })));
    if (!meta) {
      body.append(el('div', { class: 'insp-note', text: scriptPath ? 'The associated script can not be loaded. Please fix any compile errors and assign a valid script.' : `The script '${c.script}' is missing. A script file named ${c.script}.cs with a class ${c.script} is needed.` }));
    } else {
      for (const f of meta.fields) renderScriptField(body, f, getPath(c.fields || {}, f.name), (v, live) => edit(() => editor.setField(o.id, ci, f.name, v, live ? 'sf-' + o.id + ci + f.name : null)), o, ci, f.name);
    }
  } else if (def) {
    for (const f of def.fields) {
      if (f.showIf && !f.showIf(c)) continue;
      renderBuiltinField(body, editIO(o, ci, c), f, f.key);
    }
    if (c.type === 'Rigidbody') body.append(el('div', { class: 'insp-note info', text: 'Info: velocity, angular velocity, inertia tensor and centre of mass are shown here while playing.' }));
  } else body.append(el('div', { class: 'insp-note', text: `Unknown component type ${c.type}` }));
  box.append(body);
  return box;
}
function canPasteOver(c) {
  const clip = window.__anvilClipboard;
  return !!clip && clip.type === c.type && (c.type !== 'Script' || clip.script === c.script);
}
function pasteLive(c, clip) {
  const out = clone(c);
  for (const [k, v] of Object.entries(clip)) {
    if (k === '__live' || k === 'type' || k === 'script') continue;
    out[k] = k === 'fields' ? mergeLive(out.fields || {}, v) : clone(v);
  }
  return out;
}
function metaHasEnableToggle(name) {
  // Unity shows the checkbox only when the script has Start/Update/FixedUpdate/LateUpdate/OnGUI/OnEnable/OnDisable — approximate with "always"
  return true;
}
function resetComponent(o, ci) {
  const c = o.comps[ci];
  editor.change(() => {
    if (c.type === 'Script') { c.fields = {}; return; }
    const def = COMPONENTS[c.type]; if (!def) return;
    for (const f of def.fields) c[f.key] = defaultFieldValue(f);
  }, 'Reset Component');
}

// Edit-mode backend for renderBuiltinField: values live in the scene data, changes are undoable.
function editIO(o, ci, c) {
  return {
    comp: c, selfId: o.id, foldKey: o.id + ':' + ci,
    get: (kp) => getPath(c, kp),
    // rerender: the change can show/hide other fields, so let the scene-changed event redraw the Inspector
    set: (kp, v, live, rerender) => rerender ? editor.setComp(o.id, ci, kp, v) : edit(() => editor.setComp(o.id, ci, kp, v, live ? 'bf-' + o.id + ci + kp : null)),
  };
}

const PRIMITIVE_MESHES = ['Cube', 'Sphere', 'Capsule', 'Cylinder', 'Plane', 'Quad'];
function meshLabel(v) {
  if (typeof v !== 'string') return v?.name || null;
  const i = v.lastIndexOf('#'); if (i < 0) return v;
  const f = project.file(v.slice(0, i)); return f?.data?.meshes?.[+v.slice(i + 1)]?.name || 'Missing (Mesh)';
}
// io: { comp, get(keyPath), set(keyPath, value, live, rerender), bind?(keyPath, field, editor), canEdit?(field), display?(keyPath) }
function renderBuiltinField(body, io, f, keyPath) {
  const c = io.comp;
  const val = io.get(keyPath);
  const set = (v, live) => io.set(keyPath, v, live);
  const ro = (f.readOnlyIf && f.readOnlyIf(c)) || (io.canEdit && !io.canEdit(f));
  let ed;
  switch (f.type) {
    case 'float': ed = numberInput(val, set, { min: f.min, readOnly: ro }); break;
    case 'int': ed = numberInput(val, set, { int: true, readOnly: ro }); break;
    case 'bool': ed = boolEditor(val, (v) => { io.set(keyPath, v); render(); }); break;
    case 'vec3': ed = vectorEditor(val || [0, 0, 0], set, { readOnly: ro }); break;
    case 'quat': ed = vectorEditor(quatToEuler(val || [0, 0, 0, 1]), (e, live) => set(eulerToQuat(e), live)); break;
    case 'color': ed = colorEditor(val, set); break;
    case 'range': ed = rangeEditor(val ?? f.default, f.min, f.max, set); break;
    case 'enum': ed = enumEditor(f.options, f.values, val, (v) => io.set(keyPath, v, false, true)); if (ro) ed.disabled = true; break;
    case 'string': ed = textEditor(val ?? '', (v) => io.set(keyPath, v), { multiline: f.textArea || 0 }); break;
    case 'vec2': ed = vectorEditor(val || [0, 0], set, { labels: f.labels || ['X', 'Y'], readOnly: ro }); break;
    case 'vec2list': {
      // a list of 2D points (PolygonCollider2D / EdgeCollider2D outlines)
      const pts = Array.isArray(val) ? val.map(p => [p[0] || 0, p[1] || 0]) : (f.default || []).map(p => p.slice());
      const fk = io.foldKey + ':' + keyPath;
      const open = openFolds.has('open:' + fk);
      body.append(foldout(f.label + ' (' + pts.length + ')', open, (v) => { if (v) openFolds.add('open:' + fk); else openFolds.delete('open:' + fk); render(); }));
      if (open) {
        pts.forEach((p, i) => {
          const row = vectorEditor(p, (v, live) => { const n = pts.map(q => q.slice()); n[i] = v; io.set(keyPath, n, live); });
          const del = el('button', { class: 'btn small', text: '×', title: 'Remove point', style: { flex: 'none', marginLeft: '4px' } });
          del.addEventListener('click', () => { if (pts.length <= 2) return; const n = pts.filter((_, k) => k !== i); io.set(keyPath, n, false, true); });
          const w = el('div', { class: 'vec' }, row, del);
          body.append(field('Point ' + i, w, { cls: 'sub' }));
        });
        const add = el('button', { class: 'btn small', text: '+ Add Point' });
        add.addEventListener('click', () => { const last = pts[pts.length - 1] || [0, 0], first = pts[0] || [0, 0]; const n = pts.map(q => q.slice()); n.push([(last[0] + first[0]) / 2 + 0.1, (last[1] + first[1]) / 2 + 0.1]); io.set(keyPath, n, false, true); });
        body.append(field('', add, { cls: 'sub' }));
      }
      return;
    }
    case 'vec4': ed = vectorEditor(val || [0, 0, 0, 0], set, { labels: f.labels || ['X', 'Y', 'Z', 'W'], readOnly: ro }); break;
    case 'flags': ed = flagsEditor(f.options, f.bits, val || 0, (v) => io.set(keyPath, v, false, true)); break;
    case 'event': {
      if (editor.playing) { body.append(el('div', { class: 'insp-note info', text: f.label + ' — listeners can be edited after you stop.' })); return; }
      body.append(eventEditor(f.label, val, f.args || [], (v) => io.set(keyPath, v, false, true), scriptMeta));
      return;
    }
    case 'options': {
      body.append(field(f.label, el('span')));
      body.append(optionsEditor(val, (v) => io.set(keyPath, v, false, true)));
      return;
    }
    case 'constraints': {
      const boxes = [];
      const row = (label, bits) => {
        const w = el('div', { class: 'vec' });
        ['X', 'Y', 'Z'].forEach((L, i) => {
          const cb = el('input', { type: 'checkbox' }); cb.checked = ((val || 0) & bits[i]) !== 0;
          cb.addEventListener('change', () => { const cur = io.get(keyPath) || 0; io.set(keyPath, cb.checked ? cur | bits[i] : cur & ~bits[i], false, true); });
          boxes.push([cb, bits[i]]);
          w.append(el('label', { style: { flex: 'none', marginRight: '8px' } }, cb, L));
        });
        return field(label, w, { cls: 'sub' });
      };
      body.append(field('Constraints', el('span')), row('Freeze Position', [2, 4, 8]), row('Freeze Rotation', [16, 32, 64]));
      io.bind?.(keyPath, f, { setValue: (v) => { for (const [cb, bit] of boxes) cb.checked = ((v || 0) & bit) !== 0; } });
      return;
    }
    case 'struct': {
      const fk = io.foldKey + ':' + keyPath;
      const open = !openFolds.has('closed:' + fk);
      body.append(foldout(f.label, open, (v) => { if (v) openFolds.delete('closed:' + fk); else openFolds.add('closed:' + fk); render(); }));
      if (open) for (const s of f.fields) { renderBuiltinField(body, io, s, keyPath + '.' + s.key); body.lastChild.classList.add('sub'); }
      return;
    }
    case 'asset': {
      const kind = f.assetType;
      const matches = (p) => kind === 'inputactions' ? p.endsWith('.inputactions') : project.file(p)?.kind === kind;
      const label = kind === 'controller' ? 'Animator Controller' : kind === 'material' ? 'Material' : kind === 'inputactions' ? 'Input Action Asset' : kind === 'texture' ? (f.key === 'sprite' ? 'Sprite' : 'Texture') : kind === 'audio' ? 'AudioClip' : kind === 'physicsMaterial2D' ? 'Physics Material 2D' : 'Physics Material';
      const shown = io.display ? io.display(keyPath) : (val ? baseName(val) : null);
      ed = objectField(shown, label, {
        onPick: ro ? null : async () => {
          const items = [{ label: 'None', value: null }, ...Object.keys(project.data.files).filter(matches).map(p => ({ label: baseName(p), hint: p, value: p }))];
          const v = await pick('Select ' + label, items);
          if (v !== undefined) { io.set(keyPath, v, false, true); render(); }
        },
        onDrop: ({ asset }) => { if (!ro && asset && matches(asset)) { io.set(keyPath, asset, false, true); render(); } },
        onClear: ro ? null : () => io.set(keyPath, null, false, true),
        onPing: () => typeof val === 'string' && project.file(val) && bus.emit('ping-asset', val),
      });
      break;
    }
    case 'mesh': {
      const shown = val ? meshLabel(val) : null;
      ed = objectField(shown, 'Mesh', {
        onPick: ro ? null : async () => {
          const items = [{ label: 'None', value: null }, ...PRIMITIVE_MESHES.map(p => ({ label: p, value: p }))];
          for (const [p, mf] of Object.entries(project.data.files)) if (mf.kind === 'model') (mf.data?.meshes || []).forEach((m, i) => items.push({ label: m.name, hint: p, value: `${p}#${i}` }));
          const v = await pick('Select Mesh', items);
          if (v !== undefined) { io.set(keyPath, v, false, true); render(); }
        },
        onClear: ro ? null : () => io.set(keyPath, null, false, true),
        onPing: () => { const p = typeof val === 'string' && val.includes('#') ? val.slice(0, val.lastIndexOf('#')) : null; if (p && project.file(p)) bus.emit('ping-asset', p); },
      });
      break;
    }
    case 'clip': {
      ed = clipField(val, (v) => { io.set(keyPath, v, false, true); render(); });
      break;
    }
    case 'clipList': {
      const list = Array.isArray(val) ? val : [];
      body.append(field(f.label, el('span', { text: 'Size ' + list.length, style: { color: '#999' } })));
      list.forEach((item, i) => { const r = field('Element ' + i, clipField(item, (v) => { const nl = list.slice(); if (v == null) nl.splice(i, 1); else nl[i] = v; io.set(keyPath, nl, false, true); render(); })); r.classList.add('sub'); body.append(r); });
      const add = el('button', { class: 'btn', text: '+ Clip' }); add.addEventListener('click', () => { io.set(keyPath, [...list, null], false, true); render(); });
      body.append(el('div', { style: { margin: '2px 0 4px 20px' } }, add));
      return;
    }
    case 'assetList': {
      const list = Array.isArray(val) ? val : [];
      body.append(field(f.label, el('span', { text: 'Size ' + list.length, style: { color: '#999' } }), { tip: f.tip }));
      list.forEach((item, i) => {
        const sub = Object.assign({}, f, { type: 'asset', label: 'Element ' + i });
        const subIo = Object.assign({}, io, { get: () => item, set: (kp, v) => { const nl = list.slice(); nl[i] = v; io.set(keyPath, nl, false, true); }, display: null });
        renderBuiltinField(body, subIo, sub, keyPath + '.' + i);
        body.lastChild.classList.add('sub');
      });
      return;
    }
    case 'refList': {
      const list = Array.isArray(val) ? val : [];
      const names = list.slice(0, 6).map(r => r && typeof r.ref === 'number' ? (editor.get(r.ref)?.name || 'Missing') : 'None');
      ed = el('span', { text: list.length ? `${list.length}: ${names.join(', ')}${list.length > 6 ? '…' : ''}` : 'None', style: { color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } });
      break;
    }
    case 'actionmap': {
      let maps = [];
      try { const a = typeof c.actions === 'string' && project.file(c.actions); if (a) maps = (JSON.parse(a.text.replace(/^﻿/, '')).maps || []).map(m => m.name); } catch { }
      if (!maps.length && val) maps = [val];
      ed = enumEditor(maps.length ? maps : ['<None>'], maps.length ? maps : [''], val || maps[0] || '', (v) => io.set(keyPath, v, false, true));
      break;
    }
    case 'ref': {
      const target = val && typeof val.ref === 'number' ? editor.get(val.ref) : null;
      const shown = val && val.name && editor.playing ? val.name : target ? target.name : (val ? 'Missing' : null);
      ed = objectField(shown, f.refType, {
        onPick: ro ? null : async () => {
          const items = [{ label: 'None', value: null }, ...editor.objects.filter(x => x.id !== io.selfId || f.refType !== 'Rigidbody').filter(x => x.comps.some(cc => compMatches(cc, f.refType))).map(x => ({ label: x.name, hint: editor.path(x.id), value: { ref: x.id } }))];
          const v = await pick('Select ' + f.refType, items);
          if (v !== undefined) io.set(keyPath, v, false, true);
        },
        onDrop: ({ id }) => { if (ro) return; const t = id && editor.get(id); if (t && t.comps.some(cc => compMatches(cc, f.refType))) io.set(keyPath, { ref: id }, false, true); else toast(`That object has no ${f.refType}`); },
        onClear: ro ? null : () => io.set(keyPath, null, false, true),
        onPing: (single) => target && !single && editor.select(target.id),
      });
      break;
    }
    default: ed = el('span', { text: String(val) });
  }
  const row = field(f.label, ed, { tip: f.tip });
  if ((f.type === 'float' || f.type === 'int') && !ro) scrubbable(row.labelEl, () => Number(io.get(keyPath)) || 0, (v, live) => { ed.setValue(v); set(v, live); }, { int: f.type === 'int' });
  body.append(row);
  io.bind?.(keyPath, f, ed);
}

// ---------------- script fields ----------------
function valueOrDefault(v, f) { return v === undefined ? clone(f.default) : v; }

// While the live (Play mode) Inspector is being built, this connects each field editor to the running game's value.
let scriptLive = null; // { get(path), bind(path, field, editor) }

export function renderScriptField(body, f, value, set, o, ci, path, depth = 0) {
  if (f.hidden) return;
  const liveIO = scriptLive;
  if (f.header) body.append(el('div', { class: 'field header', text: f.header }));
  if (f.space) body.append(el('div', { style: { height: f.space + 'px' } }));
  const v = valueOrDefault(value, f);
  const label = f.label;
  const tip = f.tooltip || `${f.typeName} ${f.name}`;
  let ed;
  switch (f.type) {
    case 'float':
      if (f.range) ed = rangeEditor(v ?? 0, f.range[0], f.range[1], set);
      else ed = numberInput(v ?? 0, set, { min: f.min });
      break;
    case 'int':
      if (f.range) ed = rangeEditor(v ?? 0, f.range[0], f.range[1], set, { int: true });
      else ed = numberInput(v ?? 0, set, { int: true, min: f.min });
      break;
    case 'bool': ed = boolEditor(v, (nv) => set(nv, false)); break;
    case 'string': ed = textEditor(v ?? '', (nv) => set(nv, false), { multiline: f.textArea || 0 }); break;
    case 'char': ed = textEditor(v ?? '', (nv) => set(nv.slice(0, 1), false)); break;
    case 'event': {
      if (liveIO) { body.append(el('div', { class: 'insp-note info', text: label + ' (edit after you stop)' })); return; }
      body.append(eventEditor(label, Array.isArray(value) ? value : [], f.eventArgs || [], (nv) => { set(nv, false); render(); }, scriptMeta));
      return;
    }
    case 'enum':
      if (f.flags) ed = flagsEditor(f.enumNames, f.enumValues, v ?? 0, (nv) => set(nv, false));
      else ed = enumEditor(f.enumNames, f.enumValues, v ?? f.enumValues[0], (nv) => set(nv, false));
      break;
    case 'Vector2': ed = vectorEditor(v || [0, 0], set, { labels: ['X', 'Y'] }); break;
    case 'Vector3': ed = vectorEditor(v || [0, 0, 0], set); break;
    case 'Vector4': ed = vectorEditor(v || [0, 0, 0, 0], set, { labels: ['X', 'Y', 'Z', 'W'] }); break;
    case 'Vector2Int': ed = vectorEditor(v || [0, 0], set, { labels: ['X', 'Y'], int: true }); break;
    case 'Vector3Int': ed = vectorEditor(v || [0, 0, 0], set, { int: true }); break;
    case 'Quaternion': ed = vectorEditor(quatToEuler(v || [0, 0, 0, 1]), (e, live) => set(eulerToQuat(e), live)); break;
    case 'Color': ed = colorEditor(v || [1, 1, 1, 1], set); break;
    case 'Rect': ed = vectorEditor(v || [0, 0, 0, 0], set, { labels: ['X', 'Y', 'W', 'H'] }); break;
    case 'LayerMask': {
      const layers = layerOptions();
      ed = flagsEditor(layers.map(l => l[1]), layers.map(l => 1 << l[0]), v ?? 0, (nv) => set(nv, false));
      break;
    }
    case 'ref': ed = refField(f, v, set, o); break;
    case 'array': {
      const arr = Array.isArray(v) ? v : [];
      // while playing, edit the array as it is now (the game may have changed other elements since this was drawn)
      const cur = () => { const x = liveIO?.get(path); return Array.isArray(x) ? x : arr; };
      const fk = 'arr:' + (o ? o.id + ':' + ci + ':' : '') + path;
      const open = openFolds.has(fk);
      const size = numberInput(arr.length, (n) => {
        n = Math.max(0, Math.min(10000, Math.round(n)));
        const na = cur().slice(0, n);
        while (na.length < n) na.push(na.length ? clone(na[na.length - 1]) : defaultElement(f.element));
        set(na, false); openFolds.add(fk); render();
      }, { int: true, min: 0 });
      size.style.maxWidth = '60px';
      const head = foldout(label, open, (nv) => { if (nv) openFolds.add(fk); else openFolds.delete(fk); render(); });
      head.querySelector('.flabel').style.flex = '1';
      head.append(el('div', { class: 'fvalue', style: { flex: 'none' } }, size));
      body.append(head);
      if (open) {
        const inner = el('div', { class: 'array-body' });
        arr.forEach((item, i) => {
          const ef = Object.assign({}, f.element, { name: String(i), label: 'Element ' + i, default: defaultElement(f.element), header: null, space: null, hidden: false });
          renderScriptField(inner, ef, item, (nv, live) => { const na = cur().slice(); na[i] = nv; set(na, live); }, o, ci, path + '.' + i, depth + 1);
        });
        const add = el('button', { class: 'btn small', text: '+', title: 'Add element' });
        add.addEventListener('click', () => { const na = cur().slice(); na.push(na.length ? clone(na[na.length - 1]) : defaultElement(f.element)); set(na, false); render(); });
        const rem = el('button', { class: 'btn small', text: '−', title: 'Remove last element' });
        rem.addEventListener('click', () => { const na = cur().slice(0, -1); set(na, false); render(); });
        inner.append(el('div', { style: { display: 'flex', gap: '4px', justifyContent: 'flex-end', padding: '2px 0' } }, add, rem));
        body.append(inner);
      }
      return;
    }
    case 'struct':
    case 'unityStruct': {
      const fk = 'st:' + (o ? o.id + ':' + ci + ':' : '') + path;
      const open = openFolds.has(fk);
      body.append(foldout(label, open, (nv) => { if (nv) openFolds.add(fk); else openFolds.delete(fk); render(); }));
      if (open) {
        const inner = el('div', { class: 'array-body' });
        const obj = v && typeof v === 'object' ? v : {};
        const curObj = () => { const x = liveIO?.get(path); return x && typeof x === 'object' ? x : obj; };
        const subFields = f.type === 'unityStruct' ? (f.props || []).map(p => Object.assign({}, p, { default: obj[p.name] })) : (f.fields || []);
        for (const sf of subFields) renderScriptField(inner, sf, obj[sf.name], (nv, live) => { const no = Object.assign({}, curObj()); no[sf.name] = nv; set(no, live); }, o, ci, path + '.' + sf.name, depth + 1);
        body.append(inner);
      }
      return;
    }
    default:
      ed = el('span', { class: 'flabel', text: `(${f.typeName} is not editable in Anvil)` });
  }
  const row = field(label, ed, { tip });
  if ((f.type === 'float' || f.type === 'int') && !f.range) scrubbable(row.labelEl, () => Number(ed.value) || 0, (nv, live) => { ed.setValue(nv); set(nv, live); }, { int: f.type === 'int' });
  body.append(row);
  liveIO?.bind(path, f, ed);
}

function defaultElement(et) {
  if (!et) return null;
  switch (et.type) {
    case 'float': case 'int': return 0;
    case 'bool': return false;
    case 'string': case 'char': return '';
    case 'enum': return et.enumValues?.[0] ?? 0;
    case 'Vector2': case 'Vector2Int': return [0, 0];
    case 'Vector3': case 'Vector3Int': return [0, 0, 0];
    case 'Vector4': case 'Rect': return [0, 0, 0, 0];
    case 'Quaternion': return [0, 0, 0, 1];
    case 'Color': return [0, 0, 0, 0];
    case 'ref': return null;
    case 'struct': { const o = {}; for (const f of et.fields || []) o[f.name] = clone(f.default); return o; }
    default: return null;
  }
}

function refName(v) {
  if (!v) return null;
  if (v.name && editor.playing) return v.name;
  if (typeof v.ref === 'number') { const t = editor.get(v.ref); return t ? t.name : 'Missing'; }
  if (v.asset && v.sub) return v.sub + ' (' + baseName(v.asset) + ')';
  if (v.asset) return baseName(v.asset);
  return null;
}
const isTextAsset = (p) => project.file(p)?.kind === 'text';
function inputActionsIn(p) {
  try { const d = JSON.parse(project.file(p).text.replace(/^\uFEFF/, '')); return (d.maps || []).flatMap(m => (m.actions || []).map(a => m.name + '/' + a.name)); } catch { return []; }
}

function refCandidates(f, selfObj) {
  const rt = f.refType, items = [];
  if (f.refKind === 'GameObject' || rt === 'Transform') {
    for (const x of editor.objects) items.push({ label: x.name, hint: 'Scene · ' + editor.path(x.id), value: { ref: x.id } });
    if (f.refKind === 'GameObject') for (const p of Object.keys(project.data.files)) if (project.file(p).kind === 'prefab' || project.file(p).kind === 'model') items.push({ label: baseName(p), hint: (project.file(p).kind === 'model' ? 'Model · ' : 'Prefab · ') + p, value: { asset: p } });
  } else if (f.refKind === 'Component') {
    for (const x of editor.objects) if (x.comps.some(c => compMatches(c, rt))) items.push({ label: x.name, hint: 'Scene · ' + editor.path(x.id), value: { ref: x.id } });
    for (const p of Object.keys(project.data.files)) { const fl = project.file(p); if (fl.kind === 'prefab' && fl.data?.objects?.[0]?.comps.some(c => compMatches(c, rt))) items.push({ label: baseName(p), hint: 'Prefab · ' + p, value: { asset: p } }); }
  } else if (f.refKind === 'ScriptableObject') {
    for (const p of Object.keys(project.data.files)) { const fl = project.file(p); if (fl.kind === 'asset' && typeChain('Script', fl.data?.script).includes(rt)) items.push({ label: baseName(p), hint: p, value: { asset: p } }); }
  } else if (f.refKind === 'Material') {
    for (const p of Object.keys(project.data.files)) if (project.file(p).kind === 'material') items.push({ label: baseName(p), hint: p, value: { asset: p } });
  } else if (f.refKind === 'PhysicsMaterial' || f.refKind === 'PhysicsMaterial2D') {
    const want = f.refKind === 'PhysicsMaterial' ? 'physicsMaterial' : 'physicsMaterial2D';
    for (const p of Object.keys(project.data.files)) if (project.file(p).kind === want) items.push({ label: baseName(p), hint: p, value: { asset: p } });
  } else if (f.refKind === 'AudioClip') {
    for (const p of Object.keys(project.data.files)) if (project.file(p).kind === 'audio') items.push({ label: baseName(p), hint: p, value: { asset: p } });
  } else if (f.refKind === 'Texture') {
    for (const p of Object.keys(project.data.files)) if (project.file(p).kind === 'texture') items.push({ label: baseName(p), hint: p, value: { asset: p } });
  } else if (f.refKind === 'Mesh') {
    for (const [p, fl] of Object.entries(project.data.files)) if (fl.kind === 'model') (fl.data?.meshes || []).forEach((m, i) => items.push({ label: m.name, hint: p, value: { asset: `${p}#${i}` } }));
  } else if (f.refKind === 'AnimationClip') {
    for (const [p, fl] of Object.entries(project.data.files)) if (fl.kind === 'model') (fl.data?.clips || []).forEach((c, i) => items.push({ label: c.name, hint: p, value: { asset: `${p}#clip${i}` } }));
  } else if (f.refKind === 'TextAsset') {
    for (const p of Object.keys(project.data.files)) if (isTextAsset(p)) items.push({ label: baseName(p), hint: p, value: { asset: p } });
  } else if (f.refKind === 'InputActionAsset') {
    for (const p of Object.keys(project.data.files)) if (p.endsWith('.inputactions')) items.push({ label: baseName(p), hint: p, value: { asset: p } });
  } else if (f.refKind === 'InputActionReference') {
    for (const p of Object.keys(project.data.files)) if (p.endsWith('.inputactions')) for (const a of inputActionsIn(p)) items.push({ label: a, hint: baseName(p), value: { asset: p, sub: a } });
  }
  return items;
}

function refField(f, v, set0, o) {
  // the edit doesn't redraw the Inspector, so show the new reference in the slot straight away
  let box = null;
  const set = (nv, live) => { set0(nv, live); v = nv; box?.setValue(refName(nv)); };
  return box = objectField(refName(v), f.refType, {
    onPick: async () => {
      const r = await pick('Select ' + f.refType, [{ label: 'None', value: null }, ...refCandidates(f, o)]);
      if (r !== undefined) set(r, false);
    },
    onDrop: ({ id, asset }) => {
      if (id) {
        const t = editor.get(id);
        if (!t) return;
        if (f.refKind === 'GameObject' || f.refType === 'Transform') set({ ref: id }, false);
        else if (f.refKind === 'Component') { if (t.comps.some(c => compMatches(c, f.refType))) set({ ref: id }, false); else toast(`'${t.name}' has no ${f.refType} component`); }
        else toast(`Type mismatch: needs ${f.refType}`);
      } else if (asset) {
        const k = kindOf(asset);
        const ok = (k === 'prefab' && (f.refKind === 'GameObject' || f.refKind === 'Component')) || (k === 'asset' && f.refKind === 'ScriptableObject') || (k === 'material' && f.refKind === 'Material') || (k === 'physicsMaterial' && f.refKind === 'PhysicsMaterial') || (k === 'physicsMaterial2D' && f.refKind === 'PhysicsMaterial2D')
          || (k === 'text' && f.refKind === 'TextAsset') || (k === 'texture' && f.refKind === 'Texture') || (k === 'audio' && f.refKind === 'AudioClip') || (asset.endsWith('.inputactions') && f.refKind === 'InputActionAsset');
        if (ok) set({ asset }, false); else toast(`Type mismatch: needs ${f.refType}`);
      }
    },
    onClear: () => set(null, false),
    onPing: (single) => { if (!v) return; if (typeof v.ref === 'number' && !single) editor.select(v.ref); else if (v.asset) bus.emit('ping-asset', v.asset); },
  });
}

// ---------------- add component ----------------
async function addComponentDialog(o) {
  const items = [];
  for (const cat of COMPONENT_MENU) for (const [type, def] of Object.entries(COMPONENTS)) if (def.menu === cat) items.push({ label: def.title, hint: cat, value: { type } });
  for (const [name, m] of scriptMeta) if (m.kind === 'MonoBehaviour' && !m.abstract) items.push({ label: name, hint: 'Scripts', value: { type: 'Script', script: name } });
  items.push({ label: 'New script…', hint: 'Create', value: { type: 'NewScript' } });
  const r = await pick('Add Component', items);
  if (!r) return;
  if (r.type === 'NewScript') {
    const name = await prompt('New script', 'Name of the new MonoBehaviour script (also the class name):', 'NewMonoBehaviourScript', 'Create and Add');
    if (!name) return;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) { toast('Script names must be valid C# class names (letters, digits, _).', 'error'); return; }
    const path = `Assets/Scripts/${name}.cs`;
    if (project.exists(path)) { toast('A script with that name already exists', 'error'); return; }
    project.writeText(path, SCRIPT_TEMPLATE(name));
    bus.emit('scripts-changed', { path, compile: true });
    editor.addComponent(o.id, 'Script', name);
    return;
  }
  addScriptOrComponent(o.id, r);
}
export function addScriptOrComponent(id, r) {
  if (r.type === 'Script') {
    const m = scriptMeta.get(r.script);
    const o = editor.get(id);
    if (m?.disallowMultiple && o.comps.some(c => c.type === 'Script' && c.script === r.script)) { toast(`The component ${r.script} can't be added because ${o.name} already contains the same component.`); return; }
    editor.change(() => {
      for (const req of m?.requires || []) if (COMPONENTS[req] && !o.comps.some(c => c.type === req)) o.comps.push(Object.assign({ type: req }, Object.fromEntries((COMPONENTS[req].fields || []).map(f => [f.key, defaultFieldValue(f)])), COMPONENTS[req].enabled ? { enabled: true } : {}));
      o.comps.push({ type: 'Script', script: r.script, enabled: true, fields: {} });
    }, 'Add Component');
  } else editor.addComponent(id, r.type);
}

function findScriptFile(className) {
  const exact = Object.keys(project.data.files).find(p => project.file(p).kind === 'script' && baseName(p) === className);
  if (exact) return exact;
  return Object.keys(project.data.files).find(p => project.file(p).kind === 'script' && new RegExp('class\\s+' + className + '\\b').test(project.file(p).text || ''));
}
function openScriptByClass(name) { const p = findScriptFile(name); if (p) bus.emit('open-script', { path: p }); else toast('Script file not found'); }

// ---------------- assets ----------------
function renderAsset(h, path) {
  const f = project.file(path);
  const kind = f ? f.kind : (project.data.folders.includes(path) ? 'folder' : null);
  h.append(el('div', { class: 'insp-header' }, el('span', { class: 'tree-icon', text: '◆' }), el('b', { text: baseName(path) + (kind === 'script' ? '.cs' : '') }), el('span', { style: { color: '#888', marginLeft: 'auto' }, text: kind || '' })));
  if (!f) { h.append(el('div', { class: 'insp-empty', text: path })); return; }
  const body = el('div', { class: 'comp-body', style: { paddingLeft: '10px' } });
  h.append(body);
  if (kind === 'script') {
    const open = el('button', { class: 'btn', text: 'Open' }); open.addEventListener('click', () => bus.emit('open-script', { path }));
    body.append(el('div', { style: { display: 'flex', gap: '6px', margin: '4px 0 8px' } }, open));
    const meta = scriptMeta.get(baseName(path));
    if (meta) body.append(el('div', { class: 'insp-note info', text: `${meta.kind} · ${meta.fields.length} serialized field(s)` }));
    body.append(el('pre', { style: { font: '11.5px var(--mono)', whiteSpace: 'pre', color: '#cfcfcf', background: '#2a2a2a', padding: '8px', margin: '6px 8px', borderRadius: '3px', maxHeight: '60vh', overflow: 'auto', tabSize: 4 }, text: (f.text || '').slice(0, 20000) }));
  } else if (kind === 'material') {
    const d = f.data || (f.data = { color: [1, 1, 1, 1], metallic: 0, smoothness: 0.5 });
    const save = (k, v) => { edit(() => { d[k] = v; project.touch('material'); bus.emit('scene-changed', { label: 'Material' }); }); };
    body.append(el('div', { class: 'insp-note info', text: 'Universal Render Pipeline/Lit' }));
    body.append(field('Base Map', colorEditor(d.color, (v) => save('color', v))));
    const texF = objectField(d.texture ? baseName(d.texture) : null, 'Texture', {
      onPick: async () => { const items = [{ label: 'None', value: null }, ...Object.keys(project.data.files).filter(p => project.file(p).kind === 'texture').map(p => ({ label: baseName(p), hint: p, value: p }))]; const v = await pick('Select Texture', items); if (v !== undefined) { save('texture', v); render(); } },
      onDrop: ({ asset }) => { if (asset && project.file(asset)?.kind === 'texture') { save('texture', asset); render(); } },
      onClear: () => { save('texture', null); render(); },
      onPing: () => d.texture && bus.emit('ping-asset', d.texture),
    });
    body.append(field('Base Map Texture', texF, { tip: 'An image from Assets, tinted by the colour above' }));
    body.append(field('Metallic', rangeEditor(d.metallic ?? 0, 0, 1, (v) => save('metallic', v))));
    body.append(field('Smoothness', rangeEditor(d.smoothness ?? 0.5, 0, 1, (v) => save('smoothness', v))));
    body.append(field('Emission', colorEditor(d.emission || [0, 0, 0, 1], (v) => save('emission', v), { alpha: false })));
  } else if (kind === 'audio') {
    const d = f.data || {};
    body.append(el('div', { class: 'insp-note info', text: `AudioClip · ${(d.len || 0).toFixed(2)} s · ${d.ch === 1 ? 'mono' : 'stereo'} · ${d.freq || '?'} Hz` }));
    if (d.url) { const a = el('audio', { controls: '', src: d.url, style: { width: 'calc(100% - 16px)', margin: '8px' } }); body.append(a); }
    body.append(el('div', { class: 'insp-note', text: 'Put it on an Audio Source (AudioClip), or use an AudioClip field in a script with audioSource.PlayOneShot(clip).' }));
  } else if (kind === 'texture') {
    const d = f.data || {};
    body.append(el('div', { class: 'insp-note info', text: `Texture Type: Sprite (2D and UI) · ${d.w || '?'} × ${d.h || '?'} px` }));
    if (d.url) body.append(el('div', { style: { margin: '8px', height: '220px', background: `#222 url(${d.url}) center/contain no-repeat`, border: '1px solid #111', borderRadius: '3px' } }));
    body.append(el('div', { class: 'insp-note', text: 'Use it on a Sprite Renderer (drag it into the Scene to make a sprite), a UI Image (Source Image), a Raw Image, or a material (Base Map Texture). In scripts: a Sprite or Texture2D field, or Resources.Load from a Resources folder.' }));
  } else if (kind === 'physicsMaterial2D') {
    const d = f.data || (f.data = { friction: 0.4, bounciness: 0 });
    const save = (k, v) => edit(() => { d[k] = v; project.touch('physicsMaterial2D'); });
    body.append(field('Friction', numberInput(d.friction ?? 0.4, (v) => save('friction', v), { min: 0 })));
    body.append(field('Bounciness', numberInput(d.bounciness ?? 0, (v) => save('bounciness', v), { min: 0 })));
    body.append(el('div', { class: 'insp-note', text: 'Drag onto a 2D collider or a Rigidbody 2D. Box2D mixes two materials like Unity: friction = √(a·b), bounciness = the larger one.' }));
  } else if (kind === 'physicsMaterial') {
    const d = f.data || (f.data = { dynamicFriction: 0.6, staticFriction: 0.6, bounciness: 0, frictionCombine: 0, bounceCombine: 0 });
    const save = (k, v) => edit(() => { d[k] = v; project.touch('physicsMaterial'); });
    body.append(field('Dynamic Friction', numberInput(d.dynamicFriction ?? 0.6, (v) => save('dynamicFriction', v))));
    body.append(field('Static Friction', numberInput(d.staticFriction ?? 0.6, (v) => save('staticFriction', v))));
    body.append(field('Bounciness', numberInput(d.bounciness ?? 0, (v) => save('bounciness', v), { min: 0, max: 1 })));
    const combine = ['Average', 'Multiply', 'Minimum', 'Maximum'];
    body.append(field('Friction Combine', enumEditor(combine, [0, 1, 2, 3], d.frictionCombine ?? 0, (v) => save('frictionCombine', v))));
    body.append(field('Bounce Combine', enumEditor(combine, [0, 1, 2, 3], d.bounceCombine ?? 0, (v) => save('bounceCombine', v))));
  } else if (kind === 'asset') {
    const d = f.data || (f.data = { script: '', fields: {} });
    const meta = scriptMeta.get(d.script);
    body.append(field('Script', objectField(d.script || null, 'MonoScript', { onPing: () => { const p = findScriptFile(d.script); if (p) bus.emit('ping-asset', p); } })));
    if (!meta) body.append(el('div', { class: 'insp-note', text: 'The associated script can not be loaded. Please fix any compile errors.' }));
    else for (const fl of meta.fields) renderScriptField(body, fl, getPath(d.fields || {}, fl.name), (v) => edit(() => { d.fields = d.fields || {}; d.fields[fl.name] = v; project.touch('asset'); render(); }), null, 0, fl.name);
  } else if (kind === 'controller') {
    renderControllerEditor(body, path, f, () => edit(() => project.touch('controller')), render);
  } else if (kind === 'model') {
    const d = f.data || {};
    const verts = (d.meshes || []).reduce((a, m) => a + (m.verts || 0), 0);
    body.append(el('div', { class: 'insp-note info', text: `Model (.${d.fmt}) · ${((d.size || 0) / 1024).toFixed(0)} KB · ${(d.meshes || []).length} mesh(es), ${verts} vertices · ${(d.objects || []).length} GameObject(s)` }));
    body.append(el('div', { class: 'insp-note', text: 'Drag it into the Hierarchy or Scene to place it, or into a GameObject field so a script can Instantiate() it. Its materials were extracted next to it and can be edited.' }));
    const list = (title, items) => { if (!items.length) return; body.append(el('div', { style: { color: '#ddd', margin: '8px 8px 2px', fontWeight: '600' }, text: title })); for (const t of items) body.append(el('div', { style: { color: '#aaa', margin: '1px 16px' }, text: t })); };
    list('Meshes', (d.meshes || []).map(m => `${m.name} · ${m.verts} verts${m.subs > 1 ? ' · ' + m.subs + ' sub-meshes' : ''}`));
    if ((d.clips || []).length) {
      body.append(el('div', { style: { color: '#ddd', margin: '8px 8px 2px', fontWeight: '600' }, text: 'Animation clips' }));
      d.clips.forEach((c) => body.append(field(`${c.name} · ${c.length.toFixed(2)} s`, el('label', { style: { display: 'flex', gap: '4px', alignItems: 'center' } }, boolEditor(!!c.loop, (v) => edit(() => { c.loop = v; project.touch('model'); })), 'Loop Time'))));
      const mk = el('button', { class: 'btn', text: 'Create Animator Controller' });
      mk.addEventListener('click', () => {
        const p = project.uniquePath(path.slice(0, path.lastIndexOf('/')), baseName(path) + ' Controller', 'controller');
        project.writeData(p, newControllerData(allClips().filter(c => c.model === path)));
        bus.emit('ping-asset', p);
      });
      body.append(el('div', { style: { margin: '6px 8px' } }, mk));
    }
    list('Materials', (d.materials || []).map(baseName));
  } else if (kind === 'prefab') {
    const root = f.data?.objects?.[0];
    body.append(el('div', { class: 'insp-note info', text: `Prefab with ${f.data?.objects?.length || 0} GameObject(s). Drag it into the Hierarchy or Scene to place a copy, or into a script's GameObject field so Instantiate() can spawn it.` }));
    if (root) body.append(el('div', { style: { color: '#bbb', marginTop: '6px' }, text: 'Root components: ' + root.comps.map(c => componentTitle(c)).join(', ') }));
  } else if (kind === 'scene') {
    const open = el('button', { class: 'btn', text: 'Open Scene' }); open.addEventListener('click', () => bus.emit('open-scene', path));
    body.append(open);
  } else if (kind === 'text') {
    body.append(el('pre', { style: { font: '11.5px var(--mono)', whiteSpace: 'pre-wrap', margin: '6px 8px', overflow: 'auto' }, text: (f.text || '').slice(0, 20000) }));
  }
}

// ---------------- play mode (live values) ----------------
// While playing, the Inspector shows the running game's values (refreshed ~10 times a second) in the same layout as
// edit mode, and every field is editable: a change goes straight into the running game, with no recompile and no
// restart. Like Unity, the values go back when you stop; to keep them, use the component menu (⋮) > Copy Component,
// then after stopping, Paste Component Values.
let live = null; // { id, shape, binds, model, euler }

function stopLive() { if (livePoll) { clearInterval(livePoll); livePoll = null; } liveState = null; live = null; }

// JSON for the engine (keeps Infinity, which JSON.stringify would turn into null)
const liveJson = (v) => JSON.stringify(v ?? null, (k, x) => x === Infinity ? 'Infinity' : x === -Infinity ? '-Infinity' : x);

// Editor schema key -> name of the engine member, and how to read its live value
function liveMember(c, key) {
  if (c.script) return 'm_' + key[0].toUpperCase() + key.slice(1);           // built-in behaviours (PlayerInput): serialized fields
  if (key === 'lightType') return 'type';
  if (key === 'material') return 'sharedMaterial';
  if (key === 'mesh') return 'sharedMesh';
  return key;
}
function liveRaw(c, key) {
  if (c.script) return c.fields?.[liveMember(c, key)];
  if (key === 'mesh') return c.props.mesh ?? c.props.sharedMesh?.name;
  return c.props?.[liveMember(c, key)];
}
const ASSET_KEYS = new Set(['material', 'actions', 'clip']);
// The live state as edit-mode-shaped components, so the edit-mode field code (and its showIf rules) can draw them
function liveModel(st) {
  const comps = [];
  for (const c of st.comps) {
    const builtinDef = c.type === 'Script' ? (!scriptMeta.has(c.script) && COMPONENTS[c.script]) : COMPONENTS[c.type];
    if (c.type === 'Script' && !builtinDef) { comps.push({ c, kind: c.missing ? 'missing' : 'script' }); continue; }
    if (!builtinDef) { comps.push({ c, kind: 'unknown' }); continue; }
    const vc = { type: c.type === 'Script' ? c.script : c.type, enabled: c.enabled ?? c.props?.enabled };
    const raw = {};
    for (const f of builtinDef.fields) {
      let v = liveRaw(c, f.key);
      raw[f.key] = v;
      if (ASSET_KEYS.has(f.key)) v = v ? (v.asset || v.name) : null; // asset path when known, else just "assigned"
      vc[f.key] = v;
    }
    comps.push({ c, kind: 'builtin', def: builtinDef, vc, raw, visible: builtinDef.fields.filter(f => !f.showIf || f.showIf(vc)).map(f => f.key) });
  }
  return { st, comps };
}
// Rebuild the panel only when its layout changes (components added/removed, arrays resized, fields shown/hidden)
function shapeOf(v) {
  if (v == null) return 'n';
  if (Array.isArray(v)) return '[' + v.map(shapeOf).join(',') + ']';
  if (typeof v === 'object') return ('name' in v && 'type' in v) ? 'r' : '{' + Object.keys(v).map(k => k + ':' + shapeOf(v[k])).join(',') + '}';
  return 'p';
}
function liveShape(m) {
  return m.st.id + '|' + m.comps.map(x => x.c.index + x.c.type + (x.c.script || '') + ':' + (x.kind === 'builtin' ? x.visible.join(',') + (x.c.info ? '|i' + Object.keys(x.c.info).join(',') : '') : x.kind === 'script' ? shapeOf(x.c.fields) : '')).join(';');
}
// Same rotation, written close to the previous numbers (so -14° doesn't jump to 346°, like Unity's inspector)
function nearEuler(e, prev) {
  if (!prev) return e.map(x => x > 180 ? x - 360 : x);
  return e.map((x, i) => { let y = x; while (y - prev[i] > 180) y -= 360; while (prev[i] - y > 180) y += 360; return Math.round(y * 10000) / 10000; });
}

function renderLive(h) {
  stopLive();
  const id = editor.selected;
  if (id == null) { h.append(el('div', { class: 'insp-empty', text: 'Playing — select an object in the Hierarchy to see and change its live values.' })); return; }
  const tick = () => {
    const engine = bus.engine;
    if (!engine?.ready || !editor.playing) return;
    if (h.querySelector('.scrub:active')) return; // dragging a label: the drag already sets the value
    const json = engine.inspect(id);
    if (json === liveState) return;
    if (!json || json === 'null') { liveState = json; live = null; h.innerHTML = ''; h.append(el('div', { class: 'insp-empty', text: 'That object no longer exists.' })); return; }
    const m = liveModel(JSON.parse(json));
    const shape = liveShape(m);
    if (!live || live.shape !== shape) {
      const typing = h.contains(document.activeElement) && document.activeElement !== document.body;
      if (live && typing) return; // finish typing first; rebuild after
      buildLive(h, id, m, shape);
    } else {
      live.model = m;
      for (const b of live.binds) b(m);
    }
    liveState = json;
  };
  tick();
  livePoll = setInterval(tick, 100);
}

function buildLive(h, id, m, shape) {
  const engine = bus.engine;
  const prevEuler = live && live.id === id ? live.euler : (editor.get(id)?.e || null);
  live = { id, shape, binds: [], model: m, euler: null };
  const L = live;
  const st = m.st;
  const scroll = h.scrollTop;
  h.innerHTML = '';
  h.classList.add('playmode-tint');
  const set = (comp, member, value) => {
    const err = engine.setValue(id, comp, member, liveJson(value));
    if (err) toast(`Couldn't change ${member}: ${err}`);
    liveState = null; // read it back on the next tick
  };
  const bindVal = (get, ed, conv = (x) => x) => {
    let last;
    L.binds.push((mm) => { const v = get(mm); const k = liveJson(v); if (k === last) return; last = k; if (v === undefined) return; const cv = conv(v); if (ed.setValues) ed.setValues(cv); else ed.setValue?.(cv); });
    last = liveJson(get(m));
  };
  // header
  const active = boolEditor(st.active, (v) => set(-1, 'active', v));
  const name = textEditor(st.name, (v) => { if (v.trim()) set(-1, 'name', v.trim()); });
  bindVal(mm => mm.st.active, active); bindVal(mm => mm.st.name, name);
  h.append(el('div', { class: 'insp-header' }, el('span', { class: 'tree-icon', text: '▢', style: { fontSize: '16px' } }), active, name));
  const tags = tagOptions(); if (!tags.includes(st.tag)) tags.push(st.tag);
  const tagSel = enumEditor(tags, tags, st.tag, (v) => set(-1, 'tag', v));
  const layers = layerOptions(); if (!layers.some(l => l[0] === st.layer)) layers.push([st.layer, 'Layer ' + st.layer]);
  const layerSel = enumEditor(layers.map(([i, n]) => `${i}: ${n}`), layers.map(l => l[0]), st.layer, (v) => set(-1, 'layer', v));
  bindVal(mm => mm.st.tag, tagSel); bindVal(mm => mm.st.layer, layerSel);
  h.append(el('div', { class: 'insp-row2' }, el('label', {}, 'Tag', tagSel), el('label', {}, 'Layer', layerSel)));

  // Transform
  const tKey = 'live-Transform';
  const tb = el('div', { class: 'comp' + (folded.has(tKey) ? ' folded' : '') });
  tb.append(compHead('Transform', '⊹', { foldKey: tKey, onMenu: (e) => showMenu([
    { label: 'Copy Component', action: () => { const t = L.model.st.t; window.__anvilClipboard = { type: 'Transform', __live: true, p: t.p, e: L.euler || t.e, s: t.s }; toast('Transform copied — after you stop, use Paste Component Values on the Transform to keep it'); } },
  ], e.clientX, e.clientY) }));
  const tbody = el('div', { class: 'comp-body' });
  const vp = vectorEditor(st.t.p, (v) => set(-1, 'p', v));
  L.euler = nearEuler(st.t.e, prevEuler);
  const ve = vectorEditor(L.euler, (v) => { L.euler = v.slice(); set(-1, 'e', v); });
  const vs = vectorEditor(st.t.s, (v) => set(-1, 's', v));
  bindVal(mm => mm.st.t.p, vp);
  bindVal(mm => mm.st.t.e, ve, (e) => (L.euler = nearEuler(e, L.euler)));
  bindVal(mm => mm.st.t.s, vs);
  tbody.append(field('Position', vp), field('Rotation', ve), field('Scale', vs));
  tb.append(tbody); h.append(tb);

  for (const x of m.comps) {
    const c = x.c;
    const fk = 'live-' + c.index + (c.script || c.type);
    const isScript = x.kind === 'script' || x.kind === 'missing';
    const title = isScript ? c.script + ' (Script)' : x.kind === 'builtin' ? componentTitle({ type: x.vc.type }) : c.type;
    const icon = isScript ? '#' : x.kind === 'builtin' ? componentIcon({ type: x.vc.type }) : '◆';
    const hasEnabled = isScript || (x.kind === 'builtin' && x.def.enabled);
    const box = el('div', { class: 'comp' + (folded.has(fk) ? ' folded' : '') + (x.kind === 'missing' ? ' missing' : '') });
    const head = compHead(title, icon, {
      foldKey: fk,
      enabled: hasEnabled ? (c.enabled ?? c.props?.enabled ?? true) : undefined,
      onEnable: (v) => set(c.index, 'enabled', v),
      onMenu: (e) => showMenu([{ label: 'Copy Component', action: () => { window.__anvilClipboard = liveCopy(L.model.comps.find(y => y.c.index === c.index) || x); toast('Component copied — after you stop, use Paste Component Values to keep these values'); } }], e.clientX, e.clientY),
    });
    const cb = head.querySelector('input[type=checkbox]');
    if (cb) bindVal(mm => { const y = mm.comps.find(z => z.c.index === c.index)?.c; return y ? (y.enabled ?? y.props?.enabled) : undefined; }, cb);
    box.append(head);
    const body = el('div', { class: 'comp-body' });
    const cur = (mm) => mm.comps.find(z => z.c.index === c.index);
    if (x.kind === 'missing') body.append(el('div', { class: 'insp-note', text: 'Missing script' }));
    else if (x.kind === 'script') {
      const meta = scriptMeta.get(c.script);
      if (!meta) body.append(el('div', { class: 'insp-note', text: 'Recompile to see this script\'s fields.' }));
      else {
        const fieldsNow = (mm) => cur(mm)?.c.fields || {};
        scriptLive = {
          get: (path) => getPath(fieldsNow(L.model), path.replace(/^live:/, '')),
          bind: (path, f, ed) => {
            const p = path.replace(/^live:/, '');
            const conv = f.type === 'Quaternion' ? quatToEuler : f.type === 'ref' ? refName : (v) => v;
            bindVal(mm => getPath(fieldsNow(mm), p), ed, conv);
          },
        };
        try { for (const f of meta.fields) renderScriptField(body, f, c.fields[f.name], (v) => set(c.index, f.name, v), null, c.index, 'live:' + f.name); }
        finally { scriptLive = null; }
      }
    } else if (x.kind === 'builtin') {
      const io = {
        comp: x.vc, selfId: id, foldKey: 'live:' + c.index,
        get: (kp) => getPath(cur(L.model)?.vc || x.vc, kp),
        set: (kp, v) => {
          const [top, ...rest] = kp.split('.');
          const f = x.def.fields.find(ff => ff.key === top);
          let value = v;
          if (rest.length) { value = clone(getPath(cur(L.model)?.raw || x.raw, top) || {}); let o = value; for (let i = 0; i < rest.length - 1; i++) o = o[rest[i]] ??= {}; o[rest[rest.length - 1]] = v; }
          else if (f?.type === 'asset') value = v ? { asset: v } : null;
          set(c.index, liveMember(c, top), value);
        },
        canEdit: (f) => !(f.key === 'mesh' || f.key === 'clip' || f.key === 'actions' || (f.type === 'asset' && f.assetType === 'inputactions')),
        display: (kp) => { const r = (cur(L.model)?.raw || x.raw)[kp]; return r ? (r.asset ? baseName(r.asset) : r.name) : null; },
        bind: (kp, f, ed) => {
          const conv = f.type === 'quat' ? quatToEuler : f.type === 'asset' ? null : f.type === 'ref' ? refName : (v) => v;
          if (f.type === 'asset') { bindVal(mm => (cur(mm)?.raw || {})[kp], ed, (r) => r ? (r.asset ? baseName(r.asset) : r.name) : null); return; }
          if (f.type === 'struct') return;
          bindVal(mm => getPath(cur(mm)?.vc || {}, kp), ed, conv);
        },
      };
      for (const f of x.def.fields) if (x.visible.includes(f.key)) renderBuiltinField(body, io, f, f.key);
      if (c.info) {
        body.append(el('div', { class: 'field header', text: 'Info' }));
        for (const k of Object.keys(c.info)) {
          const span = el('span', { text: liveText(c.info[k]), style: { color: '#9fd0ff', fontFamily: 'var(--mono)', fontSize: '11px' } });
          L.binds.push((mm) => { const v = cur(mm)?.c.info?.[k]; const t = liveText(v); if (span.textContent !== t) span.textContent = t; });
          body.append(field(k, span, { cls: 'info' }));
        }
      }
    } else body.append(el('div', { class: 'insp-note', text: `${c.type} (shown in the Inspector after export to Unity)` }));
    box.append(body); h.append(box);
  }
  h.append(el('div', { class: 'insp-note info', style: { margin: '8px' }, text: 'Changes made while playing go straight into the running game and are undone when you stop. To keep them: ⋮ > Copy Component now, then Paste Component Values after stopping.' }));
  h.scrollTop = scroll;
}

// Copy of a live component in edit-mode format; object references are left out so pasting keeps the scene's own.
function stripRefs(v) {
  if (Array.isArray(v)) return v.map(stripRefs);
  if (v && typeof v === 'object') { if ('name' in v && 'type' in v) return undefined; const o = {}; for (const k of Object.keys(v)) o[k] = stripRefs(v[k]); return o; }
  return v;
}
function liveCopy(x) {
  const c = x.c;
  if (x.kind === 'script') return { type: 'Script', script: c.script, enabled: c.enabled, fields: stripRefs(c.fields), __live: true };
  if (x.kind !== 'builtin') return null;
  const out = { type: x.vc.type, enabled: x.vc.enabled, __live: true };
  for (const f of x.def.fields) if (f.type !== 'asset' && f.type !== 'ref' && f.key !== 'mesh') out[f.key] = clone(x.vc[f.key]);
  return out;
}
// Paste values copied while playing over an edit-mode component (anything left out keeps its current value)
function mergeLive(orig, v) {
  if (v === undefined) return orig;
  if (Array.isArray(v)) return v.map((x, i) => mergeLive(Array.isArray(orig) ? orig[i] : undefined, x));
  if (v && typeof v === 'object') { const o = orig && typeof orig === 'object' && !Array.isArray(orig) ? Object.assign({}, orig) : {}; for (const k of Object.keys(v)) o[k] = mergeLive(o[k], v[k]); return o; }
  return v;
}
function liveText(v) {
  if (v == null) return 'None';
  if (Array.isArray(v)) return '(' + v.map(x => typeof x === 'number' ? fmt(x) : liveText(x)).join(', ') + ')';
  if (typeof v === 'object') { if ('name' in v && 'type' in v) return `${v.name} (${v.type})`; return Object.entries(v).map(([k, x]) => `${k}: ${liveText(x)}`).join('  '); }
  if (typeof v === 'number') return fmt(v);
  return String(v);
}
