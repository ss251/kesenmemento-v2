// Contributor backend: private file storage. The disk adapter on a temporary directory; the S3 adapter against
// (a) an in-memory fake with Bun's S3Client shape and (b) a fake S3 HTTP server on 127.0.0.1:8984 reached by Bun's
// real S3Client, so signing and the client's actual method behaviour are exercised too.
import { describe, test as bunTest, expect, beforeAll, afterAll } from "bun:test";
// a loaded machine (the gate runs tests at background priority) is many times slower than an idle one: generous per-test timeout
const test = (name, fn) => bunTest(name, fn, 60_000);
import { mkdtempSync, readdirSync, statSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDiskStorage, createS3Storage, createStorage, isSafeKey, isSubmissionKey, mimeForKey } from "../server/contrib/storage.js";
import { loadConfig } from "../server/contrib/config.js";

const tmp = () => mkdtempSync(join(tmpdir(), "contrib-storage-"));
const KEY = "submissions/2026/10/abcd1234efgh5678/photo-1.jpg";
const bytes = (n, v = 7) => new Uint8Array(n).fill(v);
const readAll = async (open) => new Uint8Array(await new Response(open.body).arrayBuffer());

describe("key rules", () => {
  test("safe keys are 1-8 segments of letters, digits, dot, underscore and dash", () => {
    for (const ok of [KEY, "a", "a/b", "health/probe-abc.txt", "x_y-z.1/ok"]) expect(isSafeKey(ok)).toBe(true);
    const bad = ["", "/abs", "a//b", "a/./b", "a/../b", "..", "../x", ".hidden", "a/.hidden", "a\\b", "a%2e%2e/b", "a b", "a\0b", "a/b/", "x".repeat(241), "a/b/c/d/e/f/g/h/i", "é", "a?b", "a#b"];
    for (const k of bad) expect([k, isSafeKey(k)]).toEqual([k, false]);
    expect(isSafeKey(undefined)).toBe(false);
    expect(isSafeKey(42)).toBe(false);
  });
  test("only the layout this service writes counts as a submission file (what the admin file route serves)", () => {
    for (const ok of ["submissions/2026/10/abcd1234efgh5678/photo-1.jpg", "submissions/2026/12/abcd1234efgh5678/screenshot.thumb.jpg", "submissions/2026/01/abcd1234/photo-6.preview.jpg"]) expect(isSubmissionKey(ok)).toBe(true);
    for (const bad of ["health/probe.txt", "submissions/26/10/abcd1234efgh5678/p.jpg", "submissions/2026/10/ABCD1234/p.jpg", "submissions/2026/10/abcd1234/../x.jpg", "submissions/2026/10/abcd1234/.hidden", "submissions/2026/10/abc/p.jpg", "other/2026/10/abcd1234/p.jpg", "submissions/2026/10/abcd1234/a/b.jpg"]) expect([bad, isSubmissionKey(bad)]).toEqual([bad, false]);
  });
  test("the content type follows the extension", () => {
    expect(mimeForKey("a/b.jpg")).toBe("image/jpeg");
    expect(mimeForKey("a/b.preview.jpg")).toBe("image/jpeg");
    expect(mimeForKey("a/b.png")).toBe("image/png");
    expect(mimeForKey("a/b.webp")).toBe("image/webp");
    expect(mimeForKey("a/b.heic")).toBe("image/heic");
    expect(mimeForKey("a/b.bin")).toBe("application/octet-stream");
    expect(mimeForKey("noext")).toBe("application/octet-stream");
  });
});

