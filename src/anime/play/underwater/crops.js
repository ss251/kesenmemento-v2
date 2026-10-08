// [play:underwater] The crops on the ropes: マボヤ, oysters and scallop lantern nets.
// Only the ropes near the eye are drawn: individual ホヤ and oyster clumps within a few metres, one proxy per clump
// out to 26 m (beyond that the water has taken them). The near set is refilled when the eye has moved 1.2 m, by
// copying whole ropes of precomputed instance data; a frame without a refill writes nothing.
// Four instanced draws (ホヤ, ホヤ clumps, oysters, oyster lumps) and one static draw (the lanterns), one shared program.
//
// マボヤ (Halocynthia roretzi), modelled from scratch: an egg on a short stalk, its tunic a diamond lattice of knobs
// (the "sea pineapple"), red-orange with paler knob tips and deep-red valleys. Two siphons: the oral one at the top
// with a + opening, the atrial one on the shoulder with a − opening, both with pale rims.

import * as THREE from 'three';
import { applySwimFog } from './fog.js';
import { planOrganisms, nearRopes, FARM } from './logic.js';

// 和色 references for the animal's own colours (colordic.org): 紅緋 #E83929 body, 柑子色 #F6AD49 rims,
// 蘇芳 #9E3D3F valleys. Working values, tuned under the water's light.
const H = {
  tip: [0.98, 0.5, 0.21],
  body: [0.86, 0.23, 0.1],
  valley: [0.52, 0.07, 0.05],
  stalk: [0.55, 0.22, 0.14],
  wall: [0.96, 0.44, 0.17],
  rim: [1.0, 0.74, 0.40],
  hole: [0.24, 0.035, 0.03],
};
const OY = { top: [0.83, 0.82, 0.78], edge: [0.42, 0.38, 0.45], under: [0.58, 0.56, 0.52], lump: [0.70, 0.69, 0.66] };
const NET = [0.13, 0.16, 0.18];
const SHELL = [[0.82, 0.62, 0.47], [0.86, 0.70, 0.55], [0.74, 0.52, 0.42]];

function build(P, C, I) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setIndex(I);
  // smooth normals: the toon bands and the painted tips and valleys carry the knobs (flat facets read as crumpled paper)
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** A ring of verts around axis `dir` at `base`. Returns the first index and the ring's axes. */
function ring(P, C, base, dir, r, n, col, phase = 0) {
  const b = P.length / 3;
  const up = Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(dir, up).normalize();
  const v = new THREE.Vector3().crossVectors(dir, u).normalize();
  for (let j = 0; j < n; j++) {
    const a = ((j + phase) / n) * Math.PI * 2;
    P.push(base.x + (u.x * Math.cos(a) + v.x * Math.sin(a)) * r, base.y + (u.y * Math.cos(a) + v.y * Math.sin(a)) * r, base.z + (u.z * Math.cos(a) + v.z * Math.sin(a)) * r);
    C.push(col[0], col[1], col[2]);
  }
  return { b, u, v };
}

function bridge(I, a, b, n) {
  for (let j = 0; j < n; j++) {
    const j1 = (j + 1) % n;
    I.push(a + j, a + j1, b + j, a + j1, b + j1, b + j);
  }
}

