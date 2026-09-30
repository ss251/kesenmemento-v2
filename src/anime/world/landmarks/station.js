// [v4:landmarks-B] JR / BRT 気仙沼駅 (docs/anime/landmarks/kesennuma-station.md) on its OSM outline (way 761402296),
// with the 駅前 square, the BRT platform, the island platform of the 大船渡線 and its canopy, the rails of the whole
// city (layout RAIL, OSM), the 駅前プラザ and an enterable waiting hall.
//   - One storey, timber (2012 renovation on the theme 「漁港のまち」): an arcade of five round arches in off-white stone
//     tile across the square side, a dark standing-seam hip roof with a small centre gable (triangular window), the
//     swordfish-and-fishermen mural painted on the square-side roof slope, the JR East board over the arcade and the
//     blue JR pillar sign (Commons "JR East Kesennuma Station building, Miyagi Pref.jpg", 2023).
//   - The square: the 「ようこそ気仙沼へ！」 sign tower and the カジキマグロ + three カツオ sculptures (OSM nodes
//     3156209281, 7448102315-19), the taxi rank (4833618683), the bus stops.
// Local frame: the OBB of the outline, +x toward the square (front), +z along the building toward its NW annex.
import * as THREE from 'three';
import { OSM, SPEC } from './sites.js';
import { group, obbOf, obbPt, groundSpan, wallGeo, facadeMat, paintWindow, pitchedRoof, flatRoof, flipFaces, colliders, wallCollider, sign, capGeo, prismWalls, mapMat, textTex, FONT, nightMat, openRing, offsetRing } from './kit.js';

// [v4:polish2] roof #434a55 read black from the air; the ortho samples #7d8488 and the sheet #4f5763 -> #5d6672
const C = { wall: '#e2ddd3', trim: '#cfc9bd', reveal: '#bdb6a8', roof: '#5d6672', roofEdge: '#555d68', white: '#f0efea', jr: '#2e8b57', blue: '#1f5fae', platform: '#b9b7b0', edge: '#e8d44a', canopy: '#5f9fc0', steel: '#6b7280', ballast: '#8d8a84', rail: '#7b7f86', floor: '#cfc8bb', bench: '#8a6a4e' };

