// [play:courses] Gate crossings, buoy side, the docking box, the clock and the medals.
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import COURSES from '../data/play/courses.json';
import { migrate } from '../src/anime/play/kit/store.js';
import {
  RING, KN, DOCK, TAIRYO, MEDAL_HEX,
  planeDist, crossGate, dockCheck, dockBonusMs, medalOf, betterMedal, medalsFromBest,
  gateOpacity, createBus, SPLIT_HOLD_MS, PASS_MS, RETRY_FADE_S, RETRY_BUDGET_MS,
  splitDelta, formatTime, writeTime, createRun, stepRun, scoreRun, recordResult, wrapAng,
} from '../src/anime/play/courses/logic.js';

const out = () => ({ t: 0, x: 0, y: 0, z: 0, dist: 0, lateral: 0, ok: false, event: '', delta: null, index: 0, elapsed: 0, finished: false, inside: false, speed: 0, headingErr: 0, centre: 0, hold: 0, bonusMs: 0 });

function ring(x, z, nx, nz, r = RING.inner) {
  const l = Math.hypot(nx, nz) || 1;
  return { kind: 'ring', x, y: 30, z, nx: nx / l, ny: 0, nz: nz / l, r };
}

describe('ring plane', () => {
  const g = ring(0, 0, 0, 1); // travel +Z
  test('a crossing inside the hole is a pass', () => {
    const hit = crossGate({ x: 1, y: 30, z: -2 }, { x: 1, y: 31, z: 2 }, g, out());
    expect(hit).not.toBeNull();
    expect(hit.ok).toBe(true);
    expect(hit.dist).toBeLessThan(RING.inner);
    expect(hit.z).toBeCloseTo(0, 5);
  });
  test('a near miss crosses the plane and does not count', () => {
    const hit = crossGate({ x: 6, y: 30, z: -1 }, { x: 6, y: 30, z: 1 }, g, out());
    expect(hit).not.toBeNull();
    expect(hit.ok).toBe(false);
    expect(hit.dist).toBeGreaterThan(RING.inner);
  });
  test('the same line short of the plane is not a crossing', () => {
    expect(crossGate({ x: 0, y: 30, z: -5 }, { x: 0, y: 30, z: -0.2 }, g, out())).toBeNull();
  });
  test('backing through the ring does not count', () => {
    expect(crossGate({ x: 0, y: 30, z: 2 }, { x: 0, y: 30, z: -2 }, g, out())).toBeNull();
  });
  test('the hole is the 8 m inner diameter', () => {
    expect(RING.inner * 2).toBe(8);
    expect(RING.major - RING.tube).toBeCloseTo(RING.inner, 5);
    const edge = crossGate({ x: 4, y: 30, z: -1 }, { x: 4, y: 30, z: 1 }, g, out());
    expect(edge.ok).toBe(true);
    const past = crossGate({ x: 4.05, y: 30, z: -1 }, { x: 4.05, y: 30, z: 1 }, g, out());
    expect(past.ok).toBe(false);
  });
  test('planeDist is negative before the gate', () => {
    expect(planeDist({ x: 0, y: 30, z: -3 }, g)).toBeLessThan(0);
    expect(planeDist({ x: 0, y: 30, z: 3 }, g)).toBeGreaterThan(0);
  });
});

describe('checkpoint order', () => {
  const course = {
    medal: { gold: 55000, silver: 70000, bronze: 90000 },
    gates: [ring(0, 0, 0, 1), ring(0, 40, 0, 1), ring(0, 80, 0, 1)],
  };
  test('only the next gate counts, and a later one does not skip ahead', () => {
    const run = createRun();
    const o = out();
    stepRun(run, course, { x: 0, y: 30, z: 30 }, { x: 0, y: 30, z: 50 }, 0.1, null, o);
    expect(o.event).toBe('none');
    expect(run.index).toBe(0);
    stepRun(run, course, { x: 0, y: 30, z: -2 }, { x: 0, y: 30, z: 2 }, 0.1, null, o);
    expect(o.event).toBe('pass');
    expect(run.index).toBe(1);
    stepRun(run, course, { x: 0, y: 30, z: 38 }, { x: 0, y: 30, z: 42 }, 0.2, null, o);
    expect(run.index).toBe(2);
    stepRun(run, course, { x: 0, y: 30, z: 78 }, { x: 0, y: 30, z: 82 }, 0.2, null, o);
    expect(o.event).toBe('finish');
    expect(run.finished).toBe(true);
    expect(run.splits.length).toBe(3);
  });
  test('a near miss leaves the same gate up', () => {
    const run = createRun();
    const o = out();
    stepRun(run, course, { x: 9, y: 30, z: -1 }, { x: 9, y: 30, z: 1 }, 0.05, null, o);
    expect(o.event).toBe('near');
    expect(run.index).toBe(0);
  });
  test('a split is the clock at the gate, against the stored best', () => {
    const run = createRun();
    const o = out();
    stepRun(run, course, { x: 0, y: 30, z: -1 }, { x: 0, y: 30, z: 1 }, 1.2, [1000, 2000, 3000], o);
    expect(o.event).toBe('pass');
    expect(o.delta).toBeCloseTo(200, 0);
    expect(splitDelta(900, 1000)).toBe(-100);
    expect(splitDelta(900, null)).toBeNull();
  });
});

