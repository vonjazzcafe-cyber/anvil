// Inspector pieces for uGUI: the RectTransform block (with anchor presets) and UnityEvent lists (On Click () ...).
import { el, bus, toast } from '../core/events.js';
import { editor } from '../core/scene.js';
import { COMPONENTS } from '../core/components.js';
import { quatToEuler } from '../core/math.js';
import { field, numberInput, vectorEditor, enumEditor, textEditor, boolEditor, objectField, scrubbable } from './fields.js';
import { pick } from './dialogs.js';

// ---------- RectTransform math (same as the engine) ----------
function rtOf(o) { return o?.comps.find(c => c.type === 'RectTransform'); }
function canvasScale(o) {
  const cv = o.comps.find(c => c.type === 'Canvas'); const sc = o.comps.find(c => c.type === 'CanvasScaler');
  if (!cv || cv.renderMode === 2 || !sc) return 1;
  const [w, h] = gameSize();
  if (sc.uiScaleMode === 1) {
    const [rw, rh] = sc.referenceResolution || [800, 600];
    if (sc.screenMatchMode === 1) return Math.min(w / rw, h / rh);
    if (sc.screenMatchMode === 2) return Math.max(w / rw, h / rh);
    const lw = Math.log2(w / rw), lh = Math.log2(h / rh); return Math.pow(2, lw + (lh - lw) * (sc.matchWidthOrHeight || 0));
  }
  if (sc.uiScaleMode === 2) return 96 / ([2.54, 25.4, 1, 72, 6][sc.physicalUnit ?? 3]);
  return sc.scaleFactor || 1;
}
export function gameSize() { try { return window.anvil.viewport.gameSize(); } catch { return [800, 600]; } }
// size of an object's rect in its own units
export function rectSize(o) {
  const rt = rtOf(o); if (!rt) return [0, 0];
  const cv = o.comps.find(c => c.type === 'Canvas');
  const parent = o.parent ? editor.get(o.parent) : null;
  const isRoot = cv && !(parent && rtOf(parent) && findCanvasUp(parent));
  if (isRoot && cv.renderMode !== 2) { const s = canvasScale(o); const [w, h] = gameSize(); return [w / s, h / s]; }
  const ps = parent && rtOf(parent) ? rectSize(parent) : [0, 0];
  return [0, 1].map(i => ps[i] * (rt.anchorMax[i] - rt.anchorMin[i]) + rt.sizeDelta[i]);
}
function findCanvasUp(o) { for (; o; o = o.parent ? editor.get(o.parent) : null) if (o.comps.some(c => c.type === 'Canvas')) return o; return null; }
function parentSize(o) { const p = o.parent ? editor.get(o.parent) : null; return p && rtOf(p) ? rectSize(p) : [0, 0]; }
const offMin = (rt, i) => rt.anchoredPosition[i] - rt.sizeDelta[i] * rt.pivot[i];
const offMax = (rt, i) => rt.anchoredPosition[i] + rt.sizeDelta[i] * (1 - rt.pivot[i]);
function setOffsets(rt, i, mn, mx) { const sd = mx - mn; rt.sizeDelta[i] = sd; rt.anchoredPosition[i] = mn + sd * rt.pivot[i]; }
// change anchors keeping the rect where it is (what Unity's Inspector does)
function setAnchorsKeep(o, rt, amin, amax) {
  const ps = parentSize(o);
  for (let i = 0; i < 2; i++) {
    const mn = offMin(rt, i) + (rt.anchorMin[i] - amin[i]) * ps[i], mx = offMax(rt, i) + (rt.anchorMax[i] - amax[i]) * ps[i];
    rt.anchorMin[i] = amin[i]; rt.anchorMax[i] = amax[i];
    setOffsets(rt, i, mn, mx);
  }
}
function setPivotKeep(o, rt, pv) {
  const size = rectSize(o);
  for (let i = 0; i < 2; i++) { rt.anchoredPosition[i] += (pv[i] - rt.pivot[i]) * size[i]; rt.pivot[i] = pv[i]; }
}
const r3 = (v) => Math.round(v * 1000) / 1000;
function tidy(rt) { for (const k of ['anchorMin', 'anchorMax', 'anchoredPosition', 'sizeDelta', 'pivot']) rt[k] = rt[k].map(r3); }

