// Connect a LINE Official Account to the deployed bot, end to end (issue #5, path B). One command after the account exists:
//
//   env -u NODE_OPTIONS bun tools/line/connect.mjs           LINE check, Railway variables, redeploy, setup, line.json, live test, handoff
//   env -u NODE_OPTIONS bun tools/line/connect.mjs --check   the LINE check only: is this channel ready? Needs no Railway access.
//
// 1. LINE: mint a token with the channel ID + secret, read the bot's info (basic ID, name) and the webhook switch.
// 2. Railway: put LINE_CHANNEL_ID and LINE_CHANNEL_SECRET on the service (the secret through stdin, never argv), make
//    PUBLIC_BASE_URL a base that reaches the service, drop a stale LINE_CHANNEL_ACCESS_TOKEN, redeploy, and wait until
//    GET /admin/status runs the new channel.
// 3. POST /admin/setup on the service: webhook, rich menu, add-friend link.
// 4. data/play/line.json gets the basic ID, which turns on 「LINEで送る」 on the 「まちで見つけよう」 cards.
// 5. The live test: a QR to add the bot, then /admin/export.csv is watched until a bug report and a 「けしき V07」 photo arrive.
// 6. The handoff comment for the issue, filled in.
//
// The secret is asked without echo (or read from LINE_CHANNEL_SECRET) and goes only to api.line.me and to `railway variable
// set --stdin`. ADMIN_TOKEN is read from the service's variables in memory. Neither is printed, logged or written.
//
// Flags: --service <name> (default kesenmemento-line), --project <id>, --environment <name>, --deploy (upload this checkout
// with `railway up` instead of redeploying the current build), --provider <name> (for the handoff), --handoff <file>,
// --no-watch, --yes (do not ask before changing Railway), --check.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createLineApi } from "../../server/line/api.js";
import { checkBase, explainSetupError } from "../../server/line/setup.js";
import { qrEncode } from "../../src/anime/ui/qr.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "../..");
export const LINE_JSON = join(ROOT, "data/play/line.json");
export const ACCOUNT_NAME = "ケセンメメント";
const WAIT_LIVE_MS = 8 * 60_000;
const WAIT_WATCH_MS = 15 * 60_000;

export class ConnectError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConnectError";
  }
}

/** @param {string[]} argv */
export function parseArgs(argv) {
  const o = { service: "kesenmemento-line", project: "", environment: "", deploy: false, provider: "", handoff: "", watch: true, yes: false, check: false };
  const value = (i, name) => {
    const v = argv[i + 1];
    if (!v || v.startsWith("--")) throw new ConnectError(`${name} needs a value`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--check") o.check = true;
    else if (a === "--deploy") o.deploy = true;
    else if (a === "--no-watch") o.watch = false;
    else if (a === "--yes" || a === "-y") o.yes = true;
    else if (a === "--service") o.service = value(i++, a);
    else if (a === "--project") o.project = value(i++, a);
    else if (a === "--environment") o.environment = value(i++, a);
    else if (a === "--provider") o.provider = value(i++, a);
    else if (a === "--handoff") o.handoff = value(i++, a);
    else if (a === "--help" || a === "-h") o.help = true;
    else throw new ConnectError(`unknown flag ${a} (see the top of tools/line/connect.mjs)`);
  }
  return o;
}

/** A LINE basic ID as the add-friend and oaMessage links take it: @ and 1–20 of [0-9a-z._-]. */
export function validBasicId(id) {
  return /^@[0-9a-z._-]{1,20}$/i.test(String(id || ""));
}

/** Rows of a CSV (RFC 4180: quoted cells, doubled quotes, newlines inside quotes), as objects keyed by the header. */
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  const s = String(text || "").replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [header, ...body] = rows.filter((r) => r.length > 1 || r[0]);
  if (!header) return [];
  return body.map((r) => Object.fromEntries(header.map((k, i) => [k, r[i] ?? ""])));
}

