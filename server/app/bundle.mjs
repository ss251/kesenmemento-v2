// Assembles the production bundle from a checkout, without git or a network: the tree that server/app/stage.sh makes for a
// commit (stage.sh stays the way to ship a local bundle with `railway up`; test/railway-bundle.test.js keeps the two lists equal).
//
//   bun run build && bun server/app/bundle.mjs [--dist dist] [--out bundle] [--no-precompress] [--no-verify]
//   (railway.json runs both as `bun run build:railway`; `bun run start` then serves the bundle)
//
// bundle/
//   server.js static.js jpyc.js   server/app/*: the read-only server, its precompressed-file helper and the JPYC proxy
//   public/                       the build (dist/) without source maps, dot files, per-port test builds, screenshot folders and the dev fixtures
//   data/                         the files the app fetches at run time (BUNDLE_DATA, and BUNDLE_DATA_OPTIONAL when the checkout has them) and /api/jpyc reads (data/shops)
//   src/ scripts/                 the modules behind /api/live (BUNDLE_MODULES, BUNDLE_MODULES_OPTIONAL) and the voucher check (BUNDLE_VOUCHER)
//   *.br *.gz                     brotli 11 and gzip 9 copies of every compressible file under public/ and data/ (server/app/static.js)
//
// The bundle has no package.json and no node_modules: the one package the /api/live modules import (astronomy-engine) is a
// dependency of the project, so Bun finds it in the checkout's node_modules above bundle/. Run from the command line, the
// assembly ends by importing the server's modules from inside the bundle (verifyBundle): a module that is missing stops the
// build here, not the deployed server at its start.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { precompress } from "./precompress.mjs";

const ROOT = resolve(import.meta.dir, "../..");

/** Data the app loads at run time and the server reads: the same entries as the first `git archive` in server/app/stage.sh. */
export const BUNDLE_DATA = [
  "data/anime", "data/live", "data/landmarks.json", "data/i18n.json", "data/tour.json", "data/buildings/coast.json", "data/ship",
  "data/ui-touch-i18n.json", "data/ui-contrib-i18n.json", "data/ui-jpyc-i18n.json", "data/shops",
];
/** Data a checkout may not have (a feature merged later): stage.sh's `present(...)` after the first list. data/play holds the hub's card stills; the approval record is read before the 3D walker is shown. */
export const BUNDLE_DATA_OPTIONAL = ["data/play", "data/hoyaboya-approval.json"];
/** The /api/live modules and what they import: the second `git archive` in stage.sh. */
export const BUNDLE_MODULES = [
  "src/server/live.js", "src/core/geo.js", "src/web/lib/solar.js", "scripts/live.js", "scripts/live/fixtures",
  ...["arrivals", "tide", "snapshot", "sky", "jma", "http"].map((n) => `scripts/live/${n}.js`),
];
/** Modules of the same kind that a checkout may not have yet (the AIS feed that scripts/live.js imports): stage.sh's `present(...)` after the second list. */
export const BUNDLE_MODULES_OPTIONAL = ["src/server/ais.js", "src/anime/world/life/ais.js"];
/** The voucher check, a dynamic import from server.js when /api/play/voucher/check is asked: stage.sh's third archive, taken only when the checkout has it. */
export const BUNDLE_VOUCHER = ["src/anime/play/missions/voucher.js"];
/** The three server files, copied to the root of the bundle. */
export const BUNDLE_SERVER = ["server.js", "static.js", "jpyc.js"];

/**
 * Whether dist/<rel> stays out of public/: a dot file or folder (a headless Chrome profile in dist/ once broke an upload), a
 * source map, the private per-port builds of the test tools (anime-<port>), the JPYC e2e screenshots (JPYC_SHOTS=dist/jpyc-shots
 * would otherwise ship them), the folders the QA and screenshot tools write (qa3/, <name>-shots/) and the old dev fixtures
 * (nothing loads them). The same rule as stage.sh's rsync excludes; a name with a slash after it in rsync (fixtures/, qa3/,
 * *-shots/) matches folders only.
 */
export function skipDist(rel, isDir = false) {
  return rel.split("/").some((n, i, a) => {
    const folder = isDir || i < a.length - 1;
    return n.startsWith(".") || n.endsWith(".map") || /^anime-/.test(n) || /^jpyc-shots/.test(n) || (folder && (n === "fixtures" || n === "qa3" || /-shots$/.test(n)));
  });
}

