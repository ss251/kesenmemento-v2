# カツオ一本釣り

第五凪丸 is a fictional 近海 pole-and-line boat berthed at the market quay. She is lighter and quicker than 第一昭福丸. The voyage of 第一昭福丸 is unchanged: `enter()` without a boat id always puts that hull back.

Play: `ippon.start()` puts you on her deck at the market quay. The 漁労長 says 「おう、来たか！ きょうはカツオだ。沖さ 出っぺ！」 and one button, 「出港する」, casts off. The same line waits on the quay: he stands by the boat with 「！」 until the first trip, then 「…」, and the boat flies 「一本釣り 体験」. At the grounds, throw bait, run the spray, then lift on 「あわせる」. A heavy fish is still one swing, and it needs a harder pull. Chill the hold. The trip ends when the hold is full, about four minutes have passed, or you choose 「帰港」. The results read 本数, 合計 kg and the biggest fish, with a 優 / 良 / 可 stamp and the sample bid. 「もう一回」 returns to the grounds. 「まちへ」 sets you down on the quay, walking. Out of season the line says the school is far out.

「あわせる」 is the player's timing word. No deck chant is quoted, because none was found.

The boat at the quay, her 「一本釣り 体験」 flag and the birds over the schools are part of the town. The trip's own meshes (the spray, the deck fish, the crew and the angler) are built when a trip starts: from the hub or from the town (the 漁労長, a mission, the places list) a trip goes in behind the あそぶ wipe and title card while they are built and their programs compiled (`play/kit/lazy.js`). On a phone they are freed when you come ashore. The 漁労長 himself is built when you come within 150 m of his spot and, on a phone, freed past 220 m; his 「！」 is placed from the spot, so it shows from 108 m as before. Ashore the camera keeps the screen's own field of view (`core/fov.js`); only the trip's shots set theirs.

## Why the swing feels right

The camera stands where an angler stands: the port gunwale, eyes 1.58 m above the plank, the pole in the lower frame and the line running out to the water. A bite dips the tip. The lift is one motion, a press-and-release or an upward swipe, and the clock for that motion starts when the bite does, so a thumb that was already down does not waste the strike. The カツオ leaves the water nose-first on the line, clears the head, and the first one of a trip holds for 0.15 s at the top. The camera is already there, a little further outboard, so the flank and the silver belly both read. It comes off the barbless hook, thuds on the deck behind the shoulder, flaps, and slides aft and down toward the belt. The pole is back in the water before the next bite. At a hot ナブラ that next bite cannot arrive inside 2 s, which is the published pace of a master, so a clean run lands a fish about every 2–3 s. Reduced motion skips the hold and the flap and puts the fish on the deck at once.

The fish is the title mark's カツオ: dark indigo back, silver belly, the tail and the dorsal. Faint vertical bars stay on while it is in the water or in the air. The belly lines appear once it is on the deck. Up to 60 of them share one draw. From the angler's eye the spray is one arc: three hoses nearest the station throw thin streaks, 2–6 px on screen, and a faint mist where they meet the water. Nothing in that arc is a ball, and nothing is bright enough to bloom. Bait leaves the bucket as small silver fish, and the ナブラ is a patch of foam with gulls dropping into it. All of that grows with the spray and the school and dies back when the school sinks. The eight crew are four baked variants of the town cast kit (jackets 紺 / 茜 / 浅葱 / 墨, a cap or a 手ぬぐい, height within 4 % of the others, an invented face, no likeness), still one instanced draw. They line the port rail, the player's place left open, and lift in a stagger while the school is hot. 「来た！」 and 「よし！」 are plain words for the moment. They are not a documented call.

## Tuned numbers

