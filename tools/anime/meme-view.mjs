// [meme] The viewer for the 3D メメ (src/anime/play/avatar/meme-model.js): a turntable, the poses, the walk / run / jump
// at real speed on a ground that scrolls at his speed (a planted boot moves with it: no slide), the game's own
// third-person framing on a desktop and a 390 x 844 phone (camera.js thirdFor / desiredCam, core/fov.js), and the
// sheet's light, the town's day, dusk and night.
//
//   env -u NODE_OPTIONS bun tools/anime/meme-view.html        (Bun's dev server; open the printed URL)
//   ?quality=phone  ?calm=1  ?light=night  ?cam=phone  ?pose=run
//
// tools/anime/meme-capture.mjs drives the same page headless (?capture=1) through window.meme and saves what it POSTs.
import * as THREE from 'three';
import { build, MEME_HEIGHT, MEME_SPEED, memeGait } from '../../src/anime/play/avatar/meme-model.js';
// the game's own framing, read through the module namespaces (the walk-camera lane owns camera.js: a rename there must not break
// this page; the fallbacks are camera.js / fov.js at 2d60dce)
import * as CAMERA from '../../src/anime/play/avatar/camera.js';
import * as FOV from '../../src/anime/core/fov.js';
const THIRD = CAMERA.THIRD || { dist: 4.5, height: 1.6, pitch: -8 * Math.PI / 180, shoulder: 0.35 };
const PORTRAIT = CAMERA.THIRD_PORTRAIT || { dist: 2.6, height: 0.9, pitch: -14 * Math.PI / 180, shoulder: 0.15 };
const thirdFor = CAMERA.thirdFor || ((aspect) => {
  const a = Number.isFinite(aspect) ? aspect : 16 / 9, u = a >= 1 ? 0 : a <= 0.5 ? 1 : (1 - a) / 0.5, out = { ...THIRD };
  for (const k of ['dist', 'height', 'pitch', 'shoulder']) out[k] = THIRD[k] + (PORTRAIT[k] - THIRD[k]) * u;
  return out;
});
const desiredCam = CAMERA.desiredCam || ((x, y, z, yaw, out, C) => {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  out.tx = x + rx * C.shoulder; out.ty = y + C.height; out.tz = z + rz * C.shoulder;
  out.x = out.tx - fx * C.dist * Math.cos(C.pitch); out.z = out.tz - fz * C.dist * Math.cos(C.pitch); out.y = out.ty - C.dist * Math.sin(C.pitch);
  return out;
});
const fovFor = FOV.fovFor || ((aspect) => (aspect < 1 ? Math.min(88, 2 * Math.atan(Math.tan((64 * Math.PI) / 360) / aspect) * 180 / Math.PI) : 55));

const params = new URLSearchParams(location.search);
const CAPTURE = params.get('capture') === '1';
if (CAPTURE) document.body.classList.add('capture');
const FONT = '"Hiragino Maru Gothic ProN", "Hiragino Sans", "Zen Maru Gothic", system-ui, sans-serif';
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: false });
renderer.setPixelRatio(CAPTURE ? 1 : Math.min(2, window.devicePixelRatio || 1));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;   // as the app (main.js)

const scene = new THREE.Scene();
const amb = new THREE.AmbientLight(0xffffff, 0), hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 0), key = new THREE.DirectionalLight(0xffffff, 0);
scene.add(amb, hemi, key, key.target);
/** sheet: white light from his right, in front, above, calibrated so the lit tone is the sheet's colour exactly and the
 *  shade tone the sheet's shade (both tones take all the light: amb + key = pi). day / dusk / night: the town's own light
 *  (core/sky.js palettes), with the avatar lane's setLift(night). */
const LIGHTS = {
  sheet: { amb: 0.5, key: 0.5, lift: 0, bg: '#FBFAF5', floor: '#FBFAF5', shadow: '#E1E3E5' },
  day: { sun: '#fff2df', sunI: 2.75, sky: '#a9b3ee', ground: '#d9c6c8', hemiI: 1.62, lift: 0, bg: '#cfe3f5', floor: '#d9d4c9', shadow: 'rgba(52,48,70,0.30)' },
  dusk: { sun: '#ff9d62', sunI: 2.05, sky: '#9c8fce', ground: '#d99f9a', hemiI: 1.38, lift: 0.05, bg: '#d9a7ad', floor: '#b9a7a4', shadow: 'rgba(52,40,60,0.32)' },
  night: { sun: '#8fa6e6', sunI: 0.6, sky: '#51639e', ground: '#2b2842', hemiI: 1.05, lift: 1, bg: '#27315a', floor: '#3b4062', shadow: 'rgba(10,12,30,0.40)' },
};
let lightName = LIGHTS[params.get('light')] ? params.get('light') : 'sheet';
let quality = params.get('quality') === 'phone' ? 'phone' : 'high';
let calm = params.get('calm') === '1';
let meme = build(THREE, { quality, calm });
if (!meme) throw new Error('meme: the build failed');
scene.add(meme.root);

