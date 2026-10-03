// [v6:survey] Photo / app alignment from a SOLVED camera (structure-from-motion, georegistered to ENU).
//
// For each photo of an area it:
//   1. loads the solved camera from data/survey/<area>/cameras.json (ENU position, three.js world quaternion,
//      intrinsics fx fy cx cy, OPENCV distortion, image size);
//   2. undistorts the photo to a pinhole image with the same focal lengths and principal point (scaled to --h);
//   3. renders the app from EXACTLY that camera: the eye pose from the solve and a projection matrix built from the
//      intrinsics (principal point included, no fov / aspect approximation);
//   4. extracts the app's geometric edges from the renderer's normal + depth pre-pass (depth jumps and creases; texture
//      and decal lines are not geometry and are left out) and the photo's edges (Canny);
//   5. writes docs/shots/v6_survey/<area>/ (gitignored: these embed the photos):
//        overlay_IMG_xxxx.jpg  the undistorted photo with the app's edges in cyan
//        pair_IMG_xxxx.jpg     the undistorted photo beside the app render
//        app_IMG_xxxx.png      the render alone
//      and data/survey/<area>/chamfer.json: per photo and --tag, the edge chamfer distance app -> photo in pixels of the
//      --h frame (mean, median, p90) and the same at the photo's full resolution.
//
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/photo-align.mjs --area market --port 8902
//        [--only 0792,0795] [--h 1440] [--tag before] [--nobuild] [--look auto|photo|dawn|none] [--cameras <json>]
//        [--maxdepth 250]
//
// The chamfer: for every app edge pixel inside the undistorted photo's coverage, the distance to the nearest photo edge
// pixel (exact Euclidean distance transform). Photo edges include texture (clouds, people, stains), so only the app ->
// photo direction is meaningful: a perfect model scores ~1 px however busy the photo is; a wall drawn 1 m off at 20 m
// with a 24 mm lens (f ~ 1000 px at --h 1440) scores ~50 px along that wall.
import { join, resolve, dirname } from 'node:path';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import sharp from 'sharp';
import { build, serve, launch, ROOT } from './cdp.mjs';
import { distortN, quantile, median } from './survey/lib.mjs';
import { lookFor, BATCHES } from './photo-pairs.mjs';

/** The shared camera schema (raw/survey/COORD.md): { cameras: [{ id, image, camera_model, width, height, fx, fy, cx, cy,
 *  dist: [k1, k2, p1, p2], position: [x, y, z] ENU, quaternion: [x, y, z, w] (three.js camera -> ENU), yaw, pitch, roll }] }
 *  plus optional registered (false = not solved), date ('2026:10:01'), hours, f35. -> the normalised camera. */
export function normCamera(c, meta = {}) {
  const d = Array.isArray(c.dist) ? c.dist : c.dist ? [c.dist.k1, c.dist.k2, c.dist.p1, c.dist.p2] : [0, 0, 0, 0];
  const m = meta[c.id] || {};
  return { ...c, file: c.image || c.file, model: c.camera_model || c.model, dist: { k1: d[0] || 0, k2: d[1] || 0, p1: d[2] || 0, p2: d[3] || 0, k3: d[4] || 0, k4: 0, k5: 0, k6: 0 },
    euler: c.euler || { yaw: c.yaw, pitch: c.pitch, roll: c.roll ?? 0 }, registered: c.registered !== false && !!c.position && !!c.quaternion,
    date: c.date || m.date, hours: c.hours ?? m.hours, f35: c.f35 ?? m.f35 };
}
/** id -> { date, hours, f35 } from the photo batches' index.json files. */
export function photoMeta() {
  const out = {};
  for (const B of BATCHES) {
    const f = join(ROOT, B.dir, 'index.json'); if (!existsSync(f)) continue;
    for (const p of JSON.parse(readFileSync(f, 'utf8'))) {
      const id = p.SourceFile.split('/').pop().replace(/\.\w+$/, ''); if (out[id]) continue;
      const [date, clock] = p.DateTimeOriginal.split(' '), [h, mi, se] = clock.split(':').map(Number);
      out[id] = { date, hours: h + mi / 60 + se / 3600, f35: p.FocalLengthIn35mmFormat };
    }
  }
  return out;
}

