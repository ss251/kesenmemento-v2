# 第一昭福丸 (SHOFUKU MARU No.1): user and developer guide

第一昭福丸 (call sign 7KFY, fishery number MG1-2112, owner 臼福本店, built by みらい造船 in 2020) is a 58.6 m
Atlantic-bluefin longliner. In Kesennuma Living City she lies at true scale at the コの字岸壁 in 魚浜町. You can board
her and play three acts, from the send-off at the quay to the card at the end.

![第一昭福丸 in the plain livery, port side (a render of the model)](shots/profile-port-fallback-high.png)

The 第一昭福丸 livery is 臼福本店's (design by nendo), used with permission in the live demo and not included in this
repository. Without it she is painted in the plain livery shown above.

This page is the entry point. For more detail:

- [README.md](README.md): the wiring, the phone measurements and what is real and stylised;
- [MODEL.md](MODEL.md): the model, the livery and the profile check;
- [acts.md](acts.md): the act machine and the scenes.

The numbers in the build come from the public sources cited in [section 10](#10-sources).

## 1. Run it

```sh
bun install
bun run build
bun run scripts/serve.js --port 8787 --no-build
# open http://127.0.0.1:8787/?ship=1   (then 「まちへ出る」 on the intro card)
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

| Action | Keys | Touch (phone: the pad's `sail` mode, [../MOBILE-CONTROLS.md](../MOBILE-CONTROLS.md)) |
|---|---|---|
| Engine telegraph ahead / astern (it stays where you leave it) | W / S or ↑ / ↓ | The pad's stick, up / down |
| Rudder to port / starboard (back to midships when released) | A / D or ← / → | The stick, left / right |
| Stop the engine | X | 停止 (the big button; the autopilot stays off until the next helm input) |
| Hold 4x time compression | Shift | 4× (hold). Time compression is not a helm input: with the autopilot on it keeps the helm and runs 4x; only the stick or the telegraph keys take it |
| Autopilot on / off | P | 自動操船 (a toggle that shows the autopilot's state; it also takes over again after 8 s idle) |
| Look around | — (mouse drag) | A drag on the right half of the screen (the pad's look, through `player.lookSink`) |
| Leave the voyage | Esc or 町へ戻る | 町へ戻る (a pad button; the voyage UI has one too). You land on the quay on foot or flying as you boarded, at the hour you boarded |

On a phone the pad is shown only at the helm (this transit under かなえ大橋). In every other beat (the berth, the send-off,
the ocean, the haul with キープ / 放流, the chain cards, the final card) the voyage UI owns the bottom of the screen and the
pad is hidden. The touch controls do not live in `sail.js` any more: it reads the pad's stick and look, and the buttons are the pad's
`sail` mode (`world/ship/padmode.js`); the stick's full-ahead tag reads 全速 at the helm. The chain cards scroll by touch and keep 次へ / もう一度出船 /
町へ戻る pinned at their bottom edge; the boarding chip is the short 昭福丸 and steps aside for the places sheet and the full map. Screenshots:
`docs/shots/integrate/` (`sail_*`, `haul_*`, `card_*`, `final_*`, and `fix1_*` / `fix2_*` for the two phone review rounds, portrait and landscape);
the integration record is the integration record (not included).

After 8 s with no input, the autopilot takes over again. That happens when she is under way, when she is against a
bank, or when a bank has stopped her. If she is left bow-on to a bank, the autopilot backs her off astern before it
goes ahead. The straight, slow start is only for the quay's own line (within 40 m of it): lost 100 m or more off the
line near the start, the autopilot steers and recovers like anywhere else. If back-and-fill has not freed her after 45
simulated seconds more than 60 m off the line, the **tow-assist** puts her back on it at 1.5 m/s and eases the camera
(`state.towed` counts them), so she is never left stuck. It only helps the autopilot, never the helm. Shore collision checks sample points on the hull outline against the shoreline (a 2 m fender margin). Against a quay
she slides along it and loses speed. Harbour boats in her lane move aside to their own starboard. While the voyage runs, the town's keys
(C, N, 1 to 9, R) are blocked.

## 4. The acts

| Act | States (`acts.js` `STATES`) | What you do |
|---|---|---|
| 1. Send-off and departure | DOCKED → SENDOFF → DEPART → BAY_MOUTH | Start the send-off at about 11:00: five-colour tapes, 福来旗, the music sting. Sound the horn (汽笛), then もやいを解く. Sail out past the market rows, under かなえ大橋 (about 11 m to spare) and past 商港 to the bay mouth. |
| 2. The North Atlantic | OCEAN_SET → WAIT → HAUL → STOW | The line (150 km, about 3,000 hooks) is set from the stern, then it soaks. You haul at the **starboard forward 舷門**: each fish goes on the scale, and you choose キープ or 放流. A bluefin under 30 kg / 115 cm cannot be kept (ICCAT). Each fish you keep is bled, spiked and dressed. Each kept bluefin gets a `DEMO-7KFY-26-xxxx` tag and goes to the −60 °C freezer. |
| 3. The true chain | TRANSSHIP_LAS_PALMAS → REEFER → SHIMIZU_WEIGH → HOMECOMING → CARD | The catch does not sail home. It goes to Las Palmas, then into a reefer container, then to the landing inspection at Shimizu (a vignette, in order: about 3 Fisheries Agency inspectors check by eye, scan each fish's chip with a reader gun, put a same-number sticker on its cheek, and weigh the trucks on truck scales; 1 kg over the quota costs the licences of all 6 ships, plus fines or prison). The ship and crew come home to Kesennuma under 大漁旗 (voyages of 9–15 months). The card shows your DEMO tags (the real tag is an IC chip plus a QR code, numbered from 1) and 「まぐろの日は北かつまぐろ屋へ」, with a button to 北かつまぐろ屋 海の市店, and closes on a line from 臼福本店's president, spoken at Hackatsuon on 2026-10-03: 「気仙沼の食を、世界中で楽しんでもらい、輸出していこう。」 |

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
| `&auto=1` | The hands-free demo, about 5 to 6 minutes from the quay to the card. |
| `&livery=fallback` / `nendo` | `fallback` forces the plain livery; `nendo` asks for the full livery, which needs its data files (section 6). |
| `&shot=1&t=S` | For deterministic screenshots: enters the beat at once and runs S seconds. |
| `&lang=ja` / `en` | The app's language switch; every ship string is in `data/ship/i18n.json`. |

## 6. The livery flag

The 第一昭福丸 livery is 臼福本店's (design by nendo), used with permission in the live demo and not included in this
repository.

`src/anime/world/ship/flags.js` `resolveFlags()` decides which livery to paint:

1. `?livery=fallback|nendo` wins.
2. Otherwise a bundle built with `KLC_NENDO=0` shows the plain fallback (`KLC_NENDO=1`, or no define, keeps the default).
3. Otherwise the full livery is requested, on every host. If its data files are absent or fail to load, she keeps the
   plain livery.

The plain livery is always available: `livery.js` paints it from code and holds no livery coordinates, and with it
nothing under `data/ship/shofukumaru1/*nendo*` is fetched. The full livery is drawn at run time from three data files in
`data/ship/shofukumaru1/` (the traced shapes, the traced lines and the measured supplements). The bundle never carries
them, only the file names. A deployment that has the files serves them under `/data/` like any other data (see the
static-server note in [../ARCHITECTURE.md](../ARCHITECTURE.md)); this repository does not include them.

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
| `ship/livery.js` | `paintAtlas`, `fallbackPlan`, `loadNendo` (the full livery's loader; never called with the fallback), `cleanNendo`. |
| `ship/route.js` | `BERTH {x, z, yaw}`, `SHOKO`, `BAY_MOUTH`, `OUTBOUND` (polyline), `OUTBOUND_PATH`, `KANAE_CROSSING {s, x, z, clearance, margin}`, `routeClearance(path)`. |
| `explore/sail.js` | `BOAT` (handling constants); `AUTO` (autopilot constants, the tow-assist's among them); `boatStep(s, input, dt, P)` (pure); `sailStep` (with shore); `pursue` (autopilot); `createSail(ctx, { ship, route })` → `{ enter(at), exit(), active, state, setAutopilot(on), focus(), onEvent(cb) }`. Events: `passKanae`, `passShoko`, `bayMouth`, `arrived`. |
| `ship/acts.js` | `createActs(snapshot?)` (pure, serialisable with `snapshot()`); `STATES`, `EVENTS` (guards), `RULES`, `makeCatch`, `seasonOpen`, `weighIn`; `oceanNoposKey(today)` (the Act 2 banner never says the real ship is fishing "right now": inside the Aug–Jan season it says the season is open and she fishes these waters in it every year; otherwise she "fishes these waters each Aug–Jan season"). |
| `ship/tags.js` | `formatTag(n, yy = 26)` → `DEMO-7KFY-26-0001`; `isDemoTag(s)`; `REAL_TAG_RE` (`/^7KFY-\d{2}-\d{4}$/`), which a demo tag never matches. |
| `ship/sendoff.js`, `ocean.js`, `chain.js` | The scenes for Acts 1, 2 and 3. |
| `ship/voyage.js` | `createVoyage(ctx, { ship, sail, route, livery, auto })`: the director. It runs the machine, the scenes, the cameras and the UI. |
| `ui/ship.js`, `data/ship/i18n.json` | The voyage UI and the boarding chip. Every string is in JA and EN. `data/i18n.json` is left untouched. |

Shot hooks: `window.__ship`, `__voyage`, `__sail`, `__voyageShot(state, opts)`, `__voyageCam(name)`,
`__voyageKanae(back)` and `__voyageInit({ auto })`.

## 8. Tests

```sh
env -u NODE_OPTIONS bun test test/ship-model.test.js test/ship-sail.test.js test/ship-acts.test.js \
  test/ship-integrate.test.js test/ship-livery-paint.test.js test/ship-story.test.js test/v3-fix.test.js
```

| File | Covers |
|---|---|
| `ship-sail` | `boatStep` (inertia, astern, a tactical diameter of 3 to 4 LOA, rudder and yaw lag, purity and determinism); shore collision (500 random runs never bring a hull sample within 1 m of the shore, and she slides along a quay); OUTBOUND is water every 5 m and at least 40 m from the shore beyond the berth approach; かなえ大橋 is crossed between the pylons with at least 10 m above her 21 m air draft; the autopilot and its recovery, including lost off the line near the start (s 40–79, 150 m off: it steers toward the line) and the tow-assist (the mid-harbour pocket is cleared within 60 s; it never fires on a clean run or under the helm); AI boats giving way. |
| `ship-acts` | The tag format, and that a demo tag never matches the real format; the act state machine (order, guards, refused events, serialise and restore, the ICCAT season); the release rule and the quota; the Act 3 order (the fish leave her at Las Palmas, and Shimizu refuses 1 kg over); i18n parity; the phone budget of the scenes; and the facts from 臼福本店's talk (the new keys in JA and EN, the fleet of 6, the quota context, the Shimizu inspection steps in order, the crew copy, the text-only trivia, and the closing line as the final card's last line, rendered through `mountShipUI`). |
| `ship-model` | Dimensions against `SHIP`; the 舷門 on the starboard side only; the triangle budgets per tier; the livery flags (`?livery=fallback` and `KLC_NENDO=0` give the plain livery); the fallback livery fetches nothing and no module bundles the livery data; lettering reads right from both sides. |
| `ship-livery-paint` | Replays `paintAtlas` on a probe canvas and reads back texels: the transom, the aft sheer triangle, and the starboard stern hourglass X. |
| `ship-story` | The story pin: its data, sourced position, edge rule, drone view, places entry, card, board and explore wiring (section 9b). |
| `ship-integrate` | The URL parameters, the boarding entry, the module order, and the whole voyage headless through the real module, from the quay to the card. |
| `v3-fix` | The public mirror's rules and the browser gate. |

Headless shots go through the one-browser gate (add `--livery fallback` for the plain livery, which is the one this
repository can render):

```sh
tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/ship-acts-shots.mjs --port <port> --w 1920 --h 1080 --out shots/ship-int/a
tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/ship-profile.mjs --port <port>
```

`ship-profile.mjs` renders her side-on and compares the silhouette with reference photographs (port at 0.1226 m/px, and
a three-quarter view from starboard). The reference photographs are copyrighted and stay in the git-ignored `raw/ref/`;
the composites made from them are never committed. The renders in `docs/ship/shots/` are of the plain livery.

## 9. Phone budget

| Part | High | Phone |
|---|---|---|
| Ship model triangles (budget / built) | 150 k / 22.9 k | 60 k / 10.9 k |
| Livery atlas | 2048 × 1024 | 2048 × 1024 (about 11 MB with mipmaps) |
| Send-off crowd / tapes / flags | 14 / 40 / 6 | 6 / 18 / 3 |
| Ocean grid / floats | 96² / 24 | 40² / 14 |

The ocean is built when Act 2 starts and freed when it ends. While it is shown, the whole town is hidden. The crowd is
freed once she is 450 m out. The measured numbers (390 × 844 at DPR 3, iPhone UA) are in
[README.md § Phone budget and measurements](README.md#phone-budget-and-measurements). The ship adds about 11 MB of
texture to the city. At sea the frame draws about 135 calls and 36 k triangles.

## 9b. Story pin: tuna bones from about 5,500 years ago in 唐桑

The Living City's first **story pin** is the 波怒棄館遺跡 in 唐桑: an early Jōmon shell midden with more than 140 kg of
tuna bones. A story pin is a short sourced story tied to a real place. It is listed in the places list under its own
group, 「まちの物語」 / "Stories of the town" (after the boarding entry), and found by search. Selecting it flies the drone
to the site, pins its label and opens a story card.

| Part | Where |
|---|---|
| The module | `src/anime/world/explore/storypins.js` (marker `[ship:story]`), wired in `explore/index.js` |
| The data: JA and EN strings, the lat/lon, the sources | `data/ship/story-pins.json` |
| The tests | `test/ship-story.test.js` |
| The shot | `ship-acts-shots.mjs --ui 1 --list ui_story` |

**API.**

| Call | Result |
|---|---|
| `storyPlaces(L)` | The places-list entries `{ id, ja, en, cat, at, group, groupLabel, story, edge, view }` |
| `pinPosition(pin, L)` | `{ x, z, inMap, edge }` (pure): the projected lat/lon, or, outside the map (`layout` `ZONES.far`), the nearest point 60 m inside its edge, with the card saying so |
| `storyFraming(L, x, z)` | The drone view (pure): the board in the lower third, the sea beyond it, the camera 46 m back and 24 m up |
| `createStoryPins(ctx, { L, fly, lang })` | `{ places, card, markers, root, open(id) }`; the boards hang under one root so the ocean act hides them with the town |
| `window.__story.open('story-hanukidate')` | Flies there and opens the card (the shot hook) |

**Real and stylised.**

| Real (sourced) | Stylised (the game's choice) |
|---|---|
| The site, 波怒棄館遺跡, a 貝塚 on a hilltop overlooking 広田湾 (Nikkei 2013-05-20) | The pin's position: it is placed at lat 38.958, lon 141.627, inside the 荒谷前 district. No source publishes the exact spot, and 荒谷前 is a district about 1 km or more across (the GSI reverse geocoder gives 荒谷前 within about ±300 m of that point and a different district about 1 km out), so `accuracyM` is 1000 and the card says "the exact spot is not published, up to about 1 km". An estimate from the address, not a surveyed point |
| Its age: early Jōmon, about 5,500 years ago | The wooden 説明板 model, its roof and its lettering: invented. No source shows a real signboard at the site, and the area was a housing-relocation dig |
| The bones: more than 140 kg of tuna bones (press reports; 臼福本店's talk); fish over 2 m; stone blades stuck in some bones | The drone framing (the sea on the far side of the board) |
| A possible butchering site: Nikkei 2013-05-20 has the city board saying 「マグロを解体する施設があった可能性がある」 under the headline 「解体場か」. The card says it as "may have been" in paragraph 2 and again in the last line (「…すでにマグロが解体されていたのかもしれません。」 / "People may already have been butchering tuna here about 5,500 years ago."), and claims no continuity since | |
| The address: 気仙沼市唐桑町荒谷前 (the prefecture's 2013 dig list; the GSI reverse geocode of 38.958, 141.627 returns 唐桑町荒谷前) | |

## 10. Sources

- **The particulars and the profile:** 臼福本店's public pages (usufuku.jp), the ship's registry entries, and measurements
  on reference photographs: photographs of nendo's design model of the ship (port side at 0.1226 m/px, a starboard
  three-quarter view, the transom and an aerial view), and a registry photograph of the real ship from starboard
  (29 January 2020). The photographs are used for measurement only, live in the git-ignored `raw/ref/`, and are never
  shipped.
- **臼福本店's presentation at Hackatsuon on 2026-10-03:** the cutaway, the gear, the specs, the tag, the bonded
  weigh-in and ICCAT. Only the facts the app says it takes from the talk are used: the fleet of 6 (one retired in 2026),
  the minister's allocation of about 80 t to this one ship (shown as "about"), about 100 registered boats with 48 on
  Atlantic bluefin, the IC chip plus QR code numbered from 1, the Shimizu inspection, 1 kg over the quota costing all 6
  licences, voyages of 9–15 months, the crew of 6–7 Japanese and about 18 Indonesian, the aroma, the trivia (text only)
  and the closing line.
- ICCAT Rec. 22-08 (the 30 kg / 115 cm minimum and the season; <https://www.iccat.int/Documents/Recs/compendiopdf-e/2022-08-e.pdf>)
  and the bluefin catch document (BCD / eBCD): the tags and the quota are for bluefin only. Bigeye and albacore are other
  species, so the game does not tag them or count them against the quota; the talk says every fish is tagged, which the
  game does not contradict for bluefin, and the tag and quota rule for other species is not claimed. ICCAT 2025/26 gives
  Japan 3,779 t of 43,296 t (8.7 %).
- IUCN: Atlantic bluefin moved from EN to LC in September 2021, which sources the facts panel's EN → LC line.
- MSC (the facts panel's 「2020年、大西洋クロマグロで初めてMSC認証」): the MSC Japan press release of 2020-08-13,
  <https://www.msc.org/jp/what-you-can-do/media-centre/press-releases/200813>, and
  <https://www.usufuku.jp/msc_cert.html>.
- みなと新聞 2020-09-01 (<https://www.minato-yamaguchi.co.jp/minato/e-minato/articles/104423>): the first MSC-certified
  frozen Atlantic bluefin at the Toyosu auction, one 142 kg GG fish at ¥6,800/kg, 「キロ3000円（約2倍）高い」, that is about
  ¥3,000/kg above the usual price. It is one auction, not a standing price; the reefer card says so. A Sustainable Brands
  interview is sometimes cited for "¥6,800 against about ¥3,000"; that source could not be opened, so it is not used, and
  this article reads the ¥3,000 as the premium.
- Other in-app facts: about 45 days' leave (usufuku.jp), the bases Kesennuma, Cape Town and Las Palmas (3, 3 and 1 of the
  7 ships before the 2026 retirement), Good Design Award 2020 and Ship of the Year 2020 (JASNAOE), and Starlink as the
  first on a Japanese ship (as 臼福本店's presentation says).
- 10 October as まぐろの日: set by the 日本かつお・まぐろ漁業協同組合 in 1986, after Yamabe no Akahito's poem of 10 October
  726 (<https://prtimes.jp/magazine/today/tuna-day/>, <https://www.kngyoren.com/pages/265/>).
- 気仙沼観光, the saury fleet's 大型サンマ漁船一斉出漁 event page (<https://kesennuma-kanko.jp/sanma-defune2024>): the
  ceremony at the コの字岸壁 in 魚浜町 and the departure at the 港町出港岸壁; and a 2024-03-15 report of 第一昭福丸 at the
  コの字岸壁 (<https://shintomisushi.com/blog/21997/>). The berth is inferred from these.
- The story pin (section 9b): 日本経済新聞 2013-05-20 「縄文期のマグロ解体場か」
  (<https://www.nikkei.com/article/DGXNASDG17039_Q3A520C1CR0000/>: 広田湾を望む高台, about 5,500 years ago, fish over
  2 m); 共同通信 2013-05-17 via 四国新聞 (<https://www.shikoku-np.co.jp/national/culture_entertainment/print.aspx?id=20130517000543>:
  the stone blades); the prefecture's 2013 dig list (<https://www.pref.miyagi.jp/site/maizou/hakkutujyouhou.html>:
  気仙沼市唐桑町荒谷前, by Route 45); the city's excavation report 『波怒棄館遺跡』 2022
  (<https://ci.nii.ac.jp/ncid/BC13429351>); and the GSI reverse geocoder
  (<https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=38.958&lon=141.627>: 唐桑町荒谷前). The
  figure "more than 140 kg" is from the press reports and 臼福本店's talk.
- OSM, GSI and `harbor/kanae.js` for the berth, the route and かなえ大橋.
