// [hud:sync] The HUD syncs in place, in a real Chrome: a clicked node is the same element after its click, the transitions the stylesheet declares run, the HUD is not
// rebuilt (a render counts as a childList mutation of #klc-ui that removes its children), the places list has every stop (tour.stops.length, 53 at review), a keyboard
// activation keeps its focus while a mouse click blurs, a press that straddles a time change still lands, the tiny-planet note shows, the ☰ 地名ラベル toggle shows the
// real state on a phone, and a patched HUD equals a rebuilt one. Heavy (it builds the app and loads the town twice), so it only runs on request, through the gate:
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS KLC_E2E=1 KLC_E2E_PORT=9404 bun test <absolute path>/test/hud-sync.e2e.test.js
// (an absolute path: with a relative one, in a worktree whose node_modules / raw/ are symlinks, Chrome closed its stderr at once and the run died with "chrome exited early"; launch() on a tree with 036aae9 copes with a closed stderr, a relative path was not re-tried with it.)
// The numbers it measures are printed as one `HUD-METRICS {json}` line, so the same file run against an older checkout gives the "before" column.
// HUD_SHOTS=<dir> also saves a few screenshots there.
import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { buildAndServe, launch, phonePage, enterTown, center, sleep } from "../tools/anime/pad-lib.mjs";

const RUN = process.env.KLC_E2E === "1" && process.env.KLC_GATE === "1";
const PORT = Number(process.env.KLC_E2E_PORT || 9404);
const SHOTS = process.env.HUD_SHOTS || "";
const d = RUN ? describe : describe.skip;
const T = (name, fn) => test(name, fn, 240000);
const PORTRAIT = { width: 390, height: 844, dpr: 3, insets: { top: 47, bottom: 34, left: 0, right: 0 } };
const M = { build: "hud-sync" };   // every number the run measured
const metric = (k, v) => { M[k] = v; return v; };
/** A page that stops answering must not hold the machine's one Chrome lock: every in-page call has a deadline (the harness's page.eval has none), and a call that misses it
 *  ends the run at once (process exit kills the browser and releases the lock); the whole file has a watchdog besides. */
const guard = (page, ms = 90000) => {
  const ev = page.eval;
  page.eval = (expr) => new Promise((res, rej) => {
    const t = setTimeout(() => { console.error("HUD-METRICS " + JSON.stringify(M)); console.error(`hud-sync e2e: the page did not answer within ${ms} ms, ending the run so the Chrome lock is released: ${String(expr).slice(0, 160)}`); process.exit(1); }, ms);
    ev(expr).then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
  });
  return page;
};
const WATCHDOG_MS = 10 * 60 * 1000;   // (the file takes about 3 minutes; a stuck one is ended here, which also kills its browser and releases the lock)

