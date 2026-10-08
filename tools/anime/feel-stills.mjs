// [feel] The 出荷前チェック's looks for the walk (CRAFT.md §8): ホヤぼーや walking in third person on an iPhone in portrait (390x844 @3) and
// landscape (844x390 @3), a 1600x900 desktop and a Retina 1440x900 @2, in Japanese and English, by day and at night, and under reduced
// motion, with the もぐる chip up once to show the credit clear of it, and the candidate places for the credit on a landscape phone. One page load per device class; small JPEGs into
// docs/play/shots/feel/stills/. Each still records his height on screen and what the credit covers (`hits`: the pad's buttons and ring, the chips, the panels, him).
//   tools/anime/gate.sh chrome --fg env -u NODE_OPTIONS bun tools/anime/feel-stills.mjs [--port 9568] [--no-build] [--only phone|desktop] [--source-css]
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { buildAndServe, launch, phonePage, setViewport, fingers, center, sleep, waitGo, ROOT } from './pad-lib.mjs';

const arg = (k, d = null) => { const i = process.argv.indexOf('--' + k); return i > 0 ? (process.argv[i + 1] ?? true) : d; };
const PORT = Number(arg('port', 9568));
const ONLY = arg('only');   // 'phone' | 'desktop': one device class only
// --source-css: the page's avatar CSS (<style id="klc-avatar-css">) is replaced by this checkout's play/avatar/index.js CSS, so a CSS-only
// change is measured exactly as it will ship without rebuilding the app (--no-build serves the last build)
const SOURCE_CSS = process.argv.includes('--source-css') ? (await import('../../src/anime/play/avatar/index.js')).CSS : null;
const OUT = join(ROOT, 'docs/play/shots/feel/stills');
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.error('[stills]', ...a);
const { srv } = process.argv.includes('--no-build') ? { srv: (await import('./cdp.mjs')).serve({ port: PORT, dist: join(ROOT, `dist/anime-${PORT}`) }) } : await buildAndServe(PORT);
const browser = await launch({ quiet: true });
const report = { at: new Date().toISOString(), stills: [] };

async function enter(page, phone) {
  await page.goto(`${srv.url}index.html?lang=ja`);
  await page.waitFor("document.body.classList.contains('loaded')", { timeout: 280000 });
  if (phone) { const f = fingers(page); await waitGo(page); const g = await center(page, '#go'); await f.tap(g.x, g.y); } else { await waitGo(page); await page.eval("document.getElementById('go').click()"); };
  await page.waitFor("document.body.classList.contains('playing')", { timeout: 30000 });
  await page.waitFor('!window.__ctx.services.life?.tour?.flying', { timeout: 30000 }).catch(() => {});
}
/** In the page: every HUD piece ホヤぼーや's credit must never cover, by name (the pad's buttons and stick ring, the chips, the panels),
 *  him (his projected box: soles to knob tops, 0.55 m either side across the view), the credit's rect and what it hits. */
