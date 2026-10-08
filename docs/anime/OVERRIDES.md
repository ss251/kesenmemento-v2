# Per-cell overrides

The layout is derived from GSI footprints, OSM and the GSI aerial photo (ARCHITECTURE.md section 2). Where those are
wrong or out of date, a resident notices: a building that was demolished, a car park that is now a plaza, a roof that
is white and not red. An **override file** corrects one **cell** (a small area, usually 100 to 300 m across) with values
read from newer references. `scripts/anime/build-layout.js` folds every override file in as its last step, and
`scripts/anime/build-explore.js` applies the road changes to the far-core streets.

Code: `scripts/anime/enrich/overrides.js` (re-exported by `enrich/fold.js`). Tests: `test/v4-overrides.test.js`.

## Ground truth, in priority order

1. **The project's own on-site photos** (kept under `raw/`, which is not committed). [v6:survey] Where an area has a photo survey (`data/survey/<area>/features.json`: solved cameras,
   features measured in metres with a 1-sigma; `docs/anime/survey/<area>.md`), its numbers replace anything placed by
   eye against the photos (phone GPS is 3–10 m off); check a rebuild with `tools/anime/survey-diff.mjs` and
   `tools/anime/photo-align.mjs` (procedure for a new street: `docs/anime/SURVEY.md`). [v6:rebuild] The south shore (PIER7, the plaza, 迎 / ANCHOR, 結, the east promenade) is rebuilt to
   `data/survey/minami/features.json`: every named feature within its 1-sigma (`test/v6-rebuild-minami.test.js`); the survey
   constants live in `harbor/minami5.js` (`CAGE6`, `BLEACH6`, `WINCH6`, `RINGS6`, `WALK6`, `ANCHOR`, `MUK6`, `PIER7_6`) and the
   plaza's paving level in `world/layout.js` `GROUND_PADS`. [v6:fix2] The comparison looks (`?look=photo|sunny|dawn`) and `?nocast` leave out the cast (people, cats): the survey photos are compared with the static scene. The east promenade (x > 105) is laid as its own slab in `harbor/minami5.js`, flush with the quay pieces (`harbor/world.js`).
2. **Google Earth** (imagery dated 2026-03-11), captured for reference only with
   `tools/anime/earth-ref.mjs` (below). **Never ship, commit or paste these captures into the app.** They stay in
   `raw/ref/earth/<cell>/` (gitignored). **What it is:** the 2026-03-11 aerial image draped on the terrain. Kesennuma has no 3D
   buildings in Earth (at tilt 70 the status bar reads the 2026-03-11 imagery date and the views are flat; Sendai, imagery 2025-05-21, renders photoreal 3D in the same
   headless Chrome). The obliques carry **no building height information**: what looks like height is the lean in the source image, the same
   in every view (resampled onto horizontal planes, top / o0 / o180 line up at h = 0 and drift apart at 10 and 20 m: a plane sweep over c11/A puts the best
   match of every lot at 0 to 1.5 m, including the app's 19.8 m office). In central Kesennuma Earth is effectively 2.5D (八日町, 魚町, 南町, 柏崎 and 港町 come
   back with almost no building walls): use it for **plan shapes, roof colours and land use**, not for heights, storeys or facades. Heights come only from
   shadow length or lean through the calibrated scene below, from ground photos, from the GSI footprints or from OSM `building:levels`. An override `src` that
   cites an Earth oblique ("roof about 9 m up", "o180 north wall") for `height` or `storeys` is a value to re-derive: `tools/anime/flag-oblique-heights.mjs` lists them.
   `earth-ref.mjs` checks every cell: `meta.flat3d` (a plane sweep of the cell's tall lots) and `meta.views.<v>.verticalEdge` (the wall energy of the Earth frame against the app's).
3. **The GSI aerial photo** (`data/ortho/core.jpg`, about 2020 to 2022). Building sites on it may be finished now.
4. **OpenStreetMap** (© OpenStreetMap contributors, ODbL). [r3:18] The extract is fetched by `scripts/anime/enrich/fetch-osm.js`, which now tries overpass-api.de first and rejects a mirror whose database is more than 3 days old (the kumi.systems mirror served a base of 2026-05-06 on 2026-09-30, a lag of 147 days); `data/anime/sources.json` records `osmBase` and `osmFetched`.
5. **The GSI footprints** (基盤地図情報).

When sources disagree, the newest wins. Every value in an override file names its source.

