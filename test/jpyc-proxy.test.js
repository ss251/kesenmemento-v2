// [jpyc] The cached read proxy (server/app/jpyc.js) against a mocked fetch and a manual clock: the allowlist (the proxy is not an open relay), the cache (fresh,
// stale-while-revalidate, stale-if-error, the 24 h limit, one upstream call for a crowd), the 10 s timeout, the platform's failures, the field filter (what leaves
// and what is dropped), the kind rule, the call budget, and what the platform is sent (GET, two fixed headers, no cookies). The platform's answers are the real
// ones recorded on 2026-10-06 (test/fixtures/jpyc/: the demo shop, no personal data). No test here touches the network.
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  buildAllowlist, createJpycProxy, hasConsent, isCalendarDate, entryAllowed, alcoholAllowed, looksLikeAlcohol, shopSellsAlcohol, filterProduct, filterProducts, filterShop, normPrice, safeImageUrl, publicHost, UpstreamError, MAX_BODY_BYTES,
  TTL_MS, SWR_MS, STALE_MAX_MS, TIMEOUT_MS, ERROR_BACKOFF_MS, UPSTREAM, USER_AGENT, PREFIX, MAX_PRODUCTS, WARM_EVERY_MS,
} from "../server/app/jpyc.js";

const ROOT = resolve(import.meta.dir, "..");
const fx = (n) => JSON.parse(readFileSync(join(ROOT, "test/fixtures/jpyc", n), "utf8"));
const LIST = fx("shop-otameshi-products.json"), DETAIL = fx("product-otameshi.json"), NOT_FOUND = fx("shop-not-found.json");
const DEMO_ID = LIST.data.products[0].id;
const T0 = Date.UTC(2026, 9, 6, 6, 0, 0);

const DEMO = { id: "jpyc-demo", kind: "demo", enabled: true, shopSlug: "otameshi", productIds: null, consent: null };   // (a demo is on only with "enabled": true: the shipped file has it false)
const CAFE_OK = { id: "cafe", kind: "kesennuma", shopSlug: "kesen-cafe", productIds: null, consent: { owner: "Kesen Cafe", date: "2026-10-05", scope: ["jpyc-listing"], ref: null } };
const CAFE_PENDING = { id: "pending", kind: "kesennuma", shopSlug: "kesen-pending", productIds: null, consent: null };
const file = (...entries) => ({ schema: "klc-jpyc-shops/1", version: 1, entries });

const jres = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const prod = (id, over = {}) => ({ ...LIST.data.products[0], id, name: "商品 " + id, ...over });
const shopOf = (slug, over = {}) => ({ ...LIST.data.shop, slug, is_demo: slug === "otameshi", ...over });
const listOf = (slug, products, shopOver = {}) => ({ ok: true, data: { shop: shopOf(slug, shopOver), products, server_time: "2026-10-06T06:00:00.000Z" } });
/** A platform that knows the demo shop (the recorded answer) and kesen-cafe with one product. */
const platform2 = (path) => (path === "/api/v1/shops/kesen-cafe/products" ? jres(200, listOf("kesen-cafe", [prod("c1")])) : null);

/** A platform: handlers by upstream path, a log of every call, a manual clock. */
function world({ entries = [DEMO], dev = false, platform = null, opts = {} } = {}) {
  let t = T0;
  const calls = [];
  const routes = new Map([["/api/v1/shops/otameshi/products", () => jres(200, LIST)], [`/api/v1/products/${DEMO_ID}`, () => jres(200, DETAIL)]]);
  const fetchImpl = async (url, init) => {
    const path = String(url).slice(UPSTREAM.length);
    calls.push({ url: String(url), init, path, at: t });
    if (platform) { const r = await platform(path, init, calls.length); if (r) return r; }
    const h = routes.get(path);
    return h ? h(init) : jres(404, NOT_FOUND);
  };
  const proxy = createJpycProxy({ allow: buildAllowlist(file(...entries), { dev, now: t }), fetch: fetchImpl, now: () => t, ...opts });
  const get = async (path, method = "GET") => { const r = await proxy.handle(path, method); return r; };
  const json = async (path) => { const r = await get(path); return { r, status: r.status, body: await r.json() }; };
  return { proxy, calls, routes, get, json, advance: (ms) => { t += ms; }, now: () => t, set: (path, h) => routes.set(path, h) };
}
const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); await Bun.sleep(0); };
const SHOP_PATH = PREFIX + "/shops/otameshi/products";

describe("the proxy's numbers are the ones the plan names", () => {
  test("5 min TTL, 10 s timeout; stale-while-revalidate and stale-if-error windows; the platform is the one at ec.jpyc-service.com", () => {
    expect(TTL_MS).toBe(5 * 60 * 1000); expect(TIMEOUT_MS).toBe(10 * 1000); expect(SWR_MS).toBe(5 * 60 * 1000); expect(STALE_MAX_MS).toBe(24 * 3600 * 1000);
    expect(ERROR_BACKOFF_MS).toBeGreaterThanOrEqual(10 * 1000); expect(UPSTREAM).toBe("https://ec.jpyc-service.com"); expect(PREFIX).toBe("/api/jpyc");
  });
});

describe("the consent gate and the allowlist", () => {
  test("hasConsent: an owner, a real date not in the future, and a scope of known words that includes jpyc-listing", () => {
    const ok = { owner: "Kesen Cafe", date: "2026-10-05", scope: ["jpyc-listing", "display-event"] };
    expect(hasConsent(ok, T0)).toBe(true);
    expect(hasConsent({ ...ok, scope: "jpyc-listing" }, T0)).toBe(true);
    for (const bad of [null, undefined, "yes", [], {}, { ...ok, owner: "" }, { ...ok, owner: "  " }, { ...ok, owner: 5 }, { ...ok, date: "2026-13-01" }, { ...ok, date: "2026-02-30" }, { ...ok, date: "5 Oct" }, { ...ok, date: "2026-10-09" },
      { ...ok, date: null }, { ...ok, scope: [] }, { ...ok, scope: ["display-event"] }, { ...ok, scope: ["jpyc-listing", "sell-your-data"] }, { ...ok, scope: null }, { owner: "x", date: "2026-10-05" }]) expect(hasConsent(bad, T0)).toBe(false);
    expect(hasConsent({ ...ok, date: "2026-10-07" }, T0)).toBe(true);   // tomorrow in Japan is still today's date somewhere: one day of slack
  });
  test("isCalendarDate", () => {
    expect(isCalendarDate("2026-10-06", T0)).toBe(true); expect(isCalendarDate("2024-02-29", T0)).toBe(true);
    for (const s of ["2026-02-29", "2026-00-10", "2026-10-00", "20261006", "2026-10-06T00:00:00Z", "", null, 20261006, "2099-01-01"]) expect(isCalendarDate(s, T0)).toBe(false);
  });
  test("a demo is allowed; a Kesennuma shop only with its consent record, or on a dev server; anything else never", () => {
    expect(entryAllowed(DEMO, { now: T0 })).toBe(true);
    expect(entryAllowed(CAFE_OK, { now: T0 })).toBe(true);
    expect(entryAllowed(CAFE_PENDING, { now: T0 })).toBe(false);
    expect(entryAllowed(CAFE_PENDING, { dev: true, now: T0 })).toBe(true);
    expect(entryAllowed({ ...CAFE_OK, kind: "bar" }, { dev: true, now: T0 })).toBe(false);
    expect(entryAllowed({ ...DEMO, shopSlug: "../etc" }, { dev: true, now: T0 })).toBe(false);
    expect(entryAllowed({ ...DEMO, shopSlug: "a/b" }, { now: T0 })).toBe(false);
    expect(entryAllowed(null)).toBe(false);
  });
  test("THE SWITCH: a demo is on only with enabled: true; a Kesennuma shop with its consent and not parked; a dev server lifts it", () => {
    const off = { ...DEMO, enabled: false };
    expect([entryAllowed(off, { now: T0 }), entryAllowed({ ...DEMO, enabled: undefined }, { now: T0 }), entryAllowed({ ...DEMO, enabled: "yes" }, { now: T0 }), entryAllowed({ ...DEMO, enabled: 1 }, { now: T0 }), entryAllowed(DEMO, { now: T0 })]).toEqual([false, false, false, false, true]);
    expect([entryAllowed({ ...CAFE_OK, enabled: false }, { now: T0 }), entryAllowed({ ...CAFE_OK, enabled: true }, { now: T0 }), entryAllowed(CAFE_OK, { now: T0 }), entryAllowed({ ...CAFE_PENDING, enabled: true }, { now: T0 })]).toEqual([false, true, true, false]);   // (the flag alone never shows a real shop: consent is the owner's word)
    expect([entryAllowed(off, { dev: true, now: T0 }), entryAllowed({ ...CAFE_OK, enabled: false }, { dev: true, now: T0 }), entryAllowed({ ...off, kind: "bar" }, { dev: true, now: T0 })]).toEqual([true, true, false]);
    expect(buildAllowlist(file(off), { now: T0 }).shops.size).toBe(0); expect(buildAllowlist(file(off), { dev: true, now: T0 }).has("otameshi")).toBe(true);
  });
  test("PRODUCTION DEFAULT (the shipped file: a switched-off demo): every route is a 404 and the platform is asked for nothing, warm-up included", async () => {
    const shipped = JSON.parse(readFileSync(join(ROOT, "data/shops/jpyc.json"), "utf8"));
    const calls = []; const timers = { setInterval: (f, ms) => (calls.push(["timer", ms]), { unref() {} }), clearInterval() {} };
    const proxy = createJpycProxy({ allow: buildAllowlist(shipped), fetch: async (u) => { calls.push(["fetch", String(u)]); return jres(200, LIST); }, now: () => T0, timers, warm: true });
    expect(proxy.allow.shops.size).toBe(0); expect(proxy.warmOnce()).toBe(0);
    for (const path of [`${PREFIX}/shops/otameshi/products`, `${PREFIX}/products/${DEMO_ID}`, `${PREFIX}/shops/anyone/products`, `${PREFIX}/products/some-id`]) { const r = await proxy.handle(path, "GET"); expect([path, r.status, (await r.json()).error]).toEqual([path, 404, "not_found"]); }
    expect(calls.filter((c) => c[0] === "fetch")).toEqual([]);
    proxy.stopWarm();
  });
  test("flip the shipped file's one flag and the same proxy serves the demo (the switch, both ways, on the real data file)", async () => {
    const shipped = JSON.parse(readFileSync(join(ROOT, "data/shops/jpyc.json"), "utf8"));
    const on = { ...shipped, entries: shipped.entries.map((e) => (e.kind === "demo" ? { ...e, enabled: true } : e)) };
    const proxy = createJpycProxy({ allow: buildAllowlist(on), fetch: async () => jres(200, LIST), now: () => T0 });
    const r = await proxy.handle(`${PREFIX}/shops/otameshi/products`, "GET"); const b = await r.json();
    expect([r.status, b.ok, b.shop.is_demo, b.products.length]).toEqual([200, true, true, 1]);
  });
  test("buildAllowlist: the shops that pass, once each; a damaged or empty file is an empty allowlist and never throws", () => {
    const a = buildAllowlist(file(DEMO, CAFE_OK, CAFE_PENDING, { ...DEMO, id: "twin" }), { now: T0 });
    expect([...a.shops.keys()]).toEqual(["otameshi", "kesen-cafe"]);
    expect(a.has("kesen-pending")).toBe(false);
    expect(buildAllowlist(file(DEMO, CAFE_OK, CAFE_PENDING), { dev: true, now: T0 }).has("kesen-pending")).toBe(true);
    for (const bad of [null, undefined, "x", 5, [], {}, { entries: "no" }, { entries: [null, 3, "x"] }]) expect(buildAllowlist(bad).shops.size).toBe(0);
  });
  test("explicit product ids belong to their shop; shops without a list are the open ones", () => {
    const a = buildAllowlist(file({ ...CAFE_OK, productIds: ["p-1", "p-2", 7, "bad id"] }, DEMO), { now: T0 });
    expect(a.productShop("p-1")).toBe("kesen-cafe"); expect(a.productShop("p-2")).toBe("kesen-cafe"); expect(a.productShop("bad id")).toBeNull(); expect(a.productShop("zzz")).toBeNull();
    expect(a.shops.get("kesen-cafe").productIds).toEqual(["p-1", "p-2"]);
    expect(a.openShops()).toEqual(["otameshi"]);
  });
});

