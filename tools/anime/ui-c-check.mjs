// [ui-c] Gated browser checks for the ui-c rows (the UI round notes (ui-c, not included)): each step is one row's "Verify" column, run against a private
// build in headless Chrome. A script, not a bun:test file: with Bun 1.3.14 `bun test` closes the stderr pipe of every Bun.spawn child at
// once, so tools/anime/cdp.mjs launch() cannot start Chrome from inside the test runner (the KLC_E2E=1 files skip for the same reason).
//
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/ui-c-check.mjs [--port 9410] [--steps dbg,survive,flight] [--out DIR] [--nobuild] [--dist DIR]
//   (--nobuild serves dist/anime-<port> as it is; --dist DIR serves another build, e.g. `bun run build`'s minified dist/, to check the production bundle)
//
//   dbg      row 1: the ?dbg=1 strip: real numbers on a desktop and on an iPhone-shaped page, off without the flag, one more script request with it
//   survive  row 10: on the phone tier, WEBGL_lose_context -> the reload card and a stopped frame loop, restore -> a reload, the pose / time / season back,
//            a working frame loop; a touch resumes a suspended AudioContext (and does not undo a mute); the reload-loop guard and the button
//   loss-probe  an observation, not a check: lose and restore the WebGL context on the phone tier and report what the page does in the next seconds
//            (run it on any build: --steps loss-probe --label before|after; a build without row 10 keeps a flat scene and a frame loop that throws)
//   flight   row 3: in the real app (the town, the player, the explore places): a pick moves the camera >20 m in 100 ms, the view never whips, the speed
//            survives a retarget, skip() finishes a flight, the auto tour keeps its length; frames of a flight (--out)
//
// Port 9410-9414 only (this lane's). --out DIR writes the numbers (ui-c-check-<steps>.json) and the small clip screenshots there. Exit code 1 if any check fails.
// launch().close() kills the main Chrome process with SIGKILL and its helper processes (GPU, renderer, network) can outlive it: the script sweeps the ones of its own profile at the end.
import { join } from 'node:path';
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { buildAndServe, launch, phonePage, setViewport, fingers, sleep, ROOT } from './pad-lib.mjs';
import { serve } from './cdp.mjs';

const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : '1') : d; };
const PORT = Number(arg('port', 9410));
if (PORT < 9410 || PORT > 9414) throw new Error('ports 9410-9414 only (this lane\'s)');
const STEPS = String(arg('steps', 'dbg,survive,flight')).split(',').map((s) => s.trim()).filter(Boolean);
const OUT = arg('out', '');
if (OUT) mkdirSync(OUT, { recursive: true });

// ------------------------------------------------------------------ a tiny assertion harness
const results = [];
let failed = 0;
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, ...(detail !== undefined && { detail }) });
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? '   ' + JSON.stringify(detail) : ''}`);
  return !!ok;
}
const equal = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got) === JSON.stringify(want) ? undefined : { got, want });
const matches = (name, got, re) => check(name, re.test(String(got)), re.test(String(got)) ? undefined : { got: String(got).slice(0, 300), want: String(re) });
const save = (name, obj) => { if (OUT) writeFileSync(join(OUT, name), JSON.stringify(obj, null, 1)); };
const closePage = (page) => page.S('Page.close').catch(() => {});
/** Console errors and exceptions of the page, less the static server's 404 for /api/live (the app falls back to its saved sample). */
const pageErrors = (page) => page.errors().map((e) => e.text).filter((t) => !/\/api\/live/.test(t));
const waitLoaded = (page, timeout = 300000) => page.waitFor("document.body.classList.contains('loaded')", { timeout });
const enter = async (page) => { await page.eval("document.getElementById('go').click()"); await page.waitFor("document.body.classList.contains('playing')", { timeout: 20000 }); };
/** A small PNG of one element's box (plus a margin). */
async function clipShot(page, sel, file) {
  if (!OUT) return;
  const r = await page.eval(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: Math.max(0, b.left - 4), y: Math.max(0, b.top - 4), width: b.width + 8, height: b.height + 8 }; })()`);
  const { data } = await page.S('Page.captureScreenshot', { format: 'png', clip: { ...r, scale: 1 } });
  writeFileSync(join(OUT, file), Buffer.from(data, 'base64'));
}
const jsRequests = (page) => page.eval(`performance.getEntriesByType('resource').map((r) => r.name).filter((n) => /\\.js(\\?|$)/.test(n)).map((n) => n.split('/').pop().split('?')[0])`);

