// Inspector field editors (Unity-like): numbers with drag-to-scrub labels, vectors, colours, enums, object fields...
import { el, bus } from '../core/events.js';
import { fmt } from '../core/math.js';

// Evaluate simple math typed into number fields ("2*3", "1/4", "-0.5+1")
export function parseNum(s, fallback) {
  s = String(s).trim();
  if (s === '') return fallback;
  if (/^-?inf(inity)?$/i.test(s)) return s.startsWith('-') ? -Infinity : Infinity;
  if (/^[-+*/().\d\s eE]+$/.test(s)) {
    try { const v = Function('"use strict";return (' + s + ')')(); if (typeof v === 'number' && !isNaN(v)) return v; } catch (e) { }
  }
  const v = parseFloat(s);
  return isNaN(v) ? fallback : v;
}
export function numStr(v) {
  if (v === 'Infinity' || v === Infinity) return 'Infinity';
  if (v === '-Infinity' || v === -Infinity) return '-Infinity';
  if (typeof v !== 'number') v = Number(v) || 0;
  if (Math.abs(v) >= 1e15) return v.toExponential(3);
  return fmt(v);
}

// Makes a label scrub a number when dragged horizontally (like Unity).
export function scrubbable(label, get, set, { int = false, end } = {}) {
  label.classList.add('scrub');
  label.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const start = get();
    let startX = e.clientX, moved = false;
    const base = typeof start === 'number' && isFinite(start) ? start : 0;
    const step = int ? 1 : Math.max(0.001, Math.abs(base) * 0.01, 0.01) ;
    label.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const dx = ev.clientX - startX;
      if (!moved && Math.abs(dx) < 2) return;
      moved = true;
      let v = base + dx * step * (ev.shiftKey ? 4 : ev.altKey ? 0.25 : 1);
      v = int ? Math.round(v) : Math.round(v * 1000) / 1000;
      set(v, true);
    };
    const up = () => { label.removeEventListener('pointermove', move); label.removeEventListener('pointerup', up); if (moved && end) end(); };
    label.addEventListener('pointermove', move);
    label.addEventListener('pointerup', up);
  });
}

export function numberInput(value, onChange, { int = false, min, max, readOnly } = {}) {
  const inp = el('input', { type: 'text', value: numStr(value), spellcheck: 'false' });
  if (readOnly) inp.readOnly = true;
  const commit = () => {
    let v = parseNum(inp.value, Number(value) || 0);
    if (int && isFinite(v)) v = Math.round(v);
    if (min != null && v < min) v = min;
    if (max != null && v > max) v = max;
    inp.value = numStr(v);
    if (v !== value) { value = v; onChange(v, false); }
  };
  inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { commit(); inp.blur(); } if (e.key === 'Escape') { inp.value = numStr(value); inp.blur(); } });
  inp.addEventListener('change', commit);
  inp.addEventListener('focus', () => setTimeout(() => inp.select(), 0));
  inp.setValue = (v) => { value = v; if (document.activeElement !== inp) inp.value = numStr(v); };
  return inp;
}

export function field(label, valueEl, opts = {}) {
  const l = el('div', { class: 'flabel', text: label, title: opts.tip || label });
  const row = el('div', { class: 'field' + (opts.cls ? ' ' + opts.cls : '') }, l, el('div', { class: 'fvalue' }, valueEl));
  row.labelEl = l;
  return row;
}

export function vectorEditor(values, onChange, { labels = ['X', 'Y', 'Z'], int = false, readOnly } = {}) {
  const wrap = el('div', { class: 'vec' });
  const inputs = [];
  values = values.slice();
  labels.forEach((L, i) => {
    const inp = numberInput(values[i], (v, live) => { values[i] = v; onChange(values.slice(), live); }, { int, readOnly });
    const span = el('span', { text: L });
    if (!readOnly) scrubbable(span, () => values[i], (v, live) => { values[i] = v; inp.setValue(v); onChange(values.slice(), live); }, { int, end: () => onChange(values.slice(), false) });
    inputs.push(inp);
    wrap.append(el('label', {}, span, inp));
  });
  wrap.setValues = (v) => { values = v.slice(); inputs.forEach((inp, i) => inp.setValue(v[i])); };
  return wrap;
}

