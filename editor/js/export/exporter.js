// Export to Unity / backup zips, and importing them back.
import { zipSync, unzipSync, strToU8, strFromU8 } from '../../../vendor/fflate.js';
import { project, storage } from '../core/project.js';
import { toast } from '../core/events.js';
import { prompt, pick } from '../ui/dialogs.js';
import { projectToFiles, filesToProject, README } from './format.js';
import * as code from '../ui/code-editor.js';

function safeName(s) { return String(s).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'project'; }

function downloadBlob(name, bytes, type = 'application/zip') {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export async function buildZip() {
  code.saveAll();
  await project.saveNow();
  const files = await projectToFiles(project.data);
  const entries = { 'README.txt': strToU8(README(project.name)) };
  for (const [p, text] of Object.entries(files)) entries[p] = strToU8(text);
  return zipSync(entries, { level: 6 });
}

// The Unity export and the backup are the same zip: it opens in Unity (Tools > Anvil > Import Project) and in Anvil.
export async function exportUnityZip() {
  try {
    const zip = await buildZip();
    downloadBlob(safeName(project.name) + '-Unity.zip', zip);
    toast('Downloaded. In Unity: copy the Assets folder in, then Tools › Anvil › Import Project.', '', 6000);
  } catch (e) { console.error(e); toast('Export failed: ' + e.message, 'error'); }
}
export async function exportProjectZip() {
  try {
    const zip = await buildZip();
    downloadBlob(safeName(project.name) + '-' + new Date().toISOString().slice(0, 10) + '.zip', zip);
  } catch (e) { console.error(e); toast('Backup failed: ' + e.message, 'error'); }
}

export async function readZipOrJson(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (file.name.toLowerCase().endsWith('.json')) {
    const d = JSON.parse(strFromU8(bytes));
    if (d.format !== 'anvil-project') throw new Error('Not an Anvil project file');
    return { 'Assets/Anvil/project.anvil.json': JSON.stringify(d) };
  }
  const raw = unzipSync(bytes);
  const files = {};
  // the zip may have a top folder (e.g. GitHub's "Download ZIP"): find where Assets/ starts
  const names = Object.keys(raw);
  const anchor = names.find(n => /(^|\/)Assets\/Anvil\/project\.anvil\.json$/.test(n)) || names.find(n => /(^|\/)Assets\//.test(n));
  if (!anchor) throw new Error('This zip has no Assets folder');
  const prefix = anchor.slice(0, anchor.indexOf('Assets/'));
  for (const [n, data] of Object.entries(raw)) {
    if (!n.startsWith(prefix) || n.endsWith('/')) continue;
    const path = n.slice(prefix.length);
    if (!path.startsWith('Assets/')) continue;
    try { files[path] = strFromU8(data); } catch { /* binary: skipped */ }
  }
  return files;
}

// Loads project data as a project in this browser, asking what to do if the name is taken.
export async function installProject(p) {
  const existing = await storage.listProjects();
  if (existing.includes(p.name)) {
    const choice = await pick(`A project called "${p.name}" already exists`, [
      { label: 'Import as a copy', value: 'copy' },
      { label: 'Replace it', hint: 'the old version is lost', value: 'replace' },
    ]);
    if (!choice) return false;
    if (choice === 'copy') {
      let n = 2; while (existing.includes(`${p.name} (${n})`)) n++;
      const name = await prompt('Import Project', 'Name for the copy:', `${p.name} (${n})`, 'Import');
      if (!name) return false;
      p.name = name;
    }
  }
  await project.saveNow();
  await project.replace(p);
  return true;
}

export function importProjectZip() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.zip,.json';
  input.onchange = async () => {
    const file = input.files[0]; if (!file) return;
    try {
      const files = await readZipOrJson(file);
      const p = filesToProject(files, file.name.replace(/\.(zip|json)$/i, '').replace(/-Unity$/, ''));
      if (await installProject(p)) toast(`Imported "${p.name}"`);
    } catch (e) { console.error(e); toast('Import failed: ' + e.message, 'error', 6000); }
  };
  input.click();
}
