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
import { createTouchpad } from './ui/touchpad.js';   // [v7:pad] floating stick, look, context buttons
import { installHeldR, HELD_R } from './ui/holdkey.js';   // [r-hold] R resets the camera only after a hold
import { batchStatic } from './core/batch.js';
import { batchStatic as batchStatic2, ATLAS } from './core/batch2.js';
import { createAudio } from './core/audio.js';
import { createPlanet } from './core/planet.js';   // [v3:integrate] tiny-planet overview
import { TIER, PHONE } from './core/tier.js';   // [v4:phone]
import { mergeCells } from './core/phonecells.js';   // [v4:phone]
import { areaBase } from './world/explore/search.js';   // [sys:22] the toast's 町名 without its 丁目
import { queryToPose, poseToCamArgs } from './core/pose.js';   // [contrib] ?cam=x,y,z,heading,pitch,fov: the exact view of a report
import { mount as mountSwim } from './play/underwater/index.js';   // [play:underwater]
import { capturePose } from './core/pose.js';   // [ui-c] the pose a lost WebGL context saves before the reload (a second import line: test/contrib-pose.test.js pins the first)
import { createLossGuard, createLostCard, sessionStore, takeResume, resumeView, placeCamera, resumeClock, resumeSeason } from './core/survive.js';   // [ui-c] iPhone survival: a lost WebGL context -> a reload card, a reload, the visitor's pose back
import { fovFor } from './core/fov.js';   // [ui-c2] the one field-of-view function: the screen (resize() below) and photo mode (ui/photo.js, through ctx.fovFor) both use it
import { afterPaint } from './core/paint.js';   // [ui-c2] a label is on the glass before the long task that follows it
import { loadPlan } from './core/loadplan.js';
import { FADE } from './world/explore/sbatch.js';   // [mobile-perf] ?fade=0 below   // [ui-c2] the loading plan: a weight and a Japanese label for every stage of build()
import { createLoadBar } from './core/loadbar.js';   // [ui-c2] the intro card's bar, its creeping layer and its label
import { posterForQuery, POSTER_HOURS } from './ui/loader/sky.js';   // [title] the still behind the title (the world behind it is the real hour)
import { jstNow } from './world/life/clock.js';
import { createPerf, updateLabel } from './core/perf.js';   // [perf] ?perf=1: the frame profiler (tools/perf/run.mjs)
import { createClock, createPacer } from './core/timestep.js';   // [smooth] the fixed-step clock and the frame pacer
import { createGpuTimer } from './core/gputimer.js';   // [smooth] the frame's GPU time (dynamic resolution, ?perf=1)
import { bootStart, bootOk, bootLeft, liteLevel, liteOverrides, liteNote } from './core/bootguard.js';   // [mobile-perf] the crash-loop guard
import { createDynRes, readHeld, writeHeld } from './core/dynres.js';   // [smooth] dynamic resolution; [mobile-perf] the scale this device held last time
import { splitTwoSided } from './core/twosided.js';   // [smooth] transparent double-sided meshes without the per-draw program check
import { mountPlay } from './play/index.js';
import { welcomePose } from './play/missions/arrive.js';
import { mountIppon } from './play/ippon/index.js';   // [integration] static too: a module that is both imported and import()ed trips Bun 1.3.14's splitter ("Could not resolve")   // [play] static: a dynamic import('./play/…') is left as a browser fetch under splitting (404 /play/index.js)

/** Build order. A module may read ctx.services of earlier modules at build time (life reads everyone). */
export const MODULES = ['environment', 'water', 'town', 'harbor', 'landmarks', 'life', 'ship', 'explore'];   // [ship:integrate] 第一昭福丸 after life (its crowd) and before explore (its places entry)   // [v4:explore] streamed core, drive mode, map, search, labels, interiors; [v4:landmarks-B] civic landmarks after harbor
/** [v3:integrate] static batching cells (m): near the hero zone, beyond it, and the hero half-size. */
export const BATCH = { nearCell: 400, farCell: 2000, farR: 600 };   // measured vs 48/200: -35 % draw calls, market 25 -> 13 ms, hero 18 -> 16 ms (1080p, gate-throttled); [v3:fix] 300/1000/400 -> 400/2000/600: -10..-16 % calls again (city 1203 -> 1060, drone 837 -> 699)

const params = new URLSearchParams(location.search);
const SHOT = params.has('shot');
const ONLY = params.get('only') ? params.get('only').split(',').map((s) => s.trim()).filter(Boolean) : null;
const $ = (id) => document.getElementById(id);

// [v4:phone] tiers live in core/tier.js: a phone or tablet is forced to the phone tier (stored setting and ?q= cannot
// raise it; ?unsafe=1 for testing), and nothing upgrades it automatically
const qName = TIER.tier;
// [mobile-perf] The crash-loop guard (core/bootguard.js): iOS reloads a tab its memory killer stopped, and a second kill is "A problem repeatedly
// occurred". A phone whose last load died less than 5 minutes ago (localStorage survives the kill) boots lighter: level 1, then 2. ?lite=0|1|2
// pins it. Applied here, before the renderer, the context and any module read the phone's settings. Never on desktop, never in shot mode.
const bootStore = (() => { try { return localStorage; } catch (e) { return null; } })();
const LITE = (() => {
  const phoneTier = qName === 'phone' && !SHOT;
  const n = phoneTier ? bootStart(bootStore).n : 0;
  const level = SHOT ? 0 : liteLevel({ phone: phoneTier, param: params.get('lite'), n });
  const o = liteOverrides(level);
  if (o) {
    Object.assign(PHONE, o.phone, { streamRadii: o.stream });
    Object.assign(TIER.quality, o.quality, { heroR: PHONE.heroR });
    if (o.quality.pixelRatio) TIER.quality.pixelRatio = Math.min(devicePixelRatio || 1, o.quality.pixelRatio);
  }
  if (phoneTier) addEventListener('pagehide', () => bootLeft(bootStore));   // leaving or reloading during the load is not a crash
  return { level, n, phoneTier, o };
})();
window.__lite = LITE;
const quality = { ...TIER.quality };
// [mobile-perf] The street-detail fades (world/explore/sbatch.js) put a discard in every stream pool's program, and a fragment shader that can
// discard keeps an Apple GPU's hidden-surface removal from rejecting its fragments before they are shaded: in a street, where the kit's
// buildings stand behind each other, that is shading for every layer. A phone has no frame time to spare for a 0.35 s nicety, so it pops
// as before deploy #7 (?fade=1 forces the fades on, ?fade=0 off anywhere).
FADE.on = params.get('fade') === '1' || (params.get('fade') !== '0' && !quality.phone);
if (quality.phone) { ATLAS.page = PHONE.atlasPage; ATLAS.tileMax = PHONE.canvasMax; ATLAS.trim = PHONE.atlasTrim && params.get('atlas') !== 'square'; ATLAS.quantum = PHONE.atlasQuantum; ATLAS.release = params.get('release') !== '0'; ATLAS.density = params.has('density') ? Number(params.get('density')) : PHONE.atlasDensity; }   // [v6:phone-budget] ?atlas=square: the old square pages (A/B)
if (SHOT) quality.pixelRatio = 1;

