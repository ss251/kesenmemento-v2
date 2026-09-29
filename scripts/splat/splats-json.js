// Write data/splats/splats.json (+ a small point PLY for Blender) from the clean report and build-lod output.
//   env -u NODE_OPTIONS bun scripts/splat/splats-json.js --report <clean report.json> --rad data/splats/model.rad \
//       --ply <clean ply> --sparse <colmap sparse/0> --steps 30000 --source model_30000.ply [--qa qa.json] [--extra extra.json]
import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, basename, relative, resolve } from "node:path";
import { readPly, readColmapImages } from "./ply.js";
import { applyTransform } from "./clean.js";

export function readRadHeader(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const magic = new TextDecoder().decode(u8.subarray(0, 4));
  if (magic !== "RAD0") throw new Error("not a RAD index: " + magic);
  const len = new DataView(u8.buffer, u8.byteOffset).getUint32(4, true);
  return JSON.parse(new TextDecoder().decode(u8.subarray(8, 8 + len)));
}

/** Binary PLY with float xyz + uchar rgb (Blender "points" import); `n` highest-weight splats, gallery coords. */
export function pointPly(ply, tf, n = 200000) {
  const { index: ix, stride, data, count } = ply;
  const C0 = 0.28209479177387814;
  const w = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const o = i * stride, op = 1 / (1 + Math.exp(-data[o + ix.opacity]));
    w[i] = op * Math.exp(data[o + ix.scale_0] + data[o + ix.scale_1] + data[o + ix.scale_2]) ** (1 / 3);
  }
  const order = Array.from({ length: count }, (_, i) => i).sort((a, b) => w[b] - w[a]).slice(0, Math.min(n, count));
  const header = `ply\nformat binary_little_endian 1.0\ncomment Kesennuma scale model splat centres, gallery frame (y up, metres)\nelement vertex ${order.length}\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n`;
  const h = new TextEncoder().encode(header), out = new Uint8Array(h.length + order.length * 15);
  out.set(h); const dv = new DataView(out.buffer);
  let o = h.length;
  for (const i of order) {
    const b = i * stride, p = applyTransform(tf, [data[b + ix.x], data[b + ix.y], data[b + ix.z]]);
    dv.setFloat32(o, p[0], true); dv.setFloat32(o + 4, p[1], true); dv.setFloat32(o + 8, p[2], true);
    for (let c = 0; c < 3; c++) out[o + 12 + c] = Math.max(0, Math.min(255, Math.round((0.5 + C0 * data[b + ix.f_dc_0 + c]) * 255)));
    o += 15;
  }
  return out;
}

function parseArgs(argv) {
  const o = {}; for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) { o[argv[i].slice(2)] = argv[i + 1]; i++; } return o;
}

if (import.meta.main) {
  const a = parseArgs(process.argv.slice(2));
  const ROOT = resolve(import.meta.dir, "../..");
  const report = JSON.parse(readFileSync(a.report, "utf8"));
  const radPath = resolve(a.rad), outDir = dirname(radPath);
  const rad = readRadHeader(readFileSync(radPath));
  const chunks = (rad.chunks ?? []).map((c) => c.filename);
  for (const c of chunks) if (!existsSync(join(outDir, c))) throw new Error("missing chunk " + c);
  const ply = readPly(readFileSync(a.ply));
  const tf = report.transform;
  // gallery-space bounds of the cleaned splats (1st-99th percentile to ignore stragglers)
  const xs = [], ys = [], zs = [];
  for (let i = 0; i < ply.count; i += 5) { const o = i * ply.stride; const p = applyTransform(tf, [ply.data[o + ply.index.x], ply.data[o + ply.index.y], ply.data[o + ply.index.z]]); xs.push(p[0]); ys.push(p[1]); zs.push(p[2]); }
  const pr = (arr, p) => { const s = Float64Array.from(arr).sort(); return s[Math.floor((s.length - 1) * p)]; };
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const bounds = { min: [pr(xs, 0.005), pr(ys, 0.005), pr(zs, 0.005)].map(r3), max: [pr(xs, 0.995), pr(ys, 0.995), pr(zs, 0.995)].map(r3) };
  const imgs = readColmapImages(readFileSync(join(a.sparse, "images.bin")));
  const cams = imgs.map((im) => applyTransform(tf, im.center));
  const camMedian = [0, 1, 2].map((c) => r3(pr(cams.map((p) => p[c]), 0.5)));
  const totalImages = Number(a.totalImages ?? imgs.length);
  const pointsName = "model_points.ply";
  await Bun.write(join(outDir, pointsName), pointPly(ply, tf, 200000));
  const extra = a.extra && existsSync(a.extra) ? JSON.parse(readFileSync(a.extra, "utf8")) : {};
  const qa = a.qa && existsSync(a.qa) ? JSON.parse(readFileSync(a.qa, "utf8")) : null;
  const json = {
    version: 1,
    generated: new Date().toISOString(),
    crs: "gallery: local metres, y up, model base plane at y=0, model centred on the origin, long side along x",
    model: {
      name: "model",
      title: { ja: "気仙沼内湾の模型", en: "Scale model of Kesennuma's inner bay" },
      rad: basename(radPath),
      radc: chunks,
      load: { url: "data/splats/" + basename(radPath), paged: true },
      points: pointsName,
      splats: ply.count,
      lodSplats: rad.count ?? null,
      maxSh: rad.maxSh ?? null,
      transform: { position: tf.position.map((v) => +v.toFixed(6)), quaternion: tf.quaternion.map((v) => +v.toFixed(8)), scale: +tf.scale.toFixed(8) },
      widthMetres: +(2 * tf.scale * report.frame.halfU).toFixed(3),
      depthMetres: +(2 * tf.scale * report.frame.halfW).toFixed(3),
      bounds,
      capture: { cameraMedian: camMedian, cameraHeight: report.galleryHeightAboveModelOfCameras },
      ...extra,
      source: { ply: a.source, steps: Number(a.steps), trainer: "Brush 0.3.0", sfm: "COLMAP 4.1.1 global_mapper", registered: imgs.length, images: totalImages,
        registeredFraction: +(imgs.length / totalImages).toFixed(3), clean: { ...report.stats, opts: report.opts, fill: report.fill ?? null } },
      qa,
    },
  };
  await Bun.write(join(outDir, "splats.json"), JSON.stringify(json, null, 1) + "\n");
  console.log(JSON.stringify({ out: relative(ROOT, join(outDir, "splats.json")), splats: ply.count, radc: chunks.length, widthMetres: json.model.widthMetres, bounds }));
}
