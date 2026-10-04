# Data: sources, attribution and licence

The city data in `data/` is built from open map data, then corrected by the KesenMemento team. This page says where
each part comes from and what applies to it.

| Data | Comes from | Attribution and terms |
| --- | --- | --- |
| Terrain, aerial photo tiles, building footprints, place names (`data/terrain`, `data/ortho`, `data/buildings`, parts of `data/anime`) | 国土地理院 (GSI) 地理院タイル: elevation, seamless aerial photo, vector tiles | 出典：国土地理院（地理院タイル）を加工して作成. Used under the [GSI tile terms](https://maps.gsi.go.jp/development/ichiran.html). |
| Roads, building attributes and names merged into the layout | © OpenStreetMap contributors | [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). The layout files that merge OSM data are derived databases offered under ODbL 1.0. |
| Weather, forecast and tides (`data/live`, fetched at runtime) | 気象庁 (JMA) | 出典：気象庁ホームページ. JMA's terms are compatible with CC BY 4.0. |
| Boat arrivals (fetched at runtime) | 気仙沼漁業協同組合's public 入船情報 pages | Read at runtime for display. For offline development the repository keeps one day of saved public pages (2026-09-29, `scripts/live/fixtures/`) and the sample built from them (`data/live/sample.json`, always labelled サンプル in the app). |
| Corrections (`data/anime/overrides/*.json`) and the survey (`data/survey/*`) | The KesenMemento team | See below. |

## The team's corrections and survey

The override files record, per building or area, what the team corrected and why. Every entry cites its evidence.
The evidence comes from:

- the team's own photographs and the photo survey (structure from motion, measured in metres);
- the GSI aerial photo and OpenStreetMap;
- Wikimedia Commons photographs (their own licences; none is included here);
- Google Earth's 3D view (imagery dated 2026-03-11).

Google Earth was used as a visual reference while modelling: to see what stands today, how tall it is and what
colour its roof is. **No Google imagery, 3D content, screenshots or capture tools are included in this repository.**
Where an entry's note names Google Earth, that is an honest record of what the modeller looked at. If you are a
rights holder and have a concern about any entry, open an issue and it will be reviewed promptly.

The team's own work in `data/anime/overrides/` and `data/survey/` is offered under the
[Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/) licence. The derived layout files
remain under ODbL 1.0 as described above. Nothing here grants rights in third-party material.

## Not included

- Personal photographs (the survey publishes measurements and solved cameras only, without capture times or GPS
  fixes).
- The 第一昭福丸 livery traces: the livery is 臼福本店's (design by nendo) and is used with 臼福本店's permission in
  the live demo only. Without those files the app paints a plain livery.
