// [v3:polish2] Polish round 2 checks (no browser): the market worker stands clear of the fish boxes, the 浮見堂 mirror
// culls the lit tops and shades the undersides, a thin shoal that goes dark at night, backlit cumulus with an internal
// tone, the re-framed wow 1 / HUD hero view, conveyors only over a moored hull, the tiny planet inside the frame, the
// 安波山 / Pier 7 walk spots, the Places list folding after a pick, a readable HUD subtitle, the market still's framing.
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { FRAMES } from "../src/anime/world/life/tour.js";
import { stillPlan } from "../scripts/render/stills.js";

const src = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

describe("fish market: crew and conveyors", () => {
  const unload = src("src/anime/world/harbor/unload.js");
  test("every carry / work crew spot stands clear of the quay-side box stacks and the stack collider", () => {
    // box stacks (unload.js): x = -3.2 - (i % 2) * 0.8, z = -13 + i * 1.1, half width 0.32 m; figure radius 0.26 m
    const stacks = Array.from({ length: 9 }, (_, i) => [-3.2 - (i % 2) * 0.8, -13 + i * 1.1]);
    const crew = [...unload.matchAll(/\[(-?[\d.]+), (-?[\d.]+), -?\d+, '(\w+)'\]/g)].map((m) => [+m[1], +m[2], m[3]]);
    expect(crew.length).toBe(8);
    for (const [x, z] of crew) for (const [sx, sz] of stacks) {
      expect(Math.max(Math.abs(x - sx), Math.abs(z - sz)) > 0.32 + 0.26).toBe(true);
    }
    // the physics box c1 spans x -4.5..-2.7, z -13.8..-3.4 (centre -3.6/-8.6, 1.8 x 10.4)
    for (const [x, z] of crew) {
      const inside = x > -4.5 - 0.26 && x < -2.7 + 0.26 && z > -13.8 - 0.26 && z < -3.4 + 0.26;
      expect(inside).toBe(false);
    }
    expect(unload).toContain("[-5.4, -9.8, 150, 'carry']");
  });
  const market = src("src/anime/world/harbor/market.js"), world = src("src/anime/world/harbor/world.js");
  test("the apron conveyor is short (ends ~1.7 m past the quay edge) and its legs stand on the quay", () => {
    const body = market.slice(market.indexOf("function conveyor("), market.indexOf("function jibCrane("));
    expect(body).toContain("const len = 4.2, ang = 0.14");
    const cx = -1.5 + Math.cos(0.14) * 4.2 / 2 - 1;
    expect(cx + Math.cos(0.14) * 4.2 / 2).toBeLessThan(1.8);   // the belt's far end, metres past the quay edge (x = 0)
    const legs = [...body.matchAll(/for \(const x of \[([^\]]+)\]\)/g)].flatMap((m) => m[1].split(",").map(Number));
    expect(legs.length).toBe(2);
    for (const x of legs) expect(x).toBeLessThanOrEqual(0);
  });
  test("conveyors are placed after mooring, only where a hull lies alongside; tub rows elsewhere", () => {
    expect(market).toContain("(out.conveyorSlots ||= []).push(");
    expect(market).toMatch(/export function finishConveyors\(ctx, out, boats\)/);
    expect(world).toContain("finishConveyors(ctx, out.market, out.boats)");
    // mooring runs before the call
    expect(world.indexOf("finishConveyors(ctx, out.market")).toBeGreaterThan(world.indexOf("for (const bth of out.berths)"));
  });
});

describe("浮見堂 reflection", () => {
  const reflect = src("src/anime/world/harbor/reflect.js");
  test("back faces only (mirroring flips the winding), depth written", () => {
    expect(reflect).toContain("side: THREE.BackSide");
    expect(reflect).toContain("depthWrite: true");
    expect(reflect).not.toContain("THREE.DoubleSide");
  });
  test("undersides seen in the mirror are shaded", () => {
    expect(reflect).toContain("cross(dFdx(vW), dFdy(vW))");
    expect(reflect).toMatch(/lit \*= mix\(1\.0, 0\.36, under\)/);
  });
});

describe("water: the shoal", () => {
  const water = src("src/anime/world/water.js");
  test("a thin band hugging the core-grid shore, narrower off it", () => {
    expect(water).toContain("smoothstep(mix(1.5, 3.0, coreK), mix(3.0, 5.5, coreK), d)");
    expect(water).not.toContain("smoothstep(7.0, 10.0, d), smoothstep(0.15, 0.6, hard)");
    // coreK is computed before it is used
    expect(water.indexOf("float coreK")).toBeLessThan(water.indexOf("mix(1.5, 3.0, coreK)"));
    expect(water.split("float coreK").length - 1).toBe(1);
  });
  test("no glowing shoal at night; stronger near ripples", () => {
    expect(water).toContain("col = mix(col, uMid, (1.0 - smoothstep(7.0, 10.0, d)) * uNightW * 0.8);");
    expect(water).toContain("ripL = band * nearR * (0.55 +");
  });
});

