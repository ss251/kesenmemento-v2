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

Without `?shot`, a URL voyage waits for the viewer to leave the intro card (「まちへ出る」 sets `body.playing`): nothing
boards and the director does not run behind the card, so the send-off, the tapes, the music and the horn are seen.
With `?shot=1&t=S` the beat is entered on the first simulation step and the scene runs S seconds before the frame.

## Playing

- **Act 1:** 出船おくりを始める starts the send-off (tapes, 福来旗, the music sting). Sound the horn (汽笛), then
  もやいを解く. The sail mode takes her out on autopilot. W / S (or the arrows) move the engine telegraph, A / D put
  the rudder over, X stops the engine, Shift holds the 4x time compression, P toggles the autopilot. On a phone, the
  left half of the screen is the stick and a drag on the right half looks around. Touching the controls takes the
  helm; after 8 s idle (under way, against a bank, or stopped by one) the autopilot takes over again. Left bow-on to a
  bank, it backs her off astern before going ahead (`pursue`'s recovery). Arriving boats in her lane step aside to
  their own starboard (up to 25 m) and hold until she has passed. After かなえ大橋, 湾口へ（早送り） skips to the bay mouth.
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
127.0.0.1, ::1 and `*.localhost`, or when the build defines `KLC_NENDO=1`, and off everywhere else. That includes
`*.ts.net`: the captain's public Funnel link is a ts.net host, so tailnet dev uses `?livery=nendo` or `KLC_NENDO=1`.
`scripts/public-mirror.js` DENYs `data/ship/shofukumaru1/*nendo*`, so the public mirror never serves the trace and a
public `?livery=nendo` falls back to the plain livery. With the flag off, the plain fallback livery is painted and nothing under
`data/ship/shofukumaru1/*nendo*` is fetched. The bundle never contains the nendo data, only the file names; it is
fetched at run time from `data/ship/shofukumaru1/` when the flag is on.

**Open decision for the captain.** The nendo livery stays behind this flag; a public deploy is the captain's call.
To make nendo the default everywhere, `resolveFlags` returns `{ nendoLivery: true, source: 'default' }` as its last
line (keeping `?livery=fallback` and `KLC_NENDO=0` as the opt-outs), the flag tests in `test/ship-model.test.js` flip,
the nendo DENY line in `scripts/public-mirror.js` goes, and the deploy publishes `data/ship/shofukumaru1/*nendo*.json`.

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

**Tests.** `bun test`: 652 pass, 24 skip, 1 fail (fix round 1). The one failure is the known `test/v4-explore.test.js`
"matches the committed file" (shared `data/cache` drift from other packages; it predates this branch). The five ship
files (`ship-model`, `ship-sail`, `ship-acts`, `ship-integrate`, and `v3-fix` for the public mirror) are 132 pass, 0 fail.
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
- Fix round 1 re-run (`phonemem.mjs --params livery=nendo`, the ship berthed): heap after GC 130 MB, texture estimate
  231 MB, the ship module 10.95 k triangles in 0.19 s, no page errors besides the dev server's `/api/live` 404. The
  load peak was 422 MB, reached while `explore` builds (the ship module had finished at 283 MB); the table's 377 MB
  run predates the shared `data/cache` drift. The two-faced 大漁旗 and the board backs add no draw call per flag (one
  geometry each) and one merged mesh for the backs.
- Entering Act 2 straight from the URL leaves the town's CPU geometry copies in memory until the town has been drawn
  once (the phone tier frees them on the first upload); in play, Act 2 always follows the town.

**Profile check** (`ship-profile.mjs`, against model photo 02 at 0.1226 m/px): port silhouette IoU 0.864 (high) and
0.862 (phone), target 0.85. Starboard (photo 03, a three-quarter view) 0.733, 0.738 at its fitted scale.

**Starboard livery** (nendo, high tier; fix round 1). Before: X1 and X2 as traced on 03. After: re-mapped and measured
on the real ship (see Deviations, row g).

| Score | Before | After |
|---|---|---|
| WCPFC photo of the real ship, forward of s 44: red / black | 0.001 / 0.09 | **0.750 / 0.297** |
| WCPFC photo, whole side: red / black | 0.03 / 0.17 | 0.632 / 0.295 |
| Photo 03 at its fitted uniform scale (`photoLiveryIoU`): red / black | 0.35 / 0.22 | 0.095 / 0.156 |

The 03 score falls because the nendo model in photo 03 and the real ship disagree at X1: on 03 the red triangle
starts at the foremast and runs aft; on the real ship it straddles the foremast, as port X1 does on 02. The build
follows the real ship. The "before" WCPFC numbers come from the same method run on the previous marks
(scratch script); the "after" numbers are the tool's own (`wcpfcIoU`, overlay
`shots/profile-starboard-nendo-high-wcpfc-ref-overlay.png`, local only). Black stays low because the photo's thin
lines and the dark open foredeck count as black.

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
spare, the 11:00 send-off with five-colour tapes, 福来旗, music and the horn, the 150 km line with
about 3,000 hooks, the ICCAT 30 kg / 115 cm minimum and the Aug–Jan season, Japan's 3,779 t of 43,296 t, −60 °C and about
36 h to the core, the chain Las Palmas → reefer container → Shimizu bonded weigh-in, the homecoming under 大漁旗,
北かつまぐろ屋 海の市店, and IUCN EN → LC in September 2021.

