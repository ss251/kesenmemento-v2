// Contributor backend: the admin page. Its pure helpers are tested directly; the page files get static safety checks
// (no HTML injection sinks, no external requests, token handling, complete Japanese/English strings). The page is
// also driven in a real browser by tools/contrib/admin-shots.mjs (not part of `bun test`: no subprocesses here).
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  fmtJst, fmtJstDate, fmtTaken, relTime, todayJst, lastDaysRangeJst, weekRangeJst, monthRangeJst, latLonToEnu, fmtLatLon, gsiUrl, camQuery, appCamUrl,
  photoPoseDistance, excerpt, fmtBytes, buildQuery, defaultPointsFor, nextSelection, poseRows, exifRows, I18N, t, VERSION_RE, STATUSES, KINDS, CATEGORIES,
} from "../server/contrib/admin/lib.js";
import { latLonToEnu as serverEnu } from "../server/contrib/geo.js";
import { parseVersion } from "../server/contrib/validate.js";

const DIR = join(import.meta.dir, "../server/contrib/admin");
const read = (f) => readFileSync(join(DIR, f), "utf8");
const JS = read("app.js"), LIB = read("lib.js"), HTML = read("index.html"), CSS = read("app.css");

describe("times are Japan Standard Time, whatever the machine's zone", () => {
  test("fmtJst adds nine hours and crosses the date line", () => {
    expect(fmtJst("2026-10-05T01:30:00.000Z")).toBe("2026-10-05 10:30");
    expect(fmtJst("2026-10-04T15:00:00.000Z")).toBe("2026-10-05 00:00");
    expect(fmtJst("2026-10-04T14:59:59.999Z")).toBe("2026-10-04 23:59");
    expect(fmtJst("2026-12-31T20:00:00Z")).toBe("2027-01-01 05:00");
    expect(fmtJst(Date.UTC(2026, 0, 1, 0, 0))).toBe("2026-01-01 09:00");
    expect(fmtJst("not a date")).toBe("");
    expect(fmtJst(null)).toBe("");
    expect(fmtJstDate("2026-10-04T16:00:00Z")).toBe("2026-10-05");
  });
  test("an EXIF capture time is shown as written", () => {
    expect(fmtTaken("2026-10-04T14:23:05+09:00")).toBe("2026-10-04 14:23 (+09:00)");
    expect(fmtTaken("2026-10-04T14:23:05")).toBe("2026-10-04 14:23");
    expect(fmtTaken("2026-10-04T14:23:05Z")).toBe("2026-10-04 14:23 (Z)");
    expect(fmtTaken(null)).toBe("");
    expect(fmtTaken("garbage")).toBe("garbage");
  });
  test("relative times in both languages, then dates after a week", () => {
    const now = Date.parse("2026-10-05T12:00:00Z");
    const ago = (s) => new Date(now - s * 1000).toISOString();
    expect(relTime(ago(10), now, "en")).toBe("just now");
    expect(relTime(ago(10), now, "ja")).toBe("たった今");
    expect(relTime(ago(5 * 60), now, "en")).toBe("5 min ago");
    expect(relTime(ago(5 * 60), now, "ja")).toBe("5分前");
    expect(relTime(ago(3 * 3600), now, "en")).toBe("3 h ago");
    expect(relTime(ago(3 * 3600), now, "ja")).toBe("3時間前");
    expect(relTime(ago(2 * 86400), now, "en")).toBe("2 d ago");
    expect(relTime(ago(2 * 86400), now, "ja")).toBe("2日前");
    expect(relTime(ago(9 * 86400), now, "en")).toBe("2026-09-26");
    expect(relTime(new Date(now + 60000).toISOString(), now, "en")).toBe("soon");
    expect(relTime("nope", now, "en")).toBe("");
  });
  test("export ranges are JST calendar days: this week is Monday to Sunday, this month is the whole month", () => {
    const monday = Date.parse("2026-10-05T03:00:00Z"); // Monday 12:00 JST
    expect(todayJst(monday)).toBe("2026-10-05");
    expect(weekRangeJst(monday)).toEqual({ from: "2026-10-05", to: "2026-10-11" });
    const sunday = Date.parse("2026-10-11T14:00:00Z"); // Sunday 23:00 JST
    expect(weekRangeJst(sunday)).toEqual({ from: "2026-10-05", to: "2026-10-11" });
    const sundayNightUtc = Date.parse("2026-10-11T16:00:00Z"); // already Monday 01:00 JST
    expect(weekRangeJst(sundayNightUtc)).toEqual({ from: "2026-10-12", to: "2026-10-18" });
    expect(monthRangeJst(monday)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(monthRangeJst(Date.parse("2026-02-10T00:00:00Z"))).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthRangeJst(Date.parse("2028-02-10T00:00:00Z")).to).toBe("2028-02-29");
    expect(lastDaysRangeJst(monday, 7)).toEqual({ from: "2026-09-29", to: "2026-10-05" });
    expect(lastDaysRangeJst(monday, 1)).toEqual({ from: "2026-10-05", to: "2026-10-05" });
  });
});

