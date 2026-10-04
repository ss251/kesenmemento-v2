# Fish-market survey (気仙沼市魚市場): C棟 roof deck and the north-facility quay hall

Survey of 2026-10-03 (v6:survey). The on-site photos are measured in metres and the app is checked against them. The photos
themselves never enter git: `raw/survey/market/` (images, COLMAP databases, point clouds) and `docs/shots/v6_survey/`
(overlays) are gitignored.

ENU, as everywhere in the app: x = (lon − 141.5750) × 86744 (east), z = −(lat − 38.9060) × 111014 (south), y = T.P. metres.

## Photos and clusters

| Cluster | Photos | Lens | Registered | Notes |
|---|---|---|---|---|
| `deck` | IMG_0792, 0794, 0795, 0796, 0797, 0798 | 24 mm (4284 × 5712), 14 mm (3024 × 4032) | 6 / 6 | C棟 roof deck, 2026-10-01 17:07, dusk |
| `deck0793` | IMG_0793 | 24 mm | 1 / 1 | solved against the fixed `deck` cameras with 448 SIFT ties to IMG_0792 |
| `canopy` | IMG_0853, 0854, 0855, 0860, 0861 | 77 mm (0853 / 0854 at digital zoom 1.0127, the others 1.002) | 5 / 5 | north-facility quay hall, 2026-10-02 06:53, dawn |
| — | IMG_0852 (fish trays on the floor), IMG_0870 (C棟 hall interior) | 77 mm | 0 / 2 | no overlap with any other photo and no surveyed reference in view |

12 of 14 photos (86 %) are registered. The three clusters do not see each other (the deck and the quay hall are 450 m
apart), so each is tied to ENU by its own references.

## Method

1. **Images.** `heif-convert` (JPEG q95, EXIF kept, the 90° rotation applied, Orientation = 1), one folder per lens:
   `raw/survey/market/images/{w24,uw14,t77}`.
2. **Structure from motion (COLMAP 4.1.1, CPU).** `scripts/survey/market-sfm.sh`: SIFT (16 k features), exhaustive
   matching with guided matching, incremental mapper. ALIKED + LightGlue (`raw/survey/market/aliked.sh`) was tried for the
   deck. What the SfM gave, and why it is not the final solution:
   - **deck:** 7 dusk photos, wide baselines, people walking through, large plain surfaces. SIFT: two 3-photo sub-models;
     ALIKED + LightGlue: 6 photos, 805 points, but through structure-less registrations. In every model the cameras held
     at one hand height sit 0.14 to 0.81 model units above the floor, and the floor tilts 14° from the camera "up": the
     structure is deformed and was not used beyond its matches.
   - **canopy:** 5 frames at 77 mm taken a metre or two apart. With the focal length frozen (it drifted to 12 200 px with
     k2 = 7.9 when refined) all 5 register (0.98 px), but every point lands at the same depth (the bas-relief ambiguity of
     a narrow lens): the rotations are good, the depths are not.
