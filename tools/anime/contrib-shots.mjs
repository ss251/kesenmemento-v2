// [contrib] End-to-end run of the 「修正を報告」 sheet in headless Chrome against the in-memory backend (tools/anime/contrib-mock-api.mjs).
// Per viewport (desktop 1440x900, phone portrait 390x844, phone landscape 844x390 with iPhone safe-area insets) it:
//   - opens the sheet the way a visitor does (a click on desktop; real touches on a phone: ☰, then 「修正を報告」), and checks the dialog, the focus trap,
//     Esc, the focus return, that the town's keys do not run while typing, the 44 px targets (phones), the safe area, the layout (no shift when the
//     screenshot arrives or the kind switches, the HUD does not move), the screenshot capture (size, JPEG, canvases freed, blob URL revoked);
//   - fills it in with synthetic photos (made-up shop fronts with synthetic GPS EXIF), sends it over a throttled network (progress), checks what the
//     backend received (pose, screenshot, the photos byte for byte), and shows マイ投稿 (pending, accepted, 反映済み（v…）, not used) and the leaderboard;
//   - makes a transfer code with its QR code, an error while offline and the retry, the privacy notice (the backend's text), the fix kind, English and night;
//   - asks before deleting everything the contributor sent (a phone: the question and its tap targets; desktop and landscape: the whole delete, checked on the backend);
//   - on desktop also restores a view from its ?cam= link and checks that the limits and points the backend announces (GET /health) reach the sheet; on the phone moves the login to a "second device" (another origin) through the QR link.
// Screenshots go to docs/shots/contrib/. Every check prints PASS / FAIL; a failure makes the exit code non-zero. It is a plain script, not a bun test
// (child processes inside `bun test` return nothing on this machine, and Chrome is one).
//
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/contrib-shots.mjs [--port 8986] [--api 8988] [--out docs/shots/contrib]
//        [--only desktop,portrait,landscape,config] [--nobuild 1] [--prefix ""] [--quick 1]
//   --quick 1: the main flow only (no offline / English / night, no second page loads). Ports: the app 8986, the mock backend 8988 (this branch: 8985-8988).
import { join, resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { buildAndServe, launch, phonePage, enterTown, fingers, center, sleep, ROOT } from './pad-lib.mjs';
import { serve } from './cdp.mjs';
import { startMock, DEFAULTS } from './contrib-mock-api.mjs';
import { poseToUrl, norm180, poseProblems } from '../../src/anime/core/pose.js';
import { qrEncode, qrToPath } from '../../src/anime/ui/qr.js';
import { claimUrl } from '../../src/anime/ui/contrib-lib.js';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : '1'] : null)).filter(Boolean));
const APP_PORT = Number(args.port || 8986), API_PORT = Number(args.api || 8988);
for (const p of [APP_PORT, API_PORT]) if (!(p >= 8985 && p <= 8988)) throw new Error(`port ${p}: this branch uses 8985-8988`);
const OUT = resolve(ROOT, args.out || 'docs/shots/contrib'), PREFIX = args.prefix || '', QUICK = !!args.quick;
const only = new Set((args.only || 'desktop,portrait,landscape').split(','));   // (also `config`: only the check that the numbers announced by GET /health reach the sheet)
mkdirSync(OUT, { recursive: true });
const FIX = join(ROOT, 'dist/contrib-e2e'); mkdirSync(FIX, { recursive: true });
const API = `http://127.0.0.1:${API_PORT}`;

const PROFILES = {
  desktop: { width: 1440, height: 900, dpr: 1, phone: false },
  portrait: { width: 390, height: 844, dpr: 2, phone: true, insets: { top: 47, bottom: 34, left: 0, right: 0 } },
  landscape: { width: 844, height: 390, dpr: 2, phone: true, insets: { top: 0, bottom: 21, left: 47, right: 47 } },
};

// ------------------------------------------------------------------ checks
let failed = 0, passed = 0;
const check = (name, ok, detail = '') => { if (ok) passed++; else failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); return !!ok; };
const near = (a, b, tol = 0.51) => Math.abs(a - b) <= tol;
const sha = (b) => createHash('sha256').update(b).digest('hex');

