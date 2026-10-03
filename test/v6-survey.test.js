// [v6:survey] The survey geometry kit (tools/anime/survey/lib.mjs): camera models, similarity alignment, fits, LM,
// triangulation and the ENU helpers that the market survey, photo-align and survey-diff depend on.
import { describe, test, expect } from "bun:test";
import {
  qToR, rToQ, rvecToR, rToRvec, rotAngleDeg, threeYawPitchRoll, cameraOf, distortN, undistortN, project, pixelRay, centre,
  umeyama, applySim, fitPlane, fitLine, ransacPlane, lm, triangulate, eigSym, toENU, fromENU, bearing, mv, tr, norm, sub,
} from "../tools/anime/survey/lib.mjs";

const close = (a, b, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe("rotations", () => {
  test("quaternion <-> matrix round trip", () => {
    const q = [0.8, 0.2, -0.3, 0.469];
    const n = Math.hypot(...q), qn = q.map((v) => v / n);
    const q2 = rToQ(qToR(qn));
    qn.forEach((v, i) => close(v, q2[i], 1e-9));
  });
  test("rotation vector round trip and angle", () => {
    const r = [0.3, -0.2, 0.9], R = rvecToR(r), r2 = rToRvec(R);
    r.forEach((v, i) => close(v, r2[i], 1e-9));
    close(rotAngleDeg(R, rvecToR([0, 0, 0])), norm(r) * 180 / Math.PI, 1e-6);
  });
  test("three.js YXZ yaw / pitch of a camera looking east, tilted up 10 deg", () => {
    // three camera looks down -z; yaw -90 deg turns -z to +x (east)
    const D = Math.PI / 180, Ry = rvecToR([0, -90 * D, 0]), Rx = rvecToR([10 * D, 0, 0]);
    const R = Ry.map((row) => [0, 1, 2].map((j) => row.reduce((s, v, k) => s + v * Rx[k][j], 0)));
    const e = threeYawPitchRoll(R);
    close(e.yaw, -90, 1e-6); close(e.pitch, 10, 1e-6); close(e.roll, 0, 1e-6);
  });
  test("Jacobi eigen-decomposition of a symmetric matrix", () => {
    const { values, vectors } = eigSym([[4, 1, 0], [1, 3, 0], [0, 0, 1]]);
    close(values[0] + values[1] + values[2], 8, 1e-9);
    const v = vectors[0], Av = mv([[4, 1, 0], [1, 3, 0], [0, 0, 1]], v);
    Av.forEach((x, i) => close(x, values[0] * v[i], 1e-9));
  });
});

describe("camera models", () => {
  const cam = cameraOf("OPENCV", 3024, 4032, [1650, 1648, 1500, 2030, -0.03, 0.01, 0.0005, -0.0003]);
  test("distortion inverts", () => {
    for (const [x, y] of [[0.4, -0.6], [-0.9, 0.7], [0.01, 0.02]]) {
      const [xd, yd] = distortN(x, y, cam.dist), [xu, yu] = undistortN(xd, yd, cam.dist);
      close(xu, x, 1e-9); close(yu, y, 1e-9);
    }
  });
  test("project and pixelRay agree", () => {
    const pose = { R: rvecToR([0.1, -0.4, 0.05]), t: [1, -2, 3] };
    const X = [2, 1, 9], uv = project(cam, pose, X);
    const ray = pixelRay(cam, ...uv), Xc = sub(mv(pose.R, X), pose.t.map((v) => -v)), d = Xc.map((v) => v / norm(Xc));
    ray.forEach((v, i) => close(v, d[i], 1e-9));
    const C = centre(pose), back = mv(pose.R, C).map((v, i) => v + pose.t[i]);
    back.forEach((v) => close(v, 0, 1e-12));
  });
  test("RADIAL and SIMPLE_RADIAL map to k1 / k2 with fx = fy", () => {
    const r = cameraOf("RADIAL", 3024, 4032, [8969, 1512, 2016, 0.02, -0.1]);
    expect(r.fx).toBe(8969); expect(r.fy).toBe(8969); expect(r.dist.k2).toBe(-0.1);
  });
});

describe("fits", () => {
  test("Umeyama recovers a similarity", () => {
    const T = { s: 2.5, R: rvecToR([0.2, 1.1, -0.3]), t: [700, 12, 1040] };
    const A = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 2, 3], [-2, 0.5, 1]];
    const B = A.map((a) => applySim(T, a));
    const S = umeyama(A, B);
    close(S.s, 2.5, 1e-9); close(rotAngleDeg(S.R, T.R), 0, 1e-4); S.t.forEach((v, i) => close(v, T.t[i], 1e-6));
  });
  test("plane and line fits", () => {
    const P = []; for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) P.push([i, 2.3 + 0.001 * ((i * 7 + j * 3) % 5 - 2), j]);
    const pl = fitPlane(P); close(Math.abs(pl.n[1]), 1, 1e-4); close(pl.c[1], 2.3, 1e-3);
    const L = fitLine([[0, 0, 0], [1, 1, 0], [2, 2, 0], [3, 3, 0]]); close(Math.abs(L.u[0]), Math.SQRT1_2, 1e-9); close(L.rms, 0, 1e-9);
  });
  test("RANSAC plane ignores outliers", () => {
    const P = []; for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) P.push([i, 0, j]);
    for (let i = 0; i < 100; i++) P.push([i % 7, 3 + (i % 5), i % 11]);
    const r = ransacPlane(P, 0.05, 500); expect(r.inliers.length).toBe(400); close(Math.abs(r.plane.n[1]), 1, 1e-9);
  });
  test("LM fits a line with a covariance", () => {
    const xs = [0, 1, 2, 3, 4, 5], ys = xs.map((x) => 2 * x + 1 + (x % 2 ? 0.01 : -0.01));
    const s = lm((p) => xs.map((x, i) => p[0] * x + p[1] - ys[i]), [0, 0]);
    close(s.x[0], 2, 0.01); close(s.x[1], 1, 0.02); expect(s.cov).not.toBeNull();
  });
  test("triangulation from three cameras", () => {
    const cam = cameraOf("PINHOLE", 1000, 1000, [800, 800, 500, 500]);
    const poses = [[0, 0, 0], [3, 0, 0], [0, 2, 1]].map((c, k) => { const R = rvecToR([0, 0.1 * k, 0]); return { R, t: mv(R, c).map((v) => -v) }; });
    const X = [1, 0.5, 20];
    const obs = poses.map((pose) => ({ cam, pose, uv: project(cam, pose, X) }));
    const r = triangulate(obs);
    r.X.forEach((v, i) => close(v, X[i], 1e-5)); r.res.forEach((e) => expect(e).toBeLessThan(1e-4));
  });
});

