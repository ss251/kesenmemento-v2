// [ui-a2] Row 4 in a real Chrome: a key, a press on the canvas or a touch ends a flight to a place at once (tour.skip, never tour.stop), with the veil's dip when the flight is far from its
// destination and a quarter-second glide when it is near, and the touch pad comes back. Desktop 1440x900 with real key and mouse events, then an iPhone-shaped page (390x844 @3x, touch emulation,
// real CDP touches). Heavy (it builds the app and loads the town twice), so it only runs on request, through the gate (one Chrome machine-wide):
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS KLC_E2E=1 KLC_E2E_PORT=9400 bun test <absolute path>/test/ui-a2.e2e.test.js
// (an absolute path, as for the other e2e files in a worktree whose node_modules / raw are symlinks.) Every number it measures is printed as one `A2-METRICS {json}` line.
// A2_SHOTS=<dir> also saves screenshots of the veil there.
//
// How the time is measured: an in-page recorder (installed before the gesture, armed just before it) takes the input event's own timeStamp as t0 (the moment Chrome made the event, not the
// moment CDP got an answer), listens to tour.onChange for the first change after t0 that says tour.flying is false, and samples tour.flying, pad.hidden and the veil's computed opacity once
// per frame. So "the flight is over within 0.3 s" is a number from inside the page. This machine runs the town at 6 to 50 frames a second under the gate's background priority and the other
// lanes' load (a frame of 200 ms now and then), where the camera's own clock moves in steps of at most 100 ms and a touch can wait 250 ms for the page to take it. So the assertions that must hold
// at any frame rate are about what the page did (the veil was opaque at the jump, the glide took a handful of frames, one cut, one skip, the framing exact), and the times are printed for the
// notes with the frame times beside them; the exact 60 fps numbers (117 ms far, 267 ms near) are pinned in test/veil.test.js.
import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { buildAndServe, launch, phonePage, enterTown, center, fingers, gameState, sleep } from "../tools/anime/pad-lib.mjs";

const RUN = process.env.KLC_E2E === "1" && process.env.KLC_GATE === "1";
const PORT = Number(process.env.KLC_E2E_PORT || 9400);
const SHOTS = process.env.A2_SHOTS || "";
const d = RUN ? describe : describe.skip;
const T = (name, fn) => test(name, fn, 240000);
const PORTRAIT = { width: 390, height: 844, dpr: 1, insets: { top: 47, bottom: 34, left: 0, right: 0 } };   // (DPR 1: this file measures time, and a 3x phone page draws nine times the pixels on a machine that is shared)
const M = { build: "ui-a2" };   // every number the run measured
const metric = (k, v) => { M[k] = v; return v; };
const WATCHDOG_MS = 15 * 60 * 1000;
/** A page that stops answering must not hold the machine's one Chrome lock: every in-page call has a deadline, and a call that misses it ends the run at once (process exit kills the browser). */
const guard = (page, ms = 90000) => {
  const ev = page.eval;
  page.eval = (expr) => new Promise((res, rej) => {
    const t = setTimeout(() => { console.error("A2-METRICS " + JSON.stringify(M)); console.error(`ui-a2 e2e: the page did not answer within ${ms} ms, ending the run so the Chrome lock is released: ${String(expr).slice(0, 160)}`); process.exit(1); }, ms);
    ev(expr).then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
  });
  return page;
};

// ------------------------------------------------------------------ in the page
/** The recorder. arm() right before the gesture: the first keydown / pointerdown / touchstart after it is t0. Samples every frame; counts the veil's cuts and tour.skip calls. */
const RECORDER = `(() => {
  if (window.__rec) window.__rec.stop();
  const tour = window.__life.tour, ctx = window.__ctx, veilEl = () => document.getElementById('klc-veil'), padRoot = () => document.getElementById('klc-pad');
  const op = (el) => (el ? +getComputedStyle(el).opacity : 0);
  const rec = window.__rec = { armed: false, ts0: null, tHandler: null, ev: null, flyingAtT0: null, padHiddenAtT0: null, flights: [], frames: [], cuts: [], skips: 0, on: true, stops: 0 };
  const camNow = () => { const p = ctx.camera.position; return [p.x, p.y, p.z]; };
  const mark = (e) => { if (!rec.armed || rec.ts0 !== null) return; rec.ts0 = e.timeStamp || performance.now(); rec.tHandler = performance.now(); rec.ev = e.type + ':' + (e.code || e.pointerType || ''); rec.flyingAtT0 = tour.flying; rec.padHiddenAtT0 = window.__pad ? window.__pad.hidden : null; };
  const types = ['keydown', 'pointerdown', 'touchstart'];
  for (const t of types) window.addEventListener(t, mark, { capture: true, passive: true });
  const off = tour.onChange(() => { const v = veilEl(); rec.flights.push({ t: performance.now(), flying: tour.flying, playing: tour.playing, current: tour.current, veil: op(v), veilOn: !!(v && v.classList.contains('on')), cam: camNow() }); });
  const loop = () => { if (!rec.on) return; const v = veilEl(), pr = padRoot(); rec.frames.push({ t: performance.now(), flying: tour.flying, padHidden: window.__pad ? window.__pad.hidden : null, padOp: pr ? op(pr) : null, veil: op(v) }); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  const veil = ctx.veil, innerCut = veil && veil.cut;
  if (veil) veil.cut = (fn) => { rec.cuts.push({ t: performance.now(), pending: veil.pending }); return innerCut(fn); };
  const innerSkip = tour.skip; tour.skip = function (cut) { rec.skips++; return innerSkip.call(this, cut); };
  const innerStop = tour.stop; tour.stop = function () { rec.stops++; return innerStop.call(this); };
  rec.arm = () => { rec.armed = true; rec.ts0 = null; return true; };
  rec.stop = () => { rec.on = false; for (const t of types) window.removeEventListener(t, mark, { capture: true }); off(); if (veil) veil.cut = innerCut; tour.skip = innerSkip; tour.stop = innerStop; };
  return true;
})()`;
/** Wait in the page (frame-fine) until a condition holds; resolves false after ms. */
const WAIT = (cond, ms = 20000) => `new Promise((res) => { const t0 = performance.now(); const t = setInterval(() => { let ok = false; try { ok = !!(${cond}); } catch (e) { ok = false; } if (ok || performance.now() - t0 > ${ms}) { clearInterval(t); res(ok); } }, 16); })`;
/** The camera's distance to a stop's drone framing. */
const REST = (id) => `(() => { const s = window.__life.tour.stops.find((x) => x.id === '${id}').drone.pos, p = window.__ctx.camera.position; return Math.hypot(p.x - s[0], p.y - s[1], p.z - s[2]); })()`;
/** Back to the start: no flight, no auto tour, the hero framing, the veil at rest. */
const RESET = `(() => { const T = window.__life.tour; T.stop(); T.jumpTo('hero'); return true; })()`;

