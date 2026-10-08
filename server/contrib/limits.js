// Contributor backend: rate limiting, the upload gate and client-IP resolution.
//
// All state is in memory and keyed by a client key; nothing here is persisted or logged, so IP addresses never
// reach the database or the logs. A restart resets the counters (the per-contributor daily limit is counted from
// the database and survives restarts).

/**
 * Sliding-window event counter. `take(key, limit, windowMs)` records an event only when the key is under its
 * limit, so a rejected attempt does not extend its own lock-out.
 * @param {object} [opts]
 * @param {() => number} [opts.now] clock, epoch ms (tests inject one)
 * @param {number} [opts.maxKeys] memory bound: oldest keys are evicted beyond this
 */
export function createWindowCounter({ now = Date.now, maxKeys = 50000 } = {}) {
  /** @type {Map<string, {times: number[], windowMs: number}>} */
  const map = new Map();

  function live(key, windowMs) {
    let e = map.get(key);
    if (!e) { e = { times: [], windowMs }; map.set(key, e); }
    e.windowMs = Math.max(e.windowMs, windowMs);
    const cutoff = now() - windowMs;
    let i = 0;
    while (i < e.times.length && e.times[i] <= cutoff) i++;
    if (i) e.times.splice(0, i);
    return e;
  }

  function sweep() {
    const t = now();
    for (const [k, e] of map) if (!e.times.length || e.times[e.times.length - 1] <= t - e.windowMs) map.delete(k);
    if (map.size > maxKeys) {
      let drop = map.size - Math.floor(maxKeys * 0.9);
      for (const k of map.keys()) { if (drop-- <= 0) break; map.delete(k); }
    }
  }

  return {
    /** Events recorded for `key` inside the window. */
    count(key, windowMs) { return live(key, windowMs).times.length; },
    /** Record an event unconditionally; returns the count including it. */
    add(key, windowMs) {
      const e = live(key, windowMs);
      e.times.push(now());
      if (map.size > maxKeys) sweep();
      return e.times.length;
    },
    /**
     * Record an event if the key is under `limit` in the window.
     * @returns {{ok: true, remaining: number} | {ok: false, retryAfterMs: number}}
     */
    take(key, limit, windowMs) {
      const e = live(key, windowMs);
      if (e.times.length >= limit) return { ok: false, retryAfterMs: Math.max(1, e.times[0] + windowMs - now()) };
      e.times.push(now());
      if (map.size > maxKeys) sweep();
      return { ok: true, remaining: limit - e.times.length };
    },
    /** Milliseconds until `key` is under `limit` again (0 when it already is). */
    retryAfter(key, limit, windowMs) {
      const e = live(key, windowMs);
      return e.times.length < limit ? 0 : Math.max(1, e.times[e.times.length - limit] + windowMs - now());
    },
    /** Forget one key (a successful admin login clears its failure count). */
    reset(key) { map.delete(key); },
    sweep,
    get size() { return map.size; },
  };
}

/** Raised by a gate when the work (or the memory) it guards is fully booked and the wait queue is full or timed out. */
export class GateBusyError extends Error {
  constructor() { super("upload gate is busy"); this.name = "GateBusyError"; }
}

/**
 * Weighted semaphore with a bounded FIFO wait queue. `acquire(weight)` takes `weight` units out of `max` (1 by
 * default); with weight = bytes it is a memory budget, with weight 1 a concurrency limit. A request heavier than
 * the whole budget is capped to it (it then runs alone). Waiters give up after `waitMs` and past `maxQueue` are
 * refused at once, both with GateBusyError.
 * @param {number} max total units
 * @param {{maxQueue?: number, waitMs?: number}} [opts]
 */
export function createGate(max, { maxQueue = 16, waitMs = 20000 } = {}) {
  let active = 0;
  /** @type {Array<{weight: number, resolve: (release: () => void) => void, timer: any}>} */
  const queue = [];
  const releaser = (weight) => {
    let done = false;
    return () => {
      if (done) return;
      done = true;
      active -= weight;
      wake();
    };
  };
  function wake() {
    while (queue.length && active + queue[0].weight <= max) {
      const next = queue.shift();
      clearTimeout(next.timer);
      active += next.weight;
      next.resolve(releaser(next.weight));
    }
  }
  return {
    /**
     * @param {number} [weight]
     * @returns {Promise<() => void>} resolves with the release function; rejects with GateBusyError
     */
    acquire(weight = 1) {
      const w = Math.min(Math.max(1, Math.floor(weight)), max);
      if (!queue.length && active + w <= max) { active += w; return Promise.resolve(releaser(w)); }
      if (queue.length >= maxQueue) return Promise.reject(new GateBusyError());
      return new Promise((resolve, reject) => {
        const entry = { weight: w, resolve, timer: null };
        entry.timer = setTimeout(() => {
          const i = queue.indexOf(entry);
          if (i >= 0) { queue.splice(i, 1); wake(); }
          reject(new GateBusyError());
        }, waitMs);
        queue.push(entry);
      });
    },
    get active() { return active; },
    get queued() { return queue.length; },
  };
}

