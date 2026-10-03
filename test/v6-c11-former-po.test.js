// [v6:c11] The former 気仙沼魚市場前郵便局 at 魚市場前5-4 (OSM w768698009 / n7181919668, '（旧）気仙沼魚市場前郵便局'): Japan Post
// moved it to 仲町2-1-30-4 as 気仙沼仲町郵便局 on 2021-05-19 (storeinformation id=4928). The building keeps no red 郵便局 board
// (signName drops '（旧）' names), the lot loses the name and the post-office use (LOT_FIX), and no place, label or search
// hit starts with （旧） (layout.js PLACES, build-layout.js add()); that also removes the empty plot （旧）気仙沼南町郵便局.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as L from "../src/anime/world/layout.js";
import { signName, wantsSign } from "../src/anime/world/town/realnames.js";
import { LOT_FIX, applyLotFix } from "../src/anime/world/lotfix.js";

const ROOT = join(import.meta.dir, "..");
const ID = "16/58542/25070/15";

describe("former post office at 魚市場前5-4", () => {
  test("signName drops （旧） / (旧) / 旧 names and keeps ordinary ones", () => {
    expect(signName("（旧）気仙沼魚市場前郵便局")).toBe(null);
    expect(signName("(旧)気仙沼南町郵便局")).toBe(null);
    expect(signName("旧ホテル望洋館")).toBe(null);
    expect(signName("気仙沼仲町郵便局")).toBe("気仙沼仲町郵便局");
    expect(signName("気仙沼郵便局")).toBe("気仙沼郵便局");
  });

  test("the lot carries no name, no post-office use and no sign; its kind and size stay", () => {
    expect(LOT_FIX[ID].clearName).toBe(true);
    expect(LOT_FIX[ID].kind).toBeUndefined();   // the 2026 use is unverified
    const lot = L.LOTS.find((l) => l.id === ID);
    expect(lot).toBeDefined();
    expect(lot.name).toBeUndefined();
    expect(lot.use).toBeUndefined();
    expect(lot.kind).toBe("public");
    expect(lot.storeys).toBe(2);
    expect(wantsSign(lot)).toBe(false);
    // the raw OSM-tagged lot, as an older layout.json had it, gets the same result from applyLotFix
    const raw = { id: ID, kind: "public", name: "（旧）気仙沼魚市場前郵便局", use: "amenity:post_office", src: {} };
    expect(wantsSign(raw)).toBe(false);
    applyLotFix(raw);
    expect([raw.name, raw.use, raw.kind]).toEqual([undefined, undefined, "public"]);
  });

  test("no place starts with （旧）; the relocated 気仙沼仲町郵便局 is still there", () => {
    expect(L.PLACES.filter((p) => /^[（(]旧[）)]/.test(p.name || ""))).toEqual([]);
    expect(L.PLACES.find((p) => p.id === "p1o5bhw0")).toBeUndefined();
    expect(L.PLACES.find((p) => p.id === "p13dosdn")).toBeUndefined();
    expect(L.PLACES.some((p) => p.name === "気仙沼仲町郵便局" && Math.hypot(p.x - 249, p.z - 870) < 10)).toBe(true);
    expect(L.PLACES.some((p) => /魚市場前郵便局/.test(p.name || ""))).toBe(false);
  });

  test("the built layout.json agrees (build-layout.js add() and LOT_FIX)", () => {
    const D = JSON.parse(readFileSync(join(ROOT, "data/anime/layout.json"), "utf8"));
    expect(D.places.filter((p) => /^[（(]旧[）)]/.test(p.name || ""))).toEqual([]);
    const lot = D.lots.find((l) => l.id === ID);
    expect([lot.name, lot.use]).toEqual([undefined, undefined]);
  });
});
