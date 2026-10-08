// [mobile-perf] The phone's memory work: the load's peak (cells built and uploaded one at a time, sources freed as they are copied),
// canvases freed after their upload, atlas tiles no finer than the screen can show, the census and the budget gate.
import { test, expect, describe } from 'bun:test';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { mergeCells } from '../src/anime/core/phonecells.js';
import { planAtlas } from '../src/anime/core/atlaspack.js';
import { freeOnUpload, ATLAS } from '../src/anime/core/batch2.js';
import { PHONE } from '../src/anime/core/tier.js';
import { BUDGET } from '../tools/anime/phone-census.js';
import { StreamBatch } from '../src/anime/world/explore/sbatch.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

describe('the load peak: phone cells built and uploaded one at a time (core/phonecells.js)', () => {
  const mk = (x, z, mat) => { const g = new THREE.BoxGeometry(4, 4, 4); g.translate(x, 2, z); const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; return m; };
  test('each cell is handed to upload() as soon as it is built, release() first; the source batches lose their arrays', () => {
    const root = new THREE.Group(), sb = new THREE.Group(); sb.name = 'static-batched'; root.add(sb);
    const a = new THREE.MeshLambertMaterial(), b = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    const src = [mk(10, 10, a), mk(20, 20, b), mk(900, 900, a)];
    sb.add(...src);
    const srcGeos = src.map((o) => o.geometry);
    const order = [];
    const px = mergeCells(root, sb, {
      cell: 400,
      release: (g) => order.push(['release', g.attributes.position.count]),
      upload: (mesh) => { order.push(['upload', mesh.geometry.attributes.position.count]); expect(mesh.parent?.name).toBe('static-cells'); },
    });
    expect(px.stats.cells).toBe(2);
    expect(px.stats.uploaded).toBe(2);
    // release then upload, cell by cell (not all releases first)
    expect(order.map((o) => o[0])).toEqual(['release', 'upload', 'release', 'upload']);
    // the sources' arrays are gone (the cell holds the only copy); their meshes left the scene
    for (const g of srcGeos) { expect(g.attributes.position.array).toBe(null); expect(g.index.array).toBe(null); }
    expect(sb.children.length).toBe(0);
    // the cells still draw: their own arrays are intact until the renderer uploads them
    for (const m of px.cells.children) expect(m.geometry.attributes.position.array.length).toBeGreaterThan(0);
  });
  test('without upload() the cells are built as before (all at the first frame)', () => {
    const root = new THREE.Group(), sb = new THREE.Group(); sb.name = 'static-batched'; root.add(sb);
    sb.add(mk(10, 10, new THREE.MeshLambertMaterial()));
    const px = mergeCells(root, sb, { cell: 400 });
    expect(px.stats.cells).toBe(1);
    expect(px.stats.uploaded).toBe(undefined);
  });
  test('main.js builds the phone cells straight from the sources, uploading each (?direct=0: batch2 then mergeCells; ?stage=0: no upload)', () => {
    const main = read('src/anime/main.js');
    expect(main).toContain("const up = quality.phone && params.get('stage') !== '0' ? makeUploader() : null;");
    expect(main).toContain("const direct = quality.phone && params.get('direct') !== '0' ? { cell: cells.nearCell, upload: up?.upload, release: up ? releaseGeometry : null } : null;");
    expect(main).toContain('batchStatic2(ctx.staticRoot, { mat: ctx.mat, ...cells, direct })');
    expect(main).toContain('const px = directPx || (sbg && mergeCells(ctx.staticRoot, sbg, { cell: cells.nearCell, upload: up?.upload, release: releaseGeometry }));');
    // the uploader draws with the pre-pass material (its program already exists) into a 1x1 target, and puts the mesh back where it was
    expect(main).toMatch(/sc\.overrideMaterial = pipeline\.ndMat/);
    expect(main).toMatch(/new THREE\.WebGLRenderTarget\(1, 1,/);
  });
});

describe('canvases: freed once on the GPU', () => {
  test('freeOnUpload shrinks the canvas after the upload callback and keeps its size; once only', () => {
    const c = { width: 2048, height: 1984, getContext() { return {}; } };
    const t = freeOnUpload(new THREE.Texture(c));
    expect(typeof t.onUpdate).toBe('function');
    t.onUpdate(t);
    expect(c.width).toBe(1); expect(c.height).toBe(1);
    expect(t.userData.freed).toEqual([2048, 1984]);
    expect(t.onUpdate).toBe(null);
  });
  test('an image (no getContext) is left alone', () => {
    const img = { width: 512, height: 512 };
    const t = freeOnUpload(new THREE.Texture(img));
    t.onUpdate(t);
    expect(img.width).toBe(512);
  });
  test('the phone turns it on for atlas pages, and evicts the textures cache entries no material uses after the batch', () => {
    const main = read('src/anime/main.js');
    expect(main).toContain("ATLAS.release = params.get('release') !== '0';");
    expect(main).toContain("stats.batch.evicted = evictUnusedTextures(ctx.tex?.cache, scene)");
    expect(ATLAS.release).toBe(false);   // (desktop: the default)
  });
});

describe('atlas tiles no finer than the screen can show', () => {
  test('a size with its own max is scaled to it (aspect kept); others keep the tile cap', () => {
    const plan = planAtlas([{ w: 512, h: 128, max: 100 }, { w: 512, h: 512 }, { w: 300, h: 600, max: 1000 }], { page: 2048, tileMax: 512 });
    const tiles = plan.pages.flatMap((p) => p.tiles).sort((a, b) => a.i - b.i);
    expect([tiles[0].w, tiles[0].h]).toEqual([100, 25]);
    expect([tiles[1].w, tiles[1].h]).toEqual([512, 512]);
    expect([tiles[2].w, tiles[2].h]).toEqual([256, 512]);   // max above tileMax: tileMax wins
  });
  test('the phone tier sets a density; batch2 caps each tile by the size of what wears it', () => {
    expect(PHONE.atlasDensity).toBeGreaterThanOrEqual(160);
    const b2 = read('src/anime/core/batch2.js');
    expect(b2).toContain('caps.set(t, Math.max(caps.get(t) || 0, Math.max(sz.x, sz.y, sz.z)));');
    expect(b2).toContain("if (caps) g.imageSmoothingQuality = 'high';");
  });
});

describe('the budget gate (tools/anime/phone-budget.mjs)', () => {
  test("the brief's budgets", () => {
    expect(BUDGET).toEqual({ heapMB: 260, geoMB: 280, texMB: 200, programsStart: 140, growth: 0.1 });
  });
  test('the census counts GPU memory at the WebGL calls, every buffer once', () => {
    const c = read('tools/anime/phone-census.js');
    for (const k of ["wrap('bufferData'", "wrap('deleteBuffer'", "wrap('texStorage2D'", "wrap('deleteTexture'", "wrap('renderbufferStorageMultisample'", "wrap('createProgram'", "wrap('deleteProgram'"]) expect(c).toContain(k);
  });
  test('deploy-verify runs the gate on the stage (when the commit has it)', () => {
    let v = '';
    try { v = readFileSync('deploy-verify.sh', 'utf8'); } catch { return; }   // (not on every machine)
    expect(v).toContain('tools/anime/phone-budget.mjs --url http://127.0.0.1:8996/');
  });
});

describe('the stream gives memory back (world/explore/sbatch.js)', () => {
  const ctx = { add: () => {}, mat: null };
  const grp = (mat, x, n) => { const g = new THREE.Group(); for (let i = 0; i < n; i++) { const o = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1, 4, 4, 4), mat); o.position.set(x, i * 2, 0); g.add(o); } return g; };
  const flushN = (sb, n) => { for (let i = 0; i < n; i++) sb.flush(); };
  test('a pool every tile left is freed (its BatchedMesh disposed), and a new tile of that kind gets a fresh one', () => {
    const sb = new StreamBatch(ctx, { name: 'm1' });
    const a = new THREE.MeshToonMaterial({ color: '#abc' }), b = new THREE.MeshToonMaterial({ color: '#cba' });
    sb.add('t1', grp(a, 0, 3)); sb.add('t2', grp(b, 50, 3)); sb.flush();
    expect(sb.stats().pools).toBe(2);
    const bmA = [...sb.pools.values()].find((p) => p.material.color.getHexString() === 'aabbcc').bm;
    let disposed = false; bmA.addEventListener('dispose', () => { disposed = true; });
    sb.remove('t1'); flushN(sb, 31);
    expect(sb.stats().pools).toBe(1);
    expect(disposed).toBe(true);
    expect(bmA.parent).toBe(null);
    expect(sb.stats().freed).toBe(1);
    sb.add('t3', grp(a, 0, 2)); sb.flush();
    expect(sb.stats().pools).toBe(2);
    expect(sb.validate().nBad).toBe(0);
  });
  test('a pool far below its capacity is compacted and shrunk; what it still holds is intact', () => {
    const sb = new StreamBatch(ctx, { name: 'm2' });
    const a = new THREE.MeshToonMaterial({ color: '#abc' });
    for (let k = 0; k < 24; k++) sb.add('t' + k, grp(a, k * 10, 20));
    sb.flush();
    const p = [...sb.pools.values()][0], cap0 = p.verts;
    expect(cap0).toBeGreaterThan(1 << 15);
    for (let k = 1; k < 24; k++) sb.remove('t' + k);
    flushN(sb, 31);
    expect(p.verts).toBeLessThan(cap0);
    expect(p.verts).toBeGreaterThanOrEqual(p.liveV);
    expect(sb.stats().shrunk).toBeGreaterThanOrEqual(1);
    expect(sb.validate().nBad).toBe(0);
    expect(sb.stats().verts).toBe(20 * 150);   // one tile left: 20 boxes of 150 vertices
    // and it still takes new tiles (it grows again as before)
    for (let k = 30; k < 40; k++) sb.add('t' + k, grp(a, k * 10, 20));
    sb.flush();
    expect(sb.validate().nBad).toBe(0);
    expect(sb.stats().verts).toBe(11 * 20 * 150);
  });
});

