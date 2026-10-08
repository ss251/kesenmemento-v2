# Underwater

You leave the quay, or a stopped boat, and you are the fish. Inside the bay that fish is an アイナメ. Past the bay mouth it is a カツオ. Swim up hard and you leave the water in an arc. That leap is the point of the mode.

## Enter and leave

- On foot, at the edge of the water (shore distance between 0.25 m and 7.5 m inland): 「もぐる」.
- From the ship, only while she is barely moving (under 0.35 m/s): the same button. The boat stays where she is. V, R or F brings you back aboard, not ashore.
- 「魚になる」 in the corner (and, once the kit notebook is mounted, its 魚になる tab) puts you in the shallows by 浮見堂.
- Leave with 「あがる」, or V, R or F. On a desktop 「あがる」 is a key-cap button (V) in the kit's action row, so the way out is always on screen. You come back exactly where you were (the quay you dove from, the drone, the boat), with the lens, the pad and the HUD as they were. A tour or the planet view also puts you back.
- `?play=0` does not mount the mode. `?swim=1` (or `raft`, `school`, `breach`, `apex`, `katsuo`, `hoya`, `shafts`) starts already in the water, for stills. `?motion=full` keeps the camera beat even when the system asks for reduced motion.
- The world under the water (the fish, the rafts and ropes, the アマモ, the crops, the schools, the jellyfish, the bubbles) is built when a dive starts, not when the town loads. A dive from the hub, the shore, the boat or the notebook goes in behind the あそぶ wipe and title card while it is built, its programs compiled and its buffers uploaded (`play/kit/lazy.js`), so the first frame under the water is the finished world. On a phone it is freed when you come up; the next dive builds it again behind the card. The mount itself is only the offer, the HUD, the keys and the hub card.

Reduced motion keeps the leap, the apex hang and the sound, and drops the camera punch, the roll, the field-of-view kick and the barrel roll. The tail only barely wags. A tap in the air still shows 「ナイスジャンプ！」.

## Feel

| | |
| --- | --- |
| Cruise | 4 m/s |
| Dash | 9 m/s, 2.6 s tank, then a wait until it is a third full |
| Coast | the water keeps you moving (drag 1.55 /s) |
| Leap | upward speed above 3.4 m/s, and 5 m/s overall, at the surface: only a dash gets there (the cruise is 4 m/s), and the way a player tries it works, stick forward + 上へ + ダッシュ, from the hub's start depth or from a fish resting at the surface (a dash keeps its climb under the skin of the water). Until v7 it took 5.15 and 6.1 m/s, which that input never reached (4.3 m/s up). The kick is 9.4 m/s against 10.2 m/s², so the fish clears about 4 m. The first leap of a dive holds 0.2 s of wall time at the apex, at 0.28× speed. A tap above 1.15 m spins the body (11.5 rad/s, drag 0.45) |
| Follow camera | a three-quarter view from behind: 0.85 m to the fish's right, looking 0.3 m ahead of it and 0.33 m above, so the fish sits in the middle, a little low, and its stripes and fins read (chosen from seven rigs shot on a phone and a desktop). 3.1 m back at a 55° lens; with a wider lens the boom shortens in proportion (to 2.05 m at a portrait phone's 88°), and the lens follows `core/fov.js` for the screen as it is now (a phone turned mid-dive). Held just under the surface so a downward look does not pop into the air. Until v7 it sat 1.15 m aside and looked 2.6 m ahead: the fish was tail-on in the left third of a phone. During the leap the camera stays 2.65 m behind and a little below the fish, so the body stays large against the sky. The beat adds up to 11° of field of view and a small roll. Leaving the water and coming back each punch the field of view by 6.5° for 0.16 s |

The sky and the low-pass follow the camera, not the mode. Underwater the town is muffled (680 Hz). As the fish clears the surface the sky comes back and the filter opens, so the splash is bright.

## The water

No extra render target. The water is a branch in the existing cel, terrain and water shaders, and in the sky dome, on only while `uSwim` is 1 (the camera is below the surface). The numbers are in `logic.js` (`WATER`), and `fog.js` builds its GLSL from them, so the tests check what the GPU draws.

