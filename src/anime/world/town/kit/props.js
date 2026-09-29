// [v3:town] copied from src/anime/world/_houses/props.js (foundation first-look vendoring of Sakuragaoka Station, MIT); town owns this copy.
// Vendored from Sakuragaoka Station (Kenton-GMI/sakuragaoka-station, MIT; see src/anime/LICENSE-sakuragaoka-station). [v3:foundation] first-look only; town owns buildings.
// Domestic small objects (§十五, §二) and garden plants for the houses module.
// All functions take a Frame (local +Z = outward / toward the viewer) and append to the GeoBatch.
import * as THREE from 'three';
import { rawOf } from './gb.js';
import { shrubGeometry, hedgeGeometry, flowerGeometry, SHRUB_COLORS } from './foliage.js';

const PLANT = {
  green: ['#6f9a5a', '#5f8c5c', '#7aa564', '#86ad6a', '#668f55'],
  dark: ['#4f7a52', '#557f57', '#4a7050'],
  pine: ['#4c7153', '#557a58', '#45684d'],
  young: ['#a9c77c', '#b8d18a', '#9dc073'],
  azalea: ['#e27aa6', '#ec94b8', '#d9679a', '#f2b0c8'],
  hydrangea: ['#a7b8e3', '#b9b1df', '#9fc0e0', '#c6b7e2'],
  flowers: ['#f2c230', '#e8697a', '#f4f0e6', '#b48ad6', '#f29a5c', '#ef9fbe'],
  tulip: ['#e8505b', '#f2c230', '#f49ac1', '#f4f0e6'],
};
export { PLANT };