// ------------------------------------------------------------------ row 1: the ?dbg=1 strip
async function stepDbg(ctx) {
  const { browser, srv, dist } = ctx;
  const files = readdirSync(dist).filter((f) => f.endsWith('.js'));
  const dbgChunk = files.find((f) => readFileSync(join(dist, f), 'utf8').includes('klc-dbg'));
  const entryJs = [...readFileSync(join(dist, 'index.html'), 'utf8').matchAll(/src="\.\/([^"]+\.js)"/g)].map((m) => m[1]);
  check('dbg: the strip lives in a chunk of its own (not the entry script, not any chunk the app always loads)', !!dbgChunk && !entryJs.includes(dbgChunk)
    && files.filter((f) => f !== dbgChunk).every((f) => !readFileSync(join(dist, f), 'utf8').includes('klc-dbg')), { dbgChunk, entryJs });

  // off without the flag
  let page = await browser.page({ width: 1280, height: 720, dpr: 1 });
  await page.goto(`${srv.url}index.html?fixtures=1`);
  await waitLoaded(page);
  equal('dbg: off without the flag, no #klc-dbg element', await page.eval("document.getElementById('klc-dbg') === null"), true);
  const offJs = await jsRequests(page);
  check('dbg: off without the flag, its chunk is never requested', !offJs.includes(dbgChunk), { scripts: offJs.length });
  equal('dbg: off, no page errors', pageErrors(page), []);
  await closePage(page);

  // on, desktop
  page = await browser.page({ width: 1280, height: 720, dpr: 1 });
  await page.goto(`${srv.url}index.html?fixtures=1&dbg=1`);
  await waitLoaded(page);
  await page.waitFor("/ready \\d+ ms/.test(document.getElementById('klc-dbg')?.textContent || '')", { timeout: 20000 });
  const onJs = await jsRequests(page);
  check('dbg: on with the flag, the chunk is requested and it is exactly one script more than without', onJs.includes(dbgChunk) && onJs.length === offJs.length + 1, { off: offJs.length, on: onJs.length });
  const pre = await page.eval("document.getElementById('klc-dbg').textContent.split('\\n')");
  matches('dbg: before entering the town the HUD has no box yet (hud -)', pre[4], /^canvas \d+x\d+  css 1280x720  hud -$/);
  await enter(page); await sleep(1200);
  const r = await page.eval(`(() => {
    const el = document.getElementById('klc-dbg'), cs = getComputedStyle(el), vv = visualViewport, c = document.getElementById('scene'), hud = document.getElementById('klc-ui').getBoundingClientRect();
    const box = (css) => { const b = document.createElement('div'); b.style.cssText = 'position:fixed;left:0;top:0;width:1px;visibility:hidden;' + css; document.body.appendChild(b); const h = b.getBoundingClientRect().height; b.remove(); return h; };
    return { lines: el.textContent.split('\\n'), pe: cs.pointerEvents, pos: cs.position, ariaHidden: el.getAttribute('aria-hidden'), count: document.querySelectorAll('#klc-dbg').length,
      inner: [innerWidth, innerHeight], vv: [vv.width, vv.height], svh: box('height:100svh'), lvh: box('height:100lvh'), dvh: box('height:100dvh'),
      canvas: [c.width, c.height, c.clientWidth, c.clientHeight], hud: [hud.width, hud.height], tex: window.__ctx.renderer.info.memory.textures,
      ready: performance.getEntriesByName('klc:ready')[0].startTime, audio: window.__ctx.audio.context?.state ?? 'idle' };
  })()`);
  const L = r.lines;
  matches('dbg desktop: OS and browser line', L[0], /^(macOS|Linux|Windows)\S* ?\S*\s+Chrome\(headless\) 15\d\.\d\s+dpr 1\s+tab$/);
  equal('dbg desktop: inner vs visualViewport', L[1], `inner ${r.inner[0]}x${r.inner[1]}  vv ${r.vv[0]}x${r.vv[1]} s1.00 y0  screen 1280x720`);
  equal('dbg desktop: the page is 1280x720', r.inner, [1280, 720]);
  equal('dbg desktop: svh / lvh / dvh / fixed boxes equal what the page measures, gap +0', L[2], `svh ${Math.round(r.svh)}  lvh ${Math.round(r.lvh)}  dvh ${Math.round(r.dvh)}  fixed 720  doc 720  gap +0`);
  equal('dbg desktop: no safe areas', L[3], 'safe t0 r0 b0 l0  landscape');
  equal('dbg desktop: canvas and HUD boxes equal the elements', L[4], `canvas ${r.canvas[0]}x${r.canvas[1]}  css ${r.canvas[2]}x${r.canvas[3]}  hud ${Math.round(r.hud[0])}x${Math.round(r.hud[1])}`);
  matches('dbg desktop: texture count equals renderer.info', L[5], new RegExp(`^tex ${r.tex} geo \\d+ calls [1-9]\\d* tris [\\d.]+M  tier (high|medium|low)$`));
  matches('dbg desktop: audio state equals the AudioContext', L[6], new RegExp(`^audio ${r.audio}  session \\S+  resumes \\d+  ctxlost 0$`));
  matches('dbg desktop: time to ready', L[7], /^ready \d+ ms  fps \d+  heap \d+ MB  build /);
  equal('dbg desktop: ready ms equals the klc:ready mark', Number(L[7].match(/ready (\d+) ms/)?.[1]), Math.round(r.ready));
  check('dbg desktop: fixed, pointer-transparent, aria-hidden, exactly one', r.pe === 'none' && r.pos === 'fixed' && r.ariaHidden === 'true' && r.count === 1);
  equal('dbg desktop: no page errors', pageErrors(page), []);
  await clipShot(page, '#klc-dbg', 'dbg-desktop-1280x720.png');
  save('dbg-desktop.json', { lines: L, before_enter: pre, scripts_off: offJs.length, scripts_on: onJs.length, chunk: dbgChunk, ready_ms: Math.round(r.ready) });
  await closePage(page);

  // on, an iPhone-shaped page
  page = await phonePage(browser, { width: 390, height: 844, dpr: 3, insets: { top: 47, bottom: 34, left: 0, right: 0 } });
  await page.goto(`${srv.url}index.html?fixtures=1&dbg=1`);
  await waitLoaded(page);
  await page.waitFor("/ready \\d+ ms/.test(document.getElementById('klc-dbg')?.textContent || '')", { timeout: 20000 });
  await enter(page); await sleep(1200);
  const P = await page.eval("document.getElementById('klc-dbg').textContent.split('\\n')");
  equal('dbg iphone: iOS and Safari version from the UA', P[0], 'iOS 18.0  Safari 18.0  dpr 3  tab');
  equal('dbg iphone: inner = visualViewport = screen', P[1], 'inner 390x844  vv 390x844 s1.00 y0  screen 390x844');
  equal('dbg iphone: svh / lvh / dvh / fixed / doc, gap +0 (the strip is one row per line at 390 px: at most 58 characters)', P[2], 'svh 844  lvh 844  dvh 844  fixed 844  doc 844  gap +0');
  check('dbg iphone: no line is longer than 58 characters', P.every((l) => l.length <= 58), P.map((l) => l.length));
  equal('dbg iphone: the safe areas it was given', P[3], 'safe t47 r0 b34 l0  portrait');
  matches('dbg iphone: the phone tier', P[5], /tier phone$/);
  const cv = await page.eval("(() => { const c = document.getElementById('scene'); return [c.width, c.height, c.clientWidth, c.clientHeight]; })()");
  equal('dbg iphone: canvas in device px and css px, HUD box', P[4], `canvas ${cv[0]}x${cv[1]}  css ${cv[2]}x${cv[3]}  hud 390x844`);
  await clipShot(page, '#klc-dbg', 'dbg-iphone-portrait-390x844.png');
  await setViewport(page, { width: 844, height: 340, dpr: 3, insets: { top: 0, bottom: 21, left: 47, right: 47 } });
  await page.waitFor("/inner 844x340/.test(document.getElementById('klc-dbg').textContent)", { timeout: 5000 });
  await sleep(700);
  const Q = await page.eval("document.getElementById('klc-dbg').textContent.split('\\n')");
  matches('dbg iphone landscape: the strip follows a rotation (a Safari-tab-sized 844x340)', Q[1], /^inner 844x340  vv 844x340/);
  matches('dbg iphone landscape: svh gap +0', Q[2], /gap \+0$/);
  equal('dbg iphone landscape: the landscape safe areas', Q[3], 'safe t0 r47 b21 l47  landscape');
  await clipShot(page, '#klc-dbg', 'dbg-iphone-landscape-844x340.png');
  save('dbg-iphone.json', { portrait: P, landscape: Q });
  equal('dbg iphone: no page errors', pageErrors(page), []);
  await closePage(page);
}

