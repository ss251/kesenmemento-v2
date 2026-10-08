// [play:hoya3d] A tiny viewer for the 3D ホヤぼーや (src/anime/play/avatar/hoya-model.js): fixed views, poses, frame
// strips, a turntable, and side-by-side sheets with the city's official views. Driven by tools/anime/hoya3d-shots.mjs
// through WebKit (tools/anime/webkit-shot.swift); every image is POSTed back to the runner, which writes it to disk.
//
// Light: one white key light and a white fill, calibrated so a lit surface shows its exact official colour (manual p.2)
// and the shade is the world's cel step darker (MeshToonMaterial: outgoing = albedo x (fill + key x ramp) / pi).
import * as THREE from 'three';
import { buildHoya, HOYA_HEIGHT } from '../../src/anime/play/avatar/hoya-model.js';

const params = new URLSearchParams(location.search);
const quality = params.get('quality') || 'high';
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: true });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = false;

const scene = new THREE.Scene();
const FILL = 0.8, KEY = 0.2;   // fill + key = 1 (x pi): a lit face is the official colour exactly
const amb = new THREE.AmbientLight(0xffffff, FILL * Math.PI);
scene.add(amb);
const key = new THREE.DirectionalLight(0xffffff, KEY * Math.PI);
scene.add(key, key.target);

const hoya = buildHoya(THREE, { quality });
scene.add(hoya.root);

// a soft contact shadow so he stands on something (viewer only)
const shadowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, 'rgba(60,52,70,0.30)'); gr.addColorStop(0.6, 'rgba(60,52,70,0.12)'); gr.addColorStop(1, 'rgba(60,52,70,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const blob = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.42), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
blob.rotation.x = -Math.PI / 2; blob.position.y = 0.002; scene.add(blob);

const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 50);
const persp = new THREE.PerspectiveCamera(22, 1, 0.05, 50);
ortho.layers.enableAll(); persp.layers.enableAll();   // the line lives on layer 1

