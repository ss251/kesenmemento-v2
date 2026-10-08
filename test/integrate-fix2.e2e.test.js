// [integrate:fix2] The second phone review's blockers, with real touches (headless Chrome, 390x844 @3x and 844x390, CDP touch events):
//   B1 the boarding chip steps aside for the places sheet and the full map  B2 portrait Act 2: the 「どこの海」 caption is one line
//   B3 landscape Act 2: panel <= 60%, 早送り / the quota stay in view, nothing covers the panel  B4 「まちへ出る」 is a 44 px target
//   B5 landscape: the pad's settings popover has nothing under it  B6 the desktop restore eye is as at 8262120 (the 44 px one is phone-only)
// Heavy (it builds the app and loads the town), so it only runs on request, through the gate:
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS KLC_E2E=1 KLC_E2E_PORT=8993 [KLC_SHOT_DIR=docs/shots/integrate] bun test test/integrate-fix2.e2e.test.js
import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { buildAndServe, launch, phonePage, setViewport, center, fingers, layoutReport, sleep, ROOT } from "../tools/anime/pad-lib.mjs";

const RUN = process.env.KLC_E2E === "1" && process.env.KLC_GATE === "1";
const PORT = Number(process.env.KLC_E2E_PORT || 8993);
const SHOTS = process.env.KLC_SHOT_DIR ? resolve(ROOT, process.env.KLC_SHOT_DIR) : null;
const d = RUN ? describe : describe.skip;
const T = (name, fn) => test(name, fn, 300000);
const PORTRAIT = { width: 390, height: 844, dpr: 3, insets: { top: 47, bottom: 34, left: 0, right: 0 } };
const LANDSCAPE = { width: 844, height: 390, dpr: 3, insets: { top: 0, bottom: 21, left: 47, right: 47 } };

