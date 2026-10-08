// LINE Messaging API over fetch. No SDK.
//
// Checked against the OpenAPI at https://github.com/line/line-openapi (messaging-api.yml) on 2026-10-08.
// Content and rich-menu image uploads use https://api-data.line.me. Everything else uses https://api.line.me.
// Calls time out after 10s and retry once on a 5xx or a network error. A 4xx is not retried.
// Push sends X-Line-Retry-Key (a UUID) and reuses it on the retry, so a 5xx after a successful send
// is not delivered twice. Reply has no retry-key header in the current API.
// The bearer token is either fixed (LINE_CHANNEL_ACCESS_TOKEN) or minted from the channel ID and secret:
// POST /oauth2/v3/token (channel-access-token.yml, issueStatelessChannelToken) gives a 15-minute token with no cap
// on active tokens, so the bot never needs a long-lived one. A minted token is reused until a minute before it
// expires, and a 401 mints a fresh one once.

import { randomUUID } from "node:crypto";

export class LineApiError extends Error {
  /** @param {number} status */
  constructor(status) {
    super(`line api ${status}`);
    this.name = "LineApiError";
    this.status = status;
  }
}

/**
 * @param {object} opts
 * @param {string} [opts.token] a fixed channel access token
 * @param {string} [opts.channelId] with opts.channelSecret: mint tokens instead (wins over opts.token)
 * @param {string} [opts.channelSecret]
 * @param {() => number} [opts.now]
 * @param {typeof fetch} [opts.fetch]
 * @param {string} [opts.apiBase]
 * @param {string} [opts.dataBase]
 * @param {number} [opts.timeoutMs]
 * @param {boolean} [opts.sim] record replies locally and do not call LINE
 * @param {object[]} [opts.outbox]
 * @param {() => Uint8Array} [opts.simContent]
 */
export function createLineApi(opts) {
  const fetchImpl = opts.fetch || globalThis.fetch;
  const apiBase = (opts.apiBase || "https://api.line.me").replace(/\/+$/, "");
  const dataBase = (opts.dataBase || "https://api-data.line.me").replace(/\/+$/, "");
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const sim = Boolean(opts.sim);
  const outbox = opts.outbox || [];
  const auth = tokenSource(opts, fetchImpl, apiBase, timeoutMs);

  async function send(url, { method = "GET", json, body, contentType, retryKey } = {}) {
    let lastStatus = 0;
    let lastError = null;
    let reminted = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const headers = { authorization: `Bearer ${await auth.get()}` };
        if (retryKey) headers["x-line-retry-key"] = retryKey;
        let payload = body;
        // a POST/PUT with no body still sends Content-Length: 0 (LINE's edge answers 411 Length Required otherwise)
        if (payload === undefined && json === undefined && (method === "POST" || method === "PUT")) payload = "";
        if (json !== undefined) {
          headers["content-type"] = "application/json";
          payload = JSON.stringify(json);
        } else if (contentType) {
          headers["content-type"] = contentType;
        }
        const res = await fetchImpl(url, {
          method,
          headers,
          body: payload,
          signal: AbortSignal.timeout(timeoutMs),
          redirect: "error",
        });
        if (res.status === 401 && auth.kind === "minted" && !reminted) {
          // [mint] the edge no longer takes this token (expired early, or the secret was reissued): mint once more, same attempt
          reminted = true;
          auth.invalidate();
          await res.arrayBuffer().catch(() => {});
          attempt--;
          continue;
        }
        if (res.status >= 500 && attempt === 0) {
          lastStatus = res.status;
          await res.arrayBuffer().catch(() => {});
          continue;
        }
        if (res.status < 200 || res.status >= 300) throw new LineApiError(res.status);
        return res;
      } catch (e) {
        if (e instanceof LineApiError) throw e;
        lastError = e;
        if (attempt === 0) continue;
        const err = new LineApiError(lastStatus || 0);
        err.name = e?.name || "LineApiError";
        throw err;
      }
    }
    throw new LineApiError(lastStatus || 0);
  }

  async function readJson(res) {
    const text = await res.text();
    if (!text) return {};
    try { return JSON.parse(text); } catch { return {}; }
  }

  return {
    outbox,
    /** "minted" (channel ID + secret) or "static" (a fixed token); never the token itself */
    tokenSource: auth.kind,

    async reply(replyToken, messages) {
      const slice = (messages || []).slice(0, 5);
      if (sim) {
        outbox.push({ op: "reply", replyToken, messages: slice });
        return { ok: true };
      }
      const res = await send(`${apiBase}/v2/bot/message/reply`, { method: "POST", json: { replyToken, messages: slice } });
      return readJson(res);
    },

    async push(to, messages) {
      const slice = (messages || []).slice(0, 5);
      if (sim) {
        outbox.push({ op: "push", to, messages: slice });
        return { ok: true };
      }
      const retryKey = randomUUID();
      const res = await send(`${apiBase}/v2/bot/message/push`, {
        method: "POST",
        json: { to, messages: slice },
        retryKey,
      });
      return readJson(res);
    },

    async content(messageId) {
      if (sim) {
        const bytes = opts.simContent ? opts.simContent() : new Uint8Array();
        return Buffer.from(bytes);
      }
      const res = await send(`${dataBase}/v2/bot/message/${encodeURIComponent(messageId)}/content`);
      const len = Number(res.headers.get("content-length") || 0);
      if (len > 10 * 1024 * 1024) {
        await res.body?.cancel?.();
        const err = new Error("too_big");
        err.code = "too_big";
        throw err;
      }
      const reader = res.body?.getReader?.();
      if (!reader) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 10 * 1024 * 1024) {
          const err = new Error("too_big");
          err.code = "too_big";
          throw err;
        }
        return buf;
      }
      const chunks = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > 10 * 1024 * 1024) {
          await reader.cancel();
          const err = new Error("too_big");
          err.code = "too_big";
          throw err;
        }
        chunks.push(Buffer.from(value));
      }
      return Buffer.concat(chunks);
    },

    async quota() {
      if (sim) return { type: "limited", value: 200 };
      const res = await send(`${apiBase}/v2/bot/message/quota`);
      return readJson(res);
    },

    async consumption() {
      if (sim) return { totalUsage: outbox.filter((item) => item.op === "push").length };
      const res = await send(`${apiBase}/v2/bot/message/quota/consumption`);
      return readJson(res);
    },

    async createRichMenu(body) {
      const res = await send(`${apiBase}/v2/bot/richmenu`, { method: "POST", json: body });
      return readJson(res);
    },

    async uploadRichMenuImage(richMenuId, bytes, mime) {
      const res = await send(`${dataBase}/v2/bot/richmenu/${encodeURIComponent(richMenuId)}/content`, {
        method: "POST",
        body: bytes,
        contentType: mime,
      });
      await res.arrayBuffer().catch(() => {});
      return { ok: true };
    },

    async setDefaultRichMenu(richMenuId) {
      const res = await send(`${apiBase}/v2/bot/user/all/richmenu/${encodeURIComponent(richMenuId)}`, { method: "POST" });
      await res.arrayBuffer().catch(() => {});
      return { ok: true };
    },

    async listRichMenus() {
      const res = await send(`${apiBase}/v2/bot/richmenu/list`);
      return readJson(res);
    },

    async deleteRichMenu(richMenuId) {
      const res = await send(`${apiBase}/v2/bot/richmenu/${encodeURIComponent(richMenuId)}`, { method: "DELETE" });
      await res.arrayBuffer().catch(() => {});
      return { ok: true };
    },

    async setWebhook(endpoint) {
      const res = await send(`${apiBase}/v2/bot/channel/webhook/endpoint`, { method: "PUT", json: { endpoint } });
      await res.arrayBuffer().catch(() => {});
      return { ok: true };
    },

    /** { endpoint, active }: `active` is the console's "Use webhook" switch, which the API cannot turn on */
    async getWebhook() {
      const res = await send(`${apiBase}/v2/bot/channel/webhook/endpoint`);
      return readJson(res);
    },

    async testWebhook(endpoint) {
      const res = await send(`${apiBase}/v2/bot/channel/webhook/test`, { method: "POST", json: { endpoint } });
      return readJson(res);
    },

    async botInfo() {
      const res = await send(`${apiBase}/v2/bot/info`);
      return readJson(res);
    },

    async leave(sourceType, sourceId) {
      if (!sourceId) return { ok: false };
      if (sim) {
        outbox.push({ op: "leave", sourceType, sourceId });
        return { ok: true };
      }
      const path = sourceType === "room"
        ? `${apiBase}/v2/bot/room/${encodeURIComponent(sourceId)}/leave`
        : `${apiBase}/v2/bot/group/${encodeURIComponent(sourceId)}/leave`;
      const res = await send(path, { method: "POST" });
      await res.arrayBuffer().catch(() => {});
      return { ok: true };
    },
  };
}