describe("places and links", () => {
  test("the GSI link is maps.gsi.go.jp/#18/<lat>/<lon>/", () => {
    expect(gsiUrl(38.9065, 141.5752)).toBe("https://maps.gsi.go.jp/#18/38.906500/141.575200/");
    expect(fmtLatLon(38.9065, 141.5752)).toBe("38.906500, 141.575200");
    expect(fmtLatLon(NaN, 1)).toBe("");
  });
  test("the app link restores the exact view: <app URL>?cam=x,y,z,heading,pitch,fov", () => {
    const pose = { enu: [12.3456, 1.6, -34.5], heading: 120.25, pitch: -3, fov: 60 };
    expect(camQuery(pose)).toBe("12.346,1.6,-34.5,120.25,-3,60");
    expect(appCamUrl("https://app.example/", pose)).toBe("https://app.example/?cam=12.346,1.6,-34.5,120.25,-3,60");
    expect(appCamUrl("https://app.example/?look=photo", pose)).toBe("https://app.example/?look=photo&cam=12.346,1.6,-34.5,120.25,-3,60");
    expect(appCamUrl("https://app.example/#top", pose)).toBe("https://app.example/?cam=12.346,1.6,-34.5,120.25,-3,60");
    expect(camQuery({ enu: [1, 2, 3] })).toBe("1,2,3,0,0,60"); // missing angles default to 0, 0, 60
  });
  test("no position, no link; a non-http app URL never produces one", () => {
    expect(camQuery(null)).toBeNull();
    expect(camQuery({ enu: [1, 2] })).toBeNull();
    expect(camQuery({ enu: [1, "x", 3] })).toBeNull();
    expect(appCamUrl("javascript:alert(1)", { enu: [1, 2, 3] })).toBeNull();
    expect(appCamUrl("", { enu: [1, 2, 3] })).toBeNull();
    expect(appCamUrl("https://app.example/", null)).toBeNull();
  });
  test("the distance between where a photo was taken and where the camera was uses the app's ENU frame", () => {
    const pose = { enu: [10, 1.6, -20] };
    expect(photoPoseDistance({ enu: { x: 13, z: -16 } }, pose)).toBe(5);
    expect(photoPoseDistance({ enu: null }, pose)).toBeNull();
    expect(photoPoseDistance({ enu: { x: 1, z: 1 } }, null)).toBeNull();
    const e = latLonToEnu(38.9065, 141.5752);
    const s = serverEnu(38.9065, 141.5752);
    expect(e.x).toBeCloseTo(s.x, 9);
    expect(e.z).toBeCloseTo(s.z, 9); // the page and the server agree on the frame
  });
});

