# 3D ホヤぼーや: the walking avatar

気仙沼市観光キャラクター「海の子 ホヤぼーや」 (Kesennuma City Mascot, Hoya Boya the Ocean Boy), built in 3D from the city's design manual for KesenMemento's third-person walk.

- **Code:** `src/anime/play/avatar/hoya-model.js`.
- **Tests:** `test/play-hoya3d.test.js` (`env -u NODE_OPTIONS bun test test/play-hoya3d.test.js`).
- **Renders:** `docs/play/shots/hoya3d/`, made with `env -u NODE_OPTIONS bun tools/anime/hoya3d-shots.mjs` (WebKit, no Chrome). The v2 frames start `v2-`.
- **v2 (2026-10-08):** the model checked against every view the manual draws, and corrected. See "v2: measured against the manual" below:
  - the face as the manual draws it off-axis;
  - flat two-tone colour;
  - the walk, run and jump from the manual's drawings;
  - the cape flaring in motion.

## Approval: read this first

The city must approve any 3D or animated use of Hoya Boya before it is shown:

- The city's page (更新 2026-05-20): 「営利（販売等）を目的とするものや立体物・動画を制作する場合は、事前の承認申請が必要となります。」
- The 取扱要綱, 第2条 and 様式第1号. KesenMemento is free and non-commercial, but a 3D figure that walks is both a 立体物 and a 動画.
- **The owner's decision (2026-10-07 13:20 IST):** "turn on hoya boya for now, permissions will be on demo day". The application will be made on demo day, Sat 10 Oct, for the Mayor's review. Until the city approves in writing:
  - the avatar lane keeps him behind its switch (`?hoya3d=0`, the notebook toggle 「ホヤぼーや ／ オリジナル」);
  - the use case goes into the application text (not included);
  - the credit is shown wherever he is: 気仙沼市観光キャラクター「海の子 ホヤぼーや」 (manual p.4; the English form "Kesennuma City Mascot,Hoya Boya the Ocean Boy" is also allowed).
- **Contact:** 気仙沼市産業部観光課 観光係, 0226-22-3438.
- **If the city asks for changes,** every number below is one constant in `hoya-model.js`.

## Sources

**The design manual:** 「気仙沼市観光キャラクター「海の子 ホヤぼーや」デザインマニュアル」, updated 2026-05-20, 28 pages: https://www.kesennuma.miyagi.jp/sec/s084/030/010/010/20260520hoyaboyadesignmanual.pdf

- Pages below are the printed numbers. The PDF's page = printed + 1 up to printed 18; the printed numbers skip 19, so PDF p.20 is printed p.20.
- The city's variation ZIPs (same page) give the same drawings as PNG files: `x_manualvariation1-2/1-1.png` and so on.
- The PDF and the PNGs are reference only. They are never committed, and they are never sampled, traced or textured into the model: every shape is rebuilt from numbers measured on them.

