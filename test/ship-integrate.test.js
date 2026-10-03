// [ship:integrate] 第一昭福丸 wired into the app: the 'ship' world module (src/anime/world/ship/index.js), its URL
// parameters, the boarding entry, the module order, and the whole voyage run headless through the real module (the
// model, the sail mode, the director, the send-off crowd, the ocean) from the quay to the card.
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as THREE from "three";
import * as L from "../src/anime/world/layout.js";
import { createContext } from "../src/anime/core/ctx.js";
import { listModules } from "../scripts/anime/registry.js";
import { parseShipParams, nearBerth, ACT_START, PLACE, BOARD, BLOCKED_KEYS, build } from "../src/anime/world/ship/index.js";
import { STATES, ACT_OF } from "../src/anime/world/ship/acts.js";
import { BERTH } from "../src/anime/world/ship/route.js";
import { isDemoTag } from "../src/anime/world/ship/tags.js";
import { BUDGET } from "../src/anime/world/ship/shofukumaru1.js";
import { fixHtmlEntry } from "../scripts/anime/html-entry.js";
import { mkdtempSync, writeFileSync as writeFile, rmSync } from "node:fs";
import { tmpdir } from "node:os";

// DOM stubs (canvas drawing is a no-op), as in test/ship-sail.test.js: the wake and the crowd paint canvases; the UI
// needs a real DOM and stays unmounted here
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

const ROOT = resolve(import.meta.dir, "..");
const read = (p) => readFileSync(resolve(ROOT, p), "utf8");
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

describe("ship: URL parameters (?ship=1&act=1|2|3, &beat=, &auto=1)", () => {
  test("no ship parameter: nothing boards", () => {
    expect(parseShipParams("").board).toBe(false);
    expect(parseShipParams("?act=2").board).toBe(false);
    expect(parseShipParams("?ship=0&act=2").board).toBe(false);
  });
  test("act=1|2|3 start at the first beat of each act", () => {
    expect(parseShipParams("?ship=1").state).toBe("DOCKED");
    expect(parseShipParams("?ship=1&act=1").state).toBe("DOCKED");
    expect(parseShipParams("?ship=1&act=2").state).toBe("OCEAN_SET");
    expect(parseShipParams("?ship=1&act=3").state).toBe("TRANSSHIP_LAS_PALMAS");
    for (const a of [1, 2, 3]) expect(ACT_OF[ACT_START[a]]).toBe(a);
    expect(parseShipParams("?ship=1&act=9").state).toBe("DOCKED");
  });
  test("beat= names any state (case-insensitive) and wins over act; an unknown beat falls back to the act", () => {
    for (const s of STATES) expect(parseShipParams(`?ship=1&beat=${s.toLowerCase()}&act=3`).state).toBe(s);
    expect(parseShipParams("?ship=1&beat=NOPE&act=2").state).toBe("OCEAN_SET");
  });
  test("keep, fish and auto", () => {
    const p = parseShipParams("?ship=1&beat=HAUL&keep=2&fish=1&auto=1");
    expect(p).toEqual({ board: true, state: "HAUL", auto: true, keep: 2, fish: true });
    expect(parseShipParams("?ship=1&keep=x").keep).toBe(null);
  });
});

describe("ship: boarding entry", () => {
  test("the places entry and the chip sit at the コの字岸壁 berth", () => {
    expect(PLACE.ja).toBe("第一昭福丸に乗る");
    expect(PLACE.en).toBe("Board the 第一昭福丸");
    expect(PLACE.at).toEqual([BERTH.x, BERTH.z]);
    expect(nearBerth(BERTH.x, BERTH.z, 5)).toBe(true);
    expect(nearBerth(BERTH.quay[0], BERTH.quay[1], 1.7)).toBe(true);
    expect(nearBerth(BERTH.x + BOARD.radius + 1, BERTH.z, 5)).toBe(false);   // too far
    expect(nearBerth(BERTH.x, BERTH.z, BOARD.maxAlt + 1)).toBe(false);       // a high drone view
  });
  test("the town keys that would fight the voyage for the camera are blocked while it runs (Esc leaves)", () => {
    for (const k of ["KeyC", "KeyN", "KeyR", "Digit1", "Digit5"]) expect(BLOCKED_KEYS.has(k)).toBe(true);
    expect(BLOCKED_KEYS.has("Escape")).toBe(false);
    expect(BLOCKED_KEYS.has("KeyW")).toBe(false);   // the helm
  });
  test("strings: the chip in JA and EN", () => {
    const D = JSON.parse(read("data/ship/i18n.json"));
    for (const k of ["ship.board.title", "ship.board.sub", "ship.board.go"]) { expect(D.ja[k]).toBeTruthy(); expect(D.en[k]).toBeTruthy(); }
    expect(D.ja["ship.board.title"]).toBe("第一昭福丸に乗る");
  });
});

