// Channel setup (server/line/setup.js) and its route POST /admin/setup: the webhook set + tested + its switch read,
// the rich menu created, uploaded, made the default and older ones removed, the add-friend link from the bot's basic ID,
// and every way it refuses. The route runs with the server's own API client, so no secret leaves the service.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../server/line/config.js";
import { createApp } from "../server/line/index.js";
import { RICH_MENU_HEIGHT, RICH_MENU_NAME, RICH_MENU_WIDTH } from "../server/line/menu.js";
import { LineApiError } from "../server/line/api.js";
import { checkBase, explainSetupError, imageSize, RICH_MENU_PNG, runSetup } from "../server/line/setup.js";

const TOKEN = "admin-token-must-be-24ch";
const BASE = "https://line.example.jp";
const PNG = readFileSync(RICH_MENU_PNG);
/** GET {base}/healthz as the deployed service answers it. */
const healthy = async () => Response.json({ ok: true, service: "kesenmemento-line", version: "1.0.0" });
const lineError = (status, op) => Object.assign(new LineApiError(status), op ? { op } : {});

/** A recording stand-in for the API client. */
function fakeApi(over = {}) {
  const calls = [];
  const rec = (name, value) => async (...args) => { calls.push([name, ...args]); return typeof value === "function" ? value(...args) : value; };
  const api = {
    tokenSource: "minted",
    setWebhook: rec("setWebhook", { ok: true }),
    testWebhook: rec("testWebhook", { success: true, statusCode: 200, reason: "OK" }),
    getWebhook: rec("getWebhook", { endpoint: `${BASE}/webhook`, active: true }),
    createRichMenu: rec("createRichMenu", { richMenuId: "richmenu-new" }),
    uploadRichMenuImage: rec("uploadRichMenuImage", { ok: true }),
    setDefaultRichMenu: rec("setDefaultRichMenu", { ok: true }),
    listRichMenus: rec("listRichMenus", { richmenus: [
      { richMenuId: "richmenu-old", name: RICH_MENU_NAME },
      { richMenuId: "richmenu-other", name: "not ours" },
      { richMenuId: "richmenu-new", name: RICH_MENU_NAME },
    ] }),
    deleteRichMenu: rec("deleteRichMenu", { ok: true }),
    botInfo: rec("botInfo", { basicId: "@123abcde", displayName: "ケセンメメント" }),
    ...over,
  };
  return { api, calls, names: () => calls.map((c) => c[0]) };
}

