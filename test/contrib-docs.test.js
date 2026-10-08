// The contributor docs must match the code: routes, error codes, environment variables and defaults, the privacy
// text in both languages, and the links. (docs/contrib/*.md)
import { describe, test, expect } from "bun:test";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { publicRoutes } from "../server/contrib/routes-public.js";
import { adminRoutes } from "../server/contrib/routes-admin.js";
import { loadConfig, PRIVACY_VERSION, VERSION } from "../server/contrib/config.js";
import { makeApp } from "../tools/contrib/testkit.mjs";
import { synthJpeg } from "../tools/contrib/synth.mjs";

const ROOT = resolve(import.meta.dir, "..");
const DOCS = join(ROOT, "docs/contrib");
const SERVER = join(ROOT, "server/contrib");
const doc = (n) => readFileSync(join(DOCS, n), "utf8");
const API = doc("API.md"), DEPLOY = doc("DEPLOY.md"), PRIVACY = doc("PRIVACY.md"), README = doc("README.md");
const sources = readdirSync(SERVER).filter((f) => f.endsWith(".js")).map((f) => [f, readFileSync(join(SERVER, f), "utf8")]);
const BASE = "/api/contrib/v1";

describe("API.md", () => {
  test("starts with the 'Contract changes' section and says the spec's endpoints are unchanged", () => {
    const first = API.split("\n").findIndex((l) => l.startsWith("## "));
    expect(API.split("\n")[first]).toBe("## Contract changes");
    expect(API).toContain("**additive** and backwards compatible");
    for (const addition of ["kind", "usedVersion", "transfer-code", "contributors/claim", "DELETE /me", "Idempotency-Key", "mark-used", "SWEEP.md"]) expect(API.slice(0, API.indexOf("## Conventions"))).toContain(addition);
  });
  test("every public and admin route has a heading with its method and path", () => {
    const headings = API.split("\n").filter((l) => l.startsWith("### "));
    for (const r of [...publicRoutes, ...adminRoutes]) {
      let p = r.path.replace(BASE, "").replace("/admin/files/*key", "/admin/files/<key>");
      if (p.startsWith("/admin")) p = p; // admin routes keep their /admin prefix in the docs
      const hit = headings.find((h) => h.includes(p) && new RegExp(`\\b${r.method}\\b`).test(h));
      expect([`${r.method} ${p}`, Boolean(hit)]).toEqual([`${r.method} ${p}`, true]);
    }
  });
  test("every error code the code can emit is in the error table", () => {
    const codes = new Set(["note_too_long"]);
    const patterns = [/badRequest\("([a-z_]+)"/g, /new HttpError\(\d+, "([a-z_]+)"/g, /tooMany\([^)]*?"([a-z_]+)"/g, /forbidden\("([a-z_]+)"/g, /\bbad\("([a-z_]+)"/g, /unauthorized\(/g];
    for (const [, src] of sources) for (const re of patterns) for (const m of src.matchAll(re)) if (m[1]) codes.add(m[1]);
    for (const c of ["unauthorized", "rate_limited", "internal", "not_found", "method_not_allowed", "origin_not_allowed"]) codes.add(c);
    expect(codes.size).toBeGreaterThan(30);
    const table = API.slice(API.indexOf("## Error codes"), API.indexOf("## Notes for the app"));
    for (const c of codes) expect([c, table.includes("`" + c + "`") || table.includes("`" + c.replace(/_[a-z]+$/, "_<field>") + "`")]).toEqual([c, true]);
  });
  test("the limits it quotes are the ones in the configuration", () => {
    const c = loadConfig({}, { adminToken: "a".repeat(30), tokenSecret: "b".repeat(30) });
    expect(c.limits).toMatchObject({ perMinuteIp: 240, createPerHourIp: 30, claimPerHourIp: 5, submitAttemptsPerHourIp: 60, adminFailPer15MinIp: 10, transferCodesPerHour: 10 });
    for (const text of ["240 requests a minute", "30 new contributors an hour", "5 claim attempts an hour", "60 upload attempts an hour", "20 submissions a day per contributor", "10 wrong admin tokens in 15 minutes", "10 transfer codes an hour"]) expect(API).toContain(text);
    expect(API).toContain(`"version": "${VERSION}"`);
    for (const line of ["5 for an issue and 20 for a fix", "`MAX_SHOT_MB` (8)", "`MAX_PHOTO_MB` (15)", "`MAX_PHOTOS` (6)"]) expect(API).toContain(line);
  });
});

describe("DEPLOY.md", () => {
  const cfgSrc = readFileSync(join(SERVER, "config.js"), "utf8");
  const envNames = [...new Set([...cfgSrc.matchAll(/(?:str|num|pick)\("[A-Za-z0-9]+", "([A-Z][A-Z0-9_]+)"/g)].map((m) => m[1]))];
  test("every environment variable the service reads is documented", () => {
    expect(envNames.length).toBeGreaterThanOrEqual(30);
    for (const n of envNames) expect([n, DEPLOY.includes("`" + n + "`")]).toEqual([n, true]);
    for (const n of ["ADMIN_TOKEN", "TOKEN_SECRET", "PORT", "DB_PATH", "STORAGE", "DISK_DIR", "S3_BUCKET", "S3_REGION", "S3_ENDPOINT", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "ALLOWED_ORIGINS", "MAX_PHOTOS", "MAX_PHOTO_MB", "MAX_SHOT_MB", "DAILY_LIMIT"]) expect(envNames).toContain(n); // the spec's list
  });
  test("the documented defaults are the configured defaults", () => {
    const c = loadConfig({}, { adminToken: "a".repeat(30), tokenSecret: "b".repeat(30) });
    const rows = Object.fromEntries(DEPLOY.split("\n").filter((l) => /^\| `[A-Z_]+`/.test(l)).map((l) => { const cells = l.split("|").map((x) => x.trim()); return [cells[1].replace(/`/g, ""), cells[2]]; }));
    const expected = { PORT: c.port, DB_PATH: c.dbPath, DISK_DIR: c.diskDir, MAX_PHOTOS: c.maxPhotos, MAX_PHOTO_MB: c.maxPhotoBytes / 1048576, MAX_SHOT_MB: c.maxShotBytes / 1048576, DAILY_LIMIT: c.dailyLimit, MAX_CONCURRENT_UPLOADS: c.maxConcurrentUploads, RATE_LIMIT_PER_MIN: c.limits.perMinuteIp, CREATE_LIMIT_PER_HOUR: c.limits.createPerHourIp, CLAIM_LIMIT_PER_HOUR: c.limits.claimPerHourIp, SUBMIT_ATTEMPTS_PER_HOUR: c.limits.submitAttemptsPerHourIp, ADMIN_FAIL_LIMIT: c.limits.adminFailPer15MinIp, TRANSFER_CODES_PER_HOUR: c.limits.transferCodesPerHour };
    for (const [name, value] of Object.entries(expected)) expect([name, rows[name]?.includes(String(value))]).toEqual([name, true]);
    expect(rows.STORAGE).toContain("disk");
    expect(DEPLOY).toContain("`POINTS_ISSUE`, `POINTS_FIX` | `5`, `20`");
    expect(rows.ADMIN_TOKEN).toContain("required");
    expect(rows.TOKEN_SECRET).toContain("required");
  });
  test("it describes the Railway shape the spec asks for and says nothing was deployed", () => {
    expect(DEPLOY).toContain("kesennuma-contrib");
    expect(DEPLOY).toContain("/data");
    expect(DEPLOY).toContain("DB_PATH=/data/contrib.db");
    expect(DEPLOY).toContain("DISK_DIR=/data/files");
    expect(DEPLOY).toContain("Nothing here has been deployed");
    expect(DEPLOY).toContain("STORAGE=s3");
    expect(DEPLOY).toContain("/api/contrib/v1/health");
    expect(DEPLOY).toContain("VACUUM INTO");
    expect(DEPLOY).toContain("TRUST_PROXY");
  });
});

describe("PRIVACY.md", () => {
  const section = (title, next) => PRIVACY.slice(PRIVACY.indexOf(title), next ? PRIVACY.indexOf(next) : undefined);
  const ja = section("## 日本語 (ja)", "## English (en)"), en = section("## English (en)", "## How the service keeps");
  const keys = ["consent.label", "consent.link", "privacy.summary", "privacy.title", "privacy.intro", "privacy.items", "privacy.contact"];
  test("its version is the one the service records with every submission", () => {
    expect(PRIVACY).toContain(`Version: ${PRIVACY_VERSION}`);
    expect(PRIVACY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  test("both languages carry every string the app needs, as ### keys with text beneath", () => {
    for (const part of [ja, en]) {
      const found = [...part.matchAll(/^### (\S+)\n([\s\S]*?)(?=^### |^---|$(?![\s\S]))/gm)].map((m) => [m[1], m[2].trim()]);
      expect(found.map(([k]) => k)).toEqual(keys);
      for (const [k, v] of found) expect([k, v.length > 3]).toEqual([k, true]);
    }
  });
  test("the nine points are there in both languages, in the same order, each with a bold title", () => {
    const items = (part) => [...part.matchAll(/^(\d)\. \*\*(.+?)\*\*/gm)].map((m) => [Number(m[1]), m[2]]);
    expect(items(ja).map(([n]) => n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(items(en).map(([n]) => n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(items(ja).map(([, t]) => t)).toEqual(["集める情報", "使う目的", "公開しません", "顔・ナンバープレート", "利用の許諾", "クルーNo.について", "削除のご依頼", "保管", "お子さま"]);
  });
  test("it covers everything the spec requires (Japanese)", () => {
    for (const phrase of ["ニックネーム", "クルーNo.", "写真", "撮影位置", "スクリーンショット", "3Dモデル", "公開しません", "正確な撮影位置は公開しません", "顔", "ナンバープレート", "非独占的", "削除", "気仙沼地域戦略", "ポイントプレゼント", "IPアドレスも保存しません", "同意"]) expect([phrase, ja.includes(phrase)]).toEqual([phrase, true]);
  });
  test("it covers everything the spec requires (English)", () => {
    for (const phrase of ["nickname", "クルーNo.", "photos", "where and when", "screenshot", "3D model", "never published", "Faces", "number plates", "non-exclusive licence", "Deletion", "気仙沼地域戦略", "point-present", "we do not store your IP address", "agree"]) expect([phrase, en.includes(phrase)]).toEqual([phrase, true]);
  });
  test("the contact placeholder is still there for the team to fill, and no personal contact detail is baked in", () => {
    expect((ja.match(/\{\{CONTACT\}\}/g) ?? []).length).toBe(1);
    expect((en.match(/\{\{CONTACT\}\}/g) ?? []).length).toBe(1);
    expect(PRIVACY).toContain("replace `{{CONTACT}}`");
    expect(PRIVACY).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/); // no e-mail address
    expect(PRIVACY).not.toMatch(/\b0\d{1,4}-\d{1,4}-\d{3,4}\b/); // no phone number
  });
  test("each promise is mapped to what the service does about it", () => {
    const table = PRIVACY.slice(PRIVACY.indexOf("## How the service keeps"));
    for (const promise of ["never public", "internal", "What is collected", "Faces and number plates", "Licence", "Deletion on request", "クルーNo. only for rewards", "Access-controlled"]) expect([promise, table.toLowerCase().includes(promise.toLowerCase())]).toEqual([promise, true]);
    expect(table).toContain("No IP address");
    expect(table).toContain("DELETE /me?confirm=1");
  });
});

describe("README.md and links", () => {
  test("it links the other three documents and the screenshots it shows", () => {
    for (const f of ["API.md", "DEPLOY.md", "PRIVACY.md"]) expect(README).toContain(`(${f})`);
    const images = [...README.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]);
    expect(images.length).toBeGreaterThanOrEqual(4);
    for (const img of images) expect([img, existsSync(join(DOCS, img))]).toEqual([img, true]);
  });
  test("every relative link in the docs resolves", () => {
    for (const name of ["README.md", "API.md", "DEPLOY.md", "PRIVACY.md"]) {
      for (const m of doc(name).matchAll(/\]\((?!https?:|#|mailto:)([^)\s]+)\)/g)) {
        const target = resolve(dirname(join(DOCS, name)), m[1].split("#")[0]);
        expect([name, m[1], existsSync(target)]).toEqual([name, m[1], true]);
      }
    }
  });
  test("the commands it names exist", () => {
    for (const f of ["server/contrib/index.js", "tools/contrib/pull.mjs", "tools/contrib/mark-used.mjs", "tools/contrib/seed.mjs", "tools/contrib/synth.mjs", "tools/contrib/dev-server.mjs", "tools/contrib/admin-shots.mjs", "tools/contrib/smoke.sh", "tools/anime/gate.sh"]) {
      expect([f, existsSync(join(ROOT, f))]).toEqual([f, true]);
      expect([f, README.includes(f)]).toEqual([f, true]);
    }
  });
  test("it does not claim a deployment, a public key or a real person's data", () => {
    for (const text of [README, API, DEPLOY, PRIVACY]) {
      expect(text).not.toMatch(/AKIA[0-9A-Z]{12,}/);
      expect(text).not.toMatch(/claude\.ai\/code\/session|Claude[-]Session/);
      expect(text).not.toMatch(/sk-[A-Za-z0-9]{20,}/);
    }
  });
});

describe("the JSON examples in API.md", () => {
  /** Every key path of a JSON value: ".a", ".a.b", ".list[]", ".list[].id" (arrays are described by their first element). */
  const paths = (v, prefix = "", out = new Set()) => {
    if (Array.isArray(v)) { out.add(prefix + "[]"); if (v.length) paths(v[0], prefix + "[]", out); }
    else if (v && typeof v === "object") for (const [key, x] of Object.entries(v)) { out.add(`${prefix}.${key}`); paths(x, `${prefix}.${key}`, out); }
    return out;
  };
  // the examples are JSON; the detail example is two fragments of an object, so it may need braces around it
  const parse = (text) => { try { return JSON.parse(text); } catch { return JSON.parse("{" + text.trim().replace(/,\s*$/, "") + "}"); } };
  const examples = [...API.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => parse(m[1]));

  test("GET /me, an admin list item and the admin detail have exactly the documented keys (EXIF keys are all optional and listed in the prose)", async () => {
    expect(examples.length).toBe(3);
    const k = makeApp();
    const me = await k.newContributor({ nickname: "Sakura", crewNo: "1234-5678-9012-34" });
    const photo = await synthJpeg({ width: 640, height: 480, lat: 38.9065, lon: 141.5752, alt: 4.2, heading: 120, takenAt: "2026:10:04 14:23:05", offset: "+09:00", focal35: 26, orientation: 1, make: "Apple", model: "iPhone 15" });
    const sub = await k.submit(me, { photos: [photo], category: "sign" });
    expect(sub.status).toBe(201);
    await k.review(sub.body.id, { status: "accepted", points: 25 });
    await k.call("POST", "/admin/submissions/mark-used", { admin: true, json: { ids: [sub.body.id], version: "v0.5.0" } });
    const real = [
      (await k.call("GET", "/me", { token: me.token })).body,
      (await k.call("GET", "/admin/submissions", { admin: true })).body.items[0],
    ];
    const detail = (await k.call("GET", `/admin/submissions/${sub.body.id}`, { admin: true })).body;
    real.push({ photos: detail.photos, contributor: detail.contributor });

    const exifProse = (API.match(/`exif` holds only what the photo had[^\n]*/) ?? [""])[0];
    expect(exifProse).not.toBe("");
    ["GET /me", "admin list item", "admin detail"].forEach((name, i) => {
      const documented = paths(examples[i]), actual = paths(real[i]);
      const absent = [...documented].filter((p) => !actual.has(p) && !p.startsWith(".photos[].exif"));
      const undocumented = [...actual].filter((p) => !documented.has(p) && !p.startsWith(".photos[].exif"));
      expect({ name, absent, undocumented }).toEqual({ name, absent: [], undocumented: [] });
    });
    // EXIF: whatever the server returns must be named in the prose list, and what the example shows must be real
    const actualExif = [...paths(real[2])].filter((p) => p.startsWith(".photos[].exif"));
    for (const p of actualExif) {
      const leaf = p.split(".").pop();
      expect({ path: p, named: exifProse.includes("`" + leaf + "`") }).toEqual({ path: p, named: true });
    }
    for (const p of [...paths(examples[2])].filter((x) => x.startsWith(".photos[].exif"))) expect({ path: p, real: actualExif.includes(p) }).toEqual({ path: p, real: true });
  });
});
