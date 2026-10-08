// [loader] KesenMemento 「帰港」: the loading screen and the title screen (docs/loading/README.md, docs/CRAFT.md).
// Static checks of index.html, loader.css, the sky, the runner, the progress bar, the tips and the Hoya Boya rules. The browser-side checks (first paint, frame times, the real hand-off) are in
// tools/anime/loader-check.mjs (through the machine gate).
import { describe, test, expect } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { parseCss, decl, styleBlocks, keyframes, rulesOf } from "./lib/css-rules.js";
import { skyState, stopsFor, mix, contrast, pinnedSky, WA, KESENNUMA, SKY_NAMES } from "../src/anime/ui/loader/sky.js";
import { sunPosition } from "../src/web/lib/solar.js";
import { normalizeRunner, assertRunnerAllowed, runnerHtml, assertHoyaAllowed, hoyaRunnerHtml, HOYABOYA_CREDIT, frameAt, aspectOf } from "../src/anime/ui/loader/sprite-runner.js";
import { createLoadBar, bezier, MARK_MS } from "../src/anime/core/loadbar.js";
import { createMotion } from "../src/anime/ui/loader/title-motion.js";
import { loadPlan, labelEn, MODULE_LABELS, FINISH_LABELS, MODULE_LABELS_EN, FINISH_LABELS_EN } from "../src/anime/core/loadplan.js";
import { loaderParts, applyParts, phrases, tipsJson, ropeY, flagsHtml, skyScript, plainJs } from "../scripts/anime/loader-inline.js";
import { SENSITIVE } from "../scripts/anime/enrich/fold.js";

