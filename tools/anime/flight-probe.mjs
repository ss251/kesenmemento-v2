// [ui-c] Row 3: the camera flight, measured before and after (the UI round notes (ui-c, not included)). Runs in Bun, no browser: it flies the real stops of the layout with
// the flight code of a base revision (default 2ec3250, the tour.js before row 3) and with the working tree's, stepping the sim at 1/60 s the way the
// frame loop does, and prints the numbers the motion review (the UI review (not included) F01-F05) measured.
//
//   env -u NODE_OPTIONS bun tools/anime/flight-probe.mjs [--base 2ec3250] [--out numbers.json]
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import * as L from '../../src/anime/world/layout.js';
import { ROOT } from './cdp.mjs';

const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const BASE = arg('base', '2ec3250'), OUT = arg('out');

// the base revision's tour.js, written next to the build outputs (ignored by git) so that `three` resolves
const dir = join(ROOT, 'dist'); mkdirSync(dir, { recursive: true });
const baseFile = join(dir, `.flight-base-${process.pid}.js`);
writeFileSync(baseFile, execFileSync('git', ['show', `${BASE}:src/anime/world/life/tour.js`], { cwd: ROOT, encoding: 'utf8' }));
const before = await import(baseFile);
rmSync(baseFile, { force: true });
const after = await import('../../src/anime/world/life/tour.js');

const DT = 1 / 60, DEG = 180 / Math.PI;
const mkCtx = () => ({ L, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 30000), sunDir: new THREE.Vector3(0, 1, 0), services: {}, quality: { name: 'high' } });
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
function rig(mod, from = 'hero') {
  const ctx = mkCtx(), tour = mod.createTour(ctx); tour.jumpTo(from);
  const cam = ctx.camera, prev = cam.position.clone(), d = new THREE.Vector3(), speeds = [], pos = [cam.position.clone()];
  const dir = () => { cam.updateMatrixWorld(true); cam.getWorldDirection(d); return [Math.atan2(-d.x, -d.z), Math.atan2(d.y, Math.hypot(d.x, d.z))]; };
  let [py, pp] = dir(); const y0 = py;
  const o = { yaw: 0, maxYaw: 0, maxPitch: 0, steepest: 0, path: 0 };
  const step = (n = 1) => { for (let i = 0; i < n; i++) {
    tour.update(DT); const v = cam.position.distanceTo(prev) / DT; speeds.push(v); o.path += cam.position.distanceTo(prev); prev.copy(cam.position); pos.push(cam.position.clone());
    const [y, p] = dir(), dy = wrap(y - py); o.yaw += Math.abs(dy); o.maxYaw = Math.max(o.maxYaw, Math.abs(dy)); o.maxPitch = Math.max(o.maxPitch, Math.abs(p - pp)); o.steepest = Math.min(o.steepest, p); py = y; pp = p;
  } };
  return { ctx, tour, cam, step, speeds, pos, stats: o, netYaw: () => Math.abs(wrap(py - y0)) };
}
/** fly a -> b to the end; the numbers of one flight */
function leg(mod, a, b, { auto = false } = {}) {
  const r = rig(mod, a), start = r.cam.position.clone();
  if (auto) { r.tour.current !== a && r.tour.jumpTo(a); r.tour.play(); } else r.tour.flyTo(b);
  let n = 0; while ((auto ? r.tour.current === a || r.tour.flying : r.tour.flying) && n < 4000) { r.step(); n++; if (auto && !r.tour.flying && r.tour.current !== a) break; }
  const sp = r.speeds, peak = Math.max(...sp); let maxJump = 0; for (let i = 1; i < sp.length; i++) maxJump = Math.max(maxJump, Math.abs(sp[i] - sp[i - 1]));   // the biggest speed change between two frames
  const at = (k) => r.pos[Math.min(k, r.pos.length - 1)].distanceTo(start);
  return { from: a, to: b, seconds: r2(n * DT), metres: Math.round(start.distanceTo(r.cam.position)), disp100ms: r1(at(6)), disp500ms: r1(at(30)), disp1s: r1(at(60)), firstFrameSpeed: r1(sp[0] ?? 0), peakSpeed: Math.round(Math.max(...sp)),
    maxSpeedStepPctOfPeak: r1(maxJump / peak * 100), netYawDeg: r1(r.netYaw() * DEG), totalYawDeg: r1(r.stats.yaw * DEG), maxYawPerFrameDeg: r2(r.stats.maxYaw * DEG), maxPitchPerFrameDeg: r2(r.stats.maxPitch * DEG), steepestPitchDeg: r1(r.stats.steepest * DEG) };
}
const stopIds = (m) => m.createTour(mkCtx()).stops.map((s) => s.id);
const PAIRS = [['hero', 'market'], ['hero', 'kanae'], ['hero', 'ukimido'], ['pier7', 'market'], ['kanae', 'hero'], ['market', 'kanae']];

