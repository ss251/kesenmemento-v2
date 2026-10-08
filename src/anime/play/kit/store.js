// [play] Progress on this device. One key, one schema, every read and write in try/catch.
// Nothing here leaves the device. `klc.play.v1` (KIT-API.md).
//
// v1: { v:1,
//   katsuo: { found: { [id]: isoTime } },
//   courses: { [id]: { best: ms, medal: 'gold'|'silver'|'bronze'|null, runs, splits?: number[] } },
//   fish: { [id]: { n, maxCm, first: iso } },
//   meta: { firstRun: iso, sound: boolean } }
// Older notebooks (a found-array plus a t map, fish.max) migrate in. A corrupt
// value becomes an empty notebook; a storage throw keeps the change in memory.

export const KEY = 'klc.play.v1';
export const SECTIONS = ['katsuo', 'courses', 'fish', 'meta'];
const MEDALS = new Set(['gold', 'silver', 'bronze']);

export function emptyState() {
  return { v: 1, katsuo: { found: {} }, courses: {}, fish: {}, meta: {} };
}

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

/** Bring any stored value up to schema v1. Never throws. */
export function migrate(raw) {
  const state = emptyState();
  if (!isObj(raw)) return state;

  const katsuo = isObj(raw.katsuo) ? raw.katsuo : {};
  const found = {};
  if (Array.isArray(katsuo.found)) {
    const t = isObj(katsuo.t) ? katsuo.t : {};
    for (const id of katsuo.found) {
      if (typeof id !== 'string' && typeof id !== 'number') continue;
      const k = String(id);
      found[k] = typeof t[k] === 'string' ? t[k] : null;
    }
  } else if (isObj(katsuo.found)) {
    for (const [k, v] of Object.entries(katsuo.found)) {
      if (typeof v === 'string' || v == null) found[k] = v ?? null;
    }
  }
  state.katsuo.found = found;

  if (isObj(raw.courses)) {
    for (const [id, row] of Object.entries(raw.courses)) {
      if (!isObj(row)) continue;
      const best = Number(row.best);
      const runs = Number(row.runs);
      const medal = row.medal == null ? null : (MEDALS.has(row.medal) ? row.medal : null);
      if (!Number.isFinite(best) && !Number.isFinite(runs) && medal == null && row.medal == null) continue;
      const splits = Array.isArray(row.splits)
        ? row.splits.map(Number).filter((n) => Number.isFinite(n))
        : null;
      state.courses[id] = {
        best: Number.isFinite(best) ? best : null,
        medal,
        runs: Number.isFinite(runs) ? Math.max(0, runs) : 0,
      };
      if (splits && splits.length) state.courses[id].splits = splits;
    }
  }

  if (isObj(raw.fish)) {
    for (const [id, row] of Object.entries(raw.fish)) {
      if (!isObj(row)) continue;
      const n = Number(row.n);
      const maxCm = Number(row.maxCm != null ? row.maxCm : row.max);
      state.fish[id] = {
        n: Number.isFinite(n) ? Math.max(0, n) : 0,
        maxCm: Number.isFinite(maxCm) ? maxCm : null,
        first: typeof row.first === 'string' ? row.first : null,
      };
    }
  }

  const meta = isObj(raw.meta) ? raw.meta : {};
  if (typeof meta.firstRun === 'string') state.meta.firstRun = meta.firstRun;
  if (typeof meta.sound === 'boolean') state.meta.sound = meta.sound;
  if (typeof meta.hubOpened === 'string') state.meta.hubOpened = meta.hubOpened;
  if (isObj(meta.played)) {
    const played = {};
    for (const [k, v] of Object.entries(meta.played)) if (typeof v === 'string') played[k] = v;
    if (Object.keys(played).length) state.meta.played = played;
  }
  const seen = {};
  if (isObj(raw.seen)) Object.assign(seen, raw.seen);
  if (isObj(meta.seen)) Object.assign(seen, meta.seen);
  if (Object.keys(seen).length) state.meta.seen = seen;
  // [play:car] the garage and the best-lap ghost. Kept whole so a kit migrate does not wipe the car.
  if (isObj(meta.car)) state.meta.car = clone(meta.car);
  // [play:missions] the quest log and the voucher device id live on meta. Keep them across a reload.
  if (isObj(meta.missions)) state.meta.missions = clone(meta.missions);
  if (typeof meta.deviceId === 'string' && meta.deviceId.length >= 4 && meta.deviceId.length <= 16) state.meta.deviceId = meta.deviceId;
  return state;
}

function readRaw(storage) {
  try {
    const raw = storage.getItem(KEY);
    if (raw == null || raw === '') return emptyState();
    return migrate(JSON.parse(raw));
  } catch (e) {
    return emptyState();
  }
}

export function createStore(storage) {
  let state = readRaw(storage);
  const listeners = { katsuo: new Set(), courses: new Set(), fish: new Set(), meta: new Set() };

  function save() {
    try { storage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* the change still holds in memory */ }
  }
  function emit(section) {
    const copy = clone(state[section]);
    for (const fn of listeners[section]) {
      try { fn(copy); } catch (e) { /* one tab must not sink the notebook */ }
    }
  }

  return {
    get(section) {
      if (!listeners[section]) return {};
      return clone(state[section]);
    },
    update(section, fn) {
      if (!listeners[section] || typeof fn !== 'function') return;
      const draft = clone(state[section]);
      fn(draft);
      state[section] = draft;
      save();
      emit(section);
    },
    on(section, cb) {
      const set = listeners[section];
      if (!set || typeof cb !== 'function') return () => {};
      set.add(cb);
      return () => set.delete(cb);
    },
    reset() {
      state = emptyState();
      save();
      for (const s of SECTIONS) emit(s);
    },
  };
}

function browserStorage() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
  } catch (e) { /* private mode */ }
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

export const store = createStore(browserStorage());
