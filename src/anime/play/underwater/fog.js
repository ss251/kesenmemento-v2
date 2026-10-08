// [play:underwater] The water volume, the caustics and the surface seen from below.
// One look, shared by every cel material, the terrain, the bay water and the sky dome. No extra render target.
// Every branch is on uSwim (a uniform): above the sea the chunk does nothing.
//
// Colours (和色大辞典, colordic.org):
//   near the surface  #3FB8C0, 浅葱色 #00A3AF lifted toward 新橋色 #59B9C6
//   about 7 m         #00A39F, 浅葱色 leaning to 青緑 #00A497 (the bay is a little green)
//   about 15 m        藍色 #165E83
//   the deep          鉄紺 #17184B
// Visibility is about 22 m: a thing 2 m away keeps its colour, at 10 m it is half water, by 25 m it is gone.

import * as THREE from 'three';
import { WATER, CAUSTIC_SCALE, causticOrigin, refractSun, swimLight } from './logic.js';

export const swimU = {
  uSwim: { value: 0 },
  uSwimNear: { value: new THREE.Color('#3FB8C0') },
  uSwimMid: { value: new THREE.Color('#00A39F') },
  uSwimDeep: { value: new THREE.Color('#165E83') },
  uSwimFar: { value: new THREE.Color('#17184B') },
  uSwimTime: { value: 0 },
  /** toward the sun, after refraction into the water (index.js writes it each frame from the sky's sun) */
  uSwimSun: { value: new THREE.Vector3(0.3, 0.9, 0.3).normalize() },
  /** daylight reaching the water: 1 by day, low at night */
  uSwimLight: { value: 1 },
  /** caustic and shaft strength: 0 at night */
  uSwimCau: { value: 1 },
  /**
   * The caustic net is evaluated relative to an origin near the eye: world coordinates ~4 km out keep only ~0.3 mm in
   * float32, coarser than a pixel on anything close. uSwimCellO is that origin in whole cells (a multiple of 256, exact),
   * uSwimCamQ the eye's offset from it in cells (small, exact). index.js writes both each frame.
   */
  uSwimCellO: { value: new THREE.Vector2() },
  uSwimCamQ: { value: new THREE.Vector2() },
};

const DECL = /* glsl */`
uniform float uSwim, uSwimTime, uSwimLight, uSwimCau;
uniform vec3 uSwimNear, uSwimMid, uSwimDeep, uSwimFar, uSwimSun;
uniform vec2 uSwimCellO, uSwimCamQ;
`;

const g = (x) => (Number.isInteger(x) ? x.toFixed(1) : String(x));
const S = WATER.stops;

/** Shared by the cel chunk, the surface and the sky dome. Prefixed sw_ so they never meet a host shader's names. */
export const SWIM_FN = /* glsl */`
// The water's own colour at a depth in metres.
vec3 sw_water(float d) {
  vec3 c = mix(uSwimNear, uSwimMid, smoothstep(${g(S.mid[0])}, ${g(S.mid[1])}, d));
  c = mix(c, uSwimDeep, smoothstep(${g(S.deep[0])}, ${g(S.deep[1])}, d));
  c = mix(c, uSwimFar, smoothstep(${g(S.far[0])}, ${g(S.far[1])}, d));
  return c * uSwimLight;
}
// The colour of the water seen along dir from an eye camD metres down, over a path of dist metres.
// Looking down reads deeper, looking up toward the light reads brighter, and the sun side glows (forward scatter).
vec3 sw_fogColor(vec3 dir, float camD, float dist) {
  float reach = min(dist, 20.0);
  vec3 c = sw_water(max(0.0, camD - dir.y * reach * 0.5));
  float up = clamp(dir.y, 0.0, 1.0);
  float sun = pow(max(dot(dir, uSwimSun), 0.0), 5.0);
  return c * (1.0 + up * 0.28 + sun * 0.42 * uSwimCau);
}
// How much of a surface is lost to the water over dist metres. Red goes first.
vec3 sw_fogK(float dist) {
  return 1.0 - exp(-pow(vec3(dist) * vec3(${g(WATER.ext[0])}, ${g(WATER.ext[1])}, ${g(WATER.ext[2])}), vec3(${g(WATER.shape)})));
}
// Sunlight left at depth h, a little cyan even in the shallows.
vec3 sw_light(float h) {
  return exp(-h * vec3(0.075, 0.032, 0.026)) * vec3(0.94, 1.02, 1.04);
}
`;

