// 「みんなで」 on the あそぶ hub. PLAY-ENTRY §5.
// The kit owns registerMode. Until that export exists, this is a no-op.
// The coach flag stays on this device. It is not a name and it is never sent.

import STR from '../../../../data/play-i18n.json';
import { ART } from './card-art.js';

export const COACH_KEY = 'klc.multi.coach';

function deviceStorage() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

export function modeSpec(start) {
  return {
    id: 'multi',
    order: 70,
    title: { ja: STR.ja['play.multi.title'], en: STR.en['play.multi.title'] },
    hook: { ja: STR.ja['play.multi.hook'], en: STR.en['play.multi.hook'] },
    minutes: 5,
    stars: 1,
    players: 'many',
    art: ART,
    progress: () => null,
    isNew: () => !coachSeen(deviceStorage()),
    start: typeof start === 'function' ? start : async () => {},
  };
}

/** @returns {boolean} true when the kit accepted the mode */
export function registerMode(kit, spec) {
  const fn = kit && kit.registerMode;
  if (typeof fn !== 'function') return false;
  try { fn(spec); } catch { return false; }
  return true;
}

export function coachSeen(storage) {
  const box = storage === undefined ? deviceStorage() : storage;
  try { return box?.getItem(COACH_KEY) === '1'; } catch { return false; }
}

export function markCoach(storage) {
  const box = storage === undefined ? deviceStorage() : storage;
  try { box?.setItem(COACH_KEY, '1'); } catch { /* private mode: this visit still dismisses it */ }
}