const result = { base: BASE, picks: [], retarget: [], autoTour: [], skip: {} };
for (const [a, b] of PAIRS) result.picks.push({ before: leg(before, a, b), after: leg(after, a, b) });

// retarget: kanae -> market after 1.5 s (the review: 124 m/s to 0 in one frame)
for (const [mod, name] of [[before, 'before'], [after, 'after']]) {
  const r = rig(mod, 'hero'); r.tour.flyTo('kanae'); r.step(90);
  const sp0 = r.speeds.at(-1); r.tour.stop(); r.tour.flyTo('market'); r.step(45);
  const aft = r.speeds.slice(90); let mj = 0; for (let i = 1; i < aft.length; i++) mj = Math.max(mj, Math.abs(aft[i] - aft[i - 1]));
  result.retarget.push({ impl: name, speedBefore: Math.round(sp0), firstFrameAfter: r1(aft[0]), minAfter: r1(Math.min(...aft)), after500ms: r1(aft[30]), maxFrameStepPctOfBefore: r1(mj / sp0 * 100) });
}

// retarget at the moment of peak speed (the review: 124 m/s to 0 in one frame, then 9 m/s half a second later): each implementation at its own fastest frame of hero -> kanae
result.retargetAtPeak = [];
for (const [mod, name] of [[before, 'before'], [after, 'after']]) {
  const probe = rig(mod, 'hero'); probe.tour.flyTo('kanae'); probe.step(800);
  const k = probe.speeds.indexOf(Math.max(...probe.speeds)) + 1;   // frames to run to be at the fastest one
  const r = rig(mod, 'hero'); r.tour.flyTo('kanae'); r.step(k);
  const sp0 = r.speeds.at(-1); r.tour.stop(); r.tour.flyTo('market'); r.step(45);
  const aft = r.speeds.slice(k); let mj = 0; for (let i = 1; i < aft.length; i++) mj = Math.max(mj, Math.abs(aft[i] - aft[i - 1]));
  result.retargetAtPeak.push({ impl: name, atSeconds: r2(k * DT), speedBefore: Math.round(sp0), firstFrameAfter: r1(aft[0]), firstFrameAfterPct: r1(aft[0] / sp0 * 100), minAfter: r1(Math.min(...aft)), after500ms: r1(aft[30]), maxFrameStepPctOfBefore: r1(mj / sp0 * 100) });
}

// the auto tour: every leg of the built-in stops (cinematic length, unchanged), and what the camera does on the way
const ids = stopIds(after);
for (let i = 0; i < ids.length - 1; i++) {
  const row = {};
  for (const [mod, name] of [[before, 'before'], [after, 'after']]) {
    const r = rig(mod, ids[i]); r.tour.play(); let n = 0; while (r.tour.flying && n < 4000) { r.step(); n++; }
    const sp = r.speeds;
    row[name] = { seconds: r2(n * DT), peakSpeed: Math.round(Math.max(...sp)), firstFrameSpeed: r1(sp[0]), maxYawPerFrameDeg: r2(r.stats.maxYaw * DEG), steepestPitchDeg: r1(r.stats.steepest * DEG), totalYawDeg: r1(r.stats.yaw * DEG), netYawDeg: r1(r.netYaw() * DEG) };
  }
  result.autoTour.push({ from: ids[i], to: ids[i + 1], ...row });
}

