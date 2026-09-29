// Polite cached fetches for the living layer: one request in flight per URL, a TTL per source, the last good body
// kept on disk (data/cache/live/, gitignored) so a dropped network serves the previous answer marked "cache".
import { join, resolve } from "node:path";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

export const ROOT = resolve(import.meta.dir, "../..");
export const CACHE_DIR = join(ROOT, "data/cache/live");
const cacheDir = () => process.env.KLC_LIVE_CACHE_DIR || CACHE_DIR;
const UA = "KesennumaLivingCity/2 (civic 3D demo for Kesennuma City; polls <= every 10 min)";
const mem = new Map(), inflight = new Map();

const keyOf = (url) => createHash("sha1").update(url).digest("hex").slice(0, 16);

function readDisk(url) {
  const p = join(cacheDir(), keyOf(url) + ".json");
  if (!existsSync(p)) return null;
  try { const j = JSON.parse(readFileSync(p, "utf8")); return { at: j.at, bytes: Uint8Array.from(Buffer.from(j.b64, "base64")) }; } catch { return null; }
}
function writeDisk(url, rec) {
  try { mkdirSync(cacheDir(), { recursive: true }); writeFileSync(join(cacheDir(), keyOf(url) + ".json"), JSON.stringify({ url, at: rec.at, b64: Buffer.from(rec.bytes).toString("base64") })); } catch { /* read-only checkout: memory cache only */ }
}

/**
 * -> { bytes: Uint8Array, at: ms, from: "live" | "cache" } ; throws when neither the network nor any cache answers.
 * ttlMs: reuse a cached body younger than this without a request.
 */
export async function cachedFetch(url, { ttlMs = 600000, timeoutMs = 8000, offline = process.env.KLC_LIVE_OFFLINE === "1", fetchImpl = fetch } = {}) {
  const now = Date.now();
  let rec = (process.env.KLC_LIVE_CACHE_DIR ? null : mem.get(url)) ?? readDisk(url);
  if (rec) mem.set(url, rec);
  if (rec && now - rec.at < ttlMs) return { ...rec, from: "live" };
  if (offline) { if (rec) return { ...rec, from: "cache" }; throw new Error("offline"); }
  if (!inflight.has(url)) {
    inflight.set(url, (async () => {
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        const r = await fetchImpl(url, { headers: { "user-agent": UA, accept: "*/*" }, signal: ctl.signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const bytes = new Uint8Array(await r.arrayBuffer());
        if (!bytes.length) throw new Error("empty body");
        const fresh = { at: Date.now(), bytes }; mem.set(url, fresh); writeDisk(url, fresh); return fresh;
      } finally { clearTimeout(timer); }
    })().finally(() => inflight.delete(url)));
  }
  try { return { ...(await inflight.get(url)), from: "live" }; }
  catch (e) { if (rec) return { ...rec, from: "cache", error: String(e.message ?? e) }; throw e; }
}

export const text = (r, enc = "utf-8") => new TextDecoder(enc).decode(r.bytes);
export const json = (r) => JSON.parse(text(r));
export function clearMemoryCache() { mem.clear(); }
