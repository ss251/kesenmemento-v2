// [loader] The thirteen 大漁旗 (tairyoki) of the KesenMemento loading screen, drawn as small flat SVGs.
//
//   env -u NODE_OPTIONS bun tools/anime/loader-flags.mjs          writes src/anime/assets/loader/flags.json
//
// flags.json = { palette: { 名前: "#hex" }, flags: [ { id, name: { ja, en }, colors: [motif, cloth, ...rest], svg } x 13 ] }, in hoisting order (bow to stern).
// Every flag is a 40 x 60 viewBox (2:3): cloth, a motif, a thin darker edge line (縁) and a 4-unit sleeve band (the 袖) at the top where the rope runs.
// Flat colours only: no filter, gradient, clip-path, mask, opacity, style, id or text. One decimal at most (the dense flags draw in tenths inside scale(.1): still 0.1 unit precision).
// Budget: each svg <= 1.6 KB, all thirteen <= 16 KB. The generator fails (exit 1, nothing written) when a flag is over budget, uses a colour outside the palette, uses a banned element
// (filter, gradient, clip-path, mask, opacity, style, id, text, use, image), prints more than one decimal, or draws anywhere outside the 40 x 60 cloth (a numeric bounding box, strokes included),
// so the flags stay clean even where a page sets overflow: visible on the svg.
// The hem (縁) and sleeve are always a darker palette colour than the cloth: 茜 on cream and on 山吹, 紺 on 茜 and on 藍, 墨 on 紺, 藍 on 浅葱.
//
// ORIGINALITY: the motifs are classic public-domain auspicious patterns (sun, waves, tortoiseshell, scales, crane, turtle, rising sun, wave crest) drawn here from plain geometry; nothing is traced
// from, or imitates, any flag maker's artwork, any boat's flags or any crest, and no logo, company, boat or personal name appears. The characters (大漁 祝 福 満 気仙沼) are common words.
// The 朝日 flag is a yellow half sun on a horizon over blue sea: it is not the red-sun-with-sixteen-rays ensign.
//
// CHARACTERS: outlines of Yuji Boku (SIL OFL 1.1, (c) 2021 The Yuji Project Authors, https://github.com/Kinutafontfactory/Yuji, via Google Fonts), read from tools/anime/loader-flags-glyphs.json,
// the cache written by tools/anime/loader-flags-glyphs.py (fontTools). The OFL permits embedding the outlines in artwork; only the simplified, re-scaled artwork is shipped, never the font.
// Here each outline is flattened, simplified (Douglas-Peucker, tolerance in flag units), stretched to its place on the flag and thickened with a stroke so it survives at 24 px.
//
// PALETTE: traditional Japanese colours only. Values: NIPPON COLORS table, cross-checked against Wikipedia for 藍 / 浅葱 / 東雲 / 勿忘草.
//   藍 ai #165E83 · 紺 kon #223A70 · 浅葱 asagi #00A3AF · 生成り kinari #FBFAF5 · 茜 akane #B7282E · 山吹 yamabuki #F8B500 · 東雲 shinonome #F19072 · 勿忘草 wasurenagusa #89C3EB · 墨 sumi #1C1C1C
// (no extra colours are used; the palette object in flags.json lists the ones the flags actually use)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const OUT = process.argv.includes('--out') ? resolve(process.argv[process.argv.indexOf('--out') + 1]) : join(ROOT, 'src/anime/assets/loader/flags.json');
const GLYPH_CACHE = join(HERE, 'loader-flags-glyphs.json');
const FLAG_MAX = 1600, TOTAL_MAX = 16000;

export const PALETTE = {
  藍: '#165E83', 紺: '#223A70', 浅葱: '#00A3AF', 生成り: '#FBFAF5', 茜: '#B7282E', 山吹: '#F8B500', 東雲: '#F19072', 勿忘草: '#89C3EB', 墨: '#1C1C1C',
};
const hex = (name) => { if (!PALETTE[name]) throw new Error('colour not in the palette: ' + name); return PALETTE[name]; };

// ---------------------------------------------------------------- numbers and paths
// Coordinates are kept as integer tenths of a unit; a path prints either in units (one decimal) or in tenths (integers, for a group with transform="scale(.1)").
const tn = (v) => Math.round(v * 10);
const fmt = (t, tenths) => {
  if (tenths) return String(t);
  const a = Math.abs(t), ip = Math.floor(a / 10), fp = a % 10;
  const s = fp ? (ip ? `${ip}.${fp}` : `.${fp}`) : String(ip);
  return t < 0 && a ? '-' + s : s;
};

export class Path {
  constructor() { this.cmds = []; }
  M(x, y) { this.cmds.push(['M', tn(x), tn(y)]); return this; }
  L(x, y) { this.cmds.push(['L', tn(x), tn(y)]); return this; }
  Q(x1, y1, x, y) { this.cmds.push(['Q', tn(x1), tn(y1), tn(x), tn(y)]); return this; }
  C(x1, y1, x2, y2, x, y) { this.cmds.push(['C', tn(x1), tn(y1), tn(x2), tn(y2), tn(x), tn(y)]); return this; }
  A(rx, ry, rot, large, sweep, x, y) { this.cmds.push(['A', tn(rx), tn(ry), rot, large ? 1 : 0, sweep ? 1 : 0, tn(x), tn(y)]); return this; }
  Z() { this.cmds.push(['Z']); return this; }
  poly(pts, close = true) { pts.forEach(([x, y], i) => (i ? this.L(x, y) : this.M(x, y))); if (close) this.Z(); return this; }
  d(tenths = false) { return emitPath(this.cmds, tenths); }
}