function hex2(v) { return Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0'); }
function srgbToHex(c) { return '#' + hex2(c[0]) + hex2(c[1]) + hex2(c[2]); }
export function colorEditor(value, onChange, { alpha = true } = {}) {
  value = (value || [1, 1, 1, 1]).slice();
  const inp = el('input', { type: 'color', value: srgbToHex(value) });
  inp.addEventListener('input', () => {
    const h = inp.value;
    value = [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255, value[3] ?? 1];
    onChange(value.slice(), true);
  });
  inp.addEventListener('change', () => onChange(value.slice(), false));
  const wrap = el('div', { class: 'vec' }, inp);
  let a = null;
  if (alpha) {
    a = numberInput(value[3] ?? 1, (v) => { value[3] = Math.max(0, Math.min(1, v)); onChange(value.slice(), false); }, { min: 0, max: 1 });
    a.title = 'Alpha'; a.style.maxWidth = '52px'; a.style.flex = 'none';
    wrap.append(a);
  }
  wrap.setValue = (v) => { if (!v) return; value = v.slice(); if (document.activeElement !== inp) inp.value = srgbToHex(value); if (a) a.setValue(value[3] ?? 1); };
  return wrap;
}

export function enumEditor(options, values, value, onChange) {
  const sel = el('select');
  options.forEach((o, i) => { const opt = el('option', { value: String(i), text: o }); if (values[i] === value || String(values[i]) === String(value)) opt.selected = true; sel.append(opt); });
  sel.addEventListener('change', () => onChange(values[+sel.value]));
  sel.addEventListener('keydown', e => e.stopPropagation());
  sel.setValue = (v) => { if (document.activeElement === sel) return; const i = values.findIndex(x => x === v || String(x) === String(v)); if (i >= 0) sel.value = String(i); };
  return sel;
}

export function flagsEditor(names, values, value, onChange) {
  const wrap = el('div', { class: 'vec', style: { flexWrap: 'wrap' } });
  const boxes = [];
  names.forEach((n, i) => {
    if (values[i] === 0) return;
    const cb = el('input', { type: 'checkbox' });
    cb.checked = (value & values[i]) === values[i] && values[i] !== 0;
    cb.addEventListener('change', () => { value = cb.checked ? (value | values[i]) : (value & ~values[i]); onChange(value); });
    boxes.push([cb, values[i]]);
    wrap.append(el('label', { style: { flex: 'none', gap: '3px', marginRight: '6px' } }, cb, n));
  });
  wrap.setValue = (v) => { value = v | 0; for (const [cb, bit] of boxes) cb.checked = (value & bit) === bit; };
  return wrap;
}

export function boolEditor(value, onChange) {
  const cb = el('input', { type: 'checkbox' });
  cb.checked = !!value;
  cb.addEventListener('change', () => onChange(cb.checked));
  cb.setValue = (v) => { cb.checked = !!v; };
  return cb;
}

export function textEditor(value, onChange, { multiline = 0 } = {}) {
  const t = multiline ? el('textarea', { class: 'ftext', rows: String(multiline) }) : el('input', { type: 'text', spellcheck: 'false' });
  t.value = value ?? '';
  t.addEventListener('keydown', e => { e.stopPropagation(); if (!multiline && e.key === 'Enter') t.blur(); });
  t.addEventListener('change', () => onChange(t.value));
  t.setValue = (v) => { if (document.activeElement !== t) t.value = v ?? ''; };
  return t;
}

export function rangeEditor(value, min, max, onChange, { int = false } = {}) {
  const r = el('input', { type: 'range', min: String(min), max: String(max), step: int ? '1' : String((max - min) / 1000) });
  r.value = String(value);
  const n = numberInput(value, (v) => { v = Math.max(min, Math.min(max, v)); r.value = String(v); onChange(v, false); }, { int, min, max });
  n.classList.add('range-num');
  r.addEventListener('input', () => { const v = int ? Math.round(+r.value) : Math.round(+r.value * 1000) / 1000; n.setValue(v); onChange(v, true); });
  r.addEventListener('change', () => onChange(int ? Math.round(+r.value) : Math.round(+r.value * 1000) / 1000, false));
  const wrap = el('div', { class: 'vec' }, r, n);
  wrap.setValue = (v) => { n.setValue(v); if (document.activeElement !== r) r.value = String(v); };
  return wrap;
}

// Object reference field: shows "None (Type)", accepts drops from the Hierarchy and Project, click to pick.
export function objectField(display, typeName, { onPick, onDrop, onClear, onPing }) {
  const name = el('span', { class: 'rname' + (display ? '' : ' none'), text: display ? `${display} (${typeName})` : `None (${typeName})` });
  const pickBtn = el('span', { class: 'rpick', text: '◉', title: 'Select…' });
  const box = el('div', { class: 'objref', tabindex: '0' }, name, pickBtn);
  if (!onPick) pickBtn.style.visibility = 'hidden';
  box.setValue = (d) => { name.className = 'rname' + (d ? '' : ' none'); name.textContent = d ? `${d} (${typeName})` : `None (${typeName})`; };
  pickBtn.addEventListener('click', (e) => { e.stopPropagation(); onPick && onPick(); });
  box.addEventListener('dblclick', () => onPing && onPing());
  box.addEventListener('click', () => onPing && onPing(true));
  box.addEventListener('keydown', (e) => { if ((e.key === 'Delete' || e.key === 'Backspace') && onClear) { e.stopPropagation(); onClear(); } });
  box.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('anvil/object') || e.dataTransfer.types.includes('anvil/asset')) { e.preventDefault(); box.classList.add('drop'); } });
  box.addEventListener('dragleave', () => box.classList.remove('drop'));
  box.addEventListener('drop', (e) => {
    e.preventDefault(); box.classList.remove('drop');
    const id = e.dataTransfer.getData('anvil/object'), asset = e.dataTransfer.getData('anvil/asset');
    onDrop && onDrop(id ? { id: +id } : { asset });
  });
  return box;
}

export function foldout(title, open, onToggle) {
  const arrow = el('span', { class: 'tree-arrow', text: open ? '▾' : '▸', style: { cursor: 'pointer' } });
  const head = el('div', { class: 'field', style: { cursor: 'pointer' } }, el('div', { class: 'flabel', style: { maxWidth: 'none', width: 'auto' } }, arrow, title));
  head.addEventListener('click', () => onToggle(!open));
  return head;
}
