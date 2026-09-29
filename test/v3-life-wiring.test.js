// [v3:life] Wiring-phase tests: the tour's beauty framings on the real TOUR stops, the night / overcast grade, the
// window-glow gain uniform, photo mode's 4K size, harbor's bollards for the cats, and the capture plan cameras.
import { describe, test, expect } from "bun:test";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import * as L from "../src/anime/world/layout.js";
import { createTime, GRADE } from "../src/anime/world/life/time.js";
import { windowGlow, WIN_GAIN } from "../src/anime/world/life/lights.js";
import { tourStops, FRAMES, createTour, HIDDEN_STOPS } from "../src/anime/world/life/tour.js";
import { photoSize } from "../src/anime/ui/photo.js";
import { stillPlan } from "../scripts/render/stills.js";

const ROOT = resolve(import.meta.dir, "..");
const read = (p) => readFileSync(resolve(ROOT, p), "utf8");
function fakeCtx() {
  return {
    L, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 30000), sunDir: new THREE.Vector3(0, 1, 0), services: {}, quality: { name: "high" },
    shared: { uTime: { value: 0 }, uWind: { value: new THREE.Vector2(0.9, 0.35) }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uGust: { value: 0.5 } },
  };
}

describe("tour on the real stops", () => {
  const harbor = { ukimido: { walk: [[341.6, -23.4], [341.6, -29.9], [341.6, -33.65]] } };
  const stops = tourStops(L, harbor);
  test("every layout TOUR stop is kept (except the hidden 唐桑), in order, with 浮見堂 after Pier 7", () => {   // [v3:fix] HIDDEN_STOPS
    const ids = stops.map((s) => s.id);
    expect(ids[0]).toBe("hero");
    for (const t of L.TOUR.filter((t) => t.id !== "bay" && !HIDDEN_STOPS.has(t.id))) expect(ids).toContain(t.id);
    expect(ids).not.toContain("karakuwa");
    expect(ids.indexOf("ukimido")).toBe(ids.indexOf("pier7") + 1);
  });
  test("beauty framings override the layout and stand on land / decks, not in the sea", () => {
    for (const [id, f] of Object.entries(FRAMES)) {
      const s = stops.find((x) => x.id === id);
      expect(s).toBeTruthy();
      if (f.drone) { expect(s.drone).toEqual(f.drone); expect(f.drone.pos[1]).toBeGreaterThan(L.groundAt(f.drone.pos[0], f.drone.pos[2]) + 10); }
      if (f.walk) { expect(s.walk).toEqual(f.walk); expect(L.isWater(f.walk.x, f.walk.z)).toBe(false); }
    }
  });
  test("the 浮見堂 walk looks along the walkway at the pavilion", () => {
    const u = stops.find((s) => s.id === "ukimido");
    expect(u.walk.x).toBeCloseTo(341.6, 1); expect(Math.abs(Math.abs(u.walk.yaw) - 180)).toBeLessThan(1);
  });
  test("createTour exposes the stops, jumpTo cuts to a drone framing", () => {
    const ctx = fakeCtx(); ctx.services.harbor = harbor;
    const T = createTour(ctx);
    expect(T.stops.length).toBe(stops.length);
    expect(T.jumpTo("ukimido")).toBe(true);
    expect(ctx.camera.position.toArray().map((v) => Math.round(v))).toEqual(FRAMES.ukimido.drone.pos);
    expect(T.current).toBe("ukimido");
  });
  test("every stop has JA and EN names in data/i18n.json", () => {
    const S = JSON.parse(read("data/i18n.json"));
    for (const s of stops) { expect(S.ja["v3.stop." + s.id]).toBeTruthy(); expect(S.en["v3.stop." + s.id]).toBeTruthy(); }
  });
});

describe("night and weather grade", () => {
  test("night drops the ambient and the moon, raises bloom/glow; day is untouched", () => {
    const day = createTime(fakeCtx(), { preset: "hiru" });
    const hemiDay = day.lights.hemi.intensity, bloomDay = day.palette.bloom;
    const ctx = fakeCtx(), T = createTime(ctx, { preset: "yoru" });
    const hemiNight = T.lights.hemi.intensity;
    T.grade.hemi = 1; T.grade.bloom = 0; T.setHours(19.5);
    expect(hemiNight).toBeCloseTo(T.lights.hemi.intensity * GRADE.hemi, 4);
    expect(GRADE.hemi).toBeLessThan(0.6);
    const again = createTime(fakeCtx(), { preset: "hiru" });
    expect(again.lights.hemi.intensity).toBeCloseTo(hemiDay, 6); expect(again.palette.bloom).toBeCloseTo(bloomDay, 6);
  });
  test("rain turns the painted sky grey-blue and kills the light leak", () => {
    const T = createTime(fakeCtx(), { preset: "yugata" });
    const z0 = T.palette.zenith.clone(), leak0 = T.palette.leak;
    T.setWeather({ cover: 0.95, rain: 0.8 });
    const z = T.palette.zenith, sat = (c) => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
    expect(sat(z)).toBeLessThan(sat(z0) * 0.6);
    expect(T.palette.leak).toBeLessThan(leak0 * 0.2);
  });
});

describe("windows, photo, cats, stills", () => {
  test("window glow gain is one shared uniform patched into every facade shader", () => {
    const ctx = fakeCtx(), W = windowGlow(ctx);
    const sh = { uniforms: {}, fragmentShader: "#include <common>\nvoid main(){}" };
    W.patch(sh);
    expect(sh.uniforms.uKlcWinGain).toBe(ctx.shared.uWinGain);
    expect(ctx.shared.uWinGain.value).toBe(WIN_GAIN);
    expect(sh.fragmentShader).toContain("uKlcWinGain * uKlcLamps");
  });
  test("photo mode is a 16:9 3840x2160 PNG at scale 1", () => {
    expect(photoSize(1)).toEqual({ w: 3840, h: 2160 });
    expect(photoSize(0.5)).toEqual({ w: 1920, h: 1080 });
    expect(read("src/anime/ui/hud.js")).toContain("takePhoto(");
  });
  test("harbor publishes free bollard caps and the cast seats cats on them", () => {
    expect(read("src/anime/world/harbor/world.js")).toMatch(/bollards: out\.bollards/);
    expect(read("src/anime/world/life/cast.js")).toContain("hs?.bollards");
  });
  test("stills use verified framings, including the night 浮見堂 walkway", () => {
    const names = stillPlan().map((s) => s.name);
    expect(names).toContain("ukimido_night");
    expect(names).toContain("promenade_peach");
  });
  test("no Math.random in the wiring files", () => {
    for (const f of ["src/anime/world/life/tour.js", "src/anime/world/life/cast.js", "src/anime/world/life/time.js", "src/anime/ui/photo.js", "src/anime/ui/hud.js"]) expect(read(f)).not.toMatch(/Math\.random\(/);
  });
});
