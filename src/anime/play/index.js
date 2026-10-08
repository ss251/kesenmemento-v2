// [play] Mounts the kit, then each feature that exists, once each.
// ?play=0 is the kill switch (main.js skips the mount call). The module is a static import of main.js: Bun 1.3.14's splitter
// leaves a dynamic import('./play/index.js') as a browser fetch (a 404, and no kit) once a play feature is also imported dynamically.
//
// Written by hand at integration: every lane added its own import and mount line, and a line merge duplicated them.
// The missions lane mounts its NPCs, and the car lane its race and garage. One mount per feature, in this order: the kit (and its 金のカツオ tab first, so the notebook still opens on that tab),
// then the features. Each mount is isolated, so one feature failing leaves the others running.

import * as kit from './kit/index.js';
import { mountKatsuo } from './katsuo/index.js';
import { mountCourses } from './courses/index.js';
import { mount as mountCar } from './car/index.js';
import { mount as mountIppon } from './ippon/index.js';
import { mount as mountSwim } from './underwater/index.js';
import { mount as mountMissions } from './missions/index.js';
import { mountAvatar } from './avatar/index.js';
import { mountGull } from './gull/index.js';
import { mountMulti } from './multi/index.js';
import { canSwitch, graphFrom, padChipsHidden } from './kit/modes.js';

export function mountPlay(ctx) {
  let off = false;
  try { off = new URLSearchParams(location.search).get('play') === '0'; } catch (e) { off = false; }
  if (off || !ctx) return null;
  kit.mountKit(ctx);
  ctx.services.play = Object.assign(ctx.services.play || {}, { paintMap: null });
  const api = { store: kit.store, sfx: kit.sfx, fx: kit.fx, ui: kit.ui, onPlayTick: kit.onPlayTick, playMode: kit.playMode, playerPos: kit.playerPos, registerMode: kit.registerMode };
  try { mountKatsuo(ctx); } catch (e) { console.error('[play] katsuo', e); }
  try { mountCourses(ctx, kit); } catch (e) { console.error('[play] courses', e); }
  try { mountCar(ctx, api); } catch (e) { console.error('[play] car', e); }
  try { mountIppon(ctx); } catch (e) { console.error('[play] ippon', e); }
  // main.js already mounted the dive, before the shaders compiled; this adds its play side.
  try { mountSwim(ctx); } catch (e) { console.error('[play] swim', e); }
  try { mountMissions(ctx, api); } catch (e) { console.error('[play] missions', e); }
  try { mountAvatar(ctx); } catch (e) { console.error('[play] avatar', e); }
  try { mountGull(ctx); } catch (e) { console.error('[play] gull', e); }
  // みんなで last: it arms courses and the race on their own clocks, so they must exist first.
  try { mountMulti(ctx); } catch (e) { console.error('[play] multi', e); }
  const play = ctx.services.play;
  play.graphMode = () => graphFrom(ctx);
  play.padChipsHidden = padChipsHidden;
  play.canSwitch = (to, extra) => canSwitch(graphFrom(ctx), to, extra);
  const pl = ctx.playerObj;
  if (pl) pl.allowMode = (to, extra) => play.canSwitch(to, extra);
  return play;
}
