// [ui-c] Row 3: the camera flight (src/anime/world/life/tour.js). It answers at once, keeps its speed when retargeted, turns the view the short way,
// arrives exactly, can be finished with skip(), and the auto tour keeps its cinematic length. The first describe is the motion review's prototype test
// (the UI review (not included), plan 001) as it ran against the prototype (10 tests); the second pins what the port adds.
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import * as THREE from "three";
import * as L from "../src/anime/world/layout.js";
import { createTour, easeFly, flightSeconds, flightSecondsCinematic } from "../src/anime/world/life/tour.js";
import { Player } from "../src/anime/core/player.js";

function fakeCtx() {
  return { L, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 30000), sunDir: new THREE.Vector3(0, 1, 0), services: {}, quality: { name: "high" } };
}
const DT = 1 / 60;
function rig(from = "hero") {
  const ctx = fakeCtx(), tour = createTour(ctx);
  tour.jumpTo(from);
  const prev = ctx.camera.position.clone(), speeds = [];
  const step = (n = 1) => { for (let i = 0; i < n; i++) { tour.update(DT); speeds.push(ctx.camera.position.distanceTo(prev) / DT); prev.copy(ctx.camera.position); } };
  return { ctx, tour, step, speeds, cam: ctx.camera };
}

describe("camera flight (life/tour.js)", () => {
  test("easeFly: 0 -> 1, monotone, starts at s0 and stops at rest", () => {
    for (const s0 of [0, 0.8, 1.2, 2, 3]) {
      expect(easeFly(0, s0)).toBe(0); expect(easeFly(1, s0)).toBeCloseTo(1, 12);
      let prev = 0; for (let i = 1; i <= 1000; i++) { const e = easeFly(i / 1000, s0); expect(e).toBeGreaterThanOrEqual(prev - 1e-12); prev = e; }
      expect((easeFly(0.0005, s0) - easeFly(0, s0)) / 0.0005).toBeCloseTo(s0, 1);
      expect((easeFly(1, s0) - easeFly(0.9995, s0)) / 0.0005).toBeCloseTo(0, 1);
    }
  });
  test("durations: 1.8 s for a hop, 4.5 s across the town; the auto tour keeps its cinematic length", () => {
    expect(flightSeconds(0)).toBe(1.8); expect(flightSeconds(130)).toBeCloseTo(2.31, 1); expect(flightSeconds(850)).toBeCloseTo(3.73, 1); expect(flightSeconds(5000)).toBe(4.5);
    expect(flightSecondsCinematic(850)).toBeCloseTo(6.86, 1); expect(flightSecondsCinematic(10)).toBe(3.2); expect(flightSecondsCinematic(1e6)).toBe(11);
  });
  test("a place pick moves the camera at once: >= 20 m in the first 100 ms (the cubic ease-in moved under 2 m in 500 ms)", () => {
    const r = rig("hero"), a = r.cam.position.clone();
    r.tour.flyTo("market"); r.step(6);
    expect(r.cam.position.distanceTo(a)).toBeGreaterThan(20);
  });
  test("it arrives exactly and takes flightSeconds(dist)", () => {
    const r = rig("hero"), to = r.tour.stops.find((s) => s.id === "market").drone.pos, from = r.cam.position.clone();
    const dist = from.distanceTo(new THREE.Vector3(...to));
    r.tour.flyTo("market"); let n = 0; while (r.tour.flying && n < 2000) { r.step(); n++; }
    expect(n * DT).toBeGreaterThanOrEqual(flightSeconds(dist) - DT); expect(n * DT).toBeLessThanOrEqual(flightSeconds(dist) + 2 * DT);
    expect(r.cam.position.distanceTo(new THREE.Vector3(...to))).toBeLessThan(0.01);
  });
  test("a retarget (stop() then flyTo(), as the HUD does) keeps the camera's velocity: the speed never changes by more than 15 % of its old value between two frames (it was 124 m/s -> 0 in one frame)", () => {
    const r = rig("hero");
    r.tour.flyTo("kanae"); r.step(90);
    const before = r.speeds.at(-1);
    r.tour.stop(); r.tour.flyTo("market"); r.step(45);
    const after = r.speeds.slice(90, 135);
    expect(before).toBeGreaterThan(100);
    expect(Math.abs(after[0] - before)).toBeLessThan(before * 0.15);
    for (let i = 1; i < after.length; i++) expect(Math.abs(after[i] - after[i - 1])).toBeLessThan(before * 0.15);
    expect(Math.min(...after)).toBeGreaterThan(before * 0.2);
  });
  test("the view pans and tilts the short way, no whip (the old look-point lerp spun 22 deg per frame and 320 deg of yaw for a 39.5 deg turn, hero to かなえ大橋, and tipped to -87 deg)", () => {
    const r = rig("hero"), d = new THREE.Vector3();
    const yp = () => { r.cam.updateMatrixWorld(true); r.cam.getWorldDirection(d); return [Math.atan2(-d.x, -d.z), Math.atan2(d.y, Math.hypot(d.x, d.z))]; };
    let [py] = yp(); const y0 = py; let total = 0, maxStep = 0, steepest = 0;
    r.tour.flyTo("kanae");
    while (r.tour.flying) { r.step(); const [y, pitch] = yp(); let dy = y - py; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); total += Math.abs(dy); maxStep = Math.max(maxStep, Math.abs(dy)); steepest = Math.min(steepest, pitch); py = y; }
    let net = py - y0; net = Math.atan2(Math.sin(net), Math.cos(net));
    expect(maxStep * 180 / Math.PI).toBeLessThan(2);
    expect(total).toBeLessThan(Math.abs(net) + 5 * Math.PI / 180);
    expect(steepest * 180 / Math.PI).toBeGreaterThan(-55);
  });
  test("it arrives looking exactly along the framing (the direction to 0.01 deg, not only the position)", () => {
    const r = rig("hero"), s = r.tour.stops.find((x) => x.id === "market").drone, d = new THREE.Vector3();
    r.tour.flyTo("market"); while (r.tour.flying) r.step();
    r.cam.updateMatrixWorld(true); r.cam.getWorldDirection(d);
    const want = new THREE.Vector3(s.look[0] - s.pos[0], s.look[1] - s.pos[1], s.look[2] - s.pos[2]).normalize();
    expect(d.angleTo(want) * 180 / Math.PI).toBeLessThan(0.01);
  });
  test("however the visitor is looking when they pick a place (exactly away from it, a degree off, straight up or down) the view turns the short way: under 3 deg of yaw and 2 deg of pitch per frame, at most half a turn in all (a slerp flipped 180 deg in one frame when the two directions were exactly opposite)", () => {
    const d = new THREE.Vector3(), deg = Math.PI / 180;
    const s = rig("hero").tour.stops.find((x) => x.id === "market").drone;
    const y1 = Math.atan2(-(s.look[0] - s.pos[0]), -(s.look[2] - s.pos[2])), p1 = Math.atan2(s.look[1] - s.pos[1], Math.hypot(s.look[0] - s.pos[0], s.look[2] - s.pos[2]));
    const yp = (cam) => { cam.updateMatrixWorld(true); cam.getWorldDirection(d); return [Math.atan2(-d.x, -d.z), Math.atan2(d.y, Math.hypot(d.x, d.z))]; };
    // [yaw offset from the framing's own direction, pitch]: 180 = looking exactly away from the destination's framing
    const starts = [[180, -p1 / deg], [180, -p1 / deg + 1], [180.5, -p1 / deg + 1], [179, -p1 / deg - 1], [135, 0], [90, 0], [0, 80], [0, -80], [270, 45]];
    for (const [turn, pitch] of starts) {
      const r = rig("hero"); r.cam.rotation.set(pitch * deg, y1 + turn * deg, 0, "YXZ");
      let [py, pp] = yp(r.cam); const y0 = py; let total = 0, maxYaw = 0, maxPitch = 0;
      r.tour.flyTo("market");
      while (r.tour.flying) { r.step(); const [y, p] = yp(r.cam); let dy = y - py; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); total += Math.abs(dy); maxYaw = Math.max(maxYaw, Math.abs(dy)); maxPitch = Math.max(maxPitch, Math.abs(p - pp)); py = y; pp = p; }
      let net = py - y0; net = Math.atan2(Math.sin(net), Math.cos(net));
      expect(maxYaw / deg).toBeLessThan(3); expect(maxPitch / deg).toBeLessThan(2);
      expect(total / deg).toBeLessThan(Math.abs(net) / deg + 2);
      expect(Math.abs(net) / deg).toBeLessThan(180.01);
    }
  });
  test("a flight started from rest after a pause carries nothing (a fresh ease-out)", () => {
    const r = rig("hero"); r.tour.flyTo("pier7"); while (r.tour.flying) r.step(); r.step(60);
    r.tour.flyTo("market"); r.step(1);
    expect(r.speeds.at(-1)).toBeGreaterThan(50);   // it starts at s0 x the mean speed, not at 0
  });
  test("skip(): far from the destination the caller's cut hides the jump; near it a 0.25 s settle; never while the auto tour plays", () => {
    const r = rig("hero"); r.tour.flyTo("kanae"); r.step(60);
    let cuts = 0; expect(r.tour.skip((fn) => { cuts++; fn(); })).toBe(true);
    expect(cuts).toBe(1); expect(r.tour.flying).toBe(false);
    const to = r.tour.stops.find((s) => s.id === "kanae").drone.pos; expect(r.cam.position.distanceTo(new THREE.Vector3(...to))).toBeLessThan(0.01);
    const q = rig("hero"); q.tour.flyTo("ukimido"); q.step(100);   // close to the end: settles, no cut
    let c2 = 0; q.tour.skip((fn) => { c2++; fn(); }); let n = 0; while (q.tour.flying && n < 100) { q.step(); n++; }
    expect(c2).toBe(0); expect(n * DT).toBeLessThan(0.4);
    const p = rig("hero"); p.tour.play(); p.step(5); expect(p.tour.skip()).toBe(false);
  });
});

