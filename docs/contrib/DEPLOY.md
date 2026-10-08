# Deploying the contributor backend

> **Nothing here has been deployed.** This is the runbook for the Railway service `kesennuma-contrib`; do not deploy until the checklist at the end is done. The configuration below was verified locally (`bun server/contrib/index.js --check`, the test suite, and `tools/contrib/smoke.sh`); it has **not** been exercised on Railway itself.

## Shape

One service, **one replica**, one volume.

```
 browser (the app, https://kesennuma-living-city-production.up.railway.app)
        │  https, CORS allow-list
        ▼
 Railway service "kesennuma-contrib"   https://kesennuma-contrib-production.up.railway.app   (set CONTRIB_API to this origin only after the service exists)
   bun server/contrib/index.js         health check: /api/contrib/v1/health
        │
        ├── volume mounted at /data :  /data/contrib.db  (SQLite, WAL)     /data/files/...  (private photos)   ← default
        └── or an S3 / R2 bucket for the files (database stays on the volume)
```

Run exactly one instance: the database is SQLite and the rate limiters are in memory. Restarts are fine (counters reset; the per-contributor daily limit is counted from the database).

## 1. Create the service

Creating the service is what claims its `*.up.railway.app` hostname. Do that before you publish the address: until the service exists, the name is free for anyone else to take. The app does not point at it until the checklist below sets `CONTRIB_API`.

Settings (dashboard, or the same keys in a `railway.json` kept outside the repo until you decide to commit one):

| Setting | Value |
| --- | --- |
| Source | this repository, root directory `/` (the service imports only `server/contrib/**`; the root `package.json` supplies `sharp` and `exifr`) |
| Install | `bun install --frozen-lockfile` (the default for a Bun project) |
| Build command | none (no build step) |
| Start command | `bun server/contrib/index.js` |
| Health check path | `/api/contrib/v1/health` (timeout 30 s) |
| Replicas | 1 |
| Memory | at least 1 GB. Request bodies are held in memory from their first byte until the submission is stored (about twice over while it is parsed). A byte budget (`UPLOAD_BUFFER_MB`, 256) bounds that however many uploads arrive: each reserves its declared size, one that does not fit waits briefly and then gets `503 server_busy`. At most `MAX_CONCURRENT_UPLOADS` (3) are decoded at once. Typical uploads are a few MB, so many fit. With less memory, lower `UPLOAD_BUFFER_MB`, `MAX_PHOTO_MB` and `MAX_CONCURRENT_UPLOADS`. Measured on a Mac (not on Linux): 30 simultaneous uploads of 9.4 MB each (six 3000 x 2000 photos and a screenshot), `UPLOAD_BUFFER_MB=64`, `MAX_CONCURRENT_UPLOADS=3`, all stored; the server's physical footprint went from 40 MB idle to 250-320 MB and did not grow over three rounds (the resident size shown by `ps` is about three times larger there because the allocator keeps freed pages). On Linux the system allocator can also keep freed memory; if the resident size creeps up on a small instance, set `MALLOC_ARENA_MAX=2`. A sustained slow-upload or flood attack is best stopped at the edge (the platform's proxy or a CDN in front); the service's own limits (speed floor, per-IP and per-contributor concurrency, budgets) bound the damage, not the traffic. |

