// [mobile-perf] The phone budget gate: the phone tier (390 x 844 @3, touch, iPhone UA) measured at start and after a scripted session, and
// a non-zero exit when a budget is broken. Deploy #5 crashed iPhones ("A problem repeatedly occurred") at ~1.1 GB; these budgets keep the
// tab well under that on a 4 GB phone.
//
//   tools/anime/gate.sh chrome --fg env -u NODE_OPTIONS bun tools/anime/phone-budget.mjs [--port 9530] [--nobuild] [--url https://.../]
//       [--params "k=v&..."] [--settle 15] [--roam 180] [--out report.json] [--label name]
//
// Budgets (the conductor's brief, 2026-10-08), at start (15 s after 「まちへ出る」) and after --roam seconds of a scripted session (walk the
// promenade, fly across the town, open あそぶ, start and leave two modes, then back):
//   JS heap after GC <= 260 MB   GPU buffers (geometry) <= 280 MB   textures (incl. render targets) <= 200 MB   programs at start <= 140
//   growth from start to the end of the session <= +10 % (heap, geometry, textures)
// GPU figures come from the WebGL calls themselves (tools/anime/phone-census.js): every buffer once, BatchedMesh capacity included.
// --roam 0 measures the start only. The report also has a timeline (render scale, fps, stream work, programs every 0.5 s from 'loaded'
// to the start census: how fast the first frames settle) and the cache keys of every program (--keys out.json).
import { join } from 'node:path';
import { writeFileSync, mkdirSync, createWriteStream } from 'node:fs';
import { build, serve, launch, ROOT } from './cdp.mjs';
import { INSTRUMENT, CENSUS, PROGRAM_KEYS, BUDGET } from './phone-census.js';

const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : '1') : d; };
const port = Number(arg('port', 9530));
const settle = Number(arg('settle', 15));
const roamS = Number(arg('roam', 180));
const label = arg('label', '');
const log = (...a) => console.error(`[phone-budget ${label}]`, ...a);
let base = arg('url'), srv = null;
if (!base) {
  const dist = join(ROOT, `dist/anime-${port}`);
  if (arg('nobuild') !== '1') log(JSON.stringify(await build({ outdir: dist, quiet: true })));
  srv = serve({ port, dist });
  base = srv.url;
}
const qs = new URLSearchParams();
for (const kv of (arg('params') || '').split('&').filter(Boolean)) { const [k, v = ''] = kv.split('='); qs.set(k, v); }
const url = base + (base.endsWith('/') ? '' : '/') + 'index.html' + (qs.toString() ? '?' + qs : '');

