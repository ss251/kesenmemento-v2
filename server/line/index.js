// KesenMemento LINE bot. A standalone Bun service beside server/contrib and server/multi.
//
//   env -u NODE_OPTIONS bun server/line/index.js
//   env -u NODE_OPTIONS bun server/line/index.js --check
//
// POST /webhook   LINE events. 200, then process. Bad signatures are 401 with no body.
// GET  /healthz   { ok: true }
// GET  /privacy   the follow text and the data rules
// GET  /admin     team pages (HTTP Basic)
// POST /admin/setup  (HTTP Basic) the webhook, the rich menu and the add-friend link, with the server's own token

import { loadConfig, describeConfig, ConfigError, VERSION } from "./config.js";
import { createLogger } from "./log.js";
import { verifySignature } from "./signature.js";
import { openStore } from "./store.js";
import { createLineApi, quotaLeft } from "./api.js";
import { step, draftPaths, currentPrompt } from "./flows.js";
import { prepareImage, sampleJpeg } from "./media.js";
import { photoFail, tooBig, unsupported as unsupportedText, rateText, digestText } from "./strings.js";
import { createAdmin, privacyHtml, NO_STORE, adminAuthorized, unauthorized } from "./admin.js";
import { runSetup, RICH_MENU_PNG } from "./setup.js";
import { readFileSync, existsSync } from "node:fs";

export { loadConfig, createLogger, ConfigError, VERSION, quotaLeft };

function textMessage(text) {
  return { type: "text", text };
}

export function jstParts(now) {
  const parts = {};
  for (const p of new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(now))) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0;
  return { ymd: `${parts.year}-${parts.month}-${parts.day}`, hour, minute: Number(parts.minute) };
}

/** Midnight at the start of a Tokyo calendar day, as a UTC ISO string. */
export function jstMidnightIso(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - 9 * 60 * 60 * 1000).toISOString();
}

/**
 * One daily digest push at or after 20:00 JST, only when there were new reports.
 * @param {object} deps
 * @param {number} now
 */
export async function maybeDigest(deps, now = Date.now()) {
  const { store, api, config, log } = deps;
  if (!config.teamLineTo) return { sent: false, reason: "unset" };
  const parts = jstParts(now);
  if (parts.hour < 20) return { sent: false, reason: "early" };
  if (store.digestSent(parts.ymd)) return { sent: false, reason: "done" };
  const rows = store.listSince(jstMidnightIso(parts.ymd));
  if (!rows.length) {
    store.markDigest(parts.ymd, now);
    return { sent: false, reason: "empty" };
  }
  let left;
  try {
    left = quotaLeft(await api.quota(), await api.consumption());
  } catch (e) {
    log?.warn("digest.quota", { name: e?.name || "Error" });
    return { sent: false, reason: "quota" };
  }
  if (left.limited && left.left < 1) {
    store.markDigest(parts.ymd, now);
    log?.warn("digest.quota", { left: 0 });
    return { sent: false, reason: "empty-quota" };
  }
  const url = config.publicBaseUrl ? `${config.publicBaseUrl}/admin` : "";
  await api.push(config.teamLineTo, [textMessage(digestText(rows, url))]);
  store.markDigest(parts.ymd, now);
  log?.info("digest.sent", { count: rows.length });
  return { sent: true, count: rows.length };
}

/**
 * @param {Readonly<object>} config
 * @param {object} [deps]
 */
