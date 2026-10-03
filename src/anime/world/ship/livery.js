// [ship] Livery atlas for 第一昭福丸 (SHOFUKU MARU No.1, 7KFY): one 2048 x 1024 canvas texture holds both hull sides
// and every painted mark on the superstructure.
//
//   rows    0-447   port hull side, drawn as seen from port (bow on the LEFT, like the nendo photo shofukumaru02)
//   rows  448-895   starboard hull side, drawn as seen from starboard (bow on the RIGHT, like shofukumaru03)
//   rows  896-1023  a strip of cells: 7KFY rail board, MG1-2112 board, the funnel crest (nendo only), 7KFY deck
//                   lettering and the transom lettering (both on a transparent background), four 大漁旗 designs
//
// Hull sides are addressed in (s, h): s = metres aft of the stem head, h = metres above the waterline (the top of
// the red antifouling). Both sides are painted, never mirrored: the two sides of the real ship differ.
//
// Two liveries:
//   'fallback'  white hull, red antifouling, black bow wedge, the name, 7KFY and MG1-2112. Nothing derived from the
//               nendo design: no X lines, triangles, circle or crest. This file holds no nendo coordinates at all.
//   'nendo'     drawn at runtime from data/ship/shofukumaru1/livery-nendo.json (traced shapes), lines-nendo.json
//               (traced diagonals) and livery-nendo-marks.json (circles, missed pieces, ignore zones, the crest).
//               Those files are fetched only when the flag in ./flags.js is on; they are never imported, so a public
//               build without the flag neither bundles nor fetches them.
//
// The clean-up (cleanNendo) turns the noisy traces into crisp anime shapes: same-colour fragments that touch are
// merged (only while their union stays compact, so the two triangles of an X never fuse), each shape becomes its convex hull simplified to the fewest corners that keep 92 % of its area, corners
// at the waterline drop just under it (the antifouling is painted last) and corners at the stem or stern run off
// the bow. Nothing is snapped to the stern: aft of the quarter knuckle (where the rounded stern turns to face aft,
// profile.knuckleAt) the transom is painted white over every livery shape, as on the model (shofukumaru04: the stern
// triangles stop at the quarter and the white transom carries the name). Everything else stays where it was measured.

export const ATLAS = {
  W: 2048, H: 1024,
  S0: -0.6, S1: 59.0,          // s range across the 2048 px of a side band (34.36 px/m)
  HT: 7.8, HB: -5.2,           // h range down a side band (448 px, 34.46 px/m)
  side: { port: 0, starboard: 448 }, sideH: 448,
  strip: 896, stripH: 128,
  cells: {
    board7kfy: [0, 896, 288, 128],
    boardMG: [288, 896, 288, 128],
    crest: [576, 896, 128, 128],
    deck7kfy: [704, 896, 256, 128],
    stern: [960, 896, 320, 128],
    flag0: [1280, 896, 192, 128], flag1: [1472, 896, 192, 128], flag2: [1664, 896, 192, 128], flag3: [1856, 896, 192, 128],
  },
};
const KX = ATLAS.W / (ATLAS.S1 - ATLAS.S0), KY = ATLAS.sideH / (ATLAS.HT - ATLAS.HB);

export const COLORS = {
  white: '#f2f3f1', black: '#16181f', red: '#c8202a', antifoul: '#8c2b2b', edge: '#4a4c55',
  porthole: '#2c3140', portholeRim: '#c9ccc8', text: '#16181f',
};

