// [ui-a2] Row 15 in a real Chrome: the live chip and the arrivals panel say what is wrong with the feed. The states enter where the real data enters: a script injected before the page's own
// (Page.addScriptToEvaluateOnNewDocument) answers the page's fetch of /api/live and data/live/sample.json, exactly the boundary polish's `?toggle=1&data=` server used, so live.js, the HUD and the
// DOM are all real. States: a good answer, no weather block, a cached answer three hours old, a refresh that fails after a good answer, a feed that never answers (at the first load, on a phone),
// and the way back. Desktop 1440x900 first, then an iPhone-shaped page (390x844 @3x). Through the gate (one Chrome machine-wide):
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS KLC_E2E=1 KLC_E2E_PORT=9401 bun test <absolute path>/test/ui-a2-feed.e2e.test.js
// Every number it measures is printed as one `A2-FEED-METRICS {json}` line. A2_SHOTS=<dir> also saves a screenshot per state.
import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { buildAndServe, launch, phonePage, enterTown, center, fingers, sleep, ROOT } from "../tools/anime/pad-lib.mjs";

const RUN = process.env.KLC_E2E === "1" && process.env.KLC_GATE === "1";
const PORT = Number(process.env.KLC_E2E_PORT || 9401);
const SHOTS = process.env.A2_SHOTS || "";
const d = RUN ? describe : describe.skip;
const T = (name, fn) => test(name, fn, 240000);
const PORTRAIT = { width: 390, height: 844, dpr: 3, insets: { top: 47, bottom: 34, left: 0, right: 0 } };
const M = { build: "ui-a2-feed" };
const metric = (k, v) => { M[k] = v; return v; };
const WATCHDOG_MS = 15 * 60 * 1000;
const guard = (page, ms = 90000) => {
  const ev = page.eval;
  page.eval = (expr) => new Promise((res, rej) => {
    const t = setTimeout(() => { console.error("A2-FEED-METRICS " + JSON.stringify(M)); console.error(`ui-a2 feed e2e: the page did not answer within ${ms} ms, ending the run so the Chrome lock is released: ${String(expr).slice(0, 160)}`); process.exit(1); }, ms);
    ev(expr).then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
  });
  return page;
};

