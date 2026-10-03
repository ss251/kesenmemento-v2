// [ship] Sail mode and the departure route of 第一昭福丸 (src/anime/world/explore/sail.js, src/anime/world/ship/route.js,
// the yield / berth-reserve edits marked [ship] in harbor/arrivals.js and harbor/world.js).
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as THREE from "three";
import * as L from "../src/anime/world/layout.js";
import {
  BOAT, KN, boatStep, boatState, sailStep, resolveShore, hullClearance, hullPoints, HULL_SAMPLES, pursue, routeEvents, createSail, AUTO,
} from "../src/anime/world/explore/sail.js";
import {
  BERTH, BERTH_RESERVE, BERTH_APPROACH_S, OUTBOUND, OUTBOUND_PATH, KANAE_CROSSING, GIRDER, SHOKO, MIRAI, BAY_MOUTH, SHIP_DIMS,
  routeClearance, makePath, inBerthReserve,
} from "../src/anime/world/ship/route.js";
import { KANAE } from "../src/anime/world/harbor/real.js";
import { kanaeDeckY } from "../src/anime/world/harbor/kanae.js";
import { yieldHold, YIELD_R, createArrivals } from "../src/anime/world/harbor/arrivals.js";
import { planMooringRows } from "../src/anime/world/harbor/rows.js";
import { createContext, mulberry32 } from "../src/anime/core/ctx.js";

// DOM stubs (canvas drawing is a no-op), as in test/v3-town.test.js
class Ctx2D {
  constructor(c) { this.canvas = c; this.font = "10px sans-serif"; }
  measureText(t) { const m = /(\d+(?:\.\d+)?)px/.exec(this.font); const s = m ? Number(m[1]) : 10; return { width: [...String(t)].length * s * 0.92 }; }
  createLinearGradient() { return { addColorStop() {} }; }
  createRadialGradient() { return { addColorStop() {} }; }
  createPattern() { return {}; }
  getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }; }
  putImageData() {}
}
const ctxProxy = (c) => new Proxy(new Ctx2D(c), { get(t, k) { if (k in t) return t[k]; return () => {}; }, set(t, k, v) { t[k] = v; return true; } });
class FakeCanvas { constructor() { this.width = 300; this.height = 150; this.style = {}; } getContext(t) { return t === "2d" ? (this._c ||= ctxProxy(this)) : null; } toDataURL() { return "data:,"; } addEventListener() {} }
globalThis.window ??= globalThis;
globalThis.document ??= { createElement: (t) => (t === "canvas" ? new FakeCanvas() : { style: {}, addEventListener() {}, appendChild() {}, setAttribute() {} }), fonts: { load: async () => [] }, body: { appendChild() {} }, addEventListener() {} };
globalThis.HTMLCanvasElement ??= FakeCanvas;

const ROOT = resolve(import.meta.dir, "..");
const read = (p) => readFileSync(resolve(ROOT, p), "utf8");
const LOA = SHIP_DIMS.loa;
const run = (s, input, secs, dt = 0.05) => { for (let t = 0; t < secs; t += dt) s = boatStep(s, input, dt); return s; };

