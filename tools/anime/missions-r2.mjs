// Round-2 stills for the quest window, the balloons, the stamp book and the tracker.
//   tools/anime/gate.sh chrome --fg env -u NODE_OPTIONS bun tools/anime/missions-r2.mjs
import { spawnSync } from 'node:child_process';
import { mkdirSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { build, serve, launch, ROOT } from './cdp.mjs';
import { phonePage } from './pad-lib.mjs';

const port = 8864;
if ([8787, 8790, 8791].includes(port)) throw new Error('port reserved');
const out = resolve(ROOT, 'docs/play/shots/missions');
mkdirSync(out, { recursive: true });
const dist = join(ROOT, `dist/anime-${port}`);
const STAMPS = ['shrine-visit', 'quay-photo', 'cape-trees', 'morning-catch'];

const built = await build({ outdir: dist, strict: false });
console.log(`build ${built.reused ? 'FAILED (reused last good build)' : 'ok'} ${built.ms ?? ''} ms`);
const srv = serve({ port, dist });

function jpg(page, name) {
  return page.shot(join(out, name + '.png')).then(() => {
    const png = join(out, name + '.png');
    const dest = join(out, name + '.jpg');
    const r = spawnSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '72', png, '--out', dest], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(r.stderr || 'sips failed');
    unlinkSync(png);
    console.log('saved', dest);
  });
}

async function shoot(browser, kind) {
  const phone = kind === 'phone';
  const page = phone
    ? await phonePage(browser, { width: 393, height: 852, dpr: 3, insets: { top: 59, bottom: 34, left: 0, right: 0 } })
    : await browser.page({ width: 1600, height: 900, dpr: 1 });
  const cssW = phone ? 393 : 1600;
  const cssH = phone ? 852 : 900;
  const dpr = phone ? 3 : 1;
  const q = new URLSearchParams({
    shot: '1', lang: 'ja', q: 'high',
    w: String(cssW * dpr), h: String(cssH * dpr),
  });
  const t0 = Date.now();
  await page.goto(`${srv.url}index.html?${q}`);
  await page.waitFor('window.__ready === true', { timeout: 280000 });
  const dirty = await page.eval(`localStorage.getItem('klc.play.v1') != null`);
  if (dirty) {
    await page.eval(`localStorage.removeItem('klc.play.v1')`);
    await page.goto(`${srv.url}index.html?${q}`);
    await page.waitFor('window.__ready === true', { timeout: 280000 });
  }
  await page.eval(`window.__missions.open('shrine')`);
  await page.frames(8);
  console.log(kind, 'ready', ((Date.now() - t0) / 1000).toFixed(1), 's');
  const cam = await page.eval(`(() => { const p = window.__ctx.camera.position; const n = window.__ctx.services.missions; return { x: +p.x.toFixed(1), y: +p.y.toFixed(1), z: +p.z.toFixed(1) }; })()`);
  console.log(kind, 'cam', JSON.stringify(cam));
  const sheet = await page.eval(`(() => {
    const s = document.querySelector('#klc-m .m-sheet');
    if (!s || s.hidden) return null;
    const b = s.getBoundingClientRect();
    const line = getComputedStyle(s.querySelector('.m-line'));
    return { w: Math.round(b.width), h: Math.round(b.height), bottom: Math.round(innerHeight - b.bottom), font: line.fontSize, text: s.querySelector('.m-line')?.innerText?.slice(0, 40) };
  })()`);
  if (!sheet) throw new Error(kind + ': dialogue sheet is not on screen');
  console.log(kind, 'sheet', JSON.stringify(sheet));
  await jpg(page, `r2-dialogue-${kind}-ja`);

  await page.eval(`window.__missions.lang('en')`);
  await page.frames(3);
  await jpg(page, `r2-dialogue-${kind}-en`);

  await page.eval(`window.__missions.close(); window.__missions.near('barista')`);
  await page.frames(10);
  const marks = await page.eval(`(() => {
    const p = window.__ctx.camera.position;
    const nodes = [...document.querySelectorAll('#klc-m .m-balloon')].filter((n) => !n.hidden);
    return { cam: [+p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1)], marks: nodes.map((n) => n.textContent + ' ' + Math.round(n.getBoundingClientRect().width) + 'px') };
  })()`);
  console.log(kind, 'balloons', JSON.stringify(marks));
  if (!marks.marks?.length) console.log(kind, 'WARNING no balloon');
  await jpg(page, `r2-balloon-${kind}-ja`);
  await page.eval(`window.__missions.lang('en')`);
  await page.frames(2);
  await jpg(page, `r2-balloon-${kind}-en`);

  await page.eval(`window.__missions.park(); window.__missions.lang('ja'); window.__missions.stamps(${JSON.stringify(STAMPS)})`);
  await page.frames(4);
  const seals = await page.eval(`document.querySelectorAll('#klc-m .m-hanko').length`);
  console.log(kind, 'seals', seals);
  if (!seals) throw new Error(kind + ': stamp book is empty');
  await jpg(page, `r2-stamps-${kind}-ja`);
  await page.eval(`window.__missions.lang('en'); window.__missions.stamps(${JSON.stringify(STAMPS)})`);
  await page.frames(3);
  await jpg(page, `r2-stamps-${kind}-en`);

  await page.eval(`window.__missions.close(); window.__missions.flash('shrine-visit')`);
  await page.frames(6);
  const lit = await page.eval(`!!document.querySelector('#klc-m .m-track.m-lit:not([hidden])')`);
  console.log(kind, 'tracker lit', lit);
  if (!lit) console.log(kind, 'WARNING tracker is not gold');
  await jpg(page, `r2-flash-${kind}-ja`);
  await page.eval(`window.__missions.lang('en')`);
  await page.frames(3);
  await jpg(page, `r2-flash-${kind}-en`);

  const errs = page.errors();
  if (errs.length) {
    console.log(kind, 'PAGE ERRORS');
    for (const l of errs.slice(0, 12)) console.log(' ', l.type, String(l.text).slice(0, 300));
  }
  await page.goto('about:blank');
}

let browser;
try {
  browser = await launch({ quiet: true });
  await shoot(browser, 'phone');
  await shoot(browser, 'desktop');
} catch (e) {
  console.log('SHOT FAILED:', e.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
  srv.stop();
}
