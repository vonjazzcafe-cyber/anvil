// Project Settings (shown as a tab next to the Inspector): Player, Physics, Time, Tags & Layers, Scenes, Execution Order, Editor.
import { el, bus, toast } from '../core/events.js';
import { project, baseName } from '../core/project.js';
import { editor } from '../core/scene.js';
import { field, numberInput, vectorEditor, enumEditor, boolEditor, textEditor } from './fields.js';
import { scriptMeta } from './inspector.js';

function section(title, ...children) { return el('div', { class: 'settings-section' }, el('h3', { text: title }), ...children); }
const BUILTIN_LAYERS = { 0: 'Default', 1: 'TransparentFX', 2: 'Ignore Raycast', 4: 'Water', 5: 'UI' };

export function renderSettings(h) {
  const s = project.settings;
  const touch = () => { project.touch('settings'); bus.emit('settings-changed'); };
  const wrap = el('div', { style: { padding: '8px 10px' } });
  if (editor.playing) wrap.append(el('div', { class: 'insp-note', text: 'Changes made while playing apply the next time you press Play.' }));

  wrap.append(section('Player',
    field('Product Name', textEditor(s.productName, (v) => { s.productName = v; touch(); })),
    field('Active Input Handling', enumEditor(['Input System Package (New)', 'Input Manager (Old)', 'Both'], ['new', 'old', 'both'], s.inputHandling, (v) => { s.inputHandling = v; touch(); bus.emit('input-handling-changed'); })),
    el('div', { class: 'insp-note info', text: 'Unity 6 projects default to the new Input System: Keyboard.current works, the old Input.GetKey throws an error. Pick "Both" to allow both.' }),
  ));

  wrap.append(section('Physics',
    field('Physics Engine', enumEditor(['PhysX (like Unity)', 'Rapier (lighter)'], ['physx', 'rapier'], s.physicsEngine || 'physx', (v) => { s.physicsEngine = v; touch(); })),
    el('div', { class: 'insp-note info', text: 'PhysX is the engine Unity\'s 3D physics runs on, with Unity\'s settings, so bounces, friction, joints and motors behave like in Unity. Rapier loads faster on slow connections (the first PhysX download is about 3 MB).' }),
    field('Gravity', vectorEditor(s.gravity, (v) => { s.gravity = v; touch(); })),
    el('div', { style: { margin: '6px 0 2px', color: '#ccc' }, text: 'Layer Collision Matrix' }),
    layerMatrix(s, touch),
  ));

  wrap.append(section('Physics 2D',
    field('Gravity', vectorEditor(s.gravity2D || [0, -9.81], (v) => { s.gravity2D = v; touch(); }, { labels: ['X', 'Y'] })),
    el('div', { class: 'insp-note info', text: 'Rigidbody 2D, the 2D colliders and joints run on Box2D, like Unity. 2D objects use the same layer collision matrix as 3D here.' }),
  ));

  wrap.append(section('Time',
    field('Fixed Timestep', numberInput(s.fixedTimestep, (v) => { s.fixedTimestep = Math.max(0.0001, v); touch(); })),
    field('Maximum Allowed Timestep', numberInput(s.maxDeltaTime, (v) => { s.maxDeltaTime = Math.max(s.fixedTimestep, v); touch(); })),
    field('Time Scale', numberInput(s.timeScale, (v) => { s.timeScale = Math.max(0, Math.min(100, v)); touch(); })),
  ));

  // tags & layers
  const tagList = el('div');
  const drawTags = () => {
    tagList.innerHTML = '';
    s.tags.forEach((t, i) => {
      const inp = textEditor(t, (v) => { if (v.trim()) { s.tags[i] = v.trim(); touch(); } });
      const del = el('button', { class: 'btn small', text: '−', title: 'Remove tag' });
      del.addEventListener('click', () => { s.tags.splice(i, 1); touch(); drawTags(); });
      tagList.append(field('Tag ' + i, el('div', { class: 'vec' }, inp, del)));
    });
    const add = el('button', { class: 'btn small', text: '+ Add Tag' });
    add.addEventListener('click', () => { s.tags.push('NewTag' + (s.tags.length || '')); touch(); drawTags(); });
    tagList.append(el('div', { style: { textAlign: 'right', marginTop: '3px' } }, add));
  };
  drawTags();
  const layerList = el('div');
  for (let i = 0; i < 32; i++) {
    if (BUILTIN_LAYERS[i] !== undefined || i < 6) { layerList.append(field((i < 6 ? 'Builtin Layer ' : 'Layer ') + i, el('span', { style: { color: '#888' }, text: BUILTIN_LAYERS[i] || '' }))); continue; }
    layerList.append(field('User Layer ' + i, textEditor(s.layers[i] || '', (v) => { if (v.trim()) s.layers[i] = v.trim(); else delete s.layers[i]; touch(); })));
  }
  wrap.append(section('Tags and Layers', el('div', { style: { color: '#ccc', margin: '2px 0' }, text: 'Tags' }), tagList, el('div', { style: { color: '#ccc', margin: '8px 0 2px' }, text: 'Layers' }), layerList));

  // scenes in build
  const sceneList = el('div');
  const drawScenes = () => {
    sceneList.innerHTML = '';
    s.scenes.forEach((p, i) => {
      const up = el('button', { class: 'btn small', text: '▲' }); up.disabled = i === 0;
      up.addEventListener('click', () => { [s.scenes[i - 1], s.scenes[i]] = [s.scenes[i], s.scenes[i - 1]]; touch(); drawScenes(); });
      const rm = el('button', { class: 'btn small', text: '−' });
      rm.addEventListener('click', () => { s.scenes.splice(i, 1); touch(); drawScenes(); });
      sceneList.append(field(String(i), el('div', { class: 'vec' }, el('span', { style: { flex: '1' }, text: baseName(p) + (project.file(p) ? '' : ' (missing)') }), up, rm)));
    });
    const add = el('button', { class: 'btn small', text: 'Add Open Scene' });
    add.addEventListener('click', () => { if (editor.scenePath && !s.scenes.includes(editor.scenePath)) { s.scenes.push(editor.scenePath); touch(); drawScenes(); } });
    sceneList.append(el('div', { style: { textAlign: 'right', marginTop: '3px' } }, add));
  };
  drawScenes();
  wrap.append(section('Scenes In Build', el('div', { class: 'insp-note info', text: 'SceneManager.LoadScene(name or index) can load these scenes while playing.' }), sceneList));

  // execution order
  const eo = el('div');
  const names = [...scriptMeta.keys()].filter(n => scriptMeta.get(n).kind === 'MonoBehaviour').sort();
  if (!names.length) eo.append(el('div', { style: { color: '#888' }, text: 'Compile your scripts to list them here.' }));
  for (const n of names) eo.append(field(n, numberInput(s.executionOrder[n] || 0, (v) => { if (v) s.executionOrder[n] = v; else delete s.executionOrder[n]; touch(); }, { int: true })));
  wrap.append(section('Script Execution Order', eo));

  const ed = project.data.editor;
  wrap.append(section('Editor Preferences',
    field('Create Objects at Origin', boolEditor(s.createAtOrigin, (v) => { s.createAtOrigin = v; touch(); }), { tip: "Unity's default places new objects where the Scene view is looking. On = always at (0,0,0)." }),
    field('Graphics Quality', enumEditor(['High', 'Low (faster on old PCs)'], ['high', 'low'], ed.quality || 'high', (v) => { ed.quality = v; project.touch('editor'); toast('Reload the page to apply the graphics quality.'); })),
    field('Stack traces in Console', boolEditor(s.stackTraces !== false, (v) => { s.stackTraces = v; touch(); })),
  ));
  h.append(wrap);
}

