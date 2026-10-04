// Shared headless-Chrome helper for stills, the film and the v2 QA shots (package v2:portal-cinema).
// Real GPU (--use-angle=metal, never --disable-gpu), real-time rAF (no virtual time: it starves requestAnimationFrame),
// a private web build so concurrent agents rebuilding dist/ never break a render, and the machine rules of V2-SPEC §13.
//
//   import { launch, machine } from "./cdp.js";
//   const b = await launch({ serve });                    // serve: async ({ port }) => { server, url }
//   const p = await b.page({ width: 1920, height: 1080 });
//   await p.nav("?stop=bay&t=golden&portal=0&ui=0"); await p.ready();
//   const png = await p.shot();                          // Buffer
//   await b.close();
import { resolve, join } from "node:path";
import { mkdirSync, rmSync, existsSync, renameSync } from "node:fs";
import { start } from "../serve.js";

export const ROOT = resolve(import.meta.dir, "../..");
export const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const PRIVATE_DIST = join(ROOT, "dist/.cinema-web");

// ------------------------------------------------------------------ machine rules (V2-SPEC §13)
export const machine = {
  /** 1/5/15-minute load averages. */
  load() {
    const out = Bun.spawnSync(["uptime"]).stdout.toString();
    const m = out.match(/load averages?:\s*([\d.]+),?\s+([\d.]+),?\s+([\d.]+)/);
    return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0];
  },
  /** UTC minutes since midnight. */
  utcMinutes(d = new Date()) { return d.getUTCHours() * 60 + d.getUTCMinutes(); },
  /** 14:00Z-02:00Z: no film, no sustained GPU work; screenshots only at 5-min load <= 16. */
  inQuietWindow(d = new Date()) { const m = machine.utcMinutes(d); return m >= 14 * 60 || m < 2 * 60; },
  /**
   * Film gate: may start before 12:45Z and finish by 14:00Z, or start after 02:00Z (and still finish by 14:00Z).
   * -> { ok, reason }
   */
  filmGate(estimateMs, d = new Date()) {
    const m = machine.utcMinutes(d), end = m + estimateMs / 60000;
    if (machine.inQuietWindow(d)) return { ok: false, reason: "14:00Z-02:00Z: no film renders" };
    if (m >= 12 * 60 + 45) return { ok: false, reason: "starts after 12:45Z" };
    if (end > 14 * 60) return { ok: false, reason: `would finish at ${Math.floor(end / 60)}:${String(Math.round(end % 60)).padStart(2, "0")}Z, after 14:00Z` };
    return { ok: true, reason: "inside the film window" };
  },
  /** Wait (short sleeps, up to maxWaitMs) while the 5-minute load is above `max`; throws above `hard` or on timeout. */
  async waitLoad({ max = 20, hard = 22, maxWaitMs = 600000, log = console.error } = {}) {
    const t0 = Date.now();
    for (;;) {
      const l5 = machine.load()[1];
      if (l5 <= max) return l5;
      if (l5 > hard) throw new Error(`5-minute load ${l5} > ${hard}: heavy step stopped (V2-SPEC §13)`);
      if (Date.now() - t0 > maxWaitMs) throw new Error(`5-minute load stayed ${l5} > ${max} for ${maxWaitMs / 60000} min`);
      log(`load ${l5} > ${max}; waiting`); await Bun.sleep(15000);
    }
  },
  /** Gate for a screenshot/still step: before 14:00Z load<=20; in the quiet window load<=16 and nothing heavy. */
  async gateShots({ heavy = false } = {}) {
    if (machine.inQuietWindow()) {
      if (heavy) throw new Error("14:00Z-02:00Z: heavy GPU work (4K stills, film) is not allowed");
      return machine.waitLoad({ max: 16, hard: 16.01, maxWaitMs: 300000 });
    }
    return machine.waitLoad();
  },
};

// ------------------------------------------------------------------ private build
/**
 * The v1/v2 viewer that this private build served has been removed; callers pass `serve` (the anime app brings its
 * own server, see scripts/render/anime-page.js).
 */
export async function buildPrivate() {
  throw new Error("buildPrivate: the v1/v2 viewer was removed; call launch({ serve }) with the anime app's server");
}

// ------------------------------------------------------------------ browser
/**
 * Build + serve + launch Chrome. -> { url, page(opts), close() }
 * port: this package's server port (8803). build: false reuses the last private build.
 */
