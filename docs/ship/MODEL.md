# 第一昭福丸: the ship model and livery

`src/anime/world/ship/shofukumaru1.js` builds SHOFUKU MARU No.1 (7KFY, MG1-2112) at true scale in the app's cel style.
`ship/livery.js` paints her livery atlas. `ship/flags.js` decides which livery a page may show.
`tools/anime/ship-profile.mjs` checks the side profile against the nendo model photos.
`test/ship-model.test.js` covers the dimensions, the 舷門, the budgets, the flags and the fallback.

Sources: `docs/ship/shofukumaru-dossier.md` (the captain's dossier) and the reference photos in `raw/ref/shofukumaru/`.
The photos are copyrighted and live only in `raw/`, which is never committed.

## Frame and API

- `s` is metres aft of the stem head. `h` is metres above the waterline, which is the top of the red antifouling.
- The local origin is on the centreline at the waterline, at midship (s = 29.3 m).
- Local +Z points forward, so `z = 29.3 - s`. +Y is up. Port is +X and starboard is −X, as in `harbor/boats.js`.

```js
import { buildShofukumaru, SHIP } from './world/ship/shofukumaru1.js';
const ship = buildShofukumaru(ctx, { livery: 'nendo' | 'fallback', tier: 'high' | 'phone' });
ctx.add(ship.group);             // the caller adds and poses the group (it moves)
await ship.ready;                // resolves when the nendo data has been painted (or failed; the fallback stays)
ship.update(dt, t);              // radars turn, the propeller spins (setPropeller(rps)), and 大漁旗 flutter
ship.setFlags(true);             // 大漁旗 / 福来旗 dressed from the stem over the three masts to the stern
ship.setNight(0..1);             // lamps and windows; without a call the ship follows ctx.shared.uNight
ship.dispose();
```

If you leave out `livery`, `flags.js` picks it. If you leave out `tier`, `ctx.quality` picks it.

`ship.anchors` holds local `[x, y, z]` points:
- `gangwayStbd` is the 舷門 sill. `gangwayBox` gives the opening's s and h limits.
- `sternSetting` is the line-setting deck. `bridge` is the wheelhouse eye point.
- `mastTop` is the radar lattice top, at 20.7 m. `hornPos`, `funnelTop`, `bow`, `stern`.
- `lineHauler` and `radioBuoys`.
- `railPoints` and `railPointsBySide.{port,starboard}` mark the promenade and setting-shelter rails, for the send-off tapes.
- `flagPoints` are the 大漁旗 attachment points.
- `lights` lists each lamp as `{p, c, kind}`, where `kind` is `mast`, `port`, `starboard`, `stern` or `deck`.

## What is measured and what is stylised

| Real (sourced or measured) | Stylised |
|---|---|
| LOA 58.60, beam 9.2, depth 3.91 and design draft 3.54 come from the registries. The keel sits 4.05 m (forward) to 4.25 m (amidships) under the paint line, as measured on the model photo 02 (34–35 px; the dossier's 32 px under-reads the edge, see the README's Deviations, row b). | The cel materials, ink outlines and studio colours follow the app's look rules. |
| The profile (sheer, raked stem, knuckle-bulb, rounded stern, skeg, rudder and propeller) is measured on `shofukumaru02` at 0.1226 m/px, using the tool's segmentation. | The hull lines between the measured profile and the 9.2 m beam are a fair fishing-hull loft. No lines plan is public. |
| The 舷門 is on starboard only, at s 22.8–31.3 and h 3.0–4.7, with the line hauler, slow conveyor, branch-line reel and fish boxes in the well. | The well and stern-bay gear is simplified, and the interiors are dark recesses. |
| The masts are the foremast (s 14.2, top 16.1), the white lattice radar mast (s 42.8, top 20.7) and the aft mast (s 53.7, top 19.1). | The lattice bracing pattern is generic. |
| The bridge house runs from s 28.3 to 40, with the roof at 10.0 and the rail at 10.9. It has a window band, red stripe segments under the windows, MG1-2112 on the front and both sides, two white radomes and whips. | There are no radome brand labels, and the Starlink panels are flat with no logo. |
| The funnel is at s 46.5–49.1, white with a black top and two exhausts. The 違い山星一 crest appears only on the nendo livery. | |
| The aft setting shelter runs from s 42.6 to 58.6, with the roof at 7.3 and a three-rail edge to 8.7. It carries 7KFY boards on both rails, 7KFY on its roof and on the forecastle deck (aerial 07), the fenced cage, the open stern bay with radio buoys and floats, and the ensign. | The deck lettering font is generic. |
| Lights: two masthead lights (the aft one higher), side lights on the wheelhouse (red on port, green on starboard), a stern light, and deck floods on the masts and at the 舷門. | Night glow uses `harbor/lights.js` nightMat. |

## Livery

All of it is in one atlas of 2048 × 1024 px, on both tiers:
- **Port band:** drawn bow-left, as in photo 02.
- **Starboard band:** drawn bow-right, as in photo 03.
- **Strip:** the 7KFY board, the MG1-2112 board, the crest, the 7KFY deck lettering and four 大漁旗.

The sides are painted separately, never mirrored. On starboard the hull name reads 丸福昭一第 from left to right, because Japanese hull names read from the bow aft.

**Fallback** (public): white hull, red antifouling over the bulb, a black bow wedge, 第一昭福丸 / SHOFUKU MARU No.1, 7KFY and MG1-2112. `livery.js` holds no nendo coordinates. There are no lines, triangles, circle or crest, and no crest mesh.

**Nendo** (dev flag): drawn at runtime from three files:
- `data/ship/shofukumaru1/livery-nendo.json` (traced shapes);
- `lines-nendo.json` (traced diagonals);
- `livery-nendo-marks.json` (this builder's measured supplements: the star circles fitted to the red segment boundary, the triangles the tracer missed because they were lit grey, the bow lines, the starboard ignore zones for the 舷門 and the hawse, and the crest strokes).

**Starboard frame.** Photo 03 is a three-quarter view, traced at one uniform 0.1266 m/px, which stretches s near the bow (the foremast reads 16.6 m, not 14.2) and h where the camera looks down. `marks.starboard.fit` maps the traced data into the true frame before anything else: `fit.s` is piecewise-linear through anchors measured on 03 (stem x 652, foremast 521, bridge front 430, radar mast 303.5, aft mast 232.5, transom 189 → s 0, 14.2, 28.3, 42.8, 53.7, 58.6), and `fit.h` scales h by the side height on 03 over the model's sheer (0.74 at the stem head to 1.0 from the bridge aft). Ignore zones and marks are in the true frame; an ignore zone with `lines: true` also drops the traced lines whose midpoint falls in it. X1 (the red down-triangle on the sheer that straddles the foremast, the black up-triangle under it, the X lines through their common vertex), X2 (the band and its black foot), the bow wedge, the bow line and the hull name are measured on the WCPFC registry photo of the real ship, because the model in 03 places X1 3–4 m further aft than the real ship.

`cleanNendo()` turns each traced fragment into its convex hull. It merges a fragment with a touching fragment of the same colour only while the union stays compact. It then simplifies the shape to the fewest corners that keep 92 % of its area, and snaps corners at the waterline and at the stem or stern ends.

**Flag** (`flags.js`):
- `?livery=nendo|fallback` wins.
- Otherwise the nendo livery is ON for localhost, 127.0.0.1, ::1, `*.localhost`, or a build that defines `KLC_NENDO=1`.
- It is OFF everywhere else, `*.ts.net` included (the captain's public Funnel link is a ts.net host; tailnet dev uses `?livery=nendo`).

When it is OFF, the nendo files are never fetched. They are never imported either, so they are never bundled. A public deploy is the captain's call. `scripts/public-mirror.js` DENYs `data/ship/shofukumaru1/*nendo*`, so the public mirror never serves those files.

## Budgets

- Triangles: about 22k on high (the limit is 150k) and about 11k on phone (the limit is 60k). The 大漁旗 count toward both.
- Draw calls: static parts are merged by material. About 70 meshes on high, most of them the 22 flags.
- Textures: one 2048 × 1024 canvas atlas, with no other textures.

## Profile check

```
tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/ship-profile.mjs --port 8961
```

The tool renders orthographic port and starboard views at exactly 0.1226 m/px. It aligns them on the photos' stem head and waterline pixels:
- port: x 158, y 291;
- starboard: x 652, y 291.

Each view goes through the app's pipeline with outlines on, at 2× resolution, and is then downsampled. The tool segments the render and the photo the same way and writes images and `profile-metrics.json` to `docs/ship/shots/`.

Reading the scores:
- Silhouette IoU on port must be at least 0.85.
- Starboard is a three-quarter view, so it scores lower. It is also reported at its own fitted scale.
- The livery IoU is computed against the traced shapes (starboard in the fitted frame) and against the photo's own pixels.
- Starboard only: `wcpfcIoU` scores the livery against the WCPFC photo of the real ship (x → s by a projective fit through six anchors, h by a vertical scale measured from the waterline to the sheer), forward of s 44 and over the whole side, and writes `profile-starboard-<livery>-<tier>-wcpfc-ref-overlay.png` (local only).

Composites that contain the reference photos (`*-ref-*.png`) and renders of the nendo livery stay local, through a `.gitignore` in that folder.