describe("disk storage", () => {
  test("put, open (streamed), exists, list and remove round-trip", async () => {
    const root = join(tmp(), "files");
    const st = createDiskStorage({ dir: root });
    expect(st.kind).toBe("disk");
    await st.put(KEY, bytes(1000, 9), { contentType: "image/jpeg" });
    await st.put("submissions/2026/10/abcd1234efgh5678/photo-1.preview.jpg", bytes(10));
    expect(await st.exists(KEY)).toBe(true);
    const o = await st.open(KEY);
    expect(o.size).toBe(1000);
    const got = await readAll(o);
    expect(got.length).toBe(1000);
    expect(got[0]).toBe(9);
    expect((await st.list("submissions/")).map((f) => [f.key, f.size])).toEqual([[KEY, 1000], ["submissions/2026/10/abcd1234efgh5678/photo-1.preview.jpg", 10]]);
    expect(await st.list("nothing/")).toEqual([]);
    await st.remove([KEY]);
    expect(await st.exists(KEY)).toBe(false);
    expect(await st.open(KEY)).toBeNull();
    await st.remove([KEY, "never/existed.jpg"]); // missing files are fine
  });
  test("a stored file streams straight into a Response with the right length", async () => {
    const st = createDiskStorage({ dir: tmp() });
    await st.put(KEY, bytes(4321, 1));
    const o = await st.open(KEY);
    const res = new Response(o.body, { headers: { "content-length": String(o.size) } });
    expect(res.headers.get("content-length")).toBe("4321");
    expect((await res.arrayBuffer()).byteLength).toBe(4321);
  });
  test("writes are atomic: no temp file is left, and a failed write leaves nothing behind and does not damage the old file", async () => {
    const root = tmp();
    const st = createDiskStorage({ dir: root });
    await st.put(KEY, bytes(10, 1));
    await st.put(KEY, bytes(20, 2)); // overwrite replaces
    expect((await readAll(await st.open(KEY)))[0]).toBe(2);
    const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
    expect(walk(root).filter((f) => f.includes(".tmp-"))).toEqual([]);
    // the parent "directory" is a file: mkdir fails, nothing is left over, the old file is intact
    await expect(st.put(KEY + "/child.jpg", bytes(5))).rejects.toThrow();
    expect(walk(root).filter((f) => f.includes(".tmp-"))).toEqual([]);
    expect((await readAll(await st.open(KEY))).length).toBe(20);
  });
  test("remove deletes now-empty folders up to the root, but never the root or a folder with other files", async () => {
    const root = join(tmp(), "files");
    const st = createDiskStorage({ dir: root });
    const a = "submissions/2026/10/aaaaaaaa1111/photo-1.jpg", b = "submissions/2026/10/bbbbbbbb2222/photo-1.jpg";
    await st.put(a, bytes(3));
    await st.put(b, bytes(3));
    await st.remove([a]);
    expect(existsSync(join(root, "submissions/2026/10/aaaaaaaa1111"))).toBe(false);
    expect(existsSync(join(root, "submissions/2026/10/bbbbbbbb2222"))).toBe(true);
    await st.remove([b]);
    expect(existsSync(join(root, "submissions"))).toBe(false);
    expect(existsSync(root)).toBe(true);
  });
  test("files are private: directories 0700, files 0600", async () => {
    const root = join(tmp(), "files");
    const st = createDiskStorage({ dir: root });
    await st.put(KEY, bytes(3));
    expect(statSync(join(root, "submissions")).mode & 0o777).toBe(0o700);
    expect(statSync(join(root, KEY)).mode & 0o777).toBe(0o600);
  });
  test("a key can never leave the storage directory", async () => {
    const parent = tmp();
    const root = join(parent, "files");
    const st = createDiskStorage({ dir: root });
    writeFileSync(join(parent, "secret.txt"), "top secret");
    for (const evil of ["../secret.txt", "a/../../secret.txt", "/etc/passwd", "..", "a/..", "%2e%2e/secret.txt", "a\\..\\secret.txt", "a/b\0c"]) {
      await expect(st.open(evil)).rejects.toThrow("unsafe storage key");
      await expect(st.put(evil, bytes(1))).rejects.toThrow("unsafe storage key");
      await expect(st.remove([evil])).rejects.toThrow("unsafe storage key");
      await expect(st.exists(evil)).rejects.toThrow("unsafe storage key");
    }
    expect(readFileSync(join(parent, "secret.txt"), "utf8")).toBe("top secret");
  });
  test("a data directory created under the working tree ignores itself in git", () => {
    const base = tmp();
    createDiskStorage({ dir: join(base, ".contrib", "files") });
    expect(readFileSync(join(base, ".contrib", ".gitignore"), "utf8")).toBe("*\n");
  });
  test("list skips dotfiles, and health round-trips a probe", async () => {
    const st = createDiskStorage({ dir: join(tmp(), "files") });
    await st.put(KEY, bytes(3));
    expect((await st.list()).map((f) => f.key)).toEqual([KEY]);
    await st.health();
    expect((await st.list()).map((f) => f.key)).toEqual([KEY]); // the probe is gone again
  });
  test("createStorage picks the adapter from STORAGE", () => {
    const base = { adminToken: "a".repeat(30), tokenSecret: "b".repeat(30) };
    const disk = createStorage(loadConfig({}, { ...base, diskDir: join(tmp(), "f") }));
    expect(disk.kind).toBe("disk");
    const fake = fakeS3();
    const s3 = createStorage(loadConfig({}, { ...base, storage: "s3", s3Bucket: "b", s3Region: "r", awsAccessKeyId: "k", awsSecretAccessKey: "s" }), { s3Client: fake });
    expect(s3.kind).toBe("s3");
  });
});

