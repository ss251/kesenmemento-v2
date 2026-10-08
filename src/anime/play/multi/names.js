// Fish plus a colour. The server picks both. Anything else on the wire is just 「なかま」.
// ホヤ is not a fish and is not a colour here.

import { FISH, COLORS } from '../../../../server/multi/wire.js';

const HEX = Object.create(null);
for (let i = 0; i < COLORS.length; i++) HEX[COLORS[i].id] = COLORS[i].hex;

export function fishOk(id) { return FISH.indexOf(id) >= 0; }
export function colorOk(id) { return Object.prototype.hasOwnProperty.call(HEX, id); }
export function colorHex(id) { return HEX[id] || '#165E83'; }

/** `{color}の{fish}` / `{color} {fish}`. `t` is the play i18n lookup. */
export function whoLabel(t, fish, color) {
  if (!fishOk(fish) || !colorOk(color)) return t('play.multi.friend');
  return t('play.multi.who', {
    color: t('play.multi.color.' + color),
    fish: t('play.multi.fish.' + fish),
  });
}