function emitPath(cmds, tenths) {
  const f = (t) => fmt(t, tenths);
  const toks = [];                       // { k: 'c' command | 'n' number | 'f' arc flags, s }
  let cx = 0, cy = 0, sx = 0, sy = 0, prev = '';
  const sep = (p, t) => {
    if (!p || t.k === 'c' || p.k === 'c' || p.k === 'f') return '';
    if (t.k === 'f') return ' ';
    if (t.s[0] === '-') return '';
    if (t.s[0] === '.' && p.s.includes('.')) return '';
    return ' ';
  };
  const cost = (cand) => { let n = 0, p = toks[toks.length - 1]; for (const t of cand) { n += sep(p, t).length + t.s.length; p = t; } return n; };
  const num = (arr) => arr.map((t) => ({ k: 'n', s: f(t) }));
  const withLetter = (letter, ns) => {
    const omit = (letter === prev && letter !== 'M' && letter !== 'm') || (prev === 'M' && letter === 'L') || (prev === 'm' && letter === 'l');
    return omit ? ns : [{ k: 'c', s: letter }, ...ns];
  };
  const take = (letter, cand, nx, ny) => { toks.push(...cand); prev = letter; cx = nx; cy = ny; };
  const choose = (opts) => { let best = null; for (const o of opts) { const cand = withLetter(o.l, o.ns); const c = cost(cand); if (!best || c < best.c) best = { c, cand, o }; } return best; };
  for (const c of cmds) {
    const k = c[0];
    if (k === 'Z') { toks.push({ k: 'c', s: 'z' }); prev = 'z'; cx = sx; cy = sy; continue; }
    let opts, nx, ny;
    if (k === 'M') {
      [, nx, ny] = c;
      opts = [{ l: 'M', ns: num([nx, ny]) }];
      if (toks.length) opts.push({ l: 'm', ns: num([nx - cx, ny - cy]) });   // the first M stays absolute so d strings can be concatenated
      const b = choose(opts); take(b.o.l, b.cand, nx, ny); sx = nx; sy = ny; continue;
    }
    if (k === 'L') {
      [, nx, ny] = c;
      if (ny === cy && nx === cx) continue;
      if (ny === cy) opts = [{ l: 'H', ns: num([nx]) }, { l: 'h', ns: num([nx - cx]) }];
      else if (nx === cx) opts = [{ l: 'V', ns: num([ny]) }, { l: 'v', ns: num([ny - cy]) }];
      else opts = [{ l: 'L', ns: num([nx, ny]) }, { l: 'l', ns: num([nx - cx, ny - cy]) }];
    } else if (k === 'Q') {
      nx = c[3]; ny = c[4];
      opts = [{ l: 'Q', ns: num([c[1], c[2], c[3], c[4]]) }, { l: 'q', ns: num([c[1] - cx, c[2] - cy, c[3] - cx, c[4] - cy]) }];
    } else if (k === 'C') {
      nx = c[5]; ny = c[6];
      opts = [{ l: 'C', ns: num(c.slice(1)) }, { l: 'c', ns: num([c[1] - cx, c[2] - cy, c[3] - cx, c[4] - cy, c[5] - cx, c[6] - cy]) }];
    } else if (k === 'A') {
      nx = c[6]; ny = c[7];
      const mk = (l, dx, dy) => ({ l, ns: [...num([c[1], c[2]]), { k: 'n', s: String(c[3]) }, { k: 'f', s: `${c[4]}${c[5]}` }, ...num([dx, dy])] });
      opts = [mk('A', nx, ny), mk('a', nx - cx, ny - cy)];
    } else throw new Error('bad command ' + k);
    const b = choose(opts); take(b.o.l, b.cand, nx, ny);
  }
  let out = '', p = null;
  for (const t of toks) { out += sep(p, t) + t.s; p = t; }
  return out;
}

// ---------------------------------------------------------------- small geometry
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const area = (ring) => { let s = 0; for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
const rad = (deg) => (deg * Math.PI) / 180;

function rdp(pts, eps) {                 // Douglas-Peucker on an open chain, iterative
  const n = pts.length; if (n < 3) return pts.slice();
  const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let md = -1, mi = -1; const A = pts[a], B = pts[b], dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy);
    for (let i = a + 1; i < b; i++) {
      const d = L < 1e-9 ? dist(pts[i], A) : Math.abs(dy * (pts[i][0] - A[0]) - dx * (pts[i][1] - A[1])) / L;
      if (d > md) { md = d; mi = i; }
    }
    if (md > eps) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
function simplifyRing(ring, eps) {       // closed ring: split at the point farthest from the first
  if (ring.length < 4) return ring;
  let fi = 0, fd = -1; ring.forEach((p, i) => { const d = dist(p, ring[0]); if (d > fd) { fd = d; fi = i; } });
  const a = rdp(ring.slice(0, fi + 1), eps), b = rdp([...ring.slice(fi), ring[0]], eps);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

function clipPoly(poly, [x0, y0, x1, y1]) {  // Sutherland-Hodgman against a rectangle
  const edges = [
    [(p) => p[0] >= x0, (a, b) => { const t = (x0 - a[0]) / (b[0] - a[0]); return [x0, a[1] + t * (b[1] - a[1])]; }],
    [(p) => p[0] <= x1, (a, b) => { const t = (x1 - a[0]) / (b[0] - a[0]); return [x1, a[1] + t * (b[1] - a[1])]; }],
    [(p) => p[1] >= y0, (a, b) => { const t = (y0 - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), y0]; }],
    [(p) => p[1] <= y1, (a, b) => { const t = (y1 - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), y1]; }],
  ];
  let out = poly;
  for (const [inside, cut] of edges) {
    const inp = out; out = [];
    for (let i = 0; i < inp.length; i++) {
      const cur = inp[i], prv = inp[(i + inp.length - 1) % inp.length];
      if (inside(cur)) { if (!inside(prv)) out.push(cut(prv, cur)); out.push(cur); } else if (inside(prv)) out.push(cut(prv, cur));
    }
    if (!out.length) break;
  }
  return out;
}
function clipSeg(p, q, [x0, y0, x1, y1]) {   // Liang-Barsky
  let t0 = 0, t1 = 1; const dx = q[0] - p[0], dy = q[1] - p[1];
  for (const [pp, qq] of [[-dx, p[0] - x0], [dx, x1 - p[0]], [-dy, p[1] - y0], [dy, y1 - p[1]]]) {
    if (Math.abs(pp) < 1e-12) { if (qq < 0) return null; } else { const r = qq / pp; if (pp < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; } }
  }
  return [[p[0] + t0 * dx, p[1] + t0 * dy], [p[0] + t1 * dx, p[1] + t1 * dy]];
}