d("integrate fix 2: the second phone review's blockers", () => {
  let browser, srv, page, f;
  const settle = (ms = 700) => sleep(ms);
  const ui = (expr) => page.eval(expr);
  const tap = async (sel) => { const c = await center(page, sel); expect(c).not.toBeNull(); expect(c.w).toBeGreaterThan(1); await f.tap(c.x, c.y); await settle(450); return c; };
  const shot = async (name) => { if (!SHOTS) return; const buf = await page.shot(); await sharp(buf).png({ palette: true, quality: 92, effort: 8, dither: 0.6 }).toFile(join(SHOTS, `fix2_${name}.png`)); };
  const R = (sel) => page.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const b = e.getBoundingClientRect(); const s = getComputedStyle(e); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height, vis: s.display !== 'none' && s.visibility !== 'hidden' && b.width > 1 }; })()`);
  const chipOn = () => ui("(() => { const c = document.querySelector('#klc-board'); return c.classList.contains('show') && +getComputedStyle(c).opacity > 0.5; })()");
  const quay = async () => { await page.eval("window.__camSpec('walk')"); await settle(400); await page.eval("(() => { const q = window.__shipRoute.BERTH.quay; window.__setCam(q[0], null, q[1], 90, 0); })()"); };
  const backToTown = async () => { await page.eval("window.__voyage.active && window.__voyage.exit()"); await settle(600); };
  const hit = (a, b) => a.l < b.r - 0.5 && a.r > b.l + 0.5 && a.t < b.b - 0.5 && a.b > b.t + 0.5;
  const inBox = (e, box) => e.t >= box.t - 0.5 && e.b <= box.b + 0.5;

  beforeAll(async () => {
    ({ srv } = await buildAndServe(PORT));
    browser = await launch({ quiet: true });
    page = await phonePage(browser, PORTRAIT);
    f = fingers(page);
    await page.goto(`${srv.url}index.html`);
    await page.waitFor("document.body.classList.contains('loaded')", { timeout: 280000 });
    globalThis.__goBox = {};
    for (const [n, vp] of [["portrait", PORTRAIT], ["landscape", LANDSCAPE]]) { await setViewport(page, vp); await settle(500); globalThis.__goBox[n] = await R("#go"); }
    await setViewport(page, PORTRAIT); await settle(500);
    const g = await center(page, "#go"); await f.tap(g.x, g.y);
    await page.waitFor("document.body.classList.contains('playing')", { timeout: 20000 });
    await settle(1200);
    await page.eval("window.__camSpec('walk')");
    await page.waitFor("window.__pad && !window.__pad.hidden", { timeout: 20000 });
    await page.eval("window.__pad.dismissCoach()");
    await settle(700);
  }, 330000);
  afterAll(async () => { await f?.release?.().catch(() => {}); await browser?.close(); srv?.stop(); }, 60000);

  T("B4: 「まちへ出る」 is at least 44 px tall in both orientations", async () => {
    for (const n of ["portrait", "landscape"]) { expect(globalThis.__goBox[n].h).toBeGreaterThanOrEqual(44); expect(globalThis.__goBox[n].w).toBeGreaterThanOrEqual(44); }
  });

  T("B1: near the berth the boarding chip never sits above the places sheet or the full map", async () => {
    for (const [name, vp] of [["portrait", PORTRAIT], ["landscape", LANDSCAPE]]) {
      await setViewport(page, vp); await settle(900);
      await quay();
      await page.waitFor("document.querySelector('#klc-board').classList.contains('show')", { timeout: 15000 }); await settle(700);
      expect(await chipOn()).toBe(true);
      await shot(`board_chip_${name}`);
      // the places / search sheet
      await tap('#klc-x .xbar button[data-act="search"]'); await settle(900);
      expect(await ui("!document.querySelector('#klc-x .xsearch').hidden")).toBe(true);
      expect(await chipOn()).toBe(false);
      const row = await ui(`(() => { const b = [...document.querySelectorAll('#klc-x .xsearch ol button')].find((x) => x.textContent.includes('昭福丸')); if (!b) return null; const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.left + 24, r.top + r.height / 2); return { top: r.top, bottom: r.bottom, topmost: !!e && !!e.closest('#klc-x .xsearch') }; })()`);
      expect(row).not.toBeNull(); expect(row.topmost).toBe(true);   // nothing is drawn over the 第一昭福丸 row
      await shot(`places_ship_row_${name}`);
      await tap('#klc-x .xsearch .x'); await settle(900);
      await page.waitFor("document.querySelector('#klc-board').classList.contains('show')", { timeout: 15000 }); await settle(500);
      expect(await chipOn()).toBe(true);
      // the full map
      await tap('#klc-x .mini'); await settle(900);
      expect(await ui("!document.querySelector('#klc-x .xmap').hidden")).toBe(true);
      expect(await chipOn()).toBe(false);
      await shot(`map_chip_${name}`);
      await tap('#klc-x .xmap [data-act="map-close"]'); await settle(1200);
      await page.waitFor("document.querySelector('#klc-board').classList.contains('show')", { timeout: 15000 });
      expect(await chipOn()).toBe(true);
      await page.eval("window.__camSpec('walk')"); await settle(400);
    }
  });

  T("B2: portrait Act 2, the 「どこの海」 caption is its bold line only and the deck is clear", async () => {
    await setViewport(page, PORTRAIT); await settle(900);
    for (const st of ["OCEAN_SET", "WAIT", "HAUL", "STOW"]) {
      await page.eval(st === "HAUL" ? "window.__voyageShot('HAUL', { keep: 2, fishOnScale: true })" : `window.__voyageShot('${st}')`); await settle(1800);
      const w = await R("#klc-ship .where"), s = await R("#klc-ship .where small");
      expect(w.vis).toBe(true); expect(s.vis).toBe(false);
      expect(w.h).toBeLessThan(50);   // was a 5-line block about 150 px tall
      expect(w.w).toBeLessThanOrEqual(390 * 0.6 + 1);
      expect(w.b).toBeLessThan(47 + 60 + 50 + 1);   // under the top bar, one line deep
      if (st === "HAUL" || st === "WAIT") await shot(`act2_${st.toLowerCase()}_portrait`);
    }
    // the full text is one tap away in 船のデータ
    await tap('#klc-ship [data-a="facts"]');
    expect(await ui("document.querySelector('#klc-ship .facts').textContent.includes('ICCAT')")).toBe(true);
    await shot("facts_act2_portrait");
    await tap('#klc-ship [data-a="facts"]');
    await backToTown();
  });

  T("B3: landscape Act 2, the panel is at most 60% tall, 早送り and the quota stay in view, nothing covers the panel", async () => {
    await setViewport(page, LANDSCAPE); await settle(900);
    for (const st of ["OCEAN_SET", "WAIT", "HAUL", "STOW"]) {
      await page.eval(st === "HAUL" ? "window.__voyageShot('HAUL', { keep: 2, fishOnScale: true })" : `window.__voyageShot('${st}')`); await settle(1800);
      await shot(`act2_${st.toLowerCase()}_landscape`);
      const p = await R("#klc-ship .panel"), w = await R("#klc-ship .where"), top = await R("#klc-ship .top");
      expect(p.h).toBeLessThanOrEqual(390 * 0.6 + 1);
      expect(w.vis).toBe(true); expect(w.h).toBeLessThan(70);   // the bold line only (two lines in the 45% column)
      expect([st, "where", hit(p, w), JSON.stringify([p, w])]).toEqual([st, "where", false, JSON.stringify([p, w])]); expect([st, "top", hit(p, top), JSON.stringify([p, top])]).toEqual([st, "top", false, JSON.stringify([p, top])]);
      expect(await ui("document.querySelector('#klc-ship .where small') && getComputedStyle(document.querySelector('#klc-ship .where small')).display")).toBe("none");
      if (st === "HAUL") {
        for (const sel of ['#klc-ship .panel .scale', '#klc-ship .panel [data-a="KEEP"]', '#klc-ship .panel [data-a="RELEASE"]', '#klc-ship .panel .bar.quota']) { const e = await R(sel); expect(e).not.toBeNull(); expect(inBox(e, p)).toBe(true); }
        const m = await ui("[...document.querySelectorAll('#klc-ship .panel .meters')].every((m) => { const t = new Set([...m.children].map((c) => Math.round(c.getBoundingClientRect().top))); return t.size === 1; })");
        expect(m).toBe(true);   // the meters are one row
        const q = await ui("(() => { const p = document.querySelector('#klc-ship .panel'); return p.scrollHeight - p.clientHeight; })()");
        expect(q).toBeLessThanOrEqual(2);   // nothing of the haul panel is below the fold
      } else {
        const ff = await R('#klc-ship .panel [data-a="ff"]');
        expect(ff).not.toBeNull(); expect(inBox(ff, p)).toBe(true); expect(ff.h).toBeGreaterThanOrEqual(36);
      }
    }
    await backToTown();
  });

  T("B5: landscape, the settings popover has no dock or places strip under it", async () => {
    await backToTown();
    await setViewport(page, LANDSCAPE); await settle(1000);
    await page.eval("window.__camSpec('walk')"); await settle(900);
    await page.waitFor("window.__pad && !window.__pad.hidden", { timeout: 20000 });
    const before = await layoutReport(page);
    expect(Object.keys(before.panels).some((k) => k.startsWith("dock") || k.startsWith("places"))).toBe(true);   // they are there when the popover is shut
    await tap("#klc-pad .gear"); await settle(700);   // (landscape keeps the gear; a portrait phone opens the settings from ☰ 操作設定, below)
    const r = await layoutReport(page);
    expect(r.pad.settings).toBeDefined();
    expect(r.overlaps.filter((o) => o.startsWith("settings"))).toEqual([]);
    expect(await ui("document.body.classList.contains('klc-pad-set')")).toBe(true);
    await shot("settings_landscape");
    await tap("#klc-pad .gear"); await settle(700);
    expect(await ui("document.body.classList.contains('klc-pad-set')")).toBe(false);
    const after = await layoutReport(page);
    expect(Object.keys(after.panels).some((k) => k.startsWith("dock"))).toBe(true);
    // portrait stays clean
    await setViewport(page, PORTRAIT); await settle(900);
    await tap("#klc-ui .mbtn"); await tap('#klc-ui .tools [data-act="padset"]'); await settle(600);   // [emil-ui] ☰ then 操作設定
    expect((await layoutReport(page)).overlaps.filter((o) => o.startsWith("settings"))).toEqual([]);
    await shot("settings_portrait");
    await ui("window.__pad.openSettings(false)");
  });

  T("B6: the 44 px restore eye is phone-only (body.klc-pad); without the pad it is the 38 px eye at 18 / 18", async () => {
    await setViewport(page, PORTRAIT); await settle(700);
    const measure = () => ui(`(() => { const e = document.getElementById('klc-ui-restore'), b = e.getBoundingClientRect(); return { w: b.width, h: b.height, top: b.top, right: innerWidth - b.right }; })()`);
    await ui("document.body.classList.add('noui'); 0"); await settle(300);
    const phone = await measure();
    expect(phone.w).toBe(44); expect(phone.h).toBe(44);
    await ui("document.body.classList.remove('klc-pad'); 0"); await settle(300);
    const desk = await measure();
    await ui("document.body.classList.add('klc-pad'); document.body.classList.remove('noui'); 0"); await settle(300);
    expect(desk).toMatchObject({ w: 38, h: 38, right: 18 });
    expect(desk.top).toBeGreaterThanOrEqual(18);   // 18 + the emulated notch inset (47 here; 0 on a desktop)
  });

  T("no page errors, no horizontal scroll", async () => {
    await setViewport(page, PORTRAIT); await settle(700);
    expect(page.errors().filter((e) => !/api\/live/.test(e.text))).toEqual([]);
    expect((await layoutReport(page)).scrollW).toBeLessThanOrEqual(390);
  });
});
