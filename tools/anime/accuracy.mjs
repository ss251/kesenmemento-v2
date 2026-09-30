// [v4:town-accuracy] Automated accuracy audit (V3-SPEC section 10): the app, rendered straight down with an orthographic
// camera, against the real town.
//
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/accuracy.mjs --port 8824 [--region core|ortho]
//        [--res 0.5] [--tile 500] [--out dist/qa4] [--nobuild] [--tag before] [--tiles "x,z;x,z"]
//
// Two page loads of the production bundle (headless Chrome through the machine gate, 1000 x 1000 px, real GPU):
//   1. the full scene at 12:00 JST, clear sky, no vignette / light leak / fog: one orthographic colour tile per 500 m
//      (north up, 0.5 m per pixel), saved next to the aerial photo;
//   2. `?only=town,harbor,landmarks,explore`: a float height pass (world y of the highest surface per pixel, foliage excluded) and a road
//      pass (materials tagged `userData.acc = 'road'`). A pixel is "building" when the rendered surface stands more than
//      2.2 m above the terrain (cars, walls and hedges stay below; poles are sub-pixel).
// Truth: the GSI building footprints (基盤地図情報 / optimal_bvmap BldA, traced on aerial photos: data/buildings/city.json),
// the GSI seamless aerial photo (data/ortho/core.jpg, 0.53 m/px, with the per-roof relief offset measured by
// scripts/anime/enrich/aerial.js), OpenStreetMap highways (raw/osm, © OpenStreetMap contributors, ODbL) and the landmark
// reference sheets (docs/anime/landmarks/landmarks.json).
// Metrics (dist/qa4/accuracy.json):
//   buildings.iou        rendered building cover vs the footprints, land pixels inside the region (core: the mid-zone
//                        disc, 1.1 km round (250, 150), which holds the hero and mid zones)
//   roofs.dE             CIEDE2000 between the photo's roof colour and the rendered roof colour per footprint (median of
//                        the eroded footprint; raw and with the photo's global colour cast removed); roofs.albedo the
//                        same against the colour the layout assigns (no lighting)
//   roads.recall / iou   OSM centre-line pixels covered by rendered asphalt; rendered asphalt vs OSM ways buffered by
//                        their width (width tag, lanes x 3 m, else the class default)
//   landmarks            the app's position of each reference landmark and the error in metres
//   heights              rendered roof height vs OSM height / building:levels, the landmark sheets and lotfix.js [v4:polish1]
// Side-by-side images: dist/qa4/side_<tile>.jpg (photo | render | coverage diff: grey both, red missed, blue extra) and
// dist/qa4/mosaic_{photo,render,diff}.jpg over the whole region at 2 m/px.
import { join, resolve } from 'node:path';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import sharp from 'sharp';
import { build, serve, launch, ROOT } from './cdp.mjs';
import { fillRing, stampLine, lab, dE2000 } from './accuracy-lib.mjs';

const args = {};
for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) { const k = a.slice(2); const v = process.argv[i + 1] !== undefined && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : '1'; args[k] = v; } }
const port = Number(args.port || 8824);
if ([8787, 8790, 8791].includes(port)) throw new Error('port reserved');
const RES = Number(args.res || 0.5), TILE = Number(args.tile || 500), PX = Math.round(TILE / RES);
if (PX > 1080) throw new Error('tile over 1080 px (machine rule): lower --tile or raise --res');
const OUT = resolve(ROOT, args.out || 'dist/qa4');
const TAG = args.tag ? '_' + args.tag : '';
const BUILD_T = 2.2;   // m above terrain = building
mkdirSync(OUT, { recursive: true });

// ------------------------------------------------------------------ region + tiles
export const REGIONS = {
  core: { kind: 'disc', cx: 250, cz: 150, r: 1100, note: 'the mid-zone disc (hero + mid lots): the walkable full-detail town' },
  ortho: { kind: 'box', x0: -1700, x1: 2550, z0: -2050, z1: 2200, note: 'the whole data/ortho/core.jpg footprint' },
};
const region = REGIONS[args.region || 'core'];
const inRegion = (x, z) => (region.kind === 'disc' ? Math.hypot(x - region.cx, z - region.cz) <= region.r : x >= region.x0 && x <= region.x1 && z >= region.z0 && z <= region.z1);
const bb = region.kind === 'disc' ? { x0: region.cx - region.r, x1: region.cx + region.r, z0: region.cz - region.r, z1: region.cz + region.r } : region;
let tiles = [];
if (args.tiles) tiles = args.tiles.split(';').map((s) => s.split(',').map(Number)).map(([x, z]) => ({ cx: x, cz: z }));
else for (let z = bb.z0; z < bb.z1; z += TILE) for (let x = bb.x0; x < bb.x1; x += TILE) {
  const cx = x + TILE / 2, cz = z + TILE / 2;
  // keep tiles that touch the region
  const nx = Math.max(x, Math.min(region.cx ?? cx, x + TILE)), nz = Math.max(z, Math.min(region.cz ?? cz, z + TILE));
  if (region.kind === 'disc' && Math.hypot(nx - region.cx, nz - region.cz) > region.r) continue;
  tiles.push({ cx, cz });
}
tiles = tiles.map((t, i) => ({ ...t, id: `t${i}_${Math.round(t.cx)}_${Math.round(t.cz)}`, x0: t.cx - TILE / 2, z0: t.cz - TILE / 2 }));

