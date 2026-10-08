// [contrib] The pure parts of the 「修正を報告」 sheet (ui/contrib.js): limits, クルーNo. and claim-code validation, photo checks, the draft and
// the anonymous login kept in localStorage, status and points copy, the screenshot size, the keyboard inset, and the transfer link.
// Nothing here touches the DOM or the network, so test/contrib-lib.test.js covers it.
import DATA from '../../../data/ui-contrib-i18n.json';

/**
 * The report backend (server/contrib). `''` means no backend is configured: the sheet may open, and it must not send.
 * docs/contrib/DEPLOY.md sets this to the service's real URL once that service exists and GET /api/contrib/v1/health
 * answers. `?contribApi=<url>` still overrides it for testing (resolveApiBase in contrib-api.js).
 */
export const CONTRIB_API = '';
/**
 * Go-live switch: the 「修正を報告」 flow stays hidden in production until the team turns it on. Flip CONTRIB_DEFAULT_ON to true at launch
 * (after the backend is deployed and the privacy contact is filled in). Until then: ?contrib=1 turns it on for this device (remembered),
 * ?contrib=0 turns it off again, and local dev hosts always show it.
 */
export const CONTRIB_DEFAULT_ON = false;
const DEV_HOST = /^(localhost|127\.0\.0\.1|\[?::1\]?)$|\.localhost$/i;
/** -> { on, persist } where persist ('1' | '0' | null) is what to remember in localStorage under klc.contrib. Pure: no DOM, no storage. */
export function contribEnabled({ search = '', hostname = '', stored = null, defaultOn = CONTRIB_DEFAULT_ON } = {}) {
  const q = new URLSearchParams(search || '');
  if (q.get('contrib') === '0') return { on: false, persist: '0' };
  if (q.get('contrib') === '1') return { on: true, persist: '1' };
  if (stored === '1') return { on: true, persist: null };
  if (stored === '0') return { on: false, persist: null };
  if (DEV_HOST.test(String(hostname || '').trim())) return { on: true, persist: null };
  return { on: !!defaultOn, persist: null };
}
/**
 * Where a deletion request or a question goes (an address or a form URL), named at the end of the privacy notice. Empty until the team has one
 * (docs/contrib/PRIVACY.md: "replace {{CONTACT}} before launch"); a link in the page address must never set it (that would let anyone put an address
 * of their own into the notice). The notice still works without it: the data can be deleted from マイ投稿.
 */
export const CONTRIB_CONTACT = '';
export const CATEGORIES = ['building', 'road', 'shop', 'sign', 'landmark', 'other'];
export const KINDS = ['issue', 'fix'];
/** About how many points an accepted report earns (the copy says "about"; the real number is the moderator's). */
export const POINTS = { issue: 5, fix: 20 };
/** The backend's limits (MAX_PHOTOS, MAX_PHOTO_MB, MAX_SHOT_MB, the note, the claim code); the client checks them first so nothing is uploaded in vain. */
export const LIMITS = { photos: 6, photoBytes: 15 * 1024 * 1024, shotBytes: 8 * 1024 * 1024, note: 2000, nickname: 24, crewDigits: 14, codeLen: 10, drafts: 30 * 86400 * 1000 };
/**
 * The limits and points in force: the built-in ones (the backend's documented defaults) with whatever the backend announced in GET /health on top
 * (normalizeConfig in contrib-api.js). An announced number outside a sane range keeps the built-in one, so a typo in the backend's settings cannot make the
 * sheet refuse every photo or accept a 4 GB one.
 */
