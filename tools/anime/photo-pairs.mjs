// [v5:photos] Side-by-side pairs of the author's ground-truth phone photos (raw/author-photos, 2026-10-01 17:07-17:22
// JST) and the app rendered from the same place: the photo's GPS position (ENU x = (lon - 141.575) * 86744,
// z = -(lat - 38.906) * 111014), eye 1.5 m above the walkable surface there, the compass heading, and the 35 mm
// equivalent focal length as a portrait 3:4 frame. [v5:detail] Apple's FocalLengthIn35mmFormat matches the diagonal
// (43.27 mm): a 4:3 frame with that diagonal is 34.62 x 25.96 mm, so the vertical (long side) FOV = 2 atan(17.31 / f)
// (24 mm: 71.6 deg, not the 73.7 of a 36 mm long side). The app is lit with the photo look (life/time.js LOOKS.photo:
// overcast dusk at 17:20 JST on 2026-10-01, interiors lit) unless --hours / --weather / --look none is given.
//
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/photo-pairs.mjs --port 8880 [--only 0800,0823]
//        [--look photo | --hours 16.5 --weather cloudy | --photo-time 1] [--nobuild] [--out docs/shots/v5_photos] [--h 1080]
//
// Writes <out>/pair_IMG_xxxx.jpg (photo left, render right, same height) and <out>/index.json (the cameras used).
// The photos stay in raw/ (gitignored). FIX below corrects a GPS fix that is clearly off (a reason is given for each):
// the photo then names the corrected position in index.json.
//
// [v5:photos3] Two batches: raw/author-photos/index.json (2026-10-01, IMG_0792-0842) and the author's second drive
// raw/author-photos/drive-1003/index.json (2026-10-02; 24 of its 48 repeat the first batch, the first batch's entry wins).
// [sys:10] A third source: raw/ref/commons/index.json (Wikimedia Commons, reference only) entries with year >= 2020 and posKind 'camera',
// at the photographer's position with the SDC P7787 / {{Location}} heading when there is one (else the heading is unknown: headingUnknown) and the
// focal length from the EXIF FocalLengthIn35mmFormat when the file has it (else a 24 mm guess, fovGuess). COMMONS_FIX moves a geotag that is wrong (One-Ten 2026 was
// tagged inside the survey box); a photo whose final position lies inside the photo-survey boxes is skipped. `--commons 0` leaves the source out.
// `--refine-heading 1` searches +-40 degrees (2 degree steps, then 1) for the best edge NCC between the photo and the app and writes the best value to index.json
// as `suggestHeading { dh, heading, score, score0 }`: it never overrides FIX; a person confirms each suggestion before it goes into FIX.
// `--new 1` renders only the second batch's new photos. The look is chosen per photo (`--look auto`, the default): the
// first batch's overcast dusk keeps `photo` (17:20), the 10-02 daytime shots get `sunny` and the dawn market shots `dawn`
// at the photo's own clock, and a night shot gets no look at its own clock. `--look photo` forces one look for all.
import { join, resolve } from 'node:path';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import sharp from 'sharp';
import { build, serve, launch, ROOT } from './cdp.mjs';

const args = {};
for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) { const k = a.slice(2); const v = process.argv[i + 1] !== undefined && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : '1'; args[k] = v; } }
const port = Number(args.port || 8870);
if ([8787, 8790, 8791].includes(port)) throw new Error('port reserved');
const H = Math.min(1080, Number(args.h || 1080)), W = Math.round(H * 3 / 4);
const OUT = resolve(ROOT, args.out || 'docs/shots/v5_photos');

/** GPS fixes that disagree with what the photo shows. [x, z] replaces the fix; y = a deck height (T.P.) to stand on;
 *  dh = a heading correction in degrees; pitch = the camera tilt read off the horizon (degrees, + up). */
