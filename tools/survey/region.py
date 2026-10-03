"""Survey step 3 helper: the triangulated SfM points (seen from > 1 standing spot) that project into a pixel polygon of one
solved photo, with plane / line fits; and single-view picks cut against a plane.

  raw/survey/.venv/bin/python tools/survey/region.py pts   --area minami --img 0808 --poly u,v u,v u,v ... [--maxdepth 60]
  raw/survey/.venv/bin/python tools/survey/region.py plane --area minami --img 0808 --poly ... [--vertical 1]
  raw/survey/.venv/bin/python tools/survey/region.py cut   --area minami --img 0808 --plane nx,ny,nz,d  u,v [u,v ...]
  raw/survey/.venv/bin/python tools/survey/region.py ycut  --area minami --img 0808 --y 1.92  u,v [u,v ...]
  raw/survey/.venv/bin/python tools/survey/region.py show  --area minami --img 0808 --out f.jpg --crop x0,y0,x1,y1 [--poly ...]

`plane` fits n . X = d (RANSAC 3 cm, then least squares; --vertical forces a vertical plane, a facade); `cut` intersects the
pixel rays of picks with a plane (prints ENU); `ycut` with the horizontal plane y = const (ground features).
"""
import argparse
import os
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import slib  # noqa: E402
from pick import load_cams, project, ray  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument('cmd')
ap.add_argument('rest', nargs='*')
ap.add_argument('--area', default='minami')
ap.add_argument('--model', default=None)
ap.add_argument('--img', required=True)
ap.add_argument('--poly', nargs='*', default=None)
ap.add_argument('--maxdepth', type=float, default=80)
ap.add_argument('--vertical', type=int, default=0)
ap.add_argument('--plane', default=None)
ap.add_argument('--y', type=float, default=None)
ap.add_argument('--out', default=None)
ap.add_argument('--crop', default=None)
ap.add_argument('--minspread', type=float, default=1.5)
a = ap.parse_args()
MOD = a.model or os.path.join(slib.ROOT, 'raw/survey', a.area, 'enu_geo')
cams = load_cams(a.area)
iid = a.img if a.img.startswith('IMG_') else 'IMG_' + a.img
cam = cams[iid]


def load_points():
    from scipy.spatial.transform import Rotation
    Cs = {}
    lines = [l for l in open(os.path.join(MOD, 'images.txt')) if not l.startswith('#')]
    for k in range(0, len(lines), 2):
        s = lines[k].split()
        q = [float(v) for v in s[1:5]]
        t = np.array([float(v) for v in s[5:8]])
        Rcw = Rotation.from_quat([q[1], q[2], q[3], q[0]]).as_matrix()
        Cs[int(s[0])] = -Rcw.T @ t
    P, keep = [], []
    for line in open(os.path.join(MOD, 'points3D.txt')):
        s = line.split()
        v = [int(x) for x in s[8::2]]
        spread = max(np.linalg.norm(Cs[x] - Cs[v[0]]) for x in v if x in Cs)
        P.append([float(s[1]), float(s[2]), float(s[3])])
        keep.append(spread > a.minspread)
    return np.array(P)[np.array(keep)]


def in_poly(uv, poly):
    poly = np.array(poly, np.float32)
    return np.array([cv2.pointPolygonTest(poly, (float(u), float(v)), False) >= 0 for u, v in uv])


def region_points():
    P = load_points()
    uv, z = project(cam, P)
    poly = [[float(x) for x in p.split(',')] for p in a.poly]
    sel = (z > 0) & (z < a.maxdepth) & in_poly(uv, poly)
    return P[sel], uv[sel], z[sel]