const SCENE_JS = `
  const c = window.__ctx, cam = c.camera; let root = null; c.scene.traverse((o) => { if (o.name === 'hoya3d' && o.visible) root = o; });
  const R = (e) => { if (!e || e.closest('[hidden]')) return null; const st = getComputedStyle(e); if (st.display === 'none' || st.visibility === 'hidden') return null;
    const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 ? { l: +b.left.toFixed(1), t: +b.top.toFixed(1), r: +b.right.toFixed(1), b: +b.bottom.toFixed(1) } : null; };
  const hit = (a, b) => !!(a && b && a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t);
  const obs = {};
  const add = (name, sel) => [...document.querySelectorAll(sel)].map(R).filter(Boolean).forEach((r, i) => { obs[name + (i ? i + 1 : '')] = r; });
  add('brand', '#klc-ui .brand'); add('tools', '#klc-ui .tools'); add('places', '#klc-ui .places'); add('dock', '#klc-ui .dock'); add('attr', '#klc-ui .attr');
  add('livebar', '#klc-ui .livebar'); add('mini', '#klc-x .mini'); add('xbar', '#klc-x .xbar'); add('xdrive', '#klc-x .xdrive');
  add('btn', '#klc-pad .cluster .btn:not([data-show="0"])'); add('ring', '#klc-pad .ghost'); add('padchip', '#klc-pad .chip'); add('gear', '#klc-pad .gear');
  add('dive', '.swim-dive'); add('prompt', '#klc-play .prompt');
  if (root) {
    const p = root.getWorldPosition(new THREE.Vector3()), side = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).setY(0).normalize();
    const pts = [[0, 0], [0, 1.1], [0.55, 0.55], [-0.55, 0.55]].map(([s, y]) => { const v = p.clone().addScaledVector(side, s).setY(p.y + y).project(cam); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; });
    obs.him = { l: +Math.min(...pts.map((q) => q[0])).toFixed(1), r: +Math.max(...pts.map((q) => q[0])).toFixed(1), t: +Math.min(...pts.map((q) => q[1])).toFixed(1), b: +Math.max(...pts.map((q) => q[1])).toFixed(1) };
  }
  const credit = R(document.querySelector('#klc-play .hoya-credit'));
  const hits = Object.keys(obs).filter((k) => hit(credit, obs[k]));
`;
/** A walk pose at the hero spot, a short walk so the camera settles behind him, then the still and its numbers. */
async function still(page, name, { walk = true, dive = false, dump = false } = {}) {
  if (SOURCE_CSS && !(await page.eval(`(() => { const st = document.getElementById('klc-avatar-css'); if (st && st.textContent !== ${JSON.stringify(SOURCE_CSS)}) st.textContent = ${JSON.stringify(SOURCE_CSS)}; return !!st; })()`))) throw new Error('--source-css: no #klc-avatar-css in the page');
  await page.eval("window.__camSpec('walk')"); await sleep(500);
  if (walk) {
    const K = { code: 'KeyW', key: 'w', windowsVirtualKeyCode: 87, nativeVirtualKeyCode: 87 };
    await page.S('Input.dispatchKeyEvent', { type: 'keyDown', ...K }); await sleep(700); await page.S('Input.dispatchKeyEvent', { type: 'keyUp', ...K });
  }
  await page.eval(`(() => { let d = document.querySelector('.swim-dive'); if (${dive} && !d) { const ui = document.createElement('div'); ui.className = 'swim-ui'; ui.id = 'feel-swim-ui'; d = document.createElement('button'); d.className = 'swim-dive'; d.textContent = 'もぐる'; ui.appendChild(d); document.body.appendChild(ui); } if (d) d.hidden = ${!dive}; })()`);
  await sleep(900);
  const info = await page.eval(`(() => { ${SCENE_JS}
    let share = null;
    if (root) { const v = new THREE.Vector3(root.position.x, root.position.y, root.position.z).project(cam).y, w = new THREE.Vector3(root.position.x, root.position.y + 1.1, root.position.z).project(cam).y; share = +((w - v) / 2).toFixed(3); }
    return { w: innerWidth, h: innerHeight, share, drawn: !!root, credit: !!credit, creditRect: credit, hits, creditClear: !!credit && hits.length === 0,
      lang: document.querySelector('[data-act="lang"]')?.textContent.trim() === 'EN' ? 'ja' : 'en'${dump ? ', obs' : ''} };
  })()`);
  const png = join(OUT, name + '.png'), jpg = join(OUT, name + '.jpg');
  await page.shot(png);
  spawnSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '70', '-Z', '960', png, '--out', jpg], { stdio: 'ignore' });
  spawnSync('rm', ['-f', png]);
  await page.eval("(() => { document.getElementById('feel-swim-ui')?.remove(); const d = document.querySelector('.swim-dive'); if (d) d.hidden = true; })()");
  const row = { name, ...info, file: jpg.replace(ROOT + '/', '') };
  report.stills.push(row); log(JSON.stringify(row));
}
/** A landscape phone: where can the credit sit? Each candidate (the exact rule a commit would carry) is put in the page in turn and
 *  measured against every HUD piece and him, with and without もぐる up. */
