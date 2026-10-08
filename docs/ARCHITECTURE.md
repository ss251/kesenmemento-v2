# Architecture

Kesennuma Living City is a static web app with a small local server. Bun bundles the browser code into `dist/`. When
the page loads, the browser builds the city from precomputed layout data, and then streams street-level detail in tiles
around the player. `scripts/serve.js` serves the page, the data and one live endpoint.

This page explains how the parts fit together. A world module exports `build(ctx)` and stays inside a triangle and
texture budget, which `bun tools/anime/check.mjs <module>` reports without a GPU.

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
| `audio-session.js` | [ui-c] iPhone sound. Sets `navigator.audioSession.type = 'playback'` before the AudioContext exists (the ring/silent switch no longer mutes the town; an older iOS gets a silent looping `<audio>` instead) and resumes a suspended or interrupted context from the next touch (`touchend`, `pointerup`, `click`, `keydown`), but not while muted or hidden. `audio.session` reports its stats. |
| `survive.js` | [ui-c] What the page does when the phone takes its WebGL context: `lossStep()` is the state machine (ok, lost, reloading, manual), `createLossGuard()` wires it to the canvas, the page's visibility and sessionStorage, `takeResume()` puts the camera, time of day and season back after the reload, `createLostCard()` is the 再読み込みします card. See [MOBILE-CONTROLS.md](MOBILE-CONTROLS.md#iphone-survival-and-the-dbg-strip). |

`src/anime/main.js` starts the app. It loads the fonts, then builds the world modules in the order **environment,
water, town, harbor, landmarks, life, ship, explore**, then builds the wires, batches the static meshes and compiles the shaders. On every frame
it runs `viewTune()`, which scales the near plane, the outline range, the shadow box and the fog with the camera's
height above the ground. It also exposes the test hooks `__bench`, `__sim`, `__simTo`, `__camSpec` and `__planet`, `__survive` (the context-loss guard), and with `?dbg=1` it mounts the phone diagnostics strip (`ui/dbg.js`, loaded by a dynamic import only then).

**Coordinates.** Units are metres, with +X east, −Z north and +Y up (T.P. metres; the sea surface is y = 0). The ENU
origin is 38.9060 N, 141.5750 E, and `x = (lon − 141.575)·86744`, `z = −(lat − 38.906)·111014`.

## 2. How the layout is derived from real data

Everything a module places comes from `src/anime/world/layout.js`. It loads precomputed files from
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
   - **Lots.** There is one lot per GSI footprint, about 50,800 in the shipped layout (495 hero, 2,760 mid, 47,570 far).
     - Each lot gets a minimum-area oriented box. Its frontage is the side that faces the nearest road.
     - Its `kind` comes from the GSI code, the area, the zone, the distance to the shore and the road class. Big boxes
       near the quays become warehouses or factories, small ones become houses, and boxes on main streets get shop
       ground floors.
     - Storeys are the height divided by about 2.9 m. [r2:2] [r2:4] A small derived footprint is not as tall as its kind: a GSI 3111 /
       3112 wall-less shed (普通無壁舎 / 堅ろう無壁舎: carports, eaves, lean-tos) under 100 m2 is one storey at the GSI eave
       height (3.0-3.8 m, shed roof) and flagged `lot.wallless`: `town/openshed.js` plans it as a mono-pitch roof slab on steel
       posts and `town/mid.js` / `industrial.js` draw that, no walls, ribs or windows (a far lot carries no flag; `walllessOf`
       recognises it as a derived warehouse of 4.5 m or less). A derived school, public or office lot under 25 m2 is 1 storey
       and at most 3.5 m, an apartment under 25 m2 at most 5.8 m, a factory under 100 m2 at most 6 m. The rules run after the
       kind's switch in `classifyLot` (no extra random draw) and not in the photo-survey box; override and OSM heights win.
     - The roof colour is the aerial-photo colour inside the footprint, white-balanced and then snapped to an anime
       roof palette. The wall colour is a pastel chosen by the lot's seed. [v5:fix2] With the enrichment, a lot's aerial
       roof colour goes through a 3x3 colour matrix plus offset fitted by least squares from the GSI roof colours of the
       ~1,100 override lots to the colours read on Google Earth 2026-03-11 (`fitRoofTransform` in `enrich/fold.js`, spread
       x1.3 round its mean), with no anime lift or saturation boost: the photo-coloured roofs of the 12 cells averaged
       RGB (160, 166, 167) with 681 teal-blue roofs, and now (151, 146, 148) with 149, beside (148, 146, 149) for the
       Earth-checked ones. [r2:13] That fit is replaced: the transform is now fitted in L*a*b* (with the roof shape as a
       feature: flat, shed, pitched) on **per-lot Earth readings**, `data/anime/earth-roofs.json` (2,820 lots of the cells,
       written by `tools/anime/earth-roofs.mjs` from the Earth top captures: derived colour values, never imagery), plus the
       override colours read raw from Earth (`src` starting `earth`) of lots without a reading. The c9 colours (the GSI colour
       shifted in Lab: circular), c7 and c3 (the GSI lightness lifted about 12 L*) never train it. The stored colour is the
       *paint* colour: Earth plus `RENDER_DL` in L* (flat 0, shed 0.5, pitched 3: the renderer shades a slope about 3 L*
       darker, and takes the 3.5 L* it adds to flat tops out in `town/flatroof.js`). Gate (test/sys-round2.test.js): held out
       (leave one 300 m area out) the median dE2000 is 8.5 or less and the median dL within 3 of the Earth reading.
   - **Roads.** There are 14,473 roads. Hero and mid road widths are measured from the GSI road-edge lines (RdEdg);
     the rest use the nominal width of their `rnkWidth` class.
   - **Other features.** The layout also holds the quays and seawalls (coastline pieces of at most 24 m), 453
     utility-pole runs 28 to 36 m apart, and named spots (浮見堂, the torii, Pier 7, the fish market, the bridges, the
     安波山 lookout, vending and cat spots).
   - **Tour.** The tour stops come from `data/landmarks.json`, whose positions were checked against the aerial photo
     and the DEM.
4. **Enrichment from real sources** [v4] (`scripts/anime/enrich/`). `build-enrich.js` writes `data/anime/enrich.json`
   and `data/anime/sources.json`, and `build-layout.js` folds them in (`enrich/fold.js`):
   - `fetch-osm.js` + `osm.js`: the OpenStreetMap extract of the whole city bbox (Overpass mirror), parsed into
     building tags, POIs, land use, rivers, roads, signals and crossings. [r3:18] overpass-api.de is tried first and a mirror whose `osm3s.timestamp_osm_base` is more than 3 days old is skipped (the
     kumi.systems mirror served 2026-05-06 on 2026-09-30); `sources.json` records `osmBase` and `osmFetched`. `highway=busway` is a road kind (the 気仙沼線BRT ways were re-tagged from
     service + bus_rapid_transit between the two extracts). `PRECINCT_FIX` clips a hill-sized place_of_worship polygon (北野神社) to its compound; `green.js` is the vegetation-green scan of the GSI photo
     (ghost-lot leads: `tools/anime/green-scan.mjs`, `data/anime/green-flags.json`, a build gate on recolours of flagged lots; docs/anime/OVERRIDES.md).
   - `anno.js`: GSI Anno place and facility names, each facility text paired with its map symbol.
   - `aerial.js`: per footprint, on the GSI photo (z18 core, z17 elsewhere): registration of the displaced roof, roof
     colour, shape class and ridge, rooftop equipment, vegetation. `eval.js` scores the classes against OSM
     `roof:shape` and hand labels (97 % precision).
   - `match.js`: OSM outlines to GSI footprints (overlap), POIs and facilities to the building under or next to them.
   - `fold.js`: the precedence OSM > aerial > GSI facility > derived, recorded per value in `lot.src`; road names from
     the OSM way that runs along each GSI road; river widths from the GSI water areas; sensitive names filtered (`SENSITIVE` in `fold.js`).
   - [v4:overrides] the last fold step: every `data/anime/overrides/*.json`, in file-name order, patches, removes or
     adds lots, land use, roads and props for one cell with values read from newer references (on-site photos,
     Google Earth 2026-03-11 via `tools/anime/earth-ref.mjs`), after `LOT_FIX`; the provenance is `lot.src.ovr` /
     `ovrWhy`. Schema and workflow: [anime/OVERRIDES.md](anime/OVERRIDES.md).
   The layout gains `landuse`, `rivers`, `places` (search and labels), `signals`, `crossings`, `bridges`, `rail` and
   `credits`; `src/anime/world/layout.js` exports them (`LANDUSE`, `RIVERS`, `PLACES`, `findPlaces`, ...).
