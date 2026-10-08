// [ui-c] Row 10: iPhone survival, WebGL context loss (src/anime/core/survive.js, mobile review F10 / T2).
// The state machine as a pure reducer, its runtime against fake event targets, the saved pose coming back on the next load, the card, and
// the wiring in main.js. The real thing (WEBGL_lose_context on the phone tier: card, reload, a working frame loop) is checked through the
// machine gate in test/survive.e2e.test.js.
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import * as THREE from "three";
import {
  SURVIVE, initialLoss, lossStep, mayAutoReload, createLossGuard, sessionStore, takeResume, resumeView, placeCamera, resumeClock, resumeSeason,
  LOST_CARD_HTML, LOST_CARD_CSS, createLostCard,
} from "../src/anime/core/survive.js";
import { capturePose, poseToCamArgs } from "../src/anime/core/pose.js";
import { Player } from "../src/anime/core/player.js";

const ROOT = resolve(import.meta.dir, "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const T0 = 1_000_000;

/** run events through the reducer; returns every { s, fx } step */
function drive(events, { s = initialLoss(), reloads = [] } = {}) {
  const out = [];
  for (const e of events) { const r = lossStep(s, typeof e === "string" ? { type: e, t: T0 } : e, { reloads }); out.push(r); s = r.s; }
  return out;
}

describe("lossStep: the state machine", () => {
  test("a page that never lost its context ignores everything but a lost event", () => {
    for (const type of ["restored", "tick", "tap", "visible", "hidden"]) {
      const [r] = drive([type]);
      expect(r.s.phase).toBe("ok"); expect(r.fx).toEqual([]);
    }
  });
  test("lost: the pose is saved and the restore-wait timer is armed; the phase is lost and the loss is counted", () => {
    const [r] = drive(["lost"]);
    expect(r.s).toMatchObject({ phase: "lost", count: 1, lostAt: T0, restored: false });
    expect(r.fx).toEqual(["save", "arm"]);
  });
  test("lost while the page is hidden (the phone is locked): saved, but no timer until the visitor can see the page again", () => {
    const r = drive([{ type: "hidden", t: T0 }, "lost", { type: "visible", t: T0 + 5000 }]);
    expect(r[1].fx).toEqual(["save"]);
    expect(r[2].fx).toEqual(["arm"]); expect(r[2].s.phase).toBe("lost"); expect(r[2].s.visible).toBe(true);
  });
  test("hiding the page during the wait stops the timer", () => {
    const r = drive(["lost", "hidden"]);
    expect(r[1].fx).toEqual(["disarm"]); expect(r[1].s.visible).toBe(false);
  });
  test("restored on a lost page: reload at once, and remember the automatic reload", () => {
    const [, r] = drive(["lost", "restored"]);
    expect(r.s).toMatchObject({ phase: "reloading", restored: true });
    expect(r.fx).toEqual(["disarm", "stamp", "reload"]);
  });
  test("the wait running out on a visible page reloads too (a browser that never gives the context back); on a hidden page it does nothing", () => {
    const [, tick] = drive(["lost", "tick"]);
    expect(tick.s.phase).toBe("reloading"); expect(tick.fx).toEqual(["disarm", "stamp", "reload"]); expect(tick.s.restored).toBe(false);
    const r = drive(["lost", "hidden", "tick"]);
    expect(r[2].s.phase).toBe("lost"); expect(r[2].fx).toEqual([]);
  });
  test("a reload loop is refused: two automatic reloads inside the window leave the card up, waiting for a tap (manual)", () => {
    const recent = [T0 - 30_000, T0 - 90_000];
    const r = drive(["lost", "restored"], { reloads: recent });
    expect(r[1].s.phase).toBe("manual"); expect(r[1].fx).toEqual(["disarm"]);
    expect(r[1].fx).not.toContain("reload"); expect(r[1].fx).not.toContain("stamp");
  });
  test("mayAutoReload: one recent reload is fine, two are not, and a reload older than the window no longer counts", () => {
    expect(mayAutoReload([], T0)).toBe(true);
    expect(mayAutoReload([T0 - 1000], T0)).toBe(true);
    expect(mayAutoReload([T0 - 1000, T0 - 2000], T0)).toBe(false);
    expect(mayAutoReload([T0 - 1000, T0 - SURVIVE.LOOP_WINDOW_MS], T0)).toBe(true);          // exactly a window old: out
    expect(mayAutoReload([T0 - 1000, T0 - SURVIVE.LOOP_WINDOW_MS + 1], T0)).toBe(false);     // a ms younger: in
    expect(mayAutoReload([NaN, "x", T0 + 5000, T0 - 1000], T0)).toBe(true);                    // garbage and future stamps are ignored
    expect(SURVIVE.LOOP_MAX).toBe(2);
  });
  test("manual: the button reloads (a human press is not a loop and is not stamped); a restore only notes itself", () => {
    const r = drive(["lost", "restored", "restored", "tap"], { reloads: [T0 - 1, T0 - 2] });
    expect(r[1].s.phase).toBe("manual");
    expect(r[2].s).toMatchObject({ phase: "manual", restored: true }); expect(r[2].fx).toEqual([]);
    expect(r[3].s.phase).toBe("reloading"); expect(r[3].fx).toEqual(["disarm", "reload"]);
  });
  test("lost again while waiting or after giving up is counted but saves nothing new and arms nothing", () => {
    const r = drive(["lost", "lost", "lost"]);
    expect(r[1].s.count).toBe(2); expect(r[1].fx).toEqual([]); expect(r[2].s.count).toBe(3);
  });
  test("a tap while the card is up reloads at once; a second tap retries (the first reload may not have taken); a tap on a healthy page does nothing", () => {
    const r = drive(["lost", "tap", "tap"]);
    expect(r[1].s.phase).toBe("reloading"); expect(r[1].fx).toEqual(["disarm", "reload"]);
    expect(r[2].fx).toEqual(["disarm", "reload"]);
  });
  test("once reloading, losses, restores and timer ticks change nothing", () => {
    const r = drive(["lost", "restored", "lost", "restored", "tick", "hidden", "visible"]);
    for (const step of r.slice(2, 5)) { expect(step.s.phase).toBe("reloading"); expect(step.fx).toEqual([]); }
    expect(r[6].s.phase).toBe("reloading"); expect(r[6].fx).toEqual([]);
  });
  test("pure: the input state is never mutated, and the same events give the same result", () => {
    const s0 = Object.freeze(initialLoss()), e = { type: "lost", t: T0 };
    const a = lossStep(s0, e, { reloads: [] }), b = lossStep(s0, e, { reloads: [] });
    expect(a).toEqual(b); expect(s0.phase).toBe("ok");
    expect(JSON.stringify(drive(["lost", "restored"]))).toBe(JSON.stringify(drive(["lost", "restored"])));
  });
});

describe("lossStep: invariants over thousands of seeded random event sequences", () => {
  // a small seeded generator (never Math.random): every run walks the same 3000 sequences
  const lcg = (seed) => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const TYPES = ["lost", "restored", "visible", "hidden", "tick", "tap"];
  test("the phase is always one of four, a reload is always followed by the reloading phase, an automatic reload is always stamped and never a tap's, the timer is only armed on a visible lost page, a save happens exactly on ok -> lost", () => {
    const rand = lcg(20261005);
    for (let run = 0; run < 3000; run++) {
      let s = initialLoss(rand() < 0.8), t = T0;
      const reloads = [];
      for (let i = 0, n = 1 + Math.floor(rand() * 14); i < n; i++) {
        const type = TYPES[Math.floor(rand() * TYPES.length)]; t += Math.floor(rand() * 20000);
        const before = s, r = lossStep(s, { type, t }, { reloads: [...reloads] });
        expect(["ok", "lost", "manual", "reloading"]).toContain(r.s.phase);
        if (r.fx.includes("reload")) { expect(r.s.phase).toBe("reloading"); expect(before.phase).not.toBe("ok"); }
        if (r.fx.includes("stamp")) { expect(r.fx).toContain("reload"); expect(["restored", "tick"]).toContain(type); reloads.push(t); }
        if (r.fx.includes("arm")) { expect(r.s.phase).toBe("lost"); expect(r.s.visible).toBe(true); }
        expect(r.fx.includes("save")).toBe(before.phase === "ok" && r.s.phase === "lost");
        expect(r.s.count).toBe(before.count + (type === "lost" && before.phase !== "reloading" ? 1 : 0));   // (a page already on its way to a reload counts nothing more)
        if (before.phase === "reloading" && type !== "tap") { expect(r.fx).toEqual([]); expect(r.s.phase).toBe("reloading"); }
        if (before.phase === "ok") expect(r.s.phase).toBe(type === "lost" ? "lost" : "ok");
        if (r.s.phase === "manual") expect(r.fx).not.toContain("reload");
        if (r.fx.includes("stamp")) expect(mayAutoReload(reloads.slice(0, -1), t)).toBe(true);   // the loop guard let it through
        s = r.s;
      }
    }
  });
  test("a page that keeps losing its context never reloads by itself more than twice in two minutes, however the events fall", () => {
    const rand = lcg(7);
    for (let run = 0; run < 500; run++) {
      let s = initialLoss(true), t = T0; const reloads = []; let auto = [];
      for (let i = 0; i < 40; i++) {
        const type = ["lost", "restored", "tick"][Math.floor(rand() * 3)]; t += Math.floor(rand() * 15000);
        const r = lossStep(s, { type, t }, { reloads: [...reloads] }); s = r.s;
        if (r.fx.includes("stamp")) { reloads.push(t); auto.push(t); s = initialLoss(true); }   // (the page reloaded: a fresh page starts ok)
        const recent = auto.filter((x) => t - x < SURVIVE.LOOP_WINDOW_MS);
        expect(recent.length).toBeLessThanOrEqual(SURVIVE.LOOP_MAX);
      }
    }
  });
});

// ------------------------------------------------------------------ the runtime, on fake event targets
function rig(over = {}) {
  const canvas = new EventTarget(), doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const mem = new Map(), clock = { t: T0 }, timers = [], rendered = [];
  const store = { get: (k) => (mem.has(k) ? mem.get(k) : null), set: (k, v) => (mem.set(k, v), true), remove: (k) => mem.delete(k), ...(over.store || {}) };
  const log = { reload: 0 };
  const guard = createLossGuard({
    canvas, doc, store, reload: () => { log.reload++; }, capture: over.capture || (() => ({ mode: "walk", enu: [1, 2, 3] })), ui: { render: (s) => rendered.push(s.phase) },
    now: () => clock.t, setTimer: (f, ms) => { timers.push({ f, ms, live: true }); return timers.length - 1; }, clearTimer: (id) => { if (timers[id]) timers[id].live = false; },
  });
  const lose = () => { const e = new Event("webglcontextlost", { cancelable: true }); canvas.dispatchEvent(e); return e; };
  const restore = () => canvas.dispatchEvent(new Event("webglcontextrestored"));
  const live = () => timers.filter((t) => t.live);
  return { canvas, doc, mem, clock, timers, rendered, store, log, guard, lose, restore, live };
}

describe("createLossGuard: the machine wired to a canvas, the page's visibility, storage and a timer", () => {
  test("webglcontextlost is cancelled (that is what lets the browser restore the context), the pose is stored, the card is asked for, the wait timer is armed", () => {
    const r = rig();
    expect(r.guard.phase).toBe("ok"); expect(r.guard.lost).toBe(false);
    const e = r.lose();
    expect(e.defaultPrevented).toBe(true);
    expect(r.guard.phase).toBe("lost"); expect(r.guard.lost).toBe(true); expect(r.guard.count).toBe(1);
    expect(r.rendered).toEqual(["lost"]);
    const saved = JSON.parse(r.mem.get(SURVIVE.RESUME_KEY));
    expect(saved).toEqual({ v: 1, why: "webgl-context-lost", at: T0, pose: { mode: "walk", enu: [1, 2, 3] } });
    expect(r.live().length).toBe(1); expect(r.live()[0].ms).toBe(SURVIVE.RESTORE_WAIT_MS);
  });
  test("restored: one reload, the reload is stamped for the loop guard, the card says reloading, the timer is gone, and later events do not reload again", () => {
    const r = rig();
    r.lose(); r.restore();
    expect(r.log.reload).toBe(1); expect(r.guard.phase).toBe("reloading"); expect(r.rendered).toEqual(["lost", "reloading"]);
    expect(JSON.parse(r.mem.get(SURVIVE.RELOADS_KEY))).toEqual([T0]);
    expect(r.live().length).toBe(0);
    r.restore(); r.lose();
    expect(r.log.reload).toBe(1);
  });
  test("no restore ever comes: the wait timer reloads (once) on a visible page", () => {
    const r = rig();
    r.lose();
    const t = r.live()[0]; t.f();
    expect(r.log.reload).toBe(1); expect(r.guard.phase).toBe("reloading");
  });
  test("lost while hidden: no timer until the page is visible again; hiding again stops it", () => {
    const r = rig();
    r.doc.visibilityState = "hidden"; r.doc.dispatchEvent(new Event("visibilitychange"));
    r.lose();
    expect(r.live().length).toBe(0);
    r.doc.visibilityState = "visible"; r.doc.dispatchEvent(new Event("visibilitychange"));
    expect(r.live().length).toBe(1);
    r.doc.visibilityState = "hidden"; r.doc.dispatchEvent(new Event("visibilitychange"));
    expect(r.live().length).toBe(0);
    expect(r.log.reload).toBe(0);
  });
  test("a page that starts hidden knows it", () => {
    const canvas = new EventTarget(), doc = Object.assign(new EventTarget(), { visibilityState: "hidden" });
    const g = createLossGuard({ canvas, doc, store: sessionStore(null), reload() {}, now: () => T0, setTimer: () => 1, clearTimer() {} });
    expect(g.state.visible).toBe(false);
  });
  test("the loop guard reads the stamps from storage: two recent automatic reloads and the next restore leaves the card up; the button still reloads", () => {
    const r = rig();
    r.mem.set(SURVIVE.RELOADS_KEY, JSON.stringify([T0 - 20_000, T0 - 60_000]));
    r.lose(); r.restore();
    expect(r.log.reload).toBe(0); expect(r.guard.phase).toBe("manual"); expect(r.rendered.at(-1)).toBe("manual");
    r.guard.tap();
    expect(r.log.reload).toBe(1); expect(r.guard.phase).toBe("reloading");
    expect(JSON.parse(r.mem.get(SURVIVE.RELOADS_KEY))).toEqual([T0 - 20_000, T0 - 60_000]);   // a tap is not stamped
  });
  test("old stamps are pruned when a new one is written", () => {
    const r = rig();
    r.mem.set(SURVIVE.RELOADS_KEY, JSON.stringify([T0 - 500_000, "junk"]));
    r.lose(); r.restore();
    expect(JSON.parse(r.mem.get(SURVIVE.RELOADS_KEY))).toEqual([T0]);
  });
  test("a pose that cannot be captured, or storage that refuses, never stops the reload", () => {
    const a = rig({ capture() { throw new Error("no camera"); } });
    a.lose(); a.restore();
    expect(a.mem.has(SURVIVE.RESUME_KEY)).toBe(false); expect(a.log.reload).toBe(1);
    const b = rig({ store: { set() { throw new Error("quota"); } } });
    b.lose(); b.restore();
    expect(b.log.reload).toBe(1); expect(b.guard.phase).toBe("reloading");
    const c = rig({ store: { get() { throw new Error("blocked"); } } });   // unreadable stamps count as none
    c.lose(); c.restore();
    expect(c.log.reload).toBe(1);
  });
  test("sessionStore never throws: blocked storage, a throwing getter, a full quota", () => {
    expect(sessionStore(null).get("x")).toBeNull(); expect(sessionStore(null).set("x", "1")).toBe(false); expect(() => sessionStore(null).remove("x")).not.toThrow();
    const blocked = { get sessionStorage() { throw new Error("SecurityError"); } };
    expect(sessionStore(blocked).get("x")).toBeNull(); expect(sessionStore(blocked).set("x", "1")).toBe(false);
    const full = { sessionStorage: { getItem() { return null; }, setItem() { throw new Error("QuotaExceededError"); }, removeItem() { throw new Error("x"); } } };
    expect(sessionStore(full).set("x", "1")).toBe(false); expect(() => sessionStore(full).remove("x")).not.toThrow();
    const ok = new Map(); const good = { sessionStorage: { getItem: (k) => ok.get(k) ?? null, setItem: (k, v) => ok.set(k, v), removeItem: (k) => ok.delete(k) } };
    expect(sessionStore(good).set("a", "b")).toBe(true); expect(sessionStore(good).get("a")).toBe("b"); sessionStore(good).remove("a"); expect(sessionStore(good).get("a")).toBeNull();
  });
  test("dispose removes the listeners and the timer", () => {
    const r = rig();
    r.lose(); r.guard.dispose();
    expect(r.live().length).toBe(0);
    r.restore();
    expect(r.log.reload).toBe(0);
    const again = new Event("webglcontextlost", { cancelable: true }); r.canvas.dispatchEvent(again);
    expect(again.defaultPrevented).toBe(false);   // nobody is listening any more
  });
});

// ------------------------------------------------------------------ the next load
const goodPose = (over = {}) => ({ enu: [428, 126, 130], latlon: [38.9, 141.57], heading: 262.5, pitch: -12.5, fov: 88, mode: "drone", at: "2026-10-05T09:00:00.000Z", timePreset: "yuyake", season: "winter", ...over });
const rec = (over = {}, at = T0) => JSON.stringify({ v: 1, why: "webgl-context-lost", at, pose: goodPose(), ...over });

describe("takeResume: the saved pose, once", () => {
  const mk = (raw) => { const m = new Map(raw === undefined ? [] : [[SURVIVE.RESUME_KEY, raw]]); return { m, store: { get: (k) => m.get(k) ?? null, remove: (k) => m.delete(k), set: (k, v) => m.set(k, v) } }; };
  test("a fresh record comes back with its age, and is consumed: a second read finds nothing", () => {
    const { m, store } = mk(rec());
    const r = takeResume({ store, now: T0 + 40_000 });
    expect(r).toMatchObject({ why: "webgl-context-lost", ageMs: 40_000 }); expect(r.pose.mode).toBe("drone");
    expect(m.has(SURVIVE.RESUME_KEY)).toBe(false);
    expect(takeResume({ store, now: T0 + 40_000 })).toBeNull();
  });
  test("too old (past five minutes), from the future, the wrong version, garbage, an invalid pose or nothing at all: null, and the record is removed anyway", () => {
    for (const [raw, now] of [[rec(), T0 + SURVIVE.MAX_AGE_MS + 1], [rec(), T0 - 5], [rec({ v: 2 }), T0 + 1], ["{not json", T0], [rec({ pose: goodPose({ heading: 400 }) }), T0 + 1], [rec({ pose: null }), T0 + 1], [rec({ at: "x" }), T0 + 1], ["null", T0]]) {
      const { m, store } = mk(raw);
      expect(takeResume({ store, now })).toBeNull();
      expect(m.has(SURVIVE.RESUME_KEY)).toBe(false);
    }
    expect(takeResume({ store: mk(undefined).store, now: T0 })).toBeNull();
    expect(takeResume({ store: null })).toBeNull();
    expect(takeResume({ store: mk(rec()).store, now: T0 + SURVIVE.MAX_AGE_MS }).ageMs).toBe(SURVIVE.MAX_AGE_MS);   // exactly five minutes is still in
  });
});

describe("what a saved pose puts back", () => {
  test("walk puts the visitor on the ground at the same x, z, yaw and pitch; drone and fly keep the height; the voyage and the car have no place to stand", () => {
    const walk = resumeView(goodPose({ mode: "walk" })), a = poseToCamArgs(goodPose());
    expect(walk).toEqual({ walk: true, x: a.x, y: a.y, z: a.z, yaw: a.yaw, pitch: a.pitch });
    expect(resumeView(goodPose({ mode: "drone" })).walk).toBe(false); expect(resumeView(goodPose({ mode: "fly" })).walk).toBe(false);
    expect(resumeView(goodPose({ mode: "sail" }))).toBeNull(); expect(resumeView(goodPose({ mode: "drive" }))).toBeNull(); expect(resumeView(null)).toBeNull();
    expect("fov" in resumeView(goodPose())).toBe(false);   // resize() owns the field of view
  });
  test("the time of day: a preset id, an off-preset clock, or nothing; the season only when it is one of ours", () => {
    expect(resumeClock(goodPose({ timePreset: "yoru" }))).toEqual({ preset: "yoru", hours: 19.5 });
    expect(resumeClock(goodPose({ timePreset: "17:05" }))).toEqual({ hours: 17 + 5 / 60 });
    expect(resumeClock(goodPose({ timePreset: "7:30" }))).toEqual({ hours: 7.5 });
    expect(resumeClock(goodPose({ timePreset: null }))).toBeNull(); expect(resumeClock(goodPose({ timePreset: "noon" }))).toBeNull(); expect(resumeClock(null)).toBeNull();
    expect(resumeSeason(goodPose({ season: "winter" }))).toBe("winter"); expect(resumeSeason(goodPose({ season: "monsoon" }))).toBeNull(); expect(resumeSeason(null)).toBeNull();
  });
  test("round trip through the real capture: the camera that was saved is the camera that is put back (to the 0.01 rounding of the pose)", () => {
    const cam = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 30000);
    cam.position.set(1234.5, 87.25, -310.75); cam.rotation.set(-0.31, 2.2, 0, "YXZ"); cam.updateMatrixWorld(true);
    const ctx = { camera: cam, playerObj: { fly: true }, services: { time: { preset: "yugata" }, season: { id: "autumn" } } };
    const pose = capturePose(ctx, { now: new Date("2026-10-05T09:00:00Z") });
    const m = new Map(); const store = { get: (k) => m.get(k) ?? null, set: (k, v) => m.set(k, v), remove: (k) => m.delete(k) };
    const g = createLossGuard({ canvas: new EventTarget(), doc: Object.assign(new EventTarget(), { visibilityState: "visible" }), store, reload() {}, capture: () => pose, now: () => T0, setTimer: () => 1, clearTimer() {} });
    g.state; // (the guard is only here to prove the same record shape is written and read: save by hand below)
    store.set(SURVIVE.RESUME_KEY, JSON.stringify({ v: 1, why: "webgl-context-lost", at: T0, pose }));
    const r = takeResume({ store, now: T0 + 1000 }), v = resumeView(r.pose);
    expect(v.walk).toBe(false);
    expect(v.x).toBeCloseTo(1234.5, 2); expect(v.y).toBeCloseTo(87.25, 2); expect(v.z).toBeCloseTo(-310.75, 2);
    expect(v.yaw).toBeCloseTo(2.2 * 180 / Math.PI, 1); expect(v.pitch).toBeCloseTo(-0.31 * 180 / Math.PI, 1);
    expect(resumeClock(r.pose)).toEqual({ preset: "yugata", hours: 16.5 });
  });
});