// ---------- anchor presets ----------
const H = [['left', 0, 0], ['center', 0.5, 0.5], ['right', 1, 1], ['stretch', 0, 1]];
const V = [['top', 1, 1], ['middle', 0.5, 0.5], ['bottom', 0, 0], ['stretch', 0, 1]];
function presetIcon(h, v, small) {
  const box = el('div', { class: 'ap-icon' + (small ? ' small' : '') });
  const inner = el('div', { class: 'ap-rect' });
  const st = inner.style;
  if (h[0] === 'stretch') { st.left = '3px'; st.right = '3px'; } else { st.width = '6px'; st.left = h[0] === 'left' ? '2px' : h[0] === 'right' ? 'calc(100% - 8px)' : 'calc(50% - 3px)'; }
  if (v[0] === 'stretch') { st.top = '3px'; st.bottom = '3px'; } else { st.height = '6px'; st.top = v[0] === 'top' ? '2px' : v[0] === 'bottom' ? 'calc(100% - 8px)' : 'calc(50% - 3px)'; }
  box.append(inner);
  return box;
}
function currentPreset(rt) {
  const h = H.find(x => x[1] === rt.anchorMin[0] && x[2] === rt.anchorMax[0]);
  const v = V.find(x => x[1] === rt.anchorMin[1] && x[2] === rt.anchorMax[1]);
  return [h, v];
}
function presetPopup(o, ci, anchorEl) {
  document.querySelectorAll('.ap-pop').forEach(p => p.remove());
  const pop = el('div', { class: 'ap-pop' });
  const pivotCb = boolEditor(false, () => { }), posCb = boolEditor(false, () => { });
  pop.append(el('div', { class: 'ap-title', text: 'Anchor Presets' }), el('div', { class: 'ap-opts' }, el('label', {}, pivotCb, 'Also set pivot'), el('label', {}, posCb, 'Also set position')));
  const grid = el('div', { class: 'ap-grid' });
  for (const v of V) for (const h of H) {
    const b = presetIcon(h, v);
    b.title = (v[0] === 'stretch' ? 'stretch' : v[0]) + ' / ' + h[0];
    b.addEventListener('click', () => {
      editor.change(() => {
        const rt = editor.get(o.id).comps[ci];
        setAnchorsKeep(o, rt, [h[1], v[1]], [h[2], v[2]]);
        if (pivotCb.checked) setPivotKeep(o, rt, [h[0] === 'stretch' ? 0.5 : h[1], v[0] === 'stretch' ? 0.5 : v[1]]);
        if (posCb.checked) for (let i = 0; i < 2; i++) { const stretch = (i === 0 ? h : v)[0] === 'stretch'; rt.anchoredPosition[i] = 0; if (stretch) rt.sizeDelta[i] = 0; }
        tidy(rt);
      }, 'Anchor Preset');
      pop.remove();
    });
    grid.append(b);
  }
  pop.append(grid);
  document.body.append(pop);
  const r = anchorEl.getBoundingClientRect();
  pop.style.left = Math.max(4, r.left - 4) + 'px'; pop.style.top = (r.bottom + 4) + 'px';
  setTimeout(() => document.addEventListener('pointerdown', function close(e) { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('pointerdown', close, true); } }, true), 0);
}

