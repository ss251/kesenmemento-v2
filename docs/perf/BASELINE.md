# Performance baseline (main a8c3206 + the profiler, 2026-10-07)

Measured before any fix, by the performance lane (branch `feat/smooth`). The profiler commit (c98d08e) adds only `?perf=1` hooks, which do nothing without the flag. Its numbers are the reference for [RESULTS.md](RESULTS.md).

## How it was measured

- **Harness:** `tools/perf/run.mjs` drives the real app in headless Chrome 154 (ANGLE/Metal, real GPU). The in-page profiler `src/anime/core/perf.js` records every rendered frame:
  - the requestAnimationFrame timestamp;
  - CPU ms split by system (self time);
  - GPU ms (EXT_disjoint_timer_query_webgl2);
  - draw calls and triangles.
  V8's GC pauses come from a Chrome trace and are placed on their frames.
- **Host:** the second machine Pro M3 Pro (18 GB), through the remote runner, with **`gate.sh chrome --fg`**: the Chrome lock and the load watchdog, but normal scheduling priority. Without `--fg`, the gate runs Chrome under `taskpolicy -b`, see the finding below. Every number on this page ran with `--fg`.
- **Frame rate:** headless Chrome fires requestAnimationFrame at 60 Hz, so every interval is a whole number of 16.7 ms vsyncs.
- **Scenarios:** each runs 60 s, after 3 s of settling that is not recorded. They follow `tools/perf/scenarios.page.js` and drive the app through its own input paths:
  - **walk:** running on foot along the inner bay's streets (W + Shift; it follows the road network; about 400 m).
  - **drive:** the kei car from the inner bay, W held, with its lane assist (about 440 m).
  - **drone:** the film path (`tour.filmPose`), 30 s out and 30 s back (3.2 km of camera path).
  - **turn:** the opening drone view turned through 360 degrees.
- **Configs:**

  | config | viewport | DPR | tier | render targets | canvas |
  |---|---|---|---|---|---|
  | desktop | 1600x900 | 1 | high | 1600x900 | 1600x900 |
  | retina | 1440x900 | 2 | high (pixel ratio 1.5) | 2160x1350 | 1440x900 |
  | phone | 390x844, mobile + touch + iPhone UA | 3 | phone (pixel ratio 1.25) | 488x1055 | 390x844 |

- **Columns:**
  - interval = time between rendered frames;
  - hitches = intervals over 25 / 33.4 / 50.1 / 100 ms (one, two or more, three or more dropped 60 Hz frames);
  - CPU = main-thread time of the frame callback;
  - long tasks = PerformanceObserver;
  - programs = shader programs at the end of the scenario.

## Results

