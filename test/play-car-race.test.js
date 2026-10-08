import { describe, expect, test } from 'bun:test';
import { createDriftMeter, stepDrift } from '../src/anime/play/car/drift.js';
import { ghostPose, ghostLine, ghostMsAt, createLapTape } from '../src/anime/play/race/ghost.js';
import { startDelay } from '../src/anime/play/race/together.js';
import { createRaceRun, raceTick, medalFor, project } from '../src/anime/play/race/progress.js';
import { grantUnlock, QUEST_GARAGE_IDS } from '../src/anime/play/garage/catalog.js';
import { minatoCourse } from '../src/anime/play/race/course.js';

function square() {
  const pts = [[0, 0, 0], [10, 0, 10], [10, 10, 20], [0, 10, 30], [0, 0, 40]];
  const n = pts.length;
  return {
    n, lengthM: 40, laps: 3, gates: [0, 10, 20, 30],
    x: Float32Array.from(pts.map((p) => p[0])),
    z: Float32Array.from(pts.map((p) => p[1])),
    s: Float32Array.from(pts.map((p) => p[2])),
  };
}

describe('ghost', () => {
  test('interpolates position and takes the short way around a yaw wrap', () => {
    const buf = new Float32Array([0, 0, 0, Math.PI - 0.2, 10, 0, 1, -Math.PI + 0.2]);
    const out = { x: 0, z: 0, y: 0, yaw: 0 };
    ghostPose(buf, 2, 0.05, out);
    expect(out.x).toBeCloseTo(5, 5);
    expect(out.y).toBeCloseTo(0.5, 5);
    const mid = Math.atan2(Math.sin(out.yaw), Math.cos(out.yaw));
    expect(Math.abs(Math.abs(mid) - Math.PI)).toBeLessThan(0.25);
  });

  test('records at 10 Hz and ignores a tiny step', () => {
    const tape = createLapTape();
    tape.push(0.05, 1, 2, 3, 0);
    expect(tape.count).toBe(0);
    tape.push(0.05, 1, 2, 3, 0);
    expect(tape.count).toBe(1);
    expect(tape.pack()[0]).toBe(1);
  });
});

describe('laps', () => {
  test('a loop that returns to the start counts a lap, a point in the bay does not', () => {
    const course = square();
    const run = createRaceRun();
    run.phase = 'run';
    const dt = 0.05;
    const path = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
    let laps = 0;
    for (let n = 0; n < 220; n++) {
      const p = path[Math.min(path.length - 1, (n / 40) | 0)];
      const ev = raceTick(run, course, p[0], p[1], dt);
      if (ev.event === 'lap' || ev.event === 'finish') laps++;
    }
    expect(laps).toBe(1);
    const off = raceTick(run, course, 500, 500, dt);
    expect(off.event).toBe('off');
    expect(off.s).toBe(run.s);
  });

  test('medals are thresholds, and the harbour line is a closed loop', () => {
    const medals = { gold: 100, silver: 200, bronze: 300 };
    expect(medalFor(100, medals)).toBe('gold');
    expect(medalFor(101, medals)).toBe('silver');
    expect(medalFor(301, medals)).toBe(null);
    const c = minatoCourse();
    expect(c.lengthM).toBeGreaterThan(1200);
    expect(c.lengthM).toBeLessThan(1800);
    expect(c.laps).toBe(2);
    expect(c.medals.silver / c.medals.gold).toBeCloseTo(1.2667, 3);
    expect(c.medals.bronze / c.medals.gold).toBeCloseTo(1.6, 3);
    const start = project(c, c.start[0], c.start[1], { i: 0, dist: 0, s: 0 });
    expect(start.s).toBe(0);
    expect(start.dist).toBeLessThan(1);
    const far = project(c, c.x[200], c.z[200], { i: 0, dist: 0, s: 0 });
    expect(far.s).toBeGreaterThan(c.lengthM * 0.4);
  });
});

describe('garage rewards', () => {
  test('only the published quest ids unlock', () => {
    const bag = {};
    expect(QUEST_GARAGE_IDS).toContain('car.livery.tairyo');
    expect(grantUnlock(bag, 'car.paint.kon')).toBe(true);
    expect(bag['car.paint.kon']).toBe(true);
    expect(grantUnlock(bag, 'car.paint.yamabuki')).toBe(false);
  });
});

describe('drift meter', () => {
  test('a real slide toasts once; a dab does not', () => {
    const m = createDriftMeter();
    let toasted = 0;
    for (let i = 0; i < 40; i++) if (stepDrift(m, true, 0.4, 1 / 60).toast) toasted++;
    expect(toasted).toBe(0);
    expect(stepDrift(m, false, 0, 1 / 60).toast).toBe(true);
    expect(m.combo).toBe(1);
    const dab = createDriftMeter();
    stepDrift(dab, true, 0.2, 0.1);
    expect(stepDrift(dab, false, 0, 0.1).toast).toBe(false);
  });
});

describe('the harbour line', () => {
  test('walking every sample counts two laps and ignores a point off the line', () => {
    const c = minatoCourse();
    const run = createRaceRun();
    run.phase = 'run';
    let events = 0;
    for (let lap = 0; lap < 2; lap++) {
      for (let i = 1; i < c.n; i++) {
        const ev = raceTick(run, c, c.x[i], c.z[i], 0.25);
        if (ev.event === 'lap' || ev.event === 'finish') events++;
      }
      const ev = raceTick(run, c, c.x[0], c.z[0], 0.25);
      if (ev.event === 'lap' || ev.event === 'finish') events++;
    }
    expect(events).toBe(2);
    expect(run.done).toBe(2);
    const off = raceTick(run, c, -200, -200, 0.25);
    expect(off.event).toBe('off');
    let fold = 1e9;
    for (let i = 0; i < c.n; i += 2) {
      for (let j = i + 8; j < c.n; j += 2) {
        const along = Math.min(c.s[j] - c.s[i], c.lengthM - (c.s[j] - c.s[i]));
        if (along < 80) continue;
        const d = Math.hypot(c.x[j] - c.x[i], c.z[j] - c.z[i]);
        if (d < fold) fold = d;
      }
    }
    expect(fold).toBeGreaterThan(20);
  });
});

describe('ghost split', () => {
  test('a shared GO waits until 2.16 s before the instant', () => {
    expect(startDelay(10_000, 7_000)).toBe(840);
    expect(startDelay(10_000, 9_000)).toBe(0);
    expect(startDelay({ x: 1 }, 0)).toBe(0);
  });

  test('the split reads the ghost time at the same distance', () => {
    const course = square();
    const buf = new Float32Array([0, 0, 0, 0, 10, 0, 0, 0, 10, 10, 0, 0]);
    const line = new Float32Array(3);
    ghostLine(buf, 3, project, course, line);
    expect(line[0]).toBe(0);
    expect(ghostMsAt(line, 3, line[1])).toBeCloseTo(100, 5);
  });
});
