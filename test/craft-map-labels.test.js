// [craft:C02] The full map draws a name only when its rect is free. Heavier places win, and a zoomed-out map
// drops the light ones. The dot is the caller's job: this function only chooses names.
import { describe, test, expect } from "bun:test";
import { EXTRA_PLACES } from "../src/anime/world/explore/places.js";
import { selectMapLabels, mapLabelBox, mapLabelFloor } from "../src/anime/world/explore/ui.js";
import { presentCredits } from "../src/anime/world/layout.js";

/** 11 px Zen Maru Gothic: a CJK glyph is about a square, a Latin glyph about 0.56 of that. */
const measure = (t) => [...String(t)].reduce((n, ch) => n + (ch.charCodeAt(0) > 0xff ? 11 : 6.2), 0);
const hit = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
function overlaps(labels) {
  const boxes = labels.map((l) => mapLabelBox(l));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (hit(boxes[i], boxes[j])) return [labels[i].text, labels[j].text];
  return null;
}

const INNER = [
  ...EXTRA_PLACES.filter((p) => ["catholic", "otokoyama", "mukaeru", "kumano", "kakuboshi", "mambo"].includes(p.id)).map((p) => ({ ...p, group: "places" })),
  { id: "pier7", ja: "PIER7（ピアセブン）", en: "PIER7 (Pier Seven)", cat: "landmark", group: "tour", at: [5, 40] },
  { id: "hero", ja: "内湾", en: "Inner bay", cat: "landmark", group: "tour", at: [168, -122] },
  { id: "ship", ja: "第一昭福丸に乗る", en: "Board the Daiichi Shofuku Maru", cat: "ship", group: "ship", at: [80, -40] },
];

function frame(W, H, mpp, cx = -40, cz = -20) {
  return selectMapLabels(INNER, {
    W, H, mpp, lang: "ja", measure, project: (x, z) => [W / 2 + (x - cx) / mpp, H / 2 + (z - cz) / mpp],
    blockers: [{ x0: 0, y0: 0, x1: W, y1: 52 }, { x0: 0, y0: H - 28, x1: Math.min(W * 0.72, 420), y1: H }],
  });
}

describe("full-map labels", () => {
  test("a name does not cover another place's dot", () => {
    const places = [
      { id: "shrine", ja: "熊野神社", cat: "shrine", group: "places", at: [200, 200] },
      { id: "shop", ja: "魚町直営店です", cat: "shop", group: "places", at: [150, 200] },
    ];
    const out = selectMapLabels(places, { W: 500, H: 400, mpp: 4, measure, project: (x, z) => [x, z] });
    expect(out.map((l) => l.text)).toEqual(["熊野神社"]);
  });

  test("two names on the same point: the heavier one stays", () => {
    const places = [
      { id: "shop", ja: "魚町直営店", cat: "shop", group: "places", at: [0, 0] },
      { id: "shrine", ja: "熊野神社", cat: "shrine", group: "places", at: [0, 0] },
    ];
    const out = selectMapLabels(places, { W: 400, H: 400, mpp: 4, measure, project: () => [200, 200] });
    expect(out.map((l) => l.text)).toEqual(["熊野神社"]);
  });

  test("zoomed out, a shop is a dot and a tour stop keeps its name", () => {
    expect(mapLabelFloor(4)).toBe(0);
    expect(mapLabelFloor(8)).toBe(14);
    expect(mapLabelFloor(20)).toBe(28);
    const far = selectMapLabels(INNER, { W: 800, H: 600, mpp: 20, measure, project: () => [400, 300] });
    expect(far.every((l) => l.weight >= 28)).toBe(true);
    expect(far.some((l) => l.text === "魚町直営店" || l.text === "迎（ムカエル）")).toBe(false);
    expect(far.some((l) => l.text.includes("ピアセブン") || l.text === "内湾")).toBe(true);
  });

  test("the inner bay stays readable at three zooms, on a phone and on a desktop", () => {
    const views = [
      ["phone", 377, 549],
      ["desktop", 1564, 740],
    ];
    for (const [name, W, H] of views) {
      const counts = [];
      for (const mpp of [2, 8, 20]) {
        const labels = frame(W, H, mpp);
        const clash = overlaps(labels);
        expect(clash, `${name} mpp ${mpp}`).toBeNull();
        for (const lab of labels) {
          const r = mapLabelBox(lab);
          expect(r.y0, lab.text).toBeGreaterThanOrEqual(52);
          expect(r.x1, lab.text).toBeLessThanOrEqual(W - 4);
        }
        counts.push(labels.length);
      }
      expect(counts[0]).toBeGreaterThan(counts[2]);
    }
  });
});

describe("map credit punctuation", () => {
  test("semicolons and ASCII brackets become Japanese punctuation, and タイル stays inside one run", () => {
    const raw = "© OpenStreetMap contributors (ODbL); 出典：国土地理院（地理院タイル）を加工して作成; 出典：政府統計の総合窓口(e-Stat) 境界データ（令和2年国勢調査 小地域）; 国土地理院 逆ジオコーダ（町丁名）";
    const out = presentCredits(raw);
    expect(out).not.toContain(";");
    expect(out).toContain("（ODbL）");
    expect(out).toContain("（e-Stat）境界データ");
    expect(out).toContain("地理院タイル");
    expect(out).toContain("国勢調査小地域");
    expect(out).not.toMatch(/[ぁ-んァ-ヶー一-鿿] +[ぁ-んァ-ヶー一-鿿]/);
    expect(out.split("、").length).toBeGreaterThan(1);
  });
});