export const FIX = {
  // on the C棟 roof deck (GPS altitude 11 m, the lettered wall a few metres to the left): the fix (595, 1029) is over the
  // road west of the hall, 110 m from the other five market photos; the view matches a spot 3 m NNW of the entrance
  IMG_0792: { x: 711.5, z: 1033.9, why: 'GPS fix 110 m off, over the road; the view is along the lettered wall from 8 m off it (the letters 魚市場 span x 0.1-0.4)' },
  // the lifeboat 8 m to the right-front and the cone line to a pavilion (the fix put the camera 3 m from the penthouse wall,
  // which the photo does not show)
  IMG_0793: { x: 714.2, z: 1041.1, why: 'fix 7 m off: placed from the lifeboat (8 m, bearing 20) and the cone line' },
  // the two ring benches line up at bearing ~147 (near one 3.5 m away): the camera is on the line through rings 1 and 2
  IMG_0800: { x: 16.2, z: 53.1, why: 'fix 6 m off: placed on the line through ring benches 1 and 2 (both at bearing ~147)' },
  IMG_0802: { x: 16.2, z: 53.1, why: 'fix 3 m off (the first ring bench and its tree would fill the frame): the 48 mm crop of 0800, from the same spot' },
  // PIER7's NW corner deck and glass box are 10-15 m away in the photos; the fixes stand 5 m from them
  IMG_0799: { x: -13.8, z: 66.5, why: 'fix ~5 m off: backed off along the view so the NW corner is 12-15 m away as photographed' },
  // the mesh stair cage sits at bearing 281 in IMG_0807 (heading 270); in IMG_0808 it is at the frame centre: heading 282
  IMG_0808: { x: 31.6, z: 53.7, dh: -11, why: 'compass 11 deg off: the stair cage (bearing 281 from IMG_0807, same spot) is at the frame centre' },
  IMG_0806: { x: 31.6, z: 53.7, dh: 7, why: 'compass 7 deg off: the two ring benches frame the view as in IMG_0807' },
  IMG_0814: { x: 28.3, z: 60.0, pitch: 10, why: 'fix 9 m off: from the fix the deck stilts 6 m away fill the 48 mm frame; the photo shows ~10 m of the glazed 2F, so ~18 m back along the view' },
  IMG_0823: { x: -13.1, z: 67.5, why: 'fix ~6 m off: backed off along the view so the corner deck and totem are 8-10 m away as photographed' },
  // [v5:detail] the ANCHOR face (the 10.4 m street segment of 迎's footprint) spans x 175-590 of the photo with the glazed
  // corner beyond, and the 2.4 m shopfront is 165 px tall (11 m away): solved from the two face corners' bearings, the
  // camera stood 3 m further south than the fix, on the pavement at the corner; the phone was tilted up ~11 deg (the
  // horizon at y 687 of 1080: 1.5 m up the 2.6 m shopfront)
  IMG_0825: { x: -18.2, z: 60.0, pitch: 6.5, why: 'fix 5 m off: the clerestory is 111 px tall at 48 mm (15 m away), on the heading line through the RST sign' },
  IMG_0826: { x: -16.5, z: 57.4, pitch: 11, why: 'fix 2.6 m off: the ANCHOR face corners (x 175 and 590) put the camera 11 m from the face, not 8 m' },
  IMG_0828: { x: -16.5, z: 57.4, why: 'the same fix as IMG_0826 / 0827 (same spot, same minute): the parked kei 9 m ahead, the building 8 m right' },
  // IMG_0825-0832 were taken within 14 s (17:21:03-17:21:17) turning on the spot: the same corner fix for the rest
  IMG_0829: { x: -16.5, z: 57.4, why: 'the IMG_0826-0828 spot (taken 2 s later, turning on the spot)' },
  IMG_0830: { x: -16.5, z: 57.4, why: 'the IMG_0826-0828 spot (taken 3 s later, turning on the spot)' },
  IMG_0831: { x: -16.5, z: 57.4, why: 'the IMG_0826-0828 spot (taken 5 s later, turning on the spot)' },
  IMG_0832: { x: -16.5, z: 57.4, why: 'the IMG_0826-0828 spot (taken 7 s later, turning on the spot)' },
  IMG_0827: { x: -16.5, z: 57.4, dh: -2.6, pitch: 11, why: 'fix 3.3 m off: the ANCHOR face corners (x 175 and 590) put the camera 11 m from the face, not 8 m' },
};
/** Per-photo camera tilt (degrees, + up), read off the horizon / verticals of each photo. */
const PITCH = { IMG_0803: 8, IMG_0801: 6, IMG_0799: 6, IMG_0823: 6, IMG_0795: 4, IMG_0820: 8, IMG_0825: 6, IMG_0826: 6, IMG_0833: 2 };

