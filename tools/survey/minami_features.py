"""Survey step 3 (south shore): named 3D features in ENU metres from pixel picks on the solved photos.

  raw/survey/.venv/bin/python tools/survey/minami_features.py [--area minami]

Input: data/survey/minami/picks.json  { picks: { name: { IMG_xxxx: [u, v], ... } }, sigma_px: 2.5 }  (full-resolution
pixels of the JPEGs in raw/survey/minami/images, distorted; read off tools/survey/pick.py sheets).
Constructions (each feature records which one, its views and its 1-sigma):
  tri       multi-view triangulation of one pick seen in >= 2 photos (>= 1 standing spot apart for depth);
  hdir      the horizontal direction of a straight horizontal edge from >= 2 picks along it in one photo (the rays of a
            horizontal line span a plane through the camera; its normal x up is the line's direction);
  vplane    a vertical plane through a point with a horizontal direction (a facade, the face of the stair cage);
  cut       the ray of a pick intersected with a vertical plane (single view; sigma from the ray angle and the
            plane's own sigma);
  drop      the foot of a vertical edge: the ray of the foot pick against the vertical line through a measured top
            corner (gives the ground T.P. under it);
  ground    a pick on the ground cut with the measured local ground level (for features flat on the paving).
The 1-sigma combines the pick noise (sigma_px), the camera pose (each photo's reprojection error and the georegistration's
sigma from data/survey/minami/georef.json: translation 0.17 m, yaw 0.43 deg) and, for cuts, the plane's sigma.
Output: data/survey/minami/features.json  { features: [{ name, enu, sigma, method, views, res_px, note }], dims: [...] }
"""
import argparse
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import slib  # noqa: E402
from pick import load_cams, project, ray  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument('--area', default='minami')
a = ap.parse_args()
D = os.path.join(slib.ROOT, 'data/survey', a.area)
PK = json.load(open(os.path.join(D, 'picks.json')))
cams = load_cams(a.area)
GEO = json.load(open(os.path.join(D, 'georef.json')))
SIG_T = float(np.hypot(*GEO['t_sigma'][::2]))
SIG_YAW = np.radians(GEO['yaw_sigma_deg'])
SPX = PK.get('sigma_px', 2.5)
UP = np.array([0, 1.0, 0])
F = {}       # name -> dict(enu, sigma, method, views, res_px, note)
DIMS = []


def cam_of(k):
    return cams[k if k.startswith('IMG_') else 'IMG_' + k]


def picks(name):
    p = PK['picks'][name]
    return {('IMG_' + k.replace('IMG_', '')): v for k, v in p.items() if not k.startswith('_')}


def geo_sigma(X):
    """georegistration sigma at X: translation + yaw x distance from the pivot (0, 0, 60)."""
    r = np.hypot(X[0] - GEO['pivot'][0], X[2] - GEO['pivot'][2])
    return float(np.hypot(SIG_T, SIG_YAW * r))


def add(name, X, sig, method, views, res=None, note=''):
    X = np.asarray(X, float)
    s = np.asarray(sig, float) if np.ndim(sig) else np.array([sig, sig, sig], float)
    g = geo_sigma(X)
    s = np.sqrt(s ** 2 + np.array([g, 0.05, g]) ** 2)
    F[name] = dict(name=name, enu=[round(float(v), 3) for v in X], sigma=[round(float(v), 3) for v in s], method=method,
                   views=sorted(views), res_px=res or {}, note=note or PK.get('notes', {}).get(name, ''))
    return X


def tri(name, note=''):
    obs = picks(name)
    ids = [k for k in obs if k in cams]
    A = np.zeros((3, 3))
    b = np.zeros(3)
    for k in ids:
        d = ray(cams[k], obs[k])
        P = np.eye(3) - np.outer(d, d)
        A += P
        b += P @ cams[k]['C']
    X0 = np.linalg.solve(A, b)
    from scipy.optimize import least_squares

    def res(X):
        return np.concatenate([project(cams[k], X[None])[0][0] - np.array(obs[k]) for k in ids])
    sol = least_squares(res, X0)
    X = sol.x
    J = sol.jac
    r = res(X).reshape(-1, 2)
    # a-posteriori variance factor: residuals larger than the pick noise inflate the sigma (2 views: 1 dof)
    dof = max(1, 2 * len(ids) - 3)
    vf = max(1.0, float(np.sum(r ** 2)) / dof / SPX ** 2)
    cov = np.linalg.pinv(J.T @ J) * SPX ** 2 * vf
    sig = np.sqrt(np.clip(np.diag(cov), 0, None))
    return add(name, X, sig, 'tri', ids, {k[4:]: round(float(np.hypot(*rr)), 1) for k, rr in zip(ids, r)}, note)


def hdir(img, uvs):
    """direction of a horizontal straight edge from >= 2 picks along it in one photo."""
    c = cam_of(img)
    R_ = np.array([ray(c, uv) for uv in uvs])
    if len(R_) == 2:
        n = np.cross(R_[0], R_[1])
    else:
        U, S, Vt = np.linalg.svd(R_)
        n = Vt[2]
    d = np.cross(n, UP)
    d /= np.linalg.norm(d)
    return d


