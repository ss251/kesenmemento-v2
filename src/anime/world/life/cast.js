// [v3:life] The people and cats of Kesennuma's inner bay, built on Sakuragaoka Station's character kit
// (Kenton-GMI/sakuragaoka-station, MIT; ./characters/*): one skinned mesh per figure, poses are pure functions of t.
//
//   townspeople walking the real sidewalks and the seawall promenade (./paths.js), fishermen in rubber aprons and
//   boots at the quays, market workers at the fish market, kids at a vending machine, an old man watching the bay,
//   a visitor photographing 浮見堂, and cats (SPOTS.cats). Gulls are the harbor package's (harbor/gulls.js).
//
//   const cast = buildCast(ctx, paths)  ->  { actors, stats, update(dt, t) }
import { FRAMES } from './tour.js';
import * as THREE from 'three';
import { Human } from './characters/human.js';
import { Driver, rot, rotMul } from './characters/anim.js';
import * as gear from './characters/gear.js';
import { makeCat, earFlick } from './characters/animals.js';
import { clamp, lerp, smooth, wave } from './characters/skin.js';

// ------------------------------------------------------------------ looks
const HAIR = {
  blue: { top: '#4a4660', base: '#3f3c52', tip: '#3b374b', hi: '#716f90', hi2: '#9a98b8' },
  dark: { top: '#5d4743', base: '#4f3c3e', tip: '#47383c', hi: '#8c706a', hi2: '#b3978c' },
  chestnut: { top: '#8d6552', base: '#785642', tip: '#6a4b3d', hi: '#b89076', hi2: '#d6b59a' },
  soft: { top: '#9b7662', base: '#876550', tip: '#775a49', hi: '#c3a187', hi2: '#dcc0a6' },
  gray: { top: '#bdb9c3', base: '#aca8b4', tip: '#a19dab', hi: '#dbd8e0', hi2: '#e6e3ea' },
  black: { top: '#49404a', base: '#403840', tip: '#3c343e', hi: '#6f6470', hi2: '#948896' },
  salt: { top: '#8f8b96', base: '#7c7884', tip: '#6f6b78', hi: '#b6b2bc', hi2: '#cfccd4' },
};
const SKIN = { fair: '#f6dccb', warm: '#f3d5c1', tan: '#e6c1a6', sea: '#ddb497', old: '#efd2c1' };
function faceF(o = {}) {
  return { skin: SKIN.fair, ink: '#3b3144', eyeP: 24, eyeT: -12, eyeW: 20, eyeH: 22, irisDark: '#4a3346', irisMid: '#7d5b62', irisLight: '#c69f8f',
    lash: 1, lidTop: -0.5, iris: 0.37, irisH: 0.46, brow: '#5c4448', browW: 1.7, browGap: 3.5, browArch: 2.4, noseT: -32, mouthT: -52, mouthW: 9, smile: 0.3, blush: 0.75, blushLines: true, ...o };
}
function faceM(o = {}) {
  return faceF({ eyeW: 19, eyeH: 15, lash: 0.5, lidTop: -0.48, iris: 0.36, irisH: 0.5, browW: 2.6, browArch: 1.2, browGap: 3, blush: 0.25, blushLines: false, mouthW: 10, smile: 0.1, ...o });
}
const HAIR_M = [
  { fringe: { n: 5, span: 50, tip: 18, skew: 16, w: 0.06, part: 6, partAt: -14, edgeDrop: 10 }, hairlineSide: -8, hairlineBack: -64, volume: 1.07, crown: [[160, 20, 10, 0.06], [-160, 20, -10, 0.06]] },
  { fringe: { n: 6, span: 56, tip: 6, skew: 10, w: 0.055, edgeDrop: 14 }, hairlineSide: -18, hairlineBack: -68, volume: 1.08, side: { w: 0.028 }, crown: [[150, -10, 20, 0.06], [-150, -10, -20, 0.06]] },
  { fringe: { n: 5, span: 52, tip: 14, skew: 10, w: 0.05, edgeDrop: 6 }, hairlineSide: -14, hairlineBack: -62, volume: 1.035 },
];
const HAIR_F = [
  { fringe: { n: 6, span: 58, tip: 8, skew: 14, w: 0.056, part: 4, partAt: -10 }, hairlineSide: -60, hairlineBack: -74, flare: 0.14, side: { w: 0.04 } },
  { fringe: { n: 7, span: 60, tip: 10, skew: 18, w: 0.05, part: 5, partAt: 15 }, side: { w: 0.03, long: 0.02 }, ponytail: { len: 0.2, th: -8, w: 0.06, tie: '#8a6a58' }, hairlineBack: -50 },
  { fringe: { n: 7, span: 62, tip: 0, skew: -6, w: 0.05 }, side: { long: 0.16, w: 0.033 }, back: { len: 0.42, n: 7, span: 108, w: 0.09, spread: 0.2, taper: 0.2 }, hairlineBack: -64 },
];

