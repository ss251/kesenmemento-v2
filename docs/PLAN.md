# Roadmap

Kesennuma Living City is the real Kesennuma, drawn as a hand-painted anime town. People can fly over it, walk and
drive through it, find any place by name and step inside a few buildings, and it is kept alive with today's weather
and today's boats. This page covers where it stands, what the demo shows, what the city and its people could get from
it, and what would help it grow. It is the plan of an unofficial hackathon project: nothing in it has been agreed with
the city or any other organisation.

## Where it stands (October 2026)

These features are built and covered by `bun test` and by the end-to-end browser QA (`tools/anime/qa3.mjs`, which
includes the phone layout).

- **The whole city from real data.** Terrain, coastline, 14,469 roads and about 50,800 building footprints come from
  GSI. OpenStreetMap adds building levels, roof shapes, names, land use, rivers, signals and road names, and the GSI
  aerial photo gives every roof its colour and shape. Each value records its source.
- **Accuracy, measured.** An automated audit renders the town from straight above and compares it with the aerial
  photo and the maps. On the core, building coverage IoU is 0.84 (target 0.8), all 15 reference landmarks are within
  5 m, and the median roof colour difference is ΔE 10.2 against the 2020-22 aerial photo (the town follows newer
  references where they differ from it). The landmarks are modelled from reference sheets at their true size.
- **Survey-grade rebuilds.** The PIER7 plaza on the south shore and the fish market's roof deck and quay hall were
  rebuilt from on-site photos with structure from motion and are checked against the survey, feature by feature
  ([anime/survey/](anime/survey/)).
- **The whole core is explorable.** About 4.3 × 4.4 km, from 気仙沼駅 to the bay and from 鹿折 to 南気仙沼, streams in
  street-level detail around you. You can walk everywhere (buildings, quay edges and rivers are walls), drive a kei
  car on the real roads, or fly.
- **Finding your way.** Place search in Japanese and English over about 3,500 real names, a minimap, a full map, POI
  labels, and 51 places with a drone framing and a walk spot each: the 7 classic tour stops, 17 civic landmarks and 27
  places in town.
- **Walk-in interiors.** The fish market C hall's visitors' gallery over the landing floor, 男山本店's shop on 魚町,
  and the station's waiting hall with the day's departure board.
- **Real names.** Public buildings and the shops that OSM or GSI names carry their real names on their signs. Other
  shops have fictional names for their trade.
- **The harbour.** Boats in rows, the fish market's four halls and 海の市, 浮見堂, 五十鈴神社, the seawall with its
  flap gates, PIER7 and 迎, かなえ大橋 and 大島大橋, 亀山's monorail and the 浦の浜 terminal.
- **A playable ship.** 第一昭福丸, a 58.6 m tuna longliner at true scale, with three acts: the send-off, the longline
  set and haul, and the chain that brings the catch to Japan ([ship/](ship/)).
- **A phone tier.** A game-style touch pad and a low tier that fits phone memory
  ([MOBILE-CONTROLS.md](MOBILE-CONTROLS.md)).
- **Living layers.**
  - Five times of day and four seasons.
  - Rain and wet streets, and traffic signals that cycle.
  - Townspeople and cats, market crews and buyers.
  - Gulls and a harbour soundscape.
  - Weather from 気象庁 and today's arrivals from 気仙沼漁協. Listed boats glide into the market under their real
    names.
- **Ways to see it.** An auto tour, a tiny-planet overview, a photo mode (3840×2160 PNG), Japanese and English, and a
  phone layout.

Anything shown from saved data is labelled サンプル.

**Open gaps.**

- Frame rate on an idle machine has not been measured for the current build. With the browser throttled to background
  priority, a 1080p frame on high took 20 to 32 ms and the live app ran at 13 to 16 fps at 1600×900; the first build ran
  at 52 fps on the same Mac. 60 fps on high is the target.
- The first load takes 45 to 55 s under the throttle. The target is 10 s.
- Street-level streaming covers the core only; 唐桑, the outer 大島 and the far suburbs have terrain, footprints and
  roads but no street-level detail.
- 4K output has not been rendered yet.
- The sun keeps the 10 October path in every season, and the sea level does not follow the tide.

## The demo

