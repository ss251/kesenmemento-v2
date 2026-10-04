// [v7:pad] The touch pad's pure parts: the stick math, the zones and their left-handed mirror, the look sensitivity, the
// arc layout, the button set of every mode, the registerMode API, the settings, and the strings (JA + EN complete).
import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  STICK, LOOK, BTN, stickMath, easeStick, padScale, touchZone, mirrorX, lookDelta, smoothTake, clusterLayout, layoutBounds,
  rectsOverlap, liftClear, grabDecision, HUD_GRAB, touchEnabled, loadSettings, builtinModes, buttonIds, BUILTIN_NAMES, ICONS, createTouchpad,
} from "../src/anime/ui/touchpad.js";
import { Player } from "../src/anime/core/player.js";

const ROOT = join(import.meta.dir, "..");
const DATA = JSON.parse(readFileSync(join(ROOT, "data/ui-touch-i18n.json"), "utf8"));

describe("pad: the stick", () => {
  test("12 % dead zone: a small push is nothing, just past it starts from zero", () => {
    const T = STICK.travel;
    expect(stickMath(0, 0).mag).toBe(0);
    expect(stickMath(T * 0.1, 0)).toMatchObject({ x: 0, y: 0, mag: 0, run: false });
    expect(stickMath(T * 0.12, 0).mag).toBe(0);
    const just = stickMath(T * 0.15, 0);
    expect(just.mag).toBeGreaterThan(0);
    expect(just.mag).toBeLessThan(0.05);
  });
  test("the magnitude is an eased curve: monotonic, 0..1, and gentler than linear in the lower half", () => {
    let prev = -1;
    for (let r = 0; r <= 1.0001; r += 0.02) { const m = stickMath(STICK.travel * r, 0).mag; expect(m).toBeGreaterThanOrEqual(prev); prev = m; }
    expect(easeStick(0)).toBe(0); expect(easeStick(1)).toBe(1);
    const mid = stickMath(STICK.travel * 0.56, 0).mag;   // the linear remap of 0.56 is 0.5
    expect(mid).toBeCloseTo(0.5, 5);
    expect(easeStick(0.25)).toBeLessThan(0.25);
    expect(easeStick(0.75)).toBeGreaterThan(0.75);
  });
  test("travel is clamped to 56 CSS px (the knob stays on the base, the vector never exceeds 1)", () => {
    const r = stickMath(300, 400);   // far past the travel, along (0.6, 0.8)
    expect(Math.hypot(r.knob.x, r.knob.y)).toBeCloseTo(STICK.travel, 6);
    expect(r.knob.x / r.knob.y).toBeCloseTo(0.75, 6);
    expect(Math.hypot(r.x, r.y)).toBeCloseTo(1, 6);
    expect(r.raw).toBe(1);
    expect(r.x).toBeCloseTo(0.6, 6); expect(r.y).toBeCloseTo(0.8, 6);
  });
  test("travel scales for small screens", () => {
    expect(padScale(390, 844)).toBe(1);
    expect(padScale(320, 568)).toBeCloseTo(0.82051, 4);
    expect(padScale(280, 500)).toBe(0.8);   // floor
    expect(padScale(1024, 1366)).toBe(1.15);   // ceiling
    expect(padScale(844, 390)).toBeCloseTo(0.92, 6);   // a landscape phone is a short screen: 8 % smaller
    const s = padScale(320, 568), r = stickMath(STICK.travel * s, 0, { scale: s });
    expect(r.raw).toBe(1); expect(r.knob.x).toBeCloseTo(STICK.travel * s, 6);
  });
  test("RUN / BOOST past 85 % of the travel, with a little hysteresis so the ring does not flicker", () => {
    const T = STICK.travel;
    expect(stickMath(T * 0.84, 0).run).toBe(false);
    expect(stickMath(T * 0.85, 0).run).toBe(true);
    expect(stickMath(T, 0).run).toBe(true);
    expect(stickMath(T * 0.82, 0, { prevRun: true }).run).toBe(true);    // still running: lets go at 80 %
    expect(stickMath(T * 0.82, 0, { prevRun: false }).run).toBe(false);
    expect(stickMath(T * 0.79, 0, { prevRun: true }).run).toBe(false);
  });
  test("the vector keeps the direction: y is down on screen (forward is -y, as player.touchMove)", () => {
    const up = stickMath(0, -STICK.travel);
    expect(up.y).toBeLessThan(0); expect(up.x).toBeCloseTo(0, 9);
    const left = stickMath(-STICK.travel * 0.5, 0);
    expect(left.x).toBeLessThan(0);
  });
});