/** Painted text placements (not livery: the real ship carries the name and call sign whatever the paint). */
export const NAME = {
  ja: '第一昭福丸', en: 'SHOFUKU MARU No.1', call: '7KFY', reg: 'MG1-2112', port: '気仙沼', portEn: 'KESENNUMA',
  // measured: port on shofukumaru02 (s 7.0-10.7); starboard on the WCPFC photo of the real ship (x 2086-1955, s 5.5-8.8),
  // between the bow line and the X1 red triangle, which starts at s 9.2
  place: { port: { s: [7.0, 10.7], h: [4.1, 4.65], sub: [3.62, 3.92] }, starboard: { s: [5.4, 8.9], h: [4.15, 4.72], sub: [3.66, 3.98] } },
  // the transom (shofukumaru04, starboard quarter from aft, about 7.9 px/m there): three lines centred on the
  // centreline below the stern bay. The hull name, a romanised line read as the port of registry (KESENNUMA: seven to
  // nine bold capitals, too small in the photo to read letter by letter) and the romanised name. The decal box is
  // w metres wide at most, h0-h1 high; each line is [text, h0, h1, width] in metres. The 'stern' cell packs the three
  // lines one under the other, each band as tall as its line (no texels spent on the white between them); the decal
  // maps each line's strip on the transom to its band (transomBands).
  transom: {
    w: 3.2, h0: 1.25, h1: 3.55,
    lines: [['ja', 2.85, 3.45, 3.0], ['portEn', 2.05, 2.4, 2.3], ['en', 1.35, 1.63, 2.4]],
  },
};

/** Generic hull portholes (structure, both liveries): read off shofukumaru02/05. */
export const PORTHOLES = [[45.7, 5.7], [50.3, 5.7], [53.4, 5.7], [48.6, 4.4], [56.3, 3.6], [19.0, 4.1], [21.5, 4.1]];

/**
 * The transom lettering lines and their bands in the 'stern' cell: [{ key, h0, h1, width, v0, v1 }], v in 0..1 up the
 * cell (v1 at the top), the first line on top, each band's share of the cell equal to its line's share of the height.
 */
export function transomBands(T = NAME.transom) {
  const tot = T.lines.reduce((a, l) => a + (l[2] - l[1]), 0);
  let top = 1;
  return T.lines.map(([key, h0, h1, width]) => { const v1 = top, v0 = top - (h1 - h0) / tot; top = v0; return { key, h0, h1, width, v0, v1 }; });
}

// --------------------------------------------------------------------------------------------- mapping
/** Canvas pixel of (s, h) on a side band. */
export function sidePx(side, s, h) {
  const y = ATLAS.side[side] + (ATLAS.HT - h) * KY;
  const x = side === 'port' ? (s - ATLAS.S0) * KX : (ATLAS.S1 - s) * KX;
  return [x, y];
}
/** Texture UV of (s, h) on a side band (three.js CanvasTexture: flipY, v = 1 at the canvas top). */
export function sideUV(side, s, h) {
  const [x, y] = sidePx(side, s, h);
  return [x / ATLAS.W, 1 - y / ATLAS.H];
}
/** Texture UV inside a strip cell: (u, v) in 0..1, v = 1 at the cell top. */
export function cellUV(name, u, v) {
  const [x, y, w, h] = ATLAS.cells[name];
  return [(x + u * w) / ATLAS.W, 1 - (y + (1 - v) * h) / ATLAS.H];
}

// --------------------------------------------------------------------------------------------- geometry helpers
export function convexHull(pts) {
  const p = pts.map((q) => [q[0], q[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}
export function polyArea(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a) / 2; }
/** Visvalingam: drop the corner that costs the least area until another drop would lose more than `keep` of the area. */
export function simplify(pts, keep = 0.92) {
  let p = pts.slice(); const A = polyArea(p);
  while (p.length > 3) {
    let best = -1, bestA = Infinity;
    for (let i = 0; i < p.length; i++) { const a = polyArea([p[(i + p.length - 1) % p.length], p[i], p[(i + 1) % p.length]]); if (a < bestA) { bestA = a; best = i; } }
    const q = p.slice(0, best).concat(p.slice(best + 1));
    if (polyArea(q) < keep * A) break;
    p = q;
  }
  return p;
}
const bbox = (pts) => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [s, h] of pts) { a = Math.min(a, s); b = Math.min(b, h); c = Math.max(c, s); d = Math.max(d, h); } return [a, b, c, d]; };
const inBox = (p, z) => p[0] >= z.s[0] && p[0] <= z.s[1] && p[1] >= z.h[0] && p[1] <= z.h[1];

