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

/**
 * Kind words (JA and EN) -> a test on the OSM / GSI category. [r3:14] An entry may carry a third item, a NAME test that applies to place_of_worship places only: OSM maps churches, shrines and temples all as
 * amenity=place_of_worship, so the category alone listed 青龍寺 and 愛宕神社 under 教会 and the other way round; the name tells them apart. 教会 has no category test at all (/^$/): a church is a
 * place_of_worship named 教会 / ハリストス / ホープセンター (気仙沼 ホープセンター is a church that is not called one).
 */
export const KINDS = [
  [['駅', 'えき', 'station', 'train', 'brt', 'バス停', 'bus'], /station|bus_stop|platform|stop_position/],
  [['病院', 'びょういん', 'hospital', '医院', 'clinic', 'doctor'], /hospital|clinic|doctors/],
  [['歯科', 'dentist'], /dentist/],
  [['学校', 'がっこう', 'school', '小学校', '中学校', '高校'], /school/],
  [['神社', 'じんじゃ', 'shrine'], /shrine/, /神社|大明神|稲荷|宮$|社$/],
  [['寺', 'てら', 'temple'], /temple/, /寺|院$|堂$/],
  [['教会', 'church'], /^$/, /教会|ハリストス|ホープセンター/],
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
  // [r3:14] baths, petrol stations and toilets had no kind word: 温泉 / 風呂 / 銭湯 / ガソリン / 給油 / トイレ returned nothing (the one 風呂 hit was a company, 斎藤風呂店). A word must be listed in full for a query that
  // is longer than the word to reach it (the matcher tests fold(word).startsWith(query)): ガソリンスタンド and お風呂 are words of their own.
  [['温泉', '風呂', 'お風呂', '銭湯', '湯', 'bath', 'onsen'], /public_bath|sauna|shower|spa/],
  [['ガソリン', 'ガソリンスタンド', '給油', 'スタンド', 'fuel', 'gas', 'petrol'], /fuel/],
  [['トイレ', '便所', 'toilet'], /toilets/],
];
/** [r3:14] the one-character kind words (寺, 湯, 酒, 駅, 橋, 宿): a bare 寺 also substring-matches the surname 小野寺 (小野寺自動車整備工場, 小野寺五典 事務所, 小野寺製材所) */
const KIND_WORD_1 = new Set(KINDS.flatMap(([words]) => words.map(fold).filter((w) => [...w].length === 1)));

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
        // [r3:14] a one-character kind word (寺): the name-substring hits (小野寺...) come AFTER the kind hits (score 3), not before them; nothing is dropped (長命寺, 地福寺 are still found)
        if (s === 2 && [...f].length === 1 && KIND_WORD_1.has(f)) s = 3.5;
        // [v5:fix1] a bare 町名 (八日町) names the district: its 丁目 / （二） areas rank above the shops that carry the name
        if (s < 0) continue;
        if (e.area && e.area === f) s = -0.6;
        hits.push([s - (e.it.group !== 'search' ? 0.5 : 0), d(e.it), e.it]);
      }
      // kind words: the nearest places of that kind (after the name matches)
      for (const [words, re, nameRe] of KINDS) {
        if (!words.some((w) => fold(w) === f || (f.length >= 3 && fold(w).startsWith(f)))) continue;
        for (const it of all) if (re.test(it.cat) || (nameRe && it.cat === 'place_of_worship' && nameRe.test(it.ja))) hits.push([3, d(it), it]);
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
    /** The neighbourhood (町名) at (x, z): [sys:21] the census small area (e-Stat polygon, L.areaPolyAt) that contains it; only outside every
     *  polygon (over the sea) the nearest 丁目 / 地区 label within 350 m (a Voronoi guess: wrong at a third of the land). */
    areaAt(x, z) {
      const poly = L.areaPolyAt?.(x, z);
      if (poly) return { ja: poly.ja, en: poly.en || null };
      let best = null;
      for (const a of areas) { const dd = Math.hypot(a.x - x, a.z - z) + a.w; if (dd < 350 && (!best || dd < best.d)) best = { d: dd, a }; }
      return best ? { ja: best.a.ja, en: best.a.en } : null;
    },
  };
  return api;
}
