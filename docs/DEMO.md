# Oct 10 demo: a 3-minute script

The goal is one sentence from the room: **"that's Kesennuma."** Show the real town first and the technology last.

The v3 beats (the live chip, walking, the times of day, 浮見堂, the market, the seasons and the planet) were rehearsed on
the production build at 1600×900 in headless Chrome, in the order given, with no page errors. The v4 beats (search,
driving, the map and the walk-ins) are the actions `tools/anime/qa3.mjs` performs and checks on every run: search
気仙沼駅 and go there, the car on the real roads, the full map, and walking into the three interiors. The whole
script has not been rehearsed end to end since v4, so run through it once on the demo Mac.

## Before the audience arrives (10 minutes)

1. Plug the Mac into power and close other GPU-heavy apps.
2. Build and serve:
   ```sh
   bun run build
   bun run scripts/serve.js --port 8787 --no-build
   ```
3. Open `http://127.0.0.1:8787/` in Chrome. Go full screen with ⌃⌘F and load the page once while online, so the
   browser caches the Japanese fonts. The station-name board (気仙沼) shows the load bar; the page took 45 to 55 s to be ready on
   the throttled build machine. Wait until it reads **準備完了 · 秋の午後 16:30 · Ready**, and leave it there.
4. **Check the live data.** After you enter, the chip at the top left should read something like
   `16:30 ☀ 晴れ 12℃ 入船 12隻 ライブ`. Click it and look at today's arrival times.
   - The market beat below needs at least one boat due between about 03:30 and 06:30.
   - If there is none, or the chip says サンプル, decide now between two options: (a) use today's list and skip the
     boat line, or (b) reload with `/?fixtures=1`. The saved sample has morning arrivals, and the chip will honestly
     say サンプル.
5. **Quality.** On an M-series Mac, leave the top-right selector on Quality: High.
   - Press \` to see the fps.
   - If it stays below about 40, choose Medium before the demo. Changing quality reloads the page.
6. Reload the page so the demo starts from the board: 16:30, autumn, drone view over the inner bay.
7. Turn the room's speakers to a low level. Sound starts when you enter the town (waves, gulls, engines).

## The script (3:00)

| Time | Do exactly this | Say |
|---|---|---|
| 0:00 | The board is on screen. Click **まちへ出る · Enter the town**. | "This is Kesennuma: every building, road and hill is from 国土地理院 and OpenStreetMap open data, 50,000 buildings, drawn like an anime and checked against the aerial photo." |
| 0:15 | You are in the drone view over the inner bay at 16:30. Click the **live chip** at the top left, then click it again to close it. | "This is today. The weather is from 気象庁 right now, and these are today's boats from 気仙沼漁協." |
| 0:30 | Click **歩く**. You land on the promenade by the seawall. Hold **W** for about a second, then click **夕焼け 17:20**. | "You can walk all of it. 17:20 on October 10: the real sun for that day." |
| 0:50 | Press **4**. You step onto the walkway of 浮見堂. | "浮見堂 at magic hour." |
| 1:05 | Press **/** and type **気仙沼駅** (or a shop or street someone in the room calls out), then press Enter. You are set down on foot on the station square, and its label stays pinned. | "Any place in the city, by its real name, in Japanese or English." |
| 1:25 | Press **C**. You are in a kei car on the road. Hold **W** and steer with **A** / **D** for about ten seconds. The chip at the bottom shows the speed and the road's real name. Press **C** to get out. | "And you can drive it, on the real roads." |
| 1:45 | Press **N**. The full map opens with every real place. Press **N** again to close it, then press **2**. You land on foot on the market quay beside a moored boat. Click **朝 06:30**. | "Six-thirty at the fish market. The label on that boat, for example 18清龍丸 · 入港04:30 · カツオ 16t, is a real boat on today's list." (Say サンプル if you chose the sample.) |
| 2:15 | Press **K** (冬: snow on the quay and roofs), then **K** again (春). Then press **K** twice to return to 秋. While a season view is on, the chip shows 冬のすがた or 春のすがた instead of the live weather; the ライブ tag stays with the arrivals. | "All four seasons." |
| 2:35 | Click **夕方 16:30**, then press **O**. | "And the whole of Kesennuma bay as one little planet." Press **O** again to return. |
| 2:50 | Press **H** to hide the UI and let the frame sit. | "Everything you saw is the real Kesennuma. We'd like to make it the city's." Press **H** again to bring the UI back. |

**For Q&A: the walk-ins.** No key is needed; walk in through the door.

- **男山本店:** press / and type 男山, press Enter, then hold W toward the shop door on the 魚町 waterfront road.
- **The fish market C hall:** press 2, walk to the glazed visitors' door in the land-side wall, and take the stair to
  the 2F gallery over the landing floor.
- **気仙沼駅:** search 気仙沼駅 and walk through the arcade into the waiting hall, with its ticket gates and the day's
  departure board.

Useful keys if something drifts: **R** returns to the inner-bay drone view, **V** switches between drone and walk,
**F** flies (through walls) if you get stuck, **Esc** closes the search or the map, and **G** starts an auto tour
through all 51 places that runs on its own, which is handy for Q&A. Press G again to stop it.

**Photo mode (P).** The 写真 button saves a 3840×2160 PNG. Photo mode was only tested at 1920×1080, because 4K
rendering was blocked on the build machine until 2026-10-01 00:00Z. Test P once on the demo Mac before you use it
live.

## Offline fallback

**If the venue has no internet, the app still runs.** The app, the city data and the server are all local on
127.0.0.1.

- **Live data:** when a fetch fails, `/api/live` serves the last good copy from `data/cache/live/`, labelled
  `cache`. If there is no copy, it serves the saved sample pages of 2026-09-29, and the chip says **サンプル**.
- **Forcing the sample:** use `http://127.0.0.1:8787/?fixtures=1` to get the sample on purpose.
- **Fonts:** they come from Google Fonts. If the browser has not cached them, the UI and the signs fall back to the
  Mac's Japanese system fonts, which still read correctly but look less hand-painted. Load the page once while online
  on the demo Mac (step 3 above).