| config | scenario | fps | interval ms p50 / p95 / p99 / max | hitches >25 / >33 / >50 / >100 | CPU ms mean / p95 | GPU ms p50 / p95 | calls mean / max | tris | programs | long tasks (max ms) | GC pauses n / total ms / max ms / in hitches | top CPU (ms/frame) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| desktop | walk | 59.8 | 16.7 / 16.8 / 16.8 / 67 | 9 / 4 / 1 / 0 | 6.9 / 9.4 | 14.2 / 16.3 | 796 / 1027 | 13.01 M | 160 | 3 (67) | 101 / 69.6 / 11.6 / 2 | render 5.00, render:shadow 0.75, hud:explore-ui 0.18, life:sound 0.17 |
| desktop | drive | 59.2 | 16.7 / 16.8 / 16.8 / 350 | 24 / 11 / 3 / 1 | 8.3 / 12.2 | 13.9 / 20.3 | 768 / 1014 | 13.23 M | 162 | 4 (355) | 120 / 82.8 / 12.7 / 4 | render 5.75, render:shadow 0.87, life:sound 0.42, audio 0.36 |
| desktop | drone | 49.5 | 16.7 / 33.4 / 33.4 / 67 | 626 / 63 / 1 / 0 | 11.3 / 15.1 | 18.4 / 25.8 | 1173 / 1610 | 14.47 M | 177 | 3 (60) | 132 / 74.2 / 1.3 / 0 | render 8.05, render:shadow 1.16, audio 0.59, life:sound 0.58 |
| desktop | turn | 51.8 | 16.7 / 33.4 / 33.4 / 67 | 483 / 63 / 3 / 0 | 10.6 / 12.9 | 17.3 / 20.8 | 1119 / 1463 | 14.10 M | 177 | 2 (64) | 383 / 241.8 / 56.3 / 4 | render 7.43, render:shadow 1.00, life:sound 0.77, audio 0.77 |
| retina | walk | 50.9 | 16.7 / 33.4 / 33.4 / 100 | 533 / 127 / 4 / 0 | 8.6 / 10.3 | 20.6 / 26.7 | 773 / 982 | 12.92 M | 160 | 5 (96) | 90 / 56.2 / 1.3 / 2 | render 6.43, render:shadow 1.04, hud:explore-ui 0.18, labels 0.14 |
| retina | drive | 51.4 | 16.7 / 33.4 / 33.4 / 83 | 499 / 72 / 7 / 0 | 9.3 / 11.0 | 18.8 / 25.8 | 751 / 996 | 13.13 M | 162 | 7 (91) | 109 / 89.4 / 15.8 / 3 | render 6.72, render:shadow 1.03, life:sound 0.32, audio 0.28 |
| retina | drone | 41.0 | 16.7 / 33.4 / 33.4 / 83 | 1130 / 89 / 4 / 0 | 11.8 / 13.8 | 24.1 / 32.4 | 1152 / 1592 | 14.41 M | 177 | 5 (79) | 112 / 63.8 / 1.2 / 0 | render 8.60, render:shadow 1.16, audio 0.51, life:sound 0.48 |
| retina | turn | 41.9 | 16.7 / 33.4 / 33.4 / 67 | 1084 / 108 / 1 / 0 | 11.1 / 12.9 | 24.1 / 29.0 | 1088 / 1458 | 14.04 M | 177 | 2 (63) | 350 / 170.8 / 29.5 / 1 | render 8.11, render:shadow 1.04, audio 0.65, life:sound 0.64 |
| phone | walk | 59.9 | 16.7 / 16.7 / 16.8 / 33 | 4 / 2 / 0 / 0 | 5.3 / 6.3 | 8.7 / 13.7 | 429 / 595 | 4.11 M | 151 | 0 (0) | 50 / 28.4 / 1.0 / 0 | render 4.04, life:sound 0.26, audio 0.23, render:shadow 0.17 |
| phone | drive | 59.8 | 16.7 / 16.8 / 16.8 / 100 | 6 / 3 / 2 / 0 | 5.9 / 6.8 | 10.4 / 14.3 | 445 / 623 | 4.21 M | 155 | 2 (100) | 139 / 161.8 / 83.0 / 1 | render 4.13, life:sound 0.56, audio 0.31, render:shadow 0.19 |
| phone | drone | 60.0 | 16.7 / 16.7 / 16.8 / 33 | 1 / 0 / 0 / 0 | 6.7 / 7.7 | 11.4 / 16.5 | 572 / 982 | 4.27 M | 170 | 0 (0) | 86 / 45.6 / 0.9 / 0 | render 4.46, life:sound 0.83, audio 0.70, render:shadow 0.19 |
| phone | turn | 60.0 | 16.7 / 16.7 / 16.8 / 33 | 1 / 0 / 0 / 0 | 7.0 / 7.9 | 11.5 / 16.4 | 553 / 1013 | 4.16 M | 170 | 0 (0) | 376 / 145.5 / 22.0 / 0 | render 4.24, life:sound 1.06, audio 0.94, render:shadow 0.20 |

### CPU ms per frame, by system (mean)

| config | scenario | sim | streaming | batching | labels | HUD | life (people, sound, season) | world updates | audio | sky + view | render submit | shadow submit | other | total |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| desktop | walk | 0.06 | 0.09 | 0.07 | 0.14 | 0.20 | 0.29 | 0.13 | 0.16 | 0.01 | 5.00 | 0.75 | 0.02 | 6.92 |
| desktop | drive | 0.08 | 0.12 | 0.12 | 0.11 | 0.20 | 0.54 | 0.14 | 0.36 | 0.01 | 5.75 | 0.87 | 0.02 | 8.32 |
| desktop | drone | 0.04 | 0.04 | 0.08 | 0.18 | 0.25 | 0.71 | 0.18 | 0.59 | 0.02 | 8.05 | 1.16 | 0.01 | 11.31 |
| desktop | turn | 0.03 | 0.01 | 0.04 | 0.09 | 0.23 | 0.85 | 0.12 | 0.77 | 0.01 | 7.43 | 1.00 | 0.04 | 10.62 |
| retina | walk | 0.06 | 0.10 | 0.09 | 0.14 | 0.21 | 0.27 | 0.13 | 0.13 | 0.01 | 6.43 | 1.04 | 0.02 | 8.63 |
| retina | drive | 0.07 | 0.13 | 0.12 | 0.10 | 0.20 | 0.44 | 0.13 | 0.28 | 0.01 | 6.72 | 1.03 | 0.02 | 9.25 |
| retina | drone | 0.04 | 0.05 | 0.09 | 0.19 | 0.29 | 0.62 | 0.19 | 0.51 | 0.01 | 8.60 | 1.16 | 0.01 | 11.76 |
| retina | turn | 0.03 | 0.01 | 0.05 | 0.09 | 0.27 | 0.74 | 0.12 | 0.65 | 0.01 | 8.11 | 1.04 | 0.01 | 11.13 |
| phone | walk | 0.06 | 0.03 | 0.05 | 0.12 | 0.06 | 0.35 | 0.19 | 0.23 | 0.01 | 4.04 | 0.17 | 0.03 | 5.34 |
| phone | drive | 0.07 | 0.07 | 0.08 | 0.10 | 0.06 | 0.64 | 0.18 | 0.31 | 0.01 | 4.13 | 0.19 | 0.02 | 5.86 |
| phone | drone | 0.03 | 0.01 | 0.04 | 0.10 | 0.05 | 0.93 | 0.16 | 0.70 | 0.02 | 4.46 | 0.19 | 0.04 | 6.73 |
| phone | turn | 0.02 | 0.01 | 0.03 | 0.10 | 0.07 | 1.14 | 0.13 | 0.94 | 0.02 | 4.24 | 0.20 | 0.05 | 6.95 |

