// [v3:town] vendored from Sakuragaoka Station src/world/props/vending.js (Kenton-GMI/sakuragaoka-station, MIT; see src/anime/LICENSE-sakuragaoka-station).
// [v3:town] spots passed in (Kesennuma layout); rail / lower-panel textures shared per lineup.
// Vending machines at every L.VENDING spot (+ recycle bins, crates, a nobori flag, the さくらぽん sticker).
// Machine local frame: front = +Z, footprint 1.0 (x) × 0.75 (z) × 1.83 (y), origin at the footprint centre on the floor.
import * as THREE from 'three';
import { cellUV, solidUV, mergeAll, xf, backSide, waveSheet } from './props_common.js';
import { BRANDS, PRODUCTS, SHAPES, ATLAS, SWATCH, swatchPx, cellPx, makeVendTextures } from './props_vendtex.js';

const SLOT_X = Array.from({ length: 8 }, (_, i) => -0.3675 + i * 0.105);
const RAIL_Y = [1.35, 1.09, 0.855];            // bottom of the price rail of each row (top row first)
const RAIL_H = 0.045;

const LINEUP = {
  V1a: { brand: 'haru', ad: 'sakuraLatte', no: 'SK-0701', rows: [
    ['coffee', 'coffee', 'black', 'cafeLatte', 'lemon', 'lemon', 'sakuraSoda', 'cider'],
    ['sakuraLatte', 'sakuraLatte', 'greenTea', 'greenTea', 'water', 'water', 'orange', 'ion'],
    ['ichigo', 'ichigo', 'mugi', 'orange', 'milkTea*', 'greenTeaHot*', 'potage*', 'oshiruko*']] },
  V1b: { brand: 'sakura', ad: 'sakuraSoda', no: 'SK-0702', rows: [
    ['sakuraSoda', 'sakuraSoda', 'cider', 'cider', 'lemon', 'cafeLatte', 'coffee', 'black'],
    ['water', 'water', 'ion', 'ion', 'greenTea', 'mugi', 'orange', 'sakuraLatte'],
    ['ichigo', 'ichigo', 'orange', 'greenTea', 'coffee*', 'cafeLatte*', 'potage*', 'oshiruko*']] },
  V2: { brand: 'aozora', ad: 'water', no: 'SK-0715', rows: [
    ['cider', 'cider', 'lemon', 'coffee', 'coffee', 'black', 'cafeLatte', 'sakuraSoda'],
    ['water', 'water', 'water', 'ion', 'ion', 'greenTea', 'mugi', 'orange'],
    ['ichigo', 'orange', 'greenTea', 'mugi', 'milkTea*', 'greenTeaHot*', 'coffee*', 'potage*']] },
  V3a: { brand: 'midori', ad: 'tea', no: 'SK-0731', rows: [
    ['coffee', 'coffee', 'black', 'black', 'cafeLatte', 'lemon', 'cider', 'sakuraSoda'],
    ['greenTea', 'greenTea', 'greenTea', 'mugi', 'mugi', 'water', 'water', 'sakuraLatte'],
    ['greenTea', 'mugi', 'ichigo', 'orange', 'greenTeaHot*', 'greenTeaHot*', 'milkTea*', 'oshiruko*']] },
  V3b: { brand: 'haru', ad: 'coffee', no: 'SK-0732', rows: [
    ['lemon', 'lemon', 'cider', 'sakuraSoda', 'sakuraSoda', 'cafeLatte', 'coffee', 'black'],
    ['sakuraLatte', 'sakuraLatte', 'ion', 'water', 'orange', 'orange', 'greenTea', 'mugi'],
    ['ichigo', 'ichigo', 'water', 'ion', 'coffee*', 'milkTea*', 'potage*', 'potage*']] },
  V4: { brand: 'sakura', ad: 'ichigo', no: 'SK-0744', old: true, sold: [[1, 6]], rows: [
    ['coffee', 'coffee', 'black', 'cafeLatte', 'cider', 'lemon', 'lemon', 'sakuraSoda'],
    ['water', 'greenTea', 'greenTea', 'mugi', 'orange', 'ion', 'ion', 'sakuraLatte'],
    ['ichigo', 'orange', 'mugi', 'water', 'coffee*', 'oshiruko*', 'oshiruko*', 'potage*']] },
  V5: { brand: 'aozora', ad: 'lemon', no: 'SK-0752', rows: [
    ['cider', 'cider', 'lemon', 'sakuraSoda', 'coffee', 'coffee', 'black', 'cafeLatte'],
    ['water', 'water', 'ion', 'greenTea', 'greenTea', 'mugi', 'orange', 'sakuraLatte'],
    ['ichigo', 'ichigo', 'orange', 'water', 'greenTeaHot*', 'milkTea*', 'coffee*', 'potage*']] },
};

