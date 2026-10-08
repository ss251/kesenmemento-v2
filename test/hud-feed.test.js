// [ui-a2] Row 15: the live chip and the arrivals panel say what is wrong with the feed, in their own words. A weather block that is missing is not "loading" (it said 情報を取得中… for as long as the
// page lived, beside a good boat count); a feed that failed is not silence (the count and the tag vanished and the old rows stayed on the board unlabelled); the old rows after a failed refresh
// carry キャッシュ HH:MM (the time of the last answer, JST); the chip is 34 px tall in every state. The real mountHud on a mini DOM (test/lib/mini-dom.js) with a live service whose state the
// test writes; the same states against the real feed boundary in a real Chrome: test/ui-a2.e2e.test.js (row 15).
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mountHud } from "../src/anime/ui/hud.js";
import { STRINGS } from "../src/anime/ui/i18n.js";
import { staleness } from "../src/anime/world/life/live.js";
import { CSS } from "../src/anime/ui/style.js";
import { makeDom } from "./lib/mini-dom.js";

const ROOT = resolve(import.meta.dir, "..");
const read = (p) => readFileSync(resolve(ROOT, p), "utf8");
const GLOBALS = ["document", "location", "localStorage", "addEventListener", "MutationObserver", "requestAnimationFrame", "setTimeout"];
const PRESETS = [{ id: "asa", h: 6.5 }, { id: "hiru", h: 12 }, { id: "yugata", h: 16.5 }, { id: "yuyake", h: 17.3 }, { id: "yoru", h: 19.5 }];
const ROWS = [
  { time: "10:30", vessel: "第三十八福寿丸", type: "まぐろ延縄", typeEn: "Tuna longline", catch: "メカジキ", catchEn: "Swordfish", kg: 1500 },
  { time: "11:10", vessel: "光", type: "さんま棒受網", typeEn: "Saury", catch: "サンマ", kg: 820 },
];
const J = STRINGS.ja, E = STRINGS.en;
/** The states the feed can be in, as the live service writes them (world/life/live.js). */
const S = {
  loading: () => ({ status: "loading", origin: null, sample: false, weather: null, arrivals: [], updated: null }),
  live: (o = {}) => ({ status: "ok", origin: "live", sample: false, stale: false, weather: { sky: "cloudy", temp: 16.4 }, arrivals: ROWS.slice(), updated: "2026-10-05T03:04:00.000Z", ...o }),
  noWeather: () => S.live({ weather: null }),
  // a refresh that failed: live.js sets status 'error' and leaves everything else as the last answer wrote it
  failedAfterAnswer: (o = {}) => ({ ...S.live(o), status: "error" }),
  failedFirst: () => ({ status: "error", origin: null, sample: false, weather: null, arrivals: [], updated: null, error: "/api/live 503" }),
};

function world(state = S.live(), { lang = null, season = null } = {}) {
  const dom = makeDom({ search: lang ? `?lang=${lang}` : "" });
  const saved = Object.fromEntries(GLOBALS.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)])), put = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  put("document", dom.document); put("location", dom.location); put("localStorage", dom.localStorage); put("addEventListener", dom.window.addEventListener);
  put("MutationObserver", dom.MutationObserver); put("requestAnimationFrame", (f) => { f(); return 1; }); put("setTimeout", () => 1);
  const cleanup = () => { for (const k of GLOBALS) { if (saved[k]) Object.defineProperty(globalThis, k, saved[k]); else delete globalThis[k]; } };
  try {
    const fns = new Set(), le = new Set();
    const T = { preset: "yugata", presets: PRESETS, clock: () => "16:30", set() {}, onChange: () => () => {} };
    const tour = { stops: [{ id: "hero", ja: "内湾", en: "Bay" }], current: "hero", playing: false, flying: false, stop() {}, play() {}, flyTo() {}, walkTo() { return true; }, onChange: (f) => (fns.add(f), () => fns.delete(f)) };
    const live = { state, onChange: (f) => (le.add(f), () => le.delete(f)), emit() { for (const f of [...le]) f(live); } };
    const hud = mountHud({ services: {} }, { time: T, tour, live, ...(season ? { season: { id: season, next() {} } } : {}) }, { force: true });
    const q = (s) => hud.el.querySelector(s);
    const set = (st) => { live.state = st; live.emit(); };
    /** What the chip and the panel show now. */
    const read = () => ({
      wx: q('[data-f="wx"]').textContent, boats: q('[data-f="boats"]').textContent, tag: q('[data-f="tag"]').hidden ? null : q('[data-f="tag"]').textContent, tag2: q('[data-f="tag2"]').hidden ? null : q('[data-f="tag2"]').textContent,
      tagClass: q('[data-f="tag"]').className, rows: hud.el.querySelectorAll('[data-f="list"] li').length, list: q('[data-f="list"]').textContent,
    });
    const snap = () => { const n = q("[data-f=note]"); n.textContent = ""; n.classList.remove("show"); return dom.serialize(hud.el); };
    return { dom, hud, q, set, read, snap, live, cleanup };
  } catch (e) { cleanup(); throw e; }
}
const withWorld = (state, fn, o) => { const w = world(state, o); try { return fn(w); } finally { w.cleanup(); } };

