// Contributor admin page (vanilla JS, no build step). Served at /admin by server/contrib/ui.js.
//
//   * The admin token lives in sessionStorage (this tab only) and is sent as `Authorization: Bearer`; it is never put in a URL.
//   * Images are private: they are fetched with the token and shown as blob: URLs (an <img> tag cannot send headers).
//   * Everything that comes from contributors (nicknames, notes, EXIF text) is inserted with textContent, never as HTML.
//   * Layout: two panes on a laptop (list | detail), one pane on a phone with the detail as a full-screen sheet.
import {
  STATUSES, KINDS, CATEGORIES, VERSION_RE, t as translate, fmtJst, fmtTaken, relTime, gsiUrl, appCamUrl, photoPoseDistance, excerpt, fmtBytes,
  buildQuery, defaultPointsFor, nextSelection, poseRows, exifRows, lastDaysRangeJst, weekRangeJst, monthRangeJst, fmtLatLon, todayJst,
} from "./lib.js";

const CFG = (() => { try { return JSON.parse(document.getElementById("cfg").textContent); } catch { return {}; } })();
const API = CFG.api || "/api/contrib/v1";
const PAGE = 25;
const DESKTOP = window.matchMedia("(min-width: 900px)");
const WIDE_HEADER = window.matchMedia("(min-width: 700px)");

// ------------------------------------------------------------------------------------------------ storage

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  sget(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  sset(k, v) { try { sessionStorage.setItem(k, v); } catch { /* private mode */ } },
  sdel(k) { try { sessionStorage.removeItem(k); } catch { /* private mode */ } },
};

function loadFilters() {
  let f = {};
  try { f = JSON.parse(store.get("klc.admin.filters") || "{}"); } catch { f = {}; }
  return {
    status: ["all", ...STATUSES].includes(f.status) ? f.status : "new",
    kind: KINDS.includes(f.kind) ? f.kind : "",
    category: CATEGORIES.includes(f.category) ? f.category : "",
    sort: f.sort === "oldest" ? "oldest" : "newest",
    q: "", contributor: "", contributorName: "",
  };
}

const state = {
  token: store.sget("klc.admin.token") || "",
  name: store.get("klc.admin.name") || "",
  lang: store.get("klc.admin.lang") || ((navigator.language || "").toLowerCase().startsWith("ja") ? "ja" : "en"),
  filters: loadFilters(),
  list: { items: [], total: 0, offset: 0, loading: false, error: null },
  stats: null,
  selectedId: null,
  detail: null, detailLoading: false, detailError: null,
  selectMode: false, selection: new Set(),
  autoAdvance: store.get("klc.admin.advance") !== "0",
  lastVersion: store.get("klc.admin.version") || "",
};

const t = (key, vars) => translate(state.lang, key, vars);
const root = document.getElementById("app");
const ui = {};

// ---------------------------------------------------------------------------------------------- DOM helper

/** Create an element: h("button", { class: "btn", onclick }, "text", child...). Strings become text nodes. */
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (["value", "checked", "disabled", "hidden", "href", "src", "type", "download", "rel", "target", "title", "placeholder", "autocomplete", "min", "max", "step", "maxLength", "selected", "tabIndex", "name", "id", "htmlFor", "spellcheck", "rows"].includes(k)) el[k] = v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(typeof kid === "object" && kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

function toast(message, kind = "") {
  const box = document.getElementById("toasts");
  const el = h("div", { class: `toast ${kind}`, text: message });
  box.append(el);
  setTimeout(() => el.remove(), kind === "error" ? 6000 : 2800);
}

// ------------------------------------------------------------------------------------------------- network

class ApiError extends Error {
  constructor(status, code, message, retryAfter) { super(message || code || `HTTP ${status}`); this.status = status; this.code = code; this.retryAfter = retryAfter; }
}

const apiUrl = (path) => (path.startsWith("/api/") ? path : API + path);

/** Authenticated request. Returns parsed JSON, or the Response when `raw`. A 401 sends the user back to the login (unless `quiet401`). */
async function api(path, { method = "GET", body, signal, raw = false, quiet401 = false } = {}) {
  const headers = { Authorization: "Bearer " + state.token };
  if (state.name) headers["X-Admin-Name"] = encodeURIComponent(state.name);
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let res;
  try { res = await fetch(apiUrl(path), { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal, cache: "no-store" }); }
  catch (e) { if (e.name === "AbortError") throw e; throw new ApiError(0, "network", t("toast.networkerror")); }
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    const err = new ApiError(res.status, j.error, j.message, res.headers.get("retry-after"));
    if (res.status === 401 && !quiet401) signOut(t("toast.sessionexpired"));
    throw err;
  }
  return raw ? res : res.json();
}

/** Run at most `n` async jobs at once (thumbnails and previews are fetched with the token, one request each). */
function limiter(n) {
  let active = 0;
  const queue = [];
  const next = () => { while (active < n && queue.length) { active++; const { fn, resolve, reject } = queue.shift(); fn().then(resolve, reject).finally(() => { active--; next(); }); } };
  return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next(); });
}
const imageSlots = limiter(4);
const blobCache = new Map();

/** A blob: URL for a private file, fetched once with the token and cached (oldest entries are released). */
function blobUrl(path) {
  if (blobCache.has(path)) return Promise.resolve(blobCache.get(path));
  return imageSlots(async () => {
    if (blobCache.has(path)) return blobCache.get(path);
    const res = await api(path, { raw: true });
    const url = URL.createObjectURL(await res.blob());
    blobCache.set(path, url);
    if (blobCache.size > 90) { const [k, v] = blobCache.entries().next().value; URL.revokeObjectURL(v); blobCache.delete(k); }
    return url;
  });
}

function clearBlobs() { for (const v of blobCache.values()) URL.revokeObjectURL(v); blobCache.clear(); }

/** Fill an <img> with a private file; marks it .loading until it arrives. */
function loadImage(img, path, { onError } = {}) {
  img.classList.add("loading");
  blobUrl(path).then((u) => { img.src = u; img.classList.remove("loading"); }).catch((e) => { if (e.name !== "AbortError") { img.classList.remove("loading"); onError?.(e); } });
}

