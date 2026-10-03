// [ship] What the livery atlas really paints, read back texel by texel: a probe 2D context replays paintAtlas() (paths,
// fills, strokes, clips, text boxes) and reports the colour at chosen canvas pixels. Fix round 2: the transom is white
// with the name in both liveries, the stern triangles stop at the quarter knuckle, and the starboard aft sheer triangle
// is the real ship's (WCPFC photo), not the half-height 03 trace.
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ATLAS, COLORS, NAME, transomBands, sidePx, fallbackPlan, cleanNendo, paintAtlas, stubCanvas } from '../src/anime/world/ship/livery.js';
import { SHIP, sheerAt, sternS, halfBreadth, knuckleS, zOf, transomDecalGeometry, buildShofukumaru } from '../src/anime/world/ship/shofukumaru1.js';

const ROOT = resolve(import.meta.dir, '..');
const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));
const NENDO = { traced: read('data/ship/shofukumaru1/livery-nendo.json'), lines: read('data/ship/shofukumaru1/lines-nendo.json'), marks: read('data/ship/shofukumaru1/livery-nendo-marks.json') };
const PROFILE = { sheerAt, knuckleAt: knuckleS };

/**
 * A 2D context that tracks the colour of a few canvas pixels only. Paths are flattened (arcs, ellipses and curves to
 * segments) in canvas space through the current transform; fill uses the non-zero rule, stroke the distance to the
 * segments, clip intersects. Text is its glyph box (measureText width x the font size): conservative, a box is never
 * thinner than the glyphs it stands for.
 */
