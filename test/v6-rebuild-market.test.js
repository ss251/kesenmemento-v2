// [v6:rebuild] The fish-market rebuild spec (data/survey/market/model.json) against the photo survey
// (data/survey/market/features.json): the deck builder (harbor/market5.js) reads only the spec, so these checks pin the
// built positions to the survey without a browser. The browser-side check is tools/anime/survey-diff.mjs --area market.
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DECK, enu, wallOf, studioS, pavRoofH, CBOX } from "../src/anime/world/harbor/market5.js";

const ROOT = join(import.meta.dir, "..");
const S = JSON.parse(readFileSync(join(ROOT, "data/survey/market/features.json"), "utf8"));
const F = Object.fromEntries(S.features.map((f) => [f.name, f]));
const tol = (name) => Math.max(0.25, ...F[name].sigma);
const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const at = (s, off, y) => { const [x, z] = enu(s, off); return [x, y, z]; };
const Y = DECK.deck.y;

describe("market rebuild spec", () => {
  test("the wall frame is orthonormal and wallOf inverts enu", () => {
    const { u, n } = DECK.frame;
    expect(Math.hypot(...u)).toBeCloseTo(1, 5); expect(Math.hypot(...n)).toBeCloseTo(1, 5); expect(u[0] * n[0] + u[1] * n[1]).toBeCloseTo(0, 6);
    const [s, o] = wallOf(...enu(37.5, -4.25)); expect(s).toBeCloseTo(37.5, 3); expect(o).toBeCloseTo(-4.25, 3);
  });
  test("deck height, wall ends and wall height match the survey", () => {
    expect(Y).toBeCloseTo(S.dims.find((d) => d.name === "deck.y").value, 2);
    const W = DECK.wall;
    expect(d3(at(W.s[0], 0, Y), F["deck.wall.n_base"].enu)).toBeLessThan(tol("deck.wall.n_base"));
    expect(d3(at(W.s[1], 0, Y), F["deck.wall.s_base"].enu)).toBeLessThan(tol("deck.wall.s_base"));
    expect(d3(at(W.s[0], 0, W.top[0]), F["deck.wall.n_top"].enu)).toBeLessThan(tol("deck.wall.n_top"));
    expect(d3(at(W.s[1], 0, W.top[1]), F["deck.wall.s_top"].enu)).toBeLessThan(tol("deck.wall.s_top"));
  });
  test("letters, the entrance and every surveyed window sit within tolerance", () => {
    const W = DECK.wall;
    W.letters.s.forEach((s, i) => expect(d3(at(s, W.letters.out, Y + W.letters.h[i]), F[`deck.letter.${i + 1}`].enu)).toBeLessThan(tol(`deck.letter.${i + 1}`)));
    expect(d3(at(W.entrance.door[0], 0, Y), F["deck.entrance.jamb_n"].enu)).toBeLessThan(tol("deck.entrance.jamb_n"));
    expect(d3(at(W.entrance.door[1], 0, Y), F["deck.entrance.jamb_s"].enu)).toBeLessThan(tol("deck.entrance.jamb_s"));
    const wins = W.windows.list.map((s) => at(s, 0, Y + (W.windows.h0 + W.windows.h1) / 2));
    for (const f of S.features.filter((f) => f.name.startsWith("deck.window#"))) expect(Math.min(...wins.map((w) => d3(w, f.enu)))).toBeLessThan(tol(f.name));
  });
  test("pavilions: eight in four mirrored pairs, each inside C棟, none overlapping a stack; seven of eight on the survey", () => {
    const P = DECK.pavilions.list; expect(P.length).toBe(8);
    for (let i = 0; i < 8; i += 2) { expect(P[i].outer).toBe("N"); expect(P[i + 1].outer).toBe("S"); }
    for (const p of P) { expect(p.s[0]).toBeGreaterThan(CBOX.s0); expect(p.s[1]).toBeLessThan(studioS(p.o[0])); expect(p.o[1]).toBeLessThan(DECK.deck.edge); }
    for (const [s, o] of DECK.stacks.list) for (const p of P) expect(s > p.s[0] - 0.4 && s < p.s[1] + 0.4 && o > p.o[0] - 0.4 && o < p.o[1] + 0.4).toBe(false);
    let within = 0;
    P.forEach((p, i) => { const c = at((p.s[0] + p.s[1]) / 2, (p.o[0] + p.o[1]) / 2, Y); if (d3(c, F[`deck.pavilion#${i + 1}`].enu) <= tol(`deck.pavilion#${i + 1}`)) within++; });
    expect(within).toBeGreaterThanOrEqual(7);   // #8: the ortho centre would put an 8.3 m pavilion into the studio face
  });
  test("the wave roof sweeps up at the outer end and curls down at the inner end", () => {
    const R = DECK.pavilions.roof;
    expect(pavRoofH(0)).toBeCloseTo(R.curl, 3); expect(pavRoofH(1)).toBeCloseTo(R.tip, 3);
    expect(pavRoofH(0.5)).toBeGreaterThan(R.low - 0.1); expect(pavRoofH(0.5)).toBeLessThan(R.low + 0.3);
  });
  test("the photographed cars stand clear of the pavilions; the studio door, cones and lifeboat ends are the survey's", () => {
    for (const c of DECK.cars) for (const p of DECK.pavilions.list) {
      const clear = c.s + 0.85 < p.s[0] || c.s - 0.85 > p.s[1] || c.o + 2.1 < p.o[0] || c.o - 2.1 > p.o[1];
      expect(clear).toBe(true);
    }
    expect(d3(at(studioS(DECK.studio.door.off), DECK.studio.door.off, Y), F["deck.studio.door"].enu)).toBeLessThan(tol("deck.studio.door"));
    DECK.cones.forEach(([x, z], i) => expect(d3([x, Y, z], F[`deck.cone#${i + 1}`].enu)).toBeLessThan(tol(`deck.cone#${i + 1}`)));
    expect(d3([DECK.lifeboat.n[0], Y, DECK.lifeboat.n[1]], F["deck.lifeboat.end_n"].enu)).toBeLessThan(0.05);
  });
  test("the quay hall: floor, edge beam, open depth from the survey dims; no back wall in market4", () => {
    const dim = (n) => S.dims.find((d) => d.name === n).value;
    expect(DECK.hall.floor).toBeCloseTo(dim("canopy.floor_y"), 2);
    expect(DECK.hall.edgeBeam).toBeCloseTo(dim("canopy.soffit_y"), 2);
    const src = readFileSync(join(ROOT, "src/anime/world/harbor/market4.js"), "utf8");
    expect(src).not.toContain("a dark wall 18 m in");
    expect(src).toContain("canopy.open_depth', depthIn(");
  });
});
