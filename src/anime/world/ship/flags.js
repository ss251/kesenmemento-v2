// [ship] Feature flags for the 第一昭福丸 build.
//
// nendoLivery: the full nendo livery (2020, nendo for 臼福本店). Livery permission granted to the captain by 臼福本店 on
// 2026-10-03; nendo livery is the default in all builds (docs/ship/shofukumaru-dossier.md, the UPDATE header). The plain
// fallback stays in the code as an OPT-IN only:
//   1. the URL parameter ?livery=fallback|nendo wins;
//   2. otherwise a build that defines KLC_NENDO=0 gets the fallback (Bun.build({ define: { KLC_NENDO: '"0"' } }) or
//      the env at bundle time); KLC_NENDO=1 (or no define) keeps nendo;
//   3. otherwise nendo, on every host: localhost, the tailnet, the public Funnel link and any public deploy alike.
// With the fallback, ./livery.js paints the plain livery and never fetches data/ship/shofukumaru1/*-nendo*.json.

// isDevHost no longer decides the livery; ship/sendoff.js still uses it to look for the captain's local music file.
export const DEV_HOST_RE = /^(localhost|127\.0\.0\.1|\[?::1\]?)$|\.localhost$/i;
export const isDevHost = (h) => DEV_HOST_RE.test(String(h || '').trim());

/**
 * The build-time define, tri-state: true for KLC_NENDO=1, false for KLC_NENDO=0, null when not set. Reads a bare
 * KLC_NENDO identifier replaced by the bundler, else process.env.KLC_NENDO.
 */
export function buildDefine() {
  const val = (v) => (String(v) === '0' ? false : String(v) === '1' ? true : null);
  try { if (typeof KLC_NENDO !== 'undefined') return val(KLC_NENDO); } catch { /* not defined */ }   // eslint-disable-line no-undef
  try { if (typeof process !== 'undefined' && process.env && process.env.KLC_NENDO !== undefined) return val(process.env.KLC_NENDO); } catch { /* no process */ }
  return null;
}

/**
 * Resolve the flags. Arguments default to the page (location.search) and the build define; tests pass them
 * explicitly (`define`: true | false | null). `hostname` is accepted for callers that pass it but no longer changes
 * the result. Returns { nendoLivery, source } (source: 'url' | 'define' | 'default').
 */
export function resolveFlags({ search, define } = {}) {
  const loc = typeof location !== 'undefined' ? location : null;
  const q = new URLSearchParams(search ?? loc?.search ?? '').get('livery');
  if (q === 'fallback') return { nendoLivery: false, source: 'url' };
  if (q === 'nendo') return { nendoLivery: true, source: 'url' };
  const d = define === undefined ? buildDefine() : define;
  if (d === false) return { nendoLivery: false, source: 'define' };
  if (d === true) return { nendoLivery: true, source: 'define' };
  return { nendoLivery: true, source: 'default' };
}
