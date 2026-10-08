# Avatar and the ウミネコ

Third person is the default on foot. First person is one tap away. Fly is the third tap. The drone and the gull share fly mode and are not the same body.

## View button

The button names the view it switches to.

| Now | Button | Next |
|---|---|---|
| Drone or gull | 歩く（3人称） | Walk, third person |
| Walk, third | 歩く（1人称） | Walk, first person |
| Walk, first | 飛ぶ | Drone, in place if you are already walking |

`ui.view` stays `walk` or `drone`, so the places list, the number keys and the auto tour keep their old meaning. `ui.person` is `third` or `first`. `?person=first` starts in first person. `?person=third` is the default.

Between the two walking views, a playing session does not teleport. Leaving the drone, or pressing a place, still uses the tour.

## Camera

Behind the feet. The walker's rig depends on the screen's shape (`camera.js` `thirdFor(aspect)`): a portrait phone sees 88° tall (`core/fov.js`), so the landscape boom framed him at only 12 % of the picture there. Between aspect 1 and 1:2 the rig blends linearly. The walker's follow is described in [FEEL.md](FEEL.md) (the movement-feel lane); the gull keeps its own critically damped follow (`placeChase`).

| | Walk, landscape / desktop | Walk, portrait phone | Gull, flying | Gull, perched |
|---|---|---|---|---|
| Distance | 4.5 m | 2.6 m | 3.4 m | 2.6 m |
| Look height | 1.6 m | 0.9 m (his chest) | 0.55 m | 0.70 m |
| Pitch | −8° | −14° | −18° | −14° |
| Shoulder | 0.35 m | 0.15 m | 0.15 m | 0.32 m |
| Follow | velocity fed forward, 24 /s; height 9 /s | the same | 0.16 s | 0.18 s |
| His height on screen | 22 % | 20 % | | |

`physics.solidAt` is sampled along the boom (step 0.12 m, radius 0.18 m), and the ground is kept 0.3 m below the camera, so a stair that is only a walk-box still stops the boom. A wall stops the camera in front of it. On the phone tier a hero lot outside the kit radius is drawn as a mid building and has no wall collider. Those lots are solid boxes for the boom, and a shop awning (1.36 m past the street face, from 1.7 m to 2.75 m above the floor) is solid at every tier. 魚町 (−96, −72) is one of them. When the boom is shorter than 2.4 m (scaled with the rig: 1.39 m on the portrait boom) the camera rises 0.45 m for each metre it lost, eased, and the rise stops at the first solid (the café RST lintel, a stair soffit). A short boom looks lower: look height is 0.9 + 0.7 × min(1, dist / 2.4) m on the landscape rig, so the open boom stays at 1.6 m and a stair still shows the body (the portrait rig already looks at 0.9 m). The walker's boom length eases in quickly and out slowly and is clamped to the clear distance the moment a wall comes between, so the camera is never behind a wall; the look point never starts inside a solid. Reduced motion snaps every frame. Under 0.7 m the walker is hidden, so the camera never sits inside the head.

A change of mode (gull, drone, walk) eases for 0.42 s. The offset is taken once, in world space, and it decays, so the new mode can keep moving. Reduced motion and a still (`dt` 0) show the destination at once. Leaving the gull for a walk snaps the boom to the feet first, then spends that ease, and does not call `tour.walkTo`.

The gull chase was 6.8 m in the first pass. Over the bay the wings were a speck. 3.4 m, pitched −18°, puts the bird in the frame with the water under it. The walker's short-boom look easing does not apply here.

The chase runs only when `player.person === 'third'` and `player.fly` is false. The hook is `player.chase`, called from `Player.applyCamera`.

## The original walker

Three looks, one rig. `sex` on the rig is the proportion set, not a gender, and the face is not a person from town.

| id | Clothes | Colour |
|---|---|---|
| navy | hoodie | 藍 `#165E83` |
| kinari | shirt | 生成り `#F4EFE4` |
| asagi | jacket | 浅葱 `#00A3AF` |

Clips: idle, walk, run, jump, fall, land, and a turn-in-place blend. Run starts above 4.6 m/s.

The stride matches the speed. The planted foot travels `2A` while the body travels `2A`, so the sole does not slide. `A` grows a little as the walk becomes a run. Phase is integrated, so a change of speed does not pop the feet. A landing squashes the rig 18% in Y and 8% in XZ over 0.2 s, about the feet. A turn rolls the hips up to ±0.22 rad (`yawRate × 0.055`).

Footsteps go through the kit `sfx.play` (`step-asphalt`, `step-wood`, `step-sand`), which is `ctx.audio` underneath and respects mute. The engine's silent `footstep` is untouched. A quay or promenade (floor more than 0.2 m above the terrain) is wood. Land within 22 m of the water, low, is sand. Everything else is asphalt. The one-shot gain is 0.16, the play gain 0.5, and the pitch alternates about a semitone.

Prefs live in `localStorage` key `klc.play.avatar.v1`. The kit store drops unknown meta, so they are not stored there.

## ホヤぼーや

He is the default walker. The model is `src/anime/play/avatar/hoya-model.js`, owned by the model worker and not edited here:

```js
buildHoya(THREE, { quality, mat, calm, blink }) -> { root, setPose, update, setLift, setCalm, dispose }
```

The root faces −Z with its feet at y = 0, so it is placed at the player's yaw and never scaled. A turn rolls that whole root up to 6°, eased over 0.18 s, the same way the original rig leans. A landing moves him down by up to 4 cm and back, over the same 0.2 s, and does not scale him. Neither is 変形: no part moves apart, and the mesh stays at scale 1. `setPose('auto')` lets his animator read speed, ground and vertical speed, including his own landing. Night calls `setLift` with `life.time.night` so he is never a silhouette. Reduced motion holds the root upright and skips the dip.

