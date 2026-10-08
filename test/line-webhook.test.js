// Webhook: signature, dedupe, rate limits, async 200, Discord, and image download.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../server/line/config.js";
import { createApp } from "../server/line/index.js";
import { signBody } from "../server/line/signature.js";
import { sampleJpeg } from "../server/line/media.js";

const SECRET = "channel-secret-test-value";
const USER = "U" + "a".repeat(32);
const T = 1_700_000_000_000;
const dirs = [];
const apps = [];

function open(over = {}, deps = {}) {
  const dir = mkdtempSync(join(tmpdir(), "line-wh-"));
  dirs.push(dir);
  const config = loadConfig({
    LINE_CHANNEL_SECRET: SECRET,
    LINE_CHANNEL_ACCESS_TOKEN: "channel-token-test-value",
    LINE_STORE_KEY: Buffer.alloc(32, 4).toString("base64"),
    ADMIN_TOKEN: "admin-token-must-be-24ch",
    DATA_DIR: dir,
    PUBLIC_BASE_URL: "http://127.0.0.1:8943",
    LINE_SIM: over.sim === false ? "" : "1",
    DISCORD_WEBHOOK_URL: over.discord || "",
  }, {
    syncWebhook: over.syncWebhook !== false,
    eventsPerMinute: over.eventsPerMinute,
    reportsPerDay: over.reportsPerDay,
    dataDir: dir,
  });
  const app = createApp(config, deps);
  apps.push(app);
  return app;
}

afterEach(() => {
  while (apps.length) {
    try { apps.pop().close(); } catch { /* already closed */ }
  }
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
});

function post(app, events, { secret = SECRET, raw } = {}) {
  const body = raw ?? JSON.stringify({ destination: "Ubot", events });
  const headers = { "content-type": "application/json" };
  if (secret !== null) headers["x-line-signature"] = signBody(secret === false ? "other-body" : body, SECRET);
  return app.fetch(new Request("http://127.0.0.1/webhook", { method: "POST", headers, body }));
}

function ev(id, over = {}) {
  return {
    webhookEventId: id,
    replyToken: `rt-${id}`,
    timestamp: T,
    source: { type: "user", userId: USER },
    ...over,
  };
}

function replied(app) {
  return app.outbox.filter((item) => item.op === "reply").map((item) => item.messages.map((m) => m.text).join("\n")).join("\n");
}

