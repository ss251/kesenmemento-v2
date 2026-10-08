# 歩きの手触り: how walking feels

The owner, 2026-10-08: "the walking and movement physics should be more crisper and smoother, we are Japanese game devs, remember." The reference for feel is Nintendo's third-person walks (Animal Crossing, Mario Odyssey, Zelda) and Ghibli-like town walkers. This page is the movement-feel lane's: what the walk does, every constant, and the numbers measured before and after.

## Targets and numbers

Measured in the town by `tools/anime/feel-probe.mjs` (headless Chrome through the gate): the same scripted walk on the phone tier (390×844 @3, real touches on the stick) and on a desktop (1440×900, real key events), at 60 and 30 fps. The script: stand 1.5 s, walk 2.5 s, run 2 s, the stick straight back 1.6 s, let go, forward then 45° right, let go; then a kerb route the probe finds by itself near PIER7 (+0.15, +0.09, −0.26, +0.20 m); then the PIER7 timber stair; then 歩く from the opening drone over the bay. Before is main `8882864`; after is this branch. Raw frames go to `dist/feel/<label>/`; the summaries are `docs/play/shots/feel/<label>-metrics.json`.

| | target | before (phone / desktop) | after (phone / desktop) |
|---|---|---|---|
| first visible motion | the first frame of input | frame 1 / 1 | frame 1 / 1 |
| 90 % of walking speed | 0.10–0.15 s, eased | 0.250 / 0.200 s | 0.150 / 0.100 s (the phone's includes the thumb's 33 ms push) |
| stop (under 5 %) | ~0.10 s, a settle, no slide | 0.267 s, 0.27–0.31 m | 0.100 s, 0.16 m, no overshoot, a 1.5 cm settle |
| 180° turn (stick straight back) | 0.12–0.20 s, no snap | never: he walked backwards (95–98 % of the frames) | 0.167 s, never backwards |
| 45° change | a smooth curve | never faced it: he crabbed | follows it (desktop 0.10 s; on the phone 0.33–0.45 s from the start of a 0.24 s thumb arc) |
| camera behind its place, walking / running | none | 0.62–0.72 / 1.43–1.48 m | 0.00 / 0.00 m |
| camera still moving after he stops | none | 0.47–0.57 s | 0.05–0.10 s, under 1 cm |
| look-ahead | slight | none | 0.43 m walking, up to ~10° of the view |
| kerbs: body jump in one frame / frames airborne | an eased lift / 0 | 0.15–0.20 m / 5–10 | 0.04 m / 0 |
| his height on screen | 15–25 % | 11.8 % / 21.8 % | 20.0 % / 21.8 % |
| 歩く from the opening drone | he starts on land | on the sea after a 98–158 m fall (4–5 s) | on the quay, 3–4 m in from the edge, an eased 1.2–1.7 s descent |
| the stick | dead zone, curve, run | full walk never reachable (91 %); 2 % speed at 20 % travel | full walk at 80 % travel; 0.25 u + 0.75 u² |
| foot slip (planted foot / body) | 0 | 73–80 % walk, 84–88 % run | unchanged: deploy #8 (below) |
| 30 vs 60 fps | the same | the same (the fixed step) | the same (all springs are exact over the step) |

## The body (`src/anime/core/player.js`, `FEEL`)

- **Starts and stops.** The ground velocity is a critically damped spring toward the stick's velocity, solved exactly over each 1/60 s step: 38 /s setting off or steering (90 % of the speed in 0.10 s, on an S-curve that already moves on the first step), 46 /s stopping (under 5 % in 0.10 s, 0.13–0.16 m from a walk, and never past the stop). The air keeps its old, softer approach.
- **Turns.** In third person he turns to face the stick (the camera does not turn with him): a critically damped angle at 30 /s, so 180° is within 10° in 0.15 s and a nudge curves. While he still faces more than 35° away from the stick his speed is held back (none from 120°), so a reversal is a quick pivot on the spot. Straight back, he keeps turning the way he already turns, or toward the stick's side, never dithering at ±180°. First person keeps the view's heading.
- **Kerbs, stairs and slopes.** A grounded walker follows the ground down by up to a step (`STEP_HEIGHT` 0.45 m), so he no longer falls off every kerb and stair tread. Every step the physics takes in one go (up or down) is drawn as an eased lift (`lift`, 26 /s: ~0.15 s); a slope is followed exactly (a change under 4 cm + half the step's run is the ground's own shape). Landing from a jump is not eased.
- **Walls.** After the collisions the velocity is what he really moved, so against a wall he stops striding and the camera's look-ahead does not push into the wall.
- **Walks start on land.** (Under reduced motion it is a cut to the quay; 飛ぶ again mid-descent flies on from where he is.) A flight that ends without a placed pose (the pad's 歩く, 着地, F, a mode that just clears `fly`) over the sea, or more than 3 m above the town, is an eased descent (smootherstep across and down, 0.6–1.6 s by distance) to the nearest good ground: rings outward from where he was, the spot most in front of the view, then up to 3 m further in from the edge (`landSpot`, `spotGround`: land or a deck, nothing solid at his height, 0.6 m of level room around). The chase eases the picture down from the drone (`onLanding`). Placed poses (a tour stop, a door, the car's exit) are never a landing.

