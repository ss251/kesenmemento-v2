# café RST: a walk-in anime interior (迎 1F)

The roastery café on the ground floor of 迎 (ムカエル, 南町海岸1-14), with Lander Blue's shark goods in the same room, built in the app's anime style
like the other modelled interiors (the fish market C hall, 男山本店). ANCHOR COFFEE 内湾店 is on the 2F of the same building: it is not part of this room.

協力: café RST. The shop agreed on 2026-10-07 (verbal, written form pending); the room is built from the project owner's own walk-through video of it and
the surveyed façade. Nothing else of the shop is used: no maps-service photos, nothing from the shop's own site, no frame of the video in git.

## Where it is in the code

| File | What |
|---|---|
| `src/anime/world/explore/cafe-rst.js` | the room (`buildCafeRst`), the plan (`PLAN`, `UF`, `NIN`, room-frame helpers), the consent record and the credit line, the `ENABLED` switch |
| `src/anime/world/harbor/cafe-front.js` | the hard scale shared by the exterior and the room: `FRONT` (the surveyed ANCHOR face P1 / P2, the SE face end P3, the floor T.P. 2.62) and `OPENINGS` (the take-away window, the door, the bay of windows in the face) |
| `src/anime/world/harbor/minami5.js` | the exterior's ANCHOR face now leaves those openings open (piers and spandrels 0.18 m deep, the khaki wall whole above the heads) and no longer paints a lit interior over them: the real room shows through the glass |
| `src/anime/world/layout.js` | one more `GROUND_PADS` entry: the DEM carried 迎's old bulk up to 4.2 m through the floor of the room, so the ground under the room (inside the hollow building) is clamped to the street's level |
| `src/anime/world/explore/interiors.js` | lists the room (`out.cafeRst`, in `interiors.list`), adds its `at()` box, passes the shared frame / figure / texture helpers to the module |
| `src/anime/world/explore/cafe-rst-people.js` | the four people: the cast kit's own figures, their seats and poses |
| `test/cafe-rst.test.js` | 29 tests (below) |
| `docs/anime/interiors/cafe-rst-plan.json` | the measured plan: every feature with its basis and sigma (numbers only) |
| `tools/anime/cafe-rst-wk.mjs`, `cafe-rst-shots.mjs`, `cafe-rst-perf.mjs` | the pictures in Safari's engine, the phone page with the pad (入る / 出る), and the frame pacing (see Tests and checks) |
| `tools/anime/qa3.mjs` | the explore flow walks into the café on foot (W held from the entrance until the camera is inside) and checks four interiors are listed |

`interiors.js`'s `list` entry is `{ id: 'cafeRst', ja, en, entrance, inside, credit, consent, door, bounds, items, group }`. The pad's 入る button shows within 8 m of
`entrance` (on the sidewalk 3 m in front of the door, facing it) and teleports to `inside` (5.0 m along the street wall, 2.3 m in, looking at the counter wall: the gear and, at the right edge, the barista);
出る goes back to `entrance`. On foot there is nothing to press: the door is open and the stoop leads in. `interiors.at(x, y, z)` returns `'cafeRst'` anywhere
inside the room (it hides the POI labels, and the pad shows 出る).

## Consent, credit, takedown

- `CAFE_RST_CONSENT` (in `cafe-rst.js`): owner café RST, date 2026-10-07, scope "shown in KesenMemento as an anime-style interior based on the project owner's
  video", reference "verbal OK to the author, written form pending". No personal names of the shop's people.
- `CAFE_RST_CREDIT`: 「協力：café RST」 / "With the cooperation of café RST": in the record, and on a small brass plaque in the room (standing on the window
  counter by the door).
- Takedown: set `ENABLED` to `false` in `cafe-rst.js` and the room is not built or listed (the exterior stays; a visitor can no longer enter).
- The people in the room are the town's own anime figures (the cast kit of `life/characters`), invented, never likenesses of anyone in the shop or its video: the
  barista is a man in rolled sleeves and an apron, the guests a woman in a sweater, a man in a knit with glasses and a woman in a blouse, from the cast's seeded
  presets (the video's staff member has a ponytail and a grey cardigan: nobody here does).
- Nothing on a sign is invented or copied. The real boards carry other companies' brands (the video has several): no mark is drawn and no word is made up, only
  coloured cards (a number plate drawn as bars, a figure poster, a striped poster, a cap); the café's own words (neon, beam letters, menus, poster, mat, the credit
  plaque) are drawn as the café spells them. The test greps the module for brand names and for the words the first draft invented.

