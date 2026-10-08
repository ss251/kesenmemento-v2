// Rich menu bounds and the generated placeholder image.
import { describe, expect, test } from "bun:test";
import { PLAY_URL, richMenuRequest } from "../server/line/menu.js";
import { placeholderPng } from "../tools/line/placeholder.mjs";

describe("rich menu", () => {
  test("six tiles, the chat bar, and the play link, inside 2500×1686", () => {
    const menu = richMenuRequest();
    expect(menu.chatBarText).toBe("メニュー");
    expect(menu.selected).toBe(true);
    expect(menu.name).toBe("kesenmemento");
    expect(menu.size).toEqual({ width: 2500, height: 1686 });
    expect(menu.areas).toHaveLength(6);
    expect(menu.areas.map((a) => a.action.data || a.action.uri)).toEqual([
      "flow=bug",
      "flow=fix",
      "flow=photo",
      "flow=idea",
      PLAY_URL,
      "flow=help",
    ]);
    expect(menu.areas[4].action).toMatchObject({ type: "uri", label: "あそぶ", uri: "https://kesenmemento.com/?src=line" });
    const top = menu.areas.filter((a) => a.bounds.y === 0);
    const bottom = menu.areas.filter((a) => a.bounds.y === 843);
    expect(top.reduce((s, a) => s + a.bounds.width, 0)).toBe(2500);
    expect(bottom.reduce((s, a) => s + a.bounds.width, 0)).toBe(2500);
    expect(top[0].bounds.height + bottom[0].bounds.height).toBe(1686);
    expect(menu.areas[2].bounds).toEqual({ x: 1666, y: 0, width: 834, height: 843 });
  });

  test("the placeholder is a 2500×1686 PNG under 1 MB", () => {
    const png = placeholderPng();
    expect(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(true);
    expect(png.toString("latin1", 12, 16)).toBe("IHDR");
    expect(png.readUInt32BE(16)).toBe(2500);
    expect(png.readUInt32BE(20)).toBe(1686);
    expect(png.length).toBeLessThan(1_000_000);
  }, 60_000);
});
