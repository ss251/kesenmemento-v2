# 「JPYCで買えるお店」 / Shops that take JPYC (Phase 1: link-out checkout)

Walk into the app, open ☰ → 「JPYCで買えるお店」, pick a shop, see what it sells on [JPYC EC](https://ec.jpyc-service.com)
(the JPYC marketplace run by MAMETA), and tap 「JPYCで買う」: the product page on JPYC EC opens in a new tab, where the buyer's wallet
signs. The app **reads** and **links out**. It never takes a payment, holds money, touches a wallet or keeps a detail of a buyer
(Phase 2, an in-app checkout, is not built: see the end).

**Production shows none of this until a shop is switched on** (next section): as committed, the data file has the demo shop switched off,
so there is no ☰ item, no sheet and no request to JPYC EC.

| Part | File |
|---|---|
| The panel (modal sheet, own inline style, all states) | `src/anime/ui/jpyc-store.js` |
| Its pure parts: schema, gates, links, price and stock words, the checks on the proxy's answer | `src/anime/ui/jpyc-lib.js` |
| Strings, JA and EN | `data/ui-jpyc-i18n.json` |
| The shops (the data file, and the proxy's allowlist) | `data/shops/jpyc.json` |
| The cached read proxy of the production server | `server/app/jpyc.js` (+ the route in `server/app/server.js`, staged by `server/app/stage.sh`) |
| The ☰ item, the credits line, the mount | `src/anime/ui/hud.js` |
| A stand-in for JPYC EC with the real proxy in front, for tests and demos | `tools/anime/jpyc-mock-api.mjs` |
| The responses recorded from the real API on 2026-10-06 (no personal data) | `test/fixtures/jpyc/` |

## THE SWITCH: production shows nothing until a shop is switched on

**As committed the feature is off.** `data/shops/jpyc.json` holds one entry, JPYC EC's own demo shop, with `"enabled": false`. With nothing switched on a production build has **no ☰ item, no sheet, no credits line,
no style and no key handler**; the server answers **404** to every `/api/jpyc` route and **never asks JPYC EC for anything** (the background warm-up has no shop to refresh either); and `ctx.services.jpyc` is
published disabled (`enabled: false`, `has()` and `open()` say no), so the splat-interiors lane's 「JPYCで買う」 button stays hidden.

An entry is **on** when:

| Entry | On when |
|---|---|
| a **demo** shop (`"kind": "demo"`: JPYC EC's own `is_demo` shop) | it says **`"enabled": true`**. Every demo entry must carry the key, true or false (CI fails without it), so the switch is always there to see in the file |
| a **Kesennuma** shop (`"kind": "kesennuma"`) | its **`consent`** record is filled in (owner, a real date, a scope with `jpyc-listing`), and it does not say `"enabled": false` |

`"enabled": false` hides any entry (a parked shop keeps its record). The flag alone never shows a real shop: consent is the owner's word. The rule is one function in two copies, `entryVisible` in the app
(`src/anime/ui/jpyc-lib.js`) and `entryAllowed` in the server (`server/app/jpyc.js`), and `test/jpyc-schema.test.js` runs one table of several hundred entries through both and fails if they differ.

### To switch it on

- **The demo shop (for the stage):** in `data/shops/jpyc.json` change the demo entry's `"enabled": false` to `"enabled": true`; `env -u NODE_OPTIONS bun test test/jpyc-*.test.js`; commit; take the usual gated deploy
  (`server/app/README.md`). The app is built and the data file staged from the same commit, so the browser and the server always agree. `"enabled": false` and a redeploy hides it again: the file is the kill switch.
  The demo is labelled デモ（実際の店舗ではありません） everywhere it appears and is never attributed to a Kesennuma business.
- **A real shop:** add its entry with the consent record (see "Adding a shop"); it is on as soon as that is in the file. Nothing else to flip.
- **Check it:** the server prints `jpyc: on for <slugs>` at start (`jpyc: off (…)` when nothing is switched on); `curl localhost:<port>/api/jpyc/shops/<slug>/products` answers 200 for a switched-on shop and 404 for anything else.

### To look at it before switching it on (no deploy, no real platform)

`?jpyc=dev` on the **developer's own machine** (`localhost`, `127.0.0.1`, `::1`, `*.localhost`) lists every valid entry of the file, including the ones that are switched off or have no consent yet, labelled 【開発用】
(and the alcohol rule still holds). On any other host the parameter is ignored: nobody can preview on production what the file keeps off. Run it with the stand-in platform (`tools/anime/jpyc-mock-api.mjs`, see
"Tests"). A server started with `JPYC_DEV=1` lifts the switch for the proxy in the same way: **never set it on production** (it is the literal `1`, and no deploy step mentions it).
A phone (or the public mirror) is not a dev host, so `?jpyc=dev` does nothing there: to show it on a phone before the choice is made, flip `"enabled"` in a **local, uncommitted** copy of the data file, build that and serve it with the
stand-in (`tools/anime/jpyc-mock-api.mjs --app`): the flag is then the only difference between the preview and the real thing.

## The rules (each one is enforced in code and pinned by a test)

| Rule | Where it holds |
|---|---|
| **Read-only.** The app never buys, signs, calls a wallet or sends a message to anyone; the proxy only does `GET`, with no identity | no wallet, signature, payment, cookie or storage code exists in the panel (`test/jpyc-store.test.js` fails on `signTypedData`, `personal_sign`, `x402`, `/api/v1/checkout`, `localStorage`, `document.cookie` ...); the proxy's two fixed headers and `redirect: "manual"` (`test/jpyc-proxy.test.js`, `test/jpyc-server.test.js`) |
| **No in-app USDC to JPYC swap.** Phase 1 only links out; the 「JPYCとは / 入手方法」 line goes to JPYC EC's own guide | there is no swap, bridge or exchange code or link in the panel |
| **Kids: the flyer's `?src=chirashi` hides every purchase UI** (menu item, sheet, credits line, style, key handler, requests), and it stays hidden for the browser session | `flyerGate` in `jpyc-lib.js`; `test/jpyc-hud.test.js`, `test/jpyc-store.test.js`, both e2e files; elsewhere the guardian line is on every screen |
| **Only consenting shops.** A Kesennuma shop appears only with its consent record; the demo is labelled デモ（実際の店舗ではありません） and never attributed to a business | `entryVisible` / `entryAllowed` and the parity table (`test/jpyc-schema.test.js`); the badge in `jpyc-store.js` |
| **Alcohol only with the licence and the age check** in the shop's row | "Alcohol" below; `test/jpyc-proxy.test.js`, `test/jpyc-store.test.js` |
| **Production default: nothing** until a shop is switched on | "THE SWITCH"; unit tests at every layer and `test/jpyc-switch.e2e.test.js` |
| **Credits and the trademark line** in the sheet's footer and the credits sheet | `data/ui-jpyc-i18n.json` `jpyc.credit`; `test/jpyc-hud.test.js` |
| **Nothing about the visitor leaves**, and the app keeps nothing about a purchase | no cookie either way, `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`; the one third party the browser meets is the platform's photo host (see the end) |
| **No Google content**: Maps is a link-out only | `googleMapsUrl` builds a search link; no API, embed or fetch |
| **No event words** in any file of the lane | pinned by the tests that read the lane's files |

## What the visitor sees

1. **☰ → 「JPYCで買えるお店」** (the first item of the toolbar; on a phone the first row of the ☰ menu). A sheet opens:
   a line on what JPYC is (1 JPYC = ¥1) with 「JPYCとは / 入手方法」 linking to JPYC EC's own guide
   (`https://ec.jpyc-service.com/blog/how-to-get-jpyc`), and one card per shop.
2. **A shop**: its products, each with the photo, the name, the price as `1,200 JPYC`, what is left, and 「JPYCで買う」, a link
   to `https://ec.jpyc-service.com/shops/{shop slug}/products/{product slug ?? id}` (`target="_blank" rel="noopener noreferrer"`).
   A product that cannot be bought now (sold out, not on sale yet, ended) gets 「JPYC ECで見る」 instead.
3. **Every screen** carries: "purchases by under-18s need a guardian's consent", and in the footer "JPYC EC is operated by MAMETA;
   JPYC is a registered trademark of JPYC Inc.; KesenMemento is not affiliated with either" (Japanese: JPYC ECはMAMETAが運営して
   います。JPYCはJPYC株式会社の登録商標です。ケセンメメント（KesenMemento）はどちらとも提携していません。). The same line is in the phone's
   credits sheet (ⓘ; there only while something is switched on, because the app says nothing of JPYC otherwise) and in the README credits.
4. **The demo shop** (kind `demo`) is labelled **デモ（実際の店舗ではありません） / Demo (not a real shop)** wherever it appears,
   says no actual transfer is made, and is never attributed to a Kesennuma business.
5. **A Kesennuma shop's card and shop screen** have 「Google マップで見る / Open in Google Maps」 (see "Google Maps" below). The demo has none.

States of a shop screen: loading (a skeleton, announced), ok, empty, error (with 「もう一度読み込む」), busy, offline (no request is
made; it reloads by itself when the connection returns), gone (the shop is not on JPYC EC), mismatch (the shop's kind differs from our
data), and an old copy (marked 「最新でない可能性があります（HH:MM時点）」, JST). Opened again within ten minutes, the last good copy is
on screen at once and refreshed behind it; if the refresh fails it stays, marked as old with the time of the data (the proxy's `fetched_at`, JST), and an answer the proxy itself called stale stays marked on
reopen. One deadline (15 s) covers the whole exchange with the proxy, the body included; a stall ends in the error state with its retry button.

**The toolbar item** is the first item of the HUD's toolbar (`.tools`, a right-anchored row), so none of the items that were there moves. Between 721 and 839 px that row is full up to the wordmark (the report
button already leaves it for a second row there), so the item leaves it too and sits beside the report button in that second row (`JPYC_BTN_CSS` in `jpyc-store.js`, a 300-byte style injected when the HUD
mounts, because `style.js` is held by UI lane B2; the e2e sweeps twelve widths from 1920 to 722 px and checks that nothing overlaps, the quality selector included). On a phone it is the first row of the ☰ menu.

Phones: 44 px targets everywhere, the sheet sits inside the safe areas (a bottom sheet in portrait, a centred sheet between the notch
and the home bar in landscape), the body scrolls (`overscroll-behavior: contain`) and the credits stay pinned under it. The body is `data-scroll` (the touch pad vetoes every touchmove outside the elements it lists: without it only a swipe that starts on a card would scroll) and a named region. Keyboard: Tab and
Shift+Tab stay inside, Esc steps back (a shop to its list) and then closes, focus returns to the button that opened it (not after a
pointer close: the game's Space would press it), the town's keys (WASD, T, P, B ...) do not run while it is open, the page behind is
`inert`, the touch pad steps aside, pointer lock is released. `prefers-reduced-motion` switches the animations off.

## Kids: the flyer's link

`?src=chirashi` (any case, or `chirashi-…`) is the QR on the flyer handed to middle-school kids. Under it the **whole feature is gone**:
no menu item, no credits line, no sheet, no style, no key handler, no request (`ctx.services.jpyc.enabled === false`, `kids === true`).
It holds for the **browser session** (`sessionStorage['klc.src']`): a reload or a second page of the visit without the parameter stays
hidden. Elsewhere the guardian line is on the sheet. `?jpyc=off` hides it for a visit; `?jpyc=dev` (on a dev host only) also lists the entries that are switched off or wait for
their consent record, labelled 【開発用】 (see "THE SWITCH"); the flyer's kids still see nothing under it.

## The data file: `data/shops/jpyc.json`

```json
{ "schema": "klc-jpyc-shops/1", "version": 1, "doc": "docs/jpyc/README.md", "note": "THE SWITCH: production shows nothing until an entry here is on. …",
  "entries": [ {
    "id": "jpyc-demo", "kind": "demo", "enabled": false, "ja": "JPYC EC デモショップ", "en": "JPYC EC demo shop",
    "x": 5, "z": 40, "shopSlug": "otameshi", "productIds": null, "consent": null,
    "googleMapsQuery": null, "googleMapsPlaceId": null } ] }
```

| Field | Meaning |
|---|---|
| `id` | lower-case letters, digits, hyphens (1 to 40); what `ctx.services.jpyc.open(id)` takes; unique |
| `kind` | `"kesennuma"` (a real shop in town) or `"demo"` (JPYC EC's own `is_demo` shop; no consent, no maps, no alcohol) |
| `enabled` | **the switch** (see "THE SWITCH"): a demo needs it, `true` or `false`; a Kesennuma shop may leave it out (on with its consent) or say `false` to park itself |
| `ja`, `en` | the name shown (1 to 80 characters) |
| `x`, `z` | the app's local metres. For a real shop copy them from `data/anime/layout.json` `places[]` (the OSM place) or the shop's door in `data/interiors/`; the panel does not use them to draw anything, other modules may (`entry(ref)` returns them). The demo is parked at the PIER7 walk spot of the tour (`layout.tour`, id `pier7`: `x 5, z 40`), the venue of the 10/10 demo; a test pins that |
| `shopSlug` | the shop's slug on JPYC EC (`GET /api/v1/shops` lists them); letters, digits, `-`, `_`; unique |
| `productIds` | optional: `null` / omitted = the shop's whole list; else 1 to 60 product ids (UUIDs from JPYC EC): only those are shown, in this order. The proxy applies it, so other products never leave the server |
| `consent` | `null`, or `{ owner, date, scope, ref? }` (below) |
| `alcohol` | `null`, or `{ mailOrderLicence, ageCheck, confirmed, ref? }`: what must be in place before any alcohol of this shop is listed (see "Alcohol"). Not for a demo |
| `notAlcohol` | optional: 1 to 60 product ids a person has read and found alcohol-free although the alcohol words caught them (sake cups, lees, a snack "for beer"). Not for a demo |
| `googleMapsQuery` | optional text up to 200 characters, what Google Maps is asked for. Default: the Japanese name and 気仙沼 (a bare name finds namesakes elsewhere). Not for a demo |
| `googleMapsPlaceId` | optional Google place id (added as `query_place_id` when we have one; never looked up through the API). Not for a demo |

`test/jpyc-schema.test.js` fails on an unknown key, a bad id or slug, a coordinate outside ±20 km, duplicate ids or shop slugs, a demo without its `enabled` key or with a
consent record, a maps field or an alcohol declaration, a half alcohol declaration, and so on. The top-level `note` is for the person reading the file. **The file is the kill switch**: an empty `entries`, or every
entry off, hides the menu item and the sheet everywhere and silences the proxy.

### Consent: who may appear

A `kesennuma` entry **without a valid consent record is never shown in production** and the proxy refuses to fetch for it (a second lock,
`entryAllowed` in `server/app/jpyc.js`; the app and the server run one table through both copies in the parity test). Valid means:

```json
"consent": { "owner": "<the business, as it agreed>", "date": "2026-10-05", "scope": ["jpyc-listing", "display-event"], "ref": "where the agreement is recorded" }
```

`owner` non-empty (**use the business name: this file is public**, it is in the bundle and in `/data/shops/jpyc.json`), `date` a real calendar date (CI checks that it is not in the future,
a typo like 2062; the app and the server never read a clock for this, so a phone with a wrong date cannot hide a shop that agreed), `scope` known words including `jpyc-listing` (list the shop with its JPYC EC products and link to its pages in the app); the others, `display-web` and
`display-event`, say where it may be shown (the same words the splat-interiors registry uses). `ref` is free text or null (a message id, a file; no personal data).

`?jpyc=dev` (on a dev host only) lists the pending entries in the app, labelled, for a preview; on the production server their products are refused (404, "not found")
**by design**. To preview one end to end run a server with `JPYC_DEV=1` (see below) or the mock (`tools/anime/jpyc-mock-api.mjs`).

**A pending entry is public the moment it is in the file.** The file is bundled into the app and staged to `/data/shops/jpyc.json`, so its name, slug, coordinates and Maps query can be read by anyone who
looks: "never shown" holds for the normal UI, not for a person who reads the bundle. (`?jpyc=dev` itself counts on dev hosts only, the way `contribEnabled` limits `?contrib=1`, so it does not show them to visitors.)
Keep the names of shops that have not agreed yet out of git and out of this file until they have: work on a local copy, which is what `JPYC_DEV` and the stand-in are for.

## Alcohol (sake and other licensed goods)

Selling sake by mail needs the seller's own **mail-order liquor licence** (通信販売酒類小売業免許) and an **age check** (the drinking age is 20 in Japan, whatever the age of majority). So the app **never lists alcohol
unless the shop's row in `data/shops/jpyc.json` says both are in place**:

```json
"alcohol": { "mailOrderLicence": "<the licence, in words: 通信販売酒類小売業免許 and the tax office that issued it>", "ageCheck": "<how the buyer's age is checked, and by whom>", "confirmed": "2026-10-05", "ref": "optional: where the paper is kept" }
```

All three of `mailOrderLicence`, `ageCheck` (1 to 300 characters each, said in words) and `confirmed` (a real calendar date; CI checks it is not in the future, like a consent date) are needed: **half a declaration never counts**.
Only a Kesennuma shop may carry it (a demo sells a test product). The panel only learns a yes or no (`alcoholOk`), but **the data file itself is public** (bundled into the app and served at `/data/shops/jpyc.json`, like a consent record):
name the licence and the office, never a private person's name, address or licence number that is not already public; `ref` says where the paper is kept.

**How it is enforced (the proxy, `server/app/jpyc.js`).** JPYC EC has no alcohol flag: on 2026-10-07 a craft brewery on it had the shop category `null` and products named like 「…ポーター」, 「…白サワー」, 「…セッションIPA」
(no 酒 or ビール among them), and a sweets shop's product carried the tag アルコール. So the proxy reads the words, after folding (NFKC: full-width letters, lower case; invisible characters removed; ジンジャーエール and ワインレッド taken out):

| What is read | List | Examples that hold a product |
|---|---|---|
| a product's name, category and tags | broad: the bare 酒, the sake grades (純米, 吟醸, 本醸造), beer, wine, whisky, shochu, awamori, liqueur, cocktail, chuhai, sour (not サワークリーム), the beer styles (IPA, ポーター, スタウト, エール, ラガー, ピルスナー), the words of a producer, アルコール, and the English equivalents | 「梅酒」, 「お酒入り…」, 「クラフトビール…」, 「…セッションIPA」, tag `Alcohol` |
| a product's description (first 2,000 characters) | narrower: only words that say what the product is (アルコール, 酒類, 飲酒, 日本酒, 焼酎, ウイスキー, ワイン, ビール, 梅酒, 純米, 吟醸, 醸造所 …; ABV, liquor, brewery …) | 「アルコール分 5%」, 「20歳未満の飲酒は…」 |
| a shop's name, slug and description | a producer: ブリュワリー, ブルワリー, 酒造, 酒蔵, 酒店, 酒屋, 醸造所, ワイナリー, 蒸溜所, brewery, brewing, winery, distillery; and the shop's category | the **whole shop** is held (a brewery's tea towel too), not only the products whose words give them away |

Without the declaration a product that matches is **dropped before anything leaves the server**: it is not in the shop's list, `/api/jpyc/products/:id` says 404 for its id, nothing of it is cached for the panel, and the log says
`jpyc alcohol <slug> N product(s) held back: …` once, when the number changes (`stats.alcoholHeld` has the count). With the declaration the products are listed; those whose own words say alcohol carry `alcohol: true`.
The dev switch (`?jpyc=dev`, `JPYC_DEV=1`) lifts **the switch, not this rule**.

**The panel (second lock).** A product marked `alcohol: true` gets the badge 「酒類（20歳以上）」 / "Alcohol (20 and over)", and the shop screen says 「お酒は20歳未満の方には販売できません（保護者の同意があっても購入できません）。購入のときに、
お店が年齢確認を行います。」 / "Alcohol is not sold to anyone under 20, even with a parent or guardian's consent. The shop checks your age when you buy." The panel also **drops** any product marked as alcohol when the entry does not
declare the licence and the age check, so a proxy that held less than it should could not put it on the page. The flyer's kids see none of it (the whole feature is hidden).

**False alarms.** The lists err on the side of holding: sake cups, 酒粕, 甘酒, a snack described as "goes well with beer" are caught too. After a person has read the product's page, list its id in the row's `notAlcohol`
and it is shown (never labelled as alcohol). **This is a safety net, not a licence check:** when you add a shop that sells sake, read its product list yourself, and put the licence in the row or leave the shop out.

### Adding a shop (checklist)

1. The shop is open on JPYC EC (a wallet, the form, the 特商法 page: JPYC EC's own guide); note its slug (`GET /api/v1/shops`) and read its product list yourself.
2. The owner agrees to being listed in KesenMemento (written, in their own words: that is the `consent` record).
3. If the shop sells **sake or any alcohol**: it needs its own mail-order licence (通信販売酒類小売業免許) and an age check, and the row must say both (`alcohol`, see "Alcohol"). Without them the app lists none of its alcohol.
4. Add the entry with `consent`, `x`, `z`, `ja`, `en` (and `googleMapsQuery` if the name alone is ambiguous, `alcohol` if 3 applies); optionally `productIds`. A new Kesennuma entry is on the moment it has its consent record.
5. Preview it first: a dev server or the stand-in with `?jpyc=dev` on localhost (nothing deployed). Check the shop's list against the platform's own page: a product missing is either held by the alcohol rule (the server log says `jpyc alcohol <slug> N product(s) held back`) or not on sale.
6. `env -u NODE_OPTIONS bun test test/jpyc-*.test.js`, the staged-bundle probe below, then the usual gated deploy.

## The proxy: `GET /api/jpyc/…`

A cache between the browser and `https://ec.jpyc-service.com/api/v1` in the production server. JPYC EC rate-limits by IP, and a room full of
phones at PIER7 shares one: the server asks once per five minutes whatever the number of visitors.

| Route | Answers |
|---|---|
| `GET /api/jpyc/shops/:slug/products` | `{ ok, shop, products[], fetched_at, age_s, stale }` for an allowlisted shop |
| `GET /api/jpyc/products/:id` | `{ ok, shop, product, fetched_at, age_s, stale }` for a product of an allowlisted shop, **answered from that shop's cached list** (see below) |

- **Allowlist.** Only the shop slugs of `data/shops/jpyc.json` that are **switched on** (a demo with `"enabled": true`, a Kesennuma shop with its consent record; see "THE SWITCH": none as committed) are ever asked of the platform, and only for their product **lists**: `/products/:id` is looked up in those lists
  (an entry's own `productIds` pick the shop, else every shop without a list is searched, at once), so no id a visitor can invent ever costs the platform a call, and the platform's detail endpoint
  (which adds nothing the sheet shows, and whose shop block has no stock settings) is never asked. Slugs and ids are checked as
  safe path segments (`[A-Za-z0-9][A-Za-z0-9_-]{0,63}`) before anything is built from them. Everything else under the prefix is 404, other methods 405.
- **Read only, no identity.** GET with two fixed headers (`accept`, `user-agent: KesenMemento-jpyc-proxy/1 (+site)`), redirects not followed, no cookies or credentials
  either way, nothing of the visitor's request reaches the platform (`test/jpyc-server.test.js` sends cookies and an Authorization header through the real `server.js`
  and checks what the platform received).
- **Fields.** Shop: `slug, name, is_demo, available_chains, default_chain_id, stock_display_mode, low_stock_threshold`. Product: `id, slug, name, price_jpyc` (trimmed
  decimal; the lowest variant price) `, price_varies, image_url` (the first https image) `, stock, max_quantity_per_order, online_sale_status, online_purchase_available,
  online_sale_starts_at, online_sale_ends_at, requires_shipping, alcohol` (false, or true on a product of a shop that declared the licence). Dropped: the shop's **wallet address**, descriptions, tags, categories, reviews, checkout options, SNS
  links, ids of the platform's own. Every kept value is type-checked; control characters become a space and invisible ones (soft hyphen, zero-width space, bidi marks and overrides, the invisible
  operators, the BOM, tag characters) are deleted from names (the joiners stay, so an emoji family survives); an image must be https on a public host (no IP address, localhost, bare name or private suffix); a body is read in chunks and cut off at 2 MB.
- **Alcohol is held** unless the row declares the licence and the age check (see "Alcohol"); the products kept carry `alcohol: true` when their own words say alcohol. Category, tags and description are read for this and then dropped like the rest.
- **Kind rule.** A `demo` entry is answered only while the platform says `is_demo: true`, any other only while it says false (502 `mismatch`, and a cached copy is
  purged): the demo label can never land on a real shop, nor a real shop's products under the demo's.
- **Freshness (HTTP's own words).** Fresh for **5 min** (`TTL_MS`); then **stale-while-revalidate** for 5 more (served at once, refreshed behind it); older than that the
  request waits for the platform, bounded by the **10 s timeout** (abort plus a hard race, covering the body too); if the platform fails (timeout, network, 5xx, 429, not
  its JSON, wrong shop) the old copy is served with `stale: true` (**stale-if-error**, up to 24 h), else the request fails with a code the panel has words for.
  Concurrent requests for a key share one call; a failed key rests 15 s; a 429 or 503 rests the whole proxy (Retry-After, 15 to 120 s); a 404 is remembered for 60 s, except over a good copy, where it is
  believed only on the second look (the copy is served as stale through the first: a deploy on the platform's side must not blank the sheet);
  at most **20 platform calls per minute** are made (the platform's limit is 30 per 60 s per IP, shared with whoever else uses the IP); at most 400 keys are cached.
- **Warm-up.** On the production server each allowlisted shop's list is also refreshed in the background **at start and every 4 minutes** (before the 5-minute TTL runs out), so the first visitor after
  a deploy or a quiet hour finds it ready instead of waiting about 3 s for the platform, and what a visitor sees is never older than 4 minutes. The same rules apply (one flight per key, the call
  budget, the 15 s rest after a failure, a 429's cooldown); it costs a shop about 15 calls an hour. Product-by-id answers are not warmed. `JPYC_WARM=0` switches it off (tests do).
- **Errors:** `{ ok: false, error, message[, retry_after_s] }`: `not_found` 404, `bad_request` 400, `method_not_allowed` 405, `unavailable` 502, `timeout` 504, `busy` 503
  (+ `Retry-After`), `invalid` 502, `mismatch` 502. Never the platform's text, a stack or a path.
- **Headers:** `cache-control: public, max-age=30` (10 when stale, `no-store` for errors), `x-jpyc-cache: hit | swr | miss | stale` (watch it in a probe), no CORS (the page
  and the proxy are one origin).

`server.js` sets Bun's `idleTimeout` to 30 s (the default, 10 s, is the proxy's own deadline: a request waiting for the platform would be cut by the server first).

Environment: `JPYC_EC_BASE` (default `https://ec.jpyc-service.com`; a mock in tests), `JPYC_DEV=1` (lift the switch: also allow entries that are off or still wait for their consent record; never on production; the alcohol rule stays), `JPYC_WARM=0` (no background refresh).
At start the server prints one line, `jpyc: on for <slugs>` or `jpyc: off (no shop is switched on in data/shops/jpyc.json: …)`.

### Deploy and the probe of the staged bundle

`server/app/stage.sh <commit> <dist> <bundle>` copies `jpyc.js` beside `server.js` and archives the `data/shops/` directory (`jpyc.json`, the allowlist) and `data/ui-jpyc-i18n.json` into the bundle's `data/`, so the staged `server.js` answers `/api/jpyc`.
The app is built from the commit and the data file archived from the same commit, so the two cannot disagree. Staging needs nothing from `raw/railway` (every module the server imports is archived), so a rehearsal can stage
into an empty scratch dir. `stage.sh` leaves `dist/jpyc-shots*` (the e2e's screenshots, when `JPYC_SHOTS=dist/jpyc-shots`) out of `public/`. The probe this lane ran on 2026-10-07 at `76a9247` (scratch dir, the stand-in as the platform: `JPYC_EC_BASE=http://127.0.0.1:<port>/__upstream`, so the real JPYC EC was never asked):

    server/app/stage.sh <commit> dist <scratch>/bundle                              # rc 0; jpyc.js, static.js, server.js and both data files are byte-identical to the commit's
    cd <scratch>/bundle && PORT=9429 env -u NODE_OPTIONS bun server.js              # as committed it prints:  jpyc: off (no shop is switched on in data/shops/jpyc.json: /api/jpyc answers 404, the platform is never asked)
    curl -s -o /dev/null -w '%{http_code}\n' localhost:9429/healthz                 # 200
    curl -s -D- localhost:9429/api/jpyc/shops/otameshi/products                     # as committed: 404 {"ok":false,"error":"not_found",...}; the platform saw 0 requests
    curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:9429/api/jpyc/shops/otameshi/products   # 405 read-only

With a shop switched on (the demo's `"enabled": true` in the commit, or in the staged data file for a rehearsal) the log says `jpyc: on for otameshi`, and:

| Request | Answer |
|---|---|
| `GET /api/jpyc/shops/otameshi/products` | 200, `application/json`, `nosniff`, `cache-control: public, max-age=30`, `x-jpyc-cache: hit` (the server asks the platform at start and every 4 minutes, so a visitor finds it ready), `"ok":true`, `"is_demo":true`, no wallet address; no `set-cookie`, no CORS |
| `GET /api/jpyc/products/<id of that shop's product>` | 200 (answered from the cached list; the platform's detail endpoint is never asked) |
| an unknown shop, an unknown product, `/api/jpyc/shops/otameshi` (no `/products`), `/api/jpyc`, `%2e%2e` or an encoded slash in the slug | 404 JSON `not_found` |
| `/api/jpyc/products/a.b` (not a safe id) | 400 `bad_request` |
| POST, PUT, DELETE | 405 `read-only` (the server's own guard); HEAD answers 200 with no body |
| the platform failing | 500 gives 502 `unavailable`; 429 gives 503 `busy` with `Retry-After`; a page that is not its JSON gives 502 `invalid`; never a hang or a stack |
| a visitor's request with a cookie, `Authorization`, `Referer`, `Origin`, `X-Forwarded-For`, `X-Api-Key` | the platform is sent only `accept` and `user-agent: KesenMemento-jpyc-proxy/1 (+site)`: none of the visitor's headers |
| a product that looks like alcohol on a shop whose row declares nothing | not in the list, 404 by id, and the log says `jpyc alcohol <slug> 1 product(s) held back` |

A rehearsal without `JPYC_EC_BASE` makes the server ask the real JPYC EC (one request at start per switched-on shop, then every 4 minutes). If the data file is missing or damaged the server still starts and every route answers 404 (the
panel then shows its "gone" state), so a bad data file cannot take the site down.

## For other modules (the walk-in shop rooms): `ctx.services.jpyc`

Published by the HUD at mount (also `window.__jpyc`), **present whenever the HUD is** (disabled, with the same shape, under the flyer source or with nothing to show), so `ctx.services.jpyc?.open(…)` is safe anywhere
after `life` is built (`explore` is built after it). There is no HUD, and so no `ctx.services.jpyc`, in a `?shot=1` frame without `?ui=1`: always call it with `?.`.

```js
const jpyc = ctx.services.jpyc;
jpyc.enabled                         // false under ?src=chirashi, ?jpyc=off, or when nothing is switched on (the production default: see "THE SWITCH")
jpyc.has(ref)                        // is there a visible entry for it?
jpyc.open(ref, { opener, list })     // open that shop's screen -> bool (false: hidden, unknown, or the visitor is not in the town yet)
jpyc.openList({ opener })            // the shop list
jpyc.close(), jpyc.back(), jpyc.isOpen
jpyc.entry(ref) / jpyc.entries()     // copies: { id, kind, ja, en, x, z, shopSlug, productIds, googleMapsQuery, googleMapsPlaceId, pending } (never the consent record)
jpyc.mapsUrl(ref)                    // the Google Maps search link of the shop (null for the demo or an unknown ref)
```

`ref` is an **entry id** (`'k-port'`), a **JPYC EC shop slug** (`'k-port-shop'`), or **`{ id | shopSlug, productIds }`**: the registry's `jpyc: { shopSlug, productIds }` field can be
passed as it is, and `productIds` narrows what the room shows (the room cannot show a shop that is not in `data/shops/jpyc.json`, so consent and kind rules hold for it too). Call it from the
walk-in room's 「JPYCで買う」 button: `jpyc.open(room.jpyc ?? room.id, { opener: button })`. From a room there is no list to go back to: no back arrow, Esc closes.
**Show the button only when `jpyc.enabled !== false && jpyc.has(ref)`** (the splat lane's `canBuy` does exactly this): with nothing switched on, under the flyer's source, or for a shop that is not in `data/shops/jpyc.json` and on, `has()` is false and
`open()` returns false, so the button stays hidden by itself. A room may only name a shop the data file switches on, so the consent, kind, switch and alcohol rules hold for it too; a `productIds` list narrows what the room shows, it cannot reach
a product the proxy held back.

### Google Maps

The shop cards (list, shop screen) carry 「Google マップで見る / Open in Google Maps」: a plain **link** `https://www.google.com/maps/search/?api=1&query=<url-encoded text>[&query_place_id=<id>]`
opening in a new tab. No Google API call, no embed, no Google image or data fetched or stored (Maps Platform's terms forbid using its content inside a non-Google map; a link-out is
fine); a place id is added only when someone put one in the data file. `src/anime/ui/jpyc-lib.js` builds it (`googleMapsUrl(query, placeId)`, `mapsUrlFor(entry)`); **the same link is
meant for the splat-interiors shop cards**: use `ctx.services.jpyc.mapsUrl(ref)` for a shop in `data/shops/jpyc.json`, or import `googleMapsUrl` for any other (the splat lane's own guard test forbids
writing `google.com/maps` in its files; calling the helper keeps that green). The demo shop has no place on Google Maps and no link.

## Tests

| File | What |
|---|---|
| `test/jpyc-proxy.test.js` | the proxy with a mocked `fetch` and a manual clock: allowlist (not an open relay), **the switch (a switched-off demo: every route 404, the platform asked for nothing, warm-up included)**, what is sent, the field filter, TTL / swr / stale-if-error / 24 h, one call for a crowd, the 10 s deadline (even for a fetch that ignores abort), every failure mode, the call budget, 429 rest, the kind rule, the warm-up, **the alcohol rule: the word lists on positive and negative tables, a producer shop held whole, the declaration, `notAlcohol`, held counts and the log** |
| `test/jpyc-server.test.js` | the real `server.js` from a staged temp bundle against the stand-in platform: **the shipped data file serves nothing and asks nothing (even with the warm-up on) and logs `jpyc: off`; the flag flipped serves**, headers received, a crowd, the damaged-file case, `JPYC_DEV`, `stage.sh` |
| `test/jpyc-lib.test.js` | strings, the kids gate, `?jpyc=` (and that `dev` needs a dev host), the switch table, the alcohol declaration and schema, Google Maps URL building and encoding, links, price and stock words, the answer's checks (and the second alcohol lock), the API address (loopback only), refs |
| `test/jpyc-schema.test.js` | the shipped data file (**demo switched off, nothing visible**), the same file with the flag flipped, the schema fault by fault, the switch, consent and alcohol gates through **both** copies (the app's and the server's) on a table of several hundred records, the strings, no personal data in fixtures |
| `test/jpyc-store.test.js` | the panel on `test/lib/mini-dom.js`: list, shop, every state, escaping, keyboard and focus, inert background, kids gate, **the switch at the panel, the dev preview on dev hosts only, the alcohol badge, note and second lock**, `ctx.services.jpyc`, no wallet code |
| `test/jpyc-hud.test.js` | the ☰ item and its place, no `render()` call, the credits line, the kids gate in the HUD, **nothing of the feature on the page as shipped** |
| `test/jpyc-store.e2e.test.js` | gated: the sheet in Chrome as the developer's preview (`?jpyc=dev` on 127.0.0.1; desktop and phone, real touches, safe areas, portrait and landscape) against the stand-in platform, **a held beer never reaching the page**; never touches JPYC EC |
| `test/jpyc-switch.e2e.test.js` | gated: **the switch in Chrome on two real builds**: the app as committed on a production-like host (nothing: no ☰ item, no request; `?jpyc=dev` ignored there), and a build with the data file's flag flipped through Bun's in-memory `files` override plus a consenting test shop declaring the licence (the item, two shops, the labelled demo, a 20+ beer with its note), and the flyer's kids seeing nothing even then |

    env -u NODE_OPTIONS bun test test/jpyc-*.test.js          # unit: no network, no browser
    # e2e through the gate on this machine (one Chrome at a time; each file ends itself in under 15 minutes; ports 9425 to 9428):
    tools/anime/gate.sh chrome env -u NODE_OPTIONS KLC_E2E=1 KLC_E2E_PORT=9425 JPYC_SHOTS=<dir> bun test <absolute path>/test/jpyc-store.e2e.test.js
    tools/anime/gate.sh chrome env -u NODE_OPTIONS KLC_E2E=1 KLC_E2E_PORT=9425 bun test <absolute path>/test/jpyc-switch.e2e.test.js
    # or on the second render host when it is awake (the stand-in answers; photos are drawn by the test):
    the remote runner --wt <worktree> --back dist/jpyc-shots -- env KLC_E2E=1 KLC_E2E_PORT=9425 JPYC_SHOTS=dist/jpyc-shots env -u NODE_OPTIONS bun test ./test/jpyc-store.e2e.test.js
    # a look or a demo with no deploy and no real platform (build the app: `bun tools/anime/serve.mjs --port 9425`, Ctrl-C, it leaves dist/anime-9425):
    env -u NODE_OPTIONS bun tools/anime/jpyc-mock-api.mjs --port 9426 --app dist/anime-9425      # open http://127.0.0.1:9426/index.html (the public mirror forwards the two proxy routes)
    # the stand-in's proxy runs in dev mode (the switch lifted: the demo is served though it ships off), so open it with ?jpyc=dev on this machine: http://127.0.0.1:9426/index.html?jpyc=dev
    # without --app it is only the stand-in + proxy: open the app from elsewhere with  …/index.html?jpyc=dev&jpycApi=http://127.0.0.1:9426
    # break it on purpose:  curl -X POST 127.0.0.1:9426/__mock/mode -d '{"mode":"500"}'   (modes: ok slow hang 500 503 429 badjson html empty shopdown; POST /__mock/reset)



## Not built (Phase 2 and later)

An in-app checkout (`POST /api/v1/checkout`: the 402 challenge, one EIP-3009 signature, settle, then the order and the transaction hash) would live in a separate module that this panel opens
from a product card; the panel itself would then need a wallet connection and a place for the buyer's email and address that never touches our server. Until then this code contains no wallet, signature or
payment code (a test fails if `signTypedData`, `personal_sign`, `x402`, `/api/v1/checkout`, `localStorage` or `document.cookie` appear in the panel). The privacy statement for Phase 1: the app sends nothing about a visitor to JPYC EC (the proxy asks for shops, not for people) and keeps nothing about a purchase.
One thing does reach a third party: the product photos are loaded by the visitor's own browser from the platform's image host (`imagedelivery.net`, Cloudflare Images), which therefore sees the
visitor's IP address and browser, but not which page they came from (`referrerpolicy="no-referrer"`). Following 「JPYCで買う」 or the guide link takes the visitor to JPYC EC, whose privacy policy then applies.
