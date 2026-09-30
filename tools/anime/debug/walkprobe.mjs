// [v4:polish3] Search street-level walk spots that really show a place (qa3's 'place visible' rule, with the renderer's
// own depth): for each place, candidate eyes on the roads round it (rings of 18-90 m, every 15 deg), facing the place;
// a candidate passes when the place's aim point is in the frame and the pre-pass depth there is at least
// min(0.8 d, d - r - 2) (r = the place's own footprint radius), and no more than 20 % of a 16 x 9 ray grid is closer
// than 6 m. Prints the best spots (JSON) and saves a screenshot of each winner.
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/debug/walkprobe.mjs --port 8829 --places "catholic:-340.3,-26.2;..." [--nobuild 1]
import { join, resolve } from 'node:path';
import { build, serve, launch, ROOT } from '../cdp.mjs';

const args = {};
for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) { const k = a.slice(2); const v = process.argv[i + 1] !== undefined && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : '1'; args[k] = v; } }
const port = Number(args.port || 8829);
if ([8787, 8790, 8791].includes(port)) throw new Error('port reserved');
const places = String(args.places || '').split(';').filter(Boolean).map((s) => { const [id, xz] = s.split(':'); const [x, z] = xz.split(',').map(Number); return { id, x, z }; });
const dist = join(ROOT, `dist/anime-${port}`);
if (!args.nobuild) await build({ outdir: dist });
const srv = serve({ port, dist });
let browser;
const out = {};
try {
  browser = await launch({ quiet: true });
  const page = await browser.page({ width: 1280, height: 720 });
  await page.goto(`${srv.url}index.html?shot=1&w=1280&h=720&t=0&q=high&hours=14`);
  await page.waitFor('window.__ready === true', { timeout: 280000 });
  for (const P of places) {
    const cands = await page.eval(`(() => {
      const L = window.__L, net = window.__explore.net, st = window.__life?.tour?.stops?.find((q) => q.id === ${JSON.stringify(P.id)});
      const look = st?.extra && st.drone?.look;   // qa3 aims at the stop's drone look point: so does the probe
      const x = look ? look[0] : ${P.x}, z = look ? look[2] : ${P.z};
      const inBox = (px, pz, l, m = 0) => { const o = l.obb, c = Math.cos(o.rotY), s = Math.sin(o.rotY), dx = px - o.cx, dz = pz - o.cz; return Math.abs(dx * c - dz * s) < o.w / 2 + m && Math.abs(dx * s + dz * c) < o.d / 2 + m; };
      const near = L.LOTS.filter((l) => Math.abs(l.obb.cx - x) < 140 && Math.abs(l.obb.cz - z) < 140);
      let own = near.find((l) => inBox(x, z, l)) || near.filter((l) => inBox(x, z, l, 8)).sort((a, b) => b.obb.w * b.obb.d - a.obb.w * a.obb.d)[0]
        || near.filter((l) => l.landmark && Math.hypot(l.obb.cx - x, l.obb.cz - z) < 40).sort((a, b) => Math.hypot(a.obb.cx - x, a.obb.cz - z) - Math.hypot(b.obb.cx - x, b.obb.cz - z))[0] || null;
      const group = own ? (own.landmark ? near.filter((l) => l.landmark === own.landmark) : [own]) : [];
      let r = 0; for (const l of group) { const o = l.obb, c = Math.cos(o.rotY), s = Math.sin(o.rotY); for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const lx = a * o.w / 2, lz = b * o.d / 2; r = Math.max(r, Math.hypot(o.cx + lx * c + lz * s - x, o.cz - lx * s + lz * c - z)); } }
      const g = L.heightAt(x, z);
      const aimY = own ? (own.groundY ?? g) + Math.max(1.5, Math.min(10, (own.height || 3) * 0.55)) : g + 2;
      const out = [];
      for (const d of [18, 26, 35, 45, 58, 72, 90]) for (let a = 0; a < 360; a += 15) {
        const px = x + Math.sin(a * Math.PI / 180) * (d + r * 0.5), pz = z - Math.cos(a * Math.PI / 180) * (d + r * 0.5);
        if ((!${!!args.offroad} && !net.onRoad(px, pz, -0.3)) || L.isWater(px, pz) || near.some((l) => inBox(px, pz, l, 0.5))) continue;
        const ey = L.heightAt(px, pz) + 1.6, dd = Math.hypot(x - px, z - pz);
        const yaw = Math.atan2(-(x - px), -(z - pz)) * 180 / Math.PI, pitch = Math.max(-6, Math.min(16, Math.atan2(aimY - ey, dd) * 180 / Math.PI));
        out.push({ x: +px.toFixed(1), z: +pz.toFixed(1), yaw: +yaw.toFixed(1), pitch: +pitch.toFixed(1), d: +dd.toFixed(1) });
      }
      return { own: own && { id: own.id, name: own.name || own.kind, r: +r.toFixed(1) }, aim: [x, look ? look[1] : aimY, z], r, cands: out };
    })()`);
    const res = [];
    for (const c of cands.cands) {
      await page.eval(`window.__camSpec(${JSON.stringify(`${c.x},${c.z},${c.yaw},${c.pitch}`)})`);
      await page.frames(4);
      const m = await page.eval(`(() => {
        const cam = window.__ctx.camera, V = cam.position.constructor, t = new V(${cands.aim.join(',')});
        const d = t.distanceTo(cam.position), p = t.clone().project(cam);
        const u = (p.x + 1) / 2, v = (1 - p.y) / 2;
        if (p.z > 1 || u < 0.05 || u > 0.95 || v < 0.05 || v > 0.95) return { d, inFrame: false };
        let depth = 0; for (const [du, dv] of [[0, 0], [0.015, 0], [-0.015, 0], [0, 0.02], [0, -0.02]]) depth = Math.max(depth, window.__ctx.pipeline.depthAt(cam, u + du, v + dv));
        const near = window.__ctx.pipeline.nearShare(cam, 6, 16, 9);
        return { d, inFrame: true, u, v, depth: Number.isFinite(depth) ? depth : 1e4, near };
      })()`);
      const need = Math.min(0.8 * m.d, m.d - cands.r - 2);
      const ok = m.inFrame && m.depth >= need && m.near <= 0.2;
      res.push({ ...c, ...m, need: +need.toFixed(1), ok });
    }
    const D = Math.max(25, Math.min(110, 0.6 * 2 * (cands.r || 15) / Math.tan(26 * Math.PI / 180)));
    const good = res.filter((q) => q.ok).sort((a, b) => Math.abs(a.d - D) + a.near * 40 - (Math.abs(b.d - D) + b.near * 40));
    out[P.id] = { own: cands.own, n: res.length, ok: good.length, best: good.slice(0, 4).map((q) => ({ x: q.x, z: q.z, yaw: q.yaw, pitch: q.pitch, dist: +q.d.toFixed(1), depth: +q.depth.toFixed(1), near: +q.near.toFixed(2) })) };
    console.log(P.id, JSON.stringify(out[P.id]));
    for (let k = 0; k < Math.min(good.length, Number(args.top || 1)); k++) { const q = good[k]; await page.eval(`window.__camSpec(${JSON.stringify(`${q.x},${q.z},${q.yaw},${q.pitch}`)})`); await page.frames(6); await page.shot(resolve(ROOT, `shots/polish3/probe_${P.id}${k ? '_' + k : ''}.png`)); }
  }
} catch (e) { console.log('PROBE FAILED', e.message); process.exitCode = 1; }
finally { await browser?.close(); srv.stop(); }
console.log(JSON.stringify(out));
process.exit(process.exitCode || 0);
