// [mobile-play] A play mode's world, built when the mode starts and freed on a phone when the player leaves.
//
// Deploy #5 built every mode's world at startup: +49 shader programs and +35 MB of JS heap at the start view. On an iPhone
// every program is a Metal pipeline in the GPU process, and the phone gave up ("A problem repeatedly occurred").
//
//   const world = lazyWorld(ctx, 'swim', (wctx, root) => ({ ...parts }));   // the builder adds through wctx.add (into root)
//   world.ensure()          the parts, built now if they are not (synchronous: a path that must have them at once)
//   await world.prepare()   built, every program compiled and every buffer and texture uploaded, behind a cover
//                           (the hub's title card: kit/hub.js calls a mode's prepare() while the card is up)
//   world.leave()           a phone frees it (the next start builds it again behind the card); a desktop keeps it
//   world.free()            removes it and disposes what only it used: geometries, materials (their programs go
//                           with the last user), textures, instanced buffers
//
// Nothing a world builds goes into the static batch (wctx.addStatic adds to the world too), and every object carries
// userData.play = name (tools/anime/play-census.mjs counts the play share of the scene by it).
import * as THREE from 'three';

const worlds = new Map();

/** What is built now, and what each build and warm-up cost (the census and the tests read this). */
export function lazyStats() {
  const out = {};
  for (const [name, w] of worlds) out[name] = { built: w.built, builds: w.builds, frees: w.frees, buildMs: w.buildMs, warmMs: w.warmMs, objects: w.objects };
  return out;
}

const texOf = (m, fn) => {
  for (const k in m) { const v = m[k]; if (v && v.isTexture) fn(v); }
  if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k]?.value; if (v && v.isTexture) fn(v); }
};
const matsOf = (o) => (Array.isArray(o.material) ? o.material : o.material ? [o.material] : []);

/**
 * Take obj out of the scene and dispose what only it used: geometries, materials (a program goes with its last material),
 * textures, instanced buffers, skeletons. Anything still drawn elsewhere in the scene (a shared gradient map, a kit
 * material, a cached sign) is kept. extra: materials it owns that are not on a mesh right now (a figure's other face).
 * A disposed object that is used again later is simply uploaded again (three.js re-creates what it needs).
 */
export function freeTree(ctx, obj, { extra = [] } = {}) {
  if (!obj) return;
  obj.parent?.remove(obj);
  const keepG = new Set(), keepM = new Set(), keepT = new Set();
  ctx?.scene?.traverse((o) => {
    if (o.geometry) keepG.add(o.geometry);
    for (const m of matsOf(o)) { keepM.add(m); texOf(m, (t) => keepT.add(t)); }
  });
  const geos = new Set(), mats = new Set(extra), texs = new Set();
  obj.traverse((o) => {
    if (o.geometry) geos.add(o.geometry);
    for (const m of matsOf(o)) mats.add(m);
    if (o.isInstancedMesh || o.isBatchedMesh) { try { o.dispose(); } catch (e) { /* older three */ } }
    if (o.isSkinnedMesh && o.skeleton) { try { o.skeleton.dispose(); } catch (e) { /* */ } }
  });
  for (const m of mats) if (m) texOf(m, (t) => texs.add(t));
  for (const g of geos) if (!keepG.has(g)) g.dispose();
  for (const m of mats) if (m && !keepM.has(m)) m.dispose();
  for (const t of texs) if (!keepT.has(t)) t.dispose();
}

/**
 * Compile obj's programs (hidden objects too) for the frame they will be drawn in, without drawing anything: the colour pass
 * draws into the pipeline's linear HDR target, so that target is bound while compileAsync makes the programs (with none
 * bound, every material got a canvas sRGB program the frame never uses). Resolves when they are ready (or after 6 s).
 */
