// Tyre smoke: soft puffs from the rear wheels, only while the car is sliding.
// They grow and fade. Alpha is ordinary (not additive) and the grey stays
// under the bloom threshold (1.05), so a puff cannot become a white ball.
// World size is capped, then again so the puff is at most 30 % of the frame.

import * as THREE from 'three';

export const PUFF = {
  life: 0.9,
  base: 0.9,
  grow: 2.2,
  maxWorld: 2.05,
  screenFrac: 0.3,
  every: 0.1,
  alpha: 0.72,
  // Below 1.0, so the bright-pass (threshold 1.05) ignores them.
  color: [0.82, 0.8, 0.76],
};

const CAP = 28;

export function puffScale(u) {
  const t = u < 0 ? 0 : u > 1 ? 1 : u;
  return Math.min(PUFF.maxWorld, PUFF.base * (1 + PUFF.grow * (1 - t)));
}

/** Metres of world height that still fit in `frac` of the frame. */
export function screenCap(world, dist, fovDeg, frac = PUFF.screenFrac) {
  const tan = Math.tan((fovDeg * Math.PI / 180) / 2);
  const limit = frac * 2 * Math.max(1.2, dist) * (tan > 0 ? tan : 0.5);
  return Math.min(world, limit);
}

export function shouldPuff(sliding, reduced) {
  return !!sliding && !reduced;
}

// Same instanced layout as kit/fx.js (vec4 + vec4). A lone float attribute
// never reached the GPU here, so the puffs stayed invisible.
const VERT = /* glsl */`
  attribute vec4 iData;
  attribute vec4 iStyle;
  uniform vec3 uCam;
  uniform float uTan;
  varying vec2 vUv;
  varying float vA;
  void main() {
    float sc = iStyle.w;
    vA = iData.w;
    if (sc < 0.001 || vA < 0.01) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    vUv = uv;
    vec3 p = iData.xyz;
    float dist = max(1.2, length(uCam - p));
    sc = min(sc, 0.30 * 2.0 * dist * max(uTan, 0.2));
    vec3 f = normalize(uCam - p);
    vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), f) + 1e-4);
    vec3 up = cross(f, side);
    vec3 wp = p + (side * position.x + up * position.y) * sc;
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }`;

const FRAG = /* glsl */`
  uniform vec3 uCol;
  varying vec2 vUv;
  varying float vA;
  void main() {
    vec2 c = vUv * 2.0 - 1.0;
    float puff = exp(-dot(c, c) * 1.7);
    float a = puff * vA;
    if (a < 0.02) discard;
    gl_FragColor = vec4(uCol, a);
  }`;

export function createPuffs(ctx) {
  const life = new Float32Array(CAP);
  const maxL = new Float32Array(CAP);
  const vx = new Float32Array(CAP);
  const vy = new Float32Array(CAP);
  const vz = new Float32Array(CAP);
  const data = new Float32Array(CAP * 4);
  const style = new Float32Array(CAP * 4);
  const scale = new Float32Array(CAP);
  let cursor = 0;
  let seed = 0x51ed1;
  let waitL = 0;
  let waitR = 0;
  let reduced = false;
  try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { reduced = false; }

  function rnd() {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.attributes.position);
  geo.setAttribute('uv', base.attributes.uv);
  const aData = new THREE.InstancedBufferAttribute(data, 4);
  const aStyle = new THREE.InstancedBufferAttribute(style, 4);
  aData.setUsage(THREE.DynamicDrawUsage);
  aStyle.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iData', aData);
  geo.setAttribute('iStyle', aStyle);
  geo.instanceCount = CAP;

  const uCam = { value: new THREE.Vector3() };
  const uTan = { value: Math.tan((50 * Math.PI / 180) / 2) };
  const uCol = { value: new THREE.Vector3(PUFF.color[0], PUFF.color[1], PUFF.color[2]) };
  const mat = new THREE.ShaderMaterial({
    uniforms: { uCam, uTan, uCol },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'play-smoke';
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.renderOrder = 4;
  mesh.visible = false;
  ctx.noOutline?.(mesh);
  ctx.noBatch?.(mesh);
  ctx.add(mesh);

  ctx.onUpdate?.(() => {
    const cam = ctx.camera;
    if (!cam) return;
    uCam.value.copy(cam.position);
    const fov = cam.fov > 1 ? cam.fov : 50;
    uTan.value = Math.tan((fov * Math.PI / 180) / 2);
  });

  function slot() {
    for (let k = 0; k < CAP; k++) {
      const i = (cursor + k) % CAP;
      if (life[i] <= 0) { cursor = (i + 1) % CAP; return i; }
    }
    return -1;
  }

  function emit(x, y, z) {
    const i = slot();
    if (i < 0) return;
    life[i] = PUFF.life;
    maxL[i] = PUFF.life;
    const th = rnd() * 6.2831853;
    vx[i] = Math.cos(th) * 0.48;
    vz[i] = Math.sin(th) * 0.48;
    vy[i] = 1.05 + rnd() * 0.45;
    const p = i * 4;
    data[p] = x;
    data[p + 1] = y;
    data[p + 2] = z;
    data[p + 3] = PUFF.alpha;
    scale[i] = PUFF.base;
    style[p + 3] = PUFF.base;
  }

  return {
    mesh,
    step(dt, sliding, lx, y, lz, rx, rz) {
      const d = dt > 0 && dt < 0.08 ? dt : 0.016;
      if (shouldPuff(sliding, reduced)) {
        waitL += d;
        waitR += d;
        if (waitL >= PUFF.every) { emit(lx, y + 0.72, lz); waitL = 0; }
        if (waitR >= PUFF.every) { emit(rx, y + 0.72, rz); waitR = 0; }
      } else {
        waitL = 0;
        waitR = 0;
      }
      let live = 0;
      for (let i = 0; i < CAP; i++) {
        const p = i * 4;
        if (life[i] <= 0) { scale[i] = 0; style[p + 3] = 0; continue; }
        life[i] -= d;
        if (life[i] <= 0) {
          life[i] = 0;
          scale[i] = 0;
          style[p + 3] = 0;
          data[p + 3] = 0;
          continue;
        }
        data[p] += vx[i] * d;
        data[p + 1] += vy[i] * d;
        data[p + 2] += vz[i] * d;
        vy[i] -= 0.22 * d;
        const u = life[i] / maxL[i];
        scale[i] = puffScale(u);
        style[p + 3] = scale[i];
        const fin = u > 0.85 ? (1 - u) / 0.15 : 1;
        data[p + 3] = PUFF.alpha * u * fin;
        live++;
      }
      const show = live > 0;
      mesh.userData.live = live;
      if (mesh.visible !== show) mesh.visible = show;
      if (show) { aData.needsUpdate = true; aStyle.needsUpdate = true; }
    },
  };
}
