import { describe, test, expect } from 'bun:test';
import { BOAT, boatStep, boatState, createSail, sailStep, hullClearance } from '../src/anime/world/explore/sail.js';
import { KATSUO, KATSUO_SAMPLES } from '../src/anime/world/ship/boat-params.js';
import { BAY_MOUTH } from '../src/anime/world/ship/route.js';
import { BERTH } from '../src/anime/world/ship/katsuo-boat.js';
import { shoreDist } from '../src/anime/world/layout.js';
import {
  CFG, inSeason, schoolsFor, nearestSchool, fromMouth, kgFromCm, rollCm, naburaStep, biteGap,
  strengthFromHold, strengthFromSwipe, judgeLift, nextCombo, freshStep, gradeOf, priceOf,
  helmToward, radarBlip, sonar, arcAt, poleDeg, createSession, sessionStep, rememberTrip, readLog,
  catchPath, slidePath, fishMarks, createFlight, flyStep, APEX_HOLD, RHYTHM,
  hoseVelocity, hoseAt, departOrder,
  liftWindow, markOf, coachStep, coachSeenAfter, readSeen, writeSeen, noteFish, finishTrip, COACH_ORDER,
  balloonPx, ringWidth, balloonOpacity, BALLOON_FLOOR_PX, BALLOON_CAP_PX,
} from '../src/anime/play/ippon/logic.js';
import { fishBox, buildKatsuoGeo, LOGO } from '../src/anime/play/ippon/fish-geo.js';
import { buildCrewGeo } from '../src/anime/play/ippon/crew-geo.js';
import { boatStations } from '../src/anime/world/ship/katsuo-boat.js';
import { createContext } from '../src/anime/core/ctx.js';
import * as THREE from 'three';

const rngOf = (seed) => {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
};

describe('season and grounds', () => {
  test('the published window is late May through November', () => {
    expect(inSeason(5, 19)).toBe(false);
    expect(inSeason(5, 20)).toBe(true);
    expect(inSeason(8, 1)).toBe(true);
    expect(inSeason(10, 7)).toBe(true);
    expect(inSeason(11, 30)).toBe(true);
    expect(inSeason(12, 1)).toBe(false);
    expect(inSeason(4, 20)).toBe(false);
  });
  test('out of season the school stays far, and in season it is just outside the bay mouth', () => {
    const near = schoolsFor(true), far = schoolsFor(false);
    const quay = nearestSchool(708, 912, near);
    const farQ = nearestSchool(708, 912, far);
    expect(farQ.d).toBeGreaterThan(5000);
    expect(quay.d).toBeGreaterThan(farQ.d);
    expect(far[0].x).toBe(2025);
    expect(far[0].z).toBe(7425);
    expect(far[1].x).toBe(2400);
    expect(far[1].z).toBe(6800);
    for (const g of near) {
      const past = fromMouth(g.x, g.z) - BAY_MOUTH.r;
      expect(past).toBeGreaterThan(800);
      expect(past).toBeLessThan(1500);
      expect(g.x).toBeGreaterThan(BAY_MOUTH.x);
      expect(shoreDist(g.x, g.z)).toBeGreaterThan(20);
      expect(fromMouth(g.x + g.r * 0.35, g.z)).toBeGreaterThan(BAY_MOUTH.r + 700);
    }
  });
});