// ------------------------------------------------------------------ what the port adds to the prototype
const oldCinematic = (d) => Math.min(11, Math.max(3.2, 2.2 + Math.sqrt(d) * 0.16));   // the formula every flight used before row 3
const deg = Math.PI / 180;
const dirOf = (cam, d = new THREE.Vector3()) => { cam.updateMatrixWorld(true); cam.getWorldDirection(d); return [Math.atan2(-d.x, -d.z), Math.atan2(d.y, Math.hypot(d.x, d.z))]; };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

describe("the auto tour keeps its cinematic length, order and dwell", () => {
  test("every leg of the tour takes the old formula's time (3.2 to 11 s), and the camera dwells 7.5 s before the next one", () => {
    const r = rig("hero"), stops = r.tour.stops;
    r.tour.play();
    let at = 0;
    for (let leg = 1; leg <= stops.length - 1; leg++) {
      const to = stops[leg].drone, dist = r.cam.position.distanceTo(new THREE.Vector3(...to.pos));
      expect(r.tour.current).toBe(stops[leg].id);
      let n = 0; while (r.tour.flying && n < 2000) { r.step(); n++; }
      expect(n * DT).toBeGreaterThanOrEqual(oldCinematic(dist) - DT); expect(n * DT).toBeLessThanOrEqual(oldCinematic(dist) + 2 * DT);
      expect(r.cam.position.distanceTo(new THREE.Vector3(...to.pos))).toBeLessThan(0.01);   // exact arrival
      let dwell = 0; while (!r.tour.flying && dwell < 2000) { r.step(); dwell++; }
      expect(dwell * DT).toBeGreaterThan(7.5 - 2 * DT); expect(dwell * DT).toBeLessThan(7.5 + 3 * DT);
      at += n * DT + dwell * DT;
    }
    expect(at).toBeGreaterThan(30);
  });
  test("a cinematic flight starts softly (a smoothstep, not the 1.2x push of a place pick), and a pick pushes at once", () => {
    const auto = rig("hero"); auto.tour.play(); auto.step(1);
    const pick = rig("hero"); pick.tour.flyTo("ukimido"); pick.step(1);
    const meanAuto = auto.cam.position.distanceTo(new THREE.Vector3(...auto.tour.stops[1].drone.pos));   // (the first frame has moved a fraction of that)
    expect(auto.speeds.at(-1)).toBeLessThan(pick.speeds.at(-1) / 10);
    expect(auto.speeds.at(-1)).toBeLessThan(meanAuto / oldCinematic(meanAuto) * 0.05);
  });
  test("the tour's turns are smooth too: no leg whips the view (under 3 deg of yaw and 2 deg of pitch per frame; the old lerp spun up to 22 deg)", () => {
    const stops = rig("hero").tour.stops;
    for (let i = 0; i < stops.length - 1; i++) {
      const r = rig(stops[i].id); r.tour.play();
      let [py, pp] = dirOf(r.cam), maxYaw = 0, maxPitch = 0;
      while (r.tour.flying || r.tour.current === stops[i].id) { r.step(); const [y, p] = dirOf(r.cam); maxYaw = Math.max(maxYaw, Math.abs(wrap(y - py))); maxPitch = Math.max(maxPitch, Math.abs(p - pp)); py = y; pp = p; if (r.speeds.length > 3000) break; }
      expect([stops[i].id, maxYaw / deg < 3]).toEqual([stops[i].id, true]); expect([stops[i].id, maxPitch / deg < 2]).toEqual([stops[i].id, true]);
    }
  });
  test("play() and the dwell timer ask for the cinematic length (the two call sites); a pick asks for none", () => {
    const src = readFileSync(join(resolve(import.meta.dir, ".."), "src/anime/world/life/tour.js"), "utf8");
    const code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    expect((code.match(/\{ cinematic: true \}/g) || []).length).toBe(2);
    expect(src).toContain("function play() { state.playing = true; const i = stops.findIndex((s) => s.id === state.current); flyTo(stops[(i + 1) % stops.length].id, { cinematic: true }); emit(); }");
  });
});