5. **Land cover and trees** (`build-landcover.js`, `build-trees.js`). The aerial photo is classified into forest,
   grass, paved and sand and painted in the anime ground palette, and trees are scattered where the camera gets close.
   [v5:fix2] In the core town (ground up to 8 m within 1.5 km of (250, 150)) grey ground far from buildings stays town
   ground (it was turned into grass and field, which painted lawns over cleared lots and car parks). Every
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
cached sources (`raw/tiles`, `raw/osm`; neither is committed), run these steps in this order. The longer ones can run
through `tools/anime/gate.sh run`, which waits for a quiet machine (see [Tools](#tools)).

```sh
env -u NODE_OPTIONS bun run scripts/anime/vt.js                   # decode the GSI vector tiles -> data/cache/anime/vt.json
env -u NODE_OPTIONS bun run scripts/anime/build-grids.js          # terrain, shore and water grids -> grids.bin
env -u NODE_OPTIONS bun run scripts/anime/enrich/fetch-osm.js     # once: the OSM extract -> raw/osm/overpass.json
env -u NODE_OPTIONS bun run scripts/anime/enrich/build-enrich.js  # OSM + Anno + aerial per footprint -> enrich.json, sources.json
env -u NODE_OPTIONS bun tools/anime/earth-roofs.mjs --write      # [r2:13] optional, needs raw/ref/earth: per-lot Earth roof readings -> data/anime/earth-roofs.json (read by build-layout.js)
env -u NODE_OPTIONS bun run scripts/anime/build-layout.js         # zones, lots, roads, places, ... + data/anime/overrides -> layout.json ([v5] --overrides none: without them)
env -u NODE_OPTIONS bun run scripts/anime/build-landcover.js      # land cover and forest masks -> landcover_*.png, forest_*.png
env -u NODE_OPTIONS bun run scripts/anime/build-trees.js          # the 3D trees -> trees.json
env -u NODE_OPTIONS bun run scripts/anime/build-explore.js        # far-core streets and footprints -> explore.json
env -u NODE_OPTIONS bun run scripts/anime/enrich/eval.js          # optional: roof-shape precision against OSM and hand labels
```

Every step is deterministic: the same inputs give byte-identical outputs, and `bun test` checks the layout contract,
the enrichment and the determinism. A rebuild from the caches reproduces every output byte for byte except
`enrich.json` and `layout.json`: the enrichment rules (the GSI-facility-first naming of v4:polish1) have changed since
those two files were last built, so a rebuild differs in a handful of lots (`src.name` reads `osm` for names that come
from the GSI facility, and a few government offices take the GSI facility name over the OSM one). The shipped
`enrich.json` and `layout.json` were kept; with them the layout step is byte-identical. `sources.json` is regenerated
by `build-enrich.js`.

## 3. World modules (`src/anime/world/`)

Each module exports `build(ctx)`. `scripts/anime/registry.js` generates `world/registry.js`, the static list of
modules that Bun can bundle. Modules share state through `ctx.services`; a consumer always has a fallback in case a
service is missing.

| Module | What it builds | Services it publishes |
|---|---|---|
| `environment` | The terrain skin, land-cover colours, painted forest crowns (the photo's dark cedar greens), 25,000 3D trees ([v4:polish3] 1.5 km round the hero zone and on 亀山, a 6-8 triangle crown beyond 380 m) and the far mountains. [v4:polish3] Near the eye (< ~60 m up) the land cover fades to painted grass and paving detail. Beyond the mid grid, a fine 5 m patch sits round each tour walk spot (かなえ大橋, 大島). Its edge follows the city grid's own triangles, so there is no crack, and it replaces the flat 70 m triangles. Hand-placed dressing (`scatter.js`) adds trees below the 安波山 lookout, and grass tufts, rocks, shrubs and trees at the two bridge spots. Beyond the city bbox, land blends into the sea over kilometres, with no wall at the border. | `environment` (`groundAt`, `surfaceAt`, `terrainMaterial`, `trees`) |
| `water` | The whole bay: depth bands, shore foam, glints, the sky mirror after sunset, night light columns | `water` |
| `town/` | Hero buildings from the Sakuragaoka Station house kit (houses, 64 fictional shops with interiors, apartment blocks, warehouses), simplified mid buildings, instanced far buildings, streets, markings, poles and wires, parking, gardens and props. [v4] Buildings on their real footprints (`wings.js`), real names on public facilities and shops (`realnames.js`), OSM land use on the ground (`landuse.js`), rivers and bridges (`rivers.js`), traffic signals, crossings and route shields (`signals.js`) | `town`, `street` (walk paths), `poles` |
| `harbor/` | Quays; the 魚町 flap-gate seawall and its apron; 70 moored boats in rows; boats arriving from the live list; the fish market's four parts and 海の市; かなえ大橋 and 大島大橋 at their measured places; 神明崎 (浮見海道, 浮見堂, 恵比寿像, 五十鈴神社, 猪狩神社, the grove); 南町 (PIER7, 迎, 結, 拓, the stepped garden, the pontoons and ファンタジー); 安波山's summit and terraces; gulls. Measured geometry: `harbor/real.js` [v4:landmarks-A]; [v4:polish1] 風待ち地区's 角星店舗 and 武山米店 (`kazemachi.js`), 気仙沼プラザホテル on the 柏崎 bluff with its lift tower (`plaza.js`), the 養殖筏 only where the aerial photo shows them | `harbor` (`boats`, `rows`, `market.workSpots`, `bollards`, `setArrivals`, …) |
| `landmarks/` | [v4:landmarks-B] The civic landmarks on their OSM outlines at true dimensions (`landmarks/sites.js`, the reference sheets in `docs/anime/landmarks/`): 気仙沼市役所 (本庁舎, 第二庁舎 (the 1909 wooden school), 第三庁舎, 東分庁舎, ワン・テン庁舎) and the new city hall under construction on the old hospital site at 田中 (frame, scaffold, crane, the site's bare earth and hoarding); JR/BRT 気仙沼駅 (the five-arch arcade, the swordfish roof mural, the BRT and island platforms, the lighthouse welcome tower, the fish sculptures, an enterable waiting hall with ticket gates) and the rails of the whole city (OSM); 駅前プラザ; リアス・アーク美術館; 気仙沼市立病院 with its heliport and 大友病院; every building of eight school grounds (gyms with barrel roofs, the stair cylinder of 気仙沼小, seven pools, gates with name plates); 少林寺 and 清護寺 (入母屋), 気仙沼ハリストス正教会, the 一景島神社 grove and small shrines with torii; 大島: 亀山テラス360° (the monorail with its moving cars, both stations, terraces and sofas, café, rest houses) and 浦の浜 (the welcome terminal, the cruise pier, the basin jetty); the far-zone land use around them (town/landuse.js on polygons outside town's disc). The lots they replace are tagged `landmark` by `build-layout.js`. | `landmarks` (`built`, `places` (17 JA/EN places), `ms`), `monorail` (`pos(t)`, `at(s)`) |
| `life/` | Time presets and transitions, one light registry for lamps, windows and boat and bridge lights; 33 people and 7 cats; rain and wet streets; sound; live data; the tour camera; seasons; the UI | `time`, `lights`, `arrivals`, `life` |
| `ship/` | [ship] 第一昭福丸 (SHOFUKU MARU No.1, 7KFY), the 58.6 m Atlantic-bluefin longliner, at true scale, berthed at the コの字岸壁 east face (魚浜町); the livery is 臼福本店's (design by nendo), used with permission in the live demo and not included in this repository (without its data she is painted in a plain livery, which `?livery=fallback` or `KLC_NENDO=0` also forces); the sail mode (`explore/sail.js`) and the three acts (send-off and departure under かなえ大橋, the North Atlantic longline set and haul, the true catch chain via Las Palmas, a reefer and the Shimizu bonded weigh-in, the homecoming and the まぐろの日 card). Boarding: the places list, a chip near the quay, or `?ship=1&act=1\|2\|3`. Guide: `docs/ship/README.md`. | `ship` (`ship`, `sail`, `voyage`, `place`, `board`), `sail` |
| `explore/` | [v4:explore] The explorable core: streamed 100 m tiles around the player over the whole z18 core (town's simplified buildings for the mid zone at load; far streets, poles and wires, and far buildings on their real footprints within ~600 m; every lot at hero-kit detail within ~100 m on foot or in the car), all packed into a few `BatchedMesh` pools with per-level colliders ([v4:polish3] rebuilt through one FIFO across the pools, a change such as an L0 swap drawn whole in one frame); a kei car on the real roads (C); the minimap and the full map (N); place search in JA and EN over every real name (/); POI labels that fade with distance; 27 more real places plus landmarks-B's 17 in the tour (51 stops in all); walk-in interiors (the fish market C hall's gallery over the landing floor, 男山本店's shop, café RST on the 1F of 迎 behind the surveyed ANCHOR face; the station hall is landmarks-B's). Street data: `data/anime/explore.json` (`scripts/anime/build-explore.js`). | `explore` (`stream`, `net`, `drive`, `search`, `labels`, `ui`, `places`, `interiors`), `farTown` (from town: hide / show far instances) |

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
| Interiors | `explore/interiors.js`, `explore/cafe-rst.js`, `explore/cafe-rst-people.js`, `landmarks/station.js` | The fish market C hall (visitors' entrance, lobby, stair, 2F information hall, gallery over the landing floor), 男山本店's shop, [cafe-rst] café RST (the roastery café on 迎's 1F: the street door in the surveyed ANCHOR face with its stoop, the counter with the neon, the chalkboard menus and its coffee gear (siphons, pour-over, the soft-serve machine), the street windows, the lattice, the retail corner, the dining end, the steel deck, four people of the town's cast kit; credited 協力: café RST, consent record in the module; `harbor/cafe-front.js` shares the face and its openings with the exterior, `layout.js` has a ground pad under the room; [docs/anime/interiors-cafe-rst.md](anime/interiors-cafe-rst.md)), and the station waiting hall. `interiors.at(x, y, z)` tells the labels to hide inside. |

`_ground` and `_houses` are development placeholders and are not in the production build order. Their docs:
[anime/TOWN.md](anime/TOWN.md) and the file headers in `harbor/` and `life/`.

**UI** (`src/anime/ui/`). The life module mounts the UI (`hud.js`, `style.js`, `photo.js`). Every string is in
`data/i18n.json` (JA and EN) and is bundled at build time. Photo mode renders a 16:9 frame off-screen through the full
pipeline at 3840×2160 and saves it as a PNG (on a phone: 1920 px on the long side at the screen's aspect, a card and the
share sheet; `ui/photo-share.js`, the UI round notes (ui-c2, not included)). The HUD builds its DOM with `render()` only for the first mount, a language
change and a change in the number of tour stops (explore adds its places after the HUD mounts); every click, key, time
or tour event goes through `syncState()`, which writes the state into the nodes that exist (attributes and text, only where
the value changed), so a clicked button is the same element after its click and its CSS transition runs. `hud.syncState()` is
public next to `hud.render()`: code that changes something the HUD shows (the planet, the sound, the labels) can call it.
A movement key, a press on the canvas or a touch ends a flight to a place at once (`tour.skip`, never `tour.stop`, which freezes the camera in
mid-air): a quarter-second glide when the camera is near its destination, a dip to the sky's colour when it is far. `ui/veil.js` holds the veil
(`ctx.veil.cut(fn)`: fade in, run `fn` when the browser says the layer is opaque, fade out; opacity only, under the HUD) and `interruptFlight`, the
one rule the HUD and the touch pad share (never the auto tour; a second request for the same gesture is left alone, so the cut is made once).
The live chip says what is wrong with the feed (no weather block, a feed that never answered, old rows after a failed refresh labelled
`キャッシュ HH:MM`) and is 34 px tall in every state.
Notes: the UI round notes (ui-a, not included), the UI round notes (ui-a2, not included).
Motion and press (`ui/style.js`, `ui/touchpad-style.js`, `world/explore/ui.js`, `ui/ship.js`, `world/explore/storypins.js`): one set of tokens on `:root`
(`--ease-out`, `--dur-press` 140 ms, `--dur-fast`, `--dur-enter` / `--dur-exit`, `--dur-sheet` / `--dur-sheet-exit`, `--shift`, `--pop-scale`; `--ring-ink` / `--ring-halo`
for the focus ring; `--accent-fill` for a fill that carries white text), used by every stylesheet. Every HUD, explore and ship button scales to 0.97 on `:active` (the
pad's to 0.95; list rows press by background), every `:hover` rule is inside `@media (hover: hover) and (pointer: fine)`, the focus ring is navy between two white bands, and
on a portrait phone the ☰ menu, the two sheets and the credits take touches on their padding and enter with `@starting-style` and leave with
`transition-behavior: allow-discrete` (a menu 220 / 140 ms from 0.95, a sheet 280 / 200 ms from 24 px below; no scrim). Notes: the UI round notes (ui-b2, not included).

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
[integrate] The merged app: the ship's `sail` mode (`world/ship/padmode.js`) registers 停止 / 自動操船 / 4× / 町へ戻る and follows the
voyage (`setMode('sail')` while it runs; the pad is suppressed in every beat that is not at the helm); `sail.js` reads the pad's stick and
takes its look through `player.lookSink`. On a portrait phone with the pad the HUD folds down to one top bar (time and weather chip, search,
☰ menu with language / season / sound / planet / hide), the mode chip, a small minimap and two bottom pills that open the places strip and the
time dock as bottom sheets (`ui/hud.js`, `ui/touchpad-style.js`); modal panels (menu, sheets, arrivals, search, the full map) hide the pad with
`pad.suppress`. `test/ship-pad.test.js`, `test/phone-hud.test.js`, `test/ship-pad.e2e.test.js`; screenshots `docs/shots/integrate/`
(`tools/anime/integrate-shots.mjs`).

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

### Static deploy (a Railway-style static server)

`scripts/serve.js` is the reference for any host: `/` and the hashed bundle come from `dist/` (`scripts/build-web.js`),
`/data/...` from the project's `data/`, `/fixtures/...` from `src/web/fixtures`, and `/vendor/...` from the vendored
assets. A static host (one process serving one directory, as on Railway) needs the same tree: a publish root with
`dist/*` at its top and `data/` copied to `data/` beside it. Copy `data/` whole: the app fetches its JSON at run time, and
the bundle holds none of it. The ship's livery data (`data/ship/shofukumaru1/*nendo*.json`) is not part of this
repository; the app fetches it at run time when it is present and otherwise paints 第一昭福丸 in the plain livery.
`scripts/public-mirror.js` is a read-only allow-list proxy (GET and HEAD only, no writes and no source maps) for sharing
a local server.

## Tools

Run the browser tools through `tools/anime/gate.sh chrome …` (macOS). The gate waits until the machine is quiet (a
5-minute load of at most 14 and at least 25 % free memory), holds a single headless-Chrome lock, runs the command at low
priority and exports `KLC_GATE=1`, which `tools/anime/cdp.mjs` requires before it starts Chrome. `tools/anime/gate.sh run …`
does the same without the browser lock, for builds and long tests. The tools launch Chrome with the real GPU
(`--use-angle=metal`, never `--disable-gpu`).

| Command | Purpose |
|---|---|
| `bun tools/anime/ui-c-check.mjs [--port 9410] [--steps dbg,survive,flight] [--out DIR]` | [ui-c] The browser checks of the iPhone-survival and flight work, one step per row: the `?dbg=1` strip against the page's own numbers (desktop and an iPhone-shaped page), WebGL context loss on the phone tier to a card, a reload, the pose back and a working frame loop, a touch resuming a suspended AudioContext, and the flight (a pick moves the camera more than 20 m in 100 ms, no whip, retarget, `skip()`, the auto tour's length). A script, not a bun:test file (Bun 1.3.14's test runner closes `Bun.spawn` stderr pipes, so `cdp.mjs launch()` cannot start Chrome inside `bun test`). |
| `bun tools/anime/ui-c2-check.mjs [--port 9410] [--steps card,photocard,photo,load,load-async] [--out DIR] [--label base]` | [ui-c2] The browser checks of the photo and loading work, one step per row: the intro card's height across 17 viewports x 5 font stacks x 3 labels, the photo card's geometry on static pages, the phone-tier photo (size, field of view, the `klc-pose` chunk, the card, the share sheet, the macOS footprint of the Chrome tree sampled and held), and cold loads sampled from navigation start (card height, reveal, labels, bar, one `explore.json`, a screencast proof that the bar moves while the thread is blocked). Run from a worktree of main with `--label base` for the before numbers. |
| `bun tools/anime/flight-probe.mjs [--base REV] [--out numbers.json]` | [ui-c] No browser: flies the real stops with `tour.js` at a base revision (default `2ec3250`, before the flight rework) and with the working tree at 1/60 s and prints the before and after numbers (metres in 100 ms and 500 ms, seconds, peak speed, yaw per frame, steepest pitch, retarget, `skip()`). |
| `tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/cafe-rst-shots.mjs --port P --out DIR [--set door,day,night,phone,ref] [--nobuild]` | [cafe-rst] The café RST screenshots: the phone page at the street door with the 入る button, three views inside at noon, one at night, the phone layout inside (with 出る), and portrait renders at the reference video's own cameras (t = 29, 38, 44 s) for the side-by-side with the frames (the frames stay outside git). [anime/interiors-cafe-rst.md](anime/interiors-cafe-rst.md). |
| `tools/anime/gate.sh run env -u NODE_OPTIONS bun tools/anime/cafe-rst-wk.mjs --out DIR [--set desktop,phone,ref,winter] [--port P] [--nobuild]` | [cafe-rst] The café RST pictures in Safari's engine: a WKWebView session (`tools/perf/wk`, no Chrome and no Chrome lock) renders the shot-mode page on the Mac's GPU: the counter, dining end, windows, street front, close-ups of the people, a night counter, the phone tier (390 x 844, `?q=phone`), the reference video's cameras, and the winter check (snow must stay off the room's surfaces). Canvas only (no HUD). |
| `tools/anime/gate.sh chrome --fg env -u NODE_OPTIONS bun tools/anime/cafe-rst-perf.mjs --config desktop\|retina\|phone [--secs 20] [--out dir]` | [cafe-rst] Frame pacing inside café RST (the counter turning, the street door) with `?perf=1` and `tools/perf/stats.mjs`: interval p50 / p95 / p99, hitches, CPU / GPU ms, calls, triangles. Only the second machine's numbers (real GPU) mean anything; `--fg` is required (the gate's default priority puts Chrome on the efficiency cores). |
| `bun tools/anime/qa3.mjs --port P [--build 1] [--dist <dir>] [--phone 1] [--bench 1] [--out <prefix>]` | The end-to-end QA: builds the bundle (into `dist/`, or a private `--dist` directory), serves it on port P and drives the production page like a visitor. It fails on any console error and saves a screenshot per step. It checks all seven modules, the HUD, every time preset and season, rain, the tiny planet, photo mode, walking (the player stays on land and on the promenade deck) and fly mode. **Every stop's walk spot** (all 51) must stand on land, outside every building, with no single colour over 45 % of the frame and no more than 25 % of a 16 × 9 ray grid closer than 6 m (`pipeline.nearShare`); every extra place must be in view (aim within 25°, pre-pass depth at least min(0.8 d, d − r − 2)). After the loop, 気仙沼簡易裁判所 must draw as before, with every stream pool intact (`sb.validate()`). **The explore flow:** search in JA and EN, the full map and its © OpenStreetMap credit clear of the minimap, streaming in the far core (kit tiles with colliders), walking into buildings (blocked), the car on the roads, the four interiors (café RST is walked into from the sidewalk) and the labels. `--phone 1` adds the 390×844 low-tier layout, and `--bench 1` prints per-tier frame times. `--noexplore` skips the explore flow. 147 checks with `--phone 1`. |
| `bun tools/anime/accuracy.mjs --port P [--region core\|ortho] [--res 0.5] [--tile 500] [--out dist/qa4] [--tag t] [--lmshots 1] [--nobuild]` | The accuracy audit (V3-SPEC section 10). It builds a private bundle in `dist/anime-P`, then renders the app straight down with an orthographic camera: 1000 × 1000 px tiles at 0.5 m/px, first in colour at 12:00 with a clear sky, then as a float height pass and a road pass. It compares them with the GSI footprints (building IoU), the GSI z18 aerial photo with each roof's relief offset (roof CIEDE2000), OSM highways (road precision and recall) and the landmark sheets (positions, heights). It writes `accuracy[_tag].json`, `side_*.jpg` (photo, render, coverage diff), `mosaic_*.jpg` over the whole region, and `lm_*.jpg` with `--lmshots 1` ([v5] `--saveraw 1` also keeps each tile's full render and photo crop; `--tiles "x,z;..."` audits chosen tiles). It takes about 2 minutes. |
| `bun tools/anime/earth-ref.mjs --cell C --port P [--views top,o0,...] [--noearth] [--noapp] [--out raw/ref/earth/<dir>]` | [v4:overrides] Reference captures of a cell (`data/anime/cells.json`) from Google Earth web and the app from the same cameras, into `raw/ref/earth/<cell>/` or `--out` (under `raw/` only; never committed or shipped): pairs, a top view annotated with the lot numbers, road ids and a 20 m ENU grid, the registration on the GSI photo, and the per-lot roof ΔE (Earth vs app). [anime/OVERRIDES.md](anime/OVERRIDES.md). [v5] `tools/anime/earth-de.mjs` scores a before / after pair with one registration. The 12-cell sweep's before / after metrics and images: `docs/shots/v5_cells/` and its README. |
| `bun tools/anime/earth-crop.mjs --dir raw/ref/earth/<cell> --box x0,z0,x1,z1 [--view top] [--img earth\|app] [--ppm 20] [--local <lot id>] [--lot ids] [--ring "x,z x,z;..."]` | [r3] A rectified, metre-gridded crop of a saved Earth or app capture round an ENU box (or in a lot's own frame with `--local`, the frame of `roof.plant` / `roof.pv` rects), with lot outlines and OSM rings drawn: for reading roof blocks, zebras and roof lines in metres. No Chrome; reference only (output stays in `raw/`). |
| `bun tools/anime/green-scan.mjs [--cell c2] [--write] [--all]` | [r3] The vegetation-green scan of the GSI photo over the accuracy cells (ghost-lot leads); `--write` refreshes `data/anime/green-flags.json`, which `build-layout.js` reads for its recolour gate. |
| `bun tools/anime/shot.mjs --port P [--only a,b] --cams "hero;walk;tour:market;tourwalk:lm-station;x,y,z>lx,ly,lz" [--hours 16.5] [--q high] [--w 1920 --h 1080] [--eval js] --out shots/x/y` | Screenshots of chosen cameras (and, with `--only`, chosen modules). It waits up to 60 s for explore's stops, settles the stream per camera, and exits non-zero when a camera spec does not resolve. `--eval` runs page JS after each camera is set (for example to open the map). Add `--bench 30` for frame times. |
| `bun scripts/render/life-shots.js --cams "yoru@hero;yuyake@ltour:kanae"` | Screenshots with a time preset per camera. It also takes `--ui 1`, `--weather rain` and `--photo 0.5`. |
| `bun scripts/render/stills.js --size 1080 [--out dist/qa3]` | The wow stills, written to `dist/renders/` (or `--out`). `--size 4k` is the product size. |
| `bun scripts/render/film.js --preview` | The deterministic 30 s film: 960×540 for `--preview`, 3840×2160 by default. Frames go to `raw/film/`; ffmpeg writes the result to `dist/film/`. |
| `bun tools/anime/photo-align.mjs --area A --port P [--only 0808] [--tag before]` | [v6:survey] Renders the app from each photo's solved camera (`data/survey/A/cameras.json`: intrinsics as a projection matrix, principal point included), undistorts the photo, and writes edge overlays and pairs to `docs/shots/v6_survey/A/` (gitignored: they embed the photos) and the edge chamfer (px) to `data/survey/A/chamfer.json`. [v6:fix3] A camera's optional `absent: [object names]` (`cameras.json`) hides scene objects that were not there when that photo was taken (unbatched objects, `ctx.noBatch`, e.g. `hall.truck`). |
| `bun tools/anime/survey-diff.mjs --area A --port P` | [v6:survey] The app's named features (`window.__features(A)`, registered by the area modules) against the photo survey (`data/survey/A/features.json`), in metres and in survey sigmas → `data/survey/A/diff.json`. The surveys: `docs/anime/survey/market.md`, `docs/anime/survey/minami.md` (tools under `tools/survey/`, Python in `raw/survey/.venv`); step by step for a new street: [anime/SURVEY.md](anime/SURVEY.md). |
| `bun test test/v6-rebuild-minami.test.js` | [v6:rebuild] The south shore's survey constants (`harbor/minami5.js` `CAGE6`, `BLEACH6`, `WINCH6`, `RINGS6`, `WALK6`, `ANCHOR`, `MUK6`, `PIER7_6`) against `data/survey/minami/features.json` without a browser: every plaza feature within max(0.25 m, its 1-sigma); the before / after tables are in `docs/anime/survey/minami.md`. |
| `bun test test/v6-finish.test.js` | [v6:finish] The survey's deliverables without a browser: the `cameras.json` and `features.json` schemas and ENU ranges of both areas, the survey-diff tolerances (the stored `diff.json` is re-derived from `features.json` + `app-features.json`; no feature missing, none over 1 m or 3 sigma, each within max(0.25 m, 1-sigma), the plaza's cage / bleachers / winch / rings / signs within 0.12 m), and the determinism of photo-align (undistortion, Canny, distance transform, chamfer, projection) plus the stored final-pass chamfer bars. How to survey a new street: [anime/SURVEY.md](anime/SURVEY.md). Final numbers: plaza 62 features, mean 0.035 m, max 0.159 m; market 89 features, mean 0.063 m, max 0.337 m; chamfer 11.2 px (plaza, 20.9 before) and 7.0 px (market, 11.9 before). |
| `bun tools/anime/check.mjs <module>` | Triangle and texture budgets, headless, with no GPU. |
| `bun tools/anime/phonemem.mjs --port P [--url U] [--start] [--params "k=v&..."] [--settle s] [--eval js] [--out f]` | [v4:phone] The phone tier's budget probe (390×844, DPR 3, touch): JS heap peak and after GC, draw calls, triangles, geometry and the texture estimate `texMB` against the 240 MB budget, with `atlas` and `atlases` (pages and MB of every texture atlas) and `texCount`. Serve the build yourself and pass `--url`: its built-in server can hang. `--eval tools/anime/atlas-dump.js` writes the atlas inputs that `test/v6-phone-budget.test.js` pins. |
| `tools/anime/gate.sh chrome --fg env -u NODE_OPTIONS bun tools/anime/phone-budget.mjs [--port 9530] [--url U] [--params "k=v"] [--settle 15] [--roam 180] [--out f] [--keys f] [--snapshot f]` | [mobile-perf] **The phone budget gate.** It measures the phone tier at start (15 s after 「まちへ出る」) and after a scripted session: walk, fly the tour, open あそぶ, start and leave 海の中 and 一本釣り, walk back. It exits 1 over any budget: JS heap 260 MB, GPU buffers 280 MB, textures (with render targets) 200 MB, 140 programs at start, +10 % growth over the session. The GPU figures come from the WebGL2 allocation calls themselves (`phone-census.js`). It also reports the page renderer's and GPU process's footprint (macOS `footprint`) per phase (load, title, start, session), live canvases by holder, the stream's capacity, and a 0.5 s timeline. `deploy-verify.sh` runs it on the stage. |
| `tools/anime/phone-census.js` | [mobile-perf] The census, page side: `INSTRUMENT` (wraps the WebGL2 allocation calls, canvases and images), `CENSUS` (heap after GC, GPU bytes, programs, canvases by holder, the scene's bytes by group and attribute, the batch's evictions, the sweep), `BUDGET`. |
| `bun tools/anime/heapdom.mjs file.heapsnapshot [--top 40] [--min 2] [--by "system / JSArrayBufferData" --k 4]` | [mobile-perf] The dominator tree of a V8 heap snapshot. It lists the biggest retainers with their shortest retaining path from the window (`__ctx.audio…cache`), and `--by` groups one kind of node (typed arrays) by holder. |
| `bun tools/anime/program-keys.mjs keys.json [--kind toon] [--list]` | [mobile-perf] Decodes three r186 program cache keys (`phone-budget --keys`) into the switches that split each shader kind into variants. |
| `tools/anime/gate.sh chrome --fg env -u NODE_OPTIONS bun tools/anime/phone-look.mjs [--params "k=v"] [--cams "hero;tourwalk:market"] [--crop x,y,w,h] --out dir/prefix` | [mobile-perf] Screenshots of the live phone tier (not shot mode, which pins the canvas to 1× and turns dynamic resolution off), for A/B looks of engine changes. |
| `bun test test/v6-phone-budget.test.js` | [v6:phone-budget] The phone tier's atlas layout without a browser: the measured tile lists laid out with full and with trimmed pages (page sizes and megabytes pinned, 255.6 → 214.7 MB), the desktop layout against the old algorithm, trimming moving no tile, and the layout's invariants. |
| `bun test test/hud-sync.test.js` | [hud:sync] The HUD's in-place sync without a browser. `test/lib/mini-dom.js` is a small DOM (innerHTML parser and serializer, the selectors the HUD uses, events, focus, a write log) and the real `mountHud` runs on it: a clicked node survives its click, a patched HUD serializes like a rebuilt one, an idle sync writes nothing, blur after pointer clicks only, the planet hint, the ☰ 地名ラベル toggle. |
| `tools/anime/gate.sh chrome env -u NODE_OPTIONS KLC_E2E=1 KLC_E2E_PORT=P bun test <absolute path>/test/hud-sync.e2e.test.js` | [hud:sync] The same in headless Chrome (desktop mouse and keyboard, then a phone with real touches): same element, running transitions, renders counted, the stop count, focus, a press that straddles a time change, the planet hint, the labels toggle, a patched HUD against a rebuilt one. Prints one `HUD-METRICS` JSON line. Give `bun test` an absolute path in a worktree whose `node_modules` / `raw/` are symlinks: with a relative path the launcher saw Chrome close its stderr at once and every e2e failed with "chrome exited early" (2026-10-05; `launch()` on a tree with `036aae9` copes with a closed stderr, a relative path was not re-tried with it). |
| `bun test test/veil.test.js test/flight-interrupt.test.js test/pad-interrupt.test.js` | [ui-a2] Row 4 without a browser. The veil (`ui/veil.js`) on a mini DOM with a manual clock (`test/lib/manual-clock.js`): nothing built until the first cut, the jump runs once when the fade-in's `transitionend` arrives (never on a timer, however late the frames), the fallbacks (a hidden page, a stalled one, a layer that will not fade), reduced motion, the stylesheet. `interruptFlight` against the real tour: far is one cut, near is a glide, every pair of the seven built-in stops at eight moments ends inside 0.3 s on the framing, a stalled page waits for the fade. The HUD's keys and presses (`mountHud` on the mini DOM) and the pad's touch (`createTouchpad` on it). |
| `tools/anime/gate.sh chrome env -u NODE_OPTIONS KLC_E2E=1 KLC_E2E_PORT=P bun test <absolute path>/test/ui-a2.e2e.test.js` | [ui-a2] Row 4 in headless Chrome: real keys, mouse presses and touches (CDP) end a flight; an in-page recorder (the input event's own time stamp, `tour.onChange`, a per-frame sample of `tour.flying`, `pad.hidden` and the veil's opacity) prints `A2-METRICS`. Veil opaque at the jump, one cut, one skip, the glide, the pad back, the digits and HUD presses leave a flight alone, the auto tour, the veil's colour at night and noon, reduced motion. Two of its tests need no browser (the scripts parse; a dry run of the recorder). |
| `bun test test/hud-feed.test.js` | [ui-a2] Row 15 without a browser: the chip and the arrivals panel in every feed state (loading, good, no weather, never answered, failed after an answer, cached, sample) in both languages, JST times, recovery, patched equals rebuilt, the 34 px. |
| `tools/anime/gate.sh chrome env -u NODE_OPTIONS KLC_E2E=1 KLC_E2E_PORT=P bun test <absolute path>/test/ui-a2-feed.e2e.test.js` | [ui-a2] Row 15 in headless Chrome at the real feed boundary (an injected script answers `/api/live` and the sample): the states, the chip's height in each, English, and a phone whose feed never answers. |
| `bun test test/ui-b2-press.test.js test/ui-b2-sheets.test.js test/ui-b2-legibility.test.js test/mobile-native-lint.test.js` | [ui-b2] The press layer, the phone's menu / sheets / credits motion and the legibility values without a browser: the CSS is read by selector and at-rule (`test/lib/css.js`), the contrast is WCAG arithmetic on the colours the stylesheets declare over six scene backdrops, `mobile-native-lint` is the trimmed A16 lint of the mobile review (every `:hover` gated, `:active` 0.97, html overscroll). |
| `tools/anime/gate.sh chrome env -u NODE_OPTIONS KLC_E2E=1 KLC_E2E_PORT=P [KLC_E2E_DIST=<built dir> KLC_SHOT_DIR=<dir> KLC_UIB2_OUT=<file.json>] bun test <absolute path>/test/ui-b2.e2e.test.js` | [ui-b2] The same rows in headless Chrome: the computed matrix of a pressed button of every kind (real mouse on the desktop, `CSS.forcePseudoState` on the phone: headless Chrome never matches `:active` from a touch), the five hit tests inside each open panel, the panels' transitions read in the task that starts them (`getAnimations()`: the gated Chrome draws a few frames a second), the wordmark by pixels with and without the scrim, the landscape story card against the dock. |
| `bun tools/anime/serve.mjs --port P [--watch]` | Dev server with rebuild on change. |
| `bun tools/anime/debug/walkprobe.mjs`, `stream-repro.mjs` | Probes used to find walk spots with a clear view (renderer depth) and to reproduce streaming faults. |

Tests: `bun test` runs the unit tests in `test/`; the end-to-end touch test needs `KLC_E2E=1` and the Chrome gate. The v3
files (`test/v3-*.test.js`) cover layout derivation, determinism, no `Math.random`, no real brands in the fictional shop
catalogue, the budgets, the live parsers, i18n completeness and the harbour routes staying on water. The v4 files cover
the enrichment and its sources (`v4-data`: the OSM parser, matching, the fold precedence, the ODbL credit on screen),
town accuracy (`v4-town-accuracy`: footprints, real names, land use, rivers, signals), the landmarks at true size
(`v4-landmarks-a`, `v4-landmarks-b`), the explorable core (`v4-explore`: tiles, stream batching, the road network, the
car, search, walk framings), the per-cell overrides (`v4-overrides`) and the three polish rounds (`v4-polish1` to
`v4-polish3`). The v5 and v6 files cover the photo-matched geometry, the surveys and the rebuilds of the fish market and
the south shore; the `mobile-pad` and `ship-*` files cover the touch pad and the ship.

## Performance

These frame times were measured at 1920×1080 on one Apple M2 Max with the browser running at background priority, which
is how `tools/anime/gate.sh` runs Chrome (single 30-frame samples vary by up to ±40 % between runs).
`qa3.mjs --bench 1 --phone 1` on the production bundle:

| View | High | Medium | Low | Draw calls (high) | Triangles (high) |
|---|---|---|---|---|---|
| Drone over the inner bay | 25.3 ms | 26.0 | 21.4 | 1,138 | 13.1 M |
| Promenade | 19.7 | 25.6 | 19.0 | 955 | 12.0 M |
| Fish market | 23.9 | 34.3 | 20.7 | 1,186 | 11.8 M |
| Night | 30.3 | 26.3 | 19.4 | 1,117 | 13.1 M |
| Whole city | 32.0 | 32.1 | 22.4 | 1,551 | 14.1 M |

The live loop ran at about 13 to 16 fps at 1600×900 on high, on the inner bay and while walking the streamed far core.
Medium is no faster than high (the same draw calls); low is 5 to 35 % faster. The page was ready after 46 to 55 s; the
world modules took 20 to 27 s of that (town 10 to 15 s, harbour 3 to 4, explore 2.7, life 1.5 to 2, landmarks 1.4 to 1.6,
environment 0.6 to 1.3, water 0.1 to 0.3). These are single samples under the throttle, not the 60 fps measurement,
which still has to be taken on an idle machine. For comparison, the first build (v3, about 560 to 1,060 draw calls and
9 to 15 M triangles per frame) took 11 to 19 ms per frame under the same throttle and ran at 52 fps at 1600×900.

### Phone texture budget (2026-10-05, `fix/phone-budget`)

The phone tier must stay under **240 MB** of texture. `tools/anime/phonemem.mjs` estimates it from every texture reachable
from a material in the scene (390×844 at DPR 3, 4 bytes a texel and a third more for the mips):

    tools/anime/gate.sh run env -u NODE_OPTIONS bun run scripts/build-web.js
    env -u NODE_OPTIONS bun -e "import {start} from './scripts/serve.js'; await start({port: P, build: false})" &
    tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/phonemem.mjs --port Q --url http://127.0.0.1:P/ --start
    ... the same with  --params ship=1 --settle 20

Add `--params fixtures=1` for a fixed list of four arriving boats (the saved sample feed): the live feed's list changes
with the day, and each boat carries its own small atlas, so `texMB` otherwise moves by a few MB between runs.

**What happened.** ae274fb measured 232 MB and the error-hunt merge (df15fdd) 256 MB. Nothing grew by 24 MB: the static
batch's atlas (`core/batch2.js` packs every canvas texture whose UVs stay in [0,1], 285 of them, into shared pages; on the
phone 2048² pages and tiles of at most 512 px) went from five pages to six. The hunt added 50 canvas tiles net (+2.5 Mpx,
13 MB with mips), and the next-fit shelves fill a page to about 68 %, so they needed a whole extra 2048² page, 22.3 MB:

| Tiles the error hunt added to the static atlas | Tiles | Mpx | MB |
|---|---|---|---|
| `harbor/crate6.js` (the hall's fish-tub plates: fourteen 256×192, one 256×128; built by `hall6.js`) | +15 | +0.72 | +3.8 |
| `harbor/boats.js` (moored hulls' name and registration plates, 512×85 and 512×64: nine more boats) | +18 | +0.69 | +3.7 |
| `harbor/minami5.js` (the south shore's rebuilt signs: 128², a 512×440) | +9 | +0.59 | +3.1 |
| `harbor/tug6.js` (the tug's decals: 512², 256², 512×96) | +3 | +0.38 | +2.0 |
| `harbor/hall6.js` (the hall's own sign tiles: ten 128×256, a 512×48) | +11 | +0.35 | +1.9 |
| `harbor/boats.js` for `rows.js` and `yards.js` (row and yard hulls) | +6 | +0.15 | +0.8 |
| `landmarks/cityhall.js`, `harbor/lmkit.js`, `town/props.js`, `harbor/detail5.js` | +5 | +0.23 | +1.2 |
| removed or merged: `harbor/market4.js` (−12), `minami5.js`'s old plates (−3), boats in `world.js` (−2), a hospital sign | −17 | −0.64 | −3.4 |
| **Net** | **+50** | **+2.47** | **+13.1** |

`pv`, `flatroof`, `carpark`, `roofplant`, `openshed`, `streetlogic`, `geom`, `deckcars6`, `lifeboat6`, `poles6`, `truck6`
and `gasholder` draw no canvas of their own (they reuse existing materials), so they cost no texture. Outside the atlas the
hunt added about 1.3 MB of small canvases (128² and 256²).

**The fix** (`core/atlaspack.js`, wired by `PHONE.atlasTrim` / `atlasQuantum` in `core/tier.js` and `main.js`). A page was
always a full square, however little of it was used: the last page of a set is rarely full, the walk-in interiors fill half of
theirs, and each arriving boat's three name plates took a 1024² page (5.6 MB for 0.09 Mpx). The page layout is now a pure
function, and the phone tier trims every page canvas to its content, rounded up to 64 px (so the first six mip levels stay
exact). The tiles keep their size, their order and their pixel positions, on the same pages: every batch, material and draw
call is exactly what it was, and nothing is resized, dropped or skipped. The desktop tiers keep the full square pages
(`ATLAS.trim` is false). `?atlas=square` (phone tier only) brings the square pages back, so one build can be measured both ways
(`phonemem.mjs --params atlas=square`).

| Phone tier, the same four arriving boats | Before | After |
|---|---|---|
| static atlas (285 tiles) | six 2048², 133.9 MB | 1600², 2048², 2048×1984, 2048×1920, 1984², 1920×1856: 118.4 MB |
| walk-in interiors' atlas (15 tiles, drawn within 220 m) | 2048², 22.3 MB | 1856×1408: 13.9 MB |
| [cafe-rst] café RST: its tiles in that atlas (the neon, two menus, the poster, plaques, prints, the sacks, the goods strip, the card wall ...: 21 canvases, 0.62 Mpx, interiors' atlas 1920×1728: 17.7 MB for all of them) and three small repeating surfaces (floor 256², deck and boards 128²); then four people of the cast kit, one 512² atlas each (the barista has a second for blinking) | n/a | +3.3 MB (room) and +5.6 MB (people; 6.9 MB with the blink atlas); phonemem 225 MB in all (was 217) |
| four arriving boats' name plates | four 1024², 22.3 MB | 704×256, 704×256, 960×384, 704×384: 5.4 MB |
| **texture estimate, town and `?ship=1`** | **256 MB** | **215 MB** |

Measured with `phonemem.mjs --start --params fixtures=1` (and `ship=1 --settle 20`), the same build both ways (`?atlas=square`
is the before: df15fdd's layout):

| Phone tier, four arriving boats | Before (square pages) | After (trimmed) |
|---|---|---|
| Town: texture estimate | **256 MB** (255.6) | **215 MB** (215.2) |
| Town: JS heap peak / after GC | 448 / 137 MB | 448 / 136 MB |
| Town: page errors, draw calls, triangles | 0, 513, 4.30 M | 0, 513, 4.30 M |
| `?ship=1`: texture estimate | **256 MB** | **215 MB** |
| `?ship=1`: JS heap peak / after GC | 448 / 137 MB | 458 / 136 MB |
| `?ship=1`: page errors | 0 | 0 |
| Town, today's live feed (two boats): texture estimate | 244 MB | 210 MB |

The heap peak is the transient load peak (439 to 458 MB across these runs); the heap after GC, the draw calls and the triangles
are the figures that hold still. Canvases and GPU textures are not in the JS heap, so it does not move. Act 2 at sea measures
211 MB (`?ship=1&act=2`, two boats).

**Checks.** The desktop tiers run the unchanged layout: `test/v6-phone-budget.test.js` compares it with the old algorithm (copied
verbatim) on the phone's real tile lists, on 40 random desktop-sized sets and on tiles that fill a row or a page exactly, and the
headless `check.mjs harbor` batch statistics are identical before and after (858 merged meshes, 353 atlas tiles, 3 pages). Eight
cameras (hero, walk, the market, pier 7, the station) on the high tier differ from a fresh df15fdd build by at most 0.015 % of the
pixels, which is the render's own noise (two renders of one build differ by 0.014 %). On the phone tier the same cameras differ
from a fresh df15fdd build by at most 0.065 %, which two renders of that build also do (0.062 %): the tiles sit at the same pixels
of the same pages. phonemem's draw calls (513), triangles (4,303,495) and uploaded textures are the same with `?atlas=square`, and
25 phone cameras (the hero drone and 24 random drone and street poses) draw exactly the same number of calls both ways.
`qa3.mjs --phone 1` on the production build of the trimmed layout: 151 of 151 checks (the desktop flow and the
phone layout), no console errors, the desktop and phone frames looked at.

**Keeping it under.** The arriving boats come from the day's live feed, and each of the first four carries its own small atlas,
so `texMB` moves by a few MB with the day's list (about 4 MB between two and four boats): pin it with `--params fixtures=1`, and
compare one build both ways with `?atlas=square`. `phonemem` prints `atlases` (every atlas, its pages and MB) so a new regression
shows which one grew. Before adding signage or plates, see the budget paragraph of `docs/anime/BUILDER-GUIDE.md` section 6.

**Not done.** (1) First-fit shelves instead of next-fit would take the static atlas to 111.1 MB (7 MB less; a max-rects packer
measured 111.6 MB, no better, and the tiles with their gutters come to 101.7 MB). They were built and measured, and left out:
packing the same tiles differently changes which tiles share a page, so which meshes batch together, and so the merged cells'
bounds and the draw calls (24 random phone cameras: 19 draw 1 to 5 calls fewer, one 1 more; the hero drone 29 more). Trimming
moves no tile, so it changes none of that. (2) The 18 character and cat skins are 512² each (25 MB; 256² would save 19 MB), the
ship's 2048×1024 livery is 11 MB, and the vending machines' 24 tiles (2.0 Mpx) and the boats' 51 plates (2.0 Mpx) are the largest
tile families: fewer or smaller tiles, not a better packer, are the next lever. (3) Nothing was run on a real iPhone: the
trimmed pages are not powers of two (WebGL2 handles that, and Chrome on Metal renders them identically); `?atlas=square` is
there if a browser disagrees.

### Phone memory budget and first frames (2026-10-08, `fix/mobile-budget`)

Deploy #5 crashed iPhones ("A problem repeatedly occurred"). The cause was the **WebContent load peak**:
- 1.1–1.4 GB just before the title (the conductor's iOS Simulator runs, macOS `footprint`, which jetsam counts);
- ~300 MB of it garbage from the static batch and the warm-up uploads.

The measures, by where they act (each has its A/B switch):

| what | where | switch |
|---|---|---|
| Programs compiled for the colour pass's linear HDR target, not the canvas: 97 of 234 were never used | `main.js` compile step | — |
| The phone's merged cells are written straight from their sources, cell by cell. Each is uploaded at once (one draw into a 1×1 target with the pre-pass material) and drops its arrays. No batch2 copy, no clones | `core/phonecells.js` `buildCells`, `core/batch2.js` `direct` | `?direct=0`, `?stage=0` |
| Idle slots after the batch and after the warm-up frame, so WebKit collects the load's garbage before the title | `main.js` | — |
| Atlas pages free their canvas after the upload. The materials and textures caches let go of everything no scene object uses after the batch (their sign canvases were 126 MB). The boat hull cache and the water grids' CPU copies go too | `core/batch2.js` `freeOnUpload`, `main.js` | `?release=0` |
| Atlas tiles at most 200 px per metre of what wears them (deploy #7: 320, so a sign 2.7 m away has a texel per pixel at 2×) | `core/batch2.js` caps, `PHONE.atlasDensity` | `?density=0` |
| Forest masks as R8; the music's note buffers at 32 kHz on the phone | `world/environment/terrain.js`, `core/audio.js` | — |
| Stream pools give memory back: an empty pool is freed, one under 30 % full is compacted to 1.5× what it holds. Before, a 3-minute session took capacity from 0.57 M to 3.45 M vertices | `world/explore/sbatch.js` `trim` | — |
| The session sweep, every 20 s: unused cached textures and materials go, and departed textures lose their GPU copy | `main.js` `startSweeper` | `?sweep=0` |
| The canvas at 2 device px per CSS px on a phone (it was 1, stretched 3× by the compositor). Photo mode stays at 1× | `main.js` `CANVAS_PR`, `ui/photo.js` | `?cdpr=1` |
| Dynamic resolution settles behind the title, starts at the held scale (`klc.dr.<tier>`), ignores frames the main thread held up, and may climb to 1.2 on a phone | `core/dynres.js`, `main.js` | `?drmax=1`, `?dr=` |
| The crash-loop guard: a phone whose last load died boots lite (level 1, then 2) and says 「軽量モードで表示しています」 | `core/bootguard.js`, `main.js` | `?lite=0\|1\|2` |
| (deploy #7) Atlas pages uploaded right after the batch, so their canvases go before the compile; cell normals as 4 signed bytes, colours as 4 half floats (not bytes: the lamps' baked colours pass 1 for the bloom), no uvs in cells nothing reads them in; pools trimmed while others rebuild | `main.js`, `core/phonecells.js`, `world/explore/sbatch.js` | — |
| (deploy #7) Outlines over the 2× canvas from their own pass at scene resolution, read filtered (no stair-steps) | `core/renderer.js` `edgeTex` | `?edgetex=0` |
| (deploy #7) The street-detail swap (simplified → kit at 40 m) fades by dither (~0.35 s) through the pool slot's instance alpha (the outlines switch at half way); CRAFT §5's "no popping within 50 m". **Deploy #8: not on a phone**, whose stream programs then carry no discard (a fragment shader that can discard keeps an Apple GPU's hidden-surface removal from rejecting its fragments before shading) | `world/explore/sbatch.js` `fade` `FADE`, `stream.js`, `main.js` | `?fade=1` / `?fade=0` |
| (deploy #7) The phone's scene at 1.5× (was 1.25×; dynres floor 0.6 made it 0.75× on a busy GPU), climbing to 1.95× in invisible 0.05 steps. **The adaptive floor**: the 60 Hz controller never goes under 1.5×; only a sustained slow stretch (the median frame of the last 2 s over 38 ms) steps it down, one step per 2 s, to a second floor of 1.275×, and a median at or under 33 ms brings it back. Lite boots keep a 1× canvas and the 0.6 floor | `core/tier.js` `PHONE.pixelRatio` `drMin` `drFloor` `drMax`, `core/dynres.js` `softMin` | `?dr=`, `?drmax=1` |
| (deploy #7) Shadows 2048 on the phone (were 1024: half-metre texels in the drone's 280 m box); lite 1024 / 512 | `core/tier.js` | — |
| (deploy #7) FXAA in the composite, **off by default**: in the crops it softened lettering (the hull's 気仙沼) more than it smoothed edges | `core/renderer.js` `fxaa` | `?fxaa=1` |

Measured on the Chrome phone tier (`phone-budget.mjs`; main 8569989 → the branch head 0f1e067), start / after the 3-minute session:

| | before | after |
|---|---|---|
| JS heap after GC | 356 / 520 MB | 329 / 367 MB |
| GPU buffers | 213 / 365 MB | 215 / 232 MB |
| GPU textures + RB | 318 / 360 MB | 263 / 295 MB |
| programs | 234 / 247 | 134 / 149 |
| live canvases | 314 / 344 MB | 187 / 221 MB |
| stream capacity | 0.57 / 3.45 M vertices | 0.57 / 0.75 M |

In the iOS Simulator (the conductor's run of this branch merged with the play lane, the full scenario), compared with deploy #4:
- WebContent: lifetime peak 708 MB in the load (#4: 933); at the title / start 557 / 566 MB (#4: 657 / 673).
- GPU process max: 457 MB (#4: 515).
- programs: 109 at load (#4: 183).
- title ready: 13.7 s (#4: 23 s).

## Legacy

The medium and low tiers lower the pixel ratio, MSAA, the shadow map size and the hero radius; phones default to low.
On a portrait screen, the camera keeps about 64° across; the vertical FOV is capped at 88°. The hero stop then uses its own portrait drone pose (`FRAMES.hero.portrait` in `life/tour.js`).
Most of the load time goes into drawing Japanese text into canvas textures. Every shader is compiled at load, hidden
meshes (season particles, night-only lights) and the tiny planet's fold pass included, so the first season or planet
toggle no longer hitches.

## The earlier viewer

`src/web/` keeps code shared with an earlier viewer, which has been removed: libraries (`lib/`), `config.js`, live-data
helpers (`data/`), scene modules (`scene/`) and the synthetic dev fixtures in `fixtures/`. The anime app imports only the
boat routes from it (`scene/boats/routes.json`, read by the harbour and the ship); the scripts and some tests use the
solar-position and live-data helpers. `scripts/build-web.js` copies `src/web/fixtures` to `dist/fixtures/`, and
`scripts/serve.js` serves them under `/fixtures/` when `data/` lacks a group.
