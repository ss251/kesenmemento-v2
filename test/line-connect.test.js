// tools/line/connect.mjs: issue #5's path B as one command. A fake world stands in for LINE (api.line.me), the Railway CLI,
// the deployed service and the person at the phone, so every branch runs offline: the happy path, the LINE check alone,
// every refusal a person can act on, an unpointed custom domain, an older build without /admin/status, and the rule that
// the channel secret and ADMIN_TOKEN never reach argv, the screen, a file or the handoff.
import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkChannel, connect, ConnectError, handoffText, parseArgs, parseCsv, parseRailwayVars, qrTerminal, stageBot, validBasicId,
} from "../tools/line/connect.mjs";

const SECRET = "s3cr3t-fake";   // made up; short, so the public scan's secret rule (12+ characters) never takes it for a real one
const ADMIN = "admin-token-for-the-service-xx";
const CHANNEL = "1657000001";
const RAILWAY = "https://kesenmemento-line-production.up.railway.app";
const CUSTOM = "https://line.kesenmemento.com";
const CSV_HEAD = "code,kind,status,created_at,updated_at,device,mode,fix_what,place_name,lat,lon,lang,photo_consent,photo_count,text,notes,user_ref,view_id";

/** LINE, Railway, the service and the phone, all in memory. `over` changes one part of it. */
function world(over = {}) {
  const w = {
    lineToken: 200,                      // POST /oauth2/v3/token status
    lineInfo: 200,                       // GET /v2/bot/info status
    info: { basicId: "@123abcde", displayName: "ケセンメメント" },
    webhookActive: true,
    vars: { ADMIN_TOKEN: ADMIN, PUBLIC_BASE_URL: RAILWAY, RAILWAY_PUBLIC_DOMAIN: "kesenmemento-line-production.up.railway.app", LINE_CHANNEL_ACCESS_TOKEN: "old-token", LINE_CHANNEL_SECRET: "old-secret" },
    reachable: new Set([RAILWAY]),
    railwayOk: true,
    hasStatus: true,                     // this build answers GET /admin/status
    liveAfter: 2,                        // /admin/status polls before the new channel is live
    staleSetups: 0,                      // setups that fail with 403 first (an older build still on the old token)
    setup: { basicId: "@123abcde", richMenuId: "richmenu-new", webhook: `${RAILWAY}/webhook`, webhookActive: true, tokenSource: "minted", todo: [] },
    csv: [[], [], [
      { code: "KM-0007", kind: "bug", view_id: "", photo_count: "0" },
      { code: "KM-0008", kind: "photo", view_id: "V07", photo_count: "1" },
    ]],
    answers: { "Go ahead?": "y", "greeting": "" },
    lineJson: JSON.stringify({ basicId: "" }, null, 2) + "\n",
    ...over,
  };
  const log = { said: [], railway: [], fetches: [], written: {}, statusPolls: 0, setupCalls: 0, csvPolls: 0, staged: 0, cleaned: 0 };
  const json = (status, body) => Response.json(body, { status });
  const fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    log.fetches.push({ url: String(url), init });
    const origin = u.origin;
    if (origin === "https://api.line.me") {
      if (u.pathname === "/oauth2/v3/token") return w.lineToken === 200 ? json(200, { access_token: "tok-minted", expires_in: 900 }) : new Response(null, { status: w.lineToken });
      if (u.pathname === "/v2/bot/info") return w.lineInfo === 200 ? json(200, w.info) : new Response(null, { status: w.lineInfo });
      if (u.pathname === "/v2/bot/channel/webhook/endpoint") return json(200, { endpoint: "", active: w.webhookActive });
      if (u.pathname === "/v2/bot/message/quota") return json(200, { type: "limited", value: 200 });
      return new Response(null, { status: 404 });
    }
    if (!w.reachable.has(origin)) throw new TypeError("fetch failed");
    if (u.pathname === "/healthz") return json(200, { ok: true, service: "kesenmemento-line", version: "1.0.0" });
    const authed = init.headers?.authorization === `Basic ${Buffer.from(`team:${ADMIN}`).toString("base64")}`;
    if (!authed) return new Response(null, { status: 401 });
    if (u.pathname === "/admin/status") {
      if (!w.hasStatus) return new Response(null, { status: 404 });
      log.statusPolls++;
      return json(200, { ok: true, channelId: log.statusPolls > w.liveAfter ? CHANNEL : null });
    }
    if (u.pathname === "/admin/setup") {
      log.setupCalls++;
      if (log.setupCalls <= w.staleSetups) return json(502, { error: "line api 403 (set webhook): no active LINE Official Account sits behind this channel" });
      return w.setup.error ? json(502, { error: w.setup.error }) : json(200, { ...w.setup, addFriendUrl: `https://line.me/R/ti/p/${encodeURIComponent(w.setup.basicId)}` });
    }
    if (u.pathname === "/admin/export.csv") {
      const rows = w.csv[Math.min(log.csvPolls++, w.csv.length - 1)];
      const cells = (r) => CSV_HEAD.split(",").map((k) => r[k] ?? "").join(",");
      return new Response("﻿" + [CSV_HEAD, ...rows.map(cells)].join("\n") + "\n");
    }
    return new Response(null, { status: 404 });
  };
  const railway = async (args, opts = {}) => {
    log.railway.push({ args, input: opts.input });
    if (args[0] === "whoami") return { code: 0, stdout: "Logged in as Test User (test@example.com) 👋\n", stderr: "" };
    if (!w.railwayOk) return { code: 1, stdout: "", stderr: "Project not found" };
    if (args[0] === "variable" && args[1] === "list") return { code: 0, stdout: JSON.stringify(w.vars), stderr: "" };
    if (args[0] === "variable" && args[1] === "set") { w.vars[args[2]] = opts.input; return { code: 0, stdout: "{}", stderr: "" }; }
    if (args[0] === "variable" && args[1] === "delete") { delete w.vars[args[2]]; return { code: 0, stdout: "{}", stderr: "" }; }
    if (args[0] === "up" && w.upFails) return { code: 1, stdout: "", stderr: "Failed to upload" };
    return { code: 0, stdout: "", stderr: "" };
  };
  let clock = 0;
  const io = {
    env: { LINE_CHANNEL_ID: CHANNEL, ...(w.env || {}) },
    fetch,
    railway,
    ask: async (q) => {
      const key = Object.keys(w.answers).find((k) => q.includes(k));
      return key ? w.answers[key] : "";
    },
    askSecret: async () => SECRET,
    say: (line) => log.said.push(line),
    sleep: async (ms) => { clock += ms; },
    now: () => clock,
    readFile: (p) => (p in log.written ? log.written[p] : w.lineJson),
    writeFile: (p, text) => { log.written[p] = text; },
    linePath: "/repo/data/play/line.json",
    stage: () => {
      log.staged++;
      return { dir: "/tmp/klc-line-up-test", files: ["package.json", "railway.json", "server/line/index.js", "tools/line/richmenu.png"], cleanup: () => { log.cleaned++; } };
    },
    color: false,
  };
  return { w, io, log, screen: () => log.said.join("\n") };
}

