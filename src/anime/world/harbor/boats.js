// [v3:harbor] Kesennuma fishing boats at true scale, anime cel style.
// Hull loft adapted from src/web/scene/boats/hulls.js (v2) — rebuilt for toon materials, bulwarks, conformal names.
//
// Local frame: +Z = bow (Sakura convention: model forward = +Z), +Y up, waterline y = 0, +X = port (red), -X = starboard (green).
//
//   katsuo  かつお一本釣り船 ~60 m: high flared bow, bow pole rack (竿), outboard sprinkler pipes (散水), bridge
//           amidships, fore lookout mast, bird radar dome, bait-well hatches.
//   maguro  まぐろはえ縄船 ~50 m: bridge forward, long working deck with the line-setting shelter aft, radio buoys.
//   sanma   さんま棒受網漁船 ~45 m: rows of fish-lamp (集魚灯) bulbs on booms along both sides, red lamps, dip-net boom.
//   small   小型漁船 ~14 m: FRP boat with a small cabin, mast lamp, buoys and a blue tarp.
//   ferry   大島航路 passenger/car ferry ~40 m: two decks of windows, open car deck, bow ramp.
import * as THREE from 'three';
import { nightMat, addGlint, registry } from './lights.js';
import { bar, makeLiner, poseGroup, textTex, FONT, sagPts, mapMat } from './util.js';

export const BOAT_SPECS = {
  katsuo: { L: 60, B: 10.4, T: 4.0, sheer: [3.5, 2.9, 6.8], bulwark: 1.25, ja: 'かつお一本釣り船' },
  maguro: { L: 50, B: 9.0, T: 3.6, sheer: [3.2, 2.7, 5.9], bulwark: 1.2, ja: 'まぐろはえ縄船' },
  sanma: { L: 45, B: 8.4, T: 3.2, sheer: [3.0, 2.5, 5.4], bulwark: 1.1, ja: 'さんま棒受網漁船' },
  small: { L: 14, B: 3.7, T: 0.9, sheer: [1.25, 1.05, 1.9], bulwark: 0.55, ja: '小型漁船' },
  ferry: { L: 40, B: 9.6, T: 2.4, sheer: [2.5, 2.3, 3.4], bulwark: 1.1, ja: '大島航路フェリー' },
};

export const HULL = {
  white: '#e7e9e3', top: '#eceee8', boot: '#2d3346', antifoul: '#8e3d33', deck: '#879e93', deckWood: '#a8876a',
  inner: '#a6c7bc', house: '#e8eae4', roof: '#cfd5d1', dark: '#3b3f4b', mast: '#e2e1d8', steel: '#98a0a8',
  rope: '#c9b48a', float: '#ef7b35', tarp: '#3f7cc0', rust: '#96644e', yellow: '#e9c24a',
};
export const TRIMS = ['#2b3f73', '#b0453a', '#2f6f78', '#3d6b53', '#4b7db4', '#23355e'];

const NAME_NUM = ['一', '二', '三', '五', '七', '八', '十一', '十三', '十八', '二十一', '二十八', '三十一', '三十八', '五十八', '六十八', '八十八'];
const NAME_CORE = ['勝栄丸', '福洋丸', '喜代丸', '明神丸', '寿丸', '豊栄丸', '宝来丸', '幸丸', '晴栄丸', '清福丸', '源栄丸', '海勝丸', '光洋丸', '大栄丸', '千代丸', '長寿丸'];
export function boatName(r, type) {
  if (type === 'ferry') return r.pick(['うみねこ丸', 'みどり丸', 'おおしま丸']);
  if (type === 'small') return r.pick(NAME_CORE);
  return `第${r.pick(NAME_NUM)}${r.pick(NAME_CORE)}`;
}

// ---------------------------------------------------------------------------------------------- hull loft
export function hullShape(S) {
  const { L, B, T, sheer: [s0, s1, s2] } = S;
  const sheer = (u) => (u < 0.45 ? s1 + (s0 - s1) * ((0.45 - u) / 0.45) ** 2 : s1 + (s2 - s1) * ((u - 0.45) / 0.55) ** 2.1);
  const keel = (u) => (u > 0.78 ? T * (1 - 0.72 * ((u - 0.78) / 0.22) ** 1.8) : u < 0.12 ? T * (0.7 + 0.3 * (u / 0.12)) : T);
  const plan = (u) => {
    if (u < 0.28) return (B / 2) * (0.84 + 0.16 * Math.sin((u / 0.28) * Math.PI / 2));
    if (u <= 0.6) return B / 2;
    const k = (u - 0.6) / 0.4; return (B / 2) * Math.pow(Math.max(0, 1 - k * k), 0.62);
  };
  const expo = (u) => (u > 0.6 ? 4.2 - 2.9 * ((u - 0.6) / 0.4) : u < 0.2 ? 2.4 + 1.8 * (u / 0.2) : 4.2);
  const half = (u, y) => {
    const K = keel(u), H = K + sheer(u), t = Math.min(1, Math.max(0, (y + K) / H));
    const flare = 1 + 0.16 * Math.max(0, (u - 0.5) / 0.5) * Math.max(0, y / sheer(u)) ** 1.5;
    return plan(u) * (1 - (1 - t) ** expo(u)) * flare;
  };
  const zAt = (u, y) => -L / 2 + u * L + (u > 0.88 ? ((u - 0.88) / 0.12) ** 1.5 * Math.max(0, y + keel(u)) * 0.42 : 0) - (u < 0.02 ? (1 - u / 0.02) * Math.max(0, y) * 0.12 : 0);
  const deckY = (u) => sheer(u) - S.bulwark;
  const uAtZ = (z) => (z + L / 2) / L;
  return { sheer, keel, plan, half, zAt, deckY, uAtZ, L, B };
}

const _c = new THREE.Color();
function pushCol(arr, hex, n = 1) { _c.set(hex); for (let i = 0; i < n; i++) arr.push(_c.r, _c.g, _c.b); }

