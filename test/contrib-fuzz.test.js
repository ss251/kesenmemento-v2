// Contributor backend: a seeded fuzz of every endpoint. Random methods, paths, tokens, headers, query strings, JSON,
// multipart bodies and raw bytes are thrown at the in-process app. Whatever arrives, the service must answer with a
// proper status (never a crash: no 5xx except the deliberate 503), every error must carry an `error` code, and nothing
// secret may reach the log. Deterministic: the same seed sends the same requests, so a failure can be replayed.
import { describe, test as bunTest, expect } from "bun:test";
// a loaded machine (the gate runs tests at background priority) is many times slower than an idle one: generous per-test timeout
const test = (name, fn) => bunTest(name, fn, 120_000);
import { makeApp, ADMIN_TOKEN, TOKEN_SECRET } from "../tools/contrib/testkit.mjs";
import { synthJpeg } from "../tools/contrib/synth.mjs";

/** mulberry32: a small seeded generator. */
function rng(seed) {
  let s = seed >>> 0;
  const next = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const int = (n) => Math.floor(next() * n);
  return { next, int, pick: (a) => a[int(a.length)] };
}

const NASTY = ["", " ", "0", "-1", "1e999", "NaN", "null", "true", "[]", "{}", "__proto__", "constructor", "../../etc/passwd", "%00", "‮", "😀".repeat(50), "a".repeat(5000), "A".repeat(100000),
  "<script>alert(1)</script>", "' OR 1=1 --", "=cmd|' /C calc'!A0", "\r\n", "9".repeat(400), "2026-13-45", "2026-10-05T25:61:61Z", "-0", "0x10", "ｱｲｳ"];
// hostile JSON texts that JSON.stringify would never produce (own "__proto__" keys, deep nesting, duplicate keys, trailing garbage)
const EVIL_JSON = ['{"__proto__":{"admin":true},"nickname":"x"}', '{"constructor":{"prototype":{"banned":true}}}', '{"nickname":"a","nickname":"b"}', "[".repeat(2000) + "]".repeat(2000),
  '{"a":' + "[".repeat(5000) + "]".repeat(5000) + "}", '{"ids":' + JSON.stringify(Array.from({ length: 600 }, (_, i) => "x" + i)) + ',"version":"v1"}', '{"status":"accepted","points":1e999}',
  '{"status":"accepted","points":-5}', '{"status":"used","version":"' + "v".repeat(500) + '"}', '{"nickname":"' + "\\u202e".repeat(30) + '"}', '{"nickname":"\\ud800"}',
  '{"crewNo":"１２３４５６７８９０１２３４"}', '{"code":"' + "A".repeat(10000) + '"}', "﻿{}", "{", "}", "null", "1", '"x"', '{"a":1}garbage'];

const ROUTES = [
  ["GET", "/health"], ["POST", "/contributors"], ["POST", "/contributors/claim"], ["GET", "/me"], ["PATCH", "/me"], ["DELETE", "/me"], ["GET", "/me/transfer-code"], ["POST", "/me/transfer-code"], ["POST", "/me/sign-out-others"],
  ["POST", "/submissions"], ["GET", "/leaderboard"], ["GET", "/admin/submissions"], ["GET", "/admin/submissions/ID"], ["POST", "/admin/submissions/ID"], ["POST", "/admin/submissions/mark-used"],
  ["DELETE", "/admin/submissions/ID"], ["POST", "/admin/contributors/CID"], ["DELETE", "/admin/contributors/CID"], ["GET", "/admin/files/KEY"], ["GET", "/admin/export/crew.csv"],
  ["GET", "/admin/export/submissions.json"], ["GET", "/admin/stats"], ["GET", "/admin/audit"], ["GET", "/admin"], ["GET", "/admin/app.js"], ["GET", "/"], ["OPTIONS", "/submissions"], ["HEAD", "/health"], ["TRACE", "/me"],
];
const QUERY_KEYS = ["status", "kind", "category", "q", "contributor", "sort", "limit", "offset", "from", "to", "excel", "confirm", "lang"];