describe("the chip says what the weather is, or why it has none", () => {
  test("a good answer: weather, count and the green 実データ tag, as before", () => withWorld(S.live(), (w) => {
    expect(w.read()).toMatchObject({ wx: "☁ くもり 16℃", boats: "入船2隻", tag: J["v3.live"], tag2: J["v3.live"], rows: 2 });
    expect(w.read().tagClass).toContain("live");
  }));

  test("the first fetch has not answered: 情報を取得中… (that is the one place it is true), no count, no tag", () => withWorld(S.loading(), (w) => {
    expect(w.read()).toMatchObject({ wx: J["v3.loadingLive"], boats: "", tag: null, tag2: null });
    expect(J["v3.loadingLive"]).toBe("情報を取得中…");
  }));

  test("a good boat list and no weather block: the chip says 天気情報なし beside the count, never 情報を取得中… (it said that for as long as the page lived)", () => withWorld(S.noWeather(), (w) => {
    expect(w.read()).toMatchObject({ wx: "天気情報なし", boats: "入船2隻", tag: J["v3.live"] });
    expect(w.read().wx).not.toBe(J["v3.loadingLive"]);
    expect(J["v3.weather.none"]).toBe("天気情報なし"); expect(E["v3.weather.none"]).toBe("Weather unavailable");
  }));

  test("a feed that never answered (a dead API at the first load): the chip says 今日の情報なし, no count, no tag, and the panel says it could not load arrivals instead of 'no arrivals'", () => withWorld(S.failedFirst(), (w) => {
    const r = w.read();
    expect(r).toMatchObject({ wx: "今日の情報なし", boats: "", tag: null, tag2: null, rows: 1 });
    expect(r.list).toBe("入船情報を取得できませんでした"); expect(r.list).not.toBe(J["v3.arrivals.empty"]);
    expect(J["v3.feed.error"]).toBe("今日の情報なし"); expect(E["v3.feed.error"]).toBe("Today's data unavailable");
  }));

  test("a refresh that failed after a good answer: the old weather, count and rows stay, labelled キャッシュ with the time of that answer (JST), and the panel header says the live feed is gone", () => withWorld(S.failedAfterAnswer(), (w) => {
    expect(w.read()).toMatchObject({ wx: "☁ くもり 16℃", boats: "入船2隻", tag: "キャッシュ 12:04", tag2: "今日の情報なし · キャッシュ 12:04", rows: 2 });
    expect(w.read().tagClass).not.toContain("live");   // the amber tag, not the green one
  }));

  test("the time is the last answer's, in JST, whatever the machine's own zone is: 03:04 UTC reads 12:04; 15:30 UTC reads 00:30; 14:59 UTC reads 23:59", () => {
    for (const [iso, hm] of [["2026-10-05T03:04:00.000Z", "12:04"], ["2026-10-05T15:30:00.000Z", "00:30"], ["2026-10-05T14:59:30.000Z", "23:59"], ["2026-10-05T00:00:00.000Z", "09:00"]]) {
      withWorld(S.failedAfterAnswer({ updated: iso }), (w) => { expect([iso, w.read().tag]).toEqual([iso, "キャッシュ " + hm]); });
    }
  });

  test("a cached answer that was already old (live.js: stale, staleAt) keeps its own time, and a failed refresh after it keeps the older of the two (staleAt, not updated)", () => {
    const at = Date.parse("2026-10-05T02:01:00Z");   // 11:01 JST
    withWorld(S.live({ stale: true, staleAt: at }), (w) => { expect(w.read()).toMatchObject({ tag: "キャッシュ 11:01", tag2: "キャッシュ 11:01" }); });
    withWorld(S.failedAfterAnswer({ stale: true, staleAt: at }), (w) => { expect(w.read()).toMatchObject({ tag: "キャッシュ 11:01", tag2: "今日の情報なし · キャッシュ 11:01" }); });
    withWorld(S.live({ stale: true, staleAt: null }), (w) => { expect(w.read().tag).toBe("キャッシュ"); });   // (a stale list with no time to give: no time is made up)
    expect(staleness({ port: { origin: "cache", fetchedAt: "2026-10-05T02:01:00Z", date: "2026-10-05" }, origins: { port: "cache" } }, "live", Date.parse("2026-10-05T05:30:00Z")).at).toBe(at);   // (the shape the tag reads)
  });

  test("sample data stays サンプル whether or not the last refresh failed (it is the sample, not a cache of something live)", () => {
    withWorld(S.live({ sample: true, origin: "sample" }), (w) => { expect(w.read()).toMatchObject({ tag: "サンプル", tag2: "サンプル" }); });
    withWorld(S.failedAfterAnswer({ sample: true, origin: "sample" }), (w) => { expect(w.read()).toMatchObject({ tag: "サンプル", tag2: "サンプル" }); });
  });

  test("a failed refresh when the old answer had no weather says 天気情報なし, not the old loading text", () => withWorld(S.failedAfterAnswer({ weather: null }), (w) => {
    expect(w.read()).toMatchObject({ wx: "天気情報なし", boats: "入船2隻", tag: "キャッシュ 12:04" });
  }));

  test("a season view (春 / 夏 / 冬) still names itself in the chip, whatever the feed does: the feed's words are for today's weather, and that is not what the chip is showing then", () => {
    for (const st of [S.noWeather(), S.failedFirst(), S.failedAfterAnswer(), S.loading(), S.live()]) {
      withWorld(st, (w) => { expect([st.status, w.read().wx]).toEqual([st.status, J["v3.season.view.winter"]]); }, { season: "winter" });
    }
  });

  test("it recovers: every transition lands on the right words, and the nodes stay (a patch, never a rebuild)", () => withWorld(S.loading(), (w) => {
    const chip = w.q('[data-act="arrivals"]'), wx = w.q('[data-f="wx"]'), tag = w.q('[data-f="tag"]'), rendered = w.hud.el.htmlSets;
    const seq = [[S.live(), "☁ くもり 16℃", J["v3.live"]], [S.noWeather(), "天気情報なし", J["v3.live"]], [S.failedAfterAnswer(), "☁ くもり 16℃", "キャッシュ 12:04"], [S.live(), "☁ くもり 16℃", J["v3.live"]],
      [S.failedFirst(), "今日の情報なし", null], [S.live({ weather: { sky: "rain", temp: 9 } }), "☂ 雨 9℃", J["v3.live"]], [S.loading(), J["v3.loadingLive"], null]];
    for (const [st, wxText, tagText] of seq) { w.set(st); expect([st.status, w.read().wx, w.read().tag]).toEqual([st.status, wxText, tagText]); }
    expect(w.q('[data-act="arrivals"]')).toBe(chip); expect(w.q('[data-f="wx"]')).toBe(wx); expect(w.q('[data-f="tag"]')).toBe(tag); expect(w.hud.el.htmlSets).toBe(rendered);
  }));

  test("a patched HUD is the HUD a rebuild draws, in every state (the one function that writes the state is the one that patches it)", () => withWorld(S.loading(), (w) => {
    for (const [name, st] of [["live", S.live()], ["noWeather", S.noWeather()], ["failedAfterAnswer", S.failedAfterAnswer()], ["failedFirst", S.failedFirst()], ["loading", S.loading()], ["stale", S.live({ stale: true, staleAt: Date.parse("2026-10-05T02:01:00Z") })]]) {
      w.set(st); const patched = w.snap(); w.hud.render(); const rebuilt = w.snap();
      expect([name, patched === rebuilt]).toEqual([name, true]);
    }
  }));

  test("an idle sync after any of these states writes nothing (no state rewrites its own words)", () => withWorld(S.loading(), (w) => {
    for (const st of [S.noWeather(), S.failedFirst(), S.failedAfterAnswer()]) {
      w.set(st); const n = w.dom.writes.length; w.hud.syncState(); w.hud.syncState(); w.live.emit();
      expect(w.dom.writes.length).toBe(n);
    }
  }));
});