Runtime: Bun 1.2 or newer (the service uses `Bun.S3Client`, `bun:sqlite` and `Bun.serve`'s `requestIP` / `timeout`); it was developed and tested on Bun 1.3.14.

The root install also pulls the app's own dependencies (three.js and friends, a few hundred MB). A lean image is possible with a Dockerfile in the service settings:

```dockerfile
FROM oven/bun:1
WORKDIR /app
RUN echo '{"type":"module","dependencies":{"sharp":"^0.35.5","exifr":"^7.1.3"}}' > package.json && bun install
COPY server/contrib ./server/contrib
CMD ["bun", "server/contrib/index.js"]
```

(sharp ships prebuilt binaries for Linux glibc and musl; the contributor service never imports `src/` or `scripts/`.)

## 2. Volume

Add a volume to the service mounted at **`/data`**, then set `DB_PATH=/data/contrib.db` and `DISK_DIR=/data/files`. Without a volume everything is lost on each deploy. The service creates the directories itself (mode 0700).

## 3. Variables

Required: `ADMIN_TOKEN`, `TOKEN_SECRET`. Everything else has a default. The service **refuses to start** on a bad value and says which variable (never its value); `bun server/contrib/index.js --check` prints the effective configuration with secrets shown as `set`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `ADMIN_TOKEN` | **required** | Bearer token for the admin page and API. At least 24 characters, no whitespace. |
| `TOKEN_SECRET` | **required** | Key for hashing contributor secrets and transfer codes (at least 16 characters, different from `ADMIN_TOKEN`). **Do not rotate it casually**: every contributor token and open transfer code stops working. |
| `PORT` | `8788` | Listen port (Railway sets it). |
| `HOST` | `127.0.0.1`, `0.0.0.0` on Railway | Listen address (Railway is detected from `RAILWAY_ENVIRONMENT`). |
| `DB_PATH` | `./.contrib/contrib.db` | SQLite file. Set `/data/contrib.db`. |
| `STORAGE` | `disk` | `disk` or `s3`. |
| `DISK_DIR` | `./.contrib/files` | Where files go for `disk`. Set `/data/files`. |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT` | | For `STORAGE=s3`. `S3_ENDPOINT` is optional (R2, MinIO); with it `S3_REGION` defaults to `auto`. |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | | S3 credentials (`S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` also work). |
| `ALLOWED_ORIGINS` | the production app, `http://127.0.0.1:8787`, `http://localhost:8787` | Comma list of browser origins (`https://host[:port]`, no path, no wildcard). **Setting it replaces the default list**: include the production app origin. |
| `APP_URL` | the production app | Where the admin page's "open the same view in the app" links go (`?cam=` is appended). |
| `MAX_PHOTOS` | `6` | Photos per submission. |
| `MAX_PHOTO_MB` | `15` | Per photo. |
| `MAX_SHOT_MB` | `8` | Screenshot. |
| `DAILY_LIMIT` | `20` | Submissions per contributor per rolling day. |
| `IP_DAILY_LIMIT` | `3 x DAILY_LIMIT` (60) | Submissions per client IP per day. |
| `DAILY_MB` | `1024` | Upload volume (request bytes of stored submissions) per contributor per rolling day. Padded images are valid files, so a count limit alone would let one contributor fill the volume. |
| `IP_DAILY_MB` | `3 x DAILY_MB` (3072) | The same per client IP. Raise it for an event on one shared network. |
| `MIN_FREE_MB` | `512` | Uploads answer `503 storage_full` when the data volume (`DISK_DIR`, or the database directory with S3) has less free space than this, so the database and moderation keep working. `0` turns the check off. |
| `UPLOAD_BUFFER_MB` | `256` | Memory budget for request bodies being received, queued or processed (each upload reserves its declared size; never below the largest single request). Peak memory is roughly twice this plus image decoding. |
| `UPLOAD_MIN_KBPS` | `16` | After `UPLOAD_GRACE_S` an upload must average at least this speed (KB/s) or it is cut off (`408 upload_too_slow`). `0` turns the rule off. |
| `UPLOAD_GRACE_S` | `20` | How long an upload may be slow before the minimum speed applies. |
| `UPLOAD_TIMEOUT_S` | `600` | The longest a whole upload may take to arrive (`408 upload_timeout`). |
| `MAX_UPLOADS_PER_IP` | `3` | Uploads one network may have in flight at once (each contributor has at most one). |
| `MAX_IMAGE_MP` | `64` | Largest image, in megapixels, the server decodes (a decompression-bomb guard; a phone photo is at most about 50). |
| `POINTS_ISSUE`, `POINTS_FIX` | `5`, `20` | Default points when accepting (the admin can edit them per item). |
| `TRUST_PROXY` | `1` on Railway, else `0` | How many reverse-proxy hops to trust for the client address (the n-th `X-Forwarded-For` entry from the right). Behind a CDN in front of Railway use `2`. **If it is wrong, every visitor shares one IP and one visitor can exhaust the limits for everyone**; also enables the HSTS header when the proxy reports https. |
| `MAX_CONCURRENT_UPLOADS` | `3` | Uploads processed at once (the rest wait in a bounded queue, then get `503`). |
| `RATE_LIMIT_PER_MIN` | `240` | API requests per IP per minute. |
| `CREATE_LIMIT_PER_HOUR` | `30` | New contributors per IP per hour (raise it for an event on shared Wi-Fi). |
| `CLAIM_LIMIT_PER_HOUR` | `5` | Transfer-code claim attempts per IP per hour. |
| `SUBMIT_ATTEMPTS_PER_HOUR` | `60` | Upload attempts per IP per hour (failed ones count). |
| `ADMIN_FAIL_LIMIT` | `10` | Wrong admin tokens per IP per 15 minutes before it is locked out. |
| `TRANSFER_CODES_PER_HOUR` | `10` | Codes one contributor may mint per hour. |

Generate secrets with a shell, never paste them anywhere public:

```sh
openssl rand -base64 48 | tr -d '=+/\n' | cut -c1-40   # ADMIN_TOKEN
openssl rand -base64 48 | tr -d '=+/\n' | cut -c1-40   # TOKEN_SECRET (a different value)
```

## 4. Verify

The hostname below is the one this service should own. It answers only after the service exists. Do not announce it, and do not put it in the app, before the health check succeeds.

```sh
BASE=https://kesennuma-contrib-production.up.railway.app
curl -s $BASE/api/contrib/v1/health                      # {"ok":true,"service":"kesennuma-contrib",...,"storage":"disk"}
curl -si $BASE/api/contrib/v1/leaderboard -H 'Origin: https://kesennuma-living-city-production.up.railway.app' | head   # access-control-allow-origin echoes the app
curl -si $BASE/api/contrib/v1/leaderboard -H 'Origin: https://evil.example' | head -1                                  # 403
curl -s -o /dev/null -w '%{http_code}\n' $BASE/api/contrib/v1/admin/stats                                                # 401
```

Then open `$BASE/admin`, sign in, and run `tools/contrib/smoke.sh` against it (it creates a throwaway contributor and one synthetic submission; delete them afterwards from the admin page).

## 5. Switching the files to S3 (or R2)

The database always stays on the volume. To move the photos to a bucket:

1. Create a **private** bucket (Block Public Access on; no public ACLs, no public policy). Photos are never served from the bucket: the service streams them to the admin through `/admin/files/...`.
2. Create credentials limited to that bucket (`s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on `arn:aws:s3:::BUCKET/*` and `s3:ListBucket` on `arn:aws:s3:::BUCKET`). For R2 create an API token with Object Read & Write on the bucket and use its S3 endpoint.
3. Copy the existing files, keeping the keys as they are: `aws s3 sync /data/files s3://BUCKET/` (or `rclone sync`). The keys look like `submissions/2026/10/<id>/photo-1.jpg`.
4. Set `STORAGE=s3`, `S3_BUCKET`, `S3_REGION` (and `S3_ENDPOINT` for R2/MinIO), `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`; redeploy.
5. Check `/api/contrib/v1/health` says `"storage":"s3"`, open a submission in the admin page and confirm the screenshot and photos load, then submit a test report. Keep the volume copy until you have verified.

Enable server-side encryption on the bucket (default on AWS and R2). Objects are written without an ACL.

## 6. Backups and restore

The volume holds everything (database and files). Use Railway's volume backups, and also take a consistent copy of the database before risky changes:

```sh
# on the service (railway ssh / run): an online, consistent snapshot
bun -e 'import { Database } from "bun:sqlite"; new Database("/data/contrib.db").run("VACUUM INTO ?", ["/data/backups/contrib-" + new Date().toISOString().slice(0, 10) + ".db"])'
```

Make `/data/backups` first. To restore, stop the service, replace `/data/contrib.db` with the snapshot (remove any `contrib.db-wal` and `contrib.db-shm` next to it), start it. Photos are in `/data/files` (or the bucket); they are not part of the database snapshot. A database written by a **newer** version of the service is refused at start (a rollback never runs old code against a new schema); migrations run forward automatically.

## 7. Operating it

- **Admin access.** Share the admin token only with the team. To rotate it, change `ADMIN_TOKEN` and redeploy (open admin tabs sign out on their next call). Ten wrong tokens from one network lock that network out for 15 minutes.
- **Deletion on request** (PRIVACY.md promises it): the contributor can `DELETE /me?confirm=1` from the app, or the team opens a submission in the admin page and uses "Delete all of this contributor's data". Both remove the rows and the files and write an audit entry without personal data. The file keys are queued in the database in the same transaction as the erasure, so if the store is down the files are retried (every 10 minutes) instead of being forgotten; `/admin/stats` shows `pendingDeletes`. Local copies pulled with `tools/contrib/pull.mjs` are not touched: run it with `--prune` afterwards. Work already used to correct the model cannot be removed from the model.
- **Bad actors.** Ban a contributor from a submission's detail (they cannot submit and leave the leaderboard and the CSV); reset an offensive nickname; delete spam. All of it is in the activity log.
- **Logs.** One JSON line per request on stdout: time, request id, method, route template, status, milliseconds. No addresses, tokens, nicknames, notes, crew numbers, EXIF or user agents are ever written (the logger drops every field it does not whitelist). Railway's own edge logs are outside this service: check their retention for IP addresses in your privacy notice.
- **Monitoring.** `/api/contrib/v1/health` returns 503 when the database is unreadable; alert on 5xx counts and on the `request.crashed`, `storage.delete_failed` and `unhandled.rejection` events (a stray rejection in a background task is logged by class name and the service carries on rather than ending every upload in flight; an uncaught exception still ends the process and the platform restarts it).
- **Sizing.** The database is small (text only). Files dominate: a typical submission is a few MB; plan the volume or bucket for your expected volume (for example 1,000 submissions x 15 MB is 15 GB at the extreme).
- **Orphaned files.** A failed upload removes its own files (and queues them durably first). A process that is killed rather than stopped, in the few milliseconds between writing a submission's files and committing its rows, leaves a folder under `submissions/` that no row refers to. It is private and harmless apart from the space; the folder name is the submission id, so if the volume ever looks too full, list the ids in the database and remove the folders that are not among them. Nothing does this automatically.
- **Rotating `TOKEN_SECRET`** would sign everyone out of their anonymous account (their tokens would no longer verify) and invalidate open transfer codes. Only do it after a suspected leak, and expect contributors to start fresh.

## 8. Before you go live

- [ ] `ADMIN_TOKEN` and `TOKEN_SECRET` set (different, random), `bun server/contrib/index.js --check` is clean.
- [ ] Volume mounted at `/data`; `DB_PATH=/data/contrib.db`, `DISK_DIR=/data/files` (or S3 verified).
- [ ] `ALLOWED_ORIGINS` lists every origin the app is served from (the default already has the production app); `APP_URL` is right.
- [ ] `TRUST_PROXY` matches the number of proxies in front of the service.
- [ ] The privacy text ([PRIVACY.md](PRIVACY.md)) has its contact address filled in and has been reviewed by the team (and the DMO, because it describes handing クルーNo. to 気仙沼地域戦略).
- [ ] `GET /api/contrib/v1/health` on the deployed origin returns ok. Then set `CONTRIB_API` in `src/anime/ui/contrib-lib.js` to that origin. Leave it `''` until the health check passes: an empty value means the app sends nothing. Create this Railway service before you announce the hostname, so the name is claimed. The consent link in the sheet shows the same text version (`PRIVACY_VERSION` in `server/contrib/config.js`; every submission records the version it was made under).
- [ ] The smoke test passes against the deployed URL and its test data is deleted.
- [ ] A backup was taken after the first real submission, and someone knows the restore steps.
- [ ] The team has opened `/admin` on a phone and on a laptop and decided who triages and how often the weekly sweep (`tools/contrib/pull.mjs`, `SWEEP.md`, `mark-used.mjs`) runs.

## 9. Troubleshooting

| Symptom | Likely cause and fix |
| --- | --- |
| The service exits at start with `invalid contributor-service configuration` | The message names the variable (never its value). Fix it; `bun server/contrib/index.js --check` re-validates. |
| `/api/contrib/v1/health` is 503, or the service restarts in a loop | The database cannot be opened: the volume is not mounted at `/data`, `DB_PATH` points outside it, or the file belongs to a newer service version ("refusing to start"). |
| The app gets `403 origin_not_allowed` | Its origin is not in `ALLOWED_ORIGINS` (setting the variable **replaces** the default list; include the production app origin and any preview/dev origin). |
| The admin page loads but every action says `403 origin_not_allowed` | A proxy rewrote the `Host` header, so the page's own origin looks foreign. With `TRUST_PROXY` of at least 1 the service also reads `X-Forwarded-Host`; otherwise add the service's own public origin (`https://kesennuma-contrib-production.up.railway.app`) to `ALLOWED_ORIGINS`. |
| Everyone gets `429 rate_limited` after a few requests | `TRUST_PROXY` is 0 behind a proxy, so all visitors share the proxy's address. Set it to the number of proxies in front (1 on Railway). |
| `429 admin_locked` | Ten wrong admin tokens from that network in 15 minutes. Wait it out (or restart the service, which clears the in-memory counters). |
| Uploads fail with `413`, or with a bare network error in the browser, before reaching the service's JSON errors | A proxy or CDN in front has a smaller body limit than `6 x MAX_PHOTO_MB + MAX_SHOT_MB`, or the body is above the service's own whole-body cap (the HTTP layer answers a bare `413` with no JSON and no CORS headers, which a browser reports as a network error). Raise the proxy limit or lower the photo limits; the app can read the limits it must respect from `GET /health` (`limits`) and check sizes before it uploads. |
| `503 server_busy` during an event | More uploads than the memory budget allows. Raise `UPLOAD_BUFFER_MB` and `MAX_CONCURRENT_UPLOADS` together with the instance memory. |
| `503 storage_full` | The data volume has less than `MIN_FREE_MB` free. Free or grow the volume (delete spam from the admin page, move the files to S3); uploads resume by themselves. The log has `storage.low` events. |
| `408 upload_too_slow` for real users | Their connection averages under `UPLOAD_MIN_KBPS` KB/s after the grace period (lower the app's photo sizes, or lower the floor). |
| `409 upload_in_progress` | The same contributor sent a second upload while one was still running (a double tap). The app should disable the button; retries with the same `Idempotency-Key` wait for the first instead. |
| `pendingDeletes` in `/admin/stats` stays above 0 | The store cannot delete files whose rows were erased (an S3 permission, an outage). They are retried every 10 minutes; fix the cause, or run a drain by restarting the service. |
| A HEIC photo has no preview in the admin page | Expected: the server cannot decode HEVC. Open the original file; its EXIF position is still read. |
| Admin images do not load | The browser must send the token with each image request; the admin page does this itself. A bare `<img src>` to `/admin/files/...` is `401` by design. |
| Excel shows `1.23457E+13` in the crew CSV | Use the default `excel` mode (cells like `="12345678901234"`); `excel=0` writes plain digits for scripts and Excel will round-display them. |
