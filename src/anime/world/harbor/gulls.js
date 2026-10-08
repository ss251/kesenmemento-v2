// [v3:harbor] ウミネコ (black-tailed gulls): circling flocks over the harbour and gulls perched on bollards, masts,
// lamp posts and roofs. Three InstancedMeshes (body, left wing, right wing) for any number of gulls; transforms are a
// pure function of t (deterministic screenshots).
//
//   const gulls = buildGulls(ctx, {
//     flocks: [{ center: [x, y, z], radius: 40, count: 12, height: 6 }],   // circling / soaring groups
//     perches: [[x, y, z], ...], perchCount: 20,                              // sitting gulls (subset of perches)
//     seed });
//   -> { count, flying, perched, positions(t) }
// Life (or anyone) may call buildGulls again with other flocks; each call adds its own three draw calls.
import * as THREE from 'three';

const C = { white: '#f1f1ec', grey: '#b9bfca', dark: '#3f4351', beak: '#e9c24a', red: '#d9463b', leg: '#e2b04a', tail: '#3f4351' };

function colGeo(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}
function merge(list) {
  const gs = list.map((g) => { const x = g.index ? g.toNonIndexed() : g; x.deleteAttribute?.('uv'); return x; });
  let n = 0; for (const g of gs) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), Cc = new Float32Array(n * 3); let o = 0;
  for (const g of gs) { g.computeVertexNormals(); P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); Cc.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(P, 3)); m.setAttribute('normal', new THREE.BufferAttribute(N, 3)); m.setAttribute('color', new THREE.BufferAttribute(Cc, 3));
  return m;
}

