# ホヤぼーや on the loading screen: what the city allows, and what we do

Verified against the city's own pages on 2026-10-07 (the page was updated 2026年5月20日). Never paraphrase from memory: re-read them.

- **City page:** https://www.kesennuma.miyagi.jp/sec/s084/030/010/010/20160921145744.html
- **Latest design manual (2026年5月20日更新, 28 pp):** https://www.kesennuma.miyagi.jp/sec/s084/030/010/010/20260520hoyaboyadesignmanual.pdf
- **取扱要綱:** https://www.kesennuma.miyagi.jp/sec/s084/030/010/010/youkou.doc ; **form 様式第1号:** .../siyousinnseisyo.doc ; **flowchart:** .../siyouhuro.pdf

## The rules (quotes)

- 「営利（販売等）を目的としないもので、立体物や動画以外の使用であれば、承認申請は不要です。下記よりダウンロードし、デザインマニュアルに従ってご使用ください。」 So a free, non-commercial STILL needs no application.
- 「営利（販売等）を目的とするものや立体物・動画を制作する場合は、事前の承認申請が必要となります。」 Anything that MOVES him is a 動画: approval first (使用承認申請書 to 気仙沼市産業部観光課, 0226-22-3438). The Kesennuma-address rule applies to commercial use only (取扱要綱 第3条).
- Design manual: do not change colour, balance, **pose** or expression; do not deform him, separate body parts, put text or other design on him, swap the サンマ sword, thicken the outline, or crop him (見切れ) except the No.13 art, which is drawn for it: 「黒い境界線までは、別のデザインを上から重ねることができます。境界線を越え、ホヤぼーや自身に別のデザインを重ねる使い方はできません」 (p.17).
- The credit is mandatory and must not be altered (p.4): 気仙沼市観光キャラクター「海の子 ホヤぼーや」 (or `Kesennuma City Mascot,Hoya Boya the Ocean Boy`), centred under him, in a medium Gothic.
- The design and the name are the city's registered trademarks; copyright and usage rights belong to the city. The illustrations are free to use under these rules; they are not under this repository's MIT licence.

## What the app does

| | |
|---|---|
| Standing still (No.1-9) | Since title v4 (2026-10-07). Shown as the city publishes it (byte for byte, SHA-256 pinned), whole and static: no animation, transition, fade, crop or overlay, no animated ancestor; cut with `display: none` at the hand-off. He stands beside the まめ知識 tip bar (above its left end on a phone in portrait), never behind or under a panel, and his open hand presents the tip. The credit is a caption centred under him (white with a 鉄紺 shadow), in the manual's balance (the first line smaller). No application needed. The peeking art No.13-2 (v3) was retired: it is drawn cut at a black line and cannot be shown whole. |
| Moving ホヤぼーや (runner) | **OFF.** `runner.json` `hoya.mode` is `"off"`; the progress head is our own original bonito. A guard (`sprite-runner.js assertHoyaAllowed`, tested) refuses `still` or `cycle` without an approval record and the credit. The pose copy lives in `data/hoyaboya-dev/` (not staged). `?hoya=run` shows level A on localhost only. |
| Application | not included in this repository: the application text (what to say, the form, the cover text), a mock of the layout with the official pose NO.1-5 as a placeholder, and the list of every official running, walking and exercise pose. |

## Levels of approval (docs/loading/RUNNER.md says how to switch each on)

- **A:** one official pose, unmodified, carried along the bar (only its position moves, plus a two-step bob of the position). Requested pose NO.1-5 (the hero running right).
- **B:** a run cycle drawn faithfully to the manual, only after the city has seen drafts. Not drawn.

## Never

No mirroring a pose (the manual forbids changing the pose; the city supplies mirrored pairs where it means them); no tracing, redrawing, rigging, cutting up or animating him ourselves for the shipped build; no text, percent or bar over him; no use in marketing, merchandise or the JPYC store.
