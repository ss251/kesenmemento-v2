// Point the LINE channel at this bot and install the rich menu.
//
//   set -a && . ~/.config/kesenmemento/line.env && set +a
//   export PUBLIC_BASE_URL=https://line.kesenmemento.com
//   env -u NODE_OPTIONS bun tools/line/setup.mjs
//   env -u NODE_OPTIONS bun tools/line/setup.mjs --qr add-friend.svg
//
// Reads LINE_CHANNEL_ID + LINE_CHANNEL_SECRET (minted tokens) or LINE_CHANNEL_ACCESS_TOKEN, and PUBLIC_BASE_URL. Prints none of them.
// The same setup runs on the server (POST /admin/setup), which is the way to go from a network that cannot reach api.line.me.
// Uses tools/line/richmenu.png when that file exists, otherwise a plain placeholder.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLineApi } from "../../server/line/api.js";
import { runSetup } from "../../server/line/setup.js";
import { placeholderPng } from "./placeholder.mjs";
import { qrEncode, qrToSvg } from "../../src/anime/ui/qr.js";

const here = dirname(fileURLToPath(import.meta.url));

function fail(message) {
  console.error(message);
  process.exit(1);
}

const token = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
const channelId = process.env.LINE_CHANNEL_ID || "";
const channelSecret = process.env.LINE_CHANNEL_SECRET || "";
const base = (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
if (!token && !(channelId && channelSecret)) fail("LINE_CHANNEL_ID + LINE_CHANNEL_SECRET (or LINE_CHANNEL_ACCESS_TOKEN) is required");
if (!base) fail("PUBLIC_BASE_URL is required");

const pngPath = join(here, "richmenu.png");
const png = existsSync(pngPath) ? readFileSync(pngPath) : placeholderPng();
const api = createLineApi({
  token,
  channelId,
  channelSecret,
  apiBase: process.env.LINE_API_BASE,
  dataBase: process.env.LINE_DATA_BASE,
});
let out;
try {
  out = await runSetup({ api, publicBaseUrl: base, png });
} catch (e) {
  fail(String(e?.message || e));
}
const { basicId, addFriendUrl } = out;

let qr = null;
const qrAt = process.argv.indexOf("--qr");
if (qrAt >= 0) {
  const next = process.argv[qrAt + 1];
  qr = next && !next.startsWith("-") ? next : "add-friend.svg";
  const svg = qrToSvg(qrEncode(addFriendUrl), {
    border: 4,
    dark: "#165E83",
    light: "#FBFAF5",
    title: "ケセンメメント",
  });
  writeFileSync(qr, svg);
}

console.log(JSON.stringify({
  basicId,
  addFriendUrl,
  richMenuId: out.richMenuId,
  webhook: out.webhook,
  webhookActive: out.webhookActive,
  tokenSource: out.tokenSource,
  todo: out.todo,
  qr,
}, null, 2));
