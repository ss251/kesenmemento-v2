"""[v6:fix2] Fit the deck cars' stands to the photos: each car's silhouette (the convex hull of its lofted body, wheels and roof, projected through the SOLVED
cameras and the lens model) against the photo's Canny edges, over every photo the car stands in, far cars hidden behind nearer ones left out. Free per car:
the nose stand (s, off) and the heading, with priors (1 m, 15 deg) on the starting values. Writes data/survey/market/cars.json (--write) and prints the
residuals per photo.  raw/survey/.venv/bin/python tools/survey/car_fit.py [--write] [--photos 0794,0796,0797,0798,0793,0792]
"""
import argparse, json, os, sys
import cv2, numpy as np
from scipy.optimize import minimize
sys.path.insert(0, os.path.dirname(__file__))
import market_features as mf
ROOT = mf.ROOT
M = json.load(open(os.path.join(ROOT, 'data/survey/market/model.json'))); FR = M['frame']
O = np.array(FR['o']); U = np.array(FR['u']); N = np.array(FR['n']); Y = M['deck']['y']
SPEC = os.path.join(ROOT, 'data/survey/market/cars.json')

def stations(T):
    if 'st' in T: return T['st']
    belt, H = T['belt'], T['H']; tf = T.get('tailFrac', .6); rt = T.get('rearT', .06); ft = T.get('frontT', .55); ct = T.get('cowlT', .7); hood = T.get('hood', belt - .05); nose = T.get('nose', hood - .2); rw = T.get('rw', .8)
    return [[0, .4, belt, belt + (H - belt) * tf, .92, rw * .92], [.012, .26, belt, belt + (H - belt) * min(1, tf + .2), .99, rw], [rt, .22, belt, H, 1, rw], [ft, .22, belt, H, 1, rw],
            [ct, .24, hood, hood, 1, 1], [(ct + 1) * .5 + .06, .28, hood - .04, hood - .04, .98, 1], [.985, .34, nose, nose, .94, 1], [1, .4, nose - .04, nose - .04, .9, 1]]

def car_cloud(T, W, L):
    """vertices in the car frame (x left, y up, z forward, origin at the footprint centre)"""
    pts = []
    for t, yb, ys, yr, wb, wr in stations(T):
        z = (t - .5) * L; w = wb * W; wr_ = wr * W
        for x, y in [(-w / 2, yb), (-w / 2, ys), (-wr_ / 2, yr), (wr_ / 2, yr), (w / 2, ys), (w / 2, yb)]: pts.append([x, y, z])
    rr = T.get('tyre', .32); zr = -L / 2 + T.get('rearOver', .2 * L); zf = zr + T.get('wheelbase', .62 * L)
    for zz in (zr, zf):
        for sd in (-1, 1):
            for a in np.linspace(0, 2 * np.pi, 12, endpoint=False): pts.append([sd * (W / 2 - .12), rr + rr * np.sin(a), zz + rr * np.cos(a)])
    return np.array(pts)