def cut(name, img, uv, P0, d, plane_sig=0.05, note='', method='cut'):
    """ray of a pick in img against the vertical plane through P0 with horizontal direction d."""
    c = cam_of(img)
    n = np.cross(d, UP)
    n /= np.linalg.norm(n)
    r = ray(c, uv)
    lam = (n @ (P0 - c['C'])) / (n @ r)
    X = c['C'] + lam * r
    inc = abs(n @ r)  # grazing rays lengthen the error along the ray
    s_ray = lam * SPX / c['K'][0, 0]
    s_along = plane_sig / max(inc, 0.05)
    sig = np.hypot(s_ray, s_along)
    return add(name, X, [sig, s_ray, sig], method, [c['c']['id']], note=note)


def drop(name, img, uv, top, note=''):
    """foot of the vertical line through `top` seen at pick uv in img: the point on the line nearest the ray."""
    c = cam_of(img)
    r = ray(c, uv)
    # line: top + t * UP ; ray: C + s * r
    ur = UP @ r
    A = np.array([[1.0, -ur], [-ur, 1.0]])
    bb = np.array([UP @ (c['C'] - top), r @ (top - c['C'])])
    t, s = np.linalg.solve(A, bb)
    X = top + t * UP
    s_ray = s * SPX / c['K'][0, 0]
    sig = F[top_name(top)]['sigma'] if top_name(top) else [0.1, 0.1, 0.1]
    return add(name, X, [sig[0], np.hypot(s_ray, 0.05), sig[2]], 'drop', [c['c']['id']], note=note)


def top_name(X):
    for k, v in F.items():
        if np.allclose(v['enu'], np.round(X, 3), atol=1e-3):
            return k
    return None


def ground(name, img, uv, y, note=''):
    c = cam_of(img)
    r = ray(c, uv)
    lam = (y - c['C'][1]) / r[1]
    X = c['C'] + lam * r
    s_ray = lam * SPX / c['K'][0, 0]
    s_h = 0.05 / max(abs(r[1]), 0.02)  # 5 cm of ground-level uncertainty, along the ray
    return add(name, X, [np.hypot(s_ray, s_h), 0.05, np.hypot(s_ray, s_h)], 'ground', [c['c']['id']], note=note)


def dim(name, value, sigma, how):
    DIMS.append(dict(name=name, value=round(float(value), 3), sigma=round(float(sigma), 3), how=how))


def P(name):
    return np.array(F[name]['enu'])


# =========================================================================== the white mesh stair cage (IMG_0807, 0808, 0818)
exec(open(os.path.join(os.path.dirname(__file__), 'minami_features_spec.py')).read())

# group names for the diff (survey-diff matches name#k groups by the cheapest assignment, so a 3-corner cage can be
# compared with the app's 4-corner box without guessing which corner is which)
RENAME = {'ringB.tree': 'ring.tree#1', 'mukaeru.box.S_top': 'mukaeru.box.top#1', 'mukaeru.box.E_top': 'mukaeru.box.top#2', 'ringA': 'ring#1', 'ringB': 'ring#2', 'ringC': 'ring#3', 'winch.tip_l': 'winch.tip#1', 'winch.tip_r': 'winch.tip#2',
          'winch.foot_l': 'winch.foot#1', 'winch.foot_r': 'winch.foot#2', 'cage.box.tl': 'cage.top#1', 'cage.corner.top': 'cage.top#2', 'cage.side.end_top': 'cage.top#3',
          'cage.box.foot': 'cage.foot#1', 'cage.corner.foot': 'cage.foot#2', 'cage.side.end_foot': 'cage.foot#3',
          'cage.box.bl': 'cage.box_bottom',
          'bleach.stair.bot_l': 'bleach.stair.bot#1', 'bleach.stair.bot_r': 'bleach.stair.bot#2'}
for t_ in (1, 2, 3, 4, 5):
    RENAME[f'bleach.t{t_}.left_top'] = f'bleach.t{t_}.top#1'
    RENAME[f'bleach.t{t_}.left_bot'] = f'bleach.t{t_}.bot#1'
    RENAME[f'bleach.t{t_}.right_top'] = f'bleach.t{t_}.top#2'
    RENAME[f'bleach.t{t_}.right_bot'] = f'bleach.t{t_}.bot#2'
for old, new in RENAME.items():
    if old in F:
        F[old]['note'] = (F[old]['note'] + f' [{old}]').strip()
        F[old]['name'] = new
F = {v['name']: v for v in F.values()}
json.dump(dict(area=a.area, note='South-shore survey features (tools/survey/minami_features.py): ENU metres (x east, y T.P. up, '
               'z south), 1-sigma per axis. Names: docs/anime/survey/minami.md. Groups name#k are matched without order by '
               'tools/anime/survey-diff.mjs.', sigma_px=SPX, georef=dict(t_sigma_m=SIG_T, yaw_sigma_deg=float(np.degrees(SIG_YAW))),
               features=list(F.values()), dims=DIMS), open(os.path.join(D, 'features.json'), 'w'), indent=1)
for v in F.values():
    print(f"{v['name']:28s} {v['enu']}  +- {v['sigma']}  {v['method']} {','.join(x[4:] for x in v['views'])} {v['res_px'] or ''}")
for d_ in DIMS:
    print(f"  dim {d_['name']:24s} {d_['value']} +- {d_['sigma']}  ({d_['how']})")
