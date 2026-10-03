// [v5:photos] Side-by-side pairs of the author's ground-truth phone photos (raw/photos-sailesh, 2026-10-01 17:07-17:22
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
// [v5:photos3] Two batches: raw/photos-sailesh/index.json (2026-10-01, IMG_0792-0842) and the author's second drive
// raw/photos-sailesh/drive-1003/index.json (2026-10-02; 24 of its 48 repeat the first batch, the first batch's entry wins).
// `--new 1` renders only the second batch's new photos. The look is chosen per photo (`--look auto`, the default): the
// first batch's overcast dusk keeps `photo` (17:20), the 10-02 daytime shots get `sunny` and the dawn market shots `dawn`
// at the photo's own clock, and a night shot gets no look at its own clock. `--look photo` forces one look for all.
import { join, resolve } from 'node:path';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
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

/** [v5:photos3] The photo batches, oldest first (a photo in both keeps the first batch's entry). */
export const BATCHES = [
  { id: 1, dir: 'raw/photos-sailesh', note: '2026-10-01 17:07-17:22 JST, IMG_0792-0842' },
  { id: 2, dir: 'raw/photos-sailesh/drive-1003', note: 'drive 2026-10-03: 2026-10-01 13:30 (IMG_0774) and 2026-10-02 06:48-21:11 JST; 24 new' },
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
    writeFileSync(ip, JSON.stringify({ note: 'Cameras of the photo / app pairs (tools/anime/photo-pairs.mjs). The photos are raw/photos-sailesh and raw/photos-sailesh/drive-1003 (gitignored); pair_*.jpg embed them and are gitignored here. Each camera names its look and clock (look, renderHours).', looks: legacy ? null : { photo: '17:20 overcast dusk (2026-10-01)', sunny: 'the photo clock, sunny (2026-10-02)', dawn: 'the photo clock, dawn (2026-10-02)', none: 'the photo clock, no look' }, weather: legacy ? args.weather || 'cloudy' : null, photos: all }, null, 1));
  } catch (e) {
    console.log('PAIRS FAILED:', e.message); process.exitCode = 1;
  } finally {
    await browser?.close(); srv.stop();
  }
}