// ------------------------------------------------------------------ page-side code (runs in the app)
const PAGE = String.raw`(() => {
  const THREE = window.THREE, ctx = window.__ctx, L = window.__L;
  const scene = ctx.scene;
  const acc = window.__acc = {};
  const cam = (cx, cz, size) => { const c = new THREE.OrthographicCamera(-size / 2, size / 2, size / 2, -size / 2, 10, 4000); c.position.set(cx, 1500, cz); c.up.set(0, 0, -1); c.lookAt(cx, 0, cz); c.updateMatrixWorld(); c.userData.noSkyFrame = true; return c; };
  // [v4:polish2] explore's StreamBatch culls slots outside the MAIN camera's view once a frame; the orthographic audit
  // camera looks elsewhere, so show every slot for the audit render and restore the main-camera cull afterwards
  const uncull = () => window.__explore?.stream?.sb?.cull(null);
  const recull = () => window.__explore?.stream?.sb?.cull(ctx.camera);
  acc.color = (cx, cz, size) => {
    uncull();
    const c = cam(cx, cz, size), P = ctx.pipeline, U = P.compMat.uniforms;
    const keep = { v: U.uVignette.value, l: U.uLeakK.value, fog: scene.fog && scene.fog.density };
    U.uVignette.value = 0; U.uLeakK.value = 0;
    P.setView(1500); ctx.sky.setView(430);
    if (scene.fog) scene.fog.density = 1e-7;
    ctx.sky.update(ctx.time || 0, c);
    const ld = ctx.shared.uSunDir.value, sun = ctx.sky.sun;
    sun.target.position.set(cx, L.heightAt(cx, cz), cz); sun.position.copy(sun.target.position).addScaledVector(ld, 2050); sun.target.updateMatrixWorld();
    P.render(scene, c, ctx.sunDir, ctx.time || 0);
    const url = ctx.renderer.domElement.toDataURL('image/png');
    U.uVignette.value = keep.v; U.uLeakK.value = keep.l; if (scene.fog) scene.fog.density = keep.fog;
    recull();
    return url;
  };
  // [v4:integrate] BatchedMesh too (explore streams the mid-zone town into BatchedMesh pools)
  const vs = 'varying float vY;\n#include <common>\n#include <batching_pars_vertex>\nvoid main(){\n#include <batching_vertex>\n#include <begin_vertex>\nvec4 wp = vec4(transformed, 1.0);\n#ifdef USE_BATCHING\nwp = batchingMatrix * wp;\n#endif\n#ifdef USE_INSTANCING\nwp = instanceMatrix * wp;\n#endif\nwp = modelMatrix * wp; vY = wp.y; gl_Position = projectionMatrix * viewMatrix * wp; }';
  const fs = 'varying float vY; void main(){ gl_FragColor = vec4(vY, 1.0, 0.0, 1.0); }';
  const hm = new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, side: THREE.DoubleSide });
  let rt = null;
  const isFoliage = (m) => !!(m && (m.userData?.foliage || m.userData?.acc === 'veg' || /foliage|tree|leaf/i.test(m.name || '')));
  /** -> { h: base64 Uint8 (0.25 m above terrain, 255 = 63.75 m+), road: base64 Uint8 (1 = asphalt on top) } */
  acc.mask = (cx, cz, size, px) => {
    uncull();
    if (!rt || rt.width !== px) { rt?.dispose(); rt = new THREE.WebGLRenderTarget(px, px, { type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: true, samples: 0 }); }
    const c = cam(cx, cz, size), r = ctx.renderer;
    const saved = [];
    const meshes = [];
    for (const root of [ctx.staticRoot, ctx.dynamicRoot]) root.traverse((o) => { if (o.isMesh) meshes.push(o); });
    const pass = (want) => {
      for (const o of meshes) { saved.push([o, o.material, o.visible]); const m = Array.isArray(o.material) ? o.material[0] : o.material; o.visible = o.visible && want(m, o); o.material = hm; }
      const bg = scene.background, fog = scene.fog, sky = ctx.sky.mesh.visible, ov = scene.overrideMaterial;
      scene.background = null; scene.fog = null; ctx.sky.mesh.visible = false; scene.overrideMaterial = null;
      const hidden = []; for (const ch of scene.children) if (ch !== ctx.staticRoot && ch !== ctx.dynamicRoot && ch.visible) { hidden.push(ch); ch.visible = false; }
      const au = r.shadowMap.autoUpdate, nu = r.shadowMap.needsUpdate; r.shadowMap.autoUpdate = false; r.shadowMap.needsUpdate = false;
      r.setRenderTarget(rt); r.setClearColor(new THREE.Color(0, 0, 0), 1); r.setClearAlpha(0); r.clear(); r.render(scene, c); r.setRenderTarget(null);
      r.shadowMap.autoUpdate = au; r.shadowMap.needsUpdate = nu;
      for (const ch of hidden) ch.visible = true;
      scene.background = bg; scene.fog = fog; ctx.sky.mesh.visible = sky; scene.overrideMaterial = ov;
      for (const [o, m, v] of saved) { o.material = m; o.visible = v; } saved.length = 0;
      const buf = new Float32Array(px * px * 4); r.readRenderTargetPixels(rt, 0, 0, px, px, buf); return buf;
    };
    const solid = pass((m) => !isFoliage(m) && !(m && m.userData && m.userData.acc === 'water'));
    const road = pass((m) => !!(m && m.userData && m.userData.acc === 'road'));
    const H = new Uint8Array(px * px), RD = new Uint8Array(px * px), res = size / px;
    for (let j = 0; j < px; j++) for (let i = 0; i < px; i++) {
      const k = (px - 1 - j) * px + i, o = j * px + i;   // RT rows start at the bottom (south)
      const x = cx - size / 2 + (i + 0.5) * res, z = cz - size / 2 + (j + 0.5) * res;
      if (solid[k * 4 + 1] > 0.5) { const g = L.heightAt(x, z); H[o] = Math.max(0, Math.min(255, Math.round((solid[k * 4] - g) * 4))); if (road[k * 4 + 1] > 0.5 && Math.abs(road[k * 4] - solid[k * 4]) < 0.6) RD[o] = 1; }
    }
    const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
    recull();
    return { h: b64(H), road: b64(RD) };
  };
  /** the app's own position of each reference landmark: harbour services / layout spots for the structures, and for a
   *  building the centre of the rendered footprint (the lot whose polygon holds the reference point, else the nearest
   *  lot within 40 m) with its name */
  acc.landmarks = (lotRefs) => {
    const S = L.SPOTS || {}, hb = ctx.services.harbor || {}, br = hb.bridges || {};
    const xz = (p) => (p ? (Array.isArray(p) ? [p[0], p.length > 2 ? p[2] : p[1]] : [p.x, p.z]) : null);
    const inR = (x, z, p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, zi] = p[i], [xj, zj] = p[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
    const lotAt = ([x, z]) => {
      let best = null, bd = 40;
      for (const l of L.LOTS) { const dx = l.obb.cx - x, dz = l.obb.cz - z; if (dx * dx + dz * dz > 250 * 250) continue; if (inR(x, z, l.poly)) return l; const d = Math.hypot(dx, dz); if (d < bd) { bd = d; best = l; } }
      return best;
    };
    const kt = (br.kanae || S.kanae?.towers || []).map(xz).filter(Boolean).sort((a, b) => a[1] - b[1]);
    const out = {
      ukimido: xz(S.ukimido), isuzu: xz(S.isuzuShrine), anbaLookout: xz(S.anbaLookout),
      kanaePylonN: kt[0] || null, kanaePylonS: kt[kt.length - 1] || null,
      oshimaA: xz(S.oshima?.a), oshimaB: xz(S.oshima?.b), lots: {},
    };
    const edgeDist = (x, z, p) => { if (inR(x, z, p)) return 0; let d = Infinity; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [ax, az] = p[j], [bx, bz] = p[i], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)); d = Math.min(d, Math.hypot(x - ax - dx * t, z - az - dz * t)); } return d; };
    for (const [id, ref] of Object.entries(lotRefs || {})) {
      const l = lotAt(ref);
      // the error of a building landmark: how far its rendered footprint is from the reference point (0 = on it)
      out.lots[id] = l ? { app: [l.obb.cx, l.obb.cz], err: edgeDist(ref[0], ref[1], l.poly), name: l.name || null, landmark: l.landmark || null, kind: l.kind } : null;
    }
    // [v4:integrate] 五十鈴神社: the OSM node is a point inside the hall, so it is scored like a building: the distance from
    // the reference to the rendered hall outline (harbor's 神明崎, services.harbor.shrine), 0 when the node lies on it
    const sh = hb.shrine;
    out.isuzuHall = sh?.footprint ? { app: [sh.x, sh.z], footprint: sh.footprint } : null;
    return out;
  };
  return Object.keys(acc);
})()`;

