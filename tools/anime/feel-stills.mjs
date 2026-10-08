// [feel] The 出荷前チェック's looks for the walk (CRAFT.md §8): ホヤぼーや walking in third person on an iPhone in portrait (390x844 @3) and
// landscape (844x390 @3), a 1600x900 desktop and a Retina 1440x900 @2, in Japanese and English, by day and at night, and under reduced
// motion, with the もぐる chip up once to show the credit clear of it. One page load per device class; small JPEGs into
// docs/play/shots/feel/stills/. Each still records his height on screen and whether the credit is uncovered.
//   tools/anime/gate.sh chrome --fg env -u NODE_OPTIONS bun tools/anime/feel-stills.mjs [--port 9568] [--no-build]
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { buildAndServe, launch, phonePage, setViewport, fingers, center, sleep, ROOT } from './pad-lib.mjs';

const arg = (k, d = null) => { const i = process.argv.indexOf('--' + k); return i > 0 ? (process.argv[i + 1] ?? true) : d; };
const PORT = Number(arg('port', 9568));
const OUT = join(ROOT, 'docs/play/shots/feel/stills');
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.error('[stills]', ...a);
const { srv } = process.argv.includes('--no-build') ? { srv: (await import('./cdp.mjs')).serve({ port: PORT, dist: join(ROOT, `dist/anime-${PORT}`) }) } : await buildAndServe(PORT);
const browser = await launch({ quiet: true });
const report = { at: new Date().toISOString(), stills: [] };

async function enter(page, phone) {
  await page.goto(`${srv.url}index.html?lang=ja`);
  await page.waitFor("document.body.classList.contains('loaded')", { timeout: 280000 });
  if (phone) { const f = fingers(page); const g = await center(page, '#go'); await f.tap(g.x, g.y); } else await page.eval("document.getElementById('go').click()");
  await page.waitFor("document.body.classList.contains('playing')", { timeout: 30000 });
  await page.waitFor('!window.__ctx.services.life?.tour?.flying', { timeout: 30000 }).catch(() => {});
}
/** A walk pose at the hero spot, a short walk so the camera settles behind him, then the still and its numbers. */
async function still(page, name, { walk = true, dive = false } = {}) {
  await page.eval("window.__camSpec('walk')"); await sleep(500);
  if (walk) {
    const K = { code: 'KeyW', key: 'w', windowsVirtualKeyCode: 87, nativeVirtualKeyCode: 87 };
    await page.S('Input.dispatchKeyEvent', { type: 'keyDown', ...K }); await sleep(700); await page.S('Input.dispatchKeyEvent', { type: 'keyUp', ...K });
  }
  await page.eval(`(() => { let d = document.querySelector('.swim-dive'); if (${dive} && !d) { const ui = document.createElement('div'); ui.className = 'swim-ui'; ui.id = 'feel-swim-ui'; d = document.createElement('button'); d.className = 'swim-dive'; d.textContent = 'もぐる'; ui.appendChild(d); document.body.appendChild(ui); } if (d) d.hidden = ${!dive}; })()`);
  await sleep(900);
  const info = await page.eval(`(() => {
    const c = window.__ctx, cam = c.camera; let root = null; c.scene.traverse((o) => { if (o.name === 'hoya3d' && o.visible) root = o; });
    const R = (e) => { if (!e || e.hidden) return null; const b = e.getBoundingClientRect(); return b.width > 0 ? { l: b.left, t: b.top, r: b.right, b: b.bottom } : null; };
    const hit = (a, b) => !!(a && b && a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t);
    let share = null;
    if (root) { const v = new THREE.Vector3(root.position.x, root.position.y, root.position.z).project(cam).y, w = new THREE.Vector3(root.position.x, root.position.y + 1.1, root.position.z).project(cam).y; share = +((w - v) / 2).toFixed(3); }
    const credit = R(document.querySelector('#klc-play .hoya-credit')), dive = R(document.querySelector('.swim-dive')), prompt = R(document.querySelector('#klc-play .prompt'));
    return { w: innerWidth, h: innerHeight, share, drawn: !!root, credit: !!credit, creditClear: !!credit && !hit(credit, dive) && !hit(credit, prompt), lang: document.documentElement.lang };
  })()`);
  const png = join(OUT, name + '.png'), jpg = join(OUT, name + '.jpg');
  await page.shot(png);
  spawnSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '70', '-Z', '960', png, '--out', jpg], { stdio: 'ignore' });
  spawnSync('rm', ['-f', png]);
  await page.eval("document.getElementById('feel-swim-ui')?.remove(); const d = document.querySelector('.swim-dive'); if (d) d.hidden = true;");
  const row = { name, ...info, file: jpg.replace(ROOT + '/', '') };
  report.stills.push(row); log(JSON.stringify(row));
}
const lang = (page, to) => page.eval(`(() => { if (document.documentElement.lang !== ${JSON.stringify(to)}) document.querySelector('[data-act="lang"]')?.click(); return document.documentElement.lang; })()`);
const night = (page, on) => page.eval(`(() => { try { window.__lifeSet(${JSON.stringify(on ? 'yoru' : 'hiru')}); } catch (e) {} })()`);

try {
  // the phone: portrait, landscape, English, night, reduced motion
  const ph = await phonePage(browser, { width: 390, height: 844, dpr: 3 });
  await enter(ph, true);
  await still(ph, 'phone-ja-day');
  await still(ph, 'phone-ja-day-moguru', { dive: true });
  await lang(ph, 'en'); await still(ph, 'phone-en-day'); await lang(ph, 'ja');
  await night(ph, true); await still(ph, 'phone-ja-night'); await night(ph, false);
  await ph.S('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await still(ph, 'phone-ja-reduced');
  await ph.S('Emulation.setEmulatedMedia', { features: [] });
  await setViewport(ph, { width: 844, height: 390, dpr: 3 }); await sleep(1200);
  await still(ph, 'phone-land-ja-day');
  // desktops
  const dk = await browser.page({ width: 1600, height: 900, dpr: 1 });
  await enter(dk, false);
  await still(dk, 'desktop-ja-day');
  await still(dk, 'desktop-ja-day-moguru', { dive: true });
  await lang(dk, 'en'); await night(dk, true); await still(dk, 'desktop-en-night'); await night(dk, false); await lang(dk, 'ja');
  await dk.S('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false, screenWidth: 1440, screenHeight: 900 }); await sleep(1200);
  await still(dk, 'retina-ja-day');
  report.errors = [...ph.errors(), ...dk.errors()].filter((e) => !String(e.text).includes('/api/live')).map((e) => e.text.slice(0, 200));
} finally {
  await browser.close(); srv.stop();
}
writeFileSync(join(OUT, 'stills.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