## The hard scale and the measured plan

The envelope on the street and SE sides is the survey's: the ANCHOR face is the fitted plane through 197 SfM points (rms 0.029 m, `data/survey/minami/picks.json`),
9.549 m from P1 (NW end) to P2; the SE face runs to P3 (6.11 m, GSI outline). **Room frame:** origin P1 on the floor (T.P. 2.62), x_r along the face toward P2,
y_r into the building, z up; the SE wall leans 6.3 deg outward (survey), so the room is a quadrilateral. Everything else comes from the video (see Method).

Method (nothing here is survey-grade, and the plan file says so): 160 frames of the 53 s pan were registered with SIFT and a rotation-only bundle adjustment, the
absolute yaw was fixed from the Manhattan line families (the street wall, its perpendicular), pitch and roll from vertical edges (median 0.41 deg), a bearing grid
was read by eye (+-0.5 deg), and the camera position was resected against the street wall's span and the exterior door / window prior. The rotation chain
over-counts the first full turn by 10 % (hand-held arm swing: the parallax is strong), so positions carry **sigma 0.3 to 1.0 m**; the wall bearings are good to
1 to 4 deg. Three disagreements above 15 % were found and are recorded in the plan (camera x 4.65 vs 5.4; the ceiling; the yaw chain). A structure-from-motion run would
settle the positions; it was not run (usage).

