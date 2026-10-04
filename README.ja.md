# KesenMemento v2（ケセンメメント v2）: 気仙沼リビングシティ

[English](README.md)

**宮城県の漁港のまち・気仙沼を、オープンデータから作った手描きアニメ調の 3D の世界として、ブラウザで歩き、運転し、飛んで探索できます。**
KesenMemento v2 は、KesenMemento チームがハッカツオン 2025 で制作し、市長賞（Mayor's Award）と People's Choice を受賞した
KesenMemento の続編です。（アプリ自体の名前は「気仙沼 リビングシティ」、英語では Kesennuma Living City のままです。）

**ライブデモ: <https://kesennuma-living-city-production.up.railway.app/>**（`?ship=1` を付けると、まぐろ延縄船「第一昭福丸」に乗れます。
[第一昭福丸](#第一昭福丸) を参照）。初回は、ブラウザの中で町を組み立てるため時間がかかります。進み具合は駅名標に表示されます。

![夕方 16:30、ドローンから見た内湾](docs/shots/v4_readme_drone.png)

| | |
|---|---|
| ![魚町の岸壁を歩く。係留された船と鮮魚の店先](docs/shots/v4_hero_walk.png) | ![夜の内湾。場所ラベルとミニマップ](docs/shots/v4_night.png) |
| ![場所検索で「気仙沼駅」。町の上に場所ラベル](docs/shots/v4_search.png) | ![魚町の男山本店の店内](docs/shots/v4_otokoyama_inside.png) |

スマートフォンでは、指の下に現れるスティックと扇形のボタンで、ゲームのように遊べます。

<img src="docs/shots/mobile/walk_portrait.png" alt="操作パッドのあるスマートフォン画面" width="260">

## 特徴

- **計測した、本物の町。** 地形、海岸線、道路、約 50,800 棟の建物の形は、国土地理院のオープンデータから作っています。OpenStreetMap から
  階数、屋根の形、名前、土地利用、川、信号、道路名を加え、屋根の色・形・棟の向きは国土地理院の航空写真から一棟ずつ取っています。
  どの値にも出典が記録されていて、描いた町は自動の検証で航空写真と比べています（[正確さ](#正確さ) を参照）。
- **手描きのルック。** セル調のエンジンは Kenton-GMI さんの [Sakuragaoka Station](https://github.com/Kenton-GMI/sakuragaoka-station)
  （MIT ライセンス）を移植したものです。色に合わせた輪郭線、青紫の影、描いた雲、ブルームと色調補正で描きます。
- **歩く、運転する、飛ぶ。** 中心部全体（西は気仙沼駅から内湾まで、北は鹿折から南は南気仙沼まで、約 4.3 × 4.4 km）を、あなたのまわりの
  100 m のタイル単位で読み込みます。約 100 m 以内は店先、電柱と電線、自転車、自販機まで描き込みます。建物、岸壁の縁、川は壁になります。
  本物の道路網を軽自動車で走ることも、自由に飛ぶこともできます。
- **検索と地図。** 場所検索は約 3,500 の本物の名前を日本語と英語で探せます。場所ラベル、ミニマップ、全体地図があり、51 か所の場所には
  それぞれ空からの構図と、近くの道に立つ歩き出し地点があります。
- **名所は実寸で。** 名所はどれも [docs/anime/landmarks/](docs/anime/landmarks/) の資料シートをもとに作っています。魚市場（四つの棟すべてと海の市）、
  かなえ大橋と気仙沼大島大橋、浮見堂と五十鈴神社のある神明崎、フラップゲートのある魚町の防潮堤、PIER7 と迎（ムカエル）、安波山、市役所、
  気仙沼駅、リアス・アーク美術館、病院、八つの学校、神社・寺・教会、風待ち地区の登録有形文化財のお店、大島の亀山モノレールと浦の浜のターミナルです。
- **測量精度の作り直し。** 南町の PIER7 のプラザと、魚市場 C棟の屋上デッキ・岸壁側の棟は、現地で撮った写真から Structure from Motion で
  作り直しました。名前のついた部材は測量値と照合しており、できあがったアプリの 3D 誤差の平均は、プラザで 0.046 m（44 部材）、魚市場で
  0.14 m（59 部材、中央値 0.075 m）です。[docs/anime/survey/](docs/anime/survey/) を参照してください。
- **中に入れる建物。** 魚市場 C棟（見学者入口、2 階の情報発信施設、水揚げの床を見下ろす見学通路）、魚町の男山本店の店舗、改札とその日の発車案内がある
  気仙沼駅の待合室に入れます。
- **ライブの港。** まぐろはえ縄船とさんま船が列になって係留され、今日入港する船は実際の船名で魚市場へ入ってきます。天気は気象庁、入船は気仙沼漁協から
  取っています。ライブの取得に失敗したときは保存済みのサンプルを表示して **サンプル** と明記し、1 時間より古いコピーは **キャッシュ** と表示します。
- **移り変わる町。** 時刻は五つ（どれも 2026年10月10日 の光）、季節は四つ、雨と濡れた路面、切り替わる信号、港の環境音があります。
- **スマートフォン対応。** モバイルゲームのような操作パッド（浮かぶスティック、ドラッグで視点、モードに合わせて変わるボタン）と、スマートフォンのメモリに収まる
  低画質のティアがあります。[docs/MOBILE-CONTROLS.md](docs/MOBILE-CONTROLS.md) を参照してください。
- **実寸のまぐろ延縄船。** 第一昭福丸（船主 臼福本店）がコの字岸壁に停泊していて、乗船して三幕構成で遊べます。出船おくり、延縄の投縄と揚縄、
  漁獲物が日本に届くまでの流れです。
- **ツアーと写真。** 自動ツアー、湾全体を見渡す「小さな惑星」表示、3840×2160 の PNG を保存する写真モード、日本語と英語の UI があります。

## クイックスタート

[Bun](https://bun.sh) 1.3 以降と、WebGL2 に対応したデスクトップブラウザが必要です（Apple シリコンの Mac の Chrome か Safari がおすすめです）。

```sh
git clone https://github.com/ss251/kesenmemento-v2.git
cd kesenmemento-v2
bun install
bun run build                                   # src/anime を dist/ にまとめる
bun run scripts/serve.js --port 8787 --no-build
# http://127.0.0.1:8787/ を開く
```

```sh
bun test                                        # 単体テスト
bun run scripts/live.js                         # 今日のライブ状態を表示（気象庁 + 気仙沼漁協）
bun run scripts/live.js --fixtures              # 保存済みサンプルの状態
```

- `bun run serve` なら、ビルドしてからポート 8787 で配信するまでを一度に行います。
- サーバーは 127.0.0.1 だけで待ち受けます。`/` で `dist/`、`/data/` で `data/` を配信し、`GET /api/live` で今日の天気・潮位・入船を返します。
- シェルで `NODE_OPTIONS` を設定している場合（デバッガ用など）は、各コマンドの前に `env -u NODE_OPTIONS` を付けてください。
- ブラウザでの QA、正確さの検証、スクリーンショットのツールはヘッドレス Chrome で動きます。詳しくは [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#tools) を見てください。

## 操作

駅名標の **まちへ出る · Enter the town** をクリックするか、Enter キーを押します。画面下の案内にもキーの一覧が出ます。

| キー | 操作 |
|---|---|
| W A S D / 矢印キー、マウス、Shift、Space | 歩く、見回す（画面をクリックでポインタ固定、Esc で解除）、走る、ジャンプ |
| F | 飛行のオン・オフ（E か Space で上昇、Q か Ctrl で下降、Shift で加速） |
| C | いちばん近い道路で軽自動車に乗る・降りる（W / S、A / D、Space でサイドブレーキ） |
| / | 場所を検索（気仙沼駅のような名前でも、病院や "cafe" のような種類でも探せます） |
| N | 全体地図（ドラッグで移動、ホイールかピンチで拡大縮小、場所か道をクリックでそこへ移動） |
| 1 〜 9 | 最初の九か所へ: 1 内湾、2 魚市場、3 PIER7、4 浮見堂、5 かなえ大橋、6 大島大橋、7 安波山、8 気仙沼市役所、9 ワン・テン庁舎 |
| G | すべての場所をめぐる自動ツアーの開始・停止 |
| V / R | ドローンと徒歩の切り替え / 内湾のドローン視点に戻る |
| T / K | 次の時刻へ / 次の季節へ |
| O | 小さな惑星のオン・オフ |
| P | 写真（UI なしの 3840×2160 PNG を保存） |
| H / M / \` | UI の表示切り替え / 音のオン・オフ / フレームカウンター |

**建物の中**へは、キーは要りません。入口から歩いて入ります。魚市場 C棟は「魚市場」を検索するか 2 を押し、男山本店は「男山」、気仙沼駅の待合室は
「気仙沼駅」を検索します。

**スマートフォン**の操作パッドは、左に指の下に現れるスティック（85 %以上倒すと走る、車ではブースト）、右のドラッグで視点、右下にモードに合わせて変わる扇形の
ボタンです。左上のチップで 歩く / 飛ぶ / 運転 を切り替えます。`?touch=1` でデスクトップにも表示、`?touch=0` で無効です。詳しくは
[docs/MOBILE-CONTROLS.md](docs/MOBILE-CONTROLS.md) にあります。

**URL オプション:** `?preset=asa|hiru|yugata|yuyake|yoru`、`?hours=17.1`、`?season=spring|summer|autumn|winter`、`?weather=clear|cloudy|rain|live`、
`?wet=0..1`、`?lang=ja|en`、`?q=high|medium|low`、`?fixtures=1`（サンプルデータを強制）、`?places=1`（名所パネルを開いておく）、`?stats`、
`?cam=x,y,z>lx,ly,lz`（指定したカメラから始める）、`?stream=0`（地上の読み込みを止める）、`?labels=0`（船のラベルを隠す）、`?credit=1`（静止画に出典を入れる）、
`?ship=1`（第一昭福丸に乗る）。

## 正確さ

作り込みより正確さを優先しています。気仙沼に住む人が、自分の通りだとわかることが目標です。方法は四つです。

1. **本物の資料を先に、値ごとに出典を。** 敷地ごとに、どの値をどこから取ったかを `lot.src` に記録しています。優先順位は OpenStreetMap、航空写真、
   国土地理院の施設注記、最後にまわりから推定した値です。出典の一覧は `data/anime/sources.json` と [docs/DATA-SOURCES.md](docs/DATA-SOURCES.md) にあります。
2. **名所の資料シートと測量。** 名所ごとに `docs/anime/landmarks/` のシートがあり、寸法・色・位置とその出典を書いています。二つの地区は、メートル単位で測った
   写真測量があります（[docs/anime/survey/](docs/anime/survey/)）。ウェブの写真は形と色の参考にだけ使い、アプリには入れていません。
3. **自動の検証。** `tools/anime/accuracy.mjs` が、動いているアプリを真上から正射投影で描き（中心部、500 m × 24 枚、0.5 m/px）、国土地理院の建物の形、
   z18 の航空写真、OpenStreetMap の道路、名所のシートと比べます。
4. **地上での確認。** `tools/anime/qa3.mjs` がすべての場所を歩きます。歩き出し地点は陸の上で、どの建物の外にもあり、その場所が見えていなければなりません。
   読み込み、歩行、運転、検索、地図、建物の中、ラベルも確かめます。

最新の検証（中心部、2026-10-01、v5 の地区ごとの修正後）:

| 指標 | 目標 | 結果 |
|---|---|---|
| 建物の占める範囲の IoU（国土地理院の建物の形と比較） | 0.80 以上 | **0.839**（再現率 0.928、適合率 0.897） |
| 名所の位置の誤差 | 5 m 未満 | **15 か所すべて** 5 m 未満 |
| 屋根の色の CIEDE2000（航空写真と比較）の中央値 | 小さいほどよい | 10.16（写真全体の色かぶりを除くと 8.52） |
| 建物の高さの絶対誤差の中央値（OSM と資料シート） | 小さいほどよい | 1.0 m |
| OSM の道路と描いた道路 | 大きいほどよい | 中心線の再現率 0.786、IoU 0.499 |

最初の検証（v4）は IoU 0.870、屋根の色の中央値 7.16 でした。国土地理院のデータに対するスコアは、v5 で意図的に下がっています。2020〜22 年の建物の形と写真を
正解として採点するため、町が新しい資料に合わせて変わった部分（取り壊された 72 棟を削除、その後に建った 59 棟を追加、塗り替えられた屋根）が誤差として数えられるからです。
建物は IoU の比較相手と同じ国土地理院の形の上に建てているので、IoU は「その形にどれだけ忠実に建てたか」を表し、国土地理院の形そのものの正しさではありません。
屋根の色、高さ、名所、道路は、それとは別の資料と比べています。この検証は 2026-10-03 の測量による作り直しより前のものです。作り直した地区は、それぞれの測量と照合しています
（[docs/anime/survey/](docs/anime/survey/)）。

## プロジェクト構成

| パス | 内容 |
|---|---|
| `src/anime/` | アプリ本体: エンジン（`core/`）、ワールドのモジュール（`world/`: environment、water、town、harbor、landmarks、life、ship、explore）、UI（`ui/`） |
| `src/core/`、`src/server/` | アプリとスクリプトで共有する地理・太陽の計算、`/api/live` のエンドポイント |
| `src/web/` | 以前のビューアから残した共有ライブラリと開発用フィクスチャ |
| `scripts/` | データパイプライン（国土地理院のタイルから地形・建物・レイアウトまで、OSM による補強）、ライブデータの取得、バンドラ、ローカルサーバー |
| `tools/` | QA と測量のツール: ヘッドレス Chrome での QA、正確さの検証、スクリーンショット、写真測量（Structure from Motion） |
| `data/` | アプリが実行時に読み込む、作成済みの町のデータ（レイアウト、地形、航空写真の切り出し、多言語の文字列、測量の結果） |
| `docs/` | 設計、データの出典、名所の資料シート、測量、第一昭福丸のガイド |
| `test/` | `bun test` のテスト |

まずは [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) を読んでください。

## ドキュメント

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): エンジン、本物のデータからのレイアウトの作り方、モジュール、読み込み、ライブデータ、ツール
- [docs/DATA-SOURCES.md](docs/DATA-SOURCES.md): すべてのデータの出典、ライセンス、表記
- [docs/PLAN.md](docs/PLAN.md): ロードマップ
- [docs/DEMO.md](docs/DEMO.md): 3 分間のデモの手順（オフライン時の代替手順つき）
- [docs/MOBILE-CONTROLS.md](docs/MOBILE-CONTROLS.md): スマートフォンの操作パッド
- [docs/anime/](docs/anime/): 町のパッケージ、地区ごとの上書き、名所の資料シート、写真測量
- [docs/ship/](docs/ship/): 第一昭福丸のモデル、三つの幕、遊び方
- [CONTRIBUTING.md](CONTRIBUTING.md)、[SECURITY.md](SECURITY.md)、[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)

## 第一昭福丸

第一昭福丸は全長 58.6 m の大西洋クロマグロ延縄船です。魚浜町のコの字岸壁に実寸で停泊していて、`?ship=1` を開くか、場所一覧の「第一昭福丸に乗る」を選ぶと乗船できます。
ガイドは [docs/ship/SHOFUKUMARU.md](docs/ship/SHOFUKUMARU.md) です。

第一昭福丸の船体塗装（リバリー）は臼福本店のもの（デザインは nendo）で、ライブデモでは許可を得て使用しています。このリポジトリには含まれていません。
この塗装のデータがない場合、アプリは簡素な塗装で描きます。

## 現時点の制約

- **フレームレートと読み込み時間。** 描画コール数が上限になっています（高画質で 1 フレームあたり約 950〜1,550 回、ポリゴンは 1,200 万〜1,400 万）。
  Apple M2 Max 1 台で、ブラウザを低い優先度に絞って計測したところ、1080p・高画質の 1 フレームは 20〜32 ms、初回の読み込みは 45〜55 秒でした。
  絞らなければもっと速くなりますが、高画質 60 fps はまだ空いたマシンで計測していません。低画質はより速く動きます。
- **4K。** 3840×2160 の写真モードと静止画は、1920×1080 以下でしか試していません。
- **建物の中。** 入れるのは三つの建物だけで、ほかの建物は中に入れません。
- **町の細部。** 100 m より遠い建物は簡略な形です。唐桑と市の外側には、地形・建物の形・道路はありますが、地上の読み込みはありません。
- **季節。** 太陽の動きは常にデモ当日の 10月10日 のままで、春は広葉樹に花を描き足したものです。
- **潮位。** `/api/live` は潮位を返しますが、描画する海面の高さにはまだ反映していません。
- **運転。** 車は一台だけで、ほかの交通はありません。

## データの出典

- **地図・地形・航空写真・建物・道路:** 出典：国土地理院（地理院タイル）を加工して作成
- **名前・土地利用・川・道路の属性:** © OpenStreetMap contributors (ODbL)
- **天気・潮位:** 出典：気象庁ホームページ
- **今日の入船:** 気仙沼漁業協同組合の公開されている入船情報のページ

アプリ内の出典表記は「© OpenStreetMap contributors · 出典：国土地理院, 気象庁, 気仙沼漁協 · Sakuragaoka Station (MIT) by Kenton-GMI」です。利用条件、
正式な表記、作成したファイルの一覧は [docs/DATA-SOURCES.md](docs/DATA-SOURCES.md) にあります。

## クレジット

- **KesenMemento チーム**: ハッカツオン 2026 の滞在期間中（2026年9月28日〜10月11日）に気仙沼で制作しました。
- **エンジンとページデザイン:** **Kenton-GMI** さんの [Sakuragaoka Station](https://github.com/Kenton-GMI/sakuragaoka-station)（MIT ライセンス。
  [src/anime/LICENSE-sakuragaoka-station](src/anime/LICENSE-sakuragaoka-station)）。移植したファイルにはすべてクレジットの見出しを残しています。
- **ライブラリ:** [three.js](https://threejs.org)、[Spark](https://sparkjs.dev)（`@sparkjsdev/spark`）、
  [takram](https://github.com/takram-design-engineering/three-geospatial)（`@takram/three-atmosphere`、`@takram/three-clouds`、`@takram/three-geospatial`）、
  [3d-tiles-renderer](https://github.com/NASA-AMMOS/3DTilesRendererJS)、`@mapbox/vector-tile`、`pbf`、`earcut`、
  [postprocessing](https://github.com/pmndrs/postprocessing)、[sharp](https://sharp.pixelplumbing.com)。ライセンスは [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) にあります。
- **フォント:** Google Fonts の Noto Sans JP、Noto Serif JP、Zen Maru Gothic、Yusei Magic、Yuji Syuku（SIL Open Font License）。
- **ハッカツオン 2026:** ハッカツオン実行委員会（気仙沼市、NPO法人ウィメンズアイ、Centrum ほか）の主催です。

**非公式のプロジェクトです。** 気仙沼市、臼福本店、nendo、その他ここに名前の挙がる団体と提携しておらず、承認も受けていません。

## ライセンス

- **コード:** MIT ライセンス（[LICENSE](LICENSE)）。移植したエンジンには、それ自身の MIT ライセンス表示
  （[src/anime/LICENSE-sakuragaoka-station](src/anime/LICENSE-sakuragaoka-station)）が付いています。
- **ドキュメント**（この README と `docs/`）: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.ja)
- **データ:** `data/LICENSE.md` を参照してください。
