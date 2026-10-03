// [ship] Real-frame check (no ?shot): a URL voyage on a phone waits behind the intro card 「まちへ出る」, then boards.
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/debug/ship-intro-gate.mjs --port 8967 [--params "ship=1&auto=1"]
import { join } from 'node:path';
import { build, serve, launch, ROOT } from '../cdp.mjs';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const port = Number(arg('port', 8967)); if ([8787, 8790, 8791].includes(port)) throw new Error('port reserved');
const params = arg('params', 'ship=1&auto=1');
const dist = join(ROOT, `dist/anime-${port}-intro`);
await build({ entry: join(ROOT, 'src/anime/index.html'), outdir: dist });
const srv = serve({ port, dist });
const browser = await launch();
const out = {};
try {
  const page = await browser.page({ width: 390, height: 844, dpr: 2 });
  await page.S('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });
  await page.goto(`${srv.url}index.html?${params}&q=phone&unsafe=1&livery=fallback`);
  await page.waitFor(`document.body.classList.contains('loaded') && !!window.__voyage`, { timeout: 280000 });
  const probe = `({ playing: document.body.classList.contains('playing'), active: __voyage.active, state: __voyage.state, ui: getComputedStyle(document.getElementById('klc-ship') || document.body).display })`;
  await Bun.sleep(15000);
  out.behindIntro = await page.eval(probe);
  await page.eval(`document.getElementById('go').click()`);
  await Bun.sleep(8000);
  out.afterGo = await page.eval(probe);
  await page.shot(join(ROOT, 'shots/ship-fix1/intro_gate_after_go.png'));
  out.errors = page.errors().filter((e) => !/favicon|api\/live/.test(e.text || ''));
} finally { await browser.close(); srv.stop(); }
console.log(JSON.stringify(out));
const ok = !out.behindIntro.active && out.behindIntro.state === 'DOCKED' && out.afterGo.active;
console.log(ok ? 'RESULT: OK (nothing ran behind the intro; boarded after 「まちへ出る」)' : 'RESULT: FAIL');
if (!ok) process.exitCode = 1;
