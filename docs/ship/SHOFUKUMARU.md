# 第一昭福丸 (SHOFUKU MARU No.1): user and developer guide

第一昭福丸 (call sign 7KFY, fishery number MG1-2112, owner 臼福本店, built by みらい造船 in 2020) is a 58.6 m
Atlantic-bluefin longliner. In Kesennuma Living City she lies at true scale at the コの字岸壁 in 魚浜町. You can board
her and play three acts, from the send-off at the quay to the card at the end.

This page is the entry point. For more detail:

- [README.md](README.md): the wiring, the results and the deviations;
- [MODEL.md](MODEL.md): the model, the livery and the profile check;
- [acts.md](acts.md): the act machine and the scenes;
- [shofukumaru-dossier.md](shofukumaru-dossier.md): the captain's sourced dossier, committed verbatim. Every number
  in the build comes from it.

## 1. Run it

```sh
cd <worktree>
env -u NODE_OPTIONS bun run scripts/build-web.js
env -u NODE_OPTIONS bun run scripts/serve.js --port 8969
# open http://127.0.0.1:8969/?ship=1   (then 「まちへ出る」 on the intro card)
```

## 2. Board

There are three ways to board:

- **From the places list** (the search button or `/`): 「第一昭福丸に乗る / Board the 第一昭福丸」 is the first entry. It
  also shows up in search results and on the full map.
- **From the quay chip:** within 320 m of her berth, and lower than 420 m, a chip reads 「第一昭福丸に乗る · 乗船する」.
- **From the URL:** see section 5.

A URL voyage waits until you leave the intro card (「まちへ出る」), so the send-off is never played behind it.

## 3. Drive

The sail mode (`explore/sail.js`) takes her out on autopilot. Use the controls below to take the helm.

| Action | Keys | Touch (phone) |
|---|---|---|
| Engine telegraph ahead / astern (it stays where you leave it) | W / S or ↑ / ↓ | Left half of the screen: the stick, up / down |
| Rudder to port / starboard (back to midships when released) | A / D or ← / → | The stick, left / right |
| Stop the engine | X | Stick back to the centre line |
| Hold 4x time compression | Shift | — |
| Autopilot on / off | P | The autopilot takes over again after 8 s idle |
| Look around | — | Right half of the screen: drag |
| Leave the voyage | Esc or 町へ戻る | 町へ戻る |

After 8 s with no input, the autopilot takes over again. That happens when she is under way, when she is against a
bank, or when a bank has stopped her. If she is left bow-on to a bank, the autopilot backs her off astern before it
goes ahead. Shore collision checks sample points on the hull outline against the shoreline (a 2 m fender margin). Against a quay
she slides along it and loses speed. Harbour boats in her lane move aside to their own starboard. While the voyage runs, the town's keys
(C, N, 1 to 9, R) are blocked.

## 4. The acts

| Act | States (`acts.js` `STATES`) | What you do |
|---|---|---|
| 1. Send-off and departure | DOCKED → SENDOFF → DEPART → BAY_MOUTH | Start the send-off at about 11:00: five-colour tapes, 福来旗, the music sting. Sound the horn (汽笛), then もやいを解く. Sail out past the market rows, under かなえ大橋 (about 11 m to spare) and past 商港 to the bay mouth. |
| 2. The North Atlantic | OCEAN_SET → WAIT → HAUL → STOW | The line (150 km, about 3,000 hooks) is set from the stern, then it soaks. You haul at the **starboard forward 舷門**: each fish goes on the scale, and you choose キープ or 放流. A bluefin under 30 kg / 115 cm cannot be kept (ICCAT). Each fish you keep is bled, spiked and dressed. Each kept bluefin gets a `DEMO-7KFY-26-xxxx` tag and goes to the −60 °C freezer. |
| 3. The true chain | TRANSSHIP_LAS_PALMAS → REEFER → SHIMIZU_WEIGH → HOMECOMING → CARD | The catch does not sail home. It goes to Las Palmas, then into a reefer container, then to the bonded weigh-in at Shimizu, where every kg is checked. The ship and crew come home to Kesennuma under 大漁旗. The card shows your DEMO tags and 「まぐろの日は北かつまぐろ屋へ」. Its button takes you to 北かつまぐろ屋 海の市店. |

The machine's guards are: no CAST_OFF before the horn; no BAY_MOUTH before かなえ大橋 is passed; no ocean outside the
ICCAT season (1 Aug to 31 Jan); no WAIT_DONE under 2 h; no keeping a fish under the minimum; no STOW_DONE before the
36 h core freeze; and no homecoming while the Shimizu weigh-in is over the declaration. A refused event returns its
reason and leaves the state as it was.

## 5. URL parameters

