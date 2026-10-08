# 歩きの手触り: how walking feels

The owner, 2026-10-08: "the walking and movement physics should be more crisper and smoother, we are Japanese game devs, remember." The reference for feel is Nintendo's third-person walks (Animal Crossing, Mario Odyssey, Zelda) and Ghibli-like town walkers. This page is the movement-feel lane's: what the walk does, every constant, and the numbers measured before and after.

## Targets and numbers

Measured in the town by `tools/anime/feel-probe.mjs` (headless Chrome through the gate): the same scripted walk on the phone tier (390×844 @3, real touches on the stick) and on a desktop (1440×900, real key events), at 60 and 30 fps. The script: stand 1.5 s, walk 2.5 s, run 2 s, the stick straight back 1.6 s, let go, forward then 45° right, let go; then a kerb route the probe finds by itself near PIER7 (+0.15, +0.09, −0.26, +0.20 m); then the PIER7 timber stair; then 歩く from the opening drone over the bay. Before is main `8882864`; after is this branch. Raw frames go to `dist/feel/<label>/`; the summaries are `docs/play/shots/feel/<label>-metrics.json`.

| | target | before: main `8882864` (phone / desktop) | after: deploy #8 (phone / desktop) |
|---|---|---|---|
| first visible motion | the first frame of input | frame 1 / 1 | frame 1 / 1 |
| 90 % of walking speed | 0.10–0.15 s, eased | 0.250 / 0.200 s (walking 2.7 / 3.1 m/s) | 0.150 / 0.100 s (walking 1.5 m/s; the phone's includes the thumb's 33 ms push) |
| standing to 90 % of the run | ≤ 0.15 s | — | 0.067 s (3.0 m/s) |
| stop (under 5 %) | ~0.10 s, a settle, no slide | 0.267 s, 0.27–0.31 m | 0.100 s, 0.08 m, no overshoot, a 1.5 cm settle |
| 180° turn (stick straight back) | 0.12–0.20 s, no snap | never: he walked backwards (95–98 % of the frames) | 0.167 s, never backwards |
| 45° change | a smooth curve | never faced it: he crabbed | follows it (desktop 0.10 s; on the phone 0.33–0.42 s from the start of a 0.24 s thumb arc) |
| the boot's slide while it is down, per stance, walk / run | 0 | 17.6–22.7 / 25 cm (+ 4 / 9 cm skidding at touch-down) | 0.00 / 0.02 cm (touch-down 0.13 / 0.06 cm) |
| his cycle, walk / run | locked to his speed | 3.0–3.2 / 3.5–3.6 Hz | 4.1 / 5.5 Hz = speed × stance / travel |
| camera behind its place, walking / running | none | 0.62–0.72 / 1.43–1.48 m | 0.00 / 0.00 m |
| camera still moving after he stops | none | 0.47–0.57 s | 0.03–0.05 s, under 1 cm |
| camera jitter (high-frequency acceleration) | ~0 | up to 0.42 / 0.48 m/s² | 0 / 0, at 60 and 30 fps |
| look-ahead | slight | none | 0.21 m walking, 0.42 m running (the view turns, ≤ ~10°) |
| the run's sense of speed | subtle | — | the view widens 3.5° (≤ 0.19° a frame at 60 fps) and comes back |
| kerbs: body jump in one frame / frames airborne | an eased lift / 0 | 0.15–0.20 m / 5–10 | 0.04 m / 0 |
| his height on screen | 15–25 % | 11.8 % / 21.8 % | 20.0 % / 21.8 % |
| 歩く from the opening drone | he starts on land | on the sea after a 98–158 m fall (4–5 s) | on the quay, 3–4 m in from the edge, an eased 1.2–1.7 s descent |
| the stick | dead zone, curve, run | full walk never reachable (91 %); 2 % speed at 20 % travel | full walk at 80 % travel; 0.25 u + 0.75 u² |
| 30 vs 60 fps | the same | the same (the fixed step) | the same: starts, stops, turns, slides and the camera match |

