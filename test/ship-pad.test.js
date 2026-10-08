// [integrate] 第一昭福丸 on the touch pad: the 'sail' pad mode (ship/padmode.js), the stick / look / buttons it drives in explore/sail.js, and the
// wiring that keeps both merged features (phone HUD: test/phone-hud.test.js, public mirror: test/public-mirror.test.js).
import { describe, test, expect } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import * as THREE from "three";
import * as L from "../src/anime/world/layout.js";
import { createSail, KN } from "../src/anime/world/explore/sail.js";
import { sailPadSpec, mountSailPad, CARD_STATES, label, ICONS } from "../src/anime/world/ship/padmode.js";
import { createContext } from "../src/anime/core/ctx.js";
import { createTouchpad, BUILTIN_NAMES } from "../src/anime/ui/touchpad.js";

class Ctx2D { constructor(c) { this.canvas = c; this.font = "10px sans-serif"; } measureText(t) { return { width: String(t).length * 9 }; } createLinearGradient() { return { addColorStop() {} }; } createRadialGradient() { return { addColorStop() {} }; } createPattern() { return {}; } getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }; } putImageData() {} }
const ctxProxy = (c) => new Proxy(new Ctx2D(c), { get(t, k) { if (k in t) return t[k]; return () => {}; }, set(t, k, v) { t[k] = v; return true; } });
class FakeCanvas { constructor() { this.width = 300; this.height = 150; this.style = {}; } getContext(t) { return t === "2d" ? (this._c ||= ctxProxy(this)) : null; } toDataURL() { return "data:,"; } addEventListener() {} }
globalThis.window ??= globalThis;
globalThis.document ??= { createElement: (t) => (t === "canvas" ? new FakeCanvas() : { style: {}, addEventListener() {}, appendChild() {}, setAttribute() {} }), fonts: { load: async () => [] }, body: { appendChild() {} }, addEventListener() {} };
globalThis.HTMLCanvasElement ??= FakeCanvas;

const ROOT = resolve(import.meta.dir, "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const DATA = JSON.parse(read("data/ship/i18n.json"));

const mkCtx = () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 30000);
  const ctx = createContext({ scene, camera, renderer: null, audio: null, quality: { name: "low", phone: true }, sunDir: new THREE.Vector3(...L.SUN_DIR).normalize() });
  ctx.playerObj = { look: { dx: 0, dy: 0 }, touchMove: { x: 0, y: 0 }, pos: new THREE.Vector3(), vel: new THREE.Vector3(), lookSink: null, lookCapture: null };
  return ctx;
};

