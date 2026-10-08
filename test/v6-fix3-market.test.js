// [v6:fix3] The quay hall's contents against the photo survey: the tubs as separate crates, the truck, the berthed tug (data/survey/market/tug.json,
// tools/survey/tug_spec.py) and the frames the truck is absent from. Browser-side check: tools/anime/survey-diff.mjs --area market.
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HALL, quayEnu } from "../src/anime/world/harbor/hall6.js";
import TUG from "../data/survey/market/tug.json";

const ROOT = join(import.meta.dir, "..");
const S = JSON.parse(readFileSync(join(ROOT, "data/survey/market/features.json"), "utf8"));
const F = Object.fromEntries(S.features.map((f) => [f.name, f]));
const C = JSON.parse(readFileSync(join(ROOT, "data/survey/market/cameras.json"), "utf8"));
const mid = (r) => (r[0] + r[1]) / 2;
const enuOf = (a, d, y) => { const [x, z] = quayEnu(a, d); return [x, y, z]; };
const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe("quay hall contents (fix 3)", () => {
  test("the tubs are separate 1.44 x 1.19 x 0.74 m crates with a slit between neighbours, 8 in the surveyed row", () => {
    const T = HALL.tubs;
    expect([T.l, T.w, T.h]).toEqual([1.44, 1.19, 0.74]);
    expect(T.rows[0].n).toBe(8);
    for (const R of T.rows) { const slit = R.pitch - T.w; expect(slit).toBeGreaterThan(0.02); expect(slit).toBeLessThan(0.08); }
  });
  test("the truck is the 1.695 m wide 2 t flat-bed, wheelbase from the two tyre contacts", () => {
    const Tk = HALL.truck, wb = Math.hypot(Tk.front[0] - Tk.rear[0], Tk.front[1] - Tk.rear[1]);
    expect(Tk.width).toBe(1.695); expect(wb).toBeGreaterThan(2.4); expect(wb).toBeLessThan(2.55);
  });
  test("tug.json: the life rings measure 0.76 m on the hull plane d = 1, the hull foot sits at the curb top", () => {
    for (const k of ["ring1", "ring2"]) { const h = TUG[k].y[1] - TUG[k].y[0]; expect(h).toBeGreaterThan(0.68); expect(h).toBeLessThan(0.82); expect(TUG[k].d).toBe(1.0); }
    expect(TUG.wallTall.y[1]).toBeGreaterThan(3.9); expect(TUG.wallTall.y[1]).toBeLessThan(4.3);
    expect(TUG.funnel.y[1]).toBeGreaterThan(6.8);
  });
  test("the tug's surveyed features agree with the spec rectangles they were cut from", () => {
    const want = {
      "canopy.tug.ring#1": enuOf(mid(TUG.ring1.a), 1.0, mid(TUG.ring1.y)), "canopy.tug.ring#2": enuOf(mid(TUG.ring2.a), 1.0, mid(TUG.ring2.y)),
      "canopy.tug.mark": enuOf(mid(TUG.text.a), 1.0, mid(TUG.text.y)), "canopy.tug.wall_top": enuOf(mid(TUG.wallTall.a), 1.0, TUG.wallTall.y[1]),
      "canopy.tug.funnel_top": enuOf(mid(TUG.funnel.a), 1.4, TUG.funnel.y[1]), "canopy.tug.house_roof": enuOf(mid(TUG.house.a), 1.9, TUG.house.y[1]),
    };
    for (const [k, v] of Object.entries(want)) { expect(F[k]).toBeDefined(); expect(d3(F[k].enu, v)).toBeLessThan(0.02); expect(Math.max(...F[k].sigma)).toBeLessThan(1.0); }
  });
  test("transient items: the truck drove in after IMG_0853 / 0854; the crew stand in IMG_0861 only, the man on the tug in IMG_0855 only", () => {
    const ab = (id) => C.cameras.find((c) => c.id === id).absent || [];
    for (const id of ["IMG_0853", "IMG_0854"]) expect(ab(id)).toContain("hall.truck");
    for (const id of ["IMG_0855", "IMG_0860", "IMG_0861"]) expect(ab(id)).not.toContain("hall.truck");
    expect(ab("IMG_0861")).not.toContain("hall.crew"); expect(ab("IMG_0855")).not.toContain("hall.man");
    expect(ab("IMG_0855")).toContain("hall.crew"); expect(ab("IMG_0861")).toContain("hall.man");
  });
});
