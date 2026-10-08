// The Railway-from-GitHub build: server/app/bundle.mjs assembles the production bundle from a checkout (what server/app/stage.sh
// does from a commit), railway.json runs it, and package.json carries the scripts and the pins it relies on.
import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BUNDLE_DATA, BUNDLE_DATA_OPTIONAL, BUNDLE_MODULES, BUNDLE_MODULES_OPTIONAL, BUNDLE_SERVER, BUNDLE_VOUCHER, filesOf, gitLs, makeBundle, skipDist, verifyBundle } from "../server/app/bundle.mjs";
import { gitShort } from "../scripts/anime/buildinfo.js";

const ROOT = join(import.meta.dir, "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const tmp = () => mkdtempSync(join(tmpdir(), "klc-railway-"));
const put = (root, rel, text = "x") => { mkdirSync(join(root, rel, ".."), { recursive: true }); writeFileSync(join(root, rel), text); };
const walk = (dir, base = dir, out = []) => { for (const e of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) walk(p, base, out); else out.push(p.slice(base.length + 1)); } return out.sort(); };
const braces = (w) => { const m = w.match(/^(.*)\{([^}]+)\}(.*)$/); return m ? m[2].split(",").map((x) => m[1] + x + m[3]) : [w]; };
// stage.sh's archive lines: the paths every commit has, then `$(present a b)`: the paths the commit may not have yet
const optionalOf = (s) => [...s.matchAll(/\$\(present ([^)]*)\)/g)].flatMap((m) => m[1].trim().split(/\s+/));
const requiredOf = (s) => s.replace(/\$\(present [^)]*\)/g, " ").trim().split(/\s+/).flatMap(braces);

describe("bundle.mjs ships what stage.sh ships", () => {
  const stage = read("server/app/stage.sh").replace(/\\\n/g, " ");
  const archives = [...stage.matchAll(/archive "\$C" ([^|]+)\|/g)].map((m) => m[1].trim());
  test("stage.sh makes three git archives: the data, the /api/live modules and the voucher check", () => { expect(archives.length).toBe(3); expect(archives[2]).toBe("$v"); });
  test("the data entries are the same, in the same order, and so are the ones a commit may lack", () => { expect(BUNDLE_DATA).toEqual(requiredOf(archives[0])); expect(BUNDLE_DATA_OPTIONAL).toEqual(optionalOf(archives[0])); });
  test("the module entries are the same, in the same order, and so are the ones a commit may lack", () => { expect(BUNDLE_MODULES).toEqual(requiredOf(archives[1])); expect(BUNDLE_MODULES_OPTIONAL).toEqual(optionalOf(archives[1])); });
  test("the voucher module is the one stage.sh takes when the commit has it", () => { expect(BUNDLE_VOUCHER).toEqual(optionalOf(stage.match(/\bv=\$\(present [^)]*\)/)[0])); });
  test("the three server files are the ones stage.sh copies from server/app", () => {
    expect(BUNDLE_SERVER).toEqual(["server.js", "static.js", "jpyc.js"]);
    for (const f of BUNDLE_SERVER) { expect(existsSync(join(ROOT, "server/app", f))).toBe(true); expect(stage).toContain(`server/app/${f}`); }
  });
  test("every entry exists in the repository (the optional ones too: this repository has them all, so a typo would show)", () => {
    for (const e of [...BUNDLE_DATA, ...BUNDLE_DATA_OPTIONAL, ...BUNDLE_MODULES, ...BUNDLE_MODULES_OPTIONAL, ...BUNDLE_VOUCHER]) expect([e, filesOf(ROOT, e).length > 0]).toEqual([e, true]);
  });
  test("the dist filter is stage.sh's rsync excludes: dot files, maps, anime-<port>, jpyc-shots*, fixtures/, qa3/, *-shots/", () => {
    for (const x of ["--exclude '.*'", "--exclude '*.map'", "--exclude 'anime-*'", "--exclude 'jpyc-shots*'", "--exclude 'fixtures/'", "--exclude 'qa3/'", "--exclude '*-shots/'"]) expect(stage).toContain(x);
    for (const rel of [".chrome/x", "a/.DS_Store", "chunk-ab12.js.map", "anime-9425/index.html", "anime-9425", "jpyc-shots/a.png", "jpyc-shots-phone", "fixtures", "fixtures/live.json", "a/fixtures/b.json", "qa3", "qa3/report.json", "a/qa3/b.json", "play-shots", "r2-shots/a.png", "a/b-shots/c.png"]) expect([rel, skipDist(rel, !rel.includes("."))]).toEqual([rel, true]);
    for (const rel of ["index.html", "chunk-ab12.js", "chunk-ab12.css", "licenses/three.txt", "fonts/a.woff2", "style-x.css", "qa3", "qa3.js", "shots/a.png", "my-shots.png"]) expect([rel, skipDist(rel, false)]).toEqual([rel, false]);   // (a slash after the name in rsync means folders only: a file called qa3 stays)
  });
});

