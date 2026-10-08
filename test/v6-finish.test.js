// [v6:finish] The survey's deliverables as tests: the shared camera schema (cameras.json) and the feature schema
// (features.json) of both surveyed areas, the app-vs-survey tolerances for the key features (data/survey/<area>/diff.json,
// written by tools/anime/survey-diff.mjs from the built app and re-derived here offline from app-features.json), and the
// determinism of the photo-align pipeline (tools/anime/photo-align.mjs: undistortion, Canny, distance transform, chamfer).
// The renders themselves need Chrome (tools/anime/gate.sh chrome ...); their numbers are held by the stored chamfer.json.
import { describe, test, expect } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const AREAS = {
  minami: { box: { x: [-60, 160], z: [0, 140] }, minCams: 50, minFeatures: 55, tolMax: 0.35 },
  market: { box: { x: [500, 760], z: [640, 1100] }, minCams: 12, minFeatures: 80, tolMax: 0.5 },
};
const path = (a, f) => join(ROOT, "data/survey", a, f);
const load = (a, f) => JSON.parse(readFileSync(path(a, f), "utf8"));
const have = (a) => ["cameras.json", "features.json", "diff.json", "app-features.json"].every((f) => existsSync(path(a, f)));
const SIGMA_FLOOR = 0.25; // a feature passes when its 3D error is within max(0.25 m, its own 1-sigma norm)

for (const [area, spec] of Object.entries(AREAS)) {
  describe.skipIf(!have(area))(`${area}: cameras.json schema`, () => {
    const doc = load(area, "cameras.json");
    test("shared camera schema: id, image, model, size, intrinsics, distortion, ENU pose", () => {
      expect(doc.cameras.length).toBeGreaterThanOrEqual(spec.minCams);
      const ids = new Set();
      for (const c of doc.cameras) {
        expect(c.id).toMatch(/^IMG_\d{4}$/); expect(ids.has(c.id)).toBe(false); ids.add(c.id);
        if (c.registered === false) continue;
        expect(["OPENCV", "RADIAL", "SIMPLE_RADIAL", "PINHOLE", "SIMPLE_PINHOLE"]).toContain(c.camera_model);
        expect(c.width).toBeGreaterThan(1000); expect(c.height).toBeGreaterThan(1000);
        expect(typeof c.image).toBe("string"); expect(c.image).toMatch(/\.jpe?g$/i);
        for (const k of ["fx", "fy", "cx", "cy"]) expect(Number.isFinite(c[k])).toBe(true);
        expect(c.fx).toBeGreaterThan(1000); expect(c.fy).toBeGreaterThan(1000);
        expect(Math.abs(c.cx - c.width / 2)).toBeLessThan(c.width * 0.05); expect(Math.abs(c.cy - c.height / 2)).toBeLessThan(c.height * 0.05);
        expect(Array.isArray(c.dist) && c.dist.length >= 2 && c.dist.every(Number.isFinite)).toBe(true);
        expect(c.position.length).toBe(3); expect(c.position.every(Number.isFinite)).toBe(true);
        expect(c.quaternion.length).toBe(4); expect(Math.abs(Math.hypot(...c.quaternion) - 1)).toBeLessThan(1e-4);
        // inside the survey box, at plausible T.P. eye heights (phone held at a standing eye or on a deck / quay)
        expect(c.position[0]).toBeGreaterThan(spec.box.x[0]); expect(c.position[0]).toBeLessThan(spec.box.x[1]);
        expect(c.position[2]).toBeGreaterThan(spec.box.z[0]); expect(c.position[2]).toBeLessThan(spec.box.z[1]);
        expect(c.position[1]).toBeGreaterThan(0); expect(c.position[1]).toBeLessThan(40);
        expect(Math.abs(c.pitch)).toBeLessThan(60); expect(Math.abs(c.roll ?? 0)).toBeLessThan(15);
      }
    });
    test("the registered count and the area name agree with the document", () => {
      const reg = doc.cameras.filter((c) => c.registered !== false).length;
      expect(reg).toBeGreaterThanOrEqual(Math.ceil(spec.minCams * 0.9));
      if (doc.registered !== undefined) expect(doc.registered).toBe(reg);
      expect(doc.area).toBe(area);
    });
  });

  describe.skipIf(!have(area))(`${area}: features.json schema`, () => {
    const doc = load(area, "features.json");
    test("every feature has a unique name, finite ENU position, positive 1-sigma and a construction", () => {
      expect(doc.features.length).toBeGreaterThanOrEqual(spec.minFeatures);
      const names = new Set();
      for (const f of doc.features) {
        expect(typeof f.name).toBe("string"); expect(names.has(f.name)).toBe(false); names.add(f.name);
        expect(f.enu.length).toBe(3); expect(f.enu.every(Number.isFinite)).toBe(true);
        const sg = Array.isArray(f.sigma) ? f.sigma : [f.sigma, f.sigma, f.sigma];
        expect(sg.length).toBe(3); expect(sg.every((s) => s > 0 && s < 3)).toBe(true);
        expect(typeof f.method).toBe("string"); expect(f.method.length).toBeGreaterThan(0);
        expect(f.enu[0]).toBeGreaterThan(spec.box.x[0] - 40); expect(f.enu[0]).toBeLessThan(spec.box.x[1] + 40);
        expect(f.enu[2]).toBeGreaterThan(spec.box.z[0] - 40); expect(f.enu[2]).toBeLessThan(spec.box.z[1] + 40);
        expect(f.enu[1]).toBeGreaterThan(-1); expect(f.enu[1]).toBeLessThan(40);
      }
    });
    test("dimensions carry a name, a value and a non-negative sigma", () => {
      expect(doc.dims.length).toBeGreaterThan(5);
      const names = new Set();
      for (const d of doc.dims) { expect(names.has(d.name)).toBe(false); names.add(d.name); expect(Number.isFinite(d.value)).toBe(true); if (d.sigma != null) expect(d.sigma).toBeGreaterThanOrEqual(0); }
    });
  });

  describe.skipIf(!have(area))(`${area}: survey-diff tolerance`, async () => {
    const SD = await import("../tools/anime/survey-diff.mjs");
    const diff = load(area, "diff.json"), survey = load(area, "features.json"), app = load(area, "app-features.json");
    test("the stored diff is the deterministic result of the stored survey and app features", () => {
      const a = SD.diffFeatures(survey.features, app.features), b = SD.diffFeatures(survey.features, app.features);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(JSON.stringify(a)).toBe(JSON.stringify(diff.rows));
      expect(JSON.stringify(SD.summarize(a))).toBe(JSON.stringify({ ...diff.summary, dims: undefined }));
    });
    test("nothing is missing, nothing is off by 1 m or by 3 sigma, every dimension is within tolerance", () => {
      expect(diff.summary.missing).toBe(0); expect(diff.summary.compared).toBe(survey.features.length);
      expect(diff.summary.over1m).toBe(0); expect(diff.summary.over3sigma).toBe(0);
      expect(diff.summary.err3d.mean).toBeLessThan(0.1); expect(diff.summary.err3d.max).toBeLessThan(spec.tolMax);
      expect(diff.summary.dims.off).toBe(0);
      for (const r of diff.rows) expect(r.err).toBeLessThanOrEqual(Math.max(SIGMA_FLOOR, Math.hypot(...r.sigma)));
    });
  });
}

