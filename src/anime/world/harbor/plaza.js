// [v4:polish1] 気仙沼プラザホテル (柏崎 1-1, 65 rooms) on the 柏崎 bluff over 港町, facing the inner bay, from the
// reference photo (Wikimedia Commons "Kesennnuma plaza hotel 20130601.JPG", Opqr, 2013; reference only), the GSI z18
// photo and footprints, the DEM and the hotel's facility page (pkanyo.jp: the lift that links the hotel to the お魚いちば
// below). docs/anime/landmarks/plaza-hotel.md.
//
//   the tower: a cross-shaped block of 7 storeys on the bluff top (T.P. 25.2; GSI traces its roof as a cross), white
//     render with mauve-pink panels between the window bays, stepped back at the top two floors, and a brown-and-white
//     crown with the hotel's roundel;
//   the podium round it (lobby, restaurants, the baths) at 1½ storeys, on the footprint the GSI tile edge splits in two,
//     and the south wing of 5 storeys with the 「海とふれあい 気仙沼プラザホテル」 sign box on its roof;
//   the glass lift tower at the cliff foot on 港町 (GSI footprint 6 × 7 m, T.P. 2.3) with the roundel on its white
//     head, a lattice spire, and the enclosed bridge (GSI footprint 25 × 3.7 m) running up to the tower's floor on the
//     bluff.
import * as THREE from 'three';
import { nightMat } from './lights.js';
import { wallGeo, flatRoof, colliders, textTex, FONT, mapMat, facadeMat, paintWindow, obbOf, obbPt } from '../landmarks/kit.js';

export const PLAZA = {
  main: '16/58541/25068/142', wing: '16/58541/25069/27', annex: '16/58541/25068/141', bridge: '16/58541/25068/137', lift: '16/58541/25068/136', liftHall: '16/58541/25068/135',
  towerC: [306, 212], towerY: 25.2, floors: 7, fh: 3.1, rot: -0.12,
  arms: [[30, 12], [12, 28]],   // the cross: an east-west arm and a north-south arm (m), from the z18 roof
};
/** The lots the hotel replaces (town, the mid builder and explore leave them: world/lotfix.js tags them). */
export const PLAZA_LOTS = [PLAZA.main, PLAZA.wing, PLAZA.annex, PLAZA.bridge, PLAZA.lift, PLAZA.liftHall];

function roundelTex(ctx) {
  return ctx.tex.draw(256, 256, (g, W, H) => {
    g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, W, H);
    const r = W * 0.38, cx = W / 2, cy = H / 2;
    g.fillStyle = '#d2413a'; g.beginPath(); g.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 1.75); g.fill();
    g.fillStyle = '#2d5fa8'; g.beginPath(); g.arc(cx, cy, r, Math.PI * 1.75, Math.PI * 2.75); g.fill();
    g.strokeStyle = '#f4f1ea'; g.lineWidth = W * 0.05; g.beginPath(); g.moveTo(cx - r * 0.75, cy + r * 0.75); g.bezierCurveTo(cx - r * 0.1, cy + r * 0.1, cx + r * 0.1, cy - r * 0.1, cx + r * 0.75, cy - r * 0.75); g.stroke();
  }, { key: 'plaza-roundel', anisotropy: 8 });
}

