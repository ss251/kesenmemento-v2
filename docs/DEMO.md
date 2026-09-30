# Oct 10 demo: a 3-minute script

The goal is one sentence from the room: **"that's Kesennuma."** Show the real town first and the technology last.

Every click and key below was rehearsed on the production build (`dist/`) at 1600×900 in headless Chrome, in the order
given. The screenshots are in `shots/docs/demo_*.png` (not committed). All steps passed with no page errors.

## Before the audience arrives (10 minutes)

1. Plug the Mac into power and close other GPU-heavy apps.
2. Build and serve:
   ```sh
   bun run build
   bun run scripts/serve.js --port 8787 --no-build
   ```
3. Open `http://127.0.0.1:8787/` in Chrome. Go full screen with ⌃⌘F and load the page once while online, so the
   browser caches the Japanese fonts. The station-name board (気仙沼) shows the load bar; the build takes about 15 to
   20 s. Wait until it reads **準備完了 · 秋の午後 16:30 · Ready**, and leave it there.
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
| 0:00 | The board is on screen. Click **まちへ出る · Enter the town**. | "This is Kesennuma: every building, road and hill is from 国土地理院 open data, 50,000 buildings, drawn like an anime." |
| 0:15 | You are in the drone view over the inner bay at 16:30 (安波山 behind, the bay in front). Click the **live chip** at the top left. The arrivals panel opens. | "This is today. The weather is from 気象庁 right now, and these are today's boats from 気仙沼漁協." Click the chip again to close it. |
| 0:35 | Click **歩く** in the bottom bar. You land on the promenade deck by the seawall. Hold **W** for about a second. | "And you can walk it. The seawall, the poles and wires, the cat on the bollard." |
| 1:00 | Click **夕焼け 17:20** in the bottom bar. The light turns over about 3 s. | "17:20 on October 10: the real sun position for that day." |
| 1:15 | Press **4**. Number keys follow the view, and you are walking, so you step onto the vermilion walkway of 浮見堂. | "浮見堂 at magic hour." |
| 1:35 | Click **夜 19:30**. Then click **空から** to rise to the drone and press **1** to fly back over the inner bay. | "At night, windows light up, streetlights come on, and boat and bridge lights show on the water." |
| 1:55 | Click **歩く**, then the **めぐる** panel at the bottom left, then **2 魚市場**. Because you are in walk mode, you land on foot on the market quay beside a moored boat. Click **朝 06:30**. | "Six-thirty at the fish market. The label on that boat, for example 18清龍丸 · 入港04:30 · カツオ 16t, is a real boat on today's list." (Say サンプル if you chose the sample.) Click めぐる again to close the list. |
| 2:20 | Press **K** (冬: snow on the quay and roofs), then **K** again (春: sakura colours). Then press **K** twice to return to 秋. While a season view is on, the chip shows 冬のすがた or 春のすがた in place of the live weather; the ライブ tag stays with the arrivals. | "All four seasons." |
| 2:35 | Click **夕方 16:30**, then press **O**. | "And the whole of Kesennuma bay as one little planet." Press **O** again to return. |
| 2:50 | Press **H** to hide the UI and let the frame sit. | "Everything you saw is the real Kesennuma. We'd like to make it the city's." Press **H** again to bring the UI back. |

Useful keys if something drifts: **R** returns to the inner-bay drone view, **V** switches between drone and walk,
and **G** starts an auto tour that runs on its own, which is handy for Q&A. Press G again to stop it.

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
4. The same frames are also in the repo as `docs/shots/v3_wow*.png` and `docs/shots/v3_season_*.png`.

**Optional: a film for a looping screen.** Render the 30 s film:

```sh
tools/anime/gate.sh chrome env -u NODE_OPTIONS bun scripts/render/film.js --size 1080
```

It writes `dist/film/kesennuma-living-city-v3-1080.mp4`. Omit `--size` for 4K after 2026-10-01 00:00Z. The film has
not been rendered at full size yet.

**Phones can't join.** The server listens on 127.0.0.1 only, so a phone on the venue Wi-Fi cannot open it. Show the
phone layout from the Mac instead: use Chrome DevTools device mode at 390×844.
