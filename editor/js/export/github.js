// Sync a project with a GitHub repository (push = upload, pull = download) through the GitHub REST API.
// The repo gets the same layout as the Unity export (Assets/... + Assets/Anvil/project.anvil.json),
// so you can also clone it straight into a Unity project.
import { project } from '../core/project.js';
import { el, toast, bus } from '../core/events.js';
import { dialog, confirm } from '../ui/dialogs.js';
import { projectToFiles, filesToProject, DATA_PATH, prettyJson } from './format.js';
import * as code from '../ui/code-editor.js';

const API = 'https://api.github.com';
const TOKEN_KEY = 'anvil:github-token';

function getToken() {
  try { return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}
function setToken(t, remember) {
  try {
    sessionStorage.setItem(TOKEN_KEY, t);
    if (remember) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY);
  } catch { }
}
function forgetToken() { try { sessionStorage.removeItem(TOKEN_KEY); localStorage.removeItem(TOKEN_KEY); } catch { } }

class GitHubError extends Error { constructor(msg, status) { super(msg); this.status = status; } }

async function gh(token, method, path, body) {
  const r = await fetch(API + path, {
    method,
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  if (r.status === 204) return null;
  const data = await r.json().catch(() => null);
  if (!r.ok) {
    let msg = data?.message || r.statusText;
    if (r.status === 401) msg = 'GitHub rejected the token (expired or mistyped).';
    if (r.status === 403 && /rate limit/i.test(msg)) msg = 'GitHub rate limit reached. Try again in a while.';
    if (r.status === 404 && path.startsWith('/repos/')) msg = 'Repository not found, or the token has no access to it.';
    throw new GitHubError(msg, r.status);
  }
  return data;
}

const enc = new TextEncoder(), dec = new TextDecoder();
async function blobSha(text) {
  // git's id for a file: sha1("blob <size>\0<content>")
  const body = enc.encode(text);
  const head = enc.encode(`blob ${body.length}\0`);
  const all = new Uint8Array(head.length + body.length); all.set(head); all.set(body, head.length);
  const h = await crypto.subtle.digest('SHA-1', all);
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function b64ToText(b64) {
  const bin = atob(b64.replace(/\n/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return dec.decode(bytes);
}
function textToB64(text) {
  const bytes = enc.encode(text); let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
const cleanFolder = (f) => (f || '').trim().replace(/^\/+|\/+$/g, '');
const isManaged = (rel) => rel.startsWith('Assets/') && !rel.endsWith('.meta') && (/\.(cs|txt|json|md|csv|xml)$/i.test(rel));

async function head(token, repo, branch) {
  try {
    const ref = await gh(token, 'GET', `/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
    const commit = await gh(token, 'GET', `/repos/${repo}/git/commits/${ref.object.sha}`);
    return { sha: ref.object.sha, tree: commit.tree.sha };
  } catch (e) {
    if (e.status === 404 || e.status === 409) return null; // empty repo or missing branch
    throw e;
  }
}

async function remoteFiles(token, repo, treeSha, folder) {
  const t = await gh(token, 'GET', `/repos/${repo}/git/trees/${treeSha}?recursive=1`);
  const pre = folder ? folder + '/' : '';
  const files = new Map();
  for (const e of t.tree) if (e.type === 'blob' && e.path.startsWith(pre)) files.set(e.path.slice(pre.length), e);
  return { files, truncated: t.truncated };
}

export async function push(cfg, log) {
  const { token, repo, branch } = cfg; const folder = cleanFolder(cfg.folder);
  const pre = folder ? folder + '/' : '';
  code.saveAll();
  if (!cfg.auto) await project.saveNow();
  log('Checking the repository…');
  const info = await gh(token, 'GET', `/repos/${repo}`);
  if (info.permissions && !info.permissions.push) throw new Error('This token can read the repo but not write to it. Give it "Contents: Read and write".');
  let h = await head(token, repo, branch);
  const sync = project.data.editor.github || {};
  if (h && sync.lastSha && sync.lastSha !== h.sha && sync.repo === repo) {
    if (cfg.auto) return null;   // live sync merges first; never ask
    const ok = await confirm('GitHub has newer changes', 'Someone (maybe you, on another computer) pushed to this repository since your last sync. Pushing now replaces their version of the files you have here. Pull first if you want their changes.', 'Push anyway', true);
    if (!ok) return null;
  }
  if (!h) {
    log('The repository is empty — creating the first commit…');
    await gh(token, 'PUT', `/repos/${repo}/contents/${pre}README.md`, { message: 'Create Anvil project', content: textToB64(`# ${project.name}\n\nMade with Anvil. Open in Unity: copy \`Assets\` into a Unity project, then *Tools > Anvil > Import Project*.\n`), branch });
    h = await head(token, repo, branch);
    if (!h) throw new Error('Could not create the branch ' + branch);
  }
  const local = await projectToFiles(project.data);
  const { files: remote } = await remoteFiles(token, repo, h.tree, folder);
  const changes = [];
  for (const [rel, text] of Object.entries(local)) {
    const r = remote.get(rel);
    if (r && r.sha === await blobSha(text)) continue;
    changes.push({ path: pre + rel, mode: '100644', type: 'blob', content: text });
  }
  for (const [rel, e] of remote) {
    if (!isManaged(rel) || rel in local) continue;
    changes.push({ path: pre + rel, mode: e.mode, type: 'blob', sha: null }); // deleted in Anvil
    const meta = remote.get(rel + '.meta');
    if (meta) changes.push({ path: pre + rel + '.meta', mode: meta.mode, type: 'blob', sha: null });
  }
  if (!changes.length) { log('Already up to date.'); remember(cfg, h.sha); return { sha: h.sha, changed: 0 }; }
  log(`Uploading ${changes.length} change(s)…`);
  const tree = await gh(token, 'POST', `/repos/${repo}/git/trees`, { base_tree: h.tree, tree: changes });
  const msg = cfg.message?.trim() || `Update ${project.name} from Anvil`;
  const commit = await gh(token, 'POST', `/repos/${repo}/git/commits`, { message: msg, tree: tree.sha, parents: [h.sha] });
  try { await gh(token, 'PATCH', `/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, { sha: commit.sha }); }
  catch (e) { if (e.status === 422) throw new Error('GitHub changed while uploading. Pull, then push again.'); throw e; }
  remember(cfg, commit.sha);
  log(`Pushed ${changes.length} change(s).`);
  return { sha: commit.sha, changed: changes.length };
}

export async function pull(cfg, log) {
  const { token, repo, branch } = cfg; const folder = cleanFolder(cfg.folder);
  log('Reading the repository…');
  const h = await head(token, repo, branch);
  if (!h) throw new Error(`The branch "${branch}" doesn't exist yet. Push first.`);
  const { files: remote, truncated } = await remoteFiles(token, repo, h.tree, folder);
  if (truncated) log('Warning: the repository is very large; some files may be missing.');
  const wanted = [...remote.keys()].filter(rel => rel === DATA_PATH || (isManaged(rel) && !rel.startsWith('Assets/Anvil/')));
  if (!wanted.length) throw new Error('No Assets folder found' + (folder ? ` in "${folder}"` : '') + ' in this repository.');
  const sync = project.data.editor.github || {};
  const dirtySinceSync = !sync.lastSync || project.data.modified > sync.lastSync + 2000;
  if (dirtySinceSync) {
    const ok = await confirm('Replace this project?', `Pulling replaces the scenes and scripts of "${project.name}" with the version on GitHub (${wanted.length} files). Changes you made here that you haven't pushed are lost.`, 'Pull', true);
    if (!ok) return null;
  }
  log(`Downloading ${wanted.length} file(s)…`);
  const out = {};
  let i = 0;
  const workers = Array.from({ length: 6 }, async () => {
    while (i < wanted.length) {
      const rel = wanted[i++];
      const b = await gh(token, 'GET', `/repos/${repo}/git/blobs/${remote.get(rel).sha}`);
      out[rel] = b.encoding === 'base64' ? b64ToText(b.content) : b.content;
    }
  });
  await Promise.all(workers);
  const p = filesToProject(out, project.name);
  p.name = project.name;
  p.editor = Object.assign({}, project.data.editor, { github: { repo, branch, folder, lastSha: h.sha, lastSync: Date.now(), live: !!cfg.live } });
  await project.replace(p);
  log(`Pulled ${wanted.length} file(s).`);
  return { sha: h.sha };
}


// ---------------- live sync: keep the project and the repository in step by themselves ----------------
// Every 20 seconds (and when the window gets focus): if GitHub has a newer commit, take the files that changed
// there (scripts whole; scenes, prefabs, settings and saved data one by one inside project.anvil.json), keeping
// everything you changed here that GitHub didn't touch. Then, if you changed anything here, push it.
// Nothing is ever lost for good: every push is a commit in the repository's history.
let liveTimer = null, liveBusy = false, liveBase = null, liveBaseFor = null, liveWaitNoted = false;
const LIVE_MS = 20000;

export function initGitHubLive() {
  bus.on('project-loaded', () => { liveBase = null; liveBaseFor = null; restartLive(); });
  window.addEventListener('focus', () => { if (liveTimer) liveTick(); });
  bus.on('play-state', (st) => { if (liveTimer && st && !st.playing) setTimeout(liveTick, 300); });
  restartLive();
}
function restartLive() {
  clearInterval(liveTimer); liveTimer = null;
  const cfg = project.data?.editor?.github;
  if (!cfg?.live || !cfg.repo || !getToken()) return;
  liveTimer = setInterval(liveTick, LIVE_MS);
  setTimeout(liveTick, 1500);
}

async function liveTick() {
  if (liveBusy) return;
  const cfg = project.data?.editor?.github;
  const token = getToken();
  if (!cfg?.live || !cfg.repo || !token) { clearInterval(liveTimer); liveTimer = null; return; }
  liveBusy = true;
  try {
    const folder = cleanFolder(cfg.folder), branch = cfg.branch || 'main';
    const h = await head(token, cfg.repo, branch);
    if (!h) return;
    // what the repository looked like at our last sync (the common starting point)
    if (!liveBase || liveBaseFor !== cfg.lastSha) {
      if (cfg.lastSha) {
        const c = await gh(token, 'GET', `/repos/${cfg.repo}/git/commits/${cfg.lastSha}`);
        liveBase = (await remoteFiles(token, cfg.repo, c.tree.sha, folder)).files;
      } else liveBase = new Map();
      liveBaseFor = cfg.lastSha;
    }
    if (h.sha !== cfg.lastSha) {
      // only take it if it's really NEWER than our last sync (right after a push GitHub can briefly still report
      // the commit before it; taking that would bounce our own change back)
      let newer = !cfg.lastSha;
      if (cfg.lastSha) {
        const cmp = await gh(token, 'GET', `/repos/${cfg.repo}/compare/${cfg.lastSha}...${h.sha}`).catch(() => null);
        newer = !!cmp && (cmp.status === 'ahead' || cmp.status === 'diverged');
      }
      if (newer) {
        // never interrupt Play: changes wait until you press Stop
        if (window.anvil?.editor?.playing) {
          // GitHub's changes wait for Stop, but what you SAVE while playing (PlayerPrefs, e.g. your punches)
          // goes up now, on top of GitHub's version, so nothing you save is stuck in this browser
          const sent = await pushPrefsWhilePlaying(token, cfg, h, folder).catch(e => { console.warn('GitHub save-while-playing:', e); return false; });
          const now = Date.now();
          if (!sent && (!liveWaitNoted || now - liveWaitNoted > 60000)) { liveWaitNoted = now; toast('New changes on GitHub: they load when you press Stop', 'info', 5000); }
          return;
        }
        liveWaitNoted = false;
        await liveMerge(token, cfg, h, folder);
      }
    }
    // anything changed here since the last sync? push it
    const local = await projectToFiles(project.data);
    let changed = false;
    for (const [rel, text] of Object.entries(local)) if ((liveBase.get(rel)?.sha) !== await blobSha(text)) { changed = true; break; }
    if (changed) {
      const r = await push({ token, repo: cfg.repo, branch, folder, message: `Update ${project.name} from Anvil (auto)`, auto: true }, () => { });
      if (r) { liveBase = null; liveBaseFor = null; }
    }
  } catch (e) { console.warn('GitHub live sync:', e); if (e.status === 401) toast('GitHub sync stopped: ' + e.message, 'error', 8000); }
  finally { liveBusy = false; }
}

// While playing: put this browser's PlayerPrefs into GitHub's newest project file and commit only that.
// The last-sync point stays where it was, so pressing Stop still brings in GitHub's other changes.
async function pushPrefsWhilePlaying(token, cfg, h, folder) {
  const pre = folder ? folder + '/' : '';
  const { files: remote } = await remoteFiles(token, cfg.repo, h.tree, folder);
  const blob = async (sha) => { const b = await gh(token, 'GET', `/repos/${cfg.repo}/git/blobs/${sha}`); return b.encoding === 'base64' ? b64ToText(b.content) : b.content; };
  const r = remote.get(DATA_PATH)?.sha, b = liveBase.get(DATA_PATH)?.sha;
  if (!r) return false;
  const remoteData = JSON.parse(await blob(r)), baseData = b ? JSON.parse(await blob(b)) : { playerPrefs: {} };
  const mine = project.data.playerPrefs || {}, base = baseData.playerPrefs || {}, theirs = remoteData.playerPrefs || {};
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  let n = 0;
  for (const k of new Set([...Object.keys(mine), ...Object.keys(base)])) {
    if (same(mine[k], base[k])) continue;          // not changed here
    if (same(mine[k], theirs[k])) continue;        // already on GitHub
    remoteData.playerPrefs = remoteData.playerPrefs || {};
    if (k in mine) remoteData.playerPrefs[k] = mine[k]; else delete remoteData.playerPrefs[k];
    n++;
  }
  if (!n) return true;
  const tree = await gh(token, 'POST', `/repos/${cfg.repo}/git/trees`, { base_tree: h.tree, tree: [{ path: pre + DATA_PATH, mode: '100644', type: 'blob', content: prettyJson(remoteData) }] });
  const commit = await gh(token, 'POST', `/repos/${cfg.repo}/git/commits`, { message: `Update ${project.name} from Anvil (saved while playing)`, tree: tree.sha, parents: [h.sha] });
  await gh(token, 'PATCH', `/repos/${cfg.repo}/git/refs/heads/${encodeURIComponent(cfg.branch || 'main')}`, { sha: commit.sha });
  toast(`Saved to GitHub (${n} item${n > 1 ? 's' : ''})`, 'info', 2500);
  return true;
}

async function liveMerge(token, cfg, h, folder) {
  const { files: remote } = await remoteFiles(token, cfg.repo, h.tree, folder);
  const local = await projectToFiles(project.data);
  const blob = async (sha) => { const b = await gh(token, 'GET', `/repos/${cfg.repo}/git/blobs/${sha}`); return b.encoding === 'base64' ? b64ToText(b.content) : b.content; };
  let n = 0, openTouched = false;
  const paths = new Set([...remote.keys(), ...liveBase.keys()]);
  const todo = [];
  for (const rel of paths) {
    const r = remote.get(rel)?.sha, b = liveBase.get(rel)?.sha;
    if (r === b) continue;                                  // GitHub didn't change it
    if (rel !== DATA_PATH && !(isManaged(rel) && !rel.startsWith('Assets/Anvil/'))) continue;
    todo.push(rel);
  }
  if (!todo.length) { remember(cfg, h.sha); return; }
  for (const rel of todo) {
    const r = remote.get(rel)?.sha, b = liveBase.get(rel)?.sha;
    if (rel === DATA_PATH) {
      if (!r) continue;
      const next = JSON.parse(await blob(r));
      const prev = b ? JSON.parse(await blob(b)) : { files: {}, settings: {}, playerPrefs: {} };
      const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
      for (const [path, f] of Object.entries(next.files || {})) {
        if (same(prev.files?.[path], f)) continue;
        project.writeData(path, f.data); n++;
        if (path === project.data.openScene) openTouched = true;
      }
      for (const path of Object.keys(prev.files || {})) if (!(path in (next.files || {})) && project.file(path)) { project.remove(path); n++; }
      if (next.settings && !same(prev.settings, next.settings)) { Object.assign(project.data.settings, next.settings); project.touch('settings'); bus.emit('settings-changed'); n++; }
      const np = next.playerPrefs || {}, pp = prev.playerPrefs || {};
      for (const k of new Set([...Object.keys(np), ...Object.keys(pp)])) {
        if (same(np[k], pp[k])) continue;
        project.data.playerPrefs = project.data.playerPrefs || {};
        if (k in np) project.data.playerPrefs[k] = np[k]; else delete project.data.playerPrefs[k];
        project.touch('prefs'); n++;
      }
      for (const f of next.folders || []) project.ensureFolder?.(f);
      if (!same(prev.trash || [], next.trash || [])) { project.data.trash = next.trash || []; project.touch('files'); n++; }
      if (next.openScene && next.openScene !== prev.openScene && project.file(next.openScene)) bus.emit('open-scene', next.openScene);
    } else if (r) {
      const text = await blob(r);
      if (project.file(rel)?.text !== text) { project.writeText(rel, text); code.reloadFromProject?.(rel); n++; }
    } else if (project.file(rel)) { project.remove(rel); n++; }
  }
  if (openTouched) { bus.emit('scene-opened'); bus.emit('scene-changed', { label: 'github' }); bus.emit('selection-changed'); }
  remember(cfg, h.sha);
  liveBase = remote; liveBaseFor = h.sha;
  if (n) { toast(`Got ${n} change${n > 1 ? 's' : ''} from GitHub`); bus.emit('project-changed', 'files'); }
}

function remember(cfg, sha) {
  const was = project.data.editor.github || {};
  project.data.editor.github = { repo: cfg.repo, branch: cfg.branch || 'main', folder: cleanFolder(cfg.folder), lastSha: sha, lastSync: Date.now(), live: cfg.live ?? was.live ?? false };
  project.touch('editor');
}

export function githubDialog() {
  const saved = project.data.editor.github || {};
  const token = el('input', { type: 'password', class: 'wide', placeholder: 'github_pat_…', value: getToken(), spellcheck: 'false', autocomplete: 'off' });
  const rememberBox = el('input', { type: 'checkbox' });
  try { rememberBox.checked = !!localStorage.getItem(TOKEN_KEY); } catch { }
  const repo = el('input', { type: 'text', class: 'wide', placeholder: 'your-name/my-unity-project', value: saved.repo || '', spellcheck: 'false' });
  const branch = el('input', { type: 'text', class: 'wide', value: saved.branch || 'main', spellcheck: 'false' });
  const folder = el('input', { type: 'text', class: 'wide', placeholder: '(repository root)', value: saved.folder || '', spellcheck: 'false' });
  const message = el('input', { type: 'text', class: 'wide', placeholder: `Update ${project.name} from Anvil`, spellcheck: 'false' });
  const liveBox = el('input', { type: 'checkbox' }); liveBox.checked = !!saved.live;
  const out = el('div', { class: 'gh-log' });
  const log = (m, err) => { out.append(el('div', { class: err ? 'err' : '', text: m })); out.scrollTop = out.scrollHeight; };
  for (const i of [token, repo, branch, folder, message]) i.addEventListener('keydown', e => e.stopPropagation());
  const row = (label, input, hint) => el('label', { class: 'gh-row' }, el('span', { text: label }), input, hint ? el('small', { text: hint }) : null);
  const lastInfo = saved.lastSync ? `Last sync: ${new Date(saved.lastSync).toLocaleString()} (${(saved.lastSha || '').slice(0, 7)})` : 'Not synced yet.';
  const body = el('div', { class: 'gh-dialog' },
    el('p', { class: 'insp-note info', html: 'Keep this project in a GitHub repository so you can open it on any computer (and in Unity). ' +
      'You need a <b>fine-grained personal access token</b> with <b>Contents: Read and write</b> on that one repository: ' +
      '<a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">create one here</a>. ' +
      'The token is only sent to api.github.com.' }),
    row('Token', token),
    el('label', { class: 'gh-check' }, rememberBox, el('span', { text: 'Remember the token on this computer (don\'t tick this on a shared university PC)' })),
    row('Repository', repo, 'owner/name — create an empty repository on github.com first (private is fine)'),
    row('Branch', branch),
    row('Folder', folder, 'optional: keep the project in a sub-folder of the repository'),
    row('Message', message, 'optional commit message for Push'),
    el('label', { class: 'gh-check' }, liveBox, el('span', { text: 'Keep in sync automatically: every 20 seconds, get new changes from GitHub and push yours (needs the token remembered)' })),
    el('div', { class: 'gh-last', text: lastInfo }),
    out);
  let busy = false;
  const run = async (fn) => {
    if (busy) return false;
    const cfg = { live: liveBox.checked, token: token.value.trim(), repo: repo.value.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/+$/, ''), branch: branch.value.trim() || 'main', folder: folder.value, message: message.value };
    if (!cfg.token) { log('Paste your token first.', true); return false; }
    if (!/^[\w.-]+\/[\w.-]+$/.test(cfg.repo)) { log('Repository must look like owner/name.', true); return false; }
    setToken(cfg.token, rememberBox.checked);
    busy = true;
    try {
      const r = await fn(cfg, (m) => log(m)); if (r) toast('GitHub: done');
      if (r && project.data.editor.github) { project.data.editor.github.live = liveBox.checked; project.touch('editor'); restartLive(); if (liveBox.checked) log('Automatic sync is on.'); }
    }
    catch (e) { console.error(e); log(e.message || String(e), true); }
    finally { busy = false; }
    return false; // keep dialog open
  };
  dialog({
    title: 'Sync with GitHub', width: 560, body,
    buttons: [
      { label: 'Forget token', action: () => { forgetToken(); token.value = ''; rememberBox.checked = false; log('Token removed from this browser.'); return false; } },
      { label: 'Pull (download)', action: () => { run(pull); return false; } },
      { label: 'Push (upload)', primary: true, action: () => { run(push); return false; } },
    ],
  });
  setTimeout(() => (token.value ? repo : token).focus(), 20);
}
