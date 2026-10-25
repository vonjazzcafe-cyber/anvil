// Starts a .NET WebAssembly runtime (used on the page for Play mode, and in a Web Worker for the compiler).
// The binaries come from two gzipped packs (engine/dotnet/framework.pack.gz and anvil.pack.gz, see tools/build.sh),
// decompressed with the browser's DecompressionStream and handed to the runtime file by file. Each binary is then
// kept in Cache Storage ('anvil-bin', keyed by its content hash), so later visits — and offline use — skip the
// packs entirely, and after an update only the binaries that changed are fetched again.
// No DOM access here, so it runs in workers too.

export async function fetchGz(url, type = 'application/octet-stream') {
  const r = await fetch(url);
  if (!r.ok) throw new Error('missing ' + url.split('/').pop().split('?')[0]);
  const body = r.body.pipeThrough(new DecompressionStream('gzip'));
  return new Response(body, { headers: { 'content-type': type } });
}

// engine/dotnet/packs.json: content hash of each binary pack and of the build (see tools/build.sh)
const infos = new Map();
export function packInfo(site) {
  if (!infos.has(site)) infos.set(site, fetch(new URL('engine/dotnet/packs.json', site), { cache: 'no-cache' })
    .then(r => r.ok ? r.json() : null).catch(() => null));
  return infos.get(site);
}
// cache-busting query from the build's hash, so browsers re-download after an update
export async function buildVersion(site) {
  const i = await packInfo(site);
  return i?.build ? '?v=' + encodeURIComponent(i.build) : '';
}

async function loadPack(site, name, hash) {
  const buf = await (await fetchGz(new URL(`engine/dotnet/${name}.pack.gz` + (hash ? '?v=' + hash : ''), site).href)).arrayBuffer();
  const dv = new DataView(buf), u8 = new Uint8Array(buf), dec = new TextDecoder();
  if (dec.decode(u8.subarray(0, 8)) !== 'ANVPACK1') throw new Error(name + '.pack is damaged');
  const files = new Map();
  let o = 8; const n = dv.getInt32(o, true); o += 4;
  for (let i = 0; i < n; i++) {
    const nl = dv.getInt32(o, true); o += 4;
    const fname = dec.decode(u8.subarray(o, o + nl)); o += nl;
    const len = dv.getInt32(o, true); o += 4;
    files.set(fname, u8.subarray(o, o + len)); o += len;
  }
  return files;
}

const BIN_CACHE = 'anvil-bin';
let binCache = null;
const openBin = () => binCache ??= (globalThis.caches ? caches.open(BIN_CACHE).catch(() => null) : Promise.resolve(null));
const binKey = (site, name, hash) => new URL(`engine/dotnet/${name}?h=${encodeURIComponent(hash)}`, site).href;
const binHeaders = (name) => ({ 'content-type': name.endsWith('.wasm') && name.startsWith('dotnet.native') ? 'application/wasm' : 'application/octet-stream' });

// Stores binaries that came from a pack, then drops cached binaries this build no longer uses.
// Runs after the runtime has started, so it never slows the start itself.
async function storeBinaries(site, items) {
  const cache = await openBin();
  if (!cache || !items.length) return;
  for (const [key, name, data] of items) { try { await cache.put(key, new Response(data, { headers: binHeaders(name) })); } catch { return; } }
  try {
    const boot = await (await fetch(new URL('engine/dotnet/blazor.boot.json', site))).json();
    const keep = new Set();
    for (const group of Object.values(boot.resources || {})) if (group && typeof group === 'object') for (const [n, h] of Object.entries(group)) keep.add(binKey(site, n, h));
    for (const req of await cache.keys()) if (!keep.has(req.url)) await cache.delete(req);
    // caches made by earlier Anvil versions (the .NET loader's own)
    for (const k of await caches.keys()) if (k.startsWith('dotnet-resources-')) await caches.delete(k);
  } catch { }
}

export const bootTiming = {};
// skip: optional RegExp of assembly file names this runtime never needs (they aren't loaded at all)
export async function startDotnet(site, imports = {}, config = {}, skip = null) {
  const T0 = performance.now(), mark = (k) => { bootTiming[k] = Math.round(performance.now() - T0); };
  const base = new URL('engine/dotnet/', site).href;
  const info = await packInfo(site);
  const packs = new Map(), toStore = [];
  let fromCache = 0;
  const packFor = (name) => info?.anvil?.files?.includes(name) ? 'anvil' : 'framework';
  const resourceLoader = (type, name, defaultUri, hash) => {
    if (!/\.(wasm|pdb|dat)$/.test(name)) return undefined; // JS modules + boot config: load normally
    return (async () => {
      const cache = hash ? await openBin() : null;
      const key = hash ? binKey(site, name, hash) : null;
      if (cache) {
        const hit = await cache.match(key).catch(() => null);
        if (hit) { fromCache++; return hit; }
      }
      const p = packFor(name);
      if (!packs.has(p)) packs.set(p, loadPack(site, p, info?.[p]?.hash).then(f => { mark(p + '-pack'); return f; }));
      const data = (await packs.get(p)).get(name);
      if (!data) return fetch(defaultUri);
      if (cache) toStore.push([key, name, data]);
      return new Response(data, { headers: binHeaders(name) });
    })();
  };
  const { dotnet } = await import(base + 'dotnet.js');
  mark('import');
  const rt = await dotnet.withConfig({ disableIntegrityCheck: true, ...config }).withResourceLoader(resourceLoader)
    .withModuleConfig({
      onConfigLoaded: (cfg) => {
        cfg.cacheBootResources = false; // Anvil caches the binaries itself (above), in workers too
        const a = cfg.resources?.assembly;
        if (skip && a) for (const k of Object.keys(a)) if (skip.test(k)) delete a[k];
      },
    }).create();
  mark('create');
  bootTiming.cached = fromCache;
  for (const [name, mod] of Object.entries(imports)) rt.setModuleImports(name, mod);
  const exports = await rt.getAssemblyExports(rt.getConfig().mainAssemblyName);
  const X = exports.Anvil.Host.Interop;
  mark('exports');
  await X.WarmUp(); // see Interop.WarmUp: lets Roslyn's internal Task waits work on the single thread
  mark('warmup');
  if (toStore.length) setTimeout(() => storeBinaries(site, toStore.splice(0)), 1500);
  return X;
}

export async function loadRefs(site) {
  const r = await fetchGz(new URL('engine/refs.bin.gz' + await buildVersion(site), site).href);
  return new Uint8Array(await r.arrayBuffer());
}
