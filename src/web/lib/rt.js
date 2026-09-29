// Shared runtime hook registry, exposed as window.__RT (v2 contract: docs/research/V2-SPEC.md, §HOOKS in the v2 workflow).
// Rule: never reassign window.__RT — only assign properties on it — so status fields (read by the
// screenshot harnesses via JSON.stringify) and hook functions (called by UI, boats, portal, cinema scripts) coexist.
// The render pipeline (main.js) replaces the placeholder hooks below with real implementations at startup.

const g = typeof window !== "undefined" ? window : globalThis;
export const RT = (g.__RT ??= {});

const frameCbs = new Set();
const missing = (name) => () => { throw new Error(`__RT.${name} is not implemented yet (render pipeline has not registered it)`); };

Object.assign(RT, {
  ready: RT.ready ?? false,
  // per-frame callbacks (dt seconds, t seconds since start); main.js calls RT._tick every frame
  onFrame(cb) { frameCbs.add(cb); return () => frameCbs.delete(cb); },
  _tick(dt, t) { for (const cb of frameCbs) { try { cb(dt, t); } catch (e) { console.error("onFrame callback failed", e); } } },
});

// Placeholders (only set when absent, so hot paths that already registered keep theirs).
for (const name of ["setTime", "getTime", "setCamera", "setLook", "setWeather", "settle", "capture", "nightFactor"]) {
  RT[name] ??= missing(name);
}
RT.reveal ??= { set: missing("reveal.set"), play: missing("reveal.play") };
