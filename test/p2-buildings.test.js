// P2 buildings: pure heuristics/extrusion tests + data/buildings schema tests (skipped until built).
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { hash01, llToEnu, sampleGrid } from "../src/core/geo.js";
import {
  ATTR_MAGIC, FLAG_ROOF, MESH_MAGIC, MeshBuilder, PALETTE, buildingHeight, clipLineToBox, clipRingToBox,
  codeByte, decodeAttr, decodeMesh, encodeAttr, encodeMesh, extrudeBuilding, isCcwFromAbove, isGabled, isLit,
  quantiseRoof, ringSelfIntersects, signedArea, triangulate, whiteBalanceGains,
} from "../scripts/buildings/lib.js";

const ROOT = join(import.meta.dir, "..");
const B = (f) => join(ROOT, "data/buildings", f);
const haveData = existsSync(B("city.json")) && existsSync(B("city.mesh.bin"));

// 10 x 20 m rectangle, CCW viewed from above: in (x, z) with z south that is clockwise numerically
const RECT = [[0, 0], [0, 20], [10, 20], [10, 0]];

describe("height heuristic (BUILD-SPEC §3 table)", () => {
  test("base heights at the 120 m² reference area stay within the ±6% jitter", () => {
    for (const [code, base] of [[3101, 6.5], [3102, 11], [3103, 24], [3111, 4], [3112, 4], [9999, 6]]) {
      for (let i = 0; i < 50; i++) {
        const h = buildingHeight(code, 120, `id${i}`);
        expect(h).toBeGreaterThanOrEqual(Math.max(3, base * 0.94) - 1e-9);
        expect(h).toBeLessThanOrEqual(base * 1.06 + 1e-9);
      }
    }
  });
  test("area factor: 1200 m² -> x1.25, 12 m² -> x0.75, saturating beyond", () => {
    const id = "fixed";
    const j = 0.94 + 0.12 * hash01(id);
    expect(buildingHeight(3102, 1200, id)).toBeCloseTo(11 * 1.25 * j, 9);
    expect(buildingHeight(3102, 120000, id)).toBeCloseTo(11 * 1.25 * j, 9);
    expect(buildingHeight(3102, 12, id)).toBeCloseTo(11 * 0.75 * j, 9);
  });
  test("clamped to 3..45 m", () => {
    expect(buildingHeight(3111, 1, "a")).toBeGreaterThanOrEqual(3);
    expect(buildingHeight(3103, 1e6, "b")).toBeLessThanOrEqual(45);
    const tall = { 3103: 24 };
    expect(buildingHeight(3103, 5000, "c")).toBeLessThanOrEqual(45);
    expect(tall[3103]).toBe(24);
  });
  test("gable share ~30% of 3101 only; lit share ~35%", () => {
    let g = 0, l = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) {
      if (isGabled(3101, `16/1/2/${i}`)) g++;
      if (isLit(`16/1/2/${i}`)) l++;
      expect(isGabled(3102, `16/1/2/${i}`)).toBe(false);
    }
    expect(g / N).toBeGreaterThan(0.28);
    expect(g / N).toBeLessThan(0.32);
    expect(l / N).toBeGreaterThan(0.33);
    expect(l / N).toBeLessThan(0.37);
  });
  test("code byte", () => {
    expect(codeByte(3101)).toBe(1);
    expect(codeByte(3112)).toBe(12);
    expect(codeByte(5000)).toBe(0);
  });
});

