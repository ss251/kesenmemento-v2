# Data sources, licences and attribution

This page lists everything the v3 app ships or fetches, where it comes from, under which terms, and how it is credited.

The app shows this short line on screen and in stills rendered with `?credit=1`. It lives in `data/i18n.json` under
`v3.attribution`:

> 出典：国土地理院, 気象庁, 気仙沼漁協 · Sakuragaoka Station (MIT) by Kenton-GMI

The full credit lines below are required wherever the project is published, for example on a web page, in a press
kit or in a video description.

## 国土地理院 (GSI): terrain, aerial photo, buildings, roads, coast

| Tile set (地理院タイル) | Used for | Files in the repo |
|---|---|---|
| 標高タイル `dem5a_png` (DEM5A, z15) and `dem_png` (DEM10B, z14) | Terrain height for the core (3.7 m) and city (8 m) grids | `data/terrain/*.f32`, `data/anime/grids.*` |
| 全国最新写真（シームレス） `seamlessphoto` (z15 city, z17–18 core) | Roof colours, land-cover classification, forest placement | `data/ortho/*.jpg`, `data/anime/landcover_*.png`, `data/anime/forest_*.png` |
| 最適化ベクトルタイル `optimal_bvmap-v1` (z16) | Building footprints (BldA), road centre-lines (RdCL) and road edges (RdEdg), coastline (Cstline), water areas (WA), rail (RailCL), vegetation symbols | `data/buildings/*`, `data/anime/layout.json`, `data/anime/trees.json` |

- **Source:** https://cyberjapandata.gsi.go.jp/xyz/ (tile list: https://maps.gsi.go.jp/development/ichiran.html). The
  scripts fetch the tiles once and keep them in `raw/tiles/`, which is not committed.
- **Terms:** 国土地理院コンテンツ利用規約
  (https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html). These terms apply 公共データ利用規約（第1.0版）
  (PDL1.0), which allows commercial use and derivatives with attribution. Processed data must also say that it was
  processed, and it must not be presented as if GSI made it.
- **Full credit line to use:**
  > 出典：国土地理院（地理院タイル）。標高タイル、全国最新写真（シームレス）、最適化ベクトルタイルを加工して作成。
- The seamless photo page asks for an extra GRUS credit only for tiles inside a small area near 20° N, 136° E. That
  area is outside this project's bbox (38.83–38.99 N, 141.50–141.70 E), so the extra credit does not apply.
- **What we derived:** every building in the app stands on a real GSI footprint, but its storeys, roof shape, wall
  colour and shop use are *derived* by our scripts (`scripts/anime/derive.js`) and are not survey data. Roof colours
  are photo samples snapped to an anime palette.

## 気象庁 (JMA): weather and tide

| Data | URL (fetched by `scripts/live/*`) | Used for |
|---|---|---|
| AMeDAS latest observation, station 気仙沼 | `https://www.jma.go.jp/bosai/amedas/data/map/<time>.json` (plus `amedastable.json`, `latest_time.txt`) | The weather chip (sky, ℃) and live clouds and rain in the scene |
| Miyagi forecast | `https://www.jma.go.jp/bosai/forecast/data/forecast/040000.json` | Forecast text, rain probability |
| Tide table, 大船渡 (潮位表) | `https://www.data.jma.go.jp/kaiyou/data/db/tide/suisan/txt/<year>/OF.txt` | `/api/live` tide block (the rendered sea level does not follow it yet) |

