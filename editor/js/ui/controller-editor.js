// Animator Controller asset editor (list-based): parameters, layers, states with clips or 1D blend trees,
// transitions with conditions, Any State transitions. The data is the .controller asset's JSON.
import { el, bus } from '../core/events.js';
import { project, baseName } from '../core/project.js';
import { field, numberInput, enumEditor, boolEditor, textEditor, objectField, foldout } from './fields.js';
import { pick } from './dialogs.js';

export function newControllerData(clips = []) {
  const states = clips.map(c => ({ name: c.name, motion: c.key, speed: 1, transitions: [] }));
  return { parameters: [], layers: [{ name: 'Base Layer', weight: 1, blending: 'Override', defaultState: states[0]?.name || null, states, anyState: [] }] };
}
// every animation clip in the project ("Assets/Robot.fbx#clip0")
export function allClips() {
  const out = [];
  for (const [p, f] of Object.entries(project.data.files)) if (f.kind === 'model') (f.data?.clips || []).forEach((c, i) => out.push({ key: `${p}#clip${i}`, name: c.name, model: p, length: c.length }));
  return out;
}
export function clipLabel(key) {
  if (!key) return null;
  const i = key.lastIndexOf('#clip'); if (i < 0) return key;
  const f = project.file(key.slice(0, i)); return f?.data?.clips?.[+key.slice(i + 5)]?.name || 'Missing (Clip)';
}
export async function pickClip(title = 'Select AnimationClip') {
  return pick(title, [{ label: 'None', value: null }, ...allClips().map(c => ({ label: c.name, hint: c.model, value: c.key }))]);
}
export function clipField(value, onChange, label = 'AnimationClip') {
  return objectField(clipLabel(value), label, {
    onPick: async () => { const v = await pickClip(); if (v !== undefined) onChange(v); },
    onClear: () => onChange(null),
    onPing: () => { const i = value?.lastIndexOf('#clip'); if (i > 0) bus.emit('ping-asset', value.slice(0, i)); },
  });
}

const open = new Set(); // foldouts kept open across redraws
const MODES = { Float: ['Greater', 'Less'], Int: ['Greater', 'Less', 'Equals', 'NotEqual'], Bool: ['If', 'IfNot'], Trigger: ['If'] };
const MODE_LABEL = { If: 'true', IfNot: 'false', Greater: 'Greater', Less: 'Less', Equals: 'Equals', NotEqual: 'NotEqual' };