/**
 * The bearer token for each call. With a channel ID and secret: a stateless token from POST /oauth2/v3/token
 * (form-encoded grant_type=client_credentials, client_id, client_secret), cached until 60 s before its expires_in,
 * one mint shared by concurrent callers. Otherwise the fixed token. A failed mint is a LineApiError with op "token";
 * neither the secret nor a token is ever part of an error.
 */
function tokenSource(opts, fetchImpl, apiBase, timeoutMs) {
  const channelId = String(opts.channelId ?? "").trim();
  const channelSecret = String(opts.channelSecret ?? "").trim();
  if (!channelId || !channelSecret) {
    const fixed = opts.token;
    return { kind: "static", get: async () => fixed, invalidate() {} };
  }
  const now = opts.now || Date.now;
  let cached = null;
  let pending = null;
  const failed = (status) => {
    const err = new LineApiError(status);
    err.op = "token";
    return err;
  };
  async function mint() {
    const res = await fetchImpl(`${apiBase}/oauth2/v3/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: channelId, client_secret: channelSecret }).toString(),
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "error",
    });
    if (res.status < 200 || res.status >= 300) {
      await res.arrayBuffer().catch(() => {});
      throw failed(res.status);
    }
    const body = await res.json().catch(() => null);
    if (!body?.access_token) throw failed(res.status);
    const life = Math.max(0, Number(body.expires_in) || 0) * 1000;
    cached = { token: String(body.access_token), until: now() + Math.max(0, life - 60_000) };
    return cached.token;
  }
  return {
    kind: "minted",
    async get() {
      if (cached && now() < cached.until) return cached.token;
      if (!pending) pending = mint().finally(() => { pending = null; });
      return pending;
    },
    invalidate() { cached = null; },
  };
}

/**
 * How many pushes are left this month.
 * type "none" is unlimited. type "limited" uses value minus totalUsage.
 * @param {{ type?: string, value?: number }} quota
 * @param {{ totalUsage?: number }} consumption
 */
export function quotaLeft(quota, consumption) {
  const used = Number(consumption?.totalUsage) || 0;
  if (quota?.type === "none") return { limited: false, used, left: null, value: null };
  const value = Number(quota?.value) || 0;
  return { limited: true, used, value, left: Math.max(0, value - used) };
}