// ---------------------------------------------------------------- characters
let GLYPHS = null;
function loadGlyphs() {
  if (GLYPHS) return GLYPHS;
  if (!existsSync(GLYPH_CACHE)) {
    const r = spawnSync('python3', [join(HERE, 'loader-flags-glyphs.py')], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error('the glyph cache is missing and loader-flags-glyphs.py failed');
  }
  GLYPHS = JSON.parse(readFileSync(GLYPH_CACHE, 'utf8')).glyphs;
  return GLYPHS;
}
function flattenGlyph(ch) {              // font units, y up; tolerance 1.5 font units
  const rings = [];
  for (const c of loadGlyphs()[ch].c) {
    const pts = []; let cur = null;
    for (const s of c) {
      if (s[0] === 'M' || s[0] === 'L') { cur = [s[1], s[2]]; pts.push(cur); } else if (s[0] === 'Q') {
        const [, qx, qy, x, y] = s, d = Math.hypot(cur[0] - 2 * qx + x, cur[1] - 2 * qy + y), n = Math.max(1, Math.ceil(Math.sqrt(d / 6)));
        for (let i = 1; i <= n; i++) { const t = i / n, u = 1 - t; pts.push([u * u * cur[0] + 2 * u * t * qx + t * t * x, u * u * cur[1] + 2 * u * t * qy + t * t * y]); }
        cur = [x, y];
      }
    }
    if (pts.length > 1 && dist(pts[0], pts[pts.length - 1]) < 1e-6) pts.pop();
    rings.push(pts);
  }
  return rings;
}
function inkBox(rings) { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const r of rings) for (const [x, y] of r) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); } return { x0: a, y0: b, x1: c, y1: d, w: c - a, h: d - b }; }

const INK = {}; const ink = (ch) => (INK[ch] ||= inkBox(flattenGlyph(ch)));

// One character as simplified polygons in flag units, its ink box centred on (cx, cy); sx, sy are flag units per font unit (sx / sy = the horizontal stretch).
function glyphPolys(ch, { cx, cy, sx, sy, eps = 0.22, minArea = 0.5 }) {
  const rings = flattenGlyph(ch), b = inkBox(rings), mx = (b.x0 + b.x1) / 2, my = (b.y0 + b.y1) / 2;
  const out = [];
  for (const r of rings) {
    const p = r.map(([x, y]) => [cx + (x - mx) * sx, cy - (y - my) * sy]);
    if (Math.abs(area(p)) < minArea) continue;
    const s = simplifyRing(p, eps).map(([x, y]) => [tn(x) / 10, tn(y) / 10]).filter((q, i, a) => !i || q[0] !== a[i - 1][0] || q[1] !== a[i - 1][1]);
    if (s.length >= 3 && Math.abs(area(s)) >= minArea * 0.6) out.push(s);
  }
  return { polys: out, size: [b.w * sx, b.h * sy], stretch: sx / sy };
}
const glyphD = (list) => { const p = new Path(); for (const o of list) for (const poly of o.polys) p.poly(poly); return p.d(true); };

// ---------------------------------------------------------------- flag frame
// cloth, motif (drawn on the cloth), thin edge line over the motif, sleeve band over everything (so nothing can show above y = 4).
function frame({ cloth, edge, body }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 60"><path fill="${hex(cloth)}" d="M0 0h40v60H0z"/>${body}<path fill="none" stroke="${hex(edge)}" d="M.5.5h39v59H.5z"/><path fill="${hex(edge)}" d="M0 0h40v4H0z"/></svg>`;
}
const g10 = (attrs, inner) => `<g transform="scale(.1)" ${attrs}>${inner}</g>`;   // a group drawn in tenths of a unit

// ---------------------------------------------------------------- the motifs
// 1 日輪: a red sun disc with a thin halo ring, on cream.
function nichirin() {
  const k = hex('茜');
  return `<circle cx="20" cy="32" r="12.5" fill="${k}"/><circle cx="20" cy="32" r="16.6" fill="none" stroke="${k}" stroke-width="1.4"/>`;
}

