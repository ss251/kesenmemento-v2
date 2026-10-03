"""Survey step 2d: refine the georegistration of a solved ENU model against hard references, and apply it.

  raw/survey/.venv/bin/python tools/survey/georef_refine.py --area minami [--model raw/survey/minami/enu] [--out raw/survey/minami/enu_geo]

The model from tools/survey/sfm_enu.py is already in ENU (GPS / eye-height priors). Here a similarity correction
(scale s, yaw about the vertical, translation tx ty tz, about a pivot) is fitted to:
  - facade lines (data/survey/<area>/refs.json `lines`, tools/survey/refs_auto.py): SfM points with parallax on a building
    face must lie on its GSI / OSM footprint edge; each face weighs like sqrt(n) points (one big face cannot dominate),
    Huber at the face's sigma;
  - ground patches (`ground`): SfM points on open paving at the DEM's T.P. for the patch (sigma 0.15 m);
  - extra control (`control`, optional): named points with known ENU (e.g. the seawall crest T.P. 6.2);
  - the camera centres' GPS fixes (each with its EXIF sigma), weakly (it keeps a 1-2-face fit from wandering).
Tilt is not fitted: the vertical comes from 50 hand-held eye-height priors over 160 m and the ground residuals check it.
Writes <out>/ (the transformed COLMAP text model + solve.json copy), data/survey/<area>/georef.json (the transform, its
1-sigma from the fit, and per-reference residuals before / after).
"""
import argparse
import json
import os
import shutil
import sys

import numpy as np
from scipy.optimize import least_squares
from scipy.spatial.transform import Rotation

sys.path.insert(0, os.path.dirname(__file__))
import slib  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument('--area', default='minami')
ap.add_argument('--model', default=None)
ap.add_argument('--out', default=None)
ap.add_argument('--refs', default=None)
ap.add_argument('--pivot', default='0,0,60')
ap.add_argument('--fit-scale', type=int, default=1)
a = ap.parse_args()
RAW = os.path.join(slib.ROOT, 'raw/survey', a.area)
MOD = a.model or os.path.join(RAW, 'enu')
OUT = a.out or os.path.join(RAW, 'enu_geo')
REFS = json.load(open(a.refs or os.path.join(slib.ROOT, 'data/survey', a.area, 'refs.json')))
piv = np.array([float(v) for v in a.pivot.split(',')])

pts = {}
for line in open(os.path.join(MOD, 'points3D.txt')):
    if line.startswith('#') or not line.strip():
        continue
    s = line.split()
    pts[int(s[0])] = np.array([float(s[1]), float(s[2]), float(s[3])])
lines = [l for l in open(os.path.join(MOD, 'images.txt')) if not l.startswith('#')]
cams = []
for k in range(0, len(lines), 2):
    s = lines[k].split()
    q = [float(v) for v in s[1:5]]
    t = np.array([float(v) for v in s[5:8]])
    Rcw = Rotation.from_quat([q[1], q[2], q[3], q[0]]).as_matrix()
    cams.append((slib.img_id(s[9]), -Rcw.T @ t))
idx = slib.photo_index()
exif = {slib.img_id(r['SourceFile']): r.get('GPSHPositioningError') for r in json.load(open(os.path.join(RAW, 'exif.json')))} \
    if os.path.exists(os.path.join(RAW, 'exif.json')) else {}


def T(x, P):
    """similarity: P' = piv + s * Ry(yaw) (P - piv) + t"""
    s_ = np.exp(x[0]) if a.fit_scale else 1.0
    Ry = Rotation.from_euler('y', x[1]).as_matrix()
    return piv + s_ * (P - piv) @ Ry.T + x[2:5]


faces = [(ln, np.array([pts[t] for t in ln['tracks'] if t in pts])) for ln in REFS['lines']]
faces = [(ln, P) for ln, P in faces if len(P)]
grounds = [(g, np.array([pts[t] for t in g['tracks'] if t in pts])) for g in REFS['ground']]
grounds = [(g, P) for g, P in grounds if len(P)]
controls = REFS.get('control', [])
gpsC = np.array([c for _, c in cams])
gpsT = np.array([slib.enu(idx[i]['lat'], idx[i]['lon']) for i, _ in cams])
gpsS = np.array([7.0 if (exif.get(i) is None or abs(exif[i] - 4.748651529) < 1e-4) else max(3.0, exif[i]) for i, _ in cams])


def face_off(ln, P):
    A_, B_ = np.array(ln['a']), np.array(ln['b'])
    u = (B_ - A_) / np.linalg.norm(B_ - A_)
    n = np.array([-u[1], u[0]])
    return (P[:, [0, 2]] - A_) @ n


