// Drive a local LINE bot through every flow, with no LINE account.
// The server must be running with LINE_SIM=1 and the same LINE_CHANNEL_SECRET.
//
//   env -u NODE_OPTIONS bun tools/line/sim.mjs --out transcript.md
//
// Prints the bot's replies, in order.

import { createHmac } from "node:crypto";
import { writeFileSync } from "node:fs";

const base = (process.env.LINE_BASE || "http://127.0.0.1:8943").replace(/\/+$/, "");
const secret = process.env.LINE_CHANNEL_SECRET || "";
if (!secret) {
  console.error("LINE_CHANNEL_SECRET is required");
  process.exit(1);
}

const outAt = process.argv.indexOf("--out");
const outPath = outAt >= 0 ? process.argv[outAt + 1] : "";

let n = 0;
const sections = [];

async function post(userId, event, label) {
  const body = {
    destination: "U" + "0".repeat(32),
    events: [{
      webhookEventId: `01SIM${String(++n).padStart(24, "0")}`.slice(0, 32),
      // Four seconds apart, so a full walkthrough stays under 20 events a minute.
      timestamp: 1_700_000_000_000 + n * 4000,
      mode: "active",
      source: { type: "user", userId },
      replyToken: `reply-${n}`,
      ...event,
    }],
  };
  const raw = JSON.stringify(body);
  const sig = createHmac("sha256", secret).update(raw).digest("base64");
  const before = await (await fetch(`${base}/sim/outbox`)).json();
  const res = await fetch(`${base}/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-line-signature": sig },
    body: raw,
  });
  if (res.status !== 200) throw new Error(`webhook ${res.status} on ${label}`);
  const after = await (await fetch(`${base}/sim/outbox`)).json();
  const fresh = after.slice(before.length);
  const texts = [];
  for (const item of fresh) {
    for (const message of item.messages || []) if (message.text) texts.push(message.text);
  }
  sections.push({ label, texts });
  return texts.join("\n");
}

const text = (t) => ({ type: "message", message: { type: "text", id: `t${n}`, text: t } });
const postback = (data) => ({ type: "postback", postback: { data } });
const image = () => ({ type: "message", message: { type: "image", id: `img${n + 1}`, contentProvider: { type: "line" } } });
const location = () => ({
  type: "message",
  message: { type: "location", id: `loc${n + 1}`, title: "", address: "", latitude: 38.9072, longitude: 141.569 },
});

function codeFrom(reply) {
  const m = /KM-\d+/.exec(reply);
  return m ? m[0] : "";
}

const A = `U${"a".repeat(32)}`;
const B = `U${"b".repeat(32)}`;

await post(A, { type: "follow" }, "友だち追加");
await post(A, postback("flow=bug"), "バグを知らせる");
await post(A, postback("bug.device=phone"), "スマホ");
await post(A, postback("bug.mode=walk"), "歩く");
await post(A, text("歩くと、地面にめり込みます。"), "バグの文章");
await post(A, image(), "スクリーンショット");
await post(A, postback("action=done"), "送り終わった（バグ）");
const bugAck = await post(A, postback("action=send"), "送る（バグ）");
const bugCode = codeFrom(bugAck);

await post(A, postback("flow=fix"), "町の間違い");
await post(A, location(), "位置情報");
await post(A, postback("fix.what=road"), "道・橋");
await post(A, text("橋の位置が、実際と少しずれています。"), "町の文章");
await post(A, postback("action=done"), "送り終わった（町）");
await post(A, postback("action=send"), "送る（町）");

await post(A, postback("flow=photo"), "写真を送る");
await post(A, postback("consent=yes"), "はい、だいじょうぶ");
await post(A, image(), "写真");
await post(A, location(), "写真の位置");
await post(A, postback("action=done"), "送り終わった（写真）");
await post(A, postback("action=send"), "送る（写真）");

await post(A, postback("flow=idea"), "アイデア");
await post(A, text("夜の港を歩くコースがほしいです。"), "アイデアの文章");
await post(A, postback("action=send"), "送る（アイデア）");

await post(A, text("朝の市場の看板が読みにくいです。"), "自由な文章");
await post(A, postback("free.kind=other"), "そのほか");
await post(A, postback("action=send"), "送る（そのほか）");

await post(A, text(`状況 ${bugCode}`), `状況 ${bugCode}`);
await post(A, text("削除"), "削除");
await post(A, postback("action=erase"), "消す");

await post(B, text("English"), "English");
await post(B, postback("flow=idea"), "Idea");
await post(B, text("I want a night walk around the port."), "English idea");
await post(B, postback("action=send"), "Send");

const lines = ["# KesenMemento LINE simulator", "", "Replies in the order the bot sent them. No LINE account was used.", ""];
for (const section of sections) {
  lines.push(`## ${section.label}`, "");
  if (!section.texts.length) lines.push("（返信なし）", "");
  for (const t of section.texts) lines.push(t, "");
}
const md = lines.join("\n");
process.stdout.write(md);
if (outPath) writeFileSync(outPath, md);