3. **Survey adjustment (`tools/survey/market_adjust.py`).** A bundle adjustment in ENU directly: per photo a rotation and a
   centre, per lens f / k1 / k2, per point ENU x y z, named scalars (the deck T.P., wall offsets). Levenberg–Marquardt with
   the Schur complement on the points, a grouped finite-difference Jacobian, Huber weights on the image observations only
   (a hard reference keeps its full weight), covariance from the Schur blocks. Observations and references:
   - **picks**: corners read off pixel-gridded zoom crops (`tools/survey/market_features.py sheet`) — the studio
     block's canopy, window, louvre box, lamp panels, the wall/studio inside corner in 3 photos each, the entrance canopy,
     the wall's NE corner, the bridge pylon top;
   - **edges**: sub-pixel samples of the wall–deck junction, the wall top, the studio base and parapet top
     (`market_features.py edge`), each on its wall plane and at its height;
   - **automatic ties**: COLMAP's verified SIFT matches (IMG_0792 ↔ 0793; the five quay frames), chained into tracks;
   - **hard references**: GSI base-map lot corners of the penthouse (NE corner (664.8, 962.6), studio corner
     (732.9, 1111.9), σ 1.5 m) and its wall line, the studio's north face line, the louvre box on the GSI ortho (σ 2 m),
     the 気仙沼湾横断橋 north pylon top (1543.8, 115, 1373.8), the layout quay line and its T.P. 1.8 top, the apron at
     T.P. 1.85, the sun-glitter azimuth (astronomy-engine, 107.3° at 06:53:17), licence plates (330 × 165 mm),
     hand-held eye heights (1.45 ± 0.12 m), a roll prior (± 6°) and the GPS fixes (σ 8 m on the deck, 30 m under the
     roof; IMG_0792's fix is 110 m off and is left out).
4. **Features (`tools/survey/market_features.py measure`, input `data/survey/market/picks.json`).** Named features from
   the adjustment's points, from single-view picks cut with a surveyed plane (the penthouse wall plane, the deck at
   T.P. 15.585, the hall's quay face), or from the GSI ortho (the pavilions). Output `data/survey/market/features.json`.
5. **App comparison.** The app registers the same names while it builds (`market5.js` `croofFeatures`, `market4.js` for
   the quay hall; `window.__features('market')`). `tools/anime/survey-diff.mjs --area market` →
   `data/survey/market/diff-before.json`. `tools/anime/photo-align.mjs --area market` renders the app from every solved
   camera (projection from the intrinsics, principal point included) and scores the edges → `data/survey/market/chamfer.json`.

Re-run:

    tools/anime/gate.sh run bash scripts/survey/market-sfm.sh
    ADJ_ITERS=6000 raw/survey/.venv/bin/python tools/survey/market_adjust.py --only deck
    raw/survey/.venv/bin/python tools/survey/market_adjust.py --only deck0793
    ADJ_ITERS=3000 raw/survey/.venv/bin/python tools/survey/market_adjust.py --only canopy
    raw/survey/.venv/bin/python tools/survey/market_features.py measure
    tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/survey-diff.mjs --area market --port 8902 --out data/survey/market/diff-before.json
    tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/photo-align.mjs --area market --port 8902 --tag before

## Registration residuals

| Cluster | Observations | Mean reprojection | Hard references (natural units) |
|---|---|---|---|
| deck | 157 picks / edge samples | 1.90 px (picks σ 1.5–3 px) | GSI studio corner 3.5 m (2.3σ) along z; wall line offset −1.56 m (1.0σ of the GSI prior); studio line −3.1 m (2.1σ); louvre box ≤ 2σ; pylon top 0.7 px; eye heights ≤ 2.6σ (IMG_0794: 1.14 m) |
| deck0793 | 894 SIFT ties | 0.91 px | floor ties on the deck plane, eye height |
| canopy | 4 496 SIFT ties + 17 quay-edge samples | 0.99 px | quay edge on the layout line within 0.4 m, T.P. 1.8 within 0.06 m; glitter azimuth within 1°; hall floor T.P. 2.19 |

Overall mean reprojection error 1.0 px over 5 547 observations (target < 1.5 px).

Lenses: ultra-wide f = 1594 px, k1 −0.032, k2 0.029 (EXIF 14 mm → 1631); main f = 4067 px, k1 −0.046 (EXIF 24 mm → 3960);
tele fixed at the EXIF focal lengths × digital zoom (8969 / 9065 px; refining it drifts with the depth ambiguity).

Solved cameras (`data/survey/market/cameras.json`): the deck photos stand within 1.0 to 5.0 m of their GPS fixes (IMG_0792:
the fix is 118 m off), the quay frames all stood inside the north facility's hall at ≈ (531.5, 657.5), 39 m in from the
quay edge and 27 m inside the open hall, eye T.P. 3.6 — 28 to 132 m from their GPS fixes.

**Accuracy.** The formal 1σ in the table is the adjustment's precision. The absolute frame inherits its references: about
1 to 1.5 m horizontally (GSI base map and ortho, relief displacement of the ortho), about 0.2 m vertically on the deck
(eye heights + the pylon top), 0.15 m in the hall. IMG_0797 is tied to the others only through the eye height, the plates
and its GPS fix (no feature it shares with another deck photo was picked): its horizontal position is good to a few metres
only, and the plates come out at deck height, 0.4 m lower than a car plate sits. Features measured from it are not used.

## Features (BEFORE: the app before the rebuild)

| Feature | ENU x, y, z (m) | 1σ (m) | Method | App Δ (m, 3D) |
|---|---|---|---|---|
| `deck.wall.n_base` | 666.70, 15.59, 963.03 | 0.09 | adjustment (deck:wall.ne_base) | 39.23 |
| `deck.wall.n_top` | 666.71, 22.31, 963.03 | 0.10 | adjustment (deck:wall.ne_top) | 39.23 |
| `deck.wall.s_base` | 733.05, 15.59, 1108.44 | 0.05 | adjustment (deck:wall.se_base) | 27.66 |
| `deck.wall.s_top` | 733.05, 22.15, 1108.44 | 0.04 | adjustment (deck:wall.se_top) | 27.66 |
| `deck.entrance.canopy_nn` | 701.28, 18.76, 1035.05 | 0.28 | adjustment (deck:entrance.canopy_n) | 4.34 |
| `deck.entrance.canopy_ss` | 701.82, 18.76, 1040.53 | 0.39 | adjustment (deck:entrance.canopy_s) | 4.82 |
| `deck.entrance.jamb_n` | 700.20, 15.59, 1036.45 | 0.86 | ray × plane wall (0795) | 3.84 |
| `deck.entrance.jamb_s` | 701.83, 15.59, 1040.02 | 0.82 | ray × plane wall (0795) | 3.54 |
| `deck.letter.1` | 707.35, 20.88, 1052.13 | 0.91 | ray × plane wall (0795) | 7.45 |
| `deck.letter.2` | 705.19, 20.79, 1047.38 | 0.84 | ray × plane wall (0795) | 7.16 |
| `deck.letter.3` | 703.11, 20.71, 1042.82 | 0.82 | ray × plane wall (0795) | 6.66 |
| `deck.letter.4` | 701.01, 20.84, 1038.22 | 0.85 | ray × plane wall (0795) | 6.24 |
| `deck.letter.5` | 699.07, 20.45, 1033.97 | 0.49 | ray × plane wall (0792) | 5.38 |
| `deck.letter.6` | 697.00, 20.80, 1029.43 | 0.56 | ray × plane wall (0792) | 4.93 |
| `deck.letter.7` | 694.83, 20.81, 1024.67 | 0.63 | ray × plane wall (0792) | 4.66 |
| `deck.window#1` | 709.00, 17.41, 1055.73 | 0.97 | ray × plane wall (0795) | 1.23 |
| `deck.window#2` | 707.30, 17.42, 1052.01 | 0.90 | ray × plane wall (0795) | 1.13 |
| `deck.window#3` | 705.60, 17.33, 1048.29 | 0.84 | ray × plane wall (0795) | 1.03 |
| `deck.window#4` | 696.58, 17.39, 1028.51 | 0.57 | ray × plane wall (0792) | 0.93 |
| `deck.window#5` | 694.94, 17.42, 1024.91 | 0.63 | ray × plane wall (0792) | 0.83 |
| `deck.window#6` | 693.27, 17.43, 1021.26 | 0.69 | ray × plane wall (0792) | 0.85 |
| `deck.window#7` | 690.47, 17.51, 1015.12 | 0.79 | ray × plane wall (0792) | 2.31 |
| `deck.window#8` | 688.85, 17.49, 1011.57 | 0.85 | ray × plane wall (0792) | 1.93 |
| `deck.window#9` | 687.15, 17.54, 1007.83 | 0.92 | ray × plane wall (0792) | 1.75 |
| `deck.window#10` | 684.26, 17.49, 1001.50 | 1.02 | ray × plane wall (0792) | 0.68 |
| `deck.window#11` | 682.68, 17.52, 998.05 | 1.09 | ray × plane wall (0792) | 8.06 |
| `deck.window#12` | 681.13, 17.56, 994.63 | 1.15 | ray × plane wall (0792) | 41.89 |
| `deck.window#13` | 678.37, 17.53, 988.58 | 1.25 | ray × plane wall (0792) | 52.83 |
| `deck.window#14` | 676.52, 17.57, 984.53 | 1.33 | ray × plane wall (0792) | not built |
| `deck.window#15` | 674.90, 17.59, 980.98 | 1.39 | ray × plane wall (0792) | not built |
| `deck.window#16` | 731.78, 17.59, 1105.67 | 1.00 | ray × plane wall (0798) | not built |
| `deck.window#17` | 730.23, 17.53, 1102.29 | 0.95 | ray × plane wall (0798) | 63.56 |
| `deck.window#18` | 728.74, 17.48, 1099.01 | 0.90 | ray × plane wall (0798) | 42.76 |
| `deck.window#19` | 726.06, 17.51, 1093.13 | 0.81 | ray × plane wall (0798) | 32.01 |
| `deck.window#20` | 724.56, 17.45, 1089.85 | 0.76 | ray × plane wall (0798) | 24.11 |
| `deck.window#21` | 722.98, 17.38, 1086.40 | 0.71 | ray × plane wall (0798) | 3.38 |
| `deck.window#22` | 720.32, 17.19, 1080.55 | 0.63 | ray × plane wall (0798) | 1.62 |
| `deck.window#23` | 718.74, 17.20, 1077.10 | 0.58 | ray × plane wall (0798) | 1.94 |
| `deck.window#24` | 717.15, 17.28, 1073.61 | 0.54 | ray × plane wall (0798) | 2.29 |
| `deck.pavilion#1` | 685.60, 15.59, 963.30 | 1.50 | GSI ortho z18 (roof rectangle beside its L-shaped shadow), at the deck | not built |
| `deck.pavilion#2` | 691.80, 15.59, 977.20 | 1.50 | GSI ortho z18 (roof rectangle beside its L-shaped shadow), at the deck | 3.52 |
| `deck.pavilion#3` | 704.20, 15.59, 1004.70 | 1.50 | GSI ortho z18 (roof rectangle beside its L-shaped shadow), at the deck | 4.81 |
| `deck.pavilion#4` | 710.60, 15.59, 1018.30 | 1.50 | GSI ortho z18 (roof rectangle beside its L-shaped shadow), at the deck | 9.37 |
| `deck.pavilion#5` | 723.00, 15.59, 1045.20 | 1.50 | GSI ortho z18 (roof rectangle beside its L-shaped shadow), at the deck | 6.72 |
| `deck.pavilion#6` | 729.30, 15.59, 1059.20 | 1.50 | GSI ortho z18 (roof rectangle beside its L-shaped shadow), at the deck | not built |
| `deck.pavilion#7` | 741.90, 15.59, 1086.10 | 1.50 | GSI ortho z18 (roof rectangle beside its L-shaped shadow), at the deck | 13.74 |
| `deck.pavilion#8` | 748.20, 15.59, 1100.10 | 1.50 | GSI ortho z18 (roof rectangle beside its L-shaped shadow), at the deck | not built |
| `deck.cone#1` | 709.50, 15.59, 1030.58 | 0.26 | ray × plane deck (0793) | 5.62 |
| `deck.cone#2` | 710.65, 15.59, 1033.40 | 0.20 | ray × plane deck (0793) | 4.18 |
| `deck.cone#3` | 711.87, 15.59, 1036.36 | 0.14 | ray × plane deck (0793) | 1.91 |
| `deck.cone#4` | 713.21, 15.59, 1038.15 | 0.10 | ray × plane deck (0793) | 0.91 |
| `deck.lifeboat.end_n` | 714.16, 15.59, 1031.30 | 0.23 | ray × plane deck (0793) | not built |
| `deck.lifeboat.end_s` | 716.33, 15.59, 1034.12 | 0.19 | ray × plane deck (0793) | not built |
| `deck.studio.door` | 733.12, 15.59, 1100.50 | 1.02 | adjustment (deck:studio.canopy_lt+studio.canopy_rt) | 21.15 |
| `deck.studio.window` | 739.87, 17.45, 1105.61 | 0.02 | adjustment (deck:studio.winB_tl+studio.winB_tr+studio.winB_bl+studio.winB_br) | not built |
| `deck.studio.mascot` | 738.69, 19.94, 1106.10 | 0.08 | adjustment (deck:studio.mascot) | not built |
| `deck.studio.louvre_ne` | 753.80, 24.96, 1105.25 | 0.41 | adjustment (deck:studio.louvre_tl) | not built |
| `deck.studio.louvre_nw` | 744.36, 24.97, 1109.74 | 0.03 | adjustment (deck:studio.louvre_tr) | not built |
| `canopy.beam_bottom` | 563.77, 5.82, 663.95 | 0.61 | ray × plane shedface (0855) | not built |

| Dimension | Survey | App | Δ app − survey |
|---|---|---|---|
| `deck.y` | 15.585 | 15.23 | -0.355 |
| `deck.wall_h` | 6.603 | 6.4 | -0.203 |
| `deck.studio_h` | 6.534 | 6.4 | -0.134 |
| `deck.pavilions` | 8 | 5 | -3 |
| `deck.wall_len` | 159.83 | 93 | -66.83 |
| `canopy.floor_y` | 2.19 | 2.45 | 0.26 |
| `canopy.open_depth` | 39 | 18 | -21 |
| `canopy.soffit_y` | 5.82 | 9.2 | 3.38 |
| `deck.window (count)` | 24 | 21 | -3 |
| `deck.pavilion (count)` | 8 | 5 | -3 |
| `deck.cone (count)` | 4 | 6 | 2 |

The window group lists the 24 windows picked (15 north of the entrance in IMG_0792 / 0795, 9 at the south end in
IMG_0798), not every window on the wall: the window count of the wall is higher than 24.

## What the survey says about the app (BEFORE)

- **The penthouse is 160 m long, the app's is 93 m.** Its NE corner is 39 m north of the app's, the inside corner with
  the cooking studio 28 m south of the app's: the studio block (door, canopy, louvre box) stands at the south end of the
  deck, at the GSI studio line (z ≈ 1100–1110), not 20 m north of it.
- **The visitors' entrance and the lettering sit 3.5 to 7.5 m from the app's**, south-west of them; letters are at
  T.P. 20.5–20.9, 0.5–0.9 m higher than the app's.
- **Eight pavilions in four pairs** (GSI ortho), not five evenly spaced; the app's are 3.5 to 13.7 m off and three are
  missing.
- **Deck T.P. 15.59** (app 15.23), wall top 6.60 m above it (app 6.40), studio parapet 6.53 m.
- **The quay hall is open 39 m deep** and the camera looks straight through to the quay: the app closes it 18 m in with a
  dark wall, so every quay photo renders as a wall (chamfer below). The outermost ceiling beam is at T.P. 5.8 (3.6 m
  above the hall floor at T.P. 2.19); the app's ceiling is at T.P. 9.2.

survey-diff: 46 features compared, 3D error mean 12.0 m, median 4.8 m, p90 39.2 m, 41 over 1 m; 13 survey features have no
counterpart in the app; 9 of 11 dimensions off.

Edge chamfer, app → photo (photo-align, 1080 × 1440 frame / full resolution):

| Photo | mean px | p90 px | full-res mean / p90 | app edge px |
|---|---|---|---|---|
| IMG_0792 | 9.5 | 24.7 | 37.8 / 98 | 20 867 |
| IMG_0793 | 10.9 | 29.7 | 43.1 / 118 | 19 337 |
| IMG_0794 | 17.5 | 47.1 | 69.5 / 187 | 16 366 |
| IMG_0795 | 12.1 | 30.0 | 34.0 / 84 | 12 127 |
| IMG_0796 | 8.0 | 20.4 | 22.5 / 57 | 16 020 |
| IMG_0797 | 22.9 | 63.0 | 64.0 / 176 | 18 840 |
| IMG_0798 | 13.4 | 40.8 | 37.4 / 114 | 14 340 |
| IMG_0853–0861 | 4.5–17.2 | 8–35 | — | ≈ 1 100 (the app shows one wall) |

The quay-hall numbers are not a match: the app renders its closed back wall in front of the camera, so it has almost no
edges to score.

## Gaps

- IMG_0852 and IMG_0870 are not registered (no overlap, no surveyed reference in view).
- Pavilions are placed from the GSI ortho, not from the photos; their roof heights and the stacks (count, positions)
  are not measured. The lifeboat is measured from one photo (IMG_0793) on the deck plane.
- IMG_0797 is weakly georegistered (see Accuracy).
- The quay hall: only the floor, the open depth and the outermost beam are measured; column 「7」 and the beam grid are not.

## Rebuild (v6:rebuild, AFTER)

The deck and the quay hall are rebuilt to the survey. Every built dimension lives in one spec,
`data/survey/market/model.json` (each block names its measurement in `src`); `harbor/market5.js` builds the C棟 roof
deck from it in the penthouse-wall frame (s along the east wall, off out of it), and `harbor/market4.js` builds the
north facility's 1F hall from its `hall` block. `test/v6-rebuild-market.test.js` pins the spec to `features.json`.

What changed, measured on the photos where the survey had not measured it:

- **Penthouse wall** 1.18 to 161.0 along the wall (159.8 m, was 93 m), top 22.31 → 22.15, 30 windows (24 measured, two
  triplets by the 14.4 m period), vents, the seven 2.4 m letters at the survey's points, the entrance (doors, canopy
  s 81.05-86.27 × 1.56 m, the 0.3 m landing and its two handrails cut in IMG_0795), raised roof sections s 50.8-71.0 and
  99.5-117.4 with rounded caps (IMG_0792 / 0794 / 0795).
