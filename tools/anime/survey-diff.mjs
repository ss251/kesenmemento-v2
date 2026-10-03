// [v6:survey] Diff the app against the photo survey, feature by feature, in metres.
//
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/survey-diff.mjs --area minami --port 8901 [--nobuild]
//   env -u NODE_OPTIONS bun tools/anime/survey-diff.mjs --area minami --app data/survey/minami/app-features.json   (no Chrome)
//
// The survey: data/survey/<area>/features.json ({ features: [{ name, enu: [x, y, z], sigma: [sx, sy, sz] | s, ... }] },
// written by tools/survey/features.py from triangulated photo picks). The app: window.__features(area), the positions
// the area modules register while they build (src/anime/core/features.js; names as in docs/anime/survey/<area>.md).
// Writes data/survey/<area>/app-features.json (the app's positions) and data/survey/<area>/diff.json (per feature: the
// survey and app positions, the delta, its horizontal / vertical / 3D size and the delta in survey sigmas), and prints a
// table sorted by error. Features the app does not export yet are listed as `missing`.
import { join, resolve } from 'node:path';
import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { build, serve, launch, ROOT } from './cdp.mjs';

const args = {};
for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) { const k = a.slice(2); const v = process.argv[i + 1] !== undefined && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : '1'; args[k] = v; } }
const AREA = args.area || 'minami';
const DIR = join(ROOT, 'data/survey', AREA);

/** The app's feature positions: from a JSON file, or by loading the app headless. */
export async function appFeatures({ area = AREA, port = Number(args.port || 8901), nobuild = !!args.nobuild } = {}) {
  if ([8787, 8790, 8791].includes(port)) throw new Error('port reserved');
  const dist = join(ROOT, `dist/anime-${port}`);
  if (!nobuild || !existsSync(join(dist, 'index.html'))) { const r = await build({ outdir: dist }); console.error(`build ${r.reused ? 'FAILED (reused the last good build)' : 'ok'} ${r.ms ?? ''} ms`); }
  const srv = serve({ port, dist });
  let browser;
  try {
    browser = await launch({ quiet: true });
    const page = await browser.page({ width: 320, height: 240 });
    await page.goto(`${srv.url}index.html?shot=1&w=320&h=240&t=0&q=low`);
    await page.waitFor('window.__ready === true', { timeout: 280000 });
    return { features: await page.eval(`window.__features(${JSON.stringify(area)})`), dims: await page.eval(`window.__featureDims ? window.__featureDims(${JSON.stringify(area)}) : {}`) };
  } finally { await browser?.close(); srv.stop(); }
}

/** Cheapest assignment of survey points to app points (exact for <= 8, greedy beyond): Map survey index -> app index. */
export function assign(S, A) {
  const d = (i, j) => Math.hypot(S[i][0] - A[j][0], S[i][1] - A[j][1], S[i][2] - A[j][2]);
  const out = new Map();
  if (S.length <= 8 && A.length <= 8) {
    let best = null;
    const used = new Array(A.length).fill(false), cur = [];
    const rec = (i, cost) => {
      if (best && cost >= best.cost) return;
      if (i === S.length) { best = { cost, pick: cur.slice() }; return; }
      let any = false;
      for (let j = 0; j < A.length; j++) if (!used[j]) { any = true; used[j] = true; cur.push(j); rec(i + 1, cost + d(i, j)); cur.pop(); used[j] = false; }
      if (!any || S.length > A.length) { cur.push(-1); rec(i + 1, cost + 50); cur.pop(); }
    };
    rec(0, 0);
    best.pick.forEach((j, i) => { if (j >= 0) out.set(i, j); });
    return out;
  }
  const pairs = [];
  for (let i = 0; i < S.length; i++) for (let j = 0; j < A.length; j++) pairs.push([d(i, j), i, j]);
  pairs.sort((p, q) => p[0] - q[0]);
  const us = new Set(), ua = new Set();
  for (const [, i, j] of pairs) if (!us.has(i) && !ua.has(j)) { out.set(i, j); us.add(i); ua.add(j); }
  return out;
}

/** Resolve `name#k` groups: survey name -> the app point matched to it (by assign), plus the app group sizes. */
export function matchGroups(survey, app) {
  const gname = (n) => (n.includes('#') ? n.slice(0, n.lastIndexOf('#')) : null);
  const S = new Map(), Ag = new Map();
  for (const f of survey) { const g = gname(f.name); if (g) { if (!S.has(g)) S.set(g, []); S.get(g).push(f); } }
  for (const [n, p] of Object.entries(app)) { const g = gname(n); if (g) { if (!Ag.has(g)) Ag.set(g, []); Ag.get(g).push(p); } }
  const resolved = {}, counts = {};
  for (const [g, fs] of S) {
    const A = Ag.get(g) || [];
    counts[g] = { survey: fs.length, app: A.length };
    const m = assign(fs.map((f) => f.enu), A);
    fs.forEach((f, i) => { if (m.has(i)) resolved[f.name] = A[m.get(i)]; });
  }
  return { resolved, counts };
}

