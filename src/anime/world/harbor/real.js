// [v4:landmarks-A] Measured geometry of the inner-bay landmarks, in ENU metres (x east, z south; src/core/geo.js).
// One table shared by the harbour builders and scripts/anime/build-layout.js (which tags the lots that these
// landmarks replace, so town never draws a generic box under them). Every value names its source; the reference
// sheets are docs/anime/landmarks/*.md and the audit is docs/anime/landmarks/AUDIT.md.
//
// Sources: OpenStreetMap (© OpenStreetMap contributors, ODbL; raw/osm/overpass.json, extract of 2026-05-06), the GSI
// aerial photo z18 (data/ortho/core.jpg, measured on 5 m grids), the GSI DEM (data/terrain), and the design / engineering
// pages cited per entry (土木学会デザイン賞, 宮城県, 大日本ダイヤコンサルタント, kesennuma-uoichiba.jp, kesennuma-kanko.jp).

/** Building outlines. `osm` is the OSM way; lots whose OSM match (lot.osm) or centroid falls inside get `landmark`. */
export const SITES = {
  // 気仙沼市魚市場 north end: the market block with the rooftop car park and the ramp (OSM way 761720498)
  marketNorth: { osm: 761720498, poly: [[538.2, 607.5], [535.5, 602.8], [395.4, 568.2], [394, 575.2], [386.9, 573.4], [384.9, 580.6], [375.6, 578.4], [374.2, 583.9], [370.6, 598.2], [380.9, 601], [378.6, 608.7], [416.6, 617.9], [505.4, 639.5], [533.3, 700.6], [541.4, 714.8], [549.6, 725.5], [554.1, 723.5], [506.7, 620.3], [538.2, 607.5]] },
  // 北側施設 (1995) + A/B棟: the long quay shed, rooftop car park (OSM way 105732020; the city gives 延長 300 m)
  marketShed: { osm: 105732020, poly: [[654.4, 946.7], [684.4, 933.7], [612.4, 771.3], [538.2, 607.5], [506.7, 620.3], [554.1, 723.5], [565, 747.3], [569.1, 746], [573.4, 756.2], [570.3, 758.9], [582.9, 786.3], [606.7, 839.6], [612, 838.3], [617, 848.2], [612.3, 852.1], [654.4, 946.7]] },
  // 高度衛生管理型 C棟 (2019, 195 m; OSM way 761258023)
  marketC: { osm: 761258023, poly: [[631.6, 963.2], [691.9, 935.7], [739.9, 1040.3], [745.8, 1037.6], [748.7, 1044], [744.3, 1046.1], [760, 1080.3], [766, 1077.6], [769.3, 1084.8], [764.2, 1087.1], [776.1, 1113], [744.2, 1127.5], [723.1, 1137.1], [713.3, 1141.5], [631.6, 963.2]] },
  // D棟 (2019, 135 m, 250 kW PV roof): not in OSM; corners of the roof slab on the z18 photo (±1.5 m)
  marketD: { osm: null, poly: [[716, 1149], [770, 1124], [835, 1247], [776.5, 1272.5]] },
  // 気仙沼 海の市 / シャークミュージアム (OSM way 761720497)
  uminoichi: { osm: 761720497, poly: [[357.1, 623.8], [411.2, 637.4], [416.4, 638.7], [439.6, 644.5], [433.1, 670.2], [431.1, 669.7], [429.3, 676.7], [418.2, 673.9], [417.3, 677.4], [424, 679.1], [422.8, 683.9], [416.2, 682.2], [415.6, 684.4], [369.7, 672.8], [370.1, 671], [361.4, 668.7], [362.3, 665], [355.8, 665], [364.7, 629.8], [356.1, 627.6], [357.1, 623.8]] },
  // PIER7 / 創(ウマレル) (OSM way 775150081): a bent bar along the 南町 seawall, 3 storeys (デザイン賞 2022)
  pier7: { osm: 775150081, poly: [[50.6, 132.6], [4.1, 89.8], [-4.5, 74.9], [7.6, 67.8], [13.9, 79.8], [64.8, 123.8], [59.9, 131], [54.8, 126.8], [50.6, 132.6]] },
  // 迎(ムカエル) (OSM way 775150093): 53 × 10 m, 3 storeys
  mukaeru: { osm: 775150093, poly: [[-9.5, 50.1], [-17.4, 43.4], [-39.5, 6.4], [-30.5, 1.5], [-3.9, 47.4], [-9.5, 50.1]] },
  // 結(ユワエル) (OSM way 791393332) and 拓(ヒラケル) (OSM way 791393331): low shop houses behind 迎
  yuwaeru: { osm: 791393332, poly: [[-24.3, 74.2], [-69.6, 105.7], [-81.4, 89], [-83.6, 90.6], [-88, 84.2], [-37, 48.7], [-30.2, 58.5], [-33.6, 60.9], [-24.3, 74.2]] },
  hirakeru: { osm: 791393331, poly: [[-52.8, 120.2], [-47.9, 116.6], [-20.4, 88.4], [-13.4, 98.8], [-11, 97.7], [-8.9, 100.3], [-42.5, 123.7], [-43.2, 122.7], [-49.1, 126.8], [-52.8, 120.2]] },
  // the GSI footprints of the 2F decks cantilevered over the 南町 wall (built with 迎 and PIER7 in minami.js)
  mukaeruDeck: { osm: null, poly: [[-4.8, 35.4], [4.2, 50.5], [7.2, 48.8], [-1.7, 33.6]] },
  pier7Deck: { osm: null, poly: [[10, 64.1], [19.9, 80.1], [27.5, 89], [27.5, 84.9], [22.1, 78.5], [12.3, 62.7]] },
  pier7Deck2: { osm: null, poly: [[27.5, 89], [36.5, 96.9], [49.1, 107.1], [50.8, 104.9], [38.2, 94.7], [28.9, 86.6], [27.5, 84.9]] },
  // 神明崎: the long single-storey 社務所 on the ridge (GSI footprint 23 × 7 m, OSM node 7653079720) and 猪狩神社
  shamusho: { osm: null, poly: [[343.5, -76.6], [350.8, -76], [352.7, -99.2], [345.4, -99.7]] },
  ikari: { osm: null, poly: [[344.8, -50.6], [349.7, -50.3], [350, -55.5], [345.1, -55.7]] },
};