- **Cooking studio** across the south end on the surveyed face line: door and its canopy flush with the face (re-cut on
  the face plane in IMG_0794 / 0796 / 0798; the earlier `deck.studio.door`, the mean of the canopy corners, sat 7 m
  north: the three views look along the canopy, 5-10° apart), sign, mascot, louvre box, two wind / solar lamps, flagpole,
  roof rail.
- **Pavilions** 6.6 m wide, eight in four mirrored pairs (outer end swept up to 3.75 m, inner end curled to 2.0 m;
  plinth 0.79, glass top 2.1, fascia 2.5, from IMG_0793 / 0797). #4 from IMG_0793 (SW corner s 73.56 / off 13.7, south
  face 6.6 m); pair 3 from an edge fit of the well-registered IMG_0794 / 0796 / 0798 (west faces off 16; #5 s 94.9-103.2;
  #6 s 107.6-114.5, its south end a corner seen in all three, its north end bounded by the stack S56 in the gap).
  `features.json` now carries these photo measurements for #4-#6 (`picks.json` notes); #1-#3, #7, #8 stay the GSI
  ortho centres. **IMG_0797 is not used for any measurement**: its pose is held only by its GPS fix (the cactus's plate
  cuts 7 m apart in IMG_0796 and IMG_0797, and the two photos' distances to it break the triangle inequality).
- **Stacks** eight: S67 triangulated (IMG_0796 × 0798), S56 and the two south of #4 cut at the measured tip height on
  their IMG_0796 / 0793 bearings (the one behind the lifeboat stands beyond it), the rest by the pair pattern.
- **Lifeboat** 5.30 × 2.30 m (its stencil), stern to the south at s 86.6, keel / sheer / canopy / hatch 0.45 / 1.07 /
  1.92 / 2.23 m (IMG_0793). **Cones** at the survey points (cone #4 re-picked at its footprint: the first pick was half
  way up the cone). **Cars**: the photographed cars are measured (`model.json` `cars`, plates cut at plate height in
  IMG_0796) but not built: they are transient, and box cars add edges that cannot match the photos (+2.7 px in IMG_0796).
- **Parapet rail** at off 23.2 right behind the pavilions (0.6 m clear of pair 3); the strip beyond is a lower roof 3.4 m down.
- **Quay hall**: floor T.P. 2.19, no back wall (open from the quay face to the land-side wall: 39.3 m from the quay edge
  at the cameras' line), edge beam underside 5.82, a girder over the column line and a beam band at d -4, transverse
  beams over the columns, the column marked 「7」 8.1 m inside the face line (its foot cut on the floor in IMG_0853 / 0860),
  columns every 15 m (none other in view over 10.3 m), numbered plates.

survey-diff AFTER (`data/survey/market/diff-after.json`): 59 of 59 features compared (BEFORE 46), 3D error mean 0.14 m,
median 0.08 m, p90 0.19 m; 58 of 59 within max(0.25 m, sigma); 0 over 3 sigma; dims 8 of 9 equal (the window count is
30 built vs 24 picked). The one feature outside: `deck.pavilion#8` 3.87 m (2.6 sigma): the ortho centre would put an
8.3 m pavilion 2.6 m into the studio face, so it is built 1 m short of the face.

| Photo | BEFORE mean / p90 px | AFTER mean / p90 px | look |
|---|---|---|---|
| IMG_0792 | 9.5 / 24.7 | 3.8 / 10.0 | photo |
| IMG_0793 | 10.9 / 29.7 | 5.9 / 15.0 | photo |
| IMG_0794 | 17.5 / 47.1 | 6.0 / 15.2 | photo |
| IMG_0795 | 12.1 / 30.0 | 5.7 / 14.0 | photo |
| IMG_0796 | 8.0 / 20.4 | 4.0 / 10.0 | photo |
| IMG_0797 | 22.9 / 63.0 | 5.2 / 13.3 | photo (pose unreliable) |
| IMG_0798 | 13.4 / 40.8 | 3.2 / 8.6 | photo |
| IMG_0853-0861 | 4.5-17.2 (≈1 100 app edge px: the back wall) | 17.4-20.0 / 43-54 (17-20 k app edge px) | dawn |

**Gaps.** The dawn quay cluster's depth scale looks 2-3x short: at the solved ranges the 2 t truck's cab front (1.7 m)
measures 0.8 m and the 1 t fish tubs 0.46 m (IMG_0855), so the hall items between the cameras and the quay face (tub
rows, conveyor) are not placed from these photos (their bays are kept free of generic clutter), and the boats, truck and
tubs that fill the frames are not modelled: the quay chamfer stays near 19 px. Re-solving the cluster with known sizes
(the truck's 1.695 m width, the tubs) and a free camera height (the photographer may have stood on the 2F gallery) is
the next step. Pavilion pairs 1, 2 and 4 are placed from the ortho, not seen end-on by any photo. Stacks other than the
four measured follow the pattern. The column numbering direction away from 「7」 is assumed.
