// [loader] Key art for the title screen: the TINY PLANET of Kesennuma (core/planet.js) rendered by OUR engine, plus the painted hero frames, at the sizes the loader needs.
//
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/loader-keyart.mjs --set planet|planet2|planet3|poster-portrait|poster-landscape|portrait|landscape [--only name,name] [--out DIR] [--port 9437] [--size 2048]
//
// planet:    square renders (default 2048 x 2048) of the stereographic fold; the disk's edge is the horizon at radius zoom x height, so the loader can mask it onto a flat field.
//            `ink` strengthens the screen-space outlines for this view only (uOutline, and uPx through a patched setSize so the six cube faces keep the thicker line): a title wants a
//            drawn planet, not a map.
// portrait:  1179 x 2556 (an iPhone at 3x) hero frames for the painted alternative; landscape: 2560 x 1440.
// Each frame = a time preset (asa, hiru, yugata, yuyake, yoru) + a capture point / camera + sim seconds; the page is the real app in ?shot=1 mode (no UI), the desktop tier.
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { openApp, loadAvg5, ROOT } from '../../scripts/render/anime-page.js';

const args = process.argv.slice(2), opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const set = opt('--set', 'planet'), only = opt('--only', '').split(',').filter(Boolean);
const SQ = Number(opt('--size', '2048'));
const [W, H] = set.startsWith('planet') ? [SQ, SQ] : (set.endsWith('portrait') || set === 'title-phone') ? [1179, 2556] : [2560, 1440];
const OUT = opt('--out', join(ROOT, 'dist/keyart')); mkdirSync(OUT, { recursive: true });

