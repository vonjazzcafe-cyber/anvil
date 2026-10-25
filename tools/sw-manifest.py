#!/usr/bin/env python3
"""Writes the list of editor files (and a version hash of their contents) into sw.js.
Usage: tools/sw-manifest.py [site_root]   (run by tools/package.sh)"""
import hashlib, json, os, re, sys

root = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..'))
files = ['index.html']
for top in ('editor', 'vendor'):
    for d, _, names in os.walk(os.path.join(root, top)):
        for n in sorted(names):
            if n.endswith(('.js', '.mjs', '.css', '.svg', '.png', '.woff2')):
                files.append(os.path.relpath(os.path.join(d, n), root).replace(os.sep, '/'))
eng = os.path.join(root, 'engine')
for n in sorted(os.listdir(os.path.join(eng, 'dotnet'))):
    if n != 'framework.pack.gz':  # big; the .NET loader caches the binaries in it itself
        files.append('engine/dotnet/' + n)
files.append('engine/refs.bin.gz')
files = sorted(set(files))
h = hashlib.sha256()
for f in files:
    h.update(f.encode()); h.update(open(os.path.join(root, f), 'rb').read())
manifest = {'version': h.hexdigest()[:16], 'files': files}
p = os.path.join(root, 'sw.js')
s = open(p, encoding='utf-8').read()
s, n = re.subn(r'/\*MANIFEST\*/.*?/\*END\*/', lambda m: '/*MANIFEST*/' + json.dumps(manifest, separators=(',', ':')) + '/*END*/', s, flags=re.S)
assert n == 1, 'marker missing in sw.js'
open(p, 'w', encoding='utf-8').write(s)
print(f"sw.js: {len(files)} files, version {manifest['version']}")
