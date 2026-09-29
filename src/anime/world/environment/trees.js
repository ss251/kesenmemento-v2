// [v3:foundation] environment/trees.js — stylised 3D trees where the camera gets close (data/anime/trees.json,
// scripts/anime/build-trees.js): 杉 cedar cones in tiers, round broadleaf clumps of 3 soft blobs, scattered early
// autumn crowns. Three InstancedMeshes (one draw call each), vertex-colour shading (lighter crowns, darker skirts)
// times a per-instance tint. The painted crown shader in terrain.js carries the forest beyond them.
import * as THREE from 'three';
import * as L from '../layout.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function paint(geo, fn) {
  const p = geo.attributes.position, c = new Float32Array(p.count * 3), col = new THREE.Color();
  for (let i = 0; i < p.count; i++) { fn(p.getX(i), p.getY(i), p.getZ(i), col); c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}
const lin = (h) => new THREE.Color(h);

/** Unit cedar (height 1, radius ~0.22): trunk + three stacked cones. */
function cedarGeometry() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.018, 0.026, 0.22, 5).translate(0, 0.11, 0);
  parts.push(paint(trunk, (x, y, z, c) => c.copy(lin('#6d5646'))));
  const tiers = [[0.16, 0.62, 0.23], [0.42, 0.5, 0.18], [0.64, 0.38, 0.13]];
  for (const [y0, h, r] of tiers) {
    const g = new THREE.ConeGeometry(r, h, 7, 1).translate(0, y0 + h / 2, 0);
    parts.push(paint(g, (x, y, z, c) => { const t = Math.min(1, Math.max(0, (y - y0) / h)); c.copy(lin('#3f6a4d')).lerp(lin('#6f9a66'), t * 0.8); }));
  }
  const g = mergeGeometries(parts.map((p) => p.toNonIndexed()));
  g.computeVertexNormals();
  return g;
}
/** Unit broadleaf clump (height 1, radius ~0.5): short trunk + three soft blobs. */
function broadGeometry() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.035, 0.05, 0.4, 5).translate(0, 0.2, 0); trunk.deleteAttribute('uv');
  parts.push(paint(trunk, (x, y, z, c) => c.copy(lin('#76604e'))));
  const blobs = [[0, 0.62, 0, 0.36], [0.2, 0.5, 0.12, 0.26], [-0.18, 0.52, -0.1, 0.27]];
  for (const [bx, by, bz, r] of blobs) {
    const s = new THREE.IcosahedronGeometry(r, 0);
    // merge duplicated vertices -> smooth normals -> round cel shading on a low-poly blob
    s.deleteAttribute('normal'); s.deleteAttribute('uv');
    const m = mergeVerts(s); m.scale(1, 0.86, 1); m.translate(bx, by, bz); m.computeVertexNormals();
    parts.push(paint(m, (x, y, z, c) => { const t = Math.min(1, Math.max(0, (y - (by - r)) / (2 * r))); c.copy(lin('#5f8c55')).lerp(lin('#a4c77a'), t * 0.9); }));
  }
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  // keep the blob smooth normals (recomputing on the non-indexed merge would facet them)
  return g;
}
function mergeVerts(geo) {
  const p = geo.attributes.position, map = new Map(), pos = [], idx = [];
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    let j = map.get(k); if (j === undefined) { j = pos.length / 3; map.set(k, j); pos.push(p.getX(i), p.getY(i), p.getZ(i)); }
    idx.push(j);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const TINTS = {
  0: ['#8fb08f', '#9dbb95', '#86a888', '#a9c29b'],                      // cedar (x vertex colours)
  1: ['#ffffff', '#f0f6e6', '#e5f0d8', '#fff7df', '#d9e8cf', '#f6f2d6'], // broadleaf greens
  2: ['#ffb46a', '#ff8f5e', '#ffd070', '#f7a45c', '#ff7a58'],            // early 紅葉
};
// [v3:harbor] shared so the 五十鈴神社 shrine grove on 神明崎 (harbor/grove.js) matches the environment's trees exactly
export { cedarGeometry, broadGeometry, TINTS as TREE_TINTS };

/** [v3:integrate] Seasonal tree material (instanced, vertex colours x per-instance tint). Leaves only (trunks are
 *  brown: r > g) turn with ctx.shared.uSeason: spring = sakura pink on about half the broadleaf trees and every 紅葉
 *  tree, fresh green on the rest; summer = deep green; autumn = as painted; winter = bare grey-brown broadleaf and
 *  dark cedars, snow on top (the toon snow patch). cedar: true for the cedar cones. */
export function treeMaterial(ctx, cedar = false) {
  const m = ctx.mat.toon('#ffffff', { vertexColors: true, paint: 0.05, name: cedar ? 'env-tree-cedar' : 'env-tree-broad' });
  if (m.userData.treeSeason) return m;
  m.userData.treeSeason = true;
  const base = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    base(sh, r);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTreeVtx; varying vec3 vTreeInst; varying float vTreeSeed; varying vec3 vTreeW;')
      .replace('#include <fog_vertex>', `#include <fog_vertex>
        {   // [v3:fix] world position for the painted blossom pattern
          vec4 tw = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            tw = instanceMatrix * tw;
          #endif
          vTreeW = (modelMatrix * tw).xyz;
        }`)
      .replace('#include <color_vertex>', `#include <color_vertex>
        vTreeVtx = vec3(1.0); vTreeInst = vec3(1.0); vTreeSeed = 0.5;
        #ifdef USE_COLOR
          vTreeVtx = color.rgb;
        #endif
        #ifdef USE_INSTANCING_COLOR
          vTreeInst = instanceColor.rgb;
        #endif
        #ifdef USE_INSTANCING
          vTreeSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vTreeVtx; varying vec3 vTreeInst; varying float vTreeSeed; varying vec3 vTreeW;
        float tr_h(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float tr_n(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(tr_h(i), tr_h(i + vec3(1,0,0)), f.x), mix(tr_h(i + vec3(0,1,0)), tr_h(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(tr_h(i + vec3(0,0,1)), tr_h(i + vec3(1,0,1)), f.x), mix(tr_h(i + vec3(0,1,1)), tr_h(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 vc = vTreeVtx;
          float leaf = step(vc.r * 1.08, vc.g);
          float koyo = step(vTreeInst.g * 1.12, vTreeInst.r);
          float lt = clamp((vc.g - 0.08) / 0.45, 0.0, 1.0);
          float vr = 0.9 + 0.2 * vTreeSeed;
          vec3 cur = diffuseColor.rgb;
          ${cedar ? `
          vec3 spr = cur * vec3(1.0, 1.1, 0.95);
          vec3 sum = cur * vec3(0.82, 0.95, 0.85);
          vec3 win = cur * vec3(0.8, 0.86, 0.9);` : `
          // [v3:fix] sakura: soft pale pink clouds of blossom, painted with world-space clumps and white speckles (the flat
          // faceted pink read as lollipops); on about 30 % of the broadleaves, fresh spring green on the rest
          float bl = tr_n(vTreeW * 0.9) * 0.6 + tr_n(vTreeW * 2.6 + 3.0) * 0.4;
          // [v3:fix] saturated blossom: #d98aa6 shade -> #f4b6c8 lit (linear), sparse white speckles (was a pale grey-pink)
          vec3 sak = mix(vec3(0.694, 0.254, 0.381), vec3(0.905, 0.468, 0.578), smoothstep(0.3, 0.75, bl * 0.7 + lt * 0.45)) * vr;
          sak = mix(sak, vec3(0.98, 0.78, 0.84), step(0.86, tr_h(floor(vTreeW * 5.0))) * 0.5);
          vec3 fresh = mix(vec3(0.24, 0.5, 0.11), vec3(0.5, 0.74, 0.24), lt) * vr;
          vec3 spr = (vTreeSeed < 0.3 || koyo > 0.5) ? sak : fresh;
          vec3 sum = mix(vec3(0.07, 0.23, 0.045), vec3(0.2, 0.43, 0.1), lt) * vr;
          vec3 win = mix(vec3(0.14, 0.1, 0.08), vec3(0.34, 0.28, 0.24), lt) * vr;`}
          vec3 sc = cur * uSeasonS.z + spr * uSeasonS.x + sum * uSeasonS.y + win * uSeasonS.w;
          diffuseColor.rgb = mix(cur, sc, leaf);
        }`);
  };
  m.customProgramCacheKey = () => (cedar ? 'paint-s-tree-c' : 'paint-s-tree-b');
  return m;
}

