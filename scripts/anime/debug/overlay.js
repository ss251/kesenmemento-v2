// [v3:foundation] Debug overlay: ortho crop + water edge + vector lines. bun run scripts/anime/debug/overlay.js cx cz half out.png
import sharp from "sharp";
import { join } from "node:path";
import { ROOT } from "../../terrain/tiles.js";
const [cx, cz, half] = process.argv.slice(2, 5).map(Number); const out = process.argv[5];
const O = { x0: -1734.88, z0: -2109.266, dx: 0.5294433593748195, dz: 0.5420605468749884 };
const S = 1400, sc = S / (2 * half);
const l = Math.round((cx - half - O.x0) / O.dx), t = Math.round((cz - half - O.z0) / O.dz);
const base = await sharp(join(ROOT, "data/ortho/core.jpg"), { limitInputPixels: false }).extract({ left: l, top: t, width: Math.round(2 * half / O.dx), height: Math.round(2 * half / O.dz) }).resize(S, S).modulate({ brightness: 0.8, saturation: 0.6 }).toBuffer();
const vt = await Bun.file(join(ROOT, "data/cache/anime/vt.json")).json();
const P = (p) => `${((p[0] - cx + half) * sc).toFixed(1)},${((p[1] - cz + half) * sc).toFixed(1)}`;
const inb = (p) => Math.abs(p[0] - cx) < half * 1.2 && Math.abs(p[1] - cz) < half * 1.2;
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">`;
for (const f of vt.WA) if (f.outer.some(inb)) svg += `<polygon points="${f.outer.map(P).join(" ")}" fill="${f.code === 5100 ? "rgba(0,80,255,0.25)" : "rgba(0,255,255,0.3)"}" stroke="red" stroke-width="1.5"/>`;
for (const f of vt.Cstline) if (f.pts.some(inb)) svg += `<polyline points="${f.pts.map(P).join(" ")}" fill="none" stroke="cyan" stroke-width="2"/>`;
for (const f of vt.WStrL) if (f.pts.some(inb)) svg += `<polyline points="${f.pts.map(P).join(" ")}" fill="none" stroke="magenta" stroke-width="3"/>`;
for (const f of vt.RdCL) if (f.pts.some(inb)) svg += `<polyline points="${f.pts.map(P).join(" ")}" fill="none" stroke="${f.rdctg === "国道" ? "orange" : f.rdctg === "都道府県道" ? "yellow" : "white"}" stroke-width="1.2"/>`;
for (const f of vt.RdEdg) if (f.pts.some(inb)) svg += `<polyline points="${f.pts.map(P).join(" ")}" fill="none" stroke="lime" stroke-width="0.8"/>`;
for (let g = -2000; g <= 3000; g += 100) { svg += `<text x="${((g - cx + half) * sc)}" y="14" fill="white" font-size="12">${g}</text><text x="2" y="${((g - cz + half) * sc)}" fill="white" font-size="12">${g}</text>`; }
svg += "</svg>";
await sharp(base).composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 85 }).toFile(out);
console.log("ok", out);