describe("ship: wiring", () => {
  test("the module is registered, after life (its crowd) and before explore (its places entry)", () => {
    expect(listModules().map(([n]) => n)).toContain("ship");
    const main = read("src/anime/main.js");
    const m = main.match(/export const MODULES = \[([^\]]+)\]/);
    const list = m[1].split(",").map((s) => s.trim().replace(/'/g, ""));
    expect(list.indexOf("ship")).toBeGreaterThan(list.indexOf("life"));
    expect(list.indexOf("ship")).toBeLessThan(list.indexOf("explore"));
  });
  test("explore lists the ship's place first, goTo runs its action, and streaming follows her bow", () => {
    const ex = read("src/anime/world/explore/index.js");
    expect(ex).toMatch(/shipPlace\.concat\(tourFeat\)/);
    expect(ex).toMatch(/sail\?\.active \? sail\.focus\(\)/);
    expect(read("src/anime/world/explore/ui.js")).toMatch(/typeof p\.action === 'function'/);
  });
});

// ------------------------------------------------------------------------------------------------ headless runtime
function headlessCtx(quality = { name: "low", phone: true }) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 30000);
  const ctx = createContext({ scene, camera, renderer: null, audio: null, quality, sunDir: new THREE.Vector3(...L.SUN_DIR).normalize() });
  // a stand-in town: one static and one dynamic group the ocean act must hide
  const town = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial()); town.name = "town-standin";
  ctx.addStatic(town);
  const life = new THREE.Group(); life.name = "life-standin"; ctx.add(life);
  return { ctx, town, life };
}
const step = (ctx, dt, t) => { ctx.time = t; ctx.shared.uTime.value = t; for (const fn of ctx._updates) fn(dt, t); };