describe('the heap: caches the phone no longer needs after the load', () => {
  test('freeDataOnUpload drops a DataTexture array after its upload; the size stays', async () => {
    const { freeDataOnUpload } = await import('../src/anime/core/textures.js');
    const t = freeDataOnUpload(new THREE.DataTexture(new Uint16Array(8 * 4 * 2), 8, 4, THREE.RGFormat, THREE.HalfFloatType));
    t.onUpdate(t);
    expect(t.image.data).toBe(null);
    expect(t.userData.freed).toEqual([8, 4]);
    expect(t.onUpdate).toBe(null);
  });
  test('the water grids, the boat hull cache, unused materials and the phone note rate are wired', () => {
    expect(read('src/anime/world/water.js')).toContain('ctx.quality?.phone ? freeDataOnUpload(gridTexture(G.core))');
    const main = read('src/anime/main.js');
    expect(main).toContain('ctx.services.harbor?.releaseCaches?.()');
    expect(main).toContain('stats.batch.materialsEvicted = evictUnusedMaterials(ctx.mat?.cache, scene)');
    expect(main).toContain('createAudio({ noteRate: quality.phone ? 32000 : 0 })');
    expect(read('src/anime/core/audio.js')).toContain("const sr = !extra && O.noteRate > 0 && key.startsWith('n:') ? Math.min(SR, O.noteRate) : SR;");
  });
  test('releaseBoatCaches empties the hull and foam caches', async () => {
    const { releaseBoatCaches } = await import('../src/anime/world/harbor/boats.js');
    expect(typeof releaseBoatCaches()).toBe('number');
    expect(releaseBoatCaches()).toBe(0);
  });
});