"render submit" is three.js issuing the draw calls of the outline pre-pass, the colour pass, the bloom chain and the composite. "shadow submit" is the shadow map's draw calls.

### The worst frames

| config | scenario | worst intervals (ms) and what the frame before spent most on |
|---|---|---|
| desktop | walk | 67 (streaming 44.5), 50 (streaming 31.5), 50 (streaming 30.4) |
| desktop | drive | **350 (render 266: a shader compiled on first use)**, 67 (streaming 30.9), 67 (streaming 52.7) |
| desktop | drone | 67 (render 23.8, GPU 24), 50 (render 24.6), 50 (render 57) |
| desktop | turn | 67 (render 36.1), 67 (render 8.1), 67 (render 54.1); **GC pause 56 ms** |
| retina | walk | 100 (render 73.6, GPU 48.7), 83 (render 38.7), 67 (streaming 29.2) |
| retina | drive | 83 (streaming 68.9), 83 (streaming 58.2), 67 (render 61.3) |
| retina | drone | 83 (render 76), 67 (render 66, GPU 70), 67 (render 69.5) |
| phone | drive | 100 (streaming 44.5), 83 (render 5.4: **GC pause 83 ms**), 50 (streaming 33) |

## What the baseline says

1. **Retina is GPU-bound.** The high tier renders 2.25x the pixels of DPR 1: GPU p50 is 19–24 ms against a 16.7 ms frame, and every scenario runs at 41–51 fps with p95 at 33.4 ms. In Chrome on a 120 Hz ProMotion screen, the same frames land as a mix of 16.7, 25 and 33 ms intervals. Together with a frame loop that moved everything by the raw, clamped frame time, that mix is the choppiness the author sees.
2. **Hitches have three sources:**
   - streaming job steps of 30–70 ms: a tile's last generator step built the props, the laundry, the kit merge and the commit at once;
   - shader programs compiled on first use: 23 new programs across the four scenarios, with a 266 ms render stall the first time the car is driven;
   - GC: 50–380 pauses a minute, most under 2 ms, the worst 56 ms (turn) and 83 ms (phone drive).
3. **CPU is not the bottleneck at 60 Hz on the M3 Pro** (7–12 ms a frame), but three.js draw submission is 70 % of it. Draw calls average 750–1150 on desktop (max 1610) and 430–570 on the phone tier (max 1013).
4. **The aerial views (drone, turn) are also heavy in geometry:** 14 M triangles a frame across the three geometry passes.
5. **On the M3 Pro the phone tier holds 60 fps** (GPU p50 9–12 ms). A real iPhone GPU is several times slower, so these numbers say the phone tier's CPU side fits, not that an iPhone holds 60.

## Findings outside the app

- **`tools/anime/gate.sh` runs every command under `taskpolicy -b`.** Its children, Chrome included, are held to the efficiency cores. A bun loop takes 130 ms at normal priority and 558 ms under the gate on the M3 Pro (4.3x), and `taskpolicy -B -p <pid>` does not undo it.
  - At normal priority the page loads in **11–13 s** on the second machine (7.6 s on the phone tier), not the 46–82 s measured through the gate.
  - Frame times taken through the gate (v7-bench, earlier `__bench` numbers) are efficiency-core numbers.
  - `gate.sh chrome --fg <cmd>` (this branch) keeps the lock and the watchdog and runs at normal priority. Use it for benchmarks only; builds and tests keep the background default that protects the shared machine.
- **The canvas is CSS-sized.** The renderer's pixel ratio is 1, and `quality.pixelRatio` only sizes the internal render targets, which the composite pass samples into the canvas. On a Retina screen the high tier draws 2160x1350 and shows 1440x900, upscaled by the browser.

## WebKit (Safari's engine)

`tools/perf/wk-run.mjs` runs the same scenarios in a WKWebView on the build machine (M2 Max), from a 16.7 ms timer with a one-pixel GPU read-back per frame, because a window nobody sees gets WebKit's rAF at about 5 Hz. The baseline attempt was stopped by the gate's load watchdog: the build machine's 5-minute load reached 17–32 from other jobs (a filesystem `find`, fseventsd). The one scenario that finished, desktop walk, ran 48.9 fps with intervals p50 20 ms and p95 21 ms. Its frame cost is CPU and GPU serialized, an upper bound. RESULTS.md has the WebKit before/after, run back to back.

## Reproduce

```
# baseline worktree: ~/Developer/worktrees/klc-smooth-base (detached at c98d08e)
the remote runner --wt ~/Developer/worktrees/klc-smooth-base --back dist/perf/baseline -- --fg env -u NODE_OPTIONS bun tools/perf/run.mjs --config desktop|retina|phone --label baseline
env -u NODE_OPTIONS bun tools/perf/report.mjs table dist/perf/baseline     # this table
env -u NODE_OPTIONS bun tools/perf/report.mjs split dist/perf/baseline     # the CPU split
```