describe("the sail pad mode: its spec", () => {
  const calls = [];
  const sail = { active: true, stop: () => calls.push("stop"), setAutopilot: (on) => calls.push("auto:" + on), speed: (on) => calls.push("x4:" + on), exit: () => calls.push("sail.exit") };
  const voyage = { active: true, exit: () => calls.push("voyage.exit") };
  const spec = sailPadSpec({ sail, voyage });
  test("an analog stick and 停止, 自動操船, 4×, 町へ戻る in that order (the first is the big one)", () => {
    expect(spec.stick).toBe("analog");
    expect(spec.buttons.map((b) => b.id)).toEqual(["stop", "auto", "x4", "home"]);
    expect(spec.buttons.map((b) => b.label.ja)).toEqual(["停止", "自動操船", "4×", "町へ戻る"]);
    expect(spec.buttons.map((b) => b.label.en)).toEqual(["Stop", "Auto", "4×", "Back to town"]);
  });
  test("自動操船 is a toggle and 4× a hold; the others are taps", () => {
    const by = Object.fromEntries(spec.buttons.map((b) => [b.id, b]));
    expect(by.auto.toggle).toBe(true); expect(by.x4.hold).toBe(true);
    expect(!!by.stop.toggle || !!by.stop.hold || !!by.home.toggle || !!by.home.hold).toBe(false);
  });
  test("the buttons call the helm: stop, autopilot on / off, the 4x hold, and the way home through the voyage", () => {
    const by = Object.fromEntries(spec.buttons.map((b) => [b.id, b]));
    by.stop.onDown(); by.auto.onDown({}, true); by.auto.onDown({}, false); by.x4.onDown(); by.x4.onUp(); by.home.onDown();
    expect(calls).toEqual(["stop", "auto:true", "auto:false", "x4:true", "x4:false", "voyage.exit"]);
    voyage.active = false; by.home.onDown(); expect(calls.at(-1)).toBe("sail.exit"); voyage.active = true;
  });
  test("the helm buttons show only at the helm; the way home always", () => {
    const by = Object.fromEntries(spec.buttons.map((b) => [b.id, b]));
    sail.active = true; expect(["stop", "auto", "x4", "home"].map((id) => by[id].visible?.() ?? true)).toEqual([true, true, true, true]);
    sail.active = false; expect(["stop", "auto", "x4", "home"].map((id) => by[id].visible?.() ?? true)).toEqual([false, false, false, true]);
    sail.active = true;
  });
  test("labels come from data/ship/i18n.json (ship.pad.*, ship.btn.exit), same keys in JA and EN", () => {
    for (const k of ["ship.pad.stop", "ship.pad.auto", "ship.pad.x4", "ship.btn.exit"]) { expect(DATA.ja[k]).toBeTruthy(); expect(DATA.en[k]).toBeTruthy(); }
    expect(label("ship.pad.stop")).toEqual({ ja: "停止", en: "Stop" });
    expect(Object.keys(DATA.en)).toEqual(Object.keys(DATA.ja));
  });
  test("every icon is a raw 24x24 svg in currentColor", () => {
    for (const [k, v] of Object.entries(ICONS)) { expect(v).toContain("<svg"); expect(v).toContain('viewBox="0 0 24 24"'); expect(v).toContain("currentColor"); void k; }
  });
  test("the pad accepts the spec (registerMode: unique ids, a stick kind, not a built-in name)", () => {
    const calls2 = [];
    const reg = new Map();
    const fake = { registerMode: (n, s) => { if (BUILTIN_NAMES.includes(n)) throw new Error("builtin"); reg.set(n, s); calls2.push(n); return fake; } };
    fake.registerMode("sail", spec);
    expect(reg.get("sail").buttons.length).toBe(4);
    expect(new Set(spec.buttons.map((b) => b.id)).size).toBe(4);
  });
});

describe("the sail pad mode: following the voyage", () => {
  const mk = () => {
    const log = [];
    const sup = new Set(), toggles = {};
    const pad = {
      registerMode: (n) => log.push("register:" + n), setMode: (n) => log.push("mode:" + n),
      suppress: (why, on = true) => { if (on) sup.add(why); else sup.delete(why); }, setToggle: (id, on) => { toggles[id] = on; },
    };
    const ctx = { pad, onUpdate: () => {} };
    const sail = { active: false, state: { autopilot: true }, stop() {}, speed() {}, setAutopilot() {} };
    const voyage = { active: false, state: "DOCKED", exit() {} };
    const m = mountSailPad(ctx, { sail, voyage });
    return { ctx, pad, sail, voyage, m, log, sup, toggles };
  };
  test("without a pad (desktop, tests) nothing happens, and the pad is picked up when it appears", () => {
    const t = mk(); t.ctx.pad = null; t.m.step(); expect(t.log).toEqual([]);
    t.ctx.pad = t.pad; t.m.step(); expect(t.log).toEqual(["register:sail"]);
  });
  test("setMode('sail') while the voyage is active, setMode(null) when it ends; the mode is registered once", () => {
    const t = mk();
    t.m.step(); t.m.step();
    expect(t.log).toEqual(["register:sail"]);
    t.voyage.active = true; t.m.step(); t.m.step();
    expect(t.log).toEqual(["register:sail", "mode:sail"]);
    t.voyage.active = false; t.m.step();
    expect(t.log).toEqual(["register:sail", "mode:sail", "mode:null"]);
  });
  test("the pad is out of the way in every beat that is not at the helm; at the helm it shows", () => {
    const t = mk();
    t.voyage.active = true;
    for (const st of ["DOCKED", "SENDOFF", "BAY_MOUTH", "OCEAN_SET", "WAIT", "HAUL", "STOW", "HOMECOMING"]) { t.voyage.state = st; t.m.step(); expect([st, t.sup.has("ship-beat")]).toEqual([st, true]); }
    t.voyage.state = "DEPART"; t.sail.active = true; t.m.step();
    expect(t.sup.size).toBe(0);
    t.sail.active = false; t.voyage.state = "HAUL"; t.m.step(); expect(t.sup.has("ship-beat")).toBe(true);
  });
  test("the chain cards and the final card suppress the pad with their own reason, and it comes back after", () => {
    const t = mk();
    t.voyage.active = true;
    for (const st of CARD_STATES) { t.voyage.state = st; t.m.step(); expect([st, t.sup.has("ship-card")]).toEqual([st, true]); }
    expect([...CARD_STATES].sort()).toEqual(["CARD", "REEFER", "SHIMIZU_WEIGH", "TRANSSHIP_LAS_PALMAS"]);
    t.voyage.state = "HOMECOMING"; t.m.step(); expect(t.sup.has("ship-card")).toBe(false);
    t.voyage.active = false; t.m.step(); expect(t.sup.size).toBe(0);
  });
  test("the 自動操船 toggle follows the autopilot, however it changed", () => {
    const t = mk();
    t.voyage.active = true; t.voyage.state = "DEPART"; t.sail.active = true;
    t.m.step(); expect(t.toggles.auto).toBe(true);
    t.sail.state.autopilot = false; t.m.step(); expect(t.toggles.auto).toBe(false);
  });
});