describe("it is not an open relay: nothing is asked of the platform that the data file did not name", () => {
  test("a shop that is not in the data file: 404, and the platform is not called", async () => {
    const w = world();
    for (const slug of ["somebody-else", "kesen-cafe", "OTAMESHI", "otameshi2"]) { const { status, body } = await w.json(`${PREFIX}/shops/${slug}/products`); expect([slug, status, body.error]).toEqual([slug, 404, "not_found"]); }
    expect(w.calls.length).toBe(0);
  });
  test("a Kesennuma shop without its consent record is not served (only a dev server serves it)", async () => {
    const w = world({ entries: [DEMO, CAFE_PENDING] });
    expect((await w.get(`${PREFIX}/shops/kesen-pending/products`)).status).toBe(404); expect(w.calls.length).toBe(0);
    const d = world({ entries: [DEMO, CAFE_PENDING], dev: true, platform: (path) => (path === "/api/v1/shops/kesen-pending/products" ? jres(200, listOf("kesen-pending", [prod("a1")])) : null) });
    expect((await d.get(`${PREFIX}/shops/kesen-pending/products`)).status).toBe(200);
  });
  test("a slug or an id that could change the upstream path is refused before anything else (400, no call)", async () => {
    const w = world();
    const evil = ["..", "%2e%2e", "a%2Fb", "a/b", "otameshi?x=1", "otameshi#", "a b", "a.b", "-x", "x".repeat(65), "o" + String.fromCodePoint(0), "ö", "otameshi%00"];
    for (const slug of evil) { const r = await w.get(`${PREFIX}/shops/${decodeURIComponent(slug)}/products`); expect([slug, [400, 404].includes(r.status)]).toEqual([slug, true]); }
    for (const id of evil) { const r = await w.get(`${PREFIX}/products/${decodeURIComponent(id)}`); expect([id, [400, 404].includes(r.status)]).toEqual([id, true]); }
    expect(w.calls.length).toBe(0);
  });
  test("the other routes under the prefix, other methods, and paths outside the prefix", async () => {
    const w = world();
    for (const p of [PREFIX, PREFIX + "/", PREFIX + "/shops", PREFIX + "/shops/otameshi", PREFIX + "/shops/otameshi/products/extra", PREFIX + "/products", PREFIX + "/orders", PREFIX + "/checkout", PREFIX + "/v1/shops"]) expect([p, (await w.get(p)).status]).toEqual([p, 404]);
    for (const m of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) { const r = await w.get(SHOP_PATH, m); expect([m, r.status, r.headers.get("allow")]).toEqual([m, 405, "GET, HEAD"]); }
    expect(await w.get("/api/live")).toBeNull(); expect(await w.get("/api/jpycx/shops/otameshi/products")).toBeNull(); expect(await w.get("/")).toBeNull();
    expect(w.calls.length).toBe(0);
  });
  test("/products/:id is answered from the allowed shops' lists: a made-up id costs the platform nothing beyond the (cached) lists, and the detail endpoint is never asked", async () => {
    const w = world();
    const r = await w.json(`${PREFIX}/products/11111111-1111-4111-8111-111111111111`);
    expect([r.status, r.body.error]).toEqual([404, "not_found"]);
    expect(w.calls.map((c) => c.path)).toEqual(["/api/v1/shops/otameshi/products"]);   // (only the allowed shop's own list was asked, to look)
    for (let i = 0; i < 40; i++) await w.get(`${PREFIX}/products/22222222-2222-4222-8222-${String(i).padStart(12, "0")}`);
    expect(w.calls.length).toBe(1);   // (and that list is cached: a flood of random ids costs the platform nothing more, and cannot use up the call budget)
    expect(w.calls.some((c) => c.path.startsWith("/api/v1/products/"))).toBe(false);
  });
  test("a flood of 100 distinct valid ids across two open shops: two platform calls in all, every answer a clean 404, the budget untouched", async () => {
    const w = world({ entries: [DEMO, CAFE_OK], platform: platform2 });
    const statuses = new Set();
    for (let i = 0; i < 100; i++) statuses.add((await w.get(`${PREFIX}/products/33333333-3333-4333-8333-${String(i).padStart(12, "0")}`)).status);
    expect([...statuses]).toEqual([404]); expect(w.calls.length).toBe(2); expect(w.proxy.stats.budgetHeld).toBe(0);
  });
  test("a product of a shop's own id list is found in that shop's list only; an id outside every list is 404", async () => {
    const w = world({ entries: [{ ...CAFE_OK, productIds: ["aaaa1111"] }, DEMO], platform: (path) => (path === "/api/v1/shops/kesen-cafe/products" ? jres(200, listOf("kesen-cafe", [prod("aaaa1111"), prod("bbbb2222")])) : null) });
    const r = await w.json(`${PREFIX}/products/aaaa1111`);
    expect([r.status, r.body.ok, r.body.product.id, r.body.shop.slug]).toEqual([200, true, "aaaa1111", "kesen-cafe"]);
    expect(w.calls.map((c) => c.path)).toEqual(["/api/v1/shops/kesen-cafe/products"]);   // (the entry's own list: the other shop is not asked)
    expect((await w.get(`${PREFIX}/products/bbbb2222`)).status).toBe(404);   // (on the platform's list, but not one of the entry's own products)
  });
  test("the shops are looked through at once; a shop that failed does not hide a product another one has, but is not a 404 when nothing is found", async () => {
    const w = world({ entries: [DEMO, CAFE_OK], platform: (path) => (path === "/api/v1/shops/otameshi/products" ? jres(500, { ok: false }) : path === "/api/v1/shops/kesen-cafe/products" ? jres(200, listOf("kesen-cafe", [prod("c1")])) : null) });
    expect((await w.get(`${PREFIX}/products/c1`)).status).toBe(200);
    expect((await w.get(`${PREFIX}/products/nowhere`)).status).toBe(502);   // (otameshi failed: the product might be there)
  });
});

