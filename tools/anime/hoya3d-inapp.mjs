// [hoya-accuracy] ホヤぼーや in the real app, as a visitor sees him: the town, the chase camera, the stick or the keys.
// The sizes and states of docs/CRAFT.md §8 (出荷前チェック): iPhone portrait 393x852 @3 and landscape 852x393, desktop
// 1600x900 and Retina (@2); day and night; reduced motion. Also the frame times while he walks, and the console errors.
// Always through the gate (it launches Chrome):
//   tools/anime/gate.sh chrome --fg env -u NODE_OPTIONS bun tools/anime/hoya3d-inapp.mjs [--port 9555] [--out DIR] [--prefix v2-inapp-]
// The frames are the app's own render (no city art); the app keeps its on-screen credit while he is shown.
import { join, resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildAndServe, launch, phonePage, setViewport, enterTown, center, sleep, ROOT } from './pad-lib.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const PORT = Number(opt('port', 9555));
const OUT = resolve(ROOT, opt('out', 'docs/play/shots/hoya3d'));
const PREFIX = opt('prefix', 'v2-inapp-');
mkdirSync(OUT, { recursive: true });
const NOISE = /api\/live|ERR_CERT_VERIFIER_CHANGED|fonts\.gstatic/;

const { srv } = await buildAndServe(PORT);
const base = `${String(srv.url).replace(/\/$/, '')}/index.html?hoya3d=1`;
const browser = await launch();
const report = { shots: [], frames: null, errors: {}, notes: [] };

async function shot(page, name) {
  await sleep(150);
  const { data } = await page.S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(join(OUT, PREFIX + name + '.png'), Buffer.from(data, 'base64'));
  const st = await page.eval(`(() => { const p = window.__ctx.playerObj, a = window.__ctx.services.play?.avatar;
    return { lang: document.documentElement.lang, person: p.person, fly: p.fly, x: +p.pos.x.toFixed(1), z: +p.pos.z.toFixed(1), model: typeof a?.model === 'function' ? a.model() : (a?.model ?? null) }; })()`).catch(() => null);
  // where he stands on screen: his feet and the top of his head (1.10 m) through the camera, in CSS px; share = his height / the screen's
  const fig = await page.eval(`(() => { const T = window.THREE, c = window.__ctx, r = c.scene.getObjectByName('hoya3d'); if (!r || !r.visible) return null;
    const cam = c.camera, p = new T.Vector3(); r.getWorldPosition(p); const q = p.clone(); q.y += 1.10;
    const a = p.clone().project(cam), b = q.clone().project(cam), W = innerWidth, H = innerHeight;
    const sx = (v) => (v.x + 1) / 2 * W, sy = (v) => (1 - v.y) / 2 * H;
    return { x: +sx(a).toFixed(1), feet: +sy(a).toFixed(1), head: +sy(b).toFixed(1), share: +((sy(a) - sy(b)) / H).toFixed(3), dist: +p.distanceTo(cam.position).toFixed(2), dpr: devicePixelRatio }; })()`).catch(() => null);
  report.shots.push({ name, st, fig });
}
/** On foot after the opening drone, as mobile-pad.e2e does it (__camSpec('walk')); on a phone the first-run coach mark is
 *  closed with its own OK button, so it is not in the frames. */
async function onFoot(page, f) {
  await page.waitFor('!(window.__ctx.services.life?.tour || window.__life?.tour)?.flying', { timeout: 40000 }).catch(() => {});
  await page.eval("window.__camSpec('walk')");
  if (f) {
    await page.waitFor('!window.__pad.hidden', { timeout: 20000 }).catch(() => {});
    await sleep(800);
    const coach = await page.eval("(() => { const c = document.querySelector('#klc-pad .coach'); return !!c && !c.hidden; })()").catch(() => false);
    if (coach) {
      const ok = await center(page, '#klc-pad .coach .ok');
      if (ok) await f.tap(ok.x, ok.y);
      await page.waitFor("document.querySelector('#klc-pad .coach').hidden", { timeout: 4000 }).catch(() => {});
    }
  }
  await sleep(600);
}
const hours = (page, h) => page.eval(`window.__setHours(${h})`);   // main.js: the time service's setHours(h, { pin: true })
function keyboard(page) {
  const VK = { KeyW: [87, 'w'], KeyD: [68, 'd'], KeyF: [70, 'f'] };
  const send = (type, code) => page.S('Input.dispatchKeyEvent', { type, code, key: VK[code][1], windowsVirtualKeyCode: VK[code][0], nativeVirtualKeyCode: VK[code][0] });
  return { down: (c) => send('keyDown', c), up: (c) => send('keyUp', c) };
}
/** rAF intervals for ms milliseconds: p50 / p95 / p99 and the hitches over 50 ms. */
const frameTimes = (page, ms) => page.eval(`new Promise((done) => { const d = []; let last = performance.now(); const t0 = last;
  const tick = (t) => { d.push(t - last); last = t; if (t - t0 < ${ms}) requestAnimationFrame(tick); else { d.sort((a, b) => a - b); const q = (p) => +d[Math.min(d.length - 1, Math.floor(p * d.length))].toFixed(1);
    done({ n: d.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), over50: d.filter((x) => x > 50).length }); } };
  requestAnimationFrame(tick); })`);