describe("boatStep: surge (inertia, no brakes, astern thrust)", () => {
  test("accelerates slowly to the 6 kn harbour pace (a game setting) and never past it", () => {
    let s = boatState(0, 0, 0), t = 0, t50 = null, t90 = null, vmax = 0;
    for (; t < 120; t += 0.05) {
      s = boatStep(s, { throttle: 1 }, 0.05);
      vmax = Math.max(vmax, s.u);
      if (t50 == null && s.u >= 0.5 * BOAT.vMax) t50 = t;
      if (t90 == null && s.u >= 0.9 * BOAT.vMax) t90 = t;
    }
    expect(BOAT.vMax / KN).toBeCloseTo(6, 5);
    expect(s.u).toBeGreaterThan(0.99 * BOAT.vMax);
    expect(vmax).toBeLessThanOrEqual(BOAT.vMax + 1e-6);
    expect(t50).toBeGreaterThan(8);            // a 486 GT hull: no car-like launch
    expect(t50).toBeLessThan(20);
    expect(t90).toBeGreaterThan(25);
    expect(t90).toBeLessThan(45);
    expect(s.z).toBeGreaterThan(0);            // yaw 0 = bow due south (+Z)
    expect(Math.abs(s.x)).toBeLessThan(1e-6);
  });
  test("no brakes: she coasts a long way on the engine stopped; astern thrust stops her sooner", () => {
    const full = run(boatState(0, 0, 0), { throttle: 1 }, 90);
    const coast = run(full, { throttle: 0 }, 30);
    expect(coast.u).toBeGreaterThan(0.35 * BOAT.vMax);
    let a = full, tStop = null;
    for (let t = 0; t < 120; t += 0.05) { a = boatStep(a, { throttle: -1 }, 0.05); if (a.u <= 0) { tStop = t; break; } }
    expect(tStop).not.toBeNull();
    expect(tStop).toBeLessThan(60);
    let c = full, tCoast = null;
    for (let t = 0; t < 600; t += 0.05) { c = boatStep(c, { throttle: 0 }, 0.05); if (c.u < 0.05) { tCoast = t; break; } }
    expect(tCoast ?? 600).toBeGreaterThan(tStop * 2);
  });
  test("reverse: goes astern, slower than ahead", () => {
    const s = run(boatState(0, 0, 0), { throttle: -1 }, 120);
    expect(s.u).toBeLessThan(-1.0);
    expect(s.u).toBeGreaterThan(-0.7 * BOAT.vMax);
    expect(s.z).toBeLessThan(0);   // moving astern = toward -Z for a south-facing bow
  });
  test("pure and deterministic: no mutation, same output for the same input", () => {
    const s0 = boatState(10, 20, 0.3); const copy = JSON.stringify(s0);
    const a = boatStep(s0, { throttle: 0.7, rudder: -0.4 }, 0.05), b = boatStep(s0, { throttle: 0.7, rudder: -0.4 }, 0.05);
    expect(JSON.stringify(s0)).toBe(copy);
    expect(a).toEqual(b);
  });
});