describe("what the platform is sent", () => {
  test("a GET to the platform's own address, two fixed headers, no cookies, no credentials, no redirects followed", async () => {
    const w = world();
    await w.get(SHOP_PATH);
    expect(w.calls.length).toBe(1);
    const c = w.calls[0];
    expect(c.url).toBe("https://ec.jpyc-service.com/api/v1/shops/otameshi/products");
    expect(c.init.method).toBe("GET");
    expect(Object.keys(c.init.headers).sort()).toEqual(["accept", "user-agent"]);
    expect(c.init.headers.accept).toBe("application/json"); expect(c.init.headers["user-agent"]).toBe(USER_AGENT); expect(USER_AGENT).toMatch(/KesenMemento/);
    expect(c.init.redirect).toBe("manual"); expect(c.init.body).toBeUndefined(); expect(c.init.credentials).toBeUndefined(); expect(c.init.signal).toBeInstanceOf(AbortSignal);
  });
  test("the path is all the proxy takes: handle(pathname, method). No header, cookie or query exists inside it to pass on (test/jpyc-server.test.js sends real ones through server.js)", async () => {
    const w = world();
    await w.get(SHOP_PATH);
    expect(w.calls[0].url).not.toMatch(/\?|cookie|token/);
    expect(w.proxy.handle.length).toBeLessThanOrEqual(2);
    expect((await w.get(SHOP_PATH + "?x=1")).status).toBe(404);   // (a query left on the path is not a path segment: it is not this route)
  });
  test("the platform's base can be changed for a mock (JPYC_EC_BASE), with or without a trailing slash", async () => {
    for (const base of ["http://127.0.0.1:9/x", "http://127.0.0.1:9/x/"]) {
      const calls = []; const p = createJpycProxy({ allow: buildAllowlist(file(DEMO)), upstream: base, fetch: async (u) => { calls.push(String(u)); return jres(200, LIST); } });
      await p.handle(SHOP_PATH); expect(calls).toEqual(["http://127.0.0.1:9/x/api/v1/shops/otameshi/products"]);
    }
  });
});

describe("the answer: only the fields the panel shows", () => {
  test("the demo shop as recorded: its one product, with the shop's name, kind and chains", async () => {
    const w = world();
    const { r, status, body } = await w.json(SHOP_PATH);
    expect(status).toBe(200);
    expect(r.headers.get("content-type")).toMatch(/^application\/json/); expect(r.headers.get("x-content-type-options")).toBe("nosniff"); expect(r.headers.get("set-cookie")).toBeNull();
    expect(body.ok).toBe(true); expect(body.stale).toBe(false); expect(body.age_s).toBe(0);
    expect(body.fetched_at).toBe(new Date(T0).toISOString());
    expect(body.shop).toEqual({ slug: "otameshi", name: "0 JPYCで決済お試し（JPYC EC運営）", is_demo: true, available_chains: [137, 1, 43114], default_chain_id: 137, stock_display_mode: "exact", low_stock_threshold: 5 });
    expect(body.products).toEqual([{
      id: "e899a1dd-754d-4a97-b07b-58fcd5940e36", slug: null, name: "【テスト用】決済お試し商品（0 JPYC）", price_jpyc: "0", price_varies: false,
      image_url: "https://imagedelivery.net/lEoBH1kNrkZEnFTUBCbLSw/1042ad63-6bb7-4275-ad26-c09a501f7c00/public", stock: 9932, max_quantity_per_order: null,
      online_sale_status: "on_sale", online_purchase_available: true, online_sale_starts_at: "2026-09-19T23:10:00.000Z", online_sale_ends_at: null, requires_shipping: false, alcohol: false,
    }]);
  });
  test("nothing else leaves: no wallet address, description, tags, category, review figures, checkout options or ids of the platform's own", async () => {
    const w = world();
    const text = await (await w.get(SHOP_PATH)).text();
    for (const secret of ["wallet", "0x", "description", "決済フローの動作確認用", "tags", "category", "review", "checkout_options", "x402", "has_nft", "server_time", "becfb71a", "subcategory", "grants_free_shipping"]) expect([secret, text.includes(secret)]).toEqual([secret, false]);
    expect(Object.keys(JSON.parse(text)).sort()).toEqual(["age_s", "fetched_at", "ok", "products", "shop", "stale"]);
  });
  test("/products/:id: the product and its shop, filtered the same way, from the one list call", async () => {
    const w = world();
    const { status, body } = await w.json(`${PREFIX}/products/${DEMO_ID}`);
    expect(status).toBe(200);
    expect(body.product.id).toBe(DEMO_ID); expect(body.product.price_jpyc).toBe("0"); expect(body.shop.slug).toBe("otameshi"); expect(body.shop.is_demo).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/wallet|0x|description|tags|subcategory/);
    expect(w.calls.map((c) => c.path)).toEqual(["/api/v1/shops/otameshi/products"]);
    await w.get(`${PREFIX}/products/${DEMO_ID}`); await w.get(SHOP_PATH); expect(w.calls.length).toBe(1);   // (and the list answers the next ones too)
  });
  test("the platform's own detail answer for the product, run through the same filter, is the list's: the list is enough", () => {
    expect(filterProduct(DETAIL.data.product)).toEqual(filterProducts(LIST.data.products)[0]);
    const { stock_display_mode: a, low_stock_threshold: b, ...fromList } = filterShop(LIST.data.shop, "otameshi"), fromDetail = filterShop(DETAIL.data.shop, "otameshi");
    expect([fromDetail.stock_display_mode, fromDetail.low_stock_threshold, a, b]).toEqual([null, null, "exact", 5]);   // (the detail's shop block has no stock settings: another reason to read the list)
    expect({ ...fromDetail, stock_display_mode: undefined, low_stock_threshold: undefined }).toEqual({ ...fromList, stock_display_mode: undefined, low_stock_threshold: undefined });
  });
  test("HEAD answers with the headers and no body", async () => {
    const w = world();
    const r = await w.get(SHOP_PATH, "HEAD");
    expect([r.status, await r.text(), r.headers.get("content-type")]).toEqual([200, "", "application/json; charset=utf-8"]);
  });
  test("filterProduct: a price is a trimmed decimal, a bad one drops the product; the cheapest variant is the price and says it varies", () => {
    const base = LIST.data.products[0];
    expect(filterProduct({ ...base, price_jpyc: "1500.000000000000000000" }).price_jpyc).toBe("1500");
    expect(filterProduct({ ...base, price_jpyc: "12.500000000000000000" }).price_jpyc).toBe("12.5");
    expect(filterProduct({ ...base, price_jpyc: 300 }).price_jpyc).toBe("300");
    expect(filterProduct({ ...base, price_jpyc: "0012" }).price_jpyc).toBe("12");
    for (const bad of ["", "abc", "-5", "1e5", "1,500", null, undefined, NaN, {}, "1.2.3", "9".repeat(20)]) expect([bad, filterProduct({ ...base, price_jpyc: bad })]).toEqual([bad, null]);
    const v = filterProduct({ ...base, price_jpyc: "1500", variants: { options: [], skus: [{ price_jpyc: "1800" }, { price_jpyc: "1200.000" }, { price_jpyc: "nope" }] } });
    expect([v.price_jpyc, v.price_varies]).toEqual(["1200", true]);
    const same = filterProduct({ ...base, price_jpyc: "1500", variants: { skus: [{ price_jpyc: "1500.0" }] } });
    expect([same.price_jpyc, same.price_varies]).toEqual(["1500", false]);
  });
  test("filterProduct: no id or no name drops it; a slug is kept only when it is a safe segment; stock and limits are integers or null", () => {
    const base = LIST.data.products[0];
    for (const bad of [{ id: "" }, { id: "a/b" }, { id: 5 }, { id: undefined }, { name: "" }, { name: "   " }, { name: null }]) expect(filterProduct({ ...base, ...bad })).toBeNull();
    expect(filterProduct({ ...base, slug: "matcha-latte" }).slug).toBe("matcha-latte");
    for (const s of ["a/b", "../x", "a b", "", 5, "x".repeat(70)]) expect(filterProduct({ ...base, slug: s }).slug).toBeNull();
    const p = filterProduct({ ...base, stock: -3, max_quantity_per_order: "4", online_sale_status: "weird", online_purchase_available: "yes", online_sale_starts_at: "not a date" });
    expect([p.stock, p.max_quantity_per_order, p.online_sale_status, p.online_purchase_available, p.online_sale_starts_at]).toEqual([null, 4, null, null, null]);
    expect(filterProduct({ ...base, stock: 0 }).stock).toBe(0);
  });
  test("filterProduct: control and bidi characters never reach a name (a third party's text cannot reorder the page), and a name is cut at 160", () => {
    const base = LIST.data.products[0];
    const sneaky = ["A", 0x202e, "B", 0x2066, "C", 0x200f, "D", 0x07, "E", 0x0a, "F", 0x2028, "G"].map((x) => (typeof x === "number" ? String.fromCodePoint(x) : x)).join("");
    expect(filterProduct({ ...base, name: sneaky }).name).toBe("ABCD E F G");   // (controls and separators become a space, bidi marks and overrides are deleted)
    expect(filterProduct({ ...base, name: "x".repeat(400) }).name.length).toBe(160);
    expect(filterProduct({ ...base, name: "<img src=x onerror=alert(1)>" }).name).toBe("<img src=x onerror=alert(1)>");   // (text stays text: the panel escapes it; the proxy does not pretend to sanitize HTML)
  });
  test("filterProduct: every invisible character goes (soft hyphen, Arabic letter mark, zero-width space, the invisible operators, the BOM, C1 controls, tag characters); the joiners stay, so an emoji family survives", () => {
    const base = LIST.data.products[0], c = (...n) => String.fromCodePoint(...n);
    const dirty = "a" + c(0x61c, 0xad, 0x200b, 0x2060, 0x2062, 0xfeff, 0xe0041, 0xe007f) + "b" + c(0x85) + "c" + c(0x9f) + "d";
    expect(filterProduct({ ...base, name: dirty }).name).toBe("ab c d");
    const family = c(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467);
    expect(filterProduct({ ...base, name: "家族" + family + "です" }).name).toBe("家族" + family + "です");
    expect(filterProduct({ ...base, name: "\u0000\u0007\u001b[31mred" }).name).toBe("[31mred");
  });
  test("publicHost and safeImageUrl: a name on the public internet only; no IP address, localhost, bare name, trailing dot or private suffix", () => {
    for (const ok of ["imagedelivery.net", "cdn.shop.example.com", "a-b.c-d.co.jp", "xn--wgv71a.jp".replace("xn--wgv71a", "shop"), "A.B.COM"]) expect([ok, publicHost(ok)]).toEqual([ok, true]);
    for (const bad of ["localhost", "localhost.", "a.localhost", "127.0.0.1", "127.1", "10.0.0.1", "169.254.169.254", "192.168.1.5", "[::1]", "::1", "0x7f.1", "2130706433", "intranet", "printer.local", "db.internal", "nas.lan", "x.corp", "a..b.com", "-a.com", ".com", "a.c", "a.com.", "", null, undefined, 5, "a b.com", "a_b.com", "x".repeat(64) + ".com"]) expect([bad, publicHost(bad)]).toEqual([bad, false]);
    for (const url of ["https://localhost./x.png", "https://127.1/x.png", "https://10.0.0.1/x.png", "https://169.254.169.254/latest/meta-data", "https://[::1]/x.png", "https://printer.local/x.png"]) expect([url, safeImageUrl(url)]).toEqual([url, null]);
    expect(safeImageUrl("https://imagedelivery.net/a/b/public")).toBe("https://imagedelivery.net/a/b/public");
  });
  test("safeImageUrl: an https URL without credentials, else nothing (no data:, javascript:, http:, file:, blob:, protocol-relative or relative image)", () => {
    expect(safeImageUrl("https://imagedelivery.net/abc/def/public")).toBe("https://imagedelivery.net/abc/def/public");
    for (const bad of ["http://imagedelivery.net/a", "javascript:alert(1)", "data:image/png;base64,AAAA", "file:///etc/passwd", "blob:https://x.y/z", "//imagedelivery.net/a", "/a.png", "a.png", "https://user:pw@imagedelivery.net/a", "https://localhost/a", "https://" + "a".repeat(2100) + ".com/", "", null, 5, {}]) expect([bad, safeImageUrl(bad)]).toEqual([bad, null]);
    const base = LIST.data.products[0];
    expect(filterProduct({ ...base, image_urls: ["javascript:alert(1)", "http://x.example/a.png", "https://ok.example/a.png", "https://ok.example/b.png"] }).image_url).toBe("https://ok.example/a.png");
    expect(filterProduct({ ...base, image_urls: [] }).image_url).toBeNull(); expect(filterProduct({ ...base, image_urls: null }).image_url).toBeNull();
  });
  test("filterShop: the slug must be the one asked for; chains are positive integers; the stock mode is a lower-case word or nothing", () => {
    const s = LIST.data.shop;
    expect(filterShop(s, "otameshi").slug).toBe("otameshi");
    expect(filterShop(s, "another")).toBeNull(); expect(filterShop(null, "x")).toBeNull(); expect(filterShop({ ...s, slug: "a/b" }, null)).toBeNull();
    expect(filterShop({ ...s, available_chains: [137, "1", -4, 1.5, 43114] }).available_chains).toEqual([137, 43114]);
    expect(filterShop({ ...s, stock_display_mode: "Exact<script>" }).stock_display_mode).toBeNull();
    expect(filterShop({ ...s, stock_display_mode: "low_only" }).stock_display_mode).toBe("low_only");
    expect(filterShop({ ...s, is_demo: "true" }).is_demo).toBe(false);
  });
  test("filterProducts: the entry's own ids pick, in the entry's order; duplicates and broken products go; at most 60", () => {
    const list = ["a1", "b2", "c3"].map((id) => prod(id));
    expect(filterProducts(list, ["c3", "a1", "zz"]).map((p) => p.id)).toEqual(["c3", "a1"]);
    expect(filterProducts([...list, prod("a1"), { id: "x" }, null], null).map((p) => p.id)).toEqual(["a1", "b2", "c3"]);
    expect(filterProducts(Array.from({ length: 90 }, (_, i) => prod("p" + i)), null).length).toBe(MAX_PRODUCTS);
    expect(filterProducts("nope")).toEqual([]);
  });
  test("normPrice", () => { expect(normPrice("0.000000000000000000")).toBe("0"); expect(normPrice(" 7 ")).toBe("7"); expect(normPrice("0.5")).toBe("0.5"); expect(normPrice("00")).toBe("0"); expect(normPrice("")).toBeNull(); });
  test("an entry with product ids serves those products only, in its order", async () => {
    const list = ["a1", "b2", "c3"].map((id) => prod(id));
    const w = world({ entries: [{ ...CAFE_OK, productIds: ["c3", "a1"] }], platform: (path) => (path === "/api/v1/shops/kesen-cafe/products" ? jres(200, listOf("kesen-cafe", list)) : null) });
    const { body } = await w.json(`${PREFIX}/shops/kesen-cafe/products`);
    expect(body.products.map((p) => p.id)).toEqual(["c3", "a1"]);
  });
});

