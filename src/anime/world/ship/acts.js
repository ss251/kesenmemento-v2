// [ship:acts] The three acts of 第一昭福丸 as a PURE, serialisable state machine (no DOM, no three.js; tested in
// test/ship-acts.test.js). The director (ship/voyage.js) feeds it events from the scenes; the UI (ui/ship.js) reads
// its state. Every rule here follows the captain's dossier (docs/ship/shofukumaru-dossier.md, section 5 and "What this
// means for the three acts"):
//
//   ACT 1 出船  DOCKED -> SENDOFF -> DEPART -> BAY_MOUTH
//   ACT 2 漁   OCEAN_SET -> WAIT -> HAUL -> STOW
//   ACT 3 帰港 TRANSSHIP_LAS_PALMAS -> REEFER -> SHIMIZU_WEIGH -> HOMECOMING -> CARD
//
// The catch does NOT sail home: it is transshipped at Las Palmas into reefer containers, landed at the bonded port of
// Shimizu for the landing inspection (about 3 Fisheries Agency inspectors, a reader gun on each fish's chip, a
// same-number sticker on its cheek, the trucks on truck scales; 1 kg over the quota costs the licences of all 6 ships:
// docs/ship/next-pass-usui.md item 3), while the ship and crew come home to Kesennuma under 大漁旗.
//
//   const acts = createActs({ seed, date })     acts.state / acts.data / acts.act
//   acts.can(ev, payload) -> { ok, reason? }    acts.send(ev, payload) -> { ok, state, reason?, auto? }
//   acts.snapshot() -> plain JSON               createActs(snapshot) restores it
import { formatTag } from './tags.js';

export const STATES = [
  'DOCKED', 'SENDOFF', 'DEPART', 'BAY_MOUTH',
  'OCEAN_SET', 'WAIT', 'HAUL', 'STOW',
  'TRANSSHIP_LAS_PALMAS', 'REEFER', 'SHIMIZU_WEIGH', 'HOMECOMING', 'CARD',
];
export const ACT_OF = {
  DOCKED: 1, SENDOFF: 1, DEPART: 1, BAY_MOUTH: 1,
  OCEAN_SET: 2, WAIT: 2, HAUL: 2, STOW: 2,
  TRANSSHIP_LAS_PALMAS: 3, REEFER: 3, SHIMIZU_WEIGH: 3, HOMECOMING: 3, CARD: 3,
};
/** Act 3 runs in exactly this order (the true chain). */
export const CHAIN_ORDER = ['TRANSSHIP_LAS_PALMAS', 'REEFER', 'SHIMIZU_WEIGH', 'HOMECOMING', 'CARD'];
/**
 * The Shimizu landing inspection, in order (Usui's talk, 2026-10-03; docs/ship/next-pass-usui.md item 3): about 3
 * Fisheries Agency inspectors check by eye, scan each fish's chip with a reader gun, put a sticker with the same number
 * on its cheek, and the trucks are weighed on truck scales; the last caption is the rule.
 */
export const SHIMIZU_STEPS = ['inspectors', 'chip', 'sticker', 'truck', 'rule'];

/** Sourced rules and numbers (dossier section 5). */
export const RULES = {
  minKg: 30,              // ICCAT Rec. 22-08 (= 18-02): Atlantic bluefin under 30 kg (or 115 cm fork length) is released
  minFL: 115,             // cm, the other half of the same minimum
  lineKm: 150,            // 幹縄 about 150 km, Kesennuma to Sendai (北かつ; Usui's slide)
  hooks: 3000,            // about 3,000 hooks
  floatEveryM: 300,       // floats 300 m apart (one 'basket' between floats)
  branchPerBasket: [10, 15],
  waitH: 2,               // 縄待ち 2-3 h; the haul may start after 2 h
  waitMaxH: 3,
  setH: [4, 5],           // setting from the stern 4-5 h (Usui's slide: 7-8 h)
  haulH: [10, 12],        // hauling 10-12 h (slide: 11-12 h)
  freezeC: -60,           // the hold and the blast freezers at -60 °C
  coreH: 36,              // about 36 h to freeze the core
  japanT: 3779,           // Japan's 2025/26 E. Atlantic bluefin quota (Usui's slide)
  tacT: 43296,            // the E. Atlantic + Mediterranean TAC (slide)
  japanBoats: 100,        // about 100 registered boats share Japan's quota, 48 of them fish Atlantic bluefin
  japanBluefinBoats: 48,  // (Usui's talk, 2026-10-03; next-pass-usui.md item 2)
  inspectors: 3,          // about 3 Fisheries Agency inspectors at the Shimizu landing (next-pass-usui.md item 3)
  fleetShips: 6,          // 1 kg over the quota costs the licences of all 6 of the company's ships (item 3)
  // The quota bar is the ship's share (dossier §5): the minister's allocation to this one ship is about 80 t, as Usui
  // said in his public talk on 2026-10-03 (docs/ship/next-pass-usui.md item 2, marked ⚠, so it is shown as 'about';
  // it fits the 76.3 t MSC catch of 2024). This set's catch is a slice of it.
  shipShareKg: 80000,
  allowanceKg: 80000,
  season: { from: [8, 1], to: [1, 31] },   // west of 10°W and north of 42°N: 1 Aug - 31 Jan for large-scale longliners
};
export const SPECIES = {
  bluefin: { ja: 'クロマグロ（大西洋）', en: 'Atlantic bluefin', tagged: true, quota: true },
  bigeye: { ja: 'メバチ', en: 'Bigeye', tagged: false, quota: false },
  albacore: { ja: 'ビンナガ', en: 'Albacore', tagged: false, quota: false },
};

