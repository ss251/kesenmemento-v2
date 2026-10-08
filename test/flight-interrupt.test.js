// [ui-a2] Row 4, the HUD's half: a movement key or a press on the canvas takes the camera back from a flight to a place (tour.skip through ctx.veil, never tour.stop; the auto tour keeps
// its own rules), a held key is one press, a finger is the pad's, and none of it rebuilds the HUD. The real mountHud on a mini DOM (test/lib/mini-dom.js) with a manual clock under the veil.
// The veil and the decision: test/veil.test.js; the pad's touch: test/pad-interrupt.test.js; the real browser: test/ui-a2.e2e.test.js.
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mountHud } from "../src/anime/ui/hud.js";
import { VEIL_ID, VEIL_STYLE_ID } from "../src/anime/ui/veil.js";
import { makeDom } from "./lib/mini-dom.js";
import { manualClock } from "./lib/manual-clock.js";

const ROOT = resolve(import.meta.dir, "..");
const read = (p) => readFileSync(resolve(ROOT, p), "utf8");
const clock = manualClock;

// ------------------------------------------------------------------ the HUD's keys and presses, on a mini DOM
const GLOBALS = ["document", "location", "localStorage", "addEventListener", "MutationObserver", "requestAnimationFrame", "setTimeout", "clearTimeout"];
const PRESETS = [{ id: "asa", h: 6.5 }, { id: "hiru", h: 12 }, { id: "yugata", h: 16.5 }, { id: "yuyake", h: 17.3 }, { id: "yoru", h: 19.5 }];
/** The real mountHud on a mini DOM, with a tour that records what the HUD asks of it and a manual clock under the veil. tour.far: skip() asks the cut for a dip. */
function hudWorld({ pad = { active: false, suppress() {} }, bare = false, force = true } = {}) {
  const dom = makeDom(), clk = clock();
  const saved = Object.fromEntries(GLOBALS.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)])), put = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  put("document", dom.document); put("location", dom.location); put("localStorage", dom.localStorage); put("addEventListener", dom.window.addEventListener);
  put("MutationObserver", dom.MutationObserver); put("requestAnimationFrame", (f) => { clk.raf(f); return 1; }); put("setTimeout", clk.setTimeout); put("clearTimeout", clk.clearTimeout);
  const cleanup = () => { for (const k of GLOBALS) { if (saved[k]) Object.defineProperty(globalThis, k, saved[k]); else delete globalThis[k]; } };
  try {
    const fns = new Set(), emit = () => { for (const f of [...fns]) f(tour); };
    const T = { preset: "yugata", presets: PRESETS, clock: () => "16:30", set(id) { this.preset = id; }, onChange: () => () => {} };
    const tour = { stops: [{ id: "hero", ja: "内湾", en: "Bay" }, { id: "market", ja: "市場", en: "Market" }, { id: "kanae", ja: "橋", en: "Bridge" }], current: "hero", playing: false, flying: false, far: true, calls: [], skipArg: undefined,
      stop() { this.calls.push("stop"); this.playing = false; this.flying = false; emit(); }, play() { this.calls.push("play"); this.playing = true; emit(); },
      flyTo(id) { this.calls.push("flyTo:" + id); this.current = id; this.flying = true; emit(); }, walkTo(id) { this.calls.push("walkTo:" + id); this.current = id; return true; },
      skip(cut) {
        this.calls.push("skip"); this.skipArg = cut;
        if (!this.flying || this.playing) return false;
        const end = () => { this.flying = false; emit(); };
        if (this.far && cut) cut(end); else end();   // far: the veil's dip carries the jump; near: it is over (the real tour glides for a quarter of a second)
        return true;
      }, onChange: (f) => (fns.add(f), () => fns.delete(f)) };
    const ctx = bare ? { services: {} } : { pad, services: {}, time: 0 };
    const hud = mountHud(ctx, { time: T, tour }, { force });
    const canvas = dom.document.createElement("canvas"); canvas.id = "scene"; dom.document.body.appendChild(canvas);
    const key = (code, props = {}) => dom.fire(dom.document.body, "keydown", { code, repeat: false, ...props });
    const press = (target, props = {}) => dom.fire(target, "pointerdown", { pointerType: "mouse", button: 0, ...props });
    /** The browser's word that the veil's fade-in is done (the jump waits for it). */
    const fade = () => dom.fire(dom.document.getElementById(VEIL_ID), "transitionend", { propertyName: "opacity" });
    return { dom, clk, hud, tour, ctx, canvas, key, press, fade, calls: () => tour.calls.slice(), renders: () => hud.el.htmlSets, cleanup };
  } catch (e) { cleanup(); throw e; }
}
const withHud = (opts, fn) => { const w = hudWorld(opts); try { return fn(w); } finally { w.cleanup(); } };