describe("the cache: one call for a crowd, fresh for five minutes, then stale-while-revalidate, then wait", () => {
  test("a hundred requests inside the TTL are one platform call", async () => {
    const w = world();
    for (let i = 0; i < 100; i++) { w.advance(2000); const r = await w.get(SHOP_PATH); expect(r.status).toBe(200); }
    expect(w.calls.length).toBe(1);
    expect(w.proxy.stats.hit).toBe(99); expect(w.proxy.stats.miss).toBe(1);
  });
  test("the hits say so (x-jpyc-cache) and carry the age; the browser may keep them for 30 s", async () => {
    const w = world();
    const a = await w.get(SHOP_PATH); expect([a.headers.get("x-jpyc-cache"), a.headers.get("cache-control")]).toEqual(["miss", "public, max-age=30"]);
    w.advance(90_000);
    const b = await w.get(SHOP_PATH); const body = await b.json();
    expect([b.headers.get("x-jpyc-cache"), body.age_s, body.stale]).toEqual(["hit", 90, false]);
  });
  test("simultaneous requests share one call", async () => {
    let release; const gate = new Promise((r) => { release = r; });
    const w = world({ platform: async () => { await gate; return null; } });
    const all = Array.from({ length: 25 }, () => w.get(SHOP_PATH));
    await settle(); release();
    const rs = await Promise.all(all);
    expect(rs.every((r) => r.status === 200)).toBe(true); expect(w.calls.length).toBe(1); expect(w.proxy.stats.shared).toBe(24);
  });
  test("just past the TTL the old copy is served at once and refreshed behind it (stale-while-revalidate)", async () => {
    const w = world();
    await w.get(SHOP_PATH);
    w.advance(TTL_MS + 1000);
    const newer = listOf("otameshi", [prod("e899a1dd-754d-4a97-b07b-58fcd5940e36", { name: "新しい名前", stock: 7 })]);
    w.set("/api/v1/shops/otameshi/products", () => jres(200, newer));
    const r = await w.get(SHOP_PATH), body = await r.json();
    expect(r.headers.get("x-jpyc-cache")).toBe("swr"); expect(body.products[0].name).toBe("【テスト用】決済お試し商品（0 JPYC）"); expect(body.stale).toBe(false);
    await settle();
    expect(w.calls.length).toBe(2);
    const again = await (await w.get(SHOP_PATH)).json();
    expect(again.products[0].name).toBe("新しい名前"); expect(w.calls.length).toBe(2);   // (the refreshed copy is fresh again)
  });
  test("a failing refresh behind a swr answer leaves the old copy in place and does not hammer the platform", async () => {
    const w = world();
    await w.get(SHOP_PATH);
    w.advance(TTL_MS + 1000);
    w.set("/api/v1/shops/otameshi/products", () => jres(500, { ok: false }));
    for (let i = 0; i < 5; i++) { const r = await w.get(SHOP_PATH); expect(r.status).toBe(200); await settle(); }
    expect(w.calls.length).toBe(2);   // one refresh, then the backoff
  });
  test("past TTL + SWR the request waits for the platform and gets the new copy", async () => {
    const w = world();
    await w.get(SHOP_PATH);
    w.advance(TTL_MS + SWR_MS + 1000);
    w.set("/api/v1/shops/otameshi/products", () => jres(200, listOf("otameshi", [prod("e899a1dd-754d-4a97-b07b-58fcd5940e36", { name: "二回目" })])));
    const r = await w.get(SHOP_PATH), body = await r.json();
    expect([r.headers.get("x-jpyc-cache"), body.products[0].name, body.stale, body.age_s]).toEqual(["miss", "二回目", false, 0]);
    expect(w.calls.length).toBe(2);
  });
  test("the cache holds at most maxEntries keys, oldest first", async () => {
    const entries = Array.from({ length: 6 }, (_, i) => ({ id: "s" + i, kind: "kesennuma", shopSlug: "shop-" + i, productIds: null, consent: CAFE_OK.consent }));
    const w = world({ entries, opts: { maxEntries: 3 }, platform: (path) => { const m = /shops\/(shop-\d)\/products/.exec(path); return m ? jres(200, listOf(m[1], [prod("a1")])) : null; } });
    for (let i = 0; i < 6; i++) await w.get(`${PREFIX}/shops/shop-${i}/products`);
    expect(w.proxy.size).toBe(3);
  });
});

