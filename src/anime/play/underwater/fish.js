// [play:underwater] Fish: the one you become, the schools and the passers. One parametric body (rings along the
// length, real fins, a tail that wags in the vertex shader) and one toon material whose pattern is per species.
// Head is local −Z, so a mesh rotation.y of the player's yaw points the nose along the swim.
//
// The species' own looks (no mascot, no photo):
//   アイナメ  long, a little flattened, one long notched dorsal, a squared tail; olive-brown, mottled, pale belly
//   カツオ    a torpedo with a deep forked tail; a dark blue back, silver belly with dark stripes along it
//   イワシ    slender; a blue-green back, silver flanks, a row of dark spots
//   メバル    deep-bodied, big eyes, a spiny dorsal; grey-brown with faint bars

import * as THREE from 'three';
import { applySwimFog } from './fog.js';

/** [z, half width, half height, centre y]: the body's cross-sections from snout to tail root (length 1.3 units). */
const SHAPES = {
  ainame: {
    rings: [[-0.84, 0.012, 0.012, 0.0], [-0.74, 0.05, 0.055, 0.0], [-0.58, 0.09, 0.11, 0.005], [-0.38, 0.115, 0.14, 0.01], [-0.12, 0.12, 0.145, 0.01], [0.12, 0.105, 0.125, 0.005], [0.3, 0.07, 0.085, 0.0], [0.42, 0.04, 0.05, 0.0], [0.47, 0.03, 0.04, 0.0]],
    tail: { kind: 'square', len: 0.3, h: 0.14 },
    dorsal: { z0: -0.5, z1: 0.4, h: 0.1, notch: 0.45 },
    anal: { z0: 0.0, z1: 0.38, h: 0.07 },
    pectoral: { z: -0.42, len: 0.17, w: 0.08 },
    eye: [-0.66, 0.045, 0.026],
  },
  katsuo: {
    rings: [[-0.84, 0.01, 0.01, 0.0], [-0.72, 0.06, 0.065, 0.0], [-0.55, 0.12, 0.13, 0.01], [-0.3, 0.155, 0.165, 0.01], [-0.05, 0.15, 0.16, 0.01], [0.18, 0.11, 0.115, 0.005], [0.34, 0.06, 0.06, 0.0], [0.44, 0.025, 0.03, 0.0], [0.48, 0.03, 0.022, 0.0]],
    tail: { kind: 'fork', len: 0.42, h: 0.34 },
    dorsal: { z0: -0.36, z1: -0.08, h: 0.12, notch: 0 },
    anal: { z0: 0.12, z1: 0.26, h: 0.05 },
    pectoral: { z: -0.4, len: 0.2, w: 0.06 },
    eye: [-0.64, 0.04, 0.03],
  },
  iwashi: {
    rings: [[-0.84, 0.01, 0.012, 0.0], [-0.72, 0.045, 0.06, 0.0], [-0.52, 0.075, 0.11, 0.0], [-0.25, 0.085, 0.125, 0.0], [0.05, 0.075, 0.11, 0.0], [0.28, 0.05, 0.07, 0.0], [0.42, 0.025, 0.035, 0.0], [0.47, 0.02, 0.025, 0.0]],
    tail: { kind: 'fork', len: 0.32, h: 0.26 },
    dorsal: { z0: -0.12, z1: 0.06, h: 0.08, notch: 0 },
    anal: { z0: 0.22, z1: 0.34, h: 0.04 },
    pectoral: { z: -0.5, len: 0.11, w: 0.04 },
    eye: [-0.68, 0.03, 0.032],
  },
  mebaru: {
    rings: [[-0.84, 0.015, 0.02, 0.0], [-0.74, 0.07, 0.1, 0.01], [-0.56, 0.12, 0.2, 0.02], [-0.34, 0.14, 0.24, 0.02], [-0.08, 0.13, 0.23, 0.01], [0.16, 0.1, 0.17, 0.0], [0.32, 0.06, 0.1, 0.0], [0.42, 0.04, 0.065, 0.0], [0.47, 0.035, 0.055, 0.0]],
    tail: { kind: 'round', len: 0.28, h: 0.22 },
    dorsal: { z0: -0.48, z1: 0.32, h: 0.16, notch: 0.5, spiny: true },
    anal: { z0: 0.06, z1: 0.3, h: 0.1 },
    pectoral: { z: -0.4, len: 0.2, w: 0.1 },
    eye: [-0.6, 0.09, 0.05],
  },
};

