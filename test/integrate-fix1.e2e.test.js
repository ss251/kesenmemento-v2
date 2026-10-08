// [integrate:fix1] The first phone review's blockers, with real touches (headless Chrome, 390x844 @3x and 844x390, CDP touch events):
//   B1 4x at the helm keeps the autopilot   B2 the voyage cards scroll by touch   B3 the cards sit under the top bar, 次へ in view
//   B4 board from the landscape places list B5 自動で巡る on portrait               B6 44 px targets, the credits ⓘ, minimap steps aside
//   B7 町へ戻る gives walking and the hour back   B8 全速 on the stick at the helm, the short boarding chip title
// Heavy (it builds the app and loads the town), so it only runs on request, through the gate:
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS KLC_E2E=1 KLC_E2E_PORT=8993 [KLC_SHOT_DIR=docs/shots/integrate] bun test test/integrate-fix1.e2e.test.js
import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { buildAndServe, launch, phonePage, setViewport, enterTown, center, layoutReport, sleep, ROOT } from "../tools/anime/pad-lib.mjs";

const RUN = process.env.KLC_E2E === "1" && process.env.KLC_GATE === "1";
const PORT = Number(process.env.KLC_E2E_PORT || 8993);
const SHOTS = process.env.KLC_SHOT_DIR ? resolve(ROOT, process.env.KLC_SHOT_DIR) : null;
const d = RUN ? describe : describe.skip;
const T = (name, fn) => test(name, fn, 300000);
const PORTRAIT = { width: 390, height: 844, dpr: 3, insets: { top: 47, bottom: 34, left: 0, right: 0 } };
const LANDSCAPE = { width: 844, height: 390, dpr: 3, insets: { top: 0, bottom: 21, left: 47, right: 47 } };

