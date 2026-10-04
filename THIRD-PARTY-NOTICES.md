# Third-party notices

KesenMemento v2 (the app itself is called Kesennuma Living City) is released under the MIT licence ([LICENSE](LICENSE)).
It builds on the software, fonts and open data listed here. Their licences stay with their authors and apply to their
parts.

## Engine: Sakuragaoka Station (MIT)

The rendering engine (renderer, sky, cel materials, player and physics, batching), the house and street-furniture kit,
the characters and the page design are ported from
[Sakuragaoka Station](https://github.com/Kenton-GMI/sakuragaoka-station) by Kenton-GMI. Every ported file keeps its
credit header. The licence text is in [src/anime/LICENSE-sakuragaoka-station](src/anime/LICENSE-sakuragaoka-station); the
build copies it to `dist/licenses/`, and the in-app credit line links to it. It is reproduced here:

```
MIT License

Copyright (c) 2026 Sakuragaoka Station contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## npm dependencies

Every direct dependency in `package.json`. The licence is the one declared in the package's own `package.json` (read
from `node_modules`). Nothing from `node_modules` is committed to this repository; `bun install` fetches the packages,
each with its own licence file.

| Package | Version | Licence | Author or copyright holder | Role in this project |
|---|---|---|---|---|
| [three](https://threejs.org) | 0.186.1 | MIT | © 2010-2026 three.js authors | The 3D engine. Bundled into the app; its licence text is copied to `dist/licenses/three.txt` by the build. |
| [earcut](https://github.com/mapbox/earcut) | 3.2.4 | ISC | © 2026 Mapbox | Polygon triangulation in the town builders. Bundled into the app. |
| [@mapbox/vector-tile](https://github.com/mapbox/vector-tile-js) | 2.0.5 | BSD-3-Clause | © 2024 Mapbox | Decodes the GSI vector tiles in the data scripts. |
| [pbf](https://github.com/mapbox/pbf) | 4.0.2 | BSD-3-Clause | © 2024 Mapbox | Protocol-buffer reader for the vector tiles, in the data scripts. |
| [sharp](https://sharp.pixelplumbing.com) | 0.35.5 | Apache-2.0 | Lovell Fuller and contributors | Image processing in the data and tool scripts. It installs prebuilt libvips binaries (the `@img/sharp-libvips-*` packages, LGPL-3.0-or-later); these are not part of the app. |
| [@sparkjsdev/spark](https://sparkjs.dev) | 2.2.0 | MIT | © 2025 World Labs Technologies, Inc. | Gaussian-splat rendering in the code kept from the earlier viewer (`src/web/scene`, `scripts/splat`). Not part of the app bundle. |
| [postprocessing](https://github.com/pmndrs/postprocessing) | 6.39.5 | Zlib | © 2015 Raoul van Rüschen | Post-processing in the code kept from the earlier viewer (`src/web/scene`). Not part of the app bundle. |
| [@takram/three-atmosphere](https://github.com/takram-design-engineering/three-geospatial) | 0.19.1 | MIT | Shota Matsuda (takram) | Atmosphere library; `scripts/serve.js` serves its precomputed textures under `/vendor/`. |
| [@takram/three-clouds](https://github.com/takram-design-engineering/three-geospatial) | 0.7.6 | MIT | Shota Matsuda (takram) | Cloud library; `scripts/serve.js` serves its precomputed textures under `/vendor/`. |
| [@takram/three-geospatial](https://github.com/takram-design-engineering/three-geospatial) | 0.9.1 | MIT | Shota Matsuda (takram) | Geospatial helpers, a dependency of the two takram packages above. |
| [3d-tiles-renderer](https://github.com/NASA-AMMOS/3DTilesRendererJS) | 0.5.3 | Apache-2.0 | NASA-AMMOS; Garrett Johnson | Listed in `package.json` from an earlier viewer. Not used by the current code. |

## Fonts: SIL Open Font License 1.1

The app loads these fonts from [Google Fonts](https://fonts.google.com) at run time (`src/anime/index.html`). They are
not stored in this repository. All five are licensed under the
[SIL Open Font License, Version 1.1](https://openfontlicense.org).

- Noto Sans JP
- Noto Serif JP
- Zen Maru Gothic
- Yusei Magic
- Yuji Syuku

## Data

The data the app is built from is covered by its own terms and credit lines, which the app shows on screen:

- 国土地理院 (Geospatial Information Authority of Japan): 出典：国土地理院（地理院タイル）を加工して作成
- © OpenStreetMap contributors (ODbL)
- 気象庁: 出典：気象庁ホームページ
- 気仙沼漁業協同組合 (the fishing co-op): 入船情報

The full terms and the list of derived files are in [docs/DATA-SOURCES.md](docs/DATA-SOURCES.md) and in
`data/LICENSE.md`. Reference photographs from Wikimedia Commons and tourism pages were used only to check shapes and
colours; none is included in this repository or in the app.

## Not affiliated

This is an unofficial project. It is not affiliated with or endorsed by Kesennuma City, 臼福本店, nendo or any other
organisation named in these notices.