export function buildPlazaHotel(ctx) {
  const L = ctx.L, lot = (id) => L.lotById(id);
  const main = lot(PLAZA.main); if (!main) return null;
  const root = new THREE.Group(); root.name = 'harbor-plaza-hotel'; ctx.addStatic(root);
  const W = ctx.kit(root), t = (c, o = {}) => ctx.mat.toon(c, { paint: 0.03, ...o });
  const M = {
    white: t('#eeeae2', { paint: 0.02 }), pink: t('#c8a39a'), brown: t('#8a6a55'), grey: t('#b9b6ae'), roof: t('#c9ccc9', { paint: 0.04 }),
    frame: t('#f6f4ee', { paint: 0.01 }), steel: t('#9aa1a8', { paint: 0 }), glass: nightMat(ctx, '#7f98ab', '#ffe2b8', 1.3),
  };
  const rooms = facadeMat(ctx, 'plaza-rooms', { draw: paintWindow({ wall: '#eeeae2', frame: '#d9d6cf', glass: ['#5f7a90', '#aabfcc'], win: [0.16, 0.28, 0.84, 0.8], mull: 1, sill: '#c8c4bb' }), win: [0.16, 0.28, 0.84, 0.8], lit: 0.55 });
  const halls = facadeMat(ctx, 'plaza-halls', { draw: paintWindow({ wall: '#e6e1d8', frame: '#cfccc4', glass: ['#6a8296', '#b3c5d0'], win: [0.08, 0.2, 0.92, 0.85], mull: 2 }), win: [0.08, 0.2, 0.92, 0.85], lit: 0.5 });
  const g0 = (x, z) => L.heightAt(x, z) - 0.6;
  const out = { lots: [] };

  // ---- the podium on the main footprint and the annex; the south wing
  const podTop = PLAZA.towerY + 4.6;
  for (const [id, top] of [[PLAZA.main, podTop], [PLAZA.annex, 24.5 + 4.0]]) {
    const l = lot(id); if (!l) continue;
    W.mesh(wallGeo(l.poly, g0, top, { tu: 4, tv: 3.4, yRef: PLAZA.towerY }), halls);
    flatRoof(W, l.poly, top, M.roof, M.white, 0.6);
    colliders(ctx, l.poly, 0, top + 1);
    out.lots.push(id);
  }
  const wing = lot(PLAZA.wing);
  if (wing) {
    const wy = 21.0, wt = wy + 5 * 3.2;
    W.mesh(wallGeo(wing.poly, g0, wt, { tu: 3.4, tv: 3.2, yRef: wy }), rooms);
    flatRoof(W, wing.poly, wt, M.roof, M.white, 0.8);
    colliders(ctx, wing.poly, 0, wt + 1);
    // the sign box on the roof (the photo's 「海とふれあい 気仙沼プラザホテル」)
    const o = obbOf(wing.poly), c = obbPt(o, 0, -o.d / 2 + 6);
    const S = new THREE.Group(); S.position.set(c[0], wt, c[1]); S.rotation.y = o.rotY + Math.PI / 2; root.add(S);
    const ks = ctx.kit(S);
    ks.boxB(9, 3.6, 3, M.white, [0, 0, 0]);
    const st = textTex(ctx, '気仙沼プラザホテル', { w: 1024, h: 192, color: '#2d4a7a', bg: '#f6f4ee', font: FONT.sans, weight: 800, size: 0.62, key: 'plaza-sign' });
    const sub = textTex(ctx, '海とふれあい', { w: 512, h: 128, color: '#3f6fa8', bg: '#f6f4ee', font: FONT.round, weight: 700, size: 0.6, key: 'plaza-sign2' });
    for (const s of [-1, 1]) {
      ks.mesh(new THREE.PlaneGeometry(8.4, 1.6), mapMat(ctx, 'toon', '#ffffff', st, { paint: 0, nightGlow: 0.8 }), [0, 1.3, s * 1.52], [0, s < 0 ? Math.PI : 0, 0]);
      ks.mesh(new THREE.PlaneGeometry(4.2, 1.05), mapMat(ctx, 'toon', '#ffffff', sub, { paint: 0, nightGlow: 0.8 }), [0, 2.75, s * 1.52], [0, s < 0 ? Math.PI : 0, 0]);
    }
    out.lots.push(PLAZA.wing);
  }

  // ---- the cross-shaped tower, stepped back at the top two floors, with the crown and roundel
  const [tx, tz] = PLAZA.towerC, T = new THREE.Group(); T.position.set(tx, PLAZA.towerY, tz); T.rotation.y = PLAZA.rot; root.add(T);
  const kt = ctx.kit(T), fh = PLAZA.fh, H = PLAZA.floors * fh;
  const armBox = (w, d, y0, y1, inset) => {
    const ww = w - inset, dd = d - inset;
    const ring = [[-ww / 2, -dd / 2], [ww / 2, -dd / 2], [ww / 2, dd / 2], [-ww / 2, dd / 2]];
    kt.mesh(wallGeo(ring, y0, y1, { tu: 3.2, tv: fh, yRef: 0 }), rooms);
    kt.boxB(ww + 0.3, 0.3, dd + 0.3, M.white, [0, y1, 0]);
    // mauve-pink panels between the bays, up the arm ends
    for (const s of [-1, 1]) { kt.boxB(1.2, y1 - y0 - 0.4, 0.15, M.pink, [0, y0 + 0.2, s * (dd / 2 + 0.05)]); kt.boxB(0.15, y1 - y0 - 0.4, 1.2, M.pink, [s * (ww / 2 + 0.05), y0 + 0.2, 0]); }
  };
  const lowH = (PLAZA.floors - 2) * fh;
  for (const [w, d] of PLAZA.arms) { armBox(w, d, 0, lowH, 0); armBox(w, d, lowH, H, 4); }
  kt.boxB(7.5, 5.2, 7.5, M.brown, [0, H, 0]);
  kt.boxB(5.2, 4.2, 0.3, M.white, [0, H + 0.6, 3.8]); kt.boxB(5.2, 4.2, 0.3, M.white, [0, H + 0.6, -3.8]);
  const rt = mapMat(ctx, 'toon', '#ffffff', roundelTex(ctx), { paint: 0, nightGlow: 0.6 });
  for (const s of [-1, 1]) kt.mesh(new THREE.PlaneGeometry(2.6, 2.6), rt, [0, H + 2.7, s * 3.97], [0, s < 0 ? Math.PI : 0, 0]);
  for (const s of [-1, 1]) kt.box(0.08, 3, 0.08, M.steel, [s * 2.5, H + 6.6, 0]);
  if (ctx.physics?.addBox) for (const [w, d] of PLAZA.arms) ctx.physics.addBox(tx, tz, w, d, PLAZA.rot, PLAZA.towerY - 1, PLAZA.towerY + H + 5);
  out.tower = { x: tx, z: tz, y: PLAZA.towerY, top: PLAZA.towerY + H + 5.2 };

  // ---- the lift tower at the cliff foot, its hall, and the glazed bridge up to the bluff
  const lift = lot(PLAZA.lift), hall = lot(PLAZA.liftHall), bridge = lot(PLAZA.bridge);
  const deckY = PLAZA.towerY + 0.6;
  if (lift) {
    const ly = lift.groundY, top = deckY + 5.5, o = obbOf(lift.poly);
    const G = new THREE.Group(); G.position.set(o.cx, ly, o.cz); G.rotation.y = o.rotY; root.add(G);
    const kl = ctx.kit(G), h = top - ly;
    kl.boxB(o.w, h, o.d, M.glass, [0, 0, 0]);
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) kl.boxB(0.5, h, 0.5, M.frame, [a * (o.w / 2 - 0.25), 0, b * (o.d / 2 - 0.25)]);
    for (let y = 3.2; y < h - 6; y += 3.2) kl.boxB(o.w + 0.1, 0.25, o.d + 0.1, M.frame, [0, y, 0]);
    kl.boxB(o.w + 0.4, 6, o.d + 0.4, M.white, [0, h - 6, 0]);
    for (const s of [-1, 1]) kl.mesh(new THREE.PlaneGeometry(2.4, 2.4), rt, [0, h - 3, s * (o.d / 2 + 0.22)], [0, s < 0 ? Math.PI : 0, 0]);
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const p = kl.box(0.08, 4.5, 0.08, M.steel, [a * 1.2, h + 2.0, b * 1.2]); p.rotation.set(-b * 0.25, 0, a * 0.25); }
    colliders(ctx, lift.poly, ly - 1, top + 1);
    out.lift = { x: o.cx, z: o.cz, y: ly, top };
  }
  if (hall) { const hy = hall.groundY; W.mesh(wallGeo(hall.poly, g0, hy + 3.6, { tu: 3, tv: 3.6, yRef: hy }), halls); flatRoof(W, hall.poly, hy + 3.6, M.roof, M.white, 0.4); colliders(ctx, hall.poly, hy - 1, hy + 4); }
  if (bridge) {
    // the enclosed bridge: the footprint's long axis, a glazed box on a steel truss, from the lift's head to the bluff
    const o = obbOf(bridge.poly), a = obbPt(o, 0, -o.d / 2), b = obbPt(o, 0, o.d / 2);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
    const G = new THREE.Group(); G.position.set((a[0] + b[0]) / 2, deckY, (a[1] + b[1]) / 2); G.rotation.y = yaw; root.add(G);
    const kb = ctx.kit(G);
    kb.boxB(3.4, 0.5, len, M.grey, [0, -0.5, 0]);
    kb.boxB(3.2, 2.7, len, M.glass, [0, 0, 0]);
    kb.boxB(3.5, 0.35, len + 0.2, M.white, [0, 2.7, 0]);
    for (let z = -len / 2; z <= len / 2 + 0.01; z += 3) for (const s of [-1, 1]) kb.boxB(0.12, 2.7, 0.12, M.frame, [s * 1.62, 0, z]);
    for (let z = -len / 2 + 2; z < len / 2; z += 4) { const d = kb.box(0.12, 0.12, 4.4, M.steel, [0, -1.6, z]); d.rotation.x = 0.45; }
    out.bridge = { len: Math.round(len * 10) / 10, y: deckY };
  }
  root.updateMatrixWorld(true);
  return out;
}
