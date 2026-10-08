// [jpyc] The 「JPYCで買えるお店」 panel (ui/jpyc-store.js) on a small DOM (test/lib/mini-dom.js) with a fake fetch: the shop list, a shop's products (photo, name, price, stock, 「JPYCで買う」
// as a link to the product page on JPYC EC), every state (loading, ok, empty, error, offline, busy, gone, mismatch, stale), the keyboard (Esc steps back, Tab is trapped, the town's
// keys stand down), focus, the page behind it (inert), the flyer's kids gate, ?jpyc=, the Google Maps link, escaping, the language, and that no wallet code and no payment exists here.
// The proxy's answers are made by the real filter of server/app/jpyc.js from the recorded demo shop (test/fixtures/jpyc/), so the panel is fed exactly what the server sends.
// The real-browser version (a phone, the proxy and a mock platform) is test/jpyc-store.e2e.test.js.
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { makeDom } from "./lib/mini-dom.js";
import { mountJpycStore, focusables, nextFocus, listHtml, shopHtml, JPYC_CSS, JPYC_BTN_CSS, esc } from "../src/anime/ui/jpyc-store.js";
import { createI18n } from "../src/anime/ui/i18n.js";
import { GUIDE_URL, googleMapsUrl } from "../src/anime/ui/jpyc-lib.js";
import { filterShop, filterProducts } from "../server/app/jpyc.js";

const ROOT = resolve(import.meta.dir, "..");
const LIST = JSON.parse(readFileSync(join(ROOT, "test/fixtures/jpyc/shop-otameshi-products.json"), "utf8"));
const DEMO_ID = LIST.data.products[0].id;
const SRC = readFileSync(join(ROOT, "src/anime/ui/jpyc-store.js"), "utf8");

// ------------------------------------------------------------------ the proxy's answers
const prod = (id, over = {}) => ({ ...LIST.data.products[0], id, name: "商品 " + id, ...over });
/** What the proxy sends for a shop: the real filter applied to an upstream-shaped list. */
const answer = (slug, products, shopOver = {}, meta = {}) => ({ ok: true, shop: filterShop({ ...LIST.data.shop, slug, is_demo: slug === "otameshi", ...shopOver }, slug), products: filterProducts(products), fetched_at: "2026-10-06T06:00:00.000Z", age_s: 0, stale: false, ...meta });
const DEMO_ANSWER = () => answer("otameshi", LIST.data.products);
const jres = (status, body) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const CAFE = { id: "k-port", kind: "kesennuma", ja: "K-port", en: "K-port Cafe", x: 120.6, z: 124.7, shopSlug: "k-port-shop", productIds: null, consent: { owner: "K-port", date: "2026-10-05", scope: ["jpyc-listing"], ref: null }, googleMapsQuery: "K-port 気仙沼市 魚町" };
const PENDING = { id: "pending", kind: "kesennuma", ja: "喫茶マンボ", en: "Cafe Mambo", x: -160.3, z: 142.4, shopSlug: "mambo-shop", productIds: null, consent: null };
const DEMO = { id: "jpyc-demo", kind: "demo", enabled: true, ja: "JPYC EC デモショップ", en: "JPYC EC demo shop", x: 5, z: 40, shopSlug: "otameshi", productIds: null, consent: null };
const file = (...entries) => ({ schema: "klc-jpyc-shops/1", version: 1, entries });
const SHIPPED = JSON.parse(readFileSync(join(ROOT, "data/shops/jpyc.json"), "utf8"));   // (data/shops/jpyc.json as it is committed: the demo switched off)
const DEV = "localhost", PROD_HOST = "kesennuma-living-city-production.up.railway.app";

const GLOBALS = ["document", "location", "localStorage", "addEventListener", "removeEventListener", "MutationObserver", "requestAnimationFrame", "setTimeout", "navigator"];
/** Every element under `n` (mini-dom has no "*" selector). */
const everyEl = (n) => { const out = []; const walk = (x) => { for (const c of x.childNodes) { if (c.nodeType === 1) { out.push(c); walk(c); } } }; walk(n); return out; };
const BEFORE = Object.fromEntries(GLOBALS.map((k) => [k, globalThis[k]]));   // (what the globals were when this file was loaded: every world must hand them back)
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); await Bun.sleep(0); };

