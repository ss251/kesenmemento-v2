// [integrate] The merged app on an iPhone (headless Chrome, 390x844 @3x and 844x390, real touches through CDP): the decluttered portrait HUD
// and 第一昭福丸 at the helm on the pad. Heavy (it builds the app and loads the town), so it only runs on request, through the gate:
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS KLC_E2E=1 KLC_E2E_PORT=8991 bun test test/ship-pad.e2e.test.js
// `bun test` alone skips it.
import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { buildAndServe, launch, phonePage, setViewport, enterTown, center, layoutReport, sleep } from "../tools/anime/pad-lib.mjs";

const RUN = process.env.KLC_E2E === "1" && process.env.KLC_GATE === "1";
const PORT = Number(process.env.KLC_E2E_PORT || 8991);
const d = RUN ? describe : describe.skip;
const T = (name, fn) => test(name, fn, 240000);
const PORTRAIT = { width: 390, height: 844, dpr: 3, insets: { top: 47, bottom: 34, left: 0, right: 0 } };
const LANDSCAPE = { width: 844, height: 390, dpr: 3, insets: { top: 0, bottom: 21, left: 47, right: 47 } };

d("integrated app on a phone: portrait HUD and the ship on the pad", () => {
  let browser, srv, page, f;
  const settle = (ms = 700) => sleep(ms);
  const tap = async (sel) => { const c = await center(page, sel); expect(c).not.toBeNull(); expect(c.w).toBeGreaterThan(1); await f.tap(c.x, c.y); await settle(450); return c; };
  const ui = (expr) => page.eval(expr);
  const sail = () => page.eval("(() => { const s = window.__sail.state; return { active: window.__sail.active, ap: s.autopilot, eng: s.eng, rudder: s.rudder, kn: s.kn, tc: s.tc, x: s.x, z: s.z, yaw: s.yaw }; })()");
  const bearing = () => page.eval("(() => { const c = window.__ctx.camera.position, s = window.__sail.state; return Math.atan2(c.x - s.x, c.z - s.z); })()");
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

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

  T("portrait: one compact top bar (time + weather chip, search, ☰), the mode chip under it, a small minimap, two pills, the credit line", async () => {
    const r = await page.eval(`(() => {
      const R = (s) => { const e = document.querySelector(s); if (!e) return null; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return null; const b = e.getBoundingClientRect(); return b.width > 1 ? { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height } : null; };
      return { chip: R('#klc-ui .brand .chip'), search: R('#klc-x .xbar button[data-act="search"]'), menuBtn: R('#klc-ui .mbtn'), mark: R('#klc-ui .mark'), mapBtn: R('#klc-x .xbar button[data-act="map"]'), driveBtn: R('#klc-x .xbar button[data-act="drive"]'),
        tools: R('#klc-ui .tools'), dock: R('#klc-ui .dock'), places: R('#klc-ui .places'), pbar: R('#klc-ui .pbar'), mini: R('#klc-x .mini canvas'), modeChip: R('#klc-pad .chip'), gear: R('#klc-pad .gear'), attr: R('#klc-ui .attr'),
        attrFont: parseFloat(getComputedStyle(document.querySelector('#klc-ui .attr')).fontSize), vw: innerWidth, vh: innerHeight, chipText: document.querySelector('#klc-ui .brand .chip').textContent.replace(/\\s+/g, ' ').trim() };
    })()`);
    // the top bar: chip left, search and ☰ right, one row, below the notch
    expect(r.chip && r.search && r.menuBtn).toBeTruthy();
    expect(r.chip.t).toBeGreaterThanOrEqual(47); expect(Math.abs(r.chip.t - r.menuBtn.t)).toBeLessThan(6); expect(Math.abs(r.search.t - r.menuBtn.t)).toBeLessThan(2);
    expect(r.chip.r).toBeLessThan(r.search.l); expect(r.menuBtn.h).toBeGreaterThanOrEqual(44); expect(r.search.h).toBeGreaterThanOrEqual(44);
    expect(r.chipText).toMatch(/\d\d:\d\d/);
    // gone from the screen: the big wordmark, the map and drive buttons, the five-icon column, the dock and the strip
    expect({ mark: r.mark, mapBtn: r.mapBtn, driveBtn: r.driveBtn, tools: r.tools, dock: r.dock, places: r.places }).toEqual({ mark: null, mapBtn: null, driveBtn: null, tools: null, dock: null, places: null });
    // the mode chip and the gear sit under the bar; the minimap is small
    expect(r.modeChip.t).toBeGreaterThan(r.chip.b); expect(r.gear.t).toBeGreaterThan(r.chip.b);
    expect(r.mini.w).toBeLessThanOrEqual(90); expect(r.mini.t).toBeGreaterThan(r.menuBtn.b);
    // the bottom: two pills, the credit line below them, small but there
    expect(r.pbar.h).toBeGreaterThanOrEqual(44); expect(r.pbar.b).toBeLessThan(r.attr.t + 2);
    expect(r.attr.b).toBeLessThanOrEqual(r.vh); expect(r.attrFont).toBeLessThanOrEqual(9);
    expect((await page.eval("document.querySelector('#klc-ui .attr').textContent")).includes("OpenStreetMap")).toBe(true);
    const lay = await layoutReport(page);
    expect(lay.overlaps).toEqual([]); expect(lay.panelOverlaps).toEqual([]); expect(lay.selfOverlaps).toEqual([]); expect(lay.outside).toEqual([]);
    expect(lay.scrollW).toBeLessThanOrEqual(lay.vw);
  });

  T("every feature is within two taps (real touches): ☰ then language, season, sound, planet; the pills then a place, an hour, the photo; the minimap, search, arrivals, settings", async () => {
    // ☰ -> language (EN / 日本語), and back
    await tap("#klc-ui .mbtn");
    expect(await ui("({ menu: document.querySelector('#klc-ui').dataset.menu, hidden: window.__pad.hidden, labels: [...document.querySelectorAll('#klc-ui .tools .lbl')].map((e) => e.textContent.trim()).filter(Boolean).length })")).toEqual({ menu: "1", hidden: true, labels: 9 });   // language, season, sound, planet, credits, 地名ラベル, hide, [play] みんなであそぶ, and [contrib] 修正を報告 (the last item: nothing above it moved); it said 7 until 地名ラベル joined the menu (c8d1826), 8 until みんなで joined (after hide) and aborted this test before it reached the taps below
    await tap('#klc-ui .tools [data-act="lang"]');
    expect(await ui("document.querySelector('#klc-ui').getAttribute('lang')")).toBe("en");
    await tap('#klc-ui .tools [data-act="lang"]');
    expect(await ui("document.querySelector('#klc-ui').getAttribute('lang')")).toBe("ja");
    // season: it changes and cycles (four taps are a full loop), sound: a toggle that follows the audio state
    const s0 = await ui("document.querySelector('#klc-ui .tools [data-act=\"season\"] .lbl').textContent");
    await tap('#klc-ui .tools [data-act="season"]');
    expect(await ui("document.querySelector('#klc-ui .tools [data-act=\"season\"] .lbl').textContent")).not.toBe(s0);
    for (let i = 0; i < 3; i++) await tap('#klc-ui .tools [data-act="season"]');
    expect(await ui("document.querySelector('#klc-ui .tools [data-act=\"season\"] .lbl').textContent")).toBe(s0);
    await tap('#klc-ui .tools [data-act="sound"]');
    expect(await ui("document.querySelector('#klc-ui .tools [data-act=\"sound\"]').getAttribute('aria-pressed')")).toBe(String(await ui("!!window.__ctx.audio?.muted")));
    // planet closes the menu and the pad steps aside; out of it again
    await tap('#klc-ui .tools [data-act="planet"]');
    await page.waitFor("window.__ctx.planet?.active === true", { timeout: 8000 });
    expect(await ui("({ menu: document.querySelector('#klc-ui').dataset.menu, padHidden: window.__pad.hidden })")).toEqual({ menu: "0", padHidden: true });
    await page.eval("window.__ctx.planet.exit(); 0"); await settle(900);
    // a touch outside the open menu closes it (and the pad is back): left of the menu (it spans x 112-380), so its height does not matter (at y 520 it was just below the seven-item menu and is inside the eight-item one: the tap hit 修正を報告)
    await tap("#klc-ui .mbtn");
    await f.tap(40, 520); await settle(500);
    expect(await ui("({ menu: document.querySelector('#klc-ui').dataset.menu, padHidden: window.__pad.hidden })")).toEqual({ menu: "0", padHidden: false });
    // the pills: the time sheet (the photo button is in it), the places sheet
    await tap('#klc-ui .pbar button[data-sheet="time"]');
    expect(await ui("[...document.querySelectorAll('#klc-ui .dock [data-act]')].map((b) => b.dataset.act)")).toContain("photo");
    expect(await ui("document.querySelectorAll('#klc-ui .dock [data-act=\"preset\"]').length")).toBe(5);
    await tap('#klc-ui .pbar button[data-sheet="time"]');
    await tap('#klc-ui .pbar button[data-sheet="places"]');
    expect(await ui("document.querySelectorAll('#klc-ui .places li button').length")).toBeGreaterThan(3);
    await tap('#klc-ui .pbar button[data-sheet="places"]');
    // the minimap opens the full map (its close button is not under the minimap); search opens and closes
    await tap("#klc-x .mini");
    expect(await ui("({ map: !document.querySelector('#klc-x .xmap').hidden, mini: getComputedStyle(document.querySelector('#klc-x .mini')).display, padHidden: window.__pad.hidden })")).toEqual({ map: true, mini: "none", padHidden: true });
    await tap('#klc-x .xmap [data-act="map-close"]');
    expect(await ui("document.querySelector('#klc-x .xmap').hidden")).toBe(true);
    await tap('#klc-x .xbar button[data-act="search"]');
    expect(await ui("!document.querySelector('#klc-x .xsearch').hidden")).toBe(true);
    await tap("#klc-x .xsearch .x");
    // the arrivals panel (the chip), the pad's settings (the gear)
    await tap("#klc-ui .brand .chip");
    expect(await ui("!document.querySelector('#klc-ui .arrivals').hidden")).toBe(true);
    await tap("#klc-ui .brand .chip");
    await tap("#klc-pad .gear");
    expect(await ui("({ set: !document.querySelector('#klc-pad .settings').hidden, hidden: window.__pad.hidden, sup: window.__pad.suppressed, arr: !document.querySelector('#klc-ui .arrivals').hidden, search: !document.querySelector('#klc-x .xsearch').hidden, map: !document.querySelector('#klc-x .xmap').hidden, menu: document.querySelector('#klc-ui').dataset.menu })")).toMatchObject({ set: true });
    await tap("#klc-pad .gear");
    await page.eval("window.__pad.dismissCoach()");
    expect(await ui("({ hidden: window.__pad.hidden, sup: window.__pad.suppressed })")).toEqual({ hidden: false, sup: [] });
  });

  T("landscape 844x390 is as before: the brand, the five tools, the strip and the dock; no ☰ and no pills", async () => {
    await setViewport(page, LANDSCAPE); await settle(1300);
    const r = await page.eval(`(() => { const sh = (s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 1; };
      return { mbtn: sh('#klc-ui .mbtn'), pbar: sh('#klc-ui .pbar'), tools: sh('#klc-ui .tools'), dock: sh('#klc-ui .dock'), places: sh('#klc-ui .places'), mark: sh('#klc-ui .mark'), map: sh('#klc-x .xbar button[data-act="map"]'), drive: sh('#klc-x .xbar button[data-act="drive"]'), lbl: sh('#klc-ui .tools .lbl'), chip: sh('#klc-pad .chip') }; })()`);
    expect(r).toEqual({ mbtn: false, pbar: false, tools: true, dock: true, places: true, mark: true, map: true, drive: true, lbl: false, chip: true });
    const lay = await layoutReport(page);
    expect(lay.overlaps).toEqual([]); expect(lay.panelOverlaps).toEqual([]); expect(lay.outside).toEqual([]);
    await setViewport(page, PORTRAIT); await settle(1000);
  });

  T("at the helm (portrait): the pad is in 'sail' mode with 停止 自動操船 4× 町へ戻る, the stick is the helm, a right drag looks, the strip clears the pad", async () => {
    await page.eval("window.__voyageAt(400)"); await settle(2500);
    expect(await ui("({ mode: window.__pad.mode, hidden: window.__pad.hidden, sup: window.__pad.suppressed, voyage: window.__voyage.active, state: window.__voyage.state, sail: window.__sail.active })")).toEqual({ mode: "sail", hidden: false, sup: [], voyage: true, state: "DEPART", sail: true });
    expect(await page.eval("[...document.querySelectorAll('#klc-pad .cluster .btn')].filter((b) => b.dataset.show !== '0').map((b) => b.dataset.id + ':' + b.querySelector('.lbl').textContent)")).toEqual(["stop:停止", "auto:自動操船", "x4:4×", "home:町へ戻る"]);
    expect(await page.eval("getComputedStyle(document.querySelector('#klc-pad .chip')).display")).toBe("none");   // no 歩く / 飛ぶ / 運転 while she sails
    let lay = await layoutReport(page);
    expect(lay.overlaps).toEqual([]); expect(lay.outside).toEqual([]); expect(lay.selfOverlaps).toEqual([]);
    expect(lay.panels.shiptop.t).toBeGreaterThanOrEqual(47);   // clear of the notch
    // the autopilot starts on, and the toggle shows it
    expect((await sail()).ap).toBe(true);
    expect(await page.eval("document.querySelector('#klc-pad .btn[data-id=\"auto\"]').getAttribute('aria-pressed')")).toBe("true");
    // the stick up and right: the telegraph rises and the rudder goes over (the autopilot is handed over)
    await f.down1(1, 90, 640); await f.drag(1, 120, 570, 8); await settle(2200);
    const s1 = await sail();
    expect(s1.ap).toBe(false); expect(s1.eng).toBeGreaterThan(0.3); expect(s1.rudder).toBeGreaterThan(0.1);
    expect(await page.eval("document.querySelector('#klc-pad .btn[data-id=\"auto\"]').getAttribute('aria-pressed')")).toBe("false");
    await f.up(1); await settle(3500);
    const s2 = await sail();
    expect(Math.abs(s2.rudder)).toBeLessThan(0.1); expect(s2.eng).toBeGreaterThan(0.3);   // the rudder returns, the telegraph stays
    // a right-half drag turns the chase camera (the same path as the car's)
    const b0 = await bearing();
    await f.down1(2, 330, 420); await f.drag(2, 150, 420, 10); await f.up(2); await settle(400);
    expect(Math.abs(wrap((await bearing()) - b0))).toBeGreaterThan(0.3);
    // 停止: the engine order drops to zero and the autopilot stays off
    const eng0 = await ui("window.__sail.boat.eng");
    await tap('#klc-pad .btn[data-id="stop"]');
    await settle(2500);
    expect((await sail()).ap).toBe(false);
    const eng1 = await ui("window.__sail.boat.eng");
    expect(eng1).toBeLessThan(eng0 - 0.1);   // the engine runs down (its lag is some seconds, longer on a loaded machine)
    await settle(6000);
    expect(await ui("window.__sail.boat.eng")).toBeLessThan(Math.min(eng1 - 0.05, 0.6));
    expect((await sail()).ap).toBe(false);   // and the autopilot has not taken her on again
    // 自動操船: on again (pressed), then 4× while held
    await tap('#klc-pad .btn[data-id="auto"]');
    expect(await sail()).toMatchObject({ ap: true });
    expect(await page.eval("document.querySelector('#klc-pad .btn[data-id=\"auto\"]').getAttribute('aria-pressed')")).toBe("true");
    await settle(1500);
    const x4 = await center(page, '#klc-pad .btn[data-id="x4"]'); await f.down1(3, x4.x, x4.y); await settle(2200);
    const held = await sail();
    await f.up(3);
    expect(held.tc).toBeGreaterThan(1.5);
    // [fix1 B1] 4x no longer takes the helm: with 自動操船 on she stays on the autopilot, which at s > 260 runs its own 4x (it used to be the hold that
    // dropped the autopilot, so tc eased back out here). The release-eases-back check is in test/integrate-fix1.e2e.test.js (s = 130).
    expect((await sail()).ap).toBe(true);
    lay = await layoutReport(page);
    expect(lay.overlaps).toEqual([]);
  });

  T("beats that own the bottom of the screen (haul, ocean, chain cards, final card): the pad is out of the way and the キープ / 放流 buttons take real touches", async () => {
    await page.eval("window.__voyageShot('HAUL', { keep: 1, fishOnScale: true })"); await settle(4500);
    expect(await ui("({ mode: window.__pad.mode, hidden: window.__pad.hidden, sail: window.__sail.active, state: window.__voyage.state })")).toMatchObject({ mode: "sail", hidden: true, sail: false, state: "HAUL" });
    expect(await ui("document.querySelector('#klc-pad').dataset.hidden")).toBe("1");
    let lay = await layoutReport(page);
    expect(Object.keys(lay.pad)).toEqual([]);   // nothing of the pad on screen
    expect(lay.overlaps).toEqual([]);
    const kept0 = await ui("window.__voyage.acts.data.kept.length");
    await page.waitFor("!document.querySelector('#klc-ship [data-a=\"KEEP\"]').disabled", { timeout: 20000 });
    const k = await center(page, '#klc-ship [data-a="KEEP"]');
    expect(k.y).toBeGreaterThan(500);   // down where the thumb is, and nothing of the pad on top of it
    expect(await ui(`document.elementFromPoint(${k.x}, ${k.y}).closest('[data-a]')?.dataset.a`)).toBe("KEEP");
    await f.tap(k.x, k.y); await settle(900);
    expect(await ui("window.__voyage.acts.data.kept.length")).toBeGreaterThan(kept0);
    for (const st of ["OCEAN_SET", "WAIT", "STOW"]) {
      await page.eval(`window.__voyageShot('${st}')`); await settle(1500);
      expect(await ui("window.__pad.hidden")).toBe(true);
    }
    for (const st of ["TRANSSHIP_LAS_PALMAS", "REEFER", "SHIMIZU_WEIGH", "CARD"]) {
      await page.eval(`window.__voyageShot('${st}')`); await settle(1500);
      expect(await ui("window.__pad.hidden")).toBe(true);
      expect((await ui("window.__pad.suppressed")).includes("ship-card")).toBe(true);
      lay = await layoutReport(page); expect(Object.keys(lay.pad)).toEqual([]);
    }
    // 町へ戻る in the voyage UI ends it: the pad hands its buttons back to walk / fly / drive
    await page.eval("document.querySelector('#klc-ship .card [data-a=\"exit\"]').scrollIntoView({ block: 'center' })"); await settle(400);
    await tap('#klc-ship .card [data-a="exit"]');   // (the final card's own button, scrolled into view in its card; the top bar's is under its scrim)
    expect(await ui("window.__voyage.active")).toBe(false);
    await settle(900);
    expect(["walk", "fly"]).toContain(await ui("window.__pad.mode"));
    expect(await ui("window.__pad.suppressed")).toEqual([]);
  });

  T("the way home from the helm: the 町へ戻る pad button ends the voyage (portrait, then landscape)", async () => {
    for (const vp of [PORTRAIT, LANDSCAPE]) {
      await setViewport(page, vp); await settle(900);
      await page.eval("window.__voyageAt(400)"); await settle(2200);
      expect(await ui("({ mode: window.__pad.mode, hidden: window.__pad.hidden })")).toEqual({ mode: "sail", hidden: false });
      const lay = await layoutReport(page);
      expect(lay.overlaps).toEqual([]); expect(lay.outside).toEqual([]); expect(lay.selfOverlaps).toEqual([]);
      expect(lay.scrollW).toBeLessThanOrEqual(lay.vw);
      await tap('#klc-pad .btn[data-id="home"]');
      expect(await ui("({ voyage: window.__voyage.active, sail: window.__sail.active })")).toEqual({ voyage: false, sail: false });
      await settle(900);
      expect(["walk", "fly"]).toContain(await ui("window.__pad.mode"));
    }
    await setViewport(page, PORTRAIT); await settle(700);
  });

  T("no page errors, no horizontal scroll", async () => {
    const errs = page.errors().filter((e) => !/api\/live/.test(e.text));
    expect(errs).toEqual([]);
    expect((await layoutReport(page)).scrollW).toBeLessThanOrEqual(390);
  });
});
