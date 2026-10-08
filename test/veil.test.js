// [ui-a2] Row 4, the veil and the decision. ui/veil.js: a dip to the sky's colour that hides one camera jump (a manual clock, a mini DOM), and interruptFlight, the one rule for ending a
// flight early, against the real tour (life/tour.js) and the real veil: near the destination a quarter-second glide, far from it one dip, and a second request for the same gesture is
// the first one again (the cut is made once). The HUD's keys and presses: test/flight-interrupt.test.js; the pad's touch: test/pad-interrupt.test.js; real touches on an emulated phone:
// test/ui-a2.e2e.test.js.
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as THREE from "three";
import * as L from "../src/anime/world/layout.js";
import { createTour } from "../src/anime/world/life/tour.js";
import { CSS as HUD_CSS } from "../src/anime/ui/style.js";
import { CSS as PAD_CSS } from "../src/anime/ui/touchpad-style.js";
import { createVeil, interruptFlight, skyColor, DIP, DIP_REDUCED, VEIL_CSS, VEIL_ID, VEIL_STYLE_ID, VEIL_FALLBACK } from "../src/anime/ui/veil.js";
import { makeDom } from "./lib/mini-dom.js";
import { manualClock } from "./lib/manual-clock.js";

const ROOT = resolve(import.meta.dir, "..");
const read = (p) => readFileSync(resolve(ROOT, p), "utf8");
const DT = 1 / 60;
const clock = manualClock;

/** A veil on a mini DOM with the manual clock. */
function veilRig(o = {}) {
  const dom = makeDom(), clk = clock();
  const veil = createVeil({ doc: dom.document, setTimeout: clk.setTimeout, clearTimeout: clk.clearTimeout, raf: clk.raf, reducedMotion: () => false, ...o });
  const layer = () => dom.document.getElementById(VEIL_ID);
  /** What the browser does when the layer's fade-in is done: a transitionend event for opacity on the layer. */
  const endFade = (propertyName = "opacity") => dom.fire(layer(), "transitionend", { propertyName });
  return { dom, clk, veil, body: dom.document.body, layer, endFade };
}

