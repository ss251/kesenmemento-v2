"""Fish-market survey, step 3: named 3D features in ENU metres with 1-sigma, from the solved cameras.

  raw/survey/.venv/bin/python tools/survey/market_features.py [--picks data/survey/market/picks.json]
  raw/survey/.venv/bin/python tools/survey/market_features.py proj x,y,z [...]     # where ENU points land in each photo
  raw/survey/.venv/bin/python tools/survey/market_features.py sheet --out s.jpg IMG:u:v[:r][:label] ...   # zoomed pick tiles

Each feature in picks.json is measured one of three ways:
  * multi-view: pixel picks {photo: [u, v]} in >= 2 solved photos -> ray intersection, refined by minimising the
    reprojection error through the solved OPENCV / RADIAL lens model;
  * ray x plane: a pick in one photo intersected with a fitted plane ("plane": name of a plane in picks.json, itself a
    RANSAC fit of the SfM points selected by image polygons, or an explicit {n, d} / {y} plane);
  * sfm: the median of the SfM points inside an image polygon ("sfm": {photo: polygon}).
The 1-sigma combines the pick noise (1.5 px, propagated through the Jacobian), the plane fit (for ray x plane) and the
cluster's georegistration uncertainty from data/survey/market/georef.json (translation, rotation and scale sigmas
applied at the feature's distance from the cluster's cameras).
Writes data/survey/market/features.json ({ features: [{ name, enu, sigma, method, views, res_px, ray_angle_deg, note }],
dims: [{ name, value, sigma, note }] }), the shape tools/anime/survey-diff.mjs reads.
"""
import argparse
import json
import os
import sys

import cv2
import numpy as np
from scipy.optimize import least_squares
from scipy.spatial.transform import Rotation

sys.path.insert(0, os.path.dirname(__file__))
import slib  # noqa: E402

ROOT = slib.ROOT
FLIP = np.diag([1.0, -1.0, -1.0])
PX_SIGMA = 1.5


def load_cams():
    d = json.load(open(os.path.join(ROOT, 'data/survey/market/cameras.json')))
    cams = {}
    for c in d['cameras']:
        if not c.get('registered', True):
            continue
        K = np.array([[c['fx'], 0, c['cx']], [0, c['fy'], c['cy']], [0, 0, 1.0]])
        R3 = Rotation.from_quat(c['quaternion']).as_matrix()   # three.js camera -> ENU
        Rwc = R3 @ FLIP                                          # COLMAP camera -> ENU
        cams[c['id']] = dict(c=c, K=K, dist=np.array(c['dist'][:4], float), Rcw=Rwc.T, C=np.array(c['position'], float),
                             path=os.path.join(ROOT, c['image']), cluster=c.get('cluster'))
    return cams


def project(cam, X):
    X = np.atleast_2d(X)
    Xc = (cam['Rcw'] @ (X - cam['C']).T).T
    uv, _ = cv2.projectPoints(Xc.reshape(-1, 1, 3), np.zeros(3), np.zeros(3), cam['K'], cam['dist'])
    return uv.reshape(-1, 2), Xc[:, 2]


def ray(cam, uv):
    n = cv2.undistortPoints(np.array(uv, float).reshape(1, 1, 2), cam['K'], cam['dist']).reshape(2)
    d = cam['Rcw'].T @ np.array([n[0], n[1], 1.0])
    return d / np.linalg.norm(d)


def georef_sigma(geo, cluster, X, cams):
    """1-sigma (m) of a point from the cluster's similarity uncertainty."""
    g = geo.get(cluster)
    if not g:
        return 0.0
    Cs = np.array([c['C'] for c in cams.values() if c['cluster'] == cluster])
    r = np.linalg.norm(X - Cs.mean(0))
    st = np.linalg.norm(g['t_sigma_m']) / np.sqrt(3)
    sr = np.radians(np.linalg.norm(g['rot_sigma_deg']) / np.sqrt(3))
    ss = g['scale_sigma_rel']
    return float(np.sqrt(st ** 2 + (r * sr) ** 2 + (r * ss) ** 2))


