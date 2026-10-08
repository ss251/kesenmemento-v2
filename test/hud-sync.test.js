// [hud:sync] The HUD stops rebuilding its DOM on every click: syncState() patches the nodes that exist; render() runs for the first mount, a language change and a
// change in the number of tour stops. These drive the real mountHud (ui/hud.js) against a small DOM (test/lib/mini-dom.js): a clicked node is the same element
// after its click, a patched HUD is identical to a rebuilt one (the whole point of having one function that writes the state), an idle sync writes nothing, blur
// happens after pointer clicks only, the tiny-planet note survives, and the ☰ 地名ラベル toggle keeps showing the real state. The real-browser version (the same
// element in Chrome, running transitions, 53 stops) is test/hud-sync.e2e.test.js.
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { makeDom } from "./lib/mini-dom.js";
import { mountHud } from "../src/anime/ui/hud.js";
import { STRINGS } from "../src/anime/ui/i18n.js";
import PLAY from "../data/play-i18n.json";

const ROOT = resolve(import.meta.dir, "..");
const GLOBALS = ["document", "location", "localStorage", "addEventListener", "MutationObserver", "requestAnimationFrame", "setTimeout", "matchMedia"];
const PRESETS = [{ id: "asa", h: 6.5 }, { id: "hiru", h: 12 }, { id: "yugata", h: 16.5 }, { id: "yuyake", h: 17 + 20 / 60 }, { id: "yoru", h: 19.5 }];
const SEASON_ORDER = ["autumn", "winter", "spring", "summer"];
const ARRIVALS = [
  { time: "10:30", vessel: "第三十八福寿丸", type: "まぐろ延縄", typeEn: "Tuna longline", catch: "メカジキ", catchEn: "Swordfish", kg: 1500 },
  { time: "11:10", vessel: "光", type: "さんま棒受網", typeEn: "Saury", catch: "サンマ", kg: 820 },
];