describe("the veil (ui/veil.js): a dip that hides one jump", () => {
  test("it builds nothing until the first cut (no layer, no style), and a cut builds both once", () => {
    const r = veilRig();
    expect(r.layer()).toBeNull(); expect(r.dom.document.getElementById(VEIL_STYLE_ID)).toBeNull(); expect(r.body.childNodes.length).toBe(0); expect(r.veil.pending).toBe(false);
    r.veil.cut(() => {});
    const layer = r.layer();
    expect(layer).not.toBeNull(); expect(layer.getAttribute("aria-hidden")).toBe("true"); expect(layer.parentNode).toBe(r.body);
    expect(r.dom.document.getElementById(VEIL_STYLE_ID).textContent).toBe(VEIL_CSS);
    r.endFade(); r.clk.advance(0); r.veil.cut(() => {});
    expect(r.dom.document.querySelectorAll("#" + VEIL_ID).length).toBe(1); expect(r.dom.document.querySelectorAll("#" + VEIL_STYLE_ID).length).toBe(1);   // the same layer, the same style
  });

  test("the jump runs once, when the browser says the fade-in is done, with the layer up; never before, however long the page takes; the layer then fades out after a frame", () => {
    const r = veilRig(); let ran = 0, upWhenRun = null;
    expect(r.veil.cut(() => { ran++; upWhenRun = r.layer().classList.contains("on"); })).toBe(true);
    expect(r.layer().classList.contains("on")).toBe(true); expect(r.veil.pending).toBe(true); expect(ran).toBe(0);
    r.clk.advance(DIP.in); expect(ran).toBe(0);   // the time of the fade has passed, and no frame has drawn it (the page hitched): the jump waits, it is not on a timer
    r.clk.advance(300); expect(ran).toBe(0); expect(r.veil.pending).toBe(true);
    r.endFade(); expect(ran).toBe(1); expect(upWhenRun).toBe(true); expect(r.veil.pending).toBe(false);
    expect(r.layer().classList.contains("on")).toBe(true);   // (still up: the new view is drawn under it first)
    r.clk.frame(); expect(r.layer().classList.contains("on")).toBe(false);   // the frame after the jump takes the layer down (the fade out is the stylesheet's)
    r.endFade(); r.clk.advance(1000); expect(ran).toBe(1);   // (the fade-out's own transitionend is nothing to run)
    expect(r.clk.timers.size).toBe(0);
  });

  test("the fallback: a page that draws no frames (a hidden tab) never says the fade is done, so the jump runs at the limit (500 ms), once", () => {
    const r = veilRig(); let ran = 0; r.veil.cut(() => ran++);
    r.clk.advance(DIP.limit - 1); expect(ran).toBe(0); r.clk.advance(1); expect(ran).toBe(1); r.endFade(); r.clk.advance(2000); expect(ran).toBe(1);
  });

  test("the fallback on a visible page whose layer is still transparent (a long stall: the frames are late, not absent) waits two more rounds of 150 ms, and the fade's own end runs the jump at once; a hidden page, or a layer that cannot say, runs at the limit", () => {
    let opacity = "0"; const mk = (o = {}) => veilRig({ computed: () => ({ opacity, transitionDuration: "0.1s, 0s" }), ...o });
    let r = mk(), ran = 0; r.veil.cut(() => ran++);
    r.clk.advance(DIP.limit); expect(ran).toBe(0); r.clk.advance(DIP.grace - 1); expect(ran).toBe(0); r.clk.advance(1); expect(ran).toBe(0);   // limit, then two more rounds
    r.clk.advance(DIP.grace); expect(ran).toBe(1);   // (the second extra round is the last: the jump runs, drawn or not)
    r = mk(); ran = 0; r.veil.cut(() => ran++); r.clk.advance(DIP.limit + 20); opacity = "1"; r.endFade(); expect(ran).toBe(1); expect(r.clk.timers.size).toBe(0);   // the fade ended during the grace
    opacity = "0"; r = mk(); ran = 0; r.dom.document.hidden = true; r.veil.cut(() => ran++); r.clk.advance(DIP.limit); expect(ran).toBe(1);   // nobody is looking: no waiting
    r = veilRig({ computed: () => null }); ran = 0; r.veil.cut(() => ran++); r.clk.advance(DIP.limit); expect(ran).toBe(1);   // cannot say: no waiting
    opacity = "0"; r = mk(); ran = 0; r.veil.cut(() => ran++); r.clk.advance(DIP.limit); opacity = "1"; r.clk.advance(DIP.grace); expect(ran).toBe(1);   // drawn by the next round: runs then
  });

  test("a transitionend that is not this dip's fade-in is ignored: another property, another element, the end of an earlier fade-out, and any end once no dip is waiting", () => {
    let opacity = "1"; const r = veilRig({ computed: () => ({ opacity, transitionDuration: "0.1s, 0s" }) }); let ran = 0;   // (opaque: so only the event's own property and target can say no)
    r.veil.cut(() => ran++);
    r.endFade("visibility"); expect(ran).toBe(0);   // the layer's other transition
    const child = r.dom.document.createElement("i"); r.layer().appendChild(child); r.dom.fire(child, "transitionend", { propertyName: "opacity" }); expect(ran).toBe(0);   // an event that bubbled up from inside
    opacity = "0.4"; r.endFade(); expect(ran).toBe(0);   // an opacity end while the layer is nowhere near opaque: an earlier fade-out arriving late
    opacity = "1"; r.endFade(); expect(ran).toBe(1);
    r.endFade(); r.clk.frame(); r.endFade(); expect(ran).toBe(1);   // with no dip waiting, nothing runs
  });

  test("a cut inside a dip rides that dip: both jumps run once, in order, when its fade-in ends, and the dip is not stretched", () => {
    const r = veilRig(); const log = [];
    r.veil.cut(() => log.push("a")); r.clk.advance(60); r.veil.cut(() => log.push("b"));
    expect(r.clk.timers.size).toBe(1);   // one timer (the fallback): one dip
    r.endFade(); expect(log).toEqual(["a", "b"]); expect(r.clk.timers.size).toBe(0);   // the fallback is cancelled with the jump
    r.clk.advance(2000); expect(log).toEqual(["a", "b"]);
  });

  test("a cut that arrives after the jump but before the fade-out frame, while the layer is still opaque: there is no fade-in to wait for, so the jump runs at once and the layer stays up", () => {
    const r = veilRig({ computed: () => ({ opacity: "1", transitionDuration: "0.1s, 0s" }) }); const log = [];
    r.veil.cut(() => log.push("a")); r.endFade(); expect(log).toEqual(["a"]); expect(r.clk.frames.length).toBe(1);   // the jump ran; the frame that takes the layer down has not
    r.veil.cut(() => log.push("b")); expect(r.veil.pending).toBe(true); expect(log).toEqual(["a"]);
    r.clk.frame();   // the queued frame runs: a new dip is under way, so the layer stays
    expect(r.layer().classList.contains("on")).toBe(true);
    r.clk.tick(0); expect(log).toEqual(["a", "b"]);   // (the next task: never inside cut() itself)
    r.clk.frame(); expect(r.layer().classList.contains("on")).toBe(false);
  });

  test("the same cut when the page cannot tell whether the layer is opaque (no computed style) waits for the fade like any other", () => {
    const r = veilRig({ computed: () => null }); const log = [];
    r.veil.cut(() => log.push("a")); r.endFade(); r.veil.cut(() => log.push("b"));
    r.clk.advance(DIP.in); expect(log).toEqual(["a"]); r.endFade(); expect(log).toEqual(["a", "b"]);
  });

  test("a layer that will not fade (a stylesheet switched transitions off): it is simply up, and the jump runs at once, in the next task", () => {
    const r = veilRig({ computed: () => ({ opacity: "1", transitionDuration: "0s" }) }); let ran = 0;
    r.veil.cut(() => ran++); expect(ran).toBe(0); expect(r.veil.pending).toBe(true); r.clk.tick(0); expect(ran).toBe(1);
  });

  test("prefers-reduced-motion: the same dip, shorter (an 80 ms crossfade), and the fallback is shorter too; read when the dip starts", () => {
    let reduced = true; const r = veilRig({ reducedMotion: () => reduced }); let ran = 0;
    r.veil.cut(() => ran++); r.clk.advance(DIP_REDUCED.limit - 1); expect(ran).toBe(0); r.clk.advance(1); expect(ran).toBe(1);
    reduced = false; r.veil.cut(() => ran++); r.clk.advance(DIP_REDUCED.limit); expect(ran).toBe(1); r.clk.advance(DIP.limit - DIP_REDUCED.limit); expect(ran).toBe(2);
    expect(DIP_REDUCED.limit).toBeLessThan(DIP.limit); expect(DIP_REDUCED.in).toBe(80); expect(DIP_REDUCED.out).toBe(80);
  });

  test("cut is a closure: it works detached, with no this, as tour.skip(ctx.veil.cut) calls it", () => {
    const r = veilRig(); const { cut } = r.veil; let ran = 0;
    expect(cut.call(undefined, () => ran++)).toBe(true); expect(cut.call(null, () => ran++)).toBe(true);
    r.endFade(); expect(ran).toBe(2);
    expect(/\bthis\b/.test(String(cut))).toBe(false);
    expect(r.veil.cut(undefined)).toBe(false); expect(r.veil.cut("no")).toBe(false); expect(r.veil.pending).toBe(false);   // not a function: nothing is taken
  });

  test("a jump that throws is logged, does not stop the jumps after it, and does not leave the veil up", () => {
    const r = veilRig(), logged = [], err = console.error; console.error = (...a) => logged.push(a); let ran = 0;
    try {
      r.veil.cut(() => { throw new Error("boom"); }); r.veil.cut(() => ran++);
      r.endFade(); r.clk.frame();
    } finally { console.error = err; }
    expect(ran).toBe(1); expect(logged.length).toBe(1); expect(String(logged[0][1])).toContain("boom");
    expect(r.layer().classList.contains("on")).toBe(false); expect(r.veil.pending).toBe(false);
  });

  test("without a page (no document: a server, a test) the jump simply happens at once", () => {
    const veil = createVeil({ doc: null }), had = Object.getOwnPropertyDescriptor(globalThis, "document"); let ran = 0;
    try { delete globalThis.document; expect(veil.cut(() => ran++)).toBe(true); } finally { if (had) Object.defineProperty(globalThis, "document", had); }
    expect(ran).toBe(1); expect(veil.pending).toBe(false);
  });

  test("flush() runs a pending jump now and cancels its timer", () => {
    const r = veilRig(); let ran = 0; r.veil.cut(() => ran++);
    r.veil.flush(); expect(ran).toBe(1); expect(r.veil.pending).toBe(false); expect(r.clk.timers.size).toBe(0);
    r.clk.advance(1000); expect(ran).toBe(1); r.veil.flush(); expect(ran).toBe(1);
  });

  test("the dip's colour is read once when it starts and written on the layer; skyColor follows the scene's fog and falls back to the page's background", () => {
    let colour = "#112233", reads = 0; const r = veilRig({ color: () => { reads++; return colour; } });
    r.veil.cut(() => {}); r.endFade(); expect(reads).toBe(1); expect(r.layer().style.backgroundColor).toBe("#112233");
    r.clk.frame(); colour = "#445566"; r.veil.cut(() => {}); r.veil.cut(() => {}); expect(reads).toBe(2); expect(r.layer().style.backgroundColor).toBe("#445566");
    const fog = new THREE.Color("#27315a");
    expect(skyColor({ scene: { fog: { color: fog } } })).toBe("#27315a");
    expect(skyColor({ scene: { fog: null } })).toBe(VEIL_FALLBACK); expect(skyColor({})).toBe(VEIL_FALLBACK); expect(skyColor(null)).toBe(VEIL_FALLBACK);
    expect(skyColor({ scene: { fog: { color: { getHexString() { throw new Error("no"); } } } } })).toBe(VEIL_FALLBACK);
  });

  test("at rest the layer goes to the end of the body (over the place labels, which are built after the HUD); a dip never moves it", () => {
    const r = veilRig(), labels = r.dom.document.createElement("div"); labels.id = "klc-labels";
    r.veil.cut(() => {}); r.endFade(); r.clk.frame();
    r.body.appendChild(labels); expect(r.body.lastChild).toBe(labels);
    r.veil.cut(() => {}); expect(r.body.lastChild).toBe(r.layer());
    const late = r.dom.document.createElement("div"); r.body.appendChild(late);
    r.veil.cut(() => {}); expect(r.body.lastChild).toBe(late);   // a dip is under way: not moved
    r.endFade(); r.clk.frame(); expect(r.layer().classList.contains("on")).toBe(false);
  });

  test("the stylesheet: a full-screen layer under the HUD and the pad, no touches, not painted at rest, 100 ms in and 180 ms out, off in shot frames, an 80 ms crossfade when motion is reduced (and it wins over the page's blanket no-transition rule)", () => {
    const rule = (sel) => VEIL_CSS.match(new RegExp("(?:^|\\n|\\})" + sel.replace(/[.#]/g, "\\$&") + "\\{([^}]*)\\}"))?.[1] ?? "";
    const base = rule("#" + VEIL_ID), on = rule("#" + VEIL_ID + ".on");
    expect(base).toMatch(/position:fixed/); expect(base).toMatch(/inset:0/); expect(base).toMatch(/pointer-events:none/); expect(base).toMatch(/opacity:0/); expect(base).toMatch(/visibility:hidden/);
    expect(base).toMatch(/transition:opacity 180ms cubic-bezier\([^)]*\),visibility 0s linear 180ms/);
    expect(on).toMatch(/opacity:1/); expect(on).toMatch(/visibility:visible/); expect(on).toMatch(/transition:opacity 100ms cubic-bezier\([^)]*\),visibility 0s/);
    expect(VEIL_CSS).toMatch(/body\.shot #klc-veil\{display:none\}/);
    expect(VEIL_CSS).toMatch(/@media \(prefers-reduced-motion:reduce\)\{#klc-veil\{transition:opacity 80ms linear,visibility 0s linear 80ms !important\}#klc-veil\.on\{transition:opacity 80ms linear,visibility 0s !important\}\}/);
    expect(read("src/anime/index.html")).toMatch(/prefers-reduced-motion: reduce\) \{ \* \{ transition: none !important; \} \}/);   // (the page's own blanket rule, which the !important above is there to beat: #klc-veil is more specific than *)
    expect(DIP).toEqual({ in: 100, out: 180, limit: 500, grace: 150, more: 2 });
    expect(VEIL_CSS).not.toMatch(/transform|backdrop-filter|filter:|animation/);   // opacity only: no motion to reduce, no blur over the scene
    const z = Number(base.match(/z-index:(\d+)/)[1]);
    const hudZ = Number(HUD_CSS.match(/#klc-ui \{[^}]*z-index: (\d+)/)[1]), padZ = Number(PAD_CSS.match(/#klc-pad \{[^}]*z-index: (\d+)/)[1]);
    expect(z).toBeLessThan(hudZ); expect(z).toBeLessThan(padZ);   // only the scene dips: the HUD and the pad stay over it
  });
});

// ------------------------------------------------------------------ the decision, against the real tour and the real veil
function fakeCtx() { return { L, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 30000), sunDir: new THREE.Vector3(0, 1, 0), services: {}, quality: { name: "high" } }; }
/** The real tour and the real veil on one clock: step() is one 60 Hz frame of both, and of the browser: a layer that went up is drawn fading in from the first frame after it, and the browser says
 *  so (transitionend) 100 ms later. A page that hitches draws no frame: `r.stall(ms)` lets time pass with no frame, so no fade (and no event) happens in it. cuts counts the veil's cut calls. */
function flightRig(from = "hero") {
  let fadeFrom = null, told = false, nowMs = () => 0;
  /** How opaque the layer is as the browser last drew it: it ramps from the first frame after the class went on (linear: the real curve is steeper at first). */
  const computed = () => ({ opacity: String(fadeFrom == null ? 0 : Math.min(1, (nowMs() - fadeFrom) / DIP.in)), transitionDuration: "0.1s, 0s" });
  const ctx = fakeCtx(), tour = createTour(ctx), v = veilRig({ computed }); tour.jumpTo(from); nowMs = () => v.clk.now;
  let cuts = 0; const inner = v.veil.cut;
  const veil = { cut(fn) { cuts++; return inner(fn); }, get pending() { return v.veil.pending; } };
  /** What the browser does at a frame: start the fade on the first frame after the class, end it 100 ms later. */
  const browserFrame = () => {
    const layer = v.layer();
    if (layer?.classList.contains("on")) { fadeFrom ??= v.clk.now; if (!told && v.clk.now - fadeFrom >= DIP.in - 0.01) { told = true; v.endFade(); } }
    else { fadeFrom = null; told = false; }
  };
  const r = { ctx, tour, veil, v, cam: ctx.camera, get cuts() { return cuts; }, step(n = 1) { for (let i = 0; i < n; i++) { tour.update(DT); v.clk.advance(DT * 1000); browserFrame(); } },
    /** The page does not answer for `ms`: time passes (timers run), no frame is drawn, the tour does not move. */
    stall(ms) { v.clk.tick(ms); },
    to: (id) => new THREE.Vector3(...tour.stops.find((s) => s.id === id).drone.pos),
    /** Frames until tour.flying is false (at most 200). */
    settle() { let n = 0; while (tour.flying && n < 200) { r.step(); n++; } return n; } };
  return r;
}

describe("interruptFlight: near is a glide, far is one veil dip, a second request is the first one again", () => {
  test("far from the destination: one cut, taken by the veil; the flight is over when the fade-in is (117 ms at 60 fps, inside 0.3 s), exactly on the framing; the pad's test (tour.flying) is false then", () => {
    const r = flightRig("hero"); r.tour.flyTo("kanae"); r.step(60);
    expect(r.tour.flying).toBe(true);
    expect(interruptFlight(r.tour, r.veil)).toBe(true);
    expect(r.cuts).toBe(1); expect(r.veil.pending).toBe(true); expect(r.tour.flying).toBe(true);   // until the jump the flight keeps flying
    const n = r.settle();
    expect(n * DT).toBeLessThan(0.3); expect(n * DT).toBeGreaterThanOrEqual(DIP.in / 1000);   // (never before the fade has been drawn for its 100 ms)
    expect(r.tour.flying).toBe(false); expect(r.veil.pending).toBe(false); expect(r.cuts).toBe(1);
    expect(r.cam.position.distanceTo(r.to("kanae"))).toBeLessThan(0.01);
    const d = new THREE.Vector3(); r.cam.updateMatrixWorld(true); r.cam.getWorldDirection(d);
    const s = r.tour.stops.find((x) => x.id === "kanae").drone, want = new THREE.Vector3(s.look[0] - s.pos[0], s.look[1] - s.pos[1], s.look[2] - s.pos[2]).normalize();
    expect(d.angleTo(want) * 180 / Math.PI).toBeLessThan(0.01);
  });

  test("a page that hitches (no frame for 450 ms right after the touch): the flight does not end on a timer behind a veil that has not been drawn; it ends when the fade has", () => {
    const r = flightRig("hero"); r.tour.flyTo("kanae"); r.step(60);
    interruptFlight(r.tour, r.veil);
    r.stall(450);   // a long task: the timer set to the length of the fade (120 ms) would have gone off here, with the layer still transparent
    expect(r.tour.flying).toBe(true); expect(r.veil.pending).toBe(true); expect(r.cam.position.distanceTo(r.to("kanae"))).toBeGreaterThan(100);   // still where the touch found it
    const n = r.settle();   // the first frame after the stall starts the fade; 100 ms later it is done, and only then does the jump run (the fallback at 500 ms found it half drawn and gave it longer)
    expect(n * DT).toBeGreaterThanOrEqual(DIP.in / 1000); expect(n * DT).toBeLessThan(0.15);
    expect(r.tour.flying).toBe(false); expect(r.cam.position.distanceTo(r.to("kanae"))).toBeLessThan(0.01); expect(r.cuts).toBe(1);
  });

  test("a page nobody is looking at (a hidden tab draws no frames) still gets its flight ended, at the limit (500 ms), through the one cut", () => {
    const r = flightRig("hero"); r.tour.flyTo("kanae"); r.step(60); r.v.dom.document.hidden = true;
    interruptFlight(r.tour, r.veil); r.stall(DIP.limit - 1); expect(r.tour.flying).toBe(true); r.stall(1);
    expect(r.tour.flying).toBe(false); expect(r.cuts).toBe(1); expect(r.cam.position.distanceTo(r.to("kanae"))).toBeLessThan(0.01);
  });

  test("near the destination: no cut, no dip; a glide of a quarter of a second that ends exactly on the framing", () => {
    const r = flightRig("hero"); r.tour.flyTo("ukimido"); r.step(100);   // 132 m hop, 1.7 s in: a few metres to go
    expect(r.cam.position.distanceTo(r.to("ukimido"))).toBeLessThan(150);
    expect(interruptFlight(r.tour, r.veil)).toBe(true);
    expect(r.cuts).toBe(0); expect(r.veil.pending).toBe(false); expect(r.v.layer()).toBeNull();   // the veil was never even built
    const n = r.settle();
    expect(n * DT).toBeGreaterThan(0.2); expect(n * DT).toBeLessThan(0.3);
    expect(r.cam.position.distanceTo(r.to("ukimido"))).toBeLessThan(0.01);
  });

  test("the first frames of the 132 m hop to 浮見堂 are all near: no dip however early it is interrupted (the arc then lifts the camera to 167 m away, and from there a dip is right)", () => {
    for (const k of [0, 1, 3, 10]) {
      const r = flightRig("hero"); r.tour.flyTo("ukimido"); r.step(k);
      expect(interruptFlight(r.tour, r.veil)).toBe(true); expect([k, r.cuts]).toEqual([k, 0]);
      expect(r.settle() * DT).toBeLessThan(0.3);
    }
    const r = flightRig("hero"); r.tour.flyTo("ukimido"); r.step(30);
    expect(r.cam.position.distanceTo(r.to("ukimido"))).toBeGreaterThan(150);
    interruptFlight(r.tour, r.veil); expect(r.cuts).toBe(1);
  });

  test("every pair of the seven built-in stops, interrupted at many moments: always over inside 0.3 s, always exactly on the framing, never more than one cut", () => {
    const ids = ["hero", "ukimido", "pier7", "market", "kanae", "oshima", "anba"]; let runs = 0, veilRuns = 0, worst = 0;
    for (const a of ids) for (const b of ids) {
      if (a === b) continue;
      const total = (() => { const q = flightRig(a); q.tour.flyTo(b); let n = 0; while (q.tour.flying) { q.step(); n++; } return n; })();
      for (const k of [1, 4, 9, 20, 40, 75, 120, 180]) {
        if (k >= total - 1) continue;
        const r = flightRig(a); r.tour.flyTo(b); r.step(k);
        expect(interruptFlight(r.tour, r.veil)).toBe(true);
        const n = r.settle(); worst = Math.max(worst, n * DT); runs++; if (r.cuts) veilRuns++;
        expect([a, b, k, r.tour.flying]).toEqual([a, b, k, false]); expect([a, b, k, r.cuts <= 1]).toEqual([a, b, k, true]);
        expect([a, b, k, r.cam.position.distanceTo(r.to(b)) < 0.01]).toEqual([a, b, k, true]);
        expect([a, b, k, n * DT < 0.3]).toEqual([a, b, k, true]);
      }
    }
    expect(runs).toBeGreaterThan(300); expect(veilRuns).toBeGreaterThan(100); expect(worst).toBeLessThan(0.3);
  });

  test("once-only: the same gesture arriving by two roads (pointerdown and touchstart, two keys) cuts once, and the jump runs once", () => {
    const r = flightRig("hero"); r.tour.flyTo("kanae"); r.step(60);
    let ran = 0; const skip = r.tour.skip; r.tour.skip = (cut) => skip((fn) => cut(() => { ran++; fn(); }));   // count the jumps that actually run
    expect(interruptFlight(r.tour, r.veil)).toBe(true);
    expect(interruptFlight(r.tour, r.veil)).toBe(true); expect(interruptFlight(r.tour, r.veil)).toBe(true);
    expect(r.cuts).toBe(1);
    r.step(3); expect(interruptFlight(r.tour, r.veil)).toBe(true); expect(r.cuts).toBe(1);   // still inside the dip (the fade has been drawn for 50 ms)
    r.settle(); expect(ran).toBe(1); expect(r.tour.flying).toBe(false);
    expect(interruptFlight(r.tour, r.veil)).toBe(false); expect(r.cuts).toBe(1);   // the flight is over: nothing to do
  });

  test("a place picked during the dip is never cancelled by the jump that was meant for the flight before it", () => {
    const r = flightRig("hero"); r.tour.flyTo("kanae"); r.step(60);
    interruptFlight(r.tour, r.veil); r.step(3);
    r.tour.stop(); r.tour.flyTo("market");   // the HUD's place pick: stop, then fly
    const before = r.cam.position.clone();
    r.step(8);   // the fade is done: the jump for the kanae flight runs now
    expect(r.tour.flying).toBe(true);   // the market flight is still on
    expect(r.cam.position.distanceTo(r.to("kanae"))).toBeGreaterThan(100);   // and nothing teleported to kanae
    expect(r.cam.position.distanceTo(before)).toBeLessThan(400);
    r.settle(); expect(r.cam.position.distanceTo(r.to("market"))).toBeLessThan(0.01);
  });

  test("never during the auto tour (it has its own pause), never when idle, never without tour.skip; no veil needed for the glide", () => {
    const p = flightRig("hero"); p.tour.play(); p.step(5);
    expect(p.tour.flying).toBe(true); expect(interruptFlight(p.tour, p.veil)).toBe(false); expect(p.cuts).toBe(0); expect(p.tour.playing).toBe(true);
    const idle = flightRig("hero"); expect(interruptFlight(idle.tour, idle.veil)).toBe(false);
    expect(interruptFlight(null, null)).toBe(false); expect(interruptFlight(undefined)).toBe(false);
    expect(interruptFlight({ flying: true, playing: false }, null)).toBe(false);   // an older tour without skip: nothing, and above all not stop()
    const bare = flightRig("hero"); bare.tour.flyTo("kanae"); bare.step(60);
    expect(interruptFlight(bare.tour, null)).toBe(true);   // no veil: the glide, which takes the time the distance needs (at most 1.2 s) and never cuts
    const n = bare.settle(); expect(n * DT).toBeLessThanOrEqual(1.3); expect(bare.tour.flying).toBe(false);
    expect(bare.cam.position.distanceTo(bare.to("kanae"))).toBeLessThan(0.01);
  });

  test("the camera is never left in mid-air: stop() is not what ends a flight (the frame after an interrupt is on the way, and the end is the framing)", () => {
    const r = flightRig("hero"); r.tour.flyTo("kanae"); r.step(60);
    const mid = r.cam.position.clone(); interruptFlight(r.tour, r.veil); r.settle();
    expect(r.cam.position.distanceTo(mid)).toBeGreaterThan(100);   // it arrived: it did not stay where the touch found it
  });
});


describe("the veil module", () => {
  test("it has no Math.random and no wall clock (timers and frames only)", () => {
    const src = read("src/anime/ui/veil.js");
    expect(src).not.toMatch(/Math\.random|Date\.now|performance\.now/);
  });
});