def triangulate(cams, obs):
    ks = [k for k in obs if k in cams]
    if len(ks) < 2:
        return None
    A, b = np.zeros((3, 3)), np.zeros(3)
    dirs = []
    for k in ks:
        d = ray(cams[k], obs[k])
        dirs.append(d)
        M = np.eye(3) - np.outer(d, d)
        A += M
        b += M @ cams[k]['C']
    X0 = np.linalg.solve(A, b)

    def res(X):
        return np.concatenate([(project(cams[k], X[None])[0][0] - np.array(obs[k], float)) for k in ks])

    sol = least_squares(res, X0)
    r = res(sol.x).reshape(-1, 2)
    try:
        cov = np.linalg.inv(sol.jac.T @ sol.jac) * PX_SIGMA ** 2
    except np.linalg.LinAlgError:
        cov = np.full((3, 3), np.nan)
    ang = max(np.degrees(np.arccos(np.clip(dirs[i] @ dirs[j], -1, 1))) for i in range(len(dirs)) for j in range(i + 1, len(dirs)))
    return sol.x, {k: round(float(np.hypot(*rr)), 2) for k, rr in zip(ks, r)}, cov, ang


def plane_from(spec, cams, planes_done):
    """A plane spec -> (n, d, sigma_d) with n.x + d = 0."""
    if 'y' in spec:
        return np.array([0, 1.0, 0]), -float(spec['y']), float(spec.get('sigma', 0.05))
    if 'n' in spec:
        return np.asarray(spec['n'], float), float(spec['d']), float(spec.get('sigma', 0.05))
    if 'vertical_line' in spec:     # a vertical plane through two ENU (x, z) points
        a, b = np.asarray(spec['vertical_line'][0], float), np.asarray(spec['vertical_line'][1], float)
        u = (b - a) / np.linalg.norm(b - a)
        n = np.array([-u[1], 0, u[0]])
        return n, -float(n[0] * a[0] + n[2] * a[1]), float(spec.get('sigma', 0.05))
    if 'points' in spec:            # explicit ENU points (from other features)
        P = np.asarray(spec['points'], float)
        n, d = slib.fit_plane(P)
        return n, d, float(np.sqrt(np.mean((P @ n + d) ** 2)))
    raise SystemExit('bad plane spec ' + json.dumps(spec))


def ray_plane(cams, k, uv, plane):
    n, d, sd = plane
    C, r = cams[k]['C'], ray(cams[k], uv)
    den = n @ r
    if abs(den) < 1e-6:
        return None
    t = -(n @ C + d) / den
    X = C + t * r
    # pick noise across the ray (1.5 px at range t) plus the plane offset noise along the ray
    fpx = cams[k]['K'][0, 0]
    lat = t * PX_SIGMA / fpx
    along = sd / max(abs(den), 0.05)
    return X, float(t), float(np.sqrt(2 * lat ** 2 + along ** 2))   # total 3D 1-sigma


def parse_edge(s_):
    p = s_.split(':')
    k = p[0] if p[0].startswith('IMG_') else 'IMG_' + p[0]
    return k, [float(p[1]), float(p[2])], [float(p[3]), float(p[4])], int(p[5]) if len(p) > 5 else 8, float(p[6]) if len(p) > 6 else 25.0, p[7] if len(p) > 7 else 'any'


_gray = {}