/** A HUD on a mini DOM with fake time / tour / live / season / planet / audio services. Always call cleanup() (it restores the globals). */
// ([emil-ui] phone: a portrait phone with the pad, body.klc-pad and a matching (max-width: 720px) and (orientation: portrait): the chip opens the time sheet there)
function world({ search = "", stops = 8, quality = false, ambient = null, bare = false, stored = {}, phone = false } = {}) {
  const dom = makeDom({ search });
  for (const [k, v] of Object.entries(stored)) dom.localStorage.setItem(k, v);   // (what this device remembered from an earlier visit)
  const saved = Object.fromEntries(GLOBALS.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  const timers = new Set(), realST = globalThis.setTimeout;
  const put = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  const use = () => {   // make this world's document, storage and timers the globals (a test with two worlds switches before each step)
    put("document", dom.document); put("location", dom.location); put("localStorage", dom.localStorage); put("addEventListener", dom.window.addEventListener);
    put("MutationObserver", dom.MutationObserver); put("requestAnimationFrame", (f) => { f(); return 1; });
    put("setTimeout", (f, ms, ...a) => { const id = realST(f, ms, ...a); timers.add(id); return id; });
    put("matchMedia", () => ({ matches: phone, addEventListener() {} }));
  };
  use();
  if (phone) dom.document.body.classList.add("klc-pad");
  const cleanup = () => { for (const id of timers) clearTimeout(id); for (const k of GLOBALS) { if (saved[k]) Object.defineProperty(globalThis, k, saved[k]); else delete globalThis[k]; } };
  try {
    const emitter = () => { const fns = new Set(); return { on: (f) => (fns.add(f), () => fns.delete(f)), emit: (...a) => { for (const f of [...fns]) f(...a); } }; };
    const te = emitter(), ue = emitter(), le = emitter();
    const T = { preset: "yugata", presets: PRESETS, clock: () => "16:30", set(id) { this.preset = id; te.emit(T, "start"); }, onChange: te.on, emit: (why) => te.emit(T, why) };
    const names = ["hero", "market"];   // (real ids have their names in data/i18n.json; the others fall back to ja / en below)
    const stopList = Array.from({ length: stops }, (_, i) => ({ id: names[i] ?? "p" + i, ja: "場所" + i, en: "Place " + i }));
    const tour = { stops: stopList, current: "hero", playing: false, flying: false,
      stop() { this.playing = false; this.flying = false; ue.emit(tour); }, play() { this.playing = true; ue.emit(tour); },
      flyTo(id) { this.current = id; this.flying = true; ue.emit(tour); }, walkTo(id) { this.current = id; ue.emit(tour); return true; },
      add(list) { for (const s of list) stopList.push(s); ue.emit(tour); }, onChange: ue.on, emit: () => ue.emit(tour) };
    const live = { state: { status: "ok", sample: false, stale: false, weather: { sky: "clear", temp: 18.4 }, arrivals: ARRIVALS.slice() }, onChange: le.on, emit: () => le.emit(live) };
    const season = { id: "autumn", next() { this.id = SEASON_ORDER[(SEASON_ORDER.indexOf(this.id) + 1) % SEASON_ORDER.length]; } };
    const audio = { muted: false };
    const planet = { active: false, enter() { this.active = true; }, exit() { this.active = false; } };
    const pad = { calls: [], settings: false, suppress(r, on) { this.calls.push([r, on]); }, openSettings(on) { this.settings = !!on; }, get settingsOpen() { return this.settings; } };
    let amb = ambient;
    const explore = ambient === null ? null : { setAmbientLabels(on) { amb = !!on; }, get ambientLabels() { return amb; } };
    const ctx = bare ? { services: {} } : { planet, audio, pad, time: 0, services: { explore } };   // (bare: the services life or explore may not have built: no planet, audio, pad or explore)
    if (quality) { const sel = dom.document.createElement("select"); sel.id = "quality"; sel.options = [{ value: "high", textContent: "" }, { value: "low", textContent: "" }]; dom.document.body.appendChild(sel); }
    const hud = mountHud(ctx, bare ? { time: T, tour } : { time: T, tour, live, season }, { force: true });   // (bare: no live data and no season module)
    const el = hud.el, q = (s) => el.querySelector(s), all = (s) => [...el.querySelectorAll(s)];
    const click = (node, { pointer = true } = {}) => { if (pointer) node.focus(); return dom.fire(node, "click", { detail: pointer ? 1 : 0 }); };
    const key = (code, props = {}) => dom.fire(dom.document.body, "keydown", { code, repeat: false, ...props });
    const act = (a, extra = "") => q(`[data-act="${a}"]${extra}`);
    const t = (k) => hud.i18n.t(k);
    const renders = () => el.htmlSets;
    /** the nodes a click must not replace: every button, and the panels they live in. */
    const keep = () => [...el.querySelectorAll("button"), ...["brand", "tools", "places", "arrivals", "credits", "dock", "pbar", "note"].map((c) => q("." + c)), q("ul#klc-places"), q("ol")];
    const same = (a, b) => a.length === b.length && a.every((n, i) => n === b[i]);
    /** the HUD as text, with the volatile note cleared: the patched HUD and a rebuilt one must read the same. */
    const snap = () => { const n = q("[data-f=note]"); n.textContent = ""; n.classList.remove("show"); return dom.serialize(el); };
    return { dom, hud, el, q, all, act, click, key, t, renders, keep, same, snap, T, tour, live, season, audio, planet, pad, ctx, explore, setAmbient: (v) => { amb = v; }, use, cleanup, I: hud.i18n };
  } catch (e) { cleanup(); throw e; }
}
const withWorld = (opts, fn) => { const w = world(opts); try { return fn(w); } finally { w.cleanup(); } };

describe("render() runs for the first mount, a language change and a change in the number of stops: nothing else", () => {
  test("the first mount renders once and draws every stop, the five presets and the places header", () => withWorld({}, (w) => {
    expect(w.renders()).toBe(1);
    expect(w.all('[data-act="stop"]').length).toBe(w.tour.stops.length);
    expect(w.all('[data-act="preset"]').length).toBe(5);
    expect(w.q('[data-act="preset"][aria-pressed="true"]').dataset.id).toBe("yugata");
    expect(w.q('[data-f="clock"]').textContent).toBe("16:30");
    expect(typeof w.hud.render).toBe("function");   // contrib's language toggle calls life.hud.render()
    expect(typeof w.hud.syncState).toBe("function");
  }));

  test("every click that is not the language button leaves renders at 1 (a button, a panel, a key, a time or tour event)", () => withWorld({ ambient: false }, (w) => {
    const before = w.keep();
    const clicks = ["menu", "menu", "sheet", "sheet", "credits", "credits-close", "preset", "arrivals", "arrivals", "places", "places", "stop", "auto", "auto", "view", "view", "planet", "planet", "sound", "sound", "labels", "labels", "season", "hide"];
    for (const a of clicks) {
      const b = a === "preset" ? w.q('[data-act="preset"][aria-pressed="false"]') : a === "stop" ? w.all('[data-act="stop"]')[3] : w.act(a);
      w.click(b);
      expect([a, w.renders()]).toEqual([a, 1]);
    }
    for (const code of ["KeyT", "KeyG", "KeyG", "KeyV", "KeyV", "KeyO", "KeyO", "KeyK", "Digit2", "KeyM"]) { w.key(code); expect([code, w.renders()]).toEqual([code, 1]); }
    w.tour.play(); w.key("KeyW"); w.T.emit("end"); w.T.emit("instant"); w.T.emit("hours"); w.tour.emit(); w.live.emit();
    w.dom.fire(w.dom.document.body, "pointerdown");   // outside tap with nothing open
    expect(w.renders()).toBe(1);
    expect(w.same(before, w.keep())).toBe(true);
  }));

  test("a clicked node is the same element after its click (preset, stop, auto, view, arrivals chip, places header, season, planet, sound, labels)", () => withWorld({ ambient: false }, (w) => {
    for (const [a, pick] of [["preset", () => w.q('[data-act="preset"][aria-pressed="false"]')], ["stop", () => w.all('[data-act="stop"]')[2]], ["auto", () => w.act("auto")], ["view", () => w.act("view")], ["arrivals", () => w.act("arrivals")],
      ["places", () => w.act("places")], ["season", () => w.act("season")], ["planet", () => w.act("planet")], ["sound", () => w.act("sound")], ["labels", () => w.act("labels")]]) {
      const node = pick(); w.click(node);
      expect([a, node.isConnected, w.act(a, a === "stop" ? '[data-id="' + node.dataset.id + '"]' : "") === node]).toEqual([a, true, true]);
    }
  }));

  test("a language change rebuilds once, in the new language, and the stops read in it", () => withWorld({}, (w) => {
    const old = w.act("lang");
    w.click(old);
    expect(w.renders()).toBe(2);
    expect(old.isConnected).toBe(false);
    expect(w.el.getAttribute("lang")).toBe("en");
    expect(w.q('[data-act="auto"] span').textContent).toBe(STRINGS.en["v3.tour.auto"]);
    expect(w.all('[data-act="stop"]')[2].textContent).toContain("Place 2");
    w.click(w.act("lang")); expect(w.renders()).toBe(3); expect(w.el.getAttribute("lang")).toBe("ja");
  }));

  test("contrib's language toggle (I.set, then hud.render) rebuilds in the new language and the state survives it", () => withWorld({}, (w) => {
    w.click(w.q('[data-act="preset"][aria-pressed="false"]')); w.click(w.act("arrivals")); w.click(w.act("view"));
    const want = { preset: w.T.preset, arrivals: w.act("arrivals").getAttribute("aria-expanded"), view: w.q('[data-act="view"] span').textContent };
    w.I.set("en"); w.hud.render();
    expect(w.renders()).toBe(2);
    expect(w.q(`[data-act="preset"][aria-pressed="true"]`).dataset.id).toBe(want.preset);
    expect(w.act("arrivals").getAttribute("aria-expanded")).toBe(want.arrivals);
    expect(w.q('[data-act="view"] span').textContent).toBe(PLAY.en["play.avatar.view.walk1"]);   // (the button names the next view: third person, then first person)
    expect(want.view).toBe(PLAY.ja["play.avatar.view.walk1"]);
  }));

  test("explore adds its places after the HUD mounted: the list is rebuilt once, to tour.stops.length, and later clicks do not rebuild it", () => withWorld({ stops: 7 }, (w) => {
    expect(w.all('[data-act="stop"]').length).toBe(7);
    w.tour.add(Array.from({ length: 46 }, (_, i) => ({ id: "x" + i, ja: "新" + i, en: "New " + i })));   // tour.add emits
    expect(w.renders()).toBe(2);
    expect(w.all('[data-act="stop"]').length).toBe(w.tour.stops.length);
    expect(w.tour.stops.length).toBe(53);
    expect(w.q("#klc-places").children?.length ?? w.all("#klc-places li").length).toBeGreaterThan(0);
    for (const a of ["preset", "arrivals", "places", "auto", "season"]) w.click(a === "preset" ? w.q('[data-act="preset"][aria-pressed="false"]') : w.act(a));
    w.tour.emit(); w.T.emit("end");
    expect(w.renders()).toBe(2);
  }));

  test("syncState() itself heals a stale list (a stop added without an emit): one rebuild, no loop", () => withWorld({ stops: 5 }, (w) => {
    w.tour.stops.push({ id: "late", ja: "遅れて", en: "Late" });
    w.hud.syncState();
    expect(w.renders()).toBe(2);
    expect(w.all('[data-act="stop"]').length).toBe(6);
    w.hud.syncState(); expect(w.renders()).toBe(2);
  }));
});

describe("syncState() patches in place: a patched HUD is the HUD a rebuild would draw", () => {
  test("after a long run of every kind of action, serializing the patched DOM equals serializing a rebuilt one, step by step", () => withWorld({ ambient: false }, (w) => {
    const diff = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return `patched: …${a.slice(Math.max(0, i - 80), i + 140)}\n   rebuilt: …${b.slice(Math.max(0, i - 80), i + 140)}`; };
    const step = (name, fn) => { fn(); const patched = w.snap(), r = w.renders(); w.hud.render(); const rebuilt = w.snap(); if (rebuilt !== patched) throw new Error(`${name}: the patched HUD differs from a rebuilt one\n   ${diff(patched, rebuilt)}`); expect(w.renders()).toBe(r + 1); };
    const preset = (id) => () => w.click(w.q(`[data-act="preset"][data-id="${id}"]`));
    step("preset hiru", preset("hiru")); step("preset yoru", preset("yoru"));
    step("arrivals open", () => w.click(w.act("arrivals"))); step("arrivals close", () => w.click(w.act("arrivals")));
    step("places open", () => w.click(w.act("places")));
    step("pick a stop", () => w.click(w.all('[data-act="stop"]')[4]));
    step("auto on", () => w.click(w.act("auto"))); step("key W stops it", () => w.key("KeyW"));
    step("view walk", () => w.click(w.act("view"))); step("view drone (key V)", () => w.key("KeyV"));
    step("season", () => w.click(w.act("season"))); step("season (key K)", () => w.key("KeyK")); step("season", () => w.click(w.act("season"))); step("season", () => w.click(w.act("season")));
    step("planet on", () => w.click(w.act("planet"))); step("planet off (key O)", () => w.key("KeyO"));
    step("sound off", () => w.click(w.act("sound"))); step("sound on", () => w.click(w.act("sound")));
    step("labels on", () => w.click(w.act("labels"))); step("labels off", () => w.click(w.act("labels")));
    step("menu", () => w.click(w.act("menu"))); step("places sheet (☰ 名所)", () => w.click(w.act("sheet", '[data-sheet="places"]')));
    step("credits", () => w.click(w.act("credits"))); step("credits close", () => w.click(w.act("credits-close")));
    step("menu then outside tap", () => { w.click(w.act("menu")); w.dom.fire(w.dom.document.body, "pointerdown"); });
    step("digit key", () => w.key("Digit3")); step("cycle preset (key T)", () => w.key("KeyT"));
    step("a time sweep ends", () => { w.T.set("hiru"); w.T.emit("end"); });
    step("live data changes", () => { w.live.state.arrivals = [{ ...ARRIVALS[0], vessel: "第二十一大徳丸", kg: 37500 }]; w.live.state.weather = { sky: "rain", temp: 9 }; w.live.emit(); });
    step("live goes stale", () => { w.live.state.stale = true; w.live.state.staleAt = "2026-10-05T03:04:00Z"; w.live.emit(); });
    step("live is gone", () => { w.live.state = { status: "error" }; w.live.emit(); });
  }));

  test("[emil-ui] a portrait phone has no bottom pills: the chip opens the time sheet, its 今日の入船 the arrivals, the ☰ 名所 and 操作設定; patched equals rebuilt at every step", () => withWorld({ phone: true, ambient: false }, (w) => {
    const diff = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return `patched: …${a.slice(Math.max(0, i - 80), i + 140)}\n   rebuilt: …${b.slice(Math.max(0, i - 80), i + 140)}`; };
    const step = (name, fn) => { fn(); const patched = w.snap(), r = w.renders(); w.hud.render(); const rebuilt = w.snap(); if (rebuilt !== patched) throw new Error(`${name}: the patched HUD differs from a rebuilt one\n   ${diff(patched, rebuilt)}`); expect(w.renders()).toBe(r + 1); };
    const chip = () => w.q(".brand .chip"), arr = () => w.q(".dock .arr");
    expect([chip().getAttribute("aria-controls"), chip().getAttribute("aria-expanded")]).toEqual(["klc-time", "false"]);
    step("the chip opens the time sheet", () => w.click(chip()));
    expect([w.el.dataset.sheet, chip().getAttribute("aria-expanded"), w.q(".arrivals").hidden, w.pad.calls.at(-1)]).toEqual(["time", "true", true, ["hud-sheet", true]]);
    step("a preset in the sheet", () => w.click(w.q('[data-act="preset"][data-id="yoru"]')));
    step("今日の入船 closes the sheet and opens the arrivals", () => w.click(arr()));
    expect([w.el.dataset.sheet, w.q(".arrivals").hidden, arr().getAttribute("aria-expanded"), chip().getAttribute("aria-expanded"), w.pad.calls.at(-1)]).toEqual(["", false, "true", "true", ["hud-sheet", true]]);   // (the arrivals are the time sheet's on a phone: the chip says they are open)
    step("the chip closes the arrivals (it does not open the sheet over them)", () => w.click(chip()));
    expect([w.q(".arrivals").hidden, w.el.dataset.sheet, chip().getAttribute("aria-expanded")]).toEqual([true, "", "false"]);
    step("a touch outside closes them too, a touch on them does not", () => { w.click(chip()); w.click(arr()); w.dom.fire(w.q(".arrivals"), "pointerdown"); });
    expect(w.q(".arrivals").hidden).toBe(false);
    step("outside", () => w.dom.fire(w.dom.document.body, "pointerdown"));
    expect([w.q(".arrivals").hidden, w.pad.calls.at(-1)]).toEqual([true, ["hud-sheet", false]]);
    step("the chip twice: open, close", () => { w.click(chip()); w.click(chip()); });
    expect([w.el.dataset.sheet, chip().getAttribute("aria-expanded")]).toEqual(["", "false"]);
    step("a touch on the chip is not outside the sheet (it toggles it, it does not reopen it)", () => { w.click(chip()); w.dom.fire(chip(), "pointerdown"); w.click(chip()); });
    expect(w.el.dataset.sheet).toBe("");
    step("☰ then 名所", () => { w.click(w.act("menu")); w.click(w.act("sheet", '[data-sheet="places"]')); });
    expect([w.el.dataset.sheet, w.el.dataset.menu, w.act("sheet", '[data-sheet="places"]').getAttribute("aria-expanded")]).toEqual(["places", "0", "true"]);
    step("☰ then 操作設定", () => { w.click(w.act("menu")); w.click(w.act("padset")); });
    expect([w.el.dataset.menu, w.el.dataset.sheet, w.pad.settings]).toEqual(["0", "", true]);
    step("操作設定 again shuts them (a toggle: the landscape toolbar's icon)", () => w.click(w.act("padset")));
    expect(w.pad.settings).toBe(false);
  }));

  test("an idle sync writes nothing: the second syncState() after any state is a no-op for the DOM", () => withWorld({ ambient: true }, (w) => {
    w.click(w.act("season")); w.click(w.act("view")); w.click(w.act("auto")); w.click(w.act("arrivals")); w.click(w.act("planet")); w.click(w.act("sound"));
    const n = w.dom.writes.length;
    w.hud.syncState(); w.hud.syncState(); w.live.emit(); w.tour.emit(); w.T.emit("end"); w.hud.update(1);
    expect(w.dom.writes.length).toBe(n);
  }));

  test("a preset click writes the two preset buttons, and nothing else", () => withWorld({}, (w) => {   // ([emil-ui] the bottom pill that repeated the time is gone: one clock, the chip's)
    const old = w.q('[data-act="preset"][aria-pressed="true"]'), next = w.q('[data-act="preset"][data-id="yoru"]');
    const n = w.dom.writes.length; w.click(next);
    const touched = new Set(w.dom.writes.slice(n).map((x) => x.node));
    expect([...touched].every((x) => x === old || x === next)).toBe(true);
    expect(next.getAttribute("aria-pressed")).toBe("true"); expect(old.getAttribute("aria-pressed")).toBe("false");
    const n2 = w.dom.writes.length; w.click(next); expect(w.dom.writes.length).toBe(n2);   // the same preset again: nothing changes, nothing is written
  }));

  test("the arrivals rows are replaced only when the data changed (a click leaves the list nodes alone)", () => withWorld({}, (w) => {
    const rows = w.all('[data-f="list"] li'); expect(rows.length).toBe(2);
    w.click(w.act("arrivals")); w.click(w.act("preset")); w.hud.syncState();
    expect(w.same(rows, w.all('[data-f="list"] li'))).toBe(true);
    w.live.state.arrivals = ARRIVALS.slice(0, 1); w.live.emit();
    expect(w.all('[data-f="list"] li').length).toBe(1);
  }));

  test("presets, the arrivals panel, the places panel, the credits sheet and the menu button carry the state as aria / hidden / data attributes", () => withWorld({}, (w) => {
    w.click(w.act("arrivals")); expect([w.act("arrivals").getAttribute("aria-expanded"), w.q(".arrivals").hidden]).toEqual(["true", false]);
    w.click(w.act("arrivals")); expect([w.act("arrivals").getAttribute("aria-expanded"), w.q(".arrivals").hidden]).toEqual(["false", true]);
    w.click(w.act("places")); expect([w.q(".places").dataset.open, w.act("places").getAttribute("aria-expanded"), w.dom.localStorage.getItem("klc.places")]).toEqual(["true", "true", "1"]);
    w.click(w.act("places")); expect([w.q(".places").dataset.open, w.dom.localStorage.getItem("klc.places")]).toEqual(["false", "0"]);
    w.click(w.act("menu")); expect([w.el.dataset.menu, w.act("menu").getAttribute("aria-expanded"), w.dom.document.body.classList.contains("klc-hud-open")]).toEqual(["1", "true", true]);
    w.click(w.act("credits")); expect([w.el.dataset.credits, w.q(".credits").hidden, w.el.dataset.menu, w.act("menu").getAttribute("aria-expanded")]).toEqual(["1", false, "0", "false"]);
    w.click(w.act("credits-close")); expect([w.el.dataset.credits, w.q(".credits").hidden, w.dom.document.body.classList.contains("klc-hud-open")]).toEqual(["0", true, false]);
    w.click(w.act("sheet", '[data-sheet="places"]')); expect([w.el.dataset.sheet, w.act("sheet", '[data-sheet="places"]').getAttribute("aria-expanded")]).toEqual(["places", "true"]);   // ([emil-ui] the ☰ 名所 row; the time sheet's button is the chip on a phone: the phone test below)
    w.click(w.act("menu")); expect([w.el.dataset.sheet, w.el.dataset.menu]).toEqual(["", "1"]);   // the menu closes the sheet
    expect(w.pad.calls.at(-1)).toEqual(["hud-sheet", true]);
    w.dom.fire(w.q(".tools"), "pointerdown"); expect(w.el.dataset.menu).toBe("1");   // inside: stays open
    w.dom.fire(w.dom.document.body, "pointerdown"); expect([w.el.dataset.menu, w.act("menu").getAttribute("aria-expanded"), w.pad.calls.at(-1)]).toEqual(["0", "false", ["hud-sheet", false]]);
  }));

  test("picking a stop folds the places list, moves aria-current and the place names, and flies; the walk view walks", () => withWorld({}, (w) => {
    w.click(w.act("places"));
    const target = w.all('[data-act="stop"]')[3];
    w.click(target);
    expect(w.q(".places").dataset.open).toBe("false");
    expect(w.dom.localStorage.getItem("klc.places")).toBe("1");   // the stored preference stays
    expect(w.tour.current).toBe(target.dataset.id);
    expect(w.all('[data-act="stop"][aria-current="true"]').map((b) => b.dataset.id)).toEqual([target.dataset.id]);
    expect(w.q('[data-f="cur"]').textContent).toBe("場所3");
    w.click(w.act("view")); const walkTo = w.tour.walkTo; let walked = null; w.tour.walkTo = (id) => { walked = id; return walkTo.call(w.tour, id); };
    w.click(w.all('[data-act="stop"]')[5]); expect(walked).toBe(w.all('[data-act="stop"]')[5].dataset.id);
  }));

  test("the tour: auto flips aria-pressed, the icon and the label in place; a key or an outside stop (explore) flips it back", () => withWorld({}, (w) => {
    const btn = w.act("auto"); expect(btn.getAttribute("aria-pressed")).toBe("false"); expect(btn.querySelector("span").textContent).toBe(STRINGS.ja["v3.tour.auto"]);
    w.click(btn); expect([btn.getAttribute("aria-pressed"), btn.querySelector("span").textContent, w.tour.playing]).toEqual(["true", STRINGS.ja["v3.tour.stopAuto"], true]);
    w.tour.stop();   // explore's search / a pad touch stops the tour: only a tour event
    expect([btn.getAttribute("aria-pressed"), btn.querySelector("span").textContent]).toEqual(["false", STRINGS.ja["v3.tour.auto"]]);
    w.click(btn); w.key("KeyW"); expect([btn.getAttribute("aria-pressed"), w.tour.playing]).toEqual(["false", false]);
    expect(w.act("auto")).toBe(btn);
  }));

  test("the view button names the view it switches to, and a camera cut by another module (tour.walkTo / flyTo) does not desync it", () => withWorld({}, (w) => {
    const b = w.act("view"); expect(b.querySelector("span").textContent).toBe(PLAY.ja["play.avatar.view.walk3"]);
    w.click(b); expect(b.querySelector("span").textContent).toBe(PLAY.ja["play.avatar.view.walk1"]);
    w.key("KeyV"); expect(b.querySelector("span").textContent).toBe(PLAY.ja["play.avatar.view.fly"]);
    expect(w.act("view")).toBe(b);
  }));

  test("the season button: the label, the short name (its text node) and the aria-label follow the season, the node stays", () => withWorld({}, (w) => {
    const b = w.act("season");
    for (const id of ["winter", "spring", "summer", "autumn"]) {
      w.click(b);
      expect(w.season.id).toBe(id);
      expect(b.querySelector(".lbl").textContent).toBe(`${w.t("v3.season")} · ${w.t("v3.season." + id)}`);
      expect(b.childNodes.find((n) => n.nodeType === 3).nodeValue).toBe(w.t("v3.season.short." + id));
      expect(b.getAttribute("aria-label")).toBe(`${w.t("v3.season")}: ${w.t("v3.season." + id)}`);
      expect(w.act("season")).toBe(b);
    }
    w.click(b); expect(w.q('[data-f="wx"]').textContent).toBe(w.t("v3.season.view.winter"));   // a season view names itself in the live chip
    expect(w.q('[data-f="wx"]').title).toBe(w.t("v3.season.view.hint"));
  }));

  test("the quality selector is the same node through every click and is re-seated by a language rebuild", () => withWorld({ quality: true }, (w) => {
    const sel = w.dom.document.getElementById("quality"); expect(sel.parentNode).toBe(w.q(".tools"));
    w.click(w.act("preset")); w.click(w.act("season")); expect(w.dom.document.getElementById("quality")).toBe(sel); expect(sel.parentNode).toBe(w.q(".tools"));
    w.click(w.act("lang")); expect(w.dom.document.getElementById("quality")).toBe(sel); expect(sel.parentNode).toBe(w.q(".tools"));
    expect(sel.getAttribute("aria-label")).toBe(STRINGS.en["v3.quality"]);
  }));
});

