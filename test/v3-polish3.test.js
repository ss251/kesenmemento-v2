// [v3:polish3] Polish round 3 checks (no browser): each review blocker pinned to a pure function, a headless build or
// the source. The frames themselves are verified by screenshot (docs/shots/v3_*.png).
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";

// DOM stubs (canvas drawing is a no-op), the same pattern as v3-town.test.js
class Ctx2D {
  constructor(c) { this.canvas = c; this.font = "10px sans-serif"; }
  measureText(t) { return { width: [...String(t)].length * 9 }; }
  createLinearGradient() { return { addColorStop() {} }; }
  createRadialGradient() { return { addColorStop() {} }; }
  createPattern() { return {}; }
  getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }; }
  putImageData() {}
}
const ctxProxy = (c) => new Proxy(new Ctx2D(c), { get(t, k) { if (k in t) return t[k]; return () => {}; }, set(t, k, v) { t[k] = v; return true; } });
class FakeCanvas { constructor() { this.width = 300; this.height = 150; this.style = {}; } getContext(t) { return t === "2d" ? (this._c ||= ctxProxy(this)) : null; } toDataURL() { return "data:,"; } addEventListener() {} }
globalThis.window ??= globalThis;
globalThis.document ??= { createElement: (t) => (t === "canvas" ? new FakeCanvas() : { style: {}, addEventListener() {}, appendChild() {}, setAttribute() {} }), fonts: { load: async () => [] }, body: { appendChild() {} }, addEventListener() {} };
globalThis.HTMLCanvasElement ??= FakeCanvas;
globalThis.innerWidth ??= 1280; globalThis.innerHeight ??= 720;

const THREE = await import("three");
const L = await import("../src/anime/world/layout.js");
const { createSky, skyPaletteAt } = await import("../src/anime/core/sky.js");
const { createContext } = await import("../src/anime/core/ctx.js");
const { buildReflection } = await import("../src/anime/world/harbor/reflect.js");
const { worldHeight } = await import("../src/anime/world/environment/terrain.js");
const { scatterPlan, buildScatter } = await import("../src/anime/world/environment/scatter.js");
const { FRAMES, tourStops } = await import("../src/anime/world/life/tour.js");
const { stillPlan } = await import("../scripts/render/stills.js");
const { fovFor, FOV } = await import("../src/anime/core/fov.js");   // [ui-c2] the portrait rule lives in core/fov.js now

const src = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const DEG = Math.PI / 180;
function makeCtx() {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 30000);
  const ctx = createContext({ scene, camera, renderer: null, audio: null, quality: { name: "high" }, sunDir: new THREE.Vector3(...L.SUN_DIR).normalize() });
  const u = (v) => ({ value: v });
  ctx.pipeline = { compMat: { uniforms: { uMist: u(0), uMistCol: u(new THREE.Color()), uExposure: u(1), uBloom: u(0), uGlow: u(0), uLeakK: u(1), uNight: u(0) } } };
  return ctx;
}
const skyWith = (ctx) => { const s = createSky(ctx.scene, new THREE.Vector3(0, 1, 0), {}); s.attach(ctx); ctx.sky = s; return s; };
const camAt = (pos, look, fov = 55, aspect = 16 / 9) => { const c = new THREE.PerspectiveCamera(fov, aspect, 0.1, 30000); c.position.set(...pos); c.lookAt(...look); c.updateMatrixWorld(); return c; };

describe("1. magic-hour clouds are painted heaps, not soap bubbles", () => {
  const sky = src("src/anime/core/sky.js");
  test("the backlit light leak is low and the lining traces the outer silhouette only", () => {
    expect(sky).toContain("float leak = (1.0 - smoothstep(0.0, 0.10, dens)) * 0.18 + smoothstep(Hh * 0.35, Hh * 1.05, y) * 0.15;");
    expect(sky).toContain("smoothstep(0.0, 0.025 + 0.015 * (1.0 - fwdK), dens)");
    expect(sky).not.toContain("smoothstep(0.0, 0.38, dens)) * 0.55");
  });
});