describe("runSetup", () => {
  test("the shipped rich menu image is 2500×1686 and under LINE's 1 MB", () => {
    expect(imageSize(PNG)).toMatchObject({ w: RICH_MENU_WIDTH, h: RICH_MENU_HEIGHT });
    expect(PNG.length).toBeLessThan(1_000_000);
  });

  test("webhook, menu, default, cleanup and the add-friend link, in that order", async () => {
    const f = fakeApi();
    const out = await runSetup({ api: f.api, publicBaseUrl: BASE + "/", png: PNG });
    expect(f.names()).toEqual([
      "setWebhook", "testWebhook", "getWebhook", "createRichMenu", "uploadRichMenuImage",
      "setDefaultRichMenu", "listRichMenus", "deleteRichMenu", "botInfo",
    ]);
    expect(f.calls[0][1]).toBe(`${BASE}/webhook`);
    expect(f.calls[1][1]).toBe(`${BASE}/webhook`);
    expect(f.calls[4][1]).toBe("richmenu-new");
    expect(f.calls[4][3]).toBe("image/png");
    expect(f.calls[5][1]).toBe("richmenu-new");
    expect(f.calls[7][1]).toBe("richmenu-old");
    expect(out).toEqual({
      basicId: "@123abcde",
      displayName: "ケセンメメント",
      addFriendUrl: "https://line.me/R/ti/p/%40123abcde",
      richMenuId: "richmenu-new",
      webhook: `${BASE}/webhook`,
      webhookActive: true,
      tokenSource: "minted",
      todo: [],
    });
  });

  test("a webhook switch that is off is reported as the one thing left to do", async () => {
    const f = fakeApi({ getWebhook: async () => ({ endpoint: `${BASE}/webhook`, active: false }) });
    const out = await runSetup({ api: f.api, publicBaseUrl: BASE, png: PNG });
    expect(out.webhookActive).toBe(false);
    expect(out.todo.length).toBe(1);
    expect(out.todo[0]).toContain("Webhookの利用");
  });

  test("an unreadable switch or a client without getWebhook is unknown, not an error", async () => {
    const broken = fakeApi({ getWebhook: async () => { throw new Error("500"); } });
    expect((await runSetup({ api: broken.api, publicBaseUrl: BASE, png: PNG })).webhookActive).toBe(null);
    const old = fakeApi();
    delete old.api.getWebhook;
    delete old.api.tokenSource;
    const out = await runSetup({ api: old.api, publicBaseUrl: BASE, png: PNG });
    expect(out.webhookActive).toBe(null);
    expect(out.tokenSource).toBe(null);
    expect(out.todo).toEqual([]);
  });

  test("a failed housekeeping delete does not fail the setup", async () => {
    const f = fakeApi({ deleteRichMenu: async () => { throw new Error("404"); } });
    expect((await runSetup({ api: f.api, publicBaseUrl: BASE, png: PNG })).richMenuId).toBe("richmenu-new");
  });

  test("refusals: no base URL, a wrong image, a failed webhook test, no menu id, no basic ID", async () => {
    await expect(runSetup({ api: fakeApi().api, publicBaseUrl: "", png: PNG })).rejects.toThrow("PUBLIC_BASE_URL");
    await expect(runSetup({ api: fakeApi().api, publicBaseUrl: "ftp://x", png: PNG })).rejects.toThrow("PUBLIC_BASE_URL");
    await expect(runSetup({ api: fakeApi().api, publicBaseUrl: BASE, png: null })).rejects.toThrow("no rich menu image");
    const small = Buffer.from(PNG.subarray(0, 64));
    small.writeUInt32BE(10, 16);   // IHDR width
    small.writeUInt32BE(10, 20);   // IHDR height
    await expect(runSetup({ api: fakeApi().api, publicBaseUrl: BASE, png: small })).rejects.toThrow("rich menu image must be");
    await expect(runSetup({ api: fakeApi().api, publicBaseUrl: BASE, png: Buffer.alloc(64, 1) })).rejects.toThrow("rich menu image must be");
    const noHook = fakeApi({ testWebhook: async () => ({ success: false, statusCode: 404, reason: "Not Found" }) });
    await expect(runSetup({ api: noHook.api, publicBaseUrl: BASE, png: PNG })).rejects.toThrow("webhook test failed: 404 Not Found");
    expect(noHook.names()).not.toContain("createRichMenu");
    await expect(runSetup({ api: fakeApi({ createRichMenu: async () => ({}) }).api, publicBaseUrl: BASE, png: PNG })).rejects.toThrow("rich menu was not created");
    await expect(runSetup({ api: fakeApi({ botInfo: async () => ({}) }).api, publicBaseUrl: BASE, png: PNG })).rejects.toThrow("basicId");
  });

  test("with a probe, {base}/healthz is checked before LINE is touched", async () => {
    const seen = [];
    const f = fakeApi();
    const out = await runSetup({ api: f.api, publicBaseUrl: BASE, png: PNG, probe: async (url, init) => { seen.push([url, init.redirect]); return healthy(); } });
    expect(seen).toEqual([[`${BASE}/healthz`, "error"]]);
    expect(out.basicId).toBe("@123abcde");
  });

  test("a base whose DNS is not set yet, or that is another site, leaves the channel untouched", async () => {
    const dns = fakeApi();
    const unreachable = async () => { throw new TypeError("fetch failed"); };
    await expect(runSetup({ api: dns.api, publicBaseUrl: BASE, png: PNG, probe: unreachable }))
      .rejects.toThrow(`PUBLIC_BASE_URL ${BASE} is unreachable (DNS or TLS)`);
    expect(dns.calls).toEqual([]);
    const slow = async () => { throw Object.assign(new Error("timeout"), { name: "TimeoutError" }); };
    await expect(checkBase(slow, BASE)).rejects.toThrow("no answer in 8 s");
    const other = fakeApi();
    const parked = async () => new Response("<html>parked</html>", { status: 200 });
    await expect(runSetup({ api: other.api, publicBaseUrl: BASE, png: PNG, probe: parked }))
      .rejects.toThrow("answers, but not as kesenmemento-line (HTTP 200)");
    await expect(checkBase(async () => Response.json({ service: "kesenmemento-line" }, { status: 503 }), BASE)).rejects.toThrow("HTTP 503");
    expect(other.calls).toEqual([]);
  });

  test("a LINE refusal says which call failed and what a person does about it", async () => {
    const noAccount = fakeApi({ setWebhook: async () => { throw lineError(403); } });
    const e403 = await runSetup({ api: noAccount.api, publicBaseUrl: BASE, png: PNG }).catch((e) => e.message);
    expect(e403).toStartWith("line api 403 (set webhook): no active LINE Official Account");
    expect(e403).toContain("「Messaging APIを利用する」");
    const badSecret = fakeApi({ setWebhook: async () => { throw lineError(400, "token"); } });
    expect(await runSetup({ api: badSecret.api, publicBaseUrl: BASE, png: PNG }).catch((e) => e.message))
      .toStartWith("line api 400 (token): LINE refused the channel ID + secret");
    const menu = fakeApi({ createRichMenu: async () => { throw lineError(429); } });
    expect(await runSetup({ api: menu.api, publicBaseUrl: BASE, png: PNG }).catch((e) => e.message))
      .toStartWith("line api 429 (rich menu): LINE is rate-limiting");
    const info = fakeApi({ botInfo: async () => { throw lineError(503); } });
    expect(await runSetup({ api: info.api, publicBaseUrl: BASE, png: PNG }).catch((e) => e.message))
      .toBe("line api 503 (bot info): LINE had a server error; run the setup again");
  });

  test("explainSetupError: network, unknown statuses and plain errors", () => {
    const net = Object.assign(new LineApiError(0), { name: "TimeoutError" });
    expect(explainSetupError(net, "test webhook")).toBe("line api 0 (test webhook): LINE did not answer (network or timeout); run the setup again");
    expect(explainSetupError(lineError(418), "rich menu")).toBe("line api 418 (rich menu)");
    expect(explainSetupError(new Error("rich menu was not created"), "rich menu")).toBe("rich menu was not created");
  });
});

