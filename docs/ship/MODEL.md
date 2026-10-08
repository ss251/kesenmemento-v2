# 第一昭福丸: the ship model and livery

`src/anime/world/ship/shofukumaru1.js` builds SHOFUKU MARU No.1 (7KFY, MG1-2112) at true scale in the app's cel style.
`ship/livery.js` paints her livery atlas. `ship/flags.js` decides which livery a page may show.
`tools/anime/ship-profile.mjs` checks the side profile against the nendo model photos.
`test/ship-model.test.js` covers the dimensions, the 舷門, the budgets, the flags and the fallback.

Sources: the project's sourced notes on the ship (not included) (the project's sourced notes on the ship, not included) and the reference photos in `raw/ref/shofukumaru/`.
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
| LOA 58.60, beam 9.2, depth 3.91 and design draft 3.54 come from the registries. The keel sits 4.05 m (forward) to 4.25 m (amidships) under the paint line, as measured on the model photo 02 (34–35 px; the sourced notes's 32 px under-reads the edge, see the README's Deviations, row b). | The cel materials, ink outlines and studio colours follow the app's look rules. |
| The profile (sheer, raked stem, knuckle-bulb, rounded stern, skeg, rudder and propeller) is measured on `shofukumaru02` at 0.1226 m/px, using the tool's segmentation. | The hull lines between the measured profile and the 9.2 m beam are a fair fishing-hull loft. No lines plan is public. |
| The 舷門 is on starboard only, at s 22.8–31.3 and h 3.0–4.7, with the line hauler, slow conveyor, branch-line reel and fish boxes in the well. | The well and stern-bay gear is simplified, and the interiors are dark recesses. |
| The masts are the foremast (s 14.2, top 16.1), the white lattice radar mast (s 42.8, top 20.7) and the aft mast (s 53.7, top 19.1). | The lattice bracing pattern is generic. |
| The bridge house runs from s 28.3 to 40, with the roof at 10.0 and the rail at 10.9. It has a window band, red stripe segments under the windows, MG1-2112 on the front and both sides, two white radomes and whips. | There are no radome brand labels, and the Starlink panels are flat with no logo. |
| The starboard star's red is a thin crescent along the forward-lower arc of its circle, as on the WCPFC photo of the real ship (x 331–422, y 730–851) and nendo photo 03; the port star's red is a cut segment (photo 02). | The crescent is a 18-point polygon (about 4.1 m², 18 % of the disc), traced from the WCPFC red pixels and mapped into the circle's own frame; it is not the paint's exact curve, and it sits on the 03-derived circle centre, about 1 m aft of where the WCPFC photo puts the circle (the open item). Before the 2026-10-04 review fix the starboard star carried the same cut-line red segment as port (37 % of the disc), a shape the real ship does not have. |
| The funnel is at s 46.5–49.1, white with a black top and two exhausts. The 違い山星一 crest appears only on the nendo livery. | |
| The aft setting shelter runs from s 42.6 to 58.6, with the roof at 7.3 and a three-rail edge to 8.7. It carries 7KFY boards on both rails, 7KFY on its roof and on the forecastle deck (aerial 07), the fenced cage, the open stern bay with radio buoys and floats, and the ensign. | The deck lettering font is generic. |
| Lights: two masthead lights (the aft one higher), side lights on the wheelhouse (red on port, green on starboard), a stern light, and deck floods on the masts and at the 舷門. | Night glow uses `harbor/lights.js` nightMat. |

## Livery

All of it is in one atlas of 2048 × 1024 px, on both tiers:
- **Port band:** drawn bow-left, as in photo 02.
- **Starboard band:** drawn bow-right, as in photo 03.
- **Strip:** the 7KFY board, the MG1-2112 board, the crest, the 7KFY deck lettering, the transom lettering and four 大漁旗.

