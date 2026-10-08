// [feel] Movement-feel probe: the same scripted walk on the phone tier (390x844 @3, touch, iPhone UA, real CDP touches on the stick) and on a
// desktop (1440x900, real key events), recorded every rendered frame by an allocation-free recorder inside the page (ctx.onUpdate, after the
// player's present() and the avatar's placeFigure()). Numbers: tools/anime/feel-metrics.mjs. Lane: movement-feel.
//
//   tools/anime/gate.sh chrome --fg env -u NODE_OPTIONS bun tools/anime/feel-probe.mjs --label before
//   ... --only phone            one device (phone | desktop)
//   ... --fps 60,30             one session per frame rate (the pacer's ?fps=)
//   ... --clip                  a second pass per device with Page.startScreencast -> docs/play/shots/feel/<label>-<device>.mp4 (+ stills)
//   ... --port 9560 --no-build  reuse dist/anime-<port>
//   ... --throttle 4            CPU throttling x4 during the walk (dropped frames; the session is labelled with it)
//
// The script: settle 1.5 s -> walk 2.5 s -> run 2.0 s -> reverse (a 180°) 1.6 s -> stop 1.6 s -> forward then 45° right (a curve) -> stop;
// then the PIER7 timber stair walked up; then (fresh page) 歩く from the opening drone over the bay (where does he land?).
import { mkdirSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildAndServe, launch, phonePage, fingers, center, sleep, ROOT } from './pad-lib.mjs';
import { FIELDS, CLIPS, toFrames, startResponse, stopResponse, turnResponse, cameraMetrics, catchUp, trail, footMetrics, stepMetrics, framing, pacing, inputMag, inputHeading } from './feel-metrics.mjs';
import { STICK, stickMath, padScale } from '../../src/anime/ui/touchpad.js';

const arg = (k, d = null) => { const i = process.argv.indexOf('--' + k); return i > 0 ? (process.argv[i + 1] ?? true) : d; };
const has = (k) => process.argv.includes('--' + k);
const PORT = Number(arg('port', 9560));
const LABEL = String(arg('label', 'before'));
const ONLY = String(arg('only', 'phone,desktop')).split(',');
const FPS = String(arg('fps', '60')).split(',').map(Number);
const CLIP = has('clip');
const THROTTLE = Number(arg('throttle', 0));   // CDP CPU throttling during the walk (a phone's dropped frames): 0 = off
const OUT = join(ROOT, 'docs/play/shots/feel');
const RAW = join(ROOT, 'dist/feel', LABEL);
mkdirSync(OUT, { recursive: true }); mkdirSync(RAW, { recursive: true });
const log = (...a) => console.error('[feel]', ...a);

