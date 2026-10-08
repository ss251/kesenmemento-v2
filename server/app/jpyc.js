// JPYC EC read proxy for the production server (server/app/server.js). Pure: no Bun globals, no files, no clock of its own (fetch and now are injected), so
// test/jpyc-proxy.test.js drives every path with a mocked fetch. docs/jpyc/README.md is the whole story; this header is the contract.
//
//   GET /api/jpyc/shops/:slug/products   the shop's public products        -> { ok, shop, products[], fetched_at, age_s, stale }
//   GET /api/jpyc/products/:id           one product of an allowed shop     -> { ok, shop, product, fetched_at, age_s, stale }
//
// What it is: a cache between the browser and https://ec.jpyc-service.com/api/v1 (shops/{slug}/products, products/{id}). The platform rate-limits by IP, and a
// room full of phones at PIER7 shares one IP; the server asks once per five minutes whatever the number of visitors. What it is not: a relay.
//   - ALLOWLIST. Only the shop slugs of data/shops/jpyc.json that are switched on (and, for /products/:id, only products of those shops) are ever requested upstream: a 'demo' entry
//     only with "enabled": true, a 'kesennuma' entry only with its consent record (and not "enabled": false), here as in the app (jpyc-lib.js entryVisible; test/jpyc-schema.test.js
//     pins that both agree). The shipped file has the demo off, so a production server with it asks the platform for nothing and answers 404 to every shop. JPYC_DEV=1 lifts the switch on a dev server.
//   - READ ONLY, NO IDENTITY. GET only, fixed headers (accept, user-agent), no cookies or credentials in either direction, no client header reaches the platform.
//   - FIELDS. Only what the panel shows leaves this module (name, price, first image, stock and availability, product page slug, shop slug / name / is_demo /
//     chains). The shop's wallet address, descriptions, tags, variants' text, SNS links and everything else the platform sends are dropped, and every kept value
//     is type-checked (an image URL must be https, a price must be a decimal).
//   - KIND MUST MATCH. An entry of kind 'demo' answers only while the platform says is_demo = true, and any other kind only while it says false: a demo label
//     can never end up on a real shop, nor a real shop's products under the demo's.
//   - ALCOHOL IS HELD. Mail-order sake and other alcohol need the seller's licence and an age check, so a product that looks like alcohol is never listed, and nothing of a shop that is a brewery,
//     a sake maker or a wine shop, unless the shop's row in data/shops/jpyc.json declares both (`alcohol: { mailOrderLicence, ageCheck, confirmed }`); `notAlcohol: [ids]` is a person's
//     exception for a product the words wrongly catch. The platform has no alcohol flag, so the words are read (looksLikeAlcohol, shopSellsAlcohol below).
// Freshness (HTTP's own words): fresh for TTL_MS (5 min); then stale-while-revalidate for SWR_MS (5 min more): the old copy is served at once and refreshed in the
// background; older than that the request waits for the platform (TIMEOUT_MS = 10 s); if the platform fails (timeout, network, 5xx, 429, a page that is not the
// API's JSON) the old copy is served with stale: true (stale-if-error, up to STALE_MAX_MS = 24 h), else the request fails with a code the panel has words for.
// Concurrent requests for one key share one upstream call. After a failure the key rests for ERROR_BACKOFF_MS, a 429 or 503 with Retry-After rests the whole proxy,
// and at most UPSTREAM_BUDGET.limit upstream calls are made per minute (the platform's own limit is 30 per 60 s per IP, shared with whoever else uses that IP).
// Warm-up (opt-in: `warm`, the server turns it on): every WARM_EVERY_MS (4 min) each allowlisted shop's list is refreshed in the background, and once at start, so the first visitor after
// a deploy or a quiet hour does not wait three seconds for the platform; the same rules apply (single flight, the budget, the rest after a failure, a 429's cooldown). Product-by-id answers are not warmed.

export const UPSTREAM = "https://ec.jpyc-service.com";
export const PREFIX = "/api/jpyc";
export const TTL_MS = 5 * 60 * 1000;
export const SWR_MS = 5 * 60 * 1000;
export const STALE_MAX_MS = 24 * 60 * 60 * 1000;
export const TIMEOUT_MS = 10 * 1000;
export const ERROR_BACKOFF_MS = 15 * 1000;
export const NOT_FOUND_TTL_MS = 60 * 1000;
export const WARM_EVERY_MS = 4 * 60 * 1000;
export const MAX_BODY_BYTES = 2 * 1024 * 1024;
export const MAX_PRODUCTS = 60;
export const MAX_ENTRIES = 400;
export const UPSTREAM_BUDGET = Object.freeze({ limit: 20, windowMs: 60 * 1000 });
export const USER_AGENT = "KesenMemento-jpyc-proxy/1 (+https://kesennuma-living-city-production.up.railway.app/; read-only cache, GET only)";
export const CONSENT_SCOPES = Object.freeze(["jpyc-listing", "display-web", "display-event"]);
export const KINDS = Object.freeze(["kesennuma", "demo"]);