## The camera (`src/anime/play/avatar/camera.js`, `WALK`, `thirdFor`)

- **The rig by screen shape.** Landscape and desktop keep the 4.5 m boom (1.6 m look height, −8°, 0.35 m shoulder: he is 22 % of the picture). A portrait phone sees 88° tall (`core/fov.js`), where that boom left him at 12 %: it gets a 2.6 m boom looking at his chest (0.9 m), −14°, a 0.15 m shoulder, which frames him at 20 % with his feet two thirds of the way down. Between aspect 1 and 1:2 the rig blends.
- **The follow.** The boom's origin tracks his feet with their own velocity fed forward (a critically damped spring at 24 /s only on what the velocity does not explain): a steady walk or run has no lag, and a stop leaves the camera still within 0.05–0.10 s with no catch-up and no overshoot. Its height follows on a softer spring (9 /s), so kerbs and stairs never shake the picture. Any tracker without lag must overshoot a stop if its look-ahead moves the camera (measured: 0.23 m), so the look-ahead only turns the view: 0.14 s of his travel, at most ~10° (0.176 × the boom), built at 4 /s and let go at 12 /s.
- **Walls.** The boom length eases in quickly (20 /s) and out slowly (4 /s) toward the clear distance and is clamped to it the moment a wall comes between: never a view through a wall. Beside a wall the shoulder offset is pulled in toward his column (14 /s, probed 1.5× out so it starts early): it snapped 0.35 m sideways before. A short boom rises (eased) and looks lower, as before (see [AVATAR.md](AVATAR.md)).
- **Short booms.** Under the rig's own measure (`liftAt`: 2.4 m on the 4.5 m boom, 1.39 m on the portrait one) a short boom rises 0.45 m for each metre lost, eased, and stops under a ceiling; the look point drops toward his chest.
- **Dropped frames.** Frames of 16.7 to 50 ms mixed keep the camera within 1 cm of its 60 fps place behind him (`test/feel-camera.test.js`).
- **Reduced motion** snaps every frame, as before. The gull keeps its own follow (`placeChase`).

## The stick (`src/anime/ui/touchpad.js`, the curve only)

Past the 12 % dead zone (6.7 px of the 56 px travel) the push u, reaching 1 at 80 % of the travel, gives `0.25 u + 0.75 u²`: a quarter of linear's slope at the start (a small push is a slow walk you can steer), steepening to full walking speed at 80 %, before RUN at 85 % (with its 5 % hysteresis). The smoothstep before gave 2 % of the speed at 20 % travel and topped out at 91 % of walking speed. The car, the boat, the swim and the gull read the same `pad.move`.

## His walk cycle (deploy #8)

His planted foot slides because his legs are short for his speed: the manual's legs are 0.114 m long, and at 3.1 m/s a cycle that keeps the foot planted would need ~15 Hz with the old stride. The hoya-accuracy lane's model (`0ce9a47`) gives the manual's stride (0.17 m a stance walking, 0.19 m running) and `gait(speed)`; `play/avatar/index.js` `gaitCadence` then drives `update(dt, { …, cadence })` with `speed × stance / travel`, held to 1.6–5.5 Hz, and the footsteps follow it. It is dormant until the model offers `gait()`. Planting the feet at 5.5 Hz also needs his third-person speeds near 1.7 m/s walking and 2.9 m/s running; that decision is the conductor's for deploy #8.

## Checking it

- `env -u NODE_OPTIONS bun test test/feel-player.test.js test/feel-camera.test.js test/feel-metrics.test.js`: the numbers above through the real `Player` and camera, and the probe's metrics against synthetic motion with known answers.
- `tools/anime/gate.sh chrome --fg env -u NODE_OPTIONS bun tools/anime/feel-probe.mjs --label <name> [--fps 60,30] [--clip] [--throttle 4]`: the town numbers (and clips into `docs/play/shots/feel/`).
- `tools/anime/gate.sh chrome --fg env -u NODE_OPTIONS bun tools/anime/feel-modes.mjs`: every mode that shares the player (fly, gull, drive, swim, 一本釣り, かつお), each followed by a walk.
