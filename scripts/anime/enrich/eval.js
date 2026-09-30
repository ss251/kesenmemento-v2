// [v4:data] Accuracy of the aerial roof analysis against independent labels.
//   env -u NODE_OPTIONS bun run scripts/anime/enrich/eval.js [--sheet out.png]
// Labels: OSM roof:shape (mapped by people from imagery or survey; ~110 buildings in the city) and the hand labels in
// scripts/anime/enrich/roof-labels.json (read off the GSI z18 photo at full zoom, 2026-09-30).
// Prints the confusion matrix and the shape accuracy; `--sheet` writes a contact sheet of the labelled roofs.
import { join } from "node:path";
import { existsSync } from "node:fs";
import { ROOT } from "../../terrain/tiles.js";
import { ENRICH_FILE } from "./build-enrich.js";

export async function evaluate() {
  const E = await Bun.file(ENRICH_FILE).json();
  const F = E.lots.fields, ix = (k) => F.indexOf(k);
  const rows = E.lots.rows;
  const labels = [];
  for (const r of rows) if (r[ix("roofShape")]) labels.push({ id: r[0], truth: r[ix("roofShape")], src: "osm", pred: r[ix("aShape")], conf: r[ix("aConf")], ridge: r[ix("ridge")] });
  const handFile = join(ROOT, "scripts/anime/enrich/roof-labels.json");
  if (existsSync(handFile)) {
    const H = await Bun.file(handFile).json();
    const byId = new Map(rows.map((r) => [r[0], r]));
    for (const [id, truth] of Object.entries(H.labels)) { const r = byId.get(id); if (r) labels.push({ id, truth, src: "hand", pred: r[ix("aShape")], conf: r[ix("aConf")] }); }
  }
  const M = {}, per = {};
  let called = 0, right = 0;
  for (const l of labels) {
    const p = l.pred ?? "none";
    M[l.truth] ??= {}; M[l.truth][p] = (M[l.truth][p] || 0) + 1;
    per[l.src] ??= { n: 0, called: 0, right: 0 };
    per[l.src].n++;
    if (l.pred) { called++; per[l.src].called++; const ok = l.pred === l.truth || (l.truth === "flat" && l.pred === "shed") || (l.truth === "shed" && l.pred === "flat"); if (ok) { right++; per[l.src].right++; } }
  }
  return { n: labels.length, called, right, precision: called ? right / called : 0, recall: labels.length ? right / labels.length : 0, confusion: M, per, labels };
}

/** Contact sheet: one 48 m crop per labelled roof (outline shifted by the registration offset, truth / prediction). */
export async function sheet(labels, out, { cols = 10, cell = 160, span = 48 } = {}) {
  const { default: sharp } = await import("sharp");
  const { TileRaster } = await import("./aerial.js");
  const bld = await Bun.file(join(ROOT, "data/buildings/city.json")).json();
  const E = await Bun.file(ENRICH_FILE).json();
  const F = E.lots.fields, byId = new Map(E.lots.rows.map((r) => [r[0], r]));
  const poly = new Map(bld.features.map((b) => [b.id, b.poly]));
  const R18 = new TileRaster(18), R17 = new TileRaster(17);
  const rowsN = Math.ceil(labels.length / cols), W = cols * cell, H = rowsN * cell;
  const img = Buffer.alloc(W * H * 3);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`;
  for (let k = 0; k < labels.length; k++) {
    const l = labels[k], P = poly.get(l.id); if (!P) continue;
    const r = byId.get(l.id), off = r[F.indexOf("off")] || [0, 0];
    let cx = 0, cz = 0; for (const p of P) { cx += p[0]; cz += p[1]; } cx /= P.length; cz /= P.length;
    await R18.prepare(cx - span, cz - span, cx + span, cz + span);
    const S = R18.rgb(cx, cz) ? R18 : (await R17.prepare(cx - span, cz - span, cx + span, cz + span), R17);
    const ox = (k % cols) * cell, oy = Math.floor(k / cols) * cell, s = cell / span;
    for (let j = 0; j < cell; j++) for (let i = 0; i < cell; i++) {
      const c = S.rgb(cx - span / 2 + i / s, cz - span / 2 + j / s) || [0, 0, 0], q = ((oy + j) * W + ox + i) * 3;
      img[q] = c[0]; img[q + 1] = c[1]; img[q + 2] = c[2];
    }
    const pts = P.map((p) => `${(ox + (p[0] + off[0] - cx + span / 2) * s).toFixed(1)},${(oy + (p[1] + off[1] - cz + span / 2) * s).toFixed(1)}`).join(" ");
    const ok = l.pred === l.truth;
    svg += `<polygon points="${pts}" fill="none" stroke="${ok ? "#30ff60" : "#ff3030"}" stroke-width="1.5"/>`;
    const rd = r[F.indexOf("ridge")];
    if (rd != null && l.pred && l.pred !== "flat" && l.pred !== "shed") { const dx = Math.cos(rd) * 4 * s, dz = Math.sin(rd) * 4 * s, mx = ox + (off[0] + span / 2) * s, mz = oy + (off[1] + span / 2) * s; svg += `<line x1="${mx - dx}" y1="${mz - dz}" x2="${mx + dx}" y2="${mz + dz}" stroke="#ffd000" stroke-width="2"/>`; }
    svg += `<rect x="${ox}" y="${oy}" width="${cell}" height="16" fill="#000" opacity="0.6"/><text x="${ox + 3}" y="${oy + 12}" font-size="11" font-family="sans-serif" fill="#fff">${k} ${l.truth[0]}/${(l.pred || "-")[0]} ${l.conf ?? ""} z${S.z}</text>`;
  }
  svg += "</svg>";
  await sharp(img, { raw: { width: W, height: H, channels: 3 } }).composite([{ input: Buffer.from(svg) }]).png().toFile(out);
}

if (import.meta.main) {
  const r = await evaluate();
  const { labels, ...rest } = r;
  console.log(JSON.stringify(rest, null, 1));
  const i = process.argv.indexOf("--sheet");
  if (i > 0) await sheet(labels, process.argv[i + 1]);
}