describe('buoy side', () => {
  // travel +Z, port is +X
  const buoy = { kind: 'buoy', x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 1, side: 1, latMin: 3, latMax: 40 };
  test('the hull centre on the flagged side counts', () => {
    const hit = crossGate({ x: 12, y: 0, z: -5 }, { x: 12, y: 0, z: 5 }, buoy, out());
    expect(hit.ok).toBe(true);
    expect(hit.lateral).toBeCloseTo(12, 5);
  });
  test('the wrong side does not', () => {
    const hit = crossGate({ x: -12, y: 0, z: -5 }, { x: -12, y: 0, z: 5 }, buoy, out());
    expect(hit.ok).toBe(false);
  });
  test('clipping the buoy does not', () => {
    const hit = crossGate({ x: 1, y: 0, z: -2 }, { x: 1, y: 0, z: 2 }, buoy, out());
    expect(hit.ok).toBe(false);
  });
  test('a pass on the far side of the channel does not', () => {
    const hit = crossGate({ x: 80, y: 0, z: -2 }, { x: 80, y: 0, z: 2 }, buoy, out());
    expect(hit.ok).toBe(false);
  });
  test('starboard flag is the other half-plane', () => {
    const stbd = { ...buoy, side: -1 };
    expect(crossGate({ x: -10, y: 0, z: -1 }, { x: -10, y: 0, z: 1 }, stbd, out()).ok).toBe(true);
    expect(crossGate({ x: 10, y: 0, z: -1 }, { x: 10, y: 0, z: 1 }, stbd, out()).ok).toBe(false);
  });
});

describe('docking box', () => {
  const box = { kind: 'dock', x: 100, y: 0, z: 200, yaw: 0, halfL: 20, halfW: 12, nx: 0, ny: 0, nz: 1 };
  const pose = (over) => ({ x: 100, z: 200, yaw: 0, u: 0.2, v: 0, ...over });
  test('a centred stop on heading, under 1 kt, counts after the hold', () => {
    const d = dockCheck(pose({}), box, DOCK.holdS, out());
    expect(d.inside).toBe(true);
    expect(d.ok).toBe(true);
    expect(d.speed).toBeLessThan(KN);
  });
  test('1 kt or more does not', () => {
    expect(dockCheck(pose({ u: KN }), box, 1, out()).ok).toBe(false);
    expect(dockCheck(pose({ u: 0.2, v: 0.5 }), box, 1, out()).ok).toBe(false);
  });
  test('heading past ±20° does not', () => {
    const deg = 20 * Math.PI / 180;
    expect(dockCheck(pose({ yaw: deg }), box, 1, out()).ok).toBe(true);
    expect(dockCheck(pose({ yaw: deg + 0.02 }), box, 1, out()).ok).toBe(false);
  });
  test('outside the box does not', () => {
    expect(dockCheck(pose({ x: 100 + 12.1 }), box, 1, out()).inside).toBe(false);
    expect(dockCheck(pose({ z: 200 + 20.1 }), box, 1, out()).ok).toBe(false);
  });
  test('the box is rotated with the ship yaw', () => {
    const yaw = -0.4;
    const turned = { ...box, yaw };
    const sy = Math.sin(yaw), cy = Math.cos(yaw);
    // 10 m ahead of the centre, along the bow
    const p = pose({ x: 100 + sy * 10, z: 200 + cy * 10, yaw });
    expect(dockCheck(p, turned, 1, out()).inside).toBe(true);
  });
  test('a centred stop is worth 10 s, the corner is worth nothing', () => {
    expect(dockBonusMs(0, box)).toBe(10000);
    expect(dockBonusMs(Math.hypot(box.halfW, box.halfL), box)).toBe(0);
    expect(dockBonusMs(0.1, box)).toBeGreaterThan(9000);
  });
  test('the hold has to be continuous', () => {
    const course = { medal: { gold: 95000, silver: 120000, bronze: 150000 }, gates: [box] };
    const run = createRun();
    const o = out();
    const stopped = pose({});
    stepRun(run, course, stopped, stopped, 0.2, null, o);
    expect(run.finished).toBe(false);
    stepRun(run, course, pose({ u: 2 }), pose({ u: 2 }), 0.2, null, o);
    expect(run.dockHold).toBe(0);
    stepRun(run, course, stopped, stopped, 0.2, null, o);
    expect(run.finished).toBe(false);
    stepRun(run, course, stopped, stopped, 0.2, null, o);
    expect(o.event).toBe('finish');
    const score = scoreRun(run, course);
    expect(score.bonusMs).toBe(10000);
    expect(score.timeMs).toBeCloseTo(800, 0);
    expect(score.effectiveMs).toBe(0);
    expect(score.medal).toBe('gold');
  });
});

