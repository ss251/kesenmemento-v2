// [ship:integrate] Page JS for tools/anime/phonemem.mjs --eval: the ship's state and whether the town is hidden.
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/phonemem.mjs --port 8964 --params "ship=1&act=2" --eval tools/anime/ship-memdiag.js
(() => {
  const ctx = window.__ctx, S = ctx.services.ship;
  if (!S) return { ship: null };
  const vis = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  let visDyn = 0; for (const c of ctx.dynamicRoot.children) if (c.visible) visDyn++;
  return { state: S.voyage.state, active: S.voyage.active, livery: S.ship.livery, tier: S.ship.tier, shipTris: S.ship.triangles,
    staticVisible: ctx.staticRoot.visible, dynamicVisibleChildren: visDyn, dynamicChildren: ctx.dynamicRoot.children.length,
    oceanActive: S.voyage.ocean.active, shipVisible: vis(S.ship.group), bodyOcean: document.body.classList.contains('klc-ship-ocean') };
})()