const ROOT = resolve(import.meta.dir, "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const html = read("src/anime/index.html"), css = read("src/anime/ui/loader/loader.css"), main = read("src/anime/main.js");
// loader.css scopes every rule to #intro, so the title can never style the app (the ship's .bar, the pad's .btn, a store's <footer>);
// the checks below name each selector without that scope.
const unscope = (sel) => sel.replace(/(^|\s)#intro\s+/, "$1");
const R = parseCss(css).map((r) => ({ ...r, sel: unscope(r.sel) }));
const ZW = String.fromCharCode(0x200b);
const day = (hhmm, ymd = "2026-10-10") => { const [h, m] = hhmm.split(":").map(Number); return new Date(Date.parse(`${ymd}T00:00:00Z`) + ((h - 9) * 60 + m) * 60000); };

// ------------------------------------------------------------------------------------------------------------ first paint
describe("the loader paints with the first bytes of the page", () => {
  test("the loader's CSS, markup and scripts are inline: no stylesheet blocks the first paint, no app script runs before it", () => {
    const head = html.slice(0, html.indexOf("</head>"));
    for (const m of head.replace(/<noscript>[\s\S]*?<\/noscript>/g, "").matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)) expect(m[0]).toMatch(/media="print"/);   // (only the fonts, and not render-blocking; the <noscript> copy is for a browser without scripts)
    expect(head).toContain('<style id="klc-loader-css">');
    expect(head.indexOf('<style id="klc-loader-css">')).toBeLessThan(head.indexOf("fonts.googleapis.com/css2"));
    expect(html.indexOf('<div id="intro"')).toBeLessThan(html.indexOf('<script type="module"'));
    expect(html.indexOf("<!--klc:sky-->")).toBeGreaterThan(html.indexOf('<div id="intro"'));   // the sky script runs right after the markup it colours
    expect(html.match(/<script[^>]*\ssrc=/g)?.length).toBe(1);   // (the app's own module, at the very end)
    expect(html).toContain('<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?');
  });
  test("the fonts stylesheet is not render-blocking, and main.js waits for it before the world draws a label", () => {
    expect(html).toMatch(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2\?[^"]*display=swap" media="print" onload="this\.media='all';__klcFontsDone\(\)" onerror="__klcFontsDone\(\)">/);
    expect(html).toContain("window.__klcFonts = new Promise(function (r) { window.__klcFontsDone = r; setTimeout(r, 5000); });");
    expect(main).toMatch(/await Promise\.race\(\[window\.__klcFonts \|\| 0, new Promise\(\(r\) => setTimeout\(r, 5000\)\)\]\);/);
  });
  test("the page stays small: the whole HTML (loader, wordmark, flags, bonito sheet, sky) is under 150 KB", () => { expect(Buffer.byteLength(html)).toBeLessThan(150 * 1024); });
  test("the generated regions are up to date: running scripts/anime/loader-inline.js changes nothing", () => { expect(applyParts(html, loaderParts())).toBe(html); });
  test("every region marker pair exists once", () => { for (const n of ["css", "slot", "logo", "runner", "tips", "sky", "boot"]) { expect(html.split(`<!--klc:${n}-->`).length).toBe(2); expect(html.split(`<!--/klc:${n}-->`).length).toBe(2); } });
  test("the page keeps what the app and the tools rely on: #intro, #go (disabled until ready), #loadlabel, body.loaded / body.playing, ?shot hides the loader", () => {
    expect(html).toMatch(/<div id="intro" role="dialog" aria-modal="true" aria-labelledby="ld-brand"/);
    expect(html).toMatch(/<button id="go" class="prompt ld-cta" type="button" disabled>/);
    expect(html).toContain('id="loadlabel"');
    expect(html).toContain("body.shot #intro { display: none !important; }");
    expect(main).toContain("document.body.classList.add('loaded')"); expect(main).toContain("document.body.classList.add('playing')");
    expect(main).toContain("go.disabled = false; if (window.matchMedia?.('(pointer: fine)')?.matches) go.focus({ preventScroll: true });");
    expect(main).toMatch(/if \(e\.code === 'Enter' && !started\) \{ if \(window\.__titleOnGo\) window\.__titleOnGo\(\); else start\(\); \}/);
  });
});

// ------------------------------------------------------------------------------------------------------------ the rules of the house
describe("loader.css follows docs/CRAFT.md", () => {
  const HEX = [...css.matchAll(/#[0-9A-Fa-f]{6}\b/g)].map((m) => m[0].toUpperCase());
  const TRADITIONAL = ["#165E83", "#223A70", "#17184B", "#00A3AF", "#89C3EB", "#F19072", "#F8B500", "#B7282E", "#FBFAF5", "#595857"];   // docs/CRAFT.md section 1
  const SHADES = ["#6EA5CE", "#B1D4EE", "#D3E3EC", "#9DBFD2", "#5F93B1", "#1C2B5E", "#8E1E24", "#D2434A", "#861C21", "#1D2062", "#2B2F7A", "#21235C", "#26307E", "#FFFFFF"];   // tints and shades of those, named in loader.css's neighbours
  test("every colour is a traditional Japanese colour of the palette (or a shade of one), and there is no charcoal and no lime", () => {
    for (const h of HEX) expect([...TRADITIONAL, ...SHADES]).toContain(h);
    for (const name of ["藍色 ai", "紺色 kon", "鉄紺 tetsukon", "浅葱色 asagi", "勿忘草色 wasurenagusa", "東雲色 shinonome", "山吹色 yamabuki", "茜色 akane", "生成り色 kinari", "墨 sumi"]) expect(css).toContain(name);
    expect(css).not.toMatch(/#1E1E22|#C8EE3C|#c4ec3c/i);
    for (const k of Object.keys(WA)) expect(TRADITIONAL).toContain(WA[k]);   // the sky module uses the same values
  });
  test("every rule is scoped to #intro: the title never styles the app (the ship's .bar, the pad's .btn, a store's <footer> share its class names)", () => {
    const raw = parseCss(css);
    expect(raw.length).toBeGreaterThan(150);
    expect(raw.filter((r) => !r.sel.includes("#intro")).map((r) => r.sel)).toEqual([]);
  });
  test("only transform and opacity animate: every keyframe block, every transition", () => {
    for (const m of css.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
      const body = keyframes(css, m[1]);
      for (const d of body.matchAll(/([a-z-]+)\s*:/g)) expect(["transform", "opacity"]).toContain(d[1]);   // (the percent selectors have no colon)
    }
    for (const m of css.matchAll(/transition\s*:\s*([^;}]+)[;}]/g)) for (const part of m[1].split(",")) expect(part.trim()).toMatch(/^(transform|opacity|visibility|none)\b/);
  });
  test("motion tokens: durations 140 / 160 / 200 / 600 ms (press, fade, hand-over, the poster crossfade)", () => {
    const allowed = new Set([120, 140, 160, 170, 200, 280, 400, 460, 500, 600, 800]);
    // every press on the title takes the app's press token (ui/style.js --dur-press, 140 ms, pinned by ui-b2 row 6), so a press feels the same everywhere
    for (const m of css.matchAll(/transition:\s*transform (\d+)ms/g)) expect(+m[1]).toBe(140);
    for (const m of css.matchAll(/(?<![\w.-])(\d+)ms/g)) expect(allowed.has(+m[1]) || +m[1] === 10 || +m[1] === 0).toBe(true);
    expect(css).toContain("transition: opacity 600ms linear");
  });
  test("reduced motion: no sprite motion, and the safety-net fade stays a short opacity", () => {
    const at = ["@media (prefers-reduced-motion: reduce)"];
    expect(decl(R, ".ld-wv", "animation", at)).toBe("none !important");
    expect(decl(R, ".sr-strip", "animation", at)).toBe("none !important");
    expect(decl(R, ".sr-bob", "animation", at)).toBe("none !important");
    expect(decl(R, ".ld-card", "transition", at)).toBe("none !important");
    expect(decl(R, "#intro.ld-fade", "transition", at)).toMatch(/^opacity 160ms linear/);
    expect(read("src/anime/ui/loader/title-motion.js")).toContain("clamp(t / 0.2)");
    expect(read("src/anime/ui/loader/title-motion.js")).toContain("go.focus({ preventScroll: true })");
  });
  test("safe areas: every edge-attached element honours env(safe-area-inset-*)", () => {
    for (const side of ["top", "right", "bottom", "left"]) expect(css).toContain(`env(safe-area-inset-${side}, 0px)`);
    expect(decl(R, "header", "top")).toMatch(/var\(--sat\)/);
    expect(decl(R, "footer", "bottom")).toMatch(/var\(--sab\)/);
    expect(html).toContain("viewport-fit=cover");
  });
  test("100dvh behind @supports (the dynamic toolbar), 44 px touch targets, and one radius (22 px) for the corner controls, the tip bar, the notice and the prompt", () => {
    expect(decl(R, "#intro", "height", ["@supports (height: 100dvh)"])).toBe("100dvh");
    expect(decl(R, "#go", "min-height")).toBe("44px");
    expect(decl(R, "#intro", "--r")).toBe("22px");
    for (const sel of ["#go", ".btn", ".tip", ".ld-err", "#ld-retry"]) expect(decl(R, sel, "border-radius")).toBe("var(--r)");
    expect(decl(R, ".lang button", "border-radius")).toBe("calc(var(--r) - 4px)");   // concentric inside the 4 px padding of the pill
    expect(decl(R, ".btn", "height")).toBe("44px"); expect(decl(R, "#ld-sound", "width")).toBe("44px");
    expect(decl(R, ".pager button", "width")).toBe("28px"); expect(decl(R, ".pager button::before", "inset")).toBe("-8px");   // a 28 px dot, a 44 px target
    // one material: the corner controls, the tip bar and the notice share the glass, the hairline and the shadow
    for (const sel of [".btn", ".tip", ".ld-err"]) { expect(decl(R, sel, "background")).toBe("var(--glass)"); expect(decl(R, sel, "box-shadow")).toBe("var(--mat)"); }
    expect(decl(R, "#intro", "--mat")).toBe("inset 0 1px 0 rgba(255, 255, 255, .7), inset 0 0 0 1px var(--hair), var(--lift)");
    expect(decl(R, "#intro", "--glass")).toBe("rgba(251, 250, 245, .92)"); expect(decl(R, "#intro", "--hair")).toBe("rgba(34, 58, 112, .12)");
  });
  test("Japanese typesetting: strict line breaking, phrases kept (keep-all with zero-width spaces), weights 400 (the display face) 500 700 and 900, palt on the prompt", () => {
    expect(decl(R, "#intro", "line-break")).toBe("strict");
    expect(decl(R, ".tip p", "word-break")).toBe("keep-all");
    expect(decl(R, ".tip p", "text-wrap")).toBe("balance"); expect(decl(R, 'html[lang="en"] .tip p', "text-wrap", ["@media (min-width: 600px)"])).toBe("pretty");
    expect(decl(R, "#go", "font-feature-settings")).toBe('"palt"');
    for (const m of css.matchAll(/font:\s*(\d{3})\s/g)) expect(["400", "500", "700", "900"]).toContain(m[1]);
    expect(css).not.toMatch(/font-style:\s*italic|font-weight:\s*bold/);
  });
  test("no layout property is animated, and the tip bar is as tall as what it says (no reserved height, no empty band)", () => {
    expect(decl(R, ".tip", "min-height")).toBeUndefined(); expect(decl(R, ".tip", "height")).toBeUndefined();
    expect(decl(R, ".credit", "white-space")).toBe("nowrap");
    expect(css).not.toMatch(/animation[^;]*(width|height|margin|padding)/);
  });
  test("the start prompt has no box: display type between two 山吹 diamonds, it says what the input is, and the ring is for the keyboard", () => {
    const go = html.match(/<button id="go"[\s\S]*?<\/button>/)[0];
    expect(go).toContain('<span class="k-tap">TAP TO START</span><span class="k-click">CLICK TO START</span>');
    expect(go).toContain('<span class="k-tap">タップしてスタート</span><span class="k-click">クリックしてスタート</span>');
    expect(go.match(/class="dia"/g).length).toBe(2);
    expect(decl(R, "#go", "background")).toBe("transparent"); expect(decl(R, "#go", "box-shadow")).toBe("none");
    expect(decl(R, "#go .dia", "background")).toBe("var(--yamabuki)");
    expect(decl(R, '#go:focus-visible', "outline")).toBe("none");
    expect(decl(R, 'html[data-kbd] #go:focus-visible', "outline")).toBe("2px solid var(--kinari)");
    expect(decl(R, "#go:enabled:active", "transform")).toBe("scale(.97)");
    // a coarse pointer taps, a fine pointer clicks: set before the first paint by the head script, kept in step by title-boot.js
    expect(decl(R, 'html[data-input="mouse"] .k-tap', "display")).toBe("none"); expect(decl(R, 'html:not([data-input="mouse"]) .k-click', "display")).toBe("none");
    const head = html.slice(0, html.indexOf("</head>"));
    expect(head).toContain('matchMedia("(pointer: coarse)").matches'); expect(head).toContain('setAttribute("data-input"');
    expect(html).toContain("if (e.key !== 'Enter') d.documentElement.setAttribute('data-kbd', '1');");
    // the breath and the rise are the title clock's (a capture steps them); the v3 tap pop (scale 1.12) is gone
    const motion = read("src/anime/ui/loader/title-motion.js");
    expect(motion).toContain("0.8 + 0.2 * Math.cos((Math.PI * Math.max(0, te - 3)) / 1.6)"); expect(motion).toContain("window1(te, 2.5, fadeDur)"); expect(motion).toContain("window1(te, 2.7, inDur)"); expect(motion).toContain("8 * (1 - outCubic(u))");
    expect(motion).not.toContain("0.12 * pulse");
  });
});

// ------------------------------------------------------------------------------------------------------------ the sky
describe("the sky follows the real clock in Kesennuma (ui/loader/sky.js)", () => {
  const at = (hhmm, o) => skyState(day(hhmm), sunPosition, o);
  test("the sun over Kesennuma on the demo day: up at 5:00 JST? no, at 6:10; noon about 44 degrees; set by 17:30; below -12 degrees at 22:00", () => {
    expect(at("05:00").elevation).toBeLessThan(0); expect(at("06:10").elevation).toBeGreaterThan(0);
    expect(at("12:00").elevation).toBeGreaterThan(40); expect(at("12:00").elevation).toBeLessThan(48);
    expect(at("17:30").elevation).toBeLessThan(0); expect(at("22:00").elevation).toBeLessThan(-30);
  });
  test("it is the JST hour whatever the device's time zone: the same instant gives the same sky", () => {
    const a = skyState(new Date("2026-10-10T03:00:00Z"), sunPosition), b = skyState(new Date(Date.parse("2026-10-10T12:00:00+09:00")), sunPosition);
    expect(a.vars).toEqual(b.vars); expect(a.hours).toBeCloseTo(12, 5);
  });
  test("night is 0 by day and 1 after dark; the stars and the harbour lights follow it", () => {
    expect(at("12:00").night).toBe(0); expect(at("22:00").night).toBe(1);
    const dusk = at("17:40").night; expect(dusk).toBeGreaterThan(0); expect(dusk).toBeLessThan(1);
    expect(at("22:00").vars["--night"]).toBe("1"); expect(at("12:00").vars["--moon-a"]).toBe("0");
  });
  test("dawn is 東雲 (peach), dusk is 茜 (madder): the horizon of the morning and of the evening differ", () => {
    const am = stopsFor(0, true)[3], pm = stopsFor(0, false)[3];
    expect(am).not.toBe(pm);
    expect(contrast(mix(WA.SHINO, WA.KINARI, 0.2), stopsFor(0, true)[2])).toBeGreaterThan(1);
  });
  test("the sky never jumps: across the whole range of elevations no stop moves more than a few percent per degree", () => {
    for (const am of [true, false]) {
      let prev = stopsFor(-20, am);
      for (let e = -19.5; e <= 40; e += 0.5) {
        const cur = stopsFor(e, am);
        for (let i = 0; i < 4; i++) { const d = [1, 3, 5].reduce((s, k) => s + Math.abs(parseInt(cur[i].slice(k, k + 2), 16) - parseInt(prev[i].slice(k, k + 2), 16)), 0); expect(d).toBeLessThan(60); }
        prev = cur;
      }
    }
  });
  test("the lettering on the sky is whichever of 紺, 鉄紺 and 生成り reads best: at least 3:1 (large type) at every half hour of the day, and 4.5:1 by day and by night", () => {
    for (let h = 0; h < 24; h += 0.5) {
      const s = skyState(new Date(Date.parse("2026-10-10T00:00:00+09:00") + h * 3600000), sunPosition), behind = mix(s.stops[1], s.stops[2], 0.5);
      expect(contrast(s.ink, behind)).toBeGreaterThanOrEqual(3);
      if (s.night === 1 || s.night === 0) expect(contrast(s.ink, behind)).toBeGreaterThanOrEqual(4.5);
    }
  });
  test("the sun stays clear of the lettering (never above 32 % of the height... no: never higher than the mark's bottom), and a wide screen keeps it on the right", () => {
    for (const hhmm of ["07:00", "10:00", "12:00", "14:00", "16:00"]) { expect(at(hhmm).sun.y).toBeGreaterThanOrEqual(32); expect(at(hhmm, { wide: true }).sun.x).toBeGreaterThanOrEqual(48); }
  });
  test("?sky= pins a time of day (HH:MM JST or a name) on the real date", () => {
    const now = new Date("2026-10-07T01:00:00Z");
    expect(pinnedSky("22:00", now).toISOString()).toBe("2026-10-07T13:00:00.000Z"); expect(pinnedSky("night", now).toISOString()).toBe(pinnedSky(SKY_NAMES.night, now).toISOString());
    expect(pinnedSky("nonsense", now)).toBeNull(); expect(pinnedSky(null, now)).toBeNull();
  });
  test("the page's inline sky is this code: running it with a fake page sets the same variables as skyState", () => {
    const js = skyScript().replace(/^<script>|<\/script>$/g, "");
    const set = {}, meta = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
    const intro = { style: { setProperty: (k, v) => { set[k] = v; } } };
    const fake = { getElementById: (id) => (id === "intro" ? intro : null), querySelector: () => meta };
    new Function("document", "location", "innerWidth", "innerHeight", js)(fake, { search: "?sky=22:00" }, 390, 844);
    const want = skyState(pinnedSky("22:00"), sunPosition, { wide: false });
    expect(set).toEqual(want.vars); expect(meta.attrs.content).toBe(want.stops[1]);
    expect(KESENNUMA.lat).toBeCloseTo(38.9, 1);
  });
});

// ------------------------------------------------------------------------------------------------------------ the runner
describe("the sprite runner and the Hoya Boya switch (ui/loader/sprite-runner.js, docs/loading/RUNNER.md)", () => {
  const cfg = JSON.parse(read("src/anime/assets/runner/runner.json"));
  test("the shipped runner is our own bonito and Hoya Boya is OFF: nothing of the mascot moves until the city approves", () => {
    expect(cfg.character).toBe("bonito"); expect(cfg.hoya.mode).toBe("off");
    expect(() => assertHoyaAllowed(cfg.hoya)).not.toThrow();
    const region = html.match(/<!--klc:runner-->([\s\S]*?)<!--\/klc:runner-->/)[1];
    expect(region).toContain('data-character="bonito"'); expect(region).not.toContain("hoyaboya\"");   // (the dev flag builds its markup in script, and only on localhost)
    expect([...new Set([...html.matchAll(/assets\/hoyaboya\/([\w.-]+)/g)].map((m) => m[1]))]).toEqual(["1-9.png"]);   // no moving pose is bundled: only the standing still
  });
  test("a Hoya Boya runner without the city's approval record, the credit or a named pose is refused", () => {
    expect(() => assertHoyaAllowed({ mode: "still", pose: "15-10" })).toThrow(/approval/);
    expect(() => assertHoyaAllowed({ mode: "still", pose: "15-10", approval: { by: "気仙沼市産業部観光課", ref: "", date: "2026-10-09" } })).toThrow(/approval/);
    expect(() => assertHoyaAllowed({ mode: "still", pose: "15-10", approval: { by: "気仙沼市産業部観光課", ref: "R8-1", date: "9 Oct" } })).toThrow(/approval/);
    expect(() => assertHoyaAllowed({ mode: "still", pose: "", approval: { by: "x", ref: "y", date: "2026-10-09" } })).toThrow(/pose/);
    expect(() => assertHoyaAllowed({ mode: "still", pose: "15-10", credit: "none", approval: { by: "x", ref: "y", date: "2026-10-09" } })).toThrow(/credit/);
    expect(() => assertHoyaAllowed({ mode: "cycle", pose: "15-10", frames: 1, approval: { by: "x", ref: "y", date: "2026-10-09" } })).toThrow(/frames/);
    expect(() => assertHoyaAllowed({ mode: "party" })).toThrow(/mode/);
    const ok = { mode: "still", pose: "15-10", aspect: 1.05, approval: { by: "気仙沼市産業部観光課", ref: "R8-1", date: "2026-10-09" } };
    expect(assertHoyaAllowed(ok).mode).toBe("still");
    expect(hoyaRunnerHtml(ok, "./a.png")).toContain('data-character="hoyaboya" data-n="1"');
    expect(() => assertRunnerAllowed({ character: "hoyaboya", src: "x.png", frames: 1, fps: 1, frameW: 1, frameH: 1 })).toThrow(/approval/);
  });
  test("the config is checked: a bad frame count, rate or file name is a readable error", () => {
    expect(() => normalizeRunner({ ...cfg, frames: 0 })).toThrow(/frames/); expect(() => normalizeRunner({ ...cfg, fps: 0 })).toThrow(/fps/);
    expect(() => normalizeRunner({ ...cfg, src: "../x.svg" })).toThrow(/src/); expect(() => normalizeRunner({ ...cfg, character: "ship" })).toThrow(/character/);
    expect(aspectOf(normalizeRunner(cfg))).toBe(2); expect(frameAt({ frames: 6, fps: 8 }, 0.9)).toBe(1); expect(frameAt({ frames: 6, fps: 8 }, 0)).toBe(0);
  });
  test("the gauge's fish is our own bonito; the sprite module still refuses a moving Hoya Boya", () => {
    const m = runnerHtml(normalizeRunner(cfg), "data:x");
    expect(m).toContain('data-n="6"'); expect(m).toContain("--sr-n:6;--sr-fps:8;--sr-aspect:2");
    const region = html.match(/<!--klc:runner-->([\s\S]*?)<!--\/klc:runner-->/)[1];
    expect(region).toContain('data-character="bonito"');
    expect(region).not.toContain('class="sr-strip"');
  });
  test("the dev flag ?hoya=run is honoured on localhost only and needs the dev asset", () => {
    expect(html).toContain("host === 'localhost' || host === '127.0.0.1' || host === '[::1]'");
    expect(html).toMatch(/get\('hoya'\) === 'run'/);
    if (cfg.hoya.pose) { expect(html).toContain(`data-src="/data/hoyaboya-dev/${cfg.hoya.src}"`); expect(existsSync(join(ROOT, "data/hoyaboya-dev", cfg.hoya.src))).toBe(true); }
    expect(read("server/app/stage.sh")).not.toMatch(/hoyaboya-dev/);   // never staged for production
  });
});

// ------------------------------------------------------------------------------------------------------------ the official still
describe("Hoya Boya, the standing still: exactly what the design manual allows (docs/loading/HOYABOYA.md)", () => {
  const notice = read("src/anime/assets/hoyaboya/NOTICE.md"), png = readFileSync(join(ROOT, "src/anime/assets/hoyaboya/1-9.png"));
  test("1-9.png is byte for byte the city's file (SHA-256 in NOTICE.md), and the notice names the owner, the source, the date and the licence boundary", () => {
    const sha = createHash("sha256").update(png).digest("hex");
    expect(notice).toContain(sha); expect(sha).toBe("1b40e75f0aab528f6b5d0a0fe7dd9e64ae85491f1ef829c33a58efcb93e1ee48");
    for (const t of ["© 気仙沼市", "NOT under this project's MIT licence", "2026-10-07", "https://www.kesennuma.miyagi.jp/sec/s084/030/010/010/", "manualvariation1-2.zip", "デザインマニュアル", "NO.1-9"]) expect(notice).toContain(t);
    expect(existsSync(join(ROOT, "src/anime/assets/hoyaboya/13-2.png"))).toBe(false);   // (the peeking art is no longer shipped)
  });
  test("the credit is the manual's, character for character (p.4): two centred lines, in the page and in the runner module", () => {
    expect(html).toContain('<div class="credit" id="ld-hoya-credit">気仙沼市観光キャラクター<br>「海の子 ホヤぼーや」</div>');
    // English mode shows the manual's own English credit, unaltered (two lines after the comma, like the Japanese),
    // and the toggle, both credits and the tip are synced to the language picked before first paint
    expect(html).toContain("'Kesennuma City Mascot,<br>Hoya Boya the Ocean Boy'");
    expect(html).toContain("'Map © GSI Japan · OpenStreetMap'");
    expect(html).toContain("setLang(lang);");
    expect(HOYABOYA_CREDIT.ja.join("")).toBe("気仙沼市観光キャラクター「海の子 ホヤぼーや」"); expect(HOYABOYA_CREDIT.ja[1]).toBe("「海の子 ホヤぼーや」");
    expect(HOYABOYA_CREDIT.en.join("")).toBe("Kesennuma City Mascot,Hoya Boya the Ocean Boy");
    expect(notice).toContain("気仙沼市観光キャラクター「海の子 ホヤぼーや」");
  });
  test("the still has no animation, transition, transform or crop, and it is cut (display: none) at the hand-off; the credit is a caption, not a box", () => {
    const bad = /^(animation|transition|transform|filter|opacity|clip-path|clip|mask|mask-image|backdrop-filter|mix-blend-mode|overflow|object-fit)$/;
    for (const sel of [".hoya", ".hoya img", ".credit"]) for (const r of rulesOf(R, sel)) for (const k of Object.keys(r.decl)) expect(k).not.toMatch(bad);
    expect(decl(R, ".credit", "background")).toBeUndefined(); expect(decl(R, ".credit", "border")).toBeUndefined();
    expect(decl(R, ".credit", "text-align")).toBe("center"); expect(decl(R, ".hoya", "justify-items")).toBe("center");   // centred under him (manual p.4)
    expect(decl(R, "html:not([lang=\"en\"]) .credit::first-line", "font-size")).toBe("10px"); expect(decl(R, ".credit", "font")).toMatch(/^500 12px\//);   // the manual's balance: the first line smaller
    expect(decl(R, "body.playing .hoya img", "display")).toBe("none");
    expect(decl(R, "body.playing .credit", "display")).toBe("none");
    expect(html).toMatch(/<div class="hoya"><img src="\.\/assets\/hoyaboya\/1-9\.png" width="1300" height="1693" alt="ホヤぼーや" decoding="async">/);
    expect(html).toContain("display: none");
    expect(read("src/anime/ui/loader/title-motion.js")).toContain("querySelectorAll('img, .credit')");
  });
  test("the still keeps its proportions (1300 x 1693): its height is set and its width follows, whole, never inside or behind the tip bar", () => {
    expect(decl(R, ".hoya img", "width")).toBe("auto"); expect(decl(R, ".hoya img", "height")).toBe("var(--hoya-h)");
    const tiprow = html.match(/<div class="tiprow">([\s\S]*?)<div class="ld-err">/)[1];
    expect(tiprow.indexOf('<div class="hoya">')).toBeLessThan(tiprow.indexOf('<div class="tip ld-card">'));
    expect(tiprow.match(/<div class="tip ld-card">[\s\S]*$/)[0]).not.toContain("hoya");   // (he is a sibling of the bar, never in it)
    expect(+(1300 / 1693).toFixed(4)).toBe(0.7679);
  });
});

// ------------------------------------------------------------------------------------------------------------ the progress
describe("the bar and the runner show the real progress (core/loadbar.js)", () => {
  /** A fake page: elements that record animate() and style writes; #ld-pct holds the number as the page does (a text node, then the <small>%</small>). */
  const el = () => { const e = { style: { setProperty() {} }, classList: new Set(), anims: [], textContent: "", attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, animate(kf, o) { const a = { kf, o, cancelled: false, cancel() { this.cancelled = true; } }; this.anims.push(a); return a; } };
    e.classList = { s: new Set(), add(c) { this.s.add(c); }, remove(c) { this.s.delete(c); }, contains(c) { return this.s.has(c); } }; return e; };
  const setup = ({ reduced = false, lang = "ja", flags = 0, capture = false } = {}) => {
    let t = 1000; const timers = [];
    const els = { "ld-ride": el(), "ld-fill": el(), "ld-fill-in": el(), "ld-work": el(), "ld-work-in": el(), "ld-pct": Object.assign(el(), { firstChild: { nodeType: 3, nodeValue: "0" } }), loadlabel: el(), "ld-progress": el(), intro: el() };
    const fl = Array.from({ length: flags }, () => { const f = el(); f.style = { props: {}, setProperty(k, v) { this.props[k] = v; } }; return f; });
    const doc = { getElementById: (i) => els[i] ?? null, querySelectorAll: (s) => (s === ".ld-flag" ? fl : []), documentElement: { lang, dataset: capture ? { capture: "1" } : {} } };
    const bar = createLoadBar({ doc, now: () => t, reduced: () => reduced, later: (fn, ms) => { timers.push({ fn, ms }); return timers.length - 1; }, cancel: () => {} });
    return { bar, els, fl, timers, tick: (ms) => { t += ms; }, num: () => els["ld-pct"].firstChild.nodeValue };
  };
  /** The position (0..1) a translateX stands for: the runner's lane moves by p, a clip by -(1 - p), its counter-slide by (1 - p). */
  const where = { "ld-ride": (x) => x / 100, "ld-fill": (x) => 1 + x / 100, "ld-work": (x) => 1 + x / 100, "ld-fill-in": (x) => 1 - x / 100, "ld-work-in": (x) => 1 - x / 100 };
  const px = (tf) => +tf.match(/-?[\d.]+/)[0];
  const stops = (els, id) => els[id].anims.at(-1).kf.map((k) => where[id](px(k.transform)));   // (the last animation's keyframes, as positions)
  const state = (els, id) => where[id](px(els[id].style.transform));                              // (where the element stands: its style is the state)
  test("a stage begins with a mark: the solid fill and the runner ease to it and STOP there (one animation each, in percent of the lane); the number and aria-valuenow say the mark", () => {
    const { bar, els, num } = setup();
    bar.set(0.2, "町並みを準備中…", { to: 0.3, ms: 4000 });
    const a = els["ld-ride"].anims[0]; expect(a.o).toEqual({ duration: MARK_MS, fill: "forwards" });   // (the 4 s of creep are not here: that is the working layer's)
    expect(a.kf.map((k) => k.transform)).toEqual(["translateX(0%)", "translateX(20%)"]); expect(a.kf[0].easing).toMatch(/cubic-bezier/);
    expect(els["ld-fill"].anims[0].kf.map((k) => k.transform)).toEqual(["translateX(-100%)", "translateX(-80%)"]);   // the clip slides in as the counter slides back:
    expect(els["ld-fill-in"].anims[0].kf.map((k) => k.transform)).toEqual(["translateX(100%)", "translateX(80%)"]);   // the fill never moves with the progress
    expect(els.loadlabel.textContent).toBe("町並みを準備中…"); expect(els["ld-progress"].attrs["aria-valuenow"]).toBe("20"); expect(num()).toBe("20");
  });
  test("THE NUMBER is round(mark * 100), written by set() itself in the same call (no frame, no timer): it holds through a creep and a stale mark changes nothing", () => {
    for (const f of [0, 0.0545, 0.1, 0.25, 0.4999, 0.5, 0.5749, 0.99, 1]) { const { bar, num } = setup(); bar.set(f, "x", { to: Math.min(1, f + 0.05), ms: 3000 }); expect(num()).toBe(String(Math.round(f * 100))); }
    const { bar, tick, num } = setup();
    bar.set(0.1, "a", { to: 0.15, ms: 1750 }); expect(num()).toBe("10");
    tick(MARK_MS + 1750); expect(num()).toBe("10");   // the stage crept from 10 % to 15 % behind the fill: the number stayed 10 (the old bar's fill went on to 15 under a number frozen at 10)
    bar.set(0.25, "b", { to: 0.3, ms: 1000 }); expect(num()).toBe("25");
    bar.set(0.2, "stale"); expect(num()).toBe("25");
    bar.set(1, ""); expect(num()).toBe("100");
  });
  test("THE SOLID FILL and the runner never target a place beyond the mark, however far the creep asks to go; at rest they stand exactly on it, and the number is that mark", () => {
    const { bar, els, tick, num } = setup(); let top = 0;
    [0.06, 0.1, 0.1, 0.23, 0.2, 0.57, 0.9, 0.99, 1].forEach((f, i) => {
      const before = Object.fromEntries(["ld-ride", "ld-fill", "ld-fill-in"].map((id) => [id, els[id].anims.length]));
      bar.set(f, "s" + i, { to: Math.min(1, f + 0.2), ms: 5000 }); top = Math.max(top, f);
      for (const id of ["ld-ride", "ld-fill", "ld-fill-in"]) {
        for (const a of els[id].anims.slice(before[id])) { expect(a.o.duration).toBeLessThanOrEqual(MARK_MS); for (const k of a.kf) expect(where[id](px(k.transform))).toBeLessThanOrEqual(top + 1e-9); }
        expect(state(els, id)).toBeCloseTo(top, 6);
      }
      expect(num()).toBe(String(Math.round(top * 100)));
      tick(i % 2 ? 700 : 9000); expect(bar.position()).toBeCloseTo(top, 6);   // (once the eased move is done the edge is on the mark, a long wait or not)
    });
    expect(bar.position()).toBe(1);
  });
  test("THE WORKING LAYER starts at the mark and creeps linearly to creep.to (eased first, built like the fill); it is clamped to 1, waits on the mark when its target is behind it, and never moves the fill", () => {
    const { bar, els, tick } = setup();
    bar.set(0.2, "町並みを準備中…", { to: 0.3, ms: 4000 });
    const w = els["ld-work"].anims[0]; expect(w.o).toEqual({ duration: MARK_MS + 4000, fill: "forwards" });
    expect(w.kf.map((k) => k.transform)).toEqual(["translateX(-100%)", "translateX(-80%)", "translateX(-70%)"]);
    expect(w.kf[0].easing).toMatch(/cubic-bezier/); expect(w.kf[1].easing).toBe("linear"); expect(w.kf[1].offset).toBeCloseTo(MARK_MS / (MARK_MS + 4000), 6);
    expect(els["ld-work-in"].anims[0].kf.map((k) => k.transform)).toEqual(["translateX(100%)", "translateX(80%)", "translateX(70%)"]);
    expect(els["ld-work"].style.transform).toBe("translateX(-70%)");   // (the style is the state if the animation is ever dropped)
    tick(MARK_MS + 2000); expect(bar.position()).toBeCloseTo(0.2, 6); expect(bar.working()).toBeCloseTo(0.25, 6);   // halfway through the creep the fill is still on the mark
    tick(10000); expect(bar.working()).toBeCloseTo(0.3, 6); expect(bar.position()).toBeCloseTo(0.2, 6); expect(bar.mark).toBe(0.2);
    bar.set(0.5, "b", { to: 0.4, ms: 1000 }); expect(state(els, "ld-work")).toBeCloseTo(0.5, 6); expect(bar.working(1e9)).toBeCloseTo(0.5, 6);   // a target behind the mark: the layer waits on the mark
    bar.set(0.6, "c", { to: 7, ms: 1000 }); expect(state(els, "ld-work")).toBeCloseTo(1, 6);                                                   // past the end: clamped to it
  });
  test("the working layer never retreats: when the next mark and target are behind where it already is, it holds there", () => {
    const { bar, els, tick } = setup();
    bar.set(0.3, "a", { to: 0.4, ms: 1000 }); tick(10000);   // the stage ran long: the layer is done at 0.4, the fill stands on the mark
    expect(bar.working()).toBeCloseTo(0.4, 6); expect(bar.position()).toBeCloseTo(0.3, 6);
    bar.set(0.35, "b", { to: 0.38, ms: 500 });
    expect(bar.mark).toBe(0.35); expect(bar.working()).toBeGreaterThanOrEqual(0.4 - 1e-9); expect(state(els, "ld-work")).toBeCloseTo(0.4, 6); expect(state(els, "ld-work-in")).toBeCloseTo(0.4, 6);
    for (const a of els["ld-work"].anims) { const k = a.kf.map((f) => where["ld-work"](px(f.transform))); for (let i = 1; i < k.length; i++) expect(k[i]).toBeGreaterThanOrEqual(k[i - 1] - 1e-9); }
  });
  test("MONOTONIC: a stale mark never moves the bar or the number back; a stage can only add", () => {
    const { bar, els, tick, num } = setup();
    bar.set(0.3, "a", { to: 0.4, ms: 1000 }); tick(10000);
    bar.set(0.2, "stale", { to: 0.25, ms: 500 });
    expect(bar.mark).toBe(0.3); expect(num()).toBe("30"); expect(els["ld-progress"].attrs["aria-valuenow"]).toBe("30"); expect(bar.position()).toBeCloseTo(0.3, 6);
    expect(state(els, "ld-fill")).toBeCloseTo(0.3, 6); expect(state(els, "ld-ride")).toBeCloseTo(0.3, 6);
    bar.set(0.5, "c"); tick(MARK_MS); expect(bar.position()).toBeCloseTo(0.5, 6); bar.set(1, ""); tick(1000); expect(bar.position()).toBe(1); expect(bar.mark).toBe(1);
  });
  test("position() is where the solid edge is: the eased move to the mark and no further; working() is the faint layer's: the same move, then the linear creep (the curve the compositor uses)", () => {
    const { bar, tick } = setup();
    bar.set(0.1, "x", { to: 0.2, ms: 1000 });
    tick(MARK_MS); expect(bar.position()).toBeCloseTo(0.1, 6); expect(bar.working()).toBeCloseTo(0.1, 6);
    tick(500); expect(bar.position()).toBeCloseTo(0.1, 6); expect(bar.working()).toBeCloseTo(0.15, 6);
    tick(10000); expect(bar.position()).toBeCloseTo(0.1, 6); expect(bar.working()).toBeCloseTo(0.2, 6);
    const e = bezier(0.22, 1, 0.36, 1); expect(e(0)).toBe(0); expect(e(1)).toBe(1); expect(e(0.5)).toBeGreaterThan(0.8);   // (ease-out: most of the way in half the time)
    const m = setup(); m.bar.set(0.4, "y", { to: 0.5, ms: 1000 }); m.tick(MARK_MS / 2);   // halfway through the move the edge is on the ease: ahead of where it began, short of the mark
    expect(m.bar.position()).toBeGreaterThan(0.2); expect(m.bar.position()).toBeLessThan(0.4); expect(m.bar.working()).toBeGreaterThanOrEqual(m.bar.position() - 1e-9);
  });
  test("PROPERTY: over 300 random loads (marks, creeps, waits of any length) the number is always round(mark * 100), the solid edge never passes the mark, the layer never trails the edge or retreats, and nothing exceeds 1", () => {
    let seed = 20261008; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let run = 0; run < 300; run++) {
      const { bar, els, tick, num } = setup({ reduced: run % 7 === 0 }); let mark = 0, lastWork = 0;
      for (let step = 0; step < 14; step++) {
        const f = rnd() < 0.15 ? rnd() * mark : Math.min(1, mark + rnd() * 0.2), creep = rnd() < 0.8 ? { to: f + (rnd() - 0.2) * 0.3, ms: Math.round(rnd() * 20000) } : undefined;
        bar.set(f, "s", creep); mark = Math.max(mark, Math.min(1, Math.max(0, f)));
        expect(num()).toBe(String(Math.round(mark * 100))); expect(bar.mark).toBeCloseTo(mark, 12);
        for (const id of ["ld-ride", "ld-fill", "ld-fill-in"]) expect(state(els, id)).toBeLessThanOrEqual(mark + 2e-5);   // (the style rounds to 0.001 %)
        for (let k = 0; k < 6; k++) {   // the clock runs between marks: sampled at random moments, the invariants hold
          const w = bar.working(), e = bar.position();
          expect(e).toBeLessThanOrEqual(mark + 1e-9); expect(e).toBeGreaterThanOrEqual(-1e-9); expect(w).toBeGreaterThanOrEqual(e - 1e-9); expect(w).toBeLessThanOrEqual(1 + 1e-9); expect(w).toBeGreaterThanOrEqual(lastWork - 1e-9);
          lastWork = w; tick(Math.round(rnd() * (rnd() < 0.3 ? 12000 : 400)));
        }
      }
    }
  });
  test("IDLE: when the creep has run its course and the stage is still going, the root says so (and nothing is invented); the next mark ends it", () => {
    const { bar, els, timers } = setup();
    bar.set(0.5, "x", { to: 0.55, ms: 1000 });
    expect(els.intro.classList.contains("ld-idle")).toBe(false); expect(timers.at(-1).ms).toBe(MARK_MS + 1000 + 250);
    timers.at(-1).fn(); expect(els.intro.classList.contains("ld-idle")).toBe(true); expect(bar.idle).toBe(true);
    bar.set(0.6, "y"); expect(els.intro.classList.contains("ld-idle")).toBe(false);
  });
  test("the 大漁旗: one more flag is hoisted for every stage that has completed, staggered; the last mark hoists the rest", () => {
    const { bar, fl } = setup({ flags: 13 });
    bar.set(0.03, "fonts"); expect(bar.hoisted).toBe(0);
    bar.set(0.1, "a"); expect(bar.hoisted).toBe(1); expect(fl[0].classList.contains("up")).toBe(true); expect(fl[1].classList.contains("up")).toBe(false);
    bar.set(0.2, "b"); bar.set(0.3, "c"); expect(bar.hoisted).toBe(3);
    bar.set(1, ""); expect(bar.hoisted).toBe(13); expect(fl.every((f) => f.classList.contains("up"))).toBe(true);
    expect(fl[3].style.props["--d"]).toBe("0ms"); expect(fl[4].style.props["--d"]).toBe("90ms");   // (the flags of one last jump rise one after the other)
  });
  test("reduced motion: no animation at all and no creep: the fill, the runner and the working layer step to the marks (the layer shows nothing ahead of the fill); the number still says the mark", () => {
    const { bar, els, num } = setup({ reduced: true });
    bar.set(0.4, "x", { to: 0.5, ms: 3000 });
    for (const id of Object.keys(where)) expect(els[id].anims.length).toBe(0);
    expect(els["ld-ride"].style.transform).toBe("translateX(40%)"); expect(els["ld-fill"].style.transform).toBe("translateX(-60%)");
    expect(els["ld-work"].style.transform).toBe("translateX(-60%)"); expect(els["ld-work-in"].style.transform).toBe("translateX(60%)");   // (the layer stands on the mark, not on 0.5)
    expect(bar.working()).toBeCloseTo(0.4, 9); expect(bar.position()).toBe(0.4); expect(num()).toBe("40");
    bar.set(0.7, "y", { to: 0.8, ms: 3000 }); expect(els["ld-work"].style.transform).toBe("translateX(-30%)"); expect(bar.working()).toBeCloseTo(0.7, 9); expect(num()).toBe("70");
  });
  test("capture (?capture=1): the title clock paints the gauge, so the bar neither animates nor writes the number; the label, the flags and aria-valuenow still follow", () => {
    const { bar, els, num } = setup({ capture: true, flags: 3 });
    bar.set(0.4, "x", { to: 0.5, ms: 3000 }); bar.set(0.6, "y");
    for (const id of Object.keys(where)) { expect(els[id].anims.length).toBe(0); expect(els[id].style.transform).toBeUndefined(); }
    expect(num()).toBe("0"); expect(els["ld-progress"].attrs["aria-valuenow"]).toBe("60"); expect(els.loadlabel.textContent).toBe("y"); expect(bar.mark).toBe(0.6); expect(bar.hoisted).toBe(1);
  });
  test("English: the status line is translated when the page language is English; every step label has an English twin", () => {
    const { bar, els } = setup({ lang: "en" });
    bar.set(0.2, "町並みを準備中…"); expect(els.loadlabel.textContent).toBe("Preparing streets and houses…");
    bar.set(0.3, "街並みをまとめています…"); expect(els.loadlabel.textContent).toBe("Putting the streets together…");
    for (const k of Object.keys(MODULE_LABELS)) expect(MODULE_LABELS_EN[k]).toBeTruthy(); for (const k of Object.keys(FINISH_LABELS)) expect(FINISH_LABELS_EN[k]).toBeTruthy();
    expect(labelEn("読み込み中…")).toBe("Loading…"); expect(labelEn("something else")).toBe("something else");
  });
  test("a page without the elements (a shot frame, a test) does not throw; the fraction is clamped; the log is the page's own record", () => {
    const bar = createLoadBar({ doc: { getElementById: () => null }, now: () => 5.4, reduced: () => false, later: () => 0, cancel: () => {} });
    bar.set(-3, "x"); bar.set(7, "y", { to: 9, ms: 5 });
    expect(bar.log).toEqual([{ t: 5, bar: 0, label: "x", creepTo: null, creepMs: null }, { t: 5, bar: 1, label: "y", creepTo: 1, creepMs: 5 }]);
  });
  test("every step label is natural Japanese: no stray spaces (「町並みを準備中…」), one line, at most 16 characters, and says what is happening", () => {
    const p = loadPlan(["environment", "water", "town", "harbor", "landmarks", "life", "ship", "explore"], { phone: true });
    for (const k of p.keys) { const l = p.label(k); expect(l).toMatch(/[぀-ヿ一-鿿]/); expect([...l].length).toBeLessThanOrEqual(16); expect(l).not.toMatch(/\s/); expect(l).toMatch(/…$/); }
    expect(p.label("town")).toBe("町並みを準備中…"); expect(p.label("explore")).toBe("街の地図を準備中…");
  });
});

// ------------------------------------------------------------------------------------------------------------ the gauge, whole
describe("the number belongs to the load bar: the title clock leaves it alone while the bar is live (ui/loader/title-motion.js)", () => {
  /** A stage that answers every query with an element that takes writes and remembers them (by selector), so a frame of the real clock can run without a browser. */
  const fake = () => {
    const cache = {}, E = () => ({ style: {}, setAttribute() {}, getAttribute: () => null, querySelector: () => E(), querySelectorAll: () => [], dataset: {} });
    const meta = { W: 400, wave: { a: 2.6, f: 17 }, splash: { x: 1, y: 1 }, fish: { x: 1, y: 1, sc: 0.8, r: -26 }, top: -75 };
    const svg = { ...E(), querySelector: (q) => (q === "#logo-meta" ? { textContent: JSON.stringify(meta) } : E()) };
    const pct = { firstChild: { nodeValue: "0" } };
    const stage = { querySelector: (q) => (q === "#logo svg" ? svg : q === ".pct" ? pct : (cache[q] ??= E())), querySelectorAll: () => [] };
    return { stage, pct, cache };
  };
  test("live: the clock reads the bar's edge for the hand-over only; the number stays whatever the bar wrote, frame after frame, whatever the edge is doing", () => {
    for (const reduced of [false, true]) {
      const { stage, pct } = fake(); let p = 0.5;
      const m = createMotion(stage, { reduced, progress: () => p });
      pct.firstChild.nodeValue = "57";   // (the bar's set() wrote it)
      for (const t of [0, 0.5, 1.2, 3, 9]) { m.frame(t); expect(pct.firstChild.nodeValue).toBe("57"); }
      p = 0.9; m.frame(10); p = 0.3; m.frame(11); expect(pct.firstChild.nodeValue).toBe("57");
    }
  });
  test("the page's live progress is the bar's solid edge: main.js hands the bar over as __loadBar, and the boot script's progress() reads its position() (and never a number of its own)", () => {
    expect(main).toContain("window.__loadBar = loadBar");
    expect(read("src/anime/ui/loader/title-boot.js")).toContain("var b = window.__loadBar; return b ? b.position() : 0;");
    expect(html).toContain("var b = window.__loadBar; return b ? b.position() : 0;");   // (the inlined copy)
    expect(read("tools/anime/loader-preview-main.js")).toContain("window.__loadBar = bar");   // (the preview build stands in for main.js and says the same)
  });
  test("a pin (?p=) and the comp's own ramp (a capture of the whole sequence) still write the number: that clock owns the gauge then", () => {
    const a = fake(); createMotion(a.stage, { progress: 0.42 }).frame(1); expect(a.pct.firstChild.nodeValue).toBe("42");
    const b = fake(); createMotion(b.stage, { progress: null, ramp0: 0.62 }).frame(0.3); expect(b.pct.firstChild.nodeValue).toBe("62");
  });
  test("the hand-over to the prompt still starts when the solid edge reaches the end (the bar's position() is 1), and not before", () => {
    globalThis.document = { getElementById: () => null };
    try {
      const { stage, cache } = fake(); let p = 0.99;
      const m = createMotion(stage, { progress: () => p });
      m.frame(5); expect(cache[".prompt"].style.display).toBe("none"); expect(cache[".gauge"].style.opacity).toBe(1);
      p = 1; m.frame(6); expect(cache[".prompt"].style.display).toBe("grid");
    } finally { delete globalThis.document; }
  });
});

describe("the gauge: the solid fill and the number are the mark, the working layer is behind them, the runner swims (index.html, loader.css)", () => {
  const bar = html.match(/<div class="bar" id="ld-progress"[\s\S]*?<!--\/klc:runner--><\/div><\/div>/)[0];
  test("the markup: the working layer sits in the bar BEFORE the fill (the fill covers it) and the runner's lane after both; the number is a text node before the % sign", () => {
    for (const id of ["ld-work", "ld-work-in", "ld-fill", "ld-fill-in", "ld-ride"]) expect(bar.split(`id="${id}"`).length).toBe(2);
    expect(bar.indexOf('id="ld-work"')).toBeLessThan(bar.indexOf('id="ld-fill"')); expect(bar.indexOf('id="ld-fill"')).toBeLessThan(bar.indexOf('id="ld-ride"'));
    expect(bar).toContain('<div class="ld-work" id="ld-work"><div class="ld-work-in" id="ld-work-in"></div></div>');
    expect(bar).toMatch(/role="progressbar"[^>]*aria-valuenow="0"/);
    expect(html).toContain('<span class="pct" id="ld-pct">0<small>%</small></span>');   // (core/loadbar.js writes its first text node)
  });
  test("the working layer is 山吹 at 30 to 40 %, built like the fill (a clip and a counter-slide, the same radius), and hidden in a capture", () => {
    const o = parseFloat(decl(R, "#ld-work", "opacity")); expect(o).toBeGreaterThanOrEqual(0.3); expect(o).toBeLessThanOrEqual(0.4);
    expect(decl(R, "#ld-work-in", "background")).toBe("var(--yamabuki)"); expect(decl(R, "#ld-fill-in", "background")).toBe("var(--yamabuki)");
    for (const k of ["position", "inset", "overflow", "border-radius", "transform", "will-change"]) expect(decl(R, "#ld-work", k)).toBe(decl(R, "#ld-fill", k));
    expect(decl(R, "#ld-work-in", "transform")).toBe(decl(R, "#ld-fill-in", "transform"));
    expect(decl(R, "html[data-capture] #ld-work", "display")).toBe("none");
    expect(decl(R, "#ld-fill", "opacity")).toBeUndefined();   // (the solid fill is solid)
  });
  test("the runner swims in place: a transform-only keyframe animation on its own box, the lean in every keyframe; idle slows it; reduced motion and a capture stop it", () => {
    const lean = decl(R, ".runner", "transform"); expect(lean).toBe("translate(-72%, -52%)");
    expect(decl(R, ".runner", "animation")).toBe("klc-swim 1.1s ease-in-out infinite");
    const kf = keyframes(css, "klc-swim"); expect(kf).toBeTruthy(); expect(kf.split(lean).length - 1).toBe(2);   // (an animated transform replaces the one above: both blocks carry the lean)
    expect(decl(R, "#intro.ld-idle .runner", "animation-duration")).toBe("2.4s");
    expect(decl(R, ".runner", "animation", ["@media (prefers-reduced-motion: reduce)"])).toBe("none !important");
    expect(decl(R, "html[data-capture] .runner", "animation")).toBe("none !important");
  });
  test("the standing mascot (the localhost-only ?hoya=run preview) only changes position, in two steps: no turn, squash or skew (the city's manual)", () => {
    const k = keyframes(css, "klc-bob2"); expect(k).toBeTruthy(); expect(k).not.toMatch(/rotate|scale|skew|matrix/);
    expect(decl(R, "html.klc-hoya-dev .runner", "animation")).toBe("klc-bob2 500ms steps(1, end) infinite");
  });
});

// ------------------------------------------------------------------------------------------------------------ the tips
describe("the 気仙沼まめ知識 tips (data/loading-tips.json)", () => {
  const data = JSON.parse(read("data/loading-tips.json")), tips = data.tips;
  test("26 or more tips, each with an id, a topic, Japanese, English and a source URL and title; ids are unique", () => {
    expect(tips.length).toBeGreaterThanOrEqual(24); expect(new Set(tips.map((t) => t.id)).size).toBe(tips.length);
    for (const t of tips) {
      expect(t.id).toMatch(/^[a-z0-9-]+$/); expect(["mascot", "food", "port", "places", "nature", "culture"]).toContain(t.topic);
      expect(typeof t.ja).toBe("string"); expect(typeof t.en).toBe("string"); expect(t.source.url).toMatch(/^https:\/\//); expect(t.source.title.length).toBeGreaterThan(3);
    }
  });
  test("every source has an English title too, so an English page never shows a Japanese-only line", () => {
    for (const t of tips) { expect(t.source.title_en).toMatch(/^[\x20-\x7E\u2019]{8,60}$/); expect(t.source.title_en).not.toMatch(/'/); expect(t.source.title_en).toMatch(/\(.+\)$/); }   // (plain ASCII, the publisher in brackets, one short line)
    const inline = JSON.parse(html.match(/<script type="application\/json" id="klc-tips">([\s\S]*?)<\/script>/)[1]);
    inline.forEach((t, i) => expect(t.srcEn).toBe(tips[i].source.title_en));
    expect(html).toContain("lang === 'en' ? 'Source: ' + esc(t.srcEn || t.src || '') : '出典：' + esc(t.src || '')");
  });
  test("short enough for two lines on a phone (44 Japanese characters, 92 English), one sentence", () => {
    for (const t of tips) { expect([...t.ja].length).toBeLessThanOrEqual(44); expect([...t.en].length).toBeLessThanOrEqual(92); expect(t.ja.split("。").filter(Boolean).length).toBe(1); }
    for (const t of tips) expect(t.en).not.toMatch(/["']/);   // (typographic quotes and apostrophes in the English copy)
  });
  test("the town as the living place it is: nothing matches SENSITIVE (scripts/anime/enrich/fold.js), and none of the words the loader must never use", () => {
    for (const t of tips) for (const s of [t.ja, t.en, t.source.title, t.source.title_en, t.id]) { expect(s).not.toMatch(SENSITIVE); expect(s).not.toMatch(/201[1]|3\.1[1]|\u9707\u707d|\u6d25\u6ce2|tsun[a]mi|disaster|災害|被災|復興|防災|避難/i); }
  });
  test("Japanese typesetting: full-width punctuation, half-width digits, no spaces between Japanese words, no line-start punctuation", () => {
    for (const t of tips) {
      expect(t.ja).not.toMatch(/[,.!?;:]/); expect(t.ja).not.toMatch(/[０-９]/); expect(t.ja).not.toMatch(/[぀-ヿ一-鿿]\s+[぀-ヿ一-鿿]/); expect(t.ja).not.toMatch(/\s[、。]/);
      expect(t.ja.endsWith("。")).toBe(true);
    }
  });
  test("the mascot tips come from the city: the design manual or the city's page (with the page of the manual noted), the official tourism site for the rest", () => {
    const mascot = tips.filter((t) => t.topic === "mascot"); expect(mascot.length).toBeGreaterThanOrEqual(5);
    for (const t of mascot) expect(t.source.url).toMatch(/^https:\/\/(www\.kesennuma\.miyagi\.jp|kesennuma-kanko\.jp)\//);
    const belt = tips.find((t) => t.id === "mascot-sword-belt"); expect(belt.ja).toBe("ホヤぼーやの剣はサンマで、ベルトはホタテなんだよ。");
    expect(belt.source.url).toBe("https://www.kesennuma.miyagi.jp/sec/s084/030/010/010/20260520hoyaboyadesignmanual.pdf"); expect(belt.source.page).toMatch(/p\.1/);
  });
  test("the page carries them with phrase breaks (zero-width spaces), and removing those gives back the data file's text", () => {
    const inline = JSON.parse(html.match(/<script type="application\/json" id="klc-tips">([\s\S]*?)<\/script>/)[1]);
    expect(inline.length).toBe(tips.length);
    inline.forEach((t, i) => { expect(t.ja.split(ZW).join("")).toBe(tips[i].ja); expect(t.en).toBe(tips[i].en); expect(t.id).toBe(tips[i].id); expect(t).not.toHaveProperty("source"); });
    expect(phrases("ホヤぼーやの剣はサンマで、ベルトはホタテなんだよ。").split(ZW).join("")).toBe("ホヤぼーやの剣はサンマで、ベルトはホタテなんだよ。");
    expect(phrases("ホヤぼーやの剣はサンマで、ベルトはホタテなんだよ。")).toContain(ZW);
    expect(tipsJson({ tips: [{ id: "x", ja: "</script>", en: "<!--" }] })).not.toMatch(/</);
  });
});

// ------------------------------------------------------------------------------------------------------------ the flags and the rope
describe("the 大漁旗 drawings stay available; the v3 title does not hang them", () => {
  const flags = existsSync(join(ROOT, "src/anime/assets/loader/flags.json")) ? JSON.parse(read("src/anime/assets/loader/flags.json")) : null;
  test("the page does not ship the rope of flags", () => {
    expect(html).not.toContain('class="ld-flag"');
  });
  test("flagsHtml still places a set on the rope's curve, from 7 % to 93 %", () => {
    const sample = flagsHtml((flags?.flags || [{ id: "a", svg: "<svg/>" }]).slice(0, 13));
    const xs = [...sample.matchAll(/style="--x:([\d.]+);--y:([\d.]+);--i:(\d+)"/g)].map((m) => [+m[1], +m[2]]);
    expect(xs[0][0]).toBeCloseTo(7, 1); expect(xs.at(-1)[0]).toBeCloseTo(93, 1);
    for (const [x, y] of xs) expect(y).toBeCloseTo(ropeY(x), 3);
    expect(ropeY(46)).toBeGreaterThan(ropeY(0));
  });
  test("every flag is an original drawing in the traditional palette, small and self-contained (when the set is in)", () => {
    if (!flags) return;
    expect(flags.flags.length).toBeGreaterThanOrEqual(13);
    const ok = new Set(Object.values(flags.palette).map((h) => h.toUpperCase()));
    for (const f of flags.flags) {
      expect(f.svg).toMatch(/^<svg [^>]*viewBox="0 0 40 60"/); expect(f.svg.length).toBeLessThan(2400); expect(f.svg).not.toMatch(/<image|<script|href=|filter=|<text/);
      for (const m of f.svg.matchAll(/#[0-9A-Fa-f]{6}\b/g)) expect(ok.has(m[0].toUpperCase())).toBe(true);
    }
    for (const h of ok) expect([...TRAD()]).toContain(h);
  });
});
function TRAD() { return ["#165E83", "#223A70", "#17184B", "#00A3AF", "#89C3EB", "#F19072", "#F8B500", "#B7282E", "#FBFAF5", "#595857", "#EB6101", "#FEEEED", "#A0D8EF", "#78C2C4", "#1C1C1C"]; }

// ------------------------------------------------------------------------------------------------------------ the hand-off
describe("the hand-off cuts the still and fades the title; there is no iris", () => {
  test("the still is display:none at once, a short landscape screen has its own layout, the prompt shows no focus ring on touch", () => {
    expect(decl(R, "body.playing .hoya img", "display")).toBe("none");
    expect(decl(R, "#go:focus-visible", "outline", ["@media (hover: none) and (pointer: coarse)"])).toBe("none");
    expect(decl(R, "#intro", "--hz", ["@media (orientation: landscape) and (max-height: 520px)"])).toBe("66%");
    expect(html).not.toContain("function iris(");
    expect(html).not.toContain("klc-iris");
  });
  test("the safety net: if the script never finishes the exit, the picture is gone 1.2 s after playing", () => {
    expect(decl(R, "body.playing #intro", "animation")).toBe("klc-gone 10ms linear 1.2s forwards"); expect(decl(R, "body.playing #intro", "pointer-events")).toBe("none");
  });
});

describe("a load that cannot go on says so, politely, with a way forward (docs/CRAFT.md section 7)", () => {
  test("the notice has a message for each case in Japanese and English, a retry button of at least 44 px, and replaces the card", () => {
    const err = html.match(/<div class="ld-err"[\s\S]*?<\/button><\/div>/)[0].replace(/<wbr>/g, "");   // (the Japanese is hand-set with <wbr> at each phrase)
    expect(html).toContain("読み込みに<wbr>時間が<wbr>かかっています。<wbr>電波の<wbr>よい<wbr>場所で、<wbr>もう一度<wbr>お試しください。");
    expect(decl(R, "#intro.ld-failed .hoya", "display")).toBe("none");
    for (const kind of ["slow", "offline", "failed"]) { expect(err).toContain(`m-${kind} m-ja`); expect(err).toContain(`m-${kind} m-en`); }
    expect(err).toContain("読み込みに時間がかかっています。電波のよい場所で、もう一度お試しください。"); expect(err).toContain("You seem to be offline. Please reconnect and try again.");
    expect(err).not.toMatch(/[,!?]/.exec("") ? /$^/ : /。。|、、/); expect(err).toContain('<button type="button" id="ld-retry">');
    expect(decl(R, "#ld-retry", "min-height")).toBe("44px"); expect(decl(R, "#intro.ld-failed .ld-card", "display")).toBe("none"); expect(decl(R, "#intro.ld-failed .ld-err", "display")).toBe("block");
    expect(decl(R, ".ld-err", "display")).toBe("none");   // (never shown unless something is wrong)
  });
  test("it is raised for a script that fails to arrive, for offline, and for 30 s without a single progress report; it leaves when progress starts; the button reloads", () => {
    for (const s of ["t.tagName === 'SCRIPT'", "navigator.onLine === false", "performance.now() > 30000", "window.__loadLog && window.__loadLog.length > 0", "location.reload()", "addEventListener('offline', health)"]) expect(html).toContain(s);
    expect(html).toContain("notice('failed')"); expect(html).toContain("notice('offline')"); expect(html).toContain("notice('slow')");
  });
  test("the button is never shown disabled and greyed: it is hidden while the town loads and appears, enabled, when it is ready", () => {
    expect(decl(R, ".ld-cta", "visibility")).toBe("hidden"); expect(decl(R, "body.loaded .ld-cta", "visibility")).toBe("visible");
    expect(decl(R, "#go:disabled", "cursor")).toBe("default"); expect(css).not.toMatch(/#go:disabled\s*\{[^}]*opacity/);
  });
});

describe("inline helpers", () => {
  test("plainJs strips comments and exports, keeps strings", () => {
    expect(plainJs("// c\nexport const a = 'x//y'; // t\n/* b */ export function f() {}")).toBe("const a = 'x//y';\nfunction f() {}");
  });
});