describe("English", () => {
  test("the three states read in English too: Weather unavailable; Today's data unavailable (and the panel's sentence); Cached 12:04 with the failure named in the header", () => {
    withWorld(S.noWeather(), (w) => { expect(w.read().wx).toBe("Weather unavailable"); expect(w.read().tag).toBe("Real data"); }, { lang: "en" });
    withWorld(S.failedFirst(), (w) => { expect(w.read()).toMatchObject({ wx: "Today's data unavailable", boats: "", tag: null }); expect(w.read().list).toBe(E["v3.arrivals.error"]); }, { lang: "en" });
    withWorld(S.failedAfterAnswer(), (w) => { expect(w.read()).toMatchObject({ tag: "Cached 12:04", tag2: "Today's data unavailable · Cached 12:04", wx: "☁ Cloudy 16℃" }); }, { lang: "en" });
  });
});

describe("the words and the box", () => {
  test("the new strings exist in both languages, are not empty, and differ from each other and from the loading text", () => {
    for (const k of ["v3.weather.none", "v3.feed.error", "v3.arrivals.error"]) { expect([k, typeof J[k], J[k]?.length > 0]).toEqual([k, "string", true]); expect([k, typeof E[k], E[k]?.length > 0]).toEqual([k, "string", true]); }
    const all = ["v3.weather.none", "v3.feed.error", "v3.arrivals.error", "v3.loadingLive", "v3.arrivals.empty"];
    expect(new Set(all.map((k) => J[k])).size).toBe(all.length); expect(new Set(all.map((k) => E[k])).size).toBe(all.length);
    expect(Object.keys(J).length).toBe(Object.keys(E).length);
  });

  test("the chip is 34 px tall at least, in every state: the tag coming and going no longer moves everything below it", () => {
    const rules = [...CSS.matchAll(/#klc-ui \.chip \{([^}]*)\}/g)].map((m) => m[1]);
    expect(rules.length).toBeGreaterThanOrEqual(2);   // the base rule and the phone's
    expect(rules[0]).toMatch(/min-height: 34px/);
    expect(rules[0]).toMatch(/display: inline-flex/); expect(rules[0]).toMatch(/align-items: center/);   // (the words stay in the middle of the 34 px)
    for (const r of rules) for (const m of r.matchAll(/min-height: (\d+)px/g)) expect(Number(m[1])).toBeGreaterThanOrEqual(34);   // (the phone's rule inherits it, or keeps it at least as tall)
  });

  test("the HUD reads no wall clock: the cached time comes from the data (determinism in ?shot=1 frames)", () => {
    const src = read("src/anime/ui/hud.js").split("\n").filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).join("\n").replace(/\/\/.*$/gm, "");
    expect(src).not.toMatch(/Date\.now|performance\.now|Math\.random|new Date\(\)/);
  });
});
