// [v6:c6r3] The 入沢 / 魚町 hillside multi-storey car park (OSM w775150096): kind 'carpark' from the tags, the open-deck plan, and the data.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { kindFromTags } from "../scripts/anime/enrich/osm.js";
import { classifyLot } from "../scripts/anime/derive.js";
import { LOT_KINDS, FACADES } from "../scripts/anime/enrich/overrides.js";
import { carparkPlan, CARPARK } from "../src/anime/world/town/carpark.js";
import { inRing, insetRing } from "../src/anime/world/town/wings.js";
import { styleOf } from "../src/anime/world/town/mid.js";
import { STYLE } from "../src/anime/world/town/facade.js";

const ROOT = new URL("../", import.meta.url).pathname;
const layout = JSON.parse(readFileSync(ROOT + "data/anime/layout.json", "utf8"));
const lot = (id) => layout.lots.find((l) => l.id === id);

describe("[v6:c6r3] carpark kind", () => {
  test("kindFromTags maps building=parking and multi-storey amenity=parking, not a surface car park", () => {
    expect(kindFromTags({ amenity: "parking", building: "parking", parking: "multi-storey" })).toBe("carpark");
    expect(kindFromTags({ building: "parking" })).toBe("carpark");
    expect(kindFromTags({ amenity: "parking", parking: "multi-storey" })).toBe("carpark");
    expect(kindFromTags({ amenity: "parking", parking: "surface" })).toBe(null);
    expect(kindFromTags({ building: "garage" })).toBe("warehouse");
  });
  test("derived values and the override vocabulary know it", () => {
    const c = classifyLot({ id: "x/1/2/3", code: 3101, area: 500, h: 5, zone: "hero", shore: -300, front: null, tag: "carpark" });
    expect(c.kind).toBe("carpark"); expect(c.roofShape).toBe("flat"); expect(c.storeys).toBe(2);
    expect(LOT_KINDS).toContain("carpark");
    expect(styleOf({ kind: "carpark" }, false)).toBe(STYLE.plain);
  });
  test("the two GSI pieces of w775150096 are carparks with the Earth roof colours, no warehouse wall", () => {
    const a = lot("16/58540/25068/398"), b = lot("16/58541/25068/31");
    for (const l of [a, b]) { expect(l.kind).toBe("carpark"); expect(l.osm).toBe("w775150096"); expect(l.facade).toBe("plain"); expect(l.src.kind).toBe("osm"); expect(["#9fb3c4", "#aebfc6"]).not.toContain(l.wall); }
    expect(a.roof.color).toBe("#a8a6a2");
    expect(b.roof.color).toBe("#718275");
    expect(FACADES).toContain("plain");
  });
  test("no parking landuse ring over the building (it would be hidden under the deck)", () => {
    const o = JSON.parse(readFileSync(ROOT + "data/anime/overrides/c6.json", "utf8"));
    expect((o.landuse || []).some((u) => u.use === "parking" && u.ring.every(([x, z]) => x > 5 && x < 25 && z > -190 && z < -165))).toBe(false);
  });
});

describe("[v6:c6r3] carparkPlan", () => {
  for (const id of ["16/58540/25068/398", "16/58541/25068/31"]) {
    test(`${id}: open decks, stalls and cars stay on the top deck`, () => {
      const l = lot(id), P = carparkPlan(l);
      expect(P.decks.length).toBe(l.storeys);
      expect(P.top).toBeCloseTo(l.height, 5);
      expect(P.stalls.length).toBeGreaterThan(6);
      expect(P.lines.length).toBeGreaterThan(P.stalls.length);
      expect(P.cars.length).toBeGreaterThan(0);
      expect(P.cars.length).toBeLessThanOrEqual(P.stalls.length);
      const room = insetRing(P.inner, CARPARK.edge * 0.9);
      for (const s of P.stalls) expect(inRing(s.cx, s.cz, P.inner)).toBe(true);
      for (const c of P.cars) expect(inRing(c.cx, c.cz, P.inner)).toBe(true);
      for (const [x, z] of P.columns) expect(inRing(x, z, P.ring)).toBe(true);
      expect(room.length).toBe(P.inner.length);
    });
  }
  test("deterministic", () => {
    const l = lot("16/58540/25068/398");
    expect(JSON.stringify(carparkPlan(l))).toBe(JSON.stringify(carparkPlan(l)));
  });
});
