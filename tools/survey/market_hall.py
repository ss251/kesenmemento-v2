"""Fish-market survey, step 3b: the quay hall (IMG_0853-0861) in metres, from data/survey/market/hall-picks.json.

  raw/survey/.venv/bin/python tools/survey/market_hall.py

The five dawn frames are two stands (0853-0855, 0860-0861) 1.6 m apart; their cameras are solved in ENU (cameras.json,
camera 5 m above the hall floor). Floor features are cut on their plane (the hall floor T.P. 2.15, the apron 1.84, a
tub rim 0.74 above the floor); the same corner cut from the other stand agrees to 0.01-0.05 m (checked on tub corners,
conveyor casters and a hopper leg). Lines parallel to the quay normal are fitted from both stands (their baseline is
across such lines): the transverse beam's lower edge. Writes data/survey/market/hall-features.json
({ features, dims } in the shape tools/anime/survey-diff.mjs reads); market_features.py measure appends it to features.json.
"""
import json
import math
import os
import sys

import numpy as np
from scipy.optimize import least_squares

sys.path.insert(0, os.path.dirname(__file__))
import market_features as mf  # noqa: E402

ROOT = mf.ROOT
P = json.load(open(os.path.join(ROOT, 'data/survey/market/hall-picks.json')))
cams = mf.load_cams()
P0, P1 = np.array(P['quay']['p0']), np.array(P['quay']['p1'])
U = (P1 - P0) / np.linalg.norm(P1 - P0)
N = np.array([U[1], -U[0]])


def enu(a, d, y):
    r = P0 + a * U + d * N
    return np.array([r[0], y, r[1]])


def ad(X):
    r = np.array([X[0], X[2]]) - P0
    return float(r @ U), float(r @ N)


def main():
    feats, dims = [], []
    for f in P['floor']:
        y = P['planes'][f['plane']]
        X, rng, s = mf.ray_plane(cams, f['img'], f['uv'], (np.array([0, 1.0, 0]), -y, 0.03))
        sg = round(float(np.hypot(0.15, 0.002 * rng)), 3)
        feats.append(dict(name=f['name'], enu=[round(float(v), 3) for v in X], sigma=[sg, 0.05, sg], method=f"ray x plane {f['plane']} (T.P. {y}), {f['img']}", views=[f['img']], range_m=round(rng, 1), **({'note': f['note']} if f.get('note') else {})))
    adj = json.load(open(os.path.join(ROOT, 'data/survey/market/adjust-canopy.json')))['points']
    for name, pn in P['adjust_points'].items():
        e = adj[pn]['enu']
        feats.append(dict(name=name, enu=[round(float(v), 3) for v in e], sigma=[0.25, 0.05, 0.25], method='survey adjustment (canopy:' + pn + ')', views=sorted(adj[pn]['res_px'])))
    for ln in P['lines']:
        obs = [(k, u, v) for k, pts in ln['img'] for u, v in pts]
        n = len(obs)

        def X(par, i):
            return enu(par[0], par[2 + i], par[1])   # direction N: a and y global, d per observation

        def res(par):
            r = []
            for i, (k, u, v) in enumerate(obs):
                p, z = mf.project(cams[k], X(par, i)[None])
                r += [p[0][0] - u, p[0][1] - v]
            return r
        sol = least_squares(res, [60.0, 7.7] + [-40.0] * n)
        rr = np.array(res(sol.x)).reshape(-1, 2)
        cov = np.linalg.pinv(sol.jac.T @ sol.jac)[:2, :2] * 2.0 ** 2   # pick noise 2 px
        a, y = float(sol.x[0]), float(sol.x[1])
        dims.append(dict(name=ln['name'] + '.a', value=round(a, 2), sigma=round(max(0.15, float(math.sqrt(cov[0, 0]))), 2), note=ln['note'] + f'; mean residual {np.abs(rr).mean():.1f} px over {n} edge samples'))
        dims.append(dict(name=ln['name'] + '.y', value=round(y, 2), sigma=round(max(0.1, float(math.sqrt(cov[1, 1]))), 2), note='T.P. height of the same line'))
    for d in P['dims']:
        dims.append(dict(d))
    out = dict(note='Quay-hall features (tools/survey/market_hall.py from data/survey/market/hall-picks.json): ENU metres, 1-sigma per axis.', features=feats, dims=dims)
    json.dump(out, open(os.path.join(ROOT, 'data/survey/market/hall-features.json'), 'w'), indent=1, ensure_ascii=False)
    print(f'{len(feats)} features, {len(dims)} dims')
    for f in feats[:3]:
        print(f['name'], f['enu'], [round(v, 2) for v in ad(f['enu'])])


if __name__ == '__main__':
    main()