function probeContext(points) {
  const col = points.map(() => 'transparent');
  let T = [1, 0, 0, 1, 0, 0], clips = [], st = { fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '10px sans-serif' };
  const stack = [];
  let subs = [], cur = null;
  const tp = (x, y) => [T[0] * x + T[2] * y + T[4], T[1] * x + T[3] * y + T[5]];
  const inside = (polys, [px, py]) => {
    let w = 0;
    for (const p of polys) for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const [xi, yi] = p[i], [xj, yj] = p[j];
      if (yj <= py) { if (yi > py && (xi - xj) * (py - yj) - (px - xj) * (yi - yj) > 0) w++; }
      else if (yi <= py && (xi - xj) * (py - yj) - (px - xj) * (yi - yj) < 0) w--;
    }
    return w !== 0;
  };
  const segDist = ([px, py], [ax, ay], [bx, by]) => { const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy; const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0; return Math.hypot(px - ax - t * dx, py - ay - t * dy); };
  const clipped = (p) => clips.every((c) => inside(c, p));
  const paint = (hit, colour) => points.forEach((p, i) => { if (clipped(p) && hit(p)) col[i] = colour; });
  const fontPx = () => +(/(\d+(?:\.\d+)?)px/.exec(st.font)?.[1] || 10);
  const arcPts = (cx, cy, rx, ry, a0 = 0, a1 = Math.PI * 2) => { const n = 48, out = []; for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; out.push(tp(cx + rx * Math.cos(a), cy + ry * Math.sin(a))); } return out; };
  const g = {
    get fillStyle() { return st.fillStyle; }, set fillStyle(v) { st.fillStyle = v; },
    get strokeStyle() { return st.strokeStyle; }, set strokeStyle(v) { st.strokeStyle = v; },
    get lineWidth() { return st.lineWidth; }, set lineWidth(v) { st.lineWidth = v; },
    get font() { return st.font; }, set font(v) { st.font = v; },
    lineCap: 'butt', lineJoin: 'miter', textBaseline: 'alphabetic', textAlign: 'start',
    save() { stack.push({ T: T.slice(), clips: clips.slice(), st: { ...st } }); },
    restore() { const s = stack.pop(); if (s) { T = s.T; clips = s.clips; st = s.st; } },
    translate(x, y) { T = [T[0], T[1], T[2], T[3], T[0] * x + T[2] * y + T[4], T[1] * x + T[3] * y + T[5]]; },
    scale(a, b) { T = [T[0] * a, T[1] * a, T[2] * b, T[3] * b, T[4], T[5]]; },
    beginPath() { subs = []; cur = null; },
    moveTo(x, y) { cur = [tp(x, y)]; subs.push(cur); },
    lineTo(x, y) { if (!cur) return g.moveTo(x, y); cur.push(tp(x, y)); },
    quadraticCurveTo(cx, cy, x, y) { g.lineTo(cx, cy); g.lineTo(x, y); },
    closePath() { if (cur && cur.length) cur.push(cur[0]); },
    rect(x, y, w, h) { g.moveTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.closePath(); },
    arc(cx, cy, r, a0, a1) { cur = arcPts(cx, cy, r, r, a0, Math.min(a1, a0 + Math.PI * 2)); subs.push(cur); },
    ellipse(cx, cy, rx, ry, rot, a0, a1) { cur = arcPts(cx, cy, rx, ry, a0, a1); subs.push(cur); },
    clip() { clips.push(subs.map((s) => s.slice())); },
    fill() { const polys = subs.map((s) => s.slice()); paint((p) => inside(polys, p), st.fillStyle); },
    stroke() { const polys = subs.map((s) => s.slice()), r = st.lineWidth / 2; paint((p) => polys.some((q) => q.some((a, i) => i && segDist(p, q[i - 1], a) <= r)), st.strokeStyle); },
    fillRect(x, y, w, h) { const q = [tp(x, y), tp(x + w, y), tp(x + w, y + h), tp(x, y + h)]; paint((p) => inside([q], p), st.fillStyle); },
    strokeRect() {},
    clearRect(x, y, w, h) { const q = [tp(x, y), tp(x + w, y), tp(x + w, y + h), tp(x, y + h)]; points.forEach((p, i) => { if (inside([q], p)) col[i] = 'transparent'; }); },
    measureText(s) { return { width: [...String(s)].length * fontPx() * 0.9 }; },
    fillText(s, x, y) { const w = g.measureText(s).width, h = fontPx(); const q = [tp(x - w / 2, y - h / 2), tp(x + w / 2, y - h / 2), tp(x + w / 2, y + h / 2), tp(x - w / 2, y + h / 2)]; paint((p) => inside([q], p), st.fillStyle); },
    strokeText(s, x, y) { const w = g.measureText(s).width, h = fontPx(); const q = [tp(x - w / 2, y - h / 2), tp(x + w / 2, y - h / 2), tp(x + w / 2, y + h / 2), tp(x - w / 2, y + h / 2)]; paint((p) => inside([q], p), st.strokeStyle); },
  };
  return { g, col };
}
function sample(plan, pts) {
  const { g, col } = probeContext(pts);
  paintAtlas(g, plan, { profile: PROFILE });
  return col;
}
const PLANS = { fallback: fallbackPlan(), nendo: cleanNendo(NENDO) };
const WHITE = COLORS.white.toLowerCase();