describe('the phone cells straight from the sources (core/phonecells.js buildCells) match batch2 + mergeCells', () => {
  const { batchStatic } = require('../src/anime/core/batch2.js');
  const { mergeCells: mergeCells2 } = require('../src/anime/core/phonecells.js');
  function scene() {
    const root = new THREE.Group();
    const a = new THREE.MeshLambertMaterial({ color: 0xff0000 }), b = new THREE.MeshLambertMaterial({ color: 0x00ff00, side: THREE.DoubleSide }), glass = new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.4 });
    const box = new THREE.BoxGeometry(2, 3, 4);
    const nonIdx = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
    const noNormals = new THREE.BoxGeometry(1, 2, 1); noNormals.deleteAttribute('normal');
    const add = (g, m, x, z, o = {}) => { const mesh = new THREE.Mesh(g, m); mesh.position.set(x, o.y || 0, z); if (o.rot) mesh.rotation.y = o.rot; if (o.flip) mesh.scale.set(-1, 1, 1); mesh.castShadow = o.cast ?? true; mesh.receiveShadow = true; root.add(mesh); return mesh; };
    add(box, a, 10, 10); add(box, a, 30, 12, { rot: 0.7 }); add(box, b, 20, 40); add(box, b, 60, 20, { flip: true });
    add(nonIdx, a, 15, 15); add(nonIdx, a, 16, 18); add(noNormals, b, 25, 25); add(noNormals, b, 26, 28, { cast: false });
    add(box, a, 900, 900); add(box, a, 905, 910);   // another cell
    add(box, glass, 12, 12); add(box, glass, 14, 14);   // transparent: stays in static-batched
    return root;
  }
  const tris = (g) => {   // world-space triangles of a cell, sorted (order-free comparison)
    const p = g.attributes.position, idx = g.index, out = [];
    for (let k = 0; k < idx.count; k += 3) { const t = []; for (let j = 0; j < 3; j++) { const v = idx.getX(k + j); t.push([p.getX(v), p.getY(v), p.getZ(v)].map((x) => Math.round(x * 1000) / 1000).join(',')); } out.push(t.sort().join('|')); }
    return out.sort();
  };
  test('same cells, same groups, same triangles in world space, same transparent leftovers', () => {
    const A = scene(), B = scene();
    batchStatic(A, { mat: null, nearCell: 400, farCell: 2000, farR: 600, center: [0, 0] });
    const pa = mergeCells2(A, A.children.find((c) => c.name === 'static-batched'), { cell: 400 });
    const rb = batchStatic(B, { mat: null, nearCell: 400, farCell: 2000, farR: 600, center: [0, 0], direct: { cell: 400 } });
    const pb = rb.proxies;
    expect(pb.stats.direct).toBe(true);
    expect(pb.cells.children.length).toBe(pa.cells.children.length);
    const key = (m) => m.geometry.boundingSphere.center.toArray().map((x) => Math.round(x)).join(',');
    for (const ca of pa.cells.children) {
      const cb = pb.cells.children.find((m) => key(m) === key(ca));
      expect(cb).toBeTruthy();
      expect(cb.geometry.attributes.position.count).toBe(ca.geometry.attributes.position.count);
      expect(cb.geometry.index.count).toBe(ca.geometry.index.count);
      expect(cb.geometry.groups.map((g) => g.count)).toEqual(ca.geometry.groups.map((g) => g.count));
      expect(cb.material.map((m) => m.color.getHexString() + m.side)).toEqual(ca.material.map((m) => m.color.getHexString() + m.side));
      expect(tris(cb.geometry)).toEqual(tris(ca.geometry));
    }
    // the shadow and pre-pass views over the same buffers, as before
    expect(pb.nd.children.length).toBe(pa.nd.children.length);
    expect(pb.shadow.children.map((m) => m.geometry.drawRange.count).sort()).toEqual(pa.shadow.children.map((m) => m.geometry.drawRange.count).sort());
    // the transparent pair is merged in static-batched in both
    const tb = B.children.find((c) => c.name === 'static-batched'), ta = A.children.find((c) => c.name === 'static-batched');
    expect(tb.children.length).toBe(ta.children.length);
    // the same sources left in the scene (a lone mesh with its own material is not batched, in either path)
    expect(B.children.filter((c) => c.isMesh).length).toBe(A.children.filter((c) => c.isMesh).length);
    expect(B.children.filter((c) => c.isMesh).length).toBe(1);
  });
  test('normals: transformed by each source, unit length, as four signed bytes; no uvs where no material reads them', () => {
    const A = scene(), B = scene();
    batchStatic(A, { mat: null, nearCell: 400, farCell: 2000, farR: 600, center: [0, 0] });
    const pa = mergeCells2(A, A.children.find((c) => c.name === 'static-batched'), { cell: 400 });
    const rb = batchStatic(B, { mat: null, nearCell: 400, farCell: 2000, farR: 600, center: [0, 0], direct: { cell: 400 } });
    const key = (m) => m.geometry.boundingSphere.center.toArray().map((x) => Math.round(x)).join(',');
    for (const m of rb.proxies.cells.children) {
      const n = m.geometry.attributes.normal;
      expect(n.array).toBeInstanceOf(Int8Array); expect(n.itemSize).toBe(4); expect(n.normalized).toBe(true);
      const ref = pa.cells.children.find((c) => key(c) === key(m)).geometry.attributes.normal;
      for (let i = 0; i < n.count; i += 5) {
        expect(Math.abs(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) - 1)).toBeLessThan(0.02);
        expect(Math.abs(n.getX(i) - ref.getX(i)) + Math.abs(n.getY(i) - ref.getY(i)) + Math.abs(n.getZ(i) - ref.getZ(i))).toBeLessThan(0.03);   // the same normal, to 8 bits
      }
      expect(m.geometry.attributes.uv).toBe(undefined);   // Lambert materials without maps: nothing reads the uvs
      const c = m.geometry.attributes.color, refC = pa.cells.children.find((x) => key(x) === key(m)).geometry.attributes.color;
      expect(c.isFloat16BufferAttribute).toBe(true); expect(c.itemSize).toBe(4);
      for (let i = 0; i < c.count; i += 5) { expect(Math.abs(c.getX(i) - refC.getX(i)) + Math.abs(c.getY(i) - refC.getY(i)) + Math.abs(c.getZ(i) - refC.getZ(i))).toBeLessThan(0.003); expect(c.getW(i)).toBe(1); }
    }
    expect(rb.proxies.stats.noUv).toBe(rb.proxies.cells.children.length);
  });
});

