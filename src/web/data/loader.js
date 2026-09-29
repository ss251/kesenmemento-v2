// Data resolution: every dataset group is read from data/ when its index file exists there, otherwise from the
// synthetic fixtures (src/web/fixtures, served at fixtures/). Groups resolve independently so real terrain can land
// before real buildings. Nothing here throws for a missing optional file; callers get null.
const cache = new Map();
export const sources = {};                                   // "group/probe" -> "data" | "fixtures" | null (HUD / QA)

async function tryFetch(url) {
  try { const r = await fetch(url); return r.ok ? r : null; } catch { return null; }
}

/** Resolve a group by probing its index file; returns the base URL ("data/terrain/" or "fixtures/terrain/"). */
export async function resolveGroup(group, probe) {
  const key = group + "/" + probe;
  if (cache.has(key)) return cache.get(key);
  const p = (async () => {
    const force = new URLSearchParams(location.search).get("fixtures") === "1";
    for (const root of force ? ["fixtures/"] : ["data/", "fixtures/"]) {
      const r = await tryFetch(root + group + "/" + probe);
      r?.body?.cancel?.();
      if (r) { sources[key] = root.slice(0, -1); return { base: root + group + "/" }; }
    }
    sources[key] = null; return null;
  })();
  cache.set(key, p); return p;
}

export async function json(group, file) {
  const g = await resolveGroup(group, file);
  if (!g) return null;
  const r = await tryFetch(g.base + file); return r ? r.json() : null;
}
export async function binary(group, probe, file) {
  const g = await resolveGroup(group, probe);
  if (!g) return null;
  const r = await tryFetch(g.base + file); return r ? r.arrayBuffer() : null;
}
export async function urlOf(group, probe, file) {
  const g = await resolveGroup(group, probe); return g ? g.base + file : null;
}

/** A top-level data/ file with a fixture fallback of the same name (tour.json, i18n.json). */
export async function topJson(file) {
  for (const root of ["data/", "fixtures/"]) { const r = await tryFetch(root + file); if (r) return r.json(); }
  return null;
}

/** Terrain grid: { meta, heights } or null. */
export async function terrain(name) {
  const meta = await json("terrain", `${name}.json`);
  if (!meta) return null;
  const buf = await binary("terrain", `${name}.json`, `${name}.f32`);
  return buf ? { meta, heights: new Float32Array(buf) } : null;
}

/** Live state: /api/live, then data/live/state.json, data/live/sample.json, fixtures/live/sample.json. */
export async function live() {
  for (const u of ["api/live", "data/live/state.json", "data/live/sample.json", "fixtures/live/sample.json"]) {
    const r = await tryFetch(u);
    if (r) { try { const j = await r.json(); j.__from = u; return j; } catch { /* next */ } }
  }
  return null;
}
