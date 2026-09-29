// Tile mosaics and ENU-uniform resampling shared by terrain, ortho and roof sampling.
import sharp from "sharp";
import { decodeGsiDem, LAT0, LON0, M_PER_DEG_LAT, M_PER_DEG_LON } from "../../src/core/geo.js";
import { fetchTiles, rangeTiles, readTile, tileRange } from "./tiles.js";

const TS = 256;

/** Mercator pixel coords (at zoom z, 256 px tiles) of a lon / lat. */
export function lonToPx(lon, z) {
  return ((lon + 180) / 360) * 2 ** z * TS;
}
export function latToPx(lat, z) {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z * TS;
}

export async function decodeRaw(buf, channels = 3) {
  const img = sharp(buf);
  const pipe = channels === 3 ? img.removeAlpha() : img;
  const { data, info } = await pipe.raw().toBuffer({ resolveWithObject: true });
  if (info.width !== TS || info.height !== TS) throw new Error(`unexpected tile size ${info.width}x${info.height}`);
  return data;
}

/**
 * Float32 DEM mosaic of a bbox at zoom z. NaN = no data / sea / missing tile.
 * Returns {z, x0, y0, w, h, data} where pixel (0,0) is the NW corner of tile (x0, y0).
 */
export async function demMosaic(dataset, bbox, z, margin = 1) {
  const r0 = tileRange(bbox, z);
  const r = { z, x0: r0.x0 - margin, y0: r0.y0 - margin, x1: r0.x1 + margin, y1: r0.y1 + margin };
  const tiles = rangeTiles(r);
  await fetchTiles(dataset, z, tiles);
  const nx = r.x1 - r.x0 + 1, ny = r.y1 - r.y0 + 1;
  const w = nx * TS, h = ny * TS;
  const data = new Float32Array(w * h).fill(NaN);
  let present = 0;
  for (const [x, y] of tiles) {
    const buf = await readTile(dataset, z, x, y);
    if (!buf) continue;
    present++;
    const px = await decodeRaw(buf, 3);
    const ox = (x - r.x0) * TS, oy = (y - r.y0) * TS;
    for (let j = 0; j < TS; j++) {
      const row = (oy + j) * w + ox;
      for (let i = 0; i < TS; i++) {
        const k = (j * TS + i) * 3;
        data[row + i] = decodeGsiDem(px[k], px[k + 1], px[k + 2]);
      }
    }
  }
  return { z, x0: r.x0, y0: r.y0, w, h, data, present, total: tiles.length };
}

/** Sea colour used where seamlessphoto has no tile (open sea east of Karakuwa). */
export const SEA_RGB = [46, 84, 92];

/** RGB mosaic (Uint8Array, 3 channels) of seamlessphoto at zoom z. Missing tiles are filled with SEA_RGB. */
export async function rgbMosaic(dataset, bbox, z, margin = 0) {
  const r0 = tileRange(bbox, z);
  const r = { z, x0: r0.x0 - margin, y0: r0.y0 - margin, x1: r0.x1 + margin, y1: r0.y1 + margin };
  const tiles = rangeTiles(r);
  await fetchTiles(dataset, z, tiles);
  const nx = r.x1 - r.x0 + 1, ny = r.y1 - r.y0 + 1;
  const w = nx * TS, h = ny * TS;
  const data = new Uint8Array(w * h * 3);
  let present = 0;
  for (const [x, y] of tiles) {
    const buf = await readTile(dataset, z, x, y);
    const ox = (x - r.x0) * TS, oy = (y - r.y0) * TS;
    if (!buf) {
      for (let j = 0; j < TS; j++)
        for (let i = 0; i < TS; i++) data.set(SEA_RGB, ((oy + j) * w + ox + i) * 3);
      continue;
    }
    present++;
    const px = await decodeRaw(buf, 3);
    // seamlessphoto pads open sea with black (0,0,0) pixels: paint them sea-coloured
    for (let k = 0; k < px.length; k += 3) {
      if (px[k] + px[k + 1] + px[k + 2] < 6) {
        px[k] = SEA_RGB[0];
        px[k + 1] = SEA_RGB[1];
        px[k + 2] = SEA_RGB[2];
      }
    }
    for (let j = 0; j < TS; j++) {
      data.set(px.subarray(j * TS * 3, (j + 1) * TS * 3), ((oy + j) * w + ox) * 3);
    }
  }
  return { z, x0: r.x0, y0: r.y0, w, h, data, present, total: tiles.length };
}

/** Mosaic pixel coords for ENU x (east) and z (south). ENU is linear in lon/lat, so x->px, z->py separately. */
export function enuXToMosaicPx(m, x) {
  return lonToPx(LON0 + x / M_PER_DEG_LON, m.z) - m.x0 * TS;
}
export function enuZToMosaicPy(m, z) {
  return latToPx(LAT0 - z / M_PER_DEG_LAT, m.z) - m.y0 * TS;
}

/** NaN-aware bilinear sample of a float mosaic at pixel-centre coords (px, py). */
export function sampleFloat(m, px, py) {
  // pixel centres are at +0.5
  const fx = px - 0.5, fy = py - 0.5;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  const tx = fx - ix, ty = fy - iy;
  let s = 0, wsum = 0;
  for (let dy = 0; dy < 2; dy++) {
    const yy = iy + dy;
    if (yy < 0 || yy >= m.h) continue;
    const wy = dy ? ty : 1 - ty;
    for (let dx = 0; dx < 2; dx++) {
      const xx = ix + dx;
      if (xx < 0 || xx >= m.w) continue;
      const v = m.data[yy * m.w + xx];
      if (Number.isNaN(v)) continue;
      const wgt = wy * (dx ? tx : 1 - tx);
      s += v * wgt;
      wsum += wgt;
    }
  }
  return wsum > 1e-6 ? s / wsum : NaN;
}

/** Bilinear RGB sample into out[o..o+2]. */
export function sampleRgb(m, px, py, out, o) {
  const fx = Math.min(Math.max(px - 0.5, 0), m.w - 1.001);
  const fy = Math.min(Math.max(py - 0.5, 0), m.h - 1.001);
  const ix = Math.floor(fx), iy = Math.floor(fy);
  const tx = fx - ix, ty = fy - iy;
  const d = m.data, w = m.w;
  const a = (iy * w + ix) * 3, b = a + 3, c = a + w * 3, e = c + 3;
  for (let k = 0; k < 3; k++) {
    const top = d[a + k] * (1 - tx) + d[b + k] * tx;
    const bot = d[c + k] * (1 - tx) + d[e + k] * tx;
    out[o + k] = top * (1 - ty) + bot * ty + 0.5;
  }
}
