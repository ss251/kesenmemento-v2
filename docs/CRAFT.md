# KesenMemento ものづくり基準: the craft standard

> 「Japan means extreme importance to detail and craftsmanship; we need to bring that in everything that we do for KesenMemento.」
> (the owner, 2026-10-07)

神は細部に宿る: every pixel, word, frame and millisecond is a deliberate choice. Together with *boil the ocean*, this is the bar for everything we ship.

- Finish it, test it, document it.
- The answer is the finished product, not a plan.
- Aim for work the owner is genuinely impressed by, not politely satisfied with.

**How to use this document:**
- Check every change (code, art, copy, docs) against it before it is shown or merged.
- End every report with the 出荷前チェック (§8), with its screenshots.
- If a rule is in your way, say so and propose a better one. Never skip it silently.

## 1. 色: colour

- **Brand surfaces** (title, loader, sheets, cards, the HUD's chrome) use the traditional Japanese palette. Values are from 和色大辞典 (colordic.org); check any new colour against it, and name it in a code comment.

  | Name | Hex | Role |
  |---|---|---|
  | 藍色 | `#165E83` | sea, primary |
  | 紺色 | `#223A70` | night, deep surfaces |
  | 鉄紺 | `#17184B` | darkest surfaces |
  | 浅葱色 | `#00A3AF` | accent, links |
  | 勿忘草色 | `#89C3EB` | day sky |
  | 東雲色 | `#F19072` | dawn |
  | 山吹色 | `#F8B500` | highlight, gold |
  | 茜色 | `#B7282E` | seal, alert |
  | 生成り色 | `#FBFAF5` | paper, light text |
  | 墨 | `#595857` | secondary text |

- **No borrowed brand palettes.** We once copied G123's charcoal and lime from a reference screenshot; never again. A reference shows *what quality feels like*, never *what our brand is*.
- **The 3D world** keeps each thing's own colour. Light is painted per time of day; the frame is never filtered.
  - No full-frame tint, grain or haze.
  - Shadows are grey with a slight hue: cool where they face the sky, warm where they face the ground.
  - Distance softens contrast and saturation toward the sky.
  - Bloom goes on emissives only.
  - (Background: the art-direction study, 2026-10-07.)
- **Text contrast** is at least 4.5:1 for body text and 3:1 for large text. Measure it on the real backdrops: day sky, sea, night.

## 2. 文字: typography and Japanese typesetting

- **Japanese first.** One display face and one text face per surface, at most three weights loaded. Latin and digits come from the same family or a matched one.
- **Punctuation.** In Japanese text, use full-width punctuation (、。「」『』！？・ー), half-width digits and half-width Latin. Never full-width digits in the UI.
- **Spacing.** No spaces between Japanese words or before punctuation (「町並みを準備中…」, never 「町並み を準備中…」). One rule for Latin inside Japanese, used everywhere: a normal space around Latin words (KesenMemento で遊ぶ, iPhone で撮影) and none around digits (10月10日, 3分).
- **禁則 (line-breaking rules).** No line starts with 、。」）ー.
  - Use `line-break: strict`.
  - Headings get `word-break: auto-phrase` and `text-wrap: balance`; body text gets `text-wrap: pretty`.
  - **Never add `keep-all` as a fallback for `auto-phrase`.** WebKit (Safari and every iPhone browser) has no `auto-phrase`, so the `keep-all` wins there, and `keep-all` stops all breaks between Japanese characters: text runs out of its box. Without it, WebKit breaks normally under `line-break: strict`, which still keeps the 禁則.
  - Use `keep-all` only together with explicit `<wbr>` at phrase boundaries (hand-set copy), or `white-space: nowrap` for a short label that must not break.
  - Check wrapping in WebKit (tools/anime/webkit-shot.swift), not only in Chrome: Chrome has `auto-phrase` and hides the problem.
  - A heading never leaves a single character alone on a line.
- **Rhythm.** Japanese body line-height 1.6–1.8, headings 1.3. `font-feature-settings: "palt"` on headings only.
- **Integrity.**
  - No faux bold or italic, and no stretched type.
  - No text on top of the walker.
  - Kid-facing copy avoids hard kanji, or gives them ruby.

## 3. 余白とかたち: spacing, shape, layout

- **4 px grid.**
  - Spacing: 4 / 8 / 12 / 16 / 24 / 32 / 48.
  - Radii: 8 / 12 / 16 / 22, one per component class.
  - One shadow or glass recipe per elevation.
- **Touch targets** are at least 44×44 pt.
- **Safe areas:** every element attached to a screen edge honours `env(safe-area-inset-*)`, in portrait and landscape. Nothing sits under the home indicator or the Dynamic Island.
- **No layout shift** after first paint, and no horizontal scroll. Truncation only by design, with an ellipsis.

## 4. 動き: motion and feel (手触り)

- **Frame budget:** a steady 60 fps.
  - p95 ≤ 16.7 ms, and no frame over 50 ms while the player is acting.
  - The simulation steps at a fixed rate and rendering interpolates between steps; nothing moves by raw frame time.
  - Hitches are bugs: shader compiles, streaming spikes, garbage-collection pauses.
- **Motion tokens:**
  - Durations: 120 ms press, 200 ms small, 280 ms sheet, 400–600 ms scene transitions.
  - Curves: ease-out to enter, ease-in to exit, springs for direct manipulation.
  - Animate only `transform` and `opacity`.
- **Feedback:** every input answers within one frame (a press state, and sound where it belongs). No dead taps, no tap-through, no double-tap zoom.
- **Reduced motion:** `prefers-reduced-motion` is honoured everywhere. Motion becomes a fade, or nothing.
- **Sound:** gentle, never startling. It respects the mute switch and starts only after a gesture.

## 5. 世界: the 3D world

- **Real places at real scale.** Use official kanji and readings for every name. Signage is natural Japanese and crisp at phone resolution.
- **Nothing broken:** no z-fighting, texture seams, floating or sunken objects, clipping through walls, popping within 50 m, or flickering shadows. Check the hero routes (the inner-bay walk, the drive, the drone pass) in every time preset and season.
- **People:** townspeople and characters never resemble real individuals, and no face comes from a real photo.
- **Interiors** are modelled from references the owner has consented to, and credited in place (協力: …).

## 6. 言葉: copy

- **Japanese reads like a professional Japanese copywriter wrote it:** natural, warm, concise.
  - One register per surface: です・ます in the UI, a friendly plain style only where we speak to children.
  - The glossary (`docs/GLOSSARY.md`, kept by the craft pass) holds every recurring term (写真モード, まちへ出る, 地名ラベル, …), the same in the UI, the docs and anything public.
- **English** carries the same meaning, plain and short.
- **Facts** (まめ知識, place notes, tips) each carry a source in their data file. No guesses.
- **Content rules:**
  - The town is shown as the living place it is today. No text may match `SENSITIVE` in `scripts/anime/enrich/fold.js`.
  - No third-party characters or logos. The walker is original to this project.
  - No Google Maps, Street View, listing or other third-party photos.

## 7. おもてなし: hospitality

- **First visit:** a phone visitor understands what to do within three seconds. The next action is always obvious, and there are no dead ends.
- **Waiting** is honest and pleasant: real progress and tips, never stuck at 99 %.
- **Errors** are polite and specific, and offer a way forward, in Japanese and English.
- **Slow or no network:** graceful, with a clear message. Nothing fails silently.
- **The kids' link** (`?src=chirashi`): no purchases, no personal data, and kind language.
- **Accessibility:** a visible focus ring, labels for screen readers in Japanese and English, and colour never as the only signal.

## 8. 出荷前チェック: the pre-ship checklist (paste into every report)

- [ ] **Looked at it** on:
  - iPhone portrait 393×852 @3x and landscape 852×393;
  - desktop 1600×900 and a Retina size;
  - Japanese and English; day and night; reduced motion.

  Screenshots: `<path>`.
- [ ] **Copy:** Japanese punctuation and spacing, 禁則, glossary terms, the English mirror.
- [ ] **Measured:**
  - frame time p50 / p95 / p99, and hitches over 50 ms = 0;
  - phone texture ≤ 240 MB;
  - console errors = 0.
- [ ] **Tests:** unit tests, plus every e2e suite the change touches (ship-pad, hud-sync, ui-b, ui-b2, mobile-pad, qa3), are green, with known failures named.
- [ ] **Visual regression** against main: no unintended differences, or each one listed.
- [ ] **Docs** updated, facts cited, credits correct.
- [ ] **Clean up:** nothing left running, no stray files.
- [ ] **Would a Japanese craftsperson sign this?** If not, fix what is missing, or list it.

## 9. Who checks

1. The author runs §8 before reporting.
2. The coordinator looks at every visual before it reaches the owner.
3. The owner judges the taste: a thing that passes every gate but does not look clearly better to him does not ship.