describe("sky: backlit cumulus", () => {
  const sky = src("src/anime/core/sky.js");
  test("deeper body tone, a visible warm lining, and an internal tone from the puff seams", () => {
    expect(sky).toContain("0.45 - 0.1 * hp.g");
    expect(sky).toContain("(0.18 + 0.25 * uDusk) * (1.0 + 1.2 * hp.g)");
    expect(sky).toContain("litK += (1.0 - fwdK) * leak;");
    // the internal tone is added before the underside darkening
    expect(sky.indexOf("litK += (1.0 - fwdK) * leak;")).toBeLessThan(sky.indexOf("// lavender underside"));
  });
  test("tall heaps are not sliced flat at the top", () => {
    expect(sky).toContain("y > Hh * 1.6");
  });
});

describe("framings", () => {
  const plan = Object.fromEntries(stillPlan().map((s) => [s.name, s]));
  const spec = (d) => `${d.pos.join(",")}>${d.look.join(",")}`;
  test("wow 1 uses the explicit hero framing, mirrored in the tour (and the HUD's 'hero' view)", () => {
    expect(plan.drone_1630.cam).toBe(spec(FRAMES.hero.drone));
    expect(FRAMES.hero.drone.pos).toEqual([428, 126, 130]);
    const main = src("src/anime/main.js");
    expect(main).toContain("stops?.find((x) => x.id === 'hero')?.drone || L.HERO.drone");
    // tilted down more than the old hero (400,95,90 > 80,10,-220)
    const pitch = ({ pos, look }) => Math.atan2(look[1] - pos[1], Math.hypot(look[0] - pos[0], look[2] - pos[2]));
    expect(pitch(FRAMES.hero.drone)).toBeLessThan(pitch({ pos: [400, 95, 90], look: [80, 10, -220] }) - 2 * Math.PI / 180);
  });
  test("安波山: 1.1 m nearer the rail along the view, looking down", () => {
    const a = FRAMES.anba.walk, old = { x: -491.5, z: -986.8 };
    expect(a.pitch).toBe(-10);
    const d = Math.hypot(a.x - old.x, a.z - old.z);
    expect(d).toBeGreaterThan(1.0); expect(d).toBeLessThan(1.3);
    // the move is along the -128 degree yaw (yaw 0 = -Z, 90 = -X)
    const y = a.yaw * Math.PI / 180, fx = -Math.sin(y), fz = -Math.cos(y);
    expect(((a.x - old.x) * fx + (a.z - old.z) * fz) / d).toBeGreaterThan(0.98);
  });
  test("Pier 7 looks down the quay at the moored row, level ([v3:polish3] -4 -> +1: the blank slab left the frame)", () => {
    expect(FRAMES.pier7.walk.pitch).toBe(1);
    expect(FRAMES.pier7.walk.yaw).toBeLessThan(-75);   // east, along the 南町 south quay's boats
  });
  test("market morning moved 2 m to the right of its old camera", () => {
    const [a] = plan.market_morning.cam.split(">").map((p) => p.split(",").map(Number));
    expect(Math.hypot(a[0] - 688, a[2] - 892)).toBeGreaterThan(1.8);
    expect(a[0]).toBeGreaterThan(688);
  });
});

describe("UI", () => {
  test("the tiny planet fits the frame (disc ~0.88 of the height)", () => {
    expect(src("src/anime/core/planet.js")).toContain("uZoom: { value: 0.44 }");
  });
  test("picking a tour stop folds the Places list (the stored preference stays)", () => {
    const hud = src("src/anime/ui/hud.js");
    const br = hud.slice(hud.indexOf("else if (act === 'stop')"), hud.indexOf("else if (act === 'auto')"));
    expect(br).toContain("ui.placesOpen = false;");
    expect(br).not.toContain("store.set");
  });
  test("the HUD subtitle has a navy outline shadow and a heavier weight", () => {
    const css = src("src/anime/ui/style.js");
    const rule = css.slice(css.indexOf("#klc-ui .mark small"), css.indexOf("\n", css.indexOf("#klc-ui .mark small")));
    expect(rule).toContain("font: 800 11px/1");
    expect(rule).toContain("text-shadow: 0 1px 0 rgba(31, 58, 104, 0.8), 0 0 8px rgba(31, 58, 104, 0.6)");
  });
});

describe("quay: no z-fighting end caps", () => {
  test("the slab, face, lip and trims end a few cm inside the fill box (exposed run ends at angled corners)", () => {
    const q = src("src/anime/world/harbor/quay.js");
    const body = q.slice(q.indexOf("// ---------------------------------------------------------------- body: fill + face + lip"), q.indexOf("// expansion joints every 10 m"));
    expect(body).toContain("k.box(apron, top - base, L, M.concreteDark");                 // the fill keeps the full length
    expect(body).toContain("k.box(apron - 0.35, 0.3, L - 0.03, topM");                    // slab
    expect(body).toContain("opts.noLand ? L : L - 0.06");                                 // face (full length without a fill)
    expect(body).toContain("k.box(0.42, 0.14, L - 0.09, M.concreteLight");                // lip
    // no other box in the body spans the exact run length
    const boxes = [...body.matchAll(/k\.box\(([^;]+?)\);/g)].map((m) => m[1]);
    expect(boxes.filter((b) => /,\s*L,\s/.test(b)).length).toBe(1);
  });
});
