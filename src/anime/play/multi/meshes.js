// Real bodies for remote friends, baked once into static geometries so eight of
// them share two batched draws (the body, and a boat flag).
//
// What is real, and what is still a stand-in (docs/play/MULTI.md):
//   car   — the kei van's vertex-colour body, turned so yaw 0 faces north.
//           His colour tints the whole van (livery). Plates, glass and the
//           garage's decal atlas stay on the car you drive; one batch cannot
//           carry eight different textures.
//   avatar — the faceless walker stand-in. A custom character is not baked
//           into a friend's body. He is never recolored.
//   gull  — flockGeo() from the gull lane (beak at +Z, same as the bird you fly).
//   fish  — fishGeometry() with a belly and a back painted in, because the
//           swim shader cannot be instanced.
//   boat  — a low hull at the real length: 第一昭福丸 58.6 m, 第五凪丸 28 m.
//           The full ship builds are what you sail (60k triangles and up).
//           A friend's colour is a flag, not a hull tint.
// Stand-ins remain wherever a bake throws, and in tests that have no town ctx.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeKeiVan } from '../../world/town/sakura/vehicles_cars.js';
import { flockGeo } from '../gull/bird.js';
import { fishGeometry } from '../underwater/fish.js';
import { SHIP } from '../../world/ship/shofukumaru1.js';
import { KATSUO } from '../../world/ship/boat-params.js';
/** Eye height the sail code writes into the pose. The hull sits this far below it. */
export const BOAT_DROP = [6, 2.8];

function paint(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = c.r;
    a[i * 3 + 1] = c.g;
    a[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

function boatGeo(L, B, H) {
  const hull = paint(new THREE.BoxGeometry(B * 0.86, H * 0.42, L * 0.72), '#e7e9e3');
  hull.translate(0, H * 0.22, L * 0.04);
  const bow = paint(new THREE.ConeGeometry(Math.min(B * 0.46, 4.2), L * 0.2, 4), '#e7e9e3');
  bow.rotateX(-Math.PI / 2);
  bow.translate(0, H * 0.2, -L * 0.44);
  const house = paint(new THREE.BoxGeometry(B * 0.42, H * 0.5, Math.min(L * 0.16, 9)), '#2b3f73');
  house.translate(0, H * 0.58, L * 0.06);
  const boot = paint(new THREE.BoxGeometry(B * 0.9, H * 0.08, L * 0.74), '#8e3d33');
  boot.translate(0, H * 0.05, L * 0.03);
  const g = mergeGeometries([hull, bow, house, boot], false);
  hull.dispose();
  bow.dispose();
  house.dispose();
  boot.dispose();
  return g;
}

function flagGeo(L, H) {
  const w = Math.min(2.2, Math.max(0.7, L * 0.045));
  const h = Math.min(1.3, Math.max(0.45, H * 0.16));
  const cloth = paint(new THREE.PlaneGeometry(w, h), '#ffffff');
  cloth.translate(0, H * 0.85 + h * 0.5, L * 0.22);
  return cloth;
}

function bakeFish() {
  const g = fishGeometry();
  const p = g.attributes.position;
  const back = new THREE.Color('#1a4f86');
  const belly = new THREE.Color('#e7eef2');
  const nose = new THREE.Color('#0e3358');
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const col = p.getZ(i) < -0.45 ? nose : (p.getY(i) > 0 ? back : belly);
    c[i * 3] = col.r;
    c[i * 3 + 1] = col.g;
    c[i * 3 + 2] = col.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

function bakeVan(ctx) {
  const group = makeKeiVan(ctx);
  const mesh = group.userData.inner?.children?.[0];
  if (!mesh?.geometry?.attributes?.position) return null;
  const geo = mesh.geometry.clone();
  geo.rotateY(Math.PI);
  if (!geo.attributes.color) paint(geo, '#e8e8e3');
  group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  return geo;
}

/** Geometries keyed by mode. Missing keys mean "use the stand-in". */
export function realGeos(ctx) {
  const kind = { avatar: 'stand-in', car: 'stand-in', gull: 'stand-in', fish: 'stand-in', boat: 'proxy', boat1: 'proxy' };
  const out = { kind, boat: null, boat1: null, flag: null, flag1: null, gull: null, fish: null, car: null, avatar: null };
  try { out.boat = boatGeo(SHIP.LOA, SHIP.B, 7.2); } catch (e) { out.boat = null; kind.boat = 'stand-in'; }
  try { out.boat1 = boatGeo(KATSUO.L, KATSUO.B, 4.6); } catch (e) { out.boat1 = null; kind.boat1 = 'stand-in'; }
  try { out.flag = flagGeo(SHIP.LOA, 7.2); } catch (e) { out.flag = null; }
  try { out.flag1 = flagGeo(KATSUO.L, 4.6); } catch (e) { out.flag1 = null; }
  try { out.gull = flockGeo(); kind.gull = 'flock'; } catch (e) { out.gull = null; }
  try { out.fish = bakeFish(); kind.fish = 'fish'; } catch (e) { out.fish = null; }
  if (ctx && ctx.tex) {
    try {
      out.car = bakeVan(ctx);
      if (out.car) kind.car = 'kei';
    } catch (e) { out.car = null; }
  }
  return out;
}
