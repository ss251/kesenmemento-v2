# 第一昭福丸 in Kesennuma Living City

SHOFUKU MARU No.1 (7KFY, MG1-2112, 臼福本店), the 58.6 m Atlantic-bluefin longliner built by みらい造船 in 2020, lies at
true scale alongside the コの字岸壁 in 魚浜町. You can board her and play the three acts: the send-off and the departure
under かなえ大橋, the North Atlantic longline set and haul, and the true chain that brings the catch to Japan while the
ship and crew come home.

The 第一昭福丸 livery is 臼福本店's (design by nendo), used with permission in the live demo and not included in this
repository. Without it she is painted in a plain livery.

Details per part: [SHOFUKUMARU.md](SHOFUKUMARU.md) (the user and developer guide, with the sources),
[MODEL.md](MODEL.md) (the model, the livery, the profile check) and [acts.md](acts.md) (the act machine, the rules, the
scenes). Markers in code: `[ship]`, `[ship:acts]`, `[ship:integrate]`.

## Boarding

- **Places list** (search button or `/`): 「第一昭福丸に乗る / Board the 第一昭福丸」 heads the list, under 船に乗る.
  Selecting it, in the list, the search results or on the full map, boards her.
- **At the quay**: within 320 m of her berth, below 420 m in height, a chip 「第一昭福丸に乗る · 乗船する」 appears
  above the bottom of the screen.
- **URL** (the demo, and deterministic shots):

| Parameter | Effect |
|---|---|
| `?ship=1` | Board at the quay (DOCKED, 11:00). |
| `&act=1` / `2` / `3` | Start at the first beat of an act: DOCKED, OCEAN_SET, TRANSSHIP_LAS_PALMAS. |
| `&beat=HAUL` | Start at any state of `acts.js` `STATES` (wins over `act`). The machine is fast-forwarded legally. |
| `&keep=N`, `&fish=1` | With `beat=HAUL`: keep N fish first; put a fish on the scale. |
| `&auto=1` | The hands-free demo, about 5 minutes from the quay to the card. |
| `&livery=nendo` / `fallback` | The livery (see Flags). |

Without `?shot`, a URL voyage waits for the viewer to leave the intro card (「まちへ出る」 sets `body.playing`): nothing
boards and the director does not run behind the card, so the send-off, the tapes, the music and the horn are seen.
With `?shot=1&t=S` the beat is entered on the first simulation step and the scene runs S seconds before the frame.

## Playing