/** What the recorder saw, as numbers. t0 is the input event's own time. */
const analyse = (rec) => {
  const t0 = rec.ts0, after = (xs) => xs.filter((x) => x.t >= t0 - 1);
  const end = rec.flights.find((f) => f.t >= t0 && !f.flying), padOn = rec.frames.find((f) => f.t >= t0 && f.padHidden === false);
  const gaps = rec.frames.slice(1).map((f, i) => f.t - rec.frames[i].t).sort((a, b) => a - b);
  const r1 = (x) => (x == null ? null : +x.toFixed(1));
  return {
    ev: rec.ev, flyingAtT0: rec.flyingAtT0, padHiddenAtT0: rec.padHiddenAtT0, inputLagMs: r1(rec.tHandler - t0),
    endMs: end ? r1(end.t - t0) : null, handlerToEndMs: end ? r1(end.t - rec.tHandler) : null, framesToEnd: end ? rec.frames.filter((f) => f.t > rec.tHandler && f.t <= end.t).length : null,
    padMs: padOn ? r1(padOn.t - t0) : null, padAfterEndMs: padOn && end ? r1(padOn.t - end.t) : null, veilAtEnd: end ? +end.veil.toFixed(2) : null, veilOnAtEnd: end ? end.veilOn : null,
    veilPeak: +Math.max(0, ...after(rec.frames).map((f) => f.veil)).toFixed(2), cuts: rec.cuts.length, cutVsHandlerMs: rec.cuts[0] ? r1(rec.cuts[0].t - rec.tHandler) : null, skips: rec.skips, stops: rec.stops,
    frameMedianMs: r1(gaps[Math.floor(gaps.length / 2)] ?? 0), frameP90Ms: r1(gaps[Math.floor(gaps.length * 0.9)] ?? 0), frames: rec.frames.length,
  };
};
/** A generous wall-clock sanity bound for a loaded machine: a second and a half (the exact numbers are printed, and pinned at 60 fps in test/veil.test.js). */
const SANITY_MS = 1500;

// (not gated: it needs no browser) the scripts sent into the page are valid JavaScript, so a typo cannot cost a hold of the Chrome lock
describe("the in-page scripts of this file parse", () => {
  test("RECORDER, WAIT, REST and RESET are valid expressions", () => {
    for (const [name, src] of [["RECORDER", RECORDER], ["WAIT", WAIT("window.__t1", 1000)], ["WAIT + REST", WAIT(REST("ukimido") + " < 100 && window.__life.tour.flying")], ["REST", REST("kanae")], ["RESET", RESET]]) {
      expect(() => new Function("return " + src), name).not.toThrow();
    }
  });
});

