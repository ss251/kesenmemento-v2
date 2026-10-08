// [play:underwater] Everything that does not move house: the seabed, rocks, アマモ meadows, ワカメ and kelp, the ropes,
// and (on the phone, where the harbour builds no rafts) the floats under each raft.
// One mesh, one draw, built once. Vertex colours carry two or three tones per thing; the shader adds the sand's ripple
// marks and the sway. Kinds: 0 rope / float, 1 sand, 2 plant, 3 rock.

import * as THREE from 'three';
import { applySwimFog } from './fog.js';
import { planDrops, planBed } from './logic.js';
import { planRafts } from '../../world/harbor/rows.js';

// The things' own colours, tuned under the water's light.
const COL = {
  // a manila rope, warm under the water's cyan light
  rope: [0.74, 0.6, 0.42],
  float: [0.13, 0.14, 0.16], floatTop: [0.22, 0.23, 0.25], marker: [0.93, 0.45, 0.17],
  sand: [0.85, 0.75, 0.56], silt: [0.64, 0.57, 0.44],
  rock: [0.47, 0.44, 0.40], rockDark: [0.32, 0.30, 0.28], growth: [0.36, 0.43, 0.2], growthRed: [0.55, 0.3, 0.24],
  // アマモ: bright green, lighter at the tip
  grass: [0.2, 0.46, 0.17], grassTip: [0.52, 0.7, 0.28],
  // ワカメ and kelp: olive-brown, a darker midrib, paler ruffled edges
  wakame: [0.42, 0.38, 0.15], wakameRib: [0.27, 0.24, 0.1], wakameEdge: [0.55, 0.5, 0.22],
  kelp: [0.38, 0.31, 0.13], kelpEdge: [0.5, 0.42, 0.18],
};

function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

class Builder {
  constructor() { this.P = []; this.C = []; this.H = []; this.Ph = []; this.K = []; this.U = []; this.I = []; }
  v(x, y, z, col, hang, phase, kind, u = 0, w = 0) {
    this.P.push(x, y, z); this.C.push(col[0], col[1], col[2]); this.H.push(hang); this.Ph.push(phase); this.K.push(kind); this.U.push(u, w);
    return this.P.length / 3 - 1;
  }
  tri(a, b, c) { this.I.push(a, b, c); }
  quad(a, b, c, d) { this.I.push(a, b, c, a, c, d); }
}

/** A rope as two crossed ribbons, so it never vanishes edge-on. aBedUv carries (across, 1 + metres down) for the twist. */
function rope(B, x, z, y0, y1, phase, segs = 4) {
  for (const [dx, dz] of [[0.009, 0], [0, 0.009]]) {
    const base = B.P.length / 3;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, y = y0 + (y1 - y0) * t;
      B.v(x - dx, y, z - dz, COL.rope, t, phase, 0, 0, 1 + (y0 - y));
      B.v(x + dx, y, z + dz, COL.rope, t, phase, 0, 1, 1 + (y0 - y));
    }
    for (let i = 0; i < segs; i++) { const a = base + i * 2; B.quad(a, a + 1, a + 3, a + 2); }
  }
}

/**
 * A ribbon blade rising from (x, y, z): w is the half width, len the length, bend the lean.
 * Three verts across (two edges and a midrib) so the blade can carry a rib and paler edges, ruffled along its length.
 */
function blade(B, x, y, z, len, w, yaw, bend, segs, cols, phase, ruffle, sway = 1) {
  const [edge, mid, rib, tip] = cols;
  const cx = Math.cos(yaw), cz = Math.sin(yaw);
  const base = B.P.length / 3;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const taper = Math.sin(Math.min(1, t * 1.25 + 0.08) * Math.PI) * 0.85 + 0.15 * (1 - t);
    const hw = w * taper;
    const lean = bend * t * t;
    const px = x + cx * lean, pz = z + cz * lean, py = y + len * t;
    const rf = ruffle ? Math.sin(t * 19 + phase * 3) * ruffle * t : 0;
    const col = tip && t > 0.7 ? tip : mid;
    const hang = t * sway;
    B.v(px - cz * hw, py + rf, pz + cx * hw, edge, hang, phase, 2);
    B.v(px, py, pz, i === 0 ? rib : (tip && t > 0.7 ? tip : rib), hang, phase, 2);
    B.v(px + cz * hw, py - rf, pz - cx * hw, edge, hang, phase, 2);
    void col;
  }
  for (let i = 0; i < segs; i++) {
    const a = base + i * 3;
    B.quad(a, a + 1, a + 4, a + 3);
    B.quad(a + 1, a + 2, a + 5, a + 4);
  }
}

