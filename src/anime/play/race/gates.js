// One static mesh: a 大漁旗 banner over the start, and a pair of posts at each gate.
import * as THREE from 'three';
import { poseAt } from './course.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _axis = new THREE.Vector3(0, 1, 0);

function box(w, h, d, rgb, x, y, z, yaw) {
  const g = new THREE.BoxGeometry(w, h, d);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = rgb[0]; col[i * 3 + 1] = rgb[1]; col[i * 3 + 2] = rgb[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  _q.setFromAxisAngle(_axis, yaw || 0);
  _p.set(x, y, z);
  g.applyMatrix4(_m.compose(_p, _q, _s));
  return g;
}
function cone(h, r, rgb, x, y, z) {
  const g = new THREE.ConeGeometry(r, h, 8);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = rgb[0]; col[i * 3 + 1] = rgb[1]; col[i * 3 + 2] = rgb[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  _p.set(x, y, z);
  g.applyMatrix4(_m.compose(_p, _q.identity(), _s));
  return g;
}
function disc(r, depth, rgb, x, y, z, yaw) {
  const g = new THREE.CylinderGeometry(r, r, depth, 24);
  g.rotateX(Math.PI / 2);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = rgb[0]; col[i * 3 + 1] = rgb[1]; col[i * 3 + 2] = rgb[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  _q.setFromAxisAngle(_axis, yaw || 0);
  _p.set(x, y, z);
  g.applyMatrix4(_m.compose(_p, _q, _s));
  return g;
}

function merge(geos) {
  let nv = 0, ni = 0;
  for (const g of geos) { nv += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
  const idx = new Uint32Array(ni);
  let v = 0, ii = 0;
  for (const g of geos) {
    const p = g.attributes.position, c = g.attributes.color;
    for (let i = 0; i < p.count; i++) {
      pos[(v + i) * 3] = p.getX(i); pos[(v + i) * 3 + 1] = p.getY(i); pos[(v + i) * 3 + 2] = p.getZ(i);
      col[(v + i) * 3] = c.getX(i); col[(v + i) * 3 + 1] = c.getY(i); col[(v + i) * 3 + 2] = c.getZ(i);
    }
    for (let i = 0; i < g.index.count; i++) idx[ii++] = g.index.getX(i) + v;
    v += p.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

export function buildGates(ctx, course) {
  const akane = [0.718, 0.157, 0.180];
  const paper = [0.984, 0.980, 0.961];
  const ai = [0.086, 0.369, 0.514];
  const yamabuki = [0.973, 0.710, 0.0];
  const geos = [];
  const ground = (x, z) => (typeof ctx.L?.heightAt === 'function' ? ctx.L.heightAt(x, z) : 0) || 0;
  for (let i = 0; i < course.gates.length; i++) {
    const pose = poseAt(course, course.gates[i]);
    const gnd = ground(pose.x, pose.z);
    const rx = Math.cos(pose.yaw), rz = -Math.sin(pose.yaw);
    const span = i === 0 ? 2.7 : 3.2;
    const h = i === 0 ? 4.6 : 3.4;
    for (const side of [-1, 1]) {
      const x = pose.x + rx * span * side, z = pose.z + rz * span * side;
      geos.push(box(0.18, h, 0.18, side < 0 ? akane : ai, x, ground(x, z) + h / 2, z));
    }
    const yBar = gnd + h - 0.08;
    geos.push(box(span * 2 + 0.28, 0.14, 0.14, ai, pose.x, yBar, pose.z, pose.yaw));
    geos.push(box(span * 2 + 0.1, 0.05, 0.16, paper, pose.x, yBar, pose.z, pose.yaw));
    if (i === 0) {
      // A short 大漁旗 under the start arch: red field, white inset, blue disc, two waves.
      const fw = 4.2, fh = 1.7;
      const yFlag = yBar - fh / 2 - 0.12;
      geos.push(box(fw, fh, 0.04, akane, pose.x, yFlag, pose.z, pose.yaw));
      geos.push(box(fw - 0.2, fh - 0.2, 0.055, paper, pose.x, yFlag, pose.z, pose.yaw));
      geos.push(disc(0.36, 0.07, ai, pose.x, yFlag + 0.22, pose.z, pose.yaw));
      geos.push(box(fw - 0.7, 0.055, 0.07, akane, pose.x, yFlag - 0.28, pose.z, pose.yaw));
      geos.push(box(fw - 0.95, 0.055, 0.075, akane, pose.x, yFlag - 0.46, pose.z, pose.yaw));
    }
  }
  const cones = course.cones || [];
  for (let i = 0; i < cones.length; i++) {
    const c = cones[i];
    const y = ground(c[0], c[1]);
    geos.push(cone(0.72, 0.2, yamabuki, c[0], y + 0.36, c[1]));
  }
  const bars = course.bars || [];
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const y = ground(b[0], b[1]);
    geos.push(box(b[3] || 4.2, 0.55, 0.16, akane, b[0], y + 0.28, b[1], b[2] || 0));
  }
  const mesh = new THREE.Mesh(merge(geos), new THREE.MeshBasicMaterial({ vertexColors: true }));
  mesh.name = 'play-gates';
  // Stay on the outline layer so the flag hides the ink of whatever is behind it.
  ctx.add(mesh);
  // A small signal head on each gate: 茜 / 山吹 / 浅葱, just over the bloom threshold so the lamps glow.
  const lamps = [];
  const red = [1.22, 0.27, 0.31];
  const gold = [1.16, 0.86, 0.04];
  const asa = [0.02, 1.15, 1.22];
  for (let i = 0; i < course.gates.length; i++) {
    const pose = poseAt(course, course.gates[i]);
    const gnd = ground(pose.x, pose.z);
    const rx = Math.cos(pose.yaw), rz = -Math.sin(pose.yaw);
    const span = i === 0 ? 2.7 : 3.2;
    const x = pose.x + rx * span * 0.62;
    const z = pose.z + rz * span * 0.62;
    const y = gnd + 2.7;
    lamps.push(box(0.16, 0.16, 0.08, red, x, y, z, pose.yaw));
    lamps.push(box(0.16, 0.16, 0.08, gold, x, y - 0.24, z, pose.yaw));
    lamps.push(box(0.16, 0.16, 0.08, asa, x, y - 0.48, z, pose.yaw));
  }
  if (lamps.length) {
    const lit = new THREE.Mesh(merge(lamps), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false }));
    lit.name = 'play-gate-lamps';
    ctx.noOutline?.(lit);
    ctx.add(lit);
  }
  return mesh;
}
