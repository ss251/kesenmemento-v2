# Architecture

Kesennuma Living City v3 is a static web app with a small local server. Bun bundles the browser code into `dist/`.
When the page loads, the browser builds the whole city from precomputed layout data. `scripts/serve.js` serves the
page, the data and one live endpoint.

The engineering contract for module authors is [anime/BUILDER-GUIDE.md](anime/BUILDER-GUIDE.md). This page explains
how the parts fit together.

```
GSI tiles (raw/tiles, cached)                     JMA + 気仙沼漁協 pages (fetched live, cached in data/cache/live)
      │  scripts/build-data.js                                  │  scripts/live.js  (src/server/live.js re-exports it)
      ▼                                                         ▼
data/terrain, data/ortho, data/buildings,            GET /api/live  ──►  life/live.js  ──►  UI chip, weather, arriving boats
data/landmarks.json                                              ▲
      │  scripts/anime/*  (deterministic)                        │ scripts/serve.js (127.0.0.1)
      ▼                                                          │
data/anime/layout.json, grids.bin, landcover_*.png, trees.json ──┴──►  src/anime/world/layout.js  ──►  world modules
```

## 1. The engine (`src/anime/core/`)

The engine is ported from Sakuragaoka Station (Kenton-GMI, MIT) and runs on three.js 0.186.1. The ported files keep
their credit headers, and the licence is at `src/anime/LICENSE-sakuragaoka-station`.

| File | Role |
|---|---|
| `renderer.js` | The render pipeline. A normal and depth pre-pass feeds an MSAA HDR colour pass, followed by bloom and a composite step. The composite draws colour-aware outlines and applies grading, light leak and vignette. `render(..., out)` can also draw into a render target, which the tiny planet uses. |
| `sky.js` | The painted sky dome, cumulus clouds, stars, the sun and hemisphere lights, and the time-of-day palette (`setHours`, `setTime`). `keyLight()` keeps the real sun azimuth but never lets the shadow-casting light drop below 13° while the sun is up, because at 16:30 on Oct 10 the sun is only 5.8° high. |
| `materials.js` | `ctx.mat.toon / decal / emissive / glass / foliage`, all cel materials. They are cached by their arguments, so equal materials batch together. |
| `ctx.js` | Builds the `ctx` object that every module receives: `kit`, `geo`, `wires`, `physics`, `tex`, `rng`, `shared` uniforms, `services`, `addStatic` / `add`, `onUpdate`. |
| `batch.js`, `batch2.js` | Static batching. After every module has built, static meshes are merged by material into cells: 400 m near the inner bay and 2,000 m beyond (`BATCH` in `main.js`). Coarse cells won because the renderer is limited by draw calls. `renderer.js` then skips whole cells by distance each frame (beyond the outline range in the pre-pass, fogged out in the colour pass, and beyond 3.5 / 6 km on low / medium). |
| `player.js`, `physics.js` | Walking and flying: pointer-lock look, WASD, run, jump, fly, touch sticks, and colliders against walk boxes and the terrain. The sea is a wall on foot: `physics.standable()` refuses a step onto the sea, in front of a quay face, or onto the low strip at a hard shore unless a deck (walk box) covers it, and the player slides along the edge. |
| `season.js` | `ctx.shared.uSeason` and `patchSnow()`, which puts winter snow on every surface that faces up. |
| `planet.js` | The tiny planet. It renders six 96° views (3° overlap on every side) through the real pipeline without vignette, light leak or bloom, with one fog density and one shadow box for all six, and folds them into a slowly turning stereographic world. The fold adds the only vignette. |
| `textures.js`, `geo.js`, `audio.js` | Canvas textures (signage and Japanese text), shared geometry, and the WebAudio base. |

`src/anime/main.js` starts the app. It loads the fonts, then builds the world modules in the order **environment,
water, town, harbor, life**, then builds the wires, batches the static meshes and compiles the shaders. On every frame
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
       roof palette. The wall colour is a pastel chosen by the lot's seed.
   - **Roads.** There are 14,473 roads. Hero and mid road widths are measured from the GSI road-edge lines (RdEdg);
     the rest use the nominal width of their `rnkWidth` class.
   - **Other features.** The layout also holds the quays and seawalls (coastline pieces of at most 24 m), 455
     utility-pole runs 28 to 36 m apart, and named spots (浮見堂, the torii, Pier 7, the fish market, the bridges, the
     安波山 lookout, vending and cat spots).
   - **Tour.** The tour stops come from `data/landmarks.json`, whose positions were checked against the aerial photo
     and the DEM.
4. **Land cover and trees** (`build-landcover.js`, `build-trees.js`). The aerial photo is classified into forest,
   grass, paved and sand and painted in the anime ground palette, and trees are scattered where the camera gets close.

