// [perf] The frame-pacing harness: drives the real app through scripted scenarios in headless Chrome and records every frame
// (core/perf.js, ?perf=1): requestAnimationFrame intervals, hitches, CPU ms per system, GPU ms, draw calls, triangles, programs,
// long tasks and GC.
//
//   tools/anime/gate.sh chrome --fg env -u NODE_OPTIONS bun tools/perf/run.mjs --config desktop|retina|phone [--scenarios walk,drive,drone,turn]
//       [--secs 60] [--pre 3] [--settle 8] [--port 9445] [--label baseline] [--params "k=v&..."] [--nobuild] [--out dir]
//   On the second machine: the remote runner --wt ~/Developer/worktrees/klc-smooth --back dist/perf/<label> -- --fg env -u NODE_OPTIONS bun tools/perf/run.mjs ...
//
// --fg (gate.sh): measure at normal priority. Under the gate's default `taskpolicy -b` Chrome runs on the efficiency cores only (4.3x slower
// CPU on the M3 Pro), which is not what a visitor's browser does.
// Configs: desktop = 1600x900 at DPR 1; retina = 1440x900 at DPR 2 (a Retina second machine; the high tier renders at 1.5); phone = 390x844 at DPR 3,
// mobile, touch and an iPhone UA (the phone tier; it renders at 1.25). Each scenario: setup, `--pre` s to settle (not recorded), `--secs` s recorded.
// Output: <out>/<config>/<scenario>.json (every frame), <out>/<config>/summary.json and summary.md (one row per scenario, stats.mjs).
import { join } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { build, serve, launch, ROOT } from '../anime/cdp.mjs';
import { summarize, mdRow, MD_HEAD } from './stats.mjs';

