// [v4:explore] Walk-in interiors (V3-SPEC section 10: "a few enterable interiors at the hero landmarks (the market
// hall, a shop, the station)"). The station's waiting hall is landmarks-B's (world/landmarks/station.js); this module
// adds the other two, both from their references:
//
//   気仙沼市魚市場 C棟 (2019): the visitors' side of the closed, temperature-controlled hall. A glazed visitors' entrance
//   in the land-side wall, a lobby with a window onto the landing floor, the stair to the 2F 水産情報等発信施設 (the
//   market's information hall: a three-screen theatre about longline tuna fishing, a real electric forklift for the
//   auction simulation, panels on the catch), and the 2F viewing gallery behind glass over the 1F landing floor,
//   where swordfish (メカジキ) and tuna from the longliners lie in rows for the auction. Sources: the market's tour page
//   (kesennuma-uoichiba.jp/tourroute: 2F 水産情報等発信施設 with the 3-screen theatre and the forklift; the 1F and 2F
//   viewing areas over the swordfish landings), kesennuma-kanko.jp/uoishiba_suisanhasshin (C棟 2F),
//   docs/anime/landmarks/fish-market.md (C棟: 195 m, closed hall, 2F deck). The footprint is harbor/real.js SITES.marketC.
//
//   男山本店 魚町店舗: the 1930 three-storey shop of the 男山本店 sake brewery on 魚町's waterfront road, a registered
//   tangible cultural property (文化遺産オンライン: 木筋コンクリート造 3 storeys, washed-aggregate walls, moulded bands
//   at every floor, a parapet with pilasters, balustrade and gable), rebuilt in 2020; the 1F is the brewery's shop and
//   tasting counter (kesennuma-kanko.jp/otokoyama-new2020, tohokukanko.jp). Its lot (explore/taken.js) is left out by
//   town. The brewery's own labels (蒼天伝, 美禄, 男山) are on its shelves.
//
//   café RST (cafe-rst.js): the roastery café on the 1F of 迎 (ムカエル), with Lander Blue's shark goods in the same room,
//   built from the project owner's own walk-through video and the surveyed ANCHOR face; the shop's consent and credit are
//   in that module (CAFE_RST_CONSENT, CAFE_RST_CREDIT). 迎 is a harbor landmark, not a town lot: nothing is taken from town.
//
// Interiors are lit like the shop rooms: their surfaces ignore the building's own shadow (the roof would otherwise put
// every room in the dark band of the cel ramp).
import * as THREE from 'three';
import { SITES } from '../harbor/real.js';
import { EXPLORE_LOTS } from './taken.js';
import { buildCafeRst, ENABLED as CAFE_RST_ENABLED } from './cafe-rst.js';   // [cafe-rst]

const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };

/** A placement frame: local (x, z) -> world, rotation about Y. Boxes are centred at (x, y, z) in the frame. */
function frame(ctx, parent, ox, oy, oz, rotY) {
  const g = new THREE.Group(); g.position.set(ox, oy, oz); g.rotation.y = rotY; parent.add(g); g.updateMatrixWorld(true);
  const c = Math.cos(rotY), s = Math.sin(rotY);
  const w = (x, z) => [ox + x * c + z * s, oz - x * s + z * c];
  const lit = (m) => { m.castShadow = false; m.receiveShadow = false; return m; };
  const F = {
    g, w, rotY,
    box(wd, h, d, mat, x, y, z, o = {}) { const m = new THREE.Mesh(ctx.geo.G.box(), mat); m.scale.set(wd, h, d); m.position.set(x, y, z); if (o.ry) m.rotation.y = o.ry; if (o.rx) m.rotation.x = o.rx; if (o.rz) m.rotation.z = o.rz; (o.parent || g).add(m); if (o.shadow) { m.castShadow = true; m.receiveShadow = true; } else lit(m); return m; },
    plane(wd, h, mat, x, y, z, ry = 0, rx = 0) { const m = new THREE.Mesh(ctx.geo.G.plane(), mat); m.scale.set(wd, h, 1); m.position.set(x, y, z); m.rotation.set(rx, ry, 0, 'YXZ'); g.add(m); lit(m); return m; },
    mesh(geo, mat, x, y, z, o = {}) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (o.ry) m.rotation.y = o.ry; if (o.rx) m.rotation.x = o.rx; if (o.rz) m.rotation.z = o.rz; if (o.scale) m.scale.set(...o.scale); g.add(m); lit(m); return m; },
    // physics in the frame
    col(ctxP, x, z, wd, d, y0, y1) { const [X, Z] = w(x, z); ctxP.addBox(X, Z, wd, d, rotY, y0, y1); },
    floor(ctxP, x, z, wd, d, top) { const [X, Z] = w(x, z); ctxP.addWalkBox(X, Z, wd, d, rotY, top, top - 0.5); },
  };
  return F;
}

/** [v4:polish3] A simple standing figure in the interiors' style (boots / trousers, a top, a head, an optional cap
 *  or hair), facing local +z of `parent`; `arms` adds forearms (a clipboard, a cup) held in front. Sizes in metres. */
const _mats = new WeakMap();
function person(ctx, parent, x, y, z, ry, { top = '#6f86a8', legs = '#3b3f4a', cap = null, hair = '#2e2622', skin = '#e9c3a0', h = 1.68, arms = false, hold = null } = {}) {
  let cache = _mats.get(ctx); if (!cache) _mats.set(ctx, (cache = new Map()));
  const mat = (c) => { let m = cache.get(c); if (!m) cache.set(c, (m = ctx.mat.toon(c, { paint: 0, noSnow: true }))); return m; };
  const q = new THREE.Group(); q.position.set(x, y, z); q.rotation.y = ry; parent.add(q);
  const k = h / 1.68;
  const add = (geo, c, px, py, pz, sx, sy, sz) => { const m = new THREE.Mesh(geo, mat(c)); m.position.set(px * k, py * k, pz * k); m.scale.set(sx * k, sy * k, sz * k); m.castShadow = false; m.receiveShadow = false; q.add(m); return m; };
  const cyl = ctx.geo.G.cyl(10), sph = ctx.geo.G.sphere(10), box = ctx.geo.G.box();
  for (const s of [-1, 1]) add(cyl, legs, s * 0.09, 0.42, 0, 0.15, 0.84, 0.16);
  add(cyl, top, 0, 1.12, 0, 0.42, 0.62, 0.28);
  add(sph, top, 0, 1.4, 0, 0.44, 0.16, 0.3);
  add(sph, skin, 0, 1.57, 0, 0.21, 0.25, 0.22);
  if (cap) add(cyl, cap, 0, 1.68, 0, 0.24, 0.09, 0.25); else add(sph, hair, 0, 1.63, -0.02, 0.23, 0.16, 0.23);
  for (const s of [-1, 1]) {
    if (arms) { add(cyl, top, s * 0.24, 1.18, 0.1, 0.1, 0.36, 0.1).rotation.x = -0.9; add(sph, skin, s * 0.2, 1.05, 0.26, 0.08, 0.08, 0.08); }
    else add(cyl, top, s * 0.26, 1.08, 0, 0.1, 0.52, 0.1);
  }
  if (hold) add(box, hold, 0, 1.08, 0.3, 0.24, 0.02, 0.32).rotation.x = -0.6;
  return q;
}

function textTex(ctx, key, w, h, draw) { return ctx.tex.draw(w, h, draw, { key: 'explore-int-' + key, anisotropy: 8 }); }

