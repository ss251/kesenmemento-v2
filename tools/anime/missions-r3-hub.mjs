// Re-shoot the hub card after the still crop, then sample the phone-tier missions tick.
//   tools/anime/gate.sh chrome --fg env -u NODE_OPTIONS bun tools/anime/missions-r3-hub.mjs
import { spawnSync } from 'node:child_process';
import { unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { build, serve, launch, ROOT } from './cdp.mjs';
import { phonePage } from './pad-lib.mjs';

const port = 8874;
const out = resolve(ROOT, 'docs/play/shots/missions');
const dist = join(ROOT, `dist/anime-${port}`);
const built = await build({ outdir: dist, strict: false });
console.log(`build ${built.reused ? 'reused' : 'ok'} ${built.ms ?? ''} ms`);
const srv = serve({ port, dist });

function jpg(page, name) {
  return page.shot(join(out, name + '.png')).then(() => {
    const png = join(out, name + '.png');
    const dest = join(out, name + '.jpg');
    const r = spawnSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '72', png, '--out', dest], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(r.stderr || 'sips failed');
    unlinkSync(png);
    console.log('saved', dest);
  });
}

let browser;
try {
  browser = await launch({ quiet: true });
  for (const kind of ['desktop', 'phone']) {
    const phone = kind === 'phone';
    const page = phone
      ? await phonePage(browser, { width: 393, height: 852, dpr: 3, insets: { top: 59, bottom: 34, left: 0, right: 0 } })
      : await browser.page({ width: 1440, height: 900, dpr: 1 });
    const cssW = phone ? 393 : 1440;
    const cssH = phone ? 852 : 900;
    const dpr = phone ? 3 : 1;
    const q = new URLSearchParams({ shot: '1', lang: 'ja', q: 'high', w: String(cssW * dpr), h: String(cssH * dpr) });
    await page.goto(`${srv.url}index.html?${q}`);
    await page.waitFor('window.__ready === true', { timeout: 280000 });
    const dirty = await page.eval(`localStorage.getItem('klc.play.v1') != null`);
    if (dirty) {
      await page.eval(`localStorage.removeItem('klc.play.v1')`);
      await page.goto(`${srv.url}index.html?${q}`);
      await page.waitFor('window.__ready === true', { timeout: 280000 });
    }
    await page.eval(`window.__missions.hub()`);
    await page.frames(8);
    const hub = await page.eval(`(() => {
      const img = document.querySelector('#klc-m .m-hub-still img');
      return { title: document.querySelector('#klc-m .m-hub-title')?.textContent, art: img ? img.naturalWidth : 0 };
    })()`);
    console.log(kind, JSON.stringify(hub));
    if (hub.art < 8) throw new Error('art missing');
    await jpg(page, `r3-hub-${kind}-ja`);
    await page.eval(`window.__missions.lang('en'); window.__missions.hub()`);
    await page.frames(3);
    await jpg(page, `r3-hub-${kind}-en`);
    await page.goto('about:blank');
  }

  const page = await phonePage(browser, { width: 393, height: 852, dpr: 3, insets: { top: 59, bottom: 34, left: 0, right: 0 } });
  const q = new URLSearchParams({ shot: '1', perf: '1', lang: 'ja', q: 'low', w: '1179', h: '2556' });
  await page.goto(`${srv.url}index.html?${q}`);
  await page.waitFor('window.__ready === true', { timeout: 280000 });
  await page.eval(`window.__missions.away('barista', 60)`);
  for (let i = 0; i < 20; i++) await page.frames(1);
  const samples = [];
  for (let i = 0; i < 40; i++) {
    await page.frames(1);
    const ms = await page.eval(`window.__missions.cost()`);
    if (Number.isFinite(ms)) samples.push(ms);
  }
  samples.sort((a, b) => a - b);
  const n = samples.length;
  const p = (k) => samples[Math.min(n - 1, Math.floor(k * (n - 1)))];
  console.log('PERF', JSON.stringify({ n, p50: p(0.5), p95: p(0.95), p99: p(0.99), max: samples[n - 1] }));
} catch (e) {
  console.log('HUB FAILED:', e.stack || e.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
  srv.stop();
}