/** A siphon: a short tube with a pale rim and a recessed cap carrying the opening (+ or −). */
function siphon(P, C, I, base, dir, len, r0, r1, cross) {
  const n = 8;
  const d = dir.clone().normalize();
  const at = (t) => base.clone().addScaledVector(d, len * t);
  const r0i = ring(P, C, at(0), d, r0, n, H.wall);
  const r1i = ring(P, C, at(0.62), d, r1 * 1.08, n, H.wall);
  const r2i = ring(P, C, at(1), d, r1, n, H.rim);
  const r3i = ring(P, C, at(0.95), d, r1 * 0.66, n, H.rim);
  bridge(I, r0i.b, r1i.b, n);
  bridge(I, r1i.b, r2i.b, n);
  bridge(I, r2i.b, r3i.b, n);
  const c = P.length / 3;
  const cp = at(0.935);
  P.push(cp.x, cp.y, cp.z); C.push(H.rim[0] * 0.92, H.rim[1] * 0.85, H.rim[2] * 0.85);
  for (let j = 0; j < n; j++) I.push(r3i.b + j, r3i.b + (j + 1) % n, c);
  // The opening: one or two dark bars lying on the cap, a hair above it.
  const u = r3i.u, v = r3i.v;
  const top = at(0.962);
  const bar = (ax, other, w, l) => {
    const o = P.length / 3;
    for (const [s, t] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      P.push(top.x + ax.x * l * s + other.x * w * t, top.y + ax.y * l * s + other.y * w * t, top.z + ax.z * l * s + other.z * w * t);
      C.push(H.hole[0], H.hole[1], H.hole[2]);
    }
    I.push(o, o + 1, o + 2, o, o + 2, o + 3);
  };
  bar(u, v, r1 * 0.16, r1 * 0.6);
  if (cross) bar(v, u, r1 * 0.16, r1 * 0.6);
}

/** One マボヤ, 1 unit tall, rooted at the origin, growing up +Y. About 230 verts. */
export function hoyaGeometry() {
  const P = [], C = [], I = [];
  const seg = 14;
  // [height, radius] of each ring: a short stalk, the widest point a little above the middle, a rounded shoulder
  const prof = [[0.02, 0.12], [0.1, 0.24], [0.21, 0.34], [0.33, 0.42], [0.46, 0.46], [0.59, 0.46], [0.71, 0.42], [0.82, 0.35], [0.91, 0.25], [0.97, 0.13]];
  const bottom = P.length / 3;
  P.push(0, -0.02, 0); C.push(...H.stalk);
  const starts = [];
  for (let i = 0; i < prof.length; i++) {
    starts.push(P.length / 3);
    const [y, r] = prof[i];
    const off = (i % 2) * 0.5;
    for (let j = 0; j < seg; j++) {
      const a = ((j + off) / seg) * Math.PI * 2;
      // knobs on the even rings, every other vertex (each knob ringed by lower verts); valleys on the odd rings
      const knob = i >= 2 && i <= 8 && i % 2 === 0 && (j + (i >> 1)) % 2 === 0;
      const valley = i >= 3 && i <= 7 && i % 2 === 1;
      const k = knob ? 1.27 : valley ? 0.94 : 1;
      const lift = knob ? 0.026 : 0;
      P.push(Math.cos(a) * r * k, y + lift, Math.sin(a) * r * k * 0.88);
      const col = i < 2 ? H.stalk : knob ? H.tip : valley ? H.valley : H.body;
      C.push(col[0], col[1], col[2]);
    }
  }
  const topI = P.length / 3;
  P.push(0, 1.0, 0); C.push(...H.body);
  for (let j = 0; j < seg; j++) I.push(bottom, starts[0] + (j + 1) % seg, starts[0] + j);
  for (let i = 0; i < prof.length - 1; i++) {
    const a = starts[i], b = starts[i + 1];
    for (let j = 0; j < seg; j++) {
      const j1 = (j + 1) % seg;
      if (i % 2 === 0) {
        // ring i at 0, ring i+1 offset by half: (i+1, j) sits between (i, j) and (i, j+1)
        I.push(a + j, b + j, a + j1, a + j1, b + j, b + j1);
      } else {
        // ring i offset by half: (i, j) sits between (i+1, j) and (i+1, j+1)
        I.push(a + j, b + j, b + j1, a + j, b + j1, a + j1);
      }
    }
  }
  const last = starts[prof.length - 1];
  for (let j = 0; j < seg; j++) I.push(last + j, topI, last + (j + 1) % seg);
  // the oral siphon on top (+), the atrial siphon on the shoulder (−)
  siphon(P, C, I, new THREE.Vector3(0.02, 0.9, 0), new THREE.Vector3(0.1, 1, 0), 0.24, 0.17, 0.13, true);
  siphon(P, C, I, new THREE.Vector3(0.3, 0.72, 0.03), new THREE.Vector3(0.78, 0.62, 0.05), 0.2, 0.15, 0.115, false);
  return build(P, C, I);
}