def resid(x):
    out = []
    for ln, P in faces:
        w = 1.0 / np.sqrt(np.sqrt(len(P)))  # sum of squares ~ sqrt(n)
        out.append(face_off(ln, T(x, P)) / ln['sigma'] * w)
    for g, P in grounds:
        w = 1.0 / np.sqrt(np.sqrt(len(P)))
        out.append((T(x, P)[:, 1] - g['y']) / 0.15 * w)
    for c in controls:
        P = np.array([pts[t] for t in c['tracks'] if t in pts]) if 'tracks' in c else np.array([c['model']])
        if len(P):
            out.append(((T(x, P.mean(0)[None])[0] - np.array(c['enu'])) / c['sigma'])[[i for i in range(3) if c['enu'][i] is not None]])
    Cc = T(x, gpsC)
    w = 1.0 / np.sqrt(len(Cc))
    out.append(((Cc[:, [0, 2]] - gpsT) / gpsS[:, None]).ravel() * w)
    return np.concatenate(out)


def report(x):
    rep = {}
    for ln, P in faces:
        r = face_off(ln, T(x, P))
        rep[ln['name']] = dict(n=int(len(P)), median_m=round(float(np.median(r)), 3), mad_m=round(float(np.median(np.abs(r - np.median(r)))), 3))
    for g, P in grounds:
        r = T(x, P)[:, 1] - g['y']
        rep['ground.' + g['name']] = dict(n=int(len(P)), median_m=round(float(np.median(r)), 3), mad_m=round(float(np.median(np.abs(r - np.median(r)))), 3))
    Cc = T(x, gpsC)
    d = np.linalg.norm(Cc[:, [0, 2]] - gpsT, axis=1)
    rep['gps'] = dict(n=int(len(d)), median_m=round(float(np.median(d)), 2), mean_m=round(float(np.mean(d)), 2))
    return rep


x0 = np.zeros(5)
before = report(x0)
sol = least_squares(resid, x0, loss='huber', f_scale=1.0)
x = sol.x
after = report(x)
J = sol.jac
try:
    cov = np.linalg.inv(J.T @ J) * max(1.0, 2 * sol.cost / max(1, len(sol.fun) - len(x)))
    sig = np.sqrt(np.diag(cov))
except np.linalg.LinAlgError:
    sig = np.full(5, np.nan)
res = dict(pivot=piv.tolist(), scale=float(np.exp(x[0])), scale_sigma=float(np.exp(x[0]) * sig[0]), yaw_deg=float(np.degrees(x[1])),
           yaw_sigma_deg=float(np.degrees(sig[1])), t=[float(v) for v in x[2:5]], t_sigma=[float(v) for v in sig[2:5]],
           before=before, after=after, note='P_enu = pivot + scale * Ry(yaw) (P_model - pivot) + t (tools/survey/georef_refine.py)')
print(json.dumps({k: v for k, v in res.items() if k not in ('before', 'after')}, indent=1))
print('residuals (median m): ' + ', '.join(f"{k}: {before[k]['median_m']} -> {after[k]['median_m']}" for k in after))
json.dump(res, open(os.path.join(slib.ROOT, 'data/survey', a.area, 'georef.json'), 'w'), indent=1)

# apply to the model
os.makedirs(OUT, exist_ok=True)
Ry = Rotation.from_euler('y', x[1]).as_matrix()
s_ = np.exp(x[0]) if a.fit_scale else 1.0
with open(os.path.join(OUT, 'points3D.txt'), 'w') as f:
    for line in open(os.path.join(MOD, 'points3D.txt')):
        if line.startswith('#') or not line.strip():
            continue
        sp = line.split()
        P = T(x, np.array([[float(sp[1]), float(sp[2]), float(sp[3])]]))[0]
        f.write(' '.join([sp[0], f'{P[0]:.6f}', f'{P[1]:.6f}', f'{P[2]:.6f}'] + sp[4:]) + '\n')
with open(os.path.join(OUT, 'images.txt'), 'w') as f:
    for k in range(0, len(lines), 2):
        sp = lines[k].split()
        q = [float(v) for v in sp[1:5]]
        t = np.array([float(v) for v in sp[5:8]])
        Rcw = Rotation.from_quat([q[1], q[2], q[3], q[0]]).as_matrix()
        C = -Rcw.T @ t
        C2 = T(x, C[None])[0]
        R2 = Rcw @ Ry.T
        q2 = Rotation.from_matrix(R2).as_quat()
        t2 = -R2 @ C2
        f.write(' '.join([sp[0], f'{q2[3]:.12g}', f'{q2[0]:.12g}', f'{q2[1]:.12g}', f'{q2[2]:.12g}', f'{t2[0]:.12g}', f'{t2[1]:.12g}', f'{t2[2]:.12g}'] + sp[8:]) + '\n')
        f.write(lines[k + 1])
shutil.copy(os.path.join(MOD, 'cameras.txt'), os.path.join(OUT, 'cameras.txt'))
sv = json.load(open(os.path.join(MOD, 'solve.json')))
sv['georef'] = {k: v for k, v in res.items() if k not in ('before', 'after')}
json.dump(sv, open(os.path.join(OUT, 'solve.json'), 'w'), indent=1)
for fn in ('track_obs.json',):
    if os.path.exists(os.path.join(MOD, fn)):
        shutil.copy(os.path.join(MOD, fn), os.path.join(OUT, fn))
print(f'wrote {os.path.relpath(OUT, slib.ROOT)}')
