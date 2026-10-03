// [v6:rebuild] The south shore rebuilt to the photo survey (docs/anime/survey/minami.md "AFTER"): the plaza constants that
// minami5.js builds from must reproduce every surveyed feature within its 1-sigma (or 0.25 m), dimension by dimension,
// without a browser: the same assembly plazaFeatures() registers, recomputed here from the exported constants.
import { describe, test, expect } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { CAGE6, BLEACH6, WINCH6, RINGS6, RING_H, RING_TREE_B, PLAZA_Y, WALK6, WALKWAY, ANCHOR, ANCHOR_OVAL, MUK6, TOTEM6, PIER7_6, BAYFACE6, P7WALL } from "../src/anime/world/harbor/minami5.js";
import { diffFeatures, summarize } from "../tools/anime/survey-diff.mjs";

const ROOT = join(import.meta.dir, "..");
const FJ = join(ROOT, "data/survey/minami/features.json");
const has = existsSync(FJ);
const S = has ? JSON.parse(readFileSync(FJ, "utf8")) : null;
const dimOf = (n) => S.dims.find((d) => d.name === n);

/** The plaza features as plazaFeatures() registers them (kept in step with minami5.js). */
function plazaApp() {
  const F = {}, y = PLAZA_Y, add = (n, p) => { F[n] = p; }, group = (n, pts) => pts.forEach((p, i) => add(`${n}#${i + 1}`, p));
  const { TL, CR, EN, foot, beam, top } = CAGE6;
  group("cage.top", [TL, CR, EN].map(([x, z]) => [x, top, z])); group("cage.foot", [TL, CR, EN].map(([x, z]) => [x, foot, z]));
  add("cage.box_bottom", [TL[0], beam, TL[1]]);
  const B = BLEACH6, X = (u, w, yy) => [B.O[0] + B.U[0] * u + B.W[0] * w, yy, B.O[1] + B.U[1] * u + B.W[1] * w];
  B.tiers.forEach(([w, t], i) => { const bot = i ? B.tiers[i - 1][1] : y; group(`bleach.t${i + 1}.top`, [X(B.cage * w, w, t), X(B.uS, w, t)]); group(`bleach.t${i + 1}.bot`, [X(B.cage * w, w, bot), X(B.uS, w, bot)]); });
  const rise = (B.tiers.at(-1)[1] - y) / B.risers;
  group("bleach.stair.bot", [X(B.uS, 0, y + rise), X(B.uS + B.stairW, 0, y + rise)]);
  group("winch.foot", [WINCH6.a, WINCH6.b].map(([x, z]) => [x, y, z])); group("winch.tip", [WINCH6.a, WINCH6.b].map(([x, z]) => [x, y + WINCH6.h, z]));
  RINGS6.forEach(({ c: [x, z] }, i) => add(`ring#${i + 1}`, [x, y, z])); add("ring.tree#1", [RING_TREE_B[0], y, RING_TREE_B[1]]);
  return F;
}

