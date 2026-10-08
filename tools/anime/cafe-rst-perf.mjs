// [cafe-rst] Frame pacing inside café RST: the real app in headless Chrome, standing at the counter turning slowly (the four people breathing, blinking and
// looking about, the mirror ball turning) and at the street door, recorded with core/perf.js (?perf=1) and summarised by tools/perf/stats.mjs: frame interval
// p50 / p95 / p99 / max, hitches over 25 / 33 / 50 / 100 ms, CPU and GPU ms, draw calls and triangles.
//
//   tools/anime/gate.sh chrome --fg env -u NODE_OPTIONS bun tools/anime/cafe-rst-perf.mjs --config desktop|retina|phone [--secs 20] [--port 9443] [--out dir]
//   On the second machine (real GPU): the remote runner --wt <worktree> --back <out> -- --fg env -u NODE_OPTIONS bun tools/anime/cafe-rst-perf.mjs --config retina --out dist/perf/cafe
// --fg measures at normal priority (the gate's default `taskpolicy -b` puts Chrome on the efficiency cores). Headless Chrome on the shared the build machine has no
// real GPU: only the second machine's numbers say something about a visitor's frame time; the draw call and triangle counts are the same everywhere.
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { build, serve, launch, ROOT } from './cdp.mjs';
import { summarize, mdRow, MD_HEAD } from '../perf/stats.mjs';

const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : '1') : d; };
const CONFIGS = { desktop: { w: 1600, h: 900, dpr: 1, mobile: false }, retina: { w: 1440, h: 900, dpr: 2, mobile: false }, phone: { w: 390, h: 844, dpr: 3, mobile: true } };
const configName = arg('config', 'desktop'), C = CONFIGS[configName];
if (!C) throw new Error('unknown --config ' + configName);
const port = Number(arg('port', 9443));
if ([8787, 8790, 8791].includes(port)) throw new Error('port reserved');
const secs = Number(arg('secs', 20)), settle = Number(arg('settle', 6));
const out = join(arg('out', join(ROOT, 'dist/perf/cafe')), configName);
mkdirSync(out, { recursive: true });
const log = (...a) => console.error(`[cafe perf ${configName}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let srv = null, b = null;
try {
  const dist = join(ROOT, `dist/anime-${port}`);
  if (arg('nobuild') !== '1') log(JSON.stringify(await build({ outdir: dist, quiet: true })));
  srv = serve({ port, dist });
  b = await launch({ args: ['--enable-precise-memory-info'], quiet: true });
  const p = await b.page({ width: C.w, height: C.h, dpr: C.dpr });
  if (C.mobile) {
    await p.S('Emulation.setDeviceMetricsOverride', { width: C.w, height: C.h, deviceScaleFactor: C.dpr, mobile: true, screenWidth: C.w, screenHeight: C.h });
    await p.S('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await p.S('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', platform: 'iPhone' });
  }
  await p.goto(`${srv.url}index.html?perf=1&fixtures=1`);
  await p.waitFor("document.body.classList.contains('loaded')", { timeout: 420000 });
  await p.eval("(() => { const go = document.getElementById('go'); if (go && !go.disabled) go.click(); if (!document.body.classList.contains('playing')) document.body.classList.add('playing'); return 1; })()");
  await p.frames(30);
  await p.eval("window.__lifeSet && window.__lifeSet('hiru')");
  const rec0 = await p.eval('(() => { const i = window.__explore.interiors.cafeRst; return i ? { entrance: i.entrance, inside: i.inside } : null; })()');
  if (!rec0) throw new Error('no café RST on the page');
  const env = await p.eval(`(() => { const r = window.__ctx.renderer, gl = r.getContext(), d = gl.getExtension('WEBGL_debug_renderer_info');
    return { gpu: d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : null, tier: window.__ctx.quality.tier || window.__ctx.quality.name, canvas: [r.domElement.width, r.domElement.height] }; })()`);
  try { env.chrome = (await p.S('Browser.getVersion')).product; } catch { /* old CDP */ }
  log(JSON.stringify(env));
  // each scenario: a pose driver on the page (a requestAnimationFrame loop that sets the player's pose: standing, turning 20 deg/s), `settle` s unrecorded, `secs` s recorded
  const SCN = {
    'cafe-counter-turning': { pos: rec0.inside, turn: 20 },     // inside, at the counter's end, turning slowly: every figure comes into view
    'cafe-door-still': { pos: rec0.entrance, turn: 0 },         // at the street door, looking in
  };
  const rows = [], summary = { config: configName, ...C, env, secs, scenarios: {} };
  for (const [name, sc] of Object.entries(SCN)) {
    await p.eval(`(() => { window.__life.tour.stop?.(); const pl = window.__ctx.playerObj; pl.fly = false; const q = ${JSON.stringify(sc.pos)}; let yaw = q.yaw, last = performance.now();
      window.__cafeDrv && cancelAnimationFrame(window.__cafeDrv.id);
      const d = window.__cafeDrv = { id: 0 }; const step = (t) => { yaw += ${sc.turn} * (t - last) / 1000; last = t; pl.setPose(q.x, q.z, yaw, q.pitch); d.id = requestAnimationFrame(step); }; d.id = requestAnimationFrame(step); return 1; })()`);
    await sleep(settle * 1000);
    await p.eval('window.__perf.start()');
    await sleep(secs * 1000);
    const rec = await p.eval('window.__perf.stop()');
    const s = summarize(rec);
    summary.scenarios[name] = s; rows.push(mdRow(configName, name, s, {}));
    log(rows[rows.length - 1]);
    writeFileSync(join(out, `${name}.json`), JSON.stringify({ config: configName, scenario: name, env, rec }));
  }
  await p.eval('window.__cafeDrv && cancelAnimationFrame(window.__cafeDrv.id)');
  summary.errors = p.errors().slice(0, 10);
  writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 1));
  const md = `# café RST frame pacing: ${configName} (${C.w}x${C.h} at DPR ${C.dpr}${C.mobile ? ', mobile' : ''})\n\n${env.gpu} · ${env.chrome ?? ''} · tier ${env.tier} · canvas ${env.canvas.join('x')}\n\n${MD_HEAD}\n${rows.join('\n')}\n\nconsole errors: ${summary.errors.length}\n`;
  writeFileSync(join(out, 'summary.md'), md); console.log(md);
} finally {
  try { await b?.close(); } catch { /* gone */ }
  try { srv?.server?.stop(true); } catch { /* gone */ }
}
process.exit(0);
