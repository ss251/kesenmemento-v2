// 気仙沼漁協 入船情報 (Kesennuma Fisheries Co-op arrivals) - fetch, Shift_JIS decode and a tolerant parser.
//
// Source: the co-op's mobile pages, which are small Shift_JIS HTML documents, one per fishery:
//   http://www.kesennuma-gyokyou.or.jp/html/mobile/{katuo,haenawa,sanma,makiami}.htm
// (the desktop pages under /kanri/kanripg/... carry the same rows as 380 kB of ASP.NET markup). A page reads like
//   <p>●かつお（一本釣）<br>９月２９日　１７時半現在　３０日（水）予定</p>合計:　8隻<br>鰹:　168.5ｔ<br><br>
//   船名:　78福徳丸<br>鰹:　24.5ｔ<br>新口:　16.5ｔ<br>入港時刻:　06ｈ<br><br> ...
// i.e. "key:　value" lines grouped into blank-line separated blocks. The list published in the evening is the
// next morning's schedule (予定); the parser keeps both the "as of" stamp and the target date.

export const GYOKYO_BASE = "http://www.kesennuma-gyokyou.or.jp/html/mobile/";
export const FISHERY_PAGES = ["katuo", "haenawa", "sanma", "makiami"];

/** Shift_JIS bytes -> string (the pages declare charset=shift_jis; Bun's TextDecoder supports it). */
export function decodeSJIS(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try { return new TextDecoder("shift_jis").decode(u8); } catch { return new TextDecoder("utf-8").decode(u8); }
}

/** Full-width digits/letters/punctuation -> ASCII, ideographic space -> space. */
export function toHalfWidth(s) {
  return String(s ?? "")
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, " ");
}

/**
 * Arrival time strings seen on the pages: "06ｈ", "04〜05ｈ", "04～05ｈ", "04-05ｈ", "04半", "10半", "7時", "06:30".
 * -> { h (decimal hours, window midpoint), from, to, raw } or null when unknown (未定, blank).
 */
export function parseEta(raw) {
  const s = toHalfWidth(raw).replace(/\s+/g, "").replace(/[〜～~ー－―‐]/g, "-");
  if (!s) return null;
  let m = /^(\d{1,2})(?:[:：](\d{2}))?(?:h|時)?-(\d{1,2})(?:[:：](\d{2}))?(?:h|時)?/.exec(s);
  if (m) {
    const from = +m[1] + (m[2] ? +m[2] / 60 : 0), to = +m[3] + (m[4] ? +m[4] / 60 : 0);
    if (from < 24 && to <= 24 && to >= from) return { h: (from + to) / 2, from, to, raw: String(raw).trim() };
  }
  m = /^(\d{1,2})半/.exec(s);
  if (m && +m[1] < 24) { const h = +m[1] + 0.5; return { h, from: h, to: h, raw: String(raw).trim() }; }
  m = /^(\d{1,2})[:：](\d{2})/.exec(s);
  if (m && +m[1] < 24) { const h = +m[1] + +m[2] / 60; return { h, from: h, to: h, raw: String(raw).trim() }; }
  m = /^(\d{1,2})(?:h|時)?$/.exec(s) ?? /^(\d{1,2})(?:h|時)/.exec(s);
  if (m && +m[1] < 24) { const h = +m[1]; return { h, from: h, to: h, raw: String(raw).trim() }; }
  return null;
}

/** "24.5ｔ" -> {qty: 24.5, unit: "t"}, "235" -> {qty: 235, unit: "本"}, "若干" -> {qty: null, unit: null, text: "若干"} */
export function parseQty(raw) {
  const s = toHalfWidth(raw).trim();
  const m = /^([\d.]+)\s*(t|kg|本|尾|箱)?$/i.exec(s);
  if (!m) return { qty: null, unit: null, text: s };
  return { qty: +m[1], unit: (m[2] ?? "本").toLowerCase() === "t" ? "t" : m[2] ?? "本" };
}

// species shorthand used on the pages -> display name (JA, EN)
export const SPECIES = {
  鰹: ["カツオ", "skipjack"], 新口: ["カツオ（新口）", "skipjack (fresh)"], 新口赤物: ["赤物（新口）", "red fish (fresh)"],
  新口バチ: ["メバチ（新口）", "bigeye (fresh)"], "新口キハダ・小キハダ": ["キハダ（新口）", "yellowfin (fresh)"], ピン: ["ビンナガ", "albacore"],
  赤物: ["赤物", "red fish"], トンボ: ["ビンナガ", "albacore"], ばち: ["メバチ", "bigeye tuna"], だるま: ["ダルマ（小メバチ）", "small bigeye"],
  きはだ: ["キハダ", "yellowfin tuna"], めか: ["メカジキ", "swordfish"], まか: ["マカジキ", "striped marlin"], もうか: ["モウカザメ", "porbeagle"],
  吉切: ["ヨシキリザメ", "blue shark"], 勝さめ: ["カツオザメ", "shark"], 丁さめ: ["チョウザメ類", "shark"], さんま: ["サンマ", "Pacific saury"],
  いわし: ["イワシ", "sardine"], さば: ["サバ", "mackerel"], かつお: ["カツオ", "skipjack"],
};

