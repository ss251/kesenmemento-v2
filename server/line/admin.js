// Team pages. HTTP Basic, user `team`, password ADMIN_TOKEN.
// no-store, noindex, no CORS. The map link is OpenStreetMap.

import { KIND_JA, STATUS_JA, fixedText, privacyParts } from "./strings.js";
import { safeEqual } from "./signature.js";
import { quotaLeft } from "./api.js";

const KINDS = ["bug", "fix", "photo", "idea", "other"];
const STATUSES = ["new", "seen", "accepted", "fixed", "rejected"];
const STATUS_BUTTONS = [
  ["seen", "確認しました"],
  ["accepted", "受け付けました"],
  ["fixed", "直りました"],
  ["rejected", "見送りました"],
];

export const NO_STORE = {
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

const HTML_HEADERS = {
  ...NO_STORE,
  "content-type": "text/html; charset=utf-8",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function adminAuthorized(req, token) {
  const h = req.headers.get("authorization") || "";
  const m = /^Basic\s+([A-Za-z0-9+/=_-]+)$/i.exec(h.trim());
  if (!m) return false;
  let decoded = "";
  try { decoded = Buffer.from(m[1], "base64").toString("utf8"); } catch { return false; }
  const i = decoded.indexOf(":");
  if (i < 0) return false;
  return safeEqual(decoded.slice(0, i), "team") && safeEqual(decoded.slice(i + 1), token);
}

export function unauthorized() {
  return new Response(null, {
    status: 401,
    headers: { ...NO_STORE, "www-authenticate": 'Basic realm="KesenMemento"' },
  });
}

function jstLabel(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = {};
  for (const p of new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

const CSS = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
html { background: #FBFAF5; } /* 生成り色 */
body {
  margin: 0;
  background: #FBFAF5;
  color: #17184B; /* 鉄紺 */
  font-family: "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans JP", sans-serif;
  font-size: 16px;
  line-height: 1.7;
  line-break: strict;
  text-wrap: pretty;
  overflow-wrap: anywhere;
  padding: 16px;
  padding-top: calc(16px + env(safe-area-inset-top));
  padding-right: calc(16px + env(safe-area-inset-right));
  padding-bottom: calc(16px + env(safe-area-inset-bottom));
  padding-left: calc(16px + env(safe-area-inset-left));
}
main { max-width: 720px; margin: 0 auto; }
h1 {
  margin: 0 0 4px;
  font-size: 24px;
  font-weight: 600;
  line-height: 1.3;
  text-wrap: balance;
  word-break: auto-phrase;
  font-feature-settings: "palt";
  color: #165E83; /* 藍色 */
}
h2 { margin: 24px 0 8px; font-size: 18px; font-weight: 600; line-height: 1.3; }
p { margin: 0 0 12px; }
a { color: #165E83; }
.sub { color: #595857; margin: 0 0 16px; } /* 墨 */
.card {
  background: #fff;
  border: 1px solid #d9d3c5;
  border-radius: 12px;
  padding: 16px;
  margin: 0 0 12px;
}
.row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
label { display: block; margin: 0 0 4px; font-size: 14px; color: #595857; }
select, textarea, input {
  font: inherit;
  color: inherit;
  background: #fff;
  border: 1px solid #165E83;
  border-radius: 8px;
  min-height: 44px;
  padding: 8px 12px;
  width: 100%;
}
textarea { min-height: 96px; line-height: 1.6; }
button, .btn {
  appearance: none;
  background: #165E83;
  color: #FBFAF5;
  border: 0;
  border-radius: 12px;
  padding: 8px 16px;
  min-height: 44px;
  min-width: 44px;
  font: inherit;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
button.ghost, a.ghost {
  background: transparent;
  color: #165E83;
  border: 1px solid #165E83;
}
button[aria-current="true"] { background: #223A70; } /* 紺色 */
.badge {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 8px;
  border-radius: 8px;
  background: #E7F6F7;
  color: #17184B;
  font-size: 14px;
}
.badge.warn { background: #F8B500; color: #17184B; } /* 山吹色 */
.badge.stop { background: #B7282E; color: #FBFAF5; } /* 茜色 */
.meta { color: #595857; font-size: 14px; }
.banner {
  background: #fff;
  border-left: 4px solid #00A3AF; /* 浅葱色 */
  border-radius: 8px;
  padding: 12px 16px;
  margin: 0 0 16px;
}
img { max-width: 100%; height: auto; border-radius: 8px; display: block; margin: 0 0 12px; }
pre {
  white-space: pre-wrap;
  word-break: break-word;
  font: inherit;
  margin: 0;
}
:focus-visible { outline: 3px solid #00A3AF; outline-offset: 2px; }
nav { margin: 0 0 16px; }
`;

function page(title, body, { robots = true } = {}) {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${robots ? '<meta name="robots" content="noindex, nofollow">' : ""}
<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>`;
}

function html(body, status = 200) {
  return new Response(body, { status, headers: HTML_HEADERS });
}

function redirect(location) {
  return new Response(null, { status: 303, headers: { ...NO_STORE, location } });
}

function kindLabel(kind) {
  return KIND_JA[kind] || kind;
}

function badge(status) {
  const label = STATUS_JA[status] || status;
  const cls = status === "rejected" ? "badge stop" : status === "new" ? "badge warn" : "badge";
  return `<span class="${cls}">${esc(label)}</span>`;
}

function filters(kind, status) {
  const kindOpts = [`<option value="">すべて</option>`].concat(KINDS.map((k) => `<option value="${k}"${k === kind ? " selected" : ""}>${esc(kindLabel(k))}</option>`));
  const statusOpts = [`<option value="">すべて</option>`].concat(STATUSES.map((s) => `<option value="${s}"${s === status ? " selected" : ""}>${esc(STATUS_JA[s])}</option>`));
  const q = new URLSearchParams();
  if (kind) q.set("kind", kind);
  if (status) q.set("status", status);
  const csv = `/admin/export.csv${q.toString() ? `?${q}` : ""}`;
  return `<form method="get" action="/admin">
<div class="row">
<div style="flex:1 1 140px"><label for="kind">種類</label><select id="kind" name="kind">${kindOpts.join("")}</select></div>
<div style="flex:1 1 140px"><label for="status">状態</label><select id="status" name="status">${statusOpts.join("")}</select></div>
</div>
<div class="row" style="margin-top:12px">
<button type="submit">絞り込み</button>
<a class="btn ghost" href="${esc(csv)}">CSVを書き出す</a>
</div>
</form>`;
}

function csvCell(v) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function mapLink(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "";
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return "";
  const href = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`;
  return `<p><a href="${esc(href)}" rel="noreferrer">地図で見る</a></p>`;
}

/**
 * @param {ReturnType<import("./store.js").openStore>} store
 * @param {ReturnType<import("./api.js").createLineApi>} api
 * @param {object} config
 * @param {{ warn: Function, info: Function }} log
 */
export function createAdmin(store, api, config, log) {
  async function quotaView() {
    try {
      const left = quotaLeft(await api.quota(), await api.consumption());
      return { ok: true, left };
    } catch (e) {
      log.warn("quota.failed", { name: e?.name || "Error" });
      return { ok: false, left: null };
    }
  }

  function list(url) {
    const kind = KINDS.includes(url.searchParams.get("kind") || "") ? url.searchParams.get("kind") : "";
    const status = STATUSES.includes(url.searchParams.get("status") || "") ? url.searchParams.get("status") : "";
    const rows = store.listReports({ kind, status, limit: 200 });
    const cards = rows.length
      ? rows.map((r) => {
        const snippet = String(r.text || "").replace(/\s+/g, " ").trim().slice(0, 80);
        return `<article class="card">
<p class="row">${badge(r.status)} <strong>${esc(r.code)}</strong> <span>${esc(kindLabel(r.kind))}</span></p>
<p class="meta">${esc(jstLabel(r.created_at))} · 写真${r.photo_count}枚</p>
<p>${esc(snippet) || "（文章なし）"}</p>
<p><a class="btn" href="/admin/r/${esc(r.code)}">開く</a></p>
</article>`;
      }).join("")
      : `<p class="card">まだ報告はありません。</p>`;
    return html(page("ケセンメメントの報告", `
<nav><a href="/admin">報告</a></nav>
<h1>ケセンメメントの報告</h1>
<p class="sub">Reports</p>
${filters(kind, status)}
<div style="height:16px"></div>
${cards}
`));
  }

  async function detail(code, url) {
    if (!/^KM-\d{1,8}$/.test(code)) return html(page("見当たりません", "<p>その受付番号は見当たりません。</p>"), 404);
    const row = store.getByCode(code);
    if (!row) return html(page("見当たりません", `<p>その受付番号は見当たりません。</p><p><a href="/admin">戻る</a></p>`), 404);
    const media = store.mediaFor(row.id);
    const photos = media.map((m) => `<img src="/admin/media/${m.id}" alt="報告の写真 ${m.id}">`).join("");
    const notice = url.searchParams.get("notice");
    const banners = {
      sent: "お知らせを送りました。",
      quota: "今月のプッシュは上限です。報告の状態は変えられますが、お知らせは送れません。",
      nocontact: "送り先がありません。削除されたあとかもしれません。",
      error: "お知らせを送れませんでした。",
      saved: "保存しました。",
    };
    const banner = banners[notice] ? `<p class="banner">${esc(banners[notice])}</p>` : "";
    const q = await quotaView();
    let quotaLine = "残数を取得できませんでした。";
    let canPush = false;
    if (q.ok && q.left) {
      if (!q.left.limited) {
        quotaLine = `今月のプッシュに上限はありません（使用 ${q.left.used}）。`;
        canPush = true;
      } else {
        quotaLine = `今月のプッシュ残り ${q.left.left} / ${q.left.value}`;
        canPush = q.left.left >= 1;
      }
    }
    const buttons = STATUS_BUTTONS.map(([value, label]) =>
      `<button type="submit" name="status" value="${value}" ${row.status === value ? 'aria-current="true"' : ""}>${esc(label)}</button>`,
    ).join("");
    const notify = (row.kind === "bug" || row.kind === "fix") && canPush
      ? `<form method="post" action="/admin/r/${esc(code)}/notify"><button type="submit">直りましたと送る</button></form>`
      : (row.kind === "bug" || row.kind === "fix") && q.ok && !canPush
        ? `<p>今月のプッシュは上限です。報告の状態は変えられますが、お知らせは送れません。</p>`
        : "";
    const place = row.place_name ? `<p>場所: ${esc(row.place_name)}</p>` : "";
    return html(page(code, `
<nav><a href="/admin">報告</a></nav>
<h1>${esc(code)}</h1>
<p class="row">${badge(row.status)} <span>${esc(kindLabel(row.kind))}</span> <span class="meta">${esc(jstLabel(row.created_at))}</span></p>
${banner}
${place}
${mapLink(row.lat, row.lon)}
<p class="meta">端末 ${esc(row.device || "—")} · 遊び方 ${esc(row.mode || "—")} · ちがい ${esc(row.fix_what || "—")}</p>
<p class="meta">言語 ${esc(row.lang)} · 写真の確認 ${row.photo_consent ? "あり" : "なし"} · 参照 ${esc(row.user_ref)}</p>
<h2>文章</h2>
<div class="card"><pre>${esc(row.text || "（文章なし）")}</pre></div>
<h2>写真</h2>
${photos || "<p class=\"meta\">写真はありません。</p>"}
<h2>状態</h2>
<form method="post" action="/admin/r/${esc(code)}/status"><div class="row">${buttons}</div></form>
<h2>お知らせ</h2>
<p>${esc(quotaLine)}</p>
${notify}
<h2>メモ（チームだけ）</h2>
<form method="post" action="/admin/r/${esc(code)}/notes">
<label for="notes">メモ</label>
<textarea id="notes" name="notes" maxlength="4000">${esc(row.notes || "")}</textarea>
<div class="row" style="margin-top:12px"><button type="submit">保存する</button></div>
</form>
`));
  }

  function exportCsv(url) {
    const kind = KINDS.includes(url.searchParams.get("kind") || "") ? url.searchParams.get("kind") : "";
    const status = STATUSES.includes(url.searchParams.get("status") || "") ? url.searchParams.get("status") : "";
    const rows = store.listReports({ kind, status, limit: 500 });
    const header = ["code", "kind", "status", "created_at", "updated_at", "device", "mode", "fix_what", "place_name", "lat", "lon", "lang", "photo_consent", "photo_count", "text", "notes", "user_ref"];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push(header.map((k) => csvCell(r[k])).join(","));
    }
    const body = `\uFEFF${lines.join("\n")}\n`;
    return new Response(body, {
      headers: {
        ...NO_STORE,
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": "attachment; filename=\"reports.csv\"",
      },
    });
  }

  function media(id) {
    if (!/^\d{1,12}$/.test(id)) return new Response(null, { status: 404, headers: NO_STORE });
    const row = store.getMedia(id);
    if (!row || !String(row.mime).startsWith("image/")) return new Response(null, { status: 404, headers: NO_STORE });
    const bytes = store.readMedia(row);
    if (!bytes) return new Response(null, { status: 404, headers: NO_STORE });
    return new Response(bytes, {
      headers: {
        ...NO_STORE,
        "content-type": row.mime,
        "content-disposition": "inline",
      },
    });
  }

  async function postStatus(code, req) {
    if (!/^KM-\d{1,8}$/.test(code)) return new Response(null, { status: 404, headers: NO_STORE });
    const form = await req.formData().catch(() => null);
    const status = String(form?.get("status") || "");
    if (!STATUSES.includes(status)) return redirect(`/admin/r/${code}?notice=error`);
    const row = store.setStatus(code, status);
    if (!row) return new Response(null, { status: 404, headers: NO_STORE });
    log.info("admin.status", { code, status });
    return redirect(`/admin/r/${code}?notice=saved`);
  }

  async function postNotes(code, req) {
    if (!/^KM-\d{1,8}$/.test(code)) return new Response(null, { status: 404, headers: NO_STORE });
    const form = await req.formData().catch(() => null);
    const ok = store.setNotes(code, form?.get("notes") ?? "");
    if (!ok) return new Response(null, { status: 404, headers: NO_STORE });
    return redirect(`/admin/r/${code}?notice=saved`);
  }

  async function postNotify(code) {
    if (!/^KM-\d{1,8}$/.test(code)) return new Response(null, { status: 404, headers: NO_STORE });
    const row = store.getByCode(code);
    if (!row) return new Response(null, { status: 404, headers: NO_STORE });
    if (row.kind !== "bug" && row.kind !== "fix") return redirect(`/admin/r/${code}?notice=error`);
    let left;
    try { left = quotaLeft(await api.quota(), await api.consumption()); }
    catch (e) {
      log.warn("quota.failed", { name: e?.name || "Error", code });
      return redirect(`/admin/r/${code}?notice=error`);
    }
    if (left.limited && left.left < 1) return redirect(`/admin/r/${code}?notice=quota`);
    const userId = store.lineUserId(row.user_ref);
    if (!userId) return redirect(`/admin/r/${code}?notice=nocontact`);
    try {
      await api.push(userId, [{ type: "text", text: fixedText(row.lang === "en" ? "en" : "ja", row.code) }]);
    } catch (e) {
      log.warn("push.failed", { name: e?.name || "Error", status: e?.status, code });
      return redirect(`/admin/r/${code}?notice=error`);
    }
    store.setStatus(code, "fixed");
    log.info("admin.notify", { code, left: left.limited ? Math.max(0, left.left - 1) : undefined });
    return redirect(`/admin/r/${code}?notice=sent`);
  }

  return {
    async handle(req, url) {
      if (!adminAuthorized(req, config.adminToken)) return unauthorized();
      const path = url.pathname.replace(/\/+$/, "") || "/admin";
      if (req.method === "GET" && (path === "/admin")) return list(url);
      if (req.method === "GET" && path === "/admin/export.csv") return exportCsv(url);
      const mediaMatch = /^\/admin\/media\/(\d{1,12})$/.exec(path);
      if (req.method === "GET" && mediaMatch) return media(mediaMatch[1]);
      const detailMatch = /^\/admin\/r\/(KM-\d{1,8})$/.exec(path);
      if (req.method === "GET" && detailMatch) return detail(detailMatch[1], url);
      const statusMatch = /^\/admin\/r\/(KM-\d{1,8})\/status$/.exec(path);
      if (req.method === "POST" && statusMatch) return postStatus(statusMatch[1], req);
      const notesMatch = /^\/admin\/r\/(KM-\d{1,8})\/notes$/.exec(path);
      if (req.method === "POST" && notesMatch) return postNotes(notesMatch[1], req);
      const notifyMatch = /^\/admin\/r\/(KM-\d{1,8})\/notify$/.exec(path);
      if (req.method === "POST" && notifyMatch) return postNotify(notifyMatch[1]);
      if (req.method !== "GET" && req.method !== "HEAD" && path.startsWith("/admin")) {
        return new Response(null, { status: 405, headers: NO_STORE });
      }
      return new Response(null, { status: 404, headers: NO_STORE });
    },
  };
}

export function privacyHtml() {
  const { ja, en } = privacyParts();
  return page("ケセンメメントのプライバシー", `
<h1>ケセンメメントのプライバシー</h1>
<p class="sub">Privacy</p>
<div class="card"><pre>${esc(ja)}</pre></div>
<h2>English</h2>
<div class="card"><pre>${esc(en)}</pre></div>
`, { robots: false });
}
