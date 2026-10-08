// [jpyc] The pure parts of the 「JPYCで買えるお店」 panel (ui/jpyc-store.js): the data file's schema and its gates (consent, the flyer source for kids, ?jpyc=),
// the links (the product page on JPYC EC, the Google Maps search), the price, stock and chain words, the proxy's answer checked on arrival, and the strings.
// Nothing here touches the DOM or the network, so test/jpyc-lib.test.js and test/jpyc-schema.test.js cover it. docs/jpyc/README.md is the whole story.
//
// The consent rule and the safe-segment rule are the SAME as server/app/jpyc.js (the proxy applies them to the allowlist; the codebase's convention is a copy with a
// parity test, not an import across the server / app line: test/jpyc-schema.test.js runs one table through both).
import DATA from '../../../data/ui-jpyc-i18n.json';

export const EC_ORIGIN = 'https://ec.jpyc-service.com';
/** JPYC EC's own guide to getting JPYC (linked from the panel's 「JPYCとは / 入手方法」 line). */
export const GUIDE_URL = EC_ORIGIN + '/blog/how-to-get-jpyc';
export const API_PREFIX = '/api/jpyc';
export const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
export const ENTRY_ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
export const KINDS = ['kesennuma', 'demo'];
/** What a shop can have agreed to (docs/jpyc/README.md): listing it with its JPYC EC products is the one that counts, the others say where it may be shown. */
export const CONSENT_SCOPES = ['jpyc-listing', 'display-web', 'display-event'];
/** The keys an entry of data/shops/jpyc.json may have (anything else fails test/jpyc-schema.test.js). `enabled` is the switch (see entryVisible). */
export const ENTRY_KEYS = ['id', 'kind', 'enabled', 'ja', 'en', 'x', 'z', 'shopSlug', 'productIds', 'consent', 'alcohol', 'notAlcohol', 'googleMapsQuery', 'googleMapsPlaceId'];
/** The town's own extent, in metres from its origin (a place outside it is a typo, not a shop). */
export const TOWN_LIMIT = 20000;
/** The flyer's source (the QR code's ?src=chirashi, handed to middle-school kids): the panel and its menu item do not exist under it. */
export const FLYER_SRC = 'chirashi';
export const SRC_KEY = 'klc.src';
export const MAPS_QUERY_MAX = 200;

// ------------------------------------------------------------------ strings
/** The panel's strings in the page's language (the HUD's own i18n decides it): t(key, { n: 3 }); a missing key falls back to Japanese, then to the key. */
export function createT(lang) {
  return (key, vars) => {
    let s = DATA[lang()]?.[key] ?? DATA.ja[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll('{' + k + '}', () => String(v));   // (a function: a "$&" or "$$" in a shop's name is text, not a replacement pattern)
    return s;
  };
}
export { DATA as STRINGS };

// ------------------------------------------------------------------ gates
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const DAY_MS = 24 * 3600 * 1000;
/**
 * A real calendar date, YYYY-MM-DD. With a `now` it must also be no later than tomorrow (the people who wrote it were in Japan, the clock may be elsewhere): that is the test
 * that stops a typo like 2062, and it runs in CI against the real date (validateFile). At run time `now` is left out: a visitor's phone with a wrong clock must not hide a shop
 * that agreed to be shown.
 */
export function isCalendarDate(s, now = Infinity) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(s + 'T00:00:00Z');
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s && t <= now + DAY_MS;
}
/** Is the consent record filled? An owner, a real date (not in the future when a `now` is given), and a scope of known words that includes jpyc-listing. */
export function hasConsent(c, now = Infinity) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return false;
  const scope = Array.isArray(c.scope) ? c.scope : isStr(c.scope) ? [c.scope] : [];
  return isStr(c.owner) && isCalendarDate(c.date, now) && scope.length > 0 && scope.every((s) => CONSENT_SCOPES.includes(s)) && scope.includes('jpyc-listing');
}
/**
 * Does the row declare what selling alcohol by mail needs? The seller's mail-order licence (通信販売酒類小売業免許) and how the buyer's age is checked, both said in words, and the day a person confirmed
 * them (a real date, not in the future when a `now` is given). Without it the proxy holds back every product that looks like alcohol (server/app/jpyc.js; the same function, parity-tested) and the panel drops
 * any that arrives marked as alcohol.
 */