describe("through the real Player (what main.js applyResume does): on foot and in the air come back to the centimetre and the hundredth of a degree", () => {
  const mkPlayer = () => {
    globalThis.addEventListener ??= () => {};
    const dom = { addEventListener() {}, requestPointerLock() {} };
    const physics = { groundHeight: (x, z) => 3 + 0.01 * x, resolve() {}, standable: () => true, isWater: () => false };
    const camera = new THREE.PerspectiveCamera(55, 390 / 844, 0.1, 30000);
    return { p: new Player(camera, dom, physics, { x0: -1e5, x1: 1e5, z0: -1e5, z1: 1e5 }), camera };
  };
  const saveAndRestore = (setup) => {
    const a = mkPlayer(); setup(a.p);
    const ctx = { camera: a.camera, playerObj: a.p, services: {} };
    a.camera.updateMatrixWorld(true);
    const pose = capturePose(ctx, { now: new Date("2026-10-05T09:00:00Z") });
    const m = new Map(); const store = { get: (k) => m.get(k) ?? null, set: (k, v) => m.set(k, v), remove: (k) => m.delete(k) };
    store.set(SURVIVE.RESUME_KEY, JSON.stringify({ v: 1, why: "webgl-context-lost", at: T0, pose }));
    const r = takeResume({ store, now: T0 + 30_000 });
    const b = mkPlayer(); placeCamera(b.p, resumeView(r.pose));
    return { a, b, pose, mode: r.pose.mode };
  };
  const same = (a, b) => {
    expect(b.camera.position.distanceTo(a.camera.position)).toBeLessThan(0.011);
    const da = new THREE.Vector3(), db = new THREE.Vector3(); a.camera.getWorldDirection(da); b.camera.getWorldDirection(db);
    expect(da.angleTo(db) / (Math.PI / 180)).toBeLessThan(0.02);
  };
  test("on foot: ground under the feet at the same x and z, the same eye height, the same view", () => {
    const { a, b, mode } = saveAndRestore((p) => { p.fly = false; p.setPose(512.5, -310.25, 33.3, -4.2); });
    expect(mode).toBe("walk"); expect(b.p.fly).toBe(false);
    same(a, b);
    expect(b.camera.position.y).toBeCloseTo(3 + 0.01 * 512.5 + 1.52, 2);
  });
  test("in the air (the drone): the same height, a free camera, the same view; steep pitches too", () => {
    for (const [x, y, z, yaw, pitch] of [[428, 126, 130, 111, -17.5], [-60.25, 40, 210.5, -130, 1], [1560, 110, 2050, 14, -42.2], [100, 300, -50, 179.9, -84]]) {
      const { a, b, mode } = saveAndRestore((p) => p.setPose(x, z, yaw, pitch, y));
      expect(mode).toBe("drone"); expect(b.p.fly).toBe(true);
      same(a, b);
    }
  });
  test("a player that was flying and is put back on foot is on foot again (the flag follows the saved mode, not the new player's default)", () => {
    const { b } = saveAndRestore((p) => { p.fly = false; p.setPose(10, 20, 0, 0); });
    expect(b.p.fly).toBe(false);
    const p2 = mkPlayer().p; p2.fly = true; placeCamera(p2, { walk: true, x: 10, y: 0, z: 20, yaw: 0, pitch: 0 }); expect(p2.fly).toBe(false);
  });
});

