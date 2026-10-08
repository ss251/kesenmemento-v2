#!/usr/bin/env bash
# Smoke test of a REAL contributor server over HTTP, with curl.
#
#   tools/contrib/smoke.sh                       start a throwaway server on 127.0.0.1:8981 (temp dirs, random secrets),
#                                                run the whole flow, stop it and remove everything
#   PORT=8982 tools/contrib/smoke.sh             another port
#   ADMIN_TOKEN=... tools/contrib/smoke.sh --api https://host
#                                                run the flow against a server that is already running (a rehearsal of a
#                                                deployment): it creates one throwaway contributor and erases it at the end
#
# The flow: health, CORS, create a contributor, submit a report with a synthetic screenshot and photo (GPS EXIF),
# check what the contributor sees, the admin queue and the stored files, accept with points, the leaderboard, the
# crew CSV (BOM, header, Excel-safe number), mark it used with a release, the account-transfer code, a few refusals
# (bad token, HTML disguised as a photo, missing consent, foreign origin), and finally erase the test contributor.
# Secrets are never printed and never put in process arguments (curl reads headers from files in the temp dir).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${PORT:-8981}"
API_ARG=""
if [ "${1:-}" = "--api" ]; then API_ARG="${2:?--api needs a URL}"; fi
BUN() { env -u NODE_OPTIONS bun "$@"; }

TMP="$(mktemp -d "${TMPDIR:-/tmp}/klc-contrib-smoke.XXXXXX")"
PID=""
cleanup() {
  if [ -n "$PID" ]; then kill "$PID" 2>/dev/null || true; wait "$PID" 2>/dev/null || true; fi
  rm -rf "$TMP"
}
trap cleanup EXIT

if [ -z "$API_ARG" ]; then
  BASE="http://127.0.0.1:$PORT"
  ADMIN_TOKEN="$(openssl rand -base64 48 | tr -d '=+/\n' | cut -c1-40)"
  TOKEN_SECRET="$(openssl rand -base64 48 | tr -d '=+/\n' | cut -c1-40)"
  # exec: the background process IS the server (not a subshell around it), so the cleanup trap really stops it
  ( cd "$ROOT" && exec env -u NODE_OPTIONS PORT="$PORT" ADMIN_TOKEN="$ADMIN_TOKEN" TOKEN_SECRET="$TOKEN_SECRET" DB_PATH="$TMP/data/contrib.db" DISK_DIR="$TMP/data/files" \
      ALLOWED_ORIGINS="http://127.0.0.1:8787,http://localhost:8787" bun server/contrib/index.js > "$TMP/server.log" 2>&1 ) &
  PID=$!
  echo "started a throwaway server (pid $PID) on $BASE, data in a temp dir"
else
  BASE="${API_ARG%/}"
  : "${ADMIN_TOKEN:?set ADMIN_TOKEN for --api mode}"
fi
V="$BASE/api/contrib/v1"
ORIGIN="http://localhost:8787"
printf 'Authorization: Bearer %s\n' "$ADMIN_TOKEN" > "$TMP/admin.hdr"

n=0
ok()   { n=$((n+1)); printf '  [ok] %s\n' "$1"; }
fail() { printf '  [FAIL] %s\n' "$1" >&2; [ -f "$TMP/server.log" ] && { echo "--- server log (last 20 lines) ---" >&2; tail -20 "$TMP/server.log" >&2; }; exit 1; }
expect() { [ "$2" = "$3" ] && ok "$1 ($2)" || fail "$1: expected $3, got $2"; }
# jget '<js expression on j>' < json
jget() { BUN -e "const j = JSON.parse(await Bun.stdin.text()); const v = ($1); console.log(typeof v === 'object' ? JSON.stringify(v) : v)"; }
status() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

echo "== waiting for the server"
for i in $(seq 1 60); do curl -sf "$V/health" > "$TMP/health.json" 2>/dev/null && break; sleep 0.25; done
[ -s "$TMP/health.json" ] || fail "the server did not come up"
ok "health: $(jget 'j.service + " " + j.version + ", storage " + j.storage + ", ok=" + j.ok' < "$TMP/health.json")"

echo "== CORS"
expect "preflight from the app origin" "$(status -X OPTIONS "$V/submissions" -H "Origin: $ORIGIN" -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: authorization,content-type')" 204
acao="$(curl -s -D - -o /dev/null "$V/leaderboard" -H "Origin: $ORIGIN" | tr -d '\r' | awk -F': ' 'tolower($1)=="access-control-allow-origin"{print $2}')"
expect "allowed origin is echoed back" "$acao" "$ORIGIN"
expect "an unlisted origin is refused" "$(status "$V/leaderboard" -H 'Origin: https://evil.example')" 403

