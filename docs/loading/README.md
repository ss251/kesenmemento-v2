# The title (v4)

The first thing every visitor sees, on an iPhone in Safari or on a desktop. v3 was a design comp (not included); v4 (2026-10-07) keeps v3's letterforms and its drop/sea/leap motion and redesigns everything around them. It is built to `docs/CRAFT.md`.

**What you see.** The town is the hero: a poster of it from the hero drone (`428,126,130 > 56,-18,-174`), chosen by the clock in Kesennuma (JST): 朝, 昼, 夕方, 夜, and then the live town. A vignette, a light 鉄紺 scrim behind the corner controls and a 紺→鉄紺 scrim under the bottom third seat the UI on it; the sky stays clear. The wordmark 「ケセン／メメント」 (sun variant, 山吹 on top) sits top-centre with a soft 鉄紺 halo; its カツオ is drawn like the letters (生成り keyline, 紺 line, 藍 back, 生成り belly). A tip bar shows one of 21 sourced まめ知識 (its pager inline, its source in the page's language). A thin gauge carries the logo's カツオ. At 100 % the gauge fades and the prompt rises: TAP TO START on a touch screen, CLICK TO START with a mouse (「タップ／クリックしてスタート」 under it), between two 山吹 ◆; Enter starts too. A tap plays ポン, the title leaves, and the camera flies into the town.

The corner controls are a sound button (off until tapped, remembered in `localStorage` `klc.titleSound`) and 日本語 / EN, in one material at one height (44 px). The footer is one 11 px line, `© 2026 KesenMemento · Ver. 2.0 · 地図 © 国土地理院・OpenStreetMap` (two lines on a phone).

## The v4 system

- **One material** for the corner controls, the tip bar and the notice: 生成り glass at 92 % (solid under `prefers-reduced-transparency` and `prefers-contrast: more`), a 1 px 紺 hairline at 12 %, one soft shadow (`--glass`, `--hair`, `--lift`).
- **One radius**, `--r` = 22 px; inner radii are concentric (the language pill's segments are 18 px).
- **Layouts.** Phone portrait: the mark at the top (84 % of the width), and a bottom stack of the tip bar, the gauge or the prompt, the footer. ≥ 600 px wide: the stack centred. Desktop (≥ 1100 × 561): a grid on one baseline, the tip bar bottom-left, the prompt or gauge bottom-centre, the mark at 32 % of the width (≤ 600 px, ≤ 58vh) with its optical centre at 29 %. A short landscape screen: one row (the tip bar, the prompt). Every edge-attached element honours `env(safe-area-inset-*)`; `?chrome=1` models an iPhone's insets in both orientations.
- **Motion.** The prompt rises 8 px and fades in (300 ms, ease-out), then breathes (opacity 1 → .6, 1.6 s each way). A press is scale .97 (120 ms); the tap closes the two ◆ on the words. Reduced motion: fades only, nothing loops.
- **Focus.** main.js focuses the prompt for a fine pointer, and browsers draw that as `:focus-visible`; the ring therefore follows the last input (`html[data-kbd]`): any key but Enter shows it, a pointer hides it.
- **Input wording.** `html[data-input]` (`touch` for `(pointer: coarse)`, else `mouse`) is set in the head before the first paint and kept in step by title-boot.js; `?input=touch|mouse` pins it for a capture.

## Files

| Path | What |
|---|---|
| `src/anime/index.html` | the markup. Regions between `<!--klc:NAME-->` are generated |
| `src/anime/ui/loader/loader.css` | the stylesheet (source of `<style id="klc-loader-css">`) |
| `src/anime/ui/loader/title-motion.js` | the sequence as `frame(t)`, ported from the comp |
| `src/anime/ui/loader/title-boot.js` | language, the tip pager, the fish, the clock, the sound button, the failure notice |
| `src/anime/audio/title-sfx.js` | every sound, synthesised. Off until the first gesture |
| `src/anime/ui/loader/sky.js` | the sky, and `posterForQuery` (the poster slot) |
| `src/anime/core/loadbar.js`, `loadplan.js` | real progress. The number, the solid fill and the runner show the completed mark; a faint working layer creeps ahead of it ("The gauge" below); `?capture=1` does not animate it |
| `scripts/anime/loader-inline.js` | writes the generated regions into index.html |
| `tools/anime/title-logo.mjs`, `glyphs.py` | the logo generator. Output is pinned by `test/title-logo.test.js` |
| `src/anime/assets/loader/title-logo-sun.svg`, `title-logo-sea.svg` | the marks (Dela Gothic One outlines; no font file for the logo) |
| `src/anime/assets/loader/zen-maru-700.woff2`, `zen-maru-900.woff2`, `dela-gothic-one.woff2` | subsets, made by `tools/anime/loader-fonts.py` from the title's own text (it also rewrites the `@font-face` ranges). Licence: `THIRD-PARTY-NOTICES` |
| `src/anime/assets/loader/poster-phone-*.avif`, `poster-desktop-*` | the four hours, phone 1179×2556 and desktop 2560×1440 |
| `data/loading-tips.json` | the tips, each with its source in Japanese and English (`source.title_en`) |

## First paint

The CSS, the sun logo, the tips and the motion clock are in the HTML. Zen Maru Gothic and the small Dela subset are preloaded WOFF2. The Google Fonts stylesheet stays `media="print"` so the HUD can use the full family; `window.__klcFonts` is unchanged. A poster hour is set on `<html data-t>` by a script in the head, before the first paint.

## The poster and the live world

`posterForQuery` maps the JST hour to asa (5–10), hiru (10–15), yugata (15–19) or yoru. `?poster=` pins it. `?sky=` names map onto the same four. The world starts at that slot's hour unless `?hours=` or `?preset=` is set. When the first frame is drawn, `body.klc-live` fades the poster out over 600 ms. The camera is the landscape drone on every aspect, so the poster and the live view share a field of view.

## Motion and sound

The intro runs once from first paint; the idle loops. Time is `performance.now()`, so a slow frame does not stretch the sequence. At 100 % the prompt replaces the gauge on the comp's timeline. A tap sets the exit, then `window.__titleFly` moves the camera and `start()` shows the HUD. Reduced motion: no drop, bob, slosh, leap or sweep; fades are at most 200 ms, and the fly is skipped.

Sound is off by default. The ♪ button creates the AudioContext on that gesture. Intro cues follow the motion clock (from the current moment if sound is turned on mid-intro). The koto sting plays when loading completes. ポン and the whoosh play on tap.

`?capture=1` exposes `window.__T` and paints a single frame (`?tframe=`, `?tap=`, `?p=`). The old title film showed a standing figure and is not in the tree; regenerate it with メメ.

## The gauge

One mark, said every way. A mark is the last stage of the load that has **completed** (the weights and labels are `core/loadplan.js`; `main.js` calls `set(mark, label, { to, ms })` as each stage begins). `core/loadbar.js` does all of it in that call:

- **The number** (`#ld-pct`) is `round(mark * 100)`, written by `set()` itself. No frame has to run for it, and nothing else writes it while the page loads (the title clock does only for a pin `?p=`, the comp's ramp and `?capture=1`).
- **The solid fill and the runner** ease to the mark over 420 ms (`MARK_MS`) and stop. They never go past it, so the bar is never ahead of the number. Both are Web Animations of `transform`: the compositor runs them while a long step blocks the thread.
- **The working layer** (`#ld-work`, behind the fill, 山吹 at 38 %) is where the wait shows. It eases to the mark, then creeps linearly toward `creep.to` over `creep.ms` (the stage's expected time on this device), also on the compositor, so a 2 to 20 s step still shows life, like a buffered bar. It carries no number, the fill never follows it, it never retreats, and under `prefers-reduced-motion` it stays on the mark, unseen.
- **The runner swims in place** all through the load (`klc-swim`: a bob and a wag about the tail, a transform animation on its own box; slower while `.ld-idle`, off under reduced motion and in a capture). It is the logo's カツオ.
- **Idle.** When the creep has run its course and the stage is still going, the root gets `.ld-idle` (the swim slows). Nothing moves forward and nothing is invented. The next `set()` ends it. `aria-valuenow` is the mark.

Why it is built this way: the first v4 gauge moved the fill and the runner on the compositor through every long step, and wrote the number from a per-frame script, which freezes while the thread is blocked. Recorded on an iPhone 13 (Mobile Safari, iOS Simulator, 2026-10-08), the number stood at 10 % while the bar crept from 5 % to 15 %, and showed 75 % for 3.5 s while the bar sat at 95 % with the runner at its end.

Proof: `tools/anime/loader-gauge-proof.mjs` loads the page on a 393 × 852 viewport with the CPU throttled 6x, records the compositor's own picture (a CDP screencast), READS the number and MEASURES the fill's edge from the frames, and counts the frames in which they differ by more than 3 points. It draws strips like the one that showed the bug (a row every 250 ms, a marker where the main thread was blocked). Run it from a worktree of main for the "before", from the branch for the "after".

Measured 2026-10-08, the real build's cold load on that viewport at 6x (the phone tier, the same stages as the iPhone's): on main (8882864) 310 of 450 settled frames show a number and a fill more than 3 points apart, 309 of them while the thread was blocked, the worst by 20.7 (10 % under a fill at 31 %); with this change 0 of 810 (805 of them through blocked stretches), the worst by 1.5 (the runner's wag), and the number is only ever the latest mark or, until a frame can paint the new one, the mark before it. The strips, the audits and the screenshots are not included (`loadbar-honest-before-strip.png`, `loadbar-honest-after-strip.png`, `loadbar-honest/`).

One thing the strips show: the last stage (compile, then the work `main()` does after `build()`) holds 99 % for as long as it takes (5.8 s at 6x), and the 100 % reaches the glass only when that task ends, with the hand-over to the prompt right after. The old number already said 100 % through the same stretch (3.9 s at 6x on main), before the prompt came. Weighting `compile` for a phone in `core/loadplan.js` (it is 3 of 334 and takes about 4.5 s on the iPhone) is what would shorten the 99 %.

## The hand-off

There is no iris and no wave. The logo, header, card and footer leave by opacity and transform, as in the comp. `body.playing #intro` is a safety net: `klc-gone` 1.2 s later.

## When the load cannot go on

The notice and 「もう一度読み込む」 are unchanged: the script failed, the browser is offline, or nothing has moved for 30 s. The button is 44 px.

## Query flags

`?lang=en|ja`, `?poster=`, `?sky=`, `?p=` (pin the gauge), `?capture=1`, `?tframe=`, `?tap=`, `?tip=` (1-based), `?chrome=1` (the comp's 59/34 safe areas, for side-by-side shots), `?shot=1` hides the loader, `?force` ignores reduced motion.

## Tools

```
env -u NODE_OPTIONS bun tools/anime/title-logo.mjs
env -u NODE_OPTIONS bun scripts/anime/loader-inline.js
tools/anime/gate.sh chrome --fg env -u NODE_OPTIONS bun tools/anime/loader-keyart.mjs --set title-phone --port 9437
tools/anime/gate.sh chrome --fg env -u NODE_OPTIONS bun tools/anime/loader-gauge-proof.mjs --port 9572 --label after   # the gauge through the stalls (strips, audit)
swiftc -O tools/anime/webkit-shot.swift -o /tmp/webkit-shot
```

## Tests

`test/loader.test.js` (first paint, the craft rules, the sky, the bonito, the progress: the number is `round(mark * 100)` right after `set()`, the solid fill never targets past the mark, the working layer targets `creep.to`, reduced motion means no creep; who owns the number; the gauge's markup and stylesheet; the tips, the notice). `test/title-logo.test.js` (the generator matches the committed SVGs). `test/ui-b.e2e.test.js` row 8 (short landscape, no standing figure, no iris).

## Rules this screen keeps

Nothing on this screen matches `SENSITIVE` in `scripts/anime/enrich/fold.js`. The runner is our カツオ. No Google or third-party photos. Every tip has a source.

Two sizes in the comp are off the craft sheet, and the comp wins: the header buttons are 36 px and the pager buttons are 22 px. `#go` and `#ld-retry` stay at least 44 px. The credit's corner radius is 3 px. The status line keeps the comp's space in 「まちを よみこんでいます」.
