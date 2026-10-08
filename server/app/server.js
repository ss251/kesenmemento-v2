// Kesennuma Living City — production server (Railway). Read-only: static app + data + /api/live + /api/jpyc (a cached read proxy). No write routes.
// server/app/stage.sh copies this file, static.js and jpyc.js to the root of the Railway bundle, beside public/ (the built app),
// data/, src/ and scripts/ (the /api/live modules), so the imports below are bundle-relative.
import { join } from "node:path";
import { liveRoutes } from "./src/server/live.js";
import { serveFile, inside } from "./static.js";
import { buildAllowlist, createJpycProxy } from "./jpyc.js";
const ROOT = import.meta.dir, DIST = join(ROOT, "public"), DATA = join(ROOT, "data");
const PORT = Number(process.env.PORT || 8080);
// /api/jpyc: the shops of data/shops/jpyc.json only (a missing or damaged file is an empty allowlist: the route then answers 404). JPYC_DEV=1 also allows entries still waiting for their consent record; JPYC_EC_BASE points at a mock; JPYC_WARM=0 switches the background refresh of the shops' lists off.
const jpyc = createJpycProxy({ allow: buildAllowlist(await Bun.file(join(DATA, "shops/jpyc.json")).json().catch(() => null), { dev: process.env.JPYC_DEV === "1" }), upstream: process.env.JPYC_EC_BASE || undefined, warm: process.env.JPYC_WARM !== "0", log: console.error });
console.log(`jpyc: ${jpyc.allow.shops.size ? "on for " + [...jpyc.allow.shops.keys()].join(", ") : "off (no shop is switched on in data/shops/jpyc.json: /api/jpyc answers 404, the platform is never asked)"}`);   // (the switch: docs/jpyc/README.md)
Bun.serve({
  port: PORT, hostname: "0.0.0.0", idleTimeout: 30,   // (Bun's default is 10 s: a /api/jpyc request that waits for the platform's own 10 s deadline needs more than that)
  async fetch(req) {
    const u = new URL(req.url); let p; try { p = decodeURIComponent(u.pathname); } catch { return new Response("bad", { status: 400 }); }
    if (req.method === "POST" && p === "/api/live/ais") {
      try { const r = await liveRoutes(req); if (r) return r; } catch (e) { console.error("live", e?.message); }
      return new Response("not found", { status: 404 });
    }
    if (req.method !== "GET" && req.method !== "HEAD") return new Response("read-only", { status: 405 });
    // (.br / .gz are the precompressed siblings: served only through Accept-Encoding, never by name)
    if (p.includes("..") || /\/\./.test(p) || p.endsWith(".map") || /\.(br|gz)$/.test(p)) return new Response("not found", { status: 404 });
    if (p === "/healthz") return new Response("ok");
    if (p === "/api/jpyc" || p.startsWith("/api/jpyc/")) return jpyc.handle(p, req.method);
    // [play:missions] A shop may ask whether a voucher code is well formed. Nothing is stored. The game never calls this.
    if (p === "/api/play/voucher/check") {
      try {
        const { voucherHttp } = await import("./src/anime/play/missions/voucher.js");
        return voucherHttp(u);
      } catch {
        return new Response(JSON.stringify({ ok: false }), { status: 404, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
      }
    }
    if (p === "/api/live" || p.startsWith("/api/live/")) {
      try { const r = await liveRoutes(req, u); if (r) return r; } catch (e) { console.error("live", e?.message); }
      return serveFile(join(DATA, "live/sample.json"), { cache: "no-store", req });
    }
    if (p.startsWith("/data/")) return serveFile(inside(DATA, p.slice(6)), { cache: "public, max-age=3600", req });
    if (p === "/" || p === "/index.html") return serveFile(join(DIST, "index.html"), { cache: "no-cache", req });
    return serveFile(inside(DIST, p.slice(1)), { cache: "public, max-age=86400", req });
  },
});
console.log(`Kesennuma Living City on :${PORT}`);