## Workflow for a cell

1. Pick or add the cell in `data/anime/cells.json` (`bbox` = `[x0, z0, x1, z1]` in ENU metres).
2. Capture the references and the matching app renders:

   ```sh
   tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/earth-ref.mjs --cell pier7 --port <your port>
   ```

   This writes `raw/ref/earth/<cell>/`:
   - `earth_<view>.png` and `app_<view>.png` from the same cameras, with `pair_<view>.jpg` side by side. The views
     are `top`, the obliques `o0`, `o90`, `o180` and `o270`, and the low obliques `l45` and `l225`. The number is the
     camera heading.
   - `top_annot.jpg`: the Earth top view with the app's lots (numbered roof outlines, magenta for landmark models),
     the road ids and a 20 m ENU grid. Read positions for new polygons straight off it. [r3] For a metre-accurate read of one roof or junction use `tools/anime/earth-crop.mjs`: it rectifies a saved capture (Earth or app) onto
     a plane round an ENU box, or into a lot's own frame (`--local <lot id>`, the frame of `roof.plant` / `roof.pv` rects), with a metre grid, lot outlines (`--lot`) and OSM rings (`--ring`).
   - `meta.json`: the cameras and Earth URLs, the lot legend (number, lot id, kind, height, roof, the Earth and app
     roof colours with their ΔE), the registration against the GSI photo (`registration.earth` / `.app`, each marked
     `failed` when its NCC is under 0.15 or its scale sits on the search's edge) and **directly of Earth against the app**
     (`registration.direct`: the correction used for `top_annot.jpg` and every roof ΔE; the two cameras are the same, so it is
     close to the identity), `appQuery` (the exact app URL query: the app renders in `?season=early`, leaf-off like the
     2026-03-11 imagery; `--query season=autumn` for the default look; [r3:17] lit at the hour whose sun casts shadows along the Earth scene's bearing 340 on the demo day, `earthSunHours()`, about 10.4 h: 12:00 put the app's shadows 34 degrees off, on the other side of every building; `--hours` overrides it and `meta.scene.appSun` records it), `scene` (see below), `flat3d`, per-view
     `verticalEdge` and `osmCandidates`, and the metrics.
   - `top_annot.jpg` also draws, dashed cyan, the **OSM buildings that no lot covers** (`osmCandidates`, from
     `tools/anime/osm-gap.mjs --cell <id>`): GSI footprints are about 2020-22, so a building that OSM mapped later
     never becomes a lot unless you add a `newLot`. **The list is a gone-building list, not a to-do list** [r3:1]: 132 candidates lie in the 11 non-excluded cells (c1-c12; the PIER7 / south-shore
     cell and the fish-market lots left out; 140 once the ghost lots removed in round 3 stopped covering eight of them), and a round-3 check of every one beside the 2026-03-11 Earth top and the GSI photo found about 85-90 %
     of them (roughly 120 of 132) gone or never a roof: bare ground and pads (the c4 seawall yard, the 気仙沼公園 prefab rows, the c2 太田 row), car-park stalls (c1, c5, c7), tank bases, forest and slope
     ramps. About 9 % (about 12) stand in Earth 2026, mostly 25-145 m2 buildings (so far eight became newLots: c12 w1242845988 and w1242845996, c10 w792747189 and w792747216, c6 w966913923, c5 w928776174,
     c2 w1242838123, c1 w929109575; c9 w928768734 is forest and c4 w928743201 a seawall); the c10 shed and the c1 house that a round-1 removal had wrongly taken are among them. Every ring needs an Earth top check plus
     o0 and o180 (`earth-crop.mjs --ring`), then a `newLot` with `src` "osm: w... + earth: ...". Never import the list blindly: an import would have added about 100 phantom buildings.
     The three candidates the GSI photo shows but OSM does not (c4 (1197,-207), c5 (-695,-91), c10 (296,404)) were checked on the saved captures the same way: c4 is the house lot `16/58543/25068/17` covers plus a pad with a small utility
     box (no new roof), c5 a bare gravel pad (the GSI buildings are gone) and c10 a car park (the white-roofed building is gone): no newLot for any of them.
   - `--heights` writes `top_heights.jpg`: footprint (red), roof shifted by lean x h (yellow), predicted shadow at the app height (orange).
   - [sys:presence] `presence` per lot (`meta.legend[].presence`, `meta.presence`): the mean gradient magnitude on a 1.5 m band along the polygon edge (the best of a 3 x 3 grid of +-1.5 m shifts: a local registration) divided by
     the tile median gradient, on the directly registered Earth top view (`earth`) and on the GSI photo (`gsi`). A lot whose edges are clear in the photo
     (`gsi >= 1.6`) and flat in Earth (`earth <= 1.35`) gets the flag **CHECK-GONE** (dashed yellow with the label in `top_annot.jpg`). It is **advisory**:
     the roof colour dE never asks whether a building stands there (a vanished building just looks like a poor colour match), and this is the lead list for
     that. In a hand check of about 50 candidates 5 were gone, about 20 were real buildings with a poor registration or a roof change, and shadowed or
     canopied roofs are missed.
   - [r3:2] Two more advisory flags close the gap CHECK-GONE leaves (it needs clear edges in the GSI photo, so a ghost lot over forest or grass, a GSI polygon from before 2020, passes): **CHECK-EMPTY** (no edge in the
     GSI photo AND none on the Earth top: both ratios <= 1.2) and **CHECK-GREEN** (the GSI interior is dark vegetation green: mean luminance under 132, G over R by 9 or more and above B, 80 % of the pixels;
     `scripts/anime/enrich/green.js`; landmark, shrine and temple lots and slivers that touch another lot are skipped). `tools/anime/green-scan.mjs [--cell c2] [--write]` runs the scan without Chrome and writes
     `data/anime/green-flags.json`. Of 2,364 lots of the 12 cells 66 had a vegetation interior and at least 20 were ghosts (the 8 c2 hill lots among them; round 3 removed c2 `16/58540/25067/76`, `/79`, `16/58540/25066/3`, `/30`,
     `16/58541/25066/49`, `16/58540/25067/303`, `16/58540/25066/38`, `16/58541/25067/130`, c1 `16/58539/25068/336`, `16/58539/25067/277`, c5 `16/58539/25068/342`, c10 `16/58540/25069/290`, c6 `16/58541/25069/332` and c9
     `16/58539/25069/134`, each after an o0 / o180 look). **A recolour of a flagged lot must name an oblique view (`o0`, `o180`, `l45`) or a ground photo in its `src`**, or `build-layout.js` stops: every bad recolour already said
     'earth: roof #... on the top view', so naming the Earth top proves nothing. `remove: true` is always allowed.
   - Heights, from the 2026-03-11 scene (`EARTH_SCENE` in `earth-ref.mjs`: `{ imageryDate: '2026-03-11', shadowBearing: 340, sunElev: 44,
     lean: [-0.39, 0.21] }`, **properties of that one satellite scene, not universal constants**; check the lean in one far cell
     such as c4 or c12 before treating it as global): the shadows run along **bearing 340** (not north-west; the mast shadow of the
     かなえ大橋 south pylon gives 331 +- 4, the OSM-levelled blocks in town 340), so with the sun at elevation 44 degrees
     `h ~ L * tan(44) ~ 0.97 L`, L the shadow length measured along bearing 340, and a roof leans (-0.39, +0.21) m per metre of
     height (x east, z south) so `h ~ |roof shift| / 0.44` (a 15 m roof shows shifted (-5.9, +3.2) m). The model reproduces the
     shadows of さかな町内湾ビル (OSM 4 levels, about 13 m), 気仙沼信用金庫 本店 (OSM 5, 15-16 m) and 南町1丁目共同化建物 (OSM 5).
   - **Before you write a roof colour:** a CHECK-GONE lot, and any lot whose polygon is flat in the Earth top, must be checked on o0 and o180 (or a ground photo) before a roof
     colour is written; if no building is there, write `remove: true`, never a recolour. (Five lots, c2 `16/58541/25067/217`, c3 `/289` `/290` and c10 `/256` `/257`,
     were recoloured as 'roof colours' read off bare asphalt, dirt and shadow, and are removals now.)
3. Write `data/anime/overrides/<cell>.json` (schema below).
4. Rebuild and check:

   ```sh
   env -u NODE_OPTIONS bun run scripts/anime/build-layout.js    # stops with a clear message on any bad value or id
   env -u NODE_OPTIONS bun run scripts/anime/build-explore.js
   env -u NODE_OPTIONS bun test
   tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/earth-ref.mjs --cell <cell> --port <port> --noearth
   ```

   `--noearth` re-renders only the app, reuses the saved Earth captures, and recomputes the pairs and the metrics.

## Coordinates

Everything is in the layout's ENU metres. The origin is 38.9060N 141.5750E, **x points east and z points south**
(`src/core/geo.js`: `x = (lon − 141.575) × 86744`, `z = −(lat − 38.906) × 111014`). A coordinate more than 30 m
outside the cell's bbox is rejected, which catches a flipped z.

## File format (version 1)

The folder is `data/anime/overrides/*.json`.

- **Order.** Files apply in file-name order (plain code-unit order: `10-pier7.json` before `20-pier7.json`, and
  upper case before lower case). Entries apply in array order. When two operations touch the same lot or road, the
  later one wins field by field.
- **Provenance.** Each operation that touches a lot is appended to `lot.src.ovr` as `<file>#<section>/<index>`, and
  its `src` to `lot.src.ovrWhy`. Every field it sets gets the source `override` (`src.h`, `src.kind`, `src.roof`,
  `src.color`, `src.wall`, `src.name`). Roads, land use and props carry `ovr` too, and `layout.overrides` lists the
  files with their sources.
- **Precedence.** derived < OSM, aerial and GSI facility (`fold.js`) < `LOT_FIX` (`world/lotfix.js`) < overrides.
- **Strict validation.** Unknown fields, bad values, unknown lot or road ids, an operation outside its cell, and a new
  id used twice all stop the build with the file and the path of the problem.

```jsonc
{
  "version": 1,
  "cell": "pier7",                          // a-z, 0-9, -
  "bbox": [-40, -10, 140, 170],             // x0, z0, x1, z1 (ENU m): the same as data/anime/cells.json
  "note": "optional free text",
  "sources": [                              // at least one; every operation's src starts with one of these ids
    { "id": "earth", "what": "Google Earth 3D, imagery dated 2026-03-11 (raw/ref/earth/pier7)", "date": "2026-03-11" },
    { "id": "photos", "what": "on-site photo IMG_0701.HEIC", "date": "2026-10-01" }
  ],
  "lots": [ ... ], "newLots": [ ... ], "landuse": [ ... ], "roads": [ ... ], "props": [ ... ]
}
```

### `lots`: patch or remove an existing lot

`id` is the layout lot id (`z/x/y/featureIndex`, the numbered legend in `meta.json` gives them). Give any of the
fields below, and always give `src`.

| Field | Values |
|---|---|
| `kind` | `house` `apartment` `shop` `office` `hotel` `public` `school` `warehouse` `carpark` `factory` `temple` `shrine`. [v6:c6r3] `carpark`: an open multi-storey car park (OSM `building=parking`, or `amenity=parking` + `parking=multi-storey`, is mapped to it by `kindFromTags`): `town/carpark.js` plans and `mid.js` `drawCarpark` draws open decks (floor slab, fascia and parapet per deck, columns, a retaining plinth on a slope), no windows or ribs, and the white stall lines and parked cars on the top deck. `storeys` x 2.8 m is the deck pitch; the derived default (2 decks, 5.6 m) is a placeholder, so give `storeys` / `height` only from a ground photo. The deck colour is `roof.color`. Stall markings come from this painter (a `parking` landuse ring under a building is hidden by it) |
| `storeys` | integer from 1 to 60. The height follows the kind's storey height unless you also give `height`. |
| `height` | metres from 1.5 to 250, to the roof's eaves or parapet. The storeys follow unless you also give `storeys`. |
| `roof` | `{ "shape": "flat" \| "gable" \| "hip" \| "shed" \| "saw", "color": "#rrggbb", "ridge": "x" \| "z", "pv": 0..1 \| { "share": 0..1, "side": "n" \| "s" \| "e" \| "w" \| "all" } \| { "flush": true, "rects": [{ "x", "z", "w", "d" }], "ridgeAt": m } }`. `x` means the ridge runs along the frontage, and `z` means it runs front to back. `pv` [sys:8] is the share of a flat roof under solar modules, counted on the Earth top view (the PV-blue pixel share), optionally only on one side ("south half"): the mid and hero builders draw dark module rows (1 m deep, 1 m gaps, 10 degrees to the south) over that band, 1 m inside the outline. [r3:5] **On a PITCHED roof** the arrays are blocks lying in the roof plane, not racks: `pv: { "flush": true, "rects": [{ "x": -4.4, "z": -3.55, "w": 3.0, "d": 10.3 }, ...], "ridgeAt": 2.5 }`, `rects` in lot-local metres (like `plant`), read off a crop rectified into the lot frame (`tools/anime/earth-crop.mjs --local <lot id>`); `mid.js` and the hero kit (`kit/house.js`) clip each block to the facet it lies on (never over the ridge; 0.4 m off the ridge, the eave and the gable / hip edge) and lay contiguous dark module quads (about 1 x 1.65 m, a thin frame under them) 0.07 m above the roof plane. `ridgeAt` is the real ridge's position across the roof in lot-local metres, absolute like the rects (z when the ridge runs along the frontage, else x; the model's ridge is at its wing's centre, 萬屋呉服部's real one at z = 2.5 while its wing is centred at z = 1.0), so blocks keep their distance from the real ridge; without it the wing's centre is the ridge. A lot with `roof.pv` data gets no seeded random roof panel (`kit/lot.js`: the draw is taken first, so the rng stream of the following per-house values does not move). `plant` [r2:5] is the rooftop plant of a large flat roof read off the Earth top view: `[{ "x": -5, "z": 3, "w": 10, "d": 4, "h": 3.4, "kind": "penthouse" }]`, a rect in LOT-LOCAL metres (x along the frontage, z toward the street, origin at the lot's oriented-box centre, `h` above the roof deck; read it off a crop rectified into the lot frame with a 5 m grid), `kind` one of `penthouse` (a box with a darker cap: stair or lift housing, a stepped higher section), `duct` (parallel runs along the rect's long side on a low rail, one per 2.4 m, `h` the top of the run), `condenser-row` (units 1.1 m wide on a 1.35 m pitch along the long side, as deep as the rect) and `pv` (solar modules over the rect). `town/mid.js`, `blocks.js`, `industrial.js` and the hero kit (`hero.js`) draw the listed rects exactly and skip the random roof boxes of a lot that has a spec. The enrichment's `equip` count is deliberately not a source (it counts clutter on the 2020-22 photo, 6 or more on 77 of 465 flat lots, and would invent a roof); the measured specs are in `data/anime/overrides/zy-rooftop-plant.json` (320, 227, 25067/5, 200, 37, 59). |
| `wall` | `#rrggbb` |
| `name`, `nameEn` | the real name that is shown on the building and in search |
| `unname` | [v6:c5r2] `true`: the lot loses its name (and English name). Use it when a GSI facility or OSM record was snapped to the wrong building (the GSI Anno label 観音寺 sat on a 120 m2 house 200 m from the temple); the facility place that carried the name for this lot is dropped from search and labels, and the lot that really bears the name gets it with `name`. Not combinable with `name` or `nameEn`. |
| `facade` | `house` `apartment` `office` `shop` `warehouse` `plain` `public` `ribbon` (the window pattern of the mid and far builders). [v6:c5r3] `ribbon`: a metal-panel block with a plain ground floor (small vents, one recessed door) and one continuous 0.95 m window band per upper storey; the lot's `wall` is the panel colour (hero: `buildOfficeBlock`; mid / far: the shader's style 7, which also leaves the pastel wall tint out). A measured office of 3 or more storeys keeps its kind when OSM tags it as a bank (`classifyHero` made it a shop-front house before). |
| `remove` | `true`, with only `id` and `src`: the building is gone (demolished, or it never existed) |