describe("the sail mode reads the pad: stick, 停止, 4×, and the look in radians", () => {
  const mkSail = () => {
    const ctx = mkCtx(); ctx.pad = { active: true, move: new THREE.Vector2() };
    const sail = createSail(ctx, {});
    return { ctx, sail };
  };
  test("the pad stick is the helm: up raises the engine order, right puts the rudder to starboard; released, the rudder returns, the order stays", () => {
    const { ctx, sail } = mkSail();
    sail.enter({ autopilot: false });
    ctx.pad.move.set(0.6, -1);   // pad.move: x right, y down (forward is -y)
    for (let i = 0; i < 80; i++) sail.update(0.05);
    expect(sail.state.eng).toBeGreaterThan(0.3);
    expect(sail.state.rudder).toBeGreaterThan(0.15);
    ctx.pad.move.set(0, 0);
    for (let i = 0; i < 80; i++) sail.update(0.05);
    expect(Math.abs(sail.state.rudder)).toBeLessThan(0.05);
    expect(sail.state.eng).toBeGreaterThan(0.3);   // the telegraph stays where you leave it
    sail.dispose();
  });
  test("touching the stick takes the helm from the autopilot", () => {
    const { ctx, sail } = mkSail();
    sail.enter({ autopilot: true });
    expect(sail.state.autopilot).toBe(true);
    ctx.pad.move.set(0, -0.8); sail.update(0.05);
    expect(sail.state.autopilot).toBe(false);
    sail.dispose();
  });
  test("停止: the engine order goes to zero, also from the autopilot (which it hands over)", () => {
    const { sail } = mkSail();
    sail.enter({ autopilot: true });
    for (let i = 0; i < 60; i++) sail.update(0.05);
    expect(sail.state.eng).toBeGreaterThan(0.2);
    sail.stop(); sail.update(0.05);
    expect(sail.state.autopilot).toBe(false);
    let kn1 = 0;
    for (let i = 0; i < 400; i++) { sail.update(0.05); if (i === 300) kn1 = sail.state.kn; }   // 20 s: well past the 8 s idle that re-engages the autopilot after a plain release
    expect(sail.state.autopilot).toBe(false);          // 停止 keeps it off until the next helm input
    expect(sail.state.eng).toBeLessThan(0.02);
    expect(sail.state.kn).toBeLessThan(kn1);   // coasting down, not driven on
    expect(sail.state.kn).toBeLessThan(0.6);
    sail.setAutopilot(true); expect(sail.state.autopilot).toBe(true);
    sail.dispose();
  });
  test("4× (hold): the time compression runs while held, back to 1 when released", () => {
    const { sail } = mkSail();
    sail.enter({ autopilot: false });
    sail.speed(true); sail.update(0.05);
    for (let i = 0; i < 40; i++) sail.update(0.05);
    expect(sail.state.tc).toBeGreaterThan(1.5);
    sail.speed(false);
    for (let i = 0; i < 100; i++) sail.update(0.05);
    expect(sail.state.tc).toBeLessThan(1.1);
    sail.dispose();
  });
  test("[fix1 B1] 4x is time compression, not a helm input: held with 自動操船 on, the autopilot keeps the helm and she keeps to her line", () => {
    const run = (boost) => {
      const { sail } = mkSail();
      sail.enter({ autopilot: true });
      if (boost) sail.speed(true);
      let maxTc = 0;
      for (let i = 0; i < 600; i++) { sail.update(0.05); maxTc = Math.max(maxTc, sail.state.tc); }   // 30 s
      const r = { ap: sail.state.autopilot, eng: sail.state.eng, s: sail.state.s, tc: maxTc, kn: sail.state.kn };
      sail.dispose();
      return r;
    };
    const plain = run(false), held = run(true);
    expect(plain.ap).toBe(true);
    expect(held.ap).toBe(true);                       // (it was false after the first frame: boost counted as a helm input)
    expect(held.tc).toBeGreaterThan(3);               // the x4 really runs
    expect(held.eng).toBeGreaterThan(0.4);            // the autopilot's order, not the inherited 0.25
    expect(held.s).toBeGreaterThan(plain.s * 2.5);    // and she gets on along the route
  });
  test("[fix1 B1] the idle clock does not run while 4x is held (so the helm is not 'idle' and handed back and forth), and a real helm input still takes over under 4x", () => {
    const { ctx, sail } = mkSail();
    sail.enter({ autopilot: true });
    sail.speed(true);
    for (let i = 0; i < 400; i++) sail.update(0.05);
    expect(sail.state.idle).toBe(0);
    ctx.pad.move.set(0.5, -0.9); sail.update(0.05);   // the stick: the helm is taken, 4x or not
    expect(sail.state.autopilot).toBe(false);
    sail.dispose();
  });
  test("a pad drag (player.lookSink, radians) swings the chase camera, then it eases back; a hold never outlives exit()", () => {
    const { ctx, sail } = mkSail();
    sail.enter({ autopilot: false });
    expect(typeof ctx.playerObj.lookSink).toBe("function");
    expect(typeof ctx.playerObj.lookCapture).toBe("function");   // the legacy px drag (a mouse) keeps its own path
    const cam = ctx.camera;
    const bearing = () => Math.atan2(cam.position.x - sail.state.x, cam.position.z - sail.state.z);
    for (let i = 0; i < 40; i++) sail.update(0.05);
    const b0 = bearing();
    ctx.playerObj.lookSink(0.9, 0);   // a ~110 px swipe on the pad
    for (let i = 0; i < 10; i++) sail.update(0.05);
    expect(Math.abs(Math.atan2(Math.sin(bearing() - b0), Math.cos(bearing() - b0)))).toBeGreaterThan(0.3);
    for (let i = 0; i < 20 * 12; i++) sail.update(0.05);
    expect(Math.abs(Math.atan2(Math.sin(bearing() - b0), Math.cos(bearing() - b0)))).toBeLessThan(0.05);
    sail.speed(true); sail.exit();
    expect(ctx.playerObj.lookSink).toBe(null); expect(ctx.playerObj.lookCapture).toBe(null);
    sail.enter({ autopilot: false });
    for (let i = 0; i < 60; i++) sail.update(0.05);
    expect(sail.state.tc).toBeLessThan(1.1);   // enter() cleared the stale hold
    sail.dispose();
  });
  test("the real Player: the pad's look reaches the ship's chase camera through lookSink and not the walker; the walker gets it back ashore", async () => {
    const { Player } = await import("../src/anime/core/player.js");
    const ctx = mkCtx();
    const pad = { active: true, move: new THREE.Vector2(), pending: { dx: 0, dy: 0 }, takeLook() { const r = { dx: this.pending.dx, dy: this.pending.dy }; this.pending.dx = this.pending.dy = 0; return r; } };
    ctx.pad = pad;
    const pl = Object.assign(Object.create(Player.prototype), {
      camera: ctx.camera, physics: { groundHeight: () => 0, resolve() {} }, bounds: { x0: -1e5, x1: 1e5, z0: -1e5, z1: 1e5 },
      pos: new THREE.Vector3(), vel: new THREE.Vector3(), vy: 0, yaw: 0, pitch: 0, eye: 1.52, radius: 0.3, height: 1.7,
      walk: 3.1, run: 6.4, fly: false, enabled: true, onGround: true, keys: new Set(), bob: 0, smoothY: null,
      look: { dx: 0, dy: 0 }, _touchMove: new THREE.Vector2(), distance: 0, pad, lookSink: null, lookCapture: null,
    });
    ctx.playerObj = pl;
    const sail = createSail(ctx, {});
    sail.enter({ autopilot: false });
    const cam = ctx.camera, bearing = () => Math.atan2(cam.position.x - sail.state.x, cam.position.z - sail.state.z);
    const frame = (dt) => { pl.update(dt); sail.update(dt); };   // main.js: player first, then the modes
    for (let i = 0; i < 40; i++) frame(0.05);
    const b0 = bearing(), yaw0 = pl.yaw;
    pad.pending.dx = 1.0;
    for (let i = 0; i < 10; i++) frame(0.05);
    expect(Math.abs(Math.atan2(Math.sin(bearing() - b0), Math.cos(bearing() - b0)))).toBeGreaterThan(0.3);
    expect(pl.yaw).toBe(yaw0);
    sail.exit();
    pad.pending.dx = 0.4; pl.update(0.05);
    expect(pl.yaw).not.toBe(yaw0);
    sail.dispose();
  });
});