/** Hull + bulwark + deck + transom + rail cap as one vertex-coloured geometry. */
function hullGeometry(S, H, trim, opts = {}) {
  const NU = opts.nu || 52;
  const us = Array.from({ length: NU + 1 }, (_, i) => 0.5 - 0.5 * Math.cos((Math.PI * i) / NU));
  const bandLo = opts.bandLo ?? 0.95, bandHi = opts.bandHi ?? 0.35;
  const rows = [
    // the hull stops ~1 m under the waterline (opaque water hides the rest; saves triangles and underwater outlines)
    [(u) => -Math.min(H.keel(u), opts.cut ?? 1.1), HULL.antifoul], [(u) => -Math.min(H.keel(u), opts.cut ?? 1.1) * 0.55, HULL.antifoul], [() => -0.25, HULL.antifoul],
    [() => -0.25, HULL.boot], [() => 0.4, HULL.boot],
    [() => 0.4, HULL.white], [(u) => 0.4 + (H.sheer(u) - bandLo - 0.4) * 0.5, HULL.white], [(u) => H.sheer(u) - bandLo, HULL.white],
    [(u) => H.sheer(u) - bandLo, trim], [(u) => H.sheer(u) - bandHi, trim],
    [(u) => H.sheer(u) - bandHi, HULL.top], [(u) => H.sheer(u), HULL.top],
  ];
  const NR = rows.length;
  const geos = [];
  // outer shell (smooth, indexed) per side
  for (const side of [1, -1]) {
    const pos = [], col = [], idx = [];
    for (const u of us) for (const [fy, hex] of rows) {
      const y = Math.min(fy(u), H.sheer(u));
      pos.push(side * H.half(u, y), y, H.zAt(u, y)); pushCol(col, hex);
    }
    for (let i = 0; i < NU; i++) for (let j = 0; j < NR - 1; j++) {
      const a = i * NR + j, b = a + NR, c = a + 1, d = b + 1;
      if (side > 0) idx.push(a, b, c, c, b, d); else idx.push(a, c, b, c, d, b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
    g.computeVertexNormals();
    geos.push(g.toNonIndexed());
  }
  // flat parts: transom, deck, bulwark inside, rail cap
  const P = [], C = [];
  const quad = (a, b, c, d, hex) => { P.push(...a, ...b, ...c, ...a, ...c, ...d); pushCol(C, hex, 6); };
  const t = opts.bulwarkT ?? 0.22;
  // transom: rows at u = 0
  const u0 = us[0];
  for (let j = 0; j < NR - 1; j++) {
    const ya = Math.min(rows[j][0](u0), H.sheer(u0)), yb = Math.min(rows[j + 1][0](u0), H.sheer(u0));
    const xa = H.half(u0, ya), xb = H.half(u0, yb), za = H.zAt(u0, ya), zb = H.zAt(u0, yb);
    quad([xa, ya, za], [-xa, ya, za], [-xb, yb, zb], [xb, yb, zb], rows[j][1]);
  }
  const deckCol = opts.deck || HULL.deck;
  for (let i = 0; i < NU; i++) {
    const ua = us[i], ub = us[i + 1];
    const da = H.deckY(ua), db = H.deckY(ub), sa = H.sheer(ua), sb = H.sheer(ub);
    const ha = Math.max(0, H.half(ua, da) - t), hb = Math.max(0, H.half(ub, db) - t);
    const za = H.zAt(ua, da), zb = H.zAt(ub, db);
    // deck (faces up)
    quad([-ha, da, za], [-hb, db, zb], [hb, db, zb], [ha, da, za], deckCol);
    for (const s of [1, -1]) {
      const ia = Math.max(0, H.half(ua, sa) - t), ib = Math.max(0, H.half(ub, sb) - t);
      const zsa = H.zAt(ua, sa), zsb = H.zAt(ub, sb);
      // bulwark inner face (faces inboard)
      if (s > 0) quad([ha, da, za], [hb, db, zb], [ib, sb, zsb], [ia, sa, zsa], opts.inner || HULL.inner);
      else quad([-ha, da, za], [-ia, sa, zsa], [-ib, sb, zsb], [-hb, db, zb], opts.inner || HULL.inner);
      // rail cap (faces up)
      const oa = H.half(ua, sa), ob = H.half(ub, sb);
      if (s > 0) quad([ia, sa + 0.001, zsa], [ib, sb + 0.001, zsb], [ob, sb + 0.001, zsb], [oa, sa + 0.001, zsa], HULL.top);
      else quad([-ia, sa + 0.001, zsa], [-oa, sa + 0.001, zsa], [-ob, sb + 0.001, zsb], [-ib, sb + 0.001, zsb], HULL.top);
    }
  }
  // transom inner top (bulwark back wall inside) and deck edge at stern
  {
    const da = H.deckY(u0), sa = H.sheer(u0), h = Math.max(0, H.half(u0, da) - t), hs = Math.max(0, H.half(u0, sa) - t), z = H.zAt(u0, sa) + t;
    quad([-h, da, z], [h, da, z], [hs, sa, z], [-hs, sa, z], opts.inner || HULL.inner);
  }
  const f = new THREE.BufferGeometry();
  f.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); f.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  f.computeVertexNormals();
  geos.push(f);
  return mergeAll(geos);
}

function mergeAll(geos) {
  // tiny merge (all non-indexed, position/normal/color)
  let n = 0; for (const g of geos) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3);
  let o = 0;
  for (const g of geos) { P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); C.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(P, 3)); m.setAttribute('normal', new THREE.BufferAttribute(N, 3)); m.setAttribute('color', new THREE.BufferAttribute(C, 3));
  return m;
}

/** A decal strip that hugs the hull side (names, registry marks). side: +1 port, -1 starboard. */
function hullDecal(H, side, u0, u1, y0, y1, map, mat, parent) {
  const N = 10, pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const u = u0 + (u1 - u0) * (i / N);
    for (let j = 0; j <= 1; j++) {
      const y = j ? y1 : y0;
      pos.push(side * (H.half(u, y) + 0.035), y, H.zAt(u, y));
      // text reads left->right for a viewer outside: on port (+X) that is bow->stern, on starboard stern->bow
      uv.push(side > 0 ? 1 - i / N : i / N, j);
    }
  }
  for (let i = 0; i < N; i++) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; if (side > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; parent.add(m);
  return m;
}

