// [contrib] The tiny QR encoder for the device-transfer code (ui/qr.js). Verified outside the test suite against python-qrcode (every module
// of 28 codes identical with the same version, level and mask) and decoded with CoreImage's QR detector (33 images, exact text back); here the
// standard's capacities, the structure of the matrix and golden hashes of verified matrices keep it that way.
import { describe, test, expect } from "bun:test";
import { createHash } from "node:crypto";
import { qrEncode, qrToPath, qrToSvg, MAX_VERSION } from "../src/anime/ui/qr.js";

const sha = (q) => createHash("sha1").update(q.modules.map((r) => r.map((c) => (c ? 1 : 0)).join("")).join("\n")).digest("hex");
// byte-mode capacities of versions 1-10 (ISO/IEC 18004 table 7)
const CAP = { L: [17, 32, 53, 78, 106, 134, 154, 192, 230, 271], M: [14, 26, 42, 62, 84, 106, 122, 152, 180, 213], Q: [11, 20, 32, 46, 60, 74, 86, 108, 130, 151], H: [7, 14, 24, 34, 44, 58, 64, 84, 98, 119] };

describe("qrEncode: versions and capacities (the standard's table)", () => {
  test("a payload of exactly the capacity fits that version; one byte more needs the next (or does not fit version 10)", () => {
    for (const ecl of ["L", "M", "Q", "H"]) CAP[ecl].forEach((cap, i) => {
      const v = i + 1;
      expect([ecl, v, qrEncode("x".repeat(cap), { ecl, boost: false }).version]).toEqual([ecl, v, v]);
      if (v < MAX_VERSION) expect([ecl, v, qrEncode("x".repeat(cap + 1), { ecl, boost: false }).version]).toEqual([ecl, v, v + 1]);
      else expect(() => qrEncode("x".repeat(cap + 1), { ecl, boost: false })).toThrow(RangeError);
    });
  });
  test("UTF-8: 気仙沼 is 9 bytes (v1 at M holds 14: 4 characters; a long Japanese string moves up)", () => {
    expect(qrEncode("気仙沼", { ecl: "M", boost: false }).version).toBe(1);
    expect(qrEncode("気仙沼リビングシティ 修正を報告", { ecl: "Q", boost: false }).version).toBe(4);   // 45 bytes
    expect(() => qrEncode("気".repeat(100), { ecl: "L" })).toThrow(/do not fit version 10/);
  });
  test("a free upgrade of the error correction when the data still fits the same version", () => {
    const small = qrEncode("hi"); expect([small.version, small.ecl]).toEqual([1, "H"]);
    const fixed = qrEncode("hi", { ecl: "M", boost: false }); expect(fixed.ecl).toBe("M");
    const full = qrEncode("x".repeat(14)); expect([full.version, full.ecl]).toEqual([1, "M"]);   // 14 bytes fill v1 at M: no room for Q
    expect(qrEncode("x".repeat(20), { ecl: "L" }).ecl).toBe("Q");   // v2 at L holds 32; Q holds 20: raised to Q
    expect(qrEncode("x".repeat(21), { ecl: "L" }).ecl).toBe("M");   // 21 > 20: M (26) is the best that fits
    expect(qrEncode("x".repeat(30), { ecl: "L" }).ecl).toBe("L");   // 30 > 26: stays L
  });
  test("a minimum version is honoured; a bad level is a RangeError", () => {
    expect(qrEncode("a", { minVersion: 5 }).version).toBe(5); expect(qrEncode("a", { minVersion: 5 }).size).toBe(37);
    expect(() => qrEncode("a", { ecl: "X" })).toThrow(RangeError);
  });
});

