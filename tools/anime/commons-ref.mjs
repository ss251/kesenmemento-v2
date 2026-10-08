// [v6:evidence] Harvest geotagged Wikimedia Commons photos of Kesennuma as ground-level references (raw/, never committed).
//
//   env -u NODE_OPTIONS bun tools/anime/commons-ref.mjs [--out raw/ref/commons] [--since 2020] [--nodl] [--width 1600]
//
// Candidates: list=geosearch over the city bbox (lat 38.83..38.99, lon 141.50..141.70), tiled so no tile reaches the
// 500-result cap, for primary (camera) and secondary (object) coordinates; plus Cirrus `nearcoord:` hits inside the bbox
// and files whose structured data (P1259, coordinates of the point of view) is inside it. Metadata: imageinfo
// (extmetadata, EXIF), the page's coordinates, the {{Location}} heading in the wikitext, and SDC (P1259 + heading
// P7787, inception P571). Date = EXIF/extmetadata DateTimeOriginal, else SDC inception, else the upload time (flagged).
// Kept: taken in --since or later. Older photos are kept only when listed in OLD_OK (unchanged landmarks, flagged).
// Downloads each kept photo through Commons' standard 1920 px thumbnail bucket (non-standard widths are rate limited
// hard: HTTP 429 with a 600 s Retry-After, measured 2026-10-03) and scales it to --width px to <out>/<n>_<slug>.jpg and writes <out>/index.json.
//
// REFERENCE ONLY. Commons photos carry their own licences (CC BY / CC BY-SA ...): read shapes and colours from them,
// never ship, commit or paste them into the app.
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import sharp from 'sharp';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '../..');
const args = {};
for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) { const v = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : '1'; args[a.slice(2)] = v; } }
const OUT = resolve(ROOT, args.out || 'raw/ref/commons');
if (!OUT.startsWith(resolve(ROOT, 'raw') + '/')) throw new Error('--out must be under raw/ (third-party photos are never committed)');
const SINCE = Number(args.since || 2020), WIDTH = Number(args.width || 1600);
const BBOX = { s: 38.83, n: 38.99, w: 141.5, e: 141.7 };
const UA = 'KesennumaLivingCityRef/0.1 (reference harvester for a non-commercial 3D model of Kesennuma; bun fetch; ~1 req/s)';
const API = 'https://commons.wikimedia.org/w/api.php';
export const enu = (lat, lon) => ({ x: Math.round((lon - 141.575) * 86744 * 10) / 10, z: Math.round(-(lat - 38.906) * 111014 * 10) / 10 });
const inBox = (lat, lon) => lat >= BBOX.s && lat <= BBOX.n && lon >= BBOX.w && lon <= BBOX.e;

// Older photos kept as references of landmarks unchanged since they were taken (title -> why). Checked against the
// Google Earth 2026-03-11 captures (the building stands with the same footprint and roof).
export const OLD_OK = {
  'File:Kesennuma Station-2016.11.06.jpg': 'JR 気仙沼駅 building, unchanged since its 2012 renovation (docs/anime/landmarks/kesennuma-station.md); the forecourt and the BRT lanes may differ',
  'File:Kesennuma City Hospital.jpg': '気仙沼市立病院, the new building opened 2017-10-29 (docs/anime/landmarks/hospitals.md); standing in the GSI aerial photo',
  'File:JR East BRT Kesennuma City Hospital Station.jpg': 'the BRT stop at the new 気仙沼市立病院 (opened 2017-10-29, docs/anime/landmarks/hospitals.md); check the shelter against newer imagery',
  'File:Kesennuma City Hall 01.JPG': '気仙沼市役所 本庁舎 (八日町), standing with the same footprint and roof in Google Earth 2026-03-11 (raw/ref/earth/c1/B, c1/C)',
  'File:気仙沼市役所 - panoramio.jpg': '気仙沼市役所 本庁舎 (八日町), standing with the same footprint and roof in Google Earth 2026-03-11 (raw/ref/earth/c1/B, c1/C); an older photo: check for temporary signage',
};

