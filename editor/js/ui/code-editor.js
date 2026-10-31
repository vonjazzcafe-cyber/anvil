// In-browser C# editor (CodeMirror) with real Roslyn errors, completion and hover info.
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine, hoverTooltip,
  EditorState, Compartment, foldGutter, indentOnInput, syntaxHighlighting, bracketMatching, foldKeymap, indentUnit, HighlightStyle,
  history, defaultKeymap, historyKeymap, indentWithTab, highlightSelectionMatches, searchKeymap, autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap,
  lintKeymap, linter, lintGutter, forceLinting, csharp, tags as t } from '../../../vendor/codemirror.js';
import { el, bus, toast } from '../core/events.js';
import { project, fileName, kindOf } from '../core/project.js';

const docs = new Map();   // path -> { view, dirty }
const wrapComp = new Map(); // path -> Compartment (word wrap on/off)
const WRAP_KEY = 'anvil-wrap';
let wrapOn = true;
try { wrapOn = localStorage.getItem(WRAP_KEY) !== '0'; } catch {}
function setWrap(on) {
  wrapOn = on;
  try { localStorage.setItem(WRAP_KEY, on ? '1' : '0'); } catch {}
  for (const [path, d] of docs) d.view.dispatch({ effects: wrapComp.get(path).reconfigure(on ? EditorView.lineWrapping : []) });
  document.querySelectorAll('.wrap-btn').forEach(b => b.classList.toggle('active', on));
}
let activePath = null;
const host = () => document.getElementById('view-code');

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.operatorKeyword], color: '#569cd6' },
  { tag: [t.controlKeyword, t.moduleKeyword], color: '#c586c0' },
  { tag: [t.typeName, t.className, t.namespace, t.standard(t.typeName)], color: '#4ec9b0' },
  { tag: [t.string, t.special(t.string), t.character], color: '#ce9178' },
  { tag: [t.number, t.bool, t.null, t.atom], color: '#b5cea8' },
  { tag: [t.lineComment, t.blockComment, t.comment, t.docComment], color: '#6a9955' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.function(t.variableName))], color: '#dcdcaa' },
  { tag: [t.variableName, t.propertyName, t.attributeName], color: '#9cdcfe' },
  { tag: [t.definition(t.variableName), t.definition(t.propertyName)], color: '#9cdcfe' },
  { tag: [t.meta, t.processingInstruction], color: '#9b9b9b' },
  { tag: [t.punctuation, t.bracket, t.operator], color: '#d4d4d4' },
  { tag: t.invalid, color: '#f44747' },
]);

