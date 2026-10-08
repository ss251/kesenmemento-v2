// [v6:rebuild] The fish-market rebuild spec (data/survey/market/model.json) against the photo survey
// (data/survey/market/features.json): the deck builder (harbor/market5.js) reads only the spec, so these checks pin the
// built positions to the survey without a browser. The browser-side check is tools/anime/survey-diff.mjs --area market.
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DECK, enu, wallOf, studioS, pavRoofH, CBOX } from "../src/anime/world/harbor/market5.js";
import { HALL, quayEnu, quayOf, shiftShed } from "../src/anime/world/harbor/hall6.js";
import CARS from "../data/survey/market/cars.json";

const ROOT = join(import.meta.dir, "..");
const S = JSON.parse(readFileSync(join(ROOT, "data/survey/market/features.json"), "utf8"));
const F = Object.fromEntries(S.features.map((f) => [f.name, f]));
const tol = (name) => Math.max(0.25, ...F[name].sigma);
const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const at = (s, off, y) => { const [x, z] = enu(s, off); return [x, y, z]; };
const Y = DECK.deck.y;
/** The cars' footprint centres (wall frame) from data/survey/market/cars.json: `nose` is the front plate's stand, the centre is half a body behind it. */
const carCentres = () => CARS.cars.map((c) => { const L = c.L ?? CARS.types[c.type].L, ph = (c.face ?? 0) * Math.PI / 180; return { name: c.name, s: c.nose ? c.nose[0] - Math.sin(ph) * L / 2 : c.s, o: c.nose ? c.nose[1] + Math.cos(ph) * L / 2 : c.off, L }; });

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
  test("pavilions: eight in four mirrored pairs, each inside C棟, none overlapping a stack; all eight on the survey", () => {
    const P = DECK.pavilions.list; expect(P.length).toBe(8);
    for (let i = 0; i < 8; i += 2) { expect(P[i].outer).toBe("N"); expect(P[i + 1].outer).toBe("S"); }
    for (const p of P) { expect(p.s[0]).toBeGreaterThan(CBOX.s0); expect(p.s[1]).toBeLessThan(studioS(p.o[0])); expect(p.o[1]).toBeLessThan(DECK.deck.edge); }
    for (const [s, o] of DECK.stacks.list) for (const p of P) expect(s > p.s[0] - 0.4 && s < p.s[1] + 0.4 && o > p.o[0] - 0.4 && o < p.o[1] + 0.4).toBe(false);
    let within = 0;
    P.forEach((p, i) => { const c = at((p.s[0] + p.s[1]) / 2, (p.o[0] + p.o[1]) / 2, Y); if (d3(c, F[`deck.pavilion#${i + 1}`].enu) <= tol(`deck.pavilion#${i + 1}`)) within++; });
    expect(within).toBe(8);   // #8 is the photo measurement (roof curl tip in IMG_0794 / 0796 / 0798 + ortho prior), no longer clamped against the studio face
  });
  test("the wave roof sweeps up at the outer end and curls down at the inner end", () => {
    const R = DECK.pavilions.roof;
    expect(pavRoofH(0)).toBeCloseTo(R.curl, 3); expect(pavRoofH(1)).toBeCloseTo(R.tip, 3);
    expect(pavRoofH(0.5)).toBeGreaterThan(R.low - 0.1); expect(pavRoofH(0.5)).toBeLessThan(R.low + 0.3);
  });
  test("the photographed cars stand clear of the pavilions; the studio door, cones and lifeboat ends are the survey's", () => {
    for (const c of carCentres()) for (const p of DECK.pavilions.list) {
      const clear = c.s + 0.85 < p.s[0] || c.s - 0.85 > p.s[1] || c.o + 2.1 < p.o[0] || c.o - 2.1 > p.o[1];
      expect(clear).toBe(true);
    }
    expect(d3(at(studioS(DECK.studio.door.off), DECK.studio.door.off, Y), F["deck.studio.door"].enu)).toBeLessThan(tol("deck.studio.door"));
    DECK.cones.forEach(([x, z], i) => expect(d3([x, Y, z], F[`deck.cone#${i + 1}`].enu)).toBeLessThan(tol(`deck.cone#${i + 1}`)));
    expect(d3([DECK.lifeboat.n[0], Y, DECK.lifeboat.n[1]], F["deck.lifeboat.end_n"].enu)).toBeLessThan(0.05);
  });
  test("the deck cars: every one has a type, the row stands in the stalls (noses within 2.5 m of one line, 1.5-7.5 m apart), the lifeboat is on its sheer line", () => {
    for (const c of CARS.cars) expect(CARS.types[c.type]).toBeDefined();
    const row = CARS.cars.filter((c) => c.nose && c.nose[0] > 91 && c.nose[0] < 125).sort((a, b) => a.nose[0] - b.nose[0]);
    expect(row.length).toBeGreaterThanOrEqual(10);
    for (const c of row) { expect(c.nose[1]).toBeGreaterThan(7.5); expect(c.nose[1]).toBeLessThan(10); }
    for (let i = 1; i < row.length; i++) { const dp = row[i].nose[0] - row[i - 1].nose[0]; expect(dp).toBeGreaterThan(1.5); expect(dp).toBeLessThan(7.5); }
    const LB = DECK.lifeboat, tl = LB.tilt * Math.PI / 180;
    // the west flank at the sheer: centreline - B/2 across the axis = off 13.6 (IMG_0793's sheer edge)
    expect(LB.off - LB.B / 2 / Math.cos(tl)).toBeGreaterThan(13.3); expect(LB.off - LB.B / 2 / Math.cos(tl)).toBeLessThan(13.9);
    expect(LB.bow).toBeCloseTo(84.0, 0); expect(LB.L).toBeCloseTo(5.3, 1); expect(LB.B).toBeCloseTo(2.3, 1);
  });
  test("the deck's windows are the 24 measured, nothing else; the markings come from IMG_0795 / 0798 / 0793", () => {
    expect(DECK.wall.windows.list.length).toBe(24);
    expect(S.features.filter((f) => f.name.startsWith("deck.window#")).length).toBe(24);
    for (const v of DECK.wall.windows.vents) expect(Math.min(...DECK.wall.windows.list.map((w) => Math.abs(w - v)))).toBeLessThan(0.5);   // every vent is over a measured window
    expect(DECK.markings.joint.pitch).toBeCloseTo(3.0, 5);
    const L = DECK.markings.stall[0];
    expect(d3(at(L.s, L.off[0], Y), F["deck.line.stall#1"].enu)).toBeLessThan(tol("deck.line.stall#1"));
    expect(d3(at(L.s, 11.87, Y), F["deck.line.stall#2"].enu)).toBeLessThan(tol("deck.line.stall#2"));
  });
  test("the quay hall (dawn frames): floor items sit on the survey, the roof edge on the shadow line, the shed moved 7.5 m inland", () => {
    const dim = (n) => S.dims.find((d) => d.name === n).value;
    const Hl = HALL, hy = (a, d, y) => { const [x, z] = quayEnu(a, d); return [x, y, z]; };
    expect(Hl.floor).toBeCloseTo(dim("canopy.floor_y"), 2); expect(Hl.apron).toBeCloseTo(dim("canopy.apron_y"), 2);
    expect(Hl.tubs.h).toBeCloseTo(dim("canopy.tub_h"), 2); expect(Hl.tubs.rows[0].pitch).toBeCloseTo(dim("canopy.tub_pitch"), 2);
    expect(Hl.trans.a0).toBeCloseTo(dim("canopy.beam_t1.a"), 0); expect(Hl.trans.bottom).toBeCloseTo(dim("canopy.beam_t1.y"), 1);
    const R = Hl.tubs.rows[0];
    for (let i = 0; i < R.n; i++) expect(d3(hy(R.a0 + 0.16 + i * R.pitch, R.d0, Hl.floor + Hl.tubs.h), F[`canopy.tub#${i + 1}`].enu)).toBeLessThan(tol(`canopy.tub#${i + 1}`));
    Hl.conveyor.casters.forEach(([a, d], i) => expect(d3(hy(a, d, Hl.floor), F[`canopy.conveyor.caster#${i + 1}`].enu)).toBeLessThan(0.3));
    expect(d3(hy(...Hl.truck.front, Hl.apron), F["canopy.truck.wheel#1"].enu)).toBeLessThan(0.3); expect(d3(hy(...Hl.truck.rear, Hl.apron), F["canopy.truck.wheel#2"].enu)).toBeLessThan(0.3);
    expect(Math.hypot(Hl.truck.front[0] - Hl.truck.rear[0], Hl.truck.front[1] - Hl.truck.rear[1])).toBeCloseTo(dim("canopy.truck_wheelbase"), 1);
    // the roof edge's shadow on the floor (sun 14.5 deg, 0.749 of its azimuth along the quay normal) is the survey's line
    expect(Hl.edge.d - (Hl.edge.bottom - Hl.floor) * 0.749 / Math.tan(14.5 * Math.PI / 180)).toBeCloseTo(dim("canopy.shadow_d"), 0);
    // the quay frame inverts, the column grid carries 「7」 at its surveyed place, the shed outline moves along the normal only
    const [a, d] = quayOf(...quayEnu(81.35, -21.4)); expect(a).toBeCloseTo(81.35, 3); expect(d).toBeCloseTo(-21.4, 3);
    const sh = shiftShed([[540, 600], [600, 700]]); expect(Math.hypot(sh[0][0] - 540, sh[0][1] - 600)).toBeCloseTo(Hl.shift, 3);
    const src = readFileSync(join(ROOT, "src/anime/world/harbor/market4.js"), "utf8");
    expect(src).toContain("buildQuayHall(ctx, k,"); expect(src).toContain("shiftShed(SITES.marketShed.poly)");
  });
});
