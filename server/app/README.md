# Production app server (Railway)

`server.js` is the server of https://kesennuma-living-city-production.up.railway.app: the built app, `data/`,
`/api/live`, and `/api/jpyc` (`jpyc.js`: a cached, allow-listed read proxy of JPYC EC for the 「JPYCで買えるお店」 sheet; its
allow-list is `data/shops/jpyc.json`; [docs/jpyc/README.md](../../docs/jpyc/README.md)). `static.js` serves each file's
precompressed sibling (`.br`, else `.gz`) to a client that accepts it; `precompress.mjs` writes those siblings when the
bundle is assembled. Brotli cuts the startup data about six-fold (`layout.json` 10.7 MB to 1.9 MB, `grids.bin` 11.8 MB to 2.1 MB).
It stores nothing and has one write route: `POST /api/live/ais`, where a local AIS receiver can push ship positions with
`Authorization: Bearer $AIS_INGEST_TOKEN` ([docs/live/AIS-RECEIVER.md](../../docs/live/AIS-RECEIVER.md)). It answers 404 unless that variable is set, so
production has no open write. Every other request that is not GET or HEAD answers 405. `GET /api/play/voucher/check?c=` tells a shop
whether a voucher code is well formed (nothing is stored).

## The bundle

Production does not run from the repository tree but from a **bundle**, a folder with the server beside only what it serves:

| In the bundle | What it is |
|---|---|
| `server.js`, `static.js`, `jpyc.js` | this folder's three files, at the root, so their imports are bundle-relative |
| `public/` | the build (`dist/`), without source maps, dot files, the per-port test builds (`anime-<port>`), the JPYC e2e screenshots (`jpyc-shots*`), the folders the QA and screenshot tools write (`qa3/`, `*-shots/`) and the dev fixtures |
| `data/` | what the app fetches at run time: `data/anime`, `data/live`, `data/ship`, `data/shops`, `tour.json`, `landmarks.json`, `i18n.json`, the three `ui-*-i18n.json` files and `buildings/coast.json`; and, when the checkout has it, `data/play` (the card stills of the play hub) |
| `src/`, `scripts/` | the modules behind `/api/live` (`src/server/live.js`, `src/core/geo.js`, `src/web/lib/solar.js`, `scripts/live.js`, `scripts/live/*`; when the checkout has them, the AIS feed `src/server/ais.js` with `src/anime/world/life/ais.js`) and the voucher check (`src/anime/play/missions/voucher.js`) |
| `*.br`, `*.gz` | brotli 11 and gzip 9 copies of every compressible file under `public/` and `data/` |

A missing `jpyc.js` kills the start (`server.js` imports it): `bundle.mjs` and `stage.sh` copy it. So does a missing module of `/api/live` (`scripts/live.js` imports the AIS feed), which is why both scripts end by importing the server's modules from inside the bundle: a missing one stops the assembly instead. A full bundle is 408 files and about 60 MB. It has no `package.json` and no `node_modules`: the one package the live modules import,
`astronomy-engine`, is a dependency of the project, so Bun finds it in the `node_modules` above `bundle/`.

Two scripts assemble it, and they make byte-identical bundles from the same files (every file, `.br` and `.gz` included;
`test/railway-bundle.test.js` keeps their file lists equal):

- **`bundle.mjs`** from a checkout, with no git and no network: `bun run build && bun server/app/bundle.mjs` (`bun run build:railway`). Railway uses this one.
- **`stage.sh`** from a commit, for a bundle that is uploaded by hand: `server/app/stage.sh <commit> <dist dir> <bundle dir>`.

## Deploy from GitHub (Railway builds it)

