// [v6:c12r2] round 2 of the c12 / c4 / c7 / c5 / c9 cells: concrete and asphalt rings were drawn as the cream 'plaza'
// (#c9c3b8), which read as sand. Earth 2026-03-11 shows grey asphalt / concrete (medians #6b6c77..#868186) and grey levee
// slopes (#9b9494 / #9e9899): the quay yards are 'apron' (darkened to #7c7a82) and the 鹿折川 levee slopes are 'levee'.
import { describe, expect, test } from "bun:test";
import * as L from "../src/anime/world/layout.js";
import { LOOK, PAVED } from "../src/anime/world/town/landuse.js";
import { LANDUSE_USES } from "../scripts/anime/enrich/overrides.js";

const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255); };
const cls = (file, i) => L.LANDUSE.find((l) => l.ovr === `${file}#landuse/${i}`)?.cls;

describe("grey quay yards and levee slopes, not cream sand", () => {
  test("the 'levee' use maps to a draped, paved class with a grey look", () => {
    expect(LANDUSE_USES.levee).toBe("levee");
    expect(LOOK.levee).toBeDefined();
    expect(PAVED.has("levee")).toBe(true);
    expect(lum(LOOK.levee.col)).toBeLessThan(lum(LOOK.plaza.col) - 25);
  });
  test("the apron look is the Earth grey (#7c7a82), darker than the old #909197", () => {
    expect(LOOK.apron.col).toBe("#7c7a82");
  });
  test("c12 大浦 yards, c7 神明崎 west path and c5 square are 'apron'; the pier (a pale grey concrete slab) is 'levee'", () => {
    for (const i of [0, 1, 3, 4, 5]) expect(cls("c12.json", i)).toBe("apron");
    expect(cls("c12.json", 6)).toBe("levee");
    expect(cls("c7.json", 3)).toBe("apron");
    expect(cls("c5.json", 1)).toBe("apron");
  });
  test("c4 鹿折川 levee slopes are 'levee'", () => {
    for (const i of [0, 1]) expect(cls("c4.json", i)).toBe("levee");
  });
});