describe("boatStep: steering", () => {
  // full rudder from a straight run at harbour speed; tactical diameter = transfer when the heading has turned 180 deg
  function turnTest(throttle, boost = false) {
    let s = run(boatState(0, 0, 0), { throttle, boost }, 120);
    const x0 = s.x, z0 = s.z, y0 = s.yaw;
    let turned = 0, prevYaw = s.yaw, tactical = 0, advance = 0;
    const box = [Infinity, -Infinity, Infinity, -Infinity];
    for (let i = 0; i < 40000 && turned < 4 * Math.PI; i++) {
      s = boatStep(s, { throttle, rudder: 1, boost }, 0.05);
      turned += Math.abs(Math.atan2(Math.sin(s.yaw - prevYaw), Math.cos(s.yaw - prevYaw))); prevYaw = s.yaw;
      if (turned <= Math.PI) tactical = Math.max(tactical, Math.abs(s.x - x0));
      if (turned <= Math.PI / 2) advance = Math.max(advance, s.z - z0);
      if (turned > 2 * Math.PI) { box[0] = Math.min(box[0], s.x); box[1] = Math.max(box[1], s.x); box[2] = Math.min(box[2], s.z); box[3] = Math.max(box[3], s.z); }
    }
    return { s, tactical, advance, steady: ((box[1] - box[0]) + (box[3] - box[2])) / 2, x0, y0 };
  }
  test("tactical diameter 3-4 LOA at harbour speed; a starboard turn goes to starboard", () => {
    const T = turnTest(1);
    expect(T.tactical / LOA).toBeGreaterThan(3);
    expect(T.tactical / LOA).toBeLessThan(4);
    expect(T.steady / LOA).toBeGreaterThan(2.8);
    expect(T.steady / LOA).toBeLessThan(3.8);
    expect(T.s.x).toBeLessThan(T.x0 + 1);   // bow south, starboard = west (-X)
  });
  test("the turning circle is (nearly) speed-independent, so the yaw rate scales with speed", () => {
    const fast = turnTest(1), slow = turnTest(0.35);
    expect(Math.abs(fast.steady - slow.steady) / fast.steady).toBeLessThan(0.15);
    const rFast = run(run(boatState(0, 0, 0), { throttle: 1 }, 120), { throttle: 1, rudder: 1 }, 60);
    const rSlow = run(run(boatState(0, 0, 0), { throttle: 0.35 }, 120), { throttle: 0.35, rudder: 1 }, 60);
    expect(rFast.r / rSlow.r).toBeGreaterThan(0.8 * rFast.u / rSlow.u);
    expect(rFast.r / rSlow.r).toBeLessThan(1.2 * rFast.u / rSlow.u);
    const still = run(boatState(0, 0, 0), { rudder: 1 }, 20);   // no way on: the rudder does nothing
    expect(Math.abs(still.yaw)).toBeLessThan(1e-9);
  });
  test("rudder lag, yaw lag and a little outward sideslip", () => {
    const base = run(boatState(0, 0, 0), { throttle: 1 }, 120);
    const a = boatStep(base, { throttle: 1, rudder: 1 }, 0.05);
    expect(a.rudder).toBeLessThan(0.05);                       // the rudder swings over, not instantly
    const b = run(base, { throttle: 1, rudder: 1 }, 1.0);
    expect(b.r).toBeLessThan(0.5 * (b.u / BOAT.R0));           // the yaw rate builds up
    const c = run(base, { throttle: 1, rudder: 1 }, 60);
    expect(c.v).toBeGreaterThan(0);                            // starboard turn: drift to port (outward)
    expect(c.v / c.u).toBeLessThan(0.15);
    expect(c.u).toBeLessThan(base.u);                          // she slows in the turn
  });
  test("boost is time compression x4: four times the ground covered, the same turning circle", () => {
    const base = run(boatState(0, 0, 0), { throttle: 1 }, 120);
    const n = run(base, { throttle: 1 }, 20), b = run(base, { throttle: 1, boost: true }, 20);
    expect(b.tc).toBeGreaterThan(3.9);
    expect(b.u).toBeLessThanOrEqual(BOAT.vMax + 1e-6);         // the speed through the water is still 6 kn
    expect((b.z - base.z) / (n.z - base.z)).toBeGreaterThan(3.2);
    const fast = turnTest(1, true), plain = turnTest(1, false);
    expect(Math.abs(fast.steady - plain.steady) / plain.steady).toBeLessThan(0.1);
  });
});