/** Point-in-polygon (even-odd). */
export function inPoly(x, z, poly) {
  let c = false;
  for (let i = 0, k = poly.length - 1; i < poly.length; k = i++) {
    const [xi, zi] = poly[i], [xk, zk] = poly[k];
    if ((zi > z) !== (zk > z) && x < (xk - xi) * (z - zi) / (zk - zi) + xi) c = !c;
  }
  return c;
}

/** The landmark id a lot belongs to (by its OSM match, else its centroid), or null. */
export function siteOfLot(osm, cx, cz) {
  for (const [id, s] of Object.entries(SITES)) {
    if (s.osm && osm && String(osm).replace(/^w/, '') === String(s.osm)) return id;
    if (inPoly(cx, cz, s.poly)) return id;
  }
  return null;
}

/** PIER7 bay-cruise floating piers (OSM ways 819508304 / 1464061063, roofs 1464061062 / 1464061061). */
export const PONTOONS = [
  { poly: [[64.8, 6.4], [35.8, 23.5], [30.6, 14.6], [59.5, -2.5]], roof: [[33.4, 15.4], [55.7, 2.4], [58.6, 7.3], [36.3, 20.3]], gang: [[31.5, 19.2], [26.9, 21.9]] },
  { poly: [[85, 41.2], [56, 58.1], [50.8, 49.2], [79.7, 32.2]], roof: [[54.1, 49.8], [76.3, 36.8], [79.2, 41.7], [57, 54.7]], gang: [[51.9, 55.1], [47.4, 57.8]] },
];