describe('the lift', () => {
  test('a short snap on time lands; early, late, weak and huge do not', () => {
    const sweet = strengthFromHold(0.18);
    expect(sweet).toBeGreaterThan(0.4);
    expect(sweet).toBeLessThan(0.74);
    expect(judgeLift({ dtMs: 200, strength: sweet }).quality).toBe('perfect');
    expect(judgeLift({ dtMs: 200, strength: 0.45 }).hit).toBe(true);
    expect(judgeLift({ dtMs: 40, strength: sweet }).quality).toBe('miss');
    expect(judgeLift({ dtMs: 400, strength: sweet }).quality).toBe('miss');
    expect(judgeLift({ dtMs: 200, strength: 0.1 }).quality).toBe('miss');
    expect(judgeLift({ dtMs: 200, strength: 0.95 }).quality).toBe('miss');
  });
  test('a heavy fish is still one swing, and it needs a stronger pull', () => {
    expect(judgeLift({ dtMs: 200, strength: 0.5, big: true }).hit).toBe(false);
    expect(judgeLift({ dtMs: 200, strength: 0.5, big: true }).set).toBe(false);
    expect(judgeLift({ dtMs: 200, strength: 0.84, big: true }).quality).toBe('perfect');
    expect(judgeLift({ dtMs: 200, strength: 0.84, big: true }).hit).toBe(true);
  });
  test('swipe speed sits on the same strength axis', () => {
    expect(strengthFromSwipe(200)).toBeLessThan(0.2);
    expect(strengthFromSwipe(1200)).toBeGreaterThan(0.4);
    expect(strengthFromSwipe(1200)).toBeLessThan(0.74);
  });
  test('combo grows on a rhythm and a miss clears it', () => {
    expect(nextCombo(2, true, 1.2)).toBe(3);
    expect(nextCombo(2, true, 9)).toBe(1);
    expect(nextCombo(4, false, 0.2)).toBe(0);
  });
  test('the pole finishes over the shoulder and the fish peaks in the air', () => {
    expect(poleDeg(0)).toBeCloseTo(36, 0);
    expect(poleDeg(1)).toBeGreaterThan(110);
    const top = arcAt(0.5, 3.2);
    expect(top.y).toBeGreaterThan(3);
    expect(arcAt(0, 3).out).toBeLessThan(0);
    expect(arcAt(1, 3).out).toBeCloseTo(0, 5);
  });
});

describe('nabura, hold, grade', () => {
  test('spray and bait build the boil, then it dies after the session', () => {
    let n = 0;
    for (let i = 0; i < 40; i++) n = naburaStep(n, { spray: true }, 0.1, 0);
    expect(n).toBeGreaterThan(CFG.nabura.biteAt);
    n = naburaStep(n, { bait: true }, 0.1, 0);
    expect(n).toBeGreaterThan(CFG.nabura.biteAt);
    for (let i = 0; i < 80; i++) n = naburaStep(n, {}, 0.5, CFG.nabura.sessionS + 1);
    expect(n).toBeLessThan(0.05);
  });
  test('a hotter boil and a combo shorten the gap', () => {
    expect(biteGap(1, 4)).toBeLessThan(biteGap(0.2, 0));
  });
  test('ice holds the freshness that a warm deck loses', () => {
    const warm = freshStep(1, false, 60);
    const cold = freshStep(1, true, 60);
    expect(warm).toBeLessThan(0.8);
    expect(cold).toBeGreaterThan(0.97);
  });
  test('grade follows freshness and size; price stays empty until a source is set', () => {
    expect(gradeOf({ n: 4, kg: 12, fresh: 0.9 })).toBe('jo');
    expect(gradeOf({ n: 4, kg: 12, fresh: 0.6 })).toBe('nami');
    expect(gradeOf({ n: 4, kg: 6, fresh: 0.3 })).toBe('ko');
    expect(priceOf('jo', 10)).toBe(null);
    expect(kgFromCm(40)).toBeCloseTo(1.2, 1);
    expect(kgFromCm(50)).toBeCloseTo(2.6, 1);
    expect(kgFromCm(60)).toBeCloseTo(4.7, 1);
  });
  test('sizes stay inside the table', () => {
    const r = rngOf(7);
    for (let i = 0; i < 40; i++) {
      const cm = rollCm(r);
      expect(cm).toBeGreaterThanOrEqual(CFG.fish.minCm);
      expect(cm).toBeLessThanOrEqual(CFG.fish.maxCm);
    }
  });
});

