// [v4:landmarks-B] Measured geometry of the civic landmarks (V3-SPEC section 10), in ENU metres (x east, z south;
// src/anime/world/layout.js). One table shared by the builders in this folder and by scripts/anime/build-layout.js,
// which tags every GSI lot these buildings replace (`landmark`), so town never draws a generic box under them.
// Reference sheets: docs/anime/landmarks/{city-hall,kesennuma-station,rias-ark,hospitals,schools,shrines-temples,
// oshima-kameyama,oshima-ferry-pier}.md. Every value names its source.
//
// Sources: OpenStreetMap (© OpenStreetMap contributors, ODbL; raw/osm/overpass.json, extract of 2026-05-06): the
// outlines below are the OSM ways, converted with the layout's ENU formula. GSI seamlessphoto z17/z18 (出典：国土地理院)
// and the GSI DEM. 気仙沼市「新庁舎建設 実施設計説明書（概要版）」(2024-09) for the new city hall; 気仙沼市「亀山通信」
// 第3・5・7号 (2024-03, 2025-11, 2026-03) for the 亀山 monorail and summit; the city's page on the 気仙沼大島ウェルカム・
// ターミナル; Wikimedia Commons photos (station, museum, city hall) used as shape and colour references only.

/** OSM building / site outlines (closing point dropped). */
export const OSM = {
  cityHall: { osm: 602638650, poly: [[-466.8,-244.5],[-452,-249.5],[-446,-231.8],[-438,-234.5],[-441.4,-244.6],[-438.8,-245.5],[-436.6,-239.1],[-426.2,-242.6],[-425,-239.1],[-404.8,-245.9],[-405.4,-247.5],[-397.1,-250.3],[-392.6,-237],[-456.9,-215.4]] },
  cityHall2: { osm: 819508286, poly: [[-428.9,-286.1],[-422.4,-274.3],[-417.9,-276.8],[-418.7,-278.4],[-381.6,-298.8],[-387,-308.5],[-391.7,-305.9],[-393.4,-309.1],[-399.5,-305.8],[-397.9,-303],[-402.1,-300.7],[-404,-304.2],[-409,-301.5],[-406.9,-297.8],[-417.9,-291.8],[-419,-293.7],[-424,-291],[-424.7,-292.4],[-429.5,-289.8],[-427.8,-286.7]] },
  cityHall3: { osm: 819508285, poly: [[-435.9,-257.8],[-432.9,-249.6],[-413.3,-256.6],[-416.4,-265.4],[-430.5,-260.4],[-431.2,-262.3],[-434.3,-261.1],[-433.5,-258.7]] },
  cityHallE: { osm: 819508284, poly: [[-392.6,-252.9],[-390.4,-245.9],[-378.4,-249.5],[-380.6,-256.6]] },
  cityHallE2: { osm: 819508283, poly: [[-392.9,-243.8],[-390.6,-236.3],[-384.6,-238.1],[-380.4,-223.9],[-371.1,-226.7],[-377.5,-248.3]] },
  oneTen: { osm: 631751376, poly: [[-383.2,-218.1],[-367.4,-175.5],[-406.2,-162.1],[-413.7,-165.3],[-426.6,-201.7]] },
  newCityHallSite: { osm: 819508282, poly: [[-1003.9,1231.8],[-1040.4,1234.9],[-1038.3,1266.3],[-997.1,1264],[-955.2,1330.3],[-953,1343.7],[-856.9,1327.3],[-816.7,1314.3],[-809,1309.7],[-842.6,1237.8],[-865.5,1188.1],[-908,1205.9],[-912.7,1191.5],[-922.9,1193.2],[-927.4,1188.1],[-958.8,1194.8],[-980.6,1149.4],[-989.5,1105.3],[-1007.2,1107.7],[-999.5,1157.7],[-996.5,1167.8],[-996.5,1178.7],[-996.5,1190.7],[-992.3,1203.2],[-989.2,1212.8],[-989.2,1220.4],[-990.9,1227.8]] },
  station: { osm: 761402296, poly: [[-1401.1,-442.8],[-1385.7,-431.3],[-1388.6,-427.7],[-1349.8,-400.6],[-1351.3,-398.5],[-1352.6,-399.4],[-1354.7,-396.5],[-1356.3,-394.1],[-1364.6,-399.9],[-1365.8,-398.1],[-1374.3,-404],[-1382.2,-409.5],[-1380.9,-411.4],[-1379.1,-413.9],[-1389.4,-420.9],[-1391.4,-417.9],[-1397.9,-422.3],[-1392.2,-430.2],[-1397.6,-434.1],[-1399.3,-431.5],[-1405.9,-435.9],[-1404.9,-437.7],[-1403.9,-439.2]] },
  stationPlaza: { osm: 613961242, poly: [[-1438.8,-422.9],[-1417.8,-408.8],[-1402.7,-431.2],[-1423.7,-445.2]] },
  brtCanopy: { osm: 267557944, poly: [[-1385.5,-429.9],[-1366.1,-416.3],[-1349.6,-404.7],[-1351.2,-402.5],[-1367.6,-414],[-1387.1,-427.7]] },
  platformCanopy: { osm: 761402299, poly: [[-1342.7,-411],[-1339.7,-414.9],[-1366.2,-434.5],[-1363.7,-438.1],[-1420.4,-478.1],[-1422.9,-474.8],[-1423.6,-473.7],[-1437.6,-483.4],[-1439.1,-481.5],[-1390,-447.2],[-1391.4,-445.5],[-1360.9,-423.8]] },
  stationRoof2: { osm: 761402297, poly: [[-1365.8,-398.1],[-1364.1,-396.9],[-1350.8,-387.8],[-1344.6,-395.7],[-1346.9,-397.3],[-1350.3,-393.2],[-1354.7,-396.5],[-1356.3,-394.1],[-1364.6,-399.9]] },
  islandPlatform: { osm: 267557941, poly: [[-1502.9,-522.2],[-1461,-501.1],[-1436.7,-484.6],[-1422.9,-474.8],[-1420.4,-478.1],[-1363.7,-438.1],[-1366.2,-434.5],[-1339.7,-414.9],[-1341.3,-412.9],[-1342.7,-411],[-1360.9,-423.8],[-1391.4,-445.5],[-1440.4,-479.9],[-1453,-488.5],[-1469.3,-498.6],[-1480.9,-505.7],[-1504.8,-518.3]] },
  riasArk: { osm: 761761293, poly: [[-2224.7,2777.9],[-2143.8,2741.9],[-2127.7,2780],[-2170.3,2799.2],[-2177.5,2795.5],[-2185.4,2782],[-2189.9,2771.8],[-2221,2784.6]] },
  cityHospital: { osm: 761241989, poly: [[-694.7,2076.7],[-732.1,2036.5],[-749.4,2017.9],[-756.1,2025],[-791.5,1989.6],[-804.5,2001.9],[-811.7,1995.1],[-826.2,2010.7],[-821.3,2016.7],[-837.3,2036.2],[-861.5,2059.1],[-860.1,2060.3],[-857.1,2063.8],[-817.8,2021.3],[-819.2,2034.8],[-742.6,2114.3],[-740.5,2114.2],[-735,2114],[-735,2107.8],[-731,2107.6],[-725.4,2113.4],[-710.3,2098.8],[-719.4,2089.1],[-724,2084.1],[-720.1,2080.2],[-709.1,2091.8],[-708.1,2090.7]] },
  otomo: { osm: 761402305, poly: [[-717.7,10.9],[-703,43.9],[-698,41.7],[-697.7,42.4],[-690.2,39.1],[-691,37.3],[-689.9,37.1],[-694.3,27.3],[-692.1,26.3],[-687,37.6],[-677.1,33.2],[-678.2,30.8],[-676.8,30.2],[-678.8,25.5],[-658.7,16.5],[-660.6,12.2],[-653.4,8.9],[-667.8,-23.1],[-671.3,-21.5],[-672.7,-24.7],[-669.9,-26],[-671.2,-29],[-680.6,-24.8],[-668.6,1.8],[-666.7,1],[-664.1,6.6],[-683.9,15.4],[-685.3,12.3],[-691.7,15.1],[-690.4,17.9],[-699.9,22.1],[-707.1,5.8],[-709.6,6.9],[-711.7,2.1],[-714.8,3.5],[-712.5,8.6]] },
  inawashiro: { osm: 761699198, poly: [[-220.6,114.8],[-214.5,107.9],[-212.9,106.2],[-208.4,110.2],[-201.8,116],[-197.8,119.5],[-188.9,127.4],[-178.4,115.7],[-162.2,129.7],[-175.9,145.2],[-198.4,126.7],[-206.2,135.4],[-219.1,124],[-215.1,119.6]] },
  church: { osm: 436715760, poly: [[-492.6,-27.1],[-486.5,-28.3],[-487.8,-35.4],[-491.3,-34.8],[-492.9,-43.1],[-484.6,-44.6],[-481.7,-29.2],[-485.2,-24.3],[-484.6,-21.3],[-487.3,-20.8],[-487.8,-23.8],[-491.8,-23]] },
  shorinji: { osm: 820921817, poly: [[-621.9,60.2],[-605.2,54.9],[-603.6,59.8],[-600.8,59],[-598.5,66.3],[-601,67.1],[-599.3,72.4],[-616.3,77.8]] },
  seigoji: { osm: 928776172, poly: [[-308,136.1],[-313.9,146.6],[-312.4,147.5],[-313.6,149.6],[-300.3,157],[-296.1,149.4],[-294.1,150.5],[-291.5,145.8],[-302.3,133.8],[-304.6,138]] },
  ikkeijima: { osm: 362542440, poly: [[535.1,1110.1],[532.2,1094],[541.7,1084.1],[552.4,1074.5],[563.4,1075.8],[569.3,1069.4],[574.2,1065.5],[581.1,1064.4],[586.2,1066],[588.5,1071.8],[586.2,1078.1],[578.7,1092.6],[573.2,1105.7],[560.4,1120.8],[548.5,1123.8],[540.3,1119.3]] },
  ikkeijimaPark: { osm: 761250478, poly: [[539.2,1043],[588.5,1059.5],[606,1100.5],[606,1106.3],[536.4,1140.3],[526.9,1092.6]] },
  minamiShrine: { osm: 928776176, poly: [[-248.9,152.6],[-249.8,158.8],[-247.4,159.1],[-248.2,164.5],[-244.7,165],[-244,159.2],[-242.3,159.4],[-241.6,153.8],[-243.1,153.6],[-242.9,152.3],[-246,151.8],[-246.1,152.9]] },
  matsuo: { osm: 917011862, poly: [[-597,-365.9],[-592.6,-364.6],[-591.2,-369.3],[-595.5,-370.6]] },
};

