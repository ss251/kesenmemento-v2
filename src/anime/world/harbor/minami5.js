// [v5:photos] 南町 / 内湾 waterfront rebuilt against the author's own photos (raw/photos-sailesh, 2026-10-01 17:07-17:22
// JST, IMG_0799-0842; the highest-priority source, docs/anime/OVERRIDES.md). Called from harbor/minami.js.
//
//   PIER7 bay side (IMG_0800-0806, 0814-0817): the T.P. 6.2 m seawall IS the bay-side ground storey (board-formed concrete),
//        the 2F terrace runs on top of it, and a 3.6 m deck on slim white stilts (white tie rods) stands out over the quay
//        asphalt with a stainless wire rail hung with string lights (GSI deck footprints pier7Deck / pier7Deck2). The 2F is
//        glazed with a dark-brown vertical-board band at its head; the 3F (street side) is glazed under a low gable roof
//        with deep eaves and exposed white rafters. NW end: a single glazed room on the deck under its own big gable roof
//        (ラヂオ気仙沼's studio); SE end: a white vertical-board block whose NW face carries 「PIER7」 and a painting of the bay.
//   PIER7 street NW corner (IMG_0799, 0823): glass 1F box, a timber deck with steps and the rust-brown NAIWAN 創 totem, a
//        timber stair up to the 2F along the street face, the roof eave carried on clusters of white slender columns.
//   the plaza (IMG_0800-0813): flat at quay level, rectangular grey-beige pavers with bands of small granite setts, the
//        three white ring benches (stepped rings round a sunken lawn with a young tree and two lamp posts), the 陸閘 winch,
//        reddish composite bleachers rising NW to the lawn, a 2-storey white mesh stair cage, and the elevated walkway
//        (concrete deck, dark fascia, stainless rail with lights) that bridges the gate opening between 迎's terrace and
//        PIER7's deck (GSI mukaeruDeck + pier7Deck) on concrete piers; the gate post with the yellow 注意 board.
//   迎 ムカエル (IMG_0808, 0824-0828): from the SE: the ANCHOR café (khaki render, ANCHOR clerestory letters, café RST neon,
//        HAVE A NICE COFFEE oval, Lander Blue / SHARKS boards, glazed COFFEE DONUTS corner), a tall grey ribbed-metal 3F box
//        with an external steel stair, then the lower wings (charcoal boards and 「nine one」 on the street, dark timber on
//        the bay) under a gull-wing wavy roof; the purple NAIWAN 迎 WELCOME HOUSE totem on a composite deck with steps and a
//        broad composite stair up to the 2F terrace.
//   結 ユワエル (IMG_0821, 0830, 0834-0842): single-storey shops in natural cedar boards behind a colonnade of weathered posts
//        under a white corrugated fascia (BLACK TIDE BREWING in green letters), a taller white corrugated back volume, the
//        light-blue NAIWAN 結 totem and the 「Kesennuma slow street 結」 map board; 拓 ヒラケル (IMG_0831, 0833, 0840): white
//        corrugated + grey timber panels, 「Kesennuma Amway House Hirakeru」, a timber pergola with かつお banners; the slow
//        street between them: pavers with red and dark bands, string lights criss-crossing overhead.
//   the convenience store across 魚町港町線 (IMG_0820, 0822, 0829): a generic striped storefront with a brick end wall, a
//        solar roof, and a "7"-style pole sign (no trademark copied).
//   road markings (IMG_0821, 0828-0832): the zebra crossings at the 結 junction, the hatched median (導流帯), the ◇
//        crossing-ahead marks and black bollards with white bands.
import * as THREE from 'three';
import { SITES, MINAMI } from './real.js';
import { prismWalls, capGeo, offsetRing, obbOf, seg, barAlong, openRing, signedArea, paint, resample } from './lmkit.js';
import { nightMat, registry } from './lights.js';
import { mapMat, textTex, FONT } from './util.js';

export const C5 = {
  wall: '#9c9b99', wallDark: '#8f8e89', deck: '#9c7c60', stilt: '#f2f2ef', rail: '#b7bec4', dbrown: '#5b4232', soffit: '#9a7452',
  roofLight: '#dfe1df', roofDark: '#77767a', fascia: '#f1f1ee', wboard: '#eef0ee', khaki: '#a29480', rib: '#c4c9cc', charcoal: '#4f5257',
  timberDark: '#5a4130', comp: '#93695a', paver: '#a59f96', sett: '#7d7c7e', cedar: '#c9a477', gtimber: '#9c958b', corr: '#e4e5e2',
  post: '#857d72', steel: '#5d6168', mesh: '#f4f4f2', purple: '#3b3577', rust: '#6b3a2a', aqua: '#4aa8d6', yellow: '#e8c93a',
};

/** The plaza between 迎 and PIER7, at quay level (the old stepped-garden outline plus the strip under the walkway). */
export const PLAZA = [[-0.1, 33], [16.8, 24.5], [40.2, 64.8], [23.9, 72.6], [7.6, 67.8], [-4.5, 74.9], [-9.5, 50.1], [-3.9, 47.4]];
/** The seawall line on PIER7's bay side: the inner edge of the GSI deck footprints (pier7Deck, pier7Deck2), from the gate
 *  post north of PIER7 to the SE end; the stilted deck stands 3.6 m out from it. */
export const P7WALL = [[10, 64.1], [19.9, 80.1], [27.5, 89], [36.5, 96.9], [49.1, 107.1], [65.5, 122.5]];
/** The elevated walkway at the wall crest: from 迎's deck (GSI mukaeruDeck) over the gate opening to PIER7's NW face (its
 *  underside fills the top of IMG_0820 from 11 m away; IMG_0799 / 0823 show it arriving at PIER7's NW end). */
export const WALKWAY = [[-3.2, 34.5], [1.0, 42.0], [2.8, 49.5], [3.6, 57.5], [4.2, 64.0], [4.7, 69.4]];
/** The convenience store across 魚町港町線 (Google Earth 2026-03-11 shed with a solar roof, c6.json; IMG_0822 / 0829). */
export const KONBINI = { poly: [[-80.8, 36], [-70.3, 32.3], [-62, 49.5], [-72.5, 53.3]], front: 1, brick: 2, pole: [-59.6, 45.2] };

const lerp = (p, q, f) => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
function edgesOf(poly, fn) {
  const P = openRing(poly), sign = Math.sign(signedArea(P)) || 1;
  for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 0.3) continue; const u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len]; fn(a, b, len, sign > 0 ? [u[1], -u[0]] : [-u[1], u[0]], u, i); }
}
const inPoly = (x, z, poly) => { let c = false; const P = openRing(poly); for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, zi] = P[i], [xj, zj] = P[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
/** Clip a ring to lo <= (p - o)·u <= hi. */
export function clipAxis(ring, o, u, lo, hi) {
  const pr = (p) => (p[0] - o[0]) * u[0] + (p[1] - o[1]) * u[1];
  const clip = (R, keep) => { const out = []; for (let i = 0; i < R.length; i++) { const p = R[i], q = R[(i + 1) % R.length], kp = keep(pr(p)), kq = keep(pr(q)); if (kp.in) out.push(p); if (kp.in !== kq.in) { const t = kp.d / (kp.d - kq.d); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); } } return out; };
  return clip(clip(openRing(ring), (v) => ({ in: v >= lo, d: v - lo })), (v) => ({ in: v <= hi, d: hi - v }));
}
const ry = (n) => Math.atan2(n[0], n[1]);

