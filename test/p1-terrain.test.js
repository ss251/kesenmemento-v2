// P1 terrain + ortho outputs. Skips when data/ has not been built (bun run scripts/terrain/build.js).
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { BBOX, bboxToEnu, decodeGsiDem, decodeTerrarium, llToEnu, llToTile, sampleGrid } from "../src/core/geo.js";

const ROOT = join(import.meta.dir, "..");
const T = (f) => join(ROOT, "data/terrain", f);
const O = (f) => join(ROOT, "data/ortho", f);
const haveTerrain = existsSync(T("core.f32")) && existsSync(T("city.f32"));
const haveOrtho = existsSync(O("core.jpg"));

async function grid(name) {
  const meta = await Bun.file(T(`${name}.json`)).json();
  const h = new Float32Array(await Bun.file(T(`${name}.f32`)).arrayBuffer());
  return { meta, h };
}
const ANBA = [38.91492, 141.56931]; // OSM natural=peak 安波山 ele 238; GSI 地名検索 38.91496, 141.56914
const INNER_BAY = [38.9063, 141.5768];

describe.skipIf(!haveTerrain)("terrain grids", () => {
  for (const [name, d] of [["city", 8], ["core", 3.7]]) {
    test(`${name}.json covers its bbox at ${d} m`, async () => {
      const { meta, h } = await grid(name);
      expect(meta.name).toBe(name);
      expect(meta.bbox).toEqual(BBOX[name]);
      expect(meta.dx).toBe(d);
      expect(meta.dz).toBe(d);
      expect(meta.crs).toBe("ENU origin 38.9060N 141.5750E");
      const [x0, z0, x1, z1] = bboxToEnu(BBOX[name]);
      expect(Math.abs(meta.x0 - x0)).toBeLessThan(0.01);
      expect(Math.abs(meta.z0 - z0)).toBeLessThan(0.01);
      expect(meta.x0 + (meta.width - 1) * meta.dx).toBeGreaterThanOrEqual(x1);
      expect(meta.z0 + (meta.height - 1) * meta.dz).toBeGreaterThanOrEqual(z1);
      expect(h.length).toBe(meta.width * meta.height);
      let bad = 0, mn = Infinity, mx = -Infinity;
      for (const v of h) {
        if (!Number.isFinite(v)) bad++;
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
      expect(bad).toBe(0); // NaN -> 0
      expect(mn).toBeCloseTo(meta.minH, 1);
      expect(mx).toBeCloseTo(meta.maxH, 1);
    });

    test(`${name}: Anbasan summit 230-245 m, inner-bay water 0 +/- 1 m`, async () => {
      const { meta, h } = await grid(name);
      const a = llToEnu(...ANBA), b = llToEnu(...INNER_BAY);
      const ha = sampleGrid(h, meta, a.x, a.z);
      expect(ha).toBeGreaterThanOrEqual(230);
      expect(ha).toBeLessThanOrEqual(245);
      expect(Math.abs(sampleGrid(h, meta, b.x, b.z))).toBeLessThanOrEqual(1);
    });

    test(`${name}.terrarium.png matches ${name}.f32 within 1/256 m`, async () => {
      const { meta, h } = await grid(name);
      const { data, info } = await sharp(T(`${name}.terrarium.png`)).raw().toBuffer({ resolveWithObject: true });
      expect(info.width).toBe(meta.width);
      expect(info.height).toBe(meta.height);
      const c = info.channels;
      for (let i = 0; i < h.length; i += 997) {
        const v = decodeTerrarium(data[i * c], data[i * c + 1], data[i * c + 2]);
        expect(Math.abs(v - h[i])).toBeLessThanOrEqual(1 / 256 + 1e-4);
      }
    });
  }

  test("core grid agrees with the raw 5 m DEM tile at a known pixel", async () => {
    const { meta, h } = await grid("core");
    const p = Bun.file(join(ROOT, "raw/tiles/dem5a_png/15/29269/12533.png"));
    if (!(await p.exists())) return; // cache not present on this machine
    const { data } = await sharp(await p.arrayBuffer()).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    // pixel 143,200 of that tile = GSI API 60.7 m at 38.909986N 141.564996E
    const k = (200 * 256 + 143) * 3;
    const raw = decodeGsiDem(data[k], data[k + 1], data[k + 2]);
    const e = llToEnu(38.909986, 141.564996);
    expect(Math.abs(sampleGrid(h, meta, e.x, e.z) - raw)).toBeLessThan(2.5); // bilinear on a slope
  });
});

describe.skipIf(!haveOrtho)("ortho", () => {
  for (const [name, size] of [["city", 4096], ["core", 8192], ["core_2k", 2048]]) {
    test(`${name}.jpg is ${size}² and ${name}.json is ENU-uniform`, async () => {
      const meta = await Bun.file(O(`${name}.json`)).json();
      const info = await sharp(O(`${name}.jpg`), { limitInputPixels: false }).metadata();
      expect([info.width, info.height, meta.width, meta.height]).toEqual([size, size, size, size]);
      const bb = name.startsWith("core") ? BBOX.core : BBOX.city;
      expect(meta.bbox).toEqual(bb);
      const [x0, z0, x1, z1] = bboxToEnu(bb);
      expect(Math.abs(meta.x0 + meta.width * meta.dx - x1)).toBeLessThan(0.05);
      expect(Math.abs(meta.z0 + meta.height * meta.dz - z1)).toBeLessThan(0.05);
      expect(Math.abs(meta.x0 - x0)).toBeLessThan(0.01);
    });
  }

  test("ortho UV maps the fish market pixel within 10 px of the raw z18 tile", async () => {
    // Independent path: lat/lon -> Web Mercator -> raw seamlessphoto z18 tile pixels (not the ENU resample).
    const [lat, lon] = [38.899, 141.58187];
    const t = llToTile(lat, lon, 18);
    const tp = join(ROOT, `raw/tiles/seamlessphoto/18/${t.x}/${t.y}.jpg`);
    if (!existsSync(tp)) return;
    const meta = await Bun.file(O("core.json")).json();
    const e = llToEnu(lat, lon);
    const u = (e.x - meta.x0) / (meta.width * meta.dx), v = (e.z - meta.z0) / (meta.height * meta.dz);
    const ci = Math.floor(u * meta.width), cj = Math.floor(v * meta.height);
    // 48x48 reference patch from a 3x3 raw tile mosaic centred on the market
    const R = 24, S = 12;
    const mosaic = new Uint8Array(768 * 768 * 3);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const f = join(ROOT, `raw/tiles/seamlessphoto/18/${t.x + dx}/${t.y + dy}.jpg`);
        const { data } = await sharp(f).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        for (let j = 0; j < 256; j++)
          mosaic.set(data.subarray(j * 768, (j + 1) * 768), (((dy + 1) * 256 + j) * 768 + (dx + 1) * 256) * 3);
      }
    const mx = 256 + (t.fx - t.x) * 256, my = 256 + (t.fy - t.y) * 256;
    // ortho is ~0.54 m/px, raw z18 ~0.465 m/px: resample the raw patch onto the ortho pixel grid
    const mPerRaw = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / 2 ** 18 / 256;
    const scale = meta.dx / mPerRaw;
    const ref = [];
    for (let j = -R; j < R; j++)
      for (let i = -R; i < R; i++) {
        const x = Math.round(mx + (i + 0.5) * scale), y = Math.round(my + (j + 0.5) * scale * (meta.dz / meta.dx));
        const k = (y * 768 + x) * 3;
        ref.push(mosaic[k] + mosaic[k + 1] + mosaic[k + 2]);
      }
    const { data: ortho } = await sharp(O("core.jpg"), { limitInputPixels: false })
      .extract({ left: ci - R - S, top: cj - R - S, width: 2 * (R + S), height: 2 * (R + S) })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const W = 2 * (R + S);
    const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
    const rm = mean(ref);
    let best = { score: -2, dx: 99, dy: 99 };
    for (let oy = -S; oy <= S; oy++)
      for (let ox = -S; ox <= S; ox++) {
        const p = [];
        for (let j = 0; j < 2 * R; j++)
          for (let i = 0; i < 2 * R; i++) {
            const k = ((j + S + oy) * W + (i + S + ox)) * 3;
            p.push(ortho[k] + ortho[k + 1] + ortho[k + 2]);
          }
        const pm = mean(p);
        let num = 0, da = 0, db = 0;
        for (let q = 0; q < p.length; q++) {
          num += (p[q] - pm) * (ref[q] - rm);
          da += (p[q] - pm) ** 2;
          db += (ref[q] - rm) ** 2;
        }
        const score = num / Math.sqrt(da * db || 1);
        if (score > best.score) best = { score, dx: ox, dy: oy };
      }
    expect(best.score).toBeGreaterThan(0.6);
    expect(Math.hypot(best.dx, best.dy)).toBeLessThanOrEqual(10);
  });
});
