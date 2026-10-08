// Drift score: slip angle × speed × time, then a combo if the next slide starts before the chain goes cold.

export function createDriftMeter() {
  return { score: 0, combo: 0, chain: 0, idle: 0, live: false, best: 0 };
}

const stepOut = { toast: false, combo: 0, score: 0, live: false };

/**
 * One simulation step. `points` is this step's angle × speed × dt.
 * A toast fires once, when a slide of at least 0.45 s that scored at least 2 comes to an end.
 * Score is slip (rad) × speed (m/s) × time. 2 is a committed handbrake slide; a dab stays under it.
 * Writes into `out` (reused by default: do not keep it).
 */
export function stepDrift(m, skid, points, dt, out = stepOut) {
  let toast = false;
  let popped = 0;
  if (skid && points > 0) {
    m.score += points;
    m.chain += dt;
    m.idle = 0;
    m.live = true;
    if (m.score > m.best) m.best = m.score;
  } else if (m.live) {
    m.live = false;
    toast = m.chain >= 0.45 && m.score >= 2;
    popped = m.score;
    if (toast) m.combo += 1;
    else m.combo = 0;
    m.score = 0;
    m.chain = 0;
    m.idle = 0;
  } else {
    m.idle += dt;
    if (m.idle > 4) m.combo = 0;
  }
  out.toast = toast;
  out.combo = m.combo;
  out.score = m.live ? m.score : popped;
  out.live = m.live;
  return out;
}