`setModel('hoya')` refuses, and logs once, unless `data/hoyaboya-approval.json` allows both `3d` and `animation`. The default pref is `hoya`. With the record and the mesh, he is on. `?hoya3d=0` forces the original.

- No file, or a file that does not allow those two: locked. The original walker is shown.
- `kind: "written"` with a `ref`: the city's 承認書.
- `kind: "owner-interim"` with `decidedAt`: the owner's 2026-10-07 decision to show him until demo day. It is not a 様式第2号.
- `?hoya3d=0` forces the original even when the record allows him.
- `?hoya3d=1` asks for him when the record and the mesh both exist.

The notebook tab 姿 has the three looks and 「ホヤぼーや／オリジナル」. While he is on screen the credit sits under him, not on him:

気仙沼市観光キャラクター
「海の子 ホヤぼーや」

It sits bottom centre (96 px up). The city's rules (取扱要綱 第5条) want it on screen, uncovered, whenever he is shown, and two chips use the same place: the もぐる chip (`.swim-dive`, 96 px, by the water) and the kit's prompt (108 px on a desktop, 168 px on a phone). While one of them shows, the credit moves above it: 148 px over もぐる, 160 px over a desktop prompt, 220 px over both on a phone. It eases over 200 ms, and moves at once under reduced motion. `test/feel-credit.test.js` pins the rules; `tools/anime/feel-modes.mjs` checks the rects in Chrome.

The use to ask the city for is in the application text (not included), section 7.

## ウミネコ

In fly mode the prompt says ウミネコになる. The drone stays the drone: `player.fly` with the walker enabled. A gull sets `player.gull`, sets `player.enabled` false, and moves itself. `player.fly` stays true so charms and `playMode()` keep the fly radius. Courses can skip the drone course when `player.gull` is set.

| | Value |
|---|---|
| Glide | 11 m/s, sink 1.2 m/s |
| Flap | +2.6 m/s and +3.4 m/s lift, 0.26 s, cooldown 0.38 s |
| Dive cap | 28 m/s (pitch down to −1.15 rad, drag 0.42 s⁻¹ back toward 11 m/s) |
| Bank | ±45°, turn rate `g tan(roll) / speed` |
| Stall | below 6 m/s the nose drops toward −0.55 rad and speed is allowed to build back. No crash. |
| Sea | skim at 0.45 m. Downward speed is cancelled. |
| Perch | under 7.2 m/s and within 4.2 m of a `harbor.perches` point, then とまる. とぶ launches at 8.6 m/s. |
| Flock | 4 birds beside you (3 on the phone tier), one instanced mesh. They ease in over about a second. |
| Wings | flap, a shallow glide, a flare of 0.88 when low and descending, or when a perch is close and slow |
| Flare | below 2.8 m with vertical speed under −0.45, or within 7.5 m of a perch under 13 m/s: the nose goes toward 0.38 rad and speed bleeds toward 9.35 m/s. The stall still comes first. |

Keyboard: W or Space flaps, S or down dives, up pulls, A and D bank, the mouse aims. F returns to the drone and does not toggle fly off. R and the number keys leave the gull and do what they already did. V walks. The pad mode `gull` has はばたく, とまる／とぶ, ドローン, 歩く.

Wind is `play-gull-wind` on `ctx.audio`, started with a position so the rush sits on the bird and opens with speed. A perch is almost still. The cry is `play-gull-cry`. Each flap sheds six white feathers from a pooled instanced mesh (the kit bursts are gold and confetti). Reduced motion holds the wings still, skips the feathers and freezes the flock; the cry still plays when sound is on.

「ウミネコになる」 registers with `kit.registerMode` when that call exists (id `gull`, order 30, 3 minutes, one star). The start perches 3.6 m past the rail of ひのでのてらす, the 安波山 lookout (−513.0, −692.1), facing the bay, so the chase camera stands on the terrace instead of inside the hill. The wings open over 0.55 s. The first flap and the first dive each get one `ui.coach` step when the kit provides it; until then the same line is `ui.prompt`. The lines are 「はばたいて、飛び立とう」 and 「鼻先を下げると、急降下」. Seen flags live in `klc.play.gull.v1`, not the kit store. `?gull=1` still starts in the air here. `?gull=lookout` is the perch. The card still is `play/art/gull.webp`.

## Hooks

| File | Change |
|---|---|
| `src/anime/core/player.js` | `gull` flag. `applyCamera` uses `player.chase` when `chaseOwns`, then `player.cameraBlend` for a mode change. |
| `src/anime/ui/hud.js` | The view button cycles three ways. From a gull, walk and drone stay in place. `noteMode` lets the gull update the label. |
| `src/anime/play/index.js` | Mounts the avatar and the gull after the kit. |

Drive and sail are not edited. They still take the camera back: a gull leaves when a drive, a sail, the planet or a tour flight starts.

## Frame cost

The walker is one skinned mesh. The gull is a body and two wings, plus one instanced flock, and the walker is hidden while flying. The kit's particles are a separate mesh.

Measured in the WebKit shot session, timing the step with `performance.now` (the 1 ms max is the timer quantum):

| | mean | steps |
|---|---|---|
| Walker, with ホヤぼーや | 0.011 ms | 435 |
| Gull, flock and feathers | 0.022 ms | 322 |

Draw calls, third person then first person: 1084 and 1081. He is two draws (body and line) plus a shadow the model turns on. The feathers are one instanced mesh, hidden until a flap. The budget is 0.6 ms.
