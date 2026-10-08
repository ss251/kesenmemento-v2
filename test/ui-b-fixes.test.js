// [ui-b] UI lane B of the pre-demo fix batch (the UI round notes (ui-b, not included)): rows 8, 11, 13 and 12 of the UI review (not included), as unit tests.
// The CSS is read by a small parser (so a rule is found by selector and at-rule, not by its exact spelling); the markup and the handlers run on a
// minimal DOM stub. The real-browser checks of the same rows are in test/ui-b.e2e.test.js (opt-in, through the machine gate).
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { styleBlocks } from "./lib/css-rules.js";

const ROOT = resolve(import.meta.dir, "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

/** CSS -> [{ at: ['@media (max-height: 460px)'], sel: '#intro .board', decl: { display: 'flex' } }] (comments dropped, nested at-rules kept as a path, one entry per selector). */
function parseCss(css) {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [];
  const walk = (text, at) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf("{", i);
      if (open < 0) break;
      const head = text.slice(i, open).trim().replace(/\s+/g, " ");
      let depth = 1, j = open + 1;
      while (j < text.length && depth) { const c = text[j++]; if (c === "{") depth++; else if (c === "}") depth--; }
      const body = text.slice(open + 1, j - 1);
      if (head.startsWith("@media") || head.startsWith("@supports")) walk(body, [...at, head]);
      else if (!head.startsWith("@")) {
        const decl = {};
        for (const d of body.split(";")) { const k = d.indexOf(":"); if (k > 0) decl[d.slice(0, k).trim()] = d.slice(k + 1).trim().replace(/\s+/g, " "); }
        for (const sel of head.split(",")) rules.push({ at, sel: sel.trim().replace(/\s+/g, " "), decl });
      }
      i = j;
    }
  };
  walk(src, []);
  return rules;
}
/** The last declaration of `prop` on rules with exactly this selector, inside exactly this at-rule path. */
const decl = (rules, sel, prop, at = []) => {
  const hit = rules.filter((r) => r.sel === sel && r.at.join("|") === at.join("|") && prop in r.decl);
  return hit.length ? hit.at(-1).decl[prop] : undefined;
};
// A template-literal CSS constant out of a source file: the text between the opening backtick after `name` and the line that closes it.
const cssIn = (src, name) => { const i = src.indexOf(name); const a = src.indexOf("`", i), b = src.indexOf("\n`;", a); expect(i).toBeGreaterThan(-1); return src.slice(a + 1, b); };

// ------------------------------------------------------------------------------------------------------------ row 8: the intro card
// The station-name card of rows 8 and 9 was replaced by the 「帰港」 loading screen and title screen (docs/loading/README.md). Its contract (fits short landscape screens, 100dvh behind
// @supports, an exit, no focus ring on a touch screen, 「まちへ出る」 reachable and not covered) is pinned in test/loader.test.js and, in a real browser, in test/ui-b.e2e.test.js row 8.