// ------------------------------------------------------------------ renderer & scene
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: SHOT });
// [mobile-perf] The canvas is the composite's output. On a phone it is up to 2 device px per CSS px: at 1 the compositor stretched a 390 px
// picture across a 1170 px screen, so the town rendered at 1.25x was first squeezed to 1x and then blown up 3x (the "brutal" look). The scene's
// targets keep the tier's pixel ratio (x dynamic resolution) and the composite scales them up. ?cdpr= pins it (1 = the old canvas).
const CANVAS_PR = SHOT ? 1 : Number(params.get('cdpr')) > 0 ? Math.min(3, Number(params.get('cdpr'))) : quality.phone ? Math.min(devicePixelRatio || 1, LITE.o ? LITE.o.canvasPR : 2) : 1;
renderer.setPixelRatio(CANVAS_PR);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;   // [v3:fix] the soft PCF variant is deprecated in r18x (console warning)
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.info.autoReset = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(Number(params.get('fov') || 55), innerWidth / innerHeight, 0.1, 30000);
let fovPin = params.get('fov') ? Number(params.get('fov')) : null;   // [contrib] ?fov= and the fov of a ?cam=x,y,z,heading,pitch,fov link pin the vertical field of view (resize() no longer picks one)
const PRESET_HOURS = { asa: 6.5, hiru: 12, yugata: 16.5, yuyake: 17 + 20 / 60, yoru: 19.5, photo: 17 + 20 / 60 };
const LOOK_PIN = { photo: 17 + 20 / 60, sunny: 16.5, dawn: 6.88 };
const pinnedPreset = params.get('look') === 'photo' ? 'photo' : params.get('preset');
const lookId = params.get('look') || (params.get('preset') === 'photo' ? 'photo' : null);
// Live JST when nothing pins the clock. ?hours, ?preset and ?look stay pinned. A shot with no hour keeps the poster slot.
const shotPin = SHOT && params.get('live') !== '1';
const START_HOURS = params.has('hours') ? Number(params.get('hours'))
  : (lookId && LOOK_PIN[lookId] != null ? LOOK_PIN[lookId]
    : (pinnedPreset && PRESET_HOURS[pinnedPreset] != null ? PRESET_HOURS[pinnedPreset]
      : (shotPin ? POSTER_HOURS[posterForQuery(params)] : jstNow().hours)));
const sunDir = new THREE.Vector3(...L.sunDirAt(START_HOURS)).normalize();
const sky = createSky(scene, sunDir, quality);
const pipeline = createRenderPipeline(renderer, quality, { edgeTex: !SHOT && CANVAS_PR > 1 && params.get('edgetex') !== '0', fxaa: !SHOT && quality.phone && params.get('fxaa') === '1' });   // [mobile-perf] FXAA measured softer than without (the hull's 気仙沼 blurred): off unless ?fxaa=1   // [mobile-perf] a canvas finer than the scene: outlines from their own pass (?edgetex=0: off)
const audio = createAudio({ noteRate: quality.phone ? 32000 : 0 });   // [mobile-perf] the phone's note buffers at 32 kHz (core/audio.js buf)
const ctx = createContext({ scene, camera, renderer, audio, quality, sunDir });
ctx.sky = sky; ctx.pipeline = pipeline;
// [perf] ?perf=1: per-frame CPU split, GPU time, calls (core/perf.js); off, every hook below is a no-op. While a module builds, its updates are tagged with its name.
const gpuTimer = params.get('gputimer') === '0' ? null : createGpuTimer(renderer.getContext());   // [smooth] null without EXT_disjoint_timer_query_webgl2 (Safari); ?gputimer=0 frees the query for tools/perf/passes.page.js
const perf = createPerf({ on: params.get('perf') === '1', gpuTimer: !!gpuTimer });
window.__perf = perf.api;
if (perf.on) for (const k of ['onUpdate', 'onStep']) { const add = ctx[k]; ctx[k] = (fn) => { if (typeof fn === 'function') fn.__mod = ctx.__mod || 'main'; return add(fn); }; }
// [ui-c2] The vertical field of view of a frame with this aspect: the pinned one (?fov=, a ?cam= link) or the screen's rule (core/fov.js). resize() uses it for the screen and ui/photo.js for the
// picture, so a photo frames what the screen shows (the portrait 88 degrees used to be rendered into a 16:9 frame: a picture about 120 degrees across).
ctx.fovFor = (aspect) => fovPin ?? fovFor(aspect);
const planet = createPlanet({ renderer, pipeline, scene, camera, sky, quality, sunDir });   // [v3:integrate]
ctx.planet = planet;
sky.attach(ctx);
sky.setHours(START_HOURS);
if (params.has('cloud')) sky.uniforms.uCloud.value = Number(params.get('cloud'));   // cloud coverage 0..1 (life's weather overrides)
window.__ctx = ctx; window.THREE = THREE; window.__L = L;
window.__features = (area) => ctx.features.dump(area);   // [v6:survey] tools/anime/survey-diff.mjs
window.__featureDims = (area) => ctx.features.dims(area);
// [ui-c] ?dbg=1: the phone diagnostics strip (ui/dbg.js, mobile review T0): iOS and Safari versions, innerHeight vs visualViewport vs 100svh, safe areas,
// audio state, time to ready. A dynamic import behind the flag: without it nothing is requested, parsed or run (and never in a shot frame).
if (!SHOT && params.get('dbg') === '1') import('./ui/dbg.js').then((m) => m.mountDbg(ctx)).catch((e) => console.warn('dbg strip', e));
// [ui-c] iPhone survival (core/survive.js, mobile F10): the phone can take the WebGL context away (memory pressure, a long stay in the background). The phone tier
// frees the static batches' CPU arrays once they are on the GPU (releaseOnUpload), so nothing can be re-uploaded: a restored context stays a flat pale blue and the
// frame loop throws on every frame. So a card says 再読み込みします, the frame loop draws nothing, the pose is saved, and the page reloads when the context returns.
const survive = SHOT ? null : createLossGuard({ canvas, doc: document, store: sessionStore(), reload: () => location.reload(), capture: () => capturePose(ctx), ui: createLostCard(document, () => survive.tap()) });
window.__survive = survive;
const resume = takeResume({ store: sessionStore() });   // what a context-loss reload saved (the pose, the time of day, the season): read and removed once per load, applied after the build

// [smooth] Dynamic resolution (core/dynres.js): the render targets at the tier's pixel ratio times a scale of 0.6 to 1.0 that keeps the GPU
// inside the 16.7 ms frame. Never in shot mode (and photo mode renders its own frame at full size, ui/photo.js). ?dr=0: off (always 1);
// ?dr=0.7: pinned at 0.7. The canvas itself keeps its size: the composite pass scales the picture up.
const drParam = params.get('dr');
const DR_ON = !SHOT && drParam !== '0' && !(Number(drParam) > 0);
// [mobile-perf] It starts at the scale this device held last time (per tier), settles behind the title (fast steps, the load's leftover frames
// not judged) and hands the scale it found to the normal controller when the visitor is in (start()): the first playable frame is the
// settled one, not a fall to the floor and a slow climb back.
const drStore = (() => { try { return localStorage; } catch (e) { return null; } })(), drKey = 'klc.dr.' + qName;
const drMax = quality.phone && params.get('drmax') !== '1' ? (LITE.o ? LITE.o.drMax : PHONE.drMax) : 1;   // [mobile-perf] a phone may render finer than its tier's ratio when its GPU has room (?drmax=1: not above 1)
// [mobile-perf] a phone's adaptive floor (core/dynres.js softMin): it starts at its tier's ratio (1.5x) and holds it down to 30 fps; only a sustained slow
// stretch (a 2 s median over 38 ms) takes it lower, a step at a time, to the second floor (1.275x), and it comes back up at 33 ms. A lite boot keeps the old 0.6.
const phoneDr = quality.phone && !LITE.o;
const drMin = phoneDr ? PHONE.drFloor : quality.phone ? LITE.o.drMin : 0.6, drStep = phoneDr ? PHONE.drStep : 0.1;
const dr = createDynRes({ budgetMs: 1000 / 60, min: drMin, max: drMax, step: drStep, ...(phoneDr ? { softMin: PHONE.drMin, slowMs: 38, okMs: 33, span: 2000 } : {}),
  start: (DR_ON ? readHeld(drStore, drKey, { min: drMin, max: drMax }) : null) ?? 1 });