// Archetypes -> Human spec. r = seeded rng.
const LOOKS = {
  fisherman(r, i) {
    const apron = r.pick(['#d9733c', '#e0823f', '#3f6f5c', '#34546e']);
    return {
      key: 'fisher' + i, sex: 'm', height: r.range(1.66, 1.76), width: r.range(1.02, 1.12), seed: 200 + i, skin: r.pick([SKIN.sea, SKIN.tan]), ears: true,
      face: faceM({ skin: SKIN.tan, irisMid: '#5a4a46', irisLight: '#8f7a6a', eyeH: 13, browW: 3.0, smile: r.range(0.1, 0.5) }),
      hair: HAIR_M[i % 3], hairTex: r.pick([HAIR.black, HAIR.salt, HAIR.dark]),
      outfit: { top: r.pick(['sweater', 'hoodie']), topColor: r.pick(['#44506e', '#5b6b7c', '#6f5f58', '#3f5a66']), band: '#3a4460', bottom: 'trousers', bottomColor: r.pick(['#4a4f5c', '#5a5550']),
        apron: { color: apron, strap: apron, hem: 0.3 }, boots: { color: r.pick(['#e1e4dc', '#3c3a44', '#dde1db']), band: '#cfd3cb', top: 0.7 }, gloves: r.chance(0.5) ? '#e2a13a' : null },
      hands: { L: 'hold', R: 'hold' },
      props: [(hh) => (r.chance(0.55) ? gear.headband(hh, { color: r.pick(['#eef0f2', '#e8e2d2', '#dfe6ee']) }) : gear.workCap(hh, { color: r.pick(['#4a5a7a', '#6c5b4b', '#39485f']) }))],
    };
  },
  marketWorker(r, i) {
    return {
      key: 'market' + i, sex: r.chance(0.75) ? 'm' : 'f', height: r.range(1.6, 1.74), width: r.range(0.98, 1.1), seed: 300 + i, skin: SKIN.tan, ears: true,
      face: faceM({ skin: SKIN.tan, irisMid: '#5a4a46', irisLight: '#8f7a6a', eyeH: 14, smile: 0.3 }),
      hair: HAIR_M[(i + 1) % 3], hairTex: r.pick([HAIR.black, HAIR.dark, HAIR.salt]),
      outfit: { top: 'shirt', topColor: r.pick(['#e7e6e0', '#d9dfe6']), rolled: true, collar: '#e7e6e0', tucked: true, bottom: 'trousers', bottomColor: '#4c5566',
        apron: { color: r.pick(['#2f5a78', '#3d6b52', '#d9733c']), strap: '#2b3c52', hem: 0.26 }, boots: { color: '#e1e4dc', band: '#cfd3cb', top: 0.72 } },
      hands: { L: 'hold', R: 'hold' },
      props: [(hh) => gear.workCap(hh, { color: r.pick(['#39485f', '#2f4d6b', '#e7e6e0']) })],
    };
  },
  townWoman(r, i) {
    const bag = r.pick(['#b9c3a6', '#c9bb96', '#d9c7a6', '#a9b8c9']);
    return {
      key: 'townW' + i, sex: 'f', height: r.range(1.54, 1.63), seed: 400 + i, skin: r.pick([SKIN.warm, SKIN.fair]),
      face: faceF({ eyeH: 19, lidTop: -0.46, irisMid: '#7a5a50', irisLight: '#b8957c', blush: 0.5, smile: r.range(0.1, 0.5) }),
      hair: HAIR_F[i % 3], hairTex: r.pick([HAIR.chestnut, HAIR.dark, HAIR.soft]),
      outfit: r.chance(0.5)
        ? { top: 'cardigan', topColor: r.pick(['#e6c9c6', '#c9d3c0', '#d8c7de', '#e8d9b8']), band: '#d8c0bd', shirt: '#f0ebdf', vAng: 30, vY: 0.95, bottom: 'skirt', bottomColor: r.pick(['#d8c8aa', '#8d98ae', '#a98f86']), hem: 0.26, flare: 0.12, legs: '#ecd0bc', shoes: { color: '#8a6a58', sole: '#6a5448' } }
        : { top: 'blouse', topColor: r.pick(['#f1ece2', '#e9eef2']), collar: '#f1ece2', tucked: true, bottom: 'trousers', bottomColor: r.pick(['#6f7f95', '#8c7b6b', '#5e6b58']), belt: '#5a4a44', shoes: { color: '#e4e1db', sole: '#cfc9c1', type: 'sneaker' } },
      hands: { L: 'relax', R: 'hold' },
      props: [(hh) => gear.handBag(hh, 'R', { w: 0.32, h: 0.28, d: 0.1, color: bag, handle: '#8f7a64', drop: 0.04, leek: r.chance(0.35), greens: '#9dbb75' })],
    };
  },
  townMan(r, i) {
    return {
      key: 'townM' + i, sex: 'm', height: r.range(1.66, 1.78), seed: 500 + i, skin: SKIN.warm, ears: true,
      face: faceM({ irisMid: '#5d4a44', irisLight: '#8f7564', eyeH: 14, browW: 2.8 }),
      hair: HAIR_M[i % 3], hairTex: r.pick([HAIR.dark, HAIR.black, HAIR.blue]),
      outfit: r.chance(0.5)
        ? { top: 'jacket', topColor: r.pick(['#a4a8b0', '#7f8a9c', '#9c8f80']), lapel: '#8c909a', shirt: '#eceae6', tie: r.pick(['#5b6e90', '#8a5260']), buttons: '#6f737b', vAng: 30, vY: 0.72, bottom: 'trousers', bottomColor: '#6f737c', belt: '#4e4a4c', pockets: true, shoes: { color: '#4f4444', sole: '#3f3838' } }
        : { top: 'sweater', topColor: r.pick(['#afbfa3', '#c7b39a', '#9fb0c8']), band: '#9fb094', shirtCollar: '#eeebe4', bottom: 'trousers', bottomColor: r.pick(['#cdbd9f', '#6c7690']), shoes: { color: '#e4e1db', sole: '#cfc9c1', accent: '#8a9fb8', type: 'sneaker' } },
      hands: { L: 'hold', R: 'hold' },
      props: r.chance(0.4) ? [(hh) => gear.glasses(hh, { color: '#6b5a57' })] : [],
    };
  },
  elder(r, i) {
    return {
      key: 'elder' + i, sex: r.chance(0.5) ? 'f' : 'm', height: 1.5, width: 1.1, belly: 0.1, headK: 1.05, seed: 600 + i, skin: SKIN.old, ears: true,
      face: faceF({ skin: SKIN.old, eyeW: 18, eyeH: 13, lidTop: -0.3, lash: 0.4, iris: 0.4, irisH: 0.55, irisMid: '#5e4d48', irisLight: '#8a766c', blush: 0.35, blushLines: false, wrinkles: true, smile: 0.7, brow: '#9a9097', browW: 1.8, browGap: 4 }),
      hair: { fringe: { n: 6, span: 62, tip: 18, skew: 26, w: 0.06, part: 8, partAt: 0, edgeDrop: 6 }, hairlineSide: -18, hairlineBack: -44, volume: 1.1, bun: { r: 0.042, th: 12, pin: '#8f6a5a' } },
      hairTex: HAIR.gray,
      outfit: { top: 'cardigan', topColor: r.pick(['#b8a9c1', '#a9b7a0', '#c4ab98']), band: '#a797b1', shirt: '#ebe4d6', vAng: 26, vY: 0.85, jHemY: 0.7, bottom: 'trousers', bottomColor: '#77707f', shoes: { color: '#6a5a58', sole: '#51464a' } },
      hands: { L: 'hold', R: 'hold' },
      props: [(hh) => gear.glasses(hh, { color: '#9a8478' }), (hh) => gear.handBag(hh, 'R', { w: 0.34, h: 0.3, d: 0.13, color: '#c9bb96', handle: '#b3a47f', drop: 0.04, leek: true, greens: '#9dbb75' })],
    };
  },
  kid(r, i) {
    const girl = i % 2 === 1;
    return girl ? {
      key: 'kid' + i, sex: 'f', height: 1.32, width: 0.9, headK: 1.12, seed: 700 + i, skin: SKIN.fair,
      face: faceF({ irisDark: '#3e3a58', irisMid: '#5f6488', irisLight: '#a9b0cc', eyeH: 24, smile: 0.6 }),
      hair: { fringe: { n: 7, span: 60, tip: 3, skew: 7, w: 0.052 }, side: { long: 0.07, w: 0.03 }, ponytail: { len: 0.24, th: 30, w: 0.06, tie: '#e0707a' }, hairlineBack: -62 },
      hairTex: HAIR.chestnut,
      outfit: { top: 'hoodie', topColor: '#f0c6c8', band: '#e4b4b8', bottom: 'skirt', bottomColor: '#6f7ea3', hem: 0.4, flare: 0.12, legs: '#f2d8c7', socks: { color: '#eeeae4', top: 0.4 }, shoes: { color: '#e3e0da', sole: '#c9c3bb', accent: '#e0707a', type: 'sneaker' } },
      hands: { L: 'hold', R: 'point' },
      props: [(hh) => gear.backpack(hh, { color: '#c8495a', pocket: '#b53f50', strap: '#a8394a' })],
    } : {
      key: 'kid' + i, sex: 'm', height: 1.36, width: 0.88, shoulder: 0.84, headK: 1.1, seed: 700 + i, skin: SKIN.warm, ears: true,
      face: faceM({ eyeH: 17, eyeW: 19, irisMid: '#5a4a46', irisLight: '#937a6a', blush: 0.4, lidTop: -0.52 }),
      hair: { fringe: { n: 6, span: 58, tip: 10, skew: -10, w: 0.058, edgeDrop: 12 }, hairlineSide: -16, hairlineBack: -66, volume: 1.1, crown: [[170, 10, 25, 0.06], [-150, 5, -25, 0.06]], ahoge: true },
      hairTex: HAIR.black,
      outfit: { top: 'hoodie', topColor: '#c9ccd0', band: '#b7bbc1', bottom: 'shorts', bottomColor: '#56627c', socks: { color: '#e9e6e0' }, shoes: { color: '#e3e0da', sole: '#c9c3bb', accent: '#d0786a', type: 'sneaker' } },
      hands: { L: 'hold', R: 'point' },
      props: [(hh) => gear.backpack(hh, { color: '#3a3f52', pocket: '#33384a', strap: '#2e3344' })],
    };
  },
  visitor(r, i) {
    return {
      key: 'visitor' + i, sex: 'f', height: 1.6, seed: 800 + i, skin: SKIN.fair,
      face: faceF({ irisDark: '#4a3a4e', irisMid: '#7b6272', irisLight: '#c7a7ae', eyeH: 23, smile: 0.45 }),
      hair: HAIR_F[2], hairTex: HAIR.chestnut,
      outfit: { top: 'blouse', topColor: '#f1ece2', collar: '#f1ece2', tucked: true, bottom: 'skirt', bottomColor: '#a9bdd3', hem: 0.3, flare: 0.16, legs: '#f2d8c7', shoes: { color: '#8b6a5c', sole: '#6a5248' } },
      hands: { L: 'hold', R: 'hold' },
      props: [(hh) => gear.shoulderBag(hh, { color: '#d9c7a6', flap: '#cdb996', strap: '#b89f7c' }), (hh) => gear.phone(hh, 'R', '#e9e6ea')],
    };
  },
};