const lazyThumbs = "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    lazyThumbs.unobserve(e.target);
    const img = e.target.querySelector("img");
    if (img && e.target.dataset.src) loadImage(img, e.target.dataset.src, { onError: () => e.target.classList.add("failed") });
  }
}, { rootMargin: "200px" }) : null;

async function downloadFile(path, fallbackName) {
  try {
    const res = await api(path, { raw: true });
    const blob = await res.blob();
    const cd = res.headers.get("content-disposition") || "";
    const name = (/filename="([^"]+)"/.exec(cd) || [])[1] || fallbackName;
    const a = h("a", { href: URL.createObjectURL(blob), download: name });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    toast(t("export.done"), "ok");
    return true;
  } catch (e) {
    if (e.status !== 401) toast(`${t("export.fail")}: ${e.message}`, "error");
    return false;
  }
}

// ----------------------------------------------------------------------------------------------- dialogs

/** Open a modal <dialog>. `build(close)` returns its content; `close(value)` closes it and resolves the promise. */
function modal(build, { className = "" } = {}) {
  return new Promise((resolve) => {
    const dlg = h("dialog", { class: className });
    const close = (value) => { try { dlg.close(); } catch { /* already closed */ } dlg.remove(); resolve(value); };
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); close(undefined); });
    dlg.addEventListener("click", (e) => { if (e.target === dlg) close(undefined); });
    dlg.append(build(close));
    document.body.append(dlg);
    dlg.showModal();
  });
}

const askConfirm = (message, { danger = false } = {}) => modal((close) => h("div", { class: "dlg" },
  h("p", { text: message }),
  h("div", { class: "row-btns" },
    h("button", { class: "btn", type: "button", text: t("common.cancel"), onclick: () => close(false) }),
    h("button", { class: `btn ${danger ? "bad" : "primary"}`, type: "button", text: t("common.yes"), onclick: () => close(true) }),
  ))).then((v) => v === true);

/** Ask for the release (tag or commit) that shipped a fix. Resolves to the version, or undefined when cancelled. */
function askVersion({ count = 1 } = {}) {
  return modal((close) => {
    const input = h("input", { type: "text", value: state.lastVersion, placeholder: "v0.5.0", autocomplete: "off", autocapitalize: "none", autocorrect: "off", enterkeyhint: "done", spellcheck: false, maxLength: 64, "aria-label": t("used.version") });
    const err = h("div", { class: "err" });
    const submit = () => {
      const v = input.value.trim();
      if (!VERSION_RE.test(v)) { err.textContent = t("used.invalid"); input.focus(); return; }
      state.lastVersion = v; store.set("klc.admin.version", v);
      close(v);
    };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } });
    queueMicrotask(() => { input.focus(); input.select(); });
    return h("div", { class: "dlg" },
      h("h2", { text: t("used.title") }),
      count > 1 ? h("p", { text: t("used.bulk", { n: count }) }) : null,
      h("div", { class: "field" }, h("label", { text: t("used.version") }), input, h("div", { class: "muted", text: t("used.hint") }), err),
      h("div", { class: "row-btns" },
        h("button", { class: "btn", type: "button", text: t("used.cancel"), onclick: () => close(undefined) }),
        h("button", { class: "btn used", type: "button", text: t("used.ok"), onclick: submit }),
      ));
  });
}

function openLightbox(src) {
  if (!src) return;
  modal((close) => {
    const img = h("img", { src, alt: "", onclick: () => img.classList.toggle("zoomed") });
    return h("div", {}, h("button", { class: "btn x", type: "button", text: "×", "aria-label": t("common.close"), onclick: () => close() }), img);
  }, { className: "lightbox" });
}

// ------------------------------------------------------------------------------------------------- login

function showLogin(message = "") {
  clearBlobs();
  document.documentElement.lang = state.lang;
  const token = h("input", { type: "password", autocomplete: "current-password", autocapitalize: "none", autocorrect: "off", enterkeyhint: "go", spellcheck: false, "aria-label": t("login.token") });
  const name = h("input", { type: "text", value: state.name, autocomplete: "nickname", enterkeyhint: "go", maxLength: 32, "aria-label": t("login.name") });
  const err = h("div", { class: "error", role: "alert", text: message });
  const btn = h("button", { class: "btn primary", type: "submit", text: t("login.submit") });
  const form = h("form", { class: "login-card", onsubmit: async (e) => {
    e.preventDefault();
    const value = token.value.trim();
    if (!value) { token.focus(); return; }
    btn.disabled = true; err.textContent = "";
    state.token = value; state.name = name.value.trim();
    try {
      await api("/admin/stats", { quiet401: true });
      store.sset("klc.admin.token", value); store.set("klc.admin.name", state.name);
      showApp();
    } catch (ex) {
      state.token = "";
      store.sdel("klc.admin.token");
      err.textContent = ex.status === 429 ? t("login.locked") : ex.code === "network" ? t("login.error") : t("login.bad");
      btn.disabled = false;
      token.select();
    }
  } },
  h("div", { class: "login-lang" }, h("button", { class: "btn small ghost", type: "button", text: t("nav.lang"), onclick: () => { toggleLang(); showLogin(); } })),
  h("h1", { text: t("login.title") }),
  h("p", { class: "sub", text: t("app.subtitle") }),
  h("div", { class: "field" }, h("label", { text: t("login.token") }), token),
  h("div", { class: "field" }, h("label", { text: t("login.name") }), name),
  err, btn,
  h("p", { class: "muted", text: t("login.hint") }));
  root.replaceChildren(h("div", { class: "login" }, form));
  token.focus();
}

function signOut(message = "") {
  state.token = ""; store.sdel("klc.admin.token");
  state.selectedId = null; state.detail = null; state.list.items = []; state.selection.clear();
  for (const dlg of document.querySelectorAll("dialog")) { try { dlg.close(); } catch { /* not open */ } dlg.remove(); } // nothing may stay on top of the sign-in form
  showLogin(message);
}

function toggleLang() {
  state.lang = state.lang === "ja" ? "en" : "ja";
  store.set("klc.admin.lang", state.lang);
  document.documentElement.lang = state.lang;
}

// ---------------------------------------------------------------------------------------------- the shell