describe("footprint extrusion", () => {
  test("winding helpers", () => {
    expect(isCcwFromAbove(RECT)).toBe(true);
    expect(isCcwFromAbove(RECT.slice().reverse())).toBe(false);
    expect(Math.abs(signedArea(RECT))).toBe(200);
  });

  test("flat box: 4 walls + 2 roof triangles, outward normals, roof up", () => {
    const mb = new MeshBuilder();
    const r = extrudeBuilding(mb, { poly: RECT, base: 1, top: 9, code: 3102, roof: 3, lit: true });
    expect(r.tris).toBe(10);
    expect(mb.vertCount).toBe(16 + 4);
    const P = (i) => [mb.pos[i * 3], mb.pos[i * 3 + 1], mb.pos[i * 3 + 2]];
    const N = (i) => [mb.nrm[i * 3], mb.nrm[i * 3 + 1], mb.nrm[i * 3 + 2]];
    for (let t = 0; t < mb.idx.length; t += 3) {
      const [a, b, c] = [P(mb.idx[t]), P(mb.idx[t + 1]), P(mb.idx[t + 2])];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const vn = N(mb.idx[t]);
      // triangle winding (CCW front face) agrees with the stored normal
      expect(n[0] * vn[0] + n[1] * vn[1] + n[2] * vn[2]).toBeGreaterThan(0);
      // stored normal points away from the box centre (5, 5, 10)
      const cen = [(a[0] + b[0] + c[0]) / 3 - 5, (a[1] + b[1] + c[1]) / 3 - 5, (a[2] + b[2] + c[2]) / 3 - 10];
      expect(cen[0] * vn[0] + cen[1] * vn[1] + cen[2] * vn[2]).toBeGreaterThan(0);
    }
    const ys = Array.from({ length: mb.vertCount }, (_, i) => mb.pos[i * 3 + 1]);
    expect(Math.min(...ys)).toBe(1);
    expect(Math.max(...ys)).toBe(9);
    // uv.y = height fraction, uv.x = metres along the wall
    for (let i = 0; i < mb.vertCount; i++) {
      expect(mb.uv[i * 2 + 1]).toBeCloseTo((mb.pos[i * 3 + 1] - 1) / 8, 6);
    }
    expect(Math.max(...mb.uv.filter((_, i) => i % 2 === 0))).toBeCloseTo(60, 6);
    expect(mb.flags.filter((f) => f & FLAG_ROOF).length).toBe(4);
    expect(mb.roof.every((r) => r === 3)).toBe(true);
    expect(mb.flags.every((f) => f & 1)).toBe(true);
  });

  test("courtyard hole: extra inner walls, roof area = outer - hole", () => {
    const hole = [[3, 5], [7, 5], [7, 15], [3, 15]]; // CW from above
    expect(isCcwFromAbove(hole)).toBe(false);
    const mb = new MeshBuilder();
    extrudeBuilding(mb, { poly: RECT, holes: [hole], base: 0, top: 5, code: 3101 });
    let roofArea = 0;
    for (let t = 0; t < mb.idx.length; t += 3) {
      const [a, b, c] = [mb.idx[t], mb.idx[t + 1], mb.idx[t + 2]];
      if (!(mb.flags[a] & FLAG_ROOF)) continue;
      const ax = mb.pos[a * 3], az = mb.pos[a * 3 + 2];
      roofArea += Math.abs((mb.pos[b * 3] - ax) * (mb.pos[c * 3 + 2] - az) - (mb.pos[c * 3] - ax) * (mb.pos[b * 3 + 2] - az)) / 2;
    }
    expect(roofArea).toBeCloseTo(200 - 40, 6);
  });

  test("gable roof on a rectangle rises 1.5 m along the long axis", () => {
    const mb = new MeshBuilder();
    const r = extrudeBuilding(mb, { poly: RECT, base: 0, top: 6, code: 3101, gable: true });
    expect(r.gabled).toBe(true);
    const ys = Array.from({ length: mb.vertCount }, (_, i) => mb.pos[i * 3 + 1]);
    expect(Math.max(...ys)).toBeCloseTo(7.5, 6);
    // ridge vertices lie on x = 5 (long axis is z)
    for (let i = 0; i < mb.vertCount; i++) if (Math.abs(ys[i] - 7.5) < 1e-6) expect(mb.pos[i * 3]).toBeCloseTo(5, 6);
  });

  test("L-shaped footprint triangulates and never gables", () => {
    const L = [[0, 0], [0, 10], [10, 10], [10, 6], [4, 6], [4, 0]];
    const poly = isCcwFromAbove(L) ? L : L.slice().reverse();
    expect(ringSelfIntersects(poly)).toBe(false);
    const t = triangulate(poly);
    expect(t.indices.length / 3).toBe(4);
    expect(t.deviation).toBeLessThan(1e-9);
    const mb = new MeshBuilder();
    expect(extrudeBuilding(mb, { poly, base: 0, top: 6, code: 3101, gable: true }).gabled).toBe(false);
  });

  test("self-intersection detector", () => {
    expect(ringSelfIntersects([[0, 0], [10, 10], [10, 0], [0, 10]])).toBe(true);
  });

  test("tile clipping", () => {
    const c = clipRingToBox([[-80, 100], [200, 100], [200, 300], [-80, 300]], 0, 4096);
    expect(Math.abs(signedArea(c))).toBe(200 * 200);
    const lines = clipLineToBox([[-10, 5], [50, 5], [50, 5000]], 0, 4096);
    expect(lines.length).toBe(1);
    expect(lines[0][0]).toEqual([0, 5]);
    const end = lines[0][lines[0].length - 1];
    expect(end[0]).toBeCloseTo(50, 9);
    expect(end[1]).toBeCloseTo(4096, 9);
  });

  test("KLC1/KLA1 encode-decode round trip, aligned index block", () => {
    const mb = new MeshBuilder();
    extrudeBuilding(mb, { poly: RECT, base: 0, top: 6, code: 3101, roof: 2 });
    extrudeBuilding(mb, { poly: RECT.map(([x, z]) => [x + 20, z]), base: 0, top: 6, code: 3101, gable: true });
    const bin = encodeMesh(mb);
    const m = decodeMesh(bin);
    expect(m.magic).toBe(MESH_MAGIC);
    expect(m.vertCount % 4).toBe(0);
    expect(m.byteLength).toBe(12 + m.vertCount * 33 + m.indexCount * 4);
    expect(Array.from(m.idx)).toEqual(mb.idx);
    expect(Array.from(m.code)).toEqual(mb.code);
    expect(m.pos[3]).toBeCloseTo(mb.pos[3], 5);
    const a = decodeAttr(encodeAttr(mb));
    expect(a.magic).toBe(ATTR_MAGIC);
    expect(a.vertCount).toBe(m.vertCount);
    expect(Array.from(a.roof)).toEqual(mb.roof);
  });
});

