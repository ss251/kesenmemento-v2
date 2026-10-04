# Architecture

Kesennuma Living City (v4: the v3 anime engine, made accurate and explorable) is a static web app with a small local
server. Bun bundles the browser code into `dist/`. When the page loads, the browser builds the city from precomputed
layout data, and then streams street-level detail in tiles around the player. `scripts/serve.js` serves the page, the
data and one live endpoint.

The engineering contract for module authors is [anime/BUILDER-GUIDE.md](anime/BUILDER-GUIDE.md). This page explains
how the parts fit together.

```
GSI tiles (raw/tiles, cached)   OSM extract (raw/osm, ODbL)    JMA + 気仙沼漁協 pages (fetched live, cached in data/cache/live)
      │  scripts/build-data.js        │  enrich/fetch-osm.js              │  scripts/live.js  (src/server/live.js re-exports it)
      ▼                               ▼                                   ▼
data/terrain, data/ortho,      data/anime/enrich.json          GET /api/live  ──►  life/live.js  ──►  chip, weather, boats
data/buildings, landmarks.json + sources.json                             ▲
      │  scripts/anime/*  (deterministic; build-layout.js folds enrich)   │ scripts/serve.js (127.0.0.1)
      ▼                                                                   │
data/anime/layout.json, grids.bin, landcover_*.png, trees.json, explore.json ──┴──►  world/layout.js  ──►  world modules
```

## 1. The engine (`src/anime/core/`)

The engine is ported from Sakuragaoka Station (Kenton-GMI, MIT) and runs on three.js 0.186.1. The ported files keep
their credit headers, and the licence is at `src/anime/LICENSE-sakuragaoka-station`.

| File | Role |
|---|---|
| `renderer.js` | The render pipeline. A normal and depth pre-pass feeds an MSAA HDR colour pass, followed by bloom and a composite step. The composite draws colour-aware outlines and applies grading, light leak and vignette. `render(..., out)` can also draw into a render target, which the tiny planet uses. |
| `sky.js` | The painted sky dome, cumulus clouds, stars, the sun and hemisphere lights, and the time-of-day palette (`setHours`, `setTime`). `keyLight()` keeps the real sun azimuth but never lets the shadow-casting light drop below 13° while the sun is up, because at 16:30 on Oct 10 the sun is only 5.8° high. The cumulus heaps come in two tiers (low heaps at 2–6.5°, high ones at 11–23°), and each frame the sky fits them to the picture: `update()` passes the top edge of the frame (`uFrame`), and a heap that would cross it shrinks toward its base and fades out, so no drone frame slices a cloud. Rain raises the cover to overcast, which hides the stars and the moon. The 06:30 morning also drives a low-lying mist, a height fog in the composite pass (`renderer.js`, `uMist`), and a paler sheen on the water. |
| `materials.js` | `ctx.mat.toon / decal / emissive / glass / foliage`, all cel materials. They are cached by their arguments, so equal materials batch together. At night, glass reflects a night sky and thins out. |
| `ctx.js` | Builds the `ctx` object that every module receives: `kit`, `geo`, `wires`, `physics`, `tex`, `rng`, `shared` uniforms, `services`, `addStatic` / `add`, `onUpdate`. |
| `batch.js`, `batch2.js` | Static batching. After every module has built, static meshes are merged by material into cells: 400 m near the inner bay and 2,000 m beyond (`BATCH` in `main.js`). Coarse cells won because the renderer is limited by draw calls. `renderer.js` then skips whole cells by distance each frame (beyond the outline range in the pre-pass, fogged out in the colour pass, and beyond 3.5 / 6 km on low / medium). |
| `player.js`, `physics.js` | Walking and flying: pointer-lock look, WASD, run, jump, fly, the touch pad's stick / look / jump / fly / land (`attachPad`; `player.touchMove` is kept as a getter), and colliders against walk boxes and the terrain. The sea is a wall on foot: `physics.standable()` refuses a step onto the sea, in front of a quay face, or onto the low strip at a hard shore unless a deck (walk box) covers it, and the player slides along the edge. |
| `season.js` | `ctx.shared.uSeason` and `patchSnow()`, which puts winter snow on every surface that faces up. [v5:fix1] `?season=early` (`PRESETS.early`): 早春 without snow, bare broadleaf and dormant tan turf, the look of the Google Earth 2026-03-11 imagery for side-by-side comparisons (`uSeason.extra`: snow, dry). The default autumn keeps the 紅葉 tint to about 2 % of the crowns. |
| `planet.js` | The tiny planet. It renders six 96° views (3° overlap on every side) through the real pipeline without vignette, light leak or bloom, with one fog density and one shadow box for all six, and folds them into a slowly turning stereographic world. The fold adds the only vignette. |
| `textures.js`, `geo.js`, `audio.js` | Canvas textures (signage and Japanese text), shared geometry, and the WebAudio base. |