export function compileQuiet(ctx, obj) {
  const r = ctx?.renderer, cam = ctx?.camera, scene = ctx?.scene;
  if (!obj || !r || !cam || !scene) return Promise.resolve();
  const target = ctx.pipeline?.targets?.rtColor || null;
  const prev = target && typeof r.getRenderTarget === 'function' ? r.getRenderTarget() : null;
  let compiling = null;
  try {
    if (target && typeof r.setRenderTarget === 'function') r.setRenderTarget(target);
    if (typeof r.compileAsync === 'function') compiling = r.compileAsync(obj, cam, scene);
    else if (typeof r.compile === 'function') r.compile(obj, cam, scene);
  } catch (e) {
    console.warn('[play] compile', obj.name || '', e);
  } finally {
    if (target && typeof r.setRenderTarget === 'function') r.setRenderTarget(prev);
  }
  return compiling ? Promise.race([compiling.catch(() => {}), sleep(6000)]) : Promise.resolve();
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const nextFrame = () => new Promise((r) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => r()) : setTimeout(r, 16)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function lazyWorld(ctx, name, build, { keepOnPhone = false } = {}) {
  let root = null;
  let parts = null;
  let warmed = false;
  let preparing = null;
  let hooks = [];
  const w = { built: false, builds: 0, frees: 0, buildMs: 0, warmMs: 0, objects: 0 };
  worlds.set(name, w);
  try { if (typeof window !== 'undefined') window.__playWorlds = lazyStats; } catch (e) { /* not a browser */ }

  function ensure() {
    if (parts) return parts;
    const t0 = now();
    root = new THREE.Group();
    root.name = 'play:' + name;
    root.userData.play = name;
    root.userData.noBatch = true;
    const mark = (o) => { o.traverse((c) => { c.userData.dynamic = true; c.userData.play = name; c.userData.noBatch = true; }); };
    const wctx = Object.create(ctx);
    wctx.add = (o) => { mark(o); root.add(o); return o; };
    wctx.addStatic = wctx.add;
    wctx.world = api;
    // an update a builder registers lives as long as its world: free() retires it (a rebuild must not leave the old one running)
    const hook = (reg) => (fn) => {
      const g = (dt, t) => { if (!g.dead) fn(dt, t); };
      g.__mod = fn.__mod || 'play:' + name;
      hooks.push(g);
      reg.call(ctx, g);
    };
    wctx.onUpdate = hook(ctx.onUpdate);
    wctx.onStep = hook(ctx.onStep);
    parts = build(wctx, root) || {};
    mark(root);
    if (ctx.add) ctx.add(root); else ctx.scene?.add(root);
    warmed = false;
    w.built = true; w.builds++;
    w.buildMs = Math.round(now() - t0);
    let n = 0; root.traverse(() => { n++; }); w.objects = n;
    return parts;
  }

  /**
   * Built and ready to draw without a stall: compile the colour pass's programs (compileAsync waits without blocking where the
   * browser compiles in parallel), then draw the world for a few frames with everything shown and nothing culled, so the
   * outline and shadow passes make theirs and every buffer and texture is uploaded. Only warm under a cover: the world is
   * on screen in those frames (the hub's title card is opaque). { warm: false }: the colour programs only, nothing shown
   * (a small world entered from the world itself, the gull from the drone).
   */
  function prepare({ warm = true } = {}) {
    if (preparing) return preparing;
    preparing = (async () => {
      const p = ensure();
      if (warmed) return p;
      const t0 = now();
      await compileQuiet(ctx, root);
      if (!root) return p;
      if (!warm) { w.warmMs = Math.round(now() - t0); return p; }
      const shown = [], culled = [];
      root.traverse((o) => {
        if (!o.visible) { shown.push(o); o.visible = true; }
        if (o.frustumCulled) { culled.push(o); o.frustumCulled = false; }
      });
      try { for (let i = 0; i < 4; i++) await nextFrame(); } finally {
        for (const o of shown) o.visible = false;
        for (const o of culled) o.frustumCulled = true;
      }
      warmed = true;
      w.warmMs = Math.round(now() - t0);
      return p;
    })().finally(() => { preparing = null; });
    return preparing;
  }

  function free() {
    if (!root) return;
    const gone = root;
    root = null; parts = null; warmed = false;
    const dead = hooks; hooks = [];
    for (const g of dead) g.dead = true;
    if (dead.length && Array.isArray(ctx._updates)) {
      // out of the frame's update loop (free() may run inside it), then off the list
      setTimeout(() => { for (const g of dead) { const i = ctx._updates.indexOf(g); if (i >= 0) ctx._updates.splice(i, 1); } }, 0);
    }
    freeTree(ctx, gone);
    w.built = false; w.frees++;
  }

  /** The player left the mode: a phone frees the world (the next start builds it again behind the title card). */
  function leave() {
    if (ctx.quality?.phone && !keepOnPhone) free();
  }

  const api = {
    name,
    get built() { return !!parts; },
    get ready() { return !!parts && warmed; },
    /** prepare() is drawing it behind a cover right now: leave its visibility alone */
    get warming() { return !!preparing; },
    get root() { return root; },
    get parts() { return parts; },
    ensure, prepare, free, leave,
  };
  return api;
}

/** Test seam. */
export function _resetLazy() { worlds.clear(); }