describe('a whole trip', () => {
  test('from cast-off to the notebook, a miss costs only the combo', () => {
    const s = createSession(), out = {};
    const r = rngOf(3);
    const input = { castOff: 0, spray: 0, bait: 0, pole: 0, stow: 0, lift: 0, strength: 0, lagMs: 0, ice: 0, home: 0, dock: 0, confirm: 0, dist: 2000, nearHome: 0 };
    sessionStep(s, { ...input, castOff: 1 }, 0.1, CFG, r, out);
    expect(s.phase).toBe('run');
    sessionStep(s, { ...input, dist: 40, rush: 1 }, 0.1, CFG, r, out);
    expect(s.phase).toBe('run');
    expect(out.event).toBe('spook');
    sessionStep(s, { ...input, dist: 40 }, 0.1, CFG, r, out);
    expect(s.phase).toBe('work');
    for (let i = 0; i < 30; i++) sessionStep(s, { ...input, dist: 40, spray: 1, bait: i === 0 }, 0.2, CFG, r, out);
    expect(s.nabura).toBeGreaterThan(CFG.nabura.biteAt);
    sessionStep(s, { ...input, dist: 40, pole: 1, spray: 1 }, 0.1, CFG, r, out);
    expect(s.phase).toBe('pole');
    // wait out the first cue
    let guard = 0;
    while (!s.swing && guard++ < 40) sessionStep(s, { ...input, dist: 20, spray: 1 }, 0.1, CFG, r, out);
    expect(s.swing).toBe(true);
    const str = s.big ? 0.84 : 0.58;
    sessionStep(s, { ...input, dist: 20, spray: 1, lift: 1, strength: str, lagMs: 200 }, 0.05, CFG, r, out);
    expect(out.event).toBe('catch');
    const n = s.holdN;
    // a bad lift
    while (!s.swing && guard++ < 80) sessionStep(s, { ...input, dist: 20, spray: 1 }, 0.1, CFG, r, out);
    sessionStep(s, { ...input, dist: 20, lift: 1, strength: 0.05, lagMs: 200 }, 0.05, CFG, r, out);
    expect(out.event).toBe('miss');
    expect(s.holdN).toBe(n);
    expect(s.combo).toBe(0);
    sessionStep(s, { ...input, ice: 1 }, 0.1, CFG, r, out);
    expect(s.iced).toBe(true);
    sessionStep(s, { ...input, home: 1 }, 0.1, CFG, r, out);
    expect(s.phase).toBe('return');
    sessionStep(s, { ...input, nearHome: 1, dock: 1 }, 0.1, CFG, r, out);
    expect(s.phase).toBe('auction');
    sessionStep(s, { ...input, confirm: 1 }, 0.1, CFG, r, out);
    expect(out.event).toBe('landed');
    expect(out.kg).toBeGreaterThan(0);
    expect(out.combo).toBe(s.holdN);
  });
});

describe('helm, radar, notebook', () => {
  test('the chase helm boosts when the birds are far and slows in the school', () => {
    const far = helmToward({ x: 0, z: 0, yaw: 0 }, { x: 0, z: 800 }, KATSUO);
    const close = helmToward({ x: 0, z: 0, yaw: 0 }, { x: 0, z: 30 }, KATSUO, { work: true });
    expect(far.boost).toBe(true);
    expect(far.throttle).toBe(1);
    expect(close.boost).toBe(false);
    expect(close.throttle).toBeLessThan(0.4);
  });
  test('a flock ahead sits on the top of the radar ring', () => {
    const b = radarBlip(0, 0, 0, 0, 500, 2200);
    expect(b.on).toBe(true);
    expect(b.v).toBeGreaterThan(0);
    expect(Math.abs(b.u)).toBeLessThan(0.05);
    expect(sonar(40, 0.8)).toBeGreaterThan(sonar(800, 0));
    expect(sonar(2000, 1)).toBe(0);
  });
  test('the log merges into klc.play.v1 and leaves other keys alone', () => {
    const mem = new Map();
    const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
    storage.setItem('klc.play.v1', JSON.stringify({ v: 1, fish: { katsuo: { n: 1 } } }));
    const ip = rememberTrip(storage, { kg: 12.5, n: 4, biggest: 61, at: '2026-10-07' });
    expect(ip.trips).toBe(1);
    expect(ip.kg).toBe(12.5);
    expect(ip.biggest).toBe(61);
    const again = rememberTrip(storage, { kg: 3, n: 1, biggest: 44 });
    expect(again.trips).toBe(2);
    expect(again.biggest).toBe(61);
    expect(again.kg).toBe(15.5);
    const saved = JSON.parse(storage.getItem('klc.play.v1'));
    expect(saved.fish.katsuo.n).toBe(1);
    expect(readLog(storage).trips).toBe(2);
  });
});

