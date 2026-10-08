// [ui-b] UI lane B, rows 8, 11, 13 and 12 of the UI review (not included), in the real app: the intro card on short landscape screens
// and its exit, the ship UI's top bar over the card scrim, the story card's edges and touch scroll, the search sheet and the minimap.
// Headless Chrome (an iPhone-shaped page with real CDP touches, then a 1440x900 desktop page). Heavy (it builds the app and loads the
// town twice), so it only runs on request, through the machine gate (one Chrome machine-wide):
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS KLC_E2E=1 KLC_E2E_PORT=9405 [KLC_E2E_DIST=<built dir> KLC_SHOT_DIR=<dir> KLC_SHOT_LABEL=before|after KLC_UIB_OUT=<file.json>] bun test test/ui-b.e2e.test.js
// Every test measures first and asserts last, so the same file run against an older build records its numbers before it fails. The tests enter the town and reset it
// themselves, so `-t "row 12"` runs alone. Launcher knobs (cdp.mjs launch() sometimes loses Chrome's stderr, see withActivePortFallback): KLC_UIB_TRIES (default 3),
// KLC_UIB_NOFALLBACK=1 (use launch() as it is), KLC_UIB_CHROME (the browser binary). The browsers and the profiles this file starts are killed when each session ends.
import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { buildAndServe, launch, phonePage, setViewport, center, fingers, sleep, ROOT } from "../tools/anime/pad-lib.mjs";
import { serve } from "../tools/anime/cdp.mjs";

const RUN = process.env.KLC_E2E === "1" && process.env.KLC_GATE === "1";
const PORT = Number(process.env.KLC_E2E_PORT || 9405);
const SHOTS = process.env.KLC_SHOT_DIR ? resolve(ROOT, process.env.KLC_SHOT_DIR) : null;
const LABEL = process.env.KLC_SHOT_LABEL || "after";
const OUT = process.env.KLC_UIB_OUT ? resolve(ROOT, process.env.KLC_UIB_OUT) : null;
const d = RUN ? describe : describe.skip;
const T = (name, fn) => test(name, fn, 300000);
const M = { label: LABEL };   // every number the run measured (written to KLC_UIB_OUT)
let SERVER = null;   // one build and one server for both sessions (the second describe stops it); KLC_E2E_DIST serves an existing build instead (the "before" run)
const server = async () => (SERVER ||= process.env.KLC_E2E_DIST ? serve({ port: PORT, dist: resolve(ROOT, process.env.KLC_E2E_DIST) }) : (await buildAndServe(PORT)).srv);

const shot = async (page, name) => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  const buf = await page.shot();
  await sharp(buf).jpeg({ quality: 74 }).toFile(join(SHOTS, `${name}-${LABEL}.jpg`));
};
/** Kill every headless Chrome this worktree started (cdp.mjs close() can leave the browser process behind: it showed up orphaned under launchd). */
const reap = () => { try { Bun.spawnSync(["pkill", "-f", `${ROOT}/dist/.chrome-`]); } catch { /* nothing to kill */ } };
const CHROME_BIN = process.env.KLC_UIB_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
/** cdp.mjs launch() waits for "DevTools listening on ws://..." on Chrome's stderr. On this machine Chrome sometimes starts, keeps running (it shows up orphaned under launchd) and
 *  closes that pipe without printing the line: its port is then in <profile>/DevToolsActivePort, so the line is made from there. Bun.spawn is wrapped for the one call. */
function withActivePortFallback(run) {
  const real = Bun.spawn, enc = new TextEncoder(), dec = new TextDecoder();
  Bun.spawn = (cmd, opts) => {
    const proc = real.call(Bun, cmd, opts);
    if (!Array.isArray(cmd) || cmd[0] !== CHROME_BIN || process.env.KLC_UIB_NOFALLBACK) return proc;
    const dir = String(cmd.find((a) => String(a).startsWith("--user-data-dir=")) || "").slice("--user-data-dir=".length);
    const stderr = new ReadableStream({
      async start(ctl) {
        let seen = false;
        const r = proc.stderr.getReader();
        for (;;) { const { value, done } = await r.read(); if (done) break; if (dec.decode(value).includes("DevTools listening")) seen = true; ctl.enqueue(value); }
        for (let i = 0; !seen && i < 160; i++) {   // up to 40 s
          const f = Bun.file(join(dir, "DevToolsActivePort"));
          if (await f.exists()) { const [port, path] = (await f.text()).trim().split("\n"); if (port && path) { ctl.enqueue(enc.encode(`DevTools listening on ws://127.0.0.1:${port}${path}\n`)); console.error(`[ui-b] chrome closed its stderr before printing the DevTools line; port ${port} read from DevToolsActivePort`); seen = true; break; } }
          await sleep(250);
        }
        ctl.close();
      },
    });
    return { stderr, kill: (...a) => proc.kill(...a), pid: proc.pid, exited: proc.exited, get exitCode() { return proc.exitCode; } };
  };
  return run().finally(() => { Bun.spawn = real; });
}
/** launch() with the fallback above and a retry (every try starts clean: any browser left from the last one is killed first). */
const launchChrome = async () => {
  let last;
  for (let i = 0; i < (Number(process.env.KLC_UIB_TRIES) || 3); i++) {
    reap();
    try { return await withActivePortFallback(() => launch({ quiet: true })); } catch (e) { last = e; console.error(`[ui-b] chrome did not start (${e.message.split("\n")[0]}), try ${i + 1}`); await sleep(3000 * (i + 1)); }
  }
  throw last;
};
/** Pixels that change in the right-hand end of a search field when it holds text: Chrome draws its native clear button there (only with text, and with the mouse over the
 *  field or the focus in it). getComputedStyle(input, '::-webkit-search-cancel-button') answers with the input's own style, so the button is looked at, not asked. */