function productGeo(key) {
  const p = PRODUCTS[key], s = SHAPES[p.shape];
  const [cx, cy] = cellPx(p.cell);
  const W = ATLAS.W, H = ATLAS.H;
  const sw = (i) => swatchPx(i);
  const parts = [];
  const { r, h } = s;
  if (s.kind === 'can') {
    const body = new THREE.CylinderGeometry(r, r, h * 0.84, 16, 1, true).rotateY(Math.PI);
    cellUV(body, cx, cy, ATLAS.cw, ATLAS.ch, W, H); parts.push(xf(body, [0, h * 0.08 + h * 0.42, 0]));
    const bot = new THREE.CylinderGeometry(r, r * 0.84, h * 0.08, 16, 1, true); solidUV(bot, ...sw(SWATCH.silver), W, H); parts.push(xf(bot, [0, h * 0.04, 0]));
    const top = new THREE.CylinderGeometry(r * 0.8, r, h * 0.065, 16, 1, true); solidUV(top, ...sw(SWATCH.silver), W, H); parts.push(xf(top, [0, h * 0.92 + h * 0.0325, 0]));
    const lid = new THREE.CylinderGeometry(r * 0.8, r * 0.8, 0.004, 16); solidUV(lid, ...sw(SWATCH.lid), W, H); parts.push(xf(lid, [0, h * 0.985 + 0.002, 0]));
  } else {
    const yb = 0.01, hb = h * 0.58, hs = h * 0.25, hc = h * 0.1;
    const bot = new THREE.CylinderGeometry(r * 0.97, r * 0.88, yb, 14); solidUV(bot, ...sw(p.liqSw), W, H); parts.push(xf(bot, [0, yb / 2, 0]));
    const body = new THREE.CylinderGeometry(r, r, hb, 14, 1, true).rotateY(Math.PI);
    cellUV(body, cx, cy, ATLAS.cw, ATLAS.ch, W, H); parts.push(xf(body, [0, yb + hb / 2, 0]));
    const sh = new THREE.CylinderGeometry(0.0135, r, hs, 14, 1, true); solidUV(sh, ...sw(p.liqSw), W, H); parts.push(xf(sh, [0, yb + hb + hs / 2, 0]));
    const cap = new THREE.CylinderGeometry(0.0152, 0.0152, hc, 10); solidUV(cap, ...sw(p.capSw), W, H); parts.push(xf(cap, [0, yb + hb + hs + hc / 2, 0]));
  }
  return mergeAll(parts);
}

