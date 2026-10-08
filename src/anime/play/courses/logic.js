// [play:courses] Pure course rules: plane crossings, buoy side, the docking box, the clock, medals.
// No three.js and no DOM. The hot path writes into a caller-owned result and allocates nothing.

/** 1 knot in m/s (the same constant the ship uses). */
export const KN = 0.514444;

/** Ring hole: 8 m inner diameter, tube 0.45 m (PLAY-DESIGN §2). Pass inside the hole. */
export const RING = { inner: 4, tube: 0.45, major: 4.45 };

/** 大漁旗 cloth, from harbor/boats.js FLAG_DESIGNS (red, white, 藍). */
export const TAIRYO = ['#B7282E', '#FBFAF5', '#165E83'];   // 茜, 生成り, 藍 (docs/CRAFT.md): the banner's 大漁旗 and the 紅白 bands

/** Medal stamp colours (PLAY-DESIGN §2). 金 山吹色, 銀, 銅, each with a 紺 rim in the card. */
export const MEDAL_HEX = { gold: '#F8B500', silver: '#C9CDD6', bronze: '#C8763F', rim: '#223A70' };

/**
 * How a live course shows its gates (PLAY-DESIGN §2).
 * The next gate is solid, the one after is 60 %, everything else is 25 %.
 * `activeIndex < 0` means nothing is running: every gate is solid.
 */
export const GATE_FADE = { next: 1, soon: 0.6, rest: 0.25 };

export function gateOpacity(index, activeIndex) {
  if (!(activeIndex >= 0)) return GATE_FADE.next;
  if (index === activeIndex) return GATE_FADE.next;
  if (index === activeIndex + 1) return GATE_FADE.soon;
  return GATE_FADE.rest;
}

/** The split stays up for 1.2 s. The pass itself is a 250 ms scale-and-fade. */
export const SPLIT_HOLD_MS = 1200;
export const PASS_MS = 0.25;

/** 「もう一回」 fades the world for 1 s. The countdown starts in the same turn, inside the 1.5 s budget. */
export const RETRY_FADE_S = 1;
export const RETRY_BUDGET_MS = 1500;

/**
 * A tiny listener list. `courses.on('finish', fn)` receives `{ id, ms, medal }`.
 * No allocation on emit beyond the call itself.
 */
export function createBus() {
  const lists = new Map();
  return {
    on(ev, fn) {
      if (typeof fn !== 'function') return () => {};
      let a = lists.get(ev);
      if (!a) { a = []; lists.set(ev, a); }
      a.push(fn);
      return () => this.off(ev, fn);
    },
    off(ev, fn) {
      const a = lists.get(ev);
      if (!a) return;
      const i = a.indexOf(fn);
      if (i >= 0) a.splice(i, 1);
    },
    emit(ev, payload) {
      const a = lists.get(ev);
      if (!a) return;
      for (let i = 0; i < a.length; i++) {
        try { a[i](payload); } catch (e) { /* one listener must not sink the finish */ }
      }
    },
  };
}

/** Docking: real speed under 1 kt, heading within ±20°, up to 10 s off for a centred stop. */
export const DOCK = { maxKt: 1, headingDeg: 20, bonusMs: 10000, holdS: 0.35 };

const RANK = { gold: 3, silver: 2, bronze: 1 };

