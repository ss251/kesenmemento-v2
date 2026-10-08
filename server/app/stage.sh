#!/bin/bash
# Stages the Railway bundle for <commit> from a build of the app, then precompresses it (README.md has the whole recipe).
#   server/app/stage.sh <commit> <dist dir> <bundle dir>
# <bundle dir> starts as a copy of the live bundle (raw/railway): its package.json, bun.lock and node_modules stay as they are.
set -euo pipefail
[ $# -eq 3 ] || { echo "usage: server/app/stage.sh <commit> <dist dir> <bundle dir>" >&2; exit 2; }
C=$1; DIST=$(cd "$2" && pwd); OUT=$3
REPO=$(cd "$(dirname "$0")/../.." && pwd)
mkdir -p "$OUT/public"
# the built app, without source maps, dot dirs (a headless Chrome profile in dist/ once broke an upload), the private
# per-port builds of the test tools (anime-<port>), the screenshots of the JPYC e2e (jpyc-shots*: JPYC_SHOTS=dist/jpyc-shots would otherwise ship them) or the old v2 dev fixtures (photos, the scale-model splat: nothing loads them)
# --checksum: a rebuilt index.html can have the same size and, when the bundle copy is made in the same second as the build,
# the same mtime as the stale one, and rsync's size+mtime quick check then keeps the stale file (2026-10-05: a 404 on the main chunk)
rsync -a --checksum --delete --delete-excluded --exclude '.*' --exclude '*.map' --exclude 'anime-*' --exclude 'jpyc-shots*' --exclude 'fixtures/' --exclude 'qa3/' --exclude '*-shots/' "$DIST"/ "$OUT/public/"
cmp -s "$DIST/index.html" "$OUT/public/index.html" || { echo "stage: public/index.html differs from the build" >&2; exit 1; }
for c in $(grep -o 'chunk-[a-z0-9]*\.\(js\|css\)' "$OUT/public/index.html" | sort -u); do
  [ -f "$OUT/public/$c" ] || { echo "stage: index.html names $c, which is not in the bundle" >&2; exit 1; }
done
rm -rf "$OUT/data"
# Paths the commit may not have yet (a feature merged later) are skipped, so one recipe stages any commit.
present() { local out=""; for f in "$@"; do git -C "$REPO" cat-file -e "$C:$f" 2>/dev/null && out="$out $f"; done; echo $out; }
git -C "$REPO" archive "$C" data/anime data/live data/landmarks.json data/i18n.json data/tour.json data/buildings/coast.json data/ship \
  data/ui-touch-i18n.json data/ui-contrib-i18n.json data/ui-jpyc-i18n.json data/shops $(present data/play data/hoyaboya-approval.json) | tar -x -C "$OUT"   # (data/shops/ holds jpyc.json, the /api/jpyc allowlist that server.js reads at start; data/play/ holds the hub's card stills; hoyaboya-approval.json is the record the walker reads before it shows ホヤぼーや in 3D)
rm -rf "$OUT/src" "$OUT/scripts"   # the /api/live modules
git -C "$REPO" archive "$C" src/server/live.js src/core/geo.js src/web/lib/solar.js scripts/live.js scripts/live/fixtures \
  scripts/live/{arrivals,tide,snapshot,sky,jma,http}.js $(present src/server/ais.js src/anime/world/life/ais.js) | tar -x -C "$OUT"
# [play:missions] the voucher check is a dynamic import from server.js. The file has no dependencies, so the bundle stays small.
v=$(present src/anime/play/missions/voucher.js); if [ -n "$v" ]; then git -C "$REPO" archive "$C" $v | tar -x -C "$OUT"; fi   # (an empty path list would archive the whole repo)
git -C "$REPO" show "$C:server/app/server.js" > "$OUT/server.js"
git -C "$REPO" show "$C:server/app/static.js" > "$OUT/static.js"
git -C "$REPO" show "$C:server/app/jpyc.js" > "$OUT/jpyc.js"
# Every module the server imports must be in the bundle: a missing one crashed the staged server on 2026-10-07 (src/server/ais.js).
(cd "$OUT" && env -u NODE_OPTIONS bun -e "await import('./scripts/live.js'); await import('./src/server/live.js'); await import('./jpyc.js'); await import('./static.js');") \
  || { echo "stage: a server module does not resolve inside the bundle (see above)" >&2; exit 1; }
env -u NODE_OPTIONS bun "$REPO/server/app/precompress.mjs" "$OUT/public" "$OUT/data"
echo "staged $C into $OUT: public $(du -sh "$OUT/public" | cut -f1), data $(du -sh "$OUT/data" | cut -f1)"
