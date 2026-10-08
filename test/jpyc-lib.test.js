// [jpyc] The pure parts of the panel (ui/jpyc-lib.js): the strings, the kids gate and ?jpyc=, the links (the product page on JPYC EC and the Google Maps search, built and
// percent-encoded), the price / stock / chain words, the proxy's answer checked on arrival, the API address (loopback only), and the references open() takes.
import { describe, test, expect } from "bun:test";
import {
  createT, STRINGS, flyerGate, jpycMode, isDevHost, hasConsent, alcoholAllowed, isCalendarDate, entryVisible, visibleEntries, validateEntry, safeSegment, shopUrl, productUrl, googleMapsUrl, mapsQueryFor, mapsUrlFor,
  formatJpyc, priceText, availability, availabilityText, chainNames, CHAIN_NAMES, jstHM, jstDateTime, safeImage, publicHost, checkProduct, readShopAnswer, resolveApiBase, shopApiUrl, resolveRef,
  EC_ORIGIN, GUIDE_URL, MAPS_QUERY_MAX, FLYER_SRC, SRC_KEY,
} from "../src/anime/ui/jpyc-lib.js";

const T0 = Date.UTC(2026, 9, 6, 6, 0, 0);
const t = createT(() => "ja"), tEn = createT(() => "en");

