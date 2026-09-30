// Kesennuma Living City v3 — bootstrap: renderer, sky, context, module build, batching, main loop, HUD.
// Engine: ported from Sakuragaoka Station by Kenton-GMI (MIT, see src/anime/LICENSE-sakuragaoka-station).
// [v3:foundation] Changes from Sakura: static module registry (Bun bundling), Kesennuma layout, drone cameras,
// time-of-day core (sky.setHours / sky.setTime), camera near/far + outline range + shadow box scaled by altitude.
import * as THREE from 'three';
import * as L from './world/layout.js';
import { MODULE_LOADERS } from './world/registry.js';
import { createContext } from './core/ctx.js';
import { createRenderPipeline } from './core/renderer.js';
import { createSky } from './core/sky.js';
import { Player } from './core/player.js';
import { batchStatic } from './core/batch.js';
import { batchStatic as batchStatic2 } from './core/batch2.js';
import { createAudio } from './core/audio.js';
import { createPlanet } from './core/planet.js';   // [v3:integrate] tiny-planet overview

/** Build order. A module may read ctx.services of earlier modules at build time (life reads everyone). */
export const MODULES = ['environment', 'water', 'town', 'harbor', 'life'];
/** [v3:integrate] static batching cells (m): near the hero zone, beyond it, and the hero half-size. */
export const BATCH = { nearCell: 400, farCell: 2000, farR: 600 };   // measured vs 48/200: -35 % draw calls, market 25 -> 13 ms, hero 18 -> 16 ms (1080p, gate-throttled); [v3:fix] 300/1000/400 -> 400/2000/600: -10..-16 % calls again (city 1203 -> 1060, drone 837 -> 699)

const params = new URLSearchParams(location.search);
const SHOT = params.has('shot');
const ONLY = params.get('only') ? params.get('only').split(',').map((s) => s.trim()).filter(Boolean) : null;
const $ = (id) => document.getElementById(id);

const isTouch = matchMedia('(pointer: coarse)').matches;
const QUALITY = {
  high: { name: 'high', pixelRatio: Math.min(devicePixelRatio, 1.5), msaa: 4, shadowMap: 4096, shadowSize: 75, petals: 1.0, heroR: 1.0 },
  medium: { name: 'medium', pixelRatio: Math.min(devicePixelRatio, 1.0), msaa: 4, shadowMap: 2048, shadowSize: 60, petals: 0.6, heroR: 0.8 },
  low: { name: 'low', pixelRatio: isTouch ? Math.min(devicePixelRatio, 1.25) : 0.75,   // [v3:fix] phones: 0.75 CSS px looked soft (292x633 on a DPR-3 phone)
     msaa: 0, shadowMap: 2048, shadowSize: 45, petals: 0.35, heroR: 0.55 },
};
let qName = params.get('q') || (() => { try { return localStorage.getItem('klc.q'); } catch (e) { return null; } })() || (isTouch ? 'low' : 'high');
if (!QUALITY[qName]) qName = 'high';
const quality = { ...QUALITY[qName] };
if (SHOT) quality.pixelRatio = 1;

// ------------------------------------------------------------------ renderer & scene
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: SHOT });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;   // [v3:fix] the soft PCF variant is deprecated in r18x (console warning)
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.info.autoReset = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(Number(params.get('fov') || 55), innerWidth / innerHeight, 0.1, 30000);
const START_HOURS = params.has('hours') ? Number(params.get('hours')) : ({ asa: 6.5, hiru: 12, yugata: 16.5, yuyake: 17 + 20 / 60, yoru: 19.5 }[params.get('preset')] ?? 16.5);
const sunDir = new THREE.Vector3(...L.sunDirAt(START_HOURS)).normalize();
const sky = createSky(scene, sunDir, quality);
const pipeline = createRenderPipeline(renderer, quality);
const audio = createAudio();
const ctx = createContext({ scene, camera, renderer, audio, quality, sunDir });
ctx.sky = sky; ctx.pipeline = pipeline;
const planet = createPlanet({ renderer, pipeline, scene, camera, sky, quality, sunDir });   // [v3:integrate]
ctx.planet = planet;
sky.attach(ctx);
sky.setHours(START_HOURS);
if (params.has('cloud')) sky.uniforms.uCloud.value = Number(params.get('cloud'));   // cloud coverage 0..1 (life's weather overrides)
window.__ctx = ctx; window.THREE = THREE; window.__L = L;

