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

## Fix round 1 (v6:fix1): the quay hall re-solved and rebuilt, deck follow-ups

**Cameras.** The dawn frames' first solve put the cameras 3.6 m up and 39 m from the quay edge; the tubs measured 0.46 m and the
hall closed in 18 m. The re-solve (`tools/survey/market_adjust.py`, cluster `canopy`, `adjust-canopy.json`) frees the camera height and ties the
scale to things of known size: the truck's number plate (0.33 x 0.165 m), its 2.5 m wheelbase and 0.33 m tyre radius, the quay line, the
apron at T.P. 1.84 and the sun-glitter azimuth. Result: **both stands are 5.0 m above the hall floor and 48 m from the quay edge** (on the 2F gallery
by the land wall), 1350 ties at 0.83 px. Independent checks of the metric scale, none of them a constraint: a tub's rim cuts to a
1.44 x 1.19 m rectangle (opposite sides 1.44 / 1.45 and 1.18 / 1.20 m, tub height 0.74 m: a standard 1 m3 fish tub), the truck's cab and
bed meet its 1.695 m width, and the same floor corner cut from the two stands (1.6 m apart) agrees to 0.01-0.05 m (tub corners, conveyor
casters, a hopper leg).

**Measuring.** Floor items are cut on their plane (`tools/survey/market_hall.py`, picks `data/survey/market/hall-picks.json`, output
`hall-features.json`, appended to `features.json` by `market_features.py measure`): 8 tub corners (pitch 1.23 m, a straight line along the quay to
0.1 m over 9 m), 6 conveyor / sorter casters, 2 tyre contacts, 2 hopper legs, 3 curb points and 2 bitts from the adjustment. The quay frame:
a along the layout quay line, d out to sea (negative inland). Overhead, the transverse beam's lower edge is fitted from both stands
(their baseline is across it: a 59.7, bottom T.P. 7.76, 2.9 px); the longitudinal beams lie along the baseline, so only a one-parameter
family is measured (it is drawn at the structurally plausible member, bottom 7.7 at d -34.3 / -27.7, the column girder 7.55, the edge beam 7.2).
The roof edge's shadow on the floor is a straight line at d -34.5 (sun 14.5 deg), which puts the edge at d -19.8.

**What the hall is, and what it overturned.**
- **The roof edge is 19.8 m inland of the quay edge, 7.5 m inside the OSM outline.** The outline is traced on a roof 13 m up (relief
  displacement); `market4.js` moves the whole shed 7.5 m inland (`shiftShed`). The ramp along the shed's land side also sits inside the
  old outline, which says the same.