describe("the strings", () => {
  test("Japanese and English have the same keys, the same {placeholders}, no empty string, and only jpyc.* keys", () => {
    const ja = Object.keys(STRINGS.ja).sort(), en = Object.keys(STRINGS.en).sort();
    expect(en).toEqual(ja);
    for (const k of ja) {
      expect(k.startsWith("jpyc.")).toBe(true);
      for (const l of ["ja", "en"]) expect([l, k, STRINGS[l][k].trim().length > 0]).toEqual([l, k, true]);
      const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect([k, vars(STRINGS.en[k])]).toEqual([k, vars(STRINGS.ja[k])]);
    }
  });
  test("the labels the plan names, word for word", () => {
    expect(STRINGS.ja["jpyc.menu"]).toBe("JPYCで買えるお店"); expect(STRINGS.ja["jpyc.buy"]).toBe("JPYCで買う"); expect(STRINGS.ja["jpyc.demo.badge"]).toBe("デモ（実際の店舗ではありません）");
    expect(STRINGS.en["jpyc.demo.badge"]).toBe("Demo (not a real shop)"); expect(STRINGS.ja["jpyc.maps"]).toBe("Google マップで見る"); expect(STRINGS.en["jpyc.maps"]).toBe("Open in Google Maps");
    expect(STRINGS.ja["jpyc.what"]).toBe("JPYCとは / 入手方法"); expect(STRINGS.ja["jpyc.rate"]).toBe("1 JPYC = ¥1");
    expect(STRINGS.en["jpyc.credit"]).toContain("JPYC EC is operated by MAMETA; JPYC is a registered trademark of JPYC Inc.; KesenMemento is not affiliated with either");
    expect(STRINGS.ja["jpyc.credit"]).toMatch(/MAMETA.*JPYC株式会社の登録商標.*提携していません/);
    expect(STRINGS.ja["jpyc.guardian"]).toContain("18歳未満"); expect(STRINGS.ja["jpyc.guardian"]).toContain("保護者の同意"); expect(STRINGS.en["jpyc.guardian"]).toMatch(/under 18.*guardian's consent/);
  });
  test("createT: the language it is given, the fallback to Japanese and then to the key, and {vars}", () => {
    expect(t("jpyc.buy")).toBe("JPYCで買う"); expect(tEn("jpyc.buy")).toBe("Buy with JPYC");
    expect(tEn("jpyc.nope")).toBe("jpyc.nope");
    expect(tEn("jpyc.stock.exact", { n: "9,932" })).toBe("9,932 in stock"); expect(t("jpyc.state.stale", { time: "15:00" })).toBe("最新でない可能性があります（15:00時点）");
    let l = "ja"; const dyn = createT(() => l); l = "en"; expect(dyn("jpyc.close")).toBe("Close");
    expect(t("jpyc.shop.ecname", { name: "Cafe $$ Store" })).toBe("JPYC EC上のお店の名前: Cafe $$ Store");   // (a shop's name is text: "$&", "$$", "$\'" and "$`" are not replacement patterns)
    expect(tEn("jpyc.shop.ecname", { name: "A$&B" })).toBe("The shop's name on JPYC EC: A$&B"); expect(tEn("jpyc.shop.ecname", { name: "x$`y$'z" })).toBe("The shop's name on JPYC EC: x$`y$'z");
  });
});

describe("the flyer's kids gate and ?jpyc=", () => {
  test("flyerGate: ?src=chirashi (any case, any suffix) is kids and is remembered; the stored value alone keeps it; other sources and nothing are not kids", () => {
    expect(FLYER_SRC).toBe("chirashi"); expect(SRC_KEY).toBe("klc.src");
    expect(flyerGate({ search: "?src=chirashi" })).toEqual({ kids: true, persist: "chirashi" });
    expect(flyerGate({ search: "?src=CHIRASHI" })).toEqual({ kids: true, persist: "chirashi" });
    expect(flyerGate({ search: "?src=chirashi-oct&x=1" })).toEqual({ kids: true, persist: "chirashi" });
    expect(flyerGate({ search: "?x=1&src=%20chirashi" })).toEqual({ kids: true, persist: "chirashi" });
    expect(flyerGate({ search: "?src=chirashi", stored: "chirashi" })).toEqual({ kids: true, persist: null });
    expect(flyerGate({ search: "", stored: "chirashi" })).toEqual({ kids: true, persist: null });
    expect(flyerGate({ search: "?src=twitter", stored: "chirashi" })).toEqual({ kids: true, persist: null });   // (a visit that began at the flyer stays one)
    for (const s of ["", "?src=", "?src=twitter", "?source=chirashi", "?utm_src=chirashi", "?src=achirashi", "?x=chirashi"]) expect([s, flyerGate({ search: s }).kids]).toEqual([s, false]);
    for (const s of ["?src=x&src=chirashi", "?src=chirashi&src=x", "?src=&src=%20chirashi", "?src=a&x=1&src=b&src=Chirashi-2"]) expect([s, flyerGate({ search: s }).kids]).toEqual([s, true]);   // (a repeated parameter: any of them counts)
    expect(flyerGate({})).toEqual({ kids: false, persist: null }); expect(flyerGate()).toEqual({ kids: false, persist: null }); expect(flyerGate({ search: null, stored: 5 }).kids).toBe(false);
  });
  test("jpycMode: dev, off, or normal; dev counts on a dev host only", () => {
    const L = "localhost";
    expect([jpycMode("?jpyc=dev", L), jpycMode("?jpyc=DEV", "127.0.0.1"), jpycMode("?jpyc=off"), jpycMode("?jpyc=0"), jpycMode("?jpyc=no"), jpycMode("?jpyc=1", L), jpycMode("", L), jpycMode("?jpyc=", L), jpycMode(null, L), jpycMode("?x=1", L)]).toEqual(["dev", "dev", "off", "off", "off", "normal", "normal", "normal", "normal", "normal"]);
    // ?jpyc=dev on the production host (or any host that is not the developer's own machine, or when the host is unknown) does nothing: a visitor cannot preview what the data file keeps off
    for (const host of ["kesennuma-living-city-production.up.railway.app", "klc.test", "example.com", "localhost.evil.com", "evil-localhost", "127.0.0.1.evil.com", "10.0.0.5", "192.168.1.9", "", undefined, null]) expect([host, jpycMode("?jpyc=dev", host)]).toEqual([host, "normal"]);
    for (const host of ["localhost", "LOCALHOST", "127.0.0.1", "[::1]", "::1", "app.localhost", " localhost "]) expect([host, jpycMode("?jpyc=dev", host)]).toEqual([host, "dev"]);
    expect(jpycMode("?jpyc=off", "kesennuma-living-city-production.up.railway.app")).toBe("off");   // (hiding it is always allowed)
    expect([isDevHost("localhost"), isDevHost("a.localhost"), isDevHost("localhost.com"), isDevHost("")]).toEqual([true, true, false, false]);
  });
});

describe("Google Maps: a link and nothing more", () => {
  const parse = (u) => new URL(u);
  test("the shape: https://www.google.com/maps/search/?api=1&query=<encoded>; the query round-trips", () => {
    const u = googleMapsUrl("喫茶マンボ 気仙沼");
    expect(u).toBe("https://www.google.com/maps/search/?api=1&query=%E5%96%AB%E8%8C%B6%E3%83%9E%E3%83%B3%E3%83%9C%20%E6%B0%97%E4%BB%99%E6%B2%BC");
    const p = parse(u); expect([p.origin, p.pathname, p.searchParams.get("api"), p.searchParams.get("query"), p.searchParams.get("query_place_id")]).toEqual(["https://www.google.com", "/maps/search/", "1", "喫茶マンボ 気仙沼", null]);
  });
  test("every character that could break a query string is percent-encoded; the text comes back exactly", () => {
    for (const q of ["A&B", "a#b", "q?x=1", "1+1=2", "a/b\\c", 'say "hi" \'there\'', "100% sure", "100%25", "a b  c", "<script>alert(1)</script>", "emoji 🍣 sushi", "café", "全角　スペース", "tab\there", "ＡＢＣ ｱｲｳ", "a;b,c:d@e$f!g(h)*i~j"]) {
      const u = googleMapsUrl(q), raw = u.slice(u.indexOf("query=") + 6);
      expect([q, /[&#?+ "<>\\]/.test(raw)]).toEqual([q, false]);   // (nothing in the encoded part could end or change the parameter)
      expect([q, parse(u).searchParams.get("query")]).toEqual([q, q.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim()]);
      expect(parse(u).searchParams.get("api")).toBe("1"); expect([...parse(u).searchParams.keys()]).toEqual(["api", "query"]);
    }
  });
  test("a place id pins the listing and is added only when it is one; control characters and newlines become spaces; the query is cut at 200; nothing is not a link", () => {
    const id = "ChIJN1t_tDeuEmsRUsoyG83frY4";
    const u = googleMapsUrl("K-port 気仙沼", id);
    expect([parse(u).searchParams.get("query_place_id"), u.endsWith("&query_place_id=" + id)]).toEqual([id, true]);
    for (const bad of [null, undefined, "", "short", "has space in it 1234", "bad/slash/1234567890", "x".repeat(201), "ChIJ&evil=1&query=zzzz", 5, {}]) expect([bad, googleMapsUrl("K-port", bad).includes("query_place_id")]).toEqual([bad, false]);
    expect(parse(googleMapsUrl("a\nb\r\nc\u0000d")).searchParams.get("query")).toBe("a b c d");
    expect(parse(googleMapsUrl("あ".repeat(500))).searchParams.get("query").length).toBe(MAPS_QUERY_MAX);
    for (const none of ["", "   ", null, undefined, "\n\t"]) expect(googleMapsUrl(none)).toBeNull();
  });
  test("what is asked: the entry's own googleMapsQuery, else its Japanese name and the town; a demo shop has no place", () => {
    expect(mapsQueryFor({ kind: "kesennuma", ja: "喫茶マンボ", en: "Cafe Mambo", googleMapsQuery: "喫茶マンボ 気仙沼市本吉町" })).toBe("喫茶マンボ 気仙沼市本吉町");
    expect(mapsQueryFor({ kind: "kesennuma", ja: "喫茶マンボ", en: "Cafe Mambo", googleMapsQuery: null })).toBe("喫茶マンボ 気仙沼");
    expect(mapsQueryFor({ kind: "kesennuma", ja: "", en: "Cafe Mambo" })).toBe("Cafe Mambo 気仙沼");
    expect(mapsQueryFor({ kind: "demo", ja: "JPYC EC デモショップ", googleMapsQuery: "x" })).toBeNull(); expect(mapsQueryFor(null)).toBeNull(); expect(mapsQueryFor({ kind: "kesennuma", ja: "", en: "" })).toBeNull();
    expect(mapsUrlFor({ kind: "kesennuma", ja: "K-port", googleMapsQuery: "K-port 魚町", googleMapsPlaceId: "ChIJN1t_tDeuEmsRUsoyG83frY4" })).toBe("https://www.google.com/maps/search/?api=1&query=K-port%20%E9%AD%9A%E7%94%BA&query_place_id=ChIJN1t_tDeuEmsRUsoyG83frY4");
    expect(mapsUrlFor({ kind: "demo", ja: "d" })).toBeNull();
  });
  test("a link only: this lib calls no Google API and imports nothing from Google", async () => {
    const src = await Bun.file(new URL("../src/anime/ui/jpyc-lib.js", import.meta.url)).text();
    expect(src).not.toMatch(/fetch\(|XMLHttpRequest|maps\.googleapis|googleusercontent|gstatic|maps\/embed|streetview|places\.googleapis|google\.maps/i);
    expect((src.match(/https:\/\/www\.google\.com\/maps\/search\//g) ?? []).length).toBe(1);
  });
});

describe("links to JPYC EC", () => {
  test("the shop and product pages: /shops/{shop}/products/{slug ?? id}", () => {
    expect(EC_ORIGIN).toBe("https://ec.jpyc-service.com"); expect(GUIDE_URL).toBe("https://ec.jpyc-service.com/blog/how-to-get-jpyc");
    expect(shopUrl("otameshi")).toBe("https://ec.jpyc-service.com/shops/otameshi");
    expect(productUrl("otameshi", { id: "e899a1dd-754d-4a97-b07b-58fcd5940e36", slug: null })).toBe("https://ec.jpyc-service.com/shops/otameshi/products/e899a1dd-754d-4a97-b07b-58fcd5940e36");
    expect(productUrl("otameshi", { id: "e899a1dd", slug: "matcha-latte" })).toBe("https://ec.jpyc-service.com/shops/otameshi/products/matcha-latte");
  });
  test("a part that is not a safe segment gives no link at all (never a link that leaves the platform or changes its path)", () => {
    for (const bad of ["", "a/b", "../x", "a b", "a.b", "%2e", null, undefined, 5, "x".repeat(65), "https://evil.example"]) {
      expect([bad, safeSegment(bad), shopUrl(bad), productUrl(bad, { id: "p" }), productUrl("shop", { id: bad, slug: bad })]).toEqual([bad, false, null, null, null]);
    }
    expect(productUrl("shop", { id: "p1", slug: "../evil" })).toBe("https://ec.jpyc-service.com/shops/shop/products/p1");   // (a bad slug falls back to the id)
    expect(productUrl("shop", null)).toBeNull();
  });
});

describe("price, stock, chains, time", () => {
  test("formatJpyc: grouped as text, trailing zeros off, at most six decimals, nothing for what is not a decimal", () => {
    expect([formatJpyc("0"), formatJpyc("0.000000000000000000"), formatJpyc("999"), formatJpyc("1000"), formatJpyc("1200"), formatJpyc("1500.000000000000000000"), formatJpyc("1234567"), formatJpyc("12.5"), formatJpyc("0.1234567891"), formatJpyc("007")])
      .toEqual(["0", "0", "999", "1,000", "1,200", "1,500", "1,234,567", "12.5", "0.123456", "7"]);
    for (const bad of ["", "abc", "-1", "1e3", "1,000", null, undefined, NaN, "1.2.3", "9".repeat(20)]) expect([bad, formatJpyc(bad)]).toEqual([bad, ""]);
    expect(formatJpyc(12)).toBe("12");   // (the proxy sends strings; a number is read the same way)
    expect(formatJpyc("999999999999999")).toBe("999,999,999,999,999");
  });
  test("priceText: '1,200 JPYC', or '1,200 JPYC〜' / 'from 1,200 JPYC' when a variant costs more", () => {
    expect(priceText({ price_jpyc: "1200", price_varies: false }, t)).toBe("1,200 JPYC"); expect(priceText({ price_jpyc: "1200", price_varies: true }, t)).toBe("1,200 JPYC〜");
    expect(priceText({ price_jpyc: "1200", price_varies: true }, tEn)).toBe("from 1,200 JPYC"); expect(priceText({ price_jpyc: "0" }, t)).toBe("0 JPYC"); expect(priceText({ price_jpyc: "x" }, t)).toBe(""); expect(priceText(null, t)).toBe("");
  });
  test("availability: the sale window and the stock decide, the shop's own mode decides whether a number shows", () => {
    const shop = { stock_display_mode: "exact", low_stock_threshold: 5 }, hide = { stock_display_mode: "low_only", low_stock_threshold: 5 }, base = { online_sale_status: "on_sale", online_purchase_available: true, stock: 20 };
    expect(availability(base, shop)).toEqual({ kind: "exact", n: 20, buy: true });
    expect(availability({ ...base, stock: 2 }, shop)).toEqual({ kind: "exact", n: 2, buy: true });
    expect(availability(base, hide)).toEqual({ kind: "in", buy: true }); expect(availability({ ...base, stock: 3 }, hide)).toEqual({ kind: "low", buy: true }); expect(availability({ ...base, stock: 5 }, hide)).toEqual({ kind: "low", buy: true });
    expect(availability({ ...base, stock: null }, shop)).toEqual({ kind: "in", buy: true }); expect(availability(base, null)).toEqual({ kind: "in", buy: true });
    expect(availability({ ...base, stock: 0 }, shop)).toEqual({ kind: "out", buy: false });
    expect(availability({ ...base, online_sale_status: "ended" }, shop)).toEqual({ kind: "ended", buy: false }); expect(availability({ ...base, online_sale_status: "coming_soon" }, shop)).toEqual({ kind: "soon", buy: false });
    expect(availability({ ...base, online_sale_status: "coming_soon", online_sale_starts_at: "2026-10-12T06:00:00.000Z" }, shop)).toEqual({ kind: "soon", buy: false, at: "2026-10-12T06:00:00.000Z" });   // (when the shop said when)
    expect(availability({ ...base, online_sale_status: "coming_soon", online_sale_starts_at: "soon" }, shop)).toEqual({ kind: "soon", buy: false });
    expect(availability({ ...base, online_purchase_available: false }, shop)).toEqual({ kind: "unavailable", buy: false });
    expect(availability({ ...base, online_sale_status: null, online_purchase_available: null, stock: null }, null)).toEqual({ kind: "in", buy: true });
  });
  test("availabilityText in both languages", () => {
    const words = (l) => ({ exact: availabilityText({ kind: "exact", n: 9932 }, l), in: availabilityText({ kind: "in" }, l), low: availabilityText({ kind: "low" }, l), out: availabilityText({ kind: "out" }, l), soon: availabilityText({ kind: "soon" }, l), ended: availabilityText({ kind: "ended" }, l), unavailable: availabilityText({ kind: "unavailable" }, l) });
    expect(words(t)).toEqual({ exact: "在庫 9,932", in: "在庫あり", low: "残りわずか", out: "品切れ", soon: "販売前", ended: "販売終了", unavailable: "いまは買えません" });
    expect(availabilityText({ kind: "soon", at: "2026-10-12T06:00:00.000Z" }, t)).toBe("10/12 15:00から販売"); expect(availabilityText({ kind: "soon", at: "2026-10-12T06:00:00.000Z" }, tEn)).toBe("On sale from 10/12 15:00 (JST)");
    expect(jstDateTime("2026-10-06T06:00:00.000Z")).toBe("10/6 15:00"); expect(jstDateTime("2026-12-31T16:00:00Z")).toBe("1/1 01:00"); expect(jstDateTime("nope")).toBe(""); expect(jstDateTime(null)).toBe("");
    expect(words(tEn)).toEqual({ exact: "9,932 in stock", in: "In stock", low: "Only a few left", out: "Sold out", soon: "Not on sale yet", ended: "Sale ended", unavailable: "Not available right now" });
  });
  test("chains: the four mainnets by name, test networks and strangers left out", () => {
    expect(CHAIN_NAMES).toEqual({ 1: "Ethereum", 137: "Polygon", 43114: "Avalanche", 8217: "Kaia" });
    expect(chainNames([137, 1, 43114])).toEqual(["Polygon", "Ethereum", "Avalanche"]); expect(chainNames([11155111, 80002, 137, 5042002])).toEqual(["Polygon"]); expect(chainNames(null)).toEqual([]); expect(chainNames([])).toEqual([]);
  });
  test("jstHM: HH:MM in Japan time whatever the machine's zone; '' for what is not a time", () => {
    expect(jstHM("2026-10-06T06:00:00.000Z")).toBe("15:00"); expect(jstHM("2026-10-06T15:30:00Z")).toBe("00:30"); expect(jstHM(T0)).toBe("15:00"); expect(jstHM("nope")).toBe(""); expect(jstHM(null)).toBe(""); expect(jstHM(undefined)).toBe("");
  });
});

describe("the proxy's answer, checked on arrival", () => {
  const entry = { id: "jpyc-demo", kind: "demo", shopSlug: "otameshi" };
  const ok = () => ({ ok: true, shop: { slug: "otameshi", name: "N", is_demo: true, available_chains: [137, "x", 1], stock_display_mode: "exact", low_stock_threshold: 5 }, products: [{ id: "p1", slug: null, name: "A", price_jpyc: "100", price_varies: false, image_url: "https://i.example/a.png", stock: 4, online_sale_status: "on_sale", online_purchase_available: true }], stale: false, fetched_at: "2026-10-06T06:00:00.000Z" });
  test("a good answer is read into a shop, products, the stale flag and the time", () => {
    const r = readShopAnswer(ok(), entry);
    expect(r.shop).toEqual({ slug: "otameshi", name: "N", is_demo: true, available_chains: [137, 1], stock_display_mode: "exact", low_stock_threshold: 5 });
    expect(r.products.map((p) => [p.id, p.name, p.price_jpyc, p.image_url, p.stock])).toEqual([["p1", "A", "100", "https://i.example/a.png", 4]]); expect([r.stale, r.fetchedAt]).toEqual([false, "2026-10-06T06:00:00.000Z"]);
    expect(readShopAnswer({ ...ok(), stale: true }, entry).stale).toBe(true);
  });
  test("anything else is an error with a code the panel has words for: error (shape), mismatch (kind)", () => {
    const code = (f) => { try { f(); return null; } catch (e) { return e.code; } };
    for (const bad of [null, undefined, "x", 5, [], {}, { ok: false }, { ...ok(), ok: "yes" }, { ...ok(), shop: null }, { ...ok(), shop: { ...ok().shop, slug: "other" } }, { ...ok(), products: "no" }, { ...ok(), products: null }]) expect([JSON.stringify(bad)?.slice(0, 40), code(() => readShopAnswer(bad, entry))]).toEqual([JSON.stringify(bad)?.slice(0, 40), "error"]);
    expect(code(() => readShopAnswer({ ...ok(), shop: { ...ok().shop, is_demo: false } }, entry))).toBe("mismatch");
    expect(code(() => readShopAnswer(ok(), { ...entry, kind: "kesennuma" }))).toBe("mismatch");
    expect(code(() => readShopAnswer({ ...ok(), shop: { ...ok().shop, is_demo: false } }, { ...entry, kind: "kesennuma" }))).toBeNull();
  });
  test("checkProduct drops a product without a safe id, a name or a price, and cleans what is left; the room's own ids narrow", () => {
    expect(checkProduct({ id: "a/b", name: "x", price_jpyc: "1" })).toBeNull(); expect(checkProduct({ id: "a", name: "  ", price_jpyc: "1" })).toBeNull(); expect(checkProduct({ id: "a", name: "x", price_jpyc: "free" })).toBeNull(); expect(checkProduct(null)).toBeNull();
    const p = checkProduct({ id: "a", slug: "../x", name: "x".repeat(300), price_jpyc: "5", image_url: "javascript:1", stock: -1, online_sale_status: "weird", online_purchase_available: "yes" });
    expect([p.slug, p.name.length, p.image_url, p.stock, p.online_sale_status, p.online_purchase_available]).toEqual([null, 160, null, null, null, null]);
    const many = { ...ok(), products: ["a", "b", "c"].map((id) => ({ ...ok().products[0], id })) };
    expect(readShopAnswer(many, entry, ["c", "a"]).products.map((x) => x.id)).toEqual(["a", "c"]); expect(readShopAnswer(many, entry, []).products.length).toBe(3); expect(readShopAnswer(many, entry, null).products.length).toBe(3);
  });
  test("the second lock of the alcohol rule: a product the proxy marked as alcohol is drawn only when the entry's row declares the licence and the age check", () => {
    const beer = { ...ok().products[0], id: "beer", name: "B", alcohol: true }, tea = { ...ok().products[0], id: "tea", name: "T" };
    const answer = { ...ok(), products: [tea, beer] };
    expect(checkProduct(beer).alcohol).toBe(true); expect(checkProduct(tea).alcohol).toBe(false); expect(checkProduct({ ...beer, alcohol: "yes" }).alcohol).toBe(false);
    expect(readShopAnswer(answer, { ...entry }).products.map((p) => p.id)).toEqual(["tea"]);                          // (no declaration known: the marked product is dropped)
    expect(readShopAnswer(answer, { ...entry, alcoholOk: false }).products.map((p) => p.id)).toEqual(["tea"]);
    expect(readShopAnswer(answer, { ...entry, alcoholOk: true }).products.map((p) => [p.id, p.alcohol])).toEqual([["tea", false], ["beer", true]]);
  });
  test("publicHost and safeImage: no IP address, localhost, bare name, trailing dot or private suffix", () => {
    for (const ok of ["imagedelivery.net", "cdn.shop.example.com", "a-b.c-d.co.jp", "A.B.COM"]) expect([ok, publicHost(ok)]).toEqual([ok, true]);
    for (const bad of ["localhost", "localhost.", "a.localhost", "127.0.0.1", "127.1", "10.0.0.1", "169.254.169.254", "[::1]", "::1", "0x7f.1", "2130706433", "intranet", "printer.local", "db.internal", "nas.lan", "x.corp", "a..b.com", "-a.com", "a.com.", "", null, undefined, 5]) expect([bad, publicHost(bad)]).toEqual([bad, false]);
    for (const url of ["https://localhost./x.png", "https://127.1/x.png", "https://10.0.0.1/x.png", "https://169.254.169.254/latest/meta-data", "https://[::1]/x.png", "https://printer.local/x.png"]) expect([url, safeImage(url)]).toEqual([url, null]);
  });
  test("safeImage: https only, no credentials, a real host, under 2 KB", () => {
    expect(safeImage("https://imagedelivery.net/a/b/public")).toBe("https://imagedelivery.net/a/b/public");
    for (const bad of ["http://a.example/x", "javascript:alert(1)", "data:image/png;base64,AA", "//a.example/x", "https://u:p@a.example/x", "https://localhost/x", "", null, 5, "https://" + "a".repeat(2100) + ".example/"]) expect([bad, safeImage(bad)]).toEqual([bad, null]);
  });
});

describe("where the API is", () => {
  test("the page's own origin by default; a developer's ?jpycApi= is taken only when it is a loopback origin", () => {
    expect(resolveApiBase("")).toEqual({ base: "", custom: false, rejected: "" }); expect(resolveApiBase(undefined).base).toBe("");
    expect(resolveApiBase("?jpycApi=http://127.0.0.1:9426")).toEqual({ base: "http://127.0.0.1:9426", custom: true, rejected: "" });
    expect(resolveApiBase("?jpycApi=http://localhost:9426/some/path?x=1").base).toBe("http://localhost:9426"); expect(resolveApiBase("?jpycApi=http://[::1]:9426").base).toBe("http://[::1]:9426");
    for (const evil of ["https://evil.example", "http://evil.example:9426", "http://127.0.0.1.evil.example", "http://localhost.evil.example", "http://user:pw@127.0.0.1:9426", "javascript:alert(1)", "//127.0.0.1", "127.0.0.1:9426", "ftp://127.0.0.1", "http://192.168.1.5:9426", "http://0.0.0.0:9426"]) {
      const r = resolveApiBase("?jpycApi=" + encodeURIComponent(evil)); expect([evil, r.base, r.custom, r.rejected]).toEqual([evil, "", false, evil]);
    }
  });
  test("the proxy's route for a shop", () => {
    expect(shopApiUrl("", "otameshi")).toBe("/api/jpyc/shops/otameshi/products"); expect(shopApiUrl("http://127.0.0.1:9426", "otameshi")).toBe("http://127.0.0.1:9426/api/jpyc/shops/otameshi/products"); expect(shopApiUrl("", "a/b")).toBe("/api/jpyc/shops/a%2Fb/products");
  });
});

describe("a reference to an entry (what ctx.services.jpyc.open() takes)", () => {
  const entries = [{ id: "jpyc-demo", shopSlug: "otameshi" }, { id: "k-port", shopSlug: "k-port-shop" }];
  test("an entry id, a shop slug, or { id | shopSlug, productIds }; the id wins over the slug; nothing else resolves", () => {
    expect(resolveRef(entries, "k-port").entry.id).toBe("k-port"); expect(resolveRef(entries, "k-port-shop").entry.id).toBe("k-port"); expect(resolveRef(entries, { shopSlug: "otameshi" }).entry.id).toBe("jpyc-demo");
    expect(resolveRef(entries, { id: "k-port", shopSlug: "otameshi" }).entry.id).toBe("k-port");
    expect(resolveRef(entries, { shopSlug: "otameshi", productIds: ["a", 5, "b"] })).toEqual({ entry: entries[0], narrow: ["a", "b"] });
    expect(resolveRef(entries, { shopSlug: "otameshi", productIds: [] }).narrow).toBeNull(); expect(resolveRef(entries, "otameshi").narrow).toBeNull();
    for (const bad of [null, undefined, "", "nobody", {}, { id: "nobody" }, { shopSlug: "nobody" }, 5, []]) expect([JSON.stringify(bad), resolveRef(entries, bad)]).toEqual([JSON.stringify(bad), null]);
  });
});

describe("consent and schema helpers (the tables test/jpyc-schema.test.js also runs through the server's copy)", () => {
  test("isCalendarDate and hasConsent", () => {
    expect(isCalendarDate("2026-10-06", T0)).toBe(true); expect(isCalendarDate("2026-10-07", T0)).toBe(true); expect(isCalendarDate("2026-10-08", T0)).toBe(false); expect(isCalendarDate("2026-02-30", T0)).toBe(false);
    expect(hasConsent({ owner: "K-port", date: "2026-10-05", scope: ["jpyc-listing", "display-event"] }, T0)).toBe(true);
    expect(hasConsent({ owner: "K-port", date: "2026-10-05", scope: ["display-event"] }, T0)).toBe(false);
  });
  test("validateEntry names each fault; a good entry has none", () => {
    const good = { id: "k-port", kind: "kesennuma", ja: "K-port", en: "K-port", x: 1, z: 2, shopSlug: "k-port", productIds: null, consent: null };
    expect(validateEntry(good, { now: T0 })).toEqual([]);
    const faults = (over) => validateEntry({ ...good, ...over }, { now: T0 }).join(" | ");
    expect(faults({ id: "K Port" })).toMatch(/id must/); expect(faults({ kind: "shop" })).toMatch(/kind must/); expect(faults({ ja: "" })).toMatch(/ja must/); expect(faults({ en: "x".repeat(81) })).toMatch(/en must/);
    expect(faults({ x: "1" })).toMatch(/x must/); expect(faults({ z: 99999 })).toMatch(/z must/); expect(faults({ shopSlug: "a/b" })).toMatch(/shopSlug/); expect(faults({ productIds: [] })).toMatch(/productIds/); expect(faults({ productIds: ["a", "a"] })).toMatch(/productIds/);
    expect(faults({ consent: "yes" })).toMatch(/consent is null/); expect(faults({ consent: { owner: "", date: "2026-10-05", scope: ["jpyc-listing"] } })).toMatch(/owner/); expect(faults({ consent: { owner: "o", date: "soon", scope: ["jpyc-listing"] } })).toMatch(/date/);
    expect(faults({ consent: { owner: "o", date: "2026-10-05", scope: ["everything"] } })).toMatch(/scope/); expect(faults({ consent: { owner: "o", date: "2026-10-05", scope: ["jpyc-listing"], extra: 1 } })).toMatch(/unknown key extra/);
    expect(faults({ extra: 1 })).toMatch(/unknown key extra/); expect(faults({ googleMapsQuery: "a\nb" })).toMatch(/googleMapsQuery/); expect(faults({ googleMapsQuery: "x".repeat(201) })).toMatch(/googleMapsQuery/); expect(faults({ googleMapsPlaceId: "short" })).toMatch(/googleMapsPlaceId/);
    // the switch: `enabled` is a boolean; a demo must carry it explicitly (the file shows the switch), a Kesennuma shop may leave it out
    expect(faults({ enabled: "yes" })).toMatch(/enabled is true or false/); expect(faults({ enabled: 1 })).toMatch(/enabled is true or false/); expect(faults({ enabled: null })).toMatch(/enabled is true or false/);
    expect(faults({ enabled: true })).toBe(""); expect(faults({ enabled: false })).toBe("");
    expect(faults({ kind: "demo", consent: null })).toMatch(/demo shop must say "enabled"/); expect(faults({ kind: "demo", consent: null, enabled: false })).toBe(""); expect(faults({ kind: "demo", consent: null, enabled: true })).toBe("");
    // alcohol: the declaration is the licence, the age check (both in words) and the day a person confirmed them; notAlcohol is a short list of product ids; a demo has neither
    const decl = { mailOrderLicence: "通信販売酒類小売業免許", ageCheck: "注文時に生年月日を確認", confirmed: "2026-10-05" };
    expect(faults({ alcohol: decl })).toBe(""); expect(faults({ alcohol: { ...decl, ref: "memo" } })).toBe(""); expect(faults({ alcohol: null })).toBe(""); expect(faults({ notAlcohol: ["a", "b-2"] })).toBe(""); expect(faults({ notAlcohol: null })).toBe("");
    expect(faults({ alcohol: "yes" })).toMatch(/alcohol is null or/); expect(faults({ alcohol: [] })).toMatch(/alcohol is null or/);
    expect(faults({ alcohol: { ...decl, mailOrderLicence: "" } })).toMatch(/alcohol\.mailOrderLicence/); expect(faults({ alcohol: { ...decl, ageCheck: undefined } })).toMatch(/alcohol\.ageCheck/); expect(faults({ alcohol: { ...decl, ageCheck: "x".repeat(301) } })).toMatch(/alcohol\.ageCheck/);
    expect(faults({ alcohol: { ...decl, confirmed: "5 Oct" } })).toMatch(/alcohol\.confirmed/); expect(faults({ alcohol: { ...decl, confirmed: "2999-01-01" } })).toMatch(/alcohol\.confirmed/); expect(faults({ alcohol: { ...decl, extra: 1 } })).toMatch(/alcohol has an unknown key extra/); expect(faults({ alcohol: { ...decl, ref: 5 } })).toMatch(/alcohol\.ref/);
    expect(faults({ notAlcohol: [] })).toMatch(/notAlcohol/); expect(faults({ notAlcohol: ["a", "a"] })).toMatch(/notAlcohol/); expect(faults({ notAlcohol: ["a/b"] })).toMatch(/notAlcohol/); expect(faults({ notAlcohol: "a" })).toMatch(/notAlcohol/); expect(faults({ notAlcohol: Array.from({ length: 61 }, (_, i) => "p" + i) })).toMatch(/notAlcohol/);
    expect(faults({ kind: "demo", enabled: true, consent: null, alcohol: decl })).toMatch(/demo shop sells a test product/); expect(faults({ kind: "demo", enabled: true, consent: null, notAlcohol: ["a"] })).toMatch(/demo shop sells a test product/);
    expect(faults({ kind: "demo", googleMapsQuery: "x" })).toMatch(/no place on Google Maps/); expect(faults({ kind: "demo", consent: { owner: "o", date: "2026-10-05", scope: ["jpyc-listing"] } })).toMatch(/no consent record/);
    expect(validateEntry(null)).toEqual(["not an object"]); expect(validateEntry([])).toEqual(["not an object"]);
  });
  test("entryVisible and visibleEntries on one small table: the switch", () => {
    const base = { x: 0, z: 0, consent: null }, consent = { owner: "o", date: "2026-10-05", scope: ["jpyc-listing"] };
    const demoOff = { ...base, id: "d", kind: "demo", ja: "d", en: "d", shopSlug: "otameshi", enabled: false }, demoOn = { ...demoOff, id: "d2", shopSlug: "otameshi2", enabled: true };
    const ok = { ...base, id: "c", kind: "kesennuma", ja: "c", en: "c", shopSlug: "c-shop", consent }, parked = { ...ok, id: "k", shopSlug: "k-shop", enabled: false }, onlyFlag = { ...base, id: "f", kind: "kesennuma", ja: "f", en: "f", shopSlug: "f-shop", enabled: true };
    const pend = { ...base, id: "p", kind: "kesennuma", ja: "p", en: "p", shopSlug: "p-shop" };
    const vis = (e, o = {}) => entryVisible(e, { now: T0, ...o });
    // normal: a demo only with enabled: true; a Kesennuma shop with its consent (unless parked); the flag alone never shows a Kesennuma shop
    expect([vis(demoOff), vis(demoOn), vis({ ...demoOn, enabled: undefined }), vis(ok), vis({ ...ok, enabled: true }), vis(parked), vis(onlyFlag), vis(pend)]).toEqual([false, true, false, true, true, false, false, false]);
    // dev: every entry of a known kind (the switch and the consent are lifted); an unknown kind or an unsafe slug never
    expect([vis(demoOff, { dev: true }), vis(parked, { dev: true }), vis(pend, { dev: true }), vis({ ...pend, kind: "x" }, { dev: true }), vis({ ...pend, shopSlug: "../x" }, { dev: true })]).toEqual([true, true, true, false, false]);
    // the shipped state: only a switched-off demo -> nothing at all for a visitor
    expect(visibleEntries({ entries: [demoOff] }, { now: T0 })).toEqual([]);
    expect(visibleEntries({ entries: [demoOff, ok, pend] }, { now: T0 }).map((e) => e.id)).toEqual(["c"]);
    expect(visibleEntries({ entries: [demoOff, demoOn, ok, parked, pend] }, { now: T0 }).map((e) => e.id)).toEqual(["d2", "c"]);
    expect(visibleEntries({ entries: [demoOff, ok, pend] }, { dev: true, now: T0 }).map((e) => [e.id, e.pending, e.off])).toEqual([["d", false, true], ["c", false, false], ["p", true, false]]);
    expect(visibleEntries({ entries: [parked] }, { dev: true, now: T0 }).map((e) => [e.id, e.off])).toEqual([["k", true]]);
    expect(visibleEntries({ entries: [demoOn, ok, { ...ok, id: "c2" }] }, { now: T0 }).map((e) => e.id)).toEqual(["d2", "c"]);   // (one entry per shop slug: a second entry with a new id and the same slug is the same shop)
    expect(visibleEntries({ entries: [{ ...demoOn, enabled: undefined }] }, { now: T0 })).toEqual([]);   // (a demo without the explicit key is a damaged entry: skipped, never thrown over)
  });
  test("visibleEntries says whether the row declares the licence and the age check (a boolean: the words stay in the data file)", () => {
    const decl = { mailOrderLicence: "通信販売酒類小売業免許", ageCheck: "注文時に生年月日を確認", confirmed: "2026-10-05" }, base = { x: 0, z: 0, kind: "kesennuma", consent: { owner: "o", date: "2026-10-05", scope: ["jpyc-listing"] } };
    const rows = [{ ...base, id: "a", ja: "a", en: "a", shopSlug: "a-shop" }, { ...base, id: "b", ja: "b", en: "b", shopSlug: "b-shop", alcohol: decl }, { ...base, id: "c", ja: "c", en: "c", shopSlug: "c-shop", alcohol: { ...decl, ageCheck: "" } }];
    expect(visibleEntries({ entries: rows.filter((r) => r.id !== "c") }, { now: T0 }).map((e) => [e.id, e.alcoholOk])).toEqual([["a", false], ["b", true]]);
    expect(visibleEntries({ entries: [rows[1]] }, { now: T0 })[0]).not.toHaveProperty("alcohol"); expect(JSON.stringify(visibleEntries({ entries: [rows[1]] }, { now: T0 }))).not.toMatch(/酒類小売業|生年月日/);
    expect(visibleEntries({ entries: [rows[2]] }, { now: T0 })).toEqual([]);   // (a half declaration is a damaged entry: skipped; the server holds the alcohol of such a row too)
  });
  test("alcoholAllowed: the licence and the age check in words and a real date, all three", () => {
    const decl = { mailOrderLicence: "通信販売酒類小売業免許", ageCheck: "注文時に生年月日を確認", confirmed: "2026-10-05" };
    expect(alcoholAllowed(decl, T0)).toBe(true);
    for (const bad of [null, undefined, "yes", [], {}, { ...decl, mailOrderLicence: " " }, { ...decl, ageCheck: "" }, { ...decl, confirmed: "2026-02-30" }, { ...decl, confirmed: "2026-10-09" }, { ageCheck: decl.ageCheck, confirmed: decl.confirmed }]) expect(alcoholAllowed(bad, T0)).toBe(false);
  });
});