// ---- the ground: a floor that scrolls at his speed (1 m tiles), and a contact shadow (the sheet's flat ellipse in its light)
const tileTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 256); g.fillStyle = 'rgba(0,0,0,0.07)'; g.fillRect(0, 0, 128, 128); g.fillRect(128, 128, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(30, 30); t.magFilter = THREE.NearestFilter; t.anisotropy = 4; return t;
})();
const floorMat = new THREE.MeshBasicMaterial({ color: '#d9d4c9', map: tileTex });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), floorMat);
floor.rotation.x = -Math.PI / 2; floor.position.y = -0.002; scene.add(floor);
const blobCanvas = document.createElement('canvas'); blobCanvas.width = blobCanvas.height = 128;
const blobTex = new THREE.CanvasTexture(blobCanvas); blobTex.colorSpace = THREE.SRGBColorSpace;
function paintBlob(style) {
  const g = blobCanvas.getContext('2d'); g.clearRect(0, 0, 128, 128);
  if (style.startsWith('#')) { g.fillStyle = style; g.beginPath(); g.ellipse(64, 64, 62, 62, 0, 0, Math.PI * 2); g.fill(); }
  else { const gr = g.createRadialGradient(64, 64, 6, 64, 64, 62); gr.addColorStop(0, style); gr.addColorStop(0.65, style.replace(/[\d.]+\)$/, (m) => (parseFloat(m) * 0.45).toFixed(2) + ')')); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
  blobTex.needsUpdate = true;
}
const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
blob.rotation.x = -Math.PI / 2; blob.position.y = 0.001; scene.add(blob);
let floorZ = 0;

function applyLight(name) {
  const L = LIGHTS[name]; lightName = name;
  if (name === 'sheet') {
    amb.intensity = L.amb * Math.PI; key.intensity = L.key * Math.PI; key.color.set('#ffffff'); hemi.intensity = 0;
  } else {
    amb.intensity = 0; hemi.color.set(L.sky); hemi.groundColor.set(L.ground); hemi.intensity = L.hemiI; key.color.set(L.sun); key.intensity = L.sunI;
  }
  meme.setLift(L.lift);
  scene.background = new THREE.Color(L.bg);
  floorMat.color.set(L.floor); floor.visible = name !== 'sheet' || !CAPTURE;
  paintBlob(L.shadow);
  // the sheet's shadow is a flat ellipse 240 x 32 U; elsewhere a soft blob
  if (name === 'sheet') blob.scale.set(0.48, 0.26, 1); else blob.scale.set(0.62, 0.5, 1);
}
/** the key light: from his right (+X), in front (-Z) and above by default (az 45, el 40: the sheet's front view). The sheet
 *  lights every view from his right on the viewer's side: the side and back views take az 135 (his right, behind). */
let lightAz = 45, lightEl = 40;
function aimKey() {
  const a = (lightAz * Math.PI) / 180, e = (lightEl * Math.PI) / 180;
  key.position.set(Math.sin(a) * Math.cos(e) * 4, Math.sin(e) * 4, -Math.cos(a) * Math.cos(e) * 4).add(meme.root.position);
  key.target.position.copy(meme.root.position).setY(0.55);
}
applyLight(lightName);