// ====================================================================================================== fish market C棟
function buildMarketC(ctx, root) {
  const L = ctx.L, P = ctx.physics, T = ctx.tex, FN = T.FONTS;
  const poly = SITES.marketC.poly;
  const g0 = Math.max(2.2, Math.min(3.2, med(poly.slice(0, -1).map(([x, z]) => L.heightAt(x, z)))));
  const y2 = g0 + 7.5;
  // frame: origin at the building's NW corner, local +z along the land-side wall (south), local +x across to the quay
  const O = poly[0], S1 = poly[poly.length - 2];
  const ax = S1[0] - O[0], az = S1[1] - O[1], al = Math.hypot(ax, az);
  const rotY = Math.atan2(ax / al, az / al);
  const F = frame(ctx, root, O[0], 0, O[1], rotY);
  const M = {
    wall: ctx.mat.toon('#efe9de', { paint: 0.02 }), wall2: ctx.mat.toon('#dfe6ea', { paint: 0.02 }), floor: ctx.mat.toon('#c9cdd0', { paint: 0.04 }), floor2: ctx.mat.toon('#b9a88f', { paint: 0.04 }),
    hall: ctx.mat.toon('#e8ecec', { paint: 0.03 }), ceil: ctx.mat.toon('#f4f4f1', { paint: 0.01 }), steel: ctx.mat.toon('#8e969e', { paint: 0.02 }), dark: ctx.mat.toon('#4d5462', { paint: 0 }),
    rail: ctx.mat.toon('#aeb6bd', { paint: 0 }), blue: ctx.mat.toon('#2f5f9c', { paint: 0.02 }), tub: ctx.mat.toon('#2f64b5', { paint: 0.02 }), sheet: ctx.mat.toon('#3f78c8', { paint: 0.02 }),
    fishTop: ctx.mat.toon('#4b5570', { paint: 0.02 }), fishBelly: ctx.mat.toon('#c7ccd6', { paint: 0.01 }), tuna: ctx.mat.toon('#3d4a66', { paint: 0.02 }), fin: ctx.mat.toon('#5a6377', { paint: 0 }),
    white: ctx.mat.toon('#f2f2ee', { paint: 0.01 }), skin: ctx.mat.toon('#e9c3a0', { paint: 0, noSnow: true }), boot: ctx.mat.toon('#3b3f4a', { paint: 0 }), apron: ctx.mat.toon('#6f86a8', { paint: 0 }),
    // [v4:polish2] the landing floor: wet concrete and darker walls (the 2F view washed out to one cream value)
    wetFloor: ctx.mat.toon('#6f7f86', { paint: 0.08 }), floorWall: ctx.mat.toon('#b9b2a4', { paint: 0.04 }),
    fork: ctx.mat.toon('#e0a22a', { paint: 0.02 }), forkDark: ctx.mat.toon('#474c55', { paint: 0 }), bench: ctx.mat.toon('#a5835f', { paint: 0.03 }),
    // [v4:polish1] plain, clear glass (opacity 0.15, no highlight streaks): the streaked panes washed the gallery view
    // out with big diagonal glare bands (saturation 0.075, contrast 0.10 on the landing floor)
    glass: ctx.mat.glass ? ctx.mat.glass({ tint: '#bcd8e6', opacity: 0.15, streaks: false }) : new THREE.MeshBasicMaterial({ color: '#bcd8e6', transparent: true, opacity: 0.15, depthWrite: false }),
    lamp: ctx.mat.emissive('#fffaf0', 1.25), led: ctx.mat.emissive('#eef6ff', 1.35),
  };
  M.glass.userData = M.glass.userData || {};
  const X0 = 0.35, LOBBY = { x1: 11, z0: 14, z1: 46 }, HALL = { x1: 17.5, z0: 8, z1: 60 }, FLOOR = { x0: 17.8, x1: 62, z0: 9, z1: 60 };

  // ---------------------------------------------------------------- the visitors' entrance in the land-side wall
  const doorZ = 24, doorW = 3.4;
  const [dX, dZ] = F.w(0, doorZ);
  // take out the wall collider piece(s) at the door (harbor's 16 m pieces), then put back each piece less the doorway
  const removed = P.removeNear(dX, dZ, 9, (it) => it.type === 'box' && it.hw < 0.4 && it.hd > 2 && !it.tag);
  for (const it of removed) {
    const ux = it.s, uz = it.c;   // the piece's long axis (its local z)
    const t = (dX - it.cx) * ux + (dZ - it.cz) * uz;   // the door centre along it
    for (const [a, b] of [[-it.hd, Math.min(it.hd, t - doorW / 2)], [Math.max(-it.hd, t + doorW / 2), it.hd]]) {
      if (b - a < 0.2) continue;
      const m = (a + b) / 2; P.addBox(it.cx + ux * m, it.cz + uz * m, it.hw * 2, b - a, it.rotY, it.y0, it.y1);
    }
    if (Math.abs(t) < it.hd) P.addBox(it.cx + ux * t, it.cz + uz * t, it.hw * 2, doorW, it.rotY, g0 + 3.0, it.y1);   // lintel
  }
  const signTex = textTex(ctx, 'mkt-entrance', 1024, 256, (g, w, h) => {
    g.fillStyle = '#1f3a68'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    T.fitText(g, '気仙沼市魚市場 見学者入口', w / 2, h * 0.4, w * 0.9, 96, FN.sans, 900);
    g.globalAlpha = 0.85; T.fitText(g, 'KESENNUMA FISH MARKET · VISITORS', w / 2, h * 0.78, w * 0.8, 44, FN.en, 700); g.globalAlpha = 1;
  });
  const signMat = ctx.mat.toon('#ffffff', { map: signTex, paint: 0.01, nightGlow: 0.6 });
  // outside: canopy, frame, glass doors (open on the right), the sign, a mat
  F.box(0.08, 0.25, doorW + 1.6, M.steel, -1.6, g0 + 3.3, doorZ, { shadow: true });
  F.box(2.2, 0.16, doorW + 1.8, M.white, -1.1, g0 + 3.45, doorZ, { shadow: true });
  F.plane(doorW + 1.4, (doorW + 1.4) / 4, signMat, -0.08, g0 + 4.35, doorZ, -Math.PI / 2);
  for (const s of [-1, 1]) F.box(0.18, 3.0, 0.18, M.steel, -0.05, g0 + 1.5, doorZ + s * doorW / 2);
  F.box(0.16, 0.2, doorW, M.steel, -0.05, g0 + 3.0, doorZ);
  F.box(0.03, 2.8, doorW / 2 - 0.1, M.glass, -0.1, g0 + 1.4, doorZ - doorW / 4);
  F.box(0.03, 2.8, doorW / 2 - 0.1, M.glass, 0.25, g0 + 1.4, doorZ + doorW / 2 + 0.2);   // slid open behind the wall line
  F.box(1.6, 0.03, doorW, M.dark, -0.8, g0 + 0.02, doorZ);
  // the walkway from the car-park side up to the door
  F.box(3.2, 0.3, doorW + 1, M.floor, -1.7, g0 - 0.14, doorZ);
  F.floor(P, -1.7, doorZ, 3.2, doorW + 1, g0 + 0.02);

  // ---------------------------------------------------------------- 1F lobby
  const lobbyW = LOBBY.x1 - X0, lobbyD = LOBBY.z1 - LOBBY.z0, lcx = (X0 + LOBBY.x1) / 2, lcz = (LOBBY.z0 + LOBBY.z1) / 2;
  F.box(lobbyW, 0.2, lobbyD, M.floor, lcx, g0 - 0.1, lcz);
  F.floor(P, lcx, lcz, lobbyW, lobbyD, g0 + 0.02);
  F.box(lobbyW, 0.12, lobbyD, M.ceil, lcx, g0 + 4.3, lcz);
  F.box(lobbyW, 4.3, 0.2, M.wall, lcx, g0 + 2.15, LOBBY.z0); F.col(P, lcx, LOBBY.z0, lobbyW, 0.3, g0 - 1, g0 + 5);
  F.box(lobbyW, 4.3, 0.2, M.wall, lcx, g0 + 2.15, LOBBY.z1); F.col(P, lcx, LOBBY.z1, lobbyW, 0.3, g0 - 1, g0 + 5);
  // inner face of the land-side wall, open at the doorway (reveals either side, a lintel over it)
  for (const [z0, z1] of [[LOBBY.z0, doorZ - doorW / 2], [doorZ + doorW / 2, LOBBY.z1]]) F.box(0.15, 4.3, z1 - z0, M.wall, X0 + 0.02, g0 + 2.15, (z0 + z1) / 2);
  F.box(0.15, 1.3, doorW, M.wall, X0 + 0.02, g0 + 3.65, doorZ);
  for (const s of [-1, 1]) F.box(0.6, 3.0, 0.08, M.steel, X0 - 0.2, g0 + 1.5, doorZ + s * (doorW / 2 + 0.04));
  // east side: the 1F viewing window onto the landing floor (glass, a steel rail)
  F.box(0.05, 3.2, lobbyD - 1, M.glass, LOBBY.x1, g0 + 1.9, lcz); F.col(P, LOBBY.x1, lcz, 0.3, lobbyD, g0 - 1, g0 + 5);
  F.box(0.08, 0.06, lobbyD - 1, M.rail, LOBBY.x1 - 0.35, g0 + 1.0, lcz);
  for (let z = LOBBY.z0 + 1; z <= LOBBY.z1 - 1; z += 3) F.box(0.05, 1.0, 0.05, M.rail, LOBBY.x1 - 0.35, g0 + 0.5, z);
  F.box(0.2, 0.6, lobbyD, M.wall2, LOBBY.x1, g0 + 3.9, lcz);
  for (let z = LOBBY.z0 + 3; z < LOBBY.z1; z += 6) F.box(1.2, 0.04, 0.25, M.lamp, lcx, g0 + 4.22, z);
  // the stair to 2F along the land-side wall: rises from z 30 to z 44 (0.54 m tread, 0.3 m rise)
  const stX = X0 + 1.55, stW = 2.4, stZ0 = 30.5, stZ1 = 44.5, nSteps = 25;
  for (let i = 0; i < nSteps; i++) { const z = stZ0 + (stZ1 - stZ0) * (i + 0.5) / nSteps, y = g0 + (y2 - g0) * (i + 1) / nSteps; F.box(stW, 0.12, (stZ1 - stZ0) / nSteps + 0.02, M.floor2, stX, y - 0.06, z); F.box(stW, y - g0 - 0.06, 0.04, M.wall2, stX, g0 + (y - g0) / 2, z - (stZ1 - stZ0) / nSteps / 2); }
  { const [cx, cz] = F.w(stX, (stZ0 + stZ1) / 2); P.addStairs(cx, cz, stW, stZ1 - stZ0, rotY, g0, y2, nSteps); }
  F.col(P, stX + stW / 2 + 0.1, (stZ0 + stZ1) / 2, 0.12, stZ1 - stZ0, g0 - 1, y2 + 1.2);   // the stair's rail side
  F.box(0.06, 0.06, Math.hypot(stZ1 - stZ0, y2 - g0), M.rail, stX + stW / 2 + 0.05, (g0 + y2) / 2 + 0.95, (stZ0 + stZ1) / 2, { rx: Math.atan2(y2 - g0, stZ1 - stZ0) });
  // lobby furniture: a floor map board of the market and the day's landings board
  const mapTex = textTex(ctx, 'mkt-guide', 1024, 640, (g, w, h) => {
    g.fillStyle = '#f7f4ec'; g.fillRect(0, 0, w, h); g.fillStyle = '#1f3a68'; g.fillRect(0, 0, w, 110);
    g.fillStyle = '#fff'; g.textAlign = 'left'; g.textBaseline = 'middle'; T.fitText(g, '見学のご案内  Visitor guide', 40, 56, w - 80, 58, FN.sans, 900);
    g.fillStyle = '#2d3350'; g.font = `700 40px ${FN.sans}`;
    const lines = ['2F  水産情報等発信施設・見学通路', '    Information hall and viewing gallery', '1F  水揚げ見学窓（メカジキ・マグロ）', '    Landing floor window', '屋上  気仙沼湾の眺め  Rooftop view'];
    lines.forEach((t, i) => { g.font = `${i % 2 ? 500 : 700} ${i % 2 ? 30 : 40}px ${FN.sans}`; g.fillStyle = i % 2 ? '#6b6f86' : '#2d3350'; g.fillText(t, 40, 175 + i * 82); });
    g.fillStyle = '#e0703f'; g.fillRect(40, h - 70, w - 80, 8);
    g.fillStyle = '#6b6f86'; g.font = `500 28px ${FN.sans}`; g.fillText('見学は6:00〜  水揚げの多い朝がおすすめ', 40, h - 30);
  });
  F.plane(3.2, 2.0, ctx.mat.toon('#ffffff', { map: mapTex, paint: 0.01 }), X0 + 0.14, g0 + 1.9, 18.5, Math.PI / 2);
  // benches
  for (const z of [20, 36]) { F.box(0.5, 0.45, 2.4, M.bench, 8.8, g0 + 0.225, z); F.col(P, 8.8, z, 0.6, 2.5, g0 - 1, g0 + 0.5); }

  // ---------------------------------------------------------------- 2F: the information hall and the viewing gallery
  const hallW = HALL.x1 - X0, hallD = HALL.z1 - HALL.z0, hcx = (X0 + HALL.x1) / 2, hcz = (HALL.z0 + HALL.z1) / 2;
  // floor slab with the stair well (x X0..stX+stW/2+0.2, z stZ0..stZ1) left open
  const wellX1 = stX + stW / 2 + 0.2;
  const slab = (x0, x1, z0, z1) => { const w = x1 - x0, d = z1 - z0; if (w < 0.1 || d < 0.1) return; F.box(w, 0.3, d, M.floor2, (x0 + x1) / 2, y2 - 0.15, (z0 + z1) / 2); F.floor(P, (x0 + x1) / 2, (z0 + z1) / 2, w, d, y2); F.box(w, 0.05, d, M.ceil, (x0 + x1) / 2, y2 - 0.33, (z0 + z1) / 2); };
  slab(X0, HALL.x1, HALL.z0, stZ0); slab(X0, HALL.x1, stZ1, HALL.z1); slab(wellX1, HALL.x1, stZ0, stZ1);
  // well guard rail on 2F
  F.col(P, wellX1, (stZ0 + stZ1) / 2 - 1.3, 0.1, stZ1 - stZ0 - 2.6, y2 - 0.2, y2 + 1.1);
  F.box(0.05, 1.05, stZ1 - stZ0 - 2.6, M.glass, wellX1, y2 + 0.52, (stZ0 + stZ1) / 2 - 1.3);
  F.col(P, (X0 + wellX1) / 2, stZ0, wellX1 - X0, 0.1, y2 - 0.2, y2 + 1.1); F.box(wellX1 - X0, 1.05, 0.05, M.glass, (X0 + wellX1) / 2, y2 + 0.52, stZ0);
  // walls and ceiling of the hall
  F.box(hallW, 0.14, hallD, M.ceil, hcx, g0 + 12.2, hcz);
  F.box(hallW, 12.2 - 7.5, 0.2, M.wall, hcx, (y2 + g0 + 12.2) / 2, HALL.z0); F.col(P, hcx, HALL.z0, hallW, 0.3, y2 - 1, g0 + 13);
  F.box(hallW, 12.2 - 7.5, 0.2, M.wall, hcx, (y2 + g0 + 12.2) / 2, HALL.z1); F.col(P, hcx, HALL.z1, hallW, 0.3, y2 - 1, g0 + 13);
  F.box(0.15, 12.2 - 7.5, hallD, M.wall, X0 + 0.02, (y2 + g0 + 12.2) / 2, hcz);
  // [v4:polish3] recessed ceiling panels in their frames (the bare emissive dashes floated under the ceiling)
  for (let z = HALL.z0 + 4; z < HALL.z1; z += 6) for (const x of [4, 12]) { F.box(1.6, 0.06, 0.62, M.steel, x, g0 + 12.1, z); F.box(1.44, 0.04, 0.48, M.lamp, x, g0 + 12.07, z); }
  // the gallery glass over the landing floor: tall panes in steel mullions, a hand rail, a low sill
  F.col(P, HALL.x1, hcz, 0.3, hallD, y2 - 1, g0 + 13);
  F.box(0.05, 3.6, hallD - 0.4, M.glass, HALL.x1, y2 + 2.3, hcz);
  for (let z = HALL.z0; z <= HALL.z1 + 0.01; z += 3.25) F.box(0.12, 3.8, 0.1, M.steel, HALL.x1, y2 + 2.3, z);
  F.box(0.3, 0.5, hallD, M.wall2, HALL.x1, y2 + 0.25, hcz);
  F.box(0.1, 0.07, hallD, M.rail, HALL.x1 - 0.4, y2 + 1.05, hcz);
  F.box(0.3, 1.9, hallD, M.wall2, HALL.x1, g0 + 12.2 - 0.9, hcz);
  // ---- the three-screen theatre at the north end: a longline tuna boat at night, hauling the line
  const theatre = (k) => textTex(ctx, 'mkt-theatre-' + k, 768, 432, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#1d2a4e'); sky.addColorStop(0.55, '#34507e'); sky.addColorStop(0.56, '#1a3558'); sky.addColorStop(1, '#0f2240');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.8)'; for (let i = 0; i < 40; i++) g.fillRect((i * 137 + k * 91) % w, (i * 53) % (h * 0.45), 2, 2);
    g.strokeStyle = 'rgba(160,200,240,.35)'; g.lineWidth = 3; for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(0, h * 0.6 + i * 18); g.bezierCurveTo(w * 0.3, h * 0.58 + i * 18, w * 0.6, h * 0.64 + i * 18, w, h * 0.6 + i * 18); g.stroke(); }
    if (k === 1) {   // the longliner (近海マグロはえ縄船): white hull, deck lights, the line over the side
      g.fillStyle = '#f2f2ee'; g.beginPath(); g.moveTo(w * 0.2, h * 0.56); g.lineTo(w * 0.78, h * 0.56); g.lineTo(w * 0.72, h * 0.68); g.lineTo(w * 0.25, h * 0.68); g.closePath(); g.fill();
      g.fillStyle = '#c8453a'; g.fillRect(w * 0.25, h * 0.655, w * 0.47, h * 0.025);
      g.fillStyle = '#e9ecef'; g.fillRect(w * 0.42, h * 0.42, w * 0.18, h * 0.14); g.fillStyle = '#23304c'; g.fillRect(w * 0.44, h * 0.45, w * 0.14, h * 0.04);
      g.fillStyle = '#ffe9a8'; for (const x of [0.3, 0.5, 0.66]) { g.beginPath(); g.arc(w * x, h * 0.4, 7, 0, Math.PI * 2); g.fill(); }
      g.strokeStyle = '#d7dde5'; g.lineWidth = 2; g.beginPath(); g.moveTo(w * 0.24, h * 0.6); g.quadraticCurveTo(w * 0.1, h * 0.75, 0, h * 0.72); g.stroke();
    } else {
      g.fillStyle = '#e8b04a'; for (let i = 0; i < 5; i++) { const x = (k === 0 ? w * 0.15 : w * 0.25) + i * w * 0.14; g.beginPath(); g.arc(x, h * 0.62 + Math.sin(i) * 6, 7, 0, Math.PI * 2); g.fill(); g.strokeStyle = 'rgba(230,236,240,.7)'; g.beginPath(); g.moveTo(x, h * 0.62); g.lineTo(x + 8, h * 0.95); g.stroke(); }
      if (k === 2) { g.fillStyle = '#9fb2c8'; g.beginPath(); g.ellipse(w * 0.6, h * 0.82, w * 0.16, h * 0.035, -0.1, 0, Math.PI * 2); g.fill(); g.beginPath(); g.moveTo(w * 0.44, h * 0.82); g.lineTo(w * 0.33, h * 0.8); g.lineTo(w * 0.44, h * 0.81); g.fill(); }
    }
    g.fillStyle = 'rgba(255,255,255,.92)'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    const cap = ['近海マグロはえ縄漁', 'Longline tuna fishing', '夜明けの揚げ縄'][k]; T.fitText(g, cap, 26, h - 24, w - 52, 34, k === 1 ? FN.en : FN.sans, 700);
  });
  const scrY = y2 + 2.7;
  [-1, 0, 1].forEach((k, i) => {
    const m = ctx.mat.emissive('#ffffff', 1.05, { map: theatre(i) });
    const x = hcx + k * 5.4, z = HALL.z0 + 0.9 + Math.abs(k) * 0.9;
    const scr = F.plane(5.2, 2.93, m, x, scrY, z, k * -0.32);
    void scr;
    F.box(5.4, 3.1, 0.1, M.dark, x - Math.sin(k * -0.32) * 0.06, scrY, z - Math.cos(k * -0.32) * 0.06, { ry: k * -0.32 });
  });
  for (let row = 0; row < 3; row++) for (const x of [hcx - 4.5, hcx, hcx + 4.5]) { const z = HALL.z0 + 6.5 + row * 2.2; F.box(3.2, 0.44, 0.5, M.bench, x, y2 + 0.22, z); F.col(P, x, z, 3.3, 0.6, y2 - 0.3, y2 + 0.5); }
  const thSign = textTex(ctx, 'mkt-hall', 1024, 160, (g, w, h) => { g.fillStyle = '#2f5f9c'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; T.fitText(g, '水産情報等発信施設  3面シアター', w / 2, h * 0.42, w * 0.92, 70, FN.sans, 900); g.globalAlpha = .8; T.fitText(g, 'Fisheries information hall · 3-screen theatre', w / 2, h * 0.8, w * 0.8, 34, FN.en, 600); });
  F.plane(6.4, 1.0, ctx.mat.toon('#ffffff', { map: thSign, paint: 0.01 }), hcx, y2 + 4.6, HALL.z0 + 0.2);
  // ---- the electric forklift of the auction simulation, on a low stage with its sign
  const fz = 31, fx = 11;
  F.box(4.2, 0.18, 5.4, M.wall2, fx, y2 + 0.09, fz);
  F.col(P, fx, fz, 4.2, 5.4, y2 - 0.3, y2 + 2.4);
  const fk = new THREE.Group(); fk.position.set(fx, y2 + 0.18, fz); fk.rotation.y = 0.4; F.g.add(fk);
  const fb = (wd, h, d, mat, x, y, z) => F.box(wd, h, d, mat, x, y, z, { parent: fk });
  fb(1.1, 0.9, 1.9, M.fork, 0, 0.75, -0.1); fb(1.05, 0.55, 0.5, M.forkDark, 0, 0.55, -1.05);    // body, counterweight
  fb(0.9, 0.12, 0.6, M.forkDark, 0, 1.3, 0.1);                                                  // seat
  for (const s of [-1, 1]) { fb(0.07, 2.1, 0.07, M.forkDark, s * 0.5, 1.2, -0.45); fb(0.07, 2.1, 0.07, M.forkDark, s * 0.5, 1.2, 0.55); }
  fb(1.1, 0.06, 1.1, M.forkDark, 0, 2.25, 0.05);                                                // overhead guard
  for (const s of [-1, 1]) { fb(0.1, 2.2, 0.1, M.steel, s * 0.3, 1.2, 0.95); fb(0.12, 0.05, 1.1, M.steel, s * 0.3, 0.1, 1.5); }   // mast + forks
  for (const [x, z] of [[-0.55, 0.6], [0.55, 0.6], [-0.55, -0.8], [0.55, -0.8]]) { const wh = new THREE.Mesh(ctx.geo.G.cyl(12), M.boot); wh.position.set(x, 0.22, z); wh.scale.set(0.44, 0.2, 0.44); wh.rotation.set(0, 0, Math.PI / 2); fk.add(wh); }
  const fkSign = textTex(ctx, 'mkt-fork', 512, 256, (g, w, h) => { g.fillStyle = '#fbf7ee'; g.fillRect(0, 0, w, h); g.fillStyle = '#e0703f'; g.fillRect(0, 0, w, 16); g.fillStyle = '#2d3350'; g.textAlign = 'center'; g.textBaseline = 'middle'; T.fitText(g, '電動フォークリフト', w / 2, 80, w * 0.9, 50, FN.sans, 900); g.fillStyle = '#6b6f86'; T.fitText(g, '市場の仕事を体験', w / 2, 150, w * 0.9, 34, FN.sans, 700); T.fitText(g, 'Electric forklift · market work', w / 2, 205, w * 0.9, 26, FN.en, 500); });
  F.box(0.06, 1.1, 0.06, M.steel, fx - 2.4, y2 + 0.55, fz + 2.4);
  F.plane(1.2, 0.6, ctx.mat.toon('#ffffff', { map: fkSign, paint: 0.01 }), fx - 2.4, y2 + 1.35, fz + 2.44);
  // ---- panels on the catch along the land-side wall (real claims only: kesennuma-uoichiba.jp, the city)
  const PANELS = [
    ['生鮮カツオ', '水揚げ日本一', 'Fresh skipjack: the most landed in Japan', '#2f5f9c', 'katsuo'],
    ['メカジキ', '近海はえ縄の主役', 'Swordfish: the longliners’ catch', '#3f4a66', 'kajiki'],
    ['サメ', 'ふかひれの港', 'Sharks: the shark-fin port', '#56677a', 'same'],
    ['サンマ', '秋の棒受網', 'Pacific saury: the autumn catch', '#4a78a0', 'sanma'],
    ['マグロ', 'はえ縄・まき網', 'Tuna: longline and purse seine', '#8e4540', 'maguro'],
  ];
  PANELS.forEach(([ja, sub, en, col, kind], i) => {
    const tx = textTex(ctx, 'mkt-panel-' + kind, 512, 640, (g, w, h) => {
      g.fillStyle = '#fbf7ee'; g.fillRect(0, 0, w, h); g.fillStyle = col; g.fillRect(0, 0, w, 150);
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; T.fitText(g, ja, w / 2, 62, w * 0.86, 72, FN.sans, 900); T.fitText(g, sub, w / 2, 122, w * 0.86, 34, FN.sans, 700);
      // the fish, drawn: a long body, a tail, and the kind's mark (a sword, stripes, a tall fin)
      const cy = 330; g.fillStyle = col; g.beginPath(); g.ellipse(w / 2, cy, 170, kind === 'sanma' ? 22 : kind === 'same' ? 46 : 58, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(w / 2 - 160, cy); g.lineTo(w / 2 - 230, cy - 60); g.lineTo(w / 2 - 215, cy); g.lineTo(w / 2 - 230, cy + 60); g.closePath(); g.fill();
      if (kind === 'kajiki') { g.beginPath(); g.moveTo(w / 2 + 160, cy - 8); g.lineTo(w / 2 + 250, cy - 2); g.lineTo(w / 2 + 160, cy + 6); g.fill(); }
      if (kind === 'katsuo') { g.strokeStyle = '#e8edf2'; g.lineWidth = 5; for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(w / 2 - 90 + k * 50, cy + 10); g.lineTo(w / 2 - 60 + k * 50, cy + 40); g.stroke(); } }
      if (kind === 'same') { g.beginPath(); g.moveTo(w / 2 - 20, cy - 40); g.lineTo(w / 2 + 20, cy - 110); g.lineTo(w / 2 + 50, cy - 40); g.fill(); }
      g.fillStyle = '#fff'; g.beginPath(); g.arc(w / 2 + 120, cy - 10, 8, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#2d3350'; T.fitText(g, en, w / 2, 520, w * 0.9, 30, FN.en, 600);
      g.fillStyle = col; g.fillRect(40, h - 40, w - 80, 6);
    });
    const z = HALL.z0 + 20 + i * 7.2;
    if (z > stZ0 - 1 && z < stZ1 + 1) return;
    F.plane(2.2, 2.75, ctx.mat.toon('#ffffff', { map: tx, paint: 0.01 }), X0 + 0.12, y2 + 1.9, z, Math.PI / 2);
  });
  for (const z of [49, 55]) { F.box(0.5, 0.44, 2.6, M.bench, HALL.x1 - 2.2, y2 + 0.22, z); F.col(P, HALL.x1 - 2.2, z, 0.6, 2.7, y2 - 0.3, y2 + 0.5); }
  // [v4:polish3] visitors: a family and a school group at the gallery glass, two watching the theatre, a guide
  const faceGlass = Math.PI / 2;   // local +x (toward the landing floor)
  for (const [z, o] of [[24, { top: '#d9785a', legs: '#3b4a6a' }], [25.1, { top: '#f0e3c0', legs: '#4a4a52', h: 1.2, hair: '#3a2c22' }], [27.8, { top: '#7a9cc9', legs: '#2f3340', h: 1.75 }], [46, { top: '#2f3e66', legs: '#2f3e66', h: 1.45, cap: '#f1d24a' }], [46.9, { top: '#2f3e66', legs: '#2f3e66', h: 1.42, cap: '#f1d24a' }], [47.9, { top: '#2f3e66', legs: '#2f3e66', h: 1.47, cap: '#f1d24a' }], [52.5, { top: '#e8e2d2', legs: '#6b5a48', h: 1.62, hair: '#8a8a8a' }]]) person(ctx, F.g, HALL.x1 - 0.9, y2, z, faceGlass + (z % 2 - 0.5) * 0.3, o);
  person(ctx, F.g, hcx - 3, y2, HALL.z0 + 8.8, Math.PI, { top: '#b85a6a', legs: '#3b3f4a' }); person(ctx, F.g, hcx + 2.2, y2, HALL.z0 + 11, Math.PI, { top: '#5a7a5a', legs: '#3b3f4a', h: 1.74 });
  person(ctx, F.g, HALL.x1 - 2.6, y2, 44.2, -Math.PI / 2 + 0.4, { top: '#1f3a68', legs: '#1f3a68', cap: '#1f3a68', arms: true, hold: '#f4f1e6' });   // the guide
  person(ctx, F.g, 8.2, g0, 27, 2.6, { top: '#c9a24a', legs: '#3b3f4a' });   // in the lobby, by the guide board

  // ---------------------------------------------------------------- 1F landing floor seen from the gallery and the lobby
  const fcx = (FLOOR.x0 + FLOOR.x1) / 2, fcz = (FLOOR.z0 + FLOOR.z1) / 2;
  F.box(FLOOR.x1 - FLOOR.x0, 0.2, FLOOR.z1 - FLOOR.z0, M.wetFloor, fcx, g0 - 0.08, fcz);
  F.box(FLOOR.x1 - FLOOR.x0, 0.14, FLOOR.z1 - FLOOR.z0, M.ceil, fcx, g0 + 12.2, fcz);
  F.box(FLOOR.x1 - FLOOR.x0, 12.2, 0.2, M.floorWall, fcx, g0 + 6.1, FLOOR.z0 - 0.2);
  F.box(FLOOR.x1 - FLOOR.x0, 12.2, 0.2, M.floorWall, fcx, g0 + 6.1, FLOOR.z1 + 0.1);
  F.box(0.2, 12.2, FLOOR.z1 - FLOOR.z0, M.floorWall, FLOOR.x1 + 0.1, g0 + 6.1, fcz);
  F.box(0.2, 7.2, FLOOR.z1 - FLOOR.z0 + 0.4, M.floorWall, LOBBY.x1 + 0.1, g0 + 3.6 + 0.8, fcz);   // under the gallery, behind the lobby glass line
  // [v4:polish3] the roof structure: steel trusses across the hall every 6 m (top and bottom chords, diagonals), and
  // high-bay lamps hanging from them on rods (the bare LED dashes floated under a blank ceiling)
  for (let z = FLOOR.z0 + 3; z < FLOOR.z1; z += 6) {
    F.box(FLOOR.x1 - FLOOR.x0, 0.28, 0.22, M.steel, fcx, g0 + 11.9, z);
    F.box(FLOOR.x1 - FLOOR.x0, 0.22, 0.2, M.steel, fcx, g0 + 10.7, z);
    for (let x = FLOOR.x0 + 1.5, k = 0; x < FLOOR.x1 - 1; x += 3, k++) F.box(0.1, 1.5, 0.1, M.steel, x, g0 + 11.3, z, { rz: k % 2 ? 0.7 : -0.7 });
    for (let x = FLOOR.x0 + 4.5; x < FLOOR.x1 - 2; x += 9) {
      F.box(0.04, 1.4, 0.04, M.dark, x, g0 + 9.9, z);
      F.mesh(ctx.geo.G.cyl(12), M.dark, x, g0 + 9.05, z, { scale: [0.62, 0.34, 0.62] });
      F.mesh(ctx.geo.G.cyl(12), M.led, x, g0 + 8.86, z, { scale: [0.5, 0.04, 0.5] });
    }
  }
  // green painted lanes and the numbered blocks of the auction (white lines)
  for (let x = FLOOR.x0 + 3; x < FLOOR.x1 - 2; x += 9) F.box(0.15, 0.02, FLOOR.z1 - FLOOR.z0 - 3, M.white, x, g0 + 0.03, fcz);
  // [v4:polish3] the floor reads as a working floor: yellow safety lines along the quay-side forklift lane, drainage
  // gutters with steel grates, darker wet patches round the rows (the landing floor is hosed down all morning)
  const yellow = ctx.mat.toon('#e3c23a', { paint: 0.02 }), grate = ctx.mat.toon('#3d434c', { paint: 0 }), wet = ctx.mat.toon('#56666e', { paint: 0.06 });
  for (const x of [FLOOR.x1 - 9.2, FLOOR.x1 - 2.2]) F.box(0.18, 0.02, FLOOR.z1 - FLOOR.z0 - 2, yellow, x, g0 + 0.032, fcz);
  for (let x = FLOOR.x0 + 7.5; x < FLOOR.x1 - 10; x += 9) F.box(0.35, 0.025, FLOOR.z1 - FLOOR.z0 - 2, grate, x, g0 + 0.03, fcz);
  { const rw = ctx.rng('explore-marketC-wet'); for (let k = 0; k < 26; k++) F.box(2 + rw() * 4, 0.012, 1.2 + rw() * 3, wet, FLOOR.x0 + 2 + rw() * (FLOOR.x1 - FLOOR.x0 - 10), g0 + 0.028, FLOOR.z0 + 2 + rw() * (FLOOR.z1 - FLOOR.z0 - 4), { ry: rw() * 3 }); }
  // swordfish (メカジキ) in rows on blue sheets, tuna nearer the quay; each with its tail tag
  const r = ctx.rng('explore-marketC-floor');
  const kajiki = (x, z, rot, s) => {
    const q = new THREE.Group(); q.position.set(x, g0 + 0.05, z); q.rotation.y = rot; F.g.add(q);
    const add = (geo, mat, px, py, pz, sx, sy, sz, rx = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.scale.set(sx, sy, sz); m.rotation.set(rx, 0, rz); m.castShadow = false; m.receiveShadow = false; q.add(m); };
    add(ctx.geo.G.sphere(12), M.fishTop, 0, 0.26 * s, 0, 0.62 * s, 0.34 * s, 2.3 * s);
    add(ctx.geo.G.sphere(10), M.fishBelly, 0.12 * s, 0.2 * s, 0, 0.45 * s, 0.24 * s, 2.1 * s);
    add(new THREE.ConeGeometry(0.07, 1, 6), M.fin, 0, 0.3 * s, 1.6 * s, s, 1.1 * s, s, Math.PI / 2);
    add(ctx.geo.G.box(), M.fin, 0, 0.3 * s, -1.25 * s, 0.05 * s, 0.9 * s, 0.35 * s);
    add(ctx.geo.G.box(), M.white, 0.25 * s, 0.35 * s, -1.0 * s, 0.02, 0.12, 0.08);
  };
  const tuna = (x, z, rot, s) => {
    const q = new THREE.Group(); q.position.set(x, g0 + 0.05, z); q.rotation.y = rot; F.g.add(q);
    const add = (geo, mat, px, py, pz, sx, sy, sz) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.scale.set(sx, sy, sz); m.castShadow = false; m.receiveShadow = false; q.add(m); };
    add(ctx.geo.G.sphere(12), M.tuna, 0, 0.3 * s, 0, 0.7 * s, 0.5 * s, 1.5 * s);
    add(ctx.geo.G.sphere(10), M.fishBelly, 0.18 * s, 0.24 * s, 0, 0.45 * s, 0.34 * s, 1.35 * s);
    add(ctx.geo.G.box(), M.fin, 0, 0.3 * s, -0.9 * s, 0.05 * s, 0.7 * s, 0.3 * s);
  };
  let nFish = 0;
  for (let row = 0; row < 4; row++) {
    const x = FLOOR.x0 + 6 + row * 9;
    // [v4:polish2] blue sheets at true scale: the standard 3.6 x 5.4 m ブルーシート, laid end to end with gaps, each a
    // little askew (one 40 m strip read as a painted stripe)
    for (let z0 = FLOOR.z0 + 1.6; z0 + 5.4 < FLOOR.z1 - 0.5; z0 += 5.7) F.box(3.6, 0.02, 5.4, M.sheet, x + (r() - 0.5) * 0.25, g0 + 0.035, z0 + 2.7, { ry: (r() - 0.5) * 0.04 });
    for (let z = FLOOR.z0 + 3; z < FLOOR.z1 - 2; z += 1.25) { if (row < 3) kajiki(x + (r() - 0.5) * 0.3, z, Math.PI / 2 + (r() - 0.5) * 0.08, 0.85 + r() * 0.25); else tuna(x + (r() - 0.5) * 0.3, z, Math.PI / 2 + (r() - 0.5) * 0.1, 0.8 + r() * 0.35); nFish++; }
  }
  // blue tubs and a crew in white caps and aprons between the rows; two electric forklifts parked
  for (let k = 0; k < 14; k++) F.box(1.1, 0.75, 1.1, M.tub, FLOOR.x1 - 4 - (k % 2) * 1.3, g0 + 0.38, FLOOR.z0 + 3 + Math.floor(k / 2) * 3.2);
  const worker = (x, z, ry) => {
    const q = new THREE.Group(); q.position.set(x, g0, z); q.rotation.y = ry; F.g.add(q);
    const add = (geo, mat, px, py, pz, sx, sy, sz) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.scale.set(sx, sy, sz); m.castShadow = false; m.receiveShadow = false; q.add(m); };
    add(ctx.geo.G.cyl(10), M.boot, 0, 0.25, 0, 0.34, 0.5, 0.28);
    add(ctx.geo.G.cyl(10), M.apron, 0, 0.85, 0, 0.42, 0.75, 0.3);
    add(ctx.geo.G.cyl(10), M.white, 0, 1.3, 0, 0.44, 0.3, 0.34);
    add(ctx.geo.G.sphere(10), M.skin, 0, 1.56, 0, 0.21, 0.24, 0.21);
    add(ctx.geo.G.cyl(10), M.white, 0, 1.7, 0, 0.24, 0.1, 0.24);
  };
  for (let k = 0; k < 9; k++) worker(FLOOR.x0 + 10.5 + (k % 3) * 9, FLOOR.z0 + 8 + Math.floor(k / 3) * 14 + r() * 3, r() * 6.28);
  for (const [x, z] of [[FLOOR.x1 - 7, FLOOR.z1 - 6], [FLOOR.x1 - 7, FLOOR.z0 + 30]]) { F.box(1.0, 1.0, 1.8, M.fork, x, g0 + 0.7, z); F.box(1.0, 2.0, 0.08, M.forkDark, x, g0 + 1.2, z + 0.95); }
  // [v4:polish3] stacks of white styrofoam fish boxes (発泡スチロール) on pallets along the quay-side lane, the auction
  // crew (caps, clipboards) walking the rows with the buyers (rubber boots, 帽子 with their badge), a hand bell stand
  const styro = ctx.mat.toon('#f4f4ef', { paint: 0.02 }), lid = ctx.mat.toon('#5b8fd1', { paint: 0.02 }), pallet = ctx.mat.toon('#9a7a55', { paint: 0.04 });
  for (let k = 0; k < 8; k++) {
    const z = FLOOR.z0 + 4 + k * 6.2, x = FLOOR.x1 - 5.6;
    F.box(1.2, 0.14, 1.0, pallet, x, g0 + 0.07, z);
    const nH = 3 + (k * 7) % 4;
    for (let j = 0; j < nH; j++) { F.box(1.1, 0.28, 0.9, styro, x, g0 + 0.3 + j * 0.3, z); F.box(1.12, 0.03, 0.92, j === nH - 1 ? lid : styro, x, g0 + 0.44 + j * 0.3, z); }
  }
  const crew = [['#2d3a5c', '#1f2533', '#f2f2ee', true, '#f4f1e6'], ['#6f86a8', '#3b3f4a', '#f2f2ee', false, null], ['#3f5f4a', '#2e2a28', '#d8c65a', true, '#f4f1e6'], ['#8e4540', '#2e2a28', '#2d3a5c', false, null]];
  for (let k = 0; k < 16; k++) {
    const [tp, lg, cp, arms, hold] = crew[k % crew.length];
    person(ctx, F.g, FLOOR.x0 + 1.8 + (k % 4) * 9 + (r() - 0.5) * 1.2, g0, FLOOR.z0 + 5 + Math.floor(k / 4) * 12 + r() * 6, r() * 6.28, { top: tp, legs: lg, cap: cp, arms, hold, h: 1.6 + r() * 0.15 });
  }

  // [v4:polish2] the gallery pose stands in the middle of a pane (mullions every 3.25 m from z 8: 37.25 | 40.5), so both
  // mullions sit ~49 deg off the view axis, out of the frame (at z 40 the 40.5 mullion ran down the middle of the view)
  const [ex, ez] = F.w(-3.2, doorZ), [ix, iz] = F.w(HALL.x1 - 1.4, 38.875);
  const yawIn = +(Math.atan2(-Math.cos(rotY), Math.sin(rotY)) * 180 / Math.PI).toFixed(1);   // facing local +x (into the hall)
  const yawGal = yawIn;
  return {
    id: 'marketC', ja: '気仙沼市魚市場 C棟 見学通路', en: 'Fish market C hall: visitors’ gallery', g0, y2, removedWallColliders: removed.length, fish: nFish,
    entrance: { x: +ex.toFixed(1), z: +ez.toFixed(1), yaw: yawIn, pitch: 2 },
    inside: { x: +ix.toFixed(1), z: +iz.toFixed(1), y: y2, yaw: yawGal, pitch: -18 },
    bounds: { rotY, O, x: [X0, HALL.x1], z: [HALL.z0, HALL.z1] },
  };
}