describe.skipIf(!has)("south shore rebuilt to the survey", () => {
  test("every plaza feature lies within max(0.25 m, its 1-sigma) of the survey", () => {
    const app = plazaApp(), names = new Set(Object.keys(app).map((n) => n.split("#")[0]));
    const survey = S.features.filter((f) => names.has(f.name.split("#")[0]));
    expect(survey.length).toBeGreaterThan(35);
    const rows = diffFeatures(survey, app);
    for (const r of rows) {
      expect(r.missing).toBeFalsy();
      const tol = Math.max(0.25, Math.hypot(r.sigma[0], r.sigma[1], r.sigma[2]));
      expect(r.err).toBeLessThan(tol);
    }
    expect(summarize(rows).err3d.max).toBeLessThan(0.25);
  });
  test("the cage: 5.43 m high, 3.6 m front face at 53 deg, 21.3 m side face at 150 deg, 9 bays", () => {
    const { TL, CR, EN, foot, top, bays } = CAGE6, brg = (dx, dz) => ((Math.atan2(dx, -dz) * 180 / Math.PI) % 180 + 180) % 180;
    expect(Math.abs(top - foot - dimOf("cage.h").value)).toBeLessThan(0.05);
    expect(Math.abs(Math.hypot(CR[0] - TL[0], CR[1] - TL[1]) - dimOf("cage.front_w").value)).toBeLessThan(0.05);
    expect(Math.abs(Math.hypot(EN[0] - CR[0], EN[1] - CR[1]) - dimOf("cage.side_len").value)).toBeLessThan(0.1);
    expect(Math.abs(brg(CR[0] - TL[0], CR[1] - TL[1]) - dimOf("cage.front_azimuth_deg").value)).toBeLessThan(0.5);
    expect(Math.abs(brg(EN[0] - CR[0], EN[1] - CR[1]) - dimOf("cage.side_azimuth_deg").value)).toBeLessThan(0.5);
    expect(bays).toBe(9);
  });
  test("the bleachers: 5 tiers of ~0.69 m to T.P. 5.27, fronts perpendicular to the radial stair edge, 16 risers", () => {
    const B = BLEACH6, T = B.tiers;
    expect(T.length).toBe(dimOf("bleach.tiers").value);
    expect(Math.abs(T.at(-1)[1] - dimOf("bleach.top_y").value)).toBeLessThan(0.02);
    expect(Math.abs((T.at(-1)[1] - PLAZA_Y) / T.length - dimOf("bleach.rise").value)).toBeLessThan(0.02);
    expect(B.risers).toBe(dimOf("bleach.stair.risers").value);
    const az = ((Math.atan2(B.U[0], -B.U[1]) * 180 / Math.PI) % 180 + 180) % 180;
    expect(Math.abs(az - dimOf("bleach.front_azimuth_deg").value)).toBeLessThan(1);
    expect(Math.abs(B.U[0] * B.W[0] + B.U[1] * B.W[1])).toBeLessThan(1e-3);   // up-slope axis perpendicular to the fronts
  });
  test("winch, rings, the paving level", () => {
    expect(Math.abs(Math.hypot(WINCH6.a[0] - WINCH6.b[0], WINCH6.a[1] - WINCH6.b[1]) - dimOf("winch.span").value)).toBeLessThan(0.05);
    expect(Math.abs(WINCH6.h - dimOf("winch.post_h").value)).toBeLessThan(0.05);
    expect(Math.abs(RING_H - dimOf("ring.h").value)).toBeLessThan(0.02);
    expect(Math.abs((RINGS6[0].d + RINGS6[1].d) / 2 - dimOf("ring.d_out").value)).toBeLessThan(0.05);
    const ground = S.features.filter((f) => /^(cage\.foot|winch\.foot|ring#)/.test(f.name)).map((f) => f.enu[1]);
    for (const g of ground) expect(Math.abs(g - PLAZA_Y)).toBeLessThan(0.05);
  });
  test("迎 / ANCHOR: the face on its surveyed plane, the 3F box corners and coping, the oval and the totems", () => {
    const pl = JSON.parse(readFileSync(join(ROOT, "data/survey/minami/picks.json"), "utf8")).planes["anchor.face"];
    for (const p of [ANCHOR.P1, ANCHOR.P2]) expect(Math.abs(pl.n[0] * p[0] + pl.n[2] * p[1] - pl.d)).toBeLessThan(0.05);
    const F = Object.fromEntries(S.features.map((f) => [f.name, f.enu]));
    expect(Math.hypot(MUK6.box.S[0] - F["mukaeru.box.top#1"][0], MUK6.box.S[1] - F["mukaeru.box.top#1"][2])).toBeLessThan(0.05);
    expect(Math.hypot(MUK6.box.E[0] - F["mukaeru.box.top#2"][0], MUK6.box.E[1] - F["mukaeru.box.top#2"][2])).toBeLessThan(0.05);
    expect(Math.abs(MUK6.box.top - dimOf("mukaeru.box_top_y").value)).toBeLessThan(0.02);
    expect(Math.abs(ANCHOR.floor - dimOf("anchor.floor").value)).toBeLessThan(0.02);
    const fl = Math.hypot(ANCHOR.P2[0] - ANCHOR.P1[0], ANCHOR.P2[1] - ANCHOR.P1[1]), f = ANCHOR_OVAL.f;
    const ov = [ANCHOR.P1[0] + (ANCHOR.P2[0] - ANCHOR.P1[0]) * f, ANCHOR.floor + ANCHOR_OVAL.y, ANCHOR.P1[1] + (ANCHOR.P2[1] - ANCHOR.P1[1]) * f];
    expect(Math.hypot(ov[0] - F["anchor.oval"][0], ov[1] - F["anchor.oval"][1], ov[2] - F["anchor.oval"][2])).toBeLessThan(0.25);
    expect(fl).toBeGreaterThan(9);
    for (const k of ["mukaeru", "pier7"]) expect(Math.hypot(...TOTEM6[k].map((v, i) => v - F[`totem.${k}`][i]))).toBeLessThan(0.05);
  });
  test("the walkway leaves the cage's front face for PIER7's NW terrace; PIER7's bay face stands 1.5 m inside the wall line", () => {
    expect(Math.hypot(WALKWAY[0][0] - CAGE6.TL[0], WALKWAY[0][1] - CAGE6.TL[1])).toBeLessThan(3);
    expect(WALK6.top).toBeLessThan(CAGE6.beam);   // under the cage's deck beam line (IMG_0807: its underside at T.P. 4.7)
    const d = (p, a, b) => { const ux = b[0] - a[0], uz = b[1] - a[1], l = Math.hypot(ux, uz); return Math.abs((p[0] - a[0]) * uz - (p[1] - a[1]) * ux) / l; };
    for (let i = 1; i < 5; i++) expect(Math.abs(d(BAYFACE6[i], P7WALL[i - 1], P7WALL[i]) - 1.5)).toBeLessThan(0.3);
    expect(PIER7_6.deck).toBeLessThan(PIER7_6.f2); expect(PIER7_6.tops.main).toBeCloseTo(11.9, 1);
  });
});