/** The "more" menu button replaces the Export / Log / Shortcuts buttons below 700 px. */
function syncMore() { if (ui.more) ui.more.hidden = WIDE_HEADER.matches; }
WIDE_HEADER.addEventListener("change", syncMore);

function showApp() {
  document.documentElement.lang = state.lang;
  buildShell();
  loadStats();
  loadList().then(() => routeFromHash());
}

function buildShell() {
  const tabs = h("div", { class: "tabs", role: "tablist" });
  for (const s of ["all", ...STATUSES]) {
    const count = h("span", { class: "count", dataset: { status: s }, text: "–" });
    tabs.append(h("button", { class: "tab", role: "tab", type: "button", dataset: { status: s }, "aria-selected": String(state.filters.status === s), onclick: () => setFilter({ status: s }) }, t(`status.${s}`), count));
  }
  ui.tabs = tabs;

  const search = h("input", { type: "search", class: "search", placeholder: t("search.placeholder"), value: state.filters.q, autocomplete: "off", autocapitalize: "none", autocorrect: "off", enterkeyhint: "search", spellcheck: false, "aria-label": t("search.placeholder") });
  let timer = 0;
  search.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => setFilter({ q: search.value.trim() }), 300); });
  ui.search = search;

  const sel = (options, value, onchange, label) => {
    const el = h("select", { "aria-label": label }, options.map(([v, text]) => h("option", { value: v, selected: v === value, text })));
    el.addEventListener("change", () => onchange(el.value));
    return el;
  };
  const kindSel = sel([["", t("kind.all")], ...KINDS.map((k) => [k, t(`kind.${k}`)])], state.filters.kind, (v) => setFilter({ kind: v }), t("kind.all"));
  const catSel = sel([["", t("cat.all")], ...CATEGORIES.map((c) => [c, t(`cat.${c}`)])], state.filters.category, (v) => setFilter({ category: v }), t("cat.all"));
  const sortSel = sel([["newest", t("sort.newest")], ["oldest", t("sort.oldest")]], state.filters.sort, (v) => setFilter({ sort: v }), t("sort.newest"));
  ui.contribChip = h("div", { class: "head-chips wide", hidden: true });
  ui.selectToggle = h("label", { class: "check wide", hidden: true }, h("input", { type: "checkbox", checked: state.selectMode, onchange: (e) => { state.selectMode = e.target.checked; if (!state.selectMode) state.selection.clear(); renderList(); renderBulk(); } }), t("list.select"));

  ui.rows = h("ul", { class: "rows" });
  ui.pager = h("div", { class: "pager" });
  ui.bulk = h("div", { class: "bulkbar", hidden: true });
  ui.detail = h("section", { class: "detail-pane" });

  const more = () => modal((close) => h("div", { class: "dlg" },
    h("h2", { text: t("app.title") }),
    h("div", { class: "head-chips" },
      h("button", { class: "btn", type: "button", text: t("nav.export"), onclick: () => { close(); openExport(); } }),
      h("button", { class: "btn", type: "button", text: t("nav.log"), onclick: () => { close(); openLog(); } }),
      h("button", { class: "btn", type: "button", text: t("nav.help"), onclick: () => { close(); openHelp(); } })),
    h("div", { class: "row-btns" }, h("button", { class: "btn", type: "button", text: t("common.close"), onclick: () => close() }))));

  const header = h("header", { class: "header" },
    h("div", { class: "brand" }, h("strong", { text: t("app.title") }), h("span", { text: t("app.subtitle") })),
    h("button", { class: "btn ghost hide-narrow", type: "button", text: t("nav.export"), onclick: openExport }),
    h("button", { class: "btn ghost hide-narrow", type: "button", text: t("nav.log"), onclick: openLog }),
    h("button", { class: "btn ghost hide-narrow", type: "button", text: "?", "aria-label": t("nav.help"), title: t("nav.help"), onclick: openHelp }),
    h("button", { class: "btn ghost", type: "button", text: "⋯", "aria-label": t("app.title"), id: "more", onclick: more }),
    h("button", { class: "btn ghost", type: "button", text: t("nav.lang"), onclick: () => { toggleLang(); buildShell(); renderStats(); renderList(); renderBulk(); renderDetail(); } }),
    h("button", { class: "btn ghost", type: "button", text: t("nav.signout"), onclick: () => signOut() }),
  );
  ui.more = header.querySelector("#more");
  syncMore();

  root.replaceChildren(
    header,
    h("main", { class: "main" },
      h("section", { class: "list-pane" },
        h("div", { class: "toolbar" }, tabs, h("div", { class: "filters" }, search, kindSel, catSel, sortSel, ui.contribChip, ui.selectToggle)),
        ui.rows, ui.pager),
      ui.detail),
    ui.bulk,
  );
  renderStats(); renderContribChip(); renderSelectToggle();
}