const b = await launch({ args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'] });
const p = await b.page({ width: 390, height: 844, dpr: 3 });
await p.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true, screenWidth: 390, screenHeight: 844 });
await p.S('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await p.S('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', platform: 'iPhone' });
await p.S('Page.addScriptToEvaluateOnNewDocument', { source: INSTRUMENT });
let crashed = false;
b.on('Inspector.targetCrashed', () => { crashed = true; });
await p.S('Inspector.enable').catch(() => {});

const t0 = Date.now();
const sec = () => Math.round((Date.now() - t0) / 100) / 10;
// ---- [mobile-perf] the processes' footprint (what iOS jetsam counts, macOS `footprint`): the page's renderer (WebKit's WebContent) and the
// GPU process, every 0.5 s from navigation to the end. The load's peak is what crashed iPhones (conductor's simulator run, 2026-10-08).
const profile = join(ROOT, 'dist/.chrome-' + process.pid);
const procs = () => {
  const out = Bun.spawnSync(['ps', '-A', '-o', 'pid=,ppid=,command=']).stdout.toString().split('\n');
  const rows = out.map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean).map((m) => ({ pid: +m[1], ppid: +m[2], cmd: m[3] }));
  const browser = rows.find((r) => r.cmd.includes('--user-data-dir=' + profile) && !r.cmd.includes('--type='));
  if (!browser) return { renderers: [], gpu: [] };
  const kids = rows.filter((r) => r.ppid === browser.pid);
  return { renderers: kids.filter((r) => r.cmd.includes('--type=renderer')).map((r) => r.pid), gpu: kids.filter((r) => r.cmd.includes('--type=gpu-process')).map((r) => r.pid) };
};
const fp = (pids) => {
  if (!pids.length) return {};
  const args = []; for (const id of pids) args.push('-p', String(id));
  const txt = Bun.spawnSync(['footprint', ...args]).stdout.toString();
  const o = {}; for (const m of txt.matchAll(/\[(\d+)\]: [^\n]*?Footprint: ([\d.]+) (KB|MB|GB)/g)) o[m[1]] = +m[2] * (m[3] === 'GB' ? 1024 : m[3] === 'KB' ? 1 / 1024 : 1);
  return o;
};
const memline = [];
let memOn = true, phase = 'load';
const memSampler = (async () => {
  let P = null, seen = 0;
  while (memOn) {
    try {
      if (!P || seen++ % 10 === 0) P = procs();
      const f = fp([...P.renderers, ...P.gpu]);
      const r = Math.max(0, ...P.renderers.map((id) => f[id] || 0)), g = Math.max(0, ...P.gpu.map((id) => f[id] || 0));
      if (r || g) memline.push({ t: sec(), phase, renderer: Math.round(r), gpu: Math.round(g) });
    } catch { /* a process came or went */ }
    await Bun.sleep(500);
  }
})();
const memStats = () => {
  const by = (ph) => memline.filter((m) => m.phase === ph);
  const peak = (arr, k) => (arr.length ? Math.max(...arr.map((m) => m[k])) : null);
  const last = (arr, k) => (arr.length ? arr[arr.length - 1][k] : null);
  return { loadPeak: { renderer: peak(by('load'), 'renderer'), gpu: peak(by('load'), 'gpu') }, titlePeak: { renderer: peak(by('title'), 'renderer'), gpu: peak(by('title'), 'gpu') },
    start: { renderer: last(by('start'), 'renderer'), gpu: last(by('start'), 'gpu') }, sessionPeak: { renderer: peak(by('session'), 'renderer'), gpu: peak(by('session'), 'gpu') }, end: { renderer: last(memline, 'renderer'), gpu: last(memline, 'gpu') } };
};
await p.goto(url);
// ---- the timeline: every 0.5 s from navigation until the start census (the first frames: render scale, fps, stream work, programs)
const timeline = [];
let sampling = true;
const sampler = (async () => {
  while (sampling) {
    try {
      const s = await p.eval(`(() => { const S = window.__stats || {}, st = window.__ctx?.services?.explore?.stream?.summary?.(), C = window.__glc;
        return { loaded: document.body.classList.contains('loaded'), playing: document.body.classList.contains('playing'), live: document.body.classList.contains('klc-live'), scale: S.renderScale ?? null, fps: S.fps ? Math.round(S.fps) : null,
          busy: st ? st.busy : null, pending: st ? st.pending : null, l0: st ? st.l0 : null, l1: st ? st.l1 : null, sv: st ? st.batch?.verts : null, scap: st ? st.batch?.capacity : null, programs: C ? C.prog.size : null, gpuMB: C ? Math.round((C.bufBytes + C.texBytes + C.rbBytes) / 1e6) : null }; })()`);
      timeline.push({ t: sec(), ...s });
    } catch { /* navigating */ }
    await Bun.sleep(500);
  }
})();
await p.waitFor(`document.body.classList.contains('loaded')`, { timeout: 300000 });
const loadedS = sec(); phase = 'title';
const atLoaded = await p.eval(`({ programs: window.__glc?.prog.size ?? null, gpuMB: window.__glc ? Math.round((window.__glc.bufBytes + window.__glc.texBytes + window.__glc.rbBytes) / 1e6) : null, finish: window.__stats?.finish, warmMs: window.__stats?.warmMs })`);
log(`loaded at ${loadedS} s`, JSON.stringify(atLoaded));
await Bun.sleep(1500);   // a visitor reads the title for a moment
await p.eval(`(() => { const go = document.getElementById('go'); if (go && !go.disabled) go.click(); else if (window.__titleArrive) window.__titleArrive(); return true; })()`);
const goS = sec(); phase = 'start';
await Bun.sleep(settle * 1000);
const start = await p.eval(CENSUS);
log('start', JSON.stringify({ heap: start.heapMB, gl: start.gl, programs: start.programs }));