When a patch changes the kind, only the values that were derived are derived again. A height from OSM or a landmark
stays, and so does a roof shape from OSM or the aerial photo.

```json
{ "id": "16/58541/25068/66", "kind": "shop", "storeys": 2, "roof": { "shape": "flat", "color": "#d6d8d4" }, "src": "earth: flat pale roof, glazed ground floor (top_annot #33)" }
{ "id": "16/58541/25068/70", "remove": true, "src": "earth: demolished; the lot is a car park (pair_o180)" }
```

The builders take override values as measured values, like OSM and aerial ones. Heights and storeys are built as
given ([sys:29]: the street-detail kit's storey height follows `lot.height`; a height-only patch gives `floor(h / storey + 0.25)` storeys, so a 4.8 m store is 1 storey), and roof shapes and colours are not replaced by the palette. Every builder draws the roof in the lot's colour:
the street-detail kit (`town/kit/house.js`), the hero office and apartment blocks (`town/blocks.js`), the mid zone and
the warehouses and factories ([v5]; the kit's flat roofs and the blocks' decks used other colours before).

Lots drawn by a dedicated landmark model (`lot.landmark`, magenta in `top_annot.jpg`) keep that model: a patch
changes only their data, and the build log warns. Fix the model itself in its module (`harbor/`, `landmarks/`). [r3:16] School lots are classified by a per-lot table
(`landmarks/sites.js` `SCHOOL_INFO.<ground>.kindOverride` / `storeysOverride`: gym, block or shed), the area / box-ratio rule being only the fallback for unlisted lots.

### `newLots`: a building the footprints do not have

`id` must be `ovr:<cell>:<name>`. `poly` is the outline, at least 3 `[x, z]` points. `kind` is required, and so is
`height` or `storeys`. `roof`, `wall`, `name`, `nameEn`, `facade` and `src` are as above. A new lot goes through the
same pipeline as a GSI footprint: its zone, frontage, ground height and builder are derived. Its seed comes from its
id, so keep the id stable.

```json
{ "id": "ovr:pier7:kiosk", "poly": [[80, 60], [88, 60], [88, 66], [80, 66]], "kind": "shop", "height": 3.4, "roof": { "shape": "flat", "color": "#aab0b4" }, "src": "earth: new kiosk" }
```

### `landuse`: the ground surface

| `use` | Drawn as |
|---|---|
| `parking` | asphalt with white stall lines, plus parked cars (`town/landuse.js`, `town/parking.js`) |
| `vacant` | a vacant lot: bare gravel, or rough weeds with `"surface": "weeds"`, or [v6:c5r3] a hillside grave terrace with `"surface": "grave"` (the `LOOK.grave` swatch, rows of stones as in a cemetery; no trees) |
| `park` | mown lawn |
| `plaza` | a pale paved square (cream #c9c3b8: only for squares Earth shows pale; grey concrete and asphalt are `apron` or `levee`) |
| `apron` | plain asphalt with no stall lines or cars: a quay apron or a works yard. [v6:c12r2] The look is #7c7a82, the Earth 2026-03-11 median of the 大浦 / 神明崎 / 南町 yards (#6b6c77..#868186) |
| `levee` | [v6:c4r2] mid-grey concrete (#928c8d): a levee slope, a revetment or a pier deck, where Earth shows #9b9494..#a49e9f (the 鹿折川 levee slopes, the 大浦 pier) |
| `forest` | [v5:fix2] mixed woods: forest land cover and broadleaf / cedar trees (`build-landcover.js`, `build-trees.js`) |
| `cedar` | [v5:fix2] a 杉 plantation: cedar land cover, and 88 % of its trees are cedar cones |
| `felled` | [v5:fix2] a clear-cut strip: bare brown ground, no trees. [v6:c4e] `#7f6b57`, L* 47 = the Earth 2026-03-11 median of the dormant tan-brown cut slopes of the 三陸沿岸道路 (x > 1300): the photo's bare cuts are no longer painted cream sand (`build-landcover.js`: bright-tan `sand` on a hill, or over `SAND_HILL_H` = 12 m with no building within about 50 m, is `felled`; real beaches stay) |

`forest`, `cedar` and `felled` are land cover, not draped surfaces: rebuild `build-landcover.js` and `build-trees.js`
after changing one. Every car park, apron, plaza, gravel lot and building site is also painted as paving or town
ground in the land cover, so no photo lawn shows round it.

`fill` ([v5:fix2], `parking` only): the share of the stalls that hold a car, counted on the newest imagery (0 to 1;
the default is 0.2).

Fields: `ring` (at least 3 points), and optionally `holes`, `name`, `color` ([v6:c5r3] `#rrggbb`: this polygon's own swatch, where Earth's mean colour differs from the class colour; check the render with a mean-L* sample inside the ring, the app renders about 5 L* brighter than the swatch) and `replace: true`. With `replace`, OSM or earlier
land-use polygons whose centre lies inside the ring are dropped. Use it when a car park became a plaza. The polygons
are draped on the terrain in the town, in the streamed core and on the map.
`scripts/anime/build-trees.js` plants no tree on an override surface other than a park, so rebuild the trees after
adding a car park, a vacant lot, a plaza or an apron where the aerial photo showed woods. Each polygon's parked cars are
seeded by its own id and corner, so adding a polygon does not reshuffle the cars of the others.

Tunnels (`tunnel` from OSM or GSI code 2714) are never drawn as asphalt (`town/streets.js`), so there is no need to remove
a tunnel road to clear a strip over a hill.

[r3:13] An OSM `place_of_worship` polygon that maps a whole hill is clipped in `scripts/anime/enrich/osm.js` `PRECINCT_FIX`, keyed by OSM id: 北野神社 (w761768594, 17,127 m2 over the 福美町 hillside) is the compound
round the hall (x -992..-930, z -252..-188: the shrine-kind lots span -989..-936 / -246..-194; the first guess, 72 x 68 m, was a slab much bigger than the cleared ground round the hall on Earth), and only footprints that carry one of its OSM building ids (w775151444-447) or lie within 30 m of the hall take its name and kind `shrine`; the other footprints keep their own kind.
八幡神社 (6,740 m2) and 光明寺 (9,247 m2) are plausible precincts and stay as mapped until a cell that covers them checks them against Earth.

### `roads`: a patch, a removal or a new road

- **Patch** an existing road by id (`r123`; `top_annot.jpg` labels them) with any of `pts`, `width` (the whole road
  reserve, 1 to 60 m), `carriage` (the carriageway, not more than `width`), `kind` (`national` `prefectural` `city`
  `alley` `bridge`), `name` and `nameEn`.
- [v6:c7] `markings` (a patch or a new road) replaces the centre-line rule of `town/streets.js` (`markCentre`: white dashes, 5 m on and 5 m off,
  on every road; [r2:7] there is no default yellow solid line on wide hero carriageways any more: Earth 2026-03-11 shows white dashes, lane lines and edge lines on
  all 8 hero roads of 8.5 m or more that were sampled at 11 px/m, and no yellow) with what the imagery shows:
  `{ "centre": "white-solid" | "white-dashed" | "yellow" | "hatched-median", "medianWidth": 0.5..10, "lanes": [a, b] }`.
  `hatched-median` is a painted median (導流帯): two 0.15 m white solid lines `medianWidth` apart (default 3 m) with
  0.45 m white chevrons at a 5 m pitch between them, and dashed white lane lines. `lanes` (1 to 4 each, default
  `[1, 1]`) counts the lanes on each side: `a` on the right of the median and `b` on its left, looking along the road
  from its first point to its last; the median sits where lanes of equal width put it. [r3:11] `lanes` also works on a `white-dashed` or `white-solid` centre: the centre line sits where equally wide lanes put it
  (`streetlogic.js laneLines`: `[2, 2]` gives the centre at 0 and dashed lane lines at +-cw / 2; `[2, 1]` the centre at -cw / 3 and one lane line at +cw / 3) and every boundary between lanes of one side gets a dashed lane
  line. r12692, r12683, r12665 and r12619 are `[2, 2]` and r12602 `[2, 1]` (c6.json). Not modelled: the 1.5 m-pitch run of parallel lines on r12683 (turn-pocket, arrow or stop-line paint near the junction approaches,
  not a lane count); r12694's lines disagree along its length (-5.7, -0.6, 2.1, 5.1 m at (223,-218) but 7 lines at (183,-205)): measure 3 stations before writing a count. Example (c7.json, r14150 runs
  north to south): `{ "centre": "hatched-median", "medianWidth": 3, "lanes": [1, 2] }` is one lane on the west side
  and two on the east.
- **Remove** a road with `remove: true`.
- **Add** a road with a new id `ovr:<cell>:<name>`. It needs `pts`, `width` and `kind`.

Far alleys are not in `layout.json` but are in `explore.json`, and build-explore applies their patches.

### `props`: a placed object

`type` is `vending`, `bike`, `tree`, `bench`, `bollard`, `busStop` (a city bus stop: pole, sign plate, timetable box; `face` is the bearing the plate looks to) or `brtStop` (a BRT station: red JR panel totem with a solar cap, bench and a kerbed platform strip). Every OSM bus stop and BRT stop is already placed from `enrich.json` on the left kerb of the road a bus uses (`scripts/anime/busstops.js`, `layout.busStops`). `at` is `[x, z]`. `face` is the compass bearing the
front looks to (0 north, which is the default; 90 east). `town/props.js` builds them anywhere in the town, with
colliders.

`y` is optional. It is the height (T.P. metres) of the surface the prop stands on, and you need it where that surface
is not the terrain: a harbour deck, a seawall, or the PIER7 and 迎 terraces. The town is built before the harbour, so
it cannot find those decks itself. To read the height in the app, run `window.__ctx.physics.groundHeight(x, z)` in the
console of a dev page (`tools/anime/serve.mjs`). The PIER7 deck at (20, 60) reads 5.61.

### `crossings` and `arrows`: what the road paint shows

`crossings` [sys:14] (a list in the file): `{ "at": [x, z], "road": "r123", "src": ... }` paints a zebra on that road (mid-block crossings and arms of a
mid junction, which have no zebra by default; add `"diamonds": true` to force the ◇ before it on a narrow carriageway) and
[r3:8] `{ "at": [x, z], "road": "r123", "zebraAt": 11.2, "src": ... }` MOVES the zebra of a hero junction arm: `at` is the real zebra centre and `zebraAt` the arc length from the node to the zebra's centre (the default is R + 3.2,
R = widest arm half-width x 1.1 + 0.4; the arm is the one whose arc length to `at` matches `zebraAt`); the stop line follows (zebraAt + 4) and so do the ◇ marks and lane arrows, and nothing is removed. **Read the real position
only after registering the Earth top on the buildings of the same junction** (`tools/anime/earth-crop.mjs` of the Earth and the app capture of the sub-cell, then the shift that best aligns their edges): a common shift of all
four zebras of a junction is a registration offset, not an arm error. Round 3 checked the ten arms of the audit's list (offsets of 2.5 to 9 m, mixed signs) this way: at 神明崎 (-73,-30) and at (-92.5,-98.5) the Earth top sits
2-5 m east of the app's in the c6 captures, buildings included, and with that shift removed every zebra is within 2 m of the app's (the 'mixed signs' of the list were one eastward shift seen along arms that point opposite ways;
r12605, the control, is a north arm and a shift along x leaves it at 0); at (105.6,-97.9) the claimed shift is the registration shift again. At (-204,-84) and the two junctions at (277.5,-202.6) and (248.9,-219.9) the
app's road geometry itself differs from the Earth (a curved, three-armed layout), so no arm position can be read off. No `zebraAt` is written for any of them; the code, the schema and the tests are in place for a junction
that a locally registered capture shows to be off.
`{ ..., "remove": true }` suppresses the zebra, its stop line and its crossing sign on a hero junction arm when the same road has a removal within 6 m of the
zebra's centre (the stop line stays on a signalised junction). Hero junction arms of 7 m or more get a zebra by default. `town/streetlogic.js`
(`armPlan`, `planMarkings`) decides, `layout.crossingOvr` carries it.

`arrows` [sys:18]: `{ "road": "r123", "node": [x, z], "lanes": ["S", "L"], "src": ... }` paints lane-direction arrows (`S` straight, `L` / `R` turn, `SL` / `SR`
straight or turn), the lanes listed from the driver's left, on the approach of that road to the node nearest `node`: one row 5 m behind the stop line and one 30 m
further back. Paint them only where the lanes are designated (OSM `turn:lanes`, or Earth shows them). ◇ crossing-ahead marks (標示207) are placed
automatically 30 m and 50 m before every zebra of a carriageway of 5.4 m or more, in each inbound lane. [r3:11] Earth shows arrows on many signalised approaches (r12692 near (118,-160)), but at the capture's
resolution (about 5 px/m) their kinds cannot be read: none are written until a 10 px/m or ground view of an approach shows which lanes turn.

## Verifying

- `bun test` covers the schema, the order, every operation and a real layout build with a fixture folder
  (`test/v4-overrides.test.js`, `test/r3-systemic.test.js`).
- With no override files, the layout is byte-identical to a build without this step.
- `earth-ref.mjs` registers its top view on the GSI photo on every run (`registration.earth.scale` is about 1.00 when the Earth camera
  matches; a registration whose NCC is under 0.15, or whose scale sits on the search's edge (outside 0.83-1.22), is marked `failed`) and
  Earth directly against the app (`registration.direct`: scale 0.97-1.03, shift up to 16 px, the identity unless it improves the NCC by 0.005).
  Keep `metrics.roofDEmedian` for the cell from before and after your change: it is the roof colour difference between the Earth top
  view and the app, per lot, through that direct correction (the old correction, the ratio of two GSI registrations, was off by up to 32 %).
- The full accuracy audit (`tools/anime/accuracy.mjs --tiles "x,z"`) scores the cell against the GSI footprints and
  photo. [r3:19] Its headline is scored inside the 1.1 km core disc only (labelled `core-only`); `cells[id].coverage` and `coveredShare` in `accuracy.json` say how much of each accuracy cell was scored, and `--region ortho` measures the rest.