**The transom** (both liveries, photo 04). Aft of the quarter knuckle, where the rounded stern's half-breadth falls to
2.6 m (`knuckleS(h)`: about s 57.8 above h 3, 57.3 at h 1), the shell faces aft. Both side bands are painted white
there over every livery shape, so the stern triangles stop at the quarter as on the model. A decal laid on the shell
(`transomDecalGeometry`, 4 cm proud, facing aft, the atlas `stern` cell, alpha-tested) carries three lines centred on
the centreline, as on photo 04: 第一昭福丸 (h 2.85–3.45, 3.0 m wide), KESENNUMA (h 2.05–2.4; the photo shows a
romanised line of seven to nine bold capitals, too small to read letter by letter, taken as the port of registry) and
SHOFUKU MARU No.1 (h 1.35–1.63). It is structure, not livery: the plain fallback has it too.

The sides are painted separately, never mirrored. On starboard the hull name reads 丸福昭一第 from left to right, because Japanese hull names read from the bow aft.

**Fallback** (opt-in: `?livery=fallback` or `KLC_NENDO=0`): white hull, red antifouling over the bulb, a black bow wedge, 第一昭福丸 / SHOFUKU MARU No.1, 7KFY and MG1-2112. `livery.js` holds no nendo coordinates. There are no lines, triangles, circle or crest, and no crest mesh.

**Nendo** (the default in all builds): drawn at runtime from three files:
- `data/ship/shofukumaru1/livery-nendo.json` (traced shapes);
- `lines-nendo.json` (traced diagonals);
- `livery-nendo-marks.json` (this builder's measured supplements: the star circles fitted to the red segment boundary, the triangles the tracer missed because they were lit grey, the bow lines, the starboard ignore zones for the 舷門 and the hawse, and the crest strokes).

**Starboard frame.** Photo 03 is a three-quarter view, traced at one uniform 0.1266 m/px, which stretches s near the bow (the foremast reads 16.6 m, not 14.2) and h where the camera looks down. `marks.starboard.fit` maps the traced data into the true frame before anything else: `fit.s` is piecewise-linear through anchors measured on 03 (stem x 652, foremast 521, bridge front 430, radar mast 303.5, aft mast 232.5, transom 189 → s 0, 14.2, 28.3, 42.8, 53.7, 58.6), and `fit.h` scales h by the side height on 03 over the model's sheer (0.74 at the stem head to 1.0 from the bridge aft). Ignore zones and marks are in the true frame; an ignore zone with `lines: true` also drops the traced lines whose midpoint falls in it. X1 (the red down-triangle on the sheer that straddles the foremast, the black up-triangle under it, the X lines through their common vertex), X2 (the band and its black foot), the bow wedge, the bow line and the hull name are measured on the WCPFC registry photo of the real ship, because the model in 03 places X1 3–4 m further aft than the real ship.

**The aft sheer triangle** (fix round 2). On 03 the black down-triangle aft of the star circle traces as a 2.3 m by
1.8 m fragment (s 52.3–54.8, h 5.3–7.3), most of it then erased by the circle's white disc. On the real ship (WCPFC,
x 203–302, y 683–802) it runs from the sheer to 63 % of the side below it and tapers into the diagonal that runs to
the circle's foot. The mark `aft-sheer-triangle` is measured the way X1 and X2 were: top on the sheer from s 51.47 to
54.29, apex (52.19, 2.85), and the line from the apex to (50.99, −0.2). It overlaps the aft part of the circle's disc
on the real ship, so it carries `over: true` and is painted after the circles. The traced fragment and its diagonal
are ignored. Caveat: aft of the radar mast the projective fit compresses s against the vertical scale (about 0.029
against 0.036 m/px), so at the local vertical scale the top would be 3.6 m wide rather than 2.8 m (the port
counterpart is 4.2 m wide); the position along the hull is the fit's.

**The starboard star's red** (review fix 2026-10-04). The port star's red is a segment cut off by a straight line (photo 02). The real starboard star (WCPFC, x 331–422, y 730–851, and photo 03) has a thin red crescent hugging the forward-lower arc of its circle instead; the build had painted the port-style segment (37 % of the disc) there. The crescent is traced from the WCPFC photo's red pixels (R > G + 14, R > B + 8), normalised to the circle's outline (the photo's circle is foreshortened to an ellipse, so the shape is taken in the circle's own frame, not by the projective fit) and mapped onto the starboard circle (51.02, 4.35, r 2.7). Its outer edge is the circle's own arc from about 12° above the horizontal on the forward side to 111° (just past the bottom, toward the stern); its inner edge bulges toward the stern; it is about 1 m thick at its widest, 4.1 m² (18 % of the disc; the WCPFC red pixels are 19 % of the photo's circle). In the marks it is the red shape `star-crescent` (`over: true`, painted after the circles), the circle has `red: 'none'` (no half-disc and no cut line), and its inner edge is drawn as ten short black lines. `ship-livery-paint` tests the red share of the painted disc (10–24 %), that the crescent lies on the forward-lower side, and that the port star keeps its segment.