/** An in-memory stand-in with the shape of Bun's S3Client (file(key).write/stat/stream/exists/delete, list). */
function fakeS3({ failPutOn = null, pageSize = 2 } = {}) {
  const objects = new Map();
  const calls = [];
  const noSuchKey = () => Object.assign(new Error("The specified key does not exist."), { name: "S3Error", code: "NoSuchKey" });
  return {
    objects, calls,
    file(key) {
      return {
        async write(data, opts) {
          calls.push(["put", key, opts]);
          if (failPutOn && failPutOn(key)) throw Object.assign(new Error("simulated outage"), { name: "S3Error", code: "InternalError" });
          objects.set(key, { bytes: Buffer.from(typeof data === "string" ? data : data), type: opts?.type });
          return objects.get(key).bytes.length;
        },
        async stat() { const o = objects.get(key); if (!o) throw noSuchKey(); return { size: o.bytes.length, type: o.type }; },
        stream() { const o = objects.get(key); if (!o) throw noSuchKey(); return new Response(o.bytes).body; },
        async exists() { return objects.has(key); },
        async delete() { calls.push(["delete", key]); if (!objects.has(key)) throw noSuchKey(); objects.delete(key); },
      };
    },
    async list({ prefix = "", continuationToken } = {}) {
      const keys = [...objects.keys()].filter((k) => k.startsWith(prefix)).sort();
      const start = continuationToken ? Number(continuationToken) : 0;
      const page = keys.slice(start, start + pageSize);
      const more = start + pageSize < keys.length;
      return { contents: page.map((key) => ({ key, size: objects.get(key).bytes.length })), isTruncated: more, nextContinuationToken: more ? String(start + pageSize) : undefined };
    },
  };
}

