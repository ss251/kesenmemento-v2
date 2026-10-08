# The runner: the logo's カツオ

The runner is the progress head that rides the crest line (`src/anime/ui/loader/sprite-runner.js`, `src/anime/assets/runner/runner.json`). The gauge's fish is the logo's own カツオ: `title-boot.js` clones that fish into an empty `<svg class="runner">`. The sprite module still knows how to step a sheet (equal frames, a CSS `transform`, compositor only) if a later original character brings one.

```json
{
  "character": "bonito", "src": "bonito-run.svg", "frames": 6, "fps": 8, "frameW": 192, "frameH": 96,
  "alt": { "ja": "カツオ", "en": "Bonito" }
}
```

The page does not stand a figure beside the tip bar. The bar alone, with the カツオ at its head, is the gauge.

A sprite sheet, a frame count, a frame rate and a size are all a later runner needs (`normalizeRunner`). The sheet may be an SVG (crisp at any density) or a PNG/WebP. The character id has to be one the module allows (`bonito` today).
