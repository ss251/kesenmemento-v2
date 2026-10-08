// [v3:integrate] Integration tests: seasons (weights, blending, the snow patch, the terrain crown fractions), the
// tiny-planet wiring, the batching cells, the capture plan, the UI hooks and strings, content hygiene of the new files.
import { describe, test, expect } from "bun:test";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import * as L from "../src/anime/world/layout.js";
import { SEASONS, SEASON_INDEX, seasonWeights, seasonUniform, patchSnow, SEASON_GLSL } from "../src/anime/core/season.js";
import { createSeason } from "../src/anime/world/life/season.js";
import { FRAMES, HIDDEN_STOPS } from "../src/anime/world/life/tour.js";
import { stillPlan } from "../scripts/render/stills.js";
import I18N from "../data/i18n.json";

const ROOT = resolve(import.meta.dir, "..");
const read = (p) => readFileSync(resolve(ROOT, p), "utf8");
function rng(seed) { let s = 0; for (const c of String(seed)) s = (s * 31 + c.charCodeAt(0)) >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function fakeCtx() {
  const terrainU = { uAutumn: { value: 0.02 }, uSakura: { value: 0 } };   // [v5:fix1] the terrain default
  return {
    L, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 30000), quality: { name: "low" },
    services: { environment: { terrainMaterial: { userData: { uniforms: terrainU } } } }, rng, added: [],
    add(o) { this.added.push(o); }, noOutline(o) { o.layers.set(1); }, noBatch() {},
    shared: { uTime: { value: 0 }, uWind: { value: new THREE.Vector2(0.9, 0.35) }, uNight: { value: 0 } },
    terrainU,
  };
}

describe("seasons", () => {
  test("four seasons, autumn by default, one-hot weights", () => {
    expect(SEASONS.map((s) => s.id)).toEqual(["spring", "summer", "autumn", "winter"]);
    expect(seasonWeights("winter").toArray()).toEqual([0, 0, 0, 1]);
    expect(seasonWeights("nonsense").toArray()).toEqual([0, 0, 1, 0]);
    const shared = {};
    expect(seasonUniform(shared).value.toArray()).toEqual([0, 0, 1, 0]);
    expect(seasonUniform(shared)).toBe(shared.uSeason);
  });
  test("the controller blends over ~2.5 s and drives the terrain's 紅葉 / 山桜 fractions", () => {
    const ctx = fakeCtx();
    const S = createSeason(ctx, {});
    expect(S.id).toBe("autumn");
    expect(ctx.terrainU.uAutumn.value).toBeCloseTo(0.02, 5);   // [v5:fix1] 2 % painted 紅葉 (was 8.5 %)
    S.set("spring");
    S.update(1.25);
    const mid = ctx.shared.uSeason.value.toArray();
    expect(mid[0]).toBeGreaterThan(0.2); expect(mid[0]).toBeLessThan(0.8);
    expect(mid[0] + mid[1] + mid[2] + mid[3]).toBeCloseTo(1, 5);
    S.update(2);
    expect(ctx.shared.uSeason.value.toArray()).toEqual([1, 0, 0, 0]);
    expect(ctx.terrainU.uAutumn.value).toBe(0);
    expect(ctx.terrainU.uSakura.value).toBeGreaterThan(0.1);
    S.next(); expect(S.id).toBe("summer");
    S.set("winter", { instant: true });
    expect(ctx.shared.uSeason.value.w).toBe(1);
    expect(ctx.services.season).toBe(S);
    // particles: one instanced mesh, visible only in spring / winter
    const m = S.mesh; m.userData.update(); expect(m.visible).toBe(true);
    S.set("summer", { instant: true }); m.userData.update(); expect(m.visible).toBe(false);
  });
  test("the snow patch declares its uniform once and runs before the toon lighting", () => {
    const sh = { uniforms: {}, fragmentShader: "#include <common>\nvoid main(){\n#include <lights_toon_fragment>\n}" };
    const u = { value: new THREE.Vector4(0, 0, 0, 1) };
    patchSnow(sh, u, "vPWorld");
    patchSnow(sh, u, "vPWorld");
    expect(sh.uniforms.uSeasonS).toBe(u);
    expect(sh.fragmentShader.split("uniform vec4 uSeasonS;").length).toBe(2);
    expect(sh.fragmentShader.indexOf("klcSnowMix(diffuseColor.rgb")).toBeLessThan(sh.fragmentShader.lastIndexOf("#include <lights_toon_fragment>"));
    expect(SEASON_GLSL).toContain("vec3 klcSnowMix(");
    expect(SEASON_GLSL).toContain("vec3 klcSeasonGround(");
  });
  test("every cel material, the terrain, the trees, the facades and the water read the season", () => {
    expect(read("src/anime/core/materials.js")).toContain("patchSnow(shader, uSeason, 'vPWorld'");   // [r3:7] + the noDormant argument
    expect(read("src/anime/world/environment/terrain.js")).toContain("patchSnow(sh, uSeason, 'vWp')");
    expect(read("src/anime/world/environment/trees.js")).toContain("export function treeMaterial(");
    expect(read("src/anime/world/harbor/grove.js")).toContain("treeMaterial(ctx, true)");
    expect(read("src/anime/world/town/facade.js")).toContain("patchSnow(sh, seasonUniform(ctx.shared), 'vFacW'");   // [r3:7] + true: no dormant tan on facades
    expect(read("src/anime/world/water.js")).toContain("uSeasonW.w");
    // people, cats and gulls never get snow caps
    expect(read("src/anime/world/life/characters/human.js")).toContain("noSnow: true");
    expect(read("src/anime/world/harbor/gulls.js")).toContain("noSnow: true");
  });
});

