// [contrib] The build stamp every report carries (scripts/anime/buildinfo.js -> Bun `define` -> src/anime/core/buildinfo.js).
import { describe, test, expect } from "bun:test";
import { readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { readBuildInfo, buildDefines, gitShort } from "../scripts/anime/buildinfo.js";
import { APP_VERSION, LAYOUT_VERSION } from "../src/anime/core/buildinfo.js";

const ROOT = resolve(import.meta.dir, "..");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

describe("buildinfo", () => {
  test("app = package version + the commit; just the version without git", () => {
    expect(readBuildInfo(ROOT, { git: () => "df15fdd" }).app).toBe(`${pkg.version}+df15fdd`);
    expect(readBuildInfo(ROOT, { git: () => "" }).app).toBe(pkg.version);
  });
  test("layout = the data's own version and a short content hash of data/anime/layout.json", () => {
    const b = readBuildInfo(ROOT, { git: () => "" });
    expect(b.layout).toMatch(/^v\d+\.[0-9a-f]{8}$/);
    expect(readBuildInfo(ROOT, { git: () => "x" }).layout).toBe(b.layout);   // deterministic
  });
  test("a checkout without layout data says 'unknown' instead of failing the build", () => {
    // (package.json is needed; the layout file is optional)
    const tmp = resolve(ROOT, "node_modules/.cache-contrib-buildinfo");
    mkdirSync(tmp, { recursive: true }); writeFileSync(join(tmp, "package.json"), JSON.stringify({ version: "9.9.9" }));
    try { expect(readBuildInfo(tmp, { git: () => "" })).toEqual({ app: "9.9.9", layout: "unknown" }); } finally { rmSync(tmp, { recursive: true, force: true }); }
  });
  test("buildDefines are JSON string literals for the two identifiers", () => {
    const d = buildDefines(ROOT, { git: () => "df15fdd" });
    expect(Object.keys(d).sort()).toEqual(["__KLC_APP_VERSION__", "__KLC_LAYOUT_VERSION__"]);
    expect(JSON.parse(d.__KLC_APP_VERSION__)).toBe(`${pkg.version}+df15fdd`); expect(JSON.parse(d.__KLC_LAYOUT_VERSION__)).toMatch(/^v\d+\.[0-9a-f]{8}$/);
  });
  test("gitShort never throws (a sandbox may return nothing) and is a short hash or empty", () => {
    expect(gitShort()).toMatch(/^([0-9a-f]{7,40})?$/);
    expect(gitShort("/nonexistent/dir")).toBe("");
  });
  test("outside a stamped build the module says 'dev'", () => {
    expect(APP_VERSION).toBe("dev"); expect(LAYOUT_VERSION).toBe("dev");
  });
  test("Bun.build with the defines replaces them, typeof guard included", async () => {
    const r = await Bun.build({ entrypoints: [join(ROOT, "src/anime/core/buildinfo.js")], target: "browser", minify: false, define: buildDefines(ROOT, { git: () => "abc1234" }) });
    expect(r.success).toBe(true);
    const code = await r.outputs[0].text();
    expect(code).toContain(`${pkg.version}+abc1234`); expect(code).toMatch(/v\d+\.[0-9a-f]{8}/);
    expect(code).not.toContain("__KLC_APP_VERSION__ ===");
    const unstamped = await Bun.build({ entrypoints: [join(ROOT, "src/anime/core/buildinfo.js")], target: "browser" });
    expect(await unstamped.outputs[0].text()).toContain('"dev"');
  });
  test("both builders pass the stamp", () => {
    expect(readFileSync(join(ROOT, "scripts/build-web.js"), "utf8")).toContain("buildDefines(ROOT)");
    expect(readFileSync(join(ROOT, "tools/anime/cdp.mjs"), "utf8")).toContain("buildDefines(ROOT)");
  });
});