// (not gated) a dry run of the instrument itself: the recorder and analyse() against a fake page made of the real tour, the real veil and a mini DOM, on real timers
describe("the recorder works (a dry run against a fake page)", () => {
  test("a far flight ended by a key is read back as one cut, one skip, a flight that ends inside 0.3 s, and a veil that went up", async () => {
    const THREE = await import("three"), L = await import("../src/anime/world/layout.js"), { createTour } = await import("../src/anime/world/life/tour.js");
    const { createVeil, interruptFlight } = await import("../src/anime/ui/veil.js"), { makeDom } = await import("./lib/mini-dom.js");
    const dom = makeDom(), camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 30000);
    const tour = createTour({ L, scene: new THREE.Scene(), camera, sunDir: new THREE.Vector3(0, 1, 0), services: {}, quality: { name: "high" } });
    const ls = new Map(), win = { addEventListener: (t, f) => { (ls.get(t) || ls.set(t, []).get(t)).push(f); }, removeEventListener: (t, f) => { ls.set(t, (ls.get(t) || []).filter((x) => x !== f)); }, __life: { tour }, __ctx: { camera, veil: null }, __pad: { hidden: true } };
    win.__ctx.veil = createVeil({ doc: dom.document, reducedMotion: () => false });
    const saved = Object.fromEntries(["window", "document", "getComputedStyle", "requestAnimationFrame"].map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)])), put = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
    put("window", win); put("document", dom.document); put("getComputedStyle", (el) => ({ opacity: el.classList.contains("on") ? "1" : "0", transitionDuration: "0.1s, 0s" })); put("requestAnimationFrame", (f) => setTimeout(() => f(performance.now()), 16));
    const tick = setInterval(() => tour.update(1 / 60), 1000 / 60);
    try {
      tour.jumpTo("hero"); expect(eval(RECORDER)).toBe(true);
      tour.flyTo("kanae"); await sleep(300); win.__rec.arm();
      const ev = { type: "keydown", code: "KeyW", timeStamp: performance.now() }; for (const f of ls.get("keydown") || []) f(ev);   // (what the browser does: the recorder's listener sees the key)
      interruptFlight(tour, win.__ctx.veil);
      setTimeout(() => dom.fire(dom.document.getElementById("klc-veil"), "transitionend", { propertyName: "opacity" }), 105);   // (the browser: the fade-in is done 105 ms later)
      await sleep(700);
      const rec = JSON.parse(JSON.stringify(win.__rec)), a = analyse(rec); win.__rec.stop();
      expect(a.ev).toBe("keydown:KeyW"); expect(a.flyingAtT0).toBe(true); expect(a.cuts).toBe(1); expect(a.skips).toBe(1); expect(a.stops).toBe(0);
      expect(a.endMs).toBeGreaterThan(100); expect(a.endMs).toBeLessThan(300); expect(a.veilPeak).toBe(1); expect(Math.abs(a.cutVsHandlerMs)).toBeLessThan(30);
      expect(tour.flying).toBe(false); expect(a.frames).toBeGreaterThan(10); expect(a.frameMedianMs).toBeGreaterThan(0);
      expect(typeof win.__ctx.veil.cut).toBe("function"); expect(tour.skip.name).not.toBe("");   // (restored by stop())
      expect(ls.get("keydown")).toEqual([]);   // the listeners are gone
    } finally { clearInterval(tick); for (const k of Object.keys(saved)) { if (saved[k]) Object.defineProperty(globalThis, k, saved[k]); else delete globalThis[k]; } }
  });
});