| What | Where | Used for |
|---|---|---|
| The colour system (8 colours, process CMYK) | p.2 | every colour |
| The standard figure, front | p.2 and NO.1-1 (p.6) | all front-view proportions, measured on NO.1-1.png at 393 px per U |
| The NG list | p.5 | the rules below, each with a test |
| The profile | NO.15-31 (p.23), NO.10-7 (p.15) | head depth, siphon lean, boot length, cape, arm |
| The back (the manual's only one) | NO.9-1 (p.14) | the hood's back marks, the plain backs of the knobs, the cape |
| Three-quarter views | NO.16-15, NO.16-9 (p.26), NO.1-3 (p.6) | the face view's 12.5 deg point (NO.16-15) |
| Motion | NO.1-3, NO.1-5, NO.1-8, NO.1-11, NO.1-16 (p.6), NO.16-19, NO.16-20 (p.26), NO.9-1 (p.14) | the walk, the run, the jump, the cape in motion |
| Closed eyes | NO.15-3 (p.20), the wink NO.1-29 (p.7) | the blink |
| The soles are orange | NO.1-3, NO.1-5, NO.9-1 | the boots |
| The profile text: 「ホヤのアタマにホタテのベルト、サメの皮のマント…サンマの剣」 | p.1 | the parts and their names |

## Colours (p.2)

The manual gives process CMYK. The sRGB values are the city's own export of the standard figure (NO.1-1.png; NO.13-2.png has the same values within 1/255).

| Part | CMYK (p.2) | sRGB |
|---|---|---|
| Line, eyes | K100 | `#000000` |
| ホヤ head, belt, soles | Y90 M60 | `#F0831F` |
| Face, ホタテ (scallop) buckle | (white) | `#FFFFFF` |
| Nose | M40 | `#F4B4D0` |
| Suit, arms, hands | C60 | `#57C4F1` |
| Cape (サメの皮), collar | C80 M40 | `#4384C5` |
| Legs, boots, guard, button | Y90 M20 | `#FDD119` |
| サンマ sword | K30 | `#D3D3D4` |

- **One yellow.** The colour page shows a single yellow for the legs, the guard and the collar button. NO.1-1.png exports the guard and the button slightly lighter (`#FDD541`); the manual's single colour is used.
- **The exports differ a little from file to file.** For example the cape is `#4384C5` in NO.1-1 and `#187FC3` in NO.1-5, and the sword `#D3D3D4` in NO.1-1 and `#ADADAD` in NO.1-3. The standard figure's set is used everywhere.
- **The test checks** that every vertex carries one of these eight colours, and that all eight are used.
- **Light (v2: two tones, `HOYA_TONE`).** The manual is flat colour, so he has exactly two tones:
  - lit, where a lit face shows the official sRGB value (the review renders are calibrated for it);
  - one shade step at 55 % of the key light, the terminator at n·l = 0.1.
  - **His own ramp:** the world's 4-step ramp (0 / 0.42 / 0.8 / 1) is not used on him.
  - **The sky's fill is the same from every side.** A hemisphere light's sky-to-ground gradient would be a soft gradient on him.
  - **No shadow-map shadows on him.** His big head would print a soft dark blot on his chest. He still casts his own shadow on the town.
  - **The light's hue at 40 %.** A sunset warms him with the town, but his white stays white-ish and his colours stay his (p.5 NG: 色を変える).
  - **At night,** `setLift(v)` lets his own colours glow back, so he never turns into a dark silhouette (p.5 NG: キャラクターを塗りつぶす). With the avatar lane's `setLift(night)` he shows his flat official colours at night.
  - **Renders:** `v2-light.png` and `v2-turnaround-*-day.png` / `-night.png` are in the town's own light (core/sky.js palettes, NoToneMapping as main.js).

## Proportions and measurements

**Units.** U is half the width of his head (its surface). NO.1-1.png is 393 px per U.

**Height.** 1.10 m from the soles to the top of the siphon knobs, which is 3.845 U, so 1 U = 0.286 m.

Why 1.10 m:
- He is a ぼーや (a little boy). 1.10 m is a Japanese child of 5 to 6 (school health statistics).
- Next to the town's adults (the cast kit, 1.58–1.74 m), his eyes (0.71 m) are at their hip height.
- The third-person camera (4.5 m behind, 1.6 m up) frames all of him.

**The line.** The outline is 19 px on NO.1-1, which is 1.25 % of his height (0.0483 U = 1.38 cm):
- an inverted hull outside the surface, so the surface is the drawn line's inner edge;
- the siphon marks, the mouth and the scallop ribs are thinner (12.6–13 px, 0.033 U);
- the nose ring is 19.6 px.

| Part | Specified (measured on the official art) | Value (U) |
|---|---|---|
| Head (front) | the outline's centre line is an ellipse 402.5 × 350 px; the surface is its inner edge | 1 × 0.866, centre 2.632 above the soles |
| Face opening | the contour of NO.1-1, 49 points, the clean side mirrored | `FACE_HALF` |
| Eyes | dots 45 px across, at ±116 px, 53 px below the head centre | r 0.057 at (±0.295, −0.137) |
| Nose | outer 83 × 77 px, pink 43 × 37 px, ring 19.6 px | pink 0.055 × 0.047, centre −0.272 |
| Mouth | the smile, 5 points | `MOUTH` |
| Hood marks, front | five strokes (^, two corners, two side chevrons) | `MARKS_FRONT` |
| Siphon knobs | circles r 97 px outer, centres ±342 px out and 391–406 px above the head centre | r 0.198 at (±0.870, 1.014) |
| Siphon stalks | lean 37° out, 117–131 px wide, aim 0.12 U under the head centre | r 0.118 → 0.100 |
| Knob marks | "+" on his right knob (two strokes), "−" on his left (one diagonal) | `KNOB_PLUS`, `KNOB_MINUS` |
| Collar | two lobes, lowest at ±0.22 U, meeting under the button | `COLLAR_EDGE`, button r 0.037 at 1.646 |
| Torso, pants | widths row by row (0.84 U chest, 0.73 belt, 0.84 hips), crotch at 0.61 U | `TORSO` |
| Belt | fill 0.934–1.12 U | `BELT` |
| ホタテ buckle | fan 0.318 wide, waist 0.153, hinge 0.178, 0.341 tall, 3 ribs | `SHELL` |
| Arms | 0.27 U thick; the sword arm raised 118° (the guard's centre at (1.33, 2.34) U, the tip at 3.97); the free arm out 62° to the elbow at (−0.72, 1.40), bent 48° to the fist at the hip | r 0.138 → 0.125, hands 0.41 × 0.40 |
| Legs | splayed ~17° (the A-stance), boots 0.62 U wide with toes out | `HIP`, `LEG`, `BOOT` |
| Cape | from the shoulders to just under the belt, 1.68 U wide at its hem | `CAPE` |
| サンマ sword | 1.62 U from the guard to the snout, widest 0.32 U a quarter down; tipped 6.8° out | `SWORD` |

### Verification: laid over the official art

`hoya3d-shots.mjs --refs …` also frames the 3D on exactly the window of the official crop, at the official scale (393 px = 1 U), and writes two things:

- `compare/front-overlay.png` and `compare/face-overlay.png`: the official drawing at full strength with the 3D at half on top, so every misplaced line shows twice.
- The distance from every ink line of one to the nearest ink line of the other (the cores of the lines, so line width does not count), in mm at 1.10 m:

| NO.1-1, front (idle) | 3D lines to the official | official lines to the 3D |
|---|---|---|
| Head (crop 225–1090 × 60–935 px) | median 0, p90 6.6, p99 17 mm | median 0, p90 8.0, p99 25 mm |
| Whole figure | median 0.7, p90 16.7, p99 28 mm | median 1.7, p90 16.5, p99 29 mm |

What is left:

- the hand-drawn asymmetries (his left knob and the right corner mark sit higher in NO.1-1);
- the cape's left edge and the boots (the 3D A-stance is a pose, not a drawing);
- the cel shading at the head's rim.

The face itself lies on the drawing.

### What is interpretation (the manual does not say)

1. **Depth.** The manual has no turnaround sheet. These come from the profile drawings:
   - the head is 0.95 times as deep as it is wide (NO.15-31: its profile is 1.09 times its height);
   - the siphons sit 0.25 U behind the head centre (NO.15-31);
   - the boot length 0.94 U;
   - the torso depth 0.6 U.
2. **The profile's face.**
   - In NO.15-31 the face reaches back to mid-head at cheek height. A rigid 3D head cannot do that and still show the hood bands of the front view. v1 let the front view rule; v2 adds **the face view** (below), so both are drawn as the manual draws them.
   - v2: the face lies on the head itself (`FACE_BULGE` 0). v1 raised it 0.06 U to bring the profile toward NO.15-31, but NO.15-31 measures the face's front at the plain head (0.93 U from the centre at the eye row; the head gives 0.938), and the face view below gives the profile its face.
   - The hood's lower hem runs from flap tip to flap tip under the chin. It is on the outline in every front view, and it is inked like every other colour edge.
3. **The back marks.** NO.9-1 is the only back view and it is small (the head is 350 px wide), so the back marks are ±0.03 U. v2 measured them again at NO.9-1's own scale and moved all three up about 0.13 U.
4. **Symmetry.** The hand-drawn asymmetries are mirrored to symmetry:
   - his left (−) knob is 0.04 U higher in NO.1-1;
   - the corner marks differ by up to 0.06 U.
5. **The knob marks face the front.** They are seen in every front and three-quarter view, and not in the back view.
6. **The scallop buckle is domed** (it stands out in the profile NO.15-31). It is a cone of 0.035 U over 0.05 U.
7. **The sword's other flank.** The サンマ is drawn on both flanks (a saury has two eyes); the manual shows one side.
8. **The arms and the fist.** The raised arm is 0.9 U from the shoulder to the fist, the same as the lowered one: 2D art draws the raised arm longer, a 3D body cannot.
9. **The colours under light.** Only in the review renders are lit faces the exact sRGB values. In the world the light changes them, as it changes every surface.
10. **The run keeps the サンマ raised** (v2), as NO.1-3 and NO.1-11 draw him on the move.
   - NO.1-5, the manual's run, carries it at the hip pointing back, with the free fist at his chin.
   - From behind (the game's view) that sword would point at the camera and cut through the flying cape, so the run takes NO.1-5's legs, its lean and its kicked-up sole, and NO.1-11's sword.
11. **The face view** (v2) is the manual's own off-axis convention made continuous. Its two measured ends are NO.16-15 (12.5 deg) and NO.15-31 / NO.10-7 (90 deg); between them, and behind him, the rule is ours.
12. **The cape's flare in motion** (v2) is ours between NO.1-1 at rest and NO.9-1 mid-stride.

### What the manual specifies that 3D cannot match exactly

- v2's face view draws the profile and the three-quarter faces as the manual does; what is left is the 2D cheats of the knobs (NO.10-7 spreads the two siphons apart in profile; in 3D they line up).
- **The line.** A drawn line has the same width on screen everywhere. The hull keeps 1.38 cm in the world, so it stays 1.25 % of his height at any distance, never thicker (`lineScale` ≤ 1 can only make it thinner).
- **The line's colour.** It is the manual's K100 black, not the world's softer ink (`#3a3346`). The manual specifies black (p.2).

## v2: measured against the manual (2026-10-08)

The owner asked: "is it accurate? Can you make it super accurate and with the design pdf?" v2 renders the model sharp from every view the manual draws, sets each one beside the city's drawing at the same scale, measures the differences, and fixes them, worst first.

**Method.**
- The scale of each drawing comes from its own eye dots. They are round, solid and the same size relative to the head in every drawing: 45 px at 393 px/U in NO.1-1. On NO.1-1 this reads 388.6 px/U, within 1 % of the head.
- `tools/anime/hoya3d-sheet.py` lays out the city's drawing | v1 | v2 at one scale in U.
- The sheets contain the city's art, so they live outside the repo (not included).

| # | What | The manual | v1 | v2 |
|---|---|---|---|---|
| 1 | The profile face (NO.15-31, NO.10-7), at the eye row, as a share of the head's depth from its front | face edge 0.472 / 0.471, eye 0.195 / 0.146 | 0.170 / 0.046: an orange ball with a sliver of face | 0.472 / 0.162 |
| 2 | The three-quarter face (NO.16-15: the head turned 12.5 deg, measured from the nose and the eyes), screen U from the head centre | face edges -0.893 / +0.555, eyes -0.52 / +0.10 | -0.824 / +0.508, eyes -0.48 / +0.08 | -0.840 / +0.540, eyes -0.517 / +0.107 |
| 3 | 45 deg and the 3/4 back (no drawing; between NO.16-15 and the profiles) | the drawings slide the face round the head | far eye on the silhouette, face 50 % of the head | face ~70 % of the head; at 135 deg only the cheek's edge |
| 4 | Shading | flat colour, K100 line | 4 tones, a sky-to-ground gradient, soft self-shadows, a grey band along the chin | 2 tones, flat fill, no self-shadow, the light's hue at 40 % |
| 5 | Walk (NO.1-3, 1-8, 16-19, 16-20; behind NO.9-1) | big strides: the front boot toe-up, the back boot's orange sole showing | shuffling steps, 0.10 m a stance | a high step toe-up (the sole forward), heel strike 40 deg, roll to the toe 42 deg, hips 18 deg, a bounce from pose; 0.20 m a stance |
| 6 | Run (NO.1-5, 1-11) | the back boot kicked up showing its sole, the cape flying | a short kick | a flight, a 60 deg kick showing the sole; 0.20 m a stance |
| 7 | Jump (NO.1-16) | one knee up in front with the sole forward, the other leg back, the fist at the chest, a wink | a symmetric tuck | as drawn, with the manual's own wink |
| 8 | The cape from behind (NO.9-1, mid-stride; NO.1-1 at rest) | hem ~±1.45 U mid-stride; points ±0.79 U at rest | ±0.84, the same in motion | ±0.84 at rest; flares ~±1.1 walking, more running |
| 9 | The サンマ (NO.1-1) | widest 0.31 U about halfway; the back bulges near the head end, the belly mid-body; the guard 0.43 U with a straight top, centred 1.32 U out | symmetric, 0.07 U too wide by the snout, narrow below; a crescent guard 1.23 U out | the two edges as measured (each row within 0.01 U); a straight-topped guard 0.44 U wide; the shoulder lifts out 0.12 U (v1 0.05), so the guard sits where NO.1-1 holds it |
| 10 | The hood's back marks (NO.9-1, 172 px/U) | the ^ +0.17 U from the head centre, the corners +0.45, the chevrons -0.18 | +0.04 / +0.34 / -0.31 | as drawn (`MARKS_BACK`) |
| 11 | The front laid over NO.1-1: ink-line distance, mm at 1.10 m (p50 / p90 / p99) | | figure 0.7 / 16.7 / 28; head 0 / 6.6 / 17 | figure 0 / 12.6 / 27.7; head 0 / 8.7 / 21 (the head crop holds the sword arm, which moved out) |
| 12 | Colours by day in the town's light (lit tone, sRGB) | the eight of p.2 | | 2-4 % above the official values at 09:00 (orange 250,134,32 vs 240,131,31), the town's own exposure; the review renders show them exact |

Still different, and why:
- **The knobs:** his left knob is 0.04 U higher in NO.1-1. It is hand-drawn, so it is mirrored to symmetry.
- **The free arm and the boots:** about 1 % of his height off in the overlay.
  - The boots stand 0.04–0.07 U narrower than NO.1-1's (boot centres ±0.43 U against ±0.46 / +0.49). A 20 deg splay (v1's is 17) measured worse overall (p90 13.1 mm) and lifted the soles, so 17 stays.
  - The free fist sits 0.08 U low. NO.1-1's forearm and fist are shorter than a 3D arm can be with the elbow where NO.1-1 draws it (1.40 U up), and the elbow was kept.
- **The line at 20 m on a phone** is under a pixel. It stays 1.25 % of his height; a minimum pixel width would be thicker than drawn.
- **In profile, the hood flap's bottom edge** shows as a short tooth at the foot of the face's edge.
  - NO.1-1 puts each flap's tip on the head's outline, so in 3D it sits at the side of the head; the profiles draw the face's edge as one smooth curve there.
  - Moving the tip would change the front view, so it stays.

### The face view (`FACE_VIEW`)

Every off-axis drawing in the manual slides the face round the head further than a rigid head can. A rigid 3D head matches NO.1-1 or NO.15-31, never both.
- **The rule.** v2 carries the head's *drawing* round the head's vertical axis:
  - what moves: the face, its eyes, nose and mouth, and the hood's marks;
  - the azimuth phi (from the face's centre) goes to W with `tan(W/2) = k·tan(phi/2)`;
  - the boost is `k = 1 + 1.45·sin²(camera azimuth)·cos²(camera elevation)`, set per camera just before each draw.
- **What it fits:**
  - k = 1 from the front and the back: NO.1-1 and NO.9-1 stay exact;
  - k = 2.45 in profile, where the render measures the manual's own face edge (0.472) and an eye inside its range.
- **The eyes** move with 1.2 times the boost (`FACE_VIEW.eyes`): at NO.16-15's 12.5 deg that is 1.08, which fits its eyes to 0.01 U.
- **Nothing is deformed.**
  - The head's shape never changes: every point is carried along its own row of the ellipsoid, so the silhouette, the proportions and the line are the same from every side.
  - The eyes and the nose move whole and are never stretched.
  - Every ink stroke moves by its own centre line, so its width never shears.
  - The line pass doesn't move the head at all: its silhouette is the same.
- **Under the chin** (below y = -0.3 U from the head centre) the effect eases to nothing by -0.7 U, where the face's edge already sits mid-head. The head has extra rows across that band, so no triangle shears. Behind him (90 to 165 deg) the boost eases off.
- **Cost:** one vertex attribute (`hoyaW`) and one uniform. Same 2 draw calls, same 2 programs.
- **Switch:** `setFaceView(false)` gives the rigid v1 head, if the city prefers it.

### The gait (`HOYA_GAIT`)

The walk, the run and the jump are built from the manual's drawings, on his own legs (0.4 U = 0.114 m). No squash or stretch: only the joints turn.

**The stance.**
- The planted boot sweeps back exactly as far as the body travels, so it never slides.
- It rolls heel (toe up 40 deg) to toe (heel up 42 deg).
- The hips turn 18 deg with the step. The pelvis drops only as far as the planted legs need (a soft minimum).
- The bounce comes from pose alone: down just after each contact, up on the planted toe as the other leg passes (the heel rises 16 deg). The head moves 5.2 cm a cycle.

**The swing.**
- The back boot kicks up so its orange sole shows to the back (NO.9-1, NO.1-5).
- The knee comes up (NO.16-20).
- Late in the swing the boot rises toe-up so its sole shows to the front (NO.1-3, NO.1-8), and the heel strikes toe-up (NO.16-19).

**The run** has a flight.

**The jump** follows NO.1-16:
- his right knee up in front, the boot flexed toe-up;
- his left leg reaching back;
- the free fist at his chest;
- the manual's own wink of his left eye.

**The cape** flares in motion:
- two side bones swing its outer, lower parts out from its top corners, toward NO.9-1;
- at rest it is NO.1-1's.

**The stride:** 0.20 m a stance walking (stance 0.56 of a cycle) and 0.20 m running (stance 0.36). With no slide that is about 1.3 m/s at 3.5 Hz walking and 3.0 m/s at 5.5 Hz running, the physical speeds of a 1.1 m child.

**In the game (from deploy #8):** the movement lane moves him at those speeds in third person, 1.5 m/s walking and 3.0 m/s running. That's `HOYA_SPEED` in `play/avatar/index.js`, decided on 10-08 (FEEL.md). First person and the original walker keep 3.1 / 6.4 m/s.
- The lane's cadence driver passes `run`, and `cadence` from `gait(speed, run)`: its `rate`, the no-slide rate held to the pose's readable ceiling (≤ 4.2 Hz walking, ≤ 5.5 Hz running). That's 4.1 Hz walking and 5.5 Hz running, so the planted boot stays put.
- Their `test/feel-gait.test.js` drives this model through that driver: 3/3 on the merged tree.

## The NG list (p.5) and how each is kept

| NG | Here | Test |
|---|---|---|
| 色を変える | only the eight colours | "only the official colours" |
| 輪郭の線を太くする | hull = the drawn weight; `lineScale` is clamped to ≤ 1 | "the line is never thicker" |
| 変形させる | no part is ever scaled: no squash-and-stretch scaling. The jump reads through pose (crouch, tuck, landing knees), as the manual's own jumps do (NO.1-16). The face view moves only the drawing on the head: every point stays on the head, so his shape, his proportions and his line are the same from every side | "no deformation" (900 frames of mixed motion); "it never changes his shape" (every head vertex stays on the ellipsoid at every boost) |
| サンマの剣を他の物に変えたり頭の上に帽子をのせる | the sword is always the サンマ, always in his right hand; nothing on his head | |
| バランスを変える | proportions measured from NO.1-1 | "feet at y = 0, 1.10 m" |
| 体の一部をバラしたり | one skinned body: parts never separate; the joints are soft | |
| 表情を変える | the face as drawn; the only other eye is the manual's own closed ⌒ (NO.15-3, NO.1-29) for 0.12 s blinks, and the jump's wink of his left eye as NO.1-16 draws it; `blink: false` (and reduced motion) turns both off | "the eyes"; "the jump ... winks" |
| キャラクターの上に文字やデザインを乗せる | nothing on him; the viewer's credit sits under him | |
| キャラクターを塗りつぶす | `setLift` keeps his colours at night | (renders `light.png`) |

## Motion

The motion is procedural: rotations of the rigid part groups only, every frame, from `update(dt, { speed, onGround, vy, cadence, run })`.

| Pose | What it does | After |
|---|---|---|
| idle | the A-stance, the sword up, the free fist at the hip; breathing (3.6 s), a little sway; a blink every 2.5–5.5 s | p.2, NO.1-1 |
| walk | a full stride (`HOYA_GAIT.walk`): heel strike toe-up, the roll to the toe, the back boot's sole kicked up, the knee up, the high step toe-up, the hips turning, a bounce from pose; the sword held up; the free arm swinging 56 deg; the cape flaring | NO.1-3, NO.1-8, NO.16-19, NO.16-20, NO.9-1 |
| run | leans in 11 deg, a flight, the back boot kicked up showing its orange sole, the cape flying and flaring, the sword up and ahead, the free arm pumping | NO.1-5, NO.1-11 |
| jump | his right knee up with the sole forward, the left leg back, the sword high, the free fist at the chest, the wink | NO.1-16 |
| fall | legs dangle, arms out, the cape lifts | |
| landing | the knees take it (0.2 s), the siphons bob on a spring | |

- **Blending.** idle → walk → run by speed (walk from 0.08 m/s, run from 2.3–3.6 m/s), or by `run` (0..1) when the caller chooses; jump and fall by `onGround` and `vy`.
- **The cycle rate.**
  - With `cadence` (cycles per second; a cycle is two steps), that rate. The movement lane locks it to the ground speed with `gait()`.
  - Without one, the rate at which the planted boot does not slide, capped at 4.2 Hz walking and 5.5 Hz running.
  - His feet stay level on the ground through two-bone leg IK and a level-foot constraint.
  - **The thighs turn back against the hips.** The hips turn 17–18 deg with the stride. Each thigh turns back by the same angle about the pelvis's up axis, so the leg swings in his heading. The knee and the boot point where he goes, and a planted boot stays in its line.
    - Before, each leg swung in the hips' plane, which carried the planted boot 1.4–2.1 cm sideways each stance. The movement lane saw it in town (10-08).
    - Measured with the movement lane's definition, the ankle within 1.2 cm of its lowest: sideways 0.15 cm a stance walking at 1.5 m/s, 0.55 cm running at 3.0. Along his heading it is 0.08–0.09 cm.
- **The sword** stays upright in every pose.
- `setPose(name)` forces a pose (stills, cut-scenes); `setPose('auto')` hands it back.
- **Reduced motion:** `setCalm(true)` (or `calm: true`) for `prefers-reduced-motion`. The bob, the sway, the flare and the cape's flutter drop, and there is no blink or wink.

## Integration (for the avatar and movement lanes)

```js
import { buildHoya, hoyaGait } from './avatar/hoya-model.js';
const hoya = buildHoya(THREE, { quality: ctx.tier.phone ? 'phone' : 'high', calm: reducedMotion });
scene.add(hoya.root);                 // feet at y = 0, facing -Z: rotate/move root, never scale it
const g = hoya.gait(speed, run);      // = hoyaGait(speed, run): { travel, stance, run, hz, rate }; run 0 walking, 1 running (omit: by speed)
hoya.update(dt, { speed, onGround, vy, run, cadence: g.rate });   // every frame; rate = min(no-slide hz, 4.2 walking / 5.5 running): the boot stays planted
hoya.setLift(night);                  // his own colours at night (0..1)
hoya.setFaceView(true);               // the face as the manual draws it off-axis (default); false: the rigid head
hoya.dispose();
```

- **Draw calls: 2.**
  - The body: two-tone cel, vertex colours, his own 16-texel ramp, double-sided with the outward normal kept. The model puts it on layer 0, but the avatar lane's mount calls `ctx.noOutline(root)`, which puts both meshes on layer 1. So in the app the world's edge pass draws nothing on him: his look is his own two tones and his own K100 line. The shadow camera sees every layer, so he still casts his shadow.
  - The line: an inverted hull, MeshBasicMaterial black, on layer 1 (`LAYER_NO_OUTLINE`).
- **Programs: 2** (`hoya3d-body-2`, `hoya3d-line-2`).
- **Triangles** (the model; `hoya.stats`):

  | Quality | Model | With the line pass (drawn per frame) |
  |---|---|---|
  | high | 5,817 | 10,283 |
  | phone | 2,687 | 4,581 |

  The budgets are 6 k and 3 k model triangles.
  - The line pass re-draws only the outlined triangles (bands, ink and the scallop's face are left out) from the same buffers: no second copy of the geometry.
  - v2 has +378 triangles on high and +174 on phone over v1 (5,439 / 2,513). Nearly all are the head's extra rows under the chin; the サンマ's re-measured blade moves a few either way.
- **GPU memory** (every buffer once, the indices, the bone texture, the ramp):
  - phone 211.5 KB, v1 177.2 KB (+34.3 KB);
  - high 413.2 KB, v1 345.7 KB (+67.5 KB).
  - The new attribute is `hoyaW` (3 floats a vertex).
- **Cost.** 27 part groups (bones; v2 adds the cape's two sides); `update()` allocates nothing per frame.
- **Batching.** Both meshes carry `userData.dynamic` and `userData.noBatch` (the world's static batching leaves them alone).
- **Bounds.** Both meshes have fixed bounds that fit every pose, so frustum culling never clips the run or the jump.
- **The world's edge pass.** The body stays in the world's normal/depth pre-pass, so world lines behind him are hidden.
  - The screen-space edge pass may add its own thin, colour-aware lines at his part joins (where a stalk meets the head, at the knees). They are 1–2 px at play distance.
  - If they show, the fix is in the pre-pass (core/renderer.js), not in the model.
  - The pre-pass and the shadow pass draw the head unmoved by the face view: the same shape.
- **Why bones.** The parts are THREE.Bones only so that one draw call carries the whole figure and the world's outline pre-pass (an override material that follows skinning) sees the pose.
  - Nothing is rigged by hand or weight-painted.
  - Every vertex belongs to one part, except the soft bends at the elbows and knees, down the cape and across its flaring sides.

## Renders

`docs/play/shots/hoya3d/` (v2 frames start `v2-`; every one carries the manual's credit band):

- **The turnaround:**
  - `v2-turnaround-desktop-day.png`, `v2-turnaround-desktop-night.png` (8 angles, 480 × 640 a frame);
  - `v2-turnaround-phone-day.png`, `v2-turnaround-phone-night.png` (he is ~170 px tall, as on a phone at play distance).
  - All in the town's own light.
- **The head round the clock:** `v2-heads.png` (0 to 180 deg: the face view).
- **Motion:**
  - `v2-gait-walk.png` and `v2-gait-run.png`: one cycle in 8 frames, from his left and from behind;
  - `v2-jump.png`;
  - `v2-backs.png`: straight behind, as NO.9-1;
  - `v2-walk.mp4`: 8 s of real `update()` calls with the cadence from `gait()` (stand, walk, run, jump, walk). The ground scrolls at his speed, and the camera comes round from behind to his side.
  - `v2-turntable.mp4`: one turn in 6 s, idle, in the town's day light: the face view as the camera goes round.
- **Light:** `v2-light.png` (day, dusk, night in the town's palettes).
- **In the app** (`tools/anime/hoya3d-inapp.mjs`, through the gate): `v2-inapp-phone.png` (iPhone 393×852 @3: standing, walking away, walking toward the camera, night) and `v2-inapp-desktop.png` (1600×900 Retina, day and night, the English HUD).
  - These are the app's own render on the deploy #8 tree (main `20751e0` + movement-feel-8 + this branch, 10-08 11:31 IST), with his on-screen credit.
  - The tool also measures:
    - his height on screen: 19–20 % of a portrait phone's height at the chase camera's 2.95 m, 22 % in landscape and on a desktop;
    - the frame times while he walks: 16.7 / 16.8 / 16.8 ms (p50 / p95 / p99, headless Chrome on the M3 Pro), with no frame over 50 ms;
    - the console: no errors, by phone, desktop or reduced motion.
- **v1:** `front.png`, `q34.png`, `side.png`, `back.png`, `q34back.png`, `front-blink.png`, `walk.png`, `run.png`, `air.png`, `turntable.mp4`, `play-behind.mp4`, `detail.png`, `light.png`, `phone/*.png`.
- **Side-by-side sheets with the city's drawings** (`--refs`, `tools/anime/hoya3d-sheet.py`) contain the city's art. They are reference only and kept outside the repo.
