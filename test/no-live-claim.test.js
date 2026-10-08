// The app shows real data, not a live broadcast: weather from AMeDAS, the tide table, the co-op's arrival schedule.
// Feedback before the 2026-10-10 demo was to say "real data", never "live data", so the strings never claim ライブ / live.
// (ドライブ is a word of its own; the contribution sheet's "Live in the app" means a fix that shipped and is not a data claim.)
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const I = JSON.parse(readFileSync(join(root, "data/i18n.json"), "utf8"));
const LIVE_JA = /(?<!ド)ライブ/;
const LIVE_EN = /\blive\b/i;

describe("no live-data claim", () => {
  test("no Japanese string says ライブ", () => {
    const hits = Object.entries(I.ja).filter(([, v]) => typeof v === "string" && LIVE_JA.test(v));
    expect(hits).toEqual([]);
  });

  test("no English string says live", () => {
    const hits = Object.entries(I.en).filter(([, v]) => typeof v === "string" && LIVE_EN.test(v));
    expect(hits).toEqual([]);
  });

  test("the data tag says 実データ / Real data, the clock chip いま / NOW", () => {
    expect([I.ja["v3.live"], I.en["v3.live"]]).toEqual(["実データ", "Real data"]);
    expect([I.ja["v3.live.mark"], I.en["v3.live.mark"]]).toEqual(["いま", "NOW"]);
    expect([I.ja["v3.live.back"], I.en["v3.live.back"]]).toEqual(["いまに戻る", "Back to now"]);
  });

  test("the pages' first-paint text does not say it either", () => {
    for (const page of ["src/web/index.html", "src/anime/index.html"]) {
      if (!existsSync(join(root, page))) continue;   // the public tree has no v2 page
      const text = readFileSync(join(root, page), "utf8").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ");
      expect([page, LIVE_JA.test(text)]).toEqual([page, false]);
    }
  });
});
