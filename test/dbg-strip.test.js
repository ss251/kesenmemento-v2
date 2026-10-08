// [ui-c] Row 1: the ?dbg=1 diagnostics strip (src/anime/ui/dbg.js, mobile review T0).
// The parsing and the text are pure; the mount runs against a tiny fake DOM; the wiring is pinned in main.js ("zero cost when off":
// the module is only reachable through a dynamic import behind the flag). The real page (numbers on a desktop, nothing without the
// flag, no extra request) is checked through the machine gate: tools/anime/ui-c-check.mjs --steps dbg.
import { describe, test, expect } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseUA, dbgText, readMeasures, mountDbg } from "../src/anime/ui/dbg.js";

const ROOT = resolve(import.meta.dir, "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const UA = {
  iphone18: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  iphone26: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
  ipad17: "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  ipadDesktop: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  macChrome: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36",
  chromeIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1",
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
};

describe("parseUA: the OS and the browser", () => {
  test("an iPhone: the iOS version from the UA, the Safari version from Version/", () => {
    expect(parseUA(UA.iphone18)).toEqual({ os: "iOS 18.0", browser: "Safari 18.0" });
  });
  test("iOS 26 freezes the OS in the UA at 18.x: the strip shows both numbers, and Safari 26 is the one to trust", () => {
    expect(parseUA(UA.iphone26)).toEqual({ os: "iOS 18.6", browser: "Safari 26.0" });
  });
  test("an iPad, an iPad that asks for the desktop site (Macintosh with touch points), Chrome on iOS", () => {
    expect(parseUA(UA.ipad17)).toEqual({ os: "iPadOS 17.5", browser: "Safari 17.5" });
    expect(parseUA(UA.ipadDesktop, 5)).toEqual({ os: "iPadOS (desktop UA)", browser: "Safari 17.5" });
    expect(parseUA(UA.chromeIos)).toEqual({ os: "iOS 18.0", browser: "Chrome-iOS 130.0" });
  });
  test("desktop Chrome and Android Chrome, and an empty UA", () => {
    expect(parseUA(UA.macChrome, 0)).toEqual({ os: "macOS 10.15.7", browser: "Chrome 154.0" });
    expect(parseUA(UA.macChrome.replace("Chrome/", "HeadlessChrome/"), 0)).toEqual({ os: "macOS 10.15.7", browser: "Chrome(headless) 154.0" });   // the gate's browser
    expect(parseUA(UA.android, 5)).toEqual({ os: "Android 14", browser: "Chrome 131.0" });
    expect(parseUA("")).toEqual({ os: "?", browser: "?" });
    expect(parseUA(undefined)).toEqual({ os: "?", browser: "?" });
  });
});

/** A phone in a Safari tab with the toolbars up: the page is 664 tall on an 844 screen. */
const phone = () => ({
  os: "iOS 18.6", browser: "Safari 26.0", dpr: 3, standalone: false,
  inner: [390, 844], vv: { w: 390, h: 664, scale: 1, top: 0 }, screen: [390, 844], html: [390, 844],
  boxes: { svh: 664, lvh: 844, dvh: 664, fixed: 844 }, safe: { top: 47, right: 0, bottom: 34, left: 0 }, orient: "portrait",
  canvas: { w: 488, h: 1055, cw: 390, ch: 844 }, hud: [390, 844], mem: { tex: 232, geo: 1234 }, calls: 449, tris: 3.7e6, tier: "phone",
  audio: { state: "running", session: "playback", resumes: 1 }, lost: 0, ready: 4321.4, up: 9000, fps: 58.6, heap: 155.2, build: "0.1.0+abc1234", errs: [], modErrors: 0,
});