function setFilter(patch) {
  Object.assign(state.filters, patch);
  if ("status" in patch) { state.selectMode = false; state.selection.clear(); }
  state.list.offset = 0;
  state.selectedId = null; state.detail = null;
  if (/^#\/s\//.test(location.hash)) history.replaceState({}, "", location.pathname + location.search);
  renderDetail();
  store.set("klc.admin.filters", JSON.stringify({ status: state.filters.status, kind: state.filters.kind, category: state.filters.category, sort: state.filters.sort }));
  for (const tab of ui.tabs.children) tab.setAttribute("aria-selected", String(tab.dataset.status === state.filters.status));
  renderContribChip(); renderSelectToggle(); renderBulk();
  loadList();
}

function renderContribChip() {
  const f = state.filters;
  ui.contribChip.hidden = !f.contributor;
  ui.contribChip.replaceChildren(f.contributor ? h("button", { class: "btn small", type: "button", onclick: () => setFilter({ contributor: "", contributorName: "" }) }, `${t("detail.contributor")}: ${f.contributorName || f.contributor.slice(0, 6)}  ×`) : "");
}

function renderSelectToggle() {
  ui.selectToggle.hidden = state.filters.status !== "accepted";
  ui.selectToggle.querySelector("input").checked = state.selectMode;
}

// ------------------------------------------------------------------------------------------------- stats

async function loadStats() {
  try { state.stats = await api("/admin/stats"); renderStats(); } catch { /* the list shows errors */ }
}

function renderStats() {
  if (!ui.tabs) return;
  const s = state.stats?.byStatus;
  for (const c of ui.tabs.querySelectorAll(".count")) {
    const k = c.dataset.status;
    c.textContent = s ? String(k === "all" ? s.new + s.accepted + s.used + s.rejected : s[k]) : "–";
  }
}

// -------------------------------------------------------------------------------------------------- list

let listAbort = null;

/**
 * Load the current page of the list. `silent` re-syncs it in the background (after a decision removed a row, the
 * rows behind it slide up and the offsets would otherwise drift): no skeleton, no auto-selection, and it never
 * interrupts a load the user started.
 */
async function loadList({ silent = false } = {}) {
  if (silent && state.list.loading) return;
  listAbort?.abort();
  const ac = new AbortController();
  listAbort = ac;
  if (!silent) { state.list.loading = true; state.list.error = null; renderList(); }
  const f = state.filters;
  try {
    const data = await api("/admin/submissions" + buildQuery({ status: f.status === "all" ? "" : f.status, kind: f.kind, category: f.category, q: f.q, contributor: f.contributor, sort: f.sort, limit: PAGE, offset: state.list.offset }), { signal: ac.signal });
    if (!data.items.length && data.total > 0 && state.list.offset > 0) { state.list.offset = Math.floor((data.total - 1) / PAGE) * PAGE; return loadList({ silent }); }
    state.list.items = data.items; state.list.total = data.total;
    state.list.error = null;
  } catch (e) {
    if (e.name === "AbortError") return;
    if (silent) return; // a background re-sync that fails changes nothing the user can see
    state.list.error = e;
  }
  state.list.loading = false;
  renderList(); renderBulk();
  if (!silent && DESKTOP.matches && !state.selectedId && state.list.items.length) select(state.list.items[0].id, { replace: true });
}

function statusChip(status) { return h("span", { class: `chip ${status}`, text: t(`status.${status}`) }); }
const kindChip = (kind) => h("span", { class: `chip kind-${kind}`, text: t(`kind.${kind}`) });
const catChip = (c) => h("span", { class: "chip cat", text: t(`cat.${c}`) });

function renderRow(item) {
  const thumb = h("div", { class: "thumb", dataset: item.thumbUrl ? { src: item.thumbUrl } : {} }, item.thumbUrl ? h("img", { alt: "", decoding: "async" }) : h("span", { text: t("detail.noscreenshot") }));
  if (item.thumbUrl) { if (lazyThumbs) lazyThumbs.observe(thumb); else loadImage(thumb.querySelector("img"), item.thumbUrl); }
  const pick = state.selectMode ? h("div", { class: "pick" }, h("input", { type: "checkbox", checked: state.selection.has(item.id), "aria-label": item.id, onclick: (e) => e.stopPropagation(), onchange: (e) => { if (e.target.checked) state.selection.add(item.id); else state.selection.delete(item.id); renderBulk(); } })) : null;
  const meta = h("div", { class: "row-meta" },
    h("span", { title: fmtJst(item.createdAt) + " JST", text: relTime(item.createdAt, Date.now(), state.lang) }),
    h("span", { text: item.photoCount ? t("list.photos", { n: item.photoCount }) : t("list.nophoto") }),
    item.location ? h("span", { text: "📍" }) : null,
    item.status === "accepted" || item.status === "used" ? h("span", { text: `+${item.points}` }) : null,
    item.usedVersion ? h("span", { text: item.usedVersion }) : null,
    h("span", { class: "mono", text: item.id.slice(0, 8) }),
  );
  const row = h("div", {
    class: state.selectMode ? "row" : "row no-select", role: "button", tabIndex: 0, dataset: { id: item.id }, "aria-current": String(item.id === state.selectedId),
    onclick: () => select(item.id, { push: !DESKTOP.matches }),
    onkeydown: (e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); select(item.id, { push: !DESKTOP.matches }); } }, // not when a checkbox inside the row has the key
  }, pick, thumb,
  h("div", {},
    h("div", { class: "row-top" }, statusChip(item.status), kindChip(item.kind), catChip(item.category), item.contributor.banned ? h("span", { class: "chip banned", text: t("detail.banned") }) : null),
    h("div", { class: "row-name", text: item.contributor.nickname }),
    h("p", { class: "row-note", text: excerpt(item.note, 160) || t("detail.nonote") }),
    meta));
  return h("li", {}, row);
}

function renderList() {
  if (!ui.rows) return;
  const { items, total, offset, loading, error } = state.list;
  ui.rows.replaceChildren();
  if (loading && !items.length) {
    for (let i = 0; i < 5; i++) ui.rows.append(h("li", {}, h("div", { class: "row no-select skeleton" }, h("div", { class: "thumb" }), h("div", {}, h("div", { class: "line" }), h("div", { class: "line" })))));
  } else if (error) {
    ui.rows.append(h("li", {}, h("div", { class: "errorbox" }, h("div", { text: error.status === 429 ? t("toast.ratelimited") : t("list.error") }), h("button", { class: "btn", type: "button", text: t("list.retry"), onclick: () => loadList() }))));
  } else if (!items.length) {
    ui.rows.append(h("li", {}, h("div", { class: "empty", text: t("list.empty") })));
  } else {
    for (const it of items) ui.rows.append(renderRow(it));
  }
  const from = total ? offset + 1 : 0, to = Math.min(total, offset + items.length);
  ui.pager.replaceChildren(
    h("button", { class: "btn small", type: "button", text: "‹ " + t("list.prev"), disabled: offset === 0 || loading, onclick: () => { state.list.offset = Math.max(0, offset - PAGE); loadList(); } }),
    h("span", { text: t("list.range", { from, to, total }) }),
    h("button", { class: "btn small", type: "button", text: t("list.next") + " ›", disabled: offset + PAGE >= total || loading, onclick: () => { state.list.offset = offset + PAGE; loadList(); } }),
  );
}