describe("focus: blur only after a pointer click; a keyboard activation keeps the focus", () => {
  test("a mouse click or a tap (detail 1) blurs the button; Enter / Space (detail 0) does not, and the node survives to hold the focus", () => withWorld({}, (w) => {
    const chip = w.act("arrivals");
    w.click(chip, { pointer: true });
    expect(w.dom.document.blurs).toContain(chip); expect(w.dom.document.activeElement).not.toBe(chip);
    w.dom.document.blurs.length = 0;
    chip.focus(); w.click(chip, { pointer: false });   // keyboard: it is focused already, the click has detail 0
    expect(w.dom.document.blurs).toEqual([]); expect(w.dom.document.activeElement).toBe(chip); expect(w.act("arrivals")).toBe(chip);
    for (const a of ["places", "auto", "view", "season", "sound"]) { const b = w.act(a); b.focus(); w.click(b, { pointer: false }); expect([a, w.dom.document.activeElement === b]).toEqual([a, true]); }
    for (const [a, extra] of [["menu", ""], ["sheet", '[data-sheet="places"]'], ["credits", ""]]) { const b = w.act(a, extra); w.click(b, { pointer: true }); expect([a, w.dom.document.blurs.includes(b)]).toEqual([a, true]); }
  }));

  test("a keyboard user who toggles the language lands on the new language button; a pointer user does not get focus", () => withWorld({}, (w) => {
    w.act("lang").focus(); w.click(w.act("lang"), { pointer: false });
    expect(w.dom.document.activeElement).toBe(w.act("lang")); expect(w.act("lang").isConnected).toBe(true);
    w.click(w.act("lang"), { pointer: true });
    expect(w.dom.document.activeElement).not.toBe(w.act("lang"));
  }));

  test("a press that straddles a time sweep is not lost: the preset button is still in the page when the sweep ends, so its click lands", () => withWorld({}, (w) => {
    const target = w.q('[data-act="preset"][data-id="yuyake"]');   // pointer down on 夕焼け ...
    w.T.emit("end");   // ... the previous sweep ends under the finger (it used to rebuild the HUD here) ...
    expect(target.isConnected).toBe(true); expect(w.q('[data-act="preset"][data-id="yuyake"]')).toBe(target);
    w.click(target);   // ... and the finger lifts
    expect(w.T.preset).toBe("yuyake"); expect(target.getAttribute("aria-pressed")).toBe("true");
  }));
});

