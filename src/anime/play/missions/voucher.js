// [play:missions] Real-world rewards. A voucher is shown only for a partner with written consent
// who is active and inside their dates. Otherwise the card says 協力店募集中 and the in-game
// reward still applies. The code is a checksum of (quest code + device id + completion minute).
// Nothing is stored on a server. The shop may open /api/play/voucher/check?c= to see that the
// code is well formed. The game itself never sends it.

export const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32, no I O 0 1

const PAPER = '#FBFAF5';
const NAVY = '#223A70';
const IRON = '#17184B';

function lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }

export function relLum(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  const r = lin((n >> 16) & 255), g = lin((n >> 8) & 255), b = lin(n & 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const L1 = relLum(a), L2 = relLum(b);
  const hi = L1 > L2 ? L1 : L2, lo = L1 > L2 ? L2 : L1;
  return (hi + 0.05) / (lo + 0.05);
}

/** Ink that clears 4.5:1 on this plate: paper, then navy, then iron. */
export function inkOn(bg) {
  if (contrast(PAPER, bg) >= 4.5) return PAPER;
  if (contrast(NAVY, bg) >= 4.5) return NAVY;
  return IRON;
}

/** A role colour used as a glyph on paper. Iron when the colour itself is too light. */
export function glyphOnPaper(color) {
  return contrast(color, PAPER) >= 4.5 ? color : IRON;
}

export function fnv32(s) {
  let h = 0x811c9dc5;
  const str = String(s);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function toBase(n, len) {
  let x = n >>> 0;
  let s = '';
  for (let i = 0; i < len; i++) {
    s = ALPH[x % 32] + s;
    x = Math.floor(x / 32);
  }
  return s;
}

export function fromBase(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const k = ALPH.indexOf(s[i]);
    if (k < 0) return null;
    n = n * 32 + k;
  }
  return n;
}

/**
 * `QUEST-DDDD-MMMMMM-C`. Quest code is the letters we chose (4–8). The rest is the device
 * hash, the UTC minute, and a check character. Same inputs always give the same code.
 */
export function makeVoucherCode({ questId, deviceId, minute }) {
  const q = String(questId || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const d = toBase(fnv32(deviceId) % (32 ** 4), 4);
  const m = toBase(minute >>> 0, 6);
  const core = `${q}-${d}-${m}`;
  const check = ALPH[fnv32(core) % 32];
  return `${core}-${check}`;
}

export function parseVoucherCode(code) {
  const raw = String(code || '').toUpperCase().replace(/\s/g, '');
  const m = /^([A-Z0-9]{4,8})-([ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4})-([ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6})-([ABCDEFGHJKLMNPQRSTUVWXYZ23456789])$/.exec(raw);
  if (!m) return { ok: false };
  const core = `${m[1]}-${m[2]}-${m[3]}`;
  if (ALPH[fnv32(core) % 32] !== m[4]) return { ok: false };
  return { ok: true, quest: m[1], deviceHash: m[2], minute: fromBase(m[3]) };
}

/** GET /api/play/voucher/check?c=  — format only. Nothing is written or looked up. */
export function voucherHttp(url) {
  const parsed = parseVoucherCode(url.searchParams.get('c') || '');
  const body = JSON.stringify(parsed.ok
    ? { ok: true, quest: parsed.quest, minute: parsed.minute }
    : { ok: false });
  return new Response(body, {
    status: parsed.ok ? 200 : 400,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export function partnerLive(p, now) {
  if (!p || p.active !== true) return false;
  if (!p.consent || p.consent.kind !== 'written') return false;
  if (p.validFrom && now < Date.parse(p.validFrom)) return false;
  if (p.validTo && now > Date.parse(p.validTo)) return false;
  return true;
}

/**
 * The card for a finished quest. The same device sees the same code if it opens the card again.
 * `quest.voucher` is true, or a partner id. No live partner → kind `recruiting`.
 */
export function presentReward(quest, partners, state, now, deviceId, opts) {
  const prev = state.rewards[quest.id];
  if (prev) return prev;
  const view = {
    quest: quest.id,
    at: now,
    stamp: quest.reward?.stamp || '',
    titleKey: quest.reward?.title || quest.title,
    factKey: quest.fact || '',
    fromKey: quest.factFrom || '',
    kind: 'game',
    code: null,
    partner: null,
  };
  if (quest.album === 'views') {
    const send = (quest.steps || []).some((s) => s.type === 'viewSend');
    view.kind = send ? 'view-sent' : 'view';
    view.viewId = quest.view || null;
  } else if (quest.voucher) {
    const partner = typeof quest.voucher === 'string' ? (partners || []).find((x) => x.id === quest.voucher) : null;
    if (partnerLive(partner, now)) {
      view.kind = 'voucher';
      view.partner = partner.id;
      view.code = makeVoucherCode({ questId: quest.code || quest.id, deviceId, minute: Math.floor(now / 60000) });
    } else {
      view.kind = 'recruiting';
    }
  }
  if (!opts?.preview) state.rewards[quest.id] = view;
  return view;
}

/** `2026年10月7日 13:19` or `2026-10-07 13:19`. Half-width digits. */
export function formatWhen(ms, lang) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  if (lang === 'en') return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function deviceIdOf(meta, rng = Math.random) {
  if (meta && typeof meta.deviceId === 'string' && meta.deviceId.length >= 6) return meta.deviceId;
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPH[Math.floor(rng() * 32)];
  return s;
}
