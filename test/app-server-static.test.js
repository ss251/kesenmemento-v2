// The production server's static files: precompressed siblings through Accept-Encoding (server/app/static.js) and the
// staging step that writes them (server/app/precompress.mjs).
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, existsSync, rmSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { join, resolve } from "node:path";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { acceptQ, serveFile, inside } from "../server/app/static.js";
import { precompress } from "../server/app/precompress.mjs";

const ROOT = resolve(import.meta.dir, "..");
let dir, json, small, noise;
const req = (ae) => new Request("http://x/", { headers: ae == null ? {} : { "accept-encoding": ae } });
const body = async (r) => Buffer.from(await r.arrayBuffer());

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "klc-static-"));
  mkdirSync(join(dir, "anime"));
  json = JSON.stringify({ items: Array.from({ length: 400 }, (_, i) => ({ id: i, name: "気仙沼 place " + i, x: i * 1.5 })) });
  writeFileSync(join(dir, "anime/layout.json"), json);
  writeFileSync(join(dir, "tiny.json"), "{\"a\":1}");
  noise = randomBytes(8192);   // incompressible
  writeFileSync(join(dir, "noise.bin"), noise);
  writeFileSync(join(dir, "pic.png"), Buffer.alloc(4096, 7));
  writeFileSync(join(dir, "gone.json.br"), "stale");
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("acceptQ: which codings a client takes", () => {
  test("named codings with their q-values; absent, refused and * count as 0", () => {
    expect(acceptQ("gzip, deflate, br", "br")).toBe(1);
    expect(acceptQ("gzip, deflate, br, zstd", "gzip")).toBe(1);
    expect(acceptQ("br;q=0, gzip", "br")).toBe(0);
    expect(acceptQ("gzip;q=0.5", "gzip")).toBe(0.5);
    expect(acceptQ("BR", "br")).toBe(1);
    expect(acceptQ("", "br")).toBe(0);
    expect(acceptQ(null, "gzip")).toBe(0);
    expect(acceptQ("*", "br")).toBe(0);
    expect(acceptQ("identity", "gzip")).toBe(0);
  });
});

describe("precompress: the staging step", () => {
  let r;
  beforeAll(() => { r = precompress([dir]); });
  test("a compressible file of 1 KB or more gets .br and .gz that decode to it", () => {
    const p = join(dir, "anime/layout.json");
    expect(brotliDecompressSync(readFileSync(p + ".br")).toString()).toBe(json);
    expect(gunzipSync(readFileSync(p + ".gz")).toString()).toBe(json);
  });
  test("small files, incompressible data and images get no siblings; a sibling whose source is gone is removed", () => {
    for (const f of ["tiny.json.br", "tiny.json.gz", "noise.bin.br", "noise.bin.gz", "pic.png.br", "pic.png.gz", "gone.json.br"]) expect([f, existsSync(join(dir, f))]).toEqual([f, false]);
  });
  test("totals: raw vs served bytes per coding", () => {
    expect(r.files).toBe(2);   // layout.json and noise.bin (tiny.json is under 1 KB, pic.png is not compressible)
    expect(r.written).toBe(2);
    expect(r.removed).toBe(1);
    expect(r.br).toBeLessThan(r.raw * 0.6);
    expect(r.raw).toBe(Buffer.byteLength(json) + noise.length);
  });
  test("a second run writes the same siblings again and removes nothing", () => {
    const again = precompress([dir]);
    expect(again.written).toBe(2); expect(again.removed).toBe(0);
  });
});

describe("serveFile: the sibling the client accepts, else the file", () => {
  const p = () => join(dir, "anime/layout.json");
  test("br when accepted, with the original's content type and Vary", async () => {
    const res = await serveFile(p(), { cache: "public, max-age=3600", req: req("gzip, deflate, br") });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-encoding")).toBe("br");
    expect(res.headers.get("content-type")).toMatch(/^application\/json/);
    expect(res.headers.get("vary")).toBe("accept-encoding");
    expect(res.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(brotliDecompressSync(await body(res)).toString()).toBe(json);
  });
  test("gzip when br is refused or not offered", async () => {
    for (const ae of ["gzip", "br;q=0, gzip"]) {
      const res = await serveFile(p(), { req: req(ae) });
      expect([ae, res.headers.get("content-encoding")]).toEqual([ae, "gzip"]);
      expect(gunzipSync(await body(res)).toString()).toBe(json);
    }
  });
  test("the file as it is without Accept-Encoding (still Vary, since the answer depends on it)", async () => {
    const res = await serveFile(p(), { req: req(null) });
    expect(res.headers.get("content-encoding")).toBeNull();
    expect(res.headers.get("vary")).toBe("accept-encoding");
    expect((await body(res)).toString()).toBe(json);
  });
  test("a file without siblings: as it is, no Vary; missing or outside the root: 404", async () => {
    const res = await serveFile(join(dir, "tiny.json"), { req: req("br") });
    expect(res.headers.get("content-encoding")).toBeNull(); expect(res.headers.get("vary")).toBeNull();
    expect((await serveFile(join(dir, "nope.json"), { req: req("br") })).status).toBe(404);
    expect((await serveFile(inside(dir, "../etc/passwd"), { req: req("br") })).status).toBe(404);
    expect(inside(dir, "anime/layout.json")).toBe(join(dir, "anime/layout.json"));
  });
});

describe("server.js: every static route goes through serveFile with the request", () => {
  const src = readFileSync(join(ROOT, "server/app/server.js"), "utf8");
  test("data, the page, the app's files and the /api/live fallback pass req; siblings are never served by name", () => {
    expect(src).toContain('serveFile(inside(DATA, p.slice(6)), { cache: "public, max-age=3600", req })');
    expect(src).toContain('serveFile(join(DIST, "index.html"), { cache: "no-cache", req })');
    expect(src).toContain('serveFile(inside(DIST, p.slice(1)), { cache: "public, max-age=86400", req })');
    expect(src).toContain('serveFile(join(DATA, "live/sample.json"), { cache: "no-store", req })');
    expect(src).toMatch(/\/\\\.\(br\|gz\)\$\/\.test\(p\)\) return new Response\("not found", \{ status: 404 \}\)/);
    expect(src).toContain('import { serveFile, inside } from "./static.js"');
  });
});