const BOUNDS = { photos: [1, 20], photoBytes: [100 * 1024, 100 * 1048576], shotBytes: [100 * 1024, 100 * 1048576], note: [100, 20000], points: [1, 10000] };
const sane = (k, v) => Number.isInteger(v) && v >= BOUNDS[k][0] && v <= BOUNDS[k][1];
export function effectiveLimits(cfg) {
  const L = cfg?.limits || {};
  return { ...LIMITS, ...(sane('photos', L.photos) ? { photos: L.photos } : {}), ...(sane('photoBytes', L.photoBytes) ? { photoBytes: L.photoBytes } : {}),
    ...(sane('shotBytes', L.shotBytes) ? { shotBytes: L.shotBytes } : {}), ...(sane('note', L.note) ? { note: L.note } : {}) };
}
export function effectivePoints(cfg) {
  const P = cfg?.points || {};
  return { issue: sane('points', P.issue) ? P.issue : POINTS.issue, fix: sane('points', P.fix) ? P.fix : POINTS.fix };
}
/** "15" for 15 MB, "7.5" for 7.5 MB (the photo size limit in the sheet's words). */
export const mbText = (bytes) => String(Math.round(bytes / 1048576 * 10) / 10);
export const PHOTO_EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' };
export const SHOT = { maxW: 1600, quality: 0.86, thumbW: 480, thumbQuality: 0.72 };

// ------------------------------------------------------------------ strings
/** t(key, vars) in the HUD's i18n style ({ja, en} objects, {name} placeholders); falls back to Japanese, then to the key. */
export function createT(getLang, data = DATA) {
  const t = (key, vars) => {
    let s = data[getLang()]?.[key] ?? data.ja[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll('{' + k + '}', String(v));
    return s;
  };
  return t;
}
export { DATA as STRINGS };

// ------------------------------------------------------------------ クルーNo., nickname, claim code, note
const DASHES = /[\s\-‐-―−ー－ｰ_.・･]/g;   // hyphens, dashes, minus, the long-vowel mark a Japanese keyboard types for "-", spaces
/**
 * The クルーNo.: exactly 14 digits, typed with or without dashes or spaces, full-width digits accepted. Empty is fine (it is optional).
 * -> { ok, digits, error: null | 'chars' | 'length' }   digits is the normalised value without dashes ('' when empty)
 */
export function checkCrewNo(input) {
  const s = String(input ?? '').normalize('NFKC').replace(DASHES, '');
  if (s === '') return { ok: true, digits: '', error: null };
  if (!/^\d+$/.test(s)) return { ok: false, digits: s, error: 'chars' };
  if (s.length !== LIMITS.crewDigits) return { ok: false, digits: s, error: 'length' };
  return { ok: true, digits: s, error: null };
}
export const isValidCrewNo = (s) => checkCrewNo(s).ok;
/** The 14 digits of a valid クルーNo., or '' (empty or not valid). */
export const validCrewDigits = (s) => { const c = checkCrewNo(s); return c.ok ? c.digits : ''; };
/** Only the last four digits, for showing a stored number back: ••••••••••1234. */
export const maskCrewNo = (digits) => (digits ? '•'.repeat(Math.max(0, String(digits).length - 4)) + String(digits).slice(-4) : '');

/** A display name: NFKC-trimmed, whitespace collapsed, control characters gone, at most LIMITS.nickname characters (code points). */
export function cleanNickname(s) {
  const t = String(s ?? '').normalize('NFKC').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, '').replace(/\s+/g, ' ').trim();
  return Array.from(t).slice(0, LIMITS.nickname).join('');
}
/**
 * A device-transfer code as typed: spaces, dashes and case do not matter, and O / I / L are read as 0 / 1 / 1 (the backend does the same: Crockford
 * base32, 10 characters, no U). Checked here first because the backend lets only 5 wrong tries through per hour.
 * -> { ok, code } ('' for nothing; ok:false when it is not a possible code)
 */
