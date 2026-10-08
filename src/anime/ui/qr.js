// [contrib] A small QR Code encoder (model 2, byte mode, versions 1-10, error correction L / M / Q / H) for the device-transfer code in the
// report sheet: no network, no library, about 200 lines. It follows the algorithm of Project Nayuki's QR Code generator (MIT), reduced to
// what a short URL needs. Verified against python-qrcode (module for module) and decoded with CoreImage's QR detector;
// test/contrib-qr.test.js pins golden matrices.
//
//   const qr = qrEncode('https://app.example/?claim=K7M2X9QP4A')   -> { version, ecl, mask, size, modules: boolean[][] }  (modules[y][x], true = dark)
//   qrToSvg(qr, { border: 4, dark: '#14213d', light: '#fff' })     -> '<svg ...>' (one <path>, crispEdges; width / height are set by the caller's CSS)
//   qrToPath(qr, border)                                           -> the path data alone
// qrEncode throws RangeError when the text does not fit version 10 at the chosen level (271 bytes at L, 213 at M, 151 at Q, 119 at H).
const ECL = { L: { ord: 0, bits: 1 }, M: { ord: 1, bits: 0 }, Q: { ord: 2, bits: 3 }, H: { ord: 3, bits: 2 } };
// error-correction codewords per block, and the number of blocks, by [level][version] (ISO/IEC 18004 table 9; index 0 unused)
const ECC_PER_BLOCK = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28],
];
const NUM_BLOCKS = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8],
];
export const MAX_VERSION = 10;

const rawModules = (v) => {
  let n = (16 * v + 128) * v + 64;
  if (v >= 2) { const a = Math.floor(v / 7) + 2; n -= (25 * a - 10) * a - 55; if (v >= 7) n -= 36; }
  return n;
};
const dataCodewords = (v, e) => Math.floor(rawModules(v) / 8) - ECC_PER_BLOCK[e.ord][v] * NUM_BLOCKS[e.ord][v];

// ---- Reed-Solomon over GF(256), polynomial 0x11D
const gfMul = (x, y) => { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; } return z; };
function rsDivisor(degree) {
  const r = new Array(degree - 1).fill(0).concat([1]);
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < r.length; j++) { r[j] = gfMul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
    root = gfMul(root, 2);
  }
  return r;
}
function rsRemainder(data, div) {
  const r = div.map(() => 0);
  for (const b of data) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= gfMul(c, f); }); }
  return r;
}

const bit = (x, i) => ((x >>> i) & 1) !== 0;