function renderBulk() {
  if (!ui.bulk) return;
  const n = state.selection.size;
  ui.bulk.hidden = !(state.selectMode && state.filters.status === "accepted");
  if (ui.bulk.hidden) return;
  ui.bulk.replaceChildren(
    h("div", {}, h("strong", { text: t("list.selected", { n }) }), " ", h("button", { class: "btn small ghost", type: "button", text: t("list.selectall"), onclick: () => { for (const it of state.list.items) state.selection.add(it.id); renderList(); renderBulk(); } })),
    h("div", { class: "head-chips" },
      h("button", { class: "btn small", type: "button", text: t("list.clear"), disabled: !n, onclick: () => { state.selection.clear(); renderList(); renderBulk(); } }),
      h("button", { class: "btn used", type: "button", text: t("list.markused"), disabled: !n, onclick: bulkMarkUsed })));
}

async function bulkMarkUsed() {
  const ids = [...state.selection];
  const version = await askVersion({ count: ids.length });
  if (!version) return;
  try {
    const r = await api("/admin/submissions/mark-used", { method: "POST", body: { ids, version } });
    toast(`${t("used.done", { n: r.updated.length })} ${r.skipped.length ? t("used.skipped", { n: r.skipped.length }) : ""}`.trim(), "ok");
    state.selection.clear();
    await Promise.all([loadList(), loadStats()]);
    if (state.selectedId) loadDetail(state.selectedId);
  } catch (e) { if (e.status !== 401) toast(`${t("review.failed")}: ${e.message}`, "error"); }
}

// ------------------------------------------------------------------------------------------------ detail

let detailAbort = null;

function select(id, { push = false, replace = false } = {}) {
  state.selectedId = id;
  for (const r of ui.rows.querySelectorAll(".row")) r.setAttribute("aria-current", String(r.dataset.id === id));
  const url = "#/s/" + id;
  if (push && location.hash !== url) history.pushState({ detail: true }, "", url);
  else if (replace || location.hash !== url) history.replaceState({ detail: DESKTOP.matches ? false : history.state?.detail || false }, "", url);
  loadDetail(id);
}

function closeDetail() {
  state.selectedId = null; state.detail = null;
  for (const r of ui.rows.querySelectorAll(".row")) r.setAttribute("aria-current", "false");
  if (history.state?.detail) history.back(); else history.replaceState({}, "", location.pathname + location.search);
  renderDetail();
}

function routeFromHash() {
  const m = /^#\/s\/([a-z0-9]{8,40})$/.exec(location.hash);
  if (m) { if (state.selectedId !== m[1]) { state.selectedId = m[1]; for (const r of ui.rows.querySelectorAll(".row")) r.setAttribute("aria-current", String(r.dataset.id === m[1])); loadDetail(m[1]); } }
  else if (state.selectedId) { state.selectedId = null; state.detail = null; renderDetail(); }
}
window.addEventListener("popstate", () => { if (state.token && ui.detail) routeFromHash(); });

async function loadDetail(id) {
  detailAbort?.abort();
  const ac = new AbortController();
  detailAbort = ac;
  state.detail = null; state.detailError = null; state.detailLoading = true;
  renderDetail();
  ui.detail.scrollTop = 0;
  try {
    const d = await api(`/admin/submissions/${id}`, { signal: ac.signal });
    if (state.selectedId !== id) return;
    state.detail = d;
  } catch (e) {
    if (e.name === "AbortError") return;
    state.detailError = e;
  }
  state.detailLoading = false;
  renderDetail();
}

const kv = (rows) => h("dl", { class: "kv" }, rows.filter(Boolean).flatMap(([k, v]) => [h("dt", { text: k }), h("dd", {}, v)]));

function copyButton(text) {
  return h("button", { class: "btn small ghost", type: "button", text: t("detail.copy"), onclick: async (e) => {
    const btn = e.currentTarget; // (currentTarget is gone after the first await)
    try { await navigator.clipboard.writeText(text); toast(t("detail.copied"), "ok"); } catch { const el = h("textarea", { value: text }); document.body.append(el); el.select(); try { document.execCommand("copy"); toast(t("detail.copied"), "ok"); } catch { /* no clipboard */ } el.remove(); }
    btn.blur();
  } });
}

/** The note, clamped to a few lines with a "more" toggle when it is long, so it never pushes the screenshot out of view. */
function noteBlock(note) {
  const p = h("p", { class: "note clamped", text: note || t("detail.nonote") });
  const wrap = h("div", { class: "note-wrap" }, p);
  requestAnimationFrame(() => {
    if (p.scrollHeight <= p.clientHeight + 2) { p.classList.remove("clamped"); return; }
    const more = h("button", { class: "btn small ghost", type: "button", text: t("detail.more"), onclick: () => { const open = p.classList.toggle("clamped"); more.textContent = open ? t("detail.more") : t("detail.less"); } });
    wrap.append(more);
  });
  return wrap;
}