/** A rock: a squashed, noisy icosahedron, grey-brown, with a little growth on its top. */
function rock(B, x, y, z, s, seed) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position;
  const map = new Map();
  const idx = [];
  const base = B.P.length / 3;
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    if (!map.has(key)) {
      const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
      const n = 0.78 + 0.34 * hash(seed + vx * 3.1 + vy * 5.7 + vz * 7.3);
      const top = vy > 0.45;
      const col = top ? (hash(seed + vx * 9.1) > 0.82 ? COL.growthRed : COL.growth) : vy > -0.1 ? COL.rock : COL.rockDark;
      map.set(key, B.v(x + vx * s * n, y + Math.max(-0.35, vy) * s * 0.55 * n, z + vz * s * n * 0.85, col, 0, 0, 3));
    }
    idx.push(map.get(key));
  }
  for (let i = 0; i < idx.length; i += 3) B.tri(idx[i], idx[i + 1], idx[i + 2]);
  g.dispose();
  return base;
}

/** A float drum lying under a raft, half in the water (phone only: desktop has the harbour's own rafts). */
function drum(B, x, z, yaw, len, r, marker) {
  const n = 8;
  const cx = Math.cos(yaw), cz = Math.sin(yaw);
  const base = B.P.length / 3;
  for (const s of [-1, 1]) {
    for (let j = 0; j < n; j++) {
      const a = (j / n) * Math.PI * 2;
      const oy = Math.cos(a) * r, os = Math.sin(a) * r;
      const col = marker ? COL.marker : oy > r * 0.3 ? COL.floatTop : COL.float;
      B.v(x + cx * len * 0.5 * s - cz * os, -0.06 + oy, z + cz * len * 0.5 * s + cx * os, col, 0, 0, 0);
    }
  }
  for (let j = 0; j < n; j++) { const j1 = (j + 1) % n; B.quad(base + j, base + j1, base + n + j1, base + n + j); }
  for (let j = 1; j < n - 1; j++) { B.tri(base, base + j + 1, base + j); B.tri(base + n, base + n + j, base + n + j + 1); }
}

/** World drops from the photographed rafts plus the sourced longlines. */
export function dropsFor(L, data) {
  const rafts = planRafts((x, z) => L.isWater(x, z));
  return { rafts, drops: planDrops(rafts, data.longlines, data.kelp, (x, z) => L.heightAt(x, z), data.fields) };
}

/** A bed grid over b, sand-coloured, with a local coordinate for the ripple marks (kept small, so it stays exact). */
function addBed(B, L, b) {
  const nx = Math.ceil((b.x1 - b.x0) / b.step), nz = Math.ceil((b.z1 - b.z0) / b.step);
  const origin = B.P.length / 3;
  const ok = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = b.x0 + i * b.step, z = b.z0 + j * b.step;
    const wet = L.isWater(x, z);
    const h = wet ? Math.min(-0.55, L.heightAt(x, z) + 0.18) : 1;
    const silt = 0.5 + 0.5 * Math.sin(x * 0.043 + Math.sin(z * 0.031) * 2.1) * Math.sin(z * 0.051 - x * 0.012);
    const k = Math.max(0, Math.min(1, silt * 1.3 - 0.35));
    const col = [COL.sand[0] + (COL.silt[0] - COL.sand[0]) * k, COL.sand[1] + (COL.silt[1] - COL.sand[1]) * k, COL.sand[2] + (COL.silt[2] - COL.sand[2]) * k];
    B.v(x, h, z, col, 0, 0, 1, x - b.x0, z - b.z0);
    ok.push(wet && h < -0.3);
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * (nx + 1) + i;
    if (!ok[k] || !ok[k + 1] || !ok[k + nx + 1] || !ok[k + nx + 2]) continue;
    const a = origin + k;
    B.I.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2);
  }
}