// ------------------------------------------------------------------ truth + helpers (node side)
const L = await import(join(ROOT, 'src/anime/world/layout.js'));
const bld = JSON.parse(readFileSync(join(ROOT, 'data/buildings/city.json'), 'utf8'));
const aerial = existsSync(join(ROOT, 'data/cache/anime/aerial.json')) ? JSON.parse(readFileSync(join(ROOT, 'data/cache/anime/aerial.json'), 'utf8')).res : {};
const ortho = JSON.parse(readFileSync(join(ROOT, 'data/ortho/core.json'), 'utf8'));
const lmRef = JSON.parse(readFileSync(join(ROOT, 'docs/anime/landmarks/landmarks.json'), 'utf8')).landmarks;
const ref = Object.fromEntries(lmRef.map((l) => [l.id, l]));
/** buildings measured by their rendered footprint (reference points from docs/anime/landmarks) */
const LOT_REFS = { pier7: ref.pier7?.enu, mukaeru: ref.mukaeru?.enu, uminoichi: ref.uminoichi?.enu, cityHall: ref['city-hall']?.main, station: ref['kesennuma-station']?.enu, riasArk: ref['rias-ark']?.enu,
  cityHospital: ref.hospitals?.cityHospital, otomo: ref.hospitals?.otomo };   // building centroids (the school refs are campus centres: not a building position)

