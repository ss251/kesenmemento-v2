// [play] The kit over the real HUD (not shot mode, where #klc-ui is never mounted): enter the town in Chrome as an iPhone
// (393x852 @3, touch) and on a desktop (1440x900), then report every overlap between the kit's chrome (あそぶ, 手帳, the chips, the
// actions) and the HUD's panels and the touch pad, with a screenshot of each.
//   tools/anime/gate.sh chrome --fg env -u NODE_OPTIONS KLC_E2E_PORT=9466 bun tools/anime/play-v-hud.mjs
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { buildAndServe, launch, phonePage, enterTown, sleep, ROOT } from './pad-lib.mjs';

const PORT = Number(process.env.KLC_E2E_PORT || 9466);
if (PORT < 9465 || PORT > 9469) throw new Error('play-kit ports are 9465-9469');
const out = join(ROOT, 'docs/play/shots/play-kit');
const log = (...a) => console.error('[vhud]', ...a);

const OVERLAP = `(() => {
  const vis = (e) => { const b = e.getBoundingClientRect(); const s = getComputedStyle(e); return b.width > 1 && b.height > 1 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.01; };
  const R = (e) => { const b = e.getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) }; };
  const grab = (o, name, sel) => document.querySelectorAll(sel).forEach((e, i) => { if (vis(e)) o[name + (i ? i : '')] = R(e); });
  const kit = {};
  grab(kit, 'pill', '#klc-play .play-btn'); grab(kit, 'book', '#klc-play .book'); grab(kit, 'chip', '#klc-play .counter');
  grab(kit, 'act', '#klc-play .cluster .act'); grab(kit, 'label', '#klc-play .cluster .lb');
  const hud = {};
  for (const [n, s] of [['brand', '#klc-ui .brand'], ['tools', '#klc-ui .tools'], ['places', '#klc-ui .places'], ['dock', '#klc-ui .dock'], ['pbar', '#klc-ui .pbar'],
    ['mbtn', '#klc-ui .mbtn'], ['attr', '#klc-ui .attr'], ['arrivals', '#klc-ui .arrivals'], ['toast', '#toast'], ['note', '#klc-ui .note'], ['mini', '#klc-x .mini'], ['xbar', '#klc-x .xbar']]) grab(hud, n, s);
  document.querySelectorAll('#klc-pad .cluster .btn').forEach((e) => { if (e.dataset.show !== '0' && vis(e)) hud['pad:' + e.dataset.id] = R(e); });
  for (const [n, s] of [['pad:chip', '#klc-pad .topbar .chip'], ['pad:gear', '#klc-pad .gear']]) grab(hud, n, s);
  const g = document.querySelector('#klc-pad .ghost'); if (g && vis(g)) hud['pad:stick'] = R(g);
  const hits = [];
  for (const [a, p] of Object.entries(kit)) for (const [b, q] of Object.entries(hud)) {
    if (p.l < q.r - 0.5 && p.r > q.l + 0.5 && p.t < q.b - 0.5 && p.b > q.t + 0.5) hits.push(a + ' x ' + b + ' ' + JSON.stringify(p) + ' ' + JSON.stringify(q));
  }
  return { kit, hud, hits, w: innerWidth, h: innerHeight };
})()`;

const ACTIONS = `window.__play.ui.actions([
  { id: 'cast', icon: 'pole', label: '竿を出す', key: 'Space', primary: true, onPress() {} },
  { id: 'bait', icon: 'bait', label: '撒き餌', key: 'E', onPress() {} },
  { id: 'spray', icon: 'spray', label: '散水', key: 'R', onPress() {} },
  { id: 'quit', icon: 'back', label: 'やめる', key: 'Escape', onPress() {} },
]); 1`;

function jpg(png, file) {
  const r = Bun.spawnSync(['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '72', '--resampleWidth', '1440', png, '--out', file]);
  rmSync(png, { force: true });
  if (r.exitCode !== 0) throw new Error('sips ' + r.stderr.toString().slice(0, 200));
}

const { srv } = await buildAndServe(PORT);
const browser = await launch();
const report = {};
let bad = 0;
try {
  const url = `http://127.0.0.1:${PORT}/index.html?lang=ja`;
  const ph = await phonePage(browser, { width: 393, height: 852, dpr: 3 });
  await enterTown(ph, url);
  await sleep(1800);
  await ph.frames(6);
  report.phone = await ph.eval(OVERLAP);
  await ph.eval(ACTIONS);
  await ph.frames(4);
  report.phoneActions = await ph.eval(OVERLAP);
  let png = join(out, 'v-real-phone.png');
  await ph.shot(png);
  jpg(png, join(out, 'v-after-phone-ja-realhud.jpg'));
  report.phoneErrors = ph.errors().map((l) => String(l.text || '').slice(0, 200)).slice(0, 6);

  const dk = await browser.page({ width: 1440, height: 900, dpr: 1 });
  await dk.goto(url);
  await dk.waitFor("document.body.classList.contains('loaded')", { timeout: 280000 });
  await dk.eval("document.getElementById('go').click(); 1");
  await dk.waitFor("document.body.classList.contains('playing')", { timeout: 20000 });
  await sleep(1800);
  await dk.frames(6);
  report.desktop = await dk.eval(OVERLAP);
  await dk.eval(ACTIONS);
  await dk.frames(4);
  report.desktopActions = await dk.eval(OVERLAP);
  png = join(out, 'v-real-desktop.png');
  await dk.shot(png);
  jpg(png, join(out, 'v-after-desktop-ja-realhud.jpg'));
  report.desktopErrors = dk.errors().map((l) => String(l.text || '').slice(0, 200)).slice(0, 6);
} finally {
  try { await browser.close(); } catch { /* */ }
  try { srv.stop(); } catch { /* */ }
}
for (const k of ['phone', 'phoneActions', 'desktop', 'desktopActions']) {
  const r = report[k];
  bad += r.hits.length;
  log(k, r.w + 'x' + r.h, 'kit', Object.keys(r.kit).join(','), '| hud', Object.keys(r.hud).join(','));
  for (const h of r.hits) log('  OVERLAP', h);
}
log('errors', JSON.stringify({ phone: report.phoneErrors, desktop: report.desktopErrors }));
log(bad ? `${bad} overlaps` : 'no overlaps');
process.exit(bad ? 1 : 0);
