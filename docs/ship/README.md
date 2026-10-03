# 第一昭福丸 in Kesennuma Living City

SHOFUKU MARU No.1 (7KFY, MG1-2112, 臼福本店), the 58.6 m Atlantic-bluefin longliner built by みらい造船 in 2020, lies at
true scale alongside the コの字岸壁 in 魚浜町. You can board her and play the three acts: the send-off and the departure
under かなえ大橋, the North Atlantic longline set and haul, and the true chain that brings the catch to Japan while the
ship and crew come home.

Sources: the captain's dossier [shofukumaru-dossier.md](shofukumaru-dossier.md). Details per part:
[MODEL.md](MODEL.md) (the model, the livery, the profile check) and [acts.md](acts.md) (the act machine, the rules, the
scenes). Marker in code: `[ship]`, `[ship:acts]`, `[ship:integrate]`.

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

With `?shot=1&t=S` the beat is entered on the first simulation step and the scene runs S seconds before the frame.

## Playing

- **Act 1:** 出船おくりを始める starts the send-off (tapes, 福来旗, the music sting). Sound the horn (汽笛), then
  もやいを解く. The sail mode takes her out on autopilot. W / S (or the arrows) move the engine telegraph, A / D put
  the rudder over, X stops the engine, Shift holds the 4x time compression, P toggles the autopilot. On a phone, the
  left half of the screen is the stick. Touching the controls takes the helm; after 8 s idle under way the autopilot
  takes over again. After かなえ大橋, 湾口へ（早送り） skips to the bay mouth.
- **Act 2:** the line is set from the stern, then the soak, then the haul at the starboard forward 舷門: キープ or
  放流 for each fish on the scale. A bluefin under 30 kg cannot be kept. Each kept bluefin gets a `DEMO-7KFY-26-xxxx`
  tag and goes to the −60 °C freezer. 早送り speeds the counters up 5x.
- **Act 3:** the cards (Las Palmas, the reefer container, the Shimizu weigh-in), then she comes home under 大漁旗
  and the final card: your DEMO tags and 「まぐろの日は北かつまぐろ屋へ」. Its button flies you to 北かつまぐろ屋 海の市店.
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
| `world/explore/index.js`, `ui.js` | The places entry first in the list, `goTo` runs a place's `action`, streaming ahead of her bow while sailing. |

## Flags

`ship/flags.js` `resolveFlags()`: `?livery=nendo|fallback` wins. Otherwise the nendo livery is on for localhost,
127.0.0.1, ::1, `*.localhost` and `*.ts.net` (the Tailscale demo funnel), or when the build defines `KLC_NENDO=1`, and
off everywhere else. With the flag off, the plain fallback livery is painted and nothing under
`data/ship/shofukumaru1/*nendo*` is fetched. The bundle never contains the nendo data, only the file names; it is
fetched at run time from `data/ship/shofukumaru1/` when the flag is on.

**Open decision for the captain.** The brief for this build keeps the nendo livery behind this flag and leaves the
public deploy to the captain. The worktree copy of the dossier and `next-pass-usui.md` carry a header saying 臼福本店
granted the livery permission on 2026-10-03 and that nendo should be the default everywhere. This build follows the
brief. To make nendo the default everywhere, `resolveFlags` returns `{ nendoLivery: true, source: 'default' }` as its
last line (keeping `?livery=fallback` and `KLC_NENDO=0` as the opt-outs), the flag tests in
`test/ship-model.test.js` flip, and the deploy must then publish `data/ship/shofukumaru1/*nendo*.json`.

## Phone tier

The phone tier builds the 60 k-triangle model (about 11 k triangles), 6 people, 18 tapes and 3 flags at the send-off,
a 40 × 40 swell grid and 14 floats at sea, and 24 wake segments. The ocean is built when Act 2 starts and freed when
it ends; while it is shown the whole town is hidden. The crowd is freed once she is 450 m out. Measured numbers are in
the section Results.

## Tests

```sh
env -u NODE_OPTIONS bun test test/ship-integrate.test.js test/ship-acts.test.js test/ship-sail.test.js test/ship-model.test.js
```

- `ship-integrate`: the URL parameters, the boarding entry, the module order, and the **whole voyage headless through
  the real module**: quay to card in order, the town hidden only at sea, DEMO tags, a homecoming without a snap.
- `ship-acts`: tags, the act machine with its guards, the haul rules, the Act 3 order, i18n, the phone budget.
- `ship-sail`: `boatStep`, shore collision (500 random runs), the route clearances and かなえ大橋.
- `ship-model`: dimensions, the starboard-only 舷門, budgets, the flags and the fallback livery.

## Shots

```sh
tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/ship-acts-shots.mjs --port 8964 --w 1920 --h 1080 --livery fallback --out shots/ship-int/fb
tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/ship-profile.mjs --port 8964 --livery fallback
tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/phonemem.mjs --port 8964 --params "ship=1&act=2"
```

`tools/anime/ship-memdiag.js` is the `--eval` for phonemem: it reports the voyage state and whether the town is hidden.

## Results (2026-10-03, this branch)

