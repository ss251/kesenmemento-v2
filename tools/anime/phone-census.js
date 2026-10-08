// [mobile-perf] The phone census, page side: what the page holds on the GPU and in the JS engine, measured where it is allocated.
//
// INSTRUMENT runs before any page script (Page.addScriptToEvaluateOnNewDocument). It wraps the WebGL2 calls that allocate and free GPU memory
// (bufferData, texStorage*, texImage*, renderbufferStorage*, their deletes, createProgram / deleteProgram) and keeps live totals, so the
// figures are the bytes the GPU process really holds for the page: every buffer once (the outline / shadow proxies share the colour
// cells' buffers), BatchedMesh capacity included, a disposed buffer gone. On an iPhone those allocations are charged to the tab
// (WebKit attributes the GPU process's Metal buffers and textures to the web content process), which is what "A problem repeatedly
// occurred" counts.
//
// CENSUS (an expression, after the page is up) returns those totals, the JS heap, the typed arrays still held on the CPU, the programs,
// and where the bytes are in the scene: by group (two levels: the top groups and the modules under staticRoot / dynamicRoot) and, for
// the static town, by attribute. The older figure (.diag/mem.mjs: count x itemSize x element size per geometry, shared attributes
// counted once per geometry that uses them) is kept as `legacyGeoMB`, so a number can be compared with the brief's table.
//
// Used by tools/anime/phone-budget.mjs (the gate).

/** The phone budgets (the conductor's brief, 2026-10-08): JS heap after GC, GPU buffers, textures incl. render targets (MB), programs at start,
 *  and the growth allowed over the scripted session. tools/anime/phone-budget.mjs fails over any of them. */
export const BUDGET = { heapMB: 260, geoMB: 280, texMB: 200, programsStart: 140, growth: 0.10 };