const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const med = (a) => { if (!a.length) return NaN; const s = Float64Array.from(a).sort(); return s[s.length >> 1]; };
const pct = (a, p) => { if (!a.length) return NaN; const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const r3 = (v) => Math.round(v * 1000) / 1000;

/** the aerial photo cropped to a tile, resampled to px x px (RGB Uint8) */
async function photoTile(t) {
  const fx = (x) => (x - ortho.x0) / ortho.dx, fz = (z) => (z - ortho.z0) / ortho.dz;
  const l = fx(t.x0), tp = fz(t.z0), w = TILE / ortho.dx, h = TILE / ortho.dz;
  const L0 = Math.max(0, Math.floor(l)), T0 = Math.max(0, Math.floor(tp));
  const W = Math.min(ortho.width - L0, Math.ceil(w) + 1), Hh = Math.min(ortho.height - T0, Math.ceil(h) + 1);
  if (W <= 0 || Hh <= 0) return null;
  // crop with a whole-pixel origin, then resample; the sub-pixel remainder is < 0.5 m
  const { data } = await sharp(join(ROOT, 'data/ortho/core.jpg'), { limitInputPixels: false }).extract({ left: L0, top: T0, width: W, height: Hh })
    .resize(Math.round((W * ortho.dx) / RES), Math.round((Hh * ortho.dz) / RES), { kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true });
  const sw = Math.round((W * ortho.dx) / RES), ox = Math.round(((l - L0) * ortho.dx) / RES), oz = Math.round(((tp - T0) * ortho.dz) / RES);
  const out = new Uint8Array(PX * PX * 3);
  const sh = Math.round((Hh * ortho.dz) / RES);
  for (let j = 0; j < PX; j++) for (let i = 0; i < PX; i++) {
    const si = i + ox, sj = j + oz; if (si >= sw || sj >= sh) continue;
    const a = (sj * sw + si) * 3, b = (j * PX + i) * 3; out[b] = data[a]; out[b + 1] = data[a + 1]; out[b + 2] = data[a + 2];
  }
  return out;
}

// OSM highways (independent of the GSI road network the app is built on)
const HW_W = { motorway: 7, trunk: 7, primary: 7, secondary: 6.5, tertiary: 6, unclassified: 4.5, residential: 4.5, living_street: 4, service: 3.5, motorway_link: 5, trunk_link: 5, primary_link: 5, secondary_link: 5, tertiary_link: 5 };
function osmRoads() {
  const f = join(ROOT, 'raw/osm/overpass.json');
  if (!existsSync(f)) return [];
  const j = JSON.parse(readFileSync(f, 'utf8'));
  const out = [];
  for (const e of j.elements) {
    if (e.type !== 'way' || !e.tags?.highway || !HW_W[e.tags.highway] || !e.geometry) continue;
    if (e.tags.tunnel && e.tags.tunnel !== 'no') continue;
    if (e.tags.area === 'yes' || e.tags.service === 'parking_aisle' || e.tags.service === 'driveway') continue;
    const pts = e.geometry.map((g) => L.llToXZ(g.lat, g.lon));
    let w = parseFloat(e.tags.width); if (!(w > 1.5 && w < 40)) w = e.tags.lanes ? Math.max(3, Number(e.tags.lanes) * 3.0) : HW_W[e.tags.highway];
    out.push({ pts, w, bridge: !!e.tags.bridge && e.tags.bridge !== 'no', hw: e.tags.highway });
  }
  return out;
}

// ------------------------------------------------------------------ run
const t0 = Date.now();
if (!args.nobuild) {
  const r = await build({ outdir: join(ROOT, `dist/anime-${port}`) });
  console.log(`build ${r.reused ? 'FAILED (reused the last good build)' : 'ok'} ${r.ms ?? ''} ms`);
}
const srv = serve({ port, dist: join(ROOT, `dist/anime-${port}`) });
const renders = new Map(), masks = new Map(), lmRenders = new Map();
const LM_SIZE = 200;
/** the landmark side-by-sides (English captions: the SVG text renderer has no Japanese glyphs) */
const LM_SHOTS = [
  { id: 'ukimido', en: 'Ukimido pavilion + Ukimi-kaido walkway', at: ref.ukimido?.enu },
  { id: 'isuzu', en: 'Isuzu Shrine hall (Shinmeizaki)', at: ref['isuzu-jinja']?.enu },
  { id: 'kanaeN', en: 'Kanae Bridge north pylon', at: ref['kanae-ohashi']?.pylonN },
  { id: 'kanaeS', en: 'Kanae Bridge south pylon', at: ref['kanae-ohashi']?.pylonS },
  { id: 'pier7', en: 'PIER7 (Ubareru) + pontoons', at: LOT_REFS.pier7 },
  { id: 'mukaeru', en: 'Mukaeru', at: LOT_REFS.mukaeru },
  { id: 'uminoichi', en: 'Umi-no-Ichi / Shark Museum', at: LOT_REFS.uminoichi },
  { id: 'marketC', en: 'Fish market C hall', at: ref['fish-market']?.parts?.[2]?.enu },
  { id: 'marketN', en: 'Fish market north block + roof car park', at: ref['fish-market']?.parts?.[0]?.enu },
  { id: 'cityHall', en: 'City hall', at: LOT_REFS.cityHall },
  { id: 'station', en: 'Kesennuma Station', at: LOT_REFS.station },
  { id: 'otomo', en: 'Otomo Hospital', at: LOT_REFS.otomo },
  { id: 'anba', en: 'Anbasan summit', at: ref.anbasan?.summit },
];
let landmarksApp = null, townStats = null, errs = [];
let browser;
try {
  browser = await launch({ quiet: !args.verbose });
  // 1. colour
  {
    const page = await browser.page({ width: PX, height: PX });
    const q = new URLSearchParams({ shot: '1', w: String(PX), h: String(PX), t: '0', q: 'high', hours: String(args.hours || 12), weather: 'clear', cloud: '0' });
    await page.goto(`${srv.url}index.html?${q}`);
    await page.waitFor('window.__ready === true', { timeout: 300000 });
    console.log(`colour page ready in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    await page.eval(PAGE);
    for (const t of tiles) {
      const url = await page.eval(`window.__acc.color(${t.cx}, ${t.cz}, ${TILE})`);
      renders.set(t.id, Buffer.from(url.split(',')[1], 'base64'));
    }
    // [v4:integrate] --lmshots 1: a 200 m top-down render round every reference landmark (photo | app side-by-sides)
    if (args.lmshots) for (const p of LM_SHOTS) if (p.at) lmRenders.set(p.id, Buffer.from((await page.eval(`window.__acc.color(${p.at[0]}, ${p.at[1]}, ${LM_SIZE})`)).split(',')[1], 'base64'));
    landmarksApp = await page.eval(`window.__acc.landmarks(${JSON.stringify(LOT_REFS)})`);
    townStats = await page.eval('({ town: window.__town ? { hero: window.__town.hero, mid: window.__town.mid && window.__town.mid.count, far: window.__town.far && window.__town.far.count, ms: window.__town.total } : null, errors: window.__errors })');
    errs = errs.concat(page.errors().map((e) => e.text.slice(0, 300)));
  }
  // 2. height + road masks (town + harbour only: no terrain skin, no forest)
  {
    const page = await browser.page({ width: PX, height: PX });
    const q = new URLSearchParams({ shot: '1', w: String(PX), h: String(PX), t: '0', q: 'high', hours: '12', only: args.mask || 'town,harbor,landmarks,explore' });   // [v4:landmarks-B] the civic landmarks replace their lots; [v4:integrate] + explore, which builds the mid-zone town the visitor sees (--mask town,harbor,landmarks = the v3 path)
    await page.goto(`${srv.url}index.html?${q}`);
    await page.waitFor('window.__ready === true', { timeout: 300000 });
    await page.eval(PAGE);
    for (const t of tiles) {
      const m = await page.eval(`window.__acc.mask(${t.cx}, ${t.cz}, ${TILE}, ${PX})`);
      masks.set(t.id, { h: new Uint8Array(Buffer.from(m.h, 'base64')), road: new Uint8Array(Buffer.from(m.road, 'base64')) });
    }
    errs = errs.concat(page.errors().map((e) => e.text.slice(0, 300)));
  }
} catch (e) {
  console.log('ACCURACY RENDER FAILED:', e.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
  srv.stop();
}
if (process.exitCode) process.exit(process.exitCode);
console.log(`rendered ${tiles.length} tiles in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

// ------------------------------------------------------------------ metrics
const roads = osmRoads();
const feats = bld.features.map((f, i) => ({ f, i })).filter(({ f }) => f.poly?.length > 2);
for (const it of feats) { let x = 0, z = 0; for (const p of it.f.poly) { x += p[0]; z += p[1]; } it.cx = x / it.f.poly.length; it.cz = z / it.f.poly.length; }
const lotById = new Map(L.LOTS.map((l) => [l.id, l]));
const lotOfFeat = (id) => lotById.get(id) || lotById.get(String(id).split('.')[0]) || null;
const tot = { I: 0, U: 0, T: 0, Rn: 0, rI: 0, rU: 0, rC: 0, rCn: 0, rT: 0, rR: 0 };
const dE = [], dEalb = [], roofPairs = [], perTile = [], hErr = [], bias = [];
const MOS = 2, MW = Math.ceil((bb.x1 - bb.x0) / MOS), MH = Math.ceil((bb.z1 - bb.z0) / MOS);
const mos = { photo: new Uint8Array(MW * MH * 3), render: new Uint8Array(MW * MH * 3), diff: new Uint8Array(MW * MH * 3) };
for (const t of tiles) {
  const px = PX, res = RES;
  const photo = await photoTile(t);
  const { data: rimg } = await sharp(renders.get(t.id)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const M = masks.get(t.id);
  // truth masks: bit 1 footprints, bit 2 OSM road buffer, bit 4 OSM centre line
  const truth = new Uint8Array(px * px);
  const inT = (x, z, m = 0) => x >= t.x0 - m && x <= t.x0 + TILE + m && z >= t.z0 - m && z <= t.z0 + TILE + m;
  const here = feats.filter((it) => inT(it.cx, it.cz, 150));
  for (const { f } of here) { fillRing(truth, px, t.x0, t.z0, res, f.poly, 1); for (const h of f.holes || []) fillRing(truth, px, t.x0, t.z0, res, h, 1, true); }
  for (const rd of roads) { if (!rd.pts.some(([x, z]) => inT(x, z, 400))) continue; if (rd.bridge) continue; stampLine(truth, px, t.x0, t.z0, res, rd.pts, rd.w / 2, 2); stampLine(truth, px, t.x0, t.z0, res, rd.pts, 0, 4); }
  // road cover dilated by 1 px (a 0.5 m registration tolerance for the centre-line recall)
  const roadD = new Uint8Array(px * px);
  for (let j = 0; j < px; j++) for (let i = 0; i < px; i++) if (M.road[j * px + i]) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < px && b < px) roadD[b * px + a] = 1; }
  const T = { I: 0, U: 0, T: 0, Rn: 0, rI: 0, rU: 0, rC: 0, rCn: 0, rT: 0, rR: 0 };
  const diff = new Uint8Array(px * px * 3);
  for (let j = 0; j < px; j++) for (let i = 0; i < px; i++) {
    const x = t.x0 + (i + 0.5) * res, z = t.z0 + (j + 0.5) * res, o = j * px + i;
    const land = L.shoreDist(x, z) <= 0, inside = inRegion(x, z);
    const tb = truth[o] & 1, rb = M.h[o] > BUILD_T * 4 ? 1 : 0;
    const c = tb && rb ? [150, 150, 150] : tb ? [220, 50, 40] : rb ? [50, 110, 230] : land ? [245, 244, 238] : [205, 222, 235];
    diff.set(c, o * 3);
    if (!inside || !land) continue;
    if (tb && rb) T.I++; if (tb || rb) T.U++; if (tb) T.T++; if (rb) T.Rn++;
    const tr = truth[o] & 2 ? 1 : 0, rr = M.road[o];
    if (tr && rr) T.rI++; if (tr || rr) T.rU++; if (tr) T.rT++; if (rr) T.rR++;   // [v4:polish3] recall / precision apart
    if (truth[o] & 4) { T.rCn++; if (roadD[o]) T.rC++; }
  }
  for (const k of Object.keys(tot)) tot[k] += T[k];
  // roofs
  let cast = [0, 0, 0], castN = 0; const tileRoofs = [];
  for (const { f, i: fi, cx, cz } of here) {
    if (!inT(cx, cz) || !inRegion(cx, cz) || L.shoreDist(cx, cz) > 0) continue;
    const ring = f.poly; let area = 0; for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) area += (ring[b][0] + ring[a][0]) * (ring[b][1] - ring[a][1]); area = Math.abs(area) / 2;
    if (area < 40) continue;
    const off = aerial[fi]?.off || [0, 0];
    const fm = new Uint8Array(px * px); fillRing(fm, px, t.x0, t.z0, res, ring, 1);
    const pr = [[], [], []], rr = [[], [], []]; let hs = [];
    let zmin = Infinity, zmax = -Infinity, xmin = Infinity, xmax = -Infinity; for (const p of ring) { xmin = Math.min(xmin, p[0]); xmax = Math.max(xmax, p[0]); zmin = Math.min(zmin, p[1]); zmax = Math.max(zmax, p[1]); }
    const i0 = Math.max(1, Math.floor((xmin - t.x0) / res)), i1 = Math.min(px - 2, Math.ceil((xmax - t.x0) / res)), j0 = Math.max(1, Math.floor((zmin - t.z0) / res)), j1 = Math.min(px - 2, Math.ceil((zmax - t.z0) / res));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const o = j * px + i; if (!fm[o]) continue;
      // erode 1 m (2 px): all 8 neighbours at 2 px inside
      let edge = false; for (const [di, dj] of [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [-2, -2], [2, -2], [-2, 2]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= px || b >= px || !fm[b * px + a]) { edge = true; break; } }
      if (edge) continue;
      if (M.h[o] > BUILD_T * 4) { for (let c = 0; c < 3; c++) rr[c].push(rimg[o * 3 + c]); hs.push(M.h[o] / 4); }
      const pi = Math.round(i + off[0] / res), pj = Math.round(j + off[1] / res);
      if (photo && pi >= 0 && pj >= 0 && pi < px && pj < px) { const q = (pj * px + pi) * 3; for (let c = 0; c < 3; c++) pr[c].push(photo[q + c]); }
    }
    if (pr[0].length < 20 || rr[0].length < 20) continue;
    const P = pr.map(med), Rr = rr.map(med);
    const lot = lotOfFeat(f.id);
    tileRoofs.push({ P, Rr, lot, area, h: pct(hs, 0.9) });
    cast = cast.map((v, c) => v + Rr[c] / Math.max(1, P[c])); castN++;
  }
  const g = castN ? cast.map((v) => v / castN) : [1, 1, 1];
  for (const r of tileRoofs) {
    const e = dE2000(lab(r.P), lab(r.Rr)); dE.push(e);
    { const a = lab(r.P), b = lab(r.Rr); bias.push([b[0] - a[0], b[1] - a[1], b[2] - a[2], Math.hypot(b[1], b[2]) - Math.hypot(a[1], a[2])]); }
    const eb = dE2000(lab(r.P.map((v, c) => Math.min(255, v * g[c]))), lab(r.Rr));
    roofPairs.push({ raw: e, bal: eb });
    if (r.lot) {
      dEalb.push(dE2000(lab(r.P), lab(hexRgb(r.lot.roof.color))));
      // [v4:polish1] reference heights: OSM height / levels, the landmark sheets and the heritage records (KAZEMACHI), and
      // world/lotfix.js (photo-checked); the 26 OSM-tagged buildings alone were too few to judge by
      if ((r.lot.src?.h === 'osm' || r.lot.src?.h === 'landmark' || r.lot.src?.h === 'ref') && Number.isFinite(r.h)) hErr.push({ id: r.lot.id, ref: r.lot.src.h, osm: r.lot.height, app: +r.h.toFixed(1), err: +(r.h - r.lot.height).toFixed(1) });
    }
  }
  perTile.push({ id: t.id, cx: t.cx, cz: t.cz, iou: T.U ? r3(T.I / T.U) : null, recall: T.T ? r3(T.I / T.T) : null, precision: T.Rn ? r3(T.I / T.Rn) : null, roadRecall: T.rCn ? r3(T.rC / T.rCn) : null, roofs: tileRoofs.length });
  // side-by-side (downscaled to 500 px each)
  const S = 500, row = Buffer.alloc(S * 3 * S * 3);
  const put = (img, k, ch) => { for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const si = Math.floor((i * px) / S), sj = Math.floor((j * px) / S), a = (sj * px + si) * ch, b = (j * S * 3 + k * S + i) * 3; row[b] = img ? img[a] : 0; row[b + 1] = img ? img[a + 1] : 0; row[b + 2] = img ? img[a + 2] : 0; } };
  put(photo, 0, 3); put(rimg, 1, 3); put(diff, 2, 3);
  await sharp(row, { raw: { width: S * 3, height: S, channels: 3 } }).jpeg({ quality: 82 }).toFile(join(OUT, `side${TAG}_${t.id}.jpg`));
  // mosaics
  for (let j = 0; j < MH; j++) for (let i = 0; i < MW; i++) {
    const x = bb.x0 + (i + 0.5) * MOS, z = bb.z0 + (j + 0.5) * MOS;
    if (x < t.x0 || x >= t.x0 + TILE || z < t.z0 || z >= t.z0 + TILE) continue;
    const si = Math.floor((x - t.x0) / res), sj = Math.floor((z - t.z0) / res), a = (sj * px + si) * 3, b = (j * MW + i) * 3;
    if (photo) mos.photo.set(photo.subarray(a, a + 3), b); mos.render.set(rimg.subarray(a, a + 3), b); mos.diff.set(diff.subarray(a, a + 3), b);
  }
}
for (const k of ['photo', 'render', 'diff']) await sharp(mos[k], { raw: { width: MW, height: MH, channels: 3 } }).jpeg({ quality: 85 }).toFile(join(OUT, `mosaic${TAG}_${k}.jpg`));