describe("shore collision", () => {
  test("hull samples: bow, stern and the beam corners, at the true size", () => {
    const xs = HULL_SAMPLES.map((p) => p[0]), zs = HULL_SAMPLES.map((p) => p[1]);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(58.6, 5);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(9.2, 5);
    // world mapping: bow forward along (sin yaw, cos yaw); starboard = local -X
    const [bow] = hullPoints({ x: 0, z: 0, yaw: Math.PI / 2 }, [[0, 10]]), [stbd] = hullPoints({ x: 0, z: 0, yaw: 0 }, [[-1, 0]]);
    expect(bow[0]).toBeCloseTo(10, 6); expect(bow[1]).toBeCloseTo(0, 6);
    expect(stbd[0]).toBeCloseTo(-1, 6);   // bow south: starboard is west
  });
  test("500 randomised runs near the shore never put any hull sample within 1 m of it", () => {
    const rng = mulberry32("ship-shore");
    // starting poses: valid hulls 5-60 m off the inner-harbour and market shores
    const starts = [];
    for (let k = 0; starts.length < 500 && k < 200000; k++) {
      const x = 350 + rng() * 800, z = -200 + rng() * 1500, yaw = rng() * Math.PI * 2;
      const d = L.shoreDist(x, z);
      if (d < 8 || d > 60) continue;
      const s = { ...boatState(x, z, yaw), u: (rng() * 2 - 0.5) * BOAT.vMax };
      if (hullClearance(s).d >= BOAT.margin) starts.push(s);
    }
    expect(starts.length).toBe(500);
    let worst = Infinity, contacts = 0, steps = 0;
    for (const s0 of starts) {
      let s = s0, input = { throttle: 1, rudder: 0, boost: false };
      for (let i = 0; i < 600; i++) {   // 30 s at 20 Hz
        if (i % 40 === 0) input = { throttle: rng() * 2 - 0.6, rudder: rng() * 2 - 1, boost: rng() < 0.25 };
        s = sailStep(s, input, 0.05);
        const c = hullClearance(s).d;
        if (c < worst) worst = c;
        if (s.contact >= 0.45) contacts++;
        steps++;
      }
    }
    expect(steps).toBe(500 * 600);
    expect(contacts).toBeGreaterThan(50);    // the runs really did hit the shore
    expect(worst).toBeGreaterThanOrEqual(1);
    expect(worst).toBeGreaterThanOrEqual(BOAT.margin - 1e-6);
  });
  test("slides along a quay instead of through it, and loses speed doing so", () => {
    // the コの字岸壁 east face runs SSW; aim 25 deg into it (to starboard of its line) at full harbour speed
    let s = { ...boatState(BERTH.x + 40, BERTH.z - 60, BERTH.yaw - 0.45), u: BOAT.vMax, eng: 1 };
    expect(hullClearance(s).d).toBeGreaterThan(BOAT.margin);
    let hit = null, minD = Infinity;
    for (let i = 0; i < 1600; i++) {
      const prev = s;
      s = sailStep(s, { throttle: 1, rudder: 0 }, 0.05);
      minD = Math.min(minD, hullClearance(s).d);
      if (!hit && s.contact >= 0.45) hit = { ...prev };
    }
    expect(hit).not.toBeNull();
    expect(minD).toBeGreaterThanOrEqual(BOAT.margin - 1e-6);
    // after contact she kept moving along the face (south-south-west), not stopped dead and not through it
    const along = (s.x - hit.x) * Math.sin(BERTH.yaw) + (s.z - hit.z) * Math.cos(BERTH.yaw);
    expect(along).toBeGreaterThan(10);
    const r = resolveShore(hit, { ...hit, x: hit.x - 30 }, 0.05);   // a pose 30 m into the pier: refused
    expect(hullClearance(r).d).toBeGreaterThanOrEqual(BOAT.margin - 1e-6);
  });
});

