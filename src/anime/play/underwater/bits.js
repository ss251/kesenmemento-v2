// [play:underwater] Light shafts, the player's bubbles and drifting plankton in one instanced quad (one draw).
// A splash ring for the leap.
// Positions are computed in the shader: shafts and plankton are anchored to the world (they stream past as you
// swim), bubbles rise from puffs the fish lets go (a small uniform ring, written in place). No buffer is written per frame.
// Shafts are additive and capped (each adds at most 0.17), so they never bloom or white out the frame.

import * as THREE from 'three';
import { swimU } from './fog.js';

const PUFFS = 12;
const PER_PUFF = 3;

/** How often the fish lets a puff go, in seconds: resting, cruising, dashing. */
export const PUFF_EVERY = { rest: 0.9, swim: 0.32, dash: 0.12 };

/** Ring-buffer bookkeeping for the bubble puffs. Pure, no allocation; returns the slot to write or -1. */
export function puffDue(st, dt, speed, dashing) {
  st.wait -= dt;
  if (st.wait > 0) return -1;
  st.wait += dashing ? PUFF_EVERY.dash : speed > 0.6 ? PUFF_EVERY.swim : PUFF_EVERY.rest;
  if (st.wait < 0) st.wait = 0;
  const slot = st.next;
  st.next = (st.next + 1) % PUFFS;
  return slot;
}

const VERT = /* glsl */`
attribute float aSeed;
attribute float aKind;
uniform float uTime, uRush, uCau, uLight;
uniform vec3 uSun;
uniform vec4 uPuff[${PUFFS}];
varying float vKind;
varying vec2 vBitsUv;
varying float vAlpha;
varying float vAlong;
float b_h(float n) { return fract(sin(n * 127.1) * 43758.5453); }
`;

const PLACE = /* glsl */`
  vKind = aKind;
  vBitsUv = position.xy + vec2(0.5);
  vAlong = 0.0;
  float id = aSeed;
  vec3 wpos;
  vec3 cam = cameraPosition;
  if (aKind < 0.5) {
    // plankton: a speck at a fixed place in a 12 m cube that wraps around the eye
    vec3 home = vec3(b_h(id), b_h(id + 3.1), b_h(id + 7.7)) * 12.0;
    home += vec3(sin(uTime * 0.11 + id), sin(uTime * 0.07 + id * 1.3) * 0.6, cos(uTime * 0.09 + id)) * 0.35;
    vec3 rel = mod(home - cam + 6.0, 12.0) - 6.0;
    wpos = cam + rel;
    float d = length(rel);
    vAlpha = (1.0 - smoothstep(3.5, 6.0, d)) * smoothstep(0.25, 0.8, d) * step(wpos.y, -0.08);
    float s = (0.012 + b_h(id + 1.7) * 0.014) * (1.0 + uRush * 0.8);
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    wpos += (right * position.x + up * position.y) * s * 2.0;
  } else if (aKind < 1.5) {
    // a bubble from puff floor(id / 3): it rises, wobbles, and pops at the surface
    int pi = int(floor(id / ${PER_PUFF}.0 + 0.001));
    vec4 puff = uPuff[pi];
    float j = mod(id, ${PER_PUFF}.0);
    float age = uTime + 1.0 - puff.w - j * 0.07;   // w is the birth time + 1, so 0 means an empty slot
    float rise = age * (0.55 + b_h(id) * 0.25) + age * age * 0.12;
    vec3 p = puff.xyz + vec3((b_h(id + 2.0) - 0.5) * 0.06, rise, (b_h(id + 4.0) - 0.5) * 0.06);
    p.x += sin(age * 9.0 + id) * 0.025 * min(age * 3.0, 1.0);
    p.z += cos(age * 7.0 + id * 1.7) * 0.025 * min(age * 3.0, 1.0);
    vAlpha = step(0.0, age) * (1.0 - smoothstep(2.0, 2.6, age)) * (1.0 - smoothstep(-0.25, -0.06, p.y)) * step(0.5, puff.w);
    float s = (0.010 + b_h(id + 9.0) * 0.012) * (1.0 + min(age, 2.0) * 0.12);
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    wpos = p + (right * position.x + up * position.y) * s * 2.0;
  } else {
    // a shaft: from the surface down along the refracted sun, on a 16 m lattice around the eye
    vec2 off = vec2(b_h(id), b_h(id + 5.3)) * 12.0;
    vec2 base = floor((cam.xz - off) / 12.0 + 0.5) * 12.0 + off;
    base += vec2(sin(uTime * 0.17 + id * 2.1), cos(uTime * 0.13 + id * 1.7)) * 0.7;
    vec2 cell = abs(base - cam.xz);
    float edgeFade = 1.0 - smoothstep(4.0, 6.2, max(cell.x, cell.y));
    vec3 dir = -normalize(uSun + vec3(sin(uTime * 0.11 + id) * 0.03, 0.0, cos(uTime * 0.09 + id) * 0.03));
    float len = 15.0;
    vec3 top = vec3(base.x, -0.02, base.y);
    float along = 0.5 - position.y;
    vec3 axisP = top + dir * along * len;
    vec3 toCam = cam - axisP;
    vec3 side = normalize(cross(dir, toCam) + vec3(1e-5, 0.0, 0.0));
    float width = 0.5 + b_h(id + 8.0) * 0.7;
    wpos = axisP + side * position.x * width;
    vAlong = along;
    // fade the shaft out when the eye is close to it, so it never fills the frame
    vec3 rel = top - cam;
    float axisDist = length(rel - dir * dot(rel, dir));
    vAlpha = edgeFade * smoothstep(1.6, 4.0, axisDist) * uCau * exp(-length(axisP - cam) / 16.0);
  }
  gl_Position = projectionMatrix * viewMatrix * vec4(wpos, 1.0);
`;