const VIEWS = { front: 0, q34: 38, side: 90, back: 180, q34back: 145 };   // degrees round him, toward his left (-X)
/** Place a camera at azimuth az (0 = in front of him, + toward his left), elevation el (deg), looking at his middle. */
function aim(cam, az, el = 0, dist = 6, cy = 0.56, cx = 0) {
  const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180;
  cam.position.set(cx - Math.sin(a) * Math.cos(e) * dist, cy + Math.sin(e) * dist, -Math.cos(a) * Math.cos(e) * dist);
  cam.lookAt(cx, cy, 0);
  // the key light: from the camera's upper right, a little in front
  const r = new THREE.Vector3().subVectors(cam.position, new THREE.Vector3(0, cy, 0)).normalize();
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), r).normalize();
  key.position.copy(r).multiplyScalar(4).addScaledVector(right, 1.0).add(new THREE.Vector3(0, 0.9, 0));
  key.target.position.set(0, cy, 0);
}
function size(w, h) { renderer.setSize(w, h, false); canvas.style.width = w + 'px'; canvas.style.height = h + 'px'; }
/** Render one frame: view az/el, pose at time t, ortho (half-height hh) or perspective. */
function frame({ az = 0, el = 4, pose = 'idle', t = 0.5, w = 600, h = 800, cam = 'ortho', hh = 0.66, dist = 6, cy = 0.56, cx = 0, bg = '#ffffff', blink = false, speed, line = true, lift = 0, light = 1 } = {}) {
  size(w, h);
  hoya.hull.visible = line;
  hoya.setLift(lift);
  key.intensity = KEY * Math.PI * light; amb.intensity = FILL * Math.PI * light;
  scene.background = bg ? new THREE.Color(bg) : null;
  hoya.poseAt(pose, t, { speed });
  if (blink) hoya.blink(1);
  hoya.root.updateMatrixWorld(true);
  let c;
  if (cam === 'ortho') { c = ortho; const a = w / h; c.left = -hh * a; c.right = hh * a; c.top = hh; c.bottom = -hh; c.updateProjectionMatrix(); aim(c, az, el, dist, cy, cx); }
  else { c = persp; c.aspect = w / h; c.updateProjectionMatrix(); aim(c, az, el, dist, cy, cx); }
  renderer.render(scene, c);
  return canvas;
}
const CREDIT = '気仙沼市観光キャラクター「海の子 ホヤぼーや」';   // the manual's credit, unaltered (p.4)
/** Save a canvas through the runner. credit: a band under the image with the manual's credit (never on him). */
async function post(name, cv0, { credit = true } = {}) {
  let cv = cv0;
  if (credit) {
    const band = 2 * Math.max(14, Math.round(cv0.height * 0.017));   // even: the videos need even sizes
    cv = document.createElement('canvas'); cv.width = cv0.width; cv.height = cv0.height + band;
    const g = cv.getContext('2d');
    const px = (() => { const t = document.createElement('canvas'); t.width = t.height = 1; const tg = t.getContext('2d'); tg.drawImage(cv0, 2, cv0.height - 3, 1, 1, 0, 0, 1, 1); const d = tg.getImageData(0, 0, 1, 1).data; return `rgb(${d[0]},${d[1]},${d[2]})`; })();
    g.fillStyle = px; g.fillRect(0, 0, cv.width, cv.height);
    g.drawImage(cv0, 0, 0);
    g.fillStyle = '#595857'; g.font = `400 ${Math.round(band * 0.5)}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(CREDIT, cv.width / 2, cv0.height + band / 2);
  }
  const blobv = await new Promise((r) => cv.toBlob(r, 'image/png'));
  const res = await fetch('/save/' + name, { method: 'POST', body: blobv });
  if (!res.ok) throw new Error('save failed ' + name);
  return name;
}
/** The opaque (non-background) box of a canvas. */
function bbox(cv, bg = [255, 255, 255]) {
  const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height;
  const g = c2.getContext('2d'); g.drawImage(cv, 0, 0);
  const d = g.getImageData(0, 0, cv.width, cv.height).data;
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
    const i = (y * cv.width + x) * 4;
    if (d[i + 3] > 20 && (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 24)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
/** Ink (dark) mask of a canvas region scaled to w x h. */
function inkMask(src, sx, sy, sw, sh, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data, m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) m[i] = d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2] < 150 ? 1 : 0;
  return m;
}
/** Two-pass chamfer distance (3-4 weights / 3) to the nearest set pixel. */
function distance(m, w, h) {
  const D = new Float32Array(w * h), INF = 1e9;
  for (let i = 0; i < w * h; i++) D[i] = m[i] ? 0 : INF;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? INF : D[y * w + x]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; D[i] = Math.min(D[i], at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4); }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) { const i = y * w + x; D[i] = Math.min(D[i], at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4); }
  for (let i = 0; i < w * h; i++) D[i] /= 3;
  return D;
}
/** How far each ink line of one image lies from the other's (the cores of the lines: >= 2 px inside the ink). */
function inkDistance(A, B, w, h) {
  const dA = distance(A, w, h), dB = distance(B, w, h), inA = distance(A.map((v) => 1 - v), w, h), inB = distance(B.map((v) => 1 - v), w, h);
  const q = (arr, p) => { const s = Float32Array.from(arr).sort(); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
  const ab = [], ba = [];
  for (let i = 0; i < w * h; i++) { if (B[i] && inB[i] >= 2) ab.push(dA[i]); if (A[i] && inA[i] >= 2) ba.push(dB[i]); }
  return { ours: { p50: q(ab, 0.5), p90: q(ab, 0.9), p99: q(ab, 0.99) }, official: { p50: q(ba, 0.5), p90: q(ba, 0.9), p99: q(ba, 0.99) } };
}
async function loadImg(url) { const im = new Image(); im.src = url; await im.decode(); return im; }
const FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", sans-serif';

/** Side by side: the official view (left) and the 3D (right), both scaled to the same height (the head's height or the
 *  whole figure), on white, labelled. refBox: crop of the official image (px) or null for its whole opaque area. */
const measures = {};
async function compare(name, { ref, refLabel, label, refBox = null, view, H = 760, flipRef = false, blink = false, exact = null, overlay = null }) {
  const im = await loadImg(ref);
  const rc = document.createElement('canvas'); rc.width = im.naturalWidth; rc.height = im.naturalHeight;
  const rg = rc.getContext('2d'); rg.fillStyle = '#fff'; rg.fillRect(0, 0, rc.width, rc.height); rg.drawImage(im, 0, 0);
  const rb = refBox ? { x0: refBox[0], y0: refBox[1], w: refBox[2] - refBox[0], h: refBox[3] - refBox[1] } : bbox(rc);
  // exact: the official crop's window in the model (U = px / exact.u, round the head centre exact.c, soles at exact.sole):
  // the 3D is framed on the same window at the same scale, so the two can be laid over each other
  let cv, mb;
  if (exact) {
    const K = 1.1 / 3.845, u = exact.u, x0 = -(rb.x0 - exact.c[0]) / u, x1 = -(rb.x0 + rb.w - exact.c[0]) / u, y0 = (exact.sole - (rb.y0 + rb.h)) / u, y1 = (exact.sole - rb.y0) / u;
    const w = 1000, h = Math.round((w * rb.h) / rb.w);
    cv = frame({ ...view, az: 0, el: 0, cx: ((x0 + x1) / 2) * K, cy: ((y0 + y1) / 2) * K, hh: ((y1 - y0) / 2) * K, w, h, bg: '#ffffff', blink });
    mb = { x0: 0, y0: 0, w, h };
    await post(name.replace('.png', '-3d.png'), cv, { credit: false });   // the exact-scale render alone (for measurements)
    // the ink-line distances, official vs 3D, at the official scale: px of the official file -> U -> mm
    const mw = Math.round(rb.w), mh = Math.round(rb.h);
    const A = inkMask(rc, rb.x0, rb.y0, rb.w, rb.h, mw, mh), Bm = inkMask(cv, 0, 0, w, h, mw, mh), r = inkDistance(A, Bm, mw, mh);
    const mm = (px) => Math.round((px / exact.u) * K * 10000) / 10;
    measures[name] = { ours: Object.fromEntries(Object.entries(r.ours).map(([k, v]) => [k + '_mm', mm(v)])), official: Object.fromEntries(Object.entries(r.official).map(([k, v]) => [k + '_mm', mm(v)])) };
  } else { cv = frame({ ...view, w: 1000, h: 1300, bg: '#ffffff', blink }); mb = bbox(cv); }
  if (overlay) {   // the official at full strength, the 3D at half on top: every misplaced line shows twice
    const o = document.createElement('canvas'), oh = 900, ow = Math.round((rb.w / rb.h) * oh);
    o.width = ow; o.height = oh + 40;
    const g = o.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, o.width, o.height);
    g.drawImage(rc, rb.x0, rb.y0, rb.w, rb.h, 0, 0, ow, oh);
    g.globalAlpha = 0.5; g.drawImage(cv, mb.x0, mb.y0, mb.w, mb.h, 0, 0, ow, oh); g.globalAlpha = 1;
    g.fillStyle = '#595857'; g.font = `400 16px ${FONT}`; g.textAlign = 'center';
    g.fillText(overlay, ow / 2, oh + 26);
    await post(name.replace('.png', '-overlay.png'), o);
  }
  const pad = 40, labelH = 64, sheet = document.createElement('canvas');
  const rw = Math.round((rb.w / rb.h) * H), mw = Math.round((mb.w / mb.h) * H);
  sheet.width = pad * 3 + rw + mw; sheet.height = pad * 2 + H + labelH + 34;
  const g = sheet.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, sheet.width, sheet.height);
  g.imageSmoothingQuality = 'high';
  if (flipRef) { g.save(); g.translate(pad + rw, pad); g.scale(-1, 1); g.drawImage(rc, rb.x0, rb.y0, rb.w, rb.h, 0, 0, rw, H); g.restore(); }
  else g.drawImage(rc, rb.x0, rb.y0, rb.w, rb.h, pad, pad, rw, H);
  g.drawImage(cv, mb.x0, mb.y0, mb.w, mb.h, pad * 2 + rw, pad, mw, H);
  g.fillStyle = '#595857'; g.font = `500 22px ${FONT}`; g.textAlign = 'center';
  g.fillText(refLabel, pad + rw / 2, pad + H + 38);
  g.fillText(label, pad * 2 + rw + mw / 2, pad + H + 38);
  g.font = `400 16px ${FONT}`; g.fillStyle = '#8a8988';
  g.fillText('気仙沼市観光キャラクター「海の子 ホヤぼーや」  (left: official, reference only / right: 3D, for the city\'s review)', sheet.width / 2, pad + H + labelH + 18);
  return post(name, sheet, { credit: false });   // the sheet carries the credit line
}

/** A strip of frames (each its own render), cols per row, with small labels. */
async function strip(name, frames, { w = 300, h = 400, cols = frames.length, labels = [] } = {}) {
  const rows = Math.ceil(frames.length / cols), lab = 30, sheet = document.createElement('canvas');
  sheet.width = cols * w; sheet.height = rows * (h + lab);
  const g = sheet.getContext('2d'); g.fillStyle = '#FBFAF5'; g.fillRect(0, 0, sheet.width, sheet.height);
  for (let i = 0; i < frames.length; i++) {
    const cv = frame({ w, h, bg: '#FBFAF5', ...frames[i] });
    const x = (i % cols) * w, y = Math.floor(i / cols) * (h + lab);
    g.drawImage(cv, x, y);
    g.fillStyle = '#595857'; g.font = `400 15px ${FONT}`; g.textAlign = 'center';
    g.fillText(labels[i] ?? '', x + w / 2, y + h + 21);
  }
  return post(name, sheet);
}

/** The game's view: the third-person camera (4.5 m behind, 1.6 m up, pitch -8 deg, FOV 55, PLAY-DESIGN-2 §C). */
const play = new THREE.PerspectiveCamera(55, 1, 0.05, 50);
play.layers.enableAll();
/** A clip of real play (update() frame by frame, as the avatar lane calls it): inputs(t) -> { speed, onGround, vy, y }. */
async function clip(prefix, seconds, inputs, { w = 720, h = 960, fps = 30, cam = 'play', az = 180, el = 6 } = {}) {
  hoya.poseAt('idle', 0.2); hoya.setPose('auto'); hoya.setLift(0);
  key.intensity = KEY * Math.PI; amb.intensity = FILL * Math.PI;
  const n = Math.round(seconds * fps);
  for (let i = 0; i < n; i++) {
    const t = i / fps, inp = inputs(t);
    hoya.update(1 / fps, inp);
    hoya.root.position.y = inp.y || 0;
    blob.scale.setScalar(1 / (1 + 2.5 * (inp.y || 0)));
    size(w, h); scene.background = new THREE.Color('#FBFAF5');
    let c;
    if (cam === 'play') { c = play; c.aspect = w / h; c.updateProjectionMatrix(); c.position.set(0.35, 1.6 + (inp.y || 0) * 0.5, 4.5); c.lookAt(0.35, 1.6 - Math.tan(8 * Math.PI / 180) * 4.5 + (inp.y || 0) * 0.5, 0); aim(ortho, 0, 0); key.position.set(1.5, 4, 3); key.target.position.set(0, 0.5, 0); }
    else { c = persp; c.aspect = w / h; c.updateProjectionMatrix(); aim(c, az, el, 4.6, 0.56); }
    hoya.root.updateMatrixWorld(true);
    renderer.render(scene, c);
    await post(`${prefix}${String(i).padStart(4, '0')}.png`, canvas);
  }
  hoya.root.position.y = 0; blob.scale.setScalar(1);
  return n;
}

window.hoya3d = {
  clip,
  hoya, frame, post, compare, strip, VIEWS, HOYA_HEIGHT, measures: () => JSON.stringify(measures),
  stats: () => hoya.stats,
  /** a single view as a file */
  async shot(name, opts) { const cv = frame(opts); return post(name, cv); },
  /** the turntable: n frames, one full turn, idle (he breathes and blinks), perspective */
  async turntable(prefix, n = 120, { w = 720, h = 960, el = 8, seconds = 4 } = {}) {
    for (let i = 0; i < n; i++) {
      const t = (i / n) * seconds;
      const cv = frame({ az: (i / n) * 360, el, pose: 'idle', t: 0.5 + t, w, h, cam: 'persp', dist: 4.6, cy: 0.56, bg: '#FBFAF5' });
      await post(`${prefix}${String(i).padStart(4, '0')}.png`, cv);
    }
    return n;
  },
};
window.hoya3dReady = true;
