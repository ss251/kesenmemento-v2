// [ui-c2] UI lane C, round 2, row 2: the shared field-of-view function (core/fov.js) and the paint helper (core/paint.js).
// The photo tests that use them are in test/ui-c2-photo.test.js.
import { describe, test, expect } from "bun:test";
import * as THREE from "three";
import { fovFor, horizontalFov, FOV } from "../src/anime/core/fov.js";
import { afterPaint } from "../src/anime/core/paint.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------------------------------------------------ the field of view
describe("core/fov.js: one function for the screen and the photo", () => {
  /** The expression main.js wrote out in resize() before this row, character for character (three's degToRad is d * (PI / 180)). */
  const old = (aspect) => (aspect < 1 ? Math.min(88, 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(64) / 2) / aspect) * 180 / Math.PI) : 55);
  test("it gives bit-for-bit what resize() always computed (the screen does not change by a pixel)", () => {
    for (let a = 0.05; a < 4; a += 0.00731) expect(fovFor(a)).toBe(old(a));
    for (const a of [390 / 844, 375 / 667, 430 / 932, 820 / 1180, 844 / 390, 1, 16 / 9, 1440 / 900, 2.4]) expect(fovFor(a)).toBe(old(a));
    expect(FOV).toEqual({ landscape: 55, portraitHorizontal: 64, portraitMax: 88 });
  });
  test("a phone upright sees 88 degrees up and down and about 48 across; landscape keeps 55 vertical", () => {
    const a = 390 / 844;
    expect(fovFor(a)).toBe(88);
    expect(horizontalFov(fovFor(a), a)).toBeCloseTo(48.0, 0);
    expect(fovFor(844 / 390)).toBe(55);
    expect(fovFor(1)).toBe(55);
  });
  test("a portrait cap: very tall frames stop at 88 degrees vertical, and just under a square it is continuous", () => {
    expect(fovFor(0.1)).toBe(88);
    expect(fovFor(0.999)).toBeGreaterThan(55);
    expect(fovFor(0.999)).toBeLessThan(88);
  });
});

// ------------------------------------------------------------------------------------------------------------ paint
describe("core/paint.js afterPaint", () => {
  test("it waits for a frame and then a timer, and resolves once", async () => {
    const order = [];
    let frame = null;
    const timers = [];
    const env = { raf: (f) => { order.push("raf"); frame = f; }, timeout: (f, ms) => { timers.push([f, ms]); order.push("timer " + ms); } };
    const p = afterPaint(100, env).then(() => order.push("done"));
    expect(order).toEqual(["raf", "timer 100"]);   // the frame is asked for, the backstop is armed
    await sleep(5); expect(order).not.toContain("done");
    frame(); expect(order.at(-1)).toBe("timer 0");   // the timer queued from the frame
    timers.find(([, ms]) => ms === 0)[0](); await p;
    expect(order.at(-1)).toBe("done");
    timers.find(([, ms]) => ms === 100)[0]();   // the backstop firing later changes nothing
    await sleep(1); expect(order.filter((x) => x === "done").length).toBe(1);
  });
  test("a hidden tab never gets a frame: the backstop resolves it", async () => {
    const t0 = performance.now();
    await afterPaint(20, { raf: () => {} });
    expect(performance.now() - t0).toBeGreaterThanOrEqual(15);
    await afterPaint(20, { raf: () => { throw new Error("no frames"); } });
    await afterPaint(10, { raf: null });
  });
});