describe("when the platform fails: the old copy if there is one, else words the panel has", () => {
  const FAILS = {
    "a 500": () => jres(500, { ok: false, error: { code: "INTERNAL_ERROR" } }),
    "a 502": () => new Response("bad gateway", { status: 502 }),
    "a 503": () => jres(503, { ok: false }, { "retry-after": "20" }),
    "a 429": () => jres(429, { ok: false, error: { code: "RATE_LIMITED" } }, { "retry-after": "30" }),
    "a page that is not JSON": () => new Response("<!doctype html><title>maintenance</title>", { status: 200, headers: { "content-type": "text/html" } }),
    "JSON that is not the API's envelope": () => jres(200, { hello: "world" }),
    "an envelope without a shop": () => jres(200, { ok: true, data: { products: [] } }),
    "a body that is too large": () => new Response("{}", { status: 200, headers: { "content-length": String(5 * 1024 * 1024) } }),
    "a redirect": () => new Response(null, { status: 302, headers: { location: "https://evil.example/" } }),
    "a network error": () => { throw new TypeError("fetch failed"); },
    "the wrong shop": () => jres(200, listOf("someone-else", [prod("a1")])),
  };
  for (const [name, h] of Object.entries(FAILS)) {
    test(`${name}: a stale copy is served with stale: true; with no copy the answer is an error, not a hang`, async () => {
      const w = world();
      await w.get(SHOP_PATH);
      w.advance(TTL_MS + SWR_MS + 60_000);
      w.set("/api/v1/shops/otameshi/products", h);
      const r = await w.get(SHOP_PATH), body = await r.json();
      expect([r.status, r.headers.get("x-jpyc-cache"), body.stale, body.products.length, r.headers.get("cache-control")]).toEqual([200, "stale", true, 1, "public, max-age=10"]);
      expect(body.age_s).toBe(Math.round((TTL_MS + SWR_MS + 60_000) / 1000));
      const cold = world(); cold.set("/api/v1/shops/otameshi/products", h);
      const e = await cold.get(SHOP_PATH), eb = await e.json();
      expect(eb.ok).toBe(false); expect(e.status).toBeGreaterThanOrEqual(502); expect(e.headers.get("cache-control")).toBe("no-store"); expect(["unavailable", "busy", "invalid"]).toContain(eb.error);
      expect(JSON.stringify(eb)).not.toMatch(/evil|maintenance|hello/);   // (what the platform said is never echoed)
    });
  }
  test("a chunked body with no content-length is cut off at the cap: the reader is cancelled after MAX_BODY_BYTES, whatever the stream would have gone on to send", async () => {
    let cancelled = false, sent = 0;
    const endless = () => new Response(new ReadableStream({ pull(c) { sent += 512 * 1024; c.enqueue(new Uint8Array(512 * 1024).fill(32)); }, cancel() { cancelled = true; } }), { status: 200, headers: { "content-type": "application/json" } });
    const w = world({ platform: () => endless() });
    const r = await w.get(SHOP_PATH), b = await r.json();
    expect([r.status, b.error, cancelled]).toEqual([502, "invalid", true]);
    expect(sent).toBeLessThanOrEqual(MAX_BODY_BYTES + 2 * 1024 * 1024);   // (it did not read on and on)
    expect(MAX_BODY_BYTES).toBe(2 * 1024 * 1024);
  });
  test("a chunked body under the cap is read whole, in chunks, multi-byte characters across chunk edges included", async () => {
    const text = JSON.stringify(LIST), bytes = new TextEncoder().encode(text), chunks = [];
    for (let i = 0; i < bytes.length; i += 7) chunks.push(bytes.slice(i, i + 7));   // (7 bytes at a time: the 3-byte Japanese characters are cut mid-way)
    const w = world({ platform: () => new Response(new ReadableStream({ start(c) { for (const ch of chunks) c.enqueue(ch); c.close(); } }), { status: 200, headers: { "content-type": "application/json" } }) });
    const b = await (await w.get(SHOP_PATH)).json();
    expect(b.shop.name).toBe("0 JPYCで決済お試し（JPYC EC運営）"); expect(b.products[0].name).toBe("【テスト用】決済お試し商品（0 JPYC）");
  });
  test("a 429 / 503 with Retry-After: the answer says busy with retry-after; the whole proxy rests, so nothing else is asked meanwhile", async () => {
    const w = world({ entries: [DEMO, CAFE_OK], platform: (path) => (path === "/api/v1/shops/otameshi/products" ? jres(429, { ok: false }, { "retry-after": "40" }) : path === "/api/v1/shops/kesen-cafe/products" ? jres(200, listOf("kesen-cafe", [prod("a1")])) : null) });
    const r = await w.get(SHOP_PATH), body = await r.json();
    expect([r.status, body.error, r.headers.get("retry-after")]).toEqual([503, "busy", String(body.retry_after_s)]);
    expect(w.calls.length).toBe(1);
    const other = await w.get(`${PREFIX}/shops/kesen-cafe/products`);
    expect(other.status).toBe(503); expect(w.calls.length).toBe(1);   // (resting: not even the other shop is asked)
    w.advance(41_000);
    expect((await w.get(`${PREFIX}/shops/kesen-cafe/products`)).status).toBe(200);
  });
  test("after a failure the key rests for the backoff: ten requests, one failed call; then it tries again", async () => {
    const w = world({ platform: () => jres(500, { ok: false }) });
    for (let i = 0; i < 10; i++) { const r = await w.get(SHOP_PATH); expect(r.status).toBe(502); }
    expect(w.calls.length).toBe(1);
    w.advance(ERROR_BACKOFF_MS + 1);
    await w.get(SHOP_PATH); expect(w.calls.length).toBe(2);
  });
  test("recovery: the first good answer after the rest is cached and served normally", async () => {
    let up = false;
    const w = world({ platform: () => (up ? null : jres(500, { ok: false })) });
    expect((await w.get(SHOP_PATH)).status).toBe(502);
    up = true; w.advance(ERROR_BACKOFF_MS + 1);
    const r = await w.get(SHOP_PATH); expect([r.status, r.headers.get("x-jpyc-cache")]).toEqual([200, "miss"]);
    expect((await w.get(SHOP_PATH)).headers.get("x-jpyc-cache")).toBe("hit");
  });
  test("a copy older than 24 hours is no longer served, even when the platform is down", async () => {
    const w = world();
    await w.get(SHOP_PATH);
    w.advance(STALE_MAX_MS - 1000); w.set("/api/v1/shops/otameshi/products", () => jres(500, { ok: false }));
    expect((await w.get(SHOP_PATH)).status).toBe(200);   // (just inside: stale but served)
    w.advance(ERROR_BACKOFF_MS + 5000);
    const r = await w.get(SHOP_PATH); expect(r.status).toBe(502);
  });
  test("a shop that is gone on the platform (404) is a 404 for the panel, remembered for a minute, never retried in between, then asked again", async () => {
    const w = world({ platform: () => jres(404, NOT_FOUND) });
    for (let i = 0; i < 5; i++) { const r = await w.get(SHOP_PATH), b = await r.json(); expect([r.status, b.error]).toEqual([404, "not_found"]); }
    expect(w.calls.length).toBe(1);
    w.advance(61_000); await w.get(SHOP_PATH); expect(w.calls.length).toBe(2);
  });
  test("a product that is no longer on the shop's list: 404 for the panel", async () => {
    const w = world({ platform: (path) => (path === "/api/v1/shops/otameshi/products" ? jres(200, listOf("otameshi", [prod("other-1")])) : null) });
    expect((await w.get(`${PREFIX}/products/${DEMO_ID}`)).status).toBe(404);
  });
  test("a 404 over a good copy is believed on the second look only: the copy is served (stale) through a moment of the platform's, and dropped when the 404 repeats", async () => {
    const w = world();
    await w.get(SHOP_PATH);
    w.advance(TTL_MS + SWR_MS + 1000); w.set("/api/v1/shops/otameshi/products", () => jres(404, NOT_FOUND));
    const first = await w.get(SHOP_PATH), fb = await first.json();
    expect([first.status, first.headers.get("x-jpyc-cache"), fb.stale, fb.products.length]).toEqual([200, "stale", true, 1]);   // (a deploy on the platform's side must not blank the sheet)
    expect((await w.get(SHOP_PATH)).status).toBe(200);   // (resting: not asked again, still the copy)
    w.advance(ERROR_BACKOFF_MS + 1);
    const second = await w.get(SHOP_PATH); expect([second.status, (await second.json()).error]).toEqual([404, "not_found"]);   // (the second look agrees: the shop is gone)
    expect(w.calls.length).toBe(3);
  });
  test("a 404 that clears: the copy is replaced by the fresh answer and the count starts again", async () => {
    const w = world();
    await w.get(SHOP_PATH);
    w.advance(TTL_MS + SWR_MS + 1000); w.set("/api/v1/shops/otameshi/products", () => jres(404, NOT_FOUND)); await w.get(SHOP_PATH);
    w.advance(ERROR_BACKOFF_MS + 1); w.set("/api/v1/shops/otameshi/products", () => jres(200, LIST));
    const back = await w.get(SHOP_PATH); expect([back.status, back.headers.get("x-jpyc-cache")]).toEqual([200, "miss"]);
    w.advance(TTL_MS + SWR_MS + 1000); w.set("/api/v1/shops/otameshi/products", () => jres(404, NOT_FOUND));
    expect((await w.get(SHOP_PATH)).headers.get("x-jpyc-cache")).toBe("stale");   // (one 404 again is a first look again)
  });
  test("an error never carries the platform's text, a stack or a path of this machine", async () => {
    const w = world({ platform: () => { throw new Error("connect ECONNREFUSED /Users/someone/secret 10.0.0.5:443"); } });
    const r = await w.get(SHOP_PATH), text = await r.text();
    expect(text).not.toMatch(/Users|10\.0|ECONNREFUSED|stack|at /);
    expect(JSON.parse(text)).toEqual({ ok: false, error: "unavailable", message: expect.any(String) });
  });
});

