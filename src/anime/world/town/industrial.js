// [v3:town] Port warehouses, cold stores and fish-processing plants (hero zone, full detail): concrete plinth and
// loading dock, corrugated metal walls (clean or rust-streaked near the quays), roll-up shutters (some open onto a
// dark interior with pallets and fish boxes), a high window band, company names painted on the wall, rooftop
// ventilators, refrigeration units, an office box with an outside stair, and stainless tanks + a chimney for plants.
import { COMPANIES } from './names.js';
import { groundRange, pick } from './common.js';

export function industrialTextures(ctx) {
  const T = ctx.tex;
  const R = ctx.rng('town-corrugated');
  const corr = (rusty) => T.draw(512, 512, (g, w, h) => {
    // 512 px = 4 m wide × 4 m tall; ribs every 0.2 m (25.6 px)
    g.fillStyle = '#e4e4e0'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 25.6) {
      const grd = g.createLinearGradient(x, 0, x + 25.6, 0);
      grd.addColorStop(0, 'rgba(255,255,255,0.35)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.05)'); grd.addColorStop(0.55, 'rgba(60,60,80,0.18)'); grd.addColorStop(1, 'rgba(255,255,255,0.3)');
      g.fillStyle = grd; g.fillRect(x, 0, 25.6, h);
    }
    // the canvas spans the whole wall height (v 0 = floor, 1 = eaves): bolt row under the eaves
    g.fillStyle = 'rgba(70,70,90,0.35)'; for (let x = 12; x < w; x += 25.6) g.fillRect(x, 8, 3, 3);
    // soft grime wash from the bottom
    const gg = g.createLinearGradient(0, h, 0, h * 0.55); gg.addColorStop(0, 'rgba(90,80,70,0.22)'); gg.addColorStop(1, 'rgba(90,80,70,0)');
    g.fillStyle = gg; g.fillRect(0, 0, w, h);
    if (rusty) {
      // rust runs from the seams and bolts, orange-brown, painterly
      for (let i = 0; i < 38; i++) {
        const x = Math.floor(R() * 20) * 25.6 + 10 + R() * 6, y0 = R() < 0.8 ? 0 : 120 + R() * 140, len = y0 ? 30 + R() * 80 : 60 + R() * 260, wd = 3 + R() * 9;
        const rg = g.createLinearGradient(0, y0, 0, y0 + len);
        rg.addColorStop(0, `rgba(150,70,35,${0.55 + R() * 0.3})`); rg.addColorStop(0.6, `rgba(170,95,50,${0.25 + R() * 0.2})`); rg.addColorStop(1, 'rgba(170,95,50,0)');
        g.fillStyle = rg; g.beginPath(); g.moveTo(x - wd / 2, y0); g.lineTo(x + wd / 2, y0); g.lineTo(x + wd * 0.2, y0 + len); g.lineTo(x - wd * 0.2, y0 + len); g.fill();
      }
      // splash-back rust at the foot: soft vertical streaks rising from the plinth, not blobs
      for (let i = 0; i < 30; i++) { const x = R() * w, hh = 20 + R() * 70, ww = 2 + R() * 7; const rg = g.createLinearGradient(0, h, 0, h - hh); rg.addColorStop(0, `rgba(140,72,40,${0.25 + R() * 0.3})`); rg.addColorStop(1, 'rgba(140,72,40,0)'); g.fillStyle = rg; g.fillRect(x, h - hh, ww, hh); }
      g.fillStyle = 'rgba(130,60,30,0.5)'; g.fillRect(0, 0, w, 6);
    }
  }, { key: 'town-corr-' + (rusty ? 'r' : 'c'), repeat: [1, 1], anisotropy: 8 });
  return { corr: corr(false), rust: corr(true) };
}

export function industrialMaterials(ctx, tx) {
  const m = ctx.mat;
  return {
    corr: m.toon('#ffffff', { map: tx.corr, vertexColors: true, paint: 0.05 }),
    rust: m.toon('#ffffff', { map: tx.rust, vertexColors: true, paint: 0.06 }),
  };
}

