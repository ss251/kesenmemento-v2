// Shared geo helpers for Kesennuma Living City. Every package imports this file;
// none re-implements it (BUILD-SPEC §3).
//
// Local ENU metres, origin lat0=38.9060 lon0=141.5750.
//   x = east, y = up (metres above the GSI DEM datum), z = SOUTH.
//   x = (lon - 141.5750) * 86744.0
//   z = -(lat - 38.9060) * 111014.0
//
// Return values are arrays that also carry named fields, so both styles work:
//   const [x, , z] = llToEnu(lat, lon);   const { x, z } = llToEnu(lat, lon);
// Pure ES module, no dependencies: safe in the browser, Bun and Blender-side tooling.

export const LAT0 = 38.906;
export const LON0 = 141.575;
export const M_PER_DEG_LON = 86744.0;
export const M_PER_DEG_LAT = 111014.0;
export const CRS = "ENU origin 38.9060N 141.5750E";

/** Bounding boxes as [lonMin, latMin, lonMax, latMax] (same order as the JSON `bbox`). */
export const BBOX = {
  city: [141.5, 38.83, 141.7, 38.99],
  core: [141.555, 38.885, 141.605, 38.925],
};

function tagged(arr, fields) {
  return Object.assign(arr, fields);
}

/** lat/lon (degrees) and optional height (m) -> ENU [x, y, z] (also .x .y .z). */
export function llToEnu(lat, lon, h = 0) {
  const x = (lon - LON0) * M_PER_DEG_LON;
  const z = -(lat - LAT0) * M_PER_DEG_LAT;
  return tagged([x, h, z], { x, y: h, z });
}

/**
 * ENU -> [lat, lon] (also .lat .lon). Accepts (x, z) or an [x, y, z] / {x, z} object.
 */
export function enuToLl(x, z) {
  if (typeof x === "object" && x !== null) {
    const p = x;
    if (Array.isArray(p)) {
      x = p[0];
      z = p.length >= 3 ? p[2] : p[1];
    } else {
      x = p.x;
      z = p.z;
    }
  }
  const lon = x / M_PER_DEG_LON + LON0;
  const lat = -z / M_PER_DEG_LAT + LAT0;
  return tagged([lat, lon], { lat, lon });
}

/**
 * Web Mercator XYZ tile coordinate (may be fractional) -> [lat, lon] of that point.
 * Integer (x, y) gives the tile's north-west corner.
 */
export function tileToLl(x, y, z) {
  const n = 2 ** z;
  const lon = (x / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return tagged([lat, lon], { lat, lon });
}

/**
 * lat/lon -> containing XYZ tile at zoom z: [x, y, z] integers (also .x .y .z),
 * plus .fx .fy, the fractional tile coordinates (fx - x in [0,1) is the position inside the tile).
 */
export function llToTile(lat, lon, z) {
  const n = 2 ** z;
  const fx = ((lon + 180) / 360) * n;
  const latR = (lat * Math.PI) / 180;
  const fy = ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n;
  const x = Math.min(n - 1, Math.max(0, Math.floor(fx)));
  const y = Math.min(n - 1, Math.max(0, Math.floor(fy)));
  return tagged([x, y, z], { x, y, z, fx, fy });
}

/**
 * GSI PNG DEM pixel -> height in metres, NaN for the no-data value (128,0,0).
 * v = r*65536 + g*256 + b; h = v < 2^23 ? v*0.01 : v == 2^23 ? NaN : (v - 2^24)*0.01
 */
export function decodeGsiDem(r, g, b) {
  const v = r * 65536 + g * 256 + b;
  if (v < 8388608) return v * 0.01;
  if (v === 8388608) return NaN;
  return (v - 16777216) * 0.01;
}

/** Terrarium encoding used by data/terrain/*.terrarium.png. Returns [R, G, B]. */
export function encodeTerrarium(h) {
  const v = (Number.isFinite(h) ? h : 0) + 32768;
  const fv = Math.floor(v);
  const R = Math.floor(v / 256);
  const G = fv % 256;
  const B = Math.floor((v - fv) * 256);
  return [R, G, B];
}

/** Inverse of encodeTerrarium: h = R*256 + G + B/256 - 32768. */
export function decodeTerrarium(r, g, b) {
  return r * 256 + g + b / 256 - 32768;
}

/** Grid descriptor (from data/terrain/{name}.json) + ENU -> fractional (col, row). */
export function enuToGrid(meta, x, z) {
  return [(x - meta.x0) / meta.dx, (z - meta.z0) / meta.dz];
}

/**
 * Bilinear height lookup in a terrain grid (Float32Array heights, meta from {name}.json).
 * Returns NaN outside the grid.
 */
export function sampleGrid(heights, meta, x, z) {
  const c = (x - meta.x0) / meta.dx;
  const r = (z - meta.z0) / meta.dz;
  const W = meta.width, H = meta.height;
  if (!(c >= 0 && r >= 0 && c <= W - 1 && r <= H - 1)) return NaN;
  const c0 = Math.min(Math.floor(c), W - 2), r0 = Math.min(Math.floor(r), H - 2);
  const tc = c - c0, tr = r - r0;
  const i = r0 * W + c0;
  const a = heights[i], b = heights[i + 1], d = heights[i + W], e = heights[i + W + 1];
  return (a * (1 - tc) + b * tc) * (1 - tr) + (d * (1 - tc) + e * tc) * tr;
}

/** ENU [x0, z0, x1, z1] (x1>x0, z1>z0) of a lon/lat bbox. North edge -> z0 (z is south). */
export function bboxToEnu(bbox) {
  const [lonMin, latMin, lonMax, latMax] = bbox;
  const a = llToEnu(latMax, lonMin);
  const b = llToEnu(latMin, lonMax);
  return [a.x, a.z, b.x, b.z];
}

/** Stable 32-bit FNV-1a hash of a string -> float in [0, 1). Used for jitter / lit choice. */
export function hash01(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 4294967296;
}
