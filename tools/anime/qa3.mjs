// [v3:integrate] End-to-end QA of the PRODUCTION build (dist/ from scripts/build-web.js, served by scripts/serve.js at /):
// the real interactive flow a visitor sees, not the shot-mode page. ALWAYS through the machine gate:
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/qa3.mjs [--port 8815] [--out dist/qa3/ui] [--phone 1] [--bench 1] [--build 1]
// Steps: load / -> intro board -> "Enter the town" -> HUD; time presets (buttons + T); drone/walk (V + button); tour stop +
// auto tour (G); live chip + arrivals panel; arriving boats at 06:30; characters; audio toggle (button + M); photo mode
// (1920x1080: the machine caps forbid 4K until 2026-10-01 00:00Z; scale 1 = 3840x2160 is the same path); hide UI (H).
// --phone 1 also runs the 390x844 touch layout. --bench 1 measures GPU ms/frame per quality tier on the wow cameras.
// Prints a JSON report and exits 1 on any page error or failed check. Never leaves Chrome or the server running.
import { join, resolve, relative } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import { launch, ROOT } from './cdp.mjs';
import { start } from '../../scripts/serve.js';
import { buildWeb } from '../../scripts/build-web.js';
import sharp from 'sharp';   // [v3:fix] frame-content checks on the walk spots

