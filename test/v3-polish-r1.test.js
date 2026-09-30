// [v3:polish] Polish round 1 checks (no browser): the review's blockers, each pinned to the source or to a pure function.
// Frames are verified by screenshot (docs/shots/v3_*.png); these keep the fixes from regressing.
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import * as L from "../src/anime/world/layout.js";
import { skyPaletteAt } from "../src/anime/core/sky.js";
import { stillPlan } from "../scripts/render/stills.js";
import { FRAMES } from "../src/anime/world/life/tour.js";
import { winterLook } from "../src/anime/world/life/cast.js";
import { planRafts, RAFT_LINE, RAFT_FIELDS, RAFT } from "../src/anime/world/harbor/rows.js";
import { BAY_LOOPS, BAY_MOORED, loopPose } from "../src/anime/world/harbor/traffic.js";

const src = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const hex = (c) => "#" + c.getHexString();

describe("1. market: skipjack and forklift", () => {
  const u = src("src/anime/world/harbor/unload.js");
  test("the fish sheet is 6.4 x 3.2 m; [v3:polish3] the skipjack on it are instanced 3D fish, not a decal", () => {
    expect(u).toContain("k.plane(6.4, 3.2, sheetM, [sx, top + 0.02, sz], [-Math.PI / 2, 0, rot])");
    expect(u).not.toContain("k.plane(3.2, 6.4, fishM");
    expect(u).toContain("new THREE.InstancedMesh(G_FISH_BODY(), fishM, fishN)");
  });
  test("the forklift has a slim open guard and the load sits on the tines at z 1.6", () => {
    expect(u).not.toContain("k.box(1.1, 0.06, 1.4, dark");
    expect(u).toContain("tub(k, M, 0, 0.445, 1.6, 0)");
    expect(u).toContain("new THREE.PointLight('#ffd7a8'");   // warm fill under the canopy
  });
});

describe("2. clouds: no sticker outlines, no orphan puffs", () => {
  const sky = src("src/anime/core/sky.js");
  test("thin rim band and a low rim gain", () => {
    expect(sky).toContain("smoothstep(0.0, 0.025 + 0.015 * (1.0 - fwdK), dens)");   // [v3:polish3] narrower: the outer silhouette only
    expect(sky).toContain("(0.18 + 0.25 * uDusk) * (1.0 + 1.2 * hp.g)");   // [v3:polish2] a visible warm lining on backlit heaps
    expect(sky).not.toContain("(0.35 + 0.5 * uDusk) * (1.0 + 1.2 * hp.g)");
  });
  test("only the base-row ends drop out; crown ends stay; tighter crown jitter; bigger high heaps", () => {
    expect(sky).toContain("if ((k == 5 && h21(vec2(fi, fk)) < 0.25) || (k == 11 && h21(vec2(fi, fk)) < 0.5)) continue;");   // [v3:polish3]
    expect(sky).toContain("(j1 - 0.5) * W * 0.25");
    expect(sky).toContain("float W = high ? (0.08 + 0.08 * s3)");
  });
});

describe("3. composition and bay life", () => {
  const plan = Object.fromEntries(stillPlan().map((s) => [s.name, s]));
  test("wow 6 is the whole bay from the north-west; the market frame is shot from the water", () => {
    expect(plan.whole_city.cam).toBe("-300,1500,-1800>1400,0,1600");
    const [pos] = plan.market_morning.cam.split(">"); const [x, , z] = pos.split(",").map(Number);
    expect(L.isWater(x, z)).toBe(true);
  });
  // [v4:polish1] rafts only where the aerial photo shows them: two fields outside the port basin, none in the 内湾
  test("the 養殖筏 fields: outside the inner bay, on water, 8 m clear of the shore", () => {
    const rafts = planRafts(L.isWater);
    expect(rafts.length).toBeGreaterThan(40);
    expect(rafts.length).toBeLessThanOrEqual(RAFT_FIELDS.reduce((a, f) => a + f.rows * f.cols, 0));
    for (const r of rafts) expect(L.shoreDist(r.x, r.z)).toBeGreaterThan(RAFT.len / 2 + 8);
    // nothing in the inner bay (the v3 line's box, and the whole basin north of 朝日町)
    for (const r of rafts) expect(r.z > 3000 && r.x > 1000).toBe(true);
    expect(rafts.some((r) => r.x > RAFT_LINE.a[0] - 50 && r.x < RAFT_LINE.b[0] + 50 && r.z > -50 && r.z < 100)).toBe(false);
  });
  test("small boats: moored at buoys on water; fishing loops stay 12 m off the shore all the way round", () => {
    for (const [x, z] of BAY_MOORED) expect(L.shoreDist(x, z)).toBeGreaterThan(20);
    expect(BAY_LOOPS.length).toBeGreaterThanOrEqual(2);
    for (const l of BAY_LOOPS) {
      const period = 2 * Math.PI * ((l.a + l.b) / 2) / l.speed;
      for (let k = 0; k < 64; k++) { const p = loopPose(l, (k / 64) * period); expect(L.shoreDist(p.x, p.z)).toBeGreaterThan(12); }
      expect(loopPose(l, 12.5)).toEqual(loopPose(l, 12.5));   // pure function of t (deterministic stills)
    }
  });
  test("water carries mid-distance detail", () => {
    const w = src("src/anime/world/water.js");
    expect(w).toContain("ruffle * 0.6 * farK");
    expect(w).toContain("swell * 0.3 * lod");   // [v4:polish2] 0.5 -> 0.3 (pale patches from the drone)
    expect(w).toContain("smoothstep(250.0, 2500.0, dist)");
    expect(w).toContain("line1 *= coreK;");
  });
});