describe("the tiny-planet note shows, and the notes of the other actions are not wiped by the next line", () => {
  test("planet on: the hint is on the note node, visible, and the same node survives (it was written, then replaced by render())", () => withWorld({}, (w) => {
    const note = w.q('[data-f="note"]');
    w.click(w.act("planet"));
    expect(w.planet.active).toBe(true);
    expect(w.q('[data-f="note"]')).toBe(note); expect(note.isConnected).toBe(true);
    expect(note.textContent).toBe(w.t("v3.planet.note")); expect(note.textContent.length).toBeGreaterThan(5);
    expect(note.classList.contains("show")).toBe(true);
    expect(w.act("planet").getAttribute("aria-pressed")).toBe("true");
    w.click(w.act("sound")); w.click(w.act("preset")); w.hud.syncState();
    expect(note.textContent).toBe(w.t("v3.planet.note")); expect(note.classList.contains("show")).toBe(true);   // later syncs leave it alone
  }));

  test("the key O does the same, and leaving the planet clears the pressed state (an exit from another module is picked up by the next tour event)", () => withWorld({}, (w) => {
    w.key("KeyO"); expect(w.q('[data-f="note"]').textContent).toBe(w.t("v3.planet.note")); expect(w.act("planet").getAttribute("aria-pressed")).toBe("true");
    w.planet.exit(); w.tour.flyTo("market");   // explore's search picks a place: it exits the planet, then flies
    expect(w.act("planet").getAttribute("aria-pressed")).toBe("false");
  }));

  test("season and the other notes: the text shows after the sync and stays on the same node", () => withWorld({}, (w) => {
    const note = w.q('[data-f="note"]'); w.click(w.act("season"));
    expect(note.textContent).toBe(`${w.t("v3.season")} · ${w.t("v3.season.winter")}`); expect(note.classList.contains("show")).toBe(true);
    expect(w.q('[data-f="note"]')).toBe(note);
  }));
});

