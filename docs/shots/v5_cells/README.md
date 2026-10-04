# v5 accuracy sweep: before and after, per cell

Twelve 500 × 600 m cells (`data/anime/overrides/c1.json` … `c12.json`, bboxes in each file) were checked against
Google Earth 3D (imagery dated 2026-03-11, reference only, never committed), the GSI aerial photo (about 2020–22) and
OSM, and corrected with override files ([../../anime/OVERRIDES.md](../anime/OVERRIDES.md)). The integration pass then
fixed the code bugs the cells found.

Each `<cell>.jpg` shows, on top, the GSI aerial photo, v4 before and v5 after, all as straight-down renders of the
same 600 m tile (`tools/anime/accuracy.mjs --saveraw 1`). Below that it shows the app before and after from the cell's
oblique camera, looking north from the south (`tools/anime/earth-ref.mjs --noearth --views top,o0`). `pier7.jpg` shows
PIER7 before and after from three cameras. Only app renders and the GSI photo appear in these images, never Earth
imagery.

"Before" is the same code with no override files (`build-layout.js --overrides none`), which gives the shipped v4
`layout.json` byte for byte. "After" is all twelve files plus the v5 code fixes.

## Metrics (2026-10-01)

**Roof colour against Google Earth 2026.** This is the per-lot CIEDE2000 between the Earth top view and the app's top
render at 12:00, over the lots whose centre is in the cell. Each cell uses a single registration (the before run's)
for both runs (`tools/anime/earth-de.mjs`).

| Cell | Area | Before: median / p90 / lots > 20 | After: median / p90 / lots > 20 |
|---|---|---|---|
| c1 | 三日町・八日町, the city hall, 安波山 | 21.1 / 33.3 / 63 of 119 | 19.5 / 31.9 / 53 of 112 |
| c2 | 太田, 入沢, 陣山, 栄町 | 18.8 / 35.8 / 203 of 440 | 17.7 / 33.1 / 172 of 440 |
| c3 | 魚浜町, 浜町, 本浜町 | 17.9 / 34.6 / 56 of 125 | 14.2 / 30.8 / 35 of 131 |
| c4 | 本浜町 plants, 鹿折川, 浪板 | 18.0 / 28.8 / 30 of 82 | 17.4 / 28.3 / 22 of 81 |
| c5 | 八日町 west, 南町一丁目 | 18.9 / 33.6 / 177 of 388 | 17.8 / 31.2 / 150 of 371 |
| c6 | 魚町, PIER7, 南町 | 19.1 / 37.4 / 136 of 289 | 18.0 / 33.1 / 122 of 298 |
| c7 | 神明崎, コの字岸壁, 港町 | 17.5 / 33.8 / 14 of 38 | 11.3 / 24.4 / 7 of 37 |
| c8 | 浪板 / 小鯖 | 21.5 / 42.1 / 17 of 32 | 15.1 / 41.5 / 13 of 33 |
| c9 | 笹が陣, 幸町, 本郷 | 18.0 / 28.6 / 86 of 219 | 13.9 / 24.1 / 48 of 226 |
| c10 | 南が丘, 河原田, 仲町 | 19.5 / 33.5 / 204 of 430 | 10.5 / 22.9 / 66 of 438 |
| c11 | 港町, 魚市場前 | 17.4 / 35.2 / 33 of 84 | 15.5 / 35.7 / 25 of 87 |
| c12 | 大浦 | 18.9 / 35.7 / 14 of 30 | 10.8 / 25.1 / 5 of 28 |
| **All** | | **1,033 lots over 20** | **718 lots over 20** |

**The GSI audit** (`accuracy.mjs`, truth = GSI footprints and photo of about 2020–22):

| | Before | After |
|---|---|---|
| Core disc (1.1 km round (250, 150)): building IoU / recall / precision | 0.870 / 0.940 / 0.921 | 0.839 / 0.928 / 0.897 |
| Core: roof ΔE vs the GSI photo, median (cast removed) | 7.16 (5.63) | 10.16 (8.52) |
| Core: roads, centre-line recall / IoU | 0.786 / 0.498 | 0.786 / 0.499 |
| The 12 cell tiles: building IoU | 0.860 | 0.827 |
| Landmarks within 5 m | 15 / 15 | 15 / 15 |
| Heights against OSM, the sheets and lotfix: median absolute error | 1.1 m | 1.0 m |

The GSI scores go down on purpose. They score the 2020–22 footprints and photo as truth, so each change the newer
imagery shows counts as an error: 72 demolished buildings removed, 59 buildings built since then added, and roofs
repainted or re-roofed with solar panels. The photo's cyan-green cast is also no longer copied. The core IoU stays
above the target of 0.8.

## Reproduce

Run these from the repository root. The Earth captures are in `raw/ref/earth/<cell>/`, which is gitignored.

```sh
env -u NODE_OPTIONS bun run scripts/anime/build-layout.js --overrides none   # before; without the flag: after
env -u NODE_OPTIONS bun run scripts/anime/build-explore.js --overrides none
env -u NODE_OPTIONS bun run scripts/anime/build-trees.js
tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/accuracy.mjs --port 8850 --out dist/qa5/v5 --tag core_after --lmshots 1
tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/accuracy.mjs --port 8850 --nobuild --region ortho --tile 600 --res 0.6 \
  --tiles "-450,-500;50,-500;550,-500;1050,-500;-450,100;50,100;550,100;1050,100;-450,700;50,700;550,700;1050,700" --saveraw 1 --out dist/qa5/v5 --tag cells_after
tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/earth-ref.mjs --cell c6 --port 8850 --nobuild --noearth --views top,o0 --out raw/ref/earth/v5/c6/after
```

For the `--out` runs, first copy the cell's `earth_top.png`, `earth_o0.png` and `meta.json` into the folder. Then
score both states: `bun tools/anime/earth-de.mjs --state before --layout <the v4 layout.json>` and `--state after`.
