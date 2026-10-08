// Contributor backend: serves the admin single-page app (server/contrib/admin/*) at /admin.
//
// The page is static and has no build step. The only dynamic part is a JSON block injected into the HTML with the
// few values the page needs (API base, app URL for "open in app" links, default points). The page's scripts and
// styles are separate same-origin files, so a strict Content-Security-Policy (no inline script or style) holds.
import { join } from "node:path";
import { VERSION } from "./config.js";

const DIR = join(import.meta.dir, "admin");

/** The policy for the admin page: same-origin only; images may also be blob: (authenticated fetches become object URLs). */
export const ADMIN_CSP = [
  "default-src 'none'", "script-src 'self'", "style-src 'self'", "img-src 'self' blob: data:", "connect-src 'self'",
  "font-src 'self'", "manifest-src 'self'", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'", "object-src 'none'",
].join("; ");

const FILES = {
  "app.js": "text/javascript; charset=utf-8",
  "lib.js": "text/javascript; charset=utf-8",
  "app.css": "text/css; charset=utf-8",
  "icon.svg": "image/svg+xml",
};

const cache = new Map();
async function read(name) {
  if (!cache.has(name)) cache.set(name, await Bun.file(join(DIR, name)).text());
  return cache.get(name);
}

/** JSON safe inside a <script type="application/json"> element: "<" cannot close the tag. */
const safeJson = (v) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

const headers = (type) => ({
  "content-type": type, "cache-control": "no-cache", "content-security-policy": ADMIN_CSP, "x-frame-options": "DENY",
});

async function page(c) {
  const html = (await read("index.html")).replace("__CONFIG__", safeJson({
    api: "/api/contrib/v1", appUrl: c.config.appUrl, points: c.config.points, version: VERSION, maxPhotos: c.config.maxPhotos,
  }));
  return new Response(html, { headers: headers("text/html; charset=utf-8") });
}

async function asset(c) {
  const name = c.params.file;
  if (!Object.hasOwn(FILES, name)) return new Response("not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  return new Response(await read(name), { headers: headers(FILES[name]) });
}

/** @type {Array<{method: string, path: string, label: string, auth: null, limit: false, handler: Function}>} */
export const uiRoutes = [
  { method: "GET", path: "/admin", label: "admin.page", auth: null, limit: false, handler: page },
  { method: "GET", path: "/admin/:file", label: "admin.asset", auth: null, limit: false, handler: asset },
  { method: "GET", path: "/", label: "root", auth: null, limit: false, handler: () => new Response(JSON.stringify({ service: "kesennuma-contrib", version: VERSION, health: "/api/contrib/v1/health", admin: "/admin" }), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } }) },
];
