// [ui-c2] UI lane C, round 2, row 9: every data file is fetched once per page (explore.json was requested three times: mobile review F24).
// The browser-side proof (the network log of a cold load) is in tools/anime/ui-c2-check.mjs (through the machine gate).
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { onceByKey } from "../src/anime/core/once.js";

const ROOT = resolve(import.meta.dir, "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

// ------------------------------------------------------------------------------------------------------------ row 9: explore.json once
describe("row 9: every data file is fetched once per page", () => {
  test("onceByKey: concurrent and later callers share the first call; keys are independent", async () => {
    const calls = [];
    const once = onceByKey((k) => { calls.push(k); return new Promise((r) => setTimeout(() => r({ k }), 5)); });
    const [a, b, c] = await Promise.all([once("explore.json"), once("explore.json"), once("trees.json")]);
    expect(a).toBe(b); expect(a).not.toBe(c);
    expect(await once("explore.json")).toBe(a);   // later too
    expect(calls).toEqual(["explore.json", "trees.json"]);
  });
  test("a request that failed is forgotten: the next caller asks again (and a synchronous throw is a rejection, also forgotten)", async () => {
    let n = 0;
    const once = onceByKey((k) => { n++; if (n === 1) return Promise.reject(new Error("offline")); if (n === 2) throw new Error("sync"); return Promise.resolve("ok"); });
    await expect(once("x")).rejects.toThrow("offline");
    await Bun.sleep(1);
    await expect(once("x")).rejects.toThrow("sync");
    await Bun.sleep(1);
    expect(await once("x")).toBe("ok"); expect(n).toBe(3);
    expect(await once("x")).toBe("ok"); expect(n).toBe(3);
  });
  test("layout.js: loadData goes through onceByKey in the browser (explore.json: environment, the schools and explore ask), and still reads the file every time under bun", () => {
    const L = read("src/anime/world/layout.js");
    expect(L).toContain("import { onceByKey } from '../core/once.js';");
    expect(L).toContain('const loadJsonOnce = onceByKey((name) => load(name, "json"));');
    expect(L).toContain('const SHARED = new Set(["explore.json"]);');   // only the file with several users (a shared parse of the others would stay on the heap for the life of the page)
    expect(L).toContain('export const loadData = (name) => (IS_BROWSER && SHARED.has(name) ? loadJsonOnce(name) : load(name, "json"));');
    // the three consumers are the ones the review counted, and all of them go through loadData
    expect(read("src/anime/world/environment.js")).toContain("L.loadData('explore.json')");
    expect(read("src/anime/world/explore/index.js")).toContain("L.loadData('explore.json')");
    expect(read("src/anime/world/landmarks/schools.js")).toContain("L.loadData?.('explore.json')");
    // nothing else fetches it
    for (const f of ["src/anime/main.js", "src/anime/world/explore/index.js", "src/anime/world/environment.js"]) expect(read(f)).not.toMatch(/fetch\([^)]*explore/);
  });
  test("under bun loadData still reads the file on every call (the tests mutate what they load)", async () => {
    const L = await import("../src/anime/world/layout.js");
    const a = await L.loadData("explore.json"), b = await L.loadData("explore.json");
    expect(a).not.toBe(b);
    expect(a.roads.length).toBe(b.roads.length);
  });
});
