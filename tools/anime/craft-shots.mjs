// [craft] The camera of the craft audit (docs/CRAFT.md, docs/GLOSSARY.md): every screen and state of the app on one device and in one language, a screenshot each, and the in-page lint
// (tools/anime/craft-lint.js) after every state. Real touches (CDP Input.dispatchTouchEvent) on the phone, a real mouse on the desktop. Heavy (it builds the app and loads the town once per
// run), so it goes through the machine gate, or to the second machine:
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/craft-shots.mjs --device phone --out shots/craft/phone [--lang ja|en] [--time day|night] [--live live|cache|sample|error]
//     [--steps intro,hud,menu,sheets,search,photo,walk,sail,fly,drive,story,interiors,planet,season,night,lang,landscape] [--port 9450] [--reduced 1] [--src chirashi] [--net offline|slow] [--dpr 2]
//   .../the remote runner --wt ~/Developer/worktrees/klc-craft --back shots/craft/phone -- env -u NODE_OPTIONS bun tools/anime/craft-shots.mjs --device phone --out shots/craft/phone
// Devices: phone = iPhone 15 Pro, 393 x 852 @3x, Dynamic Island (top inset 59, bottom 34), landscape 852 x 393 (sides 59, bottom 21); desktop = 1600 x 900 @1; retina = 1440 x 900 @2.
// Output: <out>/<prefix><name>.jpg per state and <out>/report.json (the lint of every state, the page's errors, the steps that failed). Never leaves Chrome or the server running.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { buildAndServe, launch, phonePage, setViewport, fingers, center, sleep, ROOT } from './pad-lib.mjs';
import { lint } from './craft-lint.js';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : '1'] : null)).filter(Boolean));
const DEVICES = {
  phone: { width: 393, height: 852, dpr: 3, insets: { top: 59, bottom: 34, left: 0, right: 0 }, touch: true },
  phoneL: { width: 852, height: 393, dpr: 3, insets: { top: 0, bottom: 21, left: 59, right: 59 }, touch: true },
  desktop: { width: 1600, height: 900, dpr: 1, touch: false },
  retina: { width: 1440, height: 900, dpr: 2, touch: false },
};
const device = args.device || 'phone';
if (!DEVICES[device] || device === 'phoneL') throw new Error('--device phone | desktop | retina');
const D = { ...DEVICES[device], ...(args.dpr ? { dpr: Number(args.dpr) } : {}) };
const touch = D.touch;
const lang = args.lang || 'ja', time = args.time || 'day';
const port = Number(args.port || 9450);
const out = resolve(ROOT, args.out || `shots/craft/${device}`);
const STEPS = new Set((args.steps || 'intro,hud,menu,sheets,search,photo,walk,sail').split(','));   // the in-scope screens; fly, drive, story, interiors, planet, season, night, lang, landscape are opt-in
const quality = Number(args.jpeg || 80);
mkdirSync(out, { recursive: true });
const report = { device, lang, time, live: args.live || 'sample', reduced: !!args.reduced, src: args.src || null, shots: {}, errors: [], failed: [], started: new Date().toISOString() };
let prefix = '';