/** Safe path segments: a shop slug or a product id goes into the upstream URL only when it is one of these (no slash, dot, percent, query or fragment). */
export const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
export const ID_RE = SLUG_RE;

// ------------------------------------------------------------------ the data file: consent, allowlist
const DAY_MS = 24 * 3600 * 1000;
const isStr = (v) => typeof v === "string" && v.trim().length > 0;
/** A real calendar date, YYYY-MM-DD; with a `now`, also not later than tomorrow (the clock here is UTC, the people who wrote it were in Japan). The server leaves `now` out, like the app: the future-date test is CI's (test/jpyc-schema.test.js). */
export function isCalendarDate(s, now = Infinity) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(s + "T00:00:00Z");
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s && t <= now + DAY_MS;
}
/** Is the consent record filled? An owner, a real date not in the future, and a scope of known words that includes jpyc-listing (what the shop agreed to). */
export function hasConsent(c, now = Infinity) {
  if (!c || typeof c !== "object" || Array.isArray(c)) return false;
  const scope = Array.isArray(c.scope) ? c.scope : isStr(c.scope) ? [c.scope] : [];
  return isStr(c.owner) && isCalendarDate(c.date, now) && scope.length > 0 && scope.every((s) => CONSENT_SCOPES.includes(s)) && scope.includes("jpyc-listing");
}
/**
 * THE SWITCH (the same rule as entryVisible in src/anime/ui/jpyc-lib.js; test/jpyc-schema.test.js runs one table through both). May this entry be asked of the platform at all?
 *   - `enabled: false` always says no (a parked shop keeps its record);
 *   - a demo shop only when someone set `enabled: true` (the shipped file has it false: production asks the platform for nothing);
 *   - a Kesennuma shop only with its consent record filled, unless `enabled: false`;
 *   - a dev server (JPYC_DEV=1) allows every entry of a known kind: for a preview, never on production.
 */
export function entryAllowed(e, { dev = false, now = Infinity } = {}) {
  if (!e || typeof e !== "object" || !SLUG_RE.test(String(e.shopSlug ?? ""))) return false;
  if (!KINDS.includes(e.kind)) return false;
  if (dev) return true;
  if (e.enabled === false) return false;
  if (e.kind === "demo") return e.enabled === true;
  return hasConsent(e.consent, now);
}

/** Does the row declare what selling alcohol by mail needs? The seller's mail-order licence and how the buyer's age is checked (both said in words), and the day a person confirmed them (a real date, not in the future when a `now` is given). */
export function alcoholAllowed(a, now = Infinity) {
  return !!a && typeof a === "object" && !Array.isArray(a) && isStr(a.mailOrderLicence) && isStr(a.ageCheck) && isCalendarDate(a.confirmed, now);
}

/**
 * The allowlist the proxy answers for, from the parsed data/shops/jpyc.json ({ entries: [...] }). Never throws: a missing or damaged file is an empty allowlist, and
 * the proxy then answers 404 to everything (a server must not fail to start over a data file).
 * -> { shops: Map(slug -> { id, slug, kind, productIds: string[] | null, alcoholOk, notAlcohol: Set }), has(slug), productShop(id) -> slug | null, openShops() -> slugs without a product list }
 */
export function buildAllowlist(file, { dev = false, now = Infinity } = {}) {
  const shops = new Map(), explicit = new Map();
  const entries = Array.isArray(file?.entries) ? file.entries : [];
  for (const e of entries) {
    if (!entryAllowed(e, { dev, now }) || shops.has(e.shopSlug)) continue;
    const ids = Array.isArray(e.productIds) ? e.productIds.filter((x) => typeof x === "string" && ID_RE.test(x)) : null;
    const notAlcohol = new Set(Array.isArray(e.notAlcohol) ? e.notAlcohol.filter((x) => typeof x === "string" && ID_RE.test(x)) : []);
    shops.set(e.shopSlug, { id: String(e.id ?? e.shopSlug), slug: e.shopSlug, kind: e.kind, productIds: ids, alcoholOk: alcoholAllowed(e.alcohol, now), notAlcohol });
    if (ids) for (const id of ids) if (!explicit.has(id)) explicit.set(id, e.shopSlug);
  }
  return {
    shops,
    has: (slug) => shops.has(slug),
    productShop: (id) => explicit.get(id) ?? null,
    openShops: () => [...shops.values()].filter((s) => !s.productIds).map((s) => s.slug),
  };
}

