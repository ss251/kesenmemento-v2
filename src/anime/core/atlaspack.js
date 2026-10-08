// [v6:phone-budget] The page layout of the static-batch texture atlas (core/batch2.js), kept free of the DOM and of three
// so the phone tier's texture sizes can be pinned by a plain unit test (test/v6-phone-budget.test.js).
//
// Tiles go tallest first onto next-fit shelves, on square pages whose side is the smallest power of two that holds every
// tile on one page (else `page`). That layout is what batch2.js has always built, and what the desktop tiers still get.
// The phone tier asks for `trim`: the same tiles at the same positions on the same pages (so every batch, material and draw
// call stays exactly as it was), but each page canvas is cut down to its content, rounded up to `quantum` px. A page was
// always a full square however little of it was used: the last page of a set is rarely full (the error hunt's tiles spilled
// 0.6 of a page onto a sixth 2048 x 2048 page, 22 MB with mips), the walk-in interiors fill half of theirs, and each
// arriving boat's three name plates took a 1024 x 1024 page (5.6 MB for 0.09 Mpx). Trimming takes the phone tier's texture
// estimate (390 x 844 at DPR 3) from 256 MB to ~215 MB with no tile resized, moved or dropped (docs/ARCHITECTURE.md).

/** Gutter around every tile (px, each side): the tile's edge pixels are stretched into it so bilinear taps and the first
 *  mip levels never read the neighbouring tile. */
export const PAD = 6;

/** Bytes of a mipmapped RGBA8 texture (the estimate tools/anime/phonemem.mjs uses: 4 B per texel, a third more for mips). */
export const MIP = 1.33;
/** Estimated GPU megabytes of a w x h RGBA8 texture with its mip chain (tools/anime/phonemem.mjs's formula). */
export const texMB = (w, h) => (w * h * 4 * MIP) / 1e6;

// [v4:phone] Shelf packing of the tiles (w, h already scaled) into square pages of side S: the page count.
export function shelfPages(list, S) {
  let pages = 1, x = 0, y = 0, shelf = 0;
  for (const it of list) {
    const W = it.w + PAD * 2, H = it.h + PAD * 2;
    if (W > S || H > S) return Infinity;
    if (x + W > S) { x = 0; y += shelf; shelf = 0; }
    if (y + H > S) { pages++; x = 0; y = 0; shelf = 0; }
    x += W; shelf = Math.max(shelf, H);
  }
  return pages;
}

const ceilTo = (v, q) => Math.ceil(v / q) * q;

/**
 * Lay the tiles of an atlas out on pages.
 * @param {{w:number,h:number}[]} sizes source size (px) of every tile, in the caller's order
 * @param {{page?:number, tileMax?:number, trim?:boolean, quantum?:number}} [opt]
 *   page: the largest page side (4096 desktop, 2048 phone); tileMax: tiles are scaled down (aspect kept) to at most this
 *   many px on a side; trim: cut every page down to its content (the phone tier); quantum: the multiple of px a trimmed
 *   side is rounded up to (64 keeps the first six mip levels exact)
 * @returns {{S:number, pages:{w:number,h:number,tiles:{i:number,x:number,y:number,w:number,h:number}[]}[]}}
 *   tile i (index into `sizes`) occupies the w x h rect at (x, y) of its page, y down from the top; its gutter lies
 *   outside that rect, PAD px on every side. The pages are w x h px each: S x S unless `trim`.
 */
export function planAtlas(sizes, { page = 4096, tileMax = 2048, trim = false, quantum = 64 } = {}) {
  // [mobile-perf] a size may carry its own `max` (px on its longer side): a tile need not be finer than the screen can show of it (batch2: density)
  const list = sizes.map((s, i) => { const k = Math.min(1, Math.min(tileMax, s.max > 0 ? s.max : tileMax) / Math.max(s.w, s.h)); return { i, w: Math.max(1, Math.round(s.w * k)), h: Math.max(1, Math.round(s.h * k)) }; })
    .sort((a, b) => b.h - a.h || b.w - a.w);   // tallest first
  if (!list.length) return { S: 0, pages: [] };
  let S = 256; while (S < page && shelfPages(list, S) > 1) S *= 2;   // the smallest square power of two that holds every tile on one page, else `page`
  const pages = []; let cur = null, x = 0, y = 0, shelf = 0;
  const open = () => { cur = { w: S, h: S, tiles: [] }; pages.push(cur); x = 0; y = 0; shelf = 0; };
  for (const it of list) {
    const W = it.w + PAD * 2, H = it.h + PAD * 2;
    if (!cur) open();
    if (x + W > S) { x = 0; y += shelf; shelf = 0; }
    if (y + H > S) open();
    cur.tiles.push({ i: it.i, x: x + PAD, y: y + PAD, w: it.w, h: it.h });
    x += W; shelf = Math.max(shelf, H);
  }
  if (trim) {
    for (const p of pages) {   // the content's right and bottom edge, gutter included
      p.w = Math.min(S, ceilTo(Math.max(...p.tiles.map((t) => t.x + t.w + PAD)), quantum));
      p.h = Math.min(S, ceilTo(Math.max(...p.tiles.map((t) => t.y + t.h + PAD)), quantum));
    }
  }
  return { S, pages };
}

/** Estimated GPU megabytes of a planned atlas (every page with its mip chain). */
export function planMB(plan) { return plan.pages.reduce((a, p) => a + texMB(p.w, p.h), 0); }

/** The UV rectangle of a planned tile on its (possibly non-square) page: a mesh's [0,1] uv u maps to u0 + u * su, v to
 *  v0 + v * sv. v counts up from the page's bottom edge (three's flipY canvas textures); `tile.y` counts down from the top. */
export function tileUV(tile, page) {
  return { u0: tile.x / page.w, v0: 1 - (tile.y + tile.h) / page.h, su: tile.w / page.w, sv: tile.h / page.h };
}
