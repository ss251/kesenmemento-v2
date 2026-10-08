// [play] The player ウミネコ (body + two wings, so a flap reads) and a small
// instanced flock with the wings baked into a glide. Harbor gulls are a
// separate instanced set and are not rewritten.

import * as THREE from 'three';

const C = { white: '#f4f1ea', grey: '#b7c0c8', dark: '#3c434e', beak: '#e6c14a', red: '#d45348', leg: '#e2b04a', tail: '#3c434e' };

function paint(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

function merge(list) {
  const gs = list.map((g) => { const x = g.index ? g.toNonIndexed() : g; x.deleteAttribute?.('uv'); return x; });
  let n = 0;
  for (const g of gs) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), Cc = new Float32Array(n * 3);
  let o = 0;
  for (const g of gs) {
    g.computeVertexNormals();
    P.set(g.attributes.position.array, o * 3);
    N.set(g.attributes.normal.array, o * 3);
    Cc.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(P, 3));
  m.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  m.setAttribute('color', new THREE.BufferAttribute(Cc, 3));
  return m;
}

function bodyGeo() {
  const body = paint(new THREE.SphereGeometry(0.1, 10, 7).scale(0.95, 0.88, 2.25), C.white);
  const head = paint(new THREE.SphereGeometry(0.072, 10, 7).translate(0, 0.07, 0.2), C.white);
  const beak = paint(new THREE.ConeGeometry(0.018, 0.09, 6).rotateX(Math.PI / 2).translate(0, 0.055, 0.3), C.beak);
  const tip = paint(new THREE.SphereGeometry(0.011, 5, 4).translate(0, 0.05, 0.34), C.red);
  const tail = paint(new THREE.ConeGeometry(0.07, 0.16, 5).rotateX(-Math.PI / 2).scale(1, 0.32, 1).translate(0, 0.01, -0.28), C.tail);
  const back = paint(new THREE.SphereGeometry(0.1, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2.4).scale(0.9, 0.45, 1.85).translate(0, 0.02, -0.02), C.grey);
  return merge([body, head, beak, tip, tail, back]);
}

function wingGeo(side) {
  const P = [], Cc = [];
  const grey = new THREE.Color(C.grey), dark = new THREE.Color(C.dark), white = new THREE.Color(C.white);
  const seg = [[0, 0.1, -0.1, white], [0.28, 0.1, -0.12, grey], [0.5, 0.02, -0.14, grey], [0.62, -0.06, -0.15, dark]];
  for (let i = 0; i < seg.length - 1; i++) {
    const a = seg[i], b = seg[i + 1];
    const q = [[a[0], 0, a[1]], [b[0], 0, b[1]], [b[0], 0, b[2]], [a[0], 0, a[2]]].map(([x, y, z]) => [side * x, y, z]);
    const cols = [a[3], b[3], b[3], a[3]];
    const tri = side > 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
    for (const t of tri) { P.push(q[t][0], q[t][1], q[t][2]); Cc.push(cols[t].r, cols[t].g, cols[t].b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
  g.computeVertexNormals();
  return g;
}

function mat(ctx) {
  return ctx.mat.toon('#ffffff', { vertexColors: true, paint: 0, side: 'double', noSnow: true });
}

export function createBird(ctx) {
  const g = new THREE.Group();
  g.name = 'play-gull';
  const body = new THREE.Mesh(bodyGeo(), mat(ctx));
  const wingL = new THREE.Mesh(wingGeo(-1), mat(ctx));
  const wingR = new THREE.Mesh(wingGeo(1), mat(ctx));
  body.castShadow = wingL.castShadow = wingR.castShadow = false;
  g.add(body, wingL, wingR);
  g.visible = false;
  if (ctx.noOutline) ctx.noOutline(g);
  if (ctx.noBatch) ctx.noBatch(g);
  ctx.add(g);
  return { group: g, wingL, wingR };
}

/** flap and flare are 0..1 from wingPose. */
export function poseWings(bird, pose) {
  const flap = pose.flap || 0, flare = pose.flare || 0;
  const lift = -0.25 - flare * 0.7 + flap * 1.15;
  bird.wingL.rotation.z = lift;
  bird.wingR.rotation.z = -lift;
}

export function flockGeo() {
  const wingL = wingGeo(-1);
  wingL.rotateZ(-0.3);
  const wingR = wingGeo(1);
  wingR.rotateZ(0.3);
  return merge([bodyGeo(), wingL, wingR]);
}

export function createFlock(ctx, n) {
  const geo = flockGeo();
  const mesh = new THREE.InstancedMesh(geo, mat(ctx), n);
  mesh.name = 'play-gull-flock';
  mesh.count = n;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.visible = false;
  if (ctx.noOutline) ctx.noOutline(mesh);
  if (ctx.noBatch) ctx.noBatch(mesh);
  ctx.add(mesh);
  const dummy = new THREE.Object3D();
  return { mesh, dummy };
}

export function writeFlock(flock, birds) {
  const d = flock.dummy, m = flock.mesh;
  for (let i = 0; i < birds.length; i++) {
    const b = birds[i];
    d.position.set(b.x, b.y, b.z);
    d.rotation.set(0, b.yaw, b.roll || 0);
    d.updateMatrix();
    m.setMatrixAt(i, d.matrix);
  }
  m.instanceMatrix.needsUpdate = true;
}
