// One folder layout for everything that leaves the browser (Unity export zip, backup zip, GitHub):
//   Assets/**.cs, .txt, .json …      your scripts and text files, byte-for-byte
//   Assets/Anvil/project.anvil.json   scenes, prefabs, materials, settings (everything that isn't a text file)
//   Assets/Anvil/Editor/AnvilImporter.cs   Unity editor script that rebuilds the scenes from that JSON
// So the same folder can be dropped into a Unity project or loaded back into Anvil.
import { kindOf, dirName } from '../core/project.js';

export const DATA_PATH = 'Assets/Anvil/project.anvil.json';
export const IMPORTER_PATH = 'Assets/Anvil/Editor/AnvilImporter.cs';
const TEXT_KINDS = new Set(['script', 'text']);

let importerSource = null;
export async function importerCs() {
  if (importerSource) return importerSource;
  const r = await fetch(new URL('editor/unity/AnvilImporter.cs', document.baseURI));
  if (!r.ok) throw new Error('AnvilImporter.cs is missing from the site');
  importerSource = await r.text();
  return importerSource;
}

// Indented JSON, but short arrays of numbers/strings on one line (readable diffs on GitHub)
export function prettyJson(v) {
  const prim = '(?:-?\\d[\\d.eE+-]*|true|false|null)';
  const re = new RegExp('\\[\\s*(' + prim + '(?:,\\s*' + prim + ')*)\\s*\\]', 'g');
  return JSON.stringify(v, null, 1).replace(re, (m, inner) => '[' + inner.replace(/,\s+/g, ', ') + ']');
}

// project data -> { path: string }
export async function projectToFiles(p) {
  const out = {};
  const data = {
    format: 'anvil-project', version: 1, name: p.name,
    settings: p.settings, folders: p.folders, openScene: p.openScene, playerPrefs: p.playerPrefs || {},
    files: {},
  };
  for (const [path, f] of Object.entries(p.files)) {
    if (path.startsWith('Assets/Anvil/')) continue; // generated
    if (TEXT_KINDS.has(f.kind)) out[path] = f.text ?? '';
    else data.files[path] = { kind: f.kind, data: f.data };
  }
  out[DATA_PATH] = prettyJson(data);
  out[IMPORTER_PATH] = await importerCs();
  return out;
}

// { path: string } -> project data (inverse of projectToFiles). Unity .meta files and binary files are ignored.
export function filesToProject(files, fallbackName = 'Imported Project') {
  const json = files[DATA_PATH];
  let d = null;
  if (json) { try { d = JSON.parse(json); } catch (e) { throw new Error('project.anvil.json is damaged: ' + e.message); } }
  const p = {
    format: 'anvil-project', version: 1, name: d?.name || fallbackName, created: Date.now(), modified: Date.now(),
    settings: d?.settings || undefined, folders: d?.folders || ['Assets'], files: {}, openScene: d?.openScene || null,
    playerPrefs: d?.playerPrefs || {}, editor: {},
  };
  if (d?.files) for (const [path, f] of Object.entries(d.files)) if (f && f.kind && !TEXT_KINDS.has(f.kind)) p.files[path] = { kind: f.kind, data: f.data };
  for (const [path, text] of Object.entries(files)) {
    if (!path.startsWith('Assets/') || path.startsWith('Assets/Anvil/') || path.endsWith('.meta')) continue;
    const kind = kindOf(path);
    if (!TEXT_KINDS.has(kind) || typeof text !== 'string') continue;
    p.files[path] = { kind, text };
    let dir = dirName(path);
    while (dir && !p.folders.includes(dir)) { p.folders.push(dir); dir = dirName(dir); }
  }
  return p;
}

export const README = (name) => `${name} — exported from Anvil
==========================================

Open in Unity
-------------
1. Open (or create) a Unity 6 project.
2. Copy the "Assets" folder from this zip into the project folder, merging it with the existing Assets folder.
3. Wait until Unity has compiled everything (no red errors in the Console).
   If your scripts use the new Input System, install it in Window > Package Manager first.
4. Menu: Tools > Anvil > Import Project.
   Your scenes, prefabs, materials, physics materials, ScriptableObject assets, tags, layers,
   gravity, collision matrix and Scenes In Build are recreated with the same values.

Your scripts are plain .cs files in Assets — exactly what you typed in Anvil.

Open in Anvil again
-------------------
File > Import Project Backup (.zip) and pick this zip.
`;
