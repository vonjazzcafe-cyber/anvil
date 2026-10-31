// The C# compiler (Roslyn) runs in this Web Worker with its own .NET runtime, so compiling, code completion
// and error checking never freeze the editor — even on a slow laptop.
import { startDotnet, loadRefs } from './dotnet-boot.js';

let X = null;
let ready = null;

async function init(site) {
  X = await startDotnet(site, {
    // the engine assembly declares these imports; the compiler never calls them
    physics: new Proxy({}, { get: () => () => 0 }),
    anvil: { pushFrame: () => { }, pushExtras: () => { }, uploadMesh: () => { }, uploadTexture: () => { }, uploadAudio: () => { } },
  });
  const r = X.InitCompiler(await loadRefs(site));
  if (!String(r).startsWith('ok')) throw new Error(r);
}

const ops = {
  async init({ site }) { ready = init(site); await ready; return 'ok'; },
  warm() { X.WarmCompile(); return 'ok'; },
  setInputHandling({ mode }) { X.SetInputHandling(mode); return 'ok'; },
  compile({ files }) {
    const res = JSON.parse(X.Compile(files));
    res.timing = X.LastTiming();
    if (res.ok) { res.dll = X.LastDll(); res.pdb = X.LastPdb(); }
    return res;
  },
  check({ files }) { return X.Check(files); },
  complete({ files, path, pos }) { return X.Complete(files, path, pos); },
  hover({ files, path, pos }) { return X.Hover(files, path, pos); },
};

self.postMessage({ loaded: true }); // tells the page this browser can run the compiler in a module worker

self.onmessage = async (e) => {
  const { id, op, args } = e.data;
  try {
    if (op !== 'init') await ready;
    const result = await ops[op](args || {});
    const transfer = [];
    if (result && result.dll) transfer.push(result.dll.buffer, result.pdb.buffer);
    self.postMessage({ id, result }, transfer);
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