**The starboard stern hourglass X** (fix round 3). Both the real ship (WCPFC, x 40–170, y 683–873) and photo 04 show a
black hourglass on the starboard quarter: a small down-triangle on the sheer whose apex meets the apex of a large
up-triangle. The first build had the large one as the traced 5-point polygon (s 55.06–58.47), which the quarter
knuckle clipped into a ragged near-vertical edge, and a `stern-x-top` whose top edge (s 56.9–58.9) lay mostly aft of the
knuckle, under the white transom, and over the model's open stern bay (`SHIP.sternOpening`: no shell at s ≥ 56.6 between
h 5.8 and 7.2, both sides). Now the traced polygon and its diagonal are ignored, and two clean marks are measured the
way X1 and X2 were. The X centre is the apex at x 82, y 730 (h 5.75): s 57.16 by the projective fit, 56.74 at the local
vertical scale of the compressed stern, and **56.0** on the model, 1.2 m forward of the fit, so that the whole small
triangle stands on plating (its aft top corner is at s 56.47, forward of the bay and of `knuckleS(7)` = 57.795; inside
the ±1 m that the open item below allows aft of the radar mast). `stern-x-bottom`: apex (56.0, 5.75), forward foot on
the waterline at s 54.5 (x 167: 55.14 by the fit, 54.1–54.5 at the local scale), aft foot at s 56.25 on the quarter
knuckle (`knuckleS(0)` = 56.33), so its aft edge is one straight segment and the white transom clips none of it.
`stern-x-top`: top edge s 54.7–56.47 on the sheer, the same apex. Two crossing lines run through the apex: the aft
arm of the X runs over the white from the apex to the knuckle, and the other follows the small triangle's aft edge down
to the large one's forward foot. The real ship's lower triangle flares aft below its apex; on the model the rounded
stern leaves little room, so its aft edge is nearly vertical. `ship-livery-paint` reads it back texel by texel.

`cleanNendo()` turns each traced fragment into its convex hull. It merges a fragment with a touching fragment of the same colour only while the union stays compact. It then simplifies the shape to the fewest corners that keep 92 % of its area, and snaps corners at the waterline and at the stem. Nothing is snapped to the stern (fix round 2: snapping corners past s 57 to the atlas edge made the stern triangles meet across the transom); the white transom clips them at the quarter knuckle instead. `paintAtlas` order: shapes, circles, `over` shapes, lines, the white transom, text, the gunwale edge, the antifouling.

**Flag** (`flags.js`). The livery is 臼福本店's, used with permission in the live demo and not included in this repository; without its data she is painted in a plain livery.
- `?livery=fallback|nendo` wins.
- Otherwise a build that defines `KLC_NENDO=0` shows the fallback.
- Otherwise nendo, on every host, the public public mirror and any public deploy included.

With the fallback, the nendo files are never fetched. They are never imported either, so they are never bundled: every deploy serves them under `/data/ship/shofukumaru1/` (`scripts/serve.js`, `scripts/public-mirror.js` and the static-deploy pattern in `docs/ARCHITECTURE.md`).

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
- Starboard only: `wcpfcIoU` scores the livery against the WCPFC photo of the real ship (x → s by a projective fit through six anchors, h by a vertical scale measured from the waterline to the sheer), forward of s 44, aft of s 44 (the weaker check: see the caveat above) and over the whole side, and writes `profile-starboard-<livery>-<tier>-wcpfc-ref-overlay.png` (local only).

Composites that contain the reference photos (`*-ref-*.png`) stay local, through a `.gitignore` in that folder. Renders of the nendo livery may be committed since the permission of 2026-10-03.