// ====================================================================================================== 男山本店 魚町店舗
function buildOtokoyama(ctx, root) {
  const L = ctx.L, P = ctx.physics, T = ctx.tex, FN = T.FONTS;
  const id = [...EXPLORE_LOTS][0], lot = L.lotById(id);
  if (!lot) return null;
  const f = L.lotFrame(lot);
  const w = lot.obb.w - 0.3, d = lot.obb.d - 0.3;
  const gy = Math.max(lot.groundY, L.heightAt(f.x, f.z)) + 0.12;
  const F = frame(ctx, root, f.x, 0, f.z, f.rotY);   // local +z = the street, the building spans z in [-d, 0]
  const zc = -d / 2 - 0.15;
  const H1 = 3.7, H2 = 3.2, H3 = 3.2, top = gy + H1 + H2 + H3;
  // 洗い出し (washed aggregate): a warm grey with fine pebbles
  const aggr = T.draw(256, 256, (g, W, H) => {
    g.fillStyle = '#bdb4a4'; g.fillRect(0, 0, W, H);
    const rr = ctx.rng('otokoyama-aggr');
    for (let i = 0; i < 2600; i++) { const s = 0.8 + rr() * 2.2; g.fillStyle = rr() < 0.5 ? 'rgba(90,82,72,.28)' : 'rgba(245,240,230,.35)'; g.fillRect(rr() * W, rr() * H, s, s); }
  }, { key: 'explore-int-araidashi', repeat: [1, 1], anisotropy: 8 });
  aggr.wrapS = aggr.wrapT = THREE.RepeatWrapping;
  const M = {
    wall: ctx.mat.toon('#ffffff', { map: aggr, paint: 0.02 }), band: ctx.mat.toon('#d3cab9', { paint: 0.02 }), dark: ctx.mat.toon('#4f5b55', { paint: 0 }), wood: ctx.mat.toon('#7a5236', { paint: 0.04 }),
    woodL: ctx.mat.toon('#b58a5e', { paint: 0.04 }), floor: ctx.mat.toon('#a67c55', { paint: 0.05 }), ceil: ctx.mat.toon('#f1ebdf', { paint: 0.01 }), plaster: ctx.mat.toon('#efe7d8', { paint: 0.02 }),
    roof: ctx.mat.toon(lot.roof.color || '#98b0b4', { paint: 0.03 }), glass: ctx.mat.glass ? ctx.mat.glass({ tint: '#cfe0e6' }) : new THREE.MeshBasicMaterial({ color: '#cfe0e6', transparent: true, opacity: 0.25 }),
    warm: ctx.mat.emissive('#ffe2b0', 1.05), lamp: ctx.mat.emissive('#fff0d0', 1.4), straw: ctx.mat.toon('#d8c48a', { paint: 0.05 }), green: ctx.mat.toon('#3e6b4c', { paint: 0.03 }), sugi: ctx.mat.toon('#6f7a3c', { paint: 0.06 }),
  };
  // ---- walls (a 0.25 m shell), with the shop door opening in the 1F front
  const doorW = 2.2;
  const wallBox = (wd, h, dd, x, y, z) => F.box(wd, h, dd, M.wall, x, y, z, { shadow: true });
  wallBox(w, top - gy, 0.25, 0, (gy + top) / 2, -d + 0.125 - 0.15);                  // back
  for (const s of [-1, 1]) wallBox(0.25, top - gy, d, s * (w / 2 - 0.125), (gy + top) / 2, zc);   // sides
  // front: piers either side of the shop front, the upper storeys solid with windows
  const pier = (w - doorW - 4.2) / 2;
  for (const s of [-1, 1]) wallBox(0.9, H1, 0.3, s * (w / 2 - 0.45), gy + H1 / 2, -0.3);
  wallBox(w, H2 + H3, 0.3, 0, gy + H1 + (H2 + H3) / 2, -0.3);
  wallBox(w, 0.7, 0.3, 0, gy + H1 - 0.35, -0.3);
  void pier;
  // 2F / 3F windows: three tall bays per floor, green-grey frames, warm light behind at night
  for (const [fy, fh] of [[gy + H1, H2], [gy + H1 + H2, H3]]) for (const bx of [-w / 3, 0, w / 3]) {
    F.box(1.1, 1.85, 0.08, M.warm, bx, fy + fh / 2 + 0.1, -0.12);
    F.box(1.24, 2.0, 0.1, M.dark, bx, fy + fh / 2 + 0.1, -0.1);
    F.box(1.06, 1.8, 0.04, M.glass, bx, fy + fh / 2 + 0.1, -0.02);
    F.box(0.05, 1.8, 0.06, M.dark, bx, fy + fh / 2 + 0.1, 0.0);
    F.box(1.3, 0.1, 0.22, M.band, bx, fy + fh / 2 - 0.86, 0.02);
  }
  // moulded bands (蛇腹) at every floor and pilasters up the front into the parapet
  for (const y of [gy + H1, gy + H1 + H2, top]) { F.box(w + 0.3, 0.22, 0.42, M.band, 0, y, -0.1); F.box(w + 0.18, 0.1, 0.34, M.band, 0, y + 0.16, -0.1); for (const s of [-1, 1]) F.box(0.42, 0.22, d + 0.3, M.band, s * (w / 2), y, zc); }
  for (const px of [-w / 2 + 0.3, -w / 6, w / 6, w / 2 - 0.3]) F.box(0.45, H2 + H3 + 1.5, 0.2, M.band, px, gy + H1 + (H2 + H3 + 1.5) / 2, 0.05);
  // parapet: a balustrade between the pilasters and the gable over the middle bay with the brewery's name
  F.box(w, 1.2, 0.25, M.wall, 0, top + 0.6, -0.3);
  for (let x = -w / 2 + 0.7; x < w / 2 - 0.5; x += 0.42) if (Math.abs(x) > 1.4) F.box(0.12, 0.5, 0.12, M.band, x, top + 0.55, 0.0);
  F.box(w, 0.14, 0.34, M.band, 0, top + 1.25, -0.2);
  const gable = new THREE.Shape([new THREE.Vector2(-1.5, 0), new THREE.Vector2(1.5, 0), new THREE.Vector2(0, 1.25)]);
  F.mesh(new THREE.ExtrudeGeometry(gable, { depth: 0.3, bevelEnabled: false }), M.band, 0, top + 1.25, -0.35);
  const nameTex = T.draw(512, 256, (g, W, H) => { g.fillStyle = '#3b3346'; g.fillRect(0, 0, W, H); g.fillStyle = '#e8d49a'; g.textAlign = 'center'; g.textBaseline = 'middle'; T.fitText(g, '男山本店', W / 2, H * 0.52, W * 0.88, 150, FN.serif, 900); }, { key: 'explore-int-otoko-name', anisotropy: 8 });
  F.plane(2.6, 1.3, ctx.mat.toon('#ffffff', { map: nameTex, paint: 0.01, nightGlow: 0.5 }), 0, gy + H1 - 0.55 + 0.0, 0.0);
  const gTex = T.draw(256, 128, (g, W, H) => { g.fillStyle = '#d3cab9'; g.fillRect(0, 0, W, H); g.fillStyle = '#5a4a3c'; g.textAlign = 'center'; g.textBaseline = 'middle'; T.fitText(g, '男山', W / 2, H * 0.6, W * 0.7, 80, FN.serif, 900); }, { key: 'explore-int-otoko-gable', anisotropy: 8 });
  F.plane(1.1, 0.55, ctx.mat.toon('#ffffff', { map: gTex, paint: 0.01 }), 0, top + 1.62, -0.03);
  // roof (iron plate, the photo's colour) and the upper floors' slab, closed
  F.box(w, 0.2, d, M.roof, 0, top + 0.02, zc, { shadow: true });
  F.box(w - 0.5, 0.2, d - 0.5, M.ceil, 0, gy + H1 - 0.1, zc);
  // ---- the 1F shop front: timber-framed glass doors (one slid open), a 杉玉 over the door, the shop curtain rail
  for (const s of [-1, 1]) {
    F.box(0.14, H1 - 0.7, 0.14, M.wood, s * (doorW / 2 + 0.07), gy + (H1 - 0.7) / 2, -0.2);
    F.box(w / 2 - doorW / 2 - 0.95, H1 - 0.8, 0.05, M.glass, s * ((w / 2 - 0.9 + doorW / 2) / 2 + 0.02), gy + (H1 - 0.8) / 2 + 0.05, -0.25);
    F.box(0.08, H1 - 0.8, 0.08, M.wood, s * (w / 2 - 0.92), gy + (H1 - 0.8) / 2, -0.22);
  }
  F.box(doorW / 2, H1 - 0.8, 0.04, M.glass, doorW / 4 + 0.02, gy + (H1 - 0.8) / 2 + 0.05, -0.35);   // the open leaf behind the other
  F.box(w - 1.8, 0.12, 0.12, M.wood, 0, gy + H1 - 0.76, -0.2);
  F.mesh(ctx.geo.G.sphere(12), M.sugi, -doorW / 2 - 0.9, gy + H1 - 1.25, 0.25, { scale: [0.62, 0.62, 0.62] });
  F.box(0.03, 0.4, 0.03, M.dark, -doorW / 2 - 0.9, gy + H1 - 0.75, 0.25);
  // ---- inside: wooden floor, plaster walls, pendant lamps, shelves of the brewery's bottles, the tasting counter
  const iw = w - 0.5, id2 = d - 0.8, izc = -0.45 - id2 / 2;
  F.box(iw, 0.12, id2, M.floor, 0, gy - 0.06, izc);
  F.floor(P, 0, izc, iw, id2, gy);
  F.floor(P, 0, 0.6, doorW + 0.4, 1.4, gy);   // the step in at the door
  for (const s of [-1, 1]) F.box(0.05, H1 - 0.2, id2, M.plaster, s * (iw / 2 - 0.02), gy + (H1 - 0.2) / 2, izc);
  F.box(iw, H1 - 0.2, 0.05, M.plaster, 0, gy + (H1 - 0.2) / 2, -d + 0.3);
  for (const z of [izc - id2 / 4, izc + id2 / 4]) for (const x of [-iw / 4, iw / 4]) { F.box(0.02, 0.6, 0.02, M.dark, x, gy + H1 - 0.55, z); F.box(0.34, 0.22, 0.34, M.lamp, x, gy + H1 - 0.95, z); }
  const bottle = (x, y, z, col, lab) => { F.box(0.085, 0.3, 0.085, col, x, y + 0.15, z); F.box(0.04, 0.09, 0.04, col, x, y + 0.34, z); F.box(0.09, 0.1, 0.02, lab, x, y + 0.14, z + 0.045); };
  const BOT = [ctx.mat.toon('#2f5f3d', { paint: 0 }), ctx.mat.toon('#2b4f7a', { paint: 0 }), ctx.mat.toon('#6b4a2a', { paint: 0 }), ctx.mat.toon('#e9e6dc', { paint: 0 })];
  const LAB = [ctx.mat.toon('#f0ead8', { paint: 0 }), ctx.mat.toon('#3f6fb5', { paint: 0 }), ctx.mat.toon('#b8453a', { paint: 0 })];
  // back wall shelves, floor to near the ceiling
  for (let sh = 0; sh < 5; sh++) {
    const y = gy + 0.35 + sh * 0.55;
    F.box(iw - 0.6, 0.04, 0.36, M.woodL, 0, y, -d + 0.52);
    for (let k = 0; k < Math.floor((iw - 0.8) / 0.16); k++) bottle(-iw / 2 + 0.45 + k * 0.16, y + 0.02, -d + 0.5, BOT[(k + sh) % 4], LAB[(k * 3 + sh) % 3]);
  }
  F.col(P, 0, -d + 0.52, iw, 0.45, gy - 0.5, gy + 3);
  // brand boards over the shelves: the brewery's labels
  const brandTex = T.draw(1024, 160, (g, W, H) => {
    g.fillStyle = '#3b3346'; g.fillRect(0, 0, W, H); g.fillStyle = '#f3e9cf'; g.textBaseline = 'middle'; g.textAlign = 'center';
    [['蒼天伝', FN.brush], ['美禄', FN.brush], ['男山', FN.serif]].forEach(([t, f], i) => T.fitText(g, t, W * (i + 0.5) / 3, H / 2, W / 3 - 40, 104, f, 900));
  }, { key: 'explore-int-otoko-brands', anisotropy: 8 });
  // [v4:polish2] the board sits right under the ceiling (H1 - 0.2; the old 1.2 m one ran up into it) and is 3.5 m wide,
  // so the back pair of pendant lamps (x = +-iw/4, 3 m in front of it) no longer hangs across 蒼天伝 / 男山 from the door,
  // and it clears the top shelf of bottles (0.55 m tall, 3.5 m wide)
  { const bh = 0.55, by = gy + H1 - 0.23 - bh / 2; F.plane(bh * 6.4, bh, ctx.mat.toon('#ffffff', { map: brandTex, paint: 0.01 }), 0, by, -d + 0.34); }
  // the tasting counter (試飲) on the right, small cups on a tray, a menu board
  const cx = iw / 2 - 0.9, cz = izc + 0.4;
  F.box(0.9, 1.0, 3.2, M.wood, cx, gy + 0.5, cz); F.box(1.0, 0.05, 3.3, M.woodL, cx, gy + 1.02, cz);
  F.col(P, cx, cz, 1.0, 3.3, gy - 0.5, gy + 1.1);
  for (let k = 0; k < 6; k++) F.box(0.05, 0.05, 0.05, BOT[3], cx - 0.2, gy + 1.07, cz - 1.0 + k * 0.35);
  const menuTex = T.draw(512, 384, (g, W, H) => { g.fillStyle = '#23303a'; g.fillRect(0, 0, W, H); g.fillStyle = '#f5f0e0'; g.textAlign = 'center'; g.textBaseline = 'middle'; T.fitText(g, '本日の試飲', W / 2, 70, W * 0.8, 64, FN.hand, 700); g.textAlign = 'left'; ['蒼天伝 特別純米', '美禄 純米吟醸', '男山 本醸造'].forEach((t, i) => T.fitText(g, '・' + t, 50, 170 + i * 70, W - 100, 44, FN.hand, 500)); }, { key: 'explore-int-otoko-menu', anisotropy: 8 });
  F.plane(0.8, 0.6, ctx.mat.toon('#ffffff', { map: menuTex, paint: 0.01 }), iw / 2 - 0.06, gy + 1.7, cz, -Math.PI / 2);
  // a glass fridge of cold sake on the left wall, 菰樽 (straw-wrapped barrels) by the door, a gift table
  // [v4:polish3] a glass-fronted case: the cool light panel at its back, bottles on three shelves in front of it, the
  // glass door and its steel frame (the lit panel stood in front of the bottles and read as a blank yellow board)
  F.box(0.7, 1.9, 1.8, M.dark, -iw / 2 + 0.4, gy + 0.95, izc - 0.6); F.box(0.04, 1.6, 1.6, ctx.mat.emissive('#e8f2ff', 0.9), -iw / 2 + 0.1, gy + 1.05, izc - 0.6);
  for (let k = 0; k < 3; k++) F.box(0.55, 0.03, 1.6, M.woodL, -iw / 2 + 0.42, gy + 0.28 + k * 0.5, izc - 0.6);
  for (let k = 0; k < 15; k++) bottle(-iw / 2 + 0.3 + (k % 2) * 0.18, gy + 0.3 + Math.floor(k / 5) * 0.5, izc - 1.25 + (k % 5) * 0.32, BOT[k % 3], LAB[k % 3]);
  F.box(0.03, 1.75, 1.7, M.glass, -iw / 2 + 0.77, gy + 0.98, izc - 0.6); F.box(0.05, 1.8, 0.05, M.dark, -iw / 2 + 0.78, gy + 0.98, izc - 0.6);
  F.col(P, -iw / 2 + 0.4, izc - 0.6, 0.8, 1.9, gy - 0.5, gy + 2);
  for (const [x, z] of [[-iw / 2 + 0.6, -1.3], [-iw / 2 + 0.6, -2.1]]) { F.mesh(ctx.geo.G.cyl(14), M.straw, x, gy + 0.45, z, { scale: [0.7, 0.9, 0.7] }); F.box(0.4, 0.28, 0.02, LAB[2], x + 0.36, gy + 0.5, z); ctx.physics.addCylinder(...F.w(x, z), 0.38, gy - 0.5, gy + 1); }
  F.box(1.4, 0.75, 0.8, M.woodL, -0.4, gy + 0.375, izc + 0.6); F.col(P, -0.4, izc + 0.6, 1.4, 0.8, gy - 0.5, gy + 0.8);
  for (let k = 0; k < 6; k++) F.box(0.32, 0.12, 0.22, [M.green, LAB[1], LAB[2]][k % 3], -0.9 + (k % 3) * 0.5, gy + 0.81 + Math.floor(k / 3) * 0.13, izc + 0.45 + Math.floor(k / 3) * 0.12);
  // [v4:polish3] exposed ceiling beams (the restored 1930 shop), a 杉玉 inside over the counter, the brewery's posters,
  // a shopkeeper in the brewery's 前掛け behind the tasting counter and two customers
  for (let z = -1.2; z > -d + 0.8; z -= 1.8) F.box(iw, 0.22, 0.16, M.wood, 0, gy + H1 - 0.32, z);
  F.box(0.2, 0.2, id2, M.wood, 0, gy + H1 - 0.46, izc);
  F.mesh(ctx.geo.G.sphere(12), M.sugi, cx - 0.2, gy + H1 - 0.95, cz - 1.2, { scale: [0.46, 0.46, 0.46] }); F.box(0.02, 0.4, 0.02, M.dark, cx - 0.2, gy + H1 - 0.55, cz - 1.2);
  const poster = (key, title, sub, col) => T.draw(256, 384, (g, W, H) => { g.fillStyle = '#f5efe0'; g.fillRect(0, 0, W, H); g.fillStyle = col; g.fillRect(14, 14, W - 28, H - 28); g.fillStyle = '#f5efe0'; g.textAlign = 'center'; g.textBaseline = 'middle'; T.fitText(g, title, W / 2, H * 0.42, W * 0.7, 88, FN.brush || FN.serif, 900); T.fitText(g, sub, W / 2, H * 0.8, W * 0.8, 26, FN.sans, 700); }, { key: 'explore-int-otoko-' + key, anisotropy: 8 });
  F.plane(0.6, 0.9, ctx.mat.toon('#ffffff', { map: poster('p1', '蒼天伝', '気仙沼の酒', '#2b4f7a'), paint: 0.01 }), -iw / 2 + 0.05, gy + 2.2, izc + 1.2, Math.PI / 2);
  F.plane(0.6, 0.9, ctx.mat.toon('#ffffff', { map: poster('p2', '男山', '創業 明治四十五年', '#6b2e2a'), paint: 0.01 }), iw / 2 - 0.05, gy + 2.2, izc - 1.2, -Math.PI / 2);
  const q1 = person(ctx, F.g, cx + 0.62, gy, cz - 0.3, -Math.PI / 2, { top: '#1f2f4f', legs: '#1f2f4f', hair: '#3a3a3a', arms: true });
  { const apron = ctx.mat.toon('#1f3a68', { paint: 0 }); const a = new THREE.Mesh(ctx.geo.G.box(), apron); a.position.set(0, 0.72, 0.16); a.scale.set(0.42, 0.62, 0.03); q1.add(a); }
  person(ctx, F.g, cx - 0.85, gy, cz + 0.2, Math.PI / 2, { top: '#c98a5a', legs: '#3b3f4a', hair: '#2e2622', arms: true });
  person(ctx, F.g, -0.6, gy, izc + 1.35, 0.5, { top: '#6f8a6a', legs: '#4a4a52', hair: '#9a9a9a', h: 1.58 });
  // colliders of the shell: back, sides, the front piers either side of the door
  F.col(P, 0, -d + 0.05, w, 0.4, gy - 1, top + 2);
  for (const s of [-1, 1]) F.col(P, s * (w / 2 - 0.12), zc, 0.35, d, gy - 1, top + 2);
  for (const s of [-1, 1]) F.col(P, s * ((w / 2 + doorW / 2) / 2), -0.25, w / 2 - doorW / 2, 0.4, gy - 1, top + 2);
  F.col(P, 0, -0.25, doorW, 0.4, gy + 2.95, top + 2);
  const [ox, oz] = F.w(0, 3.2), [ix, iz] = F.w(0, -1.2);
  const yawIn = f.rotY * 180 / Math.PI;   // facing local -z: from the street into the shop
  return { id: 'otokoyama', ja: '男山本店 魚町店舗', en: 'Otokoyama sake shop (Uomachi)', lot: id, w, d, top,
    entrance: { x: +ox.toFixed(1), z: +oz.toFixed(1), yaw: +yawIn.toFixed(1), pitch: 8 }, inside: { x: +ix.toFixed(1), z: +iz.toFixed(1), yaw: +yawIn.toFixed(1), pitch: -6 } };
}