// ------------------------------------------------------------------ image helpers (exported for the tests)
/** Undistort an RGB(A) raw buffer (w0 x h0, ch channels) to a pinhole frame (W x H) whose intrinsics are the
 *  camera's scaled by s = H / h0. Pixel centres at +0.5 (COLMAP). -> { data (RGB), valid (Uint8Array) } */
export function undistortImage(src, w0, h0, ch, cam, W, H) {
  const s = W / w0, out = Buffer.alloc(W * H * 3), valid = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const u = (i + 0.5) / s, v = (j + 0.5) / s;
    const [xd, yd] = distortN((u - cam.cx) / cam.fx, (v - cam.cy) / cam.fy, cam.dist);
    const ud = cam.fx * xd + cam.cx - 0.5, vd = cam.fy * yd + cam.cy - 0.5;
    if (ud < 0 || vd < 0 || ud > w0 - 1 || vd > h0 - 1) continue;
    const x0 = Math.floor(ud), y0 = Math.floor(vd), fx = ud - x0, fy = vd - y0, x1 = Math.min(w0 - 1, x0 + 1), y1 = Math.min(h0 - 1, y0 + 1);
    const o = (j * W + i) * 3; valid[j * W + i] = 1;
    for (let c = 0; c < 3; c++) {
      const a = src[(y0 * w0 + x0) * ch + c], b = src[(y0 * w0 + x1) * ch + c], d = src[(y1 * w0 + x0) * ch + c], e = src[(y1 * w0 + x1) * ch + c];
      out[o + c] = Math.round(a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + d * (1 - fx) * fy + e * fx * fy);
    }
  }
  return { data: out, valid };
}

/** Canny edges of an RGB buffer -> Uint8Array (1 = edge). Gaussian sigma, hysteresis thresholds as gradient quantiles. */
export function canny(rgb, W, H, { sigma = 1.4, lowQ = 0.8, highQ = 0.92, mask = null } = {}) {
  const g = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) g[i] = 0.299 * rgb[i * 3] + 0.587 * rgb[i * 3 + 1] + 0.114 * rgb[i * 3 + 2];
  // separable Gaussian
  const r = Math.ceil(sigma * 3), k = []; let ks = 0; for (let i = -r; i <= r; i++) { const v = Math.exp(-i * i / (2 * sigma * sigma)); k.push(v); ks += v; }
  const tmp = new Float32Array(W * H), b = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0; for (let i = -r; i <= r; i++) s += k[i + r] * g[y * W + Math.min(W - 1, Math.max(0, x + i))]; tmp[y * W + x] = s / ks; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0; for (let i = -r; i <= r; i++) s += k[i + r] * tmp[Math.min(H - 1, Math.max(0, y + i)) * W + x]; b[y * W + x] = s / ks; }
  const mag = new Float32Array(W * H), dir = new Uint8Array(W * H);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const p = (dx, dy) => b[(y + dy) * W + x + dx];
    const gx = p(1, -1) + 2 * p(1, 0) + p(1, 1) - p(-1, -1) - 2 * p(-1, 0) - p(-1, 1), gy = p(-1, 1) + 2 * p(0, 1) + p(1, 1) - p(-1, -1) - 2 * p(0, -1) - p(1, -1);
    mag[y * W + x] = Math.hypot(gx, gy);
    const a = ((Math.atan2(gy, gx) * 180 / Math.PI) + 180) % 180; dir[y * W + x] = a < 22.5 || a >= 157.5 ? 0 : a < 67.5 ? 1 : a < 112.5 ? 2 : 3;
  }
  const nms = new Float32Array(W * H);
  const OFF = [[1, 0], [1, 1], [0, 1], [-1, 1]];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x, m = mag[i]; if (!m || (mask && !mask[i])) continue;
    const [dx, dy] = OFF[dir[i]];
    if (m >= mag[i + dy * W + dx] && m >= mag[i - dy * W - dx]) nms[i] = m;
  }
  const vals = []; for (let i = 0; i < W * H; i += 7) if (nms[i] > 0) vals.push(nms[i]);
  const lo = quantile(vals, lowQ), hi = quantile(vals, highQ);
  const e = new Uint8Array(W * H), stack = [];
  for (let i = 0; i < W * H; i++) if (nms[i] >= hi) { e[i] = 1; stack.push(i); }
  while (stack.length) { const i = stack.pop(), x = i % W, y = (i - x) / W; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const j = yy * W + xx; if (!e[j] && nms[j] >= lo) { e[j] = 1; stack.push(j); } } }
  return e;
}