// ------------------------------------------------------------------ the feed's answers (built from the repo's own sample, like polish's scenarios)
const BASE = JSON.parse(readFileSync(join(ROOT, "data/live/sample.json"), "utf8"));
const clone = (o) => JSON.parse(JSON.stringify(o));
const jstToday = (now) => new Date(now + 9 * 3600e3).toISOString().slice(0, 10);
/** HH:MM in Japan time, the same rule the HUD uses. */
const jstHM = (ms) => { const dt = new Date(ms + 9 * 3600e3); return `${String(dt.getUTCHours()).padStart(2, "0")}:${String(dt.getUTCMinutes()).padStart(2, "0")}`; };
/** A fresh, real-looking live answer: the sample's twelve real rows and its weather, not flagged as a sample, fetched now. */
function liveAnswer(now) {
  const s = clone(BASE), iso = new Date(now).toISOString();
  s.sample = false; delete s.fixture; delete s.sampleNote; s.origins = { weather: "live", tide: "live", port: "live" }; s.updated = iso;
  s.weather.sample = false; s.weather.origin = "live"; s.weather.fetchedAt = iso; s.weather.observedAt = iso;
  s.tide.sample = false; s.tide.origin = "live"; s.port.sample = false; s.port.origin = "live"; s.port.fetchedAt = iso; s.port.date = jstToday(now);
  return s;
}
function answers(now) {
  const live = liveAnswer(now);
  const noweather = liveAnswer(now); noweather.weather = null;
  const stale = liveAnswer(now), at = now - 3 * 3600e3; stale.port.origin = "cache"; stale.origins.port = "cache"; stale.port.fetchedAt = new Date(at).toISOString();   // the co-op list came from the server's cache, three hours old
  return { payloads: { live, noweather, stale }, rows: live.port.arrivals.length, updatedHM: jstHM(now), staleHM: jstHM(at), weatherText: `☁ くもり ${Math.round(live.weather.temp)}℃` };
}
/** Injected before the page's scripts: /api/live answers by window.__feed.mode (live | noweather | stale | error), the sample is unreachable in 'error'. ?feed=<mode> picks the first one. */
const STUB = (payloads) => `(() => {
  const P = ${JSON.stringify(payloads)};
  window.__feed = { mode: new URLSearchParams(location.search).get('feed') || 'live', hits: [] };
  const orig = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (/\\/api\\/live(\\?|$)/.test(url)) {
      window.__feed.hits.push(window.__feed.mode);
      const p = P[window.__feed.mode];
      return Promise.resolve(p ? new Response(JSON.stringify(p), { status: 200, headers: { 'content-type': 'application/json' } }) : new Response('unavailable', { status: 503 }));
    }
    if (/data\\/live\\/sample\\.json/.test(url) && window.__feed.mode === 'error') return Promise.resolve(new Response('no sample', { status: 404 }));
    return orig(input, init);
  };
})();`;
/** What the chip and the panel show now, and the chip's box. */
const READ = `(() => {
  const q = (s) => document.querySelector(s), tag = q('#klc-ui [data-f=tag]'), tag2 = q('#klc-ui [data-f=tag2]'), c = q('#klc-ui .chip'), r = c.getBoundingClientRect(), search = q('#klc-x .xbar button[data-act=search]'), menu = q('#klc-ui .mbtn');
  const sr = search && search.getBoundingClientRect().width > 1 ? search.getBoundingClientRect() : null, mr = menu && menu.getBoundingClientRect().width > 1 ? menu.getBoundingClientRect() : null;
  return { status: window.__life.live.state.status, wx: q('#klc-ui [data-f=wx]').textContent, boats: q('#klc-ui [data-f=boats]').textContent.trim(), tag: tag.hidden ? null : tag.textContent, tag2: tag2.hidden ? null : tag2.textContent, tagClass: tag.className,
    rows: document.querySelectorAll('#klc-ui [data-f=list] li').length, row0: (q('#klc-ui [data-f=list] li') || { textContent: '' }).textContent,
    chipH: +r.height.toFixed(2), chipW: +r.width.toFixed(1), chipR: +r.right.toFixed(1), chipOverflow: c.scrollWidth > c.clientWidth + 1, searchL: sr ? +sr.left.toFixed(1) : null, menuL: mr ? +mr.left.toFixed(1) : null, vw: innerWidth, hits: window.__feed.hits.length };
})()`;
const SET = (mode) => `(async () => { window.__feed.mode = '${mode}'; await window.__life.live.refresh(); await new Promise((r) => setTimeout(r, 120)); return window.__life.live.state.status; })()`;

// (not gated: it needs no browser) the injected scripts are valid JavaScript, and the stub answers the way live.js reads it
describe("the feed stub of this file", () => {
  test("it parses, serves the payloads, 503s for a mode with none, and hides the sample in 'error'", async () => {
    const a = answers(Date.parse("2026-10-05T03:04:00Z"));
    expect(() => new Function(STUB(a.payloads))).not.toThrow(); expect(() => new Function("return " + READ)).not.toThrow(); expect(() => new Function("return " + SET("live"))).not.toThrow();
    const saved = { window: Object.getOwnPropertyDescriptor(globalThis, "window"), location: Object.getOwnPropertyDescriptor(globalThis, "location") };
    const win = { fetch: async (u) => new Response("orig:" + u) }; Object.defineProperty(globalThis, "window", { value: win, configurable: true, writable: true }); Object.defineProperty(globalThis, "location", { value: { search: "?feed=noweather" }, configurable: true, writable: true });
    try {
      new Function(STUB(a.payloads))();
      const r1 = await win.fetch("/api/live"); expect(r1.status).toBe(200); const j = await r1.json(); expect(j.weather).toBeNull(); expect(j.port.arrivals.length).toBe(a.rows);
      win.__feed.mode = "error"; expect((await win.fetch("/api/live")).status).toBe(503); expect((await win.fetch("data/live/sample.json")).status).toBe(404);
      win.__feed.mode = "stale"; const s = await (await win.fetch("/api/live?fixtures=0")).json(); expect(s.port.origin).toBe("cache");
      expect(await (await win.fetch("/somewhere/else.json")).text()).toBe("orig:/somewhere/else.json"); expect(win.__feed.hits).toEqual(["noweather", "error", "stale"]);
    } finally { for (const [k, v] of Object.entries(saved)) { if (v) Object.defineProperty(globalThis, k, v); else delete globalThis[k]; } }
    expect(a.updatedHM).toBe("12:04"); expect(a.staleHM).toBe("09:04"); expect(a.rows).toBe(12); expect(a.weatherText).toBe("☁ くもり 16℃");
  });
});

