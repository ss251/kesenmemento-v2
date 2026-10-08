// [v7:pad] The touch pad end to end: headless Chrome as an iPhone (390x844, DPR 3, mobile, iPhone UA, touch emulation), real
// touches through CDP Input.dispatchTouchEvent. Heavy (it builds the app and loads the town), so it only runs on request,
// through the machine gate (one Chrome machine-wide):
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS KLC_E2E=1 bun test test/mobile-pad.e2e.test.js
// Port 8981 (this package's). `bun test` alone skips it.
import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { buildAndServe, launch, phonePage, setViewport, enterTown, fingers, center, layoutReport, gameState, dAngle, buttonIds, sleep, waitGo } from "../tools/anime/pad-lib.mjs";

const RUN = process.env.KLC_E2E === "1" && process.env.KLC_GATE === "1";
const PORT = Number(process.env.KLC_E2E_PORT || 8981);
const d = RUN ? describe : describe.skip;
const T = (name, fn) => test(name, fn, 180000);

d("mobile pad: headless Chrome, 390x844 @3x, iPhone UA, CDP touches", () => {
  let browser, srv, page, f;
  const hold = async (ms) => { await sleep(ms); };
  const tapBtn = async (id) => { const c = await center(page, `#klc-pad .btn[data-id="${id}"]`); expect(c).not.toBeNull(); await f.tap(c.x, c.y); return c; };
  const settle = async (ms = 700) => { await sleep(ms); };
  const setMode = async (m) => {
    await page.eval(`(() => { const e = window.__explore, p = window.__ctx.playerObj; if (e.drive.active) e.drive.exit(); p.fly = ${m === 'fly'}; if (${m === 'drive'}) e.drive.enter(); })()`);
    await settle(900);
  };

  beforeAll(async () => {
    ({ srv } = await buildAndServe(PORT));
    browser = await launch({ quiet: true });
    page = await phonePage(browser, { width: 390, height: 844, dpr: 3 });
    // before "Enter the town": the intro card is up and the pad is out of the way
    await page.goto(`${srv.url}index.html`);
    await page.waitFor("document.body.classList.contains('loaded')", { timeout: 280000 });
    f = fingers(page);
  }, 330000);
  afterAll(async () => { await f?.release?.().catch(() => {}); await browser?.close(); srv?.stop(); }, 60000);

  T("it is a phone: coarse pointer, touch, iPhone UA; the pad turns itself on and hides behind the intro card", async () => {
    const r = await page.eval(`({ coarse: matchMedia('(pointer: coarse)').matches, dpr: devicePixelRatio, w: innerWidth, h: innerHeight, ua: navigator.userAgent.includes('iPhone'), pad: !!document.getElementById('klc-pad'), hidden: window.__pad.hidden,
      vis: getComputedStyle(document.getElementById('klc-pad')).visibility, cls: document.body.classList.contains('klc-pad'), tier: window.__ctx.quality.tier, touchAction: getComputedStyle(document.getElementById('scene')).touchAction })`);
    expect(r).toMatchObject({ coarse: true, dpr: 3, w: 390, h: 844, ua: true, pad: true, hidden: true, vis: "hidden", cls: true, tier: "phone", touchAction: "none" });
  });

  T("leave the intro card with a tap; the pad shows and the first-run coach mark appears once", async () => {
    await waitGo(page); const g = await center(page, "#go"); await f.tap(g.x, g.y);
    await page.waitFor("document.body.classList.contains('playing')", { timeout: 20000 });
    await page.eval("window.__camSpec('walk')");
    await page.waitFor("!window.__pad.hidden", { timeout: 20000 });
    await page.waitFor("!document.querySelector('#klc-pad .coach').hidden", { timeout: 6000 });
    const r = await page.eval(`({ txt: document.querySelector('#klc-pad .coach h3').textContent, saved: JSON.parse(localStorage.getItem('klc.pad.v1')).coach, mode: window.__pad.mode })`);
    expect(r.txt).toBe("左で移動・右で視点"); expect(r.saved).toBe(true); expect(r.mode).toBe("walk");
    const lay = await layoutReport(page);
    expect(lay.pad.coach).toBeTruthy();
    expect(lay.overlaps).toEqual([]);   // the coach mark sits in the free band too
    const ok = await center(page, "#klc-pad .coach .ok"); await f.tap(ok.x, ok.y);
    await page.waitFor("document.querySelector('#klc-pad .coach').hidden", { timeout: 4000 });
    expect((await buttonIds(page)).filter((id) => id !== "context")).toEqual(["jump", "dash", "fly"]);   // (乗る / 入る only shows next to a car or a door; a passing car on a slow machine may bring it up, so it is not asserted here)
  });

  T("a stick drag moves the walker by more than 5 m (and past 85 % the ring turns to RUN)", async () => {
    await settle();
    const a = await gameState(page);
    await f.down1(1, 90, 560);
    await f.drag(1, 90, 490, 6);   // 70 px up: past the 56 px travel
    await hold(300);
    const ring = await page.eval(`({ run: document.querySelector('#klc-pad .stick').dataset.run, on: document.querySelector('#klc-pad .stick').dataset.on, running: window.__pad.running, tag: document.querySelector('#klc-pad .stick .tag').textContent })`);
    expect(ring).toMatchObject({ run: "1", on: "1", running: true, tag: "走る" });
    await hold(2200);
    const b = await gameState(page);
    const dist = Math.hypot(b.x - a.x, b.z - a.z);
    expect(dist).toBeGreaterThan(5);
    // forward is where the camera looks
    const fwd = (b.x - a.x) * -Math.sin(a.yaw) + (b.z - a.z) * -Math.cos(a.yaw);
    expect(fwd).toBeGreaterThan(dist * 0.8);
    await f.up(1);
    await hold(700);
    const c = await gameState(page);
    expect(Math.hypot(c.move[0], c.move[1])).toBe(0);
    await page.waitFor("document.querySelector('#klc-pad .stick').dataset.on === '0'", { timeout: 6000 });   // the spring is home, the ghost is back (it runs on frame time: slower on a loaded machine with the ship's scene in it)
  });

  T("a gentle push walks (no run ring), and the dead zone does nothing", async () => {
    const a = await gameState(page);
    await f.down1(1, 90, 560);
    await f.drag(1, 90, 552, 2);   // 8 px: inside the 12 % dead zone (6.7 px)... plus a little
    await f.drag(1, 90, 556, 2);   // back to 4 px
    await hold(500);
    const quiet = await gameState(page);
    expect(Math.hypot(quiet.x - a.x, quiet.z - a.z)).toBeLessThan(0.5);
    await f.drag(1, 90, 530, 4);   // 30 px = 54 % of the travel
    await hold(300);
    const r = await page.eval("({ run: window.__pad.running, len: Math.hypot(window.__pad.move.x, window.__pad.move.y) })");
    expect(r.run).toBe(false); expect(r.len).toBeGreaterThan(0.2); expect(r.len).toBeLessThan(0.7);
    await f.up(1); await hold(500);
  });

  T("a right-side drag changes the yaw by more than 0.3 rad (finger right turns right)", async () => {
    const a = await gameState(page);
    await f.down1(2, 215, 360);
    await f.drag(2, 315, 360, 10);
    await f.up(2);
    await hold(500);
    const b = await gameState(page);
    const dy = dAngle(a.yaw, b.yaw);
    expect(Math.abs(dy)).toBeGreaterThan(0.3);
    expect(dy).toBeLessThan(0);   // drag right = turn right = yaw down (the player's convention)
    // vertical: finger up looks up
    await f.down1(2, 250, 380); await f.drag(2, 250, 330, 6); await f.up(2); await hold(400);
    const c = await gameState(page);
    expect(c.pitch).toBeGreaterThan(b.pitch + 0.1);
  });

  T("ジャンプ raises y", async () => {
    await page.eval("window.__ctx.playerObj.pitch = 0");
    await hold(400);
    const a = await gameState(page);
    expect(a.onGround).toBe(true);
    const btn = await center(page, '#klc-pad .btn[data-id="jump"]');
    expect(btn.w).toBeGreaterThanOrEqual(56);
    await f.down1(5, btn.x, btn.y);
    let top = a.y;
    for (let i = 0; i < 14; i++) { await sleep(40); const s = await gameState(page); top = Math.max(top, s.y); }
    await f.up(5);
    expect(top - a.y).toBeGreaterThan(0.25);
    await hold(900);
    expect((await gameState(page)).onGround).toBe(true);
  });

  T("飛ぶ switches to fly (the buttons change) and holding 上昇 raises the altitude; 下降 lowers it; 歩く lands", async () => {
    await tapBtn("fly");
    await page.waitFor("window.__pad.mode === 'fly'", { timeout: 4000 });
    await settle(600);
    expect(await buttonIds(page)).toEqual(["up", "down", "boost", "land"]);
    expect((await gameState(page)).fly).toBe(true);
    const a = await gameState(page);
    const up = await center(page, '#klc-pad .btn[data-id="up"]');
    await f.down1(6, up.x, up.y);
    await hold(1300);
    const held = await page.eval("window.__pad.isDown('up') && window.__pad.vertical");
    await f.up(6);
    const b = await gameState(page);
    expect(held).toBe(1);
    expect(b.y - a.y).toBeGreaterThan(3);
    const dn = await center(page, '#klc-pad .btn[data-id="down"]');
    await f.down1(6, dn.x, dn.y); await hold(900); await f.up(6);
    const c = await gameState(page);
    expect(c.y).toBeLessThan(b.y - 2);
    // 加速 (hold) doubles the flying speed with the stick
    await f.down1(1, 90, 560); await f.drag(1, 90, 520, 3); await hold(500);
    const s0 = await gameState(page); await hold(800); const s1 = await gameState(page);
    const slow = Math.hypot(s1.x - s0.x, s1.z - s0.z) / 0.8;
    const bo = await center(page, '#klc-pad .btn[data-id="boost"]');
    await f.down1(7, bo.x, bo.y); await hold(700);
    const t0 = await gameState(page); await hold(800); const t1 = await gameState(page);
    const fast = Math.hypot(t1.x - t0.x, t1.z - t0.z) / 0.8;
    await f.up(7); await f.up(1);
    expect(fast).toBeGreaterThan(slow * 1.8);
    await tapBtn("land");
    await page.waitFor("window.__pad.mode === 'walk'", { timeout: 4000 });
    expect((await gameState(page)).fly).toBe(false);
  });

  T("no mode chip ([emil-ui]): 乗る (a road within 14 m) is the way into the car; in the car the stick gives speed and ブレーキ slows it, with two fingers at once", async () => {
    expect(await page.eval("getComputedStyle(document.querySelector('#klc-pad .chip')).display")).toBe("none");   // the pad's own 飛ぶ / 歩く / 乗る / 降りる change the mode (the 歩く / 飛ぶ / 運転 chip said it twice)
    await setMode('walk'); await settle(600);
    const board = await page.eval("(() => { const b = document.querySelector('#klc-pad .btn[data-id=\"context\"]'); return !!b && b.dataset.show !== '0' && b.textContent.includes('乗る'); })()");
    if (board) await tapBtn("context"); else await setMode('drive');   // (乗る shows only with a road within 14 m; the helper drives from anywhere a road is in reach)
    await page.waitFor("window.__explore.drive.active && window.__pad.mode === 'drive'", { timeout: 6000 });
    await settle(600);
    expect(await buttonIds(page)).toEqual(["brake", "nitro", "getout"]);
    expect((await gameState(page)).drive.speed).toBeLessThan(0.5);
    await f.down1(1, 90, 560); await f.drag(1, 90, 520, 4);   // forward, below the boost threshold
    await hold(2600);
    const v = (await gameState(page)).drive.speed;
    expect(v).toBeGreaterThan(2);
    // the second finger holds ブレーキ while the first still pushes the stick
    const br = await center(page, '#klc-pad .btn[data-id="brake"]');
    await f.down1(3, br.x, br.y);
    await hold(1100);
    const v2 = (await gameState(page)).drive.speed;
    expect(await page.eval("window.__pad.isDown('brake') && window.__pad.stickActive")).toBe(true);
    expect(v2).toBeLessThan(Math.max(0.6, v * 0.35));
    await f.up(3);
    // ブースト raises the top speed
    await hold(2200);
    const normal = (await gameState(page)).drive.speed;
    const nb = await center(page, '#klc-pad .btn[data-id="nitro"]');
    await f.down1(4, nb.x, nb.y); await hold(3500);
    const boosted = (await gameState(page)).drive.speed;
    await f.up(4); await f.up(1);
    expect(boosted).toBeGreaterThan(normal + 1.5);
    await tapBtn("getout");
    await page.waitFor("!window.__explore.drive.active && window.__pad.mode === 'walk'", { timeout: 6000 });
  });

  T("stick and look work at the same time (two touch points)", async () => {
    await page.eval("window.__camSpec('walk')"); await settle(900);
    const a = await gameState(page);
    await f.down1(1, 90, 560);
    await f.down1(2, 215, 360);
    await f.drag(1, 90, 500, 5);
    for (let i = 1; i <= 8; i++) { await f.move(2, 215 + i * 12, 360); await sleep(30); }
    await hold(400);
    const mid = await page.eval("({ moveLen: Math.hypot(window.__pad.move.x, window.__pad.move.y), stick: window.__pad.stickActive })");
    expect(mid.stick).toBe(true); expect(mid.moveLen).toBeGreaterThan(0.5);
    await hold(1200);
    const b = await gameState(page);
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeGreaterThan(3);
    expect(Math.abs(dAngle(a.yaw, b.yaw))).toBeGreaterThan(0.3);
    // lifting the look finger leaves the stick running
    await f.up(2); await hold(300);
    expect(await page.eval("window.__pad.stickActive && Math.hypot(window.__pad.move.x, window.__pad.move.y) > 0.5")).toBe(true);
    await f.up(1); await hold(300);
    expect(await page.eval("window.__pad.stickActive")).toBe(false);
  });

  T("a stick finger that crosses to the right half is still the stick; a cancelled touch frees it", async () => {
    await f.down1(1, 150, 560); await f.drag(1, 300, 520, 6); await hold(200);
    expect(await page.eval("window.__pad.stickActive")).toBe(true);
    // iOS cancels a touch on a system gesture: a touchcancel for that identifier frees the stick (a synthetic event, CDP has no per-finger cancel)
    await page.eval(`(() => { const c = document.getElementById('scene'); const t = new Touch({ identifier: 1, target: c, clientX: 300, clientY: 520 });
      c.dispatchEvent(new TouchEvent('touchcancel', { bubbles: true, cancelable: true, changedTouches: [t], touches: [], targetTouches: [] })); })()`);
    await hold(200);
    expect(await page.eval("window.__pad.stickActive")).toBe(false);
    expect(await page.eval("Math.hypot(window.__pad.move.x, window.__pad.move.y)")).toBe(0);
    await f.release(); await hold(300);
  });

  T("B1: a thumb that lands on the places strip or the dock (landscape) still gets the stick or the look, and a quick tap still reaches the panel; in portrait ([emil-ui]) the bottom band is the thumbs' alone and the chip and ☰ open the sheets", async () => {
    await setMode('walk');   // (an earlier failure must not leave the car or the flight on)
    await page.eval("window.__camSpec('walk')"); await settle(900);
    const vis = (sel) => page.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 1; })()`);
    // [emil-ui] portrait 390x844 with the pad: the strip and the dock are sheets (the chip opens the time sheet, ☰ then 名所 the strip); no pills sit in the thumbs' band
    expect({ places: await vis('#klc-ui .places'), dock: await vis('#klc-ui .dock'), pbar: await vis('#klc-ui .pbar') }).toEqual({ places: false, dock: false, pbar: false });
    const lp = { x: 100, y: 754 }, rp = { x: 290, y: 754 };   // (where the two pills were: the bottom band, now the bare scene)
    // 1. stick from a thumb that lands low on the left, dragged 70 px up
    const a = await gameState(page);
    await f.down1(1, 60, lp.y); await f.drag(1, 60, lp.y - 70, 8); await hold(250);
    const mid = await page.eval("({ stick: window.__pad.stickActive, len: Math.hypot(window.__pad.move.x, window.__pad.move.y) })");
    await hold(1000); await f.up(1); await hold(300);
    const b = await gameState(page);
    expect(mid.stick).toBe(true); expect(mid.len).toBeGreaterThan(0.5);
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeGreaterThan(2);
    expect(await page.eval("window.__pad.stickActive")).toBe(false);
    expect(await page.eval("document.querySelector('#klc-ui').dataset.sheet")).toBe("");   // a drag is not a click: no sheet opened
    // 1b. the stick is anchored where the thumb LANDED, not where the 10 px of travel ended
    await f.down1(1, 90, lp.y); await f.drag(1, 90, lp.y - 52, 8); await hold(250);
    const anc = await page.eval("(() => { const r = document.querySelector('#klc-pad .stick').getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, run: window.__pad.running, stick: window.__pad.stickActive }; })()");
    await f.up(1); await hold(300);
    expect(anc.stick).toBe(true); expect(anc.run).toBe(true);
    expect(Math.abs(anc.cx - 90)).toBeLessThan(2); expect(Math.abs(anc.cy - lp.y)).toBeLessThan(2);
    // 3. look on the right: one 190 px swipe turns about 85 degrees (B2). ([emil-ui] it started on the time pill, a panel the look had to be promoted from; the pill is
    // gone, so the swipe starts on the scene, mid-right. In headless Chrome a look that started in the band under ジャンプ (330, 754) did not turn, though the scene is
    // the element there: an open item for the device check, lanes/emil-ui.md.)
    await page.eval("window.__ctx.playerObj.pitch = 0"); await hold(200);
    const e0 = await gameState(page);
    await f.down1(2, 330, 470); await f.drag(2, 140, 470, 12); await f.up(2); await hold(900);
    const e1 = await gameState(page);
    const deg = Math.abs(dAngle(e0.yaw, e1.yaw)) * 180 / Math.PI;
    expect(deg).toBeGreaterThan(70); expect(deg).toBeLessThan(100);
    expect(await page.eval("document.querySelector('#klc-ui').dataset.sheet")).toBe("");
    // 4. a quick tap on the chip opens the time sheet (and the pad steps aside); a time-of-day button on the dock presses; the chip closes it
    const chip = await center(page, '#klc-ui .brand .chip');
    await f.tap(chip.x, chip.y); await hold(600);
    expect(await page.eval("({ sheet: document.querySelector('#klc-ui').dataset.sheet, dock: getComputedStyle(document.querySelector('#klc-ui .dock')).display, hidden: window.__pad.hidden, exp: document.querySelector('#klc-ui .brand .chip').getAttribute('aria-expanded') })")).toMatchObject({ sheet: "time", dock: "flex", hidden: true, exp: "true" });
    const presets = await page.eval("[...document.querySelectorAll('#klc-ui .dock .seg button[data-act=\"preset\"]')].map((b) => ({ id: b.dataset.id, on: b.getAttribute('aria-pressed') === 'true' }))");
    const idle = presets.filter((p) => !p.on).map((p) => p.id);
    expect(idle.length).toBeGreaterThan(2);
    const pressed = (id) => page.eval(`document.querySelector('#klc-ui .dock button[data-id="${id}"]').getAttribute('aria-pressed') === 'true'`);
    const t1 = await center(page, `#klc-ui .dock button[data-id="${idle[0]}"]`);
    await f.tap(t1.x, t1.y); await hold(600);
    expect(await pressed(idle[0])).toBe(true);
    await f.tap(chip.x, chip.y); await hold(600);
    expect(await page.eval("({ sheet: document.querySelector('#klc-ui').dataset.sheet, hidden: window.__pad.hidden })")).toEqual({ sheet: "", hidden: false });
    // 5. the places sheet (☰ then 名所): the strip of places; a touch outside folds it
    const mb = await center(page, '#klc-ui .mbtn'); await f.tap(mb.x, mb.y); await hold(600);
    const pr = await center(page, '#klc-ui .tools [data-sheet="places"]'); await f.tap(pr.x, pr.y); await hold(600);
    expect(await page.eval("({ sheet: document.querySelector('#klc-ui').dataset.sheet, shown: getComputedStyle(document.querySelector('#klc-ui .places')).display })")).toEqual({ sheet: "places", shown: "flex" });
    await f.tap(40, 300); await hold(500);
    expect(await page.eval("document.querySelector('#klc-ui').dataset.sheet")).toBe("");
    // 6. landscape keeps the strip and the dock as they were: a thumb on either still drives, a drag does not click the dock button
    await setViewport(page, { width: 844, height: 390, dpr: 3, insets: { top: 0, bottom: 21, left: 47, right: 47 } }); await settle(1200);
    await page.eval("window.__camSpec('walk')"); await settle(700);
    expect({ places: await vis('#klc-ui .places'), dock: await vis('#klc-ui .dock'), pbar: await vis('#klc-ui .pbar') }).toEqual({ places: true, dock: true, pbar: false });
    const pl = await center(page, '#klc-ui .places'), dk = await center(page, '#klc-ui .dock');
    const c0 = await gameState(page);
    await f.down1(1, 110, pl.y); await f.drag(1, 110, pl.y - 70, 8); await hold(1000); await f.up(1); await hold(300);
    const c1 = await gameState(page);
    expect(Math.hypot(c1.x - c0.x, c1.z - c0.z)).toBeGreaterThan(2);
    const t2 = await center(page, `#klc-ui .dock button[data-id="${idle[1]}"]`);
    await f.down1(1, t2.x, t2.y); await f.drag(1, t2.x, t2.y - 60, 6); await f.up(1); await hold(500);
    expect(await pressed(idle[1])).toBe(false);
    void dk;
    await setViewport(page, { width: 390, height: 844, dpr: 3, insets: { top: 47, bottom: 34, left: 0, right: 0 } }); await settle(900);
  });

  const MODES = ["walk", "fly", "drive"];
  for (const [label, w, h, insets] of [["portrait 390x844", 390, 844, { top: 47, bottom: 34, left: 0, right: 0 }], ["landscape 844x390", 844, 390, { top: 0, bottom: 21, left: 47, right: 47 }]]) {
    T(`no pad element overlaps the dock, time bar, places, minimap, credit line, tools or each other: ${label} (walk, fly, drive; right- and left-handed)`, async () => {
      await setViewport(page, { width: w, height: h, dpr: 3, insets });
      await settle(1200);
      for (const lefty of [false, true]) {
        await page.eval(`window.__pad.setSetting('leftHanded', ${lefty})`);
        for (const m of MODES) {
          await setMode(m);
          await settle(900);
          const r = await layoutReport(page);
          const tag = `${label} ${m}${lefty ? " lefty" : ""}`;
          expect({ tag, vw: r.vw, vh: r.vh }).toEqual({ tag, vw: w, vh: h });
          expect({ tag, overlaps: r.overlaps }).toEqual({ tag, overlaps: [] });
          expect({ tag, panelOverlaps: r.panelOverlaps }).toEqual({ tag, panelOverlaps: [] });   // and the panels keep clear of each other while the pad is on
          expect({ tag, selfOverlaps: r.selfOverlaps, rects: r.selfOverlaps.length ? r.pad : null }).toEqual({ tag, selfOverlaps: [], rects: null });
          expect({ tag, outside: r.outside }).toEqual({ tag, outside: [] });
          expect(r.scrollW).toBeLessThanOrEqual(r.vw); expect(r.scrollH).toBeLessThanOrEqual(r.vh);
          const btns = Object.entries(r.pad).filter(([k]) => k.startsWith("btn:"));
          expect(btns.length).toBe(m === "fly" ? 4 : m === "drive" ? 3 : btns.length);   // walk: 3, or 4 with 乗る / 入る
          if (m === "walk") expect([3, 4]).toContain(btns.length);
          for (const [k, b] of btns) { expect({ tag, k, ok: b.w >= 56 && b.h >= 56 }).toEqual({ tag, k, ok: true }); }
          // the pad sits inside the safe area
          expect(r.pad.ghost.l).toBeGreaterThanOrEqual(insets.left); expect(r.pad.ghost.b).toBeLessThanOrEqual(r.vh - insets.bottom + 0.5);
          // sides: the stick's ghost and the buttons are on opposite halves
          const gx = (r.pad.ghost.l + r.pad.ghost.r) / 2, bx = btns.reduce((s, [, b]) => s + (b.l + b.r) / 2, 0) / btns.length;
          expect({ tag, gx, bx, ok: lefty ? gx > r.vw / 2 && bx < r.vw / 2 : gx < r.vw / 2 && bx > r.vw / 2 }).toMatchObject({ tag, ok: true });
        }
        await setMode("walk");
      }
      await page.eval("window.__pad.setSetting('leftHanded', false)");
    });
  }

  T("landscape 844x390: the places strip header never stacks glyphs and the current place stays on one line, clear of the dock", async () => {
    await setViewport(page, { width: 844, height: 390, dpr: 3, insets: { top: 0, bottom: 21, left: 47, right: 47 } });
    await settle(1200);
    await setMode("walk");
    const r = await page.eval(`(() => {
      const ph = document.querySelector('#klc-ui .places .ph'), lbl = ph.querySelector('.lbl'), cur = ph.querySelector('.cur'), dk = document.querySelector('#klc-ui .dock').getBoundingClientRect(), pl = document.querySelector('#klc-ui .places').getBoundingClientRect();
      const lh = (e) => parseFloat(getComputedStyle(e).lineHeight) || parseFloat(getComputedStyle(e).fontSize);
      return { places: pl.width, gap: dk.left - pl.right, lblShown: getComputedStyle(lbl).display !== 'none', lblH: lbl.getBoundingClientRect().height, lblLH: lh(lbl),
        curH: cur.getBoundingClientRect().height, curLH: lh(cur), curClipped: cur.scrollWidth > cur.clientWidth + 1, ph: ph.getBoundingClientRect().height };
    })()`);
    expect(r.places).toBeGreaterThanOrEqual(180);
    expect(r.gap).toBeGreaterThanOrEqual(4);   // the dock is clear of the strip
    if (r.lblShown) expect(r.lblH).toBeLessThan(r.lblLH * 1.6);   // (hidden here; if it ever shows: one line, not one glyph per line)
    expect(r.curClipped).toBe(false);   // the whole place name fits
    expect(r.curH).toBeLessThan(r.curLH * 1.6);   // 'PIER7（ピアセブン）' does not wrap
    expect(r.ph).toBeLessThan(40);
    await setViewport(page, { width: 390, height: 844, dpr: 3, insets: { top: 47, bottom: 34, left: 0, right: 0 } });
    await settle(900);
  });

  T("left-handed: the stick is on the right half and the look on the left; the setting is saved", async () => {
    await setViewport(page, { width: 390, height: 844, dpr: 3, insets: { top: 47, bottom: 34, left: 0, right: 0 } });
    await settle(900);
    const mb = await center(page, "#klc-ui .mbtn"); await f.tap(mb.x, mb.y); await settle(600);   // [emil-ui] ☰ then 操作設定 (the gear is gone)
    const ps = await center(page, '#klc-ui .tools [data-act="padset"]'); expect(ps.h).toBeGreaterThanOrEqual(44); await f.tap(ps.x, ps.y);
    await page.waitFor("!document.querySelector('#klc-pad .settings').hidden", { timeout: 3000 });
    const sw = await center(page, '#klc-pad .sw[data-set="leftHanded"]'); await f.tap(sw.x, sw.y);
    await settle(600);
    expect(await page.eval("({ hand: document.getElementById('klc-pad').dataset.hand, saved: JSON.parse(localStorage.getItem('klc.pad.v1')).leftHanded })")).toEqual({ hand: "left", saved: true });
    await page.eval("window.__pad.openSettings(false)");   // fold the settings (a touch outside does it too)
    await settle(400);
    const a = await gameState(page);
    await f.down1(1, 300, 560); await f.drag(1, 300, 500, 5); await hold(1200);
    const b = await gameState(page);
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeGreaterThan(2);
    await f.up(1);
    await f.down1(2, 60, 400); await f.drag(2, 150, 400, 8); await f.up(2); await hold(500);
    expect(Math.abs(dAngle(b.yaw, (await gameState(page)).yaw))).toBeGreaterThan(0.3);
    // invert Y: finger up now looks down
    await page.eval("window.__pad.setSetting('invertY', true)");
    const p0 = (await gameState(page)).pitch;
    await f.down1(2, 60, 420); await f.drag(2, 60, 370, 6); await f.up(2); await hold(400);
    expect((await gameState(page)).pitch).toBeLessThan(p0 - 0.1);
    await page.eval("window.__pad.setSetting('invertY', false); window.__pad.setSetting('leftHanded', false)");
  });

  T("it fades to 70 % after 4 s idle and comes back at once on any touch", async () => {   // [ui-b2:14] it was 35 %: a button label measured 2.1:1 on the sky
    await page.eval("window.__pad.setSetting('sens', 1)");
    await hold(5600);
    const faded = await page.eval("({ idle: document.getElementById('klc-pad').dataset.idle, op: +getComputedStyle(document.querySelector('#klc-pad .cluster')).opacity })");
    expect(faded.idle).toBe("1"); expect(faded.op).toBeGreaterThan(0.65); expect(faded.op).toBeLessThan(0.75);
    await f.down1(8, 200, 200);   // a touch on the sky
    const back = await page.eval("document.getElementById('klc-pad').dataset.idle");
    await f.up(8);
    expect(back).toBe("0");
  });

  T("the pad steps aside for the tour, the tiny planet, photo mode and the hidden UI, and comes back", async () => {
    const vis = () => page.eval("({ hidden: window.__pad.hidden, v: getComputedStyle(document.getElementById('klc-pad')).visibility })");
    expect(await vis()).toMatchObject({ hidden: false, v: "visible" });
    await page.eval("window.__life.tour.play()"); await settle(900);
    expect(await vis()).toMatchObject({ hidden: true });
    await page.eval("window.__life.tour.stop()"); await page.eval("window.__camSpec('walk')"); await settle(900);
    expect(await vis()).toMatchObject({ hidden: false });
    for (const cls of ["noui", "klc-photo", "cinematic"]) {
      await page.eval(`document.body.classList.add('${cls}')`); await settle(500);
      expect(await vis()).toMatchObject({ hidden: true });
      await page.eval(`document.body.classList.remove('${cls}')`); await settle(500);
      expect(await vis()).toMatchObject({ hidden: false });
    }
    // a hidden pad takes no touches
    await page.eval("document.body.classList.add('noui')"); await settle(400);
    const a = await gameState(page);
    await f.down1(1, 90, 560); await f.drag(1, 90, 490, 4); await hold(800); await f.up(1);
    const b = await gameState(page);
    await page.eval("document.body.classList.remove('noui')"); await settle(500);
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThan(0.3);
  });

  T("a registered mode (the sail API) shows its buttons, holds the pad, and hands it back", async () => {
    const log = [];
    await page.eval(`(() => { window.__log = []; const pad = window.__pad;
      pad.registerMode('sail', { stick: 'analog', buttons: [ { id: 'stop', label: '停止', icon: 'brake', onDown: () => window.__log.push('stop') }, { id: 'auto', label: '自動操船', icon: 'boost', toggle: true, onDown: (p, on) => window.__log.push('auto:' + on) },
        { id: 'x4', label: '4×', icon: 'dash', hold: true, onDown: () => window.__log.push('x4+'), onUp: () => window.__log.push('x4-') }, { id: 'home', label: '町へ戻る', icon: 'land', onDown: () => window.__log.push('home') } ] });
      pad.setMode('sail'); })()`);
    await settle(900);
    expect(await buttonIds(page)).toEqual(["stop", "auto", "x4", "home"]);
    expect(await page.eval("window.__pad.mode")).toBe("sail");
    await page.eval("window.__ctx.playerObj.fly = true"); await settle(500);
    expect(await page.eval("window.__pad.mode")).toBe("sail");   // it does not follow the player any more
    await tapBtn("stop"); await tapBtn("auto"); await tapBtn("home");
    const x4 = await center(page, '#klc-pad .btn[data-id="x4"]'); await f.down1(9, x4.x, x4.y); await hold(200); await f.up(9);
    const L = await page.eval("window.__log");
    expect(L).toEqual(["stop", "auto:true", "home", "x4+", "x4-"]);
    expect(await page.eval("document.querySelector('#klc-pad .btn[data-id=\"auto\"]').getAttribute('aria-pressed')")).toBe("true");
    const lay = await layoutReport(page);
    expect(lay.overlaps).toEqual([]); expect(lay.selfOverlaps).toEqual([]);
    await page.eval("window.__pad.setMode(null); window.__ctx.playerObj.fly = false"); await settle(800);
    expect(await page.eval("window.__pad.mode")).toBe("walk");
    void log;
  });

  T("乗る appears near a road and boards the car; 入る appears at an interior door and walks in, 出る walks out", async () => {
    await page.eval(`(() => { window.__pad.setSetting('leftHanded', false); const e = window.__explore, p = window.__ctx.playerObj; const n = e.net.nearest(p.pos.x, p.pos.z, 400); p.setPose(n.x, n.z, p.yaw * 180 / Math.PI, 0); })()`); await settle(1200);
    expect(await buttonIds(page)).toContain("context");   // standing on a road
    expect(await page.eval("document.querySelector('#klc-pad .btn[data-id=\"context\"] .lbl').textContent")).toBe("乗る");
    await tapBtn("context");
    await page.waitFor("window.__explore.drive.active", { timeout: 6000 });
    expect(await page.eval("window.__pad.mode")).toBe("drive");
    await tapBtn("getout");
    await page.waitFor("!window.__explore.drive.active && window.__pad.mode === 'walk'", { timeout: 6000 });
    // the fish market C hall: stand at its door
    const door = await page.eval("(() => { const m = window.__explore.interiors.marketC; return m ? { e: m.entrance, i: m.inside } : null; })()");
    expect(door).not.toBeNull();
    await page.eval(`window.__ctx.playerObj.setPose(${door.e.x}, ${door.e.z}, ${door.e.yaw}, 0)`); await settle(1200);
    expect(await page.eval("document.querySelector('#klc-pad .btn[data-id=\"context\"] .lbl')?.textContent")).toBe("入る");
    expect((await layoutReport(page)).overlaps).toEqual([]);
    await tapBtn("context"); await settle(900);
    const inside = await gameState(page);
    expect(Math.hypot(inside.x - door.i.x, inside.z - door.i.z)).toBeLessThan(1.5);
    await page.waitFor("document.querySelector('#klc-pad .btn[data-id=\"context\"] .lbl')?.textContent === '出る'", { timeout: 4000 });
    await tapBtn("context"); await settle(900);
    const out = await gameState(page);
    expect(Math.hypot(out.x - door.e.x, out.z - door.e.z)).toBeLessThan(1.5);
  });

  T("player.touchMove still reads the stick (the ship branch's contract)", async () => {
    await f.down1(1, 90, 560); await f.drag(1, 90, 500, 4); await hold(300);
    const r = await page.eval("({ same: window.__ctx.playerObj.touchMove === window.__pad.move, y: window.__ctx.playerObj.touchMove.y, len: window.__ctx.playerObj.touchMove.length() })");
    await f.up(1);
    expect(r.same).toBe(true); expect(r.y).toBeLessThan(-0.5); expect(r.len).toBeGreaterThan(0.5);
  });

  T("desktop is unchanged: no pad, WASD walks, F flies, a mouse drag looks; ?touch=1 style activation shows the pad and a mouse click presses a button", async () => {
    const dp = await browser.page({ width: 1280, height: 720, dpr: 1 });
    await dp.goto(`${srv.url}index.html?q=low`);
    await dp.waitFor("document.body.classList.contains('loaded')", { timeout: 280000 });
    await dp.eval("document.getElementById('go').click()");
    await dp.waitFor("document.body.classList.contains('playing')", { timeout: 20000 });
    await sleep(1200);
    await dp.eval("window.__camSpec('walk')"); await sleep(800);
    expect(await dp.eval("({ pad: !!document.getElementById('klc-pad'), cls: document.body.classList.contains('klc-pad'), active: window.__pad.active, coarse: matchMedia('(pointer: coarse)').matches })")).toEqual({ pad: false, cls: false, active: false, coarse: false });
    const key = async (type, code, k, vk) => dp.S("Input.dispatchKeyEvent", { type, code, key: k, windowsVirtualKeyCode: vk });
    const pos = () => dp.eval("(() => { const p = window.__ctx.playerObj; return [p.pos.x, p.pos.y, p.pos.z, p.yaw, p.pitch, p.fly]; })()");
    const a = await pos();
    await key("keyDown", "KeyW", "w", 87); await sleep(1500); await key("keyUp", "KeyW", "w", 87);
    const b = await pos();
    expect(Math.hypot(b[0] - a[0], b[2] - a[2])).toBeGreaterThan(2);
    await key("keyDown", "KeyF", "f", 70); await key("keyUp", "KeyF", "f", 70); await sleep(300);
    expect((await pos())[5]).toBe(true);
    await key("keyDown", "KeyF", "f", 70); await key("keyUp", "KeyF", "f", 70); await sleep(300);
    // the mouse drag look (the player's own path)
    const y0 = (await pos())[3];
    await dp.S("Input.dispatchMouseEvent", { type: "mousePressed", x: 640, y: 360, button: "left", clickCount: 1 });
    for (let i = 1; i <= 8; i++) { await dp.S("Input.dispatchMouseEvent", { type: "mouseMoved", x: 640 + i * 20, y: 360, button: "left", buttons: 1 }); await sleep(20); }
    await dp.S("Input.dispatchMouseEvent", { type: "mouseReleased", x: 800, y: 360, button: "left", clickCount: 1 });
    await sleep(300);
    expect(Math.abs(dAngle(y0, (await pos())[3]))).toBeGreaterThan(0.15);
    // a touch device showing up (or ?touch=1): the pad mounts, hidden state follows the game, a mouse click presses 飛ぶ
    await dp.eval("document.exitPointerLock?.(); window.__pad.activate()"); await sleep(1500);   // (the click on the canvas took the pointer lock, as on a real desktop)
    expect(await dp.eval("({ pad: !!document.getElementById('klc-pad'), hidden: window.__pad.hidden, mode: window.__pad.mode })")).toEqual({ pad: true, hidden: false, mode: "walk" });
    const fb = await center(dp, '#klc-pad .btn[data-id="fly"]');
    await dp.S("Input.dispatchMouseEvent", { type: "mousePressed", x: fb.x, y: fb.y, button: "left", clickCount: 1 });
    await dp.S("Input.dispatchMouseEvent", { type: "mouseReleased", x: fb.x, y: fb.y, button: "left", clickCount: 1 });
    await sleep(500);
    expect((await pos())[5]).toBe(true);
    const lay = await layoutReport(dp);
    expect(lay.overlaps).toEqual([]);
    expect(dp.errors().filter((e) => !/api\/live/.test(e.text))).toEqual([]);
    await dp.S("Target.closeTarget", { targetId: undefined }).catch(() => {});
  });

  T("no page errors, no horizontal scroll, and the iOS hardening is in place", async () => {
    const errs = page.errors().filter((e) => !/api\/live/.test(e.text));
    expect(errs).toEqual([]);
    const r = await page.eval(`(() => { const cs = getComputedStyle(document.getElementById('klc-pad')); const gs = new Event('gesturestart', { cancelable: true }); document.dispatchEvent(gs);
      const tm = new TouchEvent('touchmove', { cancelable: true, bubbles: true }); document.getElementById('scene').dispatchEvent(tm);
      return { callout: cs.webkitTouchCallout || cs.getPropertyValue('-webkit-touch-callout'), sel: cs.userSelect, ta: cs.touchAction, gesturePrevented: gs.defaultPrevented, movePrevented: tm.defaultPrevented,
        meta: document.querySelector('meta[name=viewport]').content, h: cs.height, scrollW: document.documentElement.scrollWidth }; })()`);
    expect(r.sel).toBe("none"); expect(r.ta).toBe("none"); expect(r.gesturePrevented).toBe(true); expect(r.movePrevented).toBe(true);
    expect(r.meta).toContain("user-scalable=no"); expect(r.meta).toContain("viewport-fit=cover"); expect(r.scrollW).toBeLessThanOrEqual(390);
  });
});