/** Exact Euclidean distance transform (Felzenszwalb-Huttenlocher) to the nearest set pixel. -> Float32Array (px) */
export function edt(bin, W, H) {
  const INF = 1e20, f = new Float64Array(Math.max(W, H)), d = new Float64Array(Math.max(W, H)), v = new Int32Array(Math.max(W, H)), z = new Float64Array(Math.max(W, H) + 1);
  const D = new Float64Array(W * H);
  for (let i = 0; i < W * H; i++) D[i] = bin[i] ? 0 : INF;
  const pass = (n, get, set) => {
    for (let q = 0; q < n; q++) f[q] = get(q);
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < n; q++) { let s; for (;;) { const p = v[k]; s = ((f[q] + q * q) - (f[p] + p * p)) / (2 * q - 2 * p); if (s <= z[k] && k > 0) k--; else break; } if (s <= z[k]) { v[0] = q; z[0] = -INF; z[1] = INF; k = 0; continue; } k++; v[k] = q; z[k] = s; z[k + 1] = INF; }
    k = 0; for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const p = v[k]; d[q] = (q - p) * (q - p) + f[p]; }
    for (let q = 0; q < n; q++) set(q, d[q]);
  };
  for (let x = 0; x < W; x++) pass(H, (y) => D[y * W + x], (y, val) => { D[y * W + x] = val; });
  for (let y = 0; y < H; y++) pass(W, (x) => D[y * W + x], (x, val) => { D[y * W + x] = val; });
  const out = new Float32Array(W * H); for (let i = 0; i < W * H; i++) out[i] = Math.sqrt(D[i]); return out;
}

/** Chamfer distance of the app edges to the photo edges (px) over the valid region. */
export function chamfer(appEdges, photoEdges, valid, W, H) {
  const dt = edt(photoEdges, W, H), ds = [];
  for (let i = 0; i < W * H; i++) if (appEdges[i] && valid[i]) ds.push(dt[i]);
  if (!ds.length) return { n: 0, mean: null, median: null, p90: null };
  return { n: ds.length, mean: ds.reduce((a, b) => a + b, 0) / ds.length, median: median(ds), p90: quantile(ds, 0.9) };
}

/** Projection matrix (three.js / OpenGL, column-major elements) from pinhole intrinsics in a W x H frame. */
export function projectionFromK({ fx, fy, cx, cy }, W, H, near, far) {
  // clip.x = 2fx/W x + (1 - 2cx/W) z ; clip.y = 2fy/H y + (2cy/H - 1) z ; clip.w = -z (camera looks down -z, y up)
  const m = [2 * fx / W, 0, 1 - 2 * cx / W, 0, 0, 2 * fy / H, 2 * cy / H - 1, 0, 0, 0, -(far + near) / (far - near), -2 * far * near / (far - near), 0, 0, -1, 0];
  return [m[0], m[4], m[8], m[12], m[1], m[5], m[9], m[13], m[2], m[6], m[10], m[14], m[3], m[7], m[11], m[15]];   // row-major -> column-major
}

// ------------------------------------------------------------------ main
const args = {};
for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) { const k = a.slice(2); const v = process.argv[i + 1] !== undefined && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : '1'; args[k] = v; } }
if (import.meta.main) await main();