def edge_samples(k, a, b, n=8, w=25.0, pol='any', path=None):
    """Sub-pixel points on the strongest straight edge near the segment a-b of photo k: at n stations along the segment
    the gradient magnitude (Gaussian-smoothed, sigma 1.5) is scanned across the band (+-w px, normal to the segment) and
    its peak is refined by a parabola. pol 'pos' / 'neg' keeps only edges getting brighter / darker along the normal."""
    if k not in _gray:
        from glob import glob
        f = path or glob(os.path.join(ROOT, 'raw/survey/market/images/*', k + '.jpg'))[0]
        g = cv2.imread(f, cv2.IMREAD_GRAYSCALE).astype(np.float32)
        _gray[k] = cv2.GaussianBlur(g, (0, 0), 1.5)
    g = _gray[k]
    a, b = np.asarray(a, float), np.asarray(b, float)
    t = (b - a) / np.linalg.norm(b - a)
    nrm = np.array([-t[1], t[0]])
    out = []
    for i in range(n):
        c = a + (b - a) * (i + 0.5) / n
        offs = np.arange(-w, w + 0.5, 0.5)
        pts = c[None] + offs[:, None] * nrm[None]
        vals = cv2.remap(g, pts[:, 0].astype(np.float32).reshape(1, -1), pts[:, 1].astype(np.float32).reshape(1, -1), cv2.INTER_LINEAR).ravel()
        d = np.gradient(vals)
        if pol == 'pos':
            m = d
        elif pol == 'neg':
            m = -d
        else:
            m = np.abs(d)
        j = int(np.argmax(m))
        if 0 < j < len(m) - 1:
            den = m[j - 1] - 2 * m[j] + m[j + 1]
            dj = 0.5 * (m[j - 1] - m[j + 1]) / den if den != 0 else 0.0
        else:
            dj = 0.0
        q = c + (offs[j] + dj * 0.5) * nrm
        out.append([round(float(q[0]), 1), round(float(q[1]), 1), round(float(m[j]), 1)])
    return out


