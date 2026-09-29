// Headless build check for world modules — no GPU needed. Ported from Sakuragaoka Station (Kenton-GMI, MIT).
// [v3:foundation] usage: env -u NODE_OPTIONS bun tools/anime/check.mjs <module> [more modules...]   e.g. ... check.mjs environment water
// Modules: src/anime/world/<name>.js or src/anime/world/<name>/index.js. Budgets: docs/anime/BUILDER-GUIDE.md section 6.
// Builds the module(s) with a stubbed DOM, runs update() for a while, and prints a report:
// errors, triangles, meshes, materials, textures, colliders, bounds, and warnings.
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
import fs from 'node:fs';

// ---------------------------------------------------------------- DOM stubs
class Ctx2D {
  constructor(c) { this.canvas = c; this.font = '10px sans-serif'; }
  measureText(t) { const m = /(\d+(?:\.\d+)?)px/.exec(this.font); const s = m ? Number(m[1]) : 10; return { width: [...String(t)].length * s * 0.92, actualBoundingBoxAscent: s * 0.8, actualBoundingBoxDescent: s * 0.2 }; }
  createLinearGradient() { return { addColorStop() {} }; }
  createRadialGradient() { return { addColorStop() {} }; }
  createConicGradient() { return { addColorStop() {} }; }
  createPattern() { return {}; }
  getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }; }
  createImageData(w, h) { return { data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }; }
  putImageData() {} getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; }
  isPointInPath() { return false; }
  getLineDash() { return []; }
}
const ctxProxy = (c) => new Proxy(new Ctx2D(c), { get(t, k) { if (k in t) return t[k]; return () => {}; }, set(t, k, v) { t[k] = v; return true; } });
class FakeCanvas {
  constructor() { this.width = 300; this.height = 150; this.style = {}; this._ctx = null; }
  getContext(type) { if (type !== '2d') return null; return this._ctx || (this._ctx = ctxProxy(this)); }
  toDataURL() { return 'data:,'; } addEventListener() {} removeEventListener() {}
}
globalThis.window = globalThis;
globalThis.self = globalThis;
globalThis.document = {
  createElement: (t) => (t === 'canvas' ? new FakeCanvas() : { style: {}, addEventListener() {}, appendChild() {}, setAttribute() {} }),
  createElementNS: (ns, t) => (t === 'canvas' ? new FakeCanvas() : { style: {} }),
  fonts: { load: async () => [] }, body: { appendChild() {} }, addEventListener() {},
};
globalThis.Image = class { constructor() { this.width = 1; this.height = 1; } addEventListener() {} };
globalThis.HTMLCanvasElement = FakeCanvas; globalThis.OffscreenCanvas = FakeCanvas;
globalThis.requestAnimationFrame = (f) => setTimeout(() => f(Date.now()), 16);
globalThis.addEventListener = () => {};
globalThis.innerWidth = 1280; globalThis.innerHeight = 720; globalThis.devicePixelRatio = 1;
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.performance = globalThis.performance || { now: () => Date.now() };

// ---------------------------------------------------------------- run
const THREE = await import('three');
const { createContext } = await import(pathToFileURL(path.join(root, 'src/anime/core/ctx.js')).href);
const { createAudio } = await import(pathToFileURL(path.join(root, 'src/anime/core/audio.js')).href);
const { batchStatic } = await import(pathToFileURL(path.join(root, 'src/anime/core/batch2.js')).href);
const L = await import(pathToFileURL(path.join(root, 'src/anime/world/layout.js')).href);

const names = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (!names.length) { console.log('usage: bun tools/anime/check.mjs <module> [...]'); process.exit(1); }

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 30000);
camera.position.set(L.HERO.walk.x, L.HERO.walk.y ?? 3, L.HERO.walk.z);
const sunDir = new THREE.Vector3(...L.SUN_DIR).normalize();
let audio; try { audio = createAudio(); } catch (e) { console.log('audio createAudio() threw:', e.message); audio = null; }
const quality = { name: 'high', pixelRatio: 1, msaa: 4, shadowMap: 4096, shadowSize: 75, petals: 1 };
const ctx = createContext({ scene, camera, renderer: null, audio, quality, sunDir });
ctx.sky = { sun: new THREE.DirectionalLight(), hemi: new THREE.HemisphereLight(), uniforms: {}, setTime() {}, setHours() {} };
ctx.pipeline = { compMat: { uniforms: {} } };

function triCount(o) {
  const g = o.geometry; if (!g || !g.attributes.position) return 0;
  const n = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
  return n * (o.isInstancedMesh ? o.count : 1);
}
function snapshot() {
  const set = new Set(); scene.traverse(o => set.add(o)); return set;
}
const warnings = [];
let failed = false;
const BUDGET = { environment: 900e3, water: 20e3, town: 3200e3, harbor: 1800e3, life: 600e3, _ground: 400e3 };