describe("2. no cloud heap is cut by the top of the frame", () => {
  test("the sky knows the frame's top edge: the hero drone's is ~10.8 deg up at the centre, lower at the corners", () => {
    const ctx = makeCtx(), sky = skyWith(ctx);
    const hd = FRAMES.hero.drone, cam = camAt(hd.pos, hd.look);
    sky.update(0, cam);
    const f = sky.uniforms.uFrame.value, top = (phi) => Math.atan(f.y * Math.cos(phi) / f.z) / DEG;
    const pitch = Math.atan2(hd.look[1] - hd.pos[1], Math.hypot(hd.look[0] - hd.pos[0], hd.look[2] - hd.pos[2])) / DEG;
    expect(top(0)).toBeCloseTo(pitch + 27.5, 3);
    expect(top(f.w)).toBeLessThan(top(0));
    expect(f.w / DEG).toBeGreaterThan(30); expect(f.w / DEG).toBeLessThan(50);   // the horizontal half-view at the top edge
    expect(f.x / DEG).toBeCloseTo(Math.atan2(hd.look[0] - hd.pos[0], -(hd.look[2] - hd.pos[2])) / DEG, 3);
  });
  test("the tiny planet's cube faces see the whole sky (no fitting)", () => {
    const ctx = makeCtx(), sky = skyWith(ctx), cam = camAt([0, 100, 0], [0, 0, 1], 90, 1);
    cam.userData.noSkyFrame = true; sky.update(0, cam);
    expect(sky.uniforms.uFrame.value.w).toBe(0);
    expect(src("src/anime/core/planet.js")).toContain("cam.userData.noSkyFrame = true");
  });
  test("a heap straddling the edge shrinks toward its base and fades out continuously; two tiers of heaps", () => {
    const sky = src("src/anime/core/sky.js");
    expect(sky).toContain("float fs = clamp((topEl - e0) / (1.45 * Hh), 0.0, 1.0);");
    expect(sky).toContain("fitA = smoothstep(0.3, 0.5, fs)");
    expect(sky).toContain("float e0 = high ? (upper ? 0.195 + 0.2 * s2 : 0.03 + 0.08 * s2) : 0.004 + 0.07 * s2;");
    expect(sky).toContain("(k == 11 && h21(vec2(fi, fk)) < 0.5)");   // 16: the orphan puff under a heap
  });
});

describe("3. the phone layout", () => {
  test("a portrait viewport keeps a ~64 deg horizontal view (capped at 88 deg vertical)", () => {
    // [ui-c2] the rule moved out of resize() into core/fov.js (one function for the screen and for photo mode); the pin follows it: resize() calls it, the module holds the same formula
    const m = src("src/anime/main.js"), f = src("src/anime/core/fov.js");
    expect(m).toContain("camera.fov = ctx.fovFor(camera.aspect);");
    expect(f).toContain("aspect < 1");
    expect(f).toContain("Math.min(FOV.portraitMax, 2 * Math.atan(Math.tan((FOV.portraitHorizontal * DEG2RAD) / 2) / aspect) * 180 / Math.PI)");
    expect(FOV).toEqual({ landscape: 55, portraitHorizontal: 64, portraitMax: 88 });
    const fov = (a) => Math.min(88, 2 * Math.atan(Math.tan(64 * DEG / 2) / a) / DEG);
    const hfov = (a) => 2 * Math.atan(Math.tan(fov(a) * DEG / 2) * a) / DEG;
    expect(hfov(390 / 844)).toBeGreaterThan(45);   // was ~28 deg at a fixed 55 deg vertical
    expect(fov(1.2)).toBeGreaterThan(55);          // (landscape keeps 55: the formula is only used below aspect 1)
    for (const a of [0.3, 390 / 844, 0.75, 0.999]) expect(fovFor(a)).toBe(fov(a));   // the module's function is that formula
    for (const a of [1, 1.2, 16 / 9, 3]) expect(fovFor(a)).toBe(55);
  });
  test("the hero stop has a portrait drone pose, tilted up; stops pick it on a portrait viewport only", () => {
    const P = FRAMES.hero.portrait, D = FRAMES.hero.drone;
    const dist = (f) => Math.hypot(f.look[0] - f.pos[0], f.look[2] - f.pos[2]);
    const pitch = (f) => Math.atan2(f.look[1] - f.pos[1], dist(f)) / DEG;
    expect(pitch(P)).toBeLessThan(pitch(D) - 5);   // steeper: the horizon (and 安波山) near the top of a tall frame
    expect(Math.hypot(P.pos[0] + 470, P.pos[2] + 1000)).toBeLessThan(Math.hypot(D.pos[0] + 470, D.pos[2] + 1000));   // closer to 安波山
    const saved = [globalThis.innerWidth, globalThis.innerHeight];
    try {
      globalThis.innerWidth = 390; globalThis.innerHeight = 844;
      expect(tourStops(L).find((s) => s.id === "hero").drone).toBe(FRAMES.hero.portrait);
      globalThis.innerWidth = 1600; globalThis.innerHeight = 900;
      expect(tourStops(L).find((s) => s.id === "hero").drone).toBe(FRAMES.hero.drone);
    } finally { [globalThis.innerWidth, globalThis.innerHeight] = saved; }
  });
});