/** [sys:10] Commons geotags that disagree with what the photo shows (keyed by the Commons file name in raw/ref/commons). [x, z] ENU replaces the geotag. */
export const COMMONS_FIX = {
  '187673287_Kesennuma_City_Hall_One_Ten_Office_2026.jpg': { x: -370, z: -160, dh: 0, why: 'Commons geotag (ENU 29.4, 51.2) is inside the survey box and wrong: the subject is the One-Ten building at 八日町 (OSM way 631751376); the camera stands about 15 m south-east of its rounded corner, at the 島田 / One-Ten corner (-360..-400, -150..-185), read off the photo' },
};
/** [sys:10] The photo-survey workflow's areas (the PIER7 / plaza / 迎 / 結 / 拓 south shore, and the fish-market lots): no pair of a photo that stands inside them. */
export const SURVEY_BOXES = [[-80, 0, 200, 140], [370, 570, 835, 1280]];
export const inSurvey = (x, z) => SURVEY_BOXES.some(([x0, z0, x1, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1);
/** [sys:10] FocalLengthIn35mmFormat (EXIF tag 0xA405) of an EXIF block (sharp metadata().exif, 'Exif\0\0' + TIFF), or null. */
export function readF35(exif) {
  try {
    const b = Buffer.isBuffer(exif) ? exif : Buffer.from(exif); let o = b.indexOf('Exif\0\0') >= 0 ? b.indexOf('Exif\0\0') + 6 : 0;
    const le = b.toString('ascii', o, o + 2) === 'II', u16 = (p) => (le ? b.readUInt16LE(p) : b.readUInt16BE(p)), u32 = (p) => (le ? b.readUInt32LE(p) : b.readUInt32BE(p));
    const ifd = (start, want) => { const n = u16(o + start); for (let i = 0; i < n; i++) { const e = o + start + 2 + i * 12; if (u16(e) === want) return { type: u16(e + 2), val: e + 8 }; } return null; };
    const ex = ifd(u32(o + 4), 0x8769); if (!ex) return null;
    const t = ifd(u32(ex.val), 0xA405); if (!t) return null;
    const v = u16(t.val); return v > 0 ? v : null;
  } catch { return null; }
}
/** [sys:10] 'YYYY-MM-DDTHH:MM:SS' (Commons) -> { date: 'YYYY:MM:DD', hours } */
export function commonsClock(iso) { const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/); return m ? { date: `${m[1]}:${m[2]}:${m[3]}`, hours: +m[4] + m[5] / 60 + m[6] / 3600 } : { date: '', hours: 12 }; }
/** [sys:10] Edge NCC of two grey images (Sobel magnitude, the border left out): how well the app's edges match the photo's. */
export function edgeNcc(a, b, w, h) {
  const mag = (g) => { const o = new Float32Array(w * h); for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) { const k = j * w + i, gx = g[k - w + 1] + 2 * g[k + 1] + g[k + w + 1] - g[k - w - 1] - 2 * g[k - 1] - g[k + w - 1], gy = g[k + w - 1] + 2 * g[k + w] + g[k + w + 1] - g[k - w - 1] - 2 * g[k - w] - g[k - w + 1]; o[k] = Math.hypot(gx, gy); } return o; };
  const A = mag(a), B = mag(b); let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
  for (let j = 4; j < h - 4; j++) for (let i = 4; i < w - 4; i++) { const k = j * w + i; n++; sa += A[k]; sb += B[k]; saa += A[k] * A[k]; sbb += B[k] * B[k]; sab += A[k] * B[k]; }
  const va = saa - sa * sa / n, vb = sbb - sb * sb / n; return va > 0 && vb > 0 ? (sab - sa * sb / n) / Math.sqrt(va * vb) : -1;
}
/** [sys:10] The headings to try: +-40 degrees about `h0` in 2 degree steps, then +-1 degree about the best of those (`best` = the coarse winner's dh). */
export const headingGrid = (best = null) => (best === null ? Array.from({ length: 41 }, (_, i) => -40 + i * 2) : [best - 1, best + 1].filter((d) => d >= -41 && d <= 41));

