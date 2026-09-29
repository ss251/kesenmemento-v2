// [v3:life] Deterministic 30 s film of the v3 anime world (main() below renders src/anime: tour.filmPose + the 16:30 -> 17:20
// light, every frame stepped with window.__simTo so people, gulls and waves move exactly the same on every run):
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS bun scripts/render/film.js --preview        # 960x540 @ 5 fps (150 frames)
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS bun scripts/render/film.js --size 1080      # 1920x1080 @ 30 fps
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS bun scripts/render/film.js                  # 3840x2160 @ 30 fps (blocked until
//                                                                                                2026-10-01 00:00Z, V3-SPEC section 8)
// Options: --from N --to N, --force, --no-encode, --nobuild, --port 8814, --dur 30, --modules a,b,c (world modules). Frames: raw/film/v3-<size>/f00000.png
// (resume: existing frames are kept), then ffmpeg -> dist/film/kesennuma-living-city-v3-<size>.mp4.
// The v2 exports below (framePlan, previewPlan, encodeArgs) are kept for the v2 app and its tests.
//
// v2 notes (V2-SPEC §9, package v2:portal-cinema):
//   env -u NODE_OPTIONS nice -n 15 taskpolicy -b bun scripts/render/film.js --preview        # 960x540, 5 fps, quick check
//   env -u NODE_OPTIONS nice -n 15 taskpolicy -b bun scripts/render/film.js                  # 3840x2160, 30 fps, 30 s (gated)
// Options: --from N --to N (frame range), --force (re-render existing frames), --no-encode, --no-build, --port 8803,
//          --settle MS (per-frame __RT.settle timeout, default 20000), --extra "k=v&..." (more URL params).
//
// For every frame i it calls window.__RT.film.frame(i, fps) (time + camera from the spline in data/tour.json `film`),
// waits for __RT.settle(), captures a JPEG (q95) via __RT.capture (viewport screenshot fallback), burns in the
// attribution bar and, at the end, the title card, and writes raw/film/{frames|preview}/f00000.jpg (gitignored).
// Then ffmpeg (hevc_videotoolbox when available, else libx264) -> dist/film/kesennuma-living-city-{4k|preview}.mp4.
// Frames already on disk are kept (resume) unless --force. Hard gate: the 4K film may start only before 12:45Z and
// finish by 14:00Z, or after 02:00Z; never 14:00Z-02:00Z. Heavy steps check the 5-minute load (<= 20, stop above 22).
import { resolve, join } from "node:path";
import { mkdirSync, existsSync, readdirSync, statSync } from "node:fs";
import { createFilm } from "../../src/web/scene/camera.js";

const ROOT = resolve(import.meta.dir, "../..");

/** Full-quality plan: every frame of the film at its own fps and size. */
export function framePlan(spec, { fps = spec.fps ?? 30, width = spec.width ?? 3840, height = spec.height ?? 2160, dir = "raw/film/frames" } = {}) {
  const film = createFilm(spec), n = film.frameCount(fps);
  return { fps, width, height, dir, film, frames: Array.from({ length: n }, (_, i) => ({ i, file: `f${String(i).padStart(5, "0")}.jpg`, pose: film.pose(i, fps) })) };
}
/** --preview: 960x540 at 5 fps along the same curve. */
export const previewPlan = (spec) => framePlan(spec, { fps: 5, width: 960, height: 540, dir: "raw/film/preview" });

function ffmpegEncoder() {
  const r = Bun.spawnSync(["ffmpeg", "-hide_banner", "-encoders"]);
  const out = r.stdout?.toString() ?? "";
  return /hevc_videotoolbox/.test(out) ? "hevc_videotoolbox" : /libx264/.test(out) ? "libx264" : null;
}
export function encodeArgs({ enc, fps, pattern, out, preview }) {
  const base = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-framerate", String(fps), "-i", pattern];
  if (enc === "hevc_videotoolbox") return [...base, "-c:v", "hevc_videotoolbox", "-b:v", preview ? "6M" : "60M", "-maxrate", preview ? "8M" : "80M", "-tag:v", "hvc1", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out];
  return [...base, "-c:v", "libx264", "-preset", preview ? "veryfast" : "slow", "-crf", preview ? "20" : "14", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out];
}

