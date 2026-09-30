// [v3:life] Night lighting for Kesennuma: every small light source in one registry, driven by the time system's
// night / lamps factors (ctx.shared.uNight, uLamps).
//
// Other packages call it at build time in ANY build order (registration is plain data; life turns it into
// geometry when it builds, before static batching):
//
//   import { lights } from './life/lights.js';            // from src/anime/world/<module>.js
//   const Lt = lights(ctx);
//   Lt.streetlight({ x, y, z, color?, pool?: true, real?: true })   lamp head glow + light pool on the ground (+ a real
//                                                          point light when it is one of the nearest to the camera)
//   Lt.lantern({ x, y, z, color?: '#ff9a5a' })              提灯 / paper lantern glow (soft, warm, no pool)
//   Lt.point({ x, y, z, color, size, mode?: 'lamps'|'always'|'blink'|'night', rate?, phase?, intensity? })
//   const h = Lt.boat(object3d, { nav?: { port:[x,y,z], starboard:[x,y,z], mast:[x,y,z], stern:[x,y,z] },
//                                 deck?: [[x,y,z], ...], lampRow?: { from:[x,y,z], to:[x,y,z], n }, on?: 1 })
//        boat-local positions; the lights follow the object every frame. h.setOn(0..1) (e.g. sanma lamps at sea)
//   Lt.bridge(points[[x,y,z]...], { color?, spacing?: 18, size? })   deck lamp line along a polyline (world)
//   Lt.aviation({ x, y, z })                                red blinking obstruction light (bridge towers, masts)
//   Lt.windowMaterial({ kind?: 'house'|'shop'|'office'|'apartment'|'warehouse', lit?: 0..1, tint? })
//        ShaderMaterial for window panes (PlaneGeometry/Box faces, UV 0..1 per pane). Day: anime glass with a sky
//        gradient and a highlight streak; night: a lit fraction per building (warm #ffd9a0 interiors with curtains,
//        a few cool TV/fluorescent ones), the rest dark. Survives static batching (world-cell hashes, flat varyings)
//        and works on InstancedMesh. Cached by options.
//
// Life also retro-fits warm interior panels (ctx.mat.emissive('#ffd9a0'...) as Sakura's DESIGN.md prescribes) so
// they switch on/off per room at night, and darkens the glass reflections at night.
import * as THREE from 'three';

const KEY = Symbol.for('kesennuma.life.lights');
const WARM = '#ffd9a0';

export function lights(ctx) {
  if (!ctx[KEY]) ctx[KEY] = createRegistry(ctx);
  return ctx[KEY];
}

function sharedU(ctx) {
  const S = ctx.shared;
  S.uNight ??= { value: 0 }; S.uLamps ??= { value: 0 }; S.uWet ??= { value: 0 }; S.uRain ??= { value: 0 }; S.uDusk ??= { value: 0 };
  S.uWinGain ??= { value: WIN_GAIN };   // window glow gain (look pass: warm amber that blooms, never white)
  return S;
}
export const WIN_GAIN = 1.4;
const MODES = { lamps: 0, always: 1, blink: 2, night: 3, boat: 4 };