/** Japan's share of the TAC as shown on the quota bar's context line: '8.7'. */
export const japanSharePct = () => (Math.round((RULES.japanT / RULES.tacT) * 1000) / 10).toFixed(1);

/** Is the ground west of 10°W / north of 42°N open on this date ('YYYY-MM-DD')? Aug 1 - Jan 31. */
export function seasonOpen(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''));
  if (!m) return false;
  const mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  return mo >= RULES.season.from[0] || mo <= RULES.season.to[0];
}

/** Today's date in Japan ('YYYY-MM-DD'; UTC+9), the clock the live claim about the real ship is checked against. */
export const todayJst = (now = Date.now()) => new Date(now + 9 * 3600e3).toISOString().slice(0, 10);
/**
 * The ocean banner's second sentence. No wording says the real ship is fishing "right now" (the dossier supports that
 * for 14 Sep 2026 only): inside the Aug-Jan season the banner says the season is open and she fishes here in it every
 * year; outside it, that she fishes here each season. -> an i18n key.
 */
export const oceanNoposKey = (today = todayJst()) => (seasonOpen(today) ? 'ship.ocean.nopos' : 'ship.ocean.nopos.off');

// Length-weight relations (W kg, FL cm): bluefin a = 3.5e-5, b = 2.878 maps 30 kg to 115 cm, the two halves of the
// ICCAT minimum; bigeye and albacore use common Atlantic relations. Display only (the rule is on the weight).
const LW = { bluefin: [3.5e-5, 2.878], bigeye: [2.396e-5, 2.9774], albacore: [1.3718e-5, 3.0973] };
export function forkLengthCm(species, kg) {
  const [a, b] = LW[species] || LW.bluefin;
  return Math.round(Math.pow(kg / a, 1 / b));
}

/** Small seeded PRNG (mulberry32), local so the module stays pure and import-free. */
function prng(seed) {
  let a = (typeof seed === 'string' ? [...seed].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261) : seed) >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * The fish on this set's line, in the order they come up (deterministic per seed). Mostly 150 kg-class bluefin, two
 * undersize bluefin (to release), one bigeye and one albacore (not ICCAT-tagged, not on the bluefin quota).
 */
export function makeCatch(seed = 'shofuku-2026', n = 14) {
  const r = prng(seed);
  const plan = ['bluefin', 'bluefin', 'bluefin:small', 'bigeye', 'bluefin', 'bluefin', 'bluefin:small', 'bluefin', 'albacore', 'bluefin', 'bluefin', 'bluefin', 'bluefin', 'bluefin'];
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = plan[i % plan.length];
    const [species, size] = p.split(':');
    let kg;
    if (species === 'bluefin') kg = size === 'small' ? 19 + r() * 9 : 95 + r() * 125;   // under 30 kg / 95-220 kg
    else if (species === 'bigeye') kg = 42 + r() * 30;
    else kg = 14 + r() * 8;
    kg = Math.round(kg * 10) / 10;
    out.push({ n: i + 1, species, kg, fl: forkLengthCm(species, kg) });
  }
  return out;
}

