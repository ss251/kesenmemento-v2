// [v3:fix] Bridge extras for かなえ大橋 (and any deck): where the deck meets a hillside, a tunnel portal with wing walls
// (the deck used to run straight into the slope right past the far pylon); and light traffic on the deck, cars and
// trucks gliding along both lanes as a pure function of t (deterministic for stills), headlights / tail lights at night.
import * as THREE from 'three';
import { nightMat } from './lights.js';

export function bridgeExtras(ctx, br, opts = {}) {
  if (!br?.deck?.length) return null;
  const L = ctx.L, pts = br.deck.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  const width = opts.width ?? 13;
  const out = { portals: 0, cars: 0 };
  // ---- cumulative lengths along the deck
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const total = cum[cum.length - 1];
  const at = (s, o = new THREE.Vector3(), tan = null) => {
    s = Math.max(0, Math.min(total, s));
    let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
    const t = (s - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
    o.lerpVectors(pts[i - 1], pts[i], t);
    if (tan) tan.subVectors(pts[i], pts[i - 1]).normalize();
    return o;
  };

  // ---- tunnel portals where the terrain at a deck end reaches the deck
  const concrete = ctx.mat.toon('#c9c6bc', { paint: 0.08 }), dark = ctx.mat.toon('#34313f', { paint: 0 }), trim = ctx.mat.toon('#a9a69d', { paint: 0.05 });
  const portalLamp = nightMat(ctx, '#d8d6cc', '#ffcf8a', 2.0);
  const portals = [];
  for (const end of [0, 1]) {
    const p = end ? pts[pts.length - 1] : pts[0];
    const q = end ? pts[pts.length - 2] : pts[1];
    const dir = new THREE.Vector3().subVectors(p, q).setY(0).normalize();   // outward along the axis
    const ahead = L.heightAt(p.x + dir.x * 12, p.z + dir.z * 12);
    if (ahead < p.y - 2.5) continue;   // the deck ends in the air: the abutment handles it
    const g = new THREE.Group(); g.name = 'kanae-portal';
    g.position.set(p.x - dir.x * 1.5, p.y - 0.3, p.z - dir.z * 1.5); g.rotation.y = Math.atan2(dir.x, dir.z);
    const k = ctx.kit(g);
    const W = width + 4, H = 10.5;
    // headwall with the tunnel mouth (a dark arch recessed behind the face)
    const face = new THREE.Shape([[-W / 2 - 3, -6], [W / 2 + 3, -6], [W / 2 + 3, H], [-W / 2 - 3, H]].map(([x, y]) => new THREE.Vector2(x, y)));
    const hole = new THREE.Path(); const R = width / 2 + 0.8;
    hole.moveTo(-R, 0); hole.lineTo(-R, 4.2); hole.absarc(0, 4.2, R, Math.PI, 0, true); hole.lineTo(R, 0); hole.lineTo(-R, 0);
    face.holes.push(hole);
    const fg = new THREE.ExtrudeGeometry(face, { depth: 1.6, bevelEnabled: false, curveSegments: 18 });
    k.mesh(fg, concrete, [0, 0, -0.8]);
    k.box(W + 6.6, 0.7, 2.2, trim, [0, H + 0.35, 0]);
    // the bore: a dark half-tube going into the hill
    const bore = new THREE.CylinderGeometry(R, R, 26, 20, 1, true).rotateX(Math.PI / 2);
    k.mesh(bore, ctx.mat.toon('#3a3746', { paint: 0, side: 'double' }), [0, 4.2, 13]);
    k.box(2 * R, 4.2, 26, dark, [0, 2.1, 13]);
    k.box(2 * R - 0.2, 4.1, 0.2, dark, [0, 2.05, 24]);
    // wing walls splayed into the slope
    for (const s of [-1, 1]) k.box(1.2, H - 1, 16, concrete, [s * (W / 2 + 6), (H - 1) / 2 - 3, -6], [0, s * 0.45, 0]);
    // tunnel lights inside the mouth (a warm row, lit at night)
    for (let z = 2; z < 22; z += 4) k.box(0.5, 0.15, 0.9, portalLamp, [0, 4.2 + R - 0.5, z]);
    ctx.addStatic(g);
    portals.push({ end, s: end ? total - 1.5 : 1.5 });
    out.portals++;
  }

  // ---- traffic: two lanes, a few cars and a truck each way, looping between the ends (they vanish into the portals)
  const low = ctx.quality?.name === 'low';
  const n = opts.cars ?? (low ? 6 : 14);
  const r = ctx.rng('kanae-traffic');
  const bodyCols = ['#e8e6df', '#3f4a63', '#b8433a', '#d8d9d4', '#6f7c8a', '#2f3440', '#e2b54a', '#f1efe8'];
  const carGeo = (() => {
    const b = new THREE.BoxGeometry(1.8, 0.75, 4.3).translate(0, 0.62, 0);
    const c = new THREE.BoxGeometry(1.6, 0.6, 2.2).translate(0, 1.28, -0.2);
    const parts = [b, c].map((g) => g.toNonIndexed());
    const pos = [], nor = [];
    for (const g of parts) { pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    return g;
  })();
  const truckGeo = new THREE.BoxGeometry(2.3, 3.0, 9.0).translate(0, 1.9, 0);
  const cars = [];
  for (let i = 0; i < n; i++) {
    const dirn = i % 2 ? 1 : -1, truck = i % 5 === 4;
    cars.push({ dirn, truck, lane: dirn * 1.9, speed: r.range(14, 19) * (truck ? 0.8 : 1), phase: r() * total, col: r.pick(bodyCols) });
  }
  const mk = (geo, list) => {
    if (!list.length) return null;
    const m = new THREE.InstancedMesh(geo, ctx.mat.toon('#ffffff', { paint: 0.02 }), list.length);
    const col = new THREE.Color();
    list.forEach((c, i) => m.setColorAt(i, col.set(c.truck ? '#e9e9e2' : c.col)));
    m.instanceColor.needsUpdate = true; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; m.name = 'kanae-traffic';
    ctx.add(m); return m;
  };
  const carsL = cars.filter((c) => !c.truck), trucks = cars.filter((c) => c.truck);
  const mc = mk(carGeo, carsL), mt = mk(truckGeo, trucks);
  // lights: 2 head (front) + 2 tail (rear) per vehicle; night-driven
  const lightGeo = new THREE.BoxGeometry(0.34, 0.18, 0.08);
  const head = new THREE.InstancedMesh(lightGeo, nightMat(ctx, '#e9e6da', '#fff2cf', 3.2), cars.length * 2);
  const tail = new THREE.InstancedMesh(lightGeo, nightMat(ctx, '#9b3a35', '#ff3a2a', 2.8, { always: 0.2 }), cars.length * 2);
  for (const im of [head, tail]) { im.frustumCulled = false; im.castShadow = false; ctx.noOutline(im); ctx.add(im); }
  const P = new THREE.Vector3(), T = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1), M4 = new THREE.Matrix4(), E = new THREE.Euler(), lp = new THREE.Vector3();
  const place = (t) => {
    let ic = 0, it = 0;
    cars.forEach((c, i) => {
      const span = total - 6;
      let s = ((c.phase + t * c.speed) % span + span) % span;
      if (c.dirn < 0) s = span - s;
      s += 3;
      at(s, P, T);
      const fwd = c.dirn > 0 ? T : T.clone().negate();
      const yaw = Math.atan2(fwd.x, fwd.z), pitch = -Math.asin(Math.max(-1, Math.min(1, fwd.y)));
      // lane offset: to the right of travel
      P.x += Math.cos(yaw) * c.lane * c.dirn; P.z -= Math.sin(yaw) * c.lane * c.dirn; P.y += 0.1;
      E.set(pitch, yaw, 0, 'YXZ'); Q.setFromEuler(E);
      M4.compose(P, Q, S);
      if (c.truck) mt.setMatrixAt(it++, M4); else mc.setMatrixAt(ic++, M4);
      const half = c.truck ? 4.55 : 2.2, hy = c.truck ? 0.9 : 0.7;
      for (const [im, zz] of [[head, half], [tail, -half]]) for (const sx of [-0.62, 0.62]) {
        lp.set(sx, hy, zz).applyQuaternion(Q).add(P);
        M4.compose(lp, Q, S); im.setMatrixAt(i * 2 + (sx > 0 ? 1 : 0), M4);
      }
    });
    if (mc) mc.instanceMatrix.needsUpdate = true; if (mt) mt.instanceMatrix.needsUpdate = true;
    head.instanceMatrix.needsUpdate = true; tail.instanceMatrix.needsUpdate = true;
  };
  place(0);
  ctx.onUpdate((dt, t) => place(t));
  out.cars = cars.length;
  return out;
}
