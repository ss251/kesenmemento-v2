// [v3:harbor] Night-driven lamps and water glints for the harbour kit.
//
// Everything that lights up at night (boat windows, nav lights, saury lamps, bridge lights, market floods) uses
// nightMat(): a tiny ShaderMaterial whose colour blends from a day colour (the lamp/glass as seen in daylight) to a
// self-lit night colour by ctx.shared.uNight (0 = day, 1 = night). The life package drives uNight; the harbour
// creates it when absent. ShaderMaterials survive static batching (batch2 only rewrites Toon/Basic materials), so
// thousands of lamps still merge into a handful of draw calls.
//
// glints: soft vertical light streaks on the water under lamps (anime night reflections), one draw call for the
// whole harbour, oriented toward the camera in the vertex shader, visible only at night.
import * as THREE from 'three';
import { lights as lifeLights } from '../life/lights.js';

/** The life package's light registry (glow sprites, pools, real lights; see ../life/lights.js). Null if unavailable. */
export function registry(ctx) { try { return lifeLights(ctx); } catch (e) { return null; } }

export function nightUniform(ctx) {
  if (!ctx.shared.uNight) ctx.shared.uNight = { value: 0 };
  return ctx.shared.uNight;
}

const _cache = new WeakMap();
function cacheFor(ctx) { let c = _cache.get(ctx); if (!c) _cache.set(ctx, (c = new Map())); return c; }
const lin = (hex) => new THREE.Color(hex);

/**
 * Lamp / window material. day: colour in daylight (albedo-ish, lightly shaded), night: self-lit colour,
 * intensity: night multiplier (> ~1.1 blooms). opts.always: 0..1 glow also by day (e.g. red nav light 0.35).
 */