for (const name of names) {
  const before = snapshot();
  const colBefore = ctx.physics.count, wiresBefore = ctx.wires.count, texBefore = ctx.tex.pixels, updBefore = ctx._updates.length;
  const t0 = Date.now();
  let err = null;
  try {
    const f1 = path.join(root, `src/anime/world/${name}.js`), f2 = path.join(root, `src/anime/world/${name}/index.js`);
    const mod = await import(pathToFileURL(fs.existsSync(f1) ? f1 : f2).href);
    if (typeof mod.build !== 'function') throw new Error('no exported build(ctx)');
    await mod.build(ctx);
  } catch (e) { err = e; failed = true; }
  const ms = Date.now() - t0;
  scene.updateMatrixWorld(true);
  const added = []; scene.traverse(o => { if (!before.has(o)) added.push(o); });
  let tris = 0, meshes = 0, inst = 0, instances = 0, nan = 0;
  const mats = new Set(), matTypes = {}, box = new THREE.Box3(), tb = new THREE.Box3();
  const nonToon = new Set();
  for (const o of added) {
    if (!o.isMesh && !o.isLine && !o.isPoints) continue;
    meshes++; if (o.isInstancedMesh) { inst++; instances += o.count; }
    tris += triCount(o);
    const ms_ = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of ms_) { if (!m) continue; mats.add(m); matTypes[m.type] = (matTypes[m.type] || 0) + 1; if (m.type === 'MeshStandardMaterial' || m.type === 'MeshPhysicalMaterial' || m.type === 'MeshLambertMaterial' || m.type === 'MeshPhongMaterial') nonToon.add(m.type); }
    const g = o.geometry;
    if (g && g.attributes.position) {
      const a = g.attributes.position.array;
      for (let i = 0; i < a.length; i += 97) if (!Number.isFinite(a[i])) { nan++; break; }
      if (!o.isInstancedMesh && o.name !== 'wires') { if (!g.boundingBox) g.computeBoundingBox(); if (!g.boundingBox.isEmpty() && Number.isFinite(g.boundingBox.min.x)) { tb.copy(g.boundingBox).applyMatrix4(o.matrixWorld); box.union(tb); } }
    }
    if (!Number.isFinite(o.matrixWorld.elements[12]) || !Number.isFinite(o.matrixWorld.elements[13])) nan++;
  }
  // update loop
  let updErr = null;
  const upd = ctx._updates.slice(updBefore);
  try {
    let t = 0; const dt = 1 / 30;
    for (let i = 0; i < 900; i++) { ctx.time = t; ctx.shared.uTime.value = t; for (const f of upd) f(dt, t); t += dt; }
    for (const T of [60, 90, 120, 180, 300]) { ctx.time = T; for (const f of upd) f(0, T); }
  } catch (e) { updErr = e; failed = true; }
  const report = {
    module: name, ok: !err && !updErr, buildMs: ms,
    triangles: Math.round(tris), budget: BUDGET[name] || null, meshes, instancedMeshes: inst, instances,
    materials: mats.size, materialTypes: matTypes,
    canvasPixels: ctx.tex.pixels - texBefore, colliders: ctx.physics.count - colBefore, wires: ctx.wires.count - wiresBefore,
    updateFns: upd.length, services: Object.keys(ctx.services),
    bounds: box.isEmpty() ? null : { min: [box.min.x, box.min.y, box.min.z].map(v => +v.toFixed(1)), max: [box.max.x, box.max.y, box.max.z].map(v => +v.toFixed(1)) },
  };
  if (nan) warnings.push(`${name}: ${nan} object(s) with NaN/Infinity positions`);
  if (nonToon.size) warnings.push(`${name}: non-toon lit materials used (${[...nonToon].join(', ')}) — use ctx.mat.toon()/emissive()/glass()`);
  if (report.budget && tris > report.budget) warnings.push(`${name}: ${Math.round(tris)} triangles exceeds budget ${report.budget}`);
  if (report.canvasPixels > 24e6) warnings.push(`${name}: canvas textures use ${(report.canvasPixels / 1e6).toFixed(1)}M px (> 24M)`);
  console.log(JSON.stringify(report, null, 1));
  if (err) console.log(`BUILD ERROR in ${name}:\n${err.stack || err}`);
  if (updErr) console.log(`UPDATE ERROR in ${name}:\n${updErr.stack || updErr}`);
}
// batching sanity
try { const b = batchStatic(ctx.staticRoot, { mat: ctx.mat }); console.log('batch:', JSON.stringify(b)); } catch (e) { failed = true; console.log('BATCH ERROR:\n' + (e.stack || e)); }
try { if (ctx.wires.count) ctx.wires.build(); } catch (e) { failed = true; console.log('WIRES ERROR:\n' + (e.stack || e)); }
for (const w of warnings) console.log('WARNING:', w);
console.log(failed ? 'RESULT: FAIL' : 'RESULT: OK');
process.exit(failed ? 1 : 0);