// ------------------------------------------------------------------ what leaves the proxy
const cp = (...n) => String.fromCodePoint(...n);
const span = (a, b) => `${cp(a)}-${cp(b)}`;
// Two kinds of character leave a third party's name. Control characters (C0, DEL, C1) and the line and paragraph separators become a space; the invisible ones (the soft hyphen, the Arabic letter mark,
// zero-width space, the bidi marks and overrides, the invisible operators U+2060-206F, the BOM, the tag characters) are deleted: a name cannot reorder, hide in or break the page. The zero-width joiner
// and non-joiner stay: emoji families and several scripts are spelled with them, and they reorder nothing.
const BLANK = new RegExp(`[\\x00-\\x1f\\x7f-\\x9f${span(0x2028, 0x2029)}]`, "gu");
const INVISIBLE = new RegExp(`[${cp(0xad, 0x61c, 0x200b)}${span(0x200e, 0x200f)}${span(0x202a, 0x202e)}${span(0x2060, 0x206f)}${cp(0xfeff)}${span(0xe0000, 0xe007f)}]`, "gu");
const clean = (s, max) => String(s).replace(BLANK, " ").replace(INVISIBLE, "").replace(/\s+/g, " ").trim().slice(0, max);
const int = (v) => (Number.isInteger(v) && v >= 0 ? v : typeof v === "string" && /^\d{1,9}$/.test(v) ? Number(v) : null);
/** A price as the shortest decimal string ("1500.000000000000000000" -> "1500", "12.50" -> "12.5"), or null when it is not a non-negative decimal. */
export function normPrice(v) {
  const s = typeof v === "number" && Number.isFinite(v) && v >= 0 ? v.toFixed(18) : typeof v === "string" ? v.trim() : "";
  const m = /^(\d{1,15})(?:\.(\d{1,18}))?$/.exec(s);
  if (!m) return null;
  const whole = m[1].replace(/^0+(?=\d)/, ""), frac = (m[2] ?? "").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}
/** A hostname that names a public site: dot-separated labels of letters, digits and hyphens ending in a TLD of letters (so no IPv4 or IPv6 literal, no single-label or trailing-dot name), and not localhost or a private suffix. */
export function publicHost(h) {
  const host = String(h ?? "").toLowerCase();
  if (!host || host.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(host)) return false;
  return !/(^|\.)(localhost|local|localdomain|internal|intranet|lan|home|corp)$/.test(host);
}
/** An https URL without credentials, on a public host, under 2 KB, else null (a data:, javascript: or http: image, or one aimed at an address of the visitor's own network, never reaches the page). */
export function safeImageUrl(v) {
  if (typeof v !== "string" || v.length > 2048) return null;
  try { const u = new URL(v); return u.protocol === "https:" && !u.username && !u.password && publicHost(u.hostname) ? u.href : null; } catch { return null; }
}
const isoOrNull = (v) => (typeof v === "string" && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null);
const SALE = new Set(["coming_soon", "on_sale", "ended"]);

/** The shop block the panel needs, or null when it is not the shop's (a slug that differs from the requested one is not this shop). */
export function filterShop(s, wantSlug = null) {
  if (!s || typeof s !== "object" || !SLUG_RE.test(String(s.slug ?? "")) || (wantSlug && s.slug !== wantSlug)) return null;
  const mode = typeof s.stock_display_mode === "string" && /^[a-z_]{1,24}$/.test(s.stock_display_mode) ? s.stock_display_mode : null;
  return {
    slug: s.slug,
    name: clean(s.name ?? s.slug, 120),
    is_demo: s.is_demo === true,
    available_chains: Array.isArray(s.available_chains) ? s.available_chains.filter((n) => Number.isInteger(n) && n > 0).slice(0, 12) : [],
    default_chain_id: int(s.default_chain_id),
    stock_display_mode: mode,
    low_stock_threshold: int(s.low_stock_threshold),
  };
}
/** One product as the panel shows it, or null when it has no id, name or price (it could not be shown or linked). price_jpyc is the lowest price a visitor could pay (the base price or the cheapest variant), price_varies says more than one exists. */
export function filterProduct(p) {
  if (!p || typeof p !== "object" || typeof p.id !== "string" || !ID_RE.test(p.id)) return null;
  const base = normPrice(p.price_jpyc), name = clean(p.name ?? "", 160);
  if (base === null || !name) return null;
  const skus = Array.isArray(p.variants?.skus) ? p.variants.skus.map((k) => normPrice(k?.price_jpyc)).filter((x) => x !== null) : [];
  const all = [base, ...skus].map((x) => ({ s: x, n: Number(x) })).sort((a, b) => a.n - b.n);
  const slug = typeof p.slug === "string" && SLUG_RE.test(p.slug) ? p.slug : null;
  const status = SALE.has(p.online_sale_status) ? p.online_sale_status : null;
  return {
    id: p.id,
    slug,
    name,
    price_jpyc: all[0].s,
    price_varies: all[all.length - 1].n !== all[0].n,
    image_url: (Array.isArray(p.image_urls) ? p.image_urls : []).map(safeImageUrl).find(Boolean) ?? null,
    stock: int(p.stock),
    max_quantity_per_order: int(p.max_quantity_per_order),
    online_sale_status: status,
    online_purchase_available: typeof p.online_purchase_available === "boolean" ? p.online_purchase_available : null,
    online_sale_starts_at: isoOrNull(p.online_sale_starts_at),
    online_sale_ends_at: isoOrNull(p.online_sale_ends_at),
    requires_shipping: p.requires_shipping === true,
    alcohol: false,   // (filterProducts sets it for a product that looks like alcohol, on the shop's own declaration)
  };
}
/**
 * The shop's list, narrowed to the entry's own product ids (in the entry's order) when it has some, with alcohol held. `gate` = { alcoholOk, notAlcohol, shop }: a product that looks like
 * alcohol (or any product of a shop that sells it) is dropped unless the entry declares the licence and the age check (alcoholOk), or a person listed its id in notAlcohol; the ones that
 * stay and look like alcohol carry alcohol: true (the panel labels them 20+). `held.n` counts what was dropped. No gate = everything that looks like alcohol is held.
 */