/**
 * Sliding-window sums per key (bytes uploaded per network per day). Like the event counter: memory only, bounded.
 * @param {{now?: () => number, maxKeys?: number}} [opts]
 */
export function createVolumeCounter({ now = Date.now, maxKeys = 50000 } = {}) {
  /** @type {Map<string, Array<[number, number]>>} */
  const map = new Map();
  const live = (key, windowMs) => {
    let a = map.get(key);
    if (!a) { a = []; map.set(key, a); }
    const cutoff = now() - windowMs;
    let i = 0;
    while (i < a.length && a[i][0] <= cutoff) i++;
    if (i) a.splice(0, i);
    return a;
  };
  return {
    /** Total weight recorded for `key` inside the window. */
    sum(key, windowMs) { return live(key, windowMs).reduce((s, [, w]) => s + w, 0); },
    /** Record `weight` for `key` now. */
    add(key, weight, windowMs) {
      live(key, windowMs).push([now(), weight]);
      if (map.size > maxKeys) {
        let drop = map.size - Math.floor(maxKeys * 0.9);
        for (const k of map.keys()) { if (drop-- <= 0) break; map.delete(k); }
      }
    },
    /** Milliseconds until the oldest entry leaves the window (0 when empty). */
    oldestAge(key, windowMs) { const a = live(key, windowMs); return a.length ? Math.max(1, a[0][0] + windowMs - now()) : 0; },
    get size() { return map.size; },
  };
}

// ---------------------------------------------------------------------------------------------- client address

/**
 * Normalise an address into a rate-limit key: IPv4 as is, IPv4-mapped IPv6 as IPv4, other IPv6 collapsed to its
 * /64 (a device rotates the lower 64 bits freely, so the prefix is the stable identity). Ports and zone ids are
 * dropped. Returns null for anything that is not an address.
 * @param {string | null | undefined} raw
 */
export function normalizeIp(raw) {
  if (!raw || typeof raw !== "string") return null;
  let s = raw.trim().toLowerCase();
  if (s.startsWith("[")) { const end = s.indexOf("]"); if (end < 0) return null; s = s.slice(1, end); }
  else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(s)) s = s.slice(0, s.lastIndexOf(":"));
  s = s.replace(/%.*$/, "");
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s);
  if (mapped) s = mapped[1];
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(s)) return s.split(".").every((p) => Number(p) <= 255) ? s : null;
  if (!/^[0-9a-f:]+$/.test(s) || !s.includes(":")) return null;
  const [head, tail, extra] = s.split("::");
  if (extra !== undefined) return null;
  const h = head ? head.split(":") : [], t = tail ? tail.split(":") : [];
  if (s.includes("::") ? h.length + t.length > 7 : h.length !== 8) return null;
  const groups = s.includes("::") ? [...h, ...Array(8 - h.length - t.length).fill("0"), ...t] : h;
  if (groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":") + "::/64";
}

/**
 * The rate-limit key of the client behind a request.
 * With `trustProxy = n > 0` the n-th entry from the right of X-Forwarded-For is used (the entries to its left
 * are client-supplied and can be forged; the right-most ones are appended by trusted proxies). Without it, or
 * when the header is absent, the socket address is used.
 * @param {Request} req
 * @param {{requestIP?: (r: Request) => {address: string} | null} | undefined} server the Bun server (or a fake)
 * @param {number} trustProxy
 */
export function clientIp(req, server, trustProxy = 0) {
  let ip = null;
  if (trustProxy > 0) {
    const xff = req.headers.get("x-forwarded-for");
    if (xff) {
      const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
      if (parts.length) ip = normalizeIp(parts[Math.max(0, parts.length - trustProxy)]);
    }
  }
  if (!ip) {
    let addr = null;
    try { addr = server?.requestIP?.(req)?.address ?? null; } catch { addr = null; }
    ip = normalizeIp(addr);
  }
  return ip ?? "unknown";
}
