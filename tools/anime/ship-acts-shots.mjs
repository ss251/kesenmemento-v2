// [ship:acts] Headless shots of the three acts of 第一昭福丸 (and the side-on views compared with the model photos
// 02 port / 03 starboard). Run ONLY through the machine gate (one headless Chrome machine-wide):
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/ship-acts-shots.mjs --port 8963 --out shots/ship-acts/a
// [ship:integrate] It shoots the real app (src/anime/index.html): the 'ship' world module exposes the hooks below.
// --only   world modules (default: the whole app)                         --w/--h size (1280x720, max 1920x1080)   --q high|low|phone
// --list   comma list of shot ids to take (default: all)                 --nobuild reuse the last build
// --livery nendo|fallback (default: the flag; a local host shows nendo)   --auto 1 the hands-free voyage end to end
// Prints a JSON line per shot (state, tags, frame stats) and the page errors; exits non-zero on a page error.
import { join, resolve, relative } from 'node:path';
import { build, serve, launch, ROOT } from './cdp.mjs';

const args = {};
for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) { const k = a.slice(2); const v = process.argv[i + 1] !== undefined && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : '1'; args[k] = v; } }
const port = Number(args.port || 8963);
if ([8787, 8790, 8791].includes(port)) throw new Error('port reserved');
const W = Math.min(1920, Number(args.w || 1280)), H = Math.min(1080, Number(args.h || 720));
const out = args.out || 'shots/ship-acts/a';
const dist = join(ROOT, `dist/anime-${port}-voyage`);
const only = (args.only || 'environment,water,town,harbor,landmarks,life,ship,explore').split(',').map((s) => s.trim());
if (!only.includes('ship')) only.push('ship');