describe("the ☰ 地名ラベル toggle shows the real state (explore publishes ambientLabels after the HUD's first render)", () => {
  test("explore not loaded yet: the toggle is off and a click does nothing (and nothing throws)", () => withWorld({ ambient: null }, (w) => {
    const b = w.act("labels"); expect(b.getAttribute("aria-pressed")).toBe("false");
    w.click(b); expect(b.getAttribute("aria-pressed")).toBe("false");
  }));

  test("published later as ON (?labels=1 or a remembered 'on'): the state is read when the ☰ menu opens, and on every other sync", () => withWorld({ ambient: null }, (w) => {
    const b = w.act("labels"); expect(b.getAttribute("aria-pressed")).toBe("false");
    let on = true; w.ctx.services.explore = { setAmbientLabels(v) { on = !!v; }, get ambientLabels() { return on; } };
    w.click(w.act("menu"));   // the ☰ menu opens
    expect(b.getAttribute("aria-pressed")).toBe("true");
    w.click(w.act("menu"));
    on = false; w.click(w.act("preset"));   // a later sync (any click) re-reads it too
    expect(b.getAttribute("aria-pressed")).toBe("false");
    expect(w.act("labels")).toBe(b); expect(w.renders()).toBe(1);
  }));

  test("tapping the toggle flips the state and the pressed attribute together, on the same node, as often as you like", () => withWorld({ ambient: false }, (w) => {
    const b = w.act("labels");
    for (const want of [true, false, true]) { w.click(b); expect([w.explore.ambientLabels, b.getAttribute("aria-pressed")]).toEqual([want, String(want)]); }
    expect(w.act("labels")).toBe(b);
  }));

  test("a rebuild (language) keeps showing the real state", () => withWorld({ ambient: true }, (w) => {
    w.click(w.act("menu")); expect(w.act("labels").getAttribute("aria-pressed")).toBe("true");
    w.click(w.act("lang")); expect(w.act("labels").getAttribute("aria-pressed")).toBe("true");
    w.setAmbient(false); w.click(w.act("menu")); w.click(w.act("menu")); expect(w.act("labels").getAttribute("aria-pressed")).toBe("false");
  }));
});

