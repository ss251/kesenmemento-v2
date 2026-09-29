// Tour-stop landmarks -> data/landmarks.json (BUILD-SPEC §3 schema, §7 stops).
// Coordinates were verified on 2026-09-29 against OpenStreetMap (Overpass) and GSI 地名検索
// (msearch.gsi.go.jp) and cross-checked against data/ortho/core.jpg; see `verified` per stop.
// Camera positions are ENU metres; y values are computed from data/terrain so they sit at the
// stated height above ground/water. `bun run scripts/landmarks/build.js`
import { join } from "node:path";
import { llToEnu, sampleGrid } from "../../src/core/geo.js";
import { ROOT } from "../terrain/tiles.js";

const r1 = (v) => Math.round(v * 10) / 10;
const DEG = Math.PI / 180;
/** ENU offset for a compass bearing (deg, 0 = north, 90 = east) and distance (m). z is south. */
const toward = (p, bearing, dist) => [p[0] + Math.sin(bearing * DEG) * dist, p[2] - Math.cos(bearing * DEG) * dist];

export const STOPS = [
  {
    id: "bay", ja: "内湾", en: "Inner Bay",
    lat: 38.9063, lon: 141.5768,
    verified: "Inner-bay water centre read from data/ortho/core.jpg and data/terrain/core.f32 (h = 0); spec gave 38.905, 141.575 (the quay edge, 150 m SW).",
    cam: { from: { bearing: 225, dist: 260, height: 120 }, look: { bearing: 45, dist: 250, height: 0 } },
    splat: null,
    blurb: {
      ja: "気仙沼の街の始まりの場所。港町の暮らしは、この穏やかな内湾に面して広がってきました。",
      en: "Where Kesennuma began: the port town grew up around this calm inner bay.",
    },
  },
  {
    id: "market", ja: "気仙沼市魚市場", en: "Kesennuma Fish Market",
    lat: 38.899, lon: 141.58187,
    verified: "OSM way 気仙沼魚市場 (amenity=marketplace, building) centre 38.89900, 141.58187 — the quay-side market shed, checked on data/ortho/core.jpg; the OSM 'Kesennuma City Fish Market' way (38.90017, 141.58033) is the landside building 150 m NW; GSI 地名検索 魚市場前 38.8992, 141.5802. Spec gave 38.912, 141.577 (1.4 km north, in Shishiori) — corrected.",
    cam: { from: { bearing: 340, dist: 260, height: 80 }, look: { bearing: 160, dist: 180, height: 4 } },
    splat: null,
    blurb: {
      ja: "生鮮カツオの水揚げで長年日本一を続ける魚市場。岸壁に沿って長い上屋が続きます。",
      en: "The fish market that has led Japan in fresh bonito landings for years, its sheds lining the quay.",
    },
  },
  {
    id: "pier7", ja: "第7岸壁（撮影地点）", en: "Pier 7 (capture spot)",
    lat: 38.9052, lon: 141.5754,
    verified: "Photo EXIF GPS of the 2026-09-29 captures (ADDENDUM-model); 30 m from OSM 南町海岸商業施設「迎」 (38.90577, 141.57475).",
    cam: { from: { bearing: 260, dist: 0, height: 1.6 }, look: { bearing: 80, dist: 60, height: 1.0 } },
    splat: "model", // P3 output data/splats/model.rad (the inner-bay scale model, ADDENDUM-model)
    blurb: {
      ja: "ここで撮影したのは、ガラスの下に広がる内湾の街の模型。その模型が、実物大の街への入口になります。",
      en: "Captured here: a scale model of the inner-bay district under glass. The model is the doorway into the full-size city.",
    },
  },
  {
    id: "kanae", ja: "気仙沼湾横断橋（かなえ大橋）", en: "Kesennuma Bay Crossing Bridge (Kanae Ohashi)",
    lat: 38.8928, lon: 141.5922,
    verified: "Main span over the water, read from data/ortho/core.jpg and the DEM water run along the bridge (mid 38.89267, 141.59239). OSM way 気仙沼湾横断橋 (man_made=bridge) centre 38.88954, 141.59005 lies on the SW land approach; GSI 地名検索 38.8933, 141.5932. Spec gave 38.917, 141.590 (2.7 km north, on land) — corrected.",
    cam: { from: { bearing: 300, dist: 520, height: 60 }, look: { bearing: 0, dist: 0, height: 20 } },
    splat: null,
    blurb: {
      ja: "三陸沿岸道路の斜張橋。湾の入口をまたぎ、夜は街の新しい目印になります。",
      en: "The cable-stayed bridge of the Sanriku coastal expressway, striding across the mouth of the bay.",
    },
  },
  {
    id: "oshima", ja: "気仙沼大島大橋", en: "Kesennuma Oshima Bridge",
    lat: 38.87875, lon: 141.60625,
    verified: "OSM way 気仙沼大島大橋 / Kesennuma Oshima Ohashi Bridge centre 38.87875, 141.60625; GSI 地名検索 38.8802, 141.6075 (N abutment).",
    cam: { from: { bearing: 335, dist: 700, height: 150 }, look: { bearing: 155, dist: 300, height: 10 } },
    splat: null,
    blurb: {
      ja: "本土と大島を結ぶアーチ橋。2019年の開通で、島は初めて陸続きになりました。",
      en: "The arch bridge that joined Oshima island to the mainland when it opened in 2019.",
    },
  },
  {
    id: "anba", ja: "安波山展望", en: "Mt. Anba lookout",
    lat: 38.91492, lon: 141.56931,
    verified: "OSM node 安波山 (natural=peak, ele 238) 38.91492, 141.56931; GSI 地名検索 安波山 38.91496, 141.56914; DEM 238.4 m. Observation deck (OSM 安波山展望台) 38.91223, 141.56909. Spec gave 38.918, 141.566 (450 m NW) — corrected.",
    cam: { from: { bearing: 0, dist: 0, height: 12 }, look: { lat: 38.9063, lon: 141.5768, height: 0 } },
    splat: null,
    blurb: {
      ja: "標高239 mの安波山から、港と内湾、大島までを見渡します。",
      en: "From 239 m Mt. Anba the whole harbour opens up, out to Oshima.",
    },
  },
  {
    id: "karakuwa", ja: "唐桑半島", en: "Karakuwa Peninsula",
    lat: 38.87646, lon: 141.65898,
    verified: "OSM node 唐桑半島 / Karakuwa Peninsula (natural=peninsula) 38.87646, 141.65898; spec 38.87, 141.655 (0.8 km).",
    cam: { from: { bearing: 110, dist: 1500, height: 900 }, look: { lat: 38.906, lon: 141.575, height: 0 } },
    splat: null,
    blurb: {
      ja: "リアス海岸の唐桑半島。上空から、湾と街の全体が見えてきます。",
      en: "The ria coast of the Karakuwa peninsula, with the whole bay and city beyond.",
    },
  },
];

