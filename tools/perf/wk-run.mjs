// [perf] The frame-pacing harness in WebKit (Safari's engine: a WKWebView in a nearly invisible window, tools/perf/wk/wks.swift), the same
// scenarios and the same in-page profiler (?perf=1) as tools/perf/run.mjs. No Chrome and no Chrome lock; WebKit's own processes run at the
// priority WebKit gives a visible page, so the gate's background policy does not reach them.
//
//   tools/anime/gate.sh run env -u NODE_OPTIONS bun tools/perf/wk-run.mjs --config desktop|phone [--scenarios walk,drive,drone,turn] [--secs 60]
//       [--pre 3] [--settle 8] [--port 9446] [--label baseline] [--params "k=v&..."] [--nobuild] [--real-raf]
//
// desktop = a 1600x900 window, the high tier; phone = a 390x844 window with ?q=phone (the phone tier: the same render size as an iPhone at
// DPR 3: the page's pixel ratio is set to 3, so the tier renders what an iPhone does). desktop keeps the screen's pixel ratio. WebKit has no GPU
// timer query, no long task timing and no JS heap reading: those columns are n/a.
// Frames: a window nobody sees gets WebKit's requestAnimationFrame at ~5 Hz (measured: 185 ms), so the session drives the page from a 16 ms
// timer, and each frame reads one pixel back after the composite: a frame's time is then its CPU and GPU work together (serialized, an upper
// bound of what a 60 Hz screen shows). --real-raf: WebKit's own requestAnimationFrame (for a window someone can see).
// Output: dist/perf/<label>/webkit-<config>/<scenario>.json, summary.json, summary.md.
import { join, dirname } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync, rmSync } from 'node:fs';
import { hostname } from 'node:os';
import { build, serve, ROOT } from '../anime/cdp.mjs';
import { open } from './wk/wkc.mjs';
import { summarize, mdRow, MD_HEAD } from './stats.mjs';

