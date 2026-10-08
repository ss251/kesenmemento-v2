# Contributor API

Base path `/api/contrib/v1`. JSON in and out unless noted. This is the contract between the backend (`server/contrib/`) and the app's report sheet. It started from a spec that is not included; everything that spec left open (response shapes, error codes) is fixed here.

## Contract changes

The spec's endpoints, paths, methods and field names are unchanged. Everything below is **additive** and backwards compatible: a client written against the spec keeps working.

| Addition | Where |
| --- | --- |
| `kind` (`issue` or `fix`), inferred when missing, on submissions; default points 5 for an issue and 20 for a fix | `POST /submissions`, `GET /me`, admin |
| `usedVersion` / `usedAt`: the release that shipped an item; `POST /admin/submissions/:id {status: "used", version}` and the bulk `POST /admin/submissions/mark-used`; shown to contributors in `GET /me` | review, `/me` |
| Account transfer without any external login: `GET /me/transfer-code` and `POST /contributors/claim {code}` | new endpoints |
| `DELETE /me?confirm=1` (erase everything I sent), and admin `DELETE` for a submission or a contributor | new endpoints |
| `POST /me/sign-out-others`: revoke every other device's token (a lost phone, or making room under the 10-device limit) | new endpoint |
| Upload protections that can answer `408 upload_too_slow` / `upload_timeout`, `409 upload_in_progress`, `503 storage_full`, and a daily upload **volume** budget (`429 daily_limit`) | submissions |
| `Idempotency-Key` header on `POST /submissions` (a retried upload returns the original) | submissions |
| `rank` and `pointsTotal` on `GET /me`; `me: true` on the caller's own leaderboard row when a token is sent | `/me`, `/leaderboard` |
| Admin extras: `GET /admin/stats`, `GET /admin/audit`, `POST /admin/contributors/:id` (ban, unban, reset nickname) | admin |
| Pipeline: `tools/contrib/pull.mjs` also writes `SWEEP.md` and `index.json`; `tools/contrib/mark-used.mjs` | tools |
| `limits` and `points` in the `GET /health` answer, so the app can check sizes before uploading | health |
| Spec details fixed here: response shapes, error codes, the exact limits, JST day semantics for CSV ranges | this file |

## Conventions

