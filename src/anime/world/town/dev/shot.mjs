// [v3:town] Town screenshot harness: tools/anime/shot.mjs plus --eval and the town's build report (window.__town).
// Run ONLY through the machine gate (one headless Chrome machine-wide, V3-SPEC section 8):
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS bun src/anime/world/town/dev/shot.mjs --port 8812 \
//     --only environment,water,town,harbor,life --cams "hero;walk;x,z,yaw,pitch;x,y,z,yaw,pitch;x,y,z>lx,ly,lz" \
//     --out shots/town/x --hours 16.5 [--w 1920 --h 1080] [--bench 30] [--eval "<js expression>"] [--query "a=1&b=2"]
import { join, resolve, relative } from 'node:path';
import { build, serve, launch, ROOT } from '../../../../../tools/anime/cdp.mjs';

const args = {};
for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) { const k = a.slice(2); const v = process.argv[i + 1] !== undefined && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : '1'; args[k] = v; } }
const W = Math.min(1920, Number(args.w || 1920)), H = Math.min(1080, Number(args.h || 1080));
const port = Number(args.port || 8812);
if ([8787, 8790, 8791].includes(port)) throw new Error('port reserved');
const cams = (args.cams || 'hero').split(';').map((s) => s.trim()).filter(Boolean);
const out = args.out || 'shots/town/shot';
const dist = join(ROOT, `dist/anime-${port}`);
const t0 = Date.now();
const r = await build({ outdir: dist, only: args.only ? args.only.split(',').map((x) => x.trim()) : null });
console.log(`build ${r.reused ? 'FAILED (reused last good build)' : 'ok'} ${r.ms ?? ''} ms`);
const srv = serve({ port, dist });
let browser;
try {
  browser = await launch({ quiet: true });
  const page = await browser.page({ width: W, height: H });
  const q = new URLSearchParams({ shot: '1', w: String(W), h: String(H), t: String(args.t || 0), q: args.q || 'high' });
  for (const k of ['only', 'hours', 'preset', 'fov', 'season', 'weather']) if (args[k]) q.set(k, args[k]);
  if (args.query) for (const [k, v] of new URLSearchParams(args.query)) q.set(k, v);
  await page.goto(`${srv.url}index.html?${q}`);
  await page.waitFor('window.__ready === true', { timeout: 280000 });
  console.log(`ready in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const town = await page.eval('JSON.stringify(window.__town || null)');
  console.log('town:', town);
  if (args.eval) console.log('eval:', JSON.stringify(await page.eval(args.eval)));
  for (let i = 0; i < cams.length; i++) {
    await page.eval(`window.__camSpec(${JSON.stringify(cams[i])})`);
    await page.frames(5);
    const file = resolve(ROOT, `${out}_${i}.png`);
    await page.shot(file);
    const st = await page.eval('({ calls: window.__stats.calls, triangles: window.__stats.triangles })');
    console.log(`saved ${relative(ROOT, file)}  cam=[${cams[i]}]  calls=${st.calls} tris=${(st.triangles / 1e6).toFixed(2)}M`);
    if (args.bench) console.log('  bench:', JSON.stringify(await page.eval(`window.__bench(${Number(args.bench) > 1 ? Number(args.bench) : 30})`)));
  }
  const info = await page.eval('({ errors: window.__errors, stats: window.__stats })');
  console.log('module ms:', JSON.stringify(Object.fromEntries(Object.entries(info.stats?.modules || {}).map(([k, v]) => [k, v.ms]))), 'batch ms:', info.stats?.batch?.ms);
  if (info.errors?.length) { console.log('MODULE ERRORS:'); for (const e of info.errors) console.log(` - [${e.module}] ${String(e.message).split('\n').slice(0, 6).join('\n   ')}`); }
  const errs = page.errors().filter((l) => !/favicon/.test(l.text));
  if (errs.length) { console.log('PAGE ERRORS:'); for (const l of errs.slice(0, 20)) console.log('  ', l.type, l.text.slice(0, 400)); }
} catch (e) {
  console.log('SHOT FAILED:', e.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
  srv.stop();
}