export function buildVending(ctx, H, spots) {
  const { THREE: T3, L, mat, physics } = ctx;
  const tx = makeVendTextures(ctx);
  const P = ctx.palette;
  const M = {
    silver: mat.toon('#c3c9cf', { paint: 0.02 }),
    grey: mat.toon('#8d939b', { paint: 0.02 }),
    dark: mat.toon('#4b4d55', { paint: 0.02 }),
    ink: mat.toon('#3a3346', { paint: 0 }),
    kick: mat.toon('#5b5e66', { paint: 0.03 }),
    rail: mat.toon('#e2e6ea', { paint: 0.01 }),
    concrete: mat.toon('#c4c2ba', { paint: 0.08 }),
    steelBase: mat.toon('#7d848c', { paint: 0.04 }),
    icBody: mat.toon('#5a6170', { paint: 0.02 }),
    liner: mat.emissive('#eef4fa', 0.86),
    back: mat.emissive('#ffffff', 0.97, { map: tx.backPanel }),
    ic: mat.emissive('#ffffff', 0.95, { map: tx.icFace }),
    glass: mat.glass({ tint: '#c8dbe9', opacity: 0.08, streaks: true }),
    products: mat.emissive('#ffffff', 0.93, { map: tx.atlas }),
  };
  const productMats = {}; // key -> Matrix4[]
  const addProduct = (key, m) => { (productMats[key] || (productMats[key] = [])).push(m); };

  const plane = (w, h) => new T3.PlaneGeometry(w, h);
  const machines = [];

  for (const v of spots) {
    const cfg = LINEUP[v.lineup] || LINEUP.V1a;
    const B = BRANDS[cfg.brand];
    const rot = v.rotY;
    let y0, base = null;
    if (v.y !== undefined) { y0 = v.y + 0.02; base = { top: 0.0, bottom: -0.02, steel: true }; }
    else { const fp = H.footprint(v.x, v.z, 1.08, 0.82, rot); y0 = fp.max + 0.04; base = { top: 0, bottom: fp.min - 0.07 - y0 }; }
    const g = H.place(v.x, y0, v.z, rot);
    const k = ctx.kit(g);
    const casing = mat.toon(B.casing, { paint: cfg.old ? 0.07 : 0.045 });
    const door = mat.toon(B.door, { paint: cfg.old ? 0.07 : 0.04 });
    const stile = mat.toon(B.stile, { paint: 0.04 });
    // --- base / plinth
    if (base.steel) k.boxB(1.04, 0.02, 0.78, M.steelBase, [0, -0.02, 0]);
    else k.boxB(1.08, base.top - base.bottom, 0.82, M.concrete, [0, base.bottom, 0]);
    // --- body + cap
    k.rbox(1.0, 1.79, 0.625, 0.035, casing, [0, 0.895, -0.0625]);
    k.rbox(1.03, 0.045, 0.785, 0.018, casing, [0, 1.8075, -0.0045]);
    // --- front door pieces around the display opening
    k.rbox(0.99, 0.835, 0.125, 0.02, door, [0, 0.4375, 0.3125]);
    k.rbox(0.99, 0.23, 0.125, 0.02, door, [0, 1.67, 0.3125]);
    for (const s of [-1, 1]) k.box(0.035, 0.70, 0.125, stile, [s * 0.4775, 1.205, 0.3125]);
    // --- header (lit brand panel)
    k.box(0.935, 0.205, 0.006, M.dark, [0, 1.665, 0.3765]);
    k.plane(0.91, 0.188, mat.emissive('#ffffff', 1.0, { map: tx.headers[cfg.brand] }), [0, 1.665, 0.3805]);
    // --- display: back glow, liners, rails, glass
    k.plane(0.92, 0.70, M.back, [0, 1.205, 0.2515]);
    k.plane(0.125, 0.70, M.liner, [-0.4595, 1.205, 0.3125], [0, Math.PI / 2, 0]);
    k.plane(0.125, 0.70, M.liner, [0.4595, 1.205, 0.3125], [0, -Math.PI / 2, 0]);
    k.plane(0.92, 0.125, M.liner, [0, 1.5535, 0.3125], [Math.PI / 2, 0, 0]);
    const railTex = tx.rails(v.lineup, cfg.rows.map((row, r) => row.map((key, i) => {
      const hot = key.endsWith('*'); const p = PRODUCTS[key.replace('*', '')];
      return { price: p.price, hot, sold: cfg.sold && cfg.sold.some(([rr, ii]) => rr === r && ii === i) };
    })), SLOT_X);
    const railMat = mat.emissive('#ffffff', 0.9, { map: railTex });
    cfg.rows.forEach((row, r) => {
      const ry = RAIL_Y[r];
      k.box(0.92, RAIL_H, 0.11, M.rail, [0, ry + RAIL_H / 2, 0.31]);
      const pg = plane(0.91, RAIL_H);
      cellUV(pg, 0, r * 53, 1024, 52, 1024, 160);
      k.mesh(pg, railMat, [0, ry + RAIL_H / 2, 0.3658]).castShadow = false;
      // products (instanced later)
      row.forEach((key0, i) => {
        const key = key0.replace('*', '');
        const m = new T3.Matrix4().compose(new T3.Vector3(SLOT_X[i], ry + RAIL_H, 0.305), new T3.Quaternion(), new T3.Vector3(1, 1, 1));
        machines.push({ g, key, m });
      });
    });
    const glass = k.plane(0.92, 0.70, M.glass, [0, 1.205, 0.3715]);
    glass.castShadow = false; glass.receiveShadow = false; ctx.noOutline(glass);
    // --- lower door: decal art + payment hardware + take-out frame
    const lower = mat.decal('#ffffff', { map: tx.lowerPanel(v.lineup, cfg.brand, cfg.ad, { faded: cfg.old, no: cfg.no }), transparent: true });
    k.plane(0.95, 0.83, lower, [0, 0.44, 0.3772]);
    k.box(0.05, 0.08, 0.012, M.silver, [0.35, 0.755, 0.381]);
    k.box(0.007, 0.045, 0.004, M.ink, [0.35, 0.755, 0.3885]);
    k.box(0.026, 0.05, 0.02, M.silver, [0.415, 0.755, 0.385]);
    k.box(0.15, 0.04, 0.02, M.dark, [0.35, 0.645, 0.385]);
    k.box(0.11, 0.006, 0.004, M.ink, [0.35, 0.645, 0.3965]);
    k.rbox(0.125, 0.095, 0.02, 0.008, M.icBody, [0.35, 0.505, 0.385]);
    k.plane(0.115, 0.085, M.ic, [0.35, 0.505, 0.3955]);
    k.box(0.11, 0.075, 0.025, M.silver, [0.35, 0.36, 0.3875]);
    k.plane(0.085, 0.048, M.ink, [0.35, 0.357, 0.4005]);
    k.box(0.64, 0.02, 0.02, M.silver, [-0.13, 0.28, 0.385]);
    k.box(0.66, 0.012, 0.05, M.silver, [-0.13, 0.294, 0.397]);
    k.box(0.64, 0.02, 0.02, M.silver, [-0.13, 0.08, 0.385]);
    for (const x of [-0.44, 0.18]) k.box(0.02, 0.22, 0.02, M.silver, [x, 0.18, 0.385]);
    k.box(0.97, 0.055, 0.02, M.kick, [0, 0.0275, 0.378]);
    // --- sides: brand graphics + grime; front grime
    const sideMat = mat.decal('#ffffff', { map: tx.sides[cfg.brand], transparent: true });
    k.plane(0.56, 1.5, sideMat, [0.5015, 0.98, -0.075], [0, Math.PI / 2, 0]);
    k.plane(0.56, 1.5, sideMat, [-0.5015, 0.98, -0.075], [0, -Math.PI / 2, 0]);
    const grimeMat = mat.decal('#ffffff', { map: tx.grime(!!cfg.old), transparent: true, opacity: cfg.old ? 1 : 0.8 });
    k.plane(0.99, 0.42, grimeMat, [0, 0.21, 0.3795]);
    k.plane(0.7, 0.42, grimeMat, [0.5035, 0.21, -0.02], [0, Math.PI / 2, 0]);
    k.plane(0.7, 0.42, grimeMat, [-0.5035, 0.21, -0.02], [0, -Math.PI / 2, 0]);
    if (v.lineup === 'V4') {
      k.plane(0.17, 0.17, mat.decal('#ffffff', { map: tx.sticker, transparent: true }), [0.504, 1.16, 0.12], [0, Math.PI / 2, 0.08]);
    }
    physics.addBox(v.x, v.z, 1.0, 0.75, rot, y0 - 0.1, y0 + 1.83);
    // --- neighbours: bins, crates, flag
    const put = (lx, lz, lrot = 0) => { const p = H.toWorld(v.x, v.z, rot, lx, lz); return { x: p.x, z: p.z, rotY: rot + lrot }; };
    if (v.lineup === 'V1b') { recycleBin(ctx, H, M, tx, put(0.77, 0.0), 'blue', '#e9ecee', '#5b8fd6'); nobori(ctx, H, tx, put(1.32, 0.05, -0.25)); }
    if (v.lineup === 'V2') recycleBin(ctx, H, M, tx, put(-0.77, 0.0), 'blue', '#e9ecee', '#5b8fd6', v.y);
    if (v.lineup === 'V3a') recycleBin(ctx, H, M, tx, put(-0.77, 0.02), 'blue', '#e8eae6', '#4f9e78');
    if (v.lineup === 'V4') {
      recycleBin(ctx, H, M, tx, put(-0.77, 0.02), 'old', '#d8ddd6', '#4d8a6a');
      crateStack(ctx, H, tx, put(-1.36, 0.0, 0.08), ['#4f7fc4', '#e7c14f']);
    }
    if (v.lineup === 'V5') recycleBin(ctx, H, M, tx, put(-0.83, 0.04), 'blue', '#e9ecee', '#5b8fd6');
  }

  // --- products: one shared geometry per product type, plain meshes (the static batcher merges them
  //     per cell into one draw call with the shared atlas material)
  const geoByKey = {};
  for (const e of machines) {
    const geo = geoByKey[e.key] || (geoByKey[e.key] = productGeo(e.key));
    const pm = new T3.Mesh(geo, M.products);
    e.m.decompose(pm.position, pm.quaternion, pm.scale);
    pm.castShadow = false; pm.receiveShadow = false; pm.name = 'props.product.' + e.key;
    e.g.add(pm);
  }
}

