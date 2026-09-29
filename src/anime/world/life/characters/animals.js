// [v3:life] Adapted from Kenton-GMI/sakuragaoka-station (MIT, raw/ref/sakuragaoka-station/LICENSE), src/world/characters/animals.js.
// Cats (white on the W3 wall, calico curled on the ring bench, black by the V5 bench) and sparrows
// (little groups on the street wires + a few hopping on the plaza). Skinned like the people: one
// mesh per animal, bones for head / ears / tail / wings, poses as functions of t.
import * as THREE from 'three';
import { surface, sweep, curve, ellipsoid, limb, rings, SkinBuilder, TAU, DEG, clamp, lerp, smooth, wave } from './skin.js';
import { faceUV, FACE } from './atlas.js';
import { rot, rotMul } from './anim.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const S2 = 512;

// ------------------------------------------------------------------ cat atlas (face Q0, fur patches Q2)
function catAtlas(ctx, key, o) {
  return ctx.tex.draw(S2, S2, (g) => {
    g.fillStyle = '#ffffff'; g.fillRect(256, 0, 256, 512);
    // ---- face
    const Q = 256;
    const fx = (ph) => (ph - FACE.p0) / (FACE.p1 - FACE.p0) * Q, fy = (th) => (FACE.t1 - th) / (FACE.t1 - FACE.t0) * Q;
    g.fillStyle = o.fur; g.fillRect(0, 0, Q, Q);
    if (o.facePatch) { g.fillStyle = o.facePatch; g.beginPath(); g.ellipse(fx(-30), fy(35), 60, 38, 0.3, 0, TAU); g.fill(); g.fillStyle = o.facePatch2 || o.facePatch; g.beginPath(); g.ellipse(fx(38), fy(30), 42, 30, -0.3, 0, TAU); g.fill(); }
    if (o.muzzle) { g.fillStyle = o.muzzle; g.beginPath(); g.ellipse(fx(0), fy(-30), 44, 30, 0, 0, TAU); g.fill(); }
    for (const s of [-1, 1]) {
      const ex = fx(s * 29), ey = fy(o.eyeT ?? 0);
      const w = 22, h = o.closed ? 3 : 17;
      if (o.closed) {
        g.strokeStyle = o.ink; g.lineWidth = 2.6; g.lineCap = 'round';
        g.beginPath(); g.moveTo(ex - w * 0.55, ey - 2); g.quadraticCurveTo(ex, ey + 6, ex + w * 0.55, ey - 2); g.stroke();
        continue;
      }
      g.save();
      g.beginPath(); g.ellipse(ex, ey, w * 0.6, h * 0.62, s * 0.12, 0, TAU); g.fillStyle = o.eye; g.fill();
      g.clip();
      const gr = g.createLinearGradient(0, ey - h, 0, ey + h); gr.addColorStop(0, o.eyeDark); gr.addColorStop(1, o.eye);
      g.fillStyle = gr; g.fillRect(ex - w, ey - h, w * 2, h * 2);
      g.fillStyle = o.ink; g.beginPath(); g.ellipse(ex + 1, ey + 1, o.pupil ?? 3.2, h * 0.55, 0, 0, TAU); g.fill();
      g.fillStyle = '#f6f3ef'; g.beginPath(); g.ellipse(ex + 4, ey - 4, 3.2, 2.6, 0, 0, TAU); g.fill();
      g.restore();
      g.strokeStyle = o.ink; g.lineWidth = 2.4; g.beginPath(); g.ellipse(ex, ey, w * 0.6, h * 0.62, s * 0.12, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
      g.lineWidth = 1.5; g.beginPath(); g.ellipse(ex, ey, w * 0.6, h * 0.62, s * 0.12, 0.1, Math.PI * 0.9); g.stroke();
    }
    // nose + mouth ω
    const nx = fx(0), ny = fy(-19);
    g.fillStyle = o.nose; g.beginPath(); g.moveTo(nx - 5, ny - 3); g.lineTo(nx + 5, ny - 3); g.lineTo(nx, ny + 3); g.closePath(); g.fill();
    g.strokeStyle = o.ink; g.lineWidth = 1.5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(nx, ny + 3); g.lineTo(nx, ny + 7); g.moveTo(nx, ny + 7); g.quadraticCurveTo(nx - 4, ny + 12, nx - 8, ny + 8); g.moveTo(nx, ny + 7); g.quadraticCurveTo(nx + 4, ny + 12, nx + 8, ny + 8); g.stroke();
    // whisker dots + whiskers
    g.globalAlpha = 0.55; g.lineWidth = 1;
    for (const s of [-1, 1]) { for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(nx + s * 12, ny + 4 + i * 3); g.lineTo(nx + s * (34 + i * 2), ny + i * 6 - 2); g.stroke(); } }
    g.globalAlpha = 1;
    // ---- fur (Q2: 0..256 x 256..512), tileable blobs
    g.fillStyle = o.fur; g.fillRect(0, 256, 256, 256);
    if (o.patches) {
      g.save(); g.beginPath(); g.rect(0, 256, 256, 256); g.clip();
      const r = ctx.rng(key);
      for (const [col, n, size] of o.patches) {
        g.fillStyle = col;
        for (let i = 0; i < n; i++) {
          const x = r() * 256, y = 256 + r() * 256, rx = size * (0.6 + r() * 0.8), ry = size * (0.5 + r() * 0.6), a = r() * Math.PI;
          for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) { g.beginPath(); g.ellipse(x + ox, y + oy, rx, ry, a, 0, TAU); g.fill(); }
        }
      }
      g.restore();
    }
    if (o.stripes) { g.globalAlpha = 0.25; g.fillStyle = o.stripes; for (let i = 0; i < 8; i++) g.fillRect(0, 256 + i * 32 + 8, 256, 8); g.globalAlpha = 1; }
  }, { key: 'cat|' + key + (o.closed ? '|c' : '') });
}
const furUV = (u, v, ox = 0, oy = 0, sc = 1) => {
  const uu = ((u * sc + ox) % 1 + 1) % 1, vv = ((v * sc + oy) % 1 + 1) % 1;
  return [0.004 + uu * 0.492, 0.004 + vv * 0.492];
};

