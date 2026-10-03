"""Survey step 2b: hard references for the ENU adjustment, picked automatically from a first solve.

  raw/survey/.venv/bin/python tools/survey/refs_auto.py --area minami [--model raw/survey/minami/enu] [--out data/survey/minami/refs.json]

  - lines: SfM points on a building face whose GSI / OSM footprint edge is listed in FACES below (data/anime/layout.json
    lots): points within --band m of the edge (horizontally), inside its extent (0.5 m in from each end), 0.6-7 m above
    the ground, and seen from the face's outer side. In the adjustment each such point is held on the edge line
    (sigma = the GSI base map's ~0.7 m for a straight facade, Huber), which fixes the horizontal offset, yaw and scale.
  - ground: SfM points on open paving (the plaza and the street, polygons in GROUND below) within 0.6 m of the DEM's
    surface; each is held at T.P. = the DEM's median over its patch (sigma 0.12 m), which fixes height and tilt.
Writes refs.json ({ ground: [{name, y, sigma, tracks}], lines: [{name, a, b, sigma, tracks}] }) and prints per-reference
residuals of the current model (so a second run after the adjustment reports the post-fit residuals).
"""
import argparse
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import slib  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument('--area', default='minami')
ap.add_argument('--model', default=None)
ap.add_argument('--out', default=None)
ap.add_argument('--band', type=float, default=1.2)
ap.add_argument('--report', type=int, default=0, help='only report the residuals of an existing refs.json')
a = ap.parse_args()
MOD = a.model or os.path.join(slib.ROOT, 'raw/survey', a.area, 'enu')
OUT = a.out or os.path.join(slib.ROOT, 'data/survey', a.area, 'refs.json')

# building faces seen in the photos: (name, lot id suffix, vertex index i -> i+1, sigma m, note)
FACES = [
    ('mukaeru.SE', '16/58540/25068/381', (7, 8), 0.7, '迎 SE face (glazed ANCHOR corner, broad stair), IMG_0808, 0820, 0824'),
    ('mukaeru.SW_anchor', '16/58540/25068/381', (4, 5), 0.7, '迎 street face at the ANCHOR café, IMG_0825-0827, 0911, 0912'),
    ('mukaeru.SW_nw', '16/58540/25068/381', (0, 1), 0.9, '迎 street face NW of the grey box, IMG_0828'),
    ('mukaeru.NE', '16/58540/25068/381', (8, 9), 0.9, '迎 bay face (the 2F glass café), IMG_0808, 0818'),
    ('pier7.NW_box', '16/58540/25068/404', (1, 2), 0.7, 'PIER7 NW glass box, IMG_0799, 0823, 0907'),
    ('pier7.NW_end', '16/58540/25068/404', (11, 0), 0.9, 'PIER7 NW end toward the plaza, IMG_0801, 0806, 0813'),
    ('pier7.street1', '16/58540/25068/404', (6, 7), 0.8, 'PIER7 street face by the stair, IMG_0907, 0908'),
    ('pier7.street2', '16/58540/25068/404', (7, 8), 0.9, 'PIER7 long street face, IMG_0832'),
    ('yuwaeru.S', '16/58540/25068/376', (7, 8), 0.8, '結 slow-street face (BLACK TIDE) behind the colonnade, IMG_0834-0839'),
    ('yuwaeru.road', '16/58540/25068/376', (8, 9), 0.9, '結 road-side end, IMG_0821, 0830'),
    ('hirakeru.NW', '16/58540/25068/380', (5, 0), 0.7, '拓 slow-street face, IMG_0833, 0840, 0841'),
    ('hirakeru.road', '16/58540/25068/380', (4, 5), 0.9, '拓 road-side face, IMG_0831, 0832'),
]
# open paving for the ground plane (ENU polygons)
GROUND = [
    ('plaza', [[10, 40], [40, 64], [24, 72], [8, 64]]),
    ('street', [[-30, 52], [-10, 56], [-6, 70], [-30, 78]]),
    ('slowstreet', [[-36, 80], [-22, 82], [-28, 96], [-42, 92]]),
]


def inpoly(x, z, P):
    P = np.asarray(P)
    n = len(P)
    ins = np.zeros(len(x), bool)
    j = n - 1
    for i in range(n):
        xi, zi, xj, zj = P[i, 0], P[i, 1], P[j, 0], P[j, 1]
        cond = ((zi > z) != (zj > z)) & (x < (xj - xi) * (z - zi) / (zj - zi + 1e-12) + xi)
        ins ^= cond
        j = i
    return ins


def load_points(model):
    T, P, V = [], [], []
    for line in open(os.path.join(model, 'points3D.txt')):
        if line.startswith('#') or not line.strip():
            continue
        s = line.split()
        T.append(int(s[0]))
        P.append([float(s[1]), float(s[2]), float(s[3])])
        V.append([int(v) for v in s[8::2]])
    return np.array(T), np.array(P), V


