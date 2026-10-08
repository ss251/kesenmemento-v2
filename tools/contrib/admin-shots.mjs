// Drives the contributor admin page in headless Chrome against a seeded local backend and checks it behaves:
// login, filters, list, detail, deciding, bulk "mark used", export, language switch, keyboard, phone and laptop
// layouts, dark mode. Writes screenshots (synthetic data only) for docs/contrib/README.md.
//
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/contrib/admin-shots.mjs [--port 8981] [--cdp 8982] [--out docs/contrib/shots] [--results]
//   (--results also writes RESULTS.json next to the screenshots)
//
// Machine rules: Chrome only through the gate; ports 8981 (backend) and 8982 (DevTools) by default; everything is
// closed at the end. This is a plain script rather than a `bun test` file because child processes inside bun test
// return empty output on this machine.
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { start } from "../../server/contrib/index.js";
import { seedDemo } from "./seed.mjs";
import { launch, ROOT } from "../anime/cdp.mjs";

const arg = (name, def) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : def; };
const PORT = Number(arg("--port", 8981)), CDP = Number(arg("--cdp", 8982));
const OUT = resolve(ROOT, arg("--out", "docs/contrib/shots"));
const ADMIN = "adm-" + "x".repeat(30);
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, extra = "") => { results.push({ name, ok: Boolean(ok), extra }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  (" + extra + ")" : ""}`); };

const dir = mkdtempSync(join(tmpdir(), "contrib-shots-"));
const quiet = { level: "silent", debug() {}, info() {}, warn() {}, error() {} };
const server = await start({ port: PORT, adminToken: ADMIN, tokenSecret: "tok-" + "y".repeat(30), dbPath: join(dir, "c.db"), diskDir: join(dir, "files"), appUrl: "https://app.example/", logger: quiet });
await seedDemo({ base: server.url, adminToken: ADMIN });
console.log(`backend ${server.url}, seeded`);

let browser;
try {
  browser = await launch({ args: [`--remote-debugging-port=${CDP}`] });
  const p = await browser.page({ width: 390, height: 844, dpr: 2 });
  const ev = (expr) => p.eval(expr);
  const wait = (expr, timeout = 20000) => p.waitFor(expr, { timeout, poll: 100 });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const shot = async (name, { jpeg = true } = {}) => {
    const png = await p.shot(null);
    const file = join(OUT, name + (jpeg ? ".jpg" : ".png"));
    await sharp(png).resize({ width: 1000, withoutEnlargement: true })[jpeg ? "jpeg" : "png"](jpeg ? { quality: 80 } : {}).toFile(file);
    console.log(`  wrote ${file.slice(ROOT.length + 1)}`);
  };
  const metrics = async (w, h, dpr, mobile) => {
    await p.S("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: dpr, mobile, screenWidth: w, screenHeight: h });
    await p.S("Emulation.setTouchEmulationEnabled", { enabled: mobile });
  };
  const click = (sel) => ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.click(); return true; })()`);
  const fill = (sel, v) => ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); el.value = ${JSON.stringify(v)}; el.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
  const key = async (k, code) => { await p.S("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, text: k.length === 1 ? k : undefined }); await p.S("Input.dispatchKeyEvent", { type: "keyUp", key: k, code }); };
  const overflow = () => ev("document.documentElement.scrollWidth - window.innerWidth");
  const text = (sel) => ev(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? null`);
  // the list's thumbnails load lazily (only rows in view, a few at a time): let the visible ones finish before a picture of the list is taken
  const settleThumbs = async () => {
    try {
      await wait('(() => { const seen = [...document.querySelectorAll(".row .thumb")].filter((t) => { const r = t.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && t.querySelector("img"); }); return seen.length === 0 || seen.every((t) => { const i = t.querySelector("img"); return i.src.startsWith("blob:") && i.complete && i.naturalWidth > 0; }); })()', 8000);
    } catch { /* take the picture anyway: a missing thumbnail is not what this script checks here */ }
    await sleep(150);
  };
  // iOS Safari zooms the page when a control under 16px takes focus; on a touch device every visible control must be at least 16px
  const tinyControls = () => ev('[...document.querySelectorAll("input, select, textarea")].filter((e) => e.offsetParent !== null && e.type !== "checkbox" && e.type !== "radio" && parseFloat(getComputedStyle(e).fontSize) < 16).map((e) => (e.tagName + " " + (e.getAttribute("aria-label") || e.type || "")).trim())');
  const imagesReady = (sel, n = 1) => wait(`[...document.querySelectorAll(${JSON.stringify(sel)})].filter((i) => i.src.startsWith("blob:") && i.complete && i.naturalWidth > 0).length >= ${n}`);

  // ---------------------------------------------------------------- phone
  await p.S("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
  await metrics(390, 844, 2, true);
  await p.goto(`${server.url}/admin`);
  await wait('document.querySelector("form.login-card") !== null');
  check("the admin page loads and shows the sign-in form", true);
  check("the sign-in form uses a password field and has a visible language switch", await ev('!!document.querySelector("input[type=password]") && document.body.textContent.includes("English") || document.body.textContent.includes("日本語")'));
  await shot("admin-phone-login");

  await fill("input[type=password]", "wrong-token-wrong-token-wrong");
  await ev('document.querySelector("form.login-card").requestSubmit()');
  await wait('document.querySelector(".login-card .error")?.textContent.length > 0');
  check("a wrong token is refused with a message and the form stays", (await ev('!!document.querySelector("form.login-card")')) && (await text(".login-card .error")).length > 0, await text(".login-card .error"));

  await fill("input[type=password]", ADMIN);
  await fill('input[autocomplete="nickname"]', "テスト管理者");
  await ev('document.querySelector("form.login-card").requestSubmit()');
  await wait('document.querySelectorAll(".row").length > 0');
  check("the right token opens the queue (7 new items)", (await ev('document.querySelector(".tab[data-status=new] .count").textContent')) === "7", await ev('document.querySelector(".tab[data-status=new] .count").textContent'));
  check("the token is kept in sessionStorage, not localStorage", (await ev('sessionStorage.getItem("klc.admin.token")')) === ADMIN && (await ev('localStorage.getItem("klc.admin.token")')) === null);
  await imagesReady(".thumb img", 3);
  check("thumbnails load through authenticated fetches (blob: URLs)", true);
  check("the phone list has no horizontal scroll", (await overflow()) <= 0, `overflow ${await overflow()}px`);
  const tinyList = await tinyControls();
  check("on the phone no form control of the list is under 16px (iOS would zoom the page on focus)", tinyList.length === 0, JSON.stringify(tinyList));
  await settleThumbs();
  await shot("admin-phone-list");

  // detail as a full-screen sheet
  await click(".row");
  await wait('document.querySelector(".detail-pane.open .shot-img") !== null');
  await imagesReady(".detail-pane .shot-img", 1);
  check("tapping a row opens the detail as a full-screen sheet with the screenshot loaded", await ev('getComputedStyle(document.querySelector(".detail-pane")).position') === "fixed");
  check("the URL carries the submission (#/s/<id>) so a team mate can share it", /^#\/s\/[a-z0-9]{16}$/.test(await ev("location.hash")));
  check("the phone detail has no horizontal scroll", (await overflow()) <= 0, `overflow ${await overflow()}px`);
  check("the action bar is on screen (sticky) with Accept, Reject, Used and Back to new", (await ev('document.querySelectorAll(".actions .decide .btn").length')) === 4);
  const decideBtn = await ev('(() => { const r = document.querySelector(".decide .btn").getBoundingClientRect(); return { h: r.height, bottom: r.bottom, vh: innerHeight }; })()');
  check("decision buttons are at least 44 px tall and inside the viewport", decideBtn.h >= 44 && decideBtn.bottom <= decideBtn.vh, JSON.stringify(decideBtn));
  const bar = await ev('(() => { const a = document.querySelector(".actions").getBoundingClientRect(), i = document.querySelector(".actions input[type=number]").getBoundingClientRect(); return { barH: a.height, vh: innerHeight, inputW: i.width, value: document.querySelector(".actions input[type=number]").value }; })()');
  check("the phone review bar leaves most of the screen to the content (under 22% of the height)", bar.barH / bar.vh < 0.22, `${Math.round(bar.barH)} of ${bar.vh} px`);
  check("the points field is readable (wide enough, filled with the default 5 for an issue)", bar.inputW >= 56 && bar.value === "5", JSON.stringify(bar));
  const tinyDetail = await tinyControls();
  check("nor in the review bar and the detail (points, note, filters behind it)", tinyDetail.length === 0, JSON.stringify(tinyDetail));
  await shot("admin-phone-detail");
  await ev('document.querySelector(".detail-pane").scrollTo(0, 900)');
  await sleep(300);
  await shot("admin-phone-detail-scrolled");

  // back button closes the sheet
  await ev("history.back()");
  await wait('!document.querySelector(".detail-pane.open")');
  check("the browser Back button closes the detail sheet", true);

  // open a fix with photos (the bus-stop report: a JPEG and a PNG, the second far from the camera)
  await ev('[...document.querySelectorAll(".row")].find((r) => r.textContent.includes("bus stop")).click()');
  await wait('document.querySelector(".detail-pane.open .photo") !== null');
  await imagesReady(".detail-pane .photo-img", 2);
  check("a fix shows its photos with EXIF (camera, GPS, distance from the camera)", (await ev('document.querySelector(".photo .kv")?.textContent.includes("SynthPhone")')) && (await ev('document.querySelector(".photo .dist") !== null')));
  check("photo previews are real images (two photos, JPEG and PNG)", (await ev('[...document.querySelectorAll(".photo-img")].every((i) => i.naturalWidth > 100)')) && (await ev('document.querySelectorAll(".photo-img").length')) === 2);
  check("a photo taken far from the camera is flagged", await ev('document.querySelectorAll(".dist.far").length >= 1'));
  check("a GSI map link and the app's ?cam= link are offered", (await ev('[...document.querySelectorAll(".detail-pane a")].some((a) => a.href.startsWith("https://maps.gsi.go.jp/#18/"))')) && (await ev('[...document.querySelectorAll(".detail-pane a")].some((a) => a.href.startsWith("https://app.example/?cam="))')));
  await ev('document.querySelector(".detail-pane").scrollTo(0, 700)');
  await sleep(250);
  await shot("admin-phone-photos");
  await ev("history.back()"); await wait('!document.querySelector(".detail-pane.open")');

  // a HEIC the server cannot decode: no preview, but its EXIF and the original are there
  await ev('[...document.querySelectorAll(".row")].find((r) => r.textContent.includes("HEIC")).click()');
  await wait('document.querySelector(".detail-pane.open .photo") !== null');
  check("a HEIC without a preview says so and offers the original file, with its EXIF", (await ev('document.querySelector(".photo .nopreview") !== null')) && (await ev('[...document.querySelectorAll(".photo .btn")].some((b) => /Original|元ファイル/.test(b.textContent))')) && (await ev('document.querySelector(".photo .kv")?.textContent.includes("GPS")')));

  // lightbox
  await click(".shot-img");
  await wait('document.querySelector("dialog.lightbox[open]") !== null');
  check("tapping the screenshot opens a zoomable lightbox", true);
  await ev('document.querySelector("dialog.lightbox .x").click()');
  await wait('!document.querySelector("dialog[open]")');

  // decide: accept (auto-advance)
  const beforeId = await ev("location.hash");
  await fill(".actions input[type=number]", "30");
  await ev('document.querySelector(".actions textarea").value = "確認しました"');
  await click(".decide .btn.ok");
  await wait('document.querySelector(".toast.ok") !== null');
  check("accepting shows a confirmation and moves to the next submission", (await ev("location.hash")) !== beforeId || (await text(".toast")).length > 0, await text(".toast"));
  await sleep(300);
  const counts = await ev('Object.fromEntries([...document.querySelectorAll(".tab .count")].map((c) => [c.dataset.status, c.textContent]))');
  check("the tab counts follow (new 6, accepted 4)", counts.new === "6" && counts.accepted === "4", JSON.stringify(counts));
  await ev("history.back()"); await sleep(300);
  if (await ev('!!document.querySelector(".detail-pane.open")')) await ev("history.back()");
  await sleep(300);

  // more menu -> export
  await click("#more");
  await wait('document.querySelector("dialog[open]") !== null');
  await ev('[...document.querySelectorAll("dialog[open] .btn")].find((b) => /Export|エクスポート/.test(b.textContent)).click()');
  await wait('document.querySelector("dialog[open] input[type=date]") !== null');
  await ev('[...document.querySelectorAll("dialog[open] .quick .btn")][0].click()');
  check("the export dialog fills a JST week with one tap", /^\d{4}-\d{2}-\d{2}$/.test(await ev('document.querySelector("dialog[open] input[type=date]").value')));
  const dates = await ev('(() => { const d = document.querySelector("dialog[open]").getBoundingClientRect(); return [...document.querySelectorAll("dialog[open] input[type=date]")].map((i) => i.getBoundingClientRect().right <= d.right - 8); })()');
  check("the export dialog's date fields fit inside it on a phone", dates.length === 2 && dates.every(Boolean), JSON.stringify(dates));
  const tinyExport = await tinyControls();
  check("nor in the export dialog (dates, status)", tinyExport.length === 0, JSON.stringify(tinyExport));
  await shot("admin-phone-export");
  const csv = await ev(`(async () => { const r = await fetch("/api/contrib/v1/admin/export/crew.csv", { headers: { Authorization: "Bearer " + sessionStorage.getItem("klc.admin.token") } }); const b = new Uint8Array(await r.arrayBuffer()); return { bom: [...b.slice(0, 3)], head: new TextDecoder().decode(b.slice(3, 40)), type: r.headers.get("content-type"), disp: r.headers.get("content-disposition") }; })()`);
  check("the crew CSV starts with the UTF-8 BOM and the right header", csv.bom.join() === "239,187,191" && csv.head.startsWith("crew_no,nickname,points,accepted"), JSON.stringify(csv));
  await ev('document.querySelector("dialog[open]").dispatchEvent(new Event("cancel"))');
  await wait('!document.querySelector("dialog[open]")');

  // ---------------------------------------------------------------- laptop
  await metrics(1440, 900, 1, false);
  await p.goto(`${server.url}/admin`);
  await wait('document.querySelectorAll(".row").length > 0');
  await wait('document.querySelector(".detail-pane .shot-img") !== null');
  await imagesReady(".detail-pane .shot-img", 1);
  const layout = await ev('(() => { const l = document.querySelector(".list-pane").getBoundingClientRect(), d = document.querySelector(".detail-pane").getBoundingClientRect(); return { listRight: l.right, detailLeft: d.left, detailW: d.width, listW: l.width }; })()');
  check("on a laptop the list and the detail sit side by side", layout.detailLeft >= layout.listRight - 1 && layout.detailW > 500, JSON.stringify(layout));
  check("the first submission is opened automatically", (await ev('document.querySelectorAll(".row[aria-current=true]").length')) === 1);
  check("the laptop layout has no horizontal scroll", (await overflow()) <= 0);
  const deskBar = await ev('(() => { const i = document.querySelector(".actions input[type=number]").getBoundingClientRect(); return i.width; })()');
  check("the points field is readable on a laptop too", deskBar >= 56, `${Math.round(deskBar)} px`);
  const tabsFit = await ev('(() => { const pane = document.querySelector(".list-pane").getBoundingClientRect(); return [...document.querySelectorAll(".tabs .tab")].map((t) => { const r = t.getBoundingClientRect(); return { inside: r.left >= pane.left && r.right <= pane.right, top: Math.round(r.top) }; }); })()');
  check("on a laptop all five status tabs are fully visible, on one line", tabsFit.length === 5 && tabsFit.every((t) => t.inside) && new Set(tabsFit.map((t) => t.top)).size === 1, JSON.stringify(tabsFit));
  await settleThumbs();
  await shot("admin-desktop");

  // keyboard: j moves down, k up
  const first = await ev('document.querySelector(".row[aria-current=true]").dataset.id');
  await key("j", "KeyJ"); await sleep(400);
  const second = await ev('document.querySelector(".row[aria-current=true]").dataset.id');
  await key("k", "KeyK"); await sleep(400);
  const back = await ev('document.querySelector(".row[aria-current=true]").dataset.id');
  check("j and k move through the queue", second !== first && back === first);

  // a decision key held down must not decide a run of submissions; the "u" shortcut must not type into the version field
  const keyRepeat = (k, code) => p.S("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, text: k, autoRepeat: true });
  await keyRepeat("n", "KeyN"); await sleep(500);
  check("an auto-repeated decision key is ignored (nothing saved, selection unchanged)", (await ev('document.querySelector(".toast")')) === null && (await ev('document.querySelector(".row[aria-current=true]").dataset.id')) === first);
  await key("n", "KeyN");
  await wait('document.querySelector(".toast.ok") !== null');
  await sleep(500);
  check("a single press does decide, and moves on to the next submission", (await ev('document.querySelector(".row[aria-current=true]").dataset.id')) !== first);
  await key("u", "KeyU");
  await wait('document.querySelector("dialog[open] input[type=text]") !== null');
  const typed = await ev('document.querySelector("dialog[open] input[type=text]").value');
  check("the u shortcut opens the version dialog without typing a u into it", !typed.includes("u"), JSON.stringify(typed));
  await ev('document.querySelector("dialog[open]").dispatchEvent(new Event("cancel"))');
  await wait('!document.querySelector("dialog[open]")');
  await sleep(300);

  // filters
  await ev('document.querySelector(".tab[data-status=all]").click()'); await sleep(500);
  const all = await ev('document.querySelectorAll(".row").length');
  await ev('(() => { const s = document.querySelectorAll(".filters select")[0]; s.value = "fix"; s.dispatchEvent(new Event("change")); })()'); await sleep(600);
  const fixRows = await ev('document.querySelectorAll(".row").length');
  check("filtering by kind narrows the list", fixRows > 0 && fixRows < all, `${all} -> ${fixRows}`);
  check("fix rows carry the 修正/Fix badge", await ev('[...document.querySelectorAll(".row .chip.kind-fix")].length === document.querySelectorAll(".row").length'));
  await ev('(() => { const s = document.querySelectorAll(".filters select")[0]; s.value = ""; s.dispatchEvent(new Event("change")); })()'); await sleep(400);
  await fill(".filters input[type=search]", "HYPERLINK"); await sleep(900);
  check("searching finds a note by its text", (await ev('document.querySelectorAll(".row").length')) === 1);
  await fill(".filters input[type=search]", "bold"); await sleep(900);
  const htmlRow = await ev('document.querySelector(".row .row-name")?.textContent');
  check("a nickname with HTML tags is shown literally", htmlRow === "<b>bold</b> & <i>x</i>", htmlRow);
  await fill(".filters input[type=search]", "tries HTML"); await sleep(900);
  await click(".row"); await wait('document.querySelector(".detail-pane .note") !== null'); await sleep(300);
  const noteText = await text(".detail-pane .note");
  check("a note that tries HTML is shown as plain text and injects no element", noteText.includes("<img src=x onerror=alert(1)>") && (await ev('document.querySelectorAll(".detail-pane .note *, .rows img[src=x], .detail-pane img[src=x]").length')) === 0, noteText.slice(0, 60));
  await fill(".filters input[type=search]", ""); await sleep(800);

  // bulk mark used on the accepted tab
  await ev('document.querySelector(".tab[data-status=accepted]").click()'); await sleep(600);
  await ev('document.querySelector(".filters .check input").click()'); await sleep(300);
  await ev('[...document.querySelectorAll(".row .pick input")].slice(0, 2).forEach((c) => c.click())'); await sleep(200);
  check("select mode shows a bulk bar with the count", (await text(".bulkbar strong")).includes("2"), await text(".bulkbar strong"));
  await settleThumbs();
  await shot("admin-desktop-bulk");
  await click(".bulkbar .btn.used");
  await wait('document.querySelector("dialog[open] input[type=text]") !== null');
  await fill("dialog[open] input[type=text]", "not a version!");
  await ev('document.querySelector("dialog[open] .btn.used").click()'); await sleep(200);
  check("a bad version is refused in the dialog", (await text("dialog[open] .err")).length > 0);
  await fill("dialog[open] input[type=text]", "v0.2.0");
  await ev('document.querySelector("dialog[open] .btn.used").click()');
  await wait('document.querySelector(".toast.ok") !== null');
  await sleep(600);
  const usedCounts = await ev('Object.fromEntries([...document.querySelectorAll(".tab .count")].map((c) => [c.dataset.status, c.textContent]))');
  check("two accepted items became used (accepted 2, used 3)", usedCounts.accepted === "2" && usedCounts.used === "3", JSON.stringify(usedCounts));

  // used tab shows the release
  await ev('document.querySelector(".tab[data-status=used]").click()'); await sleep(700);
  check("used items show the release they shipped in", (await ev('[...document.querySelectorAll(".row-meta")].some((m) => m.textContent.includes("v0.2.0"))')));
  await settleThumbs();
  await shot("admin-desktop-used");

  // language and theme
  await ev('[...document.querySelectorAll(".header .btn")].find((b) => b.textContent === "日本語" || b.textContent === "English").click()'); await sleep(400);
  const lang = await ev("document.documentElement.lang");
  check("the language switch flips the whole page", lang === "en" || lang === "ja", lang);
  await p.S("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
  await sleep(400);
  await settleThumbs();
  await shot("admin-desktop-dark");
  await p.S("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });

  // sign out forgets the token
  await ev('[...document.querySelectorAll(".header .btn")].find((b) => /Sign out|ログアウト/.test(b.textContent)).click()');
  await wait('document.querySelector("form.login-card") !== null');
  check("signing out clears the token and returns to the sign-in form", (await ev('sessionStorage.getItem("klc.admin.token")')) === null);

  const errors = p.errors();
  check("no console errors or CSP violations during the whole run", errors.length === 0, errors.map((e) => e.text.slice(0, 160)).join(" | "));
  const csp = p.logs.filter((l) => /Content Security Policy|Refused to/i.test(l.text));
  check("the Content-Security-Policy was never violated", csp.length === 0, csp.map((l) => l.text.slice(0, 120)).join(" | "));
} finally {
  try { await browser?.close(); } catch { /* closed */ }
  await server.stop();
  rmSync(dir, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
if (process.argv.includes("--results")) writeFileSync(join(OUT, "RESULTS.json"), JSON.stringify({ at: new Date().toISOString(), passed: results.length - failed.length, failed: failed.length, results }, null, 1) + "\n");
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
