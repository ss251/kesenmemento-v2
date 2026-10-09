// Minted channel tokens: the bot runs on the channel ID + secret alone (POST /oauth2/v3/token, 15-minute
// stateless tokens), reuses a token until a minute before it expires, re-mints after a 401, and never puts the
// secret or a token in an error. The config accepts the ID in place of a fixed token.
import { describe, expect, test } from "bun:test";
import { createLineApi, LineApiError } from "../server/line/api.js";
import { loadConfig, describeConfig, ConfigError } from "../server/line/config.js";

const SECRET = "made-up-channel-secret-for-tests";
const STORE_KEY = Buffer.alloc(32, 7).toString("base64");
const ADMIN = "admin-token-long-enough-1234567890";

function jsonResponse(status, body) {
  return new Response(body == null ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** A fake LINE: /oauth2/v3/token hands out tok-1, tok-2 ...; other calls answer 200 unless `reject` says otherwise. */
function fakeLine({ expiresIn = 899, reject = () => false, mintStatus = 200 } = {}) {
  const calls = [];
  let minted = 0;
  const fetch = async (url, opts) => {
    const u = String(url);
    calls.push({ url: u, opts });
    if (u.endsWith("/oauth2/v3/token")) {
      if (mintStatus !== 200) return jsonResponse(mintStatus, { error: "invalid_client" });
      minted++;
      return jsonResponse(200, { token_type: "Bearer", access_token: `tok-${minted}`, expires_in: expiresIn });
    }
    if (reject(opts.headers.authorization, u)) return jsonResponse(401, { message: "Authentication failed" });
    if (u.endsWith("/v2/bot/info")) return jsonResponse(200, { basicId: "@kesen", displayName: "ケセンメメント" });
    return jsonResponse(200, {});
  };
  return { fetch, calls, minted: () => minted };
}

describe("minted channel tokens", () => {
  test("the ID and secret mint a token with the documented form body, and calls carry it", async () => {
    const line = fakeLine();
    const api = createLineApi({ channelId: "1657000001", channelSecret: SECRET, fetch: line.fetch });
    expect(api.tokenSource).toBe("minted");
    const info = await api.botInfo();
    expect(info.basicId).toBe("@kesen");
    const [mint, call] = line.calls;
    expect(mint.url).toBe("https://api.line.me/oauth2/v3/token");
    expect(mint.opts.method).toBe("POST");
    expect(mint.opts.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    expect(Object.fromEntries(new URLSearchParams(mint.opts.body))).toEqual({
      grant_type: "client_credentials", client_id: "1657000001", client_secret: SECRET,
    });
    expect(mint.opts.headers.authorization).toBeUndefined();
    expect(call.url).toBe("https://api.line.me/v2/bot/info");
    expect(call.opts.headers.authorization).toBe("Bearer tok-1");
  });

  test("a token is reused until a minute before it expires, then a new one is minted", async () => {
    let clock = 1_000_000;
    const line = fakeLine({ expiresIn: 900 });
    const api = createLineApi({ channelId: "1657000001", channelSecret: SECRET, fetch: line.fetch, now: () => clock });
    await api.botInfo();
    clock += 839_000;           // 13 min 59 s: still inside the 14-minute window
    await api.quota();
    expect(line.minted()).toBe(1);
    clock += 2_000;             // past 14 min: the token has under a minute left
    await api.consumption();
    expect(line.minted()).toBe(2);
    expect(line.calls.at(-1).opts.headers.authorization).toBe("Bearer tok-2");
  });

  test("concurrent calls share one mint", async () => {
    const line = fakeLine();
    const api = createLineApi({ channelId: "1657000001", channelSecret: SECRET, fetch: line.fetch });
    await Promise.all([api.botInfo(), api.quota(), api.consumption(), api.push("Uuser", [{ type: "text", text: "x" }])]);
    expect(line.minted()).toBe(1);
    expect(line.calls.filter((c) => !c.url.endsWith("/oauth2/v3/token")).every((c) => c.opts.headers.authorization === "Bearer tok-1")).toBe(true);
  });

  test("a 401 mints a fresh token once and repeats the call; a second 401 is an error", async () => {
    const once = fakeLine({ reject: (auth) => auth === "Bearer tok-1" });
    const api = createLineApi({ channelId: "1657000001", channelSecret: SECRET, fetch: once.fetch });
    const info = await api.botInfo();
    expect(info.basicId).toBe("@kesen");
    expect(once.minted()).toBe(2);
    expect(once.calls.at(-1).opts.headers.authorization).toBe("Bearer tok-2");

    const always = fakeLine({ reject: () => true });
    const api2 = createLineApi({ channelId: "1657000001", channelSecret: SECRET, fetch: always.fetch });
    const err = await api2.botInfo().catch((e) => e);
    expect(err).toBeInstanceOf(LineApiError);
    expect(err.status).toBe(401);
    expect(always.minted()).toBe(2);
  });

  test("the push retry key survives a re-mint (the 401 send was not delivered)", async () => {
    const line = fakeLine({ reject: (auth, url) => auth === "Bearer tok-1" && url.endsWith("/push") });
    const api = createLineApi({ channelId: "1657000001", channelSecret: SECRET, fetch: line.fetch });
    await api.push("Uuser", [{ type: "text", text: "x" }]);
    const pushes = line.calls.filter((c) => c.url.endsWith("/v2/bot/message/push"));
    expect(pushes.length).toBe(2);
    expect(pushes[0].opts.headers["x-line-retry-key"]).toBe(pushes[1].opts.headers["x-line-retry-key"]);
  });

  test("a wrong ID or secret is a token error that names neither", async () => {
    const line = fakeLine({ mintStatus: 400 });
    const api = createLineApi({ channelId: "1657000001", channelSecret: SECRET, fetch: line.fetch });
    const err = await api.botInfo().catch((e) => e);
    expect(err).toBeInstanceOf(LineApiError);
    expect(err.status).toBe(400);
    expect(err.op).toBe("token");
    expect(String(err.message) + String(err.stack)).not.toContain(SECRET);
    expect(line.calls.length).toBe(1);
  });

  test("the ID wins over a fixed token (another channel's token left in the service is ignored)", async () => {
    const line = fakeLine();
    const api = createLineApi({ token: "old-channel-token", channelId: "1657000001", channelSecret: SECRET, fetch: line.fetch });
    await api.botInfo();
    expect(line.calls.at(-1).opts.headers.authorization).toBe("Bearer tok-1");
  });

  test("without an ID the fixed token is used as before, and nothing is minted", async () => {
    const line = fakeLine();
    const api = createLineApi({ token: "fixed-token", channelSecret: SECRET, fetch: line.fetch });
    expect(api.tokenSource).toBe("static");
    await api.botInfo();
    expect(line.minted()).toBe(0);
    expect(line.calls[0].opts.headers.authorization).toBe("Bearer fixed-token");
  });

  test("getWebhook reads the endpoint and the Use-webhook switch", async () => {
    const calls = [];
    const api = createLineApi({
      token: "fixed-token",
      fetch: async (url, opts) => { calls.push({ url: String(url), opts }); return jsonResponse(200, { endpoint: "https://x.example/webhook", active: false }); },
    });
    expect(await api.getWebhook()).toEqual({ endpoint: "https://x.example/webhook", active: false });
    expect(calls[0].url).toBe("https://api.line.me/v2/bot/channel/webhook/endpoint");
    expect(calls[0].opts.method).toBe("GET");
  });
});

describe("config with a channel ID", () => {
  const base = { LINE_CHANNEL_SECRET: SECRET, LINE_STORE_KEY: STORE_KEY, ADMIN_TOKEN: ADMIN };

  test("the ID and secret are enough; describeConfig says the token is minted and prints no secret", () => {
    const c = loadConfig({ ...base, LINE_CHANNEL_ID: "1657000001" });
    expect(c.channelId).toBe("1657000001");
    expect(c.channelAccessToken).toBe("");
    const d = describeConfig(c);
    expect(d.channelAccessToken).toBe("minted");
    expect(d.channelId).toBe("set");
    expect(JSON.stringify(d)).not.toContain(SECRET);
  });

  test("a fixed token alone still works", () => {
    const c = loadConfig({ ...base, LINE_CHANNEL_ACCESS_TOKEN: "fixed-token-abc" });
    expect(describeConfig(c).channelAccessToken).toBe("set");
    expect(describeConfig(c).channelId).toBe("unset");
  });

  test("neither an ID nor a token, or an ID that is not a number, is a ConfigError", () => {
    expect(() => loadConfig(base)).toThrow(ConfigError);
    try { loadConfig(base); } catch (e) { expect(e.problems).toContain("LINE_CHANNEL_ID (or LINE_CHANNEL_ACCESS_TOKEN) is required"); }
    try { loadConfig({ ...base, LINE_CHANNEL_ID: "@kesen" }); throw new Error("no error"); } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      expect(e.problems.join(" ")).toContain("LINE_CHANNEL_ID must be the channel's number");
    }
  });

  test("the secret is still required with an ID", () => {
    try { loadConfig({ LINE_CHANNEL_ID: "1657000001", LINE_STORE_KEY: STORE_KEY, ADMIN_TOKEN: ADMIN }); throw new Error("no error"); } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      expect(e.problems).toContain("LINE_CHANNEL_SECRET is required");
    }
  });
});

describe("PUBLIC_BASE_URL on Railway", () => {
  const base = {
    LINE_CHANNEL_ID: "1657000001",
    LINE_CHANNEL_SECRET: "channel-secret-test-value",
    LINE_STORE_KEY: Buffer.alloc(32, 7).toString("base64"),
    ADMIN_TOKEN: "admin-token-must-be-24ch",
    RAILWAY_ENVIRONMENT: "production",
  };

  test("unset, it is the service's own Railway domain", () => {
    const c = loadConfig({ ...base, RAILWAY_PUBLIC_DOMAIN: "Kesenmemento-Line-Production.up.railway.app" });
    expect(c.publicBaseUrl).toBe("https://kesenmemento-line-production.up.railway.app");
    expect(c.publicBaseUrlSource).toBe("railway");
    expect(describeConfig(c).publicBaseUrlSource).toBe("railway");
  });

  test("set, it wins; a malformed Railway domain is ignored", () => {
    const c = loadConfig({ ...base, PUBLIC_BASE_URL: "https://line.kesenmemento.com/", RAILWAY_PUBLIC_DOMAIN: "x.up.railway.app" });
    expect(c.publicBaseUrl).toBe("https://line.kesenmemento.com");
    expect(c.publicBaseUrlSource).toBe("env");
    const bad = loadConfig({ ...base, RAILWAY_PUBLIC_DOMAIN: "evil.example/path?x" });
    expect(bad.publicBaseUrl).toBe("");
    expect(bad.publicBaseUrlSource).toBe(null);
  });
});
