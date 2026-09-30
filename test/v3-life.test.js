// [v3:life] Tests for the life package: time presets & night factor, light registry, walking paths, live data wiring,
// UI strings (JA/EN completeness), the tour film path, capture plans and token hygiene.
import { describe, test, expect } from "bun:test";
import { resolve, join } from "node:path";
import { readFileSync, readdirSync, statSync } from "node:fs";
import * as THREE from "three";
import * as L from "../src/anime/world/layout.js";
import { createTime, PRESETS, nightFromElevation, lampsFromElevation } from "../src/anime/world/life/time.js";
import { lights, windowGlow } from "../src/anime/world/life/lights.js";
import { buildPaths } from "../src/anime/world/life/paths.js";
import { normalizeArrivals, weatherRender } from "../src/anime/world/life/live.js";
import { createTour } from "../src/anime/world/life/tour.js";
import { stillPlan } from "../scripts/render/stills.js";
import { animePlan } from "../scripts/render/film.js";
import { sizeAllowed } from "../scripts/render/anime-page.js";

const ROOT = resolve(import.meta.dir, "..");
function fakeCtx() {
  const scene = new THREE.Scene();
  return {
    L, scene, camera: new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 30000), sunDir: new THREE.Vector3(0, 1, 0), services: {}, quality: { name: "high" },
    shared: { uTime: { value: 0 }, uWind: { value: new THREE.Vector2(0.9, 0.35) }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uGust: { value: 0.5 } },
  };
}

describe("time of day", () => {
  test("five presets at the spec hours", () => {
    expect(PRESETS.map((p) => [p.id, p.ja, +p.h.toFixed(3)])).toEqual([["asa", "朝", 6.5], ["hiru", "昼", 12], ["yugata", "夕方", 16.5], ["yuyake", "夕焼け", 17.333], ["yoru", "夜", 19.5]]);
  });
  test("night / lamps / dusk factors per preset", () => {
    const ctx = fakeCtx(), T = createTime(ctx, {});
    const at = (id) => { T.set(id, { instant: true }); return { night: T.night, lamps: T.lamps, dusk: T.dusk, el: T.sun.elevation }; };
    const hiru = at("hiru"), yugata = at("yugata"), yuyake = at("yuyake"), yoru = at("yoru"), asa = at("asa");
    expect(hiru.night).toBe(0); expect(hiru.lamps).toBe(0); expect(hiru.el).toBeGreaterThan(35);
    expect(yugata.night).toBe(0); expect(yugata.lamps).toBeLessThan(0.05); expect(yugata.dusk).toBeGreaterThan(0.3);
    expect(yuyake.el).toBeLessThan(1); expect(yuyake.lamps).toBeGreaterThan(0.2); expect(yuyake.lamps).toBeLessThan(0.97); expect(yuyake.night).toBeLessThan(0.3);
    expect(yoru.night).toBe(1); expect(yoru.lamps).toBe(1);
    expect(asa.el).toBeGreaterThan(0); expect(asa.night).toBe(0);
    expect(ctx.shared.uNight.value).toBe(asa.night);
    // key light never below the sky core's 13 deg cheat while the sun is up
    T.set("yugata", { instant: true }); expect(Math.asin(T.lightDir.y) * 180 / Math.PI).toBeGreaterThan(12.9);
  });
  test("transitions take the short way round the clock and land exactly", () => {
    const T = createTime(fakeCtx(), { preset: "yoru" });
    T.set("asa");                                         // 19:30 -> 06:30 goes forward through midnight (11 h), not back 13 h
    let maxH = 0; for (let i = 0; i < 40; i++) { T.update(0.1); maxH = Math.max(maxH, T.hours); }
    expect(maxH).toBeGreaterThan(20); expect(T.transitioning).toBe(false); expect(+T.hours.toFixed(4)).toBe(6.5); expect(T.preset).toBe("asa");
  });
  test("factors are monotone in elevation", () => {
    for (let e = -20; e < 20; e += 0.5) { expect(nightFromElevation(e)).toBeGreaterThanOrEqual(nightFromElevation(e + 0.5)); expect(lampsFromElevation(e)).toBeGreaterThanOrEqual(lampsFromElevation(e + 0.5)); }
  });
  test("weather dims the key light but never below 55%", () => {
    const T = createTime(fakeCtx(), { preset: "hiru" }); const clear = T.lights.sun.intensity;
    T.setWeather({ cover: 1, rain: 1 }); expect(T.lights.sun.intensity).toBeLessThan(clear); expect(T.lights.sun.intensity).toBeGreaterThan(clear * 0.55);
  });
});

