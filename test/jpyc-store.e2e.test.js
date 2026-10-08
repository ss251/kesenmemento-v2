// [jpyc] The 「JPYCで買えるお店」 sheet in a real Chrome, against the REAL proxy (server/app/jpyc.js) in front of a stand-in for JPYC EC (tools/anime/jpyc-mock-api.mjs, answering with the
// responses recorded from the real API): the page asks only the proxy (?jpycApi= a loopback origin), never JPYC EC, and the only third-party traffic, the product photos, is answered
// by this test (a picture drawn here), so nothing leaves the machine. It checks, on a desktop and on a phone (real touches, the safe areas, portrait and landscape): the ☰ item,
// the list, the shop with its skeleton, product and buy link (attributes only: the link is never followed), the states (error + retry, empty, offline + back online, busy, gone), the
// keyboard (Tab trapped, Esc steps back and closes, the town's keys stand down), 44 px targets, no horizontal overflow, the page behind inert, focus back on the opener, the
// kids gate under ?src=chirashi (and that it holds for the session), the page errors, and what the proxy was asked. Heavy, so it only runs on request, through the gate:
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS KLC_E2E=1 KLC_E2E_PORT=9425 bun test <absolute path>/test/jpyc-store.e2e.test.js
// or on the second render host:  the remote runner --wt <this worktree> --back dist/jpyc-shots -- env KLC_E2E=1 KLC_E2E_PORT=9425 JPYC_SHOTS=dist/jpyc-shots env -u NODE_OPTIONS bun test ./test/jpyc-store.e2e.test.js
// The numbers it measures are printed as one `JPYC-METRICS {json}` line. JPYC_SHOTS=<dir> saves screenshots there.
// The pages here run as the developer's preview (?jpyc=dev on 127.0.0.1: the data file ships the demo shop switched off); the switch itself, off as shipped and on, is test/jpyc-switch.e2e.test.js.
import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { buildAndServe, launch, phonePage, setViewport, enterTown, center, sleep } from "../tools/anime/pad-lib.mjs";
import { startMock, makeProduct } from "../tools/anime/jpyc-mock-api.mjs";

const RUN = process.env.KLC_E2E === "1" && process.env.KLC_GATE === "1";
const PORT = Number(process.env.KLC_E2E_PORT || 9425);
const SHOTS = process.env.JPYC_SHOTS || "";
const d = RUN ? describe : describe.skip;
const T = (name, fn) => test(name, fn, 240000);
const PORTRAIT = { width: 390, height: 844, dpr: 3, insets: { top: 47, bottom: 34, left: 0, right: 0 } };
const LANDSCAPE = { width: 844, height: 390, dpr: 3, insets: { top: 0, bottom: 21, left: 47, right: 47 } };
const M = { build: "jpyc-store" };
const metric = (k, v) => { M[k] = v; return v; };
const WATCHDOG_MS = 14 * 60 * 1000;
/** A page that stops answering must not hold the machine's one Chrome lock: every in-page call has a deadline, and a call that misses it ends the run. */
const guard = (page, ms = 90000) => {
  const ev = page.eval;
  page.eval = (expr) => new Promise((res, rej) => {
    const t = setTimeout(() => { console.error("JPYC-METRICS " + JSON.stringify(M)); console.error(`jpyc e2e: the page did not answer within ${ms} ms, ending the run so the Chrome lock is released: ${String(expr).slice(0, 160)}`); process.exit(1); }, ms);
    ev(expr).then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
  });
  return page;
};
const shot = async (page, name) => { if (!SHOTS) return; mkdirSync(SHOTS, { recursive: true }); await page.shot(join(SHOTS, name + ".png")); };

/** A stand-in product photo drawn here (the real one lives on imagedelivery.net; no test touches it). */
async function photo(w = 168, h = 168) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8fbde9"/><stop offset="1" stop-color="#ffd6ae"/></linearGradient></defs>`
    + `<rect width="100%" height="100%" fill="url(#g)"/><circle cx="${w * 0.5}" cy="${h * 0.46}" r="${w * 0.22}" fill="#fff" opacity="0.9"/><rect x="${w * 0.2}" y="${h * 0.74}" width="${w * 0.6}" height="${h * 0.08}" rx="6" fill="#1f3a68" opacity="0.8"/></svg>`;
  return (await sharp(Buffer.from(svg)).png().toBuffer()).toString("base64");
}