const CAUSTIC_FN = /* glsl */`
// A hash and a parabolic sine with no transcendental calls (Hoskins' hash22; the wave has period 1).
vec2 sw_h2(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy);
}
vec2 sw_wave(vec2 x) { x = fract(x) * 2.0 - 1.0; return 4.0 * x * (1.0 - abs(x)); }
// Distance to the nearest Voronoi edge, approximated as F2 - F1. Each point sits anywhere in its cell (so the cells
// differ in size) and drifts on a small loop; it never leaves the cell, so the 3x3 search stays exact.
// p is relative to the origin o (whole cells), so it stays exact; the hash sees the absolute cell.
float sw_cells(vec2 p, vec2 o, float t) {
  vec2 i = floor(p), f = fract(p);
  float f1 = 9.0, f2 = 9.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 h = sw_h2(i + g + o);
      vec2 r = g + 0.16 + 0.68 * h + 0.13 * sw_wave(h.yx + t * (0.5 + 0.5 * h)) - f;
      float d = dot(r, r);
      f2 = min(f2, max(f1, d));
      f1 = min(f1, d);
    }
  }
  return sqrt(f2) - sqrt(f1);
}
// The caustic network, 0..1+. w is the line's anti-alias width in cells: lines keep one crisp width and fade to their
// mean where they would get finer than a pixel, so the distance does not shimmer. Every warp frequency times 256 is a
// whole number, so moving the origin by 256 cells changes nothing.
float sw_net(vec2 q, vec2 o, float t, float w, float soft) {
  q += 0.12 * sw_wave(q.yx * 0.5 + vec2(t * 0.05, -t * 0.04)) + 0.05 * sw_wave(q * 1.25 + vec2(0.37, t * 0.06));
  float e = sw_cells(q, o, t * 0.12);
  float lw = 0.04 + soft * 0.05;
  float line = (1.0 - smoothstep(lw - w - soft * 0.04, lw + w + soft * 0.04, e)) * (1.0 - soft * 0.45);
  float glow = (1.0 - smoothstep(0.0, 0.22 + soft * 0.12, e)) * 0.2;
  // the net is never even: whole stretches brighten and fade as the swell passes
  float m = 0.55 + 0.45 * sw_wave(q * 0.125 + vec2(t * 0.021, 0.5)).x;
  return mix((line + glow) * m, 0.17, smoothstep(0.12, 0.34, w));
}
// v: eye to the point, world axes (exact); h: the point's depth; px: metres per pixel there.
// Projected along the refracted sun. The scale is fixed: a scale that changed with depth would multiply a world
// coordinate ~4 km out and slide the pattern a quarter cell per millimetre of height. Deeper, the lines soften instead.
float sw_caustic(vec3 v, float h, float px) {
  vec2 q = (v.xz - uSwimSun.xz / max(uSwimSun.y, 0.35) * h) * ${g(CAUSTIC_SCALE)} + uSwimCamQ;
  float soft = smoothstep(2.0, 12.0, h);
  float t = uSwimTime;
  float c = sw_net(q, uSwimCellO, t, px * ${g(CAUSTIC_SCALE)} * 1.4 + 1e-4, soft);
#ifdef SW_RICH
  // 0.53125 = 136/256: the second, larger net, on the same whole-cell origin
  c = max(c, sw_net(q * 0.53125 + 17.0, uSwimCellO * 0.53125, t * 0.8, px * ${g(CAUSTIC_SCALE)} * 0.74 + 1e-4, soft) * 0.6);
#endif
  return c;
}
`;

