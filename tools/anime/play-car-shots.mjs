// Stills of the car lane: garage, a drift, the night race. Phone 393×852 @3x and desktop 1600×900, ja and en.
//   tools/anime/gate.sh run  env -u NODE_OPTIONS bun tools/anime/play-car-shots.mjs --port 9495 --build-only
//   tools/anime/gate.sh chrome --fg env -u NODE_OPTIONS bun tools/anime/play-car-shots.mjs --port 9495 --nobuild
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { build, serve, launch, ROOT } from './cdp.mjs';

const argv = process.argv.slice(2);
const flag = (k) => argv.includes('--' + k);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const port = Number(arg('port', 9495));
const out = arg('out', join(ROOT, 'docs/play/shots/play-car'));
mkdirSync(out, { recursive: true });
const dist = join(ROOT, `dist/anime-${port}`);

if (!flag('nobuild')) {
  console.log('build', JSON.stringify(await build({ outdir: dist, quiet: true })));
}
if (flag('build-only')) process.exit(0);

const srv = serve({ port, dist });
const browser = await launch({ quiet: true });

const seedJs = `(() => {
  const L = window.__ctx && window.__ctx.L;
  const samples = window.__raceSamples;
  if (!samples) return 'no-samples';
  const at = (dist) => {
    let i = 0;
    while (i < samples.length - 1 && samples[i + 1][2] < dist) i++;
    const a = samples[i], b = samples[Math.min(samples.length - 1, i + 1)];
    const span = Math.max(0.001, b[2] - a[2]);
    const u = Math.max(0, Math.min(1, (dist - a[2]) / span));
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  };
  const ghost = [];
  const n = 90;
  for (let k = 0; k < n; k++) {
    const p = at(k * 1.5), q = at(k * 1.5 + 1.5);
    const yaw = Math.atan2(-(q[0] - p[0]), -(q[1] - p[1]));
    const y = L && L.heightAt ? L.heightAt(p[0], p[1]) : 1;
    ghost.push(+p[0].toFixed(2), +p[1].toFixed(2), +y.toFixed(2), +yaw.toFixed(3));
  }
  const state = { v: 1, katsuo: { found: {} }, courses: {}, fish: {}, meta: { firstRun: '2026-10-07T08:00:00.000Z', car: {
    assist: true,
    look: { paint: 'akane', livery: 'tairyo', wheel: 'spoke', roof: 'surf', plate: 'tairyo' },
    unlocked: { 'car.paint.kon': true, 'car.livery.tairyo': true, 'car.wheel.spoke': true, 'car.roof.surf': true },
    race: { ghost, ghostCount: n, bestLapMs: 118000, bestMs: 400000, medal: 'silver' },
  } } };
  localStorage.setItem('klc.play.v1', JSON.stringify(state));
  return ghost.length;
})()`;

const KEY = { KeyW: { key: 'w', vk: 87 }, KeyA: { key: 'a', vk: 65 }, KeyD: { key: 'd', vk: 68 }, Space: { key: ' ', vk: 32 }, ShiftLeft: { key: 'Shift', vk: 16 } };
// Shot mode draws frames and leaves the sim clock at 0 (main.js). __simTo is how the car actually moves.
function press(codes) {
  const downs = codes.map((c) => `window.dispatchEvent(new KeyboardEvent('keydown', { code: ${JSON.stringify(c)}, bubbles: true }))`).join(';');
  return `(function(){ ${downs}; return 1; })()`;
}
function release(codes) {
  const ups = codes.map((c) => `window.dispatchEvent(new KeyboardEvent('keyup', { code: ${JSON.stringify(c)}, bubbles: true }))`).join(';');
  return `(function(){ ${ups}; return 1; })()`;
}
async function key(page, codes, down) {
  await page.eval(down ? press(codes) : release(codes));
  for (const c of codes) {
    const m = KEY[c];
    await page.S('Input.dispatchKeyEvent', { type: down ? 'keyDown' : 'keyUp', key: m.key, code: c, windowsVirtualKeyCode: m.vk, nativeVirtualKeyCode: m.vk });
  }
}
async function sim(page, sec) {
  const state = await page.eval(`(() => {
    const cur = window.__playSim || 0;
    const next = cur + ${sec};
    window.__simTo(next);
    window.__playSim = next;
    const s = window.__explore && window.__explore.drive && window.__explore.drive.state;
    return s ? { t: next, speed: +s.speed.toFixed(2), skid: !!s.skid, slip: +((s.slipR || 0) * 180 / Math.PI).toFixed(1) } : null;
  })()`);
  console.log('sim', JSON.stringify(state));
  return state;
}