describe('the second boat does not replace the longliner', () => {
  test('she is quicker, and enter() without a boat id stays 第一昭福丸', () => {
    expect(KATSUO.vMax).toBeGreaterThan(BOAT.vMax);
    expect(KATSUO.R0).toBeLessThan(BOAT.R0);
    expect(KATSUO.accel).toBeGreaterThan(BOAT.accel);
    let a = boatState(0, 0, 0), b = boatState(0, 0, 0);
    for (let i = 0; i < 80; i++) {
      a = boatStep(a, { throttle: 1 }, 0.05, BOAT);
      b = boatStep(b, { throttle: 1 }, 0.05, KATSUO);
    }
    expect(b.u).toBeGreaterThan(a.u);
    if (typeof document === 'undefined') {
      class Ctx2D { measureText() { return { width: 10 }; } createLinearGradient() { return { addColorStop() {} }; } createRadialGradient() { return { addColorStop() {} }; } }
      const ctxProxy = (c) => new Proxy(new Ctx2D(), { get(t, k) { if (k in t) return t[k]; return () => {}; }, set(t, k, v) { t[k] = v; return true; } });
      class FakeCanvas { constructor() { this.width = 64; this.height = 64; this.style = {}; } getContext() { return ctxProxy(this); } toDataURL() { return 'data:,'; } }
      globalThis.document = { createElement: () => new FakeCanvas(), body: { appendChild() {} }, addEventListener() {}, fonts: { load: async () => [] } };
      globalThis.window ??= globalThis;
    }
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 30000);
    const ctx = createContext({ scene, camera, renderer: null, audio: null, quality: { name: 'low', phone: true }, sunDir: new THREE.Vector3(0, 1, 0) });
    const sail = createSail(ctx, {});
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(KATSUO.B, 2, KATSUO.L)));
    sail.registerBoat('katsuo', { ship: { group: g }, home: { x: 1706, z: 2306, yaw: 0, quay: [1706, 2320] }, params: KATSUO, samples: KATSUO_SAMPLES });
    sail.enter({ boat: 'katsuo', x: 1706, z: 2306, yaw: 0, autopilot: false });
    expect(sail.boatId).toBe('katsuo');
    expect(sail.carrier.position.x).toBeCloseTo(1706, 3);
    sail.enter();
    expect(sail.boatId).toBe('shofuku');
    expect(sail.carrier.position.x).toBeCloseTo(575.3, 0);
    const box = new THREE.Box3().setFromObject(sail.ship.group);
    expect(box.max.z - box.min.z).toBeCloseTo(58.6, 0);
    sail.dispose();
  });
});

