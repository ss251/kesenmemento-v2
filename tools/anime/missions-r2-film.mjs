// The shrine quest, with the game's own audio (the blips, the chime, the seal).
// Headless Chrome is launched muted, so the track is tapped from the master gain
// before the mute, then muxed onto the frames.
//   tools/anime/gate.sh chrome --fg env -u NODE_OPTIONS bun tools/anime/missions-r2-film.mjs
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { build, serve, launch, ROOT } from './cdp.mjs';

const port = 8865;
const outDir = resolve(ROOT, 'docs/play/shots/missions');
const tmp = join(outDir, '.r2-film');
mkdirSync(tmp, { recursive: true });
const dist = join(ROOT, `dist/anime-${port}`);
const built = await build({ outdir: dist, strict: false });
console.log(`build ${built.reused ? 'reused' : 'ok'} ${built.ms ?? ''} ms`);
const srv = serve({ port, dist });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function click(page, sel) {
  const box = await page.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width }; })()`);
  if (!box || box.w < 1) throw new Error('no element ' + sel);
  for (const [type, extra] of [['mousePressed', { button: 'left', clickCount: 1 }], ['mouseReleased', { button: 'left', clickCount: 1 }]]) {
    await page.S('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, ...extra });
    await sleep(40);
  }
}

let browser;
try {
  browser = await launch({ quiet: true });
  const page = await browser.page({ width: 1600, height: 900, dpr: 1 });
  const q = new URLSearchParams({ lang: 'ja', w: '1600', h: '900', q: 'high' });
  await page.goto(`${srv.url}index.html?${q}`);
  await page.waitFor(`document.body.classList.contains('loaded') && document.getElementById('go') && !document.getElementById('go').disabled`, { timeout: 280000 });
  await click(page, '#go');
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
    return { ok: true, state: ac.state, hidden: document.visibilityState };
  })()`);
  console.log('audio', JSON.stringify(armed));
  if (!armed?.ok) throw new Error('audio did not arm');
  if (armed.state !== 'running') {
    await page.eval(`window.__ctx.audio.context.resume()`);
    await sleep(200);
    console.log('resumed', await page.eval(`window.__ctx.audio.context.state`));
  }

  const t0 = Date.now();
  const frames = [];
  const shotAt = async (name) => {
    const file = join(tmp, name + '.png');
    await page.shot(file);
    frames.push({ file, t: Date.now() - t0 });
  };

  await page.eval(`window.__missions.open('shrine')`);
  await shotAt('f000');
  for (let i = 1; i <= 8; i++) { await sleep(180); await shotAt('f' + String(i).padStart(3, '0')); }
  await click(page, '#klc-m .m-yes');
  for (let i = 9; i <= 14; i++) { await sleep(180); await shotAt('f' + String(i).padStart(3, '0')); }
  await page.eval(`window.__missions.complete('shrine-visit')`);
  for (let i = 15; i <= 22; i++) { await sleep(160); await shotAt('f' + String(i).padStart(3, '0')); }

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
  const audioFile = join(tmp, 'audio.webm');
  writeFileSync(audioFile, audioBuf);
  console.log('audio bytes', audioBuf.length, 'frames', frames.length);

  const list = frames.map((f, i) => {
    const next = frames[i + 1]?.t ?? (f.t + 200);
    const dur = Math.max(0.05, (next - f.t) / 1000);
    return `file '${f.file}'\nduration ${dur.toFixed(3)}`;
  }).join('\n') + `\nfile '${frames[frames.length - 1].file}'\n`;
  const listFile = join(tmp, 'frames.txt');
  writeFileSync(listFile, list);
  const mp4 = join(outDir, 'r2-shrine-visit.mp4');
  const ff = spawnSync('ffmpeg', [
    '-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-i', audioFile,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30',
    '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart',
    mp4,
  ], { encoding: 'utf8' });
  if (ff.status !== 0) throw new Error(ff.stderr?.slice(-800) || 'ffmpeg failed');
  console.log('saved', mp4);
} catch (e) {
  console.log('FILM FAILED:', e.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
  srv.stop();
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* tmp */ }
}