// ------------------------------------------------------------------ cat builder
export function makeCat(ctx, key, o) {   // [v3:life] exported
  const B = new SkinBuilder('cat_' + key);
  const group = new THREE.Group(); group.name = 'cat_' + key;
  const k = o.scale ?? 1;
  const bn = {};
  bn.root = B.bone('root', null, 0, 0, 0); group.add(bn.root);
  const pose = o.pose; // 'sit' | 'loaf' | 'curl'
  const fur = o.fur;
  const tex = (ox, oy, sc = 1) => (lx, ly, lz, u, v) => furUV(u, v, ox, oy, sc);
  const addFur = (g, bone, ox = 0, oy = 0, sc = 1, weights) => B.add(g, { bone, color: '#ffffff', uvFn: tex(ox, oy, sc), weights });
  let headPos, tailPts;
  if (pose === 'sit') {
    bn.body = B.bone('body', bn.root, 0, 0.1 * k, 0);
    bn.chest = B.bone('chest', bn.body, 0, 0.09 * k, 0.05 * k);
    headPos = [0, 0.285 * k, 0.07 * k];
    bn.neck = B.bone('neck', bn.chest, 0, headPos[1] - 0.19 * k - 0.02 * k, headPos[2] - 0.05 * k);
    addFur(ellipsoid(0.085 * k, 0.085 * k, 0.1 * k, [0, -0.015 * k, -0.045 * k], 14, 9), bn.body, 0, 0, 1);            // haunches
    addFur(ellipsoid(0.066 * k, 0.11 * k, 0.07 * k, [0, 0.045 * k, 0.0], 14, 9, (x, y, z) => [x, y, z + y * 0.35]), bn.body, 0.3, 0.2);  // upright torso
    addFur(ellipsoid(0.056 * k, 0.07 * k, 0.052 * k, [0, 0.0, 0.03 * k], 12, 8), bn.chest, 0.55, 0.5);   // chest
    for (const s of [1, -1]) {
      addFur(ellipsoid(0.038 * k, 0.062 * k, 0.07 * k, [s * 0.058 * k, -0.035 * k, -0.02 * k], 10, 7), bn.body, 0.2 + s * 0.1, 0.7);   // hind thighs
      addFur(ellipsoid(0.02 * k, 0.012 * k, 0.045 * k, [s * 0.052 * k, -0.092 * k, 0.045 * k], 8, 6), bn.body, 0.1, 0.1);              // hind paws
      const fl = limb(0.17 * k, 0.019 * k, 0.015 * k, { cols: 8 });
      B.add(fl, { bone: bn.chest, color: '#ffffff', uvFn: tex(0.6, 0.3), matrix: new THREE.Matrix4().makeRotationX(-0.06).setPosition(s * 0.03 * k, -0.005 * k, 0.05 * k) });
      addFur(ellipsoid(0.019 * k, 0.012 * k, 0.026 * k, [s * 0.031 * k, -0.18 * k, 0.07 * k], 8, 6), bn.chest, 0.6, 0.3);
    }
    tailPts = o.tail || [[0, -0.09 * k, -0.13 * k], [0.06 * k, -0.095 * k, -0.12 * k], [0.1 * k, -0.095 * k, -0.04 * k], [0.09 * k, -0.095 * k, 0.05 * k], [0.05 * k, -0.09 * k, 0.1 * k]];
  } else if (pose === 'loaf') {
    bn.body = B.bone('body', bn.root, 0, 0.075 * k, 0);
    bn.chest = B.bone('chest', bn.body, 0, 0.01 * k, 0.07 * k);
    headPos = [0, 0.16 * k, 0.12 * k];
    bn.neck = B.bone('neck', bn.chest, 0, headPos[1] - 0.085 * k - 0.03 * k, headPos[2] - 0.07 * k - 0.02 * k);
    addFur(ellipsoid(0.075 * k, 0.07 * k, 0.16 * k, [0, 0.0, -0.02 * k], 14, 9, (x, y, z) => [x, y < -0.04 * k ? -0.04 * k + (y + 0.04 * k) * 0.3 : y, z]), bn.body, 0, 0, 1);
    addFur(ellipsoid(0.065 * k, 0.06 * k, 0.06 * k, [0, 0.0, 0.03 * k], 12, 8), bn.chest, 0.5, 0.5);
    for (const s of [1, -1]) addFur(ellipsoid(0.02 * k, 0.012 * k, 0.03 * k, [s * 0.03 * k, -0.065 * k, 0.075 * k], 8, 6), bn.chest, 0.6, 0.2); // tucked paws peeking
    tailPts = o.tail || [[0, -0.02 * k, -0.17 * k], [-0.06 * k, -0.05 * k, -0.16 * k], [-0.085 * k, -0.07 * k, -0.06 * k], [-0.08 * k, -0.072 * k, 0.04 * k], [-0.055 * k, -0.072 * k, 0.1 * k]];
  } else { // curl: a round "bean" seen from above, head tucked on the paws at the open side, tail wrapped round
    bn.body = B.bone('body', bn.root, 0, 0.062 * k, 0);
    bn.chest = B.bone('chest', bn.body, 0.02 * k, 0, 0.08 * k);
    headPos = [0.075 * k, 0.07 * k, 0.15 * k];
    bn.neck = B.bone('neck', bn.chest, 0.02 * k, 0.0, 0.03 * k);
    const bean = (x, y, z) => [x + 1.5 * z * z / k, y < -0.035 * k ? -0.035 * k + (y + 0.035 * k) * 0.35 : y, z];
    addFur(ellipsoid(0.118 * k, 0.074 * k, 0.165 * k, [-0.02 * k, 0, -0.01 * k], 16, 10, bean), bn.body, 0, 0, 1);            // curled back
    addFur(ellipsoid(0.082 * k, 0.07 * k, 0.085 * k, [-0.045 * k, 0.008 * k, -0.095 * k], 12, 8), bn.body, 0.35, 0.6);          // haunch
    addFur(ellipsoid(0.07 * k, 0.058 * k, 0.07 * k, [0.0, -0.004 * k, 0.1 * k], 12, 8), bn.body, 0.6, 0.3);                     // shoulders
    for (const s2 of [1, -1]) addFur(ellipsoid(0.02 * k, 0.014 * k, 0.036 * k, [0.06 * k + s2 * 0.026 * k, -0.052 * k, 0.17 * k], 8, 6), bn.body, 0.6, 0.2); // front paws
    addFur(ellipsoid(0.026 * k, 0.018 * k, 0.04 * k, [0.1 * k, -0.05 * k, -0.12 * k], 8, 6), bn.body, 0.2, 0.8);                // hind paw peeking out
    tailPts = o.tail || [[-0.09 * k, -0.035 * k, -0.15 * k], [0.0, -0.03 * k, -0.2 * k], [0.12 * k, -0.03 * k, -0.155 * k], [0.185 * k, -0.03 * k, -0.02 * k], [0.17 * k, -0.03 * k, 0.1 * k], [0.12 * k, -0.028 * k, 0.19 * k]];
  }
  // ---- head (painted face) + ears
  bn.head = B.bone('head', bn.neck, headPos[0] - B.bindPos(bn.neck)[0], headPos[1] - B.bindPos(bn.neck)[1], headPos[2] - B.bindPos(bn.neck)[2]);
  const hk2 = 1.1, hr = [0.058 * k * hk2, 0.05 * k * hk2, 0.052 * k * hk2];
  const hg = surface(24, 16, (u, v) => {
    const ph = (u - 0.5) * TAU, th = (0.5 - v) * Math.PI;
    let x = Math.sin(ph) * Math.cos(th) * hr[0], y = Math.sin(th) * hr[1], z = Math.cos(ph) * Math.cos(th) * hr[2];
    const m = Math.exp(-((ph / (28 * DEG)) ** 2) - (((th + 24 * DEG) / (20 * DEG)) ** 2));
    z += m * 0.016 * k; y -= m * 0.004 * k;
    if (y < 0) x *= 1 + 0.12 * Math.cos(ph) * (1 + y / hr[1]); // cheek fluff
    return [x, y, z];
  });
  { const uv = hg.attributes.uv; for (let i = 0; i < uv.count; i++) { const f = faceUV((uv.getX(i) - 0.5) * 360, (0.5 - uv.getY(i)) * 180); uv.setXY(i, f[0], f[1]); } }
  B.add(hg, { bone: bn.head, color: '#ffffff', rect: [0, 0, 1, 1] });
  for (const s of [1, -1]) {
    const eb = B.bone('ear' + (s > 0 ? 'L' : 'R'), bn.head, s * 0.033 * k, 0.042 * k, -0.004 * k);
    bn['ear' + (s > 0 ? 'L' : 'R')] = eb;
    const cone = (r, h, zOff, col) => {
      const gg = new THREE.ConeGeometry(r, h, 8, 1, true); gg.translate(0, h / 2, 0);
      gg.scale(1, 1, 0.45); const m4 = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-0.12, 0, -s * 0.32)); m4.setPosition(0, 0, zOff);
      B.add(gg, { bone: eb, color: col, matrix: m4, uvFn: col === '#ffffff' ? (lx, ly, lz, u, v) => furUV(u * 0.2 + 0.4, v * 0.2 + 0.1) : undefined });
    };
    cone(0.026 * k, 0.05 * k, 0, '#ffffff');
    cone(0.017 * k, 0.036 * k, 0.006 * k, o.earIn || '#e9b3b8');
  }
  // ---- tail: sweep + a bone chain along it
  const tp = curve(tailPts.map(p => [p[0], p[1] + B.bindPos(bn.body)[1], p[2]]), 12);
  const tb = [];
  const nb = 5;
  let parent = bn.body, prev = B.bindPos(bn.body);
  for (let i = 0; i < nb; i++) {
    const p = tp[Math.round(i / nb * (tp.length - 1))];
    const b = B.bone('tail' + i, parent, p.x - prev[0], p.y - prev[1], p.z - prev[2]);
    tb.push(b); parent = b; prev = [p.x, p.y, p.z];
  }
  const tg = sweep(tp.map(p => p.clone().sub(V(...B.bindPos(bn.body)))), (s) => (o.tailW ?? 0.034) * k * (1 - 0.45 * s) * (s > 0.92 ? 0.7 : 1), (s) => (o.tailW ?? 0.034) * k * (1 - 0.45 * s), () => V(0, 1, 0), 6);
  const sA = tg.userData.s;
  B.add(tg, { bone: bn.body, color: '#ffffff', uvFn: (lx, ly, lz, u, v) => furUV(v * 0.5 + 0.3, u * 0.3, 0, 0), colorFn: o.tailTip ? (x, y, z, s) => (s > 0.8 ? o.tailTip : '#ffffff') : undefined,
    weights: (lx, ly, lz, s) => { const f = s * nb - 0.3; const i0 = clamp(Math.floor(f), 0, nb - 1), fr = clamp(f - i0, 0, 1); if (f < 0) return [[bn.body, 1 + f], [tb[0], -f]]; return i0 >= nb - 1 ? [[tb[nb - 1], 1]] : [[tb[i0], 1 - fr], [tb[i0 + 1], fr]]; } });
  // ---- material
  const mOpen = ctx.mat.toon('#ffffff', { map: catAtlas(ctx, key, o), vertexColors: true, side: 'double', paint: 0.03, noSnow: true });   // [v3:integrate] noSnow: characters
  const mClosed = ctx.mat.toon('#ffffff', { map: catAtlas(ctx, key, { ...o, closed: true }), vertexColors: true, side: 'double', paint: 0.03, noSnow: true });
  const mesh = B.build(group, o.startClosed ? mClosed : mOpen);
  const rest = new Map(); for (const b of B.bones) rest.set(b, b.position.clone());
  return { group, mesh, bn, tail: tb, mOpen, mClosed, rest, B, tris: B.triangles, setEyes(open) { mesh.material = open ? mOpen : mClosed; }, reset() { for (const [b, p] of rest) { b.position.copy(p); b.quaternion.identity(); b.scale.set(1, 1, 1); } } };
}