/** Counts renders: a render replaces every child of #klc-ui at once (a childList record that removes more than five nodes). */
const COUNT_RENDERS = `(() => { window.__rmo?.disconnect(); window.__renders = 0; window.__rmo = new MutationObserver((recs) => { for (const r of recs) if (r.removedNodes.length > 5) window.__renders++; }); window.__rmo.observe(document.getElementById('klc-ui'), { childList: true }); return true; })()`;
/** Click each target in turn, in the page: identity, renders, the cost of the click and of the style / layout flush behind it, and the transitions that start. */
const BULK = (actions) => `(async () => {
  const out = [], $ = (s) => document.querySelector(s), nm = (a) => (a.effect?.target?.className?.baseVal ?? a.effect?.target?.className ?? a.effect?.target?.tagName ?? '?');
  const anims = () => document.getAnimations().filter((a) => a.transitionProperty && a.effect?.target?.closest?.('#klc-ui')).map((a) => a.transitionProperty + '@' + String(nm(a)).split(' ')[0]);   // (only the HUD's own nodes: the page has other transitions running)
  for (const a of ${JSON.stringify(actions)}) {
    const el = $(a.sel); if (!el) { out.push({ id: a.id, missing: true }); continue; }
    const r0 = window.__renders, mo = new MutationObserver(() => {}); mo.observe(document.getElementById('klc-ui'), { subtree: true, childList: true, attributes: true, characterData: true });
    const t0 = performance.now(); el.click(); const t1 = performance.now(); void document.body.offsetHeight; const t2 = performance.now();
    const an = anims();
    const recs = mo.takeRecords(); mo.disconnect();
    await new Promise((r) => setTimeout(r, a.wait ?? 80));
    out.push({ id: a.id, same: $(a.sel) === el && el.isConnected, renders: window.__renders - r0, clickMs: +(t1 - t0).toFixed(2), flushMs: +(t2 - t1).toFixed(2), anims: [...new Set(an)], animCount: an.length,
      mutations: recs.length, nodesAdded: recs.reduce((n, r) => n + r.addedNodes.length, 0), nodesRemoved: recs.reduce((n, r) => n + r.removedNodes.length, 0) });
  }
  return out;
})()`;
/** The HUD as text with what changes by itself (the note, and data-still, which render() sets for two frames) cleared; the same string for a patched HUD and a rebuilt one. */
const NORM = `(() => { const c = document.getElementById('klc-ui').cloneNode(true); c.removeAttribute('data-still'); const n = c.querySelector('[data-f=note]'); n.textContent = ''; n.className = n.className.replace(/\\bshow\\b/, '').trim(); for (const e of c.querySelectorAll('[style]')) e.removeAttribute('style');
  for (const e of [c, ...c.querySelectorAll('*')]) { const as = [...e.attributes].map((a) => [a.name, a.value]).sort((x, y) => (x[0] < y[0] ? -1 : 1)); for (const [k] of as) e.removeAttribute(k); for (const [k, v] of as) e.setAttribute(k, v); }   // attribute order is not state: a node patched later has its attributes in another order than a rebuilt one
  return c.outerHTML.replace(/\\s+/g, ' '); })()`;
const diffAt = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return `patched …${a.slice(Math.max(0, i - 100), i + 160)}\n  rebuilt …${b.slice(Math.max(0, i - 100), i + 160)}`; };

