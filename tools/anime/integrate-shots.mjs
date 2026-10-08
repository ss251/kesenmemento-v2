// [integrate] Phone screenshots of the merged app (pad + ship + the decluttered portrait HUD) into docs/shots/integrate/.
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/integrate-shots.mjs [--port 8991] [--out docs/shots/integrate] [--dpr 2] [--only town,sail,voyage] [--nobuild 1]
// iPhone-shaped page (390x844 / 844x390, safe-area insets), real touches through CDP; prints the pad-vs-panel overlaps for every shot.
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { buildAndServe, launch, phonePage, setViewport, enterTown, fingers, center, layoutReport, sleep, ROOT } from './pad-lib.mjs';
import { serve } from './cdp.mjs';
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : '1'] : null)).filter(Boolean));
const port = Number(args.port || 8991), out = resolve(ROOT, args.out || 'docs/shots/integrate'), dpr = Number(args.dpr || 2);
if ([8787, 8790, 8791].includes(port)) throw new Error('port reserved');
const PORTRAIT = { width: 390, height: 844, dpr, insets: { top: 47, bottom: 34, left: 0, right: 0 } };
const LANDSCAPE = { width: 844, height: 390, dpr, insets: { top: 0, bottom: 21, left: 47, right: 47 } };
const only = new Set((args.only || 'town,sail,voyage').split(','));
const prefix = args.prefix || '';
let srv;
if (args.nobuild) srv = serve({ port, dist: join(ROOT, `dist/anime-${port}`) }); else ({ srv } = await buildAndServe(port));
let browser;
const seen = new Set();   // every path the page requested (checked against scripts/public-mirror.js allowed())
try {
  browser = await launch({ quiet: true });
  browser.on('Network.requestWillBeSent', (p) => { try { const u = new URL(p.request.url); if (u.origin === srv.url.replace(/\/$/, '')) seen.add(u.pathname); } catch { /* data: urls */ } });
  const page = await phonePage(browser, PORTRAIT);
  await page.S('Network.enable');
  const f = await enterTown(page, `${srv.url}index.html${args.q ? '?' + args.q : ''}`);
  await sleep(1300);
  await page.eval("window.__camSpec('walk')");
  await page.waitFor('window.__pad && !window.__pad.hidden', { timeout: 20000 });
  await page.eval('window.__pad.dismissCoach()');
  const report = {};
  const shot = async (name, wait = 600) => {
    await sleep(wait); const buf = await page.shot();
    await sharp(buf).png({ palette: true, quality: 94, effort: 8, dither: 0.6 }).toFile(join(out, prefix + name + '.png'));
    const r = await layoutReport(page); r.sup = await page.eval('window.__pad.suppressed'); report[name] = { sup: r.sup, overlaps: r.overlaps, panelOverlaps: r.panelOverlaps, outside: r.outside, scrollW: r.scrollW, vw: r.vw };
    console.log('saved', name, JSON.stringify(report[name]));
  };
  const ORI = { portrait: PORTRAIT, landscape: LANDSCAPE };
  for (const [ori, vp] of Object.entries(ORI)) {
    await setViewport(page, vp); await sleep(900);
    if (only.has('town')) { await page.eval("window.__camSpec('walk')"); await shot(`town_${ori}`, 1100); }
  }
  if (only.has('dbg')) {
    await setViewport(page, PORTRAIT); await sleep(900);
    const st = () => page.eval(`({ arr: !document.querySelector('#klc-ui .arrivals').hidden, ph: window.__pad.hidden, sup: window.__pad.suppressed, set: !document.querySelector('#klc-pad .settings').hidden, dh: document.querySelector('#klc-pad').dataset.hidden })`);
    const tapSel = async (sel) => { const c = await center(page, sel); await f.tap(c.x, c.y); await sleep(450); return c; };
    const ms = () => page.eval(`({ map: !document.querySelector('#klc-x .xmap').hidden, search: !document.querySelector('#klc-x .xsearch').hidden, sup: window.__pad.suppressed, mini: getComputedStyle(document.querySelector('#klc-x .mini')).display })`);
    await tapSel('#klc-x .mini'); console.log('mini', JSON.stringify(await ms()));
    const cc = await tapSel('#klc-x .xmap [data-act="map-close"]'); console.log('close', JSON.stringify(cc), JSON.stringify(await ms()));
    await sleep(800); console.log('later', JSON.stringify(await ms()));
    await tapSel('#klc-x .xbar button[data-act="search"]'); console.log('search', JSON.stringify(await ms()));
    const xc = await tapSel('#klc-x .xsearch .x'); console.log('x', JSON.stringify(xc), JSON.stringify(await ms()));
    await sleep(800); console.log('later2', JSON.stringify(await ms()));
    console.log('0', JSON.stringify(await st()));
    await tapSel('#klc-ui .brand .chip'); console.log('chip1', JSON.stringify(await st()));
    await tapSel('#klc-ui .brand .chip'); console.log('chip2', JSON.stringify(await st()));
    const g = await tapSel('#klc-pad .gear'); console.log('gear', JSON.stringify(g), JSON.stringify(await st()));
    console.log(await page.eval(`(() => { const g = document.querySelector('#klc-pad .gear').getBoundingClientRect(); const e = document.elementFromPoint(g.left + g.width / 2, g.top + g.height / 2); return e ? e.tagName + '.' + e.className + ' in ' + (e.closest('#klc-pad') ? 'pad' : e.closest('[id]')?.id) : null; })()`));
  }
  if (only.has('lay')) {
    const setMode = async (m) => { await page.eval(`(() => { const e = window.__explore, p = window.__ctx.playerObj; if (e.drive.active) e.drive.exit(); p.fly = ${m === 'fly'}; if (${m === 'drive'}) e.drive.enter(); })()`); await sleep(1100); };
    for (const [ori, vp] of Object.entries(ORI)) {
      await setViewport(page, vp); await sleep(900);
      for (const lefty of [false, true]) {
        await page.eval(`window.__pad.setSetting('leftHanded', ${lefty})`);
        for (const m of ['walk', 'fly', 'drive']) {
          await setMode(m);
          const r = await layoutReport(page);
          console.log(ori, lefty ? 'lefty' : 'right', m, JSON.stringify({ ov: r.overlaps, pov: r.panelOverlaps, self: r.selfOverlaps, out: r.outside, ghost: r.pad.ghost && [r.pad.ghost.l, r.pad.ghost.t, r.pad.ghost.r, r.pad.ghost.b], btns: Object.entries(r.pad).filter(([k]) => k.startsWith('btn:')).map(([k, b]) => [k, Math.round((b.l + b.r) / 2), Math.round((b.t + b.b) / 2)]), hidden: await page.eval('window.__pad.hidden') }));
        }
        await setMode('walk');
      }
      await page.eval("window.__pad.setSetting('leftHanded', false)");
    }
  }
  if (only.has('menu')) {
    // the phone HUD's two taps: ☰ then an item; a pill then a place / an hour (real touches)
    await setViewport(page, PORTRAIT); await sleep(900);
    await page.eval("window.__camSpec('walk')"); await sleep(900);
    const tapSel = async (sel) => { const c = await center(page, sel); await f.tap(c.x, c.y); await sleep(500); return c; };
    await tapSel('#klc-ui .mbtn'); await shot('menu_portrait', 400);
    await tapSel('#klc-ui .mbtn');
    await tapSel('#klc-ui .pbar button[data-sheet="time"]'); await shot('sheet_time_portrait', 400);
    await tapSel('#klc-ui .pbar button[data-sheet="places"]'); await shot('sheet_places_portrait', 400);
    await tapSel('#klc-ui .pbar button[data-sheet="places"]');
    await tapSel('#klc-ui .brand .chip'); await shot('arrivals_portrait', 400);
    await tapSel('#klc-ui .brand .chip');
    await tapSel('#klc-x .xbar button[data-act="search"]'); await shot('search_portrait', 400);
    await tapSel('#klc-x .xsearch .x');
    await tapSel('#klc-x .mini'); await shot('map_portrait', 600);
    await tapSel('#klc-x .xmap [data-act="map-close"]');
  }
  if (only.has('sail') || only.has('voyage')) {
    // the ship on a phone: at the helm (the sail mode with its pad), then the beats that own the bottom of the screen
    const beats = [
      ['sail', `(window.__voyageAt(400), 'ok')`, 3.0, only.has('sail')],
      ['docked', `(window.__voyage.exit(), window.__voyageShot('DOCKED'), 'ok')`, 1.2, only.has('voyage')],
      ['haul', `window.__voyageShot('HAUL', { keep: 2, fishOnScale: true })`, 2.5, only.has('voyage')],
      ['set', `window.__voyageShot('OCEAN_SET')`, 2.0, only.has('voyage')],
      ['card', `window.__voyageShot('SHIMIZU_WEIGH')`, 1.5, only.has('voyage')],
      ['final', `window.__voyageShot('CARD')`, 1.5, only.has('voyage')],
    ];
    for (const [ori, vp] of Object.entries(ORI)) {
      await setViewport(page, vp); await sleep(700);
      for (const [name, js, wait, on] of beats) {
        if (!on) continue;
        await page.eval(js); await sleep(wait * 1000);
        console.log(name, ori, JSON.stringify(await page.eval(`({ mode: window.__pad.mode, hidden: window.__pad.hidden, sup: window.__pad.suppressed, vox: window.__voyage.active, state: window.__voyage.state, sail: window.__sail.active, ap: window.__sail.state.autopilot })`)));
        await shot(`${name}_${ori}`, 300);
      }
      await page.eval('window.__voyage.exit()'); await sleep(500);
    }
  }
  if (only.has('net')) {
    // walk the whole voyage once so every lazy fetch happens, then list what the public mirror would refuse
    await page.eval("window.__voyageAt(400)"); await sleep(2500);
    for (const st of ['SENDOFF', 'HAUL', 'WAIT', 'SHIMIZU_WEIGH', 'CARD']) { await page.eval(`window.__voyageShot('${st}')`); await sleep(1500); }
    await page.eval('window.__voyage.exit()'); await sleep(500);
    const { allowed } = await import('../../scripts/public-mirror.js');
    const all = [...seen].sort(), bad = all.filter((p) => !allowed(p));
    console.log('requested', all.length, 'paths; refused by the mirror:', JSON.stringify(bad));
    console.log(all.filter((p) => !p.endsWith('.js')).join('\n'));
  }
  void f; void center;
  console.log('errors', JSON.stringify(page.errors().filter((e) => !/api\/live/.test(e.text)).slice(0, 5)));
} finally { await browser?.close(); srv.stop(); }