const SWAY = /* glsl */`
  float swHang = aHang * aHang;
  float swS = uSway * (aKind > 1.5 && aKind < 2.5 ? 0.42 : 1.0);
  transformed.x += sin(uTime * 0.85 + aPhase) * swHang * 0.55 * swS;
  transformed.z += cos(uTime * 0.63 + aPhase * 1.3) * swHang * 0.28 * swS;
`;

// Sand ripple marks: long crests a hand apart, a little sinuous, in three toon tones; they fade where they would alias.
const RIPPLE = /* glsl */`
  if (vCulKind < 0.5 && vBedUv.y > 0.5) {
    // a laid rope: diagonal strands with dark grooves, nine twists a metre, fading where they would alias
    float tw = vBedUv.y * 9.0 + vBedUv.x * 0.55;
    float fwr = fwidth(tw) + 1e-4;
    float f = fract(tw);
    float groove = smoothstep(0.0, 0.1 + fwr, f) * (1.0 - smoothstep(0.62 - fwr, 0.74 + fwr, f));
    float edge = 1.0 - abs(vBedUv.x - 0.5) * 1.2;
    diffuseColor.rgb *= mix(1.0, (0.7 + 0.36 * groove) * (0.82 + 0.25 * edge), 1.0 - smoothstep(0.35, 0.8, fwr));
  }
  if (vCulKind > 0.5 && vCulKind < 1.5) {
    vec2 rp = vBedUv;
    // crests about 30 cm apart, sinuous, forking where a slow warp crowds them; strongest in patches, fading out
    float ph = rp.x * 0.94 + rp.y * 0.34 + sin(rp.y * 0.53 + rp.x * 0.17) * 0.32 + sin(rp.x * 0.07 - rp.y * 0.11) * 1.4;
    float wv = ph * 21.0 + sin(rp.y * 2.3 + rp.x * 0.9) * 0.9;
    float fw = fwidth(wv) + 1e-4;
    float r = sin(wv) + 0.3 * sin(wv * 2.0 + 1.3);
    float crest = smoothstep(0.7 - fw * 0.5, 0.7 + fw * 0.5, r);
    float trough = 1.0 - smoothstep(-0.6 - fw * 0.5, -0.6 + fw * 0.5, r);
    float rpatch = 0.45 + 0.55 * smoothstep(-0.3, 0.6, sin(rp.x * 0.19 + 1.7) * sin(rp.y * 0.23 - 0.4));
    float fade = (1.0 - smoothstep(0.5, 1.6, fw)) * rpatch;
    diffuseColor.rgb *= 1.0 + (crest * 0.14 - trough * 0.12) * fade;
  }
`;

