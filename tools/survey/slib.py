"""Shared survey helpers (tools/survey/*.py): ENU, photo GPS, COLMAP models, camera conversions, DEM.

ENU (the app's frame): x = (lon - 141.5750) * 86744 (east), z = -(lat - 38.9060) * 111014 (south), y = T.P. metres (up).
A right-handed y-up frame, the same as three.js world space.

Run with the survey venv:  raw/survey/.venv/bin/python tools/survey/<script>.py  (numpy, scipy, opencv, pycolmap; see
docs/anime/survey/README.md).
"""
import json
import os
import struct

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
LON0, LAT0, KX, KZ = 141.5750, 38.9060, 86744.0, 111014.0


def enu(lat, lon):
    return np.array([(lon - LON0) * KX, -(lat - LAT0) * KZ])


def photo_index():
    """IMG_xxxx -> {lat, lon, alt, heading, f35, time, batch} over both photo batches (the first batch wins)."""
    out = {}
    for batch, d in ((1, 'raw/photos-sailesh'), (2, 'raw/photos-sailesh/drive-1003')):
        p = os.path.join(ROOT, d, 'index.json')
        if not os.path.exists(p):
            continue
        for r in json.load(open(p)):
            k = os.path.basename(r['SourceFile']).split('.')[0]
            if k in out:
                continue
            out[k] = dict(lat=r['GPSLatitude'], lon=r['GPSLongitude'], alt=r.get('GPSAltitude'), heading=r.get('GPSImgDirection'),
                          f35=r.get('FocalLengthIn35mmFormat'), time=r.get('DateTimeOriginal'), batch=batch)
    return out


def img_id(name):
    return os.path.basename(name).split('.')[0]


# ---------------------------------------------------------------------------------------------- rotations
def qvec_from_R(R):
    """Quaternion [x, y, z, w] (three.js order) from a rotation matrix."""
    from scipy.spatial.transform import Rotation
    return Rotation.from_matrix(R).as_quat()


def three_euler_yxz(R):
    """three.js Euler order 'YXZ' (yaw about +y, pitch about x, roll about z) of a camera-to-world rotation, degrees."""
    from scipy.spatial.transform import Rotation
    y, x, z = Rotation.from_matrix(R).as_euler('YXZ')
    return np.degrees([y, x, z])


# COLMAP camera axes: x right, y down, z forward. three.js camera: x right, y up, looking down -z.
FLIP = np.diag([1.0, -1.0, -1.0])


# ---------------------------------------------------------------------------------------------- DEM
class DEM:
    def __init__(self, name='core'):
        meta = json.load(open(os.path.join(ROOT, 'data/terrain', name + '.json')))
        self.m = meta
        self.a = np.fromfile(os.path.join(ROOT, 'data/terrain', name + '.f32'), dtype='<f4').reshape(meta['height'], meta['width'])

    def h(self, x, z):
        m = self.m
        c = (np.asarray(x) - m['x0']) / m['dx']
        r = (np.asarray(z) - m['z0']) / m['dz']
        c0 = np.clip(np.floor(c).astype(int), 0, m['width'] - 2)
        r0 = np.clip(np.floor(r).astype(int), 0, m['height'] - 2)
        fc, fr = c - c0, r - r0
        a = self.a
        return (a[r0, c0] * (1 - fc) * (1 - fr) + a[r0, c0 + 1] * fc * (1 - fr) + a[r0 + 1, c0] * (1 - fc) * fr + a[r0 + 1, c0 + 1] * fc * fr)


# ---------------------------------------------------------------------------------------------- PLY
def write_ply(path, xyz, rgb=None, extra=None):
    """Binary little-endian PLY of points (float32 xyz, uint8 rgb, optional float32 extra columns {name: array})."""
    n = len(xyz)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    cols = [('x', 'f4'), ('y', 'f4'), ('z', 'f4')]
    if rgb is not None:
        cols += [('red', 'u1'), ('green', 'u1'), ('blue', 'u1')]
    for k in (extra or {}):
        cols.append((k, 'f4'))
    arr = np.zeros(n, dtype=cols)
    arr['x'], arr['y'], arr['z'] = xyz[:, 0], xyz[:, 1], xyz[:, 2]
    if rgb is not None:
        arr['red'], arr['green'], arr['blue'] = rgb[:, 0], rgb[:, 1], rgb[:, 2]
    for k, v in (extra or {}).items():
        arr[k] = v
    tmap = {'f4': 'float', 'u1': 'uchar'}
    head = 'ply\nformat binary_little_endian 1.0\nelement vertex %d\n' % n + ''.join('property %s %s\n' % (tmap[t], k) for k, t in cols) + 'end_header\n'
    with open(path, 'wb') as f:
        f.write(head.encode())
        f.write(arr.tobytes())


