// Data pipeline entry point (`bun run data`): terrain + ortho -> buildings/trees/lines/OBJ -> landmarks.
// Idempotent from the raw/tiles cache. Heavy: run as
//   nice -n 15 taskpolicy -b bun run scripts/build-data.js [--force]
const force = process.argv.includes("--force") ? ["--force"] : [];
const run = async (label, file, extra = []) => {
  const t0 = performance.now();
  console.log(`\n== ${label}`);
  const p = Bun.spawn(["bun", "run", file, ...extra], { stdout: "inherit", stderr: "inherit", cwd: new URL("..", import.meta.url).pathname });
  const code = await p.exited;
  if (code !== 0) throw new Error(`${label} failed (${code})`);
  console.log(`== ${label} ok (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
};
await run("terrain + ortho", "scripts/terrain/build.js", force);
await run("buildings, trees, roads, coast, OBJ", "scripts/buildings/build.js");
await run("landmarks", "scripts/landmarks/build.js");