/** Nothing the run printed, wrote, passed as an argument or put in the handoff holds a secret. */
function expectNoSecrets({ log, screen }, handoff = "") {
  const everything = [screen(), handoff, JSON.stringify(log.written), JSON.stringify(log.railway.map((c) => c.args))].join("\n");
  expect(everything).not.toContain(SECRET);
  expect(everything).not.toContain(ADMIN);
  expect(everything).not.toContain("tok-minted");
}

describe("connect: the whole of path B", () => {
  test("LINE check, Railway variables, redeploy, setup, line.json, live test and the handoff", async () => {
    const f = world();
    const out = await connect([], f.io);
    expect(out.ok).toBe(true);
    expect(out.basicId).toBe("@123abcde");

    // the secret goes only through stdin; the ID is an ordinary value; the stale token is removed; one redeploy
    const sets = f.log.railway.filter((c) => c.args[1] === "set");
    expect(sets.map((c) => c.args[2])).toEqual(["LINE_CHANNEL_ID", "LINE_CHANNEL_SECRET"]);
    for (const c of sets) expect(c.args).toEqual(expect.arrayContaining(["--stdin", "--skip-deploys", "--service", "kesenmemento-line"]));
    expect(sets[1].input).toBe(SECRET);
    expect(f.w.vars.LINE_CHANNEL_ACCESS_TOKEN).toBeUndefined();
    expect(f.log.railway.filter((c) => c.args[0] === "redeploy")).toHaveLength(1);
    expect(f.log.railway.filter((c) => c.args[0] === "up")).toHaveLength(0);

    // it waited for /admin/status to name the channel before the one setup call
    expect(f.log.statusPolls).toBe(3);
    expect(f.log.setupCalls).toBe(1);

    // the app's file, in the repo's format
    expect(f.log.written["/repo/data/play/line.json"]).toBe('{\n  "basicId": "@123abcde"\n}\n');

    const screen = f.screen();
    expect(screen).toContain("✓ ケセンメメント @123abcde");
    expect(screen).toContain("LINE_CHANNEL_SECRET = (hidden, through stdin)");
    expect(screen).toContain("✓ bug report KM-0007");
    expect(screen).toContain("✓ けしき V07 photo KM-0008");
    expect(screen).toContain("https://line.me/R/ti/p/%40123abcde");
    expect(screen).toContain("█");

    expect(out.handoff).toBe([
      "### LINE handoff",
      "- Official Account: ケセンメメント · @ID: @123abcde · provider: ________",
      "- Channel ID: 1657000001 (secret: NOT included; the repo owner added as Admin: ___)",
      "- 応答設定: Webhook on · 応答メッセージ on/off · あいさつメッセージ on/off",
      "- Railway variables set: yes (by: Test User)",
      "- POST /admin/setup: HTTP 200 · webhookActive: true · richMenuId: richmenu-new",
      "- Live test: follow yes · bug report KM-0007 · けしき V07 photo KM-0008",
      "- data/play/line.json basicId: set locally, PR #___",
      "- Open items: none",
    ].join("\n"));
    expectNoSecrets(f, out.handoff);
  });

  test("--check asks LINE only: no Railway call, nothing written", async () => {
    const f = world();
    const out = await connect(["--check"], f.io);
    expect(out).toEqual({ ok: true, basicId: "@123abcde" });
    expect(f.log.railway).toEqual([]);
    expect(f.log.written).toEqual({});
    expect(f.screen()).toContain("The channel is ready.");
    expect(f.screen()).toContain("push quota 200 a month");
    expectNoSecrets(f);
  });

  test("--check with the webhook switch off says the one thing left", async () => {
    const f = world({ webhookActive: false });
    await connect(["--check"], f.io);
    expect(f.screen()).toContain("応答設定 → Webhook をオン");
    expect(f.screen()).toContain("Almost ready");
  });

  test("a rerun with nothing to change sets nothing and does not redeploy", async () => {
    const f = world({ vars: { ADMIN_TOKEN: ADMIN, PUBLIC_BASE_URL: RAILWAY, LINE_CHANNEL_ID: CHANNEL, LINE_CHANNEL_SECRET: SECRET }, liveAfter: 0, lineJson: '{\n  "basicId": "@123abcde"\n}\n' });
    const out = await connect(["--no-watch"], f.io);
    expect(f.log.railway.map((c) => c.args[0] + " " + (c.args[1] || ""))).toEqual(["whoami ", "variable list"]);
    expect(f.screen()).toContain("the variables already name this channel");
    expect(f.screen()).toContain("already has @123abcde");
    expect(f.log.written).toEqual({});
    expect(out.ok).toBe(false);   // --no-watch leaves the live test as an open item
    expect(out.handoff).toContain("  - live test not watched by connect.mjs");
  });

  test("an unpointed custom domain: the Railway domain is used, and PUBLIC_BASE_URL is set to it", async () => {
    const f = world({ vars: { ADMIN_TOKEN: ADMIN, PUBLIC_BASE_URL: CUSTOM, RAILWAY_PUBLIC_DOMAIN: "kesenmemento-line-production.up.railway.app" } });
    await connect(["--yes", "--no-watch"], f.io);
    expect(f.w.vars.PUBLIC_BASE_URL).toBe(RAILWAY);
    expect(f.screen()).toContain(`PUBLIC_BASE_URL ${CUSTOM} is unreachable (DNS or TLS)`);
    expect(f.screen()).toContain(`answers at ${RAILWAY}`);
  });

  test("--deploy uploads the bot alone from a staged folder, never the checkout's root; --project and --environment reach every call", async () => {
    const f = world();
    await connect(["--deploy", "--yes", "--no-watch", "--project", "p-123", "--environment", "production"], f.io);
    // the root's railway.json is the app's (cd bundle && bun server.js): `railway up` there would run the app on the LINE service
    expect(f.log.railway.filter((c) => c.args[0] === "up")[0].args).toEqual(["up", "/tmp/klc-line-up-test", "--path-as-root", "--detach", "--service", "kesenmemento-line", "--project", "p-123", "--environment", "production"]);
    expect([f.log.staged, f.log.cleaned]).toEqual([1, 1]);
    expect(f.screen()).toContain("the bot alone, staged in /tmp/klc-line-up-test: 4 files");
    expect(f.log.railway.filter((c) => c.args[0] === "redeploy")).toHaveLength(0);
    for (const c of f.log.railway.filter((c) => c.args[0] === "variable")) expect(c.args).toContain("p-123");
  });

  test("--deploy removes its staged folder even when the upload fails", async () => {
    const f = world({ upFails: true });
    await expect(connect(["--deploy", "--yes", "--no-watch"], f.io)).rejects.toThrow("railway up failed");
    expect([f.log.staged, f.log.cleaned]).toEqual([1, 1]);
  });

  test("an older build without /admin/status: the setup retries while LINE still refuses the old token", async () => {
    const f = world({ hasStatus: false, staleSetups: 2 });
    const out = await connect(["--yes", "--no-watch"], f.io);
    expect(f.log.setupCalls).toBe(3);
    expect(out.basicId).toBe("@123abcde");
    expect(f.screen()).toContain("this build has no /admin/status");
  });

  test("the setup's open items reach the screen and the handoff", async () => {
    const f = world({ setup: { basicId: "@123abcde", richMenuId: "richmenu-new", webhook: `${RAILWAY}/webhook`, webhookActive: false, todo: ["LINE Developers → Messaging API設定 → Webhookの利用 をオン (Use webhook)"] } });
    const out = await connect(["--yes", "--handoff", "/tmp/handoff.md"], f.io);
    expect(out.ok).toBe(false);
    expect(out.handoff).toContain("Webhook off");
    expect(out.handoff).toContain("  - LINE Developers → Messaging API設定 → Webhookの利用 をオン (Use webhook)");
    expect(f.log.written["/tmp/handoff.md"]).toBe(out.handoff + "\n");
  });

  test("a live test that never arrives stops after 15 minutes and is an open item", async () => {
    const f = world({ csv: [[]], answers: { "Go ahead?": "y", "greeting": "n" } });
    const out = await connect([], f.io);
    expect(out.ok).toBe(false);
    expect(out.handoff).toContain("Live test: follow no · bug report ___ · けしき V07 photo ___");
    expect(out.handoff).toContain("no bug report arrived in 15 minutes");
    expect(out.handoff).toContain("no 「けしき V07」 photo arrived in 15 minutes");
  });
});