Deploy #7 (`e1be2c1`) shipped everything above at the walker's 3.1 / 6.4 m/s. Deploy #8 gives a custom character its own speeds (1.5 / 3.0) and a cadence lock through `gait()`. The original figure keeps 3.1 / 6.4 until that model is in the build.

## Proof: clips and stills

- **Clips of the same scripted walk** (`tools/anime/feel-probe.mjs --clip`): before, main `8882864`: `docs/play/shots/feel/before-phone.mp4` (390×844, 20 s) and `before-desktop.mp4` (1440×900 shown at 960×600, 23 s); after, on deploy #8's merges: `after-phone.mp4` (33 s; the r8 run, this branch with the hoya-accuracy lane's `f71293e`) and `after-desktop.mp4` (30 s; `dc9fef9`, with the hoya lane's head and emil-ui's HUD too). The phone's frames side by side: `sheet-phone.jpg`. The desktop after clip predates the credit's move to the right (`cf36c7b`).
- **Stills for the 出荷前チェック** (`tools/anime/feel-stills.mjs`): `docs/play/shots/feel/stills/`, a portrait phone in Japanese and English, at night and under reduced motion, a landscape phone, a 1600×900 desktop and a Retina 1440×900 @2. `stills-phone.json` and `stills-desktop.json` hold his height on screen and every HUD piece the credit touches (none), and the five places measured for the credit on a landscape phone.

## Arrivals in third person: before and after

`tools/anime/qa3.mjs` visits every walk spot in third person after the first-person pass (headless Chrome through the gate, 1600×900, the evening preset) and reads the frame's depth pass: the share of a 16 × 9 grid closer than 3 m (at most 0.35), the depth at his head against his distance (at least his distance − 0.3 m), the top colour share (at most 0.45). Before is main `d360fb3` with the same test, after is this branch. 5 of the 53 spots failed before and none fail after; the spots that changed:

| spot | before | after |
|---|---|---|
| 勝林寺 | 0.95 of the grid under 3 m: a wall 1.3 m from the lens, his head 1.29 m of 4.82 m behind it | 0.00, head clear (11.95 m behind him), 2.25 m ahead |
| カトリック | 0.64 under 3 m, a 1.1 m trunk 0.4 m behind him (head at 3.05 of 4.68 m) | 0.18, head clear, 1.5 m down the lane, turned 30° |
| 喫茶マンボ | his head behind a 電柱 (2.03 of 4.68 m) | clear (6.62 m behind him), boom 3.61 m: the pole is behind the lens |
| 紫神社 | top colour share 0.46 (road and shaded bank) | 0.30, 1.5 m up the road |
| 安波山 | top colour share 0.48 (shaded cedars) | 0.42, turned 20° |
| 大島の船着場, 警察署, パールシティ | he stood in the drawn ground to his chest (the skin 0.96 m over the DEM) | on the ground (lifted 0.96 m) |

The anti-snap probe (`tools/anime/walk-cam-probe.mjs`: six real routes, a walk of 3.2 s and a run of 2.2 s from each, phone 390×844 and desktop 1280×720, both runs on the same machine state, ~2,270 frames each): the worst boom change in one frame was 0.017 m (phone) and 0.026 m (desktop) on main, and is 0.021 m and 0.029 m now (the limit is 0.12 m, the cap 0.24 m). The camera's own height still steps 0.39 m at the kerb on the clutter route and 0.34 m on the PIER7 stair, and the phone's run up that stair still passes 0.33 m over a tread once: both as on main (the camera follows his feet over a step).

## The body (`src/anime/core/player.js`, `FEEL`)