Stylised: 6 kn in the harbour (a harbour pace chosen for the game; no harbour limit for 気仙沼 is sourced, and her
service speed is 12.3 kn), time compression (4x in the bay, the set in 40 s), the handling constants, the hull lines between the measured
profile and the beam, the crowd size and tape lengths, the order and weights of the fish, the 900 kg allowance bar (a game
setting, never the ship's real quota), the ocean palette and the hours, the floodlight pools of the night haul, and the
chain cards as flat illustrations. Details: [MODEL.md](MODEL.md) and [acts.md](acts.md).

## Deviations

### From the dossier's numbers

| | Dossier | Build | Which is right | Evidence |
|---|---|---|---|---|
| a | Rudder and propeller at s 56–58 (§3) | Propeller s 51.9; rudder s 53.4–55.0 | The build | On photo 02 the propeller hub is at x ≈ 577 px: (577 − 158) × 0.1226 = s 51.4. The dossier row is wrong. |
| b | Keel −3.54 (design draft), measured "32 px, ≈ 3.9 m" (§3, §8) | Keel 4.05 m forward, 4.25 m amidships (`keelModel`), 4.5 m at s 46 | The build, as a model of the photo | Column profiles of photo 02 put the keel edge 34–35 px under the y 291 waterline from s 11 to 44 (4.17–4.29 m), 36 px at s 47 (4.5 m). Overlay: `shots/profile-port-keel-ref-overlay.png` (local only). Her in-game draft is therefore 0.5–1 m more than the 3.54 m design draft. The dossier's 32 px stops about 2 px short of the keel edge, where the column profiles fall from about 200 to under 10 (difference from the background). |
| c | Port star circle centre (46, 3), r ≈ 2.4 (§4) | Centre (47.21, 4.30), r 2.70 | The build | A least-squares circle fit to the red segment's outer edge on 02 (rms 0.04 m), `livery-nendo-marks.json` `method.circles`. |
| d | Bulb nose s ≈ 2.3 (§3) | s 1.95 | Either (within the ±0.5 m the dossier gives) | Measured on 02 at the bulb's foremost point. |
| e | Bridge roof ≈ 10.9 (§3) | Roof 10.0, rail top 10.9 | The build | The 10.9 m the dossier reads is the top of the roof railing on 02; the roof deck is 0.9 m under it. |
| f | Usufuku crest "on the front" of the funnel (§3) | On both side faces of the funnel | The build | designboom-1800 shows the 違い山星一 crest on the funnel's side face. |
| g | Starboard livery traced on 03 (§4): X1 at s 17–21, X2 band at s 40.4–42.0, bow wedge s 0.1–6.8 | 03 trace re-mapped through measured anchors; X1 red s 9.2–16.1 on the sheer, vertex (12.7, 1.85), black s 10.5–14.5; X2 band from s 37.1–38.5 at the sheer to 40.5–42.4, black foot 40.6–42.4; bow wedge s −0.6–3.3; hull name s 5.4–8.9 | The build | 03 is a three-quarter view traced at one uniform 0.1266 m/px, which stretches the near bow (the foremast reads 16.6 m, not 14.2). The X1/X2 positions come from the WCPFC photo of the real ship through a projective fit on six anchors (residuals ≤ 0.7 m). Scores above. |
| h | コの字岸壁 at 38.901 N, 141.580 E (§6, the fishery DB point of the 出漁準備岸壁) | The 魚浜町 pier's east face | The build | That coordinate is the 港町 出漁準備岸壁 north of the market, a different quay. The つばき会 page names the venue 「気仙沼市魚浜町コの字岸壁（セレモニー会場）・港町出港岸壁」; `route.js` holds the evidence. The §6 point was deliberately not used. |

Open, not changed in this round: the WCPFC photo puts the starboard star circle about 1 m forward of the 03-derived
centre (s ≈ 50.2 against 51.0), and the 03 fit puts the 舷門's forward edge near s 21.4 against the dossier's 22.8.
Aft of the radar mast the WCPFC anchors are centreline masts and a rounded stern, too uncertain to move either.

### Other choices

- **The berth** is the 魚浜町 pier's east face (the send-off ceremony venue), not the fishery-database point north of
  the market; the evidence is in `route.js`.
- **The homecoming** brings her in bow first and lays her port side to the same berth (the send-off has her starboard
  side to it, bow out). This avoids turning a 58.6 m ship end for end in the basin on screen.
- **The haul at night** adds floodlight pools at the 舷門 (hauling often runs to midnight); the cel materials take no
  point lights.
- **Not done in this pass** (from the captain's next-pass notes, kept out of git): the 80 t allocation on the quota bar, the six-ship fleet line,
  the tag's IC chip and QR wording and the Shimizu inspectors, the 波怒棄館 story pin, and Usui's closing line on the card.
