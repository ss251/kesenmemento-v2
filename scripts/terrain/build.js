// P1: terrain + ortho. `bun run scripts/terrain/build.js [--only terrain|ortho] [--force]`
// Outputs data/terrain/{city,core}.{f32,terrarium.png,json} and data/ortho/{city,core,core_2k}.{jpg,json}.
// Idempotent: tiles come from raw/tiles cache; outputs are rebuilt only when missing or --force.
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { BBOX, bboxToEnu, CRS, encodeTerrarium } from "../../src/core/geo.js";
import {
  demMosaic,
  enuXToMosaicPx,
  enuZToMosaicPy,
  rgbMosaic,
  sampleFloat,
  sampleRgb,
} from "./mosaic.js";
import { ROOT } from "./tiles.js";

const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const force = args.includes("--force");
const TERRAIN = join(ROOT, "data/terrain");
const ORTHO = join(ROOT, "data/ortho");

const r3 = (v) => Math.round(v * 1000) / 1000;

export function gridSpec(name, d) {
  const bbox = BBOX[name];
  const [x0, z0, x1, z1] = bboxToEnu(bbox);
  const width = Math.ceil((x1 - x0) / d) + 1;
  const height = Math.ceil((z1 - z0) / d) + 1;
  return { name, bbox, width, height, x0: r3(x0), z0: r3(z0), dx: d, dz: d };
}

async function fresh(paths) {
  if (force) return false;
  for (const p of paths) if (!(await Bun.file(p).exists())) return false;
  return true;
}

function resampleDem(spec, primary, fallback) {
  const { width: W, height: H } = spec;
  const out = new Float32Array(W * H);
  const pxP = new Float64Array(W), pxF = new Float64Array(W);
  for (let c = 0; c < W; c++) {
    const x = spec.x0 + c * spec.dx;
    pxP[c] = enuXToMosaicPx(primary, x);
    if (fallback) pxF[c] = enuXToMosaicPx(fallback, x);
  }
  let filled = 0, sea = 0, minH = Infinity, maxH = -Infinity;
  for (let r = 0; r < H; r++) {
    const z = spec.z0 + r * spec.dz;
    const pyP = enuZToMosaicPy(primary, z);
    const pyF = fallback ? enuZToMosaicPy(fallback, z) : 0;
    for (let c = 0; c < W; c++) {
      let h = sampleFloat(primary, pxP[c], pyP);
      if (Number.isNaN(h) && fallback) {
        h = sampleFloat(fallback, pxF[c], pyF);
        if (!Number.isNaN(h)) filled++;
      }
      if (Number.isNaN(h)) {
        h = 0;
        sea++;
      }
      out[r * W + c] = h;
      if (h < minH) minH = h;
      if (h > maxH) maxH = h;
    }
  }
  return { heights: out, filled, sea, minH, maxH };
}

async function writeTerrain(spec, res, source) {
  const { width: W, height: H } = spec;
  await Bun.write(join(TERRAIN, `${spec.name}.f32`), new Uint8Array(res.heights.buffer));
  const rgb = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    const [R, G, B] = encodeTerrarium(res.heights[i]);
    rgb[i * 3] = R;
    rgb[i * 3 + 1] = G;
    rgb[i * 3 + 2] = B;
  }
  await sharp(rgb, { raw: { width: W, height: H, channels: 3 } })
    .png({ compressionLevel: 6 })
    .toFile(join(TERRAIN, `${spec.name}.terrarium.png`));
  const meta = {
    name: spec.name,
    bbox: spec.bbox,
    width: W,
    height: H,
    x0: spec.x0,
    z0: spec.z0,
    dx: spec.dx,
    dz: spec.dz,
    minH: Math.round(res.minH * 100) / 100,
    maxH: Math.round(res.maxH * 100) / 100,
    source,
    crs: CRS,
    format: "float32 LE row-major, row 0 = north (z0), x = x0 + col*dx, z = z0 + row*dz; sea/no-data = 0",
  };
  await Bun.write(join(TERRAIN, `${spec.name}.json`), JSON.stringify(meta, null, 1));
  console.log(
    `  terrain ${spec.name}: ${W}x${H}, h ${meta.minH}..${meta.maxH} m, fallback-filled ${res.filled}, sea ${res.sea}`,
  );
}