export function buildInteriors(ctx, { inLot = () => false } = {}) {
  const root = new THREE.Group(); root.name = 'explore-interiors';
  const out = { list: [] };
  const KIT = { frame, person, textTex };   // [cafe-rst] the shared placement frame, figure and texture helper for the sibling module
  const builders = [['marketC', buildMarketC], ['otokoyama', buildOtokoyama]];
  if (CAFE_RST_ENABLED) builders.push(['cafeRst', (c, r) => buildCafeRst(c, r, KIT)]);
  for (const [k, fn] of builders) {
    try { const r = fn(ctx, root); if (r) { out[k] = r; out.list.push(r); } } catch (e) { console.warn('[explore] interior', k, e); out[k + 'Error'] = String(e); }
  }
  ctx.addStatic(root);
  void inLot;
  // the station's waiting hall is landmarks-B's; list it when that module publishes it
  const st = ctx.services.landmarks?.built?.station;
  const hall = st?.inside || st?.hall;
  if (hall) out.list.push({ id: 'station', ja: '気仙沼駅 待合室', en: 'Kesennuma Station waiting hall', inside: { x: hall.x, z: hall.z, y: hall.y, yaw: hall.yaw, pitch: 0 }, ...(st.front ? { entrance: { x: st.front[0], z: st.front[1], yaw: hall.yaw } } : {}), from: 'landmarks' });
  // [v4:polish1] at(x, y, z): the interior the point is in (its walls, floor to roof), or null. The POI labels hide
  // while the camera is inside one (they drew through the walls of 男山本店 and the station hall).
  const boxes = [];
  const oy = out.otokoyama, ol = oy && ctx.L.lotById(oy.lot);
  if (ol) boxes.push({ id: 'otokoyama', cx: ol.obb.cx, cz: ol.obb.cz, w: ol.obb.w, d: ol.obb.d, ux: Math.sin(ol.obb.rotY), uz: Math.cos(ol.obb.rotY), y0: -5, y1: oy.top + 1.5 });
  const mc = out.marketC?.bounds;
  if (mc) { const [a0, a1] = mc.x, [b0, b1] = mc.z, c = Math.cos(mc.rotY), s2 = Math.sin(mc.rotY); boxes.push({ id: 'marketC', local: (x, z) => { const dx = x - mc.O[0], dz = z - mc.O[1]; const lx = dx * c - dz * s2, lz = dx * s2 + dz * c; return lx > a0 && lx < a1 && lz > b0 && lz < b1; }, y0: -5, y1: (out.marketC.y2 || 10) + 8 }); }
  const cr = out.cafeRst?.bounds;   // [cafe-rst] the room: a quad in the frame of the ANCHOR face
  if (cr) boxes.push({ id: 'cafeRst', local: cr.local, y0: cr.y0, y1: cr.y1 });
  const hb = st?.hallBox;
  if (hb) boxes.push({ id: 'station', cx: hb.cx, cz: hb.cz, w: hb.w, d: hb.d, ux: hb.ux, uz: hb.uz, y0: hb.y0, y1: hb.y1 });
  out.boxes = boxes;
  out.at = (x, y, z) => {
    for (const b of boxes) {
      if (y < b.y0 || y > b.y1) continue;
      if (b.local) { if (b.local(x, z)) return b.id; continue; }
      const dx = x - b.cx, dz = z - b.cz;
      // lots (rotation.y) and landmark OBBs (obbPt) share one frame: local x = (uz, -ux), local z = (ux, uz)
      const lx = dx * b.uz - dz * b.ux, lz = dx * b.ux + dz * b.uz;
      if (Math.abs(lx) < b.w / 2 && Math.abs(lz) < b.d / 2) return b.id;
    }
    return null;
  };
  return out;
}