/** The planet's capture point (x, y, z): PLANET_AT = [320, 560, 260] is the whole bay; lower and nearer the inner bay makes the town the planet. zoom: the disk radius as a share of the height. */
const WET = '__life.time.setWeather({ wet: 0.8 })', DRY = '__life.time.setWeather({ wet: 0 })';
const AT = { far: [320, 560, 260], mid: [300, 440, 180], near: [290, 340, 120] };
const INK = { map: { k: 1.0, px: 1.0 }, drawn: { k: 1.35, px: 1.6 }, bold: { k: 1.6, px: 2.1 } };
const PLANS = {
  planet: [
    { name: 'planet_hiru_far_map', time: 'hiru', at: AT.far, zoom: 0.46, ink: INK.map, t: 14 },
    { name: 'planet_hiru_far_drawn', time: 'hiru', at: AT.far, zoom: 0.46, ink: INK.drawn, t: 14 },
    { name: 'planet_hiru_mid_drawn', time: 'hiru', at: AT.mid, zoom: 0.46, ink: INK.drawn, t: 14 },
    { name: 'planet_hiru_near_bold', time: 'hiru', at: AT.near, zoom: 0.46, ink: INK.bold, t: 14 },
    { name: 'planet_yugata_far_drawn', time: 'yugata', at: AT.far, zoom: 0.46, ink: INK.drawn, t: 14 },
    { name: 'planet_yugata_mid_drawn', time: 'yugata', at: AT.mid, zoom: 0.46, ink: INK.drawn, t: 14 },
    { name: 'planet_yoru_far_drawn', time: 'yoru', at: AT.far, zoom: 0.46, ink: INK.drawn, t: 30 },
    { name: 'planet_yoru_mid_drawn', time: 'yoru', at: AT.mid, zoom: 0.46, ink: INK.drawn, t: 30 },
    { name: 'planet_yuyake_mid_drawn', time: 'yuyake', at: AT.mid, zoom: 0.46, ink: INK.drawn, t: 14 },
  ],
  // the second pass: the near point for every hour, blue hour (the windows are lit and the sky still blue), and a brighter night
  planet2: [
    { name: 'planet2_hiru_near', time: 'hiru', at: AT.near, zoom: 0.46, ink: INK.drawn, t: 14 },
    { name: 'planet2_yugata_near', time: 'yugata', at: AT.near, zoom: 0.46, ink: INK.drawn, t: 14 },
    { name: 'planet2_yuyake_near', time: 'yuyake', at: AT.near, zoom: 0.46, ink: INK.drawn, t: 14 },
    { name: 'planet2_blue1_near', time: 18.1, at: AT.near, zoom: 0.46, ink: INK.drawn, t: 30 },
    { name: 'planet2_blue2_near', time: 18.5, at: AT.near, zoom: 0.46, ink: INK.drawn, t: 30 },
    { name: 'planet2_blue2_mid', time: 18.5, at: AT.mid, zoom: 0.46, ink: INK.drawn, t: 30 },
    { name: 'planet2_yoru_near_x14', time: 'yoru', at: AT.near, zoom: 0.46, ink: INK.drawn, t: 30, exp: 1.4 },
    { name: 'planet2_yoru_near_x18', time: 'yoru', at: AT.near, zoom: 0.46, ink: INK.drawn, t: 30, exp: 1.8 },
    { name: 'planet2_asa_near', time: 'asa', at: AT.near, zoom: 0.46, ink: INK.drawn, t: 9 },
  ],
  // the third pass: night with the exposure set AFTER the sky's preset (sky.js writes uExposure on every update) and the window glow gain raised; morning at 08:30 (the 06:30 preset's mist swallows the planet)
  planet3: [
    { name: 'planet3_yoru_near_e14_w2', time: 'yoru', at: AT.near, zoom: 0.46, ink: INK.drawn, t: 30, exp: 1.4, win: 2.0 },
    { name: 'planet3_yoru_near_e18_w3', time: 'yoru', at: AT.near, zoom: 0.46, ink: INK.drawn, t: 30, exp: 1.8, win: 3.0 },
    { name: 'planet3_yoru_near_e22_w3', time: 'yoru', at: AT.near, zoom: 0.46, ink: INK.drawn, t: 30, exp: 2.2, win: 3.0 },
    { name: 'planet3_blue_near_e14_w2', time: 18.4, at: AT.near, zoom: 0.46, ink: INK.drawn, t: 30, exp: 1.4, win: 2.0 },
    { name: 'planet3_asa_near_0830', time: 8.5, at: AT.near, zoom: 0.46, ink: INK.drawn, t: 9 },
    { name: 'planet3_asa_near_0730', time: 7.5, at: AT.near, zoom: 0.46, ink: INK.drawn, t: 9 },
  ],
  // the POSTER key art (the title screen is a travel poster of the town): one subject, calm sky for the vertical title, the same camera the live scene starts from
  'poster-portrait': [
    { name: 'poster_ukimido_yuyake_a', time: 'yuyake', cam: '368,3.2,-8>339,12,-25', t: 70 },
    { name: 'poster_ukimido_yuyake_b', time: 'yuyake', cam: '362,4,-12>339,10,-25', t: 70 },
    { name: 'poster_ukimido_yuyake_c', time: 'yuyake', cam: '374,4.5,-2>339,11,-25', t: 70 },
    { name: 'poster_ukimido_yugata_a', time: 'yugata', cam: '368,3.2,-8>339,12,-25', t: 70 },
    { name: 'poster_ukimido_hiru_a', time: 'hiru', cam: '368,3.2,-8>339,12,-25', t: 70 },
    { name: 'poster_ukimido_asa_a', time: 8.5, cam: '368,3.2,-8>339,12,-25', t: 70 },
    { name: 'poster_ukimido_yoru_a', time: 'yoru', cam: '368,3.2,-8>339,12,-25', t: 70 },
    { name: 'poster_ukimido_blue_a', time: 18.3, cam: '368,3.2,-8>339,12,-25', t: 70 },
  ],
  'poster-landscape': [
    { name: 'poster_bay_yoru_a', time: 'yoru', cam: 'hero', t: 30, pre: WET, post: DRY },
    { name: 'poster_bay_yoru_b', time: 'yoru', cam: '428,126,130>56,30,-174', t: 30, pre: WET, post: DRY },
    { name: 'poster_bay_yoru_c', time: 'yoru', cam: '428,126,130>56,12,-174', t: 30, pre: WET, post: DRY },
    { name: 'poster_bay_yuyake_b', time: 'yuyake', cam: '428,126,130>56,30,-174', t: 14 },
    { name: 'poster_ukimido_yoru_l', time: 'yoru', cam: '368,3.2,-8>339,9,-25', t: 70 },
  ],
  portrait: [
    { name: 'hero_portrait_hiru', time: 'hiru', cam: '310,160,70>10,-60,-230', t: 14 },
    { name: 'hero_portrait_yugata', time: 'yugata', cam: '310,160,70>10,-60,-230', t: 14 },
    { name: 'ukimido_portrait_yuyake', time: 'yuyake', cam: '368,3.2,-8>339,12,-25', t: 70 },
  ],
  landscape: [
    { name: 'hero_landscape_yoru', time: 'yoru', cam: 'hero', t: 30 },
    { name: 'hero_landscape_yugata', time: 'yugata', cam: 'hero', t: 14 },
  ],
  // the title posters: the hero drone, landscape framing on every aspect (428,126,130 > 56,-18,-174), the four hours the clock picks
  'title-phone': ['asa', 'hiru', 'yugata', 'yoru'].map((time) => ({ name: `title_phone_${time}`, time, cam: '428,126,130>56,-18,-174', t: time === 'yoru' ? 30 : 14 })),
  'title-desktop': ['asa', 'hiru', 'yugata', 'yoru'].map((time) => ({ name: `title_desktop_${time}`, time, cam: '428,126,130>56,-18,-174', t: time === 'yoru' ? 30 : 14 })),
};
const plan = (PLANS[set] || []).filter((s) => !only.length || only.includes(s.name));
if (!plan.length) throw new Error(`nothing to render for --set ${set}`);
if (loadAvg5() > 18) throw new Error('5-minute load > 18: stop');

