// [v3:town] Far zone: every remaining GSI footprint of the city as instanced anime houses and blocks, bodies with the
// procedural facade (facade.js, instanced path) and gable / hip / flat roofs in the photo-sampled palette, chunked in
// two rings (near casts shadows); small footprints far away are skipped (sub-pixel from any view).
import * as THREE from 'three';
import { unitGable, unitHip, unitShed } from './kit/far.js';
import { facadeMaterial } from './facade.js';
import { styleOf } from './mid.js';
import { wallOf, pitchedRoofOf, flatRoofOf } from './palette.js';
import { roofShapeAt, shedDirOf } from './common.js';
import { LOT_TOWER } from './signtower.js';   // [r2:12]

const DARK = ['#4d6457', '#56677a', '#3e4a63', '#6a5448', '#4a4f58', '#7b8691', '#8e4540', '#4a78a0', '#a0573f', '#5d6f86'];

function bodyGeo() {
  const g = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  // drop the bottom face (never seen)
  const idx = g.index.array, keep = [];
  const pos = g.attributes.position;
  for (let i = 0; i < idx.length; i += 3) { const y = pos.getY(idx[i]) + pos.getY(idx[i + 1]) + pos.getY(idx[i + 2]); if (y > 0.01) keep.push(idx[i], idx[i + 1], idx[i + 2]); }
  g.setIndex(keep);
  return g;
}