// ------------------------------------------------------------------ row 10: iPhone survival
const IPHONE_INSETS = { top: 47, bottom: 34, left: 0, right: 0 };
/** Lose the WebGL context of the page's canvas (what iOS does under memory pressure); the handle stays on window.__lc. */
const loseContext = (page) => page.eval(`(() => { const c = document.getElementById('scene'), gl = c.getContext('webgl2') || c.getContext('webgl'); window.__lc = gl.getExtension('WEBGL_lose_context'); window.__lc.loseContext(); return !!window.__lc; })()`);
const cardState = (page) => page.eval(`(() => { const e = document.getElementById('klc-lost'), cs = e && getComputedStyle(e), b = e?.querySelector('button')?.getBoundingClientRect(), top = document.elementFromPoint(195, 422);
  return { phase: window.__survive?.phase, count: window.__survive?.count, body: document.body.classList.contains('klc-lost'), display: cs?.display ?? 'none', dataPhase: e?.dataset.phase, text: e?.innerText ?? '', btnH: b?.height ?? 0, covers: !!top?.closest?.('#klc-lost'), saved: sessionStorage.getItem('klc.resume'), reloads: sessionStorage.getItem('klc.reloads') }; })()`);

async function stepSurvive(ctx) {
  const { browser, srv } = ctx;
  const url = (q) => `${srv.url}index.html?fixtures=1&${q}`;
  const clip = async (page, file) => { if (!OUT) return; const { data } = await page.S('Page.captureScreenshot', { format: 'jpeg', quality: 72, clip: { x: 0, y: 0, width: 390, height: 844, scale: 0.5 } }); writeFileSync(join(OUT, file), Buffer.from(data, 'base64')); };

  // ---- the whole town on the phone tier (releaseOnUpload frees the batches' CPU arrays: the case that cannot recover without a reload)
  let page = await phonePage(browser, { width: 390, height: 844, dpr: 3, insets: IPHONE_INSETS });
  await page.goto(url('dbg=1'));
  await waitLoaded(page);
  equal('survive: the phone tier (the one that frees the batches)', await page.eval('__ctx.quality.tier'), 'phone');
  await enter(page);
  const f = fingers(page);

  // audio: a real touch resumes the context, a suspended context is resumed by the next touch, a mute is not undone by a touch
  try {
    const a0 = await page.eval(`({ armed: __ctx.audio.session?.armed ?? null, supported: __ctx.audio.session?.supported ?? null, type: __ctx.audio.session?.type ?? null, fallback: __ctx.audio.session?.fallback ?? null, state: __ctx.audio.context?.state ?? null })`);
    check('survive audio: the engine created its session and armed the touch listeners', a0.armed === true, a0);
    await f.tap(195, 420); await sleep(700);
    equal('survive audio: after a real touch the AudioContext runs', await page.eval('__ctx.audio.context.state'), 'running');
    await page.eval('__ctx.audio.context.suspend()'); await page.waitFor("__ctx.audio.context.state === 'suspended'", { timeout: 5000 });
    const r0 = await page.eval('__ctx.audio.session.resumes');
    await f.tap(195, 420);
    await page.waitFor("__ctx.audio.context.state === 'running'", { timeout: 5000 }).then(() => check('survive audio: an interrupted (suspended) context is resumed by the next touch', true), () => check('survive audio: an interrupted (suspended) context is resumed by the next touch', false));
    check('survive audio: the resume was attempted by the session', (await page.eval('__ctx.audio.session.resumes')) > r0, { before: r0 });
    await page.eval('__ctx.audio.muted = true'); await page.waitFor("__ctx.audio.context.state === 'suspended'", { timeout: 5000 });
    await f.tap(195, 420); await sleep(900);
    equal('survive audio: a touch does not undo a mute (the context stays suspended)', await page.eval('__ctx.audio.context.state'), 'suspended');
    await page.eval('__ctx.audio.muted = false'); await page.waitFor("__ctx.audio.context.state === 'running'", { timeout: 5000 });
  } catch (e) { check('survive audio: the audio checks ran to the end', false, String(e?.stack || e).slice(0, 500)); }

  // the visitor's place: on foot at the market, at night, in winter
  await page.eval(`window.__camSpec('tourwalk:market'); window.__life.time.set('yoru', { instant: true }); window.__life.season.set('winter', { instant: true }); true;`);   // (ends in a value CDP can return: season.set returns the whole season object)
  await sleep(1500);
  const p0 = await page.eval(`({ x: __ctx.camera.position.x, y: __ctx.camera.position.y, z: __ctx.camera.position.z, yaw: __ctx.playerObj.yaw * 180 / Math.PI, pitch: __ctx.playerObj.pitch * 180 / Math.PI, fly: __ctx.playerObj.fly, preset: __life.time.preset, season: __life.season.id })`);
  equal('survive: the visitor is on foot at night in winter', [p0.fly, p0.preset, p0.season], [false, 'yoru', 'winter']);

  // ---- the loss
  page.logs.length = 0;
  await loseContext(page);
  await page.waitFor("window.__survive.phase === 'lost'", { timeout: 10000 });
  await sleep(400);
  const c1 = await cardState(page);
  equal('survive: lost -> the guard counts one loss and the phase is lost', [c1.phase, c1.count], ['lost', 1]);
  check('survive: the reload card is up (body.klc-lost, displayed, data-phase lost, says 再読み込みします)', c1.body && c1.display !== 'none' && c1.dataPhase === 'lost' && /再読み込みします/.test(c1.text), { body: c1.body, display: c1.display, dataPhase: c1.dataPhase });
  check('survive: its button is at least 44 px tall and the card covers the screen (a touch cannot reach the town behind it)', c1.btnH >= 44 && c1.covers, { btnH: c1.btnH, covers: c1.covers });
  const saved = JSON.parse(c1.saved || 'null');
  check('survive: the pose was saved before anything else (v1, webgl-context-lost, walk, at the place, at night in winter)', !!saved && saved.v === 1 && saved.why === 'webgl-context-lost' && saved.pose.mode === 'walk' && saved.pose.timePreset === 'yoru' && saved.pose.season === 'winter'
    && Math.abs(saved.pose.enu[0] - p0.x) < 0.05 && Math.abs(saved.pose.enu[2] - p0.z) < 0.05, saved && { mode: saved.pose.mode, enu: saved.pose.enu, preset: saved.pose.timePreset, season: saved.pose.season });
  const t1 = await page.eval('__ctx.time'); await sleep(900); const t2 = await page.eval('__ctx.time');
  equal('survive: the frame loop draws nothing while the context is gone (simulation time stands still)', t2, t1);
  equal('survive: no exception while the context is lost', pageErrors(page), []);
  const dbgLine = await page.eval("document.getElementById('klc-dbg').textContent.split('\\n')[6]");
  matches('survive: the ?dbg=1 strip counts the loss', dbgLine, /ctxlost 1$/);
  await clip(page, 'survive-card-iphone-390x844.jpg');

  // ---- the restore -> a reload, and the visitor is put back
  await page.eval('window.__lc.restoreContext(); window.__beforeReload = 1;');
  await page.waitFor("document.body.classList.contains('loaded') && !window.__beforeReload && window.__survive?.phase === 'ok' && !!window.__ctx?.resumed", { timeout: 300000 });
  const r = await page.eval(`({ resumed: __ctx.resumed, x: __ctx.camera.position.x, y: __ctx.camera.position.y, z: __ctx.camera.position.z, yaw: __ctx.playerObj.yaw * 180 / Math.PI, pitch: __ctx.playerObj.pitch * 180 / Math.PI, fly: __ctx.playerObj.fly,
    preset: __life.time.preset, season: __life.season.id, stored: sessionStorage.getItem('klc.resume'), reloads: JSON.parse(sessionStorage.getItem('klc.reloads') || '[]').length, card: document.getElementById('klc-lost')?.hidden ?? 'absent', phase: __survive.phase,
    dbg: document.getElementById('klc-dbg').textContent.split('\\n')[6] })`);
  check('survive: after the reload main.js says where the visitor was put back (webgl-context-lost, walk)', r.resumed?.why === 'webgl-context-lost' && r.resumed?.mode === 'walk' && r.resumed?.ageMs < 120000, r.resumed);
  check('survive: the camera is where it was (x, z within 5 cm, height within 25 cm, yaw and pitch within 0.1 degree, on foot)', Math.abs(r.x - p0.x) < 0.05 && Math.abs(r.z - p0.z) < 0.05 && Math.abs(r.y - p0.y) < 0.25
    && Math.abs(r.yaw - p0.yaw) < 0.1 && Math.abs(r.pitch - p0.pitch) < 0.1 && r.fly === false, { before: p0, after: { x: r.x, y: r.y, z: r.z, yaw: r.yaw, pitch: r.pitch, fly: r.fly } });
  equal('survive: and so are the time of day and the season', [r.preset, r.season], ['yoru', 'winter']);
  equal('survive: the saved record is consumed (a later reload starts fresh); one automatic reload is stamped; the card is gone; the guard is ok', [r.stored, r.reloads, r.card, r.phase], [null, 1, 'absent', 'ok']);
  matches('survive: the strip counts no loss on the new page', r.dbg, /ctxlost 0$/);
  const fr1 = await page.eval('({ t: __ctx.time, n: __ctx.renderer.info.render.frame })'); await sleep(2000); const fr2 = await page.eval('({ t: __ctx.time, n: __ctx.renderer.info.render.frame })');
  check('survive: a working frame loop after the reload (simulation time advances and frames are rendered)', fr2.t > fr1.t + 0.3 && fr2.n > fr1.n + 2, { from: fr1, to: fr2 });
  equal('survive: no module errors and no console errors or exceptions through the loss, the restore and the reload', [await page.eval('window.__errors.length'), pageErrors(page)], [0, []]);
  await clip(page, 'survive-after-reload-iphone-390x844.jpg');
  await page.eval(`sessionStorage.clear()`);
  await closePage(page);

  // ---- the reload-loop guard and the button, on a light page (the environment module only): the same guard, a few seconds per load
  page = await phonePage(browser, { width: 390, height: 844, dpr: 3, insets: IPHONE_INSETS });
  const f2 = fingers(page);
  await page.goto(url('only=environment'));
  await waitLoaded(page, 120000);
  await page.eval(`sessionStorage.clear(); window.__marker = 'cycle0'`);
  // cycle 1: the browser never gives the context back: after the wait (4 s) the page reloads by itself
  await loseContext(page);
  await page.waitFor("window.__survive.phase === 'lost'", { timeout: 10000 });
  const t0 = Date.now();
  await page.waitFor("!window.__marker && window.__survive?.phase === 'ok' && document.body.classList.contains('loaded')", { timeout: 120000 });
  const waited = Date.now() - t0;
  check('survive loop: no restore ever comes -> the page reloads by itself after about 4 s of a visible page', waited >= 3500 && waited < 60000, { ms: waited });
  equal('survive loop: one automatic reload is stamped', JSON.parse(await page.eval(`sessionStorage.getItem('klc.reloads')`)).length, 1);
  // cycle 2: the restore comes -> a reload at once
  await page.eval(`window.__marker = 'cycle2'`);
  await loseContext(page); await page.waitFor("window.__survive.phase === 'lost'", { timeout: 10000 });
  await page.eval('window.__lc.restoreContext()');
  await page.waitFor("!window.__marker && window.__survive?.phase === 'ok' && document.body.classList.contains('loaded')", { timeout: 120000 });
  equal('survive loop: two automatic reloads are stamped', JSON.parse(await page.eval(`sessionStorage.getItem('klc.reloads')`)).length, 2);
  // cycle 3: a third loss inside two minutes is refused: the card stays, the page does not reload, the button does
  await page.eval(`window.__marker = 'cycle3'`);
  await loseContext(page); await page.waitFor("window.__survive.phase === 'lost'", { timeout: 10000 });
  await page.eval('window.__lc.restoreContext()');
  await page.waitFor("window.__survive.phase === 'manual'", { timeout: 10000 });
  await sleep(2500);
  const m = await cardState(page);
  check('survive loop: the third loss inside two minutes does not reload by itself (the page is the same page)', (await page.eval('window.__marker')) === 'cycle3', { marker: await page.eval('window.__marker') });
  check('survive loop: the card says so (manual) and offers the button', m.dataPhase === 'manual' && /自動の再読み込みを止めました/.test(m.text) && m.btnH >= 44, { dataPhase: m.dataPhase, btnH: m.btnH });
  await clip(page, 'survive-card-manual-iphone-390x844.jpg');
  const b = await page.eval(`(() => { const r = document.querySelector('#klc-lost button').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await f2.tap(b.x, b.y);
  await page.waitFor("!window.__marker && window.__survive?.phase === 'ok' && document.body.classList.contains('loaded')", { timeout: 120000 });
  equal('survive loop: a tap on the button reloads (and a tap is not stamped as an automatic reload)', JSON.parse(await page.eval(`sessionStorage.getItem('klc.reloads')`)).length, 2);
  equal('survive loop: no page errors', pageErrors(page), []);
  await page.eval(`sessionStorage.clear()`);
  await closePage(page);
}

/** An observation for before / after: what the page does in the seconds after the phone takes the context and gives it back. */
async function stepLossProbe(ctx) {
  const { browser, srv } = ctx;
  const label = arg('label', 'build');
  const page = await phonePage(browser, { width: 390, height: 844, dpr: 3, insets: IPHONE_INSETS });
  await page.goto(`${srv.url}index.html?fixtures=1`);
  await waitLoaded(page);
  await enter(page); await sleep(1500);
  const fr0 = await page.eval('({ n: __ctx.renderer.info.render.frame, t: __ctx.time })');
  page.logs.length = 0;
  await page.eval(`window.__marker = 'same-page'`);
  await loseContext(page);
  await sleep(1500);
  const lost = await page.eval(`({ n: __ctx.renderer.info.render.frame, t: __ctx.time, card: !!document.getElementById('klc-lost') && !document.getElementById('klc-lost').hidden })`);
  const exLost = page.logs.filter((l) => l.type === 'exception').length;
  await page.eval('window.__lc.restoreContext()');
  await sleep(4000);
  const o = await page.eval(`({ marker: window.__marker ?? null, n: window.__ctx?.renderer.info.render.frame ?? null, t: window.__ctx?.time ?? null, phase: window.__survive?.phase ?? null, card: !!document.getElementById('klc-lost') && !document.getElementById('klc-lost').hidden })`).catch(() => ({ navigating: true }));
  const ex = page.logs.filter((l) => l.type === 'exception');
  const distinct = [...new Set(ex.map((l) => l.text.split('\n')[0].slice(0, 110)))];
  const obs = { label, beforeLoss: fr0, whileLost: { ...lost, exceptions: exLost }, fourSecondsAfterRestore: o, exceptionsAfterRestore: ex.length - exLost, distinctMessages: distinct.slice(0, 4), reloadedByItself: o.marker === null };
  console.log(JSON.stringify(obs));
  save(`loss-probe-${label}.json`, obs);
  if (OUT) { const { data } = await page.S('Page.captureScreenshot', { format: 'jpeg', quality: 70, clip: { x: 0, y: 0, width: 390, height: 844, scale: 0.5 } }); writeFileSync(join(OUT, `loss-probe-${label}-4s-after-restore.jpg`), Buffer.from(data, 'base64')); }
  check(`loss-probe ${label}: observed`, true, { reloadedByItself: obs.reloadedByItself, exceptionsAfterRestore: obs.exceptionsAfterRestore, card: o.card });
  await closePage(page);
}

// ------------------------------------------------------------------ row 3: flights
async function stepFlight(ctx) {
  const { browser, srv } = ctx;
  const oldCinematic = (d) => Math.min(11, Math.max(3.2, 2.2 + Math.sqrt(d) * 0.16));
  const newSeconds = (d) => Math.min(4.5, Math.max(1.8, 1.4 + 0.08 * Math.sqrt(d)));

  // ---- shot mode: the sim does not run by itself (dt = 0), so the tour is stepped by hand at 1/60 s: exact numbers on the real player, camera and stops
  let page = await browser.page({ width: 640, height: 360, dpr: 1 });
  await page.goto(`${srv.url}index.html?shot=1&fixtures=1&w=640&h=360&hours=16.5`);
  await page.waitFor('window.__ready === true', { timeout: 300000 });
  const nStops = await page.eval('__life.tour.stops.length');
  check('flight: the real tour has the explore places on top of the built-in stops', nStops > 20, { stops: nStops });
  await page.eval(`window.__stepTour = (n) => { const t = __life.tour; for (let i = 0; i < n; i++) t.update(1 / 60); const p = __ctx.camera.position; return [p.x, p.y, p.z]; };
    window.__pos = () => { const p = __ctx.camera.position; return [p.x, p.y, p.z]; };
    window.__dir = () => { const c = __ctx.camera, d = new THREE.Vector3(); c.updateMatrixWorld(true); c.getWorldDirection(d); return [Math.atan2(-d.x, -d.z), Math.atan2(d.y, Math.hypot(d.x, d.z))]; };`);
  const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  await page.eval(`__life.tour.jumpTo('hero')`);
  const h0 = await page.eval('__pos()');
  await page.eval(`__life.tour.flyTo('market')`);
  const h6 = await page.eval('__stepTour(6)'), h30 = await page.eval('__stepTour(24)');
  check('flight: after a pick (hero -> 魚市場) the camera has moved more than 20 m within 100 ms (6 frames); it was under 2 m in 500 ms', dist3(h0, h6) > 20 && dist3(h0, h30) > 100, { m100ms: Math.round(dist3(h0, h6) * 10) / 10, m500ms: Math.round(dist3(h0, h30) * 10) / 10 });

  // the whole flight to かなえ大橋: no whip, arrival exact, and the new length
  await page.eval(`__life.tour.jumpTo('hero'); __life.tour.flyTo('kanae')`);
  const k = await page.eval(`(() => { const t = __life.tour, d0 = __dir(); let [py] = d0; const y0 = py, to = t.stops.find((s) => s.id === 'kanae').drone;
    const from = __pos(); let n = 0, maxYaw = 0, steepest = 0, total = 0; const frames = [];
    while (t.flying && n < 2000) { t.update(1 / 60); n++; const [y, p] = __dir(), dy = Math.atan2(Math.sin(y - py), Math.cos(y - py)); maxYaw = Math.max(maxYaw, Math.abs(dy)); total += Math.abs(dy); steepest = Math.min(steepest, p); py = y; }
    const net = Math.abs(Math.atan2(Math.sin(py - y0), Math.cos(py - y0))), p = __pos();
    return { seconds: n / 60, maxYawDeg: maxYaw * 180 / Math.PI, totalYawDeg: total * 180 / Math.PI, netYawDeg: net * 180 / Math.PI, steepestDeg: steepest * 180 / Math.PI, fromTo: [from, to.pos], end: p }; })()`);
  const kd = dist3(k.fromTo[0], k.fromTo[1]);
  check('flight: hero -> かなえ大橋 takes the new length (flightSeconds of the distance) and arrives exactly', Math.abs(k.seconds - newSeconds(kd)) < 0.05 && dist3(k.end, k.fromTo[1]) < 0.01, { seconds: k.seconds, want: Math.round(newSeconds(kd) * 100) / 100, miss_m: dist3(k.end, k.fromTo[1]) });
  check('flight: the view never whips (yaw per frame under 2 degrees, was 22; total yaw equals the net turn within 5 degrees; steepest pitch above -55, was -87)', k.maxYawDeg < 2 && k.totalYawDeg < k.netYawDeg + 5 && k.steepestDeg > -55, { maxYawDeg: Math.round(k.maxYawDeg * 100) / 100, totalYawDeg: Math.round(k.totalYawDeg * 10) / 10, netYawDeg: Math.round(k.netYawDeg * 10) / 10, steepestDeg: Math.round(k.steepestDeg * 10) / 10 });

  // skip(): far with a veil function (the jump is the caller's), near a 0.25 s straight glide, idle false, and the auto tour is not skipped
  const sk = await page.eval(`(() => { const t = __life.tour, out = {}; t.jumpTo('hero'); out.idle = t.skip();
    t.flyTo('kanae'); __stepTour(60); let cuts = 0; out.far = t.skip((fn) => { cuts++; fn(); }); out.cuts = cuts; out.farFlying = t.flying; out.farDist = Math.hypot(...__pos().map((v, i) => v - t.stops.find((s) => s.id === 'kanae').drone.pos[i]));
    t.jumpTo('hero'); t.flyTo('ukimido'); __stepTour(100); out.near = t.skip(); let n = 0; while (t.flying && n < 100) { t.update(1 / 60); n++; } out.nearSeconds = n / 60;
    out.nearDist = Math.hypot(...__pos().map((v, i) => v - t.stops.find((s) => s.id === 'ukimido').drone.pos[i]));
    t.jumpTo('hero'); t.play(); __stepTour(5); out.onTour = t.skip(); t.stop(); return out; })()`);
  check('flight: skip() is false when idle and on the auto tour; far it hands the jump to the caller once, near it glides in 0.25 s', sk.idle === false && sk.onTour === false && sk.far === true && sk.cuts === 1 && sk.farFlying === false && sk.farDist < 0.01 && sk.near === true && sk.nearSeconds < 0.4 && sk.nearDist < 0.01, sk);

  // the auto tour on the real stops (including the explore places): the first legs take the old formula's time; dwell 7.5 s
  const at = await page.eval(`(() => { const t = __life.tour, out = []; t.jumpTo('hero'); t.play();
    for (let leg = 0; leg < 4; leg++) { const id = t.current, from = __pos(), to = t.stops.find((s) => s.id === id).drone.pos; let n = 0; while (t.flying && n < 4000) { t.update(1 / 60); n++; }
      let dwell = 0; while (!t.flying && dwell < 2000) { t.update(1 / 60); dwell++; } out.push({ id, seconds: n / 60, dist: Math.hypot(from[0] - to[0], from[1] - to[1], from[2] - to[2]), dwell: dwell / 60 }); }
    t.stop(); return out; })()`);
  check('flight: the auto tour keeps its cinematic length on the real stops (the old formula) and its 7.5 s dwell', at.length === 4 && at.every((l) => Math.abs(l.seconds - oldCinematic(l.dist)) < 0.05 && Math.abs(l.dwell - 7.5) < 0.1), at.map((l) => ({ id: l.id, s: Math.round(l.seconds * 100) / 100, want: Math.round(oldCinematic(l.dist) * 100) / 100, dwell: Math.round(l.dwell * 100) / 100 })));

  // frames of a flight (--out): hero -> かなえ大橋 at 0, 0.5, 1, 1.5, 2.2, 3, 4.5 s (640x360, JPEG)
  if (OUT) {
    const marks = [0, 0.5, 1.0, 1.5, 2.2, 3.0, 4.5]; let t = 0; await page.eval(`__life.tour.jumpTo('hero'); __life.tour.flyTo('kanae')`);
    for (const m of marks) {
      const n = Math.round((m - t) * 60); if (n > 0) await page.eval(`__stepTour(${n})`); t = m; await page.frames(3);
      const { data } = await page.S('Page.captureScreenshot', { format: 'jpeg', quality: 62 }); writeFileSync(join(OUT, `flight-frame-${String(m).replace('.', '_')}s.jpg`), Buffer.from(data, 'base64'));
    }
  }
  equal('flight: no page errors in shot mode', pageErrors(page), []);
  await closePage(page);

  // ---- the live loop (real clock, the player and the explore module running): a pick moves the camera at once, a retarget keeps the speed, skip() finishes
  page = await browser.page({ width: 1280, height: 720, dpr: 1 });
  await page.goto(`${srv.url}index.html?fixtures=1`);
  await waitLoaded(page);
  await enter(page);
  await page.eval(`window.__trace = (ms) => new Promise((res) => { const out = [], t0 = performance.now(), c = __ctx.camera; (function tick() { const t = performance.now() - t0; out.push([t, c.position.x, c.position.y, c.position.z, __ctx.time]); if (t < ms) requestAnimationFrame(tick); else res(out); })(); })`);
  await page.eval(`__life.tour.jumpTo('hero')`); await sleep(800);
  const live = await page.eval(`(async () => { const t = __life.tour, c = __ctx.camera, p0 = c.position.clone(); t.flyTo('market'); const tr = await __trace(1200); return { p0: [p0.x, p0.y, p0.z], tr }; })()`);
  const dAt = (ms) => { const q = live.tr.find((r) => r[0] >= ms); return q ? dist3(live.p0, [q[1], q[2], q[3]]) : 0; };
  const fps = Math.round(live.tr.length / 1.2);
  check('flight live: the first frame at or after 100 ms of a real pick has the camera more than 20 m away (the page ran at about ' + fps + ' fps)', dAt(100) > 20 && dAt(500) > 50, { m100ms: Math.round(dAt(100) * 10) / 10, m500ms: Math.round(dAt(500) * 10) / 10, frames: live.tr.length });
  await page.eval(`__life.tour.jumpTo('hero')`); await sleep(500);
  const rt = await page.eval(`(async () => { const t = __life.tour; t.flyTo('kanae'); await new Promise((r) => setTimeout(r, 900)); t.stop(); t.flyTo('market'); return await __trace(900); })()`);
  // speed per second of SIMULATION time (a frame that took longer than 100 ms is clamped to 0.1 s of simulation, so real time would read a hitch as braking)
  const sp = []; for (let i = 1; i < rt.length; i++) { const ds = rt[i][4] - rt[i - 1][4]; if (ds > 1e-4) sp.push([rt[i][0], Math.hypot(rt[i][1] - rt[i - 1][1], rt[i][2] - rt[i - 1][2], rt[i][3] - rt[i - 1][3]) / ds]); }
  const fast = Math.max(...sp.slice(0, 3).map((x) => x[1]));
  check('flight live: a retarget (stop then flyTo, as the HUD does) never brakes to a stop: the camera speed stays above 20 % of what it was', Math.min(...sp.map((x) => x[1])) > fast * 0.2, { before: Math.round(fast), min: Math.round(Math.min(...sp.map((x) => x[1]))), samples: sp.length });
  const lk = await page.eval(`(async () => { const t = __life.tour; t.jumpTo('hero'); t.flyTo('kanae'); await new Promise((r) => setTimeout(r, 700)); const f0 = t.flying; t.skip((fn) => fn()); const f1 = t.flying; await new Promise((r) => setTimeout(r, 120)); const to = t.stops.find((s) => s.id === 'kanae').drone.pos, p = __ctx.camera.position;
    return { flyingBefore: f0, flyingAfter: f1, miss: Math.hypot(p.x - to[0], p.y - to[1], p.z - to[2]) }; })()`);
  check('flight live: skip() with a cut ends a flight at once and the camera is on the framing', lk.flyingBefore === true && lk.flyingAfter === false && lk.miss < 0.5, lk);
  equal('flight live: no page errors', pageErrors(page), []);
  await closePage(page);
}

const STEP_FNS = { dbg: stepDbg, survive: stepSurvive, 'loss-probe': stepLossProbe, flight: stepFlight };

// ------------------------------------------------------------------ main
const t0 = Date.now();
let ctx = { browser: null, srv: null, dist: null };
try {
  const dist = arg('dist') ? join(process.cwd(), arg('dist')) : join(ROOT, `dist/anime-${PORT}`);
  if (arg('nobuild') === '1') ctx = { ...ctx, srv: serve({ port: PORT, dist }), dist };
  else { const b = await buildAndServe(PORT); ctx = { ...ctx, srv: b.srv, dist: b.dist }; }
  ctx.browser = await launch({ quiet: true });
  for (const s of STEPS) {
    if (!STEP_FNS[s]) { check(`unknown step ${s}`, false); continue; }
    console.log(`\n== step ${s}`);
    try { await STEP_FNS[s](ctx); } catch (e) { check(`step ${s} ran to the end`, false, String(e?.stack || e).slice(0, 800)); }
  }
} finally {
  await ctx.browser?.close().catch(() => {});
  ctx.srv?.stop();
  try { Bun.spawnSync(['pkill', '-9', '-f', 'user-data-dir=' + join(ROOT, 'dist/.chrome-' + process.pid)]); } catch { /* nothing left to sweep */ }
}
const summary = { steps: STEPS, pass: results.filter((r) => r.ok).length, fail: failed, seconds: Math.round((Date.now() - t0) / 1000), results };
save(`ui-c-check-${STEPS.join('+')}${arg('label') ? '-' + arg('label') : ''}.json`, summary);   // (one file per step list, so two runs into the same directory do not overwrite each other)
console.log(`\n${summary.pass} passed, ${summary.fail} failed in ${summary.seconds} s`);
process.exit(failed ? 1 : 0);
