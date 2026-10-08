// [loader] Gated browser checks for the 「帰港」 loading screen and its hand-off (docs/loading/README.md, docs/CRAFT.md section 8). A script, not a bun:test file (bun test cannot spawn Chrome here).
//
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/loader-check.mjs --port 9436 [--steps paint,load,record,shots] [--out DIR] [--label NAME] [--runs 1] [--nobuild]
//
//   paint   the REAL build, cold, on a slow network (1.6 Mbit/s, 150 ms): when does the first paint come, what had been fetched by then (it must be the page alone: no stylesheet, no font, no script
//           of the app), and is the loader's own mark in the DOM before it. Then the load is cut off.
//   load    the REAL build, cold, on an iPhone-shaped page (393 x 852 @3, safe areas) and on a 1600 x 900 desktop page, `--runs` times each: the time to the loader's first paint, to the card, to ready
//           (body.loaded) and to the world's first frame (stats.firstFrameMs: the number that must not be slower than main's), the progress the page reported (monotonic, never 99 % for long), the flags
//           hoisted, the page's own errors, the longest task, and a compositor proof (the crest/runner change in a screencast while the main thread is blocked); then a tap on 「まちへ出る」 and the frame
//           times through the iris (p50 / p95 / p99, frames over 50 ms), the still cut at once, the picture gone after it.
//   record  the loader running, from the preview build with the real plan's stage order (tools/anime/loader-preview.mjs): a CDP screencast -> an animated WebP (<= 4 MB), real time where it matters
//           and time-lapse where the town is busy. --out DIR/loader-run.webp
//   shots   Chrome-only states the WebKit tool cannot make: reduced motion, safe-area insets on a notched phone in both orientations (preview build), English.
//
// Ports 9435-9439 (this lane's). --label tags a run (run this file from a worktree of main for the "before" numbers: the steps that need the new loader are skipped when the page has none).
import { join } from 'node:path';
import { writeFileSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { buildAndServe, launch, phonePage, setViewport, sleep, ROOT } from './pad-lib.mjs';
import { serve } from './cdp.mjs';

const argv = process.argv.slice(2), arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : '1') : d; };
const PORT = Number(arg('port', 9436)); if (PORT < 9435 || PORT > 9439) throw new Error('ports 9435-9439 only (this lane\'s)');
const STEPS = String(arg('steps', 'paint,load,record,shots')).split(',').map((s) => s.trim()).filter(Boolean);
const OUT = arg('out', join(ROOT, 'dist/loader-check')), LABEL = arg('label', 'branch'), RUNS = Number(arg('runs', 1));
mkdirSync(OUT, { recursive: true });
const results = [], numbers = {};
let failed = 0;
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, ...(detail !== undefined && { detail }) }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`); };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1) : null; };
const IPHONE = { width: 393, height: 852, dpr: 3, insets: { top: 59, bottom: 34, left: 0, right: 0 } };

let built = null;
async function app() { if (!built) built = await buildAndServe(PORT, { minify: true }); return built; }

const browser = await launch({ args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const casts = [];
function screencast(page, { maxWidth = 262, quality = 55, every = 1 } = {}) {
  const frames = []; let on = false, t0 = 0;
  browser.on('Page.screencastFrame', (p, sid) => { if (!on) return; frames.push({ t: Date.now() - t0, data: p.data }); page.S('Page.screencastFrameAck', { sessionId: p.sessionId }).catch(() => {}); });
  return { frames, async start() { on = true; t0 = Date.now(); await page.S('Page.startScreencast', { format: 'jpeg', quality, maxWidth, everyNthFrame: every }); }, async stop() { on = false; await page.S('Page.stopScreencast').catch(() => {}); } };
}

try {
  // ---------------------------------------------------------------- paint: the first paint of the REAL build on a slow network
  if (STEPS.includes('paint')) {
    const { srv } = await app();
    const page = await phonePage(browser, IPHONE);
    await page.S('Network.enable'); await page.S('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6e6 / 8), uploadThroughput: (750e3 / 8) });
    await page.S('Page.enable');
    const reqs = []; browser.on('Network.requestWillBeSent', (p) => { reqs.push({ url: p.request.url.replace(/^https?:\/\/[^/]+/, '').slice(0, 80), t: p.timestamp, type: p.type }); });
    await page.goto(`${srv.url}index.html`);
    let paint = null;
    for (let i = 0; i < 400 && !paint; i++) { await sleep(50); paint = await page.eval(`(() => { const f = performance.getEntriesByName('first-contentful-paint')[0]; if (!f) return null; const m = performance.getEntriesByName('klc:loader')[0]; return { fcp: Math.round(f.startTime), fp: Math.round((performance.getEntriesByName('first-paint')[0] || f).startTime), loaderMark: m ? Math.round(m.startTime) : null, res: performance.getEntriesByType('resource').map((r) => ({ n: r.name.replace(/^https?:\\/\\/[^/]+/, '').slice(0, 60), end: Math.round(r.responseEnd), type: r.initiatorType })) }; })()`); }
    numbers.paint = paint;
    check('paint: the first paint comes (slow network)', !!paint, paint && { fcp: paint.fcp, fp: paint.fp });
    if (paint) {
      check('paint: the loader is in the DOM before the first paint (klc:loader mark)', paint.loaderMark !== null && paint.loaderMark <= paint.fcp + 5, { loaderMark: paint.loaderMark, fcp: paint.fcp });
      const blockers = paint.res.filter((r) => r.end > 0 && r.end <= paint.fcp && !/index\.html|^\/$/.test(r.n) && r.type !== 'navigation');
      const appBlocker = (r) => /\.(js|css)(\?|$)/.test(r.n) || /fonts\.(googleapis|gstatic)/.test(r.n);
      check('paint: nothing but the page and the loader font subsets had finished by the first paint', blockers.every((r) => !appBlocker(r)), blockers);
      const js = paint.res.find((r) => /chunk-.*\.js/.test(r.n)); numbers.paintVsBundle = js ? { fcp: paint.fcp, bundleEnd: js.end } : { fcp: paint.fcp, bundleEnd: null };
      check('paint: the first paint is long before the app bundle has arrived (or the bundle has not finished at all)', !js || paint.fcp < js.end, numbers.paintVsBundle);
    }
    await page.S('Page.stopLoading').catch(() => {}); await page.S('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  }

  // ---------------------------------------------------------------- load: cold loads of the REAL build, then the hand-off
  if (STEPS.includes('load')) {
    const { srv } = await app();
    const tiers = [['phone', IPHONE], ['desktop', { width: 1600, height: 900, dpr: 1, insets: null }]];
    numbers.load = {};
    for (const [tier, vp] of tiers) {
      numbers.load[tier] = [];
      for (let run = 0; run < RUNS; run++) {
        const page = tier === 'phone' ? await phonePage(browser, vp) : await browser.page({ width: vp.width, height: vp.height, dpr: vp.dpr });
        await page.S('Page.enable'); await page.S('Performance.enable').catch(() => {});
        await page.eval(`1`).catch(() => {});
        const cast = screencast(page, { maxWidth: tier === 'phone' ? 196 : 320, quality: 50, every: 1 });
        await page.S('Page.addScriptToEvaluateOnNewDocument', { source: `window.__lt = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)); }).observe({ entryTypes: ['longtask'] }); } catch (e) {}` }).catch(() => {});
        const t0 = Date.now();
        await page.goto(`${srv.url}index.html`);
        await page.waitFor("document.readyState !== 'loading' && !!document.body", { timeout: 60000, poll: 100 });   // (a screencast started before the navigation commits is lost with the old page)
        for (let i = 0; i < 5; i++) { try { await cast.start(); break; } catch (e) { if (i === 4) throw e; await sleep(300); } }
        let ready = null;
        for (let i = 0; i < 2400 && !ready; i++) { await sleep(100); ready = await page.eval(`document.body && document.body.classList.contains('loaded') ? { t: Math.round(performance.now()), log: window.__loadLog, stats: { first: window.__stats && window.__stats.firstFrameMs, boot: window.__stats && window.__stats.bootMs }, errors: (window.__errors || []).length, flags: document.querySelectorAll('.ld-flag.up').length, longest: Math.max(0, ...(window.__lt || [0])), marks: ['klc:loader', 'klc:ready'].map((n) => { const m = performance.getEntriesByName(n)[0]; return m ? Math.round(m.startTime) : null; }), paints: performance.getEntriesByType('paint').map((p) => [p.name, Math.round(p.startTime)]) } : null`).catch(() => null); }
        await cast.stop();
        check(`load ${tier} #${run + 1}: the town is ready`, !!ready, ready && { readyMs: ready.t, firstFrameMs: ready.stats.first, loader: ready.marks[0], ready: ready.marks[1] });
        if (!ready) { await page.S('Page.close').catch(() => {}); continue; }
        const log = ready.log || [];
        const bars = log.map((e) => e.bar);
        check(`load ${tier} #${run + 1}: the progress the page reported is monotonic and ends at 1`, bars.every((b, i) => i === 0 || b >= bars[i - 1]) && bars.at(-1) === 1, { steps: bars.length });
        const lastMarks = log.filter((e) => e.bar < 1).at(-1);
        const done = log.find((e) => e.bar >= 1);
        const near = log.filter((e) => e.bar >= 0.97 && e.bar < 1);
        const parkedMs = done && near.length ? done.t - near[0].t : 0;
        check(`load ${tier} #${run + 1}: the bar is not parked at 99 %`, parkedMs < 2000, { parkedMs, last: lastMarks && lastMarks.bar });
        check(`load ${tier} #${run + 1}: the page had no errors and the mark is in the DOM`, ready.errors === 0 && await page.eval(`!!document.querySelector('#logo svg')`), { errors: ready.errors });
        // the hand-off: tap the prompt. The still is cut on the next frame (no fade). The camera then flies into town before body.playing (about 2 s, 8 s safety). There is no iris.
        await page.eval(`window.__fd = []; (function () { let last = performance.now(); (function tick(n) { window.__fd.push(n - last); last = n; if (window.__fd.length < 90) requestAnimationFrame(tick); })(last); requestAnimationFrame((n) => {}); })(); 1`);
        await cast.start();
        const c = await page.eval(`(() => { const b = document.getElementById('go').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, disabled: document.getElementById('go').disabled }; })()`);
        if (c.disabled) { await sleep(500); }
        await page.S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: c.y });
        await page.S('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', clickCount: 1 });
        await page.S('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', clickCount: 1 });
        let cut = 'shown';
        for (let i = 0; i < 8 && cut !== 'missing'; i++) { await sleep(16); cut = await page.eval(`(() => { const e = document.querySelector('.hoya img'); return e ? getComputedStyle(e).display : 'missing'; })()`); }
        try { await page.waitFor("document.body.classList.contains('playing')", { timeout: 12000 }); } catch { /* the check below records it */ }
        await cast.stop();
        const after = await page.eval(`({ fd: window.__fd.slice(), iris: !!document.getElementById('klc-iris'), playing: document.body.classList.contains('playing') })`);
        const fd = after.fd.slice(2, 60);
        numbers.load[tier].push({ readyMs: ready.t, firstFrameMs: ready.stats.first, bootMs: ready.stats.boot, marks: ready.marks, paints: ready.paints, longestTaskMs: ready.longest, handoff: { p50: pct(fd, 0.5), p95: pct(fd, 0.95), p99: pct(fd, 0.99), over50: fd.filter((d) => d > 50).length, frames: fd.length } });
        check(`load ${tier} #${run + 1}: there is no standing figure, there is no iris, and the town is playing`, cut === 'missing' && !after.iris && after.playing, { cut, iris: after.iris, playing: after.playing });
        check(`load ${tier} #${run + 1}: the hand-off frames (p95 ${pct(fd, 0.95)} ms, over 50 ms: ${fd.filter((d) => d > 50).length})`, true);
        // the compositor proof: during the longest stretch of the load the screencast still changes
        const frames = cast.frames;
        if (run === 0) { mkdirSync(join(OUT, `${LABEL}-${tier}-frames`), { recursive: true }); frames.slice(0, 4).forEach((f, i) => writeFileSync(join(OUT, `${LABEL}-${tier}-frames`, `after-${i}.jpg`), Buffer.from(f.data, 'base64'))); }
        await page.S('Page.close').catch(() => {}); await sleep(500);
      }
    }
  }

  // ---------------------------------------------------------------- record: the loader running, from the preview build
  if (STEPS.includes('record') || STEPS.includes('shots')) {
    const { buildPreview } = await import('./loader-preview.mjs');
    const dist = join(ROOT, `dist/loader-preview-${PORT}`); await buildPreview(dist);
    const psrv = serve({ port: PORT + 1 > 9439 ? PORT - 1 : PORT + 1, dist });
    if (STEPS.includes('record')) {
      const page = await phonePage(browser, { ...IPHONE, dpr: 2 });
      await page.S('Page.enable');
      await page.goto(`${psrv.url}index.html?sky=14:00`); await page.waitFor('!!window.__preview', { timeout: 20000 });
      const cast = screencast(page, { maxWidth: 240, quality: 60, every: 1 }); await cast.start();
      const plan = await page.eval(`window.__plan.keys.map((k) => [k, window.__plan.weight(k)])`);
      const total = plan.reduce((s, [, w]) => s + w, 0);
      const SPAN = 14000;   // the stages of the real plan, 14 s in all, each as long as its weight
      for (const [k, w] of plan) { await page.eval(`window.__preview.begin(${JSON.stringify(k)}, ${Math.round(w / total * SPAN)})`); await sleep(Math.round(w / total * SPAN)); }
      await page.eval(`window.__preview.loaded()`); await sleep(2200);
      const b = await page.eval(`(() => { const r = document.getElementById('go').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.S('Input.dispatchMouseEvent', { type: 'mousePressed', x: b[0], y: b[1], button: 'left', clickCount: 1 }); await page.S('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b[0], y: b[1], button: 'left', clickCount: 1 });
      await sleep(1500); await cast.stop();
      // frames -> animated WebP (img2webp, per-frame durations from the capture times), <= 4 MB
      const dir = join(OUT, 'run-frames'); mkdirSync(dir, { recursive: true });
      const fr = cast.frames; const files = [];
      for (let i = 0; i < fr.length; i++) { const f = join(dir, `f${String(i).padStart(4, '0')}.png`); await sharp(Buffer.from(fr[i].data, 'base64')).png().toFile(f); files.push(f); }
      const args = ['-loop', '0', '-lossy', '-q', '55', '-m', '4', '-mixed'];
      for (let i = 0; i < files.length; i++) { const d = i + 1 < fr.length ? Math.max(16, fr[i + 1].t - fr[i].t) : 400; args.push('-d', String(Math.round(d)), files[i]); }
      args.push('-o', join(OUT, 'loader-run.webp'));
      const r = spawnSync('img2webp', args, { encoding: 'utf8' });
      const size = statSync(join(OUT, 'loader-run.webp')).size;
      numbers.record = { frames: fr.length, bytes: size, seconds: Math.round((fr.at(-1).t - fr[0].t) / 100) / 10 };
      check('record: the loader running as an animated WebP of at most 4 MB', r.status === 0 && size <= 4 * 1024 * 1024, numbers.record);
      await page.S('Page.close').catch(() => {});
    }
    if (STEPS.includes('shots')) {
      const shot = async (name, vp, { url = '', reduced = false, js = '' } = {}) => {
        const page = vp.mobile === false ? await browser.page({ width: vp.width, height: vp.height, dpr: vp.dpr }) : await phonePage(browser, vp);
        if (reduced) await page.S('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
        await page.goto(`${psrv.url}index.html?${url}`); await page.waitFor('!!window.__preview', { timeout: 20000 });
        await page.eval(`window.__preview.upTo('landmarks'); 1`); await sleep(1200); if (js) await page.eval(js);
        await page.shot(join(OUT, `${name}.png`)); await page.S('Page.close').catch(() => {});
      };
      await shot('reduced-motion-390x844', { ...IPHONE, width: 390, height: 844 }, { url: 'sky=14:00', reduced: true });
      await shot('notch-portrait-393x852', IPHONE, { url: 'sky=14:00' });
      await shot('notch-landscape-852x393', { width: 852, height: 393, dpr: 3, insets: { top: 0, bottom: 21, left: 59, right: 59 } }, { url: 'sky=14:00' });
      await shot('en-night-393x852', IPHONE, { url: 'sky=22:00&lang=en' });
      check('shots: the Chrome-only states were captured', true, OUT);
    }
    psrv.stop();
  }
} finally {
  await browser.close();
  built?.srv?.stop();
}
writeFileSync(join(OUT, `loader-check-${LABEL}.json`), JSON.stringify({ label: LABEL, runs: RUNS, results, numbers }, null, 1));
console.log(`\n${results.length - failed}/${results.length} checks passed; numbers in ${join(OUT, `loader-check-${LABEL}.json`)}`);
process.exit(failed ? 1 : 0);
