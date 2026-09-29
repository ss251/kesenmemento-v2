// [v3:life] UI strings: every visible string lives in data/i18n.json ({ ja: {...}, en: {...} }), bundled at build time.
import DATA from '../../../data/i18n.json';

export const LANGS = ['ja', 'en'];
export function pickLang() {
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (LANGS.includes(q)) return q;
    const s = localStorage.getItem('klc.lang'); if (LANGS.includes(s)) return s;
  } catch (e) { /* private mode */ }
  return 'ja';
}
export function createI18n(lang = pickLang()) {
  const i = {
    lang,
    t(key, vars) {
      let s = DATA[i.lang]?.[key] ?? DATA.ja[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll('{' + k + '}', String(v));
      return s;
    },
    set(l) { if (LANGS.includes(l)) { i.lang = l; try { localStorage.setItem('klc.lang', l); } catch (e) { /* ok */ } } },
  };
  return i;
}
export { DATA as STRINGS };
