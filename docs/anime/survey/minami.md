# South-shore survey (南町 / 内湾): PIER7, the plaza, 迎 / ANCHOR, 結, 拓, the slow street and the east promenade

Survey of 2026-10-03 (v6:survey). The on-site photos are measured in metres and the app is checked against them. The
photos never enter git: `raw/survey/minami/` (images, databases, point cloud) and `docs/shots/v6_survey/minami/`
(overlays) are gitignored.

ENU, as everywhere in the app: x = (lon − 141.5750) × 86744 (east), z = −(lat − 38.9060) × 111014 (south), y = T.P. metres.

## Photos

57 photos: IMG_0799–0842 (2026-10-01, 17:18–17:22 JST, dusk), 0906–0913 (2026-10-02 16:29, sun: PIER7 street side,
the orange arch) and 0888–0896 (14:59, the east promenade, ~130 m east). Full-resolution JPEGs from the HEICs (EXIF kept,
rotation applied) in `raw/survey/minami/images/{uw14,w24,w48,t77}`; one COLMAP camera per lens: 14 mm ultra-wide and
24 mm main (OPENCV), 48 mm (2× crop of the main sensor) and 77 mm tele (RADIAL). The photos were shot from ~12 standing spots,
turning on the spot (0803–0813 in 20 s, 0825–0832 in 14 s, 0834–0839, 0893–0896, 0907–0913): most pairs have no baseline.

## Method

