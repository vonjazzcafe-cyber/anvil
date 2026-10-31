// Console panel: Debug.Log output, warnings, errors, exceptions and compiler errors (Unity-style).
import { el, bus } from '../core/events.js';
import { editor } from '../core/scene.js';

const view = () => document.getElementById('console-view');
const entries = [];          // runtime logs
let compileEntries = [];     // compiler messages (kept until the next compile)
let collapse = false, clearOnPlay = true, errorPause = false;
let showLog = true, showWarn = true, showErr = true;
let selected = null;
let filter = '';
let listEl, detailEl, countEls = {};
let renderQueued = false;
const MAX = 3000;

// t: 0 Error, 1 Assert, 2 Warning, 3 Log, 4 Exception (UnityEngine.LogType)
export function log(t, m, s = '', extra = {}) {
  const e = Object.assign({ t, m, s, time: new Date(), count: 1 }, extra);
  if (collapse && entries.length) {
    const prev = entries.findLast?.(x => x.m === m && x.t === t && x.s === s);
    if (prev) { prev.count++; queue(); return; }
  }
  entries.push(e);
  if (entries.length > MAX) entries.splice(0, entries.length - MAX);
  bus.emit('status', { text: firstLine(m), t });
  if (errorPause && (t === 0 || t === 4) && editor.playing) bus.emit('request-pause');
  queue();
}
export function setCompileMessages(diags) {
  compileEntries = diags.map(d => ({
    t: d.severity === 'error' ? 0 : 2,
    m: `${d.file}(${d.line},${d.col}): ${d.severity} ${d.id}: ${d.message}`,
    s: '', file: d.file, line: d.line, col: d.col, compile: true, count: 1,
  }));
  const err = compileEntries.find(e => e.t === 0);
  if (err) bus.emit('status', { text: firstLine(err.m), t: 0 });
  queue();
}
export function clearConsole(all = false) {
  entries.length = 0;
  if (all) compileEntries = [];
  selected = null;
  queue();
}
export function onPlayStart() { if (clearOnPlay) clearConsole(false); }
function firstLine(s) { return String(s).split('\n')[0]; }
function queue() { bus.emit('console-changed'); if (renderQueued) return; renderQueued = true; requestAnimationFrame(() => { renderQueued = false; renderList(); }); }

