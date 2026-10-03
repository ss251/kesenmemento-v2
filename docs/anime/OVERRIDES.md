# Per-cell overrides

The layout is derived from GSI footprints, OSM and the GSI aerial photo (ARCHITECTURE.md section 2). Where those are
wrong or out of date, a resident notices: a building that was demolished, a car park that is now a plaza, a roof that
is white and not red. An **override file** corrects one **cell** (a small area, usually 100 to 300 m across) with values
read from newer references. `scripts/anime/build-layout.js` folds every override file in as its last step, and
`scripts/anime/build-explore.js` applies the road changes to the far-core streets.

Code: `scripts/anime/enrich/overrides.js` (re-exported by `enrich/fold.js`). Tests: `test/v4-overrides.test.js`.

## Ground truth, in priority order

1. **The client's own photos** (`raw/photos-sailesh/` when it exists; `raw/photos/` holds his photos of the inner-bay
   scale model). [v6:survey] Where an area has a photo survey (`data/survey/<area>/features.json`: solved cameras,
   features measured in metres with a 1-sigma; `docs/anime/survey/<area>.md`), its numbers replace anything placed by
   eye against the photos (phone GPS is 3–10 m off); check a rebuild with `tools/anime/survey-diff.mjs` and
   `tools/anime/photo-align.mjs`. [v6:rebuild] The south shore (PIER7, the plaza, 迎 / ANCHOR, 結, the east promenade) is rebuilt to
   `data/survey/minami/features.json`: every named feature within its 1-sigma (`test/v6-rebuild-minami.test.js`); the survey
   constants live in `harbor/minami5.js` (`CAGE6`, `BLEACH6`, `WINCH6`, `RINGS6`, `WALK6`, `ANCHOR`, `MUK6`, `PIER7_6`) and the
   plaza's paving level in `world/layout.js` `GROUND_PADS`.
2. **Google Earth** (photoreal 3D, imagery dated 2026-03-11), captured for reference only with
   `tools/anime/earth-ref.mjs` (below). **Never ship, commit or paste these captures into the app.** They stay in
   `raw/ref/earth/<cell>/` (gitignored).
3. **The GSI aerial photo** (`data/ortho/core.jpg`, about 2020 to 2022). Building sites on it may be finished now.
4. **OpenStreetMap** (© OpenStreetMap contributors, ODbL).
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
     the road ids and a 20 m ENU grid. Read positions for new polygons straight off it.
   - `meta.json`: the cameras and Earth URLs, the lot legend (number, lot id, kind, height, roof, the Earth and app
     roof colours with their ΔE), the registration against the GSI photo and the metrics.
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
    { "id": "sailesh", "what": "author photo raw/photos-sailesh/IMG_0701.HEIC", "date": "2026-10-01" }
  ],
  "lots": [ ... ], "newLots": [ ... ], "landuse": [ ... ], "roads": [ ... ], "props": [ ... ]
}
```

### `lots`: patch or remove an existing lot

`id` is the layout lot id (`z/x/y/featureIndex`, the numbered legend in `meta.json` gives them). Give any of the
fields below, and always give `src`.

| Field | Values |
|---|---|
| `kind` | `house` `apartment` `shop` `office` `hotel` `public` `school` `warehouse` `factory` `temple` `shrine` |
| `storeys` | integer from 1 to 60. The height follows the kind's storey height unless you also give `height`. |
| `height` | metres from 1.5 to 250, to the roof's eaves or parapet. The storeys follow unless you also give `storeys`. |
| `roof` | `{ "shape": "flat" \| "gable" \| "hip" \| "shed" \| "saw", "color": "#rrggbb", "ridge": "x" \| "z" }`. `x` means the ridge runs along the frontage, and `z` means it runs front to back. |
| `wall` | `#rrggbb` |
| `name`, `nameEn` | the real name that is shown on the building and in search |
| `facade` | `house` `apartment` `office` `shop` `warehouse` `plain` `public` (the window pattern of the mid and far builders) |
| `remove` | `true`, with only `id` and `src`: the building is gone (demolished, or it never existed) |

When a patch changes the kind, only the values that were derived are derived again. A height from OSM or a landmark
stays, and so does a roof shape from OSM or the aerial photo.

```json
{ "id": "16/58541/25068/66", "kind": "shop", "storeys": 2, "roof": { "shape": "flat", "color": "#d6d8d4" }, "src": "earth: flat pale roof, glazed ground floor (top_annot #33)" }
{ "id": "16/58541/25068/70", "remove": true, "src": "earth: demolished; the lot is a car park (pair_o180)" }
```

The builders take override values as measured values, like OSM and aerial ones. Heights and storeys are built as
given, and roof shapes and colours are not replaced by the palette. Every builder draws the roof in the lot's colour:
the street-detail kit (`town/kit/house.js`), the hero office and apartment blocks (`town/blocks.js`), the mid zone and
the warehouses and factories ([v5]; the kit's flat roofs and the blocks' decks used other colours before).