function renderDetail() {
  const el = ui.detail;
  if (!el) return;
  el.classList.toggle("open", Boolean(state.selectedId));
  if (!state.selectedId) { el.replaceChildren(h("div", { class: "detail-empty", text: t("detail.pick") })); return; }
  const bar = (title) => h("div", { class: "detail-bar" },
    h("button", { class: "btn small back", type: "button", text: "‹ " + t("detail.back"), onclick: closeDetail }),
    h("span", { class: "title", text: title }),
    h("button", { class: "btn small", type: "button", "aria-label": t("help.k"), text: "↑", onclick: () => step(-1) }),
    h("button", { class: "btn small", type: "button", "aria-label": t("help.j"), text: "↓", onclick: () => step(1) }));
  if (state.detailLoading) { el.replaceChildren(bar(state.selectedId.slice(0, 8)), h("div", { class: "detail-body" }, h("div", { class: "card skeleton" }, h("div", { class: "line" }), h("div", { class: "line" }), h("div", { class: "line" })))); return; }
  if (state.detailError || !state.detail) {
    el.replaceChildren(bar(state.selectedId.slice(0, 8)), h("div", { class: "errorbox" }, h("div", { text: t("detail.error") }), h("button", { class: "btn", type: "button", text: t("list.retry"), onclick: () => loadDetail(state.selectedId) })));
    return;
  }
  const d = state.detail;

  // --- header card
  const head = h("div", { class: "card" },
    h("div", { class: "head-chips" }, statusChip(d.status), kindChip(d.kind), catChip(d.category), d.contributor.banned ? h("span", { class: "chip banned", text: t("detail.banned") }) : null),
    noteBlock(d.note),
    kv([
      [t("detail.id"), h("span", {}, h("span", { class: "mono", text: d.id }), " ", copyButton(d.id))],
      [t("detail.created"), `${fmtJst(d.createdAt)} JST · ${relTime(d.createdAt, Date.now(), state.lang)}`],
      d.reviewedAt ? [t("detail.reviewed"), `${fmtJst(d.reviewedAt)} JST`] : null,
      d.status === "accepted" || d.status === "used" ? [t("review.points"), `${d.points}`] : null,
      d.usedVersion ? [t("status.used"), `${d.usedVersion} · ${fmtJst(d.usedAt)} JST`] : null,
      d.reviewerNote ? [t("review.note"), d.reviewerNote] : null,
      d.lang ? [t("detail.lang"), d.lang] : null,
    ]));

  // --- screenshot
  const shotImg = d.screenshot ? h("img", { class: "shot-img", alt: t("detail.screenshot"), decoding: "async", onclick: (e) => openLightbox(e.currentTarget.src) }) : null;
  if (shotImg) loadImage(shotImg, d.screenshot.url, { onError: () => shotImg.replaceWith(h("div", { class: "nopreview", text: t("detail.error") })) });
  const camUrl = appCamUrl(CFG.appUrl, d.pose);
  const poseLatLon = d.pose?.latlon;
  const shotCard = h("div", { class: "card" },
    h("h2", { text: t("detail.screenshot") }),
    shotImg || h("div", { class: "nopreview", text: t("detail.noscreenshot") }),
    h("div", { class: "links" },
      camUrl ? h("a", { class: "btn small", href: camUrl, target: "_blank", rel: "noopener noreferrer", text: t("detail.openapp") }) : null,
      poseLatLon ? h("a", { class: "btn small", href: gsiUrl(poseLatLon[0], poseLatLon[1]), target: "_blank", rel: "noopener noreferrer", text: t("detail.opengsi") }) : null));

  // --- photos
  const photoCards = d.photos.map((p) => {
    const dist = photoPoseDistance(p, d.pose);
    const img = p.previewUrl ? h("img", { class: "photo-img", alt: t("detail.photo", { n: p.n }), decoding: "async", onclick: (e) => openLightbox(e.currentTarget.src) }) : null;
    if (img) loadImage(img, p.previewUrl);
    const rows = exifRows(p).map(([k, v]) => [t(k), v]);
    return h("div", { class: "photo" },
      h("h3", {}, h("span", { text: t("detail.photo", { n: p.n }) }), h("span", { class: "muted", text: fmtBytes(p.bytes) })),
      img || h("div", { class: "nopreview", text: t("detail.nopreview") }),
      rows.length ? kv(rows) : h("div", { class: "muted", text: t("exif.none") }),
      dist !== null ? h("div", { class: `dist ${dist > 150 ? "far" : ""}`, text: t("detail.dist", { m: Math.round(dist) }) }) : null,
      h("div", { class: "links" },
        Number.isFinite(p.lat) ? h("a", { class: "btn small", href: gsiUrl(p.lat, p.lon), target: "_blank", rel: "noopener noreferrer", text: t("detail.opengsi") }) : null,
        h("button", { class: "btn small", type: "button", text: t("detail.original"), onclick: () => downloadFile(p.url + "?download=1", `photo-${p.n}`) })));
  });
  const photosCard = h("div", { class: "card" }, h("h2", { text: `${t("detail.photos")} (${d.photos.length})` }), d.photos.length ? h("div", { class: "photos" }, photoCards) : h("div", { class: "muted", text: t("detail.nophotos") }));

  // --- pose
  const rows = poseRows(d.pose).map(([k, v]) => [t(k), v]);
  const poseCard = rows.length ? h("div", { class: "card" }, h("h2", { text: t("detail.pose") }), kv(rows)) : null;

  // --- contributor
  const c = d.contributor;
  const contribCard = h("div", { class: "card" },
    h("h2", { text: t("detail.contributor") }),
    kv([
      [t("detail.contributor"), h("span", {}, h("strong", { text: c.nickname }), " ", c.banned ? h("span", { class: "chip banned", text: t("detail.banned") }) : null)],
      [t("detail.crew"), c.hasCrewNo ? t("detail.crewgiven", { masked: c.crewNoMasked }) : t("detail.crewnone")],
      [t("detail.client"), excerpt(d.client?.ua || "", 90) || "—"],
      [t("detail.consent"), d.client?.consent ? `v${d.client.consent.version}` : "—"],
    ]),
    h("p", { class: "muted", text: t("detail.stats", { submissions: c.submissions, accepted: c.accepted, points: c.points }) }),
    h("div", { class: "contrib-actions" },
      h("button", { class: "btn small", type: "button", text: `${t("detail.contributor")}: ${c.submissions}`, onclick: () => { setFilter({ contributor: c.id, contributorName: c.nickname, status: "all" }); } }),
      h("button", { class: "btn small danger-outline", type: "button", text: c.banned ? t("contrib.unban") : t("contrib.ban"), onclick: () => contributorAction(c.banned ? "unban" : "ban") }),
      h("button", { class: "btn small", type: "button", text: t("contrib.reset"), onclick: () => contributorAction("reset") }),
      h("button", { class: "btn small danger-outline", type: "button", text: t("contrib.delete"), onclick: () => contributorAction("delete") })));

  const danger = h("div", { class: "card danger-zone" }, h("h2", { text: t("danger.delete") }), h("button", { class: "btn danger-outline", type: "button", text: t("danger.delete"), onclick: deleteSubmission }));

  el.replaceChildren(
    bar(`${c.nickname} · ${d.id.slice(0, 8)}`),
    h("div", { class: "detail-body" }, head, shotCard, photosCard, poseCard, contribCard, danger),
    reviewBar(d),
  );
}