export function filterProducts(list, productIds = null, gate = HOLD, held = null) {
  const sellsAlcohol = shopSellsAlcohol(gate.shop), seen = new Set(), out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const p = filterProduct(raw);
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    const exempt = gate.notAlcohol.has(p.id), like = !exempt && looksLikeAlcohol(raw);
    if (!gate.alcoholOk && !exempt && (like || sellsAlcohol)) { if (held) held.n++; continue; }
    out.push(like ? { ...p, alcohol: true } : p);
  }
  if (!productIds) return out.slice(0, MAX_PRODUCTS);
  const by = new Map(out.map((p) => [p.id, p]));
  return productIds.map((id) => by.get(id)).filter(Boolean).slice(0, MAX_PRODUCTS);
}

// ------------------------------------------------------------------ alcohol: the hold
// The words of alcohol. The platform has no flag for it: a craft brewery on it was seen with the shop category null and product names such as "…ポーター", "…白サワー" and "…セッションIPA"
// (no 酒 or ビール among them), and a sweets shop with the tag アルコール. So three word lists are read, after folding (NFKC: full-width letters, lower case; the invisible characters
// removed; ジンジャーエール and ワインレッド taken out: a soft drink and a colour):
//   NAME_RE      a product's name, category and tags: the broad list (the bare 酒, the drinks, the beer styles, the words of a producer);
//   DESC_RE      a product's description (its first 2,000 characters): the narrower list (a description says "goes well with beer" about a snack, so only the words that say what the product is);
//   PRODUCER_RE  a shop's name, slug and description: a brewery, a sake maker, a winery, a distillery, a liquor shop: all of that shop's products are held, not just the ones whose words give them away.
// These lists err on the side of holding: a harmless product caught by them (sake cups, ginger syrup) is shown when a person names its id in the row's `notAlcohol`.
const JA = "酒|純米|吟醸|本醸造|生酛|山廃|杜氏|アルコール|ビール|ワイン|ウイスキー|ウィスキー|ブランデー|ウォッカ|焼酎|泡盛|どぶろく|マッコリ|リキュール|カクテル|ハイボール|チューハイ|酎ハイ|サワー(?!クリーム|ドウ|ブレッド|種)|シャンパン|ラガー|エール|ピルスナー|スタウト|ポーター|ヴァイツェン|醸造所|ブリュワリー|ブルワリー|ワイナリー|蒸溜所|蒸留所|ディスティラリー|飲酒";
const EN = "alcohol(?:ic)?|sake|wines?|beers?|ale|lager|stout|porter|ipa|pilsner|whisk(?:e)?y|vodka|gin|rum|brandy|liquor|liqueur|cocktail|champagne|shochu|awamori|umeshu|nihonshu|mead|brewery|brewing|brewer|distillery|winery|spirits|hard cider";
const NAME_RE = new RegExp(`(?:${JA})|\\b(?:${EN})\\b`, "u");
const DESC_RE = new RegExp("アルコール|酒類|飲酒|日本酒|地酒|清酒|純米|吟醸|本醸造|焼酎|泡盛|ウイスキー|ウィスキー|ワイン|ビール|リキュール|梅酒|ハイボール|チューハイ|醸造所|ブリュワリー|ブルワリー|ワイナリー|蒸溜所|蒸留所|\\b(?:alcohol(?:ic)?|abv|liquor|liqueur|sake|wine|beer|whisk(?:e)?y|brewery|distillery|winery)\\b", "u");
const PRODUCER_RE = new RegExp("ブリュワリー|ブルワリー|酒造|酒蔵|酒店|酒屋|酒類|地酒|醸造所|ワイナリー|蒸溜所|蒸留所|brewery|brewing|winery|distillery", "u");   // (not word-bounded: a slug is one word, "koshikibrewery")
const fold = (s) => String(s ?? "").normalize("NFKC").toLowerCase().replace(INVISIBLE, "").replace(/ジンジャー(?:エール|ビア|ビール)|ginger\s*(?:ale|beer)|ワインレッド/g, " ");
const text = (v, n) => (typeof v === "string" ? fold(v.slice(0, n)) : "");
/** Does this product, as the platform sends it, look like alcohol? (the raw product: name, category, tags and description are read here and dropped afterwards) */
export function looksLikeAlcohol(p) {
  if (!p || typeof p !== "object") return false;
  const head = [text(p.name, 300), text(p.category, 300), ...(Array.isArray(p.tags) ? p.tags.slice(0, 20).map((x) => text(x, 100)) : [])].join("\n");
  return NAME_RE.test(head) || DESC_RE.test(text(p.description, 2000));
}
/** Is this shop (the platform's shop block) a seller of alcohol: a brewery, a sake maker, a winery, a distillery or a liquor shop by its name, slug or description, or alcohol by its category? */
export function shopSellsAlcohol(s) {
  if (!s || typeof s !== "object") return false;
  return PRODUCER_RE.test([text(s.name, 300), text(s.slug, 100), text(s.description, 2000)].join("\n")) || NAME_RE.test(text(s.category, 300));
}
/** What filterProducts does with alcohol when it is given no gate: hold everything that looks like it (never list by accident). */
const HOLD = Object.freeze({ alcoholOk: false, notAlcohol: new Set(), shop: null });

