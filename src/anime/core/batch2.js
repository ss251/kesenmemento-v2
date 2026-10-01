// Ported from Sakuragaoka Station (Kenton-GMI/sakuragaoka-station, MIT; see src/anime/LICENSE-sakuragaoka-station).
// Static batching v2 — transparent to modules, identical look, far fewer draw calls:
//  * every MeshToon / MeshBasic material colour is baked into per-vertex colours (linear), so
//    materials that differ only by colour share one material;
//  * canvas textures whose UVs stay inside [0,1] (signs, posters, labels…) are packed into
//    4096² atlas pages and their UVs remapped, so textured meshes share a few page materials;
//  * cells are 48 m near the play area and 200 m for distant scenery.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const PAGE = 4096, PAD = 6, MAXTILE = 2048;
/** [v4:phone] Atlas limits for every batchStatic call (main.js sets the phone tier's: pages <= 2048, tiles <= 512). */
export const ATLAS = { page: PAGE, tileMax: MAXTILE };

function uvInUnit(g) {
  const uv = g.attributes.uv; if (!uv) return false;
  for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); if (u < -0.002 || u > 1.002 || v < -0.002 || v > 1.002 || !Number.isFinite(u)) return false; }
  return true;
}
function atlasableTex(t) {
  if (!t || !t.image || t.isDataTexture || t.isCompressedTexture || t.isVideoTexture) return false;
  const img = t.image; const w = img.width, h = img.height;
  if (!(w > 0 && h > 0) || w > MAXTILE || h > MAXTILE) return false;
  if (t.repeat.x !== 1 || t.repeat.y !== 1 || t.offset.x !== 0 || t.offset.y !== 0 || t.rotation !== 0) return false;
  if (t.magFilter === THREE.NearestFilter || t.colorSpace !== THREE.SRGBColorSpace || t.flipY !== true) return false;
  if (typeof document === 'undefined' || !(img instanceof (globalThis.HTMLCanvasElement || Object) || img instanceof (globalThis.ImageBitmap || Object) || img instanceof (globalThis.HTMLImageElement || Object))) return false;
  return true;
}

// [v4:phone] Shelf packing of the tiles (w, h already scaled) into square pages of side S: the page count.
export function shelfPages(list, S) {
  let pages = 1, x = 0, y = 0, shelf = 0;
  for (const it of list) {
    const W = it.w + PAD * 2, H = it.h + PAD * 2;
    if (W > S || H > S) return Infinity;
    if (x + W > S) { x = 0; y += shelf; shelf = 0; }
    if (y + H > S) { pages++; x = 0; y = 0; shelf = 0; }
    x += W; shelf = Math.max(shelf, H);
  }
  return pages;
}

/** Pack canvas textures into atlas pages. [v4:phone] A page is the smallest power of two (256 .. `page`) that holds
 *  every tile, so a boat's few name plates no longer take a whole 4096² page (10 arriving boats held ~0.9 GB of
 *  texture); `tileMax` scales tiles down to at most that many pixels on a side (the phone tier: 512). */