describe("webhook", () => {
  test("a missing or tampered signature is 401 with an empty body, and a good one is 200", async () => {
    const app = open();
    const missing = await post(app, [ev("e0", { type: "follow" })], { secret: null });
    expect(missing.status).toBe(401);
    expect(await missing.text()).toBe("");
    const bad = await app.fetch(new Request("http://127.0.0.1/webhook", {
      method: "POST",
      headers: { "x-line-signature": signBody("{}", SECRET) },
      body: JSON.stringify({ events: [] }),
    }));
    expect(bad.status).toBe(401);
    expect(await bad.text()).toBe("");
    const ok = await post(app, [ev("e1", { type: "follow" })]);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("");
    expect(replied(app)).toContain("ケセンメメントの公式LINEです。");
  });

  test("a redelivered webhook id is accepted and not processed twice", async () => {
    const app = open();
    const event = ev("same-id", { type: "follow" });
    expect((await post(app, [event])).status).toBe(200);
    expect((await post(app, [event])).status).toBe(200);
    expect(app.outbox.filter((item) => item.op === "reply")).toHaveLength(1);
  });

  test("the 21st event in a minute gets one polite reply, and the next one is quiet", async () => {
    const app = open({ eventsPerMinute: 2 });
    for (let i = 1; i <= 4; i++) {
      expect((await post(app, [ev(`rate-${i}`, { type: "follow", timestamp: T + i })])).status).toBe(200);
    }
    const replies = app.outbox.filter((item) => item.op === "reply");
    expect(replies).toHaveLength(3);
    expect(replies[2].messages[0].text).toContain("たくさん届いています。少し時間をおいて、もう一度送ってください。");
    expect(replies[0].replyToken).toBe("rt-rate-1");
    expect(replies[1].replyToken).toBe("rt-rate-2");
    expect(replies[2].replyToken).toBe("rt-rate-3");
  });

  test("a second report the same day is refused once and the draft stays", async () => {
    const app = open({ reportsPerDay: 1 });
    const idea = (n) => [
      ev(`idea-${n}-a`, { type: "postback", postback: { data: "flow=idea" }, timestamp: T + n }),
      ev(`idea-${n}-b`, { type: "message", message: { type: "text", text: `アイデア${n}` }, timestamp: T + n + 1 }),
      ev(`idea-${n}-c`, { type: "postback", postback: { data: "action=send" }, timestamp: T + n + 2 }),
    ];
    await post(app, idea(1));
    await post(app, idea(2));
    await post(app, idea(3));
    expect(app.store.listReports({})).toHaveLength(1);
    expect(app.store.listReports({})[0].code).toBe("KM-0001");
    const text = replied(app);
    expect(text).toContain("ありがとうございます！ 受付番号は KM-0001 です。");
    expect(text.match(/たくさん届いています/g)).toHaveLength(1);
    expect(app.store.loadSession(app.store.userRef(USER)).step).toBe("confirm");
  });

  test("production returns 200 before the reply is sent", async () => {
    const outbox = [];
    let started = false;
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const app = open({ syncWebhook: false }, {
      api: {
        reply: async (replyToken, messages) => {
          started = true;
          await gate;
          outbox.push({ replyToken, messages });
        },
      },
    });
    const res = await post(app, [ev("async-1", { type: "follow" })]);
    expect(res.status).toBe(200);
    expect(started).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(started).toBe(true);
    expect(outbox).toHaveLength(0);
    release();
    await app.settled();
    expect(outbox).toHaveLength(1);
    expect(outbox[0].messages[0].text).toContain("ケセンメメントの公式LINEです。");
  });

  test("Discord gets one line and never the LINE user id", async () => {
    const calls = [];
    const previous = globalThis.fetch;
    globalThis.fetch = async (url, opts) => {
      calls.push({ url: String(url), body: opts.body });
      return new Response(null, { status: 204 });
    };
    try {
      const app = open({ discord: "http://127.0.0.1:9/discord-hook" });
      await post(app, [
        ev("d1", { type: "postback", postback: { data: "flow=idea" } }),
        ev("d2", { type: "message", message: { type: "text", text: "夜の港を歩くコースがほしいです。" }, timestamp: T + 1 }),
        ev("d3", { type: "postback", postback: { data: "action=send" }, timestamp: T + 2 }),
      ]);
      expect(calls).toHaveLength(1);
      const content = JSON.parse(calls[0].body).content;
      expect(content).toContain("KM-0001");
      expect(content).toContain("アイデア");
      expect(content).toContain("夜の港を歩くコースがほしいです。");
      expect(content).toContain("http://127.0.0.1:8943/admin/r/KM-0001");
      expect(content).not.toContain(USER);
      expect(content).not.toContain("http://127.0.0.1:9/discord-hook");
    } finally {
      globalThis.fetch = previous;
    }
  });

  test("an image is downloaded, retried once, and stored without EXIF", async () => {
    const jpeg = sampleJpeg({ exif: true, w: 12, h: 9 });
    const contentCalls = [];
    const fetchImpl = async (url) => {
      const u = String(url);
      if (u.includes("/content")) {
        contentCalls.push(u);
        if (contentCalls.length === 1) return new Response("no", { status: 500 });
        return new Response(jpeg, { status: 200, headers: { "content-type": "image/jpeg" } });
      }
      return new Response(JSON.stringify({ sentMessages: [{ id: "1" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const app = open({ sim: false }, { fetch: fetchImpl });
    const res = await post(app, [
      ev("b1", { type: "postback", postback: { data: "flow=bug" } }),
      ev("b2", { type: "postback", postback: { data: "bug.device=phone" }, timestamp: T + 1 }),
      ev("b3", { type: "postback", postback: { data: "bug.mode=walk" }, timestamp: T + 2 }),
      ev("b4", { type: "message", message: { type: "text", text: "地面にめり込みます" }, timestamp: T + 3 }),
      ev("b5", { type: "message", message: { type: "image", id: "shot/1" }, timestamp: T + 4 }),
      ev("b6", { type: "postback", postback: { data: "action=done" }, timestamp: T + 5 }),
      ev("b7", { type: "postback", postback: { data: "action=send" }, timestamp: T + 6 }),
    ]);
    expect(res.status).toBe(200);
    expect(contentCalls).toEqual([
      "https://api-data.line.me/v2/bot/message/shot%2F1/content",
      "https://api-data.line.me/v2/bot/message/shot%2F1/content",
    ]);
    const report = app.store.getByCode("KM-0001");
    expect(report.text).toBe("地面にめり込みます");
    const media = app.store.mediaFor(report.id);
    expect(media).toHaveLength(1);
    expect(media[0].w).toBe(12);
    expect(media[0].h).toBe(9);
    expect(readFileSync(join(app.store.root, media[0].path)).toString("latin1")).not.toContain("FAKEGPS");
  });
});