export function createCulture(ctx, data) {
  const L = ctx.L;
  const phone = !!ctx.quality?.phone;
  const { rafts, drops } = dropsFor(L, data);
  const B = new Builder();

  // ropes and what hangs on them as ribbons (wakame); kelp stands on the bed
  for (const d of drops) {
    if (d.kind === 'kelp') {
      const n = 2 + Math.floor(hash(d.phase * 7.1) * 3);
      for (let k = 0; k < n; k++) {
        const yaw = d.phase * 2.3 + k * 2.1;
        const len = (d.y0 - d.y1) * (0.75 + hash(d.phase + k) * 0.35);
        blade(B, d.x + Math.cos(yaw) * 0.05, d.y1, d.z + Math.sin(yaw) * 0.05, len, 0.09 + hash(k + d.phase * 3) * 0.05, yaw, 0.25 + hash(k * 3.3) * 0.3, 9,
          [COL.kelpEdge, COL.kelp, COL.kelp, null], d.phase + k * 0.7, 0.02);
      }
      continue;
    }
    rope(B, d.x, d.z, d.y0, d.y1, d.phase);
    if (d.kind === 'wakame') {
      // fronds down the rope: a midrib with ruffled, paler edges
      for (let k = 0; k < 7; k++) {
        const t = 0.12 + k * 0.12;
        const y = d.y0 + (d.y1 - d.y0) * t;
        const yaw = d.phase * 1.7 + k * 2.4;
        const len = 0.9 + hash(d.phase + k) * 0.7;
        // the frond hangs from the rope: a negative length grows it downward
        blade(B, d.x, y, d.z, -len, 0.1 + hash(k * 1.7 + d.phase) * 0.05, yaw, 0.35, 8,
          [COL.wakameEdge, COL.wakame, COL.wakameRib, null], d.phase, 0.025, 0.5);
      }
    }
  }

  // the floor: the inner bay and the farm, with a finer patch where the stills look
  const beds = [
    { x0: -20, x1: 860, z0: -260, z1: 480, step: phone ? 10 : 7 },
    { x0: 1460, x1: 1880, z0: 3480, z1: 4160, step: phone ? 12 : 8 },
  ];
  for (const b of beds) addBed(B, L, b);

  // rocks, meadows and kelp from the bed plan (pure, tested)
  const plan = planBed((x, z) => L.isWater(x, z), (x, z) => L.heightAt(x, z), { phone });
  for (const r of plan.rocks) rock(B, r.x, r.y, r.z, r.s, r.seed);
  for (const g of plan.grass) {
    blade(B, g.x, g.y, g.z, g.len, g.w, g.yaw, g.bend, 4, [COL.grass, COL.grass, COL.grass, COL.grassTip], g.phase, 0, 0.75);
  }

  if (phone) {
    for (const r of rafts) {
      for (const fx of [-2.6, 2.6]) for (let j = 0; j < 5; j++) drum(B, r.x + fx, r.z - 6 + j * 3, Math.PI / 2, 1.6, 0.42, false);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(B.P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(B.C, 3));
  g.setAttribute('aHang', new THREE.Float32BufferAttribute(B.H, 1));
  g.setAttribute('aPhase', new THREE.Float32BufferAttribute(B.Ph, 1));
  g.setAttribute('aKind', new THREE.Float32BufferAttribute(B.K, 1));
  g.setAttribute('aBedUv', new THREE.Float32BufferAttribute(B.U, 2));
  g.setIndex(B.I);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  const time = { value: 0 };
  const amp = { value: 1 };
  const mat = new THREE.MeshToonMaterial({
    color: 0xffffff,
    vertexColors: true,
    gradientMap: ctx.mat.gradientMap,
    side: THREE.DoubleSide,
  });
  mat.name = 'swim-culture';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.uniforms.uSway = amp;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aHang;\nattribute float aPhase;\nattribute float aKind;\nattribute vec2 aBedUv;\nuniform float uTime;\nuniform float uSway;\nvarying vec3 vCulW;\nvarying float vCulKind;\nvarying vec2 vBedUv;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        ${SWAY}
        vCulKind = aKind;
        vBedUv = aBedUv;
        vCulW = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCulW;\nvarying float vCulKind;\nvarying vec2 vBedUv;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + RIPPLE)
      // plants, rocks and ropes keep a little of their own colour on the shadow side (an anime shadow is a deeper tint)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n if (vCulKind > 1.5 || (vCulKind < 0.5 && vBedUv.y > 0.5)) totalEmissiveRadiance += diffuseColor.rgb * 0.22 * mix(1.0, uSwimLight, uSwim);');
    applySwimFog(shader, 'vCulW');
  };
  mat.customProgramCacheKey = () => 'swim-culture-3';
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'swim-culture';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.visible = false;
  ctx.noBatch(mesh);
  ctx.noOutline(mesh);
  ctx.add(mesh);
  return { mesh, time, amp, drops: drops.length, list: drops, rafts: rafts.length, plan, verts: B.P.length / 3 };
}