/** [v5:photos3] The photo batches, oldest first (a photo in both keeps the first batch's entry). */
export const BATCHES = [
  { id: 1, dir: 'raw/author-photos', note: '2026-10-01 17:07-17:22 JST, IMG_0792-0842' },
  { id: 2, dir: 'raw/author-photos/drive-1003', note: 'drive 2026-10-03: 2026-10-01 13:30 (IMG_0774) and 2026-10-02 06:48-21:11 JST; 24 new' },
];
/** [v5:photos3] The look for a photo's date and clock (`--look auto`): the first batch's overcast dusk -> photo; 10-02 dawn
 *  -> dawn; daytime -> sunny; night -> none (the clock alone). */
export function lookFor(date, hours) {
  if (date === '2026:10:01' && hours >= 16.9) return 'photo';
  if (hours >= 5 && hours < 9) return 'dawn';
  if (hours >= 9 && hours < 17.6) return 'sunny';
  return 'none';
}

export function enu(lat, lon) { return [(lon - 141.575) * 86744, -(lat - 38.906) * 111014]; }
export const vfov = (f35) => 2 * Math.atan(17.31 / f35) * 180 / Math.PI;   // [v5:detail] diagonal-matched 35 mm equivalent

if (import.meta.main) await main();   // importable (tests use enu / vfov / FIX) without running the tool

