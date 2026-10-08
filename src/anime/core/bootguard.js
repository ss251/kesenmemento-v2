// [mobile-perf] The crash-loop guard: a phone degrades instead of crashing again.
//
// When iOS jetsam kills the tab (memory), Safari reloads it; a second kill shows "A problem repeatedly occurred". The page's JS never hears
// of a kill, but localStorage is written outside the web content process and survives it. So:
//   boot:    read localStorage['klc.boot'] = { state, t, n }. A previous load still 'loading' less than 5 minutes ago died: n + 1, else n = 0.
//            Write { state: 'loading', t: now, n }.
//   ok:      the town has been on screen ~10 s (main.js): { state: 'ok', n: 0 }.
//   left:    the page is hidden or closed while still loading (pagehide): { state: 'left' }, not a crash.
// A phone that comes back with n >= 1 boots a lighter profile (level 1, n >= 2: level 2, liteOverrides). ?lite=0|1|2 pins the level for
// testing. Never on desktop: only the phone tier (a phone or a tablet, core/tier.js) ever gets a level.
// Pure (tests: test/mobile-bootguard.test.js); core/tier.js runs it once at import, before any module reads PHONE.

export const BOOT_KEY = 'klc.boot';
export const STALE_MS = 5 * 60 * 1000;

const read = (store) => { try { const v = JSON.parse(store?.getItem?.(BOOT_KEY) || 'null'); return v && typeof v === 'object' ? v : null; } catch (e) { return null; } };
const write = (store, v) => { try { store?.setItem?.(BOOT_KEY, JSON.stringify(v)); return true; } catch (e) { return false; } };

/** The previous load's fate. -> n: how many loads in a row died (0: the last one was fine, or is too old to count) */
export function crashCount(prev, now = Date.now(), staleMs = STALE_MS) {
  if (!prev || prev.state !== 'loading' || !Number.isFinite(prev.t)) return 0;
  const age = now - prev.t;
  if (!(age >= 0 && age < staleMs)) return 0;
  return Math.min(9, Math.max(0, prev.n | 0) + 1);
}

/** Boot: read the last state, count, and mark this load as loading. -> { n, prev } */
export function bootStart(store, now = Date.now()) {
  const prev = read(store);
  const n = crashCount(prev, now);
  write(store, { state: 'loading', t: now, n });
  return { n, prev };
}
/** The town has been stable for a while: the next boot starts clean. */
export function bootOk(store, now = Date.now()) { return write(store, { state: 'ok', t: now, n: 0 }); }
/** The page went away while still loading (the visitor left or reloaded): not a crash. Only replaces a 'loading' state. */
export function bootLeft(store, now = Date.now()) { const s = read(store); if (s && s.state === 'loading') return write(store, { state: 'left', t: now, n: s.n | 0 }); return false; }

/** The lite level for this boot: 0 (normal), 1 (lighter), 2 (the ultra-safe settings). param: the ?lite= value (null: not given). */
export function liteLevel({ phone = false, param = null, n = 0 } = {}) {
  if (param === '0') return 0;
  if (param === '1' || param === '2') return phone ? Number(param) : 0;
  if (!phone) return 0;
  return n >= 2 ? 2 : n >= 1 ? 1 : 0;
}

/** What a lite level changes. phone: PHONE overrides (core/tier.js); quality: the phone preset's; stream: the phone's stream radii
 *  (world/explore/stream.js); canvasPR / drMax: main.js's canvas ratio and dynamic resolution ceiling. */
export function liteOverrides(level) {
  if (level >= 2) return {
    phone: { atlasPage: 1024, canvasMax: 256, atlasDensity: 120, drawMax: 1600, farDist: 1400, farSmall: 600, heroR: 0.32, treeNear: 80, treeNear2: 400, treeFarKeep: 0.2, bikes: 0, maxBoats: 3, arrivals: 1, poleR: 120, gardens: 220, landuseR: 380, streetR: 650, lineRange: 450 },
    quality: { pixelRatio: 1.0, shadowMap: 512, shadowSize: 30, petals: 0.1 },
    stream: { l0: 25, l1: 120, budget: 1.5 },
    canvasPR: 1, drMax: 1, drMin: 0.6,
  };
  if (level >= 1) return {
    phone: { atlasPage: 1024, canvasMax: 384, atlasDensity: 160, drawMax: 2000, farDist: 1700, farSmall: 800, heroR: 0.38, treeNear: 100, treeNear2: 500, treeFarKeep: 0.28, bikes: 3, maxBoats: 4, arrivals: 2, poleR: 150, gardens: 300, landuseR: 460, streetR: 800, lineRange: 550 },
    quality: { pixelRatio: 1.25, shadowMap: 1024 },
    stream: { l0: 30, l1: 170, budget: 1.8 },
    canvasPR: 1, drMax: 1, drMin: 0.6,
  };
  return null;
}

/** The toast a lite boot shows (non-alarming). */
export function liteNote(lang = 'ja') { return lang === 'en' ? 'Showing a lighter version' : '軽量モードで表示しています'; }
