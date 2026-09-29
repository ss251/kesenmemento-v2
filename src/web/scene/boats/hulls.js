// Procedural Japanese offshore fishing vessels at true scale (metres), built from a lofted hull plus type-specific
// superstructure and gear. Local frame: +z = bow, +y = up (waterline y = 0), +x = port (left, red light), -x = starboard.
//
//   pole      近海・遠洋かつお一本釣り  ~60 m: high flared bow, bridge amidships, rows of fishing poles along both rails,
//             sprinkler (散水) pipes outboard, tall main mast with bird radar
//   longline  まぐろはえ縄              ~50 m: bridge forward, long working deck, covered line-setting shelter aft,
//             radio-buoy flag poles on the stern
//   saury     さんま棒受網              ~40 m: two tiers of fish-lamp (集魚灯) rows along both sides, the dip-net boom
//   seine     まき網 (reuses the pole hull without poles): net pile and power-block crane aft
//
// Each vessel -> { parts: { paint, glass, metal, lamp } (non-indexed BufferGeometries with position/normal/color),
//                  anchors (nav lights, deck floods, label), dims }. Materials are applied by the fleet (PBR).
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export const SPECS = {
  pole:     { L: 60, B: 10.6, T: 4.1, sheer: [3.7, 3.1, 7.0], bulwark: 1.25, bridge: [0.40, 0.60], mast: 0.62, mastH: 17 },
  longline: { L: 50, B: 9.0, T: 3.6, sheer: [3.3, 2.8, 6.0], bulwark: 1.2, bridge: [0.58, 0.78], mast: 0.80, mastH: 14 },
  saury:    { L: 40, B: 7.8, T: 3.1, sheer: [2.9, 2.5, 5.2], bulwark: 1.1, bridge: [0.52, 0.72], mast: 0.74, mastH: 12 },
  seine:    { L: 55, B: 10.2, T: 4.0, sheer: [3.4, 2.9, 6.3], bulwark: 1.2, bridge: [0.58, 0.78], mast: 0.80, mastH: 15 },
};

// palette (linear-ish sRGB values; the fleet converts to linear via THREE.Color)
export const PAINT = {
  hull: "#eef0ee", topside: "#f4f5f2", antifoul: "#7a2a22", boot: "#1a1e26", deck: "#6d7f74", deck2: "#8b958f",
  house: "#f2f3ef", roof: "#d9ddd8", funnel: "#eceee9", pole: "#2c2a26", rail: "#d8dcd8", float: "#ff6a1a", net: "#3b4a3f",
  trims: { navy: "#1d2c52", red: "#b1302a", teal: "#1d5c63" },
};

const C = new THREE.Color();
function paint(g, hex) {
  g = g.index ? g.toNonIndexed() : g;
  if (g.attributes.uv) g.deleteAttribute("uv");
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  C.set(hex); for (let i = 0; i < n; i++) { a[i * 3] = C.r; a[i * 3 + 1] = C.g; a[i * 3 + 2] = C.b; }
  g.setAttribute("color", new THREE.BufferAttribute(a, 3));
  return g;
}
const box = (w, h, d, x, y, z, hex, ry = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); g.translate(x, y, z); return paint(g, hex); };
function cyl(r0, r1, h, x, y, z, hex, seg = 8, { rx = 0, rz = 0, ry = 0 } = {}) {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg, 1, false);
  g.translate(0, h / 2, 0); if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz); if (ry) g.rotateY(ry); g.translate(x, y, z);
  return paint(g, hex);
}
function sphere(r, x, y, z, hex, seg = 10) { const g = new THREE.SphereGeometry(r, seg, Math.max(4, seg >> 1)); g.translate(x, y, z); return paint(g, hex); }
// a horizontal bar between two points
function bar(a, b, r, hex, seg = 6) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate(a.x, a.y, a.z);
  return paint(g, hex);
}
// a slab whose top is chamfered (roofs, visors)
function roofSlab(w, d, x, y, z, hex, over = 0.35) { return box(w + over * 2, 0.22, d + over * 2, x, y + 0.11, z, hex); }