def sheet(cams, items, out, cols=3, tile=420):
    tiles = []
    cache = {}
    for it in items:
        k = it['img']
        if k not in cache:
            cache[k] = cv2.imread(cams[k]['path'])
        img = cache[k]
        u, v, r = it['u'], it['v'], it.get('r', 60)
        x0, y0, sz = int(round(u - r)), int(round(v - r)), 2 * r
        canvas = np.zeros((sz, sz, 3), np.uint8)
        H, W = img.shape[:2]
        xa, ya, xb, yb = max(0, x0), max(0, y0), min(W, x0 + sz), min(H, y0 + sz)
        if xb > xa and yb > ya:
            canvas[ya - y0:yb - y0, xa - x0:xb - x0] = img[ya:yb, xa:xb]
        t = cv2.resize(canvas, (tile, tile), interpolation=cv2.INTER_LANCZOS4)
        kk = tile / sz
        step = next(s for s in (5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000) if sz / s <= 10)
        for gx in range((x0 // step + 1) * step, x0 + sz, step):
            X = int((gx - x0) * kk)
            cv2.line(t, (X, 0), (X, tile), (0, 255, 255), 1)
            cv2.putText(t, str(gx), (X + 2, 12), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (0, 255, 255), 1, cv2.LINE_AA)
        for gy in range((y0 // step + 1) * step, y0 + sz, step):
            Y = int((gy - y0) * kk)
            cv2.line(t, (0, Y), (tile, Y), (255, 255, 0), 1)
            cv2.putText(t, str(gy), (2, Y - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (255, 255, 0), 1, cv2.LINE_AA)
        for (mu, mv) in it.get('marks', []):
            X, Y = int((mu - x0) * kk), int((mv - y0) * kk)
            cv2.circle(t, (X, Y), 7, (0, 0, 255), 1, cv2.LINE_AA)
        cv2.rectangle(t, (0, tile - 18), (tile, tile), (0, 0, 0), -1)
        cv2.putText(t, it.get('label', k)[:60], (4, tile - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 255, 255), 1, cv2.LINE_AA)
        tiles.append(t)
    rows = (len(tiles) + cols - 1) // cols
    S = np.zeros((rows * tile, cols * tile, 3), np.uint8)
    for i, t in enumerate(tiles):
        S[(i // cols) * tile:(i // cols + 1) * tile, (i % cols) * tile:(i % cols + 1) * tile] = t
    cv2.imwrite(out, S, [cv2.IMWRITE_JPEG_QUALITY, 88])


def measure(picks_path):
    cams = load_cams()
    gp = os.path.join(ROOT, 'data/survey/market/georef.json')
    geo = json.load(open(gp)) if os.path.exists(gp) else {}
    P = json.load(open(os.path.join(ROOT, picks_path)))
    planes = {}
    for name, spec in P.get('planes', {}).items():
        planes[name] = plane_from(spec, cams, planes)
    feats, dims = [], []
    pos = {}
    for f in P['features']:
        name, rec = f['name'], None
        obs = {('IMG_' + k if not k.startswith('IMG_') else k): v for k, v in f.get('obs', {}).items()}
        cl = next((cams[k]['cluster'] for k in obs if k in cams), None)
        if f.get('enu') is not None:            # measured elsewhere (GSI ortho, GSI map): taken as given with its sigma
            rec = dict(name=name, enu=[round(float(v), 3) for v in f['enu']], sigma=f.get('sigma', [1.0, 1.0, 1.0]), method=f.get('method', 'given'))
        elif f.get('from_adjust'):               # a point of the survey adjustment (multi-view picks + hard references)
            src, pn = f['from_adjust'].split(':')
            A = json.load(open(os.path.join(ROOT, f'data/survey/market/adjust-{src}.json')))['points']
            if isinstance(pn, str) and '+' in pn:
                pts = [A[q] for q in pn.split('+')]
                X = np.mean([q['enu'] for q in pts], 0)
                sg = np.sqrt(np.mean([np.square(q['sigma']) for q in pts], 0))
                res = {k: v for q in pts for k, v in q['res_px'].items()}
            else:
                X, sg, res = np.array(A[pn]['enu']), np.array(A[pn]['sigma']), A[pn]['res_px']
            X = np.array(X, float)
            if f.get('y') is not None:
                X[1] = f['y']
            sgr = georef_sigma(geo, src, X, cams) if geo else 0.0
            rec = dict(name=name, enu=[round(float(v), 3) for v in X], sigma=[round(float(np.hypot(v, sgr)), 3) for v in sg], method='survey adjustment (' + f['from_adjust'] + ')', views=sorted(res), res_px=res)
        elif f.get('plane') and len([k for k in obs if k in cams]) >= 1 and (len(obs) == 1 or f.get('force_plane')):
            spec = f['plane']
            pl = planes[spec] if isinstance(spec, str) else plane_from(spec, cams, planes)
            k = next(k for k in obs if k in cams)
            got = ray_plane(cams, k, obs[k], pl)
            if got is None:
                print('  !', name, 'ray parallel to the plane')
                continue
            X, rng, s_meas = got
            cs = cams[k]['c'].get('sigma') or {}
            s_cam = float(np.linalg.norm(cs.get('pos_m', [0, 0, 0])) + rng * np.radians(np.linalg.norm(cs.get('rot_deg', [0, 0, 0]))))
            sg = float(np.sqrt(s_meas ** 2 + georef_sigma(geo, cl, X, cams) ** 2 + s_cam ** 2 + f.get('pick_m', 0.0) ** 2))
            rec = dict(name=name, enu=[round(float(v), 3) for v in X], sigma=[round(sg, 3)] * 3, method='ray x plane ' + (spec if isinstance(spec, str) else 'inline'),
                       views=[k], range_m=round(rng, 1))
        elif len([k for k in obs if k in cams]) >= 2:
            X, res, cov, ang = triangulate(cams, obs)
            sp = np.sqrt(np.clip(np.diag(cov), 0, None))
            sgr = georef_sigma(geo, cl, X, cams)
            sg = [round(float(np.hypot(v, sgr)), 3) for v in sp]
            rec = dict(name=name, enu=[round(float(v), 3) for v in X], sigma=sg, method='multi-view', views=sorted(res), res_px=res, ray_angle_deg=round(float(ang), 2))
            if max(res.values()) > 6:
                print(f'  ! {name}: reprojection residual {res} px: check the picks')
        else:
            print('  ! skipped (no solved view):', name)
            continue
        if f.get('y') is not None and rec.get('method', '').startswith('ray'):
            rec['enu'][1] = f['y']
        if f.get('note'):
            rec['note'] = f['note']
        if cl:
            rec['cluster'] = cl
        feats.append(rec)
        pos[name] = np.array(rec['enu'])
    for d in P.get('dims', []):
        dims.append(dict(d))
    hp = os.path.join(ROOT, 'data/survey/market/hall-features.json')    # the quay hall: tools/survey/market_hall.py
    if os.path.exists(hp):
        H = json.load(open(hp))
        feats += H['features']
        dims += H['dims']
    tp = os.path.join(ROOT, 'data/survey/market/tug-features.json')    # the berthed tug: tools/survey/tug_spec.py
    if os.path.exists(tp):
        T_ = json.load(open(tp))
        feats += T_['features']
        dims += T_['dims']
    out = dict(note='Market survey features (tools/survey/market_features.py): ENU metres (x east, y T.P. up, z south), 1-sigma per axis. '
               'Names: docs/anime/survey/market.md. Groups name#k are matched without order by tools/anime/survey-diff.mjs.',
               area='market', features=feats, dims=dims)
    json.dump(out, open(os.path.join(ROOT, 'data/survey/market/features.json'), 'w'), indent=1, ensure_ascii=False)
    print(f'wrote {len(feats)} features, {len(dims)} dims')
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', nargs='?', default='measure')
    ap.add_argument('rest', nargs='*')
    ap.add_argument('--picks', default='data/survey/market/picks.json')
    ap.add_argument('--out', default=None)
    ap.add_argument('--cols', type=int, default=3)
    ap.add_argument('--tile', type=int, default=420)
    a = ap.parse_args()
    if a.cmd == 'measure':
        measure(a.picks)
    elif a.cmd == 'proj':
        cams = load_cams()
        for s in a.rest:
            X = np.array([float(v) for v in s.split(',')])
            print('==', s)
            for k, cam in sorted(cams.items()):
                uv, z = project(cam, X[None])
                u, v = uv[0]
                if z[0] > 0 and -50 <= u <= cam['c']['width'] + 50 and -50 <= v <= cam['c']['height'] + 50:
                    print(f'  {k}: u={u:.0f} v={v:.0f} depth={z[0]:.1f} m')
    elif a.cmd == 'transfer':
        # IMG:u:v:Y  -> the ray of (u, v) in IMG cut at height Y (T.P.), projected into every solved photo
        cams = load_cams()
        for s_ in a.rest:
            k, u, v, Y = s_.split(':')
            k = k if k.startswith('IMG_') else 'IMG_' + k
            C, d = cams[k]['C'], ray(cams[k], [float(u), float(v)])
            t = (float(Y) - C[1]) / d[1]
            X = C + t * d
            print(f'== {s_}: ENU {np.round(X, 2)} at {t:.1f} m')
            for kk, cam in sorted(cams.items()):
                uv, z = project(cam, X[None])
                if z[0] > 0 and -50 <= uv[0][0] <= cam['c']['width'] + 50 and -50 <= uv[0][1] <= cam['c']['height'] + 50:
                    print(f'  {kk}: u={uv[0][0]:.0f} v={uv[0][1]:.0f} depth={z[0]:.1f} m')
    elif a.cmd == 'edge':
        # IMG:u0:v0:u1:v1[:n[:w[:pol]]] -> n points on the strongest edge across the band between the two rough end points
        for s_ in a.rest:
            print(json.dumps(edge_samples(*parse_edge(s_))))
    elif a.cmd == 'sheet':
        cams = load_cams()
        items = []
        for s in a.rest:
            p = s.split(':')
            k = p[0] if p[0].startswith('IMG_') else 'IMG_' + p[0]
            it = dict(img=k, u=float(p[1]), v=float(p[2]))
            if len(p) > 3 and p[3]:
                it['r'] = int(p[3])
            it['label'] = (p[4] + ' ' if len(p) > 4 else '') + f'{k[4:]} ({p[1]},{p[2]})'
            it['marks'] = [(it['u'], it['v'])] if len(p) > 5 else []
            items.append(it)
        sheet(cams, items, a.out, a.cols, a.tile)
    else:
        raise SystemExit('unknown command ' + a.cmd)


if __name__ == '__main__':
    main()
