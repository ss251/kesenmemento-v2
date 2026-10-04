// [v3:fix] Tests for the fix pass (art review + correctness review, 2026-09-29): walk spots, the sea as a wall on foot,
// hard shores (no sand against quay walls, no street furniture on the promenade deck), the Kanae axis, a full harbour,
// the token route, stale live data, the machine gate and the npm scripts.
import { describe, test, expect } from "bun:test";
import { resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import * as L from "../src/anime/world/layout.js";
import { hardShores, APRON } from "../src/anime/world/layout/hardshore.js";
import { fitCrossing, KANAE_DEG } from "../src/anime/world/harbor/world.js";
import { tourStops, FRAMES, HIDDEN_STOPS } from "../src/anime/world/life/tour.js";
import { staleness } from "../src/anime/world/life/live.js";
import { Physics } from "../src/anime/core/physics.js";
import { allowed } from "../scripts/public-mirror.js";

const ROOT = resolve(import.meta.dir, "..");
const read = (p) => readFileSync(resolve(ROOT, p), "utf8");
const inBox = (x, z, o) => { const c = Math.cos(o.rotY), s = Math.sin(o.rotY), dx = x - o.cx, dz = z - o.cz; return Math.abs(dx * c - dz * s) < o.w / 2 && Math.abs(dx * s + dz * c) < o.d / 2; };
const nearLots = L.LOTS.filter((l) => l.zone !== "far");

describe("walk spots", () => {
  const stops = tourStops(L, { ukimido: { walk: [[341.6, -23.4], [341.6, -29.9], [341.6, -33.65]] } });
  test("every UI stop has a walk spot, on land (or the 浮見堂 deck), outside every building footprint", () => {
    expect(stops.length).toBe(7);
    for (const s of stops) {
      expect(s.walk).toBeTruthy();
      if (s.id !== "ukimido") expect(L.isWater(s.walk.x, s.walk.z)).toBe(false);
      expect(nearLots.find((l) => inBox(s.walk.x, s.walk.z, l.obb))?.id ?? null).toBeNull();
    }
  });
  test("the layout's TOUR walks match the UI (tourwalk:<id> shows the same picture), 唐桑 is hidden", () => {
    for (const t of L.TOUR) {
      const id = t.id === "bay" ? "hero" : t.id;
      if (HIDDEN_STOPS.has(id)) { expect(stops.find((s) => s.id === id)).toBeUndefined(); continue; }
      const f = FRAMES[id]?.walk;
      if (f) expect([t.walk.x, t.walk.z]).toEqual([f.x, f.z]);
    }
    expect([L.HERO.walk.x, L.HERO.walk.z]).toEqual([FRAMES.hero.walk.x, FRAMES.hero.walk.z]);
  });
  test("the walk bounds reach the bridges' walk spots", () => {
    const b = L.WORLD.play;
    for (const s of stops) { expect(s.walk.x).toBeGreaterThan(b.x0); expect(s.walk.x).toBeLessThan(b.x1); expect(s.walk.z).toBeGreaterThan(b.z0); expect(s.walk.z).toBeLessThan(b.z1); }
  });
});

describe("the sea is a wall on foot", () => {
  test("standable: land yes, open water no, a walk box over the water yes", () => {
    const P = new Physics(L.heightAt, L.isWater);
    expect(P.standable(168, -122)).toBe(true);
    expect(P.standable(156, -33)).toBe(false);
    P.addWalkBox(156, -33, 4, 4, 0, 2.0);
    expect(P.standable(156, -33)).toBe(true);
  });
});

describe("hard shores", () => {
  const H = hardShores(L);
  test("quay / seawall / promenade lines only, with apron widths", () => {
    expect(H.segs.length).toBeGreaterThan(100);
    expect(APRON.promenade).toBeGreaterThan(APRON.seawall);
  });
  test("the terrain in front of a quay face sits under the sea; land well behind it is untouched", () => {
    let front = 0, n = 0;
    for (const s of H.segs.slice(0, 400)) {
      const t = s.len / 2, x = s.ax + s.ux * t + s.nx * 1.5, z = s.az + s.uz * t + s.nz * 1.5;
      n++; if (H.clampY(x, z, 1.2) <= (L.SEA.level - 2)) front++;
      const bx = s.ax + s.ux * t - s.nx * 12, bz = s.az + s.uz * t - s.nz * 12;
      if (!H.inApron(bx, bz, 0) && H.clampY(bx, bz, 3.3) !== 3.3) throw new Error(`land 12 m behind a face was clamped at ${bx},${bz}`);
    }
    expect(front / n).toBeGreaterThan(0.95);
  });
  test("the promenade deck counts as an apron (no guardrails or poles there)", () => {
    const p = H.segs.find((s) => s.apron === APRON.promenade);
    expect(p).toBeTruthy();
    const x = p.ax + p.ux * p.len / 2 - p.nx * 3, z = p.az + p.uz * p.len / 2 - p.nz * 3;
    expect(H.inApron(x, z)).toBe(true);
  });
  test("near(): 1 at a quay face, 0 far out in the bay", () => {
    const s = H.segs[0];
    expect(H.near(s.ax + s.nx * 2, s.az + s.nz * 2)).toBeGreaterThan(0.9);
    expect(H.near(156, -33)).toBeLessThan(0.1);
  });
});

describe("Kanae Ohashi on its real axis", () => {
  test("the fit runs at 120 deg through the verified centre; the main span is over water", () => {
    const f = fitCrossing(L, { x: 1492.0, z: 1465.4 }, { half: 672, crest: 32, deg: KANAE_DEG });
    expect(f.deg).toBe(120);
    expect(f.water).toBeGreaterThan(300);   // metres of water on the axis through the centre (the 360 m main span)
    let wet = 0, n = 0;
    for (let s = -150; s <= 150; s += 10) { const x = 1492.0 + Math.cos(120 * Math.PI / 180) * s, z = 1465.4 + Math.sin(120 * Math.PI / 180) * s; n++; if (L.isWater(x, z)) wet++; }
    expect(wet / n).toBeGreaterThan(0.9);
  });
  test("SPOTS.kanae is the over-water line, within 5 deg of 120", () => {
    const k = L.SPOTS.kanae, deg = ((Math.atan2(k.b[1] - k.a[1], k.b[0] - k.a[0]) * 180 / Math.PI) + 360) % 180;
    expect(Math.abs(deg - 120)).toBeLessThan(5);
  });
});

describe("serving and live data", () => {
  test("the public mirror never passes the tiles token route", () => {
    expect(allowed("/api/config")).toBe(false);
    expect(allowed("/api/live")).toBe(true);
    expect(read("scripts/serve.js")).not.toMatch(/api\/config/);   // the photoreal-tiles token route is gone
  });
  test("cached data over 1 h old or an old port date is labelled stale, never ライブ", () => {
    const now = Date.parse("2026-09-30T03:00:00Z");   // 12:00 JST
    const fresh = { weather: { origin: "live", fetchedAt: "2026-09-30T02:55:00Z" }, port: { origin: "live", date: "2026-09-30", fetchedAt: "2026-09-30T02:50:00Z" } };
    expect(staleness(fresh, "live", now).stale).toBe(false);
    const cached = { ...fresh, weather: { origin: "cache", fetchedAt: "2026-09-29T20:00:00Z" } };
    expect(staleness(cached, "live", now)).toEqual({ stale: true, at: Date.parse("2026-09-29T20:00:00Z") });
    expect(staleness({ ...fresh, port: { ...fresh.port, date: "2026-09-28" } }, "live", now).stale).toBe(true);
    expect(staleness({ ...fresh, port: { ...fresh.port, date: "2026-10-01" } }, "live", now).stale).toBe(false);   // tomorrow's 予定
    expect(staleness(cached, "sample", now).stale).toBe(false);   // samples are labelled サンプル instead
  });
});

describe("machine rules, scripts and shipped text", () => {
  test("gate.sh writes its pid, exports KLC_GATE and watches the load; cdp launch() requires the gate", () => {
    const g = read("tools/anime/gate.sh");
    expect(g).toMatch(/echo \$\$ > "\$LOCK\/pid"/);
    expect(g).toMatch(/export KLC_GATE=1/);
    expect(g).toMatch(/l>18/);
    expect(read("tools/anime/cdp.mjs")).toMatch(/process\.env\.KLC_GATE !== '1'/);
  });
  test("every npm script points at a file that exists", () => {
    const pkg = JSON.parse(read("package.json"));
    for (const [k, v] of Object.entries(pkg.scripts)) for (const m of v.matchAll(/(?:scripts|tools)\/[\w/.-]+\.(?:js|mjs|sh)/g)) expect(existsSync(resolve(ROOT, m[0])), `${k}: ${m[0]}`).toBe(true);
  });
  test("no Sakura place names or real-looking phone numbers left in rendered text", () => {
    for (const f of ["src/anime/world/town/kit/tex.js", "src/anime/world/town/sakura/vehicles_atlas.js", "src/anime/world/town/sakura/poles_atlas.js"]) {
      const code = read(f).split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
      expect(code).not.toMatch(/桜ヶ丘|SAKURAGAOKA|Sakuragaoka Sta|☎/);
    }
  });
  test("the build ships the MIT licence texts the credit links to", () => {
    expect(read("scripts/build-web.js")).toMatch(/licenses/);
    expect(read("src/anime/ui/hud.js")).toMatch(/licenses\/sakuragaoka-station\.txt/);
  });
  test("the shadow map type is the non-deprecated PCF", () => {
    expect(read("src/anime/main.js")).toMatch(/THREE\.PCFShadowMap/);
    expect(read("src/anime/main.js")).not.toMatch(/PCFSoftShadowMap/);
  });
});