/** School grounds (OSM amenity=school areas): every GSI lot whose centre is inside becomes a school building here. */
export const SCHOOLS = {
  schKesennumaE: { osm: 415669878, poly: [[-421.7,376.1],[-421.1,372.4],[-383.5,344.4],[-382,339.6],[-382.3,335.5],[-381.8,334.1],[-372.1,329.9],[-366.7,328.4],[-360.9,326.3],[-358.4,324],[-348.7,321.7],[-304.6,292],[-261.5,263.6],[-257.1,263.1],[-253.7,264.2],[-247.9,268.4],[-232.6,289.4],[-141.4,419],[-138.7,426.9],[-140.9,437.4],[-206.3,485.6],[-237.9,443.4],[-303.3,486.5],[-366.4,401],[-394.7,420]] },
  schKesennumaJ: { osm: 415669877, poly: [[-238.1,444.5],[-206,490.5],[-214.6,501.9],[-212.9,516],[-250.6,544.3],[-241.8,556.6],[-231.2,574.5],[-219.1,598.8],[-227.1,604.1],[-354.4,691.9],[-401.4,619.8],[-427.4,579],[-426.2,575.2],[-339.6,512],[-353.5,490.2],[-318.9,466.7],[-303.5,488.7]] },
  schKesennumaH: { osm: 415669879, poly: [[-1369.6,1067.6],[-1360.8,1060.3],[-1358.4,1059.5],[-1333.3,1086.8],[-1269.7,1158.9],[-1271,1165.2],[-1290.9,1174.3],[-1304.7,1195.5],[-1287.5,1222.2],[-1293.7,1238.9],[-1399.5,1337.5],[-1403.6,1334.9],[-1509.5,1213.7],[-1511.6,1208],[-1400.4,1104.1]] },
  schKujoE: { osm: 765653828, poly: [[-1793.7,1396.2],[-1824.7,1346],[-1825.8,1323],[-1837.3,1328.8],[-1857.1,1296.4],[-1867,1312.6],[-1936.2,1349.7],[-1937.8,1373.3],[-1916.7,1407.9],[-1923.9,1415.3],[-1918.8,1423.4],[-1890.6,1454.4],[-1876,1457.5],[-1857.6,1448.1],[-1847.2,1438]] },
  schShishioriJ: { osm: 104964823, poly: [[1199.7,-1397.7],[1209.2,-1193.9],[1338.6,-1197.1],[1334.1,-1341.2],[1337.3,-1359.5],[1337.9,-1374.7],[1327.2,-1388.7],[1319.2,-1390.8],[1279.8,-1398.5]] },
  schShishioriE: { osm: 762601688, poly: [[657.1,-1708.3],[679.6,-1810],[616.8,-1818.8],[619.6,-1839.4],[545.6,-1848.9],[546.1,-1713.2]] },
  schJonanJ: { osm: 415669837, poly: [[-1230,1751.1],[-1188.6,1725.7],[-1088.8,1678.5],[-1005.5,1858.1],[-1141.2,1893.3],[-1180,1809.9],[-1183.7,1805.9],[-1201.9,1814.7],[-1205.6,1813.1],[-1231.2,1755.2]] },
  schToryoH: { osm: 768032842, poly: [[1657.7,-1863.5],[1688,-1864.4],[1723.3,-1849.1],[1740.1,-1815.3],[1712.6,-1787.5],[1655.9,-1630.9],[1619.1,-1617],[1557.2,-1592.4],[1463.7,-1610],[1446.5,-1625.8],[1457.2,-1641.1],[1533,-1739.3],[1570.7,-1760],[1583.7,-1767.6],[1614.4,-1778.7],[1625.6,-1806.9],[1628.4,-1844]] },
};

