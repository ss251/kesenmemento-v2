// Admin page: pure helpers (no DOM, no network), so they are unit-tested under `bun test`.
// The page itself is app.js; this file holds formatting, links, date ranges, defaults and the Japanese/English strings.

// ---------------------------------------------------------------------------------------------- constants

export const STATUSES = ["new", "accepted", "used", "rejected"];
export const KINDS = ["issue", "fix"];
export const CATEGORIES = ["building", "road", "shop", "sign", "landmark", "other"];

const LAT0 = 38.906, LON0 = 141.575, M_LON = 86744, M_LAT = 111014;
const JST_MS = 9 * 3600 * 1000;

/** Same rule as the server: a release tag or commit, 1-64 safe characters. */
export const VERSION_RE = /^[A-Za-z0-9][A-Za-z0-9._+@/-]{0,63}$/;

// -------------------------------------------------------------------------------------------------- time

const pad2 = (n) => String(n).padStart(2, "0");

/** The JST calendar fields of an instant, computed without the machine's time zone. */
function jstParts(ms) {
  const d = new Date(ms + JST_MS);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), wd: d.getUTCDay() };
}

/** "2026-10-05 12:34" in Japan Standard Time. Empty string for anything that is not a time. */
export function fmtJst(iso) {
  const ms = typeof iso === "number" ? iso : Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const p = jstParts(ms);
  return `${p.y}-${pad2(p.mo)}-${pad2(p.d)} ${pad2(p.h)}:${pad2(p.mi)}`;
}

/** "2026-10-05" (JST). */
export function fmtJstDate(iso) {
  const s = fmtJst(iso);
  return s ? s.slice(0, 10) : "";
}

/** An EXIF-style capture time ("2026-10-04T14:23:05+09:00", or naive local time) shown as written, minus the seconds. */
export function fmtTaken(takenAt) {
  if (typeof takenAt !== "string") return "";
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?(Z|[+-]\d{2}:\d{2})?/.exec(takenAt);
  return m ? `${m[1]} ${m[2]}${m[3] ? " (" + m[3] + ")" : ""}` : takenAt;
}

/** "3 min ago" / "3分前", up to a week; older times are shown as dates. */
export function relTime(iso, nowMs, lang = "en") {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const sec = Math.round((nowMs - ms) / 1000);
  if (sec < 0) return lang === "ja" ? "これから" : "soon";
  const ja = lang === "ja";
  if (sec < 45) return ja ? "たった今" : "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return ja ? `${min}分前` : `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return ja ? `${hr}時間前` : `${hr} h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return ja ? `${day}日前` : `${day} d ago`;
  return fmtJstDate(ms);
}

/** Today's JST date as YYYY-MM-DD. */
export function todayJst(nowMs) {
  const p = jstParts(nowMs);
  return `${p.y}-${pad2(p.mo)}-${pad2(p.d)}`;
}

function dateStr(ms) {
  const p = jstParts(ms);
  return `${p.y}-${pad2(p.mo)}-${pad2(p.d)}`;
}

/** Quick export ranges, all in JST days: the last `days` days including today, this week (Mon-Sun), this month. */
export function lastDaysRangeJst(nowMs, days) {
  return { from: dateStr(nowMs - (days - 1) * 86400000), to: dateStr(nowMs) };
}
export function weekRangeJst(nowMs) {
  const p = jstParts(nowMs);
  const sinceMonday = (p.wd + 6) % 7;
  return { from: dateStr(nowMs - sinceMonday * 86400000), to: dateStr(nowMs + (6 - sinceMonday) * 86400000) };
}
export function monthRangeJst(nowMs) {
  const p = jstParts(nowMs);
  const last = new Date(Date.UTC(p.y, p.mo, 0)).getUTCDate();
  return { from: `${p.y}-${pad2(p.mo)}-01`, to: `${p.y}-${pad2(p.mo)}-${pad2(last)}` };
}

// ------------------------------------------------------------------------------------------ places, links

/** ENU metres (the app's frame) of a position. */
export function latLonToEnu(lat, lon) {
  return { x: (lon - LON0) * M_LON, z: -(lat - LAT0) * M_LAT };
}