export function rectTransformBlock(o, ci, { compHead, showMenu, folded, render, edit, transformEditorsSet }) {
  const rt = o.comps[ci];
  const key = 'RectTransform';
  const box = el('div', { class: 'comp' + (folded.has(key) ? ' folded' : '') });
  box.append(compHead('Rect Transform', '⬚', { foldKey: key, onMenu: (e) => showMenu([
    { label: 'Reset', action: () => editor.change(() => { Object.assign(rt, { anchorMin: [0.5, 0.5], anchorMax: [0.5, 0.5], anchoredPosition: [0, 0], sizeDelta: [100, 100], pivot: [0.5, 0.5] }); o.r = [0, 0, 0, 1]; o.e = [0, 0, 0]; o.s = [1, 1, 1]; }, 'Reset Rect Transform') },
    { label: 'Copy Component', action: () => { window.__anvilClipboard = JSON.parse(JSON.stringify(rt)); toast('Rect Transform copied'); } },
    { label: 'Paste Component Values', disabled: window.__anvilClipboard?.type !== 'RectTransform', action: () => editor.change(() => { Object.assign(rt, JSON.parse(JSON.stringify(window.__anvilClipboard))); }, 'Paste Rect Transform') },
  ], e.clientX, e.clientY) }));
  const body = el('div', { class: 'comp-body rt-body' });
  const set = (fn, label = 'Rect Transform', live) => edit(() => editor.change(() => { fn(editor.get(o.id).comps[ci]); }, label, live ? 'rt-' + o.id + label : null));
  const stretchX = rt.anchorMin[0] !== rt.anchorMax[0], stretchY = rt.anchorMin[1] !== rt.anchorMax[1];
  const [hp, vp] = currentPreset(rt);
  const preset = hp && vp ? presetIcon(hp, vp, true) : el('div', { class: 'ap-icon small custom', text: '⋯' });
  preset.title = 'Anchor presets';
  preset.classList.add('ap-btn');
  preset.addEventListener('click', () => presetPopup(o, ci, preset));
  const num = (label, get, apply, tip) => {
    const inp = numberInput(get(), (v, live) => set((r) => apply(r, v), label, live));
    const lab = el('span', { class: 'rt-lab', text: label });
    scrubbable(lab, () => get(), (v, live) => { inp.setValue(v); set((r) => apply(r, v), label, live); });
    const cell = el('label', { class: 'rt-cell' }, lab, inp); if (tip) cell.title = tip;
    return cell;
  };
  const row1 = [], row2 = [];
  if (stretchX) row1.push(num('Left', () => r3(offMin(rt, 0)), (r, v) => setOffsets(r, 0, v, offMax(r, 0))));
  else row1.push(num('Pos X', () => r3(rt.anchoredPosition[0]), (r, v) => { r.anchoredPosition[0] = v; }, 'anchoredPosition.x — distance from the anchor point'));
  if (stretchY) row1.push(num('Top', () => r3(-offMax(rt, 1)), (r, v) => setOffsets(r, 1, offMin(r, 1), -v)));
  else row1.push(num('Pos Y', () => r3(rt.anchoredPosition[1]), (r, v) => { r.anchoredPosition[1] = v; }, 'anchoredPosition.y'));
  row1.push(num('Pos Z', () => r3(o.p[2]), (r, v) => { const ob = editor.get(o.id); ob.p = [ob.p[0], ob.p[1], v]; }));
  if (stretchX) row2.push(num('Right', () => r3(-offMax(rt, 0)), (r, v) => setOffsets(r, 0, offMin(r, 0), -v)));
  else row2.push(num('Width', () => r3(rt.sizeDelta[0]), (r, v) => { r.sizeDelta[0] = v; }, 'sizeDelta.x'));
  if (stretchY) row2.push(num('Bottom', () => r3(offMin(rt, 1)), (r, v) => setOffsets(r, 1, v, offMax(r, 1))));
  else row2.push(num('Height', () => r3(rt.sizeDelta[1]), (r, v) => { r.sizeDelta[1] = v; }, 'sizeDelta.y'));
  body.append(el('div', { class: 'rt-top' }, preset, el('div', { class: 'rt-grid' }, el('div', { class: 'rt-row' }, ...row1), el('div', { class: 'rt-row' }, ...row2, el('span', { class: 'rt-cell' })))));
  // anchors/pivot redraw the block (Pos X can become Left, etc.)
  const vec2 = (label, k, keep) => field(label, vectorEditor(rt[k], (v, live) => editor.change(() => { const r = editor.get(o.id).comps[ci]; keep(r, v); tidy(r); }, label, live ? 'rt-' + o.id + label : null), { labels: ['X', 'Y'] }));
  body.append(el('div', { class: 'field header', text: 'Anchors' }));
  body.append(vec2('Min', 'anchorMin', (r, v) => setAnchorsKeep(o, r, v, r.anchorMax.slice())));
  body.append(vec2('Max', 'anchorMax', (r, v) => setAnchorsKeep(o, r, r.anchorMin.slice(), v)));
  body.append(vec2('Pivot', 'pivot', (r, v) => setPivotKeep(o, r, v)));
  const ve = vectorEditor(o.e || quatToEuler(o.r), (nv, live) => edit(() => editor.setTransform(o.id, 'e', nv, 'tr-' + o.id + 'e')));
  const vs = vectorEditor(o.s, (nv, live) => edit(() => editor.setTransform(o.id, 's', nv, 'tr-' + o.id + 's')));
  body.append(field('Rotation', ve), field('Scale', vs));
  const [w, h] = rectSize(o);
  body.append(el('div', { class: 'insp-note info rt-note', text: `Rect size ${Math.round(w)} × ${Math.round(h)} (with a ${gameSize().join('×')} Game view)` }));
  transformEditorsSet?.({ id: o.id, p: { setValues: () => { } }, e: ve, s: vs });
  box.append(body);
  return box;
}