describe('the session sweep (main.js)', () => {
  test('every 20 s on the phone: unused cached textures evicted and their GPU copies freed, unused materials evicted; ?sweep=0 off', () => {
    const main = read('src/anime/main.js');
    expect(main).toContain("if (quality.phone && params.get('sweep') !== '0') startSweeper();");
    expect(main).toContain('const t = evictUnusedTextures(ctx.tex?.cache, scene, { dispose: true }), m = evictUnusedMaterials(ctx.mat?.cache, scene);');
    expect(main).toMatch(/if \(dispose\) t\.dispose\(\);/);
    expect(main).toContain('if (document.hidden || planet.active || ctx.shooting) return;');
  });
});

describe('outlines over a 2x canvas (core/renderer.js edgeTex)', () => {
  test('the composite reads a filtered edge target when the canvas is finer than the scene; the outline code is shared', () => {
    const r = read('src/anime/core/renderer.js');
    expect(r).toContain('const EDGE_BODY = /* glsl */`');
    expect(r).toContain('#ifdef EDGE_TEX\n        float edge = texture2D(tEdge, vUv).r;');
    expect(r).toContain('#else\n${EDGE_BODY}\n#endif');
    expect(r).toContain("format: THREE.RedFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false");
    expect(r).toContain('if (edgeMat) pass(edgeMat, rtEdge);');
    expect(read('src/anime/main.js')).toContain("createRenderPipeline(renderer, quality, { edgeTex: !SHOT && CANVAS_PR > 1 && params.get('edgetex') !== '0', fxaa: !SHOT && quality.phone && params.get('fxaa') === '1' })");
    // FXAA on the scene colour (phones, ?fxaa=1 only: it measured softer): 9 taps at the scene's texels, an early out where there is no edge
    expect(r).toContain('#ifdef FXAA\n        vec3 col = fxaaColor(vUv, 1.0 / uRes);');
    expect(r).toContain('if (lMax - lMin < max(0.0312, lMax * 0.125)) return m;');
  });
});