/** A whole clump as one cheap proxy for the middle distance: five small knobbly eggs in a ring. */
export function hoyaClumpGeometry() {
  const P = [], C = [], I = [];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(a) * 0.85, 0.6 + (i % 2) * 0.35, Math.sin(a) * 0.85).normalize();
    const s = 0.13 + (i % 3) * 0.02;
    const base = new THREE.Vector3(Math.cos(a) * 0.015, (i % 2) * 0.05 - 0.03, Math.sin(a) * 0.015);
    const tip = base.clone().addScaledVector(dir, s);
    const mid = base.clone().addScaledVector(dir, s * 0.5);
    const b = P.length / 3;
    P.push(base.x, base.y, base.z); C.push(...H.stalk);
    const r = ring(P, C, mid, dir, s * 0.42, 5, H.body, i * 0.3);
    for (let j = 0; j < 5; j += 2) { C[(r.b + j) * 3] = H.tip[0]; C[(r.b + j) * 3 + 1] = H.tip[1]; C[(r.b + j) * 3 + 2] = H.tip[2]; }
    const t = P.length / 3;
    P.push(tip.x, tip.y, tip.z); C.push(...H.rim);
    for (let j = 0; j < 5; j++) {
      const j1 = (j + 1) % 5;
      I.push(b, r.b + j1, r.b + j, r.b + j, r.b + j1, t);
    }
  }
  return build(P, C, I);
}

/** A rough oyster clump around the rope: seven jagged, layered shells, grey-white with purple-grey lips. */
export function oysterGeometry() {
  const P = [], C = [], I = [];
  const shells = 7;
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let s = 0; s < shells; s++) {
    const a = (s / shells) * Math.PI * 2 + rnd() * 0.5;
    const out = new THREE.Vector3(Math.cos(a), (rnd() - 0.5) * 0.9, Math.sin(a)).normalize();
    const base = new THREE.Vector3(Math.cos(a) * 0.035, (rnd() - 0.5) * 0.12, Math.sin(a) * 0.035);
    const len = 0.07 + rnd() * 0.04, wid = 0.05 + rnd() * 0.02;
    // the shell's plane: long axis along `out`, the cup facing a tilted normal
    const nrm = new THREE.Vector3().crossVectors(out, new THREE.Vector3(0, 1, 0)).normalize();
    if (nrm.lengthSq() < 0.01) nrm.set(1, 0, 0);
    nrm.applyAxisAngle(out, (rnd() - 0.5) * 1.6);
    const side = new THREE.Vector3().crossVectors(nrm, out).normalize();
    const centre = base.clone().addScaledVector(out, len * 0.55);
    const c = P.length / 3;
    const dome = centre.clone().addScaledVector(nrm, 0.012);
    P.push(dome.x, dome.y, dome.z); C.push(...OY.top);
    const k = 9;
    for (let j = 0; j < k; j++) {
      const t = (j / k) * Math.PI * 2;
      const jag = 0.78 + rnd() * 0.32;
      const p = centre.clone().addScaledVector(out, Math.cos(t) * len * 0.55 * jag).addScaledVector(side, Math.sin(t) * wid * 0.55 * jag);
      P.push(p.x, p.y, p.z); C.push(...OY.edge);
      const q = p.clone().addScaledVector(nrm, -0.012);
      P.push(q.x, q.y, q.z); C.push(...OY.under);
    }
    for (let j = 0; j < k; j++) {
      const j1 = (j + 1) % k;
      const t0 = c + 1 + j * 2, t1 = c + 1 + j1 * 2;
      I.push(c, t0, t1);
      I.push(t0, t0 + 1, t1, t1, t0 + 1, t1 + 1);
    }
  }
  return build(P, C, I);
}