// landmarks
const lmPairs = [];
const LN = { pier7: 'PIER7', mukaeru: '迎', uminoichi: '海の市', cityHall: '気仙沼市役所', station: '気仙沼駅', riasArk: 'リアス・アーク美術館', cityHospital: '気仙沼市立病院', otomo: '大友病院' };
const pairs = [
  ['浮見堂', ref.ukimido?.enu, landmarksApp?.ukimido], ['五十鈴神社', ref['isuzu-jinja']?.enu, landmarksApp?.isuzu], ['安波山 summit lookout', ref.anbasan?.summit, landmarksApp?.anbaLookout],
  ['かなえ大橋 north pylon', ref['kanae-ohashi']?.pylonN, landmarksApp?.kanaePylonN], ['かなえ大橋 south pylon', ref['kanae-ohashi']?.pylonS, landmarksApp?.kanaePylonS],
  ['大島大橋 north end', ref['oshima-ohashi']?.endN, landmarksApp?.oshimaA], ['大島大橋 south end', ref['oshima-ohashi']?.endS, landmarksApp?.oshimaB],
  ...Object.entries(LN).map(([id, name]) => [name + ' (building)', null, null, id]),
];
for (const [name, r0, a0, lotId] of pairs) {
  let r = r0, a = a0, extra = {};
  if (lotId) {
    r = LOT_REFS[lotId]; const got = landmarksApp?.lots?.[lotId]; a = got?.app || null; extra = got ? { appName: got.name, landmark: got.landmark, kind: got.kind, centreErr: +Math.hypot(got.app[0] - r[0], got.app[1] - r[1]).toFixed(1) } : { missing: true };
    if (!r) continue;
    lmPairs.push({ name, ref: r, app: a ? a.map((v) => +(+v).toFixed(1)) : null, err: got ? +got.err.toFixed(1) : null, ...extra });
    continue;
  }
  if (!r) continue;
  // the bridge ends can be listed either way round: pair each end with the nearer app end
  if (name === '五十鈴神社' && landmarksApp?.isuzuHall) {
    const fp = landmarksApp.isuzuHall.footprint, [x, z] = r;
    let inside = false; for (let i = 0, j = fp.length - 1; i < fp.length; j = i++) { const [xi, zi] = fp[i], [xj, zj] = fp[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside; }
    let d = Infinity; if (!inside) for (let i = 0, j = fp.length - 1; i < fp.length; j = i++) { const [ax, az] = fp[j], [bx, bz] = fp[i], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)); d = Math.min(d, Math.hypot(x - ax - dx * t, z - az - dz * t)); }
    const app = landmarksApp.isuzuHall.app;
    lmPairs.push({ name: '五十鈴神社 (hall)', ref: r, app: app.map((v) => +(+v).toFixed(1)), err: inside ? 0 : +d.toFixed(1), kind: 'building', centreErr: +Math.hypot(app[0] - x, app[1] - z).toFixed(1) });
    continue;
  }
  let app = a;
  if (/大島大橋/.test(name) && landmarksApp?.oshimaA && landmarksApp?.oshimaB) { const e = [landmarksApp.oshimaA, landmarksApp.oshimaB]; app = e.sort((p, q) => Math.hypot(p[0] - r[0], p[1] - r[1]) - Math.hypot(q[0] - r[0], q[1] - r[1]))[0]; }
  lmPairs.push({ name, ref: r, app: app ? app.map((v) => +(+v).toFixed(1)) : null, err: app ? +Math.hypot(app[0] - r[0], app[1] - r[1]).toFixed(1) : null, ...extra });
}