- **Act 1:** 出船おくりを始める starts the send-off (tapes, 福来旗, the music sting). Sound the horn (汽笛), then
  もやいを解く. The sail mode takes her out on autopilot. W / S (or the arrows) move the engine telegraph, A / D put
  the rudder over, X stops the engine, Shift holds the 4x time compression, P toggles the autopilot. On a phone, the
  left half of the screen is the stick and a drag on the right half looks around. Touching the controls takes the
  helm; after 8 s idle (under way, against a bank, or stopped by one) the autopilot takes over again. Left bow-on to a
  bank, it backs her off astern before going ahead (`pursue`'s recovery). Lost 100 m or more off the line near the
  start, it steers and recovers like anywhere else (the straight, slow start is only within 40 m of the quay's line),
  and if back-and-fill has not freed her after 45 simulated seconds more than 60 m off the line, the tow-assist puts
  her back on it (`state.towed`). Arriving boats in her lane step aside to
  their own starboard (up to 25 m) and hold until she has passed. After かなえ大橋, 湾口へ（早送り） skips to the bay mouth.
- **Act 2:** the line is set from the stern, then the soak, then the haul at the starboard forward 舷門: キープ or
  放流 for each fish on the scale. A bluefin under 30 kg cannot be kept. Each kept bluefin gets a `DEMO-7KFY-26-xxxx`
  tag and goes to the −60 °C freezer. 早送り speeds the counters up 5x.
- **Act 3:** the cards (Las Palmas, the reefer container, the Shimizu landing inspection), then she comes home under
  大漁旗 and the final card: your DEMO tags and 「まぐろの日は北かつまぐろ屋へ」. Its button flies you to 北かつまぐろ屋
  海の市店. The card closes on a line from 臼福本店's president, spoken at Hackatsuon on 2026-10-03:
  「気仙沼の食を、世界中で楽しんでもらい、輸出していこう。」
- **The Shimizu inspection** is a vignette with its steps in order (`SHIMIZU_STEPS` in `acts.js`): about 3 Fisheries
  Agency inspectors check by eye, scan each fish's chip with a reader gun, put a same-number sticker on its cheek, and
  the trucks are weighed on truck scales; the last caption says 1 kg over the quota costs the licences of all 6 ships,
  plus fines or prison. The steps fade in one by one (at once in shot mode and with reduced motion); the hands-free
  demo holds this card 12 s. The real tag is an IC chip plus a QR code numbered from 1; the game keeps `DEMO-` tags.
- **町へ戻る** or **Esc** leaves at any time. She returns to her berth. While the voyage runs, the town's keys
  (C drive, N map, 1 to 9 views, R) are blocked so they cannot take the camera.

## Wiring

`src/anime/world/ship/index.js` is the world module `ship`, built after `life` (the send-off crowd uses its character
kit) and before `explore` (which lists the boarding entry). At load it:

1. resolves the livery flag (`ship/flags.js`) and builds the model at the tier's budget (`ship/shofukumaru1.js`);
2. creates the sail mode (`explore/sail.js`), which holds her pose at `ROUTE.BERTH`;
3. creates the director (`ship/voyage.js`) with its UI (`ui/ship.js`), and the boarding chip;
4. publishes `ctx.services.ship = { ship, sail, voyage, flags, livery, tier, place, board(state?, opts), parseShipParams }`
   and the shot hooks `window.__ship`, `__voyage`, `__sail`, `__voyageShot(state, opts)`, `__voyageCam(name)`,
   `__voyageKanae(back)` and `__voyageInit({ auto })`.

Everything is added with `ctx.add` (the dynamic root), so it is never merged into the static batch.

| File | Role |
|---|---|
| `world/ship/index.js` | The module: build, boarding, URL, hooks. |
| `world/ship/shofukumaru1.js`, `livery.js`, `flags.js` | The model, the livery atlas, the livery flag ([MODEL.md](MODEL.md)). |
| `world/ship/route.js`, `world/explore/sail.js` | The berth, the outbound route under かなえ大橋, the ship handling (`boatStep`), the shore. |
| `world/ship/acts.js`, `tags.js` | The pure act machine and the DEMO tags. |
| `world/ship/sendoff.js`, `ocean.js`, `chain.js`, `voyage.js` | The scenes and the director ([acts.md](acts.md)). |
| `ui/ship.js`, `data/ship/i18n.json` | The voyage UI and the boarding chip; every string in JA and EN. |
| `world/explore/storypins.js`, `data/ship/story-pins.json` | The 波怒棄館遺跡 story pin (see Story pin below). |
| `world/explore/index.js`, `ui.js` | The places entry first in the list, `goTo` runs a place's `action`, streaming ahead of her bow while sailing. |

## Flags

The 第一昭福丸 livery is 臼福本店's (design by nendo), used with permission in the live demo and not included in this
repository.

`ship/flags.js` `resolveFlags()`: `?livery=fallback|nendo` wins. Otherwise a build that defines `KLC_NENDO=0` shows the
plain fallback. Otherwise the full livery is requested on every host; when its data files are absent or fail to load,
she keeps the plain livery. With the fallback, nothing under `data/ship/shofukumaru1/*nendo*` is fetched. The bundle
never contains the livery data, only the file names; it is fetched at run time from `data/ship/shofukumaru1/`, and a
deployment that has those files serves them under `/data/` like any other data. See [MODEL.md](MODEL.md) (Livery) and the
static-deploy note in [../ARCHITECTURE.md](../ARCHITECTURE.md).

## Story pin

The Living City's first story pin, 波怒棄館遺跡 in 唐桑, is a short sourced story at a real place: an early Jōmon shell
midden of about 5,500 years ago with more than 140 kg of tuna bones. It sits in the places list under its own group
「まちの物語」, flies the drone there and opens a story card. Files: `src/anime/world/explore/storypins.js`,
`data/ship/story-pins.json`, `test/ship-story.test.js`; the hook is `window.__story.open('story-hanukidate')`. Real: the
site, its age, the bones, fish over 2 m, the stone blades, the possible butchering site and the 唐桑町荒谷前 address.
Stylised: the pin's position (an estimate: the exact spot is not published, so up to about 1 km off, inside the 荒谷前
district), the wooden 説明板 model with its roof and lettering (invented; no source shows a signboard there), and the
drone framing. Details and sources: [SHOFUKUMARU.md](SHOFUKUMARU.md) section 9b and section 10.

## Phone tier

The phone tier builds the 60 k-triangle model (about 11 k triangles), 6 people, 18 tapes and 3 flags at the send-off,
a 40 × 40 swell grid and 14 floats at sea, and 24 wake segments. The ocean is built when Act 2 starts and freed when
it ends; while it is shown the whole town is hidden. The crowd is freed once she is 450 m out. Measured numbers are in
the section Phone budget and measurements.

## Tests

```sh
env -u NODE_OPTIONS bun test test/ship-integrate.test.js test/ship-acts.test.js test/ship-sail.test.js test/ship-model.test.js test/ship-livery-paint.test.js test/ship-story.test.js
```

- `ship-integrate`: the URL parameters, the boarding entry, the module order, and the **whole voyage headless through
  the real module**: quay to card in order, the town hidden only at sea, DEMO tags, a homecoming without a snap, Act 1
  past the market rows, under かなえ大橋 and past 商港 (`passed` is `['kanae', 'shoko']` at BAY_MOUTH), and no
  arriving harbour boat or name label drawn while she is at sea.
- `ship-livery-paint`: a probe 2D context replays `paintAtlas` and reads texels back: the transom is white in both
  liveries, the stern triangles reach the quarter, the transom lettering paints, and the starboard aft sheer triangle
  and stern hourglass X are drawn as measured.
- `ship-story`: the story pin's data, position, edge rule, drone view, places entry, card, board and wiring.
- `ship-acts`: tags, the act machine with its guards, the haul rules, the Act 3 order, i18n, the phone budget.
- `ship-sail`: `boatStep`, shore collision (500 random runs), the route clearances and かなえ大橋, the autopilot's
  recovery (also when lost 150 m off the line at s 40–79) and the tow-assist.
- `ship-model`: dimensions, the starboard-only 舷門, budgets, the flags and the fallback livery.

## Shots

```sh
tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/ship-acts-shots.mjs --port 8964 --w 1920 --h 1080 --out shots/ship-int/a
tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/ship-acts-shots.mjs --port 8964 --q phone --w 390 --h 844 --list a1_sendoff,a2_haul,a2_stow,a3_card,a3_shimizu --out shots/ship-int/p
tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/ship-acts-shots.mjs --port 8964 --w 1920 --h 1080 --ui 1 --out shots/ship-int/u   # the chip, the places list, the story pin
tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/ship-profile.mjs --port 8964
tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/phonemem.mjs --port 8964 --params "ship=1&act=2" --start --eval tools/anime/ship-memdiag.js
```

The beats `ship-acts-shots.mjs` shoots are `a1_docked`, `a1_docked_night`, `a1_side_port`, `a1_sendoff`, `a1_sendoff_close`,
`a1_tapes_snap`, `a1_kanae`, `a1_kanae_chase`, `a1_market`, `a1_shoko`, `a1_transom`, `a1_baymouth` (Act 1); `a2_set`,
`a2_wait`, `a2_haul`, `a2_haul_night`, `a2_side_stbd`, `a2_transom`, `a2_stern_quarter`, `a2_stern_side`, `a2_stow` (Act 2);
`a3_laspalmas`, `a3_reefer`, `a3_shimizu`, `a3_home_approach`, `a3_home`, `a3_card` (Act 3); `a1_facts` (the facts panel);
and `ui_chip`, `ui_places`, `ui_story` (the town UI), with `_en` variants for `a3_shimizu`, `a3_card` and `a1_facts`. The
shots go to `shots/` (git-ignored). The only ship images kept in this repository are the plain-livery profile renders in
`docs/ship/shots/`.

`tools/anime/ship-memdiag.js` is the `--eval` for phonemem: it reports the voyage state, whether the town is hidden
and how many arriving harbour boats are drawn. `--start` is required for Act 2: a URL voyage waits for the visitor to
leave the intro card (`body.playing`), and without it phonemem measures the city on the intro card (state DOCKED,
`active: false`, `oceanActive: false`).

## Phone budget and measurements

`phonemem.mjs` at 390×844, DPR 3, iPhone user agent, with the phone tier forced:

| Run | JS heap peak | Heap after GC | Texture estimate | Draw calls | Triangles drawn | Page errors |
|---|---|---|---|---|---|---|
| City, no ship (`?only=` without `ship`) | 372 MB | 129 MB | 220 MB | 503 | 3.61 M | none (the dev server's `/api/live` 404 only) |
| City with the ship berthed | 398 MB | 131 MB | 232 MB (+12 MB) | 457 (519 mean, 612 max) | 3.18 M (3.61 M mean, 4.26 M max) | none (the dev server's `/api/live` 404 only) |
| Act 2 at sea (`?ship=1&act=2 --start`) | 434 MB | 133 MB | 232 MB | 139 mean, 166 max | 37.8 k mean, 44.3 k max | none (the dev server's `/api/live` 404 only) |

- **2026-10-05:** the texture estimates in this table predate the later additions to the static atlas (a sixth page: new crate,
  boat and tug plates; not the ship). The phone tier's trimmed atlas pages bring them to 215 MB, the ship's 11 MB included
  (`docs/ARCHITECTURE.md`, "Phone texture budget").
- **The heap peak is the transient load peak**, reached while `explore` builds, and it moves by tens of MB from run to
  run: the berthed city measured 377 MB, 442 MB and 398 MB in three runs, Act 2 387 MB, 432 MB and 434 MB. The figures
  that hold still are the heap after GC (131–133 MB), the texture estimate (231–232 MB), the draw calls and the
  triangles.
- The ship adds about 11 MB of texture (its 2048×1024 livery atlas with mipmaps) and about 10.9 k triangles; its
  module builds in about 0.2 s.
- At sea the town is hidden: `ship-memdiag.js` reports state OCEAN_SET, `active: true`, `oceanActive: true`, the
  static root invisible, 2 of 54 dynamic groups drawn and no arriving harbour boat drawn.
- The two-faced 大漁旗 and the board backs add no draw call per flag (one geometry each) and one merged mesh for the
  backs.
- Entering Act 2 straight from the URL leaves the town's CPU geometry copies in memory until the town has been drawn
  once (the phone tier frees them on the first upload); in play, Act 2 always follows the town.

**Profile check** (`ship-profile.mjs`, against a reference photograph at 0.1226 m/px): port silhouette IoU 0.864 (high)
and 0.862 (phone), target 0.85. Starboard (a three-quarter view) 0.733, and 0.738 at its fitted scale. See
[MODEL.md](MODEL.md).

## Real and stylised

Real: her particulars (58.60 m LOA, 9.2 m beam, 486 t, air draft about 21 m), the measured profile, the 舷門 on the
starboard side only, MG1-2112 and 7KFY, the berth on the コの字岸壁 east face, the route under かなえ大橋 with about
11 m to spare (32 m official clearance against about 21 m air draft; the model's girder sits at 32.7 m where she
crosses), the 11:00 send-off with five-colour tapes, 福来旗, music and the horn, the 150 km line with about 3,000 hooks
and the bait on the set card (squid, mackerel, horse mackerel, saury, sardine), the stow card's 4 blast freezers at 10 t
a day and 523.1 m³ hold at −60 °C (WCPFC), the set clock's "really 4–8 hours" (北かつ 4–5 h, 臼福本店's presentation 7–8
h), the return home about once a voyage for refit and a crew change, the ICCAT 30 kg / 115 cm minimum and the Aug–Jan
season, Japan's 3,779 t of 43,296 t (about 3,700 t, shared by about 100 boats, 48 of them on Atlantic bluefin), −60 °C
and about 36 h to the core, the catch bled, spiked and dressed (gills, guts and tail off) before the freezer, the quota
bar as the minister's allocation to this one ship, about 80 t (from 臼福本店's public talk of 2026-10-03, shown as
"about"), the chain Las Palmas → reefer container → the Shimizu landing inspection, the fleet of 6 (one retired in
2026), voyages of 9–15 months with 6–7 Japanese and about 18 Indonesian crew and the bedtime forest scent, the
homecoming under 大漁旗, 北かつまぐろ屋 海の市店, the first MSC certification of Atlantic bluefin (2020; MSC Japan,
2020-08-13), IUCN EN → LC in September 2021, and the story pin's site, its age, the tuna bones, fish over 2 m, the stone
blades, the possible butchering site and the 唐桑町荒谷前 address.

Stylised: 12 kn in the harbour (playtests 2026-10-08: the earlier 6 kn pace was too slow for kids; her service speed is
12.3 kn, JASNAOE SOY 2020, and no harbour limit for 気仙沼 is sourced), time compression (4x in the bay, the set in 40 s), the handling constants, the hull lines
between the measured profile and the beam, the crowd size and tape lengths, the order and weights of the fish, the ocean
palette and the hours (the HUD clock runs 05:30 → 10:00 over the set and on from 10:00 through the soak; the sky sits at
11:00 for the soak and 16:12 for the haul), the floodlight pools of the night haul, the chain cards as flat illustrations
(the Shimizu vignette's figures, 富士山 and numbered badges), the in-game declared-versus-weighed check, the toast
「長音三声　別れの汽笛」 / "Three long blasts: the farewell" (the three blasts are the game's choice; no source gives them
as a custom), the Act 2 banner's seasonal wording (never "right now"), the livery's measured shapes where the reference
photographs disagree (MODEL.md), the story pin's position (inside 荒谷前, up to about 1 km off), its 説明板 model and the
drone framing, and the tow-assist. Details: [MODEL.md](MODEL.md) and [acts.md](acts.md).

## Choices

- **The berth** is the 魚浜町 pier's east face (the コの字岸壁), inferred from the ceremony venue named on 気仙沼観光's
  saury-fleet send-off page (<https://kesennuma-kanko.jp/sanma-defune2024>: the ceremony at 「気仙沼市魚浜町コの字岸壁
  （セレモニー会場）」 and the departure at 「港町出港岸壁」); a blog report of 第一昭福丸 at the コの字岸壁 on 2024-03-15
  (<https://shintomisushi.com/blog/21997/>) supports it. The fishery database's point for the 港町 出漁準備岸壁 north of
  the market is a different quay and is not used. `route.js` holds the evidence.
- **The homecoming** brings her in bow first and lays her port side to the same berth (the send-off has her starboard
  side to it, bow out). This avoids turning a 58.6 m ship end for end in the basin on screen.
- **The haul at night** adds floodlight pools at the 舷門 (hauling often runs to midnight); the cel materials take no
  point lights.
- **The facts from 臼福本店's talk** at Hackatsuon (2026-10-03) are used where the app says so: the six-ship fleet line,
  the quota bar as the minister's allocation with its context, the tag's IC chip and QR wording and the Shimizu
  inspection, the crew life, the trivia (text only), the closing line on the card and the story pin. Nothing else from
  the talk is used.
