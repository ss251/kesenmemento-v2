// [play:missions] Starts the lane from main.js until the kit's play/index.js exists.
// A literal import of src/anime/play/kit/index.js is intentionally absent: the bundler fails when that file is missing.

import { mount } from './index.js';
import { createShim } from './shim.js';

export function mountPlayMissions(ctx) {
  try {
    if (new URLSearchParams(globalThis.location?.search || '').get('play') === '0') return null;
  } catch { /* no location */ }
  if (ctx.services?.missions) return ctx.services.missions;
  const kit = ctx.services?.playKit || createShim(ctx);
  return mount(ctx, kit);
}