async function clearButtonPixels(page, sel) {
  const at = JSON.stringify(sel);
  const r = await page.eval(`(() => { const i = document.querySelector(${at}); i.focus(); const b = i.getBoundingClientRect(); return { x: b.right - 30, y: b.top + 2, w: 28, h: b.height - 4, mx: b.left + b.width / 2, my: b.top + b.height / 2 }; })()`);
  await page.S("Input.dispatchMouseEvent", { type: "mouseMoved", x: r.mx, y: r.my, button: "none" });
  const grab = async (value) => {
    await page.eval(`(() => { const i = document.querySelector(${at}); i.value = ${JSON.stringify(value)}; i.dispatchEvent(new Event('input')); })()`); await sleep(350);
    const { data } = await page.S("Page.captureScreenshot", { format: "png", clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 1 } });
    return sharp(Buffer.from(data, "base64")).removeAlpha().raw().toBuffer();
  };
  const empty = await grab(""), typed = await grab("a");
  let n = 0; for (let k = 0; k + 2 < Math.min(empty.length, typed.length); k += 3) if (Math.abs(empty[k] - typed[k]) + Math.abs(empty[k + 1] - typed[k + 1]) + Math.abs(empty[k + 2] - typed[k + 2]) > 24) n++;
  return n;
}
const desk = (page, w, h) => page.S("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false, screenWidth: w, screenHeight: h });

// ------------------------------------------------------------------ in-page measurements (strings: they run in the page)
const RECT = `const rc = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { l: +b.left.toFixed(1), t: +b.top.toFixed(1), r: +b.right.toFixed(1), b: +b.bottom.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };`;
/** The title screen (v3, docs/loading/README.md): where 「タップしてスタート」 is, whether anything covers it, and whether the still, the mark and the button overlap. */
const INTRO_JS = `(() => { ${RECT}
  const go = document.querySelector('#go'), intro = document.querySelector('#intro'), brand = document.querySelector('#logo'), peek = document.querySelector('.hoya img'), credit = document.querySelector('#intro .credit'), run = document.querySelector('.runner'), tip = document.querySelector('.tip');
  const g = rc(go), cs = getComputedStyle(intro), hit = go ? document.elementFromPoint(g.l + g.w / 2, g.t + g.h / 2) : null;
  const ov = (a, b) => !!(a && b && a.l < b.r - 0.5 && a.r > b.l + 0.5 && a.t < b.b - 0.5 && a.b > b.t + 0.5);
  const B = rc(brand), P = rc(peek), C = rc(credit), R = rc(run), G = g, TB = tip && getComputedStyle(tip).display !== 'none' ? rc(tip) : null;
  return { vw: innerWidth, vh: innerHeight, go: g, brand: B, peek: P, credit: C, runner: R,
    intro: { display: cs.display, visibility: cs.visibility, h: rc(intro).h, backdrop: cs.backdropFilter },
    goInside: !!g && g.t >= -0.5 && g.b <= innerHeight + 0.5 && g.l >= -0.5 && g.r <= innerWidth + 0.5, goHit: !!hit && (hit === go || go.contains(hit)), goDisabled: !!go?.disabled,
    peekInside: !!P && P.l >= -0.5 && P.r <= innerWidth + 0.5 && P.t >= -0.5, creditInside: !!C && C.l >= -0.5 && C.r <= innerWidth + 0.5 && C.b <= innerHeight + 0.5,
    clash: { peekBrand: ov(P, B), peekGo: ov(P, G), creditGo: ov(C, G), peekRunner: ov(P, R), creditRunner: ov(C, R), brandGo: ov(B, G), peekTip: ov(P, TB), creditTip: ov(C, TB), goTip: ov(G, TB), brandTip: ov(B, TB) } };
})()`;
/** The ship UI's top bar: can the three buttons be hit, are their labels on one line, how tall are they, does the bar fit one row. */
const SHIP_BAR_JS = `(() => { ${RECT}
  const q = (s) => document.querySelector(s);
  const lines = (el) => { const r = document.createRange(); r.selectNodeContents(el); return new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top))).size; };
  const hit = (a) => { const b = q('#klc-ship .tools [data-a="' + a + '"]'); if (!b) return null; const r = b.getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { ok: !!e && (e === b || b.contains(e)), on: e ? e.tagName + '.' + String(e.className || '') : null, text: b.textContent.trim(), w: +r.width.toFixed(1), h: +r.height.toFixed(1), lines: lines(b), right: +r.right.toFixed(1) }; };
  const acts = q('#klc-ship .acts'), tools = q('#klc-ship .tools'), top = q('#klc-ship .top'), inner = q('#klc-ship .card .inner'), ship = q('#klc-ship');
  return { vw: innerWidth, vh: innerHeight, lang: ship.getAttribute('lang'), view: ship.dataset.view || null, facts: hit('facts'), lang_: hit('lang'), exit: hit('exit'),
    chips: [...document.querySelectorAll('#klc-ship .acts span')].map((s) => ({ t: s.textContent, lines: lines(s) })), acts: rc(acts), tools: rc(tools), top: rc(top), inner: rc(inner),
    oneRow: !!acts && !!tools && tools.getBoundingClientRect().top < acts.getBoundingClientRect().bottom - 1, fitsViewport: !!tools && tools.getBoundingClientRect().right <= innerWidth + 0.5, topH: top ? +top.getBoundingClientRect().height.toFixed(1) : null };
})()`;
/** The story card: its box against the screen, its close button, whether it can scroll. */
const STORY_JS = `(() => { ${RECT}
  const c = document.querySelector('#klc-story'), x = c && c.querySelector('.x'), cs = c && getComputedStyle(c);
  return !c ? null : { vw: innerWidth, vh: innerHeight, card: rc(c), x: rc(x), lang: c.lang, boxSizing: cs.boxSizing, dataScroll: c.hasAttribute('data-scroll'), scrollH: c.scrollHeight, clientH: c.clientHeight, scrollTop: c.scrollTop, overflowY: cs.overflowY, hidden: c.hidden, h3: c.querySelector('h3')?.textContent || '',
    h3Lines: (() => { const h = c.querySelector('h3'), r = document.createRange(); r.selectNodeContents(h); const by = new Map(); for (const q of r.getClientRects()) { if (q.width < 1) continue; const k = Math.round(q.top); by.set(k, (by.get(k) || 0) + q.width); } return [...by.values()].map((w) => +w.toFixed(1)); })() };
})()`;
/** The search sheet and the minimap: boxes, and what is actually visible. */
const SEARCH_JS = `(() => { ${RECT}
  const q = (s) => document.querySelector(s), s = q('#klc-x .xsearch'), m = q('#klc-x .mini'), i = q('#klc-x .xsearch input');
  const vis = (e) => { if (!e) return false; const c = getComputedStyle(e), b = e.getBoundingClientRect(); return c.display !== 'none' && c.visibility !== 'hidden' && +c.opacity > 0.01 && b.width > 1 && b.height > 1; };
  const sb = rc(s), mb = rc(m), ib = rc(i);
  const ov = (a, b) => (a && b && a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t) ? +((Math.min(a.r, b.r) - Math.max(a.l, b.l)) * (Math.min(a.b, b.b) - Math.max(a.t, b.t))).toFixed(0) : 0;
  const cancel = i ? getComputedStyle(i, '::-webkit-search-cancel-button') : null;
  return { vw: innerWidth, vh: innerHeight, open: !!s && !s.hidden, search: sb, mini: mb, miniDisplay: m && getComputedStyle(m).display, miniVisible: vis(m), boxOverlapPx: ov(sb, mb), visibleOverlapPx: vis(m) ? ov(sb, mb) : 0,
    input: { fontSize: i && getComputedStyle(i).fontSize, h: ib && ib.h, enterkeyhint: i && i.getAttribute('enterkeyhint'), autocapitalize: i && i.getAttribute('autocapitalize'), autocorrect: i && i.getAttribute('autocorrect'), cancelDisplay: cancel && cancel.display, cancelAppearance: cancel && cancel.webkitAppearance },
    placeholder: i && (() => { const cs = getComputedStyle(i), c = document.createElement('canvas').getContext('2d'); c.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
      const textW = +c.measureText(i.placeholder).width.toFixed(1), areaW = +(i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)).toFixed(1); return { text: i.placeholder, textW, areaW, fits: areaW > 0 && textW <= areaW }; })(),
    buttonsInRow: [...document.querySelectorAll('#klc-x .xsearch .row button')].filter(vis).length, kb: q('#klc-x').dataset.kb || null, vvh: q('#klc-x').style.getPropertyValue('--vvh') || null };
})()`;

// ------------------------------------------------------------------ the phone
const PORTRAIT = { width: 390, height: 844, dpr: 1 };
d("ui-b, a phone: the intro card, the story card, the ship UI's top bar, the search sheet (touch, iPhone UA)", () => {
  let browser, srv, page, f;
  const ev = (x) => page.eval(x);
  const settle = (ms = 600) => sleep(ms);
  const NO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };   // (an override stays until it is replaced: every size sets its own)
  const vp = async (w, h, insets = null) => { await setViewport(page, { width: w, height: h, dpr: 1, insets: insets ?? NO_INSETS }); await settle(700); };
  /** Into the town (a real tap on 「まちへ出る」), once; the tests that need the town call it, so a filtered run (-t) works. */
  const enter = async () => {
    if (await ev("document.body.classList.contains('playing')")) return;
    await vp(390, 844);
    const g = await center(page, "#go"); await f.tap(g.x, g.y);
    await page.waitFor("document.body.classList.contains('playing')", { timeout: 20000 });
    await page.waitFor("window.__pad && !window.__pad.hidden", { timeout: 30000 }).catch(() => {});
    await ev("window.__pad && window.__pad.dismissCoach && window.__pad.dismissCoach()"); await settle(800);
  };
  /** A clean town: the story card, the search sheet, the voyage closed (an earlier failed test must not leave its state in this one's pictures). */
  const reset = async () => { await enter(); await ev("(() => { window.__story?.card?.close(); window.__explore?.ui?.openSearch(false); window.__explore?.ui?.openMap(false); window.__voyage?.active && window.__voyage.exit(); })()"); await settle(700); };

  beforeAll(async () => {
    srv = await server();
    browser = await launchChrome();
    page = await phonePage(browser, PORTRAIT);
    await page.goto(`${srv.url}index.html`);
    await page.waitFor("document.body.classList.contains('loaded')", { timeout: 280000 });
    f = fingers(page);
    M.env = await ev(`({ ua: navigator.userAgent.slice(0, 60), coarse: matchMedia('(pointer: coarse)').matches, hoverNone: matchMedia('(hover: none)').matches, tier: window.__ctx?.quality?.tier })`);
  }, 330000);
  afterAll(async () => {
    try { M.pageErrors1 = (page?.errors?.() || []).slice(0, 12).map((e) => String(e.text).slice(0, 240)); } catch { /* page gone */ }
    try { if (OUT) { mkdirSync(resolve(OUT, ".."), { recursive: true }); writeFileSync(OUT, JSON.stringify(M, null, 1)); } } catch (e) { console.error("[ui-b] could not write the numbers", e.message); }
    await f?.release?.().catch(() => {}); await browser?.close(); reap();
  }, 60000);

  T("row 8: the loading and title screen fits short landscape screens (#go inside the viewport, reachable, 44 px; the still, its credit, the mark and the button never overlap)", async () => {
    const sizes = [[844, 340], [667, 300], [844, 390], [568, 320], [568, 240], [480, 200], [390, 664], [390, 844], [375, 667]];   // (the last two short ones are shorter than the compact card: the pinned footer keeps the button on screen)
    const out = {};
    for (const [w, h] of sizes) {
      await vp(w, h);
      out[`${w}x${h}`] = await ev(INTRO_JS);
      if ((w === 844 && h === 340) || (w === 667 && h === 300) || (w === 480 && h === 200) || (w === 390 && h === 844)) await shot(page, `row8-intro-${w}x${h}`);
    }
    M.row8 = out;
    for (const k of Object.keys(out)) {
      expect(out[k].goInside).toBe(true); expect(out[k].goHit).toBe(true); expect(out[k].go.h).toBeGreaterThanOrEqual(44);
      expect(out[k].peek).toBeNull(); expect(out[k].credit).toBeNull();
      if (!["480x200", "568x240"].includes(k)) { expect(Object.entries(out[k].clash).filter(([, v]) => v).map(([n]) => n)).toEqual([]); }   // (the two smallest windows are shorter than any picture can be)
    }
  });

  T("row 8: no focus ring under touch; the still is cut at once (display none, no iris) and the title is gone afterwards", async () => {
    await vp(390, 844);
    const ring = await ev(`(() => { const g = document.getElementById('go'), cs = getComputedStyle(g); return { active: document.activeElement === g, focusVisible: g.matches(':focus-visible'), outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth }; })()`);
    await ev(`(() => { const X = window.__x = { t0: 0, peek: null, credit: null, irisAt: null };
      new MutationObserver(() => { if (document.body.classList.contains('playing') && !X.t0) { X.t0 = performance.now(); X.peek = document.querySelector('.hoya img'); X.credit = document.querySelector('#intro .credit'); X.irisAt = !!document.getElementById('klc-iris'); } }).observe(document.body, { attributes: true, attributeFilter: ['class'] }); })()`);
    const g = await center(page, "#go"); await f.tap(g.x, g.y);
    await page.waitFor("document.body.classList.contains('playing')", { timeout: 20000 });
    await sleep(1500);
    const x = await ev("window.__x");
    const after = await ev(`(() => { const cs = getComputedStyle(document.getElementById('intro')); return { display: cs.display, opacity: +cs.opacity, pointer: cs.pointerEvents, backdrop: cs.backdropFilter, iris: !!document.getElementById('klc-iris') }; })()`);
    M.row8exit = { ring, peek: x.peek, credit: x.credit, irisAt: x.irisAt, after };
    await page.waitFor("window.__pad && !window.__pad.hidden", { timeout: 30000 }).catch(() => {});
    await ev("window.__pad && window.__pad.dismissCoach && window.__pad.dismissCoach()");
    expect(ring.outlineStyle).toBe("none");
    expect(x.peek).toBeNull(); expect(x.credit).toBeNull();   // no standing figure, no credit pill
    expect(x.irisAt).toBe(false); expect(after.iris).toBe(false);
    // gone = taken out of the page (display none, so it cannot catch a tap meant for the HUD), or faded and inert
    expect(after.display === "none" || (after.opacity === 0 && after.pointer === "none")).toBe(true); expect(after.backdrop).toBe("none");
  });

  T("row 13: the story card stays inside the screen at 375, 390 and 430 and in landscape, scrolls by touch, follows the language", async () => {
    await reset(); await vp(390, 844);
    const id = await ev("window.__story.places[0].id");
    await ev(`window.__story.open(${JSON.stringify(id)})`);
    const out = {};
    for (const [w, h, ins] of [[375, 667, null], [390, 844, null], [430, 932, null], [844, 390, { top: 0, bottom: 21, left: 47, right: 47 }], [844, 340, null]]) {
      await vp(w, h, ins); await settle(500);
      out[`${w}x${h}`] = await ev(STORY_JS);
      if ((w === 375 && h === 667) || (w === 844 && h === 390)) await shot(page, `row13-story-${w}x${h}`);
    }
    // a swipe on the card (landscape, sources opened so there is something to scroll): the pad's touchmove veto must let it through
    const swipe = {};
    for (const [w, h, ins] of [[844, 390, { top: 0, bottom: 21, left: 47, right: 47 }], [844, 340, null]]) {
      await vp(w, h, ins);
      await ev("(() => { const dt = document.querySelector('#klc-story details'); if (dt) dt.open = true; document.querySelector('#klc-story').scrollTop = 0; })()");
      await settle(300);
      const r = (await ev(STORY_JS));
      const x = (r.card.l + r.card.r) / 2, y0 = r.card.t + r.card.h * 0.8, y1 = r.card.t + r.card.h * 0.2;
      await f.down1(1, x, y0); await f.drag(1, x, y1, 10); await f.up(1); await settle(400);
      const a = await ev(STORY_JS);
      swipe[`${w}x${h}`] = { scrollH: a.scrollH, clientH: a.clientH, scrollTop: a.scrollTop, canScroll: a.scrollH > a.clientH + 2 };
    }
    // the HUD's language button (a real click on its handler, wherever the layout hides it): the card must follow
    await vp(390, 844);
    await ev("document.querySelector('#klc-ui [data-act=\"lang\"]').click()");
    await page.waitFor("document.querySelector('#klc-story').lang === 'en'", { timeout: 8000 }).catch(() => {});
    const en = await ev(STORY_JS);
    await ev("document.querySelector('#klc-ui [data-act=\"lang\"]').click()");
    await page.waitFor("document.querySelector('#klc-story').lang === 'ja'", { timeout: 8000 }).catch(() => {});
    const ja = await ev(STORY_JS);
    M.row13 = { sizes: out, swipe, en: { lang: en.lang, h3: en.h3, h3Lines: en.h3Lines }, ja: { lang: ja.lang, h3: ja.h3, h3Lines: ja.h3Lines } };
    for (const k of ["375x667", "390x844", "430x932"]) { expect(out[k].card.r).toBeLessThanOrEqual(out[k].vw + 0.5); expect(out[k].card.l).toBeGreaterThanOrEqual(0); expect(out[k].x.r).toBeLessThanOrEqual(out[k].vw); }
    for (const k of ["844x390", "844x340"]) { expect(out[k].card.b).toBeLessThanOrEqual(out[k].vh + 0.5); expect(out[k].card.h).toBeGreaterThanOrEqual(out[k].vh * 0.5); expect(out[k].x.h).toBeGreaterThanOrEqual(44); }
    for (const k of Object.keys(swipe)) { expect(swipe[k].canScroll).toBe(true); expect(swipe[k].scrollTop).toBeGreaterThan(10); }
    expect(out["390x844"].dataScroll).toBe(true);
    for (const k of ["375x667", "390x844"]) { const L = out[k].h3Lines; if (L.length > 1) expect(L.at(-1)).toBeGreaterThanOrEqual(Math.max(...L) * 0.35); }   // no one-character last line
    expect(en.lang).toBe("en"); expect(en.h3).not.toBe(ja.h3);
    await ev("window.__story.card.close()"); await settle(600);
  });

  T("row 11: the ship UI's top bar is reachable over every card scrim; labels on one line at 375; 44 px tools", async () => {
    await reset();
    const out = {};
    const beats = ["DOCKED", "TRANSSHIP_LAS_PALMAS", "REEFER", "SHIMIZU_WEIGH", "HOMECOMING", "CARD"];
    const run = async (w, h, bs, tag) => {
      await vp(w, h, h < 500 ? { top: 0, bottom: 21, left: 47, right: 47 } : null);
      for (const b of bs) {
        await ev(`window.__voyageShot('${b}')`); await settle(1500);
        out[`${tag}:${b}`] = await ev(SHIP_BAR_JS);
        if (b === "CARD" && (w === 375 || w === 390)) await shot(page, `row11-ship-${tag}-${b}`);
        if (b === "DOCKED" && w === 375) await shot(page, `row11-ship-${tag}-${b}`);
      }
    };
    await run(375, 667, beats, "ja375x667");
    await run(390, 844, ["DOCKED", "SHIMIZU_WEIGH", "CARD"], "ja390x844");
    await run(430, 932, ["DOCKED", "CARD"], "ja430x932");
    await run(844, 390, ["DOCKED", "SHIMIZU_WEIGH", "CARD"], "ja844x390");
    // English (the ship's own toggle; the labels are longer): one row at the widths of every phone
    await vp(375, 667);
    await ev("window.__voyageShot('CARD')"); await settle(1200);
    await ev("document.querySelector('#klc-ship [data-a=\"lang\"]').click()"); await settle(500);
    for (const [w, h] of [[375, 667], [390, 844], [414, 896], [430, 932], [360, 740]]) {
      await vp(w, h); await settle(300);
      out[`en${w}x${h}:CARD`] = await ev(SHIP_BAR_JS);
      if (w === 375 || w === 430) await shot(page, `row11-ship-en${w}x${h}-CARD`);
    }
    await ev("document.querySelector('#klc-ship [data-a=\"lang\"]').click()"); await settle(300);   // back to Japanese
    await ev("window.__voyage.active && window.__voyage.exit()"); await settle(900);
    M.row11 = out;
    for (const [k, v] of Object.entries(out)) {
      for (const a of ["facts", "lang_", "exit"]) { expect(v[a]?.ok).toBe(true); expect(v[a].lines).toBe(1); expect(v[a].h).toBeGreaterThanOrEqual(44); }
      for (const c of v.chips) expect(c.lines).toBe(1);
      expect(v.oneRow).toBe(true); expect(v.fitsViewport).toBe(true);
      void k;
    }
  });

  T("row 12: the search sheet on a phone: 16 px field, one close button, no minimap, above the keyboard", async () => {
    await reset(); await vp(390, 844); await settle(300);
    await ev("window.__explore.ui.openSearch(true)"); await settle(600);
    const portrait = await ev(SEARCH_JS);
    await shot(page, "row12-search-390x844");
    // the on-screen keyboard: visualViewport shrinks, 100vh and innerHeight do not (shadowed on the instance, then restored)
    await ev("Object.defineProperty(visualViewport, 'height', { value: 509, configurable: true }); visualViewport.dispatchEvent(new Event('resize'))"); await settle(500);
    const kbPortrait = await ev(SEARCH_JS);
    await shot(page, "row12-search-390x844-keyboard");
    await ev("delete visualViewport.height; visualViewport.dispatchEvent(new Event('resize'))"); await settle(300);
    await ev("window.__explore.ui.openSearch(false)");
    await vp(844, 390, { top: 0, bottom: 21, left: 47, right: 47 });
    await ev("window.__explore.ui.openSearch(true)"); await settle(600);
    const landscape = await ev(SEARCH_JS);
    await ev("Object.defineProperty(visualViewport, 'height', { value: 190, configurable: true }); visualViewport.dispatchEvent(new Event('resize'))"); await settle(500);
    const kbLandscape = await ev(SEARCH_JS);
    await shot(page, "row12-search-844x390-keyboard");
    await ev("delete visualViewport.height; visualViewport.dispatchEvent(new Event('resize'))"); await settle(300);
    await ev("window.__explore.ui.openSearch(false)");
    M.row12phone = { portrait, kbPortrait, landscape, kbLandscape };
    expect(portrait.input.fontSize).toBe("16px"); expect(portrait.input.h).toBeGreaterThanOrEqual(44);
    expect(portrait.buttonsInRow).toBe(1); expect(portrait.placeholder.fits).toBe(true);
    expect(portrait.miniVisible).toBe(false); expect(landscape.visibleOverlapPx).toBe(0);
    expect(kbPortrait.kb).toBe("1"); expect(kbPortrait.search.b).toBeLessThanOrEqual(509);
    expect(kbLandscape.kb).toBe("1"); expect(kbLandscape.search.b).toBeLessThanOrEqual(190); expect(kbLandscape.search.t).toBeGreaterThanOrEqual(0);
  });
});

