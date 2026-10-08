// [play:views] B's six game views: one headless Chrome, a clean frame, WebP, then Apple Vision.
//   tools/anime/gate.sh chrome --fg env -u NODE_OPTIONS bun tools/play/views-render.mjs
// The WebPs stay untracked. A flat frame is raised, then (the bridge only) moved to 気仙沼大橋.
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildAndServe, launch, sleep } from '../anime/pad-lib.mjs';
import { enuToLatLon, headingFromYaw } from '../../src/anime/core/pose.js';
import { shipWebp, vision } from './views-build.mjs';
import VIEWS from '../../data/play/views.json' with { type: 'json' };

const PORT = Number(process.env.KLC_VIEWS_PORT || 9634);
const OUT = process.env.VIEWS_REVIEW_DIR || join(import.meta.dir, '../../dist/review/views');
const DEST = join(import.meta.dir, '../../data/play/views');
const JSON_PATH = join(import.meta.dir, '../../data/play/views.json');

const STATS = `(() => {
  const c = document.getElementById('scene');
  if (!c || c.width < 2) return { spread: 0, mean: 0 };
  const g = document.createElement('canvas').getContext('2d');
  const w = 48, h = 27;
  g.canvas.width = w; g.canvas.height = h;
  g.drawImage(c, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  let sum = 0, min = 255, max = 0;
  for (let i = 0; i < d.length; i += 4) {
    const y = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    sum += y; if (y < min) min = y; if (y > max) max = y;
  }
  return { spread: +(max - min).toFixed(1), mean: +(sum / (d.length / 4)).toFixed(1) };
})()`;

function camValue(pose) {
  const heading = Math.round(headingFromYaw(pose.yaw) * 100) / 100;
  return [pose.x, pose.y, pose.z, heading, pose.pitch, pose.fov].map((n) => String(n)).join(',');
}

function round7(n) { return Math.round(n * 1e7) / 1e7; }

async function hideChrome(page) {
  await page.eval(`(() => {
    document.body.classList.add('noui');
    document.body.classList.remove('shotui');
    let s = document.getElementById('klc-view-hide');
    if (!s) { s = document.createElement('style'); s.id = 'klc-view-hide'; document.head.appendChild(s); }
    s.textContent = '#intro,#klc-ui,#klc-x,#klc-play,#klc-m,#klc-pad,#klc-labels,#klc-ship{display:none!important}';
    return 1;
  })()`);
}

async function grab(page, pose) {
  await page.eval(`window.__camSpec(${JSON.stringify(camValue(pose))})`);
  await page.eval('window.__setHours && window.__setHours(11)');
  await hideChrome(page);
  let stats = { spread: 0, mean: 0 };
  const t0 = Date.now();
  while (Date.now() - t0 < 12000) {
    await sleep(400);
    stats = await page.eval(STATS);
    if (stats.spread > 28 && Date.now() - t0 > 2800) break;
  }
  await page.frames(4);
  return stats;
}

async function writeFrame(page, id) {
  const data = await page.eval(`document.getElementById('scene').toDataURL('image/jpeg', 0.92)`);
  if (!data || !data.startsWith('data:image/jpeg')) throw new Error(id + ' canvas was empty');
  const jpg = join(tmpdir(), `klc-game-${id}.jpg`);
  writeFileSync(jpg, Buffer.from(data.slice(data.indexOf(',') + 1), 'base64'));
  const dest = join(DEST, id + '.webp');
  const bytes = shipWebp(jpg, dest, { longSide: 960, maxBytes: 80 * 1024 });
  rmSync(jpg, { force: true });
  const seen = vision(dest);
  await page.shot(join(OUT, `game-${id}.png`));
  return { bytes, faces: seen.faces, plate: seen.plate, text: seen.text };
}

function patchJson(id, pose) {
  const ll = enuToLatLon(pose.x, pose.z);
  const latlon = [round7(ll.lat), round7(ll.lon)];
  let text = readFileSync(JSON_PATH, 'utf8');
  const idAt = text.indexOf(`"id": "${id}"`);
  if (idAt < 0) throw new Error('no ' + id);
  const next = text.indexOf('"id":', idAt + 10);
  const end = next < 0 ? text.length : next;
  let block = text.slice(idAt, end);
  block = block.replace(/"pose": \{[^}]*\}/, `"pose": { "x": ${pose.x}, "y": ${pose.y}, "z": ${pose.z}, "yaw": ${pose.yaw}, "pitch": ${pose.pitch}, "fov": ${pose.fov} }`);
  block = block.replace(/"latlon": \[[^\]]*\]/, `"latlon": [${latlon[0]}, ${latlon[1]}]`);
  block = block.replace(/"stand": \{[^}]*\}/, `"stand": { "x": ${pose.x}, "z": ${pose.z}, "yaw": ${pose.yaw}, "pitch": ${pose.pitch} }`);
  text = text.slice(0, idAt) + block + text.slice(end);
  writeFileSync(JSON_PATH, text);
  return latlon;
}

const games = VIEWS.views.filter((v) => v.kind === 'game');
mkdirSync(OUT, { recursive: true });
mkdirSync(DEST, { recursive: true });

const { srv } = await buildAndServe(PORT);
const browser = await launch();
const notes = [];
try {
  const page = await browser.page({ width: 1280, height: 720, dpr: 1 });
  const first = games[0].pose;
  const url = `${srv.url}index.html?shot=1&w=1280&h=720&hours=11&cam=${encodeURIComponent(camValue(first))}`;
  console.log('load', url);
  await page.goto(url);
  await page.waitFor('window.__ready === true', { timeout: 280000 });
  await sleep(1500);
  for (const view of games) {
    let pose = { ...view.pose };
    let stats = await grab(page, pose);
    console.log(view.id, 'spread', stats.spread, 'mean', stats.mean);
    if (stats.spread < 18) {
      pose = { ...pose, y: pose.y + 8, pitch: Math.max(pose.pitch, 4) };
      stats = await grab(page, pose);
      console.log(view.id, 'raised', stats.spread, stats.mean);
    }
    if (view.id === 'V11' && stats.spread < 18) {
      pose = { x: -243.4, y: 12, z: 1120, yaw: 180, pitch: 6, fov: 50 };
      stats = await grab(page, pose);
      console.log('V11 ohashi', stats.spread, stats.mean);
    }
    let shot = await writeFrame(page, view.id);
    if (shot.faces > 0) {
      pose = { ...pose, yaw: Math.round((pose.yaw + 28) * 100) / 100 };
      await grab(page, pose);
      shot = await writeFrame(page, view.id);
      console.log(view.id, 'reframed faces', shot.faces);
    }
    if (shot.faces !== 0) throw new Error(view.id + ' still has ' + shot.faces + ' faces');
    const moved = pose.x !== view.pose.x || pose.y !== view.pose.y || pose.z !== view.pose.z || pose.yaw !== view.pose.yaw || pose.pitch !== view.pose.pitch;
    const latlon = moved ? patchJson(view.id, pose) : view.latlon;
    notes.push({ id: view.id, pose, latlon, spread: stats.spread, mean: stats.mean, ...shot, moved });
    console.log(view.id, shot.bytes, 'faces', shot.faces, 'plate', shot.plate);
  }
} finally {
  writeFileSync(join(OUT, 'game-renders.json'), JSON.stringify(notes, null, 2));
  try { await browser.close(); } catch { /* */ }
  try { srv.stop(); } catch { /* */ }
}
console.log('rendered', notes.length);