describe('the street-detail swap fades by dither (world/explore/sbatch.js fade, stream.js)', () => {
  const ctx = { add: () => {}, mat: null };
  const grp = (mat, x) => { const g = new THREE.Group(); const o = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat); o.position.set(x, 0, 0); g.add(o); return g; };
  const alphaOf = (sb, key) => { const out = []; for (const p of sb.pools.values()) { const s = p.slots.get(key); if (s && s.iid >= 0) out.push(p.bm._colorsTexture.image.data[s.iid * 4 + 3]); } return out; };
  test('a kit entry fades 0 -> 1 over fadeMs (its instance alpha), then the end runs; a removed entry never runs it', () => {
    const sb = new StreamBatch(ctx, { name: 'f1' });
    const mat = new THREE.MeshToonMaterial({ color: '#abc' });
    sb.add('k0:a', grp(mat, 0)); sb.flush();
    expect(alphaOf(sb, 'k0:a')).toEqual([1]);   // every instance carries an opaque fade from the start (one program variant)
    let ended = 0;
    expect(sb.fade('k0:a', 0, 1, () => ended++)).toBe(true);
    const t0 = sb.entries.get('k0:a').fade.t0;
    sb.tickFades(t0); expect(alphaOf(sb, 'k0:a')[0]).toBeCloseTo(0, 5);
    sb.tickFades(t0 + 175); expect(alphaOf(sb, 'k0:a')[0]).toBeCloseTo(0.5, 2);
    expect(ended).toBe(0);
    sb.tickFades(t0 + 400); expect(alphaOf(sb, 'k0:a')[0]).toBeCloseTo(1, 5);
    expect(ended).toBe(1);
    // a fade out cut short by a removal never runs its end
    let gone = 0; sb.fade('k0:a', 1, 0, () => gone++); sb.remove('k0:a'); sb.tickFades(t0 + 5000);
    expect(gone).toBe(0);
  });
  test('an entry in a shared block slot, or fadeMs 0 (shot mode, settle), takes its end at once', () => {
    const sb = new StreamBatch(ctx, { name: 'f2' });
    const mat = new THREE.MeshToonMaterial({ color: '#abc' });
    sb.add('m1:x', grp(mat, 0), { slot: 'blk' }); sb.add('k0:y', grp(mat, 9)); sb.flush();
    let n = 0;
    expect(sb.fade('m1:x', 0, 1, () => n++)).toBe(false); expect(n).toBe(1);
    sb.fadeMs = 0; expect(sb.fade('k0:y', 0, 1, () => n++)).toBe(false); expect(n).toBe(2);
    expect(alphaOf(sb, 'k0:y')).toEqual([1]);
  });
  test('the pools draw through views that dither by the instance alpha; their programs are told apart', () => {
    const { batchedView, FADE_GLSL } = require('../src/anime/world/explore/sbatch.js');
    const m = new THREE.MeshToonMaterial(); m.customProgramCacheKey = () => 'paint|swim';
    const v = batchedView(m), sh = { fragmentShader: 'a\n#include <color_fragment>\nb', vertexShader: '' };
    v.onBeforeCompile(sh, null);
    expect(sh.fragmentShader).toContain('#include <color_fragment>' + FADE_GLSL);
    expect(v.customProgramCacheKey()).toBe('paint|swim|fade');
    expect(FADE_GLSL).toContain('if ( vColor.a < 0.999 )');
  });
  test('stream.js: the kit fades in over the simplified buildings and they go at its end; on unload they come back at once and the kit fades out', () => {
    const st = read('src/anime/world/explore/stream.js');
    expect(st).toContain("sb.fade('k0:' + t.key, 0, 1, () => sb.group(() => { sb.setVisible('m1:' + t.key, false); sb.setVisible('f1:' + t.key, false); }));");
    expect(st).toContain('sb.fade(k, 1, 0, () => sb.remove(k));');
    expect(st).toContain('const fadeMs = sb.fadeMs; sb.fadeMs = 0;');
    expect(read('src/anime/core/renderer.js')).toContain('vFade = getBatchingColor( getIndirectIndex( gl_DrawID ) ).a;');
  });
});

