// [play] The one mode word every feature asks for.
// Order matters: a planet or the title card is a menu; a photo wins over a vehicle;
// an interior wins over flying; then drive, sail, fly, walk.
// 'drive' / 'fly' / 'sail' are the engine's flags. KIT-API names them
// 'drive' | 'fly' | 'sail' (the design's car / drone / ship).

export function playModeFrom(s = {}) {
  if (s.menu || s.planet) return 'menu';
  if (s.photo) return 'photo';
  if (s.interior) return 'interior';
  if (s.drive) return 'drive';
  if (s.sail) return 'sail';
  if (s.fly) return 'fly';
  return 'walk';
}

export function readMode(ctx) {
  if (!ctx) return 'menu';
  const cam = ctx.camera?.position;
  let inside = null;
  try { inside = cam && ctx.services?.explore?.interiors?.at?.(cam.x, cam.y, cam.z); } catch (e) { inside = null; }
  let playing = true;
  try {
    if (typeof document !== 'undefined' && document.body) playing = document.body.classList.contains('playing') || document.body.classList.contains('shot');
  } catch (e) { /* tests */ }
  return playModeFrom({
    menu: !!ctx.planet?.active || !playing,
    planet: !!ctx.planet?.active,
    photo: !!ctx.shooting,
    interior: !!inside,
    drive: !!ctx.services?.explore?.drive?.active,
    sail: !!(ctx.services?.explore?.sail?.active || ctx.services?.sail?.active),
    fly: !!ctx.playerObj?.fly,
  });
}

/** Feet of whoever is moving: walker, drone, car or ship. `ctx.player.position` already follows the car and the ship. */
export function readPlayerPos(ctx, out) {
  const p = ctx?.player?.position;
  if (p && out) { out.x = p.x; out.y = p.y; out.z = p.z; }
  return out;
}