| Parameter | Effect |
|---|---|
| `?ship=1` | Boards at the quay (DOCKED). |
| `&act=1` / `2` / `3` | Starts at DOCKED, OCEAN_SET or TRANSSHIP_LAS_PALMAS. |
| `&beat=STATE` | Starts at any state; the machine is fast-forwarded through legal events. Wins over `act`. |
| `&keep=N`, `&fish=1` | With `beat=HAUL`: N fish already kept, and a fish on the scale. |
| `&auto=1` | The hands-free demo, about 5 to 6 minutes from the quay to the card (for the mayor demo). |
| `&livery=nendo` / `fallback` | Forces the livery (section 6). |
| `&shot=1&t=S` | For deterministic screenshots: enters the beat at once and runs S seconds. |
| `&lang=ja` / `en` | The app's language switch; every ship string is in `data/ship/i18n.json`. |

## 6. The livery flag

The full livery (nendo for 臼福本店, 2020) is the designer's work, so it sits behind a flag.
`src/anime/world/ship/flags.js` `resolveFlags()` decides:

1. `?livery=nendo|fallback` wins.
2. Otherwise the livery is **on** for `localhost`, `127.0.0.1`, `::1` and `*.localhost`, or when the bundle defines
   `KLC_NENDO=1`.
3. Otherwise it is **off**. That includes the public Funnel link (`*.ts.net`) and every public host.

When the flag is off, `livery.js` paints the plain fallback livery and never fetches `data/ship/shofukumaru1/*nendo*`.
The bundle carries only the file names, never the data. `scripts/public-mirror.js` also refuses those files.

**Turning it on publicly (once the captain approves):**

1. In `resolveFlags`, make the last line `return { nendoLivery: true, source: 'default' };`. `?livery=fallback` stays
   as the opt-out.
2. Flip the host-default expectations in `test/ship-model.test.js` (the `flags.js` tests).
3. Remove the `DENY.push(/^\/data\/ship\/shofukumaru1\/[^/]*nendo/i)` line from `scripts/public-mirror.js`, and
   flip its test, "the public mirror never serves the nendo trace", in `test/ship-model.test.js`.
4. Deploy with `data/ship/shofukumaru1/livery-nendo.json`, `lines-nendo.json` and `livery-nendo-marks.json`.

For a one-off tailnet demo without changing code, add `?livery=nendo` to the URL, or build with `KLC_NENDO=1`.

## 7. Architecture and APIs

The world module `ship` (`src/anime/world/ship/index.js`) is built after `life`, because the crowd uses its character
kit, and before `explore`, which lists the boarding entry. It publishes `ctx.services.ship`. Everything it adds goes
through `ctx.add`, so nothing is merged into the static batch.

**Frames.** In the world, +X is east, −Z is north and +Y is up, in metres, with the sea at y = 0. The ship's own
frame has its origin on the centreline at the waterline, at midship (s = 29.3 m), with +Z forward: z = 29.3 − s.
Starboard is −X and port is +X. The livery data in `data/ship/shofukumaru1/` is in (s, h): s is metres aft of the
stem and h is metres above the waterline.

| Module | API |
|---|---|
| `ship/shofukumaru1.js` | `SHIP` (the particulars, each with its source); `buildShofukumaru(ctx, { livery, tier })` → `{ group, anchors: { gangwayStbd, sternSetting, bridge, mastTop, hornPos, railPoints[], flagPoints[] }, setFlags(on), setNight(f), update(dt, t), dispose() }`; `BUDGET` = 150 k triangles (high) and 60 k (phone). |
| `ship/flags.js` | `resolveFlags({ search?, hostname?, define? })` → `{ nendoLivery, source }`. |
| `ship/livery.js` | `paintAtlas`, `fallbackPlan`, `loadNendo` (only when the flag is on), `cleanNendo`. |
| `ship/route.js` | `BERTH {x, z, yaw}`, `SHOKO`, `BAY_MOUTH`, `OUTBOUND` (polyline), `OUTBOUND_PATH`, `KANAE_CROSSING {s, x, z, clearance, margin}`, `routeClearance(path)`. |
| `explore/sail.js` | `BOAT` (handling constants); `boatStep(s, input, dt, P)` (pure); `sailStep` (with shore); `pursue` (autopilot); `createSail(ctx, { ship, route })` → `{ enter(at), exit(), active, state, setAutopilot(on), focus(), onEvent(cb) }`. Events: `passKanae`, `passShoko`, `bayMouth`, `arrived`. |
| `ship/acts.js` | `createActs(snapshot?)` (pure, serialisable with `snapshot()`); `STATES`, `EVENTS` (guards), `RULES`, `makeCatch`, `seasonOpen`, `weighIn`. |
| `ship/tags.js` | `formatTag(n, yy = 26)` → `DEMO-7KFY-26-0001`; `isDemoTag(s)`; `REAL_TAG_RE` (`/^7KFY-\d{2}-\d{4}$/`), which a demo tag never matches. |
| `ship/sendoff.js`, `ocean.js`, `chain.js` | The scenes for Acts 1, 2 and 3. |
| `ship/voyage.js` | `createVoyage(ctx, { ship, sail, route, livery, auto })`: the director. It runs the machine, the scenes, the cameras and the UI. |
| `ui/ship.js`, `data/ship/i18n.json` | The voyage UI and the boarding chip. Every string is in JA and EN. `data/i18n.json` is left untouched. |