// ---------- UnityEvent editor ----------
const MODE = { '': 1, Object: 2, int: 3, float: 4, string: 5, bool: 6 };
const BUILTIN_METHODS = {
  GameObject: [['SetActive', 'bool'], ['name', 'string']],
  Behaviour: [['enabled', 'bool']],
  Image: [['fillAmount', 'float'], ['raycastTarget', 'bool']],
  Text: [['text', 'string'], ['fontSize', 'int']],
  TextMeshProUGUI: [['text', 'string'], ['SetText', 'string'], ['fontSize', 'float']],
  TextMeshPro: [['text', 'string'], ['SetText', 'string'], ['fontSize', 'float']],
  Selectable: [['interactable', 'bool'], ['Select', '']],
  Button: [], Toggle: [['isOn', 'bool']], Slider: [['value', 'float'], ['SetValueWithoutNotify', 'float']], Scrollbar: [['value', 'float']],
  InputField: [['text', 'string'], ['ActivateInputField', '']], TMP_InputField: [['text', 'string'], ['ActivateInputField', '']],
  Dropdown: [['value', 'int'], ['Show', ''], ['Hide', '']], TMP_Dropdown: [['value', 'int'], ['Show', ''], ['Hide', '']],
  CanvasGroup: [['alpha', 'float'], ['interactable', 'bool'], ['blocksRaycasts', 'bool']],
  AudioSource: [['Play', ''], ['Stop', ''], ['Pause', ''], ['UnPause', ''], ['volume', 'float'], ['mute', 'bool'], ['loop', 'bool']],
  Rigidbody: [['mass', 'float'], ['isKinematic', 'bool'], ['useGravity', 'bool'], ['WakeUp', ''], ['Sleep', '']],
  Light: [['intensity', 'float'], ['range', 'float']],
  ScrollRect: [['verticalNormalizedPosition', 'float'], ['horizontalNormalizedPosition', 'float'], ['StopMovement', '']],
};
const SELECTABLE_TYPES = new Set(['Button', 'Toggle', 'Slider', 'Scrollbar', 'InputField', 'TMP_InputField', 'Dropdown', 'TMP_Dropdown']);
function methodsFor(target, scriptMeta) {
  const out = [];
  const pushAll = (compName, list, display) => { for (const [name, param, prop] of list) out.push({ comp: compName, method: name, param, label: `${display}/${name}${prop || /^[a-z]/.test(name) ? '' : ''} (${param || ''})`.replace(' ()', ' ()') }); };
  pushAll('GameObject', BUILTIN_METHODS.GameObject, 'GameObject');
  for (const c of target.comps) {
    if (c.type === 'Script') {
      const m = scriptMeta.get(c.script);
      if (m?.methods) for (const mm of m.methods) out.push({ comp: c.script, method: mm.name, param: mm.param, label: `${c.script}/${mm.name} (${mm.param})` });
      out.push({ comp: c.script, method: 'enabled', param: 'bool', label: `${c.script}/enabled (bool)` });
      continue;
    }
    if (c.type === 'RectTransform' || c.type === 'CanvasRenderer') continue;
    const list = [...(BUILTIN_METHODS[c.type] || []), ...(SELECTABLE_TYPES.has(c.type) ? BUILTIN_METHODS.Selectable : []), ...(COMPONENTS[c.type]?.enabled ? BUILTIN_METHODS.Behaviour : [])];
    pushAll(c.type, list, COMPONENTS[c.type]?.title?.replace(/ \(.*\)/, '') || c.type);
  }
  return out;
}
export function eventEditor(label, value, args, set, scriptMeta) {
  const calls = Array.isArray(value) ? value.map(c => Object.assign({}, c)) : [];
  const box = el('div', { class: 'ev-box' });
  box.append(el('div', { class: 'ev-head', text: label }));
  const commit = () => set(calls.map(c => Object.assign({}, c)));
  if (!calls.length) box.append(el('div', { class: 'ev-empty', text: 'List is Empty' }));
  calls.forEach((call, i) => {
    const row = el('div', { class: 'ev-row' });
    const state = enumEditor(['Off', 'Editor And Runtime', 'Runtime Only'], [0, 1, 2], call.state ?? 2, (v) => { call.state = v; commit(); });
    const target = call.target && typeof call.target.ref === 'number' ? editor.get(call.target.ref) : null;
    const objF = objectField(target ? target.name : (call.target ? 'Missing' : null), 'Object', {
      onPick: async () => {
        const items = [{ label: 'None', value: null }, ...editor.objects.map(x => ({ label: x.name, hint: editor.path(x.id), value: { ref: x.id } }))];
        const v = await pick('Select Object', items);
        if (v !== undefined) { call.target = v; call.method = ''; call.comp = ''; commit(); }
      },
      onDrop: ({ id }) => { if (id) { call.target = { ref: id }; call.method = ''; call.comp = ''; commit(); } },
      onClear: () => { call.target = null; call.method = ''; commit(); },
      onPing: () => target && editor.select(target.id),
    });
    const fnLabel = call.method ? `${call.comp || 'GameObject'}.${call.method}` : 'No Function';
    const fnBtn = el('button', { class: 'btn ev-fn', text: fnLabel, title: 'Choose the method to call' });
    fnBtn.disabled = !target;
    fnBtn.addEventListener('click', async () => {
      const list = methodsFor(target, scriptMeta);
      const items = [{ label: 'No Function', value: { comp: '', method: '', mode: 1 } }];
      // dynamic: the event passes its own value (e.g. the slider's new value)
      if (args.length === 1) for (const m of list) if (m.param === args[0]) items.push({ label: m.label.replace(/ \(.*\)$/, ''), hint: 'Dynamic ' + args[0], value: { comp: m.comp, method: m.method, mode: 0 } });
      for (const m of list) if (MODE[m.param] !== undefined) items.push({ label: m.label, hint: m.param ? 'Static parameter' : '', value: { comp: m.comp, method: m.method, mode: MODE[m.param] } });
      const v = await pick('Function', items);
      if (v === undefined) return;
      Object.assign(call, v);
      if (v.mode === 3 || v.mode === 4) call.arg = 0; else if (v.mode === 5) call.arg = ''; else if (v.mode === 6) call.arg = false; else delete call.arg;
      commit();
    });
    let argEd = null;
    if (call.mode === 3 || call.mode === 4) argEd = numberInput(call.arg ?? 0, (v) => { call.arg = v; commit(); }, { int: call.mode === 3 });
    else if (call.mode === 5) argEd = textEditor(call.arg ?? '', (v) => { call.arg = v; commit(); });
    else if (call.mode === 6) argEd = boolEditor(!!call.arg, (v) => { call.arg = v; commit(); });
    else if (call.mode === 2) argEd = objectField(call.arg?.ref ? editor.get(call.arg.ref)?.name : null, 'Object', { onPick: async () => { const v = await pick('Select Object', [{ label: 'None', value: null }, ...editor.objects.map(x => ({ label: x.name, value: { ref: x.id } }))]); if (v !== undefined) { call.arg = v; commit(); } }, onDrop: ({ id }) => { call.arg = { ref: id }; commit(); }, onClear: () => { call.arg = null; commit(); } });
    const del = el('button', { class: 'btn ev-del', text: '−', title: 'Remove this listener' });
    del.addEventListener('click', () => { calls.splice(i, 1); commit(); });
    row.append(el('div', { class: 'ev-line' }, state, fnBtn), el('div', { class: 'ev-line' }, objF, argEd || el('span'), del));
    box.append(row);
  });
  const addBtn = el('button', { class: 'btn ev-add', text: '+', title: 'Add a listener' });
  addBtn.addEventListener('click', () => { calls.push({ state: 2, target: null, comp: '', method: '', mode: 1 }); commit(); });
  box.append(el('div', { class: 'ev-foot' }, addBtn));
  return box;
}

export function optionsEditor(value, set) {
  const opts = Array.isArray(value) ? value.map(o => ({ text: o?.text ?? '' })) : [];
  const box = el('div', { class: 'ev-box' });
  opts.forEach((o, i) => {
    const t = textEditor(o.text, (v) => { opts[i].text = v; set(opts); });
    const del = el('button', { class: 'btn ev-del', text: '−' }); del.addEventListener('click', () => { opts.splice(i, 1); set(opts); });
    box.append(el('div', { class: 'ev-line' }, t, del));
  });
  const add = el('button', { class: 'btn ev-add', text: '+' }); add.addEventListener('click', () => { opts.push({ text: 'Option ' + String.fromCharCode(65 + opts.length) }); set(opts); });
  box.append(el('div', { class: 'ev-foot' }, add));
  return box;
}