describe("4. readable skipjack at the unloading", () => {
  const u = src("src/anime/world/harbor/unload.js");
  test("60 instanced 3D fish per sheet: navy back, silver belly, stripes, a white eye, a forked tail", () => {
    expect(u).toContain("const PER = 60");
    expect(u).toContain("new THREE.SphereGeometry(0.1, 14, 10).scale(3.25, 0.9, 0.75)");   // 0.65 m long
    for (const c of ["'#1c2440'", "'#aeb8c8'", "'#3a4666'", "x.lineWidth = 2.5", "'#ffffff'"]) expect(u).toContain(c);
    expect(u).toContain("new THREE.InstancedMesh(G_FISH_TAIL(), tailM, fishN)");
    expect(u).not.toContain("fix-unload-fish-2x");   // the old painted decal is gone
  });
  test("the market_unload still frames the fish rows and the crew from the quay edge", () => {
    const s = stillPlan().find((x) => x.name === "market_unload");
    expect(s.cam).toBe("665,4.6,853.2>652.6,2.4,850.8");
  });
});

describe("5. glass at night", () => {
  test("the reflected sky darkens and the pane thins at night", () => {
    const m = src("src/anime/core/materials.js");
    expect(m).toContain("vec3 sky = mix(uSkyLow, uSkyTop, smoothstep(-0.1, 0.6, R.y)) * mix(1.0, 0.16, uNight);");
    expect(m).toContain("a *= mix(1.0, 0.7, uNight);");
  });
  test("a lit pane is a room (furniture band, blinds, less glow at a grazing angle), not a light box", () => {
    const l = src("src/anime/world/life/lights.js");
    expect(l).toContain("glow *= 1.0 - 0.55 * fres;");
    expect(l).toContain("glow *= mix(0.42, 1.0, smoothstep(0.24, 0.32,");
  });
});

describe("6. painted reflections are never paler than the object", () => {
  function reflect(mat, hull = false) {
    const ctx = makeCtx(); ctx.sky = { uniforms: {} };
    const g = new THREE.Group(), m = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1).translate(0, 1, 0), mat);
    if (hull) m.userData.hull = true;
    g.add(m);
    const r = buildReflection(ctx, [g]);
    const c = r.mesh.geometry.attributes.color;
    return new THREE.Color(c.getX(0), c.getY(0), c.getZ(0));
  }
  test("a white textured material mirrors its map's tone (or the dark timber fallback), not white", () => {
    const tex = new THREE.CanvasTexture(new FakeCanvas());
    const c = reflect(new THREE.MeshToonMaterial({ color: "#ffffff", map: tex }));
    expect(c.getHexString()).toBe("5a4a40");
  });
  test("a plain white default is mirrored dark; a white hull stays white", () => {
    expect(reflect(new THREE.MeshToonMaterial({ color: "#ffffff" })).getHexString()).toBe("5a4a40");
    expect(reflect(new THREE.MeshToonMaterial({ color: "#ffffff" }), true).getHexString()).toBe("ffffff");
    expect(reflect(new THREE.MeshToonMaterial({ color: "#c0392b" })).getHexString()).toBe("c0392b");   // real paint is kept
  });
  test("the mirrored object is lit darker than the object", () => {
    expect(src("src/anime/world/harbor/reflect.js")).toContain("float lit = mix(0.7, 0.55, uDusk)");
    expect(src("src/anime/world/harbor/boats.js")).toContain("hull.userData.hull = true");
  });
});

