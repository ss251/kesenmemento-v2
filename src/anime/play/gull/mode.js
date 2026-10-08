// [play] 「ウミネコになる」 on the あそぶ hub. The start is a gull perched on
// the rail of ひのでのてらす (the OSM 安波山展望台), wings opening, then one
// coach step for the first flap and one for the first dive.

export const GULL_PLAYED_KEY = 'klc.play.gull.v1';

// harbor/anba.js: the terrace faces the bay, the front rail is local +Z.
export const HINODE = { x: -513.0, z: -692.1 };
export const BAY = { x: 156, z: -33 };
const RAIL_Z = 4.2 / 2 - 0.05;
const RAIL_Y = 0.5 + 1.05;
// The chase sits 2.6 m behind the bird. On the deck that point is inside the
// hill, so the bird perches just past the rail, over the view, and the camera
// stands on the terrace.
const PAST_RAIL = 3.6;

export const WING_OPEN = 0.55;

export function lookoutPerch(heightAt) {
  const x = HINODE.x, z = HINODE.z;
  const face = Math.atan2(BAY.x - x, BAY.z - z);
  const sx = Math.sin(face), cz = Math.cos(face);
  let gy = 0;
  if (typeof heightAt === 'function') {
    const g0 = heightAt(x, z);
    const g1 = heightAt(x + sx * 4, z + cz * 4);
    const hi = Number.isFinite(g1) ? g1 + 0.3 : g0;
    gy = Math.max(Number.isFinite(g0) ? g0 : 0, Number.isFinite(hi) ? hi : 0);
  }
  const out = RAIL_Z + PAST_RAIL;
  return {
    x: x + sx * out,
    y: gy + RAIL_Y,
    z: z + cz * out,
    yaw: face + Math.PI,
    face,
  };
}

/** Hub card. `start` is filled in by the gull mount. */
export function gullModeSpec(start, storage) {
  return {
    id: 'gull',
    order: 30,
    title: { ja: 'ウミネコになる', en: 'Be a gull' },
    hook: { ja: '空から港を見下ろす', en: 'Look down on the harbour' },
    minutes: 3,
    stars: 1,
    players: 1,
    art: '/data/play/art/gull.webp',
    progress: () => null,
    isNew: () => !readGullRecord(storage).played,
    start,
  };
}

export function readGullRecord(storage) {
  try {
    const raw = storage && storage.getItem(GULL_PLAYED_KEY);
    const j = raw ? JSON.parse(raw) : null;
    return {
      played: !!(j && j.played),
      flap: !!(j && j.flap),
      dive: !!(j && j.dive),
    };
  } catch (e) { return { played: false, flap: false, dive: false }; }
}

export function writeGullRecord(storage, rec) {
  try {
    if (!storage) return false;
    storage.setItem(GULL_PLAYED_KEY, JSON.stringify({
      played: !!rec.played, flap: !!rec.flap, dive: !!rec.dive,
    }));
    return true;
  } catch (e) { return false; }
}

/** flap → dive → done. Anything else stays. */
export function nextCoach(phase, event) {
  if (phase === 'done') return 'done';
  if (phase === 'flap' && event === 'flap') return 'dive';
  if (phase === 'dive' && event === 'dive') return 'done';
  return phase || 'flap';
}
