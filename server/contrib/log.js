// Contributor backend: structured logging that cannot leak personal data.
//
// Log lines are single-line JSON written to stdout (Railway captures them). Only the keys in SAFE_KEYS are ever
// emitted: a handler cannot accidentally log a nickname, a note, a クルーNo., a token, an IP address, a user agent
// or EXIF, because those keys are dropped here no matter what the caller passes. Request lines carry the matched
// route template (never the raw path or query), the status code and the duration.

/** Keys a log line may contain. Everything else is dropped. */
export const SAFE_KEYS = Object.freeze(new Set([
  "event", "rid", "method", "route", "status", "ms", "code", "bytes", "storage", "port", "host", "version",
  "count", "kind", "photos", "reason", "name", "service", "dbPath", "migrated", "from", "to", "message",
]));

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

/**
 * @param {object} [opts]
 * @param {(line: string) => void} [opts.write] sink; defaults to stdout
 * @param {"debug" | "info" | "warn" | "error" | "silent"} [opts.level]
 * @param {() => number} [opts.now] clock, epoch ms
 */
export function createLogger({ write = (line) => process.stdout.write(line + "\n"), level = "info", now = Date.now } = {}) {
  const min = LEVELS[level] ?? LEVELS.info;
  /** @param {keyof typeof LEVELS} lvl @param {string} event @param {Record<string, unknown>} [fields] */
  function emit(lvl, event, fields = {}) {
    if (LEVELS[lvl] < min) return;
    const rec = { ts: new Date(now()).toISOString(), level: lvl, event: String(event).slice(0, 60) };
    for (const [k, v] of Object.entries(fields)) {
      if (!SAFE_KEYS.has(k) || k === "event") continue;
      if (typeof v === "number" || typeof v === "boolean") rec[k] = v;
      else if (typeof v === "string") rec[k] = v.replace(/[\u0000-\u001F\u007F]/g, " ").slice(0, 160);
    }
    write(JSON.stringify(rec));
  }
  return {
    level,
    debug: (e, f) => emit("debug", e, f),
    info: (e, f) => emit("info", e, f),
    warn: (e, f) => emit("warn", e, f),
    error: (e, f) => emit("error", e, f),
  };
}

/** A logger that writes nothing (tests). */
export const silentLogger = createLogger({ level: "silent", write: () => {} });