// id -> page JS (returns a summary) and the sim seconds to run after it
const SHOTS = [
  ['a1_docked', `__voyageShot('DOCKED')`, 1.5],
  ['a1_docked_night', `(__voyageShot('DOCKED'), __setHours(20.2), 'ok')`, 1.5],
  ['a1_side_port', `(__voyageShot('DOCKED'), __voyageCam('sidePort'), document.getElementById('klc-ship').hidden = true)`, 0.5],
  ['a1_sendoff', `__voyageShot('SENDOFF')`, 6.5],
  ['a1_sendoff_close', `(__voyageShot('SENDOFF'), __voyage.setCam('crowd', true), 'ok')`, 5],
  ['a1_tapes_snap', `(__voyageShot('SENDOFF'), window.__c = __voyage.camRig('berth'), __voyage.send('HORN'), __voyage.send('CAST_OFF'), 'ok')`, 26, `__lookAt(__c.pos.toArray(), __c.look.toArray())`],
  ['a1_kanae', `__voyageKanae(100)`, 33, `(() => { const s = __sail.state, px = Math.cos(s.yaw), pz = -Math.sin(s.yaw); __lookAt([s.x + px * 170 - Math.sin(s.yaw) * 60, 26, s.z + pz * 170 - Math.cos(s.yaw) * 60], [s.x, 16, s.z]); })()`],
  ['a1_kanae_chase', `__voyageKanae(100)`, 26],
  // [ship] fix round 2: the market rows on the way out, 商港 passed to starboard, and the lettered transom (photo 04)
  ['a1_market', `__voyageAt(400)`, 10],
  ['a1_shoko', `__voyageAt(__shipRoute.SHOKO.s - 40)`, 8],
  ['a1_transom', `(__voyageShot('DOCKED'), document.getElementById('klc-ship').hidden = true, 'ok')`, 0.5, `__shipLook([21, 8.5, -60], [0, 3.0, -28.6])`],
  ['a2_transom', `(__voyageShot('WAIT'), document.getElementById('klc-ship').hidden = true, 'ok')`, 0.5, `__shipLook([-19, 7.5, -58], [0, 3.0, -28.6])`],
  ['a1_baymouth', `__voyageShot('BAY_MOUTH')`, 2],
  ['a2_set', `__voyageShot('OCEAN_SET')`, 14],
  ['a2_wait', `__voyageShot('WAIT')`, 3],
  ['a2_haul', `__voyageShot('HAUL', { keep: 2, fishOnScale: true })`, 0.6],
  ['a2_haul_night', `(__voyageShot('HAUL', { keep: 3, fishOnScale: true }), __setHours(22.5), 'ok')`, 0.6],
  // [ship] fix round 3: the starboard stern hourglass X (a small down-triangle over a large up-triangle meeting at one apex)
  // from the quarter and from abeam; the 'stern_quarter' ids are not part of the committed act list
  ['a2_stern_quarter', `(__voyageShot('WAIT'), document.getElementById('klc-ship').hidden = true, 'ok')`, 0.5, `__shipLook([-8.5, 7.8, -41], [-2.2, 4.3, -29.3])`],
  ['a2_stern_side', `(__voyageShot('WAIT'), document.getElementById('klc-ship').hidden = true, 'ok')`, 0.5, `__shipLook([-17, 5.2, -37], [-4.5, 4.0, -27.5])`],
  ['a2_side_stbd', `(__voyageShot('HAUL', { keep: 1 }), __voyageCam('side'), document.getElementById('klc-ship').hidden = true)`, 0.4],
  ['a2_stow', `__voyageShot('STOW')`, 1.5],
  ['a3_laspalmas', `__voyageShot('TRANSSHIP_LAS_PALMAS')`, 0.5],
  ['a3_reefer', `__voyageShot('REEFER')`, 0.5],
  ['a3_shimizu', `__voyageShot('SHIMIZU_WEIGH')`, 0.5],
  ['a3_home_approach', `__voyageShot('HOMECOMING')`, 12],
  ['a3_home', `__voyageShot('HOMECOMING')`, 27],
  ['a3_card', `__voyageShot('CARD')`, 0.5],
  // [ship] the talk-notes pass: the Shimizu inspection, the closing line and the facts
  // panel, in Japanese and in English (the 船のデータ / EN buttons of the voyage UI)
  ['a1_facts', `(__voyageShot('DOCKED'), __shipFacts(true), 'ok')`, 1],
  ['a3_shimizu_en', `(__voyageShot('SHIMIZU_WEIGH'), __shipFacts(false), __shipLang('en'), 'ok')`, 0.5],
  ['a3_card_en', `(__voyageShot('CARD'), __shipFacts(false), __shipLang('en'), 'ok')`, 0.5],
  ['a1_facts_en', `(__voyageShot('DOCKED'), __shipFacts(true), __shipLang('en'), 'ok')`, 1],
];
// [ship:integrate] --ui 1: the town UI is mounted (?ui=1) and these shots replace the act list: the boarding chip at
// the quay, and the places list with 「第一昭福丸に乗る」 at its head
const UI_SHOTS = [
  ['ui_chip', `(__voyage.exit(), __lookAt([548, 24, -18], [575, 6, -99]), 'ok')`, 1],
  ['ui_places', `(__voyage.exit(), __lookAt([548, 24, -18], [575, 6, -99]), __explore.ui.openSearch(true), 'ok')`, 1],
  // [ship:story] the 波怒棄館遺跡 story pin: the drone flies to 唐桑 and the card opens (explore/storypins.js)
  ['ui_story', `(__voyage.exit(), __explore.ui.openSearch(false), __story.open('story-hanukidate'), 'ok')`, 16],
];
const want = args.list ? new Set(args.list.split(',')) : null;

