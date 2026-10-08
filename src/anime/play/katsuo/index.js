// [play] 金のカツオ. mount(ctx, kit) is the feature contract.

import { mountCharms } from './world.js';

export function mountKatsuo(ctx) {
  const api = mountCharms(ctx);
  ctx.services.play = Object.assign(ctx.services.play || {}, { paintMap: api.paintMap, katsuo: api });
  return api;
}
