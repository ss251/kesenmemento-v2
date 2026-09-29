// [v3:harbor] DEV-ONLY test environment for the harbour kit: time presets over the Sakura sky, a flat anime
// water plane, stars. The real water / sky / time of day belong to the foundation and life packages; this only
// exists so harbour assets can be judged in context. Not part of the shipped scene.
import * as THREE from 'three';

export const PRESETS = {
  //         sun az/el (deg, az from north clockwise)   sky colours                                             lights
  day:    { az: 200, el: 48, zen: '#4f8fd6', mid: '#8fbde9', hor: '#dfe9f2', warm: '#fbe3cf', fog: '#cfdcec', sun: ['#fff0dc', 2.75], hemi: ['#a9b3ee', '#d9c6c8', 1.62], night: 0, exp: 1.0, fogD: 0.00055 },
  golden: { az: 252, el: 13, zen: '#5a86c9', mid: '#a7bfe0', hor: '#f4d6b6', warm: '#ffbe86', fog: '#e3d2c6', sun: ['#ffd6a8', 2.7], hemi: ['#a4a8e2', '#dcbfae', 1.45], night: 0, exp: 1.0, fogD: 0.0006 },
  sunset: { az: 262, el: 3, zen: '#4c5f9f', mid: '#c49bbd', hor: '#ffb487', warm: '#ff9460', fog: '#d9a9a4', sun: ['#ffa46e', 1.9], hemi: ['#8f8cd0', '#c9a2a0', 1.3], night: 0.35, exp: 1.02, fogD: 0.0007 },
  night:  { az: 110, el: 38, zen: '#0a1230', mid: '#16244a', hor: '#2f3d68', warm: '#2f3d68', fog: '#1b2442', sun: ['#9db2ff', 0.55], hemi: ['#40548e', '#2a2838', 0.62], night: 1, exp: 1.0, fogD: 0.0008, moon: true },
};

export function sunVec(az, el) {
  const a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el);
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)).normalize();
}

export function applyPreset(name, { scene, sky, ctx, pipeline }) {
  const P = PRESETS[name] || PRESETS.golden;
  const dir = sunVec(P.az, P.el);
  const U = sky.uniforms;
  U.uZenith.value.set(P.zen); U.uMid.value.set(P.mid); U.uHorizon.value.set(P.hor); U.uWarm.value.set(P.warm); U.uFog.value.set(P.fog);
  // the sky shader draws the sun disc at uSun; at night hide it below the horizon
  U.uSun.value.copy(P.moon ? new THREE.Vector3(0.3, -0.4, 0.5).normalize() : dir);
  sky.sun.color.set(P.sun[0]); sky.sun.intensity = P.sun[1];
  sky.hemi.color.set(P.hemi[0]); sky.hemi.groundColor.set(P.hemi[1]); sky.hemi.intensity = P.hemi[2];
  scene.fog.color.set(P.fog); scene.fog.density = P.fogD;
  ctx.sunDir.copy(dir); ctx.shared.uSunDir.value.copy(dir);
  ctx.shared.uNight.value = P.night;
  (ctx.shared.uLamps ||= { value: 0 }).value = { day: 0, golden: 0.05, sunset: 0.7, night: 1 }[name] ?? 0;
  if (pipeline.compMat.uniforms.uExposure) pipeline.compMat.uniforms.uExposure.value = P.exp;
  if (P.moon) { pipeline.compMat.uniforms.uBloom.value = 0.55; pipeline.compMat.uniforms.uGlow.value = 0.3; }
  return { dir, leakDir: P.moon ? new THREE.Vector3(0.3, -0.5, 0.5).normalize() : dir, P };
}