- **Starts and stops.** The ground velocity is a critically damped spring toward the stick's velocity, solved exactly over each 1/60 s step: 38 /s setting off or steering (90 % of the speed in 0.10 s, on an S-curve that already moves on the first step), 46 /s stopping (under 5 % in 0.10 s, 0.13–0.16 m from a walk, and never past the stop). The air keeps its old, softer approach.
- **Turns.** In third person he turns to face the stick (the camera does not turn with him): a critically damped angle at 30 /s, so 180° is within 10° in 0.15 s and a nudge curves. While he still faces more than 35° away from the stick his speed is held back (none from 120°), so a reversal is a quick pivot on the spot. Straight back, he keeps turning the way he already turns, or toward the stick's side, never dithering at ±180°. First person keeps the view's heading.
- **Kerbs, stairs and slopes.** A grounded walker follows the ground down by up to a step (`STEP_HEIGHT` 0.45 m), so he no longer falls off every kerb and stair tread. Every step the physics takes in one go (up or down) is drawn as an eased lift (`lift`, 26 /s: ~0.15 s); a slope is followed exactly (a change under 4 cm + half the step's run is the ground's own shape). Landing from a jump is not eased.
- **Walls.** After the collisions the velocity is what he really moved, so against a wall he stops striding and the camera's look-ahead does not push into the wall.
- **Walks start on land.** (Under reduced motion it is a cut to the quay; 飛ぶ again mid-descent flies on from where he is.) A flight that ends without a placed pose (the pad's 歩く, 着地, F, a mode that just clears `fly`) over the sea, or more than 3 m above the town, is an eased descent (smootherstep across and down, 0.6–1.6 s by distance) to the nearest good ground: rings outward from where he was, the spot most in front of the view, then up to 3 m further in from the edge (`landSpot`, `spotGround`: land or a deck, nothing solid at his height, 0.6 m of level room around). The chase eases the picture down from the drone (`onLanding`). Placed poses (a tour stop, a door, the car's exit) are never a landing.

## The camera (`src/anime/play/avatar/camera.js`, `WALK`, `thirdFor`)

