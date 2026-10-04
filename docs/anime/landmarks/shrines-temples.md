# Shrines, temples and churches in the core

This supplements the dedicated sheets for 五十鈴神社 (`isuzu-jinja.md`) and 神明崎.

- Positions are from OSM (© OpenStreetMap contributors). ENU is as in `src/core/geo.js`.
- Roof colours are medians of the GSI aerial photo over the OSM footprint, which carries a cyan cast. The corrected value
  follows the arrow.

| Name | Type | lat, lon | ENU (x, z) | Footprint / roof | Notes |
|---|---|---|---|---|---|
| 猪狩神社 | shinto, precinct shrine of 五十鈴神社 | 38.90647, 141.57901 | (348, −52) | small hall on the 神明崎 ridge | carved hall with its own torii; honours 猪狩新兵衛 (nori and salt). OSM node 2495986403 |
| 龍神社 | shinto, stone shrine (石祠) | on 神明崎 | — | stone | a candidate for a shrine in the 延喜式 (Wikipedia) |
| **一景島神社** | shinto | 38.89618, 141.58147 | (562, 1090) | grove of 70 × 39 m inside 一景島公園 (88 × 80 m) | a **wooded former islet** (一景嶋), now inside the reclaimed market district, 70 m west of the fish market's C棟. It holds small shrine buildings and the board 「皆鶴姫」漂着の地. OSM ways 362542440 and 761250478; nodes 3668222580 and 3668222598 |
| 清護寺 | buddhist | 38.90469, 141.57151 | (−304, 145) | 19 × 19 m; roof #9abeb7 → light grey | 南町 hillside. OSM way 928776172 |
| 少林寺 | buddhist | 38.90540, 141.56797 | (−608, 64) | 20.5 × 18.5 m; roof #3e5254 → **dark grey tile #3f4448** | a large hip-and-gable temple roof. OSM way 820921817 |
| 青龍禅寺 | buddhist | 38.90652, 141.57119 | (−331, −58) | — | OSM node 4782510323 |
| 法玄寺 | buddhist | 38.90934, 141.57364 | (−118, −371) | — | OSM node 8660824618 |
| 補陀寺 and 補陀寺六角堂 | buddhist | 38.91122, 141.55995 / 38.91114, 141.55940 | (−1306, −579) / (−1353, −571) | the 六角堂 is a hexagonal hall | near 気仙沼駅. OSM nodes 4784201021 and 7118777726 |
| **気仙沼ハリストス正教会** | Orthodox church | 38.90629, 141.56938 | (−488, −29) | 11 × 23 m; roof #4a6a61 → **green copper roof** | a white-walled church with a **green roof and a small spire** on the hillside above 魚町. It is visible from the bay (Commons 気仙沼魚町と安波山 photo, upper right). OSM way 436715760 |
| 大杉神社 | shinto | 38.91299, 141.57362 | (−120, −776) | — | on the 安波山 foothills. OSM node 7113790419 |
| 愛宕神社 | shinto | 38.91007, 141.56921 | (−502, −452) | — | OSM node 7113790365 |
| 稲荷大明神 | shinto | 38.90857, 141.57182 | (−276, −285) | — | OSM node 7448263222 |
| 松尾神社 | shinto | 38.90931, 141.56815 | (−595, −367) | 4.9 × 4.6 m | OSM way 917011862 |
| 北野神社 | shinto | 38.90896, 141.56426 | (−936, −311) | precinct 309 × 86 m (grove) | OSM way 761768594 |
| (unnamed shinto building in 南町, probably 紫神社, after which the 南町紫神社前商店街 is named) | shinto | 38.90459, 141.57217 | (−246, 157) | small | OSM way 928776176. The name **is not verified** |

Typical palette:

- Temple roofs are dark grey 桟瓦 tile, #3f4448 to #50565c; the walls are white plaster #efece4 and dark wood #5a4636.
- Shrine torii are vermilion #cf4a30 or grey stone #b9b5aa.
- The church is white #f2f1ec, with a green copper roof #5f9c86 (it reads mint in photos).

## Sources

- OSM nodes and ways as listed; https://ja.wikipedia.org/wiki/五十鈴神社_(気仙沼市) (猪狩神社, 龍神社)
- Commons 「気仙沼魚町と安波山Kesennuma-Mt.Anba - panoramio.jpg」 (the church on the hill)
- GSI seamlessphoto z18 (`ortho/ikkeijima.jpg`, `ortho/otomo.jpg` for 少林寺)

## In the app

- 少林寺 and 清護寺 have big 入母屋 tile roofs, white plaster and dark timber, a 向拝 porch and a stair.
- The Orthodox church is white with green copper roofs, the apse, the belfry, the green cupola and the Orthodox cross.
- The 一景島 grove is dense and dark, with its halls and a torii on the west path.
- 松尾神社, the 南町 shrine (unnamed), 愛宕神社, 大杉神社 and 稲荷大明神 have small halls and torii.
