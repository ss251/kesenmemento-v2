# Surveying a street from phone photos (v6:survey)

How to turn a handful of phone photos of a place into measured metres, rebuild the app to them, and prove it. Used for the
PIER7 plaza / south shore (`docs/anime/survey/minami.md`) and the fish market (`docs/anime/survey/market.md`). Read those two
for the worked numbers; this page is the procedure.

**Why.** A phone's GPS is 3-10 m off and its compass 5-35 deg off near steel, so geometry placed "by eye against the photo"
is wrong by metres. The photos themselves are far more precise than their metadata: the pixels of a wall seen from two
places fix where the wall is. The survey solves every photo's exact camera from the pixels, pins the solve to the world with
hard references (GSI footprints, the DEM), measures each element in metres with its 1-sigma, rebuilds the app to the
numbers, and checks the app against them numerically and by rendering from the solved cameras.

ENU, as everywhere: x = (lon - 141.5750) * 86744 (east), z = -(lat - 38.9060) * 111014 (south), y = T.P. metres.

Rules that do not bend: the photos, any image embedding them (overlays, pairs, pick sheets) and `raw/` never enter git
(`raw/` and `docs/shots/v6_survey/` are in `.gitignore`); heavy steps run under `tools/anime/gate.sh`; node and bun are
prefixed `env -u NODE_OPTIONS`. Keep the anime style (toon materials, outlines, painted textures): accuracy means
positions, dimensions, proportions, counts, colours and signage placement, not photoreal surfaces.

## 0. Setup (once)

- COLMAP 4.1.1 CPU (`/opt/homebrew/bin/colmap`), a Python venv `raw/survey/.venv` with numpy, scipy, opencv, pycolmap,
  torch (Apple GPU for LightGlue), onnxruntime, lightglue.
- `tools/anime/survey/lib.mjs` is the JS geometry kit (COLMAP reader, camera models, Umeyama, plane / line fits, LM,
  triangulation; tests in `test/v6-survey.test.js`).

## 1. Choose the area and prepare the photos

1. An area is a few hundred metres at most: one `--area <name>` (lower case) with its own folders
   `raw/survey/<area>/`, `data/survey/<area>/`, `docs/anime/survey/<area>.md`.
2. Convert the HEICs to full-resolution JPEG q95 with the EXIF kept and the rotation applied (`heif-convert`; every frame
   upright, Orientation = 1). Sort them by lens: `raw/survey/<area>/images/{uw14,w24,w48,t77}/IMG_xxxx.jpg`. One COLMAP
   camera per lens (14 mm ultra-wide and 24 mm main: `OPENCV`; 48 mm crop and 77 mm tele: `RADIAL`). The focal prior is
   `f_px = f35 / 43.27 * diag_px`.
3. Shoot-list advice for the next visit (what made the solve hard): move between shots. Turning on the spot gives pure
   rotation and no depth; two standing spots 3-10 m apart, 6-10 photos each, with each wall seen from both, is what
   triangulates. Keep 20-30 % overlap between neighbours, avoid people and cars filling the frame, and shoot the
   things to be measured square on at least once (a plumb edge, a facade, the paving).

## 2. Structure from motion, georegistered (`scripts/survey/<area>-sfm.sh`)

Copy `scripts/survey/minami-sfm.sh` and change `--area`. It runs:

