// [contrib] The client for the report backend (server/contrib, docs/contrib/API.md): the anonymous login, the multipart report with upload
// progress, my reports, the leaderboard, the device-transfer code, and deleting what I sent. Plain fetch (an XMLHttpRequest only for the upload,
// which is the one call that needs progress); fetch and XMLHttpRequest are injectable, so test/contrib-api.test.js runs it against a mocked fetch.
//
//   const api = createApi({ base, accounts })              base: resolveApiBase(location.search).base
//   await api.createContributor({ nickname, crewNo })      POST   /api/contrib/v1/contributors            -> { id, token }  (kept by `accounts`)
//   await api.me()                                         GET    /api/contrib/v1/me                      -> { id, nickname, crewNo, points, accepted, rank, submissions }
//   await api.updateProfile({ nickname, crewNo })          PATCH  /api/contrib/v1/me                      (crewNo '' removes it)
//   await api.submit(fields, { onProgress, signal, idempotencyKey })   POST /api/contrib/v1/submissions (multipart) -> { id, status, replayed }
//   await api.leaderboard(limit)                           GET    /api/contrib/v1/leaderboard?limit=20    -> [{ nickname, accepted, points, me }]
//   await api.transferCode()                               GET    /api/contrib/v1/me/transfer-code        -> { code, expiresAt }
//   await api.claim(code)                                  POST   /api/contrib/v1/contributors/claim      -> { id, token }  (kept by `accounts`)
//   await api.deleteMe()                                   DELETE /api/contrib/v1/me?confirm=1            -> { deletedFiles }  (the login is forgotten too)
//   await api.config()                                     GET    /api/contrib/v1/health                  -> { limits, points } | null  (what the operator configured)
// Every failure is a ContribError with a `code` (network, timeout, aborted, auth, banned, origin, validation, too_large, type, rate, daily, devices,
// server, bad_response, not_found, unknown) and the backend's own `reason` (daily_limit, invalid_nickname, code_malformed, ...) when it sent one;
// the sheet turns them into plain words (messageKey, explainError).
//
// GET /health also announces the limits and the default points the operator configured (`config()`): the sheet checks sizes with those before it uploads and
// shows the real points. An older backend says nothing there and the built-in numbers (its documented defaults) stay.
//
// The backend's JSON for /me is read in both spellings (createdAt / created_at, usedVersion / used_version, crewNo / crew_no, ...): the API
// doc has camelCase, the database snake_case, and a client that only knows one breaks on a rename.
import { CONTRIB_API, LIMITS, clampNote, cleanNickname, checkCrewNo, checkClaimCode, waitText } from './contrib-lib.js';
import { poseToJson } from '../core/pose.js';

export const PREFIX = '/api/contrib/v1';
const ERR_CODES = new Set(['network', 'timeout', 'aborted', 'auth', 'banned', 'origin', 'validation', 'too_large', 'type', 'rate', 'daily', 'devices', 'server', 'bad_response', 'not_found', 'unconfigured', 'unknown']);
/** The backend's own error codes that have a message of their own (the others are explained by the code above). */
const REASON_KEYS = new Set(['empty_submission', 'invalid_nickname', 'invalid_crew_no', 'fix_needs_photos', 'server_busy']);