The demo shows the town to people who know it and aims for one reaction: "that's Kesennuma." The 3-minute script is in
[DEMO.md](DEMO.md). It covers:

- the drone view over the inner bay at 16:30;
- today's live chip;
- a walk along the promenade and 浮見堂 at 夕焼け;
- finding a place by name (the station, or a shop someone in the room calls out);
- driving a kei car on the real roads;
- the full map of the city;
- today's first boat at the fish market at 06:30;
- winter and spring;
- the tiny planet;
- for questions: the walk-ins (the fish market gallery, 男山本店, the station), the town at night and the ship.

PIER7（ピアセブン）, the base of the Hackatsuon residency, is tour stop 3.

**What success looks like:**

1. People point at their own street or shop.
2. Someone asks, "can my shop be in it?"
3. Someone asks what it would take to make it public.

The rest of this plan answers those questions.

## What it could give Kesennuma

### 1. Tourism PR that looks like nothing else

A painted Kesennuma at any hour and in any season can be used for posters, social posts, a website header, or a
screen at the station and at 海の市.

- The tools already exist. `scripts/render/stills.js` renders the 16 hero frames and `scripts/render/film.js` renders
  a deterministic 30 s film along the inner bay at sunset. Both can render at 4K (`--size 4k`).
- Every published frame carries the credit line (© OpenStreetMap contributors · 出典：国土地理院 …) in its caption or
  on the frame.
- New frames are camera and time settings in a plan file, not new artwork. A seasonal campaign (sakura on 安波山's
  slopes in April, snow on the harbour in January) is therefore a render job, not a production.

### 2. An anime-pilgrimage-style promo (聖地巡礼)

Anime fans travel to stand where a scene was drawn. Here, every painted frame is a real place.

- **Stand-here spots.** Each of the 51 places has a drone framing and a walk spot on a real street, quay or deck. A printed map and
  a small plate at each real spot, such as the 浮見堂 walkway, the promenade by the seawall or the market quay, carry
  a QR code. The code opens the app at the same frame and hour. The app already supports this through URL options
  such as `?cam=x,y,z>lx,ly,lz&preset=yuyake`.
- **Photo mode as the souvenir.** Visitors take the real photo, then save the painted one from the app.
- **A short film route.** A 30 s film for social media, plus longer cuts for events. The film path is scripted, so a
  new route is a list of camera points.
- **Next to build:** the QR plates and map (a print job), and a "you are here" compare view that puts the phone photo
  beside the painted frame.

### 3. A digital twin residents can walk

Residents can walk and drive the whole core today, find their street by name and see its real shops. Next:

- **Wider walkable detail.** Stream street-level detail beyond the core: 大島, 唐桑 and the outer suburbs. Every
  footprint and road is already in the layout; the work is the tile coverage and the load budget.
- **Better buildings from better data.** Where OpenStreetMap has no `building:levels` or `height`, storeys are still
  *derived* from the GSI type, the footprint and the context, and wall colours are chosen. Roof colours and shapes
  come from the aerial photo. If the city can share building-use or height data (for example a building register or a 3D city
  model), the derived values are replaced lot by lot, and `lot.src` records the change.
- **More interiors.** The market gallery, 男山本店 and the station hall are walk-ins today. 海の市, リアス・アーク美術館
  and PIER7 are the next candidates.
- **Resident review.** Hold short sessions, for example at Pier 7, where residents fly to their own street and flag
  anything wrong: a missing shop, a wrong roof colour, a building that isn't there any more. Each fix is a small data
  edit keyed to the building (see [anime/OVERRIDES.md](anime/OVERRIDES.md)).

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
best coffee on 八日町". Stories make the model more than a map. The first story pin, a short sourced story about an
archaeological site in 唐桑, is already in the app (see [ship/SHOFUKUMARU.md](ship/SHOFUKUMARU.md)).

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

Since v4 a shop that OpenStreetMap or GSI names shows its real name on its signs. Every other shop front carries a
fictional name for its trade, generated to feel local (such as かき処 波音). A real shop can **claim** its storefront:
to put its name up where the maps have none, or to choose how it looks.

- **What a claim includes:** the lot, the real name, the sign style and 暖簾 colour, opening hours, a photo, a line
  of text and a link.
