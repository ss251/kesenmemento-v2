// [contrib] The build stamp that every report carries (src/anime/core/buildinfo.js reads it as Bun `define` constants):
//   app     package.json version + the commit the bundle is built from, "0.1.0+df15fdd" (just the version when git is not there)
//   layout  the layout data: its own version and a short content hash of data/anime/layout.json, "v1.3fa9c2d1"
// scripts/build-web.js and tools/anime/cdp.mjs build() pass buildDefines() to Bun.build, so the dev bundle and the shipped one agree.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';

const ROOT = resolve(import.meta.dir, '../..');

/**
 * The short commit of HEAD, or '' (no git, not a repository, or a sandbox that returns nothing). A build that has no .git
 * (Railway builds from the repository's files) gets the commit from RAILWAY_GIT_COMMIT_SHA, which Railway sets for a deploy from GitHub.
 */
export function gitShort(root = ROOT, env = process.env) {
  try {
    const r = Bun.spawnSync(['git', '-C', root, 'rev-parse', '--short=7', 'HEAD'], { stdout: 'pipe', stderr: 'ignore' });
    const out = r.exitCode === 0 ? r.stdout.toString().trim() : '';
    if (/^[0-9a-f]{7,40}$/.test(out)) return out;
  } catch { /* fall through to the environment */ }
  const sha = String(env?.RAILWAY_GIT_COMMIT_SHA ?? '').trim();
  return /^[0-9a-f]{7,40}$/.test(sha) ? sha.slice(0, 7) : '';
}

/** -> { app, layout }. `git` is injectable for tests. */
export function readBuildInfo(root = ROOT, { git = gitShort } = {}) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const commit = git(root);
  let layout = 'unknown';
  try {
    const raw = readFileSync(join(root, 'data/anime/layout.json'));
    layout = `v${JSON.parse(raw).version ?? 0}.${createHash('sha1').update(raw).digest('hex').slice(0, 8)}`;
  } catch { /* no layout data in this checkout: the report says so */ }
  return { app: commit ? `${pkg.version}+${commit}` : String(pkg.version), layout };
}

/** Bun.build `define`: the identifiers core/buildinfo.js looks for, as JSON string literals. */
export function buildDefines(root = ROOT, opts) {
  const b = readBuildInfo(root, opts);
  return { __KLC_APP_VERSION__: JSON.stringify(b.app), __KLC_LAYOUT_VERSION__: JSON.stringify(b.layout) };
}