describe("7-8. water and terrain edges", () => {
  test("the pale shoal lives on the fine core grid only", () => {
    expect(src("src/anime/world/water.js")).toContain("smoothstep(0.15, 0.6, hard)), 1.0 - coreK));");
  });
  test("no terrain wall at the south border: land falls to the sea over kilometres", () => {
    const F = L.ZONES.far;
    for (const dz of [20, 300, 900, 1500, 2500]) {
      let prev = null, maxS = 0;
      for (let x = -2000; x <= 6000; x += 35) { const h = worldHeight(x, F.z1 + dz); if (prev != null) maxS = Math.max(maxS, Math.abs(h - prev) / 35); prev = h; }
      expect(maxS).toBeLessThan(1.0);   // (natural DEM slopes stay under 45 deg; the hard x > 1500 switch was a vertical step of hundreds of metres)
    }
  });
});

describe("9. the season toggle and the live chip agree", () => {
  test("a season view names itself instead of today's weather", () => {
    const S = JSON.parse(src("data/i18n.json")), ja = S.ja || S, en = S.en;
    expect(ja["v3.season.view.winter"]).toBe("冬のすがた");
    expect(en["v3.season.view.winter"]).toBe("Winter view");
    for (const k of ["spring", "summer"]) { expect(ja["v3.season.view." + k]).toBeTruthy(); expect(en["v3.season.view." + k]).toBeTruthy(); }
    const h = src("src/anime/ui/hud.js");
    expect(h).toContain("seasonView = !!sid && sid !== 'autumn'");
    expect(h).toContain("t('v3.season.view.' + sid)");
  });
});

describe("10. rain hides the stars and the moon", () => {
  test("rain raises the cloud cover to overcast; the star and moon terms fade with it", () => {
    const ctx = makeCtx(), sky = skyWith(ctx);
    const T = { hours: 19.5, sunDir: new THREE.Vector3(0, -0.3, -1).normalize(), night: 1, dusk: 0, weather: { cloud: 0.35, rain: 1, fog: 0 } };
    sky.setTime(T); expect(sky.uniforms.uCloud.value).toBeGreaterThanOrEqual(0.95);
    sky.setTime({ ...T, weather: { cloud: 0.35, rain: 0, fog: 0 } }); expect(sky.uniforms.uCloud.value).toBeLessThan(0.55);
    const s = src("src/anime/core/sky.js");
    expect(s).toContain("smoothstep(0.02, 0.3, h) * (1.0 - smoothstep(0.55, 0.85, uCloud));");
    expect(s).toContain("float moonK = uNight * (1.0 - smoothstep(0.55, 0.85, uCloud));");
  });
});

describe("11-13. framings", () => {
  test("market drone low over the water off the berth, looking up the canopy to 安波山 (sun behind the camera)", () => {
    expect(FRAMES.market.drone).toEqual({ pos: [760, 28, 900], look: [575, 8, 715] });
    expect(L.isWater(760, 900)).toBe(true);
  });
  test("walk spots off the bare ground: かなえ pitch 4 yaw 14, 大島 8 m uphill, Pier 7 level; the layout agrees", () => {
    expect(FRAMES.kanae.walk).toMatchObject({ yaw: 14, pitch: 4 });
    expect(FRAMES.oshima.walk).toMatchObject({ x: 2776, z: 3244, pitch: 2 });
    expect(FRAMES.pier7.walk.pitch).toBe(1);
    expect(L.isWater(2776, 3244)).toBe(false);
    const o = L.TOUR.find((t) => t.id === "oshima"); expect([o.walk.x, o.walk.z]).toEqual([2776, 3244]);
  });
  test("promenade_peach stands on the deck", () => {
    expect(stillPlan().find((x) => x.name === "promenade_peach").cam).toBe("166,4.4,-117>150,5.2,-112");
  });
});