describe("the deadline: a platform that does not answer cannot hold a visitor for more than the timeout", () => {
  test("a fetch that never settles and ignores the abort signal still ends at the timeout (504, code timeout)", async () => {
    const w = world({ platform: () => new Promise(() => {}), opts: { timeout: 40 } });
    const t0 = performance.now();
    const r = await w.get(SHOP_PATH), body = await r.json();
    const ms = performance.now() - t0;
    expect([r.status, body.error]).toEqual([504, "timeout"]); expect(ms).toBeGreaterThanOrEqual(35); expect(ms).toBeLessThan(500);
  });
  test("the platform's fetch is aborted at the deadline (its signal fires)", async () => {
    let aborted = false;
    const w = world({ platform: (path, init) => new Promise((_, rej) => { init.signal.addEventListener("abort", () => { aborted = true; rej(new Error("aborted")); }); }), opts: { timeout: 30 } });
    const r = await w.get(SHOP_PATH); expect(r.status).toBe(504);
    expect(aborted).toBe(true);
  });
  test("a body that stalls after the headers is cut too, and a stale copy is served instead", async () => {
    const w = world({ opts: { timeout: 40 } });
    await w.get(SHOP_PATH);
    w.advance(TTL_MS + SWR_MS + 5000);
    w.set("/api/v1/shops/otameshi/products", () => ({ status: 200, headers: new Headers(), text: () => new Promise(() => {}), arrayBuffer: () => new Promise(() => {}) }));
    const r = await w.get(SHOP_PATH), body = await r.json();
    expect([r.status, body.stale]).toEqual([200, true]);
  });
  test("a slow but timely answer is fine; the default deadline is the documented 10 s", async () => {
    const w = world({ platform: async () => { await Bun.sleep(30); return null; }, opts: { timeout: 500 } });
    expect((await w.get(SHOP_PATH)).status).toBe(200);
    const d = createJpycProxy({ allow: buildAllowlist(file(DEMO)), fetch: async () => jres(200, LIST) });
    expect((await d.handle(SHOP_PATH)).status).toBe(200); expect(TIMEOUT_MS).toBe(10000);
  });
  test("a timed-out call does not leave a timer behind that rejects later (no unhandled rejection)", async () => {
    const w = world({ platform: () => new Promise((_, rej) => setTimeout(() => rej(new Error("late")), 80)), opts: { timeout: 20 } });
    await w.get(SHOP_PATH); await Bun.sleep(150);
    expect(w.calls.length).toBe(1);
  });
});

describe("the call budget: the platform's own limit is per IP, so this proxy never uses all of it", () => {
  test("above the budget the platform is not asked (busy), cached answers still flow, and the window slides", async () => {
    const entries = Array.from({ length: 6 }, (_, i) => ({ id: "s" + i, kind: "kesennuma", shopSlug: "shop-" + i, productIds: null, consent: CAFE_OK.consent }));
    const w = world({ entries, opts: { budget: { limit: 3, windowMs: 60_000 } }, platform: (path) => { const m = /shops\/(shop-\d)\/products/.exec(path); return m ? jres(200, listOf(m[1], [prod("a1")])) : null; } });
    const statuses = [];
    for (let i = 0; i < 6; i++) statuses.push((await w.get(`${PREFIX}/shops/shop-${i}/products`)).status);
    expect(statuses).toEqual([200, 200, 200, 503, 503, 503]);
    expect(w.calls.length).toBe(3); expect(w.proxy.stats.budgetHeld).toBe(3);
    expect((await w.get(`${PREFIX}/shops/shop-0/products`)).status).toBe(200);   // a hit
    w.advance(61_000);
    expect((await w.get(`${PREFIX}/shops/shop-3/products`)).status).toBe(200);
  });
  test("the shipped budget is under the platform's 30 per minute", async () => {
    const { UPSTREAM_BUDGET } = await import("../server/app/jpyc.js");
    expect(UPSTREAM_BUDGET.limit).toBeLessThan(30); expect(UPSTREAM_BUDGET.windowMs).toBe(60_000);
  });
});

describe("the kind rule: a demo label never lands on a real shop, a real shop never rides in the demo's place", () => {
  test("a demo entry whose shop is not a demo on the platform is refused (502 mismatch), and nothing of it is served", async () => {
    const w = world({ platform: (path) => (path === "/api/v1/shops/otameshi/products" ? jres(200, { ...LIST, data: { ...LIST.data, shop: { ...LIST.data.shop, is_demo: false } } }) : null) });
    const r = await w.get(SHOP_PATH), b = await r.json();
    expect([r.status, b.error]).toEqual([502, "mismatch"]); expect(JSON.stringify(b)).not.toMatch(/お試し/);
  });
  test("a Kesennuma entry whose shop says is_demo is refused too", async () => {
    const w = world({ entries: [CAFE_OK], platform: (path) => (path === "/api/v1/shops/kesen-cafe/products" ? jres(200, listOf("kesen-cafe", [prod("a1")], { is_demo: true })) : null) });
    expect((await (await w.get(`${PREFIX}/shops/kesen-cafe/products`)).json()).error).toBe("mismatch");
  });
  test("when the platform flips the flag later, the old copy is purged, not served as a stale fallback", async () => {
    const w = world();
    await w.get(SHOP_PATH);
    w.advance(TTL_MS + SWR_MS + 1000);
    w.set("/api/v1/shops/otameshi/products", () => jres(200, { ...LIST, data: { ...LIST.data, shop: { ...LIST.data.shop, is_demo: false } } }));
    expect((await w.get(SHOP_PATH)).status).toBe(502);
    w.advance(ERROR_BACKOFF_MS + 1);
    expect((await w.get(SHOP_PATH)).status).toBe(502);
  });
  test("the product route obeys the kind rule too (it reads the same list)", async () => {
    const w = world({ platform: (path) => (path === "/api/v1/shops/otameshi/products" ? jres(200, { ...LIST, data: { ...LIST.data, shop: { ...LIST.data.shop, is_demo: false } } }) : null) });
    expect((await w.get(`${PREFIX}/products/${DEMO_ID}`)).status).toBe(502);
  });
});