describe("the pad: setToggle, custom modes and the suppression list", () => {
  const pad = createTouchpad({ canvas: null, ctx: { services: {}, onUpdate() {} }, doc: null, win: null });
  test("without a DOM the pad is a harmless stub (desktop tests)", () => {
    expect(typeof pad.registerMode).toBe("function");
  });
  test("the module has the surfaces the ship needs", () => {
    const src = read("src/anime/ui/touchpad.js");
    for (const s of ["setToggle(id, on)", "get suppressed()", "registerMode, setMode"]) expect(src).toContain(s);
  });
});

describe("integration: both features in one app", () => {
  test("the module order puts the ship between life and explore, and main.js attaches the pad to the player", () => {
    const main = read("src/anime/main.js");
    expect(main).toMatch(/MODULES = \['environment', 'water', 'town', 'harbor', 'landmarks', 'life', 'ship', 'explore'\]/);
    expect(main).toContain("player.attachPad(pad)");
    expect(existsSync(join(ROOT, "src/anime/ui/touchpad.js"))).toBe(true);
    expect(existsSync(join(ROOT, "src/anime/world/ship/padmode.js"))).toBe(true);
  });
  test("the ship world module mounts the sail pad mode and publishes it", () => {
    const idx = read("src/anime/world/ship/index.js");
    expect(idx).toContain("mountSailPad(ctx, { sail, voyage })");
    expect(idx).toContain("padSync");
  });
  test("player.js keeps both look paths: lookCapture (a mode that owns the camera) and the pad's radians through lookSink", () => {
    const p = read("src/anime/core/player.js");
    expect(p).toContain("typeof this.lookCapture === 'function'");
    expect(p).toContain("this.pad.takeLook(dt)");
    expect(p).toContain("if (this.lookSink) this.lookSink(l.dx, l.dy)");
  });
  test("sail.js has no private touch stick: it reads the pad's stick (or player.touchMove, the same vector once the pad is attached)", () => {
    const s = read("src/anime/world/explore/sail.js");
    expect(s).not.toMatch(/touchstart|touchmove|touchend/);
    expect(s).toContain("pd?.active && pd.move");
    expect(KN).toBeGreaterThan(0.5);
  });
});