describe("4. 浮見堂 reflection keeps its colour", () => {
  test("brighter mirrored colour, less sky wash, stronger", () => {
    const r = src("src/anime/world/harbor/reflect.js");
    expect(r).toContain("mix(0.7, 0.55, uDusk)");   // [v3:polish3] darker than the object, never lighter
    expect(r).toContain("0.18 + 0.2 * uNight");
    expect(src("src/anime/world/harbor/world.js")).toContain("strength: 0.85");
  });
});

describe("5. townspeople: shoes on the deck, coats in winter", () => {
  test("the promenade deck is a walkable surface at its own height", () => {
    expect(src("src/anime/world/harbor/quay.js")).toContain("ctx.physics.addWalkBox(c.x, c.z, deckW, len, rotY, top + 0.125)");
  });
  test("winterLook: coat, trousers and boots with its own key; work clothes stay", () => {
    const spec = { key: "townW3", seed: 403, outfit: { top: "cardigan", bottom: "skirt", legs: "#ecd0bc", shoes: { color: "#8a6a58" } } };
    const w = winterLook(spec);
    expect(w.key).toBe("townW3_w");
    expect(w.outfit.bottom).toBe("trousers");
    expect(w.outfit.top).toBe("jacket");
    expect(w.outfit.boots).toBeTruthy();
    expect(w.outfit.legs).toBeUndefined();
    expect(winterLook({ key: "fisher1", seed: 1, outfit: { apron: { color: "#d9733c" }, boots: {} } })).toBeNull();
  });
  test("planter blooms hide under the snow", () => {
    expect(src("src/anime/world/harbor/quay.js")).toContain("winterHide: true");
    expect(src("src/anime/core/materials.js")).toContain("transformed *= step(uSeasonH.w, 0.5);");
  });
});

describe("6. summer reads as summer", () => {
  test("a summer sky grade and a deeper summer ground", () => {
    const sky = src("src/anime/core/sky.js");
    expect(sky).toContain("const SUMMER = { zenith: new THREE.Color('#2f78d8')");
    expect(sky).toContain("y * 0.6 * (1 - night)");
    expect(src("src/anime/core/season.js")).toContain("c * vec3(0.72, 1.06, 0.70)");
  });
});

describe("7. night", () => {
  test("no daytime streaks on lit glass; one lit state per pane", () => {
    expect(src("src/anime/core/materials.js")).toContain("streak *= 1.0 - 0.9 * uNight;");
    const lt = src("src/anime/world/life/lights.js");
    expect(lt).toContain("float hw = lh_hash(pcell);");
    expect(lt).toContain("(1.0 - 0.9 * uNight);   // [v3:polish] no daytime streaks at night");
  });
  test("signs and the 浮見堂 plaque glow at night", () => {
    expect(src("src/anime/world/harbor/shrine.js")).toContain("color: '#e8d9a8'");
    expect(src("src/anime/world/harbor/shrine.js")).toContain("nightGlow: 0.4");
    expect(src("src/anime/world/town/shops.js")).toContain("nightGlow: 0.4");
  });
  test("brighter lamp streaks, denser stars, the moon clear of the wordmark", () => {
    expect(src("src/anime/world/water.js")).toContain("nl * 0.9 * (1.0 - foam)");
    const sky = src("src/anime/core/sky.js");
    expect(sky).toContain("step(0.955, r)");
    expect(sky).toContain("(0.7 + 0.3 * sin(uTime");
    expect(sky).toContain("MOON_AZ = -47 * Math.PI / 180");
  });
});

describe("8. 朝 06:30 is clear and warm", () => {
  test("the 06:30 keyframe", () => {
    const p = skyPaletteAt(6.5);
    // [v3:polish3] cooler zenith, pink horizon, pearl fog (+ a low mist in the composite): 朝 must not read as 16:30
    expect(hex(p.zenith)).toBe("#5f8fcf");
    expect(hex(p.horizon)).toBe("#f5cdbf");
    expect(hex(p.warm)).toBe("#ffc9ae");
    expect(hex(p.fog)).toBe("#e8d8dc");
    expect(p.sunI).toBeCloseTo(2.5, 5);
    expect(p.leak).toBeCloseTo(0.55, 5);
  });
});

describe("9. UI", () => {
  test("the key help hides below 1780 px; full season names in English; the phone intro keeps its gutter", () => {
    expect(src("src/anime/ui/style.js")).toContain("@media (max-width: 1780px)");
    const en = JSON.parse(src("data/i18n.json"));
    const flat = JSON.stringify(en);
    for (const w of ["Spring", "Summer", "Fall", "Winter"]) expect(flat).toContain(`"${w}"`);
    expect(flat).not.toContain('"Aut"');
    const html = src("src/anime/index.html");
    expect(html).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(html).toContain("min-width: 0; box-sizing: border-box");
  });
});

describe("10. walk spots", () => {
  test("the re-framed walk spots stand on land", () => {
    for (const id of ["pier7", "kanae", "anba"]) {
      const w = FRAMES[id].walk;
      expect(L.isWater(w.x, w.z)).toBe(false);
    }
    expect(FRAMES.kanae.walk.pitch).toBe(4);   // [v3:polish3] 12 -> 4: less empty sky
  });
  test("near autumn crowns fade (no smeared red strokes at the lookout)", () => {
    expect(src("src/anime/world/environment/terrain.js")).toContain("autumn *= smoothstep(25.0, 80.0, length(vWp - cameraPosition));");
  });
});