if (!SHOT && Number(drParam) > 0) dr.set(Number(drParam));
const holdScale = () => { if (DR_ON && !dr.settling) writeHeld(drStore, dr.scale, drKey); };
addEventListener('pagehide', holdScale);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') holdScale(); });
window.__dr = dr;
const renderScale = () => (SHOT || drParam === '0' ? 1 : dr.scale);
let viewW = 0, viewH = 0;
function applyScale() {
  pipeline.setSize(viewW, viewH, quality.pixelRatio * renderScale());
  ctx.wires.setResolution(pipeline.size.x, pipeline.size.y);
}
function resize() {
  const w = SHOT ? Number(params.get('w') || 1280) : innerWidth, h = SHOT ? Number(params.get('h') || 720) : innerHeight;
  renderer.setSize(w, h, !SHOT);
  camera.aspect = w / h;
  // [v3:polish3] portrait screens keep a ~64 deg horizontal view (a fixed 55 deg vertical FOV left a phone only ~28 deg
  // across: the town a thin strip over empty bay); ?fov= still pins it for the shot tools
  camera.fov = ctx.fovFor(camera.aspect);   // [ui-c2] = fovPin ?? fovFor(aspect): core/fov.js, the rule that used to be written out here (the same arithmetic)
  camera.updateProjectionMatrix();
  viewW = w; viewH = h;
  applyScale();
}
addEventListener('resize', resize);
resize();

// ------------------------------------------------------------------ fonts
async function loadFonts() {
  if (!document.fonts || !document.fonts.load) return;
  await Promise.race([window.__klcFonts || 0, new Promise((r) => setTimeout(r, 5000))]);   // [loader] index.html's font stylesheet no longer blocks the first paint: its @font-face rules are in before any label is drawn (the loader waits at most 5 s)
  const faces = ['700 32px "Noto Sans JP"', '400 32px "Noto Sans JP"', '900 32px "Noto Sans JP"', '700 32px "Noto Serif JP"',
    '700 32px "Zen Maru Gothic"', '400 32px "Yusei Magic"', '400 32px "Yuji Syuku"'];
  const jp = '気仙沼けせんぬまKesennuma鮮魚乾物喫茶酒店魚市場浮見堂五十鈴神社止まれ';
  await Promise.race([Promise.all(faces.map((f) => document.fonts.load(f, jp).catch(() => null))), new Promise((r) => setTimeout(r, 6000))]);
}

// ------------------------------------------------------------------ build
const errors = []; window.__errors = errors;
const stats = { modules: {} }; window.__stats = stats;
// [ui-c2] The intro card's bar and label (core/loadbar.js): the plan (core/loadplan.js) gives every stage of build() a weight and a label; `creep` = { to, ms } moves a tinted layer ahead of
// the bar on the compositor while a long step blocks the main thread. __loadLog is the page's own record of what it said and when (the gated check reads it).
const loadBar = createLoadBar(); window.__loadLog = loadBar.log; window.__loadBar = loadBar;   // [title] the gauge reads position() on the real clock
const setProgress = loadBar.set;

/** [v4:phone] Triangles in the scene (instanced meshes times their count) and the JS heap (Chrome only; else null). */
function sceneTris() {
  let n = 0;
  scene.traverse((o) => { const g = o.geometry; if (!o.isMesh || !g?.attributes?.position) return; n += (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); });
  return Math.round(n);
}
const heapMB = () => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null);

/** [v4:phone] The merged static batches are never read again on the CPU (no raycasts; bounds are computed): once a
 *  buffer is on the GPU its typed array is dropped, so the phone does not hold the geometry twice. -> attributes */
const drop = function () { if (!this.array) return; this.__gpuBytes = this.array.byteLength; this.array = null; };   // [mobile-perf] the size it had, for the census (tools/anime/phone-census.js)
/** [mobile-perf] Drop a geometry's CPU arrays once they are on the GPU (bounds first: they are computed from the arrays). */
function releaseGeometry(g) {
  if (!g.boundingSphere) g.computeBoundingSphere();
  if (!g.boundingBox) g.computeBoundingBox();
  for (const k in g.attributes) g.attributes[k].onUpload(drop);
  if (g.index) g.index.onUpload(drop);
}
/** [mobile-perf] Put a mesh's buffers on the GPU now: one draw into a 1x1 target with the outline pre-pass material, whose program is the
 *  one the pre-pass already uses for the static cells (no new program). The phone's cells go up one at a time while they are built
 *  (core/phonecells.js), so their arrays never all live at once. -> { upload(mesh), dispose() } */
function makeUploader() {
  const rt = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false, type: THREE.HalfFloatType });
  const sc = new THREE.Scene(); sc.overrideMaterial = pipeline.ndMat; sc.matrixWorldAutoUpdate = false;
  function upload(mesh) {
    const parent = mesh.parent, at = parent ? parent.children.indexOf(mesh) : -1, fc = mesh.frustumCulled, prev = renderer.getRenderTarget(), auto = renderer.shadowMap.autoUpdate;
    sc.add(mesh); mesh.frustumCulled = false; renderer.shadowMap.autoUpdate = false;
    try { renderer.setRenderTarget(rt); renderer.render(sc, camera); }
    finally {
      renderer.setRenderTarget(prev); renderer.shadowMap.autoUpdate = auto; mesh.frustumCulled = fc; sc.remove(mesh);
      if (parent) { parent.add(mesh); if (at >= 0 && at < parent.children.length - 1) { parent.children.pop(); parent.children.splice(at, 0, mesh); } }
    }
  }
  return { upload, dispose: () => rt.dispose() };
}

/** [mobile-perf] After the static batch, the canvas textures cache (ctx.tex) still holds every sign, poster and label it ever drew, though
 *  the batch copied most of them into its atlas pages and dropped their meshes. A cached texture no material in the scene uses is let go
 *  of (anyone still holding it keeps it; a later request draws it again), so its canvas can be collected: a WebKit tab pays for every
 *  canvas backing store. -> { evicted, mpx } */
function evictUnusedTextures(cache, root, { dispose = false } = {}) {   // [mobile-perf] dispose: free the GPU copies too (the session sweep)
  if (!cache || !cache.size) return { evicted: 0, mpx: 0 };
  const used = new Set();
  const add = (v) => { if (v && v.isTexture) used.add(v); };
  root.traverse((o) => {
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of ms) { for (const k in m) add(m[k]); if (m.uniforms) for (const k in m.uniforms) add(m.uniforms[k]?.value); const pu = renderer.properties.get(m)?.uniforms; if (pu) for (const k in pu) add(pu[k]?.value); }
  });
  let evicted = 0, px = 0;
  for (const [k, t] of cache) if (t?.isTexture && !used.has(t)) { cache.delete(k); evicted++; px += (t.image?.width || 0) * (t.image?.height || 0); if (dispose) t.dispose(); }
  return { evicted, mpx: Math.round(px / 1e5) / 10 };
}
/** [mobile-perf] The phone's session sweep, every 20 s while the town is on screen: the cached textures and materials no object in the scene uses
 *  any more (tiles that streamed out, a mode that was left) are let go of, and those textures' GPU copies freed (a texture used again is uploaded
 *  again from its canvas, which it keeps). Without it a 3-minute session grew the phone's GPU textures by 16 %. */
function startSweeper(everyMs = 20000) {
  // [mobile-perf] Beyond the caches: every texture the scene has used is remembered (weakly); one no material in the scene uses at the next sweep
  // loses its GPU copy (three uploads it again from its image if it comes back). The townspeople and the play modes make textures of their own
  // (a 512 px canvas each): a session grew the GPU textures by 20 of them. Not a texture whose image was freed after its upload (userData.freed:
  // the atlas pages, the water grids), which could not come back.
  const seen = new Set();
  const sweep = () => {
    if (document.hidden || planet.active || ctx.shooting) return;
    try {
      const t = evictUnusedTextures(ctx.tex?.cache, scene, { dispose: true }), m = evictUnusedMaterials(ctx.mat?.cache, scene);
      const used = sceneTextures(scene);
      for (const x of used) if (!x.userData.klcSeen) { x.userData.klcSeen = true; seen.add(new WeakRef(x)); }
      let gone = 0;
      for (const w of seen) {
        const x = w.deref();
        if (!x) { seen.delete(w); continue; }
        if (used.has(x) || x.userData.freed || x.isRenderTargetTexture) continue;
        x.dispose(); x.userData.klcSeen = false; seen.delete(w); gone++;
      }
      const S = (stats.sweep ||= { runs: 0, textures: 0, materials: 0, gpu: 0 }); S.runs++; S.textures += t.evicted; S.materials += m; S.gpu += gone;
    } catch (e) { console.warn('sweep', e); }
  };
  return setInterval(sweep, everyMs);
}
/** [mobile-perf] Every texture the scene's materials use (their properties, their uniforms and the program uniforms three keeps for them). */
function sceneTextures(root) {
  const used = new Set();
  const add = (v) => { if (v && v.isTexture) used.add(v); };
  root.traverse((o) => {
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of ms) { for (const k in m) add(m[k]); if (m.uniforms) for (const k in m.uniforms) add(m.uniforms[k]?.value); const pu = renderer.properties.get(m)?.uniforms; if (pu) for (const k in pu) add(pu[k]?.value); }
    if (o.isBatchedMesh) { add(o._matricesTexture); add(o._indirectTexture); add(o._colorsTexture); }
  });
  return used;
}
/** [mobile-perf] The same for the materials cache (ctx.mat): the batch folded most per-colour materials into shared ones and dropped their meshes,
 *  but the cache kept every one (and whatever three hung on them). A material no object in the scene uses is let go of; a later request makes
 *  an identical one (the program is shared by its parameters). -> materials evicted */