// ------------------------------------------------------------------ the card
describe("the reload card", () => {
  test("words: 再読み込みします and a 44 px button; every phase has its own line; an English line for the rest", () => {
    expect(LOST_CARD_HTML).toContain("再読み込みします");
    for (const p of ["lost", "manual", "reloading"]) expect(LOST_CARD_HTML).toContain(`data-p="${p}"`);
    expect(LOST_CARD_HTML).toContain('id="klc-lost-go"'); expect(LOST_CARD_HTML).toContain("The picture paused");
    // the English line says what the Japanese one says in every phase (it once read "Reloading..." under 自動の再読み込みを止めました)
    expect(LOST_CARD_HTML).toMatch(/<small><span data-p="lost">The picture paused[^<]*<\/span><span data-p="manual">Automatic reloading stopped[^<]*<\/span><span data-p="reloading">Reloading[^<]*<\/span><\/small>/);
    expect(LOST_CARD_CSS).toContain("min-height:44px");
  });
  test("no blur, no animation: it is shown while the GPU is in trouble; it respects the notch and the home bar; hidden means gone", () => {
    expect(LOST_CARD_CSS).not.toMatch(/backdrop-filter|transition|animation|@keyframes/);
    expect(LOST_CARD_CSS).toContain("env(safe-area-inset-top)"); expect(LOST_CARD_CSS).toContain("env(safe-area-inset-bottom)");
    expect(LOST_CARD_CSS).toContain("#klc-lost[hidden]{display:none}");
    for (const p of ["lost", "manual", "reloading"]) expect(LOST_CARD_CSS).toContain(`[data-phase="${p}"] [data-p="${p}"]`);
  });
  function fakeDoc() {
    const classes = new Set(), made = [];
    const mk = (tag) => { const e = { tag, attrs: {}, dataset: {}, hidden: false, kids: [], style: {}, setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.kids.push(c); return c; }, focused: 0,
      querySelector() { return { addEventListener: (t, f) => { e.onClick = f; }, focus: () => { e.focused++; } }; } }; made.push(e); return e; };
    return { made, classes, head: mk("head"), body: { classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) }, ...mk("body") }, createElement: mk };
  }
  test("nothing exists until the first loss; then one style and one card; the phase picks the words; ok hides it and clears the body class", () => {
    const d = fakeDoc(); let taps = 0;
    const card = createLostCard(d, () => { taps++; });
    card.render({ phase: "ok" });
    expect(d.made.length).toBe(2);   // only head and body themselves
    card.render({ phase: "lost" });
    expect(card.el.id).toBe("klc-lost"); expect(card.el.attrs.role).toBe("alertdialog"); expect(card.el.dataset.phase).toBe("lost"); expect(card.el.hidden).toBe(false);
    expect(d.classes.has("klc-lost")).toBe(true);
    expect(d.head.kids.length).toBe(1); expect(d.head.kids[0].id).toBe("klc-lost-css"); expect(d.body.kids).toContain(card.el);
    card.render({ phase: "manual" }); card.render({ phase: "reloading" });
    expect(card.el.dataset.phase).toBe("reloading"); expect(d.head.kids.length).toBe(1);   // built once
    card.el.onClick();
    expect(taps).toBe(1);
    card.render({ phase: "ok" });
    expect(card.el.hidden).toBe(true); expect(d.classes.has("klc-lost")).toBe(false);
  });
});

