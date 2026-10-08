// [ui-c2] UI lane C, round 2, row 9: the loading plan (a weight and a Japanese label for every stage of build()), the bar that shows it, and build()'s steps.
// The browser-side numbers (the timeline of a cold load, the labels during the old 89 % plateau) are in tools/anime/ui-c2-check.mjs (through the machine gate).
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { loadPlan, WEIGHTS, FINISH_LABELS, MODULE_LABELS } from "../src/anime/core/loadplan.js";

const ROOT = resolve(import.meta.dir, "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const html = read("src/anime/index.html"), main = read("src/anime/main.js");

// ------------------------------------------------------------------------------------------------------------ row 9: the plan
describe("row 9: the loading plan (core/loadplan.js)", () => {
  const MODS = ["environment", "water", "town", "harbor", "landmarks", "life", "ship", "explore"];
  for (const phone of [false, true]) {
    const tier = phone ? "phone" : "desktop";
    test(`${tier}: the stages in build()'s order, every mark inside (0, 1), strictly increasing, ending at 1`, () => {
      const p = loadPlan(MODS, { phone });
      expect(p.keys).toEqual(["fonts", ...MODS, "wires", ...(phone ? ["prep"] : []), "batch", "compile"]);
      let prev = 0;
      for (const k of p.keys) { expect(p.start(k)).toBeGreaterThan(prev); expect(p.start(k)).toBeLessThan(1); prev = p.start(k); }
      expect(p.start("fonts")).toBeCloseTo(WEIGHTS[tier].boot / p.total, 10);   // the bar starts where the page, the bundle and the data files left it
      for (let i = 0; i + 1 < p.keys.length; i++) expect(p.end(p.keys[i])).toBe(p.start(p.keys[i + 1]));
      expect(p.end(p.keys.at(-1))).toBe(1);
      expect(p.keys.reduce((s, k) => s + p.span(k), p.start("fonts"))).toBeCloseTo(1, 10);
    });
    test(`${tier}: the finishing work is no longer one step at 89 %: the bar reaches it with a little over half of the time spent, and the long step has room to creep`, () => {
      const p = loadPlan(MODS, { phone });
      const finishStart = p.start("wires");
      expect(finishStart).toBeGreaterThan(0.4); expect(finishStart).toBeLessThan(0.7);   // (the old bar stood at 0.89 for all of it)
      expect(p.start("batch")).toBeLessThan(0.75);
      // the biggest single stage: on desktop the static batch (20 s), not shaders; on the phone, since its batch writes its cells directly
      // ([mobile-perf] 2026-10-08), the compile (the programs: Metal pipelines on an iPhone, a third of the load)
      const long = phone ? "compile" : "batch";
      for (const k of p.keys) if (k !== long) expect(p.span(long)).toBeGreaterThan(p.span(k));
      expect(p.span(long)).toBeGreaterThan(0.2);
      if (!phone) expect(p.span("compile")).toBeLessThan(0.1);
      expect(p.end("compile")).toBe(1);
    });
  }
  test("[mobile-perf] the phone's weights are its measured times (the iOS Simulator, cold, 2026-10-08): the bar no longer sits at 99 % through the compile", () => {
    // stats.finish (ms) of two cold loads of the deploy #7 candidate; ~180: the conductor's "150-200 each". compile carries main()'s work after build() (stats.finish.post)
    const MEASURED = { fonts: 358, environment: 618, water: 180, town: 1505, harbor: 905, landmarks: 438, life: 330, ship: 180, explore: 1184, wires: 180, prep: 180, batch: 1122, compile: 3506 };
    for (const [k, ms] of Object.entries(MEASURED)) { expect(Math.abs(WEIGHTS.phone[k] - ms / 100)).toBeLessThanOrEqual(k === "compile" ? 2 : 1); }
    const p = loadPlan(MODS, { phone: true });
    expect(p.start("compile")).toBeGreaterThan(0.55); expect(p.start("compile")).toBeLessThan(0.8);   // it was 0.99: 3/334 of the plan, ~4.5 s on an iPhone
    expect(p.span("compile")).toBeGreaterThan(0.25);
  });
  test("a module that is not in the table still moves the bar (it weighs `other`); a subset of modules still adds up", () => {
    const p = loadPlan(["environment", "newthing"]);
    expect(p.weight("newthing")).toBe(WEIGHTS.desktop.other);
    expect(p.end(p.keys.at(-1))).toBe(1);
    expect(loadPlan([]).keys).toEqual(["fonts", "wires", "batch", "compile"]);
  });
  test("every label is Japanese, one line, and says what is happening (the card was 'Loading…' in English on a Japanese page, and 仕上げ中… for half the wait)", () => {
    const p = loadPlan(MODS, { phone: true });
    const all = [...p.keys.map((k) => p.label(k)), ...Object.values(FINISH_LABELS), "読み込み中…"];
    for (const l of all) { expect(l).toMatch(/[぀-ヿ一-鿿]/); expect([...l].length).toBeLessThanOrEqual(16); expect(l).not.toMatch(/Loading/i); }
    expect(p.label("town")).toBe("町並みを準備中…");
    expect(p.label("explore")).toBe("街の地図を準備中…");
    expect(new Set(Object.values(FINISH_LABELS)).size).toBe(Object.keys(FINISH_LABELS).length);   // each finishing step says something different
    expect(Object.keys(MODULE_LABELS)).toEqual(expect.arrayContaining(MODS));
    expect(read("src/anime/main.js")).not.toContain("仕上げ中");   // (the one-step label is gone)
    expect(html).toMatch(/id="loadlabel" data-title="1"/);   // [title] the designed sentence stays; stage names stay in the load log
    expect(html).toContain("まちを よみこんでいます");
    expect(html).toContain("Reading the town…");
    for (const l of all) expect(l).not.toMatch(/\s/);   // (docs/CRAFT.md section 2: no spaces between Japanese words, 「町並みを準備中…」)
  });
});

// ------------------------------------------------------------------------------------------------------------ row 9: the bar
// The bar, the runner on its leading edge and the status line (core/loadbar.js) were rewritten for the 「帰港」 loading screen: their tests are in test/loader.test.js
// ("the bar and the runner show the real progress").

describe("row 9: build() says what it is doing", () => {
  test("main.js: every stage is labelled and begins with a paint, in build()'s order; the finishing work is four steps (wires, slimming on a phone, batch, compile)", () => {
    const b = main.slice(main.indexOf("async function build() {"), main.indexOf("// ------------------------------------------------------------------ player / cameras"));
    const order = ["begin('fonts')", "begin(name)", "begin('wires')", "begin('prep')", "begin('batch')", "begin('compile')"].map((k) => b.indexOf(k));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    expect(b).toContain("await afterPaint(60);");
    expect((b.match(/await begin\(/g) || []).length).toBe(6);   // fonts, the modules loop, wires, prep (phone), batch, compile: every one awaited (the paint wait lives inside begin)
    expect(b).toMatch(/if \(quality\.phone\) \{ t = await begin\('prep'\);/);
    for (const k of ["fonts", "wires", "batch", "compile"]) expect(b).toMatch(new RegExp(`t = await begin\\('${k}'\\);`));
    expect(b).toMatch(/for \(const name of list\) \{\s*t = await begin\(name\);/);
    expect(b).toContain("renderer.compile(scene, camera)");
    expect(b).toContain("planet.precompile?.();");
    expect(b).not.toContain("begin('planet')");   // (it compiles one quad, 0 ms: no step, no label)
    expect(b.indexOf("phonePrep()")).toBeLessThan(b.indexOf("batchStatic2("));   // the slimming is still before the batch
    expect(b.indexOf("ctx.wires.build()")).toBeLessThan(b.indexOf("phonePrep()"));
    expect(b.indexOf("batchStatic2(")).toBeLessThan(b.indexOf("renderer.compile(scene, camera)"));
    expect(b).not.toContain("setProgress(1, '');");   // [mobile-perf] the 100 % is main()'s, when the title is ready (below)
    expect(b).toContain("stats.finish[key] = Math.round(performance.now() - t);");
    expect(b).toContain("stats.bootMs = Math.round(performance.now());");
    expect(main).toContain("const loadBar = createLoadBar(); window.__loadLog = loadBar.log;");
    expect(main).toMatch(/document\.body\.classList\.add\('loaded'\);\s*document\.documentElement\.classList\.add\('klc-card-ready'\);/);   // the card is on screen when the town is ready, whatever the font hold did
    // the hidden meshes are shown for the compile and put back even if it throws
    expect(b).toMatch(/finally \{ for \(const o of hidden\) o\.visible = false; \}/);
  });
  test("[mobile-perf] the bar's 100 % lands when the title is ready: after main()'s own work (play's mount, the first update, the first frame asked for), timed as stats.finish.post", () => {
    const m = main.slice(main.indexOf("async function main() {"));
    expect(m).toContain("await build();\n  const tPost = performance.now();");
    const at = m.indexOf("stats.finish.post = Math.round(performance.now() - tPost);\n  setProgress(1, '');");
    expect(at).toBeGreaterThan(m.indexOf("mountPlay(ctx);"));
    expect(at).toBeGreaterThan(m.indexOf("requestAnimationFrame(frame);"));
    expect(at).toBeLessThan(m.indexOf("if (SHOT) {"));
    expect(at).toBeLessThan(m.indexOf("performance.mark('klc:ready')"));
    expect(at).toBeLessThan(m.indexOf("document.body.classList.add('loaded');"));
  });
  test("the compile step: the synchronous renderer.compile stays the default (what shipped); ?compile=async waits for the programs with compileAsync, capped at 30 s; the first frame's time is recorded", () => {
    const b = main.slice(main.indexOf("t = await begin('compile');"), main.indexOf("setProgress(1, '');"));
    expect(b).toContain("params.get('compile') === 'async' && typeof renderer.compileAsync === 'function'");
    expect(b).toContain("compiled = renderer.compileAsync(scene, camera); else renderer.compile(scene, camera);");
    expect(b).toContain("try { if (compiled) await Promise.race([compiled, new Promise((r) => setTimeout(r, 30000))]); } catch (e) { console.warn(e); }");   // (a program that never reports ready must not keep the town from opening)
    expect(b.indexOf("for (const o of hidden) o.visible = false;")).toBeLessThan(b.indexOf("await Promise.race([compiled"));   // the meshes are put back before the wait (the programs were made inside the call)
    expect(b.indexOf("await Promise.race([compiled")).toBeLessThan(b.indexOf("finished('compile', t);"));
    expect(b).toContain("planet.precompile?.();");
    // the first frame's clock: minus the klc:ready mark, the stall of the first frame
    expect(main).toContain("if (stats.firstFrameMs === undefined) stats.firstFrameMs = Math.round(performance.now());");
    expect(main.indexOf("pipeline.render(scene, camera, sunDir, simT);   // [v3:integrate]")).toBeLessThan(main.indexOf("stats.firstFrameMs = "));
  });
});
