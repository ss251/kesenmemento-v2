// [title] Proof for the v3 title: first paint and idle frames on the warm preview, then the still-to-live
// delta E of the desktop poster against the first settled live frame (the same camera, fov and sim time).
//
//   tools/anime/gate.sh chrome --fg env -u NODE_OPTIONS bun tools/anime/title-prove.mjs --port 9437
//
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { build, serve, launch, ROOT } from './cdp.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', '9437'));
const W = 1280, H = 720;   // same 16:9 as the 2560×1440 poster, so the field of view matches
const poster = opt('--poster', '/tmp/klc-title-posters/title_desktop_hiru.png');
const outDir = join(ROOT, 'docs/loading/v3');

const HOOK = `window.__lt=[];window.__frames=[];try{new PerformanceObserver(l=>{for(const e of l.getEntries())if(e.duration>50)window.__lt.push(Math.round(e.duration));}).observe({type:'longtask',buffered:true});}catch(e){}
let __last=0;(function tick(t){if(__last)window.__frames.push(+(t-__last).toFixed(2));__last=t;requestAnimationFrame(tick);})(0);`;

function lab(r, g, b) {
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const R = lin(r / 255), G = lin(g / 255), B = lin(b / 255);
  let X = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / 0.95047;
  let Y = R * 0.2126729 + G * 0.7151522 + B * 0.072175;
  let Z = (R * 0.0193339 + G * 0.119192 + B * 0.9503041) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787037 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

function meanDeltaE(a, b) {
  let sum = 0, n = 0, max = 0;
  for (let i = 0; i + 2 < a.length && i + 2 < b.length; i += 12) {   // every fourth pixel, RGB
    const A = lab(a[i], a[i + 1], a[i + 2]), B = lab(b[i], b[i + 1], b[i + 2]);
    const d = Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
    sum += d; n++; if (d > max) max = d;
  }
  return { mean: +(sum / n).toFixed(2), max: +max.toFixed(1), samples: n };
}

function pct(xs, p) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return +s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))].toFixed(2);
}

const browser = await launch({ args: ['--force-device-scale-factor=1'] });
const report = {};
try {
  const preview = await browser.page({ width: 393, height: 852, dpr: 3 });
  await preview.S('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 3, mobile: true, screenWidth: 393, screenHeight: 852 });
  await preview.S('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
  const nav = Date.now();
  await preview.goto('http://127.0.0.1:9436/index.html?capture=1&force=1&poster=hiru&p=1&tframe=4.2&tip=1&lang=ja');
  await preview.waitFor("document.body.dataset.ready === '1'", { timeout: 20000 });
  await preview.frames(120);
  report.preview = await preview.eval(`(() => {
    const paint = performance.getEntriesByType('paint').map(e => ({ name: e.name, ms: +e.startTime.toFixed(1) }));
    const frames = window.__frames.slice(-90);
    return { paint, wallMs: ${Date.now()} - ${nav}, frames: frames.length, p50: ${'null'}, longTasks: window.__lt };
  })()`);
  const frames = await preview.eval('window.__frames.slice(-120)');
  report.preview.p50 = pct(frames, 0.5);
  report.preview.p95 = pct(frames, 0.95);
  report.preview.p99 = pct(frames, 0.99);
  report.preview.longTasks = await preview.eval('window.__lt');

  const dist = join(ROOT, `dist/anime-${port}`);
  console.error('building…');
  await build({ outdir: dist, quiet: true });
  const srv = serve({ port, dist });
  report.url = srv.url;
  const page = await browser.page({ width: W, height: H, dpr: 1 });
  await page.S('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
  const t0 = Date.now();
  await page.goto(`${srv.url}index.html?poster=hiru&hours=12&labels=0&credit=0&dr=0&lang=ja`);
  await page.waitFor("document.body.classList.contains('klc-live')", { timeout: 280000, poll: 40 });
  report.liveAtMs = Date.now() - t0;
  await page.eval(`(() => { const bg = document.querySelector('#intro .bg'); if (bg) { bg.style.transition = 'none'; bg.style.opacity = '0'; } const i = document.getElementById('intro'); if (i) i.style.visibility = 'hidden'; return 1; })()`);
  const liveFile = join(outDir, 'live-hiru-desktop.png');
  await page.shot(liveFile);
  const [live, still] = await Promise.all([
    sharp(liveFile).resize(W, H, { fit: 'fill' }).removeAlpha().raw().toBuffer(),
    sharp(poster).resize(W, H, { fit: 'fill' }).removeAlpha().raw().toBuffer(),
  ]);
  report.deltaE = meanDeltaE(live, still);
  report.deltaE.live = liveFile;
  report.deltaE.still = poster;
  await Bun.sleep(1500);
  const idle = await page.eval('window.__frames.slice(-90)');
  report.idle = { p50: pct(idle, 0.5), p95: pct(idle, 0.95), p99: pct(idle, 0.99), n: idle.length, longTasks: await page.eval('window.__lt') };
  report.errors = page.errors().slice(0, 6);
  srv.stop();
} finally {
  await browser.close();
}
writeFileSync(join(outDir, 'prove.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