export class ContribError extends Error {
  /** @param {string} code one of ERR_CODES @param {{status?: number, retryable?: boolean, detail?: any, reason?: string}} [o] */
  constructor(code, message, { status = 0, retryable = false, detail = null, reason = '' } = {}) {
    super(message || code);
    this.name = 'ContribError'; this.code = code; this.status = status; this.retryable = retryable; this.detail = detail; this.reason = reason;
  }
  /** Seconds the backend asked us to wait (Retry-After), or null. */
  get retryAfterSeconds() { return retryAfterSeconds(this.detail?.retryAfter); }
}
/** Retry-After as seconds: a number of seconds or an HTTP date; null when absent or unreadable. */
export function retryAfterSeconds(h, now = Date.now()) {
  if (h === null || h === undefined || h === '') return null;
  const n = Number(h);
  if (Number.isFinite(n)) return Math.max(0, n);
  const d = Date.parse(String(h));
  return Number.isNaN(d) ? null : Math.max(0, Math.round((d - now) / 1000));
}
/** The i18n key (data/ui-contrib-i18n.json) of the plain-words message for an error: the backend's own reason when it has words, else the code. */
export const messageKey = (e) => e?.code === 'unconfigured' ? 'contrib.closed' : `contrib.err.${REASON_KEYS.has(e?.reason) ? e.reason : ERR_CODES.has(e?.code) ? e.code : 'unknown'}`;
/** The words for an error, with its numbers filled in (a daily limit says when to come back). t(key, vars) as in createT. */
export function explainError(e, t) {
  const vars = {};
  if (e?.code === 'daily') vars.wait = waitText(e.retryAfterSeconds ?? 3600, t);
  return t(messageKey(e), vars);
}

// ------------------------------------------------------------------ which backend
/** localhost, 127.x, ::1, a private LAN address or *.local: a developer's machine, where http is fine. */
export function isLocalHost(host) {
  const h = String(host || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h === '::1' || h.endsWith('.local')) return true;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254);
}
/** https://host[:port][/prefix] without a trailing slash, or null: http is only for local hosts, no credentials in the URL. */
export function normalizeBase(u) {
  try {
    const x = new URL(String(u).trim());
    if (!['http:', 'https:'].includes(x.protocol) || x.username || x.password || x.hash) return null;
    if (x.protocol === 'http:' && !isLocalHost(x.hostname)) return null;
    return x.origin + x.pathname.replace(/\/+$/, '');
  } catch { return null; }
}
/**
 * CONTRIB_API, or ?contribApi=<url> when that is a usable address. -> { base, custom, host, local, rejected }
 * An empty CONTRIB_API is base '' (no backend), never a relative URL on this origin.
 * `custom` is true for a base that is not the default one; the sheet names a custom host that is not local ("Test server: ...") so nobody
 * sends a report to a stranger's server without seeing where it goes.
 */
export function resolveApiBase(search = '', { fallback = CONTRIB_API } = {}) {
  const def = normalizeBase(fallback) || '';
  const hostOf = (b) => { try { return b ? new URL(b).host : ''; } catch { return ''; } };
  let want = null;
  try { want = new URLSearchParams(search).get('contribApi'); } catch { /* no query */ }
  if (!want) return { base: def, custom: false, host: hostOf(def), local: false, rejected: '' };
  const b = normalizeBase(want);
  if (!b) return { base: def, custom: false, host: hostOf(def), local: false, rejected: want };
  const host = hostOf(b);
  return { base: b, custom: b !== def, host, local: isLocalHost(new URL(b).hostname), rejected: '' };
}

// ------------------------------------------------------------------ what comes back
const first = (...v) => v.find((x) => x !== undefined && x !== null);
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const STATUSES = ['new', 'accepted', 'used', 'rejected'];

/**
 * One submission of /me, in either spelling. The backend never sends the moderator's private note, so none is read.
 * { id, createdAt, status, kind, category, note, points, photos (how many), usedVersion, usedAt }
 */
export function normalizeSub(r) {
  if (!r || typeof r !== 'object') return null;
  const status = String(first(r.status, 'new')).toLowerCase();
  return {
    id: String(first(r.id, r.submissionId, r.submission_id, '')),
    createdAt: String(first(r.createdAt, r.created_at, r.at, '')),
    status: STATUSES.includes(status) ? status : 'new',
    kind: first(r.kind, 'issue') === 'fix' ? 'fix' : 'issue',
    category: String(first(r.category, 'other')),
    note: String(first(r.note, '')),
    points: num(r.points),
    photos: Math.max(0, num(first(r.photos, r.photoCount, r.photo_count), 0)),
    usedVersion: String(first(r.usedVersion, r.used_version, '')),
    usedAt: String(first(r.usedAt, r.used_at, '')),
  };
}
/**
 * /me -> { id, nickname, crewNo (14 digits or ''), points, accepted, rank (number | null), submissions (newest first) }.
 * The points total is the server's (points / pointsTotal), else the sum of accepted and used.
 */