// [v4:integrate] landmark side-by-sides: the aerial photo | the app, 200 m square, north up, the reference point marked
if (args.lmshots) {
  for (const p of LM_SHOTS) {
    const buf = lmRenders.get(p.id); if (!buf) continue;
    const x0 = p.at[0] - LM_SIZE / 2, z0 = p.at[1] - LM_SIZE / 2, S = 800;
    const L0 = Math.round((x0 - ortho.x0) / ortho.dx), T0 = Math.round((z0 - ortho.z0) / ortho.dz), Wp = Math.round(LM_SIZE / ortho.dx), Hp = Math.round(LM_SIZE / ortho.dz);
    if (L0 < 0 || T0 < 0 || L0 + Wp > ortho.width || T0 + Hp > ortho.height) continue;
    const photo = await sharp(join(ROOT, 'data/ortho/core.jpg'), { limitInputPixels: false }).extract({ left: L0, top: T0, width: Wp, height: Hp }).resize(S, S).png().toBuffer();
    const app = await sharp(buf).resize(S, S).png().toBuffer();
    const pair = lmPairs.find((q) => q.ref && Math.hypot(q.ref[0] - p.at[0], q.ref[1] - p.at[1]) < 0.5);
    const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const mark = `<g stroke="#00e5ff" stroke-width="2" fill="none"><circle cx="${S / 2}" cy="${S / 2}" r="9"/><line x1="${S / 2 - 18}" y1="${S / 2}" x2="${S / 2 + 18}" y2="${S / 2}"/><line x1="${S / 2}" y1="${S / 2 - 18}" x2="${S / 2}" y2="${S / 2 + 18}"/></g><line x1="20" y1="${S - 20}" x2="${20 + S / LM_SIZE * 50}" y2="${S - 20}" stroke="#fff" stroke-width="4"/><text x="20" y="${S - 28}" fill="#fff" font-size="16" font-family="Helvetica" stroke="#000" stroke-width="0.6">50 m</text>`;
    const cap = `${esc(p.en)} · ref (${p.at.map((v) => Math.round(v)).join(', ')})${pair && pair.err !== null ? ` · app error ${pair.err} m` : ''}`;
    const svg = (label) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">${mark}<rect x="0" y="0" width="${S}" height="34" fill="rgba(0,0,0,0.55)"/><text x="12" y="23" fill="#fff" font-size="17" font-family="Helvetica">${label}</text></svg>`);
    await sharp({ create: { width: S * 2 + 8, height: S, channels: 3, background: '#111' } })
      .composite([{ input: await sharp(photo).composite([{ input: svg('GSI aerial photo · ' + cap) }]).png().toBuffer(), left: 0, top: 0 }, { input: await sharp(app).composite([{ input: svg('App (top-down, 12:00) · ' + esc(p.en)) }]).png().toBuffer(), left: S + 8, top: 0 }])
      .jpeg({ quality: 86 }).toFile(join(OUT, `lm${TAG}_${p.id}.jpg`));
  }
  console.log(`wrote lm${TAG}_*.jpg (${lmRenders.size} landmark side-by-sides)`);
}