describe("a HUD patched through a long random history is the HUD a rebuild after every step would draw", () => {
  const rng = (seed) => { let x = seed >>> 0; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296); };
  /** One step of a visitor's history, as data (so two worlds get exactly the same one). */
  const step = (r, i) => {
    const n = (k) => Math.floor(r() * k), pick = (xs) => xs[n(xs.length)];
    const kind = pick(["click", "click", "click", "click", "key", "time", "tour", "live", "outside", "planetExit", "labelsExt", "add"]);
    if (kind === "click") {
      const act = pick(["menu", "sheet", "sheet", "credits", "credits-close", "preset", "preset", "arrivals", "places", "stop", "stop", "auto", "view", "season", "planet", "sound", "labels", "hide", "lang"]);
      if (act === "lang" && r() < 0.7) return { kind: "tour" };   // (a language change is rare, and rebuilds)
      return { kind, act, id: pick(PRESETS).id, sheet: pick(["places", "time"]), stop: n(8), pointer: r() < 0.7 };
    }
    if (kind === "key") return { kind, code: pick(["KeyT", "KeyG", "KeyV", "KeyO", "KeyK", "KeyW", "Digit2", "Digit5", "KeyM"]) };
    if (kind === "time") return { kind, why: pick(["end", "instant", "hours"]), id: pick(PRESETS).id };
    if (kind === "live") return { kind, kg: 100 + n(40000), sky: pick(["clear", "cloudy", "rain", "snow"]), rows: n(5), stale: r() < 0.3 };
    if (kind === "labelsExt") return { kind, on: r() < 0.5 };
    if (kind === "add") return { kind, id: "new" + i };
    return { kind, stop: n(8) };
  };
  const apply = (w, op) => {
    w.use();
    const stopBtn = () => w.all('[data-act="stop"]')[op.stop % Math.max(1, w.all('[data-act="stop"]').length)];
    if (op.kind === "click") {
      const b = op.act === "preset" ? w.q(`[data-act="preset"][data-id="${op.id}"]`) : op.act === "sheet" ? w.q(`[data-act="sheet"][data-sheet="${op.sheet}"]`) : op.act === "stop" ? stopBtn() : w.act(op.act);
      if (b) w.click(b, { pointer: op.pointer });
    } else if (op.kind === "key") w.key(op.code);
    else if (op.kind === "time") { if (op.why !== "end") w.T.preset = op.id; w.T.emit(op.why); }
    else if (op.kind === "tour") w.tour.emit();
    else if (op.kind === "live") { w.live.state = { status: "ok", sample: false, stale: op.stale, staleAt: "2026-10-05T03:04:00Z", weather: { sky: op.sky, temp: 12 }, arrivals: ARRIVALS.concat(ARRIVALS).slice(0, op.rows).map((a) => ({ ...a, kg: op.kg })) }; w.live.emit(); }
    else if (op.kind === "outside") w.dom.fire(w.dom.document.body, "pointerdown");
    else if (op.kind === "planetExit") { w.planet.exit(); w.tour.flyTo(w.tour.stops[op.stop % w.tour.stops.length].id); }   // (explore's place pick: it exits the planet, then flies: a tour event follows)
    else if (op.kind === "labelsExt") { w.setAmbient(op.on); w.tour.emit(); }   // (a change from outside is picked up by the next sync; here, a tour event)
    else if (op.kind === "add") { if (w.tour.stops.length < 14) w.tour.add([{ id: op.id, ja: "新" + op.id, en: "New " + op.id }]); }
  };
  const diff = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return `patched: …${a.slice(Math.max(0, i - 90), i + 150)}\n   rebuilt: …${b.slice(Math.max(0, i - 90), i + 150)}`; };

  for (const seed of [1, 7, 42, 2026]) {
    test(`seed ${seed}: 300 steps of clicks, keys, time, tour and live events (the second HUD is rebuilt by render() after every step, as the old one was)`, () => {
      const A = world({ ambient: false }), B = world({ ambient: false });   // (B is created second: cleanup runs in the opposite order, so the globals come back right)
      try {
        const r = rng(seed); let rebuilt = 0;
        for (let i = 0; i < 300; i++) {
          const op = step(r, i);
          apply(A, op); apply(B, op); B.use(); const before = B.renders(); B.hud.render(); rebuilt += B.renders() - before;
          A.use(); const a = A.snap(); B.use(); const b = B.snap();
          if (a !== b) throw new Error(`step ${i} ${JSON.stringify(op)}: the patched HUD differs from a rebuilt one\n   ${diff(a, b)}`);
          const state = (w) => [w.T.preset, w.tour.current, w.tour.playing, w.season.id, w.planet.active, w.audio.muted, w.explore.ambientLabels, w.tour.stops.length].join("|");
          expect([i, state(A)]).toEqual([i, state(B)]);
          expect([i, A.dom.document.body.className, A.pad.calls.at(-1)?.join()]).toEqual([i, B.dom.document.body.className, B.pad.calls.at(-1)?.join()]);
        }
        expect(rebuilt).toBe(300);                                // B really was rebuilt every step
        expect(A.renders()).toBeLessThanOrEqual(1 + 20 + 10);     // A: the mount, the odd language click, and one rebuild per tour.add (at most 6 here), nothing else
      } finally { B.cleanup(); A.cleanup(); }
    }, 60000);   // (about 1 s on an idle machine, 5 to 7 s in the full suite on a loaded one: bun's default is 5 s)
  }
});