function evictUnusedMaterials(cache, root) {
  if (!cache || !cache.size) return 0;
  const used = new Set();
  root.traverse((o) => { if (Array.isArray(o.material)) for (const m of o.material) used.add(m); else if (o.material) used.add(o.material); if (o.customDepthMaterial) used.add(o.customDepthMaterial); });
  let n = 0;
  for (const [k, m] of cache) if (m?.isMaterial && !used.has(m)) { cache.delete(k); n++; }
  return n;
}

function releaseOnUpload(root) {
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh || !['static-batched', 'static-cells'].includes(o.parent?.name) || !o.geometry) return;
    const g = o.geometry;
    if (!g.boundingSphere) g.computeBoundingSphere();
    if (!g.boundingBox) g.computeBoundingBox();
    for (const k in g.attributes) { g.attributes[k].onUpload(drop); n++; }
    if (g.index) { g.index.onUpload(drop); n++; }
  });
  return n;
}

/** [v4:phone] Before the static batch: the walk-in interiors are batched on their own and drawn only within 220 m
 *  (they are inside buildings; ~80 k triangles a pass from anywhere else), and the far town casts no shadow. */
function phonePrep() {
  const out = {};
  const interiors = ctx.staticRoot.children.find((c) => c.name === 'explore-interiors');
  if (interiors) {
    interiors.updateMatrixWorld(true);
    const box = new THREE.Box3(), centres = [];
    for (const c of interiors.children) { box.setFromObject(c); if (!box.isEmpty()) centres.push(box.getCenter(new THREE.Vector3())); }
    try { out.interiors = batchStatic2(interiors, { mat: ctx.mat, nearCell: 4000, farCell: 4000, farR: 1e9 }).merged; } catch (e) { console.warn(e); }
    interiors.userData.noBatch = true;
    const R2 = 220 * 220;
    ctx.onUpdate(() => { const p = camera.position; interiors.visible = centres.some((c) => (c.x - p.x) ** 2 + (c.z - p.z) ** 2 < R2); });
  }
  ctx.dynamicRoot.traverse((o) => { if (o.name === 'town-far') o.traverse((m) => { m.castShadow = false; }); });
  // parked bicycles (~1.6 k triangles each): the first PHONE.bikes
  const bikes = []; ctx.staticRoot.traverse((o) => { if (o.name === 'bicycle') bikes.push(...o.children); });
  for (const o of bikes.slice(PHONE.bikes)) o.parent.remove(o);
  out.bikes = Math.min(bikes.length, PHONE.bikes);
  // small static meshes (cans behind vending-machine glass, quay bolts, clutter): < PHONE.tinyR m across
  ctx.staticRoot.updateMatrixWorld(true);
  const tiny = [];
  // only street clutter: a landmark's small parts (浮見堂's gold finial, railing caps) stay
  const CLUTTER = /^(town-props|town-streets|quay:)/;
  for (const top of ctx.staticRoot.children) if (CLUTTER.test(top.name)) top.traverse((o) => {
    const g = o.geometry; if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !g?.attributes?.position || o.userData.dynamic) return;
    if (!g.boundingSphere) g.computeBoundingSphere();
    if (g.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis() < PHONE.tinyR) tiny.push(o);
  });
  let tris = 0;
  for (const o of tiny) { const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; o.parent.remove(o); }
  out.tiny = { meshes: tiny.length, tris: Math.round(tris) };
  return out;
}

/** [v4:phone] An idle slot (up to 250 ms): the GC runs in idle time, and a phone tab must not carry one module's
 *  build garbage into the next (the heap grew to ~0.9 GB over the build on the old low tier). */
const idle = () => new Promise((r) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(() => setTimeout(r, 30), { timeout: 250 }) : setTimeout(r, 120)));

