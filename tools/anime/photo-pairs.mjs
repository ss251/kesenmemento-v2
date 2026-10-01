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
const PHOTOS = join(ROOT, 'raw/photos-sailesh');

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

export function enu(lat, lon) { return [(lon - 141.575) * 86744, -(lat - 38.906) * 111014]; }
export const vfov = (f35) => 2 * Math.atan(17.31 / f35) * 180 / Math.PI;   // [v5:detail] diagonal-matched 35 mm equivalent

if (import.meta.main) await main();   // importable (tests use enu / vfov / FIX) without running the tool

async function main() {
  const index = JSON.parse(await Bun.file(join(PHOTOS, 'index.json')).text());
  let list = index.map((p) => {
    const id = p.SourceFile.split('/').pop().replace(/\.\w+$/, '');
    const [x, z] = enu(p.GPSLatitude, p.GPSLongitude);
    const fx = FIX[id] || {};
    const hhmm = p.DateTimeOriginal.split(' ')[1].split(':').map(Number);
    return { id, gps: [+x.toFixed(1), +z.toFixed(1)], x: fx.x ?? x, z: fx.z ?? z, y: fx.y ?? null, heading: p.GPSImgDirection + (fx.dh || 0), f35: p.FocalLengthIn35mmFormat, fov: +vfov(p.FocalLengthIn35mmFormat).toFixed(2), pitch: fx.pitch ?? PITCH[id] ?? 3, hours: hhmm[0] + hhmm[1] / 60, fix: fx.why || null };
  });
  if (args.only) { const want = new Set(String(args.only).split(',').map((s) => 'IMG_' + s.replace(/^IMG_/, ''))); list = list.filter((p) => want.has(p.id)); }
  mkdirSync(OUT, { recursive: true });

  const dist = join(ROOT, `dist/anime-${port}`);
  if (!args.nobuild) { const r = await build({ outdir: dist }); console.log(`build ${r.reused ? 'FAILED (reused the last good build)' : 'ok'} ${r.ms ?? ''} ms`); }
  const srv = serve({ port, dist });
  let browser; const used = [];
  try {
    browser = await launch({ quiet: !args.verbose });
    const page = await browser.page({ width: W, height: H });
    // [v5:detail] the photo look by default (overcast dusk 17:20 JST, 2026-10-01, interiors lit); --hours / --weather go back
    // to the clock-and-weather lighting (the v5 pairs used 16:30 cloudy)
    const look = args.look ?? (args.hours || args.weather ? 'none' : 'photo');
    const hours0 = args.hours ? Number(args.hours) : look === 'photo' ? 17 + 20 / 60 : 16.5;
    const q = new URLSearchParams({ shot: '1', w: String(W), h: String(H), t: '0', q: args.q || 'high', fov: '60', hours: String(hours0) });
    if (look !== 'none') q.set('look', look); else q.set('weather', args.weather || 'cloudy');
    if (args.query) for (const [k, v] of new URLSearchParams(args.query)) q.set(k, v);
    await page.goto(`${srv.url}index.html?${q}`);
    await page.waitFor('window.__ready === true', { timeout: 280000 });
    for (const p of list) {
      if (args['photo-time']) await page.eval(`window.__setHours(${p.hours})`);
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
      const src = join(PHOTOS, 'jpg', `${p.id}.jpg`);
      if (existsSync(src)) {
        const a = await sharp(src).rotate().resize({ height: H, width: W, fit: 'cover' }).toBuffer();
        const b = await sharp(app).resize(W, H).toBuffer();
        const label = Buffer.from(`<svg width="${W * 2}" height="40"><rect width="100%" height="40" fill="rgba(0,0,0,0.55)"/><text x="12" y="27" font-size="20" font-family="Helvetica" fill="#fff">${p.id}  ENU (${p.x.toFixed(1)}, ${p.z.toFixed(1)})  heading ${p.heading.toFixed(0)}°  ${p.f35} mm  eye ${(cam.ground + 1.5).toFixed(1)} m${p.fix ? '  [GPS corrected]' : ''}</text><text x="${W + 12}" y="27" font-size="20" font-family="Helvetica" fill="#fff">app (photo left)${look !== 'none' ? '  look: ' + look : ''}</text></svg>`);
        await sharp({ create: { width: W * 2, height: H, channels: 3, background: '#000' } }).composite([{ input: a, left: 0, top: 0 }, { input: b, left: W, top: 0 }, { input: label, left: 0, top: H - 40 }]).jpeg({ quality: 84 }).toFile(join(OUT, `pair_${p.id}.jpg`));
      }
      used.push({ ...p, ground: cam.ground, l0: cam.l0 });
      console.log(`${p.id}: (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) h${p.heading.toFixed(0)} f${p.f35} ground ${cam.ground} L0 ${cam.l0}`);
    }
    const errs = page.errors(); if (errs.length) console.log('PAGE ERRORS:', errs.length, errs.slice(0, 5).map((e) => e.text.slice(0, 300)));
    // --only merges into the existing index
    let all = used; const ip = join(OUT, 'index.json');
    if (args.only && existsSync(ip)) { const old = JSON.parse(await Bun.file(ip).text()).photos || []; const ids = new Set(used.map((p) => p.id)); all = [...old.filter((p) => !ids.has(p.id)), ...used].sort((a, b) => a.id.localeCompare(b.id)); }
    writeFileSync(ip, JSON.stringify({ note: 'Cameras of the photo / app pairs (tools/anime/photo-pairs.mjs). The photos are raw/photos-sailesh (gitignored); pair_*.jpg embed them and are gitignored here.', hours: args['photo-time'] ? 'photo time' : hours0, look: look === 'none' ? null : look, weather: look === 'none' ? args.weather || 'cloudy' : null, photos: all }, null, 1));
  } catch (e) {
    console.log('PAIRS FAILED:', e.message); process.exitCode = 1;
  } finally {
    await browser?.close(); srv.stop();
  }
}