const theme = EditorView.theme({
  '&': { color: '#d4d4d4', backgroundColor: '#1e1e1e', height: '100%', fontSize: '13px' },
  '.cm-content': { fontFamily: 'var(--mono)', caretColor: '#aeafad' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#aeafad', borderLeftWidth: '2px' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: '#264f78' },
  '.cm-activeLine': { backgroundColor: '#ffffff0a' },
  '.cm-gutters': { backgroundColor: '#1e1e1e', color: '#858585', border: 'none' },
  '.cm-activeLineGutter': { backgroundColor: '#ffffff0a', color: '#c6c6c6' },
  '.cm-matchingBracket': { backgroundColor: '#0064001a', outline: '1px solid #888' },
  '.cm-searchMatch': { backgroundColor: '#623315' },
  '.cm-selectionMatch': { backgroundColor: '#add6ff26' },
  '.cm-tooltip': { backgroundColor: '#252526', border: '1px solid #454545', color: '#ccc' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: '#04395e', color: '#fff' },
  '.cm-panels': { backgroundColor: '#252526', color: '#ccc' },
  '.cm-foldPlaceholder': { backgroundColor: '#333', border: 'none', color: '#aaa' },
  '.cm-lintRange-error': { backgroundImage: 'none', textDecoration: 'underline wavy #f14c4c', textUnderlineOffset: '3px' },
  '.cm-lintRange-warning': { backgroundImage: 'none', textDecoration: 'underline wavy #cca700', textUnderlineOffset: '3px' },
}, { dark: true });

function filesWith(path, text) {
  return project.scripts().map(f => f.path === path ? { path, code: text } : f);
}

function completionSource(path) {
  return async (ctx) => {
    const word = ctx.matchBefore(/[A-Za-z_][\w]*/);
    const before = ctx.state.sliceDoc(Math.max(0, ctx.pos - 1), ctx.pos);
    if (!ctx.explicit && !word && before !== '.') return null;
    if (!ctx.explicit && word && word.text.length < 1) return null;
    const engine = bus.engine;
    if (!engine?.compilerReady) return null;
    const text = ctx.state.doc.toString();
    let res;
    try { res = JSON.parse(await engine.complete(JSON.stringify(filesWith(path, text)), path, ctx.pos)); } catch (e) { return null; }
    if (ctx.aborted || !res.items?.length) return null;
    return {
      from: res.from,
      options: res.items.map(i => ({ label: i.label, type: i.type, detail: i.detail, apply: i.apply, boost: i.boost || 0 })),
      validFor: /^[\w]*$/,
    };
  };
}

function lintSource(path) {
  return async (view) => {
    const engine = bus.engine;
    if (!engine?.compilerReady || kindOf(path) !== 'script') return [];
    const text = view.state.doc.toString();
    let diags;
    try { diags = JSON.parse(await engine.check(JSON.stringify(filesWith(path, text)))); } catch (e) { return []; }
    if (view.state.doc.toString() !== text) return [];
    const doc = view.state.doc;
    const out = [];
    for (const d of diags) {
      if (d.file !== path || d.line < 1) continue;
      const l1 = doc.line(Math.min(d.line, doc.lines)), l2 = doc.line(Math.min(d.endLine || d.line, doc.lines));
      let from = Math.min(l1.from + d.col - 1, l1.to), to = Math.min(l2.from + (d.endCol || d.col) - 1, l2.to);
      if (to <= from) to = Math.min(from + 1, doc.length);
      out.push({ from, to, severity: d.severity === 'error' ? 'error' : 'warning', message: `${d.id}: ${d.message}` });
    }
    return out;
  };
}

function hoverSource(path) {
  return hoverTooltip(async (view, pos) => {
    const engine = bus.engine;
    if (!engine?.compilerReady) return null;
    let r;
    try { r = JSON.parse(await engine.hover(JSON.stringify(filesWith(path, view.state.doc.toString())), path, pos)); } catch (e) { return null; }
    if (!r) return null;
    return { pos: r.from, end: r.to, above: true, create: () => ({ dom: el('div', { class: 'anvil-hover', text: r.text }) }) };
  }, { hoverTime: 450 });
}

function makeView(path, text) {
  const isCs = kindOf(path) === 'script';
  let saveTimer = null;
  const wc = new Compartment(); wrapComp.set(path, wc);
  const state = EditorState.create({
    doc: text,
    extensions: [
      lineNumbers(), highlightActiveLineGutter(), highlightSpecialChars(), history(), foldGutter(), drawSelection(), dropCursor(),
      EditorState.allowMultipleSelections.of(true), indentOnInput(), syntaxHighlighting(highlight), bracketMatching(), closeBrackets(),
      rectangularSelection(), crosshairCursor(), highlightActiveLine(), highlightSelectionMatches(), indentUnit.of('    '), EditorState.tabSize.of(4),
      isCs ? csharp() : [],
      isCs ? autocompletion({ override: [completionSource(path)], activateOnTyping: true, maxRenderedOptions: 60, icons: true }) : [],
      isCs ? linter(lintSource(path), { delay: 1200 }) : [],
      isCs ? lintGutter() : [],
      isCs ? hoverSource(path) : [],
      keymap.of([
        { key: 'Alt-z', preventDefault: true, run: () => { setWrap(!wrapOn); return true; } },
        { key: 'Mod-s', preventDefault: true, run: () => { saveFile(path); return true; } },
        ...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...foldKeymap, ...completionKeymap, ...lintKeymap, indentWithTab,
      ]),
      theme, wc.of(wrapOn ? EditorView.lineWrapping : []),
      EditorView.updateListener.of((u) => {
        if (!u.docChanged) return;
        const d = docs.get(path); if (d) { d.dirty = true; bus.emit('code-dirty', { path, dirty: true }); }
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => { if (project.file(path)) { project.file(path).text = u.state.doc.toString(); project.touch('code'); } }, 400);
      }),
    ],
  });
  return new EditorView({ state });
}

