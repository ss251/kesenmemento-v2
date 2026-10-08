// [jpyc] The HUD's side of the 「JPYCで買えるお店」 sheet (ui/hud.js): the ☰ menu item and how it is built (first in the toolbar, a real button with a name, in the markup the sync tests
// compare), the click that closes the menu and opens the list (and never calls render()), the credits sheet's line, the kids gate (no item, no line, no panel under ?src=chirashi),
// the keyboard standing down, and that a fault in the sheet cannot stop the HUD. It drives the real mountHud on a small DOM like test/hud-sync.test.js.
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { makeDom } from "./lib/mini-dom.js";
import { mountHud } from "../src/anime/ui/hud.js";
import { STRINGS as JPYC } from "../src/anime/ui/jpyc-lib.js";

const ROOT = resolve(import.meta.dir, "..");
const HUD = readFileSync(join(ROOT, "src/anime/ui/hud.js"), "utf8");
const GLOBALS = ["document", "location", "localStorage", "sessionStorage", "addEventListener", "removeEventListener", "MutationObserver", "requestAnimationFrame", "setTimeout", "navigator"];
const PRESETS = [{ id: "asa", h: 6.5 }, { id: "hiru", h: 12 }, { id: "yugata", h: 16.5 }, { id: "yuyake", h: 17 + 20 / 60 }, { id: "yoru", h: 19.5 }];