// 3 青海波: rows of concentric scales, drawn back to front; only the visible arcs are written (analytic circle-circle clipping), trimmed to the cloth.
function seigaiha({ R, rings = 3, sw = 1.5, rowStep = R / 2, y0 = 10, xc = 20, rect = [0.7, 4, 39.3, 59.3] }) {
  const rho0 = R - sw / 2, rhos = Array.from({ length: rings }, (_, k) => rho0 * (1 - k / rings));
  const scales = [];
  for (let j = 0, y = y0; y - R < rect[3]; j++, y += rowStep) {
    const off = (j % 2) * R;
    for (let k = -6; k <= 6; k++) { const x = xc + off + 2 * R * k; if (x + R > rect[0] && x - R < rect[2]) scales.push([x, y]); }
  }
  const TAU = Math.PI * 2, norm = (a) => ((a % TAU) + TAU) % TAU;
  const addHidden = (hid, a, b) => {      // hide the angles from a to b (b >= a, any range)
    const len = b - a; if (len >= TAU) { hid.push([0, TAU]); return; }
    const s0 = norm(a), e = s0 + len;
    if (e <= TAU) hid.push([s0, e]); else { hid.push([s0, TAU]); hid.push([0, e - TAU]); }
  };
  const p = new Path();
  scales.forEach(([cx, cy], i) => {
    for (const rho of rhos) {
      const hid = [];
      for (let m = i + 1; m < scales.length; m++) {                  // later scales are in front and hide this ring inside their (centre-line) disc
        const [mx, my] = scales[m], d = Math.hypot(mx - cx, my - cy);
        if (d >= rho + rho0 || d <= rho - rho0) continue;
        if (d <= rho0 - rho) { hid.push([0, TAU]); continue; }
        const phi = Math.atan2(my - cy, mx - cx), al = Math.acos((rho * rho + d * d - rho0 * rho0) / (2 * rho * d));
        addHidden(hid, phi - al, phi + al);
      }
      const [x0, y0r, x1, y1] = rect;                                // outside the cloth
      const half = (v, kind) => {                                    // angles where cos(t) < v | cos(t) > v | sin(t) < v | sin(t) > v
        if (kind === 'cl') { if (v >= 1) return hid.push([0, TAU]); if (v <= -1) return; const a = Math.acos(v); addHidden(hid, a, TAU - a); }
        if (kind === 'cg') { if (v >= 1) return; if (v <= -1) return hid.push([0, TAU]); const a = Math.acos(v); addHidden(hid, -a, a); }
        if (kind === 'sl') { if (v >= 1) return hid.push([0, TAU]); if (v <= -1) return; addHidden(hid, Math.PI - Math.asin(v), TAU + Math.asin(v)); }
        if (kind === 'sg') { if (v >= 1) return; if (v <= -1) return hid.push([0, TAU]); addHidden(hid, Math.asin(v), Math.PI - Math.asin(v)); }
      };
      half((x0 - cx) / rho, 'cl'); half((x1 - cx) / rho, 'cg'); half((y0r - cy) / rho, 'sl'); half((y1 - cy) / rho, 'sg');
      hid.sort((a, b) => a[0] - b[0]);
      const vis = []; let at = 0;
      for (const [a, b] of hid) { if (a > at) vis.push([at, a]); at = Math.max(at, b); }
      if (at < TAU) vis.push([at, TAU]);
      if (vis.length > 1 && vis[0][0] === 0 && vis[vis.length - 1][1] === TAU) { const last = vis.pop(); vis[0][0] = last[0] - TAU; }
      for (const [a, b] of vis) {
        if ((b - a) * rho < 1.2) continue;
        const pt = (t) => [cx + rho * Math.cos(t), cy + rho * Math.sin(t)];
        if (b - a >= TAU - 1e-6) { const q0 = pt(a), q1 = pt(a + Math.PI); p.M(...q0).A(rho, rho, 0, 0, 1, ...q1).A(rho, rho, 0, 0, 1, ...q0); continue; }
        const q0 = pt(a), q1 = pt(b); p.M(...q0).A(rho, rho, 0, b - a > Math.PI, 1, ...q1);
      }
    }
  });
  return `<path fill="none" stroke="${hex('生成り')}" stroke-width="${sw}" d="${p.d(false)}"/>`;
}

// 7 亀甲: a flat-top hexagon lattice drawn as chained edges, clipped to the cloth.
function kikko({ a, sw = 2, rect = [1, 4, 39, 59], cx = 20, cy = 32 }) {
  const h = Math.sqrt(3) * a, key = (p) => `${Math.round(p[0] * 100)},${Math.round(p[1] * 100)}`, edges = new Map();
  for (let c = -4; c <= 4; c++) for (let r = -6; r <= 6; r++) {
    const x = cx + c * 1.5 * a, y = cy + r * h + (Math.abs(c) % 2) * (h / 2);
    if (x < -a || x > 40 + a || y < 4 - h || y > 60 + h) continue;
    const v = [[x + a, y], [x + a / 2, y + h / 2], [x - a / 2, y + h / 2], [x - a, y], [x - a / 2, y - h / 2], [x + a / 2, y - h / 2]];
    for (let i = 0; i < 6; i++) {
      const s = clipSeg(v[i], v[(i + 1) % 6], rect); if (!s || dist(s[0], s[1]) < 0.4) continue;
      const k1 = key(s[0]), k2 = key(s[1]), id = k1 < k2 ? k1 + '|' + k2 : k2 + '|' + k1;
      if (!edges.has(id)) edges.set(id, s);
    }
  }
  const segs = [...edges.values()], adj = new Map(), used = new Array(segs.length).fill(false);
  segs.forEach((s, i) => { for (const e of s) { const k = key(e); if (!adj.has(k)) adj.set(k, []); adj.get(k).push(i); } });
  const extend = (chain, from) => {
    for (;;) {
      const tip = from ? chain[chain.length - 1] : chain[0], k = key(tip), next = (adj.get(k) || []).find((i) => !used[i]);
      if (next === undefined) return;
      used[next] = true; const s = segs[next], far = key(s[0]) === k ? s[1] : s[0];
      if (from) chain.push(far); else chain.unshift(far);
    }
  };
  const p = new Path();
  const order = segs.map((s, i) => i).sort((i, j) => segs[i][0][1] + segs[i][1][1] - segs[j][0][1] - segs[j][1][1] || segs[i][0][0] - segs[j][0][0]);
  for (const i of order) {
    if (used[i]) continue;
    used[i] = true; const chain = [segs[i][0], segs[i][1]]; extend(chain, true); extend(chain, false);
    p.poly(chain, false);
  }
  return g10(`fill="none" stroke="${hex('山吹')}" stroke-width="${sw * 10}"`, `<path d="${p.d(true)}"/>`);
}