- **Terms:** 気象庁ホームページについて
  (https://www.jma.go.jp/jma/kishou/info/coment.html), which also applies PDL1.0. Credit is required, and processed
  data must say it was processed.
- **Credit line:** 出典：気象庁ホームページ（アメダス・天気予報・潮位表）を加工して作成.
- The `bosai` JSON files are the data behind the JMA website, not a documented API. They may change without notice. If
  they do, the server falls back to the last good copy and then to the saved sample (see below).
- Polling is polite. The server fetches each source at most once per TTL and sends the user agent
  `KesennumaLivingCity/2 (civic 3D demo for Kesennuma City; polls <= every 10 min)`.

## 気仙沼漁協 (気仙沼漁業協同組合): today's arrivals

- **Source:** the co-op's public mobile 入船情報 pages
  `http://www.kesennuma-gyokyou.or.jp/html/mobile/{katuo,haenawa,sanma,makiami}`, which are in Shift_JIS and parsed
  by `scripts/live/arrivals.js`.
- **What the app shows:** vessel name, expected time, fishery type, catch and tonnage, in the arrivals panel and as
  labels on the boats that glide in.
- **Terms:** the pages do not state an open licence. The app uses them as factual public notices, credits the co-op
  on screen, and polls at most every 10 minutes.
- **Before a public launch, ask the co-op for permission** or, better, for an official feed. This is listed in
  [PLAN.md](PLAN.md#what-it-needs-from-the-city).
- **Credit line:** 入船情報：気仙沼漁業協同組合.

## Saved samples (offline and fallback)

- **Pages:** `scripts/live/fixtures/` holds the JMA and co-op pages saved on 2026-09-29.
- **Browser fallback:** `data/live/sample.json` is the fallback the browser loads when `/api/live` is not reachable.
- **Labelling:** anything built from these files is flagged `sample: true`, and the UI labels it **サンプル**. Nothing
  from a fixture is ever labelled live. Regenerate the browser fallback with `bun run scripts/live/snapshot.js`.

## Place facts

- **Tour stops:** `data/landmarks.json` places each stop from the aerial photo and the DEM. Its `verified` field
  records how each position was checked.
- **Bridge dimensions** come from the pages below. The deck heights (Kanae 34 m, Oshima 30 m) are estimates.
  - かなえ大橋: 360 m main span, 1,344 m total, inverted-Y pylons about 100 m tall
    ([Wikipedia](https://ja.wikipedia.org/wiki/%E6%B0%97%E4%BB%99%E6%B2%BC%E6%B9%BE%E6%A8%AA%E6%96%AD%E6%A9%8B),
    [宮城まるごと探訪](https://www.miyagi-kankou.or.jp/theme/detail.php?id=21171)).
  - 大島大橋: 297 m arch span, 356 m total
    ([Wikipedia](https://ja.wikipedia.org/wiki/%E6%B0%97%E4%BB%99%E6%B2%BC%E5%A4%A7%E5%B3%B6%E5%A4%A7%E6%A9%8B),
    [宮城県](https://www.pref.miyagi.jp/site/oshimakakyozigyo/kakyouhontai.html)).
- **Shops and companies:** every shop and company name in the town is fictional (`src/anime/world/town/names.js`).
  `test/v3-town.test.js` checks the names against a blocklist of real brands. Only real *place* names appear as
  signage: 気仙沼, 魚市場, 浮見堂, 五十鈴神社, and town names such as 八日町.

## Code, engine and fonts

| Item | Licence | Where |
|---|---|---|
| Sakuragaoka Station by Kenton-GMI (engine, materials, renderer, player, house kit, characters, street furniture, page design) | MIT | `src/anime/LICENSE-sakuragaoka-station`. Every ported or vendored file keeps a credit header. |
| three.js 0.186.1 | MIT | runtime, bundled |
| `@mapbox/vector-tile` 2.0.5, `pbf` 4.0.2 | BSD-3-Clause | build scripts only |
| `earcut` 3.2.4 | ISC | build scripts only |
| `sharp` 0.35.5 | Apache-2.0 | build scripts only |
| Noto Sans JP, Noto Serif JP, Zen Maru Gothic, Yusei Magic, Yuji Syuku | SIL Open Font License 1.1 | loaded from Google Fonts at runtime (`src/anime/index.html`) |
| This project's own code | MIT (`package.json`) | the repo has no root LICENSE file yet. The build copies the Sakuragaoka Station and three.js licence texts to `dist/licenses/`, and the in-app credit links to them. |

## Not used by v3

- `raw/ref/` holds the look references: Sakura Crossing and Sakuragaoka Station frames, the promo sheet, and Google
  Earth screenshots of Kesennuma. They are only for comparison. `raw/` is not committed, and nothing from these
  images is copied into the app.
- The v1/v2 app (`src/web/`) used photoreal 3D tiles through a user-supplied Cesium ion or Google token. v3 needs no
  token and does not call `/api/config`; the server only serves that route with `--v2`, and the public mirror refuses
  it. If a token was ever served through a public link, rotate it unless it is URL-restricted.