const CROCKFORD_READ = { O: '0', I: '1', L: '1' };
export function checkClaimCode(input) {
  const code = String(input ?? '').normalize('NFKC').replace(DASHES, '').toUpperCase().replace(/[OIL]/g, (c) => CROCKFORD_READ[c]);
  return { ok: new RegExp(`^[0-9A-HJKMNP-TV-Z]{${LIMITS.codeLen}}$`).test(code), code };
}
/** The code shown as two groups of five with a dash, the way the backend writes it: K7QM2-XHD9P. */
export const groupCode = (code) => (String(code).length === LIMITS.codeLen ? `${code.slice(0, 5)}-${code.slice(5)}` : String(code));
/** A nickname the backend would refuse because it holds a link or an e-mail address (same rule as server/contrib/validate.js): 'link' | null. */
const NICK_BLOCK = /(?:https?:\/\/|www\.|[a-z0-9-]+\.(?:com|net|org|jp|info|xyz|ru|cn)\b|\S+@\S+\.\S+)/i;
export const nicknameProblem = (s) => (NICK_BLOCK.test(String(s ?? '')) ? 'link' : null);

// ------------------------------------------------------------------ photos and the whole form
/** 'type' | 'size' | 'empty' | null for a picked file ({ name, type, size }); HEIC often arrives with no MIME type, so the extension counts too. */
export function photoProblem(file, lim = LIMITS) {
  if (!file) return 'empty';
  const ext = String(file.name || '').split('.').pop().toLowerCase();
  const type = String(file.type || '').toLowerCase();
  const okType = Object.values(PHOTO_EXT).includes(type) || (!type || type === 'application/octet-stream') && ext in PHOTO_EXT;
  if (!okType) return 'type';
  if (!(file.size > 0)) return 'empty';
  if (file.size > lim.photoBytes) return 'size';
  return null;
}

/**
 * What stops this report from being sent. fields: { kind, category, note, consent, photos: [file], hasShot, crewNo, nickname }.
 * -> { ok, errors: { field: code } }  fields: kind, category, note, consent, photos, crewNo, nickname
 * `hasShot: false` (the screenshot could not be taken) with no note and no photo is an empty report: the backend would refuse it too (empty_submission).
 */
export function validateReport(f, lim = LIMITS) {
  const errors = {};
  if (!KINDS.includes(f.kind)) errors.kind = 'required';
  if (!CATEGORIES.includes(f.category)) errors.category = 'required';
  const photos = f.photos || [];
  if (String(f.note ?? '').length > lim.note) errors.note = 'long';
  else if (f.hasShot === false && !String(f.note ?? '').trim() && !photos.length) errors.note = 'empty';
  if (photos.length > lim.photos) errors.photos = 'many';
  else if (f.kind === 'fix' && photos.length === 0) errors.photos = 'needed';
  else { const bad = photos.map((p) => photoProblem(p, lim)).find(Boolean); if (bad) errors.photos = bad; }
  if (!f.consent) errors.consent = 'required';
  const c = checkCrewNo(f.crewNo); if (!c.ok) errors.crewNo = c.error;
  const n = nicknameProblem(cleanNickname(f.nickname)); if (n) errors.nickname = n;
  return { ok: Object.keys(errors).length === 0, errors };
}
export const clampNote = (s, max = LIMITS.note) => String(s ?? '').slice(0, max);

// ------------------------------------------------------------------ storage (the draft, the profile, the anonymous login)
/** localStorage that never throws (private mode, blocked storage): { get(k), set(k, v), del(k) }. */
export function safeStorage(win = typeof window !== 'undefined' ? window : null) {
  const ls = () => { try { return win?.localStorage || null; } catch { return null; } };
  return {
    get(k) { try { return ls()?.getItem(k) ?? null; } catch { return null; } },
    set(k, v) { try { const s = ls(); if (!s) return false; s.setItem(k, v); return true; } catch { return false; } },
    del(k) { try { ls()?.removeItem(k); } catch { /* nothing to do */ } },
  };
}
export const KEYS = { account: 'klc.contrib.acct.v1', profile: 'klc.contrib.me.v1', draft: 'klc.contrib.draft.v1' };
const parse = (s) => { try { const o = JSON.parse(s); return o && typeof o === 'object' ? o : null; } catch { return null; } };