// ---- the session
const steps = [];
async function session(seconds) {
  const tS = Date.now(), left = () => seconds * 1000 - (Date.now() - tS);
  const step = async (name, fn) => { const s0 = Date.now(); let r = null; try { r = await fn(); } catch (e) { r = { error: String(e.message || e).slice(0, 200) }; } steps.push({ name, at: Math.round((s0 - tS) / 1000), ms: Date.now() - s0, r }); log(name, JSON.stringify(r)?.slice(0, 200)); };
  // A path of poses, one every 100 ms (the frame loop streams and draws between them). walk: [x, z, yaw] on the ground; fly: pos / look pairs.
  const walk = (pts, speed, ms) => p.eval(`(async () => {
    const pts = ${JSON.stringify(pts)}, ctx = window.__ctx, pl = ctx.playerObj; pl.fly = false;
    const seg = []; let total = 0; for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); total += d; }
    const T = Math.min(${ms}, total / ${speed} * 1000), t0 = performance.now();
    while (performance.now() - t0 < T) {
      let s = (performance.now() - t0) / T * total, i = 0; while (i < seg.length - 1 && s > seg[i]) { s -= seg[i]; i++; }
      const k = seg[i] ? Math.min(1, s / seg[i]) : 1, a = pts[i], b = pts[i + 1];
      const x = a[0] + (b[0] - a[0]) * k, z = a[1] + (b[1] - a[1]) * k, yaw = Math.atan2(-(b[0] - a[0]), -(b[1] - a[1])) * 180 / Math.PI;
      window.__setCam(x, null, z, yaw, -4);
      await new Promise((r) => setTimeout(r, 100));
    }
    return { metres: Math.round(total), ms: Math.round(performance.now() - t0) };
  })()`);
  const fly = (poses, ms) => p.eval(`(async () => {
    const P = ${JSON.stringify(poses)}, t0 = performance.now(), T = ${ms}; window.__ctx.playerObj.fly = true;
    while (performance.now() - t0 < T) {
      const u = (performance.now() - t0) / T * (P.length - 1), i = Math.min(P.length - 2, Math.floor(u)), k = u - i, a = P[i], b = P[i + 1];
      const L = (x, y) => x.map((v, j) => v + (y[j] - v) * k);
      window.__lookAt(L(a.pos, b.pos), L(a.look, b.look));
      await new Promise((r) => setTimeout(r, 100));
    }
    return { poses: P.length, ms: Math.round(performance.now() - t0) };
  })()`);
  const stops = await p.eval(`(() => { const T = window.__ctx.services.life?.tour?.stops || window.__L.TOUR || []; return T.map((s) => ({ id: s.id, walk: s.walk ? [s.walk.x, s.walk.z] : null, drone: s.drone ? { pos: s.drone.pos, look: s.drone.look } : null })); })()`);
  const H = await p.eval(`(() => { const w = window.__L.HERO.walk; return [w.x, w.z]; })()`);
  const walks = stops.filter((s) => s.walk).map((s) => s.walk);
  const drones = stops.filter((s) => s.drone).map((s) => s.drone);
  // 1. walk the promenade and the streets behind it (the nearest walk spots, in order of distance from the promenade)
  const near = walks.slice().sort((a, b) => Math.hypot(a[0] - H[0], a[1] - H[1]) - Math.hypot(b[0] - H[0], b[1] - H[1])).slice(0, 3);
  await step('walk', () => walk([H, ...near], 7, Math.min(32000, left() * 0.18)));
  // 2. fly across the town (every tour stop's drone view, then back over the bay)
  await step('fly', () => fly(drones.slice(0, 7).concat(drones.slice(0, 1)), Math.min(45000, left() * 0.3)));
  // 3. あそぶ: open the hub, start a mode from its card, play it a while, leave; twice
  for (const [id, leave] of [['underwater', 'window.__swim?.exit?.()'], ['ippon', 'window.__ippon?.leave?.()']]) {
    await step('hub+' + id, () => p.eval(`(async () => {
      const w = (ms) => new Promise((r) => setTimeout(r, ms));
      const btn = document.querySelector('#klc-play [data-act="play"]'); if (!btn || btn.hidden) return { error: 'no あそぶ button' };
      btn.click(); await w(900);
      const go = document.querySelector('#klc-play [data-go="${id}"]'); if (!go) return { error: 'no card ${id}', cards: [...document.querySelectorAll('#klc-play [data-go]')].map((n) => n.dataset.go) };
      const p0 = window.__glc?.prog.size; const t0 = performance.now(); go.click();
      await w(2400);   // the wipe (~0.4 s) and the title card (~1.2 s), then the mode's start
      return { programsBefore: p0, programsAfter: window.__glc?.prog.size, ms: Math.round(performance.now() - t0) };
    })()`));
    await Bun.sleep(Math.min(18000, Math.max(4000, left() * 0.12)));
    await step('leave+' + id, () => p.eval(`(async () => { try { ${leave}; } catch (e) { return { error: String(e) }; } await new Promise((r) => setTimeout(r, 1500)); return { programs: window.__glc?.prog.size }; })()`));
  }
  // 4. back to the promenade, on foot, and stay till the end
  await step('back', () => walk([near[near.length - 1] || H, ...near.slice(0, -1).reverse(), H], 7, Math.max(1000, Math.min(25000, left() - 2000))));
  if (left() > 0) await Bun.sleep(left());
}
let after = null;
if (roamS > 0 && !crashed) {
  phase = 'session';
  try { await session(roamS); } catch (e) { log('session error', e.message); }
  after = crashed ? null : await p.eval(CENSUS).catch((e) => ({ error: String(e.message || e) }));
  log('after', JSON.stringify({ heap: after?.heapMB, gl: after?.gl, programs: after?.programs }));
}
memOn = false; await memSampler;   // (before the snapshot and the key dump: they are the tool's own allocations)
sampling = false; await sampler;   // (the timeline runs through the session too: the stream's live and allocated vertices)
// --snapshot out.heapsnapshot: the heap at the end (after the session; summarise with tools/anime/heapsnap.mjs)
if (arg('snapshot') && !crashed) {
  try {
    const ws = createWriteStream(arg('snapshot'));
    b.on('HeapProfiler.addHeapSnapshotChunk', (pr) => ws.write(pr.chunk));
    await p.S('HeapProfiler.enable');
    await p.S('HeapProfiler.collectGarbage');
    await p.S('HeapProfiler.takeHeapSnapshot', { reportProgress: false, captureNumericValue: false });
    await new Promise((r) => ws.end(r));
  } catch (e) { log('snapshot', e.message); }
}
if (arg('keys')) { try { const keys = await p.eval(PROGRAM_KEYS); mkdirSync(join(arg('keys'), '..'), { recursive: true }); writeFileSync(arg('keys'), JSON.stringify(keys, null, 1)); } catch (e) { log('keys', e.message); } }

