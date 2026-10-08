// [jpyc] THE SWITCH in a real Chrome, on two real builds of the app. data/shops/jpyc.json ships the demo shop with "enabled": false, so:
//   build A  the app as it is committed. On a production-like host (klc-prod.test, mapped to 127.0.0.1 by Chrome's --host-resolver-rules, so it is NOT a dev host) there is no ☰ item, no sheet,
//            no JPYC text in the HUD, and not one request to /api/jpyc or to JPYC EC; ?jpyc=dev there changes nothing (it counts on the developer's own machine only).
//   build B  the same app built with the data file's flag flipped (Bun's in-memory `files` override: the tree is never touched) and a consenting test shop whose row declares the mail-order
//            licence and the age check. Same production-like host, no parameter: the ☰ item is there, the list has both shops, the demo says デモ（実際の店舗ではありません）, the test shop's
//            beer carries 「酒類（20歳以上）」 and the age note, and under the flyer's ?src=chirashi nothing of it exists even though it is switched on.
// The platform is the stand-in (tools/anime/jpyc-mock-api.mjs) with the REAL proxy in production mode (dev: false) in front of it; nothing leaves the machine (product photos are answered here).
// Heavy and a browser, so it only runs on request, through the gate (about four town loads; it ends itself after 9 minutes so the machine's one Chrome lock is released):
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS KLC_E2E=1 KLC_E2E_PORT=9425 bun test <absolute path>/test/jpyc-switch.e2e.test.js        (uses ports 9425 to 9428)
// The numbers it measures are printed as one `JPYC-SWITCH-METRICS {json}` line.
import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT } from "../tools/anime/cdp.mjs";
import { buildAndServe, launch, sleep } from "../tools/anime/pad-lib.mjs";
import { startMock, makeProduct } from "../tools/anime/jpyc-mock-api.mjs";

const RUN = process.env.KLC_E2E === "1" && process.env.KLC_GATE === "1";
const PORT = Number(process.env.KLC_E2E_PORT || 9425);
const d = RUN ? describe : describe.skip;
const T = (name, fn) => test(name, fn, 240000);
const PROD_HOST = "klc-prod.test";
const DATA_FILE = resolve(ROOT, "data/shops/jpyc.json");
const M = { build: "jpyc-switch" };
const metric = (k, v) => { M[k] = v; return v; };
const WATCHDOG_MS = 9 * 60 * 1000;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64").toString("base64");
const guard = (page, ms = 90000) => {
  const ev = page.eval;
  page.eval = (expr) => new Promise((res, rej) => {
    const t = setTimeout(() => { console.error("JPYC-SWITCH-METRICS " + JSON.stringify(M)); console.error(`jpyc switch e2e: the page did not answer within ${ms} ms, ending the run so the Chrome lock is released: ${String(expr).slice(0, 160)}`); process.exit(1); }, ms);
    ev(expr).then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
  });
  return page;
};

const SHIPPED = JSON.parse(readFileSync(DATA_FILE, "utf8"));
const DEMO_ON = SHIPPED.entries.map((e) => ({ ...e, enabled: true }));
const DECLARATION = { mailOrderLicence: "e2e only: the licence is on file", ageCheck: "e2e only: the age is checked when the order is placed", confirmed: "2026-10-05" };
const TEST_CAFE = { id: "test-cafe", kind: "kesennuma", ja: "テスト喫茶", en: "Test Cafe", x: 100, z: 100, shopSlug: "test-cafe-shop", productIds: null,
  consent: { owner: "e2e only: a made-up shop", date: "2026-10-05", scope: ["jpyc-listing"], ref: "test/jpyc-switch.e2e.test.js" }, alcohol: DECLARATION, googleMapsQuery: null, googleMapsPlaceId: null };
const FILE_B = { ...SHIPPED, entries: [...DEMO_ON, TEST_CAFE] };