describe("dbgText: what the strip prints", () => {
  test("every number the review asked for is on a line of its own: versions, inner vs visualViewport vs 100svh, safe areas, audio, time to ready", () => {
    const t = dbgText(phone()), lines = t.split("\n");
    expect(lines[0]).toBe("iOS 18.6  Safari 26.0  dpr 3  tab");
    expect(lines[1]).toBe("inner 390x844  vv 390x664 s1.00 y0  screen 390x844");
    expect(lines[2]).toBe("svh 664  lvh 844  dvh 664  fixed 844  doc 844  gap +180");
    expect(lines[3]).toBe("safe t47 r0 b34 l0  portrait");
    expect(lines[4]).toBe("canvas 488x1055  css 390x844  hud 390x844");
    expect(lines[5]).toBe("tex 232 geo 1234 calls 449 tris 3.70M  tier phone");
    expect(lines[6]).toBe("audio running  session playback  resumes 1  ctxlost 0");
    expect(lines[7]).toBe("ready 4321 ms  fps 59  heap 155 MB  build 0.1.0+abc1234");
    expect(lines.length).toBe(8);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(58);   // one row per line on a 390 px phone at 10 px monospace (the first screenshot wrapped a 66-character line)
  });
  test("a Home Screen install says so; while the page loads the last line counts up instead of reading ready; errors follow, last two only", () => {
    const m = { ...phone(), standalone: true, ready: null, up: 12345, errs: ["a", "b", "c"], modErrors: 2 };
    const lines = dbgText(m).split("\n");
    expect(lines[0]).toContain("HOME-SCREEN");
    expect(lines[7]).toBe("loading 12.3 s  fps 59  build 0.1.0+abc1234");
    expect(lines.slice(8)).toEqual(["! b", "! c", "! 2 module error(s): see __errors"]);
  });
  test("a browser without visualViewport, svh, audio or memory info prints dashes and never throws", () => {
    const bare = { os: "?", browser: "?", dpr: 1, standalone: false, inner: [800, 600], vv: null, screen: [undefined, undefined], html: [800, 600], boxes: {}, safe: {}, orient: null,
      canvas: null, hud: null, mem: null, calls: null, tris: null, tier: null, audio: {}, lost: 0, ready: null, up: null, fps: null, heap: null, build: "dev", errs: [] };
    const t = dbgText(bare);
    expect(t).toContain("vv n/a");
    expect(t).toContain("svh -  lvh -  dvh -  fixed -  doc 600");
    expect(t).not.toContain("gap");   // no svh, no comparison
    expect(t).toContain("canvas -  hud -");
    expect(t).toContain("audio -  session n/a");
    expect(t).not.toMatch(/NaN|undefined|null/);
  });
  test("a desktop shows the real window: inner equals the visual viewport and the svh box, so the gap is +0 (the strip's line for it)", () => {
    const d = { ...phone(), os: "macOS 10.15.7", browser: "Chrome 154.0", dpr: 2, inner: [1280, 720], vv: { w: 1280, h: 720, scale: 1, top: 0 }, screen: [1920, 1080],
      html: [1280, 720], boxes: { svh: 720, lvh: 720, dvh: 720, fixed: 720 }, safe: { top: 0, right: 0, bottom: 0, left: 0 }, orient: "landscape" };
    const lines = dbgText(d).split("\n");
    expect(lines[2]).toContain("gap +0");
    expect(lines[3]).toBe("safe t0 r0 b0 l0  landscape");
  });
});

// ------------------------------------------------------------------ fakes
const fakeEl = (css = "") => ({ style: { cssText: css }, attrs: {}, kids: [], textContent: "", removed: false,
  setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.kids.push(c); return c; }, remove() { this.removed = true; },
  addEventListener() {}, removeEventListener() {} });
