// [v3:foundation] environment/terrain.js — the terrain skin of the whole visual world.
// Four nested grids (hero 3.5 m · mid 10 m · city 70 m · horizon 450 m) with skirts, heights from L.heightAt
// (beyond the city bbox: the border height blended into procedural ridges on land, open sea elsewhere).
// Material: MeshToonMaterial (shadows, fog, cel ramp) patched with
//   - land-cover colour from the aerial photos (data/anime/landcover_*.png, snapped to the anime palette),
//   - painted forest crowns where the forest mask is set (dome normals in two scales so hills read as forest
//     from the promenade and from the drone), cedar / broadleaf patches and scattered early autumn crowns,
//   - soft slope and height tints, a warm shore band.
// Crown shading follows Sakura's distantMaterial (Kenton-GMI/sakuragaoka-station, MIT).
import * as THREE from 'three';
import { patchSnow, seasonUniform } from '../../core/season.js';   // [v3:integrate]
import { applySwimFog } from '../../play/underwater/fog.js';   // [play:underwater]
import * as L from '../layout.js';
import { sharedHardShores } from '../layout/hardshore.js';   // [v3:fix]
import { PHONE } from '../../core/tier.js';   // [v4:phone]

export const LOD = {
  hero: { cx: 185, cz: -15, half: 460, step: 3.5 },   // edges on the mid grid lines (multiples of 10 from the mid box)
  mid: { cx: 250, cz: 150, half: 1295, step: 10 },
  city: { step: 70, size: 18900 },
  patch: { step: 5, around: 150, ahead: 330 },   // [v3:polish3] walk-spot patches beyond the mid grid
  horizon: { step: 450, size: 54000 },
};