export function alcoholAllowed(a, now = Infinity) {
  return !!a && typeof a === 'object' && !Array.isArray(a) && isStr(a.mailOrderLicence) && isStr(a.ageCheck) && isCalendarDate(a.confirmed, now);
}
/** A host that is the developer's own machine (the same rule as contribEnabled in contrib-lib.js). ?jpyc=dev is honoured nowhere else, so on the production host it does nothing. */
const DEV_HOST = /^(localhost|127\.0\.0\.1|\[?::1\]?)$|\.localhost$/i;
export const isDevHost = (hostname) => DEV_HOST.test(String(hostname ?? '').trim());
/**
 * The ?jpyc= switch: 'dev' lists every valid entry of the data file, the ones still switched off or waiting for their consent record included (and says so); 'off' hides the feature
 * for this visit; anything else is the normal rule. 'dev' needs a dev host (localhost, 127.0.0.1, ::1, *.localhost): on any other host the parameter is ignored, so a visitor cannot
 * preview on production what the data file keeps off.
 */
export function jpycMode(search = '', hostname = '') {
  let v = '';
  try { v = (new URLSearchParams(search || '').get('jpyc') || '').trim().toLowerCase(); } catch { /* no query */ }
  return v === 'dev' ? (isDevHost(hostname) ? 'dev' : 'normal') : v === '0' || v === 'off' || v === 'no' ? 'off' : 'normal';
}
/**
 * The flyer rule (kids): under ?src=chirashi (or chirashi-anything) the whole feature is gone, and it stays gone for this browser session (a reload without the
 * parameter, or a second page of the visit, must not bring the shop list back for a middle-school kid). -> { kids, persist } where persist is what to remember in sessionStorage
 * under klc.src (or null). Pure: the caller reads the address and the stored value.
 */
export function flyerGate({ search = '', stored = null } = {}) {
  let all = [];
  try { all = new URLSearchParams(search || '').getAll('src'); } catch { /* no query */ }
  const fromUrl = all.some((v) => v.trim().toLowerCase().startsWith(FLYER_SRC)), remembered = typeof stored === 'string' && stored.toLowerCase().startsWith(FLYER_SRC);
  return { kids: fromUrl || remembered, persist: fromUrl && !remembered ? FLYER_SRC : null };
}
/**
 * THE SWITCH. May this entry be offered to a visitor? Production shows nothing until an entry passes (no ☰ item, no sheet, no request to JPYC EC):
 *   - `enabled: false` always hides it (a parked shop keeps its record);
 *   - a demo shop (kind 'demo') is shown only when someone set `enabled: true` (the shipped file has it false);
 *   - a Kesennuma shop (kind 'kesennuma') is shown when its consent record is filled (hasConsent), unless `enabled: false`.
 * ?jpyc=dev (`dev`, dev hosts only) lifts the switch and the consent rule for a preview: every valid entry, labelled. The shape must be sound (visibleEntries runs validateEntry).
 * server/app/jpyc.js entryAllowed is the same rule (test/jpyc-schema.test.js runs one table through both).
 */