/** Outdoor school pools (OSM leisure=swimming_pool) and the city hospital heliport (OSM aeroway=helipad). */
export const POOLS_HELI = {
  pool1: { osm: 768699250, poly: [[-225.3,348.9],[-238.8,329],[-227.1,321.1],[-213.6,341]] },
  pool2: { osm: 415669827, poly: [[-321.3,474.8],[-312.4,487.7],[-333.1,502],[-342.1,489.1]] },
  pool3: { osm: 415669824, poly: [[-1359.9,1064.6],[-1348.4,1076.6],[-1366.5,1093.9],[-1378,1081.9]] },
  pool4: { osm: 765653832, poly: [[-1890.5,1432.5],[-1879.2,1422.8],[-1863.1,1441.4],[-1874.3,1451.1]] },
  pool5: { osm: 415669826, poly: [[-1198.6,1748.8],[-1191.7,1763.5],[-1215.4,1774.6],[-1222.3,1759.9]] },
  pool6: { osm: 827852974, poly: [[558.2,-1716.4],[583.3,-1715.4],[583.9,-1729.4],[558.9,-1730.5]] },
  pool7: { osm: 1237719801, poly: [[1510.3,-1683],[1524.9,-1661.5],[1514.9,-1654.8],[1500.3,-1676.3]] },
  helipad: { osm: 761241990, poly: [[-885.6,2041.6],[-871.6,2055.5],[-885.6,2069.5],[-899.6,2055.5]] },
};