function freshData({ seed = 'shofuku-2026', date = '2026-10-10', allowanceKg = RULES.allowanceKg, yy = 26 } = {}) {
  return {
    seed, date, yy, allowanceKg,
    horn: false, tapesSnapped: 0, passed: [],
    setKm: 0, hooks: 0, floats: 0,
    waitedH: 0,
    catch: makeCatch(seed), next: 0, onScale: null,
    kept: [], released: [], landedKg: 0, nextTag: 1, quotaHit: false, haulEnd: null,
    freezeH: 0,
    weighIn: null, licence: true,
  };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r1 = (v) => Math.round(v * 10) / 10;

/**
 * The transition table: event -> { from: [states], to?, guard?(d, p) -> reason|null, act?(d, p, M) }.
 * An event without `to` updates data in place. `act` may return a state to move to automatically.
 */
export const EVENTS = {
  START: { from: ['DOCKED'], to: 'SENDOFF' },
  HORN: { from: ['SENDOFF', 'DEPART', 'HOMECOMING'], act(d) { d.horn = true; } },
  TAPE_SNAP: { from: ['SENDOFF', 'DEPART'], act(d, p) { d.tapesSnapped += Math.max(1, p?.n | 0); } },
  CAST_OFF: { from: ['SENDOFF'], to: 'DEPART', guard: (d) => (d.horn ? null : 'no_horn') },
  PASS: { from: ['DEPART'], guard: (d, p) => (['kanae', 'shoko'].includes(p?.what) ? null : 'bad_payload'), act(d, p) { if (!d.passed.includes(p.what)) d.passed.push(p.what); } },
  REACH_BAY_MOUTH: { from: ['DEPART'], to: 'BAY_MOUTH', guard: (d) => (d.passed.includes('kanae') ? null : 'not_under_kanae') },
  TO_OCEAN: { from: ['BAY_MOUTH'], to: 'OCEAN_SET', guard: (d) => (seasonOpen(d.date) ? null : 'season_closed') },
  SET_PROGRESS: {
    from: ['OCEAN_SET'],
    guard: (d, p) => (Number.isFinite(p?.km) ? null : 'bad_payload'),
    act(d, p) {
      d.setKm = r1(clamp(Math.max(d.setKm, p.km), 0, RULES.lineKm));
      d.hooks = Math.round((d.setKm / RULES.lineKm) * RULES.hooks);
      d.floats = Math.floor((d.setKm * 1000) / RULES.floatEveryM);
    },
  },
  SET_DONE: { from: ['OCEAN_SET'], to: 'WAIT', guard: (d) => (d.setKm >= RULES.lineKm ? null : 'line_not_set') },
  WAIT_PROGRESS: { from: ['WAIT'], guard: (d, p) => (Number.isFinite(p?.h) ? null : 'bad_payload'), act(d, p) { d.waitedH = r1(clamp(Math.max(d.waitedH, p.h), 0, RULES.waitMaxH)); } },
  WAIT_DONE: { from: ['WAIT'], to: 'HAUL', guard: (d) => (d.waitedH >= RULES.waitH ? null : 'still_soaking') },
  FISH_UP: {
    from: ['HAUL'],
    guard: (d) => (d.onScale ? 'scale_busy' : d.next >= d.catch.length ? 'line_empty' : null),
    act(d) { d.onScale = { ...d.catch[d.next] }; d.next++; },
  },
  KEEP: {
    from: ['HAUL'],
    guard(d) {
      const f = d.onScale;
      if (!f) return 'no_fish';
      if (f.species === 'bluefin' && f.kg < RULES.minKg) return 'undersize';
      if (SPECIES[f.species]?.quota && d.landedKg + f.kg > d.allowanceKg) return 'quota';
      return null;
    },
    act(d) {
      const f = d.onScale;
      const tag = SPECIES[f.species]?.tagged ? formatTag(d.nextTag++, d.yy) : null;
      // dossier §5: bled and spiked at once (神経締め); gills, guts and tail removed; frozen at -60 °C
      d.kept.push({ ...f, tag, bled: true, spiked: true, dressed: true, frozenC: RULES.freezeC });
      if (SPECIES[f.species]?.quota) d.landedKg = r1(d.landedKg + f.kg);
      d.onScale = null;
      return endOfHaul(d);
    },
  },
  RELEASE: {
    from: ['HAUL'],
    guard: (d) => (d.onScale ? null : 'no_fish'),
    act(d) { d.released.push({ ...d.onScale }); d.onScale = null; return endOfHaul(d); },
  },
  // a keep that would pass the allowance is refused with 'quota'; the voyage records it and the haul stops there
  QUOTA_STOP: { from: ['HAUL'], act(d) { d.quotaHit = true; } },
  HAUL_DONE: { from: ['HAUL'], to: 'STOW', guard: (d) => (d.onScale ? 'scale_busy' : (d.haulEnd || d.next >= d.catch.length) ? null : 'line_still_out') },
  FREEZE_PROGRESS: { from: ['STOW'], guard: (d, p) => (Number.isFinite(p?.h) ? null : 'bad_payload'), act(d, p) { d.freezeH = r1(clamp(Math.max(d.freezeH, p.h), 0, RULES.coreH)); } },
  STOW_DONE: { from: ['STOW'], to: 'TRANSSHIP_LAS_PALMAS', guard: (d) => (d.freezeH >= RULES.coreH ? null : 'not_frozen') },
  NEXT: {
    from: ['TRANSSHIP_LAS_PALMAS', 'REEFER', 'SHIMIZU_WEIGH', 'HOMECOMING'],
    guard(d, p, M) { if (M.state === 'SHIMIZU_WEIGH') return weighInOk(d) ? null : 'over_declared'; return null; },
    act(d, p, M) {
      const i = CHAIN_ORDER.indexOf(M.state);
      return CHAIN_ORDER[i + 1];
    },
  },
  RESTART: { from: ['CARD'], to: 'DOCKED' },
};

/** After a keep or a release: stop the haul when the allowance has no room for a legal bluefin, when a keep was
 *  refused for the quota, or when the line is in. Returns 'STOW' to move there. */
function endOfHaul(d) {
  if (d.quotaHit) { d.haulEnd = 'quota'; return 'STOW'; }
  if (d.allowanceKg - d.landedKg < RULES.minKg) { d.haulEnd = 'quota'; return 'STOW'; }
  if (d.next >= d.catch.length) { d.haulEnd = 'line_in'; return 'STOW'; }
  return null;
}

/** Shimizu: every tagged fish is checked again at the landing (its chip scanned, the same-number sticker on its cheek,
 *  the trucks weighed); the weighed total may not pass the declared catch. Each row carries its sticker number. */
export function weighIn(d) {
  const rows = d.kept.filter((f) => f.tag).map((f) => ({ tag: f.tag, sticker: f.tag, scanned: true, species: f.species, declared: f.kg, weighed: f.weighed ?? f.kg }));
  const declared = r1(rows.reduce((s, x) => s + x.declared, 0)), weighed = r1(rows.reduce((s, x) => s + x.weighed, 0));
  return { rows, declared, weighed, overKg: r1(Math.max(0, weighed - declared)) };
}
/** 1 kg over the declared catch loses the licence (Usui's slide 79). */
export const weighInOk = (d) => weighIn(d).overKg < 1;

function onEnter(M, state) {
  const d = M.data;
  if (state === 'SHIMIZU_WEIGH') d.weighIn = weighIn(d);
  if (state === 'DOCKED') M.data = freshData({ seed: d.seed, date: d.date, allowanceKg: d.allowanceKg, yy: d.yy });
}

export function createActs(init = {}) {
  const snap = init && init.v === 1 && init.state ? init : null;
  if (snap && !STATES.includes(snap.state)) throw new Error('unknown state ' + snap.state);
  const M = {
    state: snap ? snap.state : 'DOCKED',
    data: snap ? JSON.parse(JSON.stringify(snap.data)) : freshData(init),
    log: snap ? [...(snap.log || [])] : [],
  };
  const listeners = new Set();
  const api = {
    get state() { return M.state; },
    get data() { return M.data; },
    get act() { return ACT_OF[M.state]; },
    get log() { return M.log; },
    /** Would this event be accepted now? */
    can(ev, payload) {
      const E = EVENTS[ev];
      if (!E) return { ok: false, reason: 'unknown_event' };
      if (!E.from.includes(M.state)) return { ok: false, reason: 'illegal' };
      const why = E.guard ? E.guard(M.data, payload, M) : null;
      return why ? { ok: false, reason: why } : { ok: true };
    },
    send(ev, payload) {
      const c = api.can(ev, payload);
      if (!c.ok) {
        // a refused keep for the quota is a rule moment the voyage must remember: the haul stops after this fish
        if (ev === 'KEEP' && c.reason === 'quota') M.data.quotaHit = true;
        return { ok: false, state: M.state, reason: c.reason };
      }
      const E = EVENTS[ev], from = M.state;
      const auto = E.act ? E.act(M.data, payload, M) : null;
      const to = E.to || auto || null;
      if (to && to !== from) { M.state = to; onEnter(M, to); }
      M.log.push(to && to !== from ? `${from}>${ev}>${to}` : `${from}:${ev}`);
      if (M.log.length > 200) M.log.splice(0, M.log.length - 200);
      const res = { ok: true, state: M.state, from, auto: !E.to && !!auto };
      for (const f of listeners) try { f(res, ev, payload); } catch (e) { /* listeners never break the machine */ }
      return res;
    },
    onChange(f) { listeners.add(f); return () => listeners.delete(f); },
    snapshot() { return JSON.parse(JSON.stringify({ v: 1, state: M.state, data: M.data, log: M.log })); },
    toJSON() { return api.snapshot(); },
  };
  return api;
}
