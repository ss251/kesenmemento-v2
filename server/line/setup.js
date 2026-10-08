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

/**
 * @param {{ api: object, publicBaseUrl: string, png: Uint8Array | Buffer }} o
 * @returns {Promise<{ basicId: string, displayName: string | null, addFriendUrl: string, richMenuId: string, webhook: string,
 *   webhookActive: boolean | null, tokenSource: string | null, todo: string[] }>}
 */
export async function runSetup({ api, publicBaseUrl, png }) {
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

  await api.setWebhook(endpoint);
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
