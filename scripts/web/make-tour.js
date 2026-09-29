// Writes data/tour.json: the seven tour stops (BUILD-SPEC §7) in the landmarks schema of §3.
//   env -u NODE_OPTIONS bun run scripts/web/make-tour.js
// Cameras are placed from the stop's lat/lon: look target on the ground, camera `back` metres opposite the view
// bearing and `alt` metres up. Coordinates are ±150 m until checked against core.jpg (P5 locks them).
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { llToEnu } from "../../src/core/geo.js";

const r2 = (v) => Math.round(v * 10) / 10;
function cam({ lat, lon, alt, back, bearing, lookY = 0, lookAt, pos }) {
  const t = lookAt ? llToEnu(...lookAt) : llToEnu(lat, lon);
  const b = (bearing * Math.PI) / 180, dx = Math.sin(b), dz = -Math.cos(b);    // bearing clockwise from north; z is south
  const p = pos ? llToEnu(pos[0], pos[1]) : { x: t.x - dx * back, z: t.z - dz * back };
  return { pos: [r2(p.x), r2(pos ? pos[2] : alt), r2(p.z)], look: [r2(t.x), lookY, r2(t.z)] };
}

const stops = [
  { id: "bay", ja: "内湾", en: "The inner bay", lat: 38.905, lon: 141.575, splat: null,
    cam: cam({ lat: 38.9045, lon: 141.5795, alt: 120, back: 520, bearing: 45 }),
    blurb: { ja: "港町の中心、気仙沼の内湾。震災後に再建された岸壁と街並みが、静かな水面を囲みます。",
             en: "The heart of the port town. Rebuilt quays and streets wrap around the calm water of the inner bay." } },
  { id: "market", ja: "気仙沼市魚市場", en: "Kesennuma Fish Market", lat: 38.912, lon: 141.577, splat: null,
    cam: cam({ lat: 38.912, lon: 141.5775, alt: 80, back: 420, bearing: 345, lookY: 4 }),
    blurb: { ja: "生鮮カツオの水揚げで全国有数の魚市場。早朝の岸壁には漁船が次々と入港します。",
             en: "One of Japan's leading ports for fresh bonito. Boats land their catch along this quay from dawn." } },
  { id: "pier7", ja: "第7岸壁（撮影地点）", en: "Pier 7 (capture spot)", lat: 38.9052, lon: 141.5754, splat: "pier7",
    cam: cam({ lookAt: [38.9055, 141.577], pos: [38.9052, 141.5754, 4.1], lookY: 2 }),
    blurb: { ja: "このプロジェクトの撮影地点。近くの建物に展示された内湾の模型を、2026年9月29日に撮影しました。",
             en: "Where this project's captures were made: the scale model of the inner bay on display nearby, photographed on 29 Sep 2026." } },
  { id: "kanae", ja: "気仙沼湾横断橋（かなえ大橋）", en: "Kesennuma Bay Crossing Bridge (Kanae Ohashi)", lat: 38.917, lon: 141.590, splat: null,
    cam: cam({ lat: 38.917, lon: 141.590, alt: 60, back: 700, bearing: 40, lookY: 20 }),
    blurb: { ja: "2021年に開通した、気仙沼湾をまたぐ斜張橋。夜は橋の輪郭が灯りで浮かび上がります。",
             en: "The cable-stayed bridge across Kesennuma Bay, opened in 2021. At night its outline glows over the water." } },
  { id: "oshima", ja: "気仙沼大島大橋", en: "Kesennuma Oshima Bridge", lat: 38.879, lon: 141.603, splat: null,
    cam: cam({ lat: 38.879, lon: 141.603, alt: 150, back: 900, bearing: 100, lookY: 10 }),
    blurb: { ja: "2019年に開通し、大島と本土を初めて道路で結んだアーチ橋。背後に大島の森が広がります。",
             en: "Opened in 2019, this arch bridge linked Oshima island to the mainland by road for the first time." } },
  { id: "anba", ja: "安波山展望", en: "Anbasan lookout", lat: 38.918, lon: 141.566, splat: null,
    cam: cam({ lookAt: [38.905, 141.578], pos: [38.918, 141.566, 247], lookY: 0 }),
    blurb: { ja: "標高239m。「安らかな波」を願って名付けられた山から、港と街を一望します。",
             en: "239 m high, named for the wish for calm waves. The whole harbour and town lie below." } },
  { id: "karakuwa", ja: "唐桑半島", en: "Karakuwa Peninsula", lat: 38.87, lon: 141.655, splat: null,
    cam: cam({ lookAt: [38.892, 141.61], pos: [38.852, 141.672, 900], lookY: 0 }),
    blurb: { ja: "リアス海岸の岬が続く唐桑半島。上空から、湾と街の全体が見渡せます。",
             en: "The rugged ria coast of the Karakuwa Peninsula. From above, the whole bay and city open up behind." } },
];

const out = resolve(import.meta.dir, "../../data/tour.json");
writeFileSync(out, JSON.stringify({ version: 1, note: "Coordinates ±150 m; verify against data/ortho/core.jpg before locking.", stops }, null, 1));
console.log("wrote", out, stops.length, "stops");