async function main() {
  // [v5:photos3] both batches; the first batch's entry wins for a photo in both
  const seen = new Set();
  let list = [];
  for (const B of BATCHES) {
    const ip0 = join(ROOT, B.dir, 'index.json'); if (!existsSync(ip0)) continue;
    for (const p of JSON.parse(await Bun.file(ip0).text())) {
      const id = p.SourceFile.split('/').pop().replace(/\.\w+$/, '');
      if (seen.has(id)) continue; seen.add(id);
      const [x, z] = enu(p.GPSLatitude, p.GPSLongitude);
      const fx = FIX[id] || {};
      const [date, clock] = p.DateTimeOriginal.split(' '), hhmm = clock.split(':').map(Number), hours = hhmm[0] + hhmm[1] / 60 + hhmm[2] / 3600;
      list.push({ id, batch: B.id, src: join(ROOT, B.dir, 'jpg', `${id}.jpg`), date, gps: [+x.toFixed(1), +z.toFixed(1)], alt: p.GPSAltitude != null ? +p.GPSAltitude.toFixed(1) : null, x: fx.x ?? x, z: fx.z ?? z, y: fx.y ?? null, heading: p.GPSImgDirection + (fx.dh || 0), f35: p.FocalLengthIn35mmFormat, fov: +vfov(p.FocalLengthIn35mmFormat).toFixed(2), pitch: fx.pitch ?? PITCH[id] ?? 3, hours: +hours.toFixed(4), fix: fx.why || null, skip: fx.skip || null });
    }
  }
  // [sys:10] Commons photos of 2020 or later, at the photographer's position (posKind 'camera')
  if (args.commons !== '0') {
    const ci = join(ROOT, 'raw/ref/commons/index.json');
    if (existsSync(ci)) for (const c of JSON.parse(readFileSync(ci, 'utf8')).photos || []) {
      if (!(c.year >= 2020) || c.posKind !== 'camera' || !c.downloaded) continue;
      const id = 'C_' + c.pageid, fx = COMMONS_FIX[c.file] || {};
      const [ex, ez] = c.enu ? [c.enu.x, c.enu.z] : enu(c.lat, c.lon), x = fx.x ?? ex, z = fx.z ?? ez;
      if (inSurvey(x, z)) { console.log(`${id}: skipped (inside the photo-survey area at (${x.toFixed(0)}, ${z.toFixed(0)})): ${c.title}`); continue; }
      if (seen.has(id)) continue; seen.add(id);
      const file = join(ROOT, 'raw/ref/commons', c.file);
      let f35 = null; try { if (existsSync(file)) f35 = readF35((await sharp(file).metadata()).exif); } catch { /* no EXIF */ }
      const { date, hours } = commonsClock(c.date), heading = c.heading ?? null;
      list.push({ id, batch: 3, src: file, date, gps: [+ex.toFixed(1), +ez.toFixed(1)], alt: null, x, z, y: fx.y ?? null, heading: (heading ?? 0) + (fx.dh || 0), headingUnknown: heading === null, headingSrc: c.headingSrc || null, f35: f35 ?? 24, fovGuess: f35 === null, fov: +vfov(f35 ?? 24).toFixed(2), pitch: fx.pitch ?? 3, hours: +hours.toFixed(4), fix: fx.why || null, skip: null, commons: c.title });
    }
  }
  if (args.new) list = list.filter((p) => p.batch === 2);
  if (args.only) { const want = new Set(String(args.only).split(',').map((s) => 'IMG_' + s.replace(/^IMG_/, ''))); list = list.filter((p) => want.has(p.id)); }
  // the look per photo: --hours / --weather -> the old clock-and-weather lighting for all; --look <id> -> that look for all
  const legacy = !!(args.hours || args.weather);
  const lookArg = args.look ?? (legacy ? 'none' : 'auto');
  for (const p of list) {
    p.look = lookArg === 'auto' ? lookFor(p.date, p.hours) : lookArg;
    // the photo look keeps its 17:20 unless --photo-time; the new looks and night shots run at the photo's own clock
    p.renderHours = legacy ? Number(args.hours || 16.5) : p.look === 'photo' && !args['photo-time'] ? 17 + 20 / 60 : p.hours;
  }
  mkdirSync(OUT, { recursive: true });

  const dist = join(ROOT, `dist/anime-${port}`);
  if (!args.nobuild) { const r = await build({ outdir: dist }); console.log(`build ${r.reused ? 'FAILED (reused the last good build)' : 'ok'} ${r.ms ?? ''} ms`); }
  const srv = serve({ port, dist });
  let browser; const used = [];
  try {
    browser = await launch({ quiet: !args.verbose });
    const page = await browser.page({ width: W, height: H });
    // [v5:detail] the photo look by default (overcast dusk 17:20 JST, 2026-10-01, interiors lit); --hours / --weather go back
    // to the clock-and-weather lighting (the v5 pairs used 16:30 cloudy). [v5:photos3] the page loads with the first photo's
    // look; the look and the clock then switch per photo (life/time.js setLook, __setHours)
    const look0 = list[0]?.look ?? 'photo', hours0 = list[0]?.renderHours ?? 17 + 20 / 60;
    const q = new URLSearchParams({ shot: '1', w: String(W), h: String(H), t: '0', q: args.q || 'high', fov: '60', hours: String(hours0) });
    if (look0 !== 'none') q.set('look', look0); else q.set('weather', args.weather || (legacy ? 'cloudy' : 'clear'));
    if (args.query) for (const [k, v] of new URLSearchParams(args.query)) q.set(k, v);
    await page.goto(`${srv.url}index.html?${q}`);
    await page.waitFor('window.__ready === true', { timeout: 280000 });
    let curLook = look0;
    for (const p of list) {
      if (p.look !== curLook) { await page.eval(`void window.__life.time.setLook(${p.look === 'none' ? 'null' : JSON.stringify(p.look)})`); curLook = p.look; }
      await page.eval(`void window.__setHours(${p.renderHours})`);
      const cam = await page.eval(`(() => {
        const c = window.__ctx, ph = c.physics, x = ${p.x}, z = ${p.z};
        const g = ${p.y === null ? 'ph.groundHeight(x, z, 1e9)' : p.y};
        window.__camSpec([x, g + 1.5, z, ${-p.heading}, ${p.pitch}].join(','));
        c.camera.fov = ${p.fov}; c.camera.updateProjectionMatrix();
        const s = window.__explore?.stream; const st = s ? s.settle(x, z, 'ground') : null;
        return { ground: +g.toFixed(2), l0: st?.l0 ?? null };
      })()`);
      await page.frames(8);
      await page.eval(`(() => { const c = window.__ctx; c.camera.fov = ${p.fov}; c.camera.updateProjectionMatrix(); })()`);
      await page.frames(4);
      const app = join(OUT, `app_${p.id}.png`);
      await page.shot(app);
      // [sys:10] --refine-heading: the heading (+-40 degrees) with the best edge NCC between the photo and the app: a SUGGESTION in index.json (a person confirms it, then it goes into FIX)
      if (args['refine-heading'] && existsSync(p.src)) {
        const SW = 150, SH = 200;
        const grey = async (buf) => (await sharp(buf).resize(SW, SH, { fit: 'cover' }).greyscale().raw().toBuffer());
        const ph = await grey(await sharp(p.src).rotate().toBuffer());
        const at = async (dh) => {
          await page.eval(`(() => { const c = window.__ctx; window.__camSpec([${p.x}, ${cam.ground} + 1.5, ${p.z}, ${-(p.heading + dh)}, ${p.pitch}].join(',')); c.camera.fov = ${p.fov}; c.camera.updateProjectionMatrix(); })()`);
          await page.frames(3);
          return edgeNcc(ph, await grey(await page.shot()), SW, SH);
        };
        const scores = {};
        for (const dh of headingGrid()) scores[dh] = await at(dh);
        let best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
        for (const dh of headingGrid(Number(best[0]))) scores[dh] = await at(dh);
        best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
        p.suggestHeading = { dh: Number(best[0]), heading: Math.round((p.heading + Number(best[0]) + 360) % 360), score: +best[1].toFixed(3), score0: +scores[0].toFixed(3), note: 'suggestion only: confirm it on the pair before it goes into FIX' };
        console.log(`${p.id}: heading suggestion dh ${p.suggestHeading.dh} (score ${p.suggestHeading.score} vs ${p.suggestHeading.score0} as tagged)`);
        await page.eval(`(() => { const c = window.__ctx; window.__camSpec([${p.x}, ${cam.ground} + 1.5, ${p.z}, ${-p.heading}, ${p.pitch}].join(',')); c.camera.fov = ${p.fov}; c.camera.updateProjectionMatrix(); })()`);
        await page.frames(3);
      }
      if (existsSync(p.src)) {
        const a = await sharp(p.src).rotate().resize({ height: H, width: W, fit: 'cover' }).toBuffer();
        const b = await sharp(app).resize(W, H).toBuffer();
        const hh = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
        const label = Buffer.from(`<svg width="${W * 2}" height="40"><rect width="100%" height="40" fill="rgba(0,0,0,0.55)"/><text x="12" y="27" font-size="18" font-family="Helvetica" fill="#fff">${p.id}  ${p.date.slice(5).replace(':', '-')} ${hh(p.hours)}  ENU (${p.x.toFixed(1)}, ${p.z.toFixed(1)})  h ${p.heading.toFixed(0)}°  ${p.f35} mm  eye ${(cam.ground + 1.5).toFixed(1)} m${p.fix ? '  [corrected]' : ''}</text><text x="${W + 12}" y="27" font-size="18" font-family="Helvetica" fill="#fff">app (photo left)  ${p.look !== 'none' ? 'look: ' + p.look + ' ' : ''}${hh(p.renderHours)}</text></svg>`);
        await sharp({ create: { width: W * 2, height: H, channels: 3, background: '#000' } }).composite([{ input: a, left: 0, top: 0 }, { input: b, left: W, top: 0 }, { input: label, left: 0, top: H - 40 }]).jpeg({ quality: 84 }).toFile(join(OUT, `pair_${p.id}.jpg`));
      }
      const { src: _src, ...keep } = p; void _src;
      used.push({ ...keep, ground: cam.ground, l0: cam.l0 });
      console.log(`${p.id}: (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) h${p.heading.toFixed(0)} f${p.f35} ${p.look} ${p.renderHours.toFixed(2)} ground ${cam.ground} L0 ${cam.l0}`);
    }
    const errs = page.errors(); if (errs.length) console.log('PAGE ERRORS:', errs.length, errs.slice(0, 5).map((e) => e.text.slice(0, 300)));
    // --only / --new merge into the existing index
    let all = used; const ip = join(OUT, 'index.json');
    if ((args.only || args.new) && existsSync(ip)) { const old = JSON.parse(await Bun.file(ip).text()).photos || []; const ids = new Set(used.map((p) => p.id)); all = [...old.filter((p) => !ids.has(p.id)), ...used].sort((a, b) => a.id.localeCompare(b.id)); }
    writeFileSync(ip, JSON.stringify({ note: 'Cameras of the photo / app pairs (tools/anime/photo-pairs.mjs). The photos are raw/author-photos and raw/author-photos/drive-1003 (gitignored); pair_*.jpg embed them and are gitignored here. Each camera names its look and clock (look, renderHours).', looks: legacy ? null : { photo: '17:20 overcast dusk (2026-10-01)', sunny: 'the photo clock, sunny (2026-10-02)', dawn: 'the photo clock, dawn (2026-10-02)', none: 'the photo clock, no look' }, weather: legacy ? args.weather || 'cloudy' : null, photos: all }, null, 1));
  } catch (e) {
    console.log('PAIRS FAILED:', e.message); process.exitCode = 1;
  } finally {
    await browser?.close(); srv.stop();
  }
}
