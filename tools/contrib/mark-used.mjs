// Mark accepted contributor submissions as used once the release that fixes them has shipped.
//
//   ADMIN_TOKEN=... env -u NODE_OPTIONS bun tools/contrib/mark-used.mjs --api <url> --version v0.5.0 --from raw/contrib/SWEEP.md
//   ADMIN_TOKEN=... env -u NODE_OPTIONS bun tools/contrib/mark-used.mjs --api <url> --version v0.5.0 --ids id1,id2,id3
//
// From a SWEEP.md only the lines ticked `- [x]` (fixed in this release) are marked; `--all` marks every listed
// line. Calls POST /api/contrib/v1/admin/submissions/mark-used. Contributors then see 「反映済み (version)」 in
// マイ投稿. Only accepted items change; the answer lists the ones that were skipped and why.
import { readFileSync } from "node:fs";
import { adminClient, assertSafeApi, idsFromSweep } from "./pull.mjs";

/**
 * The ids a mark-used call should send: explicit `ids`, or the lines of a SWEEP.md (ticked ones unless `all`).
 * @param {{ids?: string, from?: string, all?: boolean}} o
 * @returns {{ids: string[], listed: number}} `listed` is how many lines the file has, ticked or not
 */
export function resolveIds({ ids, from, all = false }) {
  if (ids) { const list = ids.split(",").map((s) => s.trim()).filter(Boolean); return { ids: list, listed: list.length }; }
  if (!from) return { ids: [], listed: 0 };
  readFileSync(from); // a clear error if the file is missing
  return { ids: idsFromSweep(from, { all }), listed: idsFromSweep(from, { all: true }).length };
}

/**
 * @param {{api: string, token: string, ids: string[], version: string, fetchImpl?: typeof fetch}} o
 * @returns {Promise<{version: string, updated: string[], skipped: Array<{id: string, reason: string}>, notFound: string[]}>}
 */
export async function markUsed({ api, token, ids, version, fetchImpl = fetch }) {
  if (!token) throw new Error("set ADMIN_TOKEN in the environment");
  if (!version) throw new Error("--version is required (a release tag or commit)");
  if (!ids.length) throw new Error("no ids: give --ids or --from <SWEEP.md>");
  const client = adminClient({ api, token, fetchImpl });
  const out = { version, updated: [], skipped: [], notFound: [] };
  for (let i = 0; i < ids.length; i += 500) { // the API takes at most 500 ids per call
    const r = await client.post("/api/contrib/v1/admin/submissions/mark-used", { ids: ids.slice(i, i + 500), version });
    out.updated.push(...r.updated); out.skipped.push(...r.skipped); out.notFound.push(...r.notFound);
  }
  return out;
}

if (import.meta.main) {
  const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 && !process.argv[i + 1]?.startsWith("--") ? process.argv[i + 1] : undefined; };
  try {
    const api = assertSafeApi(arg("--api") ?? "", { allowHttp: process.argv.includes("--allow-http") });
    const { ids, listed } = resolveIds({ ids: arg("--ids"), from: arg("--from"), all: process.argv.includes("--all") });
    if (!ids.length && arg("--from")) throw new Error(`no ticked lines in ${arg("--from")} (${listed} listed): tick the fixed ones with [x], or use --all`);
    if (arg("--from") && !process.argv.includes("--all")) console.log(`${ids.length} of ${listed} listed items are ticked`);
    const r = await markUsed({ api, token: process.env.ADMIN_TOKEN, ids, version: arg("--version") });
    console.log(`marked ${r.updated.length} as used in ${r.version}${r.skipped.length ? `, skipped ${r.skipped.length}` : ""}${r.notFound.length ? `, not found ${r.notFound.length}` : ""}`);
    for (const s of r.skipped) console.log(`  skipped ${s.id}: ${s.reason}`);
    for (const id of r.notFound) console.log(`  not found ${id}`);
    process.exit(r.notFound.length ? 1 : 0);
  } catch (e) {
    console.error(`mark-used failed: ${String(e?.message ?? e).split("\n")[0]}`);
    console.error("usage: ADMIN_TOKEN=... bun tools/contrib/mark-used.mjs --api <url> --version <tag> (--from SWEEP.md [--all] | --ids a,b,c)");
    process.exit(2);
  }
}
