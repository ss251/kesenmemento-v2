// Painted anime sky dome + sun/ambient lights + time-of-day core.
// Ported from Sakuragaoka Station (Kenton-GMI/sakuragaoka-station, MIT; see src/anime/LICENSE-sakuragaoka-station).
// [v3:foundation] Kesennuma: big painted cumulus (a mid-level field + towering banks on the horizon), warm-lit at
// sunset, drifting with the wind; a per-hour palette that drives the dome, fog, lights and the composite grading;
// stars at night; the shadow box and fog density scale with the camera altitude (drone views).
//   sky.setHours(h)   standalone time of day (JST hours on the demo day): sun, palette, lights, fog, grading
//   sky.setTime(T)    driven by the life package (ctx.services.time): palette, sun, night, weather (lights stay life's)
//   sky.setView(alt)  camera height above ground (main.js calls it every frame)
import * as THREE from 'three';
import { LAYER_NO_OUTLINE } from './materials.js';
import { sunDirAt } from '../world/layout.js';

export const FOG_COLOR = new THREE.Color('#d8dfe9');

// Art-directed palette keyframes (sRGB hex). A painted anime sky, never a physical one.
// sunI / hemiI: light intensities for MeshToonMaterial (Sakura's day = 2.75 / 1.62).
const K = [
  { h: 0.0, zenith: '#0d1631', mid: '#1a2850', horizon: '#33406b', warm: '#3d4674', fog: '#27315a', sun: '#8fa6e6', sunI: 0.6, hemiSky: '#51639e', hemiGround: '#2b2842', hemiI: 1.05, cloudLit: '#56628f', cloudShade: '#2c3358', exposure: 1.02, bloom: 0.55, glow: 0.3, leak: 0.0, night: 1 },
  { h: 4.7, zenith: '#152044', mid: '#233466', horizon: '#46507e', warm: '#5a5a86', fog: '#2e3864', sun: '#8fa6e6', sunI: 0.55, hemiSky: '#56679f', hemiGround: '#2d2a44', hemiI: 1.05, cloudLit: '#5d6795', cloudShade: '#303860', exposure: 1.02, bloom: 0.52, glow: 0.28, leak: 0.0, night: 1 },
  { h: 5.4, zenith: '#3a4f8c', mid: '#8a8dbd', horizon: '#f0b6a4', warm: '#ffc59c', fog: '#b6a8c0', sun: '#ffb487', sunI: 0.9, hemiSky: '#9c9fd6', hemiGround: '#b7a0a8', hemiI: 1.25, cloudLit: '#ffc3a8', cloudShade: '#8e89b8', exposure: 1.0, bloom: 0.42, glow: 0.22, leak: 0.7, night: 0.3 },
  { h: 6.5, zenith: '#5f8fcf', mid: '#b4c2e2', horizon: '#f5cdbf', warm: '#ffc9ae', fog: '#e8d8dc', sun: '#ffe6c8', sunI: 2.5, hemiSky: '#b2bdec', hemiGround: '#c9c3d2', hemiI: 1.58, cloudLit: '#fff4ea', cloudShade: '#b8c0e0', exposure: 1.02, bloom: 0.36, glow: 0.18, leak: 0.55, night: 0 },   // [v3:polish] clear warm peach morning (was a washed-out cool haze)  [v3:polish3] cooler zenith, pink horizon, pearl fog + low mist (renderer uMist): 朝 must not read as 16:30
  { h: 9.0, zenith: '#3f86d8', mid: '#8dbdeb', horizon: '#dbe8f3', warm: '#f7e8d6', fog: '#d3dfed', sun: '#fff2df', sunI: 2.75, hemiSky: '#a9b3ee', hemiGround: '#d9c6c8', hemiI: 1.62, cloudLit: '#fbfbf7', cloudShade: '#c3cbe6', exposure: 1.0, bloom: 0.3, glow: 0.13, leak: 0.8, night: 0 },
  { h: 12.0, zenith: '#2f7ddc', mid: '#86bdf0', horizon: '#e9f2fa', warm: '#f7f3ea', fog: '#dbe6f2', sun: '#fffaf0', sunI: 3.15, hemiSky: '#a2b0ee', hemiGround: '#cdc3c6', hemiI: 1.45, cloudLit: '#ffffff', cloudShade: '#bcc6e8', exposure: 1.0, bloom: 0.26, glow: 0.1, leak: 0.45, night: 0 },   // [v3:fix] white-blue noon, crisper shadows
  { h: 15.2, zenith: '#4389d6', mid: '#91bde8', horizon: '#e4e5ea', warm: '#fbe1c6', fog: '#d8dce8', sun: '#ffecd2', sunI: 2.8, hemiSky: '#a9b2ec', hemiGround: '#dbc5c3', hemiI: 1.6, cloudLit: '#fff8ee', cloudShade: '#c1c3e4', exposure: 1.0, bloom: 0.32, glow: 0.14, leak: 1.0, night: 0 },
  { h: 16.5, zenith: '#4d86cf', mid: '#9dbde3', horizon: '#f6dcc2', warm: '#ffcc98', fog: '#e4d9d6', sun: '#ffdcae', sunI: 2.8, hemiSky: '#aaa9e2', hemiGround: '#e0c0b6', hemiI: 1.55, cloudLit: '#fff1dc', cloudShade: '#b9b3dc', exposure: 1.0, bloom: 0.36, glow: 0.17, leak: 1.25, night: 0 },
  { h: 17.0, zenith: '#5b7fc0', mid: '#b3a9d0', horizon: '#ffc79a', warm: '#ffae70', fog: '#e8c5bb', sun: '#ffb77a', sunI: 2.45, hemiSky: '#a79dd6', hemiGround: '#e3b3a6', hemiI: 1.45, cloudLit: '#ffd6b0', cloudShade: '#a99ccb', exposure: 1.0, bloom: 0.4, glow: 0.2, leak: 1.4, night: 0 },
  { h: 17.333, zenith: '#4d64aa', mid: '#b58fbf', horizon: '#ffa77c', warm: '#ff8f5c', fog: '#d9a7ad', sun: '#ff9d62', sunI: 2.05, hemiSky: '#9c8fce', hemiGround: '#d99f9a', hemiI: 1.38, cloudLit: '#ffb48e', cloudShade: '#9585bc', exposure: 1.0, bloom: 0.46, glow: 0.24, leak: 1.5, night: 0.05 },
  { h: 17.75, zenith: '#34427e', mid: '#7d6aa2', horizon: '#e5898a', warm: '#f08a6e', fog: '#8e7b9c', sun: '#e7879a', sunI: 1.1, hemiSky: '#7d7cc0', hemiGround: '#8d7394', hemiI: 1.25, cloudLit: '#f39a92', cloudShade: '#6c5f96', exposure: 1.0, bloom: 0.5, glow: 0.27, leak: 0.9, night: 0.35 },
  { h: 18.3, zenith: '#1f2c5e', mid: '#3d4a86', horizon: '#8a6c96', warm: '#a8708a', fog: '#4d5282', sun: '#9aa9e6', sunI: 0.72, hemiSky: '#6272b4', hemiGround: '#3f3a5c', hemiI: 1.12, cloudLit: '#8a7aa6', cloudShade: '#3f4474', exposure: 1.02, bloom: 0.54, glow: 0.3, leak: 0.2, night: 0.75 },
  { h: 19.5, zenith: '#101a3a', mid: '#1f2d5a', horizon: '#3b4476', warm: '#4b4a7c', fog: '#2a355e', sun: '#93a9e8', sunI: 0.66, hemiSky: '#5466a3', hemiGround: '#2c2944', hemiI: 1.08, cloudLit: '#56628f', cloudShade: '#2c3358', exposure: 1.03, bloom: 0.58, glow: 0.32, leak: 0.0, night: 1 },
  { h: 24.0, zenith: '#0d1631', mid: '#1a2850', horizon: '#33406b', warm: '#3d4674', fog: '#27315a', sun: '#8fa6e6', sunI: 0.6, hemiSky: '#51639e', hemiGround: '#2b2842', hemiI: 1.05, cloudLit: '#56628f', cloudShade: '#2c3358', exposure: 1.02, bloom: 0.55, glow: 0.3, leak: 0.0, night: 1 },
];
const CK = ['zenith', 'mid', 'horizon', 'warm', 'fog', 'sun', 'hemiSky', 'hemiGround', 'cloudLit', 'cloudShade'];
const NK = ['sunI', 'hemiI', 'exposure', 'bloom', 'glow', 'leak', 'night'];
const KL = K.map((k) => { const o = { h: k.h }; for (const c of CK) o[c] = new THREE.Color(k[c]); for (const n of NK) o[n] = k[n]; return o; });
const wrap24 = (h) => ((h % 24) + 24) % 24;
/** Palette at a JST hour: THREE.Colors (linear) + numbers. */
export function skyPaletteAt(hours, out = null) {
  const h = wrap24(hours);
  let i = 1; while (i < KL.length - 1 && KL[i].h < h) i++;
  const a = KL[i - 1], b = KL[i];
  let t = Math.min(1, Math.max(0, (h - a.h) / Math.max(1e-6, b.h - a.h))); t = t * t * (3 - 2 * t);
  out = out || Object.fromEntries(CK.map((c) => [c, new THREE.Color()]));
  for (const c of CK) out[c].copy(a[c]).lerp(b[c], t);
  for (const n of NK) out[n] = a[n] + (b[n] - a[n]) * t;
  return out;
}