describe('the transom (shofukumaru04): white, lettered, in both liveries', () => {
  test('the quarter knuckle: where the rounded stern half-breadth falls to 2.6 m, forward of the stern line', () => {
    for (const h of [0.5, 1, 2, 3, 4, 5, 6, 7]) {
      const k = knuckleS(h);
      expect(halfBreadth(k, h)).toBeCloseTo(2.6, 2);
      expect(k).toBeLessThan(sternS(h)); expect(sternS(h) - k).toBeLessThan(1.2);
    }
    expect(knuckleS(4)).toBeGreaterThan(57.3); expect(knuckleS(4)).toBeLessThan(58.0);
  });
  for (const mode of ['fallback', 'nendo']) {
    test(`${mode}: the atlas texel at the transom centreline (s 58.4, h 2-4) is white on both side bands`, () => {
      const pts = [], where = [];
      for (const side of ['port', 'starboard']) for (const h of [2, 2.5, 3, 3.5, 4]) { pts.push(sidePx(side, 58.4, h)); where.push(`${side} h ${h}`); }
      const col = sample(PLANS[mode], pts);
      col.forEach((c, i) => expect(`${where[i]}: ${String(c).toLowerCase()}`).toBe(`${where[i]}: ${WHITE}`));
    });
  }
  test('nendo: the stern triangles still reach the quarter (black just forward of the knuckle on both sides)', () => {
    // port: the big stern triangle (05); starboard: the stern quarter triangle (03, WCPFC)
    const pts = [sidePx('port', knuckleS(0.5) - 0.3, 0.5), sidePx('starboard', knuckleS(2.5) - 0.3, 2.5)];
    const col = sample(PLANS.nendo, pts);
    expect(col).toEqual([COLORS.black, COLORS.black]);
  });
  test('nendo: nothing is snapped to the stern any more (no shape corner at s 59)', () => {
    for (const side of ['port', 'starboard']) for (const sh of PLANS.nendo[side].shapes) for (const [s] of sh.pts) expect(s).toBeLessThan(ATLAS.S1);
  });
  test('the stern cell holds 第一昭福丸, KESENNUMA and SHOFUKU MARU No.1, centred, on a transparent background', () => {
    const c = stubCanvas(ATLAS.W, ATLAS.H); paintAtlas(c.getContext('2d'), PLANS.fallback, { profile: PROFILE });
    const [x, y, w, h] = ATLAS.cells.stern;
    const texts = c.ops.filter((o) => o[0] === 'fillText');
    const inCell = texts.filter((o) => { const i = c.ops.indexOf(o); const tr = c.ops.slice(0, i).reverse().find((q) => q[0] === 'translate'); return tr && tr[1] >= x && tr[1] <= x + w && tr[2] >= y && tr[2] <= y + h; });
    expect(inCell.map((o) => o[1]).join('')).toBe(NAME.ja + NAME.portEn + NAME.en);
    expect(c.ops.some((o) => o[0] === 'clearRect' && o[1] === x && o[2] === y && o[3] === w && o[4] === h)).toBe(true);
    expect(NAME.portEn).toBe('KESENNUMA');
  });
  test('the stern cell lettering really paints (probe): ink in each line band, the cell corner clear', () => {
    const [x, y, w, h] = ATLAS.cells.stern;
    const bands = transomBands();
    expect(bands.map((b) => b.key)).toEqual(['ja', 'portEn', 'en']);
    expect(bands[0].v1).toBe(1); expect(bands[2].v0).toBeCloseTo(0, 9);
    for (let i = 1; i < bands.length; i++) expect(bands[i].v1).toBeCloseTo(bands[i - 1].v0, 9);
    const pts = bands.map((b) => [x + w / 2, y + (1 - (b.v0 + b.v1) / 2) * h]).concat([[x + 1, y + 1]]);
    const col = sample(PLANS.fallback, pts);
    expect(col.slice(0, 3)).toEqual([COLORS.text, COLORS.text, COLORS.text]);
    expect(col[3]).toBe('transparent');
  });
  for (const tier of ['high', 'phone']) test(`${tier}: the transom decal lies on the shell, faces aft and maps into the stern cell`, () => {
    const g = transomDecalGeometry(tier), P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    const [cx, cy, cw, ch] = ATLAS.cells.stern;
    const u0 = cx / ATLAS.W, u1 = (cx + cw) / ATLAS.W, v1 = 1 - cy / ATLAS.H, v0 = 1 - (cy + ch) / ATLAS.H;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), s = zOf(z);
      expect(Math.abs(x)).toBeLessThanOrEqual(NAME.transom.w / 2 + 1e-6);
      expect(halfBreadth(knuckleS(y), y)).toBeGreaterThan(Math.abs(x));      // inside the knuckle: on the transom
      expect(s).toBeGreaterThan(knuckleS(y) - 0.05); expect(s).toBeLessThan(sternS(y) + 0.1);
      expect(N.getZ(i)).toBeLessThan(-0.5);                                  // faces aft (-z)
      expect(U.getX(i)).toBeGreaterThanOrEqual(u0 - 1e-6); expect(U.getX(i)).toBeLessThanOrEqual(u1 + 1e-6);
      expect(U.getY(i)).toBeGreaterThanOrEqual(v0 - 1e-6); expect(U.getY(i)).toBeLessThanOrEqual(v1 + 1e-6);
    }
    // read from aft (port on the left): the u = 0 edge is on the port side (+x)
    let iMin = 0; for (let i = 0; i < U.count; i++) if (U.getX(i) < U.getX(iMin)) iMin = i;
    expect(P.getX(iMin)).toBeGreaterThan(0);
    g.dispose();
  });
  test('both liveries build the transom decal with the decal material', async () => {
    for (const livery of ['fallback', 'nendo']) {
      const S = buildShofukumaru({ shared: { uTime: { value: 0 }, uNight: { value: 0 } } }, { tier: 'phone', livery, liveryData: NENDO });
      await S.ready;
      let found = false;
      S.group.traverse((o) => { if (!o.isMesh || !o.material?.alphaTest) return; const p = o.geometry.attributes.position; for (let i = 0; i < p.count; i++) if (p.getZ(i) < zOf(57.5) && p.getY(i) > 1 && p.getY(i) < 4) { found = true; break; } });
      expect(found).toBe(true);
      S.dispose();
    }
  });
});

