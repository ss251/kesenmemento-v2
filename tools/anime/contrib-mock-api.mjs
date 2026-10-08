// [contrib] An in-memory stand-in for the report backend (server/contrib, docs/contrib/API.md), for the sheet's e2e (tools/anime/contrib-shots.mjs) and for
// demos before the real service is deployed. Same routes, same shapes (camelCase JSON, { error: "<code>", message } errors), same multipart rules and limits,
// the leaderboard with `me`, Idempotency-Key replays, the device-transfer code, deleting my data, and a small admin API to accept reports by hand.
// Nothing is written to disk; photos stay in memory until the process stops. test/contrib-mock.test.js runs the app's own API client against it.
//
//   env -u NODE_OPTIONS bun tools/anime/contrib-mock-api.mjs [--port 8988] [--seed 1] [--verbose 1] [--origins https://a.example,https://b.example]
//   app:  http://127.0.0.1:<app port>/index.html?contribApi=http://127.0.0.1:8988
//
//   import { startMock } from './contrib-mock-api.mjs';
//   const mock = startMock({ port: 8988 });            // { port, url, adminToken, state, reset(), seed(), stop() }
//
// Routes (all under /api/contrib/v1; JSON unless noted; CORS for local origins and any `origins` you pass, any other Origin is 403 origin_not_allowed):
//   GET  /health                                  -> {ok, ..., limits {maxPhotos, maxPhotoBytes, maxScreenshotBytes, maxNoteChars, dailyLimit}, points {issue, fix}}
//   POST /contributors {nickname?, crewNo?}       -> 201 {contributorId, token, nickname}
//   GET  /me   PATCH /me {nickname?, crewNo?}     DELETE /me?confirm=1                      -> {ok, deletedFiles}
//   GET|POST /me/transfer-code                    -> {code "XXXXX-XXXXX", expiresAt, expiresInSeconds}  valid 15 minutes, used once
//   POST /contributors/claim {code}               -> {contributorId, token, nickname}  (5 tries per client per hour; O / I / L are read as 0 / 1 / 1)
//   POST /submissions (multipart)                 pose (JSON), kind (issue | fix), category, note <= 2000, lang, consent=1, screenshot, photos x0..6;
//                                                 Idempotency-Key makes a retry return the first report (200, replayed: true)
//   GET  /leaderboard?limit=20                    -> [{nickname, accepted, points, me?}]  (never a crew number; `me` when a valid token is sent)
//   admin (Authorization: Bearer <adminToken>):   GET /admin/submissions?status=&kind=&limit=&offset=   GET|POST|DELETE /admin/submissions/:id {status, points, reviewerNote, version}
//        POST /admin/submissions/mark-used {ids, version}   GET /admin/files/:key   GET /admin/export/crew.csv?from=&to=&excel=   GET /admin/export/submissions.json?status=accepted
//   mock only:  POST /__mock/reset   POST /__mock/seed   GET /__mock/state
// Everything the real service does that a sheet never sees (bans, audit log, S3, rate limits other than the ones below) is left out.
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

export const PREFIX = '/api/contrib/v1';
export const CATEGORIES = ['building', 'road', 'shop', 'sign', 'landmark', 'other'];
export const KINDS = ['issue', 'fix'];
export const STATUSES = ['new', 'accepted', 'used', 'rejected'];
export const DEFAULTS = {
  maxPhotos: 6, maxPhotoMB: 15, maxShotMB: 8, dailyLimit: 20, claimAttempts: 5, maxDevices: 10, pointsIssue: 5, pointsFix: 20,
  codeTtlMs: 15 * 60 * 1000, adminToken: 'mock-admin-token-0123456789abcdef',
};
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';   // no I, L, O, U
const DAY = 24 * 3600 * 1000, HOUR = 3600 * 1000;
const sha = (s) => createHash('sha256').update(s).digest('hex');
const rid = (n = 12) => randomBytes(n).toString('base64url').slice(0, n * 4 / 3 | 0);
const sid = () => Array.from(randomBytes(16), (b) => CROCKFORD[b % 32]).join('').toLowerCase();