async function build() {
  stats.heapLayoutMB = heapMB();   // [v4:phone] after layout.js parsed its data
  stats.bootMs = Math.round(performance.now()); stats.finish = {};   // [ui-c2] the page's own clock when build() starts: the page, the bundle and the data files came first
  const known = Object.keys(MODULE_LOADERS);
  const list = ONLY ? ONLY.filter((m) => known.includes(m)) : MODULES.filter((m) => known.includes(m));
  if (ONLY) for (const m of ONLY) if (!known.includes(m)) errors.push({ module: m, message: 'no such module (src/anime/world/' + m + '.js)' });
  ctx.plan = { modules: list, explore: list.includes('explore') && params.get('stream') !== '0' };   // [v4:explore] town leaves the mid-zone lots to explore's tiles
  // [ui-c2] The plan: a weight and a Japanese label for every stage, so the bar reaches the finishing steps when most of the time is spent (it sat at 89 % for 35 of 63 s: the finishing
  // work was one step) and each step says what it is doing. begin() puts the label on the glass BEFORE the stage's long task starts; finished() re-reads this device's speed so the creep
  // (setProgress) knows how long a stage should take.
  const plan = loadPlan(list, { phone: !!quality.phone });
  const tStart = performance.now(); let doneWeight = 0, msPerWeight = 100;   // (the weights are in units of 100 ms of a measured run: that is the first guess, the stages that finish replace it)
  async function begin(key) {
    setProgress(plan.start(key), plan.label(key), { to: plan.start(key) + plan.span(key) * 0.97, ms: plan.weight(key) * msPerWeight });
    await afterPaint(60);
    return performance.now();
  }
  function finished(key, t) {
    stats.finish[key] = Math.round(performance.now() - t);
    doneWeight += plan.weight(key); msPerWeight = Math.max(50, (performance.now() - tStart) / doneWeight);
  }
  let t = await begin('fonts');
  await loadFonts(); finished('fonts', t);
  for (const name of list) {
    t = await begin(name);
    if (quality.phone) await idle();   // [v4:phone] let the engine collect the previous module's build garbage
    const t0 = performance.now();
    try {
      const mod = await MODULE_LOADERS[name]();
      const before = ctx.staticRoot.children.length + ctx.dynamicRoot.children.length;
      if (typeof mod.build !== 'function') throw new Error('module has no build(ctx) export');
      const tris0 = sceneTris();
      ctx.__mod = name;   // [perf] the label of the updates this module registers
      await mod.build(ctx);
      ctx.__mod = null;
      // [v4:phone] triangles (instances counted) and the JS heap after each module: the phone budgets
      stats.modules[name] = { ms: Math.round(performance.now() - t0), objects: ctx.staticRoot.children.length + ctx.dynamicRoot.children.length - before, tris: sceneTris() - tris0, heapMB: heapMB() };
    } catch (e) {
      console.error(`[module ${name}]`, e);
      errors.push({ module: name, message: String((e && e.stack) || e) });
    }
    finished(name, t);
  }
  // [play:ippon] 第五凪丸 after the world, before the wires. Not a load-plan stage: the bar stays on the modules above.
  try {
    ctx.__mod = 'ippon';
    mountIppon(ctx);
    ctx.__mod = null;
  } catch (e) {
    console.error('[ippon]', e);
    errors.push({ module: 'ippon', message: String((e && e.stack) || e) });
  }
  // the finishing work, one labelled step at a time (it was one step with one label): wires, the phone's slimming, the static batch, every shader program, the tiny planet's fold pass
  t = await begin('wires');
  if (quality.phone) { await idle(); stats.heapBuiltMB = heapMB(); }
  const wm = ctx.wires.build(); if (wm) { scene.add(wm); ctx.wires.setResolution(pipeline.size.x, pipeline.size.y); }
  finished('wires', t);
  // [v3:integrate] batching cells sized for a 3 km town (Sakura's 48 m / 200 m cells were for one station square):
  // the renderer is CPU-bound on draw calls, so coarse cells win; ?cells=near,far,farR overrides (tuning)
  const cp = (params.get('cells') || '').split(',').map(Number);
  const cells = { nearCell: cp[0] || BATCH.nearCell, farCell: cp[1] || BATCH.farCell, farR: cp[2] || BATCH.farR, center: [L.ZONES.hero.cx, L.ZONES.hero.cz] };
  let prepMs = 0;
  if (quality.phone) { t = await begin('prep'); const t0 = performance.now(); stats.phone = phonePrep(); prepMs = performance.now() - t0; finished('prep', t); }
  t = await begin('batch');
  const t0 = performance.now();
  // [mobile-perf] the phone: the merged cells are written straight from their sources (core/phonecells.js buildCells), cell by cell, and each
  // goes to the GPU at once and drops its arrays: the load never holds the static town twice. ?direct=0: batch2's merges, then their cells
  // (each staged the same way); ?stage=0: every cell at the first frame.
  const up = quality.phone && params.get('stage') !== '0' ? makeUploader() : null;
  const direct = quality.phone && params.get('direct') !== '0' ? { cell: cells.nearCell, upload: up?.upload, release: up ? releaseGeometry : null } : null;
  const b = params.get('nobatch') === '1' ? {} : params.get('batch') === '1' ? batchStatic(ctx.staticRoot) : batchStatic2(ctx.staticRoot, { mat: ctx.mat, ...cells, direct });   // [v4:phone] nobatch: diagnostics (triangles per named group)
  const { proxies: directPx = null, ...batchStats } = b;
  stats.batch = { ...batchStats, ms: Math.round(prepMs + performance.now() - t0) };   // (the phone's slimming and the batch, as before)
  // [smooth] transparent double-sided meshes as two fixed passes (core/twosided.js): three.js's own two-pass draw rebuilt their program
  // parameters twice per draw, every frame. Before the phone's buffer release below. ?twosided=0: off.
  if (params.get('twosided') !== '0') stats.twoSided = splitTwoSided(scene);
  if (quality.phone) {
    // [v4:phone] one pre-pass call and one or two shadow calls per cell (core/phonecells.js); the far town and the city /
    // horizon terrain lie beyond the phone's outline range, so the pre-pass skips them too
    const sbg = ctx.staticRoot.children.find((c) => c.name === 'static-batched');
    const px = directPx || (sbg && mergeCells(ctx.staticRoot, sbg, { cell: cells.nearCell, upload: up?.upload, release: releaseGeometry }));   // [mobile-perf] (?direct=0: from batch2's merges)
    up?.dispose();
    if (px) {
      const ndHide = []; scene.traverse((o) => { if (o.name === 'town-far' || o.name === 'terrain-city' || o.name === 'terrain-horizon') ndHide.push(o); });
      pipeline.setProxies({ ...px, ndHide });
      stats.batch.cells = px.stats;
    }
    stats.batch.released = releaseOnUpload(ctx.staticRoot);
    if (params.get('release') !== '0') {
      stats.batch.evicted = evictUnusedTextures(ctx.tex?.cache, scene);   // [mobile-perf]
      try { stats.batch.boatCaches = ctx.services.harbor?.releaseCaches?.() ?? null; } catch (e) { console.warn(e); }   // [mobile-perf] the hull templates the batch copied
      stats.batch.materialsEvicted = evictUnusedMaterials(ctx.mat?.cache, scene);   // [mobile-perf]
      // [mobile-perf] the atlas pages go to the GPU now and free their canvases (core/batch2.js freeOnUpload): ~80 MB of page canvases no
      // longer live through the compile and the warm-up frame, which allocate their own (free before allocating the next big thing)
      const pages = new Set();
      scene.traverse((o) => { const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const m of ms) if (m.map?.userData?.atlas) pages.add(m.map); });
      for (const p of pages) { try { renderer.initTexture(p); } catch (e) { console.warn('atlas upload', e); } }
      stats.batch.pagesUploaded = pages.size;
    }
  }
  finished('batch', t);
  if (quality.phone) await idle();   // [mobile-perf] the sources and the build's garbage go before the compile and the uploads (WebKit collects in idle time)
  if (params.get('play') !== '0') { try { await mountSwim(ctx); } catch (e) { console.warn('swim', e); } }   // [play:underwater] before compile, so the fish programs warm up with the town
  // [v3:fix] compile every program up front, hidden ones too (season particles, night-only meshes) and the tiny planet's
  // fold pass: the first season / planet toggle used to hitch ~200 ms compiling shaders
  // [ui-c2] Measured (gated, tools/anime/ui-c2-check.mjs): renderer.compile() only HANDS the programs to the driver (0.3 s); with KHR_parallel_shader_compile the compiling goes on in the GPU
  // process, and compileAsync (which waits for it without blocking the thread) resolves 2.1-2.4 s later, with the same time to ready overall. So the synchronous call stays the default (what
  // shipped, and what the iPhone has been checked with); ?compile=async waits for the programs instead (the label, the creeping bar and the shimmer stay alive through the wait and the card is
  // not ready before the programs are), for a device check: stats.firstFrameMs - the klc:ready mark is the first frame's stall.
  t = await begin('compile');
  const hidden = []; let compiled = null;
  // [mobile-perf] Compiled against the colour pass's own target (linear HDR), where every scene material is drawn. Against the canvas (sRGB
  // output) each material became a second program the frame never used: 97 of deploy #5's 234 programs, each a Metal pipeline on an iPhone.
  const prevRT = renderer.getRenderTarget();
  try {
    scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    renderer.setRenderTarget(pipeline.targets.rtColor);
    try {
      if (params.get('compile') === 'async' && typeof renderer.compileAsync === 'function') compiled = renderer.compileAsync(scene, camera); else renderer.compile(scene, camera);   // (the programs are made inside this call: the hidden meshes can be put back at once)
    } finally { renderer.setRenderTarget(prevRT); }
  } catch (e) { console.warn(e); } finally { for (const o of hidden) o.visible = false; }
  try { if (compiled) await Promise.race([compiled, new Promise((r) => setTimeout(r, 30000))]); } catch (e) { console.warn(e); }   // (never longer than 30 s: a program that never reports ready must not keep the town from opening; the first frame then waits for it)
  // [smooth] The warm-up frame: renderer.compile() makes the colour pass's programs only. The outline pre-pass (one override material, a
  // program per variant: instanced, batched, skinned, vertex colours) and the shadow pass make theirs, and every texture is uploaded, the
  // first time an object is drawn: in play, a hitch (the baseline's first drive: 266 ms). One frame of every pass now, with every hidden mesh
  // shown and nothing culled, does all of it behind the loading card. ?warm=0 skips it.
  if (params.get('warm') !== '0') {
    const tw = performance.now(), culled = [], shown = [];
    try {
      scene.traverse((o) => { if (!o.visible) { shown.push(o); o.visible = true; } if (o.frustumCulled) { culled.push(o); o.frustumCulled = false; } });
      pipeline.render(scene, camera, sunDir, simT);
    } catch (e) { console.warn('warm-up frame', e); } finally { for (const o of culled) o.frustumCulled = true; for (const o of shown) o.visible = false; }
    stats.warmMs = Math.round(performance.now() - tw);
  }
  if (!quality.phone) { try { planet.precompile?.(); } catch (e) { console.warn(e); } }   // [v4:phone] the tiny planet's six faces only when it is opened (one quad: 0 ms)
  if (quality.phone) await idle();   // [mobile-perf] the warm-up's released arrays go before the title (the load's peak was right there)
  finished('compile', t);   // (the bar's 100 % is main()'s, when the title is ready: core/loadplan.js folds the work after build() into compile's weight)
}