describe("route: the コの字岸壁 berth and OUTBOUND", () => {
  test("the berth is on the OSM コの字岸壁 pier's east face, starboard side to, with the fenders clear", () => {
    expect(Math.hypot(BERTH.x - 530.3, BERTH.z - -99.7)).toBeLessThan(60);   // OSM node 8660824619
    expect(BERTH.place).toBe("気仙沼市魚浜町");
    const s = boatState();
    expect(hullClearance(s).d).toBeGreaterThanOrEqual(BOAT.margin);
    expect(hullClearance(s).d).toBeLessThan(5);                                // she is alongside, not anchored off
    const [stbd, port] = hullPoints(s, [[-SHIP_DIMS.beam / 2, 0], [SHIP_DIMS.beam / 2, 0]]);
    expect(L.shoreDist(...stbd)).toBeLessThan(L.shoreDist(...port));          // the quay is on her starboard side
    expect(L.isWater(BERTH.x, BERTH.z)).toBe(true);
    expect(L.isWater(BERTH.quay[0], BERTH.quay[1])).toBe(false);               // the crowd stands on the pier
  });
  test("OUTBOUND is water every 5 m and >= 40 m from the shore beyond the berth approach", () => {
    expect(OUTBOUND[0]).toEqual([BERTH.x, BERTH.z]);
    const all = routeClearance(OUTBOUND, { step: 5 });
    expect(all.dry).toBe(0);
    expect(all.min).toBeGreaterThan(0);
    const beyond = routeClearance(OUTBOUND_PATH, { step: 5, from: BERTH_APPROACH_S });
    expect(beyond.min).toBeGreaterThanOrEqual(40);
    expect(OUTBOUND_PATH.len).toBeGreaterThan(7500);
    // she leaves bow first along the quay face (the first leg is her berth heading)
    const [dx, dz] = OUTBOUND_PATH.dirAt(1);
    expect(Math.abs(Math.atan2(dx, dz) - BERTH.yaw)).toBeLessThan(0.01);
    // and ends at the bay mouth (routes.json's sea end)
    const e = OUTBOUND[OUTBOUND.length - 1];
    expect(Math.hypot(e[0] - BAY_MOUTH.x, e[1] - BAY_MOUTH.z)).toBeLessThan(60);
  });
  test("landmarks in order: under かなえ大橋, past みらい造船 and 商港, to the bay mouth", () => {
    expect(KANAE_CROSSING.s).toBeLessThan(MIRAI.s);
    expect(MIRAI.s).toBeLessThan(SHOKO.s);
    expect(SHOKO.s).toBeLessThan(OUTBOUND_PATH.len - 2000);
    expect(SHOKO.offset).toBeGreaterThan(100);   // passed well off, not through the port
    expect(MIRAI.offset).toBeGreaterThan(100);
  });
  test("the かなえ大橋 crossing passes between the pylons, well clear of both", () => {
    const K = KANAE_CROSSING;
    expect(K).not.toBeNull();
    expect(K.bridgeS).toBeGreaterThan(KANAE.pylonS + 60);
    expect(K.bridgeS).toBeLessThan(KANAE.pylonN - 60);
    const kp = makePath(KANAE.line);
    for (const ps of [KANAE.pylonS, KANAE.pylonN]) {
      const [px, pz] = kp.at(ps);
      expect(Math.hypot(K.x - px, K.z - pz)).toBeGreaterThan(100);
    }
    // the route crosses the axis exactly once
    let crossings = 0;
    const B = kp.pts, side = (x, z) => { const q = kp.project(x, z); const [ux, uz] = kp.dirAt(q.s), [ax, az] = kp.at(q.s); return Math.sign((x - ax) * uz - (z - az) * ux); };
    for (let s = 0, prev = null; s <= OUTBOUND_PATH.len; s += 10) {
      const [x, z] = OUTBOUND_PATH.at(s); const q = kp.project(x, z);
      if (q.d > 400 || q.s <= 0 || q.s >= kp.len) { prev = null; continue; }
      const sd = side(x, z); if (prev != null && sd !== prev) crossings++; prev = sd;
    }
    expect(B.length).toBeGreaterThan(10);
    expect(crossings).toBe(1);
  });
  test("air draft: 21.0 m under the girder (32 m clearance) with >= 10 m to spare", () => {
    const K = KANAE_CROSSING;
    expect(K.airDraft).toBe(21.0);
    expect(K.clearance).toBeCloseTo(kanaeDeckY(K.bridgeS) - GIRDER, 6);
    expect(K.clearance).toBeGreaterThan(32);
    expect(K.margin).toBeGreaterThanOrEqual(10);
  });
  test("the ship module's particulars agree with the route's (when ship/shofukumaru1.js is built)", async () => {
    let SHIP = null;
    try { ({ SHIP } = await import("../src/anime/world/ship/shofukumaru1.js")); } catch (e) { SHIP = null; }
    if (!SHIP) return;   // built by another lane; the route carries the same sourced values meanwhile
    const pick = (...keys) => keys.map((k) => SHIP[k]).find((v) => Number.isFinite(v));
    const loa = pick("loa", "LOA"), beam = pick("beam", "B", "breadth"), air = pick("airDraft", "air");
    if (loa != null) expect(loa).toBeCloseTo(SHIP_DIMS.loa, 3);
    if (beam != null) expect(beam).toBeCloseTo(SHIP_DIMS.beam, 3);
    if (air != null) expect(air).toBeCloseTo(SHIP_DIMS.airDraft, 3);
  });
});