/** jittered icosahedron blob raw (cached per variant) */
function blobRaw(variant, detail = 1) {
  return rawOf(`blob|${variant}|${detail}`, () => {
    const g = new THREE.IcosahedronGeometry(0.5, detail);
    const p = g.attributes.position;
    const rnd = (i) => { const x = Math.sin((i + 1) * 12.9898 + variant * 78.233) * 43758.5453; return x - Math.floor(x); };
    // weld-aware jitter: hash by rounded position so shared vertices move together
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const h = Math.round(x * 97) * 31 + Math.round(y * 97) * 17 + Math.round(z * 97) * 7 + variant * 101;
      const k = 1 + (rnd(h) - 0.5) * 0.28;
      p.setXYZ(i, x * k, y * k * 0.92, z * k);
    }
    g.computeVertexNormals();
    // smooth normals across seams: icosahedron (non-indexed) -> average by position
    const n = g.attributes.normal, map = new Map();
    for (let i = 0; i < p.count; i++) { const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`; let a = map.get(key); if (!a) map.set(key, (a = [0, 0, 0, []])); a[0] += n.getX(i); a[1] += n.getY(i); a[2] += n.getZ(i); a[3].push(i); }
    for (const a of map.values()) { const l = Math.hypot(a[0], a[1], a[2]) || 1; for (const i of a[3]) n.setXYZ(i, a[0] / l, a[1] / l, a[2] / l); }
    return g;
  });
}

/** tiny berry / bud dot: octahedron (8 tris) with round (radial) normals — plenty at 3–10 cm */
function dotRaw() {
  return rawOf('dot2', () => {
    const g = new THREE.OctahedronGeometry(0.5, 0); const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) { const l = Math.hypot(p.getX(i), p.getY(i), p.getZ(i)) || 1; n.setXYZ(i, p.getX(i) / l, p.getY(i) / l, p.getZ(i) / l); }
    return g;
  });
}

// ---------------------------------------------------------------- smooth foliage (lib/foliage.js)
// Plants are welded, smoothly shaded "puff" surfaces with baked vertex-colour gradients (see lib/foliage.js);
// the GB multiplies those per-vertex colours by the emit colour, so a near-white tint varies each plant.
const FOL = new Map();
let hedgeN = 0;
const folGeo = (key, make) => { let g = FOL.get(key); if (!g) FOL.set(key, (g = make())); return g; };
const folRaw = (key, make) => rawOf('fol|' + key, () => folGeo(key, make).clone());
const TINT = ['#ffffff', '#f3f9ec', '#fbfdf0', '#eef5ea', '#fff9f0', '#f4f4f4'];
const BUSH_KIND = { green: ['boxwood', 'azalea', 'privet'], dark: ['camellia', 'dark'], young: ['young'], pine: ['pine'] };
const TREE_KIND = { maple: 'maple', olive: 'olive', osmanthus: 'dark', camellia: 'camellia', round: 'boxwood' };
const NEUTRAL = { top: '#ffffff', mid: '#e4e4e4', base: '#b4b4b4' }; // tinted by the emit colour
/** round shrub (origin = ground contact) — rb: radius bucket, flat: height factor, spacing: mesh density */
function shrubOpts(kind, rb, flat, variant, detail) {
  return { rx: rb * 1.28, ry: rb * 1.02 * flat, rz: rb * 1.16, seed: 1 + variant * 17, colors: SHRUB_COLORS[kind] || SHRUB_COLORS.boxwood, detail, lumps: 0.2, puff: Math.max(0.14, rb * 0.62) };
}
function shrubKey(kind, rb, flat, variant, spacing) { return 'sh|' + [kind, rb, flat, variant, spacing].join('|'); }
function shrubRaw(kind, rb, flat, variant, spacing) { const o = shrubOpts(kind, rb, flat, variant, spacing); return folRaw(shrubKey(kind, rb, flat, variant, spacing), () => shrubGeometry(o)); }
function shrubBlossoms(kind, rb, flat, variant, spacing, fo) {
  const k = shrubKey(kind, rb, flat, variant, spacing), o = shrubOpts(kind, rb, flat, variant, spacing);
  return folRaw(k + '|fl|' + JSON.stringify(fo), () => flowerGeometry(folGeo(k, () => shrubGeometry(o)), fo));
}
/** drop-in smooth replacement for blobRaw (radius 0.5, centred) for small leaf clumps; neutral colours, tint via emit colour */
function leafRaw(variant, detail = 1) {
  return folRaw(`leaf|${variant}|${detail}`, () => {
    const g = shrubGeometry({ rx: 0.5, ry: 0.46, rz: 0.5, seed: 31 + variant * 7, detail, flatBottom: false, cutBottom: false, lumps: 0.3, freq: 3.2, puff: detail >= 3 ? 0.2 : 0, colors: NEUTRAL, normalBlend: 0.35 }).clone();
    g.translate(0, -0.46 * 0.55, 0);
    return g;
  });
}
/** cloud pad / canopy lobe (radius 0.5 unit, centred); flat pads for pines */
function lobeRaw(kind, variant, flatPad, detail) {
  return folRaw(`lobe|${kind}|${variant}|${flatPad ? 1 : 0}|${detail}`, () => {
    const ry = flatPad ? 0.2 : 0.5;
    const g = shrubGeometry({ rx: 0.52, ry, rz: 0.5, seed: 57 + variant * 11, detail, flatBottom: flatPad, cutBottom: false, lumps: flatPad ? 0.12 : 0.2, freq: 3, puff: flatPad ? 0.2 : 0.24, puffAmp: flatPad ? 0.38 : 0.42, colors: SHRUB_COLORS[kind] || SHRUB_COLORS.boxwood }).clone();
    g.translate(0, -ry * 0.55, 0);
    return g;
  });
}
/** Consume exactly the RNG draws the old multi-blob bush made (keeps every later lot feature in place). */
function burnBush(r, rad, o, hi) {
  const out = [];
  const n = o.n || (rad > 0.5 && hi ? 3 : 2);
  for (let i = 0; i < n; i++) { out.push(r()); if (i) out.push(r()); out.push(r(), r(), r()); }
  if (o.flowers) { const k = Math.round((o.fn || Math.round(5 + rad * 12)) * (hi ? 1 : 0.5)); for (let i = 0; i < k; i++) { out.push(r(), r()); if (!o.fsize) out.push(r()); out.push(r()); } }
  return out;
}

export function makeProps(H) {
  const { M, A, ctx } = H;
  const P = {};
  const pick = (r, a) => a[Math.floor(r() * a.length)];
  const at = (name) => ({ uv: { rect: A.rects[name], white: A.white } });

  // ---------------------------------------------------------------- plants
  /** rounded shrub: one smooth puff-scalloped mass (lib/foliage) + optional blossoms.
   *  flowers: palette name — 'azalea' / 'flowers' -> tiny petal discs, 'hydrangea' -> round flower heads. */
  P.bush = (F, x, y, z, rad, r, o = {}) => {
    const hi = (H.lod ?? 2) >= 2;
    const R = burnBush(r, rad, o, hi);
    const kinds = BUSH_KIND[o.pal || 'green'] || BUSH_KIND.green;
    const kind = kinds[Math.floor(R[0] * kinds.length) % kinds.length];
    const variant = Math.floor(R[1] * 4) % 4;
    const rb = Math.max(0.1, Math.round(rad * 20) / 20);
    const flat = o.flat ? +(o.flat / 0.85).toFixed(2) : 1;
    const sp = o.detail ?? (hi ? (rb <= 0.2 ? 2 : rb <= 0.5 ? 3 : 4) : (rb <= 0.35 ? 1 : 2)); // icosphere detail
    const k = rad / rb, sx = 0.9 + R[2] * 0.2, rot = R[3] * 6.283;
    const m = { sx: k * sx, sy: k, sz: k * (2 - sx), ry: rot };
    F.raw(M.foliage, TINT[Math.floor(R[4] * TINT.length) % TINT.length], shrubRaw(kind, rb, flat, variant, sp), x, y - 0.015, z, m);
    if (!o.flowers) return;
    const nf = Math.round((o.fn || Math.round(5 + rad * 12)) * (hi ? 1.35 : 0.8));
    if (o.flowers === 'hydrangea') { // mophead clusters sitting on the outer surface
      const fs = o.fsize || 0.16;
      for (let i = 0; i < Math.max(2, Math.round(nf / 2.2)); i++) {
        const a = R[(5 + i * 2) % R.length] * 6.283 + i * 2.1, el = 0.2 + R[(6 + i * 2) % R.length] * 0.75;
        const rr = rad * 1.18, px = Math.cos(a) * Math.cos(el) * rr, pz = Math.sin(a) * Math.cos(el) * rr;
        F.raw(M.plain, PLANT.hydrangea[i % PLANT.hydrangea.length], leafRaw(7 + (i % 3), 2), x + px, y + rad * 0.95 + Math.sin(el) * rad * 0.7, z + pz, { sx: fs, sy: fs * 0.82, sz: fs, ry: a });
      }
      return;
    }
    const fo = { count: nf, size: 0.03, colors: PLANT[o.flowers] || PLANT.azalea, seed: variant * 3 + 5, petals: hi && !o.detail ? 5 : 0, minY: 0.35 };
    F.raw(M.plain, null, shrubBlossoms(kind, rb, flat, variant, sp, fo), x, y - 0.015, z, { ...m, noOutline: true, shadow: false });
  };
  /** clipped hedge (生け垣) along local x from x0..x1 at z, height h, depth d: one continuous smooth mass
   *  (flat clipped top, rounded edges and ends, soft leaf puffs) that follows the ground. */
  P.hedge = (F, x0, x1, z, h, d, r, pal = 'green', gy = null) => {
    const L = x1 - x0;
    const n = Math.max(1, Math.round(L / 1.1));
    const R = []; for (let i = 0; i < n; i++) R.push(r(), r()); // same RNG draws as the old blob hedge
    const hi = (H.lod ?? 2) >= 2;
    const cx = (x0 + x1) / 2, g0 = gy ? gy(cx, z) : 0;
    const kind = pal === 'dark' ? 'camellia' : R[0] < 0.55 ? 'privet' : 'boxwood';
    const geo = hedgeGeometry({ length: L + 0.08, h: h * 1.05, d: d * 1.1, seed: 1 + Math.floor(R[1] * 997), colors: SHRUB_COLORS[kind], spacing: hi ? 0.165 : 0.28, ground: gy ? (lx) => gy(cx + lx, z) - g0 : null });
    const raw = rawOf('hedge|' + (++hedgeN), () => geo);
    F.raw(M.foliage, TINT[Math.floor(R[R.length - 1] * TINT.length) % TINT.length], raw, cx, g0 - 0.02, z);
  };
  /** dwarf pine / cloud-pruned niwaki (矮松) — trunk + flat-bottomed cloud pads */
  P.pine = (F, x, y, z, s, r) => {
    const lean = (r() - 0.5) * 0.5;
    const hi = (H.lod ?? 2) >= 2;
    F.cyl(M.plain, '#6b5244', 0.07 * s, 0.9 * s, x, y + 0.45 * s, z, { rz: lean, seg: 6, rTop: 0.05 * s });
    const tx = x - Math.sin(lean) * 0.9 * s;
    const pads = [[0, 1.0, 0, 0.9], [0.35, 0.72, 0.1, 0.62], [-0.38, 0.6, -0.08, 0.55], [0.1, 1.28, -0.05, 0.55]];
    let pi = 0;
    for (const [dx, dy, dz, ps] of pads) {
      const tint = pick(r, PLANT.pine), v = Math.floor(r() * 6);
      F.raw(M.foliage, pi === 3 ? '#f4fbee' : '#ffffff', lobeRaw('pine', v % 3, true, hi ? 3 : 2), tx + dx * s, y + dy * s, z + dz * s, { sx: ps * s * 1.08, sy: ps * s * 1.1, sz: ps * s * 0.92, ry: r() * 6 });
      F.cyl(M.plain, '#6b5244', 0.025 * s, Math.hypot(dx, dy - 0.8) * s, (tx + tx + dx * s) / 2, y + (0.85 + dy) / 2 * s, z + dz * s / 2, { rz: -Math.atan2(dx, dy - 0.8) * 0.8, seg: 5 });
      pi++; void tint;
    }
  };
  /** nandina (南天) — slender stems, reddish leaf tufts, red berries */
  P.nandina = (F, x, y, z, s, r) => {
    for (let i = 0; i < 5; i++) {
      const a = r() * 6.28, d = r() * 0.12 * s, hh = (0.7 + r() * 0.6) * s;
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      F.cyl(M.plain, '#7a6a4a', 0.012 * s, hh, px, y + hh / 2, pz, { seg: 4 });
      const lc = r() < 0.35 ? '#b8584a' : r() < 0.5 ? '#8a9c5a' : '#6f9458';
      F.raw(M.foliage, lc, (H.lod ?? 2) >= 2 ? leafRaw(i % 4, 1) : blobRaw(i, 0), px, y + hh, pz, { sx: 0.34 * s, sy: 0.2 * s, sz: 0.3 * s, ry: r() * 6 });
      if (i < 2) for (let k = 0; k < 4; k++) F.raw(M.plain, '#cf3f3a', dotRaw(), px + (r() - 0.5) * 0.1, y + hh - 0.08 - r() * 0.06, pz + (r() - 0.5) * 0.1, { sx: 0.035, sy: 0.035, sz: 0.035 });
    }
  };
  /** garden tree: kind = 'maple'|'olive'|'osmanthus'|'camellia'|'round' */
  P.tree = (F, x, y, z, s, r, kind = 'round') => {
    const hi = (H.lod ?? 2) >= 2;
    const tc = kind === 'olive' ? '#8f887a' : kind === 'maple' ? '#7a6252' : '#6e5646';
    // species silhouettes: [trunk h, canopy radius, canopy squash, blob count, palette]
    const SP = {
      maple: [1.6, 1.0, 0.74, 6, ['#9fbf72', '#aac87c', '#94b56a', '#b4cd86']],      // fresh spring モミジ, layered tiers
      olive: [1.2, 0.7, 0.85, 5, ['#9fae8a', '#aab996', '#8fa27f']],
      osmanthus: [0.7, 0.62, 1.35, 5, ['#4f7a52', '#557f57', '#5f8c5c']],             // 金木犀: dense upright oval
      camellia: [0.55, 0.6, 1.15, 5, PLANT.dark],
      round: [1.25, 0.8, 0.8, 5, PLANT.green],
    }[kind] || [1.25, 0.8, 0.8, 5, PLANT.green];
    const [th, cr, sq, nb, pal] = SP;
    const h = th * s, R = cr * s;
    const lean = (r() - 0.5) * 0.16;
    const lx = Math.sin(lean) * h, tx = x - lx;
    F.cyl(M.plain, tc, 0.085 * s, h + 0.2 * s, x - lx / 2, y + h / 2, z, { seg: 6, rTop: 0.055 * s, rz: lean });
    // two short limbs
    if (hi && kind !== 'osmanthus' && kind !== 'camellia') for (const sd of [-1, 1]) {
      const a = r() * 6.28;
      F.beam(M.plain, tc, [tx, y + h * 0.9, z], [tx + Math.cos(a) * R * 0.55, y + h + R * 0.25 * sd + 0.2 * s, z + Math.sin(a) * R * 0.55], 0.05 * s, 0.05 * s);
    }
    const n = nb - (hi ? 0 : 2);
    const cy = y + h + R * sq * 0.55;
    for (let i = 0; i < n; i++) {
      // one crown blob + a ring of smaller lobes; maple lobes sit in two flat tiers
      const top = i === 0;
      const a = i * 2.39996 + r() * 0.6, d = top ? 0 : R * (0.36 + r() * 0.18);
      const tier = kind === 'maple' ? (i % 2 ? -0.2 : 0.08) * R : (r() - 0.55) * R * sq * 0.6;
      const bs = (top ? 1.25 : 0.8 + r() * 0.3) * R;
      const tint = pick(r, pal), v = Math.floor(r() * 6);
      F.raw(M.foliage, top ? '#ffffff' : TINT[(i + v) % TINT.length], lobeRaw(TREE_KIND[kind] || 'boxwood', v % 4, false, hi ? (top ? 3 : 2) : (top ? 2 : 1)), tx + Math.cos(a) * d, cy + (top ? R * sq * 0.18 : tier), z + Math.sin(a) * d, { sx: bs, sy: bs * sq, sz: bs, ry: r() * 6 }); void tint;
    }
    if (kind === 'camellia') for (let k = 0; k < 12; k++) { const a = r() * 6.28, e = r(); F.raw(M.plain, r() < 0.5 ? '#d9485a' : '#ef8fa6', leafRaw(k % 3, 1), tx + Math.cos(a) * R * 1.02, cy + (e - 0.5) * R * sq * 1.4, z + Math.sin(a) * R * 1.02, { sx: 0.1, sy: 0.08, sz: 0.1 }); }
  };
  /** flower pot / planter. kind: 'terra'|'glaze'|'plastic' */
  P.pot = (F, x, y, z, r, scale = 1, kind = null) => {
    const k = kind || pick(r, ['terra', 'terra', 'glaze', 'plastic', 'glaze']);
    const col = k === 'terra' ? pick(r, ['#c07a55', '#b86f4e', '#c98a62']) : k === 'glaze' ? pick(r, ['#4f6f94', '#5f7c6a', '#3e5a78', '#7b5f86', '#e5dfcf']) : pick(r, ['#6b6e73', '#e2ded2', '#5b7a5b']);
    const pr = (0.13 + r() * 0.08) * scale, ph = pr * (1.1 + r() * 0.4);
    const hi = (H.lod ?? 2) >= 2;
    F.cyl(M.plain, col, pr * 0.82, ph, x, y + ph / 2, z, { rTop: pr, seg: 7 });
    if (hi) F.cyl(M.plain, col, pr * 1.08, 0.04, x, y + ph - 0.02, z, { seg: 7, open: true });
    F.cyl(M.soil, '#8a7058', pr * 0.95, 0.02, x, y + ph - 0.01, z, { seg: 6 });
    const t = r();
    if (t < 0.35) P.bush(F, x, y + ph * 0.8, z, pr * 1.2, r, { pal: 'green', n: 2, flowers: r() < 0.6 ? 'flowers' : null, fn: 4, detail: (H.lod ?? 2) >= 2 && pr > 0.17 ? 2 : 1 });
    else if (t < 0.55) { // tulips
      for (let i = 0; i < 4; i++) { const a = i * 1.6 + r(), d = pr * 0.5; const hh = 0.22 * scale + r() * 0.08; F.cyl(M.plain, '#6f9a5a', 0.008, hh, x + Math.cos(a) * d, y + ph + hh / 2, z + Math.sin(a) * d, { seg: 3 }); F.raw(M.plain, pick(r, PLANT.tulip), dotRaw(), x + Math.cos(a) * d, y + ph + hh, z + Math.sin(a) * d, { sx: 0.05 * scale, sy: 0.07 * scale, sz: 0.05 * scale }); }
      F.raw(M.plain, '#7aa564', leafRaw(3, 1), x, y + ph + 0.04, z, { sx: pr * 1.6, sy: 0.08, sz: pr * 1.6 });
    } else if (t < 0.7) P.bush(F, x, y + ph * 0.85, z, pr * 1.0, r, { pal: 'green', n: 1, flat: 1.4, detail: (H.lod ?? 2) >= 2 && pr > 0.17 ? 2 : 1 }); // upright foliage
    else if (t < 0.85) P.nandina(F, x, y + ph * 0.9, z, 0.55 * scale, r);
    else P.bush(F, x, y + ph * 0.8, z, pr * 1.3, r, { pal: 'green', n: 2, flowers: 'azalea', fn: 4, detail: (H.lod ?? 2) >= 2 && pr > 0.17 ? 2 : 1 });
  };
  /** small sill pot (window ledge) */
  P.sillPot = (F, x, y, z) => {
    F.boxB(M.plain, '#c07a55', 0.18, 0.1, 0.1, x, y, z);
    F.raw(M.plain, '#e8697a', leafRaw(8, 1), x - 0.04, y + 0.15, z, { sx: 0.1, sy: 0.08, sz: 0.1 });
    F.raw(M.plain, '#6f9a5a', leafRaw(4, 1), x + 0.03, y + 0.13, z, { sx: 0.14, sy: 0.08, sz: 0.1 });
  };
  /** planter box with pansies / tulips */
  P.planter = (F, x, y, z, len, r) => {
    F.boxB(M.plain, pick(r, ['#8a6446', '#d9d2c2', '#6b6e73', '#b48a62']), len, 0.26, 0.28, x, y, z);
    F.boxB(M.soil, '#8a7058', len - 0.06, 0.02, 0.22, x, y + 0.24, z, { uv: { world: 0.5 } });
    const n = Math.round(len / 0.14);
    for (let i = 0; i < n; i++) { const px = x - len / 2 + 0.08 + i * (len - 0.16) / Math.max(1, n - 1); F.raw(M.plain, '#6f9a5a', (H.lod ?? 2) >= 2 ? leafRaw(i % 4, 1) : blobRaw(i % 6, 0), px, y + 0.3, z + (r() - 0.5) * 0.1, { sx: 0.15, sy: 0.1, sz: 0.15 }); F.raw(M.plain, pick(r, PLANT.flowers), dotRaw(), px + 0.02, y + 0.35, z + (r() - 0.5) * 0.1, { sx: 0.07, sy: 0.05, sz: 0.07 }); }
  };
  /** bonsai shelf (盆栽棚) */
  P.bonsaiShelf = (F, x, y, z, r) => {
    const wc = '#8a6446';
    for (const s of [-1, 1]) F.boxB(M.plain, wc, 0.06, 0.8, 0.4, x + s * 0.55, y, z);
    for (const hh of [0.4, 0.78]) F.boxB(M.wood, '#b48a62', 1.2, 0.04, 0.42, x, y + hh, z, { uv: { world: 1.2 } });
    for (let i = 0; i < 4; i++) {
      const px = x - 0.42 + i * 0.28, py = y + (i % 2 ? 0.82 : 0.44);
      F.boxB(M.plain, pick(r, ['#5a4c44', '#4f6f94', '#7a5a4a']), 0.2, 0.06, 0.14, px, py, z);
      F.cyl(M.plain, '#6b5244', 0.015, 0.14, px, py + 0.12, z, { rz: (r() - 0.5), seg: 4 });
      F.raw(M.plain, pick(r, PLANT.pine), leafRaw(i % 4, 1), px + (r() - 0.5) * 0.06, py + 0.2, z, { sx: 0.2, sy: 0.08, sz: 0.14 });
    }
  };
  /** stone lantern (石灯籠) */
  P.lantern = (F, x, y, z) => {
    const c = '#a9a79f';
    F.boxB(M.concrete, c, 0.4, 0.12, 0.4, x, y, z, { uv: { world: 2 } });
    F.cyl(M.concrete, c, 0.08, 0.5, x, y + 0.37, z, { seg: 6 });
    F.boxB(M.concrete, c, 0.34, 0.08, 0.34, x, y + 0.62, z, { uv: { world: 2 } });
    F.boxB(M.concrete, '#9d9b94', 0.26, 0.24, 0.26, x, y + 0.7, z, { uv: { world: 2 } });
    F.box(M.plain, '#3e3a44', 0.12, 0.1, 0.27, x, y + 0.82, z);
    F.cyl(M.concrete, c, 0.04, 0.18, x, y + 0.99, z, { rTop: 0.28, seg: 6 });
    F.raw(M.concrete, c, blobRaw(1, 0), x, y + 1.12, z, { sx: 0.12, sy: 0.12, sz: 0.12 });
  };
  /** stepping stones from (x0,z0) to (x1,z1) */
  P.steppingStones = (F, x0, z0, x1, z1, gy, r) => {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.round(L / 0.55));
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; const x = x0 + (x1 - x0) * t + (r() - 0.5) * 0.12, z = z0 + (z1 - z0) * t + (r() - 0.5) * 0.08; F.cyl(M.concrete, pick(r, ['#a8a59c', '#9b988f', '#b3b0a6']), 0.2 + r() * 0.06, 0.06, x, gy(x, z) + 0.02, z, { seg: 7, ry: r() * 3, uv: { world: 2 } }); }
  };

  // ---------------------------------------------------------------- domestic
  /** AC outdoor unit (室外機) on a base, front facing +z; optional pipe cover up the wall to toY */
  P.acUnit = (F, u, y, z, toY) => {
    const c = '#e7e5de';
    const w = 0.8, h = 0.56, d = 0.28;
    F.boxB(M.plain, '#5a5c62', w * 0.9, 0.1, d + 0.02, u, y, z);
    F.boxB(M.atlas, c, w, h, d, u, y + 0.1, z, at('ac_front'));
    F.box(M.plain, '#d9d7cf', w + 0.02, 0.03, d + 0.02, u, y + 0.1 + h, z);
    if (toY) {
      const px = u + w / 2 - 0.08;
      F.box(M.plain, '#dcd8cc', 0.1, 0.08, z - d / 2 + 0.02, px, y + 0.45, (z - d / 2) / 2 + 0.01);
      F.boxB(M.plain, '#dcd8cc', 0.1, toY - (y + 0.4), 0.08, px, y + 0.4, 0.04);
      F.box(M.plain, '#cfcabd', 0.14, 0.14, 0.1, px, toY + 0.05, 0.05);
    }
  };
  P.elecMeter = (F, u, y) => {
    F.box(M.plain, '#5f6166', 0.24, 0.36, 0.09, u, y, 0.045);
    F.box(M.atlas, '#ffffff', 0.17, 0.25, 0.11, u, y + 0.01, 0.07, at('elec_meter'));
    F.boxB(M.plain, '#8d9197', 0.05, 1.3, 0.05, u + 0.1, y + 0.2, 0.03);
  };
  P.gasMeter = (F, u, y, g0) => {
    F.box(M.atlas, '#ffffff', 0.28, 0.32, 0.16, u, y, 0.1, at('gas_meter'));
    const pc = '#d6c06a';
    F.boxB(M.plain, pc, 0.035, y - 0.16 - g0 + 0.05, 0.035, u - 0.08, g0 - 0.05, 0.1);
    F.box(M.plain, pc, 0.035, 0.035, 0.1, u + 0.08, y + 0.22, 0.05);
    F.boxB(M.plain, pc, 0.035, 0.24, 0.035, u + 0.08, y + 0.16, 0.1);
  };
  P.propane = (F, u, g0) => {
    for (const s of [-0.21, 0.21]) {
      F.cyl(M.plain, '#dcdcd6', 0.17, 1.12, u + s, g0 + 0.56, 0.22, { seg: 10 });
      F.raw(M.plain, '#dcdcd6', blobRaw(0, 1), u + s, g0 + 1.12, 0.22, { sx: 0.34, sy: 0.2, sz: 0.34 });
      F.cyl(M.plain, '#8a8f96', 0.09, 0.12, u + s, g0 + 1.25, 0.22, { seg: 8, open: true });
    }
    F.box(M.plain, '#6d747c', 0.9, 0.02, 0.02, u, g0 + 0.9, 0.4);
    F.box(M.plain, '#8a8f96', 0.2, 0.14, 0.08, u, g0 + 1.35, 0.05);
    F.boxB(M.concrete, '#b9b8b2', 0.9, 0.06, 0.48, u, g0 - 0.02, 0.24, { uv: { world: 2 } });
  };
  P.waterHeater = (F, u, y) => {
    F.box(M.plain, '#ecebe6', 0.46, 0.6, 0.22, u, y, 0.11);
    F.box(M.atlas, '#ffffff', 0.3, 0.1, 0.01, u, y + 0.14, 0.226, at('vent'));
    for (let k = 0; k < 3; k++) F.boxB(M.plain, k === 0 ? '#c9a24a' : '#9aa1a8', 0.03, 0.5, 0.03, u - 0.12 + k * 0.12, y - 0.8, 0.08);
  };
  P.ventHood = (F, u, y) => {
    F.box(M.plain, '#dedbd3', 0.18, 0.18, 0.1, u, y, 0.05);
    F.box(M.plain, '#d4d1c8', 0.2, 0.03, 0.15, u, y + 0.1, 0.075, { rx: 0.35 });
  };
  /** BS/CS satellite dish (small, white) facing the local direction ry */
  P.dish = (F, x, y, z, ry) => {
    const DF = F.sub(x, y, z, ry);
    DF.cyl(M.plain, '#e9e8e3', 0.23, 0.03, 0, 0.12, 0.08, { rx: -0.9, seg: 12 });
    DF.box(M.plain, '#bfc3c8', 0.03, 0.03, 0.35, 0, 0.0, 0.2, { rx: 0.35 });
    DF.box(M.plain, '#d8d8d4', 0.06, 0.06, 0.08, 0, -0.05, 0.36);
    DF.box(M.plain, '#9aa1a8', 0.04, 0.3, 0.04, 0, -0.05, 0.0);
  };
  /** nameplate 表札 */
  P.plate = (F, x, y, z, name) => {
    const v = name && name.startsWith('plateV');
    F.box(M.atlas, '#ffffff', v ? 0.12 : 0.26, v ? 0.3 : 0.1, 0.025, x, y, z + 0.012, at(name || 'plateH0'));
  };
  /** futon draped over a balcony railing (outside) */
  P.futon = (F, x, y, z, r) => {
    const pat = pick(r, ['futon_a', 'futon_b', 'futon_c']);
    const w = 1.0, hh = 0.75;
    F.box(M.atlas, '#ffffff', w, hh, 0.09, x, y - hh / 2 + 0.04, z + 0.08, { uv: { rect: A.rects[pat], white: A.white, faces: 'front' } });
    F.box(M.atlas, '#ffffff', w, 0.4, 0.09, x, y - 0.18, z - 0.08, { uv: { rect: A.rects[pat], white: A.white, faces: 'front' } });
    F.cyl(M.plain, '#efe7ea', 0.075, w, x, y + 0.04, z, { rz: Math.PI / 2, seg: 8 });
    for (const s of [-0.3, 0.3]) F.box(M.plain, '#6a8fc0', 0.05, 0.14, 0.24, x + s, y + 0.02, z);
  };
  /** doorstep life around the porch (face frame of the entrance) */
  P.doorstep = (F, du, dw, top, pw, pd, S) => {
    const r = S.rng;
    // mat
    F.boxB(M.plain, pick(r, ['#6b5a4c', '#5b5f6a', '#7a6a50', '#4f5f58']), 0.75, 0.015, 0.45, du, top, 0.45);
    // sandals
    if (r() < 0.55) { const sx = du + (r() - 0.5) * 0.4; for (const s of [-0.07, 0.07]) F.boxB(M.plain, pick(r, ['#3e5a78', '#8a6446', '#c9b6a0']), 0.1, 0.03, 0.26, sx + s, top, 0.75 + (r() - 0.5) * 0.05, { ry: (r() - 0.5) * 0.4 }); }
    const side = du > 0 ? -1 : 1; // put stuff on the side away from the lamp
    const sx = du + side * (pw / 2 - 0.25);
    // umbrella stand + umbrellas
    if (r() < 0.65) {
      F.cyl(M.plain, pick(r, ['#8a8f96', '#6b5a4c', '#c9c2b2']), 0.12, 0.45, sx, top + 0.225, 0.3, { seg: 8 });
      for (let i = 0; i < 3; i++) {
        const c = pick(r, ['#3f5f8f', '#e9e4da', '#c84a57', '#4f7a52', '#e8b84a', '#3a3346']);
        const a = (i - 1) * 0.22;
        F.cyl(M.plain, c, 0.035, 0.75, sx + Math.sin(a) * 0.18, top + 0.5, 0.3 + (i - 1) * 0.04, { rz: a, seg: 6, rTop: 0.012 });
        F.box(M.plain, '#6b5244', 0.02, 0.1, 0.06, sx + Math.sin(a) * 0.36, top + 0.9, 0.3 + (i - 1) * 0.04, { rz: a });
      }
    }
    // a folded umbrella left leaning by the door (折りたたみ傘)
    if (r() < 0.22) { const ux = du + side * (dw / 2 + 0.12); F.cyl(M.plain, pick(r, ['#3f5f8f', '#c84a57', '#6b5a8a', '#4f7a52']), 0.028, 0.62, ux, top + 0.3, 0.07, { rz: side * 0.14, rx: -0.1, seg: 6, rTop: 0.012 }); F.box(M.plain, '#3a3346', 0.025, 0.08, 0.025, ux - side * 0.04, top + 0.64, 0.04); }
    // parcel / cardboard box
    if (r() < 0.25) F.boxB(M.atlas, '#ffffff', 0.4, 0.3, 0.3, du - side * (pw / 2 - 0.3), top, 0.35, { ...at('cardboard'), ry: (r() - 0.5) * 0.3 });
    else if (r() < 0.2) F.boxB(M.atlas, '#ffffff', 0.45, 0.55, 0.4, du - side * (pw / 2 - 0.3), top, 0.28, at('parcel_box'));
    // milk box on the wall
    if (r() < 0.3) F.box(M.atlas, '#ffffff', 0.24, 0.2, 0.18, du - side * (dw / 2 + 0.45), top + 1.05, 0.09, at('milk'));
    // potted plants flanking the porch
    const np = 1 + Math.floor(r() * 3);
    for (let i = 0; i < np; i++) P.pot(F, du + (i % 2 ? 1 : -1) * (pw / 2 + 0.25 + r() * 0.2), (S.groundFront ?? 0), 0.35 + i * 0.35, r, 1.1);
    // watering can / bucket
    if (r() < 0.35) P.wateringCan(F, du + side * (pw / 2 + 0.5), S.groundFront ?? 0, 1.0, r);
    if (r() < 0.2) P.bucket(F, du - side * (pw / 2 + 0.55), S.groundFront ?? 0, 0.9, r);
  };
  P.wateringCan = (F, x, y, z, r) => {
    const c = pick(r, ['#5f9a6a', '#e3a33b', '#6f8fbf', '#c9c2b2']);
    F.cyl(M.plain, c, 0.1, 0.2, x, y + 0.1, z, { seg: 8 });
    F.beam(M.plain, c, [x + 0.08, y + 0.08, z], [x + 0.28, y + 0.24, z], 0.025, 0.025);
    F.box(M.plain, c, 0.04, 0.08, 0.02, x - 0.05, y + 0.26, z);
    F.box(M.plain, c, 0.12, 0.02, 0.02, x, y + 0.3, z);
  };
  P.bucket = (F, x, y, z, r) => {
    const c = pick(r, ['#4f7fc4', '#d9575a', '#e8c84a', '#e2ded2']);
    F.cyl(M.plain, c, 0.14, 0.26, x, y + 0.13, z, { rTop: 0.14, seg: 8, open: true });
    F.cyl(M.plain, c, 0.1, 0.02, x, y + 0.01, z, { seg: 8 });
    F.box(M.plain, '#8a8f96', 0.26, 0.012, 0.012, x, y + 0.32, z);
  };
  P.broom = (F, x, y, z, ry = 0) => { // 竹箒 leaning on a wall
    F.cyl(M.plain, '#c9b27a', 0.015, 1.3, x, y + 0.8, z + 0.1, { rx: -0.18, seg: 4 });
    F.cyl(M.plain, '#a88f5a', 0.02, 0.45, x, y + 0.22, z + 0.2, { rx: -0.18, seg: 5, rTop: 0.15 });
  };
  P.dustpan = (F, x, y, z) => { F.box(M.plain, '#4f7fc4', 0.26, 0.04, 0.22, x, y + 0.02, z); F.box(M.plain, '#4f7fc4', 0.03, 0.5, 0.03, x, y + 0.3, z - 0.08, { rx: -0.2 }); };
  P.umbrellaFolded = (F, x, y, z, r) => { const c = pick(r, ['#3f5f8f', '#c84a57', '#e9e4da', '#6b5a8a']); F.cyl(M.plain, c, 0.03, 0.3, x, y + 0.15, z, { seg: 6 }); F.box(M.plain, '#3a3346', 0.02, 0.06, 0.02, x, y + 0.33, z); };
  /** garbage sorting bins (分別ゴミ箱) */
  P.bins = (F, x, y, z, r, n = 2) => {
    const labels = ['bin_burn', 'bin_res', 'bin_pla'];
    const cols = ['#6b8f6b', '#5a7fa8', '#8a8f96'];
    for (let i = 0; i < n; i++) {
      const bx = x + (i - (n - 1) / 2) * 0.5;
      const c = cols[i % 3];
      F.boxB(M.plain, c, 0.42, 0.62, 0.42, bx, y, z);
      F.boxB(M.plain, c, 0.46, 0.06, 0.46, bx, y + 0.62, z);
      F.box(M.atlas, '#ffffff', 0.3, 0.12, 0.01, bx, y + 0.45, z + 0.215, at(labels[i % 3]));
    }
  };
  /** steel storage shed (物置) — front faces +z */
  P.shed = (F, x, y, z, r, w = 1.7) => {
    const c = pick(r, ['#dcd8cc', '#c9cfc6', '#d5d2c8']);
    F.boxB(M.plain, '#8a8f96', w + 0.05, 0.1, 0.95, x, y - 0.02, z);
    F.boxB(M.atlas, c, w, 1.75, 0.9, x, y + 0.08, z, at('shed_door'));
    F.box(M.metal, '#7b8691', w + 0.16, 0.05, 1.05, x, y + 1.88, z, { rx: 0.08, uv: { world: 0.9 } });
  };
  /** outside tap (立水栓) + hose reel */
  P.faucet = (F, x, y, z, r) => {
    F.boxB(M.concrete, '#c9c7c0', 0.14, 0.8, 0.14, x, y, z, { uv: { world: 2 } });
    F.box(M.plain, '#c9ccd1', 0.03, 0.03, 0.12, x, y + 0.7, z + 0.1);
    F.box(M.plain, '#9aa1a8', 0.3, 0.05, 0.3, x, y + 0.02, z + 0.2);
    if (r() < 0.6) { F.box(M.atlas, '#ffffff', 0.36, 0.36, 0.1, x + 0.35, y + 0.3, z + 0.05, at('hose')); F.box(M.plain, '#8a8f96', 0.05, 0.4, 0.12, x + 0.35, y + 0.2, z + 0.05); }
  };
  /** laundry stand in a yard (物干し台): two stands + poles; laundry optional */
  P.laundryStand = (F, x, z, gy, len, r, withLaundry = true) => {
    const c = '#c9ccd1';
    for (const s of [-1, 1]) {
      const px = x + s * len / 2, g = gy(px, z);
      F.boxB(M.concrete, '#b9b8b2', 0.45, 0.12, 0.45, px, g - 0.02, z, { uv: { world: 2 } });
      F.cyl(M.plain, c, 0.025, 1.7, px, g + 0.95, z, { seg: 6 });
      F.box(M.plain, c, 0.04, 0.04, 0.7, px, g + 1.75, z);
    }
    const g = gy(x, z);
    for (const dz of [-0.28, 0.28]) F.cyl(M.plain, '#8fb3c9', 0.016, len + 0.4, x, g + 1.78, z + dz, { rz: Math.PI / 2, seg: 6 });
    if (withLaundry) H.laundry.line(F, x - len / 2 + 0.3, x + len / 2 - 0.3, g + 1.78, z + 0.28, r, 'yard');
  };
  /** tricycle / kids stuff (simple) */
  P.toys = (F, x, y, z, r) => {
    const c = pick(r, ['#d9575a', '#4f7fc4', '#e8c84a']);
    F.cyl(M.plain, '#3a3346', 0.12, 0.05, x - 0.2, y + 0.12, z, { rz: Math.PI / 2, seg: 10 });
    F.cyl(M.plain, '#3a3346', 0.08, 0.04, x + 0.2, y + 0.08, z - 0.12, { rz: Math.PI / 2, seg: 8 });
    F.cyl(M.plain, '#3a3346', 0.08, 0.04, x + 0.2, y + 0.08, z + 0.12, { rz: Math.PI / 2, seg: 8 });
    F.beam(M.plain, c, [x - 0.2, y + 0.14, z], [x + 0.2, y + 0.22, z], 0.06, 0.05);
    F.box(M.plain, c, 0.2, 0.05, 0.16, x + 0.1, y + 0.3, z);
    F.box(M.plain, '#4b4d52', 0.04, 0.25, 0.04, x - 0.18, y + 0.3, z);
    F.cyl(M.plain, '#e8697a', 0.11, 0.22, x + 0.6, y + 0.11, z + 0.2, { seg: 10 }); // ball-ish bucket toy
  };
  /** gomi station (ごみ集積所) cage with green net + sign */
  P.gomiStation = (F, x, y, z, r) => {
    const c = '#6b8f6b';
    F.boxB(M.concrete, '#b9b8b2', 1.9, 0.08, 1.0, x, y - 0.02, z, { uv: { world: 2 } });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) F.boxB(M.plain, c, 0.04, 1.1, 0.04, x + sx * 0.9, y, z + sz * 0.45);
    F.box(M.plain, c, 1.84, 0.04, 0.04, x, y + 1.08, z + 0.45); F.box(M.plain, c, 1.84, 0.04, 0.04, x, y + 1.08, z - 0.45);
    F.box(M.plain, c, 0.04, 0.04, 0.9, x - 0.9, y + 1.08, z); F.box(M.plain, c, 0.04, 0.04, 0.9, x + 0.9, y + 1.08, z);
    F.box(M.plain, '#7faa7a', 1.8, 1.0, 0.02, x, y + 0.56, z - 0.44, { shadow: false });
    F.box(M.plain, '#7faa7a', 0.02, 1.0, 0.88, x - 0.89, y + 0.56, z, { shadow: false });
    F.box(M.plain, '#7faa7a', 0.02, 1.0, 0.88, x + 0.89, y + 0.56, z, { shadow: false });
    F.box(M.atlas, '#ffffff', 0.5, 0.3, 0.02, x + 0.5, y + 0.8, z + 0.47, at('gomi_sign'));
    if (r() < 0.6) for (let i = 0; i < 2; i++) F.raw(M.plain, '#eeeae0', blobRaw(i + 2, 0), x - 0.4 + i * 0.35, y + 0.2, z - 0.1, { sx: 0.4, sy: 0.38, sz: 0.35 });
  };
  if (globalThis.__plantStats) { const S = globalThis.__plantStats; for (const k of ['bush','hedge','pine','nandina','tree','pot','planter','sillPot','bonsaiShelf']) { const fn = P[k]; P[k] = (...a) => { const t0 = H.gb.tris; const depth = (S._d = (S._d||0)+1); const res = fn(...a); S._d--; if (depth === 1) { S[k] = (S[k]||0) + H.gb.tris - t0; S[k+'#'] = (S[k+'#']||0)+1; } return res; }; } }
  return P;
}

export { blobRaw, leafRaw };
