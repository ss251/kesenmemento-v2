// Render one or more preview shots of a splat in headless Chrome (Metal ANGLE, real-time rAF).
//   env -u NODE_OPTIONS bun scripts/splat/preview/shoot.js <out.png> "<query>" [<out2.png> "<query2>" ...]
// Env: W,H (default 1280x800), TIMEOUT ms (default 60000). Prints one JSON line per shot.
import { resolve, join } from "node:path";
import { mkdirSync, existsSync } from "node:fs";

const PROJECT = resolve(import.meta.dir, "../../..");
const DIST = join(PROJECT, "raw/work/model/preview-dist");
const W = Number(process.env.W ?? 1280), H = Number(process.env.H ?? 800), TIMEOUT = Number(process.env.TIMEOUT ?? 60000);
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export async function buildPreview() {
  const r = await Bun.build({ entrypoints: [join(import.meta.dir, "index.html")], outdir: DIST, minify: true });
  if (!r.success) throw new Error(r.logs.join("\n"));
}

export async function shoot(jobs) {
  if (!existsSync(join(DIST, "index.html"))) await buildPreview();
  const server = Bun.serve({ port: 0, async fetch(req) {
    const p = decodeURIComponent(new URL(req.url).pathname);
    const file = p.startsWith("/project/") ? join(PROJECT, p.slice(9)) : join(DIST, p === "/" ? "index.html" : p.slice(1));
    if (!file.startsWith(PROJECT)) return new Response("forbidden", { status: 403 });
    const f = Bun.file(file); return (await f.exists()) ? new Response(f) : new Response("not found", { status: 404 });
  } });
  const base = `http://127.0.0.1:${server.port}/`;
  const chrome = Bun.spawn([CHROME, "--headless=new", "--use-angle=metal", "--enable-unsafe-swiftshader", "--remote-debugging-port=0",
    `--window-size=${W},${H}`, "--no-first-run", "--hide-scrollbars", `--user-data-dir=${join(PROJECT, "raw/work/model/.chrome")}`, "about:blank"],
    { stdout: "ignore", stderr: "pipe" });
  let wsUrl = null, buf = ""; const reader = chrome.stderr.getReader();
  while (!wsUrl) { const { value, done } = await reader.read(); if (done) throw new Error("chrome exited:\n" + buf); buf += new TextDecoder().decode(value); wsUrl = buf.match(/DevTools listening on (ws:\/\/\S+)/)?.[1]; }
  (async () => { while (!(await reader.read()).done); })();
  const ws = new WebSocket(wsUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map(); const logs = [];
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") logs.push(m.params.args.map((a) => a.value ?? a.description).join(" "));
    if (m.method === "Runtime.exceptionThrown") logs.push("EXCEPTION " + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text)); };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pending.set(i, (m) => (m.error ? rej(new Error(method + ": " + m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId && { sessionId }) })); });
  const results = [];
  for (const [out, query] of jobs) {
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    const S = (m, p) => send(m, p, sessionId);
    await S("Runtime.enable"); await S("Page.enable");
    await S("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    const t0 = performance.now(); logs.length = 0;
    await S("Page.navigate", { url: base + "?" + query.replace(/^\?/, "") });
    let st = null;
    while (performance.now() - t0 < TIMEOUT) {
      const r = await S("Runtime.evaluate", { expression: "JSON.stringify(window.__RT ?? null)", returnByValue: true });
      st = JSON.parse(r.result.value ?? "null"); if (st?.ready || st?.errors?.length) break; await Bun.sleep(250);
    }
    const shot = await S("Page.captureScreenshot", { format: "png" });
    mkdirSync(resolve(out, ".."), { recursive: true });
    await Bun.write(out, Buffer.from(shot.data, "base64"));
    const res = { out, ms: Math.round(performance.now() - t0), ready: !!st?.ready, numSplats: st?.numSplats, loadMs: st?.loadMs, errors: [...(st?.errors ?? []), ...logs].slice(0, 5) };
    console.log(JSON.stringify(res)); results.push(res);
    await send("Target.closeTarget", { targetId });
  }
  await send("Browser.close").catch(() => {});
  setTimeout(() => chrome.kill(9), 2000);
  await chrome.exited; server.stop(true);
  return results;
}

if (import.meta.main) {
  const a = process.argv.slice(2); const jobs = [];
  for (let i = 0; i + 1 < a.length; i += 2) jobs.push([resolve(a[i]), a[i + 1]]);
  if (process.env.REBUILD) await buildPreview();
  await shoot(jobs);
}