describe('the arc, the marks, the rhythm', () => {
  test('the fish leaves the water and lands on the deck, then the slope takes it aft', () => {
    const deck = 1.4;
    const water = catchPath(0, 3.2, deck);
    const top = catchPath(0.5, 3.2, deck);
    const land = catchPath(1, 3.2, deck);
    expect(water.x).toBeGreaterThan(1.5);
    expect(water.y).toBeLessThan(0.3);
    expect(water.onDeck).toBe(false);
    expect(top.y).toBeGreaterThan(3);
    expect(land.onDeck).toBe(true);
    expect(land.x).toBeLessThan(-0.8);
    expect(land.z).toBeLessThan(-1);
    expect(land.y).toBeCloseTo(deck, 2);
    const belt = slidePath(1, land);
    expect(belt.x).toBeLessThan(land.x);
    expect(belt.y).toBeLessThan(land.y - 0.3);
    expect(belt.z).toBeLessThan(land.z);
  });

  test('bars in the air, belly lines once it is on the deck', () => {
    expect(fishMarks('air')).toBe('bars');
    expect(fishMarks('water')).toBe('bars');
    expect(fishMarks('deck')).toBe('belly');
    const fly = createFlight();
    fly.on = 1;
    flyStep(fly, 0.34, { first: true });
    expect(fly.u).toBeCloseTo(0.5, 2);
    expect(fly.hold).toBeCloseTo(APEX_HOLD, 2);
    expect(fishMarks(fly.phase)).toBe('bars');
    flyStep(fly, APEX_HOLD, { first: true });
    expect(fly.u).toBeCloseTo(0.5, 2);
    expect(fly.hold).toBe(0);
    flyStep(fly, 0.4, { first: true });
    expect(fly.phase).toBe('deck');
    expect(fly.on).toBe(0);
    expect(fishMarks(fly.phase)).toBe('belly');
    const second = createFlight();
    second.on = 1;
    flyStep(second, 0.4, { first: false });
    expect(second.u).toBeGreaterThan(0.5);
    expect(second.hold).toBe(0);
    const still = createFlight();
    still.on = 1;
    flyStep(still, 0.2, { reduced: true });
    expect(still.phase).toBe('deck');
    expect(still.on).toBe(0);
  });

  test('a hot school cannot offer the next bite inside two seconds', () => {
    expect(biteGap(1, 6)).toBeGreaterThanOrEqual(RHYTHM.floor);
    expect(biteGap(1, 6)).toBeLessThanOrEqual(2.3);
    expect(biteGap(0.35, 0)).toBeGreaterThanOrEqual(2.8);
    expect(biteGap(1, 6)).toBeLessThan(biteGap(0.2, 0));
    const s = createSession();
    s.phase = 'swing';
    s.swing = true;
    s.nabura = 1;
    s.combo = 5;
    s.cm = 48;
    s.big = false;
    const ev = {};
    sessionStep(s, { lift: 1, strength: 0.62, lagMs: 200 }, 0.05, CFG, () => 0.5, ev);
    expect(ev.event).toBe('catch');
    expect(s.phase).toBe('pole');
    expect(s.wait).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < 19; i++) sessionStep(s, {}, 0.1, CFG, () => 0.5, ev);
    expect(s.phase).toBe('pole');
    expect(s.swing).toBe(false);
  });

  test('the mesh keeps the title mark proportions, and eight anglers line the port side', () => {
    const box = fishBox();
    expect(box.ratio).toBeGreaterThan(LOGO.length / LOGO.height * 0.82);
    expect(box.ratio).toBeLessThan(LOGO.length / LOGO.height * 1.18);
    expect(box.length).toBeGreaterThan(0.5);
    expect(box.length).toBeLessThan(0.75);
    if (typeof document === 'undefined') {
      class Ctx2D { measureText() { return { width: 10 }; } createLinearGradient() { return { addColorStop() {} }; } createRadialGradient() { return { addColorStop() {} }; } }
      const ctxProxy = () => new Proxy(new Ctx2D(), { get(t, k) { if (k in t) return t[k]; if (k === 'canvas') return { width: 512, height: 512 }; return () => {}; }, set(t, k, v) { t[k] = v; return true; } });
      class FakeCanvas { constructor() { this.width = 512; this.height = 512; this.style = {}; } getContext() { return ctxProxy(); } toDataURL() { return 'data:,'; } }
      globalThis.document = { createElement: () => new FakeCanvas(), body: { appendChild() {} }, addEventListener() {}, fonts: { load: async () => [] } };
      globalThis.window ??= globalThis;
    }
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
    const ctx = createContext({ scene, camera, renderer: null, audio: null, quality: { name: 'low', phone: true }, sunDir: new THREE.Vector3(0.2, 1, 0.2) });
    const built = buildCrewGeo(ctx);
    const crew = built.geo;
    const part = crew.getAttribute('aPart');
    const pos = crew.getAttribute('position');
    expect(part).toBeTruthy();
    expect(crew.getAttribute('uv')).toBeTruthy();
    expect(pos.count).toBeGreaterThan(2000);
    const seen = new Set();
    let bodyMin = Infinity, bodyMax = -Infinity, nan = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) nan++;
      seen.add(part.getX(i));
      if (part.getX(i) < 0.5) { bodyMin = Math.min(bodyMin, y); bodyMax = Math.max(bodyMax, y); }
    }
    expect(nan).toBe(0);
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
    expect(bodyMin).toBeGreaterThan(-0.05);
    expect(bodyMin).toBeLessThan(0.05);
    expect(bodyMax - bodyMin).toBeGreaterThan(1.5);
    expect(bodyMax - bodyMin).toBeLessThan(2.1);
    crew.computeBoundingBox();
    const b = crew.boundingBox;
    expect(b.max.x - b.min.x).toBeLessThan(10);
    expect(b.max.y - b.min.y).toBeLessThan(10);
    const stations = boatStations();
    expect(stations.crew.length).toBe(8);
    for (const c of stations.crew) expect(c.side).toBe(1);
    const zs = stations.crew.map((c) => c.z);
    expect(new Set(zs.map((z) => z.toFixed(2))).size).toBe(8);
  });

  test('the back is dark blue and the belly is silver', () => {
    const g = buildKatsuoGeo();
    const p = g.attributes.position.array;
    const c = g.attributes.color.array;
    let up = 0, upN = 0, down = 0, downN = 0;
    for (let i = 0; i < p.length; i += 3) {
      const y = p[i + 1];
      const lum = c[i] * 0.3 + c[i + 1] * 0.59 + c[i + 2] * 0.11;
      if (y > 0.04) { up += lum; upN++; }
      else if (y < -0.04) { down += lum; downN++; }
    }
    expect(upN).toBeGreaterThan(8);
    expect(downN).toBeGreaterThan(8);
    expect(up / upN).toBeLessThan(down / downN);
  });
});

