# 第一昭福丸: the three acts

The playable story of 第一昭福丸 (SHOFUKU MARU No.1, 7KFY) in Kesennuma Living City: the send-off at the コの字岸壁,
fishing Atlantic bluefin by longline, and the true chain that brings the catch to Japan while the ship comes home.
Every rule follows the project's sourced notes on the ship (not included; section 5 and "What this
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

Pass `auto: true` for a hands-free demo (the demo, `?ship=1&auto=1`). It begins the send-off and casts off
after the horn. Once the tapes have snapped it sails Act 1 as the sourced notes tell it, in cuts along the outbound line
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
       SHIMIZU_WEIGH card steps (SHIMIZU_STEPS): inspectors -> chip -> sticker -> truck -> rule
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
| The horn: COLREG Annex III band for a vessel under 75 m (250–700 Hz), prolonged blast 4–6 s | Three prolonged blasts (長音三声) are the game's choice, and so is the toast 「長音三声　別れの汽笛」 / "Three long blasts: the farewell": it reads as a custom of the 出船おくり, but no source in the sourced notes or the 臼福本店 talk gives one. The 296 Hz tone |
| — | The music sting: an original pentatonic tune written for the app. `data/ship/sendoff-music.mp3` (gitignored) plays instead when a local file is supplied. The file is looked for only on local hosts, never in shots or under automation; `?music=local` forces the lookup, `?music=0` turns it off. |
| Her service speed, 12.3 kn (JASNAOE SOY 2020) | 12 kn in the harbour (playtests 2026-10-08; the earlier game pace was 6 kn). Neither the sourced notes nor any cited source gives a 気仙沼 harbour limit (港則法 sets no fixed figure there). |
| ICCAT: no fishing in spawning seasons and on spawning grounds (a slide of the talk (no. 81)); large-scale longliners west of 10°W and north of 42°N only 1 Aug–31 Jan (Rec 22-08); minimum 30 kg / 115 cm; Japan 3,779 t of 43,296 t (8.7 %) | The ocean scene: no coordinates or position, a cold palette and long swells; the hours of the day. The banner never says the real ship is fishing "right now" (the sourced notes supports that for 14 Sep 2026 only, from AIS): inside the Aug–Jan season it says the season is open and she fishes these waters in it every year, otherwise that she fishes them each Aug–Jan season (`oceanNoposKey`) |
| Gear: a line of about 150 km with about 3,000 hooks, floats every 300 m, radio buoys with a red flag and lamp, orange 30 cm floats; set from the stern, haul through the starboard forward 舷門 | Time compression: the set takes 40 s, the soak 9 s, the freeze 7 s. One visual float is drawn per 2.5 km; the HUD counts the real ones. |
| Each bluefin weighed and tagged; bled and spiked at once (神経締め), gills, guts and tail removed (`dressed: true`); −60 °C, about 36 h to the core. The Act 3 art draws the frozen tuna dressed, head on, with a straight cut and no tail fin | The tag text always carries `DEMO-` |
| The catch: 150 kg-class bluefin | The fish come from a seeded queue: mostly bluefin, two undersize bluefin, one bigeye and one albacore. Weights to length use a bluefin relation (a = 3.5e-5, b = 2.878; 30 kg ↔ 115 cm). |
| The tags and the quota belong to bluefin: the ICCAT bluefin catch document (BCD) and Rec 22-08 tail tags are bluefin-only. the talk's item says "every fish is tagged"; the game does not tag the bigeye and albacore | The two other species exist only so the haul has something to release or log; their handling is the game's choice. The haul rule's wording is "different species; the game leaves them out of the bluefin tags and quota", not a claim about real-world tagging of them |
| The chain: Las Palmas → reefer container → the Shimizu landing inspection (`SHIMIZU_STEPS`: about 3 Fisheries Agency inspectors, a reader gun on each chip, the same-number cheek sticker, the trucks on truck scales; 1 kg over the quota costs the licences of all 6 ships, plus fines or prison: the talk notes (not included), item 3); the ship and crew come home under 大漁旗 | The inspection is a flat illustration with numbered badges; the in-game weigh-in still compares the weighed and declared kg (`weighInOk`) |
| The quota bar is the ship's share (sourced notes §5): about 80 t, the minister's allocation to this one ship as the 臼福本店 president said in a public talk on 2026-10-03 (the talk notes (not included), item 2, marked ⚠, so shown as "about"; it fits the 76.3 t MSC catch of 2024). Labelled 「大臣からこの船1隻への配分 約80t（臼福本店の社長, 2026-10-03）」, with Japan's about 3,700 t shared by about 100 boats, 48 on Atlantic bluefin | This set's catch shown as a slice of it |
| Act 2's hours: the set 4–5 h from near dawn (北かつ; a slide of the talk says about 7–8 h, so the set clock label reads "really 4–8 hours"), the soak 2–3 h, a 10–12 h haul that often ends at midnight | The HUD clock runs 05:30 → 10:00 over the set and from 10:00 through the soak (the sky sits at 11:00); the haul is lit at 16:12, or at night in the night variant |
| — | The chain cards are flat canvas illustrations (no photos, no logos); 富士山 behind Shimizu is scenery |
| Facts panel: 486 t (Japanese GT), 58.60 m, completed 2020-02-05 by みらい造船, Starlink, first MSC Atlantic bluefin in 2020 (MSC Japan press release, 2020-08-13, <https://www.msc.org/jp/what-you-can-do/media-centre/press-releases/200813>, and <https://www.usufuku.jp/msc_cert.html>; neither the sourced notes nor `the talk notes (not included)` has it), IUCN EN → LC in **September 2021** (IUCN; the slide's 2022 is wrong), mainly the eastern stock. The facts panel's source line names ICCAT, IUCN, MSC, WCPFC and JASNAOE | — |
| The reefer card's price: in 2020 the first MSC-certified frozen bluefin (one 142 kg GG fish) fetched ¥6,800/kg at the Toyosu auction on 2020-09-01, about ¥3,000/kg above the usual price, about double (みなと新聞, <https://www.minato-yamaguchi.co.jp/minato/e-minato/articles/104423>). It is one auction, not a standing price; ¥3,000 is the premium, not the regular price | — |
| The crew come home to about 45 days' leave after a voyage of 9–15 months, about a year on average (the sourced notes, usufuku.jp; the 臼福本店 talk, the talk notes (not included), item 4) | — |
| The stow card (`ship.stow.note`): 4 blast freezers freezing 10 t a day, and a 523.1 m³ fish hold kept at −60 °C (WCPFC; the sourced notes §2) | The card is a flat illustration of the numbers; nothing in the game is timed by them |
| The bait on the set card (`ship.set.note`): squid, mackerel, horse mackerel, saury and sardine (the sourced notes §5, from 北かつ's 漁法 page and a slide of the talk, which also give the 150 km line and the 10–15 branch lines between floats) | The card lists them; no bait is drawn or counted in the game |
| The homecoming card says she is back about once a voyage for refit at みらい造船 and a crew change (the sourced notes §5: 'about once a voyage for refit (みらい造船, 朝日町) and crew change') | The game shows one homecoming at the end of the chain; it does not model the voyage cadence |
| The bases Kesennuma, Cape Town and Las Palmas (the sourced notes: 3, 3 and 1 of 7 ships; the 臼福本店 talk: 6 now) | — |
| Good Design Award 2020; Ship of the Year 2020, fishing and research vessels (the slide, JASNAOE) | — |
| Starlink, "日本船初" (the slide's words: the first Japanese ship with it) | — |
| 10 October is まぐろの日 (set by the 日本かつお・まぐろ漁業協同組合 in 1986; <https://prtimes.jp/magazine/today/tuna-day/>). The sourced notes never state it | The card pairs the date with 「まぐろの日は北かつまぐろ屋へ」 as the game's closing line |
| She fishes these waters every Aug–Jan season (the sourced notes §5, ICCAT Rec 22-08) | The Act 2 banner's second sentence is a seasonal statement, not a live one: it is gated only by the Aug–Jan date (`oceanNoposKey`), never by position data, and never says she is fishing "right now" |
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