function resize() {
  const w = SHOT ? Number(params.get('w') || 1280) : innerWidth, h = SHOT ? Number(params.get('h') || 720) : innerHeight;
  renderer.setSize(w, h, !SHOT);
  camera.aspect = w / h;
  // [v3:polish3] portrait screens keep a ~64 deg horizontal view (a fixed 55 deg vertical FOV left a phone only ~28 deg
  // across: the town a thin strip over empty bay); ?fov= still pins it for the shot tools
  camera.fov = params.get('fov') ? Number(params.get('fov')) : camera.aspect < 1 ? Math.min(88, 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(64) / 2) / camera.aspect) * 180 / Math.PI) : 55;
  camera.updateProjectionMatrix();
  pipeline.setSize(w, h, quality.pixelRatio);
  ctx.wires.setResolution(pipeline.size.x, pipeline.size.y);
}
addEventListener('resize', resize);
resize();

// ------------------------------------------------------------------ fonts
async function loadFonts() {
  if (!document.fonts || !document.fonts.load) return;
  const faces = ['700 32px "Noto Sans JP"', '400 32px "Noto Sans JP"', '900 32px "Noto Sans JP"', '700 32px "Noto Serif JP"',
    '700 32px "Zen Maru Gothic"', '400 32px "Yusei Magic"', '400 32px "Yuji Syuku"'];
  const jp = '気仙沼けせんぬまKesennuma鮮魚乾物喫茶酒店魚市場浮見堂五十鈴神社止まれ';
  await Promise.race([Promise.all(faces.map((f) => document.fonts.load(f, jp).catch(() => null))), new Promise((r) => setTimeout(r, 6000))]);
}

// ------------------------------------------------------------------ build
const errors = []; window.__errors = errors;
const stats = { modules: {} }; window.__stats = stats;
function setProgress(frac, label) {
  const bar = $('bar'); if (bar) bar.style.transform = `scaleX(${frac})`;
  const lab = $('loadlabel'); if (lab && label !== undefined) lab.textContent = label;   // [v3:fix] '' clears 仕上げ中… (the ready line is CSS)
}
const LABELS = { _ground: '下地', environment: '山と地形', water: '内湾の海', town: '町並み', harbor: '港と船', life: '町の暮らし' };

async function build() {
  await loadFonts();
  const known = Object.keys(MODULE_LOADERS);
  const list = ONLY ? ONLY.filter((m) => known.includes(m)) : MODULES.filter((m) => known.includes(m));
  if (ONLY) for (const m of ONLY) if (!known.includes(m)) errors.push({ module: m, message: 'no such module (src/anime/world/' + m + '.js)' });
  let i = 0;
  for (const name of list) {
    setProgress(i / (list.length + 1), `${LABELS[name] || name} を準備中…`);
    await new Promise((r) => setTimeout(r, 0));
    const t0 = performance.now();
    try {
      const mod = await MODULE_LOADERS[name]();
      const before = ctx.staticRoot.children.length + ctx.dynamicRoot.children.length;
      if (typeof mod.build !== 'function') throw new Error('module has no build(ctx) export');
      await mod.build(ctx);
      stats.modules[name] = { ms: Math.round(performance.now() - t0), objects: ctx.staticRoot.children.length + ctx.dynamicRoot.children.length - before };
    } catch (e) {
      console.error(`[module ${name}]`, e);
      errors.push({ module: name, message: String((e && e.stack) || e) });
    }
    i++;
  }
  setProgress(list.length / (list.length + 1), '仕上げ中…');
  await new Promise((r) => setTimeout(r, 0));
  const wm = ctx.wires.build(); if (wm) { scene.add(wm); ctx.wires.setResolution(pipeline.size.x, pipeline.size.y); }
  const t0 = performance.now();
  // [v3:integrate] batching cells sized for a 3 km town (Sakura's 48 m / 200 m cells were for one station square):
  // the renderer is CPU-bound on draw calls, so coarse cells win; ?cells=near,far,farR overrides (tuning)
  const cp = (params.get('cells') || '').split(',').map(Number);
  const cells = { nearCell: cp[0] || BATCH.nearCell, farCell: cp[1] || BATCH.farCell, farR: cp[2] || BATCH.farR, center: [L.ZONES.hero.cx, L.ZONES.hero.cz] };
  const b = params.get('batch') === '1' ? batchStatic(ctx.staticRoot) : batchStatic2(ctx.staticRoot, { mat: ctx.mat, ...cells });
  stats.batch = { ...b, ms: Math.round(performance.now() - t0) };
  // [v3:fix] compile every program up front, hidden ones too (season particles, night-only meshes) and the tiny planet's
  // fold pass: the first season / planet toggle used to hitch ~200 ms compiling shaders
  try {
    const hidden = []; scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    renderer.compile(scene, camera);
    for (const o of hidden) o.visible = false;
    planet.precompile?.();
  } catch (e) { console.warn(e); }
  setProgress(1, '');
}

