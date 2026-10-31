// GameObject > UI: creates UI objects the way Unity's menu does (a Canvas and EventSystem are added when missing).
import { editor } from './scene.js';
import { project } from './project.js';
import { makeComponent, RECT_DEFAULT } from './components.js';

const GRAY = [0.1960784, 0.1960784, 0.1960784, 1];
const UI_LAYER = 5;

function rect(o) { return Object.assign(RECT_DEFAULT(), o || {}); }
function stretch(l = 0, b = 0, r = 0, t = 0) { return rect({ anchorMin: [0, 0], anchorMax: [1, 1], anchoredPosition: [(l - r) / 2, (b - t) / 2], sizeDelta: [-(l + r), -(b + t)] }); }
function comp(type, values) { return Object.assign(makeComponent(type), values || {}); }
const graphic = (type, values) => [comp('CanvasRenderer'), comp(type, values)];

function findCanvasAncestor(id) {
  for (let o = editor.get(id); o; o = o.parent ? editor.get(o.parent) : null) if (o.comps.some(c => c.type === 'Canvas')) return o.id;
  return 0;
}
function anyCanvas() { const c = editor.objects.find(o => o.comps.some(c => c.type === 'Canvas') && !(o.parent && findCanvasAncestor(o.parent))); return c ? c.id : 0; }

// raw object insert (inside an editor.change)
function add(scene, { name, parent = 0, comps, active = true }) {
  const id = editor.newId();
  const o = { id, name, parent, active, tag: 'Untagged', layer: UI_LAYER, p: [0, 0, 0], r: [0, 0, 0, 1], e: [0, 0, 0], s: [1, 1, 1], comps };
  scene.objects.push(o);
  return o;
}
const ref = (o, type) => ({ ref: o.id, ci: o.comps.findIndex(c => c.type === type) });

function ensureEventSystem(scene) {
  if (scene.objects.some(o => o.comps.some(c => c.type === 'EventSystem'))) return;
  const module = project.settings.inputHandling === 'old' ? 'StandaloneInputModule' : 'InputSystemUIInputModule';
  const o = add(scene, { name: 'EventSystem', comps: [comp('EventSystem'), comp(module)] });
  o.layer = 0;
}
function makeCanvas(scene, parent = 0) {
  const o = add(scene, { name: 'Canvas', parent, comps: [rect({ anchorMin: [0, 0], anchorMax: [0, 0], sizeDelta: [800, 600] }), comp('Canvas'), comp('CanvasScaler'), comp('GraphicRaycaster')] });
  ensureEventSystem(scene);
  return o;
}

function uniqueName(base, parent, self) {
  const names = editor.objects.filter(o => (o.parent || 0) === parent && o !== self).map(o => o.name);
  if (!names.includes(base)) return base;
  for (let i = 1; ; i++) if (!names.includes(`${base} (${i})`)) return `${base} (${i})`;
}