// 13 鱗: rows of upward triangles (the triangular tiling; the cloth shows between them as the downward ones), six rows exactly between the sleeve and the hem.
function uroko({ rows = 6, rect = [0, 4, 40, 60] }) {
  const hh = (rect[3] - rect[1]) / rows, b = (2 * hh) / Math.sqrt(3), p = new Path();
  for (let r = 0; r < rows; r++) {
    const yb = rect[3] - r * hh, off = (r % 2) * (b / 2);
    for (let x = 20 + off - b * Math.ceil((20 + off) / b) - b; x < 41 + b; x += b) {
      const tri = clipPoly([[x, yb], [x + b / 2, yb - hh], [x + b, yb]], rect);
      if (tri.length >= 3 && Math.abs(area(tri)) > 0.3) p.poly(tri.map(([X, Y]) => [tn(X) / 10, tn(Y) / 10]));
    }
  }
  return g10(`fill="${hex('生成り')}"`, `<path d="${p.d(true)}"/>`);
}

// 5 鶴: an original geometric crane, wings spread, neck up and legs trailing, all straight edges (symmetrical but for the turned head).
function tsuru() {
  const k = hex('生成り'), ink = hex('紺');
  const wingL = [[17.4, 26], [10, 22.2], [1.6, 24.4], [0.8, 31.4], [4.2, 29.6], [4.4, 35.6], [8.2, 33.4], [8.6, 38.8], [12, 36.4], [12.8, 41.4], [15.6, 38.4], [17.4, 37.6]];
  const wingR = wingL.map(([x, y]) => [40 - x, y]).reverse();
  for (const w of [wingL, wingR]) w.forEach((q) => { q[0] = 20 + (q[0] - 20) * 0.9; });      // keep the wing tips off the hem
  const body = [[20, 22.6], [23.2, 27], [23.8, 33], [21.8, 40], [20, 46.4], [18.2, 40], [16.2, 33], [16.8, 27]];
  const neck = [[18.9, 26], [18.5, 21], [19.4, 16.4], [21, 12.8], [23.6, 12.4], [21.8, 16.6], [20.9, 21.6], [21.1, 26]];
  const beak = [[23.4, 9.6], [30.2, 7.6], [24.6, 12.6]];
  const legs = new Path().M(19.2, 44).L(17.4, 57).M(20.9, 44).L(23.2, 57.4);
  const wings = new Path().poly(wingL).poly(wingR);
  const trunk = new Path().poly(body).poly(neck);
  return `<path fill="none" stroke="${k}" stroke-width="1.4" d="${legs.d()}"/><path fill="${k}" d="${wings.d()}"/><path fill="${k}" stroke="${ink}" stroke-width=".9" stroke-linejoin="round" d="${trunk.d()}"/>`
    + `<circle cx="22.4" cy="10.9" r="2.2" fill="${k}"/><path fill="${k}" d="${new Path().poly(beak).d()}"/><circle cx="22" cy="9.6" r="1" fill="${hex('茜')}"/>`;
}

// 9 朝日: a yellow half sun on the horizon, seven rays above it and three stripes of its reflection (東雲) below, on blue sea. Rays stay on the cloth (tips 2.3 from the sides).
function asahi() {
  const k = hex('山吹'), cx = 20, hy = 36, r0 = 10.2, r1 = 13, r2 = 19.4, hw = 2.2, rays = new Path();
  for (let i = 0; i < 7; i++) {
    const th = rad(24 + i * 22), ux = Math.cos(th), uy = -Math.sin(th), nx = -uy, ny = ux;
    rays.poly([[cx + r1 * ux + hw * nx, hy + r1 * uy + hw * ny], [cx + r2 * ux, hy + r2 * uy], [cx + r1 * ux - hw * nx, hy + r1 * uy - hw * ny]]);
  }
  const sun = new Path().M(cx - r0, hy).A(r0, r0, 0, 0, 1, cx + r0, hy).Z();
  const sea = new Path().M(6, hy + 5.4).L(34, hy + 5.4).M(10, hy + 9.8).L(30, hy + 9.8).M(14, hy + 14.2).L(26, hy + 14.2);
  return `<path fill="${k}" d="${sun.d()}${rays.d()}"/><path fill="none" stroke="${hex('東雲')}" stroke-width="2" d="${sea.d()}"/>`;
}

// 10 波頭: a breaking wave: a big curling crest (a hollow under the lip), foam drops above the lip, three flow lines in the body.
function namigashira() {
  const k = hex('生成り'), sea = hex('浅葱');
  const body = new Path().M(0, 60).L(0, 42).C(8, 42, 13.5, 35, 15.5, 27.5).C(17.8, 19, 23, 12, 30.5, 11.6).C(36, 11.4, 39.2, 15.6, 38, 21.6)
    .C(35.6, 17.8, 31.4, 17, 28.8, 20).C(26, 23.4, 27.4, 29.4, 32, 32.6).C(35, 34.8, 38, 35.2, 40, 34.8).L(40, 60).Z();
  const flow = new Path().M(0.8, 50.4).C(7.2, 49.8, 11.9, 45, 14.2, 38.5).M(5.5, 59.2).C(13, 58, 19.6, 52.6, 22.6, 44.4).M(20, 59.2).C(27, 58.6, 32.4, 53.4, 35.4, 46.2);
  return `<path fill="${k}" d="${body.d()}"/><path fill="none" stroke="${sea}" stroke-width="1.5" d="${flow.d()}"/>`
    + `<circle cx="33.6" cy="7.6" r="1.7" fill="${k}"/><circle cx="38" cy="10.6" r="1.2" fill="${k}"/><circle cx="26.4" cy="8.6" r="1.1" fill="${k}"/>`;
}