d("THE SWITCH in a real browser: nothing as shipped, the feature when a shop is switched on", () => {
  let browser, srvA, srvB, mockA, mockB, watchdog;
  const asked = { ec: [], maps: [], images: 0 };
  const pages = [];
  beforeAll(async () => {
    watchdog = setTimeout(() => { console.error("JPYC-SWITCH-METRICS " + JSON.stringify(M)); console.error(`jpyc switch e2e: still running after ${WATCHDOG_MS / 60000} minutes: ending so the Chrome lock is released`); process.exit(1); }, WATCHDOG_MS);
    ({ srv: srvA } = await buildAndServe(PORT));                                                                                  // build A: as committed
    ({ srv: srvB } = await buildAndServe(PORT + 2, { files: { [DATA_FILE]: JSON.stringify(FILE_B) } }));                          // build B: the flag flipped, plus the test shop
    mockA = startMock({ port: PORT + 1, proxy: { dev: false } });                                                                 // the proxy with the production rule over the committed file
    mockB = startMock({ port: PORT + 3, entries: FILE_B, proxy: { dev: false },
      shops: [{ slug: "test-cafe-shop", name: "テスト喫茶", is_demo: false, products: [makeProduct({ id: "tea00001", name: "お茶 煎茶 100g", price_jpyc: "800.000000000000000000" }), makeProduct({ id: "beer0002", name: "クラフトビール3本セット", category: "飲料", price_jpyc: "3000.000000000000000000" })] }] });
    browser = await launch({ quiet: true, args: [`--host-resolver-rules=MAP ${PROD_HOST} 127.0.0.1`] });
    browser.on("Fetch.requestPaused", async (p) => {
      const url = p.request.url, reply = (method, args) => Promise.any(pages.map((pg) => pg.S(method, args))).catch(() => {});
      if (/imagedelivery\.net/.test(url)) { asked.images++; await reply("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: "content-type", value: "image/png" }, { name: "access-control-allow-origin", value: "*" }], body: PNG }); }
      else { (/ec\.jpyc-service\.com/.test(url) ? asked.ec : asked.maps).push(url); await reply("Fetch.failRequest", { requestId: p.requestId, errorReason: "BlockedByClient" }); }
    });
  }, 330000);
  afterAll(async () => { clearTimeout(watchdog); console.log("JPYC-SWITCH-METRICS " + JSON.stringify(M)); await browser?.close(); srvA?.stop(); srvB?.stop(); mockA?.stop(); mockB?.stop(); }, 60000);

  /** A fresh page in the town on `base` + `q`, the HUD mounted (the service is published whether or not anything is switched on). */
  async function enter(base, q) {
    const page = guard(await browser.page({ width: 1440, height: 900, dpr: 1 }));
    pages.push(page);
    await page.S("Fetch.enable", { patterns: [{ urlPattern: "*imagedelivery.net*" }, { urlPattern: "*ec.jpyc-service.com*" }, { urlPattern: "*google.com/maps*" }] });
    await page.S("Network.enable"); await page.S("Network.setCacheDisabled", { cacheDisabled: true });
    await page.goto(base + q);
    await page.waitFor("document.body.classList.contains('loaded')", { timeout: 280000 });
    await page.eval("document.getElementById('go').click()");
    await page.waitFor("document.body.classList.contains('playing') && window.__life && window.__life.hud && window.__jpyc", { timeout: 40000 });
    await sleep(1500);
    return page;
  }
  const A = (q = "") => `http://${PROD_HOST}:${PORT}/index.html?q=low&jpycApi=${encodeURIComponent(mockA.url)}${q}`;
  const B = (q = "") => `http://${PROD_HOST}:${PORT + 2}/index.html?q=low&jpycApi=${encodeURIComponent(mockB.url)}${q}`;
  const nothing = (page) => page.eval(`({ host: location.hostname, enabled: window.__jpyc.enabled, kids: window.__jpyc.kids, mode: window.__jpyc.mode, entries: window.__jpyc.entries().length, item: !!document.querySelector('[data-act=jpyc]'), root: !!document.getElementById('klc-jpyc'),
    css: !!document.getElementById('klc-jpyc-css') || !!document.getElementById('klc-jpyc-btn-css'), hud: /jpyc/i.test(document.getElementById('klc-ui').innerHTML), credits: !!document.querySelector('.jpyc-credit'), opened: [window.__jpyc.openList(), window.__jpyc.open('jpyc-demo'), window.__jpyc.open('otameshi')],
    tools: [...document.querySelectorAll('#klc-ui .tools [data-act]')].map((e) => e.dataset.act), api: performance.getEntriesByType('resource').map((r) => r.name).filter((n) => /\\/api\\/jpyc|jpyc-service/.test(n)) })`);

  T("PRODUCTION DEFAULT: the app as committed, on a production-like host with no parameter: no ☰ item, no sheet, no JPYC text, no request to the proxy or to JPYC EC", async () => {
    const page = await enter(A(), "");
    const r = await nothing(page);
    metric("A.default", { ...r, tools: r.tools.join(",") });
    expect(r).toEqual({ host: PROD_HOST, enabled: false, kids: false, mode: "normal", entries: 0, item: false, root: false, css: false, hud: false, credits: false, opened: [false, false, false], tools: expect.any(Array), api: [] });
    expect(r.tools).not.toContain("jpyc"); expect(r.tools).toContain("lang"); expect(r.tools).toContain("hide");   // (the toolbar is the one it was before this feature)
    expect(mockA.state.upstream).toBe(0); expect(mockA.state.requests).toEqual([]);
    expect((await fetch(mockA.url + "/api/jpyc/shops/otameshi/products")).status).toBe(404);   // (and the proxy, with the production rule over the committed file, serves nothing)
    expect(mockA.state.upstream).toBe(0);
    expect(page.errors().filter((e) => !/api\/live/.test(e.text))).toEqual([]);
    await page.goto("about:blank");
  });

  T("?jpyc=dev changes nothing off the developer's own machine: the same production-like host with it is still nothing", async () => {
    const page = await enter(A("&jpyc=dev"), "");
    const r = await nothing(page);
    metric("A.devIgnored", { host: r.host, enabled: r.enabled, mode: r.mode, item: r.item });
    expect(r).toMatchObject({ host: PROD_HOST, enabled: false, mode: "normal", entries: 0, item: false, root: false, hud: false, opened: [false, false, false], api: [] });
    expect(mockA.state.upstream).toBe(0);
    await page.goto("about:blank");
  });

  T("SWITCHED ON (the flag flipped, plus a consenting shop with its alcohol declaration): the ☰ item, a list of two shops, the demo labelled, the test shop's beer 20+ with the age note, one proxy call per shop", async () => {
    const page = await enter(B(), "");
    const on = await page.eval(`({ enabled: window.__jpyc.enabled, mode: window.__jpyc.mode, entries: window.__jpyc.entries().map((e) => [e.id, e.kind, e.off, e.pending, e.alcoholOk]), tools: [...document.querySelectorAll('#klc-ui .tools [data-act]')].map((e) => e.dataset.act),
      label: document.querySelector('#klc-ui [data-act=jpyc]')?.getAttribute('aria-label') })`);
    metric("B.on", { ...on, tools: on.tools.join(",") });
    expect(on.enabled).toBe(true); expect(on.mode).toBe("normal");
    expect(on.entries).toEqual([["jpyc-demo", "demo", false, false, false], ["test-cafe", "kesennuma", false, false, true]]);   // (not off, not pending: switched on by the file itself, not by a dev preview)
    expect(on.tools[0]).toBe("jpyc"); expect(on.label).toBe("JPYCで買えるお店");
    await page.eval("document.querySelector('#klc-ui [data-act=jpyc]').click(); 0");
    await page.waitFor("document.getElementById('klc-jpyc')?.dataset.open === '1'", { timeout: 8000 });
    const list = await page.eval("document.querySelector('#klc-jpyc [data-f=body]').innerText");
    for (const s of ["JPYC EC デモショップ", "デモ（実際の店舗ではありません）", "テスト喫茶", "気仙沼のお店"]) expect([s, list.includes(s)]).toEqual([s, true]);
    expect(list).not.toContain("【開発用】");   // (no dev label: this is the production rule)
    await page.eval("document.querySelector('#klc-jpyc [data-act=shop][data-id=test-cafe]').click(); 0");
    await page.waitFor("document.getElementById('klc-jpyc')?.dataset.phase === 'ok'", { timeout: 15000 });
    const shop = await page.eval(`({ ids: [...document.querySelectorAll('#klc-jpyc .kj-product')].map((e) => [e.dataset.id, e.dataset.alcohol ?? null]), badge: document.querySelector('#klc-jpyc .kj-product[data-id=beer0002] .kj-badge[data-kind=alcohol]')?.textContent ?? null,
      teaBadge: !!document.querySelector('#klc-jpyc .kj-product[data-id=tea00001] .kj-badge'), note: document.querySelector('#klc-jpyc .kj-alcohol')?.textContent ?? null, buy: document.querySelector('#klc-jpyc .kj-product[data-id=beer0002] a.kj-buy')?.getAttribute('href') ?? null,
      kind: document.querySelector('#klc-jpyc .kj-shophead .kj-badge')?.textContent ?? null, maps: !!document.querySelector('#klc-jpyc .kj-shophead .kj-maps') })`);
    metric("B.shop", shop);
    expect(shop.ids).toEqual([["tea00001", null], ["beer0002", "1"]]); expect(shop.badge).toBe("酒類（20歳以上）"); expect(shop.teaBadge).toBe(false);
    expect(shop.note).toContain("20歳未満の方には販売できません"); expect(shop.kind).toBe("気仙沼のお店"); expect(shop.maps).toBe(true);
    expect(shop.buy).toBe("https://ec.jpyc-service.com/shops/test-cafe-shop/products/beer0002");
    expect(mockB.state.requests).toEqual(["/api/v1/shops/test-cafe-shop/products"]);   // (one platform call behind the whole visit)
    expect(mockB.proxy.stats.alcoholHeld).toBe(0);
    // the demo shop from the list: labelled, its one product, no alcohol note
    await page.eval("document.querySelector('#klc-jpyc [data-act=back]').click(); 0"); await sleep(300);
    await page.eval("document.querySelector('#klc-jpyc [data-act=shop][data-id=jpyc-demo]').click(); 0");
    await page.waitFor("document.getElementById('klc-jpyc')?.dataset.phase === 'ok'", { timeout: 15000 });
    const demo = await page.eval(`({ badge: document.querySelector('#klc-jpyc .kj-shophead .kj-badge').textContent, note: !!document.querySelector('#klc-jpyc .kj-alcohol'), n: document.querySelectorAll('#klc-jpyc .kj-product').length, text: document.querySelector('#klc-jpyc [data-f=body]').innerText })`);
    expect(demo.badge).toBe("デモ（実際の店舗ではありません）"); expect([demo.note, demo.n]).toEqual([false, 1]); expect(demo.text).not.toContain("【開発用】");
    expect(mockB.state.requests).toEqual(["/api/v1/shops/test-cafe-shop/products", "/api/v1/shops/otameshi/products"]);
    // Esc steps back to the list, then closes
    await page.S("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }); await page.S("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }); await sleep(300);
    expect(await page.eval("document.getElementById('klc-jpyc').dataset.screen")).toBe("list");
    expect(asked.ec).toEqual([]); expect(asked.maps).toEqual([]);
    expect(page.errors().filter((e) => !/api\/live/.test(e.text))).toEqual([]);
    await page.goto("about:blank");
  });

  T("the flyer's kids (?src=chirashi) with the feature switched on: no ☰ item, no sheet, no JPYC text, not one proxy request; the same address with ?jpyc=dev changes nothing", async () => {
    const before = mockB.state.upstream;
    const page = await enter(B("&src=chirashi&jpyc=dev"), "");
    const r = await nothing(page);
    metric("B.kids", { ...r, tools: r.tools.join(",") });
    expect(r).toMatchObject({ enabled: false, kids: true, item: false, root: false, css: false, hud: false, credits: false, opened: [false, false, false], api: [] });
    expect(r.tools).not.toContain("jpyc"); expect(mockB.state.upstream).toBe(before);
    expect(await page.eval("sessionStorage.getItem('klc.src')")).toBe("chirashi");
    await page.goto("about:blank");
  });
});
