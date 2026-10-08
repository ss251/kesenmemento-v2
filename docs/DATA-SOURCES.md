# Data sources, licences and attribution

This page lists everything the app ships or fetches, where it comes from, under which terms, and how it is credited.

The app shows this short line at the bottom of the screen (with a link to the licence texts) and in stills rendered
with `?credit=1`. It lives in `data/i18n.json` under `v3.attribution` (JA and EN), and `test/v4-data.test.js` checks
that every language keeps © OpenStreetMap contributors:

> © OpenStreetMap contributors · 出典：国土地理院、気象庁、気仙沼漁協 · Sakuragaoka Station (MIT) by Kenton-GMI

The full map (N) draws OpenStreetMap and GSI data, so it carries its own credit in its bottom-left corner, from
`layout.credits`:

> © OpenStreetMap contributors (ODbL); 出典：国土地理院（地理院タイル）を加工して作成

[v4] The machine-readable list of every source, its licence and its credit line is `data/anime/sources.json`
(written by `scripts/anime/enrich/build-enrich.js` from `scripts/anime/enrich/sources.js`). Keep this page and that
file in step.

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
- **What we derived:** every building in the app stands on a real GSI footprint. Since v4 each lot records where
  each value came from in `lot.src` (`osm`, `aerial`, `gsi`, `landmark` or `derived`): real values from OSM and the
  aerial photo win, and the rest (most storeys, many roof shapes, all pastel wall colours without an OSM colour) are
  *derived* by `scripts/anime/derive.js` and are not survey data. Measured roof colours are the photo median, white
  balanced and lightly graded (`lot.roof.photo` keeps the photo value).

## OpenStreetMap: names, uses, land use, rivers, road attributes [v4]

- **Source:** an Overpass API extract of the whole city bbox (38.83–38.99 N, 141.50–141.70 E): every way and relation
  and every tagged node, with inline geometry. `scripts/anime/enrich/fetch-osm.js` tries the mirrors
  `overpass.kumi.systems`, `overpass.private.coffee` and `overpass-api.de` in that order; the extract used on
  2026-09-30 came from kumi.systems with the OSM database state of 2026-05-06 (46,634 elements). It is kept in
  `raw/osm/overpass.json` (not committed). If every mirror fails, cut the Geofabrik Tohoku extract to the bbox with
  osmium and save it in the same Overpass JSON form.