// ------------------------------------------------------------------------------------------------------------ row 11: the ship UI's top bar
function stubDom() {
  const mk = () => ({ id: "", hidden: false, innerHTML: "", textContent: "", style: {}, attrs: {}, dataset: {}, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(type, fn) { this.on = fn; }, querySelectorAll() { return []; }, querySelector() { return null; }, appendChild() {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } } });
  return { getElementById: () => null, createElement: () => mk(), head: mk(), body: mk() };
}
/** The ship UI's tools row on a view (the machine is stepped there legally, as the voyage's jump() does, so a card gets its real data). */
async function shipBar(lang, view = "DOCKED", target = "DOCKED") {
  const { mountShipUI } = await import("../src/anime/ui/ship.js");
  const { createActs } = await import("../src/anime/world/ship/acts.js");
  const { fastForward } = await import("../src/anime/world/ship/voyage.js");
  const acts = createActs({}); fastForward(acts, target);
  const prev = globalThis.document;
  globalThis.document = stubDom();
  try { const ui = mountShipUI({}, { lang }); ui.show(acts.state, acts.data); expect(acts.state).toBe(view === target ? target : acts.state); return ui.el.innerHTML.match(/<div class="tools">[\s\S]*?<\/div><\/div>/)[0]; }
  finally { if (prev === undefined) delete globalThis.document; else globalThis.document = prev; }
}
describe("ui-b row 11: the ship UI's top bar is reachable over the card scrim, one line, 44 px", () => {
  const src = read("src/anime/ui/ship.js"), R = parseCss(cssIn(src, "const CSS = /* css */"));
  test("the bar paints above the card scrim (.top z-index 2), so 船のデータ / EN / 町へ戻る take the tap; the card starts under the bar on every layout", () => {
    expect(decl(R, "#klc-ship .top", "z-index")).toBe("2");
    expect(decl(R, "#klc-ship .top", "position")).toBe("absolute");
    expect(decl(R, "#klc-ship .card", "z-index")).toBeUndefined();   // (the scrim stays auto: .top wins by number, not by order)
    expect(decl(R, "#klc-ship .card", "padding")).toMatch(/^calc\(63px \+ env\(safe-area-inset-top,0px\)\) /);
    expect(src).toContain("body.klc-pad #klc-ship .card{padding-top:calc(63px + env(safe-area-inset-top,0px))}");   // (the phone rule stays: tests/integrate-fix1 pins it)
  });
  test("labels never wrap: nowrap on the act chips and on the tools, tools do not shrink, and the two groups wrap as groups on a screen too narrow for both", () => {
    expect(decl(R, "#klc-ship .acts span", "white-space")).toBe("nowrap");
    expect(decl(R, "#klc-ship .tools button", "white-space")).toBe("nowrap");
    expect(decl(R, "#klc-ship .tools button", "flex")).toBe("none");
    expect(decl(R, "#klc-ship .top", "flex-wrap")).toBe("wrap");
    expect(decl(R, "#klc-ship .tools", "margin-left")).toBe("auto");   // (a wrapped tools row hugs the right edge)
  });
  test("the tools are 44 px (they were 40)", () => {
    expect(decl(R, "#klc-ship .tools button", "min-height")).toBe("44px");
    expect(decl(R, "#klc-ship button", "min-height")).toBe("44px");
  });
  test("narrow screens: short English labels under 480 px, a tighter bar under 420 px", () => {
    expect(decl(R, "#klc-ship .tools .ls", "display")).toBe("none");
    expect(decl(R, "#klc-ship .tools .lf", "display", ["@media (max-width:480px)"])).toBe("none");
    expect(decl(R, "#klc-ship .tools .ls", "display", ["@media (max-width:480px)"])).toBe("inline");
    const N = ["@media (max-width:420px)"];
    expect(decl(R, "#klc-ship .tools button", "padding", N)).toBe("0 10px");
    expect(decl(R, "#klc-ship .tools button", "font-size", N)).toBe("12px");
    expect(decl(R, "#klc-ship .acts span", "padding", N)).toBe("6px 6px");
  });
  test("the facts panel keeps its scroll to itself", () => { expect(decl(R, "#klc-ship .facts", "overscroll-behavior")).toBe("contain"); });
  test("English: 船のデータ / 町へ戻る carry a short form (Facts / Town) and keep the full label as their accessible name; 日本語 has none", async () => {
    const bar = await shipBar("en");
    expect(bar).toContain('<button data-a="facts" aria-pressed="false" aria-label="Ship facts"><span class="lf">Ship facts</span><span class="ls">Facts</span></button>');
    expect(bar).toContain('<button data-a="exit" aria-label="Back to town"><span class="lf">Back to town</span><span class="ls">Town</span></button>');
    expect(bar).toContain('<button data-a="lang">日本語</button>');
  });
  test("Japanese: the labels are as before (no second form to show)", async () => {
    const bar = await shipBar("ja");
    expect(bar).toContain('<button data-a="facts" aria-pressed="false">船のデータ</button>');
    expect(bar).toContain('<button data-a="lang">EN</button>');
    expect(bar).toContain('<button data-a="exit">町へ戻る</button>');
    expect(bar).not.toContain('class="lf"');
  });
  test("the bar is the same on every beat, the four card beats (under the scrim) included", async () => {
    const dock = await shipBar("en", "DOCKED");
    for (const beat of ["TRANSSHIP_LAS_PALMAS", "REEFER", "SHIMIZU_WEIGH", "HOMECOMING", "CARD"]) expect(await shipBar("en", beat, beat)).toBe(dock);
  });
  test("data/ship/i18n.json: both languages carry the short forms, in the same key order; Japanese keeps the full text, English is shorter", () => {
    const D = JSON.parse(read("data/ship/i18n.json"));
    expect(Object.keys(D.en)).toEqual(Object.keys(D.ja));
    for (const k of ["ship.btn.facts", "ship.btn.exit"]) {
      expect(D.ja[k + ".short"]).toBe(D.ja[k]);
      expect(D.en[k + ".short"].length).toBeGreaterThan(0); expect(D.en[k + ".short"].length).toBeLessThan(D.en[k].length);
    }
    expect(D.en["ship.btn.facts.short"]).toBe("Facts"); expect(D.en["ship.btn.exit.short"]).toBe("Town");
  });
});