export const SCHOOL_INFO = {
  schKesennumaE: { ja: '気仙沼市立気仙沼小学校', en: 'Kesennuma Elementary School', sign: '気仙沼小学校', stairTower: [-323, 348], stairR: 2.6 },   // Commons 2025-09: the grey concrete stair cylinder on the yard side, where the west wing meets the long bar
  schKesennumaJ: { ja: '気仙沼市立気仙沼中学校', en: 'Kesennuma Junior High School', sign: '気仙沼中学校' },
  schKesennumaH: { ja: '宮城県気仙沼高等学校', en: 'Kesennuma High School', sign: '宮城県気仙沼高等学校' },
  schKujoE: { ja: '気仙沼市立九条小学校', en: 'Kujo Elementary School', sign: '九条小学校' },
  schShishioriJ: { ja: '気仙沼市立鹿折中学校', en: 'Shishiori Junior High School', sign: '鹿折中学校' },
  schShishioriE: { ja: '気仙沼市立鹿折小学校', en: 'Shishiori Elementary School', sign: '鹿折小学校' },
  schJonanJ: { ja: '気仙沼市立条南中学校', en: 'Jonan Junior High School', sign: '条南中学校' },
  schToryoH: { ja: '東陵高等学校', en: 'Toryo High School', sign: '東陵高等学校' },
};