d("the shop sheet in a real browser", () => {
  let browser, srv, mock, watchdog, PNG;
  const asked = { ec: [], maps: [], images: 0 };   // what the browser tried to reach that is not ours
  const pages = [];
  beforeAll(async () => {
    watchdog = setTimeout(() => { console.error("JPYC-METRICS " + JSON.stringify(M)); console.error(`jpyc e2e: still running after ${WATCHDOG_MS / 60000} minutes: killing the browser so the Chrome lock is released`); process.exit(1); }, WATCHDOG_MS);
    PNG = await photo();
    ({ srv } = await buildAndServe(PORT));
    mock = startMock({ port: PORT + 1, proxy: { backoff: 120, notFoundTtl: 120 } });
    browser = await launch({ quiet: true });
    // the browser never talks to JPYC EC or to Google: such a request is recorded and refused; the product photos are answered here
    browser.on("Fetch.requestPaused", async (p) => {
      const url = p.request.url;
      const reply = (method, args) => Promise.any(pages.map((pg) => pg.S(method, args))).catch(() => {});
      if (/imagedelivery\.net/.test(url)) { asked.images++; await reply("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: "content-type", value: "image/png" }, { name: "access-control-allow-origin", value: "*" }], body: PNG }); }
      else { (/ec\.jpyc-service\.com/.test(url) ? asked.ec : asked.maps).push(url); await reply("Fetch.failRequest", { requestId: p.requestId, errorReason: "BlockedByClient" }); }
    });
  }, 330000);
  afterAll(async () => { clearTimeout(watchdog); console.log("JPYC-METRICS " + JSON.stringify(M)); await browser?.close(); srv?.stop(); mock?.stop(); }, 60000);
  /** Interception for the pages' third-party traffic, and the browser's own HTTP cache off (the proxy says max-age=30, which is right for a visitor and wrong for a test that changes the platform's mood between steps). */
  const watch = async (page) => {
    pages.push(page);
    await page.S("Fetch.enable", { patterns: [{ urlPattern: "*imagedelivery.net*" }, { urlPattern: "*ec.jpyc-service.com*" }, { urlPattern: "*google.com/maps*" }] });
    await page.S("Network.enable"); await page.S("Network.setCacheDisabled", { cacheDisabled: true });
    return page;
  };
  const api = (path, body) => fetch(mock.url + path, { method: "POST", body: JSON.stringify(body ?? {}) }).then((r) => r.json());
  // (jpyc=dev: the developer's preview on this machine's 127.0.0.1. The shipped data file has the demo shop switched off, so a page without it shows nothing: test/jpyc-switch.e2e.test.js checks that and the switch turned on)
  const url = (q = "") => `${srv.url}index.html?q=low&jpyc=dev&jpycApi=${encodeURIComponent(mock.url)}${q}`;
  const clearLast = (page) => page.eval("window.__jpyc.state.last.clear(); 0");
  const phase = (page) => page.eval("document.getElementById('klc-jpyc')?.dataset.phase ?? ''");
  const text = (page) => page.eval("document.querySelector('#klc-jpyc [data-f=body]')?.innerText ?? ''");
  const slid = (page) => page.waitFor("(() => { const s = document.querySelector('#klc-jpyc .kj-sheet'); return !!s && getComputedStyle(s).transform === 'none' && getComputedStyle(s).opacity === '1'; })()", { timeout: 8000 });   // (the slide-in takes .36 s; on a loaded machine longer)
  const settle = async (page, want, ms = 8000) => { await page.waitFor(`document.getElementById('klc-jpyc')?.dataset.phase === ${JSON.stringify(want)}`, { timeout: ms }); };

  d("desktop 1440x900, mouse and keyboard", () => {
    let page;
    const key = async (k, code, vk, mod = 0) => { await page.S("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: vk, modifiers: mod }); await page.S("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk, modifiers: mod }); await sleep(120); };
    const mouse = (type, x, y) => page.S("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });
    const clickReal = async (sel) => { const c = await center(page, sel); expect(c && c.w > 1).toBeTruthy(); await page.S("Input.dispatchMouseEvent", { type: "mouseMoved", x: c.x, y: c.y }); await mouse("mousePressed", c.x, c.y); await sleep(40); await mouse("mouseReleased", c.x, c.y); await sleep(350); return c; };
    const rect = (sel) => page.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const b = e.getBoundingClientRect(); return { l: +b.left.toFixed(1), t: +b.top.toFixed(1), r: +b.right.toFixed(1), b: +b.bottom.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; })()`);
    beforeAll(async () => {
      page = guard(await watch(await browser.page({ width: 1440, height: 900, dpr: 1 })));
      await page.goto(url());
      await page.waitFor("document.body.classList.contains('loaded')", { timeout: 280000 });
      await page.eval("document.getElementById('go').click()");
      await page.waitFor("document.body.classList.contains('playing')", { timeout: 20000 });
      await page.waitFor("window.__life && window.__life.hud && window.__jpyc", { timeout: 20000 });
      await sleep(2500);
    }, 330000);

    T("the toolbar item is the first one, 38 px round, label hidden, with a name; the items on its right have not moved (the toolbar is right-anchored)", async () => {
      const r = await page.eval(`(() => {
        const q = (a) => document.querySelector('#klc-ui .tools [data-act="' + a + '"]'), R = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, w: b.width, h: b.height }; };
        const acts = [...document.querySelectorAll('#klc-ui .tools [data-act]')].map((e) => e.dataset.act), b = q('jpyc');
        return { acts, jpyc: R(b), hide: R(q('hide')), lang: R(q('lang')), lbl: getComputedStyle(b.querySelector('.lbl')).display, label: b.getAttribute('aria-label'), title: b.title, vw: innerWidth };
      })()`);
      metric("desktop.toolbar", r);
      expect(r.acts.filter((a) => a !== "report")).toEqual(["jpyc", "lang", "season", "sound", "planet", "credits", "labels", "hide"]);
      expect([r.jpyc.w, r.jpyc.h]).toEqual([38, 38]); expect(r.lbl).toBe("none"); expect(r.label).toBe("JPYCで買えるお店"); expect(r.title).toMatch(/JPYC/);
      expect(Math.round(r.hide.r)).toBe(r.vw - 18);   // (hide is the last in-flow item: still 18 px from the edge, where the CSS puts it)
      expect(r.jpyc.r).toBeLessThan(r.lang.l);
      await shot(page, "desktop-toolbar");
    });

    T("the new item overlaps nothing at any desktop width (the wordmark and chip, the report button, the other tools, the search row), and the tools on its right stay 18 px from the edge", async () => {
      const sweep = [];
      for (const w of [1920, 1440, 1180, 1024, 900, 840, 839, 800, 780, 744, 730, 722]) {
        await page.S("Emulation.setDeviceMetricsOverride", { width: w, height: 900, deviceScaleFactor: 1, mobile: false, screenWidth: w, screenHeight: 900 }); await sleep(350);
        const r = await page.eval(`(() => {
          const R = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return b.width < 1 ? null : { l: b.left, t: b.top, r: b.right, b: b.bottom }; }, q = (s) => document.querySelector(s);
          const hit = (a, b) => !!a && !!b && a.l < b.r - 0.5 && a.r > b.l + 0.5 && a.t < b.b - 0.5 && a.b > b.t + 0.5;
          const me = R(q('#klc-ui .tools [data-act="jpyc"]')), others = ['lang', 'season', 'sound', 'planet', 'hide'].map((a) => [a, R(q('#klc-ui .tools [data-act="' + a + '"]'))]);
          const boxes = { brand: R(q('#klc-ui .brand')), mark: R(q('#klc-ui .mark')), chip: R(q('#klc-ui .chip')), report: R(q('#klc-ui .tools .rep')), xbar: R(q('#klc-x .xbar')), places: R(q('#klc-ui .places')), arrivals: R(q('#klc-ui .arrivals:not([hidden])')) };
          const select = R(q('#klc-ui #quality'));
          return { w: innerWidth, me, hideRight: others.find(([a]) => a === 'hide')[1]?.r, overlaps: Object.entries(boxes).filter(([, b]) => hit(me, b)).map(([k]) => k).concat(others.filter(([, b]) => hit(me, b)).map(([a]) => a)).concat(hit(me, select) ? ['quality'] : []),
            brandRight: Math.max(boxes.mark?.r ?? 0, boxes.chip?.r ?? 0), meLeft: me?.l, selectLeft: select?.l, selectVsMark: hit(select, boxes.mark) || hit(select, boxes.chip) ? 'overlap' : '', reportVsBrand: hit(boxes.report, boxes.brand) ? 'overlap' : '', meTop: me?.t, reportTop: boxes.report?.t, inFlow: getComputedStyle(q('#klc-ui .tools [data-act="jpyc"]')).position !== 'absolute' };
        })()`);
        sweep.push({ w, meLeft: Math.round(r.meLeft), brandRight: Math.round(r.brandRight), selectLeft: Math.round(r.selectLeft), overlaps: r.overlaps, hideGap: r.w - Math.round(r.hideRight), reportVsBrand: r.reportVsBrand, selectVsMark: r.selectVsMark, inFlow: r.inFlow, meTop: Math.round(r.meTop), reportTop: Math.round(r.reportTop ?? -1) });
      }
      metric("desktop.sweep", sweep);
      for (const s of sweep) {
        expect([s.w, s.overlaps]).toEqual([s.w, []]); expect([s.w, s.hideGap]).toEqual([s.w, 18]); expect([s.w, s.reportVsBrand]).toEqual([s.w, ""]);
        expect([s.w, s.selectVsMark]).toEqual([s.w, ""]);   // (the quality selector, the item to the left of this one, is not pushed over 気仙沼リビングシティ)
        expect([s.w, s.inFlow]).toEqual([s.w, s.w >= 840]);   // (in the toolbar's row from 840 px; beside the report button, one row down, from 721 to 839)
        if (s.w < 840) expect([s.w, s.meTop]).toEqual([s.w, s.reportTop]);
      }
      await page.S("Emulation.setDeviceMetricsOverride", { width: 760, height: 900, deviceScaleFactor: 1, mobile: false, screenWidth: 760, screenHeight: 900 }); await sleep(350); await shot(page, "desktop-760");
      await page.S("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false, screenWidth: 1440, screenHeight: 900 }); await sleep(350);
    });

    T("a click opens the list at the right, 440 px wide: a dialog with the demo shop, the guide link, the rate, the guardian's line and the credits; the page behind is inert and focus is inside", async () => {
      const t0 = await page.eval("performance.now()");
      await clickReal('#klc-ui .tools [data-act="jpyc"]'); await slid(page);
      const r = await page.eval(`(() => {
        const root = document.getElementById('klc-jpyc'), s = root.querySelector('.kj-sheet'), b = s.getBoundingClientRect(), body = root.querySelector('[data-f=body]');
        return { open: root.dataset.open, screen: root.dataset.screen, role: s.getAttribute('role'), modal: s.getAttribute('aria-modal'), rect: { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width }, title: root.querySelector('#kj-title').textContent,
          active: document.activeElement === body, scene: document.getElementById('scene').inert, ui: document.getElementById('klc-ui').inert, bodyClass: document.body.classList.contains('klc-jpyc-open'), text: body.innerText,
          menu: document.getElementById('klc-ui').dataset.menu, vis: getComputedStyle(root).visibility, noui: document.body.classList.contains('noui'), z: getComputedStyle(root).zIndex };
      })()`);
      metric("desktop.list", { ms: Math.round((await page.eval("performance.now()")) - t0), rect: r.rect });
      expect(r).toMatchObject({ open: "1", screen: "list", role: "dialog", modal: "true", title: "JPYCで買えるお店", active: true, scene: true, ui: true, bodyClass: true, vis: "visible", z: "60" });
      expect(Math.round(r.rect.w)).toBe(440); expect(Math.round(r.rect.r)).toBe(1440 - 18); expect(Math.round(r.rect.t)).toBe(18); expect(Math.round(r.rect.b)).toBe(900 - 18);
      for (const s of ["JPYC EC デモショップ", "デモ（実際の店舗ではありません）", "JPYCとは / 入手方法", "1 JPYC = ¥1", "18歳未満の方は、保護者の同意を得てからご購入ください。", "JPYC ECはMAMETAが運営しています", "ケセンメメント（KesenMemento）はどちらとも提携していません"]) expect([s, r.text.includes(s)]).toEqual([s, true]);
      await shot(page, "desktop-list");
    });

    T("a shop: a skeleton while JPYC EC is slow, then the product with its photo, price, stock and 「JPYCで買う」, a link to the product page in a new tab (never followed here)", async () => {
      mock.reset(); mock.setMode("slow", { ms: 900 });
      await clickReal('#klc-jpyc [data-act="shop"][data-id="jpyc-demo"]');
      const loading = await page.eval(`({ phase: document.getElementById('klc-jpyc').dataset.phase, skel: document.querySelectorAll('#klc-jpyc .kj-skel').length, title: document.querySelector('#klc-jpyc #kj-title').textContent })`);
      await shot(page, "desktop-loading");
      await settle(page, "ok");
      const r = await page.eval(`(() => {
        const c = document.querySelector('#klc-jpyc .kj-product'), img = c.querySelector('img'), a = c.querySelector('a.kj-buy'), L = [...document.querySelectorAll('#klc-jpyc a[href]')];
        return { name: c.querySelector('.kj-pname').textContent, price: c.querySelector('.kj-price').textContent, avail: c.querySelector('.kj-avail').textContent, imgW: img?.naturalWidth ?? 0, imgComplete: !!img?.complete, src: img?.getAttribute('src'),
          href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel'), btn: a.textContent.trim(), btnH: a.getBoundingClientRect().height,
          links: L.map((x) => [x.getAttribute('href'), x.target, x.rel]), badge: document.querySelector('#klc-jpyc .kj-shophead .kj-badge').textContent, chains: document.querySelector('#klc-jpyc .kj-shophead').innerText,
          back: !document.querySelector('#klc-jpyc [data-act=back]').hidden, h: document.querySelector('#klc-jpyc [data-f=body]').scrollHeight <= document.querySelector('#klc-jpyc [data-f=body]').clientHeight + 1 };
      })()`);
      metric("desktop.shop", { loading, upstream: mock.state.upstream, requests: mock.state.requests, btnH: r.btnH });
      expect(loading).toEqual({ phase: "loading", skel: 3, title: "JPYC EC デモショップ" });
      expect(r.name).toBe("【テスト用】決済お試し商品（0 JPYC）"); expect(r.price).toBe("0 JPYC"); expect(r.avail).toBe("在庫 9,932"); expect(r.btn).toBe("JPYCで買う");
      expect(r.imgW).toBeGreaterThan(0); expect(r.imgComplete).toBe(true); expect(r.src).toMatch(/^https:\/\/imagedelivery\.net\//);
      expect(r.href).toBe("https://ec.jpyc-service.com/shops/otameshi/products/e899a1dd-754d-4a97-b07b-58fcd5940e36"); expect([r.target, r.rel]).toEqual(["_blank", "noopener noreferrer"]);
      for (const [h, t, rel] of r.links) { expect(h).toMatch(/^https:\/\/(ec\.jpyc-service\.com|www\.google\.com)\//); expect([t, rel]).toEqual(["_blank", "noopener noreferrer"]); }
      expect(r.badge).toBe("デモ（実際の店舗ではありません）"); expect(r.chains).toContain("Polygon · Ethereum · Avalanche"); expect(r.back).toBe(true);
      expect(mock.state.requests).toEqual(["/api/v1/shops/otameshi/products"]);   // (one platform call behind the whole sheet)
      await shot(page, "desktop-shop");
    });

    T("keyboard: Tab stays inside the sheet, Esc steps back to the list (focus on the shop's card), Esc closes (focus back on the toolbar item); the town's keys do not run while it is open", async () => {
      const inside = () => page.eval("document.getElementById('klc-jpyc').contains(document.activeElement)");
      const hour = () => page.eval("document.querySelector('#klc-ui [data-act=preset][aria-pressed=true]')?.dataset.id");
      const h0 = await hour();
      for (let i = 0; i < 14; i++) { await key("Tab", "Tab", 9); expect(await inside()).toBe(true); }
      for (let i = 0; i < 14; i++) { await key("Tab", "Tab", 9, 8); expect(await inside()).toBe(true); }   // (Shift+Tab)
      await key("t", "KeyT", 84); await key("v", "KeyV", 86); await key("w", "KeyW", 87); await key("h", "KeyH", 72);
      expect(await hour()).toBe(h0); expect(await page.eval("document.body.classList.contains('noui')")).toBe(false);
      await key("Escape", "Escape", 27);
      expect(await page.eval("document.getElementById('klc-jpyc').dataset.screen")).toBe("list");
      expect(await page.eval("document.activeElement?.dataset?.id")).toBe("jpyc-demo");
      await key("Escape", "Escape", 27); await sleep(450);
      const r = await page.eval(`({ open: document.getElementById('klc-jpyc').dataset.open, vis: getComputedStyle(document.getElementById('klc-jpyc')).visibility, inert: document.getElementById('klc-ui').inert || document.getElementById('scene').inert, cls: document.body.classList.contains('klc-jpyc-open'), focus: document.activeElement?.dataset?.act })`);
      expect(r).toEqual({ open: "0", vis: "hidden", inert: false, cls: false, focus: "jpyc" });
      await key("t", "KeyT", 84); await sleep(200); expect(await hour()).not.toBe(h0);   // (and they run again)
    });

    T("a second visit to the same shop does not ask JPYC EC again (the proxy's cache), and the last good copy is on screen at once", async () => {
      const before = mock.state.upstream;
      await clickReal('#klc-ui .tools [data-act="jpyc"]'); await clickReal('#klc-jpyc [data-act="shop"][data-id="jpyc-demo"]');
      expect(await phase(page)).toBe("ok");
      await sleep(400);
      expect(mock.state.upstream).toBe(before);
      await page.eval("window.__jpyc.close(); 0"); await sleep(400);
    });

    T("states: error with a retry that works, an empty shop, busy, a shop that is gone, and a kind that does not match; no technical text in any", async () => {
      const open = async () => { await clearLast(page); await page.eval("window.__jpyc.open('jpyc-demo'); 0"); await sleep(250); };
      mock.reset(); mock.setMode("500"); await open(); await settle(page, "error");
      let tx = await text(page); expect(tx).toContain("商品を読み込めませんでした。"); expect(tx).toMatch(/もう一度読み込む/); expect(tx).not.toMatch(/undefined|null|500|INTERNAL|boom|Error/);
      await shot(page, "desktop-error");
      mock.setMode("ok"); await sleep(200); await page.eval("document.querySelector('#klc-jpyc [data-act=retry]').click(); 0"); await settle(page, "ok");
      expect(await page.eval("document.querySelectorAll('#klc-jpyc .kj-product').length")).toBe(1);
      mock.reset(); mock.setMode("empty"); await open(); await settle(page, "empty"); tx = await text(page); expect(tx).toContain("いま表示できる商品はありません。"); await shot(page, "desktop-empty");
      mock.reset(); mock.setMode("429", { retryAfter: 20 }); await open(); await settle(page, "busy"); tx = await text(page); expect(tx).toContain("JPYC ECが混み合っています。"); await shot(page, "desktop-busy");
      mock.reset(); mock.setMode("shopdown"); await open(); await settle(page, "gone"); tx = await text(page); expect(tx).toContain("このお店は見つかりませんでした。");
      expect(await page.eval("!!document.querySelector('#klc-jpyc [data-act=retry]')")).toBe(false); await shot(page, "desktop-gone");
      mock.reset(); await api("/__mock/shop", { slug: "otameshi", name: "実は本物の店", is_demo: false, products: [makeProduct()] });   // (a demo entry whose shop stopped being a demo)
      await open(); await settle(page, "mismatch"); tx = await text(page); expect(tx).toContain("このお店の情報を表示できません。"); expect(tx).not.toContain("お試し商品");
      mock.reset();
      await page.eval("window.__jpyc.close(); 0"); await sleep(400);
    });

    T("alcohol is held back: a beer on the demo shop (whose row declares no licence) never reaches the page, and the proxy counted it", async () => {
      mock.reset();
      await api("/__mock/shop", { slug: "otameshi", name: "デモ", is_demo: true, products: [makeProduct({ id: "tea00001", name: "お茶 煎茶 100g" }), makeProduct({ id: "beer0002", name: "クラフトビール3本セット", category: "飲料" })] });
      mock.proxy.clear(); await clearLast(page);
      await page.eval("window.__jpyc.open('jpyc-demo'); 0"); await settle(page, "ok");
      const r = await page.eval(`({ ids: [...document.querySelectorAll('#klc-jpyc .kj-product')].map((e) => e.dataset.id), text: document.querySelector('#klc-jpyc [data-f=body]').innerText, note: !!document.querySelector('#klc-jpyc .kj-alcohol'), badge: !!document.querySelector('#klc-jpyc .kj-badge[data-kind=alcohol]') })`);
      expect(r.ids).toEqual(["tea00001"]); expect(r.text).not.toContain("ビール"); expect([r.note, r.badge]).toEqual([false, false]);
      const st = await (await fetch(mock.url + "/__mock/state")).json(); metric("alcohol", { held: st.proxy.alcoholHeld });
      expect(st.proxy.alcoholHeld).toBe(1);
      expect(await (await fetch(mock.url + "/api/jpyc/shops/otameshi/products")).text()).not.toContain("ビール");   // (the proxy's own answer says nothing of it)
      expect((await fetch(mock.url + "/api/jpyc/products/beer0002")).status).toBe(404);
      mock.reset(); await page.eval("window.__jpyc.close(); 0"); await sleep(400);
    });

    T("offline: the sheet says so without asking, and reloads by itself when the connection is back", async () => {
      mock.reset(); await clearLast(page);
      await page.S("Network.enable"); await page.S("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }); await sleep(300);
      const online = await page.eval("navigator.onLine"); expect(online).toBe(false);
      await page.eval("window.__jpyc.open('jpyc-demo'); 0"); await settle(page, "offline");
      expect(await text(page)).toContain("オフラインです。"); expect(mock.state.upstream).toBe(0);
      await shot(page, "desktop-offline");
      await page.S("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }); await settle(page, "ok", 10000);
      expect(mock.state.upstream).toBe(1);
      await page.eval("window.__jpyc.close(); 0"); await sleep(400);
    });

    T("a room can open a shop directly (ctx.services.jpyc.open): no back arrow, Esc closes, and the room's own product list narrows what is shown", async () => {
      mock.reset(); await api("/__mock/shop", { slug: "otameshi", name: "デモ", is_demo: true, products: [makeProduct({ id: "aaaa1111", name: "A" }), makeProduct({ id: "bbbb2222", name: "B" }), makeProduct({ id: "cccc3333", name: "C" })] }); mock.proxy.clear(); await clearLast(page);
      await page.eval("window.__jpyc.open({ shopSlug: 'otameshi', productIds: ['cccc3333', 'aaaa1111'] }); 0"); await settle(page, "ok");
      const r = await page.eval(`({ ids: [...document.querySelectorAll('#klc-jpyc .kj-product')].map((e) => e.dataset.id).sort(), back: document.querySelector('#klc-jpyc [data-act=back]').hidden })`);
      expect(r).toEqual({ ids: ["aaaa1111", "cccc3333"], back: true });
      await key("Escape", "Escape", 27); await sleep(450); expect(await page.eval("document.getElementById('klc-jpyc').dataset.open")).toBe("0");
      mock.reset();
    });

    T("the browser asked JPYC EC and Google for nothing (the sheet only reads through the proxy and links out), and the page raised no errors", async () => {
      expect(asked.ec).toEqual([]); expect(asked.maps).toEqual([]); expect(asked.images).toBeGreaterThan(0);
      metric("asked", { ec: asked.ec.length, maps: asked.maps.length, images: asked.images });
      // Chrome logs a failed fetch as a console error: the four answers this file asked the platform's stand-in to fail with (an error, a busy, a gone, a mismatch) are the only ones allowed
      const planned = page.errors().filter((e) => e.type === "log-error" && /status of (502|503|404)[^]*\/api\/jpyc\/shops\/otameshi\/products/.test(e.text));
      expect(planned.map((e) => e.text.match(/status of (\d+)/)[1])).toEqual(["502", "503", "404", "502"]);
      expect(page.errors().filter((e) => !/api\/live/.test(e.text) && !planned.includes(e))).toEqual([]);
    });

    T("the flyer's source (?src=chirashi): no toolbar item, no sheet, no JPYC text in the HUD, and it holds for the rest of the session without the parameter", async () => {
      await page.goto(url("&src=chirashi"));
      await page.waitFor("document.body.classList.contains('loaded')", { timeout: 280000 });
      await page.eval("document.getElementById('go').click()");
      await page.waitFor("document.body.classList.contains('playing') && window.__life && window.__life.hud && window.__jpyc", { timeout: 40000 });
      await sleep(1500);
      const kids = await page.eval(`({ enabled: window.__jpyc.enabled, kids: window.__jpyc.kids, item: !!document.querySelector('[data-act=jpyc]'), root: !!document.getElementById('klc-jpyc'), css: !!document.getElementById('klc-jpyc-css'), hud: /JPYC/i.test(document.getElementById('klc-ui').innerHTML), opened: window.__jpyc.openList(), stored: sessionStorage.getItem('klc.src') })`);
      expect(kids).toEqual({ enabled: false, kids: true, item: false, root: false, css: false, hud: false, opened: false, stored: "chirashi" });
      await page.goto(url(""));   // the same tab, no ?src=: the visit began at the flyer
      await page.waitFor("document.body.classList.contains('loaded')", { timeout: 280000 });
      await page.eval("document.getElementById('go').click()");
      await page.waitFor("document.body.classList.contains('playing') && window.__life && window.__life.hud && window.__jpyc", { timeout: 40000 });
      expect(await page.eval("({ enabled: window.__jpyc.enabled, item: !!document.querySelector('[data-act=jpyc]') })")).toEqual({ enabled: false, item: false });
      expect(asked.ec).toEqual([]);
      await page.eval("sessionStorage.removeItem('klc.src'); 0");
    });
    afterAll(async () => { await page?.goto("about:blank").catch(() => {}); }, 30000);
  });

  d("phone 390x844 (portrait) and 844x390 (landscape), real touches, the safe areas", () => {
    let page, f;
    const tap = async (sel) => { const c = await center(page, sel); expect(c && c.w > 1, sel).toBeTruthy(); await f.tap(c.x, c.y); await sleep(450); return c; };
    const rects = (sel) => page.eval(`[...document.querySelectorAll(${JSON.stringify(sel)})].map((e) => { const b = e.getBoundingClientRect(); return { l: +b.left.toFixed(1), t: +b.top.toFixed(1), r: +b.right.toFixed(1), b: +b.bottom.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1), vis: b.width > 0 && b.height > 0 && getComputedStyle(e).visibility !== 'hidden' }; })`);
    beforeAll(async () => {
      await api("/__mock/reset");
      page = guard(await watch(await phonePage(browser, PORTRAIT)));
      f = await enterTown(page, url());
      try {
        await page.waitFor("window.__life && window.__life.hud && window.__jpyc", { timeout: 180000 });   // (a loaded second machine takes minutes to build the town: the desktop run above has already shown the sheet exists)
        await sleep(1500);
        await page.waitFor("typeof window.__camSpec === 'function'", { timeout: 60000 });
        await page.eval("window.__camSpec('walk')");
        await page.waitFor("window.__pad && !window.__pad.hidden", { timeout: 60000 });
        await page.eval("window.__pad.dismissCoach()"); await sleep(600);
      } catch (e) {   // (say what the page looked like: a timeout alone does not tell which of its parts never came)
        const st = await page.eval("({ life: !!window.__life, hud: !!window.__life?.hud, jpyc: !!window.__jpyc, explore: !!window.__explore, pad: !!window.__pad, camSpec: typeof window.__camSpec, body: document.body.className, url: location.search, ua: navigator.userAgent.slice(0, 60), w: innerWidth, h: innerHeight })").catch((x) => ({ evalFailed: String(x) }));
        console.error("JPYC phone setup failed:", JSON.stringify(st), JSON.stringify(page.logs.slice(-12)));
        throw e;
      }
    }, 330000);
    afterAll(async () => { await f?.release?.().catch(() => {}); }, 30000);

    T("the ☰ menu lists the item first, with its label, a 44 px row; the menu still fits the screen", async () => {
      await tap("#klc-ui .mbtn");
      const r = await page.eval(`(() => { const t = document.querySelector('#klc-ui .tools'), b = t.getBoundingClientRect(), it = t.querySelector('[data-act=jpyc]'), ib = it.getBoundingClientRect(), rows = [...t.querySelectorAll('.round')].map((e) => e.dataset.act);
        return { menu: document.getElementById('klc-ui').dataset.menu, rows, item: { h: ib.height, w: ib.width, label: it.querySelector('.lbl').textContent, lblDisplay: getComputedStyle(it.querySelector('.lbl')).display }, menuBottom: b.bottom, vh: innerHeight, inset: 34 }; })()`);
      metric("phone.menu", r);
      expect(r.menu).toBe("1"); expect(r.rows[0]).toBe("jpyc"); expect(r.item.h).toBeGreaterThanOrEqual(44); expect(r.item.label).toBe("JPYCで買えるお店"); expect(r.item.lblDisplay).not.toBe("none");
      expect(r.menuBottom).toBeLessThanOrEqual(r.vh);
      await shot(page, "phone-menu");
    });

    T("a tap opens the sheet as a bottom sheet inside the safe areas; the menu closes and the pad steps aside", async () => {
      await tap("#klc-ui .tools [data-act=jpyc]"); await slid(page);
      const r = await page.eval(`(() => { const s = document.querySelector('#klc-jpyc .kj-sheet').getBoundingClientRect(), root = document.getElementById('klc-jpyc');
        return { open: root.dataset.open, screen: root.dataset.screen, menu: document.getElementById('klc-ui').dataset.menu, pad: window.__pad.hidden, rect: { l: s.left, t: s.top, r: s.right, b: s.bottom, h: s.height }, vw: innerWidth, vh: innerHeight, scrollW: document.querySelector('#klc-jpyc [data-f=body]').scrollWidth, clientW: document.querySelector('#klc-jpyc [data-f=body]').clientWidth }; })()`);
      metric("phone.sheet", r);
      expect(r).toMatchObject({ open: "1", screen: "list", menu: "0", pad: true });
      expect(r.rect.l).toBeGreaterThanOrEqual(10 - 0.5); expect(r.vw - r.rect.r).toBeGreaterThanOrEqual(10 - 0.5); expect(r.rect.t).toBeGreaterThanOrEqual(47); expect(r.vh - r.rect.b).toBeGreaterThanOrEqual(34 + 10 - 0.5);
      expect(r.scrollW).toBeLessThanOrEqual(r.clientW + 1);
      await shot(page, "phone-list");
    });

    T("every control is at least 44 px: the back arrow, ✕, the language, a shop, the links and the buy button", async () => {
      await tap('#klc-jpyc [data-act="shop"][data-id="jpyc-demo"]');
      await settle(page, "ok");
      const sizes = await rects("#klc-jpyc button, #klc-jpyc a[href]");
      metric("phone.targets", sizes.filter((x) => x.vis).map((x) => [x.w, x.h]));
      expect(sizes.filter((x) => x.vis).length).toBeGreaterThan(5);
      for (const x of sizes.filter((v) => v.vis)) expect([x, x.h >= 43.5]).toEqual([x, true]);   // (a link may be narrow, never short)
      await shot(page, "phone-shop");
    });

    T("a long shop (twelve products, long names, sold out, no photo, a price from) scrolls under a header and a footer that stays, with no sideways overflow", async () => {
      const long = Array.from({ length: 12 }, (_, i) => makeProduct({ id: "p" + String(i).padStart(3, "0"), name: i === 3 ? "とても長い商品名のサンプル：気仙沼の海の幸をたっぷり詰め合わせた特別なギフトセット（送料込み・のし対応可）" : "商品 " + (i + 1), price_jpyc: String(1000 + i * 250) + ".000000000000000000", stock: i === 5 ? 0 : 20 - i, online_purchase_available: i !== 5, image_urls: i === 7 ? [] : makeProduct().image_urls }));
      await api("/__mock/reset"); await api("/__mock/shop", { slug: "otameshi", name: "0 JPYCで決済お試し（JPYC EC運営）", is_demo: true, products: long }); await clearLast(page);
      await page.eval("window.__jpyc.close(); window.__jpyc.open('jpyc-demo', { list: true }); 0"); await settle(page, "ok");
      const r = await page.eval(`(() => { const body = document.querySelector('#klc-jpyc [data-f=body]'), foot = document.querySelector('#klc-jpyc .kj-foot'), sheet = document.querySelector('#klc-jpyc .kj-sheet').getBoundingClientRect();
        const over = [...document.querySelectorAll('#klc-jpyc .kj-sheet *')].filter((e) => e.getBoundingClientRect().right > sheet.right + 1 || e.getBoundingClientRect().left < sheet.left - 1).map((e) => e.className || e.tagName).slice(0, 5);
        const f0 = foot.getBoundingClientRect(); const before = { top: body.scrollTop, footBottom: f0.bottom };
        body.scrollTop = 600; const f1 = foot.getBoundingClientRect();
        return { n: document.querySelectorAll('#klc-jpyc .kj-product').length, scrollable: body.scrollHeight > body.clientHeight + 50, over, before, after: { top: body.scrollTop, footBottom: f1.bottom }, sheetBottom: sheet.bottom, from: document.querySelector('#klc-jpyc [data-act=back]').hidden,
          prices: [...document.querySelectorAll('#klc-jpyc .kj-price')].slice(0, 3).map((e) => e.textContent), view: document.querySelectorAll('#klc-jpyc a.kj-view').length, noimg: document.querySelectorAll('#klc-jpyc .kj-noimg').length }; })()`);
      metric("phone.long", r);
      expect(r.n).toBe(12); expect(r.scrollable).toBe(true); expect(r.over).toEqual([]); expect(r.after.top).toBeGreaterThan(100);
      expect(Math.abs(r.after.footBottom - r.sheetBottom)).toBeLessThan(2);   // (the credits stay pinned to the bottom while the list moves)
      expect(r.from).toBe(false); expect(r.prices).toEqual(["1,000 JPYC", "1,250 JPYC", "1,500 JPYC"]); expect(r.view).toBe(1); expect(r.noimg).toBeGreaterThanOrEqual(1);
      await shot(page, "phone-long-top");
      // a real swipe scrolls the body (and nothing behind it)
      await page.eval("document.querySelector('#klc-jpyc [data-f=body]').scrollTop = 0; 0"); await sleep(100);
      const b = await center(page, "#klc-jpyc [data-f=body]");
      await f.down1(7, b.x, b.y + 160); await f.drag(7, b.x, b.y - 140, 10); await f.up(7); await sleep(300);
      expect(await page.eval("document.querySelector('#klc-jpyc [data-f=body]').scrollTop")).toBeGreaterThan(80);
      await shot(page, "phone-long-scrolled");
    });

    T("the language button switches the sheet to English, the credits read as the plan says, and ✕ closes it with the menu closed and the pad back", async () => {
      await tap("#klc-jpyc [data-act=lang]");
      const en = await page.eval(`({ title: document.querySelector('#klc-jpyc #kj-title').textContent, lang: document.getElementById('klc-jpyc').getAttribute('lang'), text: document.querySelector('#klc-jpyc [data-f=body]').innerText, item: document.querySelector('#klc-ui [data-act=jpyc]').getAttribute('aria-label') })`);
      expect(en.title).toBe("JPYC EC demo shop"); expect(en.lang).toBe("en"); expect(en.item).toBe("Shops that take JPYC");
      for (const s of ["Demo (not a real shop)", "Buy with JPYC", "JPYC EC is operated by MAMETA; JPYC is a registered trademark of JPYC Inc.; KesenMemento is not affiliated with either", "If you are under 18, please get a parent or guardian's consent before buying."]) expect([s, en.text.includes(s)]).toEqual([s, true]);
      await shot(page, "phone-shop-en");
      await tap("#klc-jpyc [data-act=lang]");
      await tap("#klc-jpyc .kj-head [data-act=close]");
      const r = await page.eval(`({ open: document.getElementById('klc-jpyc').dataset.open, pad: window.__pad.hidden, menu: document.getElementById('klc-ui').dataset.menu, inert: document.getElementById('klc-ui').inert, focus: document.activeElement?.dataset?.act || document.activeElement?.tagName })`);
      expect(r.open).toBe("0"); expect(r.pad).toBe(false); expect(r.menu).toBe("0"); expect(r.inert).toBe(false);
    });

    T("landscape (844x390): the sheet fits between the notch and the home bar, scrolls, and the footer scrolls with it", async () => {
      await setViewport(page, LANDSCAPE); await sleep(900);
      await page.eval("window.__jpyc.open('jpyc-demo', { list: true }); 0"); await settle(page, "ok"); await slid(page);
      const r = await page.eval(`(() => { const s = document.querySelector('#klc-jpyc .kj-sheet').getBoundingClientRect(), foot = getComputedStyle(document.querySelector('#klc-jpyc .kj-foot')).position, body = document.querySelector('#klc-jpyc [data-f=body]');
        return { rect: { l: s.left, t: s.top, r: s.right, b: s.bottom, w: s.width, h: s.height }, vw: innerWidth, vh: innerHeight, foot, scrollable: body.scrollHeight > body.clientHeight, over: body.scrollWidth > body.clientWidth + 1 }; })()`);
      metric("phone.landscape", r);
      expect(r.rect.t).toBeGreaterThanOrEqual(8 - 0.5); expect(r.vh - r.rect.b).toBeGreaterThanOrEqual(8 + 21 - 0.5); expect(r.rect.l).toBeGreaterThanOrEqual(47 + 10 - 0.5); expect(r.vw - r.rect.r).toBeGreaterThanOrEqual(47 + 10 - 0.5);
      expect(r.foot).toBe("static"); expect(r.scrollable).toBe(true); expect(r.over).toBe(false);
      await shot(page, "phone-landscape");
      await page.eval("window.__jpyc.close(); 0"); await setViewport(page, PORTRAIT); await sleep(600);
    });

    T("landscape (844x390) has no ☰ menu (it is for a portrait phone with the pad: style.js), so the item sits first in the toolbar's row: visible, on screen, overlapping nothing, and a real touch opens the sheet", async () => {
      await setViewport(page, LANDSCAPE); await sleep(900);
      const r = await page.eval(`(() => {
        const R = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return b.width < 1 || b.height < 1 ? null : { l: +b.left.toFixed(1), t: +b.top.toFixed(1), r: +b.right.toFixed(1), b: +b.bottom.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; }, q = (s) => document.querySelector(s);
        const hit = (a, b) => !!a && !!b && a.l < b.r - 0.5 && a.r > b.l + 0.5 && a.t < b.b - 0.5 && a.b > b.t + 0.5;
        const me = R(q('#klc-ui .tools [data-act="jpyc"]')), others = ['lang', 'season', 'sound', 'planet', 'hide', 'credits', 'labels'].map((a) => [a, R(q('#klc-ui .tools [data-act="' + a + '"]'))]).filter(([, b]) => b);
        const boxes = { brand: R(q('#klc-ui .brand')), chip: R(q('#klc-ui .chip')), report: R(q('#klc-ui .tools .rep')), select: R(q('#klc-ui #quality')) };
        return { vw: innerWidth, vh: innerHeight, mbtn: !!R(q('#klc-ui .mbtn')), me, overlaps: Object.entries(boxes).filter(([, b]) => hit(me, b)).map(([k]) => k).concat(others.filter(([, b]) => hit(me, b)).map(([a]) => a)),
          acts: [...document.querySelectorAll('#klc-ui .tools [data-act]')].map((e) => e.dataset.act), position: me ? getComputedStyle(q('#klc-ui .tools [data-act="jpyc"]')).position : null };
      })()`);
      metric("phone.landscapeToolbar", r);
      expect(r.mbtn).toBe(false);   // (the ☰ button exists for a portrait phone only)
      expect(r.me).not.toBeNull(); expect(r.overlaps).toEqual([]);
      expect(r.me.l).toBeGreaterThanOrEqual(0); expect(r.me.r).toBeLessThanOrEqual(r.vw); expect(r.me.t).toBeGreaterThanOrEqual(0); expect(r.me.b).toBeLessThanOrEqual(r.vh);
      expect(r.acts.filter((a) => a !== "report")[0]).toBe("jpyc");
      await tap('#klc-ui .tools [data-act="jpyc"]'); await slid(page);
      expect(await page.eval("document.getElementById('klc-jpyc').dataset.open")).toBe("1");
      await shot(page, "phone-landscape-toolbar");
      await page.eval("window.__jpyc.close(); 0"); await setViewport(page, PORTRAIT); await sleep(600);
    });

    T("no page errors, and the browser still asked JPYC EC and Google for nothing", async () => {
      expect(asked.ec).toEqual([]); expect(asked.maps).toEqual([]);
      expect(page.errors().filter((e) => !/api\/live/.test(e.text))).toEqual([]);
    });
  });
});