describe("connect: refusals a person can act on", () => {
  const fails = async (f, argv = ["--yes"]) => {
    const e = await connect(argv, f.io).catch((x) => x);
    expect(e).toBeInstanceOf(ConnectError);
    expectNoSecrets(f, e.message);
    return e.message;
  };

  test("a wrong ID or secret, before anything on Railway changes", async () => {
    const f = world({ lineToken: 400 });
    expect(await fails(f)).toBe("line api 400 (token): LINE refused the channel ID + secret. Copy both again from LINE Developers → the channel → チャネル基本設定 (Basic settings)");
    expect(f.log.railway).toEqual([]);
  });

  test("no Official Account behind the channel (the 403 the author's channel gives)", async () => {
    const f = world({ lineInfo: 403 });
    const msg = await fails(f, ["--check"]);
    expect(msg).toStartWith("line api 403 (bot info): no active LINE Official Account");
    expect(msg).toEndWith("then try again");
  });

  test("the Reel Deal / UMI account is refused", async () => {
    expect(await fails(world({ info: { basicId: "@umi", displayName: "UMI" } }))).toContain("not to reuse the Reel Deal / UMI account");
  });

  test("an ID that is not a number, and a secret with spaces", async () => {
    const f = world();
    f.io.env.LINE_CHANNEL_ID = "@123abcde";
    expect(await fails(f)).toContain("Channel ID");
    const g = world();
    g.io.askSecret = async () => "two words";
    expect(await connect([], g.io).catch((e) => e.message)).toContain("has spaces");
  });

  test("no access to the Railway project: ask for the invite", async () => {
    const f = world({ railwayOk: false });
    expect(await fails(f)).toContain("Ask for an invite to its project (issue #5, path B step 2)");
  });

  test("a service that answers nowhere", async () => {
    const f = world({ reachable: new Set() });
    const msg = await fails(f);
    expect(msg).toContain("does not answer at any of its addresses");
    expect(f.log.railway.some((c) => c.args[1] === "set")).toBe(false);
  });

  test("declining the change leaves Railway untouched", async () => {
    const f = world({ answers: { "Go ahead?": "n" } });
    expect(await fails(f, [])).toBe("stopped before changing Railway; nothing was changed");
    expect(f.log.railway.some((c) => ["set", "delete"].includes(c.args[1]) || c.args[0] === "redeploy")).toBe(false);
  });

  test("a setup on another channel is refused, and line.json is not written", async () => {
    const f = world({ setup: { basicId: "@otherbot", richMenuId: "r", webhook: "", webhookActive: true, todo: [] } });
    expect(await fails(f)).toContain("two channels are mixed up");
    expect(f.log.written).toEqual({});
  });

  test("a setup failure on this build is not retried", async () => {
    const f = world({ setup: { error: "line api 403 (set webhook): no active LINE Official Account sits behind this channel" } });
    expect(await fails(f)).toStartWith("POST /admin/setup → HTTP 502: line api 403");
    expect(f.log.setupCalls).toBe(1);
  });

  test("a deployment that never runs the channel times out with where to look", async () => {
    const f = world({ liveAfter: Infinity });
    expect(await fails(f)).toContain("railway logs --service kesenmemento-line");
  });

  test("unknown flags and flags without a value", () => {
    expect(() => parseArgs(["--nope"])).toThrow("unknown flag --nope");
    expect(() => parseArgs(["--service"])).toThrow("--service needs a value");
    expect(() => parseArgs(["--handoff", "--yes"])).toThrow("--handoff needs a value");
  });
});