// ------------------------------------------------------------------ player / cameras
const player = new Player(camera, canvas, ctx.physics, L.WORLD.play);
ctx.playerObj = player;
// [v7:pad] touch: the pad owns the canvas's touches (docs/MOBILE-CONTROLS.md); ?touch=1 forces it on (desktop testing), ?touch=0 off
const pad = createTouchpad({ canvas, ctx, player });
ctx.pad = pad; player.attachPad(pad); window.__pad = pad;
const DEG = 180 / Math.PI;
/** Free camera at pos looking at a point (drone). */
function lookAt(pos, look) {
  const dx = look[0] - pos[0], dy = look[1] - pos[1], dz = look[2] - pos[2];
  const yaw = Math.atan2(-dx, -dz) * DEG, pitch = Math.atan2(dy, Math.hypot(dx, dz)) * DEG;
  player.setPose(pos[0], pos[2], yaw, pitch, pos[1]);
}
/** "hero" | "walk" | "tour:<id>" | "tourwalk:<id>" | "x,z,yaw,pitch" | "x,y,z,yaw,pitch" | "x,y,z>lx,ly,lz" | "x,y,z,heading,pitch,fov" (a report's link: compass heading, see core/pose.js) */
function camSpec(s) {
  s = String(s).trim();
  // [v3:polish2] the hero drone is the tour's re-framed one (life/tour.js FRAMES.hero) when life is loaded, so the
  // opening HUD view, the stills and the 内湾 tour stop are one framing
  if (s === 'hero') { const hd = ctx.services.life?.tour?.stops?.find((x) => x.id === 'hero')?.drone || L.HERO.drone; return lookAt(hd.pos, hd.look); }
  if (s === 'walk') { player.fly = false; return player.setPose(L.HERO.walk.x, L.HERO.walk.z, L.HERO.walk.yaw, L.HERO.walk.pitch); }
  const m = s.match(/^tour(walk)?:([\w-]+)$/);   // [v4:polish2] ids with a hyphen (explore's lm-* stops) too
  if (m) {
    // [v3:fix] the UI's tour stops (life's tour: hero, market, pier7, ukimido, ...) first, then the layout's; bay = hero
    const id = m[2] === 'bay' ? 'hero' : m[2];
    const T = ctx.services.life?.tour || window.__life?.tour;
    const t = T?.stops?.find((x) => x.id === id) || L.TOUR.find((x) => x.id === m[2] || (id === 'hero' && x.id === 'bay'));
    if (!t) throw new Error('no tour stop ' + m[2]);
    if (m[1] && t.walk) { player.fly = false; return player.setPose(t.walk.x, t.walk.z, t.walk.yaw, t.walk.pitch); }
    return lookAt(t.drone.pos, t.drone.look);
  }
  if (s.includes('>')) { const [a, b] = s.split('>').map((p) => p.split(',').map(Number)); return lookAt(a, b); }
  // [contrib] six numbers = the link of a report (core/pose.js: x, y, z, compass heading, pitch, vertical fov): the exact view, free camera at that eye position
  const link = queryToPose(s);
  if (link) { const a = poseToCamArgs(link); player.setPose(a.x, a.z, a.yaw, a.pitch, a.y); fovPin = a.fov; camera.fov = a.fov; camera.updateProjectionMatrix(); return; }
  const v = s.split(',').map(Number);
  // [v4:polish2] a spec that does not resolve is an error (it used to leave the previous camera in place silently)
  if ((v.length !== 4 && v.length < 5) || v.some((n) => !Number.isFinite(n))) throw new Error('camera spec does not resolve: ' + s);
  if (v.length === 4) { player.fly = false; player.setPose(v[0], v[1], v[2], v[3]); }
  else player.setPose(v[0], v[2], v[3], v[4], v[1]);
}
window.__camSpec = camSpec;
window.__setCam = (x, y, z, yaw, pitch) => { if (y === null || y === undefined) player.setPose(x, z, yaw, pitch); else player.setPose(x, z, yaw, pitch, y); };
window.__lookAt = lookAt;
window.__setHours = (h) => { if (ctx.services.time?.setHours) ctx.services.time.setHours(h, { pin: true }); else sky.setHours(h); };

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
let titleWarm = 0;   // [title] still frames at the poster's sim time before the poster fades (loader-keyart waits eight)
/** Run the registered updates. pass ALL: every one, in registration order (shot mode, window.__sim, ?smooth=0); STEPS: only the
 *  ctx.onStep ones (one fixed simulation step); FRAME: only the ctx.onUpdate ones (once per rendered frame, after the steps). */
const ALL = 0, STEPS = 1, FRAME = 2;
function stepUpdates(dt, t, pass = ALL) {
  if (pass !== STEPS) {
    ctx.time = t; ctx.shared.uTime.value = t;
    ctx.shared.uGust.value = 0.5 + 0.28 * Math.sin(t * 0.37) + 0.14 * Math.sin(t * 1.13 + 1.7) + 0.08 * Math.sin(t * 2.9 + 0.4);
  }
  ctx.player.position.copy(player.pos);
  const P = perf.on;
  for (const fn of ctx._updates) {
    if (pass === STEPS ? !fn.__step : pass === FRAME && fn.__step) continue;
    if (P) perf.enter(fn.__pb ??= perf.bucket(updateLabel(fn)));   // [perf]
    try { fn(dt, t); } catch (e) { if (!fn.__err) { fn.__err = 1; console.error('update error', e); errors.push({ module: 'update', message: String((e && e.stack) || e) }); } }
    if (P) perf.leave();
  }
}
/** GPU benchmark: renders n frames back-to-back (forcing sync) and returns ms/frame + counts. */
window.__bench = (n = 30) => {
  const gl = renderer.getContext(); const px = new Uint8Array(4);
  viewTune(); pipeline.render(scene, camera, sunDir, simT); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const t0 = performance.now();
  let sumCalls = 0, sumTris = 0, maxCalls = 0, maxTris = 0;   // [v4:phone] the phone tier skips some shadow updates: report the mean and the worst frame
  for (let i = 0; i < n; i++) { renderer.info.reset(); sky.update(simT, camera); pipeline.render(scene, camera, sunDir, simT); const c = renderer.info.render.calls, t = renderer.info.render.triangles; sumCalls += c; sumTris += t; maxCalls = Math.max(maxCalls, c); maxTris = Math.max(maxTris, t); }
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const ms = (performance.now() - t0) / n;
  return { ms: +ms.toFixed(2), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, meanCalls: Math.round(sumCalls / n), meanTriangles: Math.round(sumTris / n), maxCalls, maxTriangles: maxTris, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, programs: renderer.info.programs?.length };
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
window.__sim = (target) => { ctx.alpha = 1; let t = 0; const dt = 1 / 30; while (t < target) { stepUpdates(dt, t); t += dt; } simT = target; stepUpdates(0, simT); };
// [v3:life] continue the simulation from the current time (deterministic film frames: no replay from 0 per frame)
window.__simTo = (target, dt = 1 / 30) => { if (target < simT) return window.__sim(target); ctx.alpha = 1; let t = simT; while (t + dt <= target + 1e-9) { t += dt; stepUpdates(dt, t); } simT = target; stepUpdates(0, simT); return simT; };

// ------------------------------------------------------------------ HUD
let areaName = '';
// [sys:22] The HUD toast: the nickname boxes (内湾, 神明崎, 魚市場) first, then the GSI 町丁 grid without its 丁目 (so the toast does not fire on every
// 丁目 line: 八日町, not 八日町一丁目), then explore's polygon / label lookup, then ''.
const overlay = (x, z) => { for (const a of L.AREAS) if (x >= a.x0 && x <= a.x1 && z >= a.z0 && z <= a.z1) return a.name; return ''; };
function areaAt(x, z) { return overlay(x, z) || areaBase(L.areaAtGsi(x, z)) || areaBase(ctx.services.explore?.search?.areaAt?.(x, z)?.ja) || ''; }
let toastTimer = 0;
function showToast(name) {
  const el = $('toast'); if (!el || !name) return;
  el.querySelector('.t-name').textContent = name;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3800);
}
// [smooth] four times a second, and the clock's text only when it changes: the area lookup and a text write every frame (which makes
// the browser lay the HUD out again even for the same text) bought nothing a 250 ms toast or a minute clock can show
let hudAcc = 1, clockText = '';
function hudTick(dt) {
  hudAcc += dt; if (hudAcc < 0.25) return; hudAcc = 0;
  const n = areaAt(player.pos.x, player.pos.z);
  if (n && n !== areaName) { areaName = n; if (started) showToast(n); }
  const clock = $('clock');
  if (clock) { const T = ctx.services.time, txt = T?.clock ? T.clock() : sky.clock(); if (txt !== clockText) { clockText = txt; clock.textContent = txt; } }
}