const WALLS = ['#a9c3d4', '#c9d4d8', '#e3ddd0', '#b8c7b8', '#d6d2c6', '#9fb6c9', '#e6e1d6', '#c7c1b4', '#b2bec9'];
const ROOFS = ['#56677a', '#4a78a0', '#8e4540', '#7b8691', '#6f8f8a', '#a0573f', '#5d6f86'];
const SHUT = ['#b9c0c6', '#a8b4bd', '#c9cdd0', '#9fb0bf'];

/**
 * Warehouse / plant on a real lot. Returns false when the footprint is unusable.
 * SM: shop materials (atlas helper), IM: industrial materials, signs: atlases.
 */
export function buildWarehouse(H, lot, lod, IM, SM, signs, r, out) {
  const { ctx, L, M, gb } = H;
  const w = lot.obb.w - 0.2, d = lot.obb.d - 0.2;
  if (w < 3 || d < 3) return false;
  const f = L.lotFrame(lot);
  const F = H.Frame.at(gb, f.x, f.y, f.z, f.rotY);
  const HF = F.sub(0, 0, -lot.obb.d / 2, 0);
  const { gmin, gmax } = groundRange(H, HF, w, d);
  const shore = L.shoreDist(lot.obb.cx, lot.obb.cz);
  const nearSea = shore > -70;
  const plant = lot.kind === 'factory' || (lot.area > 900 && r() < 0.5);
  const h = Math.max(4.8, Math.min(plant ? 16 : 12, lot.height || 6));
  const dock = r() < 0.55 && d > 8 ? 1.05 : 0.15;
  const fy = gmax + dock;
  const rusty = nearSea ? r() < 0.75 : r() < 0.3;
  const wallMat = rusty ? IM.rust : IM.corr;
  const wall = pick(r, WALLS);
  const measuredCol = lot.src?.color === 'aerial' || lot.src?.color === 'osm' || lot.src?.color === 'override';   // [v4:overrides]   // [v4:data] the photo / OSM colour
  const roofCol = measuredCol ? lot.roof.color : lot.roof.color === '#d8dbd6' || lot.roof.color === '#b9bab4' ? pick(r, ROOFS) : (r() < 0.5 ? lot.roof.color : pick(r, ROOFS));
  // plinth + dock
  HF.boxB(M.concrete, '#bdbcb5', w + 0.1, fy - gmin + 0.35, d + 0.1, 0, gmin - 0.3, 0, { uv: { world: 2 } });
  if (dock > 0.5) {
    HF.boxB(M.concrete, '#c4c2ba', w, fy - gmin + 0.3, 1.6, 0, gmin - 0.3, d / 2 + 0.8, { uv: { world: 2 } });
    for (let i = 0; i < Math.floor(w / 3.2); i++) HF.box(M.plain, '#3f3d45', 0.25, 0.35, 0.18, -w / 2 + 1.6 + i * 3.2, fy - 0.25, d / 2 + 1.62);
    H.walk(HF, 0, d / 2 + 0.8, w, 1.6, 0, fy);
  }
  // corrugated body (lower wall band in concrete block for plants)
  const baseH = plant ? 1.2 : 0.6;
  HF.boxB(M.block, '#c9c5bb', w, baseH, d, 0, fy, 0, { uv: { world: 1.6 } });
  HF.boxB(wallMat, wall, w - 0.02, h - baseH, d - 0.02, 0, fy + baseH, 0, { uv: { world: 4, worldV: h - baseH, ov: (h - baseH) / 2 } });
  // painted trim band under the eaves
  const trim = pick(r, ['#4f6f8f', '#8a5a44', '#3e5a6e', '#6d747c']);
  HF.boxB(M.plain, trim, w + 0.06, 0.3, d + 0.06, 0, fy + h - 0.55, 0);
  // [v3:fix] a painted company colour stripe round the shed (blue / green / maroon, as the mid-zone facades): the hero
  // sheds by the promenade read as plain white boxes. Own RNG so the rest of the shed keeps its seeded look.
  { const r2 = ctx.rng('wh-stripe-' + lot.id); if (r2() < 0.75 && h > 5.2) { const sc = pick(r2, ['#3f6aa0', '#3d7a62', '#8a3b3b', '#2f5f8f']); const sy = fy + baseH + (h - baseH) * (0.5 + r2() * 0.1); HF.boxB(M.plain, sc, w + 0.05, 0.8, d + 0.05, 0, sy, 0); if (r2() < 0.5) HF.boxB(M.plain, '#f1efe8', w + 0.055, 0.12, d + 0.055, 0, sy + 0.86, 0); } }
  // high window band
  if (lod >= 1) {
    const n = Math.floor(w / 3.5);
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + (i + 0.5) * (w / n);
      HF.box(M.plain, '#e8e6e0', 1.7, 0.72, 0.06, x, fy + h - 1.35, d / 2 + 0.02);
      HF.box(M.glass, null, 1.56, 0.6, 0.02, x, fy + h - 1.35, d / 2 + 0.055, { shadow: false, noOutline: true });
    }
  }
  // roll-up shutters on the street face: some open (dark interior, pallets, fish boxes)
  const n = Math.max(1, Math.min(6, Math.floor(w / 6.5)));
  const sw = Math.min(4.2, w / n - 1.2), sh = Math.min(h - 1.6, dock > 0.5 ? 3.2 : 3.8);
  const openIdx = r() < 0.6 ? Math.floor(r() * n) : -1;
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (i + 0.5) * (w / n);
    HF.box(M.plain, '#6d747c', sw + 0.3, 0.36, 0.34, x, fy + sh + 0.2, d / 2 + 0.16);
    for (const sx of [-1, 1]) HF.boxB(M.plain, '#8e949b', 0.12, sh, 0.12, x + sx * (sw / 2 + 0.06), fy, d / 2 + 0.06);
    if (i === openIdx && lod >= 1) {
      const openH = sh * (0.75 + r() * 0.25);
      HF.box(M.shutter, pick(r, SHUT), sw, sh - openH + 0.05, 0.06, x, fy + openH + (sh - openH) / 2, d / 2 + 0.03, { uv: { world: 1 } });
      HF.box(M.plain, '#3b3944', sw, openH, 0.05, x, fy + openH / 2, d / 2 - 1.8);           // dark interior
      HF.boxB(M.plain, '#a58a64', 1.1, 0.14, 1.1, x - sw / 4, fy, d / 2 - 1.0);              // pallet
      const bc = ['#2f64b5', '#e9ecee', '#e7c14f'];
      for (let k = 0; k < 4; k++) HF.boxB(M.plain, bc[k % 3], 0.8, 0.3, 0.5, x - sw / 4 + (k % 2 - 0.5) * 0.4, fy + 0.14 + Math.floor(k / 2) * 0.3, d / 2 - 1.0);
      HF.boxB(M.plain, '#c9cdd0', 0.9, 0.55, 0.6, x + sw / 4, fy, d / 2 - 0.9);              // fish tub
      HF.box(M.plain, '#4a4752', 0.02, 0.02, 0.02, x, fy + 0.01, d / 2 - 0.6);
    } else {
      HF.box(M.shutter, pick(r, SHUT), sw, sh, 0.06, x, fy + sh / 2, d / 2 + 0.03, { uv: { world: 1 } });
    }
  }
  // personnel door + light
  if (w > 7) {
    const dx = w / 2 - 1.1;
    HF.box(M.plain, '#8e949b', 0.95, 2.05, 0.06, dx, fy + 1.02, d / 2 + 0.035);
    HF.box(M.plain, '#d4d7db', 0.12, 0.04, 0.05, dx - 0.3, fy + 1.0, d / 2 + 0.08);
    HF.box(SM ? SM.light : M.lamp, null, 0.3, 0.12, 0.12, dx, fy + 2.4, d / 2 + 0.1);
  }
  // company name painted on the long wall (or the front if the front is long)
  const ci = Math.abs(lot.seed) % COMPANIES.length;
  const cr = signs.companyOf(ci);
  const cmat = ctx.mat.decal('#ffffff', { map: cr.tex ?? signs.comp, transparent: true });
  const signW = Math.min(w - 1, (h - 2.5) * 4, 12);
  if (signW > 3) H.card(HF, cmat, cr.rect, 0, fy + h - 1.95 - signW / 8 + 0.2 - (lod >= 1 ? 0.65 : 0), d / 2 + 0.07, signW, signW / 4, { noOutline: true });
  if (d > 10 && r() < 0.7) { const sW = Math.min(d - 1, 12); const side = r() < 0.5 ? 1 : -1; H.card(HF, cmat, cr.rect, side * (w / 2 + 0.07), fy + h - 1.6 - sW / 8, 0, sW, sW / 4, { ry: side * Math.PI / 2, noOutline: true }); }
  // refrigeration units on the side
  if (lod >= 1 && (plant || r() < 0.5)) {
    const side = r() < 0.5 ? 1 : -1;
    for (let k = 0; k < Math.min(3, Math.floor(d / 4)); k++) {
      const z = -d / 2 + 2 + k * 2.4, x = side * (w / 2 + 0.55), gy = H.gy(HF, x, z);
      HF.boxB(M.plain, '#c9cdd0', 1.0, 1.2, 1.8, x, gy, z);
      HF.cyl(M.plain, '#4a4f58', 0.36, 0.05, x + side * 0.51, gy + 0.62, z, { rz: Math.PI / 2, seg: 14 });
    }
  }
  // roof
  const alongX = lot.roof.ridge ? lot.roof.ridge === 'x' : w >= d;   // [v4:data] the ridge measured on the aerial photo
  const RF = alongX ? HF : HF.sub(0, 0, 0, Math.PI / 2);
  const hx = (alongX ? w : d) / 2 + 0.35, hz = (alongX ? d : w) / 2 + 0.4;
  const top = fy + h;
  if (lot.roof.shape === 'flat' || (plant && r() < 0.4)) {
    HF.boxB(M.concrete, '#c9c7c0', w + 0.1, 0.5, d + 0.1, 0, top, 0, { uv: { world: 2 } });
    HF.boxB(M.plain, roofCol, w - 0.5, 0.06, d - 0.5, 0, top + 0.5, 0);   // [v5] above the parapet's top face (top + 0.5): it z-fought there
  } else if (lot.roof.shape === 'saw' || (plant && w * d > 800 && r() < 0.5)) {
    // saw-tooth roof along the long axis
    const L2 = alongX ? w : d, D2 = alongX ? d : w, teeth = Math.max(2, Math.round(D2 / 6));
    for (let k = 0; k < teeth; k++) {
      const z0 = -D2 / 2 + k * D2 / teeth, z1 = z0 + D2 / teeth, rise = 2.0;
      const sl = H.slab([[-L2 / 2 - 0.2, top, z0], [L2 / 2 + 0.2, top, z0], [L2 / 2 + 0.2, top + rise, z1 - 0.05], [-L2 / 2 - 0.2, top + rise, z1 - 0.05]], 0.1, (q) => [q[0] / 1.08, q[2] / 1.02]);
      gb.mesh(M.metal, roofCol, sl.p, sl.n, sl.u, sl.i, RF.M(0, 0, 0));
      RF.boxB(M.plain, '#dfe3e6', L2, rise, 0.08, 0, top, z1 - 0.04);
      RF.box(M.glass, null, L2 - 0.4, rise * 0.6, 0.02, 0, top + rise * 0.5, z1 - 0.1, { shadow: false, noOutline: true });
    }
  } else {
    const p = 0.12 + r() * 0.06, tv = 0.12, yE = top + tv - 0.4 * p, yR = yE + hz * p;
    for (const s of [1, -1]) {
      const pts = [[-hx, yE, s * hz], [hx, yE, s * hz], [hx, yR, 0], [-hx, yR, 0]];
      const sl = H.slab(pts, tv, (q) => [q[0] / 1.08, -(hz - s * q[2]) * 1.02]);
      gb.mesh(M.metal, roofCol, sl.p, sl.n, sl.u, sl.i, RF.M(0, 0, 0));
    }
    RF.box(M.plain, '#8a8f96', hx * 2, 0.12, 0.35, 0, yR + 0.02, 0);
    const ww = alongX ? w : d, dd = alongX ? d : w;
    for (const s of [1, -1]) {
      const x = s * ww / 2;
      const tri = H.poly([[x, top, -dd / 2], [x, top, dd / 2], [x, yR - 0.1, 0]], [s, 0, 0], (q) => [q[2] / 4, (q[1] - top) / 4]);
      gb.mesh(wallMat, wall, tri.p, tri.n, tri.u, tri.i, RF.M(0, 0, 0));
    }
    // turbine ventilators along the ridge
    if (lod >= 1) for (let k = 0; k < Math.floor(hx * 2 / 7); k++) {
      const x = -hx + 3.5 + k * 7;
      RF.cyl(M.plain, '#c3c7cc', 0.28, 0.5, x, yR + 0.3, 0, { seg: 10 });
      RF.cyl(M.plain, '#aeb4ba', 0.18, 0.14, x, yR + 0.62, 0, { seg: 10 });
    }
  }
  // processing plant extras: stainless tanks and a chimney
  if (plant && lod >= 1) {
    const side = r() < 0.5 ? 1 : -1, x = side * (w / 2 + 1.8);
    for (let k = 0; k < 2; k++) {
      const z = -d / 2 + 2.5 + k * 3.2, gy = H.gy(HF, x, z), th = 5 + r() * 3;
      HF.cyl(M.plain, '#d9dde0', 1.25, th, x, gy + th / 2, z, { seg: 16 });
      HF.cyl(M.plain, '#bfc5ca', 1.3, 0.4, x, gy + th + 0.2, z, { seg: 16, rTop: 0.3 });
      HF.beam(M.plain, '#aeb4ba', [x - side * 1.2, gy + th - 1, z], [side * w / 2, gy + th - 1, z], 0.12, 0.12);
    }
    const cx = -side * (w / 2 - 1.5), cz = -d / 2 + 1.5;
    HF.cyl(M.plain, '#c9c5bb', 0.45, h + 7, cx, fy + (h + 7) / 2, cz, { seg: 12, rTop: 0.36 });
    HF.cyl(M.plain, '#a13a2e', 0.4, 0.6, cx, fy + h + 6.2, cz, { seg: 12 });
  }
  // office box with an outside steel stair on bigger sheds
  if (!plant && lod >= 2 && w > 14 && d > 10 && r() < 0.5) {
    const side = r() < 0.5 ? 1 : -1, ox = side * (w / 2 + 1.6), oz = d / 2 - 3.5, gy = H.gy(HF, ox, oz);
    HF.boxB(M.siding, '#e6e1d6', 3.0, 2.6, 5.0, ox, gy + 2.6, oz, { uv: { world: 1.2 } });
    HF.box(M.glass, null, 0.02, 1.0, 3.2, ox + side * 1.51, gy + 4.1, oz, { shadow: false, noOutline: true });
    for (const k of [-1, 1]) HF.boxB(M.plain, '#8e949b', 0.12, 2.6, 0.12, ox + k * 1.3, gy, oz + 2.3);
    for (let s2 = 0; s2 < 12; s2++) HF.box(M.plain, '#8e949b', 0.9, 0.05, 0.28, ox - side * 0.9, gy + 0.22 * s2 + 0.1, oz - 2.6 + s2 * 0.24);
  }
  H.col(HF, 0, 0, w, d, 0, gmin - 1, top + 3);
  out.warehouses.push({ id: lot.id, rusty, plant });
  return true;
}