describe("connect: the pieces", () => {
  test("checkChannel reads the name, the basic ID, the switch and the quota", async () => {
    const f = world();
    expect(await checkChannel({ channelId: CHANNEL, channelSecret: SECRET, fetch: f.io.fetch })).toEqual({
      basicId: "@123abcde", displayName: "ケセンメメント", webhookActive: true, webhookEndpoint: "", quota: "200 a month",
    });
    const token = f.log.fetches.find((x) => x.url.endsWith("/oauth2/v3/token"));
    expect(String(token.init.body)).toContain(`client_id=${CHANNEL}`);
  });

  test("validBasicId", () => {
    for (const ok of ["@123abcde", "@kesen.memento", "@a_b-c"]) expect(validBasicId(ok)).toBe(true);
    for (const bad of ["", "123abcde", "@", "@has space", "@" + "x".repeat(21), "@a/b"]) expect(validBasicId(bad)).toBe(false);
  });

  test("parseCsv: BOM, quotes, commas and newlines inside a cell, CRLF", () => {
    const rows = parseCsv('﻿code,text,view_id\r\nKM-1,"a, ""b""\nc",V07\r\nKM-2,,\n');
    expect(rows).toEqual([{ code: "KM-1", text: 'a, "b"\nc', view_id: "V07" }, { code: "KM-2", text: "", view_id: "" }]);
    expect(parseCsv("")).toEqual([]);
  });

  test("parseRailwayVars: a flat map, a list, or { variables }", () => {
    expect(parseRailwayVars('{"A":"1"}')).toEqual({ A: "1" });
    expect(parseRailwayVars('[{"name":"A","value":"1"}]')).toEqual({ A: "1" });
    expect(parseRailwayVars('{"variables":{"A":"1"}}')).toEqual({ A: "1" });
    expect(() => parseRailwayVars("not json")).toThrow("did not print JSON");
  });

  test("qrTerminal: half-block rows, a quiet zone, dark on light when coloured", () => {
    const plain = qrTerminal("https://line.me/R/ti/p/%40123abcde", { color: false }).split("\n");
    const width = plain[0].length;
    expect(plain.every((l) => l.length === width)).toBe(true);
    expect(plain.length).toBe(Math.ceil(width / 2));
    expect(plain[0].trim()).toBe("");
    expect(plain.join("")).toMatch(/^[ █▀▄]+$/);
    expect(qrTerminal("x").split("\n")[0]).toStartWith("\x1b[30;47m");
  });

  test("handoffText leaves blanks for what it does not know", () => {
    expect(handoffText({ open: [] })).toBe([
      "### LINE handoff",
      "- Official Account: ________ · @ID: @________ · provider: ________",
      "- Channel ID: ________ (secret: NOT included; the repo owner added as Admin: ___)",
      "- 応答設定: Webhook on/off · 応答メッセージ on/off · あいさつメッセージ on/off",
      "- Railway variables set: ___ (by: ____)",
      "- POST /admin/setup: HTTP ___ · webhookActive: ___ · richMenuId: ___",
      "- Live test: follow ___ · bug report ___ · けしき V07 photo ___",
      "- data/play/line.json basicId: not yet",
      "- Open items: none",
    ].join("\n"));
  });
});