export function normalizeMe(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const p = o.profile && typeof o.profile === 'object' ? o.profile : o;
  const subs = (Array.isArray(o.submissions) ? o.submissions : []).map(normalizeSub).filter(Boolean)
    .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
  const live = subs.filter((s) => s.status === 'accepted' || s.status === 'used');
  const sum = live.reduce((n, s) => n + s.points, 0);
  const crew = checkCrewNo(first(p.crewNo, p.crew_no, o.crewNo, o.crew_no, ''));
  const rank = Number(first(o.rank, p.rank, NaN));
  return {
    id: String(first(p.contributorId, p.contributor_id, p.id, o.contributorId, '')),
    nickname: cleanNickname(first(p.nickname, o.nickname, '')),
    crewNo: crew.ok ? crew.digits : '',
    points: num(first(o.points, o.pointsTotal, o.points_total, o.totalPoints, o.total_points, o.total, p.points), sum),
    accepted: num(first(o.accepted, p.accepted), live.length),
    rank: Number.isInteger(rank) && rank > 0 ? rank : null,
    submissions: subs,
  };
}
/** /leaderboard -> [{ nickname, accepted, points, me }] in the server's order (an array, or an object that holds one). `me` is true on my own row (the server knows when a token was sent). */
export function normalizeBoard(raw) {
  const list = Array.isArray(raw) ? raw : first(raw?.leaderboard, raw?.items, raw?.rows, raw?.entries, raw?.results, []);
  return (Array.isArray(list) ? list : []).filter((r) => r && typeof r === 'object')
    .map((r) => ({ nickname: cleanNickname(first(r.nickname, r.name, '')) || '—', accepted: num(first(r.accepted, r.acceptedCount, r.accepted_count, r.count)), points: num(r.points), me: r.me === true }));
}
/**
 * /health -> { limits: { photos, photoBytes, shotBytes, note } | null, points: { issue, fix } | null }: what the operator configured (maxPhotos, maxPhotoBytes,
 * maxScreenshotBytes, maxNoteChars; points issue / fix), each number kept only when it is a positive whole number. Bounds are applied by effectiveLimits().
 */
export function normalizeConfig(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const whole = (v) => { const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
  const L = o.limits && typeof o.limits === 'object' ? o.limits : null, P = o.points && typeof o.points === 'object' ? o.points : null;
  return {
    limits: L ? { photos: whole(first(L.maxPhotos, L.max_photos)), photoBytes: whole(first(L.maxPhotoBytes, L.max_photo_bytes)), shotBytes: whole(first(L.maxScreenshotBytes, L.max_screenshot_bytes)), note: whole(first(L.maxNoteChars, L.max_note_chars)) } : null,
    points: P ? { issue: whole(P.issue), fix: whole(P.fix) } : null,
  };
}
/** /me/transfer-code -> { code (10 characters, no dash), expiresAt (ms epoch) }; 15 minutes from now when the server gives no expiry. */
export function normalizeTransfer(raw, now = Date.now()) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const code = String(first(o.code, o.transferCode, o.transfer_code, '')).toUpperCase().replace(/[^0-9A-Z]/g, '');   // the server writes K7QM2-XHD9P; the dash is only for reading
  let at = first(o.expiresAt, o.expires_at, o.expires);
  let ms = null;
  if (typeof at === 'number') ms = at < 1e12 ? at * 1000 : at;
  else if (typeof at === 'string' && at) { const t = Date.parse(at); ms = Number.isNaN(t) ? null : t; }
  const inSec = first(o.expiresInSeconds, o.expires_in_seconds, o.expiresIn, o.expires_in, o.ttl);
  if (ms === null && inSec !== undefined) ms = now + num(inSec) * 1000;
  return { code, expiresAt: ms ?? now + 15 * 60 * 1000 };
}