describe("ship: the module at runtime (headless, phone tier)", () => {
  let fetches = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (...a) => { fetches++; return realFetch(...a); };
  const H = headlessCtx();
  const { ctx } = H;
  let built;
  test("build(): she lies at the コの字岸壁, the livery follows the flag, nothing nendo is fetched off a dev host", async () => {
    built = await build(ctx);
    const S = ctx.services.ship;
    expect(S && S.ship && S.sail && S.voyage).toBeTruthy();
    expect(built.tier).toBe("phone");
    expect(built.livery).toBe(process.env.KLC_NENDO === "1" ? "nendo" : "fallback");
    if (built.livery === "fallback") expect(fetches).toBe(0);
    expect(built.triangles).toBeLessThan(BUDGET.phone);
    const g = S.ship.group; g.updateWorldMatrix(true, true);
    const p = new THREE.Vector3(); g.getWorldPosition(p);
    expect(p.x).toBeCloseTo(BERTH.x, 3); expect(p.z).toBeCloseTo(BERTH.z, 3);
    expect(S.sail.carrier.rotation.y).toBeCloseTo(BERTH.yaw, 4);
    expect(S.voyage.active).toBe(false);
    expect(ctx.dynamicRoot.children).toContain(S.sail.carrier);   // dynamic: never merged into the static batch
  });

  test("the whole voyage, hands-free, quay to card: every state in order, the town hidden only at sea, DEMO tags, a smooth homecoming", () => {
    const V = ctx.services.ship.voyage, sail = ctx.services.ship.sail, carrier = sail.carrier;
    V.setAuto(true);
    ctx.services.ship.board();
    expect(V.active).toBe(true);
    const seen = [V.state];
    let t = 0, hiddenAtSea = true, shownAshore = true, maxHomeTurn = 0, lastYaw = null, homeStates = 0;
    const dt = 1 / 15;
    for (let i = 0; i < 15 * 1500 && V.state !== "CARD"; i++) {
      t += dt; step(ctx, dt, t);
      const st = V.state;
      if (st !== seen.at(-1)) seen.push(st);
      if (ACT_OF[st] === 2) hiddenAtSea &&= ctx.staticRoot.visible === false && H.life.visible === false;
      if (st === "DOCKED" || st === "SENDOFF" || st === "DEPART") shownAshore &&= ctx.staticRoot.visible === true;
      if (st === "HOMECOMING") {
        homeStates++;
        const y = carrier.rotation.y;
        if (lastYaw !== null) maxHomeTurn = Math.max(maxHomeTurn, Math.abs(wrap(y - lastYaw)));
        lastYaw = y;
      }
    }
    expect(seen).toEqual(STATES);
    expect(hiddenAtSea).toBe(true);
    expect(shownAshore).toBe(true);
    // ashore again for the homecoming and the card
    expect(ctx.staticRoot.visible).toBe(true);
    expect(H.life.visible).toBe(true);
    // home: bow first along the outbound line reversed, no 180 degree snap, port side to the same berth
    expect(homeStates).toBeGreaterThan(10);
    expect(maxHomeTurn).toBeLessThan(0.08);   // rad per 1/15 s step
    expect(carrier.position.x).toBeCloseTo(BERTH.x, 1);
    expect(carrier.position.z).toBeCloseTo(BERTH.z, 1);
    expect(Math.abs(wrap(carrier.rotation.y - (BERTH.yaw + Math.PI)))).toBeLessThan(0.02);
    // the catch: tagged bluefin only carry DEMO tags
    const d = V.acts.data;
    const tags = d.kept.filter((f) => f.tag).map((f) => f.tag);
    expect(tags.length).toBeGreaterThan(0);
    for (const tg of tags) expect(isDemoTag(tg)).toBe(true);
    expect(d.passed).toContain("kanae");
  }, 120000);

  test("exit returns to town: she is back alongside in her send-off pose, the town visible, the voyage idle", () => {
    const S = ctx.services.ship;
    S.voyage.exit();
    expect(S.voyage.active).toBe(false);
    expect(S.sail.active).toBe(false);
    expect(S.sail.carrier.rotation.y).toBeCloseTo(BERTH.yaw, 4);
    expect(ctx.staticRoot.visible).toBe(true);
  });

  test("jumping to a beat (the URL path) enters that scene: act 2 hides the town, act 3's card brings it back", () => {
    const S = ctx.services.ship;
    expect(S.board("OCEAN_SET")).toBe("OCEAN_SET");
    expect(ctx.staticRoot.visible).toBe(false);
    expect(S.board("HAUL", { keep: 2 })).toBe("HAUL");
    expect(S.voyage.acts.data.kept.length).toBe(2);
    expect(S.board("CARD")).toBe("CARD");
    expect(ctx.staticRoot.visible).toBe(true);
    S.voyage.exit();
    globalThis.fetch = realFetch;
  });
});

describe("ship: the bundle still starts the app (Bun HTML entry guard)", () => {
  test("fixHtmlEntry points the HTML's module script at the JS entry chunk, and leaves a right one alone", () => {
    const dir = mkdtempSync(resolve(tmpdir(), "klc-html-"));
    const html = resolve(dir, "index.html");
    writeFile(html, '<html><script type="module" crossorigin src="./chunk-wrong.js"></script></html>');
    const outs = [{ kind: "entry-point", path: resolve(dir, "chunk-main.js") }, { kind: "entry-point", path: html }, { kind: "chunk", path: resolve(dir, "chunk-wrong.js") }];
    expect(fixHtmlEntry(outs)).toEqual([{ html: "index.html", from: "chunk-wrong.js", to: "chunk-main.js" }]);
    expect(readFileSync(html, "utf8")).toContain('src="./chunk-main.js"');
    expect(fixHtmlEntry(outs)).toEqual([]);
    expect(fixHtmlEntry([{ kind: "entry-point", path: html }])).toEqual([]);   // no JS entry: nothing to be sure of
    rmSync(dir, { recursive: true, force: true });
  });
  test("a real build of src/anime/index.html: after the guard, the page's script is main.js's chunk", () => {
    // in its own process: Bun.build inside the test runner can trip over other tests' module mocks
    const dir = mkdtempSync(resolve(tmpdir(), "klc-bundle-"));
    const p = Bun.spawnSync([process.execPath, resolve(ROOT, "scripts/anime/html-entry.js"), dir], { cwd: ROOT, env: { ...process.env, NODE_OPTIONS: "" } });
    const out = JSON.parse(String(p.stdout).trim().split("\n").pop());
    expect(out.ok).toBe(true);
    expect(out.main).toBe(true);   // main.js's module labels are in the page's script chunk
    rmSync(dir, { recursive: true, force: true });
  }, 60000);
});