/** Piecewise-linear interpolation through [[x, y], ...] (sorted by x), extended linearly past both ends. */
export function pwl(table, x) {
  const n = table.length;
  if (n === 1) return table[0][1];
  let i = 1; while (i < n - 1 && x > table[i][0]) i++;
  const [x0, y0] = table[i - 1], [x1, y1] = table[i];
  return y0 + ((x - x0) * (y1 - y0)) / (x1 - x0 || 1);
}
/**
 * Map a traced point into the true (s, h) frame. A side photo that is not truly side-on (shofukumaru03 is a slight
 * three-quarter view, traced at one uniform 0.1266 m/px) stretches s near the near bow and h where the camera looks
 * down: fit.s maps the traced s to the true s through measured anchors (stem, foremast, bridge front, radar mast, aft
 * mast, transom); fit.h scales h by a factor that depends on the TRUE s. No fit: the point is returned as it is.
 */
export function fitPoint(fit, s, h) {
  if (!fit) return [s, h];
  const st = fit.s ? pwl(fit.s, s) : s;
  return [st, fit.h ? h * pwl(fit.h, st) : h];
}

// --------------------------------------------------------------------------------------------- plans
/**
 * A plan is what gets painted: per side { shapes: [{colour, pts, tag}], lines: [[s0,h0,s1,h1]], circles: [...] },
 * plus crest strokes (nendo only). Every item carries src 'fallback' or 'nendo' so tests can prove the fallback
 * holds nothing of the nendo design.
 */
export function fallbackPlan() {
  const wedge = (side) => ({ colour: 'black', tag: 'bow-wedge', src: 'fallback', pts: side === 'port' ? [[-0.6, 6.35], [3.2, 6.05], [2.9, 4.7]] : [[-0.6, 6.35], [3.2, 6.05], [2.9, 4.7]] });
  return { mode: 'fallback', port: { shapes: [wedge('port')], lines: [], circles: [] }, starboard: { shapes: [wedge('starboard')], lines: [], circles: [] }, crest: null };
}

/**
 * Clean the traced nendo livery into a plan. data = { traced (livery-nendo.json), lines (lines-nendo.json),
 * marks (livery-nendo-marks.json) }.
 */
