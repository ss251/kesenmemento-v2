// [play] The one import for every play feature. KIT-API.md.

export { store } from './store.js';
export { sfx } from './sfx.js';
export { fx } from './fx.js';
export { ui } from './ui.js';
export { onPlayTick, playMode, playerPos } from './runtime.js';
export { registerMode, listModes } from './modes.js';

import { store } from './store.js';
import { bindSfx } from './sfx.js';
import { mountFx } from './fx.js';
import { mountUi } from './ui.js';
import { bindRuntime } from './runtime.js';
import { registerMode, listModes } from './modes.js';

export function mountKit(ctx) {
  bindRuntime(ctx);
  bindSfx(ctx?.audio);
  if (typeof document !== 'undefined') mountUi(ctx);
  mountFx(ctx);
  if (ctx?.services) ctx.services.play = Object.assign(ctx.services.play || {}, { registerMode, listModes });
  try {
    const meta = store.get('meta');
    if (!meta.firstRun) store.update('meta', (d) => { d.firstRun = new Date().toISOString(); });
  } catch (e) { /* the notebook still works in memory */ }
}