describe("lights registry", () => {
  test("streetlights add glow, pool and a real-light candidate; boats follow objects", () => {
    const ctx = fakeCtx(), R = lights(ctx);
    expect(lights(ctx)).toBe(R);
    R.streetlight({ x: 100, y: 7, z: -100 }); R.lantern({ x: 101, y: 3, z: -100 }); R.aviation({ x: 0, y: 200, z: 0 });
    const h = R.boat(new THREE.Object3D(), { nav: { port: [1, 2, 0], starboard: [-1, 2, 0] }, deck: [[0, 3, 0]] });
    expect(R.pts.length).toBe(6); expect(R.pools.length).toBe(1); expect(R.reals.length).toBe(1); expect(h.items.length).toBe(3);
    expect(R.windowMaterial({ kind: "shop" })).toBe(R.windowMaterial({ kind: "shop" }));
    expect(R.lampMaterial()).toBe(R.lampMaterial());
  });
  test("windowGlow patches a shader with the helpers and shared uniforms", () => {
    const ctx = fakeCtx(), W = windowGlow(ctx), sh = { uniforms: {}, fragmentShader: "#include <common>\nvoid main() {}" };
    W.patch(sh);
    expect(sh.fragmentShader).toContain("vec3 klcWindowGlow(vec3 cell, float litFrac)"); expect(sh.uniforms.uKlcLamps).toBe(ctx.shared.uLamps);
  });
});

describe("walking paths", () => {
  const ctx = fakeCtx(), P = buildPaths(ctx), P2 = buildPaths(fakeCtx());
  test("promenade + sidewalks exist and are deterministic", () => {
    expect(P.paths.some((p) => p.kind === "promenade")).toBe(true);
    expect(P.paths.filter((p) => p.kind === "sidewalk").length).toBeGreaterThan(10);
    expect(JSON.stringify(P.paths.map((p) => p.pts))).toBe(JSON.stringify(P2.paths.map((p) => p.pts)));
  });
  test("nobody walks on the sea", () => {
    const o = {}; let wet = 0, n = 0;
    for (const p of P.paths) for (let s = 0; s <= p.len; s += 2) { P.at(p, s, o); n++; if (L.isWater(o.x, o.z)) wet++; }
    expect(wet / n).toBeLessThan(0.01);
  });
});

describe("live data", () => {
  const sample = JSON.parse(readFileSync(join(ROOT, "data/live/sample.json"), "utf8"));
  test("the saved fallback is flagged sample and parses into a boat list", () => {
    expect(sample.sample).toBe(true);
    const list = normalizeArrivals(sample.port);
    expect(list.length).toBeGreaterThan(3);
    for (const a of list) { expect(typeof a.vessel).toBe("string"); expect(a.vessel.length).toBeGreaterThan(1); expect(a.time).toMatch(/^\d\d:\d\d$/); }
  });
  test("weather render block drives cover / rain / wind", () => {
    const w = weatherRender(sample.weather);
    expect(w.cover).toBeGreaterThanOrEqual(0); expect(w.cover).toBeLessThanOrEqual(1); expect(w.rain).toBeGreaterThanOrEqual(0);
    const T = createTime(fakeCtx(), { preset: "hiru" }); T.setWeather(w); expect(T.weather.cloud).toBe(w.cover);
    expect(weatherRender(null)).toBe(null);
  });
});