/** Compare survey features with app features. Returns rows sorted by 3D error (missing last). */
export function diffFeatures(survey, app) {
  const rows = [];
  const { resolved } = matchGroups(survey, app);
  for (const f of survey) {
    const a = f.name.includes('#') ? resolved[f.name] : app[f.name];
    const sg = Array.isArray(f.sigma) ? f.sigma : [f.sigma ?? 0.1, f.sigma ?? 0.1, f.sigma ?? 0.1];
    if (!a) { rows.push({ name: f.name, survey: f.enu, app: null, missing: true }); continue; }
    const d = [a[0] - f.enu[0], a[1] - f.enu[1], a[2] - f.enu[2]];
    const h = Math.hypot(d[0], d[2]), e3 = Math.hypot(...d);
    const sh = Math.hypot(sg[0], sg[2]) / Math.SQRT2;
    rows.push({ name: f.name, survey: f.enu, app: a, d: d.map((v) => +v.toFixed(3)), horiz: +h.toFixed(3), vert: +d[1].toFixed(3), err: +e3.toFixed(3),
      sigma: sg, nsig: +(Math.hypot(d[0] / sg[0], d[1] / sg[1], d[2] / sg[2]) / Math.sqrt(3)).toFixed(2), sh: +sh.toFixed(3) });
  }
  return rows.sort((p, q) => (p.missing ? 1e9 : p.err) - (q.missing ? 1e9 : q.err));
}

export function summarize(rows) {
  const ok = rows.filter((r) => !r.missing), e = ok.map((r) => r.err).sort((a, b) => a - b), h = ok.map((r) => r.horiz).sort((a, b) => a - b);
  const pct = (a, p) => a.length ? a[Math.min(a.length - 1, Math.floor(p * (a.length - 1) + 0.5))] : null;
  const mean = (a) => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
  return { features: rows.length, compared: ok.length, missing: rows.length - ok.length, err3d: { mean: +mean(e)?.toFixed(3), median: pct(e, 0.5), p90: pct(e, 0.9), max: e.at(-1) ?? null },
    horiz: { mean: +mean(h)?.toFixed(3), median: pct(h, 0.5), p90: pct(h, 0.9) }, vertAbsMean: +mean(ok.map((r) => Math.abs(r.vert)))?.toFixed(3), over1m: ok.filter((r) => r.err > 1).length, over3sigma: ok.filter((r) => r.nsig > 3).length };
}

if (import.meta.main) {
  const sp = join(DIR, 'features.json');
  if (!existsSync(sp)) throw new Error('no survey at ' + sp);
  const survey = JSON.parse(readFileSync(sp, 'utf8')).features;
  const sdoc = JSON.parse(readFileSync(sp, 'utf8'));
  const got = args.app ? JSON.parse(readFileSync(resolve(ROOT, args.app), 'utf8')) : await appFeatures();
  const app = got.features, appDims = got.dims || {};
  mkdirSync(DIR, { recursive: true });
  if (!args.app) writeFileSync(join(DIR, 'app-features.json'), JSON.stringify({ note: 'window.__features(area) / __featureDims(area) from the built app (tools/anime/survey-diff.mjs)', area: AREA, generated: new Date().toISOString(), features: app, dims: appDims }, null, 1));
  const rows = diffFeatures(survey, app), sum = summarize(rows);
  const { counts } = matchGroups(survey, app);
  const dimRows = (sdoc.dims || []).map((d) => ({ name: d.name, survey: d.value, sigma: d.sigma ?? null, app: appDims[d.name] ?? null, delta: appDims[d.name] !== undefined ? +(appDims[d.name] - d.value).toFixed(3) : null }));
  for (const [g, c] of Object.entries(counts)) if (c.survey !== c.app) dimRows.push({ name: g + ' (count)', survey: c.survey, app: c.app, delta: c.app - c.survey, group: true });
  sum.dims = { compared: dimRows.filter((r) => r.delta !== null).length, off: dimRows.filter((r) => r.delta !== null && Math.abs(r.delta) > Math.max(0.05, 2 * (r.sigma || 0))).length };
  const out = args.out ? resolve(ROOT, args.out) : join(DIR, 'diff.json');
  writeFileSync(out, JSON.stringify({ area: AREA, label: args.label || null, generated: new Date().toISOString(), summary: sum, rows, dims: dimRows }, null, 1));
  const pad = (s, n) => String(s).padEnd(n), num = (v) => (v === null || v === undefined ? '' : (v >= 0 ? ' ' : '') + v.toFixed(2));
  console.log(pad('feature', 34) + pad('  dx', 8) + pad('  dy', 8) + pad('  dz', 8) + pad('  3D', 8) + '  sigma');
  for (const r of rows) console.log(pad(r.name, 34) + (r.missing ? '  missing in the app' : pad(num(r.d[0]), 8) + pad(num(r.d[1]), 8) + pad(num(r.d[2]), 8) + pad(num(r.err), 8) + '  ' + r.nsig));
  for (const r of dimRows) console.log(pad('= ' + r.name, 34) + `survey ${r.survey}  app ${r.app ?? 'missing'}${r.delta !== null ? '  delta ' + r.delta : ''}`);
  console.log(JSON.stringify(sum, null, 1));
}