// ------------------------------------------------------------------ player / cameras
const player = new Player(camera, canvas, ctx.physics, L.WORLD.play);
ctx.playerObj = player;
const DEG = 180 / Math.PI;
/** Free camera at pos looking at a point (drone). */
function lookAt(pos, look) {
  const dx = look[0] - pos[0], dy = look[1] - pos[1], dz = look[2] - pos[2];
  const yaw = Math.atan2(-dx, -dz) * DEG, pitch = Math.atan2(dy, Math.hypot(dx, dz)) * DEG;
  player.setPose(pos[0], pos[2], yaw, pitch, pos[1]);
}
/** "hero" | "walk" | "tour:<id>" | "tourwalk:<id>" | "x,z,yaw,pitch" | "x,y,z,yaw,pitch" | "x,y,z>lx,ly,lz" */
function camSpec(s) {
  s = String(s).trim();
  // [v3:polish2] the hero drone is the tour's re-framed one (life/tour.js FRAMES.hero) when life is loaded, so the
  // opening HUD view, the stills and the 内湾 tour stop are one framing
  if (s === 'hero') { const hd = ctx.services.life?.tour?.stops?.find((x) => x.id === 'hero')?.drone || L.HERO.drone; return lookAt(hd.pos, hd.look); }
  if (s === 'walk') { player.fly = false; return player.setPose(L.HERO.walk.x, L.HERO.walk.z, L.HERO.walk.yaw, L.HERO.walk.pitch); }
  const m = s.match(/^tour(walk)?:(\w+)$/);
  if (m) {
    // [v3:fix] the UI's tour stops (life's tour: hero, market, pier7, ukimido, ...) first, then the layout's; bay = hero
    const id = m[2] === 'bay' ? 'hero' : m[2];
    const t = ctx.services.life?.tour?.stops?.find((x) => x.id === id) || L.TOUR.find((x) => x.id === m[2] || (id === 'hero' && x.id === 'bay'));
    if (!t) throw new Error('no tour stop ' + m[2]);
    if (m[1] && t.walk) { player.fly = false; return player.setPose(t.walk.x, t.walk.z, t.walk.yaw, t.walk.pitch); }
    return lookAt(t.drone.pos, t.drone.look);
  }
  if (s.includes('>')) { const [a, b] = s.split('>').map((p) => p.split(',').map(Number)); return lookAt(a, b); }
  const v = s.split(',').map(Number);
  if (v.length === 4) { player.fly = false; player.setPose(v[0], v[1], v[2], v[3]); }
  else if (v.length >= 5) player.setPose(v[0], v[2], v[3], v[4], v[1]);
}
window.__camSpec = camSpec;
window.__setCam = (x, y, z, yaw, pitch) => { if (y === null || y === undefined) player.setPose(x, z, yaw, pitch); else player.setPose(x, z, yaw, pitch, y); };
window.__lookAt = lookAt;
window.__setHours = (h) => { if (ctx.services.time?.setHours) ctx.services.time.setHours(h); else sky.setHours(h); };