describe("ENU", () => {
  test("toENU / fromENU round trip and bearings", () => {
    const [x, z] = toENU(38.8966, 141.5832), g = fromENU(x, z);
    close(g.lat, 38.8966, 1e-12); close(g.lon, 141.5832, 1e-12);
    close(bearing(1, 0), 90); close(bearing(0, -1), 0); close(bearing(0, 1), 180); close(bearing(-1, 0), 270);
  });
});

void tr;

describe("photo-align helpers", async () => {
  const PA = await import("../tools/anime/photo-align.mjs");
  test("projection from K maps camera points to the pixels of the pinhole model", () => {
    const K = { fx: 1000, fy: 1000, cx: 500, cy: 380 }, W = 1000, H = 800, m = PA.projectionFromK(K, W, H, 0.1, 1000);
    // three.js camera frame: x right, y up, looking down -z; a point 10 m ahead, 1 m right, 0.5 m up
    const P = [1, 0.5, -10, 1], c = [0, 1, 2, 3].map((r) => [0, 1, 2, 3].reduce((s, k) => s + m[k * 4 + r] * P[k], 0));
    const u = (c[0] / c[3] * 0.5 + 0.5) * W, v = (1 - (c[1] / c[3] * 0.5 + 0.5)) * H;
    close(u, 500 + 1000 * 1 / 10, 1e-6); close(v, 380 - 1000 * 0.5 / 10, 1e-6);
  });
  test("exact distance transform and chamfer", () => {
    const W = 20, H = 10, e = new Uint8Array(W * H); e[5 * W + 4] = 1;
    const d = PA.edt(e, W, H); close(d[5 * W + 7], 3, 1e-6); close(d[1 * W + 1], 5, 1e-6);
    const app = new Uint8Array(W * H); app[5 * W + 7] = 1; const valid = new Uint8Array(W * H).fill(1);
    const c = PA.chamfer(app, e, valid, W, H); expect(c.n).toBe(1); close(c.mean, 3, 1e-6);
  });
  test("undistortion with zero distortion is a resample", () => {
    const w0 = 8, h0 = 8, src = Buffer.alloc(w0 * h0 * 3); for (let i = 0; i < w0 * h0; i++) src[i * 3] = i;
    const cam = { fx: 8, fy: 8, cx: 4, cy: 4, dist: { k1: 0, k2: 0, p1: 0, p2: 0, k3: 0, k4: 0, k5: 0, k6: 0 } };
    const { data, valid } = PA.undistortImage(src, w0, h0, 3, cam, 8, 8);
    expect(valid.every((v) => v === 1)).toBe(true); for (let i = 0; i < 64; i++) expect(data[i * 3]).toBe(i);
  });
  test("normCamera reads the shared camera schema", () => {
    const c = PA.normCamera({ id: "IMG_0001", image: "x.jpg", camera_model: "OPENCV", dist: [0.1, -0.2, 0.001, 0.002], position: [1, 2, 3], quaternion: [0, 0, 0, 1], yaw: 10, pitch: 2, roll: 0 });
    expect(c.file).toBe("x.jpg"); expect(c.dist.k2).toBe(-0.2); expect(c.euler.yaw).toBe(10); expect(c.registered).toBe(true);
  });
});