/** Materials and painted textures (cached on ctx). */
export function mats5(ctx) {
  if (ctx.__m5) return ctx.__m5;
  const t = (c, o) => ctx.mat.toon(c, o);
  const tex = (key, w, h, fn) => paint(ctx, 'p5-' + key, w, h, fn, [1, 1]);
  const boards = (key, base, line, vertical, pitch, knots = 0) => tex(key, 256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const r = ctx.rng('p5' + key);
    for (let i = 0; i < w; i += pitch) { g.fillStyle = line; if (vertical) g.fillRect(i, 0, 1.5, h); else g.fillRect(0, i, w, 1.5); g.globalAlpha = 0.12; g.fillStyle = r() < 0.5 ? '#ffffff' : '#000000'; if (vertical) g.fillRect(i + 2, 0, pitch - 3, h); else g.fillRect(0, i + 2, w, pitch - 3); g.globalAlpha = 1; }
    for (let i = 0; i < knots; i++) { g.fillStyle = 'rgba(90,60,35,0.45)'; g.beginPath(); g.ellipse(r() * w, r() * h, 2 + r() * 2, 1.5, 0, 0, 7); g.fill(); }
  });
  const T = {
    wall: tex('wall', 256, 256, (g, w, h) => {   // board-formed seawall concrete: form panels, tie holes, run-off streaks
      g.fillStyle = C5.wall; g.fillRect(0, 0, w, h);
      const r = ctx.rng('p5wall');
      for (let y = 0; y < h; y += 64) for (let x = 0; x < w; x += 128) { g.fillStyle = r() < 0.5 ? '#a8a7a1' : '#9d9c96'; g.fillRect(x + 1, y + 1, 126, 62); for (const [tx, ty] of [[24, 16], [104, 16], [24, 48], [104, 48]]) { g.fillStyle = '#7f7e7a'; g.fillRect(x + tx, y + ty, 3, 3); } }
      g.globalAlpha = 0.18; for (let i = 0; i < 26; i++) { g.fillStyle = r() < 0.6 ? '#5f5e5a' : '#c4c3bd'; g.fillRect(r() * w, r() * h * 0.3, 2 + r() * 4, 40 + r() * 140); } g.globalAlpha = 1;
    }),
    dbrown: boards('dbrown', C5.dbrown, '#3f2d22', true, 10),
    cedar: boards('cedar', C5.cedar, '#a6855b', false, 18, 26),
    gtimber: boards('gtimber', C5.gtimber, '#7c766d', false, 16, 10),
    corr: boards('corr', C5.corr, '#c9cbc8', true, 6),
    corrH: boards('corrH', C5.corr, '#c9cbc8', false, 6),
    rib: boards('rib', C5.rib, '#9fa09c', true, 22),
    wboard: boards('wboard', C5.wboard, '#d4d7d5', true, 9),
    charcoal: boards('charcoal', C5.charcoal, '#3e4044', true, 12),
    timberDark: boards('timberDark', C5.timberDark, '#3f2d21', true, 9),
    comp: boards('comp', C5.comp, '#6f4436', false, 20),
    deck: boards('deck', C5.deck, '#7a5c45', false, 14),
    paver: tex('paver', 512, 512, (g, w, h) => {   // 8 m tile: 0.4 x 0.2 m pavers in running bond, grey-beige mix
      g.fillStyle = '#857f78'; g.fillRect(0, 0, w, h);
      const r = ctx.rng('p5paver'), px = w / 8, cols = ['#a59f96', '#9b958c', '#ada79d', '#958f87', '#a0a09a', '#b1aba1'];
      for (let row = 0; row < 40; row++) { const y = row * 0.2 * px, off = (row % 2) * 0.2 * px; for (let x = -off; x < w; x += 0.4 * px) { g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(x + 1, y + 1, 0.4 * px - 2, 0.2 * px - 2); } }
    }),
    sett: tex('sett', 128, 128, (g, w, h) => { g.fillStyle = '#5f5f62'; g.fillRect(0, 0, w, h); const r = ctx.rng('p5sett'); for (let y = 0; y < h; y += 16) for (let x = 0; x < w; x += 16) { g.fillStyle = ['#7d7c7e', '#87868a', '#737275', '#8e8d90'][Math.floor(r() * 4)]; g.fillRect(x + 1.5, y + 1.5, 13, 13); } }),
    mesh: tex('mesh', 128, 128, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = C5.mesh; g.lineWidth = 3; for (let i = 0; i <= w; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); } }),
    painting: tex('painting', 512, 256, (g, w, h) => {   // the bay painting on PIER7's SE block: sky, hills, the bay and boats
      const sky = g.createLinearGradient(0, 0, 0, h * 0.5); sky.addColorStop(0, '#9fc4e4'); sky.addColorStop(1, '#e4eef2'); g.fillStyle = sky; g.fillRect(0, 0, w, h);
      g.fillStyle = '#5e8a58'; g.beginPath(); g.moveTo(0, h * 0.55); for (let x = 0; x <= w; x += 16) g.lineTo(x, h * (0.42 + 0.1 * Math.sin(x / 70) + 0.05 * Math.sin(x / 23))); g.lineTo(w, h * 0.6); g.lineTo(0, h * 0.6); g.fill();
      g.fillStyle = '#3d74a8'; g.fillRect(0, h * 0.58, w, h * 0.42); g.fillStyle = '#6aa0cf'; for (let i = 0; i < 9; i++) g.fillRect(i * 57, h * (0.66 + (i % 3) * 0.08), 30, 3);
      for (const [x, c] of [[90, '#ffffff'], [230, '#f0e2c4'], [370, '#ffffff']]) { g.fillStyle = c; g.beginPath(); g.moveTo(x, h * 0.7); g.lineTo(x + 60, h * 0.7); g.lineTo(x + 50, h * 0.76); g.lineTo(x + 8, h * 0.76); g.fill(); g.fillRect(x + 20, h * 0.63, 18, h * 0.07); }
      g.strokeStyle = '#2f3c4a'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
    }),
    stripes: tex('stripes', 256, 64, (g, w, h) => {   // a generic convenience-store fascia: white with orange / green / red bands (no logo)
      g.fillStyle = '#f7f7f4'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ef7d2b'; g.fillRect(0, h * 0.18, w, h * 0.16); g.fillStyle = '#ffffff'; g.fillRect(0, h * 0.34, w, h * 0.06); g.fillStyle = '#2a9a4e'; g.fillRect(0, h * 0.4, w, h * 0.16); g.fillStyle = '#ffffff'; g.fillRect(0, h * 0.56, w, h * 0.06); g.fillStyle = '#d6343a'; g.fillRect(0, h * 0.62, w, h * 0.16);
    }),
    brick: tex('brick', 128, 128, (g, w, h) => { g.fillStyle = '#6e3a2c'; g.fillRect(0, 0, w, h); const r = ctx.rng('p5brick'); for (let y = 0; y < h; y += 8) for (let x = -((y / 8) % 2) * 8; x < w; x += 16) { g.fillStyle = ['#8d4a38', '#97543f', '#834434'][Math.floor(r() * 3)]; g.fillRect(x + 1, y + 1, 14, 6); } }),
  };
  const mm = (key, o = { paint: 0.04 }) => mapMat(ctx, 'toon', '#ffffff', T[key], o);
  const m = {
    wall: mm('wall'), dbrown: mm('dbrown'), cedar: mm('cedar'), gtimber: mm('gtimber'), corr: mm('corr'), corrH: mm('corrH'), rib: mm('rib'),
    wboard: mm('wboard'), charcoal: mm('charcoal'), timberDark: mm('timberDark'), comp: mm('comp'), deck: mm('deck', { paint: 0.04, side: 'double' }),
    paver: mm('paver', { paint: 0.02, polygonOffset: -2 }), sett: mm('sett', { paint: 0.02, polygonOffset: -3 }), brick: mm('brick'),
    mesh: mapMat(ctx, 'decal', '#ffffff', T.mesh, { transparent: true, alphaTest: 0.4, side: 'double' }),
    painting: mapMat(ctx, 'toon', '#ffffff', T.painting, { paint: 0 }), stripes: mapMat(ctx, 'toon', '#ffffff', T.stripes, { paint: 0 }),
    stilt: t(C5.stilt, { paint: 0.02 }), rail: t(C5.rail, { paint: 0 }), soffit: t(C5.soffit, { paint: 0.04, side: 'double' }),
    roofLight: t(C5.roofLight, { paint: 0.03, side: 'double' }), roofDark: t(C5.roofDark, { paint: 0.03, side: 'double' }), fascia: t(C5.fascia, { paint: 0.02 }),
    khaki: t(C5.khaki, { paint: 0.05 }), steel: t(C5.steel, { paint: 0 }), white: t('#f1f1ee', { paint: 0.03 }), whiteD: t('#f1f1ee', { paint: 0.03, side: 'double' }), concrete: t('#b4b2ab', { paint: 0.06 }),
    darkConcrete: t('#4f555c', { paint: 0.03 }), greySoffit: t('#c4c6c4', { paint: 0.03, side: 'double' }), lawn: t('#7d9f58', { paint: 0.08 }), soil: t('#4f4a3e', { paint: 0.08 }), trunk: t('#6e5646', { paint: 0 }),
    leaf: t('#6f9a5a', { paint: 0.07 }), leafB: t('#86ad6a', { paint: 0.07 }), black: t('#26272a', { paint: 0 }), yellow: t(C5.yellow, { paint: 0 }),
    purple: t(C5.purple, { paint: 0.02 }), rust: t(C5.rust, { paint: 0.03 }), aqua: t(C5.aqua, { paint: 0.02 }), grey: t('#8f9396', { paint: 0.03 }), post: t(C5.post, { paint: 0.05 }),
    orange: t('#e2572e', { paint: 0.02 }), asphalt: t('#56575c', { paint: 0.03, polygonOffset: -1 }),
    roadWhite: t('#efefe9', { paint: 0.01, polygonOffset: -3 }), pv: t('#2b3444', { paint: 0 }), red: t('#c8372d', { paint: 0.02 }),
    glass: nightMat(ctx, '#8aa4b8', '#ffdcaa', 1.3), glassDim: nightMat(ctx, '#6c7a84', '#ffd9a0', 1.5), glassWarm: nightMat(ctx, '#9fb2bd', '#ffd9a0', 1.45), glassShop: nightMat(ctx, '#8e9ea6', '#ffe2b0', 1.6),
    bulb: nightMat(ctx, '#efe6c8', '#ffd890', 2.4), lamp: nightMat(ctx, '#e8e6dc', '#fff0d0', 2.2), neonBlue: nightMat(ctx, '#3d7fd0', '#5cc8ff', 2.4), neonRed: nightMat(ctx, '#d84a5a', '#ff6f86', 2.4),
  };
  ctx.__m5 = m;
  return m;
}

/** A self-lit textured material (neon and lit sign faces), cached per texture. */
const _glow = new Map();
function glowMat(ctx, tex, k = 1.25) { const key = tex.uuid + '|' + k; if (!_glow.has(key)) { const mm = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.3, toneMapped: false, depthWrite: false }); mm.color.setScalar(k); _glow.set(key, mm); } return _glow.get(key); }
/** A text plane; bg makes it an opaque board. */
function sign(ctx, k, text, w, h, x, y, z, rotY, { color = '#2b2a33', bg = null, font = FONT.sans, weight = 900, size = 0.72, emissive = false } = {}) {
  const tex = textTex(ctx, text, { w: 1024, h: Math.max(64, Math.round(1024 * h / w)), color, bg, font, weight, size });
  const mat = emissive ? glowMat(ctx, tex) : mapMat(ctx, bg ? 'toon' : 'decal', '#ffffff', tex, bg ? { paint: 0 } : { transparent: true, alphaTest: 0.3 });
  return k.plane(w, h, mat, [x, y, z], [0, rotY, 0]);
}

/** A low gable roof over a quad-ish footprint: ridge along the long axis, deep eaves with a timber soffit, white fascia and
 *  exposed rafters. eaveY = the eave height at the wall line. */
export function gableRoof(k, m, poly, eaveY, { eave = 2.0, pitch = 0.16, light = 'roofLight', dark = 'roofDark', rafters = 1.2, darkSide = null } = {}) {
  const o = obbOf(poly), hw = o.w / 2 + eave, hl = o.d / 2 + eave, rise = hw * pitch, slope = Math.hypot(hw, rise), a = Math.atan2(rise, hw);
  const vx = -o.uz, vz = o.ux;   // across the ridge
  for (const sd of [-1, 1]) {
    const cx = o.cx + vx * sd * hw / 2, cz = o.cz + vz * sd * hw / 2, y = eaveY + rise / 2 - eave * pitch;
    const darkHere = darkSide === null ? sd > 0 : sd === darkSide;
    const top = k.box(slope, 0.16, hl * 2, darkHere ? m[dark] : m[light], [cx, y + 0.12, cz]); top.rotation.order = 'YXZ'; top.rotation.set(0, o.rotY, sd * a);
    const sof = k.box(slope, 0.1, hl * 2, m.soffit, [cx, y - 0.03, cz]); sof.rotation.order = 'YXZ'; sof.rotation.set(0, o.rotY, sd * a);
    // fascia along the eave edge
    const ex = o.cx + vx * sd * hw, ez = o.cz + vz * sd * hw;
    k.box(0.12, 0.42, hl * 2, m.fascia, [ex, eaveY - eave * pitch, ez], [0, o.rotY, 0]);
    // rafters from the wall line out to the fascia
    if (rafters) for (let s = -hl + 0.6; s <= hl - 0.6; s += rafters) {
      const mx = o.cx + vx * sd * (o.w / 2 + eave / 2) + o.ux * s, mz = o.cz + vz * sd * (o.w / 2 + eave / 2) + o.uz * s;
      k.box(eave + 0.4, 0.22, 0.09, m.fascia, [mx, eaveY - eave * pitch / 2 - 0.2, mz], [0, o.rotY, 0]);
    }
  }
  // gable ends: triangles closing the roof void
  const tri = new THREE.BufferGeometry(), P = [];
  for (const se of [-1, 1]) {
    const bx = o.cx + o.ux * se * (o.d / 2), bz = o.cz + o.uz * se * (o.d / 2);
    P.push(bx + vx * (o.w / 2), eaveY + eave * pitch * 0 - 0.05, bz + vz * (o.w / 2), bx - vx * (o.w / 2), eaveY - 0.05, bz - vz * (o.w / 2), bx, eaveY + (o.w / 2) * pitch, bz);
  }
  tri.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); tri.computeVertexNormals();
  k.mesh(tri, m.whiteD);
  return { ridgeY: eaveY + rise - eave * pitch, o };
}

