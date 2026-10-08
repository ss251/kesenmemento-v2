// Play-lane strings. Each lane owns a prefix in data/play-i18n.json. Japanese is the fallback.
import TEXT from '../../../data/play-i18n.json';

export function playLang(ctx) {
  const l = ctx?.services?.life?.hud?.i18n?.lang || (typeof document !== 'undefined' ? document.documentElement.lang : '') || 'ja';
  return l === 'en' ? 'en' : 'ja';
}

export function t(key, lang = 'ja') {
  const pack = TEXT[lang] || TEXT.ja;
  return pack[key] ?? TEXT.ja[key] ?? key;
}

/** m:ss.ss with half-width digits. */
export function formatMs(ms) {
  const n = Math.max(0, ms);
  const m = Math.floor(n / 60000);
  const s = Math.floor(n / 1000) % 60;
  const cs = Math.floor(n / 10) % 100;
  return m + ':' + String(s).padStart(2, '0') + '.' + String(cs).padStart(2, '0');
}