async function main() {
  const area = args.area || 'market', port = Number(args.port || 8902);
  if ([8787, 8790, 8791].includes(port)) throw new Error('port reserved');
  const camFile = args.cameras ? resolve(ROOT, args.cameras) : join(ROOT, `data/survey/${area}/cameras.json`);
  if (!existsSync(camFile)) throw new Error('no solved cameras: ' + camFile);
  const CJ = JSON.parse(readFileSync(camFile, 'utf8'));
  const META = photoMeta();
  let list = (CJ.cameras || CJ.photos).map((c) => normCamera(c, META)).filter((p) => p.registered);
  if (args.only) { const want = new Set(String(args.only).split(',').map((s) => 'IMG_' + s.replace(/^IMG_/, ''))); list = list.filter((p) => want.has(p.id)); }
  if (!list.length) throw new Error('no registered photos to align');
  const OUT = resolve(ROOT, args.out || `docs/shots/v6_survey/${area}`), tag = args.tag || 'current';
  mkdirSync(OUT, { recursive: true });
  const Hh = Number(args.h || 1440);
  // app edges beyond --maxdepth (m) are left out: the far town and hills are a dense hatch of tiny edges that would
  // dominate the count without saying anything about the surveyed area (a sky / far boundary still counts as an edge)
  const maxDepth = Number(args.maxdepth || 250);
  // all market photos are 3:4 portrait; the render frame follows each photo's aspect (one page size per aspect)
  const frames = list.map((p) => { const s = Hh / p.height; return { p, s, W: Math.round(p.width * s), H: Hh }; });

  const dist = join(ROOT, `dist/anime-${port}`);
  if (!args.nobuild) { const r = await build({ outdir: dist }); console.log(`build ${r.reused ? 'FAILED (reused the last good build)' : 'ok'} ${r.ms ?? ''} ms`); }
  const srv = serve({ port, dist });
  let browser; const results = [];
  try {
    browser = await launch({ quiet: !args.verbose });
    const W0 = frames[0].W, H0 = frames[0].H;
    const page = await browser.page({ width: W0, height: H0 });
    const first = list[0];
    const look0 = args.look && args.look !== 'auto' ? args.look : lookFor(first.date, first.hours);
    const q = new URLSearchParams({ shot: '1', w: String(W0), h: String(H0), t: '0', q: args.q || 'high', fov: '60', hours: String(first.hours) });
    if (look0 !== 'none') q.set('look', look0); else q.set('weather', 'clear');
    await page.goto(`${srv.url}index.html?${q}`);
    await page.waitFor('window.__ready === true', { timeout: 280000 });
    let curLook = look0;
    for (const { p, s, W, H } of frames) {
      if (W !== W0 || H !== H0) throw new Error('mixed aspect ratios in one run: align them in separate runs (--only)');
      const look = args.look && args.look !== 'auto' ? args.look : lookFor(p.date, p.hours);
      if (look !== curLook) { await page.eval(`void window.__life.time.setLook(${look === 'none' ? 'null' : JSON.stringify(look)})`); curLook = look; }
      await page.eval(`void window.__setHours(${p.renderHours ?? p.hours})`);
      const K = { fx: p.fx * s, fy: p.fy * s, cx: p.cx * s, cy: p.cy * s };
      // the eye: move the player there (streams the tiles, sets the walk focus), then pin the exact rotation and projection
      await page.eval(`(() => {
        const c = window.__ctx, cam = c.camera, P = ${JSON.stringify(p.position)}, Q = ${JSON.stringify(p.quaternion)}, K = ${JSON.stringify(K)}, W = ${W}, H = ${H};
        window.__setCam(P[0], P[1], P[2], ${p.euler.yaw}, ${p.euler.pitch});
        const s = window.__explore?.stream; if (s) s.settle(P[0], P[2], 'ground');
        cam.position.set(P[0], P[1], P[2]); cam.quaternion.set(Q[0], Q[1], Q[2], Q[3]); cam.updateMatrixWorld(true);
        const proj = (near, far) => [2 * K.fx / W, 0, 0, 0, 0, 2 * K.fy / H, 0, 0, 1 - 2 * K.cx / W, 2 * K.cy / H - 1, -(far + near) / (far - near), -1, 0, 0, -2 * far * near / (far - near), 0];
        cam.updateProjectionMatrix = function () { this.projectionMatrix.fromArray(proj(this.near, this.far)); this.projectionMatrixInverse.copy(this.projectionMatrix).invert(); };
        cam.updateProjectionMatrix();
        window.__alignPose = { P, Q };
      })()`);
      await page.frames(10);
      // re-pin (a module may have moved the camera in its update) and render a few more frames
      await page.eval(`(() => { const c = window.__ctx.camera, A = window.__alignPose; c.position.set(...A.P); c.quaternion.set(...A.Q); c.updateMatrixWorld(true); })()`);
      await page.frames(4);
      const app = join(OUT, `app_${p.id}.png`);
      await page.shot(app);
      // the frame must have been drawn from the pinned pose (an update hook that moves the camera would void the chamfer)
      const drift = await page.eval(`(() => { const c = window.__ctx.camera, A = window.__alignPose; const dp = Math.hypot(c.position.x - A.P[0], c.position.y - A.P[1], c.position.z - A.P[2]); const dq = Math.abs(c.quaternion.x * A.Q[0] + c.quaternion.y * A.Q[1] + c.quaternion.z * A.Q[2] + c.quaternion.w * A.Q[3]); return { dp, dDeg: 2 * Math.acos(Math.min(1, dq)) * 180 / Math.PI }; })()`);
      if (drift.dp > 0.01 || drift.dDeg > 0.01) console.log(`WARNING ${p.id}: the camera drifted from the solved pose by ${drift.dp.toFixed(3)} m / ${drift.dDeg.toFixed(3)} deg while rendering`);
      // the normal + depth pre-pass -> geometric edges (Uint8, row 0 = top)
      const ndB64 = await page.eval(`(() => {
        const c = window.__ctx, r = c.renderer, rt = c.pipeline.targets.rtND, W = rt.width, H = rt.height, buf = new Uint16Array(W * H * 4);
        r.readRenderTargetPixels(rt, 0, 0, W, H, buf);
        const f = window.THREE.DataUtils.fromHalfFloat, far = c.camera.far, D = new Float32Array(W * H), N = new Float32Array(W * H * 3);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (H - 1 - y) * W + x, o = (y * W + x) * 4; const d = f(buf[o + 3]); D[i] = d > 0 && d < 0.9999 && d * far < ${maxDepth} ? d * far : Infinity; N[i * 3] = f(buf[o]) * 2 - 1; N[i * 3 + 1] = f(buf[o + 1]) * 2 - 1; N[i * 3 + 2] = f(buf[o + 2]) * 2 - 1; }
        const E = new Uint8Array(W * H), cosT = Math.cos(30 * Math.PI / 180);
        const edge = (i, j) => { const a = D[i], b = D[j]; if (a === Infinity && b === Infinity) return -1; if (a === Infinity) return j; if (b === Infinity) return i; const near = Math.min(a, b);
          if (Math.abs(a - b) > Math.max(0.06, 0.03 * near)) return a < b ? i : j;
          const dp = N[i*3]*N[j*3] + N[i*3+1]*N[j*3+1] + N[i*3+2]*N[j*3+2]; return dp < cosT ? (a < b ? i : j) : -1; };
        for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) { const i = y * W + x; let k = edge(i, i + 1); if (k >= 0) E[k] = 1; k = edge(i, i + W); if (k >= 0) E[k] = 1; }
        let s = ''; for (let i = 0; i < E.length; i += 32768) s += String.fromCharCode.apply(null, E.subarray(i, i + 32768));
        return { W, H, e: btoa(s) };
      })()`);
      if (ndB64.W !== W || ndB64.H !== H) throw new Error(`pre-pass ${ndB64.W}x${ndB64.H} != frame ${W}x${H}`);
      const appEdges = Uint8Array.from(Buffer.from(ndB64.e, 'base64'));
      // the photo: full resolution, undistorted to the pinhole frame
      const srcPath = join(ROOT, p.file);
      const { data: raw, info } = await sharp(srcPath).raw().toBuffer({ resolveWithObject: true });
      if (info.width !== p.width || info.height !== p.height) throw new Error(`${p.id}: image ${info.width}x${info.height} != camera ${p.width}x${p.height}`);
      const und = undistortImage(raw, info.width, info.height, info.channels, p, W, H);
      const photoEdges = canny(und.data, W, H, { mask: und.valid });
      const ch = chamfer(appEdges, photoEdges, und.valid, W, H);
      const full = ch.n ? { mean: ch.mean / s, median: ch.median / s, p90: ch.p90 / s } : null;
      // overlay: photo with the app edges in cyan (dilated to 2 px), and the side-by-side pair
      const ov = Buffer.from(und.data);
      for (let i = 0; i < W * H; i++) if (appEdges[i] || (i % W < W - 1 && appEdges[i + 1]) || appEdges[i + W]) { ov[i * 3] = 0; ov[i * 3 + 1] = 255; ov[i * 3 + 2] = 255; }
      const label = (txt) => Buffer.from(`<svg width="${W}" height="36"><rect width="100%" height="36" fill="rgba(0,0,0,0.6)"/><text x="10" y="25" font-size="18" font-family="Helvetica" fill="#fff">${txt}</text></svg>`);
      const head = `${p.id}  ${p.f35} mm  ENU (${p.position[0].toFixed(1)}, ${p.position[1].toFixed(1)}, ${p.position[2].toFixed(1)})  yaw ${p.euler.yaw.toFixed(1)}`;
      await sharp(ov, { raw: { width: W, height: H, channels: 3 } }).composite([{ input: label(`${head}  chamfer ${ch.mean?.toFixed(1)} / p90 ${ch.p90?.toFixed(1)} px [${tag}]`), left: 0, top: H - 36 }]).jpeg({ quality: 88 }).toFile(join(OUT, `overlay_${p.id}.jpg`));
      const ph = await sharp(und.data, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
      const ap = await sharp(app).resize(W, H).png().toBuffer();
      await sharp({ create: { width: W * 2, height: H, channels: 3, background: '#000' } }).composite([{ input: ph, left: 0, top: 0 }, { input: ap, left: W, top: 0 }, { input: label(`${head}  (photo undistorted | app, same camera)`), left: 0, top: H - 36 }]).jpeg({ quality: 86 }).toFile(join(OUT, `pair_${p.id}.jpg`));
      results.push({ id: p.id, tag, W, H, scale: +s.toFixed(5), look: curLook, appEdgePx: ch.n, chamfer: ch.n ? { mean: +ch.mean.toFixed(2), median: +ch.median.toFixed(2), p90: +ch.p90.toFixed(2) } : null, chamferFullRes: full && { mean: +full.mean.toFixed(1), median: +full.median.toFixed(1), p90: +full.p90.toFixed(1) } });
      console.log(`${p.id}: chamfer mean ${ch.mean?.toFixed(2)} px, p90 ${ch.p90?.toFixed(2)} px over ${ch.n} app edge px (${W}x${H}); full-res ${full?.mean.toFixed(1)} / ${full?.p90.toFixed(1)} px`);
    }
    const errs = page.errors(); if (errs.length) console.log('PAGE ERRORS:', errs.length, errs.slice(0, 5).map((e) => e.text.slice(0, 300)));
    // metrics (no photo content) -> data/survey/<area>/chamfer.json, merged per tag and photo
    const mf = join(ROOT, `data/survey/${area}/chamfer.json`);
    const M = existsSync(mf) ? JSON.parse(readFileSync(mf, 'utf8')) : { note: 'Edge chamfer app -> photo (tools/anime/photo-align.mjs): px in the --h frame and at full resolution, per tag (before / after a rebuild).', tags: {} };
    M.tags[tag] = { ...(M.tags[tag] || {}), ...Object.fromEntries(results.map((r) => [r.id, r])) };
    const all = Object.values(M.tags[tag]).filter((r) => r.chamfer);
    M.tags[tag]._summary = { photos: all.length, mean: +(all.reduce((s, r) => s + r.chamfer.mean, 0) / Math.max(1, all.length)).toFixed(2), p90: +(all.reduce((s, r) => s + r.chamfer.p90, 0) / Math.max(1, all.length)).toFixed(2), at: new Date().toISOString() };
    mkdirSync(dirname(mf), { recursive: true }); writeFileSync(mf, JSON.stringify(M, null, 1));
  } catch (e) {
    console.log('ALIGN FAILED:', e.stack || e.message); process.exitCode = 1;
  } finally {
    await browser?.close(); srv.stop();
  }
}