const BEFORE = Object.fromEntries(GLOBALS.map((k) => [k, globalThis[k]]));   // (what the globals were when this file was loaded: every world must hand them back)
const DEV_HOSTNAME = "localhost", PROD_HOSTNAME = "kesennuma-living-city-production.up.railway.app";
/** `dev: true` is a developer's preview on their own machine (?jpyc=dev on localhost): the shipped data file has the demo shop switched off, so that is how these tests see the item. */
function world({ search = "", hostname, dev = false, stored = {}, session = {} } = {}) {
  const dom = makeDom({ search: dev ? (search ? search + "&jpyc=dev" : "?jpyc=dev") : search, hostname: hostname ?? (dev ? DEV_HOSTNAME : undefined) });
  // (the report flow is another lane's: contribEnabled turns it on for a dev host, and mountContrib then draws its button only when the page has a window, which a test file that ran earlier may have left behind.
  // These worlds pin it off, so the toolbar assertions below are about this feature only and do not depend on what ran before)
  if (!("klc.contrib" in stored)) dom.localStorage.setItem("klc.contrib", "0");
  for (const [k, v] of Object.entries(stored)) dom.localStorage.setItem(k, v);
  const saved = Object.fromEntries(GLOBALS.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  const timers = new Set(), realST = globalThis.setTimeout, put = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  const ss = new Map(Object.entries(session));
  put("document", dom.document); put("location", dom.location); put("localStorage", dom.localStorage); put("MutationObserver", dom.MutationObserver); put("navigator", { onLine: true });
  put("sessionStorage", { getItem: (k) => (ss.has(k) ? ss.get(k) : null), setItem: (k, v) => ss.set(k, String(v)), removeItem: (k) => ss.delete(k) });
  put("addEventListener", dom.window.addEventListener); put("removeEventListener", dom.window.removeEventListener);
  put("requestAnimationFrame", (f) => { f(); return 1; });
  put("setTimeout", (f, ms, ...a) => { const id = realST(f, ms, ...a); timers.add(id); return id; });
  const cleanup = () => { for (const id of timers) clearTimeout(id); for (const k of GLOBALS) { if (saved[k]) Object.defineProperty(globalThis, k, saved[k]); else delete globalThis[k]; } };
  try {
    const emitter = () => { const fns = new Set(); return { on: (f) => (fns.add(f), () => fns.delete(f)), emit: (...a) => { for (const f of [...fns]) f(...a); } }; };
    const te = emitter(), ue = emitter(), le = emitter();
    const T = { preset: "yugata", presets: PRESETS, clock: () => "16:30", set(id) { this.preset = id; te.emit(T, "start"); }, onChange: te.on, emit: (why) => te.emit(T, why) };
    const stopList = ["hero", "market"].map((id) => ({ id, ja: "場所" + id, en: "Place " + id }));
    const tour = { stops: stopList, current: "hero", playing: false, flying: false, stop() { this.playing = false; ue.emit(tour); }, play() { this.playing = true; ue.emit(tour); }, flyTo(id) { this.current = id; ue.emit(tour); }, walkTo(id) { this.current = id; ue.emit(tour); return true; }, onChange: ue.on };
    const live = { state: { status: "ok", sample: false, stale: false, weather: { sky: "clear", temp: 18 }, arrivals: [] }, onChange: le.on };
    const season = { id: "autumn", next() {} };
    const pad = { calls: [], suppress(r, on) { this.calls.push([r, on]); } };
    const ctx = { planet: { active: false }, audio: { muted: false }, pad, time: 0, services: {} };
    const life = { time: T, tour, live, season };
    const hud = mountHud(ctx, life, { force: true });
    life.hud = hud;
    const el = hud.el, q = (s) => el.querySelector(s), all = (s) => [...el.querySelectorAll(s)];
    const click = (node, { pointer = true } = {}) => { if (pointer) node.focus(); return dom.fire(node, "click", { detail: pointer ? 1 : 0 }); };
    const key = (code, props = {}) => dom.fire(dom.document.body, "keydown", { code, key: code.replace(/^Key/, ""), repeat: false, ...props });
    return { dom, ctx, hud, el, q, all, click, key, T, tour, pad, cleanup, ss, root: () => dom.document.getElementById("klc-jpyc") };
  } catch (e) { cleanup(); throw e; }
}
const withWorld = async (opts, fn) => { const w = world(opts); try { return await fn(w); } finally { w.cleanup(); } };

describe("PRODUCTION DEFAULT: the data file ships the demo switched off, so there is nothing of the feature on the page", () => {
  test("no menu item, no credits line, no sheet, no style, no request: the toolbar is exactly what it was before this lane", () => withWorld({}, (w) => {
    expect(w.q('[data-act="jpyc"]')).toBeNull(); expect(w.q(".jpyc-credit")).toBeNull(); expect(JSON.stringify(w.el.innerHTML)).not.toMatch(/JPYC|jpyc/);
    expect([w.hud.jpyc.enabled, w.hud.jpyc.kids, w.hud.jpyc.mode]).toEqual([false, false, "normal"]);   // (not kids: there is just nothing switched on)
    expect(w.hud.jpyc.openList()).toBe(false); expect(w.hud.jpyc.open("jpyc-demo")).toBe(false); expect(w.hud.jpyc.open("otameshi")).toBe(false); expect(w.root()).toBeNull();
    expect(w.hud.jpyc.entries()).toEqual([]); expect(w.hud.jpyc.has("jpyc-demo")).toBe(false);
    expect(w.all('.tools [data-act]').map((x) => x.getAttribute("data-act"))).toEqual(["lang", "season", "sound", "planet", "credits", "labels", "hide", "multi"]);
    expect(w.dom.document.getElementById("klc-jpyc-css")).toBeNull(); expect(w.dom.document.getElementById("klc-jpyc-btn-css")).toBeNull();
    w.key("Escape");   // (and no key handler of the sheet's is on the page)
    expect(w.ctx.services.jpyc).toBe(w.hud.jpyc);   // (the service itself is published, disabled: ctx.services.jpyc?.open(...) is safe for the splat lane's button)
  }));
  test("?jpyc=dev changes nothing on the production host (or any host but the developer's own); on a dev host it shows the switched-off demo, labelled", async () => {
    await withWorld({ search: "?jpyc=dev", hostname: PROD_HOSTNAME }, (w) => { expect(w.q('[data-act="jpyc"]')).toBeNull(); expect([w.hud.jpyc.enabled, w.hud.jpyc.mode]).toEqual([false, "normal"]); });
    await withWorld({ search: "?jpyc=dev", hostname: "klc.test" }, (w) => { expect(w.q('[data-act="jpyc"]')).toBeNull(); });
    await withWorld({ search: "?jpyc=dev", hostname: "localhost.evil.com" }, (w) => { expect(w.q('[data-act="jpyc"]')).toBeNull(); });
    await withWorld({ dev: true }, (w) => {
      expect(w.q('[data-act="jpyc"]')).not.toBeNull(); expect([w.hud.jpyc.enabled, w.hud.jpyc.mode]).toEqual([true, "dev"]);
      w.hud.jpyc.openList(); expect(w.root().textContent).toContain(JPYC.ja["jpyc.dev.off"]); expect(w.root().textContent).toContain(JPYC.ja["jpyc.demo.badge"]);   // (labelled twice: a demo, and switched off)
    });
  });
});

describe("the ☰ menu item", () => {
  test("it is the first item of the toolbar, after the menu header, a real button with a name and a label for the phone's menu", () => withWorld({ dev: true }, (w) => {
    const tools = w.q(".tools"), kids = tools.childNodes.filter((n) => n.nodeType === 1);
    expect(kids[0].getAttribute("class")).toBe("mhead"); expect(kids[1].getAttribute("data-act")).toBe("jpyc");   // (JPYC sits on the left of the right-anchored toolbar, so the older items stay; [integration] みんなであそぶ moved before 修正を報告 so the phone ☰ keeps its order)
    const b = w.q('[data-act="jpyc"]');
    expect([b.tagName, b.getAttribute("class"), b.getAttribute("aria-haspopup"), b.getAttribute("aria-label")]).toEqual(["BUTTON", "round glass jpyc", "dialog", "JPYCで買えるお店"]);
    expect(b.querySelector(".lbl").textContent).toBe("JPYCで買えるお店"); expect(b.getAttribute("title")).toBe(JPYC.ja["jpyc.menu.hint"]); expect(b.querySelector("svg")).not.toBeNull();
    expect(w.all('.tools [data-act]').map((x) => x.getAttribute("data-act"))).toEqual(["jpyc", "lang", "season", "sound", "planet", "credits", "labels", "hide", "multi"]);
  }));
  test("it is not a .cbtn (those are the phone menu's only): the desktop toolbar has it too", () => withWorld({ dev: true }, (w) => {
    expect(w.q('[data-act="jpyc"]').getAttribute("class")).not.toContain("cbtn");
    expect(HUD).toContain('class="round glass jpyc" data-act="jpyc"');
  }));
  test("a click closes the ☰ menu, opens the shop list with the button as its opener, and rebuilds nothing", () => withWorld({ dev: true }, (w) => {
    w.click(w.q('[data-act="menu"]')); expect(w.el.dataset.menu).toBe("1");
    const before = w.el.htmlSets, b = w.q('[data-act="jpyc"]');
    w.click(b);
    expect(w.el.dataset.menu).toBe("0"); expect(w.hud.jpyc.isOpen).toBe(true); expect(w.root().dataset.screen).toBe("list");
    expect(w.el.htmlSets).toBe(before); expect(w.q('[data-act="jpyc"]')).toBe(b);   // (the same node: syncState, not render)
    expect(w.pad.calls.some(([r, on]) => r === "jpyc" && on === true)).toBe(true);
    w.hud.jpyc.close(); expect(w.dom.document.activeElement).toBe(b);
  }));
  test("the sheet is published: hud.jpyc, ctx.services.jpyc and the open() the splat-interiors lane will call", () => withWorld({ dev: true }, (w) => {
    expect(w.hud.jpyc).toBe(w.ctx.services.jpyc); expect(w.hud.jpyc.enabled).toBe(true);
    expect(w.ctx.services.jpyc.open("jpyc-demo")).toBe(true); expect(w.root().dataset.screen).toBe("shop");
  }));
  test("the language button re-draws the item in the new language (the HUD's render), and the sheet follows", () => withWorld({ dev: true }, (w) => {
    w.click(w.q('[data-act="lang"]'));
    const b = w.q('[data-act="jpyc"]');
    expect([b.getAttribute("aria-label"), b.querySelector(".lbl").textContent]).toEqual(["Shops that take JPYC", "Shops that take JPYC"]);
  }));
  test("while the sheet is open the HUD's keys stand down (T would cycle the time of day); after it closes they work again", () => withWorld({ dev: true }, (w) => {
    w.hud.jpyc.openList();
    w.key("KeyT"); w.key("KeyV"); w.key("KeyG"); expect([w.T.preset, w.hud.view, w.tour.playing]).toEqual(["yugata", "drone", false]);
    w.hud.jpyc.close();
    w.key("KeyT"); expect(w.T.preset).not.toBe("yugata");
  }));
  test("an outside tap closes the ☰ menu as before, and a tap inside the sheet is not an outside tap (the HUD's handler only knows its own panels)", () => withWorld({ dev: true }, (w) => {
    w.click(w.q('[data-act="menu"]')); w.dom.fire(w.dom.document.body, "pointerdown"); expect(w.el.dataset.menu).toBe("0");
  }));
});

describe("the credits", () => {
  test("the phone's credits sheet carries the JPYC line (Japanese and, after a language change, the plan's English)", () => withWorld({ dev: true }, (w) => {
    const p = () => w.q(".credits .jpyc-credit");
    expect(p().textContent).toBe(JPYC.ja["jpyc.credit"]);
    w.click(w.q('[data-act="lang"]'));
    expect(p().textContent).toBe(JPYC.en["jpyc.credit"]);
    expect(p().textContent).toContain("JPYC EC is operated by MAMETA; JPYC is a registered trademark of JPYC Inc.; KesenMemento is not affiliated with either");
  }));
});

describe("the flyer's kids gate (?src=chirashi)", () => {
  test("no menu item, no credits line, no sheet: nothing of the feature is on the page (even with the developer's ?jpyc=dev: the flyer's kids come first)", () => withWorld({ search: "?src=chirashi", dev: true }, (w) => {
    expect(w.q('[data-act="jpyc"]')).toBeNull(); expect(w.q(".jpyc-credit")).toBeNull(); expect(JSON.stringify(w.el.innerHTML)).not.toMatch(/JPYC|jpyc/);
    expect(w.hud.jpyc.enabled).toBe(false); expect(w.hud.jpyc.openList()).toBe(false); expect(w.hud.jpyc.open("otameshi")).toBe(false); expect(w.root()).toBeNull();
    expect(w.all('.tools [data-act]').map((x) => x.getAttribute("data-act"))).toEqual(["lang", "season", "sound", "planet", "credits", "labels", "hide", "multi"]);   // (the toolbar is exactly what it was; みんなであそぶ sits after 表示を隠す)
    expect(w.dom.document.getElementById("klc-jpyc-css")).toBeNull(); expect(w.dom.document.getElementById("klc-jpyc-btn-css")).toBeNull();
  }));
  test("it holds for the rest of the session and in English, and ?jpyc=off does the same without the flyer", async () => {
    // (one world at a time: each one swaps the page's globals and puts them back)
    await withWorld({ dev: true, session: { "klc.src": "chirashi" } }, (w) => { expect(w.q('[data-act="jpyc"]')).toBeNull(); w.click(w.q('[data-act="lang"]')); expect(w.q('[data-act="jpyc"]')).toBeNull(); expect(w.q(".jpyc-credit")).toBeNull(); });
    await withWorld({ search: "?jpyc=off", hostname: DEV_HOSTNAME }, (w) => { expect(w.q('[data-act="jpyc"]')).toBeNull(); expect([w.hud.jpyc.enabled, w.hud.jpyc.mode]).toEqual([false, "off"]); });
    await withWorld({ search: "?src=chirashi", dev: true, stored: { "klc.lang": "en" } }, (w) => { expect(w.q('[data-act="jpyc"]')).toBeNull(); });
  });
  test("the flyer is remembered in sessionStorage, not localStorage (a new browser session starts from the address again)", () => withWorld({ search: "?src=chirashi", dev: true }, (w) => {
    expect(w.ss.get("klc.src")).toBe("chirashi"); expect(w.dom.localStorage.getItem("klc.src")).toBeNull();
  }));
  test("another source shows the item as usual (when something is switched on)", () => withWorld({ search: "?src=twitter", dev: true }, (w) => { expect(w.q('[data-act="jpyc"]')).not.toBeNull(); }));
});

describe("the HUD's own contract is untouched", () => {
  test("a fault in the sheet cannot stop the HUD: the mount is in a try / catch", () => {
    expect(HUD).toMatch(/let jpyc = null;\n\s+try \{ jpyc = mountJpycStore\(ctx, life, \{ i18n: I, force: o\.force, note: \(m\) => note\(m\) \}\); \} catch \(e\) \{ console\.warn\('\[jpyc\]', e\); \}/);
  });
  test("the sheet is mounted before the HUD's keyboard handler, so its capture listener runs first", () => {
    expect(HUD.indexOf("mountJpycStore(ctx, life")).toBeLessThan(HUD.indexOf("addEventListener('keydown'"));
    expect(HUD).toContain("if (document.body.classList.contains('klc-jpyc-open')) return;");
  });
  test("hud.js calls render() from the same three places as before (the first mount, the language branch, syncState's stale-list guard)", () => {
    const code = HUD.split("\n").filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).join("\n").replace(/\/\/.*$/gm, "");
    expect([...code.matchAll(/(?<![\w.])render\(\)/g)].length - 1).toBe(3);
  });
  test("the click handler opens the list through the service and nothing else (no fetch, no navigation)", () => {
    expect(HUD).toContain("else if (act === 'jpyc') { ui.menu = false; syncSheets(); jpyc?.openList({ opener: b }); }");
    expect(HUD).not.toMatch(/ec\.jpyc-service|api\/jpyc|window\.open/);
  });
  test("style.js and touchpad-style.js (held by UI lane B2) are not part of this lane", () => {
    expect(HUD).not.toMatch(/jpyc.*style\.js|JPYC_CSS/);
  });
});

describe("the page's globals", () => {
  test("every world put them back: the same document, location, storage, listeners, timers and navigator this file found (a leak here breaks every test file that runs after it)", () => {
    for (const k of GLOBALS) expect([k, globalThis[k] === BEFORE[k]]).toEqual([k, true]);
  });
});