/** String lights: warm bulbs every `step` m along a sagging line between a and b ([x, y, z]). */
function stringLights(k, m, a, b, step = 0.7, sag = 0.25) {
  const len = Math.hypot(b[0] - a[0], b[2] - a[2]); const n = Math.max(2, Math.round(len / step));
  for (let i = 0; i <= n; i++) { const f = i / n, y = a[1] + (b[1] - a[1]) * f - sag * 4 * f * (1 - f); k.box(0.07, 0.09, 0.07, m.bulb, [a[0] + (b[0] - a[0]) * f, y, a[2] + (b[2] - a[2]) * f]); }
}
/** A stainless rail along a polyline: posts, top rail, three wires, optional lights. */
function railAlong(k, m, pts, y, { lights = true, h = 1.1 } = {}) {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], s = seg(a, b);
    barAlong(k, a, b, y + h, 0.06, 0.06, m.rail);
    for (const f of [0.35, 0.6, 0.85]) barAlong(k, a, b, y + h * f, 0.02, 0.02, m.rail);
    for (let d = 0; d <= s.len; d += 1.6) k.box(0.05, h, 0.05, m.rail, [a[0] + s.ux * d, y + h / 2, a[1] + s.uz * d]);
    if (lights) stringLights(k, m, [a[0], y + h + 0.02, a[1]], [b[0], y + h + 0.02, b[1]], 0.8, 0.12);
  }
}
/** A young tree: thin trunk with a stake, a light crown of a few low-poly lumps. */
function youngTree(k, m, x, y, z, s = 1, r = Math.random) {
  k.cyl(0.07 * s, 0.09 * s, 2.6 * s, m.trunk, [x, y + 1.3 * s, z], null, 6);
  k.cyl(0.03, 0.03, 1.6, m.trunk, [x + 0.25, y + 0.8, z], [0, 0, 0.08], 4);
  for (let i = 0; i < 6; i++) { const a = i * 2.4 + r() * 0.5, d = i ? 0.75 * s : 0; const g = new THREE.IcosahedronGeometry((i ? 0.85 : 1.1) * s, 0); k.mesh(g, i % 2 ? m.leaf : m.leafB, [x + Math.cos(a) * d, y + (2.9 + (i ? (r() - 0.4) * 0.8 : 0.5)) * s, z + Math.sin(a) * d], [r(), r(), 0], [1, 0.8, 1]); }
}
/** A NAIWAN totem: a tall board with a pointed crown, the name in white. */
function totem(ctx, k, m, x, y, z, rotY, { mat, title, sub, h = 3.0, w = 1.15 }) {
  const g = k.group([x, y, z], rotY), kk = ctx.kit(g);
  kk.box(w, h, 0.28, mat, [0, h / 2, 0]);
  const crown = new THREE.ConeGeometry(w * 0.62, 0.45, 4); kk.mesh(crown, mat, [0, h + 0.2, 0], [0, Math.PI / 4, 0], [1, 1, 0.3]);
  for (const f of [1, -1]) {
    const tt = textTex(ctx, title, { w: 256, h: 256, color: '#f4f2ea', font: FONT.brush, weight: 700, size: 0.8 });
    kk.plane(w * 0.85, w * 0.85, mapMat(ctx, 'decal', '#ffffff', tt, { transparent: true, alphaTest: 0.3 }), [0, h * 0.62, f * 0.15], [0, f > 0 ? 0 : Math.PI, 0]);
    const st = textTex(ctx, sub, { w: 512, h: 128, color: '#f4f2ea', font: FONT.sans, weight: 900, size: 0.7 });
    kk.plane(w * 0.85, w * 0.22, mapMat(ctx, 'decal', '#ffffff', st, { transparent: true, alphaTest: 0.3 }), [0, h * 0.18, f * 0.15], [0, f > 0 ? 0 : Math.PI, 0]);
    const nw = textTex(ctx, 'NAIWAN', { w: 256, h: 64, color: '#f4f2ea', font: FONT.sans, weight: 900, size: 0.8 });
    kk.plane(w * 0.5, w * 0.13, mapMat(ctx, 'decal', '#ffffff', nw, { transparent: true, alphaTest: 0.3 }), [0, h * 0.92, f * 0.15], [0, f > 0 ? 0 : Math.PI, 0]);
  }
  return g;
}

// ======================================================================================================== PIER7
/** PIER7's bay side and ends ([v5:photos]); called from buildMinami's PIER7 block with its storey heights. */
export function buildPier7Photos(ctx, k, { L, P, g0, f2, f3, T, tops }) {
  const m = mats5(ctx), phys = ctx.physics, out = {};
  const quay = (x, z) => Math.max(1.9, L.heightAt(x, z));
  // ---- the seawall (the bay-side ground storey), the terrace on its crest, the stilted deck in front
  const W = P7WALL, nW = [];
  for (let i = 1; i < W.length; i++) { const s = seg(W[i - 1], W[i]); let n = [s.uz, -s.ux]; if ((n[0] * 0.684 - n[1] * 0.729) < 0) n = [-n[0], -n[1]]; nW.push(n); }
  const nAt = (i) => { const a = nW[Math.max(0, i - 1)], b = nW[Math.min(nW.length - 1, i)]; const v = [a[0] + b[0], a[1] + b[1]], l = Math.hypot(v[0], v[1]); return [v[0] / l, v[1] / l]; };
  const OUT = W.map((p, i) => [p[0] + nAt(i)[0] * 3.6, p[1] + nAt(i)[1] * 3.6]);
  for (let i = 1; i < W.length; i++) {
    const a = W[i - 1], b = W[i], s = seg(a, b), yb = Math.min(quay(a[0], a[1]), quay(b[0], b[1])) - 0.4;
    k.box(0.8, f2 - yb, s.len + 0.6, m.wall, [s.x - nW[i - 1][0] * 0.4, (f2 + yb) / 2, s.z - nW[i - 1][1] * 0.4], [0, s.rotY, 0]);
    // the stilted deck: timber top, white edge beam, white posts with tie rods back to the wall
    const qa = OUT[i - 1], qb = OUT[i], dq = [lerp(a, qa, 0.5), lerp(b, qb, 0.5)];
    const ds = seg(dq[0], dq[1]);
    k.box(3.6, 0.28, ds.len + 0.2, m.deck, [ds.x, f2 - 0.14, ds.z], [0, ds.rotY, 0]);
    barAlong(k, qa, qb, f2 - 0.32, 0.18, 0.5, m.stilt, 0.1);
    const os = seg(qa, qb);
    for (let d = 1.2; d < os.len - 0.4; d += 4.2) {
      const px = qa[0] + os.ux * d - nW[i - 1][0] * 0.25, pz = qa[1] + os.uz * d - nW[i - 1][1] * 0.25, py = quay(px, pz);
      k.box(0.24, f2 - 0.5 - py, 0.24, m.stilt, [px, (f2 - 0.5 + py) / 2, pz]);
      const wx = a[0] + s.ux * (d * s.len / os.len), wz = a[1] + s.uz * (d * s.len / os.len);
      const tie = seg([px, pz], [wx, wz]); const yA = f2 - 2.2, yB = f2 - 0.45, b2 = k.box(0.05, 0.05, Math.hypot(tie.len, yB - yA), m.stilt, [(px + wx) / 2, (yA + yB) / 2, (pz + wz) / 2]); b2.rotation.order = 'YXZ'; b2.rotation.set(-Math.atan2(yB - yA, tie.len), tie.rotY, 0);
      if (i % 2 === 0 && d < 3) { k.cyl(0.09, 0.09, 0.7, m.grey, [px + nW[i - 1][0] * 0.9, py + 0.35, pz + nW[i - 1][1] * 0.9], null, 8); k.box(0.14, 0.12, 0.14, m.lamp, [px + nW[i - 1][0] * 0.9, py + 0.74, pz + nW[i - 1][1] * 0.9]); }
    }
    if (phys?.addWalkBox) { const o = obbOf([a, b, qb, qa]); phys.addWalkBox(o.cx, o.cz, o.w, o.d, o.rotY, f2, f2 - 1); }
  }
  railAlong(k, m, OUT, f2);
  // terrace on the wall crest between the building's bay face and the wall line
  const bay = [[7.6, 67.8], [13.9, 79.8], [64.8, 123.8]];
  const terr = [...bay, ...W.slice(1).reverse()];
  k.mesh(capGeo(terr, f2 + 0.02, { tile: 2 }), m.deck);
  if (phys?.addWalkBox) for (let i = 2; i < W.length; i++) { const o = obbOf([W[i - 1], W[i], [W[i][0] - nW[i - 1][0] * 4.2, W[i][1] - nW[i - 1][1] * 4.2], [W[i - 1][0] - nW[i - 1][0] * 4.2, W[i - 1][1] - nW[i - 1][1] * 4.2]]); phys.addWalkBox(o.cx, o.cz, o.w, o.d, o.rotY, f2, f2 - 1); }
  // timber A-frame stands stored under the deck (IMG_0802, 0806)
  for (const [x, z, n] of [[24.8, 88.8, 6], [33.0, 96.6, 5], [11.6, 65.5, 4]]) { const s = seg(W[2], W[3]); for (let j = 0; j < n; j++) { const px = x + s.ux * j * 0.55, pz = z + s.uz * j * 0.55, py = quay(px, pz); for (const sd of [-1, 1]) { const b = k.box(0.06, 1.7, 0.09, m.deck, [px, py + 0.8, pz + 0], [0, s.rotY + Math.PI / 2, sd * 0.32]); void b; } } }
  out.wall = { line: W, out: OUT };

  // ---- the 2F's dark-brown board band at its head on the bay faces
  edgesOf(clipAxis(P, T.axis.o, T.axis.u, -2.5, 40.6), (a, b, len, n) => {
    if (len < 6 || (n[0] * 0.684 - n[1] * 0.729) < 0.5) return;
    const s = seg(a, b); k.box(0.2, 1.3, len, m.dbrown, [s.x + n[0] * 0.12, f3 - 0.6, s.z + n[1] * 0.12], [0, s.rotY, 0]);
  });
  // ---- the NW pavilion: one glazed room on the deck under a big gable roof (ラヂオ気仙沼's studio); full depth
  const ax = T.axis, cut0 = -2.5, cut1 = 40.6;
  const nwFull = clipAxis(P, ax.o, ax.u, -1e3, cut0), seFull = clipAxis(P, ax.o, ax.u, cut1, 1e3);
  {
    const yT = f2 + 3.5;
    k.mesh(prismWalls(offsetRing(nwFull, -0.2), f2, yT, { tile: 3 }), m.glassWarm);
    edgesOf(nwFull, (a, b, len, n, u) => { for (let s = 0; s <= len; s += 1.6) k.box(0.1, yT - f2, 0.14, m.fascia, [a[0] + u[0] * s - n[0] * 0.18, (f2 + yT) / 2, a[1] + u[1] * s - n[1] * 0.18], [0, Math.atan2(u[0], u[1]), 0]); });
    k.mesh(capGeo(offsetRing(nwFull, -0.2), yT, { down: true, tile: 2 }), m.soffit);
    gableRoof(k, m, nwFull, yT + 0.1, { eave: 2.6, pitch: 0.2, darkSide: null });
    // the street-side eave over the stair, carried on clusters of slender white columns (IMG_0799, 0823)
    const sa = [-4.5, 74.9], sb = [4.1, 89.8], su = [(sb[0] - sa[0]) / 17.2, (sb[1] - sa[1]) / 17.2], sn = [-0.866, 0.5];
    const eA = [sa[0] + su[0] * 2 + sn[0] * 0.5, sa[1] + su[1] * 2 + sn[1] * 0.5], eB = [sa[0] + su[0] * 17 + sn[0] * 0.5, sa[1] + su[1] * 17 + sn[1] * 0.5];
    const ext = [eA, eB, [eB[0] + sn[0] * 5.5, eB[1] + sn[1] * 5.5], [eA[0] + sn[0] * 5.5, eA[1] + sn[1] * 5.5]];
    k.mesh(capGeo(ext, yT + 0.75, { tile: 2 }), m.roofLight); k.mesh(capGeo(ext, yT + 0.6, { down: true, tile: 2 }), m.soffit);
    barAlong(k, ext[2], ext[3], yT + 0.62, 0.14, 0.42, m.fascia);
    for (let s = 0.6; s < 15; s += 1.2) { const p = [eA[0] + su[0] * s, eA[1] + su[1] * s]; const b = k.box(0.09, 0.22, 5.5, m.fascia, [p[0] + sn[0] * 2.75, yT + 0.48, p[1] + sn[1] * 2.75]); b.rotation.set(0, Math.atan2(sn[0], sn[1]), 0); }
    for (const s of [6.5, 12.5]) {
      const c = [sa[0] + su[0] * s + sn[0] * 5.0, sa[1] + su[1] * s + sn[1] * 5.0], gy = Math.max(g0, L.heightAt(c[0], c[1]));
      for (let j = 0; j < 4; j++) { const a = j * 1.57 + 0.4, dx = Math.cos(a) * 0.35, dz = Math.sin(a) * 0.35, h = yT + 0.6 - gy; const col = k.cyl(0.075, 0.09, h, m.stilt, [c[0] + dx * 1.6, gy + h / 2, c[1] + dz * 1.6], null, 8); col.rotation.set(-dz * 0.05, 0, dx * 0.05); }
    }
    // the timber stair from the corner deck up to the 2F along the street face (2.4 m wide, 18 risers)
    const st0 = [sa[0] + su[0] * 4.5 + sn[0] * 2.4, sa[1] + su[1] * 4.5 + sn[1] * 2.4], n = 18, run = 0.42;
    for (let i = 0; i < n; i++) { const yy = g0 + 0.55 + (f2 - g0 - 0.55) * (i + 1) / n, p = [st0[0] + su[0] * run * (i + 0.5), st0[1] + su[1] * run * (i + 0.5)]; k.box(2.4, 0.16, run + 0.02, m.comp, [p[0], yy - 0.08, p[1]], [0, Math.atan2(su[0], su[1]), 0]); k.box(2.4, yy - g0, 0.04, m.dbrown, [p[0] - su[0] * run / 2, (yy + g0) / 2, p[1] - su[1] * run / 2], [0, Math.atan2(su[0], su[1]), 0]); }
    { const a = [st0[0] + sn[0] * 1.2, st0[1] + sn[1] * 1.2], b = [a[0] + su[0] * run * n, a[1] + su[1] * run * n], s = seg(a, b), y0 = g0 + 1.6, y1 = f2 + 1.0; const r = k.box(0.06, 0.06, Math.hypot(s.len, y1 - y0), m.rail, [s.x, (y0 + y1) / 2, s.z]); r.rotation.order = 'YXZ'; r.rotation.set(-Math.atan2(y1 - y0, s.len), s.rotY, 0); }
    if (phys?.addWalkRamp) { const a = st0, b = [st0[0] + su[0] * run * n, st0[1] + su[1] * run * n], s = seg(a, b); phys.addWalkRamp(s.x, s.z, 2.4, s.len, s.rotY, g0 + 0.55, f2); }
    // the corner deck with two steps and the rust-brown NAIWAN 創 PIER7 totem
    const d0 = [sa[0] - su[0] * 1.5, sa[1] - su[1] * 1.5], dk = [d0, [d0[0] + su[0] * 7, d0[1] + su[1] * 7], [d0[0] + su[0] * 7 + sn[0] * 5.4, d0[1] + su[1] * 7 + sn[1] * 5.4], [d0[0] + sn[0] * 5.4, d0[1] + sn[1] * 5.4]];
    for (const [off, y] of [[0.9, g0 + 0.2], [0.45, g0 + 0.37], [0, g0 + 0.55]]) { const r = offsetRing(dk, off); k.mesh(prismWalls(r, g0 - 0.2, y, { tile: 2 }), m.comp); k.mesh(capGeo(r, y, { tile: 2 }), m.comp); }
    if (phys?.addWalkBox) { const o = obbOf(dk); phys.addWalkBox(o.cx, o.cz, o.w, o.d, o.rotY, g0 + 0.55, g0 - 1); }
    const tp = [d0[0] + su[0] * 1.6 + sn[0] * 3.6, d0[1] + su[1] * 1.6 + sn[1] * 3.6];
    totem(ctx, k, m, tp[0], g0 + 0.55, tp[1], Math.atan2(-0.27, -0.96), { mat: m.rust, title: '創', sub: 'PIER7', h: 2.9 });
    // the WC block and the walkway pier at the NW end (IMG_0799 left)
    out.street = { stair: st0 };
  }
  // ---- the SE block: white vertical boards, full depth, low gable; 「PIER7」 and the bay painting on its NW face
  {
    const top = tops.se;
    k.mesh(prismWalls(offsetRing(seFull, 0.04), g0 - 0.5, top, { tile: 3 }), m.wboard);
    edgesOf(seFull, (a, b, len, n, u) => { if (len < 5) return; for (let s = 2; s < len - 1.5; s += 3.2) k.box(1.6, 1.4, 0.1, m.glass, [a[0] + u[0] * s + n[0] * 0.06, g0 + 2.0, a[1] + u[1] * s + n[1] * 0.06], [0, ry(n), 0]); });
    gableRoof(k, m, seFull, top, { eave: 1.0, pitch: 0.18, rafters: 0 });
    const S1 = [ax.o[0] + ax.u[0] * cut1, ax.o[1] + ax.u[1] * cut1], S2 = lerp([13.9, 79.8], [64.8, 123.8], (cut1 - 0.1) / 67.3), nNW = [-ax.u[0], -ax.u[1]];
    const at = (f, y, o = 0.08) => [S1[0] + (S2[0] - S1[0]) * f + nNW[0] * o, y, S1[1] + (S2[1] - S1[1]) * f + nNW[1] * o];
    const [px, py, pz] = at(0.32, top - 1.55); sign(ctx, k, 'PIER7', 3.4, 1.15, px, py, pz, ry(nNW), { color: '#2d3a4a', font: FONT.sans });
    const [qx, qy, qz] = at(0.73, top - 2.1); k.plane(3.6, 1.8, m.painting, [qx, qy, qz], [0, ry(nNW), 0]);
    out.se = { top, face: [S1, S2] };
  }
  // ---- the main block's roof: a low gable, deep eaves (street slope pale, bay slope dark: Earth 2026-03-11 top) + the
  //      cantilevered 3F balcony box over the terrace (IMG_0802)
  {
    const main = T.blocks.find((b) => b.id === 'main');
    gableRoof(k, m, main.poly, tops.main, { eave: 2.2, pitch: 0.14, darkSide: null });
    const [a, b] = T.signEdge, n = T.bayN, f = 0.14, p = lerp(a, b, f), s = seg(a, b);
    const c = [p[0] + n[0] * 1.8, p[1] + n[1] * 1.8];
    k.box(6.5, 0.45, 3.6, m.white, [c[0], f3 + 0.6, c[1]], [0, s.rotY + Math.PI / 2, 0]);
    railAlong(k, m, [[c[0] + n[0] * 1.75 - s.ux * 3.2, c[1] + n[1] * 1.75 - s.uz * 3.2], [c[0] + n[0] * 1.75 + s.ux * 3.2, c[1] + n[1] * 1.75 + s.uz * 3.2]], f3 + 0.82, { lights: false });
  }
  return out;
}