/**
 * Heights, storeys and colours per building (hex from the ortho median with its cyan cast removed, or read off the
 * reference photos; docs/anime/landmarks/*.md). Ground = the DEM under the footprint unless `floor` is given.
 */
export const SPEC = {
  // 八日町 city hall campus (city-hall.md; Commons "Kesennuma City Hall 01.JPG": 3 storeys of beige-grey render,
  // green-tinted glass, a rooftop penthouse and two lattice radio masts)
  cityHall: { storeys: 3, fh: 3.7, wall: '#cdc9bf', roof: '#c2c4c0', src: 'OSM building:levels=3; core DEM 8.4–11.6 under the outline (the sheet\'s T.P. 10.6 is the uphill side); photo' },
  cityHall2: { storeys: 2, fh: 3.3, wall: '#5e5448', roof: '#7d8a8e', src: 'OSM start_date 1909 (former wooden school); photo: dark weathered siding, grey gable roof' },
  cityHall3: { storeys: 2, fh: 3.4, wall: '#d4d0c6', roof: '#8a9796', src: 'OSM start_date 1974; ortho' },
  cityHallE: { storeys: 2, fh: 3.3, wall: '#d8d2c4', roof: '#b7a8a0', src: 'OSM start_date 1960; ortho' },
  cityHallE2: { storeys: 2, fh: 3.3, wall: '#d8d2c4', roof: '#c9ccc9', src: 'OSM start_date 1960; ortho' },
  oneTen: { storeys: 4, fh: 3.2, base: '#b8959c', band: '#3f8f94', deck: '#bdbdb8', src: 'OSM building:levels=4, start_date 1999; photo: mauve base, teal band, parking deck, One-Ten logo tower' },
  // JR/BRT 気仙沼駅 (kesennuma-station.md; Commons "JR East Kesennuma Station building"): one storey, 5-arch arcade in
  // off-white stone tile, dark standing-seam roof with the swordfish mural on the square-side slope, centre gable
  station: { h: 4.6, wall: '#e2ddd3', trim: '#cfc9bd', roof: '#4f5763', src: 'OSM building=train_station; ja.wikipedia 気仙沼駅; photo' },
  stationPlaza: { storeys: 2, fh: 4.2, wall: '#e6e4de', roof: '#dcdcd6', src: 'OSM building=public; ortho white roof; storeys not verified (2 kept low)' },
  // リアス・アーク美術館 (rias-ark.md; Commons "Riasu ark museum.jpg"): ribbed aluminium panels, pink pods on stilts
  riasArk: { h: 13.5, alu: '#b9bdc2', pink: '#e3a7a3', pinkDark: '#b98580', render: '#c9a4a2', roof: '#cfd2d2', src: '石山修武 1994, 3 levels + roof garden, 4,601 m²' },
  // 気仙沼市立病院 (hospitals.md): SRC, seismic isolation, 7F legal / 6 storeys built + B1, 8,174 m² footprint, heliport
  cityHospital: { podium: 3, wards: 6, fh: 4.1, wall: '#eeefec', band: '#9fb3c4', roof: '#c7c9c6', src: 'kesennuma-hospital.jp summary; OSM way 761241989; ortho (ward bar on the NE side)' },
  otomo: { storeys: 5, fh: 3.3, wall: '#ece9e1', roof: '#8fc4b0', wing: '#8a5a4c', src: 'OSM building:levels=5; ortho mint-green flat roofs + red-brown pitched wing' },
  // shrines, temples, church (shrines-temples.md)
  // [v4:polish3] h = the nave ridge (5.4 m eaves + the 0.85-pitch gable over the 11 m nave, landmarks/temples.js); the
  // belfry's cross stands at 14.7 m. No published height (orthodoxjapan.jp: rebuilt 1933); the lot's 3.3 m (one storey,
  // no roof) was the default of tagOfSiteB
  church: { wall: '#f2f1ec', roof: '#5f9c86', h: 10.1, src: 'OSM building=church; Commons 気仙沼魚町と安波山: white church, green roof, small spire' },
  shorinji: { wall: '#efece4', roof: '#3f4448', wood: '#5a4636', src: 'OSM way 820921817; ortho dark grey tile' },
  seigoji: { wall: '#efece4', roof: '#50565c', wood: '#5a4636', src: 'OSM way 928776172; ortho light grey metal → dark grey kawara look' },
};