function fakeEnv({ audio = true, ready = 4321 } = {}) {
  const boxes = [];
  const body = fakeEl();
  const doc = {
    body, documentElement: { clientWidth: 390, clientHeight: 844 },
    createElement(tag) {
      const e = fakeEl(); e.tagName = tag.toUpperCase();
      e.getBoundingClientRect = function () {
        const c = this.style.cssText;
        const h = /height:100svh/.test(c) ? 664 : /height:100lvh/.test(c) ? 844 : /height:100dvh/.test(c) ? 664 : /height:100%/.test(c) ? 844 : 0;
        return { width: 1, height: h };
      };
      boxes.push(e);
      return e;
    },
    getElementById(id) { return id === "klc-ui" ? { getBoundingClientRect: () => ({ width: 390, height: 844 }) } : body.kids.find((k) => k.id === id) || null; },
  };
  const listeners = {}, timers = [];
  const win = {
    innerWidth: 390, innerHeight: 844, devicePixelRatio: 3, screen: { width: 390, height: 844 },
    visualViewport: { width: 390, height: 664, scale: 1, offsetTop: 0 },
    navigator: { userAgent: UA.iphone26, maxTouchPoints: 5, audioSession: { type: "auto" } },
    matchMedia: (q) => ({ matches: /portrait/.test(q) }),
    getComputedStyle: () => ({ paddingTop: "47px", paddingRight: "0px", paddingBottom: "34px", paddingLeft: "0px" }),
    performance: { now: () => 9000, getEntriesByName: (n) => (n === "klc:ready" && ready !== null ? [{ startTime: ready }] : []) },
    __stats: { fps: 58.6 }, __errors: [],
    addEventListener(t, f) { (listeners[t] ||= []).push(f); }, removeEventListener(t, f) { listeners[t] = (listeners[t] || []).filter((x) => x !== f); },
    setInterval: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearInterval: (id) => { timers[id - 1] = null; },
  };
  const canvasListeners = {};
  const ctx = {
    renderer: { domElement: { width: 488, height: 1055, clientWidth: 390, clientHeight: 844, addEventListener(t, f) { (canvasListeners[t] ||= []).push(f); }, removeEventListener(t, f) { canvasListeners[t] = (canvasListeners[t] || []).filter((x) => x !== f); } },
      info: { memory: { textures: 232, geometries: 1234 }, render: { calls: 449, triangles: 3.7e6 } } },
    quality: { tier: "phone" },
    audio: audio ? { context: { state: "running" }, session: { type: "playback", resumes: 2 } } : null,
  };
  return { doc, win, ctx, listeners, canvasListeners, timers, boxes, body };
}

describe("readMeasures + mountDbg on a fake phone page", () => {
  test("readMeasures reads the page's own numbers, not constants", () => {
    const { doc, win, ctx } = fakeEnv();
    const probes = { svh: doc.createElement("div"), lvh: doc.createElement("div"), dvh: doc.createElement("div"), fixed: doc.createElement("div"), env: doc.createElement("div") };
    probes.svh.style.cssText = "height:100svh"; probes.lvh.style.cssText = "height:100lvh"; probes.dvh.style.cssText = "height:100dvh"; probes.fixed.style.cssText = "height:100%";
    const m = readMeasures({ win, doc, ctx, probes, errs: ["x"], lost: 1 });
    expect(m.os).toBe("iOS 18.6"); expect(m.browser).toBe("Safari 26.0");
    expect(m.inner).toEqual([390, 844]); expect(m.vv).toEqual({ w: 390, h: 664, scale: 1, top: 0 });
    expect(m.boxes).toEqual({ svh: 664, lvh: 844, dvh: 664, fixed: 844 });
    expect(m.safe).toEqual({ top: 47, right: 0, bottom: 34, left: 0 });
    expect(m.canvas).toEqual({ w: 488, h: 1055, cw: 390, ch: 844 }); expect(m.hud).toEqual([390, 844]);
    expect(m.mem).toEqual({ tex: 232, geo: 1234 }); expect(m.calls).toBe(449);
    expect(m.audio).toEqual({ state: "running", session: "playback", resumes: 2 });
    expect(m.ready).toBe(4321); expect(m.up).toBe(9000); expect(m.fps).toBe(58.6); expect(m.lost).toBe(1); expect(m.orient).toBe("portrait"); expect(m.tier).toBe("phone");
  });
  test("a HUD that is still display:none (the intro card is up) has no box: the strip says hud -, not 0x0", () => {
    const { doc, win, ctx } = fakeEnv();
    doc.getElementById = (id) => (id === "klc-ui" ? { getBoundingClientRect: () => ({ width: 0, height: 0 }) } : null);
    expect(readMeasures({ win, doc, ctx, probes: {}, errs: [], lost: 0 }).hud).toBeNull();
  });
  test("with no ready mark yet the strip is still loading; the audio session falls back to navigator.audioSession when the app has none", () => {
    const { doc, win, ctx } = fakeEnv({ audio: false, ready: null });
    const m = readMeasures({ win, doc, ctx, probes: {}, errs: [], lost: 0 });
    expect(m.ready).toBeNull(); expect(m.audio).toEqual({ state: null, session: "auto", resumes: 0 });
    expect(dbgText(m)).toContain("loading 9.0 s");
  });
  test("mountDbg: a fixed, pointer-transparent, aria-hidden strip with text, refreshed on a timer, removable, and idempotent", () => {
    const e = fakeEnv();
    const api = mountDbg(e.ctx, { win: e.win, doc: e.doc });
    expect(api.el.id).toBe("klc-dbg"); expect(api.el.attrs["aria-hidden"]).toBe("true");
    expect(api.el.style.cssText).toContain("position:fixed"); expect(api.el.style.cssText).toContain("pointer-events:none"); expect(api.el.style.cssText).toContain("env(safe-area-inset-top");
    expect(api.el.textContent).toContain("inner 390x844  vv 390x664 s1.00 y0");
    expect(api.el.textContent).toContain("gap +180");
    expect(e.timers.length).toBe(1); expect(e.timers[0].ms).toBe(500);
    // idempotent: a second mount returns the first strip (the doc finds it by id) and adds no timer
    e.body.kids.push(Object.assign(api.el, { id: "klc-dbg" }));
    expect(mountDbg(e.ctx, { win: e.win, doc: e.doc })).toBe(api);
    expect(e.timers.length).toBe(1);
    // errors and context losses reach the strip
    e.win.innerHeight = 700;
    e.listeners.error[0]({ message: "boom\n  at x" }); e.canvasListeners.webglcontextlost[0]();
    e.timers[0].fn();
    expect(api.el.textContent).toContain("inner 390x700");
    expect(api.el.textContent).toContain("! boom at x");
    expect(api.el.textContent).toContain("ctxlost 1");
    api.stop();
    expect(api.el.removed).toBe(true); expect(e.timers[0]).toBeNull();
    expect(e.listeners.error.length).toBe(0); expect(e.canvasListeners.webglcontextlost.length).toBe(0);
  });
});