// ======================================================================================================== 迎
/** 迎 ムカエル ([v5:photos] IMG_0808, 0824-0828): returns { g0, roofY }. */
export function buildMukaeruPhotos(ctx, k, { L, base, wallCrest = MINAMI.wallCrest }) {
  const m = mats5(ctx), phys = ctx.physics;
  const poly = SITES.mukaeru.poly, g0 = base(poly), o = obbOf(poly);
  const U = [o.ux, o.uz], Ctr = [o.cx, o.cz], half = o.d / 2;   // U points SSE: s = +half is the SE end
  const sec = (s0, s1) => clipAxis(poly, Ctr, U, s0, s1);
  const A = sec(half - 14, 1e3), B = sec(half - 27, half - 14), Cn = sec(-1e3, half - 27);
  const eave = g0 + 7.4, boxTop = g0 + 11.6;
  const street = (n) => n[0] * -0.865 + n[1] * 0.5 > 0.5, bayF = (n) => n[0] * 0.865 - n[1] * 0.5 > 0.5;
  k.mesh(prismWalls(poly, g0 - 1, g0 + 0.15), m.concrete);
  // A: the ANCHOR café, khaki render, glazed bay-side corner
  k.mesh(prismWalls(A, g0 + 0.1, eave, { tile: 3, skip: (i, a, b) => { const s = seg(a, b); return bayF([s.uz, -s.ux]); } }), m.khaki);
  edgesOf(A, (a, b, len, n, u) => {
    const s = seg(a, b);
    if (bayF(n) || (n[0] > 0.2 && n[1] > 0.2)) {   // glazed corner (COFFEE DONUTS) and bay face
      k.box(0.12, eave - g0 - 0.4, len, m.glassShop, [s.x + n[0] * 0.04, (g0 + eave) / 2, s.z + n[1] * 0.04], [0, s.rotY, 0]);
      for (let d = 0; d <= len; d += 1.8) k.box(0.1, eave - g0 - 0.4, 0.1, m.fascia, [a[0] + u[0] * d + n[0] * 0.1, (g0 + eave) / 2, a[1] + u[1] * d + n[1] * 0.1]);
      k.box(0.14, 0.12, len, m.fascia, [s.x + n[0] * 0.1, g0 + 3.6, s.z + n[1] * 0.1], [0, s.rotY, 0]);
      if (len > 4) sign(ctx, k, 'COFFEE  DONUTS', Math.min(3.2, len * 0.6), 0.55, s.x + n[0] * 0.14, g0 + 5.8, s.z + n[1] * 0.14, ry(n), { color: '#f4f2ea' });
      return;
    }
    if (len < 4) return;
    // the clerestory band of white-framed windows with the ANCHOR letters (2F)
    k.box(0.1, 1.5, len - 0.6, m.glassDim, [s.x + n[0] * 0.05, g0 + 5.35, s.z + n[1] * 0.05], [0, s.rotY, 0]);
    for (let d = 0.3; d <= len - 0.3; d += (len - 0.6) / Math.max(1, Math.round((len - 0.6) / 1.6))) k.box(0.12, 1.55, 0.1, m.fascia, [a[0] + u[0] * d + n[0] * 0.08, g0 + 5.35, a[1] + u[1] * d + n[1] * 0.08]);
    if (len > 8) {
      sign(ctx, k, 'A N C H O R', len - 1.2, 1.15, s.x + n[0] * 0.14, g0 + 5.35, s.z + n[1] * 0.14, ry(n), { color: '#e4eceb', font: FONT.sans });
      // café RST neon over the door, the HAVE A NICE COFFEE oval, the shopfront glass
      const at = (f, d = 0.16) => [a[0] + u[0] * len * f + n[0] * d, a[1] + u[1] * len * f + n[1] * d];
      const [cx, cz] = at(0.3); k.box(4.0, 0.7, 0.12, m.black, [cx - n[0] * 0.08, g0 + 3.25, cz - n[1] * 0.08], [0, ry(n), 0]);
      sign(ctx, k, 'café', 1.0, 0.5, ...[cx - u[0] * 1.35, g0 + 3.25, cz - u[1] * 1.35], ry(n), { color: '#ff7a8c', font: FONT.serif, weight: 700, emissive: true });
      sign(ctx, k, 'RST', 2.2, 0.6, ...[cx + u[0] * 0.55, g0 + 3.25, cz + u[1] * 0.55], ry(n), { color: '#6fd2ff', font: FONT.serif, emissive: true });
      const [ox, oz] = at(0.72); const ov = new THREE.CircleGeometry(0.85, 24); k.mesh(ov, m.purple, [ox, g0 + 3.5, oz], [0, ry(n), 0], [1.25, 0.8, 1]);
      sign(ctx, k, 'COFFEE', 1.6, 0.5, ox + n[0] * 0.02, g0 + 3.5, oz + n[1] * 0.02, ry(n), { color: '#f7e8b0' });
      for (const f of [0.14, 0.46]) { const [gx, gz] = at(f, 0.04); k.box(2.6, 2.4, 0.08, m.glassShop, [gx, g0 + 1.35, gz], [0, ry(n), 0]); }
    }
  });
  // Lander Blue / SHARKS boards on the SE face and the bay glazing
  { const p = [-6.6, 48.9]; sign(ctx, k, 'Lander Blue', 2.6, 0.6, p[0], g0 + 3.1, p[1], ry([0.43, 0.9]), { color: '#e8edf2', bg: '#4a3a2c', font: FONT.serif }); sign(ctx, k, 'SHARKS', 2.6, 0.55, p[0], g0 + 2.4, p[1], ry([0.43, 0.9]), { color: '#e8edf2', bg: '#4a3a2c', font: FONT.serif }); }
  // B: the tall grey ribbed-metal box (3F) with the external steel stair on the street side
  k.mesh(prismWalls(B, g0 + 0.1, boxTop, { tile: 4 }), m.rib);
  k.mesh(capGeo(B, boxTop, { tile: 3 }), m.roofLight);
  k.mesh(prismWalls(offsetRing(B, 0.05), boxTop - 0.3, boxTop + 0.35, { tile: 3 }), m.rib);
  edgesOf(B, (a, b, len, n, u) => {
    if (len < 6) return; const s = seg(a, b);
    k.box(1.0, 1.4, 0.08, m.glass, [s.x + n[0] * 0.06 + u[0] * 2, g0 + 9.4, s.z + n[1] * 0.06 + u[1] * 2], [0, ry(n), 0]);
    if (!street(n)) return;
    // two flights and landings, 1.2 m wide, 1.4 m off the wall
    const L0 = [s.x + n[0] * 1.4 - u[0] * 4, s.z + n[1] * 1.4 - u[1] * 4];
    for (const [f0, f1, y0, y1] of [[0, 6, g0, g0 + 3.6], [6, 0, g0 + 3.6, g0 + 7.2]]) {
      const a2 = [L0[0] + u[0] * f0, L0[1] + u[1] * f0], b2 = [L0[0] + u[0] * f1, L0[1] + u[1] * f1], ss = seg(a2, b2);
      const fl = k.box(1.2, 0.18, Math.hypot(ss.len, y1 - y0), m.steel, [ss.x, (y0 + y1) / 2, ss.z]); fl.rotation.order = 'YXZ'; fl.rotation.set(-Math.atan2(y1 - y0, ss.len), ss.rotY, 0);
      const rl = k.box(0.05, 0.05, Math.hypot(ss.len, y1 - y0), m.rail, [ss.x + n[0] * 0.6, (y0 + y1) / 2 + 1.0, ss.z + n[1] * 0.6]); rl.rotation.order = 'YXZ'; rl.rotation.set(-Math.atan2(y1 - y0, ss.len), ss.rotY, 0);
    }
    for (const [f, y] of [[6.8, g0 + 3.6], [-0.8, g0 + 7.2]]) { const p = [L0[0] + u[0] * f, L0[1] + u[1] * f]; k.box(1.6, 0.2, 1.6, m.steel, [p[0], y, p[1]], [0, ry(n), 0]); k.box(1.6, 1.0, 0.04, m.rail, [p[0] + n[0] * 0.8, y + 0.6, p[1] + n[1] * 0.8], [0, ry(n), 0]); }
  });
  // C: the lower NW wings: charcoal boards on the street, dark timber on the bay, windows, 「nine one」
  edgesOf(Cn, (a, b, len, n, u) => {
    const s = seg(a, b), mat = bayF(n) ? m.timberDark : m.charcoal;
    k.box(0.2, eave - g0, len, mat, [s.x - n[0] * 0.1, (g0 + eave) / 2, s.z - n[1] * 0.1], [0, s.rotY, 0]);
    if (len < 6) return;
    for (let d = 2; d < len - 2; d += 4.2) { k.box(2.4, 2.2, 0.08, m.glassShop, [a[0] + u[0] * d + n[0] * 0.05, g0 + 1.4, a[1] + u[1] * d + n[1] * 0.05], [0, ry(n), 0]); k.box(1.8, 1.0, 0.08, m.glass, [a[0] + u[0] * d + n[0] * 0.05, g0 + 5.0, a[1] + u[1] * d + n[1] * 0.05], [0, ry(n), 0]); }
    if (street(n)) { const p = [a[0] + u[0] * len * 0.62 + n[0] * 0.15, a[1] + u[1] * len * 0.62 + n[1] * 0.15]; k.mesh(new THREE.CircleGeometry(0.55, 20), m.red, [p[0] + n[0] * 0.03, g0 + 4.4, p[1] + n[1] * 0.03], [0, ry(n), 0]); sign(ctx, k, 'nine one', 2.2, 0.5, p[0] + u[0] * 1.8, g0 + 3.4, p[1] + u[1] * 1.8, ry(n), { color: '#f4f2ea', font: FONT.sans }); }
    if (bayF(n)) stringLights(k, m, [a[0] + n[0] * 1.0, eave + 0.1, a[1] + n[1] * 1.0], [b[0] + n[0] * 1.0, eave + 0.1, b[1] + n[1] * 1.0], 0.7, 0.3);
  });
  // the gull-wing wavy roof over A and C (IMG_0808, 0826): a thin slab along the axis, 1 m eaves, gentle waves
  {
    const s0 = -half - 1.0, s1 = half + 1.0, V = [-o.uz, o.ux], hw = o.w / 2 + 1.0, pos = [], idx = [];
    const yOf = (s) => eave + 0.15 + 0.42 * (1 - Math.cos((s - s0) / 13 * 2 * Math.PI));
    const N = 64;
    for (let i = 0; i <= N; i++) { const s = s0 + (s1 - s0) * i / N, y = yOf(s); for (const v of [-hw, hw]) pos.push(Ctr[0] + U[0] * s + V[0] * v, y + (v > 0 ? 0 : 0), Ctr[1] + U[1] * s + V[1] * v); }
    for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    k.mesh(g, m.roofLight);
    const g2 = g.clone(); g2.translate(0, -0.12, 0); k.mesh(g2, m.greySoffit);
    for (const v of [-hw, hw]) for (let i = 0; i < N; i++) { const sA = s0 + (s1 - s0) * i / N, sB = s0 + (s1 - s0) * (i + 1) / N, pa = [Ctr[0] + U[0] * sA + V[0] * v, Ctr[1] + U[1] * sA + V[1] * v], pb = [Ctr[0] + U[0] * sB + V[0] * v, Ctr[1] + U[1] * sB + V[1] * v], ss = seg(pa, pb); const f = k.box(0.1, 0.36, ss.len + 0.02, m.fascia, [ss.x, (yOf(sA) + yOf(sB)) / 2 - 0.08, ss.z]); f.rotation.order = 'YXZ'; f.rotation.set(-Math.atan2(yOf(sB) - yOf(sA), ss.len), ss.rotY, 0); }
    // infill walls up to the wave under the roof (A and C)
    for (const R of [A, Cn]) k.mesh(prismWalls(offsetRing(R, -0.15), eave - 0.1, (x, z) => yOf((x - Ctr[0]) * U[0] + (z - Ctr[1]) * U[1]), { tile: 3 }), R === A ? m.khaki : m.charcoal);
  }
  // the 2F terrace on the bay side (wall crest), rail with lights
  edgesOf(poly, (a, b, len, n) => {
    if (len < 30 || !bayF(n)) return;
    const d0 = [a[0] + n[0] * 2.6, a[1] + n[1] * 2.6], d1 = [b[0] + n[0] * 2.6, b[1] + n[1] * 2.6];
    barAlong(k, d0, d1, wallCrest - 0.15, 5.2, 0.3, m.deck);
    railAlong(k, m, [[a[0] + n[0] * 5.1, a[1] + n[1] * 5.1], [b[0] + n[0] * 5.1, b[1] + n[1] * 5.1]], wallCrest);
    if (phys?.addWalkBox) { const s = seg(d0, d1); phys.addWalkBox(s.x, s.z, 5.2, s.len, s.rotY, wallCrest, wallCrest - 1); }
  });
  // the SE composite deck (3 steps) with the purple NAIWAN 迎 WELCOME HOUSE totem
  {
    const dk = [[-9.8, 50.4], [-3.6, 47.6], [-2.2, 52.0], [-8.5, 59.0], [-13.0, 56.5]];   // south of the glazed corner (IMG_0824: the totem 11 m N of the camera)
    for (const [off, y] of [[0.9, g0 + 0.2], [0.45, g0 + 0.4], [0, g0 + 0.6]]) { const r = offsetRing(dk, off); k.mesh(prismWalls(r, g0 - 0.2, y, { tile: 2 }), m.comp); k.mesh(capGeo(r, y, { tile: 2 }), m.comp); }
    if (phys?.addWalkBox) { const ob = obbOf(dk); phys.addWalkBox(ob.cx, ob.cz, ob.w, ob.d, ob.rotY, g0 + 0.6, g0 - 1); }
    totem(ctx, k, m, -9.3, g0 + 0.6, 56.6, Math.atan2(-0.05, 1), { mat: m.purple, title: '迎', sub: 'WELCOME HOUSE', h: 3.1 });
  }
  return { g0, roofY: boxTop, eave };
}