- **The ceiling slab is at T.P. 11.2**; the girders are 3.5-4 m deep (the transverse girder's face runs past the top of the frame).
- **One column grid: 21.6 m**, not 14.4 m (a 14.4 m grid puts a column in the middle of IMG_0855 / 0861, where there is none): column
  「7」 at a 81.3, d -22 (a 1.5 x 0.3 m face; its left edge is surveyed, its depth is not: its left side is hidden behind the tub stack in
  the photos), the next one on the measured girder at a 59.7. Black band at 3.1-3.85 m above the floor with the yellow numeral.
- **The floor falls from T.P. 2.15 to the apron's 1.84 over the last 12 m** (no step in the photos).
- Built from the measurements: two tub rows (8 and 4 tubs; 1.44 x 1.19 x 0.74 m, rounded body, white rim), the sorting conveyor (belt
  0.39-0.85 m, six casters) with its sorter, the steel hopper and four-high tub stacks beside the column, the 2 t truck (wheelbase 2.47 m)
  on the apron, the yellow / black curb with bitts every 9.65 m, and a simplified 「KD1-875」 (hull, deckhouse a 89.5-95, funnel fin; the
  hull-side plane d +2 is assumed). The generic berths are cut around the surveyed quay (a 28-125 m), so no generic hull, tubs or
  forklifts stand in the frames; `photo-align --area market` clears the live arrival boats.

**Numbers.** `survey-diff`, 83 features compared (`diff-fix1.json`): 3D mean 0.063 m, median 0.031 m, p90 0.151 m, max 0.337 m; none over
1 m, none over 3 sigma; 13 dims, all within tolerance (the shadow line 0.09 m).

| Photo | BEFORE this round (px mean / p90) | AFTER (fix1) | look |
|---|---|---|---|
| IMG_0853 | 19.0 / 43.1 | 10.3 / 26.9 | dawn |
| IMG_0854 | 19.8 / 51.2 | 9.7 / 25.7 | dawn |
| IMG_0855 | 19.1 / 49.1 | 8.6 / 22.1 | dawn |
| IMG_0860 | 20.0 / 54.0 | 11.95 / 30.1 | dawn |
| IMG_0861 | 17.4 / 45.0 | 10.05 / 25.0 | dawn |
| IMG_0792 / 0793 / 0794 | 3.8 / 5.9 / 6.0 | 3.8 / 6.6 / 6.1 | photo |
| IMG_0795 / 0796 / 0797 / 0798 | 5.7 / 4.0 / 5.2 / 3.2 | 6.3 / 4.0 / 5.1 / 3.2 | photo |

The dawn numbers are not 6 px: the metric counts every app edge against the photo's Canny edges, and much of what the hall has in
common with the photo is dark (tub bodies, the soffit, shadowed girders) where the photo has no edge to find (the red edges in
`docs/shots/v6_survey/market/heat_IMG_*.jpg`, `photo-align --heat 1`: green < 4 px, yellow < 12, red beyond); the sea's 250 m depth
cut-off adds a line across every frame. The geometry that has an edge is at 1-3 px (tub rims, conveyor and hopper tops, bitts, curb).

**Deck follow-ups.**
- **Pavilion #8 (resolved, not clamped).** Its roof curl tip is triangulated in IMG_0794 / 0796 / 0798 (3.5 deg ray angle, 6 / 4 / 10 px): s 156.25
  +- 0.8, off 14.0, 4.0 m above the deck. Combined with the ortho centre (s 159.7 +- 1.5; the pavilion's outer end carries the tip) the centre is s 153.8:
  the built pavilion moves 2 m north, ends 3 m short of the studio face, and the survey feature is that measurement (the ortho centre alone
  overlaps the studio by 3 m). 8 of 8 pavilions are now on the survey.
- **Windows: 24, not 30.** The triplet the 14.4 m period put at s 6-14 is plain wall in IMG_0792 (every other window there is a dark strip). The one at s 109-117 is
  in IMG_0794, but at the frame edge on a grazing wall (a ray cut puts it 4-5 m off), so its positions are not measured and it is not built.
  The vents over the unmeasured triplets go too.
- **Cone #4** re-picked in IMG_0795 (footprint centre of the black base): (713.67, 1038.19); the app's cone (from IMG_0793, 3.5 m away) stood 160 px up
  and left. IMG_0793 cuts the same cone 1.1 m from it. The saw-cut joints say why: they are on a 3.0 m grid aligned with the wall (it was 5 m) and the
  joint lines of IMG_0793 and 0798 agree with each other, while IMG_0795's off axis sits 0.85 m off theirs and IMG_0793's s axis 0.55 m off. The
  photo the client compares is IMG_0795 (cone now where it shows, 6.3 px); IMG_0793's cone is now about 0.9 m off in that view. Cones carry three reflective
  bands. Joints: s phase 0.5, off phase 0.0 (`model.json markings.joint`).
- **Deck markings.** The orange-yellow stall line of IMG_0795 is cut at (s 90.92, off 9.55) and (s 90.77, off 11.87); it runs to the frame edge, so its
  far end (off 13.5) is assumed. No other stall line is visible in any deck photo, so no others are drawn.

## Gaps (after fix1)

- The truck stands in all five dawn frames; it is absent from IMG_0853 / 0854 (it drove in later). The boats, the crew and the second vessel with its gangway are
  not modelled; 「KD1-875」 is a hull and a deckhouse with an assumed side plane.
- The ceiling beams other than the transverse girder (a 59.7) are a one-parameter family along the stands' baseline; the column's depth, the other columns,
  the girder grid beyond the frames and the inland wall at d -53.8 are assumed (the camera is 5.9 m inside it). The gallery the photographer stood on is not built.
- IMG_0852 (fish trays) and IMG_0870 (C棟 hall interior) are still unregistered. The deck cameras IMG_0793 and IMG_0795 disagree by about 1 m on the floor plane near the cone.
- The window triplet at s 109-117 and the 3.0 m joint grid away from s 87-115 / off 5-12 are not measured.

## Fix round 2 (v6:fix2): the deck's cars, cones and lifeboat, the IMG_0797 pose, the hall's ceiling, and what the edge metric can and cannot see

What the verifier found: the deck's parked cars were not built (visible in 0793 / 0794 / 0796 / 0797 / 0798), the lifeboat's form and the cones' colour / position differed
from IMG_0793, and the quay hall frames (0853-0861) stood at 8.6-12.0 px against the 6 px bar. The survey diff itself passed (83 features, mean 0.063 m) and still does.

### Cars (`harbor/deckcars6.js`, `data/survey/market/cars.json`, `tools/survey/car_fit.py`)

16 cars, each its own lofted model (no instanced boxes): stations from tail to nose, each a cross-section of the body (sill to belt line) and the greenhouse (belt to roof),
dark glass, black sills and bumpers, silver wheels with the tyre, plates and lamps; 11 types (kei, Cactus, Crown crossover, Mazda 3, Swift, Spacia, RAV4, Aqua, Probox, a 2 t truck,
Stepwgn) at the makes' published sizes. Row A (twelve cars nose-in in the stalls east of the walkway, noses at off 7.8-9.6): silver kei, teal Citroen C4 Cactus, white
Crown, Mazda 3, white Swift, Spacia, dark RAV4, silver Aqua, white van, blue Aqua, two white cars. North group beyond pavilion #4 (IMG_0792 / 0793): the white Honda Stepwgn,
two hatches and a white 2 t truck.

How the stands were found: single-photo cuts of plates and tyre contacts disagree between the solved deck cameras by 1-3 m (below), so each car is fitted in image space:
the convex hull of its lofted body, wheels and roof, projected through the solved cameras and lens model, against the photo's Canny edges over every photo the car stands
in (far cars hidden behind nearer ones left out), free (nose stand s, off; heading) with priors; cars may not overlap and no car body may contain a camera centre. Result:
pitch 2.1-3.4 m, noses within 1.8 m of one line, headings within +-12 deg of "facing the wall".

**IMG_0797 re-posed.** Its pose rested on its GPS fix only (the previous round flagged it unreliable) and the fix was 6 m off: the cactus plate (0.33 m wide) spans
63 px at f = 1594 px, i.e. 8.3 m, while the old pose put the cactus 13.7 m away. `tools/survey/pose0797.py` solves the camera from the five licence plates (corners picked
earlier, known size 0.33 x 0.165 m, 0.23 x 0.12 m for the kei's yellow plate; free stands on the row, one plate height 0.5 +- 0.03 m, headings +-10 deg, eye height 1.7 +-
0.4 m; rms 0.95 sigma): the camera moves from (s 107.7, off 3.0) to (s 102.1, off 0.3), 1.60 m above the deck, heading 59.4 deg (was 56.0). No survey feature is measured from
IMG_0797, so `features.json` is unchanged; its chamfer fell from 5.10 to 4.05 px.

**The near-ground inconsistency (not fixed; the numbers matter).** Points on the deck seen from two solved deck cameras triangulate BELOW the deck plane: the cone #4
footprint (IMG_0793 x IMG_0795) lands at T.P. -0.41 m relative to the deck, three licence plates (IMG_0794 x IMG_0796; they hang 0.5 m above the deck) at -0.30 .. -0.37 m;
single-view cuts of the same cactus plate land at s 91.4 (0794), 94.8 (0796) and 102.5 (0797 first pose): 3-11 m apart. The size cues say the rays are right and the camera
heights are not: the plate's size puts IMG_0794's plate at 7.9 m (cut: 4.9 m), i.e. that camera is about 0.4 m higher over the floor than the adjustment has it (1.14 m; the
adjustment's eye-height prior is 1.45 +- 0.12 m). A trial of the full deck bundle with the plates added (plates 0.5 m above the deck, kei plate 0.23 m) converges to
deck T.P. 14.74 (was 15.585), the penthouse wall offset -3.6 m (was -1.56), camera heights 1.4-1.7 m over the deck and reprojection 1.98 px (was 1.90), i.e. it fits equally
well with every deck feature moved: it was NOT adopted (it would invalidate `features.json` and the rebuild spec; the data to settle it is a level reference on the deck, or the
photographer's eye height). Consequence for the overlays: near-floor objects (cars, cones, the lifeboat trailer) cannot be right in every photo at once; each is placed where it
looks right in most of them. Cone #4 stands at the mid point of its IMG_0795 and IMG_0793 footprint cuts ((89.06, 11.53) and (89.71, 10.54) in the wall frame, 1.1 m apart;
survey feature `deck.cone#4` is that point, sigma 0.6 m); in the two photos it is 95 and 150 px (1080 frame) from the cone instead of 0 and 240.

### Cones and lifeboat

Cones: deep red `#c42f28` (they rendered orange), three white reflective bands (the top one narrower), a red collar, a black rubber base 0.46 m on a thin red plate 0.50 m
(IMG_0793 close-up). Lifeboat (`harbor/lifeboat6.js`): a lofted enclosed boat, 5.30 x 2.30 m (its stencil): round bow, tumblehome hull below the navy rub rail, canopy
deckhouse with the bow dome and a handrail, the raised coxswain's tower (top T.P. +2.23 above the deck) with two windows, two silver-framed hatches a side (the first with
the grey cross, the second with its latch), a trailer cradle on castors. The first version put the boat 2.9 m too far north and 1.3 m too far east and drew its end-on form;
the sheer edge (the navy rub rail), cut at its own height 1.07 m in IMG_0793, runs from s 84.5 / off 13.52 to s 88.32 / off 13.76: west flank at off 13.6, 3.6 deg off the wall
line, bow dome from s 84.0, centreline off 14.75. Colour `#e0432b` (orange-red as photographed).

### Quay hall: what the metric sees

`tools/anime/photo-align.mjs --dump` now writes per-pixel maps (`edges_<id>.png`), `tools/survey/edge_report.py` breaks a chamfer down by row band and 90 px cell, and
`tools/survey/dark_edges.py` splits it into app edges that lie in black flat photo regions and the rest. For the five dawn frames: 5-13 % of the app's edge pixels (the tub rows'
floor contact, the beams' undersides, the hopper's legs) lie in photo regions that are black and flat (mean luminance < 28 / 255, contrast < 22), where the photo has no
edge for any geometry to match; they are 28-33 px from the nearest photo edge and carry 20-27 % of the chamfer sum. A profile across a tub's floor line in IMG_0860 reads
11-23 / 255 on both sides, gradient about 1. The chamfer of the other edges is about 6-8 px (below, "excl. black"). What was changed in the hall:

- **Longitudinal beam `hall.long[1]`** (no survey linkage; the longitudinal members lie along the stands' baseline, so the frames fix only a family): moved to d -32.07 / bottom
  6.92 (was -27.70 / 7.70) with `tools/survey/hall_fit.py`, the metric's own Canny: its three lines go from 20.8 to 4.6 px at the 1080 frame. Held as surveyed: the transverse beams at
  7.76 (`canopy.beam_t1.y`), the column girder on its columns, the slab at 11.2, and the edge beam (its height is tied to the surveyed shadow line `canopy.shadow_d`; the frames'
  edges would put it 1.1 m higher, which the shadow does not allow).
- The truck's hubs are silver, not yellow.
- A fit of the vessel's four boxes to the frames (`tools/survey/vessel_fit.py`: -1.2 m along the quay, hull top +1 m, wireframe edge distance cut by a third) did not improve the
  frames' chamfer (+0.1 px) and was not adopted; a stereo attempt on the rectified pair (`vessel_stereo.py`, `vessel_sift.py`, `vpick.py`) puts the vessel's depth only
  to +-1 m (1 px of disparity = 0.17 m at 50 m on the 0.75-scaled pair, but the hull, house and rigging match poorly across the 1.6 m baseline), so the vessel stays the
  first build (hull-side plane d +2). The truck is in 3 of the 5 frames (it drove in after IMG_0853 / 0854), so those two score its edges against nothing.

### Numbers (fix round 2; `data/survey/market/chamfer.json` tag `fix2`, `diff-fix2.json`)

`survey-diff --area market`: 83 of 83 features compared, 3D mean 0.063 m, median 0.031 m, p90 0.151 m, max 0.337 m (`deck.pavilion#7`); none over 1 m, none over 3 sigma;
13 of 13 dimensions equal (the window count matches, `canopy.shadow_d` 0.09 m). `deck.cone#4` is now the two-photo mid point (sigma 0.6 m).

| Photo | fix1 mean px | fix2 mean / p90 px (1080 frame) | full-res mean px | excl. black regions |
|---|---|---|---|---|
| IMG_0792 | 3.77 | 3.83 / 10.8 | 15.2 | |
| IMG_0793 | 6.57 | 6.99 / 16.6 | 27.7 | |
| IMG_0794 | 6.09 | 6.87 / 16.5 | 27.3 | |
| IMG_0795 | 6.26 | 6.45 / 15.0 | 18.1 | |
| IMG_0796 | 4.00 | 6.01 / 14.9 | 16.8 | |
| IMG_0797 | 5.10 | 4.05 / 10.0 | 11.3 | |
| IMG_0798 | 3.22 | 4.16 / 10.0 | 11.7 | |
| IMG_0853 | 10.3 | 9.72 / 24.3 | 27.2 | 7.10 |
| IMG_0854 | 9.7 | 9.06 / 22.0 | 25.4 | 7.33 |
| IMG_0855 | 8.6 | 7.79 / 18.0 | 21.8 | 6.20 |
| IMG_0860 | 11.95 | 11.60 / 30.8 | 32.5 | 7.94 |
| IMG_0861 | 10.05 | 9.73 / 24.0 | 27.3 | 6.44 |

The deck photos rise by 0.1-2.0 px where the cars now stand (each car is an edge-rich object the photos also have, but 1-2 m of near-floor camera inconsistency, above,
shows) and fall in IMG_0797 (its pose); the 16 cars and the lifeboat form that were missing from the frames are the point of the round. The hall frames improve by 0.1-0.8 px; the
6 px bar is not met there (the 7.8-11.6 px includes 5-13 % of edge pixels that lie in black photo regions at about 30 px; without them the frames read 6.2-7.9 px).

### Gaps (after fix2)

- The deck's near-floor geometry is not consistent between the solved cameras (0.3-0.8 m of height, 1-3 m on the floor at 3-8 m range): cars, cones and the lifeboat trailer
  are compromises; a level reference or a measured eye height would settle the deck T.P. (15.585 vs 14.74 in the plate trial).
- IMG_0795's black car (front wheel cut at s 90.93 / off 10.96) and IMG_0794's silver kei cannot both stand in the first stall of the row in the solved frame: only the kei is built.
- The cars are low-poly lofts, 0.5-1 m high in the overlays; their wheel arches, grilles, mirrors and lamps are generic per type.
- The vessel KD1-875 (hull-side plane d +2, three boxes and a fin), the second vessel with the gangway, the boats and the crew are not modelled to the frames;
  the truck is absent from IMG_0853 / 0854.
- The hall's longitudinal members other than `long[1]`, the transverse beams away from a 59.7, the column's depth and the grid beyond the frames are assumed.

## Fix round 3 (v6:fix3): the quay hall's contents built to the frames (tubs, truck, tug, conveyor), the transient items, and what the edge metric can and cannot say

What the verifier found: the survey numbers pass (83 / 83 features, mean 0.063 m), the edge criterion (about 6 px) does not, and the dawn quay read as a wall and flat boxes:
the tubs were one trough per row, the truck three boxes, the tug 「KD1-875」 four boxes and a fin, the conveyor a slab with a sorter twice too long.

### What was built (all in `harbor/`, from the photos)

- **Tubs (`crate6.js`).** 12 crates + 12 more in three stacks, each its own object: smooth ribbed shell (ribs painted), one rounded rim collar, the lighter interior 0.14 m below the rim,
  two hinged latches on each long rim edge, a base skirt (row-end tub: two runners with a fork pocket between), and the white plates the photos read ("4382 / 気仙沼" on the
  narrow face, "H23補助 / 魚市場" and "寄贈 農林中央金庫 / 魚市場" on the wide one, numbers 4382, 3331, 4484, 3247, 3419 as photographed). 1.44 x 1.19 x 0.74 m, pitch 1.23 m.
  In a row the shells touch (the slit between the rims is open at the top only; below it it is black and shut in the photos), which also keeps the metric from scoring a seam in
  the dark.
- **Truck (`truck6.js`).** The 「JF みやぎ」 2 t flat-bed: extruded cab with raked windshield, door glass, black mirrors, Toyota emblem, headlamps, white bumper and plate
  「宮城 800 あ 95-46」, the logo on the doors; cream bed with drop sides, cab guard and the grey wire-mesh tail panel, the silver fuel tank, wheels with tyre, rim, hub and
  nuts. Width 1.695 m, wheelbase 2.47 m (the two tyre contacts), tyre radius 0.33 m. It drove in after IMG_0853 / 0854 (see `absent` below).
- **Tug (`tug6.js`, `data/survey/market/tug.json`, `tools/survey/tug_spec.py`, `tools/survey/vessel_cut.py`).** Rectangles read off IMG_0861 (raw pixels) and cut onto the plane of
  their face in the quay frame. The hull side plane is d = 1.0 m: the two life rings (0.76 m) come out 0.71 m tall at that plane and 59 m range, the hull foot meets the curb at
  T.P. 1.82 (curb top 1.84), and every cut agrees with the two stands' views to 0.2-0.4 m along the quay (a +-1 m error in d moves a point 0.7 m along the quay, so the plane is good
  to about +-1 m in depth, 0.15 m in height). Built: hull with its bow (a 80 to 98.5, beam 5.4 m), the tall quarter-deck wall (top T.P. 4.08) with the hull marking
  「KO1-875」, three portholes, lamps, the ladder, two life rings, the funnel (raked casing, black cowl, 龍 roundel centred at a 87.7 / T.P. 5.42, 0.68 m), blue drums, the
  stair wedge with its blue coping and rails, the forward house (door, two windows, window slot, roof T.P. 4.69), the pilothouse with its overhang and radar, the gangway (a 94.1
  to 101.4, near handrail cut at d 1.25: rises 0.67 m), the squid boat on the stern side (white house, black rod rack) and the vessel on the bow side (house, mast with ladder).
  The registration at the hull reads 「K?1-875」: the second glyph is crossed by a pole in all five frames and reads as a D or an O; the lettering follows the spec text, KO1.
  Six tug features are in `features.json` (`canopy.tug.ring#1/#2`, `.mark`, `.wall_top`, `.funnel_top`, `.house_roof`, sigma 0.8 m horizontal, 0.15 m vertical) and the hull plane
  is a dimension; they are single-view cuts, so their agreement with the app (0.0-0.2 m) shows the build follows its spec, not an independent check.
- **Conveyor and sorter.** The sorter at the head was measured on the floor and on the head's edges in IMG_0855 (head fully in frame): a 67.7-70.0 and 1.4 m wide (the fix 2 box was a
  66-70 x 3.8 m slab), grate top T.P. 3.63. Built: channel frame, stacked chute bodies, tilted perforated grate, slung drive housing and guard plate, four legs on casters; the
  belt (a 70.0-75.9) with its lettered side panel 「気仙沼魚市場 No.1」, flanges, end plates, underslung channel frame and cross members, thin guide rails behind it, the hose-bib pipe
  at a 78.3 / d -16.6, the free-standing U-rail on the floor ramp (a 86.2 / d -13.4), the hopper's bin lip, chutes and ladder-frame legs.