`src/anime/main.js` starts the app. It loads the fonts, then builds the world modules in the order **environment,
water, town, harbor, landmarks, life, explore**, then builds the wires, batches the static meshes and compiles the shaders. On every frame
it runs `viewTune()`, which scales the near plane, the outline range, the shadow box and the fog with the camera's
height above the ground. It also exposes the test hooks `__bench`, `__sim`, `__simTo`, `__camSpec` and `__planet`.

**Coordinates.** Units are metres, with +X east, −Z north and +Y up (T.P. metres; the sea surface is y = 0). The ENU
origin is 38.9060 N, 141.5750 E, and `x = (lon − 141.575)·86744`, `z = −(lat − 38.906)·111014`.

## 2. How the layout is derived from real data

Everything a module places comes from `src/anime/world/layout.js` (V3-SPEC section 3). It loads precomputed files from
`data/anime/`. These files are built by deterministic scripts; the pure maths is in `scripts/anime/derive.js` and is
tested in `test/v3-layout.test.js`.

1. **Tiles.** GSI 地理院タイル are cached under `raw/tiles/` (gitignored): `dem5a_png` and `dem_png` (elevation),
   `seamlessphoto` (aerial photo) and `optimal_bvmap-v1` (vector tiles). `scripts/build-data.js` turns them into
   `data/terrain/{core,city}.f32` (a 3.7 m and an 8 m DEM), `data/ortho/{core,city}.jpg` and `data/buildings/*`
   (every footprint with its height, roads, coast and rail).
2. **Grids** (`build-grids.js`). A 4 m core grid nested in a 16 m city grid holds the height, the signed distance to
   the shore and the water class. `heightAt`, `isWater`, `shoreDist` and `groundAt` sample these grids.
3. **Layout** (`vt.js`, then `build-layout.js`). This step produces `data/anime/layout.json`:
   - **Zones.** The hero zone is a circle of radius 380 m centred on (180, −20), covering the inner-bay ring. The mid
     zone is a circle of radius 1,100 m centred on (250, 150). The far zone is the whole city bbox.
   - **Lots.** There is one lot per GSI footprint, 50,826 in total (506 hero, 2,756 mid).
     - Each lot gets a minimum-area oriented box. Its frontage is the side that faces the nearest road.
     - Its `kind` comes from the GSI code, the area, the zone, the distance to the shore and the road class. Big boxes
       near the quays become warehouses or factories, small ones become houses, and boxes on main streets get shop
       ground floors.
     - Storeys are the height divided by about 2.9 m.
     - The roof colour is the aerial-photo colour inside the footprint, white-balanced and then snapped to an anime
       roof palette. The wall colour is a pastel chosen by the lot's seed. [v5:fix2] With the enrichment, a lot's aerial
       roof colour goes through a 3x3 colour matrix plus offset fitted by least squares from the GSI roof colours of the
       ~1,100 override lots to the colours read on Google Earth 2026-03-11 (`fitRoofTransform` in `enrich/fold.js`, spread
       x1.3 round its mean), with no anime lift or saturation boost: the photo-coloured roofs of the 12 cells averaged
       RGB (160, 166, 167) with 681 teal-blue roofs, and now (151, 146, 148) with 149, beside (148, 146, 149) for the
       Earth-checked ones.
   - **Roads.** There are 14,473 roads. Hero and mid road widths are measured from the GSI road-edge lines (RdEdg);
     the rest use the nominal width of their `rnkWidth` class.
   - **Other features.** The layout also holds the quays and seawalls (coastline pieces of at most 24 m), 455
     utility-pole runs 28 to 36 m apart, and named spots (浮見堂, the torii, Pier 7, the fish market, the bridges, the
     安波山 lookout, vending and cat spots).
   - **Tour.** The tour stops come from `data/landmarks.json`, whose positions were checked against the aerial photo
     and the DEM.