const SEG = 12;

/** A fish body, about 1.3 units from snout to tail tip. Attributes: aTail (wag weight), aFin (1 on fins). */
export function fishGeometry(species = 'ainame') {
  const S = SHAPES[species] || SHAPES.ainame;
  const P = [], T = [], F = [], I = [];
  const tailW = (z) => Math.max(0, Math.min(1, (z + 0.05) / 0.55)) ** 1.6;
  const v = (x, y, z, fin = 0, tail = null) => { P.push(x, y, z); T.push(tail ?? tailW(z)); F.push(fin); return P.length / 3 - 1; };
  const starts = [];
  for (const [z, hw, hh, cy] of S.rings) {
    starts.push(P.length / 3);
    for (let i = 0; i < SEG; i++) {
      const a = (i / SEG) * Math.PI * 2 - Math.PI / 2;
      // a slightly flat belly and a rounder back
      const sy = Math.sin(a), cx = Math.cos(a);
      const k = sy < 0 ? 0.9 : 1.04;
      v(cx * hw, cy + sy * hh * k, z);
    }
  }
  const nose = v(0, S.rings[0][3], S.rings[0][0] - 0.03);
  for (let i = 0; i < SEG; i++) I.push(nose, starts[0] + (i + 1) % SEG, starts[0] + i);
  for (let r = 0; r < starts.length - 1; r++) {
    for (let i = 0; i < SEG; i++) {
      const a = starts[r] + i, b = starts[r] + (i + 1) % SEG, c = starts[r + 1] + i, d = starts[r + 1] + (i + 1) % SEG;
      I.push(a, b, c, b, d, c);
    }
  }
  const last = starts[starts.length - 1], lz = S.rings[S.rings.length - 1][0];
  const tip = v(0, 0, lz + 0.01);
  for (let i = 0; i < SEG; i++) I.push(last + i, last + (i + 1) % SEG, tip);

  // fins: thin double-sided sheets
  const sheet = (pts, tail) => {
    const b = P.length / 3;
    for (const p of pts) v(p[0], p[1], p[2], 1, tail ?? null);
    for (let i = 1; i < pts.length - 1; i++) I.push(b, b + i, b + i + 1);
  };
  const t = S.tail;
  const tz = lz - 0.01;
  if (t.kind === 'fork') {
    sheet([[0, 0.01, tz], [0, t.h * 0.95, tz + t.len], [0, t.h * 0.28, tz + t.len * 0.62], [0, 0, tz + t.len * 0.42], [0, -t.h * 0.28, tz + t.len * 0.62], [0, -t.h * 0.95, tz + t.len], [0, -0.01, tz]], 1);
  } else if (t.kind === 'square') {
    sheet([[0, 0.012, tz], [0, t.h * 0.82, tz + t.len * 0.92], [0, t.h * 0.55, tz + t.len], [0, 0, tz + t.len * 0.97], [0, -t.h * 0.55, tz + t.len], [0, -t.h * 0.82, tz + t.len * 0.92], [0, -0.012, tz]], 1);
  } else {
    sheet([[0, 0.012, tz], [0, t.h * 0.7, tz + t.len * 0.7], [0, t.h * 0.45, tz + t.len * 0.96], [0, 0, tz + t.len], [0, -t.h * 0.45, tz + t.len * 0.96], [0, -t.h * 0.7, tz + t.len * 0.7], [0, -0.012, tz]], 1);
  }
  // the dorsal fin runs along the back, notched (and spiny for メバル)
  const back = (z) => {
    for (let r = 0; r < S.rings.length - 1; r++) {
      const [z0, , h0, c0] = S.rings[r], [z1, , h1, c1] = S.rings[r + 1];
      if (z >= z0 && z <= z1) { const k = (z - z0) / (z1 - z0); return c0 + (c1 - c0) * k + (h0 + (h1 - h0) * k) * 1.02; }
    }
    return 0;
  };
  const d = S.dorsal;
  const steps = 7;
  const dpts = [[0, back(d.z0) - 0.01, d.z0]];
  for (let i = 0; i <= steps; i++) {
    const z = d.z0 + (d.z1 - d.z0) * (i / steps);
    const notch = d.notch ? 1 - d.notch * Math.exp(-((i / steps - 0.55) ** 2) / 0.01) : 1;
    const spike = d.spiny && i % 2 === 0 && i / steps < 0.55 ? 1.25 : 1;
    const h = d.h * Math.sin(Math.min(1, (i / steps) * 1.1 + 0.15) * Math.PI) * notch * spike;
    dpts.push([0, back(z) + h, z]);
  }
  dpts.push([0, back(d.z1) - 0.01, d.z1]);
  sheet(dpts);
  const an = S.anal;
  const belly = (z) => -back(z) + 0.02;
  sheet([[0, belly(an.z0), an.z0], [0, belly(an.z0 + (an.z1 - an.z0) * 0.3) - an.h, an.z0 + (an.z1 - an.z0) * 0.3], [0, belly(an.z1) - an.h * 0.4, an.z1], [0, belly(an.z1), an.z1]]);
  // pectorals, left and right, swept back
  const pc = S.pectoral;
  for (const s of [-1, 1]) {
    const x0 = s * S.rings[3][1] * 0.95;
    sheet([[x0, -0.02, pc.z], [x0 + s * pc.len * 0.75, -0.05 - pc.w * 0.4, pc.z + pc.len * 0.7], [x0 + s * pc.len * 0.35, -0.03, pc.z + pc.len], [x0, -0.03, pc.z + pc.len * 0.35]], 0.08);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('aTail', new THREE.Float32BufferAttribute(T, 1));
  g.setAttribute('aFin', new THREE.Float32BufferAttribute(F, 1));
  g.setIndex(I);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  g.userData.eye = S.eye;
  return g;
}

/** The look of each species (和色 names where the colour has one). */
export const LOOKS = {
  // アイナメ: 鶯茶 #715C1F back, 枯色 #E0C38C belly, dark brown blotches
  ainame: { pattern: 0, back: '#6e6a34', side: '#a59a5c', belly: '#ece0bf', mark: '#4a3a1e', fin: '#b9a46a', eye: [-0.66, 0.045, 0.026] },
  // カツオ: 紺 #223A70 back, silver belly with 鉄紺 stripes
  katsuo: { pattern: 1, back: '#26355f', side: '#9eb0c4', belly: '#eef2f4', mark: '#2a2f4d', fin: '#3b4a6e', eye: [-0.64, 0.04, 0.03] },
  // イワシ: 青緑 #00A497-leaning back, silver flanks, dark spots
  iwashi: { pattern: 2, back: '#2f6f7c', side: '#cfdde2', belly: '#f6f8f7', mark: '#1f2c38', fin: '#b9cbd2', eye: [-0.68, 0.03, 0.032] },
  // メバル: 灰茶 grey-brown, faint darker bars, a gold ring round the big eye
  mebaru: { pattern: 3, back: '#5a4f45', side: '#8a7b6b', belly: '#d9cfc2', mark: '#3b322b', fin: '#6f6255', eye: [-0.6, 0.09, 0.05] },
};

const VERT = /* glsl */`
attribute float aTail;
attribute float aFin;
uniform float uBeat;
uniform float uTailAmp;
varying vec3 vLocal;
varying float vFin;
varying vec3 vFishW;
`;

const VERT_BODY = /* glsl */`
vLocal = transformed;
vFin = aFin;
float wag = sin(uBeat - transformed.z * 2.4) * aTail * aTail * uTailAmp;
transformed.x += wag;
transformed.y += cos(uBeat * 0.5) * aTail * 0.02 * uTailAmp;
`;

const PROJECT = /* glsl */`
vec4 fw = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  fw = instanceMatrix * fw;
#endif
fw = modelMatrix * fw;
vFishW = fw.xyz;
vec4 mvPosition = viewMatrix * fw;
gl_Position = projectionMatrix * mvPosition;
`;

const FRAG_DECL = /* glsl */`
varying vec3 vLocal;
varying float vFin;
varying vec3 vFishW;
uniform float uPattern;
uniform vec3 uBack, uSide, uBelly, uMark, uFin, uEye, uRim;
`;

// Counter-shaded body, the species' marks, fins with rays, and an eye with a catchlight. All from the local position.
const FRAG_BODY = /* glsl */`
{
  vec3 p = vLocal;
  float up = smoothstep(-0.05, 0.11, p.y + 0.012 * sin(p.z * 9.0));
  vec3 c = mix(uBelly, uSide, smoothstep(-0.09, 0.0, p.y));
  c = mix(c, uBack, up);
  if (uPattern < 0.5) {
    // アイナメ: soft dark blotches on the back and flanks
    float m = sin(p.z * 31.0 + sin(p.y * 22.0) * 1.6) * sin(p.y * 27.0 - p.z * 9.0 + 1.3);
    c = mix(c, uMark, smoothstep(0.35, 0.7, m) * smoothstep(-0.06, 0.04, p.y) * 0.75);
  } else if (uPattern < 1.5) {
    // カツオ: dark stripes along the silver belly
    float s = smoothstep(0.55, 0.8, sin(p.y * 105.0 + 1.0)) * smoothstep(0.0, -0.03, p.y) * smoothstep(-0.13, -0.07, p.y);
    c = mix(c, uMark, s * smoothstep(-0.6, -0.4, p.z) * (1.0 - smoothstep(0.25, 0.4, p.z)) * 0.85);
  } else if (uPattern < 2.5) {
    // イワシ: a row of dark spots along the flank
    float sp = 1.0 - smoothstep(0.012, 0.02, length(vec2(fract(p.z * 9.0 + 0.3) / 9.0 - 0.055, p.y - 0.02)));
    c = mix(c, uMark, sp * step(-0.55, p.z) * step(p.z, 0.12) * 0.9);
  } else {
    // メバル: faint dark bars
    float b = smoothstep(0.4, 0.85, sin(p.z * 24.0 + 1.1));
    c = mix(c, uMark, b * smoothstep(-0.1, 0.05, p.y) * 0.45);
  }
  if (vFin > 0.5) {
    float rays = smoothstep(0.3, 0.9, sin(p.z * 120.0 + p.y * 40.0));
    c = mix(uFin, uFin * 0.72, rays * 0.6);
  }
  // the eye on each side: a dark pupil, a ring, a catchlight toward the front and up
  vec2 e = vec2(p.z - uEye.x, p.y - uEye.y);
  float r = length(e);
  float side = step(0.02, abs(p.x));
  float iris = (1.0 - smoothstep(uEye.z * 0.95, uEye.z * 1.05, r)) * side;
  float pupil = (1.0 - smoothstep(uEye.z * 0.55, uEye.z * 0.65, r)) * side;
  float glint = (1.0 - smoothstep(uEye.z * 0.16, uEye.z * 0.24, length(e - vec2(-uEye.z * 0.3, uEye.z * 0.32)))) * side;
  c = mix(c, uPattern > 2.5 ? vec3(0.78, 0.62, 0.25) : vec3(0.82, 0.84, 0.82), iris * (1.0 - vFin));
  c = mix(c, vec3(0.02, 0.025, 0.035), pupil * (1.0 - vFin));
  c = mix(c, vec3(1.0), glint * (1.0 - vFin));
  diffuseColor.rgb = c * diffuseColor.rgb;
}
`;

// A rim of light so the fish you are reads against any water (the others pass 0).
const RIM = /* glsl */`
{
  float rimK = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
  float dayK = mix(1.0, uSwimLight, uSwim);
  totalEmissiveRadiance += uRim * smoothstep(0.45, 0.95, rimK) * (0.45 + 0.55 * dayK);
  totalEmissiveRadiance += diffuseColor.rgb * 0.18 * dayK;
}
`;

const C = (c) => new THREE.Color(c);

export function fishMaterial(ctx, { beat, amp, look = LOOKS.ainame, rim = null, cacheKey = 'swim-fish' }) {
  const m = new THREE.MeshToonMaterial({
    color: 0xffffff,
    gradientMap: ctx.mat.gradientMap,
    side: THREE.DoubleSide,
  });
  m.name = cacheKey;
  const u = {
    uBeat: beat,
    uTailAmp: amp,
    uPattern: { value: look.pattern },
    uBack: { value: C(look.back) }, uSide: { value: C(look.side) }, uBelly: { value: C(look.belly) },
    uMark: { value: C(look.mark) }, uFin: { value: C(look.fin) },
    uEye: { value: new THREE.Vector3(...look.eye) },
    uRim: { value: rim ? new THREE.Color(rim) : new THREE.Color(0, 0, 0) },
  };
  m.userData.u = u;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_BODY)
      .replace('#include <project_vertex>', PROJECT);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_DECL)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_BODY)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + RIM);
    applySwimFog(shader, 'vFishW');
  };
  m.customProgramCacheKey = () => cacheKey;
  return m;
}