describe("a HUD without the optional services still mounts, syncs and survives every click", () => {
  test("no season, live data, planet, audio, pad or explore: every button and key works, only the language rebuilds", () => withWorld({ bare: true }, (w) => {
    expect(w.q(".season")).toBeNull();
    expect(w.q('[data-f="wx"]').textContent).toBe(STRINGS.ja["v3.loadingLive"]);   // no live data yet
    for (const a of ["menu", "menu", "sheet", "credits", "credits-close", "arrivals", "arrivals", "places", "places", "auto", "auto", "view", "view", "planet", "sound", "sound", "labels", "hide", "report"]) {
      const b = w.act(a); if (!b) continue;   // (report is the contrib button: not mounted here)
      expect(() => w.click(b)).not.toThrow();
    }
    for (const code of ["KeyT", "KeyG", "KeyG", "KeyV", "KeyV", "KeyO", "KeyK", "KeyM", "Digit1", "KeyW"]) expect(() => w.key(code)).not.toThrow();
    expect(() => { w.hud.syncState(); w.T.emit("end"); w.tour.emit(); w.hud.update(1); }).not.toThrow();
    expect(w.renders()).toBe(1);
    expect(() => w.click(w.act("lang"))).not.toThrow(); expect(w.renders()).toBe(2);
  }));

  test("a time preset the dock does not know (a photo look) presses nothing and does not throw; an empty tour draws an empty list", () => withWorld({ stops: 0 }, (w) => {
    expect(w.all('[data-act="stop"]').length).toBe(0);
    expect(w.q('[data-f="cur"]').textContent).toBe("");
    w.T.preset = "photo"; expect(() => w.hud.syncState()).not.toThrow();
    expect(w.all('[data-act="preset"][aria-pressed="true"]').length).toBe(0);
    expect(w.q('[data-f="clock"]').textContent).toBe("16:30");   // no preset: the chip's clock
    w.click(w.act("arrivals")); w.click(w.act("places")); expect(w.renders()).toBe(1);
    w.tour.add([{ id: "x", ja: "一", en: "One" }]); expect(w.renders()).toBe(2); expect(w.all('[data-act="stop"]').length).toBe(1);
  }));
});