def load_centres(model):
    from scipy.spatial.transform import Rotation
    C = {}
    lines = [l for l in open(os.path.join(model, 'images.txt')) if not l.startswith('#')]
    for k in range(0, len(lines), 2):
        s = lines[k].split()
        q = [float(v) for v in s[1:5]]
        t = np.array([float(v) for v in s[5:8]])
        Rcw = Rotation.from_quat([q[1], q[2], q[3], q[0]]).as_matrix()
        C[int(s[0])] = -Rcw.T @ t
    return C


lay = json.load(open(os.path.join(slib.ROOT, 'data/anime/layout.json')))
lots = {l['id']: l['poly'] for l in lay['lots']}
T, P, V = load_points(MOD)
Cs = load_centres(MOD)
# only points seen from standing spots > 1.5 m apart are measured (one-spot points sit at an arbitrary depth)
_par = np.array([len(v) >= 2 and max(np.linalg.norm(Cs[x] - Cs[v[0]]) for x in v if x in Cs) > 1.5 for v in V])
T, P, V = T[_par], P[_par], [v for v, k in zip(V, _par) if k]
print(f'{len(T)} points with parallax between spots')
dem = slib.DEM()


def face_refs():
    out = []
    for name, lot, (i, j), sig, note in FACES:
        poly = lots[lot]
        A_, B_ = np.array(poly[i]), np.array(poly[j % len(poly)])
        d = B_ - A_
        L = np.linalg.norm(d)
        u = d / L
        nrm = np.array([-u[1], u[0]])
        # outward normal: away from the polygon centroid
        cen = np.mean(poly, 0)
        if (cen - A_) @ nrm > 0:
            nrm = -nrm
        rel = P[:, [0, 2]] - A_
        along = rel @ u
        off = rel @ nrm
        gy = dem.h(P[:, 0], P[:, 2])
        h = P[:, 1] - gy
        sel = (np.abs(off) < a.band) & (along > 0.5) & (along < L - 0.5) & (h > 0.6) & (h < 7.0)
        # seen from outside the face
        keep = []
        for k in np.nonzero(sel)[0]:
            if any(((Cs[v][[0, 2]] - A_) @ nrm) > 0.5 for v in V[k] if v in Cs):
                keep.append(k)
        keep = np.array(keep, int)
        res = off[keep] if len(keep) else np.array([])
        out.append(dict(name=name, lot=lot, a=A_.tolist(), b=B_.tolist(), length=round(float(L), 2), sigma=sig, note=note,
                        tracks=[int(T[k]) for k in keep],
                        prefit=dict(n=int(len(keep)), median_m=round(float(np.median(res)), 3) if len(res) else None,
                                    mad_m=round(float(np.median(np.abs(res - np.median(res)))), 3) if len(res) else None)))
    return out


def ground_refs():
    out = []
    for name, poly in GROUND:
        gy = dem.h(P[:, 0], P[:, 2])
        ins = inpoly(P[:, 0], P[:, 2], poly)
        sel = ins & (np.abs(P[:, 1] - gy) < 0.6)
        # the patch T.P.: the DEM median over a 1 m grid of the patch
        P_ = np.asarray(poly)
        xs, zs = np.meshgrid(np.arange(P_[:, 0].min(), P_[:, 0].max(), 1.0), np.arange(P_[:, 1].min(), P_[:, 1].max(), 1.0))
        m = inpoly(xs.ravel(), zs.ravel(), poly)
        y = float(np.median(dem.h(xs.ravel()[m], zs.ravel()[m])))
        res = P[sel, 1] - y
        out.append(dict(name=name, y=round(y, 3), sigma=0.12, tracks=[int(t) for t in T[sel]],
                        prefit=dict(n=int(sel.sum()), median_m=round(float(np.median(res)), 3) if sel.any() else None,
                                    p10_p90=[round(float(np.percentile(res, 10)), 3), round(float(np.percentile(res, 90)), 3)] if sel.any() else None)))
    return out


if a.report:
    R = json.load(open(OUT))
    pos = {int(t): p for t, p in zip(T, P)}
    for g in R['ground']:
        r = [pos[t][1] - g['y'] for t in g['tracks'] if t in pos]
        print(f"ground {g['name']}: n {len(r)}, median {np.median(r):+.3f} m, MAD {np.median(np.abs(r - np.median(r))):.3f}")
    for ln in R['lines']:
        A_, B_ = np.array(ln['a']), np.array(ln['b'])
        u = (B_ - A_) / np.linalg.norm(B_ - A_)
        nrm = np.array([-u[1], u[0]])
        r = [(np.array(pos[t])[[0, 2]] - A_) @ nrm for t in ln['tracks'] if t in pos]
        print(f"line {ln['name']}: n {len(r)}, median {np.median(r) if r else float('nan'):+.3f} m, MAD {np.median(np.abs(np.array(r) - np.median(r))) if r else float('nan'):.3f}")
    raise SystemExit
refs = dict(n_points=int(len(T)), note='hard references for tools/survey/sfm_enu.py (refs_auto.py)', model=os.path.relpath(MOD, slib.ROOT), lines=face_refs(), ground=ground_refs())
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(refs, open(OUT, 'w'), indent=1)
for r in refs['lines']:
    print(f"line {r['name']}: {r['prefit']}")
for r in refs['ground']:
    print(f"ground {r['name']} (T.P. {r['y']}): {r['prefit']}")
