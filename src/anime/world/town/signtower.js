// [r2:12] The AEON Kesennuma sign tower (イオン気仙沼, OSM supermarket, lot 16/58540/25072/110): a beige stair block over the roof deck of the
// 2-storey mall, topped by a square magenta sign box with a white AEON logo on every face. Commons 'AEON Kesennuma 202509a.jpg' (2025-09-19):
// the main body is 11-12 m, the magenta box (#d6247f-ish) rises to 22-24 m over the entrance bay. Heights are estimated from the photo
// (storey bands, cars for scale). Data in LOT_TOWER (the kit's flat roof has none); the lot's own height, roof and colours are LOT_FIX + an override.

export const LOT_TOWER = {
  '16/58540/25072/110': {
    // WORLD position (ENU x east, z south), not lot-local: explore turns the far lots' frames to face the real road (explore.json `turned`), so the kit frame and the layout's
    // obb frame can differ by a half turn and a lot-local spot would land on the other face. This spot is 22 m from the lot centre toward its west end along the long axis and
    // 29 m toward the south-west long face (7 m inside it): the face the 2025-09-19 photo looks at, over the entrance bay with the canopies
    at: [-198.8, 1909.9], w: 9, d: 9, baseH: 5.2, signH: 6.4, body: '#e6d6cf', color: '#d6247f', text: 'AEON',
    src: 'Commons AEON Kesennuma 202509a (2025-09-19): the magenta sign box tops out at about 23 m over the entrance bay',
  },
};
/** the tower's position in a frame with origin (cx, cz) turned by rotY (three.js: local x -> (cos, -sin), local z -> (sin, cos)): { x, z } */
export function towerLocal(t, cx, cz, rotY) {
  const dx = t.at[0] - cx, dz = t.at[1] - cz, c = Math.cos(rotY), s = Math.sin(rotY);
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}
/** total height of the tower above the roof deck (m) */
export const towerRise = (t) => t.baseH + t.signH;

/** the AEON logo on a magenta card: white bold letters, slightly stretched, a thin white keyline (a canvas texture, no external image) */
export function logoTexture(ctx, text, color) {
  return ctx.tex.draw(512, 384, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 ${Math.round(h * 0.46)}px Helvetica, Arial, sans-serif`;
    g.fillText(text, w / 2, h * 0.5);
    g.fillRect(w * 0.12, h * 0.82, w * 0.76, 5);
  }, { key: 'signtower-' + text + color, repeat: [1, 1], anisotropy: 8 });
}

/**
 * Build the tower on a lot frame HF (y = ground) whose roof deck is at `deckY` (frame-local metres above the origin), at the frame-local spot t.x, t.z (see towerLocal).
 * Parts: the beige block, the magenta box and four white logos; each part is a plain box (no windows), the logos are cards a hair outside the box.
 */
export function buildSignTower(H, HF, deckY, t) {
  const { M } = H;
  HF.boxB(M.plain, t.body, t.w * 0.92, t.baseH, t.d * 0.92, t.x, deckY, t.z);
  const y0 = deckY + t.baseH;
  HF.boxB(M.plain, t.color, t.w, t.signH, t.d, t.x, y0, t.z);
  HF.boxB(M.plain, '#f2eee8', t.w * 1.02, 0.35, t.d * 1.02, t.x, y0 - 0.18, t.z);   // the white lighting band under the box
  const tex = logoTexture(H.ctx, t.text, t.color), mat = H.ctx.mat.decal('#ffffff', { map: tex, transparent: false });
  const yc = y0 + t.signH * 0.55, lw = t.w * 0.86, lh = lw * 0.75;
  for (const [nx, nz, ry] of [[0, 1, 0], [0, -1, Math.PI], [1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2]]) {
    H.card(HF, mat, [0, 0, 1, 1], t.x + nx * (t.w / 2 + 0.04), yc, t.z + nz * (t.d / 2 + 0.04), lw, Math.min(lh, t.signH * 0.8), { ry, noOutline: true });
  }
  return { top: y0 + t.signH };
}