// ---------------------------------------------------------------------------------------------- the live feed, by mock
// The static server has no /api/live, so the app falls back to data/live/sample.json (flagged サンプル). The visitor on the real site sees the live answer, so the audit can serve one:
// 'live' = the sample's numbers dressed as a fresh live answer, 'cache' = the same, three hours old, 'error' = nothing at all (the sample file is withheld too), 'sample' = the default.
function liveMock(mode, now = Date.now()) {
  const s = JSON.parse(readFileSync(join(ROOT, 'data/live/sample.json'), 'utf8'));
  const iso = (t) => new Date(t).toISOString();
  const jst = (t) => iso(t + 9 * 3600e3).replace('Z', '+09:00');
  const at = mode === 'cache' ? now - 3 * 3600e3 : now;
  s.sample = false; s.fixture = false; delete s.sampleNote; s.updated = iso(now); s.at = iso(at);
  s.date = jst(now).slice(0, 10);
  s.origins = { weather: mode === 'cache' ? 'cache' : 'live', tide: 'live', port: mode === 'cache' ? 'cache' : 'live' };
  for (const k of ['weather', 'tide', 'port']) { s[k].origin = s.origins[k]; s[k].sample = false; s[k].fetchedAt = jst(at); }
  s.weather.observedAt = jst(at); s.weather.sky = s.weather.sky || 'clear';
  s.port.asOf = jst(at); s.port.date = jst(now).slice(0, 10);
  return s;
}
async function routeLive(browser, page, mode) {
  if (mode === 'sample') return;
  await page.S('Fetch.enable', { patterns: [{ urlPattern: '*/api/live*' }, ...(mode === 'error' ? [{ urlPattern: '*/data/live/sample.json*' }] : [])] });
  browser.on('Fetch.requestPaused', (p) => {
    if (mode === 'error') { page.S('Fetch.failRequest', { requestId: p.requestId, errorReason: 'InternetDisconnected' }).catch(() => {}); return; }
    page.S('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'content-type', value: 'application/json' }], body: Buffer.from(JSON.stringify(liveMock(mode))).toString('base64') }).catch(() => {});
  });
}

// ---------------------------------------------------------------------------------------------- the run
const { srv } = await buildAndServe(port, { minify: false });
let browser, page, f;
const ev = (x) => page.eval(x);
const lintJs = `(${lint.toString()})()`;
const shot = async (name, o = {}) => {
  const file = `${prefix}${name}`;
  try {
    await sleep(o.wait ?? 650); await page.frames(2);
    const buf = o.clip ? Buffer.from((await page.S('Page.captureScreenshot', { format: 'png', clip: { ...o.clip, scale: 1 } })).data, 'base64') : await page.shot();
    await sharp(buf).jpeg({ quality, mozjpeg: true }).toFile(join(out, file + '.jpg'));
    report.shots[file] = o.nolint ? null : await ev(lintJs).catch((e) => ({ error: String(e.message).slice(0, 200) }));
    console.log('saved', file);
  } catch (e) { report.failed.push({ shot: file, error: String(e.message).slice(0, 300) }); console.log('FAILED shot', file, e.message); }
};
const step = async (name, fn) => {
  try { await fn(); } catch (e) { report.failed.push({ step: name, error: String(e.stack || e.message).slice(0, 600) }); console.log('FAILED step', name, String(e.message).slice(0, 200)); }
};
/** A touch tap (phone) or a real mouse click (desktop) at the centre of the first element matching `sel`. */
const tap = async (sel, ms = 500) => {
  const c = await center(page, sel);
  if (!c || c.w < 1) throw new Error('no such element: ' + sel);
  if (touch) await f.tap(c.x, c.y);
  else { for (const [type, extra] of [['mouseMoved', {}], ['mousePressed', { button: 'left', clickCount: 1 }], ['mouseReleased', { button: 'left', clickCount: 1 }]]) { await page.S('Input.dispatchMouseEvent', { type, x: c.x, y: c.y, ...extra }); await sleep(type === 'mousePressed' ? 70 : 20); } }
  await sleep(ms); return c;
};
const hover = async (sel) => { const c = await center(page, sel); if (c) await page.S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: c.y }); await sleep(250); return c; };
const exists = (sel) => ev(`!!document.querySelector(${JSON.stringify(sel)}) && document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect().width > 1`);
const key = async (code, k) => { await page.S('Input.dispatchKeyEvent', { type: 'keyDown', code, key: k || code.replace(/^Key|^Digit/, '').toLowerCase(), windowsVirtualKeyCode: (k || code.replace(/^Key|^Digit/, '')).toUpperCase().charCodeAt(0) }); await page.S('Input.dispatchKeyEvent', { type: 'keyUp', code, key: k || code.replace(/^Key|^Digit/, '').toLowerCase() }); await sleep(200); };
const closeAll = async () => {
  await ev(`(() => { const u = document.querySelector('#klc-ui'); if (!u) return; if (u.dataset.menu === '1') document.querySelector('[data-act="menu"]')?.click(); if (u.dataset.sheet) document.querySelector('[data-act="sheet"][data-sheet="' + u.dataset.sheet + '"]')?.click();
    if (u.dataset.credits === '1') document.querySelector('[data-act="credits-close"]')?.click(); if (!document.querySelector('#klc-ui .arrivals')?.hidden) document.querySelector('[data-act="arrivals"]')?.click();
    window.__explore?.ui?.openSearch(false); window.__explore?.ui?.openMap(false); window.__story?.card?.close?.(); if (window.__ctx?.planet?.active) window.__ctx.planet.exit(); })()`);
  await sleep(500);
};
const hideCoach = () => ev('window.__pad && window.__pad.dismissCoach && window.__pad.dismissCoach()').catch(() => {});