// ------------------------------------------------------------------ the proxy
/** A failure of the platform, with the code the panel has words for. */
export class UpstreamError extends Error {
  constructor(code, { status = 502, detail = "", retryAfter = 0, cool = false } = {}) { super(code + (detail ? `: ${detail}` : "")); this.code = code; this.status = status; this.detail = detail; this.retryAfter = retryAfter; this.cool = cool; }
}
const RESPONSES = {
  not_found: [404, "このお店または商品は見つかりません。 / Not found."],
  bad_request: [400, "Bad request."],
  method_not_allowed: [405, "read-only"],
  unavailable: [502, "JPYC EC に接続できません。 / JPYC EC is not reachable."],
  timeout: [504, "JPYC EC の応答がありません。 / JPYC EC did not answer in time."],
  busy: [503, "JPYC EC が混み合っています。 / JPYC EC is busy."],
  invalid: [502, "JPYC EC の応答を読み取れません。 / JPYC EC sent something unexpected."],
  mismatch: [502, "The shop's kind on JPYC EC differs from data/shops/jpyc.json."],
};
const HEAD_OK = { "content-type": "application/json; charset=utf-8", "x-content-type-options": "nosniff" };

/**
 * @param {object} o
 * @param {ReturnType<typeof buildAllowlist>} o.allow
 * @param {typeof fetch} [o.fetch]           injectable
 * @param {() => number} [o.now]             injectable (ms)
 * @param {string} [o.upstream]              the platform's origin (no trailing slash); JPYC_EC_BASE on the server, a mock in the e2e
 * @param {number} [o.ttl] [o.swr] [o.staleMax] [o.timeout] [o.backoff] [o.notFoundTtl] [o.maxEntries]
 * @param {{ limit: number, windowMs: number }} [o.budget]
 * @param {(...a: any[]) => void} [o.log]
 * @param {boolean | { everyMs?: number, immediate?: boolean }} [o.warm]   refresh every allowlisted shop's list in the background (see the header); off unless given
 * @param {{ setInterval: Function, clearInterval: Function }} [o.timers]   injectable
 */