// ------------------------------------------------------------------ the recorder (in the page)
const RECORDER = `(() => {
  if (window.__feel) return 'again';
  const ctx = window.__ctx, P = ctx.playerObj, cam = ctx.camera, T3 = window.THREE;
  const W = ${FIELDS.length}, N = 60 * 150, D = new Float64Array(N * W), CL = ${JSON.stringify(CLIPS)};
  let n = 0, on = false, root = null, fR = null, fL = null;
  const v = new T3.Vector3(), d = new T3.Vector3();
  function find() {
    if (root && root.parent) return;
    root = null; fR = fL = null;
    ctx.scene.traverse((o) => { if (!root && o.name === 'hoya3d') root = o; });
    if (root) { fR = root.getObjectByName('footR'); fL = root.getObjectByName('footL'); }
  }
  const marks = [];
  ctx.onUpdate((dt) => {
    if (!on || n >= N) return;
    find();
    let j = n * W;
    const pad = window.__pad, k = P.keys, tm = P.touchMove;
    let inF = 0, inS = 0;
    if (P.enabled) {
      if (k.has('KeyW') || k.has('ArrowUp')) inF += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) inF -= 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) inS -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) inS += 1;
      inF -= tm.y; inS += tm.x;
    }
    const run = (k.has('ShiftLeft') || k.has('ShiftRight') || (pad && (pad.running || (pad.dash && tm.lengthSq() > 0)))) ? 1 : 0;
    const vis = !!(root && root.visible);
    cam.getWorldDirection(d);
    D[j++] = performance.now() / 1000; D[j++] = dt; D[j++] = ctx.alpha ?? 1;
    D[j++] = P.pos.x; D[j++] = P.pos.y; D[j++] = P.pos.z; D[j++] = P.vel.x; D[j++] = P.vel.z; D[j++] = P.vy;
    D[j++] = P.onGround ? 1 : 0; D[j++] = P.fly ? 1 : 0; D[j++] = P.yaw; D[j++] = P.pitch;
    D[j++] = vis ? root.position.x : NaN; D[j++] = vis ? root.position.y : NaN; D[j++] = vis ? root.position.z : NaN; D[j++] = vis ? root.rotation.y : NaN;
    D[j++] = cam.position.x; D[j++] = cam.position.y; D[j++] = cam.position.z; D[j++] = d.x; D[j++] = d.y; D[j++] = d.z;
    if (vis && fR && fL) {
      root.updateMatrixWorld(true);
      fR.getWorldPosition(v); D[j++] = v.x; D[j++] = v.y; D[j++] = v.z;
      fL.getWorldPosition(v); D[j++] = v.x; D[j++] = v.y; D[j++] = v.z;
    } else { for (let q = 0; q < 6; q++) D[j++] = NaN; }
    D[j++] = inF; D[j++] = inS; D[j++] = run;
    const av = ctx.services.play && ctx.services.play.avatar;
    D[j++] = av ? av.boom : NaN;
    if (vis) {
      cam.updateMatrixWorld(); v.set(root.position.x, root.position.y, root.position.z).project(cam); const bot = v.y;
      v.set(root.position.x, root.position.y + 1.1, root.position.z).project(cam); D[j++] = v.y; D[j++] = bot;
    } else { D[j++] = NaN; D[j++] = NaN; }
    D[j++] = av ? CL.indexOf(av.clip) : -1;
    D[j++] = window.__clock ? window.__clock.renderTime : 0;
    D[j++] = ctx.physics.isWater ? (ctx.physics.isWater(P.pos.x, P.pos.z) ? 1 : 0) : -1;
    D[j++] = ctx.physics.groundHeight(P.pos.x, P.pos.z, P.pos.y);
    const aim = av && av.aim;
    D[j++] = aim && Number.isFinite(aim.tx) ? aim.tx : NaN; D[j++] = aim && Number.isFinite(aim.tz) ? aim.tz : NaN;
    n++;
  });
  window.__feel = {
    start() { n = 0; marks.length = 0; on = true; return true; },
    stop() { on = false; return n; },
    mark(id) { marks.push([id, n]); return n; },
    get n() { return n; }, get marks() { return marks.slice(); },
    dump(a, b) { return Array.from(D.subarray(a * W, b * W)); },
  };
  /** The clearest straight, flat line from (x, z): 24 headings, every 0.25 m, no step over 8 cm, no solid at 0.5 / 1.2 m, standable. */
  window.__feelRoute = (x, z, len) => {
    const Ph = ctx.physics; let best = null;
    for (let q = 0; q < 24; q++) {
      const yaw = q * Math.PI / 12, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      let prev = Ph.groundHeight(x, z, 1e9), ok = 0;
      for (let s = 0.25; s <= len; s += 0.25) {
        const px = x + fx * s, pz = z + fz * s, g = Ph.groundHeight(px, pz, prev + 0.3);
        if (Math.abs(g - prev) > 0.08 || Ph.solidAt(px, pz, g + 0.5) || Ph.solidAt(px, pz, g + 1.2) || !Ph.standable(px, pz, g + 0.1)) break;
        ok = s; prev = g;
      }
      if (!best || ok > best.ok) best = { yawDeg: yaw * 180 / Math.PI, ok };
    }
    return best;
  };
  /** A walkable line with real steps (kerbs, a flight of steps): from each point, 36 headings, every 0.1 m over len; every rise or drop
   *  under STEP_HEIGHT, at least two edges of 6 cm or more, no solid at 0.5 / 1.2 m, standable. The most edges (a 10 cm+ step preferred). */
  window.__feelSteps = (pts, len) => {
    const Ph = ctx.physics; let best = null;
    for (const [x, z] of pts) for (let q = 0; q < 36; q++) {
      const yaw = q * Math.PI / 18, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      let y = Ph.groundHeight(x, z, 1e9); const g0 = y; let edges = 0, maxE = 0, ok = true, first = -1;
      for (let s = 0.1; s <= len + 1e-6; s += 0.1) {
        const px = x + fx * s, pz = z + fz * s, g = Ph.groundHeight(px, pz, y + 0.3), d = g - y;
        if (Math.abs(d) > 0.44 || Ph.solidAt(px, pz, g + 0.5) || Ph.solidAt(px, pz, g + 1.2) || !Ph.standable(px, pz, g + 0.1)) { ok = false; break; }
        if (Math.abs(d) >= 0.06) { edges++; maxE = Math.max(maxE, Math.abs(d)); if (first < 0) first = s; }
        y = g;
      }
      if (!ok || edges < 2 || first < 3) continue;
      const score = Math.min(edges, 8) + (maxE >= 0.1 ? 2 : 0);
      if (!best || score > best.score) best = { x, z, yawDeg: yaw * 180 / Math.PI, edges, maxE: +maxE.toFixed(3), rise: +(y - g0).toFixed(3), first: +first.toFixed(1), score };
    }
    return best;
  };
  /** The ground along a heading, every 0.1 m (the stair's profile). */
  window.__feelProfile = (x, z, yawDeg, len) => {
    const Ph = ctx.physics, yaw = yawDeg * Math.PI / 180, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    let y = Ph.groundHeight(x, z, 1e9); const out = [];
    for (let s = 0; s <= len + 1e-6; s += 0.1) { y = Ph.groundHeight(x + fx * s, z + fz * s, y + 0.3); out.push(+y.toFixed(3)); }
    return out;
  };
  return 'ok';
})()`;