/** The text of an unsent report: { kind, category, note, crewNo }. Photos are not kept (they are files); consent is asked again each time. */
export function loadDraft(store, now = Date.now()) {
  const d = parse(store.get(KEYS.draft));
  if (!d || d.v !== 1 || !(now - d.at < LIMITS.drafts)) return null;
  return {
    kind: KINDS.includes(d.kind) ? d.kind : 'issue',
    category: CATEGORIES.includes(d.category) ? d.category : '',
    note: clampNote(d.note),
    crewNo: typeof d.crewNo === 'string' ? d.crewNo.slice(0, 40) : '',
  };
}
export function saveDraft(store, draft, now = Date.now()) {
  const empty = !draft.category && !draft.note && !draft.crewNo && draft.kind === 'issue';
  if (empty) { store.del(KEYS.draft); return; }
  store.set(KEYS.draft, JSON.stringify({ v: 1, at: now, kind: draft.kind, category: draft.category, note: clampNote(draft.note), crewNo: String(draft.crewNo || '').slice(0, 40) }));
}
export const clearDraft = (store) => store.del(KEYS.draft);

/** The remembered nickname and クルーNo. (so the next report does not ask again). */
export function loadProfile(store) {
  const p = parse(store.get(KEYS.profile)) || {};
  return { nickname: cleanNickname(p.nickname), crewNo: validCrewDigits(p.crewNo) };
}
export function saveProfile(store, { nickname = '', crewNo = '' } = {}) { store.set(KEYS.profile, JSON.stringify({ nickname: cleanNickname(nickname), crewNo: validCrewDigits(crewNo) })); }

/**
 * The anonymous login: one { id, token, profile } per backend (a token must never be sent to another server). `profile` is what the server last
 * heard about the nickname and the クルーNo. ({ nickname, crewNo } or null), so a change is sent once and only once.
 * { get(), set({ id, token }), setProfile(p), clear() }
 */
export function createAccounts(store, base) {
  const read = () => parse(store.get(KEYS.account)) || {};
  const write = (all) => { if (Object.keys(all).length) store.set(KEYS.account, JSON.stringify(all)); else store.del(KEYS.account); };
  return {
    get() {
      const a = read()[base];
      if (!a || typeof a.token !== 'string' || !a.token) return null;
      const p = a.profile && typeof a.profile === 'object' ? { nickname: cleanNickname(a.profile.nickname), crewNo: validCrewDigits(a.profile.crewNo) } : null;
      return { id: String(a.id || ''), token: a.token, profile: p };
    },
    set(a) { const all = read(); all[base] = { id: String(a.id || ''), token: String(a.token) }; write(all); },   // (a new login starts with no synced profile)
    setProfile(p) { const all = read(); if (all[base]) { all[base].profile = { nickname: cleanNickname(p?.nickname), crewNo: validCrewDigits(p?.crewNo) }; write(all); } },
    clear() { const all = read(); delete all[base]; write(all); },
  };
}