describe("warm-up: the shops' lists are refreshed in the background, so a visitor does not wait for the platform", () => {
  /** Fake timers: nothing real is scheduled in a test. */
  const fakeTimers = () => { const t = { set: [], cleared: [], unref: 0, setInterval(fn, ms) { t.set.push({ fn, ms }); return { unref() { t.unref++; } }; }, clearInterval(h) { t.cleared.push(h); } }; return t; };
  const twoShops = [DEMO, CAFE_OK];

  test("off unless asked for: no timer, nothing asked of the platform at creation", () => {
    const timers = fakeTimers(), w = world({ entries: twoShops, platform: platform2, opts: { timers } });
    expect([timers.set.length, w.calls.length]).toEqual([0, 0]);
    expect(WARM_EVERY_MS).toBe(4 * 60 * 1000); expect(WARM_EVERY_MS).toBeLessThan(TTL_MS);
  });
  test("warm: true asks every allowlisted shop once at start and sets a 4-minute timer that does not keep the process alive; stopWarm clears it", async () => {
    const timers = fakeTimers(), w = world({ entries: twoShops, platform: platform2, opts: { timers, warm: true } });
    await settle();
    expect(w.calls.map((c) => c.path).sort()).toEqual(["/api/v1/shops/kesen-cafe/products", "/api/v1/shops/otameshi/products"]);
    expect([timers.set.length, timers.set[0].ms, timers.unref]).toEqual([1, WARM_EVERY_MS, 1]);
    const first = await w.get(SHOP_PATH); expect(first.headers.get("x-jpyc-cache")).toBe("hit");   // (the first visitor finds it ready)
    expect(w.calls.length).toBe(2);
    w.proxy.stopWarm(); expect(timers.cleared.length).toBe(1); w.proxy.stopWarm(); expect(timers.cleared.length).toBe(1);
  });
  test("{ immediate: false } waits for the first tick; everyMs is honoured", async () => {
    const timers = fakeTimers(), w = world({ entries: twoShops, platform: platform2, opts: { timers, warm: { everyMs: 1234, immediate: false } } });
    await settle(); expect([w.calls.length, timers.set[0].ms]).toEqual([0, 1234]);
    timers.set[0].fn(); await settle(); expect(w.calls.length).toBe(2);
  });
  test("a tick refreshes before the TTL runs out, so the data a visitor sees is never older than the tick", async () => {
    const w = world({ entries: [DEMO] });
    await w.get(SHOP_PATH);
    w.advance(WARM_EVERY_MS);
    w.set("/api/v1/shops/otameshi/products", () => jres(200, listOf("otameshi", [prod("e899a1dd-754d-4a97-b07b-58fcd5940e36", { name: "更新後" })])));
    expect(w.proxy.warmOnce()).toBe(1); await settle();
    const r = await w.get(SHOP_PATH), b = await r.json();
    expect([r.headers.get("x-jpyc-cache"), b.products[0].name, b.age_s]).toEqual(["hit", "更新後", 0]);
    expect(w.calls.length).toBe(2);
  });
  test("it follows the same rules: nothing during a 429's rest, nothing for a key resting after a failure, nothing twice at once", async () => {
    const w = world({ entries: twoShops, platform: (path) => (path === "/api/v1/shops/otameshi/products" ? jres(429, { ok: false }, { "retry-after": "30" }) : path === "/api/v1/shops/kesen-cafe/products" ? jres(200, listOf("kesen-cafe", [prod("c1")])) : null) });
    expect(w.proxy.warmOnce()).toBe(2); expect(w.proxy.warmOnce()).toBe(0);   // (the second tick finds both in flight)
    await settle();
    expect(w.proxy.warmOnce()).toBe(0);   // (the 429 rests the whole proxy: nothing goes upstream)
    const calls = w.calls.length;
    w.advance(31_000); expect(w.proxy.warmOnce()).toBe(2); await settle(); expect(w.calls.length).toBe(calls + 2);
  });
  test("a failing platform is logged and the old copy stays; a warm-up never throws or rejects unhandled", async () => {
    const logs = []; const w = world({ entries: [DEMO], opts: { log: (...a) => logs.push(a.join(" ")) } });
    await w.get(SHOP_PATH);
    w.advance(WARM_EVERY_MS); w.set("/api/v1/shops/otameshi/products", () => { throw new TypeError("fetch failed"); });
    w.proxy.warmOnce(); await settle();
    expect(logs.length).toBe(1); expect(logs[0]).toContain("unavailable");
    const r = await w.get(SHOP_PATH); expect([r.status, r.headers.get("x-jpyc-cache")]).toEqual([200, "hit"]);   // (still inside the TTL: the copy of four minutes ago is served)
  });
  test("a shop that is gone or of the wrong kind is handled like any other answer (remembered, or refused and purged)", async () => {
    const w = world({ entries: [DEMO] });
    await w.get(SHOP_PATH);
    w.advance(WARM_EVERY_MS); w.set("/api/v1/shops/otameshi/products", () => jres(200, { ...LIST, data: { ...LIST.data, shop: { ...LIST.data.shop, is_demo: false } } }));
    w.proxy.warmOnce(); await settle();
    expect((await w.get(SHOP_PATH)).status).toBe(502);   // (purged, not papered over)
  });
});

describe("UpstreamError", () => {
  test("carries a code, a status and a detail, and is an Error", () => {
    const e = new UpstreamError("timeout", { status: 504, detail: "x", retryAfter: 3 });
    expect(e).toBeInstanceOf(Error); expect([e.code, e.status, e.detail, e.retryAfter, e.cool]).toEqual(["timeout", 504, "x", 3, false]);
  });
});