describe("the HUD: a movement key takes the camera back from a flight", () => {
  test("mounting the HUD makes ctx.veil (the object tour.skip is given), and nothing is built until it is used", () => withHud({}, (w) => {
    expect(typeof w.ctx.veil.cut).toBe("function"); expect(w.ctx.veil.pending).toBe(false);
    expect(w.dom.document.getElementById(VEIL_ID)).toBeNull(); expect(w.dom.document.getElementById(VEIL_STYLE_ID)).toBeNull();
    expect(hudWorld({ bare: true }).cleanup()).toBeUndefined();   // (a ctx without services still mounts)
  }));

  test("each of W A S D Q E, the four arrows, Space and Escape during a flight: tour.skip(ctx.veil.cut) once, never stop(), and the HUD is not rebuilt", () => {
    for (const code of ["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Escape"]) withHud({}, (w) => {
      w.tour.flyTo("market"); w.tour.calls.length = 0;
      w.key(code);
      expect([code, w.calls()]).toEqual([code, ["skip"]]);
      expect([code, w.tour.skipArg === w.ctx.veil.cut]).toEqual([code, true]);   // the very function, unbound
      expect([code, w.renders()]).toEqual([code, 1]);
      w.fade(); expect([code, w.tour.flying]).toEqual([code, false]);
    });
  });

  test("a key with no flight does nothing; the other keys do not interrupt a flight (time, season, photo, tour, view, planet, mute)", () => withHud({}, (w) => {
    w.key("KeyW"); w.key("Space"); w.key("Escape"); expect(w.calls()).toEqual([]);
    w.tour.flyTo("market"); w.tour.calls.length = 0;
    for (const code of ["KeyT", "KeyK", "KeyM", "KeyB", "KeyF", "ShiftLeft", "Tab", "Enter", "KeyH", "KeyZ"]) w.key(code);
    expect(w.calls().filter((c) => c === "skip" || c === "stop")).toEqual([]); expect(w.tour.flying).toBe(true);
  }));

  test("a held key is one press: repeats do not interrupt again (a repeat during a quarter-second glide would restart the glide for as long as the key is down)", () => withHud({}, (w) => {
    w.tour.flyTo("market"); w.tour.calls.length = 0; w.tour.far = false;
    w.key("KeyW", { repeat: true }); expect(w.calls()).toEqual([]);   // the key was already down before the flight: first seen as a repeat
    w.key("KeyW"); expect(w.calls()).toEqual(["skip"]);
    for (let i = 0; i < 20; i++) w.key("KeyW", { repeat: true }); expect(w.calls()).toEqual(["skip"]);
  }));

  test("a second movement key inside the dip is the same gesture: skip runs once (the veil carries one jump)", () => withHud({}, (w) => {
    w.tour.flyTo("market"); w.tour.calls.length = 0;
    w.key("KeyW"); w.clk.advance(30); w.key("KeyD"); w.press(w.canvas); w.key("Space");
    expect(w.calls()).toEqual(["skip"]);
    w.fade(); expect(w.tour.flying).toBe(false);
    w.tour.flyTo("kanae"); w.tour.calls.length = 0; w.key("KeyW"); expect(w.calls()).toEqual(["skip"]);   // a later flight is a new request
  }));

  test("Ctrl, Cmd and Alt combinations (browser shortcuts) and typing in a field do not interrupt", () => withHud({}, (w) => {
    w.tour.flyTo("market"); w.tour.calls.length = 0;
    w.key("KeyW", { ctrlKey: true }); w.key("KeyW", { metaKey: true }); w.key("ArrowLeft", { altKey: true }); expect(w.calls()).toEqual([]);
    const input = w.dom.document.createElement("input"); w.dom.document.body.appendChild(input); w.dom.fire(input, "keydown", { code: "KeyW", repeat: false }); expect(w.calls()).toEqual([]);
    w.key("KeyW", { shiftKey: true }); expect(w.calls()).toEqual(["skip"]);   // Shift is the run key: Shift+W is a movement
  }));

  test("the auto tour: the movement keys, Space and Escape stop it (as W did), and it is never skipped; a press on the canvas leaves it playing", () => {
    for (const code of ["KeyW", "KeyD", "ArrowDown", "ArrowLeft", "Space", "Escape"]) withHud({}, (w) => {
      w.tour.play(); w.tour.flying = true; w.tour.calls.length = 0;
      w.key(code); expect([code, w.calls()]).toEqual([code, ["stop"]]); expect([code, w.tour.playing]).toEqual([code, false]); expect([code, w.renders()]).toEqual([code, 1]);
    });
    withHud({}, (w) => { w.tour.play(); w.tour.flying = true; w.tour.calls.length = 0; w.press(w.canvas); expect(w.calls()).toEqual([]); expect(w.tour.playing).toBe(true); });
  });

  test("the digit keys keep their instant pick (stop, then fly: the flight carries its speed), the HUD is not rebuilt, and no skip", () => withHud({}, (w) => {
    w.tour.flyTo("market"); w.tour.calls.length = 0;
    w.key("Digit3"); expect(w.calls()).toEqual(["stop", "flyTo:kanae"]); expect(w.renders()).toBe(1);
  }));

  test("keys do nothing before the town is entered (no body.playing and no force), and work once it is", () => withHud({ force: false }, (w) => {
    w.tour.flyTo("market"); w.tour.calls.length = 0;
    w.key("KeyW"); expect(w.calls()).toEqual([]);
    w.dom.document.body.classList.add("playing"); w.key("KeyW"); expect(w.calls()).toEqual(["skip"]);
  }));
});