describe("through the real Player and the frame order of main.js (player.update, then the tour)", () => {
  // the app drives the camera through ctx.playerObj.setPose (not cam.lookAt); the other tests use the bare-camera fallback of setCam
  function playerRig(from = "hero") {
    globalThis.addEventListener ??= () => {};
    const dom = { addEventListener() {}, requestPointerLock() {} };
    const physics = { groundHeight: () => 0, resolve() {}, standable: () => true, isWater: () => false };
    const ctx = fakeCtx(); ctx.playerObj = new Player(ctx.camera, dom, physics, { x0: -1e5, x1: 1e5, z0: -1e5, z1: 1e5 });
    const tour = createTour(ctx); tour.jumpTo(from);
    const frame = () => { ctx.playerObj.update(DT); tour.update(DT); };
    return { ctx, tour, frame, cam: ctx.camera, player: ctx.playerObj };
  }
  test("a whole flight puts the camera exactly where the bare-camera run puts it, frame by frame (position to a millimetre, view to a hundredth of a degree)", () => {
    for (const [a, b] of [["hero", "kanae"], ["pier7", "market"], ["hero", "ukimido"]]) {
      const r = playerRig(a), q = rig(a); r.tour.flyTo(b); q.tour.flyTo(b);
      const d1 = new THREE.Vector3(), d2 = new THREE.Vector3(); let n = 0, worstPos = 0, worstDir = 0;
      while (q.tour.flying && n < 2000) {
        r.frame(); q.step(); n++;
        worstPos = Math.max(worstPos, r.cam.position.distanceTo(q.cam.position));
        r.cam.updateMatrixWorld(true); q.cam.updateMatrixWorld(true); r.cam.getWorldDirection(d1); q.cam.getWorldDirection(d2); worstDir = Math.max(worstDir, d1.angleTo(d2) / deg);
      }
      expect(r.tour.flying).toBe(false);
      expect(worstPos).toBeLessThan(0.001); expect(worstDir).toBeLessThan(0.01);
    }
  });
  test("the real player never sees a whip either (yaw per frame under 2 degrees on hero to かなえ大橋), the flight is a free camera, and it arrives on the framing", () => {
    const r = playerRig("hero"); r.tour.flyTo("kanae");
    let [py] = dirOf(r.cam), max = 0, n = 0;
    while (r.tour.flying && n < 2000) { r.frame(); const [y] = dirOf(r.cam); max = Math.max(max, Math.abs(wrap(y - py))); py = y; n++; }
    expect(max / deg).toBeLessThan(2); expect(r.player.fly).toBe(true);
    const s = r.tour.stops.find((x) => x.id === "kanae").drone;
    expect(r.cam.position.distanceTo(new THREE.Vector3(...s.pos))).toBeLessThan(0.01);
    expect(r.player.yaw / deg).toBeCloseTo(Math.atan2(-(s.look[0] - s.pos[0]), -(s.look[2] - s.pos[2])) / deg, 1);
  });
  test("a retarget and a skip through the real player: the speed carries over and the cut lands on the framing", () => {
    const r = playerRig("hero"); r.tour.flyTo("kanae");
    const prev = r.cam.position.clone(), sp = [];
    for (let i = 0; i < 90; i++) { r.frame(); sp.push(r.cam.position.distanceTo(prev) / DT); prev.copy(r.cam.position); }
    const before = sp.at(-1); r.tour.stop(); r.tour.flyTo("market");
    for (let i = 0; i < 20; i++) { r.frame(); sp.push(r.cam.position.distanceTo(prev) / DT); prev.copy(r.cam.position); }
    expect(before).toBeGreaterThan(100);
    expect(Math.abs(sp[90] - before)).toBeLessThan(before * 0.15);
    let cuts = 0; expect(r.tour.skip((fn) => { cuts++; fn(); })).toBe(true); expect(cuts).toBe(1);
    const s = r.tour.stops.find((x) => x.id === "market").drone;
    expect(r.cam.position.distanceTo(new THREE.Vector3(...s.pos))).toBeLessThan(0.01);
    r.frame(); expect(r.cam.position.distanceTo(new THREE.Vector3(...s.pos))).toBeLessThan(0.01);   // a frame later the player does not move it
  });
});