// ------------------------------------------------------------------------------------------------------------ a DOM stub for the explore UI and the story card
/** An element that records what the module does to it. querySelector(sel) hands back the same stub for the same selector, so a test finds the input and the sheet. */
function makeEl() {
  const attrs = {}, listeners = {}, nodes = new Map();
  const el = {
    tagName: "DIV", id: "", hidden: false, value: "", innerHTML: "", textContent: "", placeholder: "", lang: "", className: "", disabled: false, focused: false,
    dataset: {}, nodes, attrs, listeners,
    style: { props: {}, setProperty(k, v) { this.props[k] = v; }, getPropertyValue(k) { return this.props[k] ?? ""; }, removeProperty(k) { delete this.props[k]; } },
    classList: { _s: new Set(), add(...c) { c.forEach((x) => this._s.add(x)); }, remove(...c) { c.forEach((x) => this._s.delete(x)); }, toggle(c, on) { (on ?? !this._s.has(c)) ? this._s.add(c) : this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    setAttribute(k, v) { attrs[k] = String(v); }, getAttribute(k) { return k in attrs ? attrs[k] : null; }, hasAttribute(k) { return k in attrs; }, removeAttribute(k) { delete attrs[k]; },
    addEventListener(t, f) { (listeners[t] ||= []).push(f); }, removeEventListener(t, f) { listeners[t] = (listeners[t] || []).filter((x) => x !== f); },
    fire(t, ev = {}) { const e = { stopPropagation() { e.stopped = true; }, preventDefault() { e.prevented = true; }, target: el, ...ev }; (listeners[t] || []).forEach((f) => f(e)); return e; },
    appendChild(c) { return c; }, focus() { el.focused = true; }, blur() { el.focused = false; }, scrollIntoView() {}, setPointerCapture() {},
    querySelector(sel) { if (!nodes.has(sel)) nodes.set(sel, makeEl()); return nodes.get(sel); }, querySelectorAll() { return []; }, closest() { return null; },
    getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; }, getContext() { return null; }, clientWidth: 0, clientHeight: 0,
  };
  return el;
}
const PLACES = [
  { id: "p1", ja: "気仙沼駅", en: "Kesennuma Station", cat: "station", at: [100, 100], group: "places" },
  { id: "p2", ja: "気仙沼市役所", en: "Kesennuma City Hall", cat: "townhall", at: [300, -200], group: "places" },
];
/** Mount the explore UI on stubs. `vv` is a visualViewport stub (or null), `hud` the HUD's i18n holder; returns the UI, its element and the spies. */
async function mountExplore({ vv = null, hud = { lang: "ja" } } = {}) {
  const { mountExploreUI } = await import("../src/anime/world/explore/ui.js");
  const g = globalThis, keys = ["document", "matchMedia", "MutationObserver", "innerWidth", "innerHeight", "devicePixelRatio", "addEventListener", "visualViewport"], prev = {};
  for (const k of keys) prev[k] = Object.getOwnPropertyDescriptor(g, k);
  const win = {};
  const define = (k, v) => Object.defineProperty(g, k, { value: v, configurable: true, writable: true });
  define("document", { getElementById: () => null, createElement: () => makeEl(), head: makeEl(), body: makeEl() });
  define("matchMedia", (q) => ({ matches: false, media: q, addEventListener() {} }));
  define("MutationObserver", class { observe() {} });
  define("innerWidth", 390); define("innerHeight", 844); define("devicePixelRatio", 1);
  define("addEventListener", (t, f) => { (win[t] ||= []).push(f); });
  define("visualViewport", vv ?? undefined);
  const spies = { flown: [], pinned: [], relang: [], stopped: 0 };
  const ctx = {
    L: { CREDITS: "credits", heightAt: () => 0 }, THREE: {}, camera: { position: { x: 0, y: 0, z: 0 }, fov: 50, aspect: 1 }, pad: { suppress() {} },
    services: { explore: { story: { card: { relang: (l) => spies.relang.push(l) } } } },
  };
  const life = { hud: { i18n: hud }, tour: { stops: [], stop() { spies.stopped++; }, flyTo(f) { spies.flown.push(f); } } };
  const search = { featured: () => PLACES, find: () => PLACES, areaAt: () => null, all: PLACES };
  const places = { frame: () => ({ drone: { pos: [0, 50, 0], look: [1, 0, 1] }, walk: null }), labelItem: (p) => ({ id: p.id }), walkAt: () => null };
  const labels = { pinned: null, items: [], pin: (it) => spies.pinned.push(it.id) };
  try {
    const ui = mountExploreUI(ctx, { life, drive: null, net: { nearest: () => null }, bm: null, labels, places, search, force: true });
    const sheet = ui.el.querySelector(".xsearch"), input = ui.el.querySelector(".xsearch input");
    return { ui, el: ui.el, sheet, input, spies, win, ctx, restore() { for (const k of keys) { if (prev[k]) Object.defineProperty(g, k, prev[k]); else delete g[k]; } } };
  } catch (e) { for (const k of keys) { if (prev[k]) Object.defineProperty(g, k, prev[k]); else delete g[k]; } throw e; }
}

// ------------------------------------------------------------------------------------------------------------ row 13: the story card
describe("ui-b row 13: the story card stays on the screen, scrolls by touch, follows the language", () => {
  const src = read("src/anime/world/explore/storypins.js"), R = parseCss(cssIn(src, "const CSS = /* css */"));
  test("border-box on the card and everything in it: 400 px of width plus its padding and border was 434 px, and stuck 18 px off a 375 px screen", () => {
    expect(decl(R, "#klc-story", "box-sizing")).toBe("border-box"); expect(decl(R, "#klc-story *", "box-sizing")).toBe("border-box");
    expect(decl(R, "#klc-story", "width")).toBe("min(400px,calc(100% - 32px))");
    expect(decl(R, "#klc-story", "left")).toBe("16px");
  });
  test("it starts below the notch's inset, and its height follows the visible viewport (dvh after a vh fallback)", () => {
    expect(decl(R, "#klc-story", "top")).toBe("calc(124px + env(safe-area-inset-top,0px))");
    expect(src).toMatch(/max-height:calc\(100vh - 290px\);max-height:calc\(100dvh - 290px\)/);
    expect(src).toMatch(/\(max-width:520px\)\{#klc-story\{top:calc\(112px \+ env\(safe-area-inset-top,0px\)\);max-height:calc\(100vh - 300px\);max-height:calc\(100dvh - 300px\)\}/);
  });
  test("a phone on its side: the left 46 % from the top, inside the insets, down to the time dock (round 2: it ran to the bottom of the screen and covered the dock's top 16 px); the last rule of the sheet, so it wins over the narrow-width rule", () => {
    const L = ["@media (max-height:520px) and (orientation:landscape)"];
    expect(decl(R, "#klc-story", "top", L)).toBe("calc(12px + env(safe-area-inset-top,0px))");
    expect(decl(R, "#klc-story", "left", L)).toBe("calc(12px + env(safe-area-inset-left,0px))");
    expect(decl(R, "#klc-story", "width", L)).toBe("min(380px,46vw)");
    expect(decl(R, "#klc-story", "max-height", L)).toBe("calc(100dvh - 104px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px))");   // [ui-b2] 24 px of margins, now 12 px on top plus the dock's 26 + 56 and 10 px of air
    expect(decl(R, "#klc-story", "max-height", L)).not.toContain("24px");
    expect(src.lastIndexOf("(orientation:landscape)")).toBeGreaterThan(src.lastIndexOf("(max-width:520px)"));
  });
  test("a touch screen gets a 44 px close button, and the title leaves room for it", () => {
    const C = ["@media (pointer:coarse)"];
    expect(decl(R, "#klc-story .x", "width", C)).toBe("44px"); expect(decl(R, "#klc-story .x", "height", C)).toBe("44px");
    expect(decl(R, "#klc-story h3", "margin-right", C)).toBe("40px");
    expect(decl(R, "#klc-story .x", "width")).toBe("36px");   // (a mouse keeps the 36 px disc)
    // beside that button the title wraps in two lines: balanced, at phrase boundaries, so one character (マグ|ロ) is not left on its own line
    expect(decl(R, "#klc-story h3", "text-wrap")).toBe("balance"); expect(decl(R, "#klc-story h3", "word-break")).toBe("auto-phrase");
  });
  test("the card keeps its scroll to itself", () => { expect(decl(R, "#klc-story", "overscroll-behavior")).toBe("contain"); expect(decl(R, "#klc-story", "overflow")).toBe("auto"); });
  test("the card carries data-scroll: the pad's document touchmove veto lists [data-scroll], so a swipe on the card scrolls it", async () => {
    const { mountStoryCard } = await import("../src/anime/world/explore/storypins.js");
    const el = makeEl(), doc = { getElementById: () => null, createElement: () => el, head: makeEl(), body: makeEl() };
    expect(mountStoryCard(doc)).not.toBeNull();
    expect(el.hasAttribute("data-scroll")).toBe(true);
    expect(el.getAttribute("role")).toBe("dialog");
    expect(read("src/anime/ui/touchpad.js")).toMatch(/closest\?\.\('[^']*\[data-scroll\][^']*'\)\) e\.preventDefault\(\)/);   // the veto's list (touchpad.js is not this lane's)
  });
  test("relang() re-renders an open card in the other language and leaves a closed one alone", async () => {
    const { mountStoryCard, STORY } = await import("../src/anime/world/explore/storypins.js");
    const el = makeEl(), doc = { getElementById: () => null, createElement: () => el, head: makeEl(), body: makeEl() };
    const card = mountStoryCard(doc), pin = STORY.pins[0];
    card.relang("en"); expect(el.innerHTML).toBe("");   // nothing open
    card.open(pin, "ja"); expect(el.innerHTML).toContain(pin.title.ja); expect(el.lang).toBe("ja");
    card.relang("en"); expect(el.innerHTML).toContain(pin.title.en); expect(el.innerHTML).not.toContain(pin.title.ja); expect(el.lang).toBe("en");
  });
  test("the explore UI calls relang() when the HUD's language changes (once, then not again for the same language)", async () => {
    const hud = { lang: "ja" }, M = await mountExplore({ hud });
    try {
      M.ui.update(0.1); expect(M.spies.relang).toEqual([]);
      hud.lang = "en"; M.ui.update(0.1); expect(M.spies.relang).toEqual(["en"]);
      M.ui.update(0.1); expect(M.spies.relang).toEqual(["en"]);
      hud.lang = "ja"; M.ui.update(0.1); expect(M.spies.relang).toEqual(["en", "ja"]);
    } finally { M.restore(); }
  });
});

// ------------------------------------------------------------------------------------------------------------ row 12: the search sheet
describe("ui-b row 12: search is 16 px, one close button, IME-safe, above the keyboard, and the minimap steps aside", () => {
  const xsrc = read("src/anime/world/explore/ui.js"), R = parseCss(cssIn(xsrc, "export const CSS = /* css */"));
  test("the field is 16 px (iOS zooms into anything smaller) and 44 px under a coarse pointer; it says what it is to the keyboard", () => {
    expect(decl(R, "#klc-x .xsearch input", "font")).toBe("500 16px/1 var(--k-sans)");
    expect(decl(R, "#klc-x .xsearch input", "height")).toBe("40px");   // (a mouse keeps the 40 px field)
    expect(decl(R, "#klc-x .xsearch input", "height", ["@media (pointer: coarse)"])).toBe("44px");
    expect(xsrc).toContain('<input type="search" enterkeyhint="search" inputmode="search" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false">');
  });
  test("the placeholder fits the field (it was cut mid-quote: 「寿司」「) and keeps one example, in both languages", () => {
    const D = JSON.parse(read("data/i18n.json")), ph = { ja: D.ja["v4.x.searchPh"], en: D.en["v4.x.searchPh"] };
    // the field's text area is about 276 px on a phone (370 px sheet) and 294 px on a desktop at 16 px: full-width characters are 16 px, Latin about 8.5
    const px = (t) => [...t].reduce((n, c) => n + (c.charCodeAt(0) >= 0x2e80 ? 16 : 8.5), 0);
    for (const l of ["ja", "en"]) { expect(ph[l].length).toBeGreaterThan(8); expect(px(ph[l])).toBeLessThanOrEqual(270); }
    expect(ph.ja).toBe("駅・病院・お店の名前（寿司など）"); expect(ph.en).toBe("Station, hospital, shop, sushi…");
    for (const l of ["ja", "en"]) { expect((ph[l].match(/[「（"]/g) || []).length).toBe((ph[l].match(/[」）"]/g) || []).length); }   // no dangling quote or bracket
    expect(Object.keys(D.en)).toEqual(Object.keys(D.ja));
  });
  test("one ✕: the native clear button (and Safari's decoration) is hidden, the sheet's own close button stays", () => {
    for (const pseudo of ["::-webkit-search-cancel-button", "::-webkit-search-decoration"]) expect(decl(R, "#klc-x .xsearch input" + pseudo, "display")).toBe("none");
    expect(decl(R, "#klc-x .xsearch input::-webkit-search-cancel-button", "-webkit-appearance")).toBe("none");
    expect((xsrc.match(/data-act="search-close"/g) || []).length).toBe(1);
  });
  test("the minimap is not drawn while the search sheet or the full map is open, and ignores touches for a moment after (data-grace)", () => {
    expect(decl(R, '#klc-x[data-search="1"] .mini', "display")).toBe("none");
    expect(decl(R, '#klc-x[data-map="1"] .mini', "display")).toBe("none");
    expect(decl(R, '#klc-x[data-grace="1"] .mini', "pointer-events")).toBe("none");
    expect(xsrc).toContain("el.dataset.search = ui.search ? '1' : '0'");   // (the attributes the rules key on are set by sheetState / openMap)
    expect(xsrc).toContain("el.dataset.map = v ? '1' : '0'");
    // the pad's portrait rule (display: none under body.klc-pad) is still there, and still pinned by test/phone-hud.test.js
    expect(read("src/anime/ui/touchpad-style.js")).toContain('body.klc-pad #klc-x[data-map="1"] .mini, body.klc-pad #klc-x[data-search="1"] .mini { display: none; }');
  });
  test("the keyboard rules only act under data-kb (nothing changes without the keyboard): the desktop offset, the phone offset, and a phone on its side moves the sheet to the top", () => {
    expect(decl(R, '#klc-x[data-kb="1"] .xsearch', "max-height")).toBe("calc(var(--vvh) - 112px - env(safe-area-inset-top, 0px) - 12px)");
    expect(decl(R, '#klc-x[data-kb="1"] .xsearch', "max-height", ["@media (max-width: 720px)"])).toBe("calc(var(--vvh) - 66px - env(safe-area-inset-top, 0px) - 12px)");
    const L = ["@media (max-height: 520px) and (orientation: landscape)"];
    expect(decl(R, '#klc-x[data-kb="1"] .xsearch', "top", L)).toBe("calc(8px + env(safe-area-inset-top, 0px))");
    expect(decl(R, '#klc-x[data-kb="1"] .xsearch', "max-height", L)).toBe("calc(var(--vvh) - 16px - env(safe-area-inset-top, 0px))");
    // the rest rests: the resting heights are the ones test/integrate-fix1.test.js pins (landscape 100vh - 150 px) and the desktop / phone ones
    expect(decl(R, "#klc-x .xsearch", "max-height")).toBe("calc(100vh - 290px)");
    expect(decl(R, "#klc-x .xsearch", "max-height", ["@media (max-width: 720px)"])).toBe("calc(100vh - 300px)");
    expect(decl(R, "#klc-x .xsearch", "max-height", ["@media (max-height: 520px) and (orientation: landscape)"])).toBe("calc(100vh - 150px - env(safe-area-inset-bottom, 0px))");
  });
  test("viewportMetrics: the visible bottom edge (offsetTop + height) and whether the keyboard covers more than 120 px", async () => {
    const { viewportMetrics, KB_MIN } = await import("../src/anime/world/explore/ui.js");
    expect(KB_MIN).toBe(120);
    expect(viewportMetrics(844, null)).toEqual({ vvh: 844, kb: false });
    expect(viewportMetrics(844, { height: 844, offsetTop: 0 })).toEqual({ vvh: 844, kb: false });
    expect(viewportMetrics(844, { height: 509, offsetTop: 0 })).toEqual({ vvh: 509, kb: true });       // 390x844 with a 335 pt keyboard
    expect(viewportMetrics(390, { height: 190, offsetTop: 0 })).toEqual({ vvh: 190, kb: true });       // 844x390 on its side
    expect(viewportMetrics(844, { height: 400, offsetTop: 109 })).toEqual({ vvh: 509, kb: true });     // iOS pans the visual viewport: the edge is offsetTop + height
    expect(viewportMetrics(844, { height: 760, offsetTop: 0 })).toEqual({ vvh: 760, kb: false });      // Safari's toolbar (about 84 px): not a keyboard
    expect(viewportMetrics(844, { height: 724, offsetTop: 0 }).kb).toBe(false); expect(viewportMetrics(844, { height: 723, offsetTop: 0 }).kb).toBe(true);   // the 120 px edge
    expect(viewportMetrics(844, { height: 900, offsetTop: 0 }).kb).toBe(false);                         // taller than the layout viewport (bars collapsing)
    expect(viewportMetrics(844, { height: NaN })).toEqual({ vvh: 844, kb: false });
  });
  test("list height from visualViewport: --vvh and data-kb are set when the sheet opens and follow visualViewport resize and scroll", async () => {
    const vv = { height: 844, offsetTop: 0, L: {}, addEventListener(t, f) { (this.L[t] ||= []).push(f); }, fire(t) { (this.L[t] || []).forEach((f) => f({})); } };
    const M = await mountExplore({ vv });
    try {
      M.ui.openSearch(true);
      expect(M.el.style.props["--vvh"]).toBe("844px"); expect(M.el.dataset.kb).toBe("0");
      vv.height = 509; vv.fire("resize");
      expect(M.el.style.props["--vvh"]).toBe("509px"); expect(M.el.dataset.kb).toBe("1");
      vv.height = 400; vv.offsetTop = 109; vv.fire("scroll");
      expect(M.el.style.props["--vvh"]).toBe("509px"); expect(M.el.dataset.kb).toBe("1");
      vv.height = 844; vv.offsetTop = 0; vv.fire("resize");
      expect(M.el.style.props["--vvh"]).toBe("844px"); expect(M.el.dataset.kb).toBe("0");
      expect(M.win.resize?.length).toBeGreaterThan(0);   // (a window resize re-reads it too: a rotation)
    } finally { M.restore(); }
  });
  test("without visualViewport (an old browser, a test) the sheet still mounts and opens, with no keyboard", async () => {
    const M = await mountExplore();
    try { M.ui.openSearch(true); expect(M.el.dataset.kb).toBe("0"); expect(M.sheet.hidden).toBe(false); } finally { M.restore(); }
  });
  test("Enter while an IME is composing keeps the sheet open, flies nowhere, and never reaches the game's keys", async () => {
    const M = await mountExplore();
    try {
      M.ui.openSearch(true); expect(M.sheet.hidden).toBe(false);
      M.input.value = "気仙"; M.input.fire("input");
      expect(M.ui.state.results.length).toBe(2);
      const e = M.input.fire("keydown", { key: "Enter", keyCode: 229, isComposing: true });
      expect(e.stopped).toBe(true);
      expect(M.sheet.hidden).toBe(false); expect(M.spies.flown).toEqual([]); expect(M.spies.pinned).toEqual([]);
      // WebKit's keydown after compositionend: isComposing is already false, keyCode is still 229
      M.input.fire("keydown", { key: "Enter", keyCode: 229, isComposing: false });
      expect(M.sheet.hidden).toBe(false); expect(M.spies.flown).toEqual([]);
      // the arrows choose candidates in the IME's palette: the list selection stays where it was
      const sel = M.ui.state.sel; M.input.fire("keydown", { key: "ArrowDown", keyCode: 229, isComposing: true }); expect(M.ui.state.sel).toBe(sel);
      // Escape during a composition cancels the composition, not the sheet
      M.input.fire("keydown", { key: "Escape", keyCode: 229, isComposing: true }); expect(M.sheet.hidden).toBe(false);
    } finally { M.restore(); }
  });
  test("outside a composition the same keys work as before: Enter flies to the first result and closes, Escape closes, the arrows move the selection", async () => {
    const M = await mountExplore();
    try {
      M.ui.openSearch(true); M.input.value = "気仙"; M.input.fire("input");
      M.input.fire("keydown", { key: "ArrowDown", keyCode: 40, isComposing: false }); expect(M.ui.state.sel).toBe(1);
      M.input.fire("keydown", { key: "ArrowUp", keyCode: 38, isComposing: false }); expect(M.ui.state.sel).toBe(0);
      M.input.fire("keydown", { key: "Enter", keyCode: 13, isComposing: false });
      expect(M.sheet.hidden).toBe(true); expect(M.spies.flown.length).toBe(1); expect(M.spies.pinned).toEqual(["p1"]);
      M.ui.openSearch(true); expect(M.sheet.hidden).toBe(false);
      M.input.fire("keydown", { key: "Escape", keyCode: 27, isComposing: false }); expect(M.sheet.hidden).toBe(true);
    } finally { M.restore(); }
  });
});