Everything is seeded by lot and road ids, so the same data always gives the same town. Lot ids have the form
`z/x/y/featureIndex` in the GSI vector tiles.

## 3. World modules (`src/anime/world/`)

Each module exports `build(ctx)`. `scripts/anime/registry.js` generates `world/registry.js`, the static list of
modules that Bun can bundle. Modules share state through `ctx.services`; a consumer always has a fallback in case a
service is missing.

| Module | What it builds | Services it publishes |
|---|---|---|
| `environment` | The terrain skin, land-cover colours, painted forest crowns, 7,000 3D trees and the far mountains | `environment` (`groundAt`, `terrainMaterial`, `trees`) |
| `water` | The whole bay: depth bands, shore foam, glints, the sky mirror after sunset, night light columns | `water` |
| `town/` | Hero buildings from Sakura's house kit (houses, 64 fictional shops with interiors, apartment blocks, warehouses), simplified mid buildings, instanced far buildings, streets, markings, poles and wires, parking, gardens and props | `town`, `street` (walk paths), `poles` |
| `harbor/` | Quays, the seawall with sea-view windows and the promenade; 70 moored boats in rows; boats arriving from the live list; the fish market; かなえ大橋 and 大島大橋; 浮見堂, the torii, the shrine and its grove; the 安波山 lookout; gulls | `harbor` (`boats`, `rows`, `market.workSpots`, `bollards`, `setArrivals`, …) |
| `life/` | Time presets and transitions, one light registry for lamps, windows and boat and bridge lights; 33 people and 7 cats; rain and wet streets; sound; live data; the tour camera; seasons; the UI | `time`, `lights`, `arrivals`, `life` |

`_ground` and `_houses` are development placeholders and are not in the production build order. Their docs:
[anime/TOWN.md](anime/TOWN.md) and the file headers in `harbor/` and `life/`.

**UI** (`src/anime/ui/`). The life module mounts the UI (`hud.js`, `style.js`, `photo.js`). Every string is in
`data/i18n.json` (JA and EN) and is bundled at build time. Photo mode renders a 16:9 frame off-screen through the full
pipeline at 3840×2160 and saves it as a PNG.

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
| `bun tools/anime/qa3.mjs --port P [--build 1] [--phone 1] [--bench 1]` | Builds `dist/`, serves it and drives the production page like a visitor. It runs 40 checks, fails on any console error and saves screenshots. It walks at the bay from the promenade (the player must stay on the deck), and drops onto every tour stop's walk spot: on land, outside every building and market hall, and no single colour over 45 % of the frame. `--bench 1` prints per-tier frame times. |
| `bun tools/anime/shot.mjs --port P --only a,b --cams "hero;walk;x,y,z>lx,ly,lz" --hours 16.5 --out shots/x/y` | Screenshots of chosen modules. Add `--bench 30` for frame times. |
| `bun scripts/render/life-shots.js --cams "yoru@hero;yuyake@ltour:kanae"` | Screenshots with a time preset per camera. It also takes `--ui 1`, `--weather rain` and `--photo 0.5`. |
| `bun scripts/render/stills.js --size 1080 [--out dist/qa3]` | The 12 wow stills, written to `dist/renders/` (or `--out`). `--size 4k` is the product size. |
| `bun scripts/render/film.js --preview` | The deterministic 30 s film: 960×540 for `--preview`, 3840×2160 by default. Frames go to `raw/film/`; ffmpeg writes the result to `dist/film/`. |
| `bun tools/anime/check.mjs <module>` | Triangle and texture budgets, headless, with no GPU. |
| `bun tools/anime/serve.mjs --port P [--watch]` | Dev server with rebuild on change. |

Tests: `bun test` runs 17 files and 259 tests (`test/v3-fix.test.js` covers the fix pass: walk spots, the sea wall, hard shores, the Kanae axis, stale live data, the token route, the gate and the npm scripts). The v3 files are `test/v3-*.test.js`. They cover layout derivation,
determinism, no `Math.random`, no real brands, the budgets, the live parsers, i18n completeness and the harbour
routes staying on water.

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
The browser builds the city in about 20 s under the gate, of which town takes about 8 s, mostly drawing Japanese text
into canvas textures. Every shader is compiled at load, hidden meshes (season particles, night-only lights) and the
tiny planet's fold pass included, so the first season or planet toggle no longer hitches.

## Legacy

`src/web/` is the v1/v2 app: a GIS viewer and photoreal tiles. It is kept for reference. `bun run scripts/build-web.js --v2`
builds it instead of v3; this was not re-run for v3, and it replaces the v3 `dist/index.html`. The v3 app does not use
the photoreal tiles. `scripts/serve.js` answers `/api/config` (the v2 tiles token) only when started with `--v2` (or
`KLC_APP=v2`), and `scripts/public-mirror.js` never passes that route, so a public link cannot hand out the token.