/** Set a material's look to a species (the player changes species at the bay mouth). */
export function setLook(m, look) {
  const u = m.userData.u;
  u.uPattern.value = look.pattern;
  u.uBack.value.set(look.back); u.uSide.value.set(look.side); u.uBelly.value.set(look.belly);
  u.uMark.value.set(look.mark); u.uFin.value.set(look.fin);
  u.uEye.value.set(look.eye[0], look.eye[1], look.eye[2]);
}

/** The body that follows the simulation: アイナメ in the bay, カツオ past the mouth (the mesh swaps, the material re-skins). */
export function createPlayerFish(ctx) {
  const beat = { value: 0 };
  const amp = { value: 0.42 };
  const kind = { value: 0 };
  // 白群 #83CCD2-ish rim, cool against the warm fish
  const mat = fishMaterial(ctx, { beat, amp, look: LOOKS.ainame, rim: '#4f7f86', cacheKey: 'swim-player' });
  const geos = { ainame: fishGeometry('ainame'), katsuo: fishGeometry('katsuo') };
  const mesh = new THREE.Mesh(geos.ainame, mat);
  mesh.name = 'swim-player';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  ctx.noOutline(mesh);
  const g = new THREE.Group();
  g.name = 'swim-player-root';
  g.visible = false;
  g.add(mesh);
  ctx.noBatch(g);
  ctx.add(g);
  return {
    mesh: g, body: mesh, beat, amp, kind,
    setSpecies(id) {
      const bonito = id === 'katsuo';
      kind.value = bonito ? 1 : 0;
      mesh.geometry = bonito ? geos.katsuo : geos.ainame;
      setLook(mat, bonito ? LOOKS.katsuo : LOOKS.ainame);
      const sc = bonito ? 1.18 : 0.86;
      mesh.scale.set(sc, sc, sc);
    },
  };
}