describe("14. 朝 reads as morning", () => {
  test("06:30 is a clear morning; pink stays in the pre-sunrise sky, and the mist does not cover the town", () => {
    const p = skyPaletteAt(6.5);
    expect("#" + p.zenith.getHexString()).toBe("#3f86d8");
    expect("#" + p.horizon.getHexString()).toBe("#efe0c8");
    expect("#" + p.fog.getHexString()).toBe("#d3e0ee");
    const dawn = skyPaletteAt(5.4);
    expect("#" + dawn.horizon.getHexString()).toBe("#f0b6a4");
    const ctx = makeCtx(), sky = skyWith(ctx), mist = ctx.pipeline.compMat.uniforms.uMist;
    sky.setHours(6.5); expect(mist.value).toBe(0); expect(sky.uniforms.uMorning.value).toBe(0);
    sky.setHours(5.35); expect(mist.value).toBeGreaterThan(0.05); expect(mist.value).toBeLessThan(0.2);
    sky.setHours(16.5); expect(mist.value).toBe(0); expect(sky.uniforms.uMorning.value).toBe(0);
    expect(src("src/anime/core/renderer.js")).toContain("float lowK = 1.0 - smoothstep(-2.0, uMistH, wy);");
    expect(src("src/anime/core/renderer.js")).toContain("smoothstep(900.0, 2000.0, dist)");
    expect(src("src/anime/world/water.js")).toContain("uMornW: sky?.uMorning");
  });
});

describe("12, 15. dressing at the bare walk spots", () => {
  test("the plan covers the 安波山 lookout and the two bridge spots", () => {
    expect(scatterPlan().map((s) => s.id)).toEqual(["anba", "kanae", "oshima"]);
  });
  test("a headless build: trees below the lookout, tufts and rocks at the bridges, none on water, lots or roads", () => {
    const ctx = makeCtx();
    const r = buildScatter(ctx, (x, z) => L.groundAt(x, z));
    expect(r.counts.cedar + r.counts.broad + r.counts.autumn).toBeGreaterThan(40);
    expect(r.counts.tuft).toBeGreaterThan(60); expect(r.counts.rock).toBeGreaterThan(10);
    const A = FRAMES.anba.walk, eye = L.groundAt(A.x, A.z);
    const anba = r.list.filter((t) => t.scatter === "anba");
    expect(anba.length).toBeGreaterThan(20);
    for (const t of anba) expect(t.y).toBeLessThan(eye - 2.5);   // below the rail, never in front of the lens
    for (const t of r.list) expect(L.isWater(t.x, t.z)).toBe(false);
    const again = buildScatter(makeCtx(), (x, z) => L.groundAt(x, z));
    expect(again.list).toEqual(r.list);   // seeded: identical every build
  });
  test("near the eye the painted autumn flecks are halved", () => {
    expect(src("src/anime/world/environment/terrain.js")).toContain("mix(0.5, 1.0, smoothstep(180.0, 420.0, length(vWp - cameraPosition)))");
  });
});

describe("16. the credit line reads on a light sky", () => {
  test("a shadow and a soft backing pill", () => {
    const s = src("src/anime/ui/style.js");
    expect(s).toContain("text-shadow: 0 1px 2px rgba(20, 30, 60, 0.45)");
    expect(s).toContain("background: rgba(18, 26, 52, 0.62)");   // [ui-b2:14] was rgba(24, 32, 62, 0.26): white on it was 1.9:1 over cloud, now 5.3
  });
});