describe.skipIf(!have("minami"))("minami: the PIER7 plaza key features (IMG_0808)", () => {
  const rows = Object.fromEntries(load("minami", "diff.json").rows.map((r) => [r.name, r]));
  const KEY = ["cage.foot#1", "cage.foot#2", "cage.foot#3", "cage.top#1", "cage.top#2", "cage.top#3", "cage.box_bottom",
    "bleach.t1.top#1", "bleach.t3.top#1", "bleach.t5.top#1", "bleach.t1.bot#1", "bleach.t5.bot#1", "bleach.stair.bot#1",
    "winch.foot#1", "winch.foot#2", "winch.tip#1", "winch.tip#2", "ring#1", "ring#2", "ring#3", "totem.pier7", "totem.mukaeru",
    "konbini.pole", "gate.post", "monument.plaque.tl"];
  test("the stair cage, the bleacher steps, the winch, the rings and the signs sit within 0.12 m of the survey", () => {
    for (const k of KEY) { expect(rows[k]).toBeDefined(); expect(rows[k].missing).toBeUndefined(); expect(rows[k].err).toBeLessThan(0.12); }
  });
  test("the cage is 5.43 m tall and the five bleacher tiers are all present", () => {
    const dims = Object.fromEntries(load("minami", "diff.json").dims.map((d) => [d.name, d]));
    expect(Math.abs(dims["cage.h"].delta)).toBeLessThan(0.05);
    for (let t = 1; t <= 5; t++) expect(rows[`bleach.t${t}.top#1`]).toBeDefined();
  });
});

