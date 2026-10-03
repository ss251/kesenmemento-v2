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