/** The painted roof mural: swordfish (メカジキ) and fishermen on a dark slate ground, read at roof scale. */
function muralTex(ctx) {
  return ctx.tex.draw(1024, 256, (g, W, H) => {
    g.fillStyle = '#4b5361'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#2d3440'; g.beginPath(); g.ellipse(W * 0.5, H * 0.52, W * 0.47, H * 0.42, 0, 0, Math.PI * 2); g.fill();
    // waves
    g.strokeStyle = '#e8edf2'; g.lineWidth = 6;
    for (let i = 0; i < 7; i++) { g.beginPath(); const y = H * (0.62 + 0.05 * (i % 2)); for (let x = W * 0.08 + i * 120; x < W * 0.08 + i * 120 + 110; x += 6) g.lineTo(x, y + Math.sin(x * 0.08) * 8); g.stroke(); }
    // the swordfish: a long body leaping left, the bill a thin spear, a tall sickle fin
    const fish = (x, y, s, flip) => {
      g.save(); g.translate(x, y); g.scale(flip ? -s : s, s);
      g.fillStyle = '#e6ebf0'; g.beginPath(); g.moveTo(-160, 0); g.quadraticCurveTo(-60, -46, 90, -14); g.lineTo(150, -40); g.lineTo(128, 0); g.lineTo(150, 40); g.lineTo(90, 14); g.quadraticCurveTo(-60, 42, -160, 0); g.fill();
      g.fillStyle = '#9fb4c8'; g.beginPath(); g.moveTo(-150, 2); g.quadraticCurveTo(-60, 24, 88, 10); g.lineTo(88, 2); g.fill();
      g.strokeStyle = '#e6ebf0'; g.lineWidth = 6; g.beginPath(); g.moveTo(-158, -2); g.lineTo(-250, -14); g.stroke();
      g.fillStyle = '#c8d3dd'; g.beginPath(); g.moveTo(-70, -28); g.lineTo(-40, -92); g.lineTo(-18, -26); g.fill();
      g.fillStyle = '#1f2630'; g.beginPath(); g.arc(-128, -6, 5, 0, Math.PI * 2); g.fill();
      g.restore();
    };
    fish(W * 0.36, H * 0.46, 1.0, false);
    fish(W * 0.72, H * 0.58, 0.62, true);
    // fishermen in a boat with a harpoon (red and orange oilskins)
    g.fillStyle = '#c94a3a'; g.beginPath(); g.moveTo(W * 0.56, H * 0.3); g.lineTo(W * 0.68, H * 0.3); g.lineTo(W * 0.66, H * 0.4); g.lineTo(W * 0.58, H * 0.4); g.fill();
    for (const [x, c] of [[0.585, '#e0853a'], [0.62, '#d44b36'], [0.652, '#e0853a']]) { g.fillStyle = c; g.fillRect(W * x - 7, H * 0.16, 14, 34); g.fillStyle = '#f0d2b0'; g.beginPath(); g.arc(W * x, H * 0.13, 8, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = '#f0efe8'; g.lineWidth = 4; g.beginPath(); g.moveTo(W * 0.62, H * 0.16); g.lineTo(W * 0.48, H * 0.36); g.stroke();
  }, { key: 'lmB-station-mural' });
}

/** A wall with round-arched openings along local z at x = xFace (facing +x), from z0 to z1. */
function arcadeGeo(len, h, n, archW, spring) {
  const pier = (len - n * archW) / (n + 1), r = archW / 2;
  const shape = new THREE.Shape([[0, 0], [len, 0], [len, h], [0, h]].map(([x, y]) => new THREE.Vector2(x, y)));
  for (let i = 0; i < n; i++) {
    const x0 = pier + i * (archW + pier), p = new THREE.Path();
    p.moveTo(x0, 0.001); p.lineTo(x0 + archW, 0.001); p.lineTo(x0 + archW, spring);
    p.absarc(x0 + r, spring, r, 0, Math.PI, false); p.lineTo(x0, 0.001);
    shape.holes.push(p);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.9, bevelEnabled: false, curveSegments: 10 });
  return { g, pier, r };
}

export function buildStation(ctx) {
  const L = ctx.L, sp = SPEC.station;
  const poly = OSM.station.poly, o = obbOf(poly), gs = groundSpan(L, poly);
  const gy = Math.max(gs.mid, gs.lo) + 0.15;   // the floor: DEM T.P. ≈ 20.3 under the whole footprint
  const { g, k } = group(ctx, 'lmB-station');
  const G = k.group([o.cx, gy, o.cz], o.rotY), kk = ctx.kit(G);
  const t = (c, opts) => ctx.mat.toon(c, opts);
  const M = {
    wall: t(C.wall, { paint: 0.04 }), trim: t(C.trim, { paint: 0.03 }), reveal: t(C.reveal, { paint: 0.03 }), roof: t(C.roof, { paint: 0.05 }), roofEdge: t(C.roofEdge, { paint: 0.02 }),
    white: t(C.white, { paint: 0.02 }), steel: t(C.steel, { paint: 0 }), floor: t(C.floor, { paint: 0.04 }), dark: t('#3d4350', { paint: 0 }), bench: t(C.bench, { paint: 0.03 }),
    glass: nightMat(ctx, '#9db4c6', '#ffe2b8', 1.25), glassDark: nightMat(ctx, '#6c8298', '#ffdcaa', 1.3), lamp: nightMat(ctx, '#f1efe6', '#fff2d6', 2.2),
    blue: t(C.blue, { paint: 0 }), jr: t(C.jr, { paint: 0 }), plat: t(C.platform, { paint: 0.05 }), edge: t(C.edge, { paint: 0 }), canopy: t(C.canopy, { paint: 0.03 }),
  };
  // stone-tile arcade texture: off-white tiles 0.6 × 0.3 m with darker joints
  const tileTex = ctx.tex.draw(128, 64, (c, W, H) => { c.fillStyle = C.wall; c.fillRect(0, 0, W, H); c.fillStyle = '#cbc5b8'; for (let y = 0; y < H; y += 16) { c.fillRect(0, y, W, 1.5); for (let x = ((y / 16) % 2) * 16; x < W; x += 32) c.fillRect(x, y, 1.5, 16); } }, { key: 'lmB-station-tile', repeat: [1, 1] });
  tileTex.wrapS = tileTex.wrapT = THREE.RepeatWrapping;
  const tile = mapMat(ctx, 'toon', '#ffffff', tileTex, { paint: 0.03 });

  const H = sp.h, xF = 7.2, xB = -5.0, zS = -32.4, zN = 18.2, porch = 3.4;   // local: front x = +7.2 (the square), back x = −5.0 (the OSM strip behind it, x −7.4..−5, is the covered BRT platform 1)
  const zA0 = -20.5, zA1 = 16.0;   // the arcade: five arches on the square side
  // ---- the hall: walls on the local rectangle (back, ends and the recessed front behind the arcade)
  const hall = [[xB, zS], [xF, zS], [xF, zA0], [xF - porch, zA0], [xF - porch, zA1], [xF, zA1], [xF, zN], [xB, zN]];
  const facade = facadeMat(ctx, 'station', { draw: paintWindow({ wall: C.white, frame: '#d8d6cf', glass: ['#6f879c', '#b2c4d0'], win: [0.18, 0.28, 0.82, 0.78], mull: 1 }), win: [0.18, 0.28, 0.82, 0.78], lit: 0.8 });
  const world = (lx, lz) => obbPt(o, lx, lz);
  const hallW = hall.map(([x, z]) => world(x, z));
  // the recessed front (x = xF - porch, between the arches) is glazed (doors), the rest white wall with windows
  const glazedSide = (i) => i === 3;   // edge index 3: (xF-porch, zA0) -> (xF-porch, zA1)
  kk.mesh(localWalls(hall, 0, H, (i) => glazedSide(i)), facade);
  // the glazed entrance wall: two runs of glass either side of the automatic doors (the doors stand open: a 3.6 m gap)
  const doorZ = (zA0 + zA1) / 2 - 1.0, gap = 3.6;
  for (const [a, b] of [[zA0 + 0.3, doorZ - gap / 2], [doorZ + gap / 2, zA1 - 0.3]]) {
    kk.box(0.12, 3.0, b - a, M.glass, [xF - porch, 1.5, (a + b) / 2]);
    for (let z = a; z <= b + 0.01; z += (b - a) / Math.max(1, Math.round((b - a) / 1.8))) kk.box(0.16, 3.0, 0.1, M.steel, [xF - porch + 0.02, 1.5, z]);
  }
  kk.box(0.2, H - 3.0, zA1 - zA0, M.white, [xF - porch, 3.0 + (H - 3.0) / 2, (zA0 + zA1) / 2]);
  kk.box(0.1, 0.12, gap + 0.4, M.steel, [xF - porch, 2.95, doorZ]);
  // ---- the arcade: five round arches in stone tile, a moulded cornice, dark arch reveals
  const nA = 5, archW = 5.2, spring = 2.35, len = zA1 - zA0;
  const { g: arcG, pier, r } = arcadeGeo(len, H, nA, archW, spring);
  arcG.rotateY(-Math.PI / 2); // extrude along −x (thickness into the porch); shape x runs along +z after the turn
  const arc = new THREE.Mesh(arcG, tile); arc.position.set(xF, 0, zA0); arc.castShadow = arc.receiveShadow = true; G.add(arc);
  // reveals (inner soffits) and imposts
  for (let i = 0; i < nA; i++) { const zc = zA0 + pier + i * (archW + pier) + r; kk.box(0.95, 0.18, 0.5, M.reveal, [xF - 0.45, spring, zc - r - 0.1]); kk.box(0.95, 0.18, 0.5, M.reveal, [xF - 0.45, spring, zc + r + 0.1]); }
  kk.box(1.3, 0.35, len + 0.2, M.trim, [xF - 0.4, H - 0.18, (zA0 + zA1) / 2]);
  // porch ceiling and floor
  kk.box(porch, 0.12, len, M.white, [xF - porch / 2, H - 0.4, (zA0 + zA1) / 2]);
  kk.box(porch + 1.2, 0.15, len, M.floor, [xF - porch / 2 + 0.6, 0.02, (zA0 + zA1) / 2]);
  // ---- the roof: dark standing seam, hipped ends, a small centre gable with a triangular window over the arcade
  const ro = { cx: 0, cz: 0, w: xF - xB, d: zN - zS, rotY: 0, ux: 0, uz: 1 };
  const off = { x: (xF + xB) / 2, z: (zN + zS) / 2 };
  const R = pitchedRoof(ro, H, { kind: 'hip', pitch: 0.46, over: 0.8 });
  const Rg = new THREE.Group(); Rg.position.set(off.x, 0, off.z); G.add(Rg); const kr = ctx.kit(Rg);
  kr.mesh(R.roof, M.roof); kr.mesh(R.fascia, M.roofEdge);
  // the mural on the square-side slope, NW half (+z; the photo's left half)
  const slope = Math.atan(0.46), wsl = (R.W) / Math.cos(slope);
  const mural = mapMat(ctx, 'decal', '#ffffff', muralTex(ctx), { transparent: false, polygonOffset: -3 });
  const mz0 = 0, mz1 = 16;   // along the roof (local roof z)
  kr.plane(mz1 - mz0, wsl * 0.78, mural, [R.W * 0.45, H + R.rise * 0.55 + 0.03, (mz0 + mz1) / 2], [-(Math.PI / 2 - slope), Math.PI / 2, 0]).rotation.order = 'YXZ';
  // centre gable over the middle arch: a small pediment with a triangular window
  const gz = zA0 + len / 2 - off.z, gw = 7.2, gh = 3.0;
  const ped = new THREE.Shape([[-gw / 2, 0], [gw / 2, 0], [0, gh]].map(([a, b]) => new THREE.Vector2(a, b)));
  const pedG = new THREE.ExtrudeGeometry(ped, { depth: 5.0, bevelEnabled: false }); pedG.rotateY(Math.PI / 2);
  const pm = new THREE.Mesh(pedG, M.white); pm.position.set(xF + 0.4 - off.x - 5.0, H + 0.05, gz); pm.castShadow = true; Rg.add(pm);
  const tri = new THREE.Shape([[-gw / 2 + 1.0, 0.45], [gw / 2 - 1.0, 0.45], [0, gh - 0.6]].map(([a, b]) => new THREE.Vector2(a, b)));
  const triG = new THREE.ShapeGeometry(tri); triG.rotateY(Math.PI / 2);
  const tm = new THREE.Mesh(triG, M.glassDark); tm.position.set(xF + 0.42 - off.x, H + 0.05, gz); Rg.add(tm);
  // the gable's little roof (two slopes)
  for (const s of [-1, 1]) { const len2 = Math.hypot(gw / 2 + 0.5, gh + 0.2); kr.box(5.6, 0.14, len2, M.roof, [xF - 2.2 - off.x, H + gh / 2 + 0.1, gz + s * (gw / 4 + 0.1)], [Math.atan2(gh + 0.2, gw / 2 + 0.5) * s, 0, 0]); }
  // ---- signs: the JR East board over the arcade; the blue JR pillar at the SE end of the arcade
  const board = ctx.tex.draw(1024, 192, (c, W, Hh) => {
    c.fillStyle = '#f4f3ee'; c.fillRect(0, 0, W, Hh);
    c.fillStyle = C.jr; c.fillRect(24, 34, 124, 124); c.fillStyle = '#ffffff'; c.font = `900 84px ${FONT.en || 'sans-serif'}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('JR', 86, 100);
    c.fillStyle = '#23443a'; c.font = `900 108px ${FONT.sans}`; c.textAlign = 'left'; c.fillText('気仙沼駅', 180, 86);
    c.fillStyle = '#2e6b56'; c.font = `700 40px ${FONT.en || 'sans-serif'}`; c.fillText('Kesennuma Station', 186, 160);
  }, { key: 'lmB-station-board' });
  kk.plane(6.6, 1.24, mapMat(ctx, 'toon', '#ffffff', board, { paint: 0 }), [xF + 0.47, H - 1.05, zA0 + len * 0.62], [0, Math.PI / 2, 0]);
  kk.box(0.4, 3.6, 0.6, M.blue, [xF + 1.6, 1.8, zA0 - 1.4]);
  kk.plane(0.5, 2.8, mapMat(ctx, 'toon', '#ffffff', textTex(ctx, 'JR 気仙沼駅', { w: 128, h: 720, color: '#ffffff', bg: C.blue, font: FONT.sans }), { paint: 0 }), [xF + 1.81, 2.0, zA0 - 1.4], [0, Math.PI / 2, 0]);
  // ---- the NW annex (OSM: the narrow tail, x −2.5..1.7, z 18..33): a low white block with a flat roof
  const ann = [[-2.5, 18.2], [1.7, 18.2], [1.7, 33.0], [-2.5, 33.0]];
  kk.mesh(localWalls(ann, 0, 3.2), facade);
  flatRoofLocal(kk, ann, 3.2, t('#9aa1a8', { paint: 0.03 }), M.white);
  // ---- the enterable waiting hall: floor, ceiling, ticket gates toward the platforms, machines, benches, timetable
  const hx0 = xB + 0.3, hx1 = xF - porch - 0.3;
  kk.box(hx1 - hx0, 0.1, zA1 - zA0 - 0.6, M.floor, [(hx0 + hx1) / 2, 0.05, (zA0 + zA1) / 2]);
  kk.box(hx1 - hx0, 0.1, zA1 - zA0 - 0.6, t('#e9e6de', { paint: 0.02, side: 'double' }), [(hx0 + hx1) / 2, 3.6, (zA0 + zA1) / 2]);
  for (let z = zA0 + 3; z < zA1 - 2; z += 4.5) kk.box(0.8, 0.06, 2.6, M.lamp, [(hx0 + hx1) / 2, 3.52, z]);
  // the hall's inner faces (the outer walls are one-sided): cream plaster with a timber dado, the glazed front left open
  const inner = [[hx0, zA0 + 0.3], [hx1, zA0 + 0.3], [hx1, zA1 - 0.3], [hx0, zA1 - 0.3]];
  const inG = prismWalls(inner, 0.02, 3.6, { tile: 2, skip: (i) => i === 1 }); flipFaces(inG);
  const plaster = ctx.tex.draw(64, 64, (c, W, Hh) => { c.fillStyle = '#efe9dc'; c.fillRect(0, 0, W, Hh); c.fillStyle = '#9a7a5a'; c.fillRect(0, Hh * 0.62, W, Hh * 0.38); c.fillStyle = '#7d6147'; c.fillRect(0, Hh * 0.6, W, 3); }, { key: 'lmB-station-plaster', repeat: [1, 1] });
  plaster.wrapS = plaster.wrapT = THREE.RepeatWrapping;
  kk.mesh(inG, mapMat(ctx, 'toon', '#ffffff', plaster, { paint: 0.02 }));
  // 自動改札 (5 gates) at the back wall, with the platform door behind
  const gx = hx0 + 2.6;
  for (let i = 0; i < 6; i++) kk.box(1.6, 1.0, 0.24, t('#d9dbe0', { paint: 0 }), [gx, 0.5, doorZ - 4 + i * 1.6]);
  for (let i = 0; i < 6; i++) kk.box(0.4, 0.06, 0.2, t('#3a8f5a', { paint: 0 }), [gx + 0.5, 1.03, doorZ - 4 + i * 1.6]);
  // [v4:polish2] the departure board over the gates (it was an empty light-blue slab): the next departures after noon
  // on a weekday, from the 2026 timetables (JR 大船渡線 列車 to 一ノ関, 大船渡線BRT to 盛, 気仙沼線BRT to 前谷地 / 本吉;
  // Yahoo!路線情報 21022/470, /7751, /490 and ekitan 167-13, read 2026-09-30)
  const depTex = ctx.tex.draw(1152, 320, (c, W, Hh) => {
    const T = ctx.tex;
    c.fillStyle = '#15191f'; c.fillRect(0, 0, W, Hh);
    c.fillStyle = '#2d3440'; c.fillRect(0, 0, W, 64);
    c.textBaseline = 'middle'; c.textAlign = 'left';
    c.fillStyle = '#ffffff'; T.fitText(c, '発車時刻  Departures', 24, 33, 520, 40, FONT.sans, 900, { align: 'left' });
    c.fillStyle = '#9fb0c4'; c.textAlign = 'right'; T.fitText(c, '時刻  種別  行先', W - 24, 33, 420, 30, FONT.sans, 700, { align: 'right' });
    const rows = [
      ['12:04', '大船渡線BRT', 'BRT', '盛', '#7fd0ff'],
      ['12:15', '大船渡線', '普通', '一ノ関', '#8df0a8'],
      ['12:15', '気仙沼線BRT', 'BRT', '前谷地', '#ffcf6a'],
      ['12:40', '気仙沼線BRT', 'BRT', '本吉', '#ffcf6a'],
    ];
    rows.forEach(([t, line, kind, dest, col], i) => {
      const y = 96 + i * 62;
      c.fillStyle = 'rgba(255,255,255,0.05)'; if (i % 2) c.fillRect(0, y - 31, W, 62);
      c.textAlign = 'left';
      c.fillStyle = '#ffb54a'; T.fitText(c, t, 24, y, 150, 44, FONT.en || FONT.sans, 800, { align: 'left' });
      c.fillStyle = col; T.fitText(c, line, 200, y, 330, 40, FONT.sans, 800, { align: 'left' });
      c.fillStyle = '#e8ecf0'; T.fitText(c, kind, 560, y, 150, 38, FONT.sans, 700, { align: 'left' });
      c.fillStyle = '#ffb54a'; T.fitText(c, dest + ' 行', 740, y, 380, 46, FONT.sans, 900, { align: 'left' });
    });
  }, { key: 'lmB-station-departures' });
  kk.box(0.18, 1.08, 3.8, t('#2b2f36', { paint: 0 }), [gx - 1.0, 2.62, doorZ + 0.0]);
  kk.plane(3.6, 1.0, mapMat(ctx, 'toon', '#ffffff', depTex, { paint: 0 }), [gx - 0.9, 2.62, doorZ + 0.0], [0, Math.PI / 2, 0]);
  // ticket machines and the fare map
  for (let i = 0; i < 2; i++) kk.box(0.7, 1.7, 0.9, t('#e6e4dd', { paint: 0 }), [hx0 + 0.5, 0.85, zA1 - 3.5 - i * 1.1]);
  kk.plane(3.2, 1.2, mapMat(ctx, 'toon', '#ffffff', textTex(ctx, 'きっぷうりば  大船渡線・BRT', { w: 1024, h: 384, color: '#1d3a5f', bg: '#f3f1ea', font: FONT.sans }), { paint: 0 }), [hx0 + 0.02, 2.5, zA1 - 4.0], [0, Math.PI / 2, 0]);
  // [v4:polish2] the strip that was cut off at the frame edge is now the departure board over the gates (above)
  for (let i = 0; i < 3; i++) { const bz = zA0 + 3 + i * 4.2; kk.box(1.6, 0.45, 3.4, M.bench, [(hx0 + hx1) / 2 + 1.2, 0.23, bz]); kk.box(0.12, 0.6, 3.4, M.bench, [(hx0 + hx1) / 2 + 0.45, 0.75, bz]); }
  // the tourist-information counter (気仙沼市観光案内所, OSM node 2982484371 in the square side of the hall)
  kk.box(1.0, 1.05, 3.6, t('#b08a62', { paint: 0.03 }), [hx1 - 1.2, 0.53, zA0 + 2.8]);
  kk.plane(2.4, 0.5, mapMat(ctx, 'toon', '#ffffff', textTex(ctx, '観光案内所', { w: 512, h: 112, color: '#ffffff', bg: '#2d6fa8', font: FONT.sans }), { paint: 0 }), [hx1 - 0.02, 2.6, zA0 + 2.8], [0, -Math.PI / 2, 0]);

  // colliders: the hall walls with the door gap on the entrance, the gate line closed (the platforms are rail-side)
  const wl = (lx0, lz0, lx1, lz1) => wallCollider(ctx, world(lx0, lz0), world(lx1, lz1), gy - 5, gy + 6);
  wl(xB, zS, xB, zN); wl(xB, zS, xF, zS); wl(xB, zN, xF, zN);
  wl(xF - porch, zA0, xF - porch, doorZ - gap / 2); wl(xF - porch, doorZ + gap / 2, xF - porch, zA1);
  wl(xF - porch, zA0, xF, zA0); wl(xF - porch, zA1, xF, zA1);
  wl(xF, zS, xF, zA0); wl(xF, zA1, xF, zN);
  wl(gx, doorZ - 4.6, gx, doorZ + 4.6);
  if (ctx.physics?.addWalkBox) { const c = world((hx0 + hx1) / 2 + 1, (zA0 + zA1) / 2); ctx.physics.addWalkBox(c[0], c[1], hx1 - hx0 + porch, zA1 - zA0, o.rotY, gy + 0.1); }
  // arcade piers are solid
  for (let i = 0; i <= nA; i++) { const z = zA0 + i * (archW + pier) + pier / 2; const p = world(xF - 0.45, z); ctx.physics?.addBox?.(p[0], p[1], 0.9, pier, o.rotY, gy - 2, gy + H); }

  // ---- 駅前プラザ (OSM way 613961242): white-roofed 2-storey block west of the station
  {
    const pp = OSM.stationPlaza.poly, s2 = SPEC.stationPlaza, g2 = groundSpan(L, pp);
    const fac = facadeMat(ctx, 'plaza', { draw: paintWindow({ wall: s2.wall, frame: '#cfd3d6', glass: ['#5f7891', '#aabdca'], win: [0.1, 0.3, 0.9, 0.82], mull: 2 }), win: [0.1, 0.3, 0.9, 0.82], lit: 0.5 });
    const top = g2.lo + s2.storeys * s2.fh;
    k.mesh(wallGeo(pp, g2.lo - 0.5, top, { tu: 3.6, tv: s2.fh, yRef: g2.lo }), fac);
    flatRoof(k, pp, top, t(s2.roof, { paint: 0.03 }), t(s2.wall, { paint: 0.02 }), 0.7);
    colliders(ctx, pp, g2.lo - 3, top);
  }
  // ---- the BRT platform (OSM 267557944, covered): a kerbed strip with a canopy on posts, between hall and busway
  {
    const bo = obbOf(OSM.brtCanopy.poly), by = L.heightAt(bo.cx, bo.cz) + 0.02;
    const B = k.group([bo.cx, by, bo.cz], bo.rotY), kb = ctx.kit(B);
    kb.box(bo.w + 0.4, 0.2, bo.d, M.plat, [0, 0.1, 0]);
    kb.box(0.3, 0.02, bo.d, M.edge, [bo.w / 2, 0.21, 0]);
    for (let z = -bo.d / 2 + 1; z <= bo.d / 2 - 1; z += 6.2) kb.box(0.16, 3.1, 0.16, M.steel, [-bo.w / 2 + 0.3, 1.65, z]);
    kb.box(bo.w + 1.6, 0.16, bo.d + 0.4, M.canopy, [0.2, 3.25, 0]);
    kb.plane(2.2, 0.55, mapMat(ctx, 'toon', '#ffffff', textTex(ctx, 'BRT のりば  1', { w: 512, h: 128, color: '#ffffff', bg: '#d2462f', font: FONT.sans }), { paint: 0 }), [bo.w / 2 + 0.2, 2.8, 4], [0, Math.PI / 2, 0]);
  }
  // ---- the island platform (OSM 267557941, 1 face 2 tracks) and its canopy (OSM 761402299, light blue on the ortho)
  {
    const ip = OSM.islandPlatform.poly, py = L.heightAt(-1420, -470) + 0.95;
    k.mesh(prismWalls(ip, py - 1.2, py, { tile: 2 }), M.plat);
    k.mesh(capGeo(ip, py, { tile: 2 }), M.plat);
    k.mesh(prismWalls(offsetRing(ip, -0.05), py + 0.005, py + 0.012, { tile: 2 }), M.edge);
    const co = obbOf(OSM.platformCanopy.poly);
    const P = k.group([co.cx, py, co.cz], co.rotY), kp = ctx.kit(P);
    for (let z = -co.d / 2 + 2; z <= co.d / 2 - 2; z += 7.5) { kp.box(0.2, 3.3, 0.2, M.steel, [0, 1.65, z]); kp.box(co.w * 0.9, 0.18, 0.3, M.steel, [0, 3.25, z]); }
    kp.box(co.w * 0.95, 0.14, co.d, M.canopy, [0, 3.45, 0]);
    kp.box(co.w * 0.95 + 0.1, 0.3, 0.1, M.canopy, [0, 3.35, co.d / 2]);
    for (let z = -co.d / 2 + 6; z < co.d / 2; z += 18) kp.box(1.2, 0.45, 0.12, M.bench, [0.9, 0.23, z]);
    kp.plane(1.6, 0.4, mapMat(ctx, 'toon', '#ffffff', textTex(ctx, 'けせんぬま', { w: 512, h: 128, color: '#1d2a3a', bg: '#f5f5f0', font: FONT.sans }), { paint: 0 }), [0, 2.6, 8], [0, 0, 0]);
  }
  // ---- the square: the sign tower, the swordfish and bonito sculptures, the taxi rank
  buildSquare(ctx, k, M, t);
  // [v4:polish1] the hall pose stands 4 m further from the gates (it faced the dark gate-screen point-blank), inside the
  // glazed front, looking across the benches at the gate line; hallBox = the room (interiors.at hides the POI labels)
  const hallX = Math.min(hx1 - 0.6, (hx0 + hx1) / 2 + 4);
  out.hall = { x: world(hallX, doorZ)[0], z: world(hallX, doorZ)[1], y: gy + 0.1, yaw: o.rotY * 180 / Math.PI + 90 };
  { const c = world((hx0 + hx1 + porch) / 2, (zA0 + zA1) / 2); out.hallBox = { cx: c[0], cz: c[1], w: hx1 - hx0 + porch, d: zA1 - zA0, ux: o.ux, uz: o.uz, y0: gy - 0.5, y1: gy + 3.7 }; }
  out.front = world(xF + 18, doorZ);
  out.gy = gy;
  return out;

  function localWalls(ring, y0, y1, skip) {
    const wr = ring.map(([x, z]) => [x, z]);
    const gg = wallGeo(wr, y0, y1, { tu: 3.2, tv: 3.4, yRef: 0.2, skip: skip ? (i) => skip(i) : null });
    return gg;
  }
  function flatRoofLocal(kx, ring, y, rm, pm) { flatRoof(kx, ring, y, rm, pm, 0.5); }
}
const out = {};

function buildSquare(ctx, k, M, t) {
  const L = ctx.L;
  // 「ようこそ気仙沼へ！」 (OSM man_made=tower 3156209281): a white lighthouse-shaped tower on a planted island, the
  // welcome written down its shaft, an anchor at its foot (Commons "Kesennuma station Front.JPG")
  const [tx, tz] = [-1397.3, -373.3], ty = L.heightAt(tx, tz);
  const white = t('#f1f0ea', { paint: 0.02 });
  k.cyl(2.6, 2.8, 0.35, t('#b9b5aa', { paint: 0.05 }), [tx, ty + 0.18, tz], null, 16);
  for (let i = 0; i < 9; i++) { const a2 = i / 9 * Math.PI * 2; k.sphere(0.45, t(i % 2 ? '#e8c33c' : '#d9803a', { paint: 0.05 }), [tx + Math.cos(a2) * 2.1, ty + 0.5, tz + Math.sin(a2) * 2.1], 6); }
  k.cyl(0.42, 0.62, 5.8, white, [tx, ty + 0.35 + 2.9, tz], null, 14);
  k.cyl(0.7, 0.7, 0.14, white, [tx, ty + 6.3, tz], null, 14);
  k.cyl(0.36, 0.36, 0.8, nightMat(ctx, '#cfe2ea', '#fff1c8', 2.4), [tx, ty + 6.8, tz], null, 10);
  k.cyl(0.05, 0.42, 0.42, white, [tx, ty + 7.4, tz], null, 10);
  const wv = textTex(ctx, 'ようこそ気仙沼へ！', { w: 1024, h: 160, color: '#1f5fae', bg: '#f1f0ea', font: FONT.sans });
  const wp = k.plane(4.2, 0.62, mapMat(ctx, 'toon', '#ffffff', wv, { paint: 0 }), [tx + 0.53, ty + 3.3, tz + 0.18], [0, 1.24, Math.PI / 2]);
  wp.rotation.order = 'YXZ';
  const anc = t('#3b4250', { paint: 0 });
  k.box(0.12, 1.2, 0.12, anc, [tx + 0.9, ty + 0.95, tz + 0.3]); k.box(0.9, 0.12, 0.12, anc, [tx + 0.9, ty + 0.45, tz + 0.3]); k.box(0.5, 0.1, 0.12, anc, [tx + 0.9, ty + 1.35, tz + 0.3]);
  // カジキマグロ (swordfish) leaping on a stone plinth, three カツオ around it (OSM tourism=artwork nodes)
  const plinth = t('#b9b5aa', { paint: 0.06 }), fishM = t('#4f6f8f', { paint: 0.04 }), belly = t('#d9dee2', { paint: 0.02 });
  const [sx, sz] = [-1396.0, -374.7 + 2.2], sy = L.heightAt(sx, sz);
  k.box(1.6, 0.8, 1.0, plinth, [sx - 2.0, sy + 0.4, sz]);
  const f = k.group([sx - 2.0, sy + 1.9, sz], 0.6), kf = ctx.kit(f);
  kf.sphere(0.5, fishM, [0, 0, 0], 8).scale.set(2.8, 0.7, 0.6);
  kf.box(0.05, 0.05, 1.6, fishM, [0, 0.12, -2.0]).rotation.x = 0.1;
  kf.box(0.06, 0.8, 0.5, fishM, [0, 0.55, -0.3], [0.4, 0, 0]);
  kf.box(0.05, 0.9, 0.35, fishM, [0, 0.0, 1.45], [0, 0, 0]);
  kf.sphere(0.45, belly, [0, -0.12, 0], 8).scale.set(2.4, 0.4, 0.5);
  for (const [bx, bz, r] of [[-1395.3, -377.2, 0.2], [-1393.7, -379.5, 1.4], [-1393.5, -377.9, 2.6]]) {
    const by = L.heightAt(bx, bz);
    k.box(0.9, 0.45, 0.6, plinth, [bx, by + 0.23, bz]);
    const b = k.group([bx, by + 0.85, bz], r), kb = ctx.kit(b);
    kb.sphere(0.35, t('#35506b', { paint: 0.03 }), [0, 0, 0], 8).scale.set(1.0, 0.8, 1.7);
    kb.box(0.04, 0.4, 0.3, t('#35506b', { paint: 0.03 }), [0, 0, 0.62]);
    for (let i = -1; i <= 1; i++) kb.box(0.02, 0.05, 0.9, t('#23303f', { paint: 0 }), [0.2, i * 0.12 - 0.05, 0]);   // the stripes on the belly (カツオの縞)
  }
  // taxi rank sign (OSM amenity=taxi 4833618683)
  const [qx, qz] = [-1377, -396.6], qy = L.heightAt(qx, qz);
  k.box(0.1, 2.4, 0.1, t('#8a8f98', { paint: 0 }), [qx, qy + 1.2, qz]);
  k.plane(0.9, 0.45, mapMat(ctx, 'toon', '#ffffff', textTex(ctx, 'タクシーのりば', { w: 512, h: 256, color: '#ffffff', bg: '#1e5d9e', font: FONT.sans }), { paint: 0 }), [qx, qy + 2.3, qz + 0.06], [0, 0, 0]);
}

/**
 * Rails of the city (layout RAIL, OSM railway=rail; the 大船渡線 and the yard at 気仙沼駅): ballast with sleepers and two
 * steel rails at the 1,067 mm gauge, draped on the terrain; tunnels are skipped.
 */
export function buildRails(ctx) {
  const L = ctx.L;
  const rails = (L.RAIL || []).filter((r) => r.kind === 'rail' && !r.tunnel && r.pts?.length > 1);
  if (!rails.length) return { n: 0 };
  const bTex = ctx.tex.draw(128, 256, (g, W, H) => {
    g.fillStyle = C.ballast; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 380; i++) { const v = 110 + ((i * 37) % 60); g.fillStyle = `rgb(${v},${v - 3},${v - 8})`; g.fillRect((i * 53) % W, (i * 97) % H, 3, 3); }
    g.fillStyle = '#6e5a4a'; for (let y = 8; y < H; y += 64) g.fillRect(W * 0.08, y, W * 0.84, 18);   // sleepers every 0.6 m (texture v = 2.4 m)
  }, { key: 'lmB-ballast', repeat: [1, 1] });
  bTex.wrapS = bTex.wrapT = THREE.RepeatWrapping;
  const bMat = mapMat(ctx, 'toon', '#ffffff', bTex, { paint: 0.02 });
  const rMat = ctx.mat.toon(C.rail, { paint: 0 });
  const pos = [], uv = [], rpos = [];
  const push = (arr, a, b, c) => arr.push(...a, ...b, ...c);
  let n = 0;
  for (const r of rails) {
    let s = 0;
    const P = [];
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1], len = Math.hypot(bx - ax, bz - az), steps = Math.max(1, Math.ceil(len / 6));
      for (let j = (i ? 1 : 0); j <= steps; j++) { const u = j / steps; P.push([ax + (bx - ax) * u, az + (bz - az) * u]); }
    }
    for (let i = 0; i < P.length - 1; i++) {
      const [ax, az] = P[i], [bx, bz] = P[i + 1], len = Math.hypot(bx - ax, bz - az); if (len < 0.01) continue;
      const ux = (bx - ax) / len, uz = (bz - az) / len, nx = -uz, nz = ux;
      const ya = L.heightAt(ax, az) + 0.22, yb = L.heightAt(bx, bz) + 0.22;
      const hw = 1.5;
      const A0 = [ax + nx * hw, ya, az + nz * hw], A1 = [ax - nx * hw, ya, az - nz * hw], B0 = [bx + nx * hw, yb, bz + nz * hw], B1 = [bx - nx * hw, yb, bz - nz * hw];
      push(pos, A0, B0, B1); push(pos, A0, B1, A1);
      const v0 = s / 2.4, v1 = (s + len) / 2.4;
      uv.push(1, v0, 1, v1, 0, v1, 1, v0, 0, v1, 0, v0);
      for (const side of [-0.5335, 0.5335]) {
        const a = [ax + nx * side, ya + 0.17, az + nz * side], b = [bx + nx * side, yb + 0.17, bz + nz * side];
        const w = 0.07;
        const a0 = [a[0] - nx * w, a[1], a[2] - nz * w], a1 = [a[0] + nx * w, a[1], a[2] + nz * w], b0 = [b[0] - nx * w, b[1], b[2] - nz * w], b1 = [b[0] + nx * w, b[1], b[2] + nz * w];
        push(rpos, a0, b1, b0); push(rpos, a0, a1, b1);
        const lo = (p) => [p[0], p[1] - 0.16, p[2]];
        push(rpos, a1, lo(b1), b1); push(rpos, a1, lo(a1), lo(b1));
        push(rpos, a0, b0, lo(b0)); push(rpos, a0, lo(b0), lo(a0));
      }
      s += len; n++;
    }
  }
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); bg.computeVertexNormals();
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rpos, 3)); rg.computeVertexNormals();
  const G = new THREE.Group(); G.name = 'lmB-rails';
  const bm = new THREE.Mesh(bg, bMat); bm.receiveShadow = true; G.add(bm);
  const rm = new THREE.Mesh(rg, rMat); rm.castShadow = false; G.add(rm);
  ctx.addStatic(G);
  return { n };
}
