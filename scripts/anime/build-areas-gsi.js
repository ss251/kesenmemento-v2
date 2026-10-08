// [sys:22] The GSI 町丁 name grid for the HUD arrival toast -> data/anime/areas-gsi.json.
//   env -u NODE_OPTIONS bun run scripts/anime/build-areas-gsi.js [--refine]
// Input: test/fixtures/gsi_revgeo_50m.json, every point of a 50 m grid over x -700..1300, z -800..1000 (ENU m) with the lv01Nm (町丁名) that
// the GSI 逆ジオコーダ (mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress) returns, null over the sea. This is factual address data,
// not imagery (出典：国土地理院). --refine re-queries the 25 m points between two 50 m points whose names differ, so the 魚町 / 入沢 / 八日町
// and 南町 / 港町 / 柏崎 boundaries are sharp (cached in raw/ref/names8926/gsi_revgeo_25m.json, which is gitignored).
// Output: { step: 25, x0, z0, nx, nz, names: [...], idx: [...] } (idx = index into names, -1 = sea / none), row-major over z then x.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../../", import.meta.url).pathname;
const X0 = -700, Z0 = -800, X1 = 1300, Z1 = 1000;

export async function buildAreasGsi({ refine = false, log = console.error } = {}) {
  const G = JSON.parse(readFileSync(join(ROOT, "test/fixtures/gsi_revgeo_50m.json"), "utf8"));
  const cacheFile = join(ROOT, "raw/ref/names8926/gsi_revgeo_25m.json");
  const C = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, "utf8")) : {};
  const nx = (X1 - X0) / 25 + 1, nz = (Z1 - Z0) / 25 + 1, names = [], idx = new Int16Array(nx * nz).fill(-1);
  const nameOf = (g) => { if (!g || g === "－" || g === "-") return -1; let i = names.indexOf(g); if (i < 0) { i = names.length; names.push(g); } return i; };
  const get = (x, z) => G[x + "," + z] ?? C[x + "," + z];
  // the odd points: from the neighbours at 50 m when they agree, else a query
  const todo = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = X0 + 25 * i, z = Z0 + 25 * j;
    const ox = (x - X0) % 50 !== 0, oz = (z - Z0) % 50 !== 0;
    if (!ox && !oz) { idx[j * nx + i] = nameOf(G[x + "," + z]); continue; }
    // the (up to 4) 50 m points around this one
    const xs = ox ? [x - 25, x + 25] : [x], zs = oz ? [z - 25, z + 25] : [z];
    const nb = []; for (const a of xs) for (const b of zs) if (a >= X0 && a <= X1 && b >= Z0 && b <= Z1) nb.push(G[a + "," + b]);
    const first = nb[0];
    if (nb.every((v) => (v ?? null) === (first ?? null))) { idx[j * nx + i] = nameOf(first); continue; }
    if (C[x + "," + z] !== undefined) { idx[j * nx + i] = nameOf(C[x + "," + z]); continue; }
    todo.push([i, j, x, z, nb]);
  }
  log(`odd points to query: ${todo.length}`);
  if (refine && todo.length) {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let k = 0, got = 0;
    const worker = async () => {
      while (k < todo.length) {
        const [, , x, z] = todo[k++], lon = 141.575 + x / 86744, lat = 38.906 - z / 111014;
        for (let t = 0; t < 3; t++) {
          try { const r = await fetch(`https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}`); const j = await r.json(); C[x + "," + z] = j.results ? j.results.lv01Nm : null; got++; break; } catch (e) { await sleep(800); }
        }
        await sleep(120);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    writeFileSync(cacheFile, JSON.stringify(C));
    log(`queried ${got}`);
  }
  // unqueried odd points take the nearest known neighbour's name (the first one)
  for (const [i, j, x, z, nb] of todo) idx[j * nx + i] = nameOf(C[x + "," + z] !== undefined ? C[x + "," + z] : nb.find((v) => v !== undefined) ?? null);
  return { step: 25, x0: X0, z0: Z0, nx, nz, names, idx: Array.from(idx), source: "国土地理院 逆ジオコーダ LonLatToAddress (lv01Nm), sampled on a 50 m grid and refined to 25 m on the boundaries" };
}

if (import.meta.main) {
  const A = await buildAreasGsi({ refine: process.argv.includes("--refine") });
  const txt = JSON.stringify(A);
  writeFileSync(join(ROOT, "data/anime/areas-gsi.json"), txt);
  console.log(JSON.stringify({ ok: true, names: A.names.length, cells: A.idx.length, bytes: txt.length }));
}