// ------------------------------------------------------------------ input
function keyboard(page) {
  const VK = { KeyW: [87, 'w'], KeyS: [83, 's'], KeyD: [68, 'd'], KeyA: [65, 'a'], KeyF: [70, 'f'], ShiftLeft: [16, 'Shift'] };
  const send = (type, code) => page.S('Input.dispatchKeyEvent', { type, code, key: VK[code][1], windowsVirtualKeyCode: VK[code][0], nativeVirtualKeyCode: VK[code][0] });
  return { down: (c) => send('keyDown', c), up: (c) => send('keyUp', c) };
}

/** The scripted walk. dev: 'phone' (the touch stick) | 'desktop' (keys). Marks bracket each part. */
async function script(page, dev) {
  const M = (id) => page.eval(`window.__feel.mark(${JSON.stringify(id)})`);
  if (dev === 'phone') {
    const f = fingers(page), T = STICK.travel * padScale(390, 844), x0 = 90, y0 = 560;
    await M('settle'); await sleep(1500);
    await f.down1(1, x0, y0); await M('walk'); await f.drag(1, x0, y0 - 0.8 * T, 2); await sleep(2500);
    await M('run'); await f.drag(1, x0, y0 - T, 2); await sleep(2000);
    await M('reverse'); await f.drag(1, x0, y0 + 0.8 * T, 2); await sleep(1600);
    await M('stop'); await f.up(1); await sleep(1600);
    await f.down1(1, x0, y0); await M('curve0'); await f.drag(1, x0, y0 - 0.8 * T, 2); await sleep(1200);
    const r = 0.8 * T;
    await M('curve');
    for (let i = 1; i <= 6; i++) { const a = (Math.PI / 4) * i / 6; await f.move(1, x0 + r * Math.sin(a), y0 - r * Math.cos(a)); await sleep(40); }
    await sleep(1000);
    await M('curveStop'); await f.up(1); await sleep(1200);
    await M('end');
  } else {
    const k = keyboard(page);
    await M('settle'); await sleep(1500);
    await M('walk'); await k.down('KeyW'); await sleep(2500);
    await M('run'); await k.down('ShiftLeft'); await sleep(2000);
    await M('reverse'); await k.up('ShiftLeft'); await k.up('KeyW'); await k.down('KeyS'); await sleep(1600);
    await M('stop'); await k.up('KeyS'); await sleep(1600);
    await M('curve0'); await k.down('KeyW'); await sleep(1200);
    await M('curve'); await k.down('KeyD'); await sleep(1000);
    await M('curveStop'); await k.up('KeyD'); await k.up('KeyW'); await sleep(1200);
    await M('end');
  }
}
async function stairScript(page, dev, id = 'stair') {
  const M = (m) => page.eval(`window.__feel.mark(${JSON.stringify(id + m)})`);
  await M('Settle'); await sleep(1200);
  if (dev === 'phone') {
    const f = fingers(page), T = STICK.travel * padScale(390, 844);
    await f.down1(1, 90, 560); await M(''); await f.drag(1, 90, 560 - 0.8 * T, 2); await sleep(3500);
    await M('Stop'); await f.up(1); await sleep(1200);
  } else {
    const k = keyboard(page);
    await M(''); await k.down('KeyW'); await sleep(3500);
    await M('Stop'); await k.up('KeyW'); await sleep(1200);
  }
  await M('End');
}
let STEPS = null;

