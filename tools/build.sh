#!/usr/bin/env bash
# Builds the C# side of Anvil into the static site:
#   engine/dotnet/   .NET WebAssembly runtime + Roslyn + UnityEngine + Anvil.Host (binaries in two gzipped packs)
#   engine/refs.bin.gz  reference assemblies the in-browser compiler links user scripts against
# Needs: .NET 8 SDK and the four .nupkg files in tools/nupkgs (see README).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${BUILD_DIR:-/tmp/anvil-build}"
cd "$ROOT"

echo "== Engine (UnityEngine.dll)"
dotnet build src/Engine/Anvil.Engine.csproj -c Release -nologo -v q

echo "== Host (WebAssembly)"
rm -rf "$OUT/host"
dotnet publish src/Host/Anvil.Host.csproj -c Release -nologo -v q -o "$OUT/host"

echo "== Copy runtime to engine/dotnet"
rm -rf "$ROOT/_framework" "$ROOT/engine/dotnet"
mkdir -p "$ROOT/engine/dotnet"
FW="$OUT/host/wwwroot/_framework"
# JS modules + boot config stay as files; every binary goes into two gzipped packs, so the site stays small in
# file count (GitHub's web upload takes at most 100 files) and loads in few requests:
#   framework.pack.gz  .NET runtime, base libraries and the Roslyn compiler (changes only with the .NET version)
#   anvil.pack.gz      UnityEngine + Anvil.Host (small; the only download after an Anvil update)
# packs.json holds each pack's content hash, so browsers re-download a pack only when it really changed.
cp "$FW"/*.js "$FW"/*.json "$ROOT/engine/dotnet/"
python3 - "$FW" "$OUT" "$ROOT/engine/dotnet" <<'PYEOF'
import sys, os, struct, gzip, hashlib, json
fw, tmp, dest = sys.argv[1], sys.argv[2], sys.argv[3]
names = sorted(n for n in os.listdir(fw) if not (n.endswith('.js') or n.endswith('.json')))
mine = lambda n: n.split('.')[0] in ('UnityEngine', 'Anvil')
info = {}
for pack, sel in (('framework', lambda n: not mine(n)), ('anvil', mine)):
    group = [n for n in names if sel(n)]
    raw = os.path.join(tmp, pack + '.pack')
    with open(raw, 'wb') as o:
        o.write(b'ANVPACK1'); o.write(struct.pack('<i', len(group)))
        for n in group:
            data = open(os.path.join(fw, n), 'rb').read()
            b = n.encode('utf-8')
            o.write(struct.pack('<i', len(b))); o.write(b); o.write(struct.pack('<i', len(data))); o.write(data)
    data = open(raw, 'rb').read()
    with open(os.path.join(dest, pack + '.pack.gz'), 'wb') as f:
        f.write(gzip.compress(data, 9, mtime=0))
    info[pack] = {'hash': hashlib.sha256(data).hexdigest()[:16]}
    if pack == 'anvil': info[pack]['files'] = group
    print(f"   {pack}.pack: {len(group)} files")
boot = json.load(open(os.path.join(fw, 'blazor.boot.json')))
info['build'] = boot.get('resources', {}).get('hash', '')[7:23] or info['anvil']['hash']
json.dump(info, open(os.path.join(dest, 'packs.json'), 'w'), separators=(',', ':'))
PYEOF

echo "== Reference assemblies (engine/refs.bin.gz)"
mkdir -p "$ROOT/engine"
REFDIR="$(ls -d "$(dirname "$(readlink -f "$(which dotnet)")")"/packs/Microsoft.NETCore.App.Ref/8.*/ref/net8.0 | sort -V | tail -1)"
python3 - "$REFDIR" "$ROOT/src/Engine/bin/Release/net8.0/UnityEngine.dll" "$OUT/refs.bin" <<'EOF'
import sys, os, struct
refdir, engine, out = sys.argv[1], sys.argv[2], sys.argv[3]
files = sorted(os.path.join(refdir, f) for f in os.listdir(refdir) if f.endswith('.dll'))
files.append(engine)
with open(out, 'wb') as o:
    o.write(struct.pack('<i', len(files)))
    for p in files:
        name = os.path.basename(p).encode('utf-8')
        data = open(p, 'rb').read()
        o.write(struct.pack('<i', len(name))); o.write(name)
        o.write(struct.pack('<i', len(data))); o.write(data)
print(f"   {len(files)} assemblies")
EOF
gzip -9 -n -c "$OUT/refs.bin" > "$ROOT/engine/refs.bin.gz"

du -sh "$ROOT/engine/dotnet" "$ROOT/engine/refs.bin.gz"
echo "== Done"
