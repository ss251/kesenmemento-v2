// [ui-a2] Row 4, the pad's half: a touch on the canvas while the pad is out of the way for a flight to a place ends the flight (tour.skip through ctx.veil), instead of doing nothing for
// the 3 to 11 s it used to last; the touch is spent on that (it starts no stick and no look); the auto tour is left alone; a visible pad takes the same touch as a stick as before.
// The real createTouchpad on a mini DOM (test/lib/mini-dom.js). Real touches in a phone-shaped Chrome: test/ui-a2.e2e.test.js.
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createTouchpad } from "../src/anime/ui/touchpad.js";
import { makeDom } from "./lib/mini-dom.js";

const ROOT = resolve(import.meta.dir, "..");
const read = (p) => readFileSync(resolve(ROOT, p), "utf8");

/** A pad on a mini DOM (?touch=1, so it is on from the start) with a tour that records what the pad asks of it. */
function padWorld({ flying = true, playing = false, veil = true } = {}) {
  const dom = makeDom({ search: "?touch=1" }), canvas = dom.document.createElement("canvas"); canvas.id = "scene"; dom.document.body.appendChild(canvas);
  const win = { location: dom.location, localStorage: dom.localStorage, innerWidth: 390, innerHeight: 844, addEventListener() {}, navigator: {} };
  const updates = [];
  const tour = { flying, playing, calls: [], skipArg: undefined, skip(cut) { this.calls.push("skip"); this.skipArg = cut; if (!this.flying || this.playing) return false; this.flying = false; return true; }, stop() { this.calls.push("stop"); } };
  const ctx = { services: { life: { tour } }, onUpdate: (f) => updates.push(f) };
  if (veil) ctx.veil = { cut() {}, get pending() { return false; } };
  const pad = createTouchpad({ canvas, ctx, player: null, doc: dom.document, win });
  const touch = (x, y, id = 1) => dom.fire(canvas, "touchstart", { changedTouches: [{ identifier: id, clientX: x, clientY: y }], cancelable: true });
  return { dom, canvas, pad, tour, ctx, touch };
}

describe("the pad: a touch while it is out of the way for a flight takes the camera back", () => {
  test("a hidden pad and a flight: the touch ends the flight with tour.skip(ctx.veil.cut), never stop(), and starts no stick and no look", () => {
    const w = padWorld();
    expect(w.pad.active).toBe(true); expect(w.pad.hidden).toBe(true);
    const ev = w.touch(100, 600);
    expect(w.tour.calls).toEqual(["skip"]); expect(w.tour.skipArg).toBe(w.ctx.veil.cut); expect(w.tour.flying).toBe(false);
    expect(w.pad.stickActive).toBe(false); expect(w.pad.look).toEqual({ dx: 0, dy: 0 });
    expect(ev.defaultPrevented).toBe(false);   // (as before: a touch the pad does not take is left to the page)
  });

  test("the touch is spent on the interrupt: it does not become a stick or a look once the flight is over (the next touch does)", () => {
    const w = padWorld();
    w.touch(100, 600);   // left half, bottom: the stick's zone
    expect(w.pad.stickActive).toBe(false);
    w.pad.hidden = false;   // update() shows the pad as soon as tour.flying is false
    w.touch(100, 600, 2);
    expect(w.pad.stickActive).toBe(true);   // a visible pad takes the same touch as a stick, as it always did
  });

  test("the auto tour is left alone (it has its own pause button and G): a touch does nothing, the tour is not skipped or stopped", () => {
    const w = padWorld({ flying: true, playing: true }); w.touch(100, 600);
    expect(w.tour.calls).toEqual([]); expect(w.tour.playing).toBe(true); expect(w.tour.flying).toBe(true);
  });

  test("no flight, nothing to end: a touch on a hidden pad (the intro, a sheet, a cutscene) does nothing", () => {
    const w = padWorld({ flying: false }); w.touch(100, 600);
    expect(w.tour.calls).toEqual([]); expect(w.pad.stickActive).toBe(false);
  });

  test("without a veil (the HUD did not mount) the touch still ends the flight: skip() glides, whatever the distance", () => {
    const w = padWorld({ veil: false }); w.touch(100, 600);
    expect(w.tour.calls).toEqual(["skip"]); expect(w.tour.skipArg).toBeUndefined();
  });

  test("a pad with no tour at all (a build without the life module) ignores the touch quietly", () => {
    const w = padWorld(); w.ctx.services.life = null;
    expect(() => w.touch(100, 600)).not.toThrow();
  });
});

describe("the pad says it in its source", () => {
  const pad = read("src/anime/ui/touchpad.js").split("\n").filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).join("\n").replace(/\/\/.*$/gm, "");
  test("the hidden branch calls interruptFlight and returns; the pad still hides while tour.flying, so it comes back the moment the flight is over; stop() is not what ends a flight", () => {
    expect(pad).toMatch(/import \{ interruptFlight \} from '\.\/veil\.js';/);
    expect(pad).toMatch(/if \(pad\.hidden\) \{ interruptFlight\(tour\(\), ctx\?\.veil\); return; \}/);
    expect(pad).toMatch(/!!tour\(\)\?\.playing \|\| !!tour\(\)\?\.flying/);
    expect(pad.match(/\btour\(\)\??\.stop\??\.?\(/g) ?? []).toHaveLength(1);   // the one that was there (an interior door), none for a flight
    expect(pad).not.toMatch(/\.skip\(/);   // the decision lives in interruptFlight, not in a second copy
  });
});
