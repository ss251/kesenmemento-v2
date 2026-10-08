// [ship:integrate] Guard against a Bun bundler bug (seen on Bun 1.3.14 with HTML entry points and splitting): with
// enough dynamic chunks (adding the 'ship' world module was enough), Bun writes index.html with the <script src> of a
// shared chunk (life's character kit) instead of the HTML's own JS entry chunk, while BuildOutput still reports the
// right one as kind 'entry-point'. The page then loads a chunk that never starts the app and hangs on 「Loading…」.
//
// fixHtmlEntry(outputs) points each built HTML's module script at the JS entry-point chunk Bun reported. It changes
// nothing when there is not exactly one JS entry point (nothing to be sure of) or when the src is already right.
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

/** -> [{ html, from, to }] for every HTML it rewrote. */
export function fixHtmlEntry(outputs) {
  const entries = outputs.filter((o) => o.kind === "entry-point");
  const js = entries.filter((o) => /\.m?js$/.test(o.path));
  const html = entries.filter((o) => /\.html$/.test(o.path));
  if (js.length !== 1 || !html.length) return [];
  const want = basename(js[0].path);
  const fixed = [];
  for (const h of html) {
    const src = readFileSync(h.path, "utf8");
    const m = src.match(/<script\b[^>]*\btype="module"[^>]*\bsrc="\.\/([^"]+\.m?js)"/);
    if (!m || m[1] === want) continue;
    writeFileSync(h.path, src.replace(`src="./${m[1]}"`, `src="./${want}"`));
    fixed.push({ html: basename(h.path), from: m[1], to: want });
  }
  return fixed;
}

/** CLI (the test runs it in its own process): build src/anime/index.html into <outdir>, apply the guard, and print
 *  { ok, fixed, src, main } where main tells whether the page's script is main.js's chunk. */
if (import.meta.main) {
  const { resolve, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const out = process.argv[2];
  const { optionalMemePlugin } = await import("./optional-meme.js");
  const r = await Bun.build({ entrypoints: [resolve(ROOT, "src/anime/index.html")], outdir: out, target: "browser", splitting: true, plugins: [optionalMemePlugin(ROOT)] });
  if (!r.success) { console.log(JSON.stringify({ ok: false, logs: r.logs.map(String) })); process.exit(1); }
  const fixed = fixHtmlEntry(r.outputs);
  const src = readFileSync(resolve(out, "index.html"), "utf8").match(/<script[^>]*src="\.\/([^"]+)"/)[1];
  console.log(JSON.stringify({ ok: true, fixed, src, main: readFileSync(resolve(out, src), "utf8").includes("町の暮らし") }));
}