const within = (a, x) => a.filter((v) => v < x).length / Math.max(1, a.length);
const report = {
  generated: new Date().toISOString(), tag: args.tag || null, region: { name: args.region || 'core', ...region }, res: RES, tile: TILE, tiles: tiles.length,
  truth: { buildings: 'GSI 基盤地図情報 building footprints (optimal_bvmap BldA, data/buildings/city.json)', photo: 'GSI seamlessphoto z18 (data/ortho/core.jpg) with per-roof relief offsets', roads: 'OpenStreetMap highways, © OpenStreetMap contributors (ODbL), extract 2026-05-06', landmarks: 'docs/anime/landmarks/landmarks.json' },
  buildings: { iou: r3(tot.I / tot.U), recall: r3(tot.I / tot.T), precision: r3(tot.I / tot.Rn), truthM2: Math.round(tot.T * RES * RES), renderM2: Math.round(tot.Rn * RES * RES), thresholdM: BUILD_T },
  roofs: {
    n: dE.length, dE2000: { median: r3(med(dE)), p75: r3(pct(dE, 0.75)), under10: r3(within(dE, 10)) },
    dE2000castRemoved: { median: r3(med(roofPairs.map((p) => p.bal))), p75: r3(pct(roofPairs.map((p) => p.bal), 0.75)), under10: r3(within(roofPairs.map((p) => p.bal), 10)) },
    albedo: { n: dEalb.length, median: r3(med(dEalb)), note: 'layout roof colour (unlit) vs the photo' },
    bias: { dL: r3(med(bias.map((b) => b[0]))), da: r3(med(bias.map((b) => b[1]))), db: r3(med(bias.map((b) => b[2]))), dChroma: r3(med(bias.map((b) => b[3]))), note: 'median render - photo in CIELAB' },
  },
  // [v4:polish3] precision (rendered asphalt on the OSM buffer) and recall (the buffer covered) apart: a low IoU with a
  // high centre-line recall means the widths disagree, and these say which way
  roads: { centrelineRecall: r3(tot.rC / tot.rCn), iou: r3(tot.rI / tot.rU), precision: r3(tot.rI / Math.max(1, tot.rR)), recall: r3(tot.rI / Math.max(1, tot.rT)), renderM2: Math.round(tot.rR * RES * RES), truthM2: Math.round(tot.rT * RES * RES), osmWays: roads.length },
  landmarks: { pairs: lmPairs, under5m: lmPairs.filter((p) => p.err !== null && p.err < 5).length + '/' + lmPairs.filter((p) => p.err !== null).length },
  heights: { n: hErr.length, medianAbsErr: hErr.length ? r3(med(hErr.map((h) => Math.abs(h.err)))) : null, sample: hErr.slice(0, 20) },
  perTile, app: townStats, pageErrors: errs.slice(0, 20),
};
writeFileSync(join(OUT, `accuracy${TAG}.json`), JSON.stringify(report, null, 1));
console.log(JSON.stringify({ buildings: report.buildings, roofs: report.roofs, roads: report.roads, landmarks: report.landmarks.under5m, heights: { n: report.heights.n, mae: report.heights.medianAbsErr } }, null, 1));
console.log(`wrote ${join(OUT, `accuracy${TAG}.json`)} + side${TAG}_*.jpg + mosaic${TAG}_*.jpg in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
