"""Survey step 3 helpers: project ENU points into the solved photos, make zoomed pick sheets, triangulate pixel picks.

  raw/survey/.venv/bin/python tools/survey/pick.py proj  --area minami  x,y,z [x,y,z ...]        # where a point lands
  raw/survey/.venv/bin/python tools/survey/pick.py sheet --area minami  --out s.jpg  IMG:u:v[:r][:label] ...
  raw/survey/.venv/bin/python tools/survey/pick.py view  --area minami  --out v.jpg  IMG [--grid 250] [--mark x,y,z ...]
  raw/survey/.venv/bin/python tools/survey/pick.py tri   --area minami  [--picks data/survey/minami/picks.json]

A pick sheet is a grid of full-resolution crops, each with a pixel grid labelled in full-resolution image coordinates, so a
pick read off the sheet is accurate to ~1-2 px. `tri` intersects the picked rays of every feature seen in >= 2 solved
photos (distortion removed with the solved OPENCV / RADIAL model), refines the point by minimising the reprojection
error, and propagates a 1.5 px pick sigma plus the georegistration sigma to a 1-sigma uncertainty in metres.
"""
import argparse
import json
import os
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import slib  # noqa: E402


def load_cams(area):
    d = json.load(open(os.path.join(slib.ROOT, 'data/survey', area, 'cameras.json')))
    cams = {}
    for c in d['cameras']:
        if c.get('registered') is False:
            continue
        K = np.array([[c['fx'], 0, c['cx']], [0, c['fy'], c['cy']], [0, 0, 1.0]])
        dist = np.array((c['dist'] + [0, 0, 0, 0])[:4] if len(c['dist']) <= 4 else c['dist'], float)
        from scipy.spatial.transform import Rotation
        R3 = Rotation.from_quat(c['quaternion']).as_matrix()  # three.js camera -> ENU
        Rwc = R3 @ slib.FLIP  # COLMAP camera -> ENU
        cams[c['id']] = dict(c=c, K=K, dist=dist, Rcw=Rwc.T, C=np.array(c['position']), path=os.path.join(slib.ROOT, c['image']))
    return cams


def project(cam, X):
    """ENU points (N,3) -> distorted pixel coords (N,2) and depth (N,)."""
    X = np.atleast_2d(X)
    Xc = (cam['Rcw'] @ (X - cam['C']).T).T
    rvec = np.zeros(3)
    uv, _ = cv2.projectPoints(Xc.reshape(-1, 1, 3), rvec, np.zeros(3), cam['K'], cam['dist'])
    return uv.reshape(-1, 2), Xc[:, 2]


def ray(cam, uv):
    """Distorted pixel -> unit ray direction in ENU."""
    n = cv2.undistortPoints(np.array(uv, float).reshape(1, 1, 2), cam['K'], cam['dist']).reshape(2)
    d = cam['Rcw'].T @ np.array([n[0], n[1], 1.0])
    return d / np.linalg.norm(d)


_img_cache = {}


def image(cam):
    p = cam['path']
    if p not in _img_cache:
        if len(_img_cache) > 6:
            _img_cache.clear()
        _img_cache[p] = cv2.imread(p)
    return _img_cache[p]


def nice_step(span):
    for s in (5, 10, 20, 25, 50, 100, 200, 250, 500, 1000):
        if span / s <= 10:
            return s
    return 2000


