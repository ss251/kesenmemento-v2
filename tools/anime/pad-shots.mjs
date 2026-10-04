// [v7:pad] Phone screenshots of the touch pad into docs/shots/mobile/: portrait and landscape for walk, fly and drive, the stick in
// use (RUN ring), the settings and the first-run coach mark. Real touches through CDP; iPhone-shaped page (DPR 2 keeps the files small).
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/pad-shots.mjs [--port 8981] [--out docs/shots/mobile] [--dpr 2]
//     [--only coach,walk,fly,drive,settings] [--q lang=en --prefix en_]
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { buildAndServe, launch, phonePage, setViewport, enterTown, fingers, center, layoutReport, sleep, ROOT } from './pad-lib.mjs';
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : '1'] : null)).filter(Boolean));
const port = Number(args.port || 8981), out = resolve(ROOT, args.out || 'docs/shots/mobile'), dpr = Number(args.dpr || 2);
const PORTRAIT = { width: 390, height: 844, dpr, insets: { top: 47, bottom: 34, left: 0, right: 0 } };
const LANDSCAPE = { width: 844, height: 390, dpr, insets: { top: 0, bottom: 21, left: 47, right: 47 } };
const prefix = args.prefix || '', only = new Set((args.only || 'coach,walk,fly,drive,settings').split(','));
const { srv } = await buildAndServe(port);
let browser;
try {
  browser = await launch({ quiet: true });
  const page = await phonePage(browser, PORTRAIT);
  const f = await enterTown(page, `${srv.url}index.html${args.q ? '?' + args.q : ''}`);
  await sleep(1300);
  await page.eval("window.__camSpec('walk')");
  await page.waitFor('window.__pad && !window.__pad.hidden', { timeout: 20000 });
  const shot = async (name) => { await sleep(500); const buf = await page.shot(); await sharp(buf).png({ palette: true, quality: 94, effort: 8, dither: 0.6 }).toFile(join(out, prefix + name + '.png')); console.log('saved', name, JSON.stringify((await layoutReport(page)).overlaps)); };
  const setMode = async (m) => { await page.eval(`(() => { const e = window.__explore, p = window.__ctx.playerObj; if (e.drive.active) e.drive.exit(); p.fly = ${m === 'fly'}; if (${m === 'drive'}) e.drive.enter(); })()`); await sleep(1100); };
  const ORI = { portrait: PORTRAIT, landscape: LANDSCAPE };
  // coach mark, first run (a fresh profile): portrait then landscape
  await sleep(900);
  if (only.has('coach')) { await shot('coach_portrait'); await setViewport(page, LANDSCAPE); await sleep(900); await shot('coach_landscape'); }
  await page.eval('window.__pad.dismissCoach()');
  for (const [ori, vp] of Object.entries(ORI)) {
    await setViewport(page, vp); await sleep(900);
    for (const mode of ['walk', 'fly', 'drive'].filter((m) => only.has(m))) {
      await page.eval("window.__camSpec('walk')");
      await setMode(mode);
      if (mode === 'walk') {
        await shot(`walk_${ori}`);
        // the thumb on the stick, past 85 %: the ring turns coral (RUN); the other thumb on the look
        const W = vp.width, H = vp.height, sx = ori === 'portrait' ? 96 : 130, sy = ori === 'portrait' ? 560 : 250;
        await f.down1(1, sx, sy); await f.drag(1, sx + 14, sy - 62, 6); await sleep(500);
        await shot(`walk_${ori}_stick_run`);
        await f.up(1); void W; void H;
      } else if (mode === 'fly') {
        await shot(`fly_${ori}`);
        const up = await center(page, '#klc-pad .btn[data-id="up"]'); await f.down1(2, up.x, up.y); await sleep(500);
        await shot(`fly_${ori}_rise`); await f.up(2);
      } else {
        await shot(`drive_${ori}`);
        const sx = ori === 'portrait' ? 96 : 130, sy = ori === 'portrait' ? 560 : 250;
        await f.down1(1, sx, sy); await f.drag(1, sx, sy - 70, 6); await sleep(2600);
        await shot(`drive_${ori}_boost`);
        await f.up(1);
      }
    }
    await page.eval('window.__explore.drive.exit()');
  }
  // the settings sheet and the left-handed layout
  if (only.has('settings')) {
  await setViewport(page, PORTRAIT); await sleep(700);
  await page.eval("window.__camSpec('walk')"); await setMode('walk');
  const gear = await center(page, '#klc-pad .gear'); await f.tap(gear.x, gear.y); await sleep(500);
  await shot('settings_portrait');
  const sw = await center(page, '#klc-pad .sw[data-set="leftHanded"]'); await f.tap(sw.x, sw.y); await sleep(400);
  await f.tap(gear.x, gear.y); await sleep(700);
  await shot('walk_portrait_lefthanded');
  await page.eval("window.__pad.setSetting('leftHanded', false)");
  }
  console.log('errors', JSON.stringify(page.errors().filter((e) => !/api\/live/.test(e.text)).slice(0, 5)));
} finally { await browser?.close(); srv.stop(); }