describe("UI strings", () => {
  const S = JSON.parse(readFileSync(join(ROOT, "data/i18n.json"), "utf8"));
  test("JA and EN have exactly the same keys, none empty", () => {
    expect(Object.keys(S.ja).sort()).toEqual(Object.keys(S.en).sort());
    for (const l of ["ja", "en"]) for (const [k, v] of Object.entries(S[l])) expect(String(v).trim().length, `${l}.${k}`).toBeGreaterThan(0);
  });
  test("every key the v3 UI uses exists; attribution names the sources", () => {
    const src = readFileSync(join(ROOT, "src/anime/ui/hud.js"), "utf8") + readFileSync(join(ROOT, "src/anime/world/life/index.js"), "utf8");
    const keys = [...src.matchAll(/[^a-zA-Z]t\('([a-zA-Z0-9.]+)'/g)].map((m) => m[1]).filter((k) => !k.endsWith('.')).concat(PRESETS.map((p) => "v3.time." + p.id), ["v3.stop.hero", "v3.stop.market", "v3.attribution"]);
    for (const k of keys) { expect(S.ja[k], k).toBeTruthy(); expect(S.en[k], k).toBeTruthy(); }
    for (const w of ["国土地理院", "気象庁", "気仙沼漁協", "Sakuragaoka Station (MIT)", "Kenton-GMI"]) expect(S.ja["v3.attribution"]).toContain(w);
    expect(S.ja["v3.wordmark"]).toBe("気仙沼 リビングシティ"); expect(S.ja["v3.sample"]).toBe("サンプル");
  });
});

describe("tour and capture", () => {
  test("the film path is a pure function of t", () => {
    const tour = createTour(fakeCtx());
    const a = tour.filmPose(12.3), b = tour.filmPose(12.3);
    expect(a).toEqual(b); expect(tour.filmPose(0).pos).toEqual([620, 260, 420]);
    expect(tour.stops[0].id).toBe("hero"); expect(tour.stops.length).toBeGreaterThan(4);
  });
  test("stills cover the six wow frames; film is 900 frames at 30 fps; 4K waits for the machine caps", () => {
    const names = stillPlan().map((s) => s.name);
    for (const n of ["drone_1630", "promenade_peach", "market_morning", "ukimido_sunset", "night_bay", "whole_city"]) expect(names).toContain(n);
    const p = animePlan({ size: "4k" }); expect(p.frames.length).toBe(900); expect([p.width, p.height]).toEqual([3840, 2160]); expect(p.frames[450].t).toBe(15);
    expect(sizeAllowed("4k", Date.parse("2026-09-30T12:00:00Z")).ok).toBe(true);   // approved 02:00Z-14:00Z window
    expect(sizeAllowed("4k", Date.parse("2026-09-30T00:30:00Z")).ok).toBe(false);
    expect(sizeAllowed("4k", Date.parse("2026-09-30T15:00:00Z")).ok).toBe(false);
    expect(sizeAllowed("4k", Date.parse("2026-10-01T00:00:01Z")).ok).toBe(true);
    expect(sizeAllowed("1080", Date.parse("2026-09-30T12:00:00Z")).ok).toBe(true);
  });
});

describe("token hygiene", () => {
  test("no secrets in the life package, the UI or the capture scripts", () => {
    const files = [];
    const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(js|mjs|json)$/.test(f)) files.push(p); } };
    for (const d of ["src/anime/world/life", "src/anime/ui", "scripts/render", "scripts/live"]) walk(join(ROOT, d));
    const bad = /(sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|Bearer\s+[A-Za-z0-9._-]{20,}|ghp_[A-Za-z0-9]{30,})/;
    for (const f of files) expect(bad.test(readFileSync(f, "utf8")), f).toBe(false);
  });
});