- **Also in the frames:** the deflector plate hanging under the transverse girder at a 58.8 / d -42.1 (tip T.P. 7.18, triangulated from IMG_0853 x 0861 at 8.1 m range: 0.46 m wide),
  eight black cables hanging left of column 7 (a 79.4-79.9, T.P. 7.6 to 5.7-6.1), the 0.3 m bird-net mesh on the soffit, the floor ramp as one wedge flush with the floor slab and the
  apron, three people (two crew by the squid boat's stern in IMG_0861, a man on the tug's deck by the stair in IMG_0855).
- **`absent`.** `data/survey/market/cameras.json` lists, per camera, the scene objects that were not there when that frame was taken (`hall.truck` in IMG_0853 / 0854, `hall.crew`
  everywhere but IMG_0861, `hall.man` everywhere but IMG_0855); `tools/anime/photo-align.mjs` hides them for that frame only (the objects are unbatched, `ctx.noBatch`). The frames
  before the truck arrived used to score the truck's edges against nothing.
- **Deck cars** (`deckcars6.js`): the side glass is split into panes by B and C pillars in body colour (the greenhouse was one black wedge; the panes are coplanar with the old face, so no edge changes). Alloy spokes and a wheel-arch ring were tried and dropped: spokes at a guessed phase cost IMG_0796 +0.45 px (6.00 -> 6.45), a ring covering the tyre hid the wheel.