// ============================================================================================================================ alcohol
describe("ALCOHOL IS HELD: nothing that looks like alcohol is listed unless the shop's row declares the mail-order licence and the age check", () => {
  // (the products here are made up; their shapes are those of what the platform's own listings looked like on 2026-10-07: a brewery with the shop category null and product names such as
  // "...ポーター", "...白サワー", "...セッションIPA" with no 酒 or ビール in them, a sweets shop with the tag アルコール and a name with お酒入り)
  const raw = (id, over = {}) => ({ ...LIST.data.products[0], id, slug: null, description: "", category: "食品", tags: [], ...over });
  const named = (name, over = {}) => raw("p-" + name.length, { name, ...over });
  const DECL = { mailOrderLicence: "通信販売酒類小売業免許（所轄税務署の免許。免許者名はお店が回答）", ageCheck: "注文時に生年月日を確認し、お届け時に身分証で確認", confirmed: "2026-10-05" };
  const CAFE_ALC = { ...CAFE_OK, alcohol: DECL };

  test("the words of alcohol in a product's name, category, tags or description (Japanese and English, full-width letters too)", () => {
    for (const name of ["純米大吟醸 海の夜", "梅酒（ロック）", "お酒入りティラミス豆 10個入り", "クラフトビール3本セット", "【Test I】深焙煎コク香るポーター", "【Test III】爽快レモンのセッションIPA", "【Test II】小麦の爽やか白サワー", "赤ワイン 750ml", "Single Malt Whisky 700ml",
      "本格焼酎 芋", "泡盛 古酒", "ハイボール缶 24本", "SAKE gift set", "ＳＡＫＥ（全角）", "Hazy Pale Ale", "Pilsner", "どぶろく", "シャンパン", "ウイスキー", "Sparkling wine", "Dry Gin 500ml", "Dark Rum", "Vodka", "Hard cider", "Craft Beer Set"]) expect([name, looksLikeAlcohol(named(name))]).toEqual([name, true]);
    for (const over of [{ category: "お酒" }, { category: "酒類" }, { tags: ["アルコール"] }, { tags: ["スイーツ", "Alcohol"] }, { tags: ["日本酒"] }]) expect([JSON.stringify(over), looksLikeAlcohol(named("ふつうの名前", over))]).toEqual([JSON.stringify(over), true]);
    for (const description of ["アルコール分 5%。20歳未満の飲酒は法律で禁止されています。", "日本酒好きにたまらない一本です。", "Contains alcohol (ABV 5%)", "地元の蔵が醸造所で仕込みました", "ビールのお供に", "A craft brewery's seasonal"]) expect([description, looksLikeAlcohol(named("ふつうの名前", { description }))]).toEqual([description, true]);
  });
  test("what is not alcohol: tea, seaweed, sour cream, ginger ale and ginger, wine-red knitwear, a scale model, an iPad stand, lamb, porterhouse, the word 'cider' alone", () => {
    for (const name of ["お茶 煎茶 100g", "宮城県産 乾燥わかめ", "サワークリーム 200g", "ジンジャーエール（手作りシロップ）", "ワインレッドのニット", "ginger beer", "ginger syrup", "Scale model kit", "iPad stand", "ラム肉 500g", "ラムネ", "porterhouse steak", "ジンギスカン", "海苔（のり）", "ふかひれスープ", "ビアガーデン券", "Cider vinegar", "rummy cards", "gingerbread"]) expect([name, looksLikeAlcohol(named(name))]).toEqual([name, false]);
    expect(looksLikeAlcohol(named("お茶", { description: "海の幸を丁寧に加工しました。ご家庭用にどうぞ。", tags: ["お土産", "ギフト"] }))).toBe(false);
    for (const bad of [null, undefined, 5, "x", [], {}]) expect(looksLikeAlcohol(bad)).toBe(false);
  });
  test("the words err on the side of holding: a harmless product they catch (sake cups, lees, 甘酒, a snack 'for beer') is held until a person names its id in notAlcohol", () => {
    for (const name of ["酒器 ぐい呑み", "さんまの酒粕漬け", "甘酒 ひとくちパック", "ほたての酒蒸し"]) expect([name, looksLikeAlcohol(named(name))]).toEqual([name, true]);
  });
  test("a shop that is a brewery, sake maker, winery, distillery or liquor shop (by name, slug or description; or by category) sells alcohol; an ordinary shop and the demo do not", () => {
    const shop = (over) => ({ ...LIST.data.shop, slug: "ordinary", name: "海のお店", category: "食品", description: "", is_demo: false, ...over });
    for (const over of [{ name: "テスト・ブリュワリー" }, { name: "Test Brewery" }, { slug: "x-brewery" }, { slug: "testbrewery" }, { name: "山田酒造" }, { name: "角の酒店" }, { name: "Seaside Winery" }, { description: "うちの酒蔵では毎年仕込みます" }, { description: "A small distillery by the sea" }, { category: "酒類" }, { category: "お酒,食品" }, { name: "ブルワリー" }]) expect([JSON.stringify(over), shopSellsAlcohol(shop(over))]).toEqual([JSON.stringify(over), true]);
    for (const over of [{}, { name: "お茶の専門店" }, { description: "お酒に合うおつまみも少しあります" }, { category: "食品,飲料" }, { category: null }]) expect([JSON.stringify(over), shopSellsAlcohol(shop(over))]).toEqual([JSON.stringify(over), false]);
    expect(shopSellsAlcohol(LIST.data.shop)).toBe(false); for (const bad of [null, undefined, 5, "x"]) expect(shopSellsAlcohol(bad)).toBe(false);
  });
  test("alcoholAllowed: the licence and the age check in words, and a real date, all three (never half of it)", () => {
    expect(alcoholAllowed(DECL, T0)).toBe(true); expect(alcoholAllowed({ ...DECL, ref: "memo" }, T0)).toBe(true);
    for (const bad of [null, undefined, "yes", true, [], {}, { ...DECL, mailOrderLicence: "" }, { ...DECL, mailOrderLicence: "  " }, { ...DECL, mailOrderLicence: undefined }, { ...DECL, ageCheck: "" }, { ...DECL, ageCheck: 5 }, { ...DECL, confirmed: "" }, { ...DECL, confirmed: "5 Oct" },
      { ...DECL, confirmed: "2026-02-30" }, { ...DECL, confirmed: "2026-10-09" }, { mailOrderLicence: DECL.mailOrderLicence, ageCheck: DECL.ageCheck }]) expect([JSON.stringify(bad), alcoholAllowed(bad, T0)]).toEqual([JSON.stringify(bad), false]);
  });

  test("filterProducts, no gate: what looks like alcohol is held and counted, the rest is listed; nothing is labelled", () => {
    const list = [named("お茶"), named("クラフトビール3本セット"), named("乾燥わかめ"), named("【Test】深焙煎ポーター")].map((p, i) => ({ ...p, id: "id-" + i }));
    const held = { n: 0 }, out = filterProducts(list, null, undefined, held);
    expect(out.map((p) => p.name)).toEqual(["お茶", "乾燥わかめ"]); expect(held.n).toBe(2); expect(out.every((p) => p.alcohol === false)).toBe(true);
    expect(filterProducts(list).length).toBe(2);   // (the default is the safe one: two arguments, as before this rule, never list alcohol by accident)
  });
  test("filterProducts, declared: the alcohol is listed and labelled alcohol: true (the panel's 20+ badge), the rest is not labelled", () => {
    const list = [named("お茶"), named("クラフトビール3本セット"), named("乾燥わかめ")].map((p, i) => ({ ...p, id: "id-" + i }));
    const held = { n: 0 }, out = filterProducts(list, null, { alcoholOk: true, notAlcohol: new Set(), shop: null }, held);
    expect(out.map((p) => [p.name, p.alcohol])).toEqual([["お茶", false], ["クラフトビール3本セット", true], ["乾燥わかめ", false]]); expect(held.n).toBe(0);
  });
  test("notAlcohol is a person's exception for one id: listed without the declaration, never labelled; it does not exempt the neighbours", () => {
    const list = [named("酒器 ぐい呑み"), named("日本酒 一升瓶")].map((p, i) => ({ ...p, id: "id-" + i }));
    const held = { n: 0 }, out = filterProducts(list, null, { alcoholOk: false, notAlcohol: new Set(["id-0"]), shop: null }, held);
    expect(out.map((p) => [p.name, p.alcohol])).toEqual([["酒器 ぐい呑み", false]]); expect(held.n).toBe(1);
    expect(filterProducts(list, null, { alcoholOk: true, notAlcohol: new Set(["id-0"]), shop: null }).map((p) => [p.name, p.alcohol])).toEqual([["酒器 ぐい呑み", false], ["日本酒 一升瓶", true]]);   // (declared: only the one that looks like alcohol and is not excused is labelled)
  });
  test("a brewery's shop is held whole, a tea towel included, until it declares; declared, only the products whose words say alcohol are labelled", () => {
    const shop = { ...LIST.data.shop, slug: "x-brewery", name: "テスト・ブリュワリー", is_demo: false, category: null };
    const list = [named("手ぬぐい（ロゴ入り）", { category: "雑貨" }), named("【Test】深焙煎ポーター")].map((p, i) => ({ ...p, id: "id-" + i }));
    const held = { n: 0 };
    expect(filterProducts(list, null, { alcoholOk: false, notAlcohol: new Set(), shop }, held)).toEqual([]); expect(held.n).toBe(2);
    expect(filterProducts(list, null, { alcoholOk: true, notAlcohol: new Set(), shop }).map((p) => [p.name, p.alcohol])).toEqual([["手ぬぐい（ロゴ入り）", false], ["【Test】深焙煎ポーター", true]]);
    expect(filterProducts(list, null, { alcoholOk: false, notAlcohol: new Set(["id-0"]), shop }).map((p) => p.name)).toEqual(["手ぬぐい（ロゴ入り）"]);   // (the towel, excused by name of id)
  });
  test("an entry's own productIds do not get round it: a listed id that looks like alcohol is still held without the declaration", () => {
    const list = [named("お茶"), named("クラフトビール")].map((p, i) => ({ ...p, id: "id-" + i }));
    expect(filterProducts(list, ["id-1", "id-0"], undefined).map((p) => p.id)).toEqual(["id-0"]);
    expect(filterProducts(list, ["id-1", "id-0"], { alcoholOk: true, notAlcohol: new Set(), shop: null }).map((p) => p.id)).toEqual(["id-1", "id-0"]);
  });
  test("buildAllowlist carries the declaration (a boolean) and the exceptions (safe ids only); the licence's words never leave the data file", () => {
    const a = buildAllowlist(file({ ...CAFE_ALC, notAlcohol: ["p-1", "bad id", 7, "p-2"] }, { ...CAFE_OK, id: "other", shopSlug: "other-shop", alcohol: { ...DECL, ageCheck: "" } }), { now: T0 });
    const e = a.shops.get("kesen-cafe"); expect([e.alcoholOk, [...e.notAlcohol]]).toEqual([true, ["p-1", "p-2"]]);
    expect(a.shops.get("other-shop").alcoholOk).toBe(false); expect(JSON.stringify([...a.shops.values()])).not.toMatch(/税務署|生年月日/);
    expect(buildAllowlist(file(DEMO), { now: T0 }).shops.get("otameshi").alcoholOk).toBe(false);
    expect(buildAllowlist(file({ ...CAFE_OK, alcohol: DECL }), { dev: true, now: T0 }).shops.get("kesen-cafe").alcoholOk).toBe(true); expect(buildAllowlist(file(CAFE_OK), { dev: true, now: T0 }).shops.get("kesen-cafe").alcoholOk).toBe(false);   // (a dev server lifts the switch, never the alcohol rule)
  });

  // the proxy end to end: a shop that sells tea and beer
  const tea = raw("11111111-1111-4111-8111-000000000001", { name: "お茶 煎茶 100g" }), beer = raw("11111111-1111-4111-8111-000000000002", { name: "クラフトビール3本セット", category: "飲料" });
  const mixed = (path) => (path === "/api/v1/shops/kesen-cafe/products" ? jres(200, listOf("kesen-cafe", [tea, beer])) : null);
  test("through the proxy, without the declaration: the beer is not in the shop's list, not found by id, counted, and said once in the log (not at every refresh)", async () => {
    const logs = [], w = world({ entries: [CAFE_OK], platform: mixed, opts: { log: (...a) => logs.push(a.join(" ")) } });
    const a = await w.json(PREFIX + "/shops/kesen-cafe/products");
    expect(a.status).toBe(200); expect(a.body.products.map((p) => p.name)).toEqual(["お茶 煎茶 100g"]); expect(JSON.stringify(a.body)).not.toContain("ビール");
    const b = await w.json(PREFIX + "/products/" + beer.id); expect([b.status, b.body.error]).toEqual([404, "not_found"]);
    const t = await w.json(PREFIX + "/products/" + tea.id); expect(t.status).toBe(200);
    expect(w.proxy.stats.alcoholHeld).toBe(1); expect(logs.filter((l) => l.startsWith("jpyc alcohol kesen-cafe 1 product(s) held back")).length).toBe(1);
    w.advance(TTL_MS + SWR_MS + 1000); await w.json(PREFIX + "/shops/kesen-cafe/products");   // (a refresh with the same count)
    expect(logs.filter((l) => l.startsWith("jpyc alcohol")).length).toBe(1);
  });
  test("through the proxy, declared: both are listed, only the beer says alcohol, and by id too", async () => {
    const w = world({ entries: [CAFE_ALC], platform: mixed });
    const a = await w.json(PREFIX + "/shops/kesen-cafe/products");
    expect(a.body.products.map((p) => [p.name, p.alcohol])).toEqual([["お茶 煎茶 100g", false], ["クラフトビール3本セット", true]]); expect(w.proxy.stats.alcoholHeld).toBe(0);
    const b = await w.json(PREFIX + "/products/" + beer.id); expect([b.status, b.body.product.alcohol]).toEqual([200, true]);
    expect(Object.keys(a.body.products[1]).sort()).toEqual(Object.keys(a.body.products[0]).sort());   // (the same keys: category, tags and description still never leave)
    expect(JSON.stringify(a.body)).not.toMatch(/"category"|"tags"|"description"/);
  });
  test("a half declaration holds (the licence without the age check, a bad date, a future date): the same shop, the beer stays out", async () => {
    for (const alcohol of [{ ...DECL, ageCheck: "" }, { ...DECL, mailOrderLicence: undefined }, { ...DECL, confirmed: "2026-02-30" }, { ...DECL, confirmed: "2999-01-01" }]) {
      const w = world({ entries: [{ ...CAFE_OK, alcohol }], platform: mixed }), a = await w.json(PREFIX + "/shops/kesen-cafe/products");
      expect([JSON.stringify(alcohol), a.body.products.map((p) => p.name)]).toEqual([JSON.stringify(alcohol), ["お茶 煎茶 100g"]]);
    }
  });
  test("the demo shop's product is not alcohol, so the shipped state loses nothing to the rule", async () => {
    const w = world(), a = await w.json(SHOP_PATH);
    expect([a.body.products.length, a.body.products[0].alcohol, w.proxy.stats.alcoholHeld]).toEqual([1, false, 0]);
  });
});