// ------------------------------------------------------------------ sparrow
const BIRD_MAT = (ctx) => ctx.mat.toon('#ffffff', { vertexColors: true, side: 'double', paint: 0.02, noSnow: true });   // [v3:integrate]
/** Adds one sparrow (bones + geometry) to the shared flock builder B; its root bone sits at p (world). */
function addSparrow(ctx, B, flock, seed, p) {
  const r = ctx.rng(seed);
  const k = 0.95 + r() * 0.12;
  const root = B.bone('bird' + seed, null, p[0], p[1], p[2]); flock.add(root);
  const body = B.bone('body', root, 0, 0.035 * k, 0);
  const head = B.bone('head', body, 0, 0.028 * k, 0.03 * k);
  const tail = B.bone('tail', body, 0, 0.004 * k, -0.04 * k);
  const wL = B.bone('wingL', body, 0.024 * k, 0.012 * k, 0.012 * k), wR = B.bone('wingR', body, -0.024 * k, 0.012 * k, 0.012 * k);
  const brown = '#8f6a50', cream = '#e7dccb', chest = '#cfc2b0', cap = '#86573f', dark = '#4a3f45', white = '#eeebe6';
  B.add(ellipsoid(0.03 * k, 0.029 * k, 0.047 * k, [0, 0, 0], 10, 7, (x, y, z) => [x, y, z + y * 0.35]), { bone: body, colorFn: (x, y, z) => (y < -0.004 * k ? (y < -0.016 * k ? cream : chest) : brown) });
  B.add(ellipsoid(0.023 * k, 0.022 * k, 0.024 * k, [0, 0.004 * k, 0.004 * k], 10, 7), { bone: head, colorFn: (x, y, z) => {
    if (y > 0.012 * k) return cap;
    if (Math.abs(x) > 0.016 * k && y > -0.006 * k && y < 0.008 * k) return z > 0.004 * k && z < 0.016 * k ? dark : white; // cheek + spot
    if (z > 0.014 * k && y < -0.002 * k && Math.abs(x) < 0.012 * k) return dark; // bib
    if (Math.abs(x) > 0.014 * k && y >= 0.004 * k) return cap;
    return y > -0.01 * k ? white : chest;
  } });
  // eye beads
  for (const s of [1, -1]) B.add(ellipsoid(0.0042 * k, 0.0046 * k, 0.003 * k, [s * 0.019 * k, 0.009 * k, 0.012 * k], 6, 4), { bone: head, color: '#3a3346' });
  const beak = new THREE.ConeGeometry(0.0065 * k, 0.014 * k, 6); beak.rotateX(Math.PI / 2);
  B.add(beak, { bone: head, color: '#4f4448', matrix: new THREE.Matrix4().makeTranslation(0, 0.002 * k, 0.028 * k) });
  B.add(ellipsoid(0.013 * k, 0.004 * k, 0.03 * k, [0, 0, -0.022 * k], 8, 5, (x, y, z) => [x * (1 + Math.max(0, -z) * 18), y, z]), { bone: tail, color: '#6e5646' });
  for (const [s, w] of [[1, wL], [-1, wR]]) B.add(ellipsoid(0.008 * k, 0.019 * k, 0.04 * k, [s * 0.002 * k, 0, -0.014 * k], 8, 6, (x, y, z) => [x, y, z]), { bone: w, colorFn: (x, y, z) => (z < -0.03 * k ? '#5f4a40' : (Math.abs(y) < 0.004 * k ? '#e2d6c6' : '#7e5d48')) });
  for (const s of [1, -1]) B.add(limb(0.028 * k, 0.0022 * k, 0.002 * k, { cols: 4 }), { bone: root, color: '#b58d7c', matrix: new THREE.Matrix4().makeTranslation(s * 0.008 * k, 0.028 * k, 0.002 * k) });
  return { group: root, root, body, head, tail, wL, wR };
}

