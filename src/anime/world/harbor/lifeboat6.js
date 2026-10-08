// [v6:fix2] The enclosed lifeboat on its trailer, on C棟's roof deck (IMG_0793; the stencil on its hull reads 5.30 x 2.30 x 1.00).
// Built as lofts from the photographed form: a round-bowed hull with a tumblehome sheer and a navy rub rail, a full-length canopy
// deckhouse with a bow dome and a handrail, the raised coxswain's tower with its two windows, two silver-framed hatches a side
// (the first with the grey cross, the second with its latch) and a trailer cradle on four castors. Orange-red as photographed.
// The boat's sheer edge cut on its own height in IMG_0793 puts its west flank at off 13.6 from s 84.5 to 88.3 (3.6 deg off the
// wall line); the bow dome starts at s 84.0 and the boat runs south, 5.3 m, its stern beyond the frame edge.
import * as THREE from 'three';

/** Loft a closed polygon section along z. stations: [{ z, pts: [[x, y], ...] }] (same point count). Faces wound outward for a
 *  section listed anticlockwise seen from +z... the caller lists it left-bottom -> up -> right -> down (clockwise from +z). */
export function loftSections(stations, { capEnds = true } = {}) {
  const pos = [], q = (a, b, c, d) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  const n = stations[0].pts.length;
  const P = (s, j) => [s.pts[j % n][0], s.pts[j % n][1], s.z];
  for (let i = 0; i < stations.length - 1; i++) {
    const A = stations[i], B = stations[i + 1];
    for (let j = 0; j < n; j++) q(P(A, j), P(B, j), P(B, j + 1), P(A, j + 1));
  }
  if (capEnds) for (const [i, dir] of [[0, -1], [stations.length - 1, 1]]) {
    const S = stations[i], cx = S.pts.reduce((a, p) => a + p[0], 0) / n, cy = S.pts.reduce((a, p) => a + p[1], 0) / n;
    for (let j = 0; j < n; j++) { const a = P(S, j), b = P(S, j + 1), c = [cx, cy, S.z]; pos.push(...(dir > 0 ? [...c, ...b, ...a] : [...c, ...a, ...b])); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
}

export function buildLifeboat(ctx, K, y, LB) {
  const t = (c, o) => ctx.mat.toon(c, o);
  const m = { orange: t(LB.color || '#e0432b', { paint: 0.03 }), navy: t('#27345a', { paint: 0.02 }), steel: t('#aeb5bb', { paint: 0 }), black: t('#26272a', { paint: 0 }), win: t('#2b3640', { paint: 0 }), grey: t('#8e949a', { paint: 0 }), tape: t('#8c8f78', { paint: 0 }) };
  const g = new THREE.Group(); g.position.set(LB.off, y, LB.bow); g.rotation.y = (LB.tilt || 0) * Math.PI / 180; K.parent.add(g);   // local x = off, z = s: z along the boat, bow at 0
  const add = (geo, mat, pos, rot) => { const mm = new THREE.Mesh(geo, mat); if (pos) mm.position.set(...pos); if (rot) mm.rotation.set(...rot); mm.castShadow = true; mm.receiveShadow = true; g.add(mm); return mm; };
  const L = LB.L, hwMax = LB.B / 2, sh = LB.sheer, kl = LB.keel, cTop = LB.canopy - 0.12, tTop = LB.top;
  const bowL = 0.95, sternL = 0.9;
  const hw = (z) => z < bowL ? hwMax * Math.sqrt(Math.max(0, 1 - ((bowL - z) / bowL) ** 2)) : z > L - sternL ? hwMax * (1 - 0.3 * ((z - (L - sternL)) / sternL) ** 2) : hwMax;
  const keelY = (z) => z < bowL ? kl + 0.38 * ((bowL - z) / bowL) ** 2 : z > L - sternL ? kl + 0.5 * ((z - (L - sternL)) / sternL) ** 2 : kl;
  const zs = []; for (let z = 0; z <= bowL + 1e-6; z += 0.12) zs.push(z); for (let z = bowL + 0.5; z < L - sternL; z += 0.8) zs.push(z); for (let z = L - sternL; z <= L + 1e-6; z += 0.15) zs.push(Math.min(z, L));
  const Z = [...new Set(zs.map((v) => +v.toFixed(3)))].sort((a, b) => a - b);
  // hull below the sheer: bottom, bilge, sheer (tumblehome: the sheer is 0.04 m inside the widest point)
  add(loftSections(Z.map((z) => { const w = Math.max(hw(z), 0.04), yk = keelY(z), kw = w * 0.4; return { z, pts: [[-kw, yk], [-w * 0.9, yk + 0.3 * (sh - yk)], [-w, sh - 0.12], [-w * 0.98, sh], [w * 0.98, sh], [w, sh - 0.12], [w * 0.9, yk + 0.3 * (sh - yk)], [kw, yk]] }; })), m.orange);
  // canopy deckhouse above the sheer: the bow dome rises to the canopy top, a flat run, a lower stern
  const cy = (z) => z < 1.5 ? sh + (cTop - sh) * Math.sqrt(Math.max(0, 1 - ((1.5 - z) / 1.5) ** 2)) : z > L - 0.7 ? cTop - 0.35 * ((z - (L - 0.7)) / 0.7) : cTop;
  const cs = Z.filter((z) => z > 0.05 && z < L - 0.05).map((z) => { const w = Math.max(hw(z) * 0.93, 0.05), top = Math.max(cy(z), sh + 0.02); return { z, pts: [[-w, sh], [-w, sh + (top - sh) * 0.55], [-w * 0.72, top], [w * 0.72, top], [w, sh + (top - sh) * 0.55], [w, sh]] }; });
  add(loftSections(cs), m.orange);
  // the coxswain's tower: a tapered box with a sloped front, on the canopy
  const tz = LB.tower;   // [z0, z1]
  const tw = (yy) => 0.95 - 0.33 * (yy - cTop) / Math.max(tTop - cTop, 0.1);
  add(loftSections([[tz[0], tTop - 0.28], [tz[0] + 0.3, tTop], [tz[1] - 0.25, tTop], [tz[1], tTop - 0.3]].map(([z, top]) => ({ z, pts: [[-0.97, cTop - 0.05], [-tw(top), top], [tw(top), top], [0.97, cTop - 0.05]] }))), m.orange);
  // navy rub rail at the sheer, stainless handrails
  for (const sd of [-1, 1]) {
    add(new THREE.BoxGeometry(0.09, 0.1, L - 1.3), m.navy, [sd * (hwMax * 0.99), sh - 0.04, bowL + (L - 1.3) / 2 - 0.1]);
    add(new THREE.CylinderGeometry(0.018, 0.018, 3.2, 6), m.steel, [sd * (hwMax * 0.93 + 0.03), cTop - 0.2, 2.3], [Math.PI / 2, 0, 0]);
    // the first hatch (grey cross) and the second (latch), silver frames
    for (const [zz, yy, w, h, cross] of [[1.45, sh + 0.42, 0.56, 0.52, true], [3.3, sh + 0.36, 0.5, 0.74, false]]) {
      const x = sd * (hwMax * 0.93 + 0.01);
      add(new THREE.BoxGeometry(0.04, h, w), m.steel, [x, yy, zz]); add(new THREE.BoxGeometry(0.05, h - 0.1, w - 0.1), m.orange, [x, yy, zz]);
      if (cross) { add(new THREE.BoxGeometry(0.06, 0.26, 0.05), m.grey, [x + sd * 0.01, yy, zz]); add(new THREE.BoxGeometry(0.06, 0.05, 0.26), m.grey, [x + sd * 0.01, yy, zz]); }
      else add(new THREE.BoxGeometry(0.1, 0.34, 0.2), m.steel, [x + sd * 0.04, yy - 0.18, zz + 0.22]);
    }
    // two tower windows near the top, the larger with a white sail mark
    for (const [zz, w, h] of [[tz[0] + 0.55, 0.32, 0.3], [tz[0] + 1.2, 0.46, 0.34]]) add(new THREE.BoxGeometry(0.05, h, w), m.win, [sd * (tw(tTop - 0.15) - 0.01), tTop - 0.2, zz]);
    for (const zz of [1.9, 2.8]) add(new THREE.BoxGeometry(0.03, 0.05, 0.36), m.tape, [sd * (hwMax * 0.93 + 0.02), sh + 0.42, zz]);
  }
  // the trailer: a steel cradle under the keel on four castors
  const ct = (LB.trailer || [0.3, 4.4]);
  add(new THREE.BoxGeometry(1.5, 0.1, ct[1] - ct[0]), m.steel, [0, kl - 0.08, (ct[0] + ct[1]) / 2]);
  for (const sd of [-1, 1]) {
    add(new THREE.BoxGeometry(0.1, 0.12, ct[1] - ct[0] + 0.3), m.steel, [sd * 0.7, 0.3, (ct[0] + ct[1]) / 2]);
    for (const zz of [ct[0] + 0.15, ct[1] - 0.15]) add(new THREE.CylinderGeometry(0.14, 0.14, 0.1, 10), m.black, [sd * 0.75, 0.14, zz], [0, 0, Math.PI / 2]);
  }
  return g;
}
