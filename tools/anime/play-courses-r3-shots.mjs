// [play:courses] Round 3 proof. Chrome, because the HUD is HTML.
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/play-courses-r3-shots.mjs [--port 9477]
// Shot mode freezes the frame clock, so the countdown and the race advance
// through __simTo. A fresh profile, and the stored best is cleared, so the
// card is this run (about half a minute of paced rings), not a 2 s teleport.
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import { build, serve, launch } from './cdp.mjs';

const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : '1') : d; };
const port = Number(arg('port', 9477));
const only = arg('only', 'all');
const langs = (arg('lang', 'ja,en') || 'ja,en').split(',');
if (port < 9475 || port > 9479) throw new Error('courses lane ports are 9475-9479');
const OUT = join(import.meta.dir, '../../docs/play/shots/play-courses');
mkdirSync(OUT, { recursive: true });
const tmp = join(OUT, '.r3-tmp');
mkdirSync(tmp, { recursive: true });

const dist = join(import.meta.dir, '../../dist/anime-' + port);
console.error(JSON.stringify(await build({ outdir: dist, quiet: true })));
const srv = serve({ port, dist });
const browser = await launch({ quiet: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function jpg(page, name) {
  const png = join(tmp, name + '.png');
  await page.shot(png);
  const dest = join(OUT, name + '.jpg');
  const r = Bun.spawnSync(['ffmpeg', '-y', '-i', png, '-q:v', '5', dest], { stdout: 'ignore', stderr: 'pipe' });
  if (r.exitCode !== 0) throw new Error('ffmpeg ' + name + ' ' + r.stderr.toString().slice(0, 300));
  rmSync(png, { force: true });
  console.error('saved', dest);
}

async function metrics(page, w, h, dpr) {
  await page.S('Emulation.setDeviceMetricsOverride', {
    width: w, height: h, deviceScaleFactor: dpr, mobile: dpr > 1,
    screenWidth: w, screenHeight: h,
  });
}

async function boot(page, lang, w, h, dpr) {
  await metrics(page, w, h, dpr);
  await page.S('Page.addScriptToEvaluateOnNewDocument', {
    source: `try { localStorage.removeItem('klc.play.v1'); } catch (e) {}`,
  });
  await page.goto(`${srv.url}index.html?shot=1&lang=${lang}&t=0&w=${w}&h=${h}&q=${dpr > 1 ? 'phone' : 'high'}`);
  await page.waitFor('window.__ready === true && window.__race && window.__race.courses.length === 3', { timeout: 180000 });
  await page.eval(`(() => { document.body.classList.add('playing'); try { localStorage.removeItem('klc.play.v1'); } catch (e) {} window.__lifeSet && window.__lifeSet('hiru'); window.__shotSim = 0; return 1; })()`);
  await page.frames(3);
}

/** One step of the frozen shot clock. The cursor lives on the page. */
const adv = (sec, dt) => `window.__shotSim = window.__simTo(window.__shotSim + ${sec}, ${dt});`;

const OPEN = `(() => {
  ${adv(0.4, '1/60')}
  const btn = document.querySelector('#klc-play [data-act="play"]');
  if (btn) { btn.hidden = false; btn.click(); }
  const modes = [...document.querySelectorAll('#klc-play .mcard')].map((c) => c.dataset.mode);
  return { open: !document.querySelector('#klc-play .hub')?.hidden, modes };
})()`;

const FOCUS = `(() => {
  const card = document.querySelector('#klc-play .mcard[data-mode="course-anba"]');
  if (card) card.scrollIntoView({ inline: 'center', block: 'nearest' });
  const img = card && card.querySelector('img');
  const title = card && card.querySelector('h3') ? card.querySelector('h3').textContent : '';
  return { title, img: !!(img && img.naturalWidth > 0), src: img ? img.currentSrc || img.src : '' };
})()`;

const CLOSE = `(() => {
  const x = document.querySelector('#klc-play .hub [data-act="x"]');
  if (x) x.click();
  return { open: !document.querySelector('#klc-play .hub')?.hidden };
})()`;

const ARM = `(() => {
  window.__race.start('anba');
  ${adv(0.08, '1/30')}
  const count = document.querySelector('#klc-play .count');
  return { count: count && !count.hidden ? count.textContent : '', sim: window.__shotSim };
})()`;

const LIVE = `(() => {
  ${adv(3, 0.1)}
  const hud = document.querySelector('#course-hud:not([hidden])');
  return { live: !!hud, time: hud ? hud.querySelector('.time').textContent : '', sim: window.__shotSim };
})()`;

const COACH = `(() => {
  const g = window.__race.courses.find((x) => x.id === 'anba').gates[0];
  const px = g.x + g.nx * -18, pz = g.z + g.nz * -18;
  window.__camSpec(px + ',' + g.y + ',' + pz + '>' + g.x + ',' + g.y + ',' + g.z);
  ${adv(0.6, 0.05)}
  const coach = document.querySelector('#klc-play .coach');
  return {
    say: document.querySelector('#klc-play .coach .say p')?.textContent || '',
    hidden: !coach || coach.hidden,
    dim: !!(coach && coach.classList.contains('dim')),
  };
})()`;

const PASS0 = `(() => {
  const g = window.__race.courses.find((x) => x.id === 'anba').gates[0];
  const place = (s) => window.__setCam(g.x + g.nx * s, g.y, g.z + g.nz * s, 0, -8);
  ${adv(1.2, 0.1)}
  place(-3);
  ${adv(0.05, '1/30')}
  place(4);
  ${adv(0.05, '1/30')}
  const eye = g.y;
  const px = g.x + g.nx * 8, pz = g.z + g.nz * 8;
  window.__camSpec(px + ',' + eye + ',' + pz + '>' + g.x + ',' + g.y + ',' + g.z);
  const line = document.querySelector('#course-hud .line')?.textContent || '';
  const time = document.querySelector('#course-hud .time')?.textContent || '';
  const btn = document.querySelector('#klc-play .cluster [data-id="quit"]') || document.querySelector('#course-quit .face');
  const box = btn ? btn.getBoundingClientRect() : null;
  return {
    line, time,
    quit: box ? { w: Math.round(box.width), h: Math.round(box.height) } : null,
    label: document.querySelector('#klc-play .cluster [data-id="quit"] .lb')?.textContent || '',
  };
})()`;

const FINISH = `(() => {
  const gates = window.__race.courses.find((x) => x.id === 'anba').gates;
  const place = (g, s) => window.__setCam(g.x + g.nx * s, g.y, g.z + g.nz * s, 0, -8);
  const line = () => document.querySelector('#course-hud .line')?.textContent || '';
  const passed = [];
  for (let i = 1; i < gates.length; i++) {
    ${adv(2.5, 0.1)}
    place(gates[i], -3);
    ${adv(0.05, '1/30')}
    place(gates[i], 4);
    ${adv(0.05, '1/30')}
    passed.push(line());
  }
  ${adv(2.6, 0.1)}
  const panel = document.querySelector('#klc-play .veil.results .panel');
  return {
    lines: passed,
    time: document.querySelector('#course-hud .time')?.textContent || '',
    card: panel ? panel.innerText.replace(/\\s+/g, ' ').trim() : '',
    medal: document.querySelector('#klc-play .veil.results .medal')?.textContent || '',
    hanko: document.querySelector('#klc-play .veil.results .hanko')?.textContent || '',
  };
})()`;

try {
  for (const lang of langs) {
    const errs = [];
    if (only !== 'phone') {
      const desk = await browser.page({ width: 1440, height: 900, dpr: 1 });
      await boot(desk, lang, 1440, 900, 1);
      const hub = await desk.eval(OPEN);
      console.error(lang, 'hub', JSON.stringify(hub));
      if (!hub.open || !hub.modes.includes('course-anba')) throw new Error(lang + ' hub has no course card');
      await desk.frames(8);
      const focus = await desk.eval(FOCUS);
      console.error(lang, 'hub card', JSON.stringify(focus));
      if (!focus.img) throw new Error(lang + ' course still did not load');
      await jpg(desk, `r3-hub-desktop-${lang}`);
      await desk.eval(CLOSE);
      const armed = await desk.eval(ARM);
      console.error(lang, 'count', JSON.stringify(armed));
      await desk.frames(2);
      await jpg(desk, `r3-count-desktop-${lang}`);
      const live = await desk.eval(LIVE);
      console.error(lang, 'live', JSON.stringify(live));
      if (!live.live) throw new Error(lang + ' never went live');
      const coach = await desk.eval(COACH);
      console.error(lang, 'coach', JSON.stringify(coach));
      if (coach.hidden) throw new Error(lang + ' coach did not show');
      const want = lang === 'en' ? 'Fly through the ring' : 'リングを くぐろう';
      if (coach.say !== want) throw new Error(lang + ' coach said ' + JSON.stringify(coach.say));
      await desk.frames(2);
      await jpg(desk, `r3-coach-desktop-${lang}`);
      const hud = await desk.eval(PASS0);
      console.error(lang, 'hud', JSON.stringify(hud));
      if (!/1\//.test(hud.line)) throw new Error(lang + ' first ring did not pass: ' + hud.line);
      await sleep(450);
      await desk.frames(2);
      await jpg(desk, `r3-hud-desktop-${lang}`);
      const card = await desk.eval(FINISH);
      console.error(lang, 'card', JSON.stringify(card));
      if (!card.medal) throw new Error(lang + ' card has no medal: ' + card.card);
      if (!card.hanko) throw new Error(lang + ' card has no stamp: ' + card.card);
      if (card.card.includes('0:02')) throw new Error(lang + ' card is the short test best: ' + card.card);
      await sleep(700);
      await desk.frames(2);
      await jpg(desk, `r3-card-desktop-${lang}`);
      await metrics(desk, 393, 852, 3);
      await sleep(300);
      await jpg(desk, `r3-card-phone-${lang}`);
      errs.push(...desk.errors());
    }
    if (only !== 'desk') {
      const phone = await browser.page({ width: 393, height: 852, dpr: 3 });
      await boot(phone, lang, 393, 852, 3);
      const hubP = await phone.eval(OPEN);
      console.error(lang, 'phone hub', JSON.stringify(hubP));
      if (!hubP.open || !hubP.modes.includes('course-anba')) throw new Error(lang + ' phone hub has no course card');
      await phone.eval(FOCUS);
      await phone.frames(8);
      const focusP = await phone.eval(FOCUS);
      if (!focusP.img) throw new Error(lang + ' phone course still did not load');
      await jpg(phone, `r3-hub-phone-${lang}`);
      await phone.eval(CLOSE);
      const armedP = await phone.eval(ARM);
      console.error(lang, 'phone count', JSON.stringify(armedP));
      await phone.frames(2);
      await jpg(phone, `r3-count-phone-${lang}`);
      const liveP = await phone.eval(LIVE);
      if (!liveP.live) throw new Error(lang + ' phone never went live');
      const coachP = await phone.eval(COACH);
      console.error(lang, 'phone coach', JSON.stringify(coachP));
      if (coachP.hidden) throw new Error(lang + ' phone coach did not show');
      const wantP = lang === 'en' ? 'Fly through the ring' : 'リングを くぐろう';
      if (coachP.say !== wantP) throw new Error(lang + ' phone coach said ' + JSON.stringify(coachP.say));
      await phone.frames(2);
      await jpg(phone, `r3-coach-phone-${lang}`);
      const hudP = await phone.eval(PASS0);
      console.error(lang, 'phone hud', JSON.stringify(hudP));
      if (!/1\//.test(hudP.line)) throw new Error(lang + ' phone first ring did not pass: ' + hudP.line);
      await sleep(450);
      await phone.frames(2);
      await jpg(phone, `r3-hud-phone-${lang}`);
      errs.push(...phone.errors());
    }
    console.error(lang, 'errors', JSON.stringify(errs.slice(0, 4)));
  }
} finally {
  try { await browser.close(); } catch { /* gone */ }
  try { srv.stop(); } catch { /* gone */ }
  rmSync(tmp, { recursive: true, force: true });
}
