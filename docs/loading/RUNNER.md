# The runner slot: our bonito today, ホヤぼーや the day the city approves

The runner is the progress head that rides the crest line (`src/anime/ui/loader/sprite-runner.js`, `src/anime/assets/runner/runner.json`). It is a strip of equal frames stepped with a CSS `transform` (compositor only, keeps running while the thread is busy) inside a wrapper that rocks on its own transform, so a sheet only carries what changes between poses.

```json
{
  "character": "bonito", "src": "bonito-run.svg", "frames": 6, "fps": 8, "frameW": 192, "frameH": 96,
  "alt": { "ja": "カツオ", "en": "Bonito" },
  "hoya": { "mode": "off", "pose": "1-5", "src": "runner-a.png", "aspect": 0.6406, "credit": "ja", "approval": null }
}
```

## Today (no approval)

`hoya.mode` is `"off"`. The page carries the bonito (an original drawing, `tools/anime/bonito-sprite.mjs`). Nothing of ホヤぼーや moves. To SEE approval level A on your own machine: open the app on localhost with `?hoya=run` (it needs `data/hoyaboya-dev/runner-a.png`; it is ignored on any other host, and `server/app/stage.sh` does not stage that folder).

## Level A: an official pose, only its position moves (when the city approves)

1. Get the 使用承認書 (様式第2号) and note its number and date.
2. `git mv data/hoyaboya-dev/runner-a.png src/anime/assets/hoyaboya/runner-a.png` (and keep its notice: move `data/hoyaboya-dev/NOTICE.md` content into `src/anime/assets/hoyaboya/NOTICE.md`).
3. In `runner.json` set `"hoya": { "mode": "still", "pose": "1-5", "src": "runner-a.png", "aspect": 0.6406, "credit": "ja", "approval": { "by": "気仙沼市産業部観光課", "ref": "<the number on the 承認書>", "date": "YYYY-MM-DD" } }`. That is the one-line switch plus its record; the guard throws at generation time if the record, the credit or the pose is missing.
4. `env -u NODE_OPTIONS bun scripts/anime/loader-inline.js` (the page now carries the still from `./assets/hoyaboya/`, bundled by Bun), `env -u NODE_OPTIONS bun test test/loader.test.js`, build, check the two figures do not touch (`test/ui-b.e2e.test.js` row 8).
5. Hand the finished screen (a screenshot or a recording) to the city (取扱要綱 第5条2項).

Only the figure's POSITION moves (the lane transform) plus a two-step bob of the position (`klc-bob2`, steps(1)); the figure is never deformed, cropped, mirrored or drawn over. The lane carries the figure to the *completed* mark and stops there (`core/loadbar.js`); while a stage runs the bonito swims in place (`klc-swim`, a bob and a wag on its own transform), and the mascot preview only bobs its position (`klc-bob2`). Note: the `?hoya=run` preview has drawn nothing since the v4 runner became an `<svg>` (`title-boot.js` writes a `div` into it and sets no image `src`), so level A cannot be seen locally until that is restored.

## Level B: an approved run cycle

Only after the city has seen drafts and approved (the cover text of the application, not included, offers it): put the city's frames side by side in one PNG, WebP or SVG strip (equal frames, transparent background, bow to the right), put it next to `runner-a.png`, and set `"mode": "cycle", "frames": 8, "fps": 12, "aspect": <frame width / frame height>, "src": "<strip file>"` plus the approval record. The page steps the strip; nothing else changes. Do NOT draw, trace, rig or cut up the character for this: the frames come from the city or from an artist the city has agreed to, and drafts go to the city first.

## Switching it off in a hurry

Set `"mode": "off"`, run the generator, deploy. The bonito is back and nothing of ホヤぼーや moves.

## Another character

A sprite sheet, a frame count, a frame rate and a size are all it takes (`normalizeRunner`). The sheet may be an SVG (crisp at any density) or a PNG/WebP.
