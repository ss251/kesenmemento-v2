// [play] Avatar prefs live in their own key. The kit store's migrate() drops
// unknown meta fields, so these must not go in klc.play.v1.

export const PREF_KEY = 'klc.play.avatar.v1';
export const LOOKS = ['navy', 'kinari', 'asagi'];

export function defaultPrefs() { return { look: 'navy', model: 'hoya' }; }

export function readPrefs(storage) {
  const d = defaultPrefs();
  try {
    const raw = storage && storage.getItem(PREF_KEY);
    if (!raw) return d;
    const j = JSON.parse(raw);
    return {
      look: LOOKS.includes(j.look) ? j.look : d.look,
      model: j.model === 'original' ? 'original' : 'hoya',
    };
  } catch (e) { return d; }
}

export function writePrefs(storage, prefs) {
  try {
    if (!storage) return false;
    storage.setItem(PREF_KEY, JSON.stringify({
      look: LOOKS.includes(prefs.look) ? prefs.look : 'navy',
      model: prefs.model === 'original' ? 'original' : 'hoya',
    }));
    return true;
  } catch (e) { return false; }
}
