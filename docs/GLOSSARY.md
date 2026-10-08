# 用語集 / Glossary

One Japanese term per concept, the same in the UI (`data/i18n.json`, `data/ui-*-i18n.json`, `data/ship/i18n.json`), the docs and anything public (docs/CRAFT.md section 6). The English column is the mirror: same meaning, plain and short. **Status**: `ok` = the strings follow it; `align` = a string still deviates (where, and what to change); `decide` = the owner chooses.

## Typesetting rules these terms are written under (docs/CRAFT.md section 2)

- Full-width punctuation in Japanese text (、。「」（）：！？・ー), half-width digits and Latin, never full-width digits.
- No space between Japanese words or before punctuation: 町並みを準備中…, never 町並み を準備中….
- One rule for Latin inside Japanese: a normal space around Latin words (KesenMemento で遊ぶ, iPhone で撮影), none around digits (10月10日, 3分, 入船3隻).
- A key hint in a list keeps the space between the key and the action (`WASD 移動 · F 飛ぶ`); in a tooltip the brackets follow the language: `表示を隠す（H）`, `Hide the interface (H)`. The drive chip groups its keys with a full-width slash, because a middle dot and a double space both collapse into one run: `W/S 加速・ブレーキ ／ A/D ハンドル ／ Space サイド ／ C 降りる`. The English line keeps its middle dots.
- Lists of sources use 、 (never `,` or `;`); a status or a label is followed by ： (never `: `).
- Register: です・ます in the UI; noun phrases for labels; a friendly plain style only where we speak to children.
- 町 for the town as a place (町へ戻る, 町並み, 町の暮らし). Never 街. Hiragana まち only in the call to action まちへ出る.

## Names

| JA | Reading | EN | Where | Status |
|---|---|---|---|---|
| 気仙沼 | けせんぬま (never きせんぬま) | Kesennuma | everywhere; title card shows the reading | ok |
| 気仙沼リビングシティ | けせんぬま リビングシティ | Kesennuma Living City | wordmark (☰ menu, brand), share title | ok in the HUD, the menu, the share title, `data/tour.json` and the READMEs. `index.html` `<title>` still has the space: the loading lane owns that file |
| KesenMemento | ケセンメメント (said once, in the JPYC credit) | KesenMemento | hackathon and public name; written in Latin in running Japanese text | decide: which name faces the public, this or the wordmark above |
| 第一昭福丸 | だいいちしょうふくまる | Daiichi Shofuku Maru | the ship, everywhere; never 昭福丸 alone | ok. The phone chip is the name 「第一昭福丸」 and the verb 「乗船する」; the desktop title and the search row stay 「第一昭福丸に乗る」 / "Board the Daiichi Shofuku Maru" |
| ホヤぼーや | — | Hoya Boya | only as the City's design manual allows, with its credit; no text on top of it | ok |

## The interface

