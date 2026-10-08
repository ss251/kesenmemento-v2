// [play:missions] play.npc.* and play.quest.* from data/play-i18n.json. The kit lane owns the other play.* keys.
import PACK from '../../../../data/play-i18n.json';

export { PACK };

/** Resolve a key. Missing keys come back as the key, so a gap shows up on screen. */
export function t(lang, key, vars) {
  const table = (lang && PACK[lang]) || PACK.ja;
  let s = table[key] ?? PACK.ja[key] ?? key;
  if (vars) {
    for (const k in vars) s = s.split('{' + k + '}').join(String(vars[k]));
  }
  return s;
}

/** Same order as the HUD: ?lang=, then klc.lang, then Japanese. */
export function langOf(win = globalThis) {
  try {
    const q = new URLSearchParams(win.location?.search || '').get('lang');
    if (q === 'ja' || q === 'en') return q;
    const s = win.localStorage?.getItem('klc.lang');
    if (s === 'ja' || s === 'en') return s;
  } catch { /* private mode */ }
  return 'ja';
}