describe("the first mount honours the address and the stored preference", () => {
  test("?arrivals=1&places=1: both panels start open, and the minimap and the pad know it from the first sync", () => withWorld({ search: "?arrivals=1&places=1" }, (w) => {
    expect([w.q(".arrivals").hidden, w.act("arrivals").getAttribute("aria-expanded"), w.q(".places").dataset.open, w.act("places").getAttribute("aria-expanded")]).toEqual([false, "true", "true", "true"]);
    expect(w.dom.document.body.classList.contains("klc-hud-open")).toBe(true);
    expect(w.pad.calls.at(-1)).toEqual(["hud-sheet", true]);
    w.click(w.act("arrivals")); expect(w.dom.document.body.classList.contains("klc-hud-open")).toBe(false);
  }));
  test("without a query the places panel follows the stored klc.places, and closed is the default", () => {
    withWorld({}, (w) => { expect(w.q(".places").dataset.open).toBe("false"); expect(w.q(".arrivals").hidden).toBe(true); expect(w.pad.calls.at(-1)).toEqual(["hud-sheet", false]); });
    withWorld({ stored: { "klc.places": "1" } }, (w) => { expect([w.q(".places").dataset.open, w.act("places").getAttribute("aria-expanded")]).toEqual(["true", "true"]); w.click(w.act("places")); expect(w.dom.localStorage.getItem("klc.places")).toBe("0"); });
    withWorld({ search: "?places=0", stored: { "klc.places": "1" } }, (w) => { expect(w.q(".places").dataset.open).toBe("false"); });   // (the address wins over the stored choice)
  });
});

describe("what the plan said not to touch", () => {
  const src = readFileSync(resolve(ROOT, "src/anime/ui/hud.js"), "utf8");
  test("render() is called from exactly three places: the first mount, the language branch, and syncState's stale-list guard", () => {
    const code = src.split("\n").filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).join("\n").replace(/\/\/.*$/gm, "");
    const calls = [...code.matchAll(/(?<![\w.])render\(\)/g)].length - 1;   // minus the declaration `function render()`
    expect(calls).toBe(3);
    expect(code).toMatch(/render\(\); show\(\);/);
    expect(code).toMatch(/act === 'lang'\) \{[^}]*render\(\);/);
    expect(code).toMatch(/tour\.stops\.length !== stopsDrawn\) \{ render\(\); return; \}/);
  });
  test("markup, class names, data-act values and aria attributes are the ones the e2e suites read", () => {
    for (const a of ["menu", "arrivals", "lang", "season", "sound", "planet", "credits", "labels", "hide", "places", "stop", "auto", "preset", "view", "photo", "sheet", "credits-close", "padset"]) expect(src).toContain(`data-act="${a}"`);
    // ([emil-ui] class="pbar" went with the bottom pill row; the time sheet is #klc-time and holds 今日の入船, the ☰ holds 名所 and 操作設定)
    for (const c of ['class="chip glass"', 'class="arrivals glass"', 'class="places glass"', 'class="dock glass"', 'id="klc-time"', 'class="pill arr"', 'class="round glass prow"', 'class="round glass pset"', 'class="note glass"', 'id="klc-places"', 'id="klc-menu"']) expect(src).toContain(c);
    expect(src).not.toContain('class="pbar"');
  });
});