// ------------------------------------------------------------------ analysis
function bracket(marks, id, next) {
  const a = marks.find((m) => m[0] === id), b = marks.find((m) => m[0] === next);
  return a && b ? [a[1], b[1]] : null;
}
const inputHeadingAt = (fr, i) => (fr[i] ? inputHeading(fr[i]) : null);
/** The first frame in [a, b) where `pred` holds (the input's onset inside a bracket), else a. */
const onset = (fr, a, b, pred) => { for (let i = a; i < Math.min(b, fr.length); i++) if (pred(fr[i])) return i; return a; };

function analyse(fr, marks) {
  const B = (id, next) => bracket(marks, id, next);
  const out = {};
  const settle = B('settle', 'walk'), walk = B('walk', 'run'), run = B('run', 'reverse'), rev = B('reverse', 'stop'), stop = B('stop', 'curve0');
  const curve = B('curve', 'curveStop');
  if (settle) out.framing = framing(fr, settle[0], settle[1]);
  if (walk) {
    const a = onset(fr, walk[0], walk[1] + 8, (f) => inputMag(f) > 0.01);
    const b = run ? onset(fr, run[0], run[1], (f) => f.run) : walk[1];
    out.walkStart = startResponse(fr, a, b);
    out.walkFeet = footMetrics(fr, Math.max(a, b - 60), b);
    out.walkCam = { ...cameraMetrics(fr, Math.max(a, b - 90), b), ...trail(fr, a - 1, Math.max(a, b - 30), b) };
  }
  if (run) {
    const a = onset(fr, run[0], run[1] + 8, (f) => f.run);
    const b = onset(fr, a + 1, rev ? rev[1] : run[1], (f) => !f.run || inputMag(f) < 0.5);   // the run window ends with the run input (a thumb's flick passes the dead zone on its way back)
    out.runStart = startResponse(fr, a, b);
    const brev = rev ? onset(fr, rev[0], rev[1], (f) => f.inF < -0.01) : run[1];
    void brev;
    out.runFeet = footMetrics(fr, Math.max(a, b - 60), b);
    const rest = walk ? onset(fr, walk[0], walk[1] + 8, (f) => inputMag(f) > 0.01) - 1 : a - 1;
    out.runCam = { ...cameraMetrics(fr, Math.max(a, b - 60), b), ...trail(fr, rest, Math.max(a, b - 20), b) };
  }
  if (rev) {
    const a = onset(fr, rev[0], rev[1] + 8, (f) => f.inF < -0.01);
    const b = stop ? onset(fr, stop[0], stop[1] + 8, (f) => inputMag(f) < 0.01) : rev[1];
    out.turn180 = turnResponse(fr, a, b);
    out.reverseStart = startResponse(fr, a, b);
  }
  if (stop) {
    const a = onset(fr, stop[0], stop[1] + 8, (f) => inputMag(f) < 0.01);
    out.stop = stopResponse(fr, a, stop[1]);
    out.stopCam = { ...cameraMetrics(fr, a, stop[1]), ...catchUp(fr, a, stop[1]) };
  }
  if (curve) {
    const a = onset(fr, curve[0], curve[1] + 8, (f) => Math.abs(f.inS) > 0.01);
    const want = inputHeadingAt(fr, curve[1] - 1);
    out.curve45 = turnResponse(fr, a, curve[1], 10 * Math.PI / 180, want);
  }
  for (const id of ['steps', 'stair']) {
    const st = B(id, id + 'Stop');
    if (!st) continue;
    const a = onset(fr, st[0], st[1] + 8, (f) => inputMag(f) > 0.01);
    const end = B(id + 'Stop', id + 'End');
    out[id] = stepMetrics(fr, a, end ? end[1] : st[1]);
    out[id + 'Cam'] = cameraMetrics(fr, a, st[1]);
  }
  const all = B('settle', 'end');
  if (all) { out.pacing = pacing(fr, all[0], all[1]); out.camAll = cameraMetrics(fr, all[0], all[1]); }
  return out;
}