const BUILDERS = {
  'Canvas': (s, parent) => makeCanvas(s, parent),
  'Panel': (s, p) => add(s, { name: 'Panel', parent: p, comps: [stretch(), ...graphic('Image', { color: [1, 1, 1, 0.3921569] })] }),
  'Image': (s, p) => add(s, { name: 'Image', parent: p, comps: [rect(), ...graphic('Image')] }),
  'Raw Image': (s, p) => add(s, { name: 'RawImage', parent: p, comps: [rect(), ...graphic('RawImage')] }),
  'Text - TextMeshPro': (s, p) => add(s, { name: 'Text (TMP)', parent: p, comps: [rect({ sizeDelta: [200, 50] }), ...graphic('TextMeshProUGUI')] }),
  'Text (Legacy)': (s, p) => add(s, { name: 'Text (Legacy)', parent: p, comps: [rect({ sizeDelta: [160, 30] }), ...graphic('Text', { color: GRAY })] }),
  'Button - TextMeshPro': (s, p) => {
    const b = add(s, { name: 'Button', parent: p, comps: [rect({ sizeDelta: [160, 30] }), ...graphic('Image'), comp('Button')] });
    b.comps.find(c => c.type === 'Button').targetGraphic = ref(b, 'Image');
    add(s, { name: 'Text (TMP)', parent: b.id, comps: [stretch(), ...graphic('TextMeshProUGUI', { text: 'Button', fontSize: 24, color: GRAY, alignment: 514 })] });
    return b;
  },
  'Button (Legacy)': (s, p) => {
    const b = add(s, { name: 'Button (Legacy)', parent: p, comps: [rect({ sizeDelta: [160, 30] }), ...graphic('Image'), comp('Button')] });
    b.comps.find(c => c.type === 'Button').targetGraphic = ref(b, 'Image');
    add(s, { name: 'Text (Legacy)', parent: b.id, comps: [stretch(), ...graphic('Text', { text: 'Button', color: GRAY, alignment: 4 })] });
    return b;
  },
  'Toggle': (s, p) => {
    const t = add(s, { name: 'Toggle', parent: p, comps: [rect({ sizeDelta: [160, 20] }), comp('Toggle')] });
    const bg = add(s, { name: 'Background', parent: t.id, comps: [rect({ anchorMin: [0, 1], anchorMax: [0, 1], anchoredPosition: [10, -10], sizeDelta: [20, 20] }), ...graphic('Image')] });
    const ck = add(s, { name: 'Checkmark', parent: bg.id, comps: [rect({ sizeDelta: [12, 12] }), ...graphic('Image', { color: GRAY })] });
    add(s, { name: 'Label', parent: t.id, comps: [stretch(23, 1, 5, 3), ...graphic('Text', { text: 'Toggle', color: GRAY })] });
    Object.assign(t.comps.find(c => c.type === 'Toggle'), { targetGraphic: ref(bg, 'Image'), graphic: ref(ck, 'Image') });
    return t;
  },
  'Slider': (s, p) => {
    const sl = add(s, { name: 'Slider', parent: p, comps: [rect({ sizeDelta: [160, 20] }), comp('Slider')] });
    add(s, { name: 'Background', parent: sl.id, comps: [rect({ anchorMin: [0, 0.25], anchorMax: [1, 0.75], sizeDelta: [0, 0] }), ...graphic('Image', { color: [0.82, 0.82, 0.82, 1] })] });
    const area = add(s, { name: 'Fill Area', parent: sl.id, comps: [rect({ anchorMin: [0, 0.25], anchorMax: [1, 0.75], anchoredPosition: [-5, 0], sizeDelta: [-20, 0] })] });
    const fill = add(s, { name: 'Fill', parent: area.id, comps: [rect({ anchorMin: [0, 0], anchorMax: [0, 1], sizeDelta: [10, 0] }), ...graphic('Image', { color: [0.33, 0.6, 0.95, 1] })] });
    const harea = add(s, { name: 'Handle Slide Area', parent: sl.id, comps: [stretch(10, 0, 10, 0)] });
    const handle = add(s, { name: 'Handle', parent: harea.id, comps: [rect({ anchorMin: [0, 0], anchorMax: [0, 1], sizeDelta: [20, 0] }), ...graphic('Image')] });
    Object.assign(sl.comps.find(c => c.type === 'Slider'), { fillRect: ref(fill, 'RectTransform'), handleRect: ref(handle, 'RectTransform'), targetGraphic: ref(handle, 'Image') });
    return sl;
  },
  'Scrollbar': (s, p) => {
    const sb = add(s, { name: 'Scrollbar', parent: p, comps: [rect({ sizeDelta: [160, 20] }), ...graphic('Image', { color: [0.82, 0.82, 0.82, 1] }), comp('Scrollbar')] });
    const area = add(s, { name: 'Sliding Area', parent: sb.id, comps: [stretch(10, 10, 10, 10)] });
    const h = add(s, { name: 'Handle', parent: area.id, comps: [rect({ anchorMin: [0, 0], anchorMax: [0.2, 1], sizeDelta: [20, 20] }), ...graphic('Image')] });
    Object.assign(sb.comps.find(c => c.type === 'Scrollbar'), { handleRect: ref(h, 'RectTransform'), targetGraphic: ref(h, 'Image') });
    return sb;
  },
  'Dropdown - TextMeshPro': (s, p) => {
    const d = add(s, { name: 'Dropdown', parent: p, comps: [rect({ sizeDelta: [160, 30] }), ...graphic('Image'), comp('TMP_Dropdown')] });
    const label = add(s, { name: 'Label', parent: d.id, comps: [stretch(10, 6, 25, 7), ...graphic('TextMeshProUGUI', { text: 'Option A', fontSize: 14, color: GRAY, alignment: 513 })] });
    add(s, { name: 'Arrow', parent: d.id, comps: [rect({ anchorMin: [1, 0.5], anchorMax: [1, 0.5], anchoredPosition: [-15, 0], sizeDelta: [20, 20] }), ...graphic('TextMeshProUGUI', { text: '▼', fontSize: 12, color: GRAY, alignment: 514 })] });
    Object.assign(d.comps.find(c => c.type === 'TMP_Dropdown'), { targetGraphic: ref(d, 'Image'), captionText: ref(label, 'TextMeshProUGUI') });
    return d;
  },
  'Input Field - TextMeshPro': (s, p) => {
    const f = add(s, { name: 'InputField (TMP)', parent: p, comps: [rect({ sizeDelta: [160, 30] }), ...graphic('Image'), comp('TMP_InputField')] });
    const area = add(s, { name: 'Text Area', parent: f.id, comps: [stretch(10, 6, 10, 7), comp('RectMask2D')] });
    const ph = add(s, { name: 'Placeholder', parent: area.id, comps: [stretch(), ...graphic('TextMeshProUGUI', { text: 'Enter text...', fontSize: 14, fontStyle: 2, color: [0.1960784, 0.1960784, 0.1960784, 0.5], alignment: 513 })] });
    const tx = add(s, { name: 'Text', parent: area.id, comps: [stretch(), ...graphic('TextMeshProUGUI', { text: '', fontSize: 14, color: GRAY, alignment: 513 })] });
    Object.assign(f.comps.find(c => c.type === 'TMP_InputField'), { targetGraphic: ref(f, 'Image'), textComponent: ref(tx, 'TextMeshProUGUI'), placeholder: ref(ph, 'TextMeshProUGUI') });
    return f;
  },
  'Scroll View': (s, p) => {
    const sv = add(s, { name: 'Scroll View', parent: p, comps: [rect({ sizeDelta: [200, 200] }), ...graphic('Image', { color: [1, 1, 1, 0.3921569] }), comp('ScrollRect', { horizontal: false })] });
    const vp = add(s, { name: 'Viewport', parent: sv.id, comps: [rect({ anchorMin: [0, 0], anchorMax: [1, 1], pivot: [0, 1], anchoredPosition: [0, 0], sizeDelta: [-17, 0] }), ...graphic('Image'), comp('Mask', { showMaskGraphic: false })] });
    const content = add(s, { name: 'Content', parent: vp.id, comps: [rect({ anchorMin: [0, 1], anchorMax: [1, 1], pivot: [0, 1], anchoredPosition: [0, 0], sizeDelta: [0, 300] })] });
    const bar = add(s, { name: 'Scrollbar Vertical', parent: sv.id, comps: [rect({ anchorMin: [1, 0], anchorMax: [1, 1], pivot: [1, 1], anchoredPosition: [0, 0], sizeDelta: [20, 0] }), ...graphic('Image', { color: [0.82, 0.82, 0.82, 1] }), comp('Scrollbar', { direction: 2 })] });
    const area = add(s, { name: 'Sliding Area', parent: bar.id, comps: [stretch(10, 10, 10, 10)] });
    const h = add(s, { name: 'Handle', parent: area.id, comps: [rect({ anchorMin: [0, 0], anchorMax: [1, 1], sizeDelta: [20, 20] }), ...graphic('Image')] });
    Object.assign(bar.comps.find(c => c.type === 'Scrollbar'), { handleRect: ref(h, 'RectTransform'), targetGraphic: ref(h, 'Image') });
    Object.assign(sv.comps.find(c => c.type === 'ScrollRect'), { content: ref(content, 'RectTransform'), viewport: ref(vp, 'RectTransform'), verticalScrollbar: ref(bar, 'Scrollbar'), verticalScrollbarVisibility: 2 });
    return sv;
  },
  'Event System': (s) => { ensureEventSystem(s); return s.objects.find(o => o.comps.some(c => c.type === 'EventSystem')); },
};
export const UI_MENU = ['Image', 'Text - TextMeshPro', 'Raw Image', 'Panel', '-', 'Toggle', 'Slider', 'Scrollbar', 'Scroll View', 'Button - TextMeshPro', 'Dropdown - TextMeshPro', 'Input Field - TextMeshPro', '-', 'Canvas', 'Event System', '-', 'Text (Legacy)', 'Button (Legacy)'];

export function createUI(kind, parent = 0) {
  let made = null;
  editor.change(() => {
    const scene = editor.scene;
    if (kind === 'Canvas') { made = makeCanvas(scene, parent && findCanvasAncestor(parent) ? parent : parent); return; }
    if (kind === 'Event System') { made = BUILDERS[kind](scene); return; }
    // UI elements must live under a Canvas: use the selected one, any canvas, or make one
    let host = parent && findCanvasAncestor(parent) ? parent : 0;
    if (!host) { host = anyCanvas(); if (!host) host = makeCanvas(scene, 0).id; else ensureEventSystem(scene); }
    made = BUILDERS[kind](scene, host);
    made.name = uniqueName(made.name, host, made);
  }, 'Create ' + kind);
  if (made) editor.select(made.id);
  return made?.id;
}
