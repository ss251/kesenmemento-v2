// Stand-in silhouettes. One merged geometry per mode, built once.
// Faceless on purpose: a colour and a shape, never a likeness.
// Other lanes replace a geometry with `setStandIn` once their mesh exists.

import { MODES } from '../../../../server/multi/wire.js';

export const LABEL_Y = { avatar: 2.05, car: 2.2, boat: 3.4, gull: 0.85, fish: 0.7 };

function expand(g) {
  const idx = g.index;
  const p = g.attributes.position.array;
  const n = g.attributes.normal.array;
  const c = idx ? idx.count : p.length / 3;
  const pos = new Float32Array(c * 3);
  const nrm = new Float32Array(c * 3);
  for (let i = 0; i < c; i++) {
    const vi = idx ? idx.getX(i) : i;
    const s = vi * 3;
    const d = i * 3;
    pos[d] = p[s]; pos[d + 1] = p[s + 1]; pos[d + 2] = p[s + 2];
    nrm[d] = n[s]; nrm[d + 1] = n[s + 1]; nrm[d + 2] = n[s + 2];
  }
  return { pos, nrm };
}

function merge(THREE, parts) {
  const chunks = [];
  let count = 0;
  for (let i = 0; i < parts.length; i++) {
    const g = new THREE.BoxGeometry(parts[i][0], parts[i][1], parts[i][2]);
    g.translate(parts[i][3], parts[i][4], parts[i][5]);
    const ch = expand(g);
    g.dispose();
    chunks.push(ch);
    count += ch.pos.length;
  }
  const pos = new Float32Array(count);
  const nrm = new Float32Array(count);
  let o = 0;
  for (let i = 0; i < chunks.length; i++) {
    pos.set(chunks[i].pos, o);
    nrm.set(chunks[i].nrm, o);
    o += chunks[i].pos.length;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return geo;
}

// [w, h, d, x, y, z]. Front is -Z, matching a yaw of 0 (north).
const PARTS = {
  avatar: [
    [0.22, 0.55, 0.2, -0.12, 0.4, 0],
    [0.22, 0.55, 0.2, 0.12, 0.4, 0],
    [0.46, 0.62, 0.28, 0, 0.95, 0],
    [0.16, 0.48, 0.16, -0.32, 0.95, 0],
    [0.16, 0.48, 0.16, 0.32, 0.95, 0],
    [0.32, 0.32, 0.32, 0, 1.48, 0],
  ],
  car: [
    [1.5, 0.55, 3.2, 0, 0.62, 0],
    [1.2, 0.55, 1.35, 0, 1.12, 0.15],
    [0.28, 0.42, 0.55, -0.72, 0.28, -0.95],
    [0.28, 0.42, 0.55, 0.72, 0.28, -0.95],
    [0.28, 0.42, 0.55, -0.72, 0.28, 0.95],
    [0.28, 0.42, 0.55, 0.72, 0.28, 0.95],
  ],
  boat: [
    [2.2, 0.7, 7.2, 0, 0.45, 0],
    [1.5, 0.45, 5.4, 0, 0.95, 0.2],
    [1.3, 1.15, 1.6, 0, 1.7, 1.3],
  ],
  gull: [
    [0.22, 0.14, 0.55, 0, 0.2, 0],
    [1.35, 0.05, 0.28, 0, 0.28, 0.02],
    [0.16, 0.14, 0.18, 0, 0.28, -0.32],
  ],
  fish: [
    [0.32, 0.36, 1.25, 0, 0.28, 0],
    [0.06, 0.42, 0.36, 0, 0.32, 0.72],
    [0.04, 0.22, 0.2, 0, 0.52, -0.15],
  ],
};

const custom = Object.create(null);

export function setStandIn(mode, geometry) {
  if (MODES.indexOf(mode) < 0 || !geometry) return false;
  custom[mode] = geometry;
  return true;
}

export function standIn(THREE, mode) {
  if (custom[mode]) return custom[mode];
  return merge(THREE, PARTS[mode] || PARTS.avatar);
}

export function triangleCount(geo) {
  const p = geo?.attributes?.position;
  return p ? p.count / 3 : 0;
}
