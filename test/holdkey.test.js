// [r-hold] R resets the camera, or leaves a mode, only after a 600 ms hold.
// A tap, a repeat, typing, a modifier, and a movement key do not. 一本釣りの散水 stays a raw tap.
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { installHeldR, HELD_R, HOLD_MS, isTypingTarget } from "../src/anime/ui/holdkey.js";

const ROOT = resolve(import.meta.dir, "..");
const read = (p) => readFileSync(resolve(ROOT, p), "utf8");

function clock() {
  let now = 0, seq = 1;
  const jobs = [];
  return {
    schedule(fn, ms) {
      const id = seq++;
      jobs.push({ id, at: now + ms, fn });
      return id;
    },
    clear(id) {
      const i = jobs.findIndex((j) => j.id === id);
      if (i >= 0) jobs.splice(i, 1);
    },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = jobs.filter((j) => j.at <= end).sort((a, b) => a.at - b.at || a.id - b.id);
        if (!due.length) break;
        const j = due[0];
        jobs.splice(jobs.indexOf(j), 1);
        now = j.at;
        j.fn();
      }
      now = end;
    },
  };
}

class Node extends EventTarget {
  constructor(tag, extra = {}) {
    super();
    this.tagName = tag;
    this.parentNode = null;
    Object.assign(this, extra);
  }
}

function key(type, code, extra = {}) {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  for (const [k, v] of Object.entries({ code, repeat: false, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...extra })) {
    Object.defineProperty(ev, k, { value: v });
  }
  return ev;
}

function harness() {
  const win = new Node("WINDOW");
  const doc = new Node("DOCUMENT");
  doc.visibilityState = "visible";
  const clk = clock();
  const held = [];
  win.addEventListener(HELD_R, () => held.push(1));
  const dispose = installHeldR(win, { doc, schedule: clk.schedule, clear: clk.clear });
  const down = (code, extra) => win.dispatchEvent(key("keydown", code, extra));
  const up = (code) => win.dispatchEvent(key("keyup", code));
  return { win, doc, clk, held, dispose, down, up };
}

/** The kit's action key (play/kit/ui.js): a raw keydown, repeats ignored, not while typing in a field. */
function bindSpray(target, fn) {
  target.addEventListener("keydown", (e) => {
    if (e.repeat || e.code !== "KeyR") return;
    const tag = e.target && e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    e.preventDefault();
    fn();
  });
}

