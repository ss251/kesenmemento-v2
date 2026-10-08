// The walker draws only while he is the body. The dive, the gull, a boat, the car,
// the race and the ship each put someone else at player.pos (the fish copies its
// pose there every frame). chaseOwns only knows the drone flag (player.fly): a walk
// into 「もぐる」 is still third person, so the walker was placed on the fish and the
// walk cycle kept playing. These flags hide the walker and its shadow until
// that body lets go. Leaving a walk puts third person back as it was.

import { chaseOwns } from './camera.js';

const RACE = new Set(['count', 'run']);

/** True when some other body is the player. */
export function otherBody(occupy) {
  if (!occupy) return false;
  return !!(occupy.swim || occupy.gull || occupy.drive || occupy.sail || occupy.race || occupy.voyage);
}

/**
 * The walker (a custom character, or the original figure) is on screen only in third person
 * on foot, and only while no other body owns the player.
 * `occupy` is the snapshot from bodyOccupy.
 */
export function walkerShown(player, occupy) {
  if (!player || player.gull) return false;
  if (otherBody(occupy)) return false;
  return chaseOwns(player);
}

/**
 * Who else is the player this frame. Pass `out` to reuse it (the draw loop does).
 * A fresh object is returned otherwise; the next call with the same `out` overwrites it.
 */
export function bodyOccupy(ctx, out) {
  const o = out || { swim: false, gull: false, drive: false, sail: false, race: false, voyage: false };
  const s = ctx?.services || {};
  const phase = s.playCar?.race?.phase;
  let swim = !!s.swim?.active;
  if (!swim && typeof window !== 'undefined' && window.__swim?.active) swim = true;
  if (!swim && typeof document !== 'undefined' && document.body?.classList?.contains('klc-swim')) swim = true;
  o.swim = swim;
  o.gull = !!s.play?.gull?.active;
  o.drive = !!(s.explore?.drive?.active || s.drive?.active);
  o.sail = !!(s.sail?.active || s.explore?.sail?.active);
  o.race = !!(phase && RACE.has(phase));
  o.voyage = !!s.ship?.voyage?.active;
  return o;
}