export function entryVisible(e, { dev = false, now = Infinity } = {}) {
  if (!e || typeof e !== 'object' || !SLUG_RE.test(String(e.shopSlug ?? ''))) return false;
  if (e.kind !== 'demo' && e.kind !== 'kesennuma') return false;
  if (dev) return true;
  if (e.enabled === false) return false;
  if (e.kind === 'demo') return e.enabled === true;
  return hasConsent(e.consent, now);
}
/** The entries of the data file this visitor may see (a damaged entry is skipped, never thrown over: the HUD must mount). Each is a copy with `pending` (dev only: no consent yet) and `off` (dev only: switched off). */
export function visibleEntries(file, { dev = false, now = Infinity } = {}) {
  const out = [], ids = new Set(), slugs = new Set();
  for (const e of Array.isArray(file?.entries) ? file.entries : []) {
    if (validateEntry(e, { now }).length || !entryVisible(e, { dev, now }) || ids.has(e.id) || slugs.has(e.shopSlug)) continue;
    ids.add(e.id); slugs.add(e.shopSlug);
    out.push({ id: e.id, kind: e.kind, ja: e.ja, en: e.en, x: e.x, z: e.z, shopSlug: e.shopSlug, productIds: Array.isArray(e.productIds) ? e.productIds.slice() : null,
      googleMapsQuery: isStr(e.googleMapsQuery) ? e.googleMapsQuery.trim() : null, googleMapsPlaceId: isStr(e.googleMapsPlaceId) ? e.googleMapsPlaceId.trim() : null,
      pending: e.kind === 'kesennuma' && !hasConsent(e.consent, now), off: e.kind === 'demo' ? e.enabled !== true : e.enabled === false, alcoholOk: alcoholAllowed(e.alcohol, now) });
  }
  return out;
}

