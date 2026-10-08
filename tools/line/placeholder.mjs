// A plain 2500×1686 rich-menu placeholder: six labelled tiles.
// The real art is tools/line/richmenu.png when the conductor drops it in.
// No sharp. The PNG is uncompressed-filter RGB, deflated.

import { deflateSync } from "node:zlib";

const W = 2500;
const H = 1686;
const COLS = [833, 833, 834];
const ROW_H = 843;

const TILES = [
  { bg: [0x16, 0x5e, 0x83], fg: [0xfb, 0xfa, 0xf5], lines: ["バグを", "知らせる"] },
  { bg: [0xfb, 0xfa, 0xf5], fg: [0x17, 0x18, 0x4b], lines: ["町の", "間違い"] },
  { bg: [0x00, 0xa3, 0xaf], fg: [0x17, 0x18, 0x4b], lines: ["写真を", "送る"] },
  { bg: [0xf8, 0xb5, 0x00], fg: [0x17, 0x18, 0x4b], lines: ["アイデア"] },
  { bg: [0xf1, 0x90, 0x72], fg: [0x17, 0x18, 0x4b], lines: ["あそぶ"] },
  { bg: [0x22, 0x3a, 0x70], fg: [0xfb, 0xfa, 0xf5], lines: ["使い方"] },
];

function raster(strokes) {
  const g = Array.from({ length: 16 }, () => 0);
  const plot = (x, y) => {
    for (let dy = 0; dy <= 1; dy++) {
      for (let dx = 0; dx <= 1; dx++) {
        const xi = Math.round(x) + dx;
        const yi = Math.round(y) + dy;
        if (xi < 0 || yi < 0 || xi > 15 || yi > 15) continue;
        g[yi] |= 1 << (15 - xi);
      }
    }
  };
  for (const s of strokes) {
    const [x1, y1, x2, y2] = s;
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1) * 2;
    for (let i = 0; i <= steps; i++) plot(x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps);
  }
  return g;
}

/** 16×16 glyphs for the six tile labels. Coordinates are a 0–14 grid. */
const FONT = {
  バ: raster([[3, 2, 6, 12], [7, 3, 12, 12], [11, 1, 13, 1], [12, 0, 14, 2]]),
  グ: raster([[3, 2, 11, 2], [6, 2, 4, 13], [6, 7, 12, 7], [12, 7, 10, 13], [11, 0, 13, 0], [12, 1, 14, 3]]),
  を: raster([[2, 3, 12, 3], [4, 3, 3, 12], [7, 3, 7, 8], [7, 8, 12, 8], [12, 5, 12, 13], [3, 12, 10, 12]]),
  知: raster([[2, 2, 2, 13], [2, 2, 7, 2], [7, 2, 7, 13], [2, 7, 7, 7], [9, 2, 13, 2], [9, 2, 9, 13], [9, 7, 13, 7], [13, 2, 13, 13]]),
  ら: raster([[6, 2, 6, 6], [3, 6, 12, 6], [10, 6, 8, 13], [4, 10, 8, 13]]),
  せ: raster([[3, 3, 12, 3], [3, 7, 12, 7], [7, 3, 7, 12], [4, 12, 11, 12]]),
  る: raster([[4, 3, 11, 3], [11, 3, 8, 8], [3, 8, 12, 8], [12, 8, 10, 13], [4, 11, 10, 13]]),
  町: raster([[2, 2, 2, 13], [2, 2, 6, 2], [6, 2, 6, 13], [2, 13, 6, 13], [8, 2, 13, 2], [8, 2, 8, 13], [8, 7, 13, 7], [13, 2, 13, 8]]),
  の: raster([[4, 3, 11, 3], [11, 3, 11, 8], [4, 8, 12, 8], [4, 8, 4, 13], [4, 13, 10, 13]]),
  間: raster([[2, 2, 13, 2], [2, 2, 2, 13], [13, 2, 13, 13], [2, 13, 13, 13], [2, 7, 13, 7], [7, 7, 7, 13]]),
  違: raster([[2, 4, 6, 2], [2, 6, 6, 4], [8, 2, 13, 2], [8, 5, 13, 5], [8, 8, 13, 8], [8, 11, 13, 11], [10, 2, 10, 12]]),
  い: raster([[5, 2, 5, 8], [5, 8, 8, 13], [11, 3, 11, 13]]),
  写: raster([[3, 2, 12, 2], [3, 2, 3, 6], [3, 6, 12, 6], [12, 2, 12, 6], [6, 6, 6, 13], [6, 9, 12, 9], [12, 9, 12, 13]]),
  真: raster([[3, 1, 12, 1], [3, 4, 12, 4], [3, 1, 3, 4], [12, 1, 12, 4], [5, 4, 5, 13], [10, 4, 10, 13], [5, 8, 10, 8], [5, 13, 10, 13]]),
  送: raster([[2, 5, 6, 3], [2, 7, 6, 5], [8, 2, 13, 2], [8, 6, 13, 6], [8, 10, 13, 10], [10, 2, 10, 13]]),
  ア: raster([[3, 3, 12, 3], [8, 3, 6, 13], [8, 7, 13, 12]]),
  イ: raster([[4, 4, 8, 7], [10, 3, 10, 13]]),
  デ: raster([[3, 3, 12, 3], [7, 3, 7, 8], [3, 8, 12, 8], [12, 8, 10, 13], [11, 1, 13, 1], [12, 0, 14, 2]]),
  あ: raster([[4, 3, 11, 3], [4, 3, 4, 7], [4, 7, 11, 7], [8, 3, 8, 13], [4, 11, 12, 11], [12, 8, 12, 13]]),
  そ: raster([[3, 3, 11, 3], [8, 3, 5, 8], [4, 8, 12, 8], [12, 8, 9, 13], [4, 12, 9, 13]]),
  ぶ: raster([[4, 1, 6, 1], [8, 1, 10, 1], [3, 4, 12, 4], [6, 4, 5, 13], [6, 8, 12, 8], [12, 8, 11, 13]]),
  使: raster([[2, 2, 2, 13], [5, 2, 5, 13], [5, 2, 12, 2], [5, 7, 12, 7], [8, 7, 12, 13]]),
  方: raster([[3, 2, 12, 2], [3, 2, 3, 7], [3, 7, 12, 7], [8, 7, 8, 13], [8, 10, 13, 13]]),
};