4. **Enrichment from real sources** [v4] (`scripts/anime/enrich/`). `build-enrich.js` writes `data/anime/enrich.json`
   and `data/anime/sources.json`, and `build-layout.js` folds them in (`enrich/fold.js`):
   - `fetch-osm.js` + `osm.js`: the OpenStreetMap extract of the whole city bbox (Overpass mirror), parsed into
     building tags, POIs, land use, rivers, roads, signals and crossings.
   - `anno.js`: GSI Anno place and facility names, each facility text paired with its map symbol.
   - `aerial.js`: per footprint, on the GSI photo (z18 core, z17 elsewhere): registration of the displaced roof, roof
     colour, shape class and ridge, rooftop equipment, vegetation. `eval.js` scores the classes against OSM
     `roof:shape` and hand labels (97 % precision).
   - `match.js`: OSM outlines to GSI footprints (overlap), POIs and facilities to the building under or next to them.
   - `fold.js`: the precedence OSM > aerial > GSI facility > derived, recorded per value in `lot.src`; road names from
     the OSM way that runs along each GSI road; river widths from the GSI water areas; disaster names filtered.
   - [v4:overrides] the last fold step: every `data/anime/overrides/*.json`, in file-name order, patches, removes or
     adds lots, land use, roads and props for one cell with values read from newer references (the author's photos,
     Google Earth 2026-03-11 via `tools/anime/earth-ref.mjs`), after `LOT_FIX`; the provenance is `lot.src.ovr` /
     `ovrWhy`. Schema and workflow: [anime/OVERRIDES.md](anime/OVERRIDES.md).
   The layout gains `landuse`, `rivers`, `places` (search and labels), `signals`, `crossings`, `bridges`, `rail` and
   `credits`; `src/anime/world/layout.js` exports them (`LANDUSE`, `RIVERS`, `PLACES`, `findPlaces`, ...).
5. **Land cover and trees** (`build-landcover.js`, `build-trees.js`). The aerial photo is classified into forest,
   grass, paved and sand and painted in the anime ground palette, and trees are scattered where the camera gets close.
   [v5:fix2] In the core town (ground up to 8 m within 1.5 km of (250, 150)) grey ground far from buildings stays town
   ground (it was turned into grass and field, which painted lawns over the cleared post-2011 lots and car parks). Every
   footprint is town ground, and every car park, apron, plaza, gravel lot and building site is paving or town ground;
   the override woods (`forest`, `cedar`) and clear-cuts (`felled`) are painted too. On the hills of cells c1, c2 and c5
   above 30 m, canopy with a hue over 95 or a value under 0.45 is cedar (Earth 2026: dark 杉 plantations), and 88 % of the
   trees on cedar cover are cedar cones. The classes are smoothed by a 5x5 majority pass and feathered by 1 px.

6. **Street data for the far core** (`build-explore.js`). `data/anime/explore.json` restores what `layout.json` drops
   for the far part of the core: every GSI road centre-line with its measured width (alleys included, OSM names folded
   in) and every far lot's real footprint with its frontage. Explore applies it at load.

Everything is seeded by lot and road ids, so the same data always gives the same town. Lot ids have the form
`z/x/y/featureIndex` in the GSI vector tiles.

**Rebuilding the data.** The committed files in `data/anime/` are enough to run the app. To rebuild them from the
cached sources (`raw/tiles`, `raw/osm`; neither is committed), run these steps in this order. Run the longer ones
through `tools/anime/gate.sh run` on the shared machine.

```sh
env -u NODE_OPTIONS bun run scripts/anime/vt.js                   # decode the GSI vector tiles -> data/cache/anime/vt.json
env -u NODE_OPTIONS bun run scripts/anime/build-grids.js          # terrain, shore and water grids -> grids.bin
env -u NODE_OPTIONS bun run scripts/anime/enrich/fetch-osm.js     # once: the OSM extract -> raw/osm/overpass.json
env -u NODE_OPTIONS bun run scripts/anime/enrich/build-enrich.js  # OSM + Anno + aerial per footprint -> enrich.json, sources.json
env -u NODE_OPTIONS bun run scripts/anime/build-layout.js         # zones, lots, roads, places, ... + data/anime/overrides -> layout.json ([v5] --overrides none: without them)
env -u NODE_OPTIONS bun run scripts/anime/build-landcover.js      # land cover and forest masks -> landcover_*.png, forest_*.png
env -u NODE_OPTIONS bun run scripts/anime/build-trees.js          # the 3D trees -> trees.json
env -u NODE_OPTIONS bun run scripts/anime/build-explore.js        # far-core streets and footprints -> explore.json
env -u NODE_OPTIONS bun run scripts/anime/enrich/eval.js          # optional: roof-shape precision against OSM and hand labels
```