export function openFile(path, line, col) {
  const f = project.file(path);
  if (!f) { toast('File not found: ' + path, 'error'); return false; }
  let d = docs.get(path);
  if (!d) { d = { view: makeView(path, f.text || ''), dirty: false }; docs.set(path, d); }
  activePath = path;
  const h = host();
  h.innerHTML = '';
  const copyBtn = el('button', { class: 'vbtn', text: 'Copy all', title: 'Copy this script to paste into Unity' });
  copyBtn.addEventListener('click', () => { navigator.clipboard.writeText(d.view.state.doc.toString()); toast('Copied — paste it into the same file in Unity'); });
  const saveBtn = el('button', { class: 'vbtn', text: 'Save & Compile (Ctrl+S)' });
  saveBtn.addEventListener('click', () => saveFile(path));
  const wrapBtn = el('button', { class: 'vbtn wrap-btn' + (wrapOn ? ' active' : ''), text: 'Wrap', title: 'Word wrap (Alt+Z)' });
  wrapBtn.addEventListener('click', () => { setWrap(!wrapOn); d.view.focus(); });
  h.append(el('div', { class: 'code-bar' }, el('span', { class: 'cpath', text: path }), wrapBtn, copyBtn, saveBtn));
  const hostEl = el('div', { class: 'code-host' });
  hostEl.append(d.view.dom);
  h.append(hostEl);
  if (line) goTo(path, line, col);
  setTimeout(() => d.view.focus(), 0);
  return true;
}

export function goTo(path, line, col = 1) {
  const d = docs.get(path); if (!d) return;
  const doc = d.view.state.doc;
  const l = doc.line(Math.max(1, Math.min(line, doc.lines)));
  const pos = Math.min(l.from + Math.max(0, col - 1), l.to);
  d.view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
  d.view.focus();
}

export function saveFile(path) {
  const d = docs.get(path); if (!d) return;
  const text = d.view.state.doc.toString();
  if (project.file(path)) project.writeText(path, text);
  d.dirty = false;
  bus.emit('code-dirty', { path, dirty: false });
  if (kindOf(path) === 'script') bus.emit('scripts-changed', { path, compile: true });
}
export function saveAll() { for (const [p, d] of docs) if (d.dirty) saveFile(p); }
export function anyDirty() { for (const d of docs.values()) if (d.dirty) return true; return false; }
export function closeFile(path) { const d = docs.get(path); if (d) { if (d.dirty) saveFile(path); d.view.destroy(); docs.delete(path); } if (activePath === path) activePath = null; }
export function renamedFile(from, to) { const d = docs.get(from); if (d) { d.view.destroy(); docs.delete(from); } }
export function reloadFromProject(path) {
  const d = docs.get(path); const f = project.file(path);
  if (!d || !f) return;
  const cur = d.view.state.doc.toString();
  if (cur !== f.text) d.view.dispatch({ changes: { from: 0, to: cur.length, insert: f.text || '' } });
}
export function relint() { for (const d of docs.values()) try { forceLinting(d.view); } catch (e) { } }
export function isOpen(path) { return docs.has(path); }