d("row 4: a key, a press or a touch ends a flight (real Chrome)", () => {
  let browser, srv, watchdog;
  beforeAll(async () => {
    watchdog = setTimeout(() => { console.error("A2-METRICS " + JSON.stringify(M)); console.error(`ui-a2 e2e: still running after ${WATCHDOG_MS / 60000} minutes: killing the browser so the Chrome lock is released`); process.exit(1); }, WATCHDOG_MS);
    ({ srv } = await buildAndServe(PORT));
    browser = await launch({ quiet: true });
  }, 330000);
  afterAll(async () => { clearTimeout(watchdog); console.log("A2-METRICS " + JSON.stringify(M)); await browser?.close(); srv?.stop(); }, 60000);

  d("desktop 1440x900, real keys and mouse", () => {
    let page;
    const key = (type, code, k, vk, extra = {}) => page.S("Input.dispatchKeyEvent", { type, key: k, code, windowsVirtualKeyCode: vk, ...extra });
    const press = async (code, k, vk) => { await key("keyDown", code, k, vk); await sleep(30); await key("keyUp", code, k, vk); };
    const mouse = (type, x, y) => page.S("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });
    /** Start a flight, record it, wait `ms`, run the gesture, give the page time to finish, analyse. */
    const run = async ({ to, from = "hero", wait = 600, until = null, gesture }) => {
      await page.eval(RESET); await sleep(500);
      await page.eval(`window.__life.tour.jumpTo('${from}'); 0`); await sleep(200);
      await page.eval(RECORDER);
      await page.eval(`window.__life.tour.flyTo('${to}'); window.__rec.t_start = performance.now(); 0`);
      if (until) expect(await page.eval(WAIT(until))).toBe(true); else await sleep(wait);
      await page.eval("window.__rec.arm()");
      await gesture();
      await sleep(1400);
      const rec = await page.eval("JSON.parse(JSON.stringify(window.__rec))");
      const rest = await page.eval(REST(to));
      const flying = await page.eval("window.__life.tour.flying");
      await page.eval("window.__rec.stop(); 0");
      return { a: analyse(rec), rest: +rest.toFixed(3), flying, rec };
    };
    beforeAll(async () => {
      page = guard(await browser.page({ width: 1440, height: 900, dpr: 1 }));
      await page.goto(`${srv.url}index.html?q=low`);
      await page.waitFor("document.body.classList.contains('loaded')", { timeout: 280000 });
      await page.eval("document.getElementById('go').click()");
      await page.waitFor("document.body.classList.contains('playing')", { timeout: 20000 });
      await page.waitFor("window.__life && window.__life.hud && window.__life.tour && window.__ctx.veil", { timeout: 20000 });
      await sleep(2500);
    }, 330000);
    afterAll(async () => { await page?.goto("about:blank").catch(() => {}); }, 30000);

    T("the HUD made ctx.veil, and nothing of it is in the page until the first cut", async () => {
      const r = await page.eval(`({ veil: typeof window.__ctx.veil.cut, pending: window.__ctx.veil.pending, layer: !!document.getElementById('klc-veil'), style: !!document.getElementById('klc-veil-css'), flying: window.__life.tour.flying, skip: typeof window.__life.tour.skip })`);
      metric("desktop.veil", r);
      expect(r).toEqual({ veil: "function", pending: false, layer: false, style: false, flying: false, skip: "function" });
    });

    T("baseline: an uninterrupted place pick runs its whole 1.8 to 4.5 s of the camera's own clock (what a touch used to wait out): hero to かなえ大橋 and hero to 浮見堂", async () => {
      const out = {};
      for (const to of ["kanae", "ukimido"]) {
        await page.eval(RESET); await sleep(500);
        out[to] = await page.eval(`(async () => { const T = window.__life.tour; T.flyTo('${to}'); const t0 = performance.now(); const ok = await ${WAIT("!window.__life.tour.flying", 30000)}; return { ms: Math.round(performance.now() - t0), ok }; })()`);
      }
      metric("desktop.uninterruptedFlightMs", out);   // (wall clock: the camera's clock steps at most 100 ms a frame, so a page at 6 fps takes longer than 4.5 s)
      expect(out.kanae.ok).toBe(true); expect(out.ukimido.ok).toBe(true);
      expect(out.kanae.ms).toBeGreaterThan(3500); expect(out.ukimido.ms).toBeGreaterThan(1500); expect(out.kanae.ms).toBeGreaterThan(out.ukimido.ms);
    });

    T("far (hero to かなえ大橋, 0.6 s in): a W key ends the flight inside 0.3 s through the veil's dip, exactly on the framing, one cut, one skip, no stop()", async () => {
      const r = await run({ to: "kanae", wait: 600, gesture: () => press("KeyW", "w", 87) });
      metric("desktop.farKey", r.a);
      expect(r.a.flyingAtT0).toBe(true);
      expect(r.a.ev).toBe("keydown:KeyW");
      expect(r.a.cuts).toBe(1); expect(r.a.skips).toBe(1); expect(r.a.stops).toBe(0);
      expect(r.a.endMs).not.toBeNull(); expect(r.a.endMs).toBeGreaterThan(90); expect(r.a.endMs).toBeLessThan(SANITY_MS);
      expect(Math.abs(r.a.cutVsHandlerMs)).toBeLessThan(30);   // the cut was requested in the same dispatch as the key; the jump itself waited for the fade
      expect(r.a.veilAtEnd).toBeGreaterThanOrEqual(0.9);       // and ran with the veil drawn opaque (a timer set to the fade's length ran it at 0 in four of six dips on this machine)
      expect(r.flying).toBe(false); expect(r.rest).toBeLessThan(0.5);
      expect(r.a.veilPeak).toBeGreaterThan(0.9);   // the screen did go to the veil's colour
    });

    T("near (hero to 浮見堂, 100 m from the end): a Space press settles in about a quarter of a second, no veil, one skip, exactly on the framing", async () => {
      const r = await run({ to: "ukimido", until: REST("ukimido") + " < 100 && window.__life.tour.flying", gesture: () => press("Space", " ", 32) });
      metric("desktop.nearKey", r.a);
      expect(r.a.flyingAtT0).toBe(true);
      expect(r.a.cuts).toBe(0); expect(r.a.skips).toBe(1); expect(r.a.stops).toBe(0);
      expect(r.a.veilPeak).toBe(0);   // never dipped
      expect(r.a.endMs).not.toBeNull(); expect(r.a.endMs).toBeLessThan(SANITY_MS);
      expect(r.a.framesToEnd).toBeLessThanOrEqual(6);   // a quarter of a second of the camera's clock, which steps at most 100 ms a frame: three frames, and a couple of spare
      expect(r.flying).toBe(false); expect(r.rest).toBeLessThan(0.5);
    });

    T("a mouse press on the canvas ends a far flight the same way (pointerdown on #scene)", async () => {
      const r = await run({ to: "kanae", wait: 600, gesture: async () => { await page.S("Input.dispatchMouseEvent", { type: "mouseMoved", x: 720, y: 420 }); await mouse("mousePressed", 720, 420); await sleep(50); await mouse("mouseReleased", 720, 420); } });
      metric("desktop.farMouse", r.a);
      expect(r.a.flyingAtT0).toBe(true); expect(r.a.ev).toMatch(/^pointerdown:mouse/);
      expect(r.a.cuts).toBe(1); expect(r.a.skips).toBe(1); expect(r.a.stops).toBe(0);
      expect(r.a.endMs).toBeLessThan(SANITY_MS); expect(r.a.veilAtEnd).toBeGreaterThanOrEqual(0.9); expect(r.flying).toBe(false); expect(r.rest).toBeLessThan(0.5);
    });

    T("a held key is one press: a key-down and five auto-repeats call skip once, and one cut", async () => {
      const r = await run({ to: "kanae", wait: 600, gesture: async () => { await key("keyDown", "KeyD", "d", 68); for (let i = 0; i < 5; i++) { await sleep(25); await key("keyDown", "KeyD", "d", 68, { autoRepeat: true }); } await key("keyUp", "KeyD", "d", 68); } });
      metric("desktop.heldKey", r.a);
      expect(r.a.skips).toBe(1); expect(r.a.cuts).toBe(1); expect(r.a.veilAtEnd).toBeGreaterThanOrEqual(0.9); expect(r.flying).toBe(false);
      expect(r.rest).toBeLessThan(15);   // not 0.5: the key is still down when the jump lands (3.7 m in the run that found it), so the player strafes on from the framing, which is what holding D means
    });

    T("two roads, one gesture: a key and a press inside the dip cut once, and the jump runs once", async () => {
      const r = await run({ to: "kanae", wait: 600, gesture: async () => { await press("KeyW", "w", 87); await mouse("mousePressed", 720, 420); await mouse("mouseReleased", 720, 420); await press("Escape", "Escape", 27); } });
      metric("desktop.twoRoads", r.a);
      expect(r.a.cuts).toBe(1); expect(r.a.skips).toBe(1); expect(r.a.veilAtEnd).toBeGreaterThanOrEqual(0.9); expect(r.flying).toBe(false); expect(r.rest).toBeLessThan(0.5);
    });

    T("what must not end a flight: the digit keys retarget it (stop, then fly), a press on a HUD button leaves it, the other keys leave it, and a flight to a place keeps going", async () => {
      await page.eval(RESET); await sleep(500); await page.eval(RECORDER);
      await page.eval("window.__life.tour.flyTo('kanae'); 0"); await sleep(500);
      await page.eval("window.__rec.arm()");
      // a press on the 昼 preset (a HUD button, z-index 4): the flight is still flying. (A click on the canvas in an earlier test took the pointer lock, as main.js asks it to; while it is held every
      // mouse event is the canvas's, wherever the pointer is, so the lock is released first: it is what a visitor does, with Esc, before clicking a button.)
      await page.eval("document.exitPointerLock && document.exitPointerLock(); 0"); await sleep(400);
      const lock = await page.eval("document.pointerLockElement ? document.pointerLockElement.id : null");
      const c = await center(page, '#klc-ui [data-act="preset"][data-id="hiru"]'); expect(c && c.w > 1).toBeTruthy();
      const hit = await page.eval(`(() => { const e = document.elementFromPoint(${c.x}, ${c.y}); return e ? (e.id || e.tagName) + '.' + String(e.className).slice(0, 30) + ' ' + (e.closest('[data-act]') ? e.closest('[data-act]').dataset.act : '') : null; })()`);
      await page.S("Input.dispatchMouseEvent", { type: "mouseMoved", x: c.x, y: c.y }); await mouse("mousePressed", c.x, c.y); await sleep(40); await mouse("mouseReleased", c.x, c.y); await sleep(200);
      const afterReal = await page.eval("({ flying: window.__life.tour.flying, skips: window.__rec.skips })");
      // the same press as an event whose target is the button (what the HUD's listener sees whatever the pointer's state): it must not end the flight either
      await page.eval(`document.querySelector('#klc-ui [data-act="preset"][data-id="hiru"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'mouse', button: 0 })); 0`); await sleep(100);
      await press("KeyT", "t", 84); await press("KeyK", "k", 75); await sleep(200);   // the time preset and the season keys
      const mid = await page.eval("({ flying: window.__life.tour.flying, skips: window.__rec.skips, stops: window.__rec.stops })");
      await page.eval("window.__life.time.set('yugata'); window.__season('autumn'); 0");
      // the digit: Digit4 is the fourth stop; it retargets the flight (stop(), then flyTo())
      const id = await page.eval("window.__life.tour.stops[3].id");
      await press("Digit4", "4", 52); await sleep(300);
      const after = await page.eval("({ current: window.__life.tour.current, flying: window.__life.tour.flying, skips: window.__rec.skips, stops: window.__rec.stops, cuts: window.__rec.cuts.length })");
      await page.eval(WAIT("!window.__life.tour.flying", 12000));
      const rest = await page.eval(REST(id));
      await page.eval("window.__rec.stop(); 0");
      metric("desktop.notInterrupts", { lock, hit, afterReal, mid, after, id, restAtEnd: +rest.toFixed(3) });
      expect(mid).toEqual({ flying: true, skips: 0, stops: 0 });   // (the synthetic press and the keys, always)
      if (lock === null && /data-act|preset/.test(hit || "")) expect(afterReal).toEqual({ flying: true, skips: 0 });   // (the real press, when nothing held the pointer or sat over the button)
      expect(after.current).toBe(id); expect(after.flying).toBe(true); expect(after.skips).toBe(0); expect(after.cuts).toBe(0);
      expect(after.stops).toBe(1);   // the digit's own stop() before its flyTo (it carries the speed, as it always did)
      expect(rest).toBeLessThan(0.5);   // and it arrived at the new place on its own
    });

    T("the auto tour: W stops it (stop(), as before) and is not skipped; a press on the canvas leaves it playing", async () => {
      await page.eval(RESET); await sleep(500); await page.eval(RECORDER);
      await page.eval("window.__life.tour.play(); 0"); await sleep(1200);
      await page.eval("window.__rec.arm()");
      await mouse("mousePressed", 720, 420); await sleep(40); await mouse("mouseReleased", 720, 420); await sleep(400);
      const afterPress = await page.eval("({ playing: window.__life.tour.playing, flying: window.__life.tour.flying, skips: window.__rec.skips, stops: window.__rec.stops, pressed: document.querySelector('#klc-ui [data-act=\"auto\"]').getAttribute('aria-pressed') })");
      await press("KeyW", "w", 87); await sleep(400);
      const afterKey = await page.eval("({ playing: window.__life.tour.playing, skips: window.__rec.skips, stops: window.__rec.stops, pressed: document.querySelector('#klc-ui [data-act=\"auto\"]').getAttribute('aria-pressed') })");
      await page.eval("window.__rec.stop(); 0");
      metric("desktop.autoTour", { afterPress, afterKey });
      expect(afterPress).toEqual({ playing: true, flying: true, skips: 0, stops: 0, pressed: "true" });
      expect(afterKey).toEqual({ playing: false, skips: 0, stops: 1, pressed: "false" });
    });

    T("the veil: not touchable, under the HUD, over the place labels, dark at night and light at noon (the scene's fog colour), gone from the paint at rest", async () => {
      const out = {};
      for (const preset of ["yoru", "hiru", "yugata"]) {
        await page.eval(`window.__lifeSet('${preset}'); 0`); await sleep(1200);
        const r = await run({ to: "kanae", wait: 500, gesture: () => press("KeyW", "w", 87) });
        const v = await page.eval(`(() => { const e = document.getElementById('klc-veil'), cs = getComputedStyle(e), fog = '#' + window.__ctx.scene.fog.color.getHexString(), labels = document.getElementById('klc-labels'), ui = document.getElementById('klc-ui');
          const rgb = cs.backgroundColor.match(/\\d+/g).map(Number); const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
          return { bg: cs.backgroundColor, fog, lum: +lum.toFixed(2), z: cs.zIndex, uiZ: getComputedStyle(ui).zIndex, pe: cs.pointerEvents, vis: cs.visibility, op: cs.opacity, pos: cs.position, aria: e.getAttribute('aria-hidden'), lastChild: document.body.lastChild === e, afterLabels: labels ? !!(labels.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING) : null, cls: e.className }; })()`);
        out[preset] = { ...v, cut: r.a.cuts, endMs: r.a.endMs };
        if (SHOTS) {
          await page.eval(RESET); await sleep(300);
          await page.eval(`(() => { const e = document.getElementById('klc-veil'); e.style.transition = 'none'; e.style.opacity = '1'; e.style.visibility = 'visible'; return 0; })()`); await sleep(400);
          mkdirSync(SHOTS, { recursive: true }); await page.shot(join(SHOTS, `veil-${preset}-1440x900.png`));
          await page.eval(`(() => { const e = document.getElementById('klc-veil'); e.style.transition = ''; e.style.opacity = ''; e.style.visibility = ''; return 0; })()`);
        }
      }
      metric("desktop.veilLook", out);
      const hex = (rgb) => "#" + rgb.match(/\d+/g).map((n) => Number(n).toString(16).padStart(2, "0")).join("");
      for (const preset of ["yoru", "hiru", "yugata"]) {
        const v = out[preset];
        expect([preset, v.cut]).toEqual([preset, 1]);
        expect([preset, v.z, v.pe, v.pos, v.aria, v.vis, v.op]).toEqual([preset, "3", "none", "fixed", "true", "hidden", "0"]);
        expect(Number(v.uiZ)).toBeGreaterThan(Number(v.z));   // the HUD stays over the dip
        expect([preset, v.afterLabels !== false]).toEqual([preset, true]);   // over the place labels that share its z-index
        expect(hex(v.bg)).toMatch(/^#[0-9a-f]{6}$/);
        const chan = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
        expect([preset, Math.max(...chan(hex(v.bg)).map((c, i) => Math.abs(c - chan(v.fog)[i]))) <= 8]).toEqual([preset, true]);   // the dip's colour is the scene's fog colour
      }
      expect(out.yoru.lum).toBeLessThan(0.35); expect(out.hiru.lum).toBeGreaterThan(0.7);   // night is dark, noon is light: the dip never flashes white at night
      expect(out.yoru.lum).toBeLessThan(out.yugata.lum);
      await page.eval("window.__lifeSet('yugata'); 0");
    });

    T("prefers-reduced-motion: the dip is an 80 ms crossfade (not the instant flash the page's blanket no-transition rule would make of it), and the flight still ends through it", async () => {
      await page.S("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
      try {
        expect(await page.eval("matchMedia('(prefers-reduced-motion: reduce)').matches")).toBe(true);
        await page.eval(RESET); await sleep(400); await page.eval(RECORDER);
        await page.eval("window.__life.tour.flyTo('kanae'); window.__seen = []; 0"); await sleep(500);
        await page.eval("window.__rec.arm(); window.__seenT = setInterval(() => { const e = document.getElementById('klc-veil'); if (e && e.classList.contains('on')) window.__seen.push(getComputedStyle(e).transitionDuration); }, 4); 0");
        await press("KeyW", "w", 87); await sleep(1200);
        await page.eval("clearInterval(window.__seenT); 0");
        const rec = await page.eval("JSON.parse(JSON.stringify(window.__rec))"), seen = await page.eval("window.__seen");
        const rest = await page.eval(REST("kanae"));
        await page.eval("window.__rec.stop(); 0");
        const a = analyse(rec);
        metric("desktop.reducedMotion", { ...a, transitionDurations: [...new Set(seen)], rest: +rest.toFixed(3) });
        expect(a.cuts).toBe(1); expect(a.endMs).toBeLessThan(SANITY_MS); expect(a.veilAtEnd).toBeGreaterThanOrEqual(0.9); expect(rest).toBeLessThan(0.5);
        expect(seen.length).toBeGreaterThan(0); expect(new Set(seen)).toEqual(new Set(["0.08s, 0s"]));   // (index.html's blanket "* { transition: none !important }" is beaten by the layer's own !important: it read 0s before)
      } finally { await page.S("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] }); }
    });

    T("no page errors", async () => { expect(page.errors().filter((e) => !/api\/live/.test(e.text))).toEqual([]); });
  });

  d("phone 390x844, real touches", () => {
    let page, f;
    const tap = async (sel, wait = 450) => { const c = await center(page, sel); expect(c && c.w > 1).toBeTruthy(); await f.tap(c.x, c.y); await sleep(wait); return c; };
    /** Pick a place the way a visitor does: the pill opens the places sheet, the stop's button is scrolled into view and tapped. The sheet folds, the flight starts. */
    const tapPlace = async (id) => {
      await tap('#klc-ui .pbar button[data-sheet="places"]');
      await page.eval(`document.querySelector('#klc-places [data-act="stop"][data-id="${id}"]').scrollIntoView({ inline: 'center', block: 'nearest' }); 0`); await sleep(350);
      await tap(`#klc-places [data-act="stop"][data-id="${id}"]`, 100);
      expect(await page.eval("window.__life.tour.flying")).toBe(true);
    };
    const run = async ({ to, from = "hero", wait = 600, until = null, gesture, pick = tapPlace }) => {
      await page.eval(RESET); await sleep(900);
      await page.eval(`window.__life.tour.jumpTo('${from}'); 0`); await sleep(500);
      await page.waitFor("!window.__pad.hidden", { timeout: 15000 });
      await pick(to);
      await page.eval(RECORDER);   // (after the pick: the HUD's own stop() before its flyTo is not the interrupt's)
      if (until) expect(await page.eval(WAIT(until))).toBe(true); else await sleep(wait);
      await page.eval("window.__rec.arm()");
      await gesture();
      await sleep(1500);
      const rec = await page.eval("JSON.parse(JSON.stringify(window.__rec))");
      const rest = await page.eval(REST(to)), flying = await page.eval("window.__life.tour.flying");
      const pad = await page.eval(`(() => { const p = window.__pad, r = document.getElementById('klc-pad'), cs = getComputedStyle(r); return { hidden: p.hidden, data: r.dataset.hidden, vis: cs.visibility, op: +cs.opacity, stick: p.stickActive }; })()`);
      await page.eval("window.__rec.stop(); 0");
      return { a: analyse(rec), rest: +rest.toFixed(3), flying, pad, rec };
    };
    beforeAll(async () => {
      page = guard(await phonePage(browser, PORTRAIT));
      f = await enterTown(page, `${srv.url}index.html`);
      await page.waitFor("window.__life && window.__life.hud && window.__life.tour && window.__ctx.veil && window.__pad", { timeout: 60000 });
      await sleep(1500);
      await page.waitFor("!window.__pad.hidden", { timeout: 20000 });
      await page.waitFor("!document.querySelector('#klc-pad .coach').hidden", { timeout: 6000 }).catch(() => {});   // (the first-run coach mark: it would sit over the middle of the screen)
      await page.eval("window.__pad.dismissCoach()"); await sleep(800);
    }, 330000);
    afterAll(async () => { await f?.release?.().catch(() => {}); }, 30000);

    T("it is a phone with the pad on: touch emulation, the pad is active and visible before any flight", async () => {
      const r = await page.eval(`({ coarse: matchMedia('(pointer: coarse)').matches, active: window.__pad.active, hidden: window.__pad.hidden, tier: window.__ctx.quality.tier, veil: typeof window.__ctx.veil.cut })`);
      metric("phone.setup", r);
      expect(r).toEqual({ coarse: true, active: true, hidden: false, tier: "phone", veil: "function" });
    });

    T("baseline: nothing but the flight ends it, so a touch used to wait out the whole of it (hero to かなえ大橋 by a tap on the place, the pad hidden throughout)", async () => {
      await page.eval(RESET); await sleep(900);
      await tapPlace("kanae");
      const r = await page.eval(`(async () => { const t0 = performance.now(), hiddenAtStart = window.__pad.hidden; const ok = await ${WAIT("!window.__life.tour.flying", 30000)}; return { ms: Math.round(performance.now() - t0), ok, hiddenAtStart }; })()`);
      metric("phone.uninterruptedFlightMs", r);
      expect(r.ok).toBe(true); expect(r.hiddenAtStart).toBe(true); expect(r.ms).toBeGreaterThan(2500);
    });

    T("far: tap a place, touch the canvas 0.6 s in: the flight is over inside 0.3 s (the veil's dip, one cut, one skip, no stop()), the pad is back and visible, exactly on the framing", async () => {
      const r = await run({ to: "kanae", wait: 600, gesture: () => f.tap(195, 420, 70) });
      metric("phone.farTouch", { ...r.a, pad: r.pad, rest: r.rest });
      expect(r.a.flyingAtT0).toBe(true); expect(r.a.padHiddenAtT0).toBe(true); expect(r.a.ev).toMatch(/^(pointerdown:touch|touchstart:)$/);   // (Chrome fires the pointer event first)
      expect(r.a.cuts).toBe(1); expect(r.a.skips).toBe(1); expect(r.a.stops).toBe(0);
      expect(r.a.endMs).not.toBeNull(); expect(r.a.endMs).toBeGreaterThan(90); expect(r.a.endMs).toBeLessThan(SANITY_MS);
      expect(r.a.veilPeak).toBeGreaterThan(0.9); expect(r.a.veilAtEnd).toBeGreaterThanOrEqual(0.9);   // the jump ran behind a veil that was drawn opaque
      expect(r.flying).toBe(false); expect(r.rest).toBeLessThan(0.5);
      expect(r.a.padMs).not.toBeNull(); expect(r.a.padAfterEndMs).toBeLessThan(3 * Math.max(r.a.frameP90Ms, 50) + 60);   // the pad is back within a few frames of the flight's end
      expect(r.pad).toMatchObject({ hidden: false, data: "0", vis: "visible", stick: false });   // (this touch was spent on the interrupt: no stick, no look)
      expect(r.pad.op).toBeGreaterThan(0.9);
    });

    T("the pad works after it: a stick drag moves the camera (fly mode after a flight)", async () => {
      const a = await gameState(page);
      await f.down1(1, 90, 560); await f.drag(1, 90, 490, 6); await sleep(1200);
      const b = await gameState(page); await f.up(1); await sleep(500);
      const dist = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      metric("phone.stickAfter", { dist: +dist.toFixed(1), fly: b.fly, stickActive: b.stickActive });
      expect(dist).toBeGreaterThan(3);
    });

    T("near: a flight to 浮見堂 touched with 100 m to go settles in about a quarter of a second, no veil, one skip, and the pad is back", async () => {
      const r = await run({ to: "ukimido", until: REST("ukimido") + " < 100 && window.__life.tour.flying", gesture: () => f.tap(195, 420, 70) });
      metric("phone.nearTouch", { ...r.a, pad: r.pad, rest: r.rest });
      expect(r.a.flyingAtT0).toBe(true);
      expect(r.a.cuts).toBe(0); expect(r.a.skips).toBe(1); expect(r.a.stops).toBe(0); expect(r.a.veilPeak).toBe(0);
      expect(r.a.endMs).not.toBeNull(); expect(r.a.endMs).toBeLessThan(SANITY_MS); expect(r.a.framesToEnd).toBeLessThanOrEqual(6);
      expect(r.flying).toBe(false); expect(r.rest).toBeLessThan(0.5);
      expect(r.pad).toMatchObject({ hidden: false, data: "0", vis: "visible" });
    });

    T("two touches inside the dip are one gesture: one cut, one skip, and the jump runs once", async () => {
      const r = await run({ to: "kanae", wait: 600, gesture: async () => { await f.tap(195, 420, 20); await sleep(25); await f.tap(210, 440, 20); await sleep(25); await f.tap(180, 400, 20); } });
      metric("phone.threeTouches", { ...r.a, rest: r.rest });
      expect(r.a.cuts).toBe(1); expect(r.a.skips).toBe(1); expect(r.a.veilAtEnd).toBeGreaterThanOrEqual(0.9); expect(r.flying).toBe(false); expect(r.rest).toBeLessThan(0.5);
    });

    T("a touch on a HUD button does not end a flight (the time pill opens its sheet, the flight flies on and arrives by itself); the sheet closes again", async () => {
      await page.eval(RESET); await sleep(900);
      await tapPlace("kanae"); await page.eval(RECORDER); await sleep(400); await page.eval("window.__rec.arm()");
      await tap('#klc-ui .pbar button[data-sheet="time"]', 300);
      const mid = await page.eval("({ flying: window.__life.tour.flying, skips: window.__rec.skips, cuts: window.__rec.cuts.length, sheet: document.getElementById('klc-ui').dataset.sheet })");
      await tap('#klc-ui .pbar button[data-sheet="time"]', 200);   // close it
      await page.eval(WAIT("!window.__life.tour.flying", 12000));
      const rest = await page.eval(REST("kanae"));
      await page.eval("window.__rec.stop(); 0");
      metric("phone.hudTouch", { mid, rest: +rest.toFixed(3) });
      expect(mid).toEqual({ flying: true, skips: 0, cuts: 0, sheet: "time" });
      expect(rest).toBeLessThan(0.5);
    });

    T("the auto tour is not ended by a touch (it has its own pause button): it keeps playing, nothing is skipped", async () => {
      await page.eval(RESET); await sleep(900); await page.eval(RECORDER);
      await page.eval("window.__life.tour.play(); 0"); await sleep(1500); await page.eval("window.__rec.arm()");
      await f.tap(195, 420, 70); await sleep(500);
      const r = await page.eval("({ playing: window.__life.tour.playing, flying: window.__life.tour.flying, skips: window.__rec.skips, stops: window.__rec.stops, cuts: window.__rec.cuts.length, padHidden: window.__pad.hidden })");
      await page.eval("window.__rec.stop(); window.__life.tour.stop(); 0");
      metric("phone.autoTour", r);
      expect(r).toEqual({ playing: true, flying: true, skips: 0, stops: 0, cuts: 0, padHidden: true });
    });

    T("no page errors", async () => { expect(page.errors().filter((e) => !/api\/live/.test(e.text))).toEqual([]); });
  });
});
