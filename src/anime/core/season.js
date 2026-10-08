// [v3:integrate] Seasons (V3-SPEC section 9): 春 sakura / 夏 / 秋 (the default, the Oct 10 demo) / 冬 snow.
// One shared uniform drives every material: ctx.shared.uSeason = vec4(spring, summer, autumn, winter) weights (sum 1,
// blended over ~2.5 s by life's season controller). The sun and the time presets keep the demo day (an art toggle,
// not a calendar), so every preset still means the same thing in every season.
//
//   seasonUniform(shared)            -> the shared { value: Vector4 } (created on first use, autumn)
//   patchSnow(sh, uSeason, posExpr)  -> onBeforeCompile helper: snow on up-facing surfaces in winter (roofs, ground,
//                                       tree tops); flat dark surfaces (roads) stay clear and wet-dark
//   SEASON_GLSL                      -> shared GLSL helpers (klcSeasonGround(c), klcSnowMix(albedo, nW, pW))
import * as THREE from 'three';

export const SEASONS = [
  { id: 'spring', ja: '春', en: 'Spring' },
  { id: 'summer', ja: '夏', en: 'Summer' },
  { id: 'autumn', ja: '秋', en: 'Autumn' },
  { id: 'winter', ja: '冬', en: 'Winter' },
];
export const SEASON_INDEX = { spring: 0, summer: 1, autumn: 2, winter: 3 };
export const DEFAULT_SEASON = 'autumn';

/** The weights vector for a season id (one-hot). */
export function seasonWeights(id, out = new THREE.Vector4()) {
  const i = SEASON_INDEX[id] ?? 2;
  return out.set(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0, i === 3 ? 1 : 0);
}

export function seasonUniform(shared) {
  if (!shared.uSeason) shared.uSeason = { value: seasonWeights(DEFAULT_SEASON) };
  seasonExtra(shared.uSeason);
  return shared.uSeason;
}

/** [v5:fix1] Presets beyond the four HUD seasons (URL only): `early` = 早春 without snow, the look of Google Earth's
 *  2026-03-11 imagery (bare broadleaf, dormant brown turf and lawns, no snow, no 紅葉), for side-by-side comparisons. */
export const PRESETS = { early: { base: 'winter', snow: 0, dry: 1, ja: '早春（雪なし）', en: 'Early spring (no snow)' } };
/** [v5:fix1] The season's extra uniform on the shared season uniform: x = snow amount (1 = winter snow), y = dry
 *  (dormant brown grass). */
export function seasonExtra(uSeason) {
  if (!uSeason.extra) uSeason.extra = { value: new THREE.Vector2(1, 0) };
  return uSeason.extra;
}