describe("autopilot (pure pursuit on OUTBOUND)", () => {
  test("berth to bay mouth: events in order, never near the shore, on the line", () => {
    let s = boatState(), prog = 0, t = 0, worst = Infinity, xte = 0, maxRudderEarly = 0;
    const fired = new Set(), evs = [];
    for (let i = 0; i < 20000 && !fired.has("arrived"); i++) {
      const ap = pursue(OUTBOUND_PATH, s, prog);
      if (prog < AUTO.straightUntil) maxRudderEarly = Math.max(maxRudderEarly, Math.abs(ap.rudder));
      const prev = s;
      s = sailStep(s, ap, 0.1); t += 0.1;
      const q = OUTBOUND_PATH.project(s.x, s.z, Math.max(0, prog - 60), prog + 400); prog = q.s;
      if (q.s > BERTH_APPROACH_S) xte = Math.max(xte, q.d);
      worst = Math.min(worst, hullClearance(s).d);
      for (const e of routeEvents(prev, s, { s: q.s, d: q.d }, fired)) evs.push(e);
    }
    expect(evs.map((e) => e.type)).toEqual(["passKanae", "passMirai", "passShoko", "bayMouth", "arrived"]);
    expect(evs[0].between).toBe(true);
    expect(worst).toBeGreaterThanOrEqual(BOAT.margin);
    expect(xte).toBeLessThan(30);
    expect(maxRudderEarly).toBe(0);           // straight off the quay first (her stern would swing into it)
    expect(t).toBeLessThan(20 * 60);          // the x4 bay transit: berth to sea in under 20 min
    expect(Math.abs(s.u)).toBeLessThan(BOAT.vMax);
  });
});

describe("AI boats yield to her; her berth stays free", () => {
  test("yieldHold: approaching boats within 120 m hold (their clock slips), others carry on", () => {
    const boats = [
      { phase: "approach", x: 100, z: 0 }, { phase: "approach", x: 0, z: 119 }, { phase: "approach", x: 0, z: 121 },
      { phase: "berthed", x: 10, z: 0 }, { phase: "sea", x: 0, z: 0 },
    ];
    expect(YIELD_R).toBe(120);
    expect(yieldHold(boats, { x: 0, z: 0 }, 0.5, { rate: 4 })).toBe(2);
    expect(boats.map((b) => b.delay || 0)).toEqual([2, 2, 0, 0, 0]);
    expect(boats.map((b) => b.yielding)).toEqual([true, true, false, false, false]);
    expect(yieldHold(boats, null, 0.5)).toBe(0);   // sail not active: nobody holds
    expect(boats[0].delay).toBe(2);                 // the slip is kept: they resume from where they stopped
  });
  test("createArrivals: an arriving boat near the sailing ship stops, and moves on once she is gone", () => {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 30000);
    const ctx = createContext({ scene, camera, renderer: null, audio: null, quality: { name: "low" }, sunDir: new THREE.Vector3(...L.SUN_DIR).normalize() });
    ctx.sky = { hours: 10 };
    const A = createArrivals(ctx, { follow: false });
    A.setArrivals([{ vessel: "第八テスト丸", time: "10:20", kind: "longline" }]);
    let t = 0;
    const step = (n) => { for (let i = 0; i < n; i++) { t += 0.1; A.update(0.1, t); } return A.state()[0]; };
    const b0 = step(1);
    expect(b0.phase).toBe("approach");
    const b1 = step(50);
    expect(Math.hypot(b1.x - b0.x, b1.z - b0.z)).toBeGreaterThan(3);   // under way (x RATE)
    ctx.services.sail = { active: true, state: { x: b1.x + 60, z: b1.z } };
    step(2);
    const h0 = A.state()[0], h1 = step(50);
    expect(h1.yielding).toBe(true);
    expect(Math.hypot(h1.x - h0.x, h1.z - h0.z)).toBeLessThan(1.5);
    ctx.services.sail.active = false;
    const g1 = step(50);
    expect(g1.yielding).toBe(false);
    expect(Math.hypot(g1.x - h1.x, g1.z - h1.z)).toBeGreaterThan(3);
    expect(g1.delay).toBeGreaterThan(15);
    A.clear();
  });
  test("the コの字岸壁 berth is reserved: no moored row boat in it, moorRun avoids it, a safety net removes any", () => {
    expect(inBerthReserve(BERTH.x, BERTH.z)).toBe(true);
    expect(inBerthReserve(BERTH.x + 200, BERTH.z)).toBe(false);
    // the whole hull at the berth sits inside the reservation
    for (const [x, z] of hullPoints(boatState())) expect(BERTH_RESERVE.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r)).toBe(true);
    const rows = planMooringRows((seed) => mulberry32(seed), { isWater: L.isWater });
    expect(rows.length).toBeGreaterThan(10);
    for (const b of rows) expect(inBerthReserve(b.x, b.z, 40)).toBe(false);
    const W = read("src/anime/world/harbor/world.js");
    expect(W).toContain("avoid: BERTH_RESERVE }));   // [ship]");
    expect(W).toContain("inBerthReserve(p.x, p.z, b.spec?.L || 20)");
    for (const line of W.split("\n").filter((l) => /BERTH_RESERVE|inBerthReserve|shipBerth/.test(l))) expect(line).toContain("[ship]");
  });
});