describe('the hose and the run to the grounds', () => {
  test('the spray crests, then lands on the water', () => {
    const v = hoseVelocity(0, 1.4, 0, 4.2, 0.08, 0.4);
    const mid = hoseAt(0, 1.4, 0, v, v.T * 0.45);
    const end = hoseAt(0, 1.4, 0, v, v.T);
    expect(v.vy).toBeGreaterThan(0.4);
    expect(mid.y).toBeGreaterThan(1.4);
    expect(end.x).toBeCloseTo(4.2, 2);
    expect(end.y).toBeCloseTo(0.08, 2);
    expect(end.z).toBeCloseTo(0.4, 2);
  });

  test('she closes on the bay mouth without touching the shore', () => {
    let s = boatState(BERTH.x, BERTH.z, BERTH.yaw);
    const school = schoolsFor(true)[0];
    const mouth0 = Math.hypot(s.x - BAY_MOUTH.x, s.z - BAY_MOUTH.z);
    let rec = null;
    let minClear = Infinity;
    for (let i = 0; i < 720; i++) {
      const order = departOrder(s, school, rec, 0.25);
      rec = order.rec;
      s = sailStep(s, { throttle: order.throttle, rudder: order.rudder, boost: order.boost }, 0.25, shoreDist, KATSUO, KATSUO_SAMPLES);
      minClear = Math.min(minClear, hullClearance(s, shoreDist, KATSUO_SAMPLES).d);
    }
    const mouth1 = Math.hypot(s.x - BAY_MOUTH.x, s.z - BAY_MOUTH.z);
    expect(mouth0 - mouth1).toBeGreaterThan(200);
    expect(minClear).toBeGreaterThan(0.5);
  });
});