/** The QR as terminal text: two modules per character, dark on light whatever the terminal's colours. */
export function qrTerminal(text, { border = 2, color = true } = {}) {
  const qr = qrEncode(text);
  const n = qr.size + border * 2;
  const dark = (x, y) => x >= border && y >= border && x < n - border && y < n - border && qr.modules[y - border][x - border];
  const lines = [];
  for (let y = 0; y < n; y += 2) {
    let line = "";
    for (let x = 0; x < n; x++) {
      const top = dark(x, y), bottom = y + 1 < n && dark(x, y + 1);
      line += top && bottom ? "█" : top ? "▀" : bottom ? "▄" : " ";
    }
    lines.push(color ? `\x1b[30;47m${line}\x1b[0m` : line);
  }
  return lines.join("\n");
}

/** The handoff comment from issue #5, filled in with what this run knows. Blanks stay blanks: nothing is guessed. */
export function handoffText(h) {
  const v = (x, blank = "___") => (x === undefined || x === null || x === "" ? blank : String(x));
  const yn = (x) => (x === true ? "yes" : x === false ? "no" : "___");
  const onOff = (x) => (x === true ? "on" : x === false ? "off" : "on/off");
  const lines = [
    "### LINE handoff",
    `- Official Account: ${v(h.displayName, "________")} · @ID: ${v(h.basicId, "@________")} · provider: ${v(h.provider, "________")}`,
    `- Channel ID: ${v(h.channelId, "________")} (secret: NOT included; Sailesh added as Admin: ${yn(h.sailesh)})`,
    `- 応答設定: Webhook ${onOff(h.webhookActive)} · 応答メッセージ on/off · あいさつメッセージ on/off`,
    `- Railway variables set: ${yn(h.railwaySet)} (by: ${v(h.railwayBy, "____")})`,
    `- POST /admin/setup: HTTP ${v(h.setupStatus)} · webhookActive: ${v(h.setupWebhookActive)} · richMenuId: ${v(h.richMenuId)}`,
    `- Live test: follow ${yn(h.follow)} · bug report ${v(h.bugCode)} · けしき V07 photo ${v(h.viewCode)}`,
    `- data/play/line.json basicId: ${h.lineJson ? "set locally, PR #___" : "not yet"}`,
    `- Open items:${h.open?.length ? "" : " none"}`,
    ...(h.open || []).map((x) => `  - ${x}`),
  ];
  return lines.join("\n");
}

/**
 * Step 1: what LINE says about this channel. Throws a ConnectError a person can act on.
 * @returns {Promise<{ basicId: string, displayName: string, webhookActive: boolean | null, webhookEndpoint: string, quota: string }>}
 */
export async function checkChannel({ channelId, channelSecret, fetch, apiBase }) {
  if (!/^\d{6,12}$/.test(channelId)) throw new ConnectError("the channel ID is the number under LINE Developers → the channel → チャネル基本設定 (Channel ID)");
  if (!channelSecret || /\s/.test(channelSecret)) throw new ConnectError("the channel secret is empty or has spaces; copy it again from チャネル基本設定 (Channel secret)");
  const api = createLineApi({ channelId, channelSecret, fetch, apiBase });
  let info;
  try {
    info = await api.botInfo();
  } catch (e) {
    throw new ConnectError(explainSetupError(e, "bot info").replace(/run the setup again$/, "try again"));
  }
  if (!validBasicId(info?.basicId)) throw new ConnectError("LINE answered, but without a basic ID (@…); is this a Messaging API channel?");
  const displayName = String(info.displayName || "");
  // issue #5: never the Reel Deal / UMI account
  if (/\bumi\b|reel\s*deal/i.test(displayName)) throw new ConnectError(`this channel is 「${displayName}」; issue #5 says not to reuse the Reel Deal / UMI account`);
  let webhookActive = null, webhookEndpoint = "";
  try {
    const hook = await api.getWebhook();
    if (typeof hook?.active === "boolean") webhookActive = hook.active;
    webhookEndpoint = String(hook?.endpoint || "");
  } catch { /* the switch is reported as unknown */ }
  let quota = "";
  try {
    const q = await api.quota();
    quota = q?.type === "none" ? "unlimited" : Number.isFinite(q?.value) ? `${q.value} a month` : "";
  } catch { /* informational */ }
  return { basicId: info.basicId, displayName, webhookActive, webhookEndpoint, quota };
}