function reviewBar(d) {
  const accepting = d.status === "accepted" || d.status === "used";
  const def = defaultPointsFor(d.kind, CFG.points);
  const points = h("input", { type: "number", min: 0, max: 10000, step: 1, value: accepting && d.points > 0 ? d.points : def, inputMode: "numeric", "aria-label": t("review.points") });
  const note = h("textarea", { rows: 2, maxLength: 1000, value: d.reviewerNote || "", placeholder: t("review.note"), "aria-label": t("review.note"), hidden: !d.reviewerNote });
  const noteBtn = h("button", { class: "btn small", type: "button", "aria-expanded": String(Boolean(d.reviewerNote)), onclick: () => { note.hidden = !note.hidden; noteBtn.setAttribute("aria-expanded", String(!note.hidden)); if (!note.hidden) note.focus(); } }, t("review.notebtn"));
  const acceptBtn = h("button", { class: "btn ok", type: "button", onclick: () => decide("accepted") });
  const syncAccept = () => { acceptBtn.textContent = t("review.acceptpts", { n: Number.parseInt(points.value, 10) || 0 }); };
  points.addEventListener("input", syncAccept); syncAccept();
  const bump = (delta) => { points.value = String(Math.max(0, (Number.parseInt(points.value, 10) || 0) + delta)); syncAccept(); };
  ui.points = points; ui.reviewNote = note;
  return h("div", { class: "actions" },
    h("div", { class: "actions-top" },
      h("div", { class: "stepper", role: "group", "aria-label": t("review.points") },
        h("button", { class: "btn", type: "button", text: "−", "aria-label": "−5", onclick: () => bump(-5) }), points,
        h("button", { class: "btn", type: "button", text: "+", "aria-label": "+5", onclick: () => bump(5) })),
      noteBtn,
      h("label", { class: "check next" }, h("input", { type: "checkbox", checked: state.autoAdvance, onchange: (e) => { state.autoAdvance = e.target.checked; store.set("klc.admin.advance", e.target.checked ? "1" : "0"); } }), t("review.next"))),
    note,
    h("div", { class: "decide" },
      acceptBtn,
      h("button", { class: "btn bad", type: "button", text: t("review.reject"), onclick: () => decide("rejected") }),
      h("button", { class: "btn used", type: "button", text: t("review.used"), onclick: () => decide("used") }),
      h("button", { class: "btn", type: "button", text: "↺", "aria-label": t("review.reset"), title: t("review.reset"), onclick: () => decide("new") })));
}

/** Move the selection to the previous (-1) or next (+1) row of the current page. */
function step(delta) {
  const items = state.list.items;
  const i = items.findIndex((x) => x.id === state.selectedId);
  const j = i + delta;
  if (j < 0 || j >= items.length) return;
  select(items[j].id, { replace: true });
  ui.rows.querySelector(`[data-id="${items[j].id}"]`)?.scrollIntoView({ block: "nearest" });
}

let deciding = false;

async function decide(status) {
  const d = state.detail;
  if (!d || deciding) return;
  let version;
  if (status === "used") { version = await askVersion(); if (!version) return; }
  deciding = true;
  const body = { status, reviewerNote: ui.reviewNote.value };
  if (status === "accepted" || status === "used") body.points = Number.parseInt(ui.points.value, 10) || 0;
  if (version) body.version = version;
  try {
    const updated = await api(`/admin/submissions/${d.id}`, { method: "POST", body });
    toast(`${t("review.saved")} · ${t(`status.${updated.status}`)}${updated.status === "accepted" || updated.status === "used" ? ` +${updated.points}` : ""}`, "ok");
    afterDecision(updated);
  } catch (e) {
    if (e.status !== 401) toast(`${t("review.failed")}: ${e.message}`, "error");
  } finally { deciding = false; }
}

/** Update the list after a decision and move on to the next submission (when "go to the next" is on). */
function afterDecision(updated) {
  const items = state.list.items;
  const i = items.findIndex((x) => x.id === updated.id);
  const filter = state.filters.status;
  const leaves = i >= 0 && filter !== "all" && updated.status !== filter;
  if (i >= 0) {
    if (leaves) { items.splice(i, 1); state.list.total = Math.max(0, state.list.total - 1); }
    else Object.assign(items[i], { status: updated.status, points: updated.points, usedVersion: updated.usedVersion, usedAt: updated.usedAt, reviewedAt: updated.reviewedAt });
  }
  loadStats();
  renderList();
  if (leaves) loadList({ silent: true }); // re-sync the page: the rows behind the removed one slid up, and offsets must not drift
  if (state.autoAdvance && i >= 0) {
    // the next row (after a removal it has slid into the same index); at the end of the page, the previous one
    const j = leaves ? nextSelection(i, items.length) : Math.min(i + 1, items.length - 1);
    if (j >= 0 && items[j] && items[j].id !== updated.id) {
      select(items[j].id, { replace: true });
      ui.rows.querySelector(`[data-id="${items[j].id}"]`)?.scrollIntoView({ block: "nearest" });
      return;
    }
  }
  state.detail = updated;
  renderDetail();
  if (!state.list.items.length && state.list.total > 0) loadList(); // the page emptied: fetch the next one
}

async function deleteSubmission() {
  const d = state.detail;
  if (!d || !(await askConfirm(t("danger.confirm"), { danger: true }))) return;
  try {
    await api(`/admin/submissions/${d.id}`, { method: "DELETE" });
    toast(t("danger.done"), "ok");
    const i = state.list.items.findIndex((x) => x.id === d.id);
    if (i >= 0) { state.list.items.splice(i, 1); state.list.total = Math.max(0, state.list.total - 1); }
    loadStats();
    renderList();
    const next = state.list.items[Math.min(i, state.list.items.length - 1)];
    if (next && DESKTOP.matches) select(next.id, { replace: true }); else closeDetail();
  } catch (e) { if (e.status !== 401) toast(`${t("review.failed")}: ${e.message}`, "error"); }
}

