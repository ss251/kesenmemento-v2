// Structured logs for the LINE bot. A line is one JSON object. Only SAFE_KEYS are written, so a
// token, a LINE user id, a photo, or a report body cannot land in the log by accident.
// User ids are logged only as user_ref (the HMAC), never as the raw LINE id.

import { createHash } from "node:crypto";

/** Keys a log line may contain. Everything else is dropped. */
export const SAFE_KEYS = Object.freeze(new Set([
  "event", "status", "ms", "code", "bytes", "port", "host", "version", "count", "kind",
  "reason", "name", "service", "route", "left", "mime", "user_ref", "ok", "storage",
]));

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

/**
 * @param {object} [opts]
 * @param {(line: string) => void} [opts.write]
 * @param {"debug" | "info" | "warn" | "error" | "silent"} [opts.level]
 * @param {() => number} [opts.now]
 */
export function createLogger({ write = (line) => process.stdout.write(line + "\n"), level = "info", now = Date.now } = {}) {
  const min = LEVELS[level] ?? LEVELS.info;
  function emit(lvl, event, fields = {}) {
    if (LEVELS[lvl] < min) return;
    const rec = { ts: new Date(now()).toISOString(), level: lvl, event: String(event).slice(0, 60) };
    for (const [k, v] of Object.entries(fields || {})) {
      if (!SAFE_KEYS.has(k) || k === "event") continue;
      if (typeof v === "number" || typeof v === "boolean") rec[k] = v;
      else if (typeof v === "string") rec[k] = v.replace(/[\u0000-\u001F\u007F]/g, " ").slice(0, 160);
    }
    write(JSON.stringify(rec));
  }
  return {
    debug: (e, f) => emit("debug", e, f),
    info: (e, f) => emit("info", e, f),
    warn: (e, f) => emit("warn", e, f),
    error: (e, f) => emit("error", e, f),
  };
}

/** A short fingerprint for tests that want to assert a log line has no secret. */
export function logFingerprint(line) {
  return createHash("sha256").update(line).digest("hex").slice(0, 12);
}