describe("pad: zones and left-handed mirroring", () => {
  const W = 390, H = 844;
  test("the stick owns the lower 75 % of the left half; everything else is look", () => {
    expect(touchZone(60, 600, W, H)).toBe("stick");
    expect(touchZone(194, H - 1, W, H)).toBe("stick");
    expect(touchZone(60, H * 0.25, W, H)).toBe("stick");
    expect(touchZone(60, H * 0.25 - 1, W, H)).toBe("look");   // the top quarter of the left half looks
    expect(touchZone(195, 600, W, H)).toBe("look");           // right half
    expect(touchZone(350, 100, W, H)).toBe("look");
  });
  test("left-handed swaps the sides", () => {
    const lh = { leftHanded: true };
    expect(touchZone(60, 600, W, H, lh)).toBe("look");
    expect(touchZone(300, 600, W, H, lh)).toBe("stick");
    expect(touchZone(300, H * 0.25 - 1, W, H, lh)).toBe("look");
    for (const [x, y] of [[10, 300], [100, 700], [250, 500], [380, 800]]) {
      const a = touchZone(x, y, W, H), b = touchZone(mirrorX(x, W, true), y, W, H, lh);
      expect(b).toBe(a);   // a mirrored touch gets the same job under the mirrored layout
    }
  });
  test("a mode without a stick gives the touch to the look", () => {
    expect(touchZone(60, 600, W, H, { stick: "none" })).toBe("look");
  });
  test("mirrorX", () => { expect(mirrorX(30, 390, false)).toBe(30); expect(mirrorX(30, 390, true)).toBe(360); });
  test("the cluster arc mirrors with the hand", () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7]) {
      const r = clusterLayout(n, { hand: "right" }), l = clusterLayout(n, { hand: "left" });
      expect(l.length).toBe(n);
      r.forEach((b, i) => { expect(l[i].x).toBeCloseTo(-b.x, 9); expect(l[i].y).toBeCloseTo(b.y, 9); expect(l[i].size).toBe(b.size); });
    }
  });
});

describe("pad: look", () => {
  test("Genshin / PUBG sensitivity: about 0.008 rad / px, so one 190 px swipe turns about 85 degrees", () => {
    expect(LOOK.sens).toBeGreaterThanOrEqual(0.0075); expect(LOOK.sens).toBeLessThanOrEqual(0.0085);
    const deg = lookDelta(190, 0).dx * 180 / Math.PI;
    expect(deg).toBeGreaterThan(80); expect(deg).toBeLessThan(90);
    const d = lookDelta(100, -50);
    expect(d.dx).toBeCloseTo(100 * LOOK.sens, 9); expect(d.dy).toBeCloseTo(-50 * LOOK.sens, 9);
  });
  test("the sensitivity setting scales it and inverted Y flips pitch only", () => {
    const a = lookDelta(80, 40, { mult: 1.5 }), b = lookDelta(80, 40, { mult: 1.5, invertY: true });
    expect(a.dx).toBeCloseTo(80 * LOOK.sens * 1.5, 9);
    expect(b.dx).toBe(a.dx); expect(b.dy).toBe(-a.dy);
  });
  test("smoothing drains the pending delta without overshoot", () => {
    let pending = 1, got = 0;
    for (let i = 0; i < 120; i++) { const t = smoothTake(pending, 1 / 60); pending -= t; got += t; expect(t).toBeGreaterThanOrEqual(0); }
    expect(got).toBeCloseTo(1, 3);
    expect(smoothTake(1, 1 / 60)).toBeLessThan(1); expect(smoothTake(1, 1 / 60)).toBeGreaterThan(0.2);   // light: about a third per frame
  });
});