| Dimension | Value | Basis | Sigma |
|---|---|---|---|
| street wall, outer face | y_r 0 (the surveyed plane), 9.549 m | survey | 0.03 |
| street wall inner face | 0.20 | assumed thickness | 0.08 |
| NW wall (the back-bar wall) | x_r 0.25 | inferred from the counter depth | 0.3 |
| SE wall at the street end | x_r 9.35, leaning 6.3 deg | survey (P2, P3) | 0.25 |
| rear wall | y_r 6.07 (the survey's P3 depth; the video says parallel to the street wall) | survey + panorama | 0.7 |
| ceiling (steel deck underside) | 3.0 | the exterior's 2F glass starts 3.0 m above this floor; the video alone gives 3.45 but that depends on the camera height (1.4 m would give 2.9) | 0.35 |
| door | x_r 1.95 to 2.85, 2.05 high | exterior photo + interior bearing, standard door | 0.4 |
| take-away window | x_r 0.25 to 1.85, z 1.0 to 2.25 | exterior photo, counter-top level | 0.3 |
| bay of windows | x_r 3.15 to 9.05, z 0.85 to 2.35; mullions 4.2, 4.8, 6.05, 7.1 | panorama bearings (d = 2.3 m) | 0.6 |
| counter (with the back-bar) | along the NW wall from the street wall to y_r 5.2, top 1.0 | panorama + standard object (top 0.98 +- 0.07) | 0.5 |
| bar stools | five, y_r 2.0, 2.55, 3.2, 3.9, 4.7 at x_r 2.35 (0.32 m from the counter's edge), seat 0.745 | panorama + standard object | 0.5 |
| noren doorway | rear wall, x_r 1.45 to 2.65, hem 0.6 | panorama bearings | 0.6 |

Residuals of the built room against the plan (centre of the plan feature minus the built piece, metres; all inside the plan's sigma; `test/cafe-rst.test.js` asserts it per axis):

| Feature | Sigma | Plan centre (x_r, y_r) | Built centre | Residual |
|---|---|---|---|---|
| street wall | 0.08 | (4.77, 0.10) | (4.80, 0.10) | 0.03, 0.00 |
| NW wall | 0.30 | (0.13, 3.15) | (0.13, 3.14) | 0.00, -0.01 |
| rear wall | 0.70 | (5.08, 6.20) | (5.14, 6.17) | 0.06, -0.03 |
| door | 0.40 | (2.40, 0.10) | (2.40, 0.10) | 0.00, 0.00 |
| take-away window | 0.30 | (1.01, 0.10) | (1.05, 0.10) | 0.04, 0.00 |
| bay of windows | 0.60 | (6.10, 0.10) | (6.10, 0.10) | 0.00, 0.00 |
| window counter NW | 0.60 | (3.55, 0.45) | (4.13, 0.43) | 0.58, -0.02 |
| window counter SE | 0.60 | (7.90, 0.45) | (7.80, 0.43) | -0.10, -0.02 |
| counter | 0.50 | (0.97, 3.00) | (1.14, 2.71) | 0.16, -0.29 |
| back-bar | 0.50 | (0.50, 3.15) | (0.46, 2.71) | -0.04, -0.44 |
| cone statue | 0.50 | (2.50, 2.00) | (2.30, 1.55) | -0.20, -0.45 |
| noren doorway | 0.60 | (2.05, 6.10) | (2.05, 6.02) | 0.00, -0.08 |
| mirror ball | 0.40 | (5.30, 3.90) | (5.30, 3.90) | 0.00, 0.00 |
| dining tables | 0.70 | (5.10, 4.30) | (5.50, 4.30) | 0.40, 0.00 |
| big plant | 0.80 | (4.40, 4.40) | (4.20, 4.20) | -0.20, -0.20 |
| motorcycle | 0.90 | (3.70, 5.60) | (4.50, 5.50) | 0.80, -0.10 |
| lattice screen | 1.00 | (8.30, 3.10) | (7.70, 2.15) | -0.60, -0.95 |

The built pieces sit where the plan puts them, moved only as far as needed to leave a 0.6 m walkway (the walk-in tests flood-fill the floor for a walker of radius 0.3).
Items the video does not fix (the retail fixtures, the lattice depth, the motorcycle's heading, the chair count) are marked in the plan as rough and drawn as seen.

## How it looks

The same material system as the other interiors (`ctx.mat.toon`, `emissive`, `glass`; nothing custom), so it follows both looks (`survey`, `hikari`) and the time
of day.

- **Day.** Warm wood floor (planks run along y_r), board-clad NW and rear walls, white plaster with the noren doorway, the black exposed steel deck with its beams, the
  white soffit over the counter, track lights, filament pendants. Every toon surface carries a small warm self-light (`emissive #4a3828`): the cel ramp's unlit band
  would otherwise read cold blue-grey under the sky. The street shows through the real glass.
- **Night.** The bulbs use life's lamp material (dim by day, lit at dusk); the neon is emissive; the room's five lamps register as real point lights in life's lamp
  pool (`lights(ctx).reals`), so the nearest slots go to them whenever the camera is inside. From the street the room glows through the door and windows.
- **Winter.** Snow lies on every cel surface in 冬; the room's materials opt out (`userData.noSnow`, which `core/batch2.js` carries into the merged groups), so the floor and
  the counter stay brown while the street, the stoop and the roofs go white. The falling flakes belong to the weather and are not stopped at the door (as in the other interiors).
- **Signage, from the video.** The neon (the white shark outline with the pink 「café」, the green 「RST」, the orange 「reset and restart」), the gold 「CAFE RST」 on the
  beam, the poster 「KESENNUMA / WATER FRONT / TO ALL WHO COME TO THIS HAPPY PLACE / WELCOME / Lander Blue / café RST」, and the two chalkboard menus 「café RST」
  (OPEN 10:00～18:00; coffee, latte, float, juice, COCOA) and 「Soft-Sweets」 (Hotdog, Foods, ワッフル Single / Plus, チュロス). The menus were transcribed from a median stack
  of the sharpest frames: **every dish name is drawn as read, and a price only where every digit read clearly** (several first digits read 7 or 9 in the pixels): a bare
  name is honest, a wrong price on the shop's own board is not. Lines whose names could not be read (about 20) are left out; the Cola line is left out (a brand).
  The transcription, with confidences, is in `docs/interiors/cafe-rst/signage/` of the research notes (outside git: it is video-derived).
- **Props, from the video.** The counter with its front boards hung with coffee sacks, a rebar foot rail, five bar stools, the soft-serve cone statue, and on the
  back-bar, street end first: the red retro fridge with its glass door and the red box on it; the soft-serve machine (cream body, silver control band, black dispensing
  head with four steel knobs and a nozzle, hopper lid, drip tray); two siphon brewers (brass frame, spirit burner, glass flask, tube, upper chamber under its brass lid);
  a pour-over stand (chrome pole, white cone dripper, glass server); a gooseneck kettle; a black oven and a row of white cups on the lower shelf; the cooler and the
  Route 66 wall clock; two open laptops. **No espresso machine and no roaster appear in any of the video's 27 sampled frames**, so none is built (the coffee on the counter is
  made by siphon and pour-over; the video does not show where the beans are roasted). The window counters with stools; the shelf of motorcycle helmets and plush sharks over the glazing, the
  diagonal timber lattice, the shark-jaw beam with a shimenawa and a big inflatable shark, the clothes rail, shelves of goods, a framed shark picture; the dining end with two
  tables pushed together, bentwood Y-chairs, a sport bike in white, blue and red behind its rope stanchions (no maker's mark), two dracaena, the framed ocean print and the
  coloured-card wall; the mirror ball turns slowly (a dynamic mesh, hidden beyond 60 m).
- **People.** Four figures of the town's cast kit, posed by the cast's own driver (planted-foot leg IK, arm IK to the counter): the barista in the lane behind the counter
  (one hand on a cup, one on the top, a glance down at the work now and then), a woman on a counter stool with her feet on the rail, a man at the street window counter
  (looking out; he is seen through the glass from the sidewalk), a woman at the dining table. They breathe, the barista blinks, they look about, and they update only while
  the camera is within 30 m. `cafe-rst-people.js`.

## Walking in

- The street door is the opening in the surveyed face with its frame, an open leaf (swung out 80 deg, with a collider), and a two-riser stoop (the pavement is at T.P. 2.28,
  the floor at 2.62): `walk boxes` at floor and floor - 0.17.
- The harbor's wall colliders (`hall()` in `minami.js`) follow GSI's outline of 迎, 0.15 to 1.2 m off the surveyed face; they stood 0.5 m in front of the door. The
  room takes out the two pieces (street face, SE end), adds a piece from the face's NW end to GSI's corner, and closes the building with its own walls on the surveyed
  plane (street wall with the door gap and a lintel, NW wall, rear wall, the leaning SE wall).
- The ground pad lowers the DEM's mound under the room (see `layout.js`); the floor is a walk box at T.P. 2.62 (the wedge the leaning SE wall opens is a second box).
- The sidewalk props in front of the face (the nobori, the five bicycles, the A-boards and the soft-cream stand of `buildMukaeruPhotos`) stand on the paving (T.P. 2.1 to 2.3): they
  were placed at the floor level and hovered 0.3 to 0.5 m, and the 受付 board stood on the door's axis. The 受付 board moved to the window's end, the nobori and the first bike start past
  the stoop. (Props have no colliders, as before.) The terrain changes only inside the building's footprint (288 cells of 0.5 m, none on the street side of the face).

## Budgets

Measured headless (before batching) in the same build as 男山本店 (917 meshes, 12.9 k triangles):

| | meshes | triangles | canvases | texture on the phone |
|---|---|---|---|---|
| the room, without people | 630 | 13.1 k | 21 (0.62 Mpx: tiles of at most 352 px in the interiors' atlas, plus floor 256 px, deck and boards 128 px) | 3.3 MB |
| four people (cast kit) | 4 skinned | 21.5 k | five 512 px atlases (the barista has a second, for blinking) | 6.7 MB (5.6 MB until the first blink) |
| the whole café | 634 | 34.6 k | 26 | about 10 MB |

The café is about 2.7 times 男山本店 in triangles because of the figures (the room alone is 1.0 times). Draw calls: batch2 merges the four interiors into 44 draw meshes (43
before the room's no-snow groups) and the café adds four skinned draws (about 50 in all while the camera is within 220 m, which hides the whole interiors group beyond that).
The people update only within 30 m of the camera: 0.06 ms a frame for the four (Bun, headless), 0.0003 ms when away.

Phone probe (`tools/anime/phonemem.mjs --start --params fixtures=1`, the phone tier, headless Chrome on the shared the build machine): no crash, 0 page errors, **texture 225 MB** against
the 240 MB limit (217 MB at main before the café: +8 MB, the 9 MB above less the interiors' atlas sharing), heap after GC 141 MB, interiors' atlas 1920 x 1728 (33 tiles, 17.7 MB).
The barista's blink atlas (1.3 MB) is uploaded at his first blink, so a long visit reads 226 MB.

Frame pacing inside the café (`tools/anime/cafe-rst-perf.mjs`, the second machine M3 Pro, Chrome at normal priority through `gate.sh chrome --fg`, 20 s a scenario, while other lanes'
jobs held the machine at load 16; a first run at the gate's default background priority ran on the efficiency cores and is discarded):

| config | scenario | fps | interval ms p50 / p95 / p99 / max | frames over 25 / 33 / 50 / 100 ms | CPU ms mean | GPU ms p50 / p95 | draw calls | triangles |
|---|---|---|---|---|---|---|---|---|
| phone (390 x 844 @3x, phone tier) | counter, turning | 59.9 | 16.7 / 16.7 / 16.8 / 33 | 3 / 0 / 0 / 0 | 5.5 | 4.6 / 7.2 | 548 | 4.2 M |
| phone | street door, still | 60.0 | 16.7 / 16.8 / 16.8 / 33 | 1 / 1 / 0 / 0 | 5.4 | 6.6 / 9.4 | 567 | 4.4 M |
| retina (1440 x 900 @2x, high tier) | counter, turning | 57.1 | 16.7 / 16.8 / 33.4 / 67 | 54 / 11 / 1 / 0 | 10.1 | 13.5 / 23.3 | 955 | 13.0 M |
| retina | street door, still | 55.0 | 16.7 / 33.3 / 33.4 / 34 | 99 / 24 / 0 / 0 | 11.0 | 21.3 / 23.0 | 1050 | 13.8 M |

The phone holds 60 fps with no frame over 50 ms; the Retina desktop is GPU-bound (the town seen through the glass, 13 M triangles at a pixel ratio of 1.5) and has one 67 ms frame
in 20 s while turning (a render call of 50 ms, likely a first draw) and none at the door. The room's own update (people, ball) is 0.13 to 0.15 ms a frame; almost all of the
draw calls and triangles are the town outside, not the room (the room is about 50 draws and 35 k triangles).

## Tests and checks

`bun test test/cafe-rst.test.js` (headless, builds the harbor and the interiors, about 1.5 s):

1. the hard scale: `FRONT` equals `ANCHOR` in `minami5.js`; the face is 9.549 m with the survey's normal; the openings lie on the face in order; the door is 0.9 x 2.05 m;
2. the room frame (P3 at depth 6.07; the SE wall's lean);
3. the consent record, the credit line (ja and en), the takedown switch;
4. the listing: entrance outside and in line with the door, inside pose in the room on the floor, `at()` true inside and false on the sidewalk, in the street and above the roof;
5. walking in with the real colliders (a walker of radius 0.3 that steps at most 0.45 m): through the door and up the stoop to the floor, and on; the walls hold
   (window wall, beside the door, SE corner, rear wall, NW wall); the harbor's GSI pieces are gone;
6. the layout: nothing overlaps; a flood fill for a walker of radius 0.3 reaches the counter, the stools, both window counters, the table, the rail, the lattice, the
   noren, the shelves;
7. no coplanar faces: no two axis-aligned boxes of the room share a same-facing plane over an overlapping area (the z-fighting check);
8. budgets against 男山本店 in the same build (the room without the figures), tiles of at most 512 px that join the atlas, the texture total;
9. the people: four skinned figures of the cast kit under 6.5 k triangles each, kept out of the static batch, one 512 px atlas each (five in all, under 7.5 MB); seated with
   the pelvis on the seat, the feet on the rail or the floor, both hands on the counter, the window counter or the table; the pose is a pure function of the time;
10. the fit to the plan within `max(0.25 m, sigma)` per axis, the five stools, the door and windows;
11. hygiene: no `Math.random`, no TODO / stub, no word from the project's sensitive-term list (`SENSITIVE`), no brand name and none of the words the first draft made up on
    signs, no photograph, the shop's own spellings.

`tools/anime/qa3.mjs` (the explore flow): walks in on foot from the entrance and checks the standing height and the credit, and that four interiors are listed.
Pictures and measurements (through the machine gate, or on the second machine with the remote runner):

- `tools/anime/cafe-rst-wk.mjs`: the room in Safari's engine (a WKWebView session, no Chrome lock): desktop, phone tier, the reference cameras, winter;
- `tools/anime/cafe-rst-shots.mjs`: headless Chrome with the HUD: the phone page at the door (the 入る tap) and inside (出る), landscape, a Retina desktop;
- `tools/anime/cafe-rst-perf.mjs`: frame pacing inside the room with the perf recorder (use `gate.sh chrome --fg`).

## What is left

- The interior positions are sigma 0.3 to 1.0 m; a structure-from-motion run on the video (the pan has strong parallax) would tighten them.
- The ceiling height (3.0) rests on the exterior; the video alone suggests up to 3.45.
- Prices and about 20 dish names on the menus are left out because the pixels do not settle them; a still of each board (the owner's own, with the shop's OK) would.
- The written consent form (the record says so).
- No espresso machine and no roaster are in the video's frames, so the room has none; if the shop wants them shown (the nobori says 自家焙煎), a short clip or a photo of
  each, with its OK, is what is needed.
- The figures only breathe, blink and look about (the barista's right hand moves a little); no one walks, serves or pours.
- Not yet tried on a real iPhone: the phone checks are an emulated 393 x 852 page with touch, at the page's real pixel ratio.