async function jpg(page, name) {
  const png = join(out, name + '.png');
  const file = join(out, name + '.jpg');
  await page.shot(png);
  const r = Bun.spawnSync(['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '62', png, '--out', file]);
  if (r.exitCode !== 0) throw new Error(r.stderr.toString().slice(0, 400));
  await Bun.spawn(['rm', '-f', png]).exited;
  console.log('saved', file);
}

async function ready(page) {
  await page.waitFor('window.__ready === true', { timeout: 280000 });
  await page.frames(8);
}

async function settle(page) {
  await page.eval('window.__explore && window.__explore.settle ? window.__explore.settle() : 1');
  await page.frames(24);
}

async function session(w, h, dpr, tag) {
  const page = await browser.page({ width: w, height: h, dpr: 1 });
  await page.S('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: w < 500, screenWidth: w, screenHeight: h });
  await page.S('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  const q = w < 500 ? 'phone' : 'high';
  const url = (lang, car, preset) => `${srv.url}index.html?shot=1&w=${w}&h=${h}&q=${q}&lang=${lang}${car ? '&car=' + car : ''}${preset ? '&preset=' + preset : ''}`;

  await page.goto(url('ja', ''));
  await ready(page);
  const samples = await page.eval(`fetch('/data/play/race-minato.json').then(r => r.json()).then(j => { window.__raceSamples = j.samples; return j.samples.length; })`);
  console.log(tag, 'samples', samples);
  const seeded = await page.eval(seedJs);
  console.log(tag, 'seed', seeded);

  if (cars.includes('garage')) for (const lang of ['ja', 'en']) {
    await page.eval(`(() => {
      const raw = localStorage.getItem('klc.play.v1');
      const state = raw ? JSON.parse(raw) : { v: 1, meta: { car: {} } };
      state.meta = state.meta || {};
      state.meta.car = Object.assign({}, state.meta.car, { unlocked: {}, look: { paint: 'yamabuki', livery: 'none', wheel: 'steel', roof: 'none', plate: 'kei' } });
      localStorage.setItem('klc.play.v1', JSON.stringify(state));
      return 1;
    })()`);
    await page.goto(url(lang, 'garage', 'hiru'));
    await ready(page);
    await settle(page);
    await page.eval(`(() => { document.body.classList.add('playing'); window.__playCar?.garage?.open?.(); return 1; })()`);
    await page.frames(8);
    await jpg(page, `garage-locked-${tag}-${lang}`);
    await page.eval(`fetch('/data/play/race-minato.json').then(r => r.json()).then(j => { window.__raceSamples = j.samples; return j.samples.length; })`);
    await page.eval(seedJs);
    await page.goto(url(lang, 'garage', 'hiru'));
    await ready(page);
    await settle(page);
    await page.eval(`(() => { document.body.classList.add('playing'); window.__playCar?.garage?.open?.(); return 1; })()`);
    await page.frames(6);
    const opened = await page.eval(`(() => {
      const d = window.__explore.drive;
      d.lookOrbit(1.15, -0.05, 80);
      d.place(0);
      const sheet = document.querySelector('#klc-play .sheet');
      if (sheet && innerWidth > 700) { sheet.style.placeItems = 'center end'; sheet.style.paddingRight = '36px'; }
      const panel = sheet && sheet.querySelector('.panel');
      return { active: d.active, show: !!(sheet && sheet.classList.contains('show')), opacity: panel ? getComputedStyle(panel).opacity : null };
    })()`);
    console.log(tag, lang, 'garage', JSON.stringify(opened));
    await jpg(page, `garage-${tag}-${lang}`);
    if (lang === 'ja') {
      const dim = await page.eval(`(() => {
        document.querySelector('#klc-play [data-act="close"]')?.click();
        const sheet = document.querySelector('#klc-play .sheet');
        const veil = document.querySelector('#klc-play .veil');
        const cs = (el) => el ? getComputedStyle(el).display : null;
        return { sheetHidden: !!sheet?.hidden, sheetDisplay: cs(sheet), veilHidden: !!veil?.hidden, veilDisplay: cs(veil) };
      })()`);
      console.log(tag, 'sheet-close', JSON.stringify(dim));
      if (dim.sheetDisplay !== 'none' || dim.veilDisplay !== 'none') throw new Error('sheet dim lingered: ' + JSON.stringify(dim));
    }
    const err = page.errors().slice(0, 4);
    if (err.length) console.log(tag, lang, 'errors', JSON.stringify(err));
  }

  if (cars.includes('drift')) for (const lang of ['ja', 'en']) {
    await page.goto(url(lang, 'drift', 'hiru'));
    await ready(page);
    await settle(page);
    await page.eval(`(() => { document.body.classList.add('playing'); window.__playSim = 0; const d = window.__explore.drive; d.setAssist(false); d.setRace(true); return !!d.active; })()`);
    // Race speed, then a handbrake long enough for the combo meter to fill.
    await key(page, ['KeyW', 'ShiftLeft'], true);
    await sim(page, 6.4);
    await key(page, ['KeyD', 'Space'], true);
    const drifted = await sim(page, 0.62);
    // Three-quarter, so the yaw and the puffs read. A sign in the foreground is a bad frame.
    await page.eval(`(() => { const d = window.__explore.drive; const wide = innerWidth > 700; d.lookOrbit(wide ? 1.12 : 0.92, 0.04, 40); d.place(0); return 1; })()`);
    console.log(tag, lang, 'drift', JSON.stringify(drifted));
    await jpg(page, `drift-${tag}-${lang}`);
    await key(page, ['KeyW', 'KeyD', 'Space'], false);
  }

  if (cars.includes('race')) for (const lang of ['ja', 'en']) {
    await page.goto(url(lang, 'race', 'yoru'));
    await ready(page);
    await settle(page);
    await page.eval(`(() => { document.body.classList.add('playing'); window.__playSim = 0; return 1; })()`);
    await key(page, ['KeyW'], true);
    const raced = await page.eval(`(() => {
      window.__simTo(8.4);
      window.__playSim = 8.4;
      const d = window.__explore.drive;
      const wide = innerWidth > 700;
      d.lookOrbit(wide ? 0.58 : 0.42, -0.02, 30);
      d.place(0);
      const s = d.state;
      const veil = document.querySelector('#klc-play .veil');
      return { phase: window.__playCar.race.phase, speed: +s.speed.toFixed(2), x: +s.x.toFixed(1), z: +s.z.toFixed(1), veil: veil ? !veil.hidden : false, cost: window.__playCar?.cost?.() || null };
    })()`);
    console.log(tag, lang, 'race', JSON.stringify(raced));
    if (!raced || raced.phase !== 'run') throw new Error('race did not start: ' + JSON.stringify(raced));
    await jpg(page, `race-${tag}-${lang}`);
    await key(page, ['KeyW'], false);
  }

  if (cars.includes('finish')) for (const lang of ['ja', 'en']) {
    await page.goto(url(lang, 'finish', 'yoru'));
    await ready(page);
    await settle(page);
    await page.frames(10);
    const card = await page.eval(`(() => {
      const retry = document.querySelector('#klc-play [data-act="retry"]');
      const medal = document.querySelector('#klc-play .medal');
      return { retry: retry ? retry.textContent : null, medal: medal ? medal.textContent : null, hidden: document.querySelector('#klc-play .veil')?.hidden };
    })()`);
    console.log(tag, lang, 'finish', JSON.stringify(card));
    if (!card.retry || card.hidden) throw new Error('finish card missing: ' + JSON.stringify(card));
    await jpg(page, `finish-${tag}-${lang}`);
  }

  if (cars.includes('card')) for (const lang of ['ja', 'en']) {
    await page.eval(`(() => {
      const raw = localStorage.getItem('klc.play.v1');
      const state = raw ? JSON.parse(raw) : { v: 1, meta: { car: {} } };
      state.courses = Object.assign({}, state.courses, { 'race-minato': { best: 148200, medal: 'gold', runs: 2 } });
      state.meta = state.meta || {};
      state.meta.car = Object.assign({}, state.meta.car, { race: { bestLapMs: 71900, medal: 'gold' } });
      localStorage.setItem('klc.play.v1', JSON.stringify(state));
      return 1;
    })()`);
    await page.goto(url(lang, '', 'hiru'));
    await ready(page);
    await settle(page);
    const painted = await page.eval(cardJs(lang));
    console.log(tag, lang, 'card', JSON.stringify(painted));
    if (!painted || !painted.title) throw new Error('hub card missing');
    await page.frames(4);
    await jpg(page, `card-${tag}-${lang}`);
  }
  const cost = await page.eval('window.__playCar && window.__playCar.cost ? JSON.stringify(window.__playCar.cost()) : null');
  console.log(tag, 'play cost', cost);
  await page.S('Page.close').catch(() => {});
}

function cardJs(lang) {
  return `(() => {
    const spec = window.__playCar && window.__playCar.mode;
    if (!spec) return null;
    const L = ${JSON.stringify(lang)};
    const old = document.getElementById('klc-race-card');
    if (old) old.remove();
    const root = document.createElement('div');
    root.id = 'klc-race-card';
    const how = (spec.how && spec.how[L]) || [];
    const progress = spec.progress ? spec.progress() : null;
    const fresh = spec.isNew ? spec.isNew() : false;
    const stars = '★★★'.slice(0, spec.stars || 0) + '☆☆☆'.slice(spec.stars || 0);
    root.innerHTML = '<div class="dim"></div><article class="card"><div class="still" role="img"></div><div class="body"><p class="kicker">' + (fresh ? 'NEW' : '') + '</p><h2></h2><p class="hook"></p><p class="chips"></p><p class="progress"></p><ol class="how"></ol><button type="button" class="go"></button></div></article>';
    root.querySelector('h2').textContent = spec.title[L];
    root.querySelector('.hook').textContent = spec.hook[L];
    root.querySelector('.chips').textContent = (L === 'ja' ? '⏱' + spec.minutes + '分' : spec.minutes + ' min') + '  ' + stars + '  ' + (spec.players === 1 ? (L === 'ja' ? '1人' : '1 player') : (L === 'ja' ? 'みんなで' : 'Together'));
    const prog = root.querySelector('.progress');
    prog.textContent = progress ? progress[L] : '';
    prog.hidden = !progress;
    const list = root.querySelector('.how');
    for (const step of how) { const li = document.createElement('li'); li.textContent = step; list.appendChild(li); }
    root.querySelector('.go').textContent = L === 'ja' ? 'はじめる' : 'Start';
    root.querySelector('.kicker').hidden = !fresh;
    const css = document.createElement('style');
    css.textContent = '#klc-race-card { position: fixed; inset: 0; z-index: 40; display: grid; place-items: center; font-family: "Zen Maru Gothic", "Noto Sans JP", sans-serif; line-break: strict; }'
      + '#klc-race-card .dim { position: absolute; inset: 0; background: rgba(23, 24, 75, 0.55); }'
      + '#klc-race-card .card { position: relative; width: min(420px, calc(100% - 32px)); border-radius: 22px; overflow: hidden; background: rgba(251, 250, 245, 0.96); box-shadow: 0 18px 50px rgba(23, 24, 75, 0.35); }'
      + '#klc-race-card .still { aspect-ratio: 16/10; background: linear-gradient(#F8B500,#F8B500) 58% 72% / 34% 10% no-repeat, radial-gradient(circle at 24% 68%, #B7282E 0 8px, transparent 9px), radial-gradient(circle at 76% 38%, #00A3AF 0 7px, transparent 8px), #101a3a; }'
      + '#klc-race-card .body { padding: 16px 16px 20px; }'
      + '#klc-race-card h2 { margin: 0; font: 800 28px/1.3 "Zen Maru Gothic", sans-serif; color: #223A70; text-wrap: balance; }'
      + '#klc-race-card .hook { margin: 4px 0 0; font: 500 15px/1.6 "Noto Sans JP", sans-serif; color: #595857; text-wrap: pretty; }'
      + '#klc-race-card .chips, #klc-race-card .progress { margin: 8px 0 0; font: 700 13px/1.4 "Zen Maru Gothic", sans-serif; color: #223A70; font-variant-numeric: tabular-nums; }'
      + '#klc-race-card .how { margin: 12px 0 0; padding: 0; list-style: none; display: grid; gap: 8px; }'
      + '#klc-race-card .how li { min-height: 44px; display: flex; align-items: center; padding: 8px 12px; border-radius: 12px; background: rgba(34, 58, 112, 0.08); font: 700 14px/1.5 "Zen Maru Gothic", sans-serif; color: #17184B; }'
      + '#klc-race-card .go { margin-top: 16px; width: 100%; height: 56px; border: 0; border-radius: 999px; background: #F8B500; color: #223A70; font: 800 16px/1 "Zen Maru Gothic", sans-serif; box-shadow: inset 0 0 0 3px rgba(255,255,255,.85), 0 4px 12px rgba(23,24,75,.35); }'
      + '#klc-race-card .kicker { margin: 0 0 4px; font: 800 12px/1 "Zen Maru Gothic", sans-serif; color: #B7282E; letter-spacing: 0.08em; }'
      + '#klc-race-card .kicker[hidden], #klc-race-card .progress[hidden] { display: none; }';
    root.appendChild(css);
    document.body.appendChild(root);
    return { title: spec.title[L], how: how.length, progress: progress && progress[L] };
  })()`;
}

const only = arg('only', '');
const cars = arg('cars', 'garage,drift,race,finish,card').split(',');
try {
  if (!only || only === 'desktop') await session(1440, 900, 1, 'desktop');
  if (!only || only === 'phone') await session(393, 852, 3, 'phone');
} finally {
  await browser.close();
  srv.stop();
}
