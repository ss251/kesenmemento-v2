// Round-3 stills: the 「！」 at 60 m, the larger dialogue, the hub card, the first-talk coach.
// Phone 393×852 @3, desktop 1440×900, ja and en.
//   tools/anime/gate.sh chrome --fg env -u NODE_OPTIONS bun tools/anime/missions-r3.mjs
import { spawnSync } from 'node:child_process';
import { mkdirSync, unlinkSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { build, serve, launch, ROOT } from './cdp.mjs';
import { phonePage } from './pad-lib.mjs';

const port = 8872;
if ([8787, 8790, 8791].includes(port)) throw new Error('port reserved');
const out = resolve(ROOT, 'docs/play/shots/missions');
mkdirSync(out, { recursive: true });
const dist = join(ROOT, `dist/anime-${port}`);
const art = join(ROOT, 'data/play/art/quests.webp');

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

function writeArt(srcJpg) {
  mkdirSync(join(ROOT, 'data/play/art'), { recursive: true });
  const r = spawnSync('cwebp', ['-q', '68', '-resize', '800', '500', srcJpg, '-o', art], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr || 'cwebp failed');
  const kb = statSync(art).size / 1024;
  console.log('art', art, kb.toFixed(1), 'KB');
  if (kb > 40) throw new Error('quests.webp is over 40 KB');
}

async function shoot(browser, kind) {
  const phone = kind === 'phone';
  const page = phone
    ? await phonePage(browser, { width: 393, height: 852, dpr: 3, insets: { top: 59, bottom: 34, left: 0, right: 0 } })
    : await browser.page({ width: 1440, height: 900, dpr: 1 });
  const cssW = phone ? 393 : 1440;
  const cssH = phone ? 852 : 900;
  const dpr = phone ? 3 : 1;
  const minType = phone ? 15 : 16;
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
  const sheet = await page.eval(`(() => {
    const s = document.querySelector('#klc-m .m-sheet');
    if (!s || s.hidden) return null;
    const b = s.getBoundingClientRect();
    const line = getComputedStyle(s.querySelector('.m-line'));
    return { w: Math.round(b.width), h: Math.round(b.height), font: parseFloat(line.fontSize), text: s.querySelector('.m-line')?.innerText?.slice(0, 24) };
  })()`);
  if (!sheet) throw new Error(kind + ': dialogue sheet is not on screen');
  if (sheet.font < minType) throw new Error(kind + ': dialogue is ' + sheet.font + 'px');
  console.log(kind, 'sheet', JSON.stringify(sheet));
  await jpg(page, `r3-dialogue-${kind}-ja`);
  if (!phone) writeArt(join(out, `r3-dialogue-${kind}-ja.jpg`));

  await page.eval(`window.__missions.lang('en')`);
  await page.frames(3);
  await jpg(page, `r3-dialogue-${kind}-en`);

  await page.eval(`window.__missions.lang('ja'); window.__missions.close(); window.__missions.away('barista', 60)`);
  await page.frames(12);
  const marks = await page.eval(`(() => {
    const cam = window.__ctx.camera.position;
    const n = window.__ctx.services.missions;
    const npc = (n.state && null);
    const nodes = [...document.querySelectorAll('#klc-m .m-bang')].filter((el) => !el.hidden);
    const rings = [...document.querySelectorAll('#klc-m .m-ring')].filter((el) => !el.hidden);
    const p = window.__ctx.player && window.__ctx.player.position;
    return {
      cam: [+cam.x.toFixed(1), +cam.y.toFixed(1), +cam.z.toFixed(1)],
      player: p ? [+p.x.toFixed(1), +p.z.toFixed(1)] : null,
      bangs: nodes.map((el) => ({ t: el.textContent, w: Math.round(el.getBoundingClientRect().width) })),
      rings: rings.length,
      fov: +window.__ctx.camera.fov.toFixed(1),
    };
  })()`);
  console.log(kind, 'away', JSON.stringify(marks));
  const bang = marks.bangs.find((b) => b.t.includes('！')) || marks.bangs[0];
  if (!bang || bang.w < 22) throw new Error(kind + ': 「！」 at 60 m is ' + (bang ? bang.w + 'px' : 'missing'));
  await jpg(page, `r3-balloon-${kind}-ja`);
  await page.eval(`window.__missions.lang('en')`);
  await page.frames(2);
  await jpg(page, `r3-balloon-${kind}-en`);

  await page.eval(`window.__missions.lang('ja'); window.__missions.coach('barista')`);
  await page.frames(8);
  const coach = await page.eval(`(() => {
    const c = document.querySelector('#klc-m .m-coach');
    const arrow = document.querySelector('#klc-play .arrow');
    const edge = document.querySelector('#klc-m .m-edge');
    const bang = [...document.querySelectorAll('#klc-m .m-bang')].filter((el) => !el.hidden);
    return {
      text: c && !c.hidden ? c.textContent : '',
      kitArrow: !!(arrow && !arrow.hidden),
      edge: !!(edge && !edge.hidden),
      bang: bang.length,
    };
  })()`);
  console.log(kind, 'coach', JSON.stringify(coach));
  if (coach.text !== '話しかけて みよう') throw new Error(kind + ': coach text ' + coach.text);
  if (!coach.bang) throw new Error(kind + ': coach has no 「！」');
  await jpg(page, `r3-coach-${kind}-ja`);
  await page.eval(`window.__missions.lang('en'); window.__missions.coach('barista')`);
  await page.frames(3);
  const coachEn = await page.eval(`document.querySelector('#klc-m .m-coach')?.textContent`);
  if (coachEn !== 'Try saying hello') throw new Error(kind + ': coach en ' + coachEn);
  await jpg(page, `r3-coach-${kind}-en`);

  await page.eval(`window.__missions.lang('ja'); window.__missions.hub()`);
  await page.frames(6);
  const hub = await page.eval(`(() => {
    const img = document.querySelector('#klc-m .m-hub-still img');
    return {
      title: document.querySelector('#klc-m .m-hub-title')?.textContent,
      go: document.querySelector('#klc-m .m-hub-go')?.textContent,
      progress: document.querySelector('#klc-m .m-hub-progress')?.textContent,
      chips: document.querySelectorAll('#klc-m .m-chip').length,
      art: img ? img.naturalWidth : 0,
    };
  })()`);
  console.log(kind, 'hub', JSON.stringify(hub));
  if (hub.title !== 'クエスト' || hub.art < 8) throw new Error(kind + ': hub card ' + JSON.stringify(hub));
  await jpg(page, `r3-hub-${kind}-ja`);
  await page.eval(`window.__missions.lang('en'); window.__missions.hub()`);
  await page.frames(3);
  await jpg(page, `r3-hub-${kind}-en`);

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
  await shoot(browser, 'desktop');
  await shoot(browser, 'phone');
} catch (e) {
  console.log('SHOT FAILED:', e.stack || e.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
  srv.stop();
}