**Tests.** `bun test`: 636 pass, 24 skip, 1 fail. The one failure is the known `test/v4-explore.test.js` "matches the
committed file" (shared `data/cache` drift from other packages; it predates this branch).
`env -u NODE_OPTIONS bun run scripts/build-web.js` builds clean.

**Phone tier** (`phonemem.mjs`, 390×844 at DPR 3, iPhone UA, forced phone tier, nendo livery on the local host):

| Run | JS heap peak | Heap after GC | Texture estimate | Draw calls | Triangles drawn | Page errors |
|---|---|---|---|---|---|---|
| City, no ship (`?only=` without `ship`) | 372 MB | 129 MB | 220 MB | 503 | 3.61 M | none (the dev server's `/api/live` 404 only) |
| City with the ship berthed | 377 MB | 130 MB | 231 MB (+11 MB) | 488 | 3.40 M | none |
| Act 2 at sea (`?ship=1&act=2`) | 373 MB | 129 MB | 231 MB | 128 | 34 k | none |

- The ship adds about 11 MB of texture (its 2048×1024 livery atlas with mipmaps) and about 10.9 k triangles; its
  module builds in about 0.2 s.
- At sea the town is hidden: the static root is invisible, 6 of 61 dynamic groups are drawn (the ship, the sail
  carrier, the ocean), and the frame draws 128 calls and 34 k triangles.
- Entering Act 2 straight from the URL leaves the town's CPU geometry copies in memory until the town has been drawn
  once (the phone tier frees them on the first upload); in play, Act 2 always follows the town.

**Profile check** (`ship-profile.mjs`, against model photo 02 at 0.1226 m/px): port silhouette IoU 0.864 (high) and
0.862 (phone), target 0.85. Starboard (photo 03, a three-quarter view) 0.733, 0.738 at its fitted scale.

**Shots** (`docs/ship/shots/`, 1920×1080, the fallback livery; the nendo renders `*_nendo.png` stay local):

| Act | Beats |
|---|---|
| 1 | `acts_a1_docked`, `acts_a1_docked_night`, `acts_a1_side_port` (compare photo 02), `acts_a1_sendoff`, `acts_a1_sendoff_close`, `acts_a1_tapes_snap`, `acts_a1_kanae`, `acts_a1_kanae_chase`, `acts_a1_baymouth` |
| 2 | `acts_a2_set`, `acts_a2_wait`, `acts_a2_haul`, `acts_a2_haul_night`, `acts_a2_side_stbd` (compare photo 03), `acts_a2_stow` |
| 3 | `acts_a3_laspalmas`, `acts_a3_reefer`, `acts_a3_shimizu`, `acts_a3_home_approach`, `acts_a3_home`, `acts_a3_card` |
| Town UI | `acts_ui_chip` (the boarding chip at the quay), `acts_ui_places` (the places list) |
| Phone | `acts_phone_a1_sendoff`, `acts_phone_a2_haul`, `acts_phone_a2_stow`, `acts_phone_a3_card` |

The side-on comparisons with the photos themselves are `profile-*-ref-sbs.png` and `profile-*-ref-overlay.png`, which
stay local because the photos are copyrighted.

## Real and stylised

Real: her particulars (58.60 m LOA, 9.2 m beam, 486 t, air draft about 21 m), the measured profile, the 舷門 on the
starboard side only, MG1-2112 and 7KFY, the berth on the コの字岸壁 east face, the route under かなえ大橋 with 11.7 m to
spare, 6 kn in the harbour, the 11:00 send-off with five-colour tapes, 福来旗, music and the horn, the 150 km line with
about 3,000 hooks, the ICCAT 30 kg / 115 cm minimum and the Aug–Jan season, Japan's 3,779 t of 43,296 t, −60 °C and about
36 h to the core, the chain Las Palmas → reefer container → Shimizu bonded weigh-in, the homecoming under 大漁旗,
北かつまぐろ屋 海の市店, and IUCN EN → LC in September 2021.

Stylised: time compression (4x in the bay, the set in 40 s), the handling constants, the hull lines between the measured
profile and the beam, the crowd size and tape lengths, the order and weights of the fish, the 900 kg allowance bar (a game
setting, never the ship's real quota), the ocean palette and the hours, the floodlight pools of the night haul, and the
chain cards as flat illustrations. Details: [MODEL.md](MODEL.md) and [acts.md](acts.md).

## Deviations

- **The berth** is the 魚浜町 pier's east face (the send-off ceremony venue), not the fishery-database point north of
  the market; the evidence is in `route.js`.
- **The homecoming** brings her in bow first and lays her port side to the same berth (the send-off has her starboard
  side to it, bow out). This avoids turning a 58.6 m ship end for end in the basin on screen.
- **The haul at night** adds floodlight pools at the 舷門 (hauling often runs to midnight); the cel materials take no
  point lights.
- **Not done in this pass** (from `next-pass-usui.md`): the 80 t allocation on the quota bar, the six-ship fleet line,
  the tag's IC chip and QR wording and the Shimizu inspectors, the 波怒棄館 story pin, and Usui's closing line on the card.