const LAND = '@media (orientation: landscape) and (max-height: 520px)';
const SPOTS = {
  'corner-br': 'left: auto; right: calc(12px + env(safe-area-inset-right, 0px)); top: auto; bottom: calc(24px + env(safe-area-inset-bottom, 0px)); transform: none;',
  'right-mid': 'left: auto; right: calc(14px + env(safe-area-inset-right, 0px)); bottom: auto; top: calc(112px + env(safe-area-inset-top, 0px)); transform: none;',
  'left-top': 'right: auto; left: calc(14px + env(safe-area-inset-left, 0px)); bottom: auto; top: calc(78px + env(safe-area-inset-top, 0px)); transform: none;',
  'centre-top': 'right: auto; left: 50%; transform: translateX(-50%); bottom: auto; top: calc(134px + env(safe-area-inset-top, 0px));',
  'bottom-left': 'right: auto; left: calc(14px + env(safe-area-inset-left, 0px)); top: auto; bottom: calc(24px + env(safe-area-inset-bottom, 0px)); transform: none;',
};
async function spots(page) {
  const set = (css) => page.eval(`(() => { let s = document.getElementById('feel-spot'); if (!s) { s = document.createElement('style'); s.id = 'feel-spot'; document.head.appendChild(s); } s.textContent = ${JSON.stringify(css)}; })()`);
  let first = true;
  for (const [name, css] of Object.entries(SPOTS)) {
    await set(`${LAND} { body.klc-pad #klc-play .hoya-credit { ${css} } }`);
    await still(page, 'phone-land-spot-' + name, { walk: false, dump: first });
    await still(page, 'phone-land-spot-' + name + '-moguru', { walk: false, dive: true });
    first = false;
  }
  await page.eval("document.getElementById('feel-spot')?.remove()");
}
// the HUD's language: its button offers the other one (EN in Japanese, 日本語 in English); <html lang> does not follow it
const lang = (page, to) => page.eval(`(async () => {
  const cur = () => (document.querySelector('[data-act="lang"]')?.textContent.trim() === 'EN' ? 'ja' : 'en');
  if (cur() !== ${JSON.stringify(to)}) { document.querySelector('[data-act="lang"]')?.click(); await new Promise((r) => setTimeout(r, 400)); }
  return cur();
})()`);
const night = (page, on) => page.eval(`(() => { try { window.__lifeSet(${JSON.stringify(on ? 'yoru' : 'hiru')}); } catch (e) {} })()`);

report.css = SOURCE_CSS ? 'this checkout\'s play/avatar/index.js (--source-css)' : 'the build';
let ph = null, dk = null;
try {
  if (ONLY !== 'desktop') {
  // the phone: portrait, landscape, English, night, reduced motion
  ph = await phonePage(browser, { width: 390, height: 844, dpr: 3 });
  await enter(ph, true);
  await still(ph, 'phone-ja-day', { dump: true });
  await still(ph, 'phone-ja-day-moguru', { dive: true });
  await lang(ph, 'en'); await still(ph, 'phone-en-day'); await lang(ph, 'ja');
  await night(ph, true); await still(ph, 'phone-ja-night'); await night(ph, false);
  await ph.S('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await still(ph, 'phone-ja-reduced');
  await ph.S('Emulation.setEmulatedMedia', { features: [] });
  await setViewport(ph, { width: 844, height: 390, dpr: 3 }); await sleep(1200);
  await still(ph, 'phone-land-ja-day', { dump: true });
  await still(ph, 'phone-land-ja-day-moguru', { walk: false, dive: true });
  await spots(ph);
  }
  if (ONLY !== 'phone') {
  // desktops
  dk = await browser.page({ width: 1600, height: 900, dpr: 1 });
  await enter(dk, false);
  await still(dk, 'desktop-ja-day', { dump: true });
  await still(dk, 'desktop-ja-day-moguru', { dive: true });
  await lang(dk, 'en'); await night(dk, true); await still(dk, 'desktop-en-night'); await night(dk, false); await lang(dk, 'ja');
  await dk.S('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false, screenWidth: 1440, screenHeight: 900 }); await sleep(1200);
  await still(dk, 'retina-ja-day');
  }
  report.errors = [...(ph ? ph.errors() : []), ...(dk ? dk.errors() : [])].filter((e) => !String(e.text).includes('/api/live')).map((e) => e.text.slice(0, 200));
} finally {
  await browser.close(); srv.stop();
}
writeFileSync(join(OUT, ONLY ? `stills-${ONLY}.json` : 'stills.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