/** A panel on a mini DOM: stand-ins for the page behind it (#scene, #klc-ui with a menu button), a fake pad, a fake HUD and a scripted fetch. Always call cleanup(). */
function world({ search = "", hostname, data = file(DEMO), fetchImpl = null, playing = true, lang = "ja", session = null, timeoutMs, online = true } = {}) {
  const dom = makeDom({ search, hostname });
  const saved = Object.fromEntries(GLOBALS.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  const put = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  const timers = new Set(), realST = globalThis.setTimeout, windowListeners = [];
  const nav = { onLine: online };
  put("document", dom.document); put("location", dom.location); put("localStorage", dom.localStorage); put("MutationObserver", dom.MutationObserver); put("navigator", nav);
  put("addEventListener", (type, fn, cap) => { windowListeners.push([type, fn, cap]); dom.window.addEventListener(type, fn, cap); });
  put("removeEventListener", (type, fn) => dom.window.removeEventListener(type, fn));
  put("requestAnimationFrame", (f) => { f(); return 1; });
  put("setTimeout", (f, ms, ...a) => { const id = realST(f, ms, ...a); timers.add(id); return id; });
  const cleanup = () => { for (const id of timers) clearTimeout(id); for (const k of GLOBALS) { if (saved[k]) Object.defineProperty(globalThis, k, saved[k]); else delete globalThis[k]; } };
  try {
    const body = dom.document.body;
    if (playing) body.classList.add("playing");
    const scene = dom.document.createElement("canvas"); scene.id = "scene"; body.appendChild(scene);
    const ui = dom.document.createElement("div"); ui.id = "klc-ui"; ui.innerHTML = '<button data-act="menu">menu</button><button data-act="jpyc">jpyc</button>'; body.appendChild(ui);
    const script = dom.document.createElement("script"); body.appendChild(script);
    const pad = { calls: [], suppress(r, on) { this.calls.push([r, on]); } };
    const ctx = { services: {}, pad };
    const I = createI18n(lang);
    const hud = { renders: 0, render() { this.renders++; } };
    const life = { hud };
    const calls = [];
    const f = fetchImpl ?? (async () => jres(200, DEMO_ANSWER()));
    const fetchFn = (url, init) => { calls.push({ url: String(url), init }); return f(String(url), init, calls.length); };
    const sess = session ?? { v: {}, get(k) { return this.v[k] ?? null; }, set(k, v) { this.v[k] = v; } };
    const jpyc = mountJpycStore(ctx, life, { i18n: I, force: !playing ? false : undefined, fetch: fetchFn, search, data, session: sess, timeoutMs });
    const root = () => dom.document.getElementById("klc-jpyc");
    const q = (s) => root()?.querySelector(s), all = (s) => (root() ? [...root().querySelectorAll(s)] : []);
    const click = (node, { pointer = true } = {}) => dom.fire(node, "click", { detail: pointer ? 1 : 0 });
    const key = (k, props = {}) => dom.fire(dom.document.body, "keydown", { key: k, code: k.length === 1 ? "Key" + k.toUpperCase() : k, repeat: false, ...props });
    const text = () => q('[data-f="body"]')?.textContent ?? "";
    const openBtn = ui.querySelector('[data-act="jpyc"]');
    return { dom, ctx, jpyc, I, hud, pad, root, q, all, click, key, text, calls, nav, ui, scene, body, openBtn, sess, windowListeners, cleanup, life };
  } catch (e) { cleanup(); throw e; }
}
const withWorld = async (opts, fn) => { const w = world(opts); try { return await fn(w); } finally { w.cleanup(); } };
/** Open the demo shop's screen through the list and wait for the answer. */
async function openDemoShop(w) { w.jpyc.openList({ opener: w.openBtn }); w.click(w.q('[data-act="shop"][data-id="jpyc-demo"]')); await flush(); }

describe("mounting builds nothing and asks for nothing", () => {
  test("the service is published; no DOM, no style, no request, no storage write until the first open", () => withWorld({}, (w) => {
    expect(w.ctx.services.jpyc).toBe(w.jpyc);
    expect(w.jpyc.enabled).toBe(true); expect(w.jpyc.kids).toBe(false); expect(w.jpyc.mode).toBe("normal"); expect(w.jpyc.isOpen).toBe(false);
    expect(w.root()).toBeNull(); expect(w.dom.document.getElementById("klc-jpyc-css")).toBeNull();   // (the sheet's own style waits for the first open)
    expect(w.dom.document.getElementById("klc-jpyc-btn-css").textContent).toBe(JPYC_BTN_CSS);   // (the toolbar item's one layout rule is there from the start: the item is)
    expect(w.calls.length).toBe(0); expect(w.pad.calls.length).toBe(0);
    expect(w.jpyc.entries().map((e) => e.id)).toEqual(["jpyc-demo"]);
  }));
  test("the sheet's own style is injected on the first open, once, and style.js is not involved", () => withWorld({}, (w) => {
    w.jpyc.openList(); w.jpyc.close(); w.jpyc.openList();
    expect(w.dom.document.querySelectorAll("#klc-jpyc-css").length).toBe(1);
    expect(w.dom.document.getElementById("klc-jpyc-css").textContent).toBe(JPYC_CSS);
    expect(SRC).not.toMatch(/from '\.\/style\.js'|touchpad-style/);
  }));
  test("the toolbar item's rule: between 721 and 839 px it leaves the full row for the report button's second row (the quality selector must not be pushed over the wordmark); nowhere else", () => {
    expect(JPYC_BTN_CSS).toMatch(/^@media \(min-width: 721px\) and \(max-width: 839px\) \{/);
    expect(JPYC_BTN_CSS).toContain("#klc-ui .tools .jpyc { position: absolute; top: 94px; right: 46px; margin: 0; }");
    expect(JPYC_BTN_CSS).toContain("body.klc-pad #klc-ui .tools .jpyc { top: 92px; right: 52px; width: 44px; height: 44px; }");
    expect((JPYC_BTN_CSS.match(/@media/g) ?? []).length).toBe(1);   // (one rule, one range)
    expect(JPYC_BTN_CSS.length).toBeLessThan(400);
  });
});

describe("the shop list", () => {
  test("a modal dialog named 「JPYCで買えるお店」 with the demo shop, its badge, the guide link, the rate, the guardian's line and the credits", () => withWorld({}, (w) => {
    expect(w.jpyc.openList({ opener: w.openBtn })).toBe(true);
    const sheet = w.q(".kj-sheet");
    expect([sheet.getAttribute("role"), sheet.getAttribute("aria-modal"), sheet.getAttribute("aria-labelledby")]).toEqual(["dialog", "true", "kj-title"]);
    const body = w.q('[data-f="body"]');   // (the body is a named region, and data-scroll tells the touch pad it scrolls: the pad vetoes every touchmove outside the elements it lists)
    expect([body.getAttribute("role"), body.getAttribute("aria-labelledby"), body.hasAttribute("data-scroll"), body.getAttribute("tabindex")]).toEqual(["region", "kj-title", true, "-1"]);
    expect(w.q("#kj-title").textContent).toBe("JPYCで買えるお店");
    expect(w.root().dataset.open).toBe("1"); expect(w.root().dataset.screen).toBe("list"); expect(w.root().getAttribute("lang")).toBe("ja");
    const card = w.q('[data-act="shop"][data-id="jpyc-demo"]');
    expect(card.textContent).toContain("JPYC EC デモショップ"); expect(card.textContent).toContain("デモ（実際の店舗ではありません）");
    const guide = w.all("a.kj-link").find((a) => a.getAttribute("href") === GUIDE_URL);
    expect([guide.getAttribute("href"), guide.getAttribute("target"), guide.getAttribute("rel"), guide.textContent]).toEqual([GUIDE_URL, "_blank", "noopener noreferrer", expect.stringContaining("JPYCとは / 入手方法")]);
    expect(w.text()).toContain("1 JPYC = ¥1");
    expect(w.text()).toContain("18歳未満の方は、保護者の同意を得てからご購入ください。");
    expect(w.text()).toContain("JPYC ECはMAMETAが運営しています。JPYCはJPYC株式会社の登録商標です。ケセンメメント（KesenMemento）はどちらとも提携していません。");
    expect(w.calls.length).toBe(0);   // (the list needs no request)
  }));
  test("the page behind it is inert, the pad steps aside, the town's class is set; closing undoes all of it and focus goes back to the button that opened it", () => withWorld({}, (w) => {
    w.openBtn.focus();
    w.jpyc.openList({ opener: w.openBtn });
    expect(w.scene.hasAttribute("inert") && w.ui.hasAttribute("inert")).toBe(true); expect(w.root().hasAttribute("inert")).toBe(false);
    expect(w.dom.document.body.querySelector("script").hasAttribute("inert")).toBe(false);
    expect(w.dom.document.body.classList.contains("klc-jpyc-open")).toBe(true); expect(w.pad.calls.at(-1)).toEqual(["jpyc", true]);
    expect(w.dom.document.activeElement).toBe(w.q('[data-f="body"]'));
    expect(w.jpyc.close()).toBe(true);
    expect(w.scene.hasAttribute("inert") || w.ui.hasAttribute("inert")).toBe(false);
    expect(w.dom.document.body.classList.contains("klc-jpyc-open")).toBe(false); expect(w.pad.calls.at(-1)).toEqual(["jpyc", false]);
    expect(w.root().dataset.open).toBe("0"); expect(w.dom.document.activeElement).toBe(w.openBtn);
    expect(w.jpyc.close()).toBe(false);
  }));
  test("it opens only once the visitor is in the town (body.playing), like the report sheet", () => withWorld({ playing: false }, (w) => {
    expect(w.jpyc.openList()).toBe(false); expect(w.jpyc.open("jpyc-demo")).toBe(false); expect(w.root()).toBeNull();
    w.dom.document.body.classList.add("playing"); expect(w.jpyc.openList()).toBe(true);
  }));
  test("the scrim and the ✕ close it; the 言語 button switches the page's language and the HUD is told to rebuild", () => withWorld({}, (w) => {
    w.jpyc.openList({ opener: w.openBtn });
    w.click(w.q(".kj-scrim")); expect(w.jpyc.isOpen).toBe(false);
    w.jpyc.openList({ opener: w.openBtn });
    w.click(w.q('button[data-act="close"]')); expect(w.jpyc.isOpen).toBe(false);
    w.jpyc.openList({ opener: w.openBtn });
    w.click(w.q('[data-act="lang"]'));
    expect(w.I.lang).toBe("en"); expect(w.hud.renders).toBe(1);
    expect(w.q("#kj-title").textContent).toBe("Shops that take JPYC"); expect(w.root().getAttribute("lang")).toBe("en");
    expect(w.text()).toContain("Demo (not a real shop)"); expect(w.text()).toContain("What is JPYC / how to get it");
    expect(w.text()).toContain("JPYC EC is operated by MAMETA; JPYC is a registered trademark of JPYC Inc.; KesenMemento is not affiliated with either");
    expect(w.text()).toContain("If you are under 18, please get a parent or guardian's consent before buying.");
    expect(w.dom.document.activeElement).toBe(w.q('[data-act="lang"]'));
  }));
  test("the list is data-driven: a consented Kesennuma shop shows with its own badge and a Google Maps link; the demo has none", () => withWorld({ data: file(DEMO, CAFE) }, (w) => {
    w.jpyc.openList();
    const cards = w.all(".kj-shopcard");
    expect(cards.length).toBe(2);
    const demo = cards.find((c) => c.querySelector('[data-id="jpyc-demo"]')), cafe = cards.find((c) => c.querySelector('[data-id="k-port"]'));
    expect(demo.querySelector(".kj-maps")).toBeNull();
    expect(cafe.textContent).toContain("気仙沼のお店");
    const maps = cafe.querySelector(".kj-maps");
    expect([maps.getAttribute("href"), maps.getAttribute("target"), maps.getAttribute("rel")]).toEqual([googleMapsUrl("K-port 気仙沼市 魚町"), "_blank", "noopener noreferrer"]);
    expect(maps.textContent).toContain("Google マップで見る");
  }));
});

describe("a shop's products: photo, name, price, stock and 「JPYCで買う」, a link to the product page on JPYC EC", () => {
  test("the demo shop: the request goes to the proxy with no credentials; the product shows its photo, name, 0 JPYC, stock and a buy link in a new tab", () => withWorld({}, async (w) => {
    await openDemoShop(w);
    expect(w.calls.length).toBe(1);
    expect(w.calls[0].url).toBe("/api/jpyc/shops/otameshi/products");
    expect(w.calls[0].init.credentials).toBe("omit"); expect(w.calls[0].init.referrerPolicy).toBe("no-referrer"); expect(w.calls[0].init.headers).toEqual({ accept: "application/json" });
    expect(w.q("#kj-title").textContent).toBe("JPYC EC デモショップ");
    expect(w.root().dataset.screen).toBe("shop"); expect(w.root().dataset.phase).toBe("ok");
    const card = w.q(".kj-product");
    expect(card.dataset.id).toBe(DEMO_ID);
    expect(card.querySelector(".kj-pname").textContent).toBe("【テスト用】決済お試し商品（0 JPYC）");
    expect(card.querySelector(".kj-price").textContent).toBe("0 JPYC");
    expect(card.querySelector(".kj-avail").textContent).toBe("在庫 9,932");
    const img = card.querySelector("img");
    expect([img.getAttribute("src"), img.getAttribute("loading"), img.getAttribute("referrerpolicy"), img.getAttribute("alt")]).toEqual(["https://imagedelivery.net/lEoBH1kNrkZEnFTUBCbLSw/1042ad63-6bb7-4275-ad26-c09a501f7c00/public", "lazy", "no-referrer", ""]);
    const buy = card.querySelector("a.kj-buy");
    expect(buy.getAttribute("href")).toBe(`https://ec.jpyc-service.com/shops/otameshi/products/${DEMO_ID}`);   // (slug is null: the id is the page)
    expect([buy.getAttribute("target"), buy.getAttribute("rel"), buy.textContent]).toEqual(["_blank", "noopener noreferrer", "JPYCで買う"]);
    expect(buy.getAttribute("aria-label")).toContain("JPYCで買う: 【テスト用】決済お試し商品（0 JPYC）");
    expect(w.text()).toContain("価格はJPYCで表示しています。1 JPYC = ¥1");
    expect(w.text()).toContain("デモ（実際の店舗ではありません）"); expect(w.text()).toContain("実際の送金は行われません");
    expect(w.text()).toContain("対応チェーン: Polygon · Ethereum · Avalanche");
    expect(w.text()).toContain("JPYC EC上のお店の名前: 0 JPYCで決済お試し（JPYC EC運営）");
    const shopLink = w.q('.kj-shophead a[href="https://ec.jpyc-service.com/shops/otameshi"]');
    expect([shopLink.getAttribute("target"), shopLink.getAttribute("rel")]).toEqual(["_blank", "noopener noreferrer"]);
    expect(w.all("a.kj-link").some((a) => a.getAttribute("href") === GUIDE_URL)).toBe(true);   // (the 「JPYCとは / 入手方法」 line is on the shop screen too)
    expect(w.text()).toContain("18歳未満の方は");
  }));
  test("the page is /shops/{shop}/products/{slug ?? id}: a product's own slug is used when it has one", () => withWorld({ fetchImpl: async () => jres(200, answer("otameshi", [prod("p-1", { slug: "matcha-latte" })])) }, async (w) => {
    await openDemoShop(w);
    expect(w.q("a.kj-buy").getAttribute("href")).toBe("https://ec.jpyc-service.com/shops/otameshi/products/matcha-latte");
  }));
  test("a price is in JPYC with a thousands separator, with 〜 when a variant costs more; the whole list is drawn in the proxy's order", () => withWorld({ fetchImpl: async () => jres(200, answer("otameshi", [
    prod("p-1", { price_jpyc: "1200.000000000000000000" }), prod("p-2", { price_jpyc: "1500", variants: { skus: [{ price_jpyc: "1800" }] } }), prod("p-3", { price_jpyc: "1234567" }), prod("p-4", { price_jpyc: "12.5" }),
  ])) }, async (w) => {
    await openDemoShop(w);
    expect(w.all(".kj-price").map((n) => n.textContent)).toEqual(["1,200 JPYC", "1,500 JPYC〜", "1,234,567 JPYC", "12.5 JPYC"]);
    expect(w.all(".kj-product").map((n) => n.dataset.id)).toEqual(["p-1", "p-2", "p-3", "p-4"]);
    w.click(w.q('[data-act="lang"]'));
    expect(w.all(".kj-price").map((n) => n.textContent)).toEqual(["1,200 JPYC", "from 1,500 JPYC", "1,234,567 JPYC", "12.5 JPYC"]);
  }));
  test("what is left, in the shop's own mode: exact numbers, a few left, in stock; a product that cannot be bought gets a plain link, not 「JPYCで買う」", () => withWorld({ fetchImpl: async () => jres(200, answer("otameshi", [
    prod("a", { stock: 12 }), prod("b", { stock: 3 }), prod("c", { stock: 0, online_purchase_available: false }), prod("d", { online_sale_status: "coming_soon", online_purchase_available: false }),
    prod("e", { online_sale_status: "ended", online_purchase_available: false }), prod("f", { online_purchase_available: false, stock: 4 }), prod("g", { stock: null }),
  ], { stock_display_mode: "low_only", low_stock_threshold: 5 })) }, async (w) => {
    await openDemoShop(w);
    const by = Object.fromEntries(w.all(".kj-product").map((n) => [n.dataset.id, n]));
    const avail = (id) => by[id].querySelector(".kj-avail").textContent, buy = (id) => by[id].querySelector("a.kj-buy") !== null, view = (id) => by[id].querySelector("a.kj-view");
    expect([avail("a"), avail("b"), avail("c"), avail("d"), avail("e"), avail("f"), avail("g")]).toEqual(["在庫あり", "残りわずか", "品切れ", "9/20 08:10から販売", "販売終了", "いまは買えません", "在庫あり"]);
    expect(["a", "b", "g"].map(buy)).toEqual([true, true, true]); expect(["c", "d", "e", "f"].map(buy)).toEqual([false, false, false, false]);
    for (const id of ["c", "d", "e", "f"]) { expect(view(id).textContent).toBe("JPYC ECで見る"); expect(view(id).getAttribute("href")).toContain(`/products/${id}`); expect(view(id).getAttribute("target")).toBe("_blank"); }
  }));
  test("a product without a photo, or whose photo fails to load, shows a placeholder, never a broken image", () => withWorld({ fetchImpl: async () => jres(200, answer("otameshi", [prod("a", { image_urls: [] }), prod("b")])) }, async (w) => {
    await openDemoShop(w);
    const [a, b] = w.all(".kj-product");
    expect(a.querySelector("img")).toBeNull(); expect(a.querySelector(".kj-noimg").textContent).toContain("写真なし");
    const img = b.querySelector("img"); expect(img).not.toBeNull();
    w.dom.fire(img, "error", { bubbles: false });
    expect(b.querySelector("img")).toBeNull(); expect(b.querySelector(".kj-noimg")).not.toBeNull();
  }));
  test("names are text: markup in a product's name or in a shop's name never becomes an element or an attribute", () => withWorld({ fetchImpl: async () => jres(200, answer("otameshi", [prod("x1", { name: '<img src=x onerror="alert(1)">' }), prod("x2", { name: '"><script>alert(2)</script>' }), prod("x3", { name: "A & B <b>bold</b>" })], { name: "<svg onload=alert(3)>" })) }, async (w) => {
    await openDemoShop(w);
    expect(w.all(".kj-pname").map((n) => n.textContent)).toEqual(['<img src=x onerror="alert(1)">', '"><script>alert(2)</script>', "A & B <b>bold</b>"]);
    for (const el of everyEl(w.root())) for (const a of el.attributes) expect([a.name, /^on/i.test(a.name)]).toEqual([a.name, false]);
    expect(w.all("script").length).toBe(0); expect(w.all("b").length).toBe(0); expect(w.all("svg[onload]").length).toBe(0);
    expect(w.text()).toContain("<svg onload=alert(3)>");
  }));
  test("a hostile URL in the answer (a javascript: or http: image, a slug with a slash) is never put in a link or an image", () => withWorld({ fetchImpl: async () => jres(200, { ...answer("otameshi", []), products: [
    { ...prod("p1"), image_url: "javascript:alert(1)" }, { ...prod("p2"), image_url: "http://insecure.example/a.png" }, { ...prod("p3"), slug: "../../evil" }, { ...prod("p4"), id: "a/b" },
  ] }) }, async (w) => {
    await openDemoShop(w);
    expect(w.all(".kj-product").map((n) => n.dataset.id)).toEqual(["p1", "p2", "p3"]);
    expect(w.all("img").length).toBe(0);
    expect(w.all("a.kj-buy").map((a) => a.getAttribute("href"))).toEqual(["https://ec.jpyc-service.com/shops/otameshi/products/p1", "https://ec.jpyc-service.com/shops/otameshi/products/p2", "https://ec.jpyc-service.com/shops/otameshi/products/p3"]);
    for (const a of w.all("a[href]")) expect(a.getAttribute("href")).toMatch(/^https:\/\/(ec\.jpyc-service\.com|www\.google\.com)\//);
  }));
  test("opening a room's shop with the room's own product ids shows those products only", () => withWorld({ fetchImpl: async () => jres(200, answer("otameshi", [prod("a"), prod("b"), prod("c")])) }, async (w) => {
    expect(w.jpyc.open({ shopSlug: "otameshi", productIds: ["c", "a"] })).toBe(true); await flush();
    expect(w.all(".kj-product").map((n) => n.dataset.id).sort()).toEqual(["a", "c"]);
  }));
});

describe("the states of a shop", () => {
  test("loading: a skeleton and a polite announcement while the request is out; then the products and a count", () => withWorld({ fetchImpl: () => new Promise((res) => { globalThis.__release = () => res(jres(200, DEMO_ANSWER())); }) }, async (w) => {
    w.jpyc.open("jpyc-demo");
    expect(w.root().dataset.phase).toBe("loading"); expect(w.all(".kj-skel").length).toBe(3); expect(w.q(".kj-products").getAttribute("aria-hidden")).toBe("true");
    await Bun.sleep(40); expect(w.q('[data-f="live"]').textContent).toBe("商品を読み込んでいます…");
    globalThis.__release(); await flush(); await Bun.sleep(40);
    expect(w.root().dataset.phase).toBe("ok"); expect(w.all(".kj-skel").length).toBe(0); expect(w.q('[data-f="live"]').textContent).toBe("1件の商品を表示しました");
    delete globalThis.__release;
  }));
  test("empty: no products to show, with where to look; no retry button", () => withWorld({ fetchImpl: async () => jres(200, answer("otameshi", [])) }, async (w) => {
    await openDemoShop(w);
    expect(w.root().dataset.phase).toBe("empty"); expect(w.text()).toContain("いま表示できる商品はありません。"); expect(w.text()).toContain("JPYC ECのお店のページで確認できます。");
    expect(w.q('[data-act="retry"]')).toBeNull(); expect(w.q('.kj-shophead a[href="https://ec.jpyc-service.com/shops/otameshi"]')).not.toBeNull();
  }));
  for (const [name, status, body, phase, words] of [
    ["error (a 502 from the proxy)", 502, { ok: false, error: "unavailable" }, "error", "商品を読み込めませんでした。"],
    ["error (a 500)", 500, "<html>oops</html>", "error", "商品を読み込めませんでした。"],
    ["busy (a 503: JPYC EC or the proxy is resting)", 503, { ok: false, error: "busy" }, "busy", "JPYC ECが混み合っています。"],
    ["gone (a 404: the shop is not there)", 404, { ok: false, error: "not_found" }, "gone", "このお店は見つかりませんでした。"],
    ["error (not JSON)", 200, "{ nope", "error", "商品を読み込めませんでした。"],
    ["error (JSON of another shape)", 200, { hello: "world" }, "error", "商品を読み込めませんでした。"],
    ["error (the answer is for another shop)", 200, answer("someone-else", [prod("a")], { is_demo: true }), "error", "商品を読み込めませんでした。"],
    ["mismatch (a demo entry whose shop is not a demo)", 200, answer("otameshi", [prod("a")], { is_demo: false }), "mismatch", "このお店の情報を表示できません。"],
    ["mismatch (the proxy refused: 502 with error mismatch)", 502, { ok: false, error: "mismatch", message: "x" }, "mismatch", "このお店の情報を表示できません。"],
    ["gone (a 404 that is not JSON)", 404, "<html>not found</html>", "gone", "このお店は見つかりませんでした。"],
    ["busy (a 503 that is not JSON)", 503, "<html>try later</html>", "busy", "JPYC ECが混み合っています。"],
    ["error (a 504 timeout from the proxy)", 504, { ok: false, error: "timeout" }, "error", "商品を読み込めませんでした。"],
  ]) {
    test(`${name}: says so in words, with no technical text; a retry button where a retry can help`, () => withWorld({ fetchImpl: async () => jres(status, body) }, async (w) => {
      await openDemoShop(w);
      expect(w.root().dataset.phase).toBe(phase); expect(w.text()).toContain(words); expect(w.all(".kj-product").length).toBe(0);
      expect(w.text()).not.toMatch(/undefined|null|\[object|Error|\bnot_found\b|unavailable|oops|hello/);
      expect(!!w.q('[data-act="retry"]')).toBe(phase !== "gone" && phase !== "mismatch");
      expect(w.q('.kj-shophead a[href="https://ec.jpyc-service.com/shops/otameshi"]')).not.toBeNull();   // (the shop's own page is still one tap away)
      await Bun.sleep(45); expect(w.q('[data-f="live"]').textContent).toBe(words);   // (a screen reader hears it)
    }));
  }
  test("a network failure is an error", () => withWorld({ fetchImpl: async () => { throw new TypeError("Failed to fetch"); } }, async (w) => {
    await openDemoShop(w); expect(w.root().dataset.phase).toBe("error");
  }));
  test("the deadline covers the answer's body: a proxy that sends its headers and then stalls ends in the error state, whether the stalled read honours the abort or not", async () => {
    await withWorld({ timeoutMs: 40, fetchImpl: async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) }) }, async (w) => {   // (a fetch stand-in whose body never arrives and ignores abort)
      w.jpyc.open("jpyc-demo"); expect(w.root().dataset.phase).toBe("loading");
      await Bun.sleep(120); expect(w.root().dataset.phase).toBe("error"); expect(w.q('[data-act="retry"]')).not.toBeNull();   // (and the retry button is there)
    });
    await withWorld({ timeoutMs: 40, fetchImpl: async (url, init) => ({ ok: true, status: 200, json: () => new Promise((_, rej) => { init.signal.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError"))); }) }) }, async (w) => {
      w.jpyc.open("jpyc-demo"); await Bun.sleep(120); expect(w.root().dataset.phase).toBe("error");
    });
    await withWorld({ timeoutMs: 40, fetchImpl: async () => ({ ok: false, status: 502, json: () => new Promise(() => {}) }) }, async (w) => {   // (a refusal whose body stalls: an error, not a hang)
      w.jpyc.open("jpyc-demo"); await Bun.sleep(120); expect(w.root().dataset.phase).toBe("error");
    });
  });
  test("a request that never answers is cut at the timeout (and aborted) and is an error too", () => withWorld({ timeoutMs: 40, fetchImpl: (url, init) => new Promise((_, rej) => { init.signal.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError"))); }) }, async (w) => {
    w.jpyc.open("jpyc-demo"); expect(w.root().dataset.phase).toBe("loading");
    await Bun.sleep(120); expect(w.root().dataset.phase).toBe("error"); expect(w.calls[0].init.signal.aborted).toBe(true);
  }));
  test("retry asks again and shows the products when the platform is back; the focus stays in the sheet", async () => {
    let up = false;
    await withWorld({ fetchImpl: async () => (up ? jres(200, DEMO_ANSWER()) : jres(502, { ok: false })) }, async (w) => {
      await openDemoShop(w); expect(w.root().dataset.phase).toBe("error");
      up = true; w.click(w.q('[data-act="retry"]')); await flush();
      expect(w.root().dataset.phase).toBe("ok"); expect(w.calls.length).toBe(2); expect(w.all(".kj-product").length).toBe(1);
      expect(w.root().contains(w.dom.document.activeElement)).toBe(true);
    });
  });
  test("offline: no request is made; the sheet says so, and reloads by itself when the connection returns", () => withWorld({ online: false }, async (w) => {
    await openDemoShop(w);
    expect(w.calls.length).toBe(0); expect(w.root().dataset.phase).toBe("offline"); expect(w.text()).toContain("オフラインです。"); expect(w.text()).toContain("接続が戻ると、自動で読み込み直します。");
    w.nav.onLine = true; w.dom.fire(w.dom.window, "online"); await flush();
    expect(w.calls.length).toBe(1); expect(w.root().dataset.phase).toBe("ok");
  }));
  test("a fetch that fails while the browser says it is offline is the offline state, not a generic error", () => withWorld({ fetchImpl: async () => { throw new TypeError("Failed to fetch"); } }, async (w) => {
    w.jpyc.open("jpyc-demo"); w.nav.onLine = false; await flush();   // (the connection drops while the request is out)
    expect(w.root().dataset.phase).toBe("offline");
  }));
  test("an old copy (the proxy says stale) is shown with the time it is from, in Japan time", () => withWorld({ fetchImpl: async () => jres(200, { ...DEMO_ANSWER(), stale: true, fetched_at: "2026-10-06T06:00:00.000Z" }) }, async (w) => {
    await openDemoShop(w);
    expect(w.q(".kj-stale").textContent).toBe("最新でない可能性があります（15:00時点）"); expect(w.all(".kj-product").length).toBe(1);
  }));
  test("an answer the proxy called stale stays marked when the sheet is opened again, and a failed refresh labels the old copy with the time of the DATA, not of the failed try", async () => {
    let n = 0;
    await withWorld({ fetchImpl: async () => (++n === 1 ? jres(200, { ...DEMO_ANSWER(), stale: true, fetched_at: "2026-10-05T03:00:00.000Z" }) : jres(502, { ok: false })) }, async (w) => {
      await openDemoShop(w); expect(w.q(".kj-stale").textContent).toBe("最新でない可能性があります（12:00時点）");
      w.jpyc.close();
      w.jpyc.open("jpyc-demo");   // (before the second request has answered: the copy is on screen and still marked, with the proxy's time)
      expect(w.q(".kj-stale").textContent).toBe("最新でない可能性があります（12:00時点）");
      await flush();
      expect(w.q(".kj-stale").textContent).toBe("最新でない可能性があります（12:00時点）");   // (the refresh failed: still the data's time, not 'now')
    });
    n = 1;
    await withWorld({ fetchImpl: async () => (++n === 2 ? jres(200, { ...DEMO_ANSWER(), stale: false, fetched_at: "2026-10-06T06:00:00.000Z" }) : jres(502, { ok: false })) }, async (w) => {
      await openDemoShop(w); expect(w.q(".kj-stale")).toBeNull();   // (a fresh answer: no mark)
      w.jpyc.close(); w.jpyc.open("jpyc-demo"); await flush();
      expect(w.q(".kj-stale").textContent).toBe("最新でない可能性があります（15:00時点）");   // (the refresh failed: the copy is from 15:00 JST)
    });
  });
  test("opened again soon after, the last good products are on screen at once; if the refresh fails they stay, marked as old", async () => {
    let n = 0;
    await withWorld({ fetchImpl: async () => (++n === 1 ? jres(200, DEMO_ANSWER()) : jres(502, { ok: false })) }, async (w) => {
      await openDemoShop(w); w.jpyc.close();
      w.jpyc.open("jpyc-demo");
      expect(w.root().dataset.phase).toBe("ok"); expect(w.all(".kj-product").length).toBe(1);   // (before the second request has answered)
      await flush();
      expect(w.root().dataset.phase).toBe("ok"); expect(w.q(".kj-stale")).not.toBeNull(); expect(w.calls.length).toBe(2);
    });
  });
  test("switching to the list while a request is out forgets it (no late answer paints over the list)", () => withWorld({ fetchImpl: () => new Promise((res) => { globalThis.__late = () => res(jres(200, DEMO_ANSWER())); }) }, async (w) => {
    w.jpyc.openList(); w.click(w.q('[data-act="shop"]')); w.click(w.q('[data-act="back"]'));
    expect(w.root().dataset.screen).toBe("list");
    globalThis.__late(); await flush();
    expect(w.root().dataset.screen).toBe("list"); expect(w.all(".kj-product").length).toBe(0); delete globalThis.__late;
  }));
});

describe("the entry points: ctx.services.jpyc", () => {
  test("open(id), open(shopSlug) and open({ shopSlug, productIds }) reach the same shop; an unknown or hidden one is false and builds nothing", () => withWorld({ data: file(DEMO, CAFE, PENDING) }, async (w) => {
    expect(w.jpyc.has("jpyc-demo") && w.jpyc.has("otameshi") && w.jpyc.has({ shopSlug: "otameshi" }) && w.jpyc.has("k-port") && w.jpyc.has("k-port-shop")).toBe(true);
    expect(w.jpyc.has("pending") || w.jpyc.has("mambo-shop") || w.jpyc.has("nobody") || w.jpyc.has(null) || w.jpyc.has(undefined)).toBe(false);   // (no consent record: not for sale)
    expect(w.jpyc.open("nobody")).toBe(false); expect(w.jpyc.open("pending")).toBe(false); expect(w.root()).toBeNull();
    expect(w.jpyc.entry("otameshi")).toMatchObject({ id: "jpyc-demo", shopSlug: "otameshi", kind: "demo", x: 5, z: 40 });
    expect(JSON.stringify(w.jpyc.entries())).not.toMatch(/consent|owner/);   // (what other modules get is the entry, not the paperwork)
    for (const ref of ["jpyc-demo", "otameshi", { shopSlug: "otameshi" }, { id: "jpyc-demo", productIds: [DEMO_ID] }]) { expect(w.jpyc.open(ref)).toBe(true); expect(w.q("#kj-title").textContent).toBe("JPYC EC デモショップ"); w.jpyc.close(); }
  }));
  test("opened from a room (open(ref)): there is no list to go back to, so no back arrow, and Esc closes; opened from the list: the arrow is there", () => withWorld({}, async (w) => {
    w.jpyc.open("jpyc-demo", { opener: w.openBtn }); await flush();
    expect(w.q('[data-act="back"]').hidden).toBe(true);
    w.key("Escape"); expect(w.jpyc.isOpen).toBe(false);
    await openDemoShop(w);
    expect(w.q('[data-act="back"]').hidden).toBe(false);
  }));
  test("the splat-interiors lane's 「JPYCで買う」 button, exactly as it calls (branch feat/splat-interiors, splat-interior.js): the room's own id (not an entry id), the registry's shop slug and product ids, { opener }; it shows the button only when enabled !== false and has(ref)", () => {
    const refOf = (room) => ({ id: room.id, shopSlug: room.jpyc?.shopSlug, productIds: room.jpyc?.productIds });
    const room = { id: "demo-cafe", jpyc: { shopSlug: "k-port-shop", productIds: ["m2"] } };
    const reply = async () => jres(200, answer("k-port-shop", [prod("m1"), prod("m2"), prod("m3")]));
    const canBuy = (j) => !!j?.open && j.enabled !== false && (typeof j.has !== "function" || !!j.has(refOf(room)));
    return (async () => {   // (one world at a time: each one swaps the page's globals and puts them back)
      await withWorld({ data: file(DEMO, CAFE), fetchImpl: reply }, async (w) => {
        expect(canBuy(w.jpyc)).toBe(true);
        expect(w.jpyc.open(refOf(room), { opener: w.openBtn })).toBe(true); await flush();
        expect(w.q("#kj-title").textContent).toBe("K-port");                                            // (the entry's Japanese name)
        expect(w.all(".kj-product").map((li) => li.getAttribute("data-id"))).toEqual(["m2"]);          // (narrowed to the room's own product)
        expect(w.q('[data-act="back"]').hidden).toBe(true);                                             // (from a room there is no list to go back to)
        w.key("Escape"); expect(w.jpyc.isOpen).toBe(false);
      });
      await withWorld({ data: file(DEMO, CAFE), search: "?src=chirashi" }, (w) => { expect([canBuy(w.jpyc), w.jpyc.open(refOf(room))]).toEqual([false, false]); });                        // the flyer's kids: the button stays hidden
      await withWorld({ data: file({ ...DEMO, enabled: false }, CAFE), fetchImpl: reply }, (w) => { expect(canBuy(w.jpyc)).toBe(true); });                                                     // another shop is on: this room's is
      await withWorld({ data: file({ ...DEMO, enabled: false }, { ...CAFE, consent: null }) }, (w) => { expect([canBuy(w.jpyc), w.jpyc.open(refOf(room)), w.jpyc.enabled]).toEqual([false, false, false]); });   // nothing switched on: no button
      await withWorld({ data: null }, (w) => { expect([canBuy(w.jpyc), w.jpyc.open(refOf(room))]).toEqual([false, false]); });                                                                  // the shipped file: no button
    })();
  });
  test("mapsUrl(ref): the Google Maps search link of a shop (the same link the splat-interiors shop cards use); the demo has none", () => withWorld({ data: file(DEMO, CAFE) }, (w) => {
    expect(w.jpyc.mapsUrl("k-port")).toBe(googleMapsUrl("K-port 気仙沼市 魚町")); expect(w.jpyc.mapsUrl("k-port-shop")).toBe(w.jpyc.mapsUrl("k-port"));
    expect(w.jpyc.mapsUrl("jpyc-demo")).toBeNull(); expect(w.jpyc.mapsUrl("nobody")).toBeNull();
  }));
  test("the shop screen of a Kesennuma shop carries the maps link and the shop's own badge", () => withWorld({ data: file(CAFE), fetchImpl: async () => jres(200, answer("k-port-shop", [prod("m1")], { name: "K-port オンラインストア" })) }, async (w) => {
    w.jpyc.open("k-port"); await flush();
    expect(w.q('.kj-shophead [data-kind="kesennuma"]')).not.toBeNull(); expect(w.q(".kj-shophead .kj-maps").getAttribute("href")).toBe(googleMapsUrl("K-port 気仙沼市 魚町"));
    expect(w.text()).toContain("JPYC EC上のお店の名前: K-port オンラインストア");
    expect(w.calls[0].url).toBe("/api/jpyc/shops/k-port-shop/products"); expect(w.q("a.kj-buy").getAttribute("href")).toBe("https://ec.jpyc-service.com/shops/k-port-shop/products/m1");
  }));
});

describe("the keyboard", () => {
  test("Esc steps back from a shop to the list (focus on the shop's card), then closes; the HUD does not see the key", () => withWorld({}, async (w) => {
    let seen = 0; w.dom.window.addEventListener("keydown", () => { seen++; }, true);   // (a listener registered after the panel's, like the HUD's)
    await openDemoShop(w);
    const e1 = w.key("Escape"); expect(e1.defaultPrevented).toBe(true);
    expect(w.root().dataset.screen).toBe("list"); expect(w.jpyc.isOpen).toBe(true); expect(w.dom.document.activeElement).toBe(w.q('[data-act="shop"][data-id="jpyc-demo"]'));
    w.key("Escape"); expect(w.jpyc.isOpen).toBe(false);
    expect(seen).toBe(0);
  }));
  test("while it is open the town's keys (WASD, F, H, M, digits, T, P, B) do not reach anything else; after it closes they do", () => withWorld({}, (w) => {
    let seen = []; w.dom.window.addEventListener("keydown", (e) => seen.push(e.code), true);
    w.jpyc.openList();
    for (const k of ["w", "a", "s", "d", "f", "h", "m", "t", "p", "b", "1", "ArrowUp", " ", "Enter"]) w.key(k);
    expect(seen).toEqual([]);
    w.jpyc.close(); w.key("w"); expect(seen).toEqual(["KeyW"]);
  }));
  test("Tab and Shift+Tab stay inside the sheet: from the last control to the first and back; from outside, to the first", () => withWorld({}, async (w) => {
    await openDemoShop(w);
    const list = focusables(w.q(".kj-sheet"));
    expect(list.length).toBeGreaterThan(5);
    expect(list[0].getAttribute("data-act")).toBe("back");   // (header first: back, language, close, then the body's links)
    const last = list[list.length - 1], first = list[0];
    last.focus(); let e = w.key("Tab"); expect([e.defaultPrevented, w.dom.document.activeElement]).toEqual([true, first]);
    first.focus(); e = w.key("Tab", { shiftKey: true }); expect([e.defaultPrevented, w.dom.document.activeElement]).toEqual([true, last]);
    w.openBtn.focus(); e = w.key("Tab"); expect(w.dom.document.activeElement).toBe(first);   // (focus had escaped to the page behind: it is brought back)
    list[1].focus(); e = w.key("Tab"); expect(e.defaultPrevented).toBe(false);   // (inside the loop the browser moves it)
  }));
  test("nextFocus: edges wrap, outside goes to an end, nothing to focus does not throw", () => {
    const a = { n: "a" }, b = { n: "b" }, c = { n: "c" };
    expect(nextFocus([a, b, c], c, false)).toBe(a); expect(nextFocus([a, b, c], a, true)).toBe(c); expect(nextFocus([a, b, c], b, false)).toBeNull(); expect(nextFocus([a, b, c], null, false)).toBe(a); expect(nextFocus([a, b, c], null, true)).toBe(c); expect(nextFocus([], a, false)).toBeNull();
  });
  test("closing with a pointer leaves no focus behind (the game's Space would press the button the sheet came from); closing with Esc or from code puts it back", () => withWorld({}, (w) => {
    w.jpyc.openList({ opener: w.openBtn }); w.click(w.q('button[data-act="close"]'), { pointer: true });
    expect(w.dom.document.activeElement).not.toBe(w.openBtn);
    w.jpyc.openList({ opener: w.openBtn }); w.click(w.q('button[data-act="close"]'), { pointer: false });   // (Enter or Space on the ✕)
    expect(w.dom.document.activeElement).toBe(w.openBtn);
    w.jpyc.openList({ opener: w.openBtn }); w.click(w.q(".kj-scrim"), { pointer: true });
    expect(w.dom.document.activeElement).not.toBe(w.openBtn);
    w.jpyc.openList({ opener: w.openBtn }); w.key("Escape"); expect(w.dom.document.activeElement).toBe(w.openBtn);
    w.jpyc.openList({ opener: w.openBtn }); w.jpyc.close(); expect(w.dom.document.activeElement).toBe(w.openBtn);
  }));
  test("a keyboard user's place survives the rebuild when the answer lands, and falls back to the body when the control is gone", () => withWorld({ fetchImpl: () => new Promise((res) => { globalThis.__answer = () => res(jres(200, DEMO_ANSWER())); }) }, async (w) => {
    w.jpyc.open("jpyc-demo");   // (loading: the head's links are there, the products are not)
    const link = w.all("a.kj-link").find((a) => a.getAttribute("href") === "https://ec.jpyc-service.com/shops/otameshi"); link.focus();
    expect(w.dom.document.activeElement).toBe(link);
    globalThis.__answer(); await flush();
    const now = w.dom.document.activeElement;
    expect(now).not.toBe(link); expect(now.isConnected).toBe(true); expect(now.getAttribute("href")).toBe("https://ec.jpyc-service.com/shops/otameshi");   // (the same link, in the rebuilt body)
    // a control that does not exist after the rebuild: focus goes to the body, never to the page behind
    w.q('[data-f="body"]').focus(); delete globalThis.__answer;
    const skel = w.q('[data-f="body"]'); expect(w.dom.document.activeElement).toBe(skel);
  }));
  test("every control is a real button or link (no div with a click handler), with a name: the back arrow, ✕, the language, a shop, retry, buy", () => withWorld({ fetchImpl: async () => jres(502, {}) }, async (w) => {
    await openDemoShop(w);
    for (const c of focusables(w.q(".kj-sheet"))) { expect(["BUTTON", "A"]).toContain(c.tagName); expect((c.getAttribute("aria-label") || c.textContent || "").trim().length).toBeGreaterThan(0); }
    for (const a of w.all("a[href]")) { expect(a.getAttribute("target")).toBe("_blank"); expect(a.getAttribute("rel")).toBe("noopener noreferrer"); }
    for (const b of w.all("button")) expect(b.getAttribute("type")).toBe("button");
  }));
});

describe("THE SWITCH at the panel: production shows nothing until an entry of data/shops/jpyc.json is on", () => {
  test("PRODUCTION DEFAULT: mounted on the shipped file (the bundled import, the demo switched off) the panel is disabled: nothing to open, nothing built, no request, no key handler", () => withWorld({ data: null }, (w) => {
    expect([w.jpyc.enabled, w.jpyc.kids, w.jpyc.mode]).toEqual([false, false, "normal"]);
    expect(w.jpyc.entries()).toEqual([]); expect(w.jpyc.has("jpyc-demo")).toBe(false); expect(w.jpyc.has("otameshi")).toBe(false);
    expect([w.jpyc.openList(), w.jpyc.open("jpyc-demo"), w.jpyc.open({ shopSlug: "otameshi", productIds: ["x"] })]).toEqual([false, false, false]);
    expect(w.root()).toBeNull(); expect(w.dom.document.getElementById("klc-jpyc-css")).toBeNull(); expect(w.dom.document.getElementById("klc-jpyc-btn-css")).toBeNull();
    expect(w.calls.length).toBe(0); expect(w.windowListeners.length).toBe(0); expect(w.pad.calls.length).toBe(0);
    expect(SHIPPED.entries.map((e) => [e.kind, e.enabled])).toEqual([["demo", false]]);   // (and that is what the import above was)
  }));
  test("the file's one flag flipped: the same mount is enabled, offers the demo, and labels it デモ（実際の店舗ではありません）", () => {
    const on = { ...SHIPPED, entries: SHIPPED.entries.map((e) => ({ ...e, enabled: true })) };
    return withWorld({ data: on }, (w) => {
      expect([w.jpyc.enabled, w.jpyc.entries().map((e) => [e.id, e.off])]).toEqual([true, [["jpyc-demo", false]]]);
      expect(w.jpyc.openList()).toBe(true); expect(w.q('[data-id="jpyc-demo"]').textContent).toContain("デモ（実際の店舗ではありません）"); expect(w.q('[data-id="jpyc-demo"]').textContent).not.toContain("【開発用】");
    });
  });
  test("the three ways an entry is on: a demo with enabled: true; a Kesennuma shop with its consent record; neither alone for the other kind", async () => {
    const flagOnly = { ...PENDING, id: "flag-only", shopSlug: "flag-shop", enabled: true }, parked = { ...CAFE, id: "parked", shopSlug: "parked-shop", enabled: false };
    await withWorld({ data: file({ ...DEMO, enabled: false }, flagOnly, parked) }, (w) => { expect(w.jpyc.enabled).toBe(false); });   // (a switched-off demo, a real shop with the flag but no consent, a consenting shop that is parked: nothing)
    await withWorld({ data: file({ ...DEMO, enabled: false }, CAFE) }, (w) => { expect(w.jpyc.entries().map((e) => e.id)).toEqual(["k-port"]); });   // (a consenting real shop is on by itself)
    await withWorld({ data: file(DEMO) }, (w) => { expect(w.jpyc.entries().map((e) => e.id)).toEqual(["jpyc-demo"]); });   // (a demo with the flag)
    await withWorld({ data: file({ ...DEMO, enabled: undefined }) }, (w) => { expect(w.jpyc.enabled).toBe(false); });   // (a demo without the key is damaged: off)
  });
  test("?jpyc=dev only counts on a dev host: on the production host (or an unknown one) the switch holds", async () => {
    const data = file({ ...DEMO, enabled: false }, PENDING);
    for (const hostname of [PROD_HOST, "klc.test", "localhost.evil.com", "10.0.0.5"]) await withWorld({ search: "?jpyc=dev", hostname, data }, (w) => { expect([hostname, w.jpyc.enabled, w.jpyc.mode]).toEqual([hostname, false, "normal"]); });
    await withWorld({ search: "?jpyc=dev", hostname: "127.0.0.1", data }, (w) => { expect([w.jpyc.enabled, w.jpyc.mode, w.jpyc.entries().length]).toEqual([true, "dev", 2]); });
  });
  test("the flyer's kids still come first: a dev preview under ?src=chirashi shows nothing", () => withWorld({ search: "?src=chirashi&jpyc=dev", hostname: DEV, data: file({ ...DEMO, enabled: false }) }, (w) => { expect([w.jpyc.enabled, w.jpyc.kids]).toEqual([false, true]); }));
});

describe("the flyer's kids gate, ?jpyc=, and the consent gate", () => {
  test("?src=chirashi: not enabled, nothing opens, nothing is built, no request; the service still exists with the same shape", () => withWorld({ search: "?src=chirashi" }, async (w) => {
    expect(w.jpyc.enabled).toBe(false); expect(w.jpyc.kids).toBe(true);
    expect([w.jpyc.open("jpyc-demo"), w.jpyc.open("otameshi"), w.jpyc.openList(), w.jpyc.has("jpyc-demo"), w.jpyc.mapsUrl("jpyc-demo")]).toEqual([false, false, false, false, null]);
    expect(w.jpyc.entries()).toEqual([]); expect(w.ctx.services.jpyc).toBe(w.jpyc);
    expect(w.root()).toBeNull(); expect(w.dom.document.getElementById("klc-jpyc-css")).toBeNull(); expect(w.dom.document.getElementById("klc-jpyc-btn-css")).toBeNull(); expect(w.calls.length).toBe(0);
    expect(w.windowListeners.length).toBe(0);   // (no key handler either)
    w.key("Escape");
  }));
  test("the flyer source is remembered for the browser session: a reload or another page without the parameter stays hidden; ?src=chirashi-2 counts; another source does not", () => {
    const sess = { v: {}, get(k) { return this.v[k] ?? null; }, set(k, v) { this.v[k] = v; } };
    const a = world({ search: "?src=chirashi", session: sess }); try { expect(a.jpyc.enabled).toBe(false); expect(sess.v["klc.src"]).toBe("chirashi"); } finally { a.cleanup(); }
    const b = world({ search: "", session: sess }); try { expect(b.jpyc.enabled).toBe(false); expect(b.jpyc.kids).toBe(true); } finally { b.cleanup(); }
    const c = world({ search: "?src=chirashi-oct" }); try { expect(c.jpyc.enabled).toBe(false); } finally { c.cleanup(); }
    const d = world({ search: "?src=Chirashi" }); try { expect(d.jpyc.enabled).toBe(false); } finally { d.cleanup(); }
    const e = world({ search: "?src=twitter" }); try { expect(e.jpyc.enabled).toBe(true); } finally { e.cleanup(); }
    const f = world({ search: "", session: { v: {}, get() { return null; }, set() {} } }); try { expect(f.jpyc.enabled).toBe(true); } finally { f.cleanup(); }
  });
  test("?jpyc=off hides it for the visit; ?jpyc=dev (on a dev host) adds the entries that wait for their consent record or are switched off, labelled as such", () => {
    const off = world({ search: "?jpyc=off" }); try { expect(off.jpyc.enabled).toBe(false); expect(off.jpyc.kids).toBe(false); } finally { off.cleanup(); }
    const norm = world({ data: file(DEMO, CAFE, PENDING) }); try { expect(norm.jpyc.entries().map((e) => e.id)).toEqual(["jpyc-demo", "k-port"]); } finally { norm.cleanup(); }
    const dev = world({ search: "?jpyc=dev", hostname: DEV, data: file({ ...DEMO, enabled: false }, CAFE, PENDING) });
    try {
      expect(dev.jpyc.mode).toBe("dev"); expect(dev.jpyc.entries().map((e) => [e.id, e.pending, e.off])).toEqual([["jpyc-demo", false, true], ["k-port", false, false], ["pending", true, false]]);
      dev.jpyc.openList();
      expect(dev.q('[data-id="pending"]').textContent).toContain("【開発用】同意の記録がないため、本番では表示されません");
      expect(dev.q('[data-id="jpyc-demo"]').textContent).toContain("デモ（実際の店舗ではありません）"); expect(dev.q('[data-id="jpyc-demo"]').textContent).toContain("【開発用】スイッチがオフのため、本番では表示されません");   // (a demo, and switched off: both said)
      expect(dev.q('[data-id="k-port"]').textContent).not.toContain("【開発用】");
      expect(dev.q('[data-id="pending"]').closest(".kj-shopcard").querySelector(".kj-maps")).not.toBeNull();
    } finally { dev.cleanup(); }
    const en = world({ search: "?jpyc=dev", hostname: DEV, lang: "en", data: file({ ...DEMO, enabled: false }) });
    try { en.jpyc.openList(); expect(en.q('[data-id="jpyc-demo"]').textContent).toContain("[dev] Switched off in the data file: not shown in production"); } finally { en.cleanup(); }
  });
  test("only the demo and consented shops reach a visitor: a damaged or half-filled entry is skipped, never thrown over", () => {
    const bad = [{ ...CAFE, id: "BAD ID" }, { ...CAFE, id: "x2", shopSlug: "../x" }, { ...CAFE, id: "x3", consent: { owner: "", date: "2026-10-05", scope: ["jpyc-listing"] } }, { ...CAFE, id: "x4", consent: { owner: "o", date: "2026-02-30", scope: ["jpyc-listing"] } }, null, 5, { ...CAFE, id: "x5", x: "far" }];
    const w = world({ data: { entries: [DEMO, ...bad, CAFE] } });
    try { expect(w.jpyc.entries().map((e) => e.id)).toEqual(["jpyc-demo", "k-port"]); } finally { w.cleanup(); }
    for (const dataset of [{}, { entries: "x" }, { entries: [] }, { entries: [null, 5] }]) { const x = world({ data: dataset }); try { expect(x.jpyc.enabled).toBe(false); expect(x.jpyc.openList()).toBe(false); } finally { x.cleanup(); } }
  });
  test("no entries: the same disabled service (the HUD draws no menu item and the data file is its own kill switch)", () => withWorld({ data: file() }, (w) => { expect(w.jpyc.enabled).toBe(false); expect(w.jpyc.kids).toBe(false); }));
});

describe("alcohol in the panel: 20+ and only when the shop's row declares the licence and the age check", () => {
  const DECL = { mailOrderLicence: "通信販売酒類小売業免許", ageCheck: "注文時に生年月日を確認し、お届け時に身分証で確認", confirmed: "2026-10-05" };
  const tea = { id: "tea-1", slug: null, name: "お茶 煎茶 100g", price_jpyc: "800", price_varies: false, image_url: null, stock: 9, online_sale_status: "on_sale", online_purchase_available: true, alcohol: false };
  const beer = { ...tea, id: "beer-1", name: "クラフトビール3本セット", price_jpyc: "3000", alcohol: true };
  const reply = () => ({ ok: true, shop: filterShop({ ...LIST.data.shop, slug: "k-port-shop", is_demo: false }, "k-port-shop"), products: [tea, beer], fetched_at: "2026-10-06T06:00:00.000Z", age_s: 0, stale: false });
  const fetchImpl = async () => jres(200, reply());
  const openCafe = async (w) => { expect(w.jpyc.open("k-port")).toBe(true); await flush(); };
  test("declared: the beer carries 「酒類（20歳以上）」, the shop screen says alcohol is not sold under 20, the tea carries neither (and the English words say the same)", async () => {
    await withWorld({ data: file({ ...CAFE, alcohol: DECL }), fetchImpl }, async (w) => {
      await openCafe(w);
      expect(w.all(".kj-product").map((li) => [li.getAttribute("data-id"), li.getAttribute("data-alcohol")])).toEqual([["tea-1", null], ["beer-1", "1"]]);
      expect(w.q('.kj-product[data-id="beer-1"] .kj-badge[data-kind="alcohol"]').textContent).toBe("酒類（20歳以上）"); expect(w.q('.kj-product[data-id="tea-1"] .kj-badge')).toBeNull();
      const note = w.q(".kj-alcohol"); expect(note.getAttribute("role")).toBe("note"); expect(note.textContent).toBe("お酒は20歳未満の方には販売できません（保護者の同意があっても購入できません）。購入のときに、お店が年齢確認を行います。");
      expect(w.jpyc.entry("k-port")).toMatchObject({ alcoholOk: true }); expect(JSON.stringify(w.jpyc.entry("k-port"))).not.toMatch(/酒類小売業|生年月日/);
      w.click(w.q('[data-act="lang"]')); expect(w.q(".kj-alcohol").textContent).toBe("Alcohol is not sold to anyone under 20, even with a parent or guardian's consent. The shop checks your age when you buy."); expect(w.q('.kj-product[data-id="beer-1"] .kj-badge').textContent).toBe("Alcohol (20 and over)");
      expect(w.q('.kj-product[data-id="beer-1"] .kj-buy')).not.toBeNull();   // (declared: it can be bought on JPYC EC, where the shop checks the age)
    });
  });
  test("not declared (or half declared): a product the proxy marked as alcohol is not drawn, there is no note, and the rest of the shop is as usual", async () => {
    for (const data of [file(CAFE), file({ ...CAFE, alcohol: null })]) {
      await withWorld({ data, fetchImpl }, async (w) => {
        await openCafe(w);
        expect(w.all(".kj-product").map((li) => li.getAttribute("data-id"))).toEqual(["tea-1"]); expect(w.q(".kj-alcohol")).toBeNull(); expect(w.text()).not.toContain("ビール"); expect(w.q('.kj-badge[data-kind="alcohol"]')).toBeNull();
        expect(w.jpyc.entry("k-port").alcoholOk).toBe(false);
      });
    }
  });
  test("a shop with no alcohol shows no note and no badge, declared or not (the demo shop included)", async () => {
    await withWorld({ data: file({ ...CAFE, alcohol: DECL }), fetchImpl: async () => jres(200, { ...reply(), products: [tea] }) }, async (w) => { await openCafe(w); expect(w.q(".kj-alcohol")).toBeNull(); expect(w.q(".kj-badge[data-kind=alcohol]")).toBeNull(); });
    await withWorld({}, async (w) => { await openDemoShop(w); expect(w.q(".kj-alcohol")).toBeNull(); expect(w.all(".kj-product").length).toBe(1); });
  });
  test("a room that narrows to one product (the splat lane's productIds) cannot narrow its way to a held one: only what the proxy let through can be shown", async () => {
    await withWorld({ data: file(CAFE), fetchImpl }, async (w) => {
      expect(w.jpyc.open({ shopSlug: "k-port-shop", productIds: ["beer-1"] })).toBe(true); await flush();
      expect(w.all(".kj-product").length).toBe(0); expect(w.q(".kj-state")?.getAttribute("data-phase")).toBe("empty");
    });
  });
});

describe("the views are pure and escape everything", () => {
  test("esc()", () => { expect(esc(`<a href="x" onclick='y'>&`)).toBe("&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;"); expect(esc(null)).toBe(""); });
  test("listHtml and shopHtml are strings of HTML from a model and t(): nothing of the model's text is left raw", () => {
    const t = (k, v) => k + (v ? JSON.stringify(v) : "");
    const evil = { id: "e", kind: "demo", ja: "<b>x</b>", en: '"y"', shopSlug: "otameshi" };
    const html = listHtml({ lang: "ja", entries: [evil] }, t);
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;"); expect(html).not.toContain("<b>x</b>");
    const shop = shopHtml({ lang: "en", entry: evil, phase: "ok", data: { shop: { name: "<i>n</i>", available_chains: [137, 5] }, products: [{ id: "p", slug: null, name: "<u>p</u>", price_jpyc: "5", price_varies: false, image_url: null, stock: 1, online_sale_status: "on_sale", online_purchase_available: true }] }, stale: "" }, t);
    expect(shop).not.toMatch(/<(i|u|b)>/); expect(shop).toContain("&lt;i&gt;n&lt;/i&gt;"); expect(shop).toContain("&lt;u&gt;p&lt;/u&gt;");
  });
});

describe("what this panel does not do", () => {
  test("no wallet, signature, payment or storage of a purchase: it reads and links out", () => {
    for (const w of ["ethereum", "eth_request", "signTypedData", "personal_sign", "privateKey", "private_key", "mnemonic", "transferWithAuthorization", "x402", "PAYMENT-SIGNATURE", "/api/v1/checkout", "POST", "localStorage", "indexedDB", "document.cookie"]) expect([w, SRC.includes(w)]).toEqual([w, false]);
    expect(SRC).toContain("credentials: 'omit'");
    expect(SRC).not.toMatch(/fetch\(\s*['"`]https?:/);   // (the only request is to the proxy: a root-relative path or a loopback ?jpycApi=)
  });
  test("no in-app USDC to JPYC swap, bridge or on-ramp: no such code, word or link in the panel, its pure parts or its strings; the guide line links to JPYC EC's own page", () => {
    const LIB = readFileSync(join(ROOT, "src/anime/ui/jpyc-lib.js"), "utf8"), STR = readFileSync(join(ROOT, "data/ui-jpyc-i18n.json"), "utf8");
    for (const w of ["swap", "usdc", "uniswap", "bridge", "1inch", "paraswap", "cowswap", "sushiswap", "on-ramp", "onramp", "moonpay", "transak", "ramp.network"]) {
      for (const [name, text] of [["jpyc-store.js", SRC], ["jpyc-lib.js", LIB], ["ui-jpyc-i18n.json", STR]]) expect([name, w, text.toLowerCase().includes(w)]).toEqual([name, w, false]);
    }
    expect(LIB).toContain("export const GUIDE_URL = EC_ORIGIN + '/blog/how-to-get-jpyc'");
    expect(GUIDE_URL).toBe("https://ec.jpyc-service.com/blog/how-to-get-jpyc");
  });
  test("the panel never edits the files UI lane B2 holds (style.js, touchpad-style.js) and brings its own style", () => {
    expect(SRC).toContain("JPYC_CSS"); expect(SRC).not.toMatch(/import .*style\.js/);
  });
  test("no disaster word in any file this lane writes", () => {
    const WORDS = ["201" + "1", "3." + "11", "tsu" + "nami", "津" + "波", "震" + "災"];
    const files = ["src/anime/ui/jpyc-store.js", "src/anime/ui/jpyc-lib.js", "data/ui-jpyc-i18n.json", "data/shops/jpyc.json", "server/app/jpyc.js", "tools/anime/jpyc-mock-api.mjs", "test/jpyc-store.test.js", "test/jpyc-proxy.test.js", "test/jpyc-server.test.js"];
    for (const f of files) { const text = readFileSync(join(ROOT, f), "utf8").toLowerCase(); for (const w of WORDS) expect([f, w, text.includes(w.toLowerCase())]).toEqual([f, w, false]); }
  });
});

describe("the page's globals", () => {
  test("every world put them back: the same document, location, storage, listeners, timers and navigator this file found (a leak here breaks every test file that runs after it)", () => {
    for (const k of GLOBALS) expect([k, globalThis[k] === BEFORE[k]]).toEqual([k, true]);
  });
});