/** The far proxy for an oyster clump: one rough grey lump. */
export function oysterLumpGeometry() {
  const g = new THREE.IcosahedronGeometry(0.1, 0);
  const p = g.attributes.position;
  const col = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 0.8 + 0.4 * Math.abs(Math.sin(x * 61 + y * 37 + z * 23));
    p.setXYZ(i, x * k, y * k * 1.4, z * k);
    const c = y > 0 ? OY.top : OY.lump;
    col.push(c[0], c[1], c[2]);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

/** Every scallop lantern net, merged: tiered hoops, a dark net wall (cut by the shader) and shells on each floor. */
export function lanternGeometry(list) {
  const P = [], C = [], I = [], N = [], U = [], Hg = [], Ph = [];
  const n = 14, R = 0.24, tier = FARM.lanternTier;
  let s = 1;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (const l of list) {
    const tiers = l.tiers || FARM.lanternTiers;
    const top = l.y;
    const push = (x, y, z, col, net, u, v) => {
      P.push(x, y, z); C.push(col[0], col[1], col[2]); N.push(net); U.push(u, v); Hg.push(l.hang); Ph.push(l.phase);
    };
    // the net wall: one cylinder, the shader cuts the diamond mesh out of it
    const b0 = P.length / 3;
    for (let t = 0; t <= tiers; t++) {
      for (let j = 0; j <= n; j++) {
        const a = (j / n) * Math.PI * 2;
        push(l.x + Math.cos(a) * R, top - t * tier, l.z + Math.sin(a) * R, NET, 1, (j / n) * 14, t * 2.2);
      }
    }
    for (let t = 0; t < tiers; t++) for (let j = 0; j < n; j++) {
      const a = b0 + t * (n + 1) + j, b = a + n + 1;
      I.push(a, b, a + 1, a + 1, b, b + 1);
    }
    // a solid rim and a dark floor at every tier, three shells lying on each floor (not on the lid)
    for (let t = 0; t <= tiers; t++) {
      const y = top - t * tier;
      const c = P.length / 3;
      push(l.x, y - 0.004, l.z, NET, 0, 0, 0);
      for (let j = 0; j < n; j++) {
        const a = (j / n) * Math.PI * 2;
        push(l.x + Math.cos(a) * R * 1.02, y, l.z + Math.sin(a) * R * 1.02, NET, 0, 0, 0);
      }
      for (let j = 0; j < n; j++) I.push(c, c + 1 + j, c + 1 + (j + 1) % n);
      if (t === 0) continue;
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + rnd();
        const cx = l.x + Math.cos(a) * R * 0.48, cz = l.z + Math.sin(a) * R * 0.48;
        const yaw = rnd() * Math.PI * 2;
        const col = SHELL[k % 3];
        const hinge = P.length / 3;
        push(cx, y + 0.014, cz, col, 0, 0, 0);
        const ribs = 7;
        for (let r = 0; r <= ribs; r++) {
          const f = (r / ribs - 0.5) * 2.2;
          const ry = yaw + f;
          const rr = 0.065 * (1 - Math.abs(f) * 0.12);
          const shade = r % 2 ? 1 : 0.8;
          push(cx + Math.cos(ry) * rr, y + 0.008, cz + Math.sin(ry) * rr, [col[0] * shade, col[1] * shade, col[2] * shade], 0, 0, 0);
        }
        for (let r = 0; r < ribs; r++) I.push(hinge, hinge + 1 + r, hinge + 2 + r);
      }
    }
    // the hanging cord down to the lid
    const cb = P.length / 3;
    for (const y of [top + 0.9, top]) for (const d of [-0.006, 0.006]) push(l.x + d, y, l.z, NET, 0, 0, 0);
    I.push(cb, cb + 2, cb + 1, cb + 1, cb + 2, cb + 3);
  }
  if (!P.length) return null;
  const g = build(P, C, I);
  g.setAttribute('aNet', new THREE.Float32BufferAttribute(N, 1));
  g.setAttribute('aNetUv', new THREE.Float32BufferAttribute(U, 2));
  g.setAttribute('aHang', new THREE.Float32BufferAttribute(Hg, 1));
  g.setAttribute('aPhase', new THREE.Float32BufferAttribute(Ph, 1));
  return g;
}