| | Value | Why |
|---|---|---|
| Hull | 28 m × 5.8 m, 14 kn, 0→90 % in about 6 s | Game model inside the 80–180 t 近海 range. Not a measured hull. Playtests 2026-10-08: 7.5 kn was too slow for kids. Quicker than 第一昭福丸 at 12 kn. |
| In-season school | just outside the bay mouth: the 400 m gate plus 0.9 km, 1.2 km and 1.45 km, on bearings 36°, 48° and 28° (open water east-northeast; the channel's last leg runs into the coast) | Skipjack are fished offshore. The centres stay east of the gate, and a 70–80 m drift does not bring them inside it. |
| First departure | A horn, then 4.2 s of the real ×4 pull off the quay, then a veil to `groundsPose` (the school, 36 m west and 28 m south, inside the 70 m work ring) | A first fish has to land inside a minute. The outbound path, the school centres and `boostX` are unchanged. The twelve-minute voyage is the open question in the lane file. 「もう一回」 skips the quay and starts at the grounds. |
| Bait on the way | 「餌の用意」 during the run. The chum goes in on the first moment at the grounds | The harbour does not get a bait pulse. The radar sweeps while she is outbound. |
| Off-season school | unchanged: one at the bay-mouth centre (2025, 7425), one further (2400, 6800) | 5月下旬–11月ごろ is the published window. Outside it, the trip line says the school is far out. |
| ナブラ | builds with spray and bait, fades after 80 s hot | A real session is 15 minutes to about 2 hours. This is the playable compression. |
| Lift | 80–340 ms, sweet 140–260 ms, strength about 0.4–0.74. The first fish of a first trip opens to 0–520 ms, sweet 80–320, and a miss waits for the next bite | A short snap. A heavy fish wants about 0.78–0.98 in the same one motion. The wide window is only while `firstFish` is set and the hold is empty. |
| Arc | 0.68 s, loft 3.2 m (4.05 m on a perfect pull). First catch holds 0.15 s at the apex | Starts in the water, clears the head, lands inboard and aft on the plank. |
| Next bite | 2.0–4.2 s. Hot school with a combo sits on 2.0 s | A master lands about one fish every 2 s (明神水産). The old floor was 1.85 s. |
| Deck slide | 0.85 s down and aft, flap 0.45 s | The slope behind the angler, toward the belt. |
| Crew | 8 on the port rail, gap at u = 0.80. Four variants in one baked mesh (`aVar` / `aPick`), outline off. Heights 0.96, 1, 1.04, 0.98 | Still one draw. Jackets 紺 `#223A70`, 茜 `#B7282E`, 浅葱 `#00A3AF`, 墨 `#595857`. |
| Eye | 1.58 m above the plank, 0.12 m outboard of the station | The pole stays in frame. The apex camera steps 0.55 m further out so the fish is in profile. |
| Approach | faster than about 1.8 m/s inside the boil, with the throttle open, spooks the school | Come in slowly. The guide eases off by itself. |
| Trip end | Hold 36 kg, or 240 s on the grounds, or 「帰港」 | The clock does not run during a lift. A catch that fills the hold finishes after the fish is on the deck. |
| Catch juice | 60 ms hit-stop, a 55 mm camera kick, the kit's onomatopoeia toast 「ザバッ！」 (1.2 s), then the existing 0.15 s apex hold, then `ui.stamp` 「釣れた！」 (0.9 s) | Reduced motion skips the stop and the hold. The stamp shortens to 0.4 s. |
| Grade stamp | 優 if 8 fish or 16 kg or a fish of 70 cm; 良 if 3 fish or 6 kg; otherwise 可 | The kit's one-character seal, in both languages. Separate from the 上 / 並 / 小 size grade. |
| Results | Title 一本釣り, the grade seal, then `本数・合計 kg・最大` and the 入札の例 line. 「もう一回」 retries. 「まちへ」 quits. | Same card as the kit's fishing sample. The bid stays an example, not a payout. |
| Coaching | 鳥山, 撒き餌, 散水, 竿を出す, the swipe, then 「筋が いいな！」 after 3 fish | `ui.coach` writes `meta.seen['ippon-*']` on done. `ippon.seen` still drives the step, and is written back after a kit save. OK hides the bubble and does not skip the action. 「チュートリアルをもう一度」 clears both. |
| Actions | Pole (Space, primary), bait (E, 1.4 s), spray (R), ice (C, 0.8 s, only with fish aboard), 港へ | `ui.actions`, at most five. Hidden during the lift so Space stays the hold. A coach step shows only its button. |
| Captain 「！」 | 山吹 `#F8B500`, 紺 `#223A70` outline, white 「！」. World size 1.05 m, screen floor 22 px, cap 64 px. Full opacity to 60 m, gone by 108 m. Bob 1.8 s. Ground ring 1.7 m (ellipse height 0.36 of the width). | Same readable floor as the missions balloon. After the first trip the mark is the soft 「…」, with no floor and no ring. |

## Facts used

| Claim on screen | Source |
|---|---|
| Season, late May through November | [来てけら 魚市場探検](https://kesennuma-kanko.jp/uoichiba-report/) `[A]` |
| 28 years, 1997–2024; 2025 ended it; 2026 is not official yet | [kesennuma-kanko.jp 日本一返り咲き](https://kesennuma-kanko.jp/katsuonihonichi2026/) `[A]` |
| Example price ¥372/kg on 6 Oct 2026, not a payout | [河北新報](https://kahoku.news/articles/JY6XRKVF4JKHN.html) `[B]` |
| Length–weight, 40 cm ≈ 1.2 kg, 50 cm ≈ 2.6 kg, 60 cm ≈ 4.7 kg | [FRA EPO](https://kokushi.fra.go.jp/R07/R07_29_SKJ-EPO.pdf) `[A]` |
| Port-side fishing, green spray mouths, bait tanks, bird radar | [厚生労働省 training standard](https://www.mhlw.go.jp/content/11800000/001199327.pdf) `[A]`, [海洋総合辞典](https://oceandictionary.jp/scapes1/scape_by_randam/randam6/select632.html) `[C]` (hose colour only) |
| One swing over the shoulder; two people are for tuna, not skipjack | [MSC](https://www.msc.org/jp/what-we-are-doing/our-approach-JP/fishing-methods-JP/pole-and-line) `[A]` |
| A heavy fish (about 10 kg and up) is hard work for one person | [明神水産](http://www.myojin.co.jp/ship/myojinmaru/) `[B]` |
| Slow approach; a startled school sinks | [宮崎県](https://www.pref.miyazaki.lg.jp/documents/86174/86174_20240328170054-1.pdf) `[A]` |
| 近海 fish are chilled, not frozen | [漁師.jp](https://ryoushi.jp/know/okiai-enyou/enyou-katsuo/) `[A]` |
| Landing is 入札, not a shouted auction | [来てけら](https://kesennuma-kanko.jp/uoichiba-report/) `[A]` |
| Hull 28 × 5.8 m | Game model. A measured 71 t boat is 23.65 × 5.27 m ([JAMARC No.452](https://fra.repo.nii.ac.jp/record/2016706/files/jam_n_452.pdf) `[A]`). |
| Paint, except the green hose ends | Not found. White topsides and an 藍 stripe are a design, not a cited livery. |
| Which seabird marks the school | Not found. The flock reuses the harbour gull mesh as a mark for 鳥付き, drawn larger far away so it reads at 2 km. |
| 出船おくり | Documented for tuna and large saury boats, not for this visiting 近海 boat. It is not staged. The flag is an original pattern. |

Videos studied for the swing (IPPON-RESEARCH.md §8): [NHK プロフェッショナル](https://www.web.nhk/tv/an/professional/pl/series-tep-8X88ZVMGV5/ep/N8YV6QJMJV), [科学映像館 ナブラ](https://www.kagakueizo.org/movie/ngk/7083/), [明神水産](http://www.myojin.co.jp/ship/myojinmaru/).

## The grounds

Resolved for round 3. Skipjack are fished offshore, so in season the school spawns just outside the bay mouth and never inside the inner bay. The short 1.2 km harbour mark is gone. The run stays on the existing outbound route, at 4×, with the bait readied on the way, so the trip is still a departure rather than a teleport. 4× holds through the last kilometre and drops only inside the 320 m slow ring, so the arrival is not a long crawl. Out of season the far schools, and the line that says they are far out, stay as they were.