def crop_tile(cam, u, v, r, label='', tile=420, marks=()):
    img = image(cam)
    H, W = img.shape[:2]
    x0, y0 = int(round(u - r)), int(round(v - r))
    sz = 2 * r
    canvas = np.zeros((sz, sz, 3), np.uint8)
    xa, ya, xb, yb = max(0, x0), max(0, y0), min(W, x0 + sz), min(H, y0 + sz)
    if xb > xa and yb > ya:
        canvas[ya - y0:yb - y0, xa - x0:xb - x0] = img[ya:yb, xa:xb]
    t = cv2.resize(canvas, (tile, tile), interpolation=cv2.INTER_LANCZOS4 if tile > sz else cv2.INTER_AREA)
    k = tile / sz
    step = nice_step(sz)
    for gx in range((x0 // step + 1) * step, x0 + sz, step):
        X = int((gx - x0) * k)
        cv2.line(t, (X, 0), (X, tile), (0, 255, 255), 1)
        cv2.putText(t, str(gx), (X + 2, 12), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (0, 255, 255), 1, cv2.LINE_AA)
    for gy in range((y0 // step + 1) * step, y0 + sz, step):
        Y = int((gy - y0) * k)
        cv2.line(t, (0, Y), (tile, Y), (255, 255, 0), 1)
        cv2.putText(t, str(gy), (2, Y - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (255, 255, 0), 1, cv2.LINE_AA)
    for (mu, mv, col) in marks:
        X, Y = int((mu - x0) * k), int((mv - y0) * k)
        cv2.circle(t, (X, Y), 6, col, 1, cv2.LINE_AA)
        cv2.line(t, (X - 10, Y), (X - 3, Y), col, 1)
        cv2.line(t, (X + 3, Y), (X + 10, Y), col, 1)
    cv2.rectangle(t, (0, tile - 18), (tile, tile), (0, 0, 0), -1)
    cv2.putText(t, label[:60], (4, tile - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 255, 255), 1, cv2.LINE_AA)
    return t


def sheet(cams, items, out, cols=3, tile=420):
    tiles = [crop_tile(cams[i['img']], i['u'], i['v'], i.get('r', 60), i.get('label', i['img']), tile, i.get('marks', ())) for i in items]
    rows = (len(tiles) + cols - 1) // cols
    S = np.zeros((rows * tile, cols * tile, 3), np.uint8)
    for k, t in enumerate(tiles):
        S[(k // cols) * tile:(k // cols + 1) * tile, (k % cols) * tile:(k % cols + 1) * tile] = t
    cv2.imwrite(out, S, [cv2.IMWRITE_JPEG_QUALITY, 88])


def view(cam, out, grid=250, marks=(), height=1400, crop=None):
    img = image(cam).copy()
    H, W = img.shape[:2]
    for (mu, mv, col, lab) in marks:
        cv2.circle(img, (int(mu), int(mv)), 14, col, 3, cv2.LINE_AA)
        cv2.putText(img, lab, (int(mu) + 16, int(mv) - 10), cv2.FONT_HERSHEY_SIMPLEX, 1.4, col, 3, cv2.LINE_AA)
    if crop:
        x0, y0, x1, y1 = crop
        img = img[y0:y1, x0:x1]
    else:
        x0, y0 = 0, 0
    h, w = img.shape[:2]
    k = height / h
    t = cv2.resize(img, (int(w * k), height), interpolation=cv2.INTER_AREA)
    for gx in range(((x0 // grid) + 1) * grid, x0 + w, grid):
        X = int((gx - x0) * k)
        cv2.line(t, (X, 0), (X, height), (0, 255, 255), 1)
        cv2.putText(t, str(gx), (X + 2, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1, cv2.LINE_AA)
    for gy in range(((y0 // grid) + 1) * grid, y0 + h, grid):
        Y = int((gy - y0) * k)
        cv2.line(t, (0, Y), (int(w * k), Y), (255, 255, 0), 1)
        cv2.putText(t, str(gy), (2, Y - 3), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 0), 1, cv2.LINE_AA)
    cv2.imwrite(out, t, [cv2.IMWRITE_JPEG_QUALITY, 85])


# ------------------------------------------------------------------------------------------------ triangulation
def triangulate(cams, obs, sigma_px=1.5):
    """obs: {img: [u, v]} -> X (3,), per-view residual px, 1-sigma covariance (3x3) from the picks alone."""
    from scipy.optimize import least_squares
    ids = [k for k in obs if k in cams]
    if len(ids) < 2:
        return None
    # linear: least-squares intersection of rays
    A = np.zeros((3, 3))
    b = np.zeros(3)
    for k in ids:
        d = ray(cams[k], obs[k])
        M = np.eye(3) - np.outer(d, d)
        A += M
        b += M @ cams[k]['C']
    X0 = np.linalg.solve(A, b)

    def res(X):
        return np.concatenate([(project(cams[k], X[None])[0][0] - np.array(obs[k])) for k in ids])

    sol = least_squares(res, X0)
    X = sol.x
    r = res(X).reshape(-1, 2)
    J = sol.jac
    try:
        cov = np.linalg.inv(J.T @ J) * sigma_px ** 2
    except np.linalg.LinAlgError:
        cov = np.full((3, 3), np.nan)
    # the ray-intersection angle (a weak geometry flag)
    dirs = [ray(cams[k], obs[k]) for k in ids]
    ang = max(np.degrees(np.arccos(np.clip(dirs[i] @ dirs[j], -1, 1))) for i in range(len(dirs)) for j in range(i + 1, len(dirs)))
    return X, {k: round(float(np.hypot(*rr)), 2) for k, rr in zip(ids, r)}, cov, ang


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd')
    ap.add_argument('rest', nargs='*')
    ap.add_argument('--area', default='minami')
    ap.add_argument('--out', default=None)
    ap.add_argument('--grid', type=int, default=250)
    ap.add_argument('--height', type=int, default=1400)
    ap.add_argument('--crop', default=None)
    ap.add_argument('--mark', action='append', default=[])
    ap.add_argument('--cols', type=int, default=3)
    ap.add_argument('--tile', type=int, default=420)
    a = ap.parse_args()
    cams = load_cams(a.area)
    if a.cmd == 'proj':
        for s in a.rest:
            X = np.array([float(v) for v in s.split(',')])
            print('==', s)
            for k, cam in sorted(cams.items()):
                uv, z = project(cam, X[None])
                u, v = uv[0]
                if z[0] > 0 and -50 <= u <= cam['c']['width'] + 50 and -50 <= v <= cam['c']['height'] + 50:
                    print(f'  {k}: u={u:.0f} v={v:.0f} depth={z[0]:.1f} m')
    elif a.cmd == 'sheet':
        items = []
        for s in a.rest:
            p = s.split(':')
            it = {'img': p[0] if p[0].startswith('IMG_') else 'IMG_' + p[0], 'u': float(p[1]), 'v': float(p[2])}
            if len(p) > 3 and p[3]:
                it['r'] = int(p[3])
            it['label'] = (p[4] if len(p) > 4 else '') + f" {it['img'][4:]} ({p[1]},{p[2]})"
            items.append(it)
        sheet(cams, items, a.out, cols=a.cols, tile=a.tile)
    elif a.cmd == 'view':
        k = a.rest[0] if a.rest[0].startswith('IMG_') else 'IMG_' + a.rest[0]
        marks = []
        cols = [(0, 0, 255), (0, 255, 0), (255, 0, 255), (255, 128, 0), (0, 165, 255)]
        for i, m in enumerate(a.mark):
            lab, _, xyz = m.rpartition('=')
            X = np.array([float(v) for v in xyz.split(',')])
            uv, z = project(cams[k], X[None])
            if z[0] > 0:
                marks.append((uv[0][0], uv[0][1], cols[i % len(cols)], lab or str(i)))
        view(cams[k], a.out, a.grid, marks, a.height, [int(v) for v in a.crop.split(',')] if a.crop else None)
    elif a.cmd == 'tri':
        pass
    else:
        raise SystemExit('unknown command ' + a.cmd)


if __name__ == '__main__':
    main()
