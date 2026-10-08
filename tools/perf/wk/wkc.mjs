// [perf] Copied from the splat lane's tools/splat/wk/wkc.mjs: the client of the WebKit session (wks.swift): send(op) writes <workdir>/cmd.json and waits for res-<id>.json.
//   import { open } from './wkc.mjs';  const s = open('/path/workdir');  await s.eval('return 1+1');  await s.shot('out.png');
// CLI: bun wkc.mjs <workdir> eval "<js body>" | shot <out.png> | load <url> | ready | quit | console
import { writeFileSync, readFileSync, existsSync, renameSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function open(dir) {
  mkdirSync(dir, { recursive: true });
  let id = Math.floor(Date.now() / 1000) % 100000 * 10;
  const send = async (cmd, timeoutS = 120) => {
    const n = ++id, tmp = join(dir, "cmd.tmp"), dst = join(dir, "cmd.json"), res = join(dir, `res-${n}.json`);
    writeFileSync(tmp, JSON.stringify({ ...cmd, id: n, timeout: timeoutS })); renameSync(tmp, dst);
    const t0 = Date.now();
    while (Date.now() - t0 < (timeoutS + 20) * 1000) {
      if (existsSync(res)) { await sleep(20); const r = JSON.parse(readFileSync(res, "utf8")); rmSync(res, { force: true }); return r; }
      await sleep(40);
    }
    throw new Error("no answer from the session for " + cmd.op);
  };
  const api = {
    send,
    /** Run an async function body in the page; returns its value (JSON-able) or throws with the page error. */
    async eval(js, timeoutS = 120) { const r = await send({ op: "eval", js }, timeoutS); if (!r.ok) throw new Error(r.error); return r.value; },
    async load(url, timeoutS = 300) { const r = await send({ op: "load", url }, timeoutS); if (!r.ok) throw new Error(r.error); return r.value; },
    /** Wait for window.__ready (the page's own flag), then pause the free-running frame loop. */
    async ready(timeoutS = 600) {
      const t0 = Date.now();
      for (;;) {
        const r = await api.eval("return JSON.stringify({ ready: window.__ready === true, fatal: window.__fatal ? String(window.__fatal) : null, errors: (window.__errors||[]).length })", 30).catch((e) => ({ err: String(e) }));
        const v = typeof r === "string" ? JSON.parse(r) : r;
        if (v && v.ready) { await api.eval("window.__raf.pause(); return 1"); return { ms: Date.now() - t0, ...v }; }
        if (v && v.fatal) throw new Error("fatal " + v.fatal);
        if (Date.now() - t0 > timeoutS * 1000) throw new Error("not ready after " + timeoutS + " s: " + JSON.stringify(v));
        await sleep(1500);
      }
    },
    /** n synchronous frames of the app loop, then the canvas as a PNG file (shot mode keeps the drawing buffer). */
    async shot(file, frames = 3, canvasSel = "#scene") {
      const d = await api.eval(`window.__raf.step(${frames}); const c = document.querySelector(${JSON.stringify(canvasSel)}); return c.toDataURL('image/png');`, 120);
      writeFileSync(file, Buffer.from(String(d).replace(/^data:image\/png;base64,/, ""), "base64")); return file;
    },
    /** The whole window, HUD included. */
    async page(file) { const r = await send({ op: "page", file }, 60); if (!r.ok) throw new Error(r.error); return r.value; },
    async console() { return JSON.parse(await api.eval("return JSON.stringify(window.__console||[])", 30)); },
    async quit() { try { await send({ op: "quit" }, 10); } catch { /* gone */ } },
  };
  return api;
}

if (import.meta.main) {
  const [dir, op, ...rest] = process.argv.slice(2);
  const s = open(dir);
  if (op === "eval") console.log(JSON.stringify(await s.eval(rest.join(" "))));
  else if (op === "shot") console.log(await s.shot(rest[0], Number(rest[1] || 3)));
  else if (op === "load") console.log(await s.load(rest[0]));
  else if (op === "ready") console.log(JSON.stringify(await s.ready(Number(rest[0] || 600))));
  else if (op === "console") console.log((await s.console()).join("\n"));
  else if (op === "quit") await s.quit();
  else console.error("usage: wkc.mjs <workdir> eval|shot|load|ready|console|quit ...");
}