describe('medals and the clock', () => {
  const medal = { gold: 55000, silver: 70000, bronze: 90000 };
  test('thresholds are inclusive', () => {
    expect(medalOf(55000, medal)).toBe('gold');
    expect(medalOf(55001, medal)).toBe('silver');
    expect(medalOf(70000, medal)).toBe('silver');
    expect(medalOf(90000, medal)).toBe('bronze');
    expect(medalOf(90001, medal)).toBeNull();
  });
  test('金 is the clean run × 1.05, and 銀 and 銅 keep the design ratios', () => {
    const ratios = { silver: 70 / 55, bronze: 90 / 55 };
    const m = medalsFromBest(52000, ratios);
    expect(m.gold).toBe(54600);
    expect(m.silver / m.gold).toBeCloseTo(70 / 55, 4);
    expect(m.bronze / m.gold).toBeCloseTo(90 / 55, 4);
  });
  test('a better medal replaces a worse one and never the other way', () => {
    expect(betterMedal('bronze', 'gold')).toBe('gold');
    expect(betterMedal('gold', 'silver')).toBe('gold');
    expect(betterMedal(null, 'bronze')).toBe('bronze');
    expect(betterMedal('silver', null)).toBe('silver');
  });
  test('the clock reads m:ss.cs', () => {
    expect(formatTime(42370)).toBe('0:42.37');
    expect(formatTime(0)).toBe('0:00.00');
    expect(formatTime(75420)).toBe('1:15.42');
    const buf = writeTime(42370, ['?', ':', '?', '?', '.', '?', '?']);
    expect(buf[0] + buf[1] + buf[2] + buf[3] + buf[4] + buf[5] + buf[6]).toBe('0:42.37');
  });
  test('wrapAng stays in half a turn', () => {
    expect(wrapAng(Math.PI * 3)).toBeCloseTo(Math.PI, 5);
    expect(Math.abs(wrapAng(-Math.PI * 1.5))).toBeLessThan(Math.PI + 1e-6);
  });
});

describe('the notebook row', () => {
  const course = { medal: { gold: 55000, silver: 70000, bronze: 90000 } };
  test('a faster finish replaces the best and keeps the better medal', () => {
    const first = recordResult(null, course, { finished: true, elapsed: 80000, bonusMs: 0, splits: [20000, 80000] });
    expect(first.isBest).toBe(true);
    expect(first.row.best).toBe(80000);
    expect(first.row.medal).toBe('bronze');
    expect(first.row.runs).toBe(1);
    const second = recordResult(first.row, course, { finished: true, elapsed: 60000, bonusMs: 0, splits: [15000, 60000] });
    expect(second.isBest).toBe(true);
    expect(second.row.best).toBe(60000);
    expect(second.row.medal).toBe('silver');
    expect(second.row.runs).toBe(2);
    expect(second.row.splits).toEqual([15000, 60000]);
    const worse = recordResult(second.row, course, { finished: true, elapsed: 100000, bonusMs: 0, splits: [100000] });
    expect(worse.isBest).toBe(false);
    expect(worse.row.best).toBe(60000);
    expect(worse.row.medal).toBe('silver');
    expect(worse.row.runs).toBe(3);
  });
  test('a quit does not invent a medal', () => {
    const quit = recordResult(null, course, { finished: false, elapsed: 1000, bonusMs: 0, splits: [] });
    expect(quit.isBest).toBe(false);
    expect(quit.row.best).toBe(null);
    expect(quit.row.medal).toBe(null);
    expect(quit.row.runs).toBe(1);
  });
});

