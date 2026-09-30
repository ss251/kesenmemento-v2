// [v3:foundation] Screenshots of the real renderer in headless Chrome (real GPU via --use-angle=metal).
// Always run through the machine gate (one headless Chrome machine-wide, V3-SPEC section 8):
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/shot.mjs --port 8811 --only _ground,environment \
//        --cams "150,-40,0,2;x,y,z,yaw,pitch;x,y,z>lx,ly,lz" --out shots/foundation/a --hours 16.5
// --cams   ';'-separated. 4 numbers = walking eye (x,z,yawDeg,pitchDeg); 5 = free camera (x,y,z,yaw,pitch);
//          "x,y,z>lx,ly,lz" = drone camera at pos looking at a point. yaw 0 = north(-Z), 90 = west, 180 = south, -90 = east.
//          Names are allowed too: "hero" (HERO.drone), "walk" (HERO.walk), "tour:<id>" / "tourwalk:<id>".
// --only   comma list of world modules (omit = full scene). --t sim seconds. --hours JST hour (16.5) or --preset yugata.
// --w/--h  size (<= 1920x1080 by machine rule). --bench N  GPU ms/frame per camera. --fov deg. --q high|medium|low.
// --eval   page JS evaluated after each camera is set (debug probes; the result is printed).
// --entry  another HTML entry (smoke tests). --nobuild reuse dist/anime-<port>. --keep keep the browser for n seconds (debug only).
import { join, resolve, relative } from 'node:path';
import { build, serve, launch, ROOT } from './cdp.mjs';

const args = {};
for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) { const k = a.slice(2); const v = process.argv[i + 1] !== undefined && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : '1'; args[k] = v; } }
const W = Math.min(1920, Number(args.w || 1280)), H = Math.min(1080, Number(args.h || 720));
const port = Number(args.port || 8811);
if ([8787, 8790, 8791].includes(port)) throw new Error('port reserved');
const cams = (args.cams || 'hero').split(';').map((s) => s.trim()).filter(Boolean);
const out = args.out || 'shots/foundation/shot';
const dist = join(ROOT, `dist/anime-${port}${args.entry ? '-x' : ''}`);

const t0 = Date.now();
if (!args.nobuild) {
  const r = await build({ entry: args.entry ? resolve(ROOT, args.entry) : undefined, outdir: dist, strict: !!args.strict, only: args.only ? args.only.split(',').map((x) => x.trim()) : null });
  console.log(`build ${r.reused ? 'FAILED (reused last good build)' : 'ok'} ${r.ms ?? ''} ms`);
}
const srv = serve({ port, dist });
let browser;
try {
  browser = await launch({ quiet: !args.verbose });
  const page = await browser.page({ width: W, height: H });
  const q = new URLSearchParams({ shot: '1', w: String(W), h: String(H), t: String(args.t || 0), q: args.q || 'high' });
  for (const k of ['only', 'hours', 'preset', 'fov', 'batch', 'date', 'debug', 'season', 'weather']) if (args[k]) q.set(k, args[k]);
  if (args.query) for (const [k, v] of new URLSearchParams(args.query)) q.set(k, v);
  await page.goto(`${srv.url}index.html?${q}`);
  await page.waitFor('window.__ready === true', { timeout: 280000 });
  const info = await page.eval(`({ errors: window.__errors, stats: window.__stats, gl: (() => { try { const gl = document.getElementById('scene').getContext('webgl2'); const d = gl.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown'; } catch (e) { return 'n/a'; } })() })`);
  console.log(`ready in ${((Date.now() - t0) / 1000).toFixed(1)} s · gpu: ${info.gl}`);
  for (let i = 0; i < cams.length; i++) {
    await page.eval(`window.__camSpec(${JSON.stringify(cams[i])})`);
    await page.frames(5);
    if (args.eval) console.log('eval:', JSON.stringify(await page.eval(args.eval)));   // [v3:polish2] debug probe after the camera is set
    const file = resolve(ROOT, `${out}_${i}.png`);
    await page.shot(file);
    const st = await page.eval('({ calls: window.__stats.calls, triangles: window.__stats.triangles })');
    console.log(`saved ${relative(ROOT, file)}  cam=[${cams[i]}]  calls=${st.calls} tris=${(st.triangles / 1e6).toFixed(2)}M`);
    if (args.bench) console.log('  bench:', JSON.stringify(await page.eval(`window.__bench(${Number(args.bench) > 1 ? Number(args.bench) : 30})`)));
  }
  if (args.diag) console.log('diag:', JSON.stringify(await page.eval('window.__diag()')));
  console.log('module stats:', JSON.stringify(info.stats?.modules), 'batch:', JSON.stringify(info.stats?.batch));
  if (info.errors?.length) { console.log('MODULE ERRORS:'); for (const e of info.errors) console.log(` - [${e.module}] ${String(e.message).split('\n').slice(0, 6).join('\n   ')}`); }
  const errs = page.errors();
  if (errs.length) { console.log('PAGE ERRORS:'); for (const l of errs.slice(0, 30)) console.log('  ', l.type, l.text.slice(0, 500)); }
  if (args.keep) await Bun.sleep(Number(args.keep) * 1000);
} catch (e) {
  console.log('SHOT FAILED:', e.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
  srv.stop();
}
