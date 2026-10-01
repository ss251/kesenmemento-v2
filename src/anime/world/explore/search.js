// [v4:explore] Place search in Japanese and English (V3-SPEC section 10: "place search in JA and EN over real names"):
// every named place of the enrichment (data/anime/layout.json PLACES: OSM names and name:en, GSI annotations; 3,500+)
// plus the tour stops, the civic landmarks and explore's places. Names are matched after NFKC folding with katakana
// folded to hiragana (マイヤ = まいや), exact before prefix before substring, nearer first; a kind of place in either
// language ("病院", "hospital", "寿司", "cafe") lists the nearest places of that kind. Pure: tested.
//
//   const S = createSearch(L, { featured, near: () => [x, z] })
//   S.find(q, n) -> [{ id, ja, en, cat, at: [x, z], group }]   S.featured()   S.areaAt(x, z) -> { ja, en } | null
export function fold(t) {
  return String(t || '').normalize('NFKC').toLowerCase().replace(/[\s・･·.\-_'’「」『』（）()]/g, '')
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/** Kind words (JA and EN) -> a test on the OSM / GSI category. */
export const KINDS = [
  [['駅', 'えき', 'station', 'train', 'brt', 'バス停', 'bus'], /station|bus_stop|platform|stop_position/],
  [['病院', 'びょういん', 'hospital', '医院', 'clinic', 'doctor'], /hospital|clinic|doctors/],
  [['歯科', 'dentist'], /dentist/],
  [['学校', 'がっこう', 'school', '小学校', '中学校', '高校'], /school/],
  [['神社', 'じんじゃ', 'shrine'], /shrine|place_of_worship/],
  [['寺', 'てら', 'temple'], /temple|place_of_worship/],
  [['教会', 'church'], /place_of_worship/],
  [['郵便局', 'ゆうびんきょく', 'post', 'postoffice'], /post_office/],
  [['銀行', 'bank', 'atm'], /bank/],
  [['公園', 'こうえん', 'park'], /park|playground|garden/],
  [['ホテル', 'hotel', '旅館', 'りょかん', 'ryokan', '宿', 'inn'], /hotel|guest_house|hostel/],
  [['喫茶', 'カフェ', 'cafe', 'coffee', 'コーヒー'], /cafe/],
  [['食堂', 'レストラン', 'restaurant', 'ごはん', 'food', 'eat', '寿司', 'すし', 'sushi', 'ラーメン', 'ramen'], /restaurant|fast_food/],
  [['居酒屋', 'bar', 'pub', 'izakaya'], /bar|pub/],
  [['スーパー', 'supermarket', 'grocery'], /supermarket/],
  [['コンビニ', 'convenience', 'konbini'], /convenience/],
  [['薬局', 'pharmacy', 'drugstore'], /pharmacy|chemist/],
  [['鮮魚', '魚屋', 'fish', 'seafood', '市場', 'market'], /seafood|marketplace/],
  [['酒', 'sake', 'liquor'], /alcohol/],
  [['警察', '交番', 'police'], /police/],
  [['消防', 'fire'], /fire_station/],
  [['図書館', 'library'], /library/],
  [['美術館', '博物館', 'museum'], /museum/],
  [['役所', '市役所', 'cityhall', 'townhall'], /townhall|city_hall|government/],
  [['展望', 'viewpoint', 'view'], /viewpoint/],
  [['橋', 'bridge'], /bridge/],
];

/** [v5:fix1] Area categories (町名 / 丁目 / 地区) and an area name without its 丁目 or （二） suffix: 八日町一丁目 -> 八日町. */
const AREA_CATS = /^(district|neighbourhood|quarter|suburb|locality)$/;
export const areaBase = (name) => String(name || '').replace(/[（(][^）)]*[）)]\s*$/, '').replace(/[一二三四五六七八九十0-9０-９]+丁目$/, '').trim();

export function createSearch(L, { featured = [], near = () => [0, 0] } = {}) {
  // the named places, one per name and neighbourhood (OSM often maps a school as several buildings)
  const all = [];
  const seen = new Map();
  for (const p of L.PLACES) {
    if (!p.name) continue;
    const k = fold(p.name), prev = seen.get(k);
    if (prev && prev.some((q) => Math.hypot(q.at[0] - p.x, q.at[1] - p.z) < 160)) continue;
    const it = { id: p.id, ja: p.name, en: p.nameEn || null, cat: p.cat || 'other', at: [p.x, p.z], group: 'search', lot: p.lot || null, src: p.src };
    all.push(it); if (!prev) seen.set(k, [it]); else prev.push(it);
  }
  const feat = featured.slice();
  const index = feat.concat(all).map((it) => ({ it, a: fold(it.ja), b: fold(it.en), area: AREA_CATS.test(it.cat) ? fold(areaBase(it.ja)) : null }));
  function areaIndex() {
    return L.PLACES.filter((p) => p.cat === 'neighbourhood' || p.cat === 'quarter' || p.cat === 'district').map((p) => ({ ja: p.name, en: p.nameEn, x: p.x, z: p.z, w: p.cat === 'neighbourhood' ? 0 : p.cat === 'quarter' ? 40 : 80 }));
  }
  const areas = areaIndex();
  const api = {
    featured: () => feat,
    all,
    find(q, n = 20) {
      const f = fold(q); if (!f) return [];
      const [nx, nz] = near();
      const d = (it) => Math.hypot(it.at[0] - nx, it.at[1] - nz);
      const hits = [];
      for (const e of index) {
        let s = e.a === f || e.b === f ? 0 : e.a.startsWith(f) || (e.b && e.b.startsWith(f)) ? 1 : e.a.includes(f) || (e.b && e.b.includes(f)) ? 2 : -1;
        // [v5:fix1] a bare 町名 (八日町) names the district: its 丁目 / （二） areas rank above the shops that carry the name
        if (s < 0) continue;
        if (e.area && e.area === f) s = -0.6;
        hits.push([s - (e.it.group !== 'search' ? 0.5 : 0), d(e.it), e.it]);
      }
      // kind words: the nearest places of that kind (after the name matches)
      for (const [words, re] of KINDS) {
        if (!words.some((w) => fold(w) === f || (f.length >= 3 && fold(w).startsWith(f)))) continue;
        for (const it of all) if (re.test(it.cat)) hits.push([3, d(it), it]);
      }
      hits.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const out = [], ids = new Set();
      // one result per place: the same name within 160 m (a featured place and its OSM feature) counts once
      for (const h of hits) {
        const it = h[2]; if (ids.has(it.id)) continue;
        const k = fold(it.ja);
        if (out.some((o) => fold(o.ja) === k && Math.hypot(o.at[0] - it.at[0], o.at[1] - it.at[1]) < 160)) continue;
        ids.add(it.id); out.push(it); if (out.length >= n) break;
      }
      return out;
    },
    /** The neighbourhood (町名) at (x, z): the nearest 丁目 / 地区 label within 350 m. */
    areaAt(x, z) {
      let best = null;
      for (const a of areas) { const dd = Math.hypot(a.x - x, a.z - z) + a.w; if (dd < 350 && (!best || dd < best.d)) best = { d: dd, a }; }
      return best ? { ja: best.a.ja, en: best.a.en } : null;
    },
  };
  return api;
}
