// [v3:harbor] DEV harness: builds a harbour test scene with the real Sakura core (src/anime/core, falling back to
// raw/ref/sakuragaoka-station/src/core — Kenton-GMI/sakuragaoka-station, MIT) and exposes __shot/__bench for
// dev/shoot.mjs. Query: ?scene=boats|quay|market|shrine|bridges|all &preset=day|golden|sunset|night &t=12 &fov=45 &shot=1
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PRESETS, applyPreset, makeWater, setWaterPreset, makeStars } from './env.js';

const params = new URLSearchParams(location.search);
const SHOT = params.has('shot');
window.__errors = [];
async function exists(p) { try { const r = await fetch(p, { method: 'HEAD' }); return r.ok; } catch { return false; } }

async function boot() {
  window.__stage = 'boot';
  globalThis.__KLC_DATA__ = '/data/anime/';   // core/sky.js imports layout.js (page-relative data otherwise)
  const CORE = (await exists('/src/anime/core/materials.js')) ? '/src/anime/core' : '/raw/ref/sakuragaoka-station/src/core';
  const [Mm, Tm, geo, Pm, Rm, Sm] = await Promise.all(['materials', 'textures', 'geo', 'physics', 'renderer', 'sky'].map((n) => import(`${CORE}/${n}.js`)));
  let L = null;
  if (params.get('layout') === 'real' && await exists('/src/anime/world/layout.js')) { try { L = await import('/src/anime/world/layout.js'); if (L.ready) await L.ready; } catch (e) { console.warn('layout.js failed, using fixture', e); L = null; } }
  if (!L) L = await import('../fixture.js');

  const W = SHOT ? Number(params.get('w') || 1600) : innerWidth, H = SHOT ? Number(params.get('h') || 900) : innerHeight;
  const canvas = document.getElementById('scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: SHOT });
  renderer.setPixelRatio(1); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping; renderer.info.autoReset = false;
  const quality = { name: params.get('q') || 'high', pixelRatio: 1, msaa: 4, shadowMap: 4096, shadowSize: Number(params.get('shadow') || 90), petals: 1 };
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(Number(params.get('fov') || 45), W / H, 0.2, 9000);
  const preset = params.get('preset') || 'golden';
  const sunDir = new THREE.Vector3(0.5, 0.3, 0.2).normalize();
  const sky = Sm.createSky(scene, sunDir, quality);
  sky.mesh.scale.setScalar(4);
  sky.sun.shadow.camera.far = 1200;
  const pipeline = Rm.createRenderPipeline(renderer, quality);

  // ---- context (mirror of core/ctx.js without the layout import)
  const staticRoot = new THREE.Group(); staticRoot.name = 'static'; const dynamicRoot = new THREE.Group(); dynamicRoot.name = 'dynamic';
  scene.add(staticRoot); scene.add(dynamicRoot);
  const updates = [];
  const shared = { uTime: { value: 0 }, uWind: { value: new THREE.Vector2(0.9, 0.35) }, uSunDir: { value: sunDir.clone() }, uGust: { value: 0.5 }, uNight: { value: 0 } };
  const mulberry32 = (seed) => {
    let a = (typeof seed === 'string' ? [...seed].reduce((h, c) => (Math.imul(h ^ c.charCodeAt(0), 16777619)) >>> 0, 2166136261) : seed) >>> 0;
    const r = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    r.range = (lo, hi) => lo + (hi - lo) * r(); r.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * r()); r.pick = (arr) => arr[Math.floor(r() * arr.length)]; r.chance = (p) => r() < p;
    return r;
  };
  const ctx = {
    THREE, scene, camera, renderer, audio: { loop() { return { setVolume() {}, setParam() {}, setPosition() {}, stop() {} }; }, play() {} }, quality,
    L, layout: L, mat: Mm.createMaterials(shared), tex: Tm.createTextures(), geo, wires: geo.createWireSystem(), physics: new Pm.Physics(L.heightAt || (() => 0)),
    palette: Mm.PALETTE, shared, sunDir, services: {}, staticRoot, dynamicRoot, LAYER_NO_OUTLINE: Mm.LAYER_NO_OUTLINE, time: 0,
    player: { position: new THREE.Vector3() },
    addStatic(o) { staticRoot.add(o); return o; },
    add(o) { o.traverse((c) => { c.userData.dynamic = true; }); dynamicRoot.add(o); return o; },
    onUpdate(fn) { updates.push(fn); },
    noOutline(o) { o.traverse((c) => c.layers.set(Mm.LAYER_NO_OUTLINE)); return o; },
    noBatch(o) { o.traverse((c) => { c.userData.noBatch = true; }); return o; },
    rng: mulberry32, kit: (p) => geo.makeKit(p), _updates: updates,
  };
  window.__ctx = ctx; window.THREE = THREE;

  const { leakDir } = applyPreset(preset, { scene, sky, ctx, pipeline });
  const water = makeWater(ctx, { y: L.SEA?.level ?? 0 });
  setWaterPreset(water, preset);
  if (PRESETS[preset]?.moon) scene.add(makeStars(ctx, mulberry32(7)));

  // fonts before canvases
  if (document.fonts?.load) {
    const faces = ['900 32px "Noto Serif JP"', '700 32px "Noto Sans JP"', '900 32px "Noto Sans JP"', '900 32px "Zen Maru Gothic"', '400 32px "Yuji Syuku"', '400 32px "Yusei Magic"'];
    await Promise.race([Promise.all(faces.map((f) => document.fonts.load(f, '第十八勝栄丸気仙沼魚市場大漁浮見堂五十鈴神社安波山').catch(() => null))), new Promise((r) => setTimeout(r, 6000))]);
  }

  window.__stage = 'fonts-done';
  const t0 = performance.now();
  const sceneName = params.get('scene') || 'boats';
  const scenes = await import('./scenes.js');
  const views = await scenes.build(sceneName, ctx);
  const tBuild = performance.now() - t0; window.__stage = 'built';
  // life's light registry turns registered lamps into glow sprites / pools (the real app does this in life/index.js)
  try { const LL = await import('../../life/lights.js'); const NL = LL.buildLights(ctx); ctx.onUpdate((dt, t) => NL.update(dt, t)); } catch (e) { console.warn('life lights unavailable', e); }
  const wm = ctx.wires.build(); if (wm) scene.add(wm);
  const Bm = await import(`${CORE}/batch2.js`);
  const batch = Bm.batchStatic(staticRoot, { mat: ctx.mat, nearCell: 60, farCell: 240, farR: 400 });
  function resize(w, h) {
    renderer.setSize(w, h, !SHOT); camera.aspect = w / h; camera.updateProjectionMatrix();
    pipeline.setSize(w, h, 1); ctx.wires.setResolution(pipeline.size.x, pipeline.size.y);
  }
  resize(W, H); window.__stage = 'batched';
  try { renderer.compile(scene, camera); } catch (e) { console.warn(e); }

  let tris = 0; staticRoot.traverse((o) => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
  window.__info = { core: CORE, layout: L.__fixture ? 'fixture' : 'layout.js', scene: sceneName, preset, buildMs: Math.round(tBuild), staticTris: Math.round(tris), wires: ctx.wires.count, batch: { merged: batch.merged, sources: batch.sources } };

  let simT = Number(params.get('t') || 12);
  const step = (t) => {
    ctx.time = t; shared.uTime.value = t;
    shared.uGust.value = 0.5 + 0.28 * Math.sin(t * 0.37) + 0.14 * Math.sin(t * 1.13 + 1.7);
    for (const fn of updates) { try { fn(1 / 60, t); } catch (e) { if (!fn.__e) { fn.__e = 1; console.error('update', e); } } }
  };
  const render = () => { sky.update(simT, camera); renderer.info.reset(); pipeline.render(scene, camera, leakDir, simT); };
  function setCam(v) {
    if (v.length >= 6) { camera.position.set(v[0], v[1], v[2]); camera.lookAt(v[3], v[4], v[5]); }
    else { camera.position.set(v[0], v[1], v[2]); camera.rotation.set(THREE.MathUtils.degToRad(v[4] || 0), THREE.MathUtils.degToRad(v[3] || 0), 0, 'YXZ'); }
    camera.updateMatrixWorld();
  }
  window.__shot = (v) => { setCam(v); step(simT); render(); render(); return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles }; };
  window.__bench = (n = 30) => {
    const gl = renderer.getContext(); const px = new Uint8Array(4);
    render(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const t = performance.now(); for (let i = 0; i < n; i++) render(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return { ms: +((performance.now() - t) / n).toFixed(2), calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
  };
  setCam(views?.[0] || [80, 20, 80, 0, 2, 0]);
  if (SHOT) { window.__stage = 'render'; document.body.classList.add('shot'); step(simT); render(); let n = 0; const w = () => { render(); if (++n > 4) window.__ready = true; else requestAnimationFrame(w); }; requestAnimationFrame(w); return; }
  const controls = new OrbitControls(camera, canvas);
  const v0 = views?.[0]; if (v0 && v0.length >= 6) controls.target.set(v0[3], v0[4], v0[5]);
  let last = performance.now();
  addEventListener('resize', () => resize(innerWidth, innerHeight));
  addEventListener('keydown', (e) => { const i = Number(e.key) - 1; if (views?.[i]) { setCam(views[i]); if (views[i].length >= 6) controls.target.set(views[i][3], views[i][4], views[i][5]); } });
  const loop = (now) => { requestAnimationFrame(loop); simT += Math.min(0.1, (now - last) / 1000); last = now; controls.update(); step(simT); render(); };
  requestAnimationFrame(loop);
}
boot().catch((e) => { console.error(e); window.__fatal = String(e && e.stack || e); });