describe('starboard aft sheer triangle (fix round 2): the real ship, WCPFC photo', () => {
  const plan = PLANS.nendo.starboard;
  const tri = plan.shapes.find((q) => q.tag === 'aft-sheer-triangle');
  test('measured mark: top on the sheer, apex at about 63 % of the side below it, painted over the circle', () => {
    expect(tri).toBeTruthy(); expect(tri.over).toBe(true); expect(tri.colour).toBe('black');
    const top = tri.pts.filter((p) => p[1] >= SHIP.aftShelter.roof), apex = tri.pts.reduce((a, p) => (p[1] < a[1] ? p : a));
    expect(top.length).toBe(2);
    const wTop = Math.abs(top[0][0] - top[1][0]);
    expect(wTop).toBeGreaterThan(2.6);                                       // the 03 sliver was 2.3 m wide
    expect((sheerAt(apex[0]) - apex[1]) / sheerAt(apex[0])).toBeGreaterThan(0.55);
    expect(apex[1]).toBeGreaterThan(2.4); expect(apex[1]).toBeLessThan(3.2);  // the 03 trace stopped at h 5.3
    expect(apex[0]).toBeGreaterThan(Math.min(top[0][0], top[1][0])); expect(apex[0]).toBeLessThan(Math.max(top[0][0], top[1][0]));
  });
  test('size check against its port counterpart (s 48.4-52.6, h 3.2-7.1)', () => {
    const port = PLANS.nendo.port.shapes.find((q) => q.colour === 'black' && q.tag === 'traced' && q.pts.every((p) => p[0] > 47 && p[0] < 53.5) && q.pts.some((p) => p[1] > 6.5));
    expect(port).toBeTruthy();
    const area = (pts) => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a) / 2; };
    const tall = (pts) => Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1]));
    expect(area(tri.pts) / area(port.pts)).toBeGreaterThan(0.6);
    expect(tall(tri.pts)).toBeGreaterThan(0.9 * tall(port.pts));
  });
  test('the traced 03 fragment and its diagonal are gone; the diagonal runs from the apex to the circle foot', () => {
    for (const q of plan.shapes.filter((x) => x.tag === 'traced')) { const c = q.pts.reduce((a, p) => [a[0] + p[0] / q.pts.length, a[1] + p[1] / q.pts.length], [0, 0]); expect(c[0] > 52 && c[0] < 55.2 && c[1] > 3 && c[1] < 7.5).toBe(false); }
    const apex = tri.pts.reduce((a, p) => (p[1] < a[1] ? p : a));
    expect(plan.lines.some(({ l }) => l[0] === apex[0] && l[1] === apex[1] && l[3] < 0)).toBe(true);
    expect(plan.lines.some(({ l }) => Math.abs(l[0] - 54.758) < 1e-3)).toBe(false);
  });
  test('it is visible in the painted atlas: black at mid-height inside it, even where the circle disc lies', () => {
    const apex = tri.pts.reduce((a, p) => (p[1] < a[1] ? p : a)), top = tri.pts.filter((p) => p !== apex);
    const c = [(apex[0] + top[0][0] + top[1][0]) / 3, (apex[1] + top[0][1] + top[1][1]) / 3];
    const circ = plan.circles[0];
    expect(Math.hypot(c[0] - circ.c[0], c[1] - circ.c[1])).toBeLessThan(circ.r + 0.6);   // near or on the disc
    const col = sample(PLANS.nendo, [sidePx('starboard', c[0], c[1]), sidePx('starboard', apex[0], apex[1] + 0.6)]);
    expect(col).toEqual([COLORS.black, COLORS.black]);
  });
});