- **How it renders:** the town's shop builder already paints signs and 暖簾 from text and colour (`town/signs.js`,
  `town/realnames.js`), so a claimed shop shows its real name in the same hand-painted style.
- **The simplest route:** a shop that adds or fixes its name, shop type and hours in OpenStreetMap appears in the app at
  the next data build, with no claim process at all.
- **Verification:** each claim is verified by the shop itself, through the city, the chamber of commerce, or a
  member network such as the 気仙沼クルーカード shops.
- **What changes in the code:** the real-name path already exists; a verified claims file becomes one more source in
  the fold precedence (`scripts/anime/enrich/fold.js`), and the brand blocklist test (`test/v3-town.test.js`) keeps
  guarding the fictional catalogue.
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

- **60 fps at 1080p on an M-series Mac.** First measure the current build on an idle machine. The renderer is limited
  by draw calls (about 900 to 1,500 per frame in v4, up from 560 to 1,060 in v3, with the landmarks and the streamed
  pools). The next steps are to merge the harbour's night-lamp materials and the remaining distinct emissive and
  textured materials into atlases, to use a coarser batching cell for the harbour, and to cap the stream pools per
  frame.
- **Load time under 10 s.** About 4 s goes into drawing Japanese text into canvas textures. Bake the sign atlases at
  build time instead.
- **4K.** Render the stills, the film and photo mode at full size and review every frame. Some v3 stills were framed
  on things v4 removed as inaccurate (the timber promenade deck of `promenade_deck`, for example), so review those
  frames first.
- **Accuracy.** Keep the audit in the loop: re-run `tools/anime/accuracy.mjs` after every change to the town, and
  extend it beyond the core disc (the whole z18 ortho with `--region ortho`).
- **Hosting.** A public URL: the static `dist/` on a CDN plus the small `/api/live` service, with the same polite
  polling (at most every 10 minutes per source, shared by all visitors).
- **Phones.** The low tier already loads on a 390×844 phone. Tune the hero radius and props for mid-range Android
  devices.

## What would help

1. **A contact and a home.** If the city or a local organisation wants to host the app or link to it, one person who
   can say yes to a public launch (for example in the planning or tourism section), and an agreed place for it to
   live, such as a link from the city's tourism pages.
2. **The co-op's agreement for the arrivals.** The app reads the 気仙沼漁協's public 入船情報 pages today and credits the
   co-op on screen. An official feed, or the co-op's explicit agreement, would be a better basis. Landings and prices by
   species would also need the market's agreement.
3. **A shop-claim partner.** Someone who can confirm that "this storefront belongs to this shop": the city, the
   chamber of commerce, or the Crew Card network. Help reaching the first 20 shops on the inner bay would also be
   welcome.
4. **A story partner.** A community group that can collect and approve residents' stories, and run a review session
   or two.
5. **Place knowledge.**
   - Where the cherry trees and festival spots are.
   - Photos and drawings of public buildings, for accuracy and for more interiors.
   - Permission to model public buildings in more detail.
   - Any building height or use data the city can share.
   - Residents' corrections. Many can go straight into OpenStreetMap, which the app reads; the rest become data fixes
     keyed to the building (`src/anime/world/lotfix.js` holds these, each with its source).
6. **Brand guidance.** How the app may use the city's name, and whether it may use the city's logo or mascot.
   Until there is guidance, the app uses only the place name 気仙沼 and no logos or mascots.

## Principles

- **Real place, real public names.** The geography is real, and so are the names of public places and of the shops
  that the open maps name. Other businesses get fictional names until they claim their storefront. Sensitive names are
  filtered out (`SENSITIVE` in `scripts/anime/enrich/fold.js`).
- **Accuracy over invention.** Every value records its source, uncertain things are researched rather than guessed,
  and the audit measures the result against the aerial photo.
- **Honest data.** Anything live says ライブ, and anything saved says サンプル. Nothing from a sample is ever shown as
  live.
- **Credit.** Keep the sources on screen: © OpenStreetMap contributors, 国土地理院, 気象庁, 気仙沼漁協, and Sakuragaoka
  Station (MIT) by Kenton-GMI.
  The terms are in [DATA-SOURCES.md](DATA-SOURCES.md).
- **A living town.** The tone is everyday life on the bay: morning boats, school kids, cats on bollards, lit windows.
