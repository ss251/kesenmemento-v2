// Contributor backend: private file storage (screenshots, original photos, previews).
//
// Two interchangeable adapters behind one interface:
//
//   put(key, bytes, {contentType})   store a file (disk: atomic temp-file + rename)
//   open(key)                        {size, body} for streaming into a Response, or null when missing
//   remove(keys)                     delete files; missing ones are fine
//   exists(key)                      boolean
//   list(prefix)                     [{key, size}] (tests, maintenance)
//   health()                         round-trips a probe object; throws when the store is unusable
//
// Keys look like `submissions/2026/10/<id>/photo-1.jpg`. Files are never served publicly: the only way out is
// the admin-only /admin/files/<key> route, which streams through the service. `createStorage(config)` picks the
// adapter from STORAGE; `createS3Storage({client})` takes any object with Bun's S3Client shape (tests pass a fake).
import { mkdirSync, renameSync, rmSync, readdirSync, rmdirSync, statSync, chmodSync } from "node:fs";
import { join, dirname, resolve, sep } from "node:path";
import { randomId, makeDataDir } from "./util.js";

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
/** Keys the admin file route may serve: exactly the layout this service writes. */
const SUBMISSION_KEY = /^submissions\/\d{4}\/\d{2}\/[a-z0-9]{8,40}\/[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

/**
 * A storage key is 1-8 slash-separated segments of letters, digits, dot, underscore and dash, none empty, none
 * starting with a dot. That excludes `..`, absolute paths, backslashes, NUL, percent escapes and spaces.
 * @param {unknown} key
 * @returns {key is string}
 */
export function isSafeKey(key) {
  if (typeof key !== "string" || key.length === 0 || key.length > 240) return false;
  const parts = key.split("/");
  return parts.length <= 8 && parts.every((p) => SEGMENT.test(p));
}

/** Is `key` one of the files this service stores for a submission? */
export const isSubmissionKey = (key) => typeof key === "string" && SUBMISSION_KEY.test(key);

function assertKey(key) {
  if (!isSafeKey(key)) throw new Error("unsafe storage key");
}

/** The content type for a stored key, from its extension (the DB holds the sniffed mime for photos). */
export function mimeForKey(key) {
  const ext = String(key).split(".").pop()?.toLowerCase();
  return { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic" }[ext] ?? "application/octet-stream";
}

// ------------------------------------------------------------------------------------------------------ disk

/**
 * Files under a directory. Directories are created 0700 and files 0600: other local users cannot read them.
 * @param {{dir: string}} opts
 */
export function createDiskStorage({ dir }) {
  const root = resolve(dir);
  makeDataDir(root); // a directory created under a checkout (the ./.contrib default) ignores itself in git

  /** Absolute path of a key, proven to stay inside the root. */
  function pathFor(key) {
    assertKey(key);
    const p = join(root, ...key.split("/"));
    if (!p.startsWith(root + sep)) throw new Error("unsafe storage key");
    return p;
  }

  /** Remove now-empty directories from `start` up to (not including) the root. */
  function pruneEmpty(start) {
    let d = start;
    while (d.startsWith(root + sep)) {
      try { if (readdirSync(d).length) break; rmdirSync(d); } catch { break; }
      d = dirname(d);
    }
  }

  return {
    kind: "disk",
    async put(key, bytes) {
      const p = pathFor(key);
      mkdirSync(dirname(p), { recursive: true, mode: 0o700 });
      const tmp = `${p}.tmp-${randomId(6)}`;
      try {
        await Bun.write(tmp, bytes);
        chmodSync(tmp, 0o600);
        renameSync(tmp, p);
      } catch (e) {
        rmSync(tmp, { force: true });
        throw e;
      }
    },
    async open(key) {
      const p = pathFor(key);
      const f = Bun.file(p);
      if (!(await f.exists())) return null;
      return { size: f.size, body: f };
    },
    async remove(keys) {
      for (const key of keys) {
        const p = pathFor(key);
        rmSync(p, { force: true });
        pruneEmpty(dirname(p));
      }
    },
    async exists(key) { return Bun.file(pathFor(key)).exists(); },
    async list(prefix = "") {
      const out = [];
      const walk = (d, rel) => {
        let entries;
        try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
          if (e.name.startsWith(".")) continue; // .gitignore and other dotfiles are not stored objects
          const r = rel ? `${rel}/${e.name}` : e.name;
          if (e.isDirectory()) walk(join(d, e.name), r);
          else if (r.startsWith(prefix) && !/\.tmp-/.test(r)) out.push({ key: r, size: statSync(join(d, e.name)).size });
        }
      };
      walk(root, "");
      return out.sort((a, b) => (a.key < b.key ? -1 : 1));
    },
    async health() {
      const key = `health/probe-${randomId(6)}.txt`;
      await this.put(key, "ok");
      const o = await this.open(key);
      await this.remove([key]);
      if (!o || o.size !== 2) throw new Error("disk storage probe failed");
    },
  };
}

// -------------------------------------------------------------------------------------------------------- S3

function isNotFound(e) {
  const s = `${e?.code ?? ""} ${e?.name ?? ""} ${e?.message ?? ""}`;
  return e?.status === 404 || e?.statusCode === 404 || /NoSuchKey|NotFound|not found|404/i.test(s);
}

/**
 * S3 or any S3-compatible service (Cloudflare R2, MinIO) through Bun's built-in S3Client. Objects are written
 * without an ACL, so they inherit the bucket's private default; keep "block public access" on.
 *
 * @param {object} opts
 * @param {string} [opts.bucket]
 * @param {string} [opts.region]
 * @param {string | null} [opts.endpoint]
 * @param {string | null} [opts.accessKeyId]
 * @param {string | null} [opts.secretAccessKey]
 * @param {S3Like} [opts.client] an object with Bun.S3Client's shape; built from the other options when omitted
 *
 * @typedef {object} S3Like
 * @property {(key: string) => {write: Function, stream: Function, exists: Function, delete: Function, stat: Function}} file
 * @property {(opts: object) => Promise<{contents?: Array<{key: string, size?: number}>, isTruncated?: boolean, nextContinuationToken?: string}>} list
 */
export function createS3Storage({ bucket, region, endpoint, accessKeyId, secretAccessKey, client }) {
  const s3 = client ?? new Bun.S3Client({
    bucket, region, ...(endpoint ? { endpoint } : {}),
    ...(accessKeyId ? { accessKeyId } : {}), ...(secretAccessKey ? { secretAccessKey } : {}),
  });
  return {
    kind: "s3",
    async put(key, bytes, { contentType } = {}) {
      assertKey(key);
      await s3.file(key).write(bytes, contentType ? { type: contentType } : undefined);
    },
    async open(key) {
      assertKey(key);
      const f = s3.file(key);
      let st;
      try { st = await f.stat(); } catch (e) { if (isNotFound(e)) return null; throw e; }
      return { size: Number(st.size), body: f.stream() };
    },
    async remove(keys) {
      for (const key of keys) {
        assertKey(key);
        try { await s3.file(key).delete(); } catch (e) { if (!isNotFound(e)) throw e; }
      }
    },
    async exists(key) { assertKey(key); return Boolean(await s3.file(key).exists()); },
    async list(prefix = "") {
      const out = [];
      let token;
      for (let page = 0; page < 1000; page++) {
        const r = await s3.list({ prefix, ...(token ? { continuationToken: token } : {}) });
        for (const c of r.contents ?? []) out.push({ key: c.key, size: Number(c.size ?? 0) });
        if (!r.isTruncated || !r.nextContinuationToken) break;
        token = r.nextContinuationToken;
      }
      return out.sort((a, b) => (a.key < b.key ? -1 : 1));
    },
    async health() {
      const key = `health/probe-${randomId(6)}.txt`;
      await this.put(key, "ok", { contentType: "text/plain" });
      const ok = await this.exists(key);
      await this.remove([key]);
      if (!ok) throw new Error("s3 storage probe failed");
    },
  };
}

/**
 * Build the adapter STORAGE selects.
 * @param {import("./config.js").ServiceConfig} config
 * @param {{s3Client?: S3Like}} [deps] tests pass a fake S3 client
 */
export function createStorage(config, deps = {}) {
  if (config.storage === "s3") return createS3Storage({ ...config.s3, client: deps.s3Client });
  return createDiskStorage({ dir: config.diskDir });
}