/** Encode `text` (UTF-8). Options: ecl 'L' | 'M' | 'Q' | 'H' (default 'M', raised for free when it fits the same version), minVersion, maxVersion, mask (0-7, default: the lowest penalty). */
export function qrEncode(text, { ecl = 'M', minVersion = 1, maxVersion = MAX_VERSION, mask = -1, boost = true } = {}) {
  const bytes = new TextEncoder().encode(String(text));
  let e = ECL[ecl];
  if (!e) throw new RangeError('ecl must be L, M, Q or H');
  maxVersion = Math.min(maxVersion, MAX_VERSION);
  // the smallest version that holds it
  let version = minVersion, used = 0;
  for (; ; version++) {
    const cap = dataCodewords(version, e) * 8;
    used = 4 + (version <= 9 ? 8 : 16) + bytes.length * 8;
    if (used <= cap) break;
    if (version >= maxVersion) throw new RangeError(`QR: ${bytes.length} bytes do not fit version ${maxVersion} at level ${ecl}`);
  }
  if (boost) for (const up of ['M', 'Q', 'H']) if (ECL[up].ord > e.ord && used <= dataCodewords(version, ECL[up]) * 8) e = ECL[up];
  const eclName = Object.keys(ECL).find((k) => ECL[k] === e);

  // the data bits: mode 0100, the byte count, the bytes, a terminator, padding to a byte, then 0xEC 0x11 up to the capacity
  const bits = [];
  const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(4, 4); put(bytes.length, version <= 9 ? 8 : 16); for (const b of bytes) put(b, 8);
  const capBits = dataCodewords(version, e) * 8;
  put(0, Math.min(4, capBits - bits.length)); put(0, (8 - bits.length % 8) % 8);
  for (let pad = 0xec; bits.length < capBits; pad ^= 0xec ^ 0x11) put(pad, 8);
  const data = []; for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));

  // error correction, blocks interleaved
  const nb = NUM_BLOCKS[e.ord][version], eccLen = ECC_PER_BLOCK[e.ord][version], raw = Math.floor(rawModules(version) / 8);
  const shortBlocks = nb - raw % nb, shortLen = Math.floor(raw / nb), div = rsDivisor(eccLen), blocks = [];
  for (let i = 0, k = 0; i < nb; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < shortBlocks ? 0 : 1)); k += dat.length;
    const ecc = rsRemainder(dat, div);
    if (i < shortBlocks) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const codewords = [];
  for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - eccLen || j >= shortBlocks) codewords.push(b[i]); });

  // the matrix
  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array(size).fill(false)), fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => { modules[y][x] = dark; fn[y][x] = true; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }   // timing
  const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy; if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4); } };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  const align = [];
  if (version > 1) { const n = Math.floor(version / 7) + 2, step = Math.ceil((version * 4 + 4) / (n * 2 - 2)) * 2; align.push(6); for (let p = size - 7; align.length < n; p -= step) align.splice(1, 0, p); }
  for (let i = 0; i < align.length; i++) for (let j = 0; j < align.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(align[i] + dx, align[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const formatBits = (m) => {
    const d = (e.bits << 3) | m; let r = d;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const b = ((d << 10) | r) ^ 0x5412;
    for (let i = 0; i <= 5; i++) set(8, i, bit(b, i));
    set(8, 7, bit(b, 6)); set(8, 8, bit(b, 7)); set(7, 8, bit(b, 8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(b, i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(b, i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(b, i));
    set(8, size - 8, true);
  };
  formatBits(0);
  if (version >= 7) {
    let r = version; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const b = (version << 12) | r;
    for (let i = 0; i < 18; i++) { const dark = bit(b, i), a = size - 11 + i % 3, c = Math.floor(i / 3); set(a, c, dark); set(c, a, dark); }
  }
  // the codewords in the zigzag
  let k = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
      const x = right - j, y = ((right + 1) & 2) === 0 ? size - 1 - v : v;
      if (!fn[y][x] && k < codewords.length * 8) { modules[y][x] = bit(codewords[k >>> 3], 7 - (k & 7)); k++; }
    }
  }
  const applyMask = (m) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const inv = [(x + y) % 2 === 0, y % 2 === 0, x % 3 === 0, (x + y) % 3 === 0, (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, x * y % 2 + x * y % 3 === 0, (x * y % 2 + x * y % 3) % 2 === 0, ((x + y) % 2 + x * y % 3) % 2 === 0][m];
      if (!fn[y][x] && inv) modules[y][x] = !modules[y][x];
    }
  };
  if (mask < 0) {
    let best = 1e9;
    for (let m = 0; m < 8; m++) { applyMask(m); formatBits(m); const p = penalty(modules, size); if (p < best) { mask = m; best = p; } applyMask(m); }
  }
  applyMask(mask); formatBits(mask);
  return { version, ecl: eclName, mask, size, modules };
}

// ---- the mask penalty (ISO 18004 rules 1-4)
function penalty(m, size) {
  let r = 0;
  const finderCount = (h) => { const n = h[1], core = n > 0 && h[2] === n && h[3] === n * 3 && h[4] === n && h[5] === n; return (core && h[0] >= n * 4 && h[6] >= n ? 1 : 0) + (core && h[6] >= n * 4 && h[0] >= n ? 1 : 0); };
  const add = (len, h) => { if (h[0] === 0) len += size; h.pop(); h.unshift(len); };
  const endCount = (color, len, h) => { if (color) { add(len, h); len = 0; } len += size; add(len, h); return finderCount(h); };
  for (const horizontal of [true, false]) {
    for (let a = 0; a < size; a++) {
      let color = false, run = 0; const h = [0, 0, 0, 0, 0, 0, 0];
      for (let b = 0; b < size; b++) {
        const cell = horizontal ? m[a][b] : m[b][a];
        if (cell === color) { run++; if (run === 5) r += 3; else if (run > 5) r++; } else { add(run, h); if (!color) r += finderCount(h) * 40; color = cell; run = 1; }
      }
      r += endCount(color, run, h) * 40;
    }
  }
  for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = m[y][x]; if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) r += 3; }
  let dark = 0; for (const row of m) for (const c of row) if (c) dark++;
  const total = size * size;
  return r + (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
}

/** SVG path data for the dark modules: one rectangle per horizontal run, shifted by `border` modules. */
export function qrToPath(qr, border = 4) {
  const out = [];
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (!qr.modules[y][x]) continue;
      let n = 1; while (x + n < qr.size && qr.modules[y][x + n]) n++;
      out.push(`M${x + border} ${y + border}h${n}v1h-${n}z`); x += n - 1;
    }
  }
  return out.join('');
}
/** The code as an SVG string (quiet zone included); size it with CSS. `title` is the accessible name. */
export function qrToSvg(qr, { border = 4, dark = '#14213d', light = '#ffffff', title = '' } = {}) {
  const n = qr.size + border * 2, t = String(title).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img"${t ? ` aria-label="${t}"` : ' aria-hidden="true"'}><rect width="${n}" height="${n}" fill="${light}"/><path d="${qrToPath(qr, border)}" fill="${dark}"/></svg>`;
}