export function renderControllerEditor(body, path, f, save, rerender) {
  const d = f.data || (f.data = newControllerData());
  d.parameters ||= []; d.layers ||= [{ name: 'Base Layer', weight: 1, blending: 'Override', defaultState: null, states: [], anyState: [] }];
  const change = (fn) => { fn(); save(); rerender(); };
  const btn = (text, fn, title) => { const b = el('button', { class: 'btn', text, title: title || '', style: { whiteSpace: 'nowrap' } }); b.addEventListener('click', fn); return b; };
  const row = (...kids) => el('div', { style: { display: 'flex', gap: '4px', alignItems: 'center', margin: '2px 0' } }, ...kids);
  const head = (t) => el('div', { style: { color: '#ddd', margin: '10px 0 4px', fontWeight: '600' }, text: t });
  const note = (t) => el('div', { class: 'insp-note', text: t });

  body.append(el('div', { class: 'insp-note info', text: 'Animator Controller. Put it on an Animator component (Controller). Scripts drive it with animator.SetFloat / SetBool / SetTrigger / Play / CrossFade.' }));

  // ---- parameters ----
  body.append(head('Parameters'));
  d.parameters.forEach((p, i) => {
    const name = textEditor(p.name, (v) => change(() => { renameParam(d, p.name, v); p.name = v; }));
    name.style.flex = '1';
    const type = enumEditor(['Float', 'Int', 'Bool', 'Trigger'], ['Float', 'Int', 'Bool', 'Trigger'], p.type, (v) => change(() => { p.type = v; p.default = v === 'Bool' || v === 'Trigger' ? false : 0; }));
    type.style.width = '70px';
    const def = p.type === 'Bool' ? boolEditor(!!p.default, (v) => change(() => { p.default = v; })) : p.type === 'Trigger' ? el('span', { style: { width: '60px' } }) : numberInput(p.default || 0, (v) => change(() => { p.default = v; }), { int: p.type === 'Int' });
    def.style && (def.style.width = '60px');
    body.append(row(name, type, def, btn('✕', () => change(() => d.parameters.splice(i, 1)), 'Remove')));
  });
  body.append(row(btn('+ Parameter', () => change(() => { let n = 'New Float', k = 1; while (d.parameters.some(p => p.name === n)) n = 'New Float ' + k++; d.parameters.push({ name: n, type: 'Float', default: 0 }); }))));

  // ---- layers ----
  d.layers.forEach((L, li) => {
    L.states ||= []; L.anyState ||= [];
    body.append(head(L.name || 'Layer'));
    if (li > 0) {
      body.append(field('Name', textEditor(L.name, (v) => change(() => { L.name = v; }))));
      body.append(field('Weight', numberInput(L.weight ?? 1, (v) => change(() => { L.weight = Math.max(0, Math.min(1, v)); }))));
      body.append(field('Blending', enumEditor(['Override', 'Additive'], ['Override', 'Additive'], L.blending || 'Override', (v) => change(() => { L.blending = v; }))));
      body.append(row(btn('Remove Layer', () => change(() => d.layers.splice(li, 1)))));
    }
    const stateNames = L.states.map(s => s.name);
    body.append(field('Default State', enumEditor(stateNames.length ? stateNames : ['(none)'], stateNames.length ? stateNames : [null], L.defaultState, (v) => change(() => { L.defaultState = v; }))));
    // states
    L.states.forEach((s, si) => {
      s.transitions ||= [];
      const key = path + ':' + li + ':' + si;
      const isOpen = open.has(key);
      body.append(foldout(`${s.name}${L.defaultState === s.name ? '  (default)' : ''}  ${s.blendTree ? '· Blend Tree' : s.motion ? '· ' + clipLabel(s.motion) : ''}`, isOpen, (v) => { if (v) open.add(key); else open.delete(key); rerender(); }));
      if (!isOpen) return;
      const box = el('div', { style: { paddingLeft: '12px', borderLeft: '1px solid #444', margin: '2px 0 6px 6px' } });
      body.append(box);
      box.append(field('Name', textEditor(s.name, (v) => change(() => { renameState(L, s.name, v); s.name = v; }))));
      box.append(field('Motion Type', enumEditor(['Clip', 'Blend Tree (1D)'], [false, true], !!s.blendTree, (v) => change(() => { if (v) s.blendTree = s.blendTree || { param: d.parameters.find(p => p.type === 'Float')?.name || null, children: s.motion ? [{ motion: s.motion, threshold: 0 }] : [] }; else delete s.blendTree; }))));
      if (!s.blendTree) box.append(field('Motion', clipField(s.motion, (v) => change(() => { s.motion = v; if (v && (!s.name || s.name.startsWith('New State'))) s.name = uniqueState(L, clipLabel(v)); }))));
      else {
        const floats = d.parameters.filter(p => p.type === 'Float').map(p => p.name);
        box.append(field('Blend Parameter', enumEditor(floats.length ? floats : ['(add a Float parameter)'], floats.length ? floats : [null], s.blendTree.param, (v) => change(() => { s.blendTree.param = v; }))));
        (s.blendTree.children ||= []).forEach((c, ci) => {
          const th = numberInput(c.threshold ?? 0, (v) => change(() => { c.threshold = v; })); th.style.width = '60px';
          const cf = clipField(c.motion, (v) => change(() => { c.motion = v; })); cf.style.flex = '1';
          box.append(row(cf, th, btn('✕', () => change(() => s.blendTree.children.splice(ci, 1)))));
        });
        box.append(row(btn('+ Motion', () => change(() => { const ch = s.blendTree.children; ch.push({ motion: null, threshold: ch.length ? (ch[ch.length - 1].threshold || 0) + 1 : 0 }); }))));
        box.append(note('Each motion has a threshold: the blend parameter picks (and mixes) the two closest motions.'));
      }
      box.append(field('Speed', numberInput(s.speed ?? 1, (v) => change(() => { s.speed = v; }))));
      const floats = d.parameters.filter(p => p.type === 'Float').map(p => p.name);
      box.append(field('Speed Multiplier', enumEditor(['None', ...floats], [null, ...floats], s.speedParam || null, (v) => change(() => { if (v) s.speedParam = v; else delete s.speedParam; }))));
      box.append(field('Cycle Offset', numberInput(s.cycleOffset ?? 0, (v) => change(() => { s.cycleOffset = v; }))));
      box.append(field('Tag', textEditor(s.tag || '', (v) => change(() => { s.tag = v; }))));
      box.append(field('Behaviours', textEditor((s.behaviours || []).join(', '), (v) => change(() => { s.behaviours = v.split(',').map(x => x.trim()).filter(Boolean); })), { tip: 'StateMachineBehaviour script names, separated by commas' }));
      box.append(el('div', { style: { color: '#ccc', margin: '6px 0 2px' }, text: 'Transitions' }));
      s.transitions.forEach((t, ti) => transitionEditor(box, d, L, t, () => change(() => s.transitions.splice(ti, 1)), change, false));
      box.append(row(btn('+ Transition', () => change(() => s.transitions.push({ to: L.states.find(x => x !== s)?.name || s.name, hasExitTime: true, exitTime: 0.75, fixedDuration: true, duration: 0.25, offset: 0, conditions: [] }))),
        btn('Set as Default', () => change(() => { L.defaultState = s.name; })), btn('Delete State', () => change(() => { L.states.splice(si, 1); if (L.defaultState === s.name) L.defaultState = L.states[0]?.name || null; for (const o of L.states) o.transitions = (o.transitions || []).filter(t => t.to !== s.name); L.anyState = L.anyState.filter(t => t.to !== s.name); }))));
    });
    body.append(row(btn('+ State', () => change(() => { L.states.push({ name: uniqueState(L, 'New State'), motion: null, speed: 1, transitions: [] }); if (!L.defaultState) L.defaultState = L.states[0].name; open.add(path + ':' + li + ':' + (L.states.length - 1)); })),
      btn('+ States from all clips', () => change(() => { for (const c of allClips()) if (!L.states.some(s => s.motion === c.key)) L.states.push({ name: uniqueState(L, c.name), motion: c.key, speed: 1, transitions: [] }); if (!L.defaultState && L.states[0]) L.defaultState = L.states[0].name; }))));
    // any state
    const akey = path + ':' + li + ':any';
    body.append(foldout(`Any State (${L.anyState.length} transition${L.anyState.length === 1 ? '' : 's'})`, open.has(akey), (v) => { if (v) open.add(akey); else open.delete(akey); rerender(); }));
    if (open.has(akey)) {
      const box = el('div', { style: { paddingLeft: '12px', borderLeft: '1px solid #444', margin: '2px 0 6px 6px' } });
      body.append(box);
      L.anyState.forEach((t, ti) => transitionEditor(box, d, L, t, () => change(() => L.anyState.splice(ti, 1)), change, true));
      box.append(row(btn('+ Transition', () => change(() => L.anyState.push({ to: L.states[0]?.name || null, hasExitTime: false, exitTime: 0.75, fixedDuration: true, duration: 0.25, offset: 0, canTransitionToSelf: true, conditions: [] })))));
      box.append(note('Any State transitions are checked first, from whatever state is playing. Leave "Can Transition To Self" off for triggers, or the state restarts every frame the condition holds.'));
    }
  });
  body.append(row(btn('+ Layer', () => change(() => d.layers.push({ name: 'New Layer ' + d.layers.length, weight: 1, blending: 'Override', defaultState: null, states: [], anyState: [] })))));
}

