// [play:ippon] One angler, instanced. Built from the town cast kit (life/cast.js LOOKS.fisherman,
// the same Human the café uses): a cap, a rain jacket, an apron, rubber boots. No likeness.
// The posed mesh is baked once so eight crew and the player's pole stay a single draw.
// aPart: 0 body, 1 arms (they lift), 2 pole, 3 line. The player instance hides 0 and 1.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Human } from '../../world/life/characters/human.js';
import { Driver, rotMul } from '../../world/life/characters/anim.js';
import { LOOKS } from '../../world/life/cast.js';
import * as gear from '../../world/life/characters/gear.js';

export const HAND = { x: 0.22, y: 1.06, z: 0 };
export const TIP = { x: 1.6, y: 0.2, z: 0 };
export const LIFT_RAD = 140 * Math.PI / 180;

const POLE = '#c6a56c';
const LINE = '#efe6d4';
const WHITE_UV = 0.75;

function paint(geo, hex, part) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  const partA = new Float32Array(n);
  const along = new Float32Array(n);
  const side = new Float32Array(n);
  const uv = new Float32Array(n * 2);
  const c = new THREE.Color(hex);
  const p = g.getAttribute('position');
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    partA[i] = part;
    along[i] = part > 2.5 ? p.getX(i) : 0;
    side[i] = part > 2.5 ? p.getY(i) : 0;
    uv[i * 2] = WHITE_UV; uv[i * 2 + 1] = WHITE_UV;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aPart', new THREE.BufferAttribute(partA, 1));
  g.setAttribute('aAlong', new THREE.BufferAttribute(along, 1));
  g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.deleteAttribute('skinIndex');
  g.deleteAttribute('skinWeight');
  return g;
}

// 紺 / 茜 / 浅葱 / 墨. Cap or 手ぬぐい. Height stays in the instance scale (±4 %).
const CREW_LOOKS = [
  { top: '#223A70', lapel: '#1a2d52', head: 'cap', cap: '#39485f', visor: '#2c3a50' },
  { top: '#B7282E', lapel: '#8e1e24', head: 'band', band: '#f4efe4' },
  { top: '#00A3AF', lapel: '#087e88', head: 'cap', cap: '#1c4a52', visor: '#14383e' },
  { top: '#595857', lapel: '#3e3d3c', head: 'band', band: '#d7d2c8' },
];

function anglerSpec(ctx, look, i) {
  const r = ctx.rng('ippon-crew-' + i);
  const spec = LOOKS.fisherman(r, 8 + i);
  spec.key = 'ippon-angler-' + i;
  spec.seed = 240 + i;
  spec.height = 1.72;
  spec.variants = ['open'];
  spec.hands = { L: 'hold', R: 'hold' };
  spec.outfit = {
    top: 'jacket', topColor: look.top, lapel: look.lapel, shirt: '#e7e4dc',
    vAng: 16, vY: 0.96,
    bottom: 'trousers', bottomColor: '#3a404c',
    apron: { color: i % 2 ? '#e7e4dc' : '#d9733c', strap: '#c4652f', hem: 0.32 },
    boots: { color: '#e1e4dc', band: '#cfd3cb', top: 0.72 },
    gloves: '#e2a13a',
  };
  spec.props = [look.head === 'band'
    ? (hh) => gear.headband(hh, { color: look.band })
    : (hh) => gear.workCap(hh, { color: look.cap, visor: look.visor })];
  return spec;
}

function tagVar(geo, v) {
  const n = geo.getAttribute('position').count;
  const a = new Float32Array(n);
  a.fill(v);
  geo.setAttribute('aVar', new THREE.BufferAttribute(a, 1));
  return geo;
}

