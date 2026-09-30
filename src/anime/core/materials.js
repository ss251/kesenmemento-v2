// Ported from Sakuragaoka Station (Kenton-GMI/sakuragaoka-station, MIT; see src/anime/LICENSE-sakuragaoka-station).
// Toon (三渲二) material library. All modules should get materials from here so the
// look stays consistent and identical materials are shared (=> static batching works).
import * as THREE from 'three';
import { patchSnow, seasonUniform } from './season.js';   // [v3:integrate]

export const LAYER_NO_OUTLINE = 1;

// Named palette (sRGB hex). Use these first; add local accents sparingly.
export const PALETTE = {
  sakuraWhite: '#fbe9ef', sakuraPale: '#f7d3de', sakura: '#f2b5c8', sakuraMid: '#eb9db6', sakuraDeep: '#dd7f9d', sakuraShadow: '#c3aecb',
  skyTop: '#5f9bdc', skyMid: '#9cc4ea', skyHorizon: '#dde9f3',
  cream: '#f4efe4', offWhite: '#efe9dc', beige: '#e3d4b8', plaster: '#e8dcc6', paleBlue: '#b7cddb', paleGreen: '#cfe0c8', paleYellow: '#f1e3b0',
  lightGrayTile: '#cdd0cd', concrete: '#bdbcb5', concreteDark: '#9d9c96', platform: '#c6c5be',
  asphalt: '#6c6e73', asphaltDark: '#5c5e63', asphaltLight: '#7d7f83',
  lineWhite: '#eeece6', lineOrange: '#e9a23b', lineYellow: '#e8c547',
  woodDark: '#5a4032', wood: '#8a6446', woodLight: '#b48a62',
  roofDark: '#4a4f58', roofBlue: '#56677a', roofGreen: '#4d6457', roofBrown: '#6a5448', metalRoof: '#7b8691',
  frameDark: '#4b4d52', frameBrown: '#5e4636', steel: '#9aa1a8', steelDark: '#6d747c', rust: '#8a5a44',
  ballast: '#7c7a76', ballastDark: '#65625e', ballastWarm: '#8d8378', sleeper: '#6b5a4c', railSide: '#6e625a', railTop: '#d9dde2',
  grass: '#8fb86f', grassDark: '#6f9a5a', grassLight: '#b3cf83', leafYoung: '#c9d98e', shrub: '#5f8c5c', moss: '#7d9460', soil: '#9b8367',
  signBlue: '#2f64b5', signRed: '#d9463b', signYellow: '#f2c230', signGreen: '#3f8f5b',
  trainCream: '#f5f0e6', trainPink: '#ef9fbe', trainMint: '#8fd1c1', trainGray: '#8e959d',
  lampWarm: '#ffd9a0', lampCool: '#e8f4ff',
  ink: '#3a3346', // outline / darkest line colour — never use pure black
};

function makeGradientMap() {
  // 16 texels over dotNL in [-1,1]. Back-facing -> 0 (shadow, ambient only),
  // grazing band -> soft mid tone, lit -> full. Gives crisp anime light/shadow split.
  const n = 16, data = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const dotNL = (i + 0.5) / n * 2 - 1;
    let v;
    if (dotNL < 0.0) v = 0.0;
    else if (dotNL < 0.12) v = 0.42;
    else if (dotNL < 0.42) v = 0.8;
    else v = 1.0;
    data[i] = Math.round(v * 255);
  }
  const tex = new THREE.DataTexture(data, n, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter; tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false; tex.needsUpdate = true;
  return tex;
}

const NOISE_GLSL = /* glsl */`
float pn_hash(vec3 p){ p = fract(p*0.3183099+vec3(0.1,0.2,0.3)); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float pn_noise(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(pn_hash(i+vec3(0,0,0)),pn_hash(i+vec3(1,0,0)),f.x),mix(pn_hash(i+vec3(0,1,0)),pn_hash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(pn_hash(i+vec3(0,0,1)),pn_hash(i+vec3(1,0,1)),f.x),mix(pn_hash(i+vec3(0,1,1)),pn_hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
float paintNoise(vec3 p){ return (pn_noise(p*0.45)*0.6 + pn_noise(p*1.9+11.0)*0.4) * 2.0 - 1.0; }
`;