const VIEWS = {
  Digit1: { spec: 'hero', label: '内湾（空から）' },
  Digit2: { spec: 'walk', label: '内湾の遊歩道' },
  Digit3: { spec: 'tour:market', label: '魚市場' },
  Digit4: { spec: 'tour:anba', label: '安波山' },
  Digit5: { spec: 'tour:kanae', label: 'かなえ大橋' },
};

// ------------------------------------------------------------------ view-dependent engine settings
/** Near/far planes, outline range and the shadow box follow the camera height above the ground. */
function viewTune() {
  const p = camera.position;
  const g = Math.max(L.heightAt(p.x, p.z), L.SEA.level);
  const alt = Math.max(1, p.y - g);
  camera.near = THREE.MathUtils.clamp(alt * 0.02, 0.1, 6);
  camera.far = alt > 60 ? 30000 : 16000;
  camera.updateProjectionMatrix();
  pipeline.setView?.(alt);
  sky.setView?.(alt);
}

// ------------------------------------------------------------------ simulation
let simT = params.has('t') ? Number(params.get('t')) : 0;
function stepUpdates(dt, t) {
  ctx.time = t; ctx.shared.uTime.value = t;
  ctx.shared.uGust.value = 0.5 + 0.28 * Math.sin(t * 0.37) + 0.14 * Math.sin(t * 1.13 + 1.7) + 0.08 * Math.sin(t * 2.9 + 0.4);
  ctx.player.position.copy(player.pos);
  for (const fn of ctx._updates) { try { fn(dt, t); } catch (e) { if (!fn.__err) { fn.__err = 1; console.error('update error', e); errors.push({ module: 'update', message: String((e && e.stack) || e) }); } } }
}
/** GPU benchmark: renders n frames back-to-back (forcing sync) and returns ms/frame + counts. */
window.__bench = (n = 30) => {
  const gl = renderer.getContext(); const px = new Uint8Array(4);
  viewTune(); pipeline.render(scene, camera, sunDir, simT); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const t0 = performance.now();
  for (let i = 0; i < n; i++) { renderer.info.reset(); sky.update(simT, camera); pipeline.render(scene, camera, sunDir, simT); }
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const ms = (performance.now() - t0) / n;
  return { ms: +ms.toFixed(2), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, programs: renderer.info.programs?.length };
};
window.__diag = () => {
  const out = { static: {}, dynamic: {}, other: {} };
  const kind = (o) => {
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    let k = o.isInstancedMesh ? 'inst:' : '';
    k += m.type.replace('Material', '');
    if (m.map) k += '+map'; if (m.transparent) k += '+transp'; if (m.alphaTest > 0) k += '+atest'; if (m.vertexColors) k += '+vc';
    return k;
  };
  const walk = (root, bucket) => root.traverse((o) => { if (o.isMesh || o.isLine || o.isPoints) { const k = kind(o); bucket[k] = (bucket[k] || 0) + 1; } });
  walk(ctx.staticRoot, out.static); walk(ctx.dynamicRoot, out.dynamic);
  scene.children.forEach((c) => { if (c !== ctx.staticRoot && c !== ctx.dynamicRoot) walk(c, out.other); });
  return out;
};
// [v3:integrate] tiny planet: __planet(true|false, { at: [x,y,z], zoom }) -> active
window.__planet = (on = true, o = {}) => { if (on) planet.enter({ ...o, t: simT }); else planet.exit(); return planet.active; };
window.__sim = (target) => { let t = 0; const dt = 1 / 30; while (t < target) { stepUpdates(dt, t); t += dt; } simT = target; stepUpdates(0, simT); };
// [v3:life] continue the simulation from the current time (deterministic film frames: no replay from 0 per frame)
window.__simTo = (target, dt = 1 / 30) => { if (target < simT) return window.__sim(target); let t = simT; while (t + dt <= target + 1e-9) { t += dt; stepUpdates(dt, t); } simT = target; stepUpdates(0, simT); return simT; };