- **The rig by screen shape.** Landscape and desktop keep the 4.5 m boom (1.6 m look height, −8°, 0.35 m shoulder: he is 22 % of the picture). A portrait phone sees 88° tall (`core/fov.js`), where that boom left him at 12 %: it gets a 2.6 m boom looking at his chest (0.9 m), −14°, a 0.15 m shoulder, which frames him at 20 % with his feet two thirds of the way down. Between aspect 1 and 1:2 the rig blends.
- **The follow.** The boom's origin tracks his feet with their own velocity fed forward (a critically damped spring at 24 /s only on what the velocity does not explain): a steady walk or run has no lag, and a stop leaves the camera still within 0.05–0.10 s with no catch-up and no overshoot. Its height follows on a softer spring (9 /s), so kerbs and stairs never shake the picture. Any tracker without lag must overshoot a stop if its look-ahead moves the camera (measured: 0.23 m), so the look-ahead only turns the view: 0.14 s of his travel, at most ~10° (0.176 × the boom), built at 4 /s and let go at 12 /s.
- **Walls.** A wall or an eave shortens the boom: a solid at least 0.7 m across on any of eight headings (a 0.3 m wall met at 45° is 0.42 m deep either way and used to read as a pole), anywhere on the ray or above the line from his head to the camera at that point. The old pass for anything whose top was under the camera + 0.35 m let a 2.4 m wall hide him; a wall that rises above that line occludes, a 1 m one under it does not. The boom length eases in quickly (20 /s) and out slowly (4 /s), and never shortens or lengthens by more than 0.24 m in one frame (it used to clamp the moment a wall crossed the ray, which dropped the picture). A passer-by (the townspeople's moving boxes are left out of the camera's query altogether), a pole, a sign, a wire and a street tree's 0.5 m trunk are not walls: see *Seeing him*. A ray that already starts inside a building — the phone tier's solid footprint, which covers the stair beside PIER7 — keeps the framing instead of collapsing to his chest. The ground under the camera is the surface just beneath it, not the highest deck in the column (PIER7's upper landing was collapsing the boom). The camera stays at least 0.6 m above that surface (the drawn terrain, see *The drawn ground*), and never below the look point. It does not fall more than 0.24 m behind his feet in one frame. Beside a wall the shoulder offset is pulled in toward his column (14 /s, probed 1.5× out so it starts early): it snapped 0.35 m sideways before. A short boom rises (eased) and looks lower, as before (see [AVATAR.md](AVATAR.md)).
- **Cuts.** A placed pose (a tour stop, a door, `setPose`), the first frame, a frame with no time, or his feet more than 2 m from where the last frame had them is a cut: the origin, the shoulder, the look-ahead and the boom are solved straight to where they belong, with no easing (`st.cut`). Easing the boom after a teleport slid the camera through the wall it should have stopped at. Walking eases as before; a cut is not a snap, and reduced motion's snap is not a cut (a pole going by still gets its moment).
- **Seeing him.** He is 1.15 m tall; "him" is five lines from the camera, to his head, chest, hip and a shoulder each side (`SIGHT`), walked from him in 0.15 m samples. He is *hidden* when all five are blocked by anything. That is geometry: the lines are 0.4 m apart at his body and meet at the lens, so a pole within 1.5 m of the camera hides all five at any width, and the same pole beside him hides none. A moment of it (a pole going by is 0.15–0.3 s at a walk) changes nothing. After 0.4 s the boom comes in over 0.3 s on a quicker spring (36 /s, still 0.24 m a frame at most) to where his head or chest is clear again, and no shorter than 1.2 m: a pole at his heels is not worth his head. A cut has no moment: it goes straight there. The forest's trunks, which physics never held, are in the camera's world for this only (`avatar/trunks.js`: the drawn trunk, 0.1 × the crown radius at the foot for a broadleaf, 0.118 × for a cedar, tapering, planted 0.35 m down): he walks through them, so they are never a wall.
- **Arrivals.** `tour.walkTo` on foot in third person (a place in the list, the digit keys): when the boom at the spot has less than 70 % of its length (a wall or a trunk at his back: the ハリストス正教会 lane has a 1.1 m trunk 0.4 m behind him and the boom used to fall to his head, looking straight down at his feet), he is put 0.75–3.75 m ahead along the view, at the nearest place where he can stand and the boom has room (`chooseArrival`: no more than a step up, a drop up to 3 m, nothing solid at his body). The place is still ahead. A spot can also say how the camera wants him (`WALK_THIRD` in `explore/places.js`: `{ ahead, turn }`, chosen with the depth pass like the spot itself). カトリック's lane has houses 3 m either side of the camera behind him at every distance down the slope (near-depth 0.6): 1.5 m down it with the view turned 30° up it is 0.18. 勝林寺's camera place is behind a mid lot's concrete plinth (no collider): 2.25 m ahead it is in front of it. 紫神社's road and shaded bank are one colour bin at 0.46 of the picture (qa3's limit is 0.45): 1.5 m up the road it is 0.30; 安波山's forest path is 0.48 and 0.42 with the view turned 20°. First person, the drone and every other placed pose are left where they are put.
- **The drawn ground.** Physics stands him on the DEM. Away from the hero zone the terrain skin is coarse triangles that can lie 0.96 m above it (大島の船着場, 警察署, パールシティ: he stood in the ground to his chest and the camera saw the top of his head). On bare terrain he and the camera's picture of him are lifted to the skin (`terrainLift`, eased at 8 /s, at most 1.5 m; a cut takes it at once), and the camera never goes under it. Where a road is cut into a slope the skin lies below the DEM and the road mesh is drawn at the DEM, so it is the higher of the two. First person is unchanged.
- **Short booms.** Under the rig's own measure (`liftAt`: 2.4 m on the 4.5 m boom, 1.39 m on the portrait one) a short boom rises 0.45 m for each metre lost, eased, and stops under a ceiling; the look point drops toward his chest.
- **Dropped frames.** Frames of 16.7 to 50 ms mixed keep the camera within 1 cm of its 60 fps place behind him (`test/feel-camera.test.js`).
- **Reduced motion** snaps every frame, as before. The gull keeps its own follow (`placeChase`).

## The stick (`src/anime/ui/touchpad.js`, the curve only)

Past the 12 % dead zone (6.7 px of the 56 px travel) the push u, reaching 1 at 80 % of the travel, gives `0.25 u + 0.75 u²`: a quarter of linear's slope at the start (a small push is a slow walk you can steer), steepening to full walking speed at 80 %, before RUN at 85 % (with its 5 % hysteresis). The smoothstep before gave 2 % of the speed at 20 % travel and topped out at 91 % of walking speed. The car, the boat, the swim and the gull read the same `pad.move`.

## Speeds and the walk cycle (deploy #8)

**A custom character walks at 1.5 m/s and runs at 3.0 m/s in third person.** First person and the original walker keep 3.1 / 6.4. The numbers live in `CHARACTER_SPEED` (`src/anime/play/avatar/pose.js`, re-exported from `index.js`). `?speed=walk,run` tries others (`?speed=0` gives the walker's speeds). Until `meme-model.js` loads, the original figure is what you see, at the walker's speeds.

The run stays lively: from standing to a run in at most 0.15 s, ダッシュ is the run, and at a run the view widens by 3.5° (90 % in 0.65 s, back within 0.45 s; `RUN_FOV`), measured from the screen's own field of view and given back when the walk ends (none under reduced motion).

## The walk cycle

The run stays lively: from standing to 3.0 m/s in at most 0.15 s, ダッシュ is the run, and at a run the view widens by at most 2° (90 % in ~1.3 s, back in about a second; `RUN_FOV`), measured from the screen's own field of view. Walking does not change it. The addition is given back in one frame when the walk ends (`dropRunFov`: a mode that takes the camera keeps that mode's own lens), and there is none under reduced motion.

When a model offers `gait(speed, run)`, `play/avatar/index.js` `gaitCadence` drives `update(dt, { …, cadence, run })` with the model's own no-slide `rate` (`speed × stance / travel`, held to 1.6–5.5 Hz). `run` is 0 walking and 1 running. The footsteps follow that cadence and soften as the patter quickens (`footstepGain`). A model without `gait()`, and the original figure, keep their own speed-driven cycle. The slot test is `test/feel-gait.test.js`: a missing module loads as null, quietly.

## Checking it

- `env -u NODE_OPTIONS bun test ./test/feel-player.test.js ./test/feel-camera.test.js ./test/feel-metrics.test.js ./test/feel-gait.test.js ./test/feel-credit.test.js`: the numbers above through the real `Player` and camera, the probe's metrics against synthetic motion with known answers, the slot's quiet fallback, and the absence of a credit pill.
- `tools/anime/gate.sh chrome --fg env -u NODE_OPTIONS bun tools/anime/feel-probe.mjs --label <name> [--fps 60,30] [--clip] [--throttle 4]`: the town numbers (and clips into `docs/play/shots/feel/`).
- `tools/anime/gate.sh chrome --fg env -u NODE_OPTIONS bun tools/anime/qa3.mjs --port P --build 1 --phone 1`: every walk spot in first and then third person (`3rd <id>` lines; the numbers per spot are `walk3` in `dist/qa3/ui_report.json`).
- `WALK_CAM_OUT=dist/review/walk-cam tools/anime/gate.sh chrome --fg env -u NODE_OPTIONS bun tools/anime/walk-cam-probe.mjs --label <name> --port P`: the anti-snap probe, real streets on the phone and the desktop, a walk and a run from each spot; its summary is `<label>.json` (`maxBoomJump`, `maxY`, `minH`).
- `tools/anime/gate.sh chrome --fg env -u NODE_OPTIONS bun tools/anime/feel-modes.mjs`: every mode that shares the player (fly, gull, drive, swim, 一本釣り, かつお), each followed by a walk.
