// [play] Avatar prefs live in their own key. The kit store's migrate() drops
// unknown meta fields, so these must not go in klc.play.v1.

import { DEFAULT_ID } from './characters.js';

export const PREF_KEY = 'klc.play.avatar.v1';
export const LOOKS = ['navy', 'kinari', 'asagi'];
const MODELS = ['meme', 'original'];

export function defaultPrefs() { return { look: 'navy', model: DEFAULT_ID }; }

function modelOf(id, fallback) {
  return MODELS.includes(id) ? id : fallback;
}

export function readPrefs(storage) {
  const d = defaultPrefs();
  try {
    const raw = storage && storage.getItem(PREF_KEY);
    if (!raw) return d;
    const j = JSON.parse(raw);
    return {
      look: LOOKS.includes(j.look) ? j.look : d.look,
      model: modelOf(j.model, d.model),
    };
  } catch (e) { return d; }
}

export function writePrefs(storage, prefs) {
  try {
    if (!storage) return false;
    storage.setItem(PREF_KEY, JSON.stringify({
      look: LOOKS.includes(prefs.look) ? prefs.look : 'navy',
      model: modelOf(prefs.model, DEFAULT_ID),
    }));
    return true;
  } catch (e) { return false; }
}