async function buildTerrain() {
  const city = gridSpec("city", 8);
  const core = gridSpec("core", 3.7);
  const names = ["city", "core"].flatMap((n) => [`${n}.f32`, `${n}.json`, `${n}.terrarium.png`]);
  if (await fresh(names.map((n) => join(TERRAIN, n)))) {
    console.log("terrain: up to date (use --force to rebuild)");
    return;
  }
  await mkdir(TERRAIN, { recursive: true });
  console.log("terrain: DEM 10 m (dem_png z14) for city");
  const dem10 = await demMosaic("dem_png", BBOX.city, 14, 1);
  console.log("terrain: DEM 5 m (dem5a_png z15) for core");
  const dem5 = await demMosaic("dem5a_png", BBOX.core, 15, 1);
  await writeTerrain(city, resampleDem(city, dem10, null), "dem_png z14");
  await writeTerrain(core, resampleDem(core, dem5, dem10), "dem5a_png z15 (gaps from dem_png z14)");
}

async function buildOrtho(name, z, size, extra) {
  const spec = gridSpec(name, 1);
  const [x0, z0, x1, z1] = bboxToEnu(spec.bbox);
  const dx = (x1 - x0) / size, dz = (z1 - z0) / size;
  const outs = [`${name}.jpg`, `${name}.json`, ...(extra ? [`${extra.name}.jpg`, `${extra.name}.json`] : [])];
  if (await fresh(outs.map((n) => join(ORTHO, n)))) {
    console.log(`ortho ${name}: up to date`);
    return;
  }
  await mkdir(ORTHO, { recursive: true });
  console.log(`ortho ${name}: seamlessphoto z${z} -> ${size}x${size}`);
  const m = await rgbMosaic("seamlessphoto", spec.bbox, z, 0);
  console.log(`  mosaic ${m.w}x${m.h}, ${m.present}/${m.total} tiles present`);
  const px = new Float64Array(size);
  for (let i = 0; i < size; i++) px[i] = enuXToMosaicPx(m, x0 + (i + 0.5) * dx);
  const out = Buffer.alloc(size * size * 3);
  for (let j = 0; j < size; j++) {
    const py = enuZToMosaicPy(m, z0 + (j + 0.5) * dz);
    for (let i = 0; i < size; i++) sampleRgb(m, px[i], py, out, (j * size + i) * 3);
  }
  const meta = (w) => ({
    bbox: spec.bbox,
    width: w,
    height: w,
    x0: r3(x0),
    z0: r3(z0),
    dx: (x1 - x0) / w,
    dz: (z1 - z0) / w,
    source: `seamlessphoto z${z}`,
    crs: CRS,
    uv: "u = (x - x0) / (width*dx), v = (z - z0) / (height*dz); v = 0 is the north edge (image row 0)",
  });
  const img = sharp(out, { raw: { width: size, height: size, channels: 3 } });
  await img.clone().jpeg({ quality: 85 }).toFile(join(ORTHO, `${name}.jpg`));
  await Bun.write(join(ORTHO, `${name}.json`), JSON.stringify(meta(size), null, 1));
  if (extra) {
    await sharp(out, { raw: { width: size, height: size, channels: 3 } })
      .resize(extra.size, extra.size, { kernel: "lanczos3" })
      .jpeg({ quality: 85 })
      .toFile(join(ORTHO, `${extra.name}.jpg`));
    await Bun.write(join(ORTHO, `${extra.name}.json`), JSON.stringify(meta(extra.size), null, 1));
  }
  console.log(`  wrote ${name}.jpg${extra ? ` + ${extra.name}.jpg` : ""}`);
}

if (import.meta.main) {
  const t0 = performance.now();
  if (!only || only === "terrain") await buildTerrain();
  if (!only || only === "ortho") {
    await buildOrtho("city", 15, 4096);
    await buildOrtho("core", 18, 8192, { name: "core_2k", size: 2048 });
  }
  console.log(`P1 done in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
}