### Numbers (`data/survey/market/diff-fix3.json`, `chamfer.json` tag `fix3`)

`survey-diff --area market`: 89 of 89 features compared (83 + the six tug features), 3D mean 0.063 m, median 0.026 m, p90 0.162 m, max 0.337 m (`deck.pavilion#7`, inside its 1.5 m
sigma); none over 1 m, none over 3 sigma; 14 of 14 dimensions equal (the new one: the tug's hull plane).

| Photo | fix2 mean / p90 px (1080 frame) | fix3 mean / p90 px | full-res mean |
|---|---|---|---|
| IMG_0792 / 0793 / 0794 | 3.83 / 6.99 / 6.87 | 3.83 / 6.98 / 6.87 | 15.2 / 27.7 / 27.2 |
| IMG_0795 / 0796 / 0797 / 0798 | 6.45 / 6.01 / 4.05 / 4.16 | 6.45 / 6.00 / 3.95 / 4.16 | 18.1 / 16.8 / 11.1 / 11.7 |
| IMG_0853 | 9.72 / 24.3 | 9.21 / 24.2 | 25.8 |
| IMG_0854 | 9.06 / 22.0 | 8.57 / 22.4 | 24.0 |
| IMG_0855 | 7.79 / 18.0 | 7.61 / 18.0 | 21.3 |
| IMG_0860 | 11.60 / 30.8 | 11.15 / 29.0 | 31.2 |
| IMG_0861 | 9.73 / 24.0 | 9.01 / 21.1 | 25.2 |

The app edges in the dawn frames grew from about 30 000 to 50 000 pixels (crates, truck, tug, conveyor detail all stand in the frames) and the mean still fell by 0.2-0.7 px: the new
geometry lines up with the photos. The 6 px bar is not met in the dawn frames, and the breakdown (`tools/survey/edge_report.py`, rows of the 1080 frame) says why:

| rows | what is there | app edge px | mean px |
|---|---|---|---|
| 0-500 | ceiling members, the deflector plate | 5-8 k | 5-13 |
| 500-800 | tug, truck, gangway, bitts | 14-24 k | 6.7-9.8 |
| 800-1000 | conveyor, hopper, stacks | 10-15 k | 7.1-9.5 |
| 1000-1440 | the two tub rows | 10-17 k | 10-13 |

The tub rows are the worst band because the photo is black there (sun behind the tubs): the tubs' floor contact line and the rim collars' inner edges are real edges that a black
photo cannot show (28-63 px to the nearest photo edge, 29-40 % of the chamfer sum). Everything above them is 6-9 px; IMG_0855, the frame the sorter was measured on, is 7.6 px (6.3 px
without the tub rows).

### Gaps (after fix3)

- Dawn chamfer 7.6-11.2 px (bar: about 6): above, the tub rows' floor contact and the remaining 6-9 px of the tug, gangway and conveyor, which are cut from one photo each (the hull plane
  is good to +-1 m: 0.7 m along the quay). A stereo solve of the vessel needs more baseline than the 1.5 m between the two stands.