describe("the HUD: a press on the canvas takes the camera back; a touch is the pad's", () => {
  test("a mouse press or a pen on the scene during a flight: skip(ctx.veil.cut) once", () => {
    for (const pointerType of ["mouse", "pen"]) withHud({}, (w) => {
      w.tour.flyTo("market"); w.tour.calls.length = 0;
      w.press(w.canvas, { pointerType }); expect([pointerType, w.calls()]).toEqual([pointerType, ["skip"]]); expect(w.tour.skipArg).toBe(w.ctx.veil.cut);
      w.press(w.canvas, { pointerType }); expect(w.calls()).toEqual(["skip"]);   // inside the dip: the same gesture
      w.fade(); expect(w.tour.flying).toBe(false); w.press(w.canvas, { pointerType }); expect(w.calls()).toEqual(["skip"]);   // nothing left to end
    });
  });

  test("a finger on the scene when the pad is on is left to the pad's touchstart (one touch, one interrupt); with no pad the pointer event of a finger does it", () => {
    withHud({ pad: { active: true, suppress() {} } }, (w) => { w.tour.flyTo("market"); w.tour.calls.length = 0; w.press(w.canvas, { pointerType: "touch" }); expect(w.calls()).toEqual([]); w.press(w.canvas, { pointerType: "mouse" }); expect(w.calls()).toEqual(["skip"]); });
    withHud({ pad: { active: false, suppress() {} } }, (w) => { w.tour.flyTo("market"); w.tour.calls.length = 0; w.press(w.canvas, { pointerType: "touch" }); expect(w.calls()).toEqual(["skip"]); });
    withHud({ bare: true }, (w) => { w.tour.flyTo("market"); w.tour.calls.length = 0; w.press(w.canvas, { pointerType: "touch" }); expect(w.calls()).toEqual(["skip"]); });   // (no ctx.pad at all)
  });

  test("a press on a HUD button or anywhere that is not the scene does not end the flight (the places strip retargets it, the time dock leaves it)", () => withHud({}, (w) => {
    w.tour.flyTo("market"); w.tour.calls.length = 0;
    w.press(w.hud.el.querySelector('[data-act="preset"]')); w.press(w.hud.el.querySelector(".dock")); w.press(w.dom.document.body); w.press(w.hud.el);
    expect(w.calls()).toEqual([]); expect(w.tour.flying).toBe(true);
  }));

  test("an idle scene press does nothing (no flight, no stop, no skip)", () => withHud({}, (w) => { w.press(w.canvas); w.press(w.canvas, { pointerType: "touch" }); expect(w.calls()).toEqual([]); }));
});


describe("the HUD says it in its source", () => {
  const hud = read("src/anime/ui/hud.js").split("\n").filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).join("\n").replace(/\/\/.*$/gm, "");
  test("the flight keys go through interruptFlight, stop() is only for the auto tour, the pointer listener is on the scene, and no skip() of its own", () => {
    expect(hud).toMatch(/import \{ createVeil, interruptFlight, skyColor \} from '\.\/veil\.js';/);
    expect(hud).toMatch(/FLY_BREAK\.has\(e\.code\) && !e\.metaKey && !e\.ctrlKey && !e\.altKey && \(tour\.playing \|\| \(tour\.flying && !e\.repeat\)\)\) \{ if \(tour\.playing\) \{ tour\.stop\(\); syncState\(\); \} else interruptFlight\(tour, ctx\.veil\); \}/);
    expect(hud).toMatch(/e\.target\?\.id !== 'scene' \|\| \(e\.pointerType === 'touch' && ctx\.pad\?\.active\)/);
    expect(hud).toMatch(/ctx\.veil = createVeil\(\{ color: \(\) => skyColor\(ctx\) \}\)/);
    expect(hud).not.toMatch(/\.skip\(/);
    for (const k of ["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Escape"]) expect(hud).toContain(`'${k}'`);
    expect(hud).not.toMatch(/'Digit/);   // (the digits are matched by their own branch, as before)
  });
});