const mem = memStats();
log('footprint MB', JSON.stringify(mem));
// ---- the verdict
const fails = [];
const check = (what, v, max) => { if (v === null || v === undefined || !Number.isFinite(v)) { fails.push(`${what}: not measured`); return; } if (v > max) fails.push(`${what} ${v} > ${max}`); };
const pick = (c) => (c && c.gl ? { heapMB: c.heapMB, geoMB: c.gl.bufMB, texMB: c.gl.texMB + c.gl.rbMB, programs: c.programs } : null);
const s = pick(start), a = pick(after);
if (crashed) fails.push('the page crashed');
if (s) { check('start heap MB', s.heapMB, BUDGET.heapMB); check('start geometry MB', s.geoMB, BUDGET.geoMB); check('start textures MB', s.texMB, BUDGET.texMB); check('start programs', s.programs, BUDGET.programsStart); }
else fails.push('no start census');
if (roamS > 0) {
  if (!a) fails.push('no census after the session');
  else {
    check('after heap MB', a.heapMB, BUDGET.heapMB); check('after geometry MB', a.geoMB, BUDGET.geoMB); check('after textures MB', a.texMB, BUDGET.texMB);
    for (const k of ['heapMB', 'geoMB', 'texMB']) { const g = s[k] > 0 ? a[k] / s[k] - 1 : 0; if (g > BUDGET.growth) fails.push(`growth ${k} ${Math.round(g * 100)} % > ${BUDGET.growth * 100} % (${s[k]} -> ${a[k]})`); }
  }
}
const report = { label, url, budget: BUDGET, ok: fails.length === 0, fails, loadedS, goS, atLoaded, start, after, summary: { start: s, after: a }, footprint: mem, steps, timeline, memline, pageErrors: p.errors().slice(0, 8) };
if (arg('out')) { mkdirSync(join(arg('out'), '..'), { recursive: true }); writeFileSync(arg('out'), JSON.stringify(report, null, 1)); }
console.log(JSON.stringify({ label, ok: report.ok, fails, start: s, after: a, footprint: mem, loadedS }, null, 1));
await b.close();
srv?.stop();
process.exit(report.ok ? 0 : 1);