// ------------------------------------------------------------------ the desktop
d("ui-b, a 1440x900 desktop: the intro card, the search sheet over the minimap, the story card, the ship UI over its scrim", () => {
  let browser, srv, page;
  const ev = (x) => page.eval(x);
  const settle = (ms = 600) => sleep(ms);
  const mouse = async (x, y) => {
    await page.S("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none" });
    await page.S("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await page.S("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  };
  /** Into the town (a real click on 「まちへ出る」), once; the tests that need the town call it, so a filtered run (-t) works. */
  const enter = async () => {
    if (await ev("document.body.classList.contains('playing')")) return;
    await desk(page, 1440, 900); await settle(500);
    const g = await ev("(() => { const b = document.getElementById('go').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()");
    await mouse(g.x, g.y);
    await page.waitFor("document.body.classList.contains('playing')", { timeout: 20000 }); await settle(1500);
  };
  const reset = async () => { await enter(); await desk(page, 1440, 900); await ev("(() => { window.__story?.card?.close(); window.__explore?.ui?.openSearch(false); window.__explore?.ui?.openMap(false); window.__voyage?.active && window.__voyage.exit(); })()"); await settle(700); };

  beforeAll(async () => {
    srv = await server();
    browser = await launchChrome();
    page = await browser.page({ width: 1440, height: 900, dpr: 1 });
    await page.goto(`${srv.url}index.html?q=low`);
    await page.waitFor("document.body.classList.contains('loaded')", { timeout: 280000 });
  }, 330000);
  afterAll(async () => {
    try { M.pageErrors2 = (page?.errors?.() || []).slice(0, 12).map((e) => String(e.text).slice(0, 240)); } catch { /* page gone */ }
    try { if (OUT) { mkdirSync(resolve(OUT, ".."), { recursive: true }); writeFileSync(OUT, JSON.stringify(M, null, 1)); } } catch (e) { console.error("[ui-b] could not write the numbers", e.message); }
    await browser?.close(); reap(); srv?.stop();
  }, 60000);

  T("row 8: the desktop loading and title screen is centred, the focused prompt shows its ring to the keyboard only, and a short desktop window keeps the button on screen", async () => {
    const out = {};
    for (const [w, h] of [[1600, 900], [1440, 900], [1280, 720], [1440, 400]]) { await desk(page, w, h); await settle(600); out[`${w}x${h}`] = await ev(INTRO_JS); if (w === 1600 && h === 900) await shot(page, "row8-intro-1600x900"); }
    await desk(page, 1440, 900); await settle(400);
    const RING = "(() => { const g = document.getElementById('go'), cs = getComputedStyle(g); return { active: document.activeElement === g, focusVisible: g.matches(':focus-visible'), outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth }; })()";
    const ringMouse = await ev(RING);   // main.js focused it for the fine pointer; a mouse user sees no ring (v4: the v3 ring read as a huge outlined pill)
    await page.S("Input.dispatchKeyEvent", { type: "keyDown", key: "Shift", code: "ShiftLeft", windowsVirtualKeyCode: 16 }); await page.S("Input.dispatchKeyEvent", { type: "keyUp", key: "Shift", code: "ShiftLeft", windowsVirtualKeyCode: 16 });
    await settle(200);
    const ring = await ev(RING);
    M.row8desktop = { sizes: out, ringMouse, ring };
    expect(ringMouse.active).toBe(true); expect(ringMouse.outlineStyle).toBe("none");
    for (const k of Object.keys(out)) { expect(out[k].goInside).toBe(true); expect(out[k].goHit).toBe(true); expect(Object.entries(out[k].clash).filter(([, v]) => v).map(([n]) => n)).toEqual([]); }
    const a = out["1440x900"];
    expect(Math.abs((a.brand.l + a.brand.w / 2) - a.vw / 2)).toBeLessThanOrEqual(1.5);   // the mark is centred
    expect(Math.abs((a.go.l + a.go.w / 2) - a.vw / 2)).toBeLessThanOrEqual(1.5);          // and so is the button
    expect(ring.outlineStyle).not.toBe("none");
    await enter();
  });

  T("row 12: the minimap steps aside while the search sheet is open (no overlap at 1440x900), one close button, IME Enter keeps the sheet", async () => {
    await reset();
    await ev("window.__explore.ui.openSearch(true)"); await settle(700);
    const empty = await ev(SEARCH_JS);
    await shot(page, "row12-search-1440x900");
    // the native clear button: drawn only when the field holds text. A field outside #klc-x (no rule of ours) is the control: it must show the change, ours must not.
    await ev("document.body.insertAdjacentHTML('beforeend', '<input id=\"ui-b-ctl\" type=\"search\" style=\"position:fixed;left:8px;top:8px;width:300px;height:40px;z-index:2147483000;font:16px sans-serif\">')");
    const clearControl = await clearButtonPixels(page, "#ui-b-ctl");
    await ev("document.getElementById('ui-b-ctl').remove()");
    const clearOurs = await clearButtonPixels(page, "#klc-x .xsearch input");
    await ev("(() => { const i = document.querySelector('#klc-x .xsearch input'); i.value = '気仙'; i.dispatchEvent(new Event('input')); })()"); await settle(500);
    await shot(page, "row12-search-typed-1440x900");
    // type a query (a result list), then Enter that confirms a Japanese conversion must not fly to the first result
    await ev("(() => { const i = document.querySelector('#klc-x .xsearch input'); i.focus(); i.value = '気仙'; i.dispatchEvent(new Event('input')); })()"); await settle(500);
    const typed = await ev(SEARCH_JS);
    await ev("(() => { const i = document.querySelector('#klc-x .xsearch input'); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, isComposing: true, bubbles: true, cancelable: true })); })()"); await settle(500);
    const afterIme = await ev(SEARCH_JS);
    await ev("(() => { const i = document.querySelector('#klc-x .xsearch input'); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, isComposing: false, bubbles: true, cancelable: true })); })()"); await settle(600);
    const afterEnter = await ev(SEARCH_JS);
    await settle(900);
    const closed = await ev(SEARCH_JS);   // the minimap is back once the sheet is gone (after its grace)
    M.row12desktop = { empty, typed, afterIme, afterEnter, closed, clearButtonPixels: { control: clearControl, ours: clearOurs } };
    expect(empty.open).toBe(true); expect(empty.visibleOverlapPx).toBe(0); expect(empty.boxOverlapPx).toBe(0); expect(typed.visibleOverlapPx).toBe(0);
    expect(empty.input.fontSize).toBe("16px"); expect(empty.buttonsInRow).toBe(1); expect(empty.placeholder.fits).toBe(true);
    expect(clearControl).toBeGreaterThan(10); expect(clearOurs).toBe(0);   // (the control proves the method sees the native button; ours draws none)
    expect(afterIme.open).toBe(true);
    expect(afterEnter.open).toBe(false);
    expect(closed.miniVisible).toBe(true);
  });

  T("row 13 on a desktop: the story card keeps its place and follows the language; row 11: the top bar is reachable over every card", async () => {
    await reset();
    const id = await ev("window.__story.places[0].id");
    await ev(`window.__story.open(${JSON.stringify(id)})`); await settle(800);
    const story = await ev(STORY_JS);
    await shot(page, "row13-story-1440x900");
    const en = await ev("(() => { document.querySelector('#klc-ui [data-act=\"lang\"]').click(); return 1; })()"); void en;
    await page.waitFor("document.querySelector('#klc-story').lang === 'en'", { timeout: 8000 }).catch(() => {});
    const storyEn = await ev(STORY_JS);
    await ev("document.querySelector('#klc-ui [data-act=\"lang\"]').click()");
    await ev("window.__story.card.close()"); await settle(500);
    const ship = {};
    for (const [w, h] of [[1440, 900], [1024, 600]]) {
      await desk(page, w, h); await settle(500);
      for (const b of ["TRANSSHIP_LAS_PALMAS", "REEFER", "SHIMIZU_WEIGH", "CARD"]) {
        await ev(`window.__voyageShot('${b}')`); await settle(1500);
        ship[`${w}x${h}:${b}`] = await ev(SHIP_BAR_JS);
        if (w === 1440 && b === "CARD") await shot(page, "row11-ship-1440x900-CARD");
      }
    }
    await ev("window.__voyage.active && window.__voyage.exit()"); await settle(600);
    await desk(page, 1440, 900);
    M.row13desktop = { story, storyEn: { lang: storyEn.lang, h3: storyEn.h3 } };
    M.row11desktop = ship;
    expect(story.card.r).toBeLessThanOrEqual(story.vw); expect(story.boxSizing).toBe("border-box");
    expect(storyEn.lang).toBe("en");
    for (const [k, v] of Object.entries(ship)) {
      for (const a of ["facts", "lang_", "exit"]) { expect(v[a]?.ok).toBe(true); expect(v[a].lines).toBe(1); expect(v[a].h).toBeGreaterThanOrEqual(44); }
      if (v.inner) expect(v.inner.t).toBeGreaterThanOrEqual(v.top.b - 0.5);   // the card starts under the bar (nothing of it hides under the buttons)
      void k;
    }
  });
});