Every step is deterministic: the same inputs give byte-identical outputs, and `bun test` checks the layout contract,
the enrichment and the determinism. On 2026-09-30 (20:10Z) the whole chain was re-run from the caches. Every output came back
byte-identical except `enrich.json` and `layout.json`: the enrichment rules changed after those two files were last
built. The rebuild changes 5 lots and 2 of the 3,524 places, and it gave 気仙沼仲町郵便局 the English name
"Katsuya" (a shop POI in the same footprint); that bug is fixed in `enrich/build-enrich.js` ([v4:overrides]: a POI's
`name:en` only when the name is the POI's). Re-run on 2026-10-01 with the override step: every output is byte-identical
except `enrich.json` and `layout.json`, where the GSI-facility-first naming rule of v4:polish1 still differs from the
shipped files: `src.name` reads `osm` for names that come from the GSI facility (5 hero / mid lots, 8 far lots),
気仙沼市シルバー人材センター loses its name, and three government offices take the GSI facility name over the OSM one.
The shipped `enrich.json` and `layout.json` were kept; with them the layout step is byte-identical. `sources.json` is
regenerated by `build-enrich.js`, and it matched apart from the edited text.

## 3. World modules (`src/anime/world/`)

Each module exports `build(ctx)`. `scripts/anime/registry.js` generates `world/registry.js`, the static list of
modules that Bun can bundle. Modules share state through `ctx.services`; a consumer always has a fallback in case a
service is missing.

| Module | What it builds | Services it publishes |
|---|---|---|
| `environment` | The terrain skin, land-cover colours, painted forest crowns (the photo's dark cedar greens), 25,000 3D trees ([v4:polish3] 1.5 km round the hero zone and on 亀山, a 6-8 triangle crown beyond 380 m) and the far mountains. [v4:polish3] Near the eye (< ~60 m up) the land cover fades to painted grass and paving detail. Beyond the mid grid, a fine 5 m patch sits round each tour walk spot (かなえ大橋, 大島). Its edge follows the city grid's own triangles, so there is no crack, and it replaces the flat 70 m triangles. Hand-placed dressing (`scatter.js`) adds trees below the 安波山 lookout, and grass tufts, rocks, shrubs and trees at the two bridge spots. Beyond the city bbox, land blends into the sea over kilometres, with no wall at the border. | `environment` (`groundAt`, `surfaceAt`, `terrainMaterial`, `trees`) |
| `water` | The whole bay: depth bands, shore foam, glints, the sky mirror after sunset, night light columns | `water` |
| `town/` | Hero buildings from Sakura's house kit (houses, 64 fictional shops with interiors, apartment blocks, warehouses), simplified mid buildings, instanced far buildings, streets, markings, poles and wires, parking, gardens and props. [v4] Buildings on their real footprints (`wings.js`), real names on public facilities and shops (`realnames.js`), OSM land use on the ground (`landuse.js`), rivers and bridges (`rivers.js`), traffic signals, crossings and route shields (`signals.js`) | `town`, `street` (walk paths), `poles` |
| `harbor/` | Quays; the 魚町 flap-gate seawall and its apron; 70 moored boats in rows; boats arriving from the live list; the fish market's four parts and 海の市; かなえ大橋 and 大島大橋 at their measured places; 神明崎 (浮見海道, 浮見堂, 恵比寿像, 五十鈴神社, 猪狩神社, the grove); 南町 (PIER7, 迎, 結, 拓, the stepped garden, the pontoons and ファンタジー); 安波山's summit and terraces; gulls. Measured geometry: `harbor/real.js` [v4:landmarks-A]; [v4:polish1] 風待ち地区's 角星店舗 and 武山米店 (`kazemachi.js`), 気仙沼プラザホテル on the 柏崎 bluff with its lift tower (`plaza.js`), the 養殖筏 only where the aerial photo shows them | `harbor` (`boats`, `rows`, `market.workSpots`, `bollards`, `setArrivals`, …) |
| `landmarks/` | [v4:landmarks-B] The civic landmarks on their OSM outlines at true dimensions (`landmarks/sites.js`, the reference sheets in `docs/anime/landmarks/`): 気仙沼市役所 (本庁舎, 第二庁舎 (the 1909 wooden school), 第三庁舎, 東分庁舎, ワン・テン庁舎) and the new city hall under construction on the old hospital site at 田中 (frame, scaffold, crane, the site's bare earth and hoarding); JR/BRT 気仙沼駅 (the five-arch arcade, the swordfish roof mural, the BRT and island platforms, the lighthouse welcome tower, the fish sculptures, an enterable waiting hall with ticket gates) and the rails of the whole city (OSM); 駅前プラザ; リアス・アーク美術館; 気仙沼市立病院 with its heliport and 大友病院; every building of eight school grounds (gyms with barrel roofs, the stair cylinder of 気仙沼小, seven pools, gates with name plates); 少林寺 and 清護寺 (入母屋), 気仙沼ハリストス正教会, the 一景島神社 grove and small shrines with torii; 大島: 亀山テラス360° (the monorail with its moving cars, both stations, terraces and sofas, café, rest houses) and 浦の浜 (the welcome terminal, the cruise pier, the basin jetty); the far-zone land use around them (town/landuse.js on polygons outside town's disc). The lots they replace are tagged `landmark` by `build-layout.js`. | `landmarks` (`built`, `places` (17 JA/EN places), `ms`), `monorail` (`pos(t)`, `at(s)`) |
| `life/` | Time presets and transitions, one light registry for lamps, windows and boat and bridge lights; 33 people and 7 cats; rain and wet streets; sound; live data; the tour camera; seasons; the UI | `time`, `lights`, `arrivals`, `life` |
| `explore/` | [v4:explore] The explorable core: streamed 100 m tiles around the player over the whole z18 core (town's simplified buildings for the mid zone at load; far streets, poles and wires, and far buildings on their real footprints within ~600 m; every lot at hero-kit detail within ~100 m on foot or in the car), all packed into a few `BatchedMesh` pools with per-level colliders ([v4:polish3] rebuilt through one FIFO across the pools, a change such as an L0 swap drawn whole in one frame); a kei car on the real roads (C); the minimap and the full map (N); place search in JA and EN over every real name (/); POI labels that fade with distance; 27 more real places plus landmarks-B's 17 in the tour (51 stops in all); walk-in interiors (the fish market C hall's gallery over the landing floor, 男山本店's shop; the station hall is landmarks-B's). Street data: `data/anime/explore.json` (`scripts/anime/build-explore.js`). Guide: BUILDER-GUIDE.md section 14. | `explore` (`stream`, `net`, `drive`, `search`, `labels`, `ui`, `places`, `interiors`), `farTown` (from town: hide / show far instances) |

### How exploring works (walk, drive, fly, search, map, interiors)

| Feature | Where | How it works |
|---|---|---|
| Walk | `core/player.js`, `core/physics.js` | WASD with pointer-lock look, run, jump. Colliders come from town (walk boxes), the landmarks, explore's streamed tiles (tagged per level, `physics.tag` / `removeTag`) and the terrain. `physics.standable()` makes the sea, quay faces and river channels walls. |
| Fly | `core/player.js` (`FLY` 25 m/s, `FLY_RUN` 70 m/s) | F toggles. There are no colliders in flight, E/Space climb and Q/Ctrl descend, and dt is capped at 0.1 s. |
| Drive | `explore/drive.js`, `explore/roadnet.js` | C toggles, handled on `keydown` so a short press is never lost. A kinematic bicycle model (`carStep`, 40 km/h, 60 with Shift) runs on the road network built from the GSI centre-lines and their widths. `clampToRoad` keeps the car on the carriageway, and lane assist steers to the left lane when you let go. Town colliders and the sea stop the car; bridge decks carry it. It has a chase camera, lamps at dusk and an engine hum. |
| Streaming | `explore/tiles.js`, `stream.js`, `sbatch.js` | A 100 m tile grid over the core. Base: simplified mid buildings. L1 (within 620 / 500 / 360 m on high / medium / low): far streets, poles and wires, and far lots on their real footprints. L0 (within 95 / 75 / 45 m, on foot or in the car): every lot with the hero kit. Builds are generators with a per-frame budget, nearest tile first, packed into `BatchedMesh` pools that are rebuilt through one FIFO. |
| Search | `explore/search.js` | Covers the 3,524 `PLACES` of the layout plus the stops. It folds NFKC, case and katakana to hiragana, and ranks exact matches before prefixes before substrings, nearer first. [v5:fix1] A bare 町名 (八日町) ranks its 丁目 / 地区 areas above the shops that carry the name. Kind words in JA or EN (病院, "sushi") list the nearest places of that kind. |
| Map and minimap | `explore/basemap.js`, `explore/ui.js` | A base map painted once from the same data as the world: the sea and rivers (GSI grids), a hillshade (DEM), OSM land use, every footprint and every road at its measured width (2 m/px over the core, 8 m/px over the city; 3 and 12 on low). The minimap is north up with your heading and view cone and names the 町名 and road. The full map (N) pans, zooms and goes to a clicked place or street. It shows `layout.credits`. |
| Labels | `explore/labels.js` | POI pills that fade with distance, never overlap, hide behind terrain and buildings, and stay inside the viewport and off the minimap. |
| Places and tour | `explore/places.js`, `life/tour.js` | `tour.add` appends the 17 civic landmarks and 27 places in town to the 7 built-in stops. Each gets a computed drone framing and a walk spot with a clear sight line (`walkFraming`, or a hand-set spot in `WALK_SET`). |
| Interiors | `explore/interiors.js`, `landmarks/station.js` | The fish market C hall (visitors' entrance, lobby, stair, 2F information hall, gallery over the landing floor), 男山本店's shop, and the station waiting hall. `interiors.at(x, y, z)` tells the labels to hide inside. |

`_ground` and `_houses` are development placeholders and are not in the production build order. Their docs:
[anime/TOWN.md](anime/TOWN.md) and the file headers in `harbor/` and `life/`.

**UI** (`src/anime/ui/`). The life module mounts the UI (`hud.js`, `style.js`, `photo.js`). Every string is in
`data/i18n.json` (JA and EN) and is bundled at build time. Photo mode renders a 16:9 frame off-screen through the full
pipeline at 3840×2160 and saves it as a PNG.

**Touch pad** (`ui/touchpad.js`, `ui/touchpad-style.js`, strings in `data/ui-touch-i18n.json`; guide and API in
[MOBILE-CONTROLS.md](MOBILE-CONTROLS.md)). [v7:pad] On a phone (`(pointer: coarse)`, a first touch, or `?touch=1`) the pad owns the
canvas's touches: a floating analog stick on the left (dead zone, eased, RUN past 85 %), a smoothed drag look on the right,
and a context action cluster in an arc (walk, fly and drive sets; `pad.registerMode(name, { buttons, stick })` and
`pad.setMode(name)` for the sail mode). `main.js` creates it (`ctx.pad`, `window.__pad`); `Player.attachPad` consumes
`pad.move`, `pad.takeLook()` and the jump / fly / land events; `explore/drive.js` reads `pad.move`, the brake and boost buttons and
turns the touch look into the chase camera's orbit. The pad measures the dock, the places strip, the credit line and the
speed chip and lifts itself clear of them; `body.klc-pad` re-seats a few panels. `test/mobile-pad.test.js` covers the pure parts
and `test/mobile-pad.e2e.test.js` (`KLC_E2E=1`, through `tools/anime/gate.sh chrome`) the real touches at 390×844 and 844×390;
`tools/anime/pad-shots.mjs` makes the screenshots in `docs/shots/mobile/`.

## 4. Live layer

`scripts/live.js` builds one JSON state for today. It covers the JMA AMeDAS observation at 気仙沼, the Miyagi
forecast, the JMA tide table for 大船渡, the sun and moon, and the 気仙沼漁協 入船情報 pages, which are in Shift_JIS
and parsed by `scripts/live/arrivals.js`.

- **Fetching.** Each source has its own TTL. The last good response is kept in `data/cache/live/`.
- **Origin labels.** Every block is labelled `live`, `cache` or `fixture`. Fixture blocks are pages saved on
  2026-09-29 in `scripts/live/fixtures/`, and they are flagged `sample: true`.
- **Serving.** `scripts/serve.js` serves the state at `/api/live` through `src/server/live.js`. `?fixtures=1` forces
  the sample.
- **In the browser.** `life/live.js` polls every 10 minutes and falls back to `data/live/sample.json`. The UI shows
  ライブ or サンプル. Weather drives the clouds and rain, and harbor turns the arrivals into boats: pole-and-line boats
  become かつお boats, longline and seine boats become まぐろ boats, and saury boats become さんま boats.
- **Tide.** The tide is served but is not yet applied to the rendered sea level.

## Tools

Run every browser tool through `tools/anime/gate.sh chrome …` on the shared machine. The gate waits for a safe load and
holds the single headless-Chrome lock. The tools launch Chrome with the real GPU (`--use-angle=metal`, never
`--disable-gpu`).

| Command | Purpose |
|---|---|
| `bun tools/anime/qa3.mjs --port P [--build 1] [--dist <dir>] [--phone 1] [--bench 1] [--out <prefix>]` | The end-to-end QA: builds the bundle (into `dist/`, or a private `--dist` directory), serves it on port P and drives the production page like a visitor. It fails on any console error and saves a screenshot per step. It checks all seven modules, the HUD, every time preset and season, rain, the tiny planet, photo mode, walking (the player stays on land and on the promenade deck) and fly mode. **Every stop's walk spot** (all 51) must stand on land, outside every building, with no single colour over 45 % of the frame and no more than 25 % of a 16 × 9 ray grid closer than 6 m (`pipeline.nearShare`); every extra place must be in view (aim within 25°, pre-pass depth at least min(0.8 d, d − r − 2)). After the loop, 気仙沼簡易裁判所 must draw as before, with every stream pool intact (`sb.validate()`). **The explore flow:** search in JA and EN, the full map and its © OpenStreetMap credit clear of the minimap, streaming in the far core (kit tiles with colliders), walking into buildings (blocked), the car on the roads, the three interiors and the labels. `--phone 1` adds the 390×844 low-tier layout, and `--bench 1` prints per-tier frame times. `--noexplore` skips the explore flow. 147 checks with `--phone 1`. |
| `bun tools/anime/accuracy.mjs --port P [--region core\|ortho] [--res 0.5] [--tile 500] [--out dist/qa4] [--tag t] [--lmshots 1] [--nobuild]` | The accuracy audit (V3-SPEC section 10). It builds a private bundle in `dist/anime-P`, then renders the app straight down with an orthographic camera: 1000 × 1000 px tiles at 0.5 m/px, first in colour at 12:00 with a clear sky, then as a float height pass and a road pass. It compares them with the GSI footprints (building IoU), the GSI z18 aerial photo with each roof's relief offset (roof CIEDE2000), OSM highways (road precision and recall) and the landmark sheets (positions, heights). It writes `accuracy[_tag].json`, `side_*.jpg` (photo, render, coverage diff), `mosaic_*.jpg` over the whole region, and `lm_*.jpg` with `--lmshots 1` ([v5] `--saveraw 1` also keeps each tile's full render and photo crop; `--tiles "x,z;..."` audits chosen tiles). It takes about 2 minutes. |
| `bun tools/anime/earth-ref.mjs --cell C --port P [--views top,o0,...] [--noearth] [--noapp] [--out raw/ref/earth/<dir>]` | [v4:overrides] Reference captures of a cell (`data/anime/cells.json`) from Google Earth web and the app from the same cameras, into `raw/ref/earth/<cell>/` or `--out` (under `raw/` only; never committed or shipped): pairs, a top view annotated with the lot numbers, road ids and a 20 m ENU grid, the registration on the GSI photo, and the per-lot roof ΔE (Earth vs app). [anime/OVERRIDES.md](anime/OVERRIDES.md). [v5] `tools/anime/earth-de.mjs` scores a before / after pair with one registration. The 12-cell sweep's before / after metrics and images: `docs/shots/v5_cells/` and its README. |
| `bun tools/anime/shot.mjs --port P [--only a,b] --cams "hero;walk;tour:market;tourwalk:lm-station;x,y,z>lx,ly,lz" [--hours 16.5] [--q high] [--w 1920 --h 1080] [--eval js] --out shots/x/y` | Screenshots of chosen cameras (and, with `--only`, chosen modules). It waits up to 60 s for explore's stops, settles the stream per camera, and exits non-zero when a camera spec does not resolve. `--eval` runs page JS after each camera is set (for example to open the map). Add `--bench 30` for frame times. |
| `bun scripts/render/life-shots.js --cams "yoru@hero;yuyake@ltour:kanae"` | Screenshots with a time preset per camera. It also takes `--ui 1`, `--weather rain` and `--photo 0.5`. |
| `bun scripts/render/stills.js --size 1080 [--out dist/qa3]` | The wow stills, written to `dist/renders/` (or `--out`). `--size 4k` is the product size. |
| `bun scripts/render/film.js --preview` | The deterministic 30 s film: 960×540 for `--preview`, 3840×2160 by default. Frames go to `raw/film/`; ffmpeg writes the result to `dist/film/`. |
| `bun tools/anime/photo-align.mjs --area A --port P [--only 0808] [--tag before]` | [v6:survey] Renders the app from each photo's solved camera (`data/survey/A/cameras.json`: intrinsics as a projection matrix, principal point included), undistorts the photo, and writes edge overlays and pairs to `docs/shots/v6_survey/A/` (gitignored: they embed the photos) and the edge chamfer (px) to `data/survey/A/chamfer.json`. |
| `bun tools/anime/survey-diff.mjs --area A --port P` | [v6:survey] The app's named features (`window.__features(A)`, registered by the area modules) against the photo survey (`data/survey/A/features.json`), in metres and in survey sigmas → `data/survey/A/diff.json`. The surveys: `docs/anime/survey/market.md`, `docs/anime/survey/minami.md` (tools under `tools/survey/`, Python in `raw/survey/.venv`). |
| `bun test test/v6-rebuild-minami.test.js` | [v6:rebuild] The south shore's survey constants (`harbor/minami5.js` `CAGE6`, `BLEACH6`, `WINCH6`, `RINGS6`, `WALK6`, `ANCHOR`, `MUK6`, `PIER7_6`) against `data/survey/minami/features.json` without a browser: every plaza feature within max(0.25 m, its 1-sigma); the before / after tables are in `docs/anime/survey/minami.md`. |
| `bun tools/anime/check.mjs <module>` | Triangle and texture budgets, headless, with no GPU. |
| `bun tools/anime/serve.mjs --port P [--watch]` | Dev server with rebuild on change. |
| `bun tools/anime/debug/walkprobe.mjs`, `stream-repro.mjs` | Probes used to find walk spots with a clear view (renderer depth) and to reproduce streaming faults. |

Tests: `bun test` runs 29 files and 474 tests (2026-09-30 19:55Z: 473 pass, 1 skip, 0 fail, in about 27 s). The v3 files
(`test/v3-*.test.js`) cover layout derivation, determinism, no `Math.random`, no real brands in the fictional shop
catalogue, the budgets, the live parsers, i18n completeness and the harbour routes staying on water. The v4 files cover
the enrichment and its sources (`v4-data`: the OSM parser, matching, the fold precedence, the ODbL credit on screen),
town accuracy (`v4-town-accuracy`: footprints, real names, land use, rivers, signals), the landmarks at true size
(`v4-landmarks-a`, `v4-landmarks-b`), the explorable core (`v4-explore`: tiles, stream batching, the road network, the
car, search, walk framings), and the three polish rounds (`v4-polish1` to `v4-polish3`).

## Performance

These frame times were measured under the machine gate at background priority, at 1920×1080 on the high tier
(`dist/qa3/bench_report.json`; single 30-frame samples vary by up to ±40 % between runs): drone 12 to 17 ms,
promenade 11 to 14, night 11 to 14, whole city 13 to 17 and fish market 17 to 19. A frame has about 560 to 1,060 draw
calls and 9 to 15 M triangles (summed over the pre-pass, shadow and colour passes). The live app ran at 52 fps at
1600×900. The medium tier is not reliably faster than high (same draw calls); low is 20 to 40 % faster.

Halving the resolution did not change the frame time, so the renderer is limited by CPU work per draw call. Further
gains would come from merging the remaining distinct materials: harbour night lamps, repeating textures and emissive
colours.

The medium and low tiers lower the pixel ratio, MSAA, the shadow map size and the hero radius; phones default to low.
On a portrait screen, the camera keeps about 64° across; the vertical FOV is capped at 88°. The hero stop then uses its own portrait drone pose (`FRAMES.hero.portrait` in `life/tour.js`).
The browser builds the city in about 20 s under the gate, of which town takes about 8 s, mostly drawing Japanese text
into canvas textures. Every shader is compiled at load, hidden meshes (season particles, night-only lights) and the
tiny planet's fold pass included, so the first season or planet toggle no longer hitches.

### v4 (integration, 2026-09-30)

All seven modules in one build. `qa3.mjs --phone 1` passed 98 of 98 checks on the production bundle, with no console
errors. The benchmarks could not be taken cleanly: another project's Blender renders and ffmpeg encodes shared the
machine, and the gate runs Chrome at background priority. At 1920×1080 on high the frames measured 38–81 ms
(`shots/v4int/bench_*`), and the live loop ran at 15 fps (10.8 fps in the streamed far core). Those numbers are not
comparable with v3's quiet-machine 12–17 ms. The draw calls are comparable: 1,124 on the hero drone (v3: about 700–840),
888 on the promenade, 1,142 at the market and 1,531 over the whole city, with 12–16 M triangles. They grew with the
harbour models, the civic landmarks and explore's BatchedMesh pools. The first thing to re-measure on a quiet machine is
the 60 fps target on high.

### v4 (final docs pass, 2026-09-30 20:00Z)

`qa3.mjs --bench 1 --phone 1` on the production bundle (145 of 145 checks then; 146 with the map-credit check),
1920×1080 under the gate (`nice 15`, `taskpolicy -b`), a moderately loaded machine (5-minute load about 4):

| View | High | Medium | Low | Draw calls (high) | Triangles (high) |
|---|---|---|---|---|---|
| Drone over the inner bay | 25.3 ms | 26.0 | 21.4 | 1,138 | 13.1 M |
| Promenade | 19.7 | 25.6 | 19.0 | 955 | 12.0 M |
| Fish market | 23.9 | 34.3 | 20.7 | 1,186 | 11.8 M |
| Night | 30.3 | 26.3 | 19.4 | 1,117 | 13.1 M |
| Whole city | 32.0 | 32.1 | 22.4 | 1,551 | 14.1 M |

The live loop ran at 14.8 fps at 1600×900 on high, and at 15.3 fps while walking the streamed far core (a second
run, with the map-credit check: 12.6 and 15.8 fps). Medium is
still no faster than high (the same draw calls); low is 5 to 35 % faster. The page was ready after 46 to 55 s; the
world modules took 20 to 27 s of it (town 10 to 15 s, harbour 3 to 4, explore 2.7, life 1.5 to 2, landmarks 1.4 to
1.6, environment 0.6 to 1.3, water 0.1 to 0.3). These are single samples on a shared machine, not the 60 fps
measurement, which still has to be taken on a quiet Mac.

## Legacy

`src/web/` is the v1/v2 app: a GIS viewer and photoreal tiles. It is kept for reference. `bun run scripts/build-web.js --v2`
builds it instead of v3; this was not re-run for v3, and it replaces the v3 `dist/index.html`. The v3 app does not use
the photoreal tiles. `scripts/serve.js` answers `/api/config` (the v2 tiles token) only when started with `--v2` (or
`KLC_APP=v2`), and `scripts/public-mirror.js` never passes that route, so a public link cannot hand out the token.