Lots drawn by a dedicated landmark model (`lot.landmark`, magenta in `top_annot.jpg`) keep that model: a patch
changes only their data, and the build log warns. Fix the model itself in its module (`harbor/`, `landmarks/`).

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
| `vacant` | a vacant lot: bare gravel, or rough weeds with `"surface": "weeds"` |
| `park` | mown lawn |
| `plaza` | a pale paved square |
| `apron` | plain asphalt with no stall lines or cars: a quay apron or a works yard |
| `forest` | [v5:fix2] mixed woods: forest land cover and broadleaf / cedar trees (`build-landcover.js`, `build-trees.js`) |
| `cedar` | [v5:fix2] a 杉 plantation: cedar land cover, and 88 % of its trees are cedar cones |
| `felled` | [v5:fix2] a clear-cut strip: bare brown ground, no trees |

`forest`, `cedar` and `felled` are land cover, not draped surfaces: rebuild `build-landcover.js` and `build-trees.js`
after changing one. Every car park, apron, plaza, gravel lot and building site is also painted as paving or town
ground in the land cover, so no photo lawn shows round it.

`fill` ([v5:fix2], `parking` only): the share of the stalls that hold a car, counted on the newest imagery (0 to 1;
the default is 0.2).

Fields: `ring` (at least 3 points), and optionally `holes`, `name`, and `replace: true`. With `replace`, OSM or earlier
land-use polygons whose centre lies inside the ring are dropped. Use it when a car park became a plaza. The polygons
are draped on the terrain in the town, in the streamed core and on the map.
`scripts/anime/build-trees.js` plants no tree on an override surface other than a park, so rebuild the trees after
adding a car park, a vacant lot, a plaza or an apron where the aerial photo showed woods. Each polygon's parked cars are
seeded by its own id and corner, so adding a polygon does not reshuffle the cars of the others.

Tunnels (`tunnel` from OSM or GSI code 2714) are never drawn as asphalt (`town/streets.js`), so there is no need to remove
a tunnel road to clear a strip over a hill.

### `roads`: a patch, a removal or a new road

- **Patch** an existing road by id (`r123`; `top_annot.jpg` labels them) with any of `pts`, `width` (the whole road
  reserve, 1 to 60 m), `carriage` (the carriageway, not more than `width`), `kind` (`national` `prefectural` `city`
  `alley` `bridge`), `name` and `nameEn`.
- [v6:c7] `markings` (a patch or a new road) replaces the centre-line rule of `town/streets.js` (`markCentre`: a yellow
  solid line on hero carriageways of 8.5 m or more, else white dashes) with what the imagery shows:
  `{ "centre": "white-solid" | "white-dashed" | "yellow" | "hatched-median", "medianWidth": 0.5..10, "lanes": [a, b] }`.
  `hatched-median` is a painted median (導流帯): two 0.15 m white solid lines `medianWidth` apart (default 3 m) with
  0.45 m white chevrons at a 5 m pitch between them, and dashed white lane lines. `lanes` (1 to 4 each, default
  `[1, 1]`) counts the lanes on each side: `a` on the right of the median and `b` on its left, looking along the road
  from its first point to its last; the median sits where lanes of equal width put it. Example (c7.json, r14150 runs
  north to south): `{ "centre": "hatched-median", "medianWidth": 3, "lanes": [1, 2] }` is one lane on the west side
  and two on the east.
- **Remove** a road with `remove: true`.
- **Add** a road with a new id `ovr:<cell>:<name>`. It needs `pts`, `width` and `kind`.

Far alleys are not in `layout.json` but are in `explore.json`, and build-explore applies their patches.

### `props`: a placed object

`type` is `vending`, `bike`, `tree`, `bench` or `bollard`. `at` is `[x, z]`. `face` is the compass bearing the
front looks to (0 north, which is the default; 90 east). `town/props.js` builds them anywhere in the town, with
colliders.

`y` is optional. It is the height (T.P. metres) of the surface the prop stands on, and you need it where that surface
is not the terrain: a harbour deck, a seawall, or the PIER7 and 迎 terraces. The town is built before the harbour, so
it cannot find those decks itself. To read the height in the app, run `window.__ctx.physics.groundHeight(x, z)` in the
console of a dev page (`tools/anime/serve.mjs`). The PIER7 deck at (20, 60) reads 5.61.

## Verifying

- `bun test` covers the schema, the order, every operation and a real layout build with a fixture folder
  (`test/v4-overrides.test.js`).
- With no override files, the layout is byte-identical to a build without this step.
- `earth-ref.mjs` registers its top view on the GSI photo on every run. `registration.earth.scale` is about 1.00 when
  the Earth camera matches (measured 1.00 on PIER7, with a 2.2 m offset). Keep `metrics.roofDEmedian` for the cell
  from before and after your change: it is the roof colour difference between the Earth top view and the app, per
  lot.
- The full accuracy audit (`tools/anime/accuracy.mjs --tiles "x,z"`) scores the cell against the GSI footprints and
  photo.