export function glyphRows(ch) {
  const rows = FONT[ch];
  if (!rows) throw new Error(`missing glyph: ${ch}`);
  return rows;
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(w, h, rgb) {
  const stride = w * 3;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(rgb.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function fill(rgb, x, y, w, h, color) {
  const [r, g, b] = color;
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(W, x + w);
  const y1 = Math.min(H, y + h);
  for (let yy = y0; yy < y1; yy++) {
    let i = (yy * W + x0) * 3;
    for (let xx = x0; xx < x1; xx++) {
      rgb[i] = r;
      rgb[i + 1] = g;
      rgb[i + 2] = b;
      i += 3;
    }
  }
}

function blit(rgb, rows, x, y, scale, color) {
  const [r, g, b] = color;
  for (let gy = 0; gy < rows.length; gy++) {
    const bits = rows[gy];
    for (let gx = 0; gx < 16; gx++) {
      if (((bits >>> (15 - gx)) & 1) === 0) continue;
      fill(rgb, x + gx * scale, y + gy * scale, scale, scale, [r, g, b]);
    }
  }
}

function drawLabel(rgb, lines, tileX, tileY, tileW, tileH, color) {
  const scale = 7;
  const gap = 18;
  const lineH = 16 * scale;
  const blockH = lines.length * lineH + (lines.length - 1) * gap;
  let y = tileY + Math.round((tileH - blockH) / 2);
  for (const line of lines) {
    const blockW = line.length * 16 * scale + Math.max(0, line.length - 1) * 8;
    let x = tileX + Math.round((tileW - blockW) / 2);
    for (const ch of line) {
      blit(rgb, glyphRows(ch), x, y, scale, color);
      x += 16 * scale + 8;
    }
    y += lineH + gap;
  }
}

/** @returns {Buffer} */
export function placeholderPng() {
  const rgb = new Uint8Array(W * H * 3);
  fill(rgb, 0, 0, W, H, [0xfb, 0xfa, 0xf5]);
  for (let i = 0; i < TILES.length; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = COLS.slice(0, col).reduce((s, n) => s + n, 0);
    const y = row * ROW_H;
    const tile = TILES[i];
    fill(rgb, x + 8, y + 8, COLS[col] - 16, ROW_H - 16, tile.bg);
    drawLabel(rgb, tile.lines, x, y, COLS[col], ROW_H, tile.fg);
  }
  return encodePng(W, H, rgb);
}

export function asciiGlyph(ch) {
  return glyphRows(ch).map((bits) => [...Array(16)].map((_, i) => ((bits >>> (15 - i)) & 1) ? "#" : ".").join("")).join("\n");
}