const SWAY = /* glsl */`
  float hang = aHang * aHang;
  cw.x += sin(uTime * 0.85 + aPhase) * hang * 0.55 * uSway;
  cw.z += cos(uTime * 0.63 + aPhase * 1.3) * hang * 0.28 * uSway;
`;

/** The crop material: toon, vertex colours (times the instance tint), the rope's own sway in world space. */
function cropMaterial(ctx, time, amp, { net = false, key }) {
  const mat = new THREE.MeshToonMaterial({
    color: 0xffffff,
    vertexColors: true,
    gradientMap: ctx.mat.gradientMap,
    side: THREE.DoubleSide,
  });
  mat.name = key;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.uniforms.uSway = amp;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aHang;
        attribute float aPhase;
        ${net ? 'attribute float aNet;\nattribute vec2 aNetUv;\nvarying float vNet;\nvarying vec2 vNetUv;' : ''}
        uniform float uTime;
        uniform float uSway;
        varying vec3 vCropW;`)
      .replace('#include <project_vertex>', `
        vec4 cw = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          cw = instanceMatrix * cw;
        #endif
        cw = modelMatrix * cw;
        ${SWAY}
        vCropW = cw.xyz;
        ${net ? 'vNet = aNet; vNetUv = aNetUv;' : ''}
        vec4 mvPosition = viewMatrix * cw;
        gl_Position = projectionMatrix * mvPosition;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vCropW;
        ${net ? 'varying float vNet;\nvarying vec2 vNetUv;' : ''}`)
      // a little of the animal's own colour on the shadow side: an anime shadow is a deeper tint, never mud
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * 0.3 * mix(1.0, uSwimLight, uSwim);');
    if (net) {
      // a diamond mesh, one crisp cord wide at any distance
      shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        if (vNet > 0.5) {
          vec2 q = vec2(vNetUv.x + vNetUv.y, vNetUv.x - vNetUv.y);
          vec2 f = 0.5 - abs(fract(q) - 0.5);
          vec2 w = fwidth(q) * 0.8 + 0.03;
          float cord = max(1.0 - smoothstep(w.x, w.x * 1.6, f.x), 1.0 - smoothstep(w.y, w.y * 1.6, f.y));
          if (cord < 0.5) discard;
        }`);
    }
    applySwimFog(shader, 'vCropW');
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

/** Precomputed instance data for one kind, in rope order. first/count give each rope's run. */
function stock(list, ropes, matOf, tintOf) {
  const n = list.length;
  const m = new Float32Array(n * 16), hang = new Float32Array(n), phase = new Float32Array(n), tint = new Float32Array(n * 3);
  const first = new Int32Array(ropes).fill(-1), count = new Int32Array(ropes);
  const M = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const it = list[i];
    matOf(it, M);
    M.toArray(m, i * 16);
    hang[i] = it.hang; phase[i] = it.phase;
    tintOf(i, tint);
    const r = it.rope;
    if (first[r] < 0) first[r] = i;
    count[r]++;
  }
  return { m, hang, phase, tint, first, count, n };
}

function liveMesh(ctx, geo, mat, cap, name) {
  const hang = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
  const phase = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
  hang.setUsage(THREE.DynamicDrawUsage); phase.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aHang', hang);
  geo.setAttribute('aPhase', phase);
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.name = name;
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.visible = false;
  ctx.noBatch(mesh);
  ctx.noOutline(mesh);
  ctx.add(mesh);
  return { mesh, hang, phase, cap, on: false };
}

