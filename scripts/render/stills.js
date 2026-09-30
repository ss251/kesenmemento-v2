// [v3:life] Stills of the v3 wow frames (V3-SPEC section 1), rendered by the anime app (src/anime) with the real renderer.
// Adapted from the v2 stills script (package v2:portal-cinema): same idea (a named plan, one page, a JSON report),
// now for the anime world: each still = a time preset + a camera (+ weather).
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS bun scripts/render/stills.js --size 1080            # all wow frames
//   ... stills.js --only drone_1630,night_bay [--size 4k|1080|preview] [--port 8814] [--nobuild] [--list] [--lang en]
//       [--modules environment,water,_houses,harbor,life]   (world modules; default: the full MODULES list of main.js)
// 4K (3840x2160) is the product size; it is refused until 2026-10-01 00:00Z by the machine caps (V3-SPEC section 8).
// Writes dist/renders/v3_<name>_<size>.png + dist/renders/v3_report-<size>.json.
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { SIZES, sizeAllowed, loadAvg5, openApp, ROOT } from './anime-page.js';

/** The wow frames. cam: tools/anime camera spec; time: preset id or JST hours; t: sim seconds (people / gulls / waves). */
export function stillPlan() {
  // [v3:integrate] framings re-chosen by screenshot over the full world (town + harbor + life): the promenade frame now
  // holds the cat on its bollard, the night frames use wet streets after a shower (lamp streaks on the asphalt and the
  // bay), plus the tiny planet and two seasons. pre / post: page JS run before / after the frame.
  const WET = '__life.time.setWeather({ wet: 0.8 })', DRY = '__life.time.setWeather({ wet: 0 })';
  return [
    { name: 'drone_1630', time: 'yugata', cam: '428,126,130>56,-18,-174' /* [v3:polish2] = FRAMES.hero.drone (life/tour.js) */, t: 14, note: '1. drone over the inner bay, 16:30 autumn afternoon' },
    // [v3:fix] 1b. the classic 安波山 postcard: town, 内湾, 神明崎 and the bay out to かなえ大橋's pylons and the 大島 arch
    // (the hero drone looks north-west at 安波山, so the bridge towers, south-east, cannot share its frame)
    { name: 'drone_kanae', time: 'yugata', cam: '-100,180,-450>450,0,450', t: 14, note: '1b. over 安波山: the town, the inner bay and かなえ大橋 in the distance' },
    { name: 'promenade_peach', time: 17.05, cam: '166,4.4,-117>150,5.2,-112' /* [v3:polish3] raised onto the deck: less flat seawall face */, t: 20, note: '2. the waterfront promenade: seawall, a cat on a bollard, wires across a peach sky, gulls' },
    { name: 'promenade_deck', time: 17.05, cam: '168,4.4,-122>120,5,-104', t: 20, note: '2b. the promenade deck leading into the sunset' },
    // [v3:polish] 3. from the water beside the berth, looking back up the quay: hulls, the canopy and the crew (water < 30 %)
    { name: 'market_morning', time: 'asa', cam: '690.2,8.1,890.8>662.2,4,834' /* [v3:polish2] 2 m to the right: the 78福徳丸 気仙沼 hull name whole */, t: 9, note: '3. the fish market at morning' },
    // [v3:fix] 3b. under the market canopy beside the skipjack boat: fish rows, blue boxes, forklifts, the crew in aprons
    { name: 'market_unload', time: 'asa', cam: '665,4.6,853.2>652.6,2.4,850.8' /* [v3:polish3] from the quay edge by the conveyor: the skipjack rows and the crew fill the frame, not the box stacks */, t: 9, note: '3b. the unloading: skipjack on blue sheets, fish boxes, forklifts, people in rubber aprons' },
    { name: 'ukimido_sunset', time: 'yuyake', cam: '368,3.2,-8>339,5.4,-25' /* [v3:polish2] tilted up ~4 deg: less flat water under the reflection */, t: 70,   /* [v3:polish] t 70: a small boat fishing its loop left of the pavilion, wake on the mirror */   /* [v3:fix] lower and 30 m closer: the pavilion carries the frame */ note: '4. 浮見堂 at magic hour, the sky mirrored in the calm bay' },
    { name: 'night_bay', time: 'yoru', cam: 'hero', t: 30, pre: WET, post: DRY, note: '5. night: warm windows, lamp streaks on wet streets and water, boat lights' },
    { name: 'night_rows', time: 'yoru', cam: '610,12,-200>545,15,-300' /* [v3:polish2] tilted up ~5 deg: the lit rows sit lower, less empty dark water */, t: 30, pre: WET, post: DRY, note: '5b. night: the lit longliners in rows, their lights on the water' },
    { name: 'ukimido_night', time: 'yoru', cam: '341.6,-29.9,180,1', t: 30, note: '5c. night on the 浮見堂 walkway, lanterns lit, the bridges beyond' },
    // [v3:fix] 5d. a 南町 izakaya at night: red 提灯, a lit 行灯, a string of lanterns under the eave
    { name: 'night_izakaya', time: 'yoru', cam: '245.1,187.8,60,6', t: 30, note: '5d. night in 南町: red lanterns and an 行灯 at a sushi counter' },
    // [v3:polish] 6. re-composed from the north-west, high over the hills: the whole bay out to かなえ大橋, 大島 and the open sea
    { name: 'whole_city', time: 'yugata', cam: '-300,1500,-1800>1400,0,1600', t: 14, note: '6. the whole of Kesennuma bay from very high' },
    { name: 'tiny_planet', time: 'yugata', cam: 'hero', t: 14, pre: '__planet(true)', post: '__planet(false)', note: '6b. the tiny planet: all of the bay as one little world' },
    { name: 'spring_drone', time: 'yugata', cam: 'hero', t: 14, pre: "__season('spring')", post: "__season('autumn')", note: '7. spring: sakura on 神明崎 and 山桜 on the hills' },
    // [v3:polish] 7c. summer at noon: a deep clear blue, bright white towering cumulus, lush green hills
    { name: 'summer_drone', time: 'hiru', cam: 'hero', t: 14, pre: "__season('summer')", post: "__season('autumn')", note: '7c. summer: a deep blue noon sky, towering cumulus, lush green hills' },
    { name: 'winter_drone', time: 'yugata', cam: 'hero', t: 14, pre: "__season('winter')", post: "__season('autumn')", note: '7b. winter: snow on the roofs and 安波山' },
  ];
}

