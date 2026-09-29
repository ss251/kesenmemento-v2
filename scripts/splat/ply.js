// Minimal 3DGS PLY + COLMAP binary readers for the P3 splat pipeline (no dependencies).
//   readPly(bytes)            -> { props, count, stride, data: Float32Array, comments }
//   writePly(ply, keep?)      -> Uint8Array (binary_little_endian, same props, only kept rows)
//   readColmapImages(bytes)   -> [{ id, name, q:[w,x,y,z], t:[x,y,z], center:[x,y,z], cameraId }]
//   readColmapPoints(bytes)   -> { xyz: Float64Array, rgb: Uint8Array, err: Float64Array, track: Uint32Array }

const enc = new TextEncoder();

export function readPly(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const probe = new TextDecoder().decode(u8.subarray(0, Math.min(u8.length, 64 * 1024)));
  const end = probe.indexOf("end_header\n");
  if (!probe.startsWith("ply\n") || end < 0) throw new Error("not a PLY file");
  const headerLen = end + "end_header\n".length;
  const lines = probe.slice(0, end).split("\n");
  let count = 0, inVertex = false, format = "";
  const props = [], comments = [];
  for (const l of lines) {
    const p = l.trim().split(/\s+/);
    if (p[0] === "format") format = p[1];
    else if (p[0] === "comment") comments.push(l.slice(8));
    else if (p[0] === "element") { inVertex = p[1] === "vertex"; if (inVertex) count = Number(p[2]); else if (Number(p[2]) > 0) throw new Error("unsupported element " + p[1]); }
    else if (p[0] === "property" && inVertex) {
      if (p[1] !== "float" && p[1] !== "float32") throw new Error("only float vertex properties supported, got " + p[1]);
      props.push(p[2]);
    }
  }
  if (format !== "binary_little_endian") throw new Error("only binary_little_endian PLY supported");
  const stride = props.length;
  const need = headerLen + count * stride * 4;
  if (u8.length < need) throw new Error(`truncated PLY: ${u8.length} < ${need}`);
  // copy into an aligned buffer
  const data = new Float32Array(count * stride);
  new Uint8Array(data.buffer).set(u8.subarray(headerLen, need));
  const index = Object.fromEntries(props.map((p, i) => [p, i]));
  return { props, index, count, stride, data, comments };
}

export function writePly(ply, keep = null) {
  const n = keep ? keep.reduce((a, k) => a + (k ? 1 : 0), 0) : ply.count;
  const header = ["ply", "format binary_little_endian 1.0", ...ply.comments.map((c) => "comment " + c),
    `element vertex ${n}`, ...ply.props.map((p) => `property float ${p}`), "end_header", ""].join("\n");
  const h = enc.encode(header);
  const out = new Uint8Array(h.length + n * ply.stride * 4);
  out.set(h);
  const dst = new Float32Array(n * ply.stride);
  if (!keep) dst.set(ply.data);
  else {
    let j = 0;
    for (let i = 0; i < ply.count; i++) if (keep[i]) { dst.set(ply.data.subarray(i * ply.stride, (i + 1) * ply.stride), j * ply.stride); j++; }
  }
  out.set(new Uint8Array(dst.buffer), h.length);
  return out;
}

// quaternion (w,x,y,z) -> row-major 3x3
export function quatToMat([w, x, y, z]) {
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
    2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
    2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y),
  ];
}

export function readColmapImages(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let o = 0;
  const n = Number(dv.getBigUint64(o, true)); o += 8;
  const out = [];
  for (let k = 0; k < n; k++) {
    const id = dv.getUint32(o, true); o += 4;
    const q = [0, 1, 2, 3].map((i) => dv.getFloat64(o + 8 * i, true)); o += 32;
    const t = [0, 1, 2].map((i) => dv.getFloat64(o + 8 * i, true)); o += 24;
    const cameraId = dv.getUint32(o, true); o += 4;
    let e = o; while (u8[e] !== 0) e++;
    const name = new TextDecoder().decode(u8.subarray(o, e)); o = e + 1;
    const np = Number(dv.getBigUint64(o, true)); o += 8 + np * 24;
    const R = quatToMat(q); // world->cam; center = -R^T t
    const center = [0, 1, 2].map((c) => -(R[c] * t[0] + R[3 + c] * t[1] + R[6 + c] * t[2]));
    // camera viewing direction (+z in cam) in world = R^T [0,0,1] = third row of R
    const forward = [R[6], R[7], R[8]];
    const down = [R[3], R[4], R[5]]; // +y in cam (image down) in world
    out.push({ id, name, q, t, cameraId, center, forward, down });
  }
  return out;
}

export function readColmapPoints(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let o = 0;
  const n = Number(dv.getBigUint64(o, true)); o += 8;
  const xyz = new Float64Array(n * 3), rgb = new Uint8Array(n * 3), err = new Float64Array(n), track = new Uint32Array(n);
  for (let k = 0; k < n; k++) {
    o += 8; // id
    xyz[3 * k] = dv.getFloat64(o, true); xyz[3 * k + 1] = dv.getFloat64(o + 8, true); xyz[3 * k + 2] = dv.getFloat64(o + 16, true); o += 24;
    rgb[3 * k] = u8[o]; rgb[3 * k + 1] = u8[o + 1]; rgb[3 * k + 2] = u8[o + 2]; o += 3;
    err[k] = dv.getFloat64(o, true); o += 8;
    const tl = Number(dv.getBigUint64(o, true)); o += 8 + tl * 8;
    track[k] = tl;
  }
  return { count: n, xyz, rgb, err, track };
}