describe("pad: a drag that starts on a HUD panel", () => {
  test("a tap (under 10 px) waits; a drag past 10 px is promoted to the pad", () => {
    expect(HUD_GRAB.move).toBe(10);
    expect(grabDecision(0, 0)).toBe("wait");
    expect(grabDecision(6, -6)).toBe("wait");
    expect(grabDecision(0, -70)).toBe("promote");
    expect(grabDecision(11, 0)).toBe("promote");
  });
  test("a panel's own scroller keeps a drag that goes along its axis, and gives up one across it", () => {
    expect(grabDecision(40, 4, "x")).toBe("scroll");
    expect(grabDecision(4, -40, "x")).toBe("promote");   // the strip scrolls sideways: a thumb dragging up is the stick
    expect(grabDecision(4, 40, "y")).toBe("scroll");
    expect(grabDecision(40, 4, "y")).toBe("promote");
  });
  test("the grab list names the places strip, the dock and the credit line, and skips inputs", () => {
    for (const s of ["#klc-places", ".dock", ".attr"]) expect(HUD_GRAB.selector).toContain(s);
    expect(HUD_GRAB.skip).toContain("input");
  });
});

describe("pad: the arc", () => {
  test("every button is at least 56 px and the primary is the biggest", () => {
    for (const scale of [0.8, 1, 1.15]) for (const n of [1, 2, 3, 4, 5, 7]) {
      const L = clusterLayout(n, { scale });
      for (const b of L) expect(b.size).toBeGreaterThanOrEqual(BTN.min);
      expect(L[0].primary).toBe(true); expect(L[0].size).toBe(Math.max(...L.map((b) => b.size)));
    }
  });
  test("no two buttons touch (gap of at least 4 px between circles)", () => {
    for (const scale of [0.8, 1, 1.15]) for (const n of [2, 3, 4, 5, 6, 7]) {
      const L = clusterLayout(n, { scale });
      for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
        const d = Math.hypot(L[i].x - L[j].x, L[i].y - L[j].y), need = (L[i].size + L[j].size) / 2 + 4;
        expect(d).toBeGreaterThanOrEqual(need);
      }
    }
  });
  test("the fan lies above and beside the primary (never below its centre line by more than a few px)", () => {
    for (const b of clusterLayout(7)) expect(b.y).toBeLessThanOrEqual(20);
  });
  test("a four-button mode is compact enough for a landscape phone", () => {
    const bb = layoutBounds(clusterLayout(4));
    expect(bb.h).toBeLessThan(200); expect(bb.w).toBeLessThan(215);
  });
  test("liftClear raises a box over the panels in its way and leaves a free one alone", () => {
    const panels = [{ l: 0, t: 700, r: 390, b: 800 }];
    expect(liftClear({ l: 10, w: 100, h: 100 }, 830, panels)).toBe(692);
    expect(liftClear({ l: 10, w: 100, h: 100 }, 690, panels)).toBe(690);
    expect(rectsOverlap({ l: 0, t: 0, r: 10, b: 10 }, { l: 10, t: 0, r: 20, b: 10 })).toBe(false);
    expect(rectsOverlap({ l: 0, t: 0, r: 10, b: 10 }, { l: 9, t: 0, r: 20, b: 10 })).toBe(true);
  });
});

