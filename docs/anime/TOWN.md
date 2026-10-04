# Town package (v3:town)

The town of Kesennuma on the real GSI data: every building footprint, every road centre-line and every pole run from
`src/anime/world/layout.js`, built as a detailed anime-style town around the inner bay and as simplified / instanced
buildings out to the edge of the city. Module: `src/anime/world/town/index.js` (`build(ctx)`), built after
`environment` and `water`, before `harbor` and `life`.

Engine credit: the house generator, street furniture, bicycles, cars, vending machines and pole atlases are vendored
from Sakuragaoka Station by Kenton-GMI (MIT, `src/anime/LICENSE-sakuragaoka-station`) with Kesennuma text and fictional
local brands.

## What it builds

| Part | File | What |
|---|---|---|
| Hero buildings | `hero.js`, `kit/*` | The Sakuragaoka Station house generator on the real footprints (houses, 2-3 storey shop houses), front yards with block walls, gates, garden trees and pots; rows of potted plants where a house sits on a lane |
| Shops | `shops.js`, `signs.js`, `names.js` | 64 fictional shops (鮮魚, 寿司, 酒店, 喫茶, 乾物, ふかひれ, 食堂, 菓子, 青果 ...). Ground floor set back into a real room: tiled or wooden floor, painted shelf wall, counter, warm ceiling lights. Fronts: `wa` (lattice, noren, brush board, pent roof, lanterns, sugidama), `modern` (aluminium glass front, fascia board, awning), `open` (tilted display tables of fish trays / crates / dried goods, bare bulbs, price cards), `cafe` (tiled sill, chalk menu), `shutter` (closed today). Projecting vertical signs on the corner |
| Big buildings | `blocks.js` | マンション blocks: balconies on the sunny long face (parapets, partitions, sliding doors with curtains, laundry, AC units), open corridors with steel doors, stair tower, elevator shaft, rooftop tank, vertical building name. Offices and public buildings: ribbon windows using life's window material, spandrels, glass entrance with canopy, rooftop plant |
| Port sheds | `industrial.js` | warehouses, cold stores, fish-processing plants: corrugated walls (rust-streaked near the quays), loading docks, roll-up shutters (some open onto pallets and fish boxes), company names painted on the walls (`COMPANIES`), turbine vents, refrigeration units, saw-tooth roofs, stainless tanks and a chimney on plants |
| Mid zone | `mid.js`, `facade.js` | every mid footprint as a simplified building: procedural facade shader (window grids per style, shopfront band, warehouse ribs and rust, night windows), real roof shapes with eaves, barge boards and ridge caps, flat roofs with parapets and rooftop units, shop awnings, apartment balcony slabs |
| Far zone | `far.js` | ~16,000 remaining footprints as instanced bodies and gable / hip / flat roofs in two rings (the near ring casts shadows) |
| Streets | `streets.js`, `sakura/street_*` | asphalt ribbons + junction fillets draped on the terrain (never over the sea); raised paver sidewalks with granite curbs and tactile paving on the wide hero streets; gutter covers and white edge lines on the lanes; centre lines, zebra crossings with stop lines, 止まれ glyphs + stop lines on minor approaches, manholes, repair patches; 止まれ / 30 / 駐車禁止 / crossing / blue guide signs, convex mirrors, guardrails where the edge drops away |
| Poles and wires | `poles.js`, `sakura/poles_atlas.js` | concrete poles on `POLE_RUNS` plus extra runs along the lanes: textured shaft, guard sleeve, step bolts, number plate, wrap ads, 6.6 kV crossarm with insulators, low-voltage rack, telecom clamps, transformers, street-light arms (registered with life's light registry). Per span 3 HV + ground wire + 3 LV + 2 telecom cables with sag, cross-street spans, service drops to the facades |
| Parking and vacant land | `parking.js` | 月極駐車場 lots on the open flat land beside the streets (asphalt pads, stalls, wheel stops, P sign, detailed kei cars near the street hearts and instanced cars elsewhere); the remaining open land becomes grassy 空き地 with susuki clumps and the odd 売地 sign |
| Props | `props.js` | vending machines (layout spots, shop fronts, house walls), ママチャリ bicycles, ケヤキ-like avenue trees on the wide sidewalks, beer crates, fish boxes, pots, buckets, garbage stations |
| Gardens | `gardens.js` | lawns, shrubs, garden trees and small cedars around houses in the hero and mid zones (instanced, the environment's tree style) |
| Palette | `palette.js` | photo-sampled colours pushed toward the anime palette: warm pastel walls, dark green / slate / navy / brown / red / terracotta pitched roofs, green-coated flat roofs, faded shed colours |

## Services (published for life and harbor)

```js
ctx.services.town   = { poles, spans, shops: [{ lotId, name, type, x, z, rotY }], lanterns, gates, buildingNames, windows: [] };
ctx.services.street = { edges, gutters, walkPaths: [[x, z], ...][], crosswalks, junctions, stops };
ctx.services.poles  = { poles: [{ id, x, z, y, top }], spans: [{ points: Vector3[], kind }] };
```

life uses `street.walkPaths` for walkers, `poles.poles` to step round poles, `poles.spans` for birds on wires; street
lights on poles and shop lanterns are registered with `life/lights.js` (`streetlight`, `lantern`).

## Run

```
# screenshots (town harness: build report + optional --eval)
tools/anime/gate.sh chrome env -u NODE_OPTIONS bun src/anime/world/town/dev/shot.mjs --port 8812 \
  --only environment,water,town,harbor,life --cams "hero;-114,-179,-150,3;150,-128,125,2" --hours 16.5 --out shots/town/x
# the standard tool works too
tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/shot.mjs --port 8812 --only environment,water,town --cams hero
# headless build check (budgets)
env -u NODE_OPTIONS bun tools/anime/check.mjs town
# tests
env -u NODE_OPTIONS bun test test/v3-town.test.js
```

Good cameras: `hero` (16:30 drone), `120,25,-60>60,8,-140` (low drone over 魚町), `150,-128,125,2` (waterfront road
into the sunset), `-114,-179,-150,3` (八日町 lane with the sake shop), `-160,62,149,2` (南町 かき処), `-1800,1400,3500>900,0,300`
(whole city). Page parameter `?townlod=0|1|2` forces one detail level for every hero lot (debug).

## Budgets and numbers

- Triangles: 3.12 M (budget 3.2 M): hero kit 1.29 M, streets 0.27 M, poles 0.38 M, parking 0.25 M, props 0.38 M,
  gardens 0.23 M, mid 0.11 M, far 0.39 M.
- Canvas textures: 23.4 M px (budget 24 M).
- Build: about 2.3 s headless (bun); 8 to 11 s inside headless Chrome at background priority (`nice` + `taskpolicy -b`,
  so several times slower than a normal browser tab).
- Detail follows the street hearts (`FOCI` in `index.js`): full detail within about 100 m, medium within about 220 m, and
  quiet back lots use the simplified builder. `quality.heroR` shrinks the full-detail radius; the low tier keeps
  8 detailed cars and a 650 m garden radius.

## Look notes

- Fictional names only (`names.js`); real place names appear only as place signage (気仙沼駅, 魚市場, 内湾, 八日町 ...).
  Sensitive names and wording are left out everywhere (a test enforces both).
- Deterministic: every random choice comes from `ctx.rng(<lot id / road id>)`; two builds are identical (tested).
- 止まれ glyphs read upright for the approaching driver (top of the canvas cell = far end).