async function loadGrid(name) {
  const meta = await Bun.file(join(ROOT, `data/terrain/${name}.json`)).json();
  const h = new Float32Array(await Bun.file(join(ROOT, `data/terrain/${name}.f32`)).arrayBuffer());
  return { meta, h };
}

export async function buildLandmarks() {
  const core = await loadGrid("core"), city = await loadGrid("city");
  const ground = (x, z) => {
    let h = sampleGrid(core.h, core.meta, x, z);
    if (Number.isNaN(h)) h = sampleGrid(city.h, city.meta, x, z);
    return Number.isNaN(h) ? 0 : Math.max(0, h);
  };
  const out = STOPS.map((s) => {
    const p = llToEnu(s.lat, s.lon);
    const [fx, fz] = toward(p, s.cam.from.bearing, s.cam.from.dist);
    // heights are above local ground (sea = 0), matching the §7 camera table
    const pos = [fx, ground(fx, fz) + s.cam.from.height, fz];
    let look;
    if (s.cam.look.lat !== undefined) {
      const q = llToEnu(s.cam.look.lat, s.cam.look.lon);
      look = [q.x, ground(q.x, q.z) + s.cam.look.height, q.z];
    } else {
      const [lx, lz] = toward(p, s.cam.look.bearing, s.cam.look.dist);
      look = [lx, ground(lx, lz) + s.cam.look.height, lz];
    }
    if (pos[1] < ground(pos[0], pos[2]) + 1.5) pos[1] = ground(pos[0], pos[2]) + 1.5;
    return {
      id: s.id, ja: s.ja, en: s.en, lat: s.lat, lon: s.lon,
      enu: [r1(p.x), r1(ground(p.x, p.z)), r1(p.z)],
      cam: { pos: pos.map(r1), look: look.map(r1) },
      splat: s.splat, blurb: s.blurb, verified: s.verified,
    };
  });
  // Top level is the array of stops (BUILD-SPEC §3 schema per element). Extra per-stop fields:
  // enu (ENU of lat/lon, y = ground), verified (coordinate provenance). cam.* are ENU metres.
  await Bun.write(join(ROOT, "data/landmarks.json"), JSON.stringify(out, null, 1));
  return out;
}

if (import.meta.main) {
  const d = await buildLandmarks();
  for (const s of d) console.log(s.id.padEnd(9), s.lat, s.lon, "enu", s.enu.join(","), "cam", s.cam.pos.join(","), "->", s.cam.look.join(","));
}