async function main() {
  const args = process.argv.slice(2), opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
  const size = opt('--size', '1080'), only = opt('--only', '').split(',').filter(Boolean);
  let plan = stillPlan(); if (only.length) plan = plan.filter((s) => only.includes(s.name));
  if (args.includes('--list')) { for (const s of plan) console.log(s.name.padEnd(18), String(s.time).padEnd(7), s.cam.padEnd(28), s.note); return; }
  const gate = sizeAllowed(size); if (!gate.ok) throw new Error(gate.reason);
  if (loadAvg5() > 18) throw new Error('5-minute load > 18: stop (V3-SPEC section 8)');
  const [W, H] = SIZES[size];
  const OUT = opt('--out', '') ? join(ROOT, opt('--out', '')) : join(ROOT, 'dist/renders'); mkdirSync(OUT, { recursive: true });   // [v3:fix] --out dist/qa3
  const app = await openApp({ port: +opt('--port', 8814), width: W, height: H, nobuild: args.includes('--nobuild'), q: { lang: opt('--lang', 'ja'), t: '0', labels: '0' /* [v3:fix] no floating UI labels in stills */, ...(opt('--modules') ? { only: opt('--modules') } : {}) } });
  const report = [];
  try {
    for (const s of plan) {
      if (loadAvg5() > 18) throw new Error(`5-minute load > 18: stopped before ${s.name}`);
      const t0 = performance.now();
      await app.page.eval(`window.__simTo ? window.__simTo(${s.t}) : window.__sim(${s.t})`);
      await app.page.eval(`window.__lifeSet(${typeof s.time === 'number' ? s.time : JSON.stringify(s.time)})`);
      await app.page.eval(`window.__camSpec(${JSON.stringify(s.cam)})`);
      if (s.pre) await app.page.eval(`(() => { ${s.pre}; return 1; })()`);   // [v3:integrate]
      await app.page.frames(6);
      const file = join(OUT, `v3_${s.name}_${size}.png`);
      await app.page.shot(file);
      const st = await app.page.eval('({ calls: window.__stats.calls, triangles: window.__stats.triangles })');
      if (s.post) await app.page.eval(`(() => { ${s.post}; return 1; })()`);
      const row = { name: s.name, file: file.slice(ROOT.length + 1), ms: Math.round(performance.now() - t0), ...st, note: s.note };
      report.push(row); console.log(`ok   ${s.name.padEnd(18)} ${row.ms} ms  calls=${st.calls}  ${(st.triangles / 1e6).toFixed(2)}M tris`);
    }
    const errs = app.page.errors(); if (errs.length) console.log('page errors:', JSON.stringify(errs.slice(0, 5)));
  } finally { await app.close(); }
  await Bun.write(join(OUT, `v3_report-${size}.json`), JSON.stringify({ at: new Date().toISOString(), size, report }, null, 1));
}

if (import.meta.main) await main().catch((e) => { console.error(String(e.stack || e)); process.exit(1); });