// ------------------------------------------------------------------ assembly
export function makeAnimals(ctx) {
  const L = ctx.L, S = L.SPOTS;
  const actors = [];
  const player = ctx.player?.position;
  const tmpV = new THREE.Vector3();
  const addC = (c) => { ctx.add(c.group); return c; };

  // ---- white cat: loafing along the W3 wall top, head turned to the street
  {
    const sp = S.catWhite;
    const y = L.heightAt(sp.x, sp.z) + S.w3Wall.h;
    const c = addC(makeCat(ctx, 'white', { pose: 'loaf', scale: 1.0, fur: '#eeebe6', eye: '#9cc3e4', eyeDark: '#5f86b3', ink: '#4a4250', nose: '#e7a3ab', earIn: '#ecb8bd', muzzle: '#f4f1ed',
      tail: [[0, -0.02, -0.17], [-0.06, -0.035, -0.2], [-0.115, -0.1, -0.2], [-0.13, -0.22, -0.18], [-0.13, -0.31, -0.13], [-0.12, -0.34, -0.08]] }));
    const rotY = Math.PI; // body along the wall (north), street is to its right (+X world)
    ctx.physics.addCylinder(sp.x, sp.z, 0.12, y, y + 0.3);
    actors.push({ h: c, update(t, dt) {
      c.reset(); c.group.position.set(sp.x, y, sp.z); c.group.rotation.set(0, rotY, 0);
      const cyc = t % 17;
      // slow head turn: street -> station -> street, eyes half-closed now and then
      const look = lerp(-1.25, -0.2, smooth(6, 8.5, cyc) * (1 - smooth(12, 14.5, cyc)));
      let yaw = look + 0.08 * Math.sin(t * 0.5);
      if (player && tmpV.set(player.x - sp.x, 0, player.z - sp.z).length() < 4) { const a = Math.atan2(player.x - sp.x, player.z - sp.z) - rotY; yaw = clamp(Math.atan2(Math.sin(a), Math.cos(a)), -1.4, 1.4); }
      rot(c.bn.neck, 0.05, yaw * 0.4, 0); rot(c.bn.head, -0.06 + 0.04 * Math.sin(t * 0.3), yaw * 0.6, 0.08 * Math.sin(t * 0.21));
      c.bn.body.scale.set(1 + 0.018 * Math.sin(t * 2.4), 1 + 0.025 * Math.sin(t * 2.4), 1);
      earFlick(c, t, 1.3);
      // tail tip swish hanging down the wall face
      for (let i = 0; i < c.tail.length; i++) rot(c.tail[i], 0.14 * Math.sin(t * 1.3 - i * 0.6) * (i / c.tail.length), 0, 0);
      c.setEyes(((t + 1.1) % 5.3) > 0.14 && !(cyc > 9 && cyc < 10.2));
    } });
  }

  // ---- calico: curled up asleep on the ring bench
  {
    const sp = S.calicoCat;
    const y = sp.y ?? S.plazaBenchSeatY;
    const c = addC(makeCat(ctx, 'calico', { pose: 'curl', scale: 1.0, fur: '#efe9e1', eye: '#d9b55e', eyeDark: '#a07d3c', ink: '#4a4250', nose: '#e7a3ab', earIn: '#ecb8bd',
      patches: [['#d98d4f', 5, 34], ['#4e4652', 4, 26]], facePatch: '#d98d4f', facePatch2: '#4e4652', startClosed: true }));
    ctx.physics.addCylinder(sp.x, sp.z, 0.16, y, y + 0.5);
    actors.push({ h: c, update(t, dt) {
      c.reset(); c.group.position.set(sp.x, y + 0.004, sp.z); c.group.rotation.set(0, sp.rotY, 0);
      const cyc = t % 26;
      const up = smooth(15, 16.5, cyc) * (1 - smooth(21, 22.5, cyc));      // lifts her head, looks around
      c.bn.body.scale.set(1 + 0.03 * Math.sin(t * 1.9), 1 + 0.04 * Math.sin(t * 1.9), 1);
      rot(c.bn.neck, -0.3 * up, 0.35 * (1 - up) + 0.2 * up, 0.15 * (1 - up));
      rot(c.bn.head, 0.32 * (1 - up) - 0.2 * up, 0.25 * (1 - up) + (0.6 * Math.sin((cyc - 16) * 0.7)) * up, 0.35 * (1 - up));
      earFlick(c, t, 2.1);
      for (let i = 0; i < c.tail.length; i++) rot(c.tail[i], 0, 0.05 * Math.sin(t * 0.8 - i * 0.7) * (i / c.tail.length) + (i === c.tail.length - 1 ? 0.15 * Math.max(0, Math.sin(t * 0.37)) : 0), 0);
      c.setEyes(up > 0.6 && ((t % 3.7) > 0.15));
    } });
  }

  // ---- black cat: sitting on the ground by the V5 bench, tail wrapped, tip twitching
  {
    const sp = S.blackCat;
    const y = ctx.physics.groundHeight(sp.x, sp.z, L.heightAt(sp.x, sp.z) + 0.2);
    const c = addC(makeCat(ctx, 'black', { pose: 'sit', scale: 1.02, fur: '#4b4757', eye: '#d8cf6a', eyeDark: '#8d9a3c', ink: '#3a3346', nose: '#8f6f7c', earIn: '#8d7584', muzzle: '#56515f', pupil: 2.6 }));
    ctx.physics.addCylinder(sp.x, sp.z, 0.14, y, y + 0.5);
    actors.push({ h: c, update(t, dt) {
      c.reset(); c.group.position.set(sp.x, y, sp.z); c.group.rotation.set(0, sp.rotY, 0);
      const cyc = t % 19;
      let yaw = 0.7 * Math.sin(t * 0.17) * smooth(3, 6, cyc) + 0.9 * (smooth(11, 12, cyc) * (1 - smooth(15, 16.5, cyc)));
      if (player && tmpV.set(player.x - sp.x, 0, player.z - sp.z).length() < 4.5) { const a = Math.atan2(player.x - sp.x, player.z - sp.z) - sp.rotY; yaw = clamp(Math.atan2(Math.sin(a), Math.cos(a)), -1.4, 1.4); }
      rot(c.bn.neck, 0, yaw * 0.35, 0); rot(c.bn.head, -0.1 + 0.05 * Math.sin(t * 0.4), yaw * 0.65, 0.1 * Math.sin(t * 0.23));
      rot(c.bn.chest, 0.02 * Math.sin(t * 2.3), 0, 0);
      earFlick(c, t, 0.7);
      for (let i = 0; i < c.tail.length; i++) rot(c.tail[i], 0, (0.1 + 0.18 * (i / c.tail.length)) * Math.sin(t * 1.7 - i * 0.8) * (i > 1 ? 1 : 0.3), 0);
      c.setEyes(((t + 2.3) % 4.1) > 0.14);
    } });
  }

  // ---- sparrows: the whole flock is ONE skinned mesh (one draw call), one little bone rig per bird
  const spans = pickSpans(ctx);
  const birds = [];
  const FB = new SkinBuilder('sparrows');
  const flock = new THREE.Group(); flock.name = 'sparrows';
  let seed = 400;
  for (const grp of spans) {
    for (const p of grp.perches) {
      const b = addSparrow(ctx, FB, flock, seed++, [p.x, p.y, p.z]);
      birds.push({ b, kind: 'wire', ...p, seed });
    }
  }
  // ground birds on the plaza (pecking between the tree bench and the bike racks)
  const home = [[1.6, -8.6], [2.2, -9.3], [1.1, -9.6]];
  for (const [hx, hz] of home) {
    const gy = ctx.physics.groundHeight(hx, hz, L.heightAt(hx, hz) + 0.2);
    const b = addSparrow(ctx, FB, flock, seed++, [hx, gy, hz]);
    birds.push({ b, kind: 'ground', x: hx, z: hz, y: gy, seed });
  }
  if (birds.length) {
    const fm = FB.build(flock, BIRD_MAT(ctx));
    fm.castShadow = false;
    ctx.add(flock);
    for (const it of birds) it.b.body.userData.restY = it.b.body.position.y;
    actors.push({ h: null, update(t, dt) { for (const it of birds) birdUpdate(ctx, it, t); } });
  }
  return actors;
}

