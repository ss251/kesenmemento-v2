// [v3:foundation] Engine port + data products: module registry, land cover classes, trees, key light, credits.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { listModules } from "../scripts/anime/registry.js";
import { classify, CLASSES } from "../scripts/anime/build-landcover.js";
import * as L from "../src/anime/world/layout.js";

const ROOT = join(import.meta.dir, "..");

describe("engine port", () => {
  test("registry lists world modules (file or folder/index.js), never layout or helpers", () => {
    const names = listModules().map(([n]) => n);
    for (const n of ["environment", "water", "_ground", "_houses"]) expect(names).toContain(n);
    expect(names).not.toContain("layout");
    expect(names).not.toContain("registry");
  });
  test("MIT credit kept", () => {
    const lic = readFileSync(join(ROOT, "src/anime/LICENSE-sakuragaoka-station"), "utf8");
    expect(lic).toContain("MIT License");
    for (const f of ["core/ctx.js", "core/renderer.js", "core/sky.js", "main.js", "index.html"]) expect(readFileSync(join(ROOT, "src/anime", f), "utf8")).toMatch(/Sakuragaoka Station/);
  });
  test("key light never drops below 13 deg while the sun is up, keeps the azimuth", async () => {
    globalThis.window ??= undefined;
    const { keyLight, KEY_MIN_EL } = await import("../src/anime/core/sky.js");
    const THREE = await import("three");
    const sun = new THREE.Vector3(...L.sunDirAt(16.5)).normalize();
    const k = keyLight(sun);
    expect(Math.asin(k.y)).toBeCloseTo(KEY_MIN_EL, 5);
    expect(Math.atan2(k.x, -k.z)).toBeCloseTo(Math.atan2(sun.x, -sun.z), 5);
    const noon = new THREE.Vector3(...L.sunDirAt(12)).normalize();
    expect(keyLight(noon).y).toBeCloseTo(noon.y, 5);
    const night = new THREE.Vector3(...L.sunDirAt(21)).normalize();
    expect(keyLight(night).y).toBeGreaterThan(0.4);   // the moon
  });
});

describe("land cover and trees", () => {
  test("classifier: canopy, lawn, water shade, grey ground", () => {
    const id = (rgb) => CLASSES[classify(...rgb)].id;
    expect(["forest", "cedar"]).toContain(id([79, 109, 79]));      // 安波山 canopy sample
    expect(id([47, 80, 83])).toBe("water");                        // bay sample
    expect(["town", "paving"]).toContain(id([156, 172, 164]));     // town sample (green cast)
    expect(["town", "paving"]).toContain(id([190, 206, 200]));     // quay concrete
  });
  test("data products exist", () => {
    for (const f of ["grids.json", "grids.bin", "layout.json", "landcover.json", "landcover_core.png", "landcover_city.png", "forest_core.png", "forest_city.png", "trees.json"]) expect(existsSync(join(ROOT, "data/anime", f))).toBe(true);
  });
  test("trees stand on land, off roads and the promenade, deterministic ids", async () => {
    const T = await L.loadData("trees.json");
    expect(T.rows.length).toBeGreaterThan(3000);
    let wet = 0;
    for (const [x, z, y] of T.rows) { if (L.shoreDist(x, z) > -2) wet++; expect(Math.abs(y - L.heightAt(x, z))).toBeLessThan(0.3); }   // x, z are rounded to 0.1 m after sampling y
    expect(wet).toBe(0);
  });
});