const CHUNK = /* glsl */`
{
  if (uSwim > 0.5) {
    vec3 swP = __VARY__;
#ifdef SW_VIEWPOS
    // Camera-relative, in world axes. World positions here are ~4 km out, where float32 keeps only ~0.2 mm: their
    // screen derivatives on a close object are mostly noise (it striped the ホヤ). The view position stays exact.
    vec3 swV = -(vec4(vViewPosition, 0.0) * viewMatrix).xyz;
#else
    vec3 swV = swP - cameraPosition;
#endif
    float swDist = length(swV);
    vec3 swDir = swV / max(swDist, 1e-4);
    float swCamD = max(-cameraPosition.y, 0.0);
    float swH = max(-swP.y, 0.0);
    // The face normal from the screen derivatives works on every material; turned to face the eye.
    vec3 swDx = dFdx(swV), swDy = dFdy(swV);
    vec3 swN = normalize(cross(swDx, swDy) + vec3(0.0, 1e-6, 0.0));
    if (dot(swN, swV) > 0.0) swN = -swN;
    float swPx = length(swDx.xz) + length(swDy.xz);
#ifdef SW_NORMAL
    // the smooth normal where the material has one: a per-triangle normal speckles the caustics on small, curved things
    vec3 swNs = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
#else
    vec3 swNs = swN;
#endif
    vec3 swCol = gl_FragColor.rgb * sw_light(swH);
    float swLit = smoothstep(0.08, 0.6, dot(swNs, uSwimSun)) * (1.0 - smoothstep(3.0, 16.0, swH))
      * (1.0 - smoothstep(14.0, 30.0, swDist)) * step(swP.y, 0.02) * uSwimCau;
    if (swLit > 0.003) {
      float swC = sw_caustic(swV, swH, swPx) * swLit;
      swCol += swCol * swC * 1.3 + vec3(0.85, 1.0, 0.95) * swC * 0.035 * uSwimLight;
    }
    gl_FragColor.rgb = mix(swCol, sw_fogColor(swDir, swCamD, swDist), sw_fogK(swDist));
  }
}
`;

/**
 * The surface from below (the bay water's shader only: it has the sky colours and the air-side sun).
 * Inside Snell's cone (48.6° from straight up) the sky comes through, squeezed into a bright disc with the horizon as
 * a thin ring at its edge and the sun as a glint. Outside it the surface is a mirror of the water below.
 * The normal moves with four swells, so the edge of the window wobbles and the glint breaks up.
 */
export const SNELL = /* glsl */`
{
  if (uSwim > 0.5 && cameraPosition.y < 0.05) {
    vec3 snV = -(vec4(vViewPosition, 0.0) * viewMatrix).xyz;   // eye to surface, exact near the eye (see the cel chunk)
    float snDist = length(snV);
    vec3 v = snV / max(snDist, 1e-4);
    float snCamD = max(-cameraPosition.y, 0.0);
    vec2 wp = vWp.xz;
    float t = uSwimTime;
    // a low swell and a fine chop: the edge of the window shivers instead of bulging
    // (at 4 m down the edge moves about 10 m per radian of tilt, so every slope here is small)
    vec2 g = vec2(0.92, 0.38) * cos(dot(wp, vec2(0.92, 0.38)) * 0.8 + t * 1.1) * 0.006;
    g += vec2(-0.45, 0.89) * cos(dot(wp, vec2(-0.45, 0.89)) * 2.1 + t * 1.7) * 0.006;
    g += vec2(0.71, -0.70) * cos(dot(wp, vec2(0.71, -0.70)) * 4.3 + t * 2.4) * 0.006;
    g += vec2(-0.96, -0.28) * cos(dot(wp, vec2(-0.96, -0.28)) * 7.9 + t * 3.3) * 0.006;
    g += vec2(0.28, 0.96) * cos(dot(wp, vec2(0.28, 0.96)) * 13.7 - t * 4.1) * 0.005;
    vec3 n = normalize(vec3(g.x, -1.0, g.y));
    float cosI = max(-dot(v, n), 0.0);
    float k = 1.0 - ${g(+(WATER.ior * WATER.ior).toFixed(4))} * (1.0 - cosI * cosI);
    float edge = fwidth(k) * 1.2 + 0.002;
    float win = smoothstep(-edge, edge, k);
    vec3 r = normalize(${g(WATER.ior)} * v + (${g(WATER.ior)} * cosI - sqrt(max(k, 0.0))) * n);
    float ry = clamp(r.y, 0.0, 1.0);
    vec3 sky = mix(uSkyHorizon, uSkyMid, smoothstep(0.0, 0.35, ry));
    sky = mix(sky, uSkyZenith, smoothstep(0.35, 1.0, ry));
    vec3 lift = mix(vec3(0.80, 0.95, 1.0), uSkyHorizon, 0.3) * (1.0 - uNightW * 0.9);
    vec3 bright = mix(sky, lift, 0.5) * 1.06;
    // the same net as the caustics on the bed, seen from its other side: the ceiling ripples
    vec2 snDx = dFdx(snV.xz), snDy = dFdy(snV.xz);
    float snPx = length(snDx) + length(snDy);
    float net = sw_net(snV.xz * ${g(CAUSTIC_SCALE)} + uSwimCamQ, uSwimCellO, t * 1.3, snPx * ${g(CAUSTIC_SCALE)} * 1.4 + 1e-4, 0.0);
    bright *= 0.88 + 0.24 * net;
    float ring = smoothstep(0.0, 0.06, k) * (1.0 - smoothstep(0.06, 0.2, k));
    bright += vec3(0.95, 1.0, 0.98) * ring * 0.2 * (1.0 - uNightW * 0.85);
    float sd = max(dot(r, uSunW), 0.0);
    bright += vec3(1.0, 0.96, 0.86) * (pow(sd, 700.0) * 2.4 + pow(sd, 40.0) * 0.16) * (1.0 - uNightW);
    // beyond the window the surface is a mirror of the water below, with the net faint on it
    vec3 mirror = sw_water(snCamD + 3.5) * (0.8 + 0.22 * net);
    vec3 col = mix(mirror, bright, win);
    gl_FragColor.rgb = mix(col, sw_fogColor(v, snCamD, snDist), sw_fogK(snDist));
  }
}
`;