/**
 * 気仙沼湾横断橋 (かなえ大橋). Deck centreline = the mid-line of OSM way 964443110 (the bridge area, 1,341 m; it runs
 * within 1 m of the surveyed GSI road centre line RdCL 2703), sampled every ~22 m from the SW (気仙沼港IC side, s = 0)
 * to the NE abutment (浪板, s = 1339; the OSM outline stops 10 m short of the 160 m side span, so the line is extended
 * along its last bearing). Pylons: the pylons measured on the construction-era ortho project onto this line at
 * s = 820.5 and 1174.9 (their 8-9 m lateral offset is the photo's lean of the elevated deck and crane), so the main-span
 * centre is s = 997.7 and the pylons stand 180 m either side: s = 818 (south pylon, on the 朝日町 quay) and s = 1178
 * (north pylon, in the water). Spans 160 + 360 + 160 m (デザイン賞 2024), land viaduct
 * 3+7 spans (長大), pylons 115 m above the sea on 15 m RC piers (大日本ダイヤコンサルタント), a single central cable
 * plane (1面吊り), deck 10.5 m (+ the cable median in the cable-stayed part), clearance 32 m (Wikipedia).
 */
export const KANAE = {
  line: [[990.8, 2405.6], [996.9, 2384.3], [1003.4, 2363.1], [1010.5, 2342.1], [1017.9, 2321.2], [1025.8, 2300.6], [1034.3, 2280.1], [1042.8, 2259.7], [1051.7, 2239.4], [1061.1, 2219.3], [1070.8, 2199.4], [1080.8, 2179.7], [1090.9, 2159.9], [1101.4, 2140.4], [1112.1, 2121], [1123, 2101.7], [1134, 2082.6], [1145.2, 2063.4], [1156.4, 2044.3], [1167.6, 2025.2], [1178.6, 2006], [1189.5, 1986.7], [1200.4, 1967.4], [1211.3, 1948.1], [1222.4, 1928.9], [1233.6, 1909.9], [1244.9, 1890.8], [1256.2, 1871.7], [1267.3, 1852.6], [1278.5, 1833.5], [1289.7, 1814.3], [1300.7, 1795.1], [1311.8, 1776], [1322.9, 1756.8], [1334.1, 1737.7], [1345.3, 1718.5], [1356.4, 1699.4], [1367.5, 1680.3], [1378.7, 1661.1], [1389.9, 1642], [1401.1, 1622.9], [1412.2, 1603.7], [1423.3, 1584.6], [1434.4, 1565.4], [1445.5, 1546.2], [1456.5, 1527], [1467.6, 1507.8], [1478.7, 1488.7], [1489.9, 1469.5], [1501, 1450.4], [1512.1, 1431.2], [1523.3, 1412.1], [1534.4, 1393], [1545.6, 1373.8], [1556.7, 1354.7], [1567.8, 1335.5], [1578.8, 1316.3], [1589.9, 1297.1], [1601, 1277.9], [1612.1, 1258.7], [1623.3, 1239.7], [1628.4, 1231.1]],
  pylonS: 816.5, pylonN: 1176.5, side: 160, main: 360,   // [v4:integrate] centre s = 996.5 (the pre-deck footing, below)
  crest: 36.0,            // deck surface at mid-span: 32 m clearance + the 3.2 m hexagonal girder + surfacing
  endY: [19.5, 29.0],     // deck surface at the SW end (on the 気仙沼港IC approach) and at the NE abutment (浪板 hill)
  pierTop: 15, pylonTop: 115, width: 10.5, cableWidth: 14.0, landWidth: 12.0,
  // [v4:integrate] north = the pylon footing's centre on the pre-deck GSI orthos (layers `ort` and `nendophoto2019`,
  // z18 tile 234176/100285: the twin blue leg bases straddle the OSM line 1.6 m off it, s = 1173.1); south = the
  // construction-era ortho point (1361, 1676) projected on the surveyed axis (s = 819.9; its 7.8 m lateral offset is the
  // same lean of the elevated deck and crane that the north footing shows). Centre = their mid-point (s = 996.5).
  measured: { centre: [1456.4, 1527.2], north: [1543.8, 1373.8], south: [1367.7, 1679.9], orthoRaw: { north: [1537, 1369], south: [1361, 1676] } },
};