describe("S3 storage against an in-memory fake", () => {
  test("put sends the content type; open streams the bytes with their size; missing objects are null", async () => {
    const fake = fakeS3();
    const st = createS3Storage({ client: fake });
    expect(st.kind).toBe("s3");
    await st.put(KEY, bytes(500, 4), { contentType: "image/jpeg" });
    expect(fake.calls[0]).toEqual(["put", KEY, { type: "image/jpeg" }]);
    const o = await st.open(KEY);
    expect(o.size).toBe(500);
    expect((await readAll(o))[0]).toBe(4);
    expect(await st.open("submissions/2026/10/nope1234/photo-1.jpg")).toBeNull();
    expect(await st.exists(KEY)).toBe(true);
    expect(await st.exists("a/b.jpg")).toBe(false);
  });
  test("remove deletes, tolerates missing objects, and surfaces real failures", async () => {
    const fake = fakeS3();
    const st = createS3Storage({ client: fake });
    await st.put(KEY, bytes(3));
    await st.remove([KEY, "gone/already.jpg"]);
    expect(fake.objects.size).toBe(0);
    const broken = { ...fake, file: (k) => ({ ...fake.file(k), delete: async () => { throw Object.assign(new Error("AccessDenied"), { code: "AccessDenied" }); } }) };
    await expect(createS3Storage({ client: broken }).remove([KEY])).rejects.toThrow("AccessDenied");
  });
  test("list follows continuation tokens across pages", async () => {
    const fake = fakeS3({ pageSize: 2 });
    const st = createS3Storage({ client: fake });
    for (let i = 1; i <= 5; i++) await st.put(`submissions/2026/10/abcd1234efgh5678/photo-${i}.jpg`, bytes(i));
    await st.put("health/x.txt", bytes(1));
    const all = await st.list("submissions/");
    expect(all.map((f) => f.size)).toEqual([1, 2, 3, 4, 5]);
    expect((await st.list()).length).toBe(6);
  });
  test("unsafe keys never reach the service; health round-trips a probe object", async () => {
    const fake = fakeS3();
    const st = createS3Storage({ client: fake });
    for (const evil of ["../x", "/abs", "a//b"]) {
      await expect(st.put(evil, bytes(1))).rejects.toThrow("unsafe storage key");
      await expect(st.open(evil)).rejects.toThrow("unsafe storage key");
      await expect(st.remove([evil])).rejects.toThrow("unsafe storage key");
    }
    expect(fake.calls).toEqual([]);
    await st.health();
    expect(fake.objects.size).toBe(0); // probe removed
    expect(fake.calls.map((c) => c[0])).toEqual(["put", "delete"]);
  });
  test("a failing upload surfaces as an error (the ingest pipeline then rolls back)", async () => {
    const st = createS3Storage({ client: fakeS3({ failPutOn: () => true }) });
    await expect(st.put(KEY, bytes(3))).rejects.toThrow("simulated outage");
  });
});

// ---------------------------------------------------------------------------------------------------------------
// A fake S3 server (path-style: /bucket/key) so Bun's real S3Client signs and sends real requests. Port 8984.

const S3_PORT = 8984, ACCESS_KEY = "AKIAFAKEKEYFORTEST", SECRET_KEY = "fake-secret-key-for-tests-only";
const s3Objects = new Map(), s3Requests = [];
let s3Server;
beforeAll(() => {
  s3Server = Bun.serve({
  port: S3_PORT, hostname: "127.0.0.1",
  async fetch(req) {
    const u = new URL(req.url);
    s3Requests.push({ method: req.method, path: u.pathname, auth: req.headers.get("authorization") ?? "", headers: Object.fromEntries(req.headers) });
    const auth = req.headers.get("authorization") ?? "";
    if (!auth.startsWith(`AWS4-HMAC-SHA256 Credential=${ACCESS_KEY}/`)) return new Response("<Error><Code>AccessDenied</Code></Error>", { status: 403, headers: { "content-type": "application/xml" } });
    if (req.method === "GET" && u.searchParams.get("list-type") === "2") {
      const prefix = u.searchParams.get("prefix") ?? "";
      const keys = [...s3Objects.keys()].filter((k) => k.startsWith(prefix)).sort();
      const xml = `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Name>klc</Name><Prefix>${prefix}</Prefix><KeyCount>${keys.length}</KeyCount><MaxKeys>1000</MaxKeys><IsTruncated>false</IsTruncated>${keys.map((k) => `<Contents><Key>${k}</Key><Size>${s3Objects.get(k).bytes.length}</Size></Contents>`).join("")}</ListBucketResult>`;
      return new Response(xml, { headers: { "content-type": "application/xml" } });
    }
    const m = /^\/klc\/(.+)$/.exec(u.pathname);
    if (!m) return new Response("bad", { status: 400 });
    const key = decodeURIComponent(m[1]);
    if (req.method === "PUT") { s3Objects.set(key, { bytes: new Uint8Array(await req.arrayBuffer()), type: req.headers.get("content-type") }); return new Response(null, { headers: { etag: '"x"' } }); }
    const o = s3Objects.get(key);
    if (req.method === "HEAD") return o ? new Response(null, { headers: { "content-length": String(o.bytes.length), "content-type": o.type ?? "application/octet-stream", etag: '"x"', "last-modified": new Date().toUTCString() } }) : new Response(null, { status: 404 });
    if (req.method === "GET") return o ? new Response(o.bytes, { headers: { "content-type": o.type ?? "application/octet-stream" } }) : new Response('<?xml version="1.0"?><Error><Code>NoSuchKey</Code></Error>', { status: 404, headers: { "content-type": "application/xml" } });
    if (req.method === "DELETE") { s3Objects.delete(key); return new Response(null, { status: 204 }); }
    return new Response("nope", { status: 405 });
  },
});
});
afterAll(() => s3Server?.stop(true));