function transitionEditor(box, d, L, t, remove, change, any) {
  t.conditions ||= [];
  const wrap = el('div', { style: { background: '#2b2b2b', border: '1px solid #3a3a3a', borderRadius: '3px', padding: '4px 6px', margin: '3px 0' } });
  box.append(wrap);
  const names = L.states.map(s => s.name);
  const toVals = any ? names : [...names, '__exit'], toLabels = any ? names : [...names, 'Exit'];
  wrap.append(field('→ To', enumEditor(toLabels.length ? toLabels : ['(none)'], toVals.length ? toVals : [null], t.exit ? '__exit' : t.to, (v) => change(() => { if (v === '__exit') { t.exit = true; t.to = null; } else { t.exit = false; t.to = v; } }))));
  wrap.append(field('Has Exit Time', boolEditor(!!t.hasExitTime, (v) => change(() => { t.hasExitTime = v; }))));
  if (t.hasExitTime) wrap.append(field('Exit Time', numberInput(t.exitTime ?? 0.75, (v) => change(() => { t.exitTime = v; }))));
  wrap.append(field('Fixed Duration', boolEditor(t.fixedDuration !== false, (v) => change(() => { t.fixedDuration = v; }))));
  wrap.append(field(t.fixedDuration !== false ? 'Duration (s)' : 'Duration (%)', numberInput(t.duration ?? 0.25, (v) => change(() => { t.duration = Math.max(0, v); }))));
  wrap.append(field('Offset', numberInput(t.offset ?? 0, (v) => change(() => { t.offset = v; }))));
  if (any) wrap.append(field('Can Transition To Self', boolEditor(t.canTransitionToSelf !== false, (v) => change(() => { t.canTransitionToSelf = v; }))));
  wrap.append(el('div', { style: { color: '#aaa', margin: '4px 0 2px' }, text: t.conditions.length ? 'Conditions (all must be true)' : (t.hasExitTime ? 'No conditions: leaves at Exit Time' : 'Add a condition or turn on Has Exit Time') }));
  const params = d.parameters.map(p => p.name);
  t.conditions.forEach((c, ci) => {
    const p = d.parameters.find(x => x.name === c.param);
    const type = p?.type || 'Float';
    const pe = enumEditor(params.length ? params : ['(add a parameter)'], params.length ? params : [null], c.param, (v) => change(() => { c.param = v; const nt = d.parameters.find(x => x.name === v)?.type || 'Float'; if (!MODES[nt].includes(c.mode)) c.mode = MODES[nt][0]; }));
    pe.style.flex = '1';
    const me = enumEditor(MODES[type].map(m => MODE_LABEL[m]), MODES[type], MODES[type].includes(c.mode) ? c.mode : MODES[type][0], (v) => change(() => { c.mode = v; }));
    me.style.width = '80px';
    const kids = [pe, me];
    if (type === 'Float' || type === 'Int') { const th = numberInput(c.threshold ?? 0, (v) => change(() => { c.threshold = v; }), { int: type === 'Int' }); th.style.width = '55px'; kids.push(th); }
    const x = el('button', { class: 'btn', text: '✕' }); x.addEventListener('click', () => change(() => t.conditions.splice(ci, 1)));
    kids.push(x);
    wrap.append(el('div', { style: { display: 'flex', gap: '4px', alignItems: 'center', margin: '2px 0' } }, ...kids));
  });
  const add = el('button', { class: 'btn', text: '+ Condition' }); add.addEventListener('click', () => change(() => { const p = d.parameters[0]; t.conditions.push({ param: p?.name || null, mode: MODES[p?.type || 'Float'][0], threshold: 0 }); }));
  const del = el('button', { class: 'btn', text: 'Remove Transition' }); del.addEventListener('click', remove);
  wrap.append(el('div', { style: { display: 'flex', gap: '4px', margin: '3px 0' } }, add, del));
}
function uniqueState(L, base) { let n = base || 'New State', k = 1; while (L.states.some(s => s.name === n)) n = `${base} ${k++}`; return n; }
function renameState(L, from, to) {
  if (L.defaultState === from) L.defaultState = to;
  for (const s of L.states) for (const t of s.transitions || []) if (t.to === from) t.to = to;
  for (const t of L.anyState || []) if (t.to === from) t.to = to;
}
function renameParam(d, from, to) {
  for (const L of d.layers) {
    for (const s of L.states) {
      if (s.speedParam === from) s.speedParam = to;
      if (s.blendTree?.param === from) s.blendTree.param = to;
      for (const t of s.transitions || []) for (const c of t.conditions || []) if (c.param === from) c.param = to;
    }
    for (const t of L.anyState || []) for (const c of t.conditions || []) if (c.param === from) c.param = to;
  }
}
export function controllerPathFor(modelPath) { return modelPath.replace(/\.[^.]+$/, '') + ' Controller.controller'; }
export function baseOf(p) { return baseName(p); }