/** What the first bytes of a file say it is: 'jpeg' | 'png' | 'webp' | 'heic' | null (the server never trusts the declared type). */
export function sniff(b) {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'png';
  const ascii = (o, n) => String.fromCharCode(...b.slice(o, o + n));
  if (b.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'webp';
  if (b.length >= 12 && ascii(4, 4) === 'ftyp' && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(ascii(8, 4))) return 'heic';
  return null;
}
const MIME = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic' };
const cp = (s) => Array.from(s).length;
const stripUnsafe = (s, keepNewline = false) => s.replace(keepNewline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g : /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, '');

// ---- the same input rules as server/contrib/validate.js
const NICK_BLOCK = /(?:https?:\/\/|www\.|[a-z0-9-]+\.(?:com|net|org|jp|info|xyz|ru|cn)\b|\S+@\S+\.\S+)/i;
/** '1234-5678-9012-34' | '12345678901234' -> '12345678901234'; null for empty; false when it is not exactly 14 digits. */
export function crewNo(v) {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') return false;
  const t = stripUnsafe(v.normalize('NFKC')).trim();
  if (t === '') return null;
  const d = t.replace(/[\s\-‐-―−ーｰ－]/g, '');
  return /^[0-9]{14}$/.test(d) ? d : false;
}
/** -> { ok, value (null = use the generated default) } | { ok: false, message } */
export function cleanNick(v) {
  if (v === null || v === undefined) return { ok: true, value: null };
  if (typeof v !== 'string') return { ok: false, message: 'nickname must be a string' };
  const s = stripUnsafe(v.normalize('NFC')).replace(/\s+/g, ' ').trim();
  if (s === '') return { ok: true, value: null };
  if (cp(s) > 24) return { ok: false, message: 'nickname must be at most 24 characters' };
  if (NICK_BLOCK.test(s)) return { ok: false, message: 'nickname must not contain a link or an e-mail address' };
  return { ok: true, value: s };
}
const guestName = (id) => `Guest-${String(id).replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase().padEnd(4, '0')}`;
/** "k7qm 2-xhd9p" -> "K7QM2XHD9P"; null when it is not a possible code (10 Crockford characters; O / I / L read as 0 / 1 / 1). */
export function claimCode(v) {
  if (typeof v !== 'string') return null;
  const s = stripUnsafe(v.normalize('NFKC')).toUpperCase().replace(/[\s\-_.]/g, '').replace(/[OIL]/g, (c) => ({ O: '0', I: '1', L: '1' }[c]));
  return /^[0-9A-HJKMNP-TV-Z]{10}$/.test(s) ? s : null;
}

export function startMock({ port = 8988, adminToken = DEFAULTS.adminToken, origins = [], limits = {}, verbose = false, hostname = '127.0.0.1' } = {}) {
  const L = { ...DEFAULTS, ...limits };
  const state = { contributors: new Map(), submissions: new Map(), files: new Map(), codes: new Map(), idem: new Map(), hits: new Map(), requests: [] };
  const isLocalOrigin = (o) => { try { const h = new URL(o).hostname; return h === 'localhost' || /^127\./.test(h) || h === '[::1]' || /^(10|192\.168)\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || h.endsWith('.local'); } catch { return false; } };
  const allowedOrigin = (o) => !!o && (isLocalOrigin(o) || origins.includes(o));

  // ---- responses
  const reqId = () => rid(6);
  const cors = (req) => {
    const o = req.headers.get('origin');
    return allowedOrigin(o) ? { 'access-control-allow-origin': o, vary: 'Origin', 'access-control-expose-headers': 'Retry-After, X-Request-Id, Content-Disposition, X-Total-Count' } : { vary: 'Origin' };
  };
  const isBin = (b) => b instanceof Uint8Array || b instanceof Blob;
  const out = (req, body, status = 200, extra = {}) => new Response(body === null || body === undefined ? null : typeof body === 'string' || isBin(body) ? body : JSON.stringify(body),
    { status, headers: { ...(typeof body === 'object' && body !== null && !isBin(body) ? { 'content-type': 'application/json; charset=utf-8' } : {}), 'cache-control': 'no-store', 'x-request-id': reqId(), ...cors(req), ...extra } });
  /** Thrown inside a handler: { status, error (code), message, extra (more JSON fields), headers }. */
  const fail = (status, error, message, extra = {}, headers = {}) => Object.assign(new Error(message), { status, error, extra, headers });

  // ---- auth
  const bearer = (req) => { const m = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') || ''); return m ? m[1].trim() : ''; };
  const isAdmin = (req) => { const t = Buffer.from(bearer(req)), a = Buffer.from(adminToken); return t.length === a.length && timingSafeEqual(t, a); };
  const contributorOf = (req) => {
    const tok = bearer(req), dot = tok.indexOf('.');
    if (dot < 1) return null;
    const c = state.contributors.get(tok.slice(0, dot));
    return c && c.secrets.has(sha(tok.slice(dot + 1))) ? c : null;
  };
  const newContributor = ({ nickname = null, crewNo: crew = null } = {}) => {
    const id = rid(12);
    const c = { id, secrets: new Set(), nickname: nickname || guestName(id), crewNo: crew, createdAt: new Date().toISOString(), lastSeen: null, banned: false };
    state.contributors.set(id, c);
    return c;
  };
  const issueToken = (c) => { const secret = rid(24); c.secrets.add(sha(secret)); return `${c.id}.${secret}`; };
  const need = (req) => { const c = contributorOf(req); if (!c) throw fail(401, 'unauthorized', 'missing or invalid credentials'); if (c.banned) throw fail(403, 'banned', 'this contributor cannot use the service'); c.lastSeen = new Date().toISOString(); return c; };

  // ---- shapes
  const live = (s) => s.status === 'accepted' || s.status === 'used';
  const subView = (s) => ({ id: s.id, createdAt: s.createdAt, status: s.status, kind: s.kind, category: s.category, note: s.note, points: s.points, photos: s.photos.length, reviewedAt: s.reviewedAt, usedVersion: s.usedVersion || null, usedAt: s.usedAt || null });
  const mine = (c) => [...state.submissions.values()].filter((s) => s.contributorId === c.id);
  const board = () => {
    const rows = new Map();
    for (const s of state.submissions.values()) {
      if (!live(s)) continue;
      const c = state.contributors.get(s.contributorId); if (!c || c.banned) continue;
      const r = rows.get(c.id) || { id: c.id, nickname: c.nickname, accepted: 0, points: 0, first: s.reviewedAt || s.createdAt };
      r.accepted++; r.points += s.points; rows.set(c.id, r);
    }
    return [...rows.values()].sort((a, b) => b.points - a.points || b.accepted - a.accepted || String(a.first).localeCompare(String(b.first)));
  };
  const meView = (c) => {
    const subs = mine(c).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), got = subs.filter(live);
    const points = got.reduce((n, s) => n + s.points, 0), rank = board().findIndex((r) => r.id === c.id);
    return { contributorId: c.id, nickname: c.nickname, crewNo: c.crewNo, createdAt: c.createdAt, banned: c.banned, points, pointsTotal: points, accepted: got.length, rank: rank < 0 ? null : rank + 1, submissions: subs.slice(0, 200).map(subView) };
  };

  async function json(req, max = 64 * 1024) {
    if (!/^application\/json/i.test(req.headers.get('content-type') || '')) throw fail(415, 'unsupported_media_type', 'send application/json');
    const text = await req.text();
    if (text.length > max) throw fail(413, 'payload_too_large', 'body too large');
    try { const v = text ? JSON.parse(text) : {}; if (v && typeof v === 'object' && !Array.isArray(v)) return v; } catch { /* below */ }
    throw fail(400, 'invalid_json', 'body must be a JSON object');
  }
  /** A rolling window: how many hits of `key` in the last `windowMs`; adds one when `add`. -> the seconds to wait when it is over `cap`, else 0. */
  const bump = (key, cap, windowMs, add = true) => {
    const now = Date.now(), list = (state.hits.get(key) || []).filter((t) => now - t < windowMs);
    if (list.length >= cap) { state.hits.set(key, list); return Math.max(1, Math.ceil((list[0] + windowMs - now) / 1000)); }
    if (add) list.push(now);
    state.hits.set(key, list); return 0;
  };

  function checkPose(raw) {
    let p; try { p = JSON.parse(String(raw ?? '')); } catch { throw fail(400, 'invalid_pose', 'pose must be valid JSON'); }
    if (!p || typeof p !== 'object' || Array.isArray(p)) throw fail(400, 'invalid_pose', 'pose must be a JSON object');
    const fin = (v) => typeof v === 'number' && Number.isFinite(v);
    if (!Array.isArray(p.enu) || p.enu.length !== 3 || !p.enu.every(fin)) throw fail(400, 'invalid_pose', 'pose.enu must be [x, y, z]');
    if (p.latlon !== undefined && (!Array.isArray(p.latlon) || p.latlon.length !== 2 || !p.latlon.every(fin) || Math.abs(p.latlon[0]) > 90 || Math.abs(p.latlon[1]) > 180)) throw fail(400, 'invalid_pose', 'pose.latlon must be [lat, lon] in degrees');
    if (!fin(p.heading) || !fin(p.pitch)) throw fail(400, 'invalid_pose', 'pose.heading and pose.pitch must be numbers of degrees');
    if (!fin(p.fov) || p.fov <= 0 || p.fov > 180) throw fail(400, 'invalid_pose', 'pose.fov must be a number of degrees in (0, 180]');
    if (p.mode !== undefined && p.mode !== null && !/^[a-z][a-z0-9_-]{0,23}$/i.test(String(p.mode))) throw fail(400, 'invalid_pose', 'pose.mode must be a short word');
    for (const k of ['appVersion', 'layoutVersion', 'timePreset', 'season']) if (p[k] !== undefined && p[k] !== null && (typeof p[k] !== 'string' && typeof p[k] !== 'number' || !String(p[k]).trim() || String(p[k]).length > 64)) throw fail(400, 'invalid_pose', `pose.${k} must be a short string`);
    return p;
  }

  /** POST /submissions: the multipart rules. Returns { sub, replayed }. */
  async function createSubmission(req, c, ip) {
    const key = req.headers.get('idempotency-key');
    if (key !== null && !/^[A-Za-z0-9._:-]{8,80}$/.test(key)) throw fail(400, 'invalid_idempotency_key', 'Idempotency-Key must be 8-80 characters: letters, digits and . _ : -');
    const known = key && state.idem.get(`${c.id}:${key}`);
    if (known && state.submissions.has(known)) return { sub: state.submissions.get(known), replayed: true };
    const wait = bump(`c:${c.id}`, L.dailyLimit, DAY, false) || bump(`ip:${ip}`, L.dailyLimit * 3, DAY, false);
    if (wait) throw fail(429, 'daily_limit', 'daily submission limit reached', {}, { 'retry-after': String(wait) });
    const ct = req.headers.get('content-type') || '';
    if (!/^multipart\/form-data;\s*boundary=/i.test(ct)) throw fail(415, 'unsupported_media_type', 'send multipart/form-data');
    let fd; try { fd = await req.formData(); } catch { throw fail(400, 'invalid_multipart', 'bad multipart body'); }
    if (!/^(?:1|true|on|yes)$/i.test(String(fd.get('consent') ?? '').trim())) throw fail(400, 'consent_required', 'consent=1 is required: the contributor must accept the privacy notice');
    const pose = checkPose(fd.get('pose'));
    const category = String(fd.get('category') || 'other'); if (!CATEGORIES.includes(category)) throw fail(400, 'invalid_category', 'category must be one of ' + CATEGORIES.join(', '));
    const rawKind = String(fd.get('kind') ?? ''); if (rawKind && !KINDS.includes(rawKind)) throw fail(400, 'invalid_kind', 'kind must be issue or fix');
    const lang = String(fd.get('lang') ?? ''); if (lang && !/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/.test(lang)) throw fail(400, 'invalid_lang', 'lang must be a language tag such as ja or en');
    const note = stripUnsafe(String(fd.get('note') ?? '').normalize('NFC').replace(/\r\n?/g, '\n'), true).trim();
    if (cp(note) > 2000) throw fail(400, 'note_too_long', 'note must be at most 2000 characters');
    const shots = fd.getAll('screenshot'), photos = [...fd.getAll('photos'), ...fd.getAll('photos[]'), ...fd.getAll('photo')].filter((f) => typeof f !== 'string' && f.size > 0);
    if (shots.length > 1) throw fail(400, 'invalid_screenshot', 'one screenshot at most');
    if (photos.length > L.maxPhotos) throw fail(400, 'too_many_photos', `at most ${L.maxPhotos} photos`, { max: L.maxPhotos });
    const kind = rawKind || (photos.length ? 'fix' : 'issue');
    if (kind === 'fix' && photos.length === 0) throw fail(400, 'fix_needs_photos', 'a fix needs at least one on-site photo; send kind=issue for a report without photos');
    if (!note && !shots.length && !photos.length) throw fail(400, 'empty_submission', 'send a note, a screenshot or at least one photo');
    const take = async (f, maxMB, types, field, index, tooBig) => {
      if (typeof f === 'string' || !f || typeof f.arrayBuffer !== 'function') throw fail(400, 'invalid_' + field, `${field} must be a file`);
      if (f.size > maxMB * 1048576) throw fail(413, tooBig, `${field} is larger than ${maxMB} MB`, { max: maxMB, ...(index === undefined ? {} : { index }) });
      const bytes = new Uint8Array(await f.arrayBuffer()), type = sniff(bytes);
      if (!type || !types.includes(type)) throw fail(415, 'invalid_image', `${field} is not a ${types.join(', ')} image`, { field, ...(index === undefined ? {} : { index }) });
      return { bytes, type };
    };
    const id = sid(), at = new Date().toISOString(), base = `submissions/${at.slice(0, 4)}/${at.slice(5, 7)}/${id}/`;
    const stored = [];
    let screenshotKey = null;
    if (shots.length) { const s = await take(shots[0], L.maxShotMB, ['jpeg', 'png'], 'screenshot', undefined, 'screenshot_too_large'); screenshotKey = base + 'screenshot.' + (s.type === 'png' ? 'png' : 'jpg'); stored.push([screenshotKey, s]); }
    const photoRows = [];
    for (let i = 0; i < photos.length; i++) {
      const p = await take(photos[i], L.maxPhotoMB, ['jpeg', 'png', 'webp', 'heic'], 'photos', i, 'photo_too_large');
      const k = `${base}photo-${i + 1}.${p.type === 'jpeg' ? 'jpg' : p.type}`; stored.push([k, p]);
      photoRows.push({ n: i + 1, key: k, mime: MIME[p.type], bytes: p.bytes.length, name: photos[i].name });
    }
    for (const [k, f] of stored) state.files.set(k, { bytes: f.bytes, mime: MIME[f.type] });
    bump(`c:${c.id}`, L.dailyLimit, DAY); bump(`ip:${ip}`, L.dailyLimit * 3, DAY);
    const sub = { id, contributorId: c.id, createdAt: at, status: 'new', kind, category, note, lang: lang || null, pose, screenshotKey, photos: photoRows, points: 0, reviewerNote: null, reviewedAt: null, usedVersion: null, usedAt: null };
    state.submissions.set(id, sub);
    if (key) state.idem.set(`${c.id}:${key}`, id);
    return { sub, replayed: false };
  }

  const adminItem = (s) => {
    const c = state.contributors.get(s.contributorId);
    return { id: s.id, createdAt: s.createdAt, status: s.status, kind: s.kind, category: s.category, note: s.note, lang: s.lang, points: s.points, reviewedAt: s.reviewedAt, usedVersion: s.usedVersion, usedAt: s.usedAt,
      contributor: { id: c?.id ?? null, nickname: c?.nickname ?? null, banned: !!c?.banned }, photoCount: s.photos.length, hasScreenshot: !!s.screenshotKey,
      thumbUrl: s.screenshotKey ? `${PREFIX}/admin/files/${s.screenshotKey}` : null, location: s.pose?.latlon ? { lat: s.pose.latlon[0], lon: s.pose.latlon[1], source: 'pose' } : null };
  };
  const adminFull = (s) => ({ ...adminItem(s), reviewerNote: s.reviewerNote, pose: s.pose, screenshot: s.screenshotKey && { key: s.screenshotKey, url: `${PREFIX}/admin/files/${s.screenshotKey}` },
    photos: s.photos.map((p) => ({ n: p.n, key: p.key, url: `${PREFIX}/admin/files/${p.key}`, mime: p.mime, bytes: p.bytes })) });
  const review = (s, b) => {
    if (!STATUSES.includes(b.status)) throw fail(400, 'invalid_status', 'status must be one of ' + STATUSES.join(', '));
    let pts = b.points;
    if (pts !== undefined && !(Number.isInteger(pts) && pts >= 0 && pts <= 10000)) throw fail(400, 'invalid_points', 'points must be an integer 0..10000');
    const version = b.version ?? b.usedVersion ?? b.used_version;
    if (version !== undefined && version !== null && !/^[A-Za-z0-9._+@/-]{1,64}$/.test(String(version))) throw fail(400, 'invalid_version', 'version is a release tag or commit');
    if (b.status === 'accepted' || b.status === 'used') pts ??= s.points || (s.kind === 'fix' ? L.pointsFix : L.pointsIssue); else pts = 0;
    s.status = b.status; s.points = pts;
    if (b.reviewerNote !== undefined) s.reviewerNote = String(b.reviewerNote ?? '').slice(0, 1000) || null;
    if ((b.status === 'accepted' || b.status === 'rejected') && !s.reviewedAt) s.reviewedAt = new Date().toISOString();
    if (b.status === 'used') { s.reviewedAt ||= new Date().toISOString(); if (version) { s.usedVersion = String(version); s.usedAt = new Date().toISOString(); } } else { s.usedVersion = null; s.usedAt = null; }
    if (b.status === 'new') s.reviewedAt = null;
    return s;
  };
  const eraseSubmission = (s) => { let n = 0; for (const k of [s.screenshotKey, ...s.photos.map((p) => p.key)]) if (k && state.files.delete(k)) n++; state.submissions.delete(s.id); return n; };

  async function handle(req, ip) {
    const url = new URL(req.url), path = url.pathname.replace(/\/+$/, '') || '/', M = req.method;
    const origin = req.headers.get('origin');
    if (origin && !allowedOrigin(origin) && path.startsWith(PREFIX)) return new Response(JSON.stringify({ error: 'origin_not_allowed', message: 'this origin may not call the API' }), { status: 403, headers: { 'content-type': 'application/json; charset=utf-8', vary: 'Origin' } });
    if (M === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors(req), 'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS', 'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key, X-Admin-Name', 'access-control-max-age': '600' } });
    if (path.startsWith('/__mock/')) {
      if (path === '/__mock/reset' && M === 'POST') { api.reset(); return out(req, { ok: true }); }
      if (path === '/__mock/seed' && M === 'POST') { api.seed(); return out(req, { ok: true, contributors: state.contributors.size }); }
      if (path === '/__mock/state' && M === 'GET') return out(req, { contributors: state.contributors.size, submissions: [...state.submissions.values()].map((s) => ({ id: s.id, status: s.status, kind: s.kind, photos: s.photos.length })), codes: state.codes.size });
      return out(req, { error: 'not_found', message: 'no such route' }, 404);
    }
    if (!path.startsWith(PREFIX + '/') && path !== PREFIX) return out(req, { error: 'not_found', message: 'no such route' }, 404);
    const r = path.slice(PREFIX.length) || '/';
    try {
      // ---- public
      if (r === '/health' && M === 'GET') return out(req, { ok: true, service: 'kesennuma-contrib-mock', version: 'mock', storage: 'memory', time: new Date().toISOString(),
        limits: { maxPhotos: L.maxPhotos, maxPhotoBytes: L.maxPhotoMB * 1048576, maxScreenshotBytes: L.maxShotMB * 1048576, maxNoteChars: 2000, dailyLimit: L.dailyLimit }, points: { issue: L.pointsIssue, fix: L.pointsFix } });
      if (r === '/contributors' && M === 'POST') {
        const b = await json(req);
        const nick = cleanNick(b.nickname); if (!nick.ok) throw fail(400, 'invalid_nickname', nick.message);
        const crew = crewNo(b.crewNo); if (crew === false) throw fail(400, 'invalid_crew_no', 'crewNo must be exactly 14 digits (dashes allowed)');
        const c = newContributor({ nickname: nick.value, crewNo: crew });
        return out(req, { contributorId: c.id, token: issueToken(c), nickname: c.nickname }, 201);
      }
      if (r === '/contributors/claim' && M === 'POST') {
        const wait = bump(`claim:${ip}`, L.claimAttempts, HOUR);   // (rejected tries count too)
        if (wait) throw fail(429, 'rate_limited', 'too many claim attempts', {}, { 'retry-after': String(wait) });
        const b = await json(req), code = claimCode(b.code);
        if (!code) throw fail(400, 'code_malformed', 'code must be 10 letters and digits, e.g. K7QM2-XHD9P');
        const rec = state.codes.get(code), c = rec && state.contributors.get(rec.contributorId);
        if (!rec || rec.used || rec.expiresAt < Date.now() || !c) throw fail(404, 'code_not_found', 'this code is wrong, expired or already used');
        if (c.banned) throw fail(403, 'banned', 'this contributor cannot use the service');
        if (c.secrets.size >= L.maxDevices) throw fail(409, 'too_many_devices', 'this account is signed in on too many devices');
        rec.used = true;
        return out(req, { contributorId: c.id, token: issueToken(c), nickname: c.nickname });
      }
      if (r === '/leaderboard' && M === 'GET') {
        const limit = Math.max(1, Math.min(100, Math.trunc(Number(url.searchParams.get('limit'))) || 20)), who = contributorOf(req);
        return out(req, board().slice(0, limit).map((x) => ({ nickname: x.nickname, accepted: x.accepted, points: x.points, ...(who && who.id === x.id ? { me: true } : {}) })));
      }
      // ---- a contributor
      if (r === '/me') {
        const c = need(req);
        if (M === 'GET') return out(req, meView(c));
        if (M === 'PATCH') {
          const b = await json(req);
          if ('nickname' in b) { const n = cleanNick(b.nickname); if (!n.ok) throw fail(400, 'invalid_nickname', n.message); c.nickname = n.value || guestName(c.id); }
          if ('crewNo' in b) { const crew = crewNo(b.crewNo); if (crew === false) throw fail(400, 'invalid_crew_no', 'crewNo must be exactly 14 digits (dashes allowed)'); c.crewNo = crew; }
          return out(req, meView(c));
        }
        if (M === 'DELETE') {
          if (url.searchParams.get('confirm') !== '1') throw fail(400, 'confirm_required', 'add ?confirm=1 to erase this contributor and all their submissions');
          let n = 0; for (const s of mine(c)) n += eraseSubmission(s);
          for (const [k, v] of state.codes) if (v.contributorId === c.id) state.codes.delete(k);
          state.contributors.delete(c.id);
          return out(req, { ok: true, deletedFiles: n });
        }
        throw fail(405, 'method_not_allowed', 'method not allowed');
      }
      if (r === '/me/transfer-code' && (M === 'GET' || M === 'POST')) {
        const c = need(req);
        if (bump(`code:${c.id}`, 10, HOUR)) throw fail(429, 'rate_limited', 'too many transfer codes', {}, { 'retry-after': '3600' });
        for (const [k, v] of state.codes) if (v.contributorId === c.id && !v.used) state.codes.delete(k);   // a new code replaces an unused older one
        let code; do { code = Array.from(randomBytes(10), (b) => CROCKFORD[b % 32]).join(''); } while (state.codes.has(code));
        const expiresAt = Date.now() + L.codeTtlMs;
        state.codes.set(code, { contributorId: c.id, expiresAt, used: false });
        return out(req, { code: `${code.slice(0, 5)}-${code.slice(5)}`, expiresAt: new Date(expiresAt).toISOString(), expiresInSeconds: Math.round(L.codeTtlMs / 1000) });
      }
      if (r === '/submissions' && M === 'POST') {
        const c = need(req);
        const { sub, replayed } = await createSubmission(req, c, ip);
        return out(req, { id: sub.id, status: sub.status, kind: sub.kind, photos: sub.photos.length, createdAt: sub.createdAt, ...(replayed ? { replayed: true } : {}) }, replayed ? 200 : 201, replayed ? { 'idempotent-replayed': 'true' } : {});
      }
      // ---- admin
      if (r.startsWith('/admin/')) {
        if (!isAdmin(req)) throw fail(401, 'unauthorized', 'missing or invalid credentials');
        if (r === '/admin/submissions' && M === 'GET') {
          const q = url.searchParams, st = q.get('status'), kind = q.get('kind'), limit = Math.max(1, Math.min(100, Number(q.get('limit')) || 25)), offset = Math.max(0, Number(q.get('offset')) || 0);
          const all = [...state.submissions.values()].filter((s) => (!st || st === 'all' || s.status === st) && (!kind || s.kind === kind)).sort((a, b) => (q.get('sort') === 'oldest' ? 1 : -1) * a.createdAt.localeCompare(b.createdAt));
          return out(req, { items: all.slice(offset, offset + limit).map(adminItem), total: all.length, limit, offset }, 200, { 'x-total-count': String(all.length) });
        }
        if (r === '/admin/submissions/mark-used' && M === 'POST') {
          const b = await json(req), version = b.version;
          if (!version) throw fail(400, 'version_required', 'version is required');
          if (!/^[A-Za-z0-9._+@/-]{1,64}$/.test(String(version))) throw fail(400, 'invalid_version', 'version is a release tag or commit');
          if (!Array.isArray(b.ids) || !b.ids.length || b.ids.length > 500) throw fail(400, 'invalid_ids', 'ids is 1 to 500 submission ids');
          const updated = [], skipped = [], notFound = [];
          for (const id of b.ids) {
            const s = state.submissions.get(id);
            if (!s) notFound.push(id); else if (s.status === 'used') skipped.push({ id, reason: s.usedVersion === version ? 'unchanged' : 'already_used' }); else if (s.status !== 'accepted') skipped.push({ id, reason: 'not_accepted' });
            else { review(s, { status: 'used', version }); updated.push(id); }
          }
          return out(req, { version, updated, skipped, notFound });
        }
        const one = /^\/admin\/submissions\/([\w-]+)$/.exec(r);
        if (one) {
          const s = state.submissions.get(one[1]); if (!s) throw fail(404, 'not_found', 'no such submission');
          if (M === 'GET') return out(req, adminFull(s));
          if (M === 'POST') return out(req, adminFull(review(s, await json(req))));
          if (M === 'DELETE') return out(req, { ok: true, deletedFiles: eraseSubmission(s) });
        }
        const file = /^\/admin\/files\/(.+)$/.exec(r);
        if (file && M === 'GET') { const f = state.files.get(decodeURIComponent(file[1])); if (!f) throw fail(404, 'not_found', 'no such file'); return out(req, f.bytes, 200, { 'content-type': f.mime }); }
        if (r === '/admin/export/crew.csv' && M === 'GET') {
          const q = url.searchParams, from = q.get('from') ? Date.parse(q.get('from')) : -Infinity, to = q.get('to') ? Date.parse(q.get('to')) + DAY - 1 : Infinity;
          const per = new Map();
          for (const s of state.submissions.values()) {
            if (!live(s) || !s.reviewedAt) continue;
            const t = Date.parse(s.reviewedAt), c = state.contributors.get(s.contributorId);
            if (!c?.crewNo || c.banned || t < from || t > to) continue;
            const row = per.get(c.crewNo) || { crew: c.crewNo, nick: c.nickname, points: 0, n: 0 }; row.points += s.points; row.n++; per.set(c.crewNo, row);
          }
          const q2 = (v) => { const x = /^[=+\-@\t\r]/.test(v) ? "'" + v : v; return /[",\r\n]/.test(x) ? `"${x.replaceAll('"', '""')}"` : x; };   // a formula-looking nickname gets a leading ', as the real export does
          const cell = (d) => (q.get('excel') === '0' ? d : `="${d}"`);
          return out(req, '﻿' + 'crew_no,nickname,points,accepted\r\n' + [...per.values()].sort((a, b) => b.points - a.points || b.n - a.n).map((p) => `${cell(p.crew)},${q2(p.nick)},${p.points},${p.n}`).join('\r\n') + (per.size ? '\r\n' : ''), 200, { 'content-type': 'text/csv; charset=utf-8' });
        }
        if (r === '/admin/export/submissions.json' && M === 'GET') {
          const st = url.searchParams.get('status') || 'accepted', list = [...state.submissions.values()].filter((s) => st === 'all' || s.status === st).map(adminFull);
          return out(req, { generatedAt: new Date().toISOString(), status: st, count: list.length, submissions: list });
        }
      }
      return out(req, { error: 'not_found', message: 'no such route' }, 404);
    } catch (e) {
      if (e?.status) return out(req, { error: e.error, message: e.message, ...e.extra }, e.status, e.headers);
      if (verbose) console.error('[contrib-mock]', e);
      return out(req, { error: 'internal', message: 'internal error' }, 500);
    }
  }

  const server = Bun.serve({
    port, hostname, maxRequestBodySize: 96 * 1048576,
    async fetch(req, srv) {
      const ip = srv.requestIP(req)?.address || 'local', t0 = performance.now();
      const res = await handle(req, ip);
      if (verbose) console.error(`[contrib-mock] ${req.method} ${new URL(req.url).pathname} -> ${res.status} (${Math.round(performance.now() - t0)} ms)`);
      state.requests.push({ method: req.method, path: new URL(req.url).pathname, status: res.status });
      if (state.requests.length > 500) state.requests.shift();
      return res;
    },
  });

  const api = {
    server, port: server.port, url: `http://${hostname}:${server.port}`, adminToken, state,
    /** Change the configured limits and points while it runs (what GET /health announces and what the rules enforce): { maxPhotos, maxPhotoMB, maxShotMB, dailyLimit, pointsIssue, pointsFix, ... }. */
    setLimits(patch) { Object.assign(L, patch); },
    /** Forget everything. */
    reset() { for (const m of Object.values(state)) { if (m instanceof Map) m.clear(); } state.requests.length = 0; },
    /** A few made-up contributors with accepted reports, so the leaderboard has something to show (synthetic names, no real people). */
    seed() {
      const demo = [['さくら', 3, 5], ['ひろ', 2, 20], ['Mika', 2, 5], ['うみ', 1, 20], ['Kenta', 1, 5]];
      demo.forEach(([nick, n, pts], i) => {
        const c = newContributor({ nickname: nick });
        for (let k = 0; k < n; k++) {
          const id = sid(), at = new Date(Date.UTC(2026, 9, 1 + i, 3, k)).toISOString();
          state.submissions.set(id, { id, contributorId: c.id, createdAt: at, status: 'accepted', kind: pts === 20 ? 'fix' : 'issue', category: CATEGORIES[(i + k) % 6], note: '', lang: 'ja', pose: { enu: [0, 0, 0], latlon: [38.906, 141.575], heading: 0, pitch: 0, fov: 55 }, screenshotKey: null, photos: [], points: pts, reviewerNote: null, reviewedAt: at, usedVersion: null, usedAt: null });
        }
      });
    },
    stop() { server.stop(true); },
  };
  return api;
}

if (import.meta.main) {
  const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : '1') : d; };
  const port = Number(arg('port', 8988));
  if (!(port >= 8985 && port <= 8988)) console.error(`[contrib-mock] note: ports 8985-8988 are this branch's; using ${port}`);
  const mock = startMock({ port, verbose: arg('verbose') === '1', origins: String(arg('origins', '')).split(',').filter(Boolean) });
  if (arg('seed') === '1') mock.seed();
  console.log(`contrib mock listening on ${mock.url}  (in memory; admin token: ${DEFAULTS.adminToken})`);
  process.on('SIGINT', () => { mock.stop(); process.exit(0); });
}