d("integrate fix 1: the phone review's blockers", () => {
  let browser, srv, page, f;
  const settle = (ms = 700) => sleep(ms);
  const ui = (expr) => page.eval(expr);
  const tap = async (sel) => { const c = await center(page, sel); expect(c).not.toBeNull(); expect(c.w).toBeGreaterThan(1); await f.tap(c.x, c.y); await settle(450); return c; };
  const shot = async (name) => { if (!SHOTS) return; const buf = await page.shot(); await sharp(buf).png({ palette: true, quality: 92, effort: 8, dither: 0.6 }).toFile(join(SHOTS, `fix1_${name}.png`)); };
  const sail = () => page.eval("(() => { const s = window.__sail.state; return { active: window.__sail.active, ap: s.autopilot, eng: s.eng, kn: s.kn, tc: s.tc, s: s.s, idle: s.idle }; })()");
  const autoPressed = () => page.eval("document.querySelector('#klc-pad .btn[data-id=\"auto\"]')?.getAttribute('aria-pressed')");
  const R = (sel) => page.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const b = e.getBoundingClientRect(); const s = getComputedStyle(e); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height, vis: s.display !== 'none' && s.visibility !== 'hidden' && b.width > 1 }; })()`);
  const swipeUp = async (x, y0, y1) => { await f.down1(7, x, y0); await f.drag(7, x, y1, 8); await f.up(7); await settle(250); };
  const backToTown = async () => { await page.eval("window.__voyage.active && window.__voyage.exit()"); await settle(600); };

  beforeAll(async () => {
    ({ srv } = await buildAndServe(PORT));
    browser = await launch({ quiet: true });
    page = await phonePage(browser, PORTRAIT);
    f = await enterTown(page, `${srv.url}index.html`);
    await settle(1200);
    await page.eval("window.__camSpec('walk')");
    await page.waitFor("window.__pad && !window.__pad.hidden", { timeout: 20000 });
    await page.eval("window.__pad.dismissCoach()");
    await settle(700);
  }, 330000);
  afterAll(async () => { await f?.release?.().catch(() => {}); await browser?.close(); srv?.stop(); }, 60000);

  T("B1: holding 4x with 自動操船 on keeps the autopilot (portrait and landscape, the pad button and Shift)", async () => {
    for (const vp of [PORTRAIT, LANDSCAPE]) {
      await setViewport(page, vp); await settle(900);
      await page.eval("window.__voyageAt(130)"); await settle(2500);   // (before s = 260: the autopilot's own x4 starts there, and would hide the hold)
      expect((await sail()).ap).toBe(true); expect((await sail()).tc).toBeLessThan(1.2);
      const x4 = await center(page, '#klc-pad .btn[data-id="x4"]');
      await f.down1(3, x4.x, x4.y);
      let tcMax = 0;
      for (let i = 0; i < 4; i++) {
        await settle(2000);
        const s = await sail();
        expect(s.ap).toBe(true); expect(await autoPressed()).toBe("true");
        expect(s.eng).toBeGreaterThan(0.3);   // the autopilot's order, not the inherited 0.25
        tcMax = Math.max(tcMax, s.tc);
      }
      expect(tcMax).toBeGreaterThan(1.5);
      await f.up(3);
      await page.waitFor("window.__sail.state.tc < 1.3", { timeout: 30000 });
      expect(await sail()).toMatchObject({ ap: true });
      expect(await autoPressed()).toBe("true");
    }
    // the keyboard: Shift is 4x, not a helm input
    await page.eval("window.__voyageAt(130)"); await settle(1500);
    await page.eval("window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft', key: 'Shift' }))"); await settle(3000);
    expect(await sail()).toMatchObject({ ap: true });
    expect((await sail()).tc).toBeGreaterThan(1.3);
    await page.eval("window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft', key: 'Shift' }))");
    // and the stick still takes the helm (4x or not)
    await setViewport(page, PORTRAIT); await settle(900);
    await page.eval("window.__voyageAt(130)"); await settle(1500);
    await f.down1(1, 90, 640); await f.drag(1, 120, 570, 6); await settle(1200);
    expect((await sail()).ap).toBe(false);
    // the stick's label at full ahead says 全速 (not 走る) at the helm
    await f.drag(1, 120, 480, 6); await settle(300);
    expect(await ui("document.querySelector('#klc-pad .stick .tag').textContent")).toBe("全速");
    await f.up(1);
    await backToTown();
  });

  T("B2 + B3: every card sits under the top bar, 次へ is in view, the card scrolls by touch, and the tail of the voyage finishes (portrait and landscape)", async () => {
    for (const [name, vp] of [["portrait", PORTRAIT], ["landscape", LANDSCAPE]]) {
      await setViewport(page, vp); await settle(900);
      for (const st of ["TRANSSHIP_LAS_PALMAS", "REEFER", "SHIMIZU_WEIGH", "CARD"]) {
        await page.eval(`window.__voyageShot('${st}')`); await settle(1800);
        const g = await page.eval(`(() => { const i = document.querySelector('#klc-ship .card .inner'), top = document.querySelector('#klc-ship .top'), row = i.querySelector(':scope > .row:last-child'); const a = i.getBoundingClientRect(), t = top.getBoundingClientRect(), r = row.getBoundingClientRect(); const btn = [...row.querySelectorAll('button')].map((b) => { const q = b.getBoundingClientRect(); return { l: q.left, t: q.top, b: q.bottom, r: q.right, a: b.dataset.a }; }); return { innerTop: a.top, innerBottom: a.bottom, barBottom: t.bottom, rowTop: r.top, rowBottom: r.bottom, btn, sh: i.scrollHeight, ch: i.clientHeight, vh: innerHeight }; })()`);
        expect(g.innerTop).toBeGreaterThanOrEqual(g.barBottom - 0.5);       // (it was 23 / 25 px under the bar)
        expect(g.rowBottom).toBeLessThanOrEqual(g.innerBottom + 0.5);       // the footer row is inside the card ...
        for (const b of g.btn) { expect(b.t).toBeGreaterThanOrEqual(g.innerTop - 0.5); expect(b.b).toBeLessThanOrEqual(g.innerBottom + 0.5); expect(b.b).toBeLessThanOrEqual(g.vh); }   // ... and so are its buttons, scrolled or not
        // a swipe on the card scrolls it (the pad's touchmove guard lets it through) when there is anything to scroll
        if (g.sh > g.ch + 4) {
          const cx = await R("#klc-ship .card .inner"); const x = (cx.l + cx.r) / 2, y0 = cx.t + cx.h * 0.55, y1 = cx.t + cx.h * 0.15;
          await swipeUp(x, y0, y1);
          expect(await ui("document.querySelector('#klc-ship .card .inner').scrollTop")).toBeGreaterThan(20);
        }
        if (st === "SHIMIZU_WEIGH" || st === "CARD") await shot(`${st === "CARD" ? "final_card" : "weigh"}_${name}`);
      }
    }
    for (const [name, vp] of [["portrait", PORTRAIT], ["landscape", LANDSCAPE]]) {
      await setViewport(page, vp); await settle(900);
      await page.eval("window.__voyageShot('TRANSSHIP_LAS_PALMAS')"); await settle(1800);
      for (const [want, sel] of [["REEFER", '#klc-ship .card [data-a="NEXT"]'], ["SHIMIZU_WEIGH", '#klc-ship .card [data-a="NEXT"]'], ["HOMECOMING", '#klc-ship .card [data-a="NEXT"]'], ["CARD", '#klc-ship [data-a="NEXT"]']]) {
        await tap(sel); await page.waitFor(`window.__voyage.state === '${want}'`, { timeout: 15000 }); await settle(900);
      }
      expect(await ui("window.__voyage.active")).toBe(true);
      await shot(`card_${name}`);
      await tap('#klc-ship .card .inner [data-a="exit"]');   // 町へ戻る, by touch, no scrolling
      expect(await ui("window.__voyage.active")).toBe(false);
      await settle(900);
    }
  });

  T("B4: landscape, the places list shows the boarding row in full and a tap boards", async () => {
    await setViewport(page, LANDSCAPE); await settle(1200);
    await page.eval("window.__camSpec('walk')"); await settle(800);
    await tap('#klc-x .xbar button[data-act="search"]');
    const g = await page.eval(`(() => { const ol = document.querySelector('#klc-x .xsearch ol'), b = [...ol.querySelectorAll('button')].find((x) => x.textContent.includes('昭福丸')); if (!b) return null; const o = ol.getBoundingClientRect(), r = b.getBoundingClientRect(); return { olTop: o.top, olBottom: o.bottom, rowTop: r.top, rowBottom: r.bottom, olH: o.height, focus: document.activeElement?.tagName }; })()`);
    expect(g).not.toBeNull();
    expect(g.rowTop).toBeGreaterThanOrEqual(g.olTop - 0.5); expect(g.rowBottom).toBeLessThanOrEqual(g.olBottom + 0.5);   // the row is not cut off (193 vs 202 before)
    expect(g.olH).toBeGreaterThan(120);
    expect(g.focus).not.toBe("INPUT");   // no keyboard until the field is tapped
    await shot("places_landscape");
    const row = await page.eval(`(() => { const b = [...document.querySelectorAll('#klc-x .xsearch ol button')].find((x) => x.textContent.includes('昭福丸')); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await f.tap(row.x, row.y); await settle(1500);
    expect(await ui("({ voyage: window.__voyage.active, search: document.querySelector('#klc-x .xsearch').hidden })")).toEqual({ voyage: true, search: true });
    await backToTown();
    await setViewport(page, PORTRAIT); await settle(900);
  });

  T("B5: portrait, 自動で巡る is in the places sheet (44 px) and runs the tour; the strip fades the edge with more stops", async () => {
    await page.eval("window.__camSpec('walk')"); await settle(600);
    await tap('#klc-ui .pbar button[data-sheet="places"]');
    const a = await R("#klc-ui .places .auto");
    expect(a.vis).toBe(true); expect(a.h).toBeGreaterThanOrEqual(44);
    expect(await ui("document.querySelector('#klc-ui .places').dataset.fade")).toContain("r");
    await shot("places_sheet_portrait");
    // a swipe along the strip scrolls it and the left edge fades in
    const u = await R("#klc-ui .places ul");
    await f.down1(5, u.r - 30, u.t + u.h / 2); await f.drag(5, u.l + 20, u.t + u.h / 2, 8); await f.up(5); await settle(500);
    expect(await ui("document.querySelector('#klc-ui .places ul').scrollLeft")).toBeGreaterThan(20);
    expect(await ui("document.querySelector('#klc-ui .places').dataset.fade")).toContain("l");
    await tap("#klc-ui .places .auto");
    expect(await ui("window.__life.tour.playing")).toBe(true);
    if (!(await R("#klc-ui .places .auto")).vis) await tap('#klc-ui .pbar button[data-sheet="places"]');
    await tap("#klc-ui .places .auto");
    expect(await ui("window.__life.tour.playing")).toBe(false);
    if ((await R("#klc-ui .places .auto")).vis) await tap('#klc-ui .pbar button[data-sheet="places"]');
    await page.eval("window.__camSpec('walk')"); await settle(600);
  });

  T("B6: 44 px targets, the ⓘ credits sheet, and the minimap steps aside for the menu and the arrivals", async () => {
    // the licence link is no longer a 40 x 11 px target on the credit line; the ☰ menu has the ⓘ item
    expect(await ui("[...document.querySelectorAll('#klc-ui .attr a')].every((a) => a.getClientRects().length === 0 || a.getBoundingClientRect().height >= 44)")).toBe(true);
    await tap("#klc-ui .mbtn");
    expect(await ui("getComputedStyle(document.querySelector('#klc-x .mini')).display")).toBe("none");   // the menu no longer lets the map peek behind it
    await shot("menu_portrait");
    const cb = await R('#klc-ui .tools [data-act="credits"]');
    expect(cb.vis).toBe(true); expect(cb.h).toBeGreaterThanOrEqual(44); expect(cb.w).toBeGreaterThanOrEqual(44);
    await tap('#klc-ui .tools [data-act="credits"]');
    const cs = await ui(`(() => { const s = document.querySelector('#klc-ui .credits'), q = (x) => { const r = s.querySelector(x).getBoundingClientRect(); return { w: r.width, h: r.height }; }; return { shown: !s.hidden && getComputedStyle(s).display !== 'none', cx: q('.cx'), link: q('.clink'), text: s.textContent, pad: window.__pad.hidden }; })()`);
    expect(cs.shown).toBe(true); expect(cs.cx.w).toBeGreaterThanOrEqual(44); expect(cs.cx.h).toBeGreaterThanOrEqual(44); expect(cs.link.h).toBeGreaterThanOrEqual(44);
    expect(cs.text).toContain("OpenStreetMap"); expect(cs.pad).toBe(true);
    await shot("credits_portrait");
    await tap("#klc-ui .credits .cx");
    expect(await ui("({ sheet: getComputedStyle(document.querySelector('#klc-ui .credits')).display, hud: document.body.classList.contains('klc-hud-open'), pad: window.__pad.hidden })")).toEqual({ sheet: "none", hud: false, pad: false });
    // the arrivals panel: the minimap is hidden while it is open, back when it closes
    await tap("#klc-ui .brand .chip");
    expect(await ui("getComputedStyle(document.querySelector('#klc-x .mini')).display")).toBe("none");
    await shot("arrivals_portrait");
    await tap("#klc-ui .brand .chip");
    expect(await ui("getComputedStyle(document.querySelector('#klc-x .mini')).display")).not.toBe("none");
    // the time sheet's view and photo buttons, the search close, the map's zoom and close
    await tap('#klc-ui .pbar button[data-sheet="time"]');
    for (const sel of ['#klc-ui .dock [data-act="view"]', '#klc-ui .dock [data-act="photo"]']) { const r = await R(sel); expect(r.h).toBeGreaterThanOrEqual(44); expect(r.w).toBeGreaterThanOrEqual(44); }
    await shot("time_sheet_portrait");
    await tap('#klc-ui .pbar button[data-sheet="time"]');
    await tap('#klc-x .xbar button[data-act="search"]');
    const sx = await R("#klc-x .xsearch .x"); expect(sx.h).toBeGreaterThanOrEqual(44); expect(sx.w).toBeGreaterThanOrEqual(44);
    await tap("#klc-x .xsearch .x");
    await tap("#klc-x .mini");
    for (const a of ["zin", "zout", "map-close"]) { const r = await R(`#klc-x .xmap [data-act="${a}"]`); expect(r.h).toBeGreaterThanOrEqual(44); expect(r.w).toBeGreaterThanOrEqual(44); }
    await tap('#klc-x .xmap [data-act="map-close"]');
    await settle(700);
    // hide the UI from the ☰ menu: the restore eye is 44 px and brings it back
    await tap("#klc-ui .mbtn"); await tap('#klc-ui .tools [data-act="hide"]');
    const eye = await R("#klc-ui-restore"); expect(eye.vis).toBe(true); expect(eye.w).toBeGreaterThanOrEqual(44); expect(eye.h).toBeGreaterThanOrEqual(44);
    await tap("#klc-ui-restore");
    expect(await ui("document.body.classList.contains('noui')")).toBe(false);
    expect(await ui("document.querySelector('#klc-ui').dataset.menu")).toBe("0");
    const lay = await layoutReport(page);
    expect(lay.overlaps).toEqual([]); expect(lay.panelOverlaps).toEqual([]); expect(lay.outside).toEqual([]);
  });

  T("B7: 町へ戻る brings her back on the quay, walking or flying as she boarded, at the hour she boarded", async () => {
    await page.eval("window.__camSpec('walk')"); await settle(600);
    const arrive = async () => { await settle(900); expect(await ui("window.__voyage.active")).toBe(false); };
    for (const [fly, hours] of [[false, 16.5], [true, 9.25]]) {
      // from the homecoming's card (14:30 on the clock), by the card's own 町へ戻る
      await page.eval(`(() => { window.__setHours(${hours}); window.__ctx.playerObj.fly = ${fly}; })()`); await settle(500);
      await page.eval("window.__voyageShot('CARD')"); await settle(1800);
      expect(Math.abs((await ui("window.__ctx.services.time.hours")) - 14.5)).toBeLessThan(0.05);   // boarding moved the clock
      await tap('#klc-ship .card .inner [data-a="exit"]'); await arrive();
      expect(await ui("!!window.__ctx.playerObj.fly")).toBe(fly);
      expect(Math.abs((await ui("window.__ctx.services.time.hours")) - hours)).toBeLessThan(0.05);
      expect(await ui("window.__pad.mode")).toBe(fly ? "fly" : "walk");
      expect(await ui("window.__pad.suppressed")).toEqual([]);
      expect(await ui("(() => { const p = window.__ctx.playerObj.pos, b = window.__shipRoute.BERTH; return Math.hypot(p.x - b.quay[0], p.z - b.quay[1]); })()")).toBeLessThan(5);   // on the quay, not out on the water
    }
    // from the helm, by the pad's 町へ戻る
    await page.eval("(() => { window.__setHours(16.5); window.__ctx.playerObj.fly = false; })()"); await settle(500);
    await page.eval("window.__voyageAt(400)"); await settle(2000);
    await tap('#klc-pad .btn[data-id="home"]'); await arrive();
    expect(await ui("({ fly: !!window.__ctx.playerObj.fly, mode: window.__pad.mode })")).toEqual({ fly: false, mode: "walk" });
    expect(Math.abs((await ui("window.__ctx.services.time.hours")) - 16.5)).toBeLessThan(0.05);
    await page.eval("window.__ctx.playerObj.fly = false; 0");
  });

  T("B8: the boarding chip names her in short on a phone, untruncated", async () => {
    await page.eval("window.__camSpec('walk')"); await settle(500);
    // stand on the quay by her berth: the chip shows by itself (world/ship/index.js)
    await page.eval("(() => { const q = window.__shipRoute.BERTH.quay; window.__setCam(q[0], null, q[1], 90, 0); })()");
    await page.waitFor("document.querySelector('#klc-board').classList.contains('show')", { timeout: 15000 }); await settle(700);
    const g = await page.eval(`(() => { const b = document.querySelector('#klc-board b'), full = b.querySelector('.full'), short = b.querySelector('.short'); const vis = (e) => getComputedStyle(e).display !== 'none'; const r = document.querySelector('#klc-board').getBoundingClientRect(); return { full: vis(full), short: vis(short), text: b.innerText.trim(), clipped: b.scrollWidth > b.clientWidth + 1, l: r.left, r2: r.right, vw: innerWidth }; })()`);
    expect(g).toMatchObject({ full: false, short: true, text: "第一昭福丸", clipped: false });
    expect(g.l).toBeGreaterThanOrEqual(0); expect(g.r2).toBeLessThanOrEqual(g.vw);
    await shot("board_chip_portrait");
  });

  T("no page errors, no horizontal scroll", async () => {
    await setViewport(page, PORTRAIT); await settle(700);
    const errs = page.errors().filter((e) => !/api\/live/.test(e.text));
    expect(errs).toEqual([]);
    expect((await layoutReport(page)).scrollW).toBeLessThanOrEqual(390);
  });
});