- The tug's upper works (radar masts, the blue gantry behind the funnel, rod racks, the rigging) are boxes and posts, not modelled item by item; the squid boat and the bow-side vessel
  are masses with their main features only. The 'second glyph' of the hull marking is unreadable (pole in front).
- The deck's near-ground inconsistency between the solved cameras (above) is unchanged, so the cars stand in the compromise positions: IMG_0794's silver kei and IMG_0798's dark SUV
  are the nearest cars in those photos and are not where the photos put them. Deck photos 0793-0796 stay at 6.0-7.0 px. The three men in IMG_0794, two in IMG_0796 and the walker in IMG_0798 are not built.
- IMG_0852 (fish trays on the floor) and IMG_0870 (C棟 hall interior) are still unregistered: no overlap with another photo and no reference in view.
- The conveyor's underframe, the hopper's scaffold and the ceiling members other than those listed are plausible members, not measured ones. `hall_fit.py` would move the edge beam to d -16.3 / T.P. 8.44 (it fits its photo line, 5.7 px instead of 16.5, and keeps the shadow line) but the beams in front hide that line from every dawn frame, so it changes no pixel of the app's edge maps and is not adopted (`model.json` `edgeFit`). The column girder (d -21.4, T.P. 7.55) and the transverse beam at a 81.3 do not match any photo edge at any height (22-24 px at best): whichever members they are, they are not those boxes.

## FINAL (v6:finish, 2026-10-04)

`survey-diff` (`diff.json`): 89 / 89 features, 0 missing, 3D error mean 0.063 m, median 0.026, p90 0.162, max 0.337 (horizontal mean 0.037 m), none over 1 m or 3 sigma, 14 / 14 dimensions within tolerance.
`photo-align` tag `final`: mean chamfer 7.0 px over the 12 photos (11.9 before), 4 at <= 6 px, 11 at <= 10 px, worst 0860 11.2 px. Tests: `test/v6-finish.test.js`. Procedure: `docs/anime/SURVEY.md`.