try {
  browser = await launch({ quiet: true });
  page = touch ? await phonePage(browser, D) : await browser.page({ width: D.width, height: D.height, dpr: D.dpr });
  if (touch) f = fingers(page);
  if (args.reduced) await page.S('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await page.S('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Tokyo' }).catch(() => {});   // the audit's clock is Japan's, whatever machine it runs on
  await routeLive(browser, page, args.live || 'sample');
  if (args.net === 'offline') await page.S('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 }).catch(() => {});
  if (args.net === 'slow') { await page.S('Network.enable'); await page.S('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 200 * 1024, uploadThroughput: 100 * 1024 }); }
  const q = new URLSearchParams({ lang, ...(time === 'night' ? { preset: 'yoru' } : {}), ...(args.src ? { src: args.src } : {}), ...(args.q ? Object.fromEntries(new URLSearchParams(args.q)) : {}) });
  const url = `${srv.url}index.html?${q}`;
  const t0 = Date.now();
  await page.goto(url);

  // ---- 1. the title card and the loading (what is seen while the town builds)
  if (STEPS.has('intro')) await step('intro-loading', async () => {
    await sleep(1800); await shot('intro_loading_0', { wait: 100 });
    for (let i = 0; i < 8; i++) { // whatever the label says now, and one frame from the middle of the load
      await sleep(5000);
      if (await ev("document.body.classList.contains('loaded')")) break;
      const lab = await ev("document.getElementById('loadlabel')?.textContent || ''");
      if (i === 3) await shot('intro_loading_mid', { wait: 50 });
      report.loadLabels = [...(report.loadLabels || []), lab];
    }
  });
  await page.waitFor("document.body.classList.contains('loaded')", { timeout: 290000 });
  report.loadMs = Date.now() - t0;
  if (STEPS.has('intro')) await step('intro-ready', async () => { await sleep(900); await shot('intro_ready'); });

  // ---- 2. enter
  await step('enter', async () => {
    await tap('#go', 300);
    await page.waitFor("document.body.classList.contains('playing')", { timeout: 25000 });
    await sleep(2500);
    if (touch) await page.waitFor('window.__pad && !window.__pad.hidden', { timeout: 30000 }).catch(() => {});
  });
  if (STEPS.has('hud')) await step('hud-hero', async () => {
    await shot('hero_coach', { wait: 1200 });   // the first-run hint, if the pad shows one
    await hideCoach(); await sleep(700);
    await shot('hero');
    if (!touch) { await key('Tab'); await key('Tab'); await key('Tab'); await shot('hero_focus', { nolint: true }); await ev('document.activeElement && document.activeElement.blur()'); }   // the keyboard focus ring (CRAFT 7)
  });
  const ui = async (p) => {
    const was = prefix; prefix = p; const P = prefix;
    // ------------------------------------------------------------- the menu, the credits, the labels
    if (STEPS.has('menu') && touch) {
      await step(P + 'menu', async () => {
        await closeAll(); await tap('#klc-ui .mbtn'); await shot('menu');
        await tap('#klc-ui .tools [data-act="credits"]', 700); await shot('credits');
        await tap('#klc-ui [data-act="credits-close"]', 500);
        await tap('#klc-ui .mbtn'); await tap('#klc-ui .tools [data-act="labels"]', 400); await shot('menu_labels_on');
        await tap('#klc-ui .mbtn', 600); await sleep(1200); await shot('world_labels_on');
        await tap('#klc-ui .mbtn'); await tap('#klc-ui .tools [data-act="labels"]', 300); await closeAll();
      });
    }
    // ------------------------------------------------------------- the places / time sheets, the arrivals popover
    if (STEPS.has('sheets')) {
      await step(P + 'sheets', async () => {
        await closeAll();
        if (touch) {
          await tap('#klc-ui .pbar button[data-sheet="places"]', 700); await shot('sheet_places');
          await ev(`document.querySelector('#klc-ui .places ul')?.scrollTo({ left: 400 })`); await sleep(400); await shot('sheet_places_scrolled');
          await tap('#klc-ui .pbar button[data-sheet="places"]', 400);
          await tap('#klc-ui .pbar button[data-sheet="time"]', 700); await shot('sheet_time');
          await tap('#klc-ui .pbar button[data-sheet="time"]', 400);
        } else {
          await tap('#klc-ui [data-act="places"]', 600); await shot('places_open');
          await hover('#klc-ui .dock [data-act="preset"][data-id="yuyake"]'); await shot('hover_preset', { nolint: true });
          await tap('#klc-ui [data-act="places"]', 400);
        }
        await tap('#klc-ui .brand .chip', 700); await shot('arrivals');
        await ev(`document.querySelector('#klc-ui .arrivals ol')?.scrollTo({ top: 200 })`); await sleep(300); await shot('arrivals_scrolled', { nolint: true });
        await tap('#klc-ui .brand .chip', 400);
      });
    }
    // ------------------------------------------------------------- search (JA and EN), the full map
    if (STEPS.has('search')) {
      await step(P + 'search', async () => {
        await closeAll();
        await tap('#klc-x .xbar button[data-act="search"]', 700); await shot('search_open');
        const term = lang === 'en' || p.startsWith('en_') ? 'station' : 'すし';
        await ev(`(() => { const i = document.querySelector('#klc-x .xsearch input'); i.focus(); i.value = ${JSON.stringify(term)}; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
        await sleep(900); await shot('search_results');
        await ev(`(() => { const i = document.querySelector('#klc-x .xsearch input'); i.value = 'zzzzqq'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
        await sleep(700); await shot('search_none');
        await ev(`(() => { const i = document.querySelector('#klc-x .xsearch input'); i.value = ${JSON.stringify(p.startsWith('en_') || lang === 'en' ? 'fish' : '魚市場')}; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
        await sleep(700); await shot('search_results_2');
        await closeAll();
        await tap(touch ? '#klc-x .mini' : '#klc-x .xbar button[data-act="map"]', 900); await shot('map');
        await closeAll();
      });
    }
    prefix = was;
  };
  await ui('');
  if (STEPS.has('hud')) await step('hud-after', async () => { await closeAll(); await shot('hero_clean'); });

  // ---- 3. photo mode and the share sheet
  if (STEPS.has('photo')) await step('photo', async () => {
    await closeAll();
    if (touch) await tap('#klc-ui .pbar button[data-sheet="time"]', 700);
    await tap('#klc-ui .dock [data-act="photo"]', 600); await shot('photo_capturing', { wait: 150 });
    await page.waitFor("document.querySelector('#klc-photo')?.dataset.state === 'ready'", { timeout: 40000 }).catch(() => {});
    await sleep(900); await shot('photo_card');
    if (await exists('#klc-photo [data-a="close"]')) await tap('#klc-photo [data-a="close"]', 700);   // (a desktop saves the PNG straight away: there is no card to close)
    await closeAll(); await shot('photo_done');
  });

  // ---- 4. walk, fly, drive and the ship
  {
    if (STEPS.has('walk')) await step('walk', async () => {
      await closeAll();
      await ev("window.__camSpec('walk')"); await sleep(1800);
      if (touch) { await shot('walk_pad'); await tap('#klc-pad .gear', 600); await shot('walk_pad_settings'); await tap('#klc-pad .gear', 400); }
      else await shot('walk');
    });
    if (STEPS.has('fly')) await step('fly', async () => { await ev('window.__ctx.playerObj.fly = true'); await sleep(1500); await shot('fly'); await ev('window.__ctx.playerObj.fly = false'); await sleep(600); });
    if (STEPS.has('drive')) await step('drive', async () => {
      await ev("window.__camSpec('walk'); window.__explore.drive.enter()"); await sleep(2200); await shot('drive');
      await ev('window.__explore.drive.exit()'); await sleep(800);
    });
    if (STEPS.has('sail')) await step('sail', async () => {
      await ev('window.__voyageAt(400)'); await sleep(3500); await shot('sail');
      await ev('window.__voyage.exit()'); await sleep(1200); await ev("window.__camSpec('walk')"); await sleep(1500);
    });
    if (STEPS.has('story')) await step('story-pin', async () => {
      const ids = await ev('(() => { const s = window.__story; return s ? s.places.map((p) => p.id).slice(0, 3) : []; })()').catch(() => []);
      report.storyIds = ids;
      if (ids.length) { await ev(`window.__story.open(${JSON.stringify(ids[0])})`); await sleep(2200); await shot('story_card'); await closeAll(); await ev("window.__camSpec('walk')"); await sleep(1200); }
    });
  }

  // ---- 5. the walk-in interiors
  if (STEPS.has('interiors')) {
    const list = await ev('(window.__explore?.interiors?.list || []).map((i) => ({ id: i.id, inside: i.inside, entrance: i.entrance }))').catch(() => []);
    report.interiors = list.map((i) => i.id);
    for (const it of list) {
      await step('interior-' + it.id, async () => {
        const e = it.entrance;
        if (e) { await ev(`window.__setCam(${e.x}, null, ${e.z}, ${e.yaw ?? 0}, 0)`); await sleep(2200); await shot(`interior_${it.id}_door`); }
        const n = it.inside; await ev(`window.__setCam(${n.x}, ${n.y ?? 'null'}, ${n.z}, ${n.yaw ?? 0}, ${n.pitch ?? 0})`); await sleep(2600); await shot(`interior_${it.id}`);
        await ev(`window.__setCam(${n.x}, ${n.y ?? 'null'}, ${n.z}, ${(n.yaw ?? 0) + 2.2}, -0.05)`); await sleep(900); await shot(`interior_${it.id}_b`, { nolint: true });
      });
    }
    await step('interiors-out', async () => { await ev("window.__camSpec('walk')"); await sleep(1500); });
  }

  // ---- 6. the planet
  if (STEPS.has('planet')) await step('planet', async () => { await closeAll(); await ev('window.__ctx.planet.enter({ t: 0 })'); await sleep(2800); await shot('planet'); await ev('window.__ctx.planet.exit()'); await sleep(1200); });

  // ---- 7. seasons (K)
  if (STEPS.has('season')) await step('season', async () => {
    await ev("window.__camSpec('hero')"); await sleep(1500);
    for (let i = 0; i < 4; i++) { await ev('window.__life.season.next()'); await sleep(2600); await shot('season_' + (await ev('window.__life.season.id'))); }
    await ev('window.__life.season.next()'); await sleep(1200);
  });

  // ---- 8. night (the same screens by the lamps)
  if (STEPS.has('night') && time === 'day') await step('night', async () => {
    await closeAll(); await ev("window.__lifeSet('yoru')"); await sleep(3500);
    const was = prefix; prefix = 'night_';
    await shot('hero'); if (touch) { await tap('#klc-ui .mbtn'); await shot('menu'); await closeAll(); await tap('#klc-ui .pbar button[data-sheet="places"]', 700); await shot('sheet_places'); await closeAll(); await tap('#klc-ui .pbar button[data-sheet="time"]', 700); await shot('sheet_time'); await closeAll(); }
    else { await tap('#klc-ui [data-act="places"]', 600); await shot('places_open'); await tap('#klc-ui [data-act="places"]', 400); }
    await ev("window.__camSpec('walk')"); await sleep(1800); await shot('walk');
    await ev("window.__camSpec('tour:market')").catch(() => {}); await sleep(1800); await shot('market');
    prefix = was; await ev("window.__lifeSet('yugata')"); await sleep(1500);
  });

  // ---- 9. the other language: every screen again, through the real language button
  if (STEPS.has('lang') && lang === 'ja') await step('lang', async () => {
    await closeAll();
    if (touch) { await tap('#klc-ui .mbtn'); await tap('#klc-ui .tools [data-act="lang"]', 800); await closeAll(); }
    else await tap('#klc-ui .tools [data-act="lang"]', 800);
    await ev("window.__camSpec('hero')"); await sleep(1500);
    await shot('en_hero');
    await ui('en_');
    if (touch) { await tap('#klc-ui .mbtn'); await tap('#klc-ui .tools [data-act="lang"]', 800); await closeAll(); } else await tap('#klc-ui .tools [data-act="lang"]', 800);
  });

  // ---- 10. landscape (a phone turned on its side)
  if (STEPS.has('landscape') && touch) await step('landscape', async () => {
    await closeAll();
    await setViewport(page, DEVICES.phoneL); await sleep(1500);
    await ev("window.__camSpec('hero')"); await sleep(1500);
    await shot('land_hero');
    await ev("window.__camSpec('walk')"); await sleep(1800); await hideCoach(); await shot('land_walk');
    await tap('#klc-ui .brand .chip', 700); await shot('land_arrivals'); await tap('#klc-ui .brand .chip', 400);
    await tap('#klc-ui [data-act="places"]', 600).catch(() => {}); await shot('land_places'); await tap('#klc-ui [data-act="places"]', 400).catch(() => {});
    await tap('#klc-x .xbar button[data-act="search"]', 700); await shot('land_search'); await closeAll();
    await tap('#klc-x .xbar button[data-act="map"]', 900).catch(() => {}); await shot('land_map'); await closeAll();
    await ev('window.__voyageAt(400)'); await sleep(3500); await shot('land_sail');
    await ev('window.__voyage.exit()'); await sleep(1200); await ev("window.__camSpec('walk')"); await sleep(1200);
    await ev("window.__explore.drive.enter()"); await sleep(2200); await shot('land_drive'); await ev('window.__explore.drive.exit()'); await sleep(800);
    await setViewport(page, D); await sleep(1500);
  });

  report.errors = page.errors().filter((e) => !/api\/live|sample\.json|ERR_INTERNET|Failed to load resource/.test(e.text)).slice(0, 20).map((e) => ({ type: e.type, text: String(e.text).slice(0, 300) }));
  report.moduleErrors = await ev('window.__errors || []').catch(() => []);
  report.finished = new Date().toISOString();
} catch (e) {
  report.fatal = String(e.stack || e.message).slice(0, 800); console.log('FATAL', e.message);
  try { if (page) await shot('fatal', { wait: 100, nolint: true }); } catch { /* none */ }
  process.exitCode = 1;
} finally {
  try { writeFileSync(join(out, `${args.tag || 'report'}.json`), JSON.stringify(report, null, 1)); } catch (e) { console.log('could not write the report', e.message); }
  await f?.release?.().catch(() => {});
  await browser?.close(); srv.stop();
}
console.log(`done: ${Object.keys(report.shots).length} shots, ${report.failed.length} failed, ${report.errors.length} page errors, load ${report.loadMs} ms`);