async function fuzz(seed, iterations) {
  const { next, int, pick } = rng(seed);
  const str = () => next() < 0.5 ? pick(NASTY) : Array.from({ length: int(60) }, () => String.fromCodePoint(int(0x3000) + 32)).join("");
  const headerStr = () => str().replace(/[^\x20-\x7e]/g, "?").slice(0, 100); // header values are bytes
  const enc = (x) => encodeURIComponent(String(x).replace(/[\ud800-\udfff]/g, "?"));
  const text = (v) => { try { return String(v); } catch { return "[odd]"; } };
  const value = (depth = 0) => {
    const r = next();
    if (r < 0.2) return str();
    if (r < 0.35) return int(2000) - 1000;
    if (r < 0.45) return pick([1e308, -1e308, 5e-324, 2 ** 53, 0.1]);
    if (r < 0.5) return null;
    if (r < 0.55) return next() < 0.5;
    if (depth > 3) return str();
    if (r < 0.75) return Array.from({ length: int(5) }, () => value(depth + 1));
    const o = {};
    for (let i = 0, n = int(6); i < n; i++) o[next() < 0.5 ? pick(["nickname", "crewNo", "status", "points", "note", "version", "ids", "code", "kind", "category", "banned", "resetNickname", "enu", "latlon", "heading"]) : str().slice(0, 20)] = value(depth + 1);
    return o;
  };

  const k = makeApp({ config: { rateLimitPerMinute: 100000, createPerHour: 10000, claimPerHour: 1000, submitAttemptsPerHour: 10000, dailyLimit: 1000, ipDailyLimit: 100000, dailyMb: 100000, ipDailyMb: 100000, minFreeMb: 0, adminFailLimit: 1000, maxPhotos: 3 } });
  const jpeg = await synthJpeg({ width: 320, height: 240, lat: 38.9065, lon: 141.5752 });
  const people = [await k.newContributor({ nickname: "Fuzz One", crewNo: "1234-5678-9012-34" }), await k.newContributor({ nickname: "Fuzz Two" })];
  const subs = [];
  for (const p of people) { const r = await k.submit(p, { photos: [jpeg] }); if (r.status === 201) subs.push(r.body.id); }
  await k.review(subs[0], { status: "accepted", points: 20 });

  const problems = [], statuses = {};
  for (let i = 0; i < iterations; i++) {
    const [method, tmpl] = pick(ROUTES);
    const id = next() < 0.5 ? pick(subs) : str().slice(0, 40);
    const cid = next() < 0.5 ? people[0].id : str().slice(0, 30);
    const key = next() < 0.5 ? `submissions/2026/10/${pick(subs)}/original-0.jpg` : str().slice(0, 80);
    let path = tmpl.replace("/ID", "/" + enc(id)).replace("/CID", "/" + enc(cid)).replace("/KEY", "/" + key.split("/").map(enc).join("/"));
    const q = new URLSearchParams();
    for (let j = 0, n = int(4); j < n; j++) q.set(pick(QUERY_KEYS), text(value(2)).slice(0, 200));
    if ([...q].length) path += "?" + q;

    const o = { headers: {} };
    const who = next(), adminRoute = tmpl.startsWith("/admin");
    if (adminRoute && who < 0.9) o.admin = true;
    else if (!adminRoute && who < 0.88) o.token = pick(people).token;
    else if (who > 0.93) o.headers.authorization = "Bearer " + headerStr();
    if (next() < 0.1) o.origin = pick(["https://evil.example", "http://localhost:8787", "null", headerStr()]);
    if (next() < 0.2) o.headers["idempotency-key"] = headerStr();
    if (next() < 0.1) o.headers["x-admin-name"] = headerStr();

    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
      const b = next();
      if (b < 0.1) { o.raw = pick(EVIL_JSON); o.headers["content-type"] = "application/json"; }
      else if (b < 0.4) o.json = value();
      else if (b < 0.45) { o.raw = str(); o.headers["content-type"] = pick(["application/json", "text/plain", "application/x-www-form-urlencoded", ""]); }
      else if (b < 0.8) {
        const fd = new FormData();
        for (let j = 0, n = int(8); j < n; j++) {
          const name = pick(["pose", "category", "kind", "note", "lang", "consent", "screenshot", "photos", "photos[]", "photo", str().slice(0, 20)]);
          if (["screenshot", "photos", "photos[]", "photo"].includes(name) && next() < 0.8) {
            const bytes = next() < 0.5 ? jpeg : next() < 0.5 ? new Uint8Array(int(300)).map(() => int(256)) : new Uint8Array([0xff, 0xd8, 0xff, ...Array.from({ length: int(200) }, () => int(256))]);
            fd.append(name, new File([bytes], str().slice(0, 30) || "x", { type: pick(["image/jpeg", "text/html", "", "x/y"]) }));
          } else fd.append(name, name === "pose" && next() < 0.7 ? JSON.stringify(value()) : name === "consent" && next() < 0.7 ? "1" : str());
        }
        o.form = fd;
      } else if (b < 0.9) { o.raw = new Uint8Array(int(400)).map(() => int(256)); o.headers["content-type"] = "multipart/form-data; boundary=" + pick(["XYZ", "", "a".repeat(300), "--"]); }
    }

    const where = `#${i} ${method} ${path.slice(0, 100)}`;
    try {
      const r = await k.call(method, path, o);
      statuses[r.status] = (statuses[r.status] ?? 0) + 1;
      if (r.status >= 500 && r.status !== 503) problems.push(`${where} -> ${r.status}`);
      if (r.status >= 400 && (r.headers.get("content-type") ?? "").includes("json") && !(r.body && typeof r.body.error === "string")) problems.push(`${where} -> ${r.status} without an error code`);
    } catch (e) { problems.push(`${where} threw ${String(e?.message ?? e).slice(0, 100)}`); }
  }
  const logged = k.lines.join("\n");
  const crashes = k.lines.filter((l) => l.includes("request.crashed") || l.includes("request.failed"));
  const leaks = [ADMIN_TOKEN, TOKEN_SECRET, people[0].token.split(".")[1], "1234-5678", "12345678901234"].filter((needle) => logged.includes(needle));
  k.close();
  return { problems, statuses, crashes, leaks };
}

// For a longer soak on a quiet machine: CONTRIB_FUZZ_SEEDS=11,12,13,14 CONTRIB_FUZZ_ITER=5000 bun test test/contrib-fuzz.test.js
const SEEDS = (process.env.CONTRIB_FUZZ_SEEDS ?? "1,2,3").split(",").map(Number).filter(Number.isInteger);
const ITERATIONS = Math.max(100, Number(process.env.CONTRIB_FUZZ_ITER) || 1200);

describe("fuzzing every endpoint (seeded, in-process)", () => {
  for (const seed of SEEDS) {
    test(`seed ${seed}: ${ITERATIONS.toLocaleString("en-US")} random requests get proper answers, no crash, and the log stays clean`, async () => {
      const r = await fuzz(seed, ITERATIONS);
      expect(r.problems).toEqual([]);
      expect(r.crashes).toEqual([]);
      expect(r.leaks).toEqual([]);
      expect(Object.keys(r.statuses).length).toBeGreaterThan(5); // it really reached the handlers, not only the 401 wall
      expect((r.statuses[200] ?? 0) + (r.statuses[201] ?? 0)).toBeGreaterThan(100);
    });
  }
});