// ======================================================================================================== the plaza
/** The flat plaza at quay level, the ring benches, the bleachers, the walkway, the stair cage, the gate post and winch. */
export function buildPlazaPhotos(ctx, k, { L, wallCrest = MINAMI.wallCrest }) {
  const m = mats5(ctx), phys = ctx.physics, r = ctx.rng('p5plaza');
  // draped on the quay level: never below T.P. 2.2, 8 cm over the DEM where it rises (the old wall's footprint in the DEM)
  const yAt = (x, z) => Math.max(2.2, L.heightAt(x, z) + 0.08), y = 2.2;
  { const o = obbOf(PLAZA), pos = [], uv = [], idx = [], G = 1.0, nu = Math.ceil(o.d / G), nv = Math.ceil(o.w / G), id = new Map();
    const ptAt = (i, j) => [o.cx + o.ux * (-o.d / 2 + i * G) - o.uz * (-o.w / 2 + j * G), o.cz + o.uz * (-o.d / 2 + i * G) + o.ux * (-o.w / 2 + j * G)];
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const q = [ptAt(i, j), ptAt(i + 1, j), ptAt(i + 1, j + 1), ptAt(i, j + 1)], c = [(q[0][0] + q[2][0]) / 2, (q[0][1] + q[2][1]) / 2];
      if (!inPoly(c[0], c[1], PLAZA)) continue;
      const vi = q.map(([x, z], t) => { const key = (i + (t === 1 || t === 2 ? 1 : 0)) + ',' + (j + (t >= 2 ? 1 : 0)); if (!id.has(key)) { id.set(key, pos.length / 3); pos.push(x, yAt(x, z), z); uv.push(x / 8, z / 8); } return id.get(key); });
      idx.push(vi[0], vi[2], vi[1], vi[0], vi[3], vi[2]);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    if (g.attributes.normal.getY(0) < 0) { const ix = g.index.array; for (let t2 = 0; t2 < ix.length; t2 += 3) { const tmp = ix[t2 + 1]; ix[t2 + 1] = ix[t2 + 2]; ix[t2 + 2] = tmp; } g.computeVertexNormals(); }
    k.mesh(g, m.paver); }
  // bands of small granite setts across the plaza (IMG_0803, 0806)
  const band = (a, b, w) => { const s = seg(a, b); const g = new THREE.PlaneGeometry(w, s.len); g.rotateX(-Math.PI / 2); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 1, uv.getY(i) * s.len / 1); k.mesh(g, m.sett, [s.x, yAt(s.x, s.z) + 0.012, s.z], [0, s.rotY, 0]); };
  band([-1.5, 46.2], [24.6, 72.0], 1.0); band([6.5, 30.2], [36.2, 60.2], 0.8); band([13.0, 27.2], [38.4, 52.0], 0.6); band([-6.8, 49.6], [37.6, 61.5], 0.7);
  // the ring benches: white precast ring (0.5 m) round a lower inner step and a sunken lawn with a young tree; two lamp posts
  for (const [x, z] of MINAMI.pits) {
    const y = yAt(x, z);
    const ring = (r0, r1, y0, y1, mat) => { const g = new THREE.RingGeometry(r0, r1, 36, 1); g.rotateX(-Math.PI / 2); k.mesh(g, mat, [x, y1, z]); const w = new THREE.CylinderGeometry(r1, r1, y1 - y0, 36, 1, true); k.mesh(w, mat, [x, (y0 + y1) / 2, z]); const wi = new THREE.CylinderGeometry(r0, r0, y1 - y0, 36, 1, true); k.mesh(wi, m.white, [x, (y0 + y1) / 2, z]); };
    ring(1.9, 2.3, y, y + 0.5, m.white); ring(1.45, 1.9, y - 0.05, y + 0.2, m.white);
    const lw = new THREE.CircleGeometry(1.45, 28); lw.rotateX(-Math.PI / 2); k.mesh(lw, m.lawn, [x, y - 0.04, z]);
    youngTree(k, m, x + 0.2, y - 0.05, z - 0.1, 1.05, r);
    for (const a of [0.6, 3.3]) { const lx = x + Math.cos(a) * 2.1, lz = z + Math.sin(a) * 2.1; k.box(0.12, 0.9, 0.12, m.grey, [lx, y + 0.95, lz]); k.box(0.16, 0.18, 0.16, m.lamp, [lx, y + 1.45, lz]); }
    phys?.addBox?.(x, z, 4.6, 4.6, 0, y, y + 0.5);
  }
  // the 陸閘 winch on its grating (IMG_0807, 0808)
  { const x = 26.0, z = 49.9, rot = 0.5; const g = k.group([x, yAt(x, z), z], rot), kk = ctx.kit(g); g.scale.setScalar(0.75); kk.box(2.6, 0.04, 2.2, m.darkConcrete, [0.6, 0.02, 0.8]); kk.box(2.4, 0.25, 0.4, m.white, [0, 0.15, 0]); for (const s of [-1, 1]) { kk.box(0.3, 1.6, 0.3, m.white, [s * 1.0, 1.0, 0]); kk.mesh(new THREE.ConeGeometry(0.2, 0.4, 4), m.white, [s * 1.0, 2.0, 0]); kk.box(0.5, 0.45, 0.45, m.white, [s * 1.0, 0.9, 0]); } kk.box(2.0, 0.08, 0.08, m.white, [0, 1.05, 0]); const wh = new THREE.TorusGeometry(0.42, 0.04, 6, 20); kk.mesh(wh, m.white, [-0.35, 1.05, 0.12]); }
  // bleachers: reddish composite steps rising NW from the plaza to the lawn (IMG_0808): 5 steps of 0.45 m x 1.0 m
  {
    const W0 = [-0.1, 33], N0 = [16.8, 24.5], s = seg(W0, N0); let nn = [s.uz, -s.ux]; if (nn[0] * (20 - s.x) + nn[1] * (50 - s.z) < 0) nn = [-nn[0], -nn[1]];
    for (let i = 0; i < 5; i++) { const D = 5.0 - i, hY = y + 0.45 * (i + 1), c = [s.x + nn[0] * D / 2, s.z + nn[1] * D / 2]; k.box(D, hY - y + 0.3, s.len - 3, m.comp, [c[0], (hY + y - 0.3) / 2, c[1]], [0, s.rotY, 0]); if (phys?.addWalkBox) phys.addWalkBox(c[0], c[1], D, s.len - 3, s.rotY, hY, y - 0.3); }
  }
  // the elevated walkway: concrete deck at the wall crest, dark fascia, stainless rail with lights, on piers
  {
    const S = resample(WALKWAY, 1.0), side = [];
    for (let i = 0; i < S.length - 1; i++) { const a = [S[i].x, S[i].z], b = [S[i + 1].x, S[i + 1].z], s = seg(a, b); k.box(3.4, 0.35, s.len + 0.05, m.concrete, [s.x, wallCrest - 0.18, s.z], [0, s.rotY, 0]); for (const sd of [-1, 1]) k.box(0.12, 0.85, s.len + 0.05, m.darkConcrete, [s.x + s.uz * sd * 1.72, wallCrest - 0.35, s.z - s.ux * sd * 1.72], [0, s.rotY, 0]); if (phys?.addWalkBox) phys.addWalkBox(s.x, s.z, 3.4, s.len + 0.05, s.rotY, wallCrest, wallCrest - 1); }
    for (const sd of [-1, 1]) { side.length = 0; for (const p of S) side.push([p.x + p.uz * sd * 1.6, p.z - p.ux * sd * 1.6]); railAlong(k, m, side.slice(), wallCrest); }
    for (const f of [0.35, 0.62]) { const i = Math.round(f * (S.length - 1)), p = S[i], gy = L.heightAt(p.x, p.z); k.cyl(0.32, 0.32, wallCrest - 0.35 - gy, m.concrete, [p.x, (wallCrest - 0.35 + gy) / 2, p.z], null, 12); }
  }
  // the gate post (wall end) with the yellow 注意 board and a camera on a bracket (IMG_0801, 0806, 0807)
  { const x = 9.0, z = 63.0, gy = L.heightAt(x, z); k.box(1.6, wallCrest + 0.5 - gy, 2.6, m.concrete, [x, (wallCrest + 0.5 + gy) / 2, z], [0, 0.45, 0]); const nb = [0.9, 0.42]; sign(ctx, k, '注意', 0.75, 1.1, x + nb[0] * 0.82, gy + 2.2, z + nb[1] * 0.82, ry(nb), { color: '#2b2a33', bg: C5.yellow, font: FONT.sans }); k.box(0.2, 0.9, 0.2, m.grey, [x, wallCrest + 0.95, z]); k.box(0.5, 0.3, 0.3, m.white, [x + 0.25, wallCrest + 1.4, z]); phys?.addBox?.(x, z, 1.6, 2.6, 0.45, gy, wallCrest + 0.5); }
  // the white steel mesh stair cage beside 迎's deck (IMG_0807, 0808): 2 storeys, open grid
  { const c = [6.4, 45.4], rot = Math.atan2(0.5, 0.866), w = 4.4, d = 6.8, h = wallCrest + 1.2 - yAt(6.4, 45.4); const g = k.group([c[0], yAt(6.4, 45.4), c[1]], rot), kk = ctx.kit(g); for (const [px, pz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]) kk.box(0.16, h, 0.16, m.white, [px, h / 2, pz]); for (const yy of [0.3, h / 2, h - 0.1]) { kk.box(w, 0.12, 0.12, m.white, [0, yy, -d / 2]); kk.box(w, 0.12, 0.12, m.white, [0, yy, d / 2]); kk.box(0.12, 0.12, d, m.white, [-w / 2, yy, 0]); kk.box(0.12, 0.12, d, m.white, [w / 2, yy, 0]); } const mesh = (W2, H2) => { const gg = new THREE.PlaneGeometry(W2, H2); const uv = gg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * W2 / 1.2, uv.getY(i) * H2 / 1.2); return gg; }; kk.mesh(mesh(w, h), m.mesh, [0, h / 2, -d / 2]); kk.mesh(mesh(w, h), m.mesh, [0, h / 2, d / 2]); kk.mesh(mesh(d, h), m.mesh, [-w / 2, h / 2, 0], [0, Math.PI / 2, 0]); kk.mesh(mesh(d, h), m.mesh, [w / 2, h / 2, 0], [0, Math.PI / 2, 0]); phys?.addBox?.(c[0], c[1], w, d, rot, y, y + h); }
  // the broad composite stair beside 迎's SE deck rising NE to the walkway (IMG_0820, 0824): 9 risers facing SW
  {
    const up = [0.64, -0.77], wv = [0.77, 0.64], b0 = [-3.5, 54.0], front = [[b0[0] - wv[0] * 2.5, b0[1] - wv[1] * 2.5], [b0[0] + wv[0] * 2.5, b0[1] + wv[1] * 2.5]], n = 9, run = 0.9, rise = (wallCrest - y) / n, fs = seg(front[0], front[1]);
    for (let i = 0; i < n; i++) { const off = run * (i + 0.5), yy = y + rise * (i + 1); k.box(fs.len, yy - y, run, m.comp, [fs.x + up[0] * off, (yy + y) / 2, fs.z + up[1] * off], [0, fs.rotY + Math.PI / 2, 0]); if (phys?.addWalkBox) phys.addWalkBox(fs.x + up[0] * off, fs.z + up[1] * off, fs.len, run, fs.rotY + Math.PI / 2, yy, y); }
    for (const e of front) { const a = [e[0], e[1]], b = [e[0] + up[0] * run * n, e[1] + up[1] * run * n], s = seg(a, b), y0 = y + 1.0, y1 = wallCrest + 1.0; const rl = k.box(0.06, 0.06, Math.hypot(s.len, y1 - y0), m.rail, [s.x, (y0 + y1) / 2, s.z]); rl.rotation.order = 'YXZ'; rl.rotation.set(-Math.atan2(y1 - y0, s.len), s.rotY, 0); stringLights(k, m, [a[0], y0 + 0.05, a[1]], [b[0], y1 + 0.05, b[1]], 0.6, 0.1); }
  }
  return { y, top: wallCrest, bot: y, flat: true };
}

