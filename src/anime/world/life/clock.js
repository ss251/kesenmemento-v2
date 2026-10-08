// Live JST clock. Pure: the page samples the wall clock and eases the town toward it.
// A flight or a fishing trip holds the hour so the sky never steps under the camera.

const JST_MS = 9 * 3600e3;
export const wrap24 = (h) => ((h % 24) + 24) % 24;

/** Wall-clock instant -> { hours (0–24), ymd, hhmm } in Japan Standard Time. `now` is epoch ms. */
export function jstNow(now = Date.now()) {
  const j = new Date(now + JST_MS);
  const hh = j.getUTCHours(), mm = j.getUTCMinutes(), ss = j.getUTCSeconds(), ms = j.getUTCMilliseconds();
  return {
    hours: hh + mm / 60 + ss / 3600 + ms / 3.6e6,
    ymd: j.toISOString().slice(0, 10),
    hhmm: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
  };
}

/** Signed hours to walk from `from` to `to`, the short way round the clock (−12, 12]. */
export function clockDelta(from, to) {
  let d = wrap24(to) - wrap24(from);
  if (d > 12) d -= 24;
  if (d < -12) d += 24;
  return d;
}

/** Move `hours` toward `target`. One step is an exponential ease, capped per second so a frame never snaps. */
export function easeHours(hours, target, dt, { tau = 8, maxPerSec = 0.25 } = {}) {
  const d = clockDelta(hours, target);
  if (Math.abs(d) < 1e-8) return wrap24(target);
  const k = 1 - Math.exp(-Math.max(0, dt) / tau);
  let step = d * k;
  const cap = maxPerSec * Math.max(0, dt);
  if (cap > 0 && Math.abs(step) > cap) step = Math.sign(d) * cap;
  return wrap24(hours + step);
}

/**
 * One live-clock step.
 * held: leave the hour (a flight or a voyage owns it).
 * within 2 minutes: ease, never a visible jump.
 * further: the caller plays the 3.2 s transition (`mode: 'transition'`).
 */
export function stepLiveClock(hours, target, dt, { held = false, tau = 6 } = {}) {
  if (held) return { hours: wrap24(hours), mode: 'held', delta: 0 };
  const delta = clockDelta(hours, target);
  const ad = Math.abs(delta);
  if (ad < 1 / 7200) return { hours: wrap24(target), mode: 'sync', delta: 0 };
  if (ad <= 2 / 60) return { hours: easeHours(hours, target, dt, { tau, maxPerSec: 0.2 }), mode: 'ease', delta };
  return { hours: wrap24(hours), mode: 'transition', delta };
}
