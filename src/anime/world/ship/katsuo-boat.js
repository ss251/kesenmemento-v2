// [play:ippon] 第五凪丸, a fictional 近海かつお boat. The mesh is the harbour katsuo kit (散水, pole racks,
// bait tanks, bridge, bird radar, 大漁旗) scaled to the handling hull in boat-params.js. Fishing is from the
// port side, where the sources put the line of anglers. Green caps mark the spray outlets (a 2010 photo note).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BOAT_SPECS, buildBoat, hullShape } from '../harbor/boats.js';
import { KATSUO } from './boat-params.js';

const SPEC = BOAT_SPECS.katsuo;
const K = KATSUO.L / SPEC.L;
export const NAME = { ja: '第五凪丸', en: 'Daigo Nagi Maru' };

/** Market-quay berth (routes.json, first listed slot), bow along the quay. Ashore is on the apron. */
export const BERTH = {
  x: 579.5, z: 650.4, yaw: -2.7125,
  quay: [566.8, 656.2],
  ashore: 56,
};

export const PLACE = {
  id: 'ippon-daigo-nagi',
  ja: '第五凪丸に乗る',
  en: 'Board the Daigo Nagi Maru',
  cat: 'ship',
  group: 'ship',
  at: BERTH.quay.slice(),
};

function gun(H, u, side) {
  const y = H.sheer(u);
  const x = side * (H.half(u, y) - 0.45) * K;
  const z = (-SPEC.L / 2 + u * SPEC.L) * K;
  return { x, y: H.deckY(u) * K, z, rail: y * K };
}

/** Stations in metres, matching the scaled hull. Port is +X. */
export function boatStations() {
  const H = hullShape(SPEC);
  const eyeG = gun(H, 0.8, 1);
  const eye = { x: eyeG.x - 0.28, y: eyeG.y + 1.62, z: eyeG.z };
  const nozzles = [];
  for (const s of [1, -1]) {
    const n = s > 0 ? 8 : 4;
    for (let i = 0; i < n; i++) {
      const u = 0.42 + i * (s > 0 ? 0.055 : 0.09);
      const yy = H.sheer(u) - 0.25;
      nozzles.push([s * (H.half(u, yy) + 0.55) * K, yy * K, (-SPEC.L / 2 + u * SPEC.L) * K, s]);
    }
  }
  const crew = [];
  const along = [0.92, 0.88, 0.84, 0.76, 0.72, 0.66, 0.6, 0.54];
  for (let i = 0; i < along.length; i++) {
    const p = gun(H, along[i], 1);
    crew.push({ x: p.x - 0.18, y: p.y, z: p.z, side: 1, self: false });
  }
  const bow = gun(H, 0.92, 1);
  return { eye, nozzles, crew, deckY: gun(H, 0.35, 1).y + 0.15, bait: { x: 0.4, y: 0.3, z: bow.z }, k: K };
}

function greenEnds(ctx, group) {
  const H = hullShape(SPEC);
  const geos = [];
  for (const s of [1, -1]) {
    for (let i = 0; i <= 16; i += 2) {
      const u = 0.42 + i * 0.03;
      const yy = H.sheer(u) - 0.25;
      const x = s * (H.half(u, yy) + 0.55);
      const z = -SPEC.L / 2 + u * SPEC.L;
      const g = new THREE.SphereGeometry(0.14, 6, 4);
      g.translate(x, yy, z);
      geos.push(g);
    }
  }
  const mesh = new THREE.Mesh(mergeGeometries(geos), ctx.mat.toon('#2f8f4a', { paint: 0.02 }));
  mesh.castShadow = true;
  mesh.name = 'katsuo:hose-ends';
  group.add(mesh);
}

function collapse(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map();
  const drop = [];
  group.traverse((o) => {
    if (!o.isMesh || o.userData.hull || o.material?.map || o.material?.transparent) return;
    drop.push(o);
  });
  const bake = new THREE.Matrix4();
  for (const m of drop) {
    let g = m.geometry;
    if (g.index) g = g.toNonIndexed();
    else g = g.clone();
    bake.multiplyMatrices(inv, m.matrixWorld);
    g.applyMatrix4(bake);
    if (g.getAttribute('uv') && !g.getAttribute('color')) g.deleteAttribute('uv');
    const attrs = Object.keys(g.attributes).sort().join(',');
    const key = m.material.uuid + '|' + attrs;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { mat: m.material, geos: [], meshes: [] }));
    b.geos.push(g);
    b.meshes.push(m);
  }
  for (const b of buckets.values()) {
    try {
      const merged = mergeGeometries(b.geos, false);
      const mesh = new THREE.Mesh(merged, b.mat);
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
      for (const m of b.meshes) m.removeFromParent();
    } catch { /* leave the originals */ }
  }
}

/** Build her and leave her at the quay. The group is in metres after scaling. */
export function buildKatsuoBoat(ctx) {
  const built = buildBoat(ctx, 'katsuo', { x: BERTH.x, z: BERTH.z, rotY: BERTH.yaw }, {
    dynamic: true,
    flags: true,
    name: NAME.ja,
    seed: 'ippon-daigo-nagi',
    trim: '#2b3f73',
    lights: true,
  });
  try { collapse(built.group); } catch (e) { console.warn('[ippon] hull collapse', e); }
  try { greenEnds(ctx, built.group); } catch (e) { console.warn('[ippon] hose ends', e); }
  built.group.scale.setScalar(K);
  built.group.name = 'katsuo:第五凪丸';
  return { ...built, stations: boatStations(), scale: K, berth: BERTH };
}
