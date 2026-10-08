// [ui-b2 follow-up] The two requests lane B2 left for whoever next touches hud.js and touchpad.js:
// a language rebuild must not replay an open panel's entry, and a sheet that is fading out must not lift the pad.
import { describe, test, expect } from "bun:test";
import { makeDom } from "./lib/mini-dom.js";
import { mountHud } from "../src/anime/ui/hud.js";
import { createTouchpad } from "../src/anime/ui/touchpad.js";

const GLOBALS = ["document", "location", "localStorage", "addEventListener", "MutationObserver", "requestAnimationFrame", "setTimeout", "getComputedStyle"];
const PRESETS = [{ id: "asa", h: 6.5 }, { id: "hiru", h: 12 }, { id: "yugata", h: 16.5 }, { id: "yuyake", h: 17 + 20 / 60 }, { id: "yoru", h: 19.5 }];

function hudWorld() {
  const dom = makeDom();
  const saved = Object.fromEntries(GLOBALS.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  const frames = [];
  const put = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  put("document", dom.document); put("location", dom.location); put("localStorage", dom.localStorage);
  put("addEventListener", dom.window.addEventListener); put("MutationObserver", dom.MutationObserver);
  put("requestAnimationFrame", (fn) => { frames.push(fn); return frames.length; });
  put("setTimeout", (fn) => { fn(); return 1; });
  const cleanup = () => { for (const k of GLOBALS) { if (saved[k]) Object.defineProperty(globalThis, k, saved[k]); else delete globalThis[k]; } };
  const emitter = () => { const fns = new Set(); return { on: (f) => (fns.add(f), () => fns.delete(f)), emit: (...a) => { for (const f of [...fns]) f(...a); } }; };
  const te = emitter(), ue = emitter();
  const T = { preset: "yugata", presets: PRESETS, clock: () => "16:30", set(id) { this.preset = id; te.emit(T, "start"); }, onChange: te.on };
  const stops = [{ id: "hero", ja: "場所", en: "Place" }];
  const tour = { stops, current: "hero", playing: false, flying: false, stop() {}, play() {}, flyTo() {}, walkTo() { return true; }, add() {}, onChange: ue.on };
  const ctx = { services: {}, pad: { suppress() {} } };
  const hud = mountHud(ctx, { time: T, tour }, { force: true });
  const el = hud.el;
  const click = (node) => dom.fire(node, "click", { detail: 1 });
  const drain = () => { const batch = frames.splice(0); for (const fn of batch) fn(); };
  return { dom, hud, el, click, frames, drain, cleanup };
}

describe("a language rebuild does not replay an open panel", () => {
  test("the menu is open: render sets data-still, and drops it two frames later", () => {
    const w = hudWorld();
    try {
      w.click(w.el.querySelector('[data-act="menu"]'));
      w.drain();
      expect(w.el.hasAttribute("data-still")).toBe(false);
      w.click(w.el.querySelector('[data-act="lang"]'));
      expect(w.el.getAttribute("data-still")).toBe("1");
      expect(w.el.getAttribute("lang")).toBe("en");
      w.drain();
      expect(w.el.getAttribute("data-still")).toBe("1");
      w.drain();
      expect(w.el.hasAttribute("data-still")).toBe(false);
    } finally { w.cleanup(); }
  });

  test("nothing is open: a language rebuild does not set data-still", () => {
    const w = hudWorld();
    try {
      w.click(w.el.querySelector('[data-act="lang"]'));
      expect(w.el.hasAttribute("data-still")).toBe(false);
      expect(w.el.getAttribute("lang")).toBe("en");
      w.drain(); w.drain();
      expect(w.el.hasAttribute("data-still")).toBe(false);
    } finally { w.cleanup(); }
  });

  test("an open time sheet is the same guard", () => {
    const w = hudWorld();
    try {
      w.click(w.el.querySelector('[data-act="sheet"][data-sheet="time"]'));
      w.drain();
      w.click(w.el.querySelector('[data-act="lang"]'));
      expect(w.el.getAttribute("data-still")).toBe("1");
      w.drain(); w.drain();
      expect(w.el.hasAttribute("data-still")).toBe(false);
    } finally { w.cleanup(); }
  });
});

function leavingAnim() {
  return [{ transitionProperty: "display", effect: { getKeyframes: () => [{ display: "flex" }, { display: "none" }] } }];
}

function padWorld() {
  const dom = makeDom({ search: "?touch=1" });
  const canvas = dom.document.createElement("canvas");
  dom.document.body.appendChild(canvas);
  const ui = dom.document.createElement("div"); ui.id = "klc-ui";
  const dock = dom.document.createElement("div"); dock.className = "dock";
  ui.appendChild(dock); dom.document.body.appendChild(ui);
  const proto = Object.getPrototypeOf(dom.document.body);
  proto.getBoundingClientRect = function () {
    if (this._rect) return { ...this._rect };
    return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  };
  proto.getAnimations = function () {
    if (this._animThrow) throw new Error("no animations");
    return this._anims || [];
  };
  const prev = Object.getOwnPropertyDescriptor(globalThis, "getComputedStyle");
  Object.defineProperty(globalThis, "getComputedStyle", { value: () => ({ visibility: "visible" }), configurable: true, writable: true });
  const win = { location: dom.location, localStorage: dom.localStorage, innerWidth: 390, innerHeight: 844, addEventListener() {}, navigator: {} };
  const pad = createTouchpad({ canvas, ctx: { services: {}, onUpdate() {} }, doc: dom.document, win });
  pad.el.querySelector(".safe")._rect = { left: 0, top: 0, right: 390, bottom: 844, width: 390, height: 844 };
  dock._rect = { left: 0, top: 620, right: 390, bottom: 844, width: 390, height: 224 };
  const top = () => {
    const css = pad.el.querySelector(".cluster").style.cssText || "";
    const m = /(?:^|;)top:([\d.]+)px/.exec(css);
    return m ? Number(m[1]) : null;
  };
  // pad.layout() forces a measure. update() would skip it until the 400 ms signature check.
  const layout = () => { pad.layout(); return top(); };
  const restore = () => { if (prev) Object.defineProperty(globalThis, "getComputedStyle", prev); else delete globalThis.getComputedStyle; };
  return { dock, layout, restore };
}

describe("a sheet that is leaving does not lift the pad", () => {
  test("a dock that is still on screen lifts the cluster; the same dock fading out does not", () => {
    const w = padWorld();
    try {
      w.dock._anims = [];
      const lifted = w.layout();
      w.dock._anims = leavingAnim();
      const rest = w.layout();
      expect(lifted).not.toBeNull();
      expect(rest).not.toBeNull();
      expect(rest - lifted).toBeGreaterThan(40);
    } finally { w.restore(); }
  });

  test("an opening panel, a transition that is not display-to-none, and a getAnimations throw still count", () => {
    const w = padWorld();
    try {
      w.dock._anims = [];
      const lifted = w.layout();
      w.dock._anims = [{ transitionProperty: "opacity", effect: { getKeyframes: () => [{ opacity: "0" }, { opacity: "1" }] } }];
      expect(w.layout()).toBe(lifted);
      w.dock._anims = [{ transitionProperty: "display", effect: { getKeyframes: () => [{ display: "none" }, { display: "flex" }] } }];
      expect(w.layout()).toBe(lifted);
      w.dock._animThrow = true;
      expect(w.layout()).toBe(lifted);
    } finally { w.restore(); }
  });
});
