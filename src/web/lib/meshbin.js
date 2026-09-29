// Parser for data/buildings/*.mesh.bin (BUILD-SPEC §3, magic 'KLC1').
// Layout: uint32 magic, uint32 vertCount, uint32 indexCount, float32 pos[v*3], float32 nrm[v*3], float32 uv[v*2],
// uint8 code[v], uint32 idx[i]. The index block may be unaligned (after the uint8 block), so copy it out.
export const KLC1 = 0x4b4c4331;

export function parseMeshBin(buffer) {
  const buf = buffer instanceof ArrayBuffer ? buffer : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const dv = new DataView(buf);
  const magic = dv.getUint32(0, true);
  if (magic !== KLC1) throw new Error(`mesh.bin: bad magic 0x${magic.toString(16)}`);
  const vc = dv.getUint32(4, true), ic = dv.getUint32(8, true);
  const need = 12 + vc * 32 + vc + ic * 4;
  if (buf.byteLength < need) throw new Error(`mesh.bin: truncated (${buf.byteLength} < ${need})`);
  let o = 12;
  const pos = new Float32Array(buf, o, vc * 3); o += vc * 12;
  const nrm = new Float32Array(buf, o, vc * 3); o += vc * 12;
  const uv = new Float32Array(buf, o, vc * 2); o += vc * 8;
  const code = new Uint8Array(buf, o, vc); o += vc;
  const idx = o % 4 === 0 ? new Uint32Array(buf, o, ic) : new Uint32Array(buf.slice(o, o + ic * 4));
  return { vertCount: vc, indexCount: ic, pos, nrm, uv, code, idx };
}

/** Drop triangles whose centroid lies inside an ENU box [x0, z0, x1, z1] (city file under the detailed core file). */
export function cullTrianglesInBox(mesh, box) {
  const { pos, idx } = mesh, out = new Uint32Array(idx.length); let n = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const x = (pos[a] + pos[b] + pos[c]) / 3, z = (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3;
    if (x > box[0] && x < box[2] && z > box[1] && z < box[3]) continue;
    out[n++] = idx[t]; out[n++] = idx[t + 1]; out[n++] = idx[t + 2];
  }
  return { ...mesh, idx: out.slice(0, n), indexCount: n };
}