- **What was tested:** these fallback paths were checked by forcing the sample (`/api/live?fixtures=1` and
  `data/live/sample.json` both answer). A demo with the network physically unplugged has not been rehearsed. Do it
  once on the demo Mac.

**If the demo Mac or its GPU fails, show the stills.**

1. Before the day, render the 16 wow stills:
   ```sh
   tools/anime/gate.sh chrome env -u NODE_OPTIONS bun scripts/render/stills.js --size 1080
   ```
   From 2026-10-01 00:00Z, use `--size 4k` instead.
2. The stills are written to `dist/renders/v3_*.png`. `dist/` is not committed, so copy them to the Desktop and to a
   USB stick.
3. Show them full screen in Preview or Quick Look (space, then the arrow keys), in this order: drone_1630,
   drone_kanae (the 安波山 view out to かなえ大橋), whole_city (the whole bay out to 大島 and the open sea),
   promenade_deck (the fish stall, the vending machine and the cat on its bollard), market_morning (the berth from the
   water), ukimido_sunset, market_unload, night_bay, night_izakaya, spring_drone, summer_drone, winter_drone,
   tiny_planet.
   Stills hide the floating boat labels (`?labels=0`), so no サンプル tag shows even with the sample data.
4. The v3 versions of these frames are in the repo as `docs/shots/v3_wow*.png` and `docs/shots/v3_season_*.png`, and v4
   screens (driving, search, the map, the interiors) are in `docs/shots/v4_*.png`. The v3 frames predate the v4
   accuracy pass (for example the timber promenade deck, since removed), so prefer fresh renders.
5. Wherever the stills or the film are shown, put the credit line next to them (on a slide, in a caption or at the end
   of the film): © OpenStreetMap contributors · 出典：国土地理院, 気象庁, 気仙沼漁協 · Sakuragaoka Station (MIT) by
   Kenton-GMI. The stills do not burn it in.

**Optional: a film for a looping screen.** Render the 30 s film:

```sh
tools/anime/gate.sh chrome env -u NODE_OPTIONS bun scripts/render/film.js --size 1080
```

It writes `dist/film/kesennuma-living-city-v3-1080.mp4`. Omit `--size` for 4K after 2026-10-01 00:00Z. The film has
not been rendered at full size yet.

**Phones can't join.** The server listens on 127.0.0.1 only, so a phone on the venue Wi-Fi cannot open it. Show the
phone layout from the Mac instead: use Chrome DevTools device mode at 390×844.