def fit_plane(P, vertical=False):
    rng = np.random.default_rng(0)
    best = None
    for _ in range(2000):
        if vertical:
            s = rng.choice(len(P), 2, replace=False)
            d = P[s[1]] - P[s[0]]
            n = np.array([-d[2], 0, d[0]])
        else:
            s = rng.choice(len(P), 3, replace=False)
            n = np.cross(P[s[1]] - P[s[0]], P[s[2]] - P[s[0]])
        if np.linalg.norm(n) < 1e-9:
            continue
        n /= np.linalg.norm(n)
        dd = n @ P[s[0]]
        inl = np.abs(P @ n - dd) < 0.03 + 0.002 * np.linalg.norm(P - cam['C'], axis=1)
        if best is None or inl.sum() > best[0].sum():
            best = (inl, n, dd)
    inl = best[0]
    Q = P[inl]
    c = Q.mean(0)
    if vertical:
        U, S, Vt = np.linalg.svd((Q - c)[:, [0, 2]])
        n = np.array([Vt[1, 0], 0, Vt[1, 1]])
    else:
        U, S, Vt = np.linalg.svd(Q - c)
        n = Vt[2]
    dd = n @ c
    r = Q @ n - dd
    return n, dd, inl, r


if a.cmd == 'pts':
    P, uv, z = region_points()
    for p, q, zz in zip(P, uv, z):
        print(f'{q[0]:7.1f} {q[1]:7.1f}  ->  {p[0]:8.3f} {p[1]:7.3f} {p[2]:8.3f}  (depth {zz:5.1f})')
    print(f'{len(P)} points; mean {P.mean(0).round(3) if len(P) else None}')
elif a.cmd == 'plane':
    P, uv, z = region_points()
    n, dd, inl, r = fit_plane(P, bool(a.vertical))
    print(f'{len(P)} points, {inl.sum()} inliers; plane n = {n.round(5).tolist()}, d = {dd:.4f}; rms {np.sqrt(np.mean(r ** 2)):.3f} m')
    if a.vertical:
        print(f'  facade azimuth (normal) {np.degrees(np.arctan2(n[0], -n[2])) % 360:.2f} deg; line through {P[inl].mean(0).round(3).tolist()}')
    print(f'--plane {n[0]:.6f},{n[1]:.6f},{n[2]:.6f},{dd:.5f}')
elif a.cmd in ('cut', 'ycut'):
    if a.cmd == 'ycut':
        n, dd = np.array([0, 1.0, 0]), a.y
    else:
        v = [float(x) for x in a.plane.split(',')]
        n, dd = np.array(v[:3]), v[3]
    for s in a.rest:
        uv = [float(x) for x in s.split(',')]
        d = ray(cam, uv)
        lam = (dd - n @ cam['C']) / (n @ d)
        X = cam['C'] + lam * d
        print(f'{s} -> {X[0]:.3f} {X[1]:.3f} {X[2]:.3f}  (range {lam:.2f} m)')
elif a.cmd == 'show':
    from pick import image
    img = image(cam).copy()
    P = load_points()
    uv, z = project(cam, P)
    for (u, v), zz in zip(uv, z):
        if zz > 0 and zz < a.maxdepth and np.isfinite(u) and np.isfinite(v) and -10 < u < img.shape[1] + 10 and -10 < v < img.shape[0] + 10:
            cv2.circle(img, (int(u), int(v)), 5, (0, 0, 255), -1)
    if a.poly:
        poly = np.array([[float(x) for x in p.split(',')] for p in a.poly], np.int32)
        cv2.polylines(img, [poly], True, (0, 255, 0), 3)
    x0, y0, x1, y1 = [int(v) for v in a.crop.split(',')] if a.crop else (0, 0, img.shape[1], img.shape[0])
    img = img[y0:y1, x0:x1]
    k = 1400 / max(img.shape[:2])
    img = cv2.resize(img, None, fx=k, fy=k, interpolation=cv2.INTER_AREA)
    for gx in range((x0 // 100 + 1) * 100, x1, 100):
        X = int((gx - x0) * k)
        cv2.line(img, (X, 0), (X, 8), (0, 255, 255), 2)
        cv2.putText(img, str(gx), (X + 2, 20), 0, 0.45, (0, 255, 255), 1)
    for gy in range((y0 // 100 + 1) * 100, y1, 100):
        Y = int((gy - y0) * k)
        cv2.line(img, (0, Y), (8, Y), (0, 255, 255), 2)
        cv2.putText(img, str(gy), (10, Y + 5), 0, 0.45, (0, 255, 255), 1)
    cv2.imwrite(a.out, img, [cv2.IMWRITE_JPEG_QUALITY, 88])