// ------------------------------------------------------------------ HUD
let areaName = '';
function areaAt(x, z) { for (const a of L.AREAS) if (x >= a.x0 && x <= a.x1 && z >= a.z0 && z <= a.z1) return a.name; return ''; }
let toastTimer = 0;
function showToast(name) {
  const el = $('toast'); if (!el || !name) return;
  el.querySelector('.t-name').textContent = name;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3800);
}
function hudTick() {
  const n = areaAt(player.pos.x, player.pos.z);
  if (n && n !== areaName) { areaName = n; if (started) showToast(n); }
  const clock = $('clock');
  if (clock) { const T = ctx.services.time; clock.textContent = T?.clock ? T.clock() : sky.clock(); }
}

// ------------------------------------------------------------------ main loop
let started = false, last = performance.now(), fpsAcc = 0, fpsN = 0, fps = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (SHOT) dt = 0;
  simT += dt;
  if (!SHOT) player.update(dt);
  ctx.physics.refreshDynamic();
  stepUpdates(dt, simT);
  try { audio.update(camera, dt); } catch (e) { if (!audio.__err) { audio.__err = 1; console.error('audio', e); } }
  viewTune();
  sky.update(simT, camera);
  renderer.info.reset();
  if (planet.active) planet.render(simT); else pipeline.render(scene, camera, sunDir, simT);   // [v3:integrate]
  if (!SHOT) hudTick();
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; const s = $('stats'); if (s && !s.hidden) s.textContent = `${fps.toFixed(0)} fps · ${renderer.info.render.calls} calls · ${(renderer.info.render.triangles / 1e6).toFixed(2)}M tris`; }
  stats.fps = fps; stats.calls = renderer.info.render.calls; stats.triangles = renderer.info.render.triangles;
}

function start() {
  if (started) { player.requestLock(); return; }
  started = true;
  player.enabled = true;
  document.body.classList.add('playing');
  if (!player.fly) player.requestLock();
  try { audio.start(); } catch (e) { console.warn(e); }
  showToast(areaAt(player.pos.x, player.pos.z) || L.NAMES.bay);
}

async function main() {
  await build();
  if (params.get('cam')) camSpec(params.get('cam')); else camSpec('hero');
  if (params.has('fly')) player.fly = true;
  if (simT > 0) window.__sim(simT); else stepUpdates(0, 0);
  viewTune();
  sky.update(simT, camera);
  requestAnimationFrame(frame);
  if (SHOT) {
    document.body.classList.add('shot');
    let n = 0; const wait = () => { if (++n > 6) { window.__ready = true; } else requestAnimationFrame(wait); }; requestAnimationFrame(wait);
    return;
  }
  document.body.classList.add('loaded');
  const go = $('go'); if (go) { go.disabled = false; go.focus(); go.addEventListener('click', start); }
  canvas.addEventListener('click', () => { if (started) player.requestLock(); });
  document.addEventListener('pointerlockchange', () => { document.body.classList.toggle('locked', document.pointerLockElement === canvas); });
  addEventListener('keydown', (e) => {
    if (e.code === 'Enter' && !started) start();
    if (!started) return;
    if (e.code === 'KeyH') document.body.classList.toggle('noui');
    if (e.code === 'KeyM') { audio.muted = !audio.muted; const b = $('mute'); if (b) b.setAttribute('aria-pressed', String(audio.muted)); }
    if (e.code === 'KeyR') camSpec('hero');
    if (e.code === 'Backquote') { const s = $('stats'); if (s) s.hidden = !s.hidden; }
    const v = VIEWS[e.code]; if (v) { camSpec(v.spec); showToast(v.label); }
  });
  const q = $('quality');
  if (q) { q.value = qName; q.addEventListener('change', () => { try { localStorage.setItem('klc.q', q.value); } catch (e) { /* private mode */ } location.reload(); }); }
  const mute = $('mute'); if (mute) mute.addEventListener('click', () => { audio.muted = !audio.muted; mute.setAttribute('aria-pressed', String(audio.muted)); });
  if (params.has('stats')) $('stats').hidden = false;
  if (errors.length) console.warn('module errors', errors);
}
main();