describe("every pair of the built-in stops, landscape and portrait, picks and the auto tour", () => {
  const sweep = (aspect, opts) => {
    const mk = () => ({ L, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(55, aspect, 0.1, 30000), sunDir: new THREE.Vector3(0, 1, 0), services: {}, quality: { name: "high" } });
    const ids = createTour(mk()).stops.map((s) => s.id);
    const w = { yaw: 0, pitch: 0, steep: 0, lo: 99, hi: 0, pairs: 0 };
    for (const a of ids) for (const b of ids) if (a !== b) {
      const ctx = mk(), t = createTour(ctx); t.jumpTo(a);
      let [py, pp] = dirOf(ctx.camera), n = 0; t.flyTo(b, opts);
      while (t.flying && n < 3000) { t.update(DT); const [y, p] = dirOf(ctx.camera); w.yaw = Math.max(w.yaw, Math.abs(wrap(y - py))); w.pitch = Math.max(w.pitch, Math.abs(p - pp)); w.steep = Math.min(w.steep, p); py = y; pp = p; n++; }
      w.lo = Math.min(w.lo, n * DT); w.hi = Math.max(w.hi, n * DT); w.pairs++;
    }
    return w;
  };
  test("landscape: all 42 ordered pairs of the 7 stops: picks take 1.8 to 4.5 s with under 2 deg of yaw and pitch per frame and a pitch above -55 deg; as the auto tour they take 3.2 to 11 s with the same bounds", () => {
    const pick = sweep(16 / 9, {}), tour = sweep(16 / 9, { cinematic: true });
    expect(pick.pairs).toBe(42); expect(tour.pairs).toBe(42);
    for (const w of [pick, tour]) { expect(w.yaw / deg).toBeLessThan(2); expect(w.pitch / deg).toBeLessThan(2); expect(w.steep / deg).toBeGreaterThan(-55); }
    expect(pick.lo).toBeGreaterThanOrEqual(1.8 - DT); expect(pick.hi).toBeLessThanOrEqual(4.5 + 2 * DT);
    expect(tour.lo).toBeGreaterThanOrEqual(3.2 - DT); expect(tour.hi).toBeLessThanOrEqual(11 + 2 * DT);
  });
  test("portrait (a phone: hero takes its own steeper framing): the same bounds", () => {
    const had = Object.getOwnPropertyDescriptor(globalThis, "window");
    globalThis.window = { innerWidth: 390, innerHeight: 844 };
    try {
      const pick = sweep(390 / 844, {}), tour = sweep(390 / 844, { cinematic: true });
      for (const w of [pick, tour]) { expect(w.pairs).toBe(42); expect(w.yaw / deg).toBeLessThan(2); expect(w.pitch / deg).toBeLessThan(2); expect(w.steep / deg).toBeGreaterThan(-55); }
    } finally { if (had) Object.defineProperty(globalThis, "window", had); else delete globalThis.window; }
  });
});