/**
 * 新庁舎 under construction on the old city-hospital site, 田中 (city-hall.md; 実施設計説明書 2024-09): S structure,
 * B1 + 4F, 24.75 m, building area 3,343.56 m², the 2–4F office box 45.35 × 54.55 m (plan grids X1–X7, Y1–Y10), a glazed
 * B1/1F base with timber under the curved "fluttering flag" roof, 1FL = T.P. 9.45; completion October 2027. The box
 * stands in the site's SE corner, its east face parallel to the site's east edge (OSM 819508282) with the まちかど
 * テラス slope between; X = local east, Z = local south of the plan.
 */
export const NEW_CITY_HALL = {
  corner: [-812.5, 1311.5], X: [0.906, -0.423], Z: [0.423, 0.906],
  box: { x0: -15, z0: -24, w: 45.35, d: 54.55 }, podium: { grow: 2, south: 4 },
  fl1: 9.45, height: 24.75, floors: 4, fh: 4.4, progress: 'steel frame and scaffold (Sept 2026)',
};

/**
 * 亀山 (oshima-kameyama.md; 亀山通信 3/5/7): the monorail (2 cars × 20 seats, fully glazed, 409 m, 6–7 min) from the
 * 亀山駐車場 at mid-slope (T.P. ≈ 120) to the summit station (T.P. ≈ 224); the summit terraces with outdoor sofas
 * (terrace 1: 49 sofas, 2: day beds, 3: sofas), the café + toilet building (timber, 21 m² café), the two rest houses
 * kept from before (第1: the fan-shaped hall, 第2: the teal-roofed block), 亀山ほしのてらす. Positions: the city's
 * 概要図 (R7.10.10) registered on 愛宕神社 and 大嶋神社 (OSM), checked on the GSI photo z18 and the DEM.
 */
export const KAMEYAMA = {
  summit: [3735.4, 3625.3], ele: 235,
  rail: [[3974, 3925], [3853, 3798], [3743, 3651]],   // the 概要図's dashed line: 駐車場駅 (px 300,378), bend (195,262), 山頂駅 (100,135) at 1.155 m/px
  lowerStation: { at: [3976, 3930], len: 16, wid: 9 },
  upperStation: { at: [3736, 3642], len: 13, wid: 8 },
  parking: { poly: [[3952, 3842], [4018, 3842], [4018, 3912], [3990, 3912], [3952, 3896]] },   // the ortho's paved lot + the 2025 extension (駐車場拡張) toward the station
  terraces: [
    { id: 't1', at: [3721, 3619], w: 24, d: 16, steps: 3, face: [-0.72, -0.69], sofas: 49 },
    { id: 't2', at: [3700, 3624], w: 9, d: 7, steps: 1, face: [-0.9, 0.4], sofas: 2 },
    { id: 't3', at: [3781, 3690], w: 8, d: 6, steps: 1, face: [0.6, 0.8], sofas: 3 },
    { id: 'hoshi', at: [3858, 3640], w: 10, d: 7, steps: 1, face: [0.2, -1], sofas: 0 },
  ],
  cafe: { at: [3712, 3607], w: 8, d: 5.5 },
  restHouse1: { at: [3671, 3665], r: 12.5, face: [-1, 0] },   // fan-shaped hall, curved side to the west (ortho z18)
  restHouse2: { poly: [[3694, 3656], [3712, 3656], [3712, 3670], [3694, 3670]], roof: '#57a39a' },
  lotCentres: [[3669, 3662], [3704, 3659], [3690, 3648], [3726, 3628]],
};

