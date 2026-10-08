// [mobile-play] Phone-tier census of the play modes: the start view, then each mode started and left.
// The iPhone measurements of .diag/mem.mjs (390x844 @3, iPhone UA, touch, precise heap after GC), one row per step:
// JS heap, geometry and texture bytes in the scene, programs, draw calls, and the play share of the scene's bytes.
//   tools/anime/gate.sh chrome --fg env -u NODE_OPTIONS bun tools/anime/play-census.mjs [--port 9540] [--query play=0] [--modes ippon,swim,...] [--json out.json] [--shots dir]
// --query: extra URL parameters for the page (repeatable as --query a --query b: one page load each).
// --modes: the modes to start and leave, in order (see MODES below); `all` for every one.
import { buildAndServe, phonePage } from './pad-lib.mjs';
import { launch } from './cdp.mjs';
import { writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const multi = (k) => argv.flatMap((a, i) => (a === '--' + k ? [argv[i + 1] ?? ''] : []));
const PORT = Number(opt('port', 9540));
const QUERIES = multi('query'); if (!QUERIES.length) QUERIES.push('');
const SETTLE = Number(opt('settle', 15000));
const SHOTS = opt('shots', '');   // a folder: screenshots of each mode's card and first frames
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Each mode: how to start it the way the hub does (its spec's prepare + start), whether it is running, and how to leave. */
export const MODES = {
  ippon: { id: 'ippon', running: `!!window.__ctx.services.ippon?.active`, leave: `window.__ctx.services.ippon.leave()` },
  swim: { id: 'underwater', running: `!!window.__ctx.services.swim?.active`, leave: `window.__ctx.services.swim.exit?.()` },
  courses: { id: 'course-anba', running: `!!window.__ctx.services.play?.courses?.active`, leave: `window.__ctx.services.play.courses.abort()` },
  race: { id: 'race', running: `!!(window.__playCar?.race && window.__playCar.race.phase !== 'idle')`, leave: `window.__playCar.race.quit()` },
  // みんなで: the hub opens the sheet; 「つくる」 makes a room on the relay (--query ws=ws://127.0.0.1:<port>/ws to a local
  // `PORT=<port> bun server/multi/index.js`), which bakes the friends' bodies; leaving the room frees them on a phone
  multi: { id: 'multi', after: `(() => { document.querySelector('#klc-multi [data-act="create"]')?.click(); return true; })()`,
    wait: `!!window.__ctx.services.multi?.self`, running: `!!window.__ctx.services.multi?.self`,
    leave: `(() => { document.querySelector('#klc-multi [data-act="leave"]')?.click(); window.__ctx.services.multi.close?.(); return true; })()` },
  gull: { id: 'gull', running: `!!window.__ctx.services.play?.gull?.active`, leave: `window.__ctx.services.play.gull.leave('stop')` },
};

const CENSUS = `(() => {
  const ctx = window.__ctx, r = ctx.renderer; const seenG = new Set(), seenT = new Set(); let geoBytes = 0, texBytes = 0, playGeo = 0;
  const ab = (a) => (a ? (a.count || 0) * (a.itemSize || 1) * ((a.array && a.array.BYTES_PER_ELEMENT) || (a.data && a.data.array && a.data.array.BYTES_PER_ELEMENT) || 4) : 0);
  const gBytes = (g) => { let n = 0; for (const k in g.attributes) n += ab(g.attributes[k]); if (g.index) n += ab(g.index); if (g.morphAttributes) for (const k in g.morphAttributes) for (const a of g.morphAttributes[k]) n += ab(a); return n; };
  const addTex = (t) => { if (!t || seenT.has(t)) return; seenT.add(t); const im = t.image; const w = im?.width || 0, h = im?.height || 0, d = im?.depth || 1; texBytes += w * h * d * 4 * (t.generateMipmaps !== false ? 1.33 : 1); };
  const groups = [];
  for (const top of ctx.scene.children) {
    let bytes = 0, meshes = 0, inst = 0;
    top.traverse((o) => {
      if (o.geometry && !seenG.has(o.geometry)) { seenG.add(o.geometry); const n = gBytes(o.geometry); bytes += n; geoBytes += n; if (o.userData && o.userData.play) playGeo += n; }
      if (o.isMesh || o.isInstancedMesh || o.isPoints || o.isLine) { meshes++; if (o.isInstancedMesh) inst += o.count; }
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of ms) { for (const k in m) { const v = m[k]; if (v && v.isTexture) addTex(v); } if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k]?.value; if (v && v.isTexture) addTex(v); } }
    });
    groups.push({ name: (top.name || top.type).slice(0, 28), visible: top.visible, mb: +(bytes / 1e6).toFixed(1), meshes, inst });
  }
  groups.sort((a, b) => b.mb - a.mb);
  // Who uses each program: the top groups, with 'dynamic' split by its children's names (up to the first ':' or digit run),
  // so a play world ('play:swim'), the boat ('katsuo-…') or a town system shows its own share. excl = programs only it uses.
  const users = new Map(), dyn = new Map(), seen2 = new Set();
  const label = (o) => String(o.name || o.type || '?').replace(/[:|].*$/, '').replace(/[-_]?\\d+$/, '').slice(0, 26) || '?';
  const progsOf = (m) => { const pr = r.properties.get(m); const out = []; if (pr && pr.programs) for (const p of pr.programs.values()) out.push(p); else if (pr && pr.currentProgram) out.push(pr.currentProgram); return out; };
  for (const top of ctx.scene.children) {
    const parts = top.name === 'dynamic' ? top.children.map((c) => ['dyn:' + label(c), c]) : [[String(top.name || top.type).slice(0, 26), top]];
    for (const [g, node] of parts) {
      let row = dyn.get(g); if (!row) dyn.set(g, (row = { g, mb: 0, meshes: 0, progs: new Set() }));
      node.traverse((o) => {
        if (o.geometry && !seen2.has(o.geometry)) { seen2.add(o.geometry); row.mb += gBytes(o.geometry) / 1e6; }
        if (o.isMesh || o.isInstancedMesh || o.isPoints || o.isLine) row.meshes++;
        const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of ms) for (const p of progsOf(m)) { row.progs.add(p); if (!users.has(p)) users.set(p, new Set()); users.get(p).add(g); }
      });
    }
  }
  const byGroup = [...dyn.values()].map((x) => ({ g: x.g, mb: +x.mb.toFixed(1), meshes: x.meshes, progs: x.progs.size, excl: [...x.progs].filter((p) => users.get(p).size === 1).length }))
    .filter((x) => x.mb >= 0.2 || x.excl > 0).sort((a, b) => b.excl - a.excl || b.mb - a.mb);
  try { gc(); gc(); } catch {}
  const progs = r.info.programs || [];
  const names = {}; for (const p of progs) { const n = String(p.name || '?').slice(0, 40); names[n] = (names[n] || 0) + 1; }
  return { heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null, geoMB: +(geoBytes / 1e6).toFixed(1), texMB: Math.round(texBytes / 1e6),
    geometries: r.info.memory.geometries, textures: r.info.memory.textures, programs: progs.length, calls: r.info.render.calls, tris: r.info.render.triangles,
    unowned: progs.filter((p) => !users.has(p)).length,
    top: groups.slice(0, 12), byGroup: byGroup.slice(0, 24), progNames: Object.entries(names).sort((a, b) => b[1] - a[1]).slice(0, 14), playMB: +(playGeo / 1e6).toFixed(1),
    worlds: typeof window.__playWorlds === 'function' ? window.__playWorlds() : null, npcs: window.__ctx.services.missions?.people?.built ?? null,
    cam: { fov: +ctx.camera.fov.toFixed(1), x: Math.round(ctx.camera.position.x), y: Math.round(ctx.camera.position.y), z: Math.round(ctx.camera.position.z), aspect: +ctx.camera.aspect.toFixed(3) } };
})()`;

/** Start a mode the way the hub's はじめる does: the wipe, the title card with spec.prepare() behind it, then spec.start().
 *  prepMs: build + compile + warm-up; cardMs: how long the card was up (its own 1.2 s, or the build if longer); totalMs: tap to start. */
const START = (id) => `(async () => {
  const play = window.__ctx.services.play; const spec = play.listModes().find((m) => m.id === ${JSON.stringify(id)});
  if (!spec) return { error: 'no mode ' + ${JSON.stringify(id)}, ids: play.listModes().map((m) => m.id) };
  const ui = window.__play && window.__play.ui;
  if (ui && typeof ui.run === 'function' && typeof ui.hubStart === 'function') { await ui.run(spec); return ui.hubStart(); }
  const t0 = performance.now(); let prepMs = null;
  if (typeof spec.prepare === 'function') { await spec.prepare(); prepMs = Math.round(performance.now() - t0); }
  await spec.start?.();
  return { prepMs, totalMs: Math.round(performance.now() - t0), noHub: true };
})()`;

const rows = [];
const fmt = (label, c) => `${label.padEnd(26)} heap ${String(c.heapMB).padStart(4)} MB  geo ${String(c.geoMB).padStart(6)} MB  tex ${String(c.texMB).padStart(4)} MB  programs ${String(c.programs).padStart(4)}  calls ${String(c.calls).padStart(4)}  tris ${(c.tris / 1e6).toFixed(2)} M  fov ${c.cam ? c.cam.fov : "?"} @${c.cam ? c.cam.x + "," + c.cam.y + "," + c.cam.z : "?"}`;

const { srv } = await buildAndServe(PORT);
const browser = await launch({ args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'] });
try {
  for (const q of QUERIES) {
    const page = await phonePage(browser, { width: 390, height: 844, dpr: 3 });
    const url = `${srv.url}index.html${q ? '?' + q : ''}`;
    const tLoad = Date.now();
    await page.goto(url);
    await page.waitFor(`!!(document.body && document.body.classList.contains('loaded'))`, { timeout: 300000, poll: 1000 });
    const loadS = ((Date.now() - tLoad) / 1000).toFixed(1);
    // at the title: the load's peak is where an iPhone gives up, so what the play modes cost by now counts most
    const ct = await page.eval(CENSUS);
    const tl = `title${q ? ' ?' + q : ''}`;
    rows.push({ step: tl, loadS: +loadS, ...ct }); console.log(fmt(tl, ct), ` (loaded in ${loadS} s)`);
    console.log('   ', ct.byGroup.slice(0, 12).map((x) => `${x.g} ${x.mb}/${x.meshes}/${x.progs}/${x.excl}`).join(', '));
    await page.eval(`document.getElementById('go')?.click()`).catch(() => {});
    await sleep(SETTLE);
    const c0 = await page.eval(CENSUS);
    const label = `start${q ? ' ?' + q : ''}`;
    rows.push({ step: label, loadS: +loadS, ...c0 }); console.log(fmt(label, c0), ` (loaded in ${loadS} s)`);
    console.log('  top:', c0.top.slice(0, 8).map((g) => `${g.name}${g.visible ? '' : '(h)'} ${g.mb}`).join(', '));
    console.log('  programs:', c0.progNames.map(([n, k]) => `${n}×${k}`).join(', '));
    console.log(`  by group (MB / meshes / programs / only-theirs), ${c0.unowned} programs on no scene material (passes, overrides, freed):`);
    console.log('   ', c0.byGroup.map((x) => `${x.g} ${x.mb}/${x.meshes}/${x.progs}/${x.excl}`).join(', '));
    const want = (opt('modes', '') === 'all' ? Object.keys(MODES) : opt('modes', '').split(',')).filter((m) => MODES[m]);
    for (const m of want) {
      const M = MODES[m];
      let t = null;
      if (SHOTS) {
        // --shots: the card while the world builds behind it, then the mode's first frames (no half-built pop-in)
        try {
          await page.eval(`(() => { const spec = window.__ctx.services.play.listModes().find((x) => x.id === ${JSON.stringify(M.id)}); window.__censusDone = false; window.__play.ui.run(spec).then(() => { window.__censusDone = true; }); return true; })()`);
          await sleep(900); await page.shot(`${SHOTS}/${m}-1-card.png`);
          await page.waitFor('window.__censusDone === true', { timeout: 20000, poll: 16 });
          await page.shot(`${SHOTS}/${m}-2-first.png`);
          await sleep(1000); await page.shot(`${SHOTS}/${m}-3-after1s.png`);
          t = await page.eval('window.__play.ui.hubStart()');
        } catch (e) { t = { error: String(e.message).slice(0, 300) }; }
      } else {
        try { t = await page.eval(START(M.id)); } catch (e) { t = { error: String(e.message).slice(0, 300) }; }
      }
      if (M.after) {
        try {
          const t0 = Date.now();
          await page.eval(M.after);
          if (M.wait) await page.waitFor(M.wait, { timeout: 20000, poll: 100 });
          t = { ...(t || {}), afterMs: Date.now() - t0 };
        } catch (e) { t = { ...(t || {}), afterError: String(e.message).slice(0, 200) }; }
      }
      await sleep(Number(opt('inmode', 6000)));
      const running = await page.eval(M.running).catch(() => null);
      const c1 = await page.eval(CENSUS);
      rows.push({ step: `in ${m}`, timing: t, running, ...c1 }); console.log(fmt(`in ${m}`, c1), JSON.stringify(t), running ? '' : '(NOT running)', JSON.stringify(c1.worlds));
      console.log("    ", c1.byGroup.slice(0, 10).map((x) => `${x.g} ${x.mb}/${x.meshes}/${x.progs}/${x.excl}`).join(", "));
      try { await page.eval(M.leave); } catch (e) { console.log('  leave failed:', String(e.message).slice(0, 200)); }
      await sleep(Number(opt('after', 5000)));
      const c2 = await page.eval(CENSUS);
      rows.push({ step: `left ${m}`, ...c2 }); console.log(fmt(`left ${m}`, c2));
      console.log("    ", c2.byGroup.slice(0, 10).map((x) => `${x.g} ${x.mb}/${x.meshes}/${x.progs}/${x.excl}`).join(", "));
    }
    const errs = page.errors().slice(0, 8);
    if (errs.length) console.log('  page errors:', errs.map((e) => e.text.slice(0, 200)).join('\n    '));
    await page.S('Page.close').catch(() => {});
  }
} finally {
  if (opt('json')) writeFileSync(opt('json'), JSON.stringify(rows, null, 1));
  await browser.close(); srv.stop();
}
process.exit(0);