// ------------------------------------------------------------------ height beyond the city bbox
const F = L.ZONES.far;
function h21(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = h21(i, j), b = h21(i + 1, j), c = h21(i, j + 1), d = h21(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function ridges(x, z) { let s = 0, a = 0.5, f = 1 / 2600; for (let o = 0; o < 5; o++) { s += a * (1 - Math.abs(vnoise(x * f, z * f) * 2 - 1)); a *= 0.5; f *= 2.1; } return s; }
/** Terrain height everywhere (the city bbox from the DEM grids, procedural ridges or sea beyond). */
export function worldHeight(x, z) {
  const inside = x >= F.x0 && x <= F.x1 && z >= F.z0 && z <= F.z1;
  if (inside) return L.heightAt(x, z);
  const cx = Math.min(F.x1 - 20, Math.max(F.x0 + 20, x)), cz = Math.min(F.z1 - 20, Math.max(F.z0 + 20, z));
  const d = Math.hypot(x - cx, z - cz);
  const edge = L.heightAt(cx, cz);
  // the Pacific to the east / south-east stays open sea; land beyond the western and northern borders rises into ridges.
  // [v3:polish3] blended, not switched: the hard `x > 1500` test raised a vertical wall out of the sea at the south border
  const seaW = smooth(-110 - 0.5 * d, 30, L.shoreDist(cx, cz));   // the border point is water (was: shoreDist > -40); the coast widens with the distance out, so it never stands as a cliff
  const oceanW = Math.max(smooth(F.x1 - 650, F.x1 - 50, x), z > F.z1 - 50 ? smooth(300, 3400, x) : 0, seaW);   // a 3 km fall to the sea (1.2 km still read as a cliff)
  const ss = Math.min(1, d / 3000), seaH = edge * (1 - ss) - 18 * ss;
  if (oceanW >= 1) return seaH;
  const s = Math.min(1, d / 5000), t = s * s * (3 - 2 * s);
  const r = ridges(x, z);
  const landH = edge * (1 - t) + (140 + 620 * r * r) * t;
  return landH + (seaH - landH) * oceanW;
}
function smooth(e0, e1, v) { const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }

// ------------------------------------------------------------------ grids
function gridGeometry({ x0, z0, x1, z1, step, hole, cut = [], skirt, hfn, dropSeabed = true }) {
  const nx = Math.max(1, Math.round((x1 - x0) / step)), nz = Math.max(1, Math.round((z1 - z0) / step));
  const sx = (x1 - x0) / nx, sz = (z1 - z0) / nz;
  const W = nx + 1;
  const pos = new Float32Array(W * (nz + 1) * 3);
  const hs = new Float32Array(W * (nz + 1));
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = x0 + i * sx, z = z0 + j * sz, k = j * W + i;
    const y = hfn(x, z);
    hs[k] = y; pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
  }
  const idx = [];
  const inHole = (x, z) => hole && x > hole.x0 && x < hole.x1 && z > hole.z0 && z < hole.z1;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
    const cx = x0 + (i + 0.5) * sx, cz = z0 + (j + 0.5) * sz;
    if (inHole(cx - sx * 0.5, cz - sz * 0.5) && inHole(cx + sx * 0.5, cz + sz * 0.5)) continue;
    // [v3:polish3] walk-spot patches: every cell inside is dropped (the patch edge matches this grid exactly, see patchHeight)
    if (cut.some((h) => cx - sx * 0.5 > h.x0 - 1e-3 && cx + sx * 0.5 < h.x1 + 1e-3 && cz - sz * 0.5 > h.z0 - 1e-3 && cz + sz * 0.5 < h.z1 + 1e-3)) continue;
    if (dropSeabed && hs[a] < -1.2 && hs[b] < -1.2 && hs[c] < -1.2 && hs[d] < -1.2) continue;
    // split along the shorter diagonal-ish (follow the terrain: avoid bridging valleys)
    if (Math.abs(hs[a] - hs[d]) < Math.abs(hs[b] - hs[c])) { idx.push(a, c, d, a, d, b); } else { idx.push(a, c, b, b, c, d); }
  }
  let positions = Array.from(pos);
  if (skirt) {
    // vertical skirt around the border (hides cracks where a finer grid meets a coarser one)
    const ring = [];
    for (let i = 0; i <= nx; i++) ring.push(i);
    for (let j = 1; j <= nz; j++) ring.push(j * W + nx);
    for (let i = nx - 1; i >= 0; i--) ring.push(nz * W + i);
    for (let j = nz - 1; j >= 1; j--) ring.push(j * W);
    const base = positions.length / 3;
    for (const k of ring) positions.push(pos[k * 3], pos[k * 3 + 1] - skirt, pos[k * 3 + 2]);
    for (let r = 0; r < ring.length; r++) {
      const a = ring[r], b = ring[(r + 1) % ring.length], a2 = base + r, b2 = base + (r + 1) % ring.length;
      idx.push(a, b, a2, b, b2, a2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ material
export async function loadLandcover() {
  const meta = await L.loadData('landcover.json').catch(() => null);
  if (!meta || typeof document === 'undefined' || typeof Bun !== 'undefined') return { meta, tex: null };   // no images in bun (check.mjs)
  const loader = new THREE.TextureLoader();
  const load = (name, srgb) => loader.loadAsync(L.dataURL(name)).then((t) => {
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    if (!srgb) t.format = THREE.RedFormat;   // [mobile-perf] the forest masks are read for .r only: one byte a texel on the GPU, not four (2048² with mips: 22 -> 6 MB)
    t.flipY = false; t.needsUpdate = true;   // image row 0 = the north edge = v 0
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 4; t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    return t;
  }).catch(() => null);
  const [lcCore, lcCity, frCore, frCity] = await Promise.all([load(meta.core.file, true), load(meta.city.file, true), load(meta.core.forest, false), load(meta.city.forest, false)]);
  return { meta, tex: lcCore && lcCity && frCore && frCity ? { lcCore, lcCity, frCore, frCity } : null };
}

export function terrainMaterial(ctx, lc, o = {}) {
  const C = (c) => new THREE.Color(c);
  const m = new THREE.MeshToonMaterial({ color: C('#ffffff'), gradientMap: ctx.mat.gradientMap });
  m.name = 'env-terrain';
  const bb = (b) => new THREE.Vector4(b.x0, b.z0, 1 / (b.x1 - b.x0), 1 / (b.z1 - b.z0));
  const U = {
    tLcCore: { value: lc.tex?.lcCore || null }, tLcCity: { value: lc.tex?.lcCity || null },
    tFrCore: { value: lc.tex?.frCore || null }, tFrCity: { value: lc.tex?.frCity || null },
    uBbCore: { value: lc.meta ? bb(lc.meta.core) : new THREE.Vector4(0, 0, 1, 1) },
    uBbCity: { value: lc.meta ? bb(lc.meta.city) : new THREE.Vector4(0, 0, 1, 1) },
    uHasLc: { value: lc.tex ? 1 : 0 },
    // [v4:polish3] the painted canopy in the aerial photo's dark cedar greens (was #6f9a5c / #4f7a58 / #8db26a: a lime meadow)
    uForest: { value: C(o.forest || '#3d6b3f') }, uCedar: { value: C(o.cedar || '#2f5634') }, uBroad: { value: C(o.broad || '#5a8a4a') },
    uAutumnA: { value: C(o.autumnA || '#d9853f') }, uAutumnB: { value: C(o.autumnB || '#c65a3c') }, uAutumnC: { value: C(o.autumnC || '#e2b54a') },
    uAutumn: { value: o.autumn ?? 0.02 },   // [v5:fix1] 2 % painted 紅葉 crowns (was 8.5 %: orange flecks on every hillside; Earth 2026-03 is bare)
    // [v5:fix1] bare steep slopes #b3aa98 -> #8f877a (pale streaks on the hills; Earth 2026 shows them dark)
    uGrass: { value: C('#9fc076') }, uRock: { value: C('#8f877a') }, uShore: { value: C('#d9ceb0') }, uFar: { value: C('#7d9a70') },
    uCrown: { value: o.crown ?? 4.2 },
    uQuiet: { value: new THREE.Vector3(0, 0, 0) },   // [v3:harbor] (x, z, r): no painted 紅葉 crowns inside (a 3D grove stands there)
    uSakura: { value: 0 },   // [v3:integrate] spring 山桜 crown fraction (life's season controller drives uAutumn / uSakura)
    uNearK: { value: 0 },    // [v4:polish3] 1 with the eye near the ground (< ~60 m): painted ground detail replaces the photo cover up close
  };
  const uSeason = seasonUniform(ctx.shared);
  m.userData.uniforms = U;   // [v3:harbor] so other modules can set uQuiet
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.uniforms.uSunDirW = ctx.shared.uSunDir;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp; varying vec3 vWn;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\n vWp = (modelMatrix * vec4(transformed, 1.0)).xyz; vWn = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWp; varying vec3 vWn;
        uniform sampler2D tLcCore, tLcCity, tFrCore, tFrCity; uniform vec4 uBbCore, uBbCity; uniform float uHasLc, uAutumn, uCrown, uSakura, uNearK; uniform vec3 uQuiet;
        uniform vec3 uForest, uCedar, uBroad, uAutumnA, uAutumnB, uAutumnC, uGrass, uRock, uShore, uFar, uSunDirW;
        float t_h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        vec2 t_h22(vec2 p){ float a = t_h21(p); return vec2(a, t_h21(p + a * 17.17 + 3.1)); }
        float t_vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(t_h21(i), t_h21(i + vec2(1, 0)), f.x), mix(t_h21(i + vec2(0, 1)), t_h21(i + vec2(1, 1)), f.x), f.y); }
        // overlapping round crowns: xy = offset from the winning crown centre (radii), z = dome height (0 = gap), w = id
        vec4 t_crowns(vec2 p){
          vec2 i = floor(p), f = fract(p); float best = -9.0; vec4 res = vec4(0.0, 0.0, 0.0, 0.5);
          for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
            vec2 g = vec2(float(x), float(y)); vec2 h = t_h22(i + g);
            vec2 c = g + 0.18 + 0.64 * h; float rad = 0.62 + 0.28 * fract(h.x * 7.13 + h.y);
            vec2 o = (f - c) / rad; float r2 = dot(o, o);
            if (r2 < 1.0) { float hd = sqrt(1.0 - r2); float score = c.y * 0.55 + h.x * 0.5 + hd * 0.25;
              if (score > best) { best = score; res = vec4(o, hd, fract(h.x * 0.61 + h.y * 0.39 + 0.13)); } }
          }
          return res;
        }
        vec3 t_forestTint(float id, vec2 pp){
          // cedar plantations (dark, in patches), broadleaf (lighter), scattered early 紅葉
          float pc = t_vn(pp * 0.004 + 3.0) * 0.7 + t_vn(pp * 0.013) * 0.3;
          vec3 c = mix(uForest, uCedar, smoothstep(0.5, 0.62, pc));
          c = mix(c, uBroad, smoothstep(0.62, 0.75, t_vn(pp * 0.009 + 11.0)) * 0.6);
          c *= 0.92 + id * 0.16;
          float pa = t_vn(pp * 0.006 + 21.0);
          float autumn = step(id, uAutumn * (0.4 + 1.6 * smoothstep(0.45, 0.75, pa)) * mix(0.5, 1.0, smoothstep(180.0, 420.0, length(vWp - cameraPosition))));   // [v3:polish3] half as many painted flecks near the eye (under the 安波山 rail they read as floating fish)
          autumn *= step(uQuiet.z, length(pp - uQuiet.xy));   // [v3:harbor] quiet zone (the 神明崎 shrine grove)
          autumn *= smoothstep(25.0, 80.0, length(vWp - cameraPosition));   // [v3:polish] up close the painted crowns smear into red streaks on steep slopes (安波山 lookout); the 3D trees carry the colour there
          vec3 ac = id < uAutumn * 0.35 ? uAutumnB : (id < uAutumn * 0.75 ? uAutumnA : uAutumnC);
          vec3 r = mix(c, ac, autumn * (1.0 - smoothstep(0.5, 0.62, pc) * 0.8));
          // [v3:integrate] seasons: spring 山桜 crowns, summer deep green, winter bare broadleaf (cedar stays green)
          float broadM = 1.0 - smoothstep(0.5, 0.62, pc);
          float sak = step(id, uSakura * (0.5 + 1.5 * smoothstep(0.4, 0.7, pa))) * (1.0 - (1.0 - broadM) * 0.9) * step(uQuiet.z, length(pp - uQuiet.xy));
          r = mix(r, mix(vec3(0.82, 0.43, 0.52), vec3(0.92, 0.63, 0.7), fract(id * 7.13)), sak);
          r = mix(r, r * vec3(1.0, 1.08, 0.9), uSeasonS.x * (1.0 - sak));
          r = mix(r, r * vec3(0.8, 0.97, 0.78), uSeasonS.y);
          r = mix(r, mix(r, vec3(0.2, 0.15, 0.12) * (0.85 + id * 0.3), broadM * 0.8), uSeasonS.w);
          return r;
        }
        float gForest; vec3 gCrownN; float gGap;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec2 xz = vWp.xz;
          vec2 uvC = (xz - uBbCore.xy) * uBbCore.zw, uvF = (xz - uBbCity.xy) * uBbCity.zw;
          float inCore = step(0.0, uvC.x) * step(uvC.x, 1.0) * step(0.0, uvC.y) * step(uvC.y, 1.0);
          float edgeC = inCore * smoothstep(0.0, 0.02, min(min(uvC.x, 1.0 - uvC.x), min(uvC.y, 1.0 - uvC.y)));
          float inCity = step(0.0, uvF.x) * step(uvF.x, 1.0) * step(0.0, uvF.y) * step(uvF.y, 1.0);
          vec3 lc = uFar; float fr = 0.6;
          if (uHasLc > 0.5) {
            vec3 lcF = texture2D(tLcCity, clamp(uvF, 0.0, 1.0)).rgb; float frF = texture2D(tFrCity, clamp(uvF, 0.0, 1.0)).r;
            vec3 lcC = texture2D(tLcCore, clamp(uvC, 0.0, 1.0)).rgb; float frC = texture2D(tFrCore, clamp(uvC, 0.0, 1.0)).r;
            lc = mix(lcF, lcC, edgeC); fr = mix(frF, frC, edgeC);
            // outside the city bbox: forests on the ridges, fields in the valleys
            float outside = 1.0 - inCity;
            lc = mix(lc, mix(uGrass, uForest, smoothstep(40.0, 120.0, vWp.y)), outside);
            fr = mix(fr, smoothstep(30.0, 110.0, vWp.y), outside);
          } else { fr = smoothstep(15.0, 60.0, vWp.y); lc = mix(uGrass, uForest, fr); }
          // [v4:polish3] at eye level the 2 m/px land cover magnified into blurry camouflage blobs: near the eye it fades to
          // the cover's flat colour over ~20 m (a coarse mip) with painted detail on top: grass blades and clumps on the
          // green classes, a fine grain on paving and bare ground. The photo-derived cover comes back beyond ~150 m and
          // above ~60 m of altitude (uNearK, set per frame by environment.js).
          if (uNearK > 0.001 && uHasLc > 0.5) {
            float kN = uNearK * (1.0 - smoothstep(70.0, 170.0, length(vWp - cameraPosition))) * edgeC;
            if (kN > 0.001) {
              vec3 flatC = texture2D(tLcCore, clamp(uvC, 0.0, 1.0), 3.5).rgb;
              float green = smoothstep(1.15, 1.45, flatC.g / max(0.001, 0.5 * (flatC.r + flatC.b)));   // linear: grass 2.0, field 1.6, town 1.05
              // grass: short directional blades (stretched noise), darker clumps and a few sun-dried patches
              float blade = t_vn(xz * vec2(5.5, 1.6)) * 0.55 + t_vn(xz * vec2(1.7, 4.3) + 9.0) * 0.45;
              float clump = t_vn(xz * 0.45 + 4.0), dry = smoothstep(0.62, 0.8, t_vn(xz * 0.11 + 17.0));
              vec3 grassC = flatC * (0.9 + 0.16 * blade) * (1.0 - 0.1 * smoothstep(0.55, 0.8, clump));
              grassC = mix(grassC, grassC * vec3(1.12, 1.04, 0.78), dry * 0.45);
              // paving / bare ground: fine grain and faint large stains
              float grain = t_vn(xz * 7.0) * 0.5 + t_vn(xz * 2.3 + 5.0) * 0.5, stain = t_vn(xz * 0.08 + 2.0);
              vec3 paveC = flatC * (0.965 + 0.06 * grain) * (0.97 + 0.05 * stain);
              lc = mix(lc, mix(paveC, grassC, green), kN);
            }
          }
          lc = klcSeasonGround(lc);   // [v3:integrate]
          vec3 N = normalize(vWn);
          float slope = 1.0 - N.y;
          // steep bare slopes read as rock; the warm shore band just above the sea
          lc = mix(lc, uRock, smoothstep(0.55, 0.8, slope) * (1.0 - fr) * 0.7);
          lc = mix(lc, uShore, (1.0 - smoothstep(0.5, 1.6, vWp.y)) * 0.35 * (1.0 - fr));
          // forest crowns: near (uCrown m) and far clusters (uCrown * 3.4)
          float f = smoothstep(0.32, 0.62, fr);
          gForest = f; gCrownN = vec3(0.0); gGap = 0.0;
          vec3 base = lc;
          if (f > 0.001) {
            vec2 q1 = xz / uCrown, q2 = xz / (uCrown * 3.4);
            float fw = length(fwidth(q1));
            float d1 = 1.0 - smoothstep(0.25, 0.6, fw);
            float d2 = (1.0 - smoothstep(0.3, 0.75, fw / 3.4)) * (1.0 - d1 * 0.85);
            vec4 c1 = d1 > 0.001 ? t_crowns(q1) : vec4(0.0, 0.0, 0.0, 0.5);
            vec4 c2 = d2 > 0.001 ? t_crowns(q2 + 7.3) : vec4(0.0, 0.0, 0.0, 0.5);
            vec4 c = d1 >= d2 ? c1 : c2; float det = max(d1, d2);
            float cover = step(0.0001, c.z);
            vec3 T = vec3(1.0, 0.0, 0.0), B = vec3(0.0, 0.0, 1.0);
            gCrownN = (T * c.x + B * c.y) * 0.95 * cover * det * f;
            gGap = (1.0 - cover) * det * f;
            float id = c.w;
            vec3 ft = t_forestTint(id, xz);
            // autumn crowns only where a crown is resolvable (no orange flecks at the fading LOD)
            ft = mix(t_forestTint(0.5, xz) * (0.92 + id * 0.16), ft, smoothstep(0.55, 0.85, d1));   // big far clusters stay green
            // far forest without resolvable crowns: blend the patch colours
            vec3 ftFar = t_forestTint(0.5, xz);
            base = mix(lc, mix(ftFar, ft, det), f);
          }
          diffuseColor.rgb = base;
        }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (gForest > 0.001) {
          vec3 wn = normalize(vWn);
          vec3 crownN = normalize(wn * 1.25 + gCrownN);
          normal = normalize(mix(normal, (viewMatrix * vec4(crownN, 0.0)).xyz, 0.75));
        }`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        reflectedLight.directDiffuse *= 1.0 - gGap * 0.55;
        reflectedLight.indirectDiffuse *= 1.0 - gGap * 0.35;`);
    patchSnow(sh, uSeason, 'vWp');   // [v3:integrate] seasons (helpers + winter snow on the ground and crown tops)
    applySwimFog(sh, 'vWp');   // [play:underwater]
  };
  m.customProgramCacheKey = () => 'klc-terrain';
  return m;
}