export function cleanNendo(data, { mergeGap = 0.45, maxGrow = 1.45, keep = 0.92, wl = 0.45 } = {}) {
  const plan = { mode: 'nendo', crest: (data.marks?.crest || []).map((c) => ({ ...c, src: 'nendo' })) };
  for (const side of ['port', 'starboard']) {
    const marks = data.marks?.[side] || {};
    const ignore = marks.ignore || [];
    // the traced data is re-mapped into the true frame first (marks.fit); ignore zones and marks are in the true frame
    const fit = marks.fit || null;
    let frags = (data.traced?.[side]?.shapes || [])
      .map((sh) => ({ colour: sh.colour, pts: sh.pts.map((p) => fitPoint(fit, p[0], p[1])) }))
      .filter((sh) => { const [a, b, c, d] = bbox(sh.pts); const cen = [(a + c) / 2, (b + d) / 2]; return !ignore.some((z) => inBox(cen, z)); });
    // merge same-colour fragments whose boxes touch (a triangle split by the name or by portholes), but only when
    // the union stays compact: two separate triangles of an X never merge (their hull would be far bigger)
    let merged = true;
    while (merged) {
      merged = false;
      outer: for (let i = 0; i < frags.length; i++) for (let j = i + 1; j < frags.length; j++) {
        if (frags[i].colour !== frags[j].colour) continue;
        const A = bbox(frags[i].pts), B = bbox(frags[j].pts);
        const parts = polyArea(convexHull(frags[i].pts)) + polyArea(convexHull(frags[j].pts));
        const union = polyArea(convexHull(frags[i].pts.concat(frags[j].pts)));
        if (union > maxGrow * parts) continue;
        if (A[0] - mergeGap <= B[2] && B[0] - mergeGap <= A[2] && A[1] - mergeGap <= B[3] && B[1] - mergeGap <= A[3]) {
          frags[i] = { colour: frags[i].colour, pts: frags[i].pts.concat(frags[j].pts) }; frags.splice(j, 1); merged = true; break outer;
        }
      }
    }
    const shapes = frags.map((f) => {
      let p = simplify(convexHull(f.pts), keep);
      // corners at the stem run off the hull end; aft corners stay where they were traced (the transom paint clips them)
      p = p.map(([s, h]) => [s < 0.8 ? ATLAS.S0 : s, h <= wl ? -0.2 : h]);
      return { colour: f.colour, pts: p, tag: 'traced', src: 'nendo' };
    });
    for (const sh of marks.shapes || []) shapes.push({ colour: sh.colour, pts: sh.pts.map((p) => [p[0], p[1]]), tag: sh.tag || 'mark', src: 'nendo', ...(sh.over ? { over: true } : {}) });
    // traced lines: re-mapped, then dropped when their midpoint is in an ignore zone that says lines: true (a traced
    // X replaced by a measured one); the marks' own lines are kept as they are
    const traced = (data.lines?.[side] || []).map((l) => [...fitPoint(fit, l[0], l[1]), ...fitPoint(fit, l[2], l[3])])
      .filter((l) => !ignore.some((z) => z.lines && inBox([(l[0] + l[2]) / 2, (l[1] + l[3]) / 2], z)));
    const lines = traced.concat(marks.lines || []).map((l) => ({ l: l.slice(0, 4).map((v) => Math.round(v * 1000) / 1000), src: 'nendo' }));
    const circles = (marks.circles || []).map((c) => ({ ...c, src: 'nendo' }));
    plan[side] = { shapes, lines, circles };
  }
  return plan;
}

/** Fetch the three nendo files (page-relative data/ship/shofukumaru1/). Only ever called when the flag is on. */
export const NENDO_FILES = { traced: 'livery-nendo.json', lines: 'lines-nendo.json', marks: 'livery-nendo-marks.json' };
export async function loadNendo(fetchJson = defaultFetchJson, base = null) {
  const root = base ?? (typeof location !== 'undefined' ? new URL('data/ship/shofukumaru1/', location.href).href : 'data/ship/shofukumaru1/');
  const [traced, lines, marks] = await Promise.all(Object.values(NENDO_FILES).map((f) => fetchJson(root + f)));
  return { traced, lines, marks };
}
async function defaultFetchJson(url) { const r = await fetch(url); if (!r.ok) throw new Error(`livery: ${url} ${r.status}`); return r.json(); }

// --------------------------------------------------------------------------------------------- painting
const FONT_SERIF = '"Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", serif';
const FONT_SANS = '"Noto Sans JP", "Hiragino Sans", "Yu Gothic", Arial, sans-serif';

/**
 * Paint a plan into a 2D context of ATLAS.W x ATLAS.H. profile: { sheerAt(s) (the deck-edge line), knuckleAt(h) (the
 * s of the quarter knuckle at height h: aft of it the hull faces aft, the transom) }.
 * layers: optional Set of 'base' | 'shapes' | 'circles' | 'lines' | 'transom' | 'text' | 'edge' | 'antifoul' | 'strip'
 * (the metrics pass paints 'shapes' alone; the transom clip goes with the shapes).
 * Order: shapes, circles, shapes marked over (painted across a circle's white disc, as on the real ship), lines, the
 * white transom, text, the gunwale edge, the antifouling.
 */
