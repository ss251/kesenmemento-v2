// [emil-ui] The HUD's inventory and screenshots for the declutter pass (lanes/emil-ui.md): every state a player meets (title, walk, fly, drive,
// the あそぶ hub, a running mode) at phone portrait 390x844 @3, phone landscape 844x390 @3 (rotated in place, like a turned phone) and desktop
// 1440x900, in Japanese and English. For each state: a PNG and the list of on-screen widgets (outermost interactive or painted boxes, with
// their text and rect), their pairwise overlaps, and how much of the screen the HUD covers (a 6 px grid sample).
//   KLC_GATE_LOAD=20 KLC_GATE_STOP=30 tools/anime/gate.sh chrome --fg env -u NODE_OPTIONS bun tools/anime/emil-ui-shots.mjs --port 9590 --label before
// Options: --lang ja,en  --views phone,desk  --states title,walk,fly,drive,hub,run  --out dist/emil-ui
// Output: <out>/<label>/<view>-<lang>-<state>.png and <out>/<label>/inventory.json
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildAndServe, launch, phonePage, setViewport, fingers, center, waitGo, sleep, ROOT } from './pad-lib.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = Number(arg('port', 9590));
const LABEL = arg('label', 'before');
const LANGS = arg('lang', 'ja,en').split(',');
const VIEWS = arg('views', 'phone,desk').split(',');
const STATES = new Set(arg('states', 'title,walk,fly,drive,hub,run').split(','));
const OUT = join(ROOT, arg('out', 'dist/emil-ui'), LABEL);
const QUERY = arg('query', '');
mkdirSync(OUT, { recursive: true });

const PORTRAIT = { width: 390, height: 844, dpr: 3, insets: { top: 47, bottom: 34, left: 0, right: 0 } };
const LANDSCAPE = { width: 844, height: 390, dpr: 3, insets: { top: 0, bottom: 21, left: 47, right: 47 } };
const DESK = { width: 1440, height: 900, dpr: 1 };