function createRegistry(ctx) {
  const pts = [];           // { p: Vector3, color: Color(linear, prescaled), size, mode, rate, phase, dyn? }
  const pools = [];         // { x, y, z, r, color }
  const reals = [];         // { p, color, intensity, dist }
  const boats = [];         // { obj, items: [{ local, idx }], on }
  const matCache = new Map();
  const reg = {
    pts, pools, reals, boats, built: false,
    point(o) {
      const c = new THREE.Color(o.color || WARM).multiplyScalar(o.intensity ?? 1.6);
      const it = { p: new THREE.Vector3(o.x, o.y, o.z), color: c, size: o.size ?? 0.6, mode: MODES[o.mode || 'lamps'] ?? 0, rate: o.rate ?? 1, phase: o.phase ?? 0, minPx: o.minPx ?? 2.2, idx: pts.length };
      pts.push(it); return it;
    },
    streetlight(o) {
      const it = reg.point({ ...o, color: o.color || '#ffe2b8', size: o.size ?? 0.85, intensity: o.intensity ?? 2.1 });
      if (o.pool !== false) {
        const gy = o.groundY ?? (ctx.L?.heightAt ? ctx.L.heightAt(o.x, o.z) : 0);
        pools.push({ x: o.x + (o.poolDx || 0), y: gy, z: o.z + (o.poolDz || 0), r: o.poolR ?? Math.min(9, Math.max(3.5, (o.y - gy) * 0.95)), color: new THREE.Color(o.color || '#ffcf8f') });
      }
      if (o.real !== false) reals.push({ p: new THREE.Vector3(o.x, o.y - 0.25, o.z), color: new THREE.Color(o.color || '#ffcf94'), intensity: o.lightI ?? 14, dist: o.lightDist ?? 18 });
      return it;
    },
    lantern(o) {
      const it = reg.point({ ...o, color: o.color || '#ff9f63', size: o.size ?? 0.5, intensity: o.intensity ?? 1.7, mode: o.mode || 'lamps' });
      if (o.real) reals.push({ p: new THREE.Vector3(o.x, o.y, o.z), color: new THREE.Color(o.color || '#ff9f63'), intensity: o.lightI ?? 5, dist: 8 });
      return it;
    },
    aviation(o) { return reg.point({ ...o, color: '#ff3b2e', size: o.size ?? 1.6, intensity: 2.4, mode: 'blink', rate: 0.75, phase: o.phase ?? (o.x * 0.013 + o.z * 0.007), minPx: 3 }); },
    bridge(points, o = {}) {
      const spacing = o.spacing ?? 18; const out = [];
      const P = points.map((p) => new THREE.Vector3(...p));
      let acc = 0;
      for (let i = 1; i < P.length; i++) {
        const a = P[i - 1], b = P[i], len = a.distanceTo(b);
        while (acc <= len) { const q = new THREE.Vector3().lerpVectors(a, b, acc / len); out.push(reg.point({ x: q.x, y: q.y, z: q.z, color: o.color || '#ffe6bd', size: o.size ?? 0.75, intensity: o.intensity ?? 2.0, mode: 'lamps', minPx: 2.4 })); acc += spacing; }
        acc -= len;
      }
      return out;
    },
    boat(obj, o = {}) {
      const items = [];
      const add = (local, color, size, intensity, mode = 'boat') => { const it = reg.point({ x: 0, y: 0, z: 0, color, size, intensity, mode, minPx: 2.4 }); it.dyn = true; items.push({ local: new THREE.Vector3(...local), it }); return it; };
      const nav = o.nav || {};
      if (nav.port) add(nav.port, '#ff4a3c', 0.45, 2.4, 'night');
      if (nav.starboard) add(nav.starboard, '#3dff8a', 0.45, 2.2, 'night');
      if (nav.mast) add(nav.mast, '#fff4e0', 0.5, 2.4, 'night');
      if (nav.stern) add(nav.stern, '#fff4e0', 0.4, 1.8, 'night');
      for (const d of o.deck || []) add(d, '#ffd9a0', 0.7, 1.8, 'lamps');
      if (o.lampRow) { const { from, to, n = 8 } = o.lampRow; for (let i = 0; i < n; i++) { const t = n > 1 ? i / (n - 1) : 0; add([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t], '#f4ffe6', 0.55, 2.6, 'lamps'); } }
      const h = { obj, items, on: o.on ?? 1, setOn(v) { h.on = v; } };
      boats.push(h); return h;
    },
    windowMaterial(o = {}) { return windowMaterial(ctx, o, matCache); },
    interiorMaterial(color, intensity, o = {}) { return interiorMaterial(ctx, color, intensity, o, matCache); },
    /** Lamp glass / LED panel: `day` colour in daylight, self-lit `night` colour × intensity as the lamps come on. */
    lampMaterial(day = '#e6e2da', night = '#ffd9a0', intensity = 1.6) {
      const key = 'lamp|' + day + '|' + night + '|' + intensity;
      if (matCache.has(key)) return matCache.get(key);
      const S = sharedU(ctx);
      const m = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uDay: { value: new THREE.Color(day) }, uOn: { value: new THREE.Color(night).multiplyScalar(intensity) } }]),
        vertexShader: `#include <common>\n#include <fog_pars_vertex>\nvoid main(){ vec4 wp = vec4(position,1.0);\n#ifdef USE_INSTANCING\n wp = instanceMatrix * wp;\n#endif\n vec4 mvPosition = viewMatrix * modelMatrix * wp; gl_Position = projectionMatrix * mvPosition;\n#include <fog_vertex>\n}`,
        fragmentShader: `#include <common>\n#include <fog_pars_fragment>\nuniform vec3 uDay, uOn; uniform float uLamps;\nvoid main(){ gl_FragColor = vec4(mix(uDay, uOn, uLamps), 1.0);\n#include <fog_fragment>\n}`,
        fog: true,
      });
      m.uniforms.uLamps = S.uLamps; m.toneMapped = false; m.name = 'life:lamp'; m.userData.lifeSkip = true;
      matCache.set(key, m); return m;
    },
  };
  return reg;
}