| JA | Reading | EN | Where | Status |
|---|---|---|---|---|
| まちへ出る | まちへでる | Enter the town | the call to action into the town (not on the title since v3: the title's prompt is below) | ok |
| タップしてスタート ／ クリックしてスタート | — | TAP TO START ／ CLICK TO START | the title's prompt (v4): the display line is the English, the Japanese under it; it names the input (a touch screen taps, a mouse clicks); Enter starts too | ok (title v4) |
| まめ知識 | まめちしき | TRIVIA (Kesennuma Trivia) | the label of the title's tip bar; the English label is set in capitals | ok (title v4) |
| 出典： | しゅってん | Source: | the source line under a tip, in the page's language (every tip has an English source title) | ok (title v4) |
| 写真モード / 写真 | しゃしんモード / しゃしん | Photo mode / Photo | the feature (docs, public) / the button | ok |
| 地名ラベル | ちめいラベル | Place labels | ☰ menu, aria-label | ok |
| 名所 | めいしょ | Places | the places strip and list | ok (`v3.tour.title`) |
| 名所めぐり / 自動で巡る | めいしょめぐり / じどうでめぐる | Tour / Auto tour | search group, the strip's first button | ok; stop is 巡回を止める (align: 自動で巡るのを止める) |
| 入船 | いりふね | Boats in (arrivals) | the chip's panel; 今日の入船 = Today's arrivals; 入船3隻 = Boats in: 3 | ok after the batch-1 commit |
| 隻 | せき | (boat counter) | 入船3隻 | ok |
| ライブ / サンプル / キャッシュ | — | Live / Sample / Cached | the chip's tag; キャッシュ 12:04 = cached at 12:04 | ok |
| 時刻は目安 | じこくはめやす | time is approximate | an arrival row whose time is estimated | ok after batch 1 |
| 表示を隠す | ひょうじをかくす | Hide the interface | ☰ menu; key H in the tooltip | ok after batch 1 |
| クレジット・ライセンス | — | Credits and licence | ☰ menu, the credits sheet | ok (British spelling: licence) |
| 画質 | がしつ | Quality | 高 / 中 / 低 / スマホ = High / Medium / Low / Phone | ok. The option reads 画質：高 (full-width colon, no space). English keeps `Quality: High` |
| 小さな惑星 | ちいさなわくせい | Tiny planet | ☰ menu, key O | ok |
| 季節 | きせつ | Season | 春 / 夏 / 秋 / 冬 / 早春 = Spring / Summer / Autumn / Winter / Early spring | align: EN `v3.season.short.autumn` is "Fall"; use "Autumn" |
| 朝 昼 夕方 夕焼け 夜 | あさ ひる ゆうがた ゆうやけ よる | Morning, Noon, Afternoon, Sunset, Night | the time presets | ok |
| 歩く / 飛ぶ / 運転 | あるく / とぶ / うんてん | Walk / Fly / Drive | the pad's modes | ok |
| ダッシュ / ジャンプ | — | Dash / Jump | pad buttons (walking) | ok |
| もぐる / あがる | — | Dive / Get out | into the water from the shore / out of it (海の中) | ok |
| 上へ / 下へ | うえへ / したへ | Up / Down | the dive's pad buttons (rise / sink). Not 上がる / 下がる: 「上がる」 beside 「あがる」 reads the same | ok |
| 加速 / ブースト | かそく | Boost | 加速 = flying faster, ブースト = the car's boost | ok (one English word, two Japanese ones by design) |
| 場所を探す | ばしょをさがす | Find a place | search | ok |
| 地図 | ちず | Map | the full map and the minimap | ok |
| 修正を報告 | しゅうせいをほうこく | Report a correction | the report flow (hidden until go-live) | ok; in English text write Crew No., never クルーNo. |
| JPYCで買えるお店 | — | Shops that take JPYC | ☰ menu (switched off in production) | ok; the shops are お店, never 店舗 or ショップ |
| 協力：店名 | きょうりょく | Thanks to: shop | the credit inside a walk-in interior | ok |

## Places (official kanji and readings)

| JA | Reading | EN |
|---|---|---|
| 内湾 | ないわん | Inner Bay |
| 魚市場 (気仙沼市魚市場) | うおいちば | Fish Market (Kesennuma Fish Market) |
| 浮見堂 | うきみどう | Ukimido Pavilion |
| 安波山 | あんばさん | Mt. Anba |
| かなえ大橋 (気仙沼湾横断橋) | かなえおおはし | Kanae Bridge |
| 大島大橋 | おおしまおおはし | Oshima Bridge |
| 唐桑半島 | からくわはんとう | Karakuwa Peninsula (align: the stop is "Karakuwa") |
| PIER7 | ピアセブン | PIER7 |
| 男山本店 | おとこやまほんてん | Otokoyama Honten (sake shop) |

## The ship pad (data/ship/i18n.json)

出港 / 漁 / 帰港 = the three legs of the voyage (the first tab, the card state and 「もう一度出港」 all say 出港, which pairs with 帰港). 出船おくり is only the name of the send-off ceremony, not a leg. 自動操船 = Autopilot; 停止 = Stop; 町へ戻る = Back to town; 汽笛 = Horn; 速力 = Speed, ノット = knots, 針路 = Heading. The meter’s small label is `速力（ノット）` (full-width brackets). English keeps `Speed (kn)`.

町の名所・お店 is the search group (`v4.x.group.places`). 町の物語 is the story-pin group. まち stays only in まちへ出る. Loader copy that still says 街 (`core/loadplan.js`, the loading lane) is routed, not changed here.

## Open decisions for the owner

1. The public name: 気仙沼リビングシティ (UI) or KesenMemento (hackathon).
2. Whether the kids' link (`?src=chirashi`) gets its own, easier wording (今は大人向けの漢字: 巡る, 惑星, 貢献).
