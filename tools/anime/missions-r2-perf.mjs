// Phone-tier cost of the missions tick. Reuses the film build.
//   tools/anime/gate.sh chrome --fg env -u NODE_OPTIONS bun tools/anime/missions-r2-perf.mjs
import { join } from 'node:path';
import { serve, launch, ROOT } from './cdp.mjs';
import { phonePage } from './pad-lib.mjs';

const port = 8866;
const dist = join(ROOT, 'dist/anime-8865');
const srv = serve({ port, dist });
let browser;
try {
  browser = await launch({ quiet: true });
  const page = await phonePage(browser, { width: 393, height: 852, dpr: 3, insets: { top: 59, bottom: 34, left: 0, right: 0 } });
  const q = new URLSearchParams({ shot: '1', perf: '1', lang: 'ja', q: 'low', w: '1179', h: '2556', missions: 'near:barista' });
  await page.goto(`${srv.url}index.html?${q}`);
  await page.waitFor('window.__ready === true', { timeout: 280000 });
  await page.eval(`window.__missions.near('barista')`);
  for (let i = 0; i < 30; i++) await page.frames(1);
  const samples = [];
  for (let i = 0; i < 40; i++) {
    await page.frames(1);
    const ms = await page.eval(`window.__missions.cost()`);
    if (Number.isFinite(ms)) samples.push(ms);
  }
  console.log(samples.map((v) => Math.round(v * 100) / 100).join(' '));
  samples.sort((a, b) => a - b);
  const n = samples.length;
  const p = (q) => samples[Math.min(n - 1, Math.floor(q * (n - 1)))];
  console.log(JSON.stringify({ n, p50: p(0.5), p95: p(0.95), max: samples[n - 1], min: samples[0] }));
} catch (e) {
  console.log('PERF FAILED:', e.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
  srv.stop();
}