describe("createSail (runtime, true-size stub)", () => {
  test("enter at the berth, sail on autopilot, events, focus ahead, take over, exit", () => {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 30000);
    const ctx = createContext({ scene, camera, renderer: null, audio: null, quality: { name: "low", phone: true }, sunDir: new THREE.Vector3(...L.SUN_DIR).normalize() });
    const sail = createSail(ctx, {});
    expect(ctx.services.sail).toBe(sail);
    const box = new THREE.Box3().setFromObject(sail.ship.group);
    expect(box.max.z - box.min.z).toBeCloseTo(58.6, 0);
    expect(box.max.x - box.min.x).toBeCloseTo(9.2, 1);
    const evs = []; sail.onEvent((e) => evs.push(e.type));
    expect(sail.enter()).toBe(true);
    expect(sail.active).toBe(true);
    expect(sail.state.autopilot).toBe(true);
    expect(sail.carrier.position.x).toBeCloseTo(BERTH.x, 5);
    expect(sail.carrier.rotation.y).toBeCloseTo(BERTH.yaw, 5);
    for (let i = 0; i < 1200; i++) sail.update(0.05);   // 60 s
    expect(sail.state.s).toBeGreaterThan(40);
    expect(sail.state.kn).toBeGreaterThan(3);
    const f = sail.focus();
    expect((f.x - sail.state.x) * Math.sin(sail.state.yaw) + (f.z - sail.state.z) * Math.cos(sail.state.yaw)).toBeGreaterThan(40);
    expect(camera.position.distanceTo(new THREE.Vector3(sail.state.x, 0, sail.state.z))).toBeGreaterThan(60);
    // jump her to just short of the bridge on the line, heading down it: passKanae fires when she crosses
    const s0 = KANAE_CROSSING.s - 150, [x, z] = OUTBOUND_PATH.at(s0), [dx, dz] = OUTBOUND_PATH.dirAt(s0);
    sail.enter({ x, z, yaw: Math.atan2(dx, dz), u: BOAT.vMax });
    for (let i = 0; i < 2400 && !evs.includes("passKanae"); i++) sail.update(0.05);
    expect(evs).toContain("passKanae");
    sail.setAutopilot(false);
    expect(sail.state.autopilot).toBe(false);
    sail.exit();
    expect(sail.active).toBe(false);
    sail.dispose();
  });
  test("phone tier: the wake ribbon is small (24 segments)", () => {
    const src = read("src/anime/world/explore/sail.js");
    expect(src).toContain("const N = phone ? 24 : 64, C = 3");
  });
});