const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : '1') : d; };
const CONFIGS = {
  desktop: { w: 1600, h: 900, dpr: 1, mobile: false },
  retina: { w: 1440, h: 900, dpr: 2, mobile: false },
  phone: { w: 390, h: 844, dpr: 3, mobile: true },
};
const configName = arg('config', 'desktop');
const C = CONFIGS[configName];
if (!C) throw new Error('unknown --config ' + configName);
const port = Number(arg('port', 9445));
const scenarios = arg('scenarios', 'walk,drive,drone,turn').split(',');
const secs = Number(arg('secs', 60)), pre = Number(arg('pre', 3)), settle = Number(arg('settle', 8));
const label = arg('label', 'run');
const OUT = join(arg('out', join(ROOT, 'dist/perf', label)), configName);
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.error(`[perf ${configName}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const git = (a) => { try { return Bun.spawnSync(['git', ...a], { cwd: ROOT }).stdout.toString().trim(); } catch { return null; } };

/** V8's GC pauses of the trace on the page's performance.now() clock: [[start ms, duration ms, name], ...] (the main thread's, top level only). */
function gcEventsOnPageClock(events, syncPageMs) {
  const mark = events.find((e) => e.name === 'klc-perf-sync');
  if (!mark) return null;
  const off = mark.ts / 1000 - syncPageMs;   // trace ms minus page ms
  const names = new Map();
  const out = [];
  for (const e of events) {
    if (!/v8\.gc/.test(e.cat || '') || !(e.dur > 0)) continue;
    names.set(e.name, (names.get(e.name) || 0) + 1);
    // the pause events themselves (not their phases): V8.GC_SCAVENGER, V8.GC_MARK_COMPACTOR, V8.GC_MC_..., V8.GCFinalizeMC ...
    if (!/^(V8\.GC_SCAVENGER|V8\.GC_MINOR_MARK_SWEEPER|V8\.GC_MARK_COMPACTOR|V8\.GCFinalizeMC|V8\.GCIncrementalMarking|V8\.GCScavenger|MinorGC|MajorGC)$/.test(e.name)) continue;
    out.push([Math.round((e.ts / 1000 - off) * 100) / 100, Math.round(e.dur / 10) / 100, e.name, e.tid]);
  }
  out.names = Object.fromEntries(names);
  return { events: out, names: Object.fromEntries(names) };
}

let srv = null, b = null;
try {
  const dist = join(ROOT, `dist/anime-${port}`);
  if (arg('nobuild') !== '1') log(JSON.stringify(await build({ outdir: dist })));
  srv = serve({ port, dist });
  const qs = new URLSearchParams({ perf: '1' });
  if (arg('q')) qs.set('q', arg('q'));
  for (const kv of (arg('params') || '').split('&').filter(Boolean)) { const [k, v = ''] = kv.split('='); qs.set(k, v); }
  const url = srv.url + 'index.html?' + qs;

  b = await launch({ args: ['--enable-precise-memory-info'] });
  const p = await b.page({ width: C.w, height: C.h, dpr: C.dpr });
  if (C.mobile) {
    await p.S('Emulation.setDeviceMetricsOverride', { width: C.w, height: C.h, deviceScaleFactor: C.dpr, mobile: true, screenWidth: C.w, screenHeight: C.h });
    await p.S('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await p.S('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', platform: 'iPhone' });
  }
  await p.S('Performance.enable');
  let crashed = false;
  b.on('Inspector.targetCrashed', () => { crashed = true; });
  await p.S('Inspector.enable').catch(() => {});
  const t0 = Date.now();
  await p.goto(url);
  await p.waitFor(`document.body.classList.contains('loaded')`, { timeout: 420000 });
  const loadMs = Date.now() - t0;
  log(`loaded in ${loadMs} ms: ${url}`);
  await p.eval(`(() => { const go = document.getElementById('go'); if (go && !go.disabled) go.click(); if (!document.body.classList.contains('playing')) document.body.classList.add('playing'); return 1; })()`);
  const env = await p.eval(`(() => { const r = window.__ctx.renderer, gl = r.getContext(), d = gl.getExtension('WEBGL_debug_renderer_info');
    return { gpu: d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : null, ua: navigator.userAgent, tier: window.__ctx.quality.tier || window.__ctx.quality.name, pixelRatio: window.__ctx.quality.pixelRatio,
      canvas: [r.domElement.width, r.domElement.height], gpuTimer: !!window.__perf?.gpuTimer, stats: { bootMs: window.__stats?.bootMs, firstFrameMs: window.__stats?.firstFrameMs, finish: window.__stats?.finish } }; })()`);
  // the systems inside the updates, each in its own bucket (self time: the update that calls them no longer counts them)
  env.wrapped = await p.eval(`(() => { const W = window.__perf, E = window.__explore, L = window.__life, ctx = window.__ctx; if (!W) return null;
    return { batching: W.wrap(E?.stream?.sb, 'flush', 'batching'), commit: W.wrap(E?.stream?.sb, 'add', 'stream:commit'), culling: W.wrap(E?.stream?.sb, 'cull', 'stream:cull'), labels: W.wrap(E?.labels, 'update', 'labels'),
      exploreUi: W.wrap(E?.ui, 'update', 'hud:explore-ui'), lifeHud: W.wrap(L?.hud, 'update', 'hud:life'), cast: W.wrap(L?.cast, 'update', 'life:cast'), tour: W.wrap(L?.tour, 'update', 'life:tour'),
      sound: W.wrap(L?.sound, 'update', 'life:sound'), season: W.wrap(L?.season, 'update', 'life:season'), shadow: W.wrap(ctx.renderer.shadowMap, 'render', 'render:shadow') }; })()`);
  env.load = { ms: loadMs };
  env.host = hostname(); env.head = git(['rev-parse', '--short', 'HEAD']); env.dirty = !!git(['status', '--porcelain', '--', 'src']);
  try { env.chrome = (await p.S('Browser.getVersion')).product; } catch { /* old CDP */ }
  env.loadavg = (Bun.spawnSync(['sysctl', '-n', 'vm.loadavg']).stdout.toString().trim());
  log(JSON.stringify(env));
  await sleep(settle * 1000);
  // --eval <file>: a diagnostic page script (a promise or a value), its result logged (tools/perf/progchurn.page.js ...)
  if (arg('eval')) log('eval', arg('eval'), '->', String(await p.eval(readFileSync(join(ROOT, arg('eval')), 'utf8'))).slice(0, 6000));
  log('scenario driver:', await p.eval(readFileSync(join(ROOT, 'tools/perf/scenarios.page.js'), 'utf8')));
  // --passes: GPU ms per render pass (tools/perf/passes.page.js; the page needs ?gputimer=0)
  const passes = arg('passes') === '1';
  if (passes) log('pass timers:', await p.eval(readFileSync(join(ROOT, 'tools/perf/passes.page.js'), 'utf8')));

  // GC pauses from a trace (V8's own GC events, 'disabled-by-default-v8.gc'); a performance.mark ('blink.user_timing') puts the page's clock on the
  // trace's, so each pause lands on its frame. The JS heap reading of the page is not precise enough in headless Chrome to see a collection.
  const traceEvents = [];
  b.on('Tracing.dataCollected', (pr) => { for (const e of pr.value) traceEvents.push(e); });
  const traceDone = () => new Promise((r) => { const t = setTimeout(r, 15000); b.on('Tracing.tracingComplete', () => { clearTimeout(t); r(); }); });
  const gcTrace = arg('gc', '1') === '1';
  const rows = [], summary = { config: configName, ...C, url, env, secs, pre, scenarios: {} };
  for (const name of scenarios.filter((x) => x !== 'none')) {
    await p.eval(`window.__perfScn.setup(${JSON.stringify(name)})`);
    await sleep(pre * 1000);
    const m0 = Object.fromEntries((await p.S('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
    traceEvents.length = 0;
    if (gcTrace) await p.S('Tracing.start', { categories: 'disabled-by-default-v8.gc,blink.user_timing', transferMode: 'ReportEvents' }).catch((e) => log('no trace:', e.message));
    const sync = await p.eval(`(() => { performance.mark('klc-perf-sync'); return performance.getEntriesByName('klc-perf-sync').pop().startTime; })()`);
    const progs0 = await p.eval('(window.__ctx.renderer.info.programs || []).map((g) => g.id)');
    // --alloc: a sampling profile of every allocation (collected or not) while the scenario runs: where the garbage comes from (diagnostic:
    // the sampling itself costs time, so these runs are not the measured ones)
    const alloc = arg('alloc') === '1';
    if (alloc) { await p.S('HeapProfiler.enable'); await p.S('HeapProfiler.startSampling', { samplingInterval: 16384, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true }); }
    if (passes) await p.eval('window.__passes.start()');
    await p.eval('window.__perf.start()');
    await sleep(secs * 1000);
    const rec = await p.eval('window.__perf.stop()');
    const passMs = passes ? await p.eval('window.__passes.stop()') : null;
    if (passMs) log('  GPU ms per pass per frame:', JSON.stringify(passMs));
    let allocTop = null;
    if (alloc) {
      const { profile } = await p.S('HeapProfiler.getSamplingProfile'); await p.S('HeapProfiler.stopSampling');
      // by the allocating function and the two callers above it (the same function reached from different places counts apart)
      const self = new Map(), key = (cf) => `${cf.functionName || '(anon)'} ${String(cf.url).replace(/^.*\//, '')}:${cf.lineNumber + 1}`;
      const walk = (nd, up) => {
        const k = [key(nd.callFrame), ...up.slice(-2).reverse()].join(' < ');
        if (nd.selfSize) self.set(k, (self.get(k) || 0) + nd.selfSize);
        for (const c of nd.children || []) walk(c, up.concat(key(nd.callFrame)));
      };
      walk(profile.head, []);
      allocTop = [...self].sort((x, y) => y[1] - x[1]).slice(0, 40).map(([k, v]) => [k, +(v / 1e6 / secs).toFixed(2)]);   // MB per second
      log('  allocations (MB/s by function):', JSON.stringify(allocTop.slice(0, 12)));
    }
    if (gcTrace) { const done = traceDone(); await p.S('Tracing.end').catch(() => {}); await done; }
    const m1 = Object.fromEntries((await p.S('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
    const did = await p.eval('window.__perfScn.stop()');
    const programs = await p.eval('window.__ctx.renderer.info.programs?.length ?? null');
    // the shader programs compiled while the scenario ran (each one a stall on first use): their names and the start of their cache keys
    const newPrograms = await p.eval(`(() => { const old = new Set(${JSON.stringify(progs0)}); return (window.__ctx.renderer.info.programs || []).filter((g) => !old.has(g.id)).map((g) => (g.name || '?') + ' | ' + String(g.cacheKey || '').slice(0, 160)); })()`);
    if (gcTrace) rec.gcEvents = gcEventsOnPageClock(traceEvents, sync);
    const s = summarize(rec);
    s.did = did; s.programs = programs; s.newPrograms = newPrograms; if (allocTop) s.allocTop = allocTop; if (passMs) s.passes = passMs;
    s.cdp = { taskMs: Math.round((m1.TaskDuration - m0.TaskDuration) * 1000), scriptMs: Math.round((m1.ScriptDuration - m0.ScriptDuration) * 1000), layoutMs: Math.round((m1.LayoutDuration - m0.LayoutDuration) * 1000), styleMs: Math.round((m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000), heapMB: Math.round(m1.JSHeapUsedSize / 1e6) };
    summary.scenarios[name] = s;
    writeFileSync(join(OUT, `${name}.json`), JSON.stringify({ config: configName, scenario: name, env, did, rec }));
    const row = mdRow(configName, name, s, { programs });
    rows.push(row);
    log(row);
    log('  did', JSON.stringify(did), 'cdp', JSON.stringify(s.cdp), 'new programs', newPrograms.length, 'worst', JSON.stringify(s.worst.slice(0, 3)));
    if (crashed) { log('the page crashed'); break; }
  }
  if (arg('eval-after')) log('eval-after ->', String(await p.eval(arg('eval-after'))).slice(0, 6000));   // a diagnostic's report (tools/perf/warmcheck.page.js ...)
  summary.crashed = crashed;
  summary.errors = p.errors().slice(0, 10);
  writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));
  const md = `# ${label}: ${configName} (${C.w}x${C.h} at DPR ${C.dpr}${C.mobile ? ', mobile' : ''})\n\n${env.gpu} · ${env.chrome ?? ''} · host ${env.host} · head ${env.head}${env.dirty ? '+' : ''} · tier ${env.tier} (pixelRatio ${env.pixelRatio}, canvas ${env.canvas.join('x')}) · GPU timer ${env.gpuTimer ? 'yes' : 'no'} · load ${env.load.ms} ms · loadavg ${env.loadavg}\n\n${MD_HEAD}\n${rows.join('\n')}\n`;
  writeFileSync(join(OUT, 'summary.md'), md);
  console.log(md);
} finally {
  try { await b?.close(); } catch { /* gone */ }
  try { srv?.stop(); } catch { /* gone */ }
}
process.exit(0);