try {
  // ---- iPhone portrait 393 x 852 @3, then landscape 852 x 393: the stick
  {
    const page = await phonePage(browser, { width: 393, height: 852, dpr: 3 });
    const f = await enterTown(page, base);
    await onFoot(page, f);
    await hours(page, 10); await sleep(3500);
    await shot(page, 'phone-day-stand');
    const x0 = 90, y0 = 568, T = 56;
    await f.down1(1, x0, y0); await f.drag(1, x0, y0 - 0.8 * T, 4); await sleep(400);
    report.frames = await frameTimes(page, 3000);   // while he walks away from the camera
    for (let i = 0; i < 3; i++) { await sleep(220); await shot(page, 'phone-day-walk-' + i); }
    await f.drag(1, x0, y0 - 70, 3); await sleep(700);   // past 85 % of the travel: the run (as mobile-pad.e2e)
    for (let i = 0; i < 2; i++) { await sleep(200); await shot(page, 'phone-day-run-' + i); }
    await f.drag(1, x0, y0 - 0.8 * T, 3); await sleep(500);
    await f.drag(1, x0 + 0.8 * T, y0, 4);            // across: his profile, the face view
    for (let i = 0; i < 3; i++) { await sleep(260); await shot(page, 'phone-day-across-' + i); }
    await f.drag(1, x0, y0 + 0.8 * T, 4);            // toward the camera
    for (let i = 0; i < 2; i++) { await sleep(300); await shot(page, 'phone-day-toward-' + i); }
    await f.up(1); await sleep(1400);
    await shot(page, 'phone-day-stop');
    await hours(page, 22); await sleep(2500);
    await shot(page, 'phone-night-stand');
    await f.down1(1, x0, y0); await f.drag(1, x0, y0 - 0.8 * T, 4);
    await sleep(500); await shot(page, 'phone-night-walk');
    await f.up(1); await sleep(800);
    await hours(page, 10); await setViewport(page, { width: 852, height: 393, dpr: 3 }); await sleep(2500);
    await shot(page, 'phone-landscape-day');
    report.errors.phone = page.errors().filter((e) => !NOISE.test(e.text)).map((e) => e.text.slice(0, 200));
  }
  // ---- desktop 1600 x 900, then Retina (@2): the keys
  {
    const page = await browser.page({ width: 1600, height: 900, dpr: 1 });
    await enterTown(page, base, { tap: false });
    const k = keyboard(page);
    await onFoot(page, null);
    await hours(page, 10); await sleep(3500);
    await shot(page, 'desktop-day-stand');
    await k.down('KeyW'); await sleep(900); await shot(page, 'desktop-day-walk');
    await k.down('KeyD'); await sleep(700); await shot(page, 'desktop-day-turn'); await k.up('KeyD');
    await k.up('KeyW'); await sleep(1200);
    // the other language for the Retina frames (the HUD's own 日本語 / English button; each shot records the page's lang)
    await page.eval(`(() => { const b = document.querySelector('[data-act="lang"]'); if (b) b.click(); return !!b; })()`); await sleep(600);
    await page.S('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 2, mobile: false });
    await sleep(2000); await shot(page, 'desktop-retina-day');
    await hours(page, 22); await sleep(2500); await shot(page, 'desktop-retina-night');
    report.errors.desktop = page.errors().filter((e) => !NOISE.test(e.text)).map((e) => e.text.slice(0, 200));
  }
  // ---- reduced motion (the model is built calm: no blink, a calmer bob and flutter)
  {
    const page = await phonePage(browser, { width: 393, height: 852, dpr: 3 });
    await page.S('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    const f = await enterTown(page, base);
    await onFoot(page, f);
    await hours(page, 10); await sleep(3000);
    await f.down1(1, 90, 568); await f.drag(1, 90, 568 - 45, 4); await sleep(700);
    await shot(page, 'phone-reduced-walk');
    await f.up(1);
    report.errors.reduced = page.errors().filter((e) => !NOISE.test(e.text)).map((e) => e.text.slice(0, 200));
  }
} catch (e) {
  report.notes.push('stopped: ' + String(e?.message || e).slice(0, 300));
} finally {
  await browser.close().catch(() => {});
  srv.stop?.();
}
console.log(JSON.stringify(report, null, 1));