describe("the matrix has the structure every scanner looks for", () => {
  const q = qrEncode("https://kesennuma.example/?claim=K7M2X9QP4A", { ecl: "M", boost: false });
  const at = (x, y) => q.modules[y][x];
  test("size is 4 x version + 17 and square", () => {
    expect(q.size).toBe(q.version * 4 + 17); expect(q.modules.length).toBe(q.size); expect(q.modules.every((r) => r.length === q.size)).toBe(true);
  });
  test("three finder patterns (7x7: dark ring, light ring, 3x3 dark core) with their light separators", () => {
    for (const [ox, oy] of [[0, 0], [q.size - 7, 0], [0, q.size - 7]]) {
      for (let dy = 0; dy < 7; dy++) for (let dx = 0; dx < 7; dx++) {
        const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
        expect([ox + dx, oy + dy, at(ox + dx, oy + dy)]).toEqual([ox + dx, oy + dy, ring !== 2]);   // ring 0, 1: dark; ring 2: light; ring 3: dark
      }
    }
    for (let i = 0; i < 8; i++) { expect(at(i, 7)).toBe(false); expect(at(7, i)).toBe(false); expect(at(q.size - 8, i)).toBe(false); expect(at(q.size - 1 - i, 7)).toBe(false); expect(at(i, q.size - 8)).toBe(false); expect(at(7, q.size - 1 - i)).toBe(false); }
  });
  test("timing patterns alternate along row 6 and column 6; the dark module sits at (8, size - 8)", () => {
    for (let i = 8; i < q.size - 8; i++) { expect(at(i, 6)).toBe(i % 2 === 0); expect(at(6, i)).toBe(i % 2 === 0); }
    expect(at(8, q.size - 8)).toBe(true);
  });
  test("an alignment pattern from version 2 on (5x5 ring around a dark centre)", () => {
    const v = qrEncode("x".repeat(40), { ecl: "L", boost: false });   // version 3 (v2 holds 32 at L): centre at (22, 22)
    expect(v.version).toBe(3);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) expect(v.modules[22 + dy][22 + dx]).toBe(Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  });
  test("the format information is a valid BCH(15,5) word (both copies agree) and says which level and mask were used", () => {
    const first = [], second = [];
    for (let i = 0; i <= 5; i++) first[i] = at(8, i); first[6] = at(8, 7); first[7] = at(8, 8); first[8] = at(7, 8); for (let i = 9; i < 15; i++) first[i] = at(14 - i, 8);
    for (let i = 0; i < 8; i++) second[i] = at(q.size - 1 - i, 8); for (let i = 8; i < 15; i++) second[i] = at(8, q.size - 15 + i);
    expect(second).toEqual(first);
    const word = first.reduce((n, b, i) => n | ((b ? 1 : 0) << i), 0) ^ 0x5412, data = word >> 10;
    let rem = data; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    expect(rem).toBe(word & 0x3ff);                                       // BCH check bits
    expect(data >> 3).toBe(0);                                            // level M = 00
    expect(data & 7).toBe(q.mask);
  });
  test("version 7 and up carry the version information twice (18 bits, BCH(18,6))", () => {
    const v = qrEncode("y".repeat(150), { ecl: "L", boost: false }); expect(v.version).toBe(7);
    const a = [], b = [];
    for (let i = 0; i < 18; i++) { a[i] = v.modules[Math.floor(i / 3)][v.size - 11 + i % 3]; b[i] = v.modules[v.size - 11 + i % 3][Math.floor(i / 3)]; }
    expect(b).toEqual(a);
    const word = a.reduce((n, bit, i) => n | ((bit ? 1 : 0) << i), 0);
    expect(word >> 12).toBe(7);
    let rem = 7; for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25); expect(rem).toBe(word & 0xfff);
  });
  test("all eight masks give a valid code of the same size, and the automatic choice is one of them", () => {
    const sizes = new Set(); for (let m = 0; m < 8; m++) { const x = qrEncode("mask test", { mask: m, boost: false }); expect(x.mask).toBe(m); sizes.add(x.size); }
    expect(sizes.size).toBe(1);
    const auto = qrEncode("mask test", { boost: false }); expect(auto.mask).toBeGreaterThanOrEqual(0); expect(auto.mask).toBeLessThan(8);
  });
  test("deterministic: the same text gives the same matrix", () => {
    expect(sha(qrEncode("same"))).toBe(sha(qrEncode("same"))); expect(sha(qrEncode("same"))).not.toBe(sha(qrEncode("sane")));
  });
});