const FRAG_DECL = /* glsl */`
varying float vKind;
varying vec2 vBitsUv;
varying float vAlpha;
varying float vAlong;
uniform float uTime, uLight;
`;

const FRAG = /* glsl */`
  vec2 c = vBitsUv - 0.5;
  float d = length(c) * 2.0;
  float aa = fwidth(d) * 1.2 + 1e-3;
  vec3 col;
  float cover;
  if (vKind < 0.5) {
    cover = 1.0 - smoothstep(0.55 - aa, 0.55 + aa, d);
    col = vec3(0.86, 0.96, 0.9) * 0.16 * uLight * cover;
  } else if (vKind < 1.5) {
    // a crisp ring with a faint body and a small highlight: reads as a bubble, never as a glow ball
    float ring = smoothstep(0.66 - aa, 0.66 + aa, d) * (1.0 - smoothstep(0.92 - aa, 0.92 + aa, d));
    float body = 1.0 - smoothstep(0.66 - aa, 0.66 + aa, d);
    float spec = 1.0 - smoothstep(0.16 - aa, 0.16 + aa, length(c * 2.0 - vec2(-0.28, 0.3)));
    cover = max(ring, body);
    col = vec3(0.84, 0.97, 1.0) * (ring * 0.36 + body * 0.05 + spec * 0.4) * max(uLight, 0.35);
  } else {
    float across = 1.0 - abs(vBitsUv.x - 0.5) * 2.0;
    cover = across * across * (3.0 - 2.0 * across);
    cover *= smoothstep(0.0, 0.05, vAlong) * exp(-vAlong * 3.2);
    cover *= 0.8 + 0.2 * sin(vAlong * 26.0 - uTime * 0.9 + vBitsUv.x * 3.0);
    col = vec3(0.86, 1.0, 0.95) * 0.17 * uLight * cover;
  }
  if (cover * vAlpha < 0.004) discard;
  gl_FragColor = vec4(col * vAlpha, 1.0);
`;

export function createBits(ctx) {
  const phone = !!ctx.quality?.phone;
  const plankton = phone ? 24 : 40;
  const bubbles = PUFFS * PER_PUFF;
  const shafts = phone ? 5 : 6;
  const n = plankton + bubbles + shafts;
  const geo = new THREE.PlaneGeometry(1, 1);
  const seeds = new Float32Array(n);
  const kinds = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (i < plankton) { seeds[i] = i + 0.37; kinds[i] = 0; } else if (i < plankton + bubbles) { seeds[i] = i - plankton; kinds[i] = 1; } else { seeds[i] = (i - plankton - bubbles) * 1.37 + 0.21; kinds[i] = 2; }
  }
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  geo.setAttribute('aKind', new THREE.InstancedBufferAttribute(kinds, 1));
  const focus = { value: new THREE.Vector3() };
  const time = { value: 0 };
  const rush = { value: 0 };
  const puffs = { value: Array.from({ length: PUFFS }, () => new THREE.Vector4(0, -100, 0, 0)) };
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
  mat.name = 'swim-bits';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.uniforms.uRush = rush;
    shader.uniforms.uPuff = puffs;
    shader.uniforms.uSun = swimU.uSwimSun;
    shader.uniforms.uCau = swimU.uSwimCau;
    shader.uniforms.uLight = swimU.uSwimLight;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + PLACE)
      .replace('#include <project_vertex>', '// swim-bits: gl_Position is set above');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_DECL)
      .replace('#include <opaque_fragment>', '#include <opaque_fragment>\n' + FRAG);
  };
  mat.customProgramCacheKey = () => 'swim-bits-3';
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.name = 'swim-bits';
  mesh.frustumCulled = false;
  mesh.count = n;
  mesh.renderOrder = 2;
  const id = new THREE.Matrix4();
  for (let i = 0; i < n; i++) mesh.setMatrixAt(i, id);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.visible = false;
  ctx.noBatch(mesh);
  ctx.noOutline(mesh);
  ctx.add(mesh);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.35, 0.55, 28),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#e7f3f4'), transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }),
  );
  ring.name = 'swim-splash';
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  ring.frustumCulled = false;
  ctx.noBatch(ring);
  ctx.noOutline(ring);
  ctx.add(ring);
  const splash = { age: -1, x: 0, z: 0, power: 1 };
  const puffState = { wait: 0, next: 0 };

  return {
    mesh, focus, time, rush, ring, puffs,
    burst(x, z, which) {
      splash.age = 0; splash.x = x; splash.z = z;
      splash.power = which === 'in' ? 1.45 : 1;
      ring.visible = true;
      ring.position.set(x, 0.08, z);
      const s0 = splash.power;
      ring.scale.set(s0, s0, s0);
      ring.material.opacity = 0.9;
    },
    /** A puff of bubbles from (x, y, z), if one is due. speed in m/s. */
    breathe(dt, x, y, z, speed, dashing) {
      if (y > -0.15) return;
      const slot = puffDue(puffState, dt, speed, dashing);
      if (slot < 0) return;
      puffs.value[slot].set(x, y, z, time.value + 1);
    },
    step(dt, reduced) {
      time.value += dt;
      if (splash.age < 0) return;
      splash.age += dt;
      const k = splash.age / (splash.power > 1 ? 1.05 : 0.85);
      if (k >= 1) { splash.age = -1; ring.visible = false; return; }
      const s = reduced ? 2.2 : (0.55 + k * 8.2) * splash.power;
      ring.scale.set(s, s, s);
      ring.material.opacity = (1 - k) * 0.88;
    },
    setVisible(on) { mesh.visible = on; if (!on && splash.age < 0) ring.visible = false; },
  };
}