/** Foam ring hugging the waterline (crisp anime foam). */
const _hullCache = new Map(), _foamCache = new Map();
function foamRing(H, mat, parent, r, type) {
  if (_foamCache.has(type)) { const m = new THREE.Mesh(_foamCache.get(type), mat); m.castShadow = false; m.receiveShadow = false; parent.add(m); return m; }
  const N = 64, pos = [], idx = [];
  const pts = [];
  for (let i = 0; i <= N; i++) { const u = i / N; pts.push([H.half(u, 0.02), H.zAt(u, 0.02)]); }
  // loop: port side stern->bow, starboard bow->stern
  const loop = []; for (const p of pts) loop.push([p[0], p[1]]); for (let i = pts.length - 1; i >= 0; i--) loop.push([-pts[i][0], pts[i][1]]);
  const M = loop.length;
  for (let i = 0; i < M; i++) {
    const p = loop[i], q = loop[(i + 1) % M], pr = loop[(i - 1 + M) % M];
    let tx = q[0] - pr[0], tz = q[1] - pr[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    let nx = tz, nz = -tx; // outward for CCW? ensure pointing away from centreline
    if (nx * p[0] + nz * (p[1] - 0) < 0 && Math.abs(p[0]) > 0.01) { nx = -nx; nz = -nz; }
    const w = 0.28 + 0.34 * (0.5 + 0.5 * Math.sin(i * 1.7 + r * 6.28)) + (i / M > 0.4 && i / M < 0.6 ? 0.5 : 0);
    pos.push(p[0] + nx * 0.05, 0.03, p[1] + nz * 0.05, p[0] + nx * w, 0.03, p[1] + nz * w);
  }
  for (let i = 0; i < M; i++) { const a = i * 2, b = a + 1, c = ((i + 1) % M) * 2, d = c + 1; idx.push(a, b, c, c, b, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  if (type) _foamCache.set(type, g);
  const m = new THREE.Mesh(g, mat); m.castShadow = false; m.receiveShadow = false; parent.add(m);
  return m;
}

/** One geometry holding copies of `base` translated to each [x, y, z] (position + normal). */
function mergeAt(base, pts) {
  const b = base.index ? base.toNonIndexed() : base;
  const P = b.attributes.position.array, N = b.attributes.normal.array, n = P.length;
  const pos = new Float32Array(n * pts.length), nor = new Float32Array(n * pts.length);
  pts.forEach((p, i) => { for (let j = 0; j < n; j += 3) { pos[i * n + j] = P[j] + p[0]; pos[i * n + j + 1] = P[j + 1] + p[1]; pos[i * n + j + 2] = P[j + 2] + p[2]; } nor.set(N, i * n); });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return g;
}

// ---------------------------------------------------------------------------------------------- builder
/**
 * Build one boat into a new group at `pose` {x, y?, z, rotY}. Returns {group, type, spec, dims, anchors, name}.
 * opts: seed, name, trim, dynamic (ctx.add instead of addStatic; no wires), flags (大漁旗), lights (true),
 *       glints (true), foam (true), deck (deck colour), idle (laid up: anchor light only; deckLit keeps deck lamps).
 */
export function buildBoat(ctx, type, pose = {}, opts = {}) {
  const S = BOAT_SPECS[type]; if (!S) throw new Error('unknown boat type ' + type);
  const r = ctx.rng(opts.seed ?? `${type}|${pose.x | 0}|${pose.z | 0}`);
  const trim = opts.trim || r.pick(TRIMS);
  const name = opts.name || boatName(r, type);
  const group = poseGroup({ y: 0, ...pose }, `boat:${type}:${name}`);
  const dynamic = !!opts.dynamic;
  if (dynamic) ctx.add(group); else ctx.addStatic(group);
  group.updateMatrixWorld(true);
  const k = ctx.kit(group);
  const W = makeLiner(ctx, group, dynamic);
  const H = hullShape(S);
  const M = mats(ctx, trim);
  // [v3:fix] not every wheelhouse is lit at night (the rows read as identical clones): dark, cool or warm, by seed
  { const lr = ctx.rng((opts.seed ?? `${type}|${pose.x | 0}|${pose.z | 0}`) + '|lit')(); if (!dynamic && lr < 0.34) M.glass = nightMat(ctx, '#3f4c63', '#27304a', 0.7); else if (!dynamic && lr < 0.52) M.glass = M.glassCool; }
  const anchors = { lights: [], perches: [], deck: [] };
  const zU = (u) => -S.L / 2 + u * S.L;
  const dY = (u) => H.deckY(u);

  // hull
  // opts.deck: deck paint (Kesennuma's longliners show bright green decks from the air, data/ortho/core.jpg)
  const hkey = `${type}|${trim}|${opts.deck || ''}`;
  const hg = _hullCache.get(hkey) || _hullCache.set(hkey, type === 'small' ? hullGeometry(S, H, trim, { bandLo: 0.42, bandHi: 0.18, bulwarkT: 0.1, nu: 36, deck: opts.deck || '#9fb3ad', inner: '#dfe6e2', cut: 0.6 })
    : type === 'ferry' ? hullGeometry(S, H, trim, { bandLo: 1.2, bandHi: 0.55, deck: '#8d9994', inner: HULL.white })
    : hullGeometry(S, H, trim, { deck: opts.deck })).get(hkey);
  const hull = new THREE.Mesh(hg, M.hull); hull.castShadow = true; hull.receiveShadow = true; hull.userData.hull = true; group.add(hull);   // [v3:polish3] tag: reflect.js keeps white hulls white
  if (opts.foam !== false) { const f = foamRing(H, M.foam, group, 0.37, type); ctx.noOutline(f); }

  // names: bow (both sides) + stern
  const nameTex = textTex(ctx, name, { w: 768, h: 128, color: '#262532', font: FONT.serif, weight: 900, size: 0.78 });
  const nameMat = mapMat(ctx, 'decal', '#ffffff', nameTex, { transparent: true, alphaTest: 0.35, side: 'double' });
  const nlen = type === 'small' ? 0.26 : 0.16, nu1 = type === 'small' ? 0.86 : 0.9;
  for (const side of [1, -1]) {
    const u1 = nu1, u0 = u1 - nlen, ym = H.sheer((u0 + u1) / 2);
    const hgt = type === 'small' ? 0.42 : 1.15;
    hullDecal(H, side, u0, u1, ym - (type === 'small' ? 0.95 : 2.35) , ym - (type === 'small' ? 0.95 : 2.35) + hgt, nameTex, nameMat, group);
  }
  {
    const port = type === 'ferry' ? '気仙沼' : '気 仙 沼';
    const st = textTex(ctx, `${name}　${port}`, { w: 1024, h: 128, color: '#262532', font: FONT.serif, weight: 900, size: 0.7 });
    const u0 = 0.0, y = H.sheer(u0) - (type === 'small' ? 0.7 : 1.9), hw = H.half(u0, y) * 0.9, z = H.zAt(u0, y) - 0.03;
    k.plane(hw * 2, hw * 2 / 8, mapMat(ctx, 'decal', '#ffffff', st, { transparent: true, alphaTest: 0.35 }), [0, y, z], [0, Math.PI, 0]);
  }

  const T = { S, H, k, W, M, r, group, anchors, zU, dY, trim, name, dynamic, ctx, opts };
  ({ katsuo: buildKatsuo, maguro: buildMaguro, sanma: buildSanma, small: buildSmall, ferry: buildFerry })[type](T);

  // nav lights (port red +X, starboard green -X, masthead + stern white)
  if (opts.lights !== false) navLights(T);
  if (opts.flags) tairyoFlags(T);

  // glow sprites through the life light registry: static boats as world points, dynamic ones follow the group
  const reg = opts.lights === false ? null : registry(ctx);
  // opts.idle: laid up in port (the Med-moored rows) -> no running lights; only the anchor light, deck lamps if deckLit
  if (opts.idle) anchors.lights = anchors.lights.filter((L) => L.kind === 'mast' || (opts.deckLit && L.kind === 'deck'));
  if (reg) {
    if (dynamic) {
      const nav = {}; const deck = [];
      for (const L of anchors.lights) { if (L.kind === 'port' || L.kind === 'starboard' || L.kind === 'mast') nav[L.kind] = L.p; else deck.push(L.p); }
      anchors.lightHandle = reg.boat(group, { nav, deck });
    } else {
      group.updateMatrixWorld(true);
      const v = new THREE.Vector3();
      for (const L of anchors.lights) {
        v.set(L.p[0], L.p[1], L.p[2]).applyMatrix4(group.matrixWorld);
        const nav = L.kind === 'port' || L.kind === 'starboard' || L.kind === 'mast';
        reg.point({ x: v.x, y: v.y, z: v.z, color: L.c, size: nav ? 0.45 : L.kind === 'fishlamp' ? 0.6 : 0.7, intensity: nav ? 2.3 : 1.8, mode: nav ? 'night' : 'lamps' });
      }
    }
  }
  // glints for night reflections of this boat's lights (static boats only)
  if (!dynamic && opts.glints !== false) {
    group.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    for (const L of anchors.lights) {
      v.set(L.p[0], L.p[1], L.p[2]).applyMatrix4(group.matrixWorld);
      addGlint(ctx, v.x, (pose.y || 0), v.z, L.c, L.w || 0.45, Math.min(14, 3 + L.p[1] * 1.1), L.s || 0.7);
    }
  }
  group.updateMatrixWorld(true);
  const _v = new THREE.Vector3();
  const perches = anchors.perches.map((p) => { _v.set(p[0], p[1], p[2]).applyMatrix4(group.matrixWorld); return [_v.x, _v.y, _v.z]; });
  return { group, type, spec: S, dims: { L: S.L, B: S.B, T: S.T, air: anchors.air || 0 }, anchors, perches, name, hull: H };
}

function mats(ctx, trim) {
  const t = (c, o) => ctx.mat.toon(c, o);
  return {
    hull: t('#ffffff', { vertexColors: true, side: 'double', paint: 0.035 }),
    foam: t('#eef5f3', { paint: 0, polygonOffset: -1 }),
    house: t(HULL.house, { paint: 0.04 }), roof: t(HULL.roof), trim: t(trim), dark: t(HULL.dark), mast: t(HULL.mast),
    steel: t(HULL.steel), rope: t(HULL.rope), float: t(HULL.float), tarp: t(HULL.tarp), rust: t(HULL.rust), yellow: t(HULL.yellow),
    deckWood: t(HULL.deckWood), blue: t('#4f86b8'), green: t('#5f8f6a'), red: t('#c2493c'), white: t('#e4e6e0'),
    glass: nightMat(ctx, '#3f4c63', '#ffd6a0', 1.25),
    glassCool: nightMat(ctx, '#465670', '#dfe9ff', 1.15),
    bulb: nightMat(ctx, '#c9c6bc', '#fff4dc', 2.6),   // [v3:fix] unlit glass by day (the near-white globes bloomed out at dusk)
    bulbRed: nightMat(ctx, '#c9665c', '#ff5a3a', 2.2),
    navRed: nightMat(ctx, '#b8403a', '#ff3a2a', 2.4, { always: 0.25 }),
    navGreen: nightMat(ctx, '#3f8f5b', '#3aff7a', 2.2, { always: 0.25 }),
    navWhite: nightMat(ctx, '#bfc3c2', '#fffbe8', 2.4),   // [v3:fix]
    flood: nightMat(ctx, '#d9d6cc', '#ffe8c0', 2.2),
  };
}

// --------------------------------------------------------------------------- superstructure helpers
/** Deckhouse tier: rounded body, window band (night-lit), roof slab with overhang. Returns top y. */
function tier(T, { w, h, z0, z1, y, windows = 'front', winH = 0.9, winY = null, roofOver = 0.3, color = null, cool = false, sideWins = 4, roof = true }) {
  const { k, M } = T; const d = z1 - z0, zc = (z0 + z1) / 2;
  const body = color ? T.ctx.mat.toon(color) : M.house;
  k.rbox(w, h, d, 0.14, body, [0, y + h / 2, zc]);
  const gm = cool ? M.glassCool : M.glass;
  const wy = winY ?? (y + h * 0.62);
  if (windows) {
    if (windows === 'band' || windows === 'front') k.box(w * 0.86, winH, 0.08, gm, [0, wy, z1 + 0.02]);
    if (windows === 'band') {
      for (const s of [1, -1]) k.box(0.08, winH, d * 0.8, gm, [s * (w / 2 + 0.02), wy, zc]);
      k.box(w * 0.7, winH, 0.08, gm, [0, wy, z0 - 0.02]);
    } else if (windows === 'front' && sideWins) {
      const n = sideWins, step = d / (n + 1);
      for (const s of [1, -1]) for (let i = 1; i <= n; i++) k.box(0.08, winH * 0.7, Math.min(0.9, step * 0.55), gm, [s * (w / 2 + 0.02), wy, z0 + step * i]);
    }
  }
  if (roof) k.rbox(w + roofOver * 2, 0.22, d + roofOver * 2, 0.08, M.roof, [0, y + h + 0.11, zc]);
  return y + h + 0.22;
}

/** Railing of wires around a rectangle (deck top). */
function railRect(T, x0, x1, z0, z1, y, h = 1.0) {
  const { W, k, M } = T;
  const pts = [[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]];
  W.line(pts.map((p) => [p[0], y + h, p[1]]), { width: 0.05, color: '#e6e6de' });
  W.line(pts.map((p) => [p[0], y + h * 0.5, p[1]]), { width: 0.035, color: '#e6e6de' });
  for (let i = 0; i < 4; i++) {
    const a = pts[i], b = pts[i + 1], n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.6));
    for (let j = 0; j < n; j++) { const t = j / n; const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t; k.cyl(0.03, 0.03, h, M.white, [x, y + h / 2, z], null, 5); }
  }
}

function mastWithRadars(T, x, z, yBase, h, { radars = 2, dome = false, yard = true } = {}) {
  const { k, M, W } = T;
  k.cyl(0.16, 0.24, h, M.mast, [x, yBase + h / 2, z], null, 10);
  const top = yBase + h;
  if (yard) { k.box(4.2, 0.16, 0.16, M.mast, [x, yBase + h * 0.72, z]); k.box(2.6, 0.14, 0.14, M.mast, [x, yBase + h * 0.9, z]); }
  // radar scanners (open-array bars) on a platform
  k.box(2.4, 0.12, 1.6, M.mast, [x, yBase + h * 0.55, z]);
  for (let i = 0; i < radars; i++) {
    const ry = yBase + h * 0.55 + 0.45 + i * 0.9, rz = z + (i ? -0.5 : 0.4);
    k.box(0.35, 0.35, 0.35, M.dark, [x, ry - 0.2, rz]);
    k.rbox(i ? 3.8 : 2.8, 0.22, 0.28, 0.08, M.white, [x, ry, rz], [0, i ? 0.6 : -0.3, 0]);
  }
  // antennas
  for (const s of [-1, 1]) k.cyl(0.03, 0.04, 3.2, M.white, [x + s * 1.9, yBase + h * 0.72 + 1.6, z], null, 5);
  k.sphere(0.22, M.white, [x + 1.2, yBase + h * 0.9 + 0.3, z], 8);
  if (dome) {
    k.cyl(0.9, 0.9, 0.4, M.mast, [x, top + 0.2, z], null, 14);
    k.mesh(new THREE.SphereGeometry(1.25, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.white, [x, top + 0.4, z]);
  } else k.sphere(0.2, M.white, [x, top + 0.1, z], 8);
  // yardarm halyards
  W.line([[x - 2.1, yBase + h * 0.72, z], [x, yBase + h * 0.45, z - 3.0]], { width: 0.02, color: '#4a4a52' });
  W.line([[x + 2.1, yBase + h * 0.72, z], [x, yBase + h * 0.45, z - 3.0]], { width: 0.02, color: '#4a4a52' });
  T.anchors.perches.push([x, top + (dome ? 1.6 : 0.4), z], [x - 2.1, yBase + h * 0.72 + 0.1, z], [x + 2.1, yBase + h * 0.72 + 0.1, z]);
  T.anchors.mastTop = [x, top, z];
  T.anchors.air = Math.max(T.anchors.air || 0, top + (dome ? 1.7 : 0.3));
  return top;
}

function funnel(T, z, y, w = 1.8, h = 3.0, d = 2.4) {
  const { k, M, ctx } = T;
  k.rbox(w, h, d, 0.2, M.house, [0, y + h / 2, z]);
  k.rbox(w + 0.04, 0.7, d + 0.04, 0.2, M.trim, [0, y + h - 0.7, z]);
  k.cyl(0.24, 0.24, 0.8, M.dark, [0.4, y + h + 0.3, z], null, 8);
  k.cyl(0.18, 0.18, 0.7, M.dark, [-0.4, y + h + 0.25, z - 0.3], null, 8);
  // house mark: a circle with a kanji (fictional)
  const mark = ctx.tex.draw(128, 128, (g) => { g.fillStyle = '#f0ede4'; g.beginPath(); g.arc(64, 64, 58, 0, 7); g.fill(); g.strokeStyle = T.trim; g.lineWidth = 10; g.stroke(); g.fillStyle = T.trim; g.font = `900 70px ${FONT.serif}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(T.r.pick(['勝', '福', '宝', '寿', '栄', '丸']), 64, 68); }, { key: 'hmark|' + T.trim + T.name });
  const mm = mapMat(ctx, 'decal', '#ffffff', mark, { transparent: true, alphaTest: 0.4 });
  for (const s of [1, -1]) k.plane(1.2, 1.2, mm, [s * (w / 2 + 0.03), y + h * 0.45, z], [0, s * Math.PI / 2, 0]);
}

function navLights(T) {
  const { k, M, anchors, S, H } = T;
  const u = T.navU ?? 0.55, y = T.navY ?? (H.sheer(u) + 3.2), z = T.zU(u);
  const hw = (T.navX ?? H.half(u, H.sheer(u)) * 0.72);
  // side-light boxes with the lens facing outboard
  for (const s of [1, -1]) {
    k.box(0.12, 0.6, 0.8, M.dark, [s * (hw + 0.05), y, z]);
    k.box(0.1, 0.36, 0.46, s > 0 ? M.navRed : M.navGreen, [s * (hw + 0.14), y, z + 0.05]);
    anchors.lights.push({ p: [s * (hw + 0.4), y, z], c: s > 0 ? '#ff4a3a' : '#40ff90', w: 0.35, s: 0.8, kind: s > 0 ? 'port' : 'starboard' });
  }
  if (anchors.mastTop) { const m = anchors.mastTop; k.sphere(0.2, M.navWhite, [m[0], m[1] - 0.8, m[2] + 0.3], 8); anchors.lights.push({ p: [m[0], m[1] - 0.8, m[2] + 0.3], c: '#fff3d8', w: 0.3, s: 0.5, kind: 'mast' }); }
  const zs = H.zAt(0, H.sheer(0)) + 0.4;
  k.sphere(0.14, M.navWhite, [0, H.sheer(0) + 0.5, zs], 8);
}

// ---------------------------------------------------------------------------------------------- types
function buildKatsuo(T) {
  const { k, M, W, H, S, zU, dY, r, anchors } = T;
  // --- aft deckhouse + galley
  const yA = dY(0.2);
  tier(T, { w: S.B * 0.62, h: 2.3, z0: zU(0.1), z1: zU(0.28), y: yA, windows: 'front', sideWins: 3, roofOver: 0.4 });
  // awning frame over aft working deck
  const aw = S.B * 0.8;
  for (const zz of [zU(0.03), zU(0.1)]) for (const s of [1, -1]) k.cyl(0.07, 0.07, 2.4, M.white, [s * aw / 2 * 0.9, yA + 1.2 + 0.4, zz], null, 6);
  k.box(aw, 0.12, zU(0.1) - zU(0.02), M.blue, [0, yA + 2.9, (zU(0.02) + zU(0.1)) / 2]);
  // --- bridge block amidships (3 tiers)
  const yB = dY(0.46);
  let y = tier(T, { w: S.B * 0.8, h: 2.5, z0: zU(0.3), z1: zU(0.6), y: yB, windows: 'front', sideWins: 6, winH: 0.75 });
  y = tier(T, { w: S.B * 0.66, h: 2.4, z0: zU(0.4), z1: zU(0.59), y, windows: 'front', sideWins: 3, winH: 0.8 });
  const yWH = y;
  y = tier(T, { w: S.B * 0.56, h: 2.3, z0: zU(0.46), z1: zU(0.585), y, windows: 'band', winH: 1.05, roofOver: 0.55, cool: false });
  // wheelhouse visor + sun awning on flying bridge
  k.box(S.B * 0.56 + 1.0, 0.1, 0.9, M.trim, [0, y - 0.35, zU(0.585) + 0.5], [0.25, 0, 0]);
  railRect(T, -S.B * 0.3, S.B * 0.3, zU(0.46), zU(0.585), y);
  // flying-bridge compass + small helm
  k.cyl(0.25, 0.3, 1.1, M.white, [0, y + 0.55, zU(0.57)], null, 10);
  // bird radar mast on the wheelhouse roof (dome)
  mastWithRadars(T, 0, zU(0.5), y, 9.5, { radars: 2, dome: true });
  // funnel behind bridge
  funnel(T, zU(0.33), yWH - 0.1, 2.0, 3.2, 2.6);
  // --- bait wells (活餌槽) hatches on the fore deck
  for (let i = 0; i < 3; i++) for (const s of [1, -1]) {
    const u = 0.63 + i * 0.06;
    k.rbox(1.9, 0.5, 2.2, 0.1, M.blue, [s * 1.6, dY(u) + 0.25, zU(u)]);
  }
  // --- fore lookout mast with crow's nest
  const uf = 0.84, yf = dY(uf), zf = zU(uf);
  k.cyl(0.14, 0.2, 11, M.mast, [0, yf + 5.5, zf], null, 10);
  k.cyl(0.75, 0.6, 1.0, M.trim, [0, yf + 8.4, zf], null, 12);
  k.cyl(0.8, 0.8, 0.08, M.white, [0, yf + 8.95, zf], null, 12);
  k.box(3.4, 0.12, 0.12, M.mast, [0, yf + 10.0, zf]);
  k.sphere(0.18, M.white, [0, yf + 11.1, zf], 8);
  anchors.perches.push([0, yf + 11.3, zf], [1.6, yf + 10.1, zf], [-1.6, yf + 10.1, zf]);
  // stays: fore mast to stem and to the bridge mast
  const stem = [0, H.sheer(1) + 0.3, H.zAt(1, H.sheer(1)) - 0.3];
  W.line([[0, yf + 10.9, zf], stem], { width: 0.03, color: '#46454e' });
  if (anchors.mastTop) W.line([[0, yf + 10.9, zf], [anchors.mastTop[0], anchors.mastTop[1] - 1.5, anchors.mastTop[2]]], { width: 0.03, color: '#46454e' });
  for (const s of [1, -1]) W.line([[0, yf + 8.2, zf], [s * H.half(uf, H.sheer(uf)) * 0.95, H.sheer(uf), zf - 2.5]], { width: 0.025, color: '#46454e' });
  // --- bow pole rack: a comb of fishing poles standing along both bulwarks (the silhouette of a katsuo boat)
  for (const s of [1, -1]) {
    // rack rail
    const pts = [];
    for (let i = 0; i <= 12; i++) { const u = 0.62 + i * 0.022; pts.push([s * (H.half(u, H.sheer(u)) - 0.45), H.sheer(u) + 0.9, zU(u)]); }
    W.line(pts, { width: 0.07, color: '#d9d5c7' });
    for (let i = 0; i < 26; i++) {
      const u = 0.62 + i * 0.0105 + r.range(-0.002, 0.002);
      const x = s * (H.half(u, H.sheer(u)) - 0.45), y0 = dY(u) + 0.1, z = zU(u);
      const len = r.range(4.6, 5.8), lean = r.range(0.12, 0.3);
      const tip = [x + s * lean, y0 + len, z + r.range(0.1, 0.5)];
      W.line([[x, y0, z], [x + s * lean * 0.45, y0 + len * 0.5, z + 0.1], tip], { width: 0.045, color: r.chance(0.3) ? '#c9ad6d' : '#5b5448' });
    }
  }
  // --- sprinkler pipes (散水) outboard along the fore half, with nozzles
  for (const s of [1, -1]) {
    const pts = []; const noz = [];
    for (let i = 0; i <= 18; i++) {
      const u = 0.4 + i * 0.026, yy = H.sheer(u) - 0.25, x = s * (H.half(u, yy) + 0.55);
      pts.push([x, yy, zU(u)]); if (i % 2 === 0) noz.push([x, yy, zU(u)]);
    }
    W.line(pts, { width: 0.09, color: '#d0d4d4' });
    for (const p of noz) W.line([[p[0] - s * 0.5, p[1] + 0.05, p[2]], [p[0], p[1], p[2]], [p[0] + s * 0.15, p[1] - 0.3, p[2]]], { width: 0.05, color: '#c4c8c8' });
  }
  // mooring gear, bitts, ropes on the fore deck
  bitts(T, 0.93); bitts(T, 0.06);
  T.navU = 0.56; T.navY = yWH + 1.0; T.navX = S.B * 0.33;
  floodLights(T, [[0, yWH + 2.2, zU(0.6) + 0.3, 'f'], [0, yA + 2.6, zU(0.28) + 0.2, 'a']]);
  anchors.deck.push([0, dY(0.7), zU(0.7)], [2, dY(0.15), zU(0.15)], [-2, dY(0.15), zU(0.15)]);
}

function buildMaguro(T) {
  const { k, M, W, H, S, zU, dY, r, anchors } = T;
  // bridge forward (u 0.6 - 0.8)
  let y = tier(T, { w: S.B * 0.78, h: 2.5, z0: zU(0.55), z1: zU(0.8), y: dY(0.68), windows: 'front', sideWins: 5, winH: 0.75 });
  const y1 = y;
  y = tier(T, { w: S.B * 0.62, h: 2.4, z0: zU(0.62), z1: zU(0.79), y, windows: 'band', winH: 1.0, roofOver: 0.5 });
  railRect(T, -S.B * 0.28, S.B * 0.28, zU(0.63), zU(0.78), y);
  mastWithRadars(T, 0, zU(0.68), y, 8.5, { radars: 2, dome: false });
  funnel(T, zU(0.57), y1 - 0.1, 1.8, 2.6, 2.2);
  // forecastle
  k.rbox(S.B * 0.6, 1.4, zU(0.97) - zU(0.84), 0.12, M.house, [0, dY(0.9) + 0.7, (zU(0.84) + zU(0.97)) / 2]);
  // line-setting shelter aft (roof on posts), with a trim-coloured roof
  const z0 = zU(0.06), z1 = zU(0.4), yd = dY(0.25), hw = S.B * 0.42;
  for (let i = 0; i <= 5; i++) for (const s of [1, -1]) k.cyl(0.09, 0.09, 2.7, M.white, [s * hw, yd + 1.35, z0 + (z1 - z0) * i / 5], null, 6);
  k.rbox(hw * 2 + 0.6, 0.22, z1 - z0 + 0.6, 0.08, M.trim, [0, yd + 2.8, (z0 + z1) / 2]);
  // line hauler & baskets of branch lines (blue tubs) & radio buoys with flags on the stern
  for (let i = 0; i < 10; i++) k.cyl(0.42, 0.36, 0.55, M.blue, [r.range(-hw * 0.8, hw * 0.8), yd + 0.28, r.range(z0 + 1.5, z1 - 1.5)], null, 10);
  k.rbox(1.2, 1.0, 1.2, 0.1, M.steel, [hw - 0.6, yd + 0.5, zU(0.44)]);
  for (let i = 0; i < 6; i++) {
    const x = -hw * 0.7 + i * hw * 0.28, zz = zU(0.03) + 0.6, yb = H.sheer(0.03) + 0.1;
    k.sphere(0.32, M.float, [x, yb + 0.3, zz], 10);
    const top = [x + r.range(-0.2, 0.2), yb + 3.6 + r.range(0, 0.8), zz];
    W.line([[x, yb + 0.5, zz], top], { width: 0.04, color: '#3a3a40' });
    const fl = r.pick(['#e24b3b', '#f2c23a', '#3b6fd0']);
    k.plane(0.7, 0.45, T.ctx.mat.toon(fl, { side: 'double' }), [top[0] + 0.36, top[1] - 0.25, top[2]]);
  }
  // aft mast
  k.cyl(0.12, 0.16, 6.5, M.mast, [0, dY(0.05) + 3.25, zU(0.045)], null, 8);
  anchors.perches.push([0, dY(0.05) + 6.6, zU(0.045)]);
  if (anchors.mastTop) W.line([[0, dY(0.05) + 6.3, zU(0.045)], [anchors.mastTop[0], anchors.mastTop[1] - 2, anchors.mastTop[2]]], { width: 0.025, color: '#46454e' });
  bitts(T, 0.95);
  T.navU = 0.72; T.navY = y1 + 1.0; T.navX = S.B * 0.33;
  floodLights(T, [[0, y + 1.8, zU(0.62) - 0.2, 'a'], [0, yd + 2.7, zU(0.2), 'a']]);
  anchors.deck.push([0, yd, zU(0.25)], [1.5, yd, zU(0.15)]);
}

function buildSanma(T) {
  const { k, M, W, H, S, zU, dY, r, anchors, ctx } = T;
  // bridge aft of midships
  let y = tier(T, { w: S.B * 0.8, h: 2.4, z0: zU(0.16), z1: zU(0.42), y: dY(0.3), windows: 'front', sideWins: 5, winH: 0.75 });
  const y1 = y;
  y = tier(T, { w: S.B * 0.62, h: 2.3, z0: zU(0.26), z1: zU(0.41), y, windows: 'band', winH: 1.0, roofOver: 0.5 });
  mastWithRadars(T, 0, zU(0.32), y, 8, { radars: 1, dome: false });
  funnel(T, zU(0.19), y1 - 0.1, 1.7, 2.6, 2.0);
  // fore mast
  const uf = 0.8; k.cyl(0.13, 0.18, 9, M.mast, [0, dY(uf) + 4.5, zU(uf)], null, 8);
  anchors.perches.push([0, dY(uf) + 9.1, zU(uf)]);
  W.line([[0, dY(uf) + 8.8, zU(uf)], [0, H.sheer(1) + 0.3, H.zAt(1, H.sheer(1)) - 0.4]], { width: 0.03, color: '#46454e' });
  // fish-lamp booms: posts along both sides carrying two tiers of rails with hanging bulbs
  const bulbG = new THREE.SphereGeometry(0.15, 8, 6);
  const capG = new THREE.CylinderGeometry(0.06, 0.1, 0.12, 6);
  const bulbsW = [], bulbsR = [], caps = [];
  for (const s of [1, -1]) {
    const tiers = [4.6, 6.6];
    const u0 = 0.08, u1 = 0.93;
    const nPost = 11;
    const railPts = tiers.map(() => []);
    for (let i = 0; i <= nPost; i++) {
      const u = u0 + (u1 - u0) * i / nPost, ys = H.sheer(u), x = s * (H.half(u, ys) + 0.15), z = zU(u);
      k.cyl(0.06, 0.08, tiers[1] + 0.5, M.white, [x, ys + (tiers[1] + 0.5) / 2 - 0.2, z], null, 6);
      tiers.forEach((ty, j) => {
        const out = s * (1.2 + j * 0.5);
        railPts[j].push([x + out, ys + ty, z]);
        W.line([[x, ys + ty + 0.8, z], [x + out, ys + ty, z]], { width: 0.035, color: '#d6d6d0' });
      });
    }
    railPts.forEach((pts) => W.line(pts, { width: 0.07, color: '#d6d6d0' }));
    // bulbs along each rail
    railPts.forEach((pts, j) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        for (let q = 0; q < 6; q++) {
          const t = (q + 0.5) / 6, x = a[0] + (b[0] - a[0]) * t, yy = a[1] + (b[1] - a[1]) * t - 0.3, z = a[2] + (b[2] - a[2]) * t;
          W.line([[x, yy + 0.3, z], [x, yy + 0.2, z]], { width: 0.02, color: '#3a3a44' });
          const red = j === 0 && (i + q) % 7 === 3;
          (red ? bulbsR : bulbsW).push([x, yy, z]); caps.push([x, yy + 0.17, z]);
          if (q === 3) anchors.lights.push({ p: [x, yy, z], c: red ? '#ff6a4a' : '#f4ffe6', w: 0.5, s: 0.55, kind: 'fishlamp' });
        }
      }
    });
  }
  // lamp array on the wheelhouse roof (front)
  for (let i = 0; i < 6; i++) bulbsW.push([-2 + i * 0.8, y + 0.9, zU(0.41) + 0.3]);
  // all bulbs as three merged meshes (hundreds of lamps, three draw sources)
  k.mesh(mergeAt(bulbG, bulbsW), M.bulb); if (bulbsR.length) k.mesh(mergeAt(bulbG, bulbsR), M.bulbRed); k.mesh(mergeAt(capG, caps), M.dark);
  // dip-net boom stowed along the starboard side + net pile
  W.line([[-S.B * 0.3, dY(0.5) + 1.5, zU(0.44)], [-S.B * 0.35, dY(0.85) + 3.5, zU(0.9)]], { width: 0.16, color: '#e2e0d6' });
  k.rbox(3.2, 0.9, 4.2, 0.35, T.ctx.mat.toon('#4c6b5a'), [S.B * 0.12, dY(0.62) + 0.45, zU(0.62)]);
  bitts(T, 0.95); bitts(T, 0.05);
  T.navU = 0.34; T.navY = y1 + 1.0; T.navX = S.B * 0.33;
  anchors.deck.push([0, dY(0.6), zU(0.6)], [1.5, dY(0.5), zU(0.5)]);
}

function buildSmall(T) {
  const { k, M, W, H, S, zU, dY, r, anchors, ctx } = T;
  const yd = dY(0.35);
  // cabin (aft of midships), white with trim roof
  k.rbox(2.4, 1.7, 3.4, 0.14, M.house, [0, yd + 0.85, zU(0.36)]);
  k.box(2.0, 0.55, 0.06, M.glass, [0, yd + 1.25, zU(0.36) + 1.72]);
  for (const s of [1, -1]) k.box(0.06, 0.45, 2.0, M.glass, [s * 1.22, yd + 1.25, zU(0.36) + 0.2]);
  k.rbox(2.8, 0.14, 3.9, 0.06, M.trim, [0, yd + 1.78, zU(0.36)]);
  // mast with lamp + radar
  k.cyl(0.05, 0.07, 3.2, M.mast, [0, yd + 1.85 + 1.6, zU(0.33)], null, 6);
  k.rbox(1.3, 0.13, 0.16, 0.05, M.white, [0, yd + 1.85 + 2.3, zU(0.33)]);
  k.sphere(0.12, M.navWhite, [0, yd + 1.85 + 3.25, zU(0.33)], 8);
  anchors.mastTop = [0, yd + 1.85 + 3.3, zU(0.33)]; anchors.air = yd + 5.3;
  anchors.perches.push([0, yd + 1.85 + 3.4, zU(0.33)], [0.5, yd + 1.85 + 2.4, zU(0.33)]);
  // gear: blue tarp bundle, orange floats along the rail, rope coil, fish boxes
  k.rbox(1.6, 0.5, 1.8, 0.2, M.tarp, [0.3, yd + 0.25, zU(0.66)]);
  for (let i = 0; i < 3; i++) for (const s of [1, -1]) k.sphere(0.22, M.float, [s * (H.half(0.3 + i * 0.18, H.sheer(0.3)) + 0.15), H.sheer(0.3) - 0.3, zU(0.3 + i * 0.18)], 8);
  k.cyl(0.35, 0.35, 0.18, M.rope, [-0.7, yd + 0.1, zU(0.82)], null, 12);
  for (let i = 0; i < 2; i++) k.box(0.8, 0.3, 0.5, i ? M.blue : ctx.mat.toon('#e6dfc9'), [-0.6, yd + 0.15 + i * 0.3, zU(0.14)]);
  // outboard-ish stern frame / net roller
  k.cyl(0.12, 0.12, 2.2, M.steel, [0, H.sheer(0) + 0.35, zU(0.01)], [0, 0, Math.PI / 2], 8);
  W.line([[0, yd + 1.85 + 3.0, zU(0.33)], [0, H.sheer(1) + 0.1, H.zAt(1, H.sheer(1)) - 0.2]], { width: 0.02, color: '#46454e' });
  W.line([[0, yd + 1.85 + 3.0, zU(0.33)], [0, H.sheer(0) + 0.2, zU(0.02)]], { width: 0.02, color: '#46454e' });
  T.navU = 0.36; T.navY = yd + 1.95; T.navX = 1.2;
  anchors.deck.push([0.4, yd, zU(0.7)], [-0.4, yd, zU(0.15)]);
}

function buildFerry(T) {
  const { k, M, W, H, S, zU, dY, r, anchors, ctx } = T;
  const yd = dY(0.4);
  const blue = ctx.mat.toon('#3f7fbf');
  // open car deck forward (u 0.55 - 0.95) with a bow ramp
  k.box(S.B * 0.8, 0.1, zU(0.93) - zU(0.55), ctx.mat.toon('#6f7478'), [0, yd + 0.05, (zU(0.55) + zU(0.93)) / 2]);
  for (let i = 0; i < 3; i++) k.box(0.12, 0.02, zU(0.9) - zU(0.58), ctx.mat.toon('#e6e3d8'), [-2.5 + i * 2.5, yd + 0.11, (zU(0.58) + zU(0.9)) / 2]);
  k.box(S.B * 0.46, 0.25, 3.2, M.steel, [0, H.sheer(0.97) + 0.2, zU(0.97)], [-1.1, 0, 0]);
  // passenger cabins: two decks aft of midships with window rows
  const z0 = zU(0.08), z1 = zU(0.56);
  const c1 = tier(T, { w: S.B * 0.92, h: 2.6, z0, z1, y: yd, windows: false });
  const c2 = tier(T, { w: S.B * 0.8, h: 2.4, z0: zU(0.16), z1: zU(0.54), y: c1, windows: false });
  const wh = tier(T, { w: S.B * 0.5, h: 2.2, z0: zU(0.4), z1: zU(0.53), y: c2, windows: 'band', winH: 1.0, roofOver: 0.4 });
  for (const [yy, w, za, zb] of [[yd + 1.6, S.B * 0.92, z0, z1], [c1 + 1.45, S.B * 0.8, zU(0.16), zU(0.54)]]) {
    const n = Math.floor((zb - za) / 1.8);
    for (const s of [1, -1]) for (let i = 0; i < n; i++) k.box(0.08, 0.9, 1.25, M.glassCool, [s * (w / 2 + 0.02), yy, za + 0.9 + i * 1.8]);
    k.box(w * 0.8, 0.9, 0.08, M.glassCool, [0, yy, zb + 0.02]);
    for (const s of [1, -1]) k.box(0.05, 0.28, zb - za - 0.4, blue, [s * (w / 2 + 0.03), yy - 0.85, (za + zb) / 2]);
  }
  // open upper deck rail + benches
  railRect(T, -S.B * 0.4, S.B * 0.4, zU(0.16), zU(0.38), c2);
  for (let i = 0; i < 3; i++) k.box(2.4, 0.45, 0.5, ctx.mat.toon('#b0835e'), [0, c2 + 0.22, zU(0.2) + i * 2.4]);
  // funnel + mast
  funnel(T, zU(0.3), c2, 1.6, 2.6, 2.0);
  mastWithRadars(T, 0, zU(0.47), wh, 5, { radars: 1, yard: true });
  // route board on the cabin side
  const board = textTex(ctx, '大島航路', { w: 512, h: 128, color: '#f4f2ea', bg: '#3f7fbf', font: FONT.round, weight: 900, size: 0.62 });
  const bm = mapMat(ctx, 'decal', '#ffffff', board);
  for (const s of [1, -1]) k.plane(4.2, 1.05, bm, [s * (S.B * 0.46 + 0.05), c1 - 0.6, zU(0.38)], [0, s * Math.PI / 2, 0]);
  // lifebuoys
  for (const s of [1, -1]) for (let i = 0; i < 2; i++) k.mesh(new THREE.TorusGeometry(0.34, 0.09, 6, 14), M.float, [s * (S.B * 0.4 + 0.1), c1 + 1.2, zU(0.2) + i * 5], [0, Math.PI / 2, 0]);
  T.navU = 0.5; T.navY = wh - 0.6; T.navX = S.B * 0.27;
  floodLights(T, [[0, c2 + 2.5, zU(0.55), 'f']]);
  anchors.deck.push([0, c2, zU(0.25)], [2, yd, zU(0.7)]);
}

// --------------------------------------------------------------------------------------- shared gear
function bitts(T, u) {
  const { k, M, H, zU, dY } = T;
  const y = dY(u), z = zU(u), hw = Math.max(0.6, H.half(u, y) - 0.9);
  for (const s of [1, -1]) {
    k.cyl(0.18, 0.18, 0.55, M.dark, [s * hw, y + 0.27, z - 0.3], null, 8);
    k.cyl(0.18, 0.18, 0.55, M.dark, [s * hw, y + 0.27, z + 0.3], null, 8);
    k.cyl(0.4, 0.4, 0.2, M.rope, [s * (hw - 0.8), y + 0.1, z], null, 10);
  }
}

function floodLights(T, list) {
  const { k, M, anchors } = T;
  for (const [x, y, z, dir] of list) {
    k.box(0.5, 0.3, 0.2, M.dark, [x, y, z]);
    k.box(0.4, 0.2, 0.06, M.flood, [x, y, z + (dir === 'f' ? 0.13 : -0.13)]);
    anchors.lights.push({ p: [x, y, z], c: '#ffe2b0', w: 0.9, s: 0.55, kind: 'deck' });
  }
}

// 大漁旗: festival flags dressed from the fore mast to the stem and the bridge mast (anime colour!)
const FLAG_DESIGNS = [
  { bg: '#d9463b', fg: '#f7f1e3', a: '#f2c230', t: '大漁' },
  { bg: '#2f64b5', fg: '#f7f1e3', a: '#e94b3c', t: '大漁' },
  { bg: '#f2c230', fg: '#b3302a', a: '#2f64b5', t: '祝' },
  { bg: '#3f8f5b', fg: '#f7f1e3', a: '#f2c230', t: '満船' },
];
function flagTex(ctx, d) {
  return ctx.tex.draw(256, 160, (g, w, h) => {
    g.fillStyle = d.bg; g.fillRect(0, 0, w, h);
    // rising sun rays + wave band, painted flat
    g.fillStyle = d.a; g.beginPath(); g.arc(w * 0.22, h * 0.34, h * 0.2, 0, 7); g.fill();
    g.fillStyle = '#f7f1e3'; g.beginPath(); g.moveTo(0, h * 0.8);
    for (let x = 0; x <= w; x += 16) g.quadraticCurveTo(x + 8, h * (0.68 + ((x / 16) % 2) * 0.06), x + 16, h * 0.78);
    g.lineTo(w, h); g.lineTo(0, h); g.fill();
    g.fillStyle = d.fg; g.font = `900 ${h * 0.46}px ${FONT.brush}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(d.t, w * 0.62, h * 0.42);
  }, { key: 'tflag|' + d.t + d.bg });
}
function tairyoFlags(T) {
  const { k, W, H, anchors, ctx, r } = T;
  const top = anchors.perches[anchors.perches.length - 3] || anchors.mastTop; if (!top) return;
  const stem = [0, H.sheer(1) + 0.3, H.zAt(1, H.sheer(1)) - 0.3];
  const n = 6;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.7) / (n + 0.4);
    const p = [top[0] + (stem[0] - top[0]) * t, top[1] + (stem[1] - top[1]) * t - 0.5, top[2] + (stem[2] - top[2]) * t];
    const d = FLAG_DESIGNS[(i + (r() * 4 | 0)) % FLAG_DESIGNS.length];
    const m = mapMat(ctx, 'toon', '#ffffff', flagTex(ctx, d), { side: 'double', paint: 0.02 });
    const f = k.plane(2.2, 1.4, m, [p[0] + 0.02, p[1] - 0.75, p[2]], [0, Math.PI / 2, 0.06 * (i % 2 ? 1 : -1)]);
    f.castShadow = true;
  }
}