// ---- cameras
const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 60);
const persp = new THREE.PerspectiveCamera(30, 1, 0.05, 200);
for (const c of [ortho, persp]) c.layers.enableAll();   // the line lives on layer 1
/** az: degrees round him, 0 in front, + toward his RIGHT (90 = the sheet's side view); el: degrees up */
function aim(cam, az, el, dist, cy, cx = 0) {
  const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180;
  cam.position.set(cx + Math.sin(a) * Math.cos(e) * dist, cy + Math.sin(e) * dist, -Math.cos(a) * Math.cos(e) * dist);
  cam.lookAt(cx, cy, 0);
}
/** the game's third-person rig for a frame of this aspect (camera.js), behind him (he faces -Z) */
const camOut = { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0 };
function gameCam(cam, aspect, feetY = 0) {
  const C = thirdFor(aspect);
  desiredCam(0, feetY, 0, 0, camOut, C);
  // the walker's look point for a full boom (placeWalk): the rig's own height
  cam.fov = fovFor(aspect); cam.aspect = aspect; cam.near = 0.05; cam.far = 200; cam.updateProjectionMatrix();
  cam.position.set(camOut.x, camOut.y, camOut.z); cam.lookAt(camOut.tx, camOut.ty, camOut.tz);
  return C;
}

function size(w, h) { renderer.setSize(w, h, false); canvas.style.width = w + 'px'; canvas.style.height = h + 'px'; }
let rendered = 0;
function draw(cam) { aimKey(); renderer.render(scene, cam); rendered++; }

// ---- one frame for the capture: a view, a pose at time t (deterministic), a light
function frame({ az = 0, el = 4, pose = 'idle', t = 1.2, w = 900, h = 1200, cam = 'ortho', hh = 0.7, cy = 0.575, dist = 8, light = 'sheet', speed, fov = 26, y = 0, blink = false, floorOn, keyAz = 45, keyEl = 40 } = {}) {
  size(w, h);
  lightAz = keyAz; lightEl = keyEl;
  applyLight(light);
  meme.poseAt(pose, t, { speed });
  if (blink) meme.blink(1);
  meme.root.position.set(0, y, 0);
  blob.scale.multiplyScalar(1 / (1 + 2.5 * y));
  floor.visible = floorOn ?? light !== 'sheet';
  let c;
  if (cam === 'ortho') { c = ortho; const a = w / h; c.left = -hh * a; c.right = hh * a; c.top = hh; c.bottom = -hh; c.updateProjectionMatrix(); aim(c, az, el, dist, cy); }
  else if (cam === 'game') { c = persp; gameCam(c, w / h, y * 0); }
  else { c = persp; c.fov = fov; c.aspect = w / h; c.updateProjectionMatrix(); aim(c, az, el, dist, cy); }
  meme.root.updateMatrixWorld(true);
  draw(c);
  meme.root.position.set(0, 0, 0);
  lightAz = 45; lightEl = 40;
  return canvas;
}

// ---- saving (the capture runner's POST /save/<name>)
async function post(name, cv) {
  const b = await new Promise((r) => cv.toBlob(r, 'image/png'));
  const res = await fetch('/save/' + name, { method: 'POST', body: b });
  if (!res.ok) throw new Error('save failed ' + name);
  return name;
}
function copyCanvas(src) { const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; c.getContext('2d').drawImage(src, 0, 0); return c; }
/** a strip of frames: each its own render, cols per row, a label under each, a title over all */
async function strip(name, frames, { w = 360, h = 480, cols = frames.length, labels = [], title = '', bg = '#FBFAF5' } = {}) {
  const rows = Math.ceil(frames.length / cols), lab = 34, top = title ? 56 : 0, sheet = document.createElement('canvas');
  sheet.width = cols * w; sheet.height = top + rows * (h + lab);
  const g = sheet.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, sheet.width, sheet.height);
  if (title) { g.fillStyle = '#223A70'; g.font = `700 24px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(title, 20, 30); }
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i], cv = typeof f === 'function' ? f() : frame({ w, h, ...f });
    const x = (i % cols) * w, y = top + Math.floor(i / cols) * (h + lab);
    g.drawImage(cv, x, y, w, h);
    g.fillStyle = '#595857'; g.font = `500 15px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(labels[i] ?? '', x + w / 2, y + h + lab / 2);
  }
  return post(name, sheet);
}

// ---- motion: run him through inputs(t) frame by frame (as the walker does), the floor scrolling at his speed
function play(seconds, inputs, onFrame, { fps = 60, start = 'idle' } = {}) {
  meme.poseAt(start, 1.0);
  meme.setPose('auto');
  const n = Math.round(seconds * fps);
  let y = 0;
  for (let i = 0; i < n; i++) {
    const t = i / fps, inp = inputs(t), g = meme.gait(inp.speed || 0, inp.run);
    meme.update(1 / fps, { ...inp, cadence: (inp.speed || 0) > 0.05 ? g.rate : undefined });
    y = inp.y || 0;
    floorZ += (inp.speed || 0) / fps;   // he goes toward -Z: the floor goes by toward +Z
    tileTex.offset.set(0, (floorZ / 2) % 1);
    if (onFrame) onFrame(i, t, inp);
  }
  return y;
}
/** a jump: v0 up, gravity 9.81 (the player's), landing at y 0; returns { y, vy, onGround } at t (s from the take-off) */
function jumpAt(t, v0 = 3.4) { const y = v0 * t - 0.5 * 9.81 * t * t; return y > 0 || t <= 0 ? { y: Math.max(0, y), vy: t <= 0 ? 0 : v0 - 9.81 * t, onGround: t <= 0 } : { y: 0, vy: 0, onGround: true }; }