class Fit:
    def __init__(self, photos):
        self.cams = mf.load_cams(); self.photos = [('IMG_' + p) for p in photos]
        self.dt = {}; self.sc = 0.25
        for k in self.photos:
            im = cv2.imread(self.cams[k]['path']); g = cv2.cvtColor(cv2.resize(im, None, fx=self.sc, fy=self.sc, interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY)
            g = cv2.GaussianBlur(g, (0, 0), 1.2); ed = cv2.Canny(g, 25, 70)
            self.dt[k] = cv2.distanceTransform((ed == 0).astype(np.uint8), cv2.DIST_L2, 3)
            self.dt[k] /= self.sc   # raw px

    def world_cloud(self, car, T):
        L = car.get('L', T['L']); W = car.get('W', T['W']); cl = car_cloud(T, W, L)
        ph = np.radians(car.get('face', 0)); fwd = np.array([np.sin(ph), -np.cos(ph)])            # (ds, doff) of the nose
        left = np.array([np.cos(ph), np.sin(ph)])                                                   # the car's left (x+): facing the wall (west) the left hand is south (+s)
        if 'nose' in car: c = np.array(car['nose']) - fwd * L / 2
        else: c = np.array([car['s'], car['off']])
        pw = c[None] + fwd[None] * cl[:, 2:3] + left[None] * (-cl[:, 0:1])                          # x is the car's left: facing west the left hand is south (+s) -> left = (cos, sin)... mirrored by the minus: keep a right-handed frame
        pts = np.stack([O[0] + U[0] * pw[:, 0] + N[0] * pw[:, 1], Y + cl[:, 1], O[1] + U[1] * pw[:, 0] + N[1] * pw[:, 1]], 1)
        return pts

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--write', action='store_true'); ap.add_argument('--photos', default='0794,0796,0797,0798,0793,0792,0795'); ap.add_argument('--only', default='')
    a = ap.parse_args()
    spec = json.load(open(SPEC)); F = Fit(a.photos.split(','))
    cams = F.cams; cars = spec['cars']
    def hull_pts(car, k, params=None):
        c = dict(car)
        if params is not None:
            if 'nose' in c: c['nose'] = [params[0], params[1]]
            else: c['s'], c['off'] = params[0], params[1]
            c['face'] = params[2]
        T = spec['types'][c['type']]
        P = F.world_cloud(c, T)
        uv, z = mf.project(cams[k], P)
        if (z < 0.3).any(): return None
        h = cv2.convexHull(uv.astype(np.float32)).reshape(-1, 2)
        return h
    def car_cost(car, k, params, hid):
        h = hull_pts(car, k, params)
        if h is None: return None
        # sample the hull outline
        pts = []
        for i in range(len(h)):
            p, q = h[i], h[(i + 1) % len(h)]; n = max(2, int(np.hypot(*(q - p)) / 12))
            for t in np.linspace(0, 1, n, endpoint=False): pts.append(p + (q - p) * t)
        pts = np.array(pts); dt = F.dt[k]; H, W = dt.shape; sc = F.sc
        ok = (pts[:, 0] * sc > 3) & (pts[:, 0] * sc < W - 3) & (pts[:, 1] * sc > 3) & (pts[:, 1] * sc < H - 3)
        if hid is not None and hid.get(k) is not None: ok &= ~hid[k](pts)
        if ok.sum() < 6: return None
        d = dt[(pts[ok, 1] * sc).astype(int), (pts[ok, 0] * sc).astype(int)]
        return float(np.mean(np.minimum(d, 120.0))) / (cams[k]['c']['width'] / 1000.0)    # per mille of the image width
    # order far -> near per photo for the hidden-outline test is skipped: cars in a row hide each other's outlines only at the overlaps; use a visibility mask from the nearer cars' hulls
    def masks_for(k, params_all):
        out = []
        for i, car in enumerate(cars):
            p = params_all[i]; h = hull_pts(car, k, p)
            C = cams[k]['C']; ci = (np.array([O[0] + U[0] * p[0] + N[0] * p[1], Y, O[1] + U[1] * p[0] + N[1] * p[1]]) - C); out.append((np.linalg.norm(ci), h))
        return out
    def hid_fn(k, params_all, i):
        ms = masks_for(k, params_all); mi = ms[i][0]
        sc = F.sc; H, W = F.dt[k].shape
        m = np.zeros((int(H * sc) + 1, int(W * sc) + 1), np.uint8)
        for j, (r, h) in enumerate(ms):
            if j != i and r < mi and h is not None: cv2.fillPoly(m, [(h * sc).astype(np.int32)], 1)
        def f(pts):
            xs = np.clip((pts[:, 0] * sc).astype(int), 0, m.shape[1] - 1); ys = np.clip((pts[:, 1] * sc).astype(int), 0, m.shape[0] - 1)
            return m[ys, xs] > 0
        return f
    P0 = [list(c['nose']) + [c.get('face', 0)] if 'nose' in c else [c['s'], c['off'], c.get('face', 0)] for c in cars]
    P = [list(p) for p in P0]
    for it in range(4):
        for i, car in enumerate(cars):
            if a.only and a.only not in car['name']: continue
            hid = {k: hid_fn(k, P, i) for k in F.photos}
            def obj(p):
                tot = 0; n = 0
                for k in F.photos:
                    c = car_cost(car, k, p, hid)
                    if c is not None: tot += c; n += 1
                if n == 0: return 1e3
                pri = ((p[0] - P0[i][0]) / 1.2) ** 2 + ((p[1] - P0[i][1]) / 0.6) ** 2 + ((p[2] - P0[i][2]) / 15.0) ** 2
                # cars do not overlap: neighbours in the row stand at least a body width + 0.2 m apart (centre to centre along the row)
                pen = 0.0
                for j, cj in enumerate(cars):
                    if j == i: continue
                    pj = P[j]
                    if abs(pj[1] - p[1]) > 2.5: continue
                    Wi = car.get('W', spec['types'][car['type']]['W']); Wj = cj.get('W', spec['types'][cj['type']]['W'])
                    need = (Wi + Wj) / 2 + 0.2; ds = abs(pj[0] - p[0])
                    if ds < need: pen += 30.0 * (need - ds) ** 2
                # the photographers stood in the aisle: no car body contains a camera centre (0.4 m margin)
                T_ = spec['types'][car['type']]; L_ = car.get('L', T_['L']); W_ = car.get('W', T_['W']); ph_ = np.radians(p[2]); fw = np.array([np.sin(ph_), -np.cos(ph_)]); lf = np.array([np.cos(ph_), np.sin(ph_)]); cen = np.array(p[:2]) - fw * L_ / 2
                for kk in cams:
                    if cams[kk]['cluster'] not in ('deck', 'deck0793'): continue
                    q = np.array([cams[kk]['C'][0], cams[kk]['C'][2]]) - O; cs_, co_ = q @ U, q @ N
                    r_ = np.array([cs_, co_]) - cen; along, lat = r_ @ fw, r_ @ lf
                    gap = max(abs(along) - L_ / 2 - 0.4, abs(lat) - W_ / 2 - 0.4)
                    if gap < 0: pen += 40.0 * gap ** 2
                return tot / n + 0.15 * pri + pen
            r = minimize(obj, P[i], method='Nelder-Mead', options=dict(xatol=0.03, fatol=1e-3, maxiter=200, initial_simplex=np.array([P[i], np.add(P[i], [0.6, 0, 0]), np.add(P[i], [0, 0.4, 0]), np.add(P[i], [0, 0, 8])])))
            P[i] = list(r.x)
            print(it, car['name'], 'start', np.round(P0[i], 2), '->', np.round(r.x, 2), 'cost', round(r.fun, 2))
    if a.write:
        for i, car in enumerate(cars):
            if 'nose' in car: car['nose'] = [round(P[i][0], 2), round(P[i][1], 2)]
            else: car['s'], car['off'] = round(P[i][0], 2), round(P[i][1], 2)
            car['face'] = round(P[i][2], 1)
        json.dump(spec, open(SPEC, 'w'), indent=1); print('wrote', SPEC)

if __name__ == '__main__':
    main()

def per_photo(name, photos='0794,0796,0797,0798,0793,0792', s_vals=(92, 93, 94, 95, 96, 97, 98, 99, 100)):
    """the cost of one car in every photo as its s sweeps (heading and off fixed): shows which photos pull where"""
    spec = json.load(open(SPEC)); F = Fit(photos.split(',')); cams = F.cams
    car = next(c for c in spec['cars'] if c['name'] == name); T = spec['types'][car['type']]
    for k in F.photos:
        row = []
        for sv in s_vals:
            c = dict(car); c['nose'] = [sv, car['nose'][1]]
            P = F.world_cloud(c, T); uv, z = mf.project(cams[k], P)
            if (z < .3).any(): row.append(None); continue
            h = cv2.convexHull(uv.astype(np.float32)).reshape(-1, 2); pts = []
            for i in range(len(h)):
                p, q = h[i], h[(i + 1) % len(h)]; n = max(2, int(np.hypot(*(q - p)) / 12))
                for t in np.linspace(0, 1, n, endpoint=False): pts.append(p + (q - p) * t)
            pts = np.array(pts); dt = F.dt[k]; H, W = dt.shape; sc = F.sc
            ok = (pts[:, 0] * sc > 3) & (pts[:, 0] * sc < W - 3) & (pts[:, 1] * sc > 3) & (pts[:, 1] * sc < H - 3)
            row.append(None if ok.sum() < 6 else round(float(np.mean(np.minimum(dt[(pts[ok, 1] * sc).astype(int), (pts[ok, 0] * sc).astype(int)], 120))) / (cams[k]['c']['width'] / 1000), 1))
        print(k, row)