/** "38.906500, 141.575200" */
export function fmtLatLon(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) ? `${lat.toFixed(6)}, ${lon.toFixed(6)}` : "";
}

/** The GSI map link. */
export function gsiUrl(lat, lon, zoom = 18) {
  return `https://maps.gsi.go.jp/#${zoom}/${Number(lat).toFixed(6)}/${Number(lon).toFixed(6)}/`;
}

const round = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

/** `x,y,z,heading,pitch,fov` of a stored pose (missing angles default to 0, 0 and 60). Null without a position. */
export function camQuery(pose) {
  if (!pose || !Array.isArray(pose.enu) || pose.enu.length !== 3 || !pose.enu.every(Number.isFinite)) return null;
  const [x, y, z] = pose.enu;
  const heading = Number.isFinite(pose.heading) ? pose.heading : 0;
  const pitch = Number.isFinite(pose.pitch) ? pose.pitch : 0;
  const fov = Number.isFinite(pose.fov) ? pose.fov : 60;
  return [x, y, z, heading, pitch, fov].map((n) => round(n)).join(",");
}

/** The app's "open this exact view" link: `<app URL>?cam=x,y,z,heading,pitch,fov`. */
export function appCamUrl(appUrl, pose) {
  const cam = camQuery(pose);
  if (!cam || typeof appUrl !== "string" || !/^https?:\/\//.test(appUrl)) return null;
  const base = appUrl.replace(/#.*$/, "");
  return `${base}${base.includes("?") ? "&" : "?"}cam=${cam}`;
}

/** Metres between where a photo was taken (its GPS) and where the contributor's camera was (the pose). Null if either is unknown. */
export function photoPoseDistance(photo, pose) {
  if (!photo?.enu || !Array.isArray(pose?.enu)) return null;
  return Math.hypot(photo.enu.x - pose.enu[0], photo.enu.z - pose.enu[2]);
}

/** Who a note should be shown as: first line, bounded. */
export function excerpt(text, max = 140) {
  const s = String(text ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

/** Human file size. */
export function fmtBytes(n) {
  if (!Number.isFinite(n)) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** "?a=1&b=x" from an object, skipping null, undefined and empty values. */
export function buildQuery(params) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? "?" + s : "";
}

/** Default points for accepting a submission of this kind. */
export function defaultPointsFor(kind, cfgPoints = {}) {
  const v = cfgPoints[kind];
  return Number.isInteger(v) ? v : kind === "fix" ? 20 : 5;
}

/** The index to select after the item at `index` leaves a list of `length` items (the next one, else the previous). */
export function nextSelection(index, length) {
  if (length <= 0) return -1;
  return index < length ? index : length - 1;
}

/** Rows for the pose table: [label key, text] pairs, only for values present. */
export function poseRows(pose) {
  if (!pose) return [];
  const rows = [];
  if (Array.isArray(pose.enu)) rows.push(["pose.enu", `x ${round(pose.enu[0], 1)}  y ${round(pose.enu[1], 1)}  z ${round(pose.enu[2], 1)}`]);
  if (Array.isArray(pose.latlon)) rows.push(["pose.latlon", fmtLatLon(pose.latlon[0], pose.latlon[1])]);
  if (Number.isFinite(pose.heading)) rows.push(["pose.heading", `${round(pose.heading, 1)}°`]);
  if (Number.isFinite(pose.pitch)) rows.push(["pose.pitch", `${round(pose.pitch, 1)}°`]);
  if (Number.isFinite(pose.fov)) rows.push(["pose.fov", `${round(pose.fov, 1)}°`]);
  for (const k of ["mode", "timePreset", "season", "appVersion", "layoutVersion"]) if (pose[k] !== undefined) rows.push([`pose.${k}`, String(pose[k])]);
  if (pose.at) rows.push(["pose.at", fmtJst(pose.at) + " JST"]);
  if (pose.viewport !== undefined) rows.push(["pose.viewport", typeof pose.viewport === "object" ? JSON.stringify(pose.viewport) : String(pose.viewport)]);
  return rows;
}

/** Rows for one photo's EXIF block: [label key, text]. */
export function exifRows(photo) {
  const e = photo?.exif ?? {};
  const rows = [];
  if (photo?.takenAt) rows.push(["exif.taken", fmtTaken(photo.takenAt)]);
  if (e.make || e.model) rows.push(["exif.camera", [e.make, e.model].filter(Boolean).join(" ")]);
  if (e.lens) rows.push(["exif.lens", e.lens]);
  if (Number.isFinite(e.focalLength35mm)) rows.push(["exif.focal35", `${e.focalLength35mm} mm`]);
  if (Number.isFinite(photo?.lat) && Number.isFinite(photo?.lon)) rows.push(["exif.gps", fmtLatLon(photo.lat, photo.lon)]);
  if (Number.isFinite(e.gps?.altM)) rows.push(["exif.alt", `${round(e.gps.altM, 1)} m`]);
  if (Number.isFinite(e.gps?.accuracyM)) rows.push(["exif.accuracy", `±${round(e.gps.accuracyM, 1)} m`]);
  if (Number.isFinite(photo?.heading)) rows.push(["exif.heading", `${round(photo.heading, 1)}°${e.gps?.headingRef === "M" ? " (magnetic)" : ""}`]);
  if (photo?.enu) rows.push(["exif.enu", `x ${round(photo.enu.x, 1)}  z ${round(photo.enu.z, 1)}`]);
  if (Number.isFinite(photo?.width) && Number.isFinite(photo?.height)) rows.push(["exif.size", `${photo.width} × ${photo.height} · ${fmtBytes(photo.bytes)}`]);
  return rows;
}

// ----------------------------------------------------------------------------------------------- strings

/** Japanese and English UI text. `{name}` placeholders are filled by t(). Both languages must have the same keys. */
export const I18N = {
  ja: {
    "app.title": "投稿管理",
    "app.subtitle": "気仙沼 Living City",
    "login.title": "管理者ログイン",
    "login.token": "管理トークン",
    "login.name": "お名前(操作ログ用・任意)",
    "login.submit": "ログイン",
    "login.hint": "トークンはこのタブを閉じると消えます。",
    "login.bad": "トークンが違います。",
    "login.locked": "失敗が続いたため、しばらく待ってからやり直してください。",
    "login.error": "接続できませんでした。",
    "nav.signout": "ログアウト",
    "nav.lang": "English",
    "nav.log": "操作ログ",
    "nav.export": "エクスポート",
    "nav.help": "ショートカット",
    "status.all": "すべて",
    "status.new": "未確認",
    "status.accepted": "承認",
    "status.used": "反映済み",
    "status.rejected": "却下",
    "kind.all": "全種類",
    "kind.issue": "報告",
    "kind.fix": "修正",
    "cat.all": "全カテゴリ",
    "cat.building": "建物",
    "cat.road": "道路",
    "cat.shop": "お店",
    "cat.sign": "看板",
    "cat.landmark": "ランドマーク",
    "cat.other": "その他",
    "sort.newest": "新しい順",
    "sort.oldest": "古い順",
    "search.placeholder": "ID・ニックネーム・本文で検索",
    "list.empty": "該当する投稿はありません。",
    "list.loading": "読み込み中…",
    "list.error": "一覧を読み込めませんでした。",
    "list.retry": "再読み込み",
    "list.range": "{from}–{to} / {total}件",
    "list.prev": "前へ",
    "list.next": "次へ",
    "list.photos": "写真 {n}",
    "list.nophoto": "写真なし",
    "list.select": "選択",
    "list.selectall": "このページをすべて選択",
    "list.selected": "{n}件を選択中",
    "list.markused": "反映済みにする…",
    "list.clear": "選択解除",
    "detail.pick": "一覧から投稿を選んでください。",
    "detail.back": "一覧へ",
    "detail.loading": "読み込み中…",
    "detail.error": "投稿を読み込めませんでした。",
    "detail.screenshot": "スクリーンショット",
    "detail.noscreenshot": "スクリーンショットなし",
    "detail.photos": "写真",
    "detail.nophotos": "写真は添付されていません",
    "detail.pose": "カメラの位置と向き",
    "detail.note": "メモ",
    "detail.nonote": "(メモなし)",
    "detail.contributor": "投稿者",
    "detail.review": "判定",
    "detail.created": "投稿日時",
    "detail.reviewed": "判定日時",
    "detail.id": "ID",
    "detail.lang": "言語",
    "detail.client": "端末",
    "detail.consent": "同意",
    "detail.crew": "クルーNo.",
    "detail.crewgiven": "登録あり {masked}",
    "detail.crewnone": "登録なし",
    "detail.stats": "投稿 {submissions}件 · 承認 {accepted}件 · {points}pt",
    "detail.banned": "停止中",
    "detail.original": "元ファイル",
    "detail.nopreview": "この形式はプレビューできません。元ファイルを開いてください。",
    "detail.openapp": "アプリで同じ視点を開く",
    "detail.opengsi": "地理院地図で開く",
    "detail.dist": "カメラ位置から約{m}m",
    "detail.copy": "コピー",
    "detail.copied": "コピーしました",
    "detail.photo": "写真 {n}",
    "pose.enu": "ENU座標 (m)",
    "pose.latlon": "緯度・経度",
    "pose.heading": "向き",
    "pose.pitch": "上下角",
    "pose.fov": "画角",
    "pose.mode": "モード",
    "pose.timePreset": "時間帯",
    "pose.season": "季節",
    "pose.appVersion": "アプリ",
    "pose.layoutVersion": "街データ",
    "pose.at": "撮影時刻",
    "pose.viewport": "画面",
    "exif.taken": "撮影日時",
    "exif.camera": "カメラ",
    "exif.lens": "レンズ",
    "exif.focal35": "焦点距離(35mm換算)",
    "exif.gps": "GPS",
    "exif.alt": "高度",
    "exif.accuracy": "GPS精度",
    "exif.heading": "方位",
    "exif.enu": "ENU座標 (m)",
    "exif.size": "サイズ",
    "exif.none": "位置情報なし",
    "review.accept": "承認",
    "review.acceptpts": "承認 +{n}",
    "review.reject": "却下",
    "review.used": "反映済み",
    "review.reset": "未確認に戻す",
    "review.points": "ポイント",
    "review.note": "メモ(内部用)",
    "review.next": "次へ",
    "review.notebtn": "メモ",
    "detail.more": "続きを読む",
    "detail.less": "閉じる",
    "review.saved": "保存しました",
    "review.failed": "保存できませんでした",
    "used.title": "反映したバージョン",
    "used.hint": "リリースのタグまたはコミット(例: v0.5.0)",
    "used.version": "バージョン",
    "used.bulk": "{n}件を反映済みにします。",
    "used.ok": "反映済みにする",
    "used.done": "{n}件を反映済みにしました",
    "used.skipped": "(スキップ {n}件)",
    "used.invalid": "英数字と . _ + @ / - のみ、64文字まで。",
    "used.cancel": "キャンセル",
    "contrib.ban": "この投稿者を停止",
    "contrib.unban": "停止を解除",
    "contrib.reset": "ニックネームを初期化",
    "contrib.delete": "この投稿者の全データを削除",
    "contrib.confirmban": "この投稿者を停止しますか? 新しい投稿ができなくなり、ランキングから外れます。",
    "contrib.confirmreset": "ニックネームを初期値に戻しますか?",
    "contrib.confirmdelete": "この投稿者と全投稿・写真を完全に削除します。元に戻せません。続けますか?",
    "contrib.done": "更新しました",
    "danger.delete": "この投稿を削除",
    "danger.confirm": "この投稿と写真・スクリーンショットを完全に削除します。元に戻せません。続けますか?",
    "danger.done": "削除しました",
    "export.title": "エクスポート",
    "export.crew": "クルーNo.リスト(CSV)",
    "export.crewhint": "期間内に承認した投稿のポイントを、クルーNo.ごとに集計します。日付は日本時間です。",
    "export.from": "開始日",
    "export.to": "終了日",
    "export.week": "今週",
    "export.days7": "直近7日",
    "export.month": "今月",
    "export.all": "全期間",
    "export.excel": "Excel用(クルーNo.を文字列にする)",
    "export.download": "CSVをダウンロード",
    "export.feed": "パイプライン用データ(JSON)",
    "export.feedstatus": "対象",
    "export.feeddownload": "JSONをダウンロード",
    "export.done": "ダウンロードしました",
    "export.fail": "ダウンロードできませんでした",
    "export.close": "閉じる",
    "log.title": "操作ログ",
    "log.empty": "まだありません。",
    "log.more": "さらに読み込む",
    "help.title": "キーボードショートカット",
    "help.j": "次の投稿",
    "help.k": "前の投稿",
    "help.a": "承認",
    "help.r": "却下",
    "help.u": "反映済み(バージョン入力)",
    "help.n": "未確認に戻す",
    "help.slash": "検索",
    "help.esc": "閉じる",
    "help.close": "閉じる",
    "toast.networkerror": "通信エラー。もう一度お試しください。",
    "toast.ratelimited": "リクエストが多すぎます。しばらく待ってください。",
    "toast.sessionexpired": "ログインが必要です。",
    "common.close": "閉じる",
    "common.cancel": "キャンセル",
    "common.yes": "はい",
    "common.zoom": "拡大",
  },
  en: {
    "app.title": "Contributions",
    "app.subtitle": "Kesennuma Living City",
    "login.title": "Admin sign-in",
    "login.token": "Admin token",
    "login.name": "Your name (for the activity log, optional)",
    "login.submit": "Sign in",
    "login.hint": "The token is forgotten when this tab closes.",
    "login.bad": "That token is not valid.",
    "login.locked": "Too many failed attempts. Wait a while and try again.",
    "login.error": "Could not reach the server.",
    "nav.signout": "Sign out",
    "nav.lang": "日本語",
    "nav.log": "Activity log",
    "nav.export": "Export",
    "nav.help": "Shortcuts",
    "status.all": "All",
    "status.new": "New",
    "status.accepted": "Accepted",
    "status.used": "Used",
    "status.rejected": "Rejected",
    "kind.all": "All kinds",
    "kind.issue": "Issue",
    "kind.fix": "Fix",
    "cat.all": "All categories",
    "cat.building": "Building",
    "cat.road": "Road",
    "cat.shop": "Shop",
    "cat.sign": "Sign",
    "cat.landmark": "Landmark",
    "cat.other": "Other",
    "sort.newest": "Newest first",
    "sort.oldest": "Oldest first",
    "search.placeholder": "Search id, nickname or note",
    "list.empty": "No submissions match.",
    "list.loading": "Loading…",
    "list.error": "Could not load the list.",
    "list.retry": "Retry",
    "list.range": "{from}–{to} of {total}",
    "list.prev": "Prev",
    "list.next": "Next",
    "list.photos": "{n} photos",
    "list.nophoto": "No photos",
    "list.select": "Select",
    "list.selectall": "Select this page",
    "list.selected": "{n} selected",
    "list.markused": "Mark as used…",
    "list.clear": "Clear",
    "detail.pick": "Select a submission from the list.",
    "detail.back": "Back to list",
    "detail.loading": "Loading…",
    "detail.error": "Could not load this submission.",
    "detail.screenshot": "Screenshot",
    "detail.noscreenshot": "No screenshot",
    "detail.photos": "Photos",
    "detail.nophotos": "No photos attached",
    "detail.pose": "Camera position and direction",
    "detail.note": "Note",
    "detail.nonote": "(no note)",
    "detail.contributor": "Contributor",
    "detail.review": "Decision",
    "detail.created": "Submitted",
    "detail.reviewed": "Decided",
    "detail.id": "ID",
    "detail.lang": "Language",
    "detail.client": "Device",
    "detail.consent": "Consent",
    "detail.crew": "Crew No.",
    "detail.crewgiven": "Provided {masked}",
    "detail.crewnone": "Not provided",
    "detail.stats": "{submissions} submissions · {accepted} accepted · {points} pts",
    "detail.banned": "Banned",
    "detail.original": "Original file",
    "detail.nopreview": "This format has no preview here. Open the original file.",
    "detail.openapp": "Open the same view in the app",
    "detail.opengsi": "Open in GSI map",
    "detail.dist": "about {m} m from the camera",
    "detail.copy": "Copy",
    "detail.copied": "Copied",
    "detail.photo": "Photo {n}",
    "pose.enu": "ENU position (m)",
    "pose.latlon": "Latitude, longitude",
    "pose.heading": "Heading",
    "pose.pitch": "Pitch",
    "pose.fov": "Field of view",
    "pose.mode": "Mode",
    "pose.timePreset": "Time of day",
    "pose.season": "Season",
    "pose.appVersion": "App",
    "pose.layoutVersion": "City data",
    "pose.at": "Captured",
    "pose.viewport": "Viewport",
    "exif.taken": "Taken",
    "exif.camera": "Camera",
    "exif.lens": "Lens",
    "exif.focal35": "Focal length (35 mm equiv.)",
    "exif.gps": "GPS",
    "exif.alt": "Altitude",
    "exif.accuracy": "GPS accuracy",
    "exif.heading": "Bearing",
    "exif.enu": "ENU position (m)",
    "exif.size": "Size",
    "exif.none": "No location data",
    "review.accept": "Accept",
    "review.acceptpts": "Accept +{n}",
    "review.reject": "Reject",
    "review.used": "Used",
    "review.reset": "Back to new",
    "review.points": "Points",
    "review.note": "Note (internal)",
    "review.next": "Next",
    "review.notebtn": "Note",
    "detail.more": "Show more",
    "detail.less": "Show less",
    "review.saved": "Saved",
    "review.failed": "Could not save",
    "used.title": "Release that shipped it",
    "used.hint": "A release tag or commit, e.g. v0.5.0",
    "used.version": "Version",
    "used.bulk": "Mark {n} submissions as used.",
    "used.ok": "Mark as used",
    "used.done": "Marked {n} as used",
    "used.skipped": "({n} skipped)",
    "used.invalid": "Letters, digits and . _ + @ / - only, up to 64 characters.",
    "used.cancel": "Cancel",
    "contrib.ban": "Ban this contributor",
    "contrib.unban": "Lift the ban",
    "contrib.reset": "Reset nickname",
    "contrib.delete": "Delete all of this contributor's data",
    "contrib.confirmban": "Ban this contributor? They can no longer submit and leave the leaderboard.",
    "contrib.confirmreset": "Reset the nickname to the default?",
    "contrib.confirmdelete": "Permanently delete this contributor and every submission and photo. This cannot be undone. Continue?",
    "contrib.done": "Updated",
    "danger.delete": "Delete this submission",
    "danger.confirm": "Permanently delete this submission with its photos and screenshot. This cannot be undone. Continue?",
    "danger.done": "Deleted",
    "export.title": "Export",
    "export.crew": "Crew number list (CSV)",
    "export.crewhint": "Points of the submissions accepted in the range, summed per クルーNo. Dates are Japan time.",
    "export.from": "From",
    "export.to": "To",
    "export.week": "This week",
    "export.days7": "Last 7 days",
    "export.month": "This month",
    "export.all": "All time",
    "export.excel": "Excel-safe (keep クルーNo. as text)",
    "export.download": "Download CSV",
    "export.feed": "Pipeline data (JSON)",
    "export.feedstatus": "Status",
    "export.feeddownload": "Download JSON",
    "export.done": "Downloaded",
    "export.fail": "Could not download",
    "export.close": "Close",
    "log.title": "Activity log",
    "log.empty": "Nothing yet.",
    "log.more": "Load more",
    "help.title": "Keyboard shortcuts",
    "help.j": "Next submission",
    "help.k": "Previous submission",
    "help.a": "Accept",
    "help.r": "Reject",
    "help.u": "Mark used (asks for the version)",
    "help.n": "Back to new",
    "help.slash": "Search",
    "help.esc": "Close",
    "help.close": "Close",
    "toast.networkerror": "Network error. Try again.",
    "toast.ratelimited": "Too many requests. Wait a moment.",
    "toast.sessionexpired": "Please sign in.",
    "common.close": "Close",
    "common.cancel": "Cancel",
    "common.yes": "Yes",
    "common.zoom": "Zoom",
  },
};

/**
 * The text for `key` in `lang` (falls back to English, then to the key), with {name} placeholders filled.
 * @param {"ja" | "en"} lang
 * @param {string} key
 * @param {Record<string, string | number>} [vars]
 */
export function t(lang, key, vars) {
  let s = I18N[lang]?.[key] ?? I18N.en[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
  return s;
}
