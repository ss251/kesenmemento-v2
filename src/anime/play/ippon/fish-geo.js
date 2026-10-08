// [play:ippon] カツオ mesh. The outline is the title logo's fish
// (tools/anime/title-logo.mjs, the katsuo path): torpedo body, crescent tail, first dorsal.
// Logo space is SVG (y down). 112 long, 52 tall, nose at +x. Here y is up.
// Bars and belly lines are not painted on: the shader swaps them when the fish lands.

import * as THREE from 'three';

export const LOGO = { length: 112, height: 52 };
const S = 0.62 / LOGO.length;
const SHIFT = 5;

const BACK = new THREE.Color('#1A3A6E');
const BELLY = new THREE.Color('#E4EAF0');
const FIN = new THREE.Color('#16325F');
const EYE_W = new THREE.Color('#f7f4ee');
const EYE_D = new THREE.Color('#17184B');

const BODY = [
  [[-44, 0], [-36, -10], [-16, -16], [8, -15]],
  [[8, -15], [26, -14], [40, -8], [49, -1.5]],
  [[49, -1.5], [51, 0], [51, 2], [49, 3.5]],
  [[49, 3.5], [40, 10], [24, 14], [6, 14]],
  [[6, 14], [-16, 14], [-34, 9], [-44, 0]],
];

function cubic(p0, p1, p2, p3, t, out) {
  const u = 1 - t;
  const uu = u * u;
  const tt = t * t;
  out.x = uu * u * p0[0] + 3 * uu * t * p1[0] + 3 * u * tt * p2[0] + tt * t * p3[0];
  out.y = uu * u * p0[1] + 3 * uu * t * p1[1] + 3 * u * tt * p2[1] + tt * t * p3[1];
  return out;
}

function outline() {
  const pts = [];
  const o = { x: 0, y: 0 };
  for (let s = 0; s < BODY.length; s++) {
    const seg = BODY[s];
    for (let i = 0; i < 12; i++) {
      cubic(seg[0], seg[1], seg[2], seg[3], i / 12, o);
      pts.push(o.x, o.y);
    }
  }
  return pts;
}

function section(pts, x) {
  let top = 1e9;
  let bot = -1e9;
  let hit = 0;
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const ax = pts[i * 2];
    const ay = pts[i * 2 + 1];
    const j = (i + 1) % n;
    const bx = pts[j * 2];
    const by = pts[j * 2 + 1];
    const d = bx - ax;
    if (d > -1e-4 && d < 1e-4) continue;
    const t = (x - ax) / d;
    if (t < -0.02 || t > 1.02) continue;
    const y = ay + (by - ay) * t;
    if (y < top) top = y;
    if (y > bot) bot = y;
    hit++;
  }
  if (hit < 2 || bot - top < 0.6) return null;
  return { top, bot };
}

function put(dst, x, y, z) {
  dst.push((x + SHIFT) * S, -y * S, z * S);
}

function paint(dst, color) {
  dst.push(color.r, color.g, color.b);
}

/** One カツオ. Nose +x, back +y, about 0.62 m, in the logo's proportions. */
export function buildKatsuoGeo() {
  const pts = outline();
  const stations = [];
  for (let i = 0; i < 16; i++) {
    const x = -40 + (i / 15) * 86;
    const sec = section(pts, x);
    if (sec) stations.push({ x, top: sec.top, bot: sec.bot });
  }
  const A = 10;
  const pos = [];
  const col = [];
  const idx = [];
  const ring = (st, ai) => {
    const a = (ai / A) * Math.PI * 2;
    const cy = (st.top + st.bot) * 0.5;
    const ry = (st.bot - st.top) * 0.5;
    const rz = ry * 0.52;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const y = cy + ry * c;
    const z = rz * s;
    // c > 0 is the belly (outline +y, world −y after the flip). The back stays dark blue.
    const k = c > 0.12 ? 1 : c < -0.08 ? 0 : (c + 0.08) / 0.2;
    put(pos, st.x, y, z);
    const r = BACK.r + (BELLY.r - BACK.r) * k;
    const g = BACK.g + (BELLY.g - BACK.g) * k;
    const b = BACK.b + (BELLY.b - BACK.b) * k;
    col.push(r, g, b);
  };
  for (let i = 0; i < stations.length; i++) {
    for (let a = 0; a < A; a++) ring(stations[i], a);
  }
  const base = stations.length * A;
  for (let i = 0; i < stations.length - 1; i++) {
    for (let a = 0; a < A; a++) {
      const b = (a + 1) % A;
      const v00 = i * A + a;
      const v01 = i * A + b;
      const v10 = (i + 1) * A + a;
      const v11 = (i + 1) * A + b;
      idx.push(v00, v10, v01, v01, v10, v11);
    }
  }
  const cap = (st, sign) => {
    const vi = pos.length / 3;
    put(pos, st.x, (st.top + st.bot) * 0.5, 0);
    paint(col, sign > 0 ? BACK : FIN);
    const row = sign > 0 ? (stations.length - 1) * A : 0;
    for (let a = 0; a < A; a++) {
      const b = (a + 1) % A;
      if (sign > 0) idx.push(vi, row + b, row + a);
      else idx.push(vi, row + a, row + b);
    }
  };
  cap(stations[0], -1);
  cap(stations[stations.length - 1], 1);

  const tri = (ax, ay, az, bx, by, bz, cx, cy, cz, color) => {
    const v = pos.length / 3;
    put(pos, ax, ay, az); paint(col, color);
    put(pos, bx, by, bz); paint(col, color);
    put(pos, cx, cy, cz); paint(col, color);
    idx.push(v, v + 1, v + 2);
  };
  const fin = (a, b, c) => {
    tri(a[0], a[1], 0.6, b[0], b[1], 0.6, c[0], c[1], 0.6, FIN);
    tri(a[0], a[1], -0.6, c[0], c[1], -0.6, b[0], b[1], -0.6, FIN);
  };
  fin([-43, 0], [-61, -25], [-44, -6]);
  fin([-43, 0], [-42, 5], [-57, 23]);
  fin([-6, -13], [13, -29], [9, -14]);
  fin([-30, -10], [-27, -16], [-24, -9]);
  fin([-20, -12], [-17, -17], [-15, -11]);
  fin([6, 4], [20, 12], [2, 8]);
  fin([6, 4], [2, 8], [20, 12]);

  const eye = (z, sx) => {
    tri(34, -2, z, 40, -2, z, 37, -6, z, EYE_W);
    tri(35.5, -2.6, z + sx, 39, -2.6, z + sx, 37.4, -5, z + sx, EYE_D);
  };
  eye(4.2, 0.8);
  eye(-4.2, -0.8);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.deleteAttribute('uv');
  return g;
}

/** Axis-aligned size of a built fish, in metres. */
export function fishBox(geo = buildKatsuoGeo()) {
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  const length = b.max.x - b.min.x;
  const height = b.max.y - b.min.y;
  return { length, height, ratio: length / height };
}