/** [v3:polish3] Height of the drawn triangle of a gridGeometry grid at (x, z): same cells, same diagonal rule. */
export function gridSurfaceAt(b, step, hfn, x, z) {
  const nx = Math.max(1, Math.round((b.x1 - b.x0) / step)), nz = Math.max(1, Math.round((b.z1 - b.z0) / step));
  const sx = (b.x1 - b.x0) / nx, sz = (b.z1 - b.z0) / nz;
  const i = Math.max(0, Math.min(nx - 1, Math.floor((x - b.x0) / sx))), j = Math.max(0, Math.min(nz - 1, Math.floor((z - b.z0) / sz)));
  const x0 = b.x0 + i * sx, z0 = b.z0 + j * sz, u = (x - x0) / sx, v = (z - z0) / sz;
  const ha = hfn(x0, z0), hb = hfn(x0 + sx, z0), hc = hfn(x0, z0 + sz), hd = hfn(x0 + sx, z0 + sz);
  if (Math.abs(ha - hd) < Math.abs(hb - hc)) return u >= v ? ha + (hb - ha) * u + (hd - hb) * v : ha + (hc - ha) * v + (hd - hc) * u;   // split a-d
  return u + v <= 1 ? ha + (hb - ha) * u + (hc - ha) * v : hd + (hc - hd) * (1 - u) + (hb - hd) * (1 - v);                           // split b-c
}

