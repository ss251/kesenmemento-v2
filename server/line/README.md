# KesenMemento LINE bot

A standalone Bun service beside `server/contrib` and `server/multi`. People send bugs, map fixes, photos and ideas from the LINE app. The team reads them at `/admin`.

Japanese first. The sentences in the spec are used word for word, with an English line under them. Typing `English` switches that person to English. `日本語` switches back.

```
env -u NODE_OPTIONS bun server/line/index.js
```

`POST /webhook` takes LINE events. `GET /healthz` and `GET /health` return `{ ok: true }`. `GET /privacy` is the follow text plus the data rules, in Japanese and English. `GET /admin` is the team page. `POST /admin/setup` (same password) points the channel at this service: webhook, rich menu, add-friend link. `GET /admin/status` (same password) names the channel this deployment runs on: `channelId`, `tokenSource`, `publicBaseUrl` and where it came from, `startedAt`. Nothing secret.

Connecting a new LINE Official Account is one command: `tools/line/connect.mjs` (see [connect.mjs](#connectmjs-a-new-official-account-in-one-command)).

## Environment

Everything comes from the environment. A missing or bad value stops the process before it listens, and the error never repeats a secret.

| Name | Required | Meaning |
|---|---|---|
| `LINE_CHANNEL_SECRET` | yes | Channel secret. Verifies `x-line-signature`. |
| `LINE_CHANNEL_ID` | yes, or a token | The channel's number (チャネルID). With the secret, the bot mints its own 15-minute tokens (`POST /oauth2/v3/token`), so no access token has to be issued or rotated. Wins over `LINE_CHANNEL_ACCESS_TOKEN`. |
| `LINE_CHANNEL_ACCESS_TOKEN` | if no ID | A fixed channel access token. Ignored when `LINE_CHANNEL_ID` is set. Must differ from the secret and from `ADMIN_TOKEN`. |
| `LINE_STORE_KEY` | yes | 32 random bytes, base64 or base64url. HMAC for `user_ref`, AES-256-GCM for the LINE user id. |
| `ADMIN_TOKEN` | yes | Password for HTTP Basic user `team`. At least 24 characters, no whitespace. |
| `DATA_DIR` | no | SQLite file and `media/`. Default `./data/line`. On Railway, `/data`. |
| `PUBLIC_BASE_URL` | no | Public origin, no trailing slash. Used for admin links and the webhook setup. Example `https://line.kesenmemento.com`. Unset on Railway, it is `https://$RAILWAY_PUBLIC_DOMAIN` (the service's own domain, which Railway injects). |
| `PORT` | no | Default `8093`. Railway sets this. |
| `HOST` | no | Default `127.0.0.1`. On Railway (`RAILWAY_ENVIRONMENT` or a Railway project id) the default is `0.0.0.0`. |
| `DISCORD_WEBHOOK_URL` | no | One line per new report: code, Japanese kind, first 80 characters, admin link. No photo and no user id. |
| `TEAM_LINE_TO` | no | LINE user id that receives one digest push at or after 20:00 JST, only when there were new reports that Tokyo day. |
| `LINE_EVENTS_PER_MIN` | no | Default 20 per person. |
| `LINE_REPORTS_PER_DAY` | no | Default 30 per person. `削除` does not reset it. |
| `LINE_SIM` | local only | `1` records replies in memory and never calls LINE. Refused when Railway is detected, or when `PUBLIC_BASE_URL` is not localhost. |

Generate the two random values on the machine that will hold them. Do not paste them into a chat, a commit, or a log.

```
openssl rand -base64 32    # LINE_STORE_KEY (decodes to 32 bytes)
openssl rand -base64 24    # ADMIN_TOKEN (24+ characters, no whitespace)
```

`bun server/line/index.js --check` prints the safe config (`set` / `unset`) and exits.

## Local run

No LINE account. Fake secrets, a temp directory, and `LINE_SIM=1`.

```
DIR=$(mktemp -d)
export LINE_CHANNEL_SECRET=local-channel-secret
export LINE_CHANNEL_ACCESS_TOKEN=local-channel-access-token
export LINE_STORE_KEY=$(openssl rand -base64 32)
export ADMIN_TOKEN=$(openssl rand -base64 24)
export DATA_DIR="$DIR"
export PUBLIC_BASE_URL=http://127.0.0.1:8943
export PORT=8943
export LINE_SIM=1
env -u NODE_OPTIONS bun server/line/index.js
```

In another shell, with the same `LINE_CHANNEL_SECRET`:

```
export LINE_CHANNEL_SECRET=local-channel-secret
export LINE_BASE=http://127.0.0.1:8943
env -u NODE_OPTIONS bun tools/line/sim.mjs --out transcript.md
curl -s -u "team:$ADMIN_TOKEN" http://127.0.0.1:8943/admin
```

Stop the server and `rm -rf "$DIR"`. `GET /sim/outbox` exists only while `LINE_SIM=1`. With the simulator on, the webhook finishes the reply before it returns 200, so the script can read the outbox. A real deploy returns 200 first, then processes.

The walkthrough sends more than 20 events. The script spaces their timestamps by 4 seconds so the default per-minute cap still lets every flow finish. The cap itself is covered by `test/line-webhook.test.js`.

## Tests

```
env -u NODE_OPTIONS bun test test/line-*.test.js
```

Signature, every flow, the store, admin auth, mocked media download, the push-quota guard, the setup and its error messages, `/admin/status`, and `connect.mjs` against a fake LINE, Railway and phone. No network.

## Deploy on Railway

The conductor deploys this. The service is separate from the town app.

- Service name: `kesenmemento-line`
- Source: the public v2 repo
- Root directory: the repository root (this service imports `src/anime/ui/qr.js` from setup, and Bun resolves `server/line` from the root)
- Build: none
- Start command: `bun server/line/index.js`
- Health check: `GET /healthz` (also `GET /health`)
- Volume: mount `/data`
- `DATA_DIR=/data`
- Domain: `line.kesenmemento.com`, a CNAME at Namecheap to the Railway domain

Set the variables in the Railway dashboard so the CLI does not print them: `LINE_CHANNEL_ID` and `LINE_CHANNEL_SECRET` from the channel's チャネル基本設定 (see below). Generate `LINE_STORE_KEY` and `ADMIN_TOKEN` with the `openssl` commands above and store them in that same file, mode `600`. Also set:

```
DATA_DIR=/data
PUBLIC_BASE_URL=https://line.kesenmemento.com
```

Optional: `DISCORD_WEBHOOK_URL`, `TEAM_LINE_TO`. Leave `LINE_SIM` unset. Railway sets `PORT`.

From a checkout of the commit that contains `server/line`, after the service, the volume, the variables and the DNS exist:

```
railway up --detach --service kesenmemento-line
```

Wait until `https://line.kesenmemento.com/healthz` returns `{"ok":true,...}`. Then point the channel at it from the service itself, so no secret leaves Railway (the build machine cannot reach `api.line.me` anyway: its DNS sinkholes it):

```
set -a && . ~/.config/kesenmemento/line.env && set +a
curl -s -u "team:$ADMIN_TOKEN" -X POST https://line.kesenmemento.com/admin/setup
```

Before it touches the channel, the setup checks that `$PUBLIC_BASE_URL/healthz` answers as this service. A custom domain whose DNS is not set yet fails there, with what to do, and the channel keeps its old webhook. On 2026-10-09 `line.kesenmemento.com` had no DNS record, and the service answered at `https://kesenmemento-line-production.up.railway.app`.

It answers the same JSON as `setup.mjs` (below), plus `webhookActive` (the console's 「Webhookの利用」 switch, which has no API: `false` means turn it on), `tokenSource` (`minted` or `static`) and `todo` (what is left for a person to click). A failure is a 502 whose `error` names the LINE call and what to do:

| `error` starts with | Meaning |
|---|---|
| `line api 400 (token)` | The channel ID and secret do not match. Copy both again from チャネル基本設定. |
| `line api 403 (set webhook)` | No active Official Account behind the channel, or its Messaging API is off: LINE Official Account Manager → 設定 → Messaging API → 「Messaging APIを利用する」. |
| `line api 429 (…)` | LINE is rate-limiting the channel; wait a minute. |
| `PUBLIC_BASE_URL … is unreachable` | The base has no DNS or TLS yet. Point it at the service, or set `PUBLIC_BASE_URL` to the Railway domain. |
| `webhook test failed: …` | LINE reached the base, but the webhook did not answer 200. |

## connect.mjs: a new Official Account in one command

Issue #5, path B, from a laptop that can reach `api.line.me` and is logged in to Railway with access to the project:

```
env -u NODE_OPTIONS bun tools/line/connect.mjs --check    # LINE only: is the channel ready? No Railway access needed
env -u NODE_OPTIONS bun tools/line/connect.mjs            # everything below
```

It asks for the チャネルID and the チャネルシークレット (the secret without echo), or reads `LINE_CHANNEL_ID` and `LINE_CHANNEL_SECRET` from the environment. Then:

1. **LINE.** It mints a token with the ID and secret and reads the bot's info: basic ID, name, the webhook switch, the push quota. A wrong pair, a channel without an Official Account (the 403), and the Reel Deal / UMI account stop it here, before Railway changes.
2. **Railway.** It reads the service's variables in memory, finds a base that answers as this service (`PUBLIC_BASE_URL`, else the Railway domain), shows what it will change and asks first (`--yes` skips the question). It sets `LINE_CHANNEL_ID`, sets `LINE_CHANNEL_SECRET` through `railway variable set --stdin` (never argv), points `PUBLIC_BASE_URL` at the working base, removes a stale `LINE_CHANNEL_ACCESS_TOKEN`, and redeploys once. `--deploy` uploads this checkout's bot instead, which also ships this server code. It stages only `server/line`, `tools/line/richmenu.png` and the service's own `package.json` and `railway.json` (`bun server/line/index.js`, health check `/healthz`) in a temporary folder, then runs `railway up <folder> --path-as-root`. Never run `railway up` from the checkout's root: the root `railway.json` belongs to the app (`cd bundle && bun server.js`), so the LINE service would build and start the app.
3. **Wait.** It polls `GET /admin/status` until the deployment runs the new channel. On an older build without that route, it retries the setup while LINE still refuses the old token.
4. **Setup.** `POST /admin/setup`: webhook, rich menu, add-friend link. It refuses a basic ID that is not the channel's.
5. **App.** It writes the basic ID to `data/play/line.json`, which turns on 「LINE で送る」 on the 「まちで見つけよう」 cards once that change is merged and deployed.
6. **Live test.** It prints the add-friend QR in the terminal, then watches `/admin/export.csv` until a bug report and a 「けしき V07」 photo arrive (15 minutes at most; `--no-watch` skips this), and asks whether the greeting and the メニュー bar showed.
7. **Handoff.** It prints the issue's handoff comment, filled in. Blanks stay blank, nothing is guessed. `--handoff file.md` saves it.

Neither the secret nor `ADMIN_TOKEN` is printed, logged, written, or passed as an argument (`test/line-connect.test.js` checks every output). Other flags: `--service`, `--project`, `--environment`, `--provider`. The exit code is 0 when nothing is left open, 2 when the handoff lists open items, and 1 on an error.

## setup.mjs (the same setup from a machine that can reach LINE)

`setup.mjs` needs `LINE_CHANNEL_ID` + `LINE_CHANNEL_SECRET` (or `LINE_CHANNEL_ACCESS_TOKEN`) and `PUBLIC_BASE_URL`. It does not need `LINE_STORE_KEY`. It writes nothing except an optional QR file.

```
env -u NODE_OPTIONS bun tools/line/setup.mjs
env -u NODE_OPTIONS bun tools/line/setup.mjs --qr add-friend.svg
```

It checks that `$PUBLIC_BASE_URL/healthz` answers as this service, sets the webhook to `$PUBLIC_BASE_URL/webhook`, tests that endpoint, reads the webhook switch, creates the rich menu, uploads the image, and sets it as the default. It prints JSON: `basicId`, the add-friend URL `https://line.me/R/ti/p/…`, the rich menu id, the webhook, `webhookActive`, `tokenSource` and `todo`. It does not print the secret or a token. With `--qr`, it writes an SVG using `src/anime/ui/qr.js`. The default name `add-friend.svg` is gitignored.

The image is `tools/line/richmenu.png` when that file exists (2500×1686, at most 1 MB). Otherwise setup generates a plain six-tile placeholder. Re-running setup deletes older menus that are also named `kesenmemento`, after the new one is the default.

## Tokens

With `LINE_CHANNEL_ID` set there is nothing to rotate: each token lives 15 minutes, is reused until a minute before it expires, and a 401 mints a fresh one once (`server/line/api.js`). Stateless tokens have no cap on how many are active, unlike short-lived ones (30 per channel).

With a fixed `LINE_CHANNEL_ACCESS_TOKEN` instead: issue a new one in LINE Developers, put it in the Railway variable, restart, run the setup again if needed, and revoke the old one.

Do not rotate `LINE_STORE_KEY` as a routine. It is the key for `user_ref` and for the encrypted LINE user id. A new key makes old rows undecryptable, so `削除` and 「直りましたと送る」 can no longer find that person. Rotate it only when the key has leaked, and accept that existing contacts are gone.

`LINE_CHANNEL_SECRET` changes only if the channel is reissued. Update Railway, restart, and the next webhook uses the new secret. In-flight retries signed with the old secret get 401.

## What the owner clicks

About 10 minutes. It needs his LINE identity and LINE's terms.

1. Create the LINE Official Account 「ケセンメメント」 (https://entry.line.biz/, LINE Business ID). The free plan (コミュニケーションプラン) is enough: replies are free; pushes are 200 a month.
2. In LINE Official Account Manager → 設定 → Messaging API → 「Messaging APIを利用する」 (choose or create a provider, e.g. KesenMemento).
3. In 応答設定: 応答メッセージ OFF, あいさつメッセージ OFF (the bot sends its own), Webhook ON.
4. In LINE Developers (https://developers.line.biz/console/) → the channel → チャネル基本設定: copy the チャネルID and the チャネルシークレット into the Railway variables `LINE_CHANNEL_ID` and `LINE_CHANNEL_SECRET` (service kesenmemento-line). Never paste them into a chat. No access token has to be issued.

Everything else is scripted (`POST /admin/setup`, or all of it with `tools/line/connect.mjs`): the webhook URL, the rich menu, and the add-friend link and QR. `tools/line/connect.mjs --check` confirms that steps 1–3 took, without Railway access.

## Where this build differs

Checked against `messaging-api.yml` in [line/line-openapi](https://github.com/line/line-openapi) on 2026-10-08, and against the spec.

**LINE docs**

- Reply and push return `{ sentMessages }`, not an empty body. The client treats any 2xx as success and does not read the message ids.
- Push sends `X-Line-Retry-Key` (a UUID) and reuses that same key on the one retry. Reply has no retry-key header in the current OpenAPI, so reply does not send one.
- Image bytes come from `GET https://api-data.line.me/v2/bot/message/{id}/content`. The OpenAPI text on that parameter says "video or audio"; the same path is the image content endpoint, and this service uses it for images.
- Rich-menu image upload is `POST https://api-data.line.me/v2/bot/richmenu/{richMenuId}/content`. The schema types the body as `*/*`. We send `image/png` or `image/jpeg`.
- `POST /v2/bot/channel/webhook/test` documents `endpoint` as optional. We always send the URL we just set.
- Quota `type` is `limited` (with `value`) or `none` (unlimited, `value` omitted). 「直りましたと送る」 and the daily digest both refuse a push when the remaining count is under 1. If the quota call fails, they do not push and do not mark the report fixed. A digest that sees zero remaining is marked sent for that Tokyo date so it does not retry all night. A failed quota fetch is not marked, so a later minute can try again.
- `GET /v2/bot/info` can include `premiumId` and `pictureUrl`. Setup prints only `basicId` and the add-friend URL.
- The profile API is never called.
- Leave-group and leave-room are not in the spec's endpoint list. The bot calls them because a group or a room must be left. Nothing from a group is filed.
- After the new rich menu is the default, setup lists menus and deletes older ones named `kesenmemento`. LINE allows 1000. Re-running setup would otherwise pile them up.
- The OpenAPI does not enumerate rich-menu sizes. We send the spec's 2500×1686. Tile widths are 833, 833 and 834. Tile height is 843. The chat bar is `メニュー`.

**This service**

- EXIF. The spec says to re-save the image so EXIF is stripped. `sharp` is already a dependency of the town app and is not used here. Nothing else in the repo re-encodes pixels. JPEG APP1 (EXIF and XMP) and a PNG `eXIf` chunk are dropped without decoding the image. The other bytes are stored as LINE served them. LINE re-encodes uploads before this service downloads them. WebP is stored as served; its EXIF is not stripped. Width and height come from the JPEG SOF or the PNG IHDR. GIF uses the header. Files over 10 MB are refused.
- `reports.closed_at` is an extra column. It is set when the team marks a report `fixed` or `rejected`, and a later note does not move it. Rejected photos go 30 days after `closed_at`. Closed reports go 180 days after `closed_at`. Open reports stay. Orphan files under `media/` that are older than a day and not in the database are removed. A file shared by another row is kept.
- `report_log` is not in the spec's delete list. `削除` removes reports, media and the contact, and leaves the log, so the 30-a-day cap still holds.
- A location message's address is not stored. Only latitude and longitude. A place name is stored only when the person types it.
- 「建物があるはず」 is stored as `fix_what` `extra`. The admin page and the summary show the Japanese label.
- Help, the status reply, the delete result, the rate-limit line, the leave line, the place-name prompt, and the empty / 10-photo / 4,000-character / download-failed lines are extra sentences the flows need. The spec's own sentences are unchanged. English mode is English only. Japanese mode keeps the spec sentence and adds an English line. The follow text and the photo-consent text already include their English in the spec, so a second English line is not added.
- `LINE_SIM=1` processes the webhook before it returns 200. Production returns 200, then processes. Redeliveries are accepted and not filed twice. The event id is claimed before any download.
- Logs are one JSON object per line, and only a fixed set of keys. A token, a raw LINE user id, a report body, or a webhook URL cannot be logged. `user_ref` (the hash) can.