/** The same pattern as scripts/anime/enrich/fold.js SENSITIVE. Copied so this file stays free of the layout. */
const SENSITIVE = /\u6d25\u6ce2|\u9707\u707d|被災|復興|tsun[a]mi|earthquake|201[1]|3\.1[1]|慰霊|避難|防潮堤|伝承館|遺構|memorial|disaster/i;

describe('the committed courses', () => {
  test('three courses, the design ratios, and a skill ring', () => {
    expect(COURSES.courses.map((c) => c.id)).toEqual(['anba', 'minato', 'harbour']);
    for (const c of COURSES.courses) {
      expect(c.medal.silver / c.medal.gold).toBeCloseTo(c.ratios.silver, 3);
      expect(c.medal.bronze / c.medal.gold).toBeCloseTo(c.ratios.bronze, 3);
    }
    const skill = COURSES.courses[0].gates.filter((g) => g.skill);
    expect(skill).toHaveLength(1);
    expect(skill[0].nx).toBe(0);
    expect(skill[0].nz).toBe(-1);
    const dock = COURSES.courses[2].gates.at(-1);
    expect(dock.kind).toBe('dock');
    expect(dock.halfL).toBe(26);
    expect(dock.halfW).toBe(16);
    expect(COURSES.courses[2].path.length).toBeGreaterThan(3);
  });
  test('a reload keeps the per-gate splits next to the medal', () => {
    const next = migrate({ v: 1, courses: { anba: { best: 40100, medal: 'gold', runs: 2, splits: [1200, 3400] } } });
    expect(next.courses.anba.best).toBe(40100);
    expect(next.courses.anba.medal).toBe('gold');
    expect(next.courses.anba.splits).toEqual([1200, 3400]);
  });
  test('no disaster words in the course data or the course strings', () => {
    const root = join(import.meta.dir, '..');
    const blob = readFileSync(join(root, 'data/play/courses.json'), 'utf8')
      + readFileSync(join(root, 'data/play-i18n.json'), 'utf8');
    expect(SENSITIVE.test(blob)).toBe(false);
    const i18n = JSON.parse(readFileSync(join(root, 'data/play-i18n.json'), 'utf8'));
    for (const lang of ['ja', 'en']) {
      const keys = Object.keys(i18n[lang]).filter((k) => k.startsWith('play.course.'));
      expect(keys.length).toBeGreaterThan(10);
    }
  });
});

describe('the gate ladder and the finish bus', () => {
  test('the next gate is solid, the one after is 60 percent, the rest are 25', () => {
    expect(gateOpacity(3, -1)).toBe(1);
    expect(gateOpacity(4, 4)).toBe(1);
    expect(gateOpacity(5, 4)).toBe(0.6);
    expect(gateOpacity(6, 4)).toBe(0.25);
    expect(gateOpacity(2, 4)).toBe(0.25);
  });
  test('a finish listener hears the course, the time and the medal', () => {
    const bus = createBus();
    const heard = [];
    const off = bus.on('finish', (ev) => heard.push(ev));
    bus.emit('finish', { id: 'anba', ms: 42000, medal: 'gold' });
    off();
    bus.emit('finish', { id: 'anba', ms: 1, medal: null });
    expect(heard).toEqual([{ id: 'anba', ms: 42000, medal: 'gold' }]);
  });
  test('the split stays for 1.2 s and a retry starts inside 1.5 s', () => {
    expect(SPLIT_HOLD_MS).toBe(1200);
    expect(PASS_MS).toBe(0.25);
    expect(RETRY_FADE_S).toBe(1);
    expect(RETRY_BUDGET_MS).toBeGreaterThan(RETRY_FADE_S * 1000);
  });
});

describe('colours', () => {
  test('the cloth and the medals are the specified hexes', () => {
    expect(TAIRYO).toEqual(['#B7282E', '#FBFAF5', '#165E83']);
    expect(MEDAL_HEX.gold).toBe('#F8B500');
    expect(MEDAL_HEX.silver).toBe('#C9CDD6');
    expect(MEDAL_HEX.bronze).toBe('#C8763F');
    expect(MEDAL_HEX.rim).toBe('#223A70');
    expect(DOCK.maxKt).toBe(1);
    expect(DOCK.headingDeg).toBe(20);
    expect(DOCK.bonusMs).toBe(10000);
  });
});
