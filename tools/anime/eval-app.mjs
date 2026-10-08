// [v6:fix3] Evaluate JS expressions in the built app (headless) and print the JSON results: for reading the app's generated
// positions (poles, boats, features) when a photo says one of them is wrong.
//
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/eval-app.mjs --port 8901 [--nobuild] 'expr1' 'expr2' ...
//   e.g. 'window.__ctx.services.poles.poles.filter(p => Math.hypot(p.x + 25, p.z - 75) < 40).map(p => [p.x, p.z, p.H])'
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { build, serve, launch, ROOT } from './cdp.mjs';

const args = {}, exprs = [];
for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) { const k = a.slice(2); const v = process.argv[i + 1] !== undefined && !process.argv[i + 1].startsWith('--') && /^(port|q)$/.test(k) ? process.argv[++i] : '1'; args[k] = v; } else exprs.push(a); }
const port = Number(args.port || 8901);
if ([8787, 8790, 8791].includes(port)) throw new Error('port reserved');
const dist = join(ROOT, `dist/anime-${port}`);
if (!args.nobuild || !existsSync(join(dist, 'index.html'))) { const r = await build({ outdir: dist }); console.error(`build ${r.reused ? 'FAILED (reused the last good build)' : 'ok'} ${r.ms ?? ''} ms`); }
const srv = serve({ port, dist });
let browser;
try {
  browser = await launch({ quiet: true });
  const page = await browser.page({ width: 320, height: 240 });
  await page.goto(`${srv.url}index.html?shot=1&w=320&h=240&t=0&q=low`);
  await page.waitFor('window.__ready === true', { timeout: 280000 });
  for (const e of exprs) console.log(JSON.stringify(await page.eval(e)));
} finally { await browser?.close(); srv.stop(); }