/** `railway variable list --json` as a flat { KEY: value } map, whichever of the CLI's shapes it prints. */
export function parseRailwayVars(stdout) {
  let data;
  try { data = JSON.parse(stdout); } catch { throw new ConnectError("railway variable list did not print JSON; update the Railway CLI"); }
  if (Array.isArray(data)) return Object.fromEntries(data.map((x) => [x.name ?? x.key, x.value]));
  if (data && typeof data === "object" && data.variables && typeof data.variables === "object") return parseRailwayVars(JSON.stringify(data.variables));
  if (data && typeof data === "object") return data;
  throw new ConnectError("railway variable list printed an unexpected shape");
}

/**
 * @param {string[]} argv
 * @param {object} io  every effect, so the whole run is testable without LINE, Railway or a terminal:
 *   env, fetch, railway(args, { input }) → { code, stdout, stderr }, ask(question) → string, askSecret(question) → string,
 *   say(line), sleep(ms), now(), readFile(path), writeFile(path, text), color
 * @returns {Promise<{ ok: boolean, handoff?: string, basicId?: string }>}
 */
export async function connect(argv, io) {
  const o = parseArgs(argv);
  const say = io.say;
  if (o.help) {
    say("usage: bun tools/line/connect.mjs [--check] [--service kesenmemento-line] [--project <id>] [--environment <name>] [--deploy] [--provider <name>] [--handoff <file>] [--no-watch] [--yes]");
    return { ok: true };
  }
  const h = { open: [], provider: o.provider };

  // 1. LINE
  say("1. LINE");
  const channelId = String(io.env.LINE_CHANNEL_ID || (await io.ask("   チャネルID (Channel ID): ")) || "").trim();
  const channelSecret = String(io.env.LINE_CHANNEL_SECRET || (await io.askSecret("   チャネルシークレット (Channel secret, hidden): ")) || "").trim();
  const ch = await checkChannel({ channelId, channelSecret, fetch: io.fetch, apiBase: io.env.LINE_API_BASE });
  Object.assign(h, { channelId, basicId: ch.basicId, displayName: ch.displayName, webhookActive: ch.webhookActive });
  say(`   ✓ the ID and secret mint a token; Messaging API on`);
  say(`   ${ch.displayName === ACCOUNT_NAME ? "✓" : "!"} ${ch.displayName || "(no name)"} ${ch.basicId}${ch.displayName === ACCOUNT_NAME ? "" : `  (issue #5 names it ${ACCOUNT_NAME})`}`);
  if (ch.displayName !== ACCOUNT_NAME) h.open.push(`the account is named 「${ch.displayName}」, not 「${ACCOUNT_NAME}」 (LINE Official Account Manager → 設定 → アカウント設定)`);
  if (ch.webhookActive === false) {
    say("   ! Webhook is off: LINE Official Account Manager → 設定 → 応答設定 → Webhook をオン");
    h.open.push("turn Webhook on (応答設定)");
  } else if (ch.webhookActive) say("   ✓ Webhook on");
  if (ch.quota) say(`   · push quota ${ch.quota}`);
  if (o.check) {
    say(ch.webhookActive === false
      ? "\nAlmost ready: turn Webhook on, then run this again without --check (or hand off: issue #5, path A step 4)."
      : "\nThe channel is ready. Run this again without --check, or hand off (issue #5, path A step 4).");
    return { ok: true, basicId: ch.basicId };
  }

  // 2. Railway
  say("2. Railway");
  const scope = ["--service", o.service, ...(o.project ? ["--project", o.project] : []), ...(o.environment ? ["--environment", o.environment] : [])];
  const who = await io.railway(["whoami"]);
  if (who.code !== 0) throw new ConnectError("the Railway CLI is not logged in: run `railway login`, then this again");
  h.railwayBy = (/Logged in as (.+?)(?: \(|$)/m.exec(who.stdout)?.[1] || "").trim();
  const listed = await io.railway(["variable", "list", ...scope, "--json"]);
  if (listed.code !== 0) {
    throw new ConnectError(`your Railway login cannot see the service ${o.service}. Ask for an invite to its project (issue #5, path B step 2), then \`railway link\` in this checkout (or pass --project)`);
  }
  const vars = parseRailwayVars(listed.stdout);
  const adminToken = String(vars.ADMIN_TOKEN || "");
  if (!adminToken) throw new ConnectError(`${o.service} has no ADMIN_TOKEN; it cannot be the LINE bot (see server/line/README.md, Environment)`);

  const candidates = [];
  if (vars.PUBLIC_BASE_URL) candidates.push(String(vars.PUBLIC_BASE_URL).replace(/\/+$/, ""));
  if (vars.RAILWAY_PUBLIC_DOMAIN) candidates.push(`https://${String(vars.RAILWAY_PUBLIC_DOMAIN).toLowerCase()}`);
  let base = "";
  const misses = [];
  for (const c of [...new Set(candidates)]) {
    try { await checkBase(io.fetch, c); base = c; break; } catch (e) { misses.push(e.message); }
  }
  if (!base) {
    throw new ConnectError(candidates.length
      ? `the service does not answer at any of its addresses:\n   - ${misses.join("\n   - ")}`
      : `${o.service} has neither PUBLIC_BASE_URL nor a Railway domain: Railway → the service → Settings → Networking → Generate Domain`);
  }
  say(`   ✓ ${o.service} answers at ${base}${h.railwayBy ? ` (as ${h.railwayBy})` : ""}`);
  for (const m of misses) say(`   ! ${m}`);

  const changes = [];
  if (String(vars.LINE_CHANNEL_ID || "") !== channelId) changes.push({ key: "LINE_CHANNEL_ID", value: channelId, shown: channelId });
  if (String(vars.LINE_CHANNEL_SECRET || "") !== channelSecret) changes.push({ key: "LINE_CHANNEL_SECRET", value: channelSecret, shown: "(hidden, through stdin)" });
  if (String(vars.PUBLIC_BASE_URL || "").replace(/\/+$/, "") !== base) changes.push({ key: "PUBLIC_BASE_URL", value: base, shown: base });
  const dropToken = Object.prototype.hasOwnProperty.call(vars, "LINE_CHANNEL_ACCESS_TOKEN");

  if (changes.length || dropToken || o.deploy) {
    say(`   ${o.service} will get:`);
    for (const c of changes) say(`     ${c.key} = ${c.shown}`);
    if (dropToken) say("     LINE_CHANNEL_ACCESS_TOKEN removed (the ID + secret replace it)");
    say(o.deploy ? "     then this checkout is uploaded (railway up)" : "     then one redeploy");
    if (!o.yes) {
      const yes = String(await io.ask("   Go ahead? [y/N] ")).trim().toLowerCase();
      if (yes !== "y" && yes !== "yes") throw new ConnectError("stopped before changing Railway; nothing was changed");
    }
    for (const c of changes) {
      const r = await io.railway(["variable", "set", c.key, "--stdin", "--skip-deploys", ...scope], { input: c.value });
      if (r.code !== 0) throw new ConnectError(`railway could not set ${c.key} (exit ${r.code})`);
      say(`   ✓ ${c.key} set`);
    }
    if (dropToken) {
      const r = await io.railway(["variable", "delete", "LINE_CHANNEL_ACCESS_TOKEN", ...scope]);
      if (r.code !== 0) throw new ConnectError(`railway could not remove LINE_CHANNEL_ACCESS_TOKEN (exit ${r.code})`);
      say("   ✓ LINE_CHANNEL_ACCESS_TOKEN removed");
    }
    const r = o.deploy
      ? await io.railway(["up", "--detach", ...scope])
      : await io.railway(["redeploy", "--yes", ...scope]);
    if (r.code !== 0) throw new ConnectError(`railway ${o.deploy ? "up" : "redeploy"} failed (exit ${r.code}); the variables are set, run this again`);
    say(`   ✓ ${o.deploy ? "upload" : "redeploy"} started`);
  } else {
    say("   ✓ the variables already name this channel");
  }
  h.railwaySet = true;

  // wait until the service runs this channel: GET /admin/status (this build) names it; an older build has no
  // /admin/status, and then the setup itself is retried while LINE still refuses the old deployment's token
  const auth = { authorization: `Basic ${Buffer.from(`team:${adminToken}`).toString("base64")}` };
  const deadline = io.now() + WAIT_LIVE_MS;
  let knowsStatus = true;
  say("   … waiting for the deployment to run the new channel");
  while (true) {
    let res = null;
    try { res = await io.fetch(`${base}/admin/status`, { headers: auth, redirect: "error" }); } catch { /* deploying */ }
    if (res?.status === 404) { knowsStatus = false; break; }
    if (res?.status === 401) throw new ConnectError("the service refused ADMIN_TOKEN from its own variables; it changed mid-run, run this again");
    const body = res?.ok ? await res.json().catch(() => null) : null;
    if (body?.channelId === channelId) break;
    if (io.now() > deadline) throw new ConnectError(`the deployment did not come up on the new channel within 8 minutes; see \`railway logs --service ${o.service}\``);
    await io.sleep(5_000);
  }
  say(knowsStatus ? "   ✓ live on the new channel" : "   · this build has no /admin/status; the setup retries until it runs the new channel");

  // 3. setup
  say("3. Setup (webhook, rich menu, add-friend link)");
  let setup;
  while (true) {
    let res = null, body = null;
    try {
      res = await io.fetch(`${base}/admin/setup`, { method: "POST", headers: auth, redirect: "error" });
      body = await res.json().catch(() => null);
    } catch { /* deploying */ }
    if (res?.status === 200 && body?.basicId) { setup = body; h.setupStatus = 200; break; }
    const err = String(body?.error || (res ? `HTTP ${res.status}` : "no answer"));
    const stale = !knowsStatus && /line api (401|403)/.test(err);
    if ((stale || !res) && io.now() < deadline) { await io.sleep(10_000); continue; }
    h.setupStatus = res?.status ?? null;
    throw new ConnectError(`POST /admin/setup → ${res ? `HTTP ${res.status}` : "no answer"}: ${err}`);
  }
  if (setup.basicId !== ch.basicId) throw new ConnectError(`the service set up ${setup.basicId}, but this channel is ${ch.basicId}: two channels are mixed up, nothing was written`);
  Object.assign(h, { setupWebhookActive: setup.webhookActive, richMenuId: setup.richMenuId, webhookActive: setup.webhookActive ?? h.webhookActive });
  say(`   ✓ webhook ${setup.webhook}${setup.webhookActive === false ? " (set and tested; its switch is still off)" : ""}`);
  say(`   ✓ rich menu ${setup.richMenuId}`);
  for (const t of setup.todo || []) { say(`   ! ${t}`); h.open.push(t); }

  // 4. data/play/line.json
  say("4. App");
  const linePath = io.linePath || LINE_JSON;
  let current = {};
  try { current = JSON.parse(io.readFile(linePath)); } catch { /* written fresh */ }
  if (current.basicId === setup.basicId) say(`   ✓ ${relative(ROOT, linePath)} already has ${setup.basicId}`);
  else {
    io.writeFile(linePath, JSON.stringify({ ...current, basicId: setup.basicId }, null, 2) + "\n");
    say(`   ✓ ${relative(ROOT, linePath)} → "basicId": "${setup.basicId}" (「LINEで送る」 shows once this is merged and deployed)`);
  }
  h.lineJson = true;

  // 5. live test
  say("5. Live test");
  say(`   Add the bot from your phone: ${setup.addFriendUrl}`);
  say(qrTerminal(setup.addFriendUrl, { color: io.color !== false }).replace(/^/gm, "   "));
  if (!o.watch) {
    say("   · skipped (--no-watch): send a bug report and 「けしき V07」 with a photo, then check /admin");
    h.open.push("live test not watched by connect.mjs");
  } else {
    const csv = async () => {
      const res = await io.fetch(`${base}/admin/export.csv`, { headers: auth, redirect: "error" });
      if (!res.ok) throw new ConnectError(`GET /admin/export.csv → HTTP ${res.status}`);
      return parseCsv(await res.text());
    };
    const seen = new Set((await csv()).map((r) => r.code));
    say("   On the phone:");
    say("     a. add the bot → the greeting arrives, and the メニュー bar sits under the chat");
    say("     b. menu → バグ (bug) → send any short description");
    say("     c. send 「けしき V07」, then a photo, and agree to the photo terms");
    say("   … watching /admin for b and c (Ctrl-C stops; nothing is lost)");
    const watchUntil = io.now() + WAIT_WATCH_MS;
    while (!(h.bugCode && h.viewCode)) {
      for (const r of await csv()) {
        if (seen.has(r.code)) continue;
        if (!h.bugCode && r.kind === "bug") { h.bugCode = r.code; say(`   ✓ bug report ${r.code}`); }
        if (!h.viewCode && r.view_id === "V07" && Number(r.photo_count) >= 1) { h.viewCode = r.code; say(`   ✓ けしき V07 photo ${r.code}`); }
      }
      if (h.bugCode && h.viewCode) break;
      if (io.now() > watchUntil) {
        if (!h.bugCode) h.open.push("live test: no bug report arrived in 15 minutes");
        if (!h.viewCode) h.open.push("live test: no 「けしき V07」 photo arrived in 15 minutes");
        say("   ! stopped watching after 15 minutes");
        break;
      }
      await io.sleep(4_000);
    }
    const followed = String(await io.ask("   Did the greeting arrive, with the メニュー bar under the chat? [Y/n] ")).trim().toLowerCase();
    h.follow = followed === "" || followed === "y" || followed === "yes";
    if (!h.follow) h.open.push("follow: the greeting or the rich menu did not show on the phone");
  }

  // 6. handoff
  const handoff = handoffText(h);
  say("6. Handoff (paste into issue #5; it has no secret)\n");
  say(handoff);
  if (o.handoff) {
    io.writeFile(o.handoff, handoff + "\n");
    say(`\n   saved to ${o.handoff}`);
  }
  return { ok: h.open.length === 0, handoff, basicId: setup.basicId };
}

/** The terminal: a visible prompt, and a hidden one that echoes nothing (not even stars). */
function terminalIo() {
  const ask = (question) => new Promise((resolve) => {
    process.stdout.write(question);
    process.stdin.resume();
    process.stdin.once("data", (d) => { process.stdin.pause(); resolve(String(d).replace(/\r?\n$/, "")); });
  });
  const askSecret = (question) => new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) return reject(new ConnectError("no terminal to ask the secret on: set LINE_CHANNEL_SECRET in the environment instead"));
    process.stdout.write(question);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    let out = "";
    const done = (value, err) => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.off("data", onData);
      process.stdout.write("\n");
      err ? reject(err) : resolve(value);
    };
    const onData = (chunk) => {
      for (const c of String(chunk)) {
        if (c === "\r" || c === "\n") return done(out);
        if (c === "\u0003") return done("", new ConnectError("stopped"));
        if (c === "\u007f" || c === "\b") out = out.slice(0, -1);
        else if (c >= " ") out += c;
      }
    };
    process.stdin.on("data", onData);
  });
  const railway = async (args, { input } = {}) => {
    const p = Bun.spawn(["railway", ...args], { stdin: input === undefined ? "ignore" : "pipe", stdout: "pipe", stderr: "pipe" });
    if (input !== undefined) { p.stdin.write(input); p.stdin.end(); }
    const [stdout, stderr, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
    return { code, stdout, stderr };
  };
  return {
    env: process.env,
    fetch: globalThis.fetch,
    railway,
    ask,
    askSecret,
    say: (line) => console.log(line),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => Date.now(),
    readFile: (p) => readFileSync(p, "utf8"),
    writeFile: (p, text) => writeFileSync(p, text),
    color: !process.env.NO_COLOR && process.stdout.isTTY,
  };
}

if (import.meta.main) {
  try {
    const out = await connect(process.argv.slice(2), terminalIo());
    process.exit(out.ok ? 0 : 2);
  } catch (e) {
    console.error(`\n✗ ${e instanceof ConnectError ? e.message : `${e?.name || "Error"}: ${e?.message || e}`}`);
    process.exit(1);
  }
}