export const INSTRUMENT = `(() => {
  if (window.__glc || typeof WebGL2RenderingContext === 'undefined') return;
  const C = window.__glc = { buf: new Map(), tex: new Map(), rb: new Map(), prog: new Set(), bufBytes: 0, texBytes: 0, rbBytes: 0, peak: 0, links: 0, created: 0 };
  const S = new WeakMap();
  const st = (gl) => { let s = S.get(gl); if (!s) S.set(gl, (s = { bb: new Map(), unit: 0x84C0, tb: new Map(), rb: null })); return s; };
  const P = WebGL2RenderingContext.prototype;
  const wrap = (name, fn) => { const orig = P[name]; if (typeof orig !== 'function') return; P[name] = function (...a) { return fn.call(this, orig, a); }; };
  const bump = () => { const t = C.bufBytes + C.texBytes + C.rbBytes; if (t > C.peak) C.peak = t; };
  // bytes per texel of a sized internal format (unsized: from the type)
  const BPP = { 0x8058: 4, 0x8C43: 4, 0x8051: 4, 0x8C41: 4, 0x881A: 8, 0x8814: 16, 0x881B: 8, 0x8815: 16, 0x8229: 1, 0x822B: 2, 0x822D: 2, 0x822E: 4, 0x822F: 4, 0x8230: 8,
    0x81A5: 2, 0x81A6: 4, 0x8CAC: 4, 0x88F0: 4, 0x8CAD: 8, 0x8C3A: 4, 0x8C3D: 4, 0x8059: 4, 0x8D62: 2, 0x8056: 2, 0x8057: 2, 0x8D7C: 4, 0x8D70: 16, 0x8D82: 4, 0x8D94: 4, 0x8D8E: 4, 0x8D88: 4, 0x8231: 1, 0x8232: 1, 0x8233: 2, 0x8234: 2, 0x8235: 4, 0x8236: 4, 0x8237: 2, 0x8238: 2, 0x8239: 4, 0x823A: 4, 0x823B: 8, 0x823C: 8 };
  const unsized = (fmt, type) => { const ch = fmt === 0x1908 ? 4 : fmt === 0x1907 ? 4 : fmt === 0x1909 || fmt === 0x1906 || fmt === 0x1903 ? 1 : fmt === 0x190A ? 2 : 4; const el = type === 0x1406 ? 4 : type === 0x140B || type === 0x8D61 ? 2 : 1; return ch * el; };
  const bpp = (ifmt, type) => BPP[ifmt] || unsized(ifmt, type);
  const faceOf = (t) => (t >= 0x8515 && t <= 0x851A ? 0x8513 : t);
  // ---- buffers
  wrap('bindBuffer', function (o, a) { st(this).bb.set(a[0], a[1]); return o.apply(this, a); });
  wrap('bufferData', function (o, a) {
    const r = o.apply(this, a); const b = st(this).bb.get(a[0]); if (!b) return r;
    const x = a[1]; let n = 0;
    if (typeof x === 'number') n = x;
    else if (x && ArrayBuffer.isView(x)) { const el = x.BYTES_PER_ELEMENT || 1; n = a.length > 4 && a[4] ? a[4] * el : x.byteLength - (a[3] || 0) * el; }
    else if (x && x.byteLength !== undefined) n = x.byteLength;
    C.bufBytes += n - (C.buf.get(b)?.n || 0); C.buf.set(b, { n, t: a[0] }); bump(); return r;
  });
  wrap('deleteBuffer', function (o, a) { const e = C.buf.get(a[0]); if (e) { C.bufBytes -= e.n; C.buf.delete(a[0]); } return o.apply(this, a); });
  // ---- textures
  wrap('activeTexture', function (o, a) { st(this).unit = a[0]; return o.apply(this, a); });
  wrap('bindTexture', function (o, a) { const s = st(this); s.tb.set(s.unit + ':' + a[0], a[1]); return o.apply(this, a); });
  const texOf = (gl, target) => { const s = st(gl); return s.tb.get(s.unit + ':' + faceOf(target)); };
  const setTex = (t, key, n, dim) => { if (!t) return; let e = C.tex.get(t); if (!e) C.tex.set(t, (e = { parts: new Map(), n: 0, dim: '' })); const old = e.parts.get(key) || 0; e.parts.set(key, n); e.n += n - old; C.texBytes += n - old; if (dim) e.dim = dim; bump(); };
  wrap('texStorage2D', function (o, a) { const [target, levels, ifmt, w, h] = a; let n = 0; for (let l = 0; l < levels; l++) n += Math.max(1, w >> l) * Math.max(1, h >> l) * bpp(ifmt); if (target === 0x8513) n *= 6; setTex(texOf(this, target), 'storage', n, w + 'x' + h + (target === 0x8513 ? 'x6' : '') + ' L' + levels + ' f' + ifmt.toString(16)); return o.apply(this, a); });
  wrap('texStorage3D', function (o, a) { const [target, levels, ifmt, w, h, d] = a; let n = 0; for (let l = 0; l < levels; l++) n += Math.max(1, w >> l) * Math.max(1, h >> l) * (target === 0x806F ? Math.max(1, d >> l) : d) * bpp(ifmt); setTex(texOf(this, target), 'storage', n, w + 'x' + h + 'x' + d + ' L' + levels + ' f' + ifmt.toString(16)); return o.apply(this, a); });
  wrap('texImage2D', function (o, a) {
    let w, h, ifmt = a[2], type;
    if (a.length >= 8 && typeof a[3] === 'number' && typeof a[4] === 'number') { w = a[3]; h = a[4]; type = a[7]; }
    else { const src = a[5]; type = a[4]; w = src?.videoWidth || src?.naturalWidth || src?.displayWidth || src?.width || 0; h = src?.videoHeight || src?.naturalHeight || src?.displayHeight || src?.height || 0; }
    setTex(texOf(this, a[0]), a[0] + ':' + a[1], w * h * bpp(ifmt, type), a[1] === 0 ? w + 'x' + h + ' img f' + ifmt.toString(16) : ''); return o.apply(this, a);
  });
  wrap('texImage3D', function (o, a) { const [target, level, ifmt, w, h, d] = a; setTex(texOf(this, target), target + ':' + level, w * h * d * bpp(ifmt, a[8])); return o.apply(this, a); });
  wrap('compressedTexImage2D', function (o, a) { const data = a[6]; setTex(texOf(this, a[0]), a[0] + ':' + a[1], typeof data === 'number' ? data : (data?.byteLength || 0)); return o.apply(this, a); });
  wrap('generateMipmap', function (o, a) { const t = texOf(this, a[0]); const e = t && C.tex.get(t); if (e && !e.parts.has('storage')) { let base = 0; for (const [k, v] of e.parts) if (k.endsWith(':0')) base += v; setTex(t, 'mips', Math.round(base / 3)); } return o.apply(this, a); });
  wrap('deleteTexture', function (o, a) { const e = C.tex.get(a[0]); if (e) { C.texBytes -= e.n; C.tex.delete(a[0]); } return o.apply(this, a); });
  // ---- renderbuffers
  wrap('bindRenderbuffer', function (o, a) { st(this).rb = a[1]; return o.apply(this, a); });
  const setRb = (gl, n) => { const b = st(gl).rb; if (!b) return; C.rbBytes += n - (C.rb.get(b) || 0); C.rb.set(b, n); bump(); };
  wrap('renderbufferStorage', function (o, a) { setRb(this, a[2] * a[3] * bpp(a[1])); return o.apply(this, a); });
  wrap('renderbufferStorageMultisample', function (o, a) { setRb(this, a[3] * a[4] * bpp(a[2]) * Math.max(1, a[1])); return o.apply(this, a); });
  wrap('deleteRenderbuffer', function (o, a) { const n = C.rb.get(a[0]); if (n !== undefined) { C.rbBytes -= n; C.rb.delete(a[0]); } return o.apply(this, a); });
  // ---- canvases and decoded images the page keeps (a WebKit tab pays for every canvas backing store and decoded image; Chrome's heap
  // figure has neither): weak references, summed at census time after a GC
  C.canvases = []; C.images = [];
  const cE = Document.prototype.createElement;
  Document.prototype.createElement = function (tag, o) { const el = cE.call(this, tag, o); const t = String(tag).toLowerCase(); if (t === 'canvas') C.canvases.push(new WeakRef(el)); else if (t === 'img') C.images.push(new WeakRef(el)); return el; };
  if (typeof OffscreenCanvas !== 'undefined') { const OC = OffscreenCanvas; window.OffscreenCanvas = function (w, h) { const c = new OC(w, h); C.canvases.push(new WeakRef(c)); return c; }; window.OffscreenCanvas.prototype = OC.prototype; }
  const IM = window.Image; window.Image = function (w, h) { const i = new IM(w, h); C.images.push(new WeakRef(i)); return i; }; window.Image.prototype = IM.prototype;
  if (typeof createImageBitmap === 'function') { const cib = window.createImageBitmap; window.createImageBitmap = function (...a) { return cib.apply(this, a).then((b) => { C.images.push(new WeakRef(b)); return b; }); }; }
  // ---- programs
  wrap('createProgram', function (o) { const p = o.call(this); C.prog.add(p); C.created++; return p; });
  wrap('deleteProgram', function (o, a) { C.prog.delete(a[0]); return o.apply(this, a); });
  wrap('linkProgram', function (o, a) { C.links++; return o.apply(this, a); });
})()`;