describe("stageBot: the folder --deploy uploads", () => {
  test("the bot alone: server/line, the rich menu image setup.js reads, its own package.json and railway.json; nothing of the app", () => {
    const root = join(import.meta.dir, "..");
    const dir = mkdtempSync(join(tmpdir(), "klc-stage-test-"));
    try {
      const files = stageBot(root, dir);
      expect(files).toEqual(expect.arrayContaining(["package.json", "railway.json", "server/line/index.js", "server/line/setup.js", "tools/line/richmenu.png"]));
      expect(files.filter((p) => !/^(package\.json|railway\.json|server\/line\/.+|tools\/line\/richmenu\.png)$/.test(p))).toEqual([]);
      const rw = JSON.parse(readFileSync(join(dir, "railway.json"), "utf8"));
      expect(rw.deploy.startCommand).toBe("bun server/line/index.js");
      expect(rw.deploy.healthcheckPath).toBe("/healthz");
      expect(JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).scripts.start).toBe("bun server/line/index.js");
      // the server imports only itself and the runtime, so the folder runs on its own
      for (const f of files.filter((p) => p.endsWith(".js"))) {
        for (const m of readFileSync(join(dir, f), "utf8").matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*)["']([^"']+)["']/g)) expect(m[1]).toMatch(/^(\.\/|node:|bun:)/);
      }
      expect(statSync(join(dir, "tools/line/richmenu.png")).size).toBe(statSync(join(root, "tools/line/richmenu.png")).size);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