export function createApp(config, deps = {}) {
  const log = deps.logger || createLogger({ now: deps.now });
  const store = deps.store || openStore({ dataDir: config.dataDir, storeKey: config.storeKey });
  const outbox = deps.outbox || [];
  const api = deps.api || createLineApi({
    token: config.channelAccessToken,
    channelId: config.channelId,
    channelSecret: config.channelSecret,
    fetch: deps.fetch,
    apiBase: config.apiBase,
    dataBase: config.dataBase,
    timeoutMs: config.timeoutMs,
    sim: config.sim,
    outbox,
    simContent: () => sampleJpeg({ exif: true, w: 8, h: 6 }),
  });
  const admin = createAdmin(store, api, config, log);
  let chain = Promise.resolve();
  const timers = [];
  const startedAt = new Date((deps.now || Date.now)()).toISOString();

  function enqueue(fn) {
    const job = new Promise((resolve, reject) => {
      setTimeout(() => { Promise.resolve().then(fn).then(resolve, reject); }, 0);
    });
    chain = chain.then(() => job, () => job);
    return job;
  }

  async function safeReply(replyToken, messages) {
    if (!replyToken || !messages?.length) return;
    try {
      await api.reply(replyToken, messages.slice(0, 5));
    } catch (e) {
      log.warn("reply.failed", { name: e?.name || "Error", status: e?.status });
    }
  }

  async function hydrate(result) {
    const draft = result.session?.draft;
    if (!draft?.media) return result;
    const lang = result.session.lang === "en" ? "en" : "ja";
    const failures = [];
    const next = [];
    for (const item of draft.media) {
      if (!item?.messageId || item.path) {
        next.push(item);
        continue;
      }
      try {
        const bytes = await api.content(item.messageId);
        const prepared = prepareImage(bytes);
        next.push(store.saveImage(prepared));
      } catch (e) {
        const code = e?.code;
        failures.push(code === "too_big" ? tooBig(lang) : code === "not_image" ? unsupportedText(lang) : photoFail(lang));
        log.warn("media.failed", { name: e?.name || "Error", reason: code || "download" });
      }
    }
    draft.media = next;
    if (failures.length) {
      const prompt = currentPrompt(result.session);
      result.replies = failures.map(textMessage).concat(prompt ? [prompt] : []);
    }
    return result;
  }

  async function applyActions(result, ctx) {
    const kept = new Set(draftPaths(result.session));
    const leaves = [];
    let discord = null;
    const actions = result.actions || [];
    for (const action of actions) {
      if (action.type === "commit") {
        for (const m of action.draft.media || []) if (m.path) kept.add(m.path);
        if (store.reportsToday(ctx.userRef, ctx.now) >= config.reportsPerDay) {
          const bucket = String(Math.floor(ctx.now / 86_400_000));
          if (store.claimNotice(ctx.userRef, "reports", bucket)) {
            const refused = step(result.session, { type: "commit_refused", timestamp: ctx.now });
            result.session = refused.session;
            result.replies = result.replies.concat(refused.replies);
          }
          continue;
        }
        const media = (action.draft.media || []).filter((m) => m.path);
        const report = store.createReport({ ...action.draft, media }, ctx.userRef, ctx.now);
        const filed = step(result.session, { type: "committed", code: report.code, kind: action.draft.kind, timestamp: ctx.now });
        result.session = filed.session;
        result.replies = result.replies.concat(filed.replies);
        discord = { code: report.code, kind: action.draft.kind, text: action.draft.text || "" };
        log.info("report.created", { code: report.code, kind: action.draft.kind, user_ref: ctx.userRef });
      } else if (action.type === "erase") {
        const n = store.deleteUser(ctx.userRef);
        const erased = step(result.session, { type: "erased", count: n.reports, timestamp: ctx.now });
        result.session = erased.session;
        result.replies = result.replies.concat(erased.replies);
        log.info("user.erased", { count: n.reports, user_ref: ctx.userRef });
      } else if (action.type === "status") {
        const row = store.getReportForUser(ctx.userRef, action.code);
        const looked = step(result.session, {
          type: "status_result",
          found: Boolean(row),
          code: action.code,
          status: row?.status || null,
          timestamp: ctx.now,
        });
        result.session = looked.session;
        result.replies = result.replies.concat(looked.replies);
      } else if (action.type === "leave") {
        leaves.push(action);
      }
    }
    for (const p of ctx.before) {
      if (!kept.has(p) && !draftPaths(result.session).includes(p)) store.unlink(p);
    }
    return { result, leaves, discord };
  }

  async function notifyDiscord(report) {
    if (!config.discordWebhookUrl) return;
    const snippet = String(report.text || "").replace(/\s+/g, " ").trim().slice(0, 80);
    const kind = { bug: "バグ", fix: "町の間違い", photo: "写真", idea: "アイデア", other: "そのほか" }[report.kind] || report.kind;
    const link = config.publicBaseUrl ? `${config.publicBaseUrl}/admin/r/${report.code}` : "";
    const content = [report.code, kind, snippet, link].filter(Boolean).join(" ");
    try {
      await fetch(config.discordWebhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
        signal: AbortSignal.timeout(config.timeoutMs || 10_000),
        redirect: "error",
      });
    } catch (e) {
      log.warn("discord.failed", { name: e?.name || "Error", code: report.code });
    }
  }

  async function processEvent(event) {
    const id = event?.webhookEventId;
    if (id && !store.markEvent(String(id), Date.now())) return;
    const now = Number(event?.timestamp) || Date.now();
    const stamped = { ...event, timestamp: now };
    const source = event?.source || {};
    if (source.type === "group" || source.type === "room" || event?.type === "join" || event?.type === "memberJoined") {
      const result = step(null, stamped);
      await safeReply(event?.replyToken, result.replies);
      for (const action of result.actions || []) {
        if (action.type === "leave") {
          try { await api.leave(action.sourceType, action.sourceId); } catch (e) {
            log.warn("leave.failed", { name: e?.name || "Error" });
          }
        }
      }
      return;
    }
    const userId = source.userId;
    if (typeof userId !== "string" || !userId || userId.length > 80) return;
    const userRef = store.userRef(userId);
    store.upsertContact(userRef, userId, now);
    const session = store.loadSession(userRef);
    const gate = store.hitEvent(userRef, now, config.eventsPerMinute);
    if (!gate.ok) {
      const bucket = String(Math.floor(now / 60_000));
      if (store.claimNotice(userRef, "events", bucket)) {
        const lang = session?.lang === "en" ? "en" : "ja";
        await safeReply(event?.replyToken, [textMessage(rateText(lang))]);
      }
      return;
    }
    const before = draftPaths(session);
    let result = step(session, stamped);
    result = await hydrate(result);
    const applied = await applyActions(result, { userRef, now, before });
    result = applied.result;
    store.saveSession(userRef, result.session);
    await safeReply(event?.replyToken, result.replies);
    if (applied.discord) await notifyDiscord(applied.discord);
    for (const action of applied.leaves) {
      try { await api.leave(action.sourceType, action.sourceId); } catch (e) {
        log.warn("leave.failed", { name: e?.name || "Error" });
      }
    }
  }

  async function processBody(body) {
    const events = Array.isArray(body?.events) ? body.events : [];
    for (const event of events) {
      try {
        await processEvent(event);
      } catch (e) {
        log.error("event.failed", { name: e?.name || "Error" });
      }
    }
  }

  function startSchedule() {
    try { store.runRetention(Date.now()); } catch (e) { log.warn("retention.failed", { name: e?.name || "Error" }); }
    const digest = setInterval(() => {
      maybeDigest({ store, api, config, log }, Date.now()).catch((e) => log.warn("digest.failed", { name: e?.name || "Error" }));
    }, 60_000);
    const retain = setInterval(() => {
      try { store.runRetention(Date.now()); } catch (e) { log.warn("retention.failed", { name: e?.name || "Error" }); }
    }, 60 * 60 * 1000);
    if (digest.unref) digest.unref();
    if (retain.unref) retain.unref();
    timers.push(digest, retain);
  }

  return {
    store,
    api,
    outbox,
    log,
    startSchedule,
    settled: () => chain,
    async fetch(req) {
      const url = new URL(req.url);
      if (req.method === "GET" && (url.pathname === "/healthz" || url.pathname === "/health")) {
        return Response.json({ ok: true, service: "kesenmemento-line", version: VERSION }, { headers: { "cache-control": "no-store" } });
      }
      if (req.method === "GET" && url.pathname === "/privacy") {
        return new Response(privacyHtml(), {
          headers: { "content-type": "text/html; charset=utf-8", "x-content-type-options": "nosniff" },
        });
      }
      if (url.pathname === "/sim/outbox") {
        if (!config.sim) return new Response(null, { status: 404 });
        if (req.method !== "GET") return new Response(null, { status: 405 });
        return Response.json(outbox, { headers: { "cache-control": "no-store" } });
      }
      if (url.pathname === "/webhook" || url.pathname.startsWith("/admin")) {
        if (url.pathname === "/webhook") {
          if (req.method !== "POST") return new Response(null, { status: 405, headers: NO_STORE });
          const raw = Buffer.from(await req.arrayBuffer());
          if (!verifySignature(raw, req.headers.get("x-line-signature"), config.channelSecret)) {
            return new Response(null, { status: 401 });
          }
          let body;
          try { body = JSON.parse(raw.toString("utf8")); } catch { return new Response(null, { status: 400 }); }
          if (config.syncWebhook) {
            await processBody(body);
          } else {
            enqueue(() => processBody(body));
          }
          return new Response(null, { status: 200 });
        }
        if (url.pathname === "/admin/setup") {
          // [setup] the channel's webhook, rich menu and add-friend link, run here with the server's own token:
          // no secret leaves Railway, and a network that cannot reach LINE does not matter
          if (req.method !== "POST") return new Response(null, { status: 405, headers: NO_STORE });
          if (!adminAuthorized(req, config.adminToken)) return unauthorized();
          try {
            const png = existsSync(RICH_MENU_PNG) ? readFileSync(RICH_MENU_PNG) : null;
            // the base is checked from here first, so a domain whose DNS is not set yet never becomes the webhook
            const probe = deps.probe || deps.fetch || globalThis.fetch;
            const out = await runSetup({ api, publicBaseUrl: config.publicBaseUrl, png, probe });
            log.info("setup.done", { basicId: out.basicId, richMenuId: out.richMenuId, webhookActive: out.webhookActive, token: out.tokenSource });
            return Response.json(out, { headers: NO_STORE });
          } catch (e) {
            log.warn("setup.failed", { reason: String(e?.message || e).slice(0, 160) });
            return Response.json({ error: String(e?.message || e) }, { status: 502, headers: NO_STORE });
          }
        }
        if (url.pathname === "/admin/status") {
          // [status] which channel this deployment runs on, so a person or tools/line/connect.mjs can tell when
          // new variables are live. The channel ID is not a secret (it is in every add-friend handoff); nothing else is shown.
          if (req.method !== "GET") return new Response(null, { status: 405, headers: NO_STORE });
          if (!adminAuthorized(req, config.adminToken)) return unauthorized();
          return Response.json({
            ok: true,
            service: "kesenmemento-line",
            version: VERSION,
            channelId: config.channelId || null,
            tokenSource: api.tokenSource || null,
            publicBaseUrl: config.publicBaseUrl || null,
            publicBaseUrlSource: config.publicBaseUrlSource || null,
            startedAt,
          }, { headers: NO_STORE });
        }
        return admin.handle(req, url);
      }
      return new Response(null, { status: 404, headers: NO_STORE });
    },
    close() {
      for (const t of timers) clearInterval(t);
      try { store.close(); } catch { /* already closed */ }
    },
  };
}