function buildAtlas(textures, { page: PAGE_MAX = PAGE, tileMax = MAXTILE } = {}) {
  // shelf packing, tallest first
  const list = [...textures].map((t) => { const k = Math.min(1, tileMax / Math.max(t.image.width, t.image.height)); return { t, w: Math.max(1, Math.round(t.image.width * k)), h: Math.max(1, Math.round(t.image.height * k)) }; }).sort((a, b) => b.h - a.h || b.w - a.w);
  let S = 256; while (S < PAGE_MAX && shelfPages(list, S) > 1) S *= 2;
  const pages = []; const map = new Map();
  let page = null, x = 0, y = 0, shelf = 0;
  const newPage = () => { const c = document.createElement('canvas'); c.width = S; c.height = S; page = { canvas: c, g: c.getContext('2d'), used: 0 }; pages.push(page); x = 0; y = 0; shelf = 0; };
  for (const it of list) {
    const W = it.w + PAD * 2, H = it.h + PAD * 2;
    if (!page) newPage();
    if (x + W > S) { x = 0; y += shelf; shelf = 0; }
    if (y + H > S) { newPage(); }
    const px = x + PAD, py = y + PAD;
    try {
      page.g.drawImage(it.t.image, px - PAD, py - PAD, it.w + PAD * 2, it.h + PAD * 2); // stretched gutter
      page.g.drawImage(it.t.image, px, py, it.w, it.h);
    } catch (e) { continue; }
    map.set(it.t, { page: pages.length - 1, u0: px / S, v0: 1 - (py + it.h) / S, su: it.w / S, sv: it.h / S });
    x += W; shelf = Math.max(shelf, H); page.used++;
  }
  const texs = pages.map(p => { const t = new THREE.CanvasTexture(p.canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.userData.atlas = true; t.needsUpdate = true; return t; });
  return { map, texs };
}

function sideName(m) { return m.side === THREE.DoubleSide ? 'double' : m.side === THREE.BackSide ? 'back' : 'front'; }

export function batchStatic(root, { mat = null, nearCell = 48, farCell = 200, farR = 150, center = [0, 10], atlas: atlasOpts = ATLAS } = {}) {   // [v3:integrate] center: the play area (Kesennuma: the hero zone)
  root.updateMatrixWorld(true);
  const box = new THREE.Box3(), c = new THREE.Vector3();
  const cand = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.userData.noBatch || !o.visible) return;
    if (Array.isArray(o.material)) return;
    for (let p = o.parent; p && p !== root; p = p.parent) if (p.userData.noBatch || !p.visible) return;
    const g = o.geometry;
    if (!g || !g.attributes.position || g.morphAttributes?.position) return;
    cand.push(o);
  });
  // ---- atlas candidates
  const atlasTex = new Set(); const uvOk = new Map();
  if (mat) for (const o of cand) {
    const m = o.material;
    if (!(m.isMeshToonMaterial || m.isMeshBasicMaterial) || !m.map || m.alphaMap || (m.isMeshToonMaterial && !(m.userData.toon && m.onBeforeCompile === m.userData.toon.obc))) continue;
    if (!atlasableTex(m.map)) continue;
    let ok = uvOk.get(o.geometry); if (ok === undefined) { ok = uvInUnit(o.geometry); uvOk.set(o.geometry, ok); }
    if (ok) atlasTex.add(m.map);
  }
  // texture must be atlasable for ALL its users, otherwise keep it separate
  if (mat) for (const o of cand) { const m = o.material; if (m.map && atlasTex.has(m.map) && !uvOk.get(o.geometry)) atlasTex.delete(m.map); }
  const atlas = atlasTex.size ? buildAtlas(atlasTex, atlasOpts) : { map: new Map(), texs: [] };

  // ---- group
  const groups = new Map(); const shared = new Map();
  for (const o of cand) {
    const g = o.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    box.copy(g.boundingBox).applyMatrix4(o.matrixWorld); box.getCenter(c);
    const far = Math.max(Math.abs(c.x - center[0]), Math.abs(c.z - center[1])) > farR;
    const cell = far ? farCell : nearCell;
    const big = box.max.x - box.min.x > cell * 1.5 || box.max.z - box.min.z > cell * 1.5;
    const ix = big ? 'L' : Math.floor(c.x / cell), iz = big ? 'L' : Math.floor(c.z / cell);
    const m = o.material;
    let target = m, bake = null, tile = null;
    const convertible = mat && ((m.isMeshToonMaterial && m.userData.toon && m.onBeforeCompile === m.userData.toon.obc && !m.alphaMap && !m.normalMap && !m.bumpMap && !m.displacementMap && !m.defines?.USE_CUSTOM) || (m.isMeshBasicMaterial && !m.alphaMap && !m.envMap && !m.lightMap && !m.aoMap));
    if (convertible) {
      tile = m.map ? atlas.map.get(m.map) || null : null;
      const mapKey = m.map ? (tile ? 'page' + tile.page : m.map.uuid) : 'none';
      let sig;
      if (m.isMeshToonMaterial) {
        const t = m.userData.toon;
        sig = `T|${mapKey}|${sideName(m)}|${m.transparent}|${m.opacity}|${m.alphaTest}|${m.depthWrite}|${t.paint}|${t.grime}|${t.polygonOffset}|${m.emissive.getHexString()}|${m.emissiveIntensity}`;
      } else {
        sig = `B|${mapKey}|${sideName(m)}|${m.transparent}|${m.opacity}|${m.alphaTest}|${m.depthWrite}|${m.fog}|${m.toneMapped}`;
      }
      let sm = shared.get(sig);
      if (!sm) {
        const map = m.map ? (tile ? atlas.texs[tile.page] : m.map) : null;
        const common = { map, transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest, depthWrite: m.depthWrite, vertexColors: true };
        const side = sideName(m); if (side !== 'front') common.side = side;
        if (m.isMeshToonMaterial) {
          const t = m.userData.toon;
          const opts = { ...common, paint: t.paint, grime: t.grime };
          if (t.polygonOffset) opts.polygonOffset = t.polygonOffset;
          if (m.emissive && (m.emissive.r || m.emissive.g || m.emissive.b)) { opts.emissive = '#' + m.emissive.getHexString(); opts.emissiveIntensity = m.emissiveIntensity; }
          sm = mat.toon('#ffffff', opts);
        } else {
          sm = new THREE.MeshBasicMaterial({ color: 0xffffff, map, transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest, depthWrite: m.depthWrite, side: m.side, fog: m.fog, toneMapped: m.toneMapped, vertexColors: true });
        }
        shared.set(sig, sm);
      }
      if (m.userData.acc) sm.userData.acc = m.userData.acc;   // [v4:town-accuracy] class tag for tools/anime/accuracy.mjs
      target = sm; bake = m.color;
    }
    const key = `${target.uuid}|${ix},${iz}|${o.layers.mask}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}|${o.renderOrder}|${o.frustumCulled ? 1 : 0}`;
    let arr = groups.get(key); if (!arr) groups.set(key, (arr = { mat: target, items: [] }));
    arr.items.push({ o, bake, tile });
  }

  // ---- merge
  let merged = 0, sources = 0;
  const victims = [];
  const out = new THREE.Group(); out.name = 'static-batched';
  for (const [key, grp] of groups) {
    const list = grp.items, matT = grp.mat;
    if (list.length < 2 && matT === list[0].o.material) continue;
    const needColor = !!matT.vertexColors;
    const geos = [];
    for (const { o, bake, tile } of list) {
      const g = o.geometry.clone();
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      const n = g.attributes.position.count;
      if (needColor) {
        const src = g.attributes.color; const useSrc = src && o.material.vertexColors;
        const br = bake ? bake.r : 1, bgc = bake ? bake.g : 1, bb = bake ? bake.b : 1;
        const a = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          const sr = useSrc ? src.getX(i) : 1, sg = useSrc ? src.getY(i) : 1, sb = useSrc ? src.getZ(i) : 1;
          a[i * 3] = sr * br; a[i * 3 + 1] = sg * bgc; a[i * 3 + 2] = sb * bb;
        }
        g.setAttribute('color', new THREE.BufferAttribute(a, 3));
      }
      if (tile) {
        const uv = g.attributes.uv; const a = new Float32Array(n * 2);
        for (let i = 0; i < n; i++) { const u = Math.min(1, Math.max(0, uv.getX(i))), v = Math.min(1, Math.max(0, uv.getY(i))); a[i * 2] = tile.u0 + u * tile.su; a[i * 2 + 1] = tile.v0 + v * tile.sv; }
        g.setAttribute('uv', new THREE.BufferAttribute(a, 2));
      }
      for (const name of Object.keys(g.attributes)) {
        if (name === 'position' || name === 'normal' || name === 'uv' || (needColor && name === 'color')) continue;
        g.deleteAttribute(name);
      }
      for (const name of Object.keys(g.attributes)) {
        const at = g.attributes[name];
        if (at.isInterleavedBufferAttribute || at.normalized || !(at.array instanceof Float32Array)) {
          const a = new Float32Array(at.count * at.itemSize);
          for (let i = 0; i < at.count; i++) for (let j = 0; j < at.itemSize; j++) a[i * at.itemSize + j] = at.getComponent(i, j);
          g.setAttribute(name, new THREE.BufferAttribute(a, at.itemSize));
        }
      }
      if (!g.index) { const idx = new Uint32Array(n); for (let i = 0; i < n; i++) idx[i] = i; g.setIndex(new THREE.BufferAttribute(idx, 1)); }
      g.clearGroups();
      g.applyMatrix4(o.matrixWorld);
      if (o.matrixWorld.determinant() < 0) { const ia = g.index.array; for (let i = 0; i < ia.length; i += 3) { const t = ia[i + 1]; ia[i + 1] = ia[i + 2]; ia[i + 2] = t; } }
      g.morphAttributes = {};
      geos.push(g);
    }
    const mg = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!mg) { console.warn('batch: merge failed for', key); continue; }
    mg.computeBoundingSphere(); mg.computeBoundingBox();
    const mesh = new THREE.Mesh(mg, matT);
    const s = list[0].o;
    mesh.castShadow = s.castShadow; mesh.receiveShadow = s.receiveShadow; mesh.layers.mask = s.layers.mask;
    mesh.renderOrder = s.renderOrder; mesh.frustumCulled = s.frustumCulled;
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    out.add(mesh);
    for (const it of list) victims.push(it.o);
    merged++; sources += list.length;
  }
  for (const o of victims) o.parent && o.parent.remove(o);
  root.add(out);
  root.traverse((o) => { if (!o.userData.dynamic) o.updateMatrix(); });
  const hist = {};
  for (const [, grp] of groups) { const m = grp.mat; let k = m.type; if (m.map) k += m.map.userData?.atlas ? '+atlas' : '+map'; if (m.transparent) k += '+tr'; if (m.alphaTest) k += '+at'; hist[k] = (hist[k] || 0) + 1; }
  const nonAtlas = {}; for (const o of cand) { const m = o.material; if (m.map && !atlas.map.has(m.map)) { const r = !atlasableTex(m.map) ? 'tex:' + (m.map.wrapS !== THREE.ClampToEdgeWrapping ? 'wrap' : m.map.repeat.x !== 1 || m.map.repeat.y !== 1 ? 'repeat' : (m.map.image && (m.map.image.width > MAXTILE || m.map.image.height > MAXTILE)) ? 'big' : 'other') : 'uv'; nonAtlas[r] = (nonAtlas[r] || 0) + 1; } }
  return { merged, sources, sharedMaterials: shared.size, atlasTextures: atlas.map.size, atlasPages: atlas.texs.length, groupsByKind: hist, nonAtlasReasons: nonAtlas };
}