describe("pad: the button set per mode", () => {
  test("walk: ジャンプ (primary), ダッシュ (toggle), 飛ぶ, and the 乗る / 入る context button", () => {
    const m = builtinModes();
    expect(buttonIds("walk")).toEqual(["jump", "dash", "fly", "context"]);
    expect(m.walk.buttons[0].id).toBe("jump");
    expect(m.walk.buttons.find((b) => b.id === "dash").toggle).toBe(true);
    const ctxB = m.walk.buttons.find((b) => b.id === "context");
    let kind = null;
    const live = builtinModes({ contextKind: () => kind }).walk.buttons.find((b) => b.id === "context");
    expect(live.visible()).toBe(false);
    kind = "board"; expect(live.visible()).toBe(true); expect(live.label()).toBe("touch.btn.board"); expect(live.icon()).toBe("board");
    kind = "enter"; expect(live.label()).toBe("touch.btn.enter"); expect(live.icon()).toBe("enter");
    expect(ctxB.visible()).toBe(false);
  });
  test("fly: 上昇 and 下降 (hold), 加速 (hold), 歩く (land)", () => {
    expect(buttonIds("fly")).toEqual(["up", "down", "boost", "land"]);
    const b = builtinModes().fly.buttons;
    expect(b[0].hold && b[1].hold && b[2].hold).toBe(true);
    expect(b[3].hold).toBeFalsy();
    expect(DATA.ja[b[0].label]).toBe("上昇"); expect(DATA.ja[b[1].label]).toBe("下降"); expect(DATA.ja[b[2].label]).toBe("加速"); expect(DATA.ja[b[3].label]).toBe("歩く");
  });
  test("drive: ブレーキ (hold), ブースト (hold), 降りる; the stick steers", () => {
    expect(buttonIds("drive")).toEqual(["brake", "nitro", "getout"]);
    const d = builtinModes().drive;
    expect(d.buttons[0].hold && d.buttons[1].hold).toBe(true);
    expect(d.stick).toBe("analog");
    expect(DATA.ja[d.buttons[0].label]).toBe("ブレーキ"); expect(DATA.ja[d.buttons[1].label]).toBe("ブースト"); expect(DATA.ja[d.buttons[2].label]).toBe("降りる");
  });
  test("walk labels are the spec's", () => {
    const w = builtinModes().walk.buttons;
    expect(DATA.ja[w[0].label]).toBe("ジャンプ"); expect(DATA.ja[w[1].label]).toBe("ダッシュ"); expect(DATA.ja[w[2].label]).toBe("飛ぶ");
    expect(DATA.ja["touch.btn.board"]).toBe("乗る"); expect(DATA.ja["touch.btn.enter"]).toBe("入る");
  });
  test("every button has an icon that exists and a unique id per mode", () => {
    const m = builtinModes({ contextKind: () => "board" });
    for (const name of BUILTIN_NAMES) {
      const ids = m[name].buttons.map((b) => b.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const b of m[name].buttons) {
        const ic = typeof b.icon === "function" ? b.icon() : b.icon;
        expect(ICONS[ic]).toBeTruthy();
        expect(ICONS[ic]).toContain("<svg");
      }
    }
    for (const k of ["walk", "fly", "car", "sliders", "hand"]) expect(ICONS[k]).toContain("<svg");
  });
});

describe("pad: activation and settings", () => {
  test("coarse pointer, the first touch or ?touch=1 turn it on; ?touch=0 forces it off", () => {
    expect(touchEnabled("", {})).toBe(false);
    expect(touchEnabled("", { coarse: true })).toBe(true);
    expect(touchEnabled("", { touched: true })).toBe(true);
    expect(touchEnabled("?touch=1", {})).toBe(true);
    expect(touchEnabled("?touch=0", { coarse: true, touched: true })).toBe(false);
    expect(touchEnabled("?foo=1&touch=1", {})).toBe(true);
  });
  test("settings: defaults, persisted JSON, a broken value", () => {
    expect(loadSettings(null)).toEqual({ leftHanded: false, invertY: false, sens: 1, coach: false });
    expect(loadSettings(JSON.stringify({ leftHanded: true, invertY: true, sens: 1.3, coach: true }))).toEqual({ leftHanded: true, invertY: true, sens: 1.3, coach: true });
    expect(loadSettings("{nope")).toEqual({ leftHanded: false, invertY: false, sens: 1, coach: false });
    expect(loadSettings(JSON.stringify({ sens: 99 })).sens).toBe(1.8);
    expect(loadSettings(JSON.stringify({ sens: 0.01 })).sens).toBe(0.5);
  });
});

