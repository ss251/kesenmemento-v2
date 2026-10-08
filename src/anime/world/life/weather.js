// [v3:life] Weather: anime rain (soft white streaks in a box that follows the camera, wind-slanted, one draw call)
// and the wet factor. Rain strength / cloud cover come from time.weather (live JMA data via ./live.js, or ?weather=).
// ctx.shared.uRain (0..1) and uWet (0..1) are set by the time service; other materials may read uWet for puddles.
//
//   const W = buildWeather(ctx, T)  ->  { update(dt, t), mesh }
import * as THREE from 'three';

export function buildWeather(ctx, T) {
  const S = ctx.shared;
  const q = ctx.quality?.name || 'high';
  const N = { high: 9000, medium: 5000, low: 2200 }[q] ?? 5000;
  const BOX = 36;
  const r = ctx.rng('kesennuma-rain');
  const base = new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
  const a = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) a.set([r() * BOX, r() * BOX, r() * BOX, r()], i * 4);
  g.setAttribute('iSeed', new THREE.InstancedBufferAttribute(a, 4));
  g.instanceCount = N;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: S.uTime, uRain: S.uRain, uWind: S.uWind, uCam: { value: new THREE.Vector3() }, uBox: { value: BOX }, uLamps: S.uLamps, uNight: S.uNight },
    vertexShader: /* glsl */`
      attribute vec4 iSeed; uniform float uTime, uRain, uBox; uniform vec2 uWind; uniform vec3 uCam;
      varying vec2 vUv; varying float vA;
      void main(){
        vUv = uv;
        float speed = 9.0 + 3.0 * iSeed.w;
        vec3 drift = vec3(uWind.x * 1.6, -speed, uWind.y * 1.6);
        vec3 p = iSeed.xyz + drift * uTime;
        p = mod(p - uCam + uBox * 0.5, uBox) + uCam - uBox * 0.5;     // wraps round the camera
        vec3 dir = normalize(drift);
        float len = 0.95 + 1.05 * iSeed.w;
        float d0 = length(uCam - p);
        float wid = max(0.012, d0 * 0.0021);          // [live r2] readable streaks, still a stroke not a curtain
        // billboard the streak: width across the view, length along the fall direction
        vec3 toCam = normalize(uCam - p);
        vec3 side = normalize(cross(dir, toCam));
        vec3 wp = p + side * (position.x * wid) - dir * (position.y * len);
        float d = length(uCam - p);
        vA = uRain * step(iSeed.w, uRain * 1.15 + 0.04) * smoothstep(0.6, 2.4, d) * (1.0 - smoothstep(uBox * 0.35, uBox * 0.5, d));
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        if (vA < 0.002) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uLamps, uNight; varying vec2 vUv; varying float vA;
      void main(){
        float e = 1.0 - abs(vUv.x * 2.0 - 1.0);
        float a = e * smoothstep(0.0, 0.22, vUv.y) * vA * 0.62;
        vec3 c = mix(vec3(0.78, 0.84, 0.90), vec3(0.55, 0.60, 0.72), uNight) + vec3(0.25, 0.18, 0.08) * uLamps * 0.3;
        gl_FragColor = vec4(c, a);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,   // billboard winding flips with the view
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 6; mesh.name = 'life:rain';
  ctx.noOutline ? ctx.noOutline(mesh) : mesh.layers.set(1);
  ctx.add(mesh);
  const rings = buildRings(ctx, S);
  const cam = ctx.camera;
  function update() {
    const on = S.uRain.value > 0.01;
    mesh.visible = on;
    if (on && cam) mat.uniforms.uCam.value.copy(cam.position);
    rings.update(on);
  }
  return { update, mesh, rings: rings.mesh };
}

/** Expanding white rings on the water. No texture: one instanced quad, phone keeps a few dozen. */
function buildRings(ctx, S) {
  const q = ctx.quality?.name || 'high';
  const phone = !!ctx.quality?.phone || q === 'low' || q === 'phone';
  const N = phone ? 48 : q === 'medium' ? 96 : 180;
  const SPAN = 42;
  const base = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
  const rng = ctx.rng ? ctx.rng('kesennuma-rings') : Math.random;
  const a = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) a.set([rng() * SPAN, rng() * SPAN, rng(), 0.55 + rng() * 0.9], i * 4);
  g.setAttribute('iSeed', new THREE.InstancedBufferAttribute(a, 4));
  g.instanceCount = N;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: S.uTime, uRain: S.uRain, uCam: { value: new THREE.Vector3() }, uFwd: { value: new THREE.Vector2(0, 1) }, uSpan: { value: SPAN }, uSea: { value: ctx.L?.SEA?.level ?? 0 } },
    vertexShader: /* glsl */`
      attribute vec4 iSeed; uniform float uTime, uRain, uSpan, uSea; uniform vec3 uCam; uniform vec2 uFwd;
      varying vec2 vUv; varying float vLife;
      void main(){
        vUv = uv;
        float life = fract(uTime * 0.28 + iSeed.z);
        vLife = life;
        float alt = max(0.0, uCam.y - uSea);
        float span = mix(uSpan, 640.0, smoothstep(14.0, 110.0, alt));
        float lead = mix(0.15, 0.48, smoothstep(14.0, 110.0, alt));
        vec3 ahead = uCam + vec3(uFwd.x, 0.0, uFwd.y) * span * lead;
        vec3 p = vec3(iSeed.x, 0.0, iSeed.y) * (span / uSpan);
        p.xz = mod(p.xz - ahead.xz + span * 0.5, span) + ahead.xz - span * 0.5;
        p.y = uSea + mix(0.35, 3.0, smoothstep(18.0, 90.0, alt));
        float rad = (0.45 + life * 2.1) * iSeed.w * mix(1.0, 4.4, smoothstep(14.0, 110.0, alt));
        vec3 wp = p + vec3(position.x, 0.0, position.y) * rad;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        gl_Position.z -= 0.00002 * gl_Position.w;
        if (uRain < 0.02) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uRain; varying vec2 vUv; varying float vLife;
      void main(){
        vec2 q = vUv * 2.0 - 1.0;
        float r = length(q);
        float ring = smoothstep(0.64, 0.78, r) * (1.0 - smoothstep(0.86, 0.97, r));
        float a = ring * (0.35 + 0.65 * (1.0 - vLife)) * uRain * 0.7;
        if (a < 0.03) discard;
        gl_FragColor = vec4(0.72, 0.82, 0.90, a);
      }`,
    transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 4; mesh.name = 'life:rings'; mesh.visible = false;
  ctx.noOutline ? ctx.noOutline(mesh) : mesh.layers.set(1);
  ctx.add(mesh);
  const cam = ctx.camera;
  const fwd = new THREE.Vector3();
  function update(on) {
    mesh.visible = !!on;
    if (on && cam) {
      mat.uniforms.uCam.value.copy(cam.position);
      fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
      const h = Math.hypot(fwd.x, fwd.z) || 1;
      mat.uniforms.uFwd.value.set(fwd.x / h, fwd.z / h);
    }
  }
  return { mesh, update };
}
