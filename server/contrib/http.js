// Contributor backend: HTTP plumbing (errors, JSON responses, bounded body reads, CORS, security headers).

/** An error that maps straight to an HTTP response: `{ error: code, message }` with the given status. */
export class HttpError extends Error {
  /**
   * @param {number} status HTTP status
   * @param {string} code stable machine code (docs/contrib/API.md lists them)
   * @param {string} [message] developer-readable sentence
   * @param {{headers?: Record<string, string>, extra?: Record<string, unknown>}} [opts]
   */
  constructor(status, code, message = code, opts = {}) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.headers = opts.headers ?? {};
    this.extra = opts.extra ?? {};
  }
}

export const badRequest = (code, message, extra) => new HttpError(400, code, message, { extra });
export const unauthorized = (message = "missing or invalid credentials") => new HttpError(401, "unauthorized", message, { headers: { "www-authenticate": 'Bearer realm="kesennuma-contrib"' } });
export const forbidden = (code = "forbidden", message = "not allowed") => new HttpError(403, code, message);
export const notFound = (message = "not found") => new HttpError(404, "not_found", message);
export const tooMany = (retryAfterMs, code = "rate_limited", message = "too many requests, try again later") =>
  new HttpError(429, code, message, { headers: { "retry-after": String(Math.max(1, Math.ceil(retryAfterMs / 1000))) } });

/** Headers every response carries. */
export const BASE_HEADERS = Object.freeze({
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
});

/**
 * JSON response. API responses are never cached: they are per-contributor or admin-only.
 * @param {unknown} body
 * @param {number} [status]
 * @param {Record<string, string>} [headers]
 */
export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

/** The JSON error response for an HttpError. */
export function errorResponse(err) {
  return json({ error: err.code, message: err.message, ...err.extra }, err.status, err.headers);
}

/**
 * Read a request body into memory, refusing more than `maxBytes` without buffering the excess: the stream is
 * cancelled as soon as the running total passes the limit, whether or not Content-Length was honest.
 *
 * Slow-upload defences (optional): after `graceMs` the average speed must stay at or above `minBytesPerSec`, and
 * the whole body must arrive within `deadlineMs`; otherwise the read is cancelled with 408 `upload_too_slow` /
 * `upload_timeout`. A timer wakes the loop every second even when no data arrives, so a client that sends one byte
 * a minute cannot hold a slot (and its memory budget) for the length of Bun's idle timeout.
 * With `discard` the bytes are counted and thrown away (see drainBody) and an empty array is returned.
 * @param {Request} req
 * @param {number} maxBytes
 * @param {{minBytesPerSec?: number, graceMs?: number, deadlineMs?: number, discard?: boolean}} [opts]
 * @returns {Promise<Uint8Array>}
 */
export async function readBody(req, maxBytes, { minBytesPerSec = 0, graceMs = 0, deadlineMs = 0, discard = false } = {}) {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new HttpError(413, "payload_too_large", `request body is larger than ${maxBytes} bytes`);
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const chunks = [];
  let total = 0;
  const started = performance.now();
  const watch = Boolean(minBytesPerSec || deadlineMs);
  const interval = Math.max(10, Math.min(1000, graceMs ? graceMs / 2 : 1000));
  const verdict = () => {
    const elapsed = performance.now() - started;
    if (deadlineMs && elapsed > deadlineMs) return new HttpError(408, "upload_timeout", "the upload took too long to arrive");
    if (minBytesPerSec && elapsed > graceMs && total < (elapsed / 1000) * minBytesPerSec) return new HttpError(408, "upload_too_slow", "the upload is too slow; check the connection and try again");
    return null;
  };
  const abort = async (err) => { try { await reader.cancel(); } catch { /* already closed */ } throw err; };
  const TICK = Symbol("tick");
  try {
    let pending = reader.read();
    for (;;) {
      let result;
      if (watch) {
        let timer;
        const tick = new Promise((resolve) => { timer = setTimeout(resolve, interval, TICK); });
        result = await Promise.race([pending, tick]);
        clearTimeout(timer);
        if (result === TICK) { const why = verdict(); if (why) await abort(why); continue; }
      } else result = await pending;
      const { value, done } = result;
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) await abort(new HttpError(413, "payload_too_large", `request body is larger than ${maxBytes} bytes`));
      if (!discard) chunks.push(value);
      if (watch) { const why = verdict(); if (why) await abort(why); }
      pending = reader.read();
    }
  } finally {
    try { reader.releaseLock(); } catch { /* cancelled with a read pending */ }
  }
  if (discard) return new Uint8Array(0);
  if (chunks.length === 1) return chunks[0];
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.byteLength; }
  return out;
}