1. `tools/survey/lgmatch.py`: ALIKED keypoints (COLMAP's own ONNX model) at two scales plus LightGlue over frustum-overlap
   pairs, MAGSAC fundamental check. (COLMAP's GPU SIFT gave nothing for turn-on-the-spot sets; CPU SIFT is the fallback,
   `scripts/survey/market-sfm.sh`.)
2. `tools/survey/lgdb.py` writes a COLMAP database; `colmap geometric_verifier` keeps pairs with >= 15 inliers.
3. `colmap mapper` (incremental) gives a first model. When it splits into fragments (rotation-only stations do),
   `tools/survey/sfm_enu.py` solves globally: rotation averaging, baseline-direction position averaging with GPS / eye
   height / station priors, a COLMAP Ceres bundle adjustment with pose priors; photos failing checks (GPS > 15 m, eye outside
   0.6-3 m, roll > 15 deg) are de-registered and retried by PnP (`tools/survey/audit.py` prints the checks).
4. **Georegister** (`tools/survey/refs_auto.py` then `georef_refine.py`): fit a similarity to hard references: SfM points on
   GSI footprint edges of buildings in `data/anime/layout.json` (listed in `FACES` in `refs_auto.py`; add the area's
   buildings), the DEM on open paving, the GPS fixes. Targets: yaw < 1 deg, shift < 0.3 m, scale 1 +- 0.01. If the
   references disagree with each other by more than their sigma, believe the sharper one (a footprint edge over the DEM) and write
   the disagreement into the area doc.
5. `tools/survey/export_cams.py --area <area>` writes `data/survey/<area>/cameras.json` (the shared schema in
   `raw/survey/COORD.md`) and `raw/survey/<area>/points.ply`.

Where the SfM is weak (a few tele frames from one spot; plain surfaces) solve the cameras in a hand-picked adjustment
instead: `tools/survey/market_adjust.py` (tie points read off pick sheets plus the hard references, in ENU directly).

**Acceptance for `cameras.json`** (held by `test/v6-finish.test.js` and `test/v6-survey-minami.test.js`): >= 85 % of the
photos registered, mean reprojection < 1.5 px (the plaza solve: 53 of 57, 0.72 px), quaternion unit norm, eye height
0.6-3 m over the DEM, roll < 15 deg.

## 3. Measure

1. Make pick sheets: `tools/survey/pick.py sheet --area A --out s.jpg IMG:u:v:r:label ...` (zoomed crops with a pixel grid in
   full-resolution coordinates, so a pick is good to 1-2 px). `pick.py proj` shows where an ENU point lands in each photo
   (use it to check a pick), `pick.py view` makes a gridded full frame.
2. Read the pixels of each corner, edge and foot into `data/survey/<area>/picks.json` (`{ picks: { name: { IMG_xxxx: [u, v] } } }`).
3. Choose the right construction per feature (`tools/survey/<area>_features.py`; the plaza's in
   `minami_features.py` / `minami_features_spec.py`): `tri` (two or more views), `cut` (one view against a measured vertical
   plane or `region.py ycut` against a level), `drop` (the foot of a plumb edge under a measured top), `ground` (paving at
   the measured level), `ringfit` (a circle through rim picks), `bearings` / `tri3.py bear` (vertical objects from two
   spots). `region.py pts / plane` pulls SfM points and fits planes inside a pixel polygon (facades).
4. Name features as the app will name them (`stair.foot#1` ... `#k` marks an unordered group). Dimensions (heights, widths,
   counts) go in `dims`. Every feature carries its 1-sigma (picks 1.5-2.5 px, plus the georegistration's).
5. Output: `data/survey/<area>/features.json` `{ features: [{ name, enu: [x, y, z], sigma: [sx, sy, sz], method, views,
   res_px }], dims: [{ name, value, sigma }] }`. Schema and ranges are tested in `test/v6-finish.test.js`.

Read the photo, not just the numbers: a count (posts, windows, stilts, banners), a colour and where each sign sits are
measurements too, and a 1-sigma that looks too good usually means a degenerate fit (three picks on a circle fit with
rms 0; the plaza's ring C was exactly that and turned out to be an open C-shaped arc).

## 4. Register in the app and rebuild

1. In the area's module, register the same names while it builds: `ctx.features?.add('<area>', 'name', [x, y, z])`,
   `ctx.features.group(area, name, pts)`, `ctx.features.dim(area, name, value)` (`src/anime/core/features.js`;
   `window.__features(area)` and `window.__featureDims(area)` dump them). Register at the final built position
   (after any clamp), not at the intended one.
2. Rebuild the element from the numbers, not from the picture: constants named after the survey (`CAGE6`, `BLEACH6`,
   `WINCH6`, `RINGS6` in `harbor/minami5.js`), positions in ENU, heights from T.P. A survey outranks by-eye placement
   (`docs/anime/OVERRIDES.md`). The old by-eye objects are removed, not hidden under the new ones.
3. Things that were not there on the day (a truck, a boat) are listed under `absent: [object names]` in that photo's camera
   so they do not count against it (unbatched objects, `ctx.noBatch`).
4. Gate any change that adds textures: the phone tier must stay under about 240 MB of texture (section 6).

## 5. Verify numerically and visually

    tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/survey-diff.mjs --area A --port 89xx
    tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/photo-align.mjs --area A --port 89xx --tag final

- `survey-diff` builds the app headless, reads `window.__features(A)` and writes `data/survey/A/diff.json` and `app-features.json`:
  per feature the offset in metres (`dx dy dz`, 3D, horizontal, vertical) and in sigmas, per dimension the delta, per group the
  count. **Tolerance:** every feature within `max(0.25 m, its own 1-sigma)`, none over 1 m or 3 sigma, no feature missing, no
  dimension or count off (`test/v6-finish.test.js` re-derives the diff from the stored JSON and checks it).
- `photo-align` renders the app from every solved camera (the eye pose from the solve, a projection matrix built from the
  intrinsics, principal point included), undoes the photo's lens distortion, extracts the app's geometric edges (normal +
  depth pre-pass; texture lines are not geometry) and the photo's Canny edges, and writes
  `docs/shots/v6_survey/A/{overlay,pair,app}_IMG_xxxx.*` (gitignored) and `data/survey/A/chamfer.json`: the distance from every
  app edge pixel to the nearest photo edge pixel, in px of a 1440 px frame (also at full resolution). A perfect model scores
  1-3 px however busy the photo; a wall 1 m off at 20 m with a 24 mm lens scores about 50 px. The edge metric reads
  structure, not signage, colour or lettering: always **look at the pair** (`pair_IMG_xxxx.jpg`, photo beside app render) and
  the cyan overlay; tilted lines, a missing storey or a wrong colour show up there before they show up in the number.
- Typical bars from the first two areas: mean chamfer <= 12 px (plaza 11.2, was 20.9 before the rebuild) and <= 8 px (market
  7.0, was 11.9), none above 25 px. The plaza key photo IMG_0808 scores 5.2 px (6.7 before).
- Treat the metric's limits honestly: a photo whose camera is only GPS-accurate (two-photo islands, `registered: false`) cannot
  be scored; say so in the area doc and list it under "Remaining gaps".

Re-run the verify, read the pairs, fix the worst by measurement (go back to step 3 for that element), and repeat until the
list of blockers is empty or documented. Each round keeps its `diff-<tag>.json` and `chamfer` tag so the improvement is on record.

## 6. Tests, phone tier, build

    env -u NODE_OPTIONS bun test                                              # all green
    env -u NODE_OPTIONS bun test test/v6-finish.test.js                       # the survey's schemas, tolerances, determinism
    tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/phonemem.mjs --port 89xx
    tools/anime/gate.sh run env -u NODE_OPTIONS bun run scripts/build-web.js   # must print "ok": true

`phonemem` runs the 390 x 844 DPR 3 touch tier: `errors` must be 0 (a 404 for `/api/live` on the static server is expected),
`texMB` about 240 MB or less, `crashed` false.

## 7. Write it up

`docs/anime/survey/<area>.md`: photos and dates, the method, the registration numbers, a features table (survey vs app,
metres and sigmas), the chamfer per photo, what changed in the rebuild, and **Remaining gaps**. Update the landmark sheets in
`docs/anime/landmarks/` for the elements that moved (measured dimensions, with the photo ids that fix them), the tool rows in
`docs/ARCHITECTURE.md`, and pick 4-6 showcase pairs (the best-scoring and the key photo) into `docs/shots/v6_survey/showcase/`
(local only).

## File map

| What | Where |
|---|---|
| Photos, SfM databases, points, pick sheets | `raw/survey/<area>/` (gitignored) |
| Solved cameras, picks, features, diffs, chamfers | `data/survey/<area>/{cameras,picks,features,diff,app-features,chamfer}.json` |
| Python survey tools | `tools/survey/*.py`, `scripts/survey/*.sh` |
| JS geometry kit, align and diff tools | `tools/anime/survey/lib.mjs`, `tools/anime/{photo-align,survey-diff}.mjs` |
| App registry of named features | `src/anime/core/features.js`, `window.__features(area)` |
| Overlays, pairs, showcase | `docs/shots/v6_survey/` (gitignored) |
| Area write-ups | `docs/anime/survey/{minami,market}.md` |
| Tests | `test/v6-survey*.test.js`, `test/v6-rebuild-*.test.js`, `test/v6-fix3-*.test.js`, `test/v6-finish.test.js` |
