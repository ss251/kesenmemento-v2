// tools/anime/cdp.mjs launch() must not leave a headless Chrome behind. On 2026-10-05 Chrome closed its stderr and kept
// running, re-parented to launchd, while launch() threw "chrome exited early": idle orphans stayed up for hours.
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(import.meta.dir, "../tools/anime/cdp.mjs"), "utf8");
const kill = src.slice(src.indexOf("const kill = () => {"), src.indexOf("process.on('exit', kill);"));

describe("cdp.mjs launch(): no orphaned Chrome", () => {
  test("kill() ends every process on the run's profile (not just the spawned PID), anchored to that profile, then removes it", () => {
    expect(kill).toContain("chrome.kill(9)");
    expect(kill).toContain("Bun.spawnSync(['pkill', '-9', '-f', '--', `user-data-dir=${profile.replace(");
    expect(kill).toContain("( |$)`]");
    expect(kill).toContain("rmSync(profile, { recursive: true, force: true })");
    expect(src).toContain("process.on('exit', kill);");
  });
  test("a closed stderr falls back to <profile>/DevToolsActivePort; only a Chrome with no endpoint at all is an error, and it is killed first", () => {
    expect(src).toContain("readFileSync(join(profile, 'DevToolsActivePort'), 'utf8')");
    expect(src).toMatch(/if \(done\) \{\n\s+for \(let i = 0; i < 50 && !wsUrl; i\+\+\) \{ wsUrl = fromPortFile\(\);/);
    expect(src).toContain("if (!wsUrl) { kill(); throw new Error('chrome exited early:\\n' + buf); }");
  });
  test("close() asks the browser to quit (Browser.close, bounded by the socket closing or 2 s) before the kill backstop", () => {
    expect(src).toContain("const wsClosed = new Promise((r) => ws.addEventListener('close', r, { once: true }));");
    expect(src).toContain("send('Browser.close').catch(() => {}); await Promise.race([wsClosed, Bun.sleep(2000)]);");
    expect(src).toMatch(/const close = async \(\) => \{[\s\S]*?ws\.close\(\);[\s\S]*?kill\(\);\n  \};\n  return \{ page, on, close \};/);
  });
  test("the anchored pattern matches its own profile only", () => {
    const profile = "/w/dist/.chrome-12";
    const re = new RegExp(`user-data-dir=${profile.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`);
    expect(re.test("Chrome --user-data-dir=/w/dist/.chrome-12")).toBe(true);
    expect(re.test("Chrome --user-data-dir=/w/dist/.chrome-12 --x")).toBe(true);
    expect(re.test("Chrome --user-data-dir=/w/dist/.chrome-123")).toBe(false);
    expect(re.test("Chrome --user-data-dir=/w/distX.chrome-12")).toBe(false);
  });
});