describe("makeBundle on a small checkout", () => {
  function checkout() {
    const root = tmp();
    for (const f of BUNDLE_SERVER) put(root, `server/app/${f}`, `// ${f}\n`);
    put(root, "data/anime/layout.json", JSON.stringify({ lots: Array.from({ length: 400 }, (_, i) => ({ id: i, name: "気仙沼" })) }));
    put(root, "data/shops/jpyc.json", "{}"); put(root, "data/tour.json", "{}"); put(root, "data/buildings/coast.json", "{}");
    put(root, "data/local/crew.json", "{}");            // not in the list: must not ship
    put(root, "src/server/live.js"); put(root, "src/core/geo.js"); put(root, "scripts/live.js"); put(root, "scripts/live/sky.js"); put(root, "scripts/live/fixtures/a.txt");
    put(root, "scripts/live/secret-helper.js");          // not in the list: must not ship
    const dist = join(root, "dist");
    put(dist, "index.html", '<script src="/chunk-abc123.js"></script><link href="/chunk-abc123.css">');
    put(dist, "chunk-abc123.js", "export {}"); put(dist, "chunk-abc123.css", "a{}"); put(dist, "chunk-abc123.js.map", "{}");
    put(dist, ".chrome/Default/x", "x"); put(dist, "anime-9425/index.html", "x"); put(dist, "jpyc-shots/a.png", "x"); put(dist, "fixtures/live.json", "{}");
    put(dist, "qa3/report.json", "{}"); put(dist, "play-shots/a.png", "x");   // the QA and screenshot tools' folders: must not ship
    put(dist, "licenses/three.txt", "MIT");
    return { root, dist };
  }
  test("copies the build without the dev leftovers, the listed data and modules, and the server files", () => {
    const { root, dist } = checkout(), out = join(root, "bundle");
    try {
      const r = makeBundle({ root, dist, out, compress: false, log: () => {} });
      expect(walk(out)).toEqual([
        "data/anime/layout.json", "data/buildings/coast.json", "data/shops/jpyc.json", "data/tour.json",
        "jpyc.js", "public/chunk-abc123.css", "public/chunk-abc123.js", "public/index.html", "public/licenses/three.txt",
        "scripts/live.js", "scripts/live/fixtures/a.txt", "scripts/live/sky.js", "server.js", "src/core/geo.js", "src/server/live.js", "static.js",
      ]);
      expect(r.public).toBe(4); expect(r.data).toBe(4); expect(r.modules).toBe(5);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  test("a second run replaces the first (no stale file survives)", () => {
    const { root, dist } = checkout(), out = join(root, "bundle");
    try {
      makeBundle({ root, dist, out, compress: false, log: () => {} });
      put(out, "public/old-chunk.js"); rmSync(join(dist, "chunk-abc123.css"));
      put(dist, "index.html", '<script src="/chunk-abc123.js"></script>');
      makeBundle({ root, dist, out, compress: false, log: () => {} });
      expect(existsSync(join(out, "public/old-chunk.js"))).toBe(false); expect(existsSync(join(out, "public/chunk-abc123.css"))).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  test("the entries a checkout may lack ship when it has them (the play data, the AIS modules, the voucher check)", () => {
    const { root, dist } = checkout(), out = join(root, "bundle");
    try {
      put(root, "data/play/courses.json", "{}"); put(root, "data/play/art/a.webp");
      put(root, "data/play-i18n.json", "{}");                    // beside data/play, not under it: bundled into the build, must not ship
      put(root, "src/server/ais.js"); put(root, "src/anime/world/life/ais.js"); put(root, "src/anime/play/missions/voucher.js");
      put(root, "src/anime/play/missions/logic.js");             // beside the voucher check: must not ship
      const r = makeBundle({ root, dist, out, compress: false, log: () => {} });
      const got = walk(out);
      for (const f of ["data/play/courses.json", "data/play/art/a.webp", "src/server/ais.js", "src/anime/world/life/ais.js", "src/anime/play/missions/voucher.js"]) expect([f, got.includes(f)]).toEqual([f, true]);
      for (const f of ["data/play-i18n.json", "src/anime/play/missions/logic.js", "data/local/crew.json", "scripts/live/secret-helper.js"]) expect([f, got.includes(f)]).toEqual([f, false]);
      expect(r.data).toBe(6); expect(r.modules).toBe(8);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  test("precompression writes .br and .gz beside the large compressible files only", () => {
    const { root, dist } = checkout(), out = join(root, "bundle");
    try {
      const r = makeBundle({ root, dist, out, compress: true, log: () => {} });
      expect(r.precompress.written).toBeGreaterThanOrEqual(2);
      expect(existsSync(join(out, "data/anime/layout.json.br"))).toBe(true); expect(existsSync(join(out, "data/anime/layout.json.gz"))).toBe(true);
      expect(statSync(join(out, "data/anime/layout.json.br")).size).toBeLessThan(statSync(join(out, "data/anime/layout.json")).size / 3);
      expect(existsSync(join(out, "server.js.br"))).toBe(false);   // outside public/ and data/
      expect(existsSync(join(out, "public/chunk-abc123.js.br"))).toBe(false);   // under 1 KB
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  test("a build that names a missing chunk, or no build at all, stops the assembly", () => {
    const { root, dist } = checkout(), out = join(root, "bundle");
    try {
      rmSync(join(dist, "chunk-abc123.js"));
      expect(() => makeBundle({ root, dist, out, compress: false, log: () => {} })).toThrow(/chunk-abc123\.js/);
      expect(() => makeBundle({ root, dist: join(root, "nope"), out, compress: false, log: () => {} })).toThrow(/build the app first/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  test("outside a git checkout every file under an entry is taken; inside one, the tracked files (what git archive ships)", () => {
    const root = tmp();
    try {
      put(root, "data/shops/a.json"); put(root, "data/shops/sub/b.json");
      expect(filesOf(root, "data/shops", { git: false })).toEqual(["data/shops/a.json", "data/shops/sub/b.json"]);
      expect(filesOf(root, "data/tour.json", { git: false })).toEqual([]);
      expect(filesOf(root, "data/shops", { git: true, ls: () => ["data/shops/a.json"] })).toEqual(["data/shops/a.json"]);   // git's answer wins over the folder
      expect(filesOf(root, "data/shops", { git: true, ls: () => null })).toEqual(["data/shops/a.json", "data/shops/sub/b.json"]);   // nothing tracked there: the folder
      expect(gitLs(root, "data/shops")).toBeNull();   // not a repository
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

describe("verifyBundle: the server's modules are imported from inside the bundle", () => {
  const bundleWith = (live) => { const root = tmp(); put(root, "scripts/live.js", live); for (const f of ["src/server/live.js", "jpyc.js", "static.js"]) put(root, f, "export {};"); return root; };
  test("a bundle whose modules resolve passes", () => {
    const root = bundleWith("export {};");
    try { expect(() => verifyBundle(root)).not.toThrow(); } finally { rmSync(root, { recursive: true, force: true }); }
  });
  test("a module that imports a file the bundle lacks stops the assembly (src/server/ais.js once crashed a staged server)", () => {
    const root = bundleWith('import "../src/server/ais.js"; export {};');
    // (outside `bun test` the message carries Bun's own line, "Cannot find module '../src/server/ais.js'"; inside Bun 1.3.14's runner a piped child's stderr comes back empty)
    try { expect(() => verifyBundle(root)).toThrow(/a server module does not resolve inside/); } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

describe("the build stamp has a commit on Railway", () => {
  test("git first; else RAILWAY_GIT_COMMIT_SHA shortened to 7; else nothing", () => {
    expect(gitShort("/nonexistent/dir", { RAILWAY_GIT_COMMIT_SHA: "0123456789abcdef0123456789abcdef01234567" })).toBe("0123456");
    expect(gitShort("/nonexistent/dir", { RAILWAY_GIT_COMMIT_SHA: "not-a-sha" })).toBe("");
    expect(gitShort("/nonexistent/dir", {})).toBe("");
    expect(gitShort(ROOT, { RAILWAY_GIT_COMMIT_SHA: "0123456789abcdef" })).toMatch(/^[0-9a-f]{7}$/);   // a checkout with .git keeps answering from git (or the variable, never throws)
  });
});

describe("railway.json and package.json", () => {
  const rj = JSON.parse(read("railway.json")), pkg = JSON.parse(read("package.json"));
  test("Railpack builds with `bun run build:railway` and starts the bundle; the health check is /healthz", () => {
    expect(rj.build.builder).toBe("RAILPACK"); expect(rj.build.buildCommand).toBe("bun run build:railway");
    expect(rj.deploy.startCommand).toBe("cd bundle && bun server.js");
    expect(rj.deploy.healthcheckPath).toBe("/healthz"); expect(rj.deploy.healthcheckTimeout).toBeGreaterThan(0);
    expect(rj.deploy.restartPolicyType).toBe("ON_FAILURE");
    expect(read("server/app/server.js")).toContain('"/healthz"');
  });
  test("the scripts build, assemble and start", () => {
    expect(pkg.scripts["build:railway"]).toBe("bun run build && bun server/app/bundle.mjs");
    expect(pkg.scripts.start).toBe(rj.deploy.startCommand);
  });
  test("Bun is pinned, and astronomy-engine (imported by scripts/live/sky.js) is a dependency of its own", () => {
    expect(pkg.engines.bun).toMatch(/^\d+\.\d+\.\d+$/);
    expect(read("scripts/live/sky.js")).toContain('from "astronomy-engine"');
    expect(pkg.dependencies["astronomy-engine"]).toBeTruthy();
    expect(read("bun.lock")).toContain('"astronomy-engine": "^');
  });
  test("the bundle folder is not committed", () => { expect(read(".gitignore").split("\n")).toContain("bundle/"); });
  test("a bundle uploaded by hand gets server/app/upload/: Bun, astronomy-engine and nothing else", () => {
    const up = JSON.parse(read("server/app/upload/package.json"));
    expect(up.scripts.start).toBe("bun server.js"); expect(Object.keys(up.dependencies)).toEqual(["astronomy-engine"]);
    expect(up.dependencies["astronomy-engine"]).toBe(pkg.dependencies["astronomy-engine"]);
    expect(read("server/app/upload/bun.lock")).toContain('"astronomy-engine@2.');
    expect(read("server/app/upload/.gitignore")).toContain("node_modules");
    expect(read("server/app/README.md")).toContain("server/app/upload/");
  });
});
