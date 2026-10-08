// [v6:fix3] South shore, third fix round: the PIER7 NW block, the gate pier and the 拓 / signs constants agree with the survey features they came from.
import { describe, test, expect } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { NW7, nwA, WALK6, WALKWAY, P7_1F6, PIER7_6 } from "../src/anime/world/harbor/minami5.js";
import { POLES6 } from "../src/anime/world/harbor/poles6.js";

const ROOT = join(import.meta.dir, "..");
const FJ = join(ROOT, "data/survey/minami/features.json");
const has = existsSync(FJ);
const S = has ? JSON.parse(readFileSync(FJ, "utf8")) : null;
const feat = (n) => S.features.find((f) => f.name === n);
const dim = (n) => S.dims.find((f) => f.name === n);

describe("PIER7 NW block frame", () => {
  test("the frame is orthonormal and the corner is the surveyed 1F corner", () => {
    expect(Math.hypot(...NW7.ea)).toBeCloseTo(1, 2); expect(Math.hypot(...NW7.eb)).toBeCloseTo(1, 2);
    expect(NW7.ea[0] * NW7.eb[0] + NW7.ea[1] * NW7.eb[1]).toBeCloseTo(0, 2);
    if (has) { const c = feat("nw.shop.corner"), p = nwA(0, 0); expect(Math.hypot(p[0] - c.enu[0], p[1] - c.enu[2])).toBeLessThan(0.05); }
  });
  test.skipIf(!has)("roof tips, column feet and the studio edge built from NW7 are the surveyed ones", () => {
    const eq = (n, a, b, y) => { const f = feat(n), p = nwA(a, b); expect(Math.hypot(p[0] - f.enu[0], p[1] - f.enu[2]), n).toBeLessThan(Math.max(0.15, f.sigma[0] * 1.5)); if (y !== undefined) expect(Math.abs(y - f.enu[1]), n).toBeLessThan(0.15); };
    eq("nw.roof.A", NW7.roof.a0, NW7.roof.b0, NW7.roof.eave[0]); eq("nw.roof.W", NW7.roof.a1, NW7.roof.b0, NW7.roof.eave[1]);
    eq("nw.col1.foot", NW7.cols[0][0], NW7.cols[0][1], NW7.deck); eq("nw.col2.foot", NW7.cols[1][0], NW7.cols[1][1], NW7.deck);
    eq("nw.studio.L", NW7.studio.a1, NW7.studio.b0); eq("nw.shop.glass_end", NW7.shop.glassA, 0);
  });
  test("the low shop under a terrace: ground-floor eave below the bay deck, studio set back, stair T.P. 2.35 -> 5.3", () => {
    expect(NW7.slab).toBeLessThan(PIER7_6.f2 + 0.5); expect(NW7.slab).toBeCloseTo(5.3, 1);
    expect(NW7.studio.b0).toBeGreaterThan(4); expect(NW7.studio.head).toBeLessThan(PIER7_6.f3);
    expect(NW7.stair.n).toBe(15); expect((NW7.slab - NW7.deck) / NW7.stair.n).toBeLessThan(0.21);
    expect(NW7.rail).toBeGreaterThan(0.9); expect(NW7.rail).toBeLessThan(1.1);
    expect(NW7.shop.a1).toBeCloseTo(8.15, 1);
    if (has) { expect(NW7.slab).toBeCloseTo(dim("nw.slab_y").value, 1); expect(NW7.studio.b0).toBeCloseTo(dim("nw.setback").value, 1); expect(NW7.studio.head).toBeCloseTo(dim("nw.studio_head").value, 1); }
  });
  test("the 1F ring of the SE part starts beyond the NW shop's street face", () => {
    const p = P7_1F6.find((q) => Math.abs(q[0] - 15.21) < 0.01); expect(p).toBeTruthy();
    const e = nwA(0, NW7.shop.b1); expect(Math.hypot(e[0] - 4.1, e[1] - 83.5)).toBeLessThan(6);
  });
});

describe("gate pier and walkway", () => {
  test.skipIf(!has)("the pier is the re-solved one (IMG_0819 x IMG_0799) and the walkway ends on it", () => {
    const f = feat("gate.post"); expect(Math.hypot(WALK6.gatePost[0] - f.enu[0], WALK6.gatePost[1] - f.enu[2])).toBeLessThan(0.05);
    const e = WALKWAY[WALKWAY.length - 1]; expect(Math.hypot(e[0] - WALK6.gatePost[0], e[1] - WALK6.gatePost[1])).toBeLessThan(1.0);
  });
  test("the pier's right edge is out of the IMG_0819 frame (bearing <= 235.6 deg from the camera)", () => {
    const C = [14.64, 60.75], nb = [0.875, -0.484], uu = [0.484, 0.875], c = WALK6.gatePost; let mx = -999;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) { const p = [c[0] + uu[0] * 1.1 * sx + nb[0] * 0.65 * sy, c[1] + uu[1] * 1.1 * sx + nb[1] * 0.65 * sy]; const b = ((Math.atan2(p[0] - C[0], -(p[1] - C[1])) * 180 / Math.PI) + 360) % 360; mx = Math.max(mx, b); }
    expect(mx).toBeLessThan(236.5);
  });
});

describe("signs and poles", () => {
  test.skipIf(!has)("the 40 km/h disc is surveyed and the transformer pole stands where 0830 puts it", () => {
    expect(feat("sign.40").enu[1]).toBeCloseTo(5.51, 1);
    const mv = POLES6.move.find((m) => m.tr && m.H === 14.5); expect(Math.hypot(mv.to[0] + 28.15, mv.to[1] - 61.69)).toBeLessThan(0.6);
  });
  test("poles6 removes the pole that IMG_0913 does not show and adds the cluster pole of IMG_0896", () => {
    expect(POLES6.remove.some((r) => Math.hypot(r.from[0] + 29.9, r.from[1] - 40.1) < 0.5)).toBe(true);
    expect(POLES6.add.some((a) => Math.hypot(a.at[0] - 147.4, a.at[1] - 83.5) < 0.5)).toBe(true);
  });
});

describe("source tags", () => {
  const src = readFileSync(join(ROOT, "src/anime/world/harbor/minami5.js"), "utf8");
  test("the plaque reads 港町ブルース, the 拓 banners are the katsuo nobori, the totems carry the NAI / WAN wordmark", () => {
    expect(src).toContain("fillText('港町ブルース'"); expect(src).not.toContain("港町ブルー'");
    expect(src).toContain("'かつお'"); expect(src).toContain("fillText('NAI'"); expect(src).toContain("fillText('WAN'");
  });
});