describe("pad: the API for the sail mode (registerMode / setMode) and the player", () => {
  // a minimal DOM-less host: createTouchpad returns the inert API outside a browser
  test("outside a browser the pad is inert but has the whole surface", () => {
    const pad = createTouchpad({ canvas: null, ctx: null });
    expect(typeof pad.on).toBe("function"); expect(pad.isDown("x")).toBe(false); expect(pad.takeLook(0.016)).toEqual({ dx: 0, dy: 0 });
    expect(pad.vertical).toBe(0); expect(pad.dash).toBe(false);
  });
  test("a fake DOM pad registers the sail mode, validates it, and switches", () => {
    const pad = fakePad();
    pad.registerMode("sail", { stick: "none", buttons: [{ id: "stop", label: { ja: "停止", en: "Stop" }, icon: "brake", onDown() {} }, { id: "auto", label: "自動操船", icon: "boost", toggle: true }, { id: "x4", label: "4×", icon: "dash", hold: true }, { id: "home", label: "町へ戻る", icon: "land" }] });
    expect(pad.modes).toEqual(["walk", "fly", "drive", "sail"]);
    expect(pad.setMode("sail")).toBe("sail");
    expect(pad.mode).toBe("sail");
    expect(() => pad.registerMode("walk", { buttons: [] })).toThrow();
    expect(() => pad.registerMode("bad", { buttons: [{ id: "a" }, { id: "a" }] })).toThrow();
    expect(() => pad.registerMode("bad2", { stick: "mouse", buttons: [] })).toThrow();
    expect(() => pad.setMode("nope")).toThrow();
    expect(pad.setMode("walk")).toBe("walk");
  });
});

describe("pad: the player keeps its touchMove getter and consumes the pad", () => {
  const mkPlayer = () => {
    globalThis.addEventListener ??= () => {};
    const dom = { addEventListener() {}, requestPointerLock() {} };
    const physics = { groundHeight: () => 0, resolve() {}, standable: () => true };
    const cam = { position: { set() {} }, rotation: { set() {} } };
    return new Player(cam, dom, physics, { x0: -1e4, x1: 1e4, z0: -1e4, z1: 1e4 });
  };
  test("player.touchMove is a Vector2 without a pad and the pad's move with one", () => {
    const p = mkPlayer();
    expect(p.touchMove.length()).toBe(0);
    p.touchMove.set(0.5, -0.5);
    expect(p.touchMove.x).toBe(0.5);
    const listeners = [];
    const pad = { move: { x: 0.25, y: -1, length: () => 1, lengthSq: () => 1 }, vertical: 0, running: false, dash: false, boost: false, takeLook: () => ({ dx: 0.1, dy: 0 }), on: (f) => listeners.push(f) };
    p.attachPad(pad);
    expect(p.touchMove).toBe(pad.move);
  });
  test("the jump / fly / land events drive the player; look comes from the pad in radians", () => {
    const p = mkPlayer();
    const listeners = [];
    const pad = { move: { x: 0, y: 0, length: () => 0, lengthSq: () => 0 }, vertical: 0, running: false, dash: false, boost: false, takeLook: () => ({ dx: 0.2, dy: -0.1 }), on: (f) => listeners.push(f) };
    p.attachPad(pad);
    p.enabled = true; p.onGround = true;
    listeners[0]({ type: "action", id: "jump" });
    expect(p.vy).toBe(4.2);
    listeners[0]({ type: "action", id: "fly" }); expect(p.fly).toBe(true);
    listeners[0]({ type: "action", id: "land" }); expect(p.fly).toBe(false);
    listeners[0]({ type: "down", id: "jump" });   // plain button events are not actions
    p.yaw = 0; p.pitch = 0; p.update(1 / 60);
    expect(p.yaw).toBeCloseTo(-0.2, 9); expect(p.pitch).toBeCloseTo(0.1, 9);
    p.lookSink = (dx, dy) => { p.sunk = [dx, dy]; };   // the car's chase camera takes the look while driving
    p.yaw = 0; p.update(1 / 60);
    expect(p.sunk).toEqual([0.2, -0.1]); expect(p.yaw).toBe(0);
  });
  test("stick, 上昇 and 加速 reach the movement", () => {
    const p = mkPlayer();
    const pad = { move: { x: 0, y: -1, length: () => 1, lengthSq: () => 1 }, vertical: 1, running: true, dash: false, boost: false, takeLook: () => ({ dx: 0, dy: 0 }), on() {} };
    p.attachPad(pad); p.enabled = true; p.fly = true; p.yaw = 0;
    const z0 = p.pos.z, y0 = p.pos.y;
    for (let i = 0; i < 30; i++) p.update(1 / 60);
    expect(p.pos.z).toBeLessThan(z0 - 5);   // forward is -z, at fly-run speed
    expect(p.pos.y).toBeGreaterThan(y0 + 2);
  });
});