/**
 * 浦の浜 (oshima-ferry-pier.md): the 気仙沼大島ウェルカム・ターミナル (timber, one storey, 468.29 m², terrace over the
 * bay; city page) on the reclaimed land behind the quay, and the floating pier of the 気仙沼ベイクルーズ on a short
 * gangway at the south quay (both read off GSI seamlessphoto z18 at 2.05 px/m).
 */
export const URANOHAMA = {
  terminal: { poly: [[3378, 4503], [3400, 4503], [3400, 4530], [3378, 4530]] },
  pontoon: { poly: [[3249, 4542.5], [3280.5, 4542.5], [3280.5, 4552], [3249, 4552]], gang: [[3280.5, 4547.5], [3291, 4547.5]] },
  fingerPier: { a: [3182, 4488], b: [3204, 4452], w: 3.5 },
};

/** All building sites that replace GSI lots (the order decides overlaps: the first match wins). */
const LOT_SITES = ['cityHall', 'cityHall2', 'cityHall3', 'cityHallE', 'cityHallE2', 'oneTen', 'station', 'stationRoof2', 'brtCanopy', 'stationPlaza', 'riasArk', 'cityHospital', 'otomo', 'church', 'shorinji', 'seigoji', 'minamiShrine', 'matsuo', 'ikkeijima'];
const GROW = { riasArk: 4, station: 1.5, cityHospital: 2 };
/** OSM buildings inside a school ground that are not school buildings (気仙沼市図書館, OSM 768699248). */
const NOT_SCHOOL = new Set([768699248]);

/** [v4:integrate] the share of polygon `poly` (sampled on a 1 m grid) inside any of `parts` */
export function overlapShare(poly, parts) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const step = Math.max(1, Math.sqrt((x1 - x0) * (z1 - z0) / 4000));
  let n = 0, k = 0;
  for (let x = x0 + step / 2; x < x1; x += step) for (let z = z0 + step / 2; z < z1; z += step) {
    if (!inPoly(x, z, poly)) continue;
    n++; if (parts.some((p) => inPoly(x, z, p))) k++;
  }
  return n ? k / n : 0;
}

export function inPoly(x, z, poly) {
  let c = false;
  for (let i = 0, k = poly.length - 1; i < poly.length; k = i++) {
    const [xi, zi] = poly[i], [xk, zk] = poly[k];
    if ((zi > z) !== (zk > z) && x < (xk - xi) * (z - zi) / (zk - zi) + xi) c = !c;
  }
  return c;
}
function nearPoly(x, z, poly, g) {
  if (inPoly(x, z, poly)) return true;
  if (!g) return false;
  for (let i = 0, k = poly.length - 1; i < poly.length; k = i++) {
    const [ax, az] = poly[k], [bx, bz] = poly[i], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    if (Math.hypot(ax + dx * t - x, az + dz * t - z) < g) return true;
  }
  return false;
}

/**
 * The landmarks-B site a GSI lot belongs to, or null: by its OSM match (lot.osm), else its centroid (area in m²).
 * Returns ids like 'cityHall', 'school:schKesennumaE', 'newCityHallSite', 'oshimaTerminal', 'kameyama'.
 */
export function siteOfLotB(osm, cx, cz, area = 100, poly = null) {
  const id = osm ? Number(String(osm).replace(/^w/, '')) : null;
  for (const s of LOT_SITES) if (id && OSM[s].osm === id) return s;
  for (const s of LOT_SITES) if (nearPoly(cx, cz, OSM[s].poly, GROW[s] || 0)) return s;
  // the island platform / its canopy: any lot there is the old overlapping station geometry
  if (inPoly(cx, cz, OSM.islandPlatform.poly) || inPoly(cx, cz, OSM.platformCanopy.poly)) return 'station';
  // [v4:integrate] a footprint lying mostly over the station, its island platform and canopy (GSI traces the station and
  // its platform roof as one 83 x 28 m building, named NewDays after the kiosk in the layout): the station's too
  if (poly && poly.length > 2 && overlapShare(poly, [OSM.station.poly, OSM.islandPlatform.poly, OSM.platformCanopy.poly]) >= 0.3) return 'station';
  // the old 市立病院 blocks, demolished 2022–24: the new city hall site
  if (inPoly(cx, cz, OSM.newCityHallSite.poly)) return 'newCityHallSite';
  if (area >= 40 && !NOT_SCHOOL.has(id)) for (const [k, s] of Object.entries(SCHOOLS)) if (inPoly(cx, cz, s.poly)) return 'school:' + k;
  if (inPoly(cx, cz, URANOHAMA.terminal.poly)) return 'oshimaTerminal';
  for (const [x, z] of KAMEYAMA.lotCentres) if (Math.hypot(cx - x, cz - z) < 4) return 'kameyama';
  return null;
}