async function pull(page) {
  const n = await page.eval('window.__feel.stop()');
  const marks = await page.eval('window.__feel.marks');
  const flat = [];
  for (let a = 0; a < n; a += 800) flat.push(...await page.eval(`window.__feel.dump(${a}, ${Math.min(n, a + 800)})`));
  return { frames: toFrames(flat), marks, n };
}

// ------------------------------------------------------------------ sessions
async function open(browser, srv, dev, fps) {
  const page = dev === 'phone' ? await phonePage(browser, { width: 390, height: 844, dpr: 3 }) : await browser.page({ width: 1440, height: 900, dpr: 1 });
  await page.goto(`${srv.url}index.html?lang=ja${fps !== 60 ? '&fps=' + fps : ''}`);
  await page.waitFor("document.body.classList.contains('loaded')", { timeout: 280000 });
  return page;
}
async function enter(page, dev) {
  if (dev === 'phone') { const f = fingers(page); const g = await center(page, '#go'); await f.tap(g.x, g.y); }
  else await page.eval("document.getElementById('go').click()");
  await page.waitFor("document.body.classList.contains('playing')", { timeout: 30000 });
  await page.waitFor(`(() => { let r = null; window.__ctx.scene.traverse((o) => { if (o.name === 'hoya3d') r = o; }); return !!r; })()`, { timeout: 60000 });
  await page.eval(RECORDER);
}

/** 歩く from the opening drone: the pad's chip on the phone, the F key on a desktop (both just end the flight where the drone is). */
async function landCheck(page, dev) {
  await page.waitFor('!window.__ctx.services.life?.tour?.flying', { timeout: 30000 }).catch(() => {});
  await sleep(800);
  const before = await page.eval(`(() => { const p = window.__ctx.playerObj; return { x: p.pos.x, y: p.pos.y, z: p.pos.z, fly: p.fly }; })()`);
  await page.eval('window.__feel.start()');
  await page.eval(`window.__feel.mark('land')`);
  if (dev === 'phone') {
    const c = await center(page, '#klc-pad .chip button[data-mode="walk"]');
    if (c) { const f = fingers(page); await f.tap(c.x, c.y); } else await page.eval("window.__ctx.playerObj.fly = false");
  } else { const k = keyboard(page); await k.down('KeyF'); await k.up('KeyF'); }
  await sleep(6000);
  await page.eval(`window.__feel.mark('landEnd')`);
  const { frames, marks } = await pull(page);
  const last = frames[frames.length - 1];
  const t0 = frames[0]?.simT ?? 0;
  let tGround = null; for (const f of frames) if (f.gnd && !f.fly) { tGround = f.simT - t0; break; }
  const sea = await page.eval(`(() => { const p = window.__ctx.playerObj, L = window.__L; return { x: p.pos.x, y: p.pos.y, z: p.pos.z, water: !!window.__ctx.physics.isWater?.(p.pos.x, p.pos.z), terrain: L.heightAt(p.pos.x, p.pos.z), shore: L.shoreDist ? L.shoreDist(p.pos.x, p.pos.z) : null }; })()`);
  return { before, after: sea, onSea: sea.water, tGround: tGround === null ? null : +tGround.toFixed(2), fell: +(before.y - sea.y).toFixed(2), maxDy: +Math.max(0, ...frames.slice(1).map((f, i) => Math.abs(f.ry - frames[i].ry)).filter(Number.isFinite)).toFixed(3), framingAfter: framing(frames, Math.max(0, frames.length - 30), frames.length).share, marks };
}