- **Colour by depth.** 浅葱 lifted toward 新橋色 (#3FB8C0) at the surface; 浅葱 leaning to 青緑 (#00A39F) by 7 m; 藍 (#165E83) by 16 m; 鉄紺 (#17184B) by 32 m. Looking up reads brighter and looking down deeper. The sun's side glows a little (forward scatter).
- **Visibility.** About 22 m: per channel, `1 − exp(−(d·k)^1.55)` with k = (0.091, 0.074, 0.077) per metre. A thing 2 m away keeps its colour, at 10 m it is half water, by 25 m it is gone. Red goes first.
- **Light at depth** fades per channel too (`exp(−h·(0.075, 0.032, 0.026))`). Night dims it to 14 % and turns the caustics and the shafts off.
- **The sky dome** under the water is the fog colour at 60 m, so the far water has no seam.
- **Caustics** are a crisp, curved Voronoi network (F2 − F1 with two gentle warps), projected along the refracted sun. They are applied before the fog, on surfaces that face the light, and soften with depth.
  - The lines keep one pixel-sharp width and fade to their mean where they would alias.
  - Desktop draws two nets, the phone one. There are no textures and no transcendental calls in the loop.
  - They are evaluated relative to a whole-cell origin near the eye, with a fixed scale. World coordinates ~4 km out keep only ~0.3 mm in float32; that striped close objects in round 3's first pass.
- **The surface from below** is a real Snell's window: refraction at 1.333 through animated normals (a low swell and a fine chop).
  - Inside the 48.6° cone, the sky is a bright disc with the horizon as a thin ring at its edge and the sun as a glint. The same net ripples across it.
  - Outside the cone, the surface mirrors the water below.
  - It stays under the bloom knee.
- **Shafts** are 5 (phone) or 6 thin, soft quads along the refracted sun. They are anchored to a 12 m world lattice, so they stream past as you swim. Each adds at most 0.17, and they fade near the eye and in the distance.
- **Bubbles** leave the gills in puffs: every 0.9 s at rest, 0.32 s swimming, 0.12 s on a dash. They are crisp rings with a highlight, capped in size.
- **Plankton** is anchored to the world in a 12 m cube around the eye.
- **Outlines and culling.** Under the surface the outlines fade between 4 and 14 m, and the colour pass skips town cells past 90 m (`renderer.setViewMax`).

The terrain mesh skips water cells, so the bay has no floor of its own. The dive draws one:
- **Sand** under the inner bay and the farm, with ripple marks about 30 cm apart in three toon tones and silt patches.
- **Rocks** with a little growth on top, on a jittered 9 m grid where the bed is 1.5–12 m down.
- **アマモ meadows** in the 浮見堂 shallows and by the school's home: shoots of three to five blades, 2.5–6.5 m down, swaying as a wave rolls through.
- **Kelp** standing in the shallows, olive-brown with a midrib.

All of this is one static draw. The model's seabed under the photographed rafts is about 14 m. The inner bay by 浮見堂 is about 4–8 m.

The camera stays in the water and off the bed: near a bank it pulls in toward the fish rather than end up inside the slope. During the leap it keeps clear of the land. A bay boat whose hull holds the camera is hidden while it does. That hull was round 2's "purple slab" at the apex.

## Farms

The raft blocks are the ones already in the harbour, measured off the GSI z15 photo south of 朝日町, off the 波路上 breakwater (`src/anime/world/harbor/rows.js`, `southA` and `southB`). They are not moved. The east edge of `southB` sits about 4 m from the outbound channel. That is the photographed edge. New lines are a different rule: they stay at least 80 m off that channel.

The photo does not name the crop. ホヤ hangs under `southA` and oysters under `southB` because both are grown on hanging ropes in this bay, not because the picture says which block is which. Wakame is a longline near the bay mouth. Scallops are a longline in the water west of 大島磯草. 小泉湾 is named for ホヤ on the prefecture page, and it falls outside the play box, so it is not placed.

On a phone the harbour does not build the surface rafts, so the underwater mesh adds a simple bamboo underside there. Desktop uses the harbour rafts and only hangs the ropes.

**マボヤ** (modelled from scratch, no photo used):
- **The body:** an egg on a short stalk. Its tunic is a diamond lattice of knobs, red-orange (紅緋 #E83929), with paler knob tips and deep-red valleys.
- **The siphons:** two, with pale rims (柑子色 #F6AD49): the oral one at the top with a + opening, the atrial one on the shoulder with a −.
- **On the rope:** they grow in clumps of three to five all down each rope, 11–18 cm tall, rooted on the rope and leaning out.
- **Reading distance:** within 9 m (7 m on a phone) each one is drawn. To 26 m each clump is one proxy. Past that the water has them.

**The other crops:**
- **Oysters:** an oyster rope carries a rough clump of grey-white shells with purple-grey lips every 30 cm.
- **Scallops:** a scallop rope carries one lantern net of nine tiers. Its diamond mesh is cut by the shader, and three shells lie on each floor.
- **Wakame:** fronds hang from the wakame ropes: a midrib with ruffled, paler edges.
- **Sway:** every crop sways with its own rope's phase.
- **The near set:** it is refilled from precomputed data when the eye moves 1.2 m. A frame without a refill writes nothing.

The phone gets float drums under each raft.

Sources:

- 宮城県, 気仙沼地域の海中案内. Wakame longlines at the bay mouth, oyster gear, scallops at 大島磯草, sea-squirt culture, and the bay as the home of longline culture. https://www.pref.miyagi.jp/soshiki/kesenmuma-s/kesennuma-kaityu.html
- 気仙沼観光, カキ養殖. Calm inner water uses rafts. The outer water uses longlines. Oysters, scallops, sea squirts, wakame and kelp are grown that way. https://kesennuma-kanko.jp/oshietesensei-kakiyoushoku/
- 気仙沼市, 気仙沼の水産. Oysters, wakame, kelp and scallops along the coast. https://www.kesennuma.miyagi.jp/sec/s074/010/010/010/010/1174375791459.html
- 磯草漁港. Scallops, and アイナメ among the fish landed. https://fishing-port.jp/fishingpordetail/isokusa/

## Life

Every fish comes from one parametric body, with real fins and an eye with a catchlight, and one toon pattern per species:
- **アイナメ:** mottled olive-brown, one long notched dorsal, a square tail.
- **カツオ:** a dark back, belly stripes, a deep fork.
- **イワシ:** a blue-green back, silver flanks, a row of dark spots.
- **メバル:** a deep body, a big eye ringed gold, a spiny dorsal, faint bars.

The fish you are has a rim light, so it reads against any water.

**The schools:**
- Four schools of イワシ, 60 each (34 on the phone), about 15 cm long. Only the school nearest you steps.
- They keep a body length apart, read their neighbours within 1.7 m, and part round you at 2.2 m.
- Each fish banks into its turns and flashes silver as it turns.
- A dash inside 8 m throws the school apart (up to 4.5 m/s), and it reforms when the dash stops.

**The others:**
- A pair each of アイナメ and メバル pass on their own loops.
- ミズクラゲ drift and pulse on the shader: a clear bell with the four gonad rings, a scalloped rim and a fringe. They now show on the phone too.
- Life is four draws.

While you are not swimming, all of these meshes are hidden. The extra draws exist only for the dive.

## 「海の中」 in the あそぶ hub

The mode registers itself with `kit.registerMode` (PLAY-ENTRY §5):
- **The card:** title 「海の中」, hook 「魚になって、気仙沼湾を泳ごう」, about 3 minutes, one star, one player.
- **The card still:** `data/play/art/underwater.webp` (960×600, 28 KB).
- **The start:** はじめる puts you at the quay nearest the 浮見堂 spawn, 7.5 m out and one stroke under, facing the bay, turned (up to 0.9 rad) to the nearest open view when a pile, a hull or the bank is in it. `clearestYaw` scores each heading by what the camera would see: a fan of rays from where the camera sits across a desktop's ±40° lens, against the banks, the physics and the meshes around the start (the quay's piles are drawn, not colliders); straight ahead must be open for 14 m, the sides less (12 m at 12°, 8 m at 25°, 6 m at 40°). If no heading is open, the start moves out to 10.5, then 13.5 m. Once, in the mode's prepare(), behind the title card.
- **The coach:** `ui.coach` shows one line for the first swim, from the hub or from the shore: 「なぞって、泳ごう」 with its spotlight on the stick on a phone, 「W A S D で泳いで、Space で上へ」 ringing the fish on a keyboard. No dim (the fish is the subject). It completes with わかった or once you have swum 3 m. The kit places its bubble for its real size, off the stick and the buttons (`kit/coach.js placeBubble`).
- **One teacher at a time:** after the coach, once the fish swims, 「水面へ勢いよく上がると、跳ねます。」; in the air on the first leap, 「空中でタップすると、一回転します。」 (「空中で Space を押すと、一回転します。」 on a keyboard). Each once per visit, just above the thumbs' controls.

Both kit calls are guarded until the kit has them.

## Sound and the pad

Town sound goes through `ctx.audio.setUnderwater` (680 Hz). The leap opens that filter before the splash plays, so the hit stays bright. Coming back in plays the splash again, lower, and a deep whump (the kit's `stamp` voice, pitched down). They respect mute (M / ♪). A tap during the leap toasts 「ナイスジャンプ！」. The corner button and the notebook's 魚になる tab both put you in the shallows by 浮見堂. The species chip takes the first free spot under the live HUD (`hud.js findSlot`: the left column, then the middle, then the right), re-checked twice a second, so it never sits on あそぶ, 手帳 or the counter, whatever the HUD's layout. On a first dive it waits until the coach has gone (on a phone the coach's bubble, kept off the fish and the controls, needs the chip's band). Opening the book tucks the hint, and on a short landscape screen it tucks the chip too. The touch pad's swim mode is 上へ, 下へ, ダッシュ and あがる (上がる / 下がる until v7: 「上がる」 beside 「あがる」 read the same).

While you swim, `body.klc-swim` is set (as the voyage sets `body.klc-ship`) and the land controls step out: the boarding chip 「第一昭福丸 乗船する」, 運転, the walk / drone view toggle and the ホヤぼーや credit (he is not on screen).