describe("skip(): finishing a flight", () => {
  test("it answers false when nothing flies, and true once per flight", () => {
    const r = rig("hero");
    expect(r.tour.skip()).toBe(false); expect(r.tour.skip((fn) => fn())).toBe(false);
    r.tour.flyTo("market"); r.step(5);
    expect(r.tour.skip()).toBe(true);
    while (r.tour.flying) r.step();
    expect(r.tour.skip()).toBe(false);
  });
  test("far with a veil: the cut runs the jump itself (the flight is gone at once, the camera is on the framing), and the tour emits so the HUD can follow", () => {
    const r = rig("hero"); let emits = 0; r.tour.onChange(() => emits++);
    r.tour.flyTo("kanae"); r.step(30); const e0 = emits;
    let ran = false;
    r.tour.skip((fn) => { expect(r.tour.flying).toBe(true); fn(); ran = true; });
    expect(ran).toBe(true); expect(r.tour.flying).toBe(false); expect(emits).toBe(e0 + 1);
    const s = r.tour.stops.find((x) => x.id === "kanae").drone, d = new THREE.Vector3();
    expect(r.cam.position.distanceTo(new THREE.Vector3(...s.pos))).toBeLessThan(0.01);
    r.cam.updateMatrixWorld(true); r.cam.getWorldDirection(d);
    expect(d.angleTo(new THREE.Vector3(s.look[0] - s.pos[0], s.look[1] - s.pos[1], s.look[2] - s.pos[2]).normalize()) / deg).toBeLessThan(0.01);
  });
  test("the veil's cut runs late (a dip of about 120 ms): a place picked meanwhile is not cancelled, and a flight that ended meanwhile is left alone", () => {
    const r = rig("hero"); r.tour.flyTo("kanae"); r.step(30);
    let late = null; r.tour.skip((fn) => { late = fn; });
    r.tour.stop(); r.tour.flyTo("market"); r.step(6);            // the visitor picks another place during the dip
    const mid = r.cam.position.clone();
    late();
    expect(r.tour.flying).toBe(true); expect(r.cam.position.distanceTo(mid)).toBe(0);   // the new flight runs on, the camera did not jump to かなえ大橋
    const w = rig("hero"); w.tour.flyTo("kanae"); w.step(30);
    let late3 = null; w.tour.skip((fn) => { late3 = fn; });
    while (w.tour.flying) w.step();                              // the flight ends by itself before the veil is down
    let emits = 0; w.tour.onChange(() => emits++); late3();
    expect(emits).toBe(0);
    expect(w.cam.position.distanceTo(new THREE.Vector3(...w.tour.stops.find((x) => x.id === "kanae").drone.pos))).toBeLessThan(0.01);
  });
  test("a veil that is never called (the caller decided not to cut) leaves the flight running; skip() with no veil at all glides instead: 0.25 s near, up to 1.2 s from far away, straight, and the view never whips", () => {
    const r = rig("hero"); r.tour.flyTo("kanae"); r.step(30);
    r.tour.skip(() => { /* does not run fn */ });
    expect(r.tour.flying).toBe(true);
    const q = rig("hero"); q.tour.flyTo("kanae"); q.step(30);
    const rest = q.cam.position.distanceTo(new THREE.Vector3(...q.tour.stops.find((x) => x.id === "kanae").drone.pos));
    expect(rest).toBeGreaterThan(1500);
    expect(q.tour.skip()).toBe(true);
    let n = 0; while (q.tour.flying && n < 200) { q.step(); n++; }
    expect(n * DT).toBeGreaterThan(0.9); expect(n * DT).toBeLessThanOrEqual(1.2 + 2 * DT);     // 0.25 + rest / 1500, capped
    const to = q.tour.stops.find((x) => x.id === "kanae").drone.pos;
    expect(q.cam.position.distanceTo(new THREE.Vector3(...to))).toBeLessThan(0.01);
    // worst case for the view: looking exactly away from the destination's framing when the visitor presses a key
    const s = q.tour.stops.find((x) => x.id === "kanae").drone, y1 = Math.atan2(-(s.look[0] - s.pos[0]), -(s.look[2] - s.pos[2]));
    const w = rig("hero"); w.tour.flyTo("kanae"); w.step(30); w.cam.rotation.set(0, y1 + Math.PI, 0, "YXZ");
    w.tour.stop(); w.tour.flyTo("kanae"); w.step(12);   // (a retarget to the same place, then skip: the far glide starts from a view that points the wrong way)
    let [py] = dirOf(w.cam), maxYaw = 0; w.tour.skip(); let m = 0;
    while (w.tour.flying && m < 200) { w.step(); const [y] = dirOf(w.cam); maxYaw = Math.max(maxYaw, Math.abs(wrap(y - py))); py = y; m++; }
    expect(maxYaw / deg).toBeLessThan(5);
  });
  test("a short hop skipped at its very start, with the view pointing the wrong way, takes the time the turn needs (not a quarter of a second); a late skip with the view on target stays a quarter of a second", () => {
    const hop = rig("hero"); hop.tour.flyTo("ukimido"); hop.step(2);
    const s = hop.tour.stops.find((x) => x.id === "ukimido").drone, y1 = Math.atan2(-(s.look[0] - s.pos[0]), -(s.look[2] - s.pos[2]));
    hop.cam.rotation.set(0, y1 + Math.PI, 0, "YXZ"); hop.tour.stop(); hop.tour.flyTo("ukimido"); hop.step(2);
    let [py] = dirOf(hop.cam), maxYaw = 0, n = 0; hop.tour.skip();
    while (hop.tour.flying && n < 200) { hop.step(); const [y] = dirOf(hop.cam); maxYaw = Math.max(maxYaw, Math.abs(wrap(y - py))); py = y; n++; }
    expect(n * DT).toBeGreaterThan(0.9); expect(n * DT).toBeLessThanOrEqual(1.2 + 2 * DT);
    expect(maxYaw / deg).toBeLessThan(5);
    const late = rig("hero"); late.tour.flyTo("ukimido"); late.step(110);
    late.tour.skip(); let m = 0; while (late.tour.flying && m < 200) { late.step(); m++; }
    expect(m * DT).toBeLessThan(0.3);
  });
  test("the settle is a straight glide: no lifted arc (the flight's own lift would hump the camera 30 m or more in a quarter of a second)", () => {
    const r = rig("hero"); r.tour.flyTo("ukimido"); r.step(100);
    const a = r.cam.position.clone(), to = new THREE.Vector3(...r.tour.stops.find((x) => x.id === "ukimido").drone.pos);
    r.tour.skip();
    const line = new THREE.Line3(a, to), tmp = new THREE.Vector3(); let off = 0, n = 0;
    while (r.tour.flying && n < 100) { r.step(); line.closestPointToPoint(r.cam.position, true, tmp); off = Math.max(off, tmp.distanceTo(r.cam.position)); n++; }
    expect(off).toBeLessThan(1.5);   // (the speed carried from the flight bends the first frames a little; a lifted arc would be 30 m or more)
    expect(n * DT).toBeLessThan(0.4);
  });
});