export function paintAtlas(g, plan, { profile = null, layers = null } = {}) {
  const on = (k) => !layers || layers.has(k);
  const W = ATLAS.W;
  g.clearRect(0, 0, W, ATLAS.H);
  for (const side of ['port', 'starboard']) {
    const y0 = ATLAS.side[side];
    const P = (s, h) => sidePx(side, s, h);
    g.save();
    g.beginPath(); g.rect(0, y0, W, ATLAS.sideH); g.clip();
    if (on('base')) { g.fillStyle = COLORS.white; g.fillRect(0, y0, W, ATLAS.sideH); }
    const sp = plan[side] || { shapes: [], lines: [], circles: [] };
    const poly = (pts) => { g.beginPath(); pts.forEach(([s, h], i) => { const [x, y] = P(s, h); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.closePath(); };
    const fillShapes = (over) => { for (const sh of sp.shapes) if (!!sh.over === over) { g.fillStyle = sh.colour === 'red' ? COLORS.red : COLORS.black; poly(sh.pts); g.fill(); } };
    if (on('shapes')) fillShapes(false);
    if (on('circles')) for (const c of sp.circles) {
      const [cx, cy] = P(c.c[0], c.c[1]);
      const disc = () => { g.beginPath(); g.ellipse(cx, cy, c.r * KX, c.r * KY, 0, 0, Math.PI * 2); };
      g.fillStyle = COLORS.white; disc(); g.fill();
      g.save(); disc(); g.clip();
      const [a, b, e, d] = c.cut; let dx = e - a, dy = d - b; const L = Math.hypot(dx, dy); dx /= L; dy /= L;
      let nx = -dy, ny = dx; if ((nx < 0) !== (c.red === 'fwd')) { nx = -nx; ny = -ny; }
      g.fillStyle = COLORS.red;
      poly([[a - dx * 20, b - dy * 20], [e + dx * 20, d + dy * 20], [e + dx * 20 + nx * 20, d + dy * 20 + ny * 20], [a - dx * 20 + nx * 20, b - dy * 20 + ny * 20]]); g.fill();
      g.restore();
      g.strokeStyle = COLORS.black; g.lineWidth = 0.13 * KX; disc(); g.stroke();
    }
    if (on('shapes')) fillShapes(true);
    if (on('lines')) {
      g.strokeStyle = COLORS.black; g.lineWidth = 0.17 * KX; g.lineCap = 'butt';
      for (const { l } of sp.lines) { const [x0, y0b] = P(l[0], l[1]), [x1, y1] = P(l[2], l[3]); g.beginPath(); g.moveTo(x0, y0b); g.lineTo(x1, y1); g.stroke(); }
      for (const c of sp.circles) { const [a, b, e, d] = c.cut; const [x0, y0b] = P(a, b), [x1, y1] = P(e, d); g.beginPath(); g.moveTo(x0, y0b); g.lineTo(x1, y1); g.stroke(); }
    }
    if (profile?.knuckleAt && (on('transom') || on('shapes'))) {
      // the transom: white aft of the quarter knuckle, from below the waterline to the top of the band
      g.fillStyle = COLORS.white; g.beginPath();
      const N = 24, hs = [];
      for (let i = 0; i <= N; i++) hs.push(-0.6 + ((ATLAS.HT + 0.6) * i) / N);
      hs.forEach((h, i) => { const [x, y] = P(profile.knuckleAt(h), h); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      for (const [s, h] of [[ATLAS.S1 + 1, ATLAS.HT], [ATLAS.S1 + 1, -0.6]]) { const [x, y] = P(s, h); g.lineTo(x, y); }
      g.closePath(); g.fill();
    }
    if (on('text')) {
      const pl = NAME.place[side];
      // Japanese hull names read from the bow aft on both sides: on starboard (bow on the right) that is right to left
      const ja = side === 'port' ? NAME.ja : [...NAME.ja].reverse().join('');
      boxText(g, ja, P(pl.s[0], pl.h[1]), P(pl.s[1], pl.h[0]), FONT_SERIF, 900, COLORS.text, 0.32);
      boxText(g, NAME.en, P(pl.s[0], pl.sub[1]), P(pl.s[1], pl.sub[0]), FONT_SANS, 700, COLORS.text, 0.06);
      // portholes (structure)
      for (const [s, h] of PORTHOLES) { const [x, y] = P(s, h); g.fillStyle = COLORS.portholeRim; g.beginPath(); g.arc(x, y, 0.24 * KX, 0, 7); g.fill(); g.fillStyle = COLORS.porthole; g.beginPath(); g.arc(x, y, 0.16 * KX, 0, 7); g.fill(); }
    }
    if (on('edge') && profile?.sheerAt) {
      // the dark deck-edge line along the top of the hull side (both liveries; it is the gunwale, not paint)
      g.fillStyle = COLORS.edge; g.beginPath();
      const N = 120; const top = [], bot = [];
      for (let i = 0; i <= N; i++) { const s = ATLAS.S0 + (ATLAS.S1 - ATLAS.S0) * (i / N); const h = profile.sheerAt(Math.min(58.6, Math.max(0, s))); top.push(P(s, h + 0.3)); bot.push(P(s, h - 0.2)); }
      top.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); for (let i = bot.length - 1; i >= 0; i--) g.lineTo(bot[i][0], bot[i][1]);
      g.closePath(); g.fill();
    }
    if (on('antifoul')) {
      // below the waterline everywhere, and over the whole knuckle-bulb, whose top stands 0.6 m proud of the line (02, 03)
      const [, yw] = P(0, 0); g.fillStyle = COLORS.antifoul; g.fillRect(0, yw, W, y0 + ATLAS.sideH - yw);
      poly([[ATLAS.S0, -0.1], [ATLAS.S0, 0.78], [5.75, 0.78], [6.3, -0.1]]); g.fill();
    }
    g.restore();
  }
  if (on('strip')) paintStrip(g, plan);
}

/** Fit text into the canvas box between corners a and b (any order), stretched to fill it like hull lettering. */
function boxText(g, text, a, b, font, weight, color, spacing = 0) {
  const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
  const w = x1 - x0, h = y1 - y0; if (w <= 0 || h <= 0) return;
  g.save();
  g.fillStyle = color; g.textBaseline = 'middle'; g.textAlign = 'center';
  g.font = `${weight} ${Math.round(h * 0.95)}px ${font}`;
  const chars = [...text]; const gap = spacing * h;
  const widths = chars.map((c) => g.measureText(c).width || h * 0.6);
  const total = widths.reduce((s, v) => s + v, 0) + gap * (chars.length - 1);
  const k = w / total;
  let x = x0;
  for (let i = 0; i < chars.length; i++) {
    g.save(); g.translate(x + (widths[i] * k) / 2, (y0 + y1) / 2); g.scale(k, 1); g.fillText(chars[i], 0, 0); g.restore();
    x += (widths[i] + gap) * k;
  }
  g.restore();
}

const FLAGS = [
  { bg: '#d9463b', a: '#f2c230', t: '大漁' }, { bg: '#2f64b5', a: '#e94b3c', t: '祝' },
  { bg: '#f2c230', a: '#2f64b5', t: '満船', fg: '#b3302a' }, { bg: '#3f8f5b', a: '#f2c230', t: '福来' },
];

function paintStrip(g, plan) {
  const C = ATLAS.cells;
  const board = (cell, text, frame) => {
    const [x, y, w, h] = C[cell];
    g.fillStyle = COLORS.white; g.fillRect(x, y, w, h);
    if (frame) { g.strokeStyle = '#2b2d35'; g.lineWidth = 6; g.strokeRect(x + 3, y + 3, w - 6, h - 6); }
    boxText(g, text, [x + w * 0.06, y + h * 0.16], [x + w * 0.94, y + h * 0.86], FONT_SANS, 900, COLORS.text, 0.12);
  };
  board('board7kfy', NAME.call, false);
  board('boardMG', NAME.reg, true);
  { const [x, y, w, h] = C.deck7kfy; g.clearRect(x, y, w, h); boxText(g, NAME.call, [x + 8, y + 10], [x + w - 8, y + h - 10], FONT_SANS, 900, '#2a2c34', 0.18); }
  { // the transom lettering (both liveries: the name and port of registry are not livery): transparent background,
    // one band per line (transomBands), read from aft (port on the left)
    const [x, y, w, h] = C.stern; g.clearRect(x, y, w, h);
    for (const { key, v0, v1 } of transomBands()) {
      const ja = key === 'ja', top = y + (1 - v1) * h, bot = y + (1 - v0) * h, pad = (bot - top) * 0.06;
      boxText(g, NAME[key], [x + w * 0.02, top + pad], [x + w * 0.98, bot - pad], ja ? FONT_SERIF : FONT_SANS, ja ? 900 : 700, COLORS.text, ja ? 0.18 : 0.1);
    }
  }
  // the crest cell: white, plus the crest strokes only in the nendo plan
  { const [x, y, w, h] = C.crest; g.fillStyle = COLORS.white; g.fillRect(x, y, w, h);
    if (plan.crest && plan.crest.length) {
      g.fillStyle = COLORS.black; g.strokeStyle = COLORS.black; g.lineJoin = 'miter'; g.lineCap = 'butt';
      for (const st of plan.crest) {
        if (st.type === 'poly') { g.lineWidth = st.w * w; g.beginPath(); st.pts.forEach(([u, v], i) => (i ? g.lineTo(x + u * w, y + v * h) : g.moveTo(x + u * w, y + v * h))); g.stroke(); }
        else if (st.type === 'disc') { g.beginPath(); g.arc(x + st.c[0] * w, y + st.c[1] * h, st.r * w, 0, Math.PI * 2); g.fill(); }
        else if (st.type === 'bar') { g.lineWidth = st.w * h; g.lineCap = 'round'; g.beginPath(); g.moveTo(x + st.a[0] * w, y + st.a[1] * h); g.lineTo(x + st.b[0] * w, y + st.b[1] * h); g.stroke(); g.lineCap = 'butt'; }
      }
    }
  }
  FLAGS.forEach((d, i) => {
    const [x, y, w, h] = C['flag' + i];
    g.fillStyle = d.bg; g.fillRect(x, y, w, h);
    g.fillStyle = d.a; g.beginPath(); g.arc(x + w * 0.2, y + h * 0.3, h * 0.17, 0, 7); g.fill();
    g.fillStyle = '#f7f1e3'; g.beginPath(); g.moveTo(x, y + h * 0.82);
    for (let k = 0; k <= w; k += 16) g.quadraticCurveTo(x + k + 8, y + h * (0.7 + ((k / 16) % 2) * 0.06), x + k + 16, y + h * 0.8);
    g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.closePath(); g.fill();
    boxText(g, d.t, [x + w * 0.36, y + h * 0.12], [x + w * 0.94, y + h * 0.62], FONT_SERIF, 900, d.fg || '#f7f1e3', 0.05);
    g.fillStyle = '#f7f1e3'; boxText(g, NAME.ja, [x + w * 0.36, y + h * 0.62], [x + w * 0.92, y + h * 0.74], FONT_SERIF, 900, '#f7f1e3', 0.1);
  });
}

// --------------------------------------------------------------------------------------------- canvas + texture
/** A 2D canvas: the DOM one, an OffscreenCanvas, or (bun tests, tools) a recording stub with the same API. */
export function makeCanvas(w, h) {
  if (typeof document !== 'undefined' && document.createElement) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  return stubCanvas(w, h);
}
export function stubCanvas(w, h) {
  const ops = [];
  const g = new Proxy({ canvas: null, ops }, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return (s) => ({ width: [...String(s)].length * 10 });
      return (...a) => { ops.push([k, ...a]); };
    },
    set(t, k, v) { ops.push(['set:' + String(k), v]); return true; },
  });
  const c = { width: w, height: h, stub: true, getContext: () => g, ops };
  return c;
}