// ------------------------------------------------------------------ GLSL helpers
const HASH = /* glsl */`
float lh_hash(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
`;

// ------------------------------------------------------------------ night windows for custom / instanced facades
/**
 * For modules that paint windows in their own shader (instanced mid/far blocks, facade atlases):
 *   const W = windowGlow(ctx);                      // once per material
 *   m.onBeforeCompile = (sh) => { W.patch(sh); ... sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>',
 *        '#include <emissivemap_fragment>\n totalEmissiveRadiance += klcWindowGlow(cellId, 0.6) * windowMask;'); };
 * klcWindowGlow(vec3 cell, float litFraction) -> linear emissive colour: warm #ffd9a0 interiors (plus a few soft-white,
 * orange and TV-blue rooms) for a per-cell lit fraction, scaled by the lamps factor; 0 by day. klcWindowNight() -> 0..1
 * (darken the glass by night with it). Cells: any integer id per window (building seed + floor + column).
 */
export function windowGlow(ctx) {
  const S = sharedU(ctx);
  const glsl = /* glsl */`
    uniform float uKlcNight, uKlcLamps, uKlcWinGain;
    float klc_hash(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
    float klcWindowNight(){ return uKlcNight; }
    vec3 klcWindowGlow(vec3 cell, float litFrac){
      float hb = klc_hash(vec3(cell.z, 7.0, 3.0));
      float lit = step(klc_hash(cell), litFrac * mix(0.6, 1.3, hb) * uKlcLamps);
      float hc = klc_hash(cell + 91.7);
      vec3 room = hc < 0.72 ? vec3(1.0, 0.64, 0.30) * mix(0.85, 1.2, hc / 0.72)
                : hc < 0.86 ? vec3(1.0, 0.86, 0.66) : hc < 0.94 ? vec3(1.0, 0.55, 0.25) : vec3(0.55, 0.7, 1.0);
      return room * lit * uKlcWinGain * uKlcLamps;
    }`;
  return {
    glsl,
    uniforms: { uKlcNight: S.uNight, uKlcLamps: S.uLamps, uKlcWinGain: S.uWinGain },
    /** Add the uniforms + helper functions to a shader in onBeforeCompile (fragment, after <common>). */
    patch(sh) {
      sh.uniforms.uKlcNight = S.uNight; sh.uniforms.uKlcLamps = S.uLamps; sh.uniforms.uKlcWinGain = S.uWinGain;
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + glsl);
      return sh;
    },
  };
}