/** Copy the ropes listed in `ropes` (-1 terminated) from stock s into live l. No allocation. Returns the count. */
export function fillNear(l, s, ropes) {
  const M = l.mesh.instanceMatrix.array, T = l.mesh.instanceColor.array, Hh = l.hang.array, Pp = l.phase.array;
  let k = 0;
  for (let q = 0; q < ropes.length; q++) {
    const r = ropes[q];
    if (r < 0) break;
    const a = s.first[r];
    if (a < 0) continue;
    const n = s.count[r];
    if (k + n > l.cap) break;
    for (let i = 0; i < n; i++) {
      const src = (a + i) * 16, dst = (k + i) * 16;
      for (let c = 0; c < 16; c++) M[dst + c] = s.m[src + c];
      const s3 = (a + i) * 3, d3 = (k + i) * 3;
      T[d3] = s.tint[s3]; T[d3 + 1] = s.tint[s3 + 1]; T[d3 + 2] = s.tint[s3 + 2];
      Hh[k + i] = s.hang[a + i]; Pp[k + i] = s.phase[a + i];
    }
    k += n;
  }
  const mesh = l.mesh;
  mesh.count = k;
  mesh.visible = l.on && k > 0;
  if (k > 0) {
    mesh.instanceMatrix.clearUpdateRanges(); mesh.instanceMatrix.addUpdateRange(0, k * 16); mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.clearUpdateRanges(); mesh.instanceColor.addUpdateRange(0, k * 3); mesh.instanceColor.needsUpdate = true;
    l.hang.clearUpdateRanges(); l.hang.addUpdateRange(0, k); l.hang.needsUpdate = true;
    l.phase.clearUpdateRanges(); l.phase.addUpdateRange(0, k); l.phase.needsUpdate = true;
  }
  return k;
}

/** Where the close-up and the "from below" stills look. */
export function heroFrame(org) {
  const list = org.hoya;
  if (!list.length) return null;
  const tx = 1620, tz = 3644;
  let best = null, bestD = 1e18;
  for (const h of list) {
    if (h.y < -3.4 || h.y > -2.0 || h.lean > 1.15 || h.r < 0.15) continue;
    const d = (h.x - tx) * (h.x - tx) + (h.z - tz) * (h.z - tz);
    if (d < bestD) { bestD = d; best = h; }
  }
  if (!best) best = list[0];
  const under = { x: best.x - 14, y: -3.2, z: best.z - 9 };
  // the close-up sits 0.62 m off the rope on the side this ホヤ faces, a little above it, looking slightly down
  const ox = Math.cos(best.yaw), oz = Math.sin(best.yaw);
  return {
    yaw: Math.atan2(-(best.x - under.x), -(best.z - under.z)),
    frame: { cx: best.x + ox * 0.62 + oz * 0.12, cy: best.y + 0.2, cz: best.z + oz * 0.62 - ox * 0.12, lx: best.x + ox * 0.05, ly: best.y + 0.04, lz: best.z + oz * 0.05 },
    shaft: { cx: best.x + 3.6, cy: -3.6, cz: best.z + 2.0, lx: best.x - 0.3, ly: 0.45, lz: best.z - 0.5 },
    park: { x: best.x - 4.5, y: best.y - 0.3, z: best.z + 3.2 },
    under,
    at: best,
  };
}