describe("zero cost when off: the strip is only reachable through a dynamic import behind the flag", () => {
  const main = read("src/anime/main.js");
  test("main.js has no static import of ui/dbg.js; the one import() is guarded by ?dbg=1 and never runs in a shot frame", () => {
    expect(main).not.toMatch(/^import[^\n]*dbg\.js/m);
    const calls = main.match(/import\('\.\/ui\/dbg\.js'\)/g) || [];
    expect(calls.length).toBe(1);
    const line = main.split("\n").find((l) => l.includes("import('./ui/dbg.js')"));
    expect(line).toContain("params.get('dbg') === '1'");
    expect(line).toContain("!SHOT");
  });
  test("nothing else in src/anime imports it", () => {
    // (a walk, not a spawned grep: Bun 1.3.14's test runner returns empty output from Bun.spawnSync; generated data modules over 300 KB cannot import anything)
    const hits = [];
    const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f), st = statSync(p); if (st.isDirectory()) walk(p); else if (/\.(js|html)$/.test(f) && st.size < 300000 && p !== join(ROOT, "src/anime/ui/dbg.js") && /dbg\.js/.test(readFileSync(p, "utf8"))) hits.push(p.slice(ROOT.length + 1)); } };
    walk(join(ROOT, "src/anime"));
    expect(hits).toEqual(["src/anime/main.js"]);
  }, 30000);
  test("the time to ready is a performance mark main.js sets when the intro card turns ready, not a clock the strip reads", () => {
    expect(main).toContain("performance.mark('klc:ready')");
    expect(read("src/anime/ui/dbg.js")).toContain("getEntriesByName?.('klc:ready')");
  });
  test("deterministic: the strip uses neither Math.random nor the wall clock", () => {
    const src = read("src/anime/ui/dbg.js");
    expect(src).not.toMatch(/Math\.random\(|Date\.now\(|new Date\(/);
  });
});
