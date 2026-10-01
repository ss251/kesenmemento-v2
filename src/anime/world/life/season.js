// [v3:integrate] Season controller (V3-SPEC section 9): 春 / 夏 / 秋 / 冬, blended over ~2.5 s.
// Drives ctx.shared.uSeason (core/season.js: every cel material, the terrain, the trees), the terrain's painted
// 紅葉 / 山桜 crown fractions, and a camera-following box of falling sakura petals (spring) or snowflakes (winter).
// The sun and the time presets keep the demo day (Oct 10): the season is an art toggle, not a calendar.
//
//   const S = createSeason(ctx, { season })   ->  { id, list, set(id, { instant }), next(), update(dt), onChange(fn), mesh }
// URL: ?season=spring|summer|autumn|winter (default autumn), or ?season=early ([v5:fix1] 早春 without snow, for Google
// Earth comparisons). Key: K cycles the four seasons (the HUD's 季節 button too).
import * as THREE from 'three';
import { SEASONS, SEASON_INDEX, DEFAULT_SEASON, PRESETS, seasonUniform, seasonWeights, seasonExtra } from '../../core/season.js';

const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);

export function createSeason(ctx, o = {}) {
  const U = seasonUniform(ctx.shared), E = seasonExtra(U);
  const known = (s) => SEASON_INDEX[s] != null || !!PRESETS[s];
  const baseOf = (s) => PRESETS[s]?.base || s;
  const extraOf = (s) => { const p = PRESETS[s]; E.value.set(p ? p.snow : 1, p ? p.dry : 0); };
  let id = known(o.season) ? o.season : DEFAULT_SEASON;
  seasonWeights(baseOf(id), U.value); extraOf(id);
  const from = new THREE.Vector4(), to = new THREE.Vector4();
  let tr = null;
  const listeners = new Set();
  const terrainU = () => ctx.services.environment?.terrainMaterial?.userData?.uniforms || null;
  const tu0 = terrainU();
  const baseAutumn = tu0?.uAutumn?.value ?? 0.02;
  function apply() {
    const tu = terrainU();
    if (tu?.uAutumn) tu.uAutumn.value = baseAutumn * U.value.z;
    if (tu?.uSakura) tu.uSakura.value = 0.12 * U.value.x;
  }
  apply();
  const mesh = buildParticles(ctx, U);

  function set(next, { instant = false } = {}) {
    if (!known(next)) return api;
    id = next; extraOf(id);
    if (instant) { tr = null; seasonWeights(baseOf(id), U.value); apply(); }
    else { from.copy(U.value); seasonWeights(baseOf(id), to); tr = { t: 0 }; }
    for (const f of listeners) try { f(api); } catch (e) { console.error(e); }
    return api;
  }
  function update(dt) {
    if (tr) {
      tr.t = Math.min(1, tr.t + dt / 2.5);
      U.value.lerpVectors(from, to, ease(tr.t));
      apply();
      if (tr.t >= 1) tr = null;
    }
    mesh?.userData.update?.();
  }
  const api = {
    get id() { return id; }, list: SEASONS, set, update, mesh,
    next() { const i = SEASON_INDEX[baseOf(id)]; return set(SEASONS[(i + 1) % SEASONS.length].id); },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
  ctx.services.season = api;
  return api;
}

/** Falling sakura petals (spring) or snowflakes (winter): one instanced draw call in a box that follows the camera. */
function buildParticles(ctx, U) {
  const S = ctx.shared;
  const q = ctx.quality?.name || 'high';
  const N = { high: 2600, medium: 1600, low: 700 }[q] ?? 1600;
  const BOX = 40;
  const r = ctx.rng('kesennuma-season-particles');
  const base = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
  const a = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) a.set([r() * BOX, r() * BOX, r() * BOX, r()], i * 4);
  g.setAttribute('iSeed', new THREE.InstancedBufferAttribute(a, 4));
  g.instanceCount = N;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: S.uTime, uWind: S.uWind || { value: new THREE.Vector2(0.5, 0) }, uSeasonS: U, uSeasonE: seasonExtra(U), uCam: { value: new THREE.Vector3() }, uBox: { value: BOX }, uNight: S.uNight || { value: 0 }, uAlt: { value: 0 } },
    vertexShader: /* glsl */`
      attribute vec4 iSeed; uniform float uTime, uBox, uAlt; uniform vec2 uWind; uniform vec3 uCam; uniform vec4 uSeasonS; uniform vec2 uSeasonE;
      varying vec2 vUv; varying float vA; varying float vPetal; varying float vShade;
      void main(){
        vUv = uv;
        float petal = step(uSeasonS.w, uSeasonS.x);                 // spring petals, else winter snow
        float amt = petal > 0.5 ? uSeasonS.x : uSeasonS.w * uSeasonE.x;   // [v5:fix1] no flakes in the early-spring preset
        float fall = mix(0.9 + 0.5 * iSeed.w, 0.55 + 0.35 * iSeed.w, petal);
        float ph = iSeed.w * 40.0;
        vec3 sway = vec3(sin(uTime * (0.9 + iSeed.w) + ph), 0.0, cos(uTime * (0.7 + iSeed.w * 0.6) + ph * 1.3)) * mix(0.35, 0.8, petal);
        vec3 p = iSeed.xyz + vec3(uWind.x * 0.9, -fall, uWind.y * 0.9) * uTime + sway;
        p = mod(p - uCam + uBox * 0.5, uBox) + uCam - uBox * 0.5;
        float d = length(uCam - p);
        float size = mix(0.055, 0.075, petal) * (0.7 + 0.6 * fract(iSeed.w * 13.7));
        size = max(size, d * 0.0016);                               // at least ~1.5 px far away
        // billboard; petals tumble (width flips with a spin)
        vec3 f = normalize(uCam - p);
        vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), f) + 1e-4);
        vec3 up = cross(f, side);
        float spin = petal > 0.5 ? sin(uTime * (2.0 + 3.0 * iSeed.w) + ph) : 1.0;
        vShade = 0.75 + 0.25 * abs(spin);
        vec3 wp = p + side * position.x * size * mix(1.0, max(0.25, abs(spin)), petal) + up * position.y * size * mix(1.0, 0.7, petal);
        vA = amt * step(iSeed.w, 0.35 + 0.65 * amt) * smoothstep(0.6, 2.0, d) * (1.0 - smoothstep(uBox * 0.34, uBox * 0.5, d));
        vA *= 1.0 - smoothstep(22.0, 60.0, uAlt);   // [v3:fix] a street-level effect: gone from the drone (read as big dots)
        vPetal = petal;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        if (vA < 0.003) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uNight; varying vec2 vUv; varying float vA; varying float vPetal; varying float vShade;
      void main(){
        vec2 c = vUv * 2.0 - 1.0;
        // petal: a soft teardrop with a notch; flake: a soft round dot
        float petalM = 1.0 - smoothstep(0.75, 1.0, length(vec2(c.x * 1.25, c.y * 0.9 + 0.1 * c.x * c.x)));
        petalM *= 1.0 - smoothstep(0.0, 0.18, 0.18 - length(c - vec2(0.0, 0.92)));
        float flake = 1.0 - smoothstep(0.35, 1.0, length(c));
        float m = mix(flake, petalM, vPetal);
        vec3 col = mix(vec3(0.95, 0.97, 1.0), vec3(1.0, 0.8, 0.86) * vShade, vPetal);
        col *= mix(1.0, 0.55, uNight);
        gl_FragColor = vec4(col, m * vA * mix(0.85, 0.95, vPetal));
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 6; mesh.name = 'life:season-particles';
  ctx.noOutline ? ctx.noOutline(mesh) : mesh.layers.set(1);
  ctx.noBatch?.(mesh);
  ctx.add(mesh);
  const cam = ctx.camera;
  mesh.userData.update = () => {
    const on = U.value.x + U.value.w * (U.extra?.value.x ?? 1) > 0.01;
    mesh.visible = on;
    if (on && cam) {
      mat.uniforms.uCam.value.copy(cam.position);
      const g = ctx.L?.heightAt ? Math.max(ctx.L.heightAt(cam.position.x, cam.position.z), 0) : 0;
      mat.uniforms.uAlt.value = cam.position.y - g;   // [v3:fix]
      mesh.visible = mat.uniforms.uAlt.value < 60;
    }
  };
  mesh.userData.update();
  return mesh;
}