// ------------------------------------------------------------------ [sys:16] the terrain mesh under the roads
// Outside the hero box the mesh is a 10 m triangulated grid (5 m patches; 3.5 / 5 m hero), and on concave ground and hillside cuts its triangles pass above the
// true surface, so the road ribbons (draped on the DEM + 0.05 / 0.14 m) lay under it: 17.7 % of road samples (up to 3.7 m) were buried and the roads rendered
// torn. The fix pulls the MESH down under the roads and leaves the roads alone (cars, walkers, lots and parking stay on the real DEM): every grid vertex
// whose cells touch a road ribbon (half-width + 1 m; tunnels and bridges skipped) is clamped to at most the lowest road height over those cells minus 0.05 m.
export const ROAD_CAP = { margin: 0.05, around: 1.0, edgeReach: 1.0, step: 2 };
/** The road samples [x, z, y (road height - margin), reach] of the drawn roads: the centre line (reach = half-width + 1 m) and both edges (reach 1 m), every 2 m. */
export function roadCapSamples(roads, Lw = L, lift = (x, z) => (Math.hypot(x - 180, z + 20) < 420 ? 0.05 : 0.14)) {
  const out = [];
  for (const r of roads) {
    if (r.tunnel || r.kind === 'bridge' || !r.pts || r.pts.length < 2) continue;
    const hw = (r.width || 4) / 2;
    for (let i = 1; i < r.pts.length; i++) {
      const a = r.pts[i - 1], b = r.pts[i], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
      if (len < 1e-3) continue;
      const nx = -dz / len, nz = dx / len, n = Math.max(1, Math.ceil(len / ROAD_CAP.step));
      for (let k = 0; k <= n; k++) {
        const x = a[0] + (dx * k) / n, z = a[1] + (dz * k) / n;
        for (const [o, reach] of [[0, hw + ROAD_CAP.around], [-hw, ROAD_CAP.edgeReach], [hw, ROAD_CAP.edgeReach]]) {
          const px = x + nx * o, pz = z + nz * o;
          if (Lw.isWater(px, pz)) continue;
          out.push(px, pz, Lw.heightAt(px, pz) + lift(px, pz) - ROAD_CAP.margin, reach);
        }
      }
    }
  }
  return Float32Array.from(out);
}
/** Per-vertex caps of one grid (Infinity where no ribbon touches): the minimum over the (up to 4) cells around the vertex of the lowest road height in them. */
export function roadCapGrid(samples, b, step) {
  const nx = Math.max(1, Math.round((b.x1 - b.x0) / step)), nz = Math.max(1, Math.round((b.z1 - b.z0) / step));
  const sx = (b.x1 - b.x0) / nx, sz = (b.z1 - b.z0) / nz, cell = new Float32Array(nx * nz).fill(Infinity);
  for (let k = 0; k < samples.length; k += 4) {
    const x = samples[k], z = samples[k + 1], y = samples[k + 2], r = samples[k + 3];
    if (x + r < b.x0 || x - r > b.x1 || z + r < b.z0 || z - r > b.z1) continue;
    const i0 = Math.max(0, Math.floor((x - r - b.x0) / sx)), i1 = Math.min(nx - 1, Math.floor((x + r - b.x0) / sx)), j0 = Math.max(0, Math.floor((z - r - b.z0) / sz)), j1 = Math.min(nz - 1, Math.floor((z + r - b.z0) / sz));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const c = j * nx + i; if (y < cell[c]) cell[c] = y; }
  }
  const W = nx + 1, vert = new Float32Array(W * (nz + 1)).fill(Infinity);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const y = cell[j * nx + i]; if (y === Infinity) continue; for (const [di, dj] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const v = (j + dj) * W + i + di; if (y < vert[v]) vert[v] = y; } }
  return { b, nx, nz, sx, sz, W, vert };
}
/** hfn clamped to the road caps of a grid (the grid's vertices only: gridGeometry and gridSurfaceAt sample it there). */
export function capHeight(hfn, grid) {
  if (!grid) return hfn;
  const { b, nx, nz, sx, sz, W, vert } = grid;
  return (x, z) => {
    const y = hfn(x, z), i = Math.round((x - b.x0) / sx), j = Math.round((z - b.z0) / sz);
    if (i < 0 || j < 0 || i > nx || j > nz) return y;
    const c = vert[j * W + i];
    return c < y ? c : y;
  };
}