echo "== synthetic files (no real photos)"
BUN "$ROOT/tools/contrib/synth.mjs" photo "$TMP/photo.jpg" 38.9065 141.5752
BUN "$ROOT/tools/contrib/synth.mjs" screenshot "$TMP/shot.png"
printf '%s' '<html><script>alert(1)</script></html>' > "$TMP/evil.jpg"
ok "photo.jpg $(wc -c < "$TMP/photo.jpg" | tr -d ' ') bytes, shot.png $(wc -c < "$TMP/shot.png" | tr -d ' ') bytes"

echo "== a contributor"
curl -s -X POST "$V/contributors" -H 'Content-Type: application/json' -d '{"nickname":"スモークテスト","crewNo":"1234-5678-9012-34"}' > "$TMP/created.json"
CID="$(jget 'j.contributorId' < "$TMP/created.json")"
printf 'Authorization: Bearer %s\n' "$(jget 'j.token' < "$TMP/created.json")" > "$TMP/user.hdr"
ok "created contributor $CID, nickname $(jget 'j.nickname' < "$TMP/created.json") (token not shown)"
expect "GET /me with the token" "$(status "$V/me" -H @"$TMP/user.hdr")" 200
expect "GET /me with no token" "$(status "$V/me")" 401
curl -s "$V/me" -H @"$TMP/user.hdr" | jget '"crewNo=" + j.crewNo + " points=" + j.points + " rank=" + j.rank + " submissions=" + j.submissions.length' > "$TMP/line"; ok "profile: $(cat "$TMP/line")"

echo "== refusals"
expect "HTML disguised as a photo is refused" "$(status -X POST "$V/submissions" -H @"$TMP/user.hdr" -F consent=1 -F note=x -F "photos=@$TMP/evil.jpg;type=image/jpeg")" 415
expect "a report without consent is refused" "$(status -X POST "$V/submissions" -H @"$TMP/user.hdr" -F note=x -F "screenshot=@$TMP/shot.png")" 400
expect "a report with no token is refused" "$(status -X POST "$V/submissions" -F consent=1 -F note=x)" 401
# a big upload that is refused before it is read must not poison the connection: curl reuses it for the next URL
head -c 3000000 /dev/urandom > "$TMP/big.bin"
printf 'Authorization: Bearer nobody.made-up-for-the-test\n' > "$TMP/nobody.hdr" # gitleaks:allow (a made-up value, not a secret)
codes="$(curl -s -o /dev/null -w '%{http_code} ' -X POST "$V/submissions" -H @"$TMP/nobody.hdr" -F consent=1 -F "photos=@$TMP/big.bin;type=image/jpeg" --next -s -o /dev/null -w '%{http_code}' "$V/health")"
expect "a big upload refused before it is read leaves the connection usable" "$codes" "401 200"
rm -f "$TMP/big.bin" "$TMP/nobody.hdr"

echo "== the report"
POSE='{"enu":[12,1.6,-34],"latlon":[38.9063,141.5751],"heading":120,"pitch":-3,"fov":60,"mode":"walk","at":"2026-10-05T03:00:00.000Z","appVersion":"smoke","layoutVersion":"v6","timePreset":"noon","season":"autumn","viewport":{"w":390,"h":844}}'
IDEM_VALUE="smoke-test-0001-abcdef" # gitleaks:allow (a made-up request id, not a secret)
curl -s -X POST "$V/submissions" -H @"$TMP/user.hdr" -H "Idempotency-Key: $IDEM_VALUE" \
  -F "pose=$POSE" -F category=sign -F "note=看板の文字が違います (smoke test)" -F lang=ja -F consent=1 \
  -F "screenshot=@$TMP/shot.png;type=image/png" -F "photos=@$TMP/photo.jpg;type=image/jpeg" > "$TMP/sub.json"
