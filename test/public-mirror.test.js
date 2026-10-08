// [integrate] The public mirror (scripts/public-mirror.js) serves everything the merged app fetches: data/ship/**, data/ui-touch-i18n.json, the
// story pins and the nendo livery, the HUD's data and the licence link; it still refuses everything else.
import { describe, test, expect } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { allowed, ALLOW, DENY } from "../scripts/public-mirror.js";

const ROOT = resolve(import.meta.dir, "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

describe("the public mirror serves everything the merged app fetches", () => {
  const files = (dir, out = []) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) files(p, out); else out.push(p); } return out; };
  test("data/ship/**, data/ui-touch-i18n.json, the story pins, the nendo livery and the licence link are allowed", () => {
    for (const p of [
      "/data/ship/i18n.json", "/data/ship/story-pins.json", "/data/ship/sendoff-music.mp3",
      "/data/ship/shofukumaru1/livery-nendo.json", "/data/ship/shofukumaru1/lines-nendo.json", "/data/ship/shofukumaru1/livery-nendo-marks.json",
      "/data/ui-touch-i18n.json", "/data/ui-contrib-i18n.json", "/data/i18n.json", "/data/live/sample.json", "/licenses/sakuragaoka-station.txt", "/api/live", "/index.html", "/main-abc123.js",
    ]) expect([p, allowed(p)]).toEqual([p, true]);
  });
  test("every file under data/ship is allowed, and each named rule of the integrate block is in the list", () => {
    for (const f of files(join(ROOT, "data/ship"))) { const p = "/" + f.slice(ROOT.length + 1); expect([p, allowed(p)]).toEqual([p, true]); }
    const src = read("scripts/public-mirror.js");
    for (const s of ["data\\/ship\\/", "ui-touch-i18n", "ui-contrib-i18n", "licenses\\/"]) expect(src).toContain(s);
    expect(ALLOW.length).toBeGreaterThanOrEqual(9);
  });
  test("still refused: source maps, dotfiles, traversal, the writes and the token route, and paths outside the allow-list", () => {
    for (const p of ["/main.js.map", "/data/.env", "/data/ship/../../package.json", "/api/splat-transform", "/api/config", "/package.json", "/src/anime/main.js", "/raw/ref/photo.jpg", "/data/ship/%2e%2e/x.json", "/docs/ship/README.md"]) expect([p, allowed(p)]).toEqual([p, false]);
    expect(DENY.length).toBeGreaterThanOrEqual(5);
  });
  test("every data file the source names (fetch, import paths, string literals) is served by the mirror", () => {
    const refs = new Set();
    for (const f of files(join(ROOT, "src/anime"))) {
      if (!/\.(js|html)$/.test(f)) continue;
      const t = readFileSync(f, "utf8");
      for (const m of t.matchAll(/['"`](?:\.\.?\/)*(data\/[\w./-]+\.(?:json|bin|png|mp3|jpg|txt))['"`]/g)) refs.add(m[1]);
    }
    expect(refs.size).toBeGreaterThan(5);
    const bad = [...refs].filter((r) => !r.includes("${") && !allowed("/" + r));
    expect(bad).toEqual([]);
  }, 60000);   // (walks every file under src/anime: well over the default 5 s on a loaded machine)
});