// 11 亀: an original geometric turtle seen from above: round head, four flippers, a tail, and a shell of a centre hexagon and six scutes.
function kame() {
  const k = hex('山吹'), ink = hex('紺'), cx = 20, cy = 34, rx = 10, ry = 13;
  const fl = new Path();
  const leaf = (m, q1, q2, mirror) => { const X = (x) => (mirror ? 40 - x : x); fl.M(X(m[0]), m[1]).Q(X(q1[0]), q1[1], X(q1[2]), q1[3]).Q(X(q2[0]), q2[1], X(q2[2]), q2[3]).Z(); };
  for (const mirror of [false, true]) {
    leaf([11.2, 25.4], [5.6, 20.6, 1.4, 19.2], [3.4, 27.4, 12.2, 31.6], mirror);   // front flipper
    leaf([12, 41.4], [8.6, 45.6, 5.2, 49.8], [11.4, 50, 14.6, 46.4], mirror);        // rear flipper
  }
  fl.M(18.6, 46.2).L(20, 53.2).L(21.4, 46.2).Z();                                     // tail
  const hexR = 5.4, hv = [90, 30, -30, -90, -150, 150].map((a) => [cx + hexR * Math.cos(rad(a)), cy - hexR * Math.sin(rad(a))]);
  const lines = new Path().poly(hv);
  for (const a of [90, 30, -30, -90, -150, 150]) {
    const ux = Math.cos(rad(a)), uy = -Math.sin(rad(a)), re = 1 / Math.sqrt((ux / rx) ** 2 + (uy / ry) ** 2);
    lines.M(cx + hexR * ux, cy + hexR * uy).L(cx + re * ux, cy + re * uy);
  }
  return `<path fill="${k}" d="${fl.d()}"/><circle cx="20" cy="16.4" r="3.9" fill="${k}"/>`
    + `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${k}" stroke="${ink}" stroke-width="1.2"/><path fill="none" stroke="${ink}" stroke-width="1.2" stroke-linejoin="round" d="${lines.d()}"/>`
    + `<circle cx="18.3" cy="15.8" r=".8" fill="${ink}"/><circle cx="21.7" cy="15.8" r=".8" fill="${ink}"/>`;
}

// the character flags: glyph outlines in a tenths group, stroked in the same colour so the thin brush strokes survive at 24 px.
function textBody(colour, list, { bold = 0.7, extra = '' } = {}) {
  return extra + g10(`fill="${hex(colour)}" stroke="${hex(colour)}" stroke-width="${Math.round(bold * 10)}" stroke-linejoin="round"`, `<path d="${glyphD(list)}"/>`);
}

function tairyo(eps) {
  const sy = 0.0287, sx = sy * 1.2, g = 1.2, h1 = ink('大').h * sy, h2 = ink('漁').h * sy, top = 32 - (h1 + g + h2) / 2;
  return textBody('山吹', [glyphPolys('大', { cx: 20, cy: top + h1 / 2, sx, sy, eps }), glyphPolys('漁', { cx: 20, cy: top + h1 + g + h2 / 2, sx, sy, eps })]);
}
function single(ch, cy, w, vstretch, eps) { const sx = w / ink(ch).w; return glyphPolys(ch, { cx: 20, cy, sx, sy: sx * vstretch, eps }); }
function iwai(eps) {
  const k = hex('茜'), saw = new Path();
  for (const yb of [10.4, 53.6]) { saw.M(4.1, yb); for (let i = 0; i < 6; i++) saw.L(4.1 + 5.3 * i + 2.65, yb - 4.2).L(4.1 + 5.3 * (i + 1), yb); saw.Z(); }
  return `<path fill="${k}" d="${saw.d()}"/>` + textBody('茜', [single('祝', 32, 33, 1, eps)]);
}
function fuku(eps) {
  const k = hex('生成り');
  return `<path fill="none" stroke="${k}" stroke-width="1.4" d="M5 8.6h30M5 11.8h30M5 52.2h30M5 55.4h30"/>` + textBody('生成り', [single('福', 32, 33, 1, eps)]);
}
function man(eps) {
  const k = hex('山吹');   // a thick rule over a thin one at the head, mirrored at the foot (福 has two equal rules)
  return `<path fill="none" stroke="${k}" stroke-width="2.2" d="M5 9.2h30M5 54.8h30"/><path fill="none" stroke="${k}" stroke-width="1" d="M5 12.8h30M5 51.2h30"/>` + textBody('山吹', [single('満', 32, 33, 1, eps)]);
}
function kesennuma(eps) {
  const chars = ['気', '仙', '沼'], gap = 1.7, H = 49, sy = (H - 2 * gap) / chars.reduce((n, ch) => n + ink(ch).h, 0), sx = sy * 1.3;
  let y = 4 + (56 - H) / 2; const list = [];
  for (const ch of chars) { const h = ink(ch).h * sy; list.push(glyphPolys(ch, { cx: 20, cy: y + h / 2, sx, sy, eps })); y += h + gap; }
  return textBody('山吹', list);
}