// fishery heading -> vessel kind used by the scene (three hull types; purse seiners reuse the pole-and-line hull)
export function kindOf(fishery) {
  const f = String(fishery ?? "");
  if (/さんま|棒受/.test(f)) return "saury";
  if (/はえ縄|延縄|まぐろ|大目/.test(f)) return "longline";
  if (/まき網|巻網/.test(f)) return "seine";
  return "pole";
}
export const FISHERY_LABEL = { pole: ["一本釣り", "pole-and-line"], longline: ["はえ縄", "longline"], saury: ["さんま棒受網", "saury dip-net"], seine: ["まき網", "purse seine"] };

/** "９月２９日　１７時半現在　３０日（水）予定" (or "９月３０日(水)予定") -> { asOf:{m,d,h}, target:{m,d,wd} } */
export function parseStamp(text, fallbackMonth) {
  const s = toHalfWidth(text);
  const out = { asOf: null, target: null };
  const a = /(\d{1,2})月(\d{1,2})日\s*(\d{1,2})時(半|(\d{1,2})分)?\s*現在/.exec(s);
  if (a) out.asOf = { m: +a[1], d: +a[2], h: +a[3] + (a[4] === "半" ? 0.5 : a[5] ? +a[5] / 60 : 0) };
  const t = /(?:(\d{1,2})月)?(\d{1,2})日\s*[（(]([日月火水木金土])[）)]\s*予定/.exec(s);
  if (t) out.target = { m: t[1] ? +t[1] : out.asOf?.m ?? fallbackMonth ?? null, d: +t[2], wd: t[3] };
  if (out.target && out.asOf && !t?.[1] && out.target.d < out.asOf.d) out.target.m = (out.asOf.m % 12) + 1;   // "30日" listed on the 31st etc.
  return out;
}

const stripTags = (html) => html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<p[^>]*>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");

/**
 * Parse one mobile page (already decoded). Returns
 * { page, sections: [{ fishery, kind, stamp, total, vessels: [{ vessel, catches:[{key, name, en, qty, unit}], eta, etaRaw }], landed: [...] }], empty }
 */
export function parseMobilePage(html, page = "") {
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
  // drop the table-of-contents links at the top (they repeat the section names)
  const text = toHalfWidth(stripTags(body.replace(/<H4>\s*<a[\s\S]*?<\/H4>/i, ""))).replace(/\r/g, "");
  const lines = text.split("\n").map((l) => l.trim());
  const sections = [];
  let cur = null, block = null, pendingStamp = null;
  const newSection = (fishery) => { cur = { fishery, kind: kindOf(fishery || page), stamp: null, total: null, vessels: [], landed: [] }; sections.push(cur); block = null; if (pendingStamp) { cur.stamp = pendingStamp; pendingStamp = null; } };
  for (const line of lines) {
    if (!line) { block = null; continue; }
    const head = /^●\s*(.+?)$/.exec(line);
    if (head && !/:/.test(line)) { newSection(head[1].replace(/\s+/g, "")); continue; }
    if (/(現在|予定)/.test(line) && /日/.test(line) && !/:/.test(line)) {
      const st = parseStamp(line); if (cur && !cur.stamp) cur.stamp = st; else pendingStamp = st; continue;
    }
    if (/販売予定船/.test(line) && !cur) { newSection(line.replace(/[・\s]+$/g, "")); continue; }
    const kv = /^([^:]+?)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1].trim(), val = kv[2].trim();
    if (!cur) newSection(page);
    if (key === "船名") { block = { vessel: val, catches: [], eta: null, etaRaw: null }; cur.vessels.push(block); continue; }
    if (key === "陸送") { block = { landed: true, catches: [] }; cur.landed.push(block); continue; }
    if (key === "合計" || key === "計") { const n = /(\d+)\s*隻/.exec(val); if (n) cur.total = { vessels: +n[1] }; block = null; continue; }
    if (!block && key === "荷主" && cur.landed.length) { block = { landed: true, catches: [] }; cur.landed.push(block); }
    if (!block) continue;                                       // section totals (鰹: 168.5t) belong to no vessel
    if (key === "入港時刻") { block.etaRaw = val; block.eta = parseEta(val); continue; }
    if (key === "荷主" || key === "産地") { if (block) block[key === "荷主" ? "shipper" : "origin"] = val; continue; }
    const q = parseQty(val), sp = SPECIES[key];
    block.catches.push({ key, name: sp?.[0] ?? key, en: sp?.[1] ?? key, ...q });
  }
  const empty = /入船情報はありません|提示内容はありません/.test(text) && sections.every((s) => !s.vessels.length);
  return { page, sections: sections.filter((s) => s.vessels.length || s.landed.length || s.total), empty };
}