// ---- the interactive viewer
const UI = { pose: params.get('pose') || 'tour', cam: params.get('cam') || 'orbit', az: 25, el: 6, dist: 4.2, spin: true };
const state = { t: 0, tourT: 0, jumpT: -1, last: performance.now() };
const TOUR = [['idle', 3], ['walk', 3.5], ['run', 3.5], ['jump', 1.0], ['idle', 2.5], ['run', 2.0], ['jump', 1.0], ['walk', 2.5]];
const tourLen = TOUR.reduce((s, [, d]) => s + d, 0);
function tourInputs(t) {
  let u = t % tourLen;
  for (const [name, d] of TOUR) {
    if (u < d) {
      if (name === 'walk') return { speed: Math.min(MEME_SPEED.walk, u * 4), onGround: true, vy: 0, run: 0, label: 'あるく · walk' };
      if (name === 'run') return { speed: Math.min(MEME_SPEED.run, 1.3 + u * 6), onGround: true, vy: 0, run: Math.min(1, u * 8), label: 'はしる · run' };
      if (name === 'jump') { const j = jumpAt(u); return { speed: 0, onGround: j.onGround, vy: j.vy, y: j.y, label: 'とぶ · jump' }; }
      return { speed: 0, onGround: true, vy: 0, label: 'たつ · idle' };
    }
    u -= d;
  }
  return { speed: 0, onGround: true, vy: 0 };
}
function liveInputs(dt) {
  if (UI.pose === 'tour') return tourInputs(state.tourT);
  if (UI.pose === 'walk') return { speed: MEME_SPEED.walk, onGround: true, vy: 0, run: 0, label: `あるく · walk ${MEME_SPEED.walk} m/s` };
  if (UI.pose === 'run') return { speed: MEME_SPEED.run, onGround: true, vy: 0, run: 1, label: `はしる · run ${MEME_SPEED.run} m/s` };
  if (UI.pose === 'jump') { if (state.jumpT < 0) state.jumpT = 0; state.jumpT += dt; if (state.jumpT > 1.6) state.jumpT = -0.6; const j = jumpAt(state.jumpT); return { speed: 0, onGround: j.onGround, vy: j.vy, y: j.y, label: 'とぶ · jump' }; }
  if (UI.pose === 'fall') return { speed: 0, onGround: false, vy: -3, y: 0.25, label: 'おちる · fall' };
  return { speed: 0, onGround: true, vy: 0, label: 'たつ · idle' };
}
function button(row, label, on, click) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.addEventListener('click', click); document.getElementById(row).appendChild(b); return b; }
function buildPanel() {
  for (const id of ['poses', 'cams', 'lights', 'opts']) { const r = document.getElementById(id); while (r.children.length > 1) r.lastChild.remove(); }
  for (const [p, l] of [['tour', 'ツアー'], ['idle', 'たつ'], ['walk', 'あるく'], ['run', 'はしる'], ['jump', 'とぶ'], ['fall', 'おちる']]) button('poses', l, UI.pose === p, () => { UI.pose = p; state.jumpT = -1; meme.setPose('auto'); buildPanel(); });
  for (const [c, l] of [['orbit', 'まわす'], ['front', 'まえ'], ['side', 'よこ'], ['back', 'うしろ'], ['game', 'ゲーム'], ['phone', 'スマホ']]) button('cams', l, UI.cam === c, () => { UI.cam = c; if (c === 'front') UI.az = 0; if (c === 'side') UI.az = 90; if (c === 'back') UI.az = 180; buildPanel(); });
  for (const [k, l] of [['sheet', 'シート'], ['day', 'ひる'], ['dusk', 'ゆうがた'], ['night', 'よる']]) button('lights', l, lightName === k, () => { applyLight(k); buildPanel(); });
  button('opts', quality === 'phone' ? 'スマホ品質' : '高品質', false, () => { quality = quality === 'phone' ? 'high' : 'phone'; rebuild(); buildPanel(); });
  button('opts', 'へらす動き', calm, () => { calm = !calm; meme.setCalm(calm); buildPanel(); });
}
function rebuild() { const p = meme.root.parent; meme.dispose(); meme = build(THREE, { quality, calm }); p.add(meme.root); applyLight(lightName); }
let dragging = null;
canvas.addEventListener('pointerdown', (e) => { dragging = { x: e.clientX, y: e.clientY, az: UI.az, el: UI.el }; UI.spin = false; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => { if (!dragging) return; UI.az = dragging.az - (e.clientX - dragging.x) * 0.4; UI.el = Math.max(-10, Math.min(60, dragging.el + (e.clientY - dragging.y) * 0.25)); if (UI.cam !== 'orbit') { UI.cam = 'orbit'; buildPanel(); } });
canvas.addEventListener('pointerup', () => { dragging = null; });
canvas.addEventListener('wheel', (e) => { UI.dist = Math.max(1.6, Math.min(9, UI.dist * (1 + e.deltaY * 0.001))); e.preventDefault(); }, { passive: false });

function loop(now) {
  const dt = Math.min(0.1, (now - state.last) / 1000); state.last = now;
  state.tourT += dt;
  const inp = liveInputs(dt), g = meme.gait(inp.speed || 0, inp.run);
  const pose = meme.update(dt, { ...inp, cadence: (inp.speed || 0) > 0.05 ? g.rate : undefined });
  meme.root.position.y = inp.y || 0;
  blob.scale.set(...(lightName === 'sheet' ? [0.48, 0.26, 1] : [0.62, 0.5, 1]).map((v, i) => (i < 2 ? v / (1 + 2.5 * (inp.y || 0)) : v)));
  floorZ += (inp.speed || 0) * dt; tileTex.offset.set(0, (floorZ / 2) % 1);
  const W = window.innerWidth, H = window.innerHeight;
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(W, H, false);
  renderer.setScissorTest(false); renderer.setViewport(0, 0, W, H);
  if (UI.cam === 'phone') {
    // a 390 x 844 phone in the middle of the window, framed exactly as the game frames him on a phone
    renderer.setClearColor('#E6E8EC'); renderer.clear();
    const ph = Math.min(H - 32, 844), pw = Math.round(ph * 390 / 844), x = Math.round((W - pw) / 2), y = Math.round((H - ph) / 2);
    renderer.setScissorTest(true); renderer.setScissor(x, y, pw, ph); renderer.setViewport(x, y, pw, ph);
    gameCam(persp, 390 / 844); draw(persp);
  } else if (UI.cam === 'game') { gameCam(persp, W / H); draw(persp); }
  else {
    if (UI.spin && UI.cam === 'orbit') UI.az += dt * 14;
    persp.fov = 30; persp.aspect = W / H; persp.updateProjectionMatrix();
    aim(persp, UI.az, UI.el, UI.dist, 0.6 + (inp.y || 0) * 0.5);
    draw(persp);
  }
  const s = meme.stats;
  document.getElementById('stats').textContent = `${inp.label || pose} · ${(inp.speed || 0).toFixed(2)} m/s · ${meme.cadence.toFixed(2)} cycles/s\n` +
    `${s.quality}: ${s.triangles} tris + ${s.lineTriangles} line · ${s.drawCalls} draw calls · ${s.bones} bones\nheight ${MEME_HEIGHT} m · walk ${MEME_SPEED.walk} / run ${MEME_SPEED.run} m/s`;
  requestAnimationFrame(loop);
}

window.meme = {
  get model() { return meme; }, MEME_HEIGHT, MEME_SPEED, memeGait, THIRD,
  frame, post, strip, play, jumpAt, size, copyCanvas, applyLight, gameCam,
  /** a single view saved as a file */
  async shot(name, opts) { return post(name, frame(opts)); },
  stats: () => meme.stats,
  setQuality(q) { if (q !== quality) { quality = q; rebuild(); } return meme.stats; },
  setCalm(v) { calm = !!v; meme.setCalm(calm); },
  scene, renderer, persp, ortho, blob, floor, tileTex, key, FONT,
};
if (!CAPTURE) { buildPanel(); requestAnimationFrame(loop); }
else { frame({}); }
window.memeReady = true;