export function initConsole() {
  const v = view();
  const btn = (label, on, fn, title) => { const b = el('button', { class: 'vbtn' + (on ? ' active' : ''), text: label, title }); b.addEventListener('click', () => { fn(); b.classList.toggle('active'); queue(); }); return b; };
  const clear = el('button', { class: 'vbtn', text: 'Clear' }); clear.addEventListener('click', () => clearConsole(false));
  const search = el('input', { type: 'text', placeholder: 'Search', spellcheck: 'false', style: { marginLeft: 'auto', width: '150px', height: '18px', borderRadius: '9px', background: 'var(--bg-input)', border: '1px solid #1f1f1f', padding: '0 8px' } });
  search.addEventListener('input', () => { filter = search.value.toLowerCase(); queue(); });
  search.addEventListener('keydown', e => e.stopPropagation());
  const tog = (key, icon, cls) => {
    const b = el('button', { class: 'vbtn active', title: key });
    const c = el('span', { class: 'count', text: '0' });
    b.append(el('span', { text: icon, style: { color: cls } }), c);
    b.addEventListener('click', () => { if (key === 'Log') showLog = !showLog; if (key === 'Warning') showWarn = !showWarn; if (key === 'Error') showErr = !showErr; b.classList.toggle('active'); queue(); });
    countEls[key] = c;
    return b;
  };
  const bar = el('div', { class: 'console-bar' }, clear,
    btn('Collapse', collapse, () => collapse = !collapse),
    btn('Clear on Play', clearOnPlay, () => clearOnPlay = !clearOnPlay),
    btn('Error Pause', errorPause, () => errorPause = !errorPause, 'Pause play mode when an error is logged'),
    search, tog('Log', 'ⓘ', '#bbb'), tog('Warning', '⚠', '#e5b33c'), tog('Error', '⛔', '#e8594a'));
  listEl = el('div', { class: 'console-list', tabindex: '0' });
  detailEl = el('div', { class: 'console-detail' });
  v.append(bar, listEl, detailEl);
  listEl.addEventListener('keydown', (e) => {
    const all = visible();
    const i = all.indexOf(selected);
    if (e.key === 'ArrowDown' && i < all.length - 1) { selected = all[i + 1]; queue(); e.preventDefault(); }
    if (e.key === 'ArrowUp' && i > 0) { selected = all[i - 1]; queue(); e.preventDefault(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selected) navigator.clipboard?.writeText(selected.m + '\n' + (selected.s || ''));
  });
  renderList();
}

function kindOf(t) { return t === 3 ? 'Log' : t === 2 ? 'Warning' : 'Error'; }
function visible() {
  const all = [...compileEntries, ...entries];
  return all.filter(e => {
    const k = kindOf(e.t);
    if (k === 'Log' && !showLog) return false;
    if (k === 'Warning' && !showWarn) return false;
    if (k === 'Error' && !showErr) return false;
    if (filter && !e.m.toLowerCase().includes(filter)) return false;
    return true;
  });
}

function renderList() {
  if (!listEl) return;
  const all = [...compileEntries, ...entries];
  const counts = { Log: 0, Warning: 0, Error: 0 };
  for (const e of all) counts[kindOf(e.t)] += e.count || 1;
  for (const k of Object.keys(countEls)) countEls[k].textContent = counts[k] > 999 ? '999+' : String(counts[k]);
  const badge = document.getElementById('console-badge');
  if (counts.Error) { badge.textContent = counts.Error; badge.className = 'badge'; }
  else if (counts.Warning) { badge.textContent = counts.Warning; badge.className = 'badge warn'; }
  else badge.className = 'badge hidden';
  const atBottom = listEl.scrollTop + listEl.clientHeight >= listEl.scrollHeight - 30;
  listEl.innerHTML = '';
  const vis = visible();
  const start = Math.max(0, vis.length - 800);
  for (let i = start; i < vis.length; i++) {
    const e = vis[i];
    const icon = e.t === 3 ? 'ⓘ' : e.t === 2 ? '⚠' : '⛔';
    const row = el('div', { class: `log t${e.t}` + (e === selected ? ' selected' : '') },
      el('span', { class: 'licon', text: icon }),
      el('span', { class: 'lmsg', text: (e.time && !e.compile ? '[' + e.time.toTimeString().slice(0, 8) + '] ' : '') + firstLine(e.m) + (e.m.includes('\n') ? '\n' + e.m.split('\n')[1] : '') }),
      (e.count || 1) > 1 ? el('span', { class: 'lcount', text: String(e.count) }) : null);
    row.addEventListener('click', () => { selected = e; queue(); if (e.id) editor.select(e.id); });
    row.addEventListener('dblclick', () => openSource(e));
    listEl.append(row);
  }
  if (atBottom) listEl.scrollTop = listEl.scrollHeight;
  renderDetail();
}

function renderDetail() {
  detailEl.innerHTML = '';
  const e = selected; if (!e) return;
  detailEl.append(document.createTextNode(e.m + '\n'));
  if (e.s) {
    for (const line of e.s.split('\n')) {
      if (!line) continue;
      const m = line.match(/\(at (.+?):(\d+)\)/);
      if (m) {
        const [whole, file, ln] = m;
        const idx = line.indexOf(whole);
        detailEl.append(document.createTextNode(line.slice(0, idx) + '(at '));
        const a = el('a', { text: `${file}:${ln}` });
        a.addEventListener('click', () => bus.emit('open-script', { path: file, line: +ln }));
        detailEl.append(a, document.createTextNode(')\n'));
      } else detailEl.append(document.createTextNode(line + '\n'));
    }
  } else if (e.compile && e.file) {
    const a = el('a', { text: `Open ${e.file} at line ${e.line}` });
    a.addEventListener('click', () => openSource(e));
    detailEl.append(a);
  }
}

function openSource(e) {
  if (e.compile && e.file) { bus.emit('open-script', { path: e.file, line: e.line, col: e.col }); return; }
  const m = (e.s || '').match(/\(at (Assets\/.+?):(\d+)\)/);
  if (m) bus.emit('open-script', { path: m[1], line: +m[2] });
}

export function getEntries() { return [...compileEntries, ...entries]; }
export function hasCompileErrors() { return compileEntries.some(e => e.t === 0); }