export function buildFar(ctx, lots, { centre, maxDist = 7000, ring = 2200, skipSmallBeyond = 2000 } = {}) {
  const list = [];
  for (const l of lots) {
    if (l.obb.w < 1.5 || l.obb.d < 1.5) continue;
    if (ctx.L.shoreDist(l.obb.cx, l.obb.cz) > 0.5) continue;
    if (l.landmark || l.kind === 'landmark') continue;   // [v4:landmarks-A] harbor builds the landmark (e.g. the fish market's D棟) on its real outline
    const dist = Math.hypot(l.obb.cx - centre.cx, l.obb.cz - centre.cz);
    if (dist > maxDist) continue;
    if (dist > skipSmallBeyond && l.area < 70) continue;
    if (dist > 4000 && l.area < 130) continue;
    list.push(l);
  }
  // two rings around the inner bay: the near ring casts shadows, the outer ring does not (fewer draw calls than tiles;
  // frustum culling of 1.6 km tiles bought less than the extra calls cost)
  const tiles = new Map();
  for (const l of list) { const k = Math.hypot(l.obb.cx - centre.cx, l.obb.cz - centre.cz) < ring ? 'near' : 'outer'; let t = tiles.get(k); if (!t) tiles.set(k, (t = [])); t.push(l); }
  const body = bodyGeo(), gable = unitGable(), hip = unitHip(), shed = unitShed(), cap = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const facade = facadeMaterial(ctx, { instanced: true });
  const roofMat = ctx.mat.toon('#ffffff', { paint: 0.05, noDormant: true });   // [r3:7]
  // [sys:4] [sys:34] the stored shape, as every other LOD draws it (it was changed here: > 11 m or a factory -> flat, a small flat -> gable,
  // shed / saw -> gable); a derived one was resolved once in build-layout.js. Far has no saw-tooth instance: saw reads flat.
  const shapeOf = (l) => roofShapeAt(l, 'far');
  const roofCol = (l, sh) => (sh === 'flat' ? flatRoofOf(l) : pitchedRoofOf(l));
  const group = new THREE.Group(); group.name = 'town-far';
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  let count = 0, tris = 0;
  const where = new Map();   // [v4:explore] lot id -> [[instanced mesh, index], ...] (body + roof), for hide / show
  for (const tl of tiles.values()) {
    const cnt = { gable: 0, hip: 0, shed: 0, flat: 0 };
    for (const l of tl) cnt[shapeOf(l)]++;
    const bodies = new THREE.InstancedMesh(body, facade, tl.length);
    const fac = new Float32Array(tl.length * 4);
    const roofs = {};
    for (const k of ['gable', 'hip', 'shed', 'flat']) if (cnt[k]) roofs[k] = new THREE.InstancedMesh(k === 'gable' ? gable : k === 'hip' ? hip : k === 'shed' ? shed : cap, roofMat, cnt[k]);
    const fill = { gable: 0, hip: 0, shed: 0, flat: 0 };
    tl.forEach((l, i) => {
      // [sys:6] the body stands on baseY (the lowest terrain of the footprint) and rises to groundY + height: a plinth where they differ
      const o = l.obb, h = Math.max(2.6, l.height), top = l.groundY + h, base = Math.min(l.baseY ?? l.groundY, l.groundY) - 0.6;
      Q.setFromAxisAngle(Y, o.rotY);
      P.set(o.cx, base, o.cz); S.set(Math.max(1, o.w - 0.25), top - base, Math.max(1, o.d - 0.25));
      bodies.setMatrixAt(i, M4.compose(P, Q, S));
      where.set(l.id, [[bodies, i]]);
      bodies.setColorAt(i, col.set(wallOf(l)));
      fac[i * 4] = styleOf(l, false); fac[i * 4 + 1] = (l.seed % 997) / 997; fac[i * 4 + 2] = h; fac[i * 4 + 3] = 0;
      const sh = shapeOf(l), k = fill[sh]++;
      if (sh === 'flat') { P.set(o.cx, top, o.cz); S.set(o.w - 0.1, 0.35, o.d - 0.1); }
      else {
        const along = l.roof.ridge ? l.roof.ridge === 'x' : o.w >= o.d;   // [v4:data] the ridge measured on the aerial photo
        Q.setFromAxisAngle(Y, o.rotY + (along ? 0 : Math.PI / 2) + (sh === 'shed' && shedDirOf(l) < 0 ? Math.PI : 0));
        const Lr = along ? o.w : o.d, D = along ? o.d : o.w;
        P.set(o.cx, top, o.cz); S.set(Lr - 0.25, sh === 'shed' ? Math.min(1.6, D * 0.36) : Math.min(3.2, D * 0.32), D - 0.25);
      }
      roofs[sh].setMatrixAt(k, M4.compose(P, Q, S));
      where.get(l.id).push([roofs[sh], k]);
      roofs[sh].setColorAt(k, col.set(roofCol(l, sh)));
    });
    bodies.geometry = body.clone();
    bodies.geometry.setAttribute('aFac', new THREE.InstancedBufferAttribute(fac, 4));
    // tiles whose centre is beyond the drone shadow box (~700 m) do not cast shadows (saves the shadow pass)
    const cast = tl === tiles.get('near');
    for (const m of [bodies, ...Object.values(roofs)]) {
      m.castShadow = cast; m.receiveShadow = true;
      m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere(); m.computeBoundingBox?.();
      group.add(m);
      tris += m.count * (m.geometry.index ? m.geometry.index.count / 3 : m.geometry.attributes.position.count / 3);
    }
    count += tl.length;
  }
  // [r2:12] a lot with a sign tower (the AEON mall's magenta box, a landmark from afar) gets its two boxes here too; they follow the lot's hide / show
  const towers = new Map();
  for (const l of list) {
    const tw = LOT_TOWER[l.id]; if (!tw) continue;
    const o = l.obb, top = l.groundY + Math.max(2.6, l.height);
    const g = new THREE.Group(); g.name = 'far-sign-tower';
    for (const [w, h, y0, color] of [[tw.w * 0.92, tw.baseH, top + 0.4, tw.body], [tw.w, tw.signH, top + 0.4 + tw.baseH, tw.color]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, tw.d * (w / tw.w)), ctx.mat.toon(color, { paint: 0.02 }));
      m.position.set(tw.at[0], y0 + h / 2, tw.at[1]); m.rotation.y = o.rotY; m.castShadow = true; m.receiveShadow = true;
      g.add(m);
    }
    group.add(g); towers.set(l.id, g);
  }
  ctx.add(group);
  // [v4:explore] the streamed core replaces far instances with street-level buildings: hide(ids) collapses their
  // instance matrices (kept for show(ids)); the bounding spheres stay those of the whole ring
  const saved = new Map(), Z = new THREE.Matrix4().makeScale(0, 0, 0), tmp = new THREE.Matrix4();
  const setHidden = (ids, hide) => {
    const touched = new Set();
    for (const id of ids) {
      const tg = towers.get(id); if (tg) tg.visible = !hide;   // [r2:12]
      const w = where.get(id); if (!w || saved.has(id) === hide) continue;
      if (hide) { saved.set(id, w.map(([m, i]) => m.getMatrixAt(i, new THREE.Matrix4()))); for (const [m, i] of w) { m.setMatrixAt(i, Z); touched.add(m); } }
      else { const mats = saved.get(id); w.forEach(([m, i], j) => { m.setMatrixAt(i, mats[j] || tmp.identity()); touched.add(m); }); saved.delete(id); }
    }
    for (const m of touched) m.instanceMatrix.needsUpdate = true;
    return touched.size;
  };
  const api = { hide: (ids) => setHidden(ids, true), show: (ids) => setHidden(ids, false), has: (id) => where.has(id), hidden: (id) => saved.has(id), get hiddenCount() { return saved.size; } };
  if (ctx.services) ctx.services.farTown = api;
  return { count, tiles: tiles.size, tris: Math.round(tris), meshes: group.children.length };
}
