# Quests and the people who give them

Fourteen quests. Fifteen people stand in the town: fourteen give a quest, and the skipper (漁労長) stands on the market quay beside 第五凪丸. The skipper does not give a quest of their own. The auctioneer's morning catch sends you to them. A quest is a few minutes of the town you are already in: a walk, a photograph, a swim, a catch, a drive. Nothing is timed out, and nothing is failed. Leaving a quest and coming back continues it.

The people are generic roles from the town's own cast (painted faces, a blink, a look toward you). They are not portraits and they are not named.

## What you see

- Within 4.5 m, on foot, a 「話す」 button, the E key and the Enter key open a dialogue. The window sits on the bottom edge: the full width inside the safe areas on a phone, 60% of the width and centred on a desktop. The line is at least three lines tall, 22 px on a phone and 24 px on a desktop, in Zen Maru Gothic. The box grows with the line. It types at 40 characters a second. A tap, or Enter, finishes the line; the next tap turns the page. ▼ blinks when the page is done. Choices are a vertical list with a ▶ cursor (up and down on the keyboard and the pad, a tap on a phone). The name sits on a tab in that person's colour.
- While you are playing on a phone, the window sits 108 px above the home indicator so the stick and the buttons stay reachable.
- 「！」 over a person means they still have a quest. 「？」 means the quest is ready to hand back. 「…」 means they only have a line, or a quest that is not ready to hand in. A 「！」 or 「？」 is a 山吹 balloon with a 紺 outline and a white glyph. It is 1.05 m tall in the world, never under 22 px and never over 64 px, so it stays readable at 60 m. It bobs up and down, with no squash, and a faint ring sits on the ground under the person. It stays full opacity out to 60 m and is gone at 108 m. 「…」 stays a small glyph and fades out by 48 m. Quest givers are also small pins on the minimap and the full map.
- The current quest sits under the wordmark, and below the play HUD once that is open: the step, how far is left, and an arrow in the chip. A step that needs a way of travelling shows one button on that chip (写真を撮る, もぐる, ウミネコになる, 船に乗る, 車で挑戦, 飛んで行く). A medal, a race, the boat and the nearest unfound charm still have an arrow. With more than one quest open, ◀ ▶ cycles them and the last choice is remembered. Finishing a step plays a chime and flashes the chip gold.
- 「手帳」, or the クエスト tab of the みなと手帳 once the kit is mounted, lists what is open, what you can still hear, and what is done. A finished quest opens its card again. The スタンプ tab is the stamp book: every quest's 判子, faint until you earn it, then stamped with the seal's thud.

`?play=0` turns the whole play layer off. `?missions=open:barista`, `?missions=near:barista`, `?missions=away:barista`, `?missions=coach`, `?missions=hub`, `?missions=start`, `?missions=stamps:shrine-visit,cape-trees`, `?missions=flash:shrine-visit`, `?missions=card:cape-trees`, `?missions=log` and `?missions=track:shrine-visit` are for stills. `card:` and `stamps:` do not write the save. `flash:` accepts the quest and holds the chip gold. `away:` stands 60 m off and keeps the balloon in frame. `hub` draws the クエスト card. `coach` points at the nearest 「！」 and says 「話しかけて みよう」.

## Entering from あそぶ

The lane registers id `quests` with `kit.registerMode` when that function exists. Starting it opens the quest tab and, once the sheet closes, points at the nearest 「！」 with the edge arrow and the coach line. The card's progress line is the stamps earned out of the quests that exist (14). The still is `data/play/art/quests.webp`. The real-world reward line stays 「協力店募集中」.

The morning catch does not start fishing. The auctioneer sends you to the skipper (`talk`, mark 「！」, `start: ippon`). When that line ends, the lane calls `window.__ippon.start` if the fishing lane has exported it. The skipper stands on dry ground at x 567, z 658, beside the quay point 566.8, 656.2. The fishing lane should reuse id `captain` and not draw a second balloon.

## How a quest hears the rest of the game

Quests do not import other lanes. They read the kit store, and they listen for the events below. Where a lane is not mounted yet, the step is still written against that name and covered by a fake in `test/play-missions.test.js`.

| Step | Where it comes from | Status |
| --- | --- | --- |
| `collect` 金のカツオ | `store.get('katsuo')` — `found` is a map of id → time, or a list | Waiting on the kit. The count is ready. |
| `medal` | `store.get('courses')[id].medal` of `bronze` / `silver` / `gold` | The courses lane writes this. The port quest reads course id `minato` (drive). |
| `ippon` | `window.__ippon.on('catch', { cm })` adds one fish. `on('landed', { kg, count, biggest })` is the trip total and never goes down. `biggest` is kept as the longest fish. | The fishing lane exports this. A catch event has length only; the kilograms arrive when the boat lands. |
| `photo` | A wrapped `window.__photo`. The shot records the camera's x, z and yaw (radians, 0 facing south). A `klc-photo` event is not required. | The wrapper is installed when `__photo` exists. |
| `gull` | `window.__gull.on('perch', { id, x, y, z })`, or a `window.__gull.perch` position read a few times a second. | Waiting on the avatar lane. |
| `swim` | `window.__swim.on('pos', { x, y, z })`, or `window.__swim.pos`. | Waiting on the underwater lane. |
| `race` | `window.__race.on('finish', { ms })`, or the same on `__courses` and `__car`. The best (smallest) time is kept. The car lane does not emit that event; it writes `store` section `courses` key `race-minato` with `{ best, medal }`, and that best time is read the same way. | The car lane's store row is wired. There is no `__car.on('finish')`. |
| `reach`, `talk`, `deliver` | The player, inside this lane. | Live. |