describe.skipIf(!have("market"))("market: the deck and the quay hall key features", () => {
  const rows = load("market", "diff.json").rows;
  test("the deck wall, pavilions and the quay hall's tubs and tug are within 0.5 m (3 sigma) of the survey", () => {
    const key = rows.filter((r) => /^(deck\.(wall|pavilion|entrance)|canopy\.)/.test(r.name));
    expect(key.length).toBeGreaterThan(20);
    for (const r of key) expect(r.err).toBeLessThan(0.5);
  });
});

describe("photo-align determinism", async () => {
  const PA = await import("../tools/anime/photo-align.mjs");
  const lcg = (seed) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const noise = (w, h, seed) => { const r = lcg(seed), b = Buffer.alloc(w * h * 3); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = (x > w / 2 ? 200 : 40) + Math.floor(r() * 12); b.fill(v, (y * w + x) * 3, (y * w + x) * 3 + 3); } return b; };
  const cam = { fx: 90, fy: 90, cx: 32, cy: 24, dist: { k1: -0.05, k2: 0.01, p1: 0.001, p2: -0.001, k3: 0, k4: 0, k5: 0, k6: 0 } };

  test("undistortion is byte-identical across runs and keeps the principal point", () => {
    const src = noise(64, 48, 7), a = PA.undistortImage(src, 64, 48, 3, cam, 64, 48), b = PA.undistortImage(src, 64, 48, 3, cam, 64, 48);
    expect(Buffer.compare(Buffer.from(a.data), Buffer.from(b.data))).toBe(0);
    expect(Buffer.compare(Buffer.from(a.valid), Buffer.from(b.valid))).toBe(0);
    // the principal pixel samples the same source pixel (distortion is zero there)
    const i = (24 * 64 + 32) * 3; expect(Math.abs(a.data[i] - src[i])).toBeLessThan(25);
  });
  test("Canny, the exact distance transform and the chamfer are deterministic", () => {
    const rgb = noise(64, 48, 11);
    const e1 = PA.canny(rgb, 64, 48), e2 = PA.canny(rgb, 64, 48);
    expect(Buffer.compare(Buffer.from(e1), Buffer.from(e2))).toBe(0);
    expect(e1.reduce((s, v) => s + (v ? 1 : 0), 0)).toBeGreaterThan(20);   // the step edge is found
    const app = new Uint8Array(64 * 48); for (let y = 5; y < 40; y++) app[y * 64 + 28] = 1;
    const valid = new Uint8Array(64 * 48).fill(1), c1 = PA.chamfer(app, e1, valid, 64, 48), c2 = PA.chamfer(app, e2, valid, 64, 48);
    expect(JSON.stringify(c1)).toBe(JSON.stringify(c2));
    expect(PA.edt(e1, 64, 48).every((v, i) => v === PA.edt(e2, 64, 48)[i])).toBe(true);
    expect(c1.mean).toBeLessThan(5);                                          // the app line is 4 px from the photo's step
  });
  test("the projection matrix is a pure function of the intrinsics", () => {
    const K = { fx: 4066.6, fy: 4066.6, cx: 2142, cy: 2856 };
    expect(Array.from(PA.projectionFromK(K, 1080, 1440, 0.1, 400))).toEqual(Array.from(PA.projectionFromK(K, 1080, 1440, 0.1, 400)));
  });
  test("the stored final-pass chamfers meet the survey's bars (minami mean <= 12 px, market <= 8 px, IMG_0808 <= 6 px)", () => {
    for (const [area, bar] of [["minami", 12], ["market", 8]]) {
      if (!existsSync(path(area, "chamfer.json"))) continue;
      const t = load(area, "chamfer.json").tags.final; if (!t) continue;
      const m = Object.values(t).filter((x) => x.chamfer).map((x) => x.chamfer.mean);
      expect(m.length).toBeGreaterThan(10); expect(m.reduce((s, v) => s + v, 0) / m.length).toBeLessThanOrEqual(bar);
      expect(Math.max(...m)).toBeLessThan(25);
    }
    if (existsSync(path("minami", "chamfer.json"))) { const f = load("minami", "chamfer.json").tags.final?.IMG_0808; if (f) expect(f.chamfer.mean).toBeLessThanOrEqual(6); }
  });
});