export function recycleBin(ctx, H, M, tx, p, style, body, lid, yFixed) {
  const { mat, physics } = ctx;
  let y0;
  if (yFixed !== undefined) y0 = yFixed; else y0 = H.footprint(p.x, p.z, 0.44, 0.36, p.rotY).max;
  const g = H.place(p.x, y0, p.z, p.rotY);
  const k = ctx.kit(g);
  const mb = mat.toon(body, { paint: 0.05 }), ml = mat.toon(lid, { paint: 0.04 });
  if (yFixed === undefined) { const fp = H.footprint(p.x, p.z, 0.44, 0.36, p.rotY); k.boxB(0.44, 0.03 + (y0 - fp.min) + 0.04, 0.36, M.kick, [0, fp.min - y0 - 0.04, 0]); }
  else k.boxB(0.44, 0.03, 0.36, M.kick, [0, 0, 0]);
  k.rbox(0.42, 0.78, 0.34, 0.05, mb, [0, 0.42, 0]);
  k.rbox(0.44, 0.07, 0.36, 0.03, ml, [0, 0.835, 0]);
  k.plane(0.39, 0.49, mat.decal('#ffffff', { map: tx.bin(style), transparent: true }), [0, 0.36, 0.1725]);
  for (const sx of [-0.095, 0.095]) {
    k.cyl(0.066, 0.066, 0.012, ml, [sx, 0.67, 0.172], [Math.PI / 2, 0, 0], 20);
    k.cyl(0.052, 0.052, 0.004, M.ink, [sx, 0.67, 0.1795], [Math.PI / 2, 0, 0], 20);
  }
  physics.addBox(p.x, p.z, 0.44, 0.36, p.rotY, y0 - 0.1, y0 + 0.87);
}