describe("pad: strings", () => {
  test("ja and en have the same keys, no key is empty", () => {
    const ja = Object.keys(DATA.ja).sort(), en = Object.keys(DATA.en).sort();
    expect(en).toEqual(ja);
    for (const l of ["ja", "en"]) for (const [k, v] of Object.entries(DATA[l])) { expect(typeof v).toBe("string"); expect(v.trim().length).toBeGreaterThan(0); expect(k.startsWith("touch.")).toBe(true); }
  });
  test("Japanese is real Japanese, the spec's labels are exact", () => {
    const ja = DATA.ja;
    expect(ja["touch.mode.walk"]).toBe("歩く"); expect(ja["touch.mode.fly"]).toBe("飛ぶ"); expect(ja["touch.mode.drive"]).toBe("運転");
    expect(ja["touch.coach.title"]).toBe("左で移動・右で視点");
    for (const k of Object.keys(ja)) if (!/^touch\.(boost\.on)$/.test(k)) expect(ja[k]).toMatch(/[぀-ヿ一-鿿]/);
  });
  test("every string the pad asks for exists (buttons, chip, settings, coach, notes)", () => {
    const need = new Set();
    for (const name of BUILTIN_NAMES) for (const b of builtinModes({ contextKind: () => "board" })[name].buttons) {
      const l = typeof b.label === "function" ? b.label() : b.label; need.add(l);
    }
    for (const k of ["enter", "leave", "board"]) need.add("touch.btn." + k);
    for (const m of BUILTIN_NAMES) need.add("touch.mode." + m);
    const src = readFileSync(join(ROOT, "src/anime/ui/touchpad.js"), "utf8");
    for (const m of src.matchAll(/(?:data-t="|tr\(')(touch\.[\w.]+)/g)) if (!m[1].endsWith(".")) need.add(m[1]);
    for (const k of need) { expect(DATA.ja[k]).toBeDefined(); expect(DATA.en[k]).toBeDefined(); }
  });
  test("the module reads the new file, not data/i18n.json (no merge conflicts with the other branches)", () => {
    const src = readFileSync(join(ROOT, "src/anime/ui/touchpad.js"), "utf8");
    expect(src).toContain("ui-touch-i18n.json");
    expect(Object.keys(JSON.parse(readFileSync(join(ROOT, "data/i18n.json"), "utf8")).ja).some((k) => k.startsWith("touch."))).toBe(false);
  });
});

/** A pad with the registry only (no DOM): createTouchpad needs a document, so this builds one from a tiny stub. */
function fakePad() {
  const el = () => new Proxy(function () {}, { get: (t, k) => (k === "style" ? { setProperty() {} } : k === "classList" ? { add() {}, remove() {}, contains: () => false, toggle() {} } : k === "dataset" ? {} : k === "querySelector" || k === "querySelectorAll" ? () => (k === "querySelector" ? el() : []) : () => el()), apply: () => el(), set: () => true });
  const doc = { readyState: "complete", body: el(), head: el(), createElement: el, querySelectorAll: () => [], addEventListener() {} };
  const win = { location: { search: "?touch=0" }, innerWidth: 390, innerHeight: 844, localStorage: { getItem: () => null, setItem() {} }, addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }), navigator: {} };
  return createTouchpad({ canvas: null, ctx: { services: {}, onUpdate() {} }, doc, win });
}