/** Heading error in radians, wrapped to (−π, π]. */
export function wrapAng(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** Signed distance to the gate plane. `dir` points through the gate, the way you travel.
 *  Negative means you have not reached the plane yet. */
export function planeDist(p, gate) {
  return (p.x - gate.x) * gate.nx + (p.y - gate.y) * gate.ny + (p.z - gate.z) * gate.nz;
}

/**
 * Forward crossing of prev → next through a gate.
 * Writes `out` and returns it, or null when the segment does not cross forward.
 * `out.ok` is the pass. A near miss crosses and sets ok false.
 * Rings and flags: ok when the hit is within `r` of the centre.
 * Buoys: ok when the hull centre is on `side` of the buoy, between latMin and latMax.
 *   side +1 is port of the travel direction (left), −1 is starboard.
 */
export function crossGate(prev, next, gate, out) {
  const d0 = planeDist(prev, gate);
  const d1 = planeDist(next, gate);
  if (!(d0 < 0 && d1 >= 0)) return null;
  const denom = d0 - d1;
  const t = denom !== 0 ? d0 / denom : 0;
  const x = prev.x + (next.x - prev.x) * t;
  const y = prev.y + (next.y - prev.y) * t;
  const z = prev.z + (next.z - prev.z) * t;
  const dx = x - gate.x, dy = y - gate.y, dz = z - gate.z;
  out.t = t; out.x = x; out.y = y; out.z = z;
  out.dist = Math.hypot(dx, dy, dz);
  // port of a horizontal travel direction (nx, nz) is (nz, −nx)
  const lateral = dx * gate.nz - dz * gate.nx;
  out.lateral = lateral;
  if (gate.kind === 'buoy') {
    const s = gate.side || 1;
    const lat = lateral * s;
    out.ok = lat >= (gate.latMin ?? 3) && lat <= (gate.latMax ?? 55);
  } else {
    out.ok = out.dist <= (gate.r ?? RING.inner);
  }
  return out;
}

/**
 * Docking box. `pose` is { x, z, yaw, u, v } (u surge, v sway, both real m/s, not time-compressed).
 * The box yaw is the required bow heading (ship convention: bow along (sin yaw, cos yaw)).
 * Returns fields on `out`: inside, speed, headingErr (rad), centre (m), hold (s, echoed), ok.
 * ok requires the conditions for DOCK.holdS continuous seconds (a real stop, not a one-tick dip).
 */
export function dockCheck(pose, box, holdS, out) {
  const sy = Math.sin(box.yaw), cy = Math.cos(box.yaw);
  const dx = pose.x - box.x, dz = pose.z - box.z;
  const lz = dx * sy + dz * cy;             // along the bow
  const lx = dx * -cy + dz * sy;            // to starboard
  out.inside = Math.abs(lx) <= box.halfW && Math.abs(lz) <= box.halfL;
  out.speed = Math.hypot(pose.u || 0, pose.v || 0);
  out.headingErr = Math.abs(wrapAng((pose.yaw ?? 0) - box.yaw));
  out.centre = Math.hypot(lx, lz);
  out.hold = holdS;
  const aligned = out.headingErr <= DOCK.headingDeg * Math.PI / 180;
  const slow = out.speed < DOCK.maxKt * KN;
  out.ok = out.inside && aligned && slow && holdS >= DOCK.holdS;
  return out;
}

/** Milliseconds taken off for a centred stop. 10 s at the centre, 0 at the box corner, 0 outside. */
export function dockBonusMs(centre, box) {
  const limit = Math.hypot(box.halfW, box.halfL);
  if (!(centre >= 0) || centre >= limit) return 0;
  const k = 1 - centre / limit;
  return Math.round(DOCK.bonusMs * k * k);
}

/** 'gold' | 'silver' | 'bronze' | null. Thresholds are inclusive milliseconds. */
export function medalOf(ms, medal) {
  if (ms == null || !medal || !Number.isFinite(ms)) return null;
  if (ms <= medal.gold) return 'gold';
  if (ms <= medal.silver) return 'silver';
  if (ms <= medal.bronze) return 'bronze';
  return null;
}

/** Keep the better medal. Null loses to anything earned. */
export function betterMedal(a, b) {
  return (RANK[b] || 0) > (RANK[a] || 0) ? b : (a || null);
}

/**
 * 金 = clean run × 1.05. 銀 and 銅 keep the course's design ratios (銀/金, 銅/金).
 * ratios come from the start table in PLAY-DESIGN §2.
 */
export function medalsFromBest(bestMs, ratios) {
  const gold = Math.round(bestMs * 1.05);
  return {
    gold,
    silver: Math.round(gold * ratios.silver),
    bronze: Math.round(gold * ratios.bronze),
  };
}

/** Split against a stored best, in milliseconds. Null when there is no best for that gate. */
export function splitDelta(splitMs, bestMs) {
  if (bestMs == null || !Number.isFinite(bestMs)) return null;
  return splitMs - bestMs;
}

const TIME = ['0', ':', '0', '0', '.', '0', '0'];
/** Write m:ss.cs into `buf` (7 slots) and return it. Slot 0 holds the whole minutes. No join. */
export function writeTime(ms, buf = TIME) {
  let cs = Math.max(0, Math.round(ms / 10));
  let s = (cs / 100) | 0;
  cs = cs % 100;
  const m = (s / 60) | 0;
  s = s % 60;
  buf[0] = String(m);
  buf[2] = String((s / 10) | 0);
  buf[3] = String(s % 10);
  buf[5] = String((cs / 10) | 0);
  buf[6] = String(cs % 10);
  return buf;
}

/** `0:42.37`. Allocates one string; the simulation itself uses writeTime. */
export function formatTime(ms) {
  const b = writeTime(ms);
  return b[0] + b[1] + b[2] + b[3] + b[4] + b[5] + b[6];
}

/** A fresh live run. Gates are the scoring gates only (no start banner). */
export function createRun() {
  return {
    phase: 'live',
    index: 0,
    elapsed: 0,
    splits: [],
    dockHold: 0,
    bonusMs: 0,
    finished: false,
  };
}

/**
 * One simulation step of a live run.
 * `pose` / `prev` are { x, y, z, yaw?, u?, v? }. `dt` is seconds.
 * Returns `out` with event 'none' | 'pass' | 'near' | 'dock' | 'finish',
 * plus index, delta (ms, or null), elapsed.
 * Passes at most one gate per call. A near miss does not advance.
 */
export function stepRun(run, course, prev, pose, dt, bestSplits, out) {
  out.event = 'none';
  out.delta = null;
  out.index = run.index;
  out.elapsed = run.elapsed;
  out.finished = run.finished;
  if (run.phase !== 'live' || run.finished) return out;
  run.elapsed += dt * 1000;
  out.elapsed = run.elapsed;
  const gates = course.gates;
  const g = gates[run.index];
  if (!g) { run.finished = true; out.finished = true; out.event = 'finish'; return out; }
  if (g.kind === 'dock') {
    dockCheck(pose, g, run.dockHold, out);
    const aligned = out.headingErr <= DOCK.headingDeg * Math.PI / 180;
    const slow = out.speed < DOCK.maxKt * KN;
    run.dockHold = out.inside && aligned && slow ? run.dockHold + dt : 0;
    out.hold = run.dockHold;
    if (run.dockHold >= DOCK.holdS) {
      run.bonusMs = dockBonusMs(out.centre, g);
      run.splits.push(run.elapsed);
      run.index += 1;
      run.finished = true;
      out.event = 'finish';
      out.finished = true;
      out.index = run.index;
      out.delta = splitDelta(run.elapsed, bestSplits ? bestSplits[run.splits.length - 1] : null);
      out.bonusMs = run.bonusMs;
    }
    return out;
  }
  const hit = crossGate(prev, pose, g, out);
  if (!hit) return out;
  if (!hit.ok) { out.event = 'near'; return out; }
  run.splits.push(run.elapsed);
  const at = run.splits.length - 1;
  out.delta = splitDelta(run.elapsed, bestSplits ? bestSplits[at] : null);
  run.index += 1;
  out.index = run.index;
  out.event = 'pass';
  if (run.index >= gates.length) {
    run.finished = true;
    out.finished = true;
    out.event = 'finish';
  } else if (gates[run.index].kind === 'dock') {
    out.event = 'pass';
  }
  return out;
}

/**
 * Fold a finished (or abandoned) run into the stored row.
 * Pure: returns the next row, the score, and whether this run is the best.
 * `prev` is { best, medal, runs, splits } or null.
 */
export function recordResult(prev, course, run) {
  const score = scoreRun(run, course);
  const row = {
    best: prev && Number.isFinite(prev.best) ? prev.best : null,
    medal: prev ? prev.medal || null : null,
    runs: (prev && prev.runs) || 0,
    splits: prev && prev.splits ? prev.splits : null,
  };
  row.runs += 1;
  let isBest = false;
  if (run.finished && score.effectiveMs != null && (row.best == null || score.effectiveMs < row.best)) {
    row.best = score.effectiveMs;
    row.splits = run.splits.slice();
    isBest = true;
  }
  if (run.finished) row.medal = betterMedal(row.medal, score.medal);
  return { row, score, isBest };
}

/** Medal for a finished run. Ship courses subtract the docking bonus before the thresholds. */
export function scoreRun(run, course) {
  if (!run.finished) return { medal: null, timeMs: run.elapsed, bonusMs: 0, effectiveMs: run.elapsed };
  const bonusMs = run.bonusMs || 0;
  const effectiveMs = Math.max(0, run.elapsed - bonusMs);
  return { medal: medalOf(effectiveMs, course.medal), timeMs: run.elapsed, bonusMs, effectiveMs };
}
