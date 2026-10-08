// Static files for the production app server (server/app/server.js), with precompressed siblings.
// server/app/precompress.mjs writes name.br and name.gz beside each compressible file when the bundle is staged. A client
// that accepts br (else gzip) gets the sibling, with the original's content type; anyone else gets the file as it is.
// Why: the startup data went out raw (layout.json 10.5 MB -> 1.8 MB br, grids.bin 11.8 MB -> 2.0 MB br).
import { join, normalize } from "node:path";

/** Preferred first. */
export const ENCODINGS = [["br", ".br"], ["gzip", ".gz"]];

/** `rel` resolved under `base`, or null when it would leave it. */
export function inside(base, rel) { const p = normalize(join(base, rel)); return p.startsWith(base + "/") ? p : null; }

/** The q-value an Accept-Encoding header gives `enc` (0 = absent or refused). Only named codings count, never `*`. */
export function acceptQ(header, enc) {
  for (const part of String(header || "").toLowerCase().split(",")) {
    const [name, ...params] = part.trim().split(";");
    if (name.trim() !== enc) continue;
    let q = 1;
    for (const prm of params) { const m = prm.trim().match(/^q=([0-9.]+)$/); if (m) q = Number(m[1]); }
    return Number.isFinite(q) ? q : 0;
  }
  return 0;
}

/** The file at `p` (null = outside the root), with `cache` as Cache-Control; its .br / .gz sibling when `req` accepts it. */
export async function serveFile(p, { cache = "no-cache", req = null } = {}) {
  if (!p) return new Response("not found", { status: 404 });
  const f = Bun.file(p);
  if (!(await f.exists())) return new Response("not found", { status: 404 });
  const headers = { "cache-control": cache, "x-content-type-options": "nosniff" };
  const accept = req?.headers?.get("accept-encoding") ?? "";
  let vary = false;
  for (const [enc, ext] of ENCODINGS) {
    const c = Bun.file(p + ext);
    if (!(await c.exists())) continue;
    vary = true;   // the answer depends on Accept-Encoding: caches must key on it
    if (acceptQ(accept, enc) > 0) return new Response(c, { headers: { ...headers, "content-type": f.type, "content-encoding": enc, vary: "accept-encoding" } });
  }
  return new Response(f, { headers: vary ? { ...headers, vary: "accept-encoding" } : headers });
}