describe("retargets, cuts and other targets", () => {
  test("flyTo over a flight in progress, without stop() (explore does stop() first, other callers may not), keeps the speed as well", () => {
    const r = rig("hero"); r.tour.flyTo("kanae"); r.step(90);
    const before = r.speeds.at(-1);
    r.tour.flyTo("market"); r.step(45);
    const after = r.speeds.slice(90, 135);
    expect(Math.abs(after[0] - before)).toBeLessThan(before * 0.15);
    for (let i = 1; i < after.length; i++) expect(Math.abs(after[i] - after[i - 1])).toBeLessThan(before * 0.15);
  });
  test("three retargets 300 ms apart curve to each new target and never brake to a stop between them", () => {
    const r = rig("hero"); const ids = ["market", "pier7", "kanae"];
    r.tour.flyTo("ukimido"); r.step(18);
    for (const id of ids) { r.tour.stop(); r.tour.flyTo(id); r.step(18); }
    const sp = r.speeds.slice(18);
    expect(Math.min(...sp)).toBeGreaterThan(20);
    for (let i = 1; i < sp.length; i++) expect(Math.abs(sp[i] - sp[i - 1])).toBeLessThan(Math.max(sp[i - 1], 60) * 0.25);
  });
  test("a cut (jumpTo, walkTo) between two flights carries no velocity into the next one", () => {
    const fresh = rig("hero"); fresh.tour.flyTo("market"); fresh.step(1);
    for (const cutName of ["jumpTo", "walkTo"]) {
      const r = rig("hero"); r.tour.flyTo("kanae"); r.step(90);
      expect(r.speeds.at(-1)).toBeGreaterThan(100);
      r.tour[cutName]("hero"); r.cam.position.set(428, 126, 130);
      r.step(1);
      r.tour.flyTo("market"); const before = r.cam.position.clone(); r.tour.update(DT);
      expect(r.cam.position.distanceTo(before) / DT).toBeCloseTo(fresh.speeds.at(-1), 0);   // the first frame of a flight from rest
    }
  });
  test("a flight to a { pos, look } that is not a stop (the map, the places explore adds) flies, retargets and arrives exactly", () => {
    const r = rig("hero"), to = { pos: [900, 60, 400], look: [700, 10, 250] };
    r.tour.flyTo(to); let n = 0; while (r.tour.flying && n < 2000) { r.step(); n++; }
    expect(r.cam.position.distanceTo(new THREE.Vector3(...to.pos))).toBeLessThan(0.01);
    expect(n * DT).toBeGreaterThanOrEqual(flightSeconds(r.cam.position.distanceTo(new THREE.Vector3(428, 126, 130))) - 0.1);
    // not a flight: nothing, an unknown id (it used to throw), a target without a view
    expect(r.tour.flyTo(null)).toBeUndefined(); expect(r.tour.flyTo("nowhere")).toBeUndefined(); expect(r.tour.flyTo({ pos: [1, 2, 3] })).toBeUndefined(); expect(r.tour.flying).toBe(false);
  });
  test("two runs of the same flight give the same camera, frame for frame (no clock, no random)", () => {
    const run = () => { const r = rig("hero"), out = []; r.tour.flyTo("kanae"); for (let i = 0; i < 120; i++) { r.step(); out.push(r.cam.position.toArray(), r.cam.quaternion.toArray()); } return JSON.stringify(out); };
    expect(run()).toBe(run());
    const src = readFileSync(join(resolve(import.meta.dir, ".."), "src/anime/world/life/tour.js"), "utf8");
    expect(src).not.toMatch(/Math\.random\(|Date\.now\(|performance\.now\(|new Date\(/);
  });
});

describe("what did not change", () => {
  test("the film path is bit-for-bit the old one (scripts/render/film.js renders a deterministic film from it)", () => {
    const t = createTour(fakeCtx());
    const gold = {
      0: { pos: [620, 260, 420], look: [120, 0, -120] },
      7.5: { pos: [350.0399146594377, 72.4956539173261, 35.491095322661835], look: [70.34461047614965, 9.478660710408295, -210.5563049240534] },
      15: { pos: [271.6, 14, 6.6], look: [341.6, 3, -23.4] },
      30: { pos: [-120, 180, 420], look: [300, 0, -60] },
    };
    for (const [at, g] of Object.entries(gold)) {
      const p = t.filmPose(Number(at));
      for (let i = 0; i < 3; i++) { expect(p.pos[i]).toBeCloseTo(g.pos[i], 9); expect(p.look[i]).toBeCloseTo(g.look[i], 9); }
    }
  });
  test("the stops, the portrait framings and the HUD's hooks are as they were: stops, flyTo, jumpTo, walkTo, play, stop, update, add, onChange, flying, playing, current", () => {
    const t = createTour(fakeCtx());
    for (const k of ["stops", "flyTo", "skip", "jumpTo", "walkTo", "play", "stop", "update", "filmPose", "applyFilm", "add", "onChange"]) expect([k, k in t]).toEqual([k, true]);
    expect([t.flying, t.playing, t.current]).toEqual([false, false, "hero"]);
    expect(t.stops.length).toBeGreaterThan(4);
  });
  test("stop() ends a flight (explore's walk-to-place relies on it) and keeps the velocity for the retarget that follows", () => {
    const r = rig("hero"); r.tour.flyTo("kanae"); r.step(30);
    r.tour.stop(); expect(r.tour.flying).toBe(false);
    r.step(3);
    const p = r.cam.position.clone(); r.step(3);
    expect(r.cam.position.distanceTo(p)).toBe(0);   // nothing moves it any more
  });
});

describe("the numbers in the UI round notes (ui-c, not included)", () => {
  test("the curve: 1 % of the path at 0.8 % of the time (the cubic took 13.6 %), peak speed 1.35x the mean, half way at 38 % of the time", () => {
    const at = (x) => { let lo = 0, hi = 1; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (easeFly(m) < x) lo = m; else hi = m; } return lo; };
    expect(at(0.01)).toBeCloseTo(0.008, 3); expect(at(0.05)).toBeCloseTo(0.041, 3); expect(at(0.5)).toBeCloseTo(0.381, 3); expect(at(0.99)).toBeCloseTo(0.924, 3);
    let peak = 0; for (let i = 0; i <= 1000; i++) peak = Math.max(peak, (easeFly((i + 1) / 1000) - easeFly(i / 1000)) * 1000);
    expect(peak).toBeCloseTo(1.35, 2);
    const cubic = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
    let lo = 0, hi = 1; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (cubic(m) < 0.01) lo = m; else hi = m; }
    expect(lo).toBeCloseTo(0.136, 3);
  });
  test("durations of picks across the real stops: 1.8 to 4.5 s (they were 3.2 to 11 s)", () => {
    const r = rig("hero"), pts = r.tour.stops.map((s) => new THREE.Vector3(...s.drone.pos));
    for (let i = 0; i < pts.length; i++) for (let j = 0; j < pts.length; j++) if (i !== j) {
      const d = pts[i].distanceTo(pts[j]);
      expect(flightSeconds(d)).toBeGreaterThanOrEqual(1.8); expect(flightSeconds(d)).toBeLessThanOrEqual(4.5);
      expect(flightSeconds(d)).toBeLessThanOrEqual(oldCinematic(d));
    }
  });
});
