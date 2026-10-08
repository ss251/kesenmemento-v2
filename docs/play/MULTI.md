# Together, in the town

Remote friends are drawn in two batched meshes: one body, and a flag on a boat. The room colour is an accent, never a name.

| Mode | What you see | Accent |
| --- | --- | --- |
| car | The kei van's vertex-colour body, facing the same way as the van you drive | The friend's colour tints the van |
| avatar | The faceless stand-in. A custom character is not baked into a friend's body | The name-tag dot. He is never recolored |
| gull | The ウミネコ from the gull lane (`flockGeo`) | The name-tag dot |
| fish | The swimming fish geometry, belly and back painted in | The name-tag dot |
| boat | A low hull at the real length: 第一昭福丸 58.6 m (`vehicle` 0), 第五凪丸 28 m (`vehicle` 1) | A small flag in the friend's colour |

The bodies are baked when you create or join a room, not when the town loads: a visitor who never plays together never pays for the van or the hulls.

Stand-ins, and only stand-ins, when a bake throws (no town materials, a missing module):

- The garage decal atlas, the glass, and the plates stay on the car you drive. One batch cannot carry eight different textures.
- The full 第一昭福丸 build and the harbour 第五凪丸 are the ships you sail. A remote hull is the low one above, because the full builds are tens of thousands of triangles.
- The fish cel shader is not instanced. The remote fish is the same silhouette with vertex colours.
- `origin/feat/play-underwater` is not on the remote. The fish geometry is the local `feat/play-underwater` branch.

A shared start uses the lane that owns the gates. `car` calls `courses.start('minato', { at })`, where `at` is the performance-clock instant that course's countdown begins (2160 ms before the server GO, the kit's 3 · 2 · 1). `race` calls `race.start({ at: go })`, where `go` is the server GO in epoch milliseconds; that lane waits out its own lead. Their finish events call `finishTogether(ms)` once: the course bus `{ id, ms, medal }`, and the night race's finish. The numerals on screen are this lane's, at the kit's size (120 px, 紺 outline, 「GO!」 in 山吹). The kit's own 「3」 stays hidden for that beat. If the course call fails, ゴール is still there.

## Entering

「みんなで」 registers on the あそぶ hub when `kit.registerMode` exists (`id: multi`, order 70). Until that export lands, the menu item みんなであそぶ opens the same lobby. The lobby makes a room or joins with the あいことば. The code is four big letters and a copy button. The first room on this device shows 「あいことばを 友だちに おしえよう」. That seen-flag is the only thing kept, and it never leaves the device.

While you are in a room, the solo スタート at the 港町 gate stays hidden. The host gets a 山吹 スタート on the same spot. A guest sees 「スタートを待っています」. During the race the top of the screen is the people chip and, after GO, the timer. The book, the counters, and 魚になる step aside until the race ends.

## The board

みんなのタイム is a full results screen: the winner's time, a 金 medal on the first row, your row on a 山吹 bar, もう一回 and やめる. There is no rank number and no saved best. The stamp 「いちばん！」 is only when your fish finished first, and only for this room.

Name tags fade from 18 m to 72 m. A building hides one; the van you are sitting in does not. Off-screen friends leave the tag and keep one screen-edge arrow, unless a course or the night race is already using that arrow for the next gate. Tags step aside while the finish card is open. A stamp is a paper balloon for 2.5 s. The corner chip is `{n}人`.
