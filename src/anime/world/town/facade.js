// [v3:town] Procedural anime facades for the mid (merged) and far (instanced) buildings: window grids painted in the
// cel shader from facade coordinates, per-building style (house / apartment / office / shop / warehouse / plain),
// ground-floor shopfronts with a coloured fascia band, corrugated ribs + rust runs on warehouses, soft grime at the
// base, anti-aliased by screen-space derivatives (no shimmer from the drone), and life's night windows
// (warm #ffd9a0 rooms per window cell, lit fraction per style).
//
// Merged meshes (mid): attributes  uv = (u along the facade m, v above the ground floor m), aFac = (style, seed, height, tint)
// Instanced meshes (far): per-instance aFac; u/v derived from the world position like Sakura's far town.
import { patchSnow, seasonUniform } from '../../core/season.js';   // [v3:integrate]
import * as THREE from 'three';
import { windowGlow } from '../life/lights.js';

export const STYLE = { house: 0, apartment: 1, office: 2, shop: 3, warehouse: 4, plain: 5, public: 6 };

const FACADE_GLSL = /* glsl */`
  float fa_hash(vec2 p){ p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
  // box step with derivative anti-aliasing: 1 inside [a,b]
  float fa_band(float x, float a, float b, float w){ return smoothstep(a - w, a + w, x) * (1.0 - smoothstep(b - w, b + w, x)); }
  // returns vec4(glass mask, frame mask, fascia mask, door mask); cell id in outCell
  vec4 facadeMask(float style, float seed, float hgt, vec2 uv, out vec3 outCell, out float litFrac, out float ribs){
    float u = uv.x, v = uv.y;
    float fw = max(fwidth(u), fwidth(v));
    ribs = 0.0; litFrac = 0.55;
    vec4 m = vec4(0.0);
    float FH = 2.9;
    float fl = floor(v / FH), fv = fract(v / FH);
    float top = step(v, hgt - 0.9);
    if (style < 0.5) {                     // house: two or three windows per floor, some cells blank
      float cw = 2.6 + fract(seed * 7.3) * 0.8;
      float ci = floor(u / cw), cu = fract(u / cw);
      float blank = step(fa_hash(vec2(ci + seed * 13.0, fl)), 0.28);
      float win = fa_band(cu, 0.22, 0.78, fw / cw) * fa_band(fv, 0.34, 0.78, fw / FH) * (1.0 - blank) * top;
      m.x = win; m.y = (fa_band(cu, 0.18, 0.82, fw / cw) * fa_band(fv, 0.3, 0.82, fw / FH) - win) * (1.0 - blank) * top;
      float door = step(fl, 0.5) * fa_band(cu, 0.3, 0.62, fw / cw) * fa_band(fv, 0.0, 0.72, fw / FH) * step(fa_hash(vec2(ci, seed)), 0.35);
      m.w = door; m.x *= 1.0 - door;
      outCell = vec3(ci, fl, seed * 97.0); litFrac = 0.6;
    } else if (style < 1.5) {              // apartment: regular grid, balcony slab lines
      float cw = 3.4, ci = floor(u / cw), cu = fract(u / cw);
      float win = fa_band(cu, 0.1, 0.9, fw / cw) * fa_band(fv, 0.3, 0.84, fw / FH) * top;
      m.x = win; m.y = fa_band(fv, 0.0, 0.1, fw / FH) * top;        // slab edge band
      outCell = vec3(ci, fl, seed * 97.0); litFrac = 0.66;
    } else if (style < 2.5 || style > 5.5) { // office / public
      // [v3:fix] three layouts by seed (the single ribbon read as v1 striped boxes): ribbon windows with a coloured
      // spandrel, punched windows in pairs, or a grid with a plain stair-core strip; plus a coping band at the roof line
      float var_ = fract(seed * 5.13);
      if (var_ < 0.34) {
        float cw = 1.8, ci = floor(u / cw), cu = fract(u / cw);
        float win = fa_band(fv, 0.32, 0.84, fw / FH) * (1.0 - fa_band(cu, 0.0, 0.05, fw / cw)) * top;
        m.x = win; m.y = fa_band(fv, 0.26, 0.32, fw / FH) * top;
        m.z = fa_band(fv, 0.02, 0.2, fw / FH) * top * step(0.5, fract(seed * 17.0)) * 0.55;   // spandrel colour band
        outCell = vec3(floor(u / 3.6), fl, seed * 97.0);
      } else if (var_ < 0.67) {
        float cw = 3.2, ci = floor(u / cw), cu = fract(u / cw);
        float pair = fa_band(cu, 0.14, 0.44, fw / cw) + fa_band(cu, 0.56, 0.86, fw / cw);
        float win = pair * fa_band(fv, 0.3, 0.8, fw / FH) * top;
        m.x = win; m.y = (fa_band(cu, 0.1, 0.9, fw / cw) * fa_band(fv, 0.26, 0.84, fw / FH) * top - win) * 0.8;
        outCell = vec3(ci, fl, seed * 97.0);
      } else {
        float cw = 2.4, ci = floor(u / cw), cu = fract(u / cw);
        float core = step(fract(ci * 0.137 + seed * 3.1), 0.12);                              // plain stair-core strip
        float win = fa_band(cu, 0.12, 0.88, fw / cw) * fa_band(fv, 0.28, 0.82, fw / FH) * top * (1.0 - core);
        m.x = win; m.y = fa_band(cu, 0.08, 0.92, fw / cw) * fa_band(fv, 0.24, 0.86, fw / FH) * top * (1.0 - core) - win;
        outCell = vec3(ci, fl, seed * 97.0);
      }
      m.z = max(m.z, fa_band(v, hgt - 0.75, hgt + 1.0, fw) * 0.8);                               // coping band
      litFrac = style > 5.5 ? 0.3 : 0.45;
    } else if (style < 3.5) {              // shop: glass ground floor + fascia band, house windows above
      if (fl < 0.5) {
        float cw = 3.0, cu = fract(u / cw);
        m.x = fa_band(fv, 0.06, 0.72, fw / FH) * (1.0 - fa_band(cu, 0.0, 0.04, fw / cw));
        m.z = fa_band(fv, 0.74, 0.98, fw / FH);
        outCell = vec3(floor(u / 3.0), 0.0, seed * 97.0); litFrac = 0.8;
      } else {
        float cw = 2.8, ci = floor(u / cw), cu = fract(u / cw);
        float win = fa_band(cu, 0.2, 0.8, fw / cw) * fa_band(fv, 0.34, 0.8, fw / FH) * top * (1.0 - step(fa_hash(vec2(ci + seed * 13.0, fl)), 0.2));
        m.x = win; outCell = vec3(ci, fl, seed * 97.0); litFrac = 0.62;
      }
    } else if (style < 4.5) {              // warehouse: ribs, shutters on the ground, a high window strip
      ribs = sin(u * 31.4159) * (1.0 - smoothstep(0.05, 0.25, fw));
      float cw = 6.5, ci = floor(u / cw), cu = fract(u / cw);
      float sh = step(v, 3.6) * fa_band(cu, 0.2, 0.8, fw / cw) * step(fa_hash(vec2(ci, seed)), 0.7);
      m.w = sh;
      float band = fa_band(v, hgt - 1.7, hgt - 1.05, fw) * fa_band(fract(u / 3.5), 0.08, 0.92, fw / 3.5);
      m.x = band; outCell = vec3(floor(u / 3.5), 9.0, seed * 97.0); litFrac = 0.2;
      // [v3:fix] a painted company colour stripe along the shed (blue / green / maroon), and on some sheds a sign board
      m.z = fa_band(v, hgt * 0.62, hgt * 0.62 + 0.9, fw) * step(0.3, fract(seed * 11.7));
      float signW = 9.0 + fract(seed * 3.7) * 6.0, su = mod(u + fract(seed * 7.1) * 40.0, 60.0);
      m.y = fa_band(su, 4.0, 4.0 + signW, fw) * fa_band(v, hgt - 3.4, hgt - 1.9, fw) * step(0.45, fract(seed * 23.3)) * step(6.5, hgt);
    }
    return m;
  }
`;

