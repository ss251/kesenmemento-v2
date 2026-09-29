// QA: top-down "model mode" raster of the pipeline outputs (no GPU; sharp only).
// `bun run scripts/buildings/preview.js [--mpp 2] [--crop x0,z0,x1,z1] [--out path]`
// Pale sand hillshaded terrain, pale water, white footprints with palette roofs, dotted model trees.
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import sharp from "sharp";
import { bboxToEnu, BBOX, sampleGrid } from "../../src/core/geo.js";
import { ROOT } from "../terrain/tiles.js";
import { PALETTE, pointInPolygon } from "./lib.js";

const args = process.argv.slice(2);
const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const mpp = Number(arg("--mpp", 2));
const crop = arg("--crop", null);
const out = arg("--out", join(ROOT, "dist/qa/pipeline/core_model_topdown.png"));
const [X0, Z0, X1, Z1] = crop ? crop.split(",").map(Number) : bboxToEnu(BBOX.core);
const W = Math.round((X1 - X0) / mpp), H = Math.round((Z1 - Z0) / mpp);

const meta = await Bun.file(join(ROOT, "data/terrain/core.json")).json();
const hts = new Float32Array(await Bun.file(join(ROOT, "data/terrain/core.f32")).arrayBuffer());
const img = Buffer.alloc(W * H * 3);
const SAND = [232, 224, 207], WATER = [188, 204, 208];
for (let j = 0; j < H; j++) {
  const z = Z0 + (j + 0.5) * mpp;
  for (let i = 0; i < W; i++) {
    const x = X0 + (i + 0.5) * mpp;
    const h = sampleGrid(hts, meta, x, z);
    const k = (j * W + i) * 3;
    if (!(h > 0.3)) {
      img.set(WATER, k);
      continue;
    }
    const e = 2 * mpp;
    const dx = (sampleGrid(hts, meta, x + e, z) - sampleGrid(hts, meta, x - e, z)) / (2 * e);
    const dz = (sampleGrid(hts, meta, x, z + e) - sampleGrid(hts, meta, x, z - e)) / (2 * e);
    // light from the north-west, above
    let shade = (1 + (dx * 0.6 + dz * 0.6)) / Math.sqrt(1 + dx * dx + dz * dz);
    shade = Math.max(0.72, Math.min(1.08, Number.isFinite(shade) ? shade : 1));
    for (let c = 0; c < 3; c++) img[k + c] = Math.min(255, SAND[c] * shade);
  }
}
// trees
const tb = new Uint8Array(await Bun.file(join(ROOT, "data/buildings/trees_core.bin")).arrayBuffer());
const tdv = new DataView(tb.buffer);
const tn = tdv.getUint32(4, true);
const tf = new Float32Array(tb.buffer, 8, tn * 4);
const TREE = [[108, 150, 92], [84, 128, 86], [128, 160, 96], [140, 170, 100]];
const ttype = new Uint8Array(tb.buffer, 8 + tn * 16, tn);
for (let t = 0; t < tn; t++) {
  const x = tf[t * 4], z = tf[t * 4 + 2], r = tf[t * 4 + 3] / mpp;
  const ci = (x - X0) / mpp, cj = (z - Z0) / mpp;
  if (ci < -r || cj < -r || ci > W + r || cj > H + r) continue;
  const col = TREE[ttype[t]] ?? TREE[0];
  for (let j = Math.floor(cj - r); j <= Math.ceil(cj + r); j++)
    for (let i = Math.floor(ci - r); i <= Math.ceil(ci + r); i++) {
      if (i < 0 || j < 0 || i >= W || j >= H) continue;
      const d = Math.hypot(i + 0.5 - ci, j + 0.5 - cj) / r;
      if (d > 1) continue;
      const k = (j * W + i) * 3;
      const lift = 1.12 - 0.3 * d; // round shading
      for (let c = 0; c < 3; c++) img[k + c] = Math.min(255, col[c] * lift);
    }
}
// buildings (roof colour; thin darker outline)
const city = await Bun.file(join(ROOT, "data/buildings/city.json")).json();
for (const f of city.features) {
  const xs = f.poly.map((p) => p[0]), zs = f.poly.map((p) => p[1]);
  const i0 = Math.floor((Math.min(...xs) - X0) / mpp), i1 = Math.ceil((Math.max(...xs) - X0) / mpp);
  const j0 = Math.floor((Math.min(...zs) - Z0) / mpp), j1 = Math.ceil((Math.max(...zs) - Z0) / mpp);
  if (i1 < 0 || j1 < 0 || i0 >= W || j0 >= H) continue;
  const col = PALETTE[f.roof].rgb;
  for (let j = Math.max(0, j0); j <= Math.min(H - 1, j1); j++)
    for (let i = Math.max(0, i0); i <= Math.min(W - 1, i1); i++) {
      const x = X0 + (i + 0.5) * mpp, z = Z0 + (j + 0.5) * mpp;
      if (!pointInPolygon(x, z, f.poly, f.holes)) continue;
      const k = (j * W + i) * 3;
      const edge =
        !pointInPolygon(x + mpp, z, f.poly, f.holes) || !pointInPolygon(x - mpp, z, f.poly, f.holes) ||
        !pointInPolygon(x, z + mpp, f.poly, f.holes) || !pointInPolygon(x, z - mpp, f.poly, f.holes);
      const s = edge ? 0.78 : 1;
      for (let c = 0; c < 3; c++) img[k + c] = col[c] * s;
    }
}
await mkdir(dirname(out), { recursive: true });
await sharp(img, { raw: { width: W, height: H, channels: 3 } }).png().toFile(out);
console.log(`preview ${W}x${H} @ ${mpp} m/px -> ${out}`);
