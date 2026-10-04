// Local server for the web app (Bun.serve, port 8787).
//   env -u NODE_OPTIONS bun run scripts/serve.js [--port 8787] [--no-build]
// Routes: /                  dist/index.html (built on start unless --no-build)
//         /data/...          project data/ (real outputs of P1-P4, tour.json, i18n.json)
//         /fixtures/...      src/web/fixtures (synthetic stand-ins, used when data/ lacks a group)
//         /api/live          src/server/live.js liveRoutes() when present, else the last state/sample snapshot
//         /api/splat-transform  POST {name, transform} from the ?dev=1 panel -> data/splats/{name}/transform.json
//         /vendor/...        local copies of runtime assets so nothing depends on GitHub at runtime:
//                            /vendor/atmosphere/* (takram precomputed textures, stars), /vendor/clouds/* (weather, shape,
//                            turbulence), /vendor/draco/* (three's Draco decoder).
import { resolve, join, normalize } from "node:path";
import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { buildWeb } from "./build-web.js";

const ROOT = resolve(import.meta.dir, "..");
const DIST = join(ROOT, "dist"), DATA = join(ROOT, "data"), FIX = join(ROOT, "src/web/fixtures");
// vendored runtime assets
export const VENDOR = {
  atmosphere: join(ROOT, "node_modules/@takram/three-atmosphere/assets"),
  clouds: join(ROOT, "node_modules/@takram/three-clouds/assets"),
  draco: join(ROOT, "node_modules/three/examples/jsm/libs/draco/gltf"),
};

let liveRoutes = null;
async function loadLive() {
  const p = join(ROOT, "src/server/live.js");
  if (!existsSync(p)) return;
  try { const m = await import(p); liveRoutes = m.liveRoutes ?? null; } catch (e) { console.warn("live.js not loaded:", e.message); }
}

function fileIn(base, rel) {
  const p = normalize(join(base, rel));
  return p.startsWith(base + "/") || p === base ? p : null;
}
async function sendFile(path, req, cache = "no-cache") {
  if (!path) return new Response("forbidden", { status: 403 });
  const f = Bun.file(path);
  if (!(await f.exists())) return new Response("not found", { status: 404 });
  const headers = { "cache-control": cache };
  if (path.endsWith(".f32") || path.endsWith(".bin") || path.endsWith(".rad") || path.endsWith(".radc") || path.endsWith(".ply") || path.endsWith(".exr")) headers["content-type"] = "application/octet-stream";
  if (path.endsWith(".wasm")) headers["content-type"] = "application/wasm";
  if (req.method === "HEAD") return new Response(null, { headers: { ...headers, "content-length": String(f.size), "content-type": headers["content-type"] ?? f.type } });
  return new Response(f, { headers });
}

async function liveFallback() {
  for (const p of [join(DATA, "live/state.json"), join(DATA, "live/sample.json"), join(FIX, "live/sample.json")]) {
    const f = Bun.file(p); if (await f.exists()) return new Response(f, { headers: { "content-type": "application/json", "cache-control": "max-age=60" } });
  }
  return new Response("no live data", { status: 404 });
}

export async function start({ port = 8787, build = true, quiet = false, dist = DIST } = {}) {   // dist: serve a private build (scripts/render/cdp.js)
  if (build) await buildWeb({ quiet });
  await loadLive();
  const server = Bun.serve({
    port,
    hostname: "127.0.0.1",
    async fetch(req) {
      const url = new URL(req.url), p = decodeURIComponent(url.pathname);
      if (p.startsWith("/vendor/")) {
        const rest = p.slice(8), slash = rest.indexOf("/");
        const base = VENDOR[rest.slice(0, slash)];
        return base ? sendFile(fileIn(base, rest.slice(slash + 1)), req, "max-age=86400") : new Response("not found", { status: 404 });
      }
      if (p.startsWith("/api/")) {
        if (liveRoutes) { try { const r = await liveRoutes(req); if (r) return r; } catch (e) { console.warn("liveRoutes:", e.message); } }
        if (p === "/api/live") return liveFallback();
        if (p === "/api/splat-transform" && req.method === "POST") {
          const body = await req.json().catch(() => null);
          if (!body || !/^[a-z0-9_-]+$/.test(body.name ?? "") || !Array.isArray(body.transform?.position)) return new Response("bad request", { status: 400 });
          const manifest = join(DATA, "splats/splats.json");
          if (body.name === "model" && existsSync(manifest)) {             // P3 contract: the model transform lives in splats.json
            const j = await Bun.file(manifest).json();
            if (!existsSync(join(DATA, "splats/splats.orig.json"))) copyFileSync(manifest, join(DATA, "splats/splats.orig.json"));
            j.model.transform = { ...j.model.transform, ...body.transform }; j.model.nudgedAt = new Date().toISOString();
            await Bun.write(manifest, JSON.stringify(j, null, 1) + "\n");
            return Response.json({ ok: true, path: "data/splats/splats.json" });
          }
          const dir = join(DATA, "splats", body.name), out = join(dir, "transform.json");
          mkdirSync(dir, { recursive: true });
          let prev = {}; if (existsSync(out)) { prev = await Bun.file(out).json().catch(() => ({})); if (!existsSync(join(dir, "transform.orig.json"))) copyFileSync(out, join(dir, "transform.orig.json")); }
          const next = { ...prev, ...body.transform, nudgedAt: new Date().toISOString() };
          await Bun.write(out, JSON.stringify(next, null, 1));
          return Response.json({ ok: true, path: out.slice(ROOT.length + 1) });
        }
        return new Response("not found", { status: 404 });
      }
      if (p.startsWith("/data/")) return sendFile(fileIn(DATA, p.slice(6)), req, "max-age=60");
      if (p.startsWith("/fixtures/")) return sendFile(fileIn(FIX, p.slice(10)), req, "max-age=60");
      return sendFile(fileIn(dist, p === "/" ? "index.html" : p.slice(1)), req, p === "/" || p.endsWith(".html") ? "no-cache" : "max-age=3600");
    },
  });
  const u = `http://127.0.0.1:${server.port}/`;
  if (!quiet) console.log(`Kesennuma Living City -> ${u}${liveRoutes ? "  (live routes from src/server/live.js)" : ""}`);
  return { server, url: u };
}

if (import.meta.main) {
  const i = process.argv.indexOf("--port");
  await start({ port: i > 0 ? Number(process.argv[i + 1]) : 8787, build: !process.argv.includes("--no-build") });
}