describe("golden matrices (each verified module for module against python-qrcode and decoded by CoreImage)", () => {
  const GOLD = [
    ["https://kesennuma.example/?claim=K7M2X9QP4A", { ecl: "M", boost: false }, 4, 2, "41a80c258d1e1e5ccf9120f98ef11767dc7cb0f3"],
    ["https://kesennuma-living-city-production.up.railway.app/?claim=K7M2X9QP4A", { ecl: "M", boost: false }, 5, 5, "7a689b3337f7ffbca29523379d48c5da8a2cf728"],
    ["http://127.0.0.1:8986/?claim=K7M2X9QP4A&contribApi=http%3A%2F%2F127.0.0.1%3A8988", { ecl: "M", boost: false }, 5, 2, "e18e544ffd32bb6592a2cfd57c53eaa4f5392867"],
    ["気仙沼リビングシティ 修正を報告", { ecl: "Q", boost: false }, 4, 0, "4986f20016ca0e16fc922818b2a2e8e9196b8d2c"],
    ["y".repeat(150) + "z", { ecl: "L", boost: false }, 7, 1, "a49fc6bbc98b7cc7a0eb1a8f7f0fdb502b2068a7"],
    ["hi", {}, 1, 0, "40079cc1dcbe3348b190983ae3edaff33bd6fe7e"],
  ];
  for (const [text, opts, version, mask, hash] of GOLD) {
    test(`${JSON.stringify(text.slice(0, 28))} -> v${version}, mask ${mask}`, () => {
      const q = qrEncode(text, opts);
      expect([q.version, q.mask, sha(q)]).toEqual([version, mask, hash]);
    });
  }
});

describe("SVG output", () => {
  const q = qrEncode("hello", { ecl: "M" });
  /** Read the path back into a grid: the module at each 'M x y h n v1' run. */
  const gridOf = (path, border) => {
    const g = Array.from({ length: q.size }, () => new Array(q.size).fill(false));
    for (const m of path.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) for (let i = 0; i < Number(m[3]); i++) g[Number(m[2]) - border][Number(m[1]) - border + i] = true;
    return g;
  };
  test("the path is exactly the dark modules (runs merged), shifted by the quiet zone", () => {
    for (const border of [0, 2, 4]) expect(gridOf(qrToPath(q, border), border)).toEqual(q.modules);
    expect(qrToPath(q, 4).length).toBeLessThan(q.size * q.size * 4);
  });
  test("an <svg> with a viewBox that includes the 4-module quiet zone, a light background, one path, crisp edges", () => {
    const svg = qrToSvg(q, { title: "引き継ぎ用のQRコード" });
    expect(svg.startsWith("<svg ")).toBe(true); expect(svg).toContain(`viewBox="0 0 ${q.size + 8} ${q.size + 8}"`); expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg).toContain('role="img"'); expect(svg).toContain('aria-label="引き継ぎ用のQRコード"'); expect(svg).toContain('fill="#ffffff"'); expect(svg.match(/<path /g)).toHaveLength(1); expect(svg.endsWith("</svg>")).toBe(true);
    expect(qrToSvg(q, { border: 2, dark: "#000", light: "#eee" })).toContain(`viewBox="0 0 ${q.size + 4} ${q.size + 4}"`);
  });
  test("the title is escaped; without one the picture is hidden from assistive technology", () => {
    expect(qrToSvg(q, { title: 'a"<b>&' })).toContain('aria-label="a&quot;&lt;b&gt;&amp;"');
    expect(qrToSvg(q)).toContain('aria-hidden="true"'); expect(qrToSvg(q)).not.toContain("aria-label");
  });
});