describe("formatting helpers", () => {
  test("excerpt collapses whitespace and cuts with an ellipsis", () => {
    expect(excerpt("  a\n\n b\t c ")).toBe("a b c");
    expect(excerpt("x".repeat(200), 50)).toHaveLength(50);
    expect(excerpt("x".repeat(200), 50).endsWith("…")).toBe(true);
    expect(excerpt(null)).toBe("");
  });
  test("file sizes", () => {
    expect(fmtBytes(512)).toBe("512 B");
    expect(fmtBytes(2048)).toBe("2 KB");
    expect(fmtBytes(5.5 * 1024 * 1024)).toBe("5.5 MB");
    expect(fmtBytes(undefined)).toBe("");
  });
  test("query strings skip empty values and encode the rest", () => {
    expect(buildQuery({ status: "new", q: "", kind: null, limit: 25, offset: 0, x: undefined })).toBe("?status=new&limit=25&offset=0");
    expect(buildQuery({ q: "a b&c" })).toBe("?q=a+b%26c");
    expect(buildQuery({})).toBe("");
  });
  test("default points: 5 for an issue and 20 for a fix, from the server's configuration when it sends one", () => {
    expect(defaultPointsFor("issue", {})).toBe(5);
    expect(defaultPointsFor("fix", {})).toBe(20);
    expect(defaultPointsFor("fix", { issue: 3, fix: 40 })).toBe(40);
    expect(defaultPointsFor("issue", undefined)).toBe(5);
  });
  test("after a row leaves the list the next one takes its place, else the last", () => {
    expect(nextSelection(0, 5)).toBe(0);
    expect(nextSelection(2, 5)).toBe(2);
    expect(nextSelection(4, 4)).toBe(3);
    expect(nextSelection(0, 0)).toBe(-1);
  });
  test("pose and EXIF rows list only what is present", () => {
    const pose = { enu: [1.04, 2, -3.06], latlon: [38.9, 141.5], heading: 90.04, pitch: -3, fov: 60, mode: "walk", at: "2026-10-04T05:23:05.000Z", season: "autumn", viewport: { w: 390 } };
    const keys = poseRows(pose).map(([k]) => k);
    expect(keys).toEqual(["pose.enu", "pose.latlon", "pose.heading", "pose.pitch", "pose.fov", "pose.mode", "pose.season", "pose.at", "pose.viewport"]);
    expect(poseRows(pose)[0][1]).toBe("x 1  y 2  z -3.1");
    expect(poseRows(pose).find(([k]) => k === "pose.at")[1]).toBe("2026-10-04 14:23 JST");
    expect(poseRows(null)).toEqual([]);
    const photo = { takenAt: "2026-10-04T14:23:05+09:00", lat: 38.9, lon: 141.5, heading: 120.5, enu: { x: 1, z: 2 }, width: 4032, height: 3024, bytes: 3_500_000, exif: { make: "Acme", model: "Cam", focalLength35mm: 26, gps: { altM: 4.2, accuracyM: 5, headingRef: "M" } } };
    const rows = Object.fromEntries(exifRows(photo));
    expect(rows["exif.camera"]).toBe("Acme Cam");
    expect(rows["exif.focal35"]).toBe("26 mm");
    expect(rows["exif.heading"]).toBe("120.5° (magnetic)");
    expect(rows["exif.size"]).toBe("4032 × 3024 · 3.3 MB");
    expect(rows["exif.accuracy"]).toBe("±5 m");
    expect(exifRows({ exif: {} })).toEqual([]);
  });
  test("the version check on the page matches the server's rule", () => {
    for (const v of ["v0.5.0", "2026-10-12", "df15fdd", "release/2026.10", "a", "v1.2.3+build.5"]) { expect([v, VERSION_RE.test(v)]).toEqual([v, true]); expect(parseVersion(v).ok).toBe(true); }
    for (const v of ["", "-x", "v 1", "a".repeat(65), "x;rm", "é"]) { expect([v, VERSION_RE.test(v)]).toEqual([v, false]); if (v) expect(parseVersion(v).ok).toBe(false); }
  });
});

