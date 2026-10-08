# 3D ホヤぼーや: the walking avatar

気仙沼市観光キャラクター「海の子 ホヤぼーや」 (Kesennuma City Mascot, Hoya Boya the Ocean Boy), built in 3D from the city's design manual for KesenMemento's third-person walk.

- **Code:** `src/anime/play/avatar/hoya-model.js`.
- **Tests:** `test/play-hoya3d.test.js` (`env -u NODE_OPTIONS bun test test/play-hoya3d.test.js`).
- **Renders:** `docs/play/shots/hoya3d/`, made with `env -u NODE_OPTIONS bun tools/anime/hoya3d-shots.mjs` (WebKit, no Chrome).

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
| Three-quarter views | NO.16-15, NO.16-9 (p.26), NO.1-3 (p.6) | checks |
| Motion | NO.1-3, NO.1-5, NO.1-11, NO.1-16 (p.6), NO.14-5 (p.18) | the walk, the run, the jump |
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
- **Light.** Review renders are lit so that a lit face shows the exact sRGB value (the shade is the world's cel step darker). In the world he takes the world's light like everything else; `setLift(v)` lets his own colours glow back at night, so he never turns into a dark silhouette (p.5 NG: キャラクターを塗りつぶす).

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
   - In NO.15-31 the face reaches back to mid-head at cheek height. A 3D head cannot do that and still show the hood bands of the front view, so **the front view rules**.
   - The face stands 0.06 U proud of the hood (`FACE_BULGE`), which brings the profile closer to NO.15-31 without changing the front.
   - The hood's lower hem runs from flap tip to flap tip under the chin. It is on the outline in every front view, and it is inked like every other colour edge.
3. **The back marks.** NO.9-1 is the only back view and it is small (the head is 350 px wide), so the back marks are ±0.03 U.
4. **Symmetry.** The hand-drawn asymmetries are mirrored to symmetry:
   - his left (−) knob is 0.04 U higher in NO.1-1;
   - the corner marks differ by up to 0.06 U.
5. **The knob marks face the front.** They are seen in every front and three-quarter view, and not in the back view.
6. **The scallop buckle is domed** (it stands out in the profile NO.15-31). It is a cone of 0.035 U over 0.05 U.
7. **The sword's other flank.** The サンマ is drawn on both flanks (a saury has two eyes); the manual shows one side.
8. **The arms and the fist.** The raised arm is 0.9 U from the shoulder to the fist, the same as the lowered one: 2D art draws the raised arm longer, a 3D body cannot.
9. **The colours under light.** Only in the review renders are lit faces the exact sRGB values. In the world the light changes them, as it changes every surface.

### What the manual specifies that 3D cannot match exactly

- The profile cheat above, and the 2D three-quarter views (NO.16-15) that turn the face more than the head.
- **The line.** A drawn line has the same width on screen everywhere. The hull keeps 1.38 cm in the world, so it stays 1.25 % of his height at any distance, never thicker (`lineScale` ≤ 1 can only make it thinner).
- **The line's colour.** It is the manual's K100 black, not the world's softer ink (`#3a3346`). The manual specifies black (p.2).

## The NG list (p.5) and how each is kept

| NG | Here | Test |
|---|---|---|
| 色を変える | only the eight colours | "only the official colours" |
| 輪郭の線を太くする | hull = the drawn weight; `lineScale` is clamped to ≤ 1 | "the line is never thicker" |
| 変形させる | no part is ever scaled: no squash-and-stretch scaling. The jump reads through pose (crouch, tuck, landing knees), as the manual's own jumps do (NO.1-16) | "no deformation" (900 frames of mixed motion) |
| サンマの剣を他の物に変えたり頭の上に帽子をのせる | the sword is always the サンマ, always in his right hand; nothing on his head | |
| バランスを変える | proportions measured from NO.1-1 | "feet at y = 0, 1.10 m" |
| 体の一部をバラしたり | one skinned body: parts never separate; the joints are soft | |
| 表情を変える | the face as drawn; the only other eye is the manual's own closed ⌒ (NO.15-3, NO.1-29) for 0.12 s blinks; `blink: false` turns it off | "the eyes" |
| キャラクターの上に文字やデザインを乗せる | nothing on him; the viewer's credit sits under him | |
| キャラクターを塗りつぶす | `setLift` keeps his colours at night | (renders `light.png`) |

## Motion

The motion is procedural: rotations of the rigid part groups only, every frame, from `update(dt, { speed, onGround, vy })`.

| Pose | What it does | After |
|---|---|---|
| idle | the A-stance, the sword up, the free fist at the hip; breathing (3.6 s), a little sway; a blink every 2.5–5.5 s | p.2, NO.1-1 |
| walk | quick short steps (his legs are 0.11 m), the body bobbing twice a step, a waddle, the cape swaying, the sword held up and bobbing, the free arm swinging | NO.1-3, NO.14-5 |
| run | leans in 15°, the back boot kicks up and shows its orange sole, the cape flies, the sword up and forward, the free arm pumping | NO.1-5, NO.1-11 |
| jump | knees tucked, boots behind, the sword high, the free arm out | NO.1-16 |
| fall | legs dangle, arms out, the cape lifts | |
| landing | the knees take it (0.2 s), the siphons bob on a spring | |

- **Blending.** idle → walk → run by speed (walk from 0.1 m/s, run from 2.3–3.6 m/s); jump and fall by `onGround` and `vy`.
- **Steps.** The cadence rises with speed (1.9–3.6 steps per second per leg). His feet stay level on the ground through two-bone leg IK and a level-foot constraint.
- **The sword** stays upright in every pose.
- `setPose(name)` forces a pose (stills, cut-scenes); `setPose('auto')` hands it back.
- **Reduced motion:** `setCalm(true)` (or `calm: true`) for `prefers-reduced-motion`. The bob, the sway and the cape's flutter drop to a third, and there is no blink.

## Integration (for the avatar lane)

```js
import { buildHoya } from './avatar/hoya-model.js';
const hoya = buildHoya(THREE, { quality: ctx.tier.phone ? 'phone' : 'high', mat: ctx.mat, calm: reducedMotion });
scene.add(hoya.root);                 // feet at y = 0, facing -Z: rotate/move root, never scale it
hoya.update(dt, { speed, onGround, vy });   // every frame
hoya.setLift(night ? 0.35 : 0);       // his own colours at night
hoya.dispose();
```

- **Draw calls: 2.**
  - The body: cel shaded, vertex colours, no textures. It stays on layer 0, so the world's edge pre-pass and the shadow pass see the pose.
  - The line: an inverted hull, MeshBasicMaterial black, on layer 1 (`LAYER_NO_OUTLINE`).
- **Triangles** (the model; `hoya.stats`):

  | Quality | Model | With the line pass (drawn per frame) |
  |---|---|---|
  | high | 5,439 | 9,529 |
  | phone | 2,513 | 4,231 |

  The budgets are 6 k and 3 k model triangles. The line pass re-draws only the outlined triangles (bands, ink and the scallop's face are left out) from the same buffers: no second copy of the geometry.
- **Cost.** 25 part groups (bones); `update()` allocates nothing per frame.
- **Batching.** Both meshes carry `userData.dynamic` and `userData.noBatch` (the world's static batching leaves them alone).
- **Bounds.** Both meshes have fixed bounds that fit every pose, so frustum culling never clips the run or the jump.
- **The world's edge pass.** The body stays in the world's normal/depth pre-pass so world lines behind him are hidden. The screen-space edge pass may add its own thin, colour-aware lines at his part joins (where a stalk meets the head, at the knees). They are 1–2 px at play distance. If they show, the fix is in the pre-pass (core/renderer.js), not in the model.
- **Why bones.** The parts are THREE.Bones only so that one draw call carries the whole figure and the world's outline pre-pass (an override material that follows skinning) sees the pose. Nothing is rigged by hand or weight-painted. Every vertex belongs to one part, except the soft bends at the elbows and knees and down the cape.

## Renders

`docs/play/shots/hoya3d/`:

- **The views:** `front.png`, `q34.png`, `side.png`, `back.png`, `q34back.png`.
- **The blink:** `front-blink.png`.
- **Motion strips:** `walk.png` (one cycle in 8 frames), `run.png`, `air.png` (idle, jump, apex, fall, walk and run from behind).
- **Turntable:** a 4 s clip at 30 fps (video, not included).
- **Play:** a 6 s clip (video, not included) of real `update()` calls (stand, walk, run, jump, land) from the game's third-person camera.
- **Close-ups:** `detail.png` (the joints and small parts) and `light.png` (day, dusk, dusk with `setLift`).
- **Phone quality:** `phone/*.png`, the same views at `quality: 'phone'`.
- **Side-by-side sheets with the official views:** `compare/*.png`.
  - Made only with `--refs <folder of the city's variation PNGs>`.
  - They contain the city's art, so they are git-ignored: reference only, for the review.