Shot hooks: `window.__ship`, `__voyage`, `__sail`, `__voyageShot(state, opts)`, `__voyageCam(name)`,
`__voyageKanae(back)` and `__voyageInit({ auto })`.

## 8. Tests

```sh
env -u NODE_OPTIONS bun test test/ship-model.test.js test/ship-sail.test.js test/ship-acts.test.js \
  test/ship-integrate.test.js test/ship-livery-paint.test.js test/v3-fix.test.js
```

| File | Covers |
|---|---|
| `ship-sail` | `boatStep` (inertia, astern, a tactical diameter of 3 to 4 LOA, rudder and yaw lag, purity and determinism); shore collision (500 random runs never bring a hull sample within 1 m of the shore, and she slides along a quay); OUTBOUND is water every 5 m and at least 40 m from the shore beyond the berth approach; かなえ大橋 is crossed between the pylons with at least 10 m above her 21 m air draft; the autopilot and its recovery; AI boats giving way. |
| `ship-acts` | The tag format, and that a demo tag never matches the real format; the act state machine (order, guards, refused events, serialise and restore, the ICCAT season); the release rule and the quota; the Act 3 order (the fish leave her at Las Palmas, and Shimizu refuses 1 kg over); i18n parity; the phone budget of the scenes. |
| `ship-model` | Dimensions against `SHIP`; the 舷門 on the starboard side only; the triangle budgets per tier; the flags (URL, hosts, `*.ts.net` off, define) and the public mirror refusing the nendo files; the fallback livery fetches nothing and no module bundles the nendo data; lettering reads right from both sides. |
| `ship-livery-paint` | Replays `paintAtlas` on a probe canvas and reads back texels: the transom, the stern triangles, the aft sheer triangle. |
| `ship-integrate` | The URL parameters, the boarding entry, the module order, and the whole voyage headless through the real module, from the quay to the card. |
| `v3-fix` | The public mirror's other rules (run with the ship files because the mirror gained the nendo DENY). |

Headless shots go through the one-browser gate:

```sh
tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/ship-acts-shots.mjs --port <port> --w 1920 --h 1080 --livery fallback --out shots/ship-int/fb
tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/ship-profile.mjs --port <port> --livery fallback
```

`ship-profile.mjs` renders her side-on and compares the silhouette with model photo 02 (port, 0.1226 m/px) and photo
03 (starboard). The reference photos stay in the gitignored `raw/ref/`, and the composites made from them are never
committed.

## 9. Phone budget

| Part | High | Phone |
|---|---|---|
| Ship model (budget / built) | 150 k / — | 60 k / about 11 k triangles |
| Livery atlas | 2048 × 1024 | 2048 × 1024 (about 11 MB with mipmaps) |
| Send-off crowd / tapes / flags | 14 / 40 / 6 | 6 / 18 / 3 |
| Ocean grid / floats | 96² / 24 | 40² / 14 |

The ocean is built when Act 2 starts and freed when it ends. While it is shown, the whole town is hidden. The crowd is
freed once she is 450 m out. The measured numbers (390 × 844 at DPR 3, iPhone UA) are in
[README.md § Results](README.md#results-2026-10-03-this-branch). The ship adds about 11 MB of texture to the city. At
sea the frame draws about 135 calls and 36 k triangles.

## 10. Sources

- The captain's dossier, [shofukumaru-dossier.md](shofukumaru-dossier.md): the particulars, the profile measured
  from model photo 02 at 0.1226 m/px, the traced livery, how the ship works, the ICCAT rules, the catch chain and the
  send-off.
- The reference photos: nendo's model photos 02, 03, 04, 05 and 07, designboom-1800, and the WCPFC photo of the real
  ship from starboard (29 January 2020). They are used for measurement only, live in the gitignored `raw/ref/`, and
  are never shipped.
- 臼井社長's slides from Hackatsuon 2026 (the cutaway, the gear, the specs, the tag, the bonded weigh-in, ICCAT).
- ICCAT Rec. 22-08 (the 30 kg / 115 cm minimum and the season); IUCN (Atlantic bluefin moved from EN to LC in
  September 2021; the slide's 2022 is wrong).
- OSM, GSI and `harbor/kanae.js` for the berth, the route and かなえ大橋.
