// [v6:survey] The south-shore (minami) photo survey outputs: the solved cameras (data/survey/minami/cameras.json, written
// by tools/survey/sfm_enu.py + georef_refine.py + export_cams.py) and the measured features (features.json, from
// tools/survey/minami_features.py). These checks hold the survey to its targets and verify that the JavaScript camera
// convention used by tools/anime/photo-align.mjs (three.js quaternion -> ENU, OPENCV / RADIAL distortion, pixel
// centres at +0.5) reprojects the Python-triangulated features onto the same pixels the survey picked.
import { describe, test, expect } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { qToR, distortN } from "../tools/anime/survey/lib.mjs";

const ROOT = join(import.meta.dir, "..");
const D = join(ROOT, "data/survey/minami");
const has = existsSync(join(D, "cameras.json")) && existsSync(join(D, "features.json")) && existsSync(join(D, "picks.json"));
const load = (f) => JSON.parse(readFileSync(join(D, f), "utf8"));

// three.js camera -> ENU rotation (camera looks down -z, y up) to a COLMAP world->camera projection
function projectENU(c, X) {
  const [qx, qy, qz, qw] = c.quaternion;            // three.js order [x, y, z, w]; qToR takes [w, x, y, z]
  const R3 = qToR([qw, qx, qy, qz]);                // three camera axes in ENU (columns)
  const d = [X[0] - c.position[0], X[1] - c.position[1], X[2] - c.position[2]];
  // COLMAP camera axes: x = three x, y = -three y, z = -three z
  const xc = R3[0][0] * d[0] + R3[1][0] * d[1] + R3[2][0] * d[2];
  const yc = -(R3[0][1] * d[0] + R3[1][1] * d[1] + R3[2][1] * d[2]);
  const zc = -(R3[0][2] * d[0] + R3[1][2] * d[1] + R3[2][2] * d[2]);
  if (zc <= 0) return null;
  const dist = { k1: c.dist[0], k2: c.dist[1], p1: c.dist[2] || 0, p2: c.dist[3] || 0, k3: 0, k4: 0, k5: 0, k6: 0 };
  const [x, y] = distortN(xc / zc, yc / zc, dist);
  return [c.fx * x + c.cx, c.fy * y + c.cy];
}

describe.skipIf(!has)("minami survey", () => {
  test("registration and reprojection meet the survey targets (>= 85 %, < 1.5 px)", () => {
    const cams = load("cameras.json");
    expect(cams.registered / cams.total).toBeGreaterThanOrEqual(0.85);
    expect(cams.reproj_mean_px).toBeLessThan(1.5);
    for (const c of cams.cameras.filter((c) => c.registered)) {
      expect(c.position.every(Number.isFinite)).toBe(true);
      expect(Math.abs(Math.hypot(...c.quaternion) - 1)).toBeLessThan(1e-5);
      expect(c.fx).toBeGreaterThan(1000);
      // hand-held: eye height over the DEM in a plausible band, roll small
      expect(c.eye_m).toBeGreaterThan(0.6); expect(c.eye_m).toBeLessThan(3.0);
      expect(Math.abs(c.roll)).toBeLessThan(15);
    }
  });
  test("the JS camera convention reprojects the triangulated features onto their picks", () => {
    const cams = Object.fromEntries(load("cameras.json").cameras.filter((c) => c.registered).map((c) => [c.id, c]));
    const feats = load("features.json").features.filter((f) => f.method === "tri");
    expect(feats.length).toBeGreaterThan(3);
    for (const f of feats) {
      for (const [img, res] of Object.entries(f.res_px)) {
        const c = cams["IMG_" + img];
        const uv = projectENU(c, f.enu);
        expect(uv).not.toBeNull();
        // find the pick: the residual recorded by the Python triangulation must be reproduced within 1.5 px
        const picks = load("picks.json").picks;
        const key = Object.keys(picks).find((k) => picks[k][img] && (f.note.includes(`[${k}]`) || k === f.name));
        if (!key) continue;
        const p = picks[key][img];
        const r = Math.hypot(uv[0] - p[0], uv[1] - p[1]);
        expect(Math.abs(r - res)).toBeLessThan(1.5);
      }
    }
  });
  test("features carry ENU positions, 1-sigma and their construction", () => {
    const F = load("features.json");
    expect(F.features.length).toBeGreaterThan(25);
    for (const f of F.features) {
      expect(f.enu.length).toBe(3); expect(f.enu.every(Number.isFinite)).toBe(true);
      expect(f.sigma.every((s) => s > 0 && s < 3)).toBe(true);
      expect(["tri", "cut", "drop", "ground", "ringfit", "bearings", "radial"]).toContain(f.method);
      // inside the south-shore survey box (ENU metres)
      expect(f.enu[0]).toBeGreaterThan(-60); expect(f.enu[0]).toBeLessThan(160);
      expect(f.enu[2]).toBeGreaterThan(0); expect(f.enu[2]).toBeLessThan(140);
    }
    // the cage's top is level (box corner vs corner column, measured independently) and stands on the T.P. 1.8 quay
    const P = Object.fromEntries(F.features.map((f) => [f.name, f.enu]));
    expect(Math.abs(P["cage.top#1"][1] - P["cage.top#2"][1])).toBeLessThan(0.15);
    expect(Math.abs(P["cage.foot#2"][1] - 1.8)).toBeLessThan(0.2);
  });
});