/** v3 plan: frame i -> sim time i / fps along the film path (pure). */
export function animePlan({ size = '4k', fps = 30, dur = 30 } = {}) {
  const [width, height] = { preview: [960, 540], '1080': [1920, 1080], '4k': [3840, 2160] }[size];
  const n = Math.round(dur * fps);
  return { size, fps, dur, width, height, dir: `raw/film/v3-${size}`, frames: Array.from({ length: n }, (_, i) => ({ i, t: i / fps, file: `f${String(i).padStart(5, '0')}.png` })) };
}

async function main() {
  const { sizeAllowed, loadAvg5, openApp } = await import('./anime-page.js');
  const args = process.argv.slice(2), opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
  const size = args.includes('--preview') ? 'preview' : opt('--size', '4k');
  const plan = animePlan({ size, fps: size === 'preview' ? 5 : 30, dur: +opt('--dur', 30) });
  const gate = sizeAllowed(size); if (!gate.ok) throw new Error(gate.reason);
  const from = +opt('--from', 0), to = Math.min(+opt('--to', plan.frames.length - 1), plan.frames.length - 1);
  const dir = join(ROOT, plan.dir); mkdirSync(dir, { recursive: true });
  const todo = plan.frames.filter((f) => f.i >= from && f.i <= to && (args.includes('--force') || !existsSync(join(dir, f.file))));
  console.log(`film v3 ${size}: ${plan.width}x${plan.height} @ ${plan.fps} fps, frames ${from}-${to}, ${todo.length} to render -> ${plan.dir}`);
  const manifest = { at: new Date().toISOString(), size, width: plan.width, height: plan.height, fps: plan.fps, frames: [] };
  if (todo.length) {
    if (loadAvg5() > 18) throw new Error('5-minute load > 18: stop (V3-SPEC section 8)');
    const app = await openApp({ port: +opt('--port', 8814), width: plan.width, height: plan.height, nobuild: args.includes('--nobuild'), q: { t: '0', ...(opt('--modules') ? { only: opt('--modules') } : {}) } });
    try {
      let n = 0; const t0 = performance.now();
      for (const f of todo) {
        if (n % 10 === 0 && loadAvg5() > 18) throw new Error(`5-minute load > 18: film stopped at frame ${f.i} (resume with --from ${f.i})`);
        const fs = performance.now();
        await app.page.eval(`(window.__simTo || window.__sim)(${f.t}); window.__film(${f.t}, ${plan.dur});`);
        await app.page.frames(2);
        await app.page.shot(join(dir, f.file));
        manifest.frames.push({ i: f.i, t: f.t, ms: Math.round(performance.now() - fs) });
        n++;
        if (n % 25 === 0 || n === todo.length) console.log(`  frame ${f.i} (${n}/${todo.length}) ${Math.round(performance.now() - fs)} ms, avg ${Math.round((performance.now() - t0) / n)} ms`);
      }
      const errs = app.page.errors(); if (errs.length) console.log('page errors:', JSON.stringify(errs.slice(0, 5)));
      manifest.errors = errs.slice(0, 20);
    } finally { await app.close(); }
  }
  await Bun.write(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 1));
  if (args.includes('--no-encode')) return;
  const all = readdirSync(dir).filter((f) => /^f\d{5}\.png$/.test(f));
  if (all.length < plan.frames.length) { console.log(`only ${all.length}/${plan.frames.length} frames on disk: not encoding yet`); return; }
  const enc = ffmpegEncoder(); if (!enc) throw new Error('ffmpeg with hevc_videotoolbox or libx264 not found');
  mkdirSync(join(ROOT, 'dist/film'), { recursive: true });
  const out = join(ROOT, `dist/film/kesennuma-living-city-v3-${size}.mp4`);
  const cmd = encodeArgs({ enc, fps: plan.fps, pattern: join(dir, 'f%05d.png'), out, preview: size !== '4k' });
  const r = Bun.spawnSync(['nice', '-n', '15', 'taskpolicy', '-b', ...cmd], { stderr: 'pipe' });
  if (r.exitCode !== 0) throw new Error('ffmpeg failed: ' + r.stderr.toString().slice(0, 800));
  console.log(`encoded ${out} with ${enc} (${(statSync(out).size / 1e6).toFixed(1)} MB)`);
}

if (import.meta.main) await main().catch((e) => { console.error(String(e.stack || e)); process.exit(1); });