let last = 0;
async function get(params, tries = 0) {
  const wait = 1100 - (Date.now() - last); if (wait > 0) await Bun.sleep(wait);
  last = Date.now();
  const u = API + '?' + new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  const r = await fetch(u, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA } });
  if (r.status === 429 || r.status >= 500) {
    if (tries > 8) throw new Error(`HTTP ${r.status} after retries: ${u}`);
    const s = Number(r.headers.get('retry-after')) || 5 * (tries + 1); console.log(`  ${r.status}: wait ${s} s`); await Bun.sleep(s * 1000); return get(params, tries + 1);
  }
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${u}`);
  const j = await r.json(); if (j.error) throw new Error(`API ${j.error.code}: ${j.error.info}`);
  return j;
}

// ---------------------------------------------------------------- candidates
async function geosearch() {
  const titles = new Map(), N = 4;
  for (const prim of ['primary', 'secondary']) for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const top = BBOX.n - ((BBOX.n - BBOX.s) / N) * i, bot = top - (BBOX.n - BBOX.s) / N, left = BBOX.w + ((BBOX.e - BBOX.w) / N) * j, right = left + (BBOX.e - BBOX.w) / N;
    const d = await get({ action: 'query', list: 'geosearch', gsbbox: `${top}|${left}|${bot}|${right}`, gsnamespace: '6', gslimit: '500', gsprimary: prim });
    const g = d.query.geosearch; if (g.length >= 500) console.log(`  WARNING tile ${i},${j} ${prim} hit the 500 cap`);
    for (const x of g) titles.set(x.title, (titles.get(x.title) || []).concat(prim));
  }
  return titles;
}
async function cirrus(q) {
  const out = new Set(); let off = 0;
  for (;;) {
    const d = await get({ action: 'query', list: 'search', srsearch: q, srnamespace: '6', srlimit: '500', sroffset: String(off) });
    for (const x of d.query.search) out.add(x.title);
    if (!d.continue) break; off = d.continue.sroffset;
  }
  return out;
}

// ---------------------------------------------------------------- metadata
const strip = (s) => (s == null ? null : String(s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
function exifDate(s) {
  if (!s) return null; const m = String(s).match(/(\d{4})[:\-](\d{2})[:\-](\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) { const y = String(s).match(/\b(19|20)\d{2}\b/); return y ? { iso: y[0], year: Number(y[0]) } : null; }
  return { iso: `${m[1]}-${m[2]}-${m[3]}${m[4] ? `T${m[4]}:${m[5]}:${m[6] || '00'}` : ''}`, year: Number(m[1]) };
}
function headingFromWikitext(t) {
  if (!t) return null;
  const m = t.match(/\{\{\s*(?:Location|Location dec|Camera location|Camera location dec)\s*\|[^}]*?heading\s*:\s*([A-Za-z0-9.\-]+)/i);
  if (!m) return null;
  const v = m[1].toUpperCase(), C = { N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5, S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5 };
  return C[v] ?? (Number.isFinite(Number(v)) ? Number(v) : null);
}
async function details(titles) {
  const out = new Map();
  for (let i = 0; i < titles.length; i += 25) {
    const batch = titles.slice(i, i + 25);
    const d = await get({ action: 'query', titles: batch.join('|'), prop: 'imageinfo|coordinates|revisions', iiprop: 'url|size|mime|timestamp|user|extmetadata|metadata', iiurlwidth: '1920', iimetadataversion: 'latest', iiextmetadatafilter: 'DateTimeOriginal|DateTime|LicenseShortName|LicenseUrl|Artist|Credit|ImageDescription|ObjectName|GPSLatitude|GPSLongitude|Categories', coprimary: 'all', coprop: 'type|dim', colimit: 'max', rvprop: 'content', rvslots: 'main' });
    for (const p of d.query.pages) out.set(p.title, p);
    // structured data (MediaInfo M<pageid>)
    const ids = d.query.pages.filter((p) => p.pageid).map((p) => 'M' + p.pageid);
    if (ids.length) {
      const w = await get({ action: 'wbgetentities', ids: ids.join('|'), props: 'claims' });
      for (const p of d.query.pages) { const e = w.entities?.['M' + p.pageid]; if (e) p.sdc = e.statements || e.claims || null; }
    }
    process.stdout.write(`  details ${Math.min(i + 25, titles.length)}/${titles.length}\r`);
  }
  console.log('');
  return out;
}
function sdcInfo(st) {
  if (!st) return {};
  const o = {};
  const pov = st.P1259?.[0]?.mainsnak?.datavalue?.value; if (pov) o.pov = { lat: pov.latitude, lon: pov.longitude };
  const hd = st.P1259?.[0]?.qualifiers?.P7787?.[0]?.datavalue?.value?.amount; if (hd != null) o.heading = Number(hd);
  const obj = st.P625?.[0]?.mainsnak?.datavalue?.value; if (obj) o.obj = { lat: obj.latitude, lon: obj.longitude };
  const inc = st.P571?.[0]?.mainsnak?.datavalue?.value?.time; if (inc) o.inception = inc.replace(/^\+/, '').slice(0, 10);
  return o;
}
function exifOf(p) {
  const m = p.imageinfo?.[0]?.metadata; const o = {};
  if (Array.isArray(m)) for (const x of m) o[x.name] = x.value;
  return o;
}
function record(p) {
  const ii = p.imageinfo?.[0]; if (!ii) return null;
  const em = ii.extmetadata || {}, ex = exifOf(p), sdc = sdcInfo(p.sdc);
  const wt = p.revisions?.[0]?.slots?.main?.content || '';
  const coords = p.coordinates || [];
  const cam = coords.find((c) => c.primary !== undefined && c.primary !== false) || null;
  const camC = sdc.pov || (cam ? { lat: cam.lat, lon: cam.lon } : null);
  const objC = sdc.obj || ((coords.find((c) => c.primary === undefined || c.primary === false)) ? { lat: coords.find((c) => !c.primary).lat, lon: coords.find((c) => !c.primary).lon } : null);
  // a {{Location}} (camera) template is the primary coordinate on Commons; {{Object location}} only -> object
  const isCamera = !!sdc.pov || /\{\{\s*(Location|Camera location)/i.test(wt);
  const pos = isCamera ? camC || objC : objC || camC;
  let date = null, dateSrc = null;
  for (const [k, v] of [['extmetadata DateTimeOriginal', strip(em.DateTimeOriginal?.value)], ['EXIF DateTimeOriginal', ex.DateTimeOriginal], ['SDC inception P571', sdc.inception], ['EXIF DateTime', ex.DateTime]]) { const d = exifDate(v); if (d && d.year >= 1990 && d.year <= 2026) { date = d; dateSrc = k; break; } }
  if (!date) { const d = exifDate(ii.timestamp); date = d; dateSrc = 'upload time (no capture date)'; }
  let heading = sdc.heading ?? null, headingSrc = heading != null ? 'SDC P7787' : null;
  if (heading == null) { const h = headingFromWikitext(wt); if (h != null) { heading = h; headingSrc = '{{Location}} heading'; } }
  if (heading == null && ex.GPSImgDirection != null) { const v = String(ex.GPSImgDirection); const f = v.includes('/') ? Number(v.split('/')[0]) / Number(v.split('/')[1]) : Number(v); if (Number.isFinite(f)) { heading = Math.round(f * 10) / 10; headingSrc = `EXIF GPSImgDirection (${ex.GPSImgDirectionRef || 'ref ?'})`; } }
  return {
    title: p.title, pageid: p.pageid, page: `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`,
    url: ii.url, thumb: ii.thumburl || null, mime: ii.mime, size: [ii.width, ii.height],
    licence: strip(em.LicenseShortName?.value), licenceUrl: strip(em.LicenseUrl?.value), author: strip(em.Artist?.value) || ii.user, credit: strip(em.Credit?.value),
    description: (strip(em.ImageDescription?.value) || '').slice(0, 400), categories: strip(em.Categories?.value) || '',
    date: date?.iso || null, year: date?.year || null, dateSrc, uploaded: ii.timestamp,
    lat: pos?.lat ?? null, lon: pos?.lon ?? null, posKind: pos ? (isCamera ? 'camera' : 'object') : null,
    ...(pos ? { enu: enu(pos.lat, pos.lon) } : {}),
    heading, headingSrc,
  };
}

// ---------------------------------------------------------------- main
if (import.meta.main) {
  mkdirSync(join(OUT, 'untagged'), { recursive: true });
  const CACHE = join(OUT, '.recs.json');
  let geo, near, text, recs;
  if (args.cached && existsSync(CACHE)) {
    const c = JSON.parse(readFileSync(CACHE, 'utf8')); geo = new Map(c.geo); near = new Set(c.near); text = new Set(c.text); recs = c.recs; console.log(`cached: ${recs.length} records`);
  } else {
  console.log('geosearch (tiled, primary + secondary) ...');
  geo = await geosearch();
  console.log(`  ${geo.size} geotagged files`);
  console.log('cirrus nearcoord ...');
  near = await cirrus('nearcoord:12km,38.91,141.6');
  console.log(`  ${near.size} hits`);
  // files named or categorised Kesennuma without coordinates: kept (2020+, capture date known) as `untagged`, to be placed by hand
  console.log('cirrus text + category tree ...');
  text = new Set();
  for (const q of ['Kesennuma', '気仙沼', 'deepcat:"Kesennuma, Miyagi"']) for (const t of await cirrus(q)) text.add(t);
  console.log(`  ${text.size} hits`);
  const all = [...new Set([...geo.keys(), ...near, ...text])].filter((t) => !/\.(webm|ogv|pdf|svg|tif|tiff|djvu)$/i.test(t));
  console.log(`details for ${all.length} files ...`);
  const det = await details(all);
  recs = [];
  for (const t of all) { const p = det.get(t); if (!p) continue; const r = record(p); if (!r) continue; r.found = [...(geo.get(t) || []).map((x) => 'geosearch:' + x), ...(near.has(t) ? ['nearcoord'] : []), ...(text.has(t) ? ['text/category'] : [])]; recs.push(r); }
  writeFileSync(CACHE, JSON.stringify({ geo: [...geo], near: [...near], text: [...text], recs }));
  }
  const inside = recs.filter((r) => r.lat != null && inBox(r.lat, r.lon));
  const keep = inside.filter((r) => (r.year && r.year >= SINCE) || OLD_OK[r.title]).map((r) => (r.year >= SINCE ? r : { ...r, older: true, olderWhy: OLD_OK[r.title] }));
  const skipped = inside.filter((r) => !keep.includes(r) && !keep.find((k) => k.title === r.title)).map((r) => ({ title: r.title, date: r.date, dateSrc: r.dateSrc, lat: r.lat, lon: r.lon, enu: r.enu }));
  keep.sort((a, b) => (a.enu.x - b.enu.x) || (a.enu.z - b.enu.z));
  for (const r of keep) if (/upload/.test(r.dateSrc)) r.dateUncertain = true;
  const untagged = recs.filter((r) => r.lat == null && r.year >= SINCE && !/upload/.test(r.dateSrc) && /^image\/(jpeg|png|webp)/.test(r.mime || '') && /kesennuma|気仙沼|kesen-numa/i.test(`${r.title} ${r.description} ${r.categories}`))
    // other towns that share the Kesennuma categories (the BRT lines, the expressway)
    .filter((r) => !/Rikuzentakata|Rikuzen-?Koizumi|Koizumikaigan|Iwate|Minamisanriku|Shizugawa|Shizuhama|Tome IC|Kamaishi|Ichinoseki|Osabe|Takatakokomae|Nishishita|Maeyachi|Rikuzenyokoyama|Rikuzen-hashikami|陸前小泉|Remain JR Shizugawa/i.test(r.title))
    // the town core first (the downloads are rate limited)
    .map((r) => ({ r, p: /City Hall|Naiwan|内湾|civic hall|Joint Office|横断橋|Bay Crossing|窓あかり|Kesennuma Station|気仙沼駅|Minami-?Kesennuma|南気仙沼|Shishiori|Hayama|Kajiwara|Sanriku Shinposha|Oshimakisen/i.test(r.title) ? 0 : 1 }))
    .sort((a, b) => a.p - b.p || a.r.title.localeCompare(b.r.title)).map((x) => x.r);
  for (const r of untagged) { r.untagged = true; keep.push(r); }
  const writeIndex = () => {
    const index = {
    note: 'Wikimedia Commons photos inside the Kesennuma city bbox, REFERENCE ONLY: each keeps its own licence and author; never ship, commit or paste them into the app. ENU: origin 38.9060N 141.5750E, x east, z south (metres). untagged = taken 2020+ (capture date known) and named or categorised Kesennuma, but with no coordinates: place by hand (untagged/). posKind camera = the photographer position ({{Location}} / SDC P1259), object = the subject position ({{Object location}} / P625). heading = compass bearing the camera looks to, when known.',
    harvested: new Date().toISOString(), tool: 'tools/anime/commons-ref.mjs', bbox: BBOX, since: SINCE, width: WIDTH,
    counts: { candidates: recs.length, withCoordsInBbox: inside.length, kept: keep.length - untagged.length, untagged: untagged.length, keptOlder: keep.filter((r) => r.older).length, skippedOlder: skipped.length },
    photos: keep.filter((r) => !r.untagged), untagged, skippedOlder: skipped,
  };
    writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 1));
  };
  // downloads (the index is written first and every 10 photos, so an interrupted run leaves a valid index)
  for (const r of keep) { const slug0 = r.title.replace(/^File:/, '').replace(/\.[^.]+$/, '').normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 60); r.file = `${r.untagged ? 'untagged/' : ''}${r.pageid}_${slug0}.jpg`; r.downloaded = existsSync(join(OUT, r.file)); }
  writeIndex();
  let n = 0;
  for (const r of keep) {
    n++; if (n % 10 === 0) writeIndex();
    const slug = r.title.replace(/^File:/, '').replace(/\.[^.]+$/, '').normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 60);
    r.file = `${r.untagged ? 'untagged/' : ''}${r.pageid}_${slug}.jpg`;
    const f = join(OUT, r.file);
    if (!args.nodl && !existsSync(f) && r.thumb) {
      // the thumbnail first; on HTTP 429 the original file (the thumbnail servers answer a burst with a 600 s Retry-After,
      // measured 2026-10-03), scaled here; then back off
      for (let k = 0; k < 8; k++) {
        const wait = 8000 - (Date.now() - last); if (wait > 0) await Bun.sleep(wait); last = Date.now();
        const src = k % 2 === 0 ? r.thumb : r.url;
        const res = await fetch(src, { headers: { 'User-Agent': UA } });
        if (res.ok) { await sharp(Buffer.from(await res.arrayBuffer()), { limitInputPixels: false }).rotate().resize({ width: WIDTH, withoutEnlargement: true }).jpeg({ quality: 88 }).toFile(f); r.via = k % 2 === 0 ? 'thumb' : 'original'; break; }
        const s = Math.min(600, Number(res.headers.get('retry-after')) || 10) * (k % 2); console.log(`  ${k % 2 ? 'original' : 'thumb'} ${res.status} ${r.title}${s ? `: wait ${s} s` : ''}`); if (s) await Bun.sleep(s * 1000);
      }
      process.stdout.write(`  downloaded ${n}/${keep.length}\r`);
    }
    r.downloaded = existsSync(f);
  }
  console.log('');
  writeIndex();
  console.log(`kept ${keep.length} (older flagged ${keep.filter((r) => r.older).length}, untagged ${untagged.length}), skipped ${skipped.length} older; downloaded ${keep.filter((r) => r.downloaded).length} -> ${join(OUT, 'index.json')}`);
}