describe("POST /admin/setup", () => {
  const dirs = [];
  const apps = [];
  afterEach(() => {
    while (apps.length) { try { apps.pop().close(); } catch { /* closed */ } }
    while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
  });
  function open(api, log = { info() {}, warn() {}, error() {} }, probe = healthy) {
    const dir = mkdtempSync(join(tmpdir(), "line-setup-"));
    dirs.push(dir);
    const config = loadConfig({
      LINE_CHANNEL_SECRET: "channel-secret-test-value",
      LINE_CHANNEL_ID: "1657000001",
      LINE_STORE_KEY: Buffer.alloc(32, 7).toString("base64"),
      ADMIN_TOKEN: TOKEN,
      DATA_DIR: dir,
      PUBLIC_BASE_URL: BASE,
    }, { dataDir: dir });
    const app = createApp(config, { api, logger: log, probe });
    apps.push(app);
    return app;
  }
  const auth = (password = TOKEN) => ({ authorization: `Basic ${Buffer.from(`team:${password}`).toString("base64")}` });
  const post = (app, headers = auth()) => app.fetch(new Request("http://127.0.0.1/admin/setup", { method: "POST", headers }));

  test("needs the admin password and a POST", async () => {
    const f = fakeApi();
    const app = open(f.api);
    expect((await post(app, {})).status).toBe(401);
    expect((await post(app, auth("wrong-password-wrong-password"))).status).toBe(401);
    expect((await app.fetch(new Request("http://127.0.0.1/admin/setup", { headers: auth() }))).status).toBe(405);
    expect(f.calls.length).toBe(0);
  });

  test("runs the setup with the server's own client and answers the result", async () => {
    const f = fakeApi();
    const lines = [];
    const app = open(f.api, { info: (m, d) => lines.push([m, d]), warn() {}, error() {} });
    const res = await post(app);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    const body = await res.json();
    expect(body.basicId).toBe("@123abcde");
    expect(body.addFriendUrl).toBe("https://line.me/R/ti/p/%40123abcde");
    expect(body.webhook).toBe(`${BASE}/webhook`);
    expect(lines.find(([m]) => m === "setup.done")[1]).toEqual({ basicId: "@123abcde", richMenuId: "richmenu-new", webhookActive: true, token: "minted" });
  });

  test("a LINE failure is a 502 with the reason and no secret", async () => {
    const f = fakeApi({ testWebhook: async () => ({ success: false, statusCode: 401, reason: "Unauthorized" }) });
    const app = open(f.api);
    const res = await post(app);
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(JSON.parse(text).error).toBe("webhook test failed: 401 Unauthorized");
    expect(text).not.toContain("channel-secret-test-value");
    expect(text).not.toContain(TOKEN);
  });

  test("the server checks its own base first: an unpointed custom domain is a 502 that says so", async () => {
    const f = fakeApi();
    const seen = [];
    const app = open(f.api, undefined, async (url) => { seen.push(url); throw new TypeError("fetch failed"); });
    const res = await post(app);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("set PUBLIC_BASE_URL to the Railway domain");
    expect(seen).toEqual([`${BASE}/healthz`]);
    expect(f.calls).toEqual([]);
  });
});