// The widget census, run in the page. A widget is the outermost visible interactive element (button, link, input, role=button) or the outermost
// painted box (a background, a border or a backdrop filter) inside one of the HUD roots; a text leaf with no painted parent counts as a widget too.
const CENSUS = `(() => {
  const ROOTS = ['#klc-ui', '#klc-ui-restore', '#klc-x', '#klc-pad', '#klc-play', '#klc-board', '#klc-ship', '#klc-story', '#klc-m', '#klc-labels', '#toast', '#corner', '#help', '#credit', '#intro', '#klc-photo', '#klc-multi', '#klc-contrib', '#klc-jpyc', '#course-quit'];
  const shown = (e) => { for (let p = e; p && p !== document.documentElement; p = p.parentElement) { if (p.hidden) return false; const s = getComputedStyle(p); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity < 0.04) return false; } return true; };
  const boxOk = (b) => b.width >= 4 && b.height >= 4 && b.right > 0 && b.bottom > 0 && b.left < innerWidth && b.top < innerHeight;
  const painted = (e) => { const s = getComputedStyle(e); const bg = s.backgroundColor.match(/[\\d.]+/g); const a = bg ? (bg.length > 3 ? +bg[3] : 1) : 0;
    return (a > 0.06) || (s.backgroundImage && s.backgroundImage !== 'none') || (s.backdropFilter && s.backdropFilter !== 'none') || (s.webkitBackdropFilter && s.webkitBackdropFilter !== 'none') || (parseFloat(s.borderTopWidth) > 0.5 && !/rgba\\(\\d+, \\d+, \\d+, 0\\)/.test(s.borderTopColor)); };
  const interactive = (e) => e.matches('button, a[href], input, select, textarea, [role="button"], [role="slider"], [tabindex="0"]');
  const seen = new Set(), out = [];
  const name = (e) => (e.id ? '#' + e.id : e.tagName.toLowerCase()) + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\\s+/).slice(0, 3).join('.') : '') + (e.dataset.act ? '[act=' + e.dataset.act + ']' : '') + (e.dataset.id ? '[id=' + e.dataset.id + ']' : '') + (e.dataset.mode ? '[mode=' + e.dataset.mode + ']' : '') + (e.dataset.sheet ? '[sheet=' + e.dataset.sheet + ']' : '');
  const R = (b) => ({ l: Math.round(b.left), t: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) });
  const walk = (e, rootSel, inWidget) => {
    if (!(e instanceof Element)) return;
    if (e.tagName === 'CANVAS' || e.tagName === 'svg' || e.tagName === 'STYLE' || e.tagName === 'SCRIPT') return;
    if (!shown(e)) return;
    const b = e.getBoundingClientRect();
    let isW = false;
    if (!inWidget && boxOk(b) && (interactive(e) || painted(e))) isW = true;
    if (!inWidget && !isW && boxOk(b) && e.children.length === 0 && (e.textContent || '').trim()) isW = true;
    if (isW) { out.push({ root: rootSel, el: name(e), text: (e.innerText || e.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim().slice(0, 60), aria: e.getAttribute('aria-label') || '', r: R(b), btn: interactive(e), h: Math.round(b.height) }); seen.add(e); }
    for (const c of e.children) walk(c, rootSel, inWidget || isW);
  };
  for (const sel of ROOTS) { const r = document.querySelector(sel); if (r && shown(r)) { const b = r.getBoundingClientRect(); if (boxOk(b) && (interactive(r) || painted(r))) { out.push({ root: sel, el: name(r), text: (r.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 60), r: R(b), btn: interactive(r), h: Math.round(b.height) }); } else for (const c of r.children) walk(c, sel, false); } }
  // coverage: the share of a 6 px grid that falls inside any widget
  let hit = 0, n = 0; for (let y = 3; y < innerHeight; y += 6) for (let x = 3; x < innerWidth; x += 6) { n++; for (const w of out) { const q = w.r; if (x >= q.l && x < q.l + q.w && y >= q.t && y < q.t + q.h) { hit++; break; } } }
  const over = []; for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) { const p = out[i].r, q = out[j].r; const ix = Math.min(p.l + p.w, q.l + q.w) - Math.max(p.l, q.l), iy = Math.min(p.t + p.h, q.t + q.h) - Math.max(p.t, q.t); if (ix > 1 && iy > 1) { const contained = (ix * iy) >= 0.98 * Math.min(p.w * p.h, q.w * q.h); over.push({ a: out[i].el, b: out[j].el, area: ix * iy, contained }); } }
  const small = out.filter((w) => w.btn && (w.r.w < 44 || w.r.h < 44)).map((w) => w.el + ' ' + w.r.w + 'x' + w.r.h);
  const at = (x, y) => { const e = document.elementFromPoint(x, y); return e ? (e.id ? '#' + e.id : e.tagName.toLowerCase()) + (typeof e.className === 'string' && e.className ? '.' + e.className.split(/\\s+/).slice(0, 2).join('.') : '') : null; };
  const st = { vw: innerWidth, vh: innerHeight, widgets: out.length, buttons: out.filter((w) => w.btn).length, coverage: +(hit / n).toFixed(3), padMode: window.__pad?.mode ?? null, playing: document.body.classList.contains('playing'),
    probe: { lowLeft: at(60, innerHeight - 90), lowRight: at(innerWidth - 60, innerHeight - 90), midRight: at(innerWidth - 60, innerHeight / 2) } };   // (what a thumb landing there touches)
  return { st, widgets: out, overlaps: over.filter((o) => !o.contained), smallTargets: small };
})()`;

const inv = {};
const log = (...a) => console.error('[emil-ui]', ...a);
async function snap(page, key) {
  await page.frames(4);
  const file = join(OUT, key + '.png');
  await page.shot(file);
  let c = null; try { c = await page.eval(CENSUS); } catch (e) { c = { error: String(e.message || e) }; }
  inv[key] = c;
  log(key, c?.st ? `widgets ${c.st.widgets} (buttons ${c.st.buttons}) coverage ${(c.st.coverage * 100).toFixed(1)}% overlaps ${c.overlaps.length}` : c?.error);
  writeFileSync(join(OUT, 'inventory.json'), JSON.stringify(inv, null, 1));
}
const tryState = async (name, fn) => { try { await fn(); } catch (e) { log('state', name, 'failed:', String(e.message || e).slice(0, 300)); } };

