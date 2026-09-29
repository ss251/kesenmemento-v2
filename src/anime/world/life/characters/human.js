// [v3:life] Adapted from Kenton-GMI/sakuragaoka-station (MIT, raw/ref/sakuragaoka-station/LICENSE), src/world/characters/human.js.
// Anime-proportion people (≈6.5–7 heads): one SkinnedMesh per person (vertex colours + a 512² atlas
// with the painted face and hair ramp), a small skeleton (spine, arms, legs, 8 skirt bones, hair
// chains) so skirts flare and hair sways with GPU skinning — the outline pre-pass follows it.
import * as THREE from 'three';
import { surface, rings, limb, sweep, curve, ellipsoid, rbox, weldNormals, SkinBuilder, TAU, DEG, clamp, lerp, smooth } from './skin.js';
import { faceUV, hairUV, cellUV, makeAtlas } from './atlas.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------ proportions
const BASE = {
  f: {
    H: 1.58, hip: 0.80, hipJx: 0.079, hipJy: 0.785, thigh: 0.372, shin: 0.352, ankle: 0.061,
    waist: 0.935, chest: 1.08, neck: 1.262, headB: 1.326, shX: 0.148, shY: 1.232, clavX: 0.03,
    uarm: 0.238, farm: 0.212, hand: 0.86,
    torso: [[0.80, 0.128, 0.099], [0.85, 0.126, 0.096], [0.90, 0.119, 0.089], [0.95, 0.110, 0.080], [1.00, 0.106, 0.075], [1.05, 0.112, 0.081],
      [1.10, 0.124, 0.089], [1.15, 0.135, 0.093], [1.19, 0.143, 0.089], [1.222, 0.142, 0.082], [1.246, 0.12, 0.07], [1.262, 0.074, 0.05], [1.28, 0.034, 0.03]],
    bust: 0.02, bustY: 1.13, neckR: 0.031,
    head: { rx: 0.098, ry: 0.109, rz: 0.104, cy: 0.135, cz: 0.014, jaw: 0.44, chin: 0.28, chinZ: 0.5, flat: 0.93 },
    thighR: [0.072, 0.046], calfR: 0.05, ankleR: 0.027, uarmR: [0.034, 0.028], farmR: [0.027, 0.021],
    pelvis: [[0.955, 0.112, 0.083], [0.90, 0.13, 0.097], [0.84, 0.136, 0.10], [0.785, 0.118, 0.088], [0.745, 0.06, 0.05], [0.735, 0, 0]],
  },
  m: {
    H: 1.72, hip: 0.90, hipJx: 0.09, hipJy: 0.875, thigh: 0.41, shin: 0.395, ankle: 0.07,
    waist: 1.03, chest: 1.19, neck: 1.405, headB: 1.472, shX: 0.186, shY: 1.37, clavX: 0.035,
    uarm: 0.275, farm: 0.245, hand: 0.98,
    torso: [[0.86, 0.150, 0.108], [0.93, 0.148, 0.104], [1.00, 0.144, 0.100], [1.07, 0.146, 0.101], [1.14, 0.155, 0.104], [1.21, 0.166, 0.107],
      [1.28, 0.176, 0.105], [1.33, 0.181, 0.099], [1.36, 0.176, 0.090], [1.383, 0.152, 0.080], [1.40, 0.102, 0.060], [1.418, 0.046, 0.042]],
    bust: 0, bustY: 1.25, neckR: 0.041,
    head: { rx: 0.095, ry: 0.107, rz: 0.103, cy: 0.131, cz: 0.012, jaw: 0.32, chin: 0.22, chinZ: 0.42, flat: 0.95 },
    thighR: [0.082, 0.053], calfR: 0.057, ankleR: 0.031, uarmR: [0.044, 0.036], farmR: [0.036, 0.027],
    pelvis: [[1.05, 0.146, 0.101], [0.99, 0.152, 0.106], [0.93, 0.154, 0.106], [0.875, 0.134, 0.094], [0.83, 0.07, 0.055], [0.815, 0, 0]],
  },
};

function proportions(spec) {
  const b = BASE[spec.sex || 'f'];
  const k = (spec.height || b.H) / b.H;
  const w = spec.width ?? 1;             // girth factor
  const hk = spec.headK ?? 1;             // head scale (children / elderly slightly larger)
  const P = { k, w, hk, sex: spec.sex || 'f' };
  for (const key of ['hip', 'hipJy', 'thigh', 'shin', 'ankle', 'waist', 'chest', 'neck', 'headB', 'shY', 'uarm', 'farm', 'bustY']) P[key] = b[key] * k;
  P.hipJx = b.hipJx * k * w; P.shX = (b.shX - 0.006) * k * (spec.shoulder ?? w); P.clavX = b.clavX * k; P.shY -= 0.01 * k;
  P.torso = b.torso.map(([y, a, bb]) => [y * k, a * k * w, bb * k * w]);
  if (spec.belly) P.torso = P.torso.map(([y, a, bb]) => { const f = 1 + spec.belly * Math.exp(-((((y / k) - (b.waist + 0.02)) / 0.12) ** 2)); return [y, a * f, bb * f * 1.04]; });
  P.pelvis = b.pelvis.map(([y, a, bb]) => [y * k, a * k * w, bb * k * w]);
  P.bust = b.bust * k * (spec.bust ?? 1);
  P.neckR = b.neckR * k * Math.sqrt(w);
  P.hand = b.hand * k;
  P.head = { ...b.head };
  for (const key of ['rx', 'ry', 'rz', 'cy', 'cz']) P.head[key] = b.head[key] * k * hk;
  if (spec.headShape) Object.assign(P.head, spec.headShape);
  // keep the chin on the head bone when the head is scaled
  P.headB = P.headB - (P.head.cy - b.head.cy * k) * 0.0;
  P.thighR = b.thighR.map(r => r * k * w); P.calfR = b.calfR * k * w; P.ankleR = b.ankleR * k * Math.sqrt(w);
  P.uarmR = b.uarmR.map(r => r * k * w); P.farmR = b.farmR.map(r => r * k * w);
  {
    // outer garment profile = torso, widened below the waist so untucked tops always cover trousers / belts / skirt bands
    const pel = P.pelvis.filter(r => r[1] > 0).slice().sort((a, c) => a[0] - c[0]);
    const pAt = (y) => { if (y <= pel[0][0]) return [pel[0][1], pel[0][2]]; for (let i = 1; i < pel.length; i++) if (y <= pel[i][0]) { const t = (y - pel[i - 1][0]) / (pel[i][0] - pel[i - 1][0]); return [lerp(pel[i - 1][1], pel[i][1], t), lerp(pel[i - 1][2], pel[i][2], t)]; } const l = pel[pel.length - 1]; return [l[1], l[2]]; };
    const ys = [...new Set([...P.torso.map(r => r[0]), ...pel.map(r => r[0])].map(y => +y.toFixed(4)))].sort((a, c) => a - c);
    P.outer = ys.map((y) => { const [a, bb] = prof(P.torso, y); if (y > P.waist + 0.03 * k) return [y, a, bb]; const [pa, pb] = pAt(y); return [y, Math.max(a, pa * 1.085), Math.max(bb, pb * 1.09)]; });
  }
  return P;
}

/** interpolate [y,a,b] profile at y */
function prof(tab, y) {
  if (y <= tab[0][0]) return [tab[0][1], tab[0][2]];
  for (let i = 1; i < tab.length; i++) {
    if (y <= tab[i][0]) { const t = (y - tab[i - 1][0]) / (tab[i][0] - tab[i - 1][0]); return [lerp(tab[i - 1][1], tab[i][1], t), lerp(tab[i - 1][2], tab[i][2], t)]; }
  }
  const l = tab[tab.length - 1]; return [l[1], l[2]];
}