// ------------------------------------------------------------------ walk-spot patches
/** [v3:polish3] Boxes (on the city grid lines) round every tour walk spot outside the mid box: `around` metres each way,
 *  plus `ahead` metres toward the view; clipped off the mid box so no cell is drawn twice. */
export function walkPatches(midBox, cityBox, spots = L.TOUR.map((t) => t.walk).filter(Boolean)) {
  const P = LOD.patch, st = LOD.city.step, out = [];
  const snapLo = (v, o) => o + Math.floor((v - o) / st) * st, snapHi = (v, o) => o + Math.ceil((v - o) / st) * st;
  for (const w of spots) {
    if (w.x >= midBox.x0 && w.x <= midBox.x1 && w.z >= midBox.z0 && w.z <= midBox.z1) continue;
    const fx = -Math.sin(w.yaw * Math.PI / 180), fz = -Math.cos(w.yaw * Math.PI / 180);
    const b = {
      x0: snapLo(Math.min(w.x - P.around, w.x + fx * P.ahead - P.around * 0.6), cityBox.x0), x1: snapHi(Math.max(w.x + P.around, w.x + fx * P.ahead + P.around * 0.6), cityBox.x0),
      z0: snapLo(Math.min(w.z - P.around, w.z + fz * P.ahead - P.around * 0.6), cityBox.z0), z1: snapHi(Math.max(w.z + P.around, w.z + fz * P.ahead + P.around * 0.6), cityBox.z0),
    };
    // clip off the mid box on the side the spot is on (the mid box edges lie on city grid lines too)
    const ox = Math.min(b.x1, midBox.x1) - Math.max(b.x0, midBox.x0), oz = Math.min(b.z1, midBox.z1) - Math.max(b.z0, midBox.z0);
    if (ox > 0 && oz > 0) {
      if (w.z > midBox.z1) b.z0 = Math.max(b.z0, midBox.z1); else if (w.z < midBox.z0) b.z1 = Math.min(b.z1, midBox.z0);
      else if (w.x > midBox.x1) b.x0 = Math.max(b.x0, midBox.x1); else b.x1 = Math.min(b.x1, midBox.x0);
    }
    if (b.x1 - b.x0 >= st && b.z1 - b.z0 >= st && !out.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.z0 < o.z1 && b.z1 > o.z0)) out.push(b);
  }
  return out;
}

