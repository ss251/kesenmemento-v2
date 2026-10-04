// Build the web app: bun build src/anime/index.html -> dist/ (minified), plus the dev fixtures -> dist/fixtures/.
//   env -u NODE_OPTIONS bun run scripts/build-web.js [--no-minify]
// The anime app in src/anime (world modules registered by scripts/anime/registry.js).
// Only this package's outputs in dist/ are replaced (index.html, hashed js/css/maps, fixtures/); dist/qa,
// dist/trailer and dist/stills belong to other steps and are left alone.
import { resolve, join } from "node:path";
import { readdirSync, rmSync, cpSync, existsSync, mkdirSync, statSync } from "node:fs";

const ROOT = resolve(import.meta.dir, "..");
const DIST = join(ROOT, "dist");

export async function buildWeb({ minify = process.env.KLC_MINIFY !== "0", quiet = false } = {}) {   // KLC_MINIFY=0 for readable stacks
  const t0 = performance.now();
  mkdirSync(DIST, { recursive: true });
  for (const n of readdirSync(DIST)) {
    if (n === "index.html" || /^(index|main|chunk|style)-[\w-]+\.(js|css|map)$/.test(n) || /\.(js|css)\.map$/.test(n)) rmSync(join(DIST, n), { force: true });
  }
  { const { writeRegistry } = await import("./anime/registry.js"); writeRegistry(); }   // [v3:foundation]
  const entry = join(ROOT, "src/anime/index.html");
  const res = await Bun.build({ entrypoints: [entry], outdir: DIST, minify, sourcemap: "linked", target: "browser", splitting: true });
  if (!res.success) { for (const l of res.logs) console.error(l); throw new Error("bun build failed"); }
  { const { fixHtmlEntry } = await import("./anime/html-entry.js"); for (const f of fixHtmlEntry(res.outputs)) console.error(`[build] Bun pointed ${f.html} at ${f.from}; fixed to the entry chunk ${f.to}`); }   // [ship:integrate]
  const fx = join(ROOT, "src/web/fixtures");
  if (existsSync(fx)) { rmSync(join(DIST, "fixtures"), { recursive: true, force: true }); cpSync(fx, join(DIST, "fixtures"), { recursive: true }); }
  // [v3:fix] ship the MIT licence texts the credit line links to (dist/licenses/*.txt)
  {
    const lic = join(DIST, "licenses"); mkdirSync(lic, { recursive: true });
    for (const [src, dst] of [["src/anime/LICENSE-sakuragaoka-station", "sakuragaoka-station.txt"], ["node_modules/three/LICENSE", "three.txt"]]) {
      if (existsSync(join(ROOT, src))) cpSync(join(ROOT, src), join(lic, dst));
    }
  }
  const outputs = res.outputs.map((o) => ({ path: o.path.slice(ROOT.length + 1), kb: Math.round(statSync(o.path).size / 1024) }));
  if (!quiet) console.log(JSON.stringify({ ok: true, ms: Math.round(performance.now() - t0), outputs }, null, 1));
  return { ok: true, outputs };
}

if (import.meta.main) await buildWeb({ minify: !process.argv.includes("--no-minify") });