/** The dome under the water: the fog colour at the end of a long path, so it meets the far water without a seam. */
export const SKY_SWIM = /* glsl */`
uniform float uSwimTime, uSwimLight, uSwimCau;
uniform vec3 uSwimMid, uSwimDeep, uSwimSun;
${SWIM_FN}
vec3 sw_dome(vec3 dir) { return sw_fogColor(dir, max(-cameraPosition.y, 0.0), 60.0); }
`;

/** Uniforms the sky dome binds (it declares uSwim, uSwimNear and uSwimFar itself). */
export function skySwimUniforms() {
  return {
    uSwimMid: swimU.uSwimMid, uSwimDeep: swimU.uSwimDeep, uSwimSun: swimU.uSwimSun,
    uSwimTime: swimU.uSwimTime, uSwimLight: swimU.uSwimLight, uSwimCau: swimU.uSwimCau,
  };
}

let rich = true;
/** The phone tier draws one caustic layer, every other tier two. Call before the programs compile (mount does). */
export function setSwimTier(phone) { rich = !phone; }

/** Patch a MeshToon / water / terrain shader. vary is the world-position varying already in that shader. */
export function applySwimFog(shader, vary, extra = '') {
  if (!shader.fragmentShader || shader.fragmentShader.includes('uniform float uSwim,')) return;
  for (const k of Object.keys(swimU)) shader.uniforms[k] = swimU[k];
  const view = /varying vec3 vViewPosition;/.test(shader.fragmentShader);
  const lit = shader.fragmentShader.includes('#include <normal_fragment_begin>');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\n' + (rich ? '#define SW_RICH 1\n' : '') + (view ? '#define SW_VIEWPOS 1\n' : '') + (lit ? '#define SW_NORMAL 1\n' : '') + DECL + SWIM_FN + CAUSTIC_FN)
    .replace('#include <fog_fragment>', '#include <fog_fragment>\n' + CHUNK.replaceAll('__VARY__', vary) + extra);
}

const LIGHT = { light: 1, caustic: 1 };
/**
 * The refracted sun for the water, and the light and caustic levels for the time of day. No allocation.
 * sun: toward the sun in the air (unit). night: 0..1 from the sky.
 */
export function updateSwimLight(sun, night, eye) {
  refractSun(sun, swimU.uSwimSun.value);
  if (eye) causticOrigin(eye.x, eye.z, swimU.uSwimCellO.value, swimU.uSwimCamQ.value);
  swimLight(sun.y, night, LIGHT);
  swimU.uSwimLight.value = LIGHT.light;
  swimU.uSwimCau.value = LIGHT.caustic;
}