// representative species for a label: the heaviest tonnage line, else the most pieces
const SHARKS = /さめ|サメ|もうか|吉切/;
function mainCatch(catches, kind) {
  if (kind === "longline") {                                   // longliners: the headline is the tuna/billfish count, not the shark tonnage
    const fish = catches.filter((c) => c.qty != null && !SHARKS.test(c.key)).sort((a, b) => b.qty - a.qty)[0];
    if (fish) return fish;
  }
  const t = catches.filter((c) => c.unit === "t" && c.qty != null).sort((a, b) => b.qty - a.qty);
  const pick = t[0] ?? catches.filter((c) => c.qty != null).sort((a, b) => b.qty - a.qty)[0] ?? catches[0];
  if (!pick) return kind === "saury" ? { name: "サンマ", en: "Pacific saury" } : kind === "longline" ? { name: "マグロ類", en: "tuna" } : { name: "カツオ", en: "skipjack" };
  // "新口" is the fresh-skipjack grade; show the fish, not the grade
  return /^新口$/.test(pick.key) ? { ...pick, name: "カツオ", en: "skipjack" } : pick;
}

const hm = (h) => { const m = Math.round(h * 60); return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };

/**
 * Parsed pages -> the state's port block. Vessels without a published time (longliners are listed as "販売予定船",
 * i.e. landing for the morning auction) get a staggered pre-auction slot and are flagged eta.estimated.
 */
export function toPortState(parsed, { year = new Date().getFullYear(), source = "気仙沼漁協 入船情報", url = GYOKYO_BASE } = {}) {
  const arrivals = [], landed = [];
  let asOf = null, target = null, est = 0;
  for (const p of parsed) for (const s of p.sections) {
    if (s.stamp?.asOf && (!asOf || s.stamp.asOf.m * 100 + s.stamp.asOf.d + s.stamp.asOf.h / 100 > asOf.m * 100 + asOf.d + asOf.h / 100)) asOf = s.stamp.asOf;
    if (s.stamp?.target && !target) target = s.stamp.target;
    for (const v of s.vessels) {
      let eta = v.eta;
      if (!eta) { const h = 3 + (est++ % 6) * 0.25; eta = { h, from: h, to: h, raw: v.etaRaw ?? "", estimated: true }; }
      const tons = v.catches.filter((c) => c.unit === "t" && c.qty != null && c.key !== "新口" && !/^新口/.test(c.key)).reduce((a, c) => a + c.qty, 0)
        || v.catches.filter((c) => c.unit === "t" && c.qty != null).reduce((a, c) => a + c.qty, 0);
      const main = mainCatch(v.catches, s.kind);
      arrivals.push({
        time: hm(eta.h), eta, vessel: v.vessel, kind: s.kind, fishery: s.fishery, type: FISHERY_LABEL[s.kind][0], typeEn: FISHERY_LABEL[s.kind][1],
        catch: main.name, catchEn: main.en, kg: tons ? Math.round(tons * 1000) : null, catches: v.catches,
      });
    }
    for (const l of s.landed) if (l.catches.length) landed.push({ fishery: s.fishery, shipper: l.shipper ?? null, origin: l.origin ?? null, catches: l.catches });
  }
  arrivals.sort((a, b) => a.eta.h - b.eta.h || a.vessel.localeCompare(b.vessel, "ja"));
  const ymd = (o) => (o ? `${year}-${String(o.m).padStart(2, "0")}-${String(o.d).padStart(2, "0")}` : null);
  return {
    source, url,
    asOf: asOf ? `${ymd(asOf)}T${hm(asOf.h)}:00+09:00` : null,
    date: ymd(target) ?? ymd(asOf),
    weekday: target?.wd ?? null,
    arrivals, landed,
    counts: { vessels: arrivals.length, byKind: arrivals.reduce((o, a) => ((o[a.kind] = (o[a.kind] ?? 0) + 1), o), {}) },
  };
}