export async function launch({ port = 8803, build = true, outdir = PRIVATE_DIST, quiet = true, chromeArgs = [], serve = null } = {}) {
  // [v3:life] serve: async ({ port }) => { server, url } replaces the v2 private build + scripts/serve.js (the anime
  // app and the life harness bring their own server).
  let server, url;
  if (serve) ({ server, url } = await serve({ port }));
  else {
    if (build || !existsSync(join(outdir, "index.html"))) await buildPrivate({ outdir });
    ({ server, url } = await start({ port, build: false, quiet: true, dist: outdir }));
  }
  const chrome = Bun.spawn([CHROME, "--headless=new", "--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader",
    "--remote-debugging-port=0", "--window-size=1920,1080", "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--mute-audio",
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows", ...chromeArgs, "about:blank"],
  { stdout: "ignore", stderr: "pipe" });
  // never leave an orphaned headless Chrome on the shared machine
  const killChrome = () => { try { chrome.kill(9); } catch { /* gone */ } };
  process.on("exit", killChrome);
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.once(sig, () => { killChrome(); process.exit(130); });
  let wsUrl = null, buf = "";
  const reader = chrome.stderr.getReader();
  while (!wsUrl) { const { value, done } = await reader.read(); if (done) throw new Error("chrome exited early:\n" + buf); buf += new TextDecoder().decode(value); wsUrl = buf.match(/DevTools listening on (ws:\/\/\S+)/)?.[1]; }
  (async () => { while (!(await reader.read()).done); })();
  const ws = new WebSocket(wsUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pending = new Map(), logs = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    const L = m.sessionId && logs.get(m.sessionId);
    if (!L) return;
    if (m.method === "Runtime.consoleAPICalled") {
      const text = m.params.args.map((a) => a.value ?? a.description).join(" ");
      L.push({ type: m.params.type, text: text.slice(0, 500) });
      if (!quiet && (m.params.type === "error" || m.params.type === "warning")) console.error(`[page ${m.params.type}] ${text.slice(0, 300)}`);
    }
    if (m.method === "Runtime.exceptionThrown") L.push({ type: "exception", text: (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 800) });
    if (m.method === "Log.entryAdded" && m.params.entry.level === "error") L.push({ type: "log-error", text: `${m.params.entry.text} ${m.params.entry.url ?? ""}`.slice(0, 500) });
  };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const i = ++id; pending.set(i, (m) => (m.error ? rej(new Error(method + ": " + m.error.message)) : res(m.result)));
    ws.send(JSON.stringify({ id: i, method, params, ...(sessionId && { sessionId }) }));
  });

  async function page({ width = 1920, height = 1080, dpr = 1, mobile = false } = {}) {
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    logs.set(sessionId, []);
    const S = (m, p) => send(m, p, sessionId);
    await S("Runtime.enable"); await S("Page.enable"); await S("Log.enable").catch(() => {});
    const setSize = async (w, h, d = dpr, mob = mobile) => {
      await S("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: d, mobile: mob, screenWidth: w, screenHeight: h });
      if (mob) await S("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" });
    };
    await setSize(width, height);
    const api = {
      sessionId, S, setSize,
      get logs() { return logs.get(sessionId); },
      errors() { return logs.get(sessionId).filter((l) => l.type === "error" || l.type === "exception" || l.type === "log-error"); },
      async nav(query) { logs.set(sessionId, []); await S("Page.navigate", { url: url + String(query).replace(/^[/?]*/, "?") }); },
      /** Evaluate an expression (awaits promises) and return its JSON value. */
      async eval(expression, { timeout = 120000 } = {}) {
        const r = await Promise.race([
          S("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }),
          Bun.sleep(timeout).then(() => { throw new Error(`eval timeout ${timeout} ms: ${expression.slice(0, 80)}`); }),
        ]);
        if (r.exceptionDetails) throw new Error("page eval: " + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
        return r.result?.value;
      },
      /** Wait for window.__RT.ready (and an optional extra condition expression). */
      async ready({ timeout = 120000, until = "true", poll = 300 } = {}) {
        const t0 = performance.now(); let st = null;
        while (performance.now() - t0 < timeout) {
          st = await api.eval(`(() => { const r = window.__RT; return r && r.ready && (${until}) ? { ready: true, frames: r.frames, frameMs: r.frameMs, tier: window.__KLC?.tier } : null; })()`).catch(() => null);
          if (st?.ready) return { ...st, waitMs: Math.round(performance.now() - t0) };
          await Bun.sleep(poll);
        }
        throw new Error(`page not ready after ${timeout} ms`);
      },
      /** Try __RT.settle({ timeoutMs }); ignore the placeholder that throws. */
      async settle(timeoutMs = 30000) {
        return api.eval(`(async () => { try { return await window.__RT.settle({ timeoutMs: ${timeoutMs} }); } catch (e) { return { placeholder: true, error: String(e.message || e) }; } })()`, { timeout: timeoutMs + 15000 });
      },
      async shot({ format = "png", quality = 95 } = {}) {
        const r = await S("Page.captureScreenshot", { format, ...(format === "jpeg" ? { quality } : {}), captureBeyondViewport: false, optimizeForSpeed: false });
        return Buffer.from(r.data, "base64");
      },
      /**
       * High-quality capture: __RT.capture({ width, height, type, quality }) when the render pipeline provides it,
       * else a viewport screenshot at that size. -> { buf, via }
       */
      async capture({ width, height, type = "png", quality = 0.95, restore = null } = {}) {
        const res = await api.eval(`(async () => { try { const u = await window.__RT.capture({ width: ${width}, height: ${height}, type: ${JSON.stringify(type)}, quality: ${quality} }); return typeof u === "string" ? u : null; } catch (e) { return "ERR:" + (e.message || e); } })()`, { timeout: 180000 });
        if (typeof res === "string" && res.startsWith("data:")) return { buf: Buffer.from(res.slice(res.indexOf(",") + 1), "base64"), via: "__RT.capture" };
        await setSize(width, height, 1, false);
        await Bun.sleep(1200);
        const buf = await api.shot({ format: type === "jpeg" ? "jpeg" : "png", quality: Math.round(quality * 100) });
        if (restore) await setSize(restore.width, restore.height, restore.dpr ?? 1, restore.mobile ?? false);
        return { buf, via: "viewport", note: String(res ?? "") };
      },
      async close() { await send("Target.closeTarget", { targetId }).catch(() => {}); logs.delete(sessionId); },
    };
    return api;
  }
  async function close() {
    await send("Browser.close").catch(() => {});
    setTimeout(() => chrome.kill(9), 3000).unref?.();
    await chrome.exited; server.stop(true);
  }
  return { url, page, close, server };
}

// ------------------------------------------------------------------ attribution burn-in (Google Map Tiles policy, V2-SPEC §11)
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** Page attributions -> plain strings + logo image URLs. Items: { text } | { html } | { type, value } | string. */
export function attributionParts(items) {
  const texts = [], images = [];
  for (const it of items ?? []) {
    if (typeof it === "string") { texts.push(it); continue; }
    if (it?.text) texts.push(it.text);
    if (it?.html) {
      for (const m of String(it.html).matchAll(/<img[^>]*src="([^"]+)"/g)) images.push(m[1]);
      const t = String(it.html).replace(/<[^>]+>/g, " ").replace(/&copy;/g, "©").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
      if (t) texts.push(t);
    }
    if (it?.type === "image" && it.value) images.push(it.value);
    if (it?.type === "string" && it.value) texts.push(it.value);
  }
  return { texts: [...new Set(texts)], images: [...new Set(images)] };
}
export const FALLBACK_ATTRIBUTION = ["出典：国土地理院", "模型：制作者確認中 (placeholder)"];

/** Read the page's attributions (never throws). */
export async function pageAttributions(page) {
  const v = await page.eval(`(() => { try { const a = window.__RT.attributions(); return Array.isArray(a) ? a : []; } catch (e) { return null; } })()`).catch(() => null);
  const parts = attributionParts(v ?? []);
  if (!parts.texts.some((t) => t.includes("国土地理院"))) parts.texts.push(FALLBACK_ATTRIBUTION[0]);
  if (!v) parts.texts.push(FALLBACK_ATTRIBUTION[1]);
  return { ...parts, fromPage: !!v };
}

/**
 * Burn the attribution bar (bottom-right, always visible) and an optional title card into an image with sharp.
 * title: { ja, en, alpha 0..1 }. Returns a Buffer in `format`.
 */
export async function burnIn(buf, { attribution, title = null, format = "png", quality = 95 }) {
  const sharp = (await import("sharp")).default;
  const img = sharp(buf); const { width: W, height: H } = await img.metadata();
  const u = H / 1080, fs = Math.round(15 * u), pad = Math.round(10 * u);
  const logos = [];
  for (const src of attribution.images.slice(0, 2)) {
    try {
      const r = await fetch(src); if (!r.ok) continue;
      const lb = Buffer.from(await r.arrayBuffer());
      logos.push(await sharp(lb).resize({ height: Math.round(18 * u) }).png().toBuffer());
    } catch { /* offline: text still carries the credit */ }
  }
  const logoW = await Promise.all(logos.map(async (l) => (await sharp(l).metadata()).width + pad));
  const logosW = logoW.reduce((a, b) => a + b, 0);
  // text width: full-width CJK glyphs ~1.0 em, Latin ~0.56 em; wrap onto two lines when one would exceed 70% of the frame
  const textW = (t) => [...t].reduce((w, ch) => w + (/[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 1.0 : 0.56), 0) * fs;
  const parts = attribution.texts, sep = "  ·  ";
  let lines = [parts.join(sep)];
  if (textW(lines[0]) + logosW > W * 0.7 && parts.length > 1) {
    let best = null;
    for (let k = 1; k < parts.length; k++) { const a = parts.slice(0, k).join(sep), b = parts.slice(k).join(sep), m = Math.max(textW(a), textW(b)); if (!best || m < best.m) best = { a, b, m }; }
    lines = [best.a, best.b];
  }
  const lh = Math.round(fs * 1.45), th = Math.round(fs * 0.9) + lh * lines.length;
  const bw = Math.min(W - 2 * pad, Math.max(...lines.map(textW)) + logosW + pad * 3), bx = W - bw - pad, by = H - th - pad;
  let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<rect x="${bx}" y="${by}" width="${bw}" height="${th}" rx="${Math.round(Math.min(th, 2 * lh) / 2)}" fill="rgba(10,9,8,0.46)"/>`;
  lines.forEach((ln, i) => { svg += `<text x="${W - pad * 2.2}" y="${by + Math.round(fs * 0.45) + lh * i + fs}" text-anchor="end" font-family="Hiragino Sans, Noto Sans JP, Helvetica, sans-serif" font-size="${fs}" fill="rgba(255,255,255,0.92)">${esc(ln)}</text>`; });
  if (title && title.alpha > 0.001) {
    const a = title.alpha, cy = H * 0.47;
    svg += `<rect x="0" y="0" width="${W}" height="${H}" fill="rgba(6,5,4,${(0.34 * a).toFixed(3)})"/>`;
    svg += `<text x="${W / 2}" y="${cy}" text-anchor="middle" font-family="Hiragino Mincho ProN, Noto Serif JP, serif" font-size="${Math.round(92 * u)}" letter-spacing="${Math.round(10 * u)}" fill="rgba(255,244,228,${a.toFixed(3)})">${esc(title.ja)}</text>`;
    svg += `<rect x="${W / 2 - 60 * u}" y="${cy + 34 * u}" width="${120 * u}" height="${Math.max(1, Math.round(1.5 * u))}" fill="rgba(255,217,160,${(0.9 * a).toFixed(3)})"/>`;
    svg += `<text x="${W / 2}" y="${cy + 92 * u}" text-anchor="middle" font-family="Hiragino Mincho ProN, Georgia, serif" font-size="${Math.round(34 * u)}" letter-spacing="${Math.round(8 * u)}" fill="rgba(255,244,228,${(0.85 * a).toFixed(3)})">${esc(String(title.en).toUpperCase())}</text>`;
  }
  svg += `</svg>`;
  const comp = [{ input: Buffer.from(svg), left: 0, top: 0 }];
  let lx = bx + pad;
  logos.forEach((l, i) => { comp.push({ input: l, left: lx, top: by + Math.round((th - 18 * u) / 2) }); lx += logoW[i]; });
  const out = sharp(buf).composite(comp);
  return format === "jpeg" ? out.jpeg({ quality, chromaSubsampling: "4:4:4", mozjpeg: false }).toBuffer() : out.png({ compressionLevel: 6 }).toBuffer();
}