/** The tracked files under `entry`, or null (no git, not a repository, nothing tracked there). */
export function gitLs(root, entry) {
  try {   // (node:child_process: inside `bun test` 1.3.14 a Bun.spawnSync child's stdout can come back empty)
    const out = execFileSync("git", ["-C", root, "ls-files", "-z", "--", entry], { stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 26 }).toString().split("\0").filter(Boolean);
    return out.length ? out : null;
  } catch { return null; }
}

/** The files under `entry` (a file or a folder of the checkout): its tracked files when git is there (what `git archive` ships), else every file. */
export function filesOf(root, entry, { git = existsSync(join(root, ".git")), ls = gitLs } = {}) {
  if (git) { const out = ls(root, entry); if (out) return out; }
  const abs = join(root, entry);
  if (!existsSync(abs)) return [];
  if (statSync(abs).isFile()) return [entry];
  const out = [];
  (function walk(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p); else if (e.isFile()) out.push(relative(root, p));
    }
  })(abs);
  return out.sort();
}

function copyFile(from, to) { mkdirSync(dirname(to), { recursive: true }); cpSync(from, to); }

/** The server's modules, imported from inside the bundle (the check at the end of stage.sh). Throws with Bun's message when one does not resolve. */
export function verifyBundle(out) {
  const code = "await import('./scripts/live.js'); await import('./src/server/live.js'); await import('./jpyc.js'); await import('./static.js');";
  const env = { ...process.env }; delete env.NODE_OPTIONS;
  try { execFileSync(process.execPath, ["-e", code], { cwd: out, env, stdio: ["ignore", "pipe", "pipe"] }); }
  catch (e) { throw new Error(`bundle: a server module does not resolve inside ${out}:\n${String(e.stderr || e.message).trim().slice(-800)}`); }
}

/** Builds the bundle. -> { out, public: n files, data: n files, modules: n files, precompress: {...} | null }. `verify`: import the server's modules from inside the bundle (the command line does; the tests' small checkouts have no real modules). */
export function makeBundle({ root = ROOT, dist = join(root, "dist"), out = join(root, "bundle"), compress = true, verify = false, log = console.log } = {}) {
  if (!existsSync(join(dist, "index.html"))) throw new Error(`bundle: ${dist}/index.html is missing: build the app first (bun run build)`);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, "public"), { recursive: true });
  // the build
  let nPublic = 0;
  cpSync(dist, join(out, "public"), {
    recursive: true,
    filter: (src) => { const rel = relative(dist, src); if (rel === "") return true; const keep = !skipDist(rel, statSync(src).isDirectory()); if (keep && statSync(src).isFile()) nPublic++; return keep; },
  });
  const html = readFileSync(join(out, "public/index.html"), "utf8");
  for (const c of new Set(html.match(/chunk-[a-z0-9]+\.(?:js|css)/g) ?? [])) {
    if (!existsSync(join(out, "public", c))) throw new Error(`bundle: index.html names ${c}, which is not in the bundle`);
  }
  // data, then the /api/live modules
  let nData = 0, nModules = 0;
  for (const e of [...BUNDLE_DATA, ...BUNDLE_DATA_OPTIONAL]) for (const f of filesOf(root, e)) { copyFile(join(root, f), join(out, f)); nData++; }   // (an optional entry the checkout lacks gives no files)
  for (const e of [...BUNDLE_MODULES, ...BUNDLE_MODULES_OPTIONAL, ...BUNDLE_VOUCHER]) for (const f of filesOf(root, e)) { copyFile(join(root, f), join(out, f)); nModules++; }
  for (const f of BUNDLE_SERVER) copyFile(join(root, "server/app", f), join(out, f));
  if (verify) verifyBundle(out);
  let pre = null;
  if (compress) pre = precompress([join(out, "public"), join(out, "data")]);
  log(`bundle: ${out}: public ${nPublic} files, data ${nData} files, modules ${nModules} files${pre ? `; precompress ${pre.files} files, ${pre.written} siblings` : ""}`);
  return { out, public: nPublic, data: nData, modules: nModules, precompress: pre };
}

if (import.meta.main) {
  const a = process.argv.slice(2), opt = (k, d) => (a.includes(k) ? a[a.indexOf(k) + 1] : d);
  const t0 = Date.now();
  try {
    makeBundle({ dist: resolve(opt("--dist", join(ROOT, "dist"))), out: resolve(opt("--out", join(ROOT, "bundle"))), compress: !a.includes("--no-precompress"), verify: !a.includes("--no-verify") });
  } catch (e) { console.error(e.message); process.exit(1); }
  console.log(`bundle: done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