- **Auth.** Contributors send `Authorization: Bearer <contributorId>.<secret>` (the token from `POST /contributors` or a claim). Admin calls send `Authorization: Bearer <ADMIN_TOKEN>`. No cookies anywhere, so there is no CSRF surface.
- **Errors.** Every error is `{"error": "<code>", "message": "<English sentence>"}`, sometimes with extra fields (`field`, `index`, `max`). Switch on `error`; `message` is for developers. Codes are listed at the end.
- **CORS.** Only origins on `ALLOWED_ORIGINS` (default: the production app, `http://127.0.0.1:8787`, `http://localhost:8787`) and the service's own origin may call it from a browser; any other `Origin` gets `403 origin_not_allowed`. Preflights (`OPTIONS`) are answered with `Authorization, Content-Type, Idempotency-Key, X-Admin-Name` allowed and a 10-minute cache. No credentials mode is needed.
- **Times** are ISO-8601 UTC with milliseconds (`2026-10-05T03:00:00.000Z`). The admin page and CSV ranges use Japan Standard Time for display and for plain dates.
- **IDs.** Contributor ids are 16 random base64url characters; submission ids are 16 lowercase Crockford-base32 characters (safe in file names and URLs).
- **Rate limits.** `429` with a `Retry-After` header (seconds) and `{"error": "rate_limited"}` (or `daily_limit`, `admin_locked`). Limits per client IP unless noted: 240 requests a minute (health and the admin page's static files are exempt); 30 new contributors an hour; 5 claim attempts an hour; 60 upload attempts an hour (failed ones count); 60 accepted submissions a day per IP (3 x `DAILY_LIMIT`); **20 submissions a day per contributor** (rolling 24 h) and an upload **volume** of 1 GB a day per contributor and 3 GB per IP (`DAILY_MB`, `IP_DAILY_MB`, counted from the request bytes of stored submissions); one upload at a time per contributor and 3 at a time per IP; 10 wrong admin tokens in 15 minutes throttle further guessing from that IP (the correct token always passes); 10 transfer codes an hour per contributor. IPv6 clients count per /64.
- **Caching.** API responses are `Cache-Control: no-store`.
- **Request id.** Every response has `X-Request-Id`; quote it when reporting a problem (it is also in the log line).

## Public endpoints

### `GET /health`

`200 {"ok": true, "service": "kesennuma-contrib", "version": "1.0.0", "storage": "disk", "time": "...", "limits": {"maxPhotos": 6, "maxPhotoBytes": 15728640, "maxScreenshotBytes": 8388608, "maxNoteChars": 2000, "dailyLimit": 20}, "points": {"issue": 5, "fix": 20}}`. `503` with `ok: false` when the database cannot be read. Use it as the platform health check. `limits` and `points` are what the operator configured (the defaults above): the app may read them to check sizes before it uploads and to show the default points, instead of hard-coding them.

### `POST /contributors`

Create an anonymous contributor. Body (all optional): `{"nickname": "さくら", "crewNo": "1234-5678-9012-34"}`.

`201 {"contributorId": "RjiUV-PGrrGXER_K", "token": "RjiUV-PGrrGXER_K.<secret>", "nickname": "さくら"}`.

- The token is shown once: keep it in `localStorage`. Only a keyed hash of its secret is stored.
- `nickname`: 1 to 24 characters (an emoji counts once), control and bidi characters removed, no links or e-mail addresses. Blank or missing gives `Guest-XXXX`.
- `crewNo`: exactly 14 digits; dashes, spaces and full-width digits are accepted and stored as 14 plain digits. Blank or `null` means none.
- Errors: `invalid_nickname`, `invalid_crew_no`, `invalid_json`, `unsupported_media_type`, `payload_too_large`, `rate_limited`.

### `POST /contributors/claim`

Sign in on another device with a transfer code. Body `{"code": "K7QM2-XHD9P"}`.

`200 {"contributorId": "...", "token": "<id>.<new secret>", "nickname": "..."}`: a **new** token for the same contributor. The old device keeps working (nothing is revoked); an account may hold at most 10 tokens (`409 too_many_devices`).

- Codes are 10 characters of the Crockford alphabet, shown as `XXXXX-XXXXX`; case, spaces and dashes are ignored and `O`/`I`/`L` are read as `0`/`1`/`1`.
- A code works once and for 15 minutes.
- Wrong, expired and used codes are all `404 code_not_found` (same message). Malformed input is `400 code_malformed`.
- **5 attempts per IP per hour**, rejected ones included: `429 rate_limited`.
- A banned contributor gets `403 banned`.

### `GET /me`

```json
{
  "contributorId": "RjiUV-PGrrGXER_K",
  "nickname": "Sakura",
  "crewNo": "12345678901234",
  "createdAt": "2026-10-05T03:00:00.000Z",
  "banned": false,
  "points": 35,
  "pointsTotal": 35,
  "accepted": 2,
  "rank": 1,
  "submissions": [
    { "id": "h5rnb9yy3rq02gkb", "createdAt": "...", "status": "used", "kind": "fix", "category": "sign",
      "note": "...", "points": 25, "photos": 2, "reviewedAt": "...", "usedVersion": "v0.5.0", "usedAt": "..." }
  ]
}
```

- `points` (alias `pointsTotal`) is the sum of the points of the contributor's `accepted` and `used` submissions; `accepted` counts those submissions; `rank` is the leaderboard position (`null` when not listed).
- `status`: `new` (waiting), `accepted` (points awarded), `used` (shipped: show 「反映済み (usedVersion)」), `rejected`. `usedVersion` and `usedAt` are `null` unless `used`.
- Submissions are newest first, at most 200. Reviewer notes are **not** included. `crewNo` is returned only to its owner.

### `PATCH /me`

Body `{"nickname"?: string | null, "crewNo"?: string | null}`. An omitted key is left alone; `nickname: ""` or `null` resets it to `Guest-XXXX`; `crewNo: null` or `""` removes the number. Returns the same body as `GET /me`. Errors: `invalid_nickname`, `invalid_crew_no`. Unknown keys are ignored (it cannot change points or ban state).

### `DELETE /me?confirm=1`

Erase the contributor and every submission, photo and file they sent (privacy: deletion on request). `200 {"ok": true, "deletedFiles": 8}`; without `confirm=1` it is `400 confirm_required`. Their token stops working at once. Files the store cannot delete right away stay queued (`pending_deletes`) and are retried every 10 minutes until they are gone. Work already used to correct the model cannot be taken back out of the model.

### `GET /me/transfer-code` (or `POST`)

`200 {"code": "K7QM2-XHD9P", "expiresAt": "...", "expiresInSeconds": 900}`. Show it big and let the person type it on the other device. A new code replaces an unused older one; at most 10 an hour per contributor; banned contributors get `403 banned`. Only a keyed hash of the code is stored.

### `POST /me/sign-out-others`

`200 {"ok": true, "revoked": 2}`: every token of this contributor except the one used for this call stops working, and any open transfer code is cancelled. Use it when a phone is lost, or to free a slot under the 10-device limit; the account, points and submissions are untouched. The device that calls it stays signed in (its token becomes the contributor's only credential). With one device it revokes nothing (`revoked: 0`).

### `POST /submissions` (multipart/form-data)

| Field | |
| --- | --- |
| `pose` | JSON string: `{enu: [x, y, z], latlon: [lat, lon], heading, pitch, fov, mode, at, appVersion, layoutVersion, timePreset, season, viewport}`. Optional but expected. Either `enu` or `latlon` is enough (the other is computed with the app's frame). `heading` wraps into [0, 360), `pitch` is clamped to [-90, 90], `fov` must be in (0, 180]. `mode` is a short word (`walk`, `drive`, `fly`, `drone`, `sail`, ...). Unknown keys survive only as small primitives. |
| `category` | `building`, `road`, `shop`, `sign`, `landmark` or `other` (default `other`) |
| `kind` | `issue` or `fix`. Missing: `fix` if there is at least one photo, else `issue`. `fix` with no photo is `400 fix_needs_photos`. |
| `note` | up to 2,000 characters (control characters removed, CRLF folded) |
| `lang` | language tag such as `ja` or `en` |
| `consent` | **`1` is required** (`true`, `on`, `yes` also count). Anything else is `400 consent_required`. |
| `screenshot` | one PNG or JPEG, at most `MAX_SHOT_MB` (8) |
| `photos` | 0 to `MAX_PHOTOS` (6) files, JPEG / PNG / WebP / HEIC, at most `MAX_PHOTO_MB` (15) each. `photos[]` and `photo` work as field names too; empty file parts are ignored. |

A submission needs a note, a screenshot or a photo (`400 empty_submission`).

`201 {"id": "h5rnb9yy3rq02gkb", "status": "new", "kind": "fix", "photos": 2, "createdAt": "..."}`.

**Idempotency.** Send `Idempotency-Key: <8 to 80 characters of letters, digits . _ : ->` (a UUID is fine) and reuse it when you retry after a timeout: the second call returns `200` with the original `id` and `"replayed": true` (header `Idempotent-Replayed: true`) instead of creating a duplicate. Keys are per contributor.

**What the server does with the files.**

- The file type comes from the **magic bytes**; the client's content type and file name are ignored and never stored. Anything that is not a JPEG, PNG, WebP or HEIC is `415 invalid_image` (with `field` and `index`); an image that cannot be decoded is `415 unreadable_image`; the decoder refuses anything over 64 megapixels (`MAX_IMAGE_MP`).
- Originals are stored privately under `submissions/<yyyy>/<mm>/<id>/` exactly as uploaded (EXIF intact). A 1,280 px metadata-free JPEG preview is made for the admin page.
- A **HEIC** the server cannot decode (the prebuilt image library has no HEVC decoder) keeps its original, has no preview, and is noted in the photo's EXIF summary; its EXIF position is still read.
- EXIF read per photo (whitelist only: no serial numbers or owner names): GPS position, altitude, heading, capture time with its time zone, camera make and model, lens, focal length. The ENU position is `x = (lon - 141.5750) * 86744`, `z = -(lat - 38.9060) * 111014`.
- The whole submission is **all or nothing**: files are removed again if anything fails.
- Limits: at most 6 photos, 15 MB each, 8 MB for the screenshot; the whole body is capped at `6 x 15 MB + 8 MB + 1 MB`. Oversize is `413 photo_too_large` / `screenshot_too_large` / `payload_too_large`; too many photos is `400 too_many_photos`; a form of absurdly many parts is `400 too_many_parts`. A body announced above the whole-body cap is refused by the HTTP layer itself before the service sees it: a bare `413` with no JSON and no CORS headers, which a browser reports as a network error, so the app should check sizes before it uploads.
- At most 20 submissions and 1 GB of uploads per contributor per rolling day, 60 submissions and 3 GB per IP: `429 daily_limit`, with the time to wait in `Retry-After`. A client that announces its size (`Content-Length`, which browsers send for a `FormData` body) is checked before any of the body is read.
- One upload at a time per contributor (`409 upload_in_progress`, `Retry-After: 5`; a retry with the same `Idempotency-Key` instead waits for the first copy and returns its answer) and 3 per IP (`429 rate_limited`).
- The body must keep arriving: after a 20 s grace period it must average at least 16 KB/s and the whole upload must finish within 10 minutes, otherwise it is cut off with `408 upload_too_slow` / `upload_timeout` (show "check your connection and try again"). A connection that sends nothing for 30 s while the body is arriving is dropped.
- `503 storage_full` (with `Retry-After: 3600`) when the data volume has less than `MIN_FREE_MB` (512) free: uploads stop so the database and the admin's moderation keep working.
- `503 server_busy` (with `Retry-After`) when the memory budget for request bodies (`UPLOAD_BUFFER_MB`, 256) is fully booked and the short wait queue is full or timed out; retry.
- **A refusal arrives after the body does.** When the server refuses an upload before it has read it (a bad token, a daily limit, `409`, `503`), it first takes the rest of the body off the connection (up to the size cap, under the same speed rules) and only then answers. That keeps the connection usable for the next request; without it some clients get a bare `400` for the request that follows. So in the app a refusal shows up when the upload has finished, not at its first byte. A body announced as larger than the cap (`Content-Length`) is refused at once with `413`.

### `GET /leaderboard?limit=20`

`200 [{"nickname": "Sakura", "accepted": 2, "points": 35}, ...]`, best first (points, then accepted count, then who was accepted first). `limit` is 1 to 100 (default 20; anything else falls back or clamps). Nickname, count and points only: **never a crew number**. Banned contributors and people with no accepted submission are not listed. No token is needed; with a valid contributor token the caller's own row also has `"me": true`.

## Admin endpoints

All need `Authorization: Bearer <ADMIN_TOKEN>` (`401 unauthorized` otherwise). Ten wrong tokens from one IP in 15 minutes make further wrong guesses from it `429 admin_locked`, but the correct token always passes, so a stranger sharing the admin's address cannot lock the admin out. An optional `X-Admin-Name: <URI-encoded name>` header is stored with each audit entry as `admin:<name>`; it is self-declared (there is one shared token), not authentication.

### `GET /admin/submissions?status=&kind=&category=&q=&contributor=&sort=&limit=&offset=`

`{"items": [...], "total": 143, "limit": 25, "offset": 0}` (also `X-Total-Count`). `status` is `new|accepted|used|rejected` (empty or `all` = everything); `q` searches the id prefix, nickname and note (`%` and `_` are literal); `sort` is `newest` (default) or `oldest`; `limit` 1 to 100 (default 25). An item:

```json
{ "id": "...", "createdAt": "...", "status": "new", "kind": "fix", "category": "sign", "note": "...", "lang": "ja",
  "points": 0, "reviewedAt": null, "usedVersion": null, "usedAt": null,
  "contributor": { "id": "...", "nickname": "...", "banned": false },
  "photoCount": 2, "hasScreenshot": true, "thumbUrl": "/api/contrib/v1/admin/files/submissions/2026/10/<id>/screenshot.thumb.jpg",
  "location": { "lat": 38.9065, "lon": 141.5752, "source": "photo" } }
```

`location.source` is `photo` (first GPS photo) or `pose`; `null` when neither exists. A crew number never appears.

### `GET /admin/submissions/:id`

The full record: the item above plus `reviewerNote`, `pose` (as stored), `client` (`ua`, `origin`, `consent: {given, version}`, `screenshot: {mime, bytes, width, height, thumbKey}`, `warnings`), `screenshot` (`key`, `url`, `thumbUrl`, ...), `photos[]` and the contributor with totals:

```json
"photos": [{ "id": "...", "n": 1, "key": "submissions/2026/10/<id>/photo-1.jpg", "url": "/api/contrib/v1/admin/files/...",
  "previewKey": "...", "previewUrl": "...", "mime": "image/jpeg", "bytes": 3500000, "width": 4032, "height": 3024,
  "exif": { "make": "Apple", "model": "iPhone 15", "focalLength35mm": 26, "takenAt": "...", "gps": { "lat": 38.9, "lon": 141.57, "altM": 4.2, "headingDeg": 120, "headingRef": "T" }, "enu": { "x": 17.3, "z": -55.5 } },
  "lat": 38.9065, "lon": 141.5752, "enu": { "x": 17.3, "z": -55.5 }, "takenAt": "2026-10-04T14:23:05+09:00", "heading": 120 }],
"contributor": { "id": "...", "nickname": "...", "banned": false, "createdAt": "...", "lastSeen": "...", "hasCrewNo": true, "crewNoMasked": "••••••••••1234", "submissions": 5, "accepted": 2, "points": 35 }
```

`exif` holds only what the photo had, so every key in it is optional: `make`, `model`, `lens`, `software`, `orientation`, `focalLengthMm`, `focalLength35mm`, `fNumber`, `exposureS`, `iso`, `takenAt`, `takenAtZone`, `gps` (`lat`, `lon`, `altM`, `headingDeg`, `headingRef`, `accuracyM`) and `enu` (`x`, `z`). Nothing else is read from the file (no serial numbers, owner names or maker notes).

`previewUrl` is `null` for a HEIC without a preview. The full crew number is only in the CSV. `404` for an unknown or malformed id.

### `POST /admin/submissions/:id` (review)

Body `{"status": "new|accepted|used|rejected", "points"?: int, "reviewerNote"?: string, "version"?: string}`. Returns the updated full record.

- `points` is 0 to 10,000. Accepting (or marking used) without `points` keeps the points already awarded, else uses **5 for an issue and 20 for a fix** (`POINTS_ISSUE`, `POINTS_FIX`). `rejected` and `new` are always 0 points.
- `version` (release tag or commit, 1 to 64 characters: letters, digits and `. _ + @ / -`) is stored as `usedVersion` with `usedAt` when the status is `used`; it is optional on this call (the admin page always asks for it). Leaving `used` clears both.
- `reviewerNote` (at most 1,000 characters) is internal: it is never shown to contributors. Omitted keeps it; `""` clears it.
- `reviewedAt` is the time of the current **decision**: editing points, or marking an accepted item used, does not move it, so an item stays in the period it was accepted in. Changing the decision (accepted, then rejected, then accepted again) is a new decision and does move it, so such an item can appear in a later period's export too.
- Audited as `submission.review` (from, to, points, noteChanged; never the note text).
- Errors: `invalid_status`, `invalid_points`, `invalid_version`, `note_too_long`, `404`.

### `POST /admin/submissions/mark-used`

Body `{"ids": ["...", ...], "version": "v0.5.0"}` (1 to 500 ids; `version` required). Marks **accepted** items used.

`200 {"version": "v0.5.0", "updated": [ids], "skipped": [{"id": "...", "reason": "not_accepted|already_used|unchanged"}], "notFound": [ids]}`. An item already used in another release is never overwritten (`already_used`); in the same release it is `unchanged`. Audited per item (`submission.used`) and once for the batch (`submissions.mark_used`). Errors: `version_required`, `invalid_version`, `invalid_ids`.

### `DELETE /admin/submissions/:id`

Erase one submission and its files: `200 {"ok": true, "deletedFiles": 6}`. Audited as `submission.delete`.

### `POST /admin/contributors/:id` and `DELETE /admin/contributors/:id`

Body `{"banned"?: boolean, "nickname"?: string | null}`; returns `{"id", "nickname", "banned"}`. A banned contributor cannot submit, mint or claim a code, and leaves the leaderboard and the crew CSV; `nickname: null` resets an offensive nickname to `Guest-XXXX`. `DELETE` erases the contributor with everything they sent: `{"ok": true, "deletedFiles": n}`. Audited as `contributor.ban`, `contributor.unban`, `contributor.nickname`, `contributor.delete`.

### `GET /admin/files/<key>`

Streams a stored file (screenshot, thumbnail, original or preview). The key is the one in the record (`submissions/<yyyy>/<mm>/<id>/photo-1.jpg`); slashes may be sent raw or as `%2F`. It serves **only** files recorded for a submission (anything else, traversal included, is `404`). Headers: the real `Content-Type` and `Content-Length`, `Content-Disposition: inline; filename="photo-1.jpg"` (`?download=1` makes it `attachment`), `Cache-Control: private, max-age=300`, `Content-Security-Policy: default-src 'none'; sandbox`. An `<img>` tag cannot send the token, so the admin page fetches with the header and shows a `blob:` URL.

### `GET /admin/export/crew.csv?from=&to=&excel=`

`text/csv; charset=utf-8`, **with a UTF-8 byte-order mark** (Excel on Windows reads Japanese correctly), CRLF line ends, header `crew_no,nickname,points,accepted`. One row per クルーNo.: the points and the number of accepted + used submissions **reviewed** in the range. Contributors without a number and banned contributors are excluded. Two accounts that entered the same number are merged into one row (points added; the nickname of the stronger account), so a number is rewarded once. Rows are ordered by points, then count, then number.

- `from` and `to` are optional, both inclusive. A plain date (`2026-10-05`) is a **Japan Standard Time** day; `to=2026-10-05` includes all of that day. A full timestamp with an offset or `Z` is that instant; one without an offset is read as JST. Bad input is `400 invalid_range`.
- `crew_no` cells are written as `="12345678901234"` so Excel keeps all 14 digits as text (otherwise it shows `1.23457E+13` and drops a leading zero). `excel=0` writes the bare digits for scripts.
- A nickname that starts with `=`, `+`, `-`, `@`, tab or CR gets a leading `'` so a spreadsheet cannot run it as a formula. Cells with commas, quotes or line breaks are quoted.
- `Content-Disposition: attachment; filename="crew-<JST date>.csv"`. Audited as `export.crew` (range and row count only).

### `GET /admin/export/submissions.json?status=accepted&from=&to=`

The feed for the pipeline: `{"generatedAt": "...", "status": "accepted", "count": n, "submissions": [...]}`. `status` is any status or `all` (default `accepted`); `from`/`to` filter on the review time like the CSV. Each submission has everything of the full record except the crew number and masked data, with the contributor reduced to `{id, nickname}`. Audited as `export.feed`. `tools/contrib/pull.mjs` consumes this.

### `GET /admin/stats`

`{"byStatus": {new, accepted, used, rejected}, "newByKind": {issue, fix}, "contributors": n, "banned": n, "photos": n, "withCrewNo": n, "pendingDeletes": n, "points": {"issue": 5, "fix": 20}, "generatedAt": "..."}`. `pendingDeletes` is the number of stored files still waiting to be deleted after their rows were erased (normally 0; a number that stays above 0 means the store cannot delete: check it).

### `GET /admin/audit?limit=&offset=`

`{"items": [{"id", "at", "actor", "action", "target", "detail"}], "total", "limit", "offset"}`, newest first (limit 1 to 200, default 50). Actions: `submission.review`, `submission.used`, `submissions.mark_used`, `submission.delete`, `contributor.ban`, `contributor.unban`, `contributor.nickname`, `contributor.delete`, `contributor.self_delete`, `export.crew`, `export.feed`. Details hold ids, statuses, counts and ranges: never nicknames, notes, crew numbers or addresses.

### `GET /admin`

The single-page admin app (HTML; `/admin/app.js`, `/admin/lib.js`, `/admin/app.css`, `/admin/icon.svg` beside it). No token is needed to load the page; everything it shows comes from the endpoints above. Strict CSP: `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; frame-ancestors 'none'` and no inline script or style.

## Error codes

| Status | `error` | Meaning |
| --- | --- | --- |
| 400 | `bad_request` | malformed URL |
| 400 | `invalid_json` | body is not a JSON object |
| 400 | `invalid_nickname`, `invalid_crew_no`, `invalid_category`, `invalid_kind`, `invalid_lang`, `invalid_pose`, `invalid_screenshot`, `invalid_<field>` | a field failed validation (`message` says which rule) |
| 400 | `consent_required` | `consent=1` missing |
| 400 | `fix_needs_photos` | `kind=fix` without a photo |
| 400 | `empty_submission` | no note, screenshot or photo |
| 400 | `note_too_long` | note over 2,000 (reviewer note over 1,000) characters |
| 400 | `too_many_photos` (`max`), `too_many_parts`, `invalid_multipart` | the form is wrong |
| 400 | `invalid_idempotency_key` | key not 8 to 80 safe characters |
| 400 | `code_malformed`, `confirm_required` | transfer code shape; `DELETE /me` without `?confirm=1` |
| 400 | `invalid_status`, `invalid_points`, `invalid_version`, `version_required`, `invalid_ids`, `invalid_range`, `invalid_banned`, `invalid_contributor` | admin input |
| 401 | `unauthorized` | missing or wrong token (always the same body) |
| 403 | `origin_not_allowed` | browser origin not on the allow-list |
| 403 | `banned` | the contributor is banned |
| 404 | `not_found`, `code_not_found` | no such route, record or file; wrong, expired or used transfer code |
| 405 | `method_not_allowed` | `Allow` header lists the methods |
| 408 | `upload_too_slow`, `upload_timeout` | the body arrived too slowly or took too long |
| 409 | `too_many_devices` | an account holds 10 tokens (`POST /me/sign-out-others` frees them) |
| 409 | `upload_in_progress` | this contributor already has an upload running (`Retry-After: 5`) |
| 413 | `payload_too_large`, `photo_too_large` (`index`, `max`), `screenshot_too_large` (`max`) | size limits |
| 415 | `unsupported_media_type` | not JSON / not multipart |
| 415 | `invalid_image` (`field`, `index`), `unreadable_image` | wrong magic bytes; cannot be decoded |
| 429 | `rate_limited`, `daily_limit`, `admin_locked` | see Rate limits; `Retry-After` is set |
| 500 | `internal` | unexpected; nothing else is revealed (see the log by request id) |
| 503 | `server_busy` | the upload memory budget or queue is full; retry after `Retry-After` |
| 503 | `storage_full` | the data volume is nearly full; uploads are paused (`Retry-After: 3600`) |

## Notes for the app (report sheet)

- Keep the token in `localStorage`; send `Authorization: Bearer <token>` on `/me`, `/submissions`, `/me/transfer-code`, and optionally on `/leaderboard` (to get `me: true`).
- Build the submission with `FormData` (do not set `Content-Type`; the browser adds the boundary). Append `pose` as a JSON string, the screenshot as a `File`, each photo with the field name `photos`.
- Generate an `Idempotency-Key` (`crypto.randomUUID()`) once per attempt of the sheet and reuse it on 「再試行」.
- Show `429` as "try again later" using `Retry-After`; `413`/`415` as "this photo is too big or not a supported image"; `403 banned` as a generic failure.
- Check sizes before uploading (15 MB a photo, 8 MB for the screenshot, six photos): a photo over its limit comes back as a readable `413 photo_too_large`, but a whole body above the cap never reaches the service and looks like a network error in the browser.
- A HEIC photo is accepted as is; the server may have no preview for it, which only affects the admin page.
- Photo GPS: photos keep their EXIF in the original; do not strip or re-encode them in the app (the survey needs the position, time and heading). The screenshot needs no EXIF.