// ------------------------------------------------------------------ build
export function buildTerrain(ctx, mat, { roads = null } = {}) {   // [sys:16] roads: the drawn roads (layout hero + mid, explore's core); the mesh is pulled down under them
  const g = new THREE.Group(); g.name = 'env-terrain';
  const M = LOD.mid;
  const H = ctx.quality?.phone ? { ...LOD.hero, step: PHONE.terrainStep } : LOD.hero;   // [v4:phone] 920 / 5: still on the mid grid lines
  const heroBox = { x0: H.cx - H.half, x1: H.cx + H.half, z0: H.cz - H.half, z1: H.cz + H.half };
  const midBox = { x0: M.cx - M.half, x1: M.cx + M.half, z0: M.cz - M.half, z1: M.cz + M.half };
  const add = (geo, name) => { const mesh = new THREE.Mesh(geo, mat); mesh.name = name; mesh.receiveShadow = true; mesh.castShadow = false; g.add(mesh); return mesh; };
  const stats = {};
  const t = (name, fn) => { const t0 = performance.now(); const geo = fn(); stats[name] = { tris: geo.index.count / 3, ms: Math.round(performance.now() - t0) }; add(geo, 'terrain-' + name); };
  // nested boxes share grid lines (each inner box edge lies on the outer grid) so holes cut exactly; skirts hide T-cracks
  const around = (inner, size, step, cx, cz) => {
    const x0 = inner.x0 - Math.round((inner.x0 - (cx - size / 2)) / step) * step, z0 = inner.z0 - Math.round((inner.z0 - (cz - size / 2)) / step) * step;
    return { x0, z0, x1: x0 + size, z1: z0 + size };
  };
  const cityBox = around(midBox, LOD.city.size, LOD.city.step, (F.x0 + F.x1) / 2, (F.z0 + F.z1) / 2);
  const horBox = around(cityBox, LOD.horizon.size, LOD.horizon.step, (F.x0 + F.x1) / 2, (F.z0 + F.z1) / 2);
  // [v3:fix] in front of a quay / seawall face the ground drops under the sea (no sand slope climbing the wall)
  const HS = sharedHardShores(L);
  const hq0 = (x, z) => HS.clampY(x, z, L.heightAt(x, z));
  // [sys:16] the road caps of each fine grid (the 70 m city grid and the horizon are left alone: a 70 m cell cut to a road would flatten a hillside)
  const caps = roads && roads.length ? roadCapSamples(roads) : null;
  const heroCap = caps && roadCapGrid(caps, heroBox, H.step), midCap = caps && roadCapGrid(caps, midBox, M.step);
  const hqHero = capHeight(hq0, heroCap), hq = capHeight(hq0, midCap);   // hq: the mid grid's height (patches and the DEM along the mid box edge use hq0 below)
  const hqPatch = (b) => capHeight(hq0, caps && roadCapGrid(caps, b, LOD.patch.step));
  t('hero', () => gridGeometry({ ...heroBox, step: H.step, skirt: 3, hfn: hqHero }));
  t('mid', () => gridGeometry({ ...midBox, step: M.step, hole: heroBox, skirt: 6, hfn: hq }));
  // [v3:polish3] fine patches round the walk spots beyond the mid grid (かなえ大橋, 大島): on the 70 m city grid the
  // walker stood on bare, flat triangles up to 9 m off the DEM. Each patch lies on city grid lines (cut from the city
  // grid like the mid box), reaches toward the view, and never overlaps the mid box.
  const patches = walkPatches(midBox, cityBox);
  // the patch follows the DEM inside and the city grid's own triangles along its edge (no crack, no step)
  const cityAt = (x, z) => gridSurfaceAt(cityBox, LOD.city.step, worldHeight, x, z);
  // (a side shared with the mid box keeps the DEM: the mid grid samples the same heights along it)
  const patchHeight = (b) => {
    const hqP = hqPatch(b);
    const onMid = { x0: b.x0 === midBox.x1, x1: b.x1 === midBox.x0, z0: b.z0 === midBox.z1, z1: b.z1 === midBox.z0 };
    return (x, z) => {
      const e = Math.min(onMid.x0 ? 1e9 : x - b.x0, onMid.x1 ? 1e9 : b.x1 - x, onMid.z0 ? 1e9 : z - b.z0, onMid.z1 ? 1e9 : b.z1 - z);
      const hp = hqP(x, z), k = smooth(0, 40, e); if (k >= 1) return hp;
      const c = cityAt(x, z); return c + (hp - c) * k;
    };
  };
  patches.forEach((b, i) => t('patch' + i, () => gridGeometry({ ...b, step: LOD.patch.step, skirt: 4, hfn: patchHeight(b) })));
  t('city', () => gridGeometry({ ...cityBox, step: LOD.city.step, hole: midBox, cut: patches, skirt: 30, hfn: worldHeight }));
  t('horizon', () => gridGeometry({ ...horBox, step: LOD.horizon.step, hole: cityBox, hfn: worldHeight }));
  ctx.noBatch(g);
  ctx.addStatic(g);
  // [v3:polish3] the rendered surface height (the same grid + diagonal rule as gridGeometry), so props scattered on the
  // coarse grids (大島, かなえ大橋: 70 m cells) sit on the drawn triangles, not on the DEM that the triangles skip
  const grids = [[heroBox, H.step, hqHero], [midBox, M.step, hq], ...patches.map((b) => [b, LOD.patch.step, patchHeight(b)]), [cityBox, LOD.city.step, worldHeight], [horBox, LOD.horizon.step, worldHeight]];
  function surfaceAt(x, z) {
    for (const [b, step, hfn] of grids) if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) return gridSurfaceAt(b, step, hfn, x, z);
    return worldHeight(x, z);
  }
  return { group: g, stats, boxes: { heroBox, midBox, cityBox, horBox, patches }, surfaceAt };
}