/**
 * @param {object} ctx
 * @param {{ instanced?: boolean }} o
 */
export function facadeMaterial(ctx, { instanced = false } = {}) {
  const key = 'town-facade|' + (instanced ? 'i' : 'm');
  if (ctx.mat.cache.has(key)) return ctx.mat.cache.get(key);
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: ctx.mat.gradientMap, vertexColors: !instanced });
  const W = windowGlow(ctx);
  m.onBeforeCompile = (sh) => {
    W.patch(sh);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aFac;
        varying vec4 vFac; varying vec2 vFacUV; varying vec3 vFacN; varying vec3 vFacW;`)
      .replace('#include <fog_vertex>', `#include <fog_vertex>
        {
          vFac = aFac;
          vec4 pw = vec4(transformed, 1.0); vec3 nn = objectNormal;
          #ifdef USE_INSTANCING
            pw = instanceMatrix * pw; nn = mat3(instanceMatrix) * nn;
          #endif
          vec3 wpos = (modelMatrix * pw).xyz; vFacW = wpos;
          vFacN = normalize(mat3(modelMatrix) * nn);
          #ifdef USE_INSTANCING
            vec3 b0 = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
            vec2 tang = normalize(vec2(-vFacN.z, vFacN.x) + 1e-5);
            vFacUV = vec2(dot(wpos.xz, tang), wpos.y - b0.y - 0.6);
          #else
            vFacUV = uv;
          #endif
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec4 vFac; varying vec2 vFacUV; varying vec3 vFacN; varying vec3 vFacW;
        ${FACADE_GLSL}`)
      .replace('void main() {', 'void main() {\n vec3 klcGlow = vec3(0.0);')
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 n = normalize(vFacN);
          float vert = 1.0 - step(0.55, abs(n.y));
          vec3 cell; float litFrac, ribs;
          vec4 fm = facadeMask(vFac.x, vFac.y, vFac.z, vFacUV, cell, litFrac, ribs);
          float dist = length(vFacW - cameraPosition);
          float fade = 1.0 - smoothstep(1400.0, 3200.0, dist);
          fm *= vert * fade;
          vec3 base = diffuseColor.rgb;
          // warehouse ribs + rust runs, soft grime at the base of every wall
          base *= 1.0 + 0.07 * ribs * vert;
          float rust = vFac.w * step(3.5, vFac.x) * step(vFac.x, 4.5) * vert;
          float run = smoothstep(0.55, 1.0, fa_hash(vec2(floor(vFacUV.x / 0.6), vFac.y))) * smoothstep(vFac.z, vFac.z - 3.5, vFacUV.y);
          base = mix(base, vec3(0.55, 0.3, 0.2), rust * run * 0.55);
          base *= 1.0 - (1.0 - smoothstep(-0.6, 0.5, vFacUV.y)) * 0.22 * vert;
          // glass: sky-tinted by day, dark by night; frames lighter; shop fascia gets an accent colour; doors dark wood/steel
          float gy = clamp(fract(vFacUV.y / 2.9) * 1.6 - 0.3, 0.0, 1.0);
          vec3 glass = mix(vec3(0.33, 0.41, 0.53), vec3(0.64, 0.72, 0.8), gy);
          glass *= 1.0 - 0.72 * klcWindowNight();
          vec3 accent = vec3(fa_hash(vec2(vFac.y, 3.0)), fa_hash(vec2(vFac.y, 7.0)), fa_hash(vec2(vFac.y, 11.0)));
          accent = mix(vec3(0.22, 0.4, 0.62), vec3(0.72, 0.28, 0.22), step(0.5, accent.x)) * mix(0.8, 1.2, accent.y);
          // [v3:fix] offices / public: muted coping + spandrel colours; warehouses: company stripe blue / green / maroon
          if (vFac.x > 1.5 && vFac.x < 2.5 || vFac.x > 5.5) accent = mix(vec3(0.36, 0.42, 0.52), vec3(0.62, 0.5, 0.42), step(0.55, accent.z)) * mix(0.9, 1.1, accent.y);
          if (vFac.x > 3.5 && vFac.x < 4.5) accent = accent.z < 0.4 ? vec3(0.2, 0.36, 0.6) : accent.z < 0.7 ? vec3(0.2, 0.46, 0.36) : vec3(0.5, 0.2, 0.2);
          // [v3:fix] pastel variation on big plain bodies (office / public / warehouse): tint the wall by seed
          if (vFac.x > 1.5 && vFac.x < 2.5 || vFac.x > 3.5) {
            vec3 tints[5]; tints[0] = vec3(0.96, 0.9, 0.8); tints[1] = vec3(0.84, 0.89, 0.93); tints[2] = vec3(0.86, 0.91, 0.84); tints[3] = vec3(0.94, 0.86, 0.82); tints[4] = vec3(0.89, 0.87, 0.93);
            int ti = int(floor(fa_hash(vec2(vFac.y, 19.0)) * 4.999));
            base = mix(base, base * tints[ti] * 1.04, 0.7);
          }
          base = mix(base, (vFac.x > 3.5 && vFac.x < 4.5) ? vec3(0.9, 0.9, 0.86) : base * 1.12 + 0.05, fm.y);
          base = mix(base, accent, fm.z);
          base = mix(base, vec3(0.42, 0.4, 0.44) * (vFac.x > 3.5 && vFac.x < 4.5 ? 1.55 : 1.0), fm.w * 0.9);
          base = mix(base, glass, fm.x * 0.9);
          diffuseColor.rgb = base;
          klcGlow = klcWindowGlow(cell, litFrac) * fm.x * (1.0 - smoothstep(2200.0, 4200.0, dist));
          klcGlow += klcWindowGlow(cell + 3.0, 0.85) * fm.z * 0.5;
        }`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += klcGlow;');
    patchSnow(sh, seasonUniform(ctx.shared), 'vFacW');   // [v3:integrate] winter snow on mid / far roofs
  };
  m.customProgramCacheKey = () => key;
  m.name = key;
  ctx.mat.cache.set(key, m);
  return m;
}