// ---------------------------------------------------------------- the thirteen
const FLAGS = [
  { id: 'nichirin', ja: '日輪', en: 'sun disc', cloth: '生成り', edge: '茜', motif: '茜', body: nichirin },
  { id: 'tairyo', ja: '大漁', en: 'big catch', cloth: '茜', edge: '紺', motif: '山吹', body: tairyo, fit: true },
  { id: 'seigaiha', ja: '青海波', en: 'blue-sea waves', cloth: '藍', edge: '紺', motif: '生成り', body: () => seigaiha({ R: 16, rings: 3, sw: 1.5 }) },
  { id: 'iwai', ja: '祝', en: 'celebration', cloth: '山吹', edge: '茜', motif: '茜', body: iwai, fit: true },
  { id: 'tsuru', ja: '鶴', en: 'crane', cloth: '紺', edge: '墨', motif: '生成り', extra: ['茜'], body: tsuru },
  { id: 'kesennuma', ja: '気仙沼', en: 'Kesennuma', cloth: '藍', edge: '紺', motif: '山吹', body: kesennuma, fit: true },
  { id: 'kikko', ja: '亀甲', en: 'tortoiseshell', cloth: '茜', edge: '紺', motif: '山吹', body: () => kikko({ a: 7, sw: 2 }) },
  { id: 'fuku', ja: '福', en: 'good fortune', cloth: '茜', edge: '紺', motif: '生成り', body: fuku, fit: true },
  { id: 'asahi', ja: '朝日', en: 'morning sun', cloth: '藍', edge: '紺', motif: '山吹', extra: ['東雲'], body: asahi },
  { id: 'namigashira', ja: '波頭', en: 'wave crest', cloth: '浅葱', edge: '藍', motif: '生成り', body: namigashira },
  { id: 'kame', ja: '亀', en: 'turtle', cloth: '紺', edge: '墨', motif: '山吹', body: kame },
  { id: 'man', ja: '満', en: 'fullness', cloth: '茜', edge: '紺', motif: '山吹', body: man, fit: true },
  { id: 'uroko', ja: '鱗', en: 'scales', cloth: '紺', edge: '墨', motif: '生成り', body: () => uroko({ rows: 6 }) },
];

export function build({ budget = 1450, eps0 = 0.14 } = {}) {
  const flags = [], used = new Set();
  for (const f of FLAGS) {
    let svg, eps = eps0;
    for (;;) {
      svg = frame({ cloth: f.cloth, edge: f.edge, body: f.body(eps) });
      if (!f.fit || svg.length <= budget || eps >= 0.7) break;
      eps = Math.round((eps + 0.02) * 100) / 100;
    }
    const colors = [f.motif, f.cloth, ...new Set([f.edge, ...(f.extra || [])])].filter((c, i, a) => a.indexOf(c) === i);
    colors.forEach((c) => used.add(c));
    flags.push({ id: f.id, name: { ja: f.ja, en: f.en }, colors, svg, eps: f.fit ? eps : undefined });
  }
  const palette = {}; for (const name of Object.keys(PALETTE)) if (used.has(name)) palette[name] = PALETTE[name];
  return { palette, flags };
}


// ---------------------------------------------------------------- bounds (a conservative bounding box of what a flag draws: strokes widened by half their width)
function arcPoints(x1, y1, rx, ry, fa, fs, x2, y2) {       // endpoint arc -> sample points (no rotation is ever used here)
  rx = Math.abs(rx); ry = Math.abs(ry);
  if (!rx || !ry) return [[x2, y2]];
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2, lam = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
  if (lam > 1) { const q = Math.sqrt(lam); rx *= q; ry *= q; }
  const num = rx * rx * ry * ry - rx * rx * dy * dy - ry * ry * dx * dx, den = rx * rx * dy * dy + ry * ry * dx * dx;
  const co = (fa === fs ? -1 : 1) * Math.sqrt(Math.max(0, num / den)), cxp = (co * rx * dy) / ry, cyp = (-co * ry * dx) / rx;
  const cx = cxp + (x1 + x2) / 2, cy = cyp + (y1 + y2) / 2, ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const th1 = ang(1, 0, (dx - cxp) / rx, (dy - cyp) / ry);
  let dth = ang((dx - cxp) / rx, (dy - cyp) / ry, (-dx - cxp) / rx, (-dy - cyp) / ry);
  if (!fs && dth > 0) dth -= 2 * Math.PI; else if (fs && dth < 0) dth += 2 * Math.PI;
  return Array.from({ length: 33 }, (_, i) => [cx + rx * Math.cos(th1 + (dth * i) / 32), cy + ry * Math.sin(th1 + (dth * i) / 32)]);
}
function pathPoints(d) {
  const pts = []; let i = 0, cx = 0, cy = 0, sx = 0, sy = 0, cmd = '';
  const ws = () => { while (i < d.length && /[\s,]/.test(d[i])) i++; };
  const num = () => { ws(); const m = /^[+-]?(\d+\.?\d*|\.\d+)/.exec(d.slice(i)); if (!m) throw new Error('bad path at ' + i + ': ' + d.slice(i, i + 20)); i += m[0].length; return parseFloat(m[0]); };
  const flag = () => { ws(); const c = d[i++]; if (c !== '0' && c !== '1') throw new Error('bad arc flag'); return +c; };
  const more = () => { ws(); return i < d.length && !/[A-Za-z]/.test(d[i]); };
  while (i < d.length) {
    ws(); if (i >= d.length) break;
    if (/[A-Za-z]/.test(d[i])) cmd = d[i++];
    else if (cmd === 'M') cmd = 'L'; else if (cmd === 'm') cmd = 'l';
    const rel = cmd === cmd.toLowerCase(), U = cmd.toUpperCase();
    if (U === 'Z') { cx = sx; cy = sy; continue; }
    let first = true;
    do {
      if (U === 'M' || U === 'L') { const x = num(), y = num(); cx = rel ? cx + x : x; cy = rel ? cy + y : y; if (U === 'M' && first) { sx = cx; sy = cy; cmd = rel ? 'l' : 'L'; } pts.push([cx, cy]); }
      else if (U === 'H') { const x = num(); cx = rel ? cx + x : x; pts.push([cx, cy]); }
      else if (U === 'V') { const y = num(); cy = rel ? cy + y : y; pts.push([cx, cy]); }
      else if (U === 'C') { const v = [num(), num(), num(), num(), num(), num()]; for (let k = 0; k < 6; k += 2) pts.push([rel ? cx + v[k] : v[k], rel ? cy + v[k + 1] : v[k + 1]]); cx = rel ? cx + v[4] : v[4]; cy = rel ? cy + v[5] : v[5]; }
      else if (U === 'Q') { const v = [num(), num(), num(), num()]; for (let k = 0; k < 4; k += 2) pts.push([rel ? cx + v[k] : v[k], rel ? cy + v[k + 1] : v[k + 1]]); cx = rel ? cx + v[2] : v[2]; cy = rel ? cy + v[3] : v[3]; }
      else if (U === 'A') { const rx = num(), ry = num(); num(); const fa = flag(), fs = flag(), x = num(), y = num(), nx = rel ? cx + x : x, ny = rel ? cy + y : y; pts.push(...arcPoints(cx, cy, rx, ry, fa, fs, nx, ny)); cx = nx; cy = ny; }
      else throw new Error('unsupported path command ' + cmd);
      first = false;
    } while (more());
  }
  return pts;
}
export function svgBounds(svg) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const add = (x, y, r) => { x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); };
  const attr = (a, n) => { const m = new RegExp(`(?:^|\\s)${n}="([^"]*)"`).exec(a); return m ? m[1] : null; };
  const stack = [{ scale: 1, sw: null, stroke: null }];
  for (const m of svg.matchAll(/<(\/?)(g|path|circle|ellipse)\b([^>]*?)(\/?)>/g)) {
    const [, close, tag, a, self] = m, top = stack[stack.length - 1];
    if (tag === 'g') {
      if (close) { stack.pop(); continue; }
      const t = attr(a, 'transform'), sc = t ? parseFloat(/scale\(([^)]*)\)/.exec(t)[1]) : 1;
      stack.push({ scale: top.scale * sc, sw: attr(a, 'stroke-width') ?? top.sw, stroke: attr(a, 'stroke') ?? top.stroke });
      if (self) stack.pop();
      continue;
    }
    const stroke = attr(a, 'stroke') ?? top.stroke, sw = parseFloat(attr(a, 'stroke-width') ?? top.sw ?? 1), half = stroke && stroke !== 'none' ? (sw * top.scale) / 2 : 0, S = top.scale;
    if (tag === 'path') for (const [x, y] of pathPoints(attr(a, 'd'))) add(x * S, y * S, half);
    else { const cx = +attr(a, 'cx'), cy = +attr(a, 'cy'), rx = +(attr(a, 'rx') ?? attr(a, 'r')), ry = +(attr(a, 'ry') ?? attr(a, 'r')); add(cx - rx, cy - ry, half); add(cx + rx, cy + ry, half); }
  }
  return { x0, y0, x1, y1 };
}