// ------------------------------------------------------------------------------------ mooring rows
/**
 * Moor boats along a quay edge a->b (XZ). The water is on the LEFT of a->b unless side = -1.
 * list: [{type, seed?, name?, flags?}], spacing: gap between boats (m), raft: boats rafted 2-abreast when true.
 * Returns the built boats.
 */
export function mooreAlong(ctx, a, b, list, { side = 1, gap = 4, start = 6, raft = false, y = 0, fender = 1.0, bowFirst = true } = {}) {
  const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len;
  const nx = uz * side, nz = -ux * side;  // left normal (toward water)
  const out = []; let s = start;
  for (let i = 0; i < list.length; i++) {
    const it = list[i]; const S = BOAT_SPECS[it.type];
    if (s + S.L > len) break;
    const along = s + S.L / 2;
    const rows = raft && it.raft ? [0, 1] : [0];
    for (const row of rows) {
      const off = fender + S.B / 2 + row * (S.B + 1.2);
      const x = a[0] + ux * along + nx * off, z = a[1] + uz * along + nz * off;
      const fwd = (bowFirst ? 1 : -1) * (i % 3 === 2 ? -1 : 1);
      const rotY = Math.atan2(ux * fwd, uz * fwd);
      out.push(buildBoat(ctx, it.type, { x, y, z, rotY }, { ...it, seed: (it.seed ?? i * 7 + 3) + row * 101 }));
    }
    s += S.L + gap;
  }
  return out;
}