// ======================================================================================================== 結, 拓, the slow street
/** 結 ユワエル and 拓 ヒラケル, lot by lot (the GSI footprints tagged yuwaeru / hirakeru), and the slow street between. */
export function buildSlowStreetPhotos(ctx, k, { L, base }) {
  const m = mats5(ctx), r = ctx.rng('p5slow'), out = { yuwaeru: 0, hirakeru: 0 };
  const lots = (id) => (L.LOTS || []).filter((l) => l.landmark === id);
  const Y = lots('yuwaeru'), H = lots('hirakeru'), others = [...Y, ...H];
  const blocked = (x, z, self) => others.some((l) => l !== self && inPoly(x, z, l.poly));
  // 結: single-storey cedar shops behind a colonnade under a white corrugated fascia; a tall white back volume on 376
  for (const lot of Y) {
    const P = lot.poly, g0 = base(P), o = obbOf(P);
    if (o.w < 3.2) {   // thin strips: canopies on posts
      k.mesh(capGeo(P, g0 + 4.1, { tile: 3 }), m.roofLight); k.mesh(prismWalls(P, g0 + 3.0, g0 + 4.15, { tile: 3 }), m.corr); k.mesh(capGeo(P, g0 + 3.0, { tile: 3, down: true }), m.soffit);
      for (let s = -o.d / 2 + 0.4; s <= o.d / 2; s += 3.2) k.box(0.22, 3.0, 0.22, m.post, [o.cx + o.ux * s, g0 + 1.5, o.cz + o.uz * s]);
      continue;
    }
    const eaveH = g0 + 3.9;
    k.mesh(prismWalls(P, g0 - 0.5, eaveH, { tile: 3 }), m.cedar);
    k.mesh(capGeo(P, eaveH + 0.5, { tile: 4 }), m.roofLight);
    k.mesh(prismWalls(offsetRing(P, 0.04), eaveH - 0.6, eaveH + 0.55, { tile: 3 }), m.corr);
    edgesOf(P, (a, b, len, n, u) => {
      if (len < 3) return;
      const s = seg(a, b), mid = [s.x + n[0] * 3, s.z + n[1] * 3], open = !blocked(mid[0], mid[1], lot) && !inPoly(mid[0], mid[1], SITES.mukaeru.poly);
      for (let d = 1.2; d < len - 1.6; d += 4.0) k.box(2.4, 2.2, 0.08, m.glassShop, [a[0] + u[0] * (d + 1.2) + n[0] * 0.05, g0 + 1.3, a[1] + u[1] * (d + 1.2) + n[1] * 0.05], [0, ry(n), 0]);
      if (!open || len < 6) return;
      // the colonnade: fascia 2.2 m out on weathered timber posts every 3.2 m
      const p0 = [a[0] + n[0] * 2.2, a[1] + n[1] * 2.2], p1 = [b[0] + n[0] * 2.2, b[1] + n[1] * 2.2];
      barAlong(k, p0, p1, eaveH - 0.05, 0.25, 1.15, m.corr); k.mesh(capGeo([a, b, p1, p0], eaveH + 0.5, { tile: 3 }), m.roofLight); k.mesh(capGeo([a, b, p1, p0], eaveH - 0.6, { tile: 3, down: true }), m.soffit);
      for (let d = 0.3; d <= len; d += len / Math.max(1, Math.round(len / 3.2))) { const px = p0[0] + u[0] * d - n[0] * 0.15, pz = p0[1] + u[1] * d - n[1] * 0.15; k.box(0.24, eaveH - 0.6 - g0, 0.24, m.post, [px, (eaveH - 0.6 + g0) / 2, pz]); ctx.physics?.addBox?.(px, pz, 0.3, 0.3, 0, g0, eaveH); }
      for (let d = 1.6; d < len - 1; d += 5.5) { const sx = a[0] + u[0] * d + n[0] * 1.0, sz = a[1] + u[1] * d + n[1] * 1.0; k.box(0.7, 0.05, 0.7, m.rust, [sx, g0 + 0.72, sz]); k.box(0.05, 0.7, 0.05, m.grey, [sx, g0 + 0.36, sz]); for (const q of [-0.6, 0.6]) k.cyl(0.18, 0.18, 0.05, m.orange, [sx + u[0] * q, g0 + 0.46, sz + u[1] * q], null, 10); }
    });
    if (o.w > 15 && o.d > 15) {   // 376: the tall white corrugated back volume with AC units
      const core = offsetRing(P, -4.5); k.mesh(prismWalls(core, eaveH, g0 + 7.6, { tile: 3 }), m.corr); k.mesh(capGeo(core, g0 + 7.6, { tile: 4 }), m.roofLight);
      for (let i = 0; i < 3; i++) k.box(0.9, 0.7, 0.4, m.white, [o.cx + i * 1.3 - 1.3, g0 + 8.0, o.cz]);
    }
    out.yuwaeru++;
  }
  // BLACK TIDE BREWING on the 結 face toward the slow-street junction; the slow street map board; the 結 totem
  const faceNear = (lots2, x, z, want) => { let best = null; for (const l of lots2) edgesOf(l.poly, (a, b, len, n) => { if (len < 5) return; const s = seg(a, b), d = Math.hypot(s.x - x, s.z - z) - (want ? (n[0] * want[0] + n[1] * want[1]) * 4 : 0); if (!best || d < best.d) best = { d, a, b, len, n, s, lot: l }; }); return best; };
  { const f = faceNear(Y, -30.5, 76.5, [0.56, 0.83]); if (f) { const g0 = base(f.lot.poly), p = [f.s.x + f.n[0] * 2.35, f.s.z + f.n[1] * 2.35]; sign(ctx, k, 'BLACK TIDE', 4.2, 0.62, p[0], g0 + 3.55, p[1], ry(f.n), { color: '#8fd14a', font: FONT.sans, emissive: true }); sign(ctx, k, 'BREWING', 2.4, 0.4, p[0], g0 + 3.0, p[1], ry(f.n), { color: '#8fd14a', font: FONT.sans, emissive: true }); out.blackTide = [+p[0].toFixed(1), +p[1].toFixed(1)]; } }
  // the map board on 結's cedar wall beside いちりん (IMG_0842: 1.3 m ahead of the camera at (-42.6, 84.2), heading 320, the board facing SE)
  { const f = { lot: Y.find((l) => inPoly(-44.2, 82.4, l.poly)) || Y[0], n: [0.643, 0.766] }; if (f.lot) { const g0 = base(f.lot.poly), p = [-43.44, 83.2]; const g = k.group([p[0], g0 + 1.6, p[1]], ry(f.n)), kk = ctx.kit(g); kk.box(1.3, 0.95, 0.04, m.yellow, [0, 0, 0]); const tt = textTex(ctx, 'Kesennuma slow street 結', { w: 1024, h: 128, color: '#2b2f3a', font: FONT.sans, weight: 700, size: 0.6 }); kk.plane(1.15, 0.15, mapMat(ctx, 'decal', '#ffffff', tt, { transparent: true, alphaTest: 0.3 }), [0, 0.33, 0.03]); for (const [bx, bz, bw, bh] of [[-0.42, 0.08, 0.3, 0.16], [-0.05, 0.08, 0.3, 0.16], [0.34, 0.02, 0.32, 0.26], [-0.25, -0.22, 0.42, 0.22], [0.3, -0.25, 0.4, 0.14], [-0.53, -0.18, 0.1, 0.3]]) kk.box(bw, bh, 0.02, m.white, [bx, bz, 0.03]); out.mapBoard = [+p[0].toFixed(1), +p[1].toFixed(1)]; } }
  totem(ctx, k, m, -28.4, base(SITES.yuwaeru.poly), 62.6, ry([0.9, -0.3]), { mat: m.aqua, title: '結', sub: 'UNITED VILLAGES', h: 2.6 });
  // 拓: white corrugated + grey timber panels, the name on the slow-street face, a pergola with かつお banners
  for (const lot of H) {
    const P = lot.poly, g0 = base(P), top = g0 + 5.6;
    k.mesh(capGeo(P, top, { tile: 4 }), m.roofLight); k.mesh(prismWalls(offsetRing(P, 0.04), top - 0.3, top + 0.35, { tile: 3 }), m.corr);
    edgesOf(P, (a, b, len, n, u) => {
      const s = seg(a, b);
      if (len < 10) { k.box(0.2, top - g0, len, m.corr, [s.x - n[0] * 0.1, (top + g0) / 2, s.z - n[1] * 0.1], [0, s.rotY, 0]); return; }
      const nseg = Math.max(1, Math.round(len / 7)), sl = len / nseg;
      for (let i = 0; i < nseg; i++) { const c = [a[0] + u[0] * sl * (i + 0.5), a[1] + u[1] * sl * (i + 0.5)], mat = [m.corrH, m.gtimber, m.corr, m.gtimber][i % 4]; k.box(0.2, top - g0, sl + 0.02, mat, [c[0] - n[0] * 0.1, (top + g0) / 2, c[1] - n[1] * 0.1], [0, s.rotY, 0]); if (i % 4 === 2) { k.box(sl * 0.6, 2.4, 0.08, m.glassShop, [c[0] + n[0] * 0.02, g0 + 1.3, c[1] + n[1] * 0.02], [0, ry(n), 0]); k.box(sl * 0.75, 0.08, 1.4, m.roofLight, [c[0] + n[0] * 0.7, g0 + 2.9, c[1] + n[1] * 0.7], [0, ry(n), 0]); } }
      // the slow-street face (NW): the name, a low planted strip with bollards; the pergola and banners on its SW half
      if (n[0] * -0.69 + n[1] * -0.72 > 0.6 && len > 20) {
        const sw = a[1] > b[1] ? a : b, ne = sw === a ? b : a, uu = [(ne[0] - sw[0]) / len, (ne[1] - sw[1]) / len];   // f = 0 at the SW end
        const at = (f, d = 0.1) => [sw[0] + uu[0] * len * f + n[0] * d, sw[1] + uu[1] * len * f + n[1] * d];
        const [tx, tz] = at(0.82); sign(ctx, k, 'Kesennuma Amway House Hirakeru', 5.4, 0.62, tx, g0 + 4.2, tz, ry(n), { color: '#4a4c50', font: FONT.sans, weight: 500 });
        const [kx, kz] = at(0.93, 0.12); sign(ctx, k, 'KNEWS', 1.3, 0.42, kx, g0 + 2.6, kz, ry(n), { color: '#2b2a33', bg: '#f4f4f0', font: FONT.sans });
        for (let f = 0.55; f < 0.98; f += 0.06) { const [bx, bz] = at(f, 1.0); k.box(0.16, 0.9, 0.16, m.black, [bx, g0 + 0.45, bz]); }
        for (let f = 0.06; f < 0.42; f += 0.055) { const [px, pz] = at(f, 2.6); k.box(0.16, 3.1, 0.16, m.gtimber, [px, g0 + 1.55, pz]); }
        { const p0 = at(0.04, 2.6), p1 = at(0.44, 2.6), q0 = at(0.04, 0.1), q1 = at(0.44, 0.1); barAlong(k, p0, p1, g0 + 3.15, 0.18, 0.22, m.gtimber); for (let f = 0.05; f < 0.44; f += 0.025) { const A2 = at(f, 0.1), B2 = at(f, 2.7); barAlong(k, A2, B2, g0 + 3.32, 0.08, 0.12, m.gtimber); } void q0; void q1; }
        for (let f = 0.1; f < 0.5; f += 0.07) { const [px, pz] = at(f, 3.4); k.box(0.04, 3.0, 0.04, m.white, [px, g0 + 1.5, pz]); const tex = textTex(ctx, '気仙沼 かつお', { w: 128, h: 512, color: '#e8384a', bg: '#1f2350', font: FONT.brush, weight: 700, size: 0.9 }); k.plane(0.6, 1.8, mapMat(ctx, 'toon', '#ffffff', tex, { paint: 0, side: 'double' }), [px + uu[0] * 0.33, g0 + 1.9, pz + uu[1] * 0.33], [0, ry(n), 0]); k.box(0.5, 0.15, 0.5, m.white, [px, g0 + 0.08, pz]); }
      }
    });
    out.hirakeru++;
  }
  totem(ctx, k, m, -19.0, base(SITES.hirakeru.poly), 86.8, ry([0.5, -0.86]), { mat: m.rust, title: '拓', sub: 'HIRAKERU', h: 2.4 });
  // the slow street: pavers with red and dark bands; string lights criss-crossing overhead on poles
  {
    const A0 = [-17.5, 75.5], B0 = [-66, 121.5], s = seg(A0, B0), n = [s.uz, -s.ux], hw = 6.5, gy = Math.max(L.heightAt(A0[0], A0[1]), L.heightAt(B0[0], B0[1])) + 0.07;
    const quad = [[A0[0] + n[0] * hw, A0[1] + n[1] * hw], [B0[0] + n[0] * hw, B0[1] + n[1] * hw], [B0[0] - n[0] * hw, B0[1] - n[1] * hw], [A0[0] - n[0] * hw, A0[1] - n[1] * hw]];
    k.mesh(capGeo(quad, gy, { tile: 8 }), m.paver);
    for (const [o2, mat, w] of [[-1.8, m.red, 0.5], [2.4, m.sett, 0.9], [-4.4, m.sett, 0.7]]) { const g = new THREE.PlaneGeometry(w, s.len); g.rotateX(-Math.PI / 2); k.mesh(g, mat === m.red ? ctx.mat.toon('#9a4a3e', { paint: 0.03, polygonOffset: -3 }) : mat, [s.x + n[0] * o2, gy + 0.012, s.z + n[1] * o2], [0, s.rotY, 0]); }
    for (let d = 4; d < s.len - 2; d += 7) { for (const sd of [-1, 1]) { const px = A0[0] + s.ux * d + n[0] * sd * (hw - 0.4), pz = A0[1] + s.uz * d + n[1] * sd * (hw - 0.4); if (sd > 0 && d % 14 > 7) continue; k.cyl(0.06, 0.07, 6.2, m.grey, [px, gy + 3.1, pz], null, 6); } const a = [A0[0] + s.ux * d + n[0] * (hw - 0.4), gy + 5.9, A0[1] + s.uz * d + n[1] * (hw - 0.4)], b = [A0[0] + s.ux * (d + 7) - n[0] * (hw - 0.4), gy + 5.9, A0[1] + s.uz * (d + 7) - n[1] * (hw - 0.4)]; stringLights(k, m, a, b, 0.6, 0.7); const c2 = [A0[0] + s.ux * (d + 7) + n[0] * (hw - 0.4), gy + 5.9, A0[1] + s.uz * (d + 7) + n[1] * (hw - 0.4)], d2 = [A0[0] + s.ux * d - n[0] * (hw - 0.4), gy + 5.9, A0[1] + s.uz * d - n[1] * (hw - 0.4)]; stringLights(k, m, c2, d2, 0.6, 0.7); }
    out.slowStreet = { a: A0, b: B0, width: hw * 2 };
  }
  void r;
  return out;
}