export function createCrops(ctx, drops, time, amp) {
  const phone = !!ctx.quality?.phone;
  const org = planOrganisms(drops, { phone });
  const hero = heroFrame(org);
  const meshes = [];
  const lives = [];
  const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), qa = new THREE.Quaternion(), qr = new THREE.Quaternion();
  const pos = new THREE.Vector3(), scl = new THREE.Vector3();
  const tintFor = (seed, base, spread) => (i, out) => {
    const u = Math.sin((i + 1) * 12.9898 + seed) * 43758.5453;
    const f = u - Math.floor(u);
    out[i * 3] = base[0] + (f - 0.5) * spread[0]; out[i * 3 + 1] = base[1] + (f - 0.5) * spread[1]; out[i * 3 + 2] = base[2] + (f - 0.5) * spread[2];
  };
  const mat = cropMaterial(ctx, time, amp, { key: 'swim-crops' });
  const ropes = new Float32Array(drops.length * 2);
  for (let i = 0; i < drops.length; i++) { ropes[i * 2] = drops[i].x; ropes[i * 2 + 1] = drops[i].z; }

  const kinds = [];
  if (org.hoya.length) {
    const s = stock(org.hoya, drops.length, (h, M) => {
      dir.set(Math.sin(h.lean) * Math.cos(h.yaw), Math.cos(h.lean), Math.sin(h.lean) * Math.sin(h.yaw));
      qa.setFromUnitVectors(up, dir);
      qr.setFromAxisAngle(up, h.roll);
      qa.multiply(qr);
      M.compose(pos.set(h.x, h.y, h.z), qa, scl.set(h.r, h.r, h.r));
    }, tintFor(1.3, [1, 0.96, 0.95], [0.1, 0.16, 0.12]));
    kinds.push({ s, l: liveMesh(ctx, hoyaGeometry(), mat, phone ? 520 : 1100, 'swim-hoya'), near: true });
    const c = stock(org.clumps, drops.length, (h, M) => {
      M.compose(pos.set(h.x, h.y, h.z), qa.setFromAxisAngle(up, h.yaw), scl.set(1, 1, 1));
    }, tintFor(2.1, [1, 0.97, 0.96], [0.08, 0.12, 0.1]));
    kinds.push({ s: c, l: liveMesh(ctx, hoyaClumpGeometry(), mat, phone ? 420 : 640, 'swim-hoya-far'), near: false });
  }
  if (org.oyster.length) {
    const s = stock(org.oyster, drops.length, (h, M) => {
      M.compose(pos.set(h.x, h.y, h.z), qa.setFromAxisAngle(up, h.yaw), scl.set(h.r, h.r, h.r));
    }, tintFor(3.7, [1, 1, 1], [0.12, 0.12, 0.12]));
    kinds.push({ s, l: liveMesh(ctx, oysterGeometry(), mat, phone ? 260 : 420, 'swim-oyster'), near: true });
    kinds.push({ s, l: liveMesh(ctx, oysterLumpGeometry(), mat, phone ? 500 : 800, 'swim-oyster-far'), near: false });
  }
  for (const k of kinds) { meshes.push(k.l.mesh); lives.push(k.l); }

  let lantern = null;
  if (org.scallop.length) {
    const g = lanternGeometry(org.scallop);
    if (g) {
      lantern = new THREE.Mesh(g, cropMaterial(ctx, time, amp, { net: true, key: 'swim-lantern' }));
      lantern.name = 'swim-lantern';
      lantern.visible = false;
      ctx.noBatch(lantern);
      ctx.noOutline(lantern);
      ctx.add(lantern);
      meshes.push(lantern);
    }
  }

  const NEAR = phone ? 7 : 9, FAR = 26;
  const near = new Int32Array(64), far = new Int32Array(256);
  const last = { x: 1e9, z: 1e9 };
  let on = false;

  function refill(x, z) {
    last.x = x; last.z = z;
    nearRopes(ropes, drops.length, x, z, NEAR, FAR, near, far);
    for (const k of kinds) fillNear(k.l, k.s, k.near ? near : far);
  }

  return {
    meshes, hero, org, lantern,
    /** Refill the near set when the eye has moved 1.2 m. No allocation. */
    update(eye) {
      if (!on) return;
      const dx = eye.x - last.x, dz = eye.z - last.z;
      if (dx * dx + dz * dz > 1.44) refill(eye.x, eye.z);
    },
    setVisible(v) {
      on = v;
      for (const l of lives) { l.on = v; l.mesh.visible = v && l.mesh.count > 0; }
      if (lantern) lantern.visible = v;
      if (v) last.x = 1e9;
    },
    get counts() { return lives.map((l) => l.mesh.name + ':' + l.mesh.count); },
  };
}