describe("Japanese and English strings", () => {
  const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  test("both languages define exactly the same keys, none empty, with the same placeholders", () => {
    const ja = Object.keys(I18N.ja).sort(), en = Object.keys(I18N.en).sort();
    expect(ja).toEqual(en);
    for (const k of ja) {
      expect([k, I18N.ja[k].length > 0]).toEqual([k, true]);
      expect([k, I18N.en[k].length > 0]).toEqual([k, true]);
      expect([k, placeholders(I18N.ja[k])]).toEqual([k, placeholders(I18N.en[k])]);
    }
  });
  test("t() fills placeholders and falls back to English and then the key", () => {
    expect(t("en", "list.range", { from: 1, to: 25, total: 143 })).toBe("1–25 of 143");
    expect(t("ja", "list.range", { from: 1, to: 25, total: 143 })).toBe("1–25 / 143件");
    expect(t("ja", "used.bulk", { n: 3 })).toBe("3件を反映済みにします。");
    expect(t("en", "no.such.key")).toBe("no.such.key");
    expect(t("fr", "status.new")).toBe("New");
    expect(t("en", "review.acceptpts")).toBe("Accept +{n}"); // an unfilled placeholder is left visible
  });
  test("every status, kind and category has a label in both languages", () => {
    for (const lang of ["ja", "en"]) {
      for (const s of STATUSES) expect(I18N[lang][`status.${s}`]).toBeTruthy();
      for (const k of KINDS) expect(I18N[lang][`kind.${k}`]).toBeTruthy();
      for (const c of CATEGORIES) expect(I18N[lang][`cat.${c}`]).toBeTruthy();
    }
    expect(I18N.ja["status.used"]).toBe("反映済み");
  });
  test("every string key the page asks for exists", () => {
    const used = new Set();
    for (const m of JS.matchAll(/\bt\("([\w.]+)"/g)) used.add(m[1]);
    for (const m of JS.matchAll(/\bt\(`([\w.]+)\.\$\{/g)) used.add(m[1] + ".*");
    expect(used.size).toBeGreaterThan(60);
    for (const key of used) {
      if (key.endsWith(".*")) {
        const prefix = key.slice(0, -2);
        expect([key, Object.keys(I18N.en).filter((k) => k.startsWith(prefix + ".")).length > 0]).toEqual([key, true]);
      } else expect([key, key in I18N.en && key in I18N.ja]).toEqual([key, true]);
    }
    // keys produced by the helpers (pose and EXIF rows) and the labelled lists
    for (const row of [...poseRows({ enu: [1, 2, 3], latlon: [1, 2], heading: 1, pitch: 1, fov: 1, mode: "m", timePreset: "x", season: "s", appVersion: "a", layoutVersion: "l", at: "2026-10-04T00:00:00Z", viewport: 1 }),
      ...exifRows({ takenAt: "2026-10-04T00:00:00Z", lat: 1, lon: 2, heading: 3, enu: { x: 1, z: 2 }, width: 1, height: 2, bytes: 3, exif: { make: "a", lens: "l", focalLength35mm: 1, gps: { altM: 1, accuracyM: 1 } } })]) expect([row[0], row[0] in I18N.en]).toEqual([row[0], true]);
  });
});

describe("the page cannot be turned against its user", () => {
  test("scripts parse as ES modules", () => {
    const tr = new Bun.Transpiler({ loader: "js" });
    expect(() => tr.transformSync(JS)).not.toThrow();
    expect(() => tr.transformSync(LIB)).not.toThrow();
  });
  test("no HTML injection sinks and no dynamic code: contributor text only ever goes through textContent", () => {
    for (const sink of ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval(", "new Function", "setTimeout(\"", "setInterval(\"", "srcdoc", "javascript:"]) {
      expect([sink, JS.includes(sink) || LIB.includes(sink)]).toEqual([sink, false]);
    }
    expect(JS).not.toMatch(/setAttribute\(\s*["']style["']/); // inline styles would be refused by the CSP anyway
    expect(JS).not.toMatch(/\bon(?:click|load|error)\s*=\s*["']/); // no inline attribute handlers
  });
  test("it talks only to its own origin: no absolute URLs in the scripts, styles or page", () => {
    for (const [name, src] of [["app.js", JS], ["lib.js", LIB.replace(/https:\/\/maps\.gsi\.go\.jp\//g, "")], ["app.css", CSS], ["index.html", HTML]]) {
      expect([name, /https?:\/\//.test(src)]).toEqual([name, false]);
    }
    expect(JS).not.toMatch(/@import|url\(\s*["']?https?:/);
    expect(CSS).not.toMatch(/@import|url\(\s*["']?(?:https?:|\/\/)/);
    expect(read("icon.svg")).not.toContain("<script");
  });
  test("the admin token lives in sessionStorage only and is sent in the Authorization header, never in a URL or localStorage", () => {
    expect(JS).toContain("sessionStorage");
    const tokenKey = /["']klc\.admin\.token["']/g;
    const uses = [...JS.matchAll(/(\w+)\(\s*["']klc\.admin\.token["']/g)].map((m) => m[1]);
    expect(uses.length).toBeGreaterThan(0);
    for (const fn of uses) expect(["sget", "sset", "sdel"]).toContain(fn); // never the persistent store.get/store.set
    expect(JS.match(tokenKey)?.length).toBeGreaterThan(0);
    expect(JS).toContain('Authorization: "Bearer " + state.token');
    expect(JS).not.toMatch(/[?&]token=|access_token|\btoken=/);
    expect(JS).not.toMatch(/localStorage\.setItem\([^)]*token/i);
    expect(JS).not.toMatch(/location\.(?:search|hash)\s*=\s*[^;]*token/i);
  });
  test("the page file has a data block and one module script, no inline script code, no inline handlers", () => {
    expect(HTML).toContain('<script id="cfg" type="application/json">__CONFIG__</script>');
    expect(HTML).toContain('<script type="module" src="/admin/app.js"></script>');
    const scripts = [...HTML.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
    for (const [, attrs, body] of scripts) if (!/type="application\/json"/.test(attrs)) expect(body.trim()).toBe("");
    expect(HTML).not.toMatch(/\son\w+=/i);
    expect(HTML).not.toMatch(/<style\b/i);
    expect(HTML).not.toMatch(/\sstyle=/i);
  });
  test("it is built for phones: viewport with safe areas, no indexing, light and dark, touch-size targets, reduced motion", () => {
    expect(HTML).toContain('name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover');
    expect(HTML).not.toMatch(/user-scalable|maximum-scale/); // never disable zoom: fix the cause (16px controls) instead
    expect(HTML).toMatch(/<meta name="theme-color" media="\(prefers-color-scheme: light\)" content="#[0-9a-f]{6}">/);
    expect(HTML).toMatch(/<meta name="theme-color" media="\(prefers-color-scheme: dark\)" content="#[0-9a-f]{6}">/);
    expect(HTML).toContain('name="robots" content="noindex, nofollow"');
    expect(HTML).toContain('lang="ja"');
    expect(CSS).toContain("env(safe-area-inset-bottom)");
    expect(CSS).toContain("prefers-color-scheme: dark");
    expect(CSS).toContain("prefers-reduced-motion");
    expect(CSS).toContain("(pointer: coarse)");
    expect(CSS).toMatch(/@media \(min-width: 900px\)/);
    expect(CSS).toMatch(/min-height: 4[46]px/);
  });
  test("it feels native on a phone: hover only where a pointer can hover, no tap flash, instant taps with their own pressed state, controls at 16px, no pull-to-refresh", () => {
    // every :hover rule lives inside @media (hover: hover) and (pointer: fine): touch would leave it stuck after a tap
    let rest = CSS.replace(/\/\*[\s\S]*?\*\//g, ""); // comments may talk about :hover
    for (;;) {
      const at = rest.indexOf("@media (hover: hover) and (pointer: fine)");
      if (at < 0) break;
      let depth = 0, end = at;
      for (let i = rest.indexOf("{", at); i < rest.length; i++) { if (rest[i] === "{") depth++; if (rest[i] === "}" && --depth === 0) { end = i + 1; break; } }
      rest = rest.slice(0, at) + rest.slice(end);
    }
    expect(CSS.includes(":hover")).toBe(true);
    expect(rest.includes(":hover")).toBe(false); // (a boolean: a failure must not print the whole stylesheet)
    expect(CSS).toMatch(/html \{[^}]*-webkit-tap-highlight-color: transparent/);
    expect(CSS).toMatch(/html \{[^}]*overscroll-behavior-y: contain/);
    expect(CSS).toMatch(/touch-action: manipulation/);
    for (const pressed of [".btn:active", ".tab:active", ".row:active"]) expect(CSS).toContain(pressed); // the tap flash is off, so each tappable thing has its own
    // the viewport units: an app shell uses dvh; a 100vh is only ever the fallback written just before its 100dvh
    for (const m of CSS.matchAll(/(\d+)vh\b/g)) expect(CSS.slice(m.index, m.index + 60)).toMatch(new RegExp(`${m[1]}vh;\\s*(?:min-|max-)?height: ${m[1]}dvh`));
    // iOS Safari zooms the page when a control under 16px takes focus: touch devices keep 16px, filters included
    expect(CSS).toMatch(/@media \(pointer: coarse\) \{ input\[type="text"\][^}]*font-size: 16px/);
    expect(CSS).toMatch(/@media \(pointer: coarse\) \{ \.filters select \{ font-size: 16px; \} \}/);
    // a long press on a control selects nothing and shows no callout
    expect(CSS).toMatch(/button, \.tab, \.chip \{ -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; \}/);
    // the sheet does not hand its scrolling to the page behind it
    expect(CSS).toMatch(/\.detail-pane \{[^}]*overscroll-behavior: contain/);
    // the keyboard hints of the text fields
    expect(JS).toContain('enterkeyhint: "search"');
    expect(JS).toContain('autocapitalize: "none"');
  });
  test("the strict policy works for this page: styles are never set through style attributes in markup, scripts are modules from /admin", () => {
    expect(JS).not.toMatch(/\.style\.cssText|setAttribute\("style"/);
    expect(JS).toMatch(/from "\.\/lib\.js"/);
  });
});