// ------------------------------------------------------------------ main.js
describe("main.js wiring", () => {
  const main = read("src/anime/main.js");
  test("the guard is created from core/survive.js, never in a shot frame, on the canvas, with the pose capture and a card whose button taps the guard", () => {
    expect(main).toMatch(/import \{[^}]*createLossGuard[^}]*\} from '\.\/core\/survive\.js'/);
    expect(main).toContain("import { capturePose } from './core/pose.js';");
    expect(main).toContain("import { queryToPose, poseToCamArgs } from './core/pose.js'");   // the contrib link's import line (test/contrib-pose.test.js) is untouched
    expect(main).toMatch(/const survive = SHOT \? null : createLossGuard\(\{ canvas, doc: document, store: sessionStore\(\)/);
    expect(main).toContain("capture: () => capturePose(ctx)");
    expect(main).toContain("createLostCard(document, () => survive.tap())");
    expect(main).toContain("window.__survive = survive");
  });
  test("the frame loop draws nothing while the context is gone, and the planet / pipeline line the other tests pin is untouched", () => {
    expect(main).toMatch(/requestAnimationFrame\(frame\);\n  if \(survive\?\.lost\) \{ last = now; return; \}/);
    expect(main).toContain("if (planet.active) planet.render(simT); else pipeline.render(scene, camera, sunDir, simT);");
  });
  test("the resume: read once per load, applied only after the build, never in a shot frame, never over a ?cam= link, and reset to the hero view otherwise", () => {
    expect(main).toContain("takeResume({ store: sessionStore() })");
    expect(main).toMatch(/else if \(!SHOT && resume && applyResume\(resume\)\) \{ \/\* back where the visitor was \*\/ \} else if \(!SHOT\) \{ titlePose\(\);/);   // [title] no resume and no ?cam=: the landscape drone, then the shot path still opens on hero
    expect(main).toContain("else camSpec('hero');");
    expect(main).toContain("function applyResume(r)");
    // the reason a reload is the only way out: the phone tier frees the batches' CPU arrays
    expect(main).toContain("this.array = null");
  });
  test("deterministic: nothing in the new module reads Math.random, and the only wall clock is the stamp of a loss or a reload", () => {
    const src = read("src/anime/core/survive.js");
    expect(src).not.toMatch(/Math\.random\(/);
    expect((src.match(/Date\.now\(/g) || []).length).toBe(2);   // createLossGuard's default now(), takeResume's default now
  });
});