describe("S3 storage through Bun's real S3Client against a fake S3 server", () => {
  const make = () => createS3Storage({ bucket: "klc", region: "us-east-1", endpoint: `http://127.0.0.1:${S3_PORT}`, accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY });
  test("put, stat/open, exists, list, remove over HTTP with signed requests", async () => {
    const st = make();
    await st.put(KEY, bytes(2048, 5), { contentType: "image/jpeg" });
    expect(s3Objects.get(KEY).type).toBe("image/jpeg");
    expect(await st.exists(KEY)).toBe(true);
    const o = await st.open(KEY);
    expect(o.size).toBe(2048);
    const got = await readAll(o);
    expect(got.length).toBe(2048);
    expect(got[100]).toBe(5);
    expect(await st.open("submissions/2026/10/missing12/photo-1.jpg")).toBeNull();
    expect(await st.exists("submissions/2026/10/missing12/photo-1.jpg")).toBe(false);
    expect((await st.list("submissions/")).map((f) => f.key)).toContain(KEY);
    await st.remove([KEY, "never/there.jpg"]);
    expect(s3Objects.has(KEY)).toBe(false);
    await st.health();
  });
  test("requests are SigV4-signed with the access key id, and the secret key never appears on the wire", async () => {
    const st = make();
    s3Requests.length = 0;
    await st.put("health/signed-check.txt", "hello", { contentType: "text/plain" });
    const r = s3Requests.find((q) => q.method === "PUT");
    expect(r.auth).toStartWith(`AWS4-HMAC-SHA256 Credential=${ACCESS_KEY}/`);
    expect(r.auth).toContain("SignedHeaders=");
    expect(r.auth).toContain("Signature=");
    expect(JSON.stringify(s3Requests)).not.toContain(SECRET_KEY);
    await st.remove(["health/signed-check.txt"]);
  });
  test("a bad credential is an error, not a silent success", async () => {
    const bad = createS3Storage({ bucket: "klc", region: "us-east-1", endpoint: `http://127.0.0.1:${S3_PORT}`, accessKeyId: "WRONGKEY", secretAccessKey: "x" });
    await expect(bad.put("health/x.txt", "x")).rejects.toThrow();
  });
  test("photos of 12 MB upload and read back intact (the largest a phone sends is under MAX_PHOTO_MB = 15)", async () => {
    const st = make();
    const big = new Uint8Array(12 * 1024 * 1024);
    for (let i = 0; i < big.length; i += 4096) big[i] = i % 251;
    await st.put("health/big.bin", big);
    const o = await st.open("health/big.bin");
    expect(o.size).toBe(big.length);
    const back = await readAll(o);
    expect(back.length).toBe(big.length);
    expect(back[4096 * 7]).toBe((4096 * 7) % 251);
    await st.remove(["health/big.bin"]);
  });
});
