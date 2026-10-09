// One channel setup, shared by tools/line/setup.mjs and the server's POST /admin/setup:
// the webhook (set and tested), the rich menu (created, its image uploaded, made the default, older ones removed)
// and the add-friend link. The server runs it with its own token, so no secret leaves Railway, and a network that
// cannot reach LINE (the build machine's DNS sinkholes api.line.me) does not matter.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RICH_MENU_HEIGHT, RICH_MENU_NAME, RICH_MENU_WIDTH, richMenuRequest } from "./menu.js";
import { stripJpeg, stripPng } from "./media.js";

const here = dirname(fileURLToPath(import.meta.url));
/** The drawn menu (6 tiles, 2500x1686); its source drawing is kept with the team's design files. */
export const RICH_MENU_PNG = join(here, "../../tools/line/richmenu.png");

/** Width and height of a PNG or JPEG, or null. */
export function imageSize(bytes) {
  const buf = Buffer.from(bytes);
  const png = stripPng(buf);
  if (png?.w) return png;
  const jpeg = stripJpeg(buf);
  if (jpeg?.w) return jpeg;
  return null;
}

/** What a person does about each LINE refusal. The status stays first, so "line api 403" still matches. */
const LINE_HINTS = {
  token: {
    400: "LINE refused the channel ID + secret. Copy both again from LINE Developers → the channel → チャネル基本設定 (Basic settings)",
    401: "LINE refused the channel ID + secret. Copy both again from LINE Developers → the channel → チャネル基本設定 (Basic settings)",
  },
  400: "LINE refused the request; the webhook URL must be https and reachable from the internet",
  401: "LINE refused the access token. Set LINE_CHANNEL_ID + LINE_CHANNEL_SECRET so the bot mints its own",
  403: "no active LINE Official Account sits behind this channel, or its Messaging API is off. "
    + "LINE Official Account Manager → 設定 → Messaging API → 「Messaging APIを利用する」, then run the setup again",
  429: "LINE is rate-limiting this channel; wait a minute and run the setup again",
  0: "LINE did not answer (network or timeout); run the setup again",
};

/**
 * A setup failure in words a person can act on. Never includes a secret or a token: LineApiError carries only a status.
 * @param {any} e
 * @param {string} step
 */
export function explainSetupError(e, step) {
  if (e?.name !== "LineApiError" && typeof e?.status !== "number") return String(e?.message || e);
  const status = Number(e.status) || 0;
  const hint = (e.op === "token" && LINE_HINTS.token[status]) || LINE_HINTS[status] || (status >= 500 ? "LINE had a server error; run the setup again" : "");
  return `line api ${status} (${e.op === "token" ? "token" : step})${hint ? `: ${hint}` : ""}`;
}

/**
 * GET {base}/healthz must answer as this service before LINE is pointed at {base}/webhook: a custom domain whose
 * DNS is not set yet, or a base that points somewhere else, fails here and leaves the channel as it was.
 * @param {typeof fetch} probe
 * @param {string} base
 */
export async function checkBase(probe, base) {
  const url = new URL("/healthz", base).toString();
  let res;
  try {
    res = await probe(url, { signal: AbortSignal.timeout(8_000), redirect: "error", headers: { accept: "application/json" } });
  } catch (e) {
    const why = e?.name === "TimeoutError" ? "no answer in 8 s" : "unreachable (DNS or TLS)";
    throw new Error(`PUBLIC_BASE_URL ${base} is ${why}. Point its DNS at this service, or set PUBLIC_BASE_URL to the Railway domain`);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.service !== "kesenmemento-line") {
    throw new Error(`PUBLIC_BASE_URL ${base} answers, but not as kesenmemento-line (HTTP ${res.status}). Set it to this service's own domain`);
  }
}

/**
 * @param {{ api: object, publicBaseUrl: string, png: Uint8Array | Buffer, probe?: typeof fetch }} o
 *   probe: when given, {publicBaseUrl}/healthz is checked first (checkBase)
 * @returns {Promise<{ basicId: string, displayName: string | null, addFriendUrl: string, richMenuId: string, webhook: string,
 *   webhookActive: boolean | null, tokenSource: string | null, todo: string[] }>}
 */
export async function runSetup({ api, publicBaseUrl, png, probe }) {
  let endpoint;
  try {
    const u = new URL(String(publicBaseUrl || "").replace(/\/+$/, ""));
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("scheme");
    endpoint = new URL("/webhook", u).toString();
  } catch {
    throw new Error("PUBLIC_BASE_URL must be an http(s) URL");
  }
  if (!png || !png.length) throw new Error("no rich menu image");
  if (png.length > 1_000_000) throw new Error(`rich menu image is ${png.length} bytes; LINE allows 1 MB`);
  const size = imageSize(png);
  if (!size || size.w !== RICH_MENU_WIDTH || size.h !== RICH_MENU_HEIGHT) {
    throw new Error(`rich menu image must be ${RICH_MENU_WIDTH}×${RICH_MENU_HEIGHT}`);
  }

  if (probe) await checkBase(probe, new URL(endpoint).origin);

  const at = { step: "set webhook" };
  try {
    return await install(api, endpoint, png, at);
  } catch (e) {
    throw new Error(explainSetupError(e, at.step));
  }
}

/** The LINE calls, in order. `at.step` names the call in flight, for explainSetupError. */
async function install(api, endpoint, png, at) {
  await api.setWebhook(endpoint);
  at.step = "test webhook";
  const test = await api.testWebhook(endpoint);
  if (!test?.success) throw new Error(`webhook test failed: ${test?.statusCode ?? 0} ${test?.reason || ""}`.trim());
  // the console's "Use webhook" switch has no API: read it, so the caller can say what is left to do
  let webhookActive = null;
  if (typeof api.getWebhook === "function") {
    try {
      const got = await api.getWebhook();
      if (typeof got?.active === "boolean") webhookActive = got.active;
    } catch { /* the endpoint is set and tested; the switch is reported as unknown */ }
  }

  at.step = "rich menu";
  const created = await api.createRichMenu(richMenuRequest());
  if (!created?.richMenuId) throw new Error("rich menu was not created");
  const mime = png[0] === 0xff && png[1] === 0xd8 ? "image/jpeg" : "image/png";
  await api.uploadRichMenuImage(created.richMenuId, png, mime);
  await api.setDefaultRichMenu(created.richMenuId);
  try {
    const list = await api.listRichMenus();
    for (const menu of list.richmenus || []) {
      if (menu.richMenuId !== created.richMenuId && menu.name === RICH_MENU_NAME) {
        try { await api.deleteRichMenu(menu.richMenuId); } catch { /* the new menu is already the default */ }
      }
    }
  } catch { /* removing old menus is housekeeping */ }

  at.step = "bot info";
  const info = await api.botInfo();
  const basicId = info?.basicId;
  if (!basicId) throw new Error("bot info did not include a basicId");
  return {
    basicId,
    displayName: info?.displayName || null,
    addFriendUrl: `https://line.me/R/ti/p/${encodeURIComponent(basicId)}`,
    richMenuId: created.richMenuId,
    webhook: endpoint,
    webhookActive,
    tokenSource: api.tokenSource || null,
    todo: webhookActive === false ? ["LINE Developers → Messaging API設定 → Webhookの利用 をオン (Use webhook)"] : [],
  };
}
