// Read-only public mirror of the local app server, for sharing over the internet (Tailscale Funnel).
// Proxies GET/HEAD for an allow-list of app paths to the local server and refuses everything else:
// no writes (the dev panel's /api/splat-transform), no dotfiles, no traversal, no source maps.
// [v3:fix] /api/config (the v2 tiles token) is NOT mirrored any more: the v3 anime app never calls it, and a public
// Funnel link must not hand out a map token. Restart a running mirror to pick this up.
//   env -u NODE_OPTIONS bun scripts/public-mirror.js [--port 8791] [--upstream http://127.0.0.1:8790]
//   tailscale funnel --bg --https=443 http://127.0.0.1:8791      (turn off: tailscale funnel --https=443 off)

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = Number(arg("--port", 8791));
const UPSTREAM = arg("--upstream", "http://127.0.0.1:8790");

export const ALLOW = [
  /^\/$/, /^\/index\.html$/,
  /^\/[\w.-]+\.(js|css|png|jpe?g|svg|ico|webp|woff2?)$/,       // built bundle + icons (no .map)
  /^\/(data|fixtures|vendor|assets|draco)\/[\w./-]+$/,          // app data and vendored assets
  /^\/api\/live(\/[\w./-]*)?$/,                                  // live data is read-only JSON
];
export const DENY = [/\.\./, /\/\./, /^\/api\/splat-transform/, /^\/api\/config/, /\.map$/];   // [v3:fix] never the token route

export function allowed(pathname) {
  let p;
  try { p = decodeURIComponent(pathname); } catch { return false; }
  return !DENY.some((r) => r.test(p)) && ALLOW.some((r) => r.test(p));
}

if (import.meta.main) {
  Bun.serve({
    port: PORT,
    hostname: "127.0.0.1",
    async fetch(req) {
      if (req.method !== "GET" && req.method !== "HEAD") return new Response("read-only mirror", { status: 405 });
      const u = new URL(req.url);
      if (!allowed(u.pathname)) return new Response("not found", { status: 404 });
      let r;
      try { r = await fetch(UPSTREAM + u.pathname + u.search, { method: req.method }); }
      catch { return new Response("upstream unavailable", { status: 502 }); }
      const h = new Headers(r.headers);
      h.delete("content-encoding"); h.delete("content-length"); h.delete("set-cookie");
      h.set("x-robots-tag", "noindex, nofollow");
      h.set("x-content-type-options", "nosniff");
      return new Response(r.body, { status: r.status, headers: h });
    },
  });
  console.log(`public mirror http://127.0.0.1:${PORT} -> ${UPSTREAM} (GET/HEAD allow-list only)`);
}
