// [v4:explore] Stream batching: everything the streamed core builds (streets, simplified buildings, full kit lots,
// props) is packed into a few THREE.BatchedMesh pools. A tile is an *entry* in every pool it touches: it can be hidden
// (a tile swapped to a finer level of detail) or removed (the tile unloaded) without touching its neighbours, and the
// draw calls stay one per pool however many tiles are loaded (the renderer is draw-call bound; ARCHITECTURE.md
// Performance).
//
// Slots. A pool draws one range per BatchedMesh instance, and ANGLE on Metal runs a multi-draw as a loop of draws, so
// hundreds of 100 m tiles per pool would cost hundreds of sub-draws per pass. Entries therefore go into *slots*: the
// coarse levels group their tiles into blocks (`add(key, group, { slot })`, e.g. 5 x 5 tiles), whose visible parts are
// concatenated into one instance when a part comes, goes or is hidden (`flush()`, once a frame); the kit tiles near the
// player keep a slot each. `cull(camera)` leaves out the slots wholly outside the view and beyond shadow range.
//
// Like the static batcher (core/batch2.js), cel materials that differ only by colour are folded into one shared
// material with the colour baked into the vertices, so a street's signs, mirrors, poles and guard rails share a pool.
// Meshes a BatchedMesh cannot draw (custom shaders: lit windows, wires; the vertex-animated laundry) are merged per
// material across all loaded tiles into one plain mesh, rebuilt when a tile comes or goes.
//
//   const sb = new StreamBatch(ctx, { name })
//   sb.add(key, group, { visible, slot })   pack a built group (world transforms baked) -> { packed, merged, kept, verts }
//   sb.setVisible(key, bool)   sb.remove(key)   sb.has(key)   sb.flush(size)   sb.cull(camera)   sb.stats()
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Materials whose built-in shader chunks understand USE_BATCHING (the cel materials all are MeshToonMaterial). */
export function packable(o) {
  if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.isBatchedMesh || o.userData?.noStream || o.customDepthMaterial) return false;
  const m = o.material;
  if (!m || Array.isArray(m)) return false;
  if (!(m.isMeshToonMaterial || m.isMeshBasicMaterial || m.isMeshLambertMaterial || m.isMeshStandardMaterial || m.isMeshPhongMaterial)) return false;
  const g = o.geometry;
  if (!g || !g.attributes.position || g.morphAttributes?.position || g.attributes.position.count === 0) return false;
  for (const k in g.attributes) if (g.attributes[k].isInterleavedBufferAttribute) return false;
  return true;
}
/** Cel materials that core/batch2.js would fold by colour (no custom shader patch of their own). */
export function convertible(m) {
  return !!((m.isMeshToonMaterial && m.userData.toon && m.onBeforeCompile === m.userData.toon.obc && !m.alphaMap && !m.normalMap && !m.bumpMap && !m.displacementMap && !m.defines?.USE_CUSTOM)
    || (m.isMeshBasicMaterial && !m.alphaMap && !m.envMap && !m.lightMap && !m.aoMap));
}
const sideName = (m) => (m.side === THREE.DoubleSide ? 'double' : m.side === THREE.BackSide ? 'back' : 'front');
function attrSig(g) { return Object.keys(g.attributes).sort().map((k) => k + g.attributes[k].itemSize).join(','); }
const nextCap = (need, cur) => { let c = Math.max(cur, 4096); while (c < need) c = Math.ceil(c * 1.6); return c; };
/** [smooth] the most vertices a stream pool takes before the next part of its kind opens a new one */
export const CHUNK_V = 1 << 17;
const IDENTITY = new THREE.Matrix4();
const _pm = new THREE.Matrix4(), _fr = new THREE.Frustum(), _cp = new THREE.Vector3();