d("row 15: the feed's failure copy (real Chrome)", () => {
  let browser, srv, watchdog;
  const now = Date.now(), A = answers(now);
  beforeAll(async () => {
    watchdog = setTimeout(() => { console.error("A2-FEED-METRICS " + JSON.stringify(M)); console.error(`ui-a2 feed e2e: still running after ${WATCHDOG_MS / 60000} minutes: killing the browser so the Chrome lock is released`); process.exit(1); }, WATCHDOG_MS);
    ({ srv } = await buildAndServe(PORT));
    browser = await launch({ quiet: true });
  }, 330000);
  afterAll(async () => { clearTimeout(watchdog); console.log("A2-FEED-METRICS " + JSON.stringify(M)); await browser?.close(); srv?.stop(); }, 60000);

  d("desktop 1440x900", () => {
    let page;
    const shot = async (name) => { if (!SHOTS) return; mkdirSync(SHOTS, { recursive: true }); await page.shot(join(SHOTS, `feed-${name}-1440x900.png`)); };
    const open = async (on) => { const open = await page.eval(`document.querySelector('#klc-ui [data-act=arrivals]').getAttribute('aria-expanded') === 'true'`); if (open !== on) { await page.eval("document.querySelector('#klc-ui [data-act=arrivals]').click(); 0"); await sleep(350); } };
    beforeAll(async () => {
      page = guard(await browser.page({ width: 1440, height: 900, dpr: 1 }));
      await page.S("Page.addScriptToEvaluateOnNewDocument", { source: STUB(A.payloads) });
      await page.goto(`${srv.url}index.html?q=low&feed=live`);
      await page.waitFor("document.body.classList.contains('loaded')", { timeout: 280000 });
      await page.eval("document.getElementById('go').click()");
      await page.waitFor("document.body.classList.contains('playing')", { timeout: 20000 });
      await page.waitFor("window.__life && window.__life.hud && window.__life.live && window.__life.live.state.status === 'ok'", { timeout: 60000 });
      await sleep(1500);
    }, 330000);
    afterAll(async () => { await page?.goto("about:blank").catch(() => {}); }, 30000);

    T("a good answer: weather, the count and the green 実データ tag (the baseline); the chip is at least 34 px tall", async () => {
      const r = await page.eval(READ); metric("desktop.live", r); await open(true); await shot("live"); await open(false);
      expect(r).toMatchObject({ status: "ok", wx: A.weatherText, boats: "入船 12隻", tag: "実データ", tag2: "実データ", rows: A.rows });
      expect(r.tagClass).toContain("live"); expect(r.chipH).toBeGreaterThanOrEqual(34);
    });

    T("no weather block (JMA down, the co-op list fine): 天気情報なし beside the count, not 情報を取得中…", async () => {
      expect(await page.eval(SET("noweather"))).toBe("ok");
      const r = await page.eval(READ); metric("desktop.noWeather", r); await open(true); await shot("noweather"); await open(false);
      expect(r).toMatchObject({ status: "ok", wx: "天気情報なし", boats: "入船 12隻", tag: "実データ", rows: A.rows });
      expect(r.wx).not.toBe("情報を取得中…"); expect(r.chipH).toBeGreaterThanOrEqual(34);
    });

    T("a cached answer three hours old: キャッシュ HH:MM on the chip and the panel's header, the time of the cache (JST)", async () => {
      expect(await page.eval(SET("stale"))).toBe("ok");
      const r = await page.eval(READ); metric("desktop.cached", { ...r, expectedHM: A.staleHM }); await open(true); await shot("cached"); await open(false);
      expect(r).toMatchObject({ status: "ok", boats: "入船 12隻", tag: `キャッシュ ${A.staleHM}`, tag2: `キャッシュ ${A.staleHM}`, rows: A.rows });
      expect(r.tagClass).not.toContain("live"); expect(r.chipH).toBeGreaterThanOrEqual(34);
    });

    T("a refresh that fails after a good answer: the old weather, count and rows stay, labelled キャッシュ with the time of that answer, and the panel's header says the live feed is gone", async () => {
      expect(await page.eval(SET("live"))).toBe("ok");
      expect(await page.eval(SET("error"))).toBe("error");
      const r = await page.eval(READ); metric("desktop.failedRefresh", { ...r, expectedHM: A.updatedHM }); await open(true); await shot("failed-refresh"); await open(false);
      expect(r).toMatchObject({ status: "error", wx: A.weatherText, boats: "入船 12隻", tag: `キャッシュ ${A.updatedHM}`, tag2: `今日の情報なし · キャッシュ ${A.updatedHM}`, rows: A.rows });
      expect(r.tagClass).not.toContain("live"); expect(r.chipH).toBeGreaterThanOrEqual(34);
    });

    T("it recovers: the next good answer is 実データ again", async () => {
      expect(await page.eval(SET("live"))).toBe("ok");
      const r = await page.eval(READ); metric("desktop.recovered", r);
      expect(r).toMatchObject({ status: "ok", wx: A.weatherText, tag: "実データ", tag2: "実データ", rows: A.rows }); expect(r.tagClass).toContain("live");
    });

    T("the chip is the same height in every state (34 px at least): the tag coming and going moves nothing below it", async () => {
      const h = {};
      for (const [name, mode] of [["live", "live"], ["noweather", "noweather"], ["cached", "stale"], ["failedRefresh", "error"], ["live2", "live"]]) { await page.eval(SET(mode)); h[name] = (await page.eval(READ)).chipH; }
      metric("desktop.chipHeights", h);
      for (const v of Object.values(h)) expect(v).toBeGreaterThanOrEqual(34);
      expect(new Set(Object.values(h)).size).toBe(1);
    });

    T("English: Weather unavailable; the failed refresh reads Today's data unavailable · Cached HH:MM", async () => {
      await page.eval("document.querySelector('#klc-ui [data-act=lang]').click(); 0"); await sleep(400);
      await page.eval(SET("noweather")); const nw = await page.eval(READ);
      await page.eval(SET("live")); await page.eval(SET("error")); const fr = await page.eval(READ); await open(true); await shot("failed-refresh-en"); await open(false);
      await page.eval(SET("live")); await page.eval("document.querySelector('#klc-ui [data-act=lang]').click(); 0"); await sleep(400);
      metric("desktop.english", { noWeather: nw, failedRefresh: fr });
      expect(nw.wx).toBe("Weather unavailable"); expect(nw.tag).toBe("Real data");
      expect(fr.tag).toBe(`Cached ${A.updatedHM}`); expect(fr.tag2).toBe(`Today's data unavailable · Cached ${A.updatedHM}`);
    });

    T("no page errors", async () => { expect(page.errors().filter((e) => !/api\/live/.test(e.text))).toEqual([]); });
  });

  d("phone 390x844: a feed that never answers at the first load, then the way back", () => {
    let page, f;
    const shot = async (name) => { if (!SHOTS) return; mkdirSync(SHOTS, { recursive: true }); await page.shot(join(SHOTS, `feed-${name}-390x844.png`)); };
    const chip = async () => { const c = await center(page, "#klc-ui .chip"); expect(c && c.w > 1).toBeTruthy(); await f.tap(c.x, c.y); await sleep(450); };
    const isOpen = () => page.eval(`document.querySelector('#klc-ui [data-act=arrivals]').getAttribute('aria-expanded') === 'true'`);
    const view = async (name) => { if (!(await isOpen())) await chip(); await shot(name); await chip(); };
    beforeAll(async () => {
      page = guard(await phonePage(browser, PORTRAIT));
      await page.S("Page.addScriptToEvaluateOnNewDocument", { source: STUB(A.payloads) });
      f = await enterTown(page, `${srv.url}index.html?feed=error`);
      await page.waitFor("window.__life && window.__life.hud && window.__life.live && window.__life.live.state.status === 'error'", { timeout: 60000 });
      await sleep(1500);
      await page.waitFor("!window.__pad.hidden", { timeout: 20000 });
      await page.waitFor("!document.querySelector('#klc-pad .coach').hidden", { timeout: 6000 }).catch(() => {});
      await page.eval("window.__pad.dismissCoach()"); await sleep(800);
    }, 330000);
    afterAll(async () => { await f?.release?.().catch(() => {}); }, 30000);

    T("the API and the sample both fail at the first load: the chip says 今日の情報なし, no count, no tag, and the panel says it could not load arrivals; it fits beside the search and ☰ buttons", async () => {
      const r = await page.eval(READ); metric("phone.neverAnswered", r);
      await chip(); const row = await page.eval(READ); await shot("never-answered"); await chip();
      expect(r).toMatchObject({ status: "error", wx: "今日の情報なし", boats: "", tag: null, tag2: null });
      expect(row.row0).toBe("入船情報を取得できませんでした"); expect(row.rows).toBe(1);
      expect(r.chipH).toBeGreaterThanOrEqual(34); expect(r.chipOverflow).toBe(false);
      if (r.searchL != null) expect(r.chipR).toBeLessThan(r.searchL); if (r.menuL != null) expect(r.chipR).toBeLessThan(r.menuL);
    });

    T("then a good answer (the next poll): weather, count and 実データ; the chip keeps its height and its place", async () => {
      const before = (await page.eval(READ)).chipH;
      expect(await page.eval(SET("live"))).toBe("ok");
      const r = await page.eval(READ); metric("phone.live", r);
      expect(r).toMatchObject({ status: "ok", wx: A.weatherText, boats: "入船 12隻", tag: "実データ", rows: A.rows });
      expect(r.chipH).toBe(before);   // 34 px with no tag and 34 px with it (it was 27 and 32 on a phone)
      if (r.searchL != null) expect(r.chipR).toBeLessThan(r.searchL); if (r.menuL != null) expect(r.chipR).toBeLessThan(r.menuL);
      expect(r.chipOverflow).toBe(false);
    });

    T("no weather, a cached answer and a failed refresh all fit the top bar on a phone, at the same height, in their own words", async () => {
      const out = {};
      for (const [name, mode] of [["noWeather", "noweather"], ["cached", "stale"]]) {
        await page.eval(SET(mode)); out[name] = await page.eval(READ); await view(name);
      }
      await page.eval(SET("live")); await page.eval(SET("error")); out.failedRefresh = await page.eval(READ); await view("failed-refresh");
      metric("phone.states", out);
      expect(out.noWeather).toMatchObject({ wx: "天気情報なし", tag: "実データ" });
      expect(out.cached).toMatchObject({ tag: `キャッシュ ${A.staleHM}` });
      expect(out.failedRefresh).toMatchObject({ status: "error", tag: `キャッシュ ${A.updatedHM}`, tag2: `今日の情報なし · キャッシュ ${A.updatedHM}`, rows: A.rows });
      for (const [name, r] of Object.entries(out)) {
        expect([name, r.chipH >= 34, r.chipOverflow]).toEqual([name, true, false]);
        if (r.searchL != null) expect([name, r.chipR < r.searchL]).toEqual([name, true]); if (r.menuL != null) expect([name, r.chipR < r.menuL]).toEqual([name, true]);
      }
      expect(new Set(Object.values(out).map((r) => r.chipH)).size).toBe(1);
      await page.eval(SET("live"));
    });

    T("no page errors", async () => { expect(page.errors().filter((e) => !/api\/live|sample\.json/.test(e.text))).toEqual([]); });
  });
});