const args = {};
for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) { const k = a.slice(2); const v = process.argv[i + 1] !== undefined && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : '1'; args[k] = v; } }
const port = Number(args.port || 8815);
if ([8787, 8790, 8791].includes(port)) throw new Error('port reserved');
const out = resolve(ROOT, args.out || 'dist/qa3/ui');
mkdirSync(join(out, '..'), { recursive: true });
const report = { checks: [], errors: [], timings: {}, bench: {} };
const check = (name, ok, info) => { report.checks.push({ name, ok: !!ok, ...(info !== undefined && { info }) }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? '  ' + JSON.stringify(info) : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (args.build) { const t0 = Date.now(); await buildWeb({ quiet: true }); report.timings.buildMs = Date.now() - t0; }
const srv = await start({ port, build: false, quiet: true });
let browser;
try {
  browser = await launch({ quiet: true });
  const W = 1600, H = 900;
  const page = await browser.page({ width: W, height: H });
  const key = async (code, k = code.replace(/^Key|^Digit/, '').toLowerCase()) => {
    await page.S('Input.dispatchKeyEvent', { type: 'keyDown', code, key: k, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) });
    await page.S('Input.dispatchKeyEvent', { type: 'keyUp', code, key: k, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) });
  };
  const click = (sel) => page.eval(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b) return false; b.click(); return true; })()`);
  const shot = async (name) => { const f = `${out}_${name}.png`; await page.shot(f); console.log('  saved', relative(ROOT, f)); };
  const cam = () => page.eval('(() => { const c = window.__ctx.camera.position; return [c.x, c.y, c.z].map((v) => +v.toFixed(1)); })()');

  // ---- load
  const t0 = Date.now();
  await page.goto(`${srv.url}`);
  await page.waitFor("document.body.classList.contains('loaded')", { timeout: 280000 });
  report.timings.loadMs = Date.now() - t0;
  const st = await page.eval('({ modules: window.__stats.modules, batch: window.__stats.batch, errors: window.__errors })');
  report.timings.modules = st.modules; report.timings.batch = st.batch;
  check('all five modules built', ['environment', 'water', 'town', 'harbor', 'life'].every((m) => st.modules[m]), Object.keys(st.modules));
  check('no module errors', !st.errors.length, st.errors.map((e) => e.module + ': ' + e.message.split('\n')[0]));
  await shot('00_intro');

  // ---- enter
  await click('#go');
  await page.frames(20);
  check('entered the town (body.playing)', await page.eval("document.body.classList.contains('playing')"));
  check('HUD visible', await page.eval("!!document.getElementById('klc-ui') && !document.getElementById('klc-ui').hidden"));
  await page.eval('window.__life.live.ready');
  await page.frames(10);
  const liveSt = await page.eval('({ status: __life.live.state.status, origin: __life.live.state.origin, sample: __life.live.state.sample, arrivals: __life.live.state.arrivals.length, wx: __life.live.state.weather?.sky, chip: document.querySelector("#klc-ui .chip")?.innerText.replace(/\\s+/g, " ") })');
  check('live chip filled', liveSt.status === 'ok' && /\d\d:\d\d/.test(liveSt.chip || ''), liveSt);
  check('sample data labelled サンプル', !liveSt.sample || /サンプル|Sample/i.test(liveSt.chip || ''), liveSt.chip);
  await shot('01_enter');

  // ---- time presets: every button, then T cycles
  const presets = await page.eval('__life.time.presets.map((p) => p.id)');
  for (const id of presets) {
    await click(`#klc-ui [data-act="preset"][data-id="${id}"]`);
    await page.eval('new Promise((r) => setTimeout(r, 3600))');   // 3.2 s transition
    await page.frames(4);
    const s = await page.eval('({ preset: __life.time.preset, clock: __life.time.clock(), night: +(+__life.time.night).toFixed(2) })');
    check(`preset ${id}`, s.preset === id, s);
    if (id === 'yoru' || id === 'asa') await shot(`02_preset_${id}`);
  }
  const before = await page.eval('__life.time.preset');
  await key('KeyT'); await page.eval('new Promise((r) => setTimeout(r, 3600))');
  check('T cycles the preset', (await page.eval('__life.time.preset')) !== before, await page.eval('__life.time.preset'));
  await click('#klc-ui [data-act="preset"][data-id="yugata"]'); await page.eval('new Promise((r) => setTimeout(r, 3600))');

  // ---- arrivals panel
  await click('#klc-ui [data-act="arrivals"]'); await page.frames(4);
  const arr = await page.eval('document.querySelectorAll("#klc-arr li").length');
  check('arrivals panel lists boats', arr > 0, arr);
  await shot('03_arrivals');
  await click('#klc-ui [data-act="arrivals"]');

  // ---- boats arriving (06:30: the sample list's morning arrivals glide in)
  await page.eval('void __life.time.setHours(6.0)'); await page.frames(4);
  const a0 = await page.eval('JSON.stringify(window.__harbor?.state?.() || [])');
  await page.eval('void __life.time.setHours(6.5)'); await page.frames(30);
  const a1 = JSON.parse(await page.eval('JSON.stringify(window.__harbor?.state?.() || [])'));
  const moving = a1.filter((b) => b.phase === 'approach' || b.phase === 'berthed');
  check('arriving boats spawned from the live list', a1.length > 0 && moving.length > 0, { total: a1.length, active: moving.map((b) => `${b.vessel}:${b.phase}`).slice(0, 6), dry: a1.filter((b) => b.dry).length });
  check('arrival routes stay on water', a1.every((b) => !b.dry));
  void a0;

  // ---- tour: a stop, then the auto tour (G)
  await click('#klc-ui [data-act="preset"][data-id="yugata"]'); await page.eval('new Promise((r) => setTimeout(r, 3600))');
  await click('#klc-ui [data-act="places"]'); await page.frames(3);
  const stops = await page.eval('__life.tour.stops.map((s) => s.id)');
  check('tour stops listed', stops.length >= 5, stops);
  const c0 = await cam();
  await click('#klc-ui [data-act="stop"][data-id="market"]');
  await page.eval('new Promise((r) => setTimeout(r, 12000))');
  const c1 = await cam();
  check('fly to the market stop', Math.hypot(c1[0] - 820, c1[2] - 1000) < 80, { from: c0, to: c1 });
  await shot('04_tour_market');
  await key('KeyG'); await page.eval('new Promise((r) => setTimeout(r, 2500))');
  const playing = await page.eval('__life.tour.playing');
  const c2 = await cam();
  check('G starts the auto tour and the camera moves', playing && Math.hypot(c2[0] - c1[0], c2[2] - c1[2]) > 2, { playing, cam: c2 });
  await key('KeyG'); await page.frames(3);
  check('G stops the auto tour', !(await page.eval('__life.tour.playing')));

  // ---- drone / walk
  await click('#klc-ui [data-act="stop"][data-id="hero"]'); await page.eval('new Promise((r) => setTimeout(r, 9000))');
  await click('#klc-ui [data-act="view"]'); await page.frames(20);
  // ground = the physics floor under the eye (terrain, or the walk boxes of decks / quays / the promenade)
  const w = await page.eval('(() => { const p = window.__ctx.playerObj, c = window.__ctx.camera.position; return { fly: p.fly, y: +c.y.toFixed(2), ground: +window.__ctx.physics.groundHeight(c.x, c.z, c.y).toFixed(2) }; })()');
  check('walk mode: eye height above the ground', !w.fly && w.y - w.ground > 1.2 && w.y - w.ground < 2.2, w);
  // walk forward for 1.5 s (W) and check the player moved and stayed on the ground
  const p0 = await cam();
  await page.S('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyW', key: 'w', windowsVirtualKeyCode: 87 });
  await sleep(1500);
  await page.S('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyW', key: 'w', windowsVirtualKeyCode: 87 });
  await page.frames(5);
  const p1 = await cam();
  check('walking moves the player', Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) > 0.8, { p0, p1 });
  await shot('05_walk');
  // [v3:fix] the quay edge is a wall: face the bay from the promenade and hold W for 4 s -> still on land (or a deck)
  await page.eval("(() => { const p = window.__ctx.playerObj; p.setPose(168, -122, 180, 0); return 1; })()");
  await page.S('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyW', key: 'w', windowsVirtualKeyCode: 87 });
  await sleep(4000);
  await page.S('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyW', key: 'w', windowsVirtualKeyCode: 87 });
  await page.frames(5);
  const sea = await page.eval('(() => { const p = window.__ctx.playerObj.pos, P = window.__ctx.physics; return { x: +p.x.toFixed(1), z: +p.z.toFixed(1), water: window.__L.isWater(p.x, p.z), standable: P.standable ? P.standable(p.x, p.z, p.y) : null, y: +p.y.toFixed(2) }; })()');
  check('walk mode: the player cannot walk off the quay into the sea', sea.standable !== false && sea.y > 1.0, sea);

  // [v3:fix] every tour stop's walk spot: on land (or a deck), outside every building (lots + market halls), and a real
  // picture (no single colour quantised to 3 bits per channel covers more than 45 % of the frame)
  const spots = await page.eval(`(() => {
    const T = window.__life.tour, L = window.__L, halls = window.__ctx.services.harbor?.market?.halls || [];
    const inBox = (x, z, cx, cz, rotY, w, d) => { const c = Math.cos(rotY), s = Math.sin(rotY), dx = x - cx, dz = z - cz; return Math.abs(dx * c - dz * s) < w / 2 && Math.abs(dx * s + dz * c) < d / 2; };
    return T.stops.map((st) => {
      if (!st.walk) return { id: st.id, walk: false };
      const { x, z } = st.walk;
      const lot = L.LOTS.filter((l) => l.zone !== 'far').find((l) => inBox(x, z, l.obb.cx, l.obb.cz, l.obb.rotY, l.obb.w, l.obb.d));
      const hall = halls.find((h) => inBox(x, z, h.x, h.z, h.rotY, h.depth, h.len));
      return { id: st.id, walk: true, water: L.isWater(x, z) && !(window.__ctx.physics.standable?.(x, z)), lot: lot ? lot.id : null, hall: !!hall };
    });
  })()`);
  await page.eval("document.body.classList.add('noui')");
  for (const sp of spots) {
    if (!sp.walk) { check(`walk spot ${sp.id}: exists`, false, sp); continue; }
    await page.eval(`void window.__life.tour.walkTo(${JSON.stringify(sp.id)})`);
    await page.frames(12);
    const buf = await page.shot(`${out}_walk_${sp.id}.png`);
    const { data, info } = await sharp(buf).resize(160, 90, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
    const bins = new Map(); const n = info.width * info.height;
    for (let i = 0; i < n; i++) { const k = ((data[i * info.channels] >> 5) << 6) | ((data[i * info.channels + 1] >> 5) << 3) | (data[i * info.channels + 2] >> 5); bins.set(k, (bins.get(k) || 0) + 1); }
    const top = Math.max(...bins.values()) / n;
    check(`walk spot ${sp.id}: on land, outside buildings, a real picture`, !sp.water && !sp.lot && !sp.hall && top <= 0.45, { ...sp, topColourShare: +top.toFixed(2) });
  }
  await page.eval("document.body.classList.remove('noui')");
  await page.eval("void window.__life.tour.walkTo('hero')"); await page.frames(10);   // back on the promenade, still in walk view

  await key('KeyV'); await page.eval('new Promise((r) => setTimeout(r, 8000))');
  const d = await page.eval('(() => { const c = window.__ctx.camera.position; return { fly: window.__ctx.playerObj.fly, alt: +(c.y - window.__L.groundAt(c.x, c.z)).toFixed(1) }; })()');
  check('V returns to the drone', d.alt > 25, d);

  // ---- characters
  const cast = await page.eval('({ people: __life.stats.cast?.people, cats: __life.stats.cast?.cats, walkers: __life.stats.cast?.walkers })');
  check('townspeople and cats', cast.people > 10 && cast.cats > 0, cast);

  // ---- audio toggle (button + M)
  const m0 = await page.eval('!!__ctx.audio.muted');
  await click('#klc-ui [data-act="sound"]'); await page.frames(2);
  const m1 = await page.eval('!!__ctx.audio.muted');
  await key('KeyM'); await page.frames(2);
  const m2 = await page.eval('!!__ctx.audio.muted');
  const aud = await page.eval('({ ready: !!__ctx.audio.ready, state: __ctx.audio.context?.state || null, sound: !!__life.sound })');
  check('audio toggles (button, then M)', m1 !== m0 && m2 === m0, { m0, m1, m2, ...aud });

  // ---- photo mode (1920x1080 here; the button saves 3840x2160)
  const ph = await page.eval('window.__photo(0.5, { data: true, noDownload: true }).then((r) => r && ({ w: r.w, h: r.h, name: r.name, b64: r.url.split(",")[1] }))');
  check('photo mode renders a 16:9 PNG without UI', ph && ph.w === 1920 && ph.h === 1080, ph && { w: ph.w, h: ph.h, name: ph.name });
  if (ph) writeFileSync(`${out}_06_photo.png`, Buffer.from(ph.b64, 'base64'));

  // ---- hide UI (H) and back
  await key('KeyH'); await page.frames(3);
  const hidden = await page.eval("document.body.classList.contains('noui')");
  await shot('07_noui');
  await key('KeyH'); await page.frames(3);
  check('H hides and restores the UI', hidden && !(await page.eval("document.body.classList.contains('noui')")));

  // ---- language
  await click('#klc-ui [data-act="lang"]'); await page.frames(3);
  const en = await page.eval('document.getElementById("klc-ui").getAttribute("lang")');
  await shot('08_en');
  await click('#klc-ui [data-act="lang"]');
  check('JA/EN toggle', en === 'en', en);

  // ---- seasons (button, then K) and the tiny planet (button, then O)
  const s0 = await page.eval('__life.season?.id');
  await click('#klc-ui [data-act="season"]'); await page.eval('new Promise((r) => setTimeout(r, 3000))');
  const s1 = await page.eval('__life.season?.id');
  const w1 = await page.eval('__ctx.shared.uSeason.value.toArray().map((v) => +v.toFixed(2))');
  await shot('08b_season_' + s1);
  await key('KeyK'); await page.eval('new Promise((r) => setTimeout(r, 3000))');
  const s2 = await page.eval('__life.season?.id');
  await shot('08c_season_' + s2);
  check('season toggles (button, then K) and blends the materials', s0 === 'autumn' && s1 !== s0 && s2 !== s1 && w1[3] > 0.99, { s0, s1, s2, weights: w1 });
  await page.eval("void window.__season('autumn')"); await page.frames(3);
  await click('#klc-ui [data-act="planet"]'); await page.eval('new Promise((r) => setTimeout(r, 1500))');
  const pa = await page.eval('__ctx.planet.active');
  await shot('08d_planet');
  await key('KeyO'); await page.frames(4);
  check('tiny planet (button, then O)', pa && !(await page.eval('__ctx.planet.active')));

  // ---- fps in the live loop (real rAF, gate-throttled)
  const fps = await page.eval('new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { if (++n >= 90) r(+(n * 1000 / (performance.now() - t0)).toFixed(1)); else requestAnimationFrame(f); }; requestAnimationFrame(f); })');
  report.timings.liveFps = fps;
  console.log('  live fps (1600x900, high, gate-throttled):', fps);

  report.errors = page.errors().map((l) => `${l.type}: ${l.text.slice(0, 300)}`);
  check('no console errors', !report.errors.length, report.errors.slice(0, 8));

  // ---- phone layout
  if (args.phone) {
    const ph2 = await browser.page({ width: 390, height: 844 });
    await ph2.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 });
    await ph2.S('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }).catch(() => {});
    const tp = Date.now();
    await ph2.goto(`${srv.url}`);
    await ph2.waitFor("document.body.classList.contains('loaded')", { timeout: 280000 });
    report.timings.phoneLoadMs = Date.now() - tp;
    await ph2.shot(`${out}_09_phone_intro.png`);
    await ph2.eval("document.getElementById('go').click()");
    await ph2.frames(30);
    await ph2.eval('window.__life.live.ready');
    await ph2.frames(10);
    const q = await ph2.eval('({ q: window.__ctx.quality.name, heroR: window.__ctx.quality.heroR, overflow: document.documentElement.scrollWidth > innerWidth })');
    check('phone: low tier, no horizontal overflow', q.q === 'low' && !q.overflow, q);
    await ph2.shot(`${out}_10_phone.png`);
    const perr = ph2.errors().map((l) => `${l.type}: ${l.text.slice(0, 300)}`);
    check('phone: no console errors', !perr.length, perr.slice(0, 6));
  }

  // ---- per-tier GPU frame times on the wow cameras (shot-mode page: deterministic, 1920x1080)
  if (args.bench) {
    const cams = { drone: 'yugata@hero', promenade: 'yugata@walk', market: 'asa@735,22,905>665,3,830', night: 'yoru@hero', city: 'yugata@900,700,900>150,0,-50' };
    for (const q of ['high', 'medium', 'low']) {
      const bp = await browser.page({ width: 1920, height: 1080 });
      await bp.goto(`${srv.url}?shot=1&w=1920&h=1080&t=12&q=${q}`);
      await bp.waitFor('window.__ready === true', { timeout: 280000 });
      report.bench[q] = {};
      for (const [name, spec] of Object.entries(cams)) {
        const [time, c] = spec.split('@');
        await bp.eval(`window.__lifeSet(${JSON.stringify(time)})`);
        await bp.eval(`window.__camSpec(${JSON.stringify(c)})`);
        await bp.frames(4);
        report.bench[q][name] = await bp.eval('window.__bench(30)');
        console.log(`  bench ${q} ${name}:`, JSON.stringify(report.bench[q][name]));
      }
      await bp.S('Page.close').catch(() => {});
    }
  }
} catch (e) {
  console.log('QA FAILED:', e.message);
  report.fatal = e.message;
  process.exitCode = 1;
} finally {
  await browser?.close();
  srv.server.stop(true);
}
const failed = report.checks.filter((c) => !c.ok);
writeFileSync(`${out}_report.json`, JSON.stringify(report, null, 1));
console.log(`\n${report.checks.length - failed.length}/${report.checks.length} checks passed${failed.length ? '; FAILED: ' + failed.map((c) => c.name).join(', ') : ''}`);
if (failed.length) process.exitCode = 1;
process.exit(process.exitCode || 0);
