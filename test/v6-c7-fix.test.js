// [v6:c7] Cell c7, fix round 1: the Plaza Hotel's 2026 crown, cladding and pale-green decks (harbor/plaza.js), the
// お魚いちば siding and signs and the 気仙沼温泉 pylon, and the `markings` road patch (enrich/overrides.js, town/streets.js)
// that draws r14150 with a hatched median instead of a yellow centre line.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as L from "../src/anime/world/layout.js";
import { validateOverride } from "../scripts/anime/enrich/overrides.js";
import { PLAZA, UOICHI } from "../src/anime/world/harbor/plaza.js";

const ROOT = join(import.meta.dir, "..");
const read = (f) => readFileSync(join(ROOT, f), "utf8");
const doc = (roads) => ({ version: 1, cell: "t", bbox: [0, 0, 100, 100], sources: [{ id: "earth", what: "test" }], roads });

describe("road patch `markings`", () => {
  test("accepts a hatched median with lanes; rejects bad values", () => {
    expect(() => validateOverride(doc([{ id: "r1", markings: { centre: "hatched-median", medianWidth: 3, lanes: [1, 2] }, src: "earth: x" }]))).not.toThrow();
    expect(() => validateOverride(doc([{ id: "r1", markings: { centre: "white-dashed" }, src: "earth: x" }]))).not.toThrow();
    const bad = [
      [{ centre: "red" }, ".markings.centre"],
      [{ centre: "yellow", medianWidth: 3 }, 'only with centre "hatched-median"'],
      [{ centre: "hatched-median", lanes: [0, 2] }, ".markings.lanes"],
      [{ centre: "hatched-median", lanes: [1] }, ".markings.lanes"],
      [{ centre: "hatched-median", medianWidth: 30 }, ".markings.medianWidth"],
      [{ centre: "hatched-median", extra: 1 }, 'unknown field "extra"'],
    ];
    for (const [m, msg] of bad) expect(() => validateOverride(doc([{ id: "r1", markings: m, src: "earth: x" }]))).toThrow(msg);
  });
  test("r14150 (港町 quay road) carries the Earth 2026 reading; r14153 is left alone", () => {
    expect(L.ROADS.find((r) => r.id === "r14150").markings).toEqual({ centre: "hatched-median", medianWidth: 3, lanes: [1, 2] });
    expect(L.ROADS.find((r) => r.id === "r14153")?.markings).toBeUndefined();
    expect(read("src/anime/world/town/streets.js")).toContain("function hatchedMedian(");
  });
});

describe("お魚いちば lots", () => {
  test("the three lots have the sage-green siding from IMG_0895", () => {
    for (const id of ["16/58541/25068/138", "16/58541/25068/139", "16/58541/25068/145"]) {
      const l = L.lotById(id);
      expect([id, l.wall, l.src.wall]).toEqual([id, "#cfd8c8", "override"]);
    }
  });
});

// ------------------------------------------------------------------ headless build (a fake 2D canvas, no GPU)
class Ctx2D {
  constructor(c) { this.canvas = c; this.font = "10px sans-serif"; }
  measureText(t) { const m = /(\d+(?:\.\d+)?)px/.exec(this.font); const s = m ? Number(m[1]) : 10; return { width: [...String(t)].length * s * 0.92 }; }
  createLinearGradient() { return { addColorStop() {} }; }
  createRadialGradient() { return { addColorStop() {} }; }
  createPattern() { return {}; }
  getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }; }
  putImageData() {}
}
const ctxProxy = (c) => new Proxy(new Ctx2D(c), { get(t, k) { if (k in t) return t[k]; return () => {}; }, set(t, k, v) { t[k] = v; return true; } });
class FakeCanvas { constructor() { this.width = 300; this.height = 150; this.style = {}; } getContext(t) { return t === "2d" ? (this._c ||= ctxProxy(this)) : null; } toDataURL() { return "data:,"; } addEventListener() {} }

describe("headless: the Plaza Hotel and the お魚いちば signs", async () => {
  globalThis.document ??= { createElement: (t) => (t === "canvas" ? new FakeCanvas() : { style: {}, addEventListener() {}, appendChild() {}, setAttribute() {} }), fonts: { load: async () => [] }, body: { appendChild() {} }, addEventListener() {} };
  const THREE = await import("three");
  const { createContext } = await import("../src/anime/core/ctx.js");
  const { buildPlazaHotel } = await import("../src/anime/world/harbor/plaza.js");
  const scene = new THREE.Scene();
  const ctx = createContext({ scene, camera: new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 30000), renderer: null, audio: null, quality: { name: "high", heroR: 1 }, sunDir: new THREE.Vector3(...L.SUN_DIR).normalize() });
  const P = buildPlazaHotel(ctx);
  test("the crown is 10.5 m over the 7-storey tower (Commons 2026-03-29, IMG_0896)", () => {
    expect(P.tower.top).toBeCloseTo(PLAZA.towerY + PLAZA.floors * PLAZA.fh + 10.5, 5);
  });
  test("the market signs face west (the front IMG_0895 sees) and the pylon stands about 10 m tall west of the lift", () => {
    expect(P.uoichi.front.len).toBeGreaterThan(20);
    expect(Math.sin(P.uoichi.front.rotY)).toBeLessThan(-0.8);   // the outward normal (sin, cos) points west
    expect(P.uoichi.pylon.top - P.uoichi.pylon.y).toBeGreaterThan(9); expect(P.uoichi.pylon.top - P.uoichi.pylon.y).toBeLessThan(11.5);
    expect(UOICHI.pylon[0]).toBeLessThan(P.lift.x - 3);
    expect(L.isWater(UOICHI.pylon[0], UOICHI.pylon[1])).toBe(false);
  });
  test("the 2026 colours and the sign text are in the model", () => {
    const src = read("src/anime/world/harbor/plaza.js");
    for (const c of ["'#c2d4c9'", "'#d3b6a8'", "'#cdb0a3'", "'#e3dbcf'", "'#cfcac0'", "'港ふれあい'", "'#d6b9ab'"]) expect(src).toContain(c);
    expect(src).not.toContain("海とふれあい'");
  });
});