describe('the first trip', () => {
  test('a wide window lands the pull a normal window misses', () => {
    const sweet = 0.62;
    expect(judgeLift({ dtMs: 400, strength: sweet }).hit).toBe(false);
    expect(judgeLift({ dtMs: 400, strength: sweet, wide: true }).hit).toBe(true);
    expect(liftWindow(true).late - liftWindow(true).early).toBeGreaterThan((liftWindow(false).late - liftWindow(false).early) * 1.9);
    expect(judgeLift({ dtMs: 200, strength: 0.05, wide: true }).hit).toBe(false);
  });

  test('a miss on the first fish waits for the next bite', () => {
    const s = createSession();
    s.phase = 'swing';
    s.swing = true;
    s.firstFish = 1;
    s.holdN = 0;
    s.cm = 48;
    s.combo = 2;
    const out = {};
    sessionStep(s, { lift: 1, strength: 0.05, lagMs: 200 }, 0.016, CFG, () => 0.4, out);
    expect(out.event).toBe('wait');
    expect(s.phase).toBe('pole');
    expect(s.firstFish).toBe(1);
    expect(s.combo).toBe(2);
    expect(s.holdN).toBe(0);
  });

  test('coaching walks birds, bait, spray, pole, swipe, then praise ends it', () => {
    let seen = {};
    expect(coachStep(seen, { phase: 'depart', holdN: 0 })).toBe('birds');
    seen = coachSeenAfter(seen, 'birds');
    expect(coachStep(seen, { phase: 'work', baited: false, holdN: 0 })).toBe('bait');
    seen = coachSeenAfter(seen, 'bait');
    expect(coachStep(seen, { phase: 'work', baited: true, sprayed: false, holdN: 0 })).toBe('spray');
    seen = coachSeenAfter(seen, 'spray');
    expect(coachStep(seen, { phase: 'work', baited: true, sprayed: true, poled: false, holdN: 0 })).toBe('pole');
    seen = coachSeenAfter(seen, 'pole');
    expect(coachStep(seen, { phase: 'swing', firstFish: 1, holdN: 0, baited: true, sprayed: true })).toBe('swipe');
    seen = coachSeenAfter(seen, 'swipe');
    expect(coachStep(seen, { phase: 'work', holdN: 3, baited: true, sprayed: true })).toBe('praise');
    seen = coachSeenAfter(seen, 'praise');
    expect(seen.done).toBe(1);
    expect(coachStep(seen, { phase: 'swing', firstFish: 1, holdN: 0 })).toBe(null);
    expect(COACH_ORDER).toEqual(['birds', 'bait', 'spray', 'pole', 'swipe']);
  });

  test('the captain’s 「！」 stays at least 22 px at 60 m and never grows past the cap', () => {
    expect(balloonPx(60, 852, 55)).toBe(BALLOON_FLOOR_PX);
    expect(balloonPx(80, 900, 55)).toBe(BALLOON_FLOOR_PX);
    expect(balloonPx(8, 852, 55)).toBe(BALLOON_CAP_PX);
    const mid = balloonPx(22, 852, 55);
    expect(mid).toBeGreaterThan(BALLOON_FLOOR_PX);
    expect(mid).toBeLessThan(BALLOON_CAP_PX);
    expect(ringWidth(60, 852, 55)).toBeGreaterThanOrEqual(18);
    expect(balloonOpacity(60)).toBe(1);
    expect(balloonOpacity(108)).toBe(0);
    expect(balloonOpacity(84)).toBeGreaterThan(0);
    expect(balloonOpacity(84)).toBeLessThan(1);
  });

  test('seen flags survive a 図鑑 write', () => {
    const bag = new Map();
    const storage = {
      getItem: (k) => (bag.has(k) ? bag.get(k) : null),
      setItem: (k, v) => bag.set(k, String(v)),
    };
    writeSeen(storage, { bait: 1, birds: 1 });
    noteFish(storage, 42);
    noteFish(storage, 66);
    expect(readSeen(storage).bait).toBe(1);
    expect(readSeen(storage).birds).toBe(1);
    const o = JSON.parse(bag.values().next().value);
    expect(o.fish['katsuo-sho'].n).toBe(1);
    expect(o.fish['katsuo-dai'].n).toBe(1);
    expect(o.ippon.seen.bait).toBe(1);
  });

  test('帰港 reports the count, the kilos, the biggest and the mark', () => {
    const s = createSession();
    s.phase = 'work';
    s.holdN = 4;
    s.holdKg = 11.2;
    s.biggest = 61;
    const out = {};
    finishTrip(s, out);
    expect(s.phase).toBe('done');
    expect(out.event).toBe('landed');
    expect(out.count).toBe(4);
    expect(out.kg).toBeCloseTo(11.2);
    expect(out.biggest).toBe(61);
    expect(out.mark).toBe('ryo');
    expect(markOf({ n: 9, kg: 4, biggest: 40 })).toBe('yu');
    expect(markOf({ n: 1, kg: 2, biggest: 40 })).toBe('ka');
  });
});
