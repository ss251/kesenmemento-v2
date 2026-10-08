// The quest mark, then the shrine line, with the game's own audio.
// Headless Chrome is launched muted, so the track is tapped from the master gain.
//   tools/anime/gate.sh chrome --fg env -u NODE_OPTIONS bun tools/anime/missions-r3-film.mjs
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { build, serve, launch, ROOT } from './cdp.mjs';

const port = 8873;
const outDir = resolve(ROOT, 'docs/play/shots/missions');
const tmp = join(outDir, '.r3-film');
mkdirSync(tmp, { recursive: true });
const dist = join(ROOT, `dist/anime-${port}`);
const built = await build({ outdir: dist, strict: false });
console.log(`build ${built.reused ? 'reused' : 'ok'} ${built.ms ?? ''} ms`);
const srv = serve({ port, dist });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let browser;
try {
  browser = await launch({ quiet: true });
  const page = await browser.page({ width: 1440, height: 900, dpr: 1 });
  const q = new URLSearchParams({ lang: 'ja', w: '1440', h: '900', q: 'high' });
  await page.goto(`${srv.url}index.html?${q}`);
  await page.waitFor(`document.body.classList.contains('loaded') && document.getElementById('go') && !document.getElementById('go').disabled`, { timeout: 280000 });
  const box = await page.eval(`(() => { const e = document.getElementById('go'); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await page.S('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
  }
  await page.waitFor(`document.body.classList.contains('playing')`, { timeout: 20000 });
  await sleep(400);
  const armed = await page.eval(`(() => {
    const a = window.__ctx && window.__ctx.audio;
    if (!a || !a.output) return { ok: false, why: 'no output' };
    a.muted = false;
    const ac = a.output.context;
    const dest = ac.createMediaStreamDestination();
    a.output.connect(dest);
    const rec = new MediaRecorder(dest.stream);
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.start(100);
    window.__cap = { rec, chunks };
    return { ok: true, state: ac.state };
  })()`);
  console.log('audio', JSON.stringify(armed));
  if (!armed?.ok) throw new Error('audio did not arm');

  const t0 = Date.now();
  const frames = [];
  const shotAt = async (name) => {
    const file = join(tmp, name + '.png');
    await page.shot(file);
    frames.push({ file, t: Date.now() - t0 });
  };

  await page.eval(`window.__missions.away('barista', 60)`);
  await shotAt('f000');
  for (let i = 1; i <= 8; i++) { await sleep(160); await shotAt('f' + String(i).padStart(3, '0')); }
  await page.eval(`window.__missions.coach('barista')`);
  for (let i = 9; i <= 14; i++) { await sleep(160); await shotAt('f' + String(i).padStart(3, '0')); }
  await page.eval(`window.__missions.open('shrine')`);
  for (let i = 15; i <= 28; i++) { await sleep(140); await shotAt('f' + String(i).padStart(3, '0')); }

  const dataUrl = await page.eval(`new Promise((resolve) => {
    const cap = window.__cap;
    cap.rec.onstop = () => {
      const blob = new Blob(cap.chunks, { type: cap.rec.mimeType || 'audio/webm' });
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    };
    cap.rec.stop();
  })`);
  const audioBuf = Buffer.from(String(dataUrl).split(',')[1] || '', 'base64');
  writeFileSync(join(tmp, 'audio.webm'), audioBuf);
  console.log('audio bytes', audioBuf.length, 'frames', frames.length);
  const list = frames.map((f, i) => {
    const next = frames[i + 1]?.t ?? (f.t + 180);
    const dur = Math.max(0.05, (next - f.t) / 1000);
    return `file '${f.file}'\nduration ${dur.toFixed(3)}`;
  }).join('\n') + `\nfile '${frames[frames.length - 1].file}'\n`;
  writeFileSync(join(tmp, 'frames.txt'), list);
  const mp4 = join(outDir, 'r3-quest.mp4');
  const ff = spawnSync('ffmpeg', [
    '-y', '-f', 'concat', '-safe', '0', '-i', join(tmp, 'frames.txt'), '-i', join(tmp, 'audio.webm'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30',
    '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart',
    mp4,
  ], { encoding: 'utf8' });
  if (ff.status !== 0) throw new Error(ff.stderr?.slice(-800) || 'ffmpeg failed');
  console.log('saved', mp4);
} catch (e) {
  console.log('FILM FAILED:', e.stack || e.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
  srv.stop();
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* tmp */ }
}