// ------------------------------------------------------------------ synthetic fixtures (no real photos, no real people)
/** A made-up shop front as a JPEG with synthetic GPS EXIF (a point on the inner bay) and a compass heading. */
async function makePhoto(name, hue = 205) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue},70%,78%)"/><stop offset="1" stop-color="hsl(${hue},60%,92%)"/></linearGradient></defs>
    <rect width="1600" height="1200" fill="url(#s)"/><rect y="880" width="1600" height="320" fill="#8e97a8"/><rect x="220" y="360" width="1000" height="520" fill="#e8d9bd"/><rect x="220" y="320" width="1000" height="70" fill="#a8403a"/>
    <rect x="300" y="520" width="240" height="360" fill="#33405a"/><rect x="640" y="500" width="460" height="240" fill="#bcd6e8"/><rect x="1230" y="200" width="22" height="680" fill="#555"/><rect x="1150" y="200" width="300" height="140" fill="#2f7fae"/>
    <text x="1300" y="285" font-size="64" text-anchor="middle" fill="#fff" font-family="sans-serif" font-weight="700">KAMABOKO</text></svg>`;
  const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 82 })
    .withExif({ IFD0: { Make: 'Synthetic', Model: 'Test camera' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '38/1 54/1 21.6/1', GPSLongitudeRef: 'E', GPSLongitude: '141/1 34/1 30/1', GPSImgDirectionRef: 'T', GPSImgDirection: '270/1' } }).toBuffer();
  const file = join(FIX, name); writeFileSync(file, buf);
  return { file, buf, bytes: buf.length, sha: sha(buf) };
}

// ------------------------------------------------------------------ one page: the helpers every scenario uses
async function openPage(browser, P, { search = '', host = '127.0.0.1' } = {}) {
  const page = P.phone ? await phonePage(browser, P) : await browser.page({ width: P.width, height: P.height, dpr: P.dpr });
  await page.S('Page.enable'); await page.S('DOM.enable'); await page.S('Network.enable');
  const f = P.phone ? fingers(page) : null;
  const portrait = P.height > P.width;
  // a probe from the very first script: canvases and blob URLs created while recording, layout shifts, and a switch that slows toBlob (to keep the screenshot waiting)
  await page.S('Page.addScriptToEvaluateOnNewDocument', { source: `
    (() => {
      const canvases = new Set(), urls = new Set();
      const ce = Document.prototype.createElement; Document.prototype.createElement = function (t, ...a) { const el = ce.call(this, t, ...a); if (window.__rec && String(t).toLowerCase() === 'canvas') canvases.add(el); return el; };
      const cu = URL.createObjectURL.bind(URL), ru = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = (b) => { const u = cu(b); urls.add(u); return u; }; URL.revokeObjectURL = (u) => { urls.delete(u); return ru(u); };
      const tb = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (cb, ...a) { const d = window.__slowShot | 0; return d ? tb.call(this, (b) => setTimeout(() => cb(b), d), ...a) : tb.call(this, cb, ...a); };
      window.__probe = { canvases, urls, cls: 0, t0: 0, shifts: [] };
      const elOf = (n) => (n && (n.nodeType === 1 ? n : n.parentElement)) || null;
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) { window.__probe.cls += e.value; window.__probe.shifts.push({ v: +e.value.toFixed(4), t: Math.round(e.startTime), sheet: (e.sources || []).some((s) => { const n = elOf(s.node); return !!(n && n.closest('#klc-contrib')); }), src: (e.sources || []).map((s) => { const n = elOf(s.node); return n ? n.id || String(n.className || n.nodeName).slice(0, 24) : '?'; }).slice(0, 3) }); } }).observe({ type: 'layout-shift', buffered: true }); } catch (e) { /* no layout-shift entries */ }
    })();` });
  const url = `http://${host}:${APP_PORT}/index.html?contrib=1&contribApi=${encodeURIComponent(API)}${P.phone ? '&touch=1' : ''}${search}`;
  const T = {
    P, page, f, url, portrait,
    async tap(sel) {
      await page.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (e && e.closest('.kc-body')) e.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }); })()`); await sleep(120);
      const c = await center(page, sel); if (!c || !c.w) throw new Error('no visible element ' + sel);
      if (P.phone) await f.tap(c.x, c.y);
      else { await page.S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: c.y }); await page.S('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', clickCount: 1 }); await page.S('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', clickCount: 1 }); }
      await sleep(350);
    },
    async type(sel, text) { await T.tap(sel); await page.S('Input.insertText', { text }); await sleep(200); },
    /** A real key press (the page sees keydown / keyup; `text` makes it type into a focused field). */
    async key(k, { shift = false, text = '' } = {}) {
      const named = { Tab: [9, 'Tab'], Escape: [27, 'Escape'], Enter: [13, 'Enter'], ' ': [32, 'Space'] }[k];
      const base = { key: k, code: named ? named[1] : /\d/.test(k) ? 'Digit' + k : 'Key' + k.toUpperCase(), windowsVirtualKeyCode: named ? named[0] : k.toUpperCase().charCodeAt(0), modifiers: shift ? 8 : 0 };
      await page.S('Input.dispatchKeyEvent', text ? { type: 'keyDown', ...base, text } : { type: 'rawKeyDown', ...base });
      await page.S('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    },
    async attach(sel, ...files) { const { root } = await page.S('DOM.getDocument', {}); const { nodeId } = await page.S('DOM.querySelector', { nodeId: root.nodeId, selector: sel }); await page.S('DOM.setFileInputFiles', { files, nodeId }); await sleep(900); },
    rect: (sel) => page.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const b = e.getBoundingClientRect(); return { x: +b.left.toFixed(2), y: +b.top.toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2), r: +b.right.toFixed(2), b: +b.bottom.toFixed(2) }; })()`),
    save: async (name) => { await sleep(450); const buf = await page.shot(); await sharp(buf).png({ palette: true, quality: 92, effort: 8, dither: 0.6 }).toFile(join(OUT, `${PREFIX}${name}.png`)); console.log('saved', `${PREFIX}${name}.png`); },
    state: () => page.eval(`(() => { const s = window.__contrib.state; return { open: s.open, tab: s.tab, sub: s.sub, shotState: s.shotState, kind: s.kind, category: s.category, sending: s.sending, photos: s.photos.length }; })()`),
    focus: () => page.eval(`(() => { const a = document.activeElement, s = document.querySelector('#kc-sheet'); return { inside: !!(s && s.contains(a)), tag: a.tagName, id: a.id || '', act: a.dataset ? a.dataset.act || '' : '', name: a.name || '' }; })()`),
    async enter({ walk = true } = {}) {
      if (P.phone) await enterTown(page, url);
      else { await page.goto(url); await page.waitFor("document.body.classList.contains('loaded')", { timeout: 280000 }); await T.tap('#go'); await page.waitFor("document.body.classList.contains('playing')", { timeout: 20000 }); }
      await sleep(1500); if (walk) await page.eval("window.__camSpec('walk')");
      if (P.phone) { await page.waitFor('window.__pad && !window.__pad.hidden', { timeout: 20000 }); await page.eval('window.__pad.dismissCoach()'); }
      await sleep(1000);
    },
    /** The HUD path: a click on desktop and in landscape; ☰ then the item on a phone upright (two taps). */
    async openSheet({ slow = 0 } = {}) {
      await page.eval(`window.__slowShot = ${slow}; window.__probe.canvases.clear(); window.__rec = true; window.__probe.t0 = window.__probe.t0 || performance.now()`);
      if (P.phone && portrait) await T.tap('#klc-ui .mbtn');
      await T.tap('#klc-ui .tools [data-act="report"]');
      await page.waitFor("document.querySelector('#klc-contrib')?.dataset.open === '1'", { timeout: 8000 });
      if (!slow) { await page.waitFor("window.__contrib.state.shotState !== 'wait'", { timeout: 8000 }); await sleep(450); }
    },
    async closeSheet() { await T.tap('#kc-sheet [data-act="close"]'); await page.waitFor("!window.__contrib.state.open", { timeout: 5000 }); await sleep(450); },
    /** Every control of the open sheet with its tap area (a hidden native radio / checkbox / file input is operated through its label). */
    targets: () => page.eval(`(() => {
      const out = [], sheet = document.querySelector('#kc-sheet');
      for (const e of sheet.querySelectorAll('button, [role="tab"], input:not([type="hidden"]), textarea, a[href], select')) {
        if (e.closest('[hidden]')) continue;
        const t = e.matches('input[type="radio"], input[type="checkbox"], input[type="file"]') ? (e.closest('label') || e) : e;
        const b = t.getBoundingClientRect(); if (!b.width || !b.height || getComputedStyle(t).visibility === 'hidden') continue;
        out.push({ el: (e.dataset.act || e.id || e.name || e.tagName) + (e.type === 'radio' ? ':' + e.value : ''), w: +b.width.toFixed(1), h: +b.height.toFixed(1) });
      }
      return out; })()`),
  };
  return T;
}

/** Tap targets of the open sheet: nothing under `min` px in either direction. */
async function checkTargets(T, label, min) {
  const t = await T.targets(), bad = t.filter((x) => Math.min(x.w, x.h) < min - 0.5);
  check(`${T.P.name}: ${label}: ${t.length} controls, every tap area >= ${min} px`, bad.length === 0 && t.length > 0, bad.length ? JSON.stringify(bad.slice(0, 6)) : '');
}
const camState = (page) => page.eval(`(() => { const c = window.__ctx, p = c.playerObj; return JSON.stringify({ x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, pitch: p.pitch, fly: p.fly, noui: document.body.classList.contains('noui'), muted: !!c.audio.muted, cam: c.camera.position.toArray() }); })()`);