`railway.json` makes Railway build and start the bundle straight from this repository (Railway's builder is Railpack):

| | |
|---|---|
| Build | `bun install --frozen-lockfile` (Railpack's own install step), then `bun run build:railway`: the app build, then `bundle.mjs`. About 2.5 minutes, nearly all of it brotli 11 on the data. |
| Start | `cd bundle && bun server.js`, listening on `$PORT` (Railway sets it; the default is 8080) |
| Health check | `GET /healthz` answers `ok` |
| Restarts | on failure, at most 10 times |
| Bun | `engines.bun` in `package.json` pins 1.3.14, the version the tests, the CI and the builds were checked with. Railpack reads it (its default is the newest Bun). |
| Variables | none are needed. Railway sets `PORT` and `RAILWAY_GIT_COMMIT_SHA`; the build stamp that a report carries (`scripts/anime/buildinfo.js`) uses the latter when there is no `.git`. Optional: `JPYC_WARM=0` (no background refresh of the shops' lists), `JPYC_EC_BASE` (a stand-in for JPYC EC, for rehearsals), `AIS_INGEST_TOKEN` (switches on `POST /api/live/ais`; a long random value, never committed), `AISSTREAM_API_KEY` and `AIS_UDP_PORT` (more sources of ship positions). **Never set `JPYC_DEV`** (it lifts the switch of `data/shops/jpyc.json` for the proxy). |

### Try it the way Railway does

```sh
git clone https://github.com/ss251/kesenmemento-v2.git && cd kesenmemento-v2
bun install --frozen-lockfile
bun run build:railway                 # build + bundle/, about 2.5 minutes
PORT=8080 bun run start               # cd bundle && bun server.js
```

| Request | Answer |
|---|---|
| `GET /healthz` | 200 `ok` |
| `GET /` | 200, the page; its chunk name is the one in `dist/index.html` |
| `GET /data/anime/layout.json` with `Accept-Encoding: br` | 200, `content-encoding: br`, `vary: accept-encoding`, 1.9 MB (gzip 2.5 MB; without the header 10.7 MB) |
| `GET /api/live` | 200 JSON (`origins` say `live`, or `sample` / `cache` when a feed fails) |
| `GET /api/jpyc`, `/api/jpyc/shops/<slug>/products` | **404** while no shop is switched on in `data/shops/jpyc.json` (the server prints `jpyc: off (…)` at start and never asks the platform) |
| `POST` to anything but `/api/live/ais` | 405 |
| `POST /api/live/ais` without `AIS_INGEST_TOKEN` set, or without the right bearer token | 404 |
| `GET /data/anime/layout.json.br`, `/.env`, `/data/../server.js` | 404 (the siblings are served only through `Accept-Encoding`; nothing outside the two roots) |

### Connect a service to the repository

1. In the Railway dashboard open the project, then the service, then **Settings**, **Service Source**.
2. **Connect Repo**, choose `ss251/kesenmemento-v2`, and set the branch to `main`. A push to that branch now builds and deploys.
3. Leave the build and start fields of the dashboard as they are: `railway.json` overrides them for these deployments and does
   not rewrite the dashboard's values. Optionally turn on **Wait for CI**, so that a push deploys only after this repository's
   GitHub Actions workflow (test, build, gitleaks) has passed.
4. Check the first deployment as in "Checks" below.

What changes: **every push to `main` deploys.** The repository is the only source of truth, so keep it releasable: nothing
unfinished on `main`, and no feature switched on by accident (`data/shops/jpyc.json`, `CONTRIB_DEFAULT_ON`).

To roll back, open the service's **Deployments** list and roll back to the previous good deployment: Railway restores its image
and variables at once. To stop deploys on push, **Disable** the autodeploy of the trigger in the service settings (or disconnect
the repository), and go back to the upload below.

## Deploy a local bundle (the earlier way, and the way back)

1. Build in a clean checkout of the commit: `bun install --frozen-lockfile`, `bun test`, `bun run build`.
2. Assemble the bundle: `server/app/stage.sh <commit> <dist dir> <bundle dir>` (the folder may start as a copy of the live
   bundle; `--checksum` and `--delete` make the copy match the commit). A bundle uploaded by hand also needs its manifest, because
   Railway reads `package.json` to find Bun and to install `astronomy-engine`: `cp server/app/upload/{package.json,bun.lock,.gitignore} <bundle dir>/`.
3. Probe it before uploading (see "Checks").
4. Upload it: `cd <bundle dir> && railway up --detach --service <service>`.

To roll back, upload the previous bundle again (or roll back in the dashboard).

## Checks

After either deploy, about 40 s later:

- `/healthz` and `/` return 200; the chunk hash in `/` matches `dist/index.html`;
- `/data/anime/layout.json` with `Accept-Encoding: br` answers with `content-encoding: br`;
- `/api/jpyc` follows `data/shops/jpyc.json`, whose demo shop ships switched off (`"enabled": false`): the server prints
  `jpyc: off (…)` at start and `curl -s -D- localhost:$PORT/api/jpyc/shops/otameshi/products | head -20` gives **404**
  (`not_found`). With a shop switched on it prints `jpyc: on for <slugs>` and the same request gives 200, `application/json`,
  `"ok":true` and no `wallet` (the server asks JPYC EC for each switched-on shop at start and every 4 minutes, so
  `x-jpyc-cache` is normally `hit`). `.../shops/nobody/products` gives 404 and a POST gives 405 either way. The whole
  recipe and the expected answers: [docs/jpyc/README.md](../../docs/jpyc/README.md);
- on a phone emulation: `tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/phonemem.mjs --url http://127.0.0.1:$PORT/ --start`
  expects no crash, 0 errors and at most 240 MB of texture.