export function nightMat(ctx, day, night, intensity = 1.4, opts = {}) {
  const key = `n|${day}|${night}|${intensity}|${opts.always || 0}|${opts.side || ''}|${opts.flicker || 0}`;
  const cache = cacheFor(ctx);
  if (cache.has(key)) return cache.get(key);
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uDay: { value: lin(day) }, uNightC: { value: lin(night).multiplyScalar(intensity) },
      uAlways: { value: opts.always || 0 }, uFlicker: { value: opts.flicker || 0 },
    }]),
    vertexShader: /* glsl */`
      #include <common>
      #include <fog_pars_vertex>
      varying vec3 vN; varying vec3 vW;
      void main(){
        vec4 wp = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
        #endif
        wp = modelMatrix * wp; vW = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <fog_pars_fragment>
      uniform vec3 uDay; uniform vec3 uNightC; uniform float uNight; uniform float uAlways; uniform float uFlicker; uniform float uTime;
      varying vec3 vN; varying vec3 vW;
      void main(){
        // daylight look: flat colour with a soft two-band shade so lamps read as objects, not holes
        float sh = 0.82 + 0.18 * step(0.0, vN.y + 0.3);
        vec3 dayc = uDay * sh;
        float f = 1.0 - uFlicker * (0.5 + 0.5 * sin(uTime * 7.0 + vW.x * 3.1 + vW.z * 1.7)) * 0.35;
        float k = clamp(max(uNight, uAlways), 0.0, 1.0);
        vec3 col = mix(dayc, uNightC * f, k);
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
    fog: true,
    side: opts.side === 'double' ? THREE.DoubleSide : THREE.FrontSide,
  });
  m.uniforms.uNight = nightUniform(ctx);
  m.uniforms.uTime = ctx.shared.uTime;
  m.name = 'harborNight';
  cache.set(key, m);
  return m;
}

// ------------------------------------------------------------------------------------------ glints
const GLINT_VS = /* glsl */`
  #include <common>
  #include <fog_pars_vertex>
  attribute vec3 gCenter; attribute vec3 gColor; attribute vec2 gSize; attribute vec2 gCorner;
  uniform float uTime;
  varying vec3 vColor; varying vec2 vUv; varying float vSeed;
  void main(){
    // streak lies on the water, its long axis pointing at the camera (reflections stretch toward the viewer)
    vec2 toCam = cameraPosition.xz - gCenter.xz;
    float d = max(length(toCam), 1.0);
    vec2 ax = toCam / d; vec2 side = vec2(-ax.y, ax.x);
    float len = gSize.y * (0.6 + clamp(cameraPosition.y / 30.0, 0.0, 1.0) * 0.2);
    vec3 P = vec3(gCenter.x + side.x * gCorner.x * gSize.x + ax.x * (gCorner.y + 0.35) * len, gCenter.y, gCenter.z + side.y * gCorner.x * gSize.x + ax.y * (gCorner.y + 0.35) * len);
    vColor = gColor; vUv = gCorner; vSeed = fract(gCenter.x * 0.137 + gCenter.z * 0.071);
    vec4 mvPosition = viewMatrix * vec4(P, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const GLINT_FS = /* glsl */`
  #include <common>
  #include <fog_pars_fragment>
  uniform float uNight; uniform float uTime;
  varying vec3 vColor; varying vec2 vUv; varying float vSeed;
  void main(){
    float across = 1.0 - smoothstep(0.15, 1.0, abs(vUv.x));
    float along = smoothstep(-1.0, -0.6, vUv.y) * (1.0 - smoothstep(0.2, 1.0, vUv.y));
    // broken horizontal ripples, drifting — [v3:fix] irregular spacing and dropped bands (the even bars read as ladders)
    float y = vUv.y * (6.5 + 5.0 * vSeed) + sin(vUv.y * 4.3 + vSeed * 17.0) * 0.9 + uTime * 0.9 + vSeed * 20.0;
    float rip = smoothstep(0.25, 0.6, abs(fract(y) - 0.5) * 2.0) * step(0.22, fract(sin(floor(y) * 91.7 + vSeed * 13.1) * 4375.85));
    float wob = 0.55 + 0.45 * sin(y * 1.7 + vUv.x * 3.0);
    float a = across * along * mix(0.35, 1.0, rip) * wob * uNight;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor * a, 1.0);
    #include <fog_fragment>
  }`;

/** Register a night light reflection on the water at (x, y=water, z). color: sRGB hex, w: half width, len: length (m). */
export function addGlint(ctx, x, y, z, color = '#ffd9a0', w = 0.5, len = 6, strength = 1) {
  const sys = glintSystem(ctx);
  const c = lin(color).multiplyScalar(strength);
  sys.items.push([x, y + 0.03, z, c.r, c.g, c.b, w, len]);
  sys.dirty = true;
}

function glintSystem(ctx) {
  if (ctx.__harborGlints) return ctx.__harborGlints;
  const sys = { items: [], dirty: false, mesh: null };
  ctx.__harborGlints = sys;
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
    vertexShader: GLINT_VS, fragmentShader: GLINT_FS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true, side: THREE.DoubleSide,
  });
  mat.uniforms.uNight = nightUniform(ctx); mat.uniforms.uTime = ctx.shared.uTime;
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
  mesh.frustumCulled = false; mesh.renderOrder = 3; mesh.name = 'harborGlints';
  ctx.noOutline(mesh); ctx.noBatch(mesh);
  ctx.add(mesh);
  sys.mesh = mesh;
  const rebuild = () => {
    const n = sys.items.length; sys.dirty = false;
    const C = new Float32Array(n * 12), K = new Float32Array(n * 12), S = new Float32Array(n * 8), R = new Float32Array(n * 8), P = new Float32Array(n * 12);
    const idx = new Uint32Array(n * 6);
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    sys.items.forEach((it, i) => {
      for (let j = 0; j < 4; j++) {
        const v = i * 4 + j;
        C.set([it[0], it[1], it[2]], v * 3); P.set([it[0], it[1], it[2]], v * 3);
        K.set([it[3], it[4], it[5]], v * 3); S.set([it[6], it[7]], v * 2); R.set(corners[j], v * 2);
      }
      idx.set([i * 4, i * 4 + 2, i * 4 + 1, i * 4, i * 4 + 3, i * 4 + 2], i * 6);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('gCenter', new THREE.BufferAttribute(C, 3));
    g.setAttribute('gColor', new THREE.BufferAttribute(K, 3));
    g.setAttribute('gSize', new THREE.BufferAttribute(S, 2));
    g.setAttribute('gCorner', new THREE.BufferAttribute(R, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    mesh.geometry.dispose(); mesh.geometry = g;
  };
  ctx.onUpdate(() => { if (sys.dirty) rebuild(); mesh.visible = (ctx.shared.uNight?.value ?? 0) > 0.02; });
  return sys;
}

// ------------------------------------------------------------------------------------------ light-up
/**
 * Additive night "light-up" wash for landmark structures (bridge pylons, the arch): put it on a slightly inflated
 * copy of the geometry (noOutline). Bright near y0, fading upward over `fall` metres (floodlights from below), with a
 * soft rim so silhouettes glow. Invisible by day.
 */
export function lightupMat(ctx, color = '#dfe9ff', strength = 0.6, y0 = 0, fall = 80) {
  const key = `lu|${color}|${strength}|${y0}|${fall}`;
  const cache = cacheFor(ctx);
  if (cache.has(key)) return cache.get(key);
  const m = new THREE.ShaderMaterial({
    uniforms: { uCol: { value: lin(color).multiplyScalar(strength) }, uY0: { value: y0 }, uFall: { value: fall } },
    vertexShader: /* glsl */`
      varying vec3 vW; varying vec3 vN;
      void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uCol; uniform float uY0, uFall, uNight;
      varying vec3 vW; varying vec3 vN;
      void main(){
        vec3 V = normalize(cameraPosition - vW);
        float rim = pow(1.0 - abs(dot(normalize(vN), V)), 2.0);
        float up = exp(-max(vW.y - uY0, 0.0) / uFall);
        float a = uNight * (0.35 + 0.65 * up) * (0.55 + 0.45 * rim);
        if (a < 0.01) discard;
        gl_FragColor = vec4(uCol * a, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  m.uniforms.uNight = nightUniform(ctx);
  m.name = 'harborLightup';
  cache.set(key, m);
  return m;
}