// [smooth] A pool draws its material through a view of its own (an object whose prototype is the material: it reads every property, now
// and later). three.js keeps one program state per material object: a kit material drawn on the static batches (plain meshes) and on a
// pool (a BatchedMesh) in the same frame switched program variant back and forth, a program check and its garbage each time (about ten a
// frame, tools/perf/progchurn.page.js), and a pool's program compiled ahead (_warm) was overwritten by the plain one before it was used.
const _views = new WeakMap();
// [mobile-perf] A pool's slot fades in and out (a tile's full detail replacing its simplified buildings, StreamBatch.fade): the slot's instance
// colour carries the fade in its alpha (BatchedMesh per-instance colours: vColor.a in the shader) and a screen-door dither (interleaved gradient
// noise) keeps that share of the fragments. Opaque materials stay opaque: no blending, no sorting, the depth buffer as before.
// FADE.on = false (main.js: ?fade=0): no fades, no instance colours, and no dither in the pools' programs. A fragment shader that can discard
// keeps an Apple GPU's hidden-surface removal from rejecting its fragments before they are shaded, whether or not a fade is running.
export const FADE = { on: true };
export const FADE_GLSL = /* glsl */`
#ifdef USE_BATCHING_COLOR
  if ( vColor.a < 0.999 ) { float klcFz = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) ); if ( klcFz >= vColor.a ) discard; }
#endif`;
export function batchedView(m) {
  let v = _views.get(m);
  if (!v) {
    v = Object.create(m);
    const base = m.onBeforeCompile, key = m.customProgramCacheKey;
    if (FADE.on) {
      v.onBeforeCompile = function (sh, r) { base.call(this, sh, r); sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>' + FADE_GLSL); };
      v.customProgramCacheKey = function () { return key.call(this) + '|fade'; };
    }
    _views.set(m, v);
  }
  return v;
}
const _c4 = new THREE.Vector4();

/** One BatchedMesh per material + render flags; its instances are slots (a kit tile, or a block of coarse tiles). */
class Pool {
  constructor(root, proto, material, name, mark) {
    this.material = material; this.mark = mark;   // mark(pool, slot): queue a slot for a rebuild (StreamBatch's FIFO)
    // (a second chunk of a kind starts at half a chunk: that kind is known to fill one, so it grows once at most instead of five times)
    this.verts = nextCap(proto.v * 3, proto.chunk ? CHUNK_V >> 1 : 1 << 14); this.index = nextCap(proto.i * 3, proto.chunk ? CHUNK_V : 1 << 15); this.inst = proto.chunk ? 64 : 32;
    const bm = new THREE.BatchedMesh(this.inst, this.verts, this.index, material);
    // no per-instance culling inside three (it re-uploads the draw list once per pool per render pass); the slots are
    // culled once a frame by StreamBatch.cull instead
    bm.name = name; bm.frustumCulled = false; bm.perObjectFrustumCulled = false; bm.sortObjects = false;
    bm.castShadow = proto.cast; bm.receiveShadow = proto.receive; bm.layers.mask = proto.mask; bm.renderOrder = proto.order;
    bm.userData.noBatch = true; bm.userData.dynamic = true;
    this.bm = bm; this.slots = new Map(); this.liveV = 0; this.liveI = 0; this.used = 0; this.optimized = 0; this.grown = 0;
    this.partsV = 0;   // [smooth] the vertices of every part it holds, drawn or not (StreamBatch.add opens a new chunk past CHUNK_V)
    root.add(bm);
  }
  slot(key) { let s = this.slots.get(key); if (!s) this.slots.set(key, (s = { key, parts: new Map(), gid: -1, iid: -1, resV: 0, resI: 0, v: 0, i: 0, sphere: null, culled: false, shown: false })); return s; }
  addPart(slotKey, entryKey, geo, visible) { const s = this.slot(slotKey), old = s.parts.get(entryKey); if (old) this.partsV -= old.geo.attributes.position.count; s.parts.set(entryKey, { geo, visible }); this.partsV += geo.attributes.position.count; this.mark(this, s); }
  removePart(slotKey, entryKey) { const s = this.slots.get(slotKey), p = s?.parts.get(entryKey); if (p && s.parts.delete(entryKey)) { this.partsV -= p.geo.attributes.position.count; this.mark(this, s); } }
  setPartVisible(slotKey, entryKey, v) { const s = this.slots.get(slotKey), p = s?.parts.get(entryKey); if (p && p.visible !== v) { p.visible = v; this.mark(this, s); } }
  /** [mobile-perf] A slot's fade (0 hidden .. 1 whole), kept for its next instance. */
  setFade(slotKey, a) { const s = this.slots.get(slotKey); if (!s || !FADE.on) return; s.fadeA = a; if (s.iid >= 0) this.bm.setColorAt(s.iid, _c4.set(1, 1, 1, a)); }
  /** [mobile-perf] Nothing left in it (every tile that used it unloaded). */
  get empty() { return this.slots.size === 0 && this.partsV === 0; }
  /** [mobile-perf] Far below its capacity: its buffers grew for a place the session has left. */
  get slack() { return this.verts > (1 << 15) && this.liveV < this.verts * 0.3 && this.liveI < this.index * 0.3; }
  /** [mobile-perf] Compact and shrink the buffers to what is live, with room to grow (a copy and one upload of the smaller buffers). */
  shrink() {
    const bm = this.bm;
    bm.optimize(); this.optimized++;
    const v = Math.max(1 << 14, Math.ceil(this.liveV * 1.5), bm._nextVertexStart), i = Math.max(1 << 15, Math.ceil(this.liveI * 1.5), bm._nextIndexStart);
    if (v >= this.verts && i >= this.index) return false;
    bm.setGeometrySize(Math.min(v, this.verts), Math.min(i, this.index));
    this.verts = Math.min(v, this.verts); this.index = Math.min(i, this.index); this.shrunk = (this.shrunk || 0) + 1;
    return true;
  }
  /** [mobile-perf] Free the BatchedMesh (its buffers, its data textures); the shared material stays. */
  dispose() { this.bm.removeFromParent(); this.bm.dispose(); this.slots.clear(); }
  _ensure(nv, ni) {
    const bm = this.bm;
    const fits = () => bm._nextVertexStart + nv <= this.verts && bm._nextIndexStart + ni <= this.index;
    if (fits()) return;
    // reclaim the holes first. three's optimize() keeps every geometry id and moves index and vertex ranges in lockstep
    // (the slots keep gid / resV / resI, which stay valid); StreamBatch.validate() checks the result in qa3
    if (bm._nextVertexStart > this.liveV * 1.1 || bm._nextIndexStart > this.liveI * 1.1) { bm.optimize(); this.optimized++; }
    if (fits()) return;
    this.grown++;
    this.verts = nextCap(bm._nextVertexStart + nv * 2, this.verts); this.index = nextCap(bm._nextIndexStart + ni * 2, this.index);
    bm.setGeometrySize(this.verts, this.index);
  }
  _drop(s) {
    if (s.gid < 0) return;
    this.bm.deleteGeometry(s.gid); this.liveV -= s.resV; this.liveI -= s.resI; this.used--;
    s.gid = s.iid = -1; s.resV = s.resI = 0; s.shown = false;
  }
  /** Rebuild a slot from its visible parts (a block: concatenated; a single part: as it is). */
  rebuild(s, headroom) {
    if (!s.parts.size) { this._drop(s); this.slots.delete(s.key); return; }
    const geos = []; for (const p of s.parts.values()) if (p.visible) geos.push(p.geo);
    if (!geos.length) { if (s.iid >= 0 && s.shown) { this.bm.setVisibleAt(s.iid, false); s.shown = false; } s.v = s.i = 0; return; }
    const g = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    const nv = g.attributes.position.count, ni = g.index.count;
    if (s.gid >= 0 && nv <= s.resV && ni <= s.resI) this.bm.setGeometryAt(s.gid, g);
    else {
      this._drop(s);
      const rv = Math.ceil(nv * headroom), ri = Math.ceil(ni * headroom);
      this._ensure(rv, ri);
      if (this.used + 1 >= this.inst) { this.inst *= 2; this.bm.setInstanceCount(this.inst); }
      s.gid = this.bm.addGeometry(g, rv, ri); s.iid = this.bm.addInstance(s.gid);
      if (FADE.on) this.bm.setColorAt(s.iid, _c4.set(1, 1, 1, s.fadeA ?? 1));   // [mobile-perf] the slot's fade (1: opaque)
      if (this.onFirst) { const f = this.onFirst; this.onFirst = null; f(); }   // [smooth] its geometry has its attributes now: compile ahead (StreamBatch._warm)
      s.resV = rv; s.resI = ri; this.liveV += rv; this.liveI += ri; this.used++; s.shown = true;
    }
    if (!g.boundingSphere) g.computeBoundingSphere();
    s.sphere = g.boundingSphere.clone(); s.v = nv; s.i = ni;
    const on = !s.culled;
    if (s.shown !== on) { this.bm.setVisibleAt(s.iid, on); s.shown = on; }
  }
  cull(test) {
    let n = 0;
    for (const s of this.slots.values()) {
      if (s.iid < 0 || !s.sphere || !s.v) continue;
      const c = test ? test(s.sphere) : false;
      if (c !== s.culled) { s.culled = c; n++; }
      if (s.shown === !c) continue;
      this.bm.setVisibleAt(s.iid, !c); s.shown = !c;
    }
    return n;
  }
}

/** Plain meshes of one custom material, merged across the loaded tiles; rebuilt on change. */
class Merged {
  constructor(root, o, name) {
    this.root = root; this.items = new Map(); this.dirty = false; this.name = name;
    const m = new THREE.Mesh(new THREE.BufferGeometry(), o.material);
    m.customDepthMaterial = o.customDepthMaterial; m.castShadow = o.castShadow; m.receiveShadow = o.receiveShadow;
    m.layers.mask = o.layers.mask; m.renderOrder = o.renderOrder; m.frustumCulled = false; m.name = name;
    m.userData.noBatch = true; m.userData.dynamic = true; m.visible = false;
    this.mesh = m; root.add(m);
  }
  add(key, geo, visible) { let a = this.items.get(key); if (!a) this.items.set(key, (a = { geos: [], visible })); a.geos.push(geo); this.dirty = true; }
  remove(key) { if (this.items.delete(key)) this.dirty = true; }
  setVisible(key, v) { const a = this.items.get(key); if (a && a.visible !== v) { a.visible = v; this.dirty = true; } }
  flush() {
    if (!this.dirty) return false;
    this.dirty = false;
    const geos = []; for (const a of this.items.values()) if (a.visible) geos.push(...a.geos);
    const old = this.mesh.geometry;
    this.mesh.geometry = geos.length ? (geos.length === 1 ? geos[0].clone() : mergeGeometries(geos, false) || new THREE.BufferGeometry()) : new THREE.BufferGeometry();
    this.mesh.geometry.computeBoundingSphere();
    this.mesh.userData.wantVisible = geos.length > 0;
    if (geos.length && this.onFirst) { const f = this.onFirst; this.onFirst = null; f(); }   // [smooth] compile ahead now that it has its attributes
    this.mesh.visible = geos.length > 0 && !this.mesh.userData.warming;   // [smooth] held back while its program compiles (StreamBatch._warm)
    old.dispose();
    return true;
  }
  get verts() { let n = 0; for (const a of this.items.values()) for (const g of a.geos) n += g.attributes.position.count; return n; }
}

export class StreamBatch {
  constructor(ctx, { name = 'explore-stream' } = {}) {
    this.ctx = ctx;
    this.root = new THREE.Group(); this.root.name = name;
    this.root.userData.noBatch = true;
    ctx.add(this.root);
    this.pools = new Map(); this.merged = new Map(); this.shared = new Map();
    this.open = new Map(); this.chunks = new Map();   // [smooth] signature -> the key of its open chunk / how many chunks it has
    this.entries = new Map();   // key -> { slot, pools: Set, merged: Set, holder, visible, verts }
    // [v4:polish3] one FIFO of slots to rebuild across every pool, tagged with the change (op) that dirtied them first.
    // flush() under a time budget only stops between ops, so the pools of one change (a tile's kit shown and its
    // simplified buildings hidden, see group()) flip in the same frame. Iterating pool by pool starved the later pools
    // after a teleport (qa3's walk loop): walls stayed hidden while their windows and balconies were already drawn.
    this.queue = new Map(); this.op = 0; this.grouping = 0;
    // A slot dirtied again by a later change moves to that change (it will show both at once, never the later one early).
    this._mark = (pool, s) => { const q = this.queue.get(s); if (q && q.op === this.op) return; if (q) this.queue.delete(s); this.queue.set(s, { pool, op: this.op }); };
    this.name = name;
    this.lastCull = null;
    this.trimEvery = 30; this._trimTick = 0; this.trimmed = { freed: 0, shrunk: 0 };   // [mobile-perf] trim(): about twice a second at 60 fps
    this._fading = new Set(); this.fadeMs = 350;   // [mobile-perf] fade(): entries mid-fade; 0 ms (shot mode, settle) applies the end at once
  }
  has(key) { return this.entries.has(key); }
  /** [smooth] A new pool (a material the streamed tiles had not used yet) is held back until its program is compiled, off the main thread
   *  (renderer.compileAsync, KHR_parallel_shader_compile): drawn at once, its first frame stalled while the driver compiled it (the drive's
   *  runtime compiles in docs/perf/BASELINE.md). The tile's other parts show as before; this material's part a few frames later. */
  _warm(obj) {
    const r = this.ctx?.renderer, cam = this.ctx?.camera, scene = this.ctx?.scene;
    if (!this.warmNew || !r || typeof r.compileAsync !== 'function' || !cam || !scene) return;   // (main.js turns it on after the load: the load compiles everything itself)
    obj.userData.warming = true;
    const was = obj.visible; obj.visible = false;
    const done = () => { if (!obj.userData.warming) return; obj.userData.warming = false; if (obj.isBatchedMesh) obj.visible = was; else obj.visible = obj.userData.wantVisible ?? false; };
    const prevRT = r.getRenderTarget?.() ?? null, rt = this.ctx.pipeline?.targets?.rtColor ?? null;
    try {
      obj.visible = true;   // (compile only looks at objects that would be drawn)
      // the colour pass draws into the linear HDR target: compiled against the canvas (sRGB output) it would be another program, unused
      if (rt) r.setRenderTarget(rt);
      const pr = r.compileAsync(obj, cam, scene);
      if (rt) r.setRenderTarget(prevRT);
      obj.visible = false;
      Promise.race([pr, new Promise((res) => setTimeout(res, 3000))]).then(done, done);   // never held back more than 3 s
    } catch (e) { done(); }
  }
  /** Run fn() as one change: every slot it dirties is rebuilt in the same flush. */
  group(fn) { if (!this.grouping) this.op++; this.grouping++; try { return fn(); } finally { this.grouping--; } }
  _next() { if (!this.grouping) this.op++; }

  /** The shared material and world-space geometry a mesh goes into its pool with (colour baked where foldable). */
  _convert(o) {
    const m = o.material, mat = this.ctx.mat;
    let target = m, bake = null;
    if (mat && convertible(m)) {
      let sig;
      if (m.isMeshToonMaterial) { const t = m.userData.toon; sig = `T|${m.map ? m.map.uuid : 'none'}|${sideName(m)}|${m.transparent}|${m.opacity}|${m.alphaTest}|${m.depthWrite}|${t.paint}|${t.grime}|${t.polygonOffset}|${t.noDormant ? 'nd' : ''}|${m.emissive.getHexString()}|${m.emissiveIntensity}`; }
      else sig = `B|${m.map ? m.map.uuid : 'none'}|${sideName(m)}|${m.transparent}|${m.opacity}|${m.alphaTest}|${m.depthWrite}|${m.fog}|${m.toneMapped}`;
      let sm = this.shared.get(sig);
      if (!sm) {
        const common = { map: m.map || null, transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest, depthWrite: m.depthWrite, vertexColors: true };
        const side = sideName(m); if (side !== 'front') common.side = side;
        if (m.isMeshToonMaterial) {
          const t = m.userData.toon, opts = { ...common, paint: t.paint, grime: t.grime };
          if (t.noDormant) opts.noDormant = true;   // [r3:7]
          if (t.polygonOffset) opts.polygonOffset = t.polygonOffset;
          if (m.emissive && (m.emissive.r || m.emissive.g || m.emissive.b)) { opts.emissive = '#' + m.emissive.getHexString(); opts.emissiveIntensity = m.emissiveIntensity; }
          sm = mat.toon('#ffffff', opts);
        } else sm = new THREE.MeshBasicMaterial({ color: 0xffffff, map: m.map || null, transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest, depthWrite: m.depthWrite, side: m.side, fog: m.fog, toneMapped: m.toneMapped, vertexColors: true });
        this.shared.set(sig, sm);
      }
      if (m.userData.acc) sm.userData.acc = m.userData.acc;
      target = sm; bake = m.color;
    }
    const g = o.geometry.clone();
    const n = g.attributes.position.count;
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    if (target !== m) {
      const src = g.attributes.color, useSrc = src && m.vertexColors;
      const a = new Float32Array(n * 3), br = bake.r, bg = bake.g, bb = bake.b;
      for (let i = 0; i < n; i++) { a[i * 3] = (useSrc ? src.getX(i) : 1) * br; a[i * 3 + 1] = (useSrc ? src.getY(i) : 1) * bg; a[i * 3 + 2] = (useSrc ? src.getZ(i) : 1) * bb; }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'color') g.deleteAttribute(k);
    }
    for (const k of Object.keys(g.attributes)) {
      const at = g.attributes[k];
      if (at.normalized || !(at.array instanceof Float32Array)) { const a = new Float32Array(at.count * at.itemSize); for (let i = 0; i < at.count; i++) for (let j = 0; j < at.itemSize; j++) a[i * at.itemSize + j] = at.getComponent(i, j); g.setAttribute(k, new THREE.BufferAttribute(a, at.itemSize)); }
    }
    if (!g.index) { const idx = new Uint32Array(n); for (let i = 0; i < n; i++) idx[i] = i; g.setIndex(new THREE.BufferAttribute(idx, 1)); }
    g.clearGroups(); g.morphAttributes = {};
    if (!o.matrixWorld.equals(IDENTITY)) {
      g.applyMatrix4(o.matrixWorld);
      if (o.matrixWorld.determinant() < 0) { const ia = g.index.array; for (let i = 0; i < ia.length; i += 3) { const t = ia[i + 1]; ia[i + 1] = ia[i + 2]; ia[i + 2] = t; } }
    }
    return { material: target, geometry: g };
  }
  /** Merge key of a custom-shader mesh (null: keep it as it is). World-space meshes only. */
  _mergeKey(o) {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.matrixWorld.equals(IDENTITY) || Array.isArray(o.material) || !o.geometry?.attributes?.position) return null;
    const m = o.material;
    let mk;
    if (o.name === 'wires') mk = 'wires';
    else if (!m.isShaderMaterial && m.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey) mk = 'ck:' + m.type + '|' + m.customProgramCacheKey() + '|' + (m.map?.uuid || '') + '|' + m.alphaTest + '|' + m.side;
    else mk = m.uuid;
    return [mk, o.castShadow ? 1 : 0, o.receiveShadow ? 1 : 0, o.layers.mask, o.renderOrder | 0, o.geometry.index ? 'i' : 'n', attrSig(o.geometry)].join('|');
  }

  /** Pack every mesh of `group` under entry `key`; `slot` groups coarse entries into one instance per pool. */
  add(key, group, { visible = true, slot = null } = {}) {
    this._next();
    if (this.entries.has(key)) this.remove(key);
    group.updateMatrixWorld(true);
    const bySig = new Map(), byMerge = new Map(), keep = [];
    group.traverse((o) => {
      if ((!o.isMesh && !o.isLine && !o.isPoints) || o.visible === false) return;
      for (let p = o.parent; p && p !== group; p = p.parent) if (p.visible === false) return;
      if (packable(o)) {
        const c = this._convert(o);
        const sig = [c.material.uuid, o.castShadow ? 1 : 0, o.receiveShadow ? 1 : 0, o.layers.mask, o.renderOrder | 0, attrSig(c.geometry)].join('|');
        let b = bySig.get(sig); if (!b) bySig.set(sig, (b = { o, material: c.material, geos: [] }));
        b.geos.push(c.geometry);
        return;
      }
      const mk = this._mergeKey(o);
      if (mk) { let b = byMerge.get(mk); if (!b) byMerge.set(mk, (b = { o, geos: [] })); b.geos.push(o.geometry); return; }
      keep.push(o);
    });
    const e = { key, slot: slot || key, pools: new Set(), merged: new Set(), holder: null, visible, verts: 0 };
    for (const [sig, b] of bySig) {
      const geo = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false);
      if (!geo) continue;
      // [smooth] chunks: a pool past CHUNK_V vertices is full and the next part of this kind opens a new one. Growing a pool copies and
      // re-uploads all of it (three's setGeometrySize, optimize): the drive's 20-50 ms 'batching' stalls were one pool growing to 700 k
      // vertices; capped, the largest copy is CHUNK_V. (One more draw per chunk and pass.)
      const nv = geo.attributes.position.count;
      let pk = this.open.get(sig) || sig, pool = this.pools.get(pk);
      if (pool && pool.partsV > 0 && pool.partsV + nv > CHUNK_V) { const n = (this.chunks.get(sig) || 0) + 1; this.chunks.set(sig, n); pk = sig + '#' + n; this.open.set(sig, pk); pool = null; }
      if (!pool) { pool = new Pool(this.root, { chunk: pk !== sig, v: geo.attributes.position.count, i: geo.index.count, cast: b.o.castShadow, receive: b.o.receiveShadow, mask: b.o.layers.mask, order: b.o.renderOrder | 0 }, batchedView(b.material), this.name + ':' + (b.material.name || b.o.name || ''), this._mark); this.pools.set(pk, pool); pool.onFirst = () => this._warm(pool.bm); }   // (after its first geometry: an empty BatchedMesh has no normals yet, another program)
      pool.addPart(e.slot, key, geo, visible);
      e.pools.add(pool); e.verts += geo.attributes.position.count;
    }
    for (const [mk, b] of byMerge) {
      let mg = this.merged.get(mk);
      if (!mg) { mg = new Merged(this.root, b.o, this.name + ':' + (b.o.name || b.o.material.name || 'custom')); this.merged.set(mk, mg); mg.onFirst = () => this._warm(mg.mesh); }   // (after its first geometry, as for a pool)
      for (const g of b.geos) { mg.add(key, g, visible); e.verts += g.attributes.position.count; }
      e.merged.add(mg);
    }
    if (keep.length) {
      const h = new THREE.Group(); h.name = this.name + ':' + key;
      for (const o of keep) h.attach(o);
      h.visible = visible;
      this.root.add(h); e.holder = h;
    }
    this.entries.set(key, e);
    return { packed: bySig.size, merged: byMerge.size, kept: keep.length, verts: e.verts };
  }
  setVisible(key, v) {
    const e = this.entries.get(key); if (!e || e.visible === v) return;
    this._next();
    e.visible = v;
    for (const p of e.pools) p.setPartVisible(e.slot, key, v);
    for (const m of e.merged) m.setVisible(key, v);
    if (e.holder) e.holder.visible = v;
  }
  remove(key) {
    const e = this.entries.get(key); if (!e) return;
    this._next();
    if (e.fade) { e.fade = null; this._fading.delete(key); }   // [mobile-perf] a fade's end never runs for a removed entry
    for (const p of e.pools) p.removePart(e.slot, key);
    for (const m of e.merged) m.remove(key);
    // kept meshes: free their GPU buffers (a geometry shared with the static town is simply uploaded again when drawn)
    if (e.holder) { e.holder.traverse((o) => { o.geometry?.dispose?.(); if (o.isInstancedMesh) o.dispose?.(); }); e.holder.removeFromParent(); }
    this.entries.delete(key);
  }
  /** [mobile-perf] Fade an entry with a slot of its own (a kit tile) from `from` to `to` (0 hidden, 1 whole) over `ms` (default fadeMs), then
   *  call `done`. Its pool parts fade by dither; its merged parts (lit windows, wires) and kept meshes show at the end of a fade in and go at
   *  the start of a fade out. An entry in a shared block slot cannot fade: its end is applied at once. -> true when a fade started */
  fade(key, from, to, done = null, ms = this.fadeMs) {
    const e = this.entries.get(key);
    if (!e) { done?.(); return false; }
    if (e.fade) { e.fade = null; this._fading.delete(key); }
    const own = e.slot === key;
    if (!(ms > 0) || !own || !FADE.on) { this._applyFade(e, to); done?.(); return false; }
    this._applyFade(e, from);
    e.fade = { from, to, t0: performance.now(), ms, done };
    this._fading.add(key);
    return true;
  }
  _applyFade(e, a) {
    for (const p of e.pools) p.setFade(e.slot, a);
    const whole = a >= 0.999;
    for (const m of e.merged) m.setVisible(e.key, whole && e.visible);
    if (e.holder) e.holder.visible = whole && e.visible;
    e.fadeA = a;
  }
  /** Advance the fades (flush runs it every frame). */
  tickFades(now = performance.now()) {
    for (const key of this._fading) {
      const e = this.entries.get(key), f = e?.fade;
      if (!f) { this._fading.delete(key); continue; }
      const u = Math.min(1, Math.max(0, (now - f.t0) / f.ms));
      this._applyFade(e, f.from + (f.to - f.from) * u);
      if (u >= 1) { this._fading.delete(key); e.fade = null; f.done?.(); }
    }
  }
  /** Rebuild the slots and merged meshes that changed (within `budget` ms; the rest waits for the next frame); keep
   *  the wires' screen size current. -> slots still dirty */
  flush(size = null, budget = Infinity) {
    const t0 = performance.now();
    if (this._fading.size) this.tickFades(t0);   // [mobile-perf]
    let op = null;
    for (const [s, q] of this.queue) {
      // over budget: stop, but only between two changes (never half a change drawn)
      if (op !== null && q.op !== op && performance.now() - t0 > budget) break;
      op = q.op;
      this.queue.delete(s);
      q.pool.rebuild(s, s.parts.size > 1 ? 1.3 : 1.0);
    }
    const left = this.queue.size;
    for (const m of this.merged.values()) { m.flush(); if (size && m.mesh.material.uniforms?.uRes) m.mesh.material.uniforms.uRes.value.set(size.x, size.y); }
    if (++this._trimTick >= this.trimEvery) { this._trimTick = 0; this.trim(left ? new Set([...this.queue.values()].map((q) => q.pool)) : null); }   // [mobile-perf] (a pool with a rebuild waiting is left for the next round)
    if (this.lastCull) this._cull(this.lastCull.camera, this.lastCull.keep);
    return left;
  }
  /** [mobile-perf] Give back the memory of places the session has left. A pool's buffers only ever grew, and a pool emptied by unloads stayed
   *  allocated: a 3-minute phone roam took the stream from 9 pools / 0.57 M vertices of capacity to 80 / 3.45 M (live: 0.29 M), ~150 MB on the
   *  GPU and twice that in CPU copies. Now an empty pool is freed and one under 30 % full is compacted to 1.5 x what it holds (one a call).
   *  flush() runs it every `trimEvery` calls, leaving out the pools a waiting rebuild will touch (busy). -> { freed, shrunk } */
  trim(busy = null) {
    let freed = 0, shrunk = 0;
    for (const [k, p] of this.pools) {
      if (busy && busy.has(p)) continue;
      if (p.empty) {
        p.dispose(); this.pools.delete(k); freed++;
        for (const [sig, ok] of this.open) if (ok === k) this.open.delete(sig);
        continue;
      }
      if (!shrunk && p.slack) { try { if (p.shrink()) shrunk++; } catch (e) { console.warn('[sbatch] shrink', e); } }
    }
    this.trimmed.freed += freed; this.trimmed.shrunk += shrunk;
    return { freed, shrunk };
  }
  /** View culling per slot, once a frame for the main camera: a slot wholly outside the view frustum and farther than
   *  `keep` m (it could still throw a shadow into the view closer in) is left out of every pass. camera = null shows
   *  everything again (the tiny planet looks every way at once). -> slots whose state changed */
  cull(camera, keep = 90) { this.lastCull = camera ? { camera, keep } : null; return this._cull(camera, keep); }
  _cull(camera, keep) {
    let test = null;
    if (camera) {
      camera.updateMatrixWorld(); _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); _fr.setFromProjectionMatrix(_pm); _cp.setFromMatrixPosition(camera.matrixWorld);
      test = (sp) => !_fr.intersectsSphere(sp) && sp.distanceToPoint(_cp) > keep;
    }
    let n = 0; for (const p of this.pools.values()) n += p.cull(test);
    return n;
  }
  /** [v4:polish3] Integrity check (diagnostics, qa3): every drawn slot's index range points inside its own vertex range,
   *  no two live slots overlap in the batch buffers, and a single-part slot's vertices still equal its source geometry.
   *  -> { pools, slots, bad: [{ pool, slot, why }] } */
  validate() {
    const bad = []; let slots = 0;
    for (const p of this.pools.values()) {
      const bm = p.bm, G = bm.geometry, idx = G.index?.array, pos = G.attributes.position?.array, infos = bm._geometryInfo;
      const ranges = [];
      for (const s of p.slots.values()) {
        if (s.gid < 0) continue;
        slots++;
        const gi = infos[s.gid];
        if (!gi || !gi.active) { bad.push({ pool: bm.name, slot: s.key, why: 'inactive geometry' }); continue; }
        ranges.push([gi.vertexStart, gi.vertexStart + gi.reservedVertexCount, gi.indexStart, gi.indexStart + gi.reservedIndexCount, s.key]);
        if (!s.v) continue;
        if (gi.vertexCount !== s.v || gi.indexCount !== s.i) { bad.push({ pool: bm.name, slot: s.key, why: `counts ${gi.vertexCount}/${gi.indexCount} != ${s.v}/${s.i}` }); continue; }
        let oob = 0;
        for (let j = gi.indexStart, e = gi.indexStart + gi.indexCount; j < e; j++) { const v = idx[j]; if (v < gi.vertexStart || v >= gi.vertexStart + gi.vertexCount) oob++; }
        if (oob) { bad.push({ pool: bm.name, slot: s.key, why: `${oob} indices outside the slot's vertices` }); continue; }
        const vis = [...s.parts.values()].filter((q) => q.visible);
        if (vis.length === 1) {
          const src = vis[0].geo.attributes.position.array; let diff = 0;
          for (let j = 0; j < src.length; j += 7) if (Math.abs(src[j] - pos[gi.vertexStart * 3 + j]) > 1e-3) diff++;
          if (diff) bad.push({ pool: bm.name, slot: s.key, why: `${diff} vertices differ from the source` });
        }
      }
      ranges.sort((a, b) => a[0] - b[0]);
      for (let k = 1; k < ranges.length; k++) if (ranges[k][0] < ranges[k - 1][1]) bad.push({ pool: bm.name, slot: ranges[k][4], why: `vertex range overlaps ${ranges[k - 1][4]}` });
      ranges.sort((a, b) => a[2] - b[2]);
      for (let k = 1; k < ranges.length; k++) if (ranges[k][2] < ranges[k - 1][3]) bad.push({ pool: bm.name, slot: ranges[k][4], why: `index range overlaps ${ranges[k - 1][4]}` });
    }
    return { pools: this.pools.size, slots, bad: bad.slice(0, 20), nBad: bad.length };
  }
  /** Slots waiting for a rebuild (diagnostics). */
  pending() { return this.queue.size; }
  /** Per-pool detail (diagnostics). */
  pools_() {
    return [...this.pools.values()].map((p) => ({ name: p.bm.name, type: p.material.type, map: !!p.material.map, tr: !!p.material.transparent, cast: p.bm.castShadow, layer: p.bm.layers.mask, v: p.liveV, slots: p.slots.size, shown: [...p.slots.values()].filter((s) => s.shown).length }))
      .concat([...this.merged.values()].map((m) => ({ name: m.name, type: 'merged:' + m.mesh.material.type, v: m.verts, slots: m.items.size, shown: m.mesh.visible ? 1 : 0 })));
  }
  stats() {
    let verts = 0, cap = 0, holders = 0, slots = 0, shown = 0, optimized = 0, grown = 0;
    for (const p of this.pools.values()) { cap += p.verts; optimized += p.optimized; grown += p.grown; for (const s of p.slots.values()) { verts += s.v; slots++; if (s.shown) shown++; } }
    for (const m of this.merged.values()) verts += m.verts;
    for (const e of this.entries.values()) if (e.holder) holders += e.holder.children.length;
    return { pools: this.pools.size, merged: this.merged.size, entries: this.entries.size, slots, shown, verts, capacity: cap, holders, optimized, grown, pending: this.queue.size, freed: this.trimmed.freed, shrunk: this.trimmed.shrunk };
  }
}