// ------------------------------------------------------------------ main loop
// [smooth] The fixed-step loop (core/timestep.js; docs/perf/RESULTS.md): the simulation (the walker, the car, the ship at the helm: ctx.onStep)
// runs in steps of exactly 1/60 s, as many as the time since the last frame holds (at most six), and the frame is drawn between the last two
// steps (ctx.alpha). Everything else (the townspeople, the boats, the tour flights, the clouds, the shaders' time) runs once per frame on the
// same clock, at the instant the frame shows: nothing moves by the raw frame time, and a 120 Hz screen gets 120 different pictures. The look
// (mouse, pad) is read every frame. ?smooth=0 runs the old loop (the frame's own time, clamped to 0.1 s).
const SMOOTH = params.get('smooth') !== '0';
const simClock = createClock();
// [smooth] frame pacing (core/timestep.js createPacer): a steady 60 on any screen; a 120 Hz screen draws every other vsync (an even 16.7 ms,
// not a mix of 8.3 and 16.7). ?fps=0 draws every vsync, ?fps=30 every other 60 Hz one. Off with ?smooth=0 and in shot mode.
const pacer = createPacer({ fps: params.has('fps') ? Number(params.get('fps')) : 60 });
window.__pacer = pacer;
let renderT = 0, stepT = 0;
window.__clock = simClock;
let started = false, last = performance.now(), fpsAcc = 0, fpsN = 0, fps = 0;
let arrive = null;
const arriveToP = new THREE.Vector3();
const arriveToQ = new THREE.Quaternion();
function blendArrive(dt) {
  if (!arrive) return;
  arrive.t += dt > 0 ? dt : 0;
  const u = arrive.dur > 0 ? Math.min(1, arrive.t / arrive.dur) : 1;
  const k = 1 - (1 - u) * (1 - u);
  arriveToP.copy(camera.position);
  arriveToQ.copy(camera.quaternion);
  camera.position.lerpVectors(arrive.fromP, arriveToP, k);
  camera.quaternion.copy(arrive.fromQ).slerp(arriveToQ, k);
  if (u >= 1) { arrive = null; if (!player.fly) player.requestLock(); }
}
function landWelcome() {
  const pose = welcomePose();
  const fromP = camera.position.clone();
  const fromQ = camera.quaternion.clone();
  player.gull = false;
  player.fly = false;
  player.person = 'third';
  player.setPose(pose.x, pose.z, pose.yawDeg, 0);
  try { ctx.services?.life?.hud?.noteMode?.('walk3'); } catch (e) { /* the HUD can arrive a moment later */ }
  let reduce = false;
  try { reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* motion on */ }
  if (reduce || pose.dur <= 0) { arrive = null; return; }
  arrive = { fromP, fromQ, t: 0, dur: pose.dur };
}
function frame(now) {
  requestAnimationFrame(frame);
  if (survive?.lost) { last = now; return; }   // [ui-c] the phone took the WebGL context: draw nothing until the reload (core/survive.js)
  if (SMOOTH && !SHOT && !pacer.tick(now)) return;   // [smooth] not this vsync
  const frameT0 = performance.now();
  perf.frame(now);   // [perf] sections below: player (the simulation steps), physics, updates (by module), audio, view, sky, render (+ GPU query), hud
  const raw = Math.max(0, (now - last) / 1000); last = now;
  const lag = Math.max(0, frameT0 - now);   // [mobile-perf] how late this callback started after its vsync's timestamp (a main-thread hold-up, not the GPU)
  let dt, pass = ALL;
  perf.section('player');
  if (SHOT || titleWarm > 0) { dt = 0; if (titleWarm > 0) titleWarm--; }   // [title] the poster was shot with the clock held
  else if (!SMOOTH) { dt = Math.min(0.1, raw); player.update(dt); }
  else {
    const { steps, alpha } = simClock.advance(raw);
    if (steps) ctx.physics.refreshDynamic();
    for (let i = 0; i < steps; i++) { stepT += simClock.step; player.step(simClock.step); stepUpdates(simClock.step, stepT, STEPS); }
    perf.steps(steps);
    dt = Math.max(0, simClock.renderTime - renderT); renderT = simClock.renderTime;
    ctx.alpha = alpha;
    player.lookStep(dt);
    player.present(alpha, dt);
    pass = FRAME;
  }
  simT += dt;
  perf.section('physics');
  if (pass === ALL) ctx.physics.refreshDynamic();
  perf.section('updates');
  stepUpdates(dt, simT, pass);
  blendArrive(dt);
  perf.section('audio');
  try { audio.update(camera, dt); } catch (e) { if (!audio.__err) { audio.__err = 1; console.error('audio', e); } }
  perf.section('view');
  viewTune();
  perf.section('sky');
  sky.update(simT, camera);
  perf.section('render');
  renderer.info.reset();
  const drawn = !ctx.shooting;
  if (drawn) gpuTimer?.begin(perf.index());   // [smooth] the frame's GPU time (tag: the profiler's frame, -1 when not recording)
  if (ctx.shooting) { /* [ui-c2] a photo is being encoded (ui/photo.js): no frame now, it would render at the photo's size (a dozen 4K frames on a desktop, ~1.7 MP ones on a phone) */ }
  else if (planet.active) planet.render(simT); else pipeline.render(scene, camera, sunDir, simT);   // [v3:integrate]
  if (drawn) gpuTimer?.end();
  const cpuMs = performance.now() - frameT0;
  if (stats.firstFrameMs === undefined) stats.firstFrameMs = Math.round(performance.now());
  if (!SHOT && params.get('capture') !== '1' && titleWarm === 0) document.body.classList.add('klc-live');   // [title] the poster fades out over the settled live frame (600 ms). A capture keeps the poster.
  // [smooth] dynamic resolution: this frame's GPU time (the newest result back) and its pacing decide the next render scale
  let gpuMs = null;
  gpuTimer?.poll((ms, tag) => { gpuMs = ms; perf.gpu(tag, ms); });
  if (DR_ON && drawn && !planet.active && dr.sample({ gpu: gpuMs, frame: raw * 1000, cpu: cpuMs, lag })) applyScale();
  perf.section('hud');
  if (!SHOT) hudTick(dt);
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; const s = $('stats'); if (s && !s.hidden) s.textContent = `${fps.toFixed(0)} fps · ${renderer.info.render.calls} calls · ${(renderer.info.render.triangles / 1e6).toFixed(2)}M tris · ${Math.round(renderScale() * 100)} %`; }
  stats.fps = fps; stats.calls = renderer.info.render.calls; stats.triangles = renderer.info.render.triangles; stats.renderScale = renderScale();
  perf.frameEnd(renderer.info, renderScale());
}

function start() {
  if (started) { player.requestLock(); return; }
  started = true;
  if (dr.settling) { dr.settle(false); writeHeld(drStore, dr.scale, drKey); }   // [mobile-perf] the visitor is in: keep the scale found behind the title
  if (LITE.level) setTimeout(() => showToast(liteNote(document.documentElement.lang === 'en' ? 'en' : 'ja')), 4200);   // [mobile-perf] after the place's name
  player.enabled = true;
  document.body.classList.add('playing');
  const scripted = !!(ctx.resumed || params.has('cam') || params.has('fly') || params.has('at'));
  if (!scripted) landWelcome();
  if (!arrive && !player.fly) player.requestLock();
  try { audio.start(); } catch (e) { console.warn(e); }
  showToast(areaAt(player.pos.x, player.pos.z) || L.NAMES.bay);   // [sys:22] overlay || areaAtGsi || the bay
}

