// Ported from Sakuragaoka Station (Kenton-GMI/sakuragaoka-station, MIT; see src/anime/LICENSE-sakuragaoka-station).
// Canvas-drawn textures: signs, posters, menus, patterns. Works in the browser and (stubbed) in node.
import * as THREE from 'three';

export const FONTS = {
  sans: '"Noto Sans JP", "Yu Gothic UI", "Yu Gothic", "Meiryo", "Hiragino Sans", sans-serif',
  serif: '"Noto Serif JP", "Yu Mincho", "Hiragino Mincho ProN", serif',
  round: '"Zen Maru Gothic", "Noto Sans JP", "Yu Gothic", sans-serif',
  hand: '"Yusei Magic", "Zen Maru Gothic", "Noto Sans JP", sans-serif',   // chalkboard / handwritten
  brush: '"Yuji Syuku", "Noto Serif JP", "Yu Mincho", serif',               // noren / traditional
  en: '"Noto Sans JP", "Segoe UI", Arial, sans-serif',
};

export function createTextures() {
  const cache = new Map();
  let pixelBudget = 0;

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    return { canvas: c, g };
  }

  function finish(c, opts = {}) {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    t.anisotropy = opts.anisotropy ?? 4;
    if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(opts.repeat[0], opts.repeat[1]); }
    if (opts.nearest) { t.magFilter = THREE.NearestFilter; }
    t.needsUpdate = true;
    pixelBudget += c.width * c.height;
    return t;
  }

  /** Generic: draw(g, w, h) paints onto a w×h canvas; returns a CanvasTexture.
   *  key: optional cache key — identical keys return the same texture. */
  function draw(w, h, fn, opts = {}) {
    if (opts.key && cache.has(opts.key)) return cache.get(opts.key);
    const { canvas: c, g } = canvas(w, h);
    fn(g, w, h);
    const t = finish(c, opts);
    if (opts.key) cache.set(opts.key, t);
    return t;
  }

  /** Fit a single line of text into maxW by shrinking the font. Returns used size. */
  function fitText(g, text, x, y, maxW, size, font, weight = 700, opts = {}) {
    let s = size;
    g.font = `${weight} ${s}px ${font}`;
    while (s > 6 && g.measureText(text).width > maxW) { s -= 1; g.font = `${weight} ${s}px ${font}`; }
    if (opts.stroke) { g.lineWidth = opts.stroke; g.strokeStyle = opts.strokeStyle || '#fff'; g.strokeText(text, x, y); }
    g.fillText(text, x, y);
    return s;
  }

  /** Vertical Japanese text (top to bottom), centered at x, starting at y. */
  function verticalText(g, text, x, y, size, font, weight = 700, gap = 1.05) {
    g.font = `${weight} ${size}px ${font}`;
    g.textAlign = 'center'; g.textBaseline = 'top';
    let yy = y;
    for (const ch of text) { g.fillText(ch, x, yy); yy += size * gap; }
    return yy;
  }

  /** Quick sign: {w,h,bg,fg,text,sub,font,weight,size,subSize,vertical,border,borderColor,radius,align,key}
   *  sub: optional second (smaller) line such as romaji. */
  function sign(o = {}) {
    const w = o.w || 512, h = o.h || 128;
    const key = o.key || 'sign|' + JSON.stringify(o);
    return draw(w, h, (g) => {
      const r = o.radius ?? 0;
      g.fillStyle = o.bg || '#ffffff';
      roundRect(g, 0, 0, w, h, r); g.fill();
      if (o.border) { g.lineWidth = o.border; g.strokeStyle = o.borderColor || '#333'; roundRect(g, o.border / 2, o.border / 2, w - o.border, h - o.border, Math.max(0, r - o.border / 2)); g.stroke(); }
      g.fillStyle = o.fg || '#222';
      const font = o.font || FONTS.sans; const weight = o.weight || 700;
      if (o.vertical) {
        const size = o.size || Math.min(w * 0.7, (h * 0.9) / Math.max(1, [...(o.text || '')].length));
        const total = [...(o.text || '')].length * size * 1.05;
        verticalText(g, o.text || '', w / 2, (h - total) / 2, size, font, weight);
      } else {
        g.textAlign = o.align || 'center'; g.textBaseline = 'middle';
        const x = o.align === 'left' ? w * 0.06 : o.align === 'right' ? w * 0.94 : w / 2;
        const hasSub = !!o.sub;
        const size = o.size || h * (hasSub ? 0.5 : 0.62);
        fitText(g, o.text || '', x, hasSub ? h * 0.4 : h * 0.53, w * 0.9, size, font, weight);
        if (hasSub) { g.globalAlpha = 0.85; fitText(g, o.sub, x, h * 0.8, w * 0.9, o.subSize || h * 0.2, o.subFont || FONTS.en, 500); g.globalAlpha = 1; }
      }
    }, { key, ...o.texOpts });
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    if (!r) { g.rect(x, y, w, h); return; }
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  /** Seeded speckle / grain pattern useful as a subtle tiling detail map. */
  function noise(w, h, seed, fn) {
    return draw(w, h, (g) => {
      let s = seed >>> 0 || 1;
      const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
      fn(g, w, h, rnd);
    }, { repeat: [1, 1] });
  }

  return { canvas, finish, draw, sign, fitText, verticalText, roundRect, noise, FONTS, cache, get pixels() { return pixelBudget; } };
}
