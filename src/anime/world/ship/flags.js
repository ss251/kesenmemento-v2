// [ship] Feature flags for the 第一昭福丸 build.
//
// nendoLivery: the full nendo livery (2020, nendo for 臼福本店) is the designer's work. The captain met Usufuku on
// 2026-10-03; until he decides on a public deploy it is ON only for local / dev builds:
//   1. the URL parameter ?livery=nendo|fallback wins;
//   2. otherwise ON for localhost, 127.0.0.1, ::1 and *.localhost hosts, or when the build defines KLC_NENDO=1
//      (Bun.build({ define: { KLC_NENDO: '"1"' } }) or the env at bundle time);
//   3. OFF everywhere else (public). That includes *.ts.net: the captain's public Funnel link is a ts.net host, so
//      tailnet dev turns the livery on with ?livery=nendo or KLC_NENDO=1, never by host name.
// scripts/public-mirror.js also DENYs data/ship/shofukumaru1/*nendo* so the public mirror never serves the trace.
// When OFF, ./livery.js paints the fallback livery and never fetches data/ship/shofukumaru1/*-nendo*.json.

export const DEV_HOST_RE = /^(localhost|127\.0\.0\.1|\[?::1\]?)$|\.localhost$/i;
export const isDevHost = (h) => DEV_HOST_RE.test(String(h || '').trim());

/** The build-time define: a bare KLC_NENDO identifier replaced by the bundler, or process.env.KLC_NENDO. */
export function buildDefine() {
  try { if (typeof KLC_NENDO !== 'undefined') return String(KLC_NENDO) === '1'; } catch { /* not defined */ }   // eslint-disable-line no-undef
  try { if (typeof process !== 'undefined' && process.env && process.env.KLC_NENDO !== undefined) return process.env.KLC_NENDO === '1'; } catch { /* no process */ }
  return false;
}

/**
 * Resolve the flags. Arguments default to the page (location.search, location.hostname) and the build define;
 * tests pass them explicitly. Returns { nendoLivery, source } (source: 'url' | 'define' | 'host' | 'default').
 */
export function resolveFlags({ search, hostname, define } = {}) {
  const loc = typeof location !== 'undefined' ? location : null;
  const q = new URLSearchParams(search ?? loc?.search ?? '').get('livery');
  if (q === 'nendo') return { nendoLivery: true, source: 'url' };
  if (q === 'fallback') return { nendoLivery: false, source: 'url' };
  if (define ?? buildDefine()) return { nendoLivery: true, source: 'define' };
  if (isDevHost(hostname ?? loc?.hostname ?? '')) return { nendoLivery: true, source: 'host' };
  return { nendoLivery: false, source: 'default' };
}