export function createJpycProxy(o) {
  const allow = o.allow, upstream = String(o.upstream ?? UPSTREAM).replace(/\/+$/, "");
  const doFetch = o.fetch ?? ((...a) => globalThis.fetch(...a)), now = o.now ?? (() => Date.now());
  const ttl = o.ttl ?? TTL_MS, swr = o.swr ?? SWR_MS, staleMax = o.staleMax ?? STALE_MAX_MS, timeout = o.timeout ?? TIMEOUT_MS, backoff = o.backoff ?? ERROR_BACKOFF_MS;
  const notFoundTtl = o.notFoundTtl ?? NOT_FOUND_TTL_MS, maxEntries = o.maxEntries ?? MAX_ENTRIES, budget = o.budget ?? UPSTREAM_BUDGET, log = o.log ?? (() => {});
  /** key (the upstream path) -> { at, value } | { at, notFound: true } ;  failures: key -> { at, err } ;  inflight: key -> Promise */
  const store = new Map(), failures = new Map(), inflight = new Map(), calls = [];
  let cooldownUntil = 0;
  const stats = { upstream: 0, hit: 0, swr: 0, miss: 0, stale: 0, errors: 0, notFound: 0, shared: 0, budgetHeld: 0, alcoholHeld: 0 };   // (alcoholHeld: products held back by the alcohol rule, in the latest answer of every shop)
  const heldBy = new Map();

  /** The body as text, read in chunks and cut off at MAX_BODY_BYTES (a chunked body has no content-length to check first); a response without a stream (a test's stand-in) is read whole. */
  async function readText(res) {
    const body = res.body;
    if (!body || typeof body.getReader !== "function") {
      const t = await res.text();
      if (new TextEncoder().encode(t).length > MAX_BODY_BYTES) throw new UpstreamError("invalid", { detail: "body too large" });
      return t;
    }
    const reader = body.getReader(), dec = new TextDecoder();
    let n = 0, out = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.byteLength;
      if (n > MAX_BODY_BYTES) { try { await reader.cancel(); } catch { /* gone */ } throw new UpstreamError("invalid", { detail: "body too large" }); }
      out += dec.decode(value, { stream: true });
    }
    return out + dec.decode();
  }
  /** The one upstream GET: fixed headers, a hard deadline over the whole exchange, a body cap, JSON of the platform's envelope. -> the parsed `data` object. */
  async function fetchJson(path) {
    const t = now();
    if (t < cooldownUntil) throw new UpstreamError("busy", { status: 503, detail: "cooling down", retryAfter: Math.ceil((cooldownUntil - t) / 1000) });
    while (calls.length && t - calls[0] >= budget.windowMs) calls.shift();
    if (calls.length >= budget.limit) { stats.budgetHeld++; throw new UpstreamError("busy", { status: 503, detail: "own budget", retryAfter: Math.ceil((budget.windowMs - (t - calls[0])) / 1000) }); }
    calls.push(t); stats.upstream++;
    const ctl = new AbortController();
    let timer;
    const deadline = new Promise((_, rej) => { timer = setTimeout(() => { ctl.abort(); rej(new UpstreamError("timeout", { status: 504, detail: `no answer in ${timeout} ms` })); }, timeout); });
    const work = (async () => {
      let res;
      try { res = await doFetch(upstream + path, { method: "GET", headers: { accept: "application/json", "user-agent": USER_AGENT }, redirect: "manual", signal: ctl.signal }); }
      catch (e) { throw new UpstreamError(ctl.signal.aborted ? "timeout" : "unavailable", { status: ctl.signal.aborted ? 504 : 502, detail: String(e?.message ?? e).slice(0, 120) }); }
      const ra = Number.parseInt(res.headers?.get?.("retry-after") ?? "", 10);
      if (res.status === 404) { try { await res.arrayBuffer?.(); } catch { /* gone */ } throw new UpstreamError("not_found", { status: 404 }); }
      if (res.status === 429 || res.status === 503) throw new UpstreamError("busy", { status: 503, detail: `upstream ${res.status}`, retryAfter: Number.isFinite(ra) && ra > 0 ? ra : 0, cool: true });
      if (res.status < 200 || res.status >= 300) throw new UpstreamError("unavailable", { status: 502, detail: `upstream ${res.status}` });
      const len = Number(res.headers?.get?.("content-length") ?? 0);
      if (len > MAX_BODY_BYTES) throw new UpstreamError("invalid", { detail: "body too large" });
      let text;
      try { text = await readText(res); } catch (e) { if (e instanceof UpstreamError) throw e; throw new UpstreamError(ctl.signal.aborted ? "timeout" : "unavailable", { status: ctl.signal.aborted ? 504 : 502, detail: "body " + String(e?.message ?? e).slice(0, 80) }); }
      let json; try { json = JSON.parse(text); } catch { throw new UpstreamError("invalid", { detail: "not JSON" }); }
      if (!json || json.ok !== true || !json.data || typeof json.data !== "object") throw new UpstreamError("invalid", { detail: "not the API's envelope" });
      return json.data;
    })();
    work.catch(() => {});   // (when the deadline wins, the work's own rejection must not surface as unhandled)
    try { return await Promise.race([work, deadline]); } finally { clearTimeout(timer); }
  }

  function remember(key, entry) {
    store.delete(key); store.set(key, entry);
    while (store.size > maxEntries) store.delete(store.keys().next().value);   // oldest first
  }
  /** Ask the platform for `key` once (concurrent callers share the call) and keep the answer: a value, or a remembered 404. */
  function refresh(key, path, make) {
    if (inflight.has(key)) { stats.shared++; return inflight.get(key); }
    const p = (async () => {
      try {
        const value = make(await fetchJson(path));
        failures.delete(key); remember(key, { at: now(), value });
        return store.get(key);
      } catch (e) {
        const err = e instanceof UpstreamError ? e : new UpstreamError("unavailable", { detail: String(e?.message ?? e).slice(0, 120) });
        if (err.code === "not_found") {
          const prev = store.get(key);
          if (prev?.value !== undefined && !prev.gone) { prev.gone = 1; }   // a 404 over a good copy might be a moment of the platform's (a deploy): the copy stays, served as stale, and the next look decides
          else { failures.delete(key); remember(key, { at: now(), notFound: true }); return store.get(key); }
        }
        stats.errors++; failures.set(key, { at: now(), err });
        if (err.cool) cooldownUntil = Math.max(cooldownUntil, now() + Math.min(120, Math.max(15, err.retryAfter)) * 1000);   // (the platform asked us to slow down: nothing goes upstream for a while)
        if (err.code === "mismatch") store.delete(key);   // (the platform now says something else than the data file: the old copy must not be served as a fallback either)
        log("jpyc upstream", path, err.code, err.detail);
        throw err;
      } finally { inflight.delete(key); }
    })();
    inflight.set(key, p);
    return p;
  }
  /**
   * The freshest answer the rules allow for `key`. -> { entry, state: 'hit' | 'swr' | 'miss' | 'stale', age } or throws an UpstreamError.
   * (A 'make' that throws UpstreamError("invalid") because the platform's data is not what it should be counts as a failure like any other.)
   */
  async function get(key, path, make) {
    const t = now(), e = store.get(key);
    if (e?.notFound) { if (t - e.at < notFoundTtl) { stats.notFound++; return { entry: e, state: "hit", age: t - e.at }; } }
    else if (e) {
      const age = t - e.at;
      if (age < ttl) { stats.hit++; return { entry: e, state: "hit", age }; }
      if (age < ttl + swr) { stats.swr++; if (!inflight.has(key) && !restingAfterFailure(key, t)) refresh(key, path, make).catch(() => {}); return { entry: e, state: "swr", age }; }
    }
    const f = failures.get(key);
    if (f && t - f.at < backoff) return fallback(e, t, f.err);
    stats.miss++;
    try { const fresh = await refresh(key, path, make); return { entry: fresh, state: "miss", age: now() - fresh.at }; }
    catch (err) { return fallback(e, t, err); }
  }
  const restingAfterFailure = (key, t) => { const f = failures.get(key); return !!f && t - f.at < backoff; };
  /** The platform failed: the old copy when there is one that is young enough, else the failure. */
  function fallback(e, t, err) {
    if (err.code !== "mismatch" && e?.value !== undefined && t - e.at < staleMax) { stats.stale++; return { entry: e, state: "stale", age: t - e.at }; }   // (a mismatch is never papered over by an old copy)
    throw err;
  }

  // ---- the two answers
  const shopPath = (slug) => `/api/v1/shops/${slug}/products`;
  /** The kind rule: a demo entry answers while the platform says is_demo, a real one while it does not. */
  function checkKind(entry, shop) {
    if ((entry.kind === "demo") !== (shop.is_demo === true)) throw new UpstreamError("mismatch", { detail: `${entry.slug} is ${entry.kind} in the data file but is_demo=${shop.is_demo} on JPYC EC` });
    return shop;
  }
  const meta = (r) => ({ fetched_at: new Date(r.entry.at).toISOString(), age_s: Math.max(0, Math.round(r.age / 1000)), stale: r.state === "stale" });

  /** What is kept of the platform's answer for a shop (throws UpstreamError for what is not the shop's, or the wrong kind). */
  const shopValue = (slug) => (data) => {
    const entry = allow.shops.get(slug), shop = filterShop(data.shop, slug);
    if (!shop || !Array.isArray(data.products)) throw new UpstreamError("invalid", { detail: "no shop / products" });
    checkKind(entry, shop);
    const held = { n: 0 }, products = filterProducts(data.products, entry.productIds, { alcoholOk: entry.alcoholOk, notAlcohol: entry.notAlcohol, shop: data.shop }, held);
    if (held.n !== (heldBy.get(slug) ?? 0) && held.n) log("jpyc alcohol", slug, `${held.n} product(s) held back: the shop's row in data/shops/jpyc.json has no mailOrderLicence + ageCheck (or notAlcohol for a product the words wrongly catch)`);   // (said when the number changes, not at every refresh)
    heldBy.set(slug, held.n); stats.alcoholHeld = [...heldBy.values()].reduce((a, b) => a + b, 0);
    return { shop, products };
  };
  async function shopProducts(slug) {
    const r = await get(shopPath(slug), shopPath(slug), shopValue(slug));
    if (r.entry.notFound) throw new UpstreamError("not_found", { status: 404 });
    return { shop: r.entry.value.shop, products: r.entry.value.products, state: r.state, ...meta(r) };
  }
  /**
   * One product of an allowlisted shop, from that shop's (cached, warmed) list: the detail endpoint adds nothing the panel shows (every kept field is in the list), and answering from the lists
   * means no id a visitor can invent ever costs the platform a call. The shops searched are the entry's own when an id is in its productIds, else every shop without a product list, all at once.
   */
  async function product(id) {
    const direct = allow.productShop(id), slugs = direct ? [direct] : allow.openShops();
    const settled = await Promise.allSettled(slugs.map((slug) => shopProducts(slug)));
    let failed = null;
    for (const r of settled) {
      if (r.status === "fulfilled") { const p = r.value.products.find((x) => x.id === id); if (p) return { shop: r.value.shop, product: p, state: r.value.state, fetched_at: r.value.fetched_at, age_s: r.value.age_s, stale: r.value.stale }; }
      else if (r.reason?.code !== "not_found") failed = r.reason;   // (a shop that is gone has no such product; one that failed might)
    }
    if (failed) throw failed instanceof UpstreamError ? failed : new UpstreamError("unavailable");
    throw new UpstreamError("not_found", { status: 404 });
  }

  // ---- warm-up
  /** Refresh every allowlisted shop's list now (not the ones resting after a failure, nor while the platform asked for quiet): the background half of "fresh for five minutes". -> how many were asked. */
  function warmOnce() {
    let n = 0;
    for (const slug of allow.shops.keys()) {
      const key = shopPath(slug), t = now();
      if (inflight.has(key) || t < cooldownUntil || restingAfterFailure(key, t)) continue;
      n++; refresh(key, key, shopValue(slug)).catch(() => {});   // (a failure is logged and remembered by refresh itself; the old copy stays)
    }
    return n;
  }
  let warmTimer = null;
  const timers = o.timers ?? { setInterval: (...a) => globalThis.setInterval(...a), clearInterval: (...a) => globalThis.clearInterval(...a) };
  function stopWarm() { if (warmTimer != null) { timers.clearInterval(warmTimer); warmTimer = null; } }
  function startWarm(w = {}) {
    stopWarm();
    warmTimer = timers.setInterval(warmOnce, w.everyMs ?? WARM_EVERY_MS);
    warmTimer?.unref?.();   // (a timer must never keep a process alive)
    if (w.immediate !== false) warmOnce();
  }
  if (o.warm) startWarm(typeof o.warm === "object" ? o.warm : {});

  // ---- HTTP
  const respond = (status, body, { method = "GET", cache = "no-store", state = null, retryAfter = 0 } = {}) => {
    const headers = { ...HEAD_OK, "cache-control": cache, ...(state ? { "x-jpyc-cache": state } : {}), ...(retryAfter ? { "retry-after": String(Math.max(1, Math.ceil(retryAfter))) } : {}) };
    return new Response(method === "HEAD" ? null : JSON.stringify(body), { status, headers });
  };
  const failure = (code, method, err = null) => {
    const [status, message] = RESPONSES[code] ?? RESPONSES.unavailable;
    const res = respond(err?.status && code !== "not_found" ? err.status : status, { ok: false, error: code, message, ...(err?.retryAfter ? { retry_after_s: err.retryAfter } : {}) }, { method, retryAfter: err?.retryAfter ?? 0 });
    if (code === "method_not_allowed") res.headers.set("allow", "GET, HEAD");
    return res;
  };
  const okCache = (state) => (state === "stale" ? "public, max-age=10" : "public, max-age=30");

  /**
   * Answer a request for PREFIX + ... -> a Response, or null when the path is not this proxy's (the server goes on to its other routes).
   * @param {string} pathname  decoded
   * @param {string} [method]
   */
  async function handle(pathname, method = "GET") {
    if (pathname !== PREFIX && !pathname.startsWith(PREFIX + "/")) return null;
    if (method !== "GET" && method !== "HEAD") return failure("method_not_allowed", method);
    const parts = pathname.slice(PREFIX.length).split("/").filter(Boolean);
    try {
      if (parts.length === 3 && parts[0] === "shops" && parts[2] === "products") {
        const slug = parts[1];
        if (!SLUG_RE.test(slug)) return failure("bad_request", method);
        if (!allow.has(slug)) return failure("not_found", method);   // not in the data file: never asked upstream
        const r = await shopProducts(slug);
        return respond(200, { ok: true, shop: r.shop, products: r.products, fetched_at: r.fetched_at, age_s: r.age_s, stale: r.stale }, { method, cache: okCache(r.state), state: r.state });
      }
      if (parts.length === 2 && parts[0] === "products") {
        const id = parts[1];
        if (!ID_RE.test(id)) return failure("bad_request", method);
        const r = await product(id);
        return respond(200, { ok: true, shop: r.shop, product: r.product, fetched_at: r.fetched_at, age_s: r.age_s, stale: r.stale }, { method, cache: okCache(r.state), state: r.state });
      }
      return failure("not_found", method);
    } catch (e) {
      if (e instanceof UpstreamError) return failure(e.code, method, e);
      log("jpyc handler", e?.message ?? e);
      return failure("unavailable", method);
    }
  }

  return { handle, shopProducts, product, stats, allow, warmOnce, startWarm, stopWarm, get size() { return store.size; }, clear() { store.clear(); failures.clear(); inflight.clear(); heldBy.clear(); calls.length = 0; cooldownUntil = 0; stats.alcoholHeld = 0; } };
}
