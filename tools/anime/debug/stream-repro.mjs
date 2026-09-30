// [v4:polish3] Reproduce the streamed-geometry corruption (qa3 walk loop, then 気仙沼簡易裁判所) and check the pools.
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/debug/stream-repro.mjs --port 8829 [--build 1] [--n 55]
import { resolve } from 'node:path';
import { launch, ROOT, build as cdpBuild } from '../cdp.mjs';
import { start } from '../../../scripts/serve.js';

const args = {};
for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) { const k = a.slice(2); const v = process.argv[i + 1] !== undefined && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : '1'; args[k] = v; } }
const port = Number(args.port || 8829);
if ([8787, 8790, 8791].includes(port)) throw new Error('port reserved');
const dist = resolve(ROOT, `dist/anime-${port}-qa`);
if (args.build) await cdpBuild({ outdir: dist, minify: true });
const srv = await start({ port, build: false, quiet: true, dist });
let browser;
try {
  browser = await launch({ quiet: true });
  const page = await browser.page({ width: 1280, height: 720 });
  await page.goto(`${srv.url}`);
  await page.waitFor("document.body.classList.contains('loaded')", { timeout: 280000 });
  await page.eval("document.getElementById('go').click()"); await page.frames(20);
  await page.eval("document.body.classList.add('noui')");
  await page.eval(`document.querySelector('#klc-ui [data-act="preset"][data-id="yugata"]')?.click()`);
  const ids = await page.eval('__life.tour.stops.filter((s) => s.walk).map((s) => s.id)');
  const n = Math.min(ids.length, Number(args.n || ids.length));
  console.log('validate at start:', JSON.stringify(await page.eval('__explore.stream.sb.validate()')));
  for (let i = 0; i < n; i++) {
    await page.eval(`void __life.tour.walkTo(${JSON.stringify(ids[i])})`); await page.frames(12);
    const pend = await page.eval('({ p: __explore.stream.sb.pending(), busy: __explore.stream.summary().busy, want: __explore.stream.summary().pending })');
    console.log(ids[i], JSON.stringify(pend));
    if (args.shots || ids[i] === 'court') await page.shot(resolve(ROOT, `shots/polish3/repro_${args.tag || 'a'}_${ids[i]}.png`));
    const v = await page.eval('__explore.stream.sb.validate()');
    if (v.nBad) { console.log(`after ${ids[i]}:`, JSON.stringify(v)); if (!args.all) break; }
  }
  await page.eval("void __life.tour.walkTo('court')"); await page.frames(20);
  console.log('validate at court:', JSON.stringify(await page.eval('__explore.stream.sb.validate()')));
  console.log('stats:', JSON.stringify(await page.eval('__explore.stream.summary().batch')));
  await page.shot(resolve(ROOT, `shots/polish3/repro_court_${args.tag || 'a'}.png`));
} catch (e) { console.log('FAILED', e.message); process.exitCode = 1; }
finally { await browser?.close(); srv.server.stop(true); }
process.exit(process.exitCode || 0);
