// [ship:integrate] Page JS for tools/anime/phonemem.mjs --eval: the ship's state and whether the town is hidden.
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/phonemem.mjs --port 8964 --params "ship=1&act=2" --start --eval tools/anime/ship-memdiag.js
// --start is required: a URL voyage waits for the visitor to leave the intro card (body.playing). Without it this
// reports state DOCKED, active false, oceanActive false, and the numbers are the city's, not Act 2's.
(() => {
  const ctx = window.__ctx, S = ctx.services.ship;
  if (!S) return { ship: null };
  const vis = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  let visDyn = 0; for (const c of ctx.dynamicRoot.children) if (c.visible) visDyn++;
  let arrivalsDrawn = 0; ctx.dynamicRoot.traverse((o) => { if (/^arrival[:-]/.test(o.name) && vis(o)) arrivalsDrawn++; });
  return { state: S.voyage.state, active: S.voyage.active, livery: S.ship.livery, tier: S.ship.tier, shipTris: S.ship.triangles,
    staticVisible: ctx.staticRoot.visible, dynamicVisibleChildren: visDyn, dynamicChildren: ctx.dynamicRoot.children.length,
    oceanActive: S.voyage.ocean.active, shipVisible: vis(S.ship.group), bodyOcean: document.body.classList.contains('klc-ship-ocean'),
    playing: document.body.classList.contains('playing'), arrivalsDrawn };
})()