1. **Matching** (`tools/survey/lgmatch.py`). ALIKED keypoints (COLMAP 4.1.1's own ONNX model, onnxruntime on the CPU) at
   two scales per photo — 2400 px, and an angular-resolution-normalised level (focal ≈ 1150 px, so a 77 mm and a 24 mm
   shot meet at the same pixels per degree) — and LightGlue (PyTorch on the Apple GPU) over
   1355 frustum-overlap pairs; MAGSAC fundamental check. 203 verified pairs (COLMAP's GPU SIFT gave the plaza sweep
   0807–0812 no link to any other spot; CPU FLANN SIFT 106 pairs). `tools/survey/lgdb.py` writes them into a COLMAP
   database; `colmap geometric_verifier` keeps 157 pairs (≥ 15 inliers).
2. **Structure from motion** (`tools/survey/sfm_enu.py`). COLMAP's incremental mapper still splits the set (7 + 12
   photos: rotation-only stations), so the solve is global:
   - relative rotations for every pair (pure-rotation Kabsch or essential matrix, whichever explains the matches; E for
     pairs > 3 m apart by GPS); robust rotation averaging (118 consistent pairs, residual median 0.27°, p90 0.98°) — the
     22 pairs off by > 3° (repeated windows, far hills) are dropped **and their matches leave the tracks**;
   - tracks by union-find over the consistent pairs (35 584 tracks);
   - positions by averaging per-pair baseline directions (2-point RANSAC with the rotations known; 75 pairs, residual
     median 0.9°) with GPS (σ = the phone's own EXIF error estimate, ≥ 3 m), eye-height (DEM + 1.45 m, σ 0.4 m) and
     station priors;
   - bundle adjustment with COLMAP's Ceres adjuster (Schur complement, Cauchy loss) and pose priors, thresholds 60 → 4 px;
     one-spot tracks kept as points so a station's members stay tied; station members held at their station's centroid
     (σ 0.35 m; final spread ≤ 1.0 m); photos failing the checks (GPS > 15 m, eye outside 0.6–3 m, roll > 15°, compass
     > 45°) are de-registered and retried by PnP. `tools/survey/audit.py` prints those checks per photo.
3. **Georegistration** (`tools/survey/refs_auto.py`, `tools/survey/georef_refine.py`). A similarity correction fitted to
   hard references: SfM points (seen from spots > 1.5 m apart) on 12 GSI footprint edges of 迎, PIER7, 結 and 拓
   (data/anime/layout.json), the DEM on the plaza and street, and the camera GPS fixes. Result: yaw **0.56° ± 0.43°**,
   shift **(0.05, 0.02, −0.14) ± (0.16, 0.05, 0.17) m**, scale **0.9999 ± 0.0096** — the GPS-prior solve already sat on
   the footprints. The ANCHOR face (938 points) lies **0.10 m** from its GSI edge, 結's slow-street face 0.02 m, PIER7's
   street face 0.15 m, its NW glass box −0.45 m, 結's road end +0.62 m, 迎's SE face −0.91 m; 迎's bay face −1.58 m (the
   glazed café stands back under the eave from GSI's roof outline) and 4 points on 迎's NW street face −1.75 m. Vertical check: the stair cage's foot measures **T.P. 1.82**, the seawall's documented foot (crest
   T.P. 6.2, 4.4 m high, docs/anime/landmarks/pier7.md); the DEM says 2.12 on the plaza (5 m cells over the old wall).
   Outputs: `data/survey/minami/cameras.json`, `refs.json`, `georef.json`, `raw/survey/minami/points.ply` (27 755 ENU points).
4. **Measurement** (`tools/survey/minami_features.py` + `minami_features_spec.py`, picks in `data/survey/minami/picks.json`
   read off `tools/survey/pick.py` sheets; `tools/survey/region.py` for SfM points / planes in a pixel region). Constructions:
   `tri` (multi-view, σ scaled by the a-posteriori variance factor), `cut` (a pick's ray against a measured vertical plane:
   the cage faces, the ANCHOR façade fitted to 197 SfM points with 3 cm rms), `drop` (feet / tops of plumb edges),
   `ground` (picks on the paving at the measured level), `ringfit` (circle through rim picks at the rim height),
   `bearings` (vertical objects from two standing spots). Every 1-sigma includes the georegistration's.
5. **App comparison.** The app registers the same names while it builds (`minami5.js` `plazaFeatures`, the 迎 block and
   `totem(..., { feature })`; `window.__features('minami')`). `tools/anime/survey-diff.mjs --area minami` →
   `data/survey/minami/diff-before.json`; `tools/anime/photo-align.mjs --area minami --tag before` renders the app from
   every solved camera (projection from the intrinsics) and scores the edges → `data/survey/minami/chamfer.json`.

Re-run:

    scripts/survey/minami-sfm.sh                                    # matching, database, COLMAP verifier / mapper
    KMP_DUPLICATE_LIB_OK=TRUE raw/survey/.venv/bin/python tools/survey/sfm_enu.py --area minami --seed raw/survey/minami/sparse_lg/1
    raw/survey/.venv/bin/python tools/survey/refs_auto.py --area minami --band 2.0
    raw/survey/.venv/bin/python tools/survey/georef_refine.py --area minami
    raw/survey/.venv/bin/python tools/survey/export_cams.py --area minami --model raw/survey/minami/enu_geo
    KMP_DUPLICATE_LIB_OK=TRUE raw/survey/.venv/bin/python tools/survey/minami_features.py
    tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/survey-diff.mjs --area minami --port 8901
    tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/photo-align.mjs --area minami --port 8901 --tag before
    env -u NODE_OPTIONS bun test test/v6-survey-minami.test.js

## Result

- **Registered 53 of 57 photos (93.0 %)**; reprojection **mean 0.72 px, median 0.45 px, p90 1.75 px** over 61 076
  observations (inliers ≤ 4 px). Not registered: 0842 (a close-up of the map board), 0833 (roll 35° after the BA: its
  links are 22–45 matches to the slow-street stations), 0906 and 0910 (the orange arch: their only links to the rest are
  far-hill matches whose rotation disagrees by 73–79° with the compass). 0888 registers with a single observation (its
  rotation from the averaging, its centre from GPS) — treat it as approximate.
- Station spreads after the BA: plaza 0803–0813 0.84 m, 0815–0817 0.92 m, ANCHOR 0825–0832 0.48 m, east 0893–0896 0.28 m.
- Solved heading minus compass: −4° to −13° on the plaza (a local compass bias near PIER7's steel), −1° to +12°
  elsewhere; −35° for 0840/0841 (the steel pergola).
- Lenses (full-resolution px): 14 mm f 1609.7, k1 −0.005; 24 mm f 3978.5, k1 0.121, k2 −0.193; 48 mm f 5622.6;
  77 mm f 9013.9 (k1 −0.04, k2 3.7: narrow field, weakly determined, consistent within the frame).

## What the survey says about the plaza (IMG_0808)

- **The white mesh stair cage** is not a 4.4 × 6.8 m box: it is a **5.43 m** high white steel frame with four rows of mesh
  panels, a **3.6 m** front face (its top-left bay sits on the concrete gate post, under the red beacon) facing 53°, and a
  **21.3 m** side face running NW along 迎's bay terrace (bearing 150°, parallel to 迎's GSI axis). Its corner column stands
  at **(3.73, 47.34)**; its top is level at T.P. 7.22–7.25 (the terrace rail); its foot at T.P. 1.82. The app's corner is
  3.9 m off and its far end 18.4 m off.
- **The bleachers** are five **0.69 m** seat-steps (T.P. 1.82 → 2.41 → 3.09 → 3.90 → 4.61 → 5.27) whose left ends abut the
  cage's side face, fronts facing 19° (the app: 0.45 m steps facing 63°, 6–8 m away); treads ~1.0 m low, ~2.0 m high;
  a central stair of 6 risers (0.21 m) to the tier-2 landing.
- **The 陸閘 winch** posts are 2.67 m tall and 2.4 m apart (app 1.65 m, 1.5 m); **the ring benches** are 4.3–5.0 m across
  and only **0.23–0.33 m** high at the front (app 0.5 m), centres 2.4–2.9 m from the app's.

## Tables
### Cameras

| Photo | Lens | ENU x, y, z (m) | Heading (deg) | Pitch / roll (deg) | Obs | Reproj. (px) | GPS offset (m) | Eye (m) |
|---|---|---|---|---|---|---|---|---|
| 0799 | uw14 | -8.71, 3.58, 65.87 | 128.0 | 8.1 / -1.5 | 535 | 1.0 | 3.26 | 1.58 |
| 0800 | w24 | 18.38, 3.67, 51.84 | 161.9 | 9.0 / -2.7 | 1444 | 0.99 | 7.69 | 1.53 |
| 0801 | uw14 | 18.34, 3.69, 51.71 | 163.7 | 12.4 / -1.1 | 816 | 1.2 | 3.08 | 1.55 |
| 0802 | w48 | 18.31, 3.66, 51.61 | 160.7 | 8.8 / -0.6 | 1442 | 1.17 | 1.27 | 1.52 |
| 0803 | uw14 | 31.42, 3.45, 51.49 | 187.8 | 12.8 / -0.4 | 2084 | 1.28 | 1.73 | 1.4 |
| 0805 | w24 | 31.40, 3.43, 51.43 | 209.7 | 10.0 / 1.2 | 2207 | 0.77 | 1.79 | 1.37 |
| 0806 | w24 | 31.23, 3.41, 51.44 | 227.5 | 7.9 / 1.0 | 2184 | 0.88 | 1.8 | 1.35 |
| 0807 | w24 | 31.29, 3.40, 51.69 | 261.5 | 8.1 / 0.7 | 1514 | 0.71 | 0.94 | 1.34 |
| 0808 | w24 | 31.23, 3.40, 51.62 | 288.3 | 8.3 / 0.3 | 1518 | 0.7 | 1.62 | 1.34 |
| 0809 | w24 | 31.32, 3.39, 51.87 | 325.9 | 7.4 / -0.9 | 1092 | 0.67 | 0.75 | 1.34 |
| 0810 | w24 | 32.63, 3.40, 51.15 | 4.6 | 6.3 / -1.3 | 913 | 0.51 | 3.75 | 1.35 |
| 0811 | w24 | 31.78, 3.46, 51.07 | 48.9 | 6.0 / -1.4 | 1432 | 0.71 | 2.77 | 1.41 |
| 0812 | w24 | 31.41, 3.51, 51.62 | 74.8 | 4.2 / -1.9 | 682 | 0.76 | 1.48 | 1.45 |
| 0813 | w24 | 30.71, 3.40, 52.43 | 148.7 | 3.8 / -0.3 | 1043 | 0.7 | 0.64 | 1.34 |
| 0814 | w48 | 23.99, 3.60, 59.15 | 214.9 | 16.0 / 1.5 | 196 | 0.22 | 7.31 | 1.46 |
| 0815 | w48 | 23.53, 3.46, 59.48 | 181.8 | 12.0 / 2.8 | 510 | 0.46 | 0.91 | 1.32 |
| 0816 | t77 | 22.97, 3.52, 60.86 | 143.4 | 4.8 / 0.6 | 639 | 0.31 | 0.87 | 1.39 |
| 0817 | t77 | 23.02, 3.51, 60.79 | 158.4 | 5.3 / 2.0 | 674 | 0.27 | 0.95 | 1.37 |
| 0818 | t77 | 17.93, 3.51, 62.75 | 302.1 | 7.4 / 2.0 | 78 | 0.15 | 3.89 | 1.38 |
| 0819 | t77 | 14.64, 3.50, 60.75 | 244.1 | 0.2 / 0.8 | 134 | 0.46 | 3.69 | 1.38 |
| 0820 | t77 | 14.54, 3.85, 60.66 | 278.1 | 1.1 / 2.6 | 215 | 0.85 | 3.29 | 1.73 |
| 0821 | t77 | 6.86, 3.47, 63.86 | 254.1 | 1.9 / 3.2 | 246 | 0.4 | 3.21 | 1.3 |
| 0822 | t77 | -2.71, 3.62, 65.67 | 290.6 | 6.6 / 2.0 | 555 | 0.32 | 2.84 | 1.54 |
| 0823 | uw14 | -9.53, 3.45, 69.88 | 122.1 | 5.0 / 0.4 | 547 | 1.01 | 1.79 | 1.52 |
| 0824 | w48 | -10.39, 3.43, 69.07 | 355.2 | 9.6 / 1.1 | 686 | 0.82 | 0.95 | 1.52 |
| 0825 | w48 | -17.10, 3.67, 57.10 | 19.8 | 7.7 / 0.6 | 1763 | 0.75 | 2.51 | 1.56 |
| 0826 | w24 | -17.10, 3.68, 57.04 | 20.9 | 9.5 / 0.5 | 3746 | 0.8 | 2.17 | 1.57 |
| 0827 | w24 | -17.09, 3.68, 57.07 | 24.6 | 11.7 / 0.2 | 3414 | 0.82 | 2.8 | 1.57 |
| 0828 | w24 | -17.01, 3.67, 56.76 | 338.4 | 4.2 / 1.7 | 844 | 0.7 | 2.82 | 1.54 |
| 0829 | w24 | -17.00, 3.67, 56.79 | 287.6 | 3.6 / 2.5 | 732 | 0.92 | 2.55 | 1.54 |
| 0830 | w24 | -17.30, 3.53, 56.71 | 239.1 | 5.5 / 0.9 | 599 | 0.6 | 1.5 | 1.43 |
| 0831 | w24 | -16.76, 3.56, 57.38 | 200.8 | 5.3 / -1.4 | 809 | 0.56 | 2.3 | 1.43 |
| 0832 | w24 | -16.85, 3.57, 57.40 | 173.2 | 5.3 / -1.3 | 758 | 0.37 | 1.44 | 1.44 |
| 0833 | — | not registered (GPS -32.05, 84.8) | compass 132 | | | | | |
| 0834 | w24 | -26.29, 3.21, 85.61 | 327.1 | 6.7 / 0.9 | 2847 | 0.81 | 2.59 | 1.37 |
| 0835 | w48 | -26.29, 3.20, 85.68 | 328.3 | 6.3 / 0.4 | 1396 | 0.44 | 2.61 | 1.36 |
| 0836 | w48 | -26.40, 3.20, 85.89 | 294.2 | 5.2 / 0.4 | 1727 | 0.34 | 2.78 | 1.35 |
| 0837 | w24 | -26.42, 3.20, 85.84 | 299.0 | 5.1 / -0.1 | 3595 | 0.67 | 1.7 | 1.36 |
| 0838 | uw14 | -26.40, 3.23, 85.84 | 304.8 | 6.6 / 0.3 | 3221 | 0.91 | 2.76 | 1.39 |
| 0839 | uw14 | -26.49, 3.23, 85.94 | 279.5 | 5.3 / -0.5 | 2691 | 0.8 | 2.73 | 1.38 |
| 0840 | w48 | -26.73, 3.35, 88.97 | 175.8 | -8.0 / -0.7 | 1541 | 0.32 | 1.31 | 1.49 |
| 0841 | w48 | -26.62, 3.34, 89.02 | 164.2 | -7.8 / -2.4 | 1541 | 0.35 | 1.95 | 1.47 |
| 0842 | — | not registered (GPS -42.65, 84.19) | compass 320 | | | | | |
| 0888 | w48 | 126.86, 2.65, 67.38 | 286.4 | 4.7 / 4.5 | 1 | 0.0 | 0.0 | 1.45 |
| 0890 | w48 | 128.04, 3.63, 64.47 | 344.5 | 4.1 / 0.5 | 79 | 0.36 | 2.9 | 2.25 |
| 0891 | uw14 | 128.13, 3.30, 64.60 | 54.2 | -3.7 / 0.2 | 790 | 0.9 | 4.01 | 1.89 |
| 0893 | w48 | 130.25, 3.34, 68.62 | 27.3 | -2.4 / 0.4 | 528 | 0.18 | 3.72 | 1.43 |
| 0894 | w48 | 129.95, 3.40, 68.90 | 86.9 | 2.4 / -0.4 | 658 | 0.18 | 3.98 | 1.5 |
| 0895 | w48 | 129.98, 3.39, 68.77 | 108.2 | 1.7 / -0.4 | 1107 | 0.41 | 3.91 | 1.5 |
| 0896 | w48 | 130.08, 3.33, 68.66 | 129.1 | 2.5 / -0.2 | 734 | 0.7 | 3.78 | 1.42 |
| 0906 | — | not registered (GPS -33.25, 79.87) | compass 61 | | | | | |
| 0907 | t77 | -25.74, 3.25, 74.56 | 85.7 | 3.2 / -2.0 | 491 | 0.3 | 0.82 | 1.36 |
| 0908 | t77 | -25.75, 3.25, 74.38 | 101.4 | 3.4 / -1.5 | 304 | 0.37 | 0.84 | 1.36 |
| 0910 | — | not registered (GPS -26.75, 74.32) | compass 49 | | | | | |
| 0911 | t77 | -25.81, 3.00, 74.44 | 32.9 | 3.8 / -1.9 | 1437 | 0.68 | 0.74 | 1.11 |
| 0912 | t77 | -25.87, 3.00, 74.40 | 23.6 | 4.3 / -1.7 | 1555 | 0.72 | 0.69 | 1.12 |
| 0913 | t77 | -25.27, 3.01, 74.69 | 1.0 | 7.3 / 0.6 | 64 | 0.24 | 1.19 | 1.13 |

### Georegistration residuals (median offset of the SfM points from the reference, m)

| Reference | n | Before | After | MAD after |
|---|---|---|---|---|
| mukaeru.SE | 19 | -0.746 | -0.909 | 0.078 |
| mukaeru.SW_anchor | 938 | 0.051 | 0.103 | 0.16 |
| mukaeru.SW_nw | 4 | -1.99 | -1.754 | 0.003 |
| mukaeru.NE | 13 | -1.606 | -1.582 | 0.2 |
| pier7.NW_box | 153 | -0.521 | -0.445 | 0.1 |
| pier7.street1 | 36 | 0.516 | 0.151 | 0.203 |
| yuwaeru.S | 6 | -0.304 | 0.02 | 1.005 |
| yuwaeru.road | 69 | 0.582 | 0.622 | 0.142 |
| ground.plaza | 65 | -0.003 | 0.015 | 0.239 |
| ground.street | 40 | -0.234 | -0.216 | 0.054 |
| gps | 53 | 2.3 | 2.33 |  |

### Features

| Name | ENU x, y, z (m) | 1-sigma x / y / z (m) | Method | Views | Note |
|---|---|---|---|---|---|
| `cage.top#1` | 0.83, 7.22, 49.50 | 0.25 / 0.05 / 0.25 | tri | 0807, 0808, 0818 | top-left corner of the cage (the box over the gate post, under the red beacon) [cage.box.tl] |
| `cage.box_bottom` | 0.81, 5.70, 49.49 | 0.25 / 0.05 / 0.25 | tri | 0807, 0808, 0818 | bottom-left corner of that box (it sits on the concrete gate post) [cage.box.bl] |
| `cage.top#2` | 3.73, 7.25, 47.34 | 0.27 / 0.05 / 0.27 | cut | 0808 | top of the corner column (front face / long side face), on the front-face plane through the box corner [cage.corner.top] |
| `cage.top#3` | -6.95, 7.23, 28.94 | 0.37 / 0.06 / 0.37 | cut | 0808 | top of the last post of the long side face (beyond the bleachers) [cage.side.end_top] |
| `cage.foot#2` | 3.73, 1.82, 47.34 | 0.37 / 0.07 / 0.37 | drop | 0808 | foot of the corner column on the paving [cage.corner.foot] |
| `cage.foot#3` | -6.95, 1.82, 28.94 | 0.50 / 0.08 / 0.50 | drop | 0808 | foot of the last post (hidden by the bleachers): the end top at the corner foot's ground level [cage.side.end_foot] |
| `cage.foot#1` | 0.83, 1.82, 49.50 | 0.35 / 0.07 / 0.35 | drop | 0808 | the ground under the top-left box (the gate post's foot), at the corner foot's level [cage.box.foot] |
| `bleach.t2.top#1` | 1.75, 3.09, 43.92 | 0.30 / 0.05 / 0.30 | cut | 0808 | tier 2: the front-top corner at its left end, against the cage face [bleach.t2.left_top] |
| `bleach.t2.bot#1` | 1.74, 2.41, 43.91 | 0.30 / 0.05 / 0.30 | cut | 0808 | tier 2: the front-bottom corner at its left end, against the cage face [bleach.t2.left_bot] |
| `bleach.t3.top#1` | 1.10, 3.90, 42.80 | 0.31 / 0.05 / 0.31 | cut | 0808 | tier 3: the front-top corner at its left end, against the cage face [bleach.t3.left_top] |
| `bleach.t3.bot#1` | 1.09, 3.14, 42.79 | 0.31 / 0.05 / 0.31 | cut | 0808 | tier 3: the front-bottom corner at its left end, against the cage face [bleach.t3.left_bot] |
| `bleach.t4.top#1` | -0.26, 4.61, 40.47 | 0.32 / 0.05 / 0.32 | cut | 0808 | tier 4: the front-top corner at its left end, against the cage face [bleach.t4.left_top] |
| `bleach.t4.bot#1` | -0.26, 3.92, 40.47 | 0.32 / 0.05 / 0.32 | cut | 0808 | tier 4: the front-bottom corner at its left end, against the cage face [bleach.t4.left_bot] |
| `bleach.t5.top#1` | -1.53, 5.27, 38.28 | 0.33 / 0.06 / 0.33 | cut | 0808 | tier 5: the front-top corner at its left end, against the cage face [bleach.t5.left_top] |
| `bleach.t5.bot#1` | -1.52, 4.67, 38.29 | 0.33 / 0.06 / 0.33 | cut | 0808 | tier 5: the front-bottom corner at its left end, against the cage face [bleach.t5.left_bot] |
| `bleach.t1.top#1` | 6.37, 2.34, 35.60 | 0.40 / 0.05 / 0.40 | cut | 0808 | tier 1 (the lowest seat): front-top corner at its right end, where the stair begins [bleach.t1.right_top] |
| `bleach.t1.bot#1` | 6.36, 1.72, 35.63 | 0.40 / 0.05 / 0.40 | cut | 0808 | tier 1: front-bottom corner at its right end, on the paving [bleach.t1.right_bot] |
| `bleach.stair.bot#1` | 1.57, 2.03, 31.58 | 1.35 / 0.07 / 1.35 | ground | 0808 | central stair: left end of the first step nosing (one riser over the paving) [bleach.stair.bot_l] |
| `bleach.stair.bot#2` | 2.50, 2.03, 29.25 | 1.37 / 0.07 / 1.37 | ground | 0808 | central stair: right end of the first step nosing (one riser over the paving) [bleach.stair.bot_r] |
| `ring#1` | 33.63, 1.84, 60.44 | 0.44 / 0.07 / 0.44 | ringfit | 0813 | ring bench centre at the paving (circle fit of 4 outer-top-edge picks, rms 0.21 m) [ringA] |
| `ring#2` | 28.01, 1.84, 62.67 | 0.43 / 0.07 / 0.43 | ringfit | 0805 | ring bench centre at the paving (circle fit of 4 outer-top-edge picks, rms 0.12 m) [ringB] |
| `ring#3` | 21.53, 1.84, 54.58 | 0.41 / 0.07 / 0.41 | ringfit | 0807 | ring bench centre at the paving (circle fit of 3 outer-top-edge picks, rms 0.00 m) [ringC] |
| `ring.tree#1` | 28.05, 1.84, 63.02 | 0.37 / 0.07 / 0.37 | bearings | 0800, 0801, 0803 | ring B's tree trunk from both plaza stations (check of the ring fit) [ringB.tree] |
| `winch.foot#1` | 22.60, 1.84, 49.86 | 0.41 / 0.07 / 0.41 | ground | 0808 | foot of the left post (seen from the plaza) [winch.foot_l] |
| `winch.tip#1` | 22.60, 4.46, 49.86 | 0.51 / 0.09 / 0.51 | drop | 0808 | tip of the pointed post [winch.tip_l] |
| `winch.foot#2` | 21.22, 1.84, 47.89 | 0.46 / 0.07 / 0.46 | ground | 0808 | foot of the right post (seen from the plaza) [winch.foot_r] |
| `winch.tip#2` | 21.22, 4.55, 47.89 | 0.55 / 0.09 / 0.55 | drop | 0808 | tip of the pointed post [winch.tip_r] |
| `mukaeru.box.top#1` | -16.36, 14.67, 40.63 | 0.33 / 0.14 / 0.39 | tri | 0808, 0824 | top (coping) of the 3F box's south corner (SE / street faces) [mukaeru.box.S_top] |
| `mukaeru.box.top#2` | -8.76, 14.98, 36.47 | 0.35 / 0.20 / 0.46 | tri | 0808, 0824 | top (coping) of the 3F box's east corner (SE / bay faces) [mukaeru.box.E_top] |
| `anchor.oval` | -12.76, 5.07, 49.22 | 0.33 / 0.07 / 0.43 | tri | 0826, 0912 | the HAVE A NICE COFFEE oval sign (the C of COFFEE) |
| `anchor.P2.foot` | -10.80, 2.62, 48.95 | 0.27 / 0.05 / 0.27 | cut | 0826 | SE end of the khaki face (where the glazed corner starts), at the sidewalk |
| `anchor.P2.eave` | -10.61, 9.12, 49.14 | 0.27 / 0.05 / 0.27 | cut | 0826 | eave (fascia underside) at the SE end of the face |
| `totem.pier7` | -6.04, 3.08, 72.08 | 0.27 / 0.06 / 0.26 | tri | 0799, 0823, 0907 | PIER7 創 totem: centre of the oval logo |
| `totem.mukaeru` | -11.71, 3.61, 60.19 | 0.29 / 0.13 / 0.36 | tri | 0820, 0824 | 迎 totem: centre of the 迎 glyph |

| Dimension | Value | 1-sigma | How |
|---|---|---|---|
| `cage.h` | 5.429 | 0.08 | corner column top - foot |
| `cage.front_w` | 3.615 | 0.15 | box corner -> corner column, horizontal |
| `cage.side_len` | 21.27 | 0.3 | corner column -> last post, horizontal |
| `cage.front_azimuth_deg` | 53.27 | 0.5 | compass bearing of the front face (mod 180) |
| `cage.side_azimuth_deg` | 149.882 | 0.5 | compass bearing of the side face (mod 180) |
| `bleach.stair.rise` | 0.212 | 0.03 | stair riser: (tier-2 top - paving) / 6 |
| `bleach.tiers` | 5.0 | 0.0 | counted in IMG_0808 (left block; tier 1 at the paving to tier 5) |
| `bleach.rise` | 0.69 | 0.03 | mean riser: (tier-5 top - paving) / 5 |
| `bleach.top_y` | 5.27 | 0.06 | T.P. of the tier-5 seat |
| `bleach.tread` | 1.646 | 0.15 | mean tread perpendicular to the tier fronts (t2-t3 0.98, t3-t4 2.04, t4-t5 1.92 m) |
| `bleach.front_azimuth_deg` | 19.104 | 1.0 | compass bearing of the tier fronts (mod 180) |
| `bleach.stair.risers` | 6.0 | 1.0 | IMG_0808: 5 nosings below the landing at tier-2 level (estimate) |
| `ring.d_out` | 4.666 | 0.4 | outer diameter, mean of rings A and B (A 4.31, B 5.02; C 6.54 m from 3 picks, its left side out of frame) |
| `ring.h` | 0.267 | 0.04 | rim height over the paving at the front (0.33, 0.24, 0.23 m) |
| `winch.post_h` | 2.667 | 0.05 | post tips over the paving |
| `winch.span` | 2.402 | 0.15 | between the two posts |
| `mukaeru.box_top_y` | 14.825 | 0.06 | T.P. of the box's coping |
| `mukaeru.box_se_w` | 8.668 | 0.2 | width of the SE face |
| `anchor.floor` | 2.623 | 0.05 | sidewalk T.P. at the face's SE end |

### BEFORE: app vs survey

| Feature | dx | dy | dz | 3D (m) |
|---|---|---|---|---|
| `winch.foot#1` | -0.46 | +0.36 | -0.50 | **0.77** |
| `winch.tip#1` | -0.46 | -0.61 | -0.50 | **0.91** |
| `anchor.P2.foot` | +1.30 | -0.32 | +1.15 | **1.76** |
| `anchor.P2.eave` | +1.11 | +1.13 | +0.96 | **1.85** |
| `mukaeru.box.top#1` | +0.63 | -0.62 | +1.80 | **2.00** |
| `mukaeru.box.top#2` | -0.27 | -0.94 | +2.08 | **2.29** |
| `ring#1` | -2.33 | +0.36 | +0.36 | **2.39** |
| `winch.foot#2` | +2.24 | +0.36 | +0.75 | **2.39** |
| `anchor.oval` | -0.63 | +0.48 | -2.29 | **2.42** |
| `winch.tip#2` | +2.24 | -0.70 | +0.75 | **2.46** |
| `ring#2` | -2.51 | +0.36 | -1.17 | **2.79** |
| `ring#3` | -2.73 | +0.36 | +0.82 | **2.88** |
| `ring.tree#1` | -2.35 | +0.36 | -1.62 | **2.88** |
| `bleach.t1.top#1` | -2.88 | +0.31 | +1.19 | **3.14** |
| `bleach.t1.bot#1` | -2.88 | +0.48 | +1.17 | **3.14** |
| `cage.top#2` | -0.93 | +0.15 | -3.78 | **3.90** |
| `cage.foot#2` | -0.93 | +1.30 | -3.78 | **4.11** |
| `totem.mukaeru` | +0.51 | +1.25 | -3.99 | **4.21** |
| `totem.pier7` | -1.52 | +1.22 | +4.71 | **5.09** |
| `cage.top#1` | +5.36 | +0.18 | -0.06 | **5.37** |
| `cage.foot#1` | +5.36 | +1.30 | -0.06 | **5.52** |
| `bleach.t5.bot#1` | +3.21 | -0.67 | -5.07 | **6.04** |
| `bleach.t5.top#1` | +3.21 | -0.82 | -5.07 | **6.05** |
| `bleach.t4.bot#1` | +2.40 | -0.37 | -6.36 | **6.80** |
| `bleach.t4.top#1` | +2.39 | -0.60 | -6.36 | **6.82** |
| `bleach.t3.bot#1` | +1.50 | -0.04 | -7.79 | **7.93** |
| `bleach.t3.top#1` | +1.49 | -0.35 | -7.80 | **7.95** |
| `bleach.t2.bot#1` | +1.30 | +0.24 | -8.01 | **8.12** |
| `bleach.t2.top#1` | +1.29 | +0.01 | -8.03 | **8.13** |
| `cage.top#3` | +13.55 | +0.17 | +12.41 | **18.38** |
| `cage.foot#3` | +13.55 | +1.30 | +12.41 | **18.42** |
| `cage.box_bottom` | missing in the app | | | |
| `bleach.stair.bot#1` | missing in the app | | | |
| `bleach.stair.bot#2` | missing in the app | | | |

Summary: 31 of 34 features compared; 3D error mean 5.062 m, median 3.9 m, p90 8.119 m, max 18.423 m; 29 over 1 m.

| Dimension | Survey | App | Delta |
|---|---|---|---|
| `cage.h` | 5.429 | 4.282 | -1.147 |
| `cage.front_w` | 3.615 | 4.4 | 0.785 |
| `cage.side_len` | 21.27 | 6.8 | -14.47 |
| `cage.front_azimuth_deg` | 53.27 | 59.999 | 6.729 |
| `cage.side_azimuth_deg` | 149.882 | 149.999 | 0.117 |
| `bleach.stair.rise` | 0.212 | None | None |
| `bleach.tiers` | 5 | 5 | 0 |
| `bleach.rise` | 0.69 | 0.45 | -0.24 |
| `bleach.top_y` | 5.27 | 4.45 | -0.82 |
| `bleach.tread` | 1.646 | 1 | -0.646 |
| `bleach.front_azimuth_deg` | 19.104 | 63.299 | 44.195 |
| `bleach.stair.risers` | 6 | None | None |
| `ring.d_out` | 4.666 | 4.6 | -0.066 |
| `ring.h` | 0.267 | 0.5 | 0.233 |
| `winch.post_h` | 2.667 | 1.65 | -1.017 |
| `winch.span` | 2.402 | 1.5 | -0.902 |
| `mukaeru.box_top_y` | 14.825 | 14.045 | -0.78 |
| `mukaeru.box_se_w` | 8.668 | None | None |
| `anchor.floor` | 2.623 | 2.3 | -0.323 |
| `cage.top (count)` | 3 | 4 | 1 |
| `cage.foot (count)` | 3 | 4 | 1 |
| `bleach.t2.top (count)` | 1 | 2 | 1 |
| `bleach.t2.bot (count)` | 1 | 2 | 1 |
| `bleach.t3.top (count)` | 1 | 2 | 1 |
| `bleach.t3.bot (count)` | 1 | 2 | 1 |
| `bleach.t4.top (count)` | 1 | 2 | 1 |
| `bleach.t4.bot (count)` | 1 | 2 | 1 |
| `bleach.t5.top (count)` | 1 | 2 | 1 |
| `bleach.t5.bot (count)` | 1 | 2 | 1 |
| `bleach.t1.top (count)` | 1 | 2 | 1 |
| `bleach.t1.bot (count)` | 1 | 2 | 1 |
| `bleach.stair.bot (count)` | 2 | 0 | -2 |
| `ring.tree (count)` | 1 | 3 | 2 |
| `mukaeru.box.top (count)` | 2 | 4 | 2 |

### BEFORE: edge chamfer per photo (app edges -> photo edges, px)

| Photo | Mean (1440 px frame) | p90 | Mean full-res | p90 full-res |
|---|---|---|---|---|
| 0799 | 63.66 | 205.35 | 178.2 | 575 |
| 0800 | 37.85 | 158.8 | 150.1 | 629.9 |
| 0801 | 23.11 | 57.58 | 64.7 | 161.2 |
| 0802 | 17.01 | 38 | 47.6 | 106.4 |
| 0803 | 8.41 | 20.22 | 23.5 | 56.6 |
| 0805 | 11.81 | 28.86 | 46.8 | 114.5 |
| 0806 | 12.74 | 32.98 | 50.5 | 130.8 |
| 0807 | 9.61 | 26.02 | 38.1 | 103.2 |
| 0808 | 6.74 | 17 | 26.8 | 67.4 |
| 0809 | 8.38 | 18.25 | 33.2 | 72.4 |
| 0810 | 10.32 | 34.46 | 40.9 | 136.7 |
| 0811 | 8.34 | 18.03 | 33.1 | 71.5 |
| 0812 | 6.72 | 12.53 | 26.7 | 49.7 |
| 0813 | 15.29 | 35.17 | 60.7 | 139.5 |
| 0814 | 26.08 | 65.19 | 73 | 182.5 |
| 0815 | 17.01 | 41.01 | 47.6 | 114.8 |
| 0816 | 14.34 | 37.64 | 40.1 | 105.4 |
| 0817 | 16.3 | 43.46 | 45.6 | 121.7 |
| 0818 | 24.93 | 66.19 | 69.8 | 185.3 |
| 0819 | 36.45 | 111.84 | 102.1 | 313.2 |
| 0820 | 17.95 | 42.57 | 50.3 | 119.2 |
| 0821 | 15.93 | 38 | 44.6 | 106.4 |
| 0822 | 19.13 | 53.01 | 53.6 | 148.4 |
| 0823 | 76.3 | 258.99 | 213.7 | 725.2 |
| 0824 | 12.42 | 31.33 | 34.8 | 87.7 |
| 0825 | 13.91 | 32 | 39 | 89.6 |
| 0826 | 15.56 | 41.18 | 61.7 | 163.4 |
| 0827 | 15.92 | 41.62 | 63.1 | 165.1 |
| 0828 | 15.01 | 40.31 | 59.5 | 159.9 |
| 0829 | 22.35 | 71.59 | 88.6 | 284 |
| 0830 | 18.32 | 49.02 | 72.7 | 194.4 |
| 0831 | 13.67 | 31.4 | 54.2 | 124.6 |
| 0832 | 13.65 | 37.22 | 54.1 | 147.6 |
| 0834 | 20.42 | 42 | 81 | 166.6 |
| 0835 | 23.76 | 65.37 | 66.5 | 183 |
| 0836 | 20.89 | 63.95 | 58.5 | 179.1 |
| 0837 | 23 | 41.19 | 91.2 | 163.4 |
| 0838 | 41.74 | 137.58 | 116.9 | 385.2 |
| 0839 | 15.67 | 23.02 | 43.9 | 64.5 |
| 0840 | 24.81 | 60.03 | 69.5 | 168.1 |
| 0841 | 36.55 | 91.38 | 102.4 | 255.9 |
| 0888 | 39.66 | 94.05 | 111.1 | 263.3 |
| 0890 | 8.8 | 32 | 24.6 | 89.6 |
| 0891 | 11.41 | 27 | 31.9 | 75.6 |
| 0893 | 15.01 | 26.93 | 42 | 75.4 |
| 0894 | 24.05 | 65 | 67.3 | 182 |
| 0895 | 22.92 | 60 | 64.2 | 168 |
| 0896 | 16.18 | 39 | 45.3 | 109.2 |
| 0907 | 29.31 | 84.76 | 82.1 | 237.3 |
| 0908 | 21.5 | 54.01 | 60.2 | 151.2 |
| 0911 | 23.1 | 71.06 | 64.7 | 199 |
| 0912 | 23.76 | 68.03 | 66.5 | 190.5 |
| 0913 | 19.11 | 52.61 | 53.5 | 147.3 |

All photos: mean 20.88 px, p90 57.28 px (1440 px frame).

## Remaining gaps

- Not yet measured: the walkway bridge (deck, piers), the gate post's top, lamp posts, bollards, guard rails, crossings,
  the orange arch (0906 / 0910 unregistered: they need PnP on surveyed points of the bridge and 迎's SE end), 結 / 拓
  façades and signs beyond the GSI-edge check, the slow-street map board (0842), the east promenade's sculpture, plaque
  and clock tower (0891–0896 are solved; picks pending), boats at the quay and PIER7's deck stilts and sign. The market
  penthouse, pavilions and stacks are not in these photos (450 m away; see `docs/anime/survey/market.md`).
- Single-view features (`cut`, `ground`, `ringfit`) depend on the plaza station's pose; their σ (0.25–1.4 m) says so. The
  stair-bottom nosings (`bleach.stair.bot#k`) are grazing cuts (σ 1.35 m).
- 迎's box corners and the totems triangulate with 17–80 px residuals (the two views do not pick exactly the same point
  on the coping / totem face); their σ is inflated by the variance factor accordingly.

## AFTER: the south shore rebuilt to the survey (v6:rebuild, 2026-10-03)

The app's geometry now comes from the survey's numbers (constants in `src/anime/world/harbor/minami5.js`; checked offline by
`test/v6-rebuild-minami.test.js` and in the built app by `tools/anime/survey-diff.mjs` / `photo-align.mjs`).

**What changed**
- **The white mesh cage** (`CAGE6`): a 21.3 m x 3.6 m white steel frame from the three surveyed corners (front-left box
  over the concrete gate post, corner column, last post), foot T.P. 1.82, top rail 7.24, rails at the plinth 2.04 / 3.13 /
  4.35, the deck beam 5.70, 9 bays of 2.36 m with two grating panels each (painted white grating with dark cells), the deck on
  the beam carrying 迎's terrace on along its length with a grating rail band and two festoons, the gate post, the dark gate
  leaf, the red beacon and horn. Was a 4.4 x 6.8 x 4.28 m box 3.9-18.4 m off.
- **The bleachers** (`BLEACH6`): tiers A-E with their left ends on the cage face at the surveyed heights (2.48 / 3.09 / 3.90 /
  4.61 / 5.27), fronts at 32.4 deg, the 2.1 m stair of 16 risers (0.215 m) to the top deck, the far block of seat steps and its
  landing, floor uplights. Was 0.45 m steps facing 63 deg, 6-8 m off.
- **Survey correction (bleachers):** the first pass took the tier fronts' direction (19 deg) from nosing picks 0.3-0.8 m from
  the camera's eye height, where a horizontal line's direction is ill-conditioned; the rebuild re-measures it from the stair's
  left edge, which is a vertical line in IMG_0808 (x 3164) and therefore radial from the camera (fronts perpendicular: 32.4
  deg; tier 5's top edge, 1.9 m above the eye, gives 38 +- 5). Tier 1 is now cut against the cage face too (`picks.json`
  `bleach.t1.left_*`, `bleach.stair.edge_px`); every tier has a right-end corner (`radial`).
- **Survey correction (oval):** `anchor.oval` is cut on the façade plane (IMG_0826; IMG_0911's cut agrees within 3 cm) instead
  of triangulated from two views 3 deg apart (which put it 1.6 m off the wall).
- **The plaza level**: paving at T.P. 1.83 (`PLAZA_Y`; the ground pad in `world/layout.js` lowers the DEM's pre-2018 2.1-3.6
  m under the plaza and the new forecourt `PLAZA_N` up to the bleachers' far block; the lawn bank `LAWN6` begins west of it).
- **Winch** (`WINCH6`: 2.67 m posts 2.40 m apart at the surveyed feet), **ring benches** (`RINGS6`: surveyed centres,
  diameters 4.31 / 5.02 / 5.15 m, rim 0.27 m, ring B's tree at its two-station position).
- **The walkway** (`WALK6`): from the cage's front face south to PIER7's NW terrace (deck top T.P. 5.5, IMG_0807 / 0808 heights),
  one board-formed pier (IMG_0808 + 0818 edges) and the gate's east post with the 注意 board at (2.5, 66.3): the plaza
  station's bearing 243 deg to the board crossed with IMG_0799's 92 deg to the same post (was a by-eye post at (9, 63)).
- **迎 / ANCHOR** (`ANCHOR`, `MUK6`, `ANCHOR_OVAL`, `TOTEM6`): the face on its SfM plane, floor 2.62, fascia / clerestory / glazed
  corner / café RST / Lander Blue / oval at their cut heights, the 3F box from its two coping corners (top 14.83, 6.2 m deep),
  the totems at their triangulated glyphs (1.6 and 1.8 m tall, not 3 m), the SE deck at the floor level, a 20-riser stair.
- **PIER7** (`PIER7_6`, `BAYFACE6`, `PIER7_NW6`): levels from the SfM points along the bay face (bay deck 4.2, stilts 4.1 m out,
  2F 4.95, 3F 8.6, eaves 8.05 / 11.9 / 12.6), the bay face 1.5 m inside the seawall line, ridges along the axis, the NW
  street corner rebuilt from IMG_0799 / 0823 (glass box 3.8 m in, corner deck T.P. 2.45, stair between column clusters, the
  studio set back behind a railed terrace); the 気仙沼ベイクルーズ banner (in no photo) removed.
- **結 / the slow street**: the colonnade fascia 2.95-4.03 m (IMG_0835 cuts), posts every 1.9 m (was 3.2), festoons spanning
  eave to eave every 3.5 m without the two street poles.
- **The east promenade**: the railing along the quay edge (IMG_0893-0896).
- **Cameras:** IMG_0840 / 0841 (a 2-photo island linked only to each other) were rotated +36 deg about the vertical to their
  compass headings (`cameras.json` `fix`): the SfM rotation turned 拓's slow-street face across the view; the photos show it
  receding on the left. Their positions remain GPS-grade (+-3 m).

**Features (survey-diff, the built app):** 44 of 44 compared, 3D error mean 0.046 m,
median 0.025 m, p90 0.094 m, max 0.273 m; 0 over 1 m, 0
over 3 sigma; every feature within max(0.25 m, its 1-sigma). BEFORE: mean 5.06 m, median 3.90 m, max 18.4 m.

| Feature | BEFORE 3D (m) | AFTER dx / dy / dz (m) | AFTER 3D (m) | 1-sigma 3D (m) |
|---|---|---|---|---|
| `bleach.t3.top#1` | 7.95 | -0.00 / +0.00 / +0.00 | **0.00** | 0.44 |
| `cage.foot#2` | 4.11 | +0.00 / -0.00 / +0.00 | **0.00** | 0.53 |
| `cage.foot#1` | 5.52 | -0.00 / -0.00 / -0.00 | **0.00** | 0.51 |
| `bleach.t2.top#1` | 8.13 | -0.00 / +0.00 / -0.00 | **0.00** | 0.43 |
| `bleach.t4.top#1` | 6.82 | -0.00 / +0.00 / +0.00 | **0.00** | 0.45 |
| `anchor.P2.foot` | 1.76 | -0.00 / -0.00 / +0.00 | **0.00** | 0.38 |
| `bleach.t1.top#1` | 3.14 | -0.00 / +0.00 / -0.01 | **0.01** | 0.42 |
| `totem.pier7` | 5.09 | +0.01 / +0.00 / +0.00 | **0.01** | 0.38 |
| `cage.foot#3` | 18.42 | -0.01 / -0.00 / -0.00 | **0.01** | 0.71 |
| `totem.mukaeru` | 4.21 | +0.00 / -0.00 / +0.00 | **0.01** | 0.48 |
| `bleach.t5.top#1` | 6.05 | -0.00 / +0.00 / +0.01 | **0.01** | 0.47 |
| `cage.top#3` | 18.38 | -0.01 / +0.01 / -0.00 | **0.01** | 0.53 |
| `ring#1` | 2.39 | -0.00 / -0.01 / -0.00 | **0.01** | 0.63 |
| `ring#3` | 2.88 | -0.00 / -0.01 / -0.00 | **0.01** | 0.58 |
| `winch.foot#2` | 2.39 | +0.00 / -0.01 / -0.00 | **0.01** | 0.65 |
| `cage.top#2` | 3.90 | +0.00 / -0.01 / +0.00 | **0.01** | 0.38 |
| `ring#2` | 2.79 | +0.00 / -0.01 / +0.00 | **0.01** | 0.62 |
| `ring.tree#1` | 2.88 | -0.00 / -0.01 / -0.00 | **0.01** | 0.53 |
| `winch.foot#1` | 0.77 | +0.00 / -0.01 / +0.00 | **0.01** | 0.59 |
| `anchor.oval` | 2.42 | -0.01 / +0.01 / -0.00 | **0.01** | 0.39 |
| `cage.top#1` | 5.37 | -0.00 / +0.02 / -0.00 | **0.02** | 0.36 |
| `cage.box_bottom` | new | +0.02 / -0.00 / +0.01 | **0.02** | 0.36 |
| `bleach.t4.bot#1` | 6.80 | -0.00 / -0.02 / +0.01 | **0.03** | 0.45 |
| `winch.tip#1` | 0.91 | +0.00 / +0.04 / +0.00 | **0.04** | 0.73 |
| `bleach.t3.bot#1` | 7.93 | +0.00 / -0.05 / +0.01 | **0.05** | 0.44 |
| `winch.tip#2` | 2.46 | +0.00 / -0.05 / -0.00 | **0.05** | 0.78 |
| `bleach.t1.bot#1` | 3.14 | +0.01 / -0.06 / +0.01 | **0.06** | 0.42 |
| `bleach.t1.top#2` | new | +0.04 / +0.00 / -0.04 | **0.06** | 0.65 |
| `bleach.t2.top#2` | new | +0.04 / +0.00 / -0.04 | **0.06** | 0.66 |
| `bleach.t3.top#2` | new | +0.05 / +0.00 / -0.05 | **0.07** | 0.66 |
| `bleach.t2.bot#1` | 8.12 | +0.01 / +0.07 / +0.01 | **0.07** | 0.43 |
| `bleach.stair.bot#1` | new | +0.06 / +0.01 / -0.03 | **0.07** | 0.65 |
| `bleach.t5.bot#1` | 6.04 | -0.01 / -0.07 / +0.00 | **0.07** | 0.47 |
| `bleach.t4.top#2` | new | +0.05 / +0.00 / -0.05 | **0.07** | 0.66 |
| `bleach.t4.bot#2` | new | +0.05 / -0.02 / -0.05 | **0.07** | 0.66 |
| `bleach.t5.top#2` | new | +0.05 / +0.00 / -0.05 | **0.07** | 0.67 |
| `bleach.stair.bot#2` | new | +0.07 / +0.01 / -0.04 | **0.08** | 0.66 |
| `bleach.t3.bot#2` | new | +0.06 / -0.05 / -0.04 | **0.08** | 0.66 |
| `bleach.t1.bot#2` | new | +0.06 / -0.06 / -0.03 | **0.09** | 0.65 |
| `bleach.t2.bot#2` | new | +0.06 / +0.07 / -0.04 | **0.09** | 0.66 |
| `bleach.t5.bot#2` | new | +0.05 / -0.07 / -0.06 | **0.10** | 0.67 |
| `mukaeru.box.top#2` | 2.29 | -0.00 / -0.16 / -0.00 | **0.16** | 0.61 |
| `mukaeru.box.top#1` | 2.00 | +0.00 / +0.16 / -0.01 | **0.16** | 0.53 |
| `anchor.P2.eave` | 1.85 | -0.19 / +0.05 / -0.19 | **0.27** | 0.38 |

| Dimension | Survey | BEFORE app | AFTER app |
|---|---|---|---|
| `cage.h` | 5.429 | 4.282 | 5.42 |
| `cage.front_w` | 3.615 | 4.4 | 3.616 |
| `cage.side_len` | 21.27 | 6.8 | 21.275 |
| `cage.front_azimuth_deg` | 53.27 | 59.999 | 53.32 |
| `cage.side_azimuth_deg` | 149.882 | 149.999 | 149.868 |
| `bleach.stair.rise` | 0.215 | None | 0.215 |
| `bleach.tiers` | 5 | 5 | 5 |
| `bleach.rise` | 0.69 | 0.45 | 0.688 |
| `bleach.top_y` | 5.27 | 4.45 | 5.27 |
| `bleach.tread` | 1.736 | 1 | 1.737 |
| `bleach.front_azimuth_deg` | 32.39 | 63.299 | 32.498 |
| `bleach.stair.risers` | 16 | None | 16 |
| `ring.d_out` | 4.666 | 4.6 | 4.665 |
| `ring.h` | 0.267 | 0.5 | 0.27 |
| `winch.post_h` | 2.667 | 1.65 | 2.67 |
| `winch.span` | 2.402 | 1.5 | 2.405 |
| `mukaeru.box_top_y` | 14.825 | 14.045 | 14.825 |
| `mukaeru.box_se_w` | 8.668 | None | 8.664 |
| `anchor.floor` | 2.623 | 2.3 | 2.62 |

**Edge chamfer, BEFORE vs AFTER** (`chamfer.json` tags `before` / `after`; app geometric edges to the photo's Canny edges,
1080 x 1440 frame, the photo's own look: `photo` for the 10-01 dusk set, `sunny` for 10-02 14:59 / 16:29):

| Photo | Before mean / p90 (px, 1440 frame) | After mean / p90 | Change |
|---|---|---|---|
| 0799 | 63.66 / 205.35 | 22.03 / 78.85 | -41.6 |
| 0800 | 37.85 / 158.8 | 11.97 / 25.02 | -25.9 |
| 0801 | 23.11 / 57.58 | 12.38 / 29.15 | -10.7 |
| 0802 | 17.01 / 38 | 7.49 / 18.44 | -9.5 |
| 0803 | 8.41 / 20.22 | 7.52 / 18 | -0.9 |
| 0805 | 11.81 / 28.86 | 9.42 / 24.02 | -2.4 |
| 0806 | 12.74 / 32.98 | 13.15 / 35.51 | +0.4 |
| 0807 | 9.61 / 26.02 | 11.07 / 30.81 | +1.5 |
| 0808 | 6.74 / 17 | 5.66 / 13.34 | -1.1 |
| 0809 | 8.38 / 18.25 | 9.27 / 20.02 | +0.9 |
| 0810 | 10.32 / 34.46 | 9.71 / 30 | -0.6 |
| 0811 | 8.34 / 18.03 | 8.21 / 15.81 | -0.1 |
| 0812 | 6.72 / 12.53 | 6.63 / 12.08 | -0.1 |
| 0813 | 15.29 / 35.17 | 14.24 / 32.57 | -1.0 |
| 0814 | 26.08 / 65.19 | 29.04 / 98.62 | +3.0 |
| 0815 | 17.01 / 41.01 | 13.88 / 34.23 | -3.1 |
| 0816 | 14.34 / 37.64 | 12.65 / 35.36 | -1.7 |
| 0817 | 16.3 / 43.46 | 14.08 / 38.91 | -2.2 |
| 0818 | 24.93 / 66.19 | 14.13 / 38.99 | -10.8 |
| 0819 | 36.45 / 111.84 | 23.07 / 80.05 | -13.4 |
| 0820 | 17.95 / 42.57 | 13.5 / 39.46 | -4.4 |
| 0821 | 15.93 / 38 | 16.01 / 35.23 | +0.1 |
| 0822 | 19.13 / 53.01 | 19.1 / 51.89 | -0.0 |
| 0823 | 76.3 / 258.99 | 28.4 / 98.4 | -47.9 |
| 0824 | 12.42 / 31.33 | 10.97 / 27.89 | -1.4 |
| 0825 | 13.91 / 32 | 14.09 / 32.28 | +0.2 |
| 0826 | 15.56 / 41.18 | 9.12 / 22.09 | -6.4 |
| 0827 | 15.92 / 41.62 | 8.66 / 21.84 | -7.3 |
| 0828 | 15.01 / 40.31 | 13.74 / 35.69 | -1.3 |
| 0829 | 22.35 / 71.59 | 22.26 / 71.39 | -0.1 |
| 0830 | 18.32 / 49.02 | 18.21 / 47.21 | -0.1 |
| 0831 | 13.67 / 31.4 | 13.55 / 30.27 | -0.1 |
| 0832 | 13.65 / 37.22 | 11.03 / 26.17 | -2.6 |
| 0834 | 20.42 / 42 | 15.44 / 34 | -5.0 |
| 0835 | 23.76 / 65.37 | 21.47 / 55 | -2.3 |
| 0836 | 20.89 / 63.95 | 15.66 / 47.01 | -5.2 |
| 0837 | 23 / 41.19 | 24.94 / 77.89 | +1.9 |
| 0838 | 41.74 / 137.58 | 26.76 / 80.15 | -15.0 |
| 0839 | 15.67 / 23.02 | 26.72 / 43.83 | +11.0 |
| 0840 | 24.81 / 60.03 | 20.32 / 48.26 | -4.5 |
| 0841 | 36.55 / 91.38 | 16.68 / 39.85 | -19.9 |
| 0888 | 39.66 / 94.05 | 37.79 / 93.41 | -1.9 |
| 0890 | 8.8 / 32 | 8.81 / 32 | +0.0 |
| 0891 | 11.41 / 27 | 11.45 / 27.46 | +0.0 |
| 0893 | 15.01 / 26.93 | 14.36 / 29.07 | -0.7 |
| 0894 | 24.05 / 65 | 21.86 / 60.02 | -2.2 |
| 0895 | 22.92 / 60 | 23.26 / 60.64 | +0.3 |
| 0896 | 16.18 / 39 | 16.09 / 38.9 | -0.1 |
| 0907 | 29.31 / 84.76 | 25.16 / 68.18 | -4.1 |
| 0908 | 21.5 / 54.01 | 20.68 / 56 | -0.8 |
| 0911 | 23.1 / 71.06 | 16.31 / 42.38 | -6.8 |
| 0912 | 23.76 / 68.03 | 20.31 / 57.43 | -3.5 |
| 0913 | 19.11 / 52.61 | 18.46 / 49.82 | -0.6 |

All 53 photos: mean 20.88 -> 16.17 px, median 17.01 -> 14.24 px, mean p90 57.3 -> 43.2 px; <= 6 px: 1, <= 10 px: 11.

**Remaining gaps (AFTER)**
- The chamfer target (<= ~6 px everywhere) is met only by IMG_0808; 11 photos are <= 10 px. What remains is mostly
  unsurveyed detail the app draws by eye: festoons and string lights (thin, everywhere in the dusk set), tree crowns, the
  slow-street shopfront furniture, boats at the quay (0888, 0894, 0895), PIER7's NW roof form (0799, 0823, 0907: 22-28 px)
  and the 1F glazing mullions; and weakly tied cameras (0819 / 0820: 134 / 215 observations, the walkway underside fits but
  the view through the gate does not; 0840 / 0841 positions).
- Still not surveyed: lamp posts, bollards, guard rails, crossings, the orange arch (0906 / 0910 unregistered), 結 / 拓 signs and
  the map board, the east promenade's sculpture / plaque / clock tower, PIER7's stilt count (built every 4.2 m along the wall,
  not counted), the walkway's piers beyond the two measured.
- The zz-photos.json forecourt landuse entry applies on the next layout build (the runtime plaza paving is minami5.js's own).