describe("integration wiring", () => {
  test("tiny planet: pipeline renders into a target, main loop swaps it in, HUD button + O key", () => {
    expect(read("src/anime/core/renderer.js")).toContain("function render(scene, camera, sunDir, t, out = null)");
    const main = read("src/anime/main.js");
    expect(main).toContain("if (planet.active) planet.render(simT); else pipeline.render(");
    expect(main).toContain("window.__planet =");
    const hud = read("src/anime/ui/hud.js");
    expect(hud).toContain('data-act="planet"'); expect(hud).toContain("e.code === 'KeyO'");
    expect(hud).toContain('data-act="season"'); expect(hud).toContain("e.code === 'KeyK'");
  });
  test("batching cells are sized for the whole town", async () => {
    const main = read("src/anime/main.js");
    const m = main.match(/export const BATCH = \{ nearCell: (\d+), farCell: (\d+), farR: (\d+) \}/);
    expect(m).not.toBeNull();
    expect(Number(m[1])).toBeGreaterThanOrEqual(200);
    expect(Number(m[2])).toBeGreaterThan(Number(m[1]));
    expect(read("src/anime/core/batch2.js")).toContain("center = [0, 10]");
  });
  test("i18n: season and planet strings in both languages", () => {
    for (const lang of ["ja", "en"]) {
      for (const k of ["v3.season", "v3.planet", "v3.planet.note", ...SEASONS.flatMap((s) => ["v3.season." + s.id, "v3.season.short." + s.id])]) expect(typeof I18N[lang][k]).toBe("string");
      expect(I18N[lang]["v3.help"]).toMatch(/K /);
    }
  });
  test("capture plan: wet night streets, the tiny planet and two seasons, each reset after its frame", () => {
    const plan = stillPlan(), by = Object.fromEntries(plan.map((s) => [s.name, s]));
    for (const n of ["drone_1630", "promenade_peach", "market_morning", "ukimido_sunset", "night_bay", "whole_city", "tiny_planet", "spring_drone", "winter_drone"]) expect(by[n]).toBeTruthy();
    expect(by.night_bay.pre).toContain("wet"); expect(by.night_bay.post).toContain("wet: 0");
    expect(by.tiny_planet.post).toContain("__planet(false)");
    expect(by.winter_drone.post).toContain("autumn");
    expect(new Set(plan.map((s) => s.name)).size).toBe(plan.length);
  });
  test("tour framings: the hero walk spot stands on the promenade; 唐桑 is left out of the UI tour", () => {   // [v3:fix]
    const w = FRAMES.hero.walk;
    expect(L.isWater(w.x, w.z)).toBe(false);
    expect(Math.hypot(w.x - 168, w.z + 122)).toBeLessThan(1);
    expect(HIDDEN_STOPS.has("karakuwa")).toBe(true);
  });
  test("the page has an inline favicon (no 404 in the console)", () => {
    expect(read("src/anime/index.html")).toMatch(/<link rel="icon" href="data:image\/svg\+xml/);
  });
});

describe("hygiene of the integration files", () => {
  const files = ["src/anime/core/season.js", "src/anime/core/planet.js", "src/anime/world/life/season.js", "tools/anime/qa3.mjs", "tools/anime/sheet.mjs"];
  test("no Math.random", () => { for (const f of files) expect(read(f)).not.toMatch(/Math\.random\(/); });
  test("no references to the V3-SPEC section 5 exclusion list", () => {
    const bad = /\u6d25\u6ce2|\u9707\u707d|被災|復興|tsun[a]mi|earthquake|201[1]|3\.1[1]|慰霊|避難所|防潮堤/i;
    for (const f of files) expect(read(f)).not.toMatch(bad);
    for (const lang of ["ja", "en"]) for (const k of Object.keys(I18N[lang]).filter((k) => /^v3\.(season|planet)/.test(k))) expect(I18N[lang][k]).not.toMatch(bad);
  });
});