SID="$(jget 'j.id' < "$TMP/sub.json")"
ok "submitted $SID: status $(jget 'j.status' < "$TMP/sub.json"), kind $(jget 'j.kind' < "$TMP/sub.json") (inferred from the photo), $(jget 'j.photos' < "$TMP/sub.json") photo"
curl -s -X POST "$V/submissions" -H @"$TMP/user.hdr" -H "Idempotency-Key: $IDEM_VALUE" -F consent=1 -F note=retry > "$TMP/replay.json"
expect "a retry with the same Idempotency-Key returns the same id" "$(jget 'j.id' < "$TMP/replay.json")" "$SID"
curl -s "$V/me" -H @"$TMP/user.hdr" | jget 'j.submissions.map(s => s.status + "/" + s.kind + "/" + s.points + "pt")' > "$TMP/line"; ok "contributor sees: $(cat "$TMP/line")"

echo "== the admin queue"
expect "admin API without the token" "$(status "$V/admin/submissions")" 401
curl -s "$V/admin/submissions?status=new" -H @"$TMP/admin.hdr" > "$TMP/list.json"
ok "queue: $(jget 'j.total + " new, first is a " + j.items[0].kind + " (" + j.items[0].category + ") by " + j.items[0].contributor.nickname + ", " + j.items[0].photoCount + " photo, location from " + j.items[0].location.source' < "$TMP/list.json")"
curl -s "$V/admin/submissions/$SID" -H @"$TMP/admin.hdr" > "$TMP/detail.json"
ok "detail: photo GPS $(jget 'j.photos[0].lat.toFixed(6) + "," + j.photos[0].lon.toFixed(6) + " ENU x=" + j.photos[0].enu.x.toFixed(1) + " z=" + j.photos[0].enu.z.toFixed(1) + ", taken " + j.photos[0].takenAt' < "$TMP/detail.json"), crew number $(jget 'j.contributor.crewNoMasked' < "$TMP/detail.json")"
PREVIEW="$(jget 'j.photos[0].previewUrl' < "$TMP/detail.json")"; SHOTURL="$(jget 'j.screenshot.url' < "$TMP/detail.json")"; ORIGINAL="$(jget 'j.photos[0].url' < "$TMP/detail.json")"
curl -s "$BASE$PREVIEW" -H @"$TMP/admin.hdr" -o "$TMP/preview.jpg"; expect "preview is a JPEG" "$(head -c 3 "$TMP/preview.jpg" | od -An -tx1 | tr -d ' \n')" ffd8ff
curl -s "$BASE$ORIGINAL" -H @"$TMP/admin.hdr" -o "$TMP/original.jpg"; expect "the stored original is byte for byte the upload" "$(cmp -s "$TMP/original.jpg" "$TMP/photo.jpg" && echo same || echo different)" same
curl -s "$BASE$SHOTURL" -H @"$TMP/admin.hdr" -o "$TMP/shot-back.png"; expect "the screenshot is a PNG" "$(head -c 4 "$TMP/shot-back.png" | od -An -tx1 | tr -d ' \n')" 89504e47
expect "a file without the admin token" "$(status "$BASE$PREVIEW")" 401
expect "path traversal out of the files route" "$(status "$V/admin/files/..%2f..%2f..%2fetc%2fpasswd" -H @"$TMP/admin.hdr")" 404

echo "== accept with points"
curl -s -X POST "$V/admin/submissions/$SID" -H @"$TMP/admin.hdr" -H 'Content-Type: application/json' -H 'X-Admin-Name: smoke' -d '{"status":"accepted","points":25,"reviewerNote":"smoke test"}' > "$TMP/reviewed.json"
ok "reviewed: status $(jget 'j.status' < "$TMP/reviewed.json"), points $(jget 'j.points' < "$TMP/reviewed.json"), reviewed_at set: $(jget '!!j.reviewedAt' < "$TMP/reviewed.json")"
curl -s "$V/me" -H @"$TMP/user.hdr" | jget '"points=" + j.points + " accepted=" + j.accepted + " rank=" + j.rank' > "$TMP/line"; ok "contributor now has $(cat "$TMP/line")"

echo "== leaderboard"
curl -s "$V/leaderboard?limit=5" > "$TMP/lb.json"
ok "leaderboard: $(cat "$TMP/lb.json")"
expect "it lists nickname, accepted and points only" "$(jget 'Object.keys(j[0]).sort().join(",")' < "$TMP/lb.json")" "accepted,nickname,points"
expect "and never a crew number" "$(grep -c '1234' "$TMP/lb.json" || true)" 0