- **Licence:** Open Database License 1.0 (https://opendatacommons.org/licenses/odbl/1-0/). `data/anime/enrich.json`,
  `data/anime/layout.json` and `data/anime/explore.json` are derived databases; the app, the maps and every render built
  from them are produced works.
  - A produced work (the app, a screenshot, a still, the film) needs the credit line below where people see it.
  - The derived databases are share-alike: if they are published or shipped to the public (they are, inside the app's
    `/data/`), they are offered under the ODbL too. Anyone may take them under the same terms. The rest of the project
    (code, GSI-derived data) keeps its own terms.
- **Credit line (required on screen and wherever renders are shown):** `© OpenStreetMap contributors`, linking to
  https://www.openstreetmap.org/copyright where a link is possible. The on-screen line above includes it.
- **What we take:** building `building:levels`, `height`, `roof:shape`, `roof:colour`, `building:colour`, names and
  amenity / shop / tourism tags (matched to the GSI footprints: 33,750 of 54,723 footprints have an OSM outline);
  named shops and amenities mapped as points inside a building; land use (parks, fields, cemeteries, schoolyards,
  parking, forest, sport, beaches); rivers and streams with their names (大川, 神山川, 鹿折川, 面瀬川, ...); road names,
  refs, lanes, one-way and speed limits; traffic signals and crossings; rail; named bridges.
- Names that the exclusion list of the filter covers are never shown, so the app shows Kesennuma as it lives
  today: `scripts/anime/enrich/fold.js` (`SENSITIVE`) filters them from lot names, places, roads, rivers and land use.

## 国土地理院 Anno (注記) and the aerial photo, per building [v4]

- **GSI Anno** (the annotation layer of the same `optimal_bvmap-v1` tiles): real place names (町名, mountains, capes,
  islands) and public facility names (市役所, 郵便局, schools, hospitals, shrines and temples). The meaning of each map
  symbol code comes from GSI's own style file
  (https://github.com/gsi-cyberjapan/optimal_bvmap/blob/main/style/std.json), saved in
  `scripts/anime/enrich/gsi-anno-codes.json`. Each facility text is paired with the nearest symbol of its kind.
- **Aerial photo per footprint** (`scripts/anime/enrich/aerial.js`, GSI seamlessphoto z18 in the core, z17
  elsewhere): the roof colour (median of the facets), the roof shape class and ridge direction (facet brightness
  models), rooftop equipment and vegetation cover. The classes are checked against OSM `roof:shape` and hand labels by
  `scripts/anime/enrich/eval.js`: 35 of 36 calls right (97 % precision). The photo is analysed only; it is not shipped
  in the anime app.

## How the town uses them, and how accuracy is measured [v4:town-accuracy]

- **Footprints:** hero and mid buildings stand on the real GSI polygon, not its bounding box: flat roofs on the
  polygon itself, pitched roofs on a rectilinear decomposition (`src/anime/world/town/wings.js`). GSI outlines follow
  the roof edge on the photo, so walls stand under the eaves (inset by the overhang).
- **River beds:** the DEM over inland water is an interpolated lid (大川 read 3.3-4.8 m inside the channel against
  0.5-2 m banks). `scripts/anime/build-grids.js` carves every inland-water cell 2 m under its lowest bank (never below
  -1.5 m); `town/rivers.js` draws the water 1.2 m under the bank, aligned with the GSI water area.
- **Trees:** `scripts/anime/build-trees.js` read the forest mask as one byte per pixel from a 3-channel PNG, which
  scattered trees over the wrong pixels (207 on the 気仙沼小 / 中学校 playing fields). It now reads channel 0 per pixel
  and keeps OSM pitches, car parks, fields and building sites clear.
- **Audit truth** (`tools/anime/accuracy.mjs`): GSI footprints (building IoU), the GSI z18 photo in
  `data/ortho/core.jpg` with the per-roof relief offset of `aerial.js` (roof CIEDE2000), OpenStreetMap highways
  (road overlap; an independent source from the GSI centre lines the streets are built on) and
  `docs/anime/landmarks/landmarks.json` (landmark positions), plus OSM `height` / `building:levels` and the sheets for
  heights. Results: `dist/qa4/accuracy.json`; the latest figures are in the README's Accuracy section. The truth data
  are independent of what they check only in part: the buildings stand on the same GSI footprints the IoU is measured
  against, so the IoU measures how faithfully the town is built on them (walls under the eaves, wings, landmarks
  replacing lots), not the footprints themselves. The roads are built on GSI and checked against OSM, which is
  independent.

## Census small areas, address names and derived readings [sys:21, sys:22, r2:13, r3:2]

- **Small areas (町丁).** `data/anime/areas-estat.json` holds the 令和2年国勢調査 small-area boundaries of 気仙沼市, one polygon per
  町丁, projected to the layout's metres and simplified to 5 m (`scripts/anime/build-areas-estat.js`). Source: 政府統計の総合窓口
  (e-Stat) 境界データ, <https://www.e-stat.go.jp/>. 出典：政府統計の総合窓口(e-Stat)の境界データを加工して作成. The site's terms
  (政府標準利用規約) are compatible with CC BY 4.0.
- **Address names (町丁名).** `data/anime/areas-gsi.json` is a 25 m grid of the town-block name that the 国土地理院 reverse
  geocoder returns, for the arrival toast (`scripts/anime/build-areas-gsi.js`, from `test/fixtures/gsi_revgeo_50m.json`). It is
  factual address data, not imagery. 出典：国土地理院.
- **Roof colours read on Google Earth.** `data/anime/earth-roofs.json` keeps one derived colour per building (the median of the
  60 % core of its roof polygon in a top view, imagery dated 2026-03-11): values only, never imagery. They fit the GSI to Earth
  colour transform (`fitRoofTransform` in `scripts/anime/enrich/fold.js`) and are the held-out reference of its test. The capture
  tools that wrote the readings are not part of this repository.
- **Vegetation flags.** `data/anime/green-flags.json` lists the buildings whose interior on the GSI aerial photo is dark vegetation
  green (`scripts/anime/enrich/green.js`): an advisory list derived from the photo. 出典：国土地理院.

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
- Polling is polite. The server fetches each source at most once per TTL and sends a user agent that names the
  project and its polling interval (`scripts/live/http.js`).

## 気仙沼漁協 (気仙沼漁業協同組合): today's arrivals

- **Source:** the co-op's public mobile 入船情報 pages
  `http://www.kesennuma-gyokyou.or.jp/html/mobile/{katuo,haenawa,sanma,makiami}`, which are in Shift_JIS and parsed
  by `scripts/live/arrivals.js`.
- **What the app shows:** vessel name, expected time, fishery type, catch and tonnage, in the arrivals panel and as
  labels on the boats that glide in.
- **Terms:** the pages do not state an open licence. The app uses them as factual public notices, credits the co-op
  on screen, and polls at most every 10 minutes per source.
- **An official feed** or the co-op's explicit agreement would be a better basis than reading the public mobile pages.
  Anyone who runs a busy public copy should ask the co-op first. This is listed in
  [PLAN.md](PLAN.md#what-would-help).
- **Credit line:** 入船情報：気仙沼漁業協同組合.

## Saved samples (offline and fallback)

- **Pages:** `scripts/live/fixtures/` holds the JMA and co-op pages saved on 2026-09-29.
- **Browser fallback:** `data/live/sample.json` is the fallback the browser loads when `/api/live` is not reachable.
- **Labelling:** anything built from these files is flagged `sample: true`, and the UI labels it **サンプル**. Nothing
  from a fixture is ever labelled live. Regenerate the browser fallback with `bun run scripts/live/snapshot.js`.

## Reference pages and photos for landmarks and interiors [v4]

Each landmark has a reference sheet in `docs/anime/landmarks/` (`README.md` is the index, `AUDIT.md` the accuracy audit
of the sheets, `landmarks.json` the machine-readable reference points and heights). Every sheet lists its sources with
URLs. They are grouped in `data/anime/sources.json` as `landmark-refs`, `landmark-refs-b`, `explore-refs`,
`polish2-refs` and `polish3-refs`:

- **Official and engineering pages** give the dimensions: 気仙沼市 (the new city hall design summary, 亀山通信, the
  welcome terminal), the bridge designers and 宮城県 (かなえ大橋 and 大島大橋), the fish market's history and tour pages,
  文化遺産オンライン (the heritage shops of 魚町), and the tourism pages of kesennuma-kanko.jp.
- **Photos** from Wikimedia Commons and public tourism pages were used only as references for shape, colour and
  proportion. None is copied into the app.
- **The station's departure board** shows the next weekday departures from the 2026 JR East timetables (read on
  Yahoo!路線情報 and 駅探 on 2026-09-30). Only times and destinations are used.
- **On-site photos** (kept under `raw/`, not committed) of the inner-bay scale model displayed in PIER7 were compared
  with 浮見堂, 神明崎, PIER7 and 亀山. The photo surveys in `docs/anime/survey/` measure other on-site photos in the same
  way. The photos are not shipped; only the measured results (`data/survey/`) are.
- **café RST** (the ground floor of 迎, 南町海岸1-14) is redrawn from the project owner's own walk-through video of the room and the surveyed ANCHOR face
  (`docs/anime/interiors-cafe-rst.md`). No photograph or frame is copied; the sign boards carry no other company's mark. The shop agreed to be shown on 2026-10-07 (verbal;
  the written form is pending) and is credited 「協力：café RST」 in the room and in the interior's record.

Facts (dimensions, dates, positions) are cited from these pages; no text or image from them is shipped.

## Place facts

- **Tour stops:** `data/landmarks.json` places each stop from the aerial photo and the DEM. Its `verified` field
  records how each position was checked. The 44 more places (17 civic landmarks, 27 places in town) take their names
  and positions from OSM and GSI Anno, and the audit checks 15 landmark positions against `docs/anime/landmarks/landmarks.json`.
- **Bridge dimensions** come from the pages below. The deck heights (Kanae 34 m, Oshima 30 m) are estimates.
  - かなえ大橋: 360 m main span, 1,344 m total, inverted-Y pylons about 100 m tall
    ([Wikipedia](https://ja.wikipedia.org/wiki/%E6%B0%97%E4%BB%99%E6%B2%BC%E6%B9%BE%E6%A8%AA%E6%96%AD%E6%A9%8B),
    [宮城まるごと探訪](https://www.miyagi-kankou.or.jp/theme/detail.php?id=21171)).
  - 大島大橋: 297 m arch span, 356 m total
    ([Wikipedia](https://ja.wikipedia.org/wiki/%E6%B0%97%E4%BB%99%E6%B2%BC%E5%A4%A7%E5%B3%B6%E5%A4%A7%E6%A9%8B),
    [宮城県](https://www.pref.miyagi.jp/site/oshimakakyozigyo/kakyouhontai.html)).
- **Shops and companies:** a lot that OSM or GSI Anno names carries its real name in `lot.name` (with `lot.use`, e.g.
  `shop:seafood`), and its signs show that name (`src/anime/world/town/realnames.js`). Names of administrative
  buildings (共同化建物, 旧..., JV) and sensitive names (see above) are dropped. Every other shop takes a name
  from the town's fictional catalogue (`src/anime/world/town/names.js`), chosen for its trade;
  `test/v3-town.test.js` checks that catalogue against a blocklist of real brands.

## JPYC EC: shops and products that take JPYC [jpyc]

| Data | URL | Used for |
|---|---|---|
| Public read API (no key): `GET /api/v1/shops/{slug}/products`, `GET /api/v1/products/{id}` | `https://ec.jpyc-service.com/api/v1/…` (docs: https://github.com/Mameta29/jpyc-skill, OpenAPI `/api/v1/openapi.yaml`) | The 「JPYCで買えるお店」 sheet: a shop's product names, prices in JPYC, first photo, stock and sale status. Fetched only for the shops of `data/shops/jpyc.json`, through the production server's cache (`server/app/jpyc.js`, five minutes, no cookies, nothing about the visitor); the photos are shown from the platform's own image host and not copied. |
| Product pages, the shop page, the guide 「JPYCの入手方法」 | `https://ec.jpyc-service.com/shops/{shop}/products/{product}`, `/shops/{shop}`, `/blog/how-to-get-jpyc` | Links only (a new tab). The app takes no payment. |
| Google Maps search link | `https://www.google.com/maps/search/?api=1&query=…` | A link on a Kesennuma shop's card; no Google API, embed or content is used. |

JPYC EC is operated by MAMETA; JPYC is a registered trademark of JPYC Inc.; KesenMemento is not affiliated with either (the credit line in the app says so). The operator's permission to use the API and to
show the demo shop has **not been confirmed yet** (the questions to put to him are in [docs/jpyc/README.md](jpyc/README.md)); a real shop appears only with its owner's consent record in `data/shops/jpyc.json`, its alcohol only when the row declares the mail-order licence and the age check, and nothing at all appears in production until a shop is switched on (the demo shop ships with `"enabled": false`).
The recorded responses in `test/fixtures/jpyc/` come from the demo shop, which JPYC EC runs itself, with the wallet address redacted.

## Code, engine and fonts

| Item | Licence | Where |
|---|---|---|
| Sakuragaoka Station by Kenton-GMI (engine, materials, renderer, player, house kit, characters, street furniture, page design) | MIT | `src/anime/LICENSE-sakuragaoka-station`. Every ported or vendored file keeps a credit header. |
| three.js 0.186.1 | MIT | runtime, bundled |
| `@mapbox/vector-tile` 2.0.5, `pbf` 4.0.2 | BSD-3-Clause | build scripts only |
| `earcut` 3.2.4 | ISC | runtime (bundled) and build scripts |
| `sharp` 0.35.5 | Apache-2.0 | build scripts only |
| Noto Sans JP, Noto Serif JP, Zen Maru Gothic, Yusei Magic, Yuji Syuku | SIL Open Font License 1.1 | the HUD loads them from Google Fonts (`src/anime/index.html`). The title also self-hosts Zen Maru Gothic subsets and a Dela Gothic One subset; the logo is outlines only. The licence text is [THIRD-PARTY-NOTICES](../THIRD-PARTY-NOTICES). |
| This project's own code | MIT ([LICENSE](../LICENSE)) | The build copies the Sakuragaoka Station and three.js licence texts to `dist/licenses/`, and the in-app credit links to them. [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md) lists every dependency. |

## Not shipped

- `raw/ref/` holds the look references: Sakura Crossing and Sakuragaoka Station frames, the promo sheet, and Google
  Earth screenshots of Kesennuma. They are only for comparison. `raw/` is not committed, and nothing from these
  images is copied into the app.
- The app needs no API token or key, and the repository holds none. The earlier photoreal viewer, which used a
  user-supplied map-tile token, has been removed, and `scripts/serve.js` has no token route.