describe('the session sweep frees the GPU copies of every departed texture (main.js)', () => {
  test('remembers the scene\'s textures weakly; disposes those gone from the scene, never a freed-image or render-target texture', () => {
    const main = read('src/anime/main.js');
    expect(main).toContain('if (used.has(x) || x.userData.freed || x.isRenderTargetTexture) continue;');
    expect(main).toContain('seen.add(new WeakRef(x))');
    expect(main).toContain('if (o.isBatchedMesh) { add(o._matricesTexture); add(o._indirectTexture); add(o._colorsTexture); }');
  });
});

describe('baked colours in the direct cells (half floats) match batch2 + mergeCells', () => {
  test('toon materials folded by colour (ctx.mat): the same colours, a lamp brighter than 1 included', async () => {
    const { createMaterials } = await import('../src/anime/core/materials.js');
    const { batchStatic } = await import('../src/anime/core/batch2.js');
    const { mergeCells: mc } = await import('../src/anime/core/phonecells.js');
    const build = (mat) => {
      const root = new THREE.Group(), box = new THREE.BoxGeometry(2, 2, 2);
      const cols = ['#c84030', '#3a3346', '#f2c230', '#8fb86f'];
      cols.forEach((c, i) => { for (let j = 0; j < 2; j++) { const m = new THREE.Mesh(box, mat.toon(c)); m.position.set(i * 10 + j * 3, 0, 20); m.castShadow = true; m.receiveShadow = true; root.add(m); } });
      const lamp = mat.emissive('#ffd9a0', 1.6); for (let j = 0; j < 2; j++) { const m = new THREE.Mesh(box, lamp); m.position.set(60 + j * 3, 0, 20); m.receiveShadow = true; root.add(m); }
      return root;
    };
    const mA = createMaterials(null), mB = createMaterials(null);
    const A = build(mA), B = build(mB);
    batchStatic(A, { mat: mA, nearCell: 400, farCell: 2000, farR: 600, center: [0, 0] });
    const pa = mc(A, A.children.find((c) => c.name === 'static-batched'), { cell: 400 });
    const pb = batchStatic(B, { mat: mB, nearCell: 400, farCell: 2000, farR: 600, center: [0, 0], direct: { cell: 400 } }).proxies;
    expect(pb.cells.children.length).toBe(pa.cells.children.length);
    let maxC = 0;
    for (const cb of pb.cells.children) {
      const ca = pa.cells.children.find((x) => x.geometry.boundingSphere.center.distanceTo(cb.geometry.boundingSphere.center) < 0.01);
      const c = cb.geometry.attributes.color, r = ca.geometry.attributes.color;
      expect(c.count).toBe(r.count);
      for (let i = 0; i < c.count; i++) { for (const k of ['getX', 'getY', 'getZ']) { expect(Math.abs(c[k](i) - r[k](i))).toBeLessThan(Math.max(0.002, r[k](i) * 0.002)); maxC = Math.max(maxC, c[k](i)); } }
    }
    expect(maxC).toBeGreaterThan(1);   // the lamp's 1.6 x colour survives (bytes would have clipped it)
  });
});
