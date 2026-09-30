// [v4:data] GSI 最適化ベクトルタイル Anno layer (注記) -> real place and facility names in ENU. Pure (tested).
// The Anno layer holds text annotations (vt_code 1xx-8xx, with `text`) and map symbols (vt_code 3xxx-7xxx, no text).
// Symbol meanings come from GSI's own style (gsi-anno-codes.json). The text classes below were read off the data itself
// (every text of each class in the Kesennuma tiles was listed and checked, 2026-09-30).
// A facility text sits a few tens of metres from its symbol, so each text is paired with the nearest symbol of the same
// family; the symbol point is the facility position.
import CODES from "./gsi-anno-codes.json" with { type: "json" };

export const SYMBOLS = Object.fromEntries(Object.entries(CODES.symbols).map(([k, v]) => [+k, v]));

/** Text classes: code -> { cat, kind (lot kind of the facility, if a building), sym: symbol codes to pair with } */
export const TEXT = {
  110: { cat: "city" }, 210: { cat: "district" }, 220: { cat: "locality" }, 800: { cat: "district" },
  312: { cat: "mountain" }, 313: { cat: "mountain" }, 810: { cat: "mountain" },
  322: { cat: "river" }, 323: { cat: "stream" },
  332: { cat: "rock" }, 832: { cat: "pass" },
  341: { cat: "bay" }, 841: { cat: "bay" }, 840: { cat: "strait" },
  342: { cat: "beach" }, 842: { cat: "beach" }, 343: { cat: "cape" }, 843: { cat: "cape" }, 352: { cat: "island" }, 850: { cat: "island" },
  411: { cat: "route" }, 412: { cat: "interchange", sym: [2941, 2945] }, 413: { cat: "bridge" },
  421: { cat: "railway" }, 422: { cat: "station", kind: "public" }, 431: { cat: "port", sym: [6361, 6367, 6368] },
  531: { cat: "park" }, 532: { cat: "historic", sym: [6341] }, 533: { cat: "fishing_port", sym: [6362] },
  634: { cat: "school", kind: "school", sym: [3212, 3213, 3214, 631, 632, 633] },
  661: { cat: "shrine", kind: "shrine", sym: [3231] }, 662: { cat: "temple", kind: "temple", sym: [3232] },
  673: { cat: "hall", kind: "public" }, 681: { cat: "visitor_centre", kind: "public" },
  880: { cat: "government", kind: "public", sym: [3201, 3202, 3203] }, 881: { cat: "city_hall", kind: "public", sym: [3205, 3206, 1402] },
  882: { cat: "health_centre", kind: "public", sym: [3244] }, 883: { cat: "police", kind: "public", sym: [3211, 3241] },
  884: { cat: "fire_station", kind: "public", sym: [3242] }, 885: { cat: "school", kind: "school", sym: [3212, 3213, 3214, 631, 632, 633] },
  886: { cat: "hospital", kind: "public", sym: [3243] }, 887: { cat: "post_office", kind: "public", sym: [3218] },
  889: { cat: "museum", kind: "public", sym: [3216] }, 890: { cat: "care_home", kind: "public", sym: [3215] }, 899: { cat: "facility", kind: "public" },
  3241: { cat: "police", kind: "public", sym: [3241] }, 3242: { cat: "fire_station", kind: "public", sym: [3242] },
};
/** Symbol code -> lot kind for the building the symbol stands on (a symbol without a text still says what it is). */
export const SYMBOL_KIND = {
  3201: "public", 3202: "public", 3203: "public", 3205: "public", 3206: "public", 3211: "public", 3212: "school", 3213: "school", 3214: "school",
  3215: "public", 3216: "public", 3217: "public", 3218: "public", 3231: "shrine", 3232: "temple", 3241: "public", 3242: "public", 3243: "public", 3244: "public",
  631: "school", 632: "school", 633: "school", 3261: "factory",
};
const key = (p) => `${Math.round(p[0] / 25)},${Math.round(p[1] / 25)}`;

/**
 * vt.Anno ([{ code, text?, p: [x, z], ... }]) -> { places, facilities, symbols, heights }
 *   places: named areas and natural features { name, cat, p }
 *   facilities: { name, cat, kind, p (the paired symbol, else the text anchor), sym (code | null), textP }
 *   symbols: every map symbol { code, meaning, kind, p } (deduplicated)
 *   heights: spot heights and benchmarks { h, code, p }
 */
export function parseAnno(anno, { pairRadius = 140 } = {}) {
  const seen = new Set();
  const texts = [], symbols = [], heights = [];
  for (const a of anno) {
    const k = `${a.code}|${a.text ?? ""}|${key(a.p)}`;
    if (seen.has(k)) continue; seen.add(k);
    if (a.code >= 7101 && a.code <= 7201 && a.text) { const h = parseFloat(a.text); if (Number.isFinite(h)) heights.push({ h, code: a.code, p: a.p }); continue; }
    if (a.text && TEXT[a.code]) { texts.push(a); continue; }
    if (!a.text && SYMBOLS[a.code]) symbols.push({ code: a.code, meaning: SYMBOLS[a.code], kind: SYMBOL_KIND[a.code] ?? null, p: a.p });
  }
  const places = [], facilities = [];
  const used = new Set();
  // same text in two classes (e.g. 312 and 810 for one mountain) at the same spot -> keep the first
  const nameSeen = new Set();
  for (const t of texts) {
    const T = TEXT[t.code];
    const nk = `${t.text}|${key(t.p)}`;
    if (nameSeen.has(nk)) continue; nameSeen.add(nk);
    if (!T.kind && !T.sym) { places.push({ name: t.text, cat: T.cat, p: t.p }); continue; }
    let best = null;
    if (T.sym) for (let i = 0; i < symbols.length; i++) {
      const s = symbols[i]; if (!T.sym.includes(s.code) || used.has(i)) continue;
      const d = Math.hypot(s.p[0] - t.p[0], s.p[1] - t.p[1]);
      if (d < pairRadius && (!best || d < best.d)) best = { d, i, s };
    }
    if (best) used.add(best.i);
    const f = { name: t.text, cat: T.cat, kind: T.kind ?? null, p: best ? best.s.p : t.p, sym: best ? best.s.code : null, textP: t.p };
    if (T.kind) facilities.push(f); else places.push({ name: f.name, cat: f.cat, p: f.p });
  }
  return { places, facilities, symbols, heights };
}
