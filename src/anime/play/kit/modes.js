// [play] The mode list the あそぶ hub shows. A lane registers itself; a mode
// that never registers has no card. Additions to KIT-API.md.

const modes = new Map();
const listeners = new Set();

export function registerMode(spec) {
  if (!spec || typeof spec.id !== 'string' || !spec.id) return false;
  if (!spec.title) return false;
  modes.set(spec.id, spec);
  for (const fn of listeners) {
    try { fn(spec); } catch (e) { /* one listener stays off the list */ }
  }
  return true;
}

export function listModes() {
  return [...modes.values()].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || String(a.id).localeCompare(String(b.id)));
}

export function onModes(fn) {
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function _resetModes() {
  modes.clear();
  listeners.clear();
}

/** Modes the graph knows. walk and fly are free. The rest are special. */
export const GRAPH_MODES = ['walk', 'fly', 'drive', 'sail', 'katsuo', 'dive', 'gull', 'race', 'ippon', 'photo'];

const CHIP_HIDDEN = new Set(['dive', 'gull', 'drive', 'sail', 'katsuo', 'race', 'ippon']);

/** Inside a special mode the pad hides 歩く / 飛ぶ / 乗る. That mode's own exit stays. */
export function padChipsHidden(mode) {
  return CHIP_HIDDEN.has(mode);
}

/**
 * The 視点 (V) cycle: 3rd-person walk → 1st-person walk → the drone (fly) → … A person swap inside walk is not a mode
 * change. canSwitch refuses walk → walk, and asking it left V stuck behind the walker: no first person, no way back to
 * the drone (qa3, 2026-10-08). Only a real change (walk ↔ fly, or out of a special mode) asks `allow`.
 */
export function viewCycleAllowed(from, next, allow) {
  const to = next === 'fly' ? 'fly' : 'walk';
  if (from === to) return true;
  return typeof allow !== 'function' || !!allow(to, { via: 'key' });
}

/**
 * May `from` become `to`?
 * `ctx.via` is hub, mission, npc, pad, key or chip.
 * `ctx.atPlace` is a vehicle's own spot. `ctx.atShore` is the land side of the water.
 * `ctx.origin` is the mode a dive, a race, a game or a photo must return to.
 * A blocked switch is just false. Nothing here shows a toast.
 */
export function canSwitch(from, to, ctx = {}) {
  if (!from || !to || from === to) return false;
  const via = ctx.via || '';
  const origin = ctx.origin || 'walk';
  const hub = via === 'hub' || via === 'mission';
  const placed = !!(ctx.atPlace || hub);

  if (from === 'walk' && to === 'fly') return true;
  if (from === 'fly' && to === 'walk') return true;
  if ((from === 'walk' || from === 'fly') && to === 'photo') return true;

  if (from === 'walk') {
    if (to === 'drive' || to === 'sail' || to === 'katsuo') return placed;
    if (to === 'dive') return !!(ctx.atShore || hub);
    if (to === 'gull') return hub;
    if (to === 'race' || to === 'ippon') return hub || via === 'npc';
    return false;
  }
  if (from === 'fly') return false;

  if (from === 'drive') return to === 'walk' || to === 'photo';
  if (from === 'sail') return to === 'walk' || to === 'photo' || to === 'dive';
  if (from === 'katsuo') return to === 'walk' || to === 'dive';
  if (from === 'gull') return to === 'walk' || to === 'fly';
  if (from === 'dive') {
    if (origin === 'sail' || origin === 'katsuo') return to === origin;
    return to === 'walk';
  }
  if (from === 'race' || from === 'ippon') return to === origin;
  if (from === 'photo') {
    return to === origin && (origin === 'walk' || origin === 'fly' || origin === 'drive' || origin === 'sail');
  }
  return false;
}

/** The あそぶ card id, as a graph mode. A charm hunt and the quest book are not switches. */
export function hubTarget(id) {
  if (id === 'gull') return 'gull';
  if (id === 'underwater') return 'dive';
  if (id === 'ippon') return 'ippon';
  if (id === 'race') return 'race';
  if (id === 'anba') return 'fly';
  if (id === 'minato') return 'drive';
  if (id === 'harbour') return 'sail';
  return null;
}

/** The live mode. A vehicle is checked before `player.fly`, because the car and the boats set that flag. */
export function graphFrom(ctx) {
  const s = ctx?.services || {};
  const sail = s.sail || s.explore?.sail || null;
  const drive = s.explore?.drive || s.drive || null;
  const race = s.playCar?.race;
  const gull = s.play?.gull;
  const swim = s.swim;
  if (race && race.phase && race.phase !== 'idle') return 'race';
  if (ctx?.shooting) return 'photo';
  if (swim?.active) return 'dive';
  if (gull?.active || ctx?.playerObj?.gull) return 'gull';
  if (sail?.active && (sail.boatId === 'katsuo' || sail.boatKind === 'katsuo')) return 'katsuo';
  if (drive?.active) return 'drive';
  if (sail?.active) return 'sail';
  if (ctx?.playerObj?.fly) return 'fly';
  return 'walk';
}
