// [cafe-rst] café RST, the roastery café on the ground floor of 迎 (ムカエル, 南町海岸1-14), as a walk-in anime interior.
// 迎's SE end is two storeys: ANCHOR COFFEE 内湾店 is on the 2F; the 1F is café RST and, in the same open room, the shark
// goods of Lander Blue / SHARKS. The exterior is harbor/minami5.js buildMukaeruPhotos (the ANCHOR face on its surveyed plane);
// this module builds the room behind that face: from the street door at the NW end of the face (a dark timber door under the
// pink "café" / blue "RST" neon fascia) into the room, with the counter along the NW wall, the street windows with their
// helmet-and-plush-shark shelf, the lattice screen, the retail corner under the beam of shark jaws, the dining end with the
// motorcycle, and the exposed steel deck overhead.
//
// Sources: the project owner's own walk-through video of the room (IMG_1047, 2026-10-06, one pan from inside the shop) and the
// town data for the hard scale (the surveyed ANCHOR face, harbor/minami5.js ANCHOR, data/survey/minami; harbor/cafe-front.js).
// Measured plan and residuals: docs/anime/interiors-cafe-rst.md. No other photograph of the shop is used (nothing from maps
// services or the shop's own site). Nothing is invented on a sign: where the real boards carry another company's brand (the video
// has several), no mark is drawn and no word is made up, only coloured cards; the café's own words are drawn as the café spells
// them. The people are the town's own anime figures (cafe-rst-people.js), invented, never likenesses.
//
// Consent (the shop agreed, 2026-10-07): CAFE_RST_CONSENT below. Credit line: CAFE_RST_CREDIT, drawn on a small plaque inside the
// door and carried in the interior's record (interiors.list[].credit) for any UI that shows who helped.
//
// Interiors are lit like the other rooms (explore/interiors.js): surfaces ignore the building's own shadow; lamps are emissive
// or, for the bulbs, the life package's lamp material (dim by day, lit at dusk); at night the room's lamps also register as real
// point lights with life's lamp pool, so the toon surfaces near them go warm.
import * as THREE from 'three';
import { lights as lifeLights } from '../life/lights.js';
import { buildCafePeople, PEOPLE } from './cafe-rst-people.js';
import { FRONT, FACE, OPENINGS } from '../harbor/cafe-front.js';
import { SITES } from '../harbor/real.js';

/** 協力 / consent record. owner: the shop; scope: what was agreed; ref: where the agreement is recorded (verbal until the written form comes). */
export const CAFE_RST_CONSENT = Object.freeze({
  owner: 'café RST',
  date: '2026-10-07',
  scope: 'shown in KesenMemento as an anime-style interior based on the project owner\'s video',
  tokens: Object.freeze(['display-web', 'display-event', 'derivatives']),
  ref: 'verbal OK to the author, written form pending',
  removable: 'on request: set ENABLED false (this file) and the room is gone; the exterior stays',
});
/** 協力: café RST (the credit line shown with the room). */
export const CAFE_RST_CREDIT = Object.freeze({ ja: '協力：café RST', en: 'With the cooperation of café RST' });
/** The switch: false takes the room out of the app (a takedown on the shop's request). */
export const ENABLED = true;

export { FRONT };
/** Unit vector along the face from P1 (NW end) to P2 (SE end), and the inward normal (into the building). */
export const UF = FACE.u;
export const NIN = Object.freeze([UF[1], -UF[0]]);
/** Frame rotation (three.js rotation.y): local +x = along the face to the SE, local +z = out to the street, so local z = -y_r. */
export const THETA = Math.atan2(-UF[1], UF[0]);

// ====================================================================================================== the plan
/**
 * The room in the ROOM FRAME: x_r along the face from P1 toward P2, y_r into the building from the face, z up from the floor.
 * Every value names its basis and sigma (docs/anime/interiors-cafe-rst.md). PROVISIONAL numbers are marked (p): they are read
 * from the video's frames against the surveyed face until the measured plan is fitted.
 */
export const PLAN = {
  wall: 0.2,                               // the street wall's inner face at y_r = 0.20 (thickness assumed, sigma 0.08)
  x0: 0.25,                                // the NW wall, inner face: 0.25 (sigma 0.30; the back-bar wall)
  x1: 9.35,                                // the SE wall, inner face at the street end (survey P2 minus the wall; it leans 6.3 deg out: x1 + 0.1105 y_r), sigma 0.25
  y1: 6.07,                                // the rear wall, inner face: 6.07 = the survey's P3 depth, the video puts it parallel to the street wall (sigma 0.7)
  ceil: 3.0,                               // underside of the steel deck: 3.0 (the video alone gives 3.45 +-0.35 but depends on the camera height; the exterior's 2F glass starts 3.0 above this floor)
};
export const DOOR = OPENINGS.find((o) => o.id === 'door');

// ====================================================================================================== helpers
const D2R = Math.PI / 180;
/** The SE inner face's x_r at depth y_r (the end wall leans 6.3 deg off the perpendicular). */
export const seX = (y) => PLAN.x1 + 0.1105 * y;
/** Is the room-frame point (x, y) inside the room (the quad of the four inner faces)? */
export const inRoom = (x, y, pad = 0) => x > PLAN.x0 + pad && x < seX(y) - pad && y > PLAN.wall + pad && y < PLAN.y1 - pad;
/** Room-frame point -> world (x, z). */
export const roomToWorld = (x, y) => [FRONT.P1[0] + UF[0] * x + NIN[0] * y, FRONT.P1[1] + UF[1] * x + NIN[1] * y];
/** World (x, z) -> room-frame (x_r, y_r). */
export const worldToRoom = (X, Z) => { const dx = X - FRONT.P1[0], dz = Z - FRONT.P1[1]; return [dx * UF[0] + dz * UF[1], dx * NIN[0] + dz * NIN[1]]; };
/** Player yaw (deg, 0 = north, the Player convention) that faces the room direction (dx, dy). */
export const yawToward = (dx, dy) => { const fx = dx * UF[0] + dy * NIN[0], fz = dx * UF[1] + dy * NIN[1]; return +(Math.atan2(-fx, -fz) / D2R).toFixed(1); };

/** Build the room. `kit` = { frame, person, textTex } from interiors.js (the shared placement frame, the stylised figure and the
 *  texture helper). Returns the interior's record. */
