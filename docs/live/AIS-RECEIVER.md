# 気仙沼湾の AIS 受信機

Open Waters（AISHub と aisstream をまとめた公開フィード）は、2026-10-07 の時点で三陸沿岸（北緯 37°〜40°の太平洋側）に船を 0 隻しか載せていない。東京湾は数百隻、秋田は十数隻、八戸は約 90 隻。ボランティアの受信機が気仙沼湾にない。

ここに 1 台置くと、湾の船が Open Waters に載り、この街の `/api/live` の `ais` も同時に埋まる。空のときは画面に何も出さない。受信が始まった瞬間から、船は報告された位置に現れる。

AIS-catcher は航法にも安全にも使わない。作者の README がそう書いている。受信が地域の法令で許されるかは、置く人の側で確認する。

## 15 分で置く

1. RTL-SDR Blog V4 のドングルを挿す。README が名前を挙げているのは “RTL SDR Blog v4”。
2. 162 MHz のアンテナを、湾が見える窓か PIER7 に出す。
3. AIS-catcher を入れる（下のコマンドはドキュメントからの引用）。
4. 画面に NMEA が流れるのを見る。
5. Open Waters へ送る。同じ受信を、このサーバの UDP か HTTP にも渡す。

## 部品

確認した日は 2026-10-07。

- **ドングル。** 楽天の出品名は「RTL-SDR Blog V4 R828D RTL2832U 1PPM TCXO SMA ソフトウェア デファインド ラジオ (ドングルのみ)」。その日の表示価格は 10,098 円。Amazon.co.jp の ASIN B0F6MQ5N5W「RTL-SDR Blog V4 R828D RTL2832U 1PPM TCXO SMA Software Wireless (Dongle Only) (USB-C)」は、同じ日に出品がなかった。秋月の価格はここで作らない。
- **アンテナ。** 162 MHz 用を買うか、自作する。AIS は 161.975 MHz と 162.025 MHz。162.025 MHz の 1/4 波長は 46.3 cm。同じ長さの銅線 4 本（垂直 1、地面側 3 を約 45°下げる）が 1/4 波長グランドプレーンになる。SMA でドングルへつなぐ。

届く範囲は、ここから測っていない。湾に面した窓から内湾は、見通しが取れれば数 km が正直な期待。大島と半島が外海を隠す。外洋の船まで届くとは書かない。

## Mac

出典は [macOS のインストール](https://jvde-github.github.io/AIS-catcher-docs/installation/macos/)。引用はそのまま。

```sh
brew install librtlsdr
```

```sh
git clone https://github.com/jvde-github/AIS-catcher.git --depth 1
cd AIS-catcher
mkdir build
cd build
cmake ..
make
sudo make install
```

```sh
AIS-catcher -L
```

```sh
AIS-catcher -v 10
```

バイナリは `/opt/homebrew/bin/AIS-catcher` か `/usr/local/bin/AIS-catcher`。

ゲインは [RTL-SDR のページ](https://jvde-github.github.io/AIS-catcher-docs/configuration/input/rtlsdr/) の例:

```sh
AIS-catcher -gr tuner 33.3 rtlagc ON
```

## Raspberry Pi

出典は [Raspberry Pi のインストール](https://jvde-github.github.io/AIS-catcher-docs/installation/raspberrypi/)。引用はそのまま。

```sh
sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/jvde-github/AIS-catcher/main/scripts/aiscatcher-install) -p -M"
```

## Open Waters と、このサーバ

HTTP のドキュメントは、URL のトークンが Bearer になる、と書いている。公開の例はこれ:

```sh
AIS-catcher -H https://<token>@ais.openwaters.io/v1/receive gzip on interval 15
```

この街のサーバは同じ形を受ける。`AIS_INGEST_TOKEN` が無いと `POST /api/live/ais` は 404 で、開いた書き込み口にはしない。

```sh
AIS-catcher -H https://<AIS_INGEST_TOKEN>@<host>/api/live/ais gzip on interval 15
```

UDP は [UDP のページ](https://jvde-github.github.io/AIS-catcher-docs/configuration/output/UDP/) の例。アドレスとポートは、サーバの `AIS_UDP_PORT` に合わせる。JSON を付けると、時刻などのメタデータが残る。

```sh
AIS-catcher -u 192.168.1.235 4002
```

```sh
AIS-catcher -u 192.168.1.235 4002 JSON on
```

aiscatcher.org のコミュニティへは、README のとおり、共有キーを受け取ってからコマンドラインで `-X` に続けてそのキーを渡す。

README が掲載しているフィルタの例:

```sh
AIS-catcher -N 8100 FILTER on EXCLUDE_ERRORS undersized,checksum
```

```sh
AIS-catcher -N 8100 FILTER on EXCLUDE_ERRORS all
```

```sh
AIS-catcher -N 8100 FILTER on EXCLUDE_ERRORS none
```

```sh
AIS-catcher -N 8100 FILTER on ONLY_ERRORS on EXCLUDE_ERRORS none
```

## 画面に出るもの

`/api/live` の `ais` は `{ vessels, source, attribution, coverage }`。`coverage` が `empty` のあいだ、船も「0 隻」も出さない。`live` になったときだけ、報告された緯度経度に船体を置き、速力と針路で次の受信まで進める。水の上だけ。ラベルは船名と速力。クレジットは Open Waters が返した文面（AISHub、aisstream）をそのまま載せる。
