// [v4:town-accuracy] Real names on the town's buildings (V3-SPEC section 10): a public facility (school, city hall,
// post office, hospital, bank, community centre) or a shop that OpenStreetMap or GSI 注記 names carries that name on
// its sign; the rest keep the plausible fictional shop names of names.js. Names come from the layout (lot.name,
// © OpenStreetMap contributors / 出典：国土地理院); sensitive names are filtered upstream (enrich/fold.js SENSITIVE).
//
//   const RN = makeRealNames(ctx, lots)      one canvas atlas for every named hero + mid lot (horizontal boards)
//   RN.get(lot) -> { mat, rect, colors: [bg, fg], aspect } | null
//   RN.boards(list) -> a merged mesh of boards for the simplified (mid) buildings: [{ lot, F, w, d, fy, h }]
import * as THREE from 'three';

const CELL_W = 256, CELL_H = 44, TEX = 1024, COLS = Math.floor(TEX / CELL_W), ROWS = Math.floor(TEX / CELL_H);
const PER_TEX = COLS * ROWS;
/** Board colours by use: public buildings white on navy / green, shops cream on their trade colour. */
function coloursOf(lot, k) {
  const u = lot.use || '', f = lot.facility || '';
  if (/school|kindergarten|college/.test(u + f)) return ['#f4f1e8', '#1f3f6e'];
  if (/hospital|clinic|doctors|pharmacy/.test(u + f)) return ['#ffffff', '#2f7a58'];
  if (/post/.test(u + f)) return ['#d8352f', '#ffffff'];
  if (/townhall|city_hall|government|police|fire|community|library|public/.test(u + f)) return ['#f2efe6', '#23466e'];
  if (/bank/.test(u + f)) return ['#1f4f7a', '#ffffff'];
  if (/hotel|guest|hostel/.test(u + f)) return ['#3b2c24', '#f3e7c9'];
  if (/seafood|fish/.test(u)) return ['#f4efe2', '#23466e'];
  if (/restaurant|cafe|bar|pub|food|sushi|ramen/.test(u)) return ['#6a4a34', '#f7efdc'];
  const P = [['#f5eddc', '#7a2d22'], ['#2e5b52', '#fbf4e2'], ['#f7f0da', '#2a5f95'], ['#8d2f2a', '#fff4e3'], ['#f1e9d8', '#5a3b2a'], ['#3a3f4a', '#f3e9c9']];
  return P[k % P.length];
}

/** The text a sign would carry: OSM building names that are administrative (共同化建物, 旧..., a works JV) get none,
 *  and a bracketed English gloss is dropped. */
export function signName(name) {
  if (!name || /共同化|^旧|JV$|工事|仮設/.test(name)) return null;
  const t = name.replace(/\s*\([A-Za-z][^)]*\)\s*$/, '').trim();
  return t.length && t.length <= 24 ? t : null;
}

/** Signs the spec asks for (V3-SPEC 10): public facilities (GSI facility / OSM amenity, school, public kind) and shops,
 *  restaurants, inns and banks that OSM names. Company offices and apartment names stay off (canvas budget). */
export function wantsSign(lot) {
  if (!signName(lot.name) || lot.landmark) return false;
  if (lot.facility || lot.kind === 'public' || lot.kind === 'school') return true;
  return /^(shop:|amenity:|tourism:|leisure:|office:government)/.test(lot.use || '');
}