// ---------------------------------------------------------------- checks
export function check(doc) {
  const problems = [], vals = new Set(Object.values(PALETTE).map((v) => v.toLowerCase()));
  let total = 0;
  if (doc.flags.length !== 13) problems.push(`${doc.flags.length} flags, want 13`);
  for (const f of doc.flags) {
    const n = Buffer.byteLength(f.svg); total += n;
    if (n > FLAG_MAX) problems.push(`${f.id}: ${n} bytes > ${FLAG_MAX}`);
    for (const m of f.svg.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) if (!vals.has(m[0].toLowerCase())) problems.push(`${f.id}: colour ${m[0]} is not in the palette`);
    for (const bad of ['<filter', 'Gradient', 'clipPath', 'clip-path', '<mask', 'opacity', '<style', ' id=', '<text', '<use', '<image', 'aria-hidden']) if (f.svg.includes(bad)) problems.push(`${f.id}: contains ${bad}`);
    if (!/^<svg [^>]*viewBox="0 0 40 60"/.test(f.svg)) problems.push(`${f.id}: viewBox`);
    const bb = svgBounds(f.svg), tol = 0.1;
    if (bb.x0 < -tol || bb.y0 < -tol || bb.x1 > 40 + tol || bb.y1 > 60 + tol) problems.push(`${f.id}: draws outside the cloth: x ${bb.x0.toFixed(2)}..${bb.x1.toFixed(2)}, y ${bb.y0.toFixed(2)}..${bb.y1.toFixed(2)}`);
    if (/\d\.\d\d/.test(f.svg.replace(/viewBox="[^"]*"/, ''))) problems.push(`${f.id}: more than one decimal`);
    for (const c of f.colors) if (!doc.palette[c]) problems.push(`${f.id}: colour ${c} missing from the palette object`);
  }
  if (total > TOTAL_MAX) problems.push(`total ${total} bytes > ${TOTAL_MAX}`);
  return { problems, total };
}

// flags.json: the palette on one line, one flag per line (the file stays small and a diff stays readable)
export function serialise(doc) {
  const flags = doc.flags.map(({ id, name, colors, svg }) => '    ' + JSON.stringify({ id, name, colors, svg }));
  return `{\n  "palette": ${JSON.stringify(doc.palette)},\n  "flags": [\n${flags.join(',\n')}\n  ]\n}\n`;
}

if (import.meta.main) {
  const doc = build();
  const { problems, total } = check(doc);
  const text = serialise(doc), fileBytes = Buffer.byteLength(text);
  if (fileBytes > TOTAL_MAX) problems.push(`flags.json is ${fileBytes} bytes > ${TOTAL_MAX}`);
  for (const f of doc.flags) console.error(`${f.id.padEnd(12)} ${f.name.ja.padEnd(4, '　')} ${String(Buffer.byteLength(f.svg)).padStart(5)} B  ${f.colors.join(' ')}${f.eps ? '  eps ' + f.eps : ''}`);
  console.error(`total ${total} B of svg (limit ${TOTAL_MAX}); flag limit ${FLAG_MAX}; flags.json ${fileBytes} B`);
  if (problems.length) { console.error('PROBLEMS:\n  ' + problems.join('\n  ')); process.exit(1); }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, text);
  console.error('wrote', OUT);
}