// ------------------------------------------------------------------ the report as multipart
/**
 * The multipart body: pose (JSON), kind, category, note, lang, consent=1, screenshot, photos (repeated). fields:
 * { pose (object or JSON string), kind, category, note, lang, consent, screenshot (Blob), photos [File] }.
 */
export function buildSubmissionForm(f, FD = globalThis.FormData, lim = LIMITS) {
  if (!f.consent) throw new ContribError('validation', 'consent is required');
  const fd = new FD();
  fd.append('pose', typeof f.pose === 'string' ? f.pose : poseToJson(f.pose));
  fd.append('kind', f.kind);
  fd.append('category', f.category);
  fd.append('note', clampNote(f.note, lim.note));
  fd.append('lang', f.lang === 'en' ? 'en' : 'ja');
  fd.append('consent', '1');
  if (f.screenshot) fd.append('screenshot', f.screenshot, 'screenshot.jpg');
  (f.photos || []).slice(0, lim.photos).forEach((p, i) => fd.append('photos', p, p.name || `photo-${i + 1}.jpg`));
  return fd;
}

// ------------------------------------------------------------------ errors
/**
 * A ContribError for an HTTP status and its (parsed) body. The backend answers { error: "<code>", message: "<English sentence>" }: the code is kept
 * as `reason`, the sentence is the message, and the status (with the code where it matters) picks the coarse `code` the sheet switches on.
 */
export function errorFromResponse(status, body, retryAfter = null) {
  const reason = typeof body?.error === 'string' && /^[a-z][a-z0-9_]*$/i.test(body.error) ? body.error.toLowerCase() : '';
  const msg = String(first(body?.message, reason ? '' : body?.error, body?.detail, '') || '');
  const tag = String(first(body?.code, reason, '') || '').toLowerCase();
  const mk = (code, retryable = false) => new ContribError(code, msg || reason || `HTTP ${status}`, { status, retryable, reason, detail: { body, retryAfter } });
  if (status === 401) return mk('auth');
  if (status === 403) return mk(/ban/.test(tag) || /ban/i.test(msg) ? 'banned' : reason === 'origin_not_allowed' ? 'origin' : 'auth');
  if (status === 404 || status === 410) return mk('not_found');
  if (status === 409 && reason === 'too_many_devices') return mk('devices');
  if (status === 413) return mk('too_large');
  if (status === 415) return mk('type');
  if (status === 429) return reason === 'daily_limit' ? mk('daily') : mk('rate', true);
  if (status === 400 || status === 422) return mk('validation');
  if (status >= 500) return mk('server', true);
  return mk('unknown');
}

/** An XMLHttpRequest as a promise, with upload progress. -> { status, text, retryAfter } */
export function xhrRequest(XHR, { method, url, headers = {}, body, onProgress, signal, timeoutMs }) {
  return new Promise((resolve, reject) => {
    let done = false;
    const fail = (code, message) => { if (done) return; done = true; reject(new ContribError(code, message, { retryable: code !== 'aborted' })); };
    if (signal?.aborted) return fail('aborted', 'aborted');
    const x = new XHR();
    x.open(method, url, true);
    for (const [k, v] of Object.entries(headers)) x.setRequestHeader(k, v);
    x.timeout = timeoutMs; x.responseType = 'text'; x.withCredentials = false;
    if (x.upload && onProgress) x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded, e.total); };
    x.onload = () => { if (done) return; done = true; resolve({ status: x.status, text: x.responseText || '', retryAfter: x.getResponseHeader?.('retry-after') ?? null }); };
    x.onerror = () => fail('network', 'network error'); x.ontimeout = () => fail('timeout', 'timeout'); x.onabort = () => fail('aborted', 'aborted');
    signal?.addEventListener?.('abort', () => x.abort(), { once: true });
    x.send(body);
  });
}

// ------------------------------------------------------------------ the client
/** An absolute http(s) URL the client may call. Empty, relative, and non-http values are '' so they are never requested. */
function absoluteHttp(base) {
  const b = String(base ?? '').trim();
  if (!b) return '';
  try {
    const x = new URL(b);
    if ((x.protocol === 'http:' || x.protocol === 'https:') && x.host) return b;
  } catch { /* not an absolute URL */ }
  return '';
}