/** [ui-c] After a context-loss reload (core/survive.js): the visitor's camera, time of day and season. Returns whether the camera was put back (the voyage and the car have no place to stand). */
function applyResume(r) {
  const v = resumeView(r.pose);
  if (!v) return false;
  placeCamera(player, v);
  try {
    const T = ctx.services.time, c = resumeClock(r.pose);
    if (T && c) { if (c.preset) T.set(c.preset, { instant: true }); else T.setHours(c.hours); }
    const S = ctx.services.life?.season, sid = resumeSeason(r.pose);
    if (S && sid && S.id !== sid) S.set(sid, { instant: true });
    ctx.services.life?.hud?.render?.();
  } catch (e) { console.warn('resume: time of day / season', e); }
  ctx.resumed = { why: r.why, ageMs: r.ageMs, mode: r.pose.mode };
  return true;
}

async function main() {
  await build();
  const tPost = performance.now();   // [mobile-perf] main()'s own work before the title (play's mount, the first update, the title's camera): stats.finish.post
  if (params.get('play') !== '0') {
    try {
      mountPlay(ctx);
    } catch (e) {
      console.error('[play]', e);
      errors.push({ module: 'play', message: String((e && e.stack) || e) });
    }
  }
  // [smooth] from now on a stream pool of a new material waits for its program before it is drawn (explore/sbatch.js _warm); the load compiled the rest
  if (!SHOT) { const sb = ctx.services.explore?.stream?.sb; if (sb) sb.warmNew = true; }
  const TITLE_POSE = { pos: [428, 126, 130], look: [56, -18, -174] };   // [title] FRAMES.hero.drone / drone_1630, every aspect (phones do not take the portrait reframe here)
function titlePose() { lookAt(TITLE_POSE.pos, TITLE_POSE.look); }
window.__titleArrive = () => start();
window.__titleFly = () => {
  const tour = ctx.services.life?.tour;
  let reduce = false; try { reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* motion on */ }
  if (!tour || reduce) { start(); return; }
  const hero = tour.stops.find((s) => s.id === 'hero');
  const dest = hero ? hero.drone : TITLE_POSE;
  const dist = Math.hypot(dest.pos[0] - TITLE_POSE.pos[0], dest.pos[1] - TITLE_POSE.pos[1], dest.pos[2] - TITLE_POSE.pos[2]);
  const to = dist < 3 ? { pos: TITLE_POSE.pos.map((v, i) => v + (TITLE_POSE.look[i] - v) * 0.18), look: TITLE_POSE.look.slice() } : dest;
  let n = 0;
  const off = tour.onChange(() => { n++; if (n === 1) return; if (!tour.flying) { off(); start(); } });
  tour.flyTo(to, { duration: dist < 3 ? 1.3 : 2.4, straight: dist < 3, s0: 1.2 });
  if (!tour.flying) { off(); start(); return; }
  setTimeout(() => { if (!started) { try { off(); } catch { /* already */ } start(); } }, 8000);
};
if (params.get('cam')) { try { camSpec(params.get('cam')); } catch (e) { console.warn(e.message); camSpec('hero'); } } else if (!SHOT && resume && applyResume(resume)) { /* back where the visitor was */ } else if (!SHOT) { titlePose(); if (!params.has('t')) { simT = ({ asa: 14, hiru: 14, yugata: 14, yoru: 30 })[posterForQuery(params)] || 14; titleWarm = 8; } } else camSpec('hero');   // [title] the same sim seconds loader-keyart used for that poster
  if (params.has('fly')) player.fly = true;
  if (simT > 0) window.__sim(simT); else stepUpdates(0, 0);
  viewTune();
  sky.update(simT, camera);
  if (DR_ON && !started) dr.settle(true);   // [mobile-perf] behind the title (and its flight in): find the scale this device holds
  requestAnimationFrame(frame);
  stats.finish.post = Math.round(performance.now() - tPost);
  setProgress(1, '');   // [mobile-perf] 100 % when the title is ready, not when build() returns (the bar used to sit there through main()'s own work)
  if (SHOT) {
    document.body.classList.add('shot');
    // The play kit hides until the town is playing. Shot proof with the real HUD passes ui=1.
    if (params.has('hear') || params.get('ui') === '1') document.body.classList.add('playing');
    if (params.has('hear')) {
      try { audio.start(); } catch (e) { console.warn(e); }
    }
    if (params.get('ui') === '1') document.body.classList.add('klc-ui');
    let n = 0; const wait = () => { if (++n > 6) { window.__ready = true; } else requestAnimationFrame(wait); }; requestAnimationFrame(wait);
    return;
  }
  try { performance.mark('klc:ready'); } catch (e) { /* [ui-c] the time to ready, read by the ?dbg=1 strip (the page's own clock: ms since navigation start) */ }
  if (LITE.phoneTier) setTimeout(() => bootOk(bootStore), 10000);   // [mobile-perf] the town has stood 10 s: the next boot starts clean
  if (quality.phone && params.get('sweep') !== '0') startSweeper();   // [mobile-perf] the session gives back what it has left behind
  document.body.classList.add('loaded');
  document.documentElement.classList.add('klc-card-ready');   // [ui-c2] the card is on screen when the town is ready, whatever the font hold did (index.html's script normally revealed it seconds ago)
  // [ui-c2] focus 「まちへ出る」 only where a pointer can hover (a keyboard and a mouse): on a touch screen the focus ring and the scroll-into-view are noise (mobile F28); preventScroll keeps a short screen where it is. Enter still starts the town (the keydown handler below).
  const go = $('go'); if (go) { go.disabled = false; if (window.matchMedia?.('(pointer: fine)')?.matches) go.focus({ preventScroll: true }); go.addEventListener('click', () => { if (window.__titleOnGo) window.__titleOnGo(); else start(); }); }
  canvas.addEventListener('click', () => { if (started && !ctx.services.ship?.voyage?.active) player.requestLock(); });   // [ship:integrate] the voyage UI needs the cursor
  document.addEventListener('pointerlockchange', () => { document.body.classList.toggle('locked', document.pointerLockElement === canvas); });
  installHeldR(window);
  addEventListener('keydown', (e) => {
    if (e.code === 'Enter' && !started) { if (window.__titleOnGo) window.__titleOnGo(); else start(); }
    if (!started) return;
    if (e.code === 'KeyH') document.body.classList.toggle('noui');
    if (e.code === 'KeyM') { audio.muted = !audio.muted; const b = $('mute'); if (b) b.setAttribute('aria-pressed', String(audio.muted)); }
    if (e.code === 'Backquote') { const s = $('stats'); if (s) s.hidden = !s.hidden; }
    const v = VIEWS[e.code]; if (v) { camSpec(v.spec); showToast(v.label); }
  });
  // [r-hold] a tap of R does nothing. A hold snaps back to the hero overview. 一本釣り owns R for 散水, so it never resets from there.
  addEventListener(HELD_R, () => { if (!started || ctx.services.ippon?.ownsInput?.()) return; camSpec('hero'); });
  const q = $('quality');
  // [v4:phone] a forced phone keeps only the phone choice (a higher tier is what crashed iOS Safari)
  if (q && TIER.forced) for (const op of [...q.options]) if (op.value !== 'phone') op.remove();
  if (q) { q.value = qName; q.addEventListener('change', () => { try { localStorage.setItem('klc.q', q.value); } catch (e) { /* private mode */ } location.reload(); }); }
  const mute = $('mute'); if (mute) mute.addEventListener('click', () => { audio.muted = !audio.muted; mute.setAttribute('aria-pressed', String(audio.muted)); });
  if (params.has('stats')) $('stats').hidden = false;
  if (errors.length) console.warn('module errors', errors);
}
main();