/** 気仙沼大島大橋: OSM way 669276579 ends; mid-deck steel arch, span 297, rise 54, spans 24.7+40.5+224+40.5+24.7 m. */
export const OSHIMA = {
  a: [2765.8, 2856.0], b: [2654.9, 3194.2], len: 356.0,
  spans: [24.7, 40.5, 224.0, 40.5, 24.7], archSpan: 297, rise: 54, springY: 9, crest: 34.8, endY: [25.6, 29.4], width: 9.5,
};

/** 神明崎 (measured on the z18 ortho, docs/anime/landmarks/shinmeizaki.md) */
export const SHINMEI = {
  // 浮見海道: the vermilion walkway round the tip, from the west revetment foot round the pavilion and up the east seawall
  ring: [[325.7, -52], [327.6, -40], [329.5, -33.5], [333, -28.2], [337.5, -25.2], [342.2, -23.6], [349, -22.9], [355, -22.6], [361, -23], [366.5, -24.5], [371.5, -27.4], [375, -31.6], [377, -37], [378, -44], [378.8, -54.5], [383.4, -58.3], [384.8, -76], [386.8, -78.4], [388.1, -106], [389.4, -133]],
  pavilion: [341.6, -23.4],          // 浮見堂 roof square (GSI ortho; = SPOTS.ukimido)
  ebisu: [358.9, -22.6],             // 立ち恵比寿像 (OSM node 7580455850), 3rd generation, 2020
  shrine: [363.1, -120.9],           // 五十鈴神社 hall (OSM node 2495986401)
  summit: [362, -130],               // T.P. 16.3 m (DEM)
  torii: [345.0, -145.3],            // main torii at the stair foot off the 東浜街道 bend (SPOTS.isuzuTorii; [v4:polish3] was 340.5,-150 on the footway r12723)
  shamusho: [348.2, -90.3],          // 社務所 (OSM node 7653079720)
  ikari: [347.8, -52.6],             // 猪狩神社 (OSM node 2495986403)
  hall: { c: [352, -72], w: 8, d: 28, rot: 0.08 },   // the long single-storey hall on the ridge (GSI footprint)
  // the wide sloping concrete revetment on the west side (the inner bay's east edge), water line and crest line
  revetWater: [[283, -140], [297, -118], [307, -97], [316, -78], [323, -60], [325.7, -52]],
  revetCrest: [[306, -150], [318, -126], [327, -104], [331, -86], [333, -70], [333, -56]],
};

/**
 * 魚町 flap-gate seawall (土木学会デザイン賞 2022; imakawa.net blog: crest T.P. 4.1 m, 1.3 m above the pavement, 21 gates
 * of 13.7 m, 311 m). Line = the wall crest on the z18 ortho, west to east; stairs = the white stair / rest-deck units
 * that cross it (measured on the ortho).
 */
export const UWALL = {
  line: [[4, -30], [51.6, -57], [136.8, -109.2], [172, -134.2], [214.6, -161.8], [258.4, -167.2]],
  crest: 4.1, pavement: 2.8, apron: 2.3, gates: 21, gateLen: 13.7,
  stairs: [[51.6, -57], [62.4, -63.6], [72.6, -69], [81.6, -74], [94.8, -81.8], [108.6, -90.6], [124.2, -100.8], [136.8, -109.2], [172, -134.2], [196.5, -150], [214.6, -161.8], [230, -163.8], [245, -165.6]],
};

/** 南町: the stepped garden between 迎 and PIER7 (z18 ortho), its three round tree pits, and the sloped lawn. */
export const MINAMI = {
  garden: [[16.8, 24.5], [40.2, 64.8], [23.9, 72.6], [-0.1, 33]],   // N, E, S, W corners; steps fall toward the NE (bay)
  pits: [[18.8, 55.4], [25.5, 61.5], [31.3, 60.8]],
  lawn: [[-26, 6], [8, 6], [14, 24], [-2, 33], [-12, 30]],
  wallCrest: 6.2,
};