// ---------------------------------------------------------------- hull loft
export function hullShape(S) {
  const { L, B, T, sheer: [s0, s1, s2] } = S;
  const sheer = (u) => (u < 0.45 ? s1 + (s0 - s1) * ((0.45 - u) / 0.45) ** 2 : s1 + (s2 - s1) * ((u - 0.45) / 0.55) ** 2.1);
  const keel = (u) => (u > 0.78 ? T * (1 - 0.72 * ((u - 0.78) / 0.22) ** 1.8) : u < 0.12 ? T * (0.7 + 0.3 * (u / 0.12)) : T);
  const plan = (u) => {                                          // max half-breadth at station u (0 stern .. 1 bow)
    if (u < 0.28) return (B / 2) * (0.86 + 0.14 * Math.sin((u / 0.28) * Math.PI / 2));
    if (u <= 0.6) return B / 2;
    const k = (u - 0.6) / 0.4; return (B / 2) * Math.pow(Math.max(0, 1 - k * k), 0.62);
  };
  const expo = (u) => (u > 0.6 ? 4.2 - 2.9 * ((u - 0.6) / 0.4) : u < 0.2 ? 2.4 + 1.8 * (u / 0.2) : 4.2);
  const half = (u, y) => {                                        // half-breadth at station u, height y
    const K = keel(u), H = K + sheer(u), t = Math.min(1, Math.max(0, (y + K) / H));
    const flare = 1 + 0.16 * Math.max(0, (u - 0.5) / 0.5) * Math.max(0, y / sheer(u)) ** 1.5;
    return plan(u) * (1 - (1 - t) ** expo(u)) * flare;
  };
  const zAt = (u, y) => -L / 2 + u * L + (u > 0.88 ? ((u - 0.88) / 0.12) ** 1.5 * Math.max(0, y + keel(u)) * 0.42 : 0) - (u < 0.02 ? (1 - u / 0.02) * Math.max(0, y) * 0.12 : 0);
  const deckY = (u) => sheer(u) - S.bulwark;
  return { sheer, keel, plan, half, zAt, deckY };
}