function bodyGeo() {
  // body along +Z (forward), ~0.46 m long
  const body = colGeo(new THREE.SphereGeometry(0.1, 10, 7).scale(0.95, 0.9, 2.3), C.white);
  const head = colGeo(new THREE.SphereGeometry(0.075, 10, 7).translate(0, 0.07, 0.2), C.white);
  const beak = colGeo(new THREE.ConeGeometry(0.02, 0.09, 6).rotateX(Math.PI / 2).translate(0, 0.06, 0.3), C.beak);
  const tip = colGeo(new THREE.SphereGeometry(0.012, 5, 4).translate(0, 0.055, 0.34), C.red);
  const tail = colGeo(new THREE.ConeGeometry(0.07, 0.16, 5).rotateX(-Math.PI / 2).scale(1, 0.35, 1).translate(0, 0.01, -0.28), C.tail);
  const back = colGeo(new THREE.SphereGeometry(0.1, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2.4).scale(0.9, 0.5, 1.9).translate(0, 0.02, -0.02), C.grey);
  const legs = [-1, 1].map((sx) => colGeo(new THREE.CylinderGeometry(0.008, 0.008, 0.08, 4).translate(sx * 0.035, -0.11, 0.02), C.leg));
  return merge([body, head, beak, tip, tail, back, ...legs]);
}
function wingGeo(side) {
  // flat swept wing from the hinge (x=0) outward to +side*0.62, chord 0.2 -> 0.1, grey with a dark tip
  const P = [], Cc = [];
  const grey = new THREE.Color(C.grey), dark = new THREE.Color(C.dark), white = new THREE.Color(C.white);
  const seg = [[0, 0.1, -0.1, white], [0.28, 0.1, -0.12, grey], [0.5, 0.02, -0.14, grey], [0.64, -0.08, -0.16, dark]];
  for (let i = 0; i < seg.length - 1; i++) {
    const [x0, f0, b0, c0] = seg[i], [x1, f1, b1, c1] = seg[i + 1];
    const q = [[x0, 0, f0], [x1, 0, f1], [x1, 0, b1], [x0, 0, b0]].map(([x, y, z]) => [side * x, y, z]);
    const cols = [c0, c1, c1, c0];
    const tri = side > 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
    for (const t of tri) { P.push(...q[t]); Cc.push(cols[t].r, cols[t].g, cols[t].b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
  g.computeVertexNormals();
  return g;
}

export function buildGulls(ctx, opts = {}) {
  const r = ctx.rng(opts.seed ?? 'gulls');
  const flocks = opts.flocks || [];
  const perchPts = (opts.perches || []).map((p) => (Array.isArray(p) ? p : [p.x, p.y, p.z]));
  const q = ctx.quality?.name === 'low' ? 0.5 : 1;
  const birds = [];
  for (const f of flocks) {
    const n = Math.round((f.count ?? 10) * q);
    for (let i = 0; i < n; i++) birds.push({
      kind: 'fly', c: f.center, R: (f.radius ?? 40) * r.range(0.45, 1.15), h: (f.height ?? 6) * r.range(0.5, 1.5), dir: r.chance(0.8) ? 1 : -1,
      v: r.range(7, 10.5), ph: r() * Math.PI * 2, flapPh: r() * 10, wob: r.range(0.1, 0.35), drift: r.range(-0.2, 0.2),
    });
  }
  const perchN = Math.min(perchPts.length, Math.round((opts.perchCount ?? perchPts.length) * q));
  const idx = perchPts.map((_, i) => i); for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  for (let i = 0; i < perchN; i++) birds.push({ kind: 'sit', p: perchPts[idx[i]], yaw: r() * Math.PI * 2, ph: r() * 20 });
  const N = birds.length;
  const out = { count: N, flying: N - perchN, perched: perchN, birds };
  if (!N) return out;

  const mat = ctx.mat.toon('#ffffff', { vertexColors: true, paint: 0, side: 'double', noSnow: true });   // [v3:integrate] gulls never snow-capped
  const body = new THREE.InstancedMesh(bodyGeo(), mat, N);
  const wl = new THREE.InstancedMesh(wingGeo(1), mat, N);
  const wr = new THREE.InstancedMesh(wingGeo(-1), mat, N);
  for (const m of [body, wl, wr]) { m.frustumCulled = false; m.castShadow = true; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.name = 'gulls'; }
  const grp = new THREE.Group(); grp.name = 'gulls'; grp.add(body, wl, wr);
  ctx.add(grp);

  const M = new THREE.Matrix4(), Wm = new THREE.Matrix4(), H = new THREE.Matrix4(), Rz = new THREE.Matrix4();
  const e = new THREE.Euler(0, 0, 0, 'YXZ'), qt = new THREE.Quaternion(), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), sc = new THREE.Vector3(1, 1, 1);
  const pose = (b, t) => {
    if (b.kind === 'sit') {
      const bob = Math.sin(t * 1.3 + b.ph) > 0.93 ? 0.03 : 0;
      pos.set(b.p[0], b.p[1] + 0.1 + bob, b.p[2]);
      e.set(-0.18, b.yaw + Math.sin(t * 0.21 + b.ph) * 0.35, 0);
      // folded wings: small, tucked along the body
      return { flap: -1.45, fold: true };
    }
    const spread = b.spread || 1;
    const a = b.ph + b.dir * (b.v / b.R) * t;
    const x = b.c[0] + Math.cos(a) * b.R * spread + Math.sin(t * 0.05 + b.ph) * b.R * b.drift * spread;
    const z = b.c[2] + Math.sin(a) * b.R * spread;
    let y = b.c[1] + b.h + Math.sin(a * 2 + b.ph) * 2.2;
    if (b._ippon && b.dive > 0.4) {
      const s = Math.sin(t * 2.6 + b.ph);
      if (s > -0.25) {
        const k = Math.min(1, b.dive) * Math.min(1, (s + 0.25) * 0.85);
        y = y * (1 - k) + (0.28 + (b.ph % 1) * 0.55) * k;
      }
    } else if (b.dive > 0.4 && Math.sin(t * 2.1 + b.ph) > 0.45) y -= (6 + b.h) * Math.min(1, b.dive);
    pos.set(x, y, z);
    // heading = tangent of the circle
    const tx = -Math.sin(a) * b.dir, tz = Math.cos(a) * b.dir;
    e.set(-Math.cos(a * 2 + b.ph) * 0.12, Math.atan2(tx, tz), b.dir * (0.3 + b.wob));
    const burst = Math.sin(t * 0.37 + b.flapPh) > 0.35;
    const flap = burst ? Math.sin(t * 11 + b.flapPh * 3) * 0.75 : 0.12 + Math.sin(t * 1.7 + b.flapPh) * 0.06;
    return { flap, fold: false };
  };
  const update = (t) => {
    for (let i = 0; i < N; i++) {
      const b = birds[i];
      const { flap, fold } = pose(b, t);
      const s = b.s > 0 ? b.s : 1;
      if (s !== 1) sc.set(s, s, s);
      qt.setFromEuler(e); M.compose(pos, qt, s === 1 ? one : sc);
      body.setMatrixAt(i, M);
      for (const [mesh, s] of [[wl, 1], [wr, -1]]) {
        if (fold) {
          // folded: the wing lies along the body side, span pointing back, dark tips crossing over the tail
          H.makeTranslation(s * 0.06, 0.07, 0.08);
          Wm.multiplyMatrices(M, H).multiply(Rz.makeRotationY(s * (Math.PI / 2 - 0.16))).multiply(H.makeRotationZ(-s * 0.12)).multiply(H.makeScale(0.55, 1, 0.9));
        } else {
          H.makeTranslation(s * 0.07, 0.04, 0.03);
          Rz.makeRotationZ(s * flap);
          Wm.multiplyMatrices(M, H).multiply(Rz);
        }
        mesh.setMatrixAt(i, Wm);
      }
    }
    body.instanceMatrix.needsUpdate = wl.instanceMatrix.needsUpdate = wr.instanceMatrix.needsUpdate = true;
  };
  update(0);
  ctx.onUpdate((dt, t) => update(t));
  out.group = grp; out.update = update;
  out.positions = (t) => birds.map((b) => { pose(b, t); return [pos.x, pos.y, pos.z]; });
  return out;
}