export const CENSUS = `(async () => {
  const MB = (n) => Math.round(n / 1e5) / 10;
  const ctx = window.__ctx, r = ctx.renderer, C = window.__glc;
  try { if (typeof gc === 'function') { gc(); gc(); } } catch (e) { /* no --expose-gc */ }
  await new Promise((res) => setTimeout(res, 300));
  const heap = performance.memory ? performance.memory.usedJSHeapSize : null;
  // ---- the scene: bytes by group and by attribute; every attribute (and interleaved buffer) once
  const seenA = new Set(), seenT = new Set();
  let cpuBytes = 0, legacy = 0;
  const elem = (a) => (a.array ? a.array.BYTES_PER_ELEMENT : (a.__gpuBytes && a.count ? a.__gpuBytes / (a.count * a.itemSize) : 4));
  const aBytes = (a) => { const src = a.isInterleavedBufferAttribute ? a.data : a; if (src.array) return src.array.byteLength; if (src.__gpuBytes) return src.__gpuBytes; return (src.count || 0) * (src.stride || a.itemSize || 1) * elem(a); };
  const leg = (g) => { let n = 0; const one = (a) => (a ? (a.count || 0) * (a.itemSize || 1) * ((a.array && a.array.BYTES_PER_ELEMENT) || (a.data && a.data.array && a.data.array.BYTES_PER_ELEMENT) || 4) : 0); for (const k in g.attributes) n += one(g.attributes[k]); if (g.index) n += one(g.index); return n; };
  const seenGL = new Set();
  const byAttr = {};
  function geoOf(o, sink) {
    const g = o.geometry; if (!g) return;
    if (!seenGL.has(g)) { seenGL.add(g); legacy += leg(g); }
    const list = Object.entries(g.attributes); if (g.index) list.push(['index', g.index]);
    if (o.isInstancedMesh) { list.push(['instanceMatrix', o.instanceMatrix]); if (o.instanceColor) list.push(['instanceColor', o.instanceColor]); }
    for (const [k, a] of list) {
      if (!a) continue; const key = a.isInterleavedBufferAttribute ? a.data : a; if (seenA.has(key)) continue; seenA.add(key);
      const n = aBytes(a); sink.bytes += n; if (key.array) cpuBytes += key.array.byteLength;
      if (sink.attrs) { const t = k + ':' + (a.array ? a.array.constructor.name.replace('Array', '') : 'rel') + 'x' + a.itemSize; sink.attrs[t] = (sink.attrs[t] || 0) + n; }
    }
  }
  const groups = [];
  const group = (o, name, depth) => {
    const sink = { name, bytes: 0, meshes: 0, tris: 0, attrs: depth === 2 && /^static-/.test(o.name) ? byAttr : null };
    o.traverse((x) => {
      geoOf(x, sink);
      if (x.isMesh || x.isLine || x.isPoints) { sink.meshes++; const g = x.geometry; if (g && g.attributes && g.attributes.position) sink.tris += ((g.index ? g.index.count : g.attributes.position.count) / 3) * (x.isInstancedMesh ? x.count : 1); }
    });
    groups.push({ name, mb: MB(sink.bytes), meshes: sink.meshes, mtris: Math.round(sink.tris / 1e4) / 100, depth });
  };
  for (const top of ctx.scene.children) {
    const nm = top.name || top.type;
    if (top === ctx.staticRoot || top === ctx.dynamicRoot) for (const c of [...top.children]) group(c, nm.slice(0, 8) + '/' + (c.name || c.type).slice(0, 34), 2);
    else group(top, nm.slice(0, 40), 1);
  }
  groups.sort((a, b) => b.mb - a.mb);
  // ---- textures reachable from the scene's materials (the brief's estimate: 4 B a texel, a third more for mips)
  let texEst = 0;
  const addTex = (t) => { if (!t || seenT.has(t)) return; seenT.add(t); const im = t.image; texEst += (im?.width || 0) * (im?.height || 0) * (im?.depth || 1) * 4 * (t.generateMipmaps !== false ? 1.33 : 1); };
  ctx.scene.traverse((o) => { const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const m of ms) { for (const k in m) { const v = m[k]; if (v && v.isTexture) addTex(v); } if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k]?.value; if (v && v.isTexture) addTex(v); } } });
  // ---- the GPU's textures, largest first (dims, levels, format), and the scene's textures that match them
  const glTex = C ? [...C.tex.values()].map((e) => [e.dim, MB(e.n)]).sort((a, b) => b[1] - a[1]) : [];
  const byDim = {}; for (const [d, mb] of glTex) { const k = d.replace(/ f[0-9a-f]+$/, ''); byDim[k] = byDim[k] || [0, 0]; byDim[k][0]++; byDim[k][1] = Math.round((byDim[k][1] + mb) * 10) / 10; }
  const sceneTex = []; const seenT2 = new Set();
  ctx.scene.traverse((o) => { const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const m of ms) { const ts = []; for (const k in m) { const v = m[k]; if (v && v.isTexture) ts.push([k, v]); } if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k]?.value; if (v && v.isTexture) ts.push([k, v]); }
      const pu = r.properties.get(m)?.uniforms; if (pu) for (const k in pu) { const v = pu[k]?.value; if (v && v.isTexture) ts.push(['u:' + k, v]); }
    for (const [k, t] of ts) { if (seenT2.has(t)) continue; seenT2.add(t); const im = t.image; const w = im?.width || 0, h = im?.height || 0; sceneTex.push({ w, h, mb: MB(w * h * (im?.depth || 1) * 4 * (t.generateMipmaps !== false ? 1.33 : 1)), kind: t.userData?.atlas ? 'atlas' : (im?.tagName || im?.constructor?.name || '?'), name: (t.name || '').slice(0, 24), slot: k, mat: (m.name || m.type).slice(0, 24), obj: (o.name || o.parent?.name || '').slice(0, 24) }); } } });
  sceneTex.sort((a, b) => b.mb - a.mb);
  const kindMB = {}; for (const t of sceneTex) { const k = t.kind; kindMB[k] = kindMB[k] || [0, 0]; kindMB[k][0]++; kindMB[k][1] = Math.round((kindMB[k][1] + t.mb) * 10) / 10; }
  // ---- live canvases and decoded images (px x 4 B)
  let canvasB = 0, canvasN = 0, bigCanvas = [], imageB = 0, imageN = 0;
  // who holds each canvas: a texture the scene draws, the textures cache only, or neither (a module's own, or garbage the GC left)
  const usedImg = new Set(), cacheImg = new Set();
  for (const t of seenT2) if (t.image) usedImg.add(t.image);
  if (ctx.tex?.cache) for (const t of ctx.tex.cache.values()) if (t?.image) cacheImg.add(t.image);
  const canvasBy = { scene: 0, cache: 0, other: 0 }, otherSizes = {};
  if (C) {
    C.canvases = C.canvases.filter((w) => w.deref()); C.images = C.images.filter((w) => w.deref());
    for (const w of C.canvases) { const c = w.deref(); const n = (c.width || 0) * (c.height || 0) * 4; if (n > 4) { canvasB += n; canvasN++; if (n >= 4e6) bigCanvas.push(c.width + 'x' + c.height); const k = usedImg.has(c) ? 'scene' : cacheImg.has(c) ? 'cache' : 'other'; canvasBy[k] += n; if (k === 'other') { const d = c.width + 'x' + c.height; otherSizes[d] = (otherSizes[d] || 0) + 1; } } }
    for (const w of C.images) { const i = w.deref(); const n = (i.naturalWidth || i.width || 0) * (i.naturalHeight || i.height || 0) * 4; if (n > 4 && (i.complete !== false)) { imageB += n; imageN++; } }
  }
  // ---- programs: three's list, by shader kind
  const progs = r.info.programs || [];
  const kinds = {}; for (const p of progs) { const k = p.name || '?'; kinds[k] = (kinds[k] || 0) + 1; }
  const attrs = Object.entries(byAttr).map(([k, v]) => [k, MB(v)]).sort((a, b) => b[1] - a[1]);
  const S = window.__stats || {};
  return {
    t: Math.round(performance.now() / 1000),
    heapMB: heap === null ? null : MB(heap),
    gl: C ? { bufMB: MB(C.bufBytes), texMB: MB(C.texBytes), rbMB: MB(C.rbBytes), totalMB: MB(C.bufBytes + C.texBytes + C.rbBytes), peakMB: MB(C.peak), buffers: C.buf.size, textures: C.tex.size, programs: C.prog.size, links: C.links } : null,
    programs: progs.length, programKinds: Object.entries(kinds).sort((a, b) => b[1] - a[1]),
    canvasMB: MB(canvasB), canvases: canvasN, canvasByHolderMB: { scene: MB(canvasBy.scene), cache: MB(canvasBy.cache), other: MB(canvasBy.other) }, otherCanvasSizes: Object.entries(otherSizes).sort((a, b) => b[1] - a[1]).slice(0, 12), bigCanvases: bigCanvas.slice(0, 16), imageMB: MB(imageB), images: imageN,
    sceneGeoMB: MB([...groups].reduce((s, g) => s + g.mb * 1e6, 0)), geoCpuMB: MB(cpuBytes), legacyGeoMB: MB(legacy), texEstMB: MB(texEst),
    calls: r.info.render.calls, mtris: Math.round(r.info.render.triangles / 1e4) / 100,
    renderScale: S.renderScale ?? null, fps: S.fps ? Math.round(S.fps) : null,
    modules: S.modules ? Object.fromEntries(Object.entries(S.modules).map(([k, v]) => [k, v.heapMB])) : null, heapLayoutMB: S.heapLayoutMB ?? null, heapBuiltMB: S.heapBuiltMB ?? null, batch: S.batch ? { atlasPages: S.batch.atlasPages, atlasMB: S.batch.atlasMB, cells: S.batch.cells, evicted: S.batch.evicted, materialsEvicted: S.batch.materialsEvicted, boatCaches: S.batch.boatCaches, pagesUploaded: S.batch.pagesUploaded } : null,
    sweep: S.sweep || null, lite: window.__lite ? { level: window.__lite.level, n: window.__lite.n } : null,
    texCache: ctx.tex?.cache ? (() => { let n = 0, px = 0; for (const t of ctx.tex.cache.values()) { n++; px += (t?.image?.width || 0) * (t?.image?.height || 0); } return { n, mpx: Math.round(px / 1e5) / 10 }; })() : null,
    stream: ctx.services.explore?.stream?.summary?.() ? (({ l0, l1, m1, busy, pending, batch }) => ({ l0, l1, m1, busy, pending, verts: batch?.verts, capacity: batch?.capacity, pools: batch?.pools }))(ctx.services.explore.stream.summary()) : null,
    staticAttrs: attrs.slice(0, 16),
    groups: groups.slice(0, 22),
    glTexTop: glTex.slice(0, 24), glTexByDim: Object.entries(byDim).sort((a, b) => b[1][1] - a[1][1]).slice(0, 20), sceneTexKinds: kindMB, sceneTexTop: sceneTex.slice(0, 30),
  };
})()`;

/** The cache keys of every live program (for the shader-variant analysis): [{ name, key }] */
export const PROGRAM_KEYS = `(window.__ctx.renderer.info.programs || []).map((p) => ({ name: p.name, used: p.usedTimes, key: p.cacheKey }))`;