const app = await openApp({ port: Number(opt('--port', 9437)), width: W, height: H, q: { lang: 'ja', t: '0', labels: '0', credit: '0' } });
try {
  // the outline strength and line width of this page, kept through planet.js's own setSize calls (the six faces are rendered at N x N)
  await app.page.eval(`(() => { const p = window.__ctx.pipeline; if (!p.__keyartSetSize) { p.__keyartSetSize = p.setSize; p.setSize = (w, h, r) => { p.__keyartSetSize(w, h, r); if (window.__inkPx) p.compMat.uniforms.uPx.value = window.__inkPx; }; } return 1; })()`);
  // the exposure after the sky's own preset write (core/sky.js setTime -> cm.uExposure), and the window glow gain (world/life/lights.js: ctx.shared.uWinGain)
  await app.page.eval(`(() => { const sky = window.__ctx.sky; if (sky && !sky.__keyartUpdate) { sky.__keyartUpdate = sky.update; sky.update = (t, cam) => { sky.__keyartUpdate(t, cam); if (window.__exp) window.__ctx.pipeline.compMat.uniforms.uExposure.value = window.__exp; }; } return 1; })()`);
  for (const s of plan) {
    await app.page.eval(`window.__simTo ? window.__simTo(${s.t}) : window.__sim(${s.t})`);
    await app.page.eval(`window.__lifeSet(${JSON.stringify(s.time)})`);
    if (s.at) {
      await app.page.eval(`(() => { const p = window.__ctx.pipeline; window.__inkPx = ${s.ink.px}; p.compMat.uniforms.uOutline.value = ${s.ink.k}; window.__exp = ${s.exp ?? 0}; const S = window.__ctx.shared; if (S && S.uWinGain) { S.__winGain0 ??= S.uWinGain.value; S.uWinGain.value = S.__winGain0 * ${s.win ?? 1}; } window.__planet(false); window.__planet(true, { at: ${JSON.stringify(s.at)}, zoom: ${s.zoom} }); return 1; })()`);
      await app.page.frames(4);   // the first render captures the six faces, the next ones draw the fold
    } else {
      await app.page.eval(`(() => { window.__planet(false); window.__inkPx = 0; window.__exp = 0; window.__ctx.pipeline.compMat.uniforms.uOutline.value = 1.0; window.__camSpec(${JSON.stringify(s.cam)}); return 1; })()`);
      if (s.pre) await app.page.eval(`(() => { ${s.pre}; return 1; })()`);
      await app.page.frames(8);
    }
    const file = join(OUT, `${s.name}.png`);
    await app.page.shot(file);
    if (s.post) await app.page.eval(`(() => { ${s.post}; return 1; })()`);
    console.log(`ok ${s.name} -> ${file}`);
  }
  const errs = app.page.errors(); if (errs.length) console.log('page errors:', JSON.stringify(errs.slice(0, 4)));
} finally { await app.close(); }