`window.__missions.noteRace(ms)` records a finish the same way, for a lane that does not have the event yet.

### TODO for the other lanes

- Kit: publish 金のカツオ into `store` section `katsuo`. `golden-three` completes at 3. Not on the courses, fishing or car branches yet.
- Courses (`origin/feat/play-courses`): three courses, `anba` (fly), `minato` (drive) and `harbour` (sail). A finish writes `store` section `courses` with `{ best, medal, runs, splits }`. There is no `window.__courses`. `port-medal` reads `minato`, bronze or better. The branches are not merged into this one: each also edits `data/play-i18n.json` and `src/anime/play/index.js`.
- Car (`origin/feat/play-car`): `window.__playCar`, not `__car`. A finished race writes `courses['race-minato'].best` in milliseconds. `quay-run` completes when that best is 480000 ms or less. The garage item `wave-stripe` is still only a name on the reward.
- 一本釣り (`origin/feat/play-fishing`, `d5283bc`): `window.__ippon` exports `board` and `leave`, not `start`, and it does not place a skipper. This lane places `captain` and calls `__ippon.start` only when that function appears. `morning-catch` is a talk with the skipper, then 2 kg on `landed`, then a report to the auctioneer. Not merged: that branch also edits the ship, the sail and `src/anime/core/audio.js`.
- Kit (`origin/feat/play-kit`, `b6cff3c`): `ui.edgeArrow` is live. `kit.registerMode` and `ui.coach` are not, so this lane guards both and draws its own coach bubble and card until they land.
- Avatar: `__gull` perch near 神明崎 (`gull-seat`, within 36 m of x 352, z −28).
- Underwater: `__swim` positions. `raft-swim` is x 175, y −1.2, z −110. `first-dive` is x 330, y −2, z −15.
- Photo: keep `window.__photo` as the function this lane wraps.

## Numbers

Tuned while playing the window, the balloons and the tracker. Round 3 (7 Oct) rewrote the mark and the type size. The phone lift is still an open question (see the lane file).

| | |
| --- | --- |
| Talk radius | 4.5 m |
| Typewriter | 40 characters / second. A blip is a 90 ms marimba, gain 0.32, pitched per role (the child highest, the shrine keeper lowest). |
| Dialogue | Phone: full width, 22 px, at least three lines, bottom inset 8 px plus the safe area. While playing on a coarse pointer, bottom inset 108 px plus the safe area. Desktop (721 px and up): 60% width, 24 px, bottom inset 24 px. |
| Balloons | 「！」 and 「？」: world height 1.05 m, screen floor 22 px, cap 64 px. 山吹 fill, 紺 outline, white glyph with a 紺 stroke. Full opacity to 60 m, gone at 108 m. Bob 5 px under 36 px and 8 px above, over 1.8 s, translate only. Ground ring 1.7 m across, screen width 18–140 px. 「…」: 22 px on a phone and 26 px from 721 px, gone at 48 m, no ring. |
| Tracker flash | 480 ms, with a chime a fifth up. |
| Stamp | The 判子 eases in over 280 ms. The thud is the existing stamp sound. |
| Two-shot | Camera sits 3.2 m to the side, at chest height, and looks at the chest, so a portrait phone keeps the face above the window. If that side is inside a tree or a wall, it uses the other side. Ease 0.30 s, back in 0.28 s. Reduced motion and `?shot` cut. |
| Stance | Once the street has settled, each person is slid along their facing until the near approach (4 m) and one two-shot side are clear. Samples are 0.5 m apart, and a body keeps 0.9 m from a tree's centre, because the drawn trunk is wider than its collider. Standing inside a collider still steps them onto the first open patch. |
| Pose distance | 108 m, and only the two nearest figures, so a mark at 60 m still has a person under it |
| Build distance | 120 m, one figure a frame |
| Race step | 480000 ms |
| 金のカツオ | 3 |
| Bonito | 2 kg |

## Save

Progress is kept on the device in `localStorage['klc.play.v1']`, under `meta.missions` and a `quests` section. A random 8-character device id lives in `meta.deviceId`. It is not a name. Nothing is sent off the device. The voucher check below is for a shop's own browser, and this game never calls it.

## Cost

Balloons, the button and the arrow are DOM, so they add no draw call. Each person is one skinned mesh from the cast, hidden past 48 m, and at most two are posed. Near a person that is about two draw calls, and none from across the harbour. The sim tick does not allocate; the typewriter writes a string only while a line is still appearing.