// ------------------------------------------------------------------ the data file's schema
const num = (v) => typeof v === 'number' && Number.isFinite(v);
/** What is wrong with one entry of data/shops/jpyc.json, as short sentences ([] = sound). The consent date is checked against the real clock here (CI, test/jpyc-schema.test.js), not at run time. */
export function validateEntry(e, { now = Date.now() } = {}) {
  const p = [];
  if (!e || typeof e !== 'object' || Array.isArray(e)) return ['not an object'];
  for (const k of Object.keys(e)) if (!ENTRY_KEYS.includes(k)) p.push(`unknown key ${k}`);
  if (!ENTRY_ID_RE.test(String(e.id ?? ''))) p.push('id must be lower-case letters, digits and hyphens (1 to 40)');
  if (!KINDS.includes(e.kind)) p.push("kind must be 'kesennuma' or 'demo'");
  if (e.enabled !== undefined && typeof e.enabled !== 'boolean') p.push('enabled is true or false');
  else if (e.kind === 'demo' && typeof e.enabled !== 'boolean') p.push('a demo shop must say "enabled": true or false (the switch; production shows a demo only when it is true)');
  for (const k of ['ja', 'en']) if (!isStr(e[k]) || e[k].length > 80) p.push(`${k} must be a name of 1 to 80 characters`);
  for (const k of ['x', 'z']) if (!num(e[k]) || Math.abs(e[k]) > TOWN_LIMIT) p.push(`${k} must be a number of metres inside the town (|${k}| <= ${TOWN_LIMIT})`);
  if (!SLUG_RE.test(String(e.shopSlug ?? ''))) p.push('shopSlug must be a JPYC EC shop slug (letters, digits, - and _)');
  if (e.productIds != null) {
    if (!Array.isArray(e.productIds) || !e.productIds.length || e.productIds.length > 60 || !e.productIds.every((x) => typeof x === 'string' && SLUG_RE.test(x)) || new Set(e.productIds).size !== e.productIds.length) p.push('productIds is omitted, null, or a list of 1 to 60 distinct product ids');
  }
  if (e.consent != null) {
    const c = e.consent;
    if (!c || typeof c !== 'object' || Array.isArray(c)) p.push('consent is null or { owner, date, scope }');
    else {
      for (const k of Object.keys(c)) if (!['owner', 'date', 'scope', 'ref'].includes(k)) p.push(`consent has an unknown key ${k}`);
      if (!isStr(c.owner)) p.push('consent.owner is empty');
      if (!isCalendarDate(c.date, now)) p.push('consent.date is not a real date (YYYY-MM-DD) or lies in the future');
      const scope = Array.isArray(c.scope) ? c.scope : isStr(c.scope) ? [c.scope] : [];
      if (!scope.length || scope.some((s) => !CONSENT_SCOPES.includes(s))) p.push(`consent.scope is a list of ${CONSENT_SCOPES.join(' / ')}`);
      if (c.ref != null && !isStr(c.ref)) p.push('consent.ref is null or text');
    }
  }
  if (e.kind === 'demo' && e.consent != null) p.push('a demo shop is nobody\'s business: no consent record');
  if (e.alcohol != null) {
    const a = e.alcohol;
    if (!a || typeof a !== 'object' || Array.isArray(a)) p.push('alcohol is null or { mailOrderLicence, ageCheck, confirmed }');
    else {
      for (const k of Object.keys(a)) if (!['mailOrderLicence', 'ageCheck', 'confirmed', 'ref'].includes(k)) p.push(`alcohol has an unknown key ${k}`);
      for (const k of ['mailOrderLicence', 'ageCheck']) if (!isStr(a[k]) || a[k].length > 300) p.push(`alcohol.${k} must be 1 to 300 characters saying it in words`);
      if (!isCalendarDate(a.confirmed, now)) p.push('alcohol.confirmed is not a real date (YYYY-MM-DD) or lies in the future');
      if (a.ref != null && !isStr(a.ref)) p.push('alcohol.ref is null or text');
    }
  }
  if (e.notAlcohol != null && (!Array.isArray(e.notAlcohol) || !e.notAlcohol.length || e.notAlcohol.length > 60 || !e.notAlcohol.every((x) => typeof x === 'string' && SLUG_RE.test(x)) || new Set(e.notAlcohol).size !== e.notAlcohol.length)) p.push('notAlcohol is omitted, null, or a list of 1 to 60 distinct product ids');
  if (e.kind === 'demo' && (e.alcohol != null || e.notAlcohol != null)) p.push('a demo shop sells a test product: no alcohol declaration');
  if (e.googleMapsQuery != null && (!isStr(e.googleMapsQuery) || e.googleMapsQuery.length > MAPS_QUERY_MAX || /[\u0000-\u001f\u007f]/.test(e.googleMapsQuery))) p.push(`googleMapsQuery is null or text up to ${MAPS_QUERY_MAX} characters without control characters`);
  if (e.googleMapsPlaceId != null && !(typeof e.googleMapsPlaceId === 'string' && /^[A-Za-z0-9_-]{10,200}$/.test(e.googleMapsPlaceId))) p.push('googleMapsPlaceId is null or a Google place id (letters, digits, - and _)');
  if (e.kind === 'demo' && (e.googleMapsQuery != null || e.googleMapsPlaceId != null)) p.push('a demo shop has no place on Google Maps');
  return p;
}
/** What is wrong with the whole file ([] = sound): the envelope, every entry, and the uniqueness of ids and of shop slugs. */
export function validateFile(file, o = {}) {
  const p = [];
  if (!file || typeof file !== 'object' || Array.isArray(file)) return ['the file is not an object'];
  if (file.schema !== 'klc-jpyc-shops/1') p.push("schema must be 'klc-jpyc-shops/1'");
  if (file.version !== 1) p.push('version must be 1');
  if (!Array.isArray(file.entries)) return [...p, 'entries must be a list'];
  const ids = new Set(), slugs = new Set();
  file.entries.forEach((e, i) => {
    for (const m of validateEntry(e, o)) p.push(`entries[${i}] (${e?.id ?? '?'}): ${m}`);
    if (e && ids.has(e.id)) p.push(`entries[${i}]: id ${e.id} is used twice`); ids.add(e?.id);
    if (e && slugs.has(e.shopSlug)) p.push(`entries[${i}]: shopSlug ${e.shopSlug} is used twice`); slugs.add(e?.shopSlug);
  });
  return p;
}