// ------------------------------------------------------------------ helpers
function groundY(ctx, x, z, hint = -1e9) {
  const g0 = Math.max(ctx.L.heightAt(x, z), hint);
  return ctx.physics.groundHeight(x, z, g0 + 0.6);
}
/** Step a point away from the sea (toward the land) until it is `margin` metres from any water. */
function landward(L, x, z, margin = 2.5) {
  for (let k = 0; k < 40; k++) {
    let wx = 0, wz = 0, n = 0;
    for (let a = 0; a < 16; a++) { const c = Math.cos(a * Math.PI / 8), s = Math.sin(a * Math.PI / 8); if (L.isWater(x + c * margin, z + s * margin)) { wx += c; wz += s; n++; } }
    if (!n) return [x, z];
    const l = Math.hypot(wx, wz) || 1; x -= wx / l * 0.6; z -= wz / l * 0.6;
  }
  return [x, z];
}
function nearestWaterDir(L, x, z, R = 30) {
  let best = null;
  for (let r = 2; r <= R; r += 2) { for (let a = 0; a < 24; a++) { const c = Math.cos(a * Math.PI / 12), s = Math.sin(a * Math.PI / 12); if (L.isWater(x + c * r, z + s * r)) { best = Math.atan2(c, s); break; } } if (best !== null) break; }
  return best ?? 0;   // rotY facing the water (three.js: forward +Z -> atan2(dx, dz))
}

/** Is there a small object (a vending machine, ~2 m) whose bounds contain world point p? (Sakura cast.js idea) */
function somethingAt(ctx, p, pad = 0.2, maxSize = 3) {
  const box = new THREE.Box3(), size = new THREE.Vector3();
  let found = false;
  for (const root of [ctx.staticRoot, ctx.dynamicRoot]) {
    if (!root || found) continue;
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (found || !o.isMesh || o.isInstancedMesh || !o.geometry) return;
      const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox();
      box.copy(g.boundingBox).applyMatrix4(o.matrixWorld); box.getSize(size);
      if (Math.max(size.x, size.y, size.z) > maxSize) return;
      if (box.expandByScalar(pad).containsPoint(p)) found = true;
    });
  }
  return found;
}

/** Walking gait for any Driver-rigged figure moving along a path; call after d.place()/d.reset(). */
function gait(h, d, t, dt, dist, walking, o = {}) {
  const P = h.P, b = h.b;
  const stride = o.stride ?? 0.36 * P.k * (P.sex === 'm' ? 1.9 : 1.75);
  const ph = walking ? dist / stride : 0;
  const s1 = Math.sin(ph * Math.PI);
  const bob = walking ? Math.abs(s1) : 0;
  b.hips.position.y += walking ? -0.018 + 0.02 * bob : 0;
  b.hips.position.x += 0.016 * s1 * walking;
  rotMul(b.hips, 0.03 + (o.lean ?? 0), 0.07 * s1 * walking, 0.025 * s1 * walking);
  h.group.updateMatrixWorld(true);
  const lift = o.lift ?? 0.07;
  const foot = (n, off) => {
    const sgn = n === 'L' ? 1 : -1;
    const p = ((ph + off) % 2 + 2) % 2;
    let zf, yf = P.ankle;
    if (!walking) zf = sgn * 0.02;
    else if (p < 1.15) zf = lerp(stride * 0.34, -stride * 0.34, p / 1.15);
    else { const q = (p - 1.15) / 0.85; zf = lerp(-stride * 0.34, stride * 0.34, smooth(0, 1, q)); yf += lift * Math.sin(q * Math.PI); }
    return [sgn * P.hipJx * 1.05, yf, zf];
  };
  d.leg('L', foot('L', 0), 0.12, [0.1, 1]); d.leg('R', foot('R', 1), -0.12, [0.1, 1]);
  rotMul(b.spine, 0.04 + (o.lean ?? 0), -0.05 * s1 * walking, 0); rotMul(b.chest, 0.02, -0.06 * s1 * walking, 0);
  d.breathe(t);
  return { ph, s1, bob };
}

