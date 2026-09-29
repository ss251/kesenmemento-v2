// Build the web app: bun build src/anime/index.html (v3, the default) -> dist/ (minified), plus the dev fixtures -> dist/fixtures/.
//   env -u NODE_OPTIONS bun run scripts/build-web.js [--no-minify] [--v2]
// [v3:foundation] v3 anime app by default (world modules registered by scripts/anime/registry.js); --v2 (or KLC_APP=v2)
// builds the v1/v2 app in src/web, kept as a reference.
// Only this package's outputs in dist/ are replaced (index.html, hashed js/css/maps, fixtures/); dist/qa,
// dist/trailer and dist/stills belong to other steps and are left alone.
import { resolve, join } from "node:path";
import { readdirSync, rmSync, cpSync, existsSync, mkdirSync, statSync } from "node:fs";

const ROOT = resolve(import.meta.dir, "..");
const DIST = join(ROOT, "dist");

export async function buildWeb({ minify = process.env.KLC_MINIFY !== "0", quiet = false, app = process.env.KLC_APP || "v3" } = {}) {   // [v2:render] KLC_MINIFY=0 for readable stacks
  const t0 = performance.now();
  mkdirSync(DIST, { recursive: true });
  for (const n of readdirSync(DIST)) {
    if (n === "index.html" || /^(index|main|chunk|style)-[\w-]+\.(js|css|map)$/.test(n) || /\.(js|css)\.map$/.test(n)) rmSync(join(DIST, n), { force: true });
  }
  if (app !== "v2") { const { writeRegistry } = await import("./anime/registry.js"); writeRegistry(); }   // [v3:foundation]
  const entry = app === "v2" ? join(ROOT, "src/web/index.html") : join(ROOT, "src/anime/index.html");
  const res = await Bun.build({ entrypoints: [entry], outdir: DIST, minify, sourcemap: "linked", target: "browser", splitting: app !== "v2" });
  if (!res.success) { for (const l of res.logs) console.error(l); throw new Error("bun build failed"); }
  const fx = join(ROOT, "src/web/fixtures");
  if (existsSync(fx)) { rmSync(join(DIST, "fixtures"), { recursive: true, force: true }); cpSync(fx, join(DIST, "fixtures"), { recursive: true }); }
  // [v3:fix] ship the MIT licence texts the credit line links to (dist/licenses/*.txt)
  if (app !== "v2") {
    const lic = join(DIST, "licenses"); mkdirSync(lic, { recursive: true });
    for (const [src, dst] of [["src/anime/LICENSE-sakuragaoka-station", "sakuragaoka-station.txt"], ["node_modules/three/LICENSE", "three.txt"]]) {
      if (existsSync(join(ROOT, src))) cpSync(join(ROOT, src), join(lic, dst));
    }
  }
  const outputs = res.outputs.map((o) => ({ path: o.path.slice(ROOT.length + 1), kb: Math.round(statSync(o.path).size / 1024) }));
  if (!quiet) console.log(JSON.stringify({ ok: true, ms: Math.round(performance.now() - t0), outputs }, null, 1));
  return { ok: true, outputs };
}

if (import.meta.main) await buildWeb({ minify: !process.argv.includes("--no-minify"), app: process.argv.includes("--v2") ? "v2" : undefined });
