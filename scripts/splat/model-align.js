// Fit the model (gallery frame) to the real city (ENU) from hand-picked control points.
// Each point pairs a pixel in a top-down preview render of the model with a pixel in a GSI seamlessphoto
// mosaic (or a lat/lon). Output: the yaw that points the model's north to -z, and the similarity
// gallery -> ENU (uniform scale + translation after that yaw), with RMS residual in metres.
//
//   env -u NODE_OPTIONS bun scripts/splat/model-align.js raw/work/model/align/points.json
// points.json: { "top": {"cam":[0,3.6,0.001],"fov":45,"w":1280,"h":800, "yawDeg": <yaw used for the render>},
//                "mosaic": {"z":16,"x0":58538,"y0":25066},
//                "pairs": [{"name":"...", "px":[u,v], "mosaicPx":[u,v]} | {"name":"...", "px":[u,v], "lat":..,"lon":..}] }
import { llToEnu, tileToLl } from "../../src/core/geo.js";

/** top-down render pixel -> gallery (x,z) on the y=0 plane (camera straight above the origin, screen up = -z). */
export function topPixelToGallery([u, v], { cam = [0, 3.6, 0.001], fov = 45, w = 1280, h = 800 } = {}) {
  const f = (h / 2) / Math.tan((fov * Math.PI) / 360); // px per unit at distance 1
  const d = cam[1];
  return [cam[0] + ((u - w / 2) * d) / f, cam[2] + ((v - h / 2) * d) / f];
}

export function mosaicPixelToLl([u, v], { z, x0, y0 }) {
  const r = tileToLl(x0 + u / 256, y0 + v / 256, z);
  return Array.isArray(r) ? r : [r.lat, r.lon];
}

/**
 * 2D similarity (Umeyama) mapping src points to dst: dst ≈ s * R(θ) * src + t.
 * Points are [x, z] in a y-up right-handed frame; θ is the rotation about +y (x toward -z for θ>0).
 */
export function fitSimilarity2D(src, dst) {
  const n = src.length, ms = [0, 0], md = [0, 0];
  for (let i = 0; i < n; i++) { ms[0] += src[i][0] / n; ms[1] += src[i][1] / n; md[0] += dst[i][0] / n; md[1] += dst[i][1] / n; }
  let sxx = 0, sxy = 0, vs = 0;
  for (let i = 0; i < n; i++) {
    const a = [src[i][0] - ms[0], src[i][1] - ms[1]], b = [dst[i][0] - md[0], dst[i][1] - md[1]];
    sxx += a[0] * b[0] + a[1] * b[1];           // cos part
    sxy += a[0] * b[1] - a[1] * b[0];           // sin part (x->z)
    vs += a[0] * a[0] + a[1] * a[1];
  }
  const phi = Math.atan2(sxy, sxx); // rotation in the (x,z) plane from x toward z
  const s = Math.hypot(sxx, sxy) / vs;
  const c = Math.cos(phi), sn = Math.sin(phi);
  const map = (p) => [s * (c * p[0] - sn * p[1]) + 0, s * (sn * p[0] + c * p[1])];
  const mm = map(ms), t = [md[0] - mm[0], md[1] - mm[1]];
  const apply = (p) => { const q = map(p); return [q[0] + t[0], q[1] + t[1]]; };
  const res = src.map((p, i) => Math.hypot(apply(p)[0] - dst[i][0], apply(p)[1] - dst[i][1]));
  const rms = Math.sqrt(res.reduce((a, r) => a + r * r, 0) / n);
  // phi rotates x toward z, i.e. about -y; three.js yaw about +y is -phi
  return { scale: s, yawDeg: (-phi * 180) / Math.PI, t, rms, residuals: res, apply };
}

if (import.meta.main) {
  const spec = await Bun.file(process.argv[2]).json();
  const src = [], dst = [], names = [];
  for (const p of spec.pairs) {
    src.push(topPixelToGallery(p.px, spec.top));
    const [lat, lon] = p.lat !== undefined ? [p.lat, p.lon] : mosaicPixelToLl(p.mosaicPx, spec.mosaic);
    const e = llToEnu(lat, lon); dst.push([e[0], e[2]]); names.push(p.name);
  }
  const fit = fitSimilarity2D(src, dst);
  const yawUsed = spec.top.yawDeg ?? 0;
  console.log(JSON.stringify({
    // add this to the yaw used for the render to make the gallery axes parallel to ENU (north = -z)
    northYawDeg: +(yawUsed + fit.yawDeg).toFixed(2), deltaYawDeg: +fit.yawDeg.toFixed(2),
    enuPerGalleryMetre: +fit.scale.toFixed(3), modelScale: `1:${Math.round(fit.scale * 1)}`,
    rmsMetres: +fit.rms.toFixed(1), residuals: Object.fromEntries(names.map((n, i) => [n, +fit.residuals[i].toFixed(1)])),
    galleryOriginInEnu: fit.apply([0, 0]).map((v) => +v.toFixed(1)),
  }, null, 1));
}