export function makeRealNames(ctx, lots, { key = 'town-realnames-' } = {}) {   // [v4:explore] key: a second atlas (the streamed far core) must not reuse the town's canvas
  const named = lots.filter(wantsSign);
  const idx = new Map(); const list = [];
  for (const l of named) { const t = signName(l.name); if (!idx.has(t)) { idx.set(t, list.length); list.push({ ...l, name: t }); } }
  const texs = [], mats = [];
  const F = ctx.tex.FONTS;
  const heights = [];
  for (let t = 0; t * PER_TEX < list.length; t++) {
    const part = list.slice(t * PER_TEX, (t + 1) * PER_TEX);
    const TH = Math.ceil(part.length / COLS) * CELL_H;   // only the rows in use (canvas budget)
    heights.push(TH);
    const tex = ctx.tex.draw(TEX, TH, (g) => {
      part.forEach((lot, k) => {
        const x = (k % COLS) * CELL_W, y = Math.floor(k / COLS) * CELL_H;
        const [bg, fg] = coloursOf(lot, t * PER_TEX + k);
        g.fillStyle = bg; g.fillRect(x + 2, y + 2, CELL_W - 4, CELL_H - 4);
        g.strokeStyle = fg; g.globalAlpha = 0.35; g.lineWidth = 2; g.strokeRect(x + 4, y + 4, CELL_W - 8, CELL_H - 8); g.globalAlpha = 1;
        g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
        ctx.tex.fitText(g, lot.name, x + CELL_W / 2, y + CELL_H / 2 + 2, CELL_W - 16, 30, /public|school|hospital|post|townhall|city_hall|bank|library/.test((lot.use || '') + (lot.facility || '')) ? F.sans : F.sans, 900);
      });
    }, { key: key + t, anisotropy: 8 });
    texs.push(tex);
    mats.push(ctx.mat.toon('#ffffff', { map: tex, paint: 0.01 }));
  }
  const rectOf = (k) => { const kk = k % PER_TEX, TH = heights[Math.floor(k / PER_TEX)], x = (kk % COLS) * CELL_W, y = Math.floor(kk / COLS) * CELL_H; return [x / TEX, 1 - (y + CELL_H) / TH, (x + CELL_W) / TEX, 1 - y / TH]; };
  const get = (lot) => {
    const t = signName(lot?.name);
    if (!t || !idx.has(t) || !wantsSign(lot)) return null;
    const k = idx.get(t);
    return { mat: mats[Math.floor(k / PER_TEX)], rect: rectOf(k), colors: coloursOf(lot, k), aspect: CELL_W / CELL_H, name: t };
  };

  /** Boards on the simplified buildings: one quad per name facing the street, on a thin backing slab. */
  function boards(items) {
    const per = mats.map(() => ({ p: [], n: [], u: [], i: [] }));
    const back = { p: [], n: [], c: [], i: [] };
    const col = new THREE.Color();
    let count = 0;
    for (const it of items) {
      const R = get(it.lot); if (!R) continue;
      const k = idx.get(R.name), B = per[Math.floor(k / PER_TEX)];
      const chars = [...R.name].length;
      const bw = Math.max(1.6, Math.min(it.w * 0.8, 0.62 * chars + 0.8, 9)), bh = bw / R.aspect * 1.25;
      const y = it.fy + Math.min(Math.max(2.6, it.h - bh - 0.5), 3.3), z = it.d / 2 + 0.07;
      const P = [[-bw / 2, y, z], [bw / 2, y, z], [bw / 2, y + bh, z], [-bw / 2, y + bh, z]].map(([x, yy, zz]) => it.F.p(x, yy, zz));
      const N = it.F.n(0, 0, 1);
      const base = B.p.length / 3;
      for (const q of P) B.p.push(q[0], q[1], q[2]);
      for (let m = 0; m < 4; m++) B.n.push(N[0], N[1], N[2]);
      const [u0, v0, u1, v1] = R.rect; B.u.push(u0, v0, u1, v0, u1, v1, u0, v1);
      B.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
      // backing slab (the board's frame), 4 cm proud of the wall
      col.set(R.colors[0]).multiplyScalar(0.8);
      const bz0 = it.d / 2 + 0.01, bz1 = it.d / 2 + 0.065, pad = 0.06;
      const Q = [[-bw / 2 - pad, y - pad, bz1], [bw / 2 + pad, y - pad, bz1], [bw / 2 + pad, y + bh + pad, bz1], [-bw / 2 - pad, y + bh + pad, bz1],
        [-bw / 2 - pad, y - pad, bz0], [bw / 2 + pad, y - pad, bz0], [bw / 2 + pad, y + bh + pad, bz0], [-bw / 2 - pad, y + bh + pad, bz0]].map(([x, yy, zz]) => it.F.p(x, yy, zz));
      const b0 = back.p.length / 3;
      for (const q of Q) { back.p.push(q[0], q[1], q[2]); back.c.push(col.r, col.g, col.b); }
      for (let m = 0; m < 8; m++) back.n.push(N[0], N[1], N[2]);
      // front ring (behind the text) + top + sides
      back.i.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3, b0 + 3, b0 + 2, b0 + 6, b0 + 3, b0 + 6, b0 + 7, b0 + 1, b0 + 5, b0 + 6, b0 + 1, b0 + 6, b0 + 2, b0 + 4, b0, b0 + 3, b0 + 4, b0 + 3, b0 + 7);
      count++;
    }
    const group = new THREE.Group(); group.name = 'town-realnames';
    per.forEach((B, t) => {
      if (!B.i.length) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(B.n, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(B.u, 2));
      g.setIndex(B.i); g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mats[t]); m.receiveShadow = true; group.add(m);
    });
    if (back.i.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(back.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(back.n, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(back.c, 3));
      g.setIndex(back.i); g.computeBoundingSphere();
      const m = new THREE.Mesh(g, ctx.mat.toon('#ffffff', { vertexColors: true, paint: 0.02 })); m.castShadow = true; m.receiveShadow = true; group.add(m);
    }
    return { group, count };
  }
  return { get, boards, count: list.length, textures: texs.length };
}