export function crateStack(ctx, H, tx, p, colors) {
  const { mat, physics } = ctx;
  const fp = H.footprint(p.x, p.z, 0.45, 0.33, p.rotY);
  const g = H.place(p.x, fp.max, p.z, p.rotY);
  let y = 0;
  colors.forEach((c, i) => {
    const gg = new THREE.Group(); gg.position.set(i ? 0.012 : 0, y, i ? -0.01 : 0); gg.rotation.y = i ? 0.07 : 0; g.add(gg);
    const k = ctx.kit(gg);
    const mt = mat.toon('#ffffff', { map: tx.crate(c), paint: 0.03 }), mc = mat.toon(c, { paint: 0.05 });
    const h = 0.28;
    for (const s of [-1, 1]) { k.box(0.45, h, 0.018, mt, [0, h / 2, s * 0.156]); k.box(0.018, h, 0.294, mt, [s * 0.216, h / 2, 0]); }
    k.box(0.42, 0.02, 0.3, mc, [0, 0.012, 0]);
    for (const z of [-0.05, 0.05]) k.box(0.42, 0.19, 0.008, mc, [0, 0.115, z]);
    for (const x of [-0.105, 0, 0.105]) k.box(0.008, 0.19, 0.3, mc, [x, 0.115, 0]);
    y += h + 0.002;
  });
  physics.addBox(p.x, p.z, 0.47, 0.35, p.rotY, fp.min - 0.1, fp.max + y);
}

export function nobori(ctx, H, tx, p) {
  const { mat, physics } = ctx;
  const y0 = H.footprint(p.x, p.z, 0.34, 0.34, p.rotY).max;
  const g = H.place(p.x, y0, p.z, p.rotY);
  const k = ctx.kit(g);
  k.rbox(0.26, 0.12, 0.26, 0.04, mat.toon('#6a6874', { paint: 0.03 }), [0, 0.06, 0]);
  const pole = mat.toon('#e6e6e2', { paint: 0.02 });
  k.cyl(0.016, 0.016, 2.25, pole, [0, 0.12 + 1.125, 0]);
  k.cyl(0.009, 0.009, 0.5, pole, [0.25, 2.33, 0], [0, 0, Math.PI / 2]);
  const sheet = waveSheet(0.45, 1.55, 0.035, 1.1, 0.3);
  const fm = mat.toon('#ffffff', { map: tx.flag, paint: 0.02 });
  k.mesh(sheet, fm, [0.255, 2.33 - 0.8, 0]);
  k.mesh(backSide(sheet), fm, [0.255, 2.33 - 0.8, 0]);
  physics.addCylinder(p.x, p.z, 0.2, y0 - 0.1, y0 + 2.4);
}
