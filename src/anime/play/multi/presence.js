// How a friend reads on screen: a name that fades, a stamp that stays up 2.5s,
// and a head-count. No allocations; the draw loop only calls these.

export const STAMP_MS = 2500;
export const FADE_NEAR = 18;
export const FADE_FAR = 72;

/** 1 up close, 0 at FADE_FAR, 0 when a wall sits between the camera and the tag. */
export function tagOpacity(dist, blocked) {
  if (blocked) return 0;
  if (!(dist >= 0)) return 1;
  if (dist <= FADE_NEAR) return 1;
  if (dist >= FADE_FAR) return 0;
  return 1 - (dist - FADE_NEAR) / (FADE_FAR - FADE_NEAR);
}

/** Steps of 0.05, so a moving friend does not write a new style every frame. */
export function quantizeOpacity(v) {
  if (!(v > 0.02)) return 0;
  if (v >= 0.98) return 1;
  return Math.round(v * 20) / 20;
}

export function offScreen(ndcX, ndcY, behind) {
  if (behind) return true;
  return ndcX < -1 || ndcX > 1 || ndcY < -1 || ndcY > 1;
}

/**
 * Three samples from the camera toward the tag. Terrain above the sample, or a
 * solid, hides the tag. The caller passes the same functions the world uses.
 */
export function blockedAlong(cx, cy, cz, tx, ty, tz, solidAt, heightAt) {
  const dx = tx - cx;
  const dy = ty - cy;
  const dz = tz - cz;
  const len = Math.hypot(dx, dy, dz) || 1;
  // Past the car you are sitting in, and tall enough to be a building.
  // A pole, a kerb, or your own van must not hide a friend you can see.
  for (let i = 0; i < 3; i++) {
    const u = 0.62 + i * 0.12;
    const x = cx + dx * u;
    const y = cy + dy * u;
    const z = cz + dz * u;
    if (typeof heightAt === 'function') {
      const h = heightAt(x, z);
      if (h > y + 1.6) return true;
    }
    if (len * u > 8 && typeof solidAt === 'function' && solidAt(x, z, y)) return true;
  }
  return false;
}

/** performance.now() when a lane's own countdown should begin, so GO lands on `serverGo`. */
export function armAt(serverGo, wallNow, perfNow, lead) {
  return perfNow + (serverGo - wallNow) - lead;
}

/**
 * The clock each lane asked for.
 * `car` is the 港町 course: `at` is performance.now() when its countdown begins.
 * `race` is the night race: `at` is the server GO in epoch ms. That lane subtracts its own lead.
 */
export function togetherStart(kind, serverGo, wallNow, perfNow, kitLead) {
  if (kind === 'car') return { id: 'minato', at: armAt(serverGo, wallNow, perfNow, kitLead) };
  if (kind === 'race') return { at: serverGo };
  return null;
}