/**
 * Read and throw away what is left of a request body, within the same size and speed limits as readBody. A server
 * that answers before the body has arrived and then reuses the connection can desynchronise some clients: the tail
 * of the old body is taken for the start of the next request and comes back as a confusing 400 or 431. Never throws:
 * a body that is too large, too slow or already gone is simply not read, and the response is sent anyway.
 * @param {Request} req
 * @param {number} maxBytes
 * @param {{minBytesPerSec?: number, graceMs?: number, deadlineMs?: number}} [opts]
 */
export async function drainBody(req, maxBytes, opts = {}) {
  try { await readBody(req, maxBytes, { ...opts, discard: true }); } catch { /* the response goes out regardless */ }
}

/**
 * Read a small JSON object body. An empty body is `{}`; otherwise a JSON content type is required, and arrays and
 * scalars are rejected.
 * @param {Request} req
 * @param {number} [maxBytes]
 * @returns {Promise<Record<string, unknown>>}
 */
export async function readJson(req, maxBytes = 16 * 1024) {
  const bytes = await readBody(req, maxBytes);
  if (bytes.byteLength === 0) return {}; // no body at all is an empty object, whatever the content type
  const ct = (req.headers.get("content-type") ?? "").toLowerCase();
  if (!/^application\/(?:[a-z0-9.+-]*\+)?json\b/.test(ct)) throw new HttpError(415, "unsupported_media_type", "content-type must be application/json");
  let v;
  try { v = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { throw badRequest("invalid_json", "body is not valid JSON"); }
  if (v === null || typeof v !== "object" || Array.isArray(v)) throw badRequest("invalid_json", "body must be a JSON object");
  return v;
}

/**
 * Number of multipart delimiters (parts + the closing one) in a body, found with a plain byte search so a
 * hostile body of a million tiny parts is refused before the parser touches it.
 * @param {Uint8Array} bytes
 * @param {string} boundary
 */
export function countMultipartParts(bytes, boundary) {
  const needle = Buffer.from("--" + boundary, "latin1");
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let n = 0, pos = 0;
  while ((pos = buf.indexOf(needle, pos)) !== -1) { n++; pos += needle.length; }
  return n;
}

/** The boundary of a multipart/form-data content type, or null. */
export function multipartBoundary(contentType) {
  const m = /^multipart\/form-data\s*;.*?\bboundary=(?:"([^"]{1,200})"|([^;\s]{1,200}))/i.exec(contentType ?? "");
  return m ? (m[1] ?? m[2]) : null;
}

// ------------------------------------------------------------------------------------------------------ CORS

export const CORS_METHODS = "GET, HEAD, POST, PATCH, DELETE, OPTIONS";
export const CORS_HEADERS = "Authorization, Content-Type, Idempotency-Key, X-Admin-Name";

/**
 * Is this request's Origin acceptable? Listed origins are; so is the service's own origin (the admin page
 * calls its own API), judged by the request's Host and, behind a trusted proxy, X-Forwarded-Host. A request with
 * no Origin header (curl, server-to-server) is not a browser cross-site request and passes.
 * @param {string | null} origin
 * @param {URL} url
 * @param {string[]} allowed
 * @param {string[]} [ownHosts] extra host names that mean "this service" (see forwardedHosts)
 */
export function originAllowed(origin, url, allowed, ownHosts = []) {
  if (origin === null) return true;
  if (allowed.includes(origin)) return true;
  try {
    const host = new URL(origin).host;
    return host === url.host || ownHosts.includes(host);
  } catch { return false; }
}

/**
 * Host names this service is reachable under when a trusted proxy rewrote `Host`: the first X-Forwarded-Host entry.
 * Empty without proxy trust (a client could send any value, and only a browser's own Origin matters here).
 * @param {Request} req
 * @param {number} trustProxy
 * @returns {string[]}
 */
export function forwardedHosts(req, trustProxy) {
  if (!(trustProxy > 0)) return [];
  const first = (req.headers.get("x-forwarded-host") ?? "").split(",")[0].trim().toLowerCase();
  return /^[a-z0-9.-]+(?::\d{1,5})?$/.test(first) ? [first] : [];
}

/**
 * Add CORS headers for an allowed cross-origin caller. Credentials are bearer tokens in a header, never
 * cookies, so no Access-Control-Allow-Credentials is sent.
 * @param {Headers} headers
 * @param {string | null} origin
 * @param {URL} url
 * @param {string[]} allowed
 */
export function applyCors(headers, origin, url, allowed, ownHosts = []) {
  headers.append("vary", "Origin");
  if (origin && originAllowed(origin, url, allowed, ownHosts)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-expose-headers", "Retry-After, X-Request-Id, Content-Disposition, X-Total-Count");
  }
}

/** Preflight answer for an allowed origin. */
export function preflight(origin, url, allowed, ownHosts = []) {
  const h = new Headers();
  applyCors(h, origin, url, allowed, ownHosts);
  h.set("access-control-allow-methods", CORS_METHODS);
  h.set("access-control-allow-headers", CORS_HEADERS);
  h.set("access-control-max-age", "600");
  return new Response(null, { status: 204, headers: h });
}