// ======================================================================================================== the convenience store
export function buildKonbiniPhotos(ctx, k, { L, base }) {
  const m = mats5(ctx), P = KONBINI.poly, g0 = base(P), top = g0 + 4.6;
  k.mesh(prismWalls(P, g0 - 0.4, top, { tile: 3 }), m.white);
  k.mesh(capGeo(P, top + 0.02, { tile: 4 }), m.roofLight);
  const o = obbOf(P);
  for (let s = -o.d / 2 + 2; s < o.d / 2 - 1.5; s += 2.2) k.box(o.w - 2.2, 0.08, 1.7, m.pv, [o.cx + o.ux * s, top + 0.45, o.cz + o.uz * s], [0, o.rotY, 0.2]);
  edgesOf(P, (a, b, len, n, u, i) => {
    const s = seg(a, b);
    if (i === KONBINI.front) {
      k.box(0.1, 2.6, len - 1.0, m.glassShop, [s.x + n[0] * 0.06, g0 + 1.55, s.z + n[1] * 0.06], [0, s.rotY, 0]);
      for (let d = 0.5; d <= len - 0.5; d += (len - 1) / 6) k.box(0.12, 2.6, 0.1, m.grey, [a[0] + u[0] * d + n[0] * 0.1, g0 + 1.55, a[1] + u[1] * d + n[1] * 0.1]);
    }
    if (i === KONBINI.front || i === KONBINI.front - 1 || i === 3) { const f = k.box(0.12, 1.1, len + 0.2, m.stripes, [s.x + n[0] * 0.12, g0 + 3.55, s.z + n[1] * 0.12], [0, s.rotY + Math.PI / 2, 0]); f.rotation.set(0, ry(n), 0); f.scale.set(len + 0.2, 1.1, 0.12); }
    if (i === KONBINI.brick) k.box(0.14, top - g0, len, m.brick, [s.x + n[0] * 0.08, (top + g0) / 2, s.z + n[1] * 0.08], [0, s.rotY, 0]);
  });
  // the pole sign: a tall white pole, a lit box with a stylised 7 in orange, green and red bands, and a red ATM / 酒 / たばこ plate
  { const [x, z] = KONBINI.pole, gy = L.heightAt(x, z), H = 8.4; k.cyl(0.22, 0.26, H, m.white, [x, gy + H / 2, z], null, 12); const g = k.group([x, gy + H, z], ry([0.97, 0.2])), kk = ctx.kit(g); kk.box(2.2, 2.4, 0.5, m.white, [0, 1.2, 0]); const t7 = ctx.tex.draw(256, 256, (c, w, h) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h); c.fillStyle = '#2a9a4e'; c.fillRect(w * 0.12, h * 0.78, w * 0.76, h * 0.07); c.fillStyle = '#d6343a'; c.fillRect(w * 0.12, h * 0.87, w * 0.76, h * 0.05); c.fillStyle = '#ef7d2b'; c.font = `900 ${h * 0.7}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('7', w / 2, h * 0.42); }, { key: 'p5-seven' }); for (const f of [1, -1]) kk.plane(2.0, 2.2, glowMat(ctx, t7, 1.05), [0, 1.25, f * 0.26], [0, f > 0 ? 0 : Math.PI, 0]); kk.box(2.2, 0.6, 0.45, m.red, [0, -0.35, 0]); for (const f of [1, -1]) sign(ctx, kk, 'ATM  酒  たばこ', 2.0, 0.45, 0, -0.35, f * 0.24, f > 0 ? 0 : Math.PI, { color: '#ffffff', font: FONT.sans }); ctx.physics?.addBox?.(x, z, 0.5, 0.5, 0, gy, gy + H); }
  ctx.physics?.addBox?.(o.cx, o.cz, o.w, o.d, o.rotY, g0, top);
  return { g0, top };
}

// ======================================================================================================== road markings
/** Zebra crossings, the hatched median and ◇ marks on 魚町港町線 at the 結 junction, black bollards with white bands. */
export function buildMarkingsPhotos(ctx, k, { L }) {
  const m = mats5(ctx), yAt = (x, z) => L.heightAt(x, z) + 0.075;
  const quad = (c, t, u0, u1, v0, v1) => { const n = [-t[1], t[0]], P = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([u, v]) => [c[0] + n[0] * u + t[0] * v, c[1] + n[1] * u + t[1] * v]); k.mesh(capGeo(P, yAt(c[0], c[1]), { tile: 2 }), m.roadWhite); };
  const roadAt = (a, b, f) => { const p = lerp(a, b, f), s = seg(a, b); return { p, t: [s.ux, s.uz] }; };
  const N1 = [[-73, -30], [-17, 72]], S1 = [[-17, 72], [0, 97]];
  const zebra = ({ p, t }, half = 4.0) => { for (let o2 = -half + 0.45; o2 <= half - 0.45; o2 += 0.9) quad(p, t, o2 - 0.225, o2 + 0.225, -2, 2); };
  zebra(roadAt(N1[0], N1[1], 0.9)); zebra(roadAt(S1[0], S1[1], 0.33));
  // the hatched median (導流帯) north of the junction: two edge lines and diagonal bars
  { const a = roadAt(N1[0], N1[1], 0.62), b = roadAt(N1[0], N1[1], 0.82), t = a.t, len = Math.hypot(b.p[0] - a.p[0], b.p[1] - a.p[1]), c = lerp(a.p, b.p, 0.5); for (const e of [-0.85, 0.85]) quad(c, t, e - 0.08, e + 0.08, -len / 2, len / 2); for (let v = -len / 2 + 1; v < len / 2 - 0.5; v += 2.0) { const n = [-t[1], t[0]], P = [[-0.8, v], [-0.8, v + 0.45], [0.8, v + 1.25], [0.8, v + 0.8]].map(([u, w]) => [c[0] + n[0] * u + t[0] * w, c[1] + n[1] * u + t[1] * w]); k.mesh(capGeo(P, yAt(c[0], c[1]), { tile: 2 }), m.roadWhite); } }
  // ◇ crossing-ahead marks
  for (const { p, t } of [roadAt(N1[0], N1[1], 0.55), roadAt(S1[0], S1[1], 0.85)]) for (const off of [-2, 2]) { const c = [p[0] - t[1] * off, p[1] + t[0] * off], n = [-t[1], t[0]]; const ring = [[0, 2.2], [0.75, 0], [0, -2.2], [-0.75, 0]].map(([u, v]) => [c[0] + n[0] * u + t[0] * v, c[1] + n[1] * u + t[1] * v]); const inner = [[0, 1.85], [0.6, 0], [0, -1.85], [-0.6, 0]].map(([u, v]) => [c[0] + n[0] * u + t[0] * v, c[1] + n[1] * u + t[1] * v]); k.mesh(capGeo(ring, yAt(c[0], c[1]), { tile: 2, holes: [inner] }), m.roadWhite); }
  // black bollards with white reflective bands along the kerbs at the junction
  const bol = (x, z) => { const gy = L.heightAt(x, z) + 0.15; k.cyl(0.08, 0.08, 0.85, m.black, [x, gy + 0.42, z], null, 8); k.cyl(0.085, 0.085, 0.08, m.white, [x, gy + 0.68, z], null, 8); k.cyl(0.085, 0.085, 0.06, m.white, [x, gy + 0.52, z], null, 8); ctx.physics?.addBox?.(x, z, 0.2, 0.2, 0, gy, gy + 0.9); };
  for (let f = 0.78; f < 0.97; f += 0.025) { const { p, t } = roadAt(N1[0], N1[1], f); bol(p[0] - t[1] * -5.3, p[1] + t[0] * -5.3); }
  for (let f = 0.05; f < 0.5; f += 0.06) { const { p, t } = roadAt(S1[0], S1[1], f); bol(p[0] - t[1] * 5.2, p[1] + t[0] * 5.2); }
  return { zebras: 2 };
}