// ------------------------------------------------------------------ build
export function buildCast(ctx, P) {
  const L = ctx.L, SP = L.SPOTS;
  const q = ctx.quality?.name || 'high';
  const scale = { high: 1, medium: 0.7, low: 0.4 }[q] ?? 1;
  const r = ctx.rng('kesennuma-life-cast');
  const actors = [];
  const stats = { people: 0, cats: 0, triangles: 0, walkers: 0 };
  const person = (spec) => { const h = new Human(ctx, spec); ctx.add(h.group); stats.people++; stats.triangles += h.triangles || 0; return h; };

  // ============================================================ 1. walkers on sidewalks and the promenade
  const paths = P.paths.filter((p) => p.len > 25);
  const prom = paths.find((p) => p.kind === 'promenade');
  const side = paths.filter((p) => p.kind !== 'promenade');
  const plan = [];
  const nProm = Math.round(6 * scale), nSide = Math.round(12 * scale);
  const kindsP = ['townWoman', 'elder', 'townMan', 'visitor', 'kid', 'townWoman', 'fisherman'];
  const kindsS = ['townMan', 'townWoman', 'elder', 'kid', 'fisherman', 'townWoman', 'townMan', 'kid', 'townWoman', 'marketWorker', 'townMan', 'elder'];
  if (prom) for (let i = 0; i < nProm; i++) plan.push({ path: prom, kind: kindsP[i % kindsP.length], s0: prom.len * (i + 0.37) / nProm });
  for (let i = 0; i < nSide && side.length; i++) { const p = side[i % side.length]; plan.push({ path: p, kind: kindsS[i % kindsS.length], s0: p.len * ((i * 0.618) % 1) }); }
  const pos = {};
  // obstacles on the walking lines: life's lamp posts + the town's utility poles (grid lookup)
  const obst = (() => {
    const cell = 6, g = new Map();
    const add = (x, z) => { const k = Math.floor(x / cell) + ',' + Math.floor(z / cell); if (!g.has(k)) g.set(k, []); g.get(k).push([x, z]); };
    for (const p of P.posts || []) add(p[0], p[1]);
    for (const p of ctx.services.poles?.poles || []) add(p.x, p.z);
    for (const p of ctx.services.town?.poles || []) add(p.x ?? p[0], p.z ?? p[1]);
    return { near(x, z) { const out = []; const i0 = Math.floor(x / cell), j0 = Math.floor(z / cell); for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) { const l = g.get(i + ',' + j); if (l) out.push(...l); } return out; } };
  })();
  plan.forEach((pl, i) => {
    const kid = pl.kind === 'kid' ? 2 * i + (i % 2) : i;
    const spec = LOOKS[pl.kind](r, kid);
    // a pair of kids walks together: hands-free, faster
    const h = person(spec);
    const d = new Driver(ctx, h, { seed: spec.seed });
    const p = pl.path;
    const v = pl.kind === 'elder' ? 0.55 : pl.kind === 'kid' ? 1.25 : r.range(1.0, 1.3);
    const pause = r.range(1.5, 5);
    const legT = p.len / v, turnT = 1.4, period = 2 * (legT + pause + turnT);
    const t0 = (pl.s0 / p.len) * legT + r.range(0, 0.5) * period * (i % 2);
    const top = p.top;
    const st = { x: 0, z: 0, y: 0, yaw: 0 };
    ctx.physics.addDynamic?.(() => [{ cx: st.x, cz: st.z, w: 0.46, d: 0.46, rotY: st.yaw, y0: st.y, y1: st.y + 1.5 }]);
    const phone = pl.kind === 'visitor';
    stats.walkers++;
    actors.push({ h, kind: pl.kind, slot: i, update(t, dt) {
      const c = (t + t0) % period;
      let s, walking = 0, dirSign = 1, turning = 0;
      if (c < legT) { s = c * v; walking = 1; }
      else if (c < legT + pause) { s = p.len; }
      else if (c < legT + pause + turnT) { s = p.len; turning = (c - legT - pause) / turnT; }
      else if (c < 2 * legT + pause + turnT) { s = p.len - (c - legT - pause - turnT) * v; walking = 1; dirSign = -1; }
      else if (c < 2 * legT + 2 * pause + turnT) { s = 0; dirSign = -1; }
      else { s = 0; dirSign = -1; turning = (c - 2 * legT - 2 * pause - turnT) / turnT; }
      P.at(p, s, pos);
      const fwd = Math.atan2(pos.dx, pos.dz);
      let yaw = dirSign > 0 ? fwd : fwd + Math.PI;
      if (turning) yaw += Math.PI * smooth(0, 1, turning);
      // keep to the left of a shared path (Japan): a small lateral offset by direction
      let lat = 0.55 * dirSign;
      // step round posts / poles near the line (smooth lateral bump, like Sakura's pole detour)
      for (const [ox, oz] of obst.near(pos.x, pos.z)) {
        const rx = ox - pos.x, rz = oz - pos.z, along = rx * pos.dx + rz * pos.dz, side = rx * pos.dz - rz * pos.dx;
        const gap = side - lat;                                    // obstacle lateral position relative to the walker
        if (Math.abs(gap) < 0.75) lat -= Math.sign(gap || 1) * (0.75 - Math.abs(gap)) * Math.exp(-(along * along) / 2.2);
      }
      const x = pos.x + pos.dz * lat, z = pos.z - pos.dx * lat;
      const y = groundY(ctx, x, z, top != null ? top - 0.4 : -1e9);
      st.x = x; st.z = z; st.y = y; st.yaw = yaw;
      d.place(x, y, z, yaw); d.reset();
      const dist = walking ? (dirSign > 0 ? s : 2 * p.len - s) : 0;
      const g = gait(h, d, t, dt, dist, walking, { lean: pl.kind === 'elder' ? 0.12 : 0, lift: pl.kind === 'elder' ? 0.04 : 0.07 });
      const sw = walking ? (pl.kind === 'elder' ? 0.1 : 0.32) * g.s1 : 0;
      if (phone) { d.arm('R', 0.55, 0.05, -0.2, 1.75, [0.3, 0, 0]); d.arm('L', -sw * 0.6, 0.1, 0, 0.2, [0, 0, 0]); }
      else if (pl.kind === 'townWoman' || pl.kind === 'elder') { d.arm('R', -0.12 - sw * 0.4, 0.15, -0.1, 0.2, [0, 0, 0]); d.arm('L', sw, 0.1, 0.1, 0.25 + Math.max(0, sw), [0, 0, 0]); }
      else { d.arm('L', sw, 0.1, 0.1, 0.25 + Math.max(0, sw) * 0.8, [0, 0, 0]); d.arm('R', -sw, 0.1, -0.1, 0.25 + Math.max(0, -sw) * 0.8, [0, 0, 0]); }
      d.lookYP(0.35 * wave(t * 0.15 + i, 6) * (walking ? 0.6 : 1), phone ? 0.5 : -0.05 + 0.04 * g.bob, dt, { speed: 2 });
      d.wind(t, dt);
      d.blink(t);
    } });
  });

  // ============================================================ 2. fishermen at Pier 7 / the quay: a chatting group
  const hs = ctx.services.harbor;
  const groups = [];
  // Pier 7: the group chats a few metres in front of the tour's Pier 7 walk spot (in view, never in the camera's face)
  const w7 = FRAMES.pier7?.walk;
  if (w7) { const a = w7.yaw * Math.PI / 180; groups.push({ x: w7.x - Math.sin(a) * 11 - Math.cos(a) * 3, z: w7.z - Math.cos(a) * 11 + Math.sin(a) * 3, n: 3, kind: 'fisherman' }); }
  else if (SP.pier7) groups.push({ x: SP.pier7.x, z: SP.pier7.z, n: 3, kind: 'fisherman' });
  const ms = hs?.market?.workSpots || [];
  if (ms.length) for (let i = 0; i < Math.min(ms.length, Math.round(3 * scale)); i++) { const w = ms[(i * 3) % ms.length]; groups.push({ x: w.x ?? w[0], z: w.z ?? w[2], y: w.y ?? w[1], n: 2, kind: i === 0 ? 'fisherman' : 'marketWorker' }); }
  else if (SP.fishMarket) groups.push({ x: SP.fishMarket.x, z: SP.fishMarket.z, y: SP.fishMarket.y, n: 3, kind: 'marketWorker' });
  // two neighbours chatting on the promenade, in the first street-level view (HERO.walk)
  const HW = FRAMES.hero?.walk || L.HERO?.walk;
  if (HW) { const w = HW, yw = w.yaw * Math.PI / 180; groups.push({ x: w.x - Math.sin(yw) * 16 + Math.cos(yw) * 2.5, z: w.z - Math.cos(yw) * 16 - Math.sin(yw) * 2.5, n: 2, kind: 'townWoman' }); }
  groups.forEach((gp, gi) => {
    const [cx, cz] = landward(L, gp.x, gp.z, 3.2);
    const face = nearestWaterDir(L, cx, cz);
    const ring = [];
    for (let k = 0; k < gp.n; k++) {
      const a = face + (k - (gp.n - 1) / 2) * (2 * Math.PI / Math.max(3, gp.n)) + (gp.n === 2 ? Math.PI / 2 : 0);
      const [x, z] = landward(L, cx + Math.sin(a) * 1.25, cz + Math.cos(a) * 1.25, 2.4);
      ring.push({ x, z });
    }
    const mx = ring.reduce((a, p) => a + p.x, 0) / ring.length, mz = ring.reduce((a, p) => a + p.z, 0) / ring.length;
    const figs = ring.map((p, k) => {
      const spec = LOOKS[k === 0 ? gp.kind : (k % 2 ? 'fisherman' : 'marketWorker')](r, 20 + gi * 4 + k);
      const h = person(spec); const d = new Driver(ctx, h, { seed: spec.seed });
      const y = groundY(ctx, p.x, p.z, gp.y != null ? gp.y - 0.4 : -1e9);
      ctx.physics.addCylinder(p.x, p.z, 0.26, y, y + 1.7);
      return { h, d, x: p.x, y, z: p.z, rotY: Math.atan2(mx - p.x, mz - p.z) };
    });
    const heads = figs.map((f) => new THREE.Vector3(f.x, f.y + 1.55, f.z));
    const slots = [0, 1, 1, 2, 0, 2, 1, 0];
    const tmp = new THREE.Vector3();
    actors.push({ h: figs[0].h, group: figs.map((f) => f.h), slot: 100 + gi, update(t, dt) {
      const sp = slots[Math.floor((t + gi * 3) / 1.7) % slots.length] % figs.length;
      const laugh = smooth(9.2, 9.5, (t + gi * 5) % 14) * (1 - smooth(10.6, 11.2, (t + gi * 5) % 14));
      figs.forEach((f, k) => {
        const { h, d } = f, talking = sp === k && laugh < 0.5;
        d.place(f.x, f.y, f.z, f.rotY + (k - 1) * 0.12); d.reset();
        const sh = Math.sin(t * (0.28 + k * 0.05) + k * 2 + gi);
        d.stand({ hx: 0.02 * sh, hrz: 0.02 * sh, stance: 1.25, footL: [0.1, h.P.ankle, 0.03], footR: [-0.1, h.P.ankle, -0.03] });
        d.breathe(t + k);
        rotMul(h.b.spine, -0.08 * laugh + 0.05, 0, 0);
        const g = talking ? Math.sin(t * 2.7 + k) : 0;
        if (k === 0) { d.arm('L', 0.9, -0.05, -0.9, 1.9, [0, 0, 0]); d.arm('R', 0.95 + 0.15 * g, -0.05, 0.9, 1.9, [0, 0, 0]); }       // arms folded
        else if (k === 1) { d.arm('L', -0.2, 0.3, 0.3, 0.9, [0, 0, 0]); d.arm('R', 0.25 + (talking ? 0.5 + 0.25 * g : 0) + laugh * 0.8, 0.15, -0.2, 0.7 + (talking ? 0.6 : 0) + laugh * 1.2, [0.2, 0, 0]); }  // hand on hip, gestures
        else { d.arm('L', 0.05, 0.12, 0, 0.2, [0, 0, 0]); d.arm('R', 0.1 + laugh * 2.2, 0.15 + laugh * 0.4, 0, 0.3 + laugh * 1.3, [0, 0, 0]); }
        tmp.copy(sp === k ? heads[(k + 1) % figs.length] : heads[sp]);
        d.lookAt(tmp, dt, { speed: 3, tilt: -laugh * 0.08 });
        rotMul(h.b.head, -0.12 * laugh, 0, 0);
        h.setFace(((t + k * 1.9 + gi) % (3.3 + k * 0.6)) < 0.12 ? 'blink' : 'open');
      });
    } });
  });

  // ============================================================ 2b. [v3:fix] the unloading crew at the hero market berth
  // (harbor market.crew, beside the skipjack boat): eight workers in rubber aprons and boots, bending over the fish rows,
  // feeding the conveyor, carrying boxes, one writing up the catch. Own RNG so the rest of the cast keeps its looks.
  {
    const crew = (hs?.market?.crew || []).slice(0, Math.round(8 * scale));
    const rc = ctx.rng('fix-unload-crew');
    crew.forEach((c, i) => {
      const spec = LOOKS[i % 3 === 0 ? 'fisherman' : 'marketWorker'](rc, 60 + i);
      const h = person(spec); const d = new Driver(ctx, h, { seed: spec.seed });
      const y = groundY(ctx, c.x, c.z, (c.y ?? 1.8) - 0.4);
      ctx.physics.addCylinder(c.x, c.z, 0.26, y, y + 1.7);
      const ph = i * 1.37;
      actors.push({ h, slot: 160 + i, update(t, dt) {
        d.place(c.x, y, c.z, c.rotY); d.reset();
        const w = Math.sin(t * 1.7 + ph), w2 = Math.sin(t * 0.9 + ph * 2);
        if (c.pose === 'bend') {
          d.stand({ stance: 1.5, hy: -0.07, footL: [0.16, h.P.ankle, 0.08], footR: [-0.16, h.P.ankle, -0.06], kneeL: [0.05, 1.2], kneeR: [0.05, 1.2] });
          rotMul(h.b.spine, 0.62 + 0.06 * w, 0, 0); rotMul(h.b.chest, 0.2, 0.1 * w2, 0);
          d.arm('L', 1.0 + 0.15 * w, 0.12, 0, 0.35, [0.2, 0, 0]); d.arm('R', 1.1 - 0.15 * w, 0.1, 0, 0.45, [0.2, 0, 0]);
        } else if (c.pose === 'work') {
          d.stand({ stance: 1.3, footL: [0.12, h.P.ankle, 0.04], footR: [-0.12, h.P.ankle, -0.03] });
          rotMul(h.b.spine, 0.18, 0.1 * w2, 0);
          d.arm('L', 0.75 + 0.2 * w, 0.08, 0, 0.9 - 0.2 * w, [0.1, 0, 0]); d.arm('R', 0.8 - 0.2 * w, 0.08, 0, 0.8 + 0.2 * w, [0.1, 0, 0]);
        } else if (c.pose === 'carry') {
          d.stand({ stance: 1.25, footL: [0.12, h.P.ankle, 0.1], footR: [-0.12, h.P.ankle, -0.06] });
          rotMul(h.b.spine, -0.06, 0, 0);
          d.arm('L', 0.55, 0.22, 0, 1.45, [0, 0, 0]); d.arm('R', 0.55, 0.22, 0, 1.45, [0, 0, 0]);
        } else if (c.pose === 'write') {
          d.stand({ stance: 1.1 });
          d.arm('L', 0.45, 0.05, -0.3, 1.5, [0.3, 0, 0]); d.arm('R', 0.5 + 0.04 * w, 0.02, 0.2, 1.35, [0.2, 0, 0]);
          rotMul(h.b.head, 0.3, 0, 0);
        } else {
          d.stand({ stance: 1.2 });
          rotMul(h.b.spine, 0.1, 0, 0);
          d.arm('L', -0.45, 0.12, -1.1, 1.35, [0.2, 0, 0]); d.arm('R', -0.45, 0.12, 1.1, 1.35, [0.2, 0, 0]);
        }
        d.breathe(t + i);
        h.setFace(((t + i * 1.3) % (3.1 + i * 0.3)) < 0.12 ? 'blink' : 'open');
      } });
    });
  }

  // ============================================================ 3. kids at a vending machine (SPOTS.vending[0])
  const vm = (SP.vending || [])[1] || (SP.vending || [])[0];
  const hasMachine = vm ? somethingAt(ctx, new THREE.Vector3(vm.x, (vm.y ?? L.heightAt(vm.x, vm.z)) + 1.0, vm.z), 0.6) : false;
  if (vm && scale > 0.5) {
    const [vx, vz] = [vm.x, vm.z];
    const face = (vm.rotY ?? 0);
    const fx = Math.sin(face), fz = Math.cos(face);
    const kids = [0, 1].map((k) => {
      const spec = LOOKS.kid(r, 40 + k);
      const h = person(spec); const d = new Driver(ctx, h, { seed: spec.seed });
      const lx = (k ? -0.45 : 0.3);
      const x = vx + fx * 1.05 + fz * lx, z = vz + fz * 1.05 - fx * lx;
      const y = groundY(ctx, x, z, (vm.y ?? -1e9) - 0.4);
      ctx.physics.addCylinder(x, z, 0.22, y, y + 1.4);
      return { h, d, x, y, z, rotY: face + Math.PI + (k ? 0.35 : -0.1) };
    });
    const btn = new THREE.Vector3(), look = new THREE.Vector3(), pole = new THREE.Vector3(), rest = new THREE.Vector3();
    actors.push({ h: kids[0].h, group: kids.map((k) => k.h), slot: 200, update(t, dt) {
      kids.forEach((o, k) => {
        const { h, d } = o;
        d.place(o.x, o.y, o.z, o.rotY); d.reset();
        const sh = Math.sin(t * 0.5 + k);
        d.stand({ hx: 0.015 * sh, hrz: 0.02 * sh, footL: [0.07, h.P.ankle, 0.03], footR: [-0.08, h.P.ankle, -0.02] });
        d.breathe(t + k);
        if (k === 0 && hasMachine) {
          const reach = smooth(0.4, 0.8, (t % 6) / 6) * (1 - smooth(0.85, 0.98, (t % 6) / 6));
          btn.set(vx - fz * (0.1 * Math.sin(Math.floor(t / 6))), o.y + 1.05, vz).addScaledVector(new THREE.Vector3(fx, 0, fz), 0.4);
          d.W(-0.16, 0.9, 0.2, rest);
          d.armIK('R', rest.lerp(btn, reach), d.W(-0.45, 0.8, -0.2, pole));
          d.arm('L', 0.1, 0.1, 0, 0.3, [0, 0, 0]);
          look.set(vx, o.y + 1.2, vz); d.lookAt(look, dt, { speed: 3 });
        } else {
          d.arm('L', 0.05, 0.1, 0, 0.2, [0, 0, 0]); d.arm('R', 0.4, 0.1, -0.3, 1.2 + 0.2 * Math.sin(t * 2), [0, 0, 0]);
          look.copy(kids[1 - k].h.group.position); look.y += 1.2; d.lookAt(look, dt, { speed: 2, tilt: 0.1 });
        }
        d.wind(t, dt);
        h.setFace(((t + k * 1.7) % 3.4) < 0.12 ? 'blink' : 'open');
      });
    } });
  }

  // ============================================================ 4. an old man watching the bay, a visitor photographing 浮見堂
  const watchers = [];
  if (prom && prom.pts.length > 4) { const p = P.at(prom, prom.len * 0.62, {}); watchers.push({ x: p.x, z: p.z, kind: 'elder', top: prom.top, pose: 'watch' }); }
  if (SP.ukimido) { const [x, z] = landward(L, SP.ukimido.x - 4, SP.ukimido.z - 26, 2.5); watchers.push({ x, z, kind: 'visitor', pose: 'photo', target: [SP.ukimido.x, (SP.ukimido.y || 1.6) + 2, SP.ukimido.z] }); }
  watchers.forEach((w, i) => {
    const spec = LOOKS[w.kind](r, 60 + i); if (w.kind === 'elder') spec.sex = 'm';
    const h = person(spec); const d = new Driver(ctx, h, { seed: spec.seed });
    const [x, z] = landward(L, w.x, w.z, 1.6);
    const y = groundY(ctx, x, z, w.top != null ? w.top - 0.4 : -1e9);
    const rotY = w.target ? Math.atan2(w.target[0] - x, w.target[2] - z) : nearestWaterDir(L, x, z);
    ctx.physics.addCylinder(x, z, 0.24, y, y + 1.6);
    const tgt = new THREE.Vector3(...(w.target || [x + Math.sin(rotY) * 40, y + 1, z + Math.cos(rotY) * 40]));
    actors.push({ h, slot: 300 + i, update(t, dt) {
      d.place(x, y, z, rotY); d.reset();
      const sh = Math.sin(t * 0.3 + i);
      d.stand({ hx: 0.015 * sh, hrz: 0.015 * sh });
      d.breathe(t);
      if (w.pose === 'watch') { rotMul(h.b.spine, 0.14, 0, 0); d.arm('L', -0.45, 0.12, -1.1, 1.35, [0.2, 0, 0]); d.arm('R', -0.45, 0.12, 1.1, 1.35, [0.2, 0, 0]); }   // hands behind the back
      else { const up = 1 - smooth(8, 9, t % 12) * (1 - smooth(10.5, 11.5, t % 12)); d.arm('R', 1.25 * up + 0.1, 0.02, -0.3, 1.05 * up + 0.2, [0.2, 0, 0]); d.arm('L', 1.0 * up + 0.05, 0.05, 0.4, 1.4 * up + 0.2, [0.2, 0, 0]); }
      d.lookAt(tgt, dt, { speed: 1.2 });
      d.wind(t, dt);
      d.blink(t);
    } });
  });

  // ============================================================ 5. cats (SPOTS.cats) — loafing, sitting, curled
  const CATS = [
    { pose: 'loaf', fur: '#eeebe6', eye: '#9cc3e4', eyeDark: '#5f86b3', ink: '#4a4250', nose: '#e7a3ab', earIn: '#ecb8bd', muzzle: '#f4f1ed', tail: [[0, -0.02, -0.17], [-0.06, -0.035, -0.2], [-0.115, -0.1, -0.2], [-0.13, -0.22, -0.18], [-0.13, -0.31, -0.13], [-0.12, -0.34, -0.08]] },
    { pose: 'sit', fur: '#4b4757', eye: '#d8cf6a', eyeDark: '#8d9a3c', ink: '#3a3346', nose: '#8f6f7c', earIn: '#8d7584', muzzle: '#56515f', pupil: 2.6 },
    { pose: 'curl', fur: '#efe9e1', eye: '#d9b55e', eyeDark: '#a07d3c', ink: '#4a4250', nose: '#e7a3ab', earIn: '#ecb8bd', patches: [['#d98d4f', 5, 34], ['#4e4652', 4, 26]], facePatch: '#d98d4f', facePatch2: '#4e4652', startClosed: true },
    { pose: 'sit', fur: '#e1a86e', eye: '#9fcf7a', eyeDark: '#5e8f44', ink: '#4a3a3a', nose: '#e7a3ab', earIn: '#ecb8bd', muzzle: '#f2e2cf', pupil: 2.2 },
  ];
  const catSpots = (SP.cats || []).slice(0, Math.max(1, Math.round(4 * scale)));
  catSpots.forEach((sp, i) => {
    const o = CATS[i % CATS.length];
    const c = makeCat(ctx, 'kc' + i, { scale: 1.0, ...o });
    ctx.add(c.group); stats.cats++;
    const y = ctx.physics.groundHeight(sp.x, sp.z, (sp.y ?? L.heightAt(sp.x, sp.z)) + 0.3);
    const rotY = sp.rotY ?? r.range(-Math.PI, Math.PI);
    ctx.physics.addCylinder(sp.x, sp.z, 0.15, y, y + 0.4);
    actors.push({ h: c, cat: true, slot: 400 + i, update(t, dt) {
      c.reset(); c.group.position.set(sp.x, y + 0.004, sp.z); c.group.rotation.set(0, rotY, 0);
      const cyc = (t + i * 7) % 19;
      const yaw = 0.7 * Math.sin(t * 0.17 + i) * smooth(3, 6, cyc) + 0.9 * (smooth(11, 12, cyc) * (1 - smooth(15, 16.5, cyc)));
      if (o.pose === 'curl') { const up = smooth(12, 13.5, cyc) * (1 - smooth(16, 17.5, cyc)); rot(c.bn.neck, -0.3 * up, 0.35 * (1 - up), 0.15 * (1 - up)); rot(c.bn.head, 0.32 * (1 - up) - 0.2 * up, 0.25 * (1 - up) + 0.4 * Math.sin(t * 0.7) * up, 0.35 * (1 - up)); c.setEyes(up > 0.6 && (t % 3.7) > 0.15); }
      else { rot(c.bn.neck, 0.05, yaw * 0.4, 0); rot(c.bn.head, -0.06 + 0.04 * Math.sin(t * 0.3), yaw * 0.6, 0.08 * Math.sin(t * 0.21)); c.setEyes(((t + i) % 5.3) > 0.14); }
      c.bn.body.scale.set(1 + 0.02 * Math.sin(t * 2.2), 1 + 0.028 * Math.sin(t * 2.2), 1);
      earFlick(c, t, 1.3 + i);
      for (let k = 0; k < c.tail.length; k++) rot(c.tail[k], 0.12 * Math.sin(t * 1.2 - k * 0.6 + i) * (k / c.tail.length), 0.06 * Math.sin(t * 0.8 - k * 0.7) * (k / c.tail.length), 0);
    } });
  });

  // ============================================================ 5b. cats loafing on the seawall cap in front of the promenade view
  const seats = (hs?.seats || []).map((p) => (Array.isArray(p) ? { x: p[0], y: p[1], z: p[2] } : p));
  if (seats.length && HW && scale > 0.5) {
    const w = HW, yaw = w.yaw * Math.PI / 180, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const cand = seats.map((p) => { const dx = p.x - w.x, dz = p.z - w.z; return { p, ahead: dx * fx + dz * fz, lat: Math.abs(dx * fz - dz * fx) }; })
      .filter((c) => c.ahead > 5 && c.ahead < 40 && c.lat < 12).sort((a, b) => a.ahead - b.ahead);
    const picked = [];
    for (const c of cand) if (picked.length < 2 && picked.every((q) => Math.hypot(q.p.x - c.p.x, q.p.z - c.p.z) > 8)) picked.push(c);
    picked.forEach((c, i) => {
      const o = CATS[(i + 3) % CATS.length], sp = c.p;
      // along the wall: towards the nearest other seat
      let bx = 0, bz = 1, bd = 1e9; for (const q of seats) { const d = Math.hypot(q.x - sp.x, q.z - sp.z); if (d > 1 && d < bd) { bd = d; bx = q.x - sp.x; bz = q.z - sp.z; } }
      const rotY = Math.atan2(bx, bz) + (i ? Math.PI : 0);
      const cc = makeCat(ctx, 'wall' + i, { scale: 1.0, ...o, pose: i ? 'curl' : 'loaf', tail: CATS[0].tail });
      ctx.add(cc.group); stats.cats++;
      const player = ctx.player?.position;
      actors.push({ h: cc, cat: true, slot: 450 + i, update(t, dt) {
        cc.reset(); cc.group.position.set(sp.x, sp.y + 0.004, sp.z); cc.group.rotation.set(0, rotY, 0);
        let look = -0.9 + 0.8 * smooth(5, 7, (t + i * 4) % 15) * (1 - smooth(10, 12, (t + i * 4) % 15));
        if (player && Math.hypot(player.x - sp.x, player.z - sp.z) < 5) { const a = Math.atan2(player.x - sp.x, player.z - sp.z) - rotY; look = clamp(Math.atan2(Math.sin(a), Math.cos(a)), -1.4, 1.4); }
        if (i) { rot(cc.bn.neck, 0, 0.35, 0.15); rot(cc.bn.head, 0.32, 0.25, 0.35); cc.setEyes(false); }
        else { rot(cc.bn.neck, 0.05, look * 0.4, 0); rot(cc.bn.head, -0.06 + 0.04 * Math.sin(t * 0.3), look * 0.6, 0.08 * Math.sin(t * 0.21)); cc.setEyes(((t + 1.1) % 5.3) > 0.14); }
        cc.bn.body.scale.set(1 + 0.018 * Math.sin(t * 2.4), 1 + 0.025 * Math.sin(t * 2.4), 1);
        earFlick(cc, t, 2.3 + i);
        for (let k = 0; k < cc.tail.length; k++) rot(cc.tail[k], 0.14 * Math.sin(t * 1.3 - k * 0.6) * (k / cc.tail.length), 0, 0);
      } });
    });
  }

  // ============================================================ 5c. cats on bollards (港の猫): the free quay bollard caps (harbor
  // publishes the ones gulls never perch on) in front of the promenade and Pier 7 walk views and along the north shore
  const perches = (hs?.bollards || []).map((p) => (Array.isArray(p) ? { x: p[0], y: p[1], z: p[2] } : p));
  if (perches.length && scale > 0.5) {
    const isCap = () => true;
    const views = [FRAMES.hero?.walk, FRAMES.pier7?.walk, { x: 150, z: -150, yaw: 180 }].filter(Boolean);
    const taken = [];
    views.forEach((w, vi) => {
      const yaw = w.yaw * Math.PI / 180, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const c = perches.filter(isCap).map((p) => { const dx = p.x - w.x, dz = p.z - w.z; return { p, ahead: dx * fx + dz * fz, lat: Math.abs(dx * fz - dz * fx) }; })
        .filter((c) => c.ahead > 4 && c.ahead < 40 && c.lat < 12 && taken.every((q) => Math.hypot(q.x - c.p.x, q.z - c.p.z) > 6)).sort((a, b) => a.ahead - b.ahead)[0];
      if (!c) return;
      const sp = c.p; taken.push(sp);
      const o = CATS[(vi + 1) % CATS.length];
      const cc = makeCat(ctx, 'bollard' + vi, { scale: 0.95, ...o, pose: vi === 1 ? 'loaf' : 'sit' });
      ctx.add(cc.group); stats.cats++;
      const rotY = Math.atan2(w.x - sp.x, w.z - sp.z) + (vi ? 0.9 : -0.7);   // three-quarter view to the walker
      const player = ctx.player?.position;
      actors.push({ h: cc, cat: true, slot: 470 + vi, update(t, dt) {
        cc.reset(); cc.group.position.set(sp.x, sp.y + 0.004, sp.z); cc.group.rotation.set(0, rotY, 0);
        let look = 0.6 * Math.sin(t * 0.13 + vi) * smooth(2, 4, (t + vi * 5) % 13);
        if (player && Math.hypot(player.x - sp.x, player.z - sp.z) < 6) { const a = Math.atan2(player.x - sp.x, player.z - sp.z) - rotY; look = clamp(Math.atan2(Math.sin(a), Math.cos(a)), -1.3, 1.3); }
        rot(cc.bn.neck, 0.05, look * 0.4, 0); rot(cc.bn.head, -0.08 + 0.04 * Math.sin(t * 0.3), look * 0.6, 0.1 * Math.sin(t * 0.23 + vi));
        cc.setEyes(((t + vi * 1.7) % 4.9) > 0.14);
        cc.bn.body.scale.set(1 + 0.02 * Math.sin(t * 2.3), 1 + 0.027 * Math.sin(t * 2.3), 1);
        earFlick(cc, t, 1.7 + vi);
        for (let k = 0; k < cc.tail.length; k++) rot(cc.tail[k], 0.16 * Math.sin(t * 1.1 - k * 0.6 + vi) * (k / cc.tail.length), 0.05 * Math.sin(t * 0.7 - k), 0);
      } });
    });
  }

  // ------------------------------------------------------------------ per-frame (distance LOD + frustum skip)
  const cam = ctx.camera;
  const frustum = new THREE.Frustum(), pm = new THREE.Matrix4(), sph = new THREE.Sphere();
  let frame = 0;
  function update(dt, t) {
    frame++;
    if (cam) { cam.updateMatrixWorld(); pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); frustum.setFromProjectionMatrix(pm); }
    for (const a of actors) {
      const g = (a.h.group || a.h).position;
      if (!a.inited) { a.update(t, dt); a.inited = true; continue; }
      if (cam) {
        const d2 = (g.x - cam.position.x) ** 2 + (g.z - cam.position.z) ** 2 + (g.y - cam.position.y) ** 2;
        const far = d2 > 320 * 320;
        for (const hh of a.group || [a.h]) (hh.group || hh).visible = !far;
        if (far) continue;
        if (dt > 0) {
          sph.set(g, a.group ? 6 : 2.5);
          if (!frustum.intersectsSphere(sph)) continue;
          if (d2 > 80 * 80 && (frame + (a.slot ?? 0)) % 4) continue;
        }
      }
      a.update(t, dt);
    }
  }
  return { actors, stats, update };
}