describe("held R", () => {
  test("a tap under 600 ms gives no event, and a 600 ms hold gives exactly one", () => {
    const h = harness();
    h.down("KeyR");
    h.clk.advance(HOLD_MS - 1);
    h.up("KeyR");
    h.clk.advance(HOLD_MS);
    expect(h.held).toEqual([]);

    h.down("KeyR");
    h.clk.advance(HOLD_MS);
    h.clk.advance(HOLD_MS);
    expect(h.held).toEqual([1]);
    h.up("KeyR");
    h.down("KeyR");
    h.clk.advance(HOLD_MS);
    expect(h.held).toEqual([1, 1]);
    h.dispose();
  });

  test("a key repeat does not start a hold and does not fire a second time", () => {
    const h = harness();
    h.down("KeyR", { repeat: true });
    h.clk.advance(HOLD_MS);
    expect(h.held).toEqual([]);
    h.down("KeyR");
    h.down("KeyR", { repeat: true });
    h.down("KeyR", { repeat: true });
    h.clk.advance(HOLD_MS * 3);
    expect(h.held).toEqual([1]);
    h.dispose();
  });

  test("typing is ignored: input, textarea, select, and contenteditable", () => {
    for (const tag of ["INPUT", "TEXTAREA", "SELECT"]) {
      const el = new Node(tag);
      const clk = clock();
      const held = [];
      el.addEventListener(HELD_R, () => held.push(1));
      installHeldR(el, { doc: null, schedule: clk.schedule, clear: clk.clear });
      el.dispatchEvent(key("keydown", "KeyR"));
      clk.advance(HOLD_MS);
      expect([tag, held]).toEqual([tag, []]);
      expect(isTypingTarget(el)).toBe(true);
    }
    const parent = new Node("DIV", { isContentEditable: true });
    const child = new Node("SPAN");
    child.parentNode = parent;
    const marked = new Node("DIV");
    marked.getAttribute = (name) => (name === "contenteditable" ? "true" : null);
    const clk = clock();
    const held = [];
    for (const el of [child, marked]) {
      el.addEventListener(HELD_R, () => held.push(el.tagName));
      installHeldR(el, { doc: null, schedule: clk.schedule, clear: clk.clear });
      el.dispatchEvent(key("keydown", "KeyR"));
    }
    clk.advance(HOLD_MS);
    expect(isTypingTarget(child)).toBe(true);
    expect(isTypingTarget(marked)).toBe(true);
    expect(held).toEqual([]);
  });

  test("Ctrl, Meta and Alt do not start a hold", () => {
    for (const mod of ["ctrlKey", "metaKey", "altKey"]) {
      const h = harness();
      h.down("KeyR", { [mod]: true });
      h.clk.advance(HOLD_MS);
      expect([mod, h.held]).toEqual([mod, []]);
      h.dispose();
    }
  });

  test("a movement key already down blocks the hold, and one pressed during it cancels", () => {
    for (const code of ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "ShiftLeft"]) {
      const h = harness();
      h.down(code);
      h.down("KeyR");
      h.clk.advance(HOLD_MS);
      expect([code, h.held]).toEqual([code, []]);
      h.dispose();
    }
    const h = harness();
    h.down("KeyR", { shiftKey: true });
    h.clk.advance(HOLD_MS);
    expect(h.held).toEqual([]);
    h.up("KeyR");

    h.down("KeyR");
    h.clk.advance(400);
    h.down("KeyW");
    h.clk.advance(HOLD_MS);
    expect(h.held).toEqual([]);
    h.up("KeyW");
    h.clk.advance(HOLD_MS);
    expect(h.held).toEqual([]);
    h.up("KeyR");
    h.down("KeyR");
    h.clk.advance(HOLD_MS);
    expect(h.held).toEqual([1]);
    h.dispose();
  });

  test("blur and a hidden tab cancel the hold", () => {
    const h = harness();
    h.down("KeyR");
    h.clk.advance(200);
    h.win.dispatchEvent(new Event("blur"));
    h.clk.advance(HOLD_MS);
    expect(h.held).toEqual([]);
    h.down("KeyW");
    h.win.dispatchEvent(new Event("blur"));
    h.down("KeyR");
    h.clk.advance(HOLD_MS);
    expect(h.held).toEqual([1]);
    h.up("KeyR");

    h.down("KeyR");
    h.clk.advance(200);
    h.doc.visibilityState = "visible";
    h.doc.dispatchEvent(new Event("visibilitychange"));
    h.clk.advance(HOLD_MS);
    expect(h.held).toEqual([1, 1]);
    h.up("KeyR");

    h.down("KeyR");
    h.clk.advance(200);
    h.doc.visibilityState = "hidden";
    h.doc.dispatchEvent(new Event("visibilitychange"));
    h.clk.advance(HOLD_MS);
    expect(h.held).toEqual([1, 1]);
    h.dispose();
  });

  test("a tap still sprays, a hold sprays once, and a voyage block stops both", () => {
    const h = harness();
    const sprays = [];
    bindSpray(h.win, () => sprays.push(1));
    let fishing = true;
    let resets = 0;
    h.win.addEventListener(HELD_R, () => { if (!fishing) resets++; });

    h.down("KeyR");
    h.clk.advance(HOLD_MS - 1);
    h.up("KeyR");
    expect(sprays).toEqual([1]);
    expect(h.held).toEqual([]);
    expect(resets).toBe(0);

    h.down("KeyR");
    h.clk.advance(HOLD_MS);
    expect(sprays).toEqual([1, 1]);
    expect(h.held).toEqual([1]);
    expect(resets).toBe(0);
    h.up("KeyR");
    fishing = false;
    h.down("KeyR");
    h.clk.advance(HOLD_MS);
    expect(resets).toBe(1);
    h.dispose();

    const blocked = harness();
    const blockedSprays = [];
    blocked.win.addEventListener("keydown", (e) => {
      if (e.code === "KeyR") e.stopImmediatePropagation();
    }, true);
    const again = installHeldR(blocked.win, { doc: blocked.doc, schedule: blocked.clk.schedule, clear: blocked.clk.clear });
    bindSpray(blocked.win, () => blockedSprays.push(1));
    blocked.down("KeyR");
    blocked.clk.advance(HOLD_MS);
    expect(blockedSprays).toEqual([]);
    expect(blocked.held).toEqual([]);
    again();
    blocked.dispose();
  });

  test("the reset and the mode exits listen for the hold; ippon's spray stays a raw R", () => {
    const main = read("src/anime/main.js");
    expect(main).toContain("installHeldR(window)");
    expect(main).not.toMatch(/if \(e\.code === 'KeyR'\) camSpec\('hero'\)/);
    expect(main).toContain("ownsInput");
    for (const p of [
      "src/anime/world/explore/drive.js",
      "src/anime/world/explore/sail.js",
      "src/anime/play/gull/index.js",
      "src/anime/play/underwater/index.js",
    ]) {
      const s = read(p);
      expect(s).toContain("HELD_R");
      expect(s).not.toMatch(/e\.code === 'KeyR'/);
    }
    const ippon = read("src/anime/play/ippon/index.js");
    expect(ippon).toContain("spray: { icon: 'spray', key: 'KeyR', cooldownMs: 0 }");
    expect(ippon).not.toContain("HELD_R");
    expect(ippon).not.toContain("holdkey");
  });
});