/** 安波山 (OSM nodes 7113790418 peak, 7113790413 viewpoint; kesennuma-kanko.jp: three terraces). */
export const ANBA = {
  summit: [-493.6, -990.2],
  hinode: [-513.0, -692.1],     // ひのでのてらす (6合目): the OSM 安波山展望台 viewpoint by the road
  hoshi: [-503.4, -866.0],      // ほしのてらす (8合目): the small roof on the path (z17 ortho)
};

/**
 * [v4:polish1] 風待ち地区 (魚町): the registered tangible cultural properties (国登録有形文化財) rebuilt on their own lots
 * after 2016, modelled from their records and photos (docs/anime/landmarks/kazemachi.md). `lot` is the GSI footprint the
 * building stands on (its outline is the model's outline); storeys / height (to the roof ridge or the parapet top) are
 * the model's and are written into the layout (scripts/anime/build-layout.js). Built by harbor/kazemachi.js, except
 * 男山本店, which explore/interiors.js builds with its walk-in shop.
 * Sources: 文化遺産オンライン (online.bunka.go.jp/heritages/detail/138818 男山本店店舗: 木筋コンクリート造 3 階建,
 * 鉄板葺, 建築面積 173 m², 洗い出し仕上の外壁, 各階の蛇腹, パラペットに柱型・欄干・ゲーブル, 南に内湾を望む; 179266 角星店舗:
 * 木造 2 階建, 切妻造, 桟瓦葺, 建築面積 99 m², 不等辺四角形の敷地), kesennuma-kanko.jp (otokoyama-new2020: rebuilt July
 * 2020, 1F shop, 2F hall, 3F gallery; kazamachi_kakuboshi: 土蔵風の木造 2 階建, 魚町 2-1-17, rebuilt Nov 2016, the front
 * angled to face the sea), ja.wikipedia.org 武山米店炊飯博物館 (魚町 1-1-13, 38°54'25"N 141°34'22"E; 主屋 木造 2 階建,
 * 切妻造, 亜鉛メッキ鋼板葺, 正面の垂木を扇形に配し 2 階の腰壁は銅板張, 1930, rebuilt April 2018; the 土蔵 beside it is the
 * 炊飯博物館), the 風待ち project report (jsurp.jp 2023: map of the eight rebuilt buildings and a photo of each),
 * OSM (way 966913931 男山本店 魚町直営店; nodes 5162601626 武山米店, 5965587005 武山米店店舗及び主屋) and the GSI z18
 * photo (roof colours). The OSM node named 角星園茶舗 (7653079722) lies inside 角星店舗's footprint.
 */
export const KAZEMACHI = {
  otokoyama: { lot: '16/58540/25068/327', ja: '男山本店店舗', built: 1931, rebuilt: 2020, storeys: 3, height: 11.4, roof: 'flat', roofColor: '#98b0b4', wall: '#bdb4a4' },
  kakuboshi: { lot: '16/58540/25068/295', ja: '角星店舗', built: 1929, rebuilt: 2016, storeys: 2, height: 8.4, eave: 6.3, roof: 'gable', roofColor: '#6f777c', wall: '#f1eee6', ridge: 'front' },
  takeyama: { lot: '16/58540/25068/283', ja: '武山米店', built: 1930, rebuilt: 2018, storeys: 2, height: 8.2, eave: 6.5, depth: 10.5, roof: 'gable', roofColor: '#8a9496', wall: '#4a3a2e', ridge: 'front' },
  takeyamaKura: { lot: '16/58540/25068/284', ja: '武山米店 土蔵（炊飯博物館）', built: 1930, rebuilt: 2018, storeys: 2, height: 7.4, eave: 5.6, roof: 'gable', roofColor: '#5f6668', wall: '#f3f1ea', ridge: 'deep' },
};
/** The lots of KAZEMACHI: town leaves them to harbor/kazemachi.js (and explore/interiors.js for 男山本店). */
export const KAZEMACHI_LOTS = new Set(Object.values(KAZEMACHI).map((k) => k.lot));
/** The KAZEMACHI entry of a lot id, or null. */
export function kazemachiOf(id) { for (const [k, v] of Object.entries(KAZEMACHI)) if (v.lot === id) return { id: k, ...v }; return null; }