export function earFlick(c, t, seed) {   // [v3:life] exported
  const cyc = (t + seed * 3.3) % (4.5 + seed);
  const f = cyc < 0.25 ? Math.sin(cyc / 0.25 * Math.PI) : 0;
  rot(c.bn.earL, -0.5 * f, 0, 0.4 * f);
  const cyc2 = (t + seed * 1.7) % (6.1 + seed * 0.5);
  const f2 = cyc2 < 0.22 ? Math.sin(cyc2 / 0.22 * Math.PI) : 0;
  rot(c.bn.earR, -0.4 * f2, 0, -0.35 * f2);
}

/** Choose wire spans visible from the hero view and the plaza; place little groups of perches. */
function pickSpans(ctx) {
  const L = ctx.L;
  let spans = (ctx.services.poles?.spans || []).map(s => s.points).filter(p => p && p.length > 2);
  let fallback = false;
  if (!spans.length) {
    fallback = true;
    for (const run of Object.values(L.POLE_RUNS)) for (let i = 1; i < run.length; i++) {
      const a = run[i - 1], b = run[i];
      spans.push(ctx.geo.catenary([a.x, L.heightAt(a.x, a.z) + 7.5, a.z], [b.x, L.heightAt(b.x, b.z) + 7.5, b.z], 0.35, 16));
    }
  }
  // desired sites (x,z) in priority order and group sizes
  const sites = [
    { x: -3.4, z: 16, n: 4 },   // west side of the main street, above the flower shop (hero view)
    { x: 3.4, z: 30, n: 3 },    // east side near the hero camera
    { x: -2, z: 1.45, n: 4 },   // cross street R3, right at the end of the main street (hero view + plaza)
    { x: 16, z: 1.45, n: 3 },   // R3 east, seen from the plaza
  ];
  const r = ctx.rng('sparrows');
  const out = [];
  const used = new Set();
  for (const site of sites) {
    let best = null;
    spans.forEach((pts, si) => {
      if (used.has(si)) return;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const len = a.distanceTo(b); if (len < 0.2) continue;
        const slope = Math.abs(b.y - a.y) / len;
        if (slope > 0.12 || a.y < 4.5 || a.y > 10.5) continue;
        const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
        const d = Math.hypot(mx - site.x, mz - site.z) + slope * 4 - a.y * 0.05;
        if (!best || d < best.d) best = { d, si, i, pts };
      }
    });
    if (!best || best.d > 9) continue;
    used.add(best.si);
    // walk along the span from the chosen segment, spacing 0.13..0.26 m
    const pts = best.pts;
    const perches = [];
    const lens = [0]; for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const total = lens[lens.length - 1];
    let s = clamp(lens[best.i - 1] + r() * 0.5, 0.8, total - 2.5);
    const facing = r() < 0.5 ? 1 : -1;
    for (let j = 0; j < site.n; j++) {
      const at = sampleAt(pts, lens, s);
      perches.push({ x: at.p.x, y: at.p.y, z: at.p.z, tx: at.t.x, tz: at.t.z, face: r() < 0.8 ? facing : -facing, span: pts, lens, s });
      s += 0.13 + r() * 0.14;
    }
    if (fallback) ctx.wires.add(pts, { width: 0.012, color: '#3a3640' });
    out.push({ perches });
  }
  return out;
}
function sampleAt(pts, lens, s) {
  let i = 1; while (i < pts.length - 1 && lens[i] < s) i++;
  const f = clamp((s - lens[i - 1]) / Math.max(1e-6, lens[i] - lens[i - 1]), 0, 1);
  const p = new THREE.Vector3().lerpVectors(pts[i - 1], pts[i], f);
  const t = new THREE.Vector3().subVectors(pts[i], pts[i - 1]).normalize();
  return { p, t };
}