function bake(mesh, armIds) {
  mesh.updateMatrixWorld(true);
  mesh.skeleton.update();
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const uv = geo.attributes.uv;
  const col = geo.attributes.color;
  const si = geo.attributes.skinIndex;
  const sw = geo.attributes.skinWeight;
  const bones = mesh.skeleton.boneMatrices;
  const bind = mesh.bindMatrix;
  const bindI = mesh.bindMatrixInverse;
  const index = geo.index ? geo.index.array : null;
  const n = index ? index.length : pos.count;
  const outP = new Float32Array(n * 3);
  const outN = new Float32Array(n * 3);
  const outU = new Float32Array(n * 2);
  const outC = new Float32Array(n * 3);
  const partA = new Float32Array(n);
  const along = new Float32Array(n);
  const side = new Float32Array(n);
  const v = new THREE.Vector4();
  const tmp = new THREE.Matrix4();
  const acc = new THREE.Matrix4();
  const ae = acc.elements;
  for (let i = 0; i < n; i++) {
    const vi = index ? index[i] : i;
    v.set(pos.getX(vi), pos.getY(vi), pos.getZ(vi), 1).applyMatrix4(bind);
    ae.fill(0);
    let arm = 0;
    let body = 0;
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(vi, k);
      if (w <= 0) continue;
      const bi = si.getComponent(vi, k);
      if (armIds.has(bi)) arm += w; else body += w;
      tmp.fromArray(bones, bi * 16);
      const te = tmp.elements;
      for (let j = 0; j < 16; j++) ae[j] += te[j] * w;
    }
    v.applyMatrix4(acc).applyMatrix4(bindI);
    outP[i * 3] = v.x; outP[i * 3 + 1] = v.y; outP[i * 3 + 2] = v.z;
    const nx = nrm.getX(vi), ny = nrm.getY(vi), nz = nrm.getZ(vi);
    let nnx = ae[0] * nx + ae[4] * ny + ae[8] * nz;
    let nny = ae[1] * nx + ae[5] * ny + ae[9] * nz;
    let nnz = ae[2] * nx + ae[6] * ny + ae[10] * nz;
    const nl = Math.hypot(nnx, nny, nnz) || 1;
    outN[i * 3] = nnx / nl; outN[i * 3 + 1] = nny / nl; outN[i * 3 + 2] = nnz / nl;
    outU[i * 2] = uv.getX(vi); outU[i * 2 + 1] = uv.getY(vi);
    outC[i * 3] = col.getX(vi); outC[i * 3 + 1] = col.getY(vi); outC[i * 3 + 2] = col.getZ(vi);
    partA[i] = arm > body ? 1 : 0;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(outP, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(outN, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(outU, 2));
  g.setAttribute('color', new THREE.BufferAttribute(outC, 3));
  g.setAttribute('aPart', new THREE.BufferAttribute(partA, 1));
  g.setAttribute('aAlong', new THREE.BufferAttribute(along, 1));
  g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  return g;
}

function poleGeo(from, dir) {
  const len = 1.9;
  const pole = new THREE.CylinderGeometry(0.016, 0.011, len, 5);
  pole.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  pole.applyQuaternion(q);
  pole.translate(from.x, from.y, from.z);
  return paint(pole, POLE, 2);
}

function lineGeo() {
  const line = new THREE.BufferGeometry();
  const lp = new Float32Array([
    0, 0.012, 0, 1, 0.012, 0, 1, -0.012, 0,
    0, 0.012, 0, 1, -0.012, 0, 0, -0.012, 0,
  ]);
  line.setAttribute('position', new THREE.BufferAttribute(lp, 3));
  line.computeVertexNormals();
  return paint(line, LINE, 3);
}

function bakeAngler(ctx, spec, primary) {
  const h = new Human(ctx, spec);
  const d = new Driver(ctx, h, { seed: spec.seed });
  const k = h.P.k;
  const ank = h.P.ankle;
  const fx = h.P.hipJx;
  d.place(0, 0, 0, 0);
  d.reset();
  d.stand({ stance: 1.15, footL: [fx, ank, 0.05 * k], footR: [-fx * 0.95, ank, -0.02 * k] });
  rotMul(h.b.spine, 0.2, 0, 0);
  h.group.updateMatrixWorld(true);
  const handR = d.W(-0.07 * k, 0.92, 0.38 * k, new THREE.Vector3());
  const poleR = d.W(-0.28 * k, 0.78, 0.08 * k, new THREE.Vector3());
  const handL = d.W(0.1 * k, 0.98, 0.32 * k, new THREE.Vector3());
  const poleL = d.W(0.32 * k, 0.84, 0.06 * k, new THREE.Vector3());
  d.armIK('R', handR, poleR);
  d.armIK('L', handL, poleL);
  d.lookAt(d.W(0, 1.35, 5, new THREE.Vector3()), 1, { speed: 20, maxYaw: 0.4 });
  h.group.updateMatrixWorld(true);

  const armIds = new Set(['uarmL', 'uarmR', 'farmL', 'farmR', 'handL', 'handR'].map((name) => h.b[name].userData.bi));
  const body = bake(h.mesh, armIds);
  const rot = new THREE.Matrix4().makeRotationY(Math.PI / 2);
  body.applyMatrix4(rot);
  body.computeBoundingBox();
  const drop = body.boundingBox.min.y;
  body.translate(0, -drop, 0);

  const grip = new THREE.Vector3();
  const sl = new THREE.Vector3();
  const sr = new THREE.Vector3();
  h.b.handL.getWorldPosition(grip);
  h.b.handR.getWorldPosition(sr);
  grip.add(sr).multiplyScalar(0.5).applyMatrix4(rot);
  grip.y -= drop;
  h.b.uarmL.getWorldPosition(sl);
  h.b.uarmR.getWorldPosition(sr);
  sl.add(sr).multiplyScalar(0.5).applyMatrix4(rot);
  sl.y -= drop;
  if (primary) { HAND.x = sl.x; HAND.y = sl.y; HAND.z = sl.z; }

  const aim = new THREE.Vector3(2.5, -1.15, 0.02).sub(grip);
  if (aim.lengthSq() < 1e-4) aim.set(1, -0.6, 0);
  aim.normalize();
  if (primary) {
    TIP.x = grip.x + aim.x * 1.9;
    TIP.y = grip.y + aim.y * 1.9;
    TIP.z = grip.z + aim.z * 1.9;
  }

  const pole = poleGeo(grip, aim);
  const line = lineGeo();
  h.mesh.geometry.dispose();
  h.group.remove(h.mesh);
  const mat = h.mats.open;
  mat.skinning = false;
  return { body, pole, line, mat };
}

/** Feet on y = 0, facing +x (port, the water). Four looks, one mesh. `ctx` is the world context. */
export function buildCrewGeo(ctx) {
  const parts = [];
  let mat = null;
  for (let i = 0; i < CREW_LOOKS.length; i++) {
    const baked = bakeAngler(ctx, anglerSpec(ctx, CREW_LOOKS[i], i), i === 0);
    tagVar(baked.body, i);
    tagVar(baked.pole, i);
    tagVar(baked.line, i);
    parts.push(baked.body, baked.pole, baked.line);
    if (i === 0) mat = baked.mat;
  }
  const geo = mergeGeometries(parts, false);
  geo.computeBoundingSphere();
  return { geo, mat, variants: CREW_LOOKS.length };
}