describe("roof colour quantisation (ADDENDUM-model §2)", () => {
  test("palette and representative aerial colours", () => {
    expect(PALETTE.map((p) => p.name)).toEqual(["white", "grey", "red", "blue", "brown"]);
    expect(quantiseRoof(230, 228, 222)).toBe(0); // white flat RC roof
    expect(quantiseRoof(110, 112, 110)).toBe(1); // grey kawara / slate
    expect(quantiseRoof(190, 80, 70)).toBe(2); // red tile
    expect(quantiseRoof(70, 110, 170)).toBe(3); // blue metal
    expect(quantiseRoof(60, 140, 160)).toBe(3); // teal metal reads blue
    expect(quantiseRoof(140, 100, 70)).toBe(4); // brown
    expect(quantiseRoof(110, 70, 65)).toBe(4); // dark red-brown
  });
  test("white balance removes a teal cast", () => {
    const pool = Array.from({ length: 50 }, (_, i) => [100 + i, 120 + i, 125 + i]);
    const g = whiteBalanceGains(pool);
    const c = [150, 170, 175].map((v, i) => v * g[i]);
    expect(Math.max(...c) - Math.min(...c)).toBeLessThan(6);
  });
});

// ------------------------------------------------------------------------------------ data files
describe.skipIf(!haveData)("data/buildings outputs", () => {
  let city;
  const load = async () => (city ??= await Bun.file(B("city.json")).json());

  test("layers.json lists the building layer BldA with vt_code", async () => {
    const l = await Bun.file(B("layers.json")).json();
    expect(l.buildingLayer).toBe("BldA");
    expect(l.layers.BldA.keys).toContain("vt_code");
    for (const k of ["RdCL", "Cstline", "WA", "Anno"]) expect(Object.keys(l.layers)).toContain(k);
  });

  test(">= 8000 features, schema, heights 3-45 m", async () => {
    const c = await load();
    expect(c.count).toBe(c.features.length);
    expect(c.count).toBeGreaterThanOrEqual(8000);
    expect(c.origin.lat).toBe(38.906);
    const ids = new Set();
    for (const f of c.features) {
      expect(typeof f.id).toBe("string");
      expect(f.id).toMatch(/^16\/\d+\/\d+\/\d+(\.\d+)?$/);
      ids.add(f.id);
      expect(Number.isInteger(f.code)).toBe(true);
      expect(f.h).toBeGreaterThanOrEqual(3);
      expect(f.h).toBeLessThanOrEqual(45);
      expect(typeof f.lit).toBe("boolean");
      expect(f.roof >= 0 && f.roof < PALETTE.length).toBe(true);
      expect(f.rgb.length).toBe(3);
      expect(f.poly.length).toBeGreaterThanOrEqual(3);
      expect(Array.isArray(f.holes)).toBe(true);
    }
    expect(ids.size).toBe(c.count);
  });

  test("every polygon CCW from above, holes CW, non-self-intersecting, earcut succeeds", async () => {
    const c = await load();
    let bad = [];
    for (const f of c.features) {
      if (!isCcwFromAbove(f.poly) || ringSelfIntersects(f.poly)) bad.push(f.id);
      for (const h of f.holes) if (isCcwFromAbove(h)) bad.push(f.id + " hole");
      const t = triangulate(f.poly, f.holes);
      if (!t.indices.length || t.deviation > 0.05) bad.push(f.id + " earcut");
    }
    expect(bad).toEqual([]);
  });

  for (const name of ["city", "core"]) {
    test(`${name}.mesh.bin magic/counts match file; attr matches`, async () => {
      const bytes = new Uint8Array(await Bun.file(B(`${name}.mesh.bin`)).arrayBuffer());
      const m = decodeMesh(bytes);
      expect(m.magic).toBe(0x4b4c4331);
      expect(bytes.byteLength).toBe(12 + m.vertCount * (12 + 12 + 8 + 1) + m.indexCount * 4);
      expect(m.indexCount % 3).toBe(0);
      let maxI = 0;
      for (const i of m.idx) if (i > maxI) maxI = i;
      expect(maxI).toBeLessThan(m.vertCount);
      for (let i = 0; i < m.nrm.length; i += 3 * 101) {
        expect(Math.hypot(m.nrm[i], m.nrm[i + 1], m.nrm[i + 2])).toBeCloseTo(1, 3);
      }
      const a = decodeAttr(new Uint8Array(await Bun.file(B(`${name}.attr.bin`)).arrayBuffer()));
      expect(a.magic).toBe(0x4b4c4131);
      expect(a.vertCount).toBe(m.vertCount);
      if (name === "city") expect(m.indexCount / 3).toBeLessThanOrEqual(1_200_000);
    });
  }

  test("a building on the market quay has its base within 1 m of the terrain", async () => {
    const c = await load();
    const meta = await Bun.file(join(ROOT, "data/terrain/core.json")).json();
    const h = new Float32Array(await Bun.file(join(ROOT, "data/terrain/core.f32")).arrayBuffer());
    const m = llToEnu(38.899, 141.58187); // quay-side market shed (OSM way 気仙沼魚市場)
    let best = null, bd = Infinity;
    for (const f of c.features) {
      const cx = f.poly.reduce((s, p) => s + p[0], 0) / f.poly.length;
      const cz = f.poly.reduce((s, p) => s + p[1], 0) / f.poly.length;
      const d = Math.hypot(cx - m.x, cz - m.z);
      if (d < bd) (bd = d), (best = { f, cx, cz });
    }
    expect(bd).toBeLessThan(60);
    expect(best.f.core).toBe(true);
    const terrain = sampleGrid(h, meta, best.cx, best.cz);
    expect(Math.abs(best.f.base - terrain)).toBeLessThanOrEqual(1);
    expect(Math.abs(best.f.ground - terrain)).toBeLessThanOrEqual(0.5);
  });

  test("roads/coast/rail line files", async () => {
    for (const n of ["roads", "coast", "rail"]) {
      const j = await Bun.file(B(`${n}.json`)).json();
      expect(Array.isArray(j.lines)).toBe(true);
      if (n !== "rail") expect(j.lines.length).toBeGreaterThan(100);
      for (const l of j.lines.slice(0, 500)) {
        expect(l.length).toBeGreaterThanOrEqual(2);
        for (const p of l) expect(p.length).toBe(2);
      }
    }
  });

  test("trees: KLT1 layout, on land, forest types", async () => {
    const meta = await Bun.file(B("trees.json")).json();
    for (const f of ["trees_core.bin", "trees_city.bin"]) {
      const buf = new Uint8Array(await Bun.file(B(f)).arrayBuffer());
      const dv = new DataView(buf.buffer);
      expect(dv.getUint32(0, true)).toBe(0x4b4c5431);
      const n = dv.getUint32(4, true);
      expect(n).toBe(meta.files[f].count);
      expect(n).toBeGreaterThan(10000);
      expect(buf.byteLength).toBe(8 + n * 17);
      const p = new Float32Array(buf.buffer, 8, n * 4);
      for (let i = 0; i < n; i += 97) {
        expect(p[i * 4 + 1]).toBeGreaterThanOrEqual(1); // ground above the sea
        expect(p[i * 4 + 3]).toBeGreaterThan(1);
        expect(p[i * 4 + 3]).toBeLessThan(10);
      }
      const types = new Uint8Array(buf.buffer, 8 + n * 16, n);
      expect(Math.max(...types.subarray(0, 5000))).toBeLessThanOrEqual(3);
    }
  });

  test("core.obj is importable text with v/vt/vn/f and materials", async () => {
    const txt = await Bun.file(B("core.obj")).text();
    const m = decodeMesh(new Uint8Array(await Bun.file(B("core.mesh.bin")).arrayBuffer()));
    const count = (re) => (txt.match(re) || []).length;
    expect(count(/^v /gm)).toBe(m.vertCount);
    expect(count(/^f /gm)).toBe(m.indexCount / 3);
    expect(txt).toContain("mtllib core.mtl");
    const mtl = await Bun.file(B("core.mtl")).text();
    for (const p of PALETTE) expect(mtl).toContain(`newmtl roof_${p.name}`);
  });
});