// ------------------------------------------------------------------ the person
export class Human {
  constructor(ctx, spec) {
    this.ctx = ctx; this.spec = spec;
    this.P = proportions(spec);
    this.B = new SkinBuilder('chr_' + spec.key);
    this.group = new THREE.Group(); this.group.name = 'chr_' + spec.key;
    this.b = {};
    this.skirtBones = []; this.hairChains = []; this.extraBones = {};
    this.seed = spec.seed ?? 1;
    this._skeleton();
    this._head();
    this._body();
    this._hair();
    this._outfit();
    if (spec.props) for (const p of spec.props) p(this);
    // atlas & materials
    const variants = spec.variants || ['open', 'blink'];
    this.mats = {};
    const aspec = { key: spec.key, face: spec.face, hair: spec.hairTex, stripes: spec.stripes, plaid: spec.plaid, misc: spec.misc, misc2: spec.misc2 };
    for (const v of variants) this.mats[v] = ctx.mat.toon('#ffffff', { map: makeAtlas(ctx, aspec, v), vertexColors: true, side: 'double', paint: 0.025, noSnow: true });   // [v3:integrate] no snow caps on people
    this.mesh = this.B.build(this.group, this.mats[variants[0]]);
    this.face = variants[0];
    this.triangles = this.B.triangles;
    // rest pose cache
    this.rest = new Map();
    for (const bone of this.B.bones) this.rest.set(bone, { p: bone.position.clone() });
  }

  setFace(v) { if (v !== this.face && this.mats[v]) { this.mesh.material = this.mats[v]; this.face = v; } }

  // -------------------------------------------------------------- skeleton
  _skeleton() {
    const { B, P } = this; const b = this.b;
    b.root = B.bone('root', null, 0, 0, 0); this.group.add(b.root);
    b.hips = B.bone('hips', b.root, 0, P.hip, 0);
    b.spine = B.bone('spine', b.hips, 0, P.waist - P.hip, 0);
    b.chest = B.bone('chest', b.spine, 0, P.chest - P.waist, 0);
    b.neck = B.bone('neck', b.chest, 0, P.neck - P.chest, -0.004 * P.k);
    b.head = B.bone('head', b.neck, 0, P.headB - P.neck, -0.006 * P.k);
    for (const s of [1, -1]) {
      const n = s > 0 ? 'L' : 'R';
      b['clav' + n] = B.bone('clav' + n, b.chest, s * P.clavX, P.shY - P.chest, 0);
      b['uarm' + n] = B.bone('uarm' + n, b['clav' + n], s * (P.shX - P.clavX), 0, 0);
      b['farm' + n] = B.bone('farm' + n, b['uarm' + n], 0, -P.uarm, 0);
      b['hand' + n] = B.bone('hand' + n, b['farm' + n], 0, -P.farm, 0);
      b['thigh' + n] = B.bone('thigh' + n, b.hips, s * P.hipJx, P.hipJy - P.hip, 0);
      b['shin' + n] = B.bone('shin' + n, b['thigh' + n], 0, -P.thigh, 0);
      b['foot' + n] = B.bone('foot' + n, b['shin' + n], 0, -P.shin, 0);
    }
  }
  bindPos(bone) { return this.B.bindPos(bone); }
  /** convert root-space point to bone-local (bind has identity rotations) */
  local(bone, p) { const q = this.B.bindPos(bone); return [p[0] - q[0], p[1] - q[1], p[2] - q[2]]; }
  add(geo, o) { this.B.add(geo, o); }