// ------------------------------------------------------------------ what a submission looks like to its author
/** The four states of a report as the contributor sees them: 'pending' (new) | 'accepted' | 'used' | 'rejected'. `used` also when a version shipped. */
export function statusOf(sub) {
  const s = String(sub?.status || 'new');
  if (s === 'used' || (sub?.usedVersion && s !== 'rejected')) return 'used';
  if (s === 'accepted') return 'accepted';
  if (s === 'rejected') return 'rejected';
  return 'pending';
}
/** "v1.2" for 1.2, "v1.2" for "v1.2", "" for nothing. */
export function versionLabel(v) {
  const s = String(v ?? '').trim();
  return !s ? '' : /^v/i.test(s) ? 'v' + s.slice(1) : 'v' + s;
}
/** Points shown for a submission: only once a moderator has accepted it (a report that is still pending has none yet). */
export const pointsOf = (sub) => (['accepted', 'used'].includes(statusOf(sub)) ? Math.max(0, Number(sub.points) || 0) : 0);
export function fmtDate(iso, lang = 'ja') {
  const d = new Date(iso); if (Number.isNaN(d.getTime())) return '';
  try { return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'ja-JP', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Tokyo' }).format(d); } catch { return ''; }
}
/** mm:ss left until `expiresAt` (ms epoch); '0:00' once it has passed. */
export function countdown(expiresAt, now = Date.now()) {
  const s = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "3 min" / "about 2 h" for a number of seconds (the Retry-After of a daily limit), in the sheet's words: t('contrib.wait.min' | 'contrib.wait.hour'). */
export function waitText(seconds, t) {
  const s = Math.max(0, Math.ceil(Number(seconds) || 0));
  if (s < 3600) return t('contrib.wait.min', { n: Math.max(1, Math.ceil(s / 60)) });
  return t('contrib.wait.hour', { n: Math.max(1, Math.round(s / 3600)) });
}

// ------------------------------------------------------------------ one report, one key
/**
 * An Idempotency-Key for the report about to go (the backend accepts 8 to 80 of letters, digits . _ : -): a retry after a lost answer carries the same
 * key and gets the original report back instead of a second one. A UUID where the browser has crypto.randomUUID (secure pages only), else random bytes.
 */
export function newIdempotencyKey(c = globalThis.crypto) {
  try { if (c?.randomUUID) return c.randomUUID(); } catch { /* an insecure page: below */ }
  const b = new Uint8Array(16);
  try { c.getRandomValues(b); } catch { for (let i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256); }
  return 'k-' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

// ------------------------------------------------------------------ the screenshot
/**
 * The size of the report's screenshot: up to SHOT.maxW wide, never more than the screen's own pixels (a 390 px phone canvas is not blown
 * up to 1600), same aspect. -> { w, h }
 */
export function shotSize(srcW, srcH, { dpr = 1, maxW = SHOT.maxW } = {}) {
  const sw = Math.max(1, srcW | 0), sh = Math.max(1, srcH | 0);
  const w = Math.max(1, Math.min(maxW, Math.round(sw * Math.min(2, Math.max(1, dpr)))));
  return { w, h: Math.max(1, Math.round(w * sh / sw)) };
}
/** The preview (the sheet shows a small copy, never the 1600 px one: a phone does not decode a second large image). -> { w, h } */
export function thumbSize(w, h, maxW = SHOT.thumbW, maxH = 240) {
  const k = Math.min(1, maxW / w, maxH / h);
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

// ------------------------------------------------------------------ the on-screen keyboard
/** Pixels the keyboard covers at the bottom of the layout viewport (visualViewport API); 0 when there is none. */
export function keyboardInset(vv, innerHeight) {
  if (!vv || !(innerHeight > 0)) return 0;
  const bottom = (vv.offsetTop || 0) + (vv.height || 0);
  const inset = Math.round(innerHeight - bottom);
  return inset > 80 ? inset : 0;   // (a few px is the URL bar moving, not a keyboard)
}

// ------------------------------------------------------------------ the device-transfer link
/**
 * The link the QR code carries: this page's address with ?claim=CODE, and ?contribApi= only when `api` is a backend
 * other than the default. An empty `api` adds nothing. This function does not fetch.
 */
export function claimUrl(pageHref, code, { api = '', defaultApi = CONTRIB_API } = {}) {
  const u = new URL(pageHref);
  u.hash = ''; u.search = '';
  u.searchParams.set('claim', code);
  if (api && api !== defaultApi) u.searchParams.set('contribApi', api);
  return u.toString();
}
/** ?claim=CODE out of a query string, validated; '' when there is none. */
export function claimFromSearch(search) {
  try { const c = checkClaimCode(new URLSearchParams(search).get('claim')); return c.ok ? c.code : ''; } catch { return ''; }
}