/**
 * @param {Record<string, any>} [opts]
 */
export function start(opts = {}) {
  const { env, logger, now, fetch: fetchImpl, store, api, ...overrides } = opts;
  const config = opts.config || loadConfig(env ?? process.env, overrides);
  const app = createApp(config, { logger, now, fetch: fetchImpl, store, api, outbox: opts.outbox });
  if (opts.schedule !== false) app.startSchedule();
  const server = Bun.serve({
    port: config.port,
    hostname: config.host,
    maxRequestBodySize: 1024 * 1024,
    fetch: (req) => app.fetch(req),
    error: () => new Response(null, { status: 500 }),
  });
  const url = `http://${config.host === "0.0.0.0" ? "127.0.0.1" : config.host}:${server.port}`;
  app.log.info("server.started", { service: "kesenmemento-line", version: VERSION, port: server.port, host: config.host });
  return {
    server, url, port: server.port, app, config,
    async stop() {
      await server.stop(true);
      app.close();
    },
  };
}

if (import.meta.main) {
  try {
    if (process.argv.includes("--check")) {
      console.log(JSON.stringify(describeConfig(loadConfig(process.env, {})), null, 2));
      process.exit(0);
    }
    const running = start();
    const stop = async (sig) => {
      running.app.log.info("server.stopping", { reason: sig });
      await running.stop();
      process.exit(0);
    };
    process.on("SIGTERM", () => stop("SIGTERM"));
    process.on("SIGINT", () => stop("SIGINT"));
  } catch (e) {
    if (e instanceof ConfigError) {
      console.error(e.message);
      process.exit(1);
    }
    console.error(`startup failed: ${e?.name ?? "Error"}`);
    process.exit(1);
  }
}
