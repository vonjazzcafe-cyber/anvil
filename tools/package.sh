#!/usr/bin/env bash
# Packs the static site (plus the C# sources, so the repository can rebuild itself) into anvil-site.zip.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/../dist}"
mkdir -p "$OUT"
STAGE="$(mktemp -d)"
cd "$ROOT"
cp -r index.html sw.js README.md editor vendor engine "$STAGE/"
mkdir -p "$STAGE/src" "$STAGE/tools"
for d in Engine Host; do
  mkdir -p "$STAGE/src/$d"
  cp src/$d/*.cs src/$d/*.csproj "$STAGE/src/$d/"
done
cp tools/build.sh tools/package.sh tools/sw-manifest.py tools/package.json "$STAGE/tools/"
cp -r tools/entries "$STAGE/tools/"
cp nuget.config "$STAGE/"
python3 "$STAGE/tools/sw-manifest.py" "$STAGE"
rm -f "$OUT/anvil-site.zip"
(cd "$STAGE" && zip -qr -9 "$OUT/anvil-site.zip" .)
echo "files: $(cd "$STAGE" && find . -type f | wc -l)"
rm -rf "$STAGE"
ls -la "$OUT/anvil-site.zip"