// ------------------------------------------------------------------------------------------ mooring lines
/**
 * Rope lines from a moored boat to its quay edge a->b at height `top`: bow + stern lines and two springs, sagging,
 * via ctx.wires (static boats only). Returns the quay-side tie points (bollard spots) in world coordinates.
 */
export function mooringLines(ctx, boat, a, b, top, { color = '#5c4f3f', width = 0.035, inland = 0.35 } = {}) {   // [v3:fix] darker, thinner rope (read as pale scratches on the seawall) [v3:integrate] rope brown (the pale line glowed white at sunset); tie at the wall edge, not across the promenade
  const g = boat.group; g.updateMatrixWorld(true);
  const H = boat.hull, S = boat.spec;
  const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len;
  // which boat side faces the quay: quay is on the right of a->b (water on the left)
  const toQuay = new THREE.Vector3(-uz, 0, ux);
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
  const lq = toQuay.clone().transformDirection(inv); const side = lq.x >= 0 ? 1 : -1;
  const P = (u) => { const y = H.sheer(u) + 0.2; return new THREE.Vector3(side * (H.half(u, H.sheer(u)) - 0.3), y, H.zAt(u, y)).applyMatrix4(g.matrixWorld); };
  const edge = (p, shift) => {   // project onto the quay edge, shift along it, pull `inland` m inland
    const t = (p.x - a[0]) * ux + (p.z - a[1]) * uz + shift;
    return new THREE.Vector3(a[0] + ux * t - uz * inland, top + 0.45, a[1] + uz * t + ux * inland);
  };
  const bow = P(0.93), stern = P(0.05), mid1 = P(0.6), mid2 = P(0.35);
  const fwd = new THREE.Vector3(0, 0, 1).transformDirection(g.matrixWorld);
  const along = Math.sign(fwd.x * ux + fwd.z * uz) || 1;
  const reach = Math.min(8, S.L * 0.15);
  const pairs = [[bow, edge(bow, along * reach)], [stern, edge(stern, -along * reach)], [mid1, edge(mid1, -along * reach * 0.9)], [mid2, edge(mid2, along * reach * 0.9)]];
  const ties = [];
  for (const [p, q] of pairs) {
    const n = 10, pts = [];
    const sag = Math.max(0.3, p.distanceTo(q) * 0.06);
    for (let i = 0; i <= n; i++) { const t = i / n; pts.push(new THREE.Vector3().lerpVectors(p, q, t).setY(p.y + (q.y - p.y) * t - sag * 4 * t * (1 - t))); }
    ctx.wires.add(pts, { width, color });
    ties.push(q);
  }
  return ties;
}