/** The key (shadow-casting) light: the sun's real azimuth, but never lower than KEY_MIN_EL while the sun is up
 *  (an anime lighting cheat: at 16:30 in October the sun is 6 deg up and would leave every street in shadow);
 *  through twilight it fades into the moon, high in the opposite sky. The sky dome keeps the real sun position. */
export const KEY_MIN_EL = 13 * Math.PI / 180;
export function keyLight(sunDir, out = new THREE.Vector3()) {
  const el = Math.asin(Math.max(-1, Math.min(1, sunDir.y)));
  const az = Math.atan2(sunDir.x, -sunDir.z);
  if (el > -0.035) { const e = Math.max(el, KEY_MIN_EL); return out.set(Math.sin(az) * Math.cos(e), Math.sin(e), -Math.cos(az) * Math.cos(e)); }
  return out.set(-sunDir.x * 0.6, 0.55, -sunDir.z * 0.6).normalize();
}

const MOON_AZ = -47 * Math.PI / 180, MOON_EL = 7.5 * Math.PI / 180;
export function createSky(scene, sunDir, quality) {
  const uniforms = {
    uSun: { value: sunDir.clone() },
    uTime: { value: 0 },
    uZenith: { value: new THREE.Color('#4f8fd6') },
    uMid: { value: new THREE.Color('#8fbde9') },
    uHorizon: { value: new THREE.Color('#dfe9f2') },
    uWarm: { value: new THREE.Color('#fbe3cf') },
    uFog: { value: FOG_COLOR.clone() },
    uCloudLit: { value: new THREE.Color('#fff4e6') },
    uCloudShade: { value: new THREE.Color('#bdbfe0') },
    uCloud: { value: 0.55 },          // coverage 0..1 (weather)
    uSummerK: { value: 0 },           // [v3:polish] summer weight: taller low cumulus towers (入道雲)
    uMorning: { value: 0 },
    // [v3:polish3] the frame's top edge (update() from the camera): x = camera azimuth, y/z = the A/B terms of the top
    // edge elevation atan(A cos(phi) / B) at relative azimuth phi, w = the horizontal half-FOV at the top edge (0 = off)
    uFrame: { value: new THREE.Vector4(0, 0, 1, 0) },           // [v3:polish3] early-morning weight (water.js: a paler pearl sheen; renderer: low mist)
    uNight: { value: 0 },
    uDusk: { value: 0 },
    uWind: { value: new THREE.Vector2(0.93, 0.36) },
    // [v3:fix] the moon over the hills behind the bay. [v3:polish] turned 25 deg (az -72 -> -47) and 3 deg lower so it
    // hangs over 安波山 in the hero drone's night frame (5.5 deg lower) instead of behind the HUD wordmark
    uMoon: { value: new THREE.Vector3(Math.sin(MOON_AZ) * Math.cos(MOON_EL), Math.sin(MOON_EL), -Math.cos(MOON_AZ) * Math.cos(MOON_EL)).normalize() },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uSun, uZenith, uMid, uHorizon, uWarm, uFog, uCloudLit, uCloudShade, uMoon; uniform float uTime, uCloud, uNight, uDusk, uSummerK; uniform vec2 uWind; uniform vec4 uFrame;
      varying vec3 vDir;
      float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
      float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float s=0.0, a=0.5; mat2 m = mat2(1.6,1.2,-1.2,1.6); for(int i=0;i<5;i++){ s += a*vn(p); p = m*p; a*=0.5; } return s; }
      float fbm3(vec2 p){ float s=0.0, a=0.5; mat2 m = mat2(1.6,1.2,-1.2,1.6); for(int i=0;i<3;i++){ s += a*vn(p); p = m*p; a*=0.5; } return s; }
      // union of jittered disks: round billows (0 outside, 1 at a disk centre)
      float billow(vec2 p){
        vec2 i = floor(p), f = fract(p); float b = 0.0;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec2 g = vec2(float(x), float(y)); vec2 hh = vec2(h21(i + g), h21(i + g + 17.3));
          vec2 c = g + 0.2 + 0.6 * hh; float r = 0.55 + 0.45 * h21(i + g + 5.1);
          b = max(b, 1.0 - length(f - c) / r);
        }
        return b;
      }
      // puffy cumulus: large-scale coverage + three octaves of round billows (scalloped, painted edges)
      float cumulus(vec2 q){
        // [v3:integrate] stronger round billows: cauliflower heaps with scalloped edges, not flat lenticular sheets
        float c = fbm3(q * 0.21 + 1.7);
        return c * 0.86 + billow(q * 0.85) * 0.4 + billow(q * 2.2 + 3.0) * 0.19 + billow(q * 5.3 + 7.0) * 0.07 - 0.05;
      }
      // semicircle bumps along the azimuth (cauliflower tops of the horizon banks), height in radians
      float bumps1D(float a, float k, float seed){
        // [v3:fix] periodic in azimuth: an integer number of bumps round the horizon (the old seam cut a cloud vertically)
        float n = floor(k * 6.2831853 + 0.5); k = n / 6.2831853;
        float x0 = mod(a, 6.2831853) * k; float i = floor(x0), f = fract(x0); float best = 0.0;
        for (int j = -1; j <= 1; j++) {
          float cj = mod(i + float(j), n);
          float c = float(j) + 0.5 + (h21(vec2(cj, seed)) - 0.5) * 0.6; float r = 0.55 + 0.5 * h21(vec2(cj, seed + 3.0));
          float x = (f - c) / r; if (abs(x) < 1.0) best = max(best, r * sqrt(1.0 - x * x));
        }
        return best / k;
      }
      // [v3:fix] painted cumulus heaps: N discrete clouds, each a flat-based mound of round puffs, seeded per cloud (no
      // azimuth seam, no mirrored twins). Cel two-tone per puff (lit toward the sun, lavender away and underneath), a
      // warm rim on the sun side, crisp anti-aliased edges. Coverage (uCloud) switches heaps on by their seed.
      #define KLC_HEAPS 22
      #define KLC_PUFFS 12
      float wrapA(float a){ return mod(a + 3.14159265, 6.2831853) - 3.14159265; }
      vec4 heaps(float az, float el, float sunAz, float sunEl, float cov, float t, float pxA){
        vec4 acc = vec4(0.0);   // r = lit weight, g = shade weight, b = rim, a = coverage
        for (int i = 0; i < KLC_HEAPS; i++) {
          float fi = float(i);
          float s1 = h21(vec2(fi, 11.3)), s2 = h21(vec2(fi, 23.9)), s3 = h21(vec2(fi, 41.7)), s4 = h21(vec2(fi, 57.1)), s5 = h21(vec2(fi, 71.9));
          if (s4 > 0.2 + cov * 0.8) continue;
          float a0 = fi * 2.39996 + (s1 - 0.5) * 0.4 + t * (0.0005 + 0.0006 * s2);   // golden-angle spread: no regular pattern
          bool high = s5 > 0.62;
          // low towering heaps sit on the horizon; a few flatter fair-weather cumulus float higher up
          // [v3:polish3] two tiers of fair-weather heaps: a few float low (2-6.5 deg: whole inside the drone frames, whose top
          // edge is ~8-11 deg), the rest high (11-23 deg: above every drone frame, in the sky of the eye-level shots)
          bool upper = h21(vec2(fi, 87.3)) < 0.8;
          float e0 = high ? (upper ? 0.195 + 0.2 * s2 : 0.03 + 0.08 * s2) : 0.004 + 0.07 * s2;
          float W = high ? (0.08 + 0.08 * s3) * (upper ? 1.3 : 1.0) : (0.06 + 0.12 * s3) * (1.0 + 0.35 * uSummerK);   // [v3:polish] bigger high heaps; summer towers
          float Hh = high ? W * (upper ? 0.5 + 0.2 * s1 : 0.45 + 0.15 * s1) : W * (0.8 + 0.55 * s1) * (1.0 + 0.45 * uSummerK);
          // [v3:polish3] fit to the frame: a heap never straddles the top edge of the picture (the hero drone frame's top
          // is ~8-11 deg up, the heaps reach 25 deg: they were sliced off). A heap whose top would cross the edge shrinks
          // toward its base, and fades out before it becomes a sliver; heaps wholly above the frame are untouched (they
          // are out of view). Continuous in the camera pitch, so a drone flight never pops a cloud.
          float fitA = 1.0;
          if (uFrame.w > 0.0) {
            float phi = abs(wrapA(a0 - uFrame.x));
            if (phi - W < uFrame.w && phi < 1.5) {
              float phE = min(phi + W, uFrame.w);
              float topEl = atan(uFrame.y * cos(phE) / uFrame.z) - 0.012;
              float fs = clamp((topEl - e0) / (1.45 * Hh), 0.0, 1.0);
              if (e0 < topEl + 0.05 && fs < 1.0) { W *= fs; Hh *= fs; fitA = smoothstep(0.3, 0.5, fs); }
              if (fitA <= 0.0) continue;
            }
          }
          float x = wrapA(az - a0) * cos(el);
          float y = el - e0;
          if (abs(x) > W * 1.3 + Hh * 0.45 || y < -0.01 || y > Hh * 1.6) continue;   // [v3:polish2] wide enough for the biggest crown / end puffs (tall heaps had sliced-off flat tops)
          vec2 L2 = normalize(vec2(sin(wrapA(sunAz - a0)), 0.6 + max(sunEl, -0.1) * 1.5));
          float front = cos(wrapA(sunAz - a0));
          // [v3:fix] backlit heaps: no crescent at all, a flat shade tone plus the rim. Note the sign: front = cos(sun
          // azimuth - heap azimuth) is > 0 for a heap on the SUN's side of the sky, i.e. one the viewer sees against the
          // light (backlit; the stacked moons were there: 浮見堂 at sunset, the market's right-hand heap in the morning).
          // Heaps opposite the sun are lit from the viewer's side and keep the painted crescent terminator. The shift
          // fades out smoothly so a drifting heap never pops between the two looks.
          float fwdK = 1.0 - smoothstep(0.05, 0.45, front);
          float dens = 0.0, rr = 1.0, litK = 0.0;
          for (int k = 0; k < KLC_PUFFS; k++) {
            float fk = float(k);
            float j1 = h21(vec2(fi * 13.0 + fk, 3.1)), j2 = h21(vec2(fi * 13.0 + fk, 8.3)), j3 = h21(vec2(fi * 13.0 + fk, 19.7));
            // [v3:fix] a seeded puff count per heap (the heaps were 5-crown / 6-base clones); the centre crown and the
            // two middle base puffs always stay so every heap keeps a body
            if ((k == 5 && h21(vec2(fi, fk)) < 0.25) || (k == 11 && h21(vec2(fi, fk)) < 0.5)) continue;   // [v3:polish3] k 11 drops more often (an orphan puff hung under a heap)   // [v3:polish] only the base-row ends drop out: no orphan crown puffs
            vec2 c; float r;
            if (k < 5) {            // upper cauliflower crown (behind)
              float u = fk / 4.0 * 2.0 - 1.0; float hf = sqrt(max(0.0, 1.0 - u * u * 0.8));
              c = vec2(u * W * 0.4 + (j1 - 0.5) * W * 0.25, Hh * (0.5 + 0.26 * hf) + (j2 - 0.5) * Hh * 0.16);   // [v3:fix] +-0.25 W
              r = Hh * (0.25 + 0.16 * hf) * ((k == 0 || k == 4) ? (0.85 + 0.4 * j3) : (0.6 + 0.8 * j3));                                                    // [v3:fix] +-40 %
            } else {                // base row (in front)
              float u = (fk - 5.0) / 6.0 * 2.0 - 1.0; float hf = max(0.4, sqrt(max(0.0, 1.0 - u * u)));
              c = vec2(u * W * 0.66 + (j1 - 0.5) * W * 0.2, Hh * (0.25 + 0.13 * hf) + (j2 - 0.5) * Hh * 0.08);
              r = Hh * (0.2 + 0.14 * hf) * ((k == 5 || k == 11) ? (0.85 + 0.4 * j3) : (0.6 + 0.8 * j3));   // [v3:polish] no tiny end bubbles
            }
            vec2 dp = vec2(x, y) - c;
            float dd = 1.0 - length(dp) / r;
            if (dd > dens) {
              // [v3:fix] the tone comes from the one puff that owns this pixel (it was overwritten by every overlapping
              // puff: rows of nested moons). Crescent terminator: the lit part is the disc shifted toward the light.
              dens = dd; rr = r;
              float aa = pxA * 1.5;
              float cres = 1.0 - smoothstep(r * 0.86 - aa, r * 0.86 + aa, length(dp - L2 * r * mix(0.42, 0.18, max(-front, 0.0)) * fwdK));
              litK = cres * fwdK;
            }
          }
          float fw = max(pxA / rr, 1e-4);
          float a = smoothstep(0.0, fw * 1.5, dens) * smoothstep(-pxA, pxA, y - Hh * 0.08);   // crisp edge, flat base
          if (a <= 0.0) continue;
          // [v3:polish2] a backlit heap keeps an internal tone: light leaks through the thin puff edges and the seams
          // between puffs (dens is low there) and the upper crown, the thick cores and the base stay deeper, so the
          // cauliflower structure reads instead of one flat lavender sticker
          float leak = (1.0 - smoothstep(0.0, 0.10, dens)) * 0.18 + smoothstep(Hh * 0.35, Hh * 1.05, y) * 0.15;   // [v3:polish3] low: no inner puff outlines showing through (soap bubbles)
          litK += (1.0 - fwdK) * leak;
          litK *= mix(0.55, 1.0, smoothstep(Hh * 0.1, Hh * 0.32, y));                         // lavender underside
          float rim = (1.0 - smoothstep(0.0, 0.025 + 0.015 * (1.0 - fwdK), dens)) * max(front, 0.0);   // [v3:polish3] narrow: the lining traces the outer silhouette only   // the warm silver lining of a backlit heap
          a *= fitA;
          acc = mix(acc, vec4(litK, 1.0 - fwdK, rim, 1.0), a);   // [v3:fix] g = backlit weight
        }
        return acc;
      }
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 sunN = normalize(uSun);
        float sd = max(dot(d, sunN), 0.0);
        // ---------- painted gradient
        vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.2, h));
        col = mix(col, uZenith, smoothstep(0.16, 0.9, h));
        float hz = 1.0 - smoothstep(0.0, 0.45, h);
        col = mix(col, uWarm, pow(sd, 2.5) * hz * (0.55 + 0.35 * uDusk));
        col += uWarm * pow(sd, 10.0) * 0.18;
        // sun disc + halo (hidden at night)
        float day = 1.0 - uNight;
        col += vec3(1.0, 0.93, 0.8) * (pow(sd, 22.0) * 0.25 + pow(sd, 380.0) * 0.8) * day;
        col += vec3(1.0, 0.97, 0.9) * smoothstep(0.99925, 0.99965, sd) * 2.4 * day;
        // ---------- stars
        if (uNight > 0.01 && h > 0.0) {
          vec2 sp = d.xz / (h + 0.25) * 90.0;
          vec2 cell = floor(sp); vec2 f = fract(sp) - 0.5;
          float r = h21(cell);
          float star = step(0.955, r) * smoothstep(0.09, 0.0, length(f + (vec2(h21(cell+3.1), h21(cell+7.7)) - 0.5) * 0.6));
          col += vec3(0.9, 0.93, 1.0) * star * uNight * (0.7 + 0.3 * sin(uTime * 2.0 + r * 60.0)) * smoothstep(0.02, 0.3, h) * (1.0 - smoothstep(0.55, 0.85, uCloud));   // [v3:polish3] overcast / rain hides the stars
        }
        // [v3:fix] a waxing crescent in the west after dusk (sets over the hills behind the bay), with a soft halo
        if (uNight > 0.01 && uCloud < 0.85) {
          float moonK = uNight * (1.0 - smoothstep(0.55, 0.85, uCloud));   // [v3:polish3] behind the rain clouds too
          vec3 mz = normalize(uMoon);
          float md = acos(clamp(dot(d, mz), -1.0, 1.0));
          vec3 mr = normalize(cross(mz, vec3(0.0, 1.0, 0.0))), mu = cross(mr, mz);
          vec2 mp = vec2(dot(d - mz, mr), dot(d - mz, mu));
          float R = 0.021;
          float disc = 1.0 - smoothstep(R - 0.0012, R + 0.0012, length(mp));
          float bite = 1.0 - smoothstep(R - 0.0012, R + 0.0012, length(mp - vec2(-0.012, 0.004)));
          float cres = disc * (1.0 - bite);
          col = mix(col, vec3(1.0, 0.96, 0.84), cres * moonK);
          col += vec3(0.55, 0.62, 0.9) * (disc * 0.06 + exp(-md * md * 900.0) * 0.1) * moonK;
        }
        vec2 wind = normalize(uWind);
        float cov = clamp(uCloud, 0.0, 1.0);
        if (h > -0.02) {
          float fadeH = smoothstep(0.0, 0.05, h);
          // ---------- towering cumulus banks on the horizon (bases hidden behind the ridges, cauliflower tops)
          float az = atan(d.x, -d.z);
          vec2 ring = vec2(cos(az), sin(az));
          float drift = uTime * 0.0015;
          float baseP = fbm(ring * 1.25 + vec2(drift, 4.0)) - 0.6 + cov * 0.3;
          float on = smoothstep(0.0, 0.05, baseP);
          float top = -0.01 + on * (bumps1D(az + drift, 9.0, 1.0) * 0.55 + bumps1D(az + drift, 23.0, 2.0) * 0.55 + bumps1D(az + drift, 56.0, 3.0) * 0.45) * (0.6 + 0.8 * smoothstep(0.0, 0.2, baseP));
          float e = h;
          float bank = smoothstep(top, top - 0.0025, e) * step(0.01, top);
          float sunAz = atan(sunN.x, -sunN.z);
          float faceSun = cos(az - sunAz);
          float rel = clamp((e + 0.01) / max(top + 0.01, 1e-3), 0.0, 1.0);
          // two painted tones: warm-lit body and tops, lavender underside and the side turned away from the sun
          float litB = smoothstep(0.2, 0.26, rel + 0.18 * faceSun + (fbm3(vec2(az * 30.0, e * 90.0)) - 0.5) * 0.18);
          vec3 bankCol = mix(uCloudShade, uCloudLit, litB);
          bankCol += uWarm * pow(sd, 2.0) * 0.3 * (0.5 + uDusk) * litB;
          bankCol = mix(bankCol, uHorizon, 0.3 * (1.0 - smoothstep(0.0, 0.05, e)));   // aerial haze toward the base
          col = mix(col, bankCol, bank * smoothstep(-0.004, 0.035, e));
          // ---------- [v3:fix] painted cumulus heaps (replace the planar field: it flattened into lens shapes)
          {
            float el = asin(clamp(h, -1.0, 1.0));
            float pxA = max(fwidth(el), 1e-5);
            vec4 hp = heaps(az, el, sunAz, asin(clamp(sunN.y, -1.0, 1.0)), cov, uTime, pxA);
            if (hp.a > 0.0) {
              // [v3:fix] soft painted two-tone; a backlit heap is one flat, deeper body tone (it vanished into the dusk
              // sky as a pale outline) with a strong warm silver lining
              vec3 cc = mix(mix(uCloudShade, uCloudLit, 0.45 - 0.1 * hp.g), uCloudLit, hp.r) * (1.0 - 0.1 * hp.g);
              cc += uWarm * hp.b * (0.18 + 0.25 * uDusk) * (1.0 + 1.2 * hp.g);   // [v3:polish] a thin lining, not a glowing sticker outline
              cc += uWarm * pow(sd, 4.0) * 0.25;
              cc = mix(cc, mix(uHorizon, uCloudShade, 0.35), (1.0 - smoothstep(0.0, 0.08, el)) * 0.45);   // haze near the horizon
              col = mix(col, cc, hp.a * fadeH);
            }
          }
          if (h > 0.0) {
            vec2 uv = d.xz / (h + 0.08) * 0.27;
            vec2 q = vec2(dot(uv, wind), dot(uv, vec2(-wind.y, wind.x)));
            q.x -= uTime * 0.012;
            float a = 0.0;
            // thin high streaks
            vec2 sq = vec2(q.x * 0.35, q.y * 3.6) * 0.8;
            // [v3:fix] wispy cirrus, not a rigid stripe: a wider soft threshold, broken by fbm(q * 1.7), a low gain,
            // gone at night and mostly gone at dusk (it drew pale diagonal rays across the night sky)
            float streak = smoothstep(0.55, 0.95, fbm(sq + 11.0) * 0.85 + fbm(sq * 2.3 + 3.0) * 0.3) * smoothstep(0.25, 0.6, fbm(q * 0.2 + 5.0));
            streak *= smoothstep(0.35, 0.75, fbm(q * 1.7 + 2.3));
            streak *= (1.0 - uNight) * (1.0 - uDusk * 0.7);
            col = mix(col, mix(uCloudLit, uWarm, 0.35 * uDusk), streak * 0.15 * smoothstep(0.08, 0.4, h) * (1.0 - a));
          }
        }
        // below the horizon fades into the fog colour (matches distant terrain)
        col = mix(col, uFog, 1.0 - smoothstep(-0.1, 0.01, h));
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1800, 64, 32), mat);
  mesh.layers.set(LAYER_NO_OUTLINE);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.userData.noBatch = true;
  mesh.name = 'sky';
  scene.add(mesh);

  // --- lights
  const hemi = new THREE.HemisphereLight('#a9b3ee', '#d9c6c8', 1.62);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff0dc', 2.75);
  sun.castShadow = quality.shadows !== false;
  const ms = quality.shadowMap || 4096;
  sun.shadow.mapSize.set(ms, ms);
  let S = quality.shadowSize || 75;
  const setShadowBox = (s) => {
    S = s;
    Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: S * 5 + 700 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.00035 * Math.max(1, S / 75) * 0.6;
    sun.shadow.normalBias = 0.035 * Math.max(1, S / 75);
  };
  setShadowBox(S);
  sun.shadow.radius = 1.6;
  sun.shadow.camera.layers.enableAll();
  scene.add(sun); scene.add(sun.target);

  scene.fog = new THREE.FogExp2(FOG_COLOR.clone(), 0.0004);
  const fogBase = { value: 0.0004 };

  // --- time of day
  const pal = skyPaletteAt(16.5);
  const state = { hours: 16.5, ctx: null, driven: false, alt: 2, weatherFog: 0 };
  function applyGrading(p) {
    const cm = state.ctx?.pipeline?.compMat?.uniforms;
    if (!cm) return;
    cm.uExposure.value = p.exposure; cm.uBloom.value = p.bloom; cm.uGlow.value = p.glow;
    if (cm.uLeakK) cm.uLeakK.value = p.leak;
    if (cm.uNight) cm.uNight.value = p.night ?? 0;
  }
  function applyPalette(p, night, dusk) {
    uniforms.uZenith.value.copy(p.zenith); uniforms.uMid.value.copy(p.mid); uniforms.uHorizon.value.copy(p.horizon);
    uniforms.uWarm.value.copy(p.warm); uniforms.uFog.value.copy(p.fog);
    if (p.cloudLit) { uniforms.uCloudLit.value.copy(p.cloudLit); uniforms.uCloudShade.value.copy(p.cloudShade); }
    else { const pp = skyPaletteAt(state.hours); uniforms.uCloudLit.value.copy(pp.cloudLit); uniforms.uCloudShade.value.copy(pp.cloudShade); }
    uniforms.uNight.value = night; uniforms.uDusk.value = dusk;
    scene.fog.color.copy(p.fog);
  }
  // [v3:fix] morning mist over the bay (06:00-08:30): denser, cooler haze so 朝 reads differently from 夕方
  // [v3:polish] thinner (x0.45) and it peaks around 07:30, so 06:30 reads clear and warm, not washed out
  const haze = (h) => { const a = Math.min(1, Math.max(0, (h - 5.8) / 1.7)), b = Math.min(1, Math.max(0, (9.0 - h) / 1.4)); return 0.45 * a * b; };
  // [v3:polish3] early-morning weight: rises from first light, full 06:00-07:10, gone by 08:40 (low mist + pale sheen)
  const morning = (h) => { const a = Math.min(1, Math.max(0, (h - 5.1) / 0.9)), b = Math.min(1, Math.max(0, (8.7 - h) / 1.5)); const k = a * b; return k * k * (3 - 2 * k); };
  function applyMorning(h) {
    const k = morning(wrap24(h)); uniforms.uMorning.value = k;
    const cm = state.ctx?.pipeline?.compMat?.uniforms;
    if (cm?.uMist) { cm.uMist.value = 0.4 * k * (1 - 0.8 * (state.ctx?.shared?.uSeason?.value?.y ?? 0)); cm.uMistCol.value.copy(uniforms.uFog.value).lerp(uniforms.uHorizon.value, 0.35); }
  }
  const dusk01 = (el) => { const a = Math.min(1, Math.max(0, (20 - el) / 16)); const b = Math.min(1, Math.max(0, (el + 10) / 8.5)); return a * b; };
  /** Standalone time of day (the life package calls setTime instead once it is built). */
  function setHours(h) {
    state.hours = h;
    const d = sunDirAt(h);
    sunDir.set(d[0], d[1], d[2]).normalize();
    const lightDir = keyLight(sunDir);
    uniforms.uSun.value.copy(sunDir);
    if (state.ctx?.shared?.uSunDir) state.ctx.shared.uSunDir.value.copy(lightDir);
    skyPaletteAt(h, pal);
    const el = Math.asin(sunDir.y) * 180 / Math.PI;
    applyPalette(pal, pal.night, dusk01(el));
    sun.color.copy(pal.sun); sun.intensity = pal.sunI; hemi.color.copy(pal.hemiSky); hemi.groundColor.copy(pal.hemiGround); hemi.intensity = pal.hemiI;
    state.lightDir = lightDir;
    state.haze = haze(h);
    applyGrading(pal); applyMorning(h);
  }
  /** Driven by life's time service: T.palette, T.sunDir, T.night, T.dusk, T.weather. */
  // [v3:fix] winter grade: a cool, softly overcast sky (the warm peach autumn sky stayed on under the snow)
  const WINTER = { zenith: new THREE.Color('#7d9ccc'), mid: new THREE.Color('#bccbe0'), horizon: new THREE.Color('#e2e7ef'), warm: new THREE.Color('#ece4e6'), fog: new THREE.Color('#d3dbe6'), cloudLit: new THREE.Color('#f1f4f9'), cloudShade: new THREE.Color('#aeb8d0') };
  function winterGrade(night) {
    const w = state.ctx?.shared?.uSeason?.value?.w ?? 0;
    if (w <= 0.001) return 0;
    const k = w * 0.8 * (1 - night * 0.7);
    for (const [key, u] of [['zenith', uniforms.uZenith], ['mid', uniforms.uMid], ['horizon', uniforms.uHorizon], ['warm', uniforms.uWarm], ['fog', uniforms.uFog], ['cloudLit', uniforms.uCloudLit], ['cloudShade', uniforms.uCloudShade]]) u.value.lerp(WINTER[key], k);
    scene.fog.color.copy(uniforms.uFog.value);
    return w;
  }
  // [v3:polish] summer grade: a deep clear blue with bright white towering cumulus (summer read like autumn)
  const SUMMER = { zenith: new THREE.Color('#2f78d8'), mid: new THREE.Color('#86bdf0'), horizon: new THREE.Color('#eef3f8'), cloudLit: new THREE.Color('#ffffff'), cloudShade: new THREE.Color('#b9c6ea'), warm: new THREE.Color('#fff0dc'), fog: new THREE.Color('#dde7f3') };
  function summerGrade(night) {
    const y = state.ctx?.shared?.uSeason?.value?.y ?? 0;
    uniforms.uSummerK.value = y * (1 - night);
    if (y <= 0.001) return 0;
    const k = y * 0.6 * (1 - night);
    for (const [key, u] of [['zenith', uniforms.uZenith], ['mid', uniforms.uMid], ['horizon', uniforms.uHorizon], ['cloudLit', uniforms.uCloudLit], ['cloudShade', uniforms.uCloudShade]]) u.value.lerp(SUMMER[key], k);
    uniforms.uWarm.value.lerp(SUMMER.warm, k * 0.6); uniforms.uFog.value.lerp(SUMMER.fog, k * 0.5); scene.fog.color.copy(uniforms.uFog.value);   // a cleaner, less peach haze
    return y;
  }
  function setTime(T) {
    state.driven = true; state.hours = T.hours;
    const p = T.palette || skyPaletteAt(T.hours, pal);
    uniforms.uSun.value.copy(T.sunDir);
    applyPalette(p, T.night ?? 0, T.dusk ?? 0);
    const wk = winterGrade(T.night ?? 0), sk = summerGrade(T.night ?? 0);
    if (T.weather) {
      uniforms.uCloud.value = 0.3 + 0.6 * Math.min(1, T.weather.cloud ?? 0.35); state.weatherFog = (T.weather.fog || 0) * 2.2 + (T.weather.rain || 0) * 0.8;
      if ((T.weather.rain || 0) > 0) uniforms.uCloud.value = Math.max(uniforms.uCloud.value, 0.6 + 0.35 * Math.min(1, T.weather.rain));   // [v3:polish3] rain = overcast: no stars, no moon
    }
    if (sk > 0) uniforms.uCloud.value = Math.min(1, uniforms.uCloud.value + 0.25 * sk);   // [v3:polish] summer: more heaps
    if (wk > 0) { uniforms.uCloud.value = Math.min(1, uniforms.uCloud.value + 0.3 * wk); state.weatherFog += 0.6 * wk; }   // [v3:fix] winter: more cloud, a little haze
    state.haze = haze(((T.hours % 24) + 24) % 24);   // [v3:fix]
    applyGrading(p); applyMorning(T.hours);
  }
  function setView(alt) {
    state.alt = alt;
    // shadow box grows with altitude (4096 map: 0.04 m texels on foot, ~0.3 m over the town)
    const want = Math.min(700, Math.max(quality.shadowSize || 75, 60 + alt * 1.5));
    if (Math.abs(want - S) > S * 0.1) setShadowBox(want);
    // aerial layering: denser haze on foot (hills 1 km away soften), thinner from the drone (whole bay readable)
    const k = 1 / (1 + Math.max(0, alt - 4) / 160);
    scene.fog.density = fogBase.value * k * (1 + state.weatherFog + (state.haze || 0) * 1.6);   // [v3:fix] morning haze
  }
  function clock() { const h = wrap24(state.hours); const hh = Math.floor(h), mm = Math.floor((h - hh) * 60 + 1e-6); return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; }
  function attach(ctx) { state.ctx = ctx; }

  const _c = new THREE.Vector3(), _fwd = new THREE.Vector3(), _lx = new THREE.Vector3(), _ly = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  const _fr = new THREE.Vector3();
  function update(t, camera) {
    uniforms.uTime.value = t;
    // [v3:polish3] the frame's top edge for the heap fit (see uFrame)
    if (camera.isPerspectiveCamera && !camera.userData.noSkyFrame) {
      camera.getWorldDirection(_fr);
      const p = Math.asin(Math.max(-1, Math.min(1, _fr.y))), tv = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / (camera.zoom || 1);
      const A = Math.sin(p) + tv * Math.cos(p), B = Math.cos(p) - tv * Math.sin(p);
      if (B > 1e-3 && Math.abs(p) < 1.2) uniforms.uFrame.value.set(Math.atan2(_fr.x, -_fr.z), A, B, Math.atan(camera.aspect * tv / B));
      else uniforms.uFrame.value.w = 0;
    } else uniforms.uFrame.value.w = 0;
    mesh.position.copy(camera.position);
    const ld = state.driven ? (state.ctx?.shared?.uSunDir?.value || sunDir) : (state.lightDir || sunDir);
    // shadow box follows the camera, pushed forward, snapped to texels to avoid shimmering
    camera.getWorldDirection(_fwd); _fwd.y = 0; if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1); _fwd.normalize();
    _c.copy(camera.position).addScaledVector(_fwd, S * 0.55);
    _c.y = Math.min(_c.y, camera.position.y - Math.min(state.alt, S) * 0.8);
    const texel = (2 * S) / ms;
    _lx.crossVectors(ld, _up).normalize(); _ly.crossVectors(_lx, ld).normalize();
    const px = Math.round(_c.dot(_lx) / texel) * texel, py = Math.round(_c.dot(_ly) / texel) * texel, pz = _c.dot(ld);
    _c.copy(_lx).multiplyScalar(px).addScaledVector(_ly, py).addScaledVector(ld, pz);
    sun.target.position.copy(_c);
    sun.position.copy(_c).addScaledVector(ld, S * 2.5 + 300);
    sun.target.updateMatrixWorld();
  }
  return { mesh, sun, hemi, uniforms, update, setHours, setTime, setView, attach, clock, palette: pal, fogBase, get hours() { return state.hours; } };
}
