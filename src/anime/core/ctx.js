// Ported from Sakuragaoka Station (Kenton-GMI/sakuragaoka-station, MIT; see src/anime/LICENSE-sakuragaoka-station).
// The context object handed to every world module's build(ctx).
import * as THREE from 'three';
import * as L from '../world/layout.js';
import { createMaterials, LAYER_NO_OUTLINE, PALETTE } from './materials.js';
import { createTextures } from './textures.js';
import { PHONE } from './tier.js';   // [v4:phone]
import * as geo from './geo.js';
import { Physics } from './physics.js';
import { sharedHardShores } from '../world/layout/hardshore.js';   // [v3:fix]
import { createFeatures } from './features.js';   // [v6:survey]

export function mulberry32(seed) {
  let a = (typeof seed === 'string' ? [...seed].reduce((h, c) => (Math.imul(h ^ c.charCodeAt(0), 16777619)) >>> 0, 2166136261) : seed) >>> 0;
  const r = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * r());
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  return r;
}

export function createContext({ scene, camera, renderer = null, audio, quality, sunDir }) {
  const staticRoot = new THREE.Group(); staticRoot.name = 'static';
  const dynamicRoot = new THREE.Group(); dynamicRoot.name = 'dynamic';
  scene.add(staticRoot); scene.add(dynamicRoot);
  const updates = [];
  const shared = {
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector2(0.9, 0.35) },   // wind direction * strength (m/s-ish), blows roughly +X
    uSunDir: { value: sunDir.clone() },
    uGust: { value: 0.5 },                               // 0..1 slowly varying gust strength (core animates it)
  };
  const mat = createMaterials(shared);
  const tex = createTextures({ maxSide: quality?.phone ? PHONE.canvasMax : 0 });   // [v4:phone] canvas textures <= 512 px
  const wires = geo.createWireSystem();
  // [v3:fix] the sea is a wall on foot (quays have no parapets); in front of a quay face counts as sea too
  const HS = sharedHardShores(L);
  // and so does the low DEM strip (< 1.2 m) right at a hard shore, where no quay deck covers it (a 2.7 m drop to the water)
  const physics = new Physics(L.heightAt, (x, z) => L.isWater(x, z) || HS.seaward(x, z) || (L.heightAt(x, z) < 1.2 && HS.near(x, z) > 0.5));

  const ctx = {
    THREE, scene, camera, renderer, audio, quality,
    L, layout: L,
    mat, tex, geo, wires, physics, palette: PALETTE,
    shared, sunDir,
    services: {},
    features: createFeatures(),   // [v6:survey] named feature positions (window.__features), core/features.js
    staticRoot, dynamicRoot,
    LAYER_NO_OUTLINE,
    time: 0,
    player: { position: new THREE.Vector3() },   // feet position, updated every frame
    /** Add static scenery (will be merged by material after all modules are built). */
    addStatic(obj) { staticRoot.add(obj); return obj; },
    /** Add animated / interactive objects (never merged). */
    add(obj) { obj.traverse((o) => { o.userData.dynamic = true; }); dynamicRoot.add(obj); return obj; },
    /** Register fn(dt, t) called every frame (t = seconds since start, deterministic in shot mode). */
    onUpdate(fn) { updates.push(fn); },
    /** Exclude from the outline pass (alpha cut-outs, particles, shader-animated meshes). */
    noOutline(obj) { obj.traverse((o) => o.layers.set(LAYER_NO_OUTLINE)); return obj; },
    /** Exclude from static merging (keep separate). */
    noBatch(obj) { obj.traverse((o) => { o.userData.noBatch = true; }); return obj; },
    rng: mulberry32,
    kit: (parent) => geo.makeKit(parent),
    _updates: updates,
  };
  return ctx;
}