/** Storeys / height / roof tag written into the layout for a tagged lot (the lot keeps its real footprint). */
export function tagOfSiteB(site) {
  const sp = SPEC[site] || {};
  if (site.startsWith('school:')) return { roof: 'flat' };   // storeys and the measured roof colour stay the lot's own
  if (site === 'newCityHallSite') return { storeys: 4, height: 24.75, roof: 'flat', roofColor: '#c9b690' };
  if (site === 'oshimaTerminal') return { storeys: 1, height: 6.5, roof: 'gable', roofColor: '#6d737a' };
  if (site === 'kameyama') return { storeys: 1, height: 5, roof: 'flat', roofColor: '#57a39a' };
  const st = sp.storeys || sp.wards || 1, h = sp.h || st * (sp.fh || 3.3);
  return { storeys: st, height: Math.round(h * 10) / 10, roof: site === 'cityHall2' ? 'gable' : 'flat', roofColor: sp.roof || '#c9ccc9' };
}

/** Real places this module adds for search, labels and the tour (ja, en, the camera spot). */
export const PLACES_B = [
  { id: 'cityHall', ja: '気仙沼市役所', en: 'Kesennuma City Hall', at: [-430, -238] },
  { id: 'oneTen', ja: 'ワン・テン庁舎', en: 'City Hall One-Ten Building', at: [-397, -190] },
  { id: 'newCityHall', ja: '気仙沼市 新庁舎（建設中）', en: 'New City Hall (under construction)', at: [-862, 1277] },
  // [v4:polish2] walk: on the station square, framing the arcade front (the computed spot sat in a back alley)
  { id: 'station', ja: '気仙沼駅', en: 'Kesennuma Station (JR / BRT)', at: [-1376, -419], walk: { x: -1392.6, z: -395.0, yaw: -38.9, pitch: 4, dist: 29 } },
  { id: 'riasArk', ja: 'リアス・アーク美術館', en: 'Rias Ark Museum of Art', at: [-2176, 2771] },
  { id: 'cityHospital', ja: '気仙沼市立病院', en: 'Kesennuma City Hospital', at: [-778, 2052] },
  { id: 'otomo', ja: '大友病院', en: 'Otomo Hospital', at: [-686, 8] },
  { id: 'church', ja: '気仙沼ハリストス正教会', en: 'Kesennuma Orthodox Church', at: [-487, -32] },
  { id: 'shorinji', ja: '少林寺', en: 'Shorin-ji Temple', at: [-610, 66] },
  { id: 'seigoji', ja: '清護寺', en: 'Seigo-ji Temple', at: [-303, 146] },
  { id: 'ikkeijima', ja: '一景島神社', en: 'Ikkeijima Shrine', at: [560, 1095] },
  { id: 'schKesennumaE', ja: '気仙沼小学校', en: 'Kesennuma Elementary School', at: [-300, 360] },
  { id: 'schKesennumaJ', ja: '気仙沼中学校', en: 'Kesennuma Junior High School', at: [-300, 560] },
  { id: 'schKesennumaH', ja: '気仙沼高等学校', en: 'Kesennuma High School', at: [-1358, 1168] },
  // [v4:polish2] the walk spot is on terrace 1, past the sofa table, looking out the way the sofas face (the bay view);
  // the old spot behind the table was ~70 % deck planks and table top
  { id: 'kameyama', ja: '亀山テラス360°', en: 'Kameyama Terrace 360°', at: [3721, 3619], walk: { x: 3723.9, z: 3621.7, yaw: 46.2, pitch: 1, dist: 4 } },
  { id: 'kameyamaMonorail', ja: '亀山モノレール 駐車場駅', en: 'Kameyama Monorail (lower station)', at: [3976, 3930] },
  { id: 'oshimaTerminal', ja: '気仙沼大島ウェルカム・ターミナル', en: 'Oshima Welcome Terminal', at: [3389, 4516] },
];