const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : '1') : d; };
const CONFIGS = { desktop: { w: 1600, h: 900, q: null, dsf: null }, phone: { w: 390, h: 844, q: 'phone', dsf: 3 } };
const configName = arg('config', 'desktop');
const C = CONFIGS[configName];
if (!C) throw new Error('unknown --config ' + configName);
const port = Number(arg('port', 9446));
const scenarios = arg('scenarios', 'walk,drive,drone,turn').split(',');
const secs = Number(arg('secs', 60)), pre = Number(arg('pre', 3)), settle = Number(arg('settle', 8));
const label = arg('label', 'run');
const OUT = join(arg('out', join(ROOT, 'dist/perf', label)), 'webkit-' + configName);
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.error(`[wk ${configName}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// the session binary, built from wks.swift when missing or older than its source
const SRC = join(ROOT, 'tools/perf/wk/wks.swift'), BIN = join(ROOT, 'dist/perf/wks');
if (!existsSync(BIN) || statSync(BIN).mtimeMs < statSync(SRC).mtimeMs) {
  mkdirSync(dirname(BIN), { recursive: true });
  const r = Bun.spawnSync(['swiftc', '-O', SRC, '-o', BIN]);
  if (r.exitCode !== 0) throw new Error('swiftc failed: ' + r.stderr.toString().slice(0, 2000));
  log('built', BIN);
}

let srv = null, wk = null, proc = null;
const workdir = join(ROOT, 'dist/perf/wk-session-' + process.pid);
try {
  const dist = join(ROOT, `dist/anime-${port}`);
  if (arg('nobuild') !== '1') log(JSON.stringify(await build({ outdir: dist })));
  srv = serve({ port, dist });
  const qs = new URLSearchParams({ perf: '1' });
  if (C.q) qs.set('q', C.q);
  for (const kv of (arg('params') || '').split('&').filter(Boolean)) { const [k, v = ''] = kv.split('='); qs.set(k, v); }
  const url = srv.url + 'index.html?' + qs;
  rmSync(workdir, { recursive: true, force: true });
  proc = Bun.spawn([BIN, url, workdir, String(C.w), String(C.h)], { env: { ...process.env, ...(arg('real-raf') === '1' ? { KLC_REAL_RAF: '1' } : {}), ...(C.dsf ? { KLC_DSF: String(C.dsf) } : {}) }, stdout: 'pipe', stderr: 'pipe' });
  wk = open(workdir);
  const t0 = Date.now();
  for (;;) {
    const v = await wk.eval("return JSON.stringify({ loaded: document.body.classList.contains('loaded'), errors: (window.__errors || []).length })", 30).catch(() => null);
    if (v && JSON.parse(v).loaded) break;
    if (Date.now() - t0 > 420000) throw new Error('not loaded after 420 s');
    await sleep(1000);
  }
  const loadMs = Date.now() - t0;
  log(`loaded in ${loadMs} ms: ${url}`);
  await wk.eval("const go = document.getElementById('go'); if (go && !go.disabled) go.click(); if (!document.body.classList.contains('playing')) document.body.classList.add('playing'); return 1");
  // a frame ends when the GPU has drawn it (a one-pixel read-back after the composite): the timer-driven frames then cost what the CPU and
  // the GPU take together (serialized: an upper bound; on a real screen they overlap)
  await wk.eval("const P = window.__ctx.pipeline, gl = window.__ctx.renderer.getContext(), px = new Uint8Array(4), r0 = P.render; P.render = function (...a) { const r = r0.apply(this, a); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return r; }; return 1");
  const env = JSON.parse(await wk.eval(`const r = window.__ctx.renderer, gl = r.getContext(), d = gl.getExtension('WEBGL_debug_renderer_info');
    return JSON.stringify({ gpu: d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : null, ua: navigator.userAgent, dpr: devicePixelRatio, tier: window.__ctx.quality.tier || window.__ctx.quality.name, pixelRatio: window.__ctx.quality.pixelRatio,
      canvas: [r.domElement.width, r.domElement.height], gpuTimer: !!window.__perf?.gpuTimer, realRaf: !!window.__klcRealRaf });`));
  env.wrapped = JSON.parse(await wk.eval(`const W = window.__perf, E = window.__explore, L = window.__life, ctx = window.__ctx; if (!W) return 'null';
    return JSON.stringify({ batching: W.wrap(E?.stream?.sb, 'flush', 'batching'), commit: W.wrap(E?.stream?.sb, 'add', 'stream:commit'), culling: W.wrap(E?.stream?.sb, 'cull', 'stream:cull'), labels: W.wrap(E?.labels, 'update', 'labels'),
      exploreUi: W.wrap(E?.ui, 'update', 'hud:explore-ui'), lifeHud: W.wrap(L?.hud, 'update', 'hud:life'), cast: W.wrap(L?.cast, 'update', 'life:cast'), tour: W.wrap(L?.tour, 'update', 'life:tour'),
      sound: W.wrap(L?.sound, 'update', 'life:sound'), season: W.wrap(L?.season, 'update', 'life:season'), shadow: W.wrap(ctx.renderer.shadowMap, 'render', 'render:shadow') });`));
  env.load = { ms: loadMs }; env.host = hostname(); env.engine = 'WebKit (WKWebView)';
  log(JSON.stringify(env));
  await sleep(settle * 1000);
  log('scenario driver:', await wk.eval('return eval(' + JSON.stringify(readFileSync(join(ROOT, 'tools/perf/scenarios.page.js'), 'utf8')) + ')'));
  const rows = [], summary = { config: 'webkit-' + configName, ...C, url, env, secs, pre, scenarios: {} };
  for (const name of scenarios) {
    await wk.eval(`window.__perfScn.setup(${JSON.stringify(name)}); return 1`);
    await sleep(pre * 1000);
    await wk.eval('window.__perf.start(); return 1');
    await sleep(secs * 1000);
    const rec = JSON.parse(await wk.eval('return JSON.stringify(window.__perf.stop())', 120));
    const did = JSON.parse(await wk.eval('return JSON.stringify(window.__perfScn.stop())'));
    const programs = await wk.eval('return window.__ctx.renderer.info.programs?.length ?? null');
    const s = summarize(rec);
    s.did = did; s.programs = programs;
    summary.scenarios[name] = s;
    writeFileSync(join(OUT, `${name}.json`), JSON.stringify({ config: 'webkit-' + configName, scenario: name, env, did, rec }));
    const row = mdRow('webkit-' + configName, name, s, { programs });
    rows.push(row); log(row);
    log('  did', JSON.stringify(did), 'worst', JSON.stringify(s.worst.slice(0, 3)));
  }
  summary.errors = JSON.parse(await wk.eval('return JSON.stringify((window.__console || []).filter((l) => /^error|onerror|unhandled/.test(l)).slice(0, 10))'));
  writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));
  const md = `# ${label}: webkit-${configName} (${C.w}x${C.h} window at DPR ${env.dpr}${C.q ? ', ?q=' + C.q : ''})\n\n${env.gpu} · ${env.engine} · host ${env.host} · tier ${env.tier} (pixelRatio ${env.pixelRatio}, canvas ${env.canvas.join('x')}) · frames ${env.realRaf ? "WebKit's rAF" : '16 ms timer + GPU read-back'} · load ${env.load.ms} ms\n\n${MD_HEAD}\n${rows.join('\n')}\n`;
  writeFileSync(join(OUT, 'summary.md'), md);
  console.log(md);
} finally {
  try { await wk?.quit(); } catch { /* gone */ }
  try { proc?.kill(9); } catch { /* gone */ }
  try { srv?.stop(); } catch { /* gone */ }
  try { rmSync(workdir, { recursive: true, force: true }); } catch { /* ok */ }
}
process.exit(0);