echo "== crew CSV (opens in Excel)"
curl -s "$V/admin/export/crew.csv" -H @"$TMP/admin.hdr" -D "$TMP/csv.hdr" -o "$TMP/crew.csv"
expect "starts with the UTF-8 byte-order mark" "$(head -c 3 "$TMP/crew.csv" | od -An -tx1 | tr -d ' \n')" efbbbf
expect "content type" "$(tr -d '\r' < "$TMP/csv.hdr" | awk -F': ' 'tolower($1)=="content-type"{print $2}')" "text/csv; charset=utf-8"
ok "csv (BOM shown as <BOM>, CR as ^M): $(sed -e 's/^\xEF\xBB\xBF/<BOM>/' -e 's/\r$/^M/' "$TMP/crew.csv" | paste -sd'|' -)"
expect "crew_no is Excel-safe text" "$(grep -c '="12345678901234"' "$TMP/crew.csv")" 1
curl -s "$V/admin/export/crew.csv?excel=0&from=2020-01-01&to=2099-12-31" -H @"$TMP/admin.hdr" | sed 's/^\xEF\xBB\xBF//' | tr -d '\r' | tail -n +2 > "$TMP/plain.txt"
ok "plain digits for scripts: $(cat "$TMP/plain.txt")"
expect "a bad date range is refused" "$(status "$V/admin/export/crew.csv?from=nonsense" -H @"$TMP/admin.hdr")" 400

echo "== shipped in a release"
curl -s -X POST "$V/admin/submissions/mark-used" -H @"$TMP/admin.hdr" -H 'Content-Type: application/json' -d "{\"ids\":[\"$SID\"],\"version\":\"v0.0.1-smoke\"}" > "$TMP/used.json"
ok "mark-used: $(cat "$TMP/used.json")"
curl -s "$V/me" -H @"$TMP/user.hdr" | jget 'j.submissions[0].status + " in " + j.submissions[0].usedVersion' > "$TMP/line"; ok "contributor sees 「反映済み」: $(cat "$TMP/line")"

echo "== account transfer"
CODE="$(curl -s "$V/me/transfer-code" -H @"$TMP/user.hdr" | jget 'j.code')"
ok "transfer code $CODE (valid 15 minutes)"
curl -s -X POST "$V/contributors/claim" -H 'Content-Type: application/json' -d "{\"code\":\"$CODE\"}" > "$TMP/claimed.json"
expect "claim returns the same contributor" "$(jget 'j.contributorId' < "$TMP/claimed.json")" "$CID"
printf 'Authorization: Bearer %s\n' "$(jget 'j.token' < "$TMP/claimed.json")" > "$TMP/user2.hdr"
expect "the new device is signed in" "$(status "$V/me" -H @"$TMP/user2.hdr")" 200
expect "the first device still works" "$(status "$V/me" -H @"$TMP/user.hdr")" 200
expect "the code cannot be used twice" "$(status -X POST "$V/contributors/claim" -H 'Content-Type: application/json' -d "{\"code\":\"$CODE\"}")" 404

echo "== audit and stats"
curl -s "$V/admin/audit?limit=5" -H @"$TMP/admin.hdr" | jget 'j.items.map(a => a.actor + " " + a.action).join(" | ")' > "$TMP/line"; ok "activity log: $(cat "$TMP/line")"
curl -s "$V/admin/stats" -H @"$TMP/admin.hdr" | jget 'JSON.stringify(j.byStatus)' > "$TMP/line"; ok "stats by status: $(cat "$TMP/line")"
expect "the admin page loads" "$(status "$BASE/admin")" 200

echo "== erase the test contributor (deletion on request)"
expect "DELETE /me needs confirm" "$(status -X DELETE "$V/me" -H @"$TMP/user.hdr")" 400
curl -s -X DELETE "$V/me?confirm=1" -H @"$TMP/user.hdr" > "$TMP/deleted.json"; ok "erased: $(cat "$TMP/deleted.json")"
expect "the token no longer works" "$(status "$V/me" -H @"$TMP/user.hdr")" 401
expect "and the leaderboard is empty of test data" "$(curl -s "$V/leaderboard" | grep -c スモーク || true)" 0

echo
echo "smoke test passed: $n checks"
if [ -f "$TMP/server.log" ]; then
  echo "== what the server logged (JSON lines; no tokens, names, notes, crew numbers or addresses)"
  tail -4 "$TMP/server.log"
  for needle in "スモーク" "1234-5678" "12345678901234" "看板" "127.0.0.1:" "38.9065"; do
    if grep -q -- "$needle" "$TMP/server.log"; then echo "LOG LEAK: found $needle in the server log" >&2; exit 1; fi
  done
  ok "the log holds none of the nickname, note, crew number, address or coordinates"
fi
