// Home: every project in this browser (and the folder each one saves to) with its scenes, like Unity Hub.
// Click a scene to open it (switching project and reconnecting its folder if needed). Esc or ✕ goes back.
import { el, toast, bus } from '../core/events.js';
import { project, storage, baseName } from '../core/project.js';
import { editor } from '../core/scene.js';
import { linkedFolderName, folderSupported } from '../core/local-folder.js';

const CSS = `
#home { position: fixed; inset: 0; z-index: 900; background: var(--bg-darker, #191919); color: var(--text, #ddd); display: flex; flex-direction: column; font: 13px var(--font, system-ui); }
#home .h-top { display: flex; align-items: center; gap: 10px; padding: 14px 22px; border-bottom: 1px solid var(--border, #111); background: var(--bg-header, #282828); flex-wrap: wrap; }
#home .h-top h1 { font-size: 17px; margin: 0 12px 0 0; font-weight: 600; color: var(--text-bright, #fff); }
#home .h-top .sp { flex: 1; }
#home button { background: var(--bg-button, #3a3a3a); color: var(--text, #ddd); border: 1px solid var(--border, #111); border-radius: 4px; padding: 6px 12px; cursor: pointer; font: inherit; }
#home button:hover { background: var(--bg-button-hover, #474747); }
#home button.primary { background: var(--accent, #2c5d87); color: #fff; border-color: transparent; }
#home .h-list { flex: 1; overflow: auto; padding: 18px 22px 40px; display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); align-content: start; }
#home .card { background: var(--bg, #222); border: 1px solid var(--border, #111); border-radius: 8px; padding: 14px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
#home .card.current { border-color: var(--accent, #2c5d87); }
#home .card .name { font-size: 15px; font-weight: 600; color: var(--text-bright, #fff); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#home .card .meta { color: var(--text-dim, #999); font-size: 12px; display: flex; gap: 10px; flex-wrap: wrap; }
#home .card .tag { border: 1px solid var(--border-light, #444); border-radius: 99px; padding: 0 8px; font-size: 11px; }
#home .card .tag.now { border-color: var(--accent, #2c5d87); color: #9cc8f0; }
#home .scenes { display: flex; flex-direction: column; gap: 2px; }
#home .scene { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 4px; cursor: pointer; }
#home .scene:hover { background: var(--bg-hover, #303030); }
#home .scene .n { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#home .scene .o { color: var(--text-dim, #999); font-size: 11px; }
#home .empty { color: var(--text-dim, #999); padding: 30px; }
`;

let deps = null;
export function initHome(d) {
  deps = d;
  document.head.append(el('style', { text: CSS }));
  bus.on('show-home', () => showHome());
}
export function hideHome() { document.getElementById('home')?.remove(); document.removeEventListener('keydown', onKey, true); }
function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); hideHome(); } }

const ago = (t) => {
  if (!t) return '';
  const s = (Date.now() - t) / 1000;
  if (s < 90) return 'just now';
  if (s < 3600) return Math.round(s / 60) + ' min ago';
  if (s < 86400) return Math.round(s / 3600) + ' h ago';
  return new Date(t).toLocaleDateString();
};

export async function showHome() {
  if (editor.playing) { toast('Stop playing first'); return; }
  hideHome();
  try { await project.saveNow(); } catch { }
  const list = el('div', { class: 'h-list' }, el('div', { class: 'empty', text: 'Loading projects…' }));
  const root = el('div', { id: 'home' },
    el('div', { class: 'h-top' },
      el('h1', { text: 'Anvil · Projects' }),
      el('button', { class: 'primary', text: '+ New Project', onclick: async () => { hideHome(); await deps.newProject(); } }),
      folderSupported() ? el('button', { text: '📁 Open Project Folder on This Computer…', onclick: async () => { hideHome(); await deps.openFolder(); } }) : null,
      el('span', { class: 'sp' }),
      el('button', { text: '✕ Back to ' + project.name, onclick: hideHome })));
  root.append(list);
  document.body.append(root);
  document.addEventListener('keydown', onKey, true);

  const names = (await storage.listProjects()) || [];
  const cards = [];
  for (const name of names) {
    let p = name === project.name ? project.data : null;
    try { if (!p) p = await storage.getProject(name); } catch { }
    if (!p) continue;
    let folder = null;
    try { folder = (await storage.get('folder:' + name))?.name || null; } catch { }
    cards.push({ name, p, folder });
  }
  cards.sort((a, b) => (a.name === project.name ? -1 : b.name === project.name ? 1 : (b.p.modified || 0) - (a.p.modified || 0)));
  list.innerHTML = '';
  if (!cards.length) list.append(el('div', { class: 'empty', text: 'No projects yet.' }));
  for (const c of cards) {
    const isNow = c.name === project.name;
    const scenes = Object.keys(c.p.files || {}).filter(k => c.p.files[k]?.kind === 'scene').sort();
    const linked = isNow && linkedFolderName();
    const card = el('div', { class: 'card' + (isNow ? ' current' : '') },
      el('div', { class: 'name', text: c.name, title: c.name }),
      el('div', { class: 'meta' },
        isNow ? el('span', { class: 'tag now', text: 'open now' }) : null,
        c.folder ? el('span', { class: 'tag', text: '📁 ' + c.folder + (isNow && !linked ? ' (not connected)' : ''), title: 'Saved as files in the folder "' + c.folder + '" on this computer' }) : el('span', { class: 'tag', text: 'in this browser only' }),
        el('span', { text: scenes.length + ' scene' + (scenes.length === 1 ? '' : 's') }),
        c.p.modified ? el('span', { text: 'edited ' + ago(c.p.modified) }) : null),
      el('div', { class: 'scenes' }, scenes.map(s => el('div', { class: 'scene', title: s, onclick: () => open(c, s) },
        el('span', { text: '◆' }), el('span', { class: 'n', text: baseName(s) }),
        s === c.p.openScene ? el('span', { class: 'o', text: 'last open' }) : null))),
      el('div', {}, el('button', { text: isNow ? 'Back to this project' : 'Open project', onclick: () => open(c, null) })));
    list.append(card);
  }
}

// open a project (and a scene in it); a project that saves to a folder asks for that folder again if needed
async function open(c, scene) {
  let h = null, granted = false;
  try { h = await storage.get('folder:' + c.name); } catch { }
  // ask while the click still counts as the user's action (the browser only shows the prompt then)
  if (h) { try { granted = (await h.queryPermission({ mode: 'readwrite' })) === 'granted' || (await h.requestPermission({ mode: 'readwrite' })) === 'granted'; } catch { } }
  hideHome();
  const waitLinked = () => new Promise(res => { const off = bus.on('folder-status', (e) => { if (e && e.linked) { off(); res(); } }); setTimeout(() => { off(); res(); }, 4000); });
  if (c.name !== project.name) {
    await project.saveNow();
    const linked = h && granted ? waitLinked() : null;
    await project.load(c.name);   // a granted folder reconnects on load and reads the newest files from it
    if (linked) await linked;
  } else if (h && granted && !linkedFolderName()) {
    await deps.reconnect();
  }
  if (h && !granted) toast(`Working on the browser copy of "${c.name}". Click 📁 Reconnect at the top right to save into "${h.name}" again.`, '', 6000);
  if (scene && project.file(scene) && project.data.openScene !== scene) deps.openScene(scene);
}