d("the HUD syncs in place (real Chrome)", () => {
  let browser, srv, watchdog;
  beforeAll(async () => {
    watchdog = setTimeout(() => { console.error("HUD-METRICS " + JSON.stringify(M)); console.error(`hud-sync e2e: still running after ${WATCHDOG_MS / 60000} minutes: killing the browser so the Chrome lock is released`); process.exit(1); }, WATCHDOG_MS);
    ({ srv } = await buildAndServe(PORT));
    browser = await launch({ quiet: true });
  }, 330000);
  afterAll(async () => { clearTimeout(watchdog); console.log("HUD-METRICS " + JSON.stringify(M)); await browser?.close(); srv?.stop(); }, 60000);

  d("desktop 1440x900, mouse and keyboard", () => {
    let page;
    const mouse = (type, x, y) => page.S("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });
    const hover = async (sel) => { const c = await center(page, sel); expect(c && c.w > 1).toBeTruthy(); await page.S("Input.dispatchMouseEvent", { type: "mouseMoved", x: c.x, y: c.y }); return c; };
    const clickReal = async (sel) => { const c = await hover(sel); await mouse("mousePressed", c.x, c.y); await sleep(50); await mouse("mouseReleased", c.x, c.y); await sleep(120); return c; };
    const keyEnter = async () => { await page.S("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r", unmodifiedText: "\r" }); await page.S("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }); await sleep(120); };
    beforeAll(async () => {
      page = guard(await browser.page({ width: 1440, height: 900, dpr: 1 }));
      await page.goto(`${srv.url}index.html?q=low`);
      await page.waitFor("document.body.classList.contains('loaded')", { timeout: 280000 });
      await page.eval("document.getElementById('go').click()");
      await page.waitFor("document.body.classList.contains('playing')", { timeout: 20000 });
      await page.waitFor("window.__life && window.__life.hud && window.__life.tour", { timeout: 20000 });
      await sleep(2500);
      await page.eval(COUNT_RENDERS);
    }, 330000);
    afterAll(async () => { await page?.goto("about:blank").catch(() => {}); }, 30000);

    T("the places list has every stop before any click (explore adds its places after the HUD mounted)", async () => {
      const r = await page.eval(`({ dom: document.querySelectorAll('#klc-places [data-act="stop"]').length, tour: window.__life.tour.stops.length, lis: document.querySelectorAll('#klc-places li').length })`);
      metric("desktop.stops", r);
      expect(r.tour).toBeGreaterThan(40);
      expect(r.dom).toBe(r.tour);
      expect(r.lis).toBe(r.tour);
    });

    T("every button but the language one: the clicked element survives, nothing is rebuilt, and the transitions it declares run", async () => {
      const first = [{ id: "arrivals-open", sel: '#klc-ui [data-act="arrivals"]' }, { id: "arrivals-close", sel: '#klc-ui [data-act="arrivals"]' }, { id: "places-open", sel: '#klc-ui [data-act="places"]' }];
      const rest = [
        { id: "stop", sel: '#klc-ui [data-act="stop"][data-id="market"]' }, { id: "places-open-2", sel: '#klc-ui [data-act="places"]' }, { id: "places-close", sel: '#klc-ui [data-act="places"]' },
        { id: "preset-yoru", sel: '#klc-ui [data-act="preset"][data-id="yoru"]' }, { id: "preset-yugata", sel: '#klc-ui [data-act="preset"][data-id="yugata"]' },
        { id: "auto-on", sel: '#klc-ui [data-act="auto"]' }, { id: "auto-off", sel: '#klc-ui [data-act="auto"]' }, { id: "view-walk", sel: '#klc-ui [data-act="view"]' }, { id: "view-drone", sel: '#klc-ui [data-act="view"]' },
        { id: "season-1", sel: '#klc-ui [data-act="season"]' }, { id: "season-2", sel: '#klc-ui [data-act="season"]' }, { id: "season-3", sel: '#klc-ui [data-act="season"]' }, { id: "season-4", sel: '#klc-ui [data-act="season"]' },
        { id: "sound-off", sel: '#klc-ui [data-act="sound"]' }, { id: "sound-on", sel: '#klc-ui [data-act="sound"]' },
      ];
      const out = [...(await page.eval(BULK(first.map((a) => ({ ...a, wait: 330 }))))), ...(await page.eval(BULK(rest.map((a) => ({ ...a, wait: a.id.startsWith("preset") ? 330 : 120 })))))];
      metric("desktop.clicks", out);
      for (const r of out) expect([r.id, r.missing ?? false, r.same, r.renders]).toEqual([r.id, false, true, 0]);
      const by = Object.fromEntries(out.map((r) => [r.id, r]));
      expect(by["arrivals-open"].anims.some((a) => a.startsWith("transform"))).toBe(true);   // the caret turns (style.js .caret: transform .25s)
      expect(by["places-open"].anims.some((a) => a.startsWith("transform"))).toBe(true);     // .places .ph .caret
      expect(by["preset-yoru"].anims.some((a) => a.startsWith("background"))).toBe(true);    // .seg button: background .2s
      const clicks = out.map((r) => r.clickMs + r.flushMs);
      metric("desktop.clickCostMs", { first: clicks[0], placesFirst: clicks[2], median: [...clicks].sort((a, b) => a - b)[Math.floor(clicks.length / 2)], max: Math.max(...clicks) });
      metric("desktop.domWritesPerClick", { mutationsMedian: [...out.map((r) => r.mutations)].sort((a, b) => a - b)[Math.floor(out.length / 2)], mutationsMax: Math.max(...out.map((r) => r.mutations)), nodesAddedTotal: out.reduce((n, r) => n + r.nodesAdded, 0), nodesRemovedTotal: out.reduce((n, r) => n + r.nodesRemoved, 0), clicks: out.length });
    });

    T("opening and closing the two panels eight times: what the layout of the list that appears costs (a measurement, no threshold)", async () => {
      const r = await page.eval(`(async () => {
        const $ = (s) => document.querySelector(s), out = { places: [], placesClose: [], arrivals: [], arrivalsClose: [] };
        const one = async (sel) => { const t0 = performance.now(); $(sel).click(); void document.body.offsetHeight; const dt = performance.now() - t0; await new Promise((r) => setTimeout(r, 300)); return dt; };
        for (let i = 0; i < 8; i++) {
          out.places.push(await one('#klc-ui [data-act="places"]')); out.placesClose.push(await one('#klc-ui [data-act="places"]'));
          out.arrivals.push(await one('#klc-ui [data-act="arrivals"]')); out.arrivalsClose.push(await one('#klc-ui [data-act="arrivals"]'));
        }
        const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)], r1 = (x) => +x.toFixed(1);
        return { placesOpenMedian: r1(med(out.places)), placesOpenMax: r1(Math.max(...out.places)), placesCloseMedian: r1(med(out.placesClose)), arrivalsOpenMedian: r1(med(out.arrivals)), arrivalsOpenMax: r1(Math.max(...out.arrivals)), arrivalsCloseMedian: r1(med(out.arrivalsClose)) };
      })()`);
      metric("desktop.panelToggleMs", r);
      expect(r.placesOpenMedian).toBeGreaterThan(0);   // (ran; the numbers are for the notes)
    });

    T("a mouse click blurs the button, a keyboard activation keeps the focus on the same element", async () => {
      const chip = `document.querySelector('#klc-ui [data-act="arrivals"]')`;   // (the node in the page now: an older checkout replaces it on every click)
      await page.eval(`${chip}.blur(); window.__chip = ${chip}; 0`);
      await clickReal('#klc-ui [data-act="arrivals"]');   // open (mouse)
      const afterMouse = await page.eval(`({ tag: document.activeElement.tagName, open: ${chip}.getAttribute('aria-expanded'), same: ${chip} === window.__chip })`);
      await page.eval(`${chip}.focus(); window.__chip = ${chip}; 0`);
      await keyEnter();   // close (keyboard)
      const afterKey = await page.eval(`({ focused: document.activeElement === ${chip}, open: ${chip}.getAttribute('aria-expanded'), same: ${chip} === window.__chip, focusVisible: ${chip}.matches(':focus-visible') })`);
      metric("desktop.focus", { afterMouse, afterKey });
      expect(afterMouse).toEqual({ tag: "BODY", open: "true", same: true });
      expect(afterKey).toMatchObject({ focused: true, open: "false", same: true });
    });

    T("a press that straddles a time change still lands (the old HUD was rebuilt between press and release)", async () => {
      await page.eval(`window.__lifeSet('hiru'); 0`); await sleep(400);
      const c = await hover('#klc-ui [data-act="preset"][data-id="yuyake"]');
      await page.eval(`window.__target = document.querySelector('#klc-ui [data-act="preset"][data-id="yuyake"]'); 0`);
      await mouse("mousePressed", c.x, c.y);
      await page.eval(`window.__lifeSet('yoru'); 0`);   // the previous sweep ends under the finger (T.onChange 'instant')
      await sleep(80);
      await mouse("mouseReleased", c.x, c.y); await sleep(200);
      const r = await page.eval(`({ preset: window.__life.time.preset, targetConnected: window.__target.isConnected, same: document.querySelector('#klc-ui [data-act="preset"][data-id="yuyake"]') === window.__target })`);
      metric("desktop.straddle", r);
      expect(r).toEqual({ preset: "yuyake", targetConnected: true, same: true });
      await page.eval(`window.__lifeSet('yugata'); 0`);
    });

    T("a patched HUD equals a rebuilt one, after a run of clicks and keys, in the real DOM", async () => {
      await sleep(3500);   // (the last time-of-day sweep has ended: the clock text is final)
      const steps = [`document.querySelector('#klc-ui [data-act="places"]').click()`, `document.querySelector('#klc-ui [data-act="stop"][data-id="hero"]').click()`, `document.querySelector('#klc-ui [data-act="arrivals"]').click()`,
        `document.querySelector('#klc-ui [data-act="view"]').click()`, `document.querySelector('#klc-ui [data-act="season"]').click()`, `document.querySelector('#klc-ui [data-act="season"]').click()`, `document.querySelector('#klc-ui [data-act="season"]').click()`,
        `document.querySelector('#klc-ui [data-act="season"]').click()`, `document.querySelector('#klc-ui [data-act="view"]').click()`, `document.querySelector('#klc-ui [data-act="arrivals"]').click()`];
      const bad = [];
      for (const s of steps) {
        const r = await page.eval(`(() => { ${s}; const a = ${NORM}; window.__life.hud.render(); const b = ${NORM}; return a === b ? { eq: true } : { eq: false, a, b }; })()`);
        if (!r.eq) bad.push(`${s}\n${diffAt(r.a, r.b)}`);
      }
      metric("desktop.parityMismatches", bad.length);
      expect(bad).toEqual([]);
    });

    T("the tiny-planet hint shows (it was written and then wiped by the rebuild)", async () => {
      await page.eval(COUNT_RENDERS);
      await page.eval(`window.__note = document.querySelector('#klc-ui [data-f="note"]'); 0`);
      await clickReal('#klc-ui [data-act="planet"]');
      await sleep(700);
      const r = await page.eval(`(() => { const n = document.querySelector('#klc-ui [data-f="note"]'); return { text: n.textContent, show: n.classList.contains('show'), opacity: +getComputedStyle(n).opacity, same: n === window.__note, planet: !!window.__ctx.planet.active, pressed: document.querySelector('#klc-ui [data-act="planet"]').getAttribute('aria-pressed') }; })()`);
      metric("desktop.planetNote", r);
      if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.shot(join(SHOTS, "desktop-planet-note.png")); }
      expect(r.planet).toBe(true); expect(r.pressed).toBe("true");
      expect(r.text).toContain("小さな惑星"); expect(r.show).toBe(true); expect(r.opacity).toBeGreaterThan(0.5); expect(r.same).toBe(true);
      await page.eval(`window.__ctx.planet.exit(); window.__life.hud.syncState(); 0`); await sleep(300);
      expect(await page.eval(`document.querySelector('#klc-ui [data-act="planet"]').getAttribute('aria-pressed')`)).toBe("false");
    });

    T("the language button is the one click that rebuilds, once, and the stops read in English", async () => {
      await page.eval(COUNT_RENDERS);
      await page.eval(`(() => { document.querySelector('#klc-ui [data-act="lang"]').click(); })()`); await sleep(300);
      const en = await page.eval(`({ renders: window.__renders, lang: document.getElementById('klc-ui').lang, label: document.querySelector('#klc-ui [data-act="auto"] span').textContent, stops: document.querySelectorAll('#klc-places [data-act="stop"]').length, tour: window.__life.tour.stops.length })`);
      await page.eval(`document.querySelector('#klc-ui [data-act="lang"]').click()`); await sleep(300);
      const ja = await page.eval(`({ renders: window.__renders, lang: document.getElementById('klc-ui').lang })`);
      metric("desktop.language", { en, ja });
      expect(en.renders).toBe(1); expect(en.lang).toBe("en"); expect(en.label).toMatch(/tour/i); expect(en.stops).toBe(en.tour);
      expect(ja).toEqual({ renders: 2, lang: "ja" });
    });

    T("what a render costs: hud.render() is rare now, and the first click that opens a panel is cheap", async () => {
      const r = await page.eval(`(() => { const hud = window.__life.hud, ts = []; for (let i = 0; i < 15; i++) { const t0 = performance.now(); hud.render(); ts.push(performance.now() - t0); } ts.sort((a, b) => a - b);
        const sync = []; if (hud.syncState) for (let i = 0; i < 15; i++) { const t0 = performance.now(); hud.syncState(); sync.push(performance.now() - t0); } sync.sort((a, b) => a - b);   // (an older checkout has no syncState: only the render numbers)
        return { renderMedian: +ts[7].toFixed(2), renderMax: +ts[14].toFixed(2), syncMedian: sync.length ? +sync[7].toFixed(3) : null, syncMax: sync.length ? +sync[14].toFixed(3) : null, nodes: document.getElementById('klc-ui').querySelectorAll('*').length }; })()`);
      metric("desktop.cost", r);
      expect(r.syncMedian).not.toBeNull();
      expect(r.syncMedian).toBeLessThan(r.renderMedian);
      expect(r.syncMedian).toBeLessThan(2);
      if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.shot(join(SHOTS, "desktop-hud.png")); }
    });

    T("no page errors", async () => { expect(page.errors().filter((e) => !/api\/live/.test(e.text))).toEqual([]); });
  });

  d("phone 390x844, real touches", () => {
    let page, f;
    const tap = async (sel) => { const c = await center(page, sel); expect(c && c.w > 1).toBeTruthy(); await f.tap(c.x, c.y); await sleep(450); return c; };
    beforeAll(async () => {
      page = guard(await phonePage(browser, PORTRAIT));
      f = await enterTown(page, `${srv.url}index.html?labels=1`);
      await page.waitFor("window.__life && window.__life.hud && window.__explore && window.__explore.ambientLabels !== undefined", { timeout: 60000 });
      await sleep(1500);
      await page.eval("window.__camSpec('walk')");
      await page.waitFor("window.__pad && !window.__pad.hidden", { timeout: 20000 });
      await page.eval("window.__pad.dismissCoach()"); await sleep(600);
      await page.eval(COUNT_RENDERS);
    }, 330000);
    afterAll(async () => { await f?.release?.().catch(() => {}); }, 30000);

    T("the places sheet has every stop before any tap", async () => {
      const r = await page.eval(`({ dom: document.querySelectorAll('#klc-places [data-act="stop"]').length, tour: window.__life.tour.stops.length })`);
      metric("phone.stops", r);
      expect(r.dom).toBe(r.tour);
    });

    T("?labels=1: the ☰ 地名ラベル toggle shows ON when the menu opens, and tapping it turns the labels off and on, on the same node", async () => {
      const state = `({ pressed: document.querySelector('#klc-ui [data-act="labels"]').getAttribute('aria-pressed'), ambient: window.__explore.ambientLabels, same: document.querySelector('#klc-ui [data-act="labels"]') === window.__keepLabels })`;   // (the node in the page now: an older checkout replaces it)
      await page.eval(`window.__keepLabels = document.querySelector('#klc-ui [data-act="labels"]'); 0`);
      await tap("#klc-ui .mbtn");
      const a = await page.eval(`({ menu: document.getElementById('klc-ui').dataset.menu, ...${state} })`);
      if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.shot(join(SHOTS, "phone-menu-labels.png")); }
      await tap('#klc-ui .tools [data-act="labels"]');
      const b = await page.eval(state);
      await tap('#klc-ui .tools [data-act="labels"]');
      const c = await page.eval(state);
      metric("phone.labels", { open: a, off: b, on: c });
      expect(a).toEqual({ menu: "1", pressed: "true", ambient: true, same: true });
      expect(b).toEqual({ pressed: "false", ambient: false, same: true });
      expect(c).toEqual({ pressed: "true", ambient: true, same: true });
      await tap("#klc-ui .mbtn");   // close the menu again
      expect(await page.eval("document.getElementById('klc-ui').dataset.menu")).toBe("0");
    });

    T("the time sheet: tapping an hour keeps its button, the sheet and its press state; the places strip keeps its scroll position through a tap on 自動で巡る", async () => {
      await tap('#klc-ui .pbar button[data-sheet="time"]');
      const idle = await page.eval(`[...document.querySelectorAll('#klc-ui .dock [data-act="preset"]')].filter((b) => b.getAttribute('aria-pressed') !== 'true').map((b) => b.dataset.id)`);
      await page.eval(`window.__hour = document.querySelector('#klc-ui .dock [data-act="preset"][data-id="${idle[0]}"]'); 0`);
      await tap(`#klc-ui .dock [data-act="preset"][data-id="${idle[0]}"]`);
      const t = await page.eval(`({ same: document.querySelector('#klc-ui .dock [data-act="preset"][data-id="${idle[0]}"]') === window.__hour, pressed: document.querySelector('#klc-ui .dock [data-act="preset"][data-id="${idle[0]}"]').getAttribute('aria-pressed'), sheet: document.getElementById('klc-ui').dataset.sheet, renders: window.__renders })`);
      await tap('#klc-ui .pbar button[data-sheet="time"]');
      await tap('#klc-ui .pbar button[data-sheet="places"]');
      await page.eval(`(() => { const ul = document.querySelector('#klc-ui .places ul'); ul.scrollLeft = 320; window.__ul = ul; window.__auto = document.querySelector('#klc-ui .places [data-act="auto"]'); })()`); await sleep(300);
      const before = await page.eval("window.__ul.scrollLeft");
      await tap('#klc-ui .places [data-act="auto"]');
      const s = await page.eval(`({ sameUl: document.querySelector('#klc-ui .places ul') === window.__ul, scrollLeft: document.querySelector('#klc-ui .places ul').scrollLeft, sameAuto: document.querySelector('#klc-ui .places [data-act="auto"]') === window.__auto, pressed: document.querySelector('#klc-ui .places [data-act="auto"]').getAttribute('aria-pressed'), playing: window.__life.tour.playing, renders: window.__renders })`);
      await page.eval(`window.__life.tour.stop(); 0`); await sleep(300);
      metric("phone.sheets", { time: t, strip: { before, ...s } });
      expect(t).toEqual({ same: true, pressed: "true", sheet: "time", renders: 0 });
      expect(before).toBeGreaterThan(100);
      expect(s).toMatchObject({ sameUl: true, sameAuto: true, pressed: "true", playing: true, renders: 0 });
      expect(s.scrollLeft).toBe(before);
      await tap('#klc-ui .pbar button[data-sheet="places"]');
    });

    T("the ☰ menu: language is the one rebuild; season, sound and 地名ラベル keep their nodes and the menu stays open", async () => {
      await page.eval(COUNT_RENDERS);
      await tap("#klc-ui .mbtn");
      await page.eval(`window.__menuNodes = ['season', 'sound', 'planet', 'labels', 'credits', 'hide', 'lang'].map((a) => document.querySelector('#klc-ui .tools [data-act="' + a + '"]')); 0`);
      const lbl0 = await page.eval(`document.querySelector('#klc-ui .tools [data-act="season"] .lbl').textContent`);
      await tap('#klc-ui .tools [data-act="season"]'); await tap('#klc-ui .tools [data-act="sound"]'); await tap('#klc-ui .tools [data-act="sound"]');
      const r = await page.eval(`({ same: window.__menuNodes.slice(0, 6).map((n, i) => document.querySelector('#klc-ui .tools [data-act="' + ['season', 'sound', 'planet', 'labels', 'credits', 'hide'][i] + '"]') === n), renders: window.__renders, menu: document.getElementById('klc-ui').dataset.menu, season: document.querySelector('#klc-ui .tools [data-act="season"] .lbl').textContent })`);
      expect(r.same).toEqual([true, true, true, true, true, true]); expect(r.renders).toBe(0); expect(r.menu).toBe("1"); expect(r.season).not.toBe(lbl0);
      await tap('#klc-ui .tools [data-act="lang"]');
      const en = await page.eval(`({ renders: window.__renders, lang: document.getElementById('klc-ui').lang, menu: document.getElementById('klc-ui').dataset.menu, labels: document.querySelector('#klc-ui .tools [data-act="labels"]').getAttribute('aria-pressed') })`);
      await tap('#klc-ui .tools [data-act="lang"]');
      metric("phone.menu", { renders: r.renders, en });
      expect(en).toEqual({ renders: 1, lang: "en", menu: "1", labels: "true" });
      await tap('#klc-ui .tools [data-act="season"]'); await tap('#klc-ui .tools [data-act="season"]'); await tap('#klc-ui .tools [data-act="season"]');   // a full loop of seasons
      await tap("#klc-ui .mbtn");
    });

    T("no page errors, no horizontal scroll", async () => {
      expect(page.errors().filter((e) => !/api\/live/.test(e.text))).toEqual([]);
      expect(await page.eval("document.documentElement.scrollWidth")).toBeLessThanOrEqual(390);
    });
  });
});