async function walkSession(browser, srv, dev, fps, { clip = false } = {}) {
  const page = await open(browser, srv, dev, fps);
  await enter(page, dev);
  const res = { dev, fps };
  res.land = await landCheck(page, dev);
  log(dev, fps, 'land', JSON.stringify(res.land.after), 'onSea', res.land.onSea);
  // the route: the promenade by the hero spot, the clearest straight line
  const start = { x: 168, z: -122 };
  const route = await page.eval(`window.__feelRoute(${start.x}, ${start.z}, 30)`);
  res.route = { ...start, ...route };
  await page.eval(`window.__camSpec('${start.x},${start.z},${route.yawDeg},0')`);
  let cast = null;
  if (clip) cast = await screencast(page, dev);
  if (THROTTLE > 1) await page.S('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  await page.eval('window.__feel.start()');
  await script(page, dev);
  // steps: a walkable line with kerbs / steps near PIER7 and the hero spot (found once, the same for every session), walked at a walk
  const pts = [[5, 40], [2.4, 45.05], [-6, 30], [-14.56, 46.73], [168, -122], [-96, -72], [654.5, 836.1]];
  for (const [cx, cz] of [[5, 40], [-1.06, 75.54], [168, -122]]) for (let k = 0; k < 12; k++) for (const r of [6, 12, 18]) pts.push([cx + r * Math.cos(k * Math.PI / 6), cz + r * Math.sin(k * Math.PI / 6)]);
  const steps = STEPS || await page.eval(`window.__feelSteps(${JSON.stringify(pts)}, 12)`);
  STEPS = steps;
  res.steps = steps;
  if (steps) {
    res.stepsProfile = await page.eval(`window.__feelProfile(${steps.x}, ${steps.z}, ${steps.yawDeg}, 12)`);
    await page.eval(`window.__camSpec('${steps.x},${steps.z},${steps.yawDeg},0')`);
    await stairScript(page, dev, 'steps');
  }
  // the PIER7 timber stair (the play-avatar lane's march): a ramp under a soffit, the boom's hard case
  const sx = -1.06, sz = 75.54, yaw = Math.atan2(-(1.64 - sx), -(80.45 - sz)) * 180 / Math.PI;
  res.stairProfile = await page.eval(`window.__feelProfile(${sx}, ${sz}, ${yaw}, 10)`);
  await page.eval(`window.__camSpec('${sx},${sz},${yaw.toFixed(3)},0')`);
  await stairScript(page, dev, 'stair');
  const { frames, marks } = await pull(page);
  if (cast) res.clip = await cast.finish(`${LABEL}-${dev}${fps !== 60 ? '-' + fps : ''}`);
  writeFileSync(join(RAW, `${dev}-${fps}${THROTTLE > 1 ? '-cpu' + THROTTLE : ''}${clip ? '-clip' : ''}.json`), JSON.stringify({ fields: FIELDS, marks, frames: frames.map((f) => FIELDS.map((k) => f[k])) }));
  if (THROTTLE > 1) res.throttle = THROTTLE;
  res.metrics = analyse(frames, marks);
  res.errors = page.errors().slice(0, 5);
  return res;
}

/** Page.startScreencast -> JPEG frames with their timestamps -> an mp4 at 30 fps (frames held for their real duration) + stills. */
async function screencast(page, dev) {
  const dir = join(RAW, `cast-${dev}`); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const frames = [];
  const size = dev === 'phone' ? { maxWidth: 390, maxHeight: 844 } : { maxWidth: 960, maxHeight: 600 };
  await page.S('Page.enable');
  const on = (params) => {
    const i = frames.length;
    writeFileSync(join(dir, String(i).padStart(5, '0') + '.jpg'), Buffer.from(params.data, 'base64'));
    frames.push(params.metadata.timestamp);
    page.S('Page.screencastFrameAck', { sessionId: params.sessionId }).catch(() => {});
  };
  castHandlers.set(page, on);
  await page.S('Page.startScreencast', { format: 'jpeg', quality: 72, everyNthFrame: 1, ...size });
  return {
    async finish(name) {
      await page.S('Page.stopScreencast').catch(() => {});
      castHandlers.delete(page);
      if (frames.length < 2) return null;
      const lines = [];
      for (let i = 0; i < frames.length; i++) {
        const d = i + 1 < frames.length ? Math.max(0.001, frames[i + 1] - frames[i]) : 1 / 30;
        lines.push(`file '${join(dir, String(i).padStart(5, '0') + '.jpg')}'`, `duration ${d.toFixed(4)}`);
      }
      lines.push(`file '${join(dir, String(frames.length - 1).padStart(5, '0') + '.jpg')}'`);
      writeFileSync(join(dir, 'list.txt'), lines.join('\n'));
      const mp4 = join(OUT, name + '.mp4');
      const scale = dev === 'phone' ? 'scale=390:-2' : 'scale=960:-2';
      const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(dir, 'list.txt'), '-vf', `${scale},fps=30,format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', '-movflags', '+faststart', mp4]);
      if (r.status !== 0) { log('ffmpeg', r.stderr?.toString()); return null; }
      return { mp4: mp4.replace(ROOT + '/', ''), frames: frames.length, seconds: +(frames[frames.length - 1] - frames[0]).toFixed(2) };
    },
  };
}
const castHandlers = new Map();

// ------------------------------------------------------------------ main
const stick = [];
for (const raw of [0, 0.06, 0.12, 0.15, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.84, 0.85, 0.9, 1]) {
  const r = stickMath(STICK.travel * raw, 0);
  stick.push({ raw, mag: +r.mag.toFixed(3), run: r.run, speed: +(r.mag * (r.run ? 6.4 : 3.1)).toFixed(2) });
}

const { srv } = has('no-build') ? { srv: (await import('./cdp.mjs')).serve({ port: PORT, dist: join(ROOT, `dist/anime-${PORT}`) }) } : await buildAndServe(PORT);
const browser = await launch({ quiet: true });
browser.on('Page.screencastFrame', (params) => { for (const fn of castHandlers.values()) fn(params); });
const report = { label: LABEL, at: new Date().toISOString(), stick, sessions: [] };
try {
  for (const dev of ONLY) {
    for (const fps of FPS) {
      log('session', dev, fps);
      const t0 = Date.now();
      try { report.sessions.push(await walkSession(browser, srv, dev, fps)); }
      catch (e) { log('session failed', dev, fps, e.message); report.sessions.push({ dev, fps, error: e.message }); }
      log('done', dev, fps, ((Date.now() - t0) / 1000).toFixed(0) + ' s');
    }
    if (CLIP) {
      try { const r = await walkSession(browser, srv, dev, 60, { clip: true }); report.sessions.push({ dev, fps: 60, clip: r.clip, clipMetrics: r.metrics }); }
      catch (e) { log('clip failed', dev, e.message); }
    }
  }
} finally {
  await browser.close(); srv.stop();
}
writeFileSync(join(OUT, `${LABEL}-metrics.json`), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