# ---------------------------------------------------------------------------------------------- robust fits
def umeyama2d(src, dst, w=None):
    """dst ~ s R src + t in 2D (no reflection); weighted. Returns s, R (2x2), t."""
    src, dst = np.asarray(src, float), np.asarray(dst, float)
    w = np.ones(len(src)) if w is None else np.asarray(w, float)
    w = w / w.sum()
    ms, md = (w[:, None] * src).sum(0), (w[:, None] * dst).sum(0)
    a, b = src - ms, dst - md
    C = (w[:, None, None] * (b[:, :, None] * a[:, None, :])).sum(0)
    U, S, Vt = np.linalg.svd(C)
    d = np.sign(np.linalg.det(U @ Vt))
    D = np.diag([1, d])
    R = U @ D @ Vt
    var = (w * (a ** 2).sum(1)).sum()
    s = np.trace(np.diag(S) @ D) / var
    return s, R, md - s * R @ ms


def ransac_sim2d(src, dst, thresh=6.0, iters=4000, seed=0):
    rng = np.random.default_rng(seed)
    n = len(src)
    best = None
    for _ in range(iters):
        i, j = rng.choice(n, 2, replace=False)
        if np.linalg.norm(src[i] - src[j]) < 1e-6:
            continue
        s, R, t = umeyama2d(src[[i, j]], dst[[i, j]])
        r = np.linalg.norm((s * (R @ src.T)).T + t - dst, axis=1)
        inl = r < thresh
        score = inl.sum() - 1e-3 * np.minimum(r, thresh).sum()
        if best is None or score > best[0]:
            best = (score, inl)
    inl = best[1]
    # IRLS (Huber) on the inliers
    w = np.ones(inl.sum())
    for _ in range(20):
        s, R, t = umeyama2d(src[inl], dst[inl], w)
        r = np.linalg.norm((s * (R @ src[inl].T)).T + t - dst[inl], axis=1)
        k = 3.0
        w = np.where(r < k, 1.0, k / np.maximum(r, 1e-9))
    r_all = np.linalg.norm((s * (R @ src.T)).T + t - dst, axis=1)
    return s, R, t, inl, r_all


def fit_plane(P, w=None):
    """Least-squares plane through points: (normal n with n_y > 0, offset d) with n.p + d = 0."""
    w = np.ones(len(P)) if w is None else w
    c = (w[:, None] * P).sum(0) / w.sum()
    Q = (P - c) * np.sqrt(w)[:, None]
    _, _, Vt = np.linalg.svd(Q, full_matrices=False)
    n = Vt[-1]
    if n[1] < 0:
        n = -n
    return n, -n @ c


def ransac_plane(P, thresh=0.05, iters=3000, seed=0):
    rng = np.random.default_rng(seed)
    best = None
    for _ in range(iters):
        s = P[rng.choice(len(P), 3, replace=False)]
        n = np.cross(s[1] - s[0], s[2] - s[0])
        nn = np.linalg.norm(n)
        if nn < 1e-9:
            continue
        n /= nn
        d = -n @ s[0]
        inl = np.abs(P @ n + d) < thresh
        if best is None or inl.sum() > best.sum():
            best = inl
    n, d = fit_plane(P[best])
    return n, d, best


def rot_between(a, b):
    """Rotation matrix taking unit vector a onto unit vector b."""
    a, b = a / np.linalg.norm(a), b / np.linalg.norm(b)
    v = np.cross(a, b)
    c = a @ b
    if np.linalg.norm(v) < 1e-12:
        return np.eye(3)
    vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + vx + vx @ vx / (1 + c)


def in_poly(P, poly):
    """Vectorised even-odd point-in-polygon: P (N,2), poly (M,2) -> bool (N,)."""
    P = np.asarray(P, float)
    poly = np.asarray(poly, float)
    x, z = P[:, 0], P[:, 1]
    c = np.zeros(len(P), bool)
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, zi = poly[i]
        xj, zj = poly[j]
        cond = ((zi > z) != (zj > z)) & (x < (xj - xi) * (z - zi) / ((zj - zi) if zj != zi else 1e-12) + xi)
        c ^= cond
        j = i
    return c
