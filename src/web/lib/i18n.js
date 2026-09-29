// All UI strings go through t(key). JA is the default language (BUILD-SPEC §7).
let dict = { ja: {}, en: {} }, lang = "ja";
const listeners = new Set();
export function setDict(d) { dict = d; }
export function getLang() { return lang; }
export function setLang(l) { lang = l === "en" ? "en" : "ja"; document.documentElement.lang = lang; listeners.forEach((f) => f(lang)); }
export function onLang(f) { listeners.add(f); }
export function t(key) { return dict[lang]?.[key] ?? dict.ja?.[key] ?? key; }
/** Pick the language field from a bilingual record ({ja, en}). */
export function pick(o) { return o == null ? "" : typeof o === "string" ? o : (o[lang] ?? o.ja ?? ""); }
/** Fill every [data-i18n] element under root. */
export function applyI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll("[data-i18n-title]").forEach((el) => { el.title = t(el.dataset.i18nTitle); el.setAttribute("aria-label", el.title); });
}