// skip(): near the end a settle, far with and without a veil
{
  const near = rig(after, 'hero'); near.tour.flyTo('ukimido'); near.step(100);
  const a = near.cam.position.clone(), to = new THREE.Vector3(...near.tour.stops.find((s) => s.id === 'ukimido').drone.pos), restM = a.distanceTo(to);
  near.tour.skip(); const line = new THREE.Line3(a, to), tmp = new THREE.Vector3(); let off = 0, n = 0;
  while (near.tour.flying && n < 100) { near.step(); line.closestPointToPoint(near.cam.position, true, tmp); off = Math.max(off, tmp.distanceTo(near.cam.position)); n++; }
  result.skip.near = { restMetres: Math.round(restM), settleSeconds: r2(n * DT), maxOffTheStraightLineMetres: r2(off) };
  const far = rig(after, 'hero'); far.tour.flyTo('kanae'); far.step(60); let cuts = 0;
  const restFar = Math.round(far.cam.position.distanceTo(new THREE.Vector3(...far.tour.stops.find((s) => s.id === 'kanae').drone.pos)));
  far.tour.skip((fn) => { cuts++; fn(); });
  result.skip.far = { restMetres: restFar, cuts, flyingAfter: far.tour.flying };
  // the same settle flown as a lifted arc (what the prototype's skip did): how far it humps off the straight line
  const hump = rig(after, 'hero'); hump.tour.flyTo('ukimido'); hump.step(100);
  const ha = hump.cam.position.clone(); hump.tour.flyTo({ pos: to.toArray(), look: [341, 4, -25] }, { duration: 0.25, s0: 2.4 });
  const hl = new THREE.Line3(ha, to); let ho = 0, hn = 0;
  while (hump.tour.flying && hn < 100) { hump.step(); hl.closestPointToPoint(hump.cam.position, true, tmp); ho = Math.max(ho, tmp.distanceTo(hump.cam.position)); hn++; }
  result.skip.nearAsLiftedArc = { settleSeconds: r2(hn * DT), maxOffTheStraightLineMetres: r2(ho) };
}

// print
const pad = (v, n) => String(v).padStart(n);
console.log(`\nplace picks (sim at 1/60 s), tour.js at ${BASE} vs the working tree`);
console.log('flight             |  s before -> after | m in 100 ms | m in 500 ms | peak m/s | biggest speed step (% of peak) | max yaw/frame | steepest pitch | total yaw (net)');
for (const { before: b, after: a } of result.picks) console.log(`${(b.from + ' -> ' + b.to).padEnd(18)} | ${pad(b.seconds, 6)} -> ${pad(a.seconds, 5)}    | ${pad(b.disp100ms, 5)} -> ${pad(a.disp100ms, 5)} | ${pad(b.disp500ms, 5)} -> ${pad(a.disp500ms, 5)} | ${pad(b.peakSpeed, 4)} -> ${pad(a.peakSpeed, 4)} | ${pad(b.maxSpeedStepPctOfPeak, 5)} -> ${pad(a.maxSpeedStepPctOfPeak, 5)} | ${pad(b.maxYawPerFrameDeg, 5)} -> ${pad(a.maxYawPerFrameDeg, 4)} | ${pad(b.steepestPitchDeg, 6)} -> ${pad(a.steepestPitchDeg, 6)} | ${pad(b.totalYawDeg, 5)} -> ${pad(a.totalYawDeg, 5)} (${a.netYawDeg})`);
console.log('\nretarget (hero -> kanae, then market, after 1.5 s)'); for (const t of result.retarget) console.log(JSON.stringify(t));
console.log('\nretarget at each flight\'s peak speed'); for (const t of result.retargetAtPeak) console.log(JSON.stringify(t));
console.log('\nauto tour legs (seconds before/after must be equal)');
for (const t of result.autoTour) console.log(`${(t.from + ' -> ' + t.to).padEnd(18)} | s ${pad(t.before.seconds, 5)} / ${pad(t.after.seconds, 5)} | peak m/s ${pad(t.before.peakSpeed, 4)} -> ${pad(t.after.peakSpeed, 4)} | max yaw/frame ${pad(t.before.maxYawPerFrameDeg, 5)} -> ${pad(t.after.maxYawPerFrameDeg, 4)} | steepest pitch ${pad(t.before.steepestPitchDeg, 6)} -> ${pad(t.after.steepestPitchDeg, 6)}`);
console.log('\nskip()', JSON.stringify(result.skip));
if (OUT) writeFileSync(OUT, JSON.stringify(result, null, 1));