export async function buildTrees(ctx, lc) {
  const data = await L.loadData('trees.json').catch(() => null);
  if (!data) return null;
  const geos = [cedarGeometry(), broadGeometry(), broadGeometry()];
  const counts = [0, 0, 0];
  for (const r of data.rows) counts[r[3]]++;
  // [v3:integrate] seasonal tree materials (treeMaterial)
  const meshes = geos.map((g, t) => { const m = new THREE.InstancedMesh(g, treeMaterial(ctx, t === 0), Math.max(1, counts[t])); m.count = counts[t]; m.castShadow = true; m.receiveShadow = true; m.name = 'env-trees-' + data.types[t]; return m; });
  const fill = [0, 0, 0];
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), Sc = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  const list = [];
  for (const r of data.rows) {
    const [x, z, y, t, h, rad, tint] = r;
    const w = t === 0 ? rad / 0.22 : rad / 0.5;
    Q.setFromAxisAngle(Y, (tint / 255) * Math.PI * 2);
    P.set(x, y - 0.35, z); Sc.set(w, h, w);
    M4.compose(P, Q, Sc);
    const i = fill[t]++;
    meshes[t].setMatrixAt(i, M4);
    const pal = TINTS[t];
    col.set(pal[tint % pal.length]);
    meshes[t].setColorAt(i, col);
    list.push({ x, z, y, h, r: rad, type: data.types[t] });
  }
  const g = new THREE.Group(); g.name = 'env-trees';
  for (const m of meshes) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.computeBoundingSphere(); g.add(m); }
  ctx.add(g);
  let tris = 0; for (let t = 0; t < 3; t++) tris += (geos[t].index ? geos[t].index.count : geos[t].attributes.position.count) / 3 * counts[t];
  return { list, stats: { trees: data.rows.length, tris }, forestAt: null };
}