export const SEASON_GLSL = /* glsl */`
  uniform vec4 uSeasonS;
  uniform vec2 uSeasonE;   // [v5:fix1] x snow amount, y dormant (dry) grass: the early-spring preset
  float klcS_h(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float klcS_vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(klcS_h(i), klcS_h(i + vec2(1, 0)), f.x), mix(klcS_h(i + vec2(0, 1)), klcS_h(i + vec2(1, 1)), f.x), f.y); }
  // ground / grass tone per season (applied to painted land cover): spring fresh yellow-green, summer deep green,
  // autumn as painted, winter muted (snow comes on top)
  vec3 klcSeasonGround(vec3 c){
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    vec3 spr = c * vec3(1.0, 1.1, 0.9);
    vec3 sum = c * vec3(0.72, 1.06, 0.70);   // [v3:polish] deeper, lusher summer green
    vec3 win = mix(c, vec3(l), 0.55) * vec3(0.97, 0.97, 1.02);
    win = mix(win, mix(c, vec3(l), 0.7) * vec3(1.12, 1.0, 0.8), uSeasonE.y);   // [v5:fix1] early spring: dormant tan turf
    // [r2:9] and darker: Earth 2026-03-11 shows the hillside grass and field gaps as a dull brown-grey (L* 45-52: grass #746a6f, field #867c7e) where the
    // dormant tan read #a09f90 / #c7c2a1, the most visible land difference on every hill (dL +19 grass, +25 field; 'paving' +1 and 'cedar' +2 are the
    // controls). Greenness is read from the ORIGINAL painted colour (the desaturated one has none left), the darkening is in linear space and follows
    // the early preset only: summer and autumn keep their looks (no October evidence). Dirt (+20) and sand (+12) are not green: a separate follow-up.
    float gr = smoothstep(0.015, 0.06, c.g - max(c.r, c.b));
    win *= mix(vec3(1.0), vec3(0.46, 0.40, 0.58), gr * uSeasonE.y);
    return c * uSeasonS.z + spr * uSeasonS.x + sum * uSeasonS.y + win * uSeasonS.w;
  }
  // winter snow: up-facing surfaces, broken into painted drifts; flat dark surfaces (asphalt) stay clear
  vec3 klcSnowMix(vec3 albedo, vec3 nW, vec3 pW){
    // [v5:fix1] early spring (no snow): flat green surfaces (lawns, verges) turn dormant tan, as in March imagery.
    // [r3:7] Not on roofs, facades and building materials (KLC_NO_DORMANT, patchSnow's noDormant): a green-painted roof (lot 16/58541/25069/367 stores
    // sage #9fb5a2, Earth reads #afb9b0) stays green in the March imagery; the dormant turf is for ground and land cover only.
    #ifndef KLC_NO_DORMANT
    if (uSeasonE.y > 0.002) {
      float gr = smoothstep(0.015, 0.06, albedo.g - max(albedo.r, albedo.b)) * smoothstep(0.85, 0.97, nW.y);
      float lg = dot(albedo, vec3(0.299, 0.587, 0.114));
      albedo = mix(albedo, vec3(lg) * vec3(1.25, 1.0, 0.68), gr * uSeasonE.y * 0.85);
    }
    #endif
    float w = uSeasonS.w * uSeasonE.x;
    if (w < 0.002) return albedo;
    float up = smoothstep(0.42, 0.78, nW.y);
    float lum = dot(albedo, vec3(0.299, 0.587, 0.114));
    float road = step(0.975, nW.y) * (1.0 - smoothstep(0.035, 0.11, lum));
    float n = klcS_vn(pW.xz * 0.21) * 0.55 + klcS_vn(pW.xz * 1.3 + 7.0) * 0.3 + klcS_vn(pW.xz * 5.1 + 3.0) * 0.15;
    float cover = smoothstep(0.3, 0.42, n + 0.22 * up) * up * (1.0 - road * 0.9);
    vec3 snow = mix(vec3(0.74, 0.79, 0.88), vec3(0.83, 0.86, 0.92), smoothstep(0.4, 0.8, n));
    vec3 c = mix(albedo, snow, cover * w);
    return mix(c, c * vec3(0.9, 0.93, 1.0), road * w * 0.5);   // cleared roads read wet and cool
  }
`;

/** onBeforeCompile helper: declare the uniform + helpers and apply snow before the toon lighting.
 *  posExpr: a world-position expression available in the fragment shader (e.g. 'vPWorld'). noDormant: [r3:7] roofs, facades, buildings (see klcSnowMix). */
export function patchSnow(sh, uSeason, posExpr, noDormant = false) {
  sh.uniforms.uSeasonS = uSeason;
  sh.uniforms.uSeasonE = seasonExtra(uSeason);
  // [r3:7] noDormant: roof / facade / building materials skip the early-spring dormant-tan conversion (SEASON_GLSL klcSnowMix); the caller's
  // customProgramCacheKey must differ for them ('-roof'): the define changes the program
  if (!sh.fragmentShader.includes('uniform vec4 uSeasonS;')) sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + (noDormant ? '#define KLC_NO_DORMANT\n' : '') + SEASON_GLSL);
  const hook = sh.fragmentShader.includes('#include <lights_toon_fragment>') ? '#include <lights_toon_fragment>' : '#include <lights_fragment_begin>';
  sh.fragmentShader = sh.fragmentShader.replace(hook, `{
      vec3 klcNW = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
      diffuseColor.rgb = klcSnowMix(diffuseColor.rgb, klcNW, ${posExpr});
    }
    ${hook}`);
}