const t0 = Date.now();
if (!args.nobuild) {
  const r = await build({ entry: resolve(ROOT, 'src/anime/index.html'), outdir: dist, only });
  console.log(`build ${r.reused ? 'FAILED (reused last good build)' : 'ok'} ${r.ms ?? ''} ms`);
  if (r.reused) process.exitCode = 1;
}
const srv = serve({ port, dist });
let browser, page;
try {
  browser = await launch({ quiet: !args.verbose });
  page = await browser.page({ width: W, height: H });
  const q = new URLSearchParams({ shot: '1', w: String(W), h: String(H), t: '0', q: args.q || 'high', only: only.join(','), hours: '11' });
  if (args.q === 'phone') q.set('unsafe', '1');
  if (args.livery) q.set('livery', args.livery);
  if (args.ui) q.set('ui', '1');   // nendo | fallback (ship/flags.js: the URL wins); commit only fallback renders
  await page.goto(`${srv.url}index.html?${q}`);
  await page.waitFor('window.__ready === true', { timeout: Number(args.timeout || 280) * 1000 });
  console.log(`ready in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (args.auto) {
    // [ship:acts] the hands-free voyage end to end (auto mode): every state in order, a shot at each, no errors
    await page.eval('(__voyageInit({ auto: true }), __voyage.start(), true)');
    const seen = [];
    let passed = 0;   // [ship:story] a shot as each landmark is logged passed (かなえ大橋, 商港) on the way out
    let t = await page.eval('window.__ctx.time');
    for (let i = 0; i < 400; i++) {
      const st = await page.eval('__voyage.state');
      if (seen.at(-1) !== st) {
        seen.push(st);
        await page.frames(3);
        await page.shot(resolve(ROOT, `${out}_auto_${String(seen.length).padStart(2, '0')}_${st}.png`));
        console.log(JSON.stringify({ t: Math.round(t), state: st, data: await page.eval('({ km: __voyage.acts.data.setKm, kept: __voyage.acts.data.kept.length, released: __voyage.acts.data.released.length, landed: __voyage.acts.data.landedKg, haulEnd: __voyage.acts.data.haulEnd, passed: __voyage.acts.data.passed.slice() })') }));
      }
      const ps = await page.eval('__voyage.acts.data.passed.slice()');
      if (ps.length > passed) {
        passed = ps.length;
        await page.frames(3);
        await page.shot(resolve(ROOT, `${out}_auto_pass_${ps.at(-1)}.png`));
        console.log(JSON.stringify({ t: Math.round(t), pass: ps.at(-1), passed: ps, state: st, sail: await page.eval('({ x: Math.round(__sail.state.x), z: Math.round(__sail.state.z), kn: +(__sail.state.u * 1.944).toFixed(1) })') }));
      }
      if (st === 'CARD') break;
      t += 2; await page.eval(`__simTo(${t})`);
    }
    console.log('AUTO SEQUENCE', seen.join(' > '));
    if (seen.at(-1) !== 'CARD') { console.log('AUTO FAILED: did not reach CARD'); process.exitCode = 1; }
  } else await page.eval('__voyageInit()');
  // the voyage UI's own buttons: open or close the facts panel, switch the language (both re-render the UI)
  await page.eval(`(window.__shipFacts = (on) => { const b = document.querySelector('#klc-ship [data-a="facts"]'); if (b && (b.getAttribute('aria-pressed') === 'true') !== on) b.click(); return on; },
    window.__shipLang = (l) => { const ui = document.getElementById('klc-ship'); const b = ui && ui.querySelector('[data-a="lang"]'); if (b && ui.getAttribute('lang') !== l) b.click(); return l; }, true)`);
  for (const [id, js, secs, cam] of args.auto ? [] : args.ui ? UI_SHOTS : SHOTS) {
    if (want && !want.has(id)) continue;
    const sum = await page.eval(`(() => { const r = ${js}; return r; })()`);
    const tNow = await page.eval('window.__ctx.time');
    if (secs) await page.eval(`__simTo(${tNow + secs})`);
    if (cam) await page.eval(cam);
    await page.frames(4);
    const file = resolve(ROOT, `${out}_${id}.png`);
    await page.shot(file);
    const st = await page.eval(`({ state: __voyage.state, calls: __stats.calls, tris: __stats.triangles, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null, sendoff: __voyage.sendoff.stats, ocean: __voyage.ocean.stats, events: __sail.state.events.map((e) => e.type) })`);
    console.log(JSON.stringify({ id, file: relative(ROOT, file), sum, ...st }));
  }
  const errs = page.errors();
  const modErr = await page.eval('window.__errors');
  if (modErr?.length) { console.log('MODULE ERRORS:', JSON.stringify(modErr).slice(0, 2000)); process.exitCode = 1; }
  if (errs.length) { console.log('PAGE ERRORS:'); for (const l of errs.slice(0, 30)) console.log('  ', l.type, l.text.slice(0, 600)); process.exitCode = 1; }
} catch (e) {
  console.log('SHOTS FAILED:', e.message);
  try { for (const l of (page?.errors() || []).slice(0, 20)) console.log('  ', l.type, String(l.text).slice(0, 600)); console.log('  progress:', await page?.eval(`(document.getElementById('loadlabel') || {}).textContent + ' ' + JSON.stringify(window.__errors || [])`)); } catch (e2) { /* page gone */ }
  process.exitCode = 1;
} finally {
  await browser?.close();
  srv.stop();
}