  // -------------------------------------------------------------- head + face
  headPt(ph, th, R = 1) {
    const h = this.P.head;
    const cs = Math.cos(th);
    let x = Math.sin(ph) * cs, y = Math.sin(th), z = Math.cos(ph) * cs;
    x *= h.rx * R; z *= h.rz * R;
    if (y >= 0) y *= h.ry * R;
    else {
      const t = -y;
      x *= 1 - h.jaw * t * t;
      y = -h.ry * R * t * (1 + h.chin * t);
      if (z < 0) z *= 1 - 0.32 * t;
      z += h.chinZ * h.rz * R * t * t * (0.75 + 0.25 * Math.cos(ph) * cs);
    }
    if (z > 0) z *= h.flat;
    return [x, y + h.cy, z + h.cz];
  }
  _head() {
    const { P, b } = this; const sp = this.spec;
    const skin = sp.skin || '#f6dccb';
    // neck
    const nr = P.neckR;
    this.add(rings([{ y: -0.045 * P.k, a: nr * 1.25, b: nr * 1.1 }, { y: 0, a: nr, b: nr }, { y: (P.headB - P.neck) * 0.6, a: nr * 0.96, b: nr * 0.96 }, { y: (P.headB - P.neck) + 0.03 * P.k, a: nr * 0.94, b: nr * 0.94 }], 10), { bone: b.neck, color: skin });
    // head: grid over angles, uv into the painted face window
    const cols = 26, rows = 18;
    const g = surface(cols, rows, (u, v) => { const ph = (u - 0.5) * TAU, th = (0.5 - v) * Math.PI; return this.headPt(ph, th, 1); });
    {
      // bend face normals toward the face direction so the cel terminator never slices across the face
      const n = g.attributes.normal, p = g.attributes.position, F = new THREE.Vector3(0, 0.08, 1).normalize(), q = new THREE.Vector3(), q2 = new THREE.Vector3();
      const c0 = new THREE.Vector3(0, P.head.cy, P.head.cz - P.head.rz * 0.6);
      for (let i = 0; i < n.count; i++) {
        q.set(p.getX(i), p.getY(i), p.getZ(i)).sub(c0).normalize();            // softer sphere-like normal
        q.lerp(q2.set(n.getX(i), n.getY(i), n.getZ(i)), 0.35).normalize();
        q.lerp(F, smooth(-0.15, 0.55, q.z) * 0.72).normalize();                 // front of the face -> one tone
        n.setXYZ(i, q.x, q.y, q.z);
      }
      n.needsUpdate = true;
    }
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const ph = (uv.getX(i) - 0.5) * 360, th = (0.5 - uv.getY(i)) * 180;
      const f = faceUV(ph, th); uv.setXY(i, f[0], f[1]);
    }
    this.add(g, { bone: b.head, color: '#ffffff', rect: [0, 0, 1, 1] });
    // ears (visible on short hair)
    if (sp.ears) for (const s of [1, -1]) {
      const p = this.headPt(s * 88 * DEG, -10 * DEG, 0.99);
      this.add(ellipsoid(0.012 * P.k, 0.026 * P.k * P.hk, 0.018 * P.k, p, 8, 6), { bone: b.head, color: skin });
    }
  }

  // -------------------------------------------------------------- body (skin parts + limbs)
  _body() {
    const { P, b } = this; const sp = this.spec; const o = sp.outfit || {};
    const skin = sp.skin || '#f6dccb';
    for (const s of [1, -1]) {
      const n = s > 0 ? 'L' : 'R';
      // hands (mitten style with thumb); gloves recolour them
      this._hand(b['hand' + n], s, o.gloves || skin, (sp.hands && sp.hands[n]) || 'relax');
      // legs
      const legC = o.legs || skin;                         // skin / tights / trousers colour
      const trousers = o.bottom === 'trousers' || o.bottom === 'shorts';
      const tr = trousers ? 1.28 : 1;
      if (!trousers) {
        this.add(limb(P.thigh, P.thighR[0], P.thighR[1], { mid: [[0.5, (P.thighR[0] + P.thighR[1]) * 0.52]], cols: 10 }), { bone: b['thigh' + n], color: o.thighs || legC });
        // shin: knee..calf..ankle (+ socks)
        this.add(limb(P.shin, P.thighR[1] * 0.98, P.ankleR, { mid: [[0.28, P.calfR], [0.62, P.calfR * 0.78]], midZ: (t) => -0.006 * P.k * Math.sin(t * Math.PI), cols: 10 }), { bone: b['shin' + n], color: o.shins || legC });
        if (o.socks) {
          const top = o.socks.top ?? 0.35; // fraction of shin from the ankle
          const L = [];
          const ys = [1 - top, 1 - top + 0.04, 0.62, 0.8, 0.96, 1.0];
          for (const t of ys) { const r = t < 0.28 ? lerp(P.thighR[1], P.calfR, t / 0.28) : t < 0.62 ? lerp(P.calfR, P.calfR * 0.78, (t - 0.28) / 0.34) : lerp(P.calfR * 0.78, P.ankleR, (t - 0.62) / 0.38); L.push({ y: -P.shin * t, a: r + 0.0035 * P.k, b: r + 0.0035 * P.k }); }
          L[0].a -= 0.001; L[0].b -= 0.001;
          this.add(rings(L, 10), { bone: b['shin' + n], color: o.socks.color });
        }
      } else {
        const short = o.bottom === 'shorts';
        this.add(limb(P.thigh, P.thighR[0] * tr, P.thighR[1] * tr * 1.05, { mid: [[0.5, (P.thighR[0] + P.thighR[1]) * 0.55 * tr]], cols: 10, capBottom: short ? 0 : 0.75 }), { bone: b['thigh' + n], color: o.bottomColor });
        if (short) {
          this.add(limb(P.shin, P.thighR[1] * 0.98, P.ankleR, { mid: [[0.28, P.calfR], [0.62, P.calfR * 0.78]], cols: 10 }), { bone: b['shin' + n], color: skin });
          if (o.socks) this.add(rings([{ y: -P.shin * 0.8, a: P.calfR * 0.84, b: P.calfR * 0.84 }, { y: -P.shin * 0.9, a: P.ankleR * 1.25, b: P.ankleR * 1.25 }, { y: -P.shin * 1.02, a: P.ankleR * 1.2, b: P.ankleR * 1.2 }], 10), { bone: b['shin' + n], color: o.socks.color });
        } else {
          this.add(limb(P.shin, P.thighR[1] * tr * 1.02, P.ankleR * 1.75, { mid: [[0.3, P.calfR * 1.22]], cols: 10, capBottom: 0.2 }), { bone: b['shin' + n], color: o.bottomColor });
        }
      }
      // [v3:life] rubber boots (長靴): a tall glossy tube over the shin (trousers tucked in), rolled top band
      if (o.boots) {
        const bt = o.boots, top = bt.top ?? 0.72, R0 = Math.max(P.calfR * 1.34, P.thighR[1] * 1.2), R1 = P.ankleR * 1.9;
        const L = [];
        for (const t of [1 - top, 1 - top + 0.02, 0.35, 0.62, 0.86, 1.0, 1.06]) {
          const u = (t - (1 - top)) / top;
          const r = t > 1 ? R1 * 1.05 : lerp(R0, R1, Math.pow(Math.max(0, u), 1.4));
          L.push({ y: -P.shin * Math.min(t, 1.04), a: r, b: r * 1.08 });
        }
        L[0].a *= 0.94; L[0].b *= 0.94;
        this.add(rings(L, 12), { bone: b['shin' + n], color: bt.color });
        this.add(rings([{ y: -P.shin * (1 - top) + 0.004, a: R0 * 1.06, b: R0 * 1.12 }, { y: -P.shin * (1 - top) - 0.03 * P.k, a: R0 * 1.05, b: R0 * 1.11 }], 12), { bone: b['shin' + n], color: bt.band || bt.color });
      }
      this._shoe(b['foot' + n], s, o.boots ? { color: o.boots.color, sole: o.boots.sole || o.boots.color, type: 'sneaker' } : (o.shoes || { color: '#5b4336', sole: '#4a3a36', type: 'loafer' }));
    }
    // pelvis for trousers (covers hip joints)
    if (o.bottom === 'trousers' || o.bottom === 'shorts') {
      const L = P.pelvis.map(([y, a, bb]) => ({ y: y - P.hip, a: a * 1.06, b: bb * 1.06 }));
      this.add(rings(L, 14), { bone: b.hips, color: o.bottomColor });
      if (o.belt) this.add(rings([{ y: P.waist - P.hip + 0.012, a: P.pelvis[0][1] * 1.075, b: P.pelvis[0][2] * 1.08 }, { y: P.waist - P.hip - 0.018, a: P.pelvis[1][1] * 1.04, b: P.pelvis[1][2] * 1.05 }], 14), { bone: b.hips, color: o.belt });
    }
  }

  _hand(bone, s, color, style) {
    const k = this.P.hand;
    const add = (g) => this.add(g, { bone, color });
    const inward = -s; // palm faces the body
    if (style === 'fist' || style === 'grip' || style === 'point' || style === 'hold') {
      add(ellipsoid(0.021 * k, 0.036 * k, 0.037 * k, [0, -0.034 * k, 0.004 * k], 8, 6));
      // curled fingers: a rounded knuckle roll in front
      add(ellipsoid(0.02 * k, 0.024 * k, 0.03 * k, [inward * 0.006 * k, -0.062 * k, 0.018 * k], 8, 5));
      add(ellipsoid(0.01 * k, 0.022 * k, 0.011 * k, [inward * 0.012 * k, -0.04 * k, 0.03 * k], 6, 4)); // thumb
      if (style === 'point') this.add(limb(0.05 * k, 0.0085 * k, 0.007 * k, { cols: 6 }), { bone, color, matrix: new THREE.Matrix4().makeTranslation(inward * 0.004 * k, -0.07 * k, 0.03 * k) });
    } else {
      add(ellipsoid(0.02 * k, 0.046 * k, 0.037 * k, [inward * 0.002 * k, -0.046 * k, 0.003 * k], 8, 6));
      add(ellipsoid(0.017 * k, 0.03 * k, 0.034 * k, [inward * 0.005 * k, -0.085 * k, 0.006 * k], 8, 5));
      add(ellipsoid(0.01 * k, 0.024 * k, 0.011 * k, [inward * 0.01 * k, -0.034 * k, 0.03 * k], 6, 4));
    }
  }

  _shoe(bone, s, sh) {
    const P = this.P, k = P.k;
    const a = P.ankle; // ankle height above the sole
    const len = (P.sex === 'm' ? 0.26 : 0.225) * k, wid = (P.sex === 'm' ? 0.095 : 0.08) * k;
    const hh = sh.type === 'sneaker' ? 0.07 * k : 0.06 * k;
    // upper
    const g = surface(12, 6, (u, v) => {
      const ph = (u - 0.5) * TAU, th = (0.5 - v) * Math.PI;
      const cz = Math.cos(ph), sx = Math.sin(ph);
      const e = (x) => Math.sign(x) * Math.pow(Math.abs(x), 0.55);
      let x = e(sx) * e(Math.cos(th)) * wid / 2, y = e(Math.sin(th)) * hh / 2, z = e(cz) * e(Math.cos(th)) * len / 2;
      // toe narrower & lower, heel rounder
      const f = z / (len / 2);
      if (f > 0) { x *= 1 - 0.18 * f * f; y -= Math.max(0, y) * 0.35 * f * f; }
      if (y < -hh * 0.3) y = -hh * 0.3 + (y + hh * 0.3) * 0.25; // flatten the sole
      return [x, y, z];
    });
    const cy = -a + hh * 0.34, cz = len * 0.3;
    this.add(g, { bone, color: sh.color, matrix: new THREE.Matrix4().makeTranslation(0, cy, cz) });
    // sole
    this.add(rbox(wid * 1.04, 0.016 * k, len * 1.02, 0, [0, -a + 0.008 * k, cz]), { bone, color: sh.sole || '#4a3f3c' });
    if (sh.accent) this.add(rbox(wid * 1.05, 0.012 * k, len * 0.5, 0, [0, -a + 0.026 * k, cz - len * 0.08]), { bone, color: sh.accent });
  }

  // -------------------------------------------------------------- torso helpers
  torsoPt(tab, ph, y, off = 0, bust = this.P.bust) {
    const [a, bb] = prof(tab, y);
    const bump = bust > 0 ? bust * Math.exp(-(((y - this.P.bustY) / (0.05 * this.P.k)) ** 2)) * Math.pow(Math.max(0, Math.cos(ph)), 2) : 0;
    return [Math.sin(ph) * (a + off), y, Math.cos(ph) * (bb + off) + bump];
  }
  torsoWeights() {
    const { P, b } = this;
    return (lx, ly, lz) => {
      const y = ly + this.B.bindPos(b.spine)[1];
      const wc = smooth(P.chest - 0.07 * P.k, P.chest + 0.05 * P.k, y);
      let ws = 1 - wc, wh = 0;
      if (y < P.waist) { wh = ws * smooth(P.waist, P.waist - 0.08 * P.k, y); ws -= wh; }
      return [[b.chest, wc], [b.spine, ws], [b.hips, wh]];
    };
  }
  /** Garment on the torso. opts: {y0 (hem), y1 (top), color, off, vOpen:{yV, ang}, cols, colorFn} */
  torsoGarment(o) {
    const { P, b } = this;
    const tab = o.tab || P.torso;
    const rowsY = [];
    const y0 = o.y0, y1 = o.y1 ?? tab[tab.length - 1][0];
    for (const r of tab) if (r[0] > y0 + 0.004 && r[0] < y1 - 0.004) rowsY.push(r[0]);
    rowsY.unshift(y0); rowsY.push(y1);
    // extra rows for smooth V opening
    if (o.vOpen) { for (let t = 0.2; t < 1; t += 0.2) rowsY.push(lerp(o.vOpen.yV, y1, t)); rowsY.push(o.vOpen.yV); rowsY.sort((a, c) => a - c); }
    const ys = [...new Set(rowsY.map(y => +y.toFixed(5)))];
    const rows = ys.length - 1, cols = o.cols || 20;
    const spY = this.B.bindPos(b.spine)[1];
    const g = surface(cols, rows, (u, v) => {
      const y = ys[Math.round(v * rows)];
      let ph;
      if (o.vOpen) {
        const t = smooth(o.vOpen.yV, y1, y);
        const op = o.vOpen.ang * Math.pow(t, 0.8) * DEG;
        ph = op + u * (TAU - 2 * op);
      } else ph = (u - 0.5) * TAU;
      let off = (o.off || 0) + (o.hemFlare ? o.hemFlare * smooth(y0 + 0.08 * P.k, y0, y) : 0);
      const p = this.torsoPt(tab, ph, y, off);
      return [p[0], p[1] - spY, p[2]];
    });
    this.add(g, { bone: b.spine, color: o.color, weights: this.torsoWeights(), colorFn: o.colorFn });
    return g;
  }
  /** Patch lying on the torso surface: boundary curves inner(u)->[ph,y], outer(u)->[ph,y] (deg, m) */
  torsoPatch(inner, outer, o) {
    const { b } = this; const tab = o.tab || this.P.outer;
    const spY = this.B.bindPos(b.spine)[1];
    const cols = o.cols || 16, rows = o.rows || 4;
    const g = surface(cols, rows, (u, v) => {
      const A = inner(u), C = outer(u);
      const ph = lerp(A[0], C[0], v) * DEG, y = lerp(A[1], C[1], v);
      const p = this.torsoPt(tab, ph, y, (o.off || 0.004) + (o.lift ? o.lift(u, v) : 0));
      return [p[0], p[1] - spY, p[2]];
    });
    if (o.uvFn) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) { const r = o.uvFn(uv.getX(i), uv.getY(i)); uv.setXY(i, r[0], r[1]); } }
    this.add(g, { bone: b.spine, color: o.color, weights: this.torsoWeights(), rect: o.uvFn ? [0, 0, 1, 1] : undefined });
    return g;
  }

  // -------------------------------------------------------------- arms / sleeves
  sleeves(o) {
    const { P, b } = this;
    for (const s of [1, -1]) {
      const n = s > 0 ? 'L' : 'R';
      const ua = P.uarmR, fa = P.farmR, f = o.loose ?? 1.1;
      this.add(limb(P.uarm, ua[0] * f * 0.96, ua[1] * f, { mid: [[0.45, (ua[0] + ua[1]) * 0.5 * f * 1.02]], cols: 10, capTop: 0.3 }), { bone: b['uarm' + n], color: o.color });
      if (o.short) {
        this.add(limb(P.uarm * (1 - o.short), ua[1] * 0.95, ua[1] * 0.92, { cols: 10, capTop: 0 }), { bone: b['uarm' + n], color: o.skin, matrix: new THREE.Matrix4().makeTranslation(0, -P.uarm * o.short, 0) });
        this.add(limb(P.farm, fa[0], fa[1], { cols: 10 }), { bone: b['farm' + n], color: o.skin });
        continue;
      }
      const len = o.rolled ? P.farm * 0.35 : P.farm;
      this.add(limb(len, fa[0] * f * 1.02, (o.rolled ? fa[0] : fa[1]) * f * (o.bell ?? 1.06), { cols: 10, capBottom: 0.3 }), { bone: b['farm' + n], color: o.color });
      if (o.rolled) {
        this.add(rings([{ y: -len + 0.012, a: fa[0] * f * 1.12, b: fa[0] * f * 1.12 }, { y: -len - 0.018, a: fa[0] * f * 1.18, b: fa[0] * f * 1.15 }, { y: -len - 0.03, a: fa[0] * 1.02, b: fa[0] * 1.02 }], 10), { bone: b['farm' + n], color: o.color });
        this.add(limb(P.farm, fa[0], fa[1], { cols: 10, capTop: 0 }), { bone: b['farm' + n], color: o.skin });
      }
      if (o.cuff) {
        const c = o.cuff, r = fa[1] * f * 1.12, h = c.h * P.k;
        const L = [{ y: -P.farm + h, a: r * 0.98, b: r * 0.98 }, { y: -P.farm + h - 0.002, a: r, b: r }, { y: -P.farm - 0.004, a: r * 1.02, b: r * 1.02 }, { y: -P.farm - 0.006, a: r * 0.8, b: r * 0.8 }];
        const g = rings(L, 10);
        if (c.stripes) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) { const vv = uv.getY(i); const r2 = cellUV(0, 0.5, 1 - (0.62 + vv * 0.38)); uv.setXY(i, r2[0], r2[1]); } this.add(g, { bone: b['farm' + n], color: '#ffffff', rect: [0, 0, 1, 1] }); }
        else this.add(g, { bone: b['farm' + n], color: c.color });
      }
    }
  }

  // -------------------------------------------------------------- skirts
  skirt(o) {
    const { P, b } = this;
    const K = 8;
    const yTop = o.yTop ?? (P.waist + 0.02 * P.k), yHem = o.yHem;
    const [aT, bT] = prof(P.torso, yTop);
    const aw = aT * 1.02, bw = bT * 1.04;
    const hipB = this.B.bindPos(b.hips);
    if (!this.skirtBones.length) {
      for (let k = 0; k < K; k++) {
        const ph = k / K * TAU;
        const sb = this.B.bone('skirt' + k, b.hips, Math.sin(ph) * aw, yTop - P.hip, Math.cos(ph) * bw);
        sb.userData.ph = ph; this.skirtBones.push(sb);
      }
    }
    // radius profile: waist -> hip -> hem
    const hipY = P.hipJy - 0.01 * P.k;
    const [aH, bH] = prof(P.pelvis, hipY);
    const rows = o.rows || 7;
    const N = o.pleats || 0;
    const segs = N ? N * 2 : (o.cols || 22);
    const R = (t) => { // t 0 top .. 1 hem
      const y = lerp(yTop, yHem, t);
      const hipT = clamp((yTop - hipY) / (yTop - yHem), 0.05, 0.6);
      let a, bb;
      if (t < hipT) { const s2 = Math.sin(t / hipT * Math.PI / 2); a = lerp(aw, aH * 1.18, s2); bb = lerp(bw, bH * 1.2, s2); }
      else { const s2 = (t - hipT) / (1 - hipT); a = aH * 1.18 + (o.flare ?? 0.07) * P.k * s2; bb = bH * 1.2 + (o.flare ?? 0.07) * P.k * s2 * 0.95; }
      return [a, bb, y];
    };
    const pos = [], uvs = [];
    const pleat = o.pleatDepth ?? 0.07;
    const pt = (i, j) => {
      const t = j / rows; const [a, bb, y] = R(t);
      const ph = i / segs * TAU;
      let f = 1;
      if (N) f = (i % 2 === 0) ? 1 - pleat * (0.3 + t) * 0.5 : 1 + pleat * (0.3 + t) * 0.5;
      return [Math.sin(ph) * a * f, y - P.hip, Math.cos(ph) * bb * f, ph, t];
    };
    const tri = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < segs; i++) {
      const A = pt(i, j), Bp = pt(i + 1, j), C = pt(i, j + 1), D = pt(i + 1, j + 1);
      const uA = (i % 2) * 0.5, uB = uA + 0.5;
      tri.push([A, uA, j / rows], [C, uA, (j + 1) / rows], [Bp, uB, j / rows], [Bp, uB, j / rows], [C, uA, (j + 1) / rows], [D, uB, (j + 1) / rows]);
    }
    for (const [p, u, v] of tri) { pos.push(p[0], p[1], p[2]); uvs.push(u, v); }
    let g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    if (N) g.computeVertexNormals();
    else { const m = (g2) => { g2 = mergeByPos(g2); g2.computeVertexNormals(); weldNormals(g2); return g2; }; g = m(g); }
    const weights = (lx, ly, lz) => {
      let ph = Math.atan2(lx, lz); if (ph < 0) ph += TAU;
      const t = clamp((yTop - P.hip - ly) / (yTop - yHem), 0, 1);
      const kf = ph / TAU * K, k0 = Math.floor(kf) % K, k1 = (k0 + 1) % K, f = kf - Math.floor(kf);
      const gw = Math.pow(t, 1.25);
      return [[b.hips, 1 - gw], [this.skirtBones[k0], gw * (1 - f)], [this.skirtBones[k1], gw * f]];
    };
    const uvFn = o.plaid ? (lx, ly, lz, u, v) => cellUV(1, u, 1 - v) : undefined;
    this.add(g, { bone: b.hips, color: o.plaid ? '#ffffff' : o.color, weights, uvFn });
    // waistband
    this.add(rings([{ y: yTop - P.hip + 0.012 * P.k, a: aw * 1.01, b: bw * 1.01 }, { y: yTop - P.hip + 0.014 * P.k, a: aw * 1.03, b: bw * 1.03 }, { y: yTop - P.hip - 0.02 * P.k, a: aw * 1.07, b: bw * 1.08 }], 16), { bone: b.hips, color: o.band || o.color });
    this.skirtInfo = { yTop, yHem, aw, bw };
  }

  // -------------------------------------------------------------- hair
  _hair() {
    const hs = this.spec.hair; if (!hs) return;
    const { P, b } = this;
    const h = P.head;
    const c = [0, h.cy, h.cz];
    const hk = P.k * P.hk;
    const uvFn = (lx, ly, lz) => {
      const dx = lx - c[0], dy = ly - c[1], dz = lz - c[2];
      const r = Math.hypot(dx, dy, dz) || 1;
      let row = (1 - Math.asin(clamp(dy / r, -1, 1)) / (Math.PI / 2)) * 0.5;
      if (dy < -h.ry) row = 0.5 + 0.5 * clamp(0.6 + (-dy - h.ry) / 0.5, 0, 1); // hanging strands: darker tips
      const ph = Math.atan2(dx, dz);
      return hairUV(row, 0.5 + 0.44 * Math.sin(ph * 4));
    };
    const addHair = (g, weights) => this.add(g, { bone: b.head, color: '#ffffff', uvFn, weights });
    // ---- cap
    const hlFront = hs.hairlineFront ?? 15, hlSide = hs.hairlineSide ?? -22, hlBack = hs.hairlineBack ?? -58;
    const hairline = (ph) => { const a = Math.abs(ph) / DEG; return lerp(lerp(hlFront, hlSide, smooth(25, 95, a)), hlBack, smooth(100, 175, a)); };
    const Rtop = hs.volume ?? 1.09, Rbot = (ph) => (hs.flare ? lerp(1.06, 1.06 + hs.flare, smooth(40, 110, Math.abs(ph) / DEG)) : 1.065);
    const capW = hs.capWeights ? hs.capWeights : undefined;
    addHair(surface(30, 11, (u, v) => {
      const phn = (u - 0.5) * TAU;
      const vv = Math.min(1, v / 0.91);
      const th = lerp(90, hairline(phn), Math.pow(vv, 0.9)) * DEG;
      const R = v > 0.95 ? 0.975 : lerp(Rtop, Rbot(phn), vv);
      return this.headPt(phn, th, R);
    }), capW);
    const out = (p) => V(p.x - c[0], (p.y - c[1]) * 0.8, p.z - c[2]).normalize();
    const lock = (ctrl, w0, t0, opts = {}) => {
      const pts = curve(ctrl.map(q => (q.length === 3 && q.isAng) ? this.headPt(q[0], q[1], q[2]) : q), opts.n || 7);
      const g = sweep(pts, (s) => w0 * hk * (opts.wf ? opts.wf(s) : Math.pow(1 - s, 0.7) * (s < 0.12 ? 0.75 + s * 2 : 1)), (s) => t0 * hk * (1 - 0.65 * s), opts.out || out, 5);
      addHair(g, opts.weights);
      return g;
    };
    const A = (phDeg, thDeg, R) => { const a = [phDeg * DEG, thDeg * DEG, R]; a.isAng = true; return a; };
    // ---- fringe
    const fr = hs.fringe || { n: 7, span: 62, tip: 4, len: 1 };
    for (let i = 0; i < fr.n; i++) {
      const t = fr.n === 1 ? 0.5 : i / (fr.n - 1);
      const ph = lerp(-fr.span, fr.span, t);
      const side = Math.sign(ph) || 1;
      const skew = (fr.skew ?? 6) * (t - 0.5) * 2 + (fr.part ? fr.part * (ph < fr.partAt ? -1 : 1) : 0);
      const edge = Math.abs(t - 0.5) * 2; // 0 centre .. 1 edge
      const tipTh = (fr.tip ?? 4) - edge * edge * (fr.edgeDrop ?? 18) + ((i * 7919) % 5 - 2) * 1.6;
      lock([A(ph * 0.6, 62, 1.02), A(ph * 0.85 + skew * 0.2, 40, Rtop * 1.01), A(ph + skew * 0.6, 20, 1.08), A(ph + skew, tipTh, 1.035 + edge * 0.02)],
        (fr.w ?? 0.05) * (1 - edge * 0.2) * 1.15, fr.t ?? 0.024, { n: 7 });
    }
    // ---- side locks (in front of the ears)
    if (hs.side) for (const s of [1, -1]) {
      const sd = hs.side;
      const base = [A(s * 64, 42, 1.04), A(s * 76, 12, 1.09), A(s * 80, -30, 1.1)];
      const p2 = this.headPt(s * 78 * DEG, -70 * DEG, 1.12);
      const ctrl = [...base, [p2[0], p2[1], p2[2] + 0.004]];
      if (sd.long) ctrl.push([p2[0] * 1.08, p2[1] - sd.long * hk, p2[2] + 0.012 * hk]);
      const wfn = sd.long ? this._chainWeights(s > 0 ? 'sideL' : 'sideR', p2[1], p2[0], p2[2], sd.long * hk + 0.04) : undefined;
      if (sd.long) { const ch = this.hairChains[this.hairChains.length - 1]; ch.amp = 0.55; ch.maxFwd = 0.5; }
      lock(ctrl, (sd.w ?? 0.034) * 1.2, 0.022, { n: 8, weights: wfn });
    }
    // ---- back hair
    if (hs.back) this._backHair(hs.back, lock, A, addHair, c, hk);
    if (hs.ponytail) this._ponytail(hs.ponytail, A, addHair, hk);
    if (hs.bun) {
      const p = this.headPt(Math.PI, (hs.bun.th ?? 18) * DEG, 1.1);
      const r = hs.bun.r * hk;
      addHair(ellipsoid(r * 1.05, r * 0.9, r * 0.85, [p[0], p[1], p[2] - r * 0.55], 12, 8));
      this.add(rings([{ y: 0, a: 0.003, b: 0.003 }, { y: -0.001, a: 0.004 * hk, b: 0.004 * hk }, { y: -0.075 * hk, a: 0.003 * hk, b: 0.003 * hk }], 5), { bone: b.head, color: hs.bun.pin || '#9a6b5a', matrix: new THREE.Matrix4().makeRotationZ(1.1).setPosition(p[0] - 0.03 * hk, p[1] + 0.035 * hk, p[2] - r * 0.4) });
    }
    if (hs.crown) for (const cr of hs.crown) lock([A(cr[0], 80, 1.0), A(cr[0] + cr[2] * 0.5, cr[1] * 0.5 + 40, Rtop + 0.02), A(cr[0] + cr[2], cr[1], Rtop + 0.03)], cr[3] ?? 0.05, 0.02, { n: 6 });
    if (hs.ahoge) lock([A(10, 86, 1.05), A(18, 95, 1.22), [0.02 * hk, h.cy + h.ry * 1.42, h.cz + 0.03 * hk]], 0.018, 0.008, { n: 6, out: () => V(1, 0, 0) });
    if (hs.accessory) hs.accessory(this, A);
  }
  /** Hair chain (2 bones hanging from the head) + smooth weights. Returns weight fn. */
  _chainWeights(name, y0, x0 = null, z0 = null, len = 0.3, lateral = null) {
    const { b } = this;
    let ch = this.hairChains.find(c => c.name === name);
    if (!ch) {
      const b1 = this.B.bone('hair_' + name + '1', b.head, x0 ?? 0, y0, z0 ?? 0);
      const b2 = this.B.bone('hair_' + name + '2', b1, 0, -len * 0.5, 0);
      ch = { name, b1, b2, y0, len, amp: 1, x0: x0 ?? 0 };
      this.hairChains.push(ch);
    }
    return (lx, ly, lz) => {
      const s = clamp((y0 - ly) / len, 0, 1.2);
      const w1 = smooth(0.0, 0.35, s), w2 = smooth(0.35, 0.95, s);
      return [[b.head, 1 - w1], [ch.b1, w1 - w2], [ch.b2, w2]];
    };
  }
  _backHair(bk, lock, A, addHair, c, hk) {
    const { P, b } = this; const h = P.head;
    const napeY = h.cy - h.ry * 0.95;
    const L = bk.len * hk;       // length below the nape
    const n = bk.n ?? 7;
    // three chains across the back so the curtain moves as a mass
    const chains = [-1, 0, 1].map((i) => ({ i, name: 'back' + i, x: i * 0.07 * hk }));
    for (const ch of chains) this._chainWeights(ch.name, napeY, ch.x, h.cz - h.rz * 1.1, L);
    const weightFor = (lx, ly, lz) => {
      const s = clamp((napeY - ly) / L, 0, 1.2);
      const w1 = smooth(-0.05, 0.35, s), w2 = smooth(0.35, 0.95, s);
      const ws = chains.map(ch => Math.exp(-(((lx - ch.x) / (0.07 * hk)) ** 2)));
      const tot = ws.reduce((a, x) => a + x, 0) || 1;
      const out = [[b.head, 1 - w1]];
      // pick the two strongest chains
      const idx = [0, 1, 2].sort((a, c2) => ws[c2] - ws[a]).slice(0, 2);
      const t2 = ws[idx[0]] + ws[idx[1]];
      for (const k of idx) { const chn = this.hairChains.find(cc => cc.name === chains[k].name); out.push([chn.b1, (w1 - w2) * ws[k] / t2], [chn.b2, w2 * ws[k] / t2]); }
      return out;
    };
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const ph = lerp(-Math.min(bk.span ?? 110, 115), Math.min(bk.span ?? 110, 115), t);        // around the back (deg from the back centre)
      const phw = 180 + ph;
      const e = Math.abs(t - 0.5) * 2;
      const p1 = this.headPt(phw * DEG, -35 * DEG, 1.1);
      const x = p1[0] * (1.05 + e * 0.1);
      const zBack = h.cz - h.rz * (1.12 - e * 0.35) - (bk.clear ?? 0.02) * hk;
      const len = L * (1 - e * (bk.taper ?? 0.25)) * (1 + ((i * 37) % 7 - 3) * 0.03);
      const ctrl = [A(phw, 40, 1.03), A(phw, 5, 1.1), p1, [x * 1.02, napeY - L * 0.12, zBack], [x * (1 + (bk.spread ?? 0.25)), napeY - len * 0.6, zBack - 0.01 * hk], [x * (1 + (bk.spread ?? 0.25) * 1.2), napeY - len, zBack + 0.006 * hk]];
      lock(ctrl, (bk.w ?? 0.07) * (1 - e * 0.2), 0.03, { n: 10, weights: weightFor, wf: (s) => (s < 0.1 ? 0.8 + s * 2 : 1) * Math.pow(1 - Math.max(0, s - 0.55) / 0.45, 0.9) });
    }
  }
  _ponytail(pt, A, addHair, hk) {
    const { P, b } = this; const h = P.head;
    const tie = this.headPt(Math.PI, (pt.th ?? 22) * DEG, 1.07);
    const L = pt.len * hk;
    const b1 = this.B.bone('hair_pony1', b.head, tie[0], tie[1], tie[2] - 0.02 * hk);
    const b2 = this.B.bone('hair_pony2', b1, 0, -L * 0.45, -0.04 * hk);
    this.hairChains.push({ name: 'pony', b1, b2, y0: tie[1], len: L, amp: 1.6 });
    const pts = curve([[tie[0], tie[1], tie[2] + 0.01], [0, tie[1] + 0.01 * hk, tie[2] - 0.045 * hk], [0, tie[1] - L * 0.25, tie[2] - 0.075 * hk], [0, tie[1] - L * 0.6, tie[2] - 0.06 * hk], [0.004, tie[1] - L, tie[2] - 0.03 * hk]], 11);
    const wts = (lx, ly, lz) => { const s = clamp((tie[1] - ly) / L, 0, 1.1); const w1 = smooth(-0.05, 0.3, s), w2 = smooth(0.3, 0.9, s); return [[b.head, 1 - w1], [b1, w1 - w2], [b2, w2]]; };
    const g = sweep(pts, (s) => (pt.w ?? 0.065) * hk * (s < 0.08 ? 0.55 + s * 5 : Math.pow(1 - s, 0.75) * (1 + 0.35 * Math.sin(Math.min(1, s * 1.6) * Math.PI))), (s) => (pt.w ?? 0.065) * 0.75 * hk * (s < 0.08 ? 0.6 + s * 5 : Math.pow(1 - s, 0.8)), (p) => V(1, 0, 0), 7);
    addHair(g, wts);
    // tie band
    this.add(rings([{ y: 0.012, a: 0.0, b: 0.0 }, { y: 0.01, a: 0.016 * hk, b: 0.013 * hk }, { y: -0.01, a: 0.017 * hk, b: 0.014 * hk }, { y: -0.012, a: 0, b: 0 }], 8), { bone: b.head, color: pt.tie || '#c86a78', matrix: new THREE.Matrix4().makeRotationX(Math.PI / 2 - 0.3).setPosition(tie[0], tie[1] + 0.004, tie[2] - 0.024 * hk) });
  }

  // -------------------------------------------------------------- outfits
  _outfit() {
    const o = this.spec.outfit; if (!o) return;
    const { P, b } = this; const k = P.k;
    const top = o.top;
    if (top === 'sailor') this._sailor(o);
    else if (top === 'blazer' || top === 'jacket' || top === 'staff' || top === 'cardigan') this._jacket(o);
    else if (top === 'sweater' || top === 'hoodie' || top === 'blouse' || top === 'shirt') this._simpleTop(o);
    if (o.bottom === 'pleats') this.skirt({ yHem: o.hem * k, color: o.bottomColor, pleats: o.pleats ?? 18, flare: o.flare ?? 0.075, plaid: o.plaid });
    else if (o.bottom === 'skirt') this.skirt({ yHem: o.hem * k, color: o.bottomColor, flare: o.flare ?? 0.1, rows: 8, cols: 24 });
    if (o.apron) this._apron(o.apron);
  }
  _sailor(o) {
    const { P, b } = this; const k = P.k;
    const y1 = P.torso[P.torso.length - 1][0];
    this.torsoGarment({ y0: P.waist - 0.075 * k, y1, color: o.topColor, off: 0.006 * k, hemFlare: 0.012 * k, tab: P.outer });
    this.sleeves({ color: o.topColor, cuff: { h: 0.045, stripes: true }, bell: 1.12 });
    // big sailor collar: back square flap + shoulders + front V
    const yN = P.neck + 0.004 * k, yV = P.chest - 0.03 * k, ySh = P.shY - 0.03 * k, yFlap = P.shY - 0.17 * k;
    const inner = (u) => {
      if (u < 0.3) { const t = u / 0.3; return [lerp(0, 34, t), lerp(yV + 0.005, yN - 0.005, Math.pow(t, 0.9))]; }
      const t = (u - 0.3) / 0.7; return [lerp(34, 180, t), yN + 0.006 * Math.sin(t * Math.PI)];
    };
    const outer = (u) => {
      if (u < 0.3) { const t = u / 0.3; return [lerp(0, 66, t), lerp(yV, ySh, Math.pow(t, 0.75))]; }
      if (u < 0.55) { const t = (u - 0.3) / 0.25; return [lerp(66, 118, t), ySh - 0.006 * k * t]; }
      if (u < 0.7) { const t = (u - 0.55) / 0.15; return [118, lerp(ySh - 0.006 * k, yFlap, t)]; }
      const t = (u - 0.7) / 0.3; return [lerp(118, 180, t), yFlap];
    };
    for (const s of [1, -1]) {
      this.torsoPatch((u) => { const p = inner(u); return [s * p[0], p[1]]; }, (u) => { const p = outer(u); return [s * p[0], p[1]]; },
        { off: 0.011 * k, cols: 22, rows: 5, color: '#ffffff', uvFn: (u, v) => cellUV(0, 0.5, 1 - v) });
    }
    // scarf knot + tails at the V
    const spY = this.B.bindPos(b.spine)[1];
    const vp = this.torsoPt(P.outer, 0, yV + 0.012 * k, 0.022 * k);
    const sc = o.scarf || '#c86a78';
    const kc = [vp[0], vp[1] - spY, vp[2]];
    this.add(ellipsoid(0.02 * k, 0.016 * k, 0.012 * k, kc, 10, 6), { bone: b.spine, color: sc, weights: this.torsoWeights() });
    for (const s of [1, -1]) {
      // bow loops
      this.add(ellipsoid(0.03 * k, 0.014 * k, 0.008 * k, [kc[0] + s * 0.026 * k, kc[1] + 0.004 * k, kc[2] - 0.003 * k], 10, 6, (x, y, z) => [x, y + Math.abs(x) * 0.25 * s * 0, z - x * x * 6]), { bone: b.spine, color: sc, weights: this.torsoWeights() });
      // tails
      const pts = curve([[kc[0] + s * 0.004, kc[1] - 0.004, kc[2]], [kc[0] + s * 0.014 * k, kc[1] - 0.05 * k, kc[2] + 0.004], [kc[0] + s * 0.02 * k, kc[1] - 0.09 * k, kc[2] - 0.004 * k]], 5);
      const g = sweep(pts, (t) => 0.026 * k * (0.7 + t * 0.5), () => 0.004 * k, () => V(0, 0, 1), 4);
      this.add(g, { bone: b.spine, color: sc, weights: this.torsoWeights() });
    }
  }
  _jacket(o) {
    const { P, b } = this; const k = P.k;
    const y1 = P.torso[P.torso.length - 1][0];
    const kind = o.top;
    const yV = (o.vY ?? (kind === 'staff' ? 0.93 : 0.9)) * (P.chest - P.waist) + P.waist;
    // inner shirt (visible in the V) + tie / ribbon
    this.torsoGarment({ y0: P.waist - 0.02 * k, y1, color: o.shirt || '#eeebe6', off: 0.003 * k });
    const jHem = o.jHemY ? o.jHemY * k : P.hipJy - (kind === 'cardigan' ? -0.03 : 0.04) * k;
    this.torsoGarment({ y0: jHem, y1: y1 - 0.004 * k, color: o.topColor, off: 0.011 * k, vOpen: { yV, ang: o.vAng ?? 34 }, hemFlare: 0.014 * k, cols: 22, tab: P.outer });
    this.sleeves({ color: o.topColor, loose: 1.2, cuff: o.cuffColor ? { h: 0.03, color: o.cuffColor } : null, bell: 1.05 });
    // lapels / collar strips along the V
    const yN = y1 - 0.004 * k;
    if (kind !== 'cardigan') {
      for (const s of [1, -1]) {
        const edge = (t) => { const y = lerp(yV, yN, t); const tt = smooth(yV, yN, y); return [s * (o.vAng ?? 34) * Math.pow(tt, 0.8), y]; };
        this.torsoPatch((u) => edge(u), (u) => { const e = edge(u); const w = lerp(6, 30, Math.sin(Math.min(1, u * 1.25) * Math.PI / 2)) * (u > 0.8 ? lerp(1, 0.6, (u - 0.8) / 0.2) : 1); return [e[0] + s * w, e[1] - 0.004 * k * u]; },
          { off: 0.016 * k, cols: 10, rows: 2, color: o.lapel || o.topColor });
      }
      // back collar band
      this.torsoPatch((u) => [lerp(30, 330, u), yN + 0.034 * k], (u) => [lerp(30, 330, u), yN - 0.02 * k], { off: 0.017 * k, cols: 18, rows: 2, color: o.lapel || o.topColor });
    } else {
      // cardigan: ribbed front bands
      for (const s of [1, -1]) {
        this.torsoPatch((u) => { const y = lerp(jHem, yN, u); const tt = smooth(yV, yN, y); return [s * ((o.vAng ?? 34) * Math.pow(tt, 0.8) + 0.5), y]; }, (u) => { const y = lerp(jHem, yN, u); const tt = smooth(yV, yN, y); return [s * ((o.vAng ?? 34) * Math.pow(tt, 0.8) + 9), y]; }, { off: 0.014 * k, cols: 14, rows: 1, color: o.band || o.topColor });
      }
    }
    // shirt collar points
    for (const s of [1, -1]) {
      this.torsoPatch((u) => [s * lerp(4, 40, u), yN + 0.012 * k - u * 0.006 * k], (u) => [s * lerp(10, 30, u), yN - 0.035 * k + u * 0.02 * k], { off: 0.012 * k, cols: 4, rows: 2, color: o.shirt || '#eeebe6' });
    }
    // tie or ribbon
    const spY = this.B.bindPos(b.spine)[1];
    if (o.tie) {
      const pts = [];
      for (let i = 0; i <= 6; i++) { const y = lerp(yN - 0.018 * k, yV - 0.05 * k, i / 6); const p = this.torsoPt(P.outer, 0, y, 0.008 * k); pts.push(V(p[0], p[1] - spY, p[2])); }
      this.add(sweep(pts, (t) => (0.022 + 0.022 * t) * k * (t > 0.93 ? 0.6 : 1), () => 0.005 * k, () => V(0, 0, 1), 4), { bone: b.spine, color: o.tie, weights: this.torsoWeights() });
      const kp = this.torsoPt(P.outer, 0, yN - 0.012 * k, 0.012 * k);
      this.add(ellipsoid(0.013 * k, 0.012 * k, 0.008 * k, [kp[0], kp[1] - spY, kp[2]], 8, 6), { bone: b.spine, color: o.tie, weights: this.torsoWeights() });
    }
    if (o.ribbon) {
      const kp = this.torsoPt(P.outer, 0, yN - 0.03 * k, 0.014 * k);
      const kc = [kp[0], kp[1] - spY, kp[2]];
      this.add(ellipsoid(0.011 * k, 0.011 * k, 0.008 * k, kc, 8, 6), { bone: b.spine, color: o.ribbon, weights: this.torsoWeights() });
      for (const s of [1, -1]) {
        this.add(ellipsoid(0.024 * k, 0.012 * k, 0.007 * k, [kc[0] + s * 0.021 * k, kc[1] + 0.002, kc[2] - 0.002], 8, 6), { bone: b.spine, color: o.ribbon, weights: this.torsoWeights() });
        const pts = curve([[kc[0] + s * 0.003, kc[1] - 0.004, kc[2]], [kc[0] + s * 0.012 * k, kc[1] - 0.035 * k, kc[2] + 0.002], [kc[0] + s * 0.016 * k, kc[1] - 0.055 * k, kc[2] - 0.002]], 4);
        this.add(sweep(pts, () => 0.016 * k, () => 0.004 * k, () => V(0, 0, 1), 4), { bone: b.spine, color: o.ribbon, weights: this.torsoWeights() });
      }
    }
    // buttons
    const btn = o.buttons || (kind === 'cardigan' ? o.band : null);
    if (btn) {
      const nb = kind === 'staff' ? 4 : kind === 'cardigan' ? 4 : 2;
      for (let i = 0; i < nb; i++) {
        const y = lerp(yV - 0.02 * k, jHem + 0.06 * k, nb === 1 ? 0 : i / (nb - 1) * (kind === 'blazer' ? 0.45 : 0.9));
        const s = kind === 'cardigan' ? -1 : 1;
        const p = this.torsoPt(P.outer, s * (kind === 'cardigan' ? 4.5 : 6) * DEG, y, 0.017 * k);
        this.add(ellipsoid(0.0065 * k, 0.0065 * k, 0.0035 * k, [p[0], p[1] - spY, p[2]], 6, 4), { bone: b.spine, color: o.buttonColor || btn, weights: this.torsoWeights() });
        if (kind === 'staff') { const p2 = this.torsoPt(P.outer, -6 * DEG * s, y, 0.017 * k); this.add(ellipsoid(0.0065 * k, 0.0065 * k, 0.0035 * k, [p2[0], p2[1] - spY, p2[2]], 6, 4), { bone: b.spine, color: o.buttonColor || btn, weights: this.torsoWeights() }); }
      }
    }
    // breast pocket / emblem / name tag
    if (o.emblem) {
      const p = this.torsoPt(P.outer, 26 * DEG, P.chest + 0.04 * k, 0.014 * k);
      this.add(rbox(0.04 * k, 0.04 * k, 0.004 * k, 0, [p[0], p[1] - spY, p[2]]), { bone: b.spine, color: o.emblem, weights: this.torsoWeights(), matrix: null });
    }
    if (o.nameTag) {
      const p = this.torsoPt(P.outer, -26 * DEG, P.chest + 0.05 * k, 0.015 * k);
      this.add(rbox(0.055 * k, 0.018 * k, 0.004 * k, 0, [p[0], p[1] - spY, p[2]]), { bone: b.spine, color: o.nameTag, weights: this.torsoWeights() });
    }
    if (o.pockets) for (const s of [1, -1]) {
      const p = this.torsoPt(P.outer, s * 42 * DEG, jHem + 0.07 * k, 0.014 * k);
      this.add(rbox(0.07 * k, 0.012 * k, 0.005 * k, 0, [p[0], p[1] - spY, p[2]]), { bone: b.spine, color: o.lapel || o.topColor, weights: this.torsoWeights(), matrix: new THREE.Matrix4().makeRotationY(s * 0.55) });
    }
  }
  _simpleTop(o) {
    const { P, b } = this; const k = P.k;
    const y1 = P.torso[P.torso.length - 1][0];
    const tucked = o.tucked;
    const y0 = tucked ? P.waist - 0.02 * k : P.waist - (o.top === 'hoodie' ? 0.13 : 0.09) * k;
    this.torsoGarment({ y0, y1, color: o.topColor, off: (o.top === 'sweater' || o.top === 'hoodie' ? 0.01 : 0.005) * k, hemFlare: tucked ? 0 : 0.008 * k, tab: tucked ? P.torso : P.outer });
    if (o.top === 'sweater' || o.top === 'hoodie') this.torsoPatch((u) => [lerp(-180, 180, u), y0 + 0.028 * k], (u) => [lerp(-180, 180, u), y0 - 0.002], { off: 0.016 * k, cols: 20, rows: 1, color: o.band || o.topColor });
    this.sleeves({ color: o.topColor, loose: o.top === 'hoodie' ? 1.3 : 1.18, short: o.shortSleeve, skin: this.spec.skin, rolled: o.rolled, cuff: (o.top === 'sweater' || o.top === 'hoodie') ? { h: 0.03, color: o.band || o.topColor } : null });
    const spY = this.B.bindPos(b.spine)[1];
    const yN = y1 - 0.004 * k;
    if (o.collar) for (const s of [1, -1]) this.torsoPatch((u) => [s * lerp(4, 70, u), yN + 0.014 * k], (u) => [s * lerp(14, 40, u), yN - 0.03 * k + u * 0.022 * k], { off: 0.014 * k, cols: 5, rows: 2, color: o.collar });
    if (o.top === 'hoodie') {
      // hood bunched behind the neck + drawstrings
      const p = this.torsoPt(P.outer, Math.PI, yN - 0.03 * k, 0.03 * k);
      this.add(ellipsoid(0.13 * k, 0.07 * k, 0.07 * k, [p[0], p[1] - spY + 0.02 * k, p[2] + 0.01 * k], 14, 8, (x, y, z) => [x, y, z + x * x * 2.2]), { bone: b.spine, color: o.topColor, weights: this.torsoWeights() });
      for (const s of [1, -1]) { const q = this.torsoPt(P.outer, s * 12 * DEG, yN - 0.02 * k, 0.012 * k); const pts = curve([[q[0], q[1] - spY, q[2]], [q[0] + s * 0.004, q[1] - spY - 0.06 * k, q[2] + 0.012 * k], [q[0] + s * 0.006, q[1] - spY - 0.12 * k, q[2] + 0.018 * k]], 4); this.add(sweep(pts, () => 0.006 * k, () => 0.006 * k, () => V(0, 0, 1), 4), { bone: b.spine, color: o.band || '#e6e3dd', weights: this.torsoWeights() }); }
      const pp = this.torsoPt(P.outer, 0, P.waist - 0.05 * k, 0.017 * k);
      this.add(rbox(0.16 * k, 0.07 * k, 0.012 * k, 0, [pp[0], pp[1] - spY, pp[2] - 0.004]), { bone: b.spine, color: o.topColor, weights: this.torsoWeights() });
    }
    if (o.top === 'sweater' && o.shirtCollar) for (const s of [1, -1]) this.torsoPatch((u) => [s * lerp(2, 50, u), yN + 0.01 * k], (u) => [s * lerp(14, 30, u), yN - 0.035 * k + u * 0.022 * k], { off: 0.016 * k, cols: 4, rows: 2, color: o.shirtCollar });
  }
  _apron(a) {
    const { P, b } = this; const k = P.k;
    const y1 = P.chest + 0.07 * k, yW = P.waist + 0.01 * k, yH = a.hem * k;
    // bib (chest -> waist) on the torso
    this.torsoPatch((u) => [lerp(-38, 38, u), y1], (u) => [lerp(-44, 44, u), yW], { off: 0.02 * k, cols: 8, rows: 3, color: a.color });
    // skirt panel (waist -> hem) as its own surface, attached to hips + thighs
    const hipB = this.B.bindPos(b.hips);
    const g = surface(12, 6, (u, v) => {
      const y = lerp(yW, yH, v);
      const ph = lerp(-62, 62, u) * DEG * lerp(1, 0.9, v);
      const [pa, pb] = y > P.hipJy ? prof(P.torso, y) : prof(P.pelvis, P.hipJy);
      const r = (y > P.hipJy ? 1 : 1.25) + 0.12 * v;
      return [Math.sin(ph) * (pa * r + 0.02 * k), y - P.hip, Math.cos(ph) * (pb * r + 0.03 * k) + v * 0.02 * k];
    });
    const wts = (lx, ly, lz) => { const v = clamp((yW - P.hip - ly) / (yW - yH), 0, 1); const w = smooth(0.2, 1, v); const side = lx > 0 ? b.thighL : b.thighR; return [[b.hips, 1 - w * 0.6], [side, w * 0.3], [lx > 0 ? b.thighR : b.thighL, w * 0.3]]; };
    this.add(g, { bone: b.hips, color: a.color, weights: wts });
    // neck strap + waist ties
    for (const s of [1, -1]) {
      const pts = [];
      for (let i = 0; i <= 5; i++) { const t = i / 5; const ph = lerp(s * 36, s * 150, t) * DEG; const y = lerp(y1, P.neck - 0.005 * k, Math.sin(t * Math.PI / 2)); const p = this.torsoPt(P.outer, ph, y, 0.016 * k); pts.push(V(p[0], p[1] - this.B.bindPos(b.spine)[1], p[2])); }
      this.add(sweep(pts, () => 0.012 * k, () => 0.003 * k, (p) => V(p.x, 0, p.z).normalize(), 4), { bone: b.spine, color: a.strap || a.color, weights: this.torsoWeights() });
    }
    const bk = this.torsoPt(P.outer, Math.PI, yW, 0.02 * k);
    const sp = this.B.bindPos(b.spine)[1];
    for (const s of [1, -1]) this.add(ellipsoid(0.03 * k, 0.012 * k, 0.008 * k, [bk[0] + s * 0.025 * k, bk[1] - sp, bk[2] - 0.004], 8, 5), { bone: b.spine, color: a.strap || a.color, weights: this.torsoWeights() });
    // waist band around the body
    this.torsoPatch((u) => [lerp(-180, 180, u), yW + 0.012 * k], (u) => [lerp(-180, 180, u), yW - 0.012 * k], { off: 0.021 * k, cols: 22, rows: 1, color: a.strap || a.color });
    if (a.pocket) { const p = this.torsoPt(P.outer, 0, yW + 0.05 * k, 0.023 * k); this.add(rbox(0.1 * k, 0.05 * k, 0.004 * k, 0, [p[0], p[1] - sp, p[2]]), { bone: b.spine, color: a.pocket, weights: this.torsoWeights() }); }
  }

  // -------------------------------------------------------------- attachments (props)
  /** Extra bone for a prop (e.g. book page). */
  propBone(name, parent, x, y, z) { const bn = this.B.bone(name, parent, x, y, z); this.extraBones[name] = bn; return bn; }
}

/** merge coincident vertices of a non-indexed geometry (keeps first uv) */
function mergeByPos(g) {
  const p = g.attributes.position, uv = g.attributes.uv;
  const map = new Map(); const pos = [], uvs = [], idx = [];
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(5)},${p.getY(i).toFixed(5)},${p.getZ(i).toFixed(5)}`;
    let j = map.get(key);
    if (j === undefined) { j = pos.length / 3; map.set(key, j); pos.push(p.getX(i), p.getY(i), p.getZ(i)); uvs.push(uv.getX(i), uv.getY(i)); }
    idx.push(j);
  }
  const o = new THREE.BufferGeometry();
  o.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  o.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  o.setIndex(idx);
  return o;
}