export function buildCafeRst(ctx, root, kit) {
  const { frame, textTex } = kit;
  const T = ctx.tex, FN = T.FONTS, P = ctx.physics;
  const FY = FRONT.floor, H = PLAN.ceil, X0 = PLAN.x0, Y0 = PLAN.wall, Y1 = PLAN.y1;
  const F = frame(ctx, root, FRONT.P1[0], 0, FRONT.P1[1], THETA);
  const items = [];                        // every placed piece (id, footprint, solid): the layout the tests read
  const note = (id, x0, x1, y0, y1, z0, z1, solid = true) => { items.push({ id, x0, x1, y0, y1, z0, z1, solid }); };

  // ---- room-frame placement: (x_r, y_r, z up) -> frame-local (x, y, z) = (x_r, FY + z, -y_r)
  // every toon surface of the room carries a small warm self-light (emissive): the cel ramp's unlit band would otherwise read cold blue-grey under the sky, and at night the room stays warm
  // between the lamp pool's real lights (the same emissive on every material: batch2 keeps them in shared groups)
  const WARM = '#4a3828';
  const snap = (pt) => (pt === 0 ? 0 : pt >= 0.045 ? 0.05 : 0.03);   // three paint amounts only: each distinct value is another merged draw group
  const noSnow = (m, on = true) => { if (on) m.userData.noSnow = true; return m; };   // the room is indoors: winter snow lies on every other cel surface, so these materials opt out (core/batch2.js keeps the opt-out in the merged group)
  const tone = (c, paint = 0.03, o = {}) => noSnow(ctx.mat.toon(c, { paint: snap(paint), emissive: WARM, noSnow: true, ...o }), o.noSnow !== false);
  const box = (w, h, d, mat, x, y, z, o = {}) => F.box(w, h, d, mat, x, FY + z, -y, o);
  const boxAt = (x0, x1, y0, y1, z0, z1, mat, o = {}) => box(x1 - x0, z1 - z0, y1 - y0, mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, o);
  const cyl = (r, h, mat, x, y, z, o = {}) => F.mesh(ctx.geo.G.cyl(o.seg || 10), mat, x, FY + z, -y, { scale: [r * 2, h, r * (o.rz2 ?? 1) * 2], ry: o.ry, rx: o.rx, rz: o.rz });
  const sph = (r, mat, x, y, z, o = {}) => F.mesh(ctx.geo.G.sphere(o.seg || 10), mat, x, FY + z, -y, { scale: o.scale || [r * 2, r * 2, r * 2], ry: o.ry, rx: o.rx, rz: o.rz });
  const mesh = (geo, mat, x, y, z, o = {}) => F.mesh(geo, mat, x, FY + z, -y, o);
  // a plane facing the room direction (nx, ny) at (x, y, z); w across, h up
  const faceRy = (nx, ny) => Math.atan2(nx, -ny);
  const pln = (w, h, mat, x, y, z, nx, ny, rx = 0) => F.plane(w, h, mat, x, FY + z, -y, faceRy(nx, ny), rx);
  const colBox = (x0, x1, y0, y1, z0, z1) => F.col(P, (x0 + x1) / 2, -(y0 + y1) / 2, x1 - x0, y1 - y0, FY + z0, FY + z1);
  const colCyl = (x, y, r, z0, z1) => { const [X, Z] = F.w(x, -y); P.addCylinder(X, Z, r, FY + z0, FY + z1); };
  const solid = (id, x0, x1, y0, y1, z0, z1, o = {}) => { note(id, x0, x1, y0, y1, z0, z1, true); if (o.col !== false) { if (o.round) colCyl((x0 + x1) / 2, (y0 + y1) / 2, o.round, z0, z1); else colBox(x0, x1, y0, y1, z0, z1); } };
  const tex = (key, w, h, draw) => textTex(ctx, 'cafe-' + key, w, h, draw);
  const repeatTex = (key, w, h, draw) => T.draw(w, h, draw, { key: 'explore-int-cafe-' + key, repeat: [1, 1], anisotropy: 8 });
  const rng = (s) => ctx.rng('cafe-rst-' + s);

  // ---- materials (colours bake into vertex colours at batch time, so only the `paint` values and the maps make draw calls)
  const M = {
    white: tone('#efe9dc', 0.02), plaster: tone('#e9e1d2', 0.02), steel: tone('#3b3743', 0, { emissive: '#000000' }), steelL: tone('#7b8088', 0.02), brass: tone('#b9904a', 0.02), copper: tone('#a8643a', 0.03),
    walnut: tone('#6a4429', 0.04), oak: tone('#a9774a', 0.04), tableTop: tone('#4b2e20', 0.03), chair: tone('#8a5230', 0.04), greige: tone('#8b7d69', 0.03), greigeD: tone('#6f634f', 0.03),
    cream: tone('#e8d9a8', 0.02), alu: tone('#d8dcdb', 0.02), post: tone('#5c3d2d', 0.04), doorW: tone('#3d2a22', 0.04), sack: tone('#bf9b66', 0.05), black: tone('#2f2c36', 0, { emissive: '#000000' }),
    pale: tone('#e7d8a2', 0.02), red: tone('#c4352e', 0.02), blue: tone('#2f5d9a', 0.02), green: tone('#3f7a4a', 0.05), pot: tone('#b9633f', 0.03), tile: tone('#8d9096', 0.02),
    leaf: tone('#4d8a45', 0.05, { side: 'double' }), leafD: tone('#37693a', 0.05, { side: 'double' }),
    skin: tone('#e9c3a0', 0, { noSnow: true }),
    glass: ctx.mat.glass ? ctx.mat.glass({ tint: '#bcd8e6', opacity: 0.15, streaks: false }) : new THREE.MeshBasicMaterial({ color: '#bcd8e6', transparent: true, opacity: 0.15, depthWrite: false }),
    glassC: ctx.mat.glass ? ctx.mat.glass({ tint: '#d6ecf6', opacity: 0.4, streaks: false }) : new THREE.MeshBasicMaterial({ color: '#d6ecf6', transparent: true, opacity: 0.4, depthWrite: false }),   // the brewers' glass: clearer than a window
    lamp: ctx.mat.emissive('#fff0d0', 1.4), warm: ctx.mat.emissive('#ffe2b0', 1.05),
  };
  const Lt = (() => { try { return lifeLights(ctx); } catch { return null; } })();
  const bulb = Lt?.lampMaterial ? Lt.lampMaterial('#efe3c8', '#ffd9a0', 2.1) : M.lamp;

  // ---- repeating surfaces: the floor (planks run along y_r), the steel deck (ribs run along x_r), the wall boards
  const floorTex = repeatTex('floor', 256, 256, (g, w, h) => {
    const r = rng('floor'), n = 14, pw = w / n, cols = ['#5a3924', '#6b4428', '#7a4d2b', '#4f3220', '#84562f', '#63402a', '#70482c'];
    for (let i = 0; i < n; i++) {
      g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(i * pw, 0, pw + 1, h);
      const j = Math.floor(r() * h); g.fillStyle = 'rgba(30,18,10,.55)'; g.fillRect(i * pw, j, pw, 2);   // a butt joint
      g.fillStyle = 'rgba(255,225,170,.10)'; g.fillRect(i * pw + pw * 0.25, 0, 2, h);
      g.fillStyle = 'rgba(30,18,10,.45)'; g.fillRect(i * pw, 0, 1.5, h);
    }
  });
  const deckTex = repeatTex('deck', 128, 128, (g, w, h) => {
    g.fillStyle = '#3a3640'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) { g.fillStyle = '#4c4854'; g.fillRect(0, y + 3, w, 7); g.fillStyle = '#2b2830'; g.fillRect(0, y + 14, w, 5); g.fillStyle = '#403c47'; g.fillRect(0, y + 22, w, 6); }
  });
  const cladTex = repeatTex('clad', 128, 128, (g, w, h) => {
    const r = rng('clad'), cols = ['#8a7b67', '#7f705d', '#948570', '#76695a', '#8d7e69'];
    for (let y = 0; y < h; y += 16) { g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(0, y, w, 16); g.fillStyle = 'rgba(40,30,20,.55)'; g.fillRect(0, y, w, 1.5); const j = Math.floor(r() * w); g.fillStyle = 'rgba(40,30,20,.4)'; g.fillRect(j, y, 1.5, 16); }
  });
  const floorM = noSnow(ctx.mat.toon('#ffffff', { map: floorTex, paint: 0.03, emissive: WARM, noSnow: true }));
  const deckM = noSnow(ctx.mat.toon('#ffffff', { map: deckTex, paint: 0, noSnow: true }));
  const cladM = noSnow(ctx.mat.toon('#ffffff', { map: cladTex, paint: 0.03, emissive: WARM, noSnow: true }));
  /** A convex polygon in the room frame (fan), up or down, with uv in metres / `tile`. */
  const polyGeo = (pts, z, up, tile = 1.2) => {
    const pos = [], uv = [], idx = [];
    pts.forEach(([x, y]) => { pos.push(x, z, -y); uv.push(x / tile, y / tile); });   // (the mesh itself sits at y = FY)
    for (let i = 1; i < pts.length - 1; i++) idx.push(0, i, i + 1);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    if ((g.attributes.normal.getY(0) > 0) !== up) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t2 = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t2; } g.computeVertexNormals(); }
    return g;
  };
  /** A vertical wall quad between two room points (a -> b), z0..z1, facing the side of (fx, fy); uv in metres / tile. */
  const wallGeo = (a, b, z0, z1, fx, fy, tile = 1) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const pos = [a[0], z0, -a[1], b[0], z0, -b[1], b[0], z1, -b[1], a[0], z1, -a[1]];
    const uv = [0, z0 / tile, len / tile, z0 / tile, len / tile, z1 / tile, 0, z1 / tile];
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals();
    const n = g.attributes.normal, mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    if (n.getX(0) * (fx - mx) + n.getZ(0) * -(fy - my) < 0) { g.setIndex([0, 2, 1, 0, 3, 2]); g.computeVertexNormals(); }
    return g;
  };

  // ================================================================================================== painted signs (small tiles: they join the interiors' atlas)
  const neonTex = tex('neon', 512, 160, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.lineCap = 'round'; g.lineJoin = 'round';
    const tube = (draw, color, lw, blur) => { g.save(); g.shadowColor = color; g.shadowBlur = blur; g.strokeStyle = color; g.lineWidth = lw; draw(); g.restore(); };
    // the shark (a white tube, snout to the left) with the pink "café" inside and three gill tubes
    const shark = () => { g.beginPath(); g.moveTo(10, 84); g.bezierCurveTo(44, 52, 96, 30, 150, 28); g.bezierCurveTo(186, 28, 212, 40, 226, 60); g.bezierCurveTo(220, 92, 202, 118, 176, 130); g.bezierCurveTo(124, 128, 52, 112, 10, 84); g.closePath(); g.stroke(); };
    tube(shark, '#ffffff', 5, 16);
    tube(() => { g.beginPath(); for (const x of [188, 198, 208]) { g.moveTo(x, 64); g.quadraticCurveTo(x + 6, 86, x - 2, 104); } g.stroke(); }, '#ffb3d1', 4, 12);
    g.save(); g.shadowColor = '#ff7fb4'; g.shadowBlur = 14; g.fillStyle = '#ffa5cb'; g.font = `700 52px ${FN.hand}`; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('café', 36, 82); g.restore();
    // RST: slab letters as a green tube outline with a white core
    g.font = `900 104px ${FN.serif}`; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    for (const [c, lw, bl] of [['#38e07f', 9, 18], ['#eafff1', 2.4, 4]]) { g.save(); g.shadowColor = c; g.shadowBlur = bl; g.strokeStyle = c; g.lineWidth = lw; g.strokeText('RST', 236, 104); g.restore(); }
    g.save(); g.shadowColor = '#ff7a2a'; g.shadowBlur = 12; g.fillStyle = '#ff9a3c'; g.font = `700 30px ${FN.hand}`; g.textAlign = 'left'; g.fillText('reset and restart', 262, 146); g.restore();
  });
  const neonM = ctx.mat.emissive('#ffffff', 1.25, { map: neonTex, transparent: true, depthWrite: false });
  // ---- the two chalkboard menus, redrawn line by line from the video (docs/anime/interiors-cafe-rst.md "Signage"): only the lines whose names read clearly are drawn, and a price only where every
  // digit read clearly (several first digits read 7 or 9 in the video's pixels; a wrong price on the shop's own board is worse than a bare name). Positions are fractions of the chalk surface.
  // [text, y, price, x offset]; a block: { head: [text, x, y, w, size, chalk], rule: [x0, x1, y], x, w, lines }
  const CH = { cream: '#e6dcc6', yellow: '#e9dfae', orange: '#f0a860', pink: '#e9a0b6', green: '#9bc89a', red: '#ee6a40' };
  const MENU_LEFT = {
    frame: '#974a4c', aspect: 0.708,
    title: [['café RST', 0.035, 0.085, 0.55, 0.098, CH.cream], ['OPEN', 0.61, 0.036, 0.2, 0.05, CH.yellow], ['10:00～18:00', 0.61, 0.098, 0.31, 0.042, CH.yellow]],
    blocks: [
      { head: ['coffee', 0.04, 0.2, 0.23, 0.062, CH.cream], sub: ['Hot/Ice', 0.31, 0.2, 0.19, 0.04], rule: [0.04, 0.27, 0.228], x: 0.04, w: 0.46, lines: [['プレミアムブレンド', 0.268, 600], ['コロンビア', 0.33, null], ['ブラジル', 0.376, 700], ['グアテマラ', 0.435, 800], ['マンデリン', 0.49, 900], ['ウインナーコーヒー', 0.55, null]] },
      { x: 0.03, w: 0.47, lines: [['エスプレッソ', 0.65, 500], ['ダブル', 0.688, null], ['アメリカーノ Hot/Ice', 0.738, 600], ['Lサイズ +100円', 0.773, null]] },
      { head: ['COCOA', 0.03, 0.855, 0.18, 0.045, CH.cream], rule: [0.03, 0.21, 0.865], x: 0.03, w: 0.47, lines: [['ココア Hot/Ice', 0.915, 700]] },
      { head: ['latte', 0.53, 0.172, 0.14, 0.05, CH.cream], sub: ['Hot/Ice', 0.72, 0.172, 0.2, 0.04], rule: [0.525, 0.67, 0.185], x: 0.525, w: 0.46, lines: [['カフェラテ', 0.214, null], ['カフェモカ', 0.263, 950], ['キャラメルラテ', 0.308, 950], ['メープルラテ', 0.354, 950]] },
      { head: ['float', 0.53, 0.44, 0.14, 0.04, CH.cream], rule: [0.525, 0.68, 0.447], x: 0.525, w: 0.46, lines: [['クリームソーダ', 0.465, 700], ['ブルーハワイソーダ', 0.514, null], ['イチゴソーダ', 0.554, 900], ['コーラフロート', 0.595, 900], ['コーヒーフロート', 0.637, 980]] },
      { head: ['juice', 0.53, 0.712, 0.14, 0.04, CH.cream], rule: [0.525, 0.67, 0.717], x: 0.525, w: 0.46, lines: [['バナナジュース', 0.743, 900], ['チョコバナナジュース', 0.779, 800], ['イチゴミルク', 0.811, 800], ['オレンジジュース', 0.852, 600], ['マンゴージュース', 0.89, 600]] },
    ],
  };
  const MENU_RIGHT = {
    frame: '#a8794a', aspect: 0.705,
    title: [['Soft-Sweets', 0.26, 0.05, 0.53, 0.07, CH.cream], ['Hotdog', 0.8, 0.03, 0.19, 0.03, CH.pink], ['Foods', 0.8, 0.07, 0.19, 0.03, CH.green]],
    blocks: [
      { x: 0.014, w: 0.62, lines: [['モーランドソフト', 0.119, 480]] },
      { x: 0.014, w: 0.49, lines: [['アフォガート', 0.206, 700], ['チョコレートサンデー', 0.254, 700], ['ストロベリーサンデー', 0.302, null], ['キャラメルサンデー', 0.35, null]] },
      { head: ['チュロス', 0.014, 0.425, 0.15, 0.04, CH.orange], x: 0.17, w: 0.33, lines: [['・シナモン', 0.425, null], ['・チョコレート', 0.465, null], ['・メープル', 0.514, null]] },
      { head: ['ワッフル', 0.51, 0.205, 0.13, 0.04, CH.yellow], sub: ['Single', 0.52, 0.265, 0.12, 0.028], x: 0.64, w: 0.35, lines: [['・プレーン', 0.242, 300], ['・チョコレート', 0.287, 350]] },
      { sub: ['Plus', 0.52, 0.34, 0.1, 0.028], x: 0.64, w: 0.35, lines: [['・チョコレート', 0.34, 980], ['・ストロベリー', 0.393, 980], ['・メープル', 0.44, 980], ['・キャラメル', 0.49, 980]] },
      { head: ['Hotdog', 0.355, 0.56, 0.165, 0.04, CH.cream], x: 0.355, w: 0.64, lines: [['・ホットドッグ', 0.6, 600], ['・Wホットドッグ', 0.64, null], ['・チーズホットドッグ', 0.6, 680, 0.31], ['・Wチーズホットドッグ', 0.64, 980, 0.31]] },
      { head: ['Foods', 0.19, 0.695, 0.12, 0.03, CH.cream], sub: ['サラダ・スープ付き', 0.44, 0.695, 0.25, 0.026], x: 0.19, w: 0.5, lines: [['ふわとろ オムライス', 0.735, null], ['ドライカレー オムライス', 0.83, 1480], ['エビピラフ', 0.876, 1180], ['ドライカレー', 0.919, 1280], ['チキンライス', 0.962, 1180]] },
    ],
  };
  const chalkBoard = (key, M0) => {
    const W = 256, fw = 14, cw = W - 2 * fw, ch = Math.round(cw / M0.aspect), H = ch + 2 * fw;
    return tex(key, W, H, (g) => {
      g.fillStyle = M0.frame; g.fillRect(0, 0, W, H); g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(0, 0, W, 2); g.fillStyle = '#222b27'; g.fillRect(fw, fw, cw, ch);
      g.textBaseline = 'middle'; g.textAlign = 'left';
      const X = (f) => fw + f * cw, Y = (f) => fw + f * ch;
      for (const [t2, x, y, w, sz, col] of M0.title) { g.fillStyle = col; T.fitText(g, t2, X(x), Y(y), w * cw, sz * ch, FN.hand, 700); }
      for (const b of M0.blocks) {
        if (b.head) { const [t2, x, y, w, sz, col] = b.head; g.fillStyle = col; T.fitText(g, t2, X(x), Y(y), w * cw, sz * ch, FN.hand, 700); }
        if (b.sub) { const [t2, x, y, w, sz] = b.sub; g.fillStyle = '#d9cfb8'; T.fitText(g, t2, X(x), Y(y), w * cw, sz * ch, FN.hand, 500); }
        if (b.rule) { g.fillStyle = CH.red; g.fillRect(X(b.rule[0]), Y(b.rule[2]), (b.rule[1] - b.rule[0]) * cw, 1.6); }
        for (const [t2, y, price, dx = 0] of b.lines) {
          const x0 = X(b.x + dx), xr = X(b.x + (b.w ?? 0.4));
          g.fillStyle = '#ebe3cc'; g.textAlign = 'left'; T.fitText(g, t2, x0, Y(y), (price ? (xr - x0) * 0.62 : (xr - x0) * 0.95), 0.036 * ch, FN.hand, 600);
          if (price) { g.textAlign = 'right'; g.fillStyle = '#f1e9c8'; g.font = `600 ${0.036 * ch}px ${FN.hand}`; g.fillText(`${price}円`, xr, Y(y)); g.textAlign = 'left'; g.fillStyle = 'rgba(235,227,204,.45)'; for (let dxp = x0 + (xr - x0) * 0.64; dxp < xr - 0.17 * cw; dxp += 3.4) g.fillRect(dxp, Y(y) + 3, 1.1, 1.1); }
        }
      }
    });
  };
  const menuA = chalkBoard('menuA', MENU_LEFT), menuB = chalkBoard('menuB', MENU_RIGHT);
  const posterTex = tex('poster', 192, 256, (g, w, h) => {
    g.fillStyle = '#d9a860'; g.fillRect(0, 0, w, h); g.fillStyle = '#f2e6c4'; g.fillRect(9, 9, w - 18, h - 18);
    g.strokeStyle = '#7a4a2a'; g.lineWidth = 1.5; g.strokeRect(15, 15, w - 30, h - 30);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#b2412c'; T.fitText(g, 'KESENNUMA', w / 2, 38, w - 40, 31, FN.serif, 900);
    g.fillStyle = '#3a5f8a'; T.fitText(g, 'WATER FRONT', w / 2, 66, w - 56, 17, FN.en, 800);
    g.fillStyle = '#4b3a2c'; T.fitText(g, 'TO ALL WHO COME TO', w / 2, 92, w - 44, 14, FN.serif, 800); T.fitText(g, 'THIS HAPPY PLACE', w / 2, 110, w - 44, 14, FN.serif, 800); T.fitText(g, 'WELCOME', w / 2, 134, w - 36, 28, FN.serif, 900);
    g.fillStyle = '#5b86b0'; g.beginPath(); g.moveTo(46, 160); g.quadraticCurveTo(96, 140, 148, 162); g.quadraticCurveTo(100, 178, 46, 160); g.fill(); g.beginPath(); g.moveTo(146, 162); g.lineTo(164, 148); g.lineTo(162, 174); g.fill();
    g.fillStyle = '#3a5f8a'; T.fitText(g, 'Lander Blue', w / 2, 192, w - 44, 19, FN.serif, 700); g.fillStyle = '#4b3a2c'; T.fitText(g, 'café RST', w / 2, 218, w - 60, 21, FN.serif, 900);
    g.fillStyle = '#b2412c'; T.fitText(g, 'reset and restart', w / 2, 236, w - 70, 10, FN.hand, 600);
  });
  const letterTex = tex('beamletters', 384, 52, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.fillStyle = '#d8c58c'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = `900 40px ${FN.serif}`;
    let x = 14; for (const ch of 'CAFE RST') { g.fillText(ch, x, h / 2 + 2); x += ch === ' ' ? 26 : 44; }
  });
  const plaqueTex = tex('plaque', 192, 48, (g, w, h) => {
    g.fillStyle = '#2f2c36'; g.fillRect(0, 0, w, h); g.strokeStyle = '#b9904a'; g.lineWidth = 2; g.strokeRect(2, 2, w - 4, h - 4);
    g.fillStyle = '#f0e2b4'; g.textAlign = 'center'; g.textBaseline = 'middle'; T.fitText(g, CAFE_RST_CREDIT.ja, w / 2, 17, w - 24, 20, FN.sans, 800); g.fillStyle = '#c9b88a'; T.fitText(g, CAFE_RST_CREDIT.en, w / 2, 37, w - 20, 10, FN.en, 600);
  });
  const sackTex = tex('sack', 96, 128, (g, w, h) => {   // a burlap sack as the counter front shows it: a red diamond with US, MANDHELING in green, five stars, PRODUCT OF INDONESIA, YOKOHAMA, NETT 10 KGS (all read from the video)
    const r = rng('sack'); g.fillStyle = '#a89c6a'; g.fillRect(0, 0, w, h); for (let i = 0; i < 170; i++) { g.fillStyle = r() < 0.5 ? 'rgba(96,84,48,.28)' : 'rgba(214,200,148,.28)'; g.fillRect(r() * w, r() * h, 6 + r() * 10, 1.5); }
    g.strokeStyle = '#a3332e'; g.lineWidth = 2; g.beginPath(); g.moveTo(w / 2, 14); g.lineTo(w / 2 + 17, 32); g.lineTo(w / 2, 50); g.lineTo(w / 2 - 17, 32); g.closePath(); g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#a3332e'; T.fitText(g, 'US', w / 2, 32, 20, 13, FN.en, 900);
    g.fillStyle = '#3d7a46'; T.fitText(g, 'MANDHELING', w / 2, 62, w - 12, 12, FN.en, 900); T.fitText(g, '★★★★★', w / 2, 76, w - 22, 12, FN.en, 700);
    T.fitText(g, 'PRODUCT OF INDONESIA', w / 2, 90, w - 8, 7, FN.en, 800); T.fitText(g, 'YOKOHAMA', w / 2, 100, w - 28, 8, FN.en, 800); T.fitText(g, 'NETT 10 KGS', w / 2, 111, w - 26, 8, FN.en, 800);
  });
  const matTex = tex('mat', 160, 104, (g, w, h) => {
    g.fillStyle = '#34323a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#e8dcc0'; g.lineWidth = 3; g.beginPath(); g.arc(w / 2, h / 2, 40, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#e8dcc0'; g.textAlign = 'center'; g.textBaseline = 'middle'; T.fitText(g, 'WELCOME', w / 2, h / 2, 62, 11, FN.en, 900); T.fitText(g, 'café RST', w / 2, h / 2 + 14, 54, 9, FN.serif, 700);
  });
  const paper = (key, a, b) => tex(key, 64, 88, (g, w, h) => {
    g.fillStyle = a; g.fillRect(0, 0, w, h); g.fillStyle = b; g.fillRect(0, 0, w, 24); g.fillStyle = 'rgba(40,40,60,.35)'; for (let i = 0; i < 8; i++) g.fillRect(6, 32 + i * 6.5, w - 12 - (i % 3) * 8, 2);
    g.fillStyle = b; g.beginPath(); g.arc(w / 2, 14, 8, 0, Math.PI * 2); g.fill();
  });
  const stickerTex = tex('stickers', 96, 140, (g, w, h) => {
    const r = rng('stickers'); g.fillStyle = '#2d2b33'; g.fillRect(0, 0, w, h); const cols = ['#e5483c', '#f2b630', '#3f8fd0', '#58b86a', '#f0ece0', '#c455a8'];
    for (let i = 0; i < 46; i++) { g.fillStyle = cols[Math.floor(r() * cols.length)]; const s = 8 + r() * 14; if (r() < 0.5) { g.beginPath(); g.arc(r() * w, r() * h, s / 2, 0, Math.PI * 2); g.fill(); } else g.fillRect(r() * (w - s), r() * (h - s), s, s * (0.6 + r() * 0.5)); }
  });
  const printTex = tex('print', 288, 128, (g, w, h) => {
    const r = rng('print');
    for (let k = 0; k < 3; k++) {
      const x0 = k * (w / 3) + 3, pw = w / 3 - 6; const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#3d6e8c'); gr.addColorStop(0.45, '#5f8fa6'); gr.addColorStop(0.46, '#2a6f9a'); gr.addColorStop(1, '#1d4f7a');
      g.fillStyle = gr; g.fillRect(x0, 4, pw, h - 8); g.fillStyle = 'rgba(210,225,230,.55)'; g.beginPath(); g.moveTo(x0, h * 0.45); for (let i = 0; i <= 6; i++) g.lineTo(x0 + pw * i / 6, h * 0.36 - (i % 2) * 12 - r() * 8); g.lineTo(x0 + pw, h * 0.45); g.fill();
      for (let i = 0; i < 7; i++) { g.fillStyle = ['#f2c230', '#e8863a', '#e8e0c8', '#3fb6c4'][Math.floor(r() * 4)]; const fx = x0 + 6 + r() * (pw - 22), fy = h * 0.55 + r() * h * 0.35; g.beginPath(); g.ellipse(fx, fy, 6 + r() * 4, 3 + r() * 2, 0, 0, Math.PI * 2); g.fill(); }
    }
    g.fillStyle = '#1b1b20'; g.fillRect(0, 0, 3, h); g.fillRect(w - 3, 0, 3, h); g.fillRect(0, 0, w, 3); g.fillRect(0, h - 3, w, 3);
  });
  const sharkPicTex = tex('sharkpic', 112, 140, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#6aa0c8'); gr.addColorStop(1, '#16406a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d7dde2'; g.beginPath(); g.moveTo(14, 84); g.bezierCurveTo(36, 56, 76, 52, 100, 74); g.bezierCurveTo(84, 98, 44, 104, 14, 84); g.fill(); g.fillStyle = '#9aa6b0'; g.beginPath(); g.moveTo(52, 60); g.lineTo(60, 38); g.lineTo(70, 60); g.fill();
    g.fillStyle = '#111'; g.beginPath(); g.arc(80, 72, 2.2, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#8f1d1d'; g.lineWidth = 2; g.beginPath(); g.moveTo(88, 80); g.lineTo(98, 78); g.stroke();
  });
  const routeTex = tex('route', 96, 112, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.lineWidth = 6; g.shadowColor = '#ff4f45'; g.shadowBlur = 10; g.strokeStyle = '#ff5a4f'; g.beginPath(); g.moveTo(w / 2, 8); g.lineTo(w - 10, 28); g.lineTo(w - 14, 70); g.quadraticCurveTo(w / 2, 108, 14, 70); g.lineTo(10, 28); g.closePath(); g.stroke();
    g.shadowColor = '#4ab8ff'; g.fillStyle = '#7fd0ff'; g.font = `900 34px ${FN.en}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('66', w / 2, 58);
    g.shadowColor = '#ff4f45'; g.fillStyle = '#ff8f86'; g.font = `800 11px ${FN.en}`; g.fillText('ROUTE', w / 2, 30);
  });
  const exitTex = tex('exit', 64, 64, (g, w, h) => {      // the green emergency-exit pictogram (a running figure and a door), no text
    g.fillStyle = '#12915a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#f2f6f2'; g.lineWidth = 2; g.strokeRect(2, 2, w - 4, h - 4);
    g.fillStyle = '#f2f6f2'; g.fillRect(40, 14, 14, 34); g.fillStyle = '#12915a'; g.fillRect(43, 17, 8, 28);
    g.fillStyle = '#f2f6f2'; g.beginPath(); g.arc(24, 18, 5, 0, 7); g.fill(); g.lineWidth = 5; g.strokeStyle = '#f2f6f2'; g.lineCap = 'round';
    g.beginPath(); g.moveTo(24, 24); g.lineTo(20, 38); g.moveTo(24, 26); g.lineTo(34, 30); g.moveTo(24, 26); g.lineTo(14, 30); g.moveTo(20, 38); g.lineTo(28, 50); g.moveTo(20, 38); g.lineTo(12, 48); g.stroke();
  });
  const mk = (map, o = {}) => noSnow(ctx.mat.toon('#ffffff', { map, paint: 0.01, emissive: WARM, noSnow: true, ...o }));
  const clockTex = tex('clock', 96, 96, (g, w, h) => {
    g.fillStyle = '#d9d0b8'; g.beginPath(); g.arc(w / 2, h / 2, 46, 0, 7); g.fill(); g.strokeStyle = '#7a3a2a'; g.lineWidth = 6; g.stroke();
    g.fillStyle = '#2f2c36'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 12px ${FN.serif}`; for (let i = 1; i <= 12; i++) { const a = i / 12 * Math.PI * 2 - Math.PI / 2; g.fillText(String(i), w / 2 + Math.cos(a) * 34, h / 2 + Math.sin(a) * 34); }
    g.fillRect(w / 2 - 1.5, h / 2 - 22, 3, 22); g.fillRect(w / 2, h / 2 - 1.5, 16, 3);
  });
  const collageTex = tex('collage', 256, 176, (g, w, h) => {   // the plate-and-poster wall by the rear corner: coloured cards only (the video's are brand signs: no words, no marks are drawn)
    g.fillStyle = '#6f624f'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f2f0e6'; g.fillRect(8, 8, 96, 40); g.fillStyle = '#e8892c'; g.fillRect(8, 8, 96, 7); g.fillStyle = '#2b2b30'; for (let i = 0; i < 6; i++) g.fillRect(17 + i * 14, 22, 8, 18);   // a number plate: bars, no characters
    g.fillStyle = '#e8d6a8'; g.fillRect(118, 8, 56, 92); g.fillStyle = '#c4452e'; g.fillRect(118, 8, 56, 14); g.fillStyle = '#d9a37a'; g.beginPath(); g.arc(146, 50, 14, 0, 7); g.fill(); g.fillStyle = '#3a2a1c'; g.beginPath(); g.ellipse(146, 92, 24, 22, 0, Math.PI, 0); g.fill();   // a poster of a figure
    g.fillStyle = '#f2f0e6'; g.fillRect(186, 14, 62, 34); g.fillStyle = '#c4352e'; g.beginPath(); g.ellipse(217, 31, 16, 11, 0, 0, 7); g.fill();   // a small card with a red disc
    g.save(); g.beginPath(); g.rect(186, 62, 62, 100); g.clip(); g.fillStyle = '#f2f0e6'; g.fillRect(186, 62, 62, 100); for (let i = -3; i < 9; i++) { g.fillStyle = i % 2 ? '#c4352e' : '#2f5d9a'; g.beginPath(); g.moveTo(186 + i * 14, 62); g.lineTo(186 + i * 14 + 9, 62); g.lineTo(186 + i * 14 + 9 - 36, 162); g.lineTo(186 + i * 14 - 36, 162); g.closePath(); g.fill(); } g.restore();   // a striped poster
    g.fillStyle = '#2a2a30'; g.fillRect(8, 108, 100, 58); g.fillStyle = '#d9d2c0'; g.fillRect(20, 124, 76, 3); g.fillRect(20, 134, 52, 3); g.fillStyle = '#c4352e'; g.fillRect(20, 146, 68, 4);   // a dark card with rules
    g.fillStyle = '#f2d03a'; g.beginPath(); g.ellipse(176, 132, 30, 24, 0, Math.PI, 0); g.fill(); g.fillRect(146, 132, 60, 12); g.fillStyle = '#2a2a30'; g.fillRect(146, 144, 60, 5);   // a yellow cap
  });

  // ================================================================================================== the shell
  const xs0 = seX(Y0), xs1 = seX(Y1), quad = [[X0, Y0], [xs0, Y0], [xs1, Y1], [X0, Y1]];
  const plasterM = tone('#f2eee4', 0.02), lining = tone('#4c3c32', 0.03), liteM = tone('#e3dccb', 0.02);
  F.mesh(polyGeo(quad, 0, true, 1.2), floorM, 0, FY, 0);
  F.mesh(polyGeo(quad, H, false, 0.8), deckM, 0, FY, 0);
  F.floor(P, (X0 + xs0) / 2, -(Y0 + Y1) / 2, xs0 - X0, Y1 - Y0, FY);                                         // the floor, to the SE wall at the street end
  { const [cx, cz] = F.w((xs0 + xs1) / 2 + 0.03, -(Y0 + Y1) / 2); P.addWalkBox(cx, cz, (xs1 - xs0) + 0.1, Y1 - Y0, THETA, FY, FY - 0.5); }   // and the wedge the leaning SE wall opens at the rear
  // walls: the NW wall (boards), the rear wall (white plaster with the noren doorway, boards from x 3.5), the SE end (plaster, leaning)
  const RW = { d0: 1.45, d1: 2.65, dh: 2.3, white: 3.5 };
  F.mesh(wallGeo([X0, Y0], [X0, Y1], 0, H, X0 + 1, 3, 1), cladM, 0, FY, 0);
  F.mesh(wallGeo([RW.d0, Y1], [X0, Y1], 0, H, 4, Y1 - 1, 1), plasterM, 0, FY, 0); F.mesh(wallGeo([RW.d1, Y1], [RW.d0, Y1], RW.dh, H, 4, Y1 - 1, 1), plasterM, 0, FY, 0); F.mesh(wallGeo([RW.white, Y1], [RW.d1, Y1], 0, H, 4, Y1 - 1, 1), plasterM, 0, FY, 0);
  F.mesh(wallGeo([xs1, Y1], [RW.white, Y1], 0, H, 4, Y1 - 1, 1), cladM, 0, FY, 0);
  F.mesh(wallGeo([xs0, Y0], [xs1, Y1], 0, H, X0 + 1, 3, 1), liteM, 0, FY, 0);
  // the street wall's lining: boxes around the openings (door, take-away window, the bay), frames and the panes
  { const piece = (a, b, c, d, mat) => { if (b - a > 0.01 && d - c > 0.01) boxAt(a, b, Y0 - 0.07, Y0, c, d, mat); };
    let cx = X0;
    for (const o of OPENINGS) {
      piece(cx, o.x0, 0, H, lining); piece(o.x0, o.x1, 0, o.z0, lining); piece(o.x0, o.x1, o.z1, H, o.kind === 'door' ? lining : liteM);
      cx = o.x1;
      if (o.kind === 'window') {
        boxAt(o.x0 - 0.03, o.x1 + 0.03, Y0 - 0.1, Y0 + 0.02, o.z1 - 0.04, o.z1 + 0.02, M.alu); boxAt(o.x0 - 0.03, o.x1 + 0.03, Y0 - 0.1, Y0 + 0.02, o.z0 - 0.02, o.z0 + 0.04, M.alu);
        for (const x of [o.x0, o.x1]) boxAt(x - 0.04, x + 0.04, Y0 - 0.106, Y0 + 0.026, o.z0 + 0.02, o.z1 - 0.02, M.alu);   // the jambs stand a few mm proud of the head and sill: no coplanar faces at the corners
        boxAt(o.x0 + 0.02, o.x1 - 0.02, Y0 - 0.02, Y0, o.z0 + 0.04, o.z1 - 0.04, M.glass);
      }
    }
    piece(cx, xs0 + 0.05, 0, H, lining);
  }
  // colliders of the shell. The harbor's wall colliders follow GSI's outline of 迎, 0.15-1.2 m off the surveyed face (they stood 0.5 m in front of the door): the two pieces of the
  // street face and of the SE end are taken out and the room closes the building with its own walls, on the surveyed plane: the street wall with the door gap and a lintel, a
  // piece from the face's NW end to GSI's corner, the NW wall, the rear wall (the noren doorway stays shut: the passage behind it is not walkable), the SE end (leaning).
  { const G = SITES.mukaeru.poly, mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], isHall = (it) => it.type === 'box' && it.y0 === -5 && it.y1 === 40 && it.hw === 0.25;
    for (const [a, b] of [[G[0], G[1]], [G[4], G[0]]]) { const [mx, mz] = mid(a, b); P.removeNear(mx, mz, 1.2, isHall); }
    const [gx, gz] = G[1], dx = gx - FRONT.P1[0], dz = gz - FRONT.P1[1], len = Math.hypot(dx, dz);
    let nx = dz / len, nz = -dx / len; if (nx * NIN[0] + nz * NIN[1] < 0) { nx = -nx; nz = -nz; }
    P.addBox((FRONT.P1[0] + gx) / 2 + nx * 0.25, (FRONT.P1[1] + gz) / 2 + nz * 0.25, 0.5, len, Math.atan2(dx, dz), -5, 40);
  }
  { const th = 0.5, d = DOOR;
    colBox(X0 - 0.45, d.x0, Y0 - 0.25, Y0 + 0.1, -1, H + 1); colBox(d.x1, xs0 + 0.5, Y0 - 0.25, Y0 + 0.1, -1, H + 1); colBox(d.x0, d.x1, Y0 - 0.25, Y0 + 0.1, d.z1, H + 1);
    colBox(X0 - th, X0, Y0 - th, Y1 + th, -1, H + 1); colBox(X0, xs1 + th, Y1, Y1 + th, -1, H + 1);
    const [cx, cz] = F.w((xs0 + xs1) / 2 + 0.25, -(Y0 + Y1) / 2); P.addBox(cx, cz, 0.5, Y1 - Y0 + 0.4, THETA - 0.1107, FY - 1, FY + H + 1);
  }

  // ================================================================================================== the street door, its frame, the stoop
  { const d = DOOR, ow = d.x1 - d.x0, hx = d.x0;
    boxAt(d.x0 - 0.07, d.x0 + 0.005, -0.05, Y0 + 0.03, 0, d.z1 + 0.064, M.post); boxAt(d.x1 - 0.005, d.x1 + 0.07, -0.05, Y0 + 0.03, 0, d.z1 + 0.064, M.post);   // jambs (a few mm into the opening, 3 cm proud of the lining: nothing coplanar)
    boxAt(d.x0 - 0.075, d.x1 + 0.075, -0.055, Y0 + 0.035, d.z1 - 0.004, d.z1 + 0.07, M.post);                                                       // head
    // the leaf, swung out 80 deg on its NW hinge: dark timber and a long steel pull
    const a = 80 * D2R, lx = hx + 0.025, leaf = new THREE.Group(); leaf.position.set(lx, FY, 0); leaf.rotation.y = a; F.g.add(leaf);
    const part = (w, h, dd, mat, x, y, z) => { const m = new THREE.Mesh(ctx.geo.G.box(), mat); m.scale.set(w, h, dd); m.position.set(x, y, z); m.castShadow = false; m.receiveShadow = false; leaf.add(m); return m; };
    part(ow - 0.05, d.z1 - 0.04, 0.045, M.doorW, (ow - 0.05) / 2, (d.z1 - 0.04) / 2, 0); part(0.03, 0.62, 0.03, M.steelL, ow - 0.17, 1.05, -0.04); part(0.03, 0.62, 0.03, M.steelL, ow - 0.17, 1.05, 0.04);
    F.col(P, lx + 0.12, 0.45, 0.12, 0.9, FY - 1, FY + d.z1); note('door-leaf', lx, lx + 0.2, -0.9, 0, 0, d.z1, true);
    // the stoop: the pavement (about T.P. 2.28 at the door) up to the floor in two risers
    const cc = tone('#c9c6bc', 0.07, { noSnow: false }), dcx = (d.x0 + d.x1) / 2;   // (outdoors: the stoop takes the winter snow)
    boxAt(d.x0 - 0.12, d.x1 + 0.12, -0.55, 0.02, -0.5, 0, cc); boxAt(d.x0 - 0.12, d.x1 + 0.12, -1.0, -0.55, -0.5, -0.17, cc);
    { const [cx, cz] = F.w(dcx, 0.27); P.addWalkBox(cx, cz, ow + 0.24, 0.55, THETA, FY, FY - 0.6); const [bx, bz] = F.w(dcx, 0.78); P.addWalkBox(bx, bz, ow + 0.24, 0.45, THETA, FY - 0.17, FY - 0.6); }
    pln(0.7, 0.46, mk(matTex), dcx, 0.5, 0.012, 0, 1, -Math.PI / 2);                                       // the WELCOME mat inside the door
    pln(0.26, 0.26, ctx.mat.emissive('#ffffff', 1.0, { map: exitTex }), dcx - 0.35, Y0 + 0.006, 2.46, 0, 1);   // the exit sign over the door, inside
  }

  // ================================================================================================== the NW wall: back-bar, counter, neon, menus, clock, beam, soffit
  const BB = { x1: 0.66, y0: Y0 + 0.02, y1: 5.2, top: 0.9 }, CT = { x0: 1.35, x1: 1.95, y0: Y0 + 0.02, y1: 5.2, top: 1.0 };
  { // the back-bar: cabinets, a walnut worktop, the grey-tile splash, the wire-mesh shelf with glasses
    boxAt(X0, BB.x1, BB.y0, BB.y1, 0, BB.top - 0.05, M.greigeD); boxAt(X0, BB.x1 + 0.05, BB.y0, BB.y1, BB.top - 0.05, BB.top, M.walnut);
    pln(BB.y1 - BB.y0, 0.4, M.tile, X0 + 0.006, (BB.y0 + BB.y1) / 2, BB.top + 0.2, 1, 0);
    for (const z of [1.3, 1.64]) boxAt(X0, X0 + 0.26, 1.6, 3.85, z, z + 0.03, M.steel);                         // the shelves under the neon
    const r = rng('glasses'); for (const z of [1.3, 1.64]) for (let y = 1.7; y < 3.8; y += 0.1 + r() * 0.06) { const h = 0.1 + r() * 0.06; if (z < 1.5 && y > 2.95) continue; cyl(0.035, h, M.glass, X0 + 0.13, y, z + 0.03 + h / 2, { seg: 6 }); }
    note('backbar', X0, BB.x1, BB.y0, BB.y1, 0, BB.top);
    // the gear, as the video shows it, street end first: the red retro fridge, the soft-serve machine, two siphon brewers in brass frames, a pour-over stand, a gooseneck kettle,
    // a black oven, white cups, the cooler by the clock and two laptops. (No espresso machine and no roaster appear in the video, so none is built.)
    boxAt(X0 + 0.04, X0 + 0.5, 0.75, 1.3, BB.top, BB.top + 0.72, M.red); boxAt(X0 + 0.42, X0 + 0.512, 0.81, 1.24, BB.top + 0.08, BB.top + 0.64, M.glass);      // the fridge and its glass door
    boxAt(X0 + 0.512, X0 + 0.532, 0.78, 0.82, BB.top + 0.12, BB.top + 0.6, M.steelL); boxAt(X0 + 0.1, X0 + 0.4, 0.88, 1.18, BB.top + 0.72, BB.top + 0.86, M.red);   // its handle, the red box on top
    { const x0 = X0 + 0.02, x1 = X0 + 0.46, ya = 1.45, yb = 1.95, yc = (ya + yb) / 2;        // the soft-serve machine: a cream body, a silver control band, a black dispensing head with four steel knobs and a nozzle, the hopper lid, the drip tray
      boxAt(x0, x1, ya, yb, BB.top, BB.top + 0.64, M.white);
      boxAt(x1 - 0.004, x1 + 0.012, ya + 0.04, yb - 0.04, BB.top + 0.5, BB.top + 0.6, M.steelL);
      boxAt(x1 - 0.004, x1 + 0.1, yc - 0.12, yc + 0.12, BB.top + 0.2, BB.top + 0.46, M.black);
      for (const [dy, dz] of [[-0.07, 0.4], [0.07, 0.4], [-0.07, 0.26], [0.07, 0.26]]) cyl(0.022, 0.02, M.steelL, x1 + 0.11, yc + dy, BB.top + dz, { rz: Math.PI / 2, seg: 8 });
      cyl(0.03, 0.09, M.steelL, x1 + 0.06, yc, BB.top + 0.15, { seg: 8 });
      boxAt(x1 - 0.1, x1 + 0.12, yc - 0.15, yc + 0.15, BB.top + 0.003, BB.top + 0.033, M.steel);
      cyl(0.17, 0.05, M.black, (x0 + x1) / 2, yc, BB.top + 0.665, { seg: 12 });
    }
    for (const y of [2.2, 2.7]) {                                                                     // two siphon brewers: a brass frame (four rods, two plates), a spirit burner, the glass flask, the tube and the upper chamber under its brass lid
      const x = X0 + 0.19;
      boxAt(x - 0.1, x + 0.1, y - 0.1, y + 0.1, BB.top + 0.002, BB.top + 0.014, M.brass); boxAt(x - 0.1, x + 0.1, y - 0.1, y + 0.1, BB.top + 0.383, BB.top + 0.395, M.brass);
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) cyl(0.007, 0.38, M.brass, x + sx * 0.085, y + sy * 0.085, BB.top + 0.198, { seg: 5 });
      cyl(0.022, 0.04, M.steel, x, y, BB.top + 0.036, { seg: 8 });
      sph(0.06, M.glassC, x, y, BB.top + 0.115, { seg: 10 }); cyl(0.01, 0.1, M.glassC, x, y, BB.top + 0.225, { seg: 6 });
      cyl(0.04, 0.13, M.glassC, x, y, BB.top + 0.29, { seg: 9 }); cyl(0.046, 0.016, M.brass, x, y, BB.top + 0.368, { seg: 9 });
    }
    { const x = X0 + 0.2, y = 3.12;                                                                     // a pour-over stand: a chrome pole on a round base, an arm with a white cone dripper over a glass server
      cyl(0.08, 0.015, M.steelL, x, y, BB.top + 0.0075, { seg: 12 }); cyl(0.01, 0.36, M.steelL, x - 0.04, y, BB.top + 0.18, { seg: 6 });
      boxAt(x - 0.05, x + 0.1, y - 0.008, y + 0.008, BB.top + 0.352, BB.top + 0.366, M.steelL);
      mesh(new THREE.ConeGeometry(0.06, 0.08, 10), M.white, x + 0.08, y, BB.top + 0.31, { rx: Math.PI });
      cyl(0.045, 0.12, M.glassC, x + 0.08, y, BB.top + 0.075, { seg: 9 });
    }
    { const x = X0 + 0.2, y = 3.45;                                                                     // a gooseneck kettle: a steel body, a lid knob, a long thin spout and a handle
      cyl(0.07, 0.11, M.steelL, x, y, BB.top + 0.055, { seg: 10 }); cyl(0.071, 0.012, M.steel, x, y, BB.top + 0.117, { seg: 10 }); sph(0.014, M.steel, x, y, BB.top + 0.14, { seg: 6 });
      box(0.012, 0.2, 0.012, M.steelL, x + 0.075, y - 0.02, BB.top + 0.16, { rx: 0.55, rz: -0.35 });
      boxAt(x - 0.1, x - 0.08, y - 0.03, y + 0.03, BB.top + 0.02, BB.top + 0.12, M.black);
    }
    { const lo = 1.33;                                                                                   // the lower shelf: a black oven with a dark window, a row of white cups
      boxAt(X0 + 0.03, X0 + 0.23, 3.02, 3.38, lo, lo + 0.19, M.black); boxAt(X0 + 0.23, X0 + 0.236, 3.06, 3.3, lo + 0.03, lo + 0.16, tone('#1a1a20', 0, { emissive: '#000000' }));
      for (let y = 3.46; y < 3.82; y += 0.09) cyl(0.04, 0.055, M.white, X0 + 0.13, y, lo + 0.0275, { seg: 9 });
    }
    boxAt(X0 + 0.06, X0 + 0.46, 4.55, 5.1, BB.top, BB.top + 0.42, tone('#4c3f9a', 0.02)); boxAt(X0 + 0.055, X0 + 0.465, 4.545, 5.105, BB.top + 0.3, BB.top + 0.43, M.white);   // the cooler by the clock (the lid stands 5 mm proud of the chest)
    for (const y of [3.78, 4.18]) { boxAt(X0 + 0.2, X0 + 0.44, y - 0.17, y + 0.17, BB.top + 0.003, BB.top + 0.018, M.steel); box(0.012, 0.22, 0.34, M.black, X0 + 0.213, y, BB.top + 0.13, { rz: -0.26 }); }   // laptops, open
    pln(0.42, 0.42, mk(clockTex), X0 + 0.015, 5.5, 1.78, 1, 0);                                               // the wall clock past the neon's end (the video: right of the neon, over the cooler)
  }
  { // the counter: body, front boards, the glossy walnut top, steel posts, a rebar foot rail
    boxAt(CT.x0, CT.x1, CT.y0, CT.y1, 0.05, CT.top - 0.05, M.greige); boxAt(CT.x0 - 0.04, CT.x1 + 0.08, CT.y0, CT.y1, CT.top - 0.05, CT.top, M.walnut); boxAt(CT.x0, CT.x1, CT.y0, CT.y1, 0, 0.05, M.black);
    for (const y of [0.45, 2.2, 3.55, 4.95]) boxAt(CT.x1 - 0.005, CT.x1 + 0.05, y - 0.03, y + 0.03, 0.05, CT.top - 0.05, M.steel);
    boxAt(CT.x1 + 0.12, CT.x1 + 0.14, CT.y0, CT.y1, 0.27, 0.29, M.steel);
    solid('counter', CT.x0 - 0.04, CT.x1 + 0.08, CT.y0, CT.y1, 0, CT.top); solid('backbar-col', X0, BB.x1, BB.y0, BB.y1, 0, 1.2, { col: false });
    for (const y of [1.15, 2.6, 3.3, 4.0, 4.7]) pln(0.42, 0.58, mk(sackTex, { side: 'double' }), CT.x1 + 0.014, y, 0.4, 1, 0);   // coffee sacks hung on the front boards (the video's counter front: sacks, no sign)
  }
  { pln(2.5, 0.78, neonM, X0 + 0.02, 4.0, 2.02, 1, 0);                                                         // the neon (y 2.75-5.25: from the panorama's bearings, sigma 0.6)
    pln(0.55, 0.55 * menuA.image.height / menuA.image.width, mk(menuA), X0 + 0.015, 0.66, 1.95, 1, 0); pln(0.55, 0.55 * menuB.image.height / menuB.image.width, mk(menuB), X0 + 0.015, 1.24, 1.95, 1, 0);   // the two chalkboard menus by the take-away window
    boxAt(X0, 1.88, Y0, 5.2, 2.4, 2.44, M.white); boxAt(1.86, 1.9, Y0 + 0.005, 5.195, 2.395, 2.6, M.white);              // the white soffit and its front face
    boxAt(1.9, 2.15, Y0, Y1, 2.55, H, M.steel);                                                               // the steel beam over the counter front
    pln(1.3, 0.19, mk(letterTex, { transparent: true }), 2.152, 4.1, 2.77, 1, 0);                              // its gold letters (about 1.1 m wide in the video)
  }
  { // soft-serve cone statue at the door end of the counter, the bar stools (five, a 0.7 m pitch)
    const wafer = tone('#e9b53a', 0.03), cream = tone('#f6f3ea', 0.02), cxs = 2.3, cys = 1.55;
    cyl(0.17, 0.05, M.black, cxs, cys, 0.025, { seg: 10 }); mesh(new THREE.CylinderGeometry(0.2, 0.04, 0.52, 10), wafer, cxs, cys, 0.31); for (const [r, z] of [[0.21, 0.6], [0.17, 0.76], [0.12, 0.9]]) sph(r, cream, cxs, cys, z + 0.12, { seg: 9, scale: [r * 2, r * 1.5, r * 2] });
    mesh(new THREE.ConeGeometry(0.06, 0.14, 7), cream, cxs, cys, 1.12); note('cone', cxs - 0.22, cxs + 0.22, cys - 0.22, cys + 0.22, 0, 1.2, true); colCyl(cxs, cys, 0.22, 0, 1.2);
    const stool = (x, y) => {
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) boxAt(x + sx * 0.16 - 0.014, x + sx * 0.16 + 0.014, y + sy * 0.14 - 0.014, y + sy * 0.14 + 0.014, 0, 0.7, M.black);
      for (const sy of [-1, 1]) boxAt(x - 0.17, x + 0.17, y + sy * 0.14 - 0.01, y + sy * 0.14 + 0.01, 0.26, 0.28, M.black);
      boxAt(x - 0.19, x + 0.19, y - 0.17, y + 0.17, 0.7, 0.745, M.chair);
      for (const sy of [-1, 1]) boxAt(x + 0.17, x + 0.19, y + sy * 0.15 - 0.012, y + sy * 0.15 + 0.012, 0.745, 1.02, M.black);
      boxAt(x + 0.16, x + 0.2, y - 0.17, y + 0.17, 0.82, 1.0, M.chair);
      solid('stool', x - 0.22, x + 0.22, y - 0.2, y + 0.2, 0, 0.75, { round: 0.2 });
    };
    for (const y of [2.0, 2.55, 3.2, 3.9, 4.7]) stool(2.35, y);   // 0.32 m from the counter's edge: elbows reach the top
  }

  // ================================================================================================== the rear wall: the noren doorway, the framed print, the collage and the poster, the motorcycle behind its rope, the plants
  { const dk = tone('#4a4036', 0.02), fl = tone('#6b5a48', 0.03), rd = 1.1, yc = Y1;
    // the dark passage behind the noren (planes facing in)
    pln(RW.d1 - RW.d0, RW.dh, dk, (RW.d0 + RW.d1) / 2, yc + rd, RW.dh / 2, 0, -1); pln(rd, RW.dh, dk, RW.d0, yc + rd / 2, RW.dh / 2, 1, 0); pln(rd, RW.dh, dk, RW.d1, yc + rd / 2, RW.dh / 2, -1, 0);
    pln(RW.d1 - RW.d0, rd, fl, (RW.d0 + RW.d1) / 2, yc + rd / 2, 0.005, 0, 0, -Math.PI / 2); pln(RW.d1 - RW.d0, rd, dk, (RW.d0 + RW.d1) / 2, yc + rd / 2, RW.dh - 0.005, 0, 0, Math.PI / 2);
    const noren = tone('#cdbb92', 0.05, { side: 'double' });
    for (let k = 0; k < 3; k++) F.plane(0.385, 1.7, noren, (RW.d0 + 0.2 + k * 0.4), FY + 1.45, -(yc - 0.04), 0, 0);                                       // three panels hung from the rod
    boxAt(RW.d0, RW.d1, yc - 0.06, yc - 0.02, RW.dh - 0.04, RW.dh, M.steel); note('noren', RW.d0, RW.d1, yc - 0.1, yc, 0, RW.dh, false);
  }
  const yR = Y1 - 0.03;
  { boxAt(3.7, 5.4, yR - 0.02, yR + 0.02, 1.46, 2.34, M.black); pln(1.58, 0.8, mk(printTex), 4.55, yR - 0.022, 1.9, 0, -1);
    pln(1.1, 0.77, mk(collageTex), 6.0, yR - 0.012, 1.65, 0, -1); pln(0.64, 0.82, mk(posterTex), 7.0, yR - 0.012, 1.95, 0, -1);
  }
  { // the motorcycle (a sport bike in a white / blue / red livery, nose to the NW), parked at the rear wall behind rope stanchions
    const bk = new THREE.Group(); bk.position.set(4.5, FY, -5.5); bk.rotation.y = Math.PI; F.g.add(bk);   // local +x of the group points to -x_r (the nose to the NW)
    const part = (w, h, d, mat, x, y, z, rz = 0) => { const m = new THREE.Mesh(ctx.geo.G.box(), mat); m.scale.set(w, h, d); m.position.set(x, y, z); m.rotation.z = rz; m.castShadow = false; m.receiveShadow = false; bk.add(m); return m; };
    const wheel = (x) => { const t2 = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.13, 14), M.black); t2.rotation.x = Math.PI / 2; t2.position.set(x, 0.31, 0); bk.add(t2); const r2 = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.15, 12), M.steelL); r2.rotation.x = Math.PI / 2; r2.position.set(x, 0.31, 0); bk.add(r2); };
    const bw = tone('#f3f2ee', 0.02), bb = tone('#26468a', 0.02), br = tone('#c2312b', 0.02);
    wheel(0.68); wheel(-0.7);
    part(0.05, 0.7, 0.05, M.steelL, 0.58, 0.62, 0.11, 0.34); part(0.05, 0.7, 0.05, M.steelL, 0.58, 0.62, -0.11, 0.34);
    part(0.46, 0.34, 0.5, bw, 0.4, 0.85, 0); part(0.4, 0.2, 0.46, bb, 0.5, 0.98, 0); part(0.06, 0.36, 0.42, tone('#bcd8e6', 0.01), 0.62, 1.02, 0, -0.5);
    part(0.9, 0.34, 0.5, bw, 0.02, 0.42, 0); part(0.9, 0.12, 0.505, bb, 0.0, 0.34, 0); part(0.9, 0.05, 0.508, br, 0.0, 0.27, 0);
    part(0.5, 0.22, 0.34, bw, -0.08, 0.86, 0); part(0.5, 0.05, 0.345, bb, -0.08, 0.93, 0); part(0.56, 0.08, 0.3, M.black, -0.5, 0.86, 0); part(0.52, 0.16, 0.2, bw, -0.82, 0.9, 0); part(0.5, 0.04, 0.205, br, -0.82, 0.83, 0);
    part(0.42, 0.28, 0.3, M.steel, -0.02, 0.5, 0); part(0.78, 0.06, 0.2, M.steelL, -0.38, 0.33, 0, 0.04); part(0.7, 0.07, 0.07, M.steelL, -0.62, 0.42, 0.2, 0.1); part(0.03, 0.03, 0.62, M.steelL, 0.44, 1.04, 0);
    note('motorcycle', 3.5, 5.5, 5.2, 5.8, 0, 1.2, true); colBox(3.5, 5.5, 5.2, 5.8, 0, 1.2);
    for (const [x, y] of [[3.35, 4.95], [5.65, 4.95]]) { cyl(0.11, 0.02, M.steelL, x, y, 0.01, { seg: 8 }); cyl(0.025, 0.9, M.steelL, x, y, 0.47, { seg: 6 }); sph(0.04, M.steelL, x, y, 0.93, { seg: 6 }); colCyl(x, y, 0.14, 0, 0.9); }
    boxAt(3.38, 5.62, 4.93, 4.97, 0.78, 0.82, M.red);
  }
  { // two dracaena in pots: the big one stands out in front of the bike, a smaller one by the SE end of the rear wall
    // a dracaena's blade: a lanceolate ribbon of unit length that rises from the stem and bends over under its own weight (the angle falls along the blade), folded along the midrib;
    // three variants (upright, arching, drooping) shared by every leaf, each leaf scaled and turned about the stem
    const bladeGeo = (e0, bend, w) => {
      const N = 7, pos = [], idx = [];
      let y = 0, z = 0;
      for (let j = 0; j <= N; j++) {
        const s = j / N, ang = e0 - bend * s, wd = w * Math.pow(Math.sin(Math.PI * Math.pow(s, 0.72)), 0.85) + 0.004;
        if (j > 0) { const dl = 1 / N; y += Math.sin(ang) * dl; z += Math.cos(ang) * dl; }
        pos.push(-wd / 2, y + wd * 0.12, z, 0, y, z, wd / 2, y + wd * 0.12, z);            // left edge, midrib (lower: a V fold), right edge
        if (j > 0) { const i = j * 3, k = (j - 1) * 3; idx.push(k, i, i + 1, k, i + 1, k + 1, k + 1, i + 1, i + 2, k + 1, i + 2, k + 2); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
    };
    const blades = [bladeGeo(1.15, 1.5, 0.15), bladeGeo(0.7, 1.7, 0.17), bladeGeo(0.25, 1.3, 0.16)];
    const plant = (x, y, hStem, nLeaf, seed, scale) => {
      const r = rng('plant' + seed); cyl(0.2 * scale, 0.4 * scale, M.pot, x, y, 0.2 * scale, { seg: 9 }); cyl(0.19 * scale, 0.02, tone('#4a3a2a', 0.04), x, y, 0.4 * scale, { seg: 9 }); cyl(0.022, hStem, tone('#6a5a3a', 0.04), x, y, 0.4 * scale + hStem / 2, { seg: 5 });
      for (let i = 0; i < nLeaf; i++) {
        const tier = i % 3, a = r() * Math.PI * 2, len = (0.5 + r() * 0.35 + (2 - tier) * 0.05) * scale, g2 = new THREE.Group();
        g2.position.set(x, FY + 0.4 * scale + hStem * (0.55 + 0.45 * (tier / 2) * 0.5 + r() * 0.3), -y); g2.rotation.set(0, a, 0);
        const m = new THREE.Mesh(blades[tier === 0 ? 0 : tier === 1 ? 1 : 2], r() < 0.55 ? M.leaf : M.leafD); m.scale.set(len, len, len); m.castShadow = false; m.receiveShadow = false; g2.add(m); F.g.add(g2);
      }
      solid('plant', x - 0.28 * scale, x + 0.28 * scale, y - 0.28 * scale, y + 0.28 * scale, 0, 0.9, { round: 0.22 * scale });
    };
    plant(4.2, 4.2, 0.85, 33, 'a', 1.15); plant(6.55, 5.45, 1.0, 24, 'b', 1.0);
  }

  // ================================================================================================== the dining end: two tables pushed together, bentwood Y-chairs
  const grp = (x, y, phi) => { const g = new THREE.Group(); g.position.set(x, FY, -y); g.rotation.y = phi; F.g.add(g); return g; };
  const gpart = (g, w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(ctx.geo.G.box(), mat); m.scale.set(w, h, d); m.position.set(x, y, z); m.castShadow = false; m.receiveShadow = false; g.add(m); return m; };
  const chair = (x, y, phi) => {                       // phi: the direction the sitter faces (room angle from +x_r toward +y_r); local +x = forward
    const g = grp(x, y, phi);
    gpart(g, 0.42, 0.04, 0.42, M.chair, 0, 0.45, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) gpart(g, 0.035, 0.43, 0.035, M.chair, sx * 0.175, 0.215, sz * 0.175);
    gpart(g, 0.04, 0.06, 0.42, M.chair, -0.19, 0.84, 0); for (const sz of [-1, 1]) gpart(g, 0.03, 0.4, 0.03, M.chair, -0.19, 0.64, sz * 0.19); gpart(g, 0.025, 0.34, 0.06, M.chair, -0.19, 0.66, 0);
    note('chair', x - 0.26, x + 0.26, y - 0.26, y + 0.26, 0, 0.9, true); colCyl(x, y, 0.22, 0, 0.9);
  };
  const table = (x0, x1, y0, y1) => {
    boxAt(x0, x1, y0, y1, 0.69, 0.73, M.tableTop);
    for (let x = x0 + 0.4; x < x1; x += 0.8) { cyl(0.035, 0.66, M.black, x, (y0 + y1) / 2, 0.36, { seg: 8 }); boxAt(x - 0.27, x + 0.27, (y0 + y1) / 2 - 0.04, (y0 + y1) / 2 + 0.04, 0, 0.03, M.black); boxAt(x - 0.04, x + 0.04, (y0 + y1) / 2 - 0.27, (y0 + y1) / 2 + 0.27, 0, 0.034, M.black); }
    solid('table', x0, x1, y0, y1, 0, 0.73);
  };
  table(4.7, 6.3, 3.9, 4.7); chair(5.0, 3.55, Math.PI / 2); chair(5.9, 3.55, Math.PI / 2); chair(6.0, 4.95, -Math.PI / 2);   // (0.35 m from the rope stanchion at 5.65)
  { cyl(0.05, 0.05, tone('#f1a39a', 0.02), 4.95, 4.2, 0.76, { seg: 8 }); cyl(0.05, 0.05, tone('#f3efe6', 0.02), 5.9, 4.4, 0.755, { seg: 8 }); }

  // ================================================================================================== the street windows: mullions, the two window counters and the stools, the shelf of helmets and plush sharks
  { const bay = OPENINGS.find((o) => o.id === 'bay'), z0 = bay.z0, z1 = bay.z1;
    for (const x of [4.2, 4.8, 6.05, 7.1]) boxAt(x - 0.025, x + 0.025, Y0 - 0.08, Y0 + 0.014, z0 + 0.03, z1 - 0.03, M.alu);
    boxAt(bay.x0 + 0.06, bay.x1 - 0.06, Y0 - 0.04, Y0 + 0.017, 2.14, 2.18, M.alu);
    boxAt(bay.x0, bay.x0 + 0.06, Y0 - 0.08, Y0 + 0.012, z0 + 0.03, z1 - 0.03, M.post); boxAt(bay.x1 - 0.06, bay.x1, Y0 - 0.08, Y0 + 0.012, z0 + 0.03, z1 - 0.03, M.post);        // the dark timber posts at the ends of the glazing
    const counter = (x0, x1, id) => { boxAt(x0, x1, Y0, 0.66, 0.82, 0.86, M.pale); for (const x of [x0 + 0.1, x1 - 0.1]) boxAt(x - 0.02, x + 0.02, Y0, 0.64, 0.5, 0.82, M.steel); solid(id, x0, x1, Y0, 0.66, 0, 0.86); };
    counter(3.25, 5.0, 'window-counter'); counter(6.6, 9.0, 'window-counter-se');
    const stoolAt = (x, y) => { for (const sx of [-1, 1]) for (const sy of [-1, 1]) boxAt(x + sx * 0.16 - 0.014, x + sx * 0.16 + 0.014, y + sy * 0.14 - 0.014, y + sy * 0.14 + 0.014, 0, 0.62, M.black); boxAt(x - 0.19, x + 0.19, y - 0.17, y + 0.17, 0.62, 0.665, M.chair); solid('stool', x - 0.22, x + 0.22, y - 0.2, y + 0.2, 0, 0.67, { round: 0.2 }); };
    stoolAt(3.85, 1.05); stoolAt(4.55, 1.05);
    boxAt(3.5, 3.95, 0.34, 0.38, 0.86, 1.18, M.black); pln(0.4, 0.28, mk(printTex), 3.72, 0.35, 1.02, 0, 1);      // a framed picture on the counter
    pln(0.3, 0.075, mk(plaqueTex), 3.45, 0.5, 0.98, -0.5, 0.9, -0.5);                                           // the credit plaque stands on the window counter by the door
    // the helmet-and-plush shelf hung from the deck on black rods above the glazing
    boxAt(3.0, 9.0, Y0 + 0.01, 0.62, 2.12, 2.17, M.walnut); for (const x of [3.05, 4.9, 6.2, 7.7, 8.95]) boxAt(x - 0.01, x + 0.01, 0.54, 0.56, 2.17, H, M.black);
    const helmet = (x, y, c) => { sph(0.145, tone(c, 0.02), x, y, 2.31, { seg: 9, scale: [0.3, 0.27, 0.32] }); boxAt(x + 0.07, x + 0.15, y - 0.09, y + 0.09, 2.27, 2.36, M.black); };
    helmet(3.4, 0.4, '#b4b8bc'); helmet(3.78, 0.4, '#3d3f46'); helmet(4.3, 0.4, '#a22f2f'); helmet(5.2, 0.4, '#c9a52a'); helmet(5.6, 0.4, '#3d3f46');
    const plush = (x, y, c) => { const mt = tone(c, 0.04); sph(0.1, mt, x, y, 2.26, { seg: 8, scale: [0.46, 0.2, 0.22] }); sph(0.1, tone('#e9e9e4', 0.04), x, y, 2.235, { seg: 8, scale: [0.4, 0.14, 0.2] }); mesh(new THREE.ConeGeometry(0.06, 0.16, 5), mt, x - 0.02, y, 2.4); mesh(new THREE.ConeGeometry(0.06, 0.16, 5), mt, x - 0.24, y, 2.28, { rz: Math.PI / 2 }); boxAt(x + 0.17, x + 0.2, y - 0.03, y + 0.03, 2.25, 2.28, M.black); };
    plush(6.5, 0.38, '#8d8f98'); plush(7.1, 0.36, '#7f8aa0'); plush(7.7, 0.4, '#8d8f98'); plush(8.3, 0.38, '#7f8aa0');
    boxAt(4.65, 5.05, 0.34, 0.5, 2.17, 2.24, tone('#d8d04a', 0.03));                                             // a model car
    // papers on the glass, the shirt in the window, brochure racks on the SE counter, the route sign hung in the window
    pln(0.3, 0.42, mk(paper('paperA', '#f3ecd0', '#e0a63a')), 4.0, Y0 + 0.026, 1.5, 0, 1); pln(0.3, 0.42, mk(paper('paperB', '#e9eef2', '#4a8ad0')), 5.5, Y0 + 0.026, 1.5, 0, 1); pln(0.3, 0.42, mk(paper('paperC', '#f6e3e0', '#d0585a')), 8.4, Y0 + 0.026, 1.45, 0, 1);
    boxAt(6.0, 6.45, Y0 + 0.2, Y0 + 0.22, 1.2, 1.78, tone('#f4f2ec', 0.02)); for (const s of [-1, 1]) boxAt(6.0 + (s < 0 ? -0.18 : 0.45), 6.0 + (s < 0 ? 0 : 0.63), Y0 + 0.2, Y0 + 0.22, 1.5, 1.8, tone('#f4f2ec', 0.02));
    for (const x of [7.9, 8.25]) { boxAt(x - 0.14, x + 0.14, 0.34, 0.52, 0.86, 1.36, M.steel); for (let k = 0; k < 4; k++) boxAt(x - 0.12, x + 0.12, 0.38, 0.4, 0.92 + k * 0.1, 1.0 + k * 0.1, tone(['#d9a63a', '#5a8ac0', '#d0585a', '#6aa86a'][k], 0.02)); }
    F.plane(0.38, 0.46, ctx.mat.emissive('#ffffff', 1.25, { map: routeTex, transparent: true, side: 'double', depthWrite: false }), 3.5, FY + 1.6, -0.3, 0, 0);
    boxAt(3.44, 3.56, 0.29, 0.31, 1.83, H - 0.3, M.black);
  }

  // ================================================================================================== the diagonal timber lattice
  { const LX = 7.7, ya = 1.2, yb = 3.1, za = 0, zb = 2.45, slat = tone('#6a4a34', 0.04), post = M.post;
    for (const y of [ya, yb]) boxAt(LX - 0.07, LX + 0.07, y - 0.07, y + 0.07, 0, zb + 0.1, post);
    boxAt(LX - 0.05, LX + 0.05, ya, yb, zb, zb + 0.094, post); boxAt(LX - 0.05, LX + 0.05, ya, yb, 0.08, 0.16, post);
    const seg = (c, dir) => {                           // the line z = dir * (y - c) clipped to the panel
      const pts = [];
      for (const y of [ya, yb]) { const z = dir * (y - c); if (z >= za && z <= zb) pts.push([y, z]); }
      for (const z of [za, zb]) { const y = c + z / dir; if (y >= ya && y <= yb) pts.push([y, z]); }
      if (pts.length < 2) return; pts.sort((a, b) => a[0] - b[0]); const [p, q] = [pts[0], pts[pts.length - 1]], len = Math.hypot(q[0] - p[0], q[1] - p[1]); if (len < 0.25) return;
      box(0.05, 0.06, len, slat, LX + (dir > 0 ? 0.0 : 0.04), (p[0] + q[0]) / 2, (p[1] + q[1]) / 2, { rx: Math.atan2(q[1] - p[1], q[0] - p[0]) });
    };
    for (let c = ya - zb; c <= yb; c += 0.3) seg(c, 1);
    for (let c = ya; c <= yb + zb; c += 0.6) seg(c, -1);
    solid('lattice', LX - 0.08, LX + 0.08, ya - 0.08, yb + 0.08, 0, zb + 0.1);
  }

  // ================================================================================================== the retail corner (Lander Blue / SHARKS): rail of shirts, shelves, the jaw beam, the big shark, the framed photo
  { const shelfTex = tex('goods', 256, 40, (g, w, h) => {
      const r = rng('goods'), cols = ['#c8cbd2', '#5a7a9a', '#d9b46a', '#8a6f5a', '#e5e0d2', '#4d8a8a', '#b8605a', '#2f3b55'];
      g.fillStyle = '#2b2530'; g.fillRect(0, 0, w, h);
      for (let x = 2; x < w - 8;) { const bw = 8 + r() * 16, bh = 10 + r() * 24; g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(x, h - 3 - bh, bw, bh); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x + 1, h - 3 - bh + 2, bw - 2, 2); x += bw + 2 + r() * 4; }
    });
    // shelving along the SE end wall: three bays, four boards each, the painted goods on them
    const back = tone('#4a3a2e', 0.03), SXat = (y) => seX(y) - 0.45;
    for (const [ya, yb] of [[3.3, 4.2], [4.3, 5.2], [5.3, 6.0]]) {
      const SX = SXat((ya + yb) / 2);
      boxAt(SX + 0.005, SX + 0.395, ya + 0.005, yb - 0.005, 0, 0.06, M.walnut); boxAt(SX + 0.36, SX + 0.4, ya + 0.04, yb - 0.04, 0.06, 2.05, back);
      for (const z of [0.45, 0.95, 1.4, 1.85]) { boxAt(SX + 0.04, SX + 0.36, ya + 0.04, yb - 0.04, z, z + 0.035, M.oak); pln(yb - ya - 0.1, 0.3, mk(shelfTex), SX + 0.3, (ya + yb) / 2, z + 0.19, -1, 0); }
      boxAt(SX, SX + 0.04, ya, ya + 0.04, 0.06, 2.05, M.walnut); boxAt(SX, SX + 0.04, yb - 0.04, yb, 0.06, 2.05, M.walnut);
      solid('shelves', SX, SX + 0.4, ya, yb, 0, 2.05);
    }
    // the clothes rail (shirts hang across its axis), two tote bags, a stepped wallet table, baskets of plush on the floor
    const RX = 8.3, r = rng('rail'), pastel = ['#9fb6d8', '#e8e0cf', '#7aa88e', '#d98a6a', '#c9b99a', '#6f86a8', '#e7c9a6', '#b6a2c9'];
    for (const y of [4.2, 5.4]) boxAt(RX - 0.03, RX + 0.03, y - 0.03, y + 0.03, 0, 1.58, M.steelL); boxAt(RX - 0.02, RX + 0.02, 4.14, 5.46, 1.55, 1.59, M.steelL);
    for (let y = 4.3; y < 5.35; y += 0.13) { const h = 0.62 + r() * 0.16; boxAt(RX - 0.27, RX + 0.27, y - 0.025, y + 0.025, 1.52 - h, 1.52, tone(pastel[Math.floor(r() * pastel.length)], 0.03)); }
    solid('rail', RX - 0.32, RX + 0.32, 4.12, 5.48, 0, 1.6);
    for (const [x, y, c] of [[8.0, 3.7, '#2d4d96'], [8.0, 4.0, '#23305a']]) boxAt(x - 0.16, x + 0.16, y - 0.04, y + 0.04, 1.35, 1.8, tone(c, 0.03));
    table(7.1, 7.8, 5.15, 5.85); boxAt(7.15, 7.75, 5.2, 5.8, 0.73, 0.86, tone('#4a3a2c', 0.03));
    for (let k = 0; k < 8; k++) boxAt(7.17 + (k % 4) * 0.15, 7.27 + (k % 4) * 0.15, 5.25 + Math.floor(k / 4) * 0.2, 5.4 + Math.floor(k / 4) * 0.2, 0.86 + Math.floor(k / 4) * 0.06, 0.92 + Math.floor(k / 4) * 0.06, tone(['#2b3a5c', '#8a3f3a', '#3f6a58', '#c9b07a'][k % 4], 0.03));
    for (const [x, y] of [[9.0, 3.0], [8.9, 5.75]]) { mesh(new THREE.CylinderGeometry(0.27, 0.22, 0.32, 10), tone('#8a6a4a', 0.05), x, y, 0.16); for (let k = 0; k < 3; k++) sph(0.1, tone(['#9ab4d4', '#d9d4c4', '#c98a8a'][k], 0.04), x + (k - 1) * 0.12, y + (k % 2) * 0.05, 0.36, { seg: 7 }); solid('basket', x - 0.28, x + 0.28, y - 0.28, y + 0.28, 0, 0.4, { round: 0.27 }); }
    // the leaning framed shark photo against the rear wall
    { const fx = 6.1, fy = Y1 - 0.12; boxAt(fx - 0.38, fx + 0.38, fy - 0.03, fy + 0.03, 0.2, 1.1, tone('#b99a52', 0.03)); pln(0.64, 0.8, mk(sharkPicTex), fx, fy - 0.031, 0.66, 0, -1); solid('framed-photo', fx - 0.4, fx + 0.4, fy - 0.06, fy + 0.06, 0, 1.1); }
  }
  { // the beam of shark jaws (the SE structural beam) and the shimenawa, the big inflatable shark over the floor
    const BX = 8.3; boxAt(BX - 0.12, BX + 0.12, 0.3, Y1, 2.55, H, M.steel);
    const jaw = (y, z, R) => {
      const g = new THREE.Group(); g.position.set(BX - 0.15, FY + z, -y); g.rotation.y = Math.PI / 2; F.g.add(g);
      const bone = tone('#e8dfc6', 0.03), span = 4.19, a0 = -Math.PI / 6;     // a horseshoe, 240 deg, open at the bottom
      const arc = new THREE.Mesh(new THREE.TorusGeometry(R, R * 0.14, 5, 12, span), bone); arc.rotation.z = a0; arc.castShadow = false; g.add(arc);
      for (let k = 0; k <= 8; k++) { const a = a0 + (k / 8) * span, t2 = new THREE.Mesh(new THREE.ConeGeometry(R * 0.1, R * 0.34, 4), bone); t2.position.set(Math.cos(a) * (R - R * 0.2), Math.sin(a) * (R - R * 0.2), 0); t2.rotation.z = a + Math.PI / 2; t2.castShadow = false; g.add(t2); }
    };
    [[3.45, 2.8, 0.17], [4.05, 2.78, 0.21], [4.65, 2.8, 0.24], [5.25, 2.76, 0.26], [5.75, 2.8, 0.2]].forEach(([y, z, R]) => jaw(y, z, R));
    const sx = BX - 0.4, sy = 3.25, sz = 2.3, straw = tone('#cdb27a', 0.05);                                    // the shimenawa: a straw rope ring with tassels
    mesh(new THREE.TorusGeometry(0.17, 0.045, 6, 14), straw, sx, sy, sz, { ry: Math.PI / 2 }); mesh(new THREE.TorusGeometry(0.15, 0.04, 6, 12), straw, sx, sy, sz - 0.3, { ry: Math.PI / 2 });
    for (const dz of [-0.55, -0.62]) mesh(new THREE.ConeGeometry(0.05, 0.22, 6), straw, sx, sy + (dz === -0.55 ? 0.05 : -0.05), sz + dz, { rx: Math.PI });
    boxAt(sx - 0.01, sx + 0.01, sy - 0.01, sy + 0.01, sz + 0.2, H, M.black);
    { const bx = 7.7, by = 3.1, bz = 2.2, grey = tone('#7d93a6', 0.04), belly = tone('#e7ebee', 0.04);           // the big inflatable shark hung over the retail floor
      sph(0.5, grey, bx, by, bz, { seg: 10, scale: [0.52, 0.5, 1.9] }); sph(0.5, belly, bx, by, bz - 0.12, { seg: 10, scale: [0.44, 0.34, 1.8] });
      mesh(new THREE.ConeGeometry(0.13, 0.4, 5), grey, bx, by, bz + 0.34); mesh(new THREE.ConeGeometry(0.2, 0.55, 5), grey, bx, by + 0.95, bz + 0.1, { rx: Math.PI / 2 });
      boxAt(bx - 0.03, bx + 0.03, by + 1.0, by + 1.3, bz - 0.2, bz + 0.3, grey); sph(0.03, M.black, bx + 0.22, by - 0.55, bz + 0.12, { seg: 5 }); sph(0.03, M.black, bx - 0.22, by - 0.55, bz + 0.12, { seg: 5 });
      for (const y of [by - 0.4, by + 0.4]) boxAt(bx - 0.005, bx + 0.005, y - 0.005, y + 0.005, bz + 0.25, H, M.black);
    }
  }

  // ================================================================================================== overhead: the middle beam, the air-conditioner cassette, track lights, pendants, barn lamps, the mirror ball
  { boxAt(4.9, 5.1, Y0, Y1, 2.62, H, M.steel);                                                               // a middle beam across the room
    boxAt(2.25, 3.2, 1.3, 2.25, H - 0.2, H, M.steel); boxAt(2.3, 3.15, 1.35, 2.2, H - 0.215, H - 0.2, tone('#8a8f96', 0.02));   // the 4-way cassette with its louver face
    boxAt(3.58, 3.62, 0.6, 4.3, H - 0.1, H - 0.06, M.black);                                                  // the track along y_r with four spot heads
    for (const y of [0.9, 1.9, 2.9, 3.9]) { boxAt(3.59, 3.61, y - 0.01, y + 0.01, H - 0.2, H - 0.1, M.black); cyl(0.045, 0.14, M.black, 3.6, y, H - 0.27, { seg: 8, rz: 1 }); cyl(0.036, 0.02, M.warm, 3.6, y, H - 0.35, { seg: 8 }); }
    const pendant = (x, y, drop) => { boxAt(x - 0.004, x + 0.004, y - 0.004, y + 0.004, H - drop, H, M.black); cyl(0.022, 0.07, M.brass, x, y, H - drop - 0.03, { seg: 8 }); sph(0.045, bulb, x, y, H - drop - 0.1, { seg: 8, scale: [0.09, 0.13, 0.09] }); };
    pendant(1.7, 0.55, 0.62); pendant(1.7, 5.0, 0.66); pendant(4.4, 2.4, 0.55); pendant(6.6, 2.0, 0.6);
    const barn = (y) => { boxAt(X0, X0 + 0.04, y - 0.025, y + 0.025, 2.0, 2.28, M.black); boxAt(X0 + 0.04, X0 + 0.34, y - 0.012, y + 0.012, 2.26, 2.29, M.black); mesh(new THREE.CylinderGeometry(0.04, 0.17, 0.12, 12), M.black, X0 + 0.34, y, 2.17); sph(0.04, bulb, X0 + 0.34, y, 2.11, { seg: 7 }); };
    barn(2.45); barn(5.55);   // clear of the menus (y < 1.5) and of the neon (y 2.75-5.25)
    // the mirror ball: faceted, turning slowly (a dynamic mesh, drawn only near the camera)
    const geo = new THREE.IcosahedronGeometry(0.22, 2).toNonIndexed(); geo.computeVertexNormals();
    { const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), rb = rng('ball'); for (let f = 0; f < pos.count; f += 3) { const k = 0.58 + rb() * 0.42, tint = rb(); for (let v = 0; v < 3; v++) col.set([k * (0.88 + 0.12 * tint), k * (0.9 + 0.1 * (1 - tint)), k], (f + v) * 3); } geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); }
    const ball = new THREE.Mesh(geo, ctx.mat.toon('#ffffff', { vertexColors: true, paint: 0, noSnow: true })); const [bx, bz] = F.w(5.3, -3.9); ball.position.set(bx, FY + 2.35, bz); ball.castShadow = false; ball.receiveShadow = false; ctx.add(ball); ctx.noBatch(ball);
    boxAt(5.29, 5.31, 3.89, 3.91, 2.57, H, M.black); cyl(0.06, 0.1, M.black, 5.3, 3.9, H - 0.05, { seg: 8 });
    const cam = ctx.camera; let lastV = true;
    ctx.onUpdate((dt) => { ball.rotation.y += dt * 0.45; if (cam) { const near = Math.hypot(cam.position.x - ball.position.x, cam.position.z - ball.position.z) < 60; if (near !== lastV) { ball.visible = near; lastV = near; } } });
    note('mirror-ball', 5.05, 5.55, 3.65, 4.15, 2.1, 2.6, false);
  }

  // ================================================================================================== people: the town's own anime figures (cafe-rst-people.js), invented, never likenesses
  const crowd = buildCafePeople(ctx, F, { FY, warm: WARM });
  for (const c of PEOPLE) note(c.id, ...c.note, 0, 1.7, false);
  colCyl(1.05, 3.3, 0.24, 0, 1.75);                                                                           // the barista stands in the lane behind the counter
  for (const [x, y, z] of [[1.52, 3.12, 1.0], [1.98, 3.19, 1.0], [4.72, 0.46, 0.86]]) { cyl(0.07, 0.008, M.white, x, y, z + 0.004, { seg: 12 }); cyl(0.04, 0.055, M.white, x, y, z + 0.0355, { seg: 10 }); }   // a cup on a saucer by each pair of hands

  // ================================================================================================== night: the room's lamps as real point lights in life's lamp pool (they take the nearest slots when the camera is inside)
  if (Lt?.reals) {
    const lamp = (x, y, z, c, intensity, dist) => { const [X, Z] = F.w(x, -y); Lt.reals.push({ p: new THREE.Vector3(X, FY + z, Z), color: new THREE.Color(c), intensity, dist }); };
    lamp(1.05, 1.5, 1.7, '#ffcf94', 2.4, 6.5); lamp(1.05, 4.2, 1.7, '#ffcf94', 2.4, 6.5); lamp(4.4, 2.4, 2.0, '#ffd9a8', 3.2, 7.5); lamp(6.8, 3.6, 2.0, '#ffd9a8', 3.2, 7.5); lamp(4.5, 4.6, 1.9, '#ffd09a', 2.8, 6.5);
  }
  void FACE; void FN;

  // the room's record: bounds, the entrance on the sidewalk and the first view inside
  const door = DOOR, dc = (door.x0 + door.x1) / 2;
  const [ex, ez] = roomToWorld(dc, -3.0), [ix, iz] = roomToWorld(5.0, 2.3);
  note('shell', X0, xs0, Y0, Y1, 0, H, false);
  return {
    id: 'cafeRst', ja: 'café RST（迎 1F）', en: 'café RST (Mukaeru, 1F)', credit: CAFE_RST_CREDIT, consent: CAFE_RST_CONSENT, items, group: F.g, crowd, door: { x: dc, w: door.x1 - door.x0, h: door.z1 },
    entrance: { x: +ex.toFixed(1), z: +ez.toFixed(1), yaw: yawToward(0, 1), pitch: 4 },
    inside: { x: +ix.toFixed(1), z: +iz.toFixed(1), y: FY, yaw: yawToward(-1, 0.12), pitch: 3 },   // the first view: the counter wall with the gear and, at its right edge, the barista
    bounds: { floorY: FY, y0: FY - 1, y1: FY + H + 0.6, local: (X, Z) => { const [x, y] = worldToRoom(X, Z); return inRoom(x, y, -0.02); } },
  };
}