// ------------------------------------------------------------------ the scenario of one viewport
async function runProfile(browser, mock, name) {
  const P = { ...PROFILES[name], name };
  console.log(`\n=== ${name} ${P.width}x${P.height}${P.phone ? ' (phone, DPR ' + P.dpr + ', safe-area insets)' : ''} ===`);
  mock.reset(); mock.seed();
  const photo = await makePhoto('shop-front.jpg', 205), photo2 = await makePhoto('second.jpg', 28);
  const T = await openPage(browser, P);
  const { page } = T;
  await T.enter();
  await page.eval('localStorage.clear()');
  const minTarget = P.phone ? 44 : 40, viaMenu = P.phone && T.portrait;

  // ---- the HUD: the button is there, and hiding it changes nothing else
  const hudRects = () => page.eval(`(() => [...document.querySelectorAll('#klc-ui .tools > :not([data-act="report"]), #klc-ui .brand .chip, #klc-ui .dock, #klc-ui .places, #klc-x .xbar button, #klc-x .mini')].map((e) => { const b = e.getBoundingClientRect(); return [e.dataset.act || e.id || e.className.toString().split(' ')[0], ...[b.left, b.top, b.width, b.height].map((v) => +v.toFixed(2))]; }))()`);
  if (viaMenu) await T.tap('#klc-ui .mbtn');
  const withBtn = await hudRects(), rep = await T.rect('#klc-ui .tools [data-act="report"]');
  check(`${name}: the 「修正を報告」 button is in the ${viaMenu ? '☰ menu' : 'toolbar'}`, !!rep && rep.w > 0, rep ? `${rep.w}x${rep.h} at ${rep.x},${rep.y}` : '');
  check(`${name}: its tap area is ${P.phone ? '>= 44' : '>= 38'} px`, rep && Math.min(rep.w, rep.h) >= (P.phone ? 44 : 38), rep ? `${rep.w}x${rep.h}` : '');
  if (viaMenu) {
    // what test/ship-pad.e2e.test.js counts in the ☰ menu (6 labelled items before, 7 now: 修正を報告 is the last one)
    const labels = await page.eval(`[...document.querySelectorAll('#klc-ui .tools .lbl')].map((e) => e.textContent.trim()).filter(Boolean)`);
    const order = await page.eval(`[...document.querySelectorAll('#klc-ui .tools > [data-act]')].map((e) => e.dataset.act)`);
    check(`${name}: the ☰ menu has seven labelled items, 修正を報告 last, the six that were there in their old order`, labels.length === 7 && labels[6] === '修正を報告' && order.join() === 'lang,season,sound,planet,credits,hide,report', JSON.stringify([labels, order]));
  }
  await page.eval(`document.querySelector('#klc-ui .tools [data-act="report"]').style.display = 'none'`); await sleep(200);
  const withoutBtn = await hudRects();
  await page.eval(`document.querySelector('#klc-ui .tools [data-act="report"]').style.display = ''`);
  const moved = withBtn.map((r, i) => (JSON.stringify(r) === JSON.stringify(withoutBtn[i]) ? null : [r, withoutBtn[i]])).filter(Boolean);
  check(`${name}: adding the button moves no existing HUD control (${withBtn.length} measured)`, moved.length === 0 && withBtn.length === withoutBtn.length && withBtn.length > 8, moved.length ? JSON.stringify(moved.slice(0, 3)) : '');
  if (viaMenu) await T.tap('#klc-ui .mbtn');   // close the menu
  if (P.phone && !T.portrait) {
    // a phone on its side: the round button sits left of the toolbar row; the minimap, the search / map / drive row and the pad's chip and gear are close by
    const lay = await page.eval(`(() => { const R = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return b.width > 1 ? { l: b.left, r: b.right, t: b.top, b: b.bottom } : null; };
      const rep = R('#klc-ui .tools [data-act="report"]'), others = { brand: R('#klc-ui .brand'), mini: R('#klc-x .mini'), xbar: R('#klc-x .xbar'), tools: R('#klc-ui .tools'), chip: R('#klc-pad .chip'), gear: R('#klc-pad .gear'), dock: R('#klc-ui .dock') };
      const hit = (a, b) => a && b && a.l < b.r - 0.5 && a.r > b.l + 0.5 && a.t < b.b - 0.5 && a.b > b.t + 0.5;
      return { rep: rep && [Math.round(rep.l), Math.round(rep.t), Math.round(rep.r), Math.round(rep.b)], hits: Object.entries(others).filter(([, o]) => hit(rep, o)).map(([k]) => k), inside: !!rep && rep.l >= 0 && rep.r <= innerWidth && rep.t >= 0 && rep.b <= innerHeight }; })()`);
    check(`${name}: the report button overlaps no other HUD panel (brand, minimap, search row, toolbar, the pad's chip and gear, the dock) and is on screen`, lay.rep && lay.hits.length === 0 && lay.inside, JSON.stringify(lay));
  }
  if (!P.phone) {
    // the toolbar's room: the pill / the round button never lands on the wordmark or the live chip, at the widths a desktop window can have (and in English, whose labels are longer)
    const measure = () => page.eval(`(() => { const R = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
        const mark = R('#klc-ui .brand .mark'), chip = R('#klc-ui .brand .chip'), rep = R('#klc-ui .tools [data-act="report"]'), sel = R('#klc-ui #quality'), xbar = R('#klc-x .xbar'), tools = R('#klc-ui .tools');
        const hit = (a, b) => a && b && a.l < b.r - 0.5 && a.r > b.l + 0.5 && a.t < b.b - 0.5 && a.b > b.t + 0.5;
        return { rep: rep && [Math.round(rep.l), Math.round(rep.r), Math.round(rep.t), Math.round(rep.b)], mark: mark && Math.round(mark.r), chip: chip && Math.round(chip.r), hitMark: hit(rep, mark), hitChip: hit(rep, chip), hitSel: hit(rep, sel), hitX: hit(rep, xbar), hitTools: hit(rep, tools), inside: !!rep && rep.l >= 0 && rep.r <= innerWidth && rep.b <= innerHeight, pill: !!rep && rep.r - rep.l > 60 }; })()`);
    for (const [lang, widths] of [['ja', [1440, 1181, 1100, 900, 840, 839, 800, 721]], ['en', [1181, 900, 840, 800, 721]]]) {
      if (lang === 'en') await page.eval("(window.__life.hud.i18n.set('en'), window.__life.hud.render(), 0)");
      for (const w of widths) {
        await page.S('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false, screenWidth: w, screenHeight: 900 }); await sleep(350);
        const r = await measure();
        check(`desktop ${w} px${lang === 'en' ? ' (English)' : ''}: the button (${r.pill ? 'pill' : 'round'}) overlaps neither the wordmark, the live chip, the quality menu, the search row nor the toolbar, and is on screen`, r.rep && !r.hitMark && !r.hitChip && !r.hitSel && !r.hitX && !r.hitTools && r.inside, JSON.stringify(r));
        if (lang === 'ja' && (w === 1440 || w === 800 || w === 721)) await T.save(`desktop_toolbar_${w}`);
      }
      if (lang === 'en') await page.eval("(window.__life.hud.i18n.set('ja'), window.__life.hud.render(), 0)");
    }
    await page.S('Emulation.setDeviceMetricsOverride', { width: P.width, height: P.height, deviceScaleFactor: P.dpr, mobile: false, screenWidth: P.width, screenHeight: P.height }); await sleep(600);
  }

  // ---- open: the screenshot arrives after a short wait; nothing below it moves
  const before = await page.eval('({ urls: window.__probe.urls.size })');
  await T.openSheet({ slow: 900 });
  await sleep(250);
  const sample = () => page.eval(`({ note: document.querySelector('#kc-note').getBoundingClientRect().top, cats: document.querySelector('.kc-cats').getBoundingClientRect().top, shot: document.querySelector('#kc-shot').getBoundingClientRect().height, st: window.__contrib.state.shotState })`);
  const wait1 = await sample();
  if (!QUICK) await T.save(`${name}_open_waiting`);
  await page.waitFor("window.__contrib.state.shotState === 'ok'", { timeout: 10000 }); await sleep(500);
  const wait2 = await sample();
  check(`${name}: the screenshot arrives (waiting -> ok) and nothing below it moves`, wait1.st === 'wait' && wait2.st === 'ok' && near(wait1.note, wait2.note, 0.5) && near(wait1.cats, wait2.cats, 0.5) && near(wait1.shot, wait2.shot, 0.5), JSON.stringify([wait1, wait2]));
  await page.eval('window.__slowShot = 0');
  await T.save(`${name}_open`);

  // ---- it is a modal dialog
  const dlg = await page.eval(`(() => { const s = document.querySelector('#kc-sheet'); return { role: s.getAttribute('role'), modal: s.getAttribute('aria-modal'), labelled: document.getElementById(s.getAttribute('aria-labelledby'))?.textContent, active: document.activeElement === s,
    inert: ['#klc-ui', '#scene', '#klc-x'].map((q) => document.querySelector(q)?.hasAttribute('inert')), body: document.body.classList.contains('klc-contrib-open'), pad: window.__pad ? window.__pad.suppressed : null }; })()`);
  check(`${name}: a dialog (role, aria-modal, labelled by its title), focus on it, the page behind inert`, dlg.role === 'dialog' && dlg.modal === 'true' && dlg.labelled === '修正を報告' && dlg.active && dlg.inert.every(Boolean) && dlg.body, JSON.stringify(dlg));
  if (P.phone) check(`${name}: the touch pad steps aside while it is open (pad.suppress('contrib'))`, dlg.pad.includes('contrib'), JSON.stringify(dlg.pad));
  const shotInfo = await page.eval(`(async () => { const s = window.__contrib.state.shot; const head = new Uint8Array(await s.blob.slice(0, 3).arrayBuffer()); window.__rec = false; return { w: s.w, h: s.h, bytes: s.bytes, type: s.blob.type, jpeg: head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff, urls: window.__probe.urls.size, pose: window.__contrib.state.pose, canvases: [...window.__probe.canvases].map((c) => [c.width, c.height]) }; })()`);
  const expectW = Math.min(1600, Math.round(P.width * Math.min(2, P.dpr)));
  check(`${name}: the automatic screenshot is a JPEG ${shotInfo.w}x${shotInfo.h} (${(shotInfo.bytes / 1024).toFixed(0)} KB), at most 1600 px wide`, shotInfo.jpeg && shotInfo.type === 'image/jpeg' && shotInfo.w <= 1600 && shotInfo.w === expectW && shotInfo.bytes < 8 * 1048576 && shotInfo.bytes > 5000);
  check(`${name}: the capture freed its canvases (all ${shotInfo.canvases.length} it made are 0 x 0) and kept one preview URL`, shotInfo.canvases.length >= 2 && shotInfo.canvases.every(([w, h]) => w === 0 && h === 0) && shotInfo.urls - before.urls === 1, JSON.stringify(shotInfo.canvases) + ' urls ' + (shotInfo.urls - before.urls));
  check(`${name}: the pose is complete (${shotInfo.pose.mode}, ${shotInfo.pose.timePreset}, ${shotInfo.pose.season}, ${shotInfo.pose.enu.join(', ')})`, poseProblems(shotInfo.pose).length === 0 && shotInfo.pose.viewport.w === P.width);
  if (P.phone) {
    const sheet = await T.rect('#kc-sheet'), ins = P.insets;
    check(`${name}: the sheet stays inside the safe area (top ${ins.top}, bottom ${ins.bottom}, left ${ins.left}, right ${ins.right})`, sheet.y >= ins.top - 0.5 && sheet.b <= P.height - ins.bottom + 0.5 && sheet.x >= ins.left - 0.5 && sheet.r <= P.width - ins.right + 0.5, JSON.stringify(sheet));
  }
  await checkTargets(T, 'the report form', minTarget);
  const bodyH = (await T.rect('.kc-body')).h, headH = (await T.rect('.kc-head')).h, footH = (await T.rect('.kc-foot')).h;
  check(`${name}: the scrolling body keeps room to read (${Math.round(bodyH)} px; header ${Math.round(headH)}, footer ${Math.round(footH)})`, bodyH >= (T.portrait || !P.phone ? 300 : 150), '');

  // ---- the keyboard: Tab is trapped, Esc closes and returns focus, the town's keys do not run
  if (!P.phone) {
    const seen = new Set(); let leaked = 0;
    for (let i = 0; i < 70; i++) { await T.key('Tab'); const f = await T.focus(); if (!f.inside) leaked++; seen.add(f.id || f.act || f.name || f.tag); }
    for (let i = 0; i < 25; i++) { await T.key('Tab', { shift: true }); const f = await T.focus(); if (!f.inside) leaked++; }
    check(`${name}: 95 Tab / Shift+Tab presses never leave the dialog (${seen.size} different controls reached; it wraps)`, leaked === 0 && seen.size >= 12, `leaked ${leaked}`);
    const cam0 = await camState(page);
    await T.tap('#kc-note');
    for (const ch of 'wasdfhmr1 ') await T.key(ch, { text: ch });
    const typed = await page.eval(`document.querySelector('#kc-note').value`);
    await sleep(500);
    check(`${name}: typing "wasdfhmr1" into the note types it and moves nothing (no walk, no fly, no hide-UI, no mute, no camera jump)`, typed.startsWith('wasdfhmr1 ') && cam0 === await camState(page), JSON.stringify([typed, cam0, await camState(page)]));
    await page.eval(`(() => { const n = document.querySelector('#kc-note'); n.value = ''; n.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await T.tap('input[name="category"][value="road"] + .kc-chipbody');
    for (const ch of 'fhm1r') await T.key(ch, { text: ch });
    check(`${name}: the town's keys do nothing either while a button has the focus`, cam0 === await camState(page));
    await page.eval(`document.querySelector('input[name="category"][value="road"]').checked = false; window.__contrib.state.category = ''`);
  }
  await T.key('Escape'); await sleep(600);
  const afterEsc = await page.eval(`({ open: window.__contrib.state.open, inert: ['#klc-ui', '#scene'].map((q) => document.querySelector(q)?.hasAttribute('inert')), active: (document.activeElement.dataset || {}).act || document.activeElement.tagName, body: document.body.classList.contains('klc-contrib-open'), pad: window.__pad ? window.__pad.suppressed : [], url: window.__probe.urls.size })`);
  check(`${name}: Esc closes the sheet, the page is live again${P.phone ? ' and the pad is back' : ''}, focus goes back to the ${viaMenu ? '☰ button (the item lived in the closed menu)' : '「修正を報告」 button'}, the screenshot's preview URL is revoked`,
    !afterEsc.open && afterEsc.inert.every((x) => !x) && afterEsc.active === (viaMenu ? 'menu' : 'report') && !afterEsc.body && !afterEsc.pad.includes('contrib') && afterEsc.url === before.urls, JSON.stringify(afterEsc));
  await sleep(300);
  await T.openSheet();

  // ---- the kind: two entry points, the issue one is 2 taps or fewer from the HUD button
  const taps = viaMenu ? 2 : 1, st0 = await T.state();
  check(`${name}: the issue form is open after ${taps} tap${taps > 1 ? 's' : ''} from the HUD (${viaMenu ? '☰ then the item' : 'one click'})`, st0.kind === 'issue' && st0.open);
  const hints = await page.eval(`(() => [...document.querySelectorAll('.kc-descs p')].map((p) => [p.dataset.only, getComputedStyle(p).visibility, p.getBoundingClientRect().top]))()`);
  check(`${name}: the issue line is shown, the fix line is not (one grid cell)`, hints[0][1] === 'visible' && hints[1][1] === 'hidden' && near(hints[0][2], hints[1][2]), JSON.stringify(hints));
  const catsTop = await page.eval(`document.querySelector('.kc-cats').getBoundingClientRect().top`);
  await T.tap('input[name="kind"][value="fix"] + .kc-card');
  const fixState = await page.eval(`({ kind: window.__contrib.state.kind, attr: document.querySelector('#klc-contrib').dataset.kind, hint: [...document.querySelectorAll('.kc-descs p')].filter((p) => getComputedStyle(p).visibility === 'visible').map((p) => p.textContent), label: [...document.querySelectorAll('.kc-photos legend span')].filter((s) => getComputedStyle(s).display !== 'none').map((s) => s.textContent), cats: document.querySelector('.kc-cats').getBoundingClientRect().top })`);
  check(`${name}: 「現地の写真で直す」 says in one line that photos taken on the spot carry their location; the photos label asks for at least one; nothing below moves`, fixState.kind === 'fix' && fixState.attr === 'fix' && fixState.hint.length === 1 && fixState.hint[0].includes('場所の情報') && fixState.label[0].includes('1枚以上') && near(fixState.cats, catsTop, 0.5), JSON.stringify(fixState));
  await T.save(`${name}_fix`);
  await T.tap('input[name="kind"][value="issue"] + .kc-card');

  // ---- the privacy notice
  await T.tap('[data-act="privacy"]');
  const pv = await page.eval(`({ sub: window.__contrib.state.sub, sections: document.querySelectorAll('.kc-privacy h4').length, vis: !document.querySelector('[data-sub="privacy"]').hidden, foot: getComputedStyle(document.querySelector('.kc-foot')).display, intro: document.querySelector('.kc-privacy .kc-lead').textContent, selfdel: [...document.querySelectorAll('.kc-privacy .kc-lead')].at(-1).textContent, hasPlaceholder: /\\{\\{|\\{contact\\}/.test(document.querySelector('.kc-privacy').textContent) })`);
  check(`${name}: the privacy notice (the backend's text) opens inside the sheet (an intro, 9 headed sections, the self-delete line) and the send bar steps aside`, pv.sub === 'privacy' && pv.sections === 9 && pv.intro.includes('気仙沼 Living City') && pv.selfdel.includes('マイ投稿') && !pv.hasPlaceholder && pv.vis && pv.foot === 'none', JSON.stringify(pv));
  await checkTargets(T, 'the privacy notice', minTarget);
  await T.save(`${name}_privacy`);
  await T.key('Escape'); await sleep(400);
  const pb = await T.state();
  check(`${name}: Esc steps back from the privacy notice to the form (the sheet stays open), focus is on the notice's link`, pb.sub === 'form' && pb.open && (await T.focus()).act === 'privacy');

  // ---- fill it in and send it over a slow network: the progress bar moves
  await T.tap('input[name="category"][value="sign"] + .kc-chipbody');
  await T.type('#kc-note', '看板が1メートルほど右にずれています。');
  await page.eval(`window.__probe.canvases.clear(); window.__rec = true`);
  await T.attach('#kc-file', photo.file, photo2.file);
  await page.waitFor("document.querySelectorAll('.kc-tile img').length === 2", { timeout: 20000 }); await sleep(200);
  const thumbCanvases = await page.eval(`(() => { window.__rec = false; return [...window.__probe.canvases].map((c) => [c.width, c.height]); })()`);
  check(`${name}: the photo thumbnails were decoded on small canvases that are all 0 x 0 again (${thumbCanvases.length} made)`, thumbCanvases.length >= 2 && thumbCanvases.every(([w, h]) => w === 0 && h === 0), JSON.stringify(thumbCanvases));
  await T.type('#kc-nick', 'そら');
  await checkTargets(T, 'the filled form (photo tiles with their remove buttons)', minTarget);
  const tiles = await page.eval(`[...document.querySelectorAll('.kc-tile')].map((t) => [t.querySelector('img') ? 1 : 0, t.querySelector('.kc-rm').getAttribute('aria-label')])`);
  check(`${name}: two photo tiles with thumbnails and named remove buttons`, tiles.length === 2 && tiles.every((t) => t[0] === 1 && t[1].startsWith('この写真を外す：')), JSON.stringify(tiles));
  await T.tap('.kc-check');
  await page.eval(`(() => { const b = document.querySelector('.kc-body'), n = document.querySelector('#kc-note'); b.scrollTop += n.getBoundingClientRect().top - b.getBoundingClientRect().top - 54; })()`);
  await T.save(`${name}_filled`);
  await page.eval(`(() => { const b = document.querySelector('.kc-body'); b.scrollTop = b.scrollHeight; })()`);
  await T.save(`${name}_filled_end`);
  const hasCam = await page.eval(`getComputedStyle(document.querySelector('.kc-camera')).display`);
  check(`${name}: the camera button is ${P.phone ? 'offered on a phone' : 'not offered with a mouse'}`, P.phone ? hasCam !== 'none' : hasCam === 'none', hasCam);
  const draftSaved = await page.eval(`(() => { const d = JSON.parse(localStorage.getItem('klc.contrib.draft.v1') || 'null'); return d && { kind: d.kind, category: d.category, note: d.note, keys: Object.keys(d).sort().join() }; })()`);
  check(`${name}: the text of the report is kept as a draft (no photos, no consent)`, draftSaved && draftSaved.category === 'sign' && draftSaved.note.startsWith('看板が') && draftSaved.keys === 'at,category,crewNo,kind,note,v', JSON.stringify(draftSaved));
  await page.S('Network.emulateNetworkConditions', { offline: false, latency: 60, downloadThroughput: 600 * 1024, uploadThroughput: 40 * 1024 });   // (a phone's payload is small: slow enough that the bar is still moving a second in)
  const sentPose = await page.eval('JSON.stringify(window.__contrib.state.pose)');   // (the pose of THIS opening of the sheet: it was opened twice above)
  await T.tap('[data-act="send"]');
  await sleep(900);
  const prog = await page.eval(`(() => { const p = document.querySelector('.kc-bar'); return { value: p.value, sending: window.__contrib.state.sending, shown: !document.querySelector('.kc-prog').hidden, text: document.querySelector('[data-f="prog-t"]').textContent, cancel: !document.querySelector('[data-act="cancel"]').hidden, disabled: document.querySelector('[data-act="send"]').disabled, busy: document.querySelector('#klc-contrib').getAttribute('aria-busy') }; })()`);
  check(`${name}: sending shows progress (${prog.value}%, "${prog.text}"), the send button is locked, 「やめる」 is offered`, prog.sending && prog.shown && prog.value > 0 && prog.value < 100 && prog.cancel && prog.disabled && prog.busy === 'true', JSON.stringify(prog));
  await T.save(`${name}_submitting`);
  await page.waitFor("window.__contrib.state.sub === 'done'", { timeout: 90000 });
  await page.S('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await sleep(500);
  await T.save(`${name}_success`);
  await checkTargets(T, 'the thank-you screen', minTarget);
  const done = await page.eval(`({ title: document.querySelector('#kc-done-t').textContent, focus: document.activeElement.id, shot: window.__contrib.state.shot, photos: window.__contrib.state.photos.length, urls: window.__probe.urls.size, draft: localStorage.getItem('klc.contrib.draft.v1'), prof: JSON.parse(localStorage.getItem('klc.contrib.me.v1') || 'null'), acct: Object.keys(JSON.parse(localStorage.getItem('klc.contrib.acct.v1') || '{}')) })`);
  check(`${name}: thank-you screen, focus on it, the draft and the screenshot blob are gone, the nickname is remembered, the login is stored for this backend`, done.title.includes('ありがとう') && done.focus === 'kc-done-t' && done.shot === null && done.photos === 0 && done.urls === before.urls && done.draft === null && done.prof.nickname === 'そら' && done.acct[0] === API, JSON.stringify(done));

  // ---- what the backend received
  const rec = [...mock.state.submissions.values()].find((s) => s.kind === 'issue' && s.note.startsWith('看板') && s.photos.length === 2);
  check(`${name}: the backend has the report (kind issue, category sign, the note, lang ja, status new)`, !!rec && rec.category === 'sign' && rec.lang === 'ja' && rec.status === 'new');
  if (rec) {
    check(`${name}: its pose is the sheet's pose, complete, with the build stamp (${rec.pose.appVersion}, ${rec.pose.layoutVersion})`, JSON.stringify(rec.pose) === sentPose && /^[\d.]+(\+[0-9a-f]{7})?$/.test(rec.pose.appVersion) && /^v\d+\.[0-9a-f]{8}$/.test(rec.pose.layoutVersion));
    const shotFile = mock.state.files.get(rec.screenshotKey), meta = shotFile && await sharp(Buffer.from(shotFile.bytes)).metadata();
    check(`${name}: the stored screenshot is a JPEG ${meta?.width}x${meta?.height}, at most 1600 wide`, !!meta && meta.format === 'jpeg' && meta.width <= 1600 && meta.width === expectW);
    const stored = rec.photos.map((p) => mock.state.files.get(p.key));
    check(`${name}: the photos arrived untouched (same bytes as the originals, EXIF GPS still inside)`, stored.length === 2 && sha(Buffer.from(stored[0].bytes)) === photo.sha && sha(Buffer.from(stored[1].bytes)) === photo2.sha && (await sharp(Buffer.from(stored[0].bytes)).metadata()).exif !== undefined);
  }

  // ---- マイ投稿: pending, accepted, 反映済み, not used (the moderator's side through the fake admin)
  const token = await page.eval(`JSON.parse(localStorage.getItem('klc.contrib.acct.v1'))[${JSON.stringify(API)}].token`);
  const post = async (kind, category, note, withPhoto = false) => {
    const fd = new FormData();
    fd.append('pose', JSON.stringify(shotInfo.pose)); fd.append('kind', kind); fd.append('category', category); fd.append('note', note); fd.append('lang', 'ja'); fd.append('consent', '1');
    if (withPhoto) fd.append('photos', new Blob([photo.buf], { type: 'image/jpeg' }), 'IMG_1.jpg');
    const r = await fetch(`${API}/api/contrib/v1/submissions`, { method: 'POST', headers: { authorization: 'Bearer ' + token }, body: fd }); return (await r.json()).id;
  };
  const adm = (id, body) => fetch(`${API}/api/contrib/v1/admin/submissions/${id}`, { method: 'POST', headers: { authorization: 'Bearer ' + DEFAULTS.adminToken, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const a = await post('issue', 'building', '浮いている建物があります'), b = await post('fix', 'shop', '現地で撮った写真です', true), c = await post('issue', 'road', '道がちがいます');
  await adm(a, { status: 'accepted', points: 5, reviewerNote: 'private: do not show' }); await adm(b, { status: 'used', points: 20, version: 'v0.2.0' }); await adm(c, { status: 'rejected', reviewerNote: 'private: do not show either' });
  await T.tap('[data-act="goto"][data-tab="mine"]'); await sleep(1200);
  const mine = await page.eval(`(() => ({ items: [...document.querySelectorAll('.kc-item')].map((i) => [i.dataset.status, i.querySelector('.kc-st').textContent, i.querySelector('.kc-pt')?.textContent || '', !!i.querySelector('.kc-live-note'), document.body.innerText.includes('private: do not show') ? 1 : 0]), total: document.querySelector('.kc-total b').textContent, rank: document.querySelector('.kc-total small').textContent, focus: document.activeElement.id }))()`);
  check(`${name}: マイ投稿 lists the four reports with their states: pending (no points), accepted +5pt, 反映済み（v0.2.0）+20pt with "live for everyone", not used; the team's private notes are not shown; my rank is there`,
    mine.items.length === 4 && mine.items.some((i) => i[0] === 'pending' && i[1] === '確認待ち' && i[2] === '') && mine.items.some((i) => i[0] === 'accepted' && i[2] === '+5pt') && mine.items.some((i) => i[0] === 'used' && i[1] === '反映済み（v0.2.0）' && i[2] === '+20pt' && i[3])
      && mine.items.some((i) => i[0] === 'rejected' && i[1] === '見送り' && i[2] === '') && mine.items.every((i) => i[4] === 0) && mine.total === '合計 25 ポイント' && mine.rank.includes('ランキング2位') && mine.focus === 'kc-mine-t', JSON.stringify(mine));
  await T.save(`${name}_mine`);
  await checkTargets(T, 'マイ投稿 with the transfer, forget and delete sections', minTarget);
  const eraseCard = await page.eval(`({ has: !!document.querySelector('.kc-erase [data-act="erase"]'), title: document.querySelector('#kc-erase-t')?.textContent })`);
  check(`${name}: マイ投稿 offers 「送ったデータをすべて削除」 (this device has a login)`, eraseCard.has && eraseCard.title === '送ったデータをすべて削除', JSON.stringify(eraseCard));

  // ---- 別の端末に引き継ぐ: a code, a countdown, a QR code that carries the link
  await T.tap('[data-act="xfer"]'); await sleep(900);
  const xf = await page.eval(`(() => ({ code: document.querySelector('[data-f="code"]')?.textContent, left: document.querySelector('[data-f="left"]')?.textContent, path: document.querySelector('[data-f="qr"] svg path')?.getAttribute('d'), svgLabel: document.querySelector('[data-f="qr"] svg')?.getAttribute('aria-label'), plain: window.__contrib.state.xfer.code, href: location.href, expanded: document.querySelector('[data-act="xfer"]').getAttribute('aria-expanded') }))()`);
  const claimLink = claimUrl(xf.href, xf.plain, { api: API });
  check(`${name}: a 10-character transfer code written XXXXX-XXXXX, a countdown (${xf.left}), a QR code that carries ${claimLink}`, /^[0-9A-HJKMNP-TV-Z]{10}$/.test(xf.plain) && xf.code === `${xf.plain.slice(0, 5)}-${xf.plain.slice(5)}` && /^あと 1[45]:\d\d$/.test(xf.left) && xf.path === qrToPath(qrEncode(claimLink, { ecl: 'M' }), 4) && xf.svgLabel === '引き継ぎ用のQRコード' && xf.expanded === 'true', JSON.stringify({ code: xf.code, left: xf.left }));
  await page.eval(`document.querySelector('[data-f="xfer-card"]').scrollIntoView({ block: 'center', behavior: 'instant' })`); await sleep(300);
  await T.save(`${name}_transfer`);
  await checkTargets(T, 'the transfer code card', minTarget);
  await T.key('Escape'); await sleep(300);
  const hid = await page.eval(`({ phase: window.__contrib.state.xfer.phase, open: window.__contrib.state.open })`);
  check(`${name}: Esc closes the code card first (the sheet stays open)`, hid.phase === 'idle' && hid.open, JSON.stringify(hid));

  // ---- the leaderboard (my accepted reports are on it now)
  await T.tap('.kc-tab[data-tab="board"]'); await sleep(1000);
  const board = await page.eval(`(() => ({ rows: [...document.querySelectorAll('.kc-row')].map((r) => [r.dataset.rank, r.querySelector('.kc-nick').textContent, r.querySelector('.kc-acc').textContent, r.querySelector('.kc-pts').textContent, r.dataset.me || '']), text: document.querySelector('.kc-board').textContent }))()`);
  const me = board.rows.find((r) => r[4] === '1');
  check(`${name}: the leaderboard shows nickname, accepted count and points only (6 rows, ranked by points), my row (そら, 採用 2件, 25pt) marked`, board.rows.length === 6 && !!me && me[0] === '2' && me[1].startsWith('そら') && me[2] === '採用 2件' && me[3] === '25pt' && !/\d{14}/.test(board.text), JSON.stringify(board.rows.slice(0, 3)));
  const pill = await page.eval(`(() => { const n = document.querySelector('.kc-row[data-me="1"] .kc-nick'), e = n && n.querySelector('em'); if (!e) return null; const a = n.getBoundingClientRect(), b = e.getBoundingClientRect(); return { above: +(b.top - a.top).toFixed(1), below: +(a.bottom - b.bottom).toFixed(1), right: +(a.right - b.right).toFixed(1) }; })()`);
  check(`${name}: the 「あなた」 pill sits inside its row box (nothing clips it)`, !!pill && pill.above >= -0.5 && pill.below >= -0.5 && pill.right >= -0.5, JSON.stringify(pill));
  await T.save(`${name}_board`);
  await checkTargets(T, 'the leaderboard', minTarget);

  // ---- 「送ったデータをすべて削除」: it asks first; the phone stops at the question (its login is needed later), the others go through with it
  await T.tap('.kc-tab[data-tab="mine"]'); await sleep(900);
  const myId = await page.eval(`JSON.parse(localStorage.getItem('klc.contrib.acct.v1'))[${JSON.stringify(API)}].id`);
  await T.tap('[data-act="erase"]');
  const ask = await page.eval(`(() => { const q = document.querySelector('.kc-confirm'); return { text: q ? q.textContent : '', yes: !!(q && q.querySelector('[data-act="erase-yes"]')), focus: document.activeElement.dataset.act || '' }; })()`);
  check(`${name}: 「データを削除する」 only asks: the question says it cannot be undone, 「やめる」 has the focus, nothing is deleted yet`, ask.text.includes('本当に削除しますか？') && ask.text.includes('取り消せません') && ask.focus === 'erase-no' && ask.yes && !mock.state.requests.some((r) => r.method === 'DELETE'), JSON.stringify(ask));
  await checkTargets(T, 'the delete question', minTarget);
  if (name === 'portrait') await T.save(`${name}_erase_confirm`);
  if (name === 'portrait') {
    await T.tap('[data-act="erase-no"]');
    const back = await page.eval(`({ phase: window.__contrib.state.erase.phase, focus: document.activeElement.dataset.act || '', acct: !!localStorage.getItem('klc.contrib.acct.v1') })`);
    check(`${name}: 「やめる」 puts the button back, focus returns to it, the login is still here`, back.phase === 'idle' && back.focus === 'erase' && back.acct, JSON.stringify(back));
  } else {
    const mineSubs = [...mock.state.submissions.values()].filter((x) => x.contributorId === myId), myFiles = mineSubs.flatMap((x) => [x.screenshotKey, ...x.photos.map((p) => p.key)]).filter(Boolean);
    const before = { subs: mock.state.submissions.size, files: mock.state.files.size, who: mock.state.contributors.size };
    await T.tap('[data-act="erase-yes"]'); await sleep(1200);
    const gone = await page.eval(`({ phase: window.__contrib.state.erase.phase, acct: localStorage.getItem('klc.contrib.acct.v1'), prof: localStorage.getItem('klc.contrib.me.v1'), notice: document.querySelector('.kc-notice')?.textContent || '', nick: document.querySelector('#kc-nick').value, again: !!document.querySelector('[data-act="erase"]'), mine: window.__contrib.state.mine.state })`);
    check(`${name}: deleted: the backend lost this contributor, ${mineSubs.length} reports and ${myFiles.length} files (the seeded ones are untouched), this device forgot the login and the nickname, the panel says so and offers nothing more to delete`,
      mock.state.requests.some((r) => r.method === 'DELETE' && r.status === 200) && !mock.state.contributors.has(myId) && !mock.state.submissions.has(mineSubs[0]?.id) && mock.state.submissions.size === before.subs - mineSubs.length && mock.state.files.size === before.files - myFiles.length && mock.state.contributors.size === before.who - 1
      && gone.acct === null && gone.notice.includes('削除しました') && gone.nick === '' && !gone.again && gone.mine === 'anon' && gone.phase === 'idle', JSON.stringify({ gone, mineSubs: mineSubs.length, myFiles: myFiles.length, before, now: [mock.state.submissions.size, mock.state.files.size, mock.state.contributors.size] }));
    await T.save(`${name}_erased`);
  }

  if (!QUICK) {
    // ---- an error while offline, then the retry
    await T.tap('.kc-tab[data-tab="report"]'); await T.tap('[data-act="again"]'); await sleep(600);
    await T.tap('input[name="kind"][value="fix"] + .kc-card');
    await T.tap('input[name="category"][value="landmark"] + .kc-chipbody');
    await T.type('#kc-note', '現地で撮影しました。');
    await T.attach('#kc-file', photo.file);
    await T.tap('.kc-check');
    await page.S('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    await T.tap('[data-act="send"]'); await sleep(1500);
    const er = await page.eval(`({ alert: document.querySelector('#kc-alert').innerText, hidden: document.querySelector('#kc-alert').hidden, label: document.querySelector('[data-f="send-t"]').textContent, kept: document.querySelector('#kc-note').value, photos: window.__contrib.state.photos.length, sending: window.__contrib.state.sending, focus: document.activeElement.dataset.act })`);
    check(`${name}: offline: a plain-words error under the form, 「もういちど送る」, the report and its photo are kept, focus on the button`, !er.hidden && er.alert.includes('送れませんでした') && er.alert.includes('ネットワーク') && er.label === 'もういちど送る' && er.kept.startsWith('現地で') && er.photos === 1 && !er.sending && er.focus === 'send', JSON.stringify(er));
    await page.eval(`(() => { const b = document.querySelector('.kc-body'); b.scrollTop = b.scrollHeight; })()`);
    await T.save(`${name}_error`);
    await page.S('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await T.tap('[data-act="send"]'); await page.waitFor("window.__contrib.state.sub === 'done'", { timeout: 60000 });
    const fixes = [...mock.state.submissions.values()].filter((s) => s.note.startsWith('現地で撮影'));
    check(`${name}: the retry goes through: a fix with its photo, one copy on the backend`, fixes.length === 1 && fixes[0].kind === 'fix' && fixes[0].photos.length === 1);

  }

  // ---- layout stability from the first opening of the sheet to here (the screenshot's arrival and the kind switch were measured directly above); the app's own start-up shifts are not ours.
  //      What follows (the language and the time of day, switched by script) re-renders the HUD itself, so it is measured before.
  const cls = await page.eval('(() => { const p = window.__probe, mine = p.shifts.filter((s) => s.t >= p.t0); return { cls: mine.reduce((n, s) => n + s.v, 0), sheet: mine.filter((s) => s.sheet).reduce((n, s) => n + s.v, 0), startup: p.cls - mine.reduce((n, s) => n + s.v, 0), shifts: mine.slice(0, 8) }; })()');
  check(`${name}: cumulative layout shift from the first opening of the sheet to the end (not caused by an input) is ${cls.cls.toFixed(4)} (< 0.02), the sheet's own share ${cls.sheet.toFixed(4)} (< 0.01)`, cls.cls < 0.02 && cls.sheet < 0.01, JSON.stringify(cls.shifts) + ' start-up (not counted): ' + cls.startup.toFixed(4));

  if (!QUICK) {
    // ---- English, and the night
    await T.tap('[data-act="again"]'); await sleep(500);
    await T.tap('#kc-sheet [data-act="lang"]'); await sleep(600);
    const en = await page.eval(`({ title: document.querySelector('#kc-title').textContent, tabs: [...document.querySelectorAll('.kc-tab')].map((t) => t.textContent), lang: document.querySelector('#klc-contrib').lang, kana: /[\\u3040-\\u30ff]/.test(document.querySelector('#kc-sheet').innerText.replace(/クルーNo\\./g, '')), btn: document.querySelector('#kc-sheet [data-act="lang"]').textContent })`);
    check(`${name}: the language button switches the sheet to English (title, tabs, no Japanese kana left)`, en.title === 'Report a correction' && en.tabs.join('|') === 'Report|My reports|Leaderboard' && !en.kana && en.lang === 'en' && en.btn === '日本語', JSON.stringify(en));
    await T.save(`${name}_en_open`);
    await T.tap('#kc-sheet [data-act="lang"]'); await sleep(300);
    await T.closeSheet();
    await page.eval(`(window.__life.time.set('yoru'), 0)`); await sleep(2500);
    await T.openSheet();
    await T.save(`${name}_night_open`);
    await T.closeSheet(); await page.eval(`(window.__life.time.set('yugata'), 0)`); await sleep(1500);
  }

  const errs = page.errors().filter((e) => !/api\/live|favicon|ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(e.text));
  check(`${name}: no console errors or exceptions`, errs.length === 0, JSON.stringify(errs.slice(0, 3)));
  await page.S('Page.close').catch(() => {});
  return { pose: shotInfo.pose, claimLink };
}

/** A view restored from its ?cam= link: the camera is where the contributor was, and a report made from there carries the same pose. */
async function restoreCheck(browser, pose) {
  const P = { ...PROFILES.desktop, name: 'desktop' };
  const link = poseToUrl(pose, '');   // ?cam=x,y,z,heading,pitch,fov&preset=...&season=...
  const T = await openPage(browser, P, { search: '&' + link.slice(1) });
  await T.enter({ walk: false });
  await T.page.eval(`window.__contrib = window.__life.hud.contrib`);
  const got = await T.page.eval(`(() => { const c = window.__ctx.camera, v = c.getWorldDirection(new THREE.Vector3()); return { pos: c.position.toArray(), heading: ((Math.atan2(v.x, -v.z) * 180 / Math.PI) + 360) % 360, pitch: Math.asin(v.y) * 180 / Math.PI, fov: c.fov, fly: window.__ctx.playerObj.fly, preset: window.__life.time.preset, season: window.__life.season.id }; })()`);
  const ok = near(got.pos[0], pose.enu[0], 0.011) && near(got.pos[1], pose.enu[1], 0.011) && near(got.pos[2], pose.enu[2], 0.011) && Math.abs(norm180(got.heading - pose.heading)) <= 0.02 && near(got.pitch, pose.pitch, 0.02) && near(got.fov, pose.fov, 0.01) && got.fly;
  check(`restore: ${link} puts the camera exactly where the contributor was (position to 1 cm, heading and pitch to 0.02 deg, fov) with the same time preset and season`, ok && got.preset === pose.timePreset && got.season === pose.season, JSON.stringify([got, pose.enu, pose.heading, pose.pitch, pose.fov]));
  await T.save('desktop_restored_view');
  await T.openSheet();
  const again = await T.page.eval('window.__contrib.state.pose');
  check('restore: a report made from the restored view carries the same pose (round trip through the link)', JSON.stringify(again.enu) === JSON.stringify(pose.enu) && Math.abs(norm180(again.heading - pose.heading)) <= 0.011 && near(again.pitch, pose.pitch, 0.011) && near(again.fov, pose.fov, 0.011), JSON.stringify([again.enu, again.heading, again.pitch, again.fov]));
  await T.page.S('Page.close').catch(() => {});
}

/** The numbers the backend announces in GET /health reach the sheet (an operator configuration other than the defaults): the points copy, the photo limit and size. */
async function configCheck(browser, mock) {
  const P = { ...PROFILES.desktop, name: 'desktop' };
  mock.reset(); mock.setLimits({ pointsIssue: 7, pointsFix: 30, maxPhotos: 3, maxPhotoMB: 5 });
  const T = await openPage(browser, P), { page } = T;
  try {
    const photos = await Promise.all([1, 2, 3, 4].map((i) => makePhoto(`config-${i}.jpg`, 40 * i)));
    await T.enter(); await page.eval('localStorage.clear()');
    await T.openSheet();
    await page.waitFor(`document.querySelector('[data-f="points"]').textContent.includes('約7ポイント')`, { timeout: 8000 }).catch(() => {});
    const got = await page.eval(`({ points: document.querySelector('[data-f="points"]').textContent, hint: document.querySelector('[data-f="photos-hint"]').textContent, counter: document.querySelector('[data-f="photos-n"]').textContent, max: document.querySelector('[data-f="note-max"]').textContent })`);
    const asked = mock.state.requests.filter((r) => r.method === 'GET' && r.path === '/api/contrib/v1/health' && r.status === 200).length;
    check('config: the sheet asked GET /health once and shows what the backend announced: about 7 and 30 points, 5 MB a photo, up to 3 photos', asked === 1 && got.points.includes('約7ポイント') && got.points.includes('約30ポイント') && got.hint.includes('1枚5MBまで') && got.counter === '0 / 3枚' && got.max === '2000', JSON.stringify({ asked, ...got }));
    await T.attach('#kc-file', ...photos.map((p) => p.file));
    await page.waitFor("document.querySelectorAll('.kc-tile').length === 3", { timeout: 10000 }).catch(() => {});
    const tiles = await page.eval(`({ n: document.querySelectorAll('.kc-tile').length, err: document.querySelector('#kc-e-photos').textContent, counter: document.querySelector('[data-f="photos-n"]').textContent })`);
    check('config: of four photos only three are taken, and the sheet says why (写真は3枚までです)', tiles.n === 3 && tiles.err === '写真は3枚までです' && tiles.counter === '3 / 3枚', JSON.stringify(tiles));
    await page.waitFor("document.querySelectorAll('.kc-tile img').length === 3", { timeout: 15000 }).catch(() => {});   // (the thumbnails, for the picture)
    await page.eval(`(() => { const b = document.querySelector('.kc-body'), p = document.querySelector('.kc-photos'); b.scrollTop += p.getBoundingClientRect().top - b.getBoundingClientRect().top - 24; })()`);
    await T.save('desktop_config');
  } finally {
    mock.setLimits({ pointsIssue: 5, pointsFix: 20, maxPhotos: 6, maxPhotoMB: 15 });
    await page.S('Page.close').catch(() => {});
  }
}

/** The QR link opened on another device (another origin, so another localStorage): the code is filled in, 「引き継ぐ」 moves the login. */
async function claimCheck(browser, link) {
  const P = { ...PROFILES.portrait, name: 'portrait' };
  const second = new URL(link); second.hostname = 'localhost';
  const T = await openPage(browser, P, { host: 'localhost' });
  await enterTown(T.page, second.toString());
  await T.page.waitFor('window.__contrib && window.__contrib.state.open', { timeout: 15000 });
  await sleep(1200);
  const st = await T.page.eval(`({ tab: window.__contrib.state.tab, value: document.querySelector('#kc-claim-in').value, hint: document.querySelector('.kc-claim .kc-hint')?.textContent, url: location.search, acct: localStorage.getItem('klc.contrib.acct.v1') })`);
  check('second device: the QR link opens マイ投稿 with the code filled in and a hint, takes the code out of the address bar, and this device has no login yet', st.tab === 'mine' && /^[0-9A-Z]{10}$/.test(st.value) && st.hint.includes('引き継ぐ') && !st.url.includes('claim=') && st.acct === null, JSON.stringify(st));
  await T.save('portrait_claim_second_device');
  await T.tap('#kc-claimform [data-act="claim"]'); await sleep(1800);
  const done = await T.page.eval(`({ items: document.querySelectorAll('.kc-item').length, nick: document.querySelector('.kc-me dd')?.textContent, acct: Object.keys(JSON.parse(localStorage.getItem('klc.contrib.acct.v1') || '{}')) })`);
  check('second device: 「引き継ぐ」 moves the login: the earlier reports and the nickname are here, a login is stored on this device', done.items >= 4 && done.nick === 'そら' && done.acct.length === 1, JSON.stringify(done));
  await T.save('portrait_claimed');
  await T.tap('.kc-tab[data-tab="report"]');
  const form2 = await T.page.eval(`({ nick: document.querySelector('#kc-nick').value, crew: document.querySelector('#kc-crew').value })`);
  check('second device: the report form shows the claimed nickname (a blank field would erase it on the server at the next report)', form2.nick === 'そら', JSON.stringify(form2));
  await T.page.S('Page.close').catch(() => {});
}

// ------------------------------------------------------------------ run
const { srv } = args.nobuild ? { srv: serve({ port: APP_PORT, dist: join(ROOT, `dist/anime-${APP_PORT}`) }) } : await buildAndServe(APP_PORT);
const mock = startMock({ port: API_PORT, adminToken: DEFAULTS.adminToken });
let browser;
try {
  browser = await launch({ quiet: true });
  for (const name of Object.keys(PROFILES).filter((p) => only.has(p))) {
    const r = await runProfile(browser, mock, name);
    // (the mock is reset at the start of each viewport: the second-device check needs this viewport's login and code, so it runs right away)
    if (!QUICK && name === 'desktop') { await restoreCheck(browser, r.pose); await configCheck(browser, mock); }
    if (!QUICK && name === 'portrait') await claimCheck(browser, r.claimLink);
  }
  if (only.has('config') && !only.has('desktop')) await configCheck(browser, mock);   // --only config: just the /health numbers check
} finally { await browser?.close(); srv.stop(); mock.stop(); }
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