/** Bird behaviour (pure function of t + per-bird seed). */
function birdUpdate(ctx, it, t) {
  const { b } = it;
  const sd = it.seed * 1.618;
  b.root.quaternion.identity(); b.body.quaternion.identity(); b.head.quaternion.identity(); b.tail.quaternion.identity();
  b.wL.quaternion.identity(); b.wR.quaternion.identity(); b.body.position.set(0, b.body.userData.restY, 0); b.body.scale.setScalar(1);
  // head: quick jerky turns held for a moment
  const slot = Math.floor(t / 0.9 + sd), fr = (t / 0.9 + sd) - slot;
  const hr = (n) => { const x = Math.sin(n * 12.9898 + sd * 78.233) * 43758.5453; return x - Math.floor(x); };
  const yaw0 = (hr(slot - 1) - 0.5) * 2.2, yaw1 = (hr(slot) - 0.5) * 2.2;
  const hy = lerp(yaw0, yaw1, smooth(0, 0.12, fr));
  const pitch = (hr(slot + 100) - 0.5) * 0.5;
  if (it.kind === 'wire') {
    const cyc = (t + sd * 7) % 11;
    // a short hop along the wire now and then (returns later)
    const hopA = smooth(5.0, 5.35, cyc), hopB = smooth(8.8, 9.15, cyc);
    const off = (hopA - hopB) * 0.07 * (it.face > 0 ? 1 : -1);
    const air = Math.sin(clamp((cyc - 5.0) / 0.35, 0, 1) * Math.PI) + Math.sin(clamp((cyc - 8.8) / 0.35, 0, 1) * Math.PI);
    const at = sampleAt(it.span, it.lens, it.s + off);
    b.root.position.set(at.p.x, at.p.y + air * 0.05 + 0.001, at.p.z);
    const fx = -at.t.z * it.face, fz = at.t.x * it.face;
    b.root.rotation.set(0, Math.atan2(fx, fz), 0);
    // flutter while hopping, fluff / preen occasionally
    const flap = air > 0.01 ? Math.sin(t * 60) * 0.9 * air : 0;
    rot(b.wL, 0, 0, 0.1 + flap); rot(b.wR, 0, 0, -0.1 - flap);
    const preen = smooth(2, 2.2, cyc) * (1 - smooth(3.2, 3.4, cyc));
    rot(b.head, pitch + preen * 0.9, hy * (1 - preen) + preen * 1.9, preen * 0.4);
    rot(b.tail, 0.25 * Math.max(0, Math.sin(t * 7 + sd)) * (hr(slot + 7) > 0.7 ? 1 : 0.1), 0, 0);
    b.body.scale.setScalar(1 + 0.08 * smooth(6.2, 6.5, cyc) * (1 - smooth(7.2, 7.6, cyc)));
  } else {
    // ground: hop to random nearby points, peck
    const T = 1.4, n = Math.floor(t / T + sd), f = (t / T + sd) - n;
    const pt = (m) => [it.x + (hr(m) - 0.5) * 1.1, it.z + (hr(m + 50) - 0.5) * 0.9];
    const p0 = pt(n), p1 = pt(n + 1);
    const hop = smooth(0.0, 0.25, f);
    const x = lerp(p0[0], p1[0], hop), z = lerp(p0[1], p1[1], hop);
    const air = Math.sin(clamp(f / 0.25, 0, 1) * Math.PI) * 0.035;
    b.root.position.set(x, it.y + air, z);
    const dir = Math.atan2(p1[0] - p0[0], p1[1] - p0[1]);
    b.root.rotation.set(0, dir + (f > 0.3 ? (hr(n + 9) - 0.5) * 1.2 : 0), 0);
    const peck = f > 0.45 && f < 0.95 ? Math.max(0, Math.sin((f - 0.45) / 0.5 * Math.PI * 3)) : 0;
    rot(b.body, 0.35 * peck, 0, 0);
    rot(b.head, 0.9 * peck + (1 - peck) * pitch, (1 - peck) * hy * 0.7, 0);
    const flap = f < 0.25 ? Math.sin(t * 50) * 0.5 : 0;
    rot(b.wL, 0, 0, 0.1 + flap); rot(b.wR, 0, 0, -0.1 - flap);
    rot(b.tail, 0.3 * (1 - peck) * (f < 0.3 ? 1 : 0.2), 0, 0);
  }
}
