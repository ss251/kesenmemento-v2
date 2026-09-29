# The living-city plan

Kesennuma Living City is the real Kesennuma, drawn as a hand-painted anime town. People can fly over it or walk
through it, and it is kept alive with today's weather and today's boats. This page covers where it stands, what it
shows on Oct 10, what the city gets from it, and what it needs from the city to become the city's own.

## Where it stands (v3, 2026-09-29)

These features are built and checked by `bun test` (242 tests) and by the end-to-end browser QA
(`tools/anime/qa3.mjs`, 32 of 32 checks passing).

- **The whole city from GSI open data.** It covers the terrain, the coastline, 14,473 roads and all 50,826 building
  footprints. The inner bay (内湾) is detailed enough to walk in: 八日町, 魚町, 南町, 神明崎, Pier 7 and the seawall
  promenade.
- **The harbour.** 70 boats are moored in rows. The fish market, 浮見堂, 五十鈴神社, the 安波山 lookout, かなえ大橋 and
  大島大橋 are all modelled.
- **Living layers.**
  - Five times of day and four seasons.
  - Rain and wet streets.
  - 33 townspeople and 7 cats.
  - Gulls and a harbour soundscape.
  - Weather from 気象庁 and today's arrivals from 気仙沼漁協. Listed boats glide into the market under their real
    names.
- **Ways to see it.**
  - Eight tour stops and an auto tour.
  - A tiny-planet overview.
  - A photo mode (3840×2160 PNG).
  - Japanese and English, and a phone layout.

Every shop name is fictional for now, and anything shown from saved data is labelled サンプル.

**Open gaps.**

- Frame times are about 11 to 19 ms on an M2 Max at 1080p under the machine throttle; the fish-market view still
  misses 60 fps.
- The first load takes about 20 s.
- 唐桑 is not a tour stop yet: the peninsula has no villages or detailed land cover.
- 4K output has not been rendered yet.
- The sun keeps the Oct 10 path in every season.

## Oct 10: the demo

The demo shows the town to people who know it and aims for one reaction: "that's Kesennuma." The 3-minute script is in
[DEMO.md](DEMO.md). It covers:

- the drone view over the inner bay at 16:30;
- today's live chip;
- a walk along the promenade;
- 浮見堂 at 夕焼け;
- the town at night;
- today's first boat at the fish market at 06:30;
- winter and spring;
- the tiny planet.

Pier 7 (第7岸壁), the base of the Hackatsuon residency, is tour stop 3.

**What success looks like on the day:**

1. People point at their own street or shop.
2. Someone asks, "can my shop be in it?"
3. Someone from the city asks what it would take to publish it.

The rest of this plan answers those questions.

## What the city gets

### 1. Tourism PR that looks like nothing else

A painted Kesennuma at any hour and in any season can be used for posters, social posts, a website header, or a
screen at the station and at 海の市.

- The tools already exist. `scripts/render/stills.js` renders the 12 hero frames and `scripts/render/film.js` renders
  a deterministic 30 s film along the inner bay at sunset.
- From Oct 1 the machine can render them at 4K.
- New frames are camera and time settings in a plan file, not new artwork. A seasonal campaign (sakura on 安波山's
  slopes in April, snow on the harbour in January) is therefore a render job, not a production.

### 2. An anime-pilgrimage-style promo (聖地巡礼)

Anime fans travel to stand where a scene was drawn. Here, every painted frame is a real place.

- **Stand-here spots.** Each tour stop has a drone framing and a walk spot on a real quay or deck. A printed map and
  a small plate at each real spot, such as the 浮見堂 walkway, the promenade by the seawall or the market quay, carry
  a QR code. The code opens the app at the same frame and hour. The app already supports this through URL options
  such as `?cam=x,y,z>lx,ly,lz&preset=yuyake`.
- **Photo mode as the souvenir.** Visitors take the real photo, then save the painted one from the app.
- **A short film route.** A 30 s film for social media, plus longer cuts for events. The film path is scripted, so a
  new route is a list of camera points.
- **Next to build:** the QR plates and map (a print job), a "you are here" compare view that puts the phone photo
  beside the painted frame, and more stand-here spots beyond the inner bay.

### 3. A digital twin residents can walk

Residents can walk the inner bay today. Next:

- **Wider walkable detail.** Grow the full street-level zone beyond its current 380 m radius: first along the market
  district and 魚町, then 南気仙沼, 鹿折 and 大島. The limit is the draw-call budget (see the engineering track below),
  not the data. Every footprint is already in the layout.
- **Better buildings from better data.** Storeys, roof shapes and shop uses are currently *derived* from footprint
  size, road class and the aerial photo. If the city can share building-use or height data, the derived values are
  replaced lot by lot.
- **Resident review.** Hold short sessions, for example at Pier 7, where residents fly to their own street and flag
  anything wrong: a missing shop, a wrong roof colour, a building that isn't there any more. Each fix is a small data
  edit keyed to the building.

## Features on the roadmap

### Seasons, done properly

- **Built:** the 春・夏・秋・冬 toggle (K). It changes tree colours, puts snow on roofs, ground and trees, adds falling
  petals or snowflakes, and recolours the painted hillsides.