/** Adds world-space hand-painted colour variation (+ optional ground grime) to a built-in material. */
function patchPaint(material, amount, grime, uSeason = null) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPaint = { value: amount };
    shader.uniforms.uGrime = { value: grime };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPWorld;')
      .replace('#include <fog_vertex>', `#include <fog_vertex>
        { vec4 pw = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            pw = instanceMatrix * pw;
          #endif
          vPWorld = (modelMatrix * pw).xyz; }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPWorld;\nuniform float uPaint;\nuniform float uGrime;\n' + NOISE_GLSL)
      .replace('#include <map_fragment>', `#include <map_fragment>
        { float pn = paintNoise(vPWorld);
          diffuseColor.rgb *= 1.0 + uPaint * pn;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*vec3(0.93,0.93,0.97), uPaint*2.0*clamp(pn*1.5,0.0,1.0)); }`);
    if (uSeason) patchSnow(shader, uSeason, 'vPWorld');   // [v3:integrate] winter snow on every cel surface
  };
  material.customProgramCacheKey = () => (uSeason ? 'paint-s' : 'paint');   // [v3:integrate] snow variant
}

// [v3:harbor] Cache keys without Texture.toJSON: JSON.stringify calls toJSON() before the replacer, so the old
// replacer serialised every map's canvas (toDataURL, ~5 ms per 512 px texture) on every call, even on cache hits.
const optsKey = (o) => JSON.stringify(Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v && v.isTexture ? v.uuid : v])));

export function createMaterials(shared) {
  const gradientMap = makeGradientMap();
  const uSeason = shared ? seasonUniform(shared) : null;   // [v3:integrate]
  const cache = new Map();
  const color = (c) => (c instanceof THREE.Color ? c : new THREE.Color(c));

  /** Main cel-shaded material. color: hex/Color. opts:
   *  map, alphaMap, alphaTest, transparent, opacity, side ('front'|'back'|'double'), vertexColors,
   *  emissive, emissiveIntensity, paint (0..0.15 hand-painted variation, default 0.05),
   *  polygonOffset (number: factor, negative pulls toward camera), depthWrite, name, flatShading */
  function toon(c = '#ffffff', opts = {}) {
    const key = 'toon|' + color(c).getHexString() + '|' + optsKey(opts);
    if (cache.has(key)) return cache.get(key);
    const m = new THREE.MeshToonMaterial({
      color: color(c),
      gradientMap,
      map: opts.map || null,
      alphaMap: opts.alphaMap || null,
      alphaTest: opts.alphaTest || 0,
      transparent: !!opts.transparent,
      opacity: opts.opacity ?? 1,
      vertexColors: !!opts.vertexColors,
      emissive: opts.emissive ? color(opts.emissive) : new THREE.Color(0),
      emissiveIntensity: opts.emissiveIntensity ?? 1,
      side: opts.side === 'double' ? THREE.DoubleSide : opts.side === 'back' ? THREE.BackSide : THREE.FrontSide,
      depthWrite: opts.depthWrite ?? true,
      name: opts.name || '',
    });
    if (opts.polygonOffset) { m.polygonOffset = true; m.polygonOffsetFactor = opts.polygonOffset; m.polygonOffsetUnits = opts.polygonOffset * 2; }
    patchPaint(m, opts.paint ?? 0.05, opts.grime ?? 0, opts.noSnow ? null : uSeason);
    m.userData.toon = { paint: opts.paint ?? 0.05, grime: opts.grime ?? 0, polygonOffset: opts.polygonOffset || 0 };
    Object.defineProperty(m.userData.toon, 'obc', { value: m.onBeforeCompile, enumerable: false });
    if (opts.nightGlow) nightGlow(m, opts.nightGlow);
    if (opts.winterHide && uSeason) winterHide(m);
    cache.set(key, m);
    return m;
  }
  /** [v3:polish] opts.nightGlow = k: the surface lights itself by k x its own (mapped) colour as shared.uNight rises, so
   *  painted signs and plaques stay readable at night (they were dark-on-dark). A custom onBeforeCompile keeps the
   *  material out of batch2's colour baking / atlas merge (it keeps its own material object and uniforms). */
  function nightGlow(m, k) {
    if (shared && !shared.uNight) shared.uNight = { value: 0 };
    const base = m.onBeforeCompile, uN = shared?.uNight || { value: 0 }, uG = { value: k }, ck = m.customProgramCacheKey;
    m.onBeforeCompile = (sh, r) => {
      base(sh, r);
      sh.uniforms.uNightG = uN; sh.uniforms.uNightGlow = uG;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uNightG, uNightGlow;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * uNightGlow * uNightG;');
    };
    m.customProgramCacheKey = () => ck.call(m) + '|nglow';
    m.defines = { ...(m.defines || {}), USE_CUSTOM: '' };
  }

  /** [v3:polish] opts.winterHide: the surface vanishes in winter (uSeason.w > 0.5): flowers in planters under the snow.
   *  The vertices collapse (degenerate triangles draw nothing), so it stays one batched draw call. */
  function winterHide(m) {
    const base = m.onBeforeCompile, ck = m.customProgramCacheKey;
    m.onBeforeCompile = (sh, r) => {
      base(sh, r);
      sh.uniforms.uSeasonH = uSeason;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform vec4 uSeasonH;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed *= step(uSeasonH.w, 0.5);');
    };
    m.customProgramCacheKey = () => ck.call(m) + '|whide';
    m.defines = { ...(m.defines || {}), USE_CUSTOM: '' };
  }

  /** Decal on top of a surface (road markings, posters, stains). Pulls toward the camera
   *  with polygonOffset; still place it 3–10 mm off the surface. */
  function decal(c = '#ffffff', opts = {}) {
    return toon(c, { transparent: opts.map || opts.alphaMap ? true : !!opts.transparent, depthWrite: false, polygonOffset: -2, paint: 0.02, ...opts });
  }

  /** Unlit / self-lit material (screens, lamps, lit signs, interior glow). intensity > 1 blooms. */
  function emissive(c = '#ffffff', intensity = 1.6, opts = {}) {
    const key = 'emi|' + color(c).getHexString() + '|' + intensity + '|' + optsKey(opts);
    if (cache.has(key)) return cache.get(key);
    const m = new THREE.MeshBasicMaterial({
      color: color(c).multiplyScalar(intensity), map: opts.map || null, transparent: !!opts.transparent,
      opacity: opts.opacity ?? 1, alphaTest: opts.alphaTest || 0, side: opts.side === 'double' ? THREE.DoubleSide : THREE.FrontSide,
      depthWrite: opts.depthWrite ?? true, toneMapped: false, fog: opts.fog ?? true,
    });
    cache.set(key, m);
    return m;
  }

  /** Anime-style glass: blue-grey sky reflection, fresnel, two diagonal highlight streaks,
   *  lets a dim interior show through. opts: tint, opacity (0.15..0.7), streaks (bool), frost (bool: 磨砂) */
  function glass(opts = {}) {
    const key = 'glass|' + JSON.stringify(opts);
    if (cache.has(key)) return cache.get(key);
    // [v3:polish] night fades the daytime diagonal streaks out of lit panes (shared uNight; life's time drives it)
    if (shared && !shared.uNight) shared.uNight = { value: 0 };
    const m = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uTint: { value: color(opts.tint || '#9fb6c8') },
        uSkyTop: { value: color(PALETTE.skyMid) },
        uSkyLow: { value: color('#e9eef2') },
        uOpacity: { value: opts.opacity ?? 0.42 },
        uStreaks: { value: opts.streaks === false ? 0 : 1 },
        uFrost: { value: opts.frost ? 1 : 0 },
      }]),
      vertexShader: /* glsl */`
        #include <common>
        #include <fog_pars_vertex>
        varying vec3 vW; varying vec3 vN;
        void main(){
          vec3 transformed = position;
          vec4 wp = vec4(transformed,1.0);
          #ifdef USE_INSTANCING
            wp = instanceMatrix * wp;
          #endif
          wp = modelMatrix * wp; vW = wp.xyz;
          vec3 n = normal;
          #ifdef USE_INSTANCING
            n = mat3(instanceMatrix) * n;
          #endif
          vN = normalize(mat3(modelMatrix) * n);
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        #include <common>
        #include <fog_pars_fragment>
        uniform vec3 uTint; uniform vec3 uSkyTop; uniform vec3 uSkyLow; uniform float uOpacity; uniform float uStreaks; uniform float uFrost; uniform float uNight;
        varying vec3 vW; varying vec3 vN;
        void main(){
          vec3 V = normalize(cameraPosition - vW);
          vec3 N = normalize(vN); if (dot(N,V) < 0.0) N = -N;
          float fres = pow(1.0 - clamp(dot(N,V),0.0,1.0), 3.0);
          vec3 R = reflect(-V, N);
          vec3 sky = mix(uSkyLow, uSkyTop, smoothstep(-0.1, 0.6, R.y)) * mix(1.0, 0.16, uNight);   // [v3:polish3] a night sky in the glass, not the day's (grazing panes bloomed to flat white)
          vec3 col = mix(uTint * 0.55, sky, 0.35 + 0.45 * fres);
          // diagonal highlight streaks, world-anchored on the pane
          float s = dot(vW, normalize(vec3(0.62, 0.78, 0.62))) * 0.9;
          float band = abs(fract(s * 0.5) - 0.5);
          float streak = (smoothstep(0.035, 0.0, abs(band - 0.18)) * 0.9 + smoothstep(0.012, 0.0, abs(band - 0.25)) * 0.6) * uStreaks;
          streak *= 1.0 - 0.9 * uNight;
          col += vec3(1.0) * streak * 0.55;
          float a = uOpacity + fres * 0.35 + streak * 0.35;
          col = mix(col, vec3(0.86,0.9,0.92), uFrost * 0.7); a = mix(a, 0.88, uFrost);
          a *= mix(1.0, 0.7, uNight);
          gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
          #include <fog_fragment>
        }`,
      transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
    });
    m.uniforms.uNight = shared?.uNight || { value: 0 };   // shared object (UniformsUtils.merge clones values)
    cache.set(key, m);
    return m;
  }

  /** Material for vegetation cards / cut-outs (alpha tested, double sided). Put these meshes on
   *  LAYER_NO_OUTLINE (ctx.noOutline(mesh)) — the outline pass cannot see alpha cut-outs. */
  function foliage(c = '#ffffff', map, opts = {}) {
    return toon(c, { map, alphaTest: 0.5, side: 'double', paint: 0.04, ...opts });
  }

  return { toon, decal, emissive, glass, foliage, gradientMap, palette: PALETTE, color, cache, shared };
}