// ------------------------------------------------------------------ window panes
function windowMaterial(ctx, o, cache) {
  const S = sharedU(ctx);
  const kind = o.kind || 'house';
  const key = 'win|' + kind + '|' + (o.lit ?? '') + '|' + (o.tint || '') + '|' + (o.curtain ?? '');
  if (cache.has(key)) return cache.get(key);
  const litBase = o.lit ?? ({ house: 0.62, apartment: 0.66, shop: 0.72, office: 0.45, warehouse: 0.18, school: 0.1, public: 0.35 }[kind] ?? 0.55);
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTint: { value: new THREE.Color(o.tint || '#86a0bd') },
      uSkyLow: { value: new THREE.Color('#dfe7ee') },
      uLit: { value: litBase },
      uCurtain: { value: o.curtain ?? 1 },
    }]),
    vertexShader: /* glsl */`
      #include <common>
      #include <fog_pars_vertex>
      varying vec3 vW; varying vec3 vN; varying vec2 vUv2; flat varying vec3 vCell;
      void main(){
        vec4 wp = vec4(position, 1.0);
        vec3 n = normal;
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp; n = mat3(instanceMatrix) * n;
        #endif
        wp = modelMatrix * wp; vW = wp.xyz;
        vN = normalize(mat3(modelMatrix) * n);
        vUv2 = uv;
        vCell = floor(wp.xyz * 2.0 + 0.5);
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <fog_pars_fragment>
      uniform vec3 uTint, uSkyLow; uniform float uLit, uCurtain, uNight, uLamps, uWet; uniform vec3 uSunDir;
      varying vec3 vW; varying vec3 vN; varying vec2 vUv2; flat varying vec3 vCell;
      ${HASH}
      void main(){
        vec3 V = normalize(cameraPosition - vW);
        vec3 N = normalize(vN);
        vec2 uv = vUv2;
        // ---- day: anime glass (sky gradient, diagonal streak, a hint of curtain)
        float fres = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 2.0);
        vec3 day = mix(uTint * 0.62, uSkyLow, 0.28 + 0.5 * uv.y + 0.25 * fres);
        float s = dot(vW, normalize(vec3(0.62, 0.78, 0.62))) * 0.9;
        float band = abs(fract(s * 0.5) - 0.5);
        day += vec3(0.9) * (smoothstep(0.035, 0.0, abs(band - 0.18)) * 0.5 + smoothstep(0.012, 0.0, abs(band - 0.25)) * 0.35) * (1.0 - 0.9 * uNight);   // [v3:polish] no daytime streaks at night
        float cur = uCurtain * (smoothstep(0.2, 0.17, uv.x) + smoothstep(0.8, 0.83, uv.x));
        day = mix(day, vec3(0.93, 0.89, 0.8), cur * 0.55);
        day *= 0.86 + 0.14 * clamp(dot(N, uSunDir), 0.0, 1.0);
        // ---- night: a lit fraction per building (coarse cell) and per pane (flat provoking-vertex cell)
        float hb = lh_hash(floor(vW.xzx / vec3(11.0, 11.0, 1e6)) + 17.0);
        float frac = uLit * mix(0.55, 1.25, hb) * uLamps;
        // [v3:polish] one cell per PANE: the flat provoking-vertex cell differed between a quad's two triangles (every
        // lit office pane was split along its diagonal into a lit and an unlit half). Reconstruct the pane centre from
        // the screen derivatives of the world position and the pane uv (coplanar, linear), fall back to vCell edge-on.
        vec3 pcell = vCell;
        {
          vec2 ux = dFdx(uv), uy = dFdy(uv); vec3 wx = dFdx(vW), wy = dFdy(vW);
          float det = ux.x * uy.y - ux.y * uy.x;
          if (abs(det) > 1e-12) {
            vec3 ju = (wx * uy.y - wy * ux.y) / det, jv = (wy * ux.x - wx * uy.x) / det;
            vec3 ctr = vW - ju * (uv.x - 0.5) - jv * (uv.y - 0.5);
            pcell = floor(ctr + 0.5);
          }
        }
        float hw = lh_hash(pcell);
        float lit = step(hw, frac);
        float hc = lh_hash(pcell + 91.7);
        vec3 warm = vec3(1.0, 0.70, 0.36);                       // #ffd9a0 in linear
        vec3 room = hc < 0.72 ? warm * mix(0.85, 1.25, hc / 0.72)
                  : hc < 0.86 ? vec3(1.0, 0.86, 0.66)                  // soft white
                  : hc < 0.94 ? vec3(1.0, 0.55, 0.25)                  // orange lamp
                  : vec3(0.55, 0.7, 1.0);                              // TV glow
        // interior shading: brighter ceiling, curtains at the sides (lit fabric), a sill shadow
        float ceil = 0.75 + 0.45 * smoothstep(0.0, 1.0, uv.y);
        vec3 curtainCol = room * vec3(1.05, 0.82, 0.62) * 0.72;
        vec3 litCol = mix(room * ceil, curtainCol, cur * 0.85) * 1.55;
        litCol *= 1.0 - 0.35 * smoothstep(0.1, 0.0, uv.y);
        vec3 dark = mix(vec3(0.035, 0.045, 0.085), vec3(0.08, 0.1, 0.17), uv.y + fres * 0.5);
        vec3 night = mix(dark, litCol, lit);
        vec3 col = mix(day, night, clamp(uNight * 0.85 + uLamps * lit * 0.6, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
    fog: true,
  });
  m.uniforms.uNight = S.uNight; m.uniforms.uLamps = S.uLamps; m.uniforms.uWet = S.uWet;
  m.uniforms.uSunDir = ctx.shared.uSunDir || { value: new THREE.Vector3(0, 1, 0) };
  m.name = 'life:window:' + kind;
  m.userData.lifeWindow = true;
  cache.set(key, m);
  return m;
}

// ------------------------------------------------------------------ interior glow panels (retrofit + API)
function interiorMaterial(ctx, color, intensity = 1.0, o = {}, cache) {
  const S = sharedU(ctx);
  const c = new THREE.Color(color).multiplyScalar(intensity);
  const key = 'int|' + c.getHexString() + '|' + (o.lit ?? '') + '|' + (o.side ?? '') + '|' + (o.transparent ? 1 : 0) + '|' + (o.opacity ?? 1);
  if (cache.has(key)) return cache.get(key);
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uCol: { value: c }, uLit: { value: o.lit ?? 0.7 }, uOpacity: { value: o.opacity ?? 1 } }]),
    vertexShader: /* glsl */`
      #include <common>
      #include <fog_pars_vertex>
      flat varying vec3 vCell; varying float vY;
      void main(){
        vec4 wp = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
        #endif
        wp = modelMatrix * wp;
        vCell = floor(wp.xyz / vec3(4.0, 2.9, 4.0));
        vY = wp.y;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <fog_pars_fragment>
      uniform vec3 uCol; uniform float uLit, uNight, uLamps, uOpacity;
      flat varying vec3 vCell; varying float vY;
      ${HASH}
      void main(){
        float lit = step(lh_hash(vCell + 3.1), uLit * mix(0.7, 1.15, lh_hash(floor(vCell / 3.0))));
        vec3 on = uCol * (1.0 + 0.55 * uLamps);                     // brighter at night: blooms through the glass
        vec3 off = uCol * vec3(0.05, 0.055, 0.09);
        vec3 col = mix(uCol, mix(off, on, lit), uNight);
        gl_FragColor = vec4(col, uOpacity);
        #include <fog_fragment>
      }`,
    fog: true, transparent: !!o.transparent,
    side: o.side === 'double' ? THREE.DoubleSide : THREE.FrontSide,
  });
  m.uniforms.uNight = S.uNight; m.uniforms.uLamps = S.uLamps;
  m.toneMapped = false;
  m.name = 'life:interior';
  cache.set(key, m);
  return m;
}

/** Is a MeshBasicMaterial one of the warm "interior light" panels? (hue ~20-50 deg, warm, bright) */
function isWarmInterior(m) {
  if (!m || !m.isMeshBasicMaterial || m.map || m.userData?.lifeSkip) return false;
  const c = m.color; const mx = Math.max(c.r, c.g, c.b);
  if (mx < 0.55) return false;
  const r = c.r / mx, g = c.g / mx, b = c.b / mx;
  return r > 0.97 && g > 0.52 && g < 0.9 && b > 0.18 && b < 0.62 && g > b + 0.12;
}

// ------------------------------------------------------------------ build (called by life/index.js)
export function buildLights(ctx) {
  const reg = lights(ctx);
  const S = sharedU(ctx);
  const THREEc = THREE;
  const quality = ctx.quality?.name || 'high';

  // ---- 1. retrofit warm interior panels built by other modules (before static batching merges them)
  let retro = 0;
  for (const root of [ctx.staticRoot, ctx.dynamicRoot]) root?.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material) || !isWarmInterior(o.material)) return;
    const m = o.material;
    o.material = reg.interiorMaterial('#' + m.color.getHexString(), 1.0, { transparent: m.transparent, opacity: m.opacity, side: m.side === THREEc.DoubleSide ? 'double' : 'front', lit: 0.72 });
    retro++;
  });

  // ---- 2. glass reflections darken at night (ctx.mat.glass ShaderMaterials)
  //      and a lit fraction of the panes glows warm (#ffd9a0 rooms) by night: every window in town lights up
  const glassMats = [];
  for (const [k, m] of ctx.mat?.cache || []) if (String(k).startsWith('glass|') && m.uniforms?.uSkyTop) {
    glassMats.push({ m, top: m.uniforms.uSkyTop.value.clone(), low: m.uniforms.uSkyLow.value.clone(), op: m.uniforms.uOpacity.value });
    if (!m.userData.klcNight && m.fragmentShader.includes('gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));')) {
      m.userData.klcNight = true;
      m.uniforms.uKlcLamps = S.uLamps; m.uniforms.uKlcNight = S.uNight;
      m.fragmentShader = m.fragmentShader
        .replace('void main(){', `uniform float uKlcLamps, uKlcNight;
          float klc_h(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
          void main(){`)
        .replace('gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));', `{
            vec3 cell = floor(vW / vec3(2.3, 2.9, 2.3));
            float bld = klc_h(floor(vW / vec3(14.0, 1000.0, 14.0)) + 5.0);
            float lit = step(klc_h(cell + 0.5), 0.66 * mix(0.55, 1.3, bld) * uKlcLamps) * (1.0 - uFrost * 0.4);
            float hc = klc_h(cell + 91.7);
            vec3 room = hc < 0.7 ? vec3(1.0, 0.70, 0.36) * mix(0.9, 1.25, hc / 0.7) : hc < 0.85 ? vec3(1.0, 0.76, 0.5) : hc < 0.94 ? vec3(1.0, 0.56, 0.26) : vec3(0.55, 0.7, 1.0);
            float yy = fract(vW.y / 2.9);
            vec3 glow = room * (0.85 + 0.55 * smoothstep(0.15, 0.95, yy)) * 1.4;   // [v3:polish3] 1.55 -> 1.4
            // [v3:polish3] a room, not a light box: desk / counter silhouettes in the lower third, blinds, and less glow at a
            // grazing angle (the reflection wins there). Big entrance panes bloomed into flat white panels (night_izakaya).
            float across = dot(vW.xz, vec2(0.7071, 0.7071)) * 1.9;
            glow *= mix(0.42, 1.0, smoothstep(0.24, 0.32, yy + 0.04 * sin(across * 1.3)));
            glow *= 0.9 + 0.1 * step(0.5, fract(across));
            glow *= 1.0 - 0.55 * fres;
            col = mix(col * (1.0 - 0.55 * uKlcNight), glow, lit);
            a = mix(a, 0.94, lit);
          }
          gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));`);
      m.needsUpdate = true;
    }
  }
  const nightTop = new THREEc.Color('#1c2748'), nightLow = new THREEc.Color('#2c3558');

  // ---- 3. glow points (one instanced draw call)
  const N = reg.pts.length;
  let glow = null;
  if (N) {
    const base = new THREEc.PlaneGeometry(2, 2);
    const g = new THREEc.InstancedBufferGeometry();
    g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
    const aPos = new Float32Array(N * 3), aCol = new Float32Array(N * 3), aPar = new Float32Array(N * 4), aMin = new Float32Array(N);
    reg.pts.forEach((it, i) => {
      aPos.set([it.p.x, it.p.y, it.p.z], i * 3); aCol.set([it.color.r, it.color.g, it.color.b], i * 3);
      aPar.set([it.size, it.mode, it.rate, it.phase], i * 4); aMin[i] = it.minPx;
    });
    const posAttr = new THREEc.InstancedBufferAttribute(aPos, 3); posAttr.setUsage(THREEc.DynamicDrawUsage);
    const parAttr = new THREEc.InstancedBufferAttribute(aPar, 4); parAttr.setUsage(THREEc.DynamicDrawUsage);
    g.setAttribute('iPos', posAttr); g.setAttribute('iMin', new THREE.InstancedBufferAttribute(aMin, 1)); g.setAttribute('iCol', new THREEc.InstancedBufferAttribute(aCol, 3)); g.setAttribute('iPar', parAttr);
    g.instanceCount = N;
    const mat = new THREEc.ShaderMaterial({
      uniforms: { uTime: ctx.shared.uTime, uLamps: S.uLamps, uNight: S.uNight, uPxWorld: { value: 0.001 }, uMinPx: { value: 2.2 }, uFogD: { value: 0.001 }, uBoatOn: { value: 1 } },
      vertexShader: /* glsl */`
        attribute vec3 iPos; attribute vec3 iCol; attribute vec4 iPar; attribute float iMin;
        uniform float uTime, uLamps, uNight, uPxWorld, uMinPx, uFogD;
        varying vec2 vUv; varying vec3 vCol; varying float vK;
        void main(){
          vUv = uv;
          vec4 mv = viewMatrix * vec4(iPos, 1.0);
          float depth = max(0.1, -mv.z);
          float size = iPar.x, mode = iPar.y;
          float r = max(size, iMin * depth * uPxWorld);
          float k = mode < 0.5 ? uLamps : mode < 1.5 ? 1.0 : mode < 2.5 ? (0.25 + 0.75 * step(0.55, fract(uTime * iPar.z + iPar.w))) * max(uLamps, 0.35) : mode < 3.5 ? smoothstep(0.05, 0.6, uLamps + uNight) : uLamps;
          // lights far away shrink to crisp dots instead of blobs; keep their energy roughly constant
          k *= mix(1.0, clamp(size / r, 0.0, 1.0), 0.45);
          k *= exp(-uFogD * 0.35 * depth);
          vK = k; vCol = iCol;
          mv.xyz += normalize(-mv.xyz) * min(r * 0.6, 0.6);   // pull toward the camera: never clipped by its own lamp
          mv.xy += position.xy * r;
          gl_Position = projectionMatrix * mv;
          if (k < 0.002) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        }`,
      fragmentShader: /* glsl */`
        varying vec2 vUv; varying vec3 vCol; varying float vK;
        void main(){
          vec2 q = vUv * 2.0 - 1.0; float d = length(q);
          if (d > 1.0) discard;
          float core = smoothstep(0.26, 0.08, d);
          float halo = exp(-d * d * 5.5) * 0.55 + exp(-d * d * 18.0) * 0.5;
          vec3 c = vCol * (halo + core * 1.4) + vec3(1.0, 0.96, 0.9) * core * 0.9 * vK;
          gl_FragColor = vec4(c * vK, 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREEc.AdditiveBlending, toneMapped: false,
    });
    glow = new THREEc.Mesh(g, mat);
    glow.frustumCulled = false; glow.renderOrder = 5; glow.name = 'life:glow';
    glow.userData.noBatch = true;
    ctx.noOutline ? ctx.noOutline(glow) : glow.layers.set(1);
    ctx.add ? ctx.add(glow) : ctx.scene.add(glow);
    glow.castShadow = false; glow.receiveShadow = false;
  }

  // ---- 4. light pools on the ground (instanced flat discs, additive)
  let poolMesh = null;
  if (reg.pools.length) {
    const tex = poolTexture();
    const pg = new THREEc.PlaneGeometry(2, 2); pg.rotateX(-Math.PI / 2);
    const pm = new THREEc.ShaderMaterial({
      uniforms: { uLamps: S.uLamps, uWet: S.uWet, map: { value: tex } },
      // [v3:integrate] wet streets: the quad turns to face the camera and stretches toward it; a narrow glossy streak
      // (the lamp's reflection on wet asphalt, broken by ripples) runs from the pool toward the viewer
      vertexShader: /* glsl */`
        attribute vec3 iCol; uniform float uWet; varying vec2 vUv; varying vec2 vQ; varying vec3 vCol; varying vec3 vVar;
        float hh(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main(){
          vec3 c = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float r = length((modelMatrix * instanceMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
          // [v3:fix] every pool its own size, warmth and strength; pools fade with distance (identical discs from the drone)
          float h1 = hh(c.xz), h2 = hh(c.xz + 7.1), h3 = hh(c.xz + 13.7);
          r *= 0.72 + 0.56 * h1;
          float dcam = length(cameraPosition - c);
          vVar = vec3(h2, h3, mix(1.0, 0.3, smoothstep(120.0, 900.0, dcam)));
          vec2 f = normalize(cameraPosition.xz - c.xz + vec2(1e-4)); vec2 s = vec2(f.y, -f.x);   // det +1: keeps the front face up
          float st = 1.0 + 2.6 * uWet;
          vec2 q = position.xz;                         // -1..1
          float along = q.y > 0.0 ? q.y * st : q.y;     // stretched toward the camera side only
          vec2 w = c.xz + (s * q.x + f * along) * r;
          vUv = vec2(q.x, -q.y) * 0.5 + 0.5; vQ = vec2(q.x, along); vCol = iCol;
          gl_Position = projectionMatrix * viewMatrix * vec4(w.x, c.y, w.y, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform float uLamps, uWet; uniform sampler2D map; varying vec2 vUv; varying vec2 vQ; varying vec3 vCol; varying vec3 vVar;
        float ph(float x){ return fract(sin(x * 91.7) * 43758.5453); }
        void main(){
          vec2 uv = vec2(vQ.x, -vQ.y) * 0.5 + 0.5;
          float a = (uv.y >= 0.0 && uv.y <= 1.0) ? texture2D(map, uv).r : 0.0;
          float streak = 0.0;
          if (uWet > 0.01) {
            float y = max(vQ.y, 0.0);
            float wdt = 0.04 + 0.014 * y;
            float band = 1.0 - smoothstep(wdt * 0.3, wdt, abs(vQ.x + 0.015 * sin(vQ.y * 11.0)));
            float rip = 0.45 + 0.55 * smoothstep(0.25, 0.6, ph(floor(vQ.y * 16.0)));
            streak = band * rip * smoothstep(0.0, 0.3, y) * (1.0 - smoothstep(0.6, 1.0 + 2.6 * uWet, y)) * uWet;
          }
          vec3 col = mix(vCol, vCol * vec3(1.06, 0.86, 0.66), smoothstep(0.55, 1.0, vVar.x));   // some deeper sodium amber
          col = mix(col, vec3(0.9, 0.94, 1.0) * dot(vCol, vec3(0.33)), step(0.86, vVar.y) * 0.7); // a few cool LED pools
          float k = (0.7 + 0.45 * vVar.y) * vVar.z;
          gl_FragColor = vec4(col * (a * (0.5 + 0.35 * uWet) + streak * 1.1) * uLamps * k, 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREEc.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8, toneMapped: false,
    });
    const im = new THREEc.InstancedMesh(pg, pm, reg.pools.length);
    const cols = new Float32Array(reg.pools.length * 3);
    const m4 = new THREEc.Matrix4();
    reg.pools.forEach((p, i) => { m4.makeScale(p.r, 1, p.r).setPosition(p.x, p.y + 0.06, p.z); im.setMatrixAt(i, m4); cols.set([p.color.r, p.color.g, p.color.b], i * 3); });
    pg.setAttribute('iCol', new THREEc.InstancedBufferAttribute(cols, 3));
    im.frustumCulled = false; im.name = 'life:pools'; im.renderOrder = 4; im.userData.noBatch = true;
    ctx.noOutline ? ctx.noOutline(im) : im.layers.set(1);
    ctx.add ? ctx.add(im) : ctx.scene.add(im);
    poolMesh = im;
  }

  // ---- 5. real point lights, pooled onto the lamps nearest the camera
  const NREAL = { high: 6, medium: 4, low: 2 }[quality] ?? 4;
  const slots = [];
  for (let i = 0; i < NREAL; i++) {
    const L = new THREEc.PointLight('#ffcf94', 0, 18, 1.6);
    L.castShadow = false; L.name = 'life:lamp' + i;
    ctx.scene.add(L); slots.push({ L, cur: null, k: 0 });
  }
  const _v = new THREEc.Vector3(), _q = new THREEc.Vector3();

  const cam = ctx.camera;
  function update(dt, t) {
    const lamps = S.uLamps.value, night = S.uNight.value;
    // glow sizing uniforms
    if (glow && cam) {
      const H = ctx.renderer?.domElement?.height || 1080;
      glow.material.uniforms.uPxWorld.value = 2 * Math.tan((cam.fov * Math.PI) / 360) / H;
      glow.material.uniforms.uFogD.value = ctx.scene.fog?.density ?? 0.001;
    }
    // boats follow their objects
    if (glow && reg.boats.length) {
      const pa = glow.geometry.attributes.iPos, par = glow.geometry.attributes.iPar;
      for (const b of reg.boats) {
        b.obj.updateWorldMatrix(true, false);
        for (const { local, it } of b.items) {
          _v.copy(local).applyMatrix4(b.obj.matrixWorld);
          pa.array[it.idx * 3] = _v.x; pa.array[it.idx * 3 + 1] = _v.y; pa.array[it.idx * 3 + 2] = _v.z;
          par.array[it.idx * 4] = b.on > 0.01 ? it.size : 0.0;
        }
      }
      pa.needsUpdate = true; par.needsUpdate = true;
    }
    // glass
    for (const g of glassMats) { g.m.uniforms.uSkyTop.value.copy(g.top).lerp(nightTop, night); g.m.uniforms.uSkyLow.value.copy(g.low).lerp(nightLow, night); g.m.uniforms.uOpacity.value = g.op * (1 - 0.45 * night); }
    // real lights
    if (slots.length) {
      if (lamps < 0.01 || !reg.reals.length || !cam) { for (const s of slots) s.L.intensity = 0; return; }
      _q.copy(cam.position);
      const cands = [];
      for (const r of reg.reals) { const d = r.p.distanceToSquared(_q); if (d < 110 * 110) cands.push([d, r]); }
      cands.sort((a, b) => a[0] - b[0]);
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i], c = cands[i]?.[1];
        if (!c) { s.L.intensity = 0; continue; }
        s.L.position.copy(c.p); s.L.color.copy(c.color); s.L.distance = c.dist;
        s.L.intensity = c.intensity * lamps;
      }
    }
  }
  const stats = { points: N, pools: reg.pools.length, reals: reg.reals.length, boats: reg.boats.length, retrofitted: retro, glassMats: glassMats.length, pointLights: NREAL };
  reg.built = true;
  return { update, stats, glow, poolMesh, slots };
}

let _poolTex = null;
function poolTexture() {
  if (_poolTex) return _poolTex;
  const n = 128, data = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = (x + 0.5) / n * 2 - 1, dy = (y + 0.5) / n * 2 - 1, d = Math.hypot(dx, dy);
    // soft cel pool: a bright core disc, a painted mid ring, a long faint tail
    const v = d >= 1 ? 0 : (Math.exp(-d * d * 3.2) * 0.75 + (d < 0.42 ? 0.22 : d < 0.47 ? 0.22 * (0.47 - d) / 0.05 : 0)) * (1 - d * d);
    data[y * n + x] = Math.round(Math.min(1, v) * 255);
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RedFormat);
  t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
  _poolTex = t; return t;
}
