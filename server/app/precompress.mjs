// Writes name.br (brotli 11) and name.gz (gzip 9) beside every compressible file under the given directories, when the
// file is at least 1 KB and the encoding saves at least 10 %, and removes siblings whose source is gone or that no longer
// pay. server/app/static.js serves them through Accept-Encoding. Run on a staged bundle (server/app/stage.sh does):
//   bun server/app/precompress.mjs <bundle>/public <bundle>/data
import { readdirSync, readFileSync, writeFileSync, existsSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { brotliCompressSync, gzipSync, constants } from "node:zlib";

/** Text and binary data; images and already-compressed formats are left alone. */
export const COMPRESSIBLE = /\.(json|geojson|bin|f32|js|mjs|css|html|svg|txt|csv|xml|wasm)$/i;
const SIBLING = /\.(br|gz)$/;

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p); else if (e.isFile()) yield p;
  }
}

/** -> { files, raw, br, gz, written, removed }; sizes in bytes (br / gz count each file's served size: the sibling or the raw file). */
export function precompress(dirs, { minBytes = 1024, minSaving = 0.1, quality = 11, log = () => {} } = {}) {
  const out = { files: 0, raw: 0, br: 0, gz: 0, written: 0, removed: 0 };
  for (const dir of dirs) {
    for (const p of [...walk(dir)]) {
      if (SIBLING.test(p)) { if (!existsSync(p.replace(SIBLING, ""))) { rmSync(p); out.removed++; } continue; }
      if (!COMPRESSIBLE.test(p)) continue;
      const size = statSync(p).size;
      const drop = () => { for (const ext of [".br", ".gz"]) if (existsSync(p + ext)) { rmSync(p + ext); out.removed++; } };
      if (size < minBytes) { drop(); continue; }
      const buf = readFileSync(p);
      const enc = {
        br: brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: quality, [constants.BROTLI_PARAM_SIZE_HINT]: size } }),
        gz: gzipSync(buf, { level: 9 }),
      };
      out.files++; out.raw += size;
      for (const [k, data] of Object.entries(enc)) {
        if (data.length <= size * (1 - minSaving)) { writeFileSync(`${p}.${k}`, data); out.written++; out[k] += data.length; }
        else { if (existsSync(`${p}.${k}`)) { rmSync(`${p}.${k}`); out.removed++; } out[k] += size; }
      }
      log(`${p} ${size} -> br ${enc.br.length}, gz ${enc.gz.length}`);
    }
  }
  return out;
}

if (import.meta.main) {
  const dirs = process.argv.slice(2);
  if (!dirs.length) { console.error("usage: bun server/app/precompress.mjs <dir>..."); process.exit(2); }
  const t0 = Date.now();
  const r = precompress(dirs);
  const mb = (n) => (n / 1048576).toFixed(1) + " MB";
  console.log(`precompress: ${r.files} files, ${mb(r.raw)} raw -> ${mb(r.br)} br / ${mb(r.gz)} gz; ${r.written} siblings written, ${r.removed} removed (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