- **Next:**
  - Move the sun to each season's own date: an April morning, a July noon, a January afternoon.
  - Add real cherry-tree models where Kesennuma's sakura actually are. The city can tell us where.
  - Snow that piles on the seawall and boat decks.
  - Festival days. On a festival date the town gets its decorations, lanterns and crowds, for example
    気仙沼みなとまつり in summer or the autumn bonito festival at 海の市.

### Citizen stories on buildings

Tap a building and read what it means to someone: "my grandmother's shop", "where we waited for the boats", "the
best coffee on 八日町". Stories make the model more than a map.

- **Data model.** Each story attaches to a building footprint.
  - The layout's lot ids (`z/x/y/featureIndex`) come from GSI tile indexing and can change when GSI updates its tiles.
    So each story stores the footprint's latitude and longitude as well, and is re-matched to the nearest footprint
    when the layout is regenerated.
  - A story holds its text (JA/EN), an optional photo, the author's display name, the date and a consent flag.
- **Moderation.** Stories are opt-in and reviewed before they appear. No personal addresses or faces go up without
  consent. The city or a community partner holds the approval step.
- **In the app.** Buildings with a story get a small warm marker. Tapping one opens a card and flies the camera to a
  good framing. The auto tour can include a "stories" route.

### Local shops claiming their storefronts

Today the 64 shop fronts in the inner bay carry fictional names such as かき処 波音 and 菅原酒店, generated to feel
local. A real shop can **claim** its storefront.

- **What a claim includes:** the lot, the real name, the sign style and 暖簾 colour, opening hours, a photo, a line
  of text and a link.
- **How it renders:** the town's shop builder already paints signs and 暖簾 from text and colour (`town/signs.js`), so
  a claimed shop shows its real name in the same hand-painted style.
- **Verification:** each claim is verified by the shop itself, through the city, the chamber of commerce, or a
  member network such as the 気仙沼クルーカード shops.
- **What changes in the code:** the brand blocklist test (`test/v3-town.test.js`) must allow names from the verified
  claims file, and still refuse everything else.
- **Other lots:** shops outside the current shop lots can be claimed too; a claim can turn a house lot into a shop
  front.
- **Benefit for shops:** a shop that claims its front appears in the tour, in stills and in the film, and is easy to
  find on the pilgrimage map.

### Live port data

- **Built:** today's arrivals from 気仙沼漁協. The vessel name, ETA, fishery type, catch and tonnage are shown in the
  panel and as labelled boats gliding into berths. Weather from 気象庁 drives the clouds and rain. If a feed fails,
  the app falls back to the last good copy and then to the labelled sample.
- **Next, with the data owners' permission:**
  - Use an official arrivals feed instead of parsing the public mobile pages.
  - Show landings and prices by species on a market board in the app.
  - Drive the rendered sea level from the tide. `/api/live` already serves the 大船渡 tide, and the water already
    follows `SEA.level`; the two only need to be connected.
  - Add ferry and bus times at the piers.
  - Show weather warnings as on-screen notices.

### Engineering track

- **60 fps at 1080p on an M-series Mac.** The renderer is limited by draw calls (about 800 to 1,100 per frame). The
  next steps are to merge the harbour's night-lamp materials and the remaining distinct emissive and textured
  materials into atlases, and to use a coarser batching cell for the harbour.
- **Load time under 10 s.** About 4 s goes into drawing Japanese text into canvas textures. Bake the sign atlases at
  build time instead.
- **4K.** Once the build machine allows it (2026-10-01 00:00Z), render the stills, the film and photo mode at full
  size and review every frame.
- **Hosting.** A public URL: the static `dist/` on a CDN plus the small `/api/live` service, with the same polite
  polling (at most every 10 minutes per source, shared by all visitors).
- **Phones.** The low tier already loads on a 390×844 phone. Tune the hero radius and props for mid-range Android
  devices.

## What it needs from the city

1. **A contact and a home.** Name one person in the city (for example 企画課 or the tourism section) who can say yes
   to a public launch. Agree where the app lives, for example a link from the city's tourism pages.
2. **気仙沼漁協's blessing for the arrivals.** The app reads the co-op's public 入船情報 pages today and credits the
   co-op on screen. Before launch we need its permission, and ideally a simple official feed. Landings and prices by
   species would also need the market's agreement.
3. **A shop-claim partner.** Someone who can confirm that "this storefront belongs to this shop": the city, the
   chamber of commerce, or the Crew Card network. We also need their help reaching the first 20 shops on the inner
   bay.
4. **A story partner.** A community group that can collect and approve residents' stories, and run a review session
   or two.
5. **Place knowledge.**
   - Where the cherry trees and festival spots are.
   - Photos of 浮見堂, the market and the lookout for accuracy.
   - Permission to model public buildings in more detail.
   - Any building height or use data the city can share.
6. **Brand guidance.** How the app may use the city's name, and whether it may use the city's logo or mascot.
   Until we hear back, the app uses only the place name 気仙沼.

## Principles

- **Real place, fictional business.** The geography is real. A business name appears only when that business has
  claimed it.
- **Honest data.** Anything live says ライブ, and anything saved says サンプル. Nothing from a sample is ever shown as
  live.
- **Credit.** Keep the sources on screen: 国土地理院, 気象庁, 気仙沼漁協, and Sakuragaoka Station (MIT) by Kenton-GMI.
  The terms are in [DATA-SOURCES.md](DATA-SOURCES.md).
- **A living town.** The tone is everyday life on the bay: morning boats, school kids, cats on bollards, lit windows.
