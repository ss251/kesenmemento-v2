# 第一昭福丸: the three acts

The playable story of 第一昭福丸 (SHOFUKU MARU No.1, 7KFY) in Kesennuma Living City: the send-off at the コの字岸壁,
fishing Atlantic bluefin by longline, and the true chain that brings the catch to Japan while the ship comes home.
Every rule follows the captain's dossier ([shofukumaru-dossier.md](shofukumaru-dossier.md), section 5 and "What this
means for the three acts"). Marker in code: `[ship:acts]`.

## Files

| File | Role |
|---|---|
| `src/anime/world/ship/acts.js` | The act state machine. Pure and serialisable (`snapshot()` / `createActs(snapshot)`), with guards and events. Also the rules (`RULES`), the deterministic catch (`makeCatch`), the season check (`seasonOpen`) and the Shimizu weigh-in (`weighIn`). |
| `src/anime/world/ship/tags.js` | `formatTag(n, yy)` → `DEMO-7KFY-26-0001`, `isDemoTag`, `REAL_TAG_RE`. A demo tag can never match the real form `7KFY-20-0001`. |
| `src/anime/world/ship/sendoff.js` | Act 1 at the quay: the crowd (life's character kit), the five-colour tapes, 福来旗, the horn and the music sting. |
| `src/anime/world/ship/ocean.js` | Act 2: the stylised North Atlantic. It hides the town while shown, builds the swell, buoys, floats and line, and sets up the hauling station at the starboard 舷門 (line hauler, scale, freezer hatch) and the fish. |
| `src/anime/world/ship/chain.js` | Act 3: the chain steps, the card models, flat canvas illustrations, and 北かつまぐろ屋 海の市店 with its camera link. |
| `src/anime/world/ship/voyage.js` | The director. It runs the machine and the scenes, hands Act 1 to the sail mode (`explore/sail.js`), owns the camera when no other mode does, and feeds the UI. |
| `src/anime/ui/ship.js` | The UI: act titles, the HUDs, the haul controls, the chain cards, the final card and the facts panel. Japanese by default, English on the toggle. |
| `data/ship/i18n.json` | Every ship string in JA and EN (`data/i18n.json` belongs to other packages). |
| `test/ship-acts.test.js` | Tests for the tags, the machine, the release rule, the quota stop, the Act 3 order, i18n, the pure scene parts and the phone budget. |
| `tools/anime/ship-acts-shots.mjs` | Headless shots of every act through the machine gate (the real app; the `ship` world module exposes the hooks). |

Wiring: the `ship` world module (`src/anime/world/ship/index.js`, see [README.md](README.md)) does this at load:

```js
import { createVoyage } from './ship/voyage.js';
import * as ROUTE from './ship/route.js';
const voyage = createVoyage(ctx, { ship, sail, route: ROUTE, livery: flags.nendoLivery ? 'nendo' : 'fallback' });
voyage.start();   // from the boarding chip or the places list; voyage.exit() returns to town
```

Pass `auto: true` for a hands-free demo (the mayor demo, `?ship=1&auto=1`). It begins the send-off and casts off
after the horn. Once the tapes have snapped it sails Act 1 as the dossier tells it, in cuts along the outbound line
(`TIMING.auto*` in voyage.js): 12 s past the 出漁準備岸壁 and market rows (from s 330), then 220 m before かなえ大橋
until she has passed under it, then 150 m before 商港 (just past みらい造船) until she has passed it, and only then on
to the bay mouth. At BAY_MOUTH `acts.data.passed` is `['kanae', 'shoko']` (tested). The manual 湾口へ（早送り）button
also sends the 商港 PASS, with its toast, before it jumps. In Act 2 the demo decides each fish by the rules (an
undersize fish is tried, refused and released) and turns the cards. The player can stop it at any point.

**Cameras.** While the sail mode is active, its chase camera is used. Otherwise the director places the camera from
rigs in the ship's frame: the quay view from behind and above the stern (`berth`, `sendoff`, `home`), the crowd at the
quay edge (`crowd`), the bay mouth (`bay`), the ocean stages (`set`, `wait`, `haul` level with the starboard 舷門,
`stow`), and the side-on comparison views (`side` = starboard, `sidePort`).

## The machine

```
ACT 1  DOCKED -START-> SENDOFF -CAST_OFF[horn sounded]-> DEPART -REACH_BAY_MOUTH[passed under かなえ大橋]-> BAY_MOUTH
ACT 2  -TO_OCEAN[season open]-> OCEAN_SET -SET_DONE[150 km set]-> WAIT -WAIT_DONE[>= 2 h]-> HAUL -> STOW -STOW_DONE[36 h]->
ACT 3  TRANSSHIP_LAS_PALMAS -NEXT-> REEFER -NEXT-> SHIMIZU_WEIGH -NEXT[no kg over the declaration]-> HOMECOMING -NEXT-> CARD
```

- **Data events** don't change the state: `HORN`, `TAPE_SNAP`, `PASS {what: kanae|shoko}`, `SET_PROGRESS {km}`,
  `WAIT_PROGRESS {h}`, `FISH_UP`, `FREEZE_PROGRESS {h}`.
- **Haul:** `KEEP` is refused with `undersize` for a bluefin under 30 kg (the fish stays on the scale and must be
  released), and with `quota` when the fish would push the landed weight past the ship's share (`allowanceKg`).
- **Haul ends** (an automatic move to STOW) when the share has no room for a legal bluefin, after a quota refusal,
  or when the line is in. With the ship's share at 80 t a single set never fills it, so the line comes in; the quota
  stop is kept as a rule (tested with a small `allowanceKg`).
- **Illegal events** return `{ ok: false, reason: 'illegal' }` and change nothing.

## What is real and what is stylised

| Real (sourced) | Stylised (the game's choice) |
|---|---|
| Send-off at the コの字岸壁 around 11:00 with five-colour tapes, 福来旗, the captain's music and the horn (北かつ, つばき会) | The crowd's size; the tape roll lengths (they snap between about 10 and 45 m); the five colours (red, yellow, green, blue, pink) |
| The horn: COLREG Annex III band for a vessel under 75 m (250–700 Hz), prolonged blast 4–6 s | Three prolonged blasts (長音三声, the farewell salute); the 296 Hz tone |
| — | The music sting: an original pentatonic tune written for the app. `data/ship/sendoff-music.mp3` (gitignored) plays instead when the captain supplies it. The file is looked for only on local hosts, never in shots or under automation; `?music=local` forces the lookup, `?music=0` turns it off. |
| Her service speed, 12.3 kn (JASNAOE SOY 2020) | 6 kn in the harbour: a harbour pace chosen for the game. Neither the dossier nor any cited source gives a 気仙沼 harbour limit (港則法 sets no fixed figure there). |
| ICCAT: no fishing in spawning seasons and on spawning grounds (Usui's slide 81); large-scale longliners west of 10°W and north of 42°N only 1 Aug–31 Jan (Rec 22-08); minimum 30 kg / 115 cm; Japan 3,779 t of 43,296 t (8.7 %) | The ocean scene: no coordinates or position, a cold palette and long swells; the hours of the day |
| Gear: a line of about 150 km with about 3,000 hooks, floats every 300 m, radio buoys with a red flag and lamp, orange 30 cm floats; set from the stern, haul through the starboard forward 舷門 | Time compression: the set takes 40 s, the soak 9 s, the freeze 7 s. One visual float is drawn per 2.5 km; the HUD counts the real ones. |
| Each bluefin weighed and tagged; bled and spiked at once (神経締め), gills, guts and tail removed (`dressed: true`); −60 °C, about 36 h to the core | The tag text always carries `DEMO-` |
| The catch: 150 kg-class bluefin | The fish come from a seeded queue: mostly bluefin, two undersize bluefin, one bigeye and one albacore. Weights to length use a bluefin relation (a = 3.5e-5, b = 2.878; 30 kg ↔ 115 cm). |
| Bigeye and albacore are not covered by the bluefin tags or quota | — |
| The chain: Las Palmas → reefer container → Shimizu bonded weigh-in (1 kg over loses the licence); the ship and crew come home under 大漁旗 | — |
| The quota bar is the ship's share (dossier §5): about 80 t, the minister's allocation to this one ship as Usui said in his public talk on 2026-10-03 (the captain's notes mark it ⚠, not yet confirmed in writing; it fits the 76.3 t MSC catch of 2024). Labelled 「この船1隻への配分 約80t（臼井社長, 2026-10-03）」 | This set's catch shown as a slice of it |
| Act 2's hours: the set 4–5 h from near dawn, the soak 2–3 h, a 10–12 h haul that often ends at midnight | The HUD clock runs 05:30 → 10:00 over the set and from 10:00 through the soak (the sky sits at 11:00); the haul is lit at 16:12, or at night in the night variant |
| — | The chain cards are flat canvas illustrations (no photos, no logos); 富士山 behind Shimizu is scenery |
| Facts panel: 486 t (Japanese GT), 58.60 m, completed 2020-02-05 by みらい造船, Starlink, first MSC Atlantic bluefin in 2020, IUCN EN → LC in **September 2021** (the slide's 2022 is wrong), mainly the eastern stock | — |
| 北かつまぐろ屋 海の市店, 魚市場前7-13 (OSM node 7181952808, layout place `p1m5usud`) | The card's camera link (`?cam=452,38,742>389.7,6,675`); no discount promise |

## Phone budget

`sendoff.js BUDGET` and `ocean.js BUDGET` hold the limits per tier.

- **Phone tier:** 6 people, 18 tapes, 3 flags; a 40 × 40 swell grid over 600 m; 14 floats; 256 px textures.
- **Never stacked:** the ocean is built when Act 2 starts and freed when it ends. While it is shown, every world
  group is hidden (`hideWorld` / `showWorld`). The crowd is freed after the bay mouth.

## Tests and shots

```sh
env -u NODE_OPTIONS bun test test/ship-acts.test.js
tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/ship-acts-shots.mjs --port 8963 --out shots/ship-acts/a
tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/ship-acts-shots.mjs --port 8963 --auto 1 --out shots/ship-acts/a
tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/ship-acts-shots.mjs --port 8963 --q phone --w 390 --h 844 --out shots/ship-acts/p
```

The first command shoots every act from a jump: the machine is fast-forwarded legally, then that scene is entered.
`--auto 1` sails the whole hands-free voyage and shoots each state as it is reached; it fails unless the voyage
reaches CARD with no page error. The tool shoots the real app (`src/anime/index.html`) with every world module;
the `ship` module puts the real `ship/shofukumaru1.js` model in the sail mode (the nendo livery by default on every
host; `--livery fallback` for the opt-in plain livery).

The shots go to `shots/ship-acts/` (gitignored): every act, plus side-on views to compare with the model photos
(`a1_side_port` with photo 02, port; `a2_side_stbd` with photo 03, starboard).