function hullGeometry(S, trimHex) {
  const H = hullShape(S);
  const NU = 56;
  const us = Array.from({ length: NU + 1 }, (_, i) => 0.5 - 0.5 * Math.cos((Math.PI * i) / NU));
  // rows (height bands) as functions of u; paired rows at a colour boundary give a crisp paint line
  const rows = [
    [(u) => -H.keel(u), PAINT.antifoul], [(u) => -H.keel(u) * 0.55, PAINT.antifoul], [(u) => -0.3, PAINT.antifoul],
    [(u) => -0.3, PAINT.boot], [(u) => 0.45, PAINT.boot],
    [(u) => 0.45, PAINT.hull], [(u) => 0.45 + (H.sheer(u) - 1.4) * 0.5, PAINT.hull], [(u) => H.sheer(u) - 0.95, PAINT.hull],
    [(u) => H.sheer(u) - 0.95, trimHex], [(u) => H.sheer(u) - 0.3, trimHex],
    [(u) => H.sheer(u) - 0.3, PAINT.topside], [(u) => H.sheer(u), PAINT.topside],
  ];
  const pos = [], col = [], idx = [];
  const NR = rows.length;
  for (const side of [1, -1]) {
    const base = pos.length / 3;
    for (const u of us) for (const [fy, hex] of rows) {
      const y = Math.min(fy(u), H.sheer(u)); C.set(hex);
      pos.push(side * H.half(u, y), y, H.zAt(u, y)); col.push(C.r, C.g, C.b);
    }
    for (let i = 0; i < NU; i++) for (let j = 0; j < NR - 1; j++) {
      const a = base + i * NR + j, b = a + NR, c = a + 1, d = b + 1;
      if (side > 0) idx.push(a, b, c, c, b, d); else idx.push(a, c, b, c, d, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
  g.computeVertexNormals();
  const parts = [g.toNonIndexed()];
  // transom (flat stern) and deck
  const tr = [], tc = [], deck = [], dc = [];
  const u0 = us[0];
  for (let j = 0; j < NR - 1; j++) {
    const ya = Math.min(rows[j][0](u0), H.sheer(u0)), yb = Math.min(rows[j + 1][0](u0), H.sheer(u0));
    const xa = H.half(u0, ya), xb = H.half(u0, yb), za = H.zAt(u0, ya), zb = H.zAt(u0, yb);
    tr.push(-xa, ya, za, xa, ya, za, xb, yb, zb, -xa, ya, za, xb, yb, zb, -xb, yb, zb);
    C.set(rows[j][1] === PAINT.antifoul ? PAINT.antifoul : ya < 0.45 ? PAINT.boot : rows[j][1]); for (let k = 0; k < 6; k++) tc.push(C.r, C.g, C.b);
  }
  for (let i = 0; i < NU; i++) {
    const ua = us[i], ub = us[i + 1], ya = H.deckY(ua), yb = H.deckY(ub);
    const xa = H.half(ua, ya) - 0.05, xb = H.half(ub, yb) - 0.05, za = H.zAt(ua, ya), zb = H.zAt(ub, yb);
    deck.push(-xa, ya, za, xa, ya, za, xb, yb, zb, -xa, ya, za, xb, yb, zb, -xb, yb, zb);
    C.set(i % 2 ? PAINT.deck : PAINT.deck); for (let k = 0; k < 6; k++) dc.push(C.r, C.g, C.b);
    // rail cap: a thin white strip on each rim
    for (const s of [1, -1]) {
      const ra = H.half(ua, H.sheer(ua)), rb = H.half(ub, H.sheer(ub)), yA = H.sheer(ua), yB = H.sheer(ub), zA = H.zAt(ua, yA), zB = H.zAt(ub, yB);
      deck.push(s * ra, yA + 0.02, zA, s * (ra - 0.28), yA + 0.02, zA, s * rb, yB + 0.02, zB, s * rb, yB + 0.02, zB, s * (ra - 0.28), yA + 0.02, zA, s * (rb - 0.28), yB + 0.02, zB);
      C.set(PAINT.topside); for (let k = 0; k < 6; k++) dc.push(C.r, C.g, C.b);
    }
  }
  for (const [p, c] of [[tr, tc], [deck, dc]]) {
    const q = new THREE.BufferGeometry(); q.setAttribute("position", new THREE.Float32BufferAttribute(p, 3)); q.setAttribute("color", new THREE.Float32BufferAttribute(c, 3)); q.computeVertexNormals(); parts.push(q);
  }
  return { parts, H };
}

// ---------------------------------------------------------------- superstructure helpers
// a deckhouse tier: body + optional window band (glass) + roof
function house(P, { w, h, z0, z1, y, hex = PAINT.house, windows = false, winH = 0.95, roof = true }) {
  const d = z1 - z0, zc = (z0 + z1) / 2;
  P.paint.push(box(w, h, d, 0, y + h / 2, zc, hex));
  if (windows) {
    const wy = y + h - winH / 2 - 0.35;
    { const g = new THREE.BoxGeometry(w - 0.5, winH * 1.08, 0.08); g.rotateX(-0.2); g.translate(0, wy, z1 + 0.1); P.glass.push(paint(g, "#0c1219")); }   // raked front
    P.glass.push(box(0.08, winH, d - 0.8, w / 2 + 0.04, wy, zc, "#0c1219"));            // port
    P.glass.push(box(0.08, winH, d - 0.8, -w / 2 - 0.04, wy, zc, "#0c1219"));           // starboard
    P.glass.push(box(w - 1.2, winH * 0.8, 0.08, 0, wy, z0 - 0.04, "#0c1219"));          // aft
    // mullions
    const n = Math.max(3, Math.round(w / 1.4));
    for (let k = 1; k < n; k++) P.paint.push(box(0.12, winH + 0.04, 0.12, -w / 2 + 0.25 + ((w - 0.5) * k) / n, wy, z1 + 0.06, hex));
  }
  if (roof) P.paint.push(roofSlab(w, d, 0, y + h, zc, PAINT.roof, windows ? 0.45 : 0.2));
  return y + h + (roof ? 0.22 : 0);
}

function mast(P, { z, y, h, crossAt = 0.62, radar = true, bird = false, x = 0 }) {
  P.metal.push(cyl(0.34, 0.16, h, x, y, z, PAINT.rail, 10));
  const cy = y + h * crossAt;
  P.metal.push(bar(new THREE.Vector3(x - 2.2, cy, z), new THREE.Vector3(x + 2.2, cy, z), 0.09, PAINT.rail));
  P.metal.push(bar(new THREE.Vector3(x - 1.4, cy + 2.2, z), new THREE.Vector3(x + 1.4, cy + 2.2, z), 0.07, PAINT.rail));
  if (radar) { P.metal.push(box(0.5, 0.5, 0.5, x, cy + 0.35, z, PAINT.rail)); P.paint.push(box(4.2, 0.28, 0.4, x, cy + 0.75, z, "#e9ebe7")); }
  if (bird) P.paint.push(sphere(0.9, x, y + h * 0.84, z, "#f2f2ee", 12));        // bird radar radome
  // stays
  P.metal.push(bar(new THREE.Vector3(x, y + h * 0.95, z), new THREE.Vector3(x + 2.8, y, z - 4), 0.035, "#8f969b", 4));
  P.metal.push(bar(new THREE.Vector3(x, y + h * 0.95, z), new THREE.Vector3(x - 2.8, y, z - 4), 0.035, "#8f969b", 4));
  return { top: new THREE.Vector3(x, y + h, z), cross: new THREE.Vector3(x, cy, z) };
}

// ---------------------------------------------------------------- vessel builders
export function buildVessel(kind, trim = "navy") {
  const S = SPECS[kind] ?? SPECS.pole, trimHex = PAINT.trims[trim] ?? PAINT.trims.navy;
  const P = { paint: [], glass: [], metal: [], lamp: [] };
  const { parts, H } = hullGeometry(S, trimHex);
  P.paint.push(...parts);
  const L = S.L, B = S.B;
  const zOf = (u) => -L / 2 + u * L;
  const dY = (u) => H.deckY(u);
  const anchors = { mastTop: null, port: null, stbd: null, stern: new THREE.Vector3(0, H.sheer(0) + 0.9, -L / 2 + 0.4), floods: [], label: null, bow: new THREE.Vector3(0, H.sheer(1), L / 2) };

  // bridge block
  const [b0, b1] = S.bridge, zb0 = zOf(b0), zb1 = zOf(b1), ub = (b0 + b1) / 2, yb = dY(ub);
  let y = house(P, { w: B * 0.84, h: 2.5, z0: zb0, z1: zb1, y: yb, windows: false });
  y = house(P, { w: B * 0.74, h: 2.4, z0: zb0 + 0.6, z1: zb1 - 0.8, y, windows: false });
  // portholes on the lower tiers
  for (let k = 0; k < 5; k++) for (const s of [1, -1]) P.glass.push(box(0.06, 0.55, 0.55, s * (B * 0.37 + 0.03), yb + 3.7, zb0 + 1.2 + k * ((zb1 - zb0 - 2.4) / 4), "#0c1219"));
  const wy = y;
  y = house(P, { w: B * 0.66, h: 2.35, z0: zb0 + 1.6, z1: zb1 - 1.0, y, windows: true });
  // bridge wings (full beam) + sidelights at their tips
  P.paint.push(box(B * 0.98, 0.2, 2.4, 0, wy + 0.1, zb1 - 2.4, PAINT.house));
  P.paint.push(box(B * 0.98, 1.0, 0.1, 0, wy + 0.6, zb1 - 1.2, PAINT.house));
  anchors.port = new THREE.Vector3(B * 0.49, wy + 1.1, zb1 - 1.8);
  anchors.stbd = new THREE.Vector3(-B * 0.49, wy + 1.1, zb1 - 1.8);
  // compass deck: radar posts on the wheelhouse roof
  P.metal.push(cyl(0.12, 0.12, 1.6, B * 0.18, y, zb0 + 2.4, PAINT.rail)); P.paint.push(box(3.0, 0.2, 0.35, B * 0.18, y + 1.7, zb0 + 2.4, "#e9ebe7"));
  P.metal.push(cyl(0.12, 0.12, 1.2, -B * 0.18, y, zb0 + 2.0, PAINT.rail));
  // funnel aft of the bridge, trim-coloured top
  const zf = zb0 - 2.2, yf = dY(b0 - 0.04);
  P.paint.push(box(1.7, 4.4, 2.4, 0, yf + 2.2, zf, PAINT.funnel)); P.paint.push(box(1.74, 0.8, 2.44, 0, yf + 4.0, zf, trimHex));
  P.metal.push(cyl(0.22, 0.22, 1.0, 0.35, yf + 4.4, zf - 0.3, "#3a3d40")); P.metal.push(cyl(0.22, 0.22, 1.0, -0.35, yf + 4.4, zf - 0.3, "#3a3d40"));

  // main mast
  const um = S.mast, zm = zOf(um), m = mast(P, { z: zm, y: dY(um), h: S.mastH, bird: kind === "pole" || kind === "seine" });
  anchors.mastTop = m.top.clone().add(new THREE.Vector3(0, -0.4, 0.3));
  anchors.label = m.top.clone().add(new THREE.Vector3(0, 3, 0));
  // fore mast / derrick post
  const uf = kind === "longline" || kind === "seine" ? 0.93 : 0.88; mast(P, { z: zOf(uf), y: dY(uf), h: S.mastH * 0.45, radar: false, crossAt: 0.8 });
  // deck floodlights (anchors) along the working deck
  for (const u of [0.15, 0.3, 0.72, 0.9]) anchors.floods.push(new THREE.Vector3(0, dY(u) + 5.2, zOf(u)));
  // hatches and winches
  for (const u of kind === "longline" ? [0.45, 0.5] : [0.2, 0.28, 0.7, 0.78]) P.paint.push(box(B * 0.3, 0.55, 1.8, 0, dY(u) + 0.27, zOf(u), PAINT.deck2));
  P.metal.push(cyl(0.45, 0.45, 1.6, 0, dY(0.94) + 0.5, zOf(0.94), "#56606a", 10, { rz: Math.PI / 2 }));

  const railPts = (u0, u1, n, s, dy = 0.4) => Array.from({ length: n }, (_, k) => { const u = u0 + ((u1 - u0) * k) / (n - 1); const yy = H.sheer(u); return new THREE.Vector3(s * (H.half(u, yy) - 0.15), yy + dy, zOf(u)); });

  if (kind === "pole") {
    // rows of fishing poles along both rails, leaning outboard (the unmistakable silhouette of a Kesennuma skipjack boat)
    for (const s of [1, -1]) for (const [u0, u1, n] of [[0.05, 0.34, 12], [0.66, 0.88, 8]]) for (const p of railPts(u0, u1, n, s, 0.2)) {
      const top = p.clone().add(new THREE.Vector3(s * 3.9, 5.0, -1.4));                  // stowed poles lean outboard
      P.metal.push(bar(p, top, 0.045, PAINT.pole, 4));
    }
    // sprinkler pipes outboard of the hull, just below the rim
    for (const s of [1, -1]) { const a = railPts(0.04, 0.36, 2, s, -0.5); a.forEach((v) => (v.x += s * 0.55)); P.metal.push(bar(a[0], a[1], 0.08, PAINT.rail)); }
    // raised bow platform for the anglers
    P.paint.push(box(B * 0.55, 0.3, L * 0.07, 0, dY(0.93) + 0.6, zOf(0.93), PAINT.deck2));
  } else if (kind === "longline") {
    // covered line-setting shelter aft
    const z0 = zOf(0.04), z1 = zOf(0.38);
    P.paint.push(box(B * 0.9, 2.3, z1 - z0, 0, dY(0.2) + 1.15, (z0 + z1) / 2, PAINT.house));
    P.paint.push(roofSlab(B * 0.9, z1 - z0, 0, dY(0.2) + 2.3, (z0 + z1) / 2, PAINT.roof, 0.15));
    for (let k = 0; k < 6; k++) P.glass.push(box(0.06, 0.5, 0.9, B * 0.45 + 0.03, dY(0.2) + 1.5, z0 + 1.5 + k * ((z1 - z0 - 3) / 5), "#0c1219"));
    // radio buoys with flag poles on the stern rail
    for (let k = 0; k < 7; k++) {
      const x = -B * 0.36 + (k * B * 0.72) / 6, z = zOf(0.035), yy = dY(0.2) + 2.5;
      P.metal.push(cyl(0.04, 0.03, 4.2, x, yy, z, PAINT.pole, 4));
      P.paint.push(box(0.9, 0.55, 0.05, x + 0.45, yy + 3.7, z, k % 2 ? PAINT.float : "#ffd21f"));
      P.paint.push(sphere(0.32, x, yy + 0.2, z, PAINT.float, 8));
    }
    // line hauler + conveyor on the starboard working deck
    P.metal.push(box(0.9, 1.1, 1.4, -B * 0.32, dY(0.56) + 0.55, zOf(0.56), "#5b6570"));
  } else if (kind === "saury") {
    // 集魚灯: two tiers of lamps on outboard rails, both sides, with stanchions
    for (const s of [1, -1]) for (const [u0, u1, dy, out, n] of [[0.07, 0.92, 2.4, 0.9, 40], [0.14, 0.82, 4.3, 0.4, 30]]) {
      const pts = railPts(u0, u1, n, s, dy); pts.forEach((v) => (v.x += s * out));
      P.metal.push(bar(pts[0], pts[pts.length - 1], 0.06, PAINT.rail));
      pts.forEach((p, k) => {
        if (k % 5 === 0) P.metal.push(bar(new THREE.Vector3(p.x - s * out, p.y - dy + 0.3, p.z), p, 0.045, PAINT.rail, 4));
        P.metal.push(box(0.5, 0.12, 0.42, p.x, p.y - 0.08, p.z, "#c9ced2"));                // reflector
        P.lamp.push(box(0.22, 0.34, 0.22, p.x, p.y - 0.32, p.z, dy > 3 && k % 4 === 0 ? "#ff5a3c" : "#fff6e6"));
      });
    }
    // the dip-net boom stowed along the port side
    const a = railPts(0.1, 0.1, 2, 1, 1.2)[0], b = railPts(0.86, 0.86, 2, 1, 1.2)[0];
    P.metal.push(bar(a.add(new THREE.Vector3(0.9, 0, 0)), b.add(new THREE.Vector3(0.9, 0, 0)), 0.18, "#d7d9d4", 8));
    // lamp masts fore and aft
    for (const u of [0.1, 0.9]) P.metal.push(cyl(0.12, 0.1, 7.5, 0, dY(u), zOf(u), PAINT.rail, 6));
  } else if (kind === "seine") {
    // net pile aft + power-block crane
    P.paint.push(box(B * 0.72, 2.0, L * 0.18, 0, dY(0.14) + 1.0, zOf(0.14), PAINT.net));
    P.paint.push(box(B * 0.6, 0.6, L * 0.12, 0.3, dY(0.14) + 2.2, zOf(0.13), "#45574a"));
    const base = new THREE.Vector3(B * 0.2, dY(0.34), zOf(0.34)), tip = new THREE.Vector3(B * 0.28, dY(0.34) + 11, zOf(0.12));
    P.metal.push(cyl(0.35, 0.3, 3, base.x, base.y, base.z, "#e3e5e1", 8));
    P.metal.push(bar(base.clone().add(new THREE.Vector3(0, 3, 0)), tip, 0.2, "#e3e5e1", 8));
    P.metal.push(cyl(0.7, 0.7, 0.6, tip.x, tip.y - 0.6, tip.z, "#2e3238", 12, { rz: Math.PI / 2 }));
  }
  // bow rail stanchions
  for (const s of [1, -1]) for (const p of railPts(0.92, 0.99, 4, s, 0)) P.metal.push(cyl(0.035, 0.035, 1.0, p.x, p.y, p.z, PAINT.rail, 4));

  const merge = (arr) => (arr.length ? mergeGeometries(arr.map((g) => (g.index ? g.toNonIndexed() : g)), false) : null);
  const out = { paint: merge(P.paint), glass: merge(P.glass), metal: merge(P.metal), lamp: merge(P.lamp) };
  for (const g of Object.values(out)) if (g) { g.computeBoundingSphere(); g.computeBoundingBox(); }
  return { kind, trim, parts: out, anchors, dims: { L, B, T: S.T, air: anchors.mastTop.y }, shape: H };
}

export function triangleCount(v) { return Object.values(v.parts).reduce((a, g) => a + (g ? g.attributes.position.count / 3 : 0), 0); }