/**
 * @param {{ base: string, accounts: { get(): ({id, token}|null), set(a): void, clear(): void }, fetch?: Function, XMLHttpRequest?: Function, now?: () => number }} o
 */
export function createApi({ base, accounts, fetch: fetchImpl, XMLHttpRequest: XHR = globalThis.XMLHttpRequest, now = () => Date.now() }) {
  const doFetch = fetchImpl || ((...a) => globalThis.fetch(...a));

  /**
   * One call. -> { status, body } for a 2xx; throws ContribError otherwise. `form` is multipart (the browser sets the boundary).
   * auth: true = this login's token is required (a 401 forgets the login), 'optional' = sent when there is one (a 401 is retried without it, nothing is forgotten).
   */
  async function request(method, path, { auth = false, json, form, signal, timeoutMs = 20000, onProgress, headers: extra } = {}) {
    try { return await once(method, path, { auth, json, form, signal, timeoutMs, onProgress, extra }); }
    catch (e) { if (auth === 'optional' && e.code === 'auth') return once(method, path, { auth: false, json, form, signal, timeoutMs, onProgress, extra }); throw e; }
  }
  async function once(method, path, { auth, json, form, signal, timeoutMs, onProgress, extra }) {
    const root = absoluteHttp(base);
    if (!root) throw new ContribError('unconfigured', 'no backend configured');   // never fetch '' + '/api/...' (that is this origin) or a relative path
    const url = root + PREFIX + path;
    const headers = { accept: 'application/json', ...(extra || {}) };
    if (auth) {
      const a = accounts.get();
      if (a) headers.authorization = 'Bearer ' + a.token;
      else if (auth === true) throw new ContribError('auth', 'no account on this device');
    }
    let body;
    if (json !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(json); } else if (form) body = form;
    let status, text, retryAfter = null;
    if (form && onProgress && typeof XHR === 'function') {
      ({ status, text, retryAfter } = await xhrRequest(XHR, { method, url, headers, body, onProgress, signal, timeoutMs: Math.max(timeoutMs, 120000) }));
    } else {
      const ctl = new AbortController();
      let why = '';
      const timer = setTimeout(() => { why = 'timeout'; ctl.abort(); }, form ? Math.max(timeoutMs, 120000) : timeoutMs);
      const onAbort = () => { why = 'aborted'; ctl.abort(); };
      if (signal?.aborted) { clearTimeout(timer); throw new ContribError('aborted', 'aborted'); }
      signal?.addEventListener?.('abort', onAbort, { once: true });
      try {
        let res;
        try { res = await doFetch(url, { method, headers, body, signal: ctl.signal, credentials: 'omit', cache: 'no-store', mode: 'cors' }); }
        catch (e) { throw new ContribError(why || 'network', String(e?.message || e), { retryable: why !== 'aborted' }); }
        status = res.status; retryAfter = res.headers?.get?.('retry-after') ?? null;
        try { text = await res.text(); } catch (e) { if (why) throw new ContribError(why, why, { retryable: why !== 'aborted' }); text = ''; }
      } finally { clearTimeout(timer); signal?.removeEventListener?.('abort', onAbort); }
    }
    let parsed = null;
    if (text) { try { parsed = JSON.parse(text); } catch { parsed = null; } }
    if (status >= 200 && status < 300) {
      if (parsed === null && status !== 204 && text) throw new ContribError('bad_response', 'not JSON', { status, retryable: true });
      return { status, body: parsed };
    }
    const e = errorFromResponse(status, parsed, retryAfter);
    if (auth === true && status === 401) accounts.clear();   // the token is gone (the database was reset, the account was deleted): forget it, the next call starts a new login
    throw e;
  }
  const account = (r) => {
    const id = String(first(r.body?.contributorId, r.body?.contributor_id, r.body?.id, '')), token = String(first(r.body?.token, ''));
    if (!token) throw new ContribError('bad_response', 'no token in the answer', { retryable: true });
    accounts.set({ id, token });
    return { id, token };
  };

  return {
    base, accounts, request,
    async health() { try { await request('GET', '/health', { timeoutMs: 8000 }); return true; } catch { return false; } },
    /** The limits and points the operator configured (GET /health), or null when the service does not answer. Needs no login. */
    async config() { try { return normalizeConfig((await request('GET', '/health', { timeoutMs: 8000 })).body); } catch { return null; } },
    /** A new anonymous contributor (kept on this device). */
    async createContributor({ nickname = '', crewNo = '' } = {}) {
      const json = {}, nick = cleanNickname(nickname), crew = checkCrewNo(crewNo);
      if (nick) json.nickname = nick;
      if (crew.ok && crew.digits) json.crewNo = crew.digits;
      return account(await request('POST', '/contributors', { json }));
    },
    /** The login this device has, or a new one. */
    async ensureAccount(profile) { return accounts.get() || this.createContributor(profile); },
    /** My profile and reports. */
    async me() { return normalizeMe((await request('GET', '/me', { auth: true })).body); },
    /** Change the nickname and / or the クルーNo. ('' removes it: the backend takes crewNo: null). Only the keys you pass are sent. */
    async updateProfile({ nickname, crewNo } = {}) {
      const json = {};
      if (nickname !== undefined) json.nickname = cleanNickname(nickname);
      if (crewNo !== undefined) { const c = checkCrewNo(crewNo); if (!c.ok) throw new ContribError('validation', 'crewNo'); json.crewNo = c.digits || null; }
      return normalizeMe((await request('PATCH', '/me', { auth: true, json })).body);
    },
    /**
     * Send a report. onProgress(loaded, total) while the upload runs (XMLHttpRequest); signal cancels; idempotencyKey makes a retry return the first
     * report instead of making a second. -> { id, status, replayed }
     */
    async submit(fields, { onProgress, signal, idempotencyKey, limits } = {}) {
      const headers = idempotencyKey ? { 'idempotency-key': String(idempotencyKey) } : undefined;
      const r = await request('POST', '/submissions', { auth: true, form: buildSubmissionForm(fields, undefined, limits || LIMITS), onProgress, signal, headers });
      const id = String(first(r.body?.id, r.body?.submissionId, ''));
      if (!id) throw new ContribError('bad_response', 'no id in the answer', { status: r.status, retryable: true });
      return { id, status: String(first(r.body?.status, 'new')), replayed: r.body?.replayed === true };
    },
    /** The ranking. With a login the server marks my own row (`me`). */
    async leaderboard(limit = 20) { return normalizeBoard((await request('GET', `/leaderboard?limit=${Math.max(1, Math.min(100, limit | 0 || 20))}`, { auth: 'optional' })).body); },
    /** A 10-character code that moves this login to another device (valid for 15 minutes). */
    async transferCode() {
      const t = normalizeTransfer((await request('GET', '/me/transfer-code', { auth: true })).body, now());
      if (!t.code) throw new ContribError('bad_response', 'no code in the answer', { retryable: true });
      return t;
    },
    /** Take over the login a transfer code stands for (it replaces this device's). A wrong or expired code is `not_found`. */
    async claim(code) {
      const c = checkClaimCode(code);
      if (!c.ok) throw new ContribError('validation', 'code', { reason: 'code_malformed' });
      return account(await request('POST', '/contributors/claim', { json: { code: c.code } }));
    },
    /** Erase everything this login sent (reports, photos, nickname, クルーNo.) from the server, then forget the login here. A login the server no longer knows is already erased. */
    async deleteMe() {
      let n = 0;
      try { n = num((await request('DELETE', '/me?confirm=1', { auth: true })).body?.deletedFiles); }
      catch (e) { if (e.code !== 'auth') throw e; }
      accounts.clear();
      return { deletedFiles: n };
    },
    forget() { accounts.clear(); },
  };
}