async function contributorAction(kind) {
  const d = state.detail;
  if (!d) return;
  const id = d.contributor.id;
  const msg = { ban: "contrib.confirmban", unban: null, reset: "contrib.confirmreset", delete: "contrib.confirmdelete" }[kind];
  if (msg && !(await askConfirm(t(msg), { danger: kind !== "reset" }))) return;
  try {
    if (kind === "delete") await api(`/admin/contributors/${id}`, { method: "DELETE" });
    else await api(`/admin/contributors/${id}`, { method: "POST", body: kind === "reset" ? { nickname: null } : { banned: kind === "ban" } });
    toast(t("contrib.done"), "ok");
    loadStats();
    if (kind === "delete") { state.selectedId = null; state.detail = null; await loadList(); closeDetail(); }
    else { await loadList(); loadDetail(d.id); }
  } catch (e) { if (e.status !== 401) toast(`${t("review.failed")}: ${e.message}`, "error"); }
}

// --------------------------------------------------------------------------------------- export, log, help

function openExport() {
  modal((close) => {
    const from = h("input", { type: "date", "aria-label": t("export.from") }), to = h("input", { type: "date", "aria-label": t("export.to") });
    const excel = h("input", { type: "checkbox", checked: true });
    const setRange = (r) => { from.value = r?.from || ""; to.value = r?.to || ""; };
    const now = Date.now();
    const feedStatus = h("select", { "aria-label": t("export.feedstatus") }, ["accepted", "used", "new", "rejected", "all"].map((s) => h("option", { value: s, text: s === "all" ? t("status.all") : t(`status.${s}`) })));
    return h("div", { class: "dlg" },
      h("h2", { text: t("export.title") }),
      h("div", { class: "section" },
        h("h3", { text: t("export.crew") }),
        h("p", { class: "muted", text: t("export.crewhint") }),
        h("div", { class: "quick" },
          h("button", { class: "btn small", type: "button", text: t("export.week"), onclick: () => setRange(weekRangeJst(now)) }),
          h("button", { class: "btn small", type: "button", text: t("export.days7"), onclick: () => setRange(lastDaysRangeJst(now, 7)) }),
          h("button", { class: "btn small", type: "button", text: t("export.month"), onclick: () => setRange(monthRangeJst(now)) }),
          h("button", { class: "btn small", type: "button", text: t("export.all"), onclick: () => setRange(null) })),
        h("div", { class: "two" }, h("div", {}, h("label", { text: t("export.from") }), from), h("div", {}, h("label", { text: t("export.to") }), to)),
        h("label", { class: "check" }, excel, t("export.excel")),
        h("div", { class: "row-btns" }, h("button", { class: "btn primary", type: "button", text: t("export.download"), onclick: () => downloadFile("/admin/export/crew.csv" + buildQuery({ from: from.value, to: to.value, excel: excel.checked ? "" : "0" }), `crew-${todayJst(Date.now())}.csv`) }))),
      h("div", { class: "section" },
        h("h3", { text: t("export.feed") }),
        h("div", { class: "field" }, h("label", { text: t("export.feedstatus") }), feedStatus),
        h("div", { class: "row-btns" }, h("button", { class: "btn", type: "button", text: t("export.feeddownload"), onclick: () => downloadFile("/admin/export/submissions.json" + buildQuery({ status: feedStatus.value }), `submissions-${todayJst(Date.now())}.json`) }))),
      h("div", { class: "row-btns" }, h("button", { class: "btn", type: "button", text: t("export.close"), onclick: () => close() })));
  });
}

function openLog() {
  modal((close) => {
    const list = h("ul", { class: "log" });
    const more = h("button", { class: "btn small", type: "button", text: t("log.more"), hidden: true });
    let offset = 0;
    const load = async () => {
      try {
        const data = await api("/admin/audit" + buildQuery({ limit: 50, offset }));
        for (const a of data.items) {
          const detail = a.detail ? Object.entries(a.detail).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(" → ") : v}`).join(" · ") : "";
          list.append(h("li", {}, h("div", { class: "when", text: `${fmtJst(a.at)} JST · ${a.actor}` }), h("div", {}, h("strong", { text: a.action }), a.target ? ` ${a.target.slice(0, 12)}` : ""), detail ? h("div", { class: "muted", text: detail }) : null));
        }
        offset += data.items.length;
        more.hidden = offset >= data.total;
        if (!data.total) list.append(h("li", { class: "muted", text: t("log.empty") }));
      } catch (e) { if (e.status !== 401) list.append(h("li", { class: "err", text: e.message })); }
    };
    more.addEventListener("click", load);
    load();
    return h("div", { class: "dlg" }, h("h2", { text: t("log.title") }), list, h("div", { class: "row-btns" }, more, h("button", { class: "btn", type: "button", text: t("common.close"), onclick: () => close() })));
  });
}

function openHelp() {
  modal((close) => h("div", { class: "dlg" },
    h("h2", { text: t("help.title") }),
    h("dl", { class: "help-list" },
      [["j / ↓", "help.j"], ["k / ↑", "help.k"], ["a", "help.a"], ["r", "help.r"], ["u", "help.u"], ["n", "help.n"], ["/", "help.slash"], ["Esc", "help.esc"]].flatMap(([key, label]) => [h("dt", {}, h("kbd", { text: key })), h("dd", { text: t(label) })])),
    h("div", { class: "row-btns" }, h("button", { class: "btn", type: "button", text: t("help.close"), onclick: () => close() }))));
}

// ---------------------------------------------------------------------------------------------- keyboard

document.addEventListener("keydown", (e) => {
  if (!state.token || !ui.rows || e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.querySelector("dialog[open]")) return;
  const tag = (e.target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable) { if (e.key === "Escape") e.target.blur(); return; }
  // a decision awards points and changes what the DMO sees: holding a key must never decide a run of submissions
  const decision = { a: "accepted", r: "rejected", u: "used", n: "new" }[e.key];
  if (decision) {
    e.preventDefault(); // the "u" would otherwise be typed into the version field the dialog focuses in this very keydown
    if (!e.repeat && state.detail) decide(decision);
    return;
  }
  switch (e.key) {
    case "j": case "ArrowDown": e.preventDefault(); step(1); break;
    case "k": case "ArrowUp": e.preventDefault(); step(-1); break;
    case "/": e.preventDefault(); ui.search.focus(); break;
    case "?": openHelp(); break;
    case "Escape": if (state.selectedId && !DESKTOP.matches) closeDetail(); break;
    default:
  }
});

// -------------------------------------------------------------------------------------------------- start

if (state.token) showApp(); else showLogin();