// ------------------------------------------------------------------ links
/** A path segment the proxy and JPYC EC take as it is. */
export const safeSegment = (s) => typeof s === 'string' && SLUG_RE.test(s);
/** The shop's page on JPYC EC. */
export const shopUrl = (shopSlug) => (safeSegment(shopSlug) ? `${EC_ORIGIN}/shops/${encodeURIComponent(shopSlug)}` : null);
/** The product's page on JPYC EC: /shops/{shop slug}/products/{product.slug ?? product.id}; null when either part is not a safe segment. */
export function productUrl(shopSlug, product) {
  const seg = product && (safeSegment(product.slug) ? product.slug : product.id);
  return safeSegment(shopSlug) && safeSegment(seg) ? `${EC_ORIGIN}/shops/${encodeURIComponent(shopSlug)}/products/${encodeURIComponent(seg)}` : null;
}
/** A link to a Google Maps search, and nothing more: no Google API, no embed, nothing fetched or stored from Google (a link-out is what Google's terms allow). `placeId` pins the listing when we have one. */
export function googleMapsUrl(query, placeId = null) {
  const q = String(query ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAPS_QUERY_MAX);
  if (!q) return null;
  const id = typeof placeId === 'string' && /^[A-Za-z0-9_-]{10,200}$/.test(placeId.trim()) ? placeId.trim() : null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` + (id ? `&query_place_id=${encodeURIComponent(id)}` : '');
}
/** The text Google Maps is asked for: the entry's own googleMapsQuery, else its Japanese name and the town (a name alone finds namesakes elsewhere in Japan). A demo shop has no place. */
export function mapsQueryFor(entry) {
  if (!entry || entry.kind === 'demo') return null;
  if (isStr(entry.googleMapsQuery)) return entry.googleMapsQuery.trim();
  const name = isStr(entry.ja) ? entry.ja : isStr(entry.en) ? entry.en : '';
  return name ? `${name.trim()} 気仙沼` : null;
}
export const mapsUrlFor = (entry) => { const q = mapsQueryFor(entry); return q ? googleMapsUrl(q, entry.googleMapsPlaceId) : null; };

// ------------------------------------------------------------------ the shop's own words: price, stock, chains, time
/** "1200" -> "1,200"; "12.5" -> "12.5": the digits are grouped as text (a price is never a float here), at most six decimals. */
export function formatJpyc(price) {
  const m = /^(\d{1,15})(?:\.(\d{1,18}))?$/.exec(String(price ?? '').trim());
  if (!m) return '';
  const whole = m[1].replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ','), frac = (m[2] ?? '').slice(0, 6).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole;
}
/** The price line of a product: "1,200 JPYC", or "1,200 JPYC〜" when a variant costs more. */
export const priceText = (p, t) => { const n = formatJpyc(p?.price_jpyc); return n === '' ? '' : t(p.price_varies ? 'jpyc.price.from' : 'jpyc.price', { n }); };
/**
 * What the shop says about buying this product now. kind: ended | soon | out | unavailable | exact (n) | low | in; `buy` is whether 「JPYCで買う」 is offered (the others
 * get a plain link to the product page). The stock number is shown only when the shop's own setting says exact (stock_display_mode), as on its own storefront.
 */
export function availability(p, shop = null) {
  if (p?.online_sale_status === 'ended') return { kind: 'ended', buy: false };
  if (p?.online_sale_status === 'coming_soon') return typeof p.online_sale_starts_at === 'string' && jstDateTime(p.online_sale_starts_at) ? { kind: 'soon', buy: false, at: p.online_sale_starts_at } : { kind: 'soon', buy: false };
  if (p?.stock === 0) return { kind: 'out', buy: false };
  if (p?.online_purchase_available === false) return { kind: 'unavailable', buy: false };
  if (Number.isInteger(p?.stock)) {
    if (shop?.stock_display_mode === 'exact') return { kind: 'exact', n: p.stock, buy: true };
    if (Number.isInteger(shop?.low_stock_threshold) && shop.low_stock_threshold > 0 && p.stock <= shop.low_stock_threshold) return { kind: 'low', buy: true };
  }
  return { kind: 'in', buy: true };
}
export const availabilityText = (a, t) => (a.kind === 'exact' ? t('jpyc.stock.exact', { n: formatJpyc(String(a.n)) }) : a.kind === 'in' ? t('jpyc.stock.in') : a.kind === 'low' ? t('jpyc.stock.low') : a.kind === 'out' ? t('jpyc.stock.out')
  : a.kind === 'soon' ? (a.at ? t('jpyc.sale.soon.at', { when: jstDateTime(a.at) }) : t('jpyc.sale.soon')) : a.kind === 'ended' ? t('jpyc.sale.ended') : t('jpyc.unavailable'));
/** The mainnets JPYC EC settles on. A test network in a shop's list is not something a visitor needs to see. */
export const CHAIN_NAMES = Object.freeze({ 1: 'Ethereum', 137: 'Polygon', 43114: 'Avalanche', 8217: 'Kaia' });
export const chainNames = (ids) => (Array.isArray(ids) ? ids.map((i) => CHAIN_NAMES[i]).filter(Boolean) : []);
/** HH:MM in Japan time for an ISO time ('' when it is not a time). UTC arithmetic only: the machine's zone plays no part. */
export function jstHM(v) {
  const ms = typeof v === 'number' ? v : Date.parse(v);
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms + 9 * 3600e3);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/** "10/12 15:00" in Japan time for an ISO time ('' when it is not a time). */
export function jstDateTime(v) {
  const ms = typeof v === 'number' ? v : Date.parse(v);
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms + 9 * 3600e3);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

// ------------------------------------------------------------------ the proxy's answer, checked on arrival
/** A hostname that names a public site (the same rule as server/app/jpyc.js publicHost): labels of letters, digits and hyphens ending in a TLD of letters, so no IP literal, localhost, bare name, trailing dot or private suffix. */
export function publicHost(h) {
  const host = String(h ?? '').toLowerCase();
  if (!host || host.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(host)) return false;
  return !/(^|\.)(localhost|local|localdomain|internal|intranet|lan|home|corp)$/.test(host);
}
/** The https image URL of a product, on a public host, or null (the proxy already filters this; the page does not trust it either). */
export function safeImage(v) {
  if (typeof v !== 'string' || v.length > 2048) return null;
  try { const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password && publicHost(u.hostname) ? u.href : null; } catch { return null; }
}
/** Is this the kind of thing the panel may draw? Names are text only (the view escapes them); ids and slugs are safe segments; the price is a decimal. */
export function checkProduct(p) {
  if (!p || typeof p !== 'object' || !safeSegment(p.id) || typeof p.name !== 'string' || !p.name.trim() || formatJpyc(p.price_jpyc) === '') return null;
  return {
    id: p.id, slug: safeSegment(p.slug) ? p.slug : null, name: p.name.slice(0, 160), price_jpyc: String(p.price_jpyc), price_varies: p.price_varies === true,
    image_url: safeImage(p.image_url), stock: Number.isInteger(p.stock) && p.stock >= 0 ? p.stock : null,
    online_sale_status: ['coming_soon', 'on_sale', 'ended'].includes(p.online_sale_status) ? p.online_sale_status : null,
    online_purchase_available: typeof p.online_purchase_available === 'boolean' ? p.online_purchase_available : null,
    online_sale_starts_at: typeof p.online_sale_starts_at === 'string' && Number.isFinite(Date.parse(p.online_sale_starts_at)) ? p.online_sale_starts_at : null,
    alcohol: p.alcohol === true,
  };
}
/**
 * The proxy's JSON for one shop -> { shop, products, stale, fetchedAt } or throws { code }:  `error` (not the shape), `mismatch` (the shop's kind is not the entry's).
 * `narrow` is a list of product ids to keep (the caller's own, from the room that opened the panel).
 */
export function readShopAnswer(json, entry, narrow = null) {
  const bad = (code) => Object.assign(new Error('jpyc answer: ' + code), { code });
  const s = json?.shop;
  if (!json || json.ok !== true || !s || typeof s !== 'object' || s.slug !== entry.shopSlug || !Array.isArray(json.products)) throw bad('error');
  if ((entry.kind === 'demo') !== (s.is_demo === true)) throw bad('mismatch');
  let products = json.products.map(checkProduct).filter(Boolean);
  if (!entry.alcoholOk) products = products.filter((p) => !p.alcohol);   // (the second lock of the alcohol rule: the proxy holds alcohol back unless the row declares the licence and the age check; a product it marked as alcohol is not drawn without that declaration)
  if (Array.isArray(narrow) && narrow.length) { const keep = new Set(narrow); products = products.filter((p) => keep.has(p.id)); }
  return {
    shop: { slug: s.slug, name: typeof s.name === 'string' ? s.name.slice(0, 120) : '', is_demo: s.is_demo === true, available_chains: Array.isArray(s.available_chains) ? s.available_chains.filter(Number.isInteger) : [],
      stock_display_mode: typeof s.stock_display_mode === 'string' ? s.stock_display_mode : null, low_stock_threshold: Number.isInteger(s.low_stock_threshold) ? s.low_stock_threshold : null },
    products, stale: json.stale === true, fetchedAt: typeof json.fetched_at === 'string' ? json.fetched_at : '',
  };
}

// ------------------------------------------------------------------ where the API is
const LOOPBACK = /^(localhost|127\.0\.0\.1|\[?::1\]?)$/i;
/**
 * The proxy's address: the page's own origin (a root-relative path). ?jpycApi=<origin> points a developer's page at a mock, and only a loopback origin is taken:
 * a link must never be able to make the panel show products from a server of someone else's.
 * -> { base ('' = same origin), custom, rejected }
 */
export function resolveApiBase(search = '') {
  let want = null;
  try { want = new URLSearchParams(search || '').get('jpycApi'); } catch { /* no query */ }
  if (!want) return { base: '', custom: false, rejected: '' };
  try {
    const u = new URL(want);
    if ((u.protocol === 'http:' || u.protocol === 'https:') && LOOPBACK.test(u.hostname) && !u.username && !u.password) return { base: u.origin, custom: true, rejected: '' };
  } catch { /* not a URL */ }
  return { base: '', custom: false, rejected: want };
}
/** The panel's way to the entry's products (the proxy's route). */
export const shopApiUrl = (base, shopSlug) => `${base}${API_PREFIX}/shops/${encodeURIComponent(shopSlug)}/products`;

// ------------------------------------------------------------------ a reference to an entry (what ctx.services.jpyc.open() takes)
/** An entry id, a shop slug, or { id | shopSlug, productIds } -> { entry, narrow } over the visible `entries`, or null. */
export function resolveRef(entries, ref) {
  if (ref == null) return null;
  const obj = typeof ref === 'object' ? ref : { id: String(ref) };
  const hit = entries.find((e) => (obj.id != null && e.id === obj.id)) ?? entries.find((e) => (obj.shopSlug != null && e.shopSlug === obj.shopSlug)) ?? (typeof ref === 'string' ? entries.find((e) => e.shopSlug === ref) : null);
  if (!hit) return null;
  const narrow = Array.isArray(obj.productIds) ? obj.productIds.filter((x) => typeof x === 'string') : null;
  return { entry: hit, narrow: narrow && narrow.length ? narrow : null };
}