const { srv } = await buildAndServe(PORT);
const browser = await launch({ quiet: true });
log('serving', srv.url, '->', OUT);
try {
  for (const lang of LANGS) {
    const url = `${srv.url}index.html?lang=${lang}${QUERY ? '&' + QUERY : ''}`;
    if (VIEWS.includes('phone')) {
      const page = await phonePage(browser, PORTRAIT);
      const f = fingers(page);
      const tapSel = async (sel) => { const c = await center(page, sel); if (!c || !c.w) throw new Error('no ' + sel); await f.tap(c.x, c.y); };
      // the mode chip when it is on the screen (before), else the same switch the e2e tests make (the pad follows the player and the car)
      const mode = async (m) => {
        const c = await center(page, `#klc-pad .chip button[data-mode="${m}"]`);
        if (c && c.w) await f.tap(c.x, c.y);
        else await page.eval(`(() => { const e = window.__explore, p = window.__ctx.playerObj; if (e.drive.active) e.drive.exit(); p.fly = ${m === 'fly'}; if (${m === 'drive'}) e.drive.enter(); })()`);
        await page.waitFor(`window.__pad.mode === '${m}'`, { timeout: 8000 }); await sleep(m === 'drive' ? 2200 : 1600);
      };
      await page.goto(url);
      await page.waitFor("document.body.classList.contains('loaded')", { timeout: 280000 });
      await waitGo(page);
      await sleep(600);
      if (STATES.has('title')) await snap(page, `pp-${lang}-title`);
      const g = await center(page, '#go'); await f.tap(g.x, g.y);
      await page.waitFor("document.body.classList.contains('playing')", { timeout: 20000 });
      await page.eval("window.__camSpec && window.__camSpec('walk')");
      await page.waitFor('!window.__pad.hidden', { timeout: 20000 });
      await sleep(2500);
      await snap(page, `pp-${lang}-walk0`);   // what a first visit sees (the one-time coach mark included)
      await tryState('coach', async () => { const ok = await center(page, '#klc-pad .coach .ok'); if (ok && ok.w) { await f.tap(ok.x, ok.y); await sleep(700); } });
      if (STATES.has('walk')) await snap(page, `pp-${lang}-walk`);
      // the ☰ menu, and what the time chip opens (before: the arrivals panel; after: the time sheet)
      if (STATES.has('walk')) await tryState('menu', async () => { await tapSel('#klc-ui .mbtn'); await sleep(700); await snap(page, `pp-${lang}-menu`); await tapSel('#klc-ui .mbtn'); await sleep(500); });
      const night = async (key) => { await page.eval("window.__life.time.set('yoru'); 0"); await sleep(3200); await snap(page, key); await page.eval("(window.__life.time.followLive ? window.__life.time.followLive() : window.__life.time.set('hiru')), 0"); await sleep(4000); };
      if (STATES.has('walk')) await tryState('night', () => night(`pp-${lang}-night`));
      if (STATES.has('walk')) await tryState('chip', async () => { await tapSel('#klc-ui .brand .chip'); await sleep(800); await snap(page, `pp-${lang}-chip`); await tapSel('#klc-ui .brand .chip'); await sleep(600); });
      if (STATES.has('fly')) await tryState('fly', async () => { await mode('fly'); await snap(page, `pp-${lang}-fly`); });
      if (STATES.has('drive')) await tryState('drive', async () => { await mode('drive'); await snap(page, `pp-${lang}-drive`); });
      await tryState('walk-back', async () => { await mode('walk'); });
      if (STATES.has('hub')) await tryState('hub', async () => {
        await page.eval("document.querySelector('#klc-play [data-act=\"play\"]').click()");
        await page.waitFor("document.querySelector('#klc-play').classList.contains('hub-open')", { timeout: 8000 }); await sleep(1200);
        await snap(page, `pp-${lang}-hub`);
        await page.eval("document.querySelector('#klc-play [data-act=\"play\"]').click()"); await sleep(300);
        await page.S('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await page.S('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await sleep(900);
      });
      // landscape: the same page, turned
      await setViewport(page, LANDSCAPE); await sleep(1500);
      if (STATES.has('walk')) await snap(page, `pl-${lang}-walk`);
      if (STATES.has('fly')) await tryState('fly-l', async () => { await mode('fly'); await snap(page, `pl-${lang}-fly`); });
      if (STATES.has('drive')) await tryState('drive-l', async () => { await mode('drive'); await snap(page, `pl-${lang}-drive`); });
      await tryState('walk-back-l', async () => { await mode('walk'); });
      if (STATES.has('hub')) await tryState('hub-l', async () => {
        await page.eval("document.querySelector('#klc-play [data-act=\"play\"]').click()");
        await page.waitFor("document.querySelector('#klc-play').classList.contains('hub-open')", { timeout: 8000 }); await sleep(1200);
        await snap(page, `pl-${lang}-hub`);
        await page.S('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await page.S('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await sleep(900);
      });
      if (STATES.has('run')) await tryState('run', async () => {
        const ids = await page.eval("window.__ctx.services.play.listModes().map((m) => m.id)");
        log('modes', ids.join(' '));
        const pick = ids.find((id) => /course|race|run/.test(id)) || ids[0];
        await setViewport(page, PORTRAIT); await sleep(1200);
        await page.eval(`(() => { const spec = window.__ctx.services.play.listModes().find((x) => x.id === ${JSON.stringify(pick)}); window.__play.ui.run(spec); return true; })()`);
        await sleep(9000);
        await snap(page, `pp-${lang}-run`);
        await setViewport(page, LANDSCAPE); await sleep(1500);
        await snap(page, `pl-${lang}-run`);
      });
      await f.release().catch(() => {});
      await page.S('Page.close').catch(() => {});
    }
    if (VIEWS.includes('desk')) {
      const page = await browser.page(DESK);
      const setMode = async (m) => { await page.eval(`(() => { const e = window.__explore, p = window.__ctx.playerObj; if (e.drive.active) e.drive.exit(); p.fly = ${m === 'fly'}; if (${m === 'drive'}) e.drive.enter(); })()`); await sleep(m === 'drive' ? 2200 : 1600); };
      await page.goto(url);
      await page.waitFor("document.body.classList.contains('loaded')", { timeout: 280000 });
      await waitGo(page); await sleep(600);
      if (STATES.has('title')) await snap(page, `dk-${lang}-title`);
      await page.eval("document.getElementById('go').click()");
      await page.waitFor("document.body.classList.contains('playing')", { timeout: 20000 });
      await page.eval("window.__camSpec && window.__camSpec('walk')");
      await sleep(2500);
      if (STATES.has('walk')) await snap(page, `dk-${lang}-walk`);
      if (STATES.has('walk')) await tryState('night-d', async () => { await page.eval("window.__life.time.set('yoru'); 0"); await sleep(3200); await snap(page, `dk-${lang}-night`); await page.eval("(window.__life.time.followLive ? window.__life.time.followLive() : window.__life.time.set('hiru')), 0"); await sleep(4000); });
      if (STATES.has('fly')) await tryState('fly-d', async () => { await setMode('fly'); await snap(page, `dk-${lang}-fly`); });
      if (STATES.has('drive')) await tryState('drive-d', async () => { await setMode('drive'); await snap(page, `dk-${lang}-drive`); });
      await tryState('walk-back-d', async () => { await setMode('walk'); });
      if (STATES.has('hub')) await tryState('hub-d', async () => {
        await page.eval("document.querySelector('#klc-play [data-act=\"play\"]').click()");
        await page.waitFor("document.querySelector('#klc-play').classList.contains('hub-open')", { timeout: 8000 }); await sleep(1200);
        await snap(page, `dk-${lang}-hub`);
        await page.S('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await page.S('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await sleep(900);
      });
      if (STATES.has('run')) await tryState('run-d', async () => {
        const ids = await page.eval("window.__ctx.services.play.listModes().map((m) => m.id)");
        const pick = ids.find((id) => /course|race|run/.test(id)) || ids[0];
        await page.eval(`(() => { const spec = window.__ctx.services.play.listModes().find((x) => x.id === ${JSON.stringify(pick)}); window.__play.ui.run(spec); return true; })()`);
        await sleep(9000);
        await snap(page, `dk-${lang}-run`);
      });
      await page.S('Page.close').catch(() => {});
    }
  }
} finally {
  await browser.close();
  srv.stop();
}
log('done', OUT);