function layerMatrix(s, touch) {
  const named = [];
  for (let i = 0; i < 32; i++) { const n = BUILTIN_LAYERS[i] ?? s.layers[i]; if (n) named.push([i, n]); }
  const t = el('table', { class: 'layer-matrix' });
  const head = el('tr', {}, el('th'));
  for (let k = named.length - 1; k >= 0; k--) head.append(el('th', { class: 'cl', text: named[k][1] }));
  t.append(head);
  named.forEach(([i, n], r) => {
    const row = el('tr', {}, el('th', { class: 'rl', text: n }));
    for (let k = named.length - 1; k >= 0; k--) {
      const j = named[k][0];
      if (k < r) { row.append(el('td')); continue; }
      const cb = el('input', { type: 'checkbox' });
      cb.checked = ((s.layerMatrix[i] >>> j) & 1) === 1;
      cb.addEventListener('change', () => {
        const set = (a, b, on) => { s.layerMatrix[a] = on ? (s.layerMatrix[a] | (1 << b)) >>> 0 : (s.layerMatrix[a] & ~(1 << b)) >>> 0; };
        set(i, j, cb.checked); set(j, i, cb.checked); touch();
      });
      row.append(el('td', {}, cb));
    }
    t.append(row);
  });
  return el('div', { style: { overflow: 'auto' } }, t);
}