describe("GET /admin/status", () => {
  const dirs = [];
  const apps = [];
  afterEach(() => {
    while (apps.length) { try { apps.pop().close(); } catch { /* closed */ } }
    while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
  });
  function open(env) {
    const dir = mkdtempSync(join(tmpdir(), "line-status-"));
    dirs.push(dir);
    const config = loadConfig({
      LINE_CHANNEL_SECRET: "channel-secret-test-value",
      LINE_STORE_KEY: Buffer.alloc(32, 7).toString("base64"),
      ADMIN_TOKEN: TOKEN,
      ...env,
    }, { dataDir: dir });
    const app = createApp(config, { api: fakeApi().api, now: () => Date.UTC(2026, 9, 9, 8, 0, 0) });
    apps.push(app);
    return app;
  }
  const get = (app, headers = { authorization: `Basic ${Buffer.from(`team:${TOKEN}`).toString("base64")}` }, method = "GET") =>
    app.fetch(new Request("http://127.0.0.1/admin/status", { method, headers }));

  test("names the channel this deployment runs on, and nothing secret", async () => {
    const app = open({ LINE_CHANNEL_ID: "1657000001", RAILWAY_ENVIRONMENT: "production", RAILWAY_PUBLIC_DOMAIN: "kesenmemento-line-production.up.railway.app" });
    const res = await get(app);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({
      ok: true,
      service: "kesenmemento-line",
      version: "1.0.0",
      channelId: "1657000001",
      tokenSource: "minted",
      publicBaseUrl: "https://kesenmemento-line-production.up.railway.app",
      publicBaseUrlSource: "railway",
      startedAt: "2026-10-09T08:00:00.000Z",
    });
    expect(text).not.toContain("channel-secret-test-value");
    expect(text).not.toContain(TOKEN);
  });

  test("needs the admin password and a GET; a fixed-token deployment has no channel ID", async () => {
    const app = open({ LINE_CHANNEL_ACCESS_TOKEN: "fixed-access-token-value", PUBLIC_BASE_URL: BASE });
    expect((await get(app, {})).status).toBe(401);
    expect((await get(app, undefined, "POST")).status).toBe(405);
    const body = await (await get(app)).json();
    expect(body.channelId).toBe(null);
    expect(body.publicBaseUrlSource).toBe("env");
  });
});