/** Flat anime water: depth-banded teal, painted ripple strokes, fresnel sky, sun sparkles; night-aware. */
export function makeWater(ctx, { size = 12000, y = 0 } = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uDeep: { value: new THREE.Color('#2e6f86') }, uShallow: { value: new THREE.Color('#58a3b2') }, uSky: { value: new THREE.Color('#bcd2e6') },
      uSunCol: { value: new THREE.Color('#fff1d8') },
    }]),
    vertexShader: /* glsl */`
      #include <common>
      #include <fog_pars_vertex>
      varying vec3 vW;
      void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <fog_pars_fragment>
      uniform vec3 uDeep, uShallow, uSky, uSunCol, uSunDir; uniform float uTime, uNight;
      varying vec3 vW;
      float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
      float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 4.0);
        float n = vn(vW.xz * 0.008) * 0.6 + vn(vW.xz * 0.03) * 0.4;
        vec3 col = mix(uDeep, uShallow, smoothstep(0.4, 0.75, n) * 0.45);
        // sparse painted ripple strokes (long, thin, drifting), fading with distance
        vec2 q = vec2(vW.x * 0.12 + uTime * 0.2, vW.z * 0.9);
        float s = vn(q) * 0.7 + vn(q * 2.1 + 7.0) * 0.3;
        float stroke = smoothstep(0.74, 0.76, s) * (1.0 - smoothstep(0.77, 0.8, s));
        float dist = length(cameraPosition - vW);
        col = mix(col, uShallow * 1.15, stroke * 0.35 * (1.0 - smoothstep(60.0, 250.0, dist)));
        col = mix(col, uSky, fres * 0.75);
        // sun glitter: sparse sparkles where the reflected view meets the sun
        vec3 R = reflect(-V, vec3(0.0, 1.0, 0.0));
        float sd = max(dot(R, normalize(uSunDir)), 0.0);
        vec2 gp = vW.xz * vec2(0.9, 2.2); vec2 cell = floor(gp); vec2 fc = fract(gp) - 0.5;
        float tw = h21(cell + floor(uTime * 2.0 + h21(cell) * 10.0));
        float dia = 1.0 - smoothstep(0.05, 0.12, abs(fc.x) * 0.5 + abs(fc.y));
        float spark = step(0.9, tw) * dia * pow(sd, 40.0) * 5.0 + pow(sd, 400.0) * 1.2;
        col += uSunCol * spark * (1.0 - uNight);
        // night: dark navy water that still shows the sky tint
        col = mix(col, mix(vec3(0.02, 0.035, 0.07), uSky * 0.35, fres), uNight * 0.9);
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
    fog: true,
  });
  mat.uniforms.uTime = ctx.shared.uTime; mat.uniforms.uNight = ctx.shared.uNight; mat.uniforms.uSunDir = ctx.shared.uSunDir;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), mat);
  m.position.y = y; m.receiveShadow = false; m.name = 'devWater';
  // stays in the outline (normal/depth) pre-pass so hulls and quays get a crisp waterline and nothing under the
  // surface draws outlines through it
  ctx.noBatch(m); ctx.scene.add(m);
  return m;
}

export function setWaterPreset(water, name) {
  const u = water.material.uniforms;
  const T = { day: ['#2e6f86', '#58a3b2', '#bcd2e6', '#fff1d8'], golden: ['#2e6680', '#5f9aa8', '#e9d5c4', '#ffd9a8'], sunset: ['#3a5578', '#8a8aa8', '#f0b39a', '#ffb07a'], night: ['#0b1a30', '#15304a', '#2d3d66', '#9db2ff'] }[name] || null;
  if (!T) return;
  u.uDeep.value.set(T[0]); u.uShallow.value.set(T[1]); u.uSky.value.set(T[2]); u.uSunCol.value.set(T[3]);
}

export function makeStars(ctx, rng) {
  const n = 1400, p = new Float32Array(n * 3), c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = rng(), v = rng() * 0.95 + 0.05; const th = u * Math.PI * 2, ph = Math.asin(v);
    p.set([Math.cos(th) * Math.cos(ph) * 1500, Math.sin(ph) * 1500, Math.sin(th) * Math.cos(ph) * 1500], i * 3);
    const b = 0.5 + rng() * 1.3; c.set([b, b * 0.97, b * (0.9 + rng() * 0.2)], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false, transparent: true }));
  pts.renderOrder = -9; pts.frustumCulled = false; ctx.noOutline(pts); ctx.noBatch(pts);
  return pts;
}
