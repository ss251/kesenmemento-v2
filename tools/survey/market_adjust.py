"""Fish-market survey: a surveyor's bundle adjustment in ENU (cameras, tie points and features in one least squares).

  raw/survey/.venv/bin/python tools/survey/market_adjust.py [--cfg data/survey/market/adjust.json] [--only deck] [--report]

Why: the automatic SfM of the market photos is weak (the deck: 7 dusk photos, wide baselines, people moving, big plain
surfaces -> ALIKED + LightGlue registers 6 of 7 with ~800 points; the canopy: 77 mm telephoto frames a few metres apart ->
the bas-relief ambiguity collapses every depth to one plane). So the cameras are solved here from hand-picked tie points
(read off zoomed, pixel-gridded crops) together with the hard references, in the app's ENU frame directly:

  unknowns   per photo: the rotation (ENU -> COLMAP camera, rotation vector) and the centre; per lens: f (fx = fy), k1, k2
             (principal point at the centre, as COLMAP); per point: ENU x, y, z; named scalars (e.g. the deck's T.P.)
  residuals  (all in sigma units, soft-L1 robust loss)
    obs        every pick: the reprojection error through the OPENCV lens model (sigma 1.5 px unless given)
    known      a point with a known ENU position (GSI / OSM corners, the bridge pylon top, far landmarks), per axis
    on_y       a point at a known or named height (the deck, the apron, a quay top)
    on_line    a point on a 2D ENU line (a GSI / OSM footprint edge, a quay edge), with an offset
    vertical   two points on one plumb line (x and z equal)
    dist       a known distance between two points (licence plate 0.33 m, a kei car 3.395 m, a truck 1.695 m wide)
    eye        a camera's height above a named surface (hand-held phone 1.45 +- 0.12 m)
    gps        a camera's horizontal GPS fix (sigma 8 m; fixes flagged as outliers are left out)
    sun        the azimuth of a pixel's ray (the sun glitter / a shadow line -> astronomy-engine sun azimuth)
    prior      a prior on a lens parameter or a named scalar
Initial values: an SfM model (if given) mapped by a rough similarity, else the GPS fix, the compass heading and a level
camera; points are triangulated from the initial cameras (or ray x plane for one-view points).
Writes data/survey/market/cameras.json (the shared camera schema), data/survey/market/adjust-<cluster>.json (every
residual in natural units, the unknowns with 1-sigma from the inverse normal matrix) and returns the features to
tools/survey/market_features.py (points flagged "feature").
"""
import argparse
import json
import os
import sys

import cv2
import numpy as np
from scipy.optimize import least_squares
from scipy.sparse import lil_matrix
from scipy.spatial.transform import Rotation

sys.path.insert(0, os.path.dirname(__file__))
import slib  # noqa: E402

ROOT = slib.ROOT
FLIP = np.diag([1.0, -1.0, -1.0])


def bearing_deg(dx, dz):
    return np.degrees(np.arctan2(dx, -dz)) % 360


def wrap180(a):
    return (a + 180) % 360 - 180


def coast_range(C, d, coast):
    """Horizontal range from C along the bearing of d to the first crossing of the coast polyline [[x, z], ...] beyond
    50 m (None if it misses)."""
    h = np.hypot(d[0], d[2])
    ux, uz = d[0] / h, d[2] / h
    best = None
    for (ax, az), (bx, bz) in zip(coast[:-1], coast[1:]):
        ex, ez = bx - ax, bz - az
        den = ux * ez - uz * ex
        if abs(den) < 1e-12:
            continue
        t = ((ax - C[0]) * ez - (az - C[2]) * ex) / den
        s = ((ax - C[0]) * uz - (az - C[2]) * ux) / den
        if t > 50 and -1e-9 <= s <= 1 + 1e-9 and (best is None or t < best):
            best = t
    return best


def look_R(heading_deg, pitch_deg=0.0, roll_deg=0.0):
    """ENU -> COLMAP camera rotation for a camera with the given compass heading, tilt (+ up) and roll."""
    h, p = np.radians(heading_deg), np.radians(pitch_deg)
    fwd = np.array([np.sin(h) * np.cos(p), np.sin(p), -np.cos(h) * np.cos(p)])
    right = np.cross(fwd, [0, 1.0, 0])
    right /= np.linalg.norm(right)
    down = np.cross(fwd, right)
    R = np.stack([right, down, fwd])   # rows: camera x (right), y (down), z (forward) in ENU
    if roll_deg:
        R = Rotation.from_euler('z', roll_deg, degrees=True).as_matrix() @ R
    return R


class Problem:
    def __init__(self, cfg, name):
        self.cfg, self.name = cfg, name
        self.lenses = cfg['lenses']                 # lens -> {w, h, f, k1, k2, refine: [...], f_sigma}
        self.cams = cfg['cams']                     # photo -> {lens, ...}
        self.points = cfg['points']                 # name -> {obs: {photo: [u, v]}, feature: bool, ...}
        self.scalars = cfg.get('scalars', {})       # name -> {init, sigma (prior, optional)}
        cons = []
        for c in cfg.get('constraints', []):   # drop references to points that are gone (pruned ties)
            if 'points' in c:
                c = dict(c, points=[p for p in c['points'] if p in self.points])
            if any(c.get(key) is not None and c[key] not in self.points for key in ('p', 'a', 'b')):
                continue
            cons.append(c)
        self.cons = cons
        self.cam_ids = sorted(self.cams)
        self.pt_ids = list(self.points)
        self.lens_ids = sorted(self.lenses)
        self.sc_ids = sorted(self.scalars)
        # parameter layout
        self.idx = {}
        i = 0
        for k in self.cam_ids:
            self.idx[('cam', k)] = i
            i += 6
        for L in self.lens_ids:
            self.idx[('lens', L)] = i
            i += 3                                    # f, k1, k2
        for p in self.pt_ids:
            self.idx[('pt', p)] = i
            i += 3
        for s in self.sc_ids:
            self.idx[('sc', s)] = i
            i += 1
        self.n = i
        # observation table (vectorised residuals)
        rows = []
        for p in self.pt_ids:
            for k, uv in self.points[p].get('obs', {}).items():
                if k in self.cams:
                    rows.append((self.idx[('pt', p)], self.idx[('cam', k)], self.idx[('lens', self.cams[k]['lens'])], uv[0], uv[1],
                                 self.points[p].get('px', 1.5), self.lenses[self.cams[k]['lens']]['w'] / 2, self.lenses[self.cams[k]['lens']]['h'] / 2, p, k))
        self.obs_lab = [(r_[8], r_[9]) for r_ in rows]
        self.o_pt = np.array([r_[0] for r_ in rows], int).reshape(-1)
        self.o_cam = np.array([r_[1] for r_ in rows], int).reshape(-1)
        self.o_lens = np.array([r_[2] for r_ in rows], int).reshape(-1)
        self.o_uv = np.array([[r_[3], r_[4]] for r_ in rows], float).reshape(-1, 2)
        self.o_s = np.array([r_[5] for r_ in rows], float).reshape(-1)
        self.o_c = np.array([[r_[6], r_[7]] for r_ in rows], float).reshape(-1, 2)

    def obs_residuals(self, x):
        if not len(self.o_pt):
            return []
        P = np.stack([x[self.o_pt], x[self.o_pt + 1], x[self.o_pt + 2]], 1)
        rv = np.stack([x[self.o_cam], x[self.o_cam + 1], x[self.o_cam + 2]], 1)
        C = np.stack([x[self.o_cam + 3], x[self.o_cam + 4], x[self.o_cam + 5]], 1)
        R = Rotation.from_rotvec(rv).as_matrix()
        Xc = np.einsum('nij,nj->ni', R, P - C)
        z = Xc[:, 2]
        zmin = 0.3
        bad = z <= zmin
        zc = np.where(bad, zmin, z)
        a, b = Xc[:, 0] / zc, Xc[:, 1] / zc
        r2 = a * a + b * b
        f, k1, k2 = x[self.o_lens], x[self.o_lens + 1], x[self.o_lens + 2]
        d = 1 + k1 * r2 + k2 * r2 * r2
        u = f * a * d + self.o_c[:, 0]
        v = f * b * d + self.o_c[:, 1]
        # behind / at the camera: a smooth penalty that pushes the point in front (a constant would stall the solver)
        pen = (zmin - z) * 2000.0
        ru = np.where(bad, pen + 1e3, (u - self.o_uv[:, 0]) / self.o_s)
        rvv = np.where(bad, pen + 1e3, (v - self.o_uv[:, 1]) / self.o_s)
        return list(np.stack([ru, rvv], 1).reshape(-1))

    # ---- parameter access
    def cam(self, x, k):
        i = self.idx[('cam', k)]
        return Rotation.from_rotvec(x[i:i + 3]).as_matrix(), x[i + 3:i + 6]

    def lens(self, x, L):
        i = self.idx[('lens', L)]
        return x[i], x[i + 1], x[i + 2]

    def pt(self, x, p):
        i = self.idx[('pt', p)]
        return x[i:i + 3]

    def sc(self, x, s):
        return x[self.idx[('sc', s)]]

    def val(self, x, v):
        """A number or the name of a scalar."""
        return self.sc(x, v) if isinstance(v, str) else float(v)

    def project(self, x, k, X):
        R, C = self.cam(x, k)
        L = self.cams[k]['lens']
        f, k1, k2 = self.lens(x, L)
        lw = self.lenses[L]
        Xc = R @ (np.asarray(X) - C)
        if Xc[2] <= 1e-3:
            return np.array([1e4, 1e4]), Xc[2]
        a, b = Xc[0] / Xc[2], Xc[1] / Xc[2]
        r2 = a * a + b * b
        d = 1 + k1 * r2 + k2 * r2 * r2
        return np.array([f * a * d + lw['w'] / 2, f * b * d + lw['h'] / 2]), Xc[2]

    def ray(self, x, k, uv):
        R, C = self.cam(x, k)
        L = self.cams[k]['lens']
        f, k1, k2 = self.lens(x, L)
        lw = self.lenses[L]
        Kc = np.array([[f, 0, lw['w'] / 2], [0, f, lw['h'] / 2], [0, 0, 1.0]])
        n = cv2.undistortPoints(np.array(uv, float).reshape(1, 1, 2), Kc, np.array([k1, k2, 0, 0.0])).reshape(2)
        d = R.T @ np.array([n[0], n[1], 1.0])
        return C, d / np.linalg.norm(d)

    # ---- residuals
    def residuals(self, x, labels=False):
        r, lab = [], []

        def add(v, l):
            r.append(v)
            if labels:
                lab.append(l)
        r.extend(self.obs_residuals(x))
        if labels:
            for p, k in self.obs_lab:
                lab.append(('obs', p, k, 'u'))
                lab.append(('obs', p, k, 'v'))
        for c in self.cons:
            kind = c['kind']
            if kind == 'known':
                P = self.pt(x, c['p'])
                sg = c.get('sigma', [0.5, 0.5, 0.5])
                sg = sg if isinstance(sg, list) else [sg] * 3
                for ax in range(3):
                    if c['enu'][ax] is not None:
                        add((P[ax] - c['enu'][ax]) / sg[ax], ('known', c['p'], 'xyz'[ax]))
            elif kind == 'on_y':
                for p in c['points']:
                    add((self.pt(x, p)[1] - self.val(x, c['y']) - c.get('dy', 0.0)) / c.get('sigma', 0.05), ('on_y', p, str(c['y'])))   # [v6:fix2] dy: a height above the named surface (a licence plate 0.5 m above the deck)
            elif kind == 'on_line':
                a, b = np.asarray(c['line'][0], float), np.asarray(c['line'][1], float)
                u = (b - a) / np.linalg.norm(b - a)
                nrm = np.array([-u[1], u[0]])
                off = self.val(x, c.get('offset', 0.0))
                for p in c['points']:
                    P = self.pt(x, p)
                    add(((np.array([P[0], P[2]]) - a) @ nrm - off) / c.get('sigma', 0.5), ('on_line', p, c.get('name', ''), str(c.get('offset', 0.0))))
            elif kind == 'vertical':
                A, B = self.pt(x, c['a']), self.pt(x, c['b'])
                s = c.get('sigma', 0.03)
                add((A[0] - B[0]) / s, ('vertical', c['a'], c['b'], 'x'))
                add((A[2] - B[2]) / s, ('vertical', c['a'], c['b'], 'z'))
            elif kind == 'level':      # two points at the same height
                A, B = self.pt(x, c['a']), self.pt(x, c['b'])
                add((A[1] - B[1]) / c.get('sigma', 0.03), ('level', c['a'], c['b']))
            elif kind == 'dist':
                A, B = self.pt(x, c['a']), self.pt(x, c['b'])
                d = np.linalg.norm(A - B) if not c.get('horizontal') else np.hypot(A[0] - B[0], A[2] - B[2])
                add((d - c['L']) / c.get('sigma', 0.02), ('dist', c['a'], c['b']))
            elif kind == 'eye':
                for k in c['photos']:
                    if k in self.cams:
                        _, C = self.cam(x, k)
                        add((C[1] - self.val(x, c['y']) - c.get('h', 1.45)) / c.get('sigma', 0.12), ('eye', k))
            elif kind == 'gps':
                for k in c['photos']:
                    if k in self.cams and k in GPS:
                        _, C = self.cam(x, k)
                        s = c.get('sigma', 8.0)
                        add((C[0] - GPS[k][0]) / s, ('gps', k, 'x'))
                        add((C[2] - GPS[k][1]) / s, ('gps', k, 'z'))
            elif kind == 'colocated':       # two photos taken from one spot (seconds apart, turning on the spot)
                _, A = self.cam(x, c['a'])
                _, B = self.cam(x, c['b'])
                for ax in range(3):
                    add((A[ax] - B[ax]) / c.get('sigma', 0.3), ('colocated', c['a'], c['b'], 'xyz'[ax]))
            elif kind == 'sun':
                C, d = self.ray(x, c['img'], c['uv'])
                add(wrap180(bearing_deg(d[0], d[2]) - c['az']) / c.get('sigma_deg', 1.0), ('sun', c['img']))
            elif kind == 'far_water':
                # a far waterline pixel: its ray's horizontal bearing meets the far coast polyline at range D; the ray's
                # height there is the water level (T.P. y +- sigma, the tide). Fixes the pitch and, with a near object of
                # known size, the camera height (the dip of a waterline 600 m off is y_cam / 600 rad).
                for uv in c['uv']:
                    C, d = self.ray(x, c['img'], uv)
                    D = coast_range(C, d, c['coast']) or c.get('default_range', 600.0)   # a miss: the bay's typical width
                    h = np.hypot(d[0], d[2])
                    yw = C[1] + D * d[1] / h
                    add((yw - c.get('y', 0.0)) / c.get('sigma', 0.4), ('far_water', c['img']))
            elif kind == 'prior_lens':
                f, k1, k2 = self.lens(x, c['lens'])
                v = {'f': f, 'k1': k1, 'k2': k2}[c['param']]
                add((v - c['value']) / c['sigma'], ('prior_lens', c['lens'], c['param']))
            elif kind == 'prior_scalar':
                add((self.sc(x, c['name']) - c['value']) / c['sigma'], ('prior_scalar', c['name']))
            elif kind == 'roll':
                for k in c['photos']:
                    R, _ = self.cam(x, k)
                    right = R[0]          # camera x axis in ENU: level when right . up = 0
                    add(np.degrees(np.arcsin(np.clip(right[1], -1, 1))) / c.get('sigma_deg', 5.0), ('roll', k))
            else:
                raise SystemExit('unknown constraint ' + kind)
        # cameras held fixed (solved in another cluster): tie them hard to their initial pose
        for k in self.cam_ids:
            if self.cams[k].get('fixed') and getattr(self, 'x_fix', None) is not None:
                i = self.idx[('cam', k)]
                for j in range(6):
                    add((x[i + j] - self.x_fix[i + j]) / (1e-6 if j < 3 else 1e-4), ('fixcam', k))
        # fixed lens parameters: tie them hard to their initial values unless listed in refine
        for L in self.lens_ids:
            lw = self.lenses[L]
            f, k1, k2 = self.lens(x, L)
            ref = lw.get('refine', [])
            if 'f' not in ref:
                add((f - lw['f']) / 1e-3, ('fix', L, 'f'))
            elif lw.get('f_sigma'):
                add((f - lw['f']) / lw['f_sigma'], ('prior', L, 'f'))
            if 'k1' not in ref:
                add((k1 - lw.get('k1', 0.0)) / 1e-6, ('fix', L, 'k1'))
            if 'k2' not in ref:
                add((k2 - lw.get('k2', 0.0)) / 1e-6, ('fix', L, 'k2'))
        for s in self.sc_ids:
            if self.scalars[s].get('sigma'):
                add((self.sc(x, s) - self.scalars[s]['init']) / self.scalars[s]['sigma'], ('scalar-prior', s))
        return (np.array(r), lab) if labels else np.array(r)

    def sparsity(self):
        _, lab = self.residuals(self.x0, labels=True)
        S = lil_matrix((len(lab), self.n), dtype=int)

        def mark(row, key, n):
            i = self.idx[key]
            for j in range(n):
                S[row, i + j] = 1
        for row, l in enumerate(lab):
            t = l[0]
            if t == 'obs':
                mark(row, ('pt', l[1]), 3)
                mark(row, ('cam', l[2]), 6)
                mark(row, ('lens', self.cams[l[2]]['lens']), 3)
            elif t == 'known':
                mark(row, ('pt', l[1]), 3)
            elif t == 'on_line':
                mark(row, ('pt', l[1]), 3)
                if ('sc', l[3]) in self.idx:
                    mark(row, ('sc', l[3]), 1)
            elif t == 'on_y':
                mark(row, ('pt', l[1]), 3)
                if not l[2].replace('.', '', 1).replace('-', '', 1).isdigit() and ('sc', l[2]) in self.idx:
                    mark(row, ('sc', l[2]), 1)
            elif t in ('vertical', 'level', 'dist'):
                mark(row, ('pt', l[1]), 3)
                mark(row, ('pt', l[2]), 3)
            elif t == 'eye':
                mark(row, ('cam', l[1]), 6)
                for c in self.cons:
                    if c['kind'] == 'eye' and isinstance(c['y'], str):
                        mark(row, ('sc', c['y']), 1)
            elif t in ('gps', 'roll', 'fixcam'):
                mark(row, ('cam', l[1]), 6)
            elif t == 'colocated':
                mark(row, ('cam', l[1]), 6)
                mark(row, ('cam', l[2]), 6)
            elif t in ('sun', 'far_water'):
                mark(row, ('cam', l[1]), 6)
                mark(row, ('lens', self.cams[l[1]]['lens']), 3)
            elif t in ('fix', 'prior', 'prior_lens'):
                mark(row, ('lens', l[1]), 3)
            elif t in ('scalar-prior', 'prior_scalar'):
                mark(row, ('sc', l[1]), 1)
        return S

    # ---- initialisation
    def initial(self, init_cams):
        x = np.zeros(self.n)
        for k in self.cam_ids:
            R, C = init_cams[k]
            i = self.idx[('cam', k)]
            x[i:i + 3] = Rotation.from_matrix(R).as_rotvec()
            x[i + 3:i + 6] = C
        for L in self.lens_ids:
            i = self.idx[('lens', L)]
            lw = self.lenses[L]
            x[i:i + 3] = [lw['f'], lw.get('k1', 0.0), lw.get('k2', 0.0)]
        for s in self.sc_ids:
            x[self.idx[('sc', s)]] = self.scalars[s]['init']
        known = {c['p']: c['enu'] for c in self.cons if c['kind'] == 'known'}
        ony = {}
        for c in self.cons:
            if c['kind'] == 'on_y':
                for p in c['points']:
                    ony[p] = c['y']
        for p in self.pt_ids:
            i = self.idx[('pt', p)]
            obs = {k: v for k, v in self.points[p].get('obs', {}).items() if k in self.cams}
            X = None
            if self.points[p].get('init'):
                X = np.asarray(self.points[p]['init'], float)
            elif p in known and all(v is not None for v in known[p]):
                X = np.asarray(known[p], float)
            elif len(obs) >= 2:
                A, b = np.zeros((3, 3)), np.zeros(3)
                dirs = []
                for k, uv in obs.items():
                    C, d = self.ray(x, k, uv)
                    dirs.append(d)
                    M = np.eye(3) - np.outer(d, d)
                    A += M
                    b += M @ C
                ang = max(np.degrees(np.arccos(np.clip(dirs[i] @ dirs[j], -1, 1))) for i in range(len(dirs)) for j in range(i + 1, len(dirs)))
                try:
                    X = np.linalg.solve(A, b) if ang > 0.7 else None
                except np.linalg.LinAlgError:
                    X = None
                # a near-parallel or inconsistent pair lands behind a camera or kilometres away: fall back to a plane / a
                # default range along the first ray (the adjustment moves it)
                if X is not None and (any(self.project(np.r_[x], k, X)[1] <= 0.5 for k in obs) or max(np.linalg.norm(X - self.cam(x, k)[1]) for k in obs) > 400):
                    X = None
            if X is None and obs:
                k, uv = next(iter(obs.items()))
                C, d = self.ray(x, k, uv)
                yv = ony.get(p)
                yv = self.val(x, yv) if yv is not None else None
                t = (yv - C[1]) / d[1] if yv is not None and abs(d[1]) > 1e-3 and (yv - C[1]) / d[1] > 0 else self.points[p].get('range', self.cfg.get('default_range', 20.0))
                X = C + t * d
            if X is None:
                X = np.zeros(3)
            x[i:i + 3] = X
        self.x0 = x
        return x

    def solve(self, x0, iters=None, delta=3.0, verbose=False):
        iters = iters or int(os.environ.get('ADJ_ITERS', 150))
        """Levenberg-Marquardt with the Schur complement on the 3x3 point blocks (the standard bundle-adjustment solver),
        a sparse finite-difference Jacobian (grouped columns) and Huber IRLS weights (delta in sigma units)."""
        from scipy import sparse
        from scipy.optimize._numdiff import approx_derivative, group_columns
        self.x0 = x0
        S = sparse.csr_matrix(self.sparsity())
        groups = group_columns(S)
        ptm = np.zeros(self.n, bool)
        for p in self.pt_ids:
            i = self.idx[('pt', p)]
            ptm[i:i + 3] = True
        ci, pi = np.where(~ptm)[0], np.where(ptm)[0]
        npt = len(pi) // 3

        # the robust (Huber) loss applies to the image observations only: a hard reference (a GSI corner, a footprint
        # line, an eye height) keeps its full quadratic weight, so the photos cannot vote it down as an "outlier"
        nobs = 2 * len(self.o_pt)
        robust_mask = np.zeros(len(self.residuals(x0)), bool)
        robust_mask[:nobs] = True

        def rho(r):
            a = np.abs(r)
            h = np.where(a <= delta, 0.5 * r * r, delta * a - 0.5 * delta * delta)
            return np.where(robust_mask, h, 0.5 * r * r)

        x = np.array(x0, float)
        r = self.residuals(x)
        cost = rho(r).sum()
        lam = 1e-3
        it = 0
        status = 'max-iter'
        for it in range(iters):
            J = sparse.csr_matrix(approx_derivative(self.residuals, x, method='2-point', f0=r, sparsity=(S, groups)))
            a = np.abs(r)
            w = np.where(robust_mask & (a > delta), delta / np.maximum(a, 1e-12), 1.0)
            sw = np.sqrt(w)
            Jw = sparse.diags(sw) @ J
            rw = sw * r
            Jc, Jp = Jw[:, ci].tocsc(), Jw[:, pi].tocsc()
            U = (Jc.T @ Jc).toarray()
            W = (Jc.T @ Jp).tocsr()
            Vs = (Jp.T @ Jp).tocoo()
            V = np.zeros((npt, 3, 3))
            msk = (Vs.row // 3) == (Vs.col // 3)
            np.add.at(V, (Vs.row[msk] // 3, Vs.row[msk] % 3, Vs.col[msk] % 3), Vs.data[msk])
            gc, gp = Jc.T @ rw, Jp.T @ rw
            improved = False
            for _ in range(10):
                Ud = U + lam * np.diag(np.maximum(np.diag(U), 1e-9))
                Vd = V + lam * np.einsum('nii->ni', V)[:, :, None] * np.eye(3)[None] + 1e-9 * np.eye(3)[None]
                Vi = np.linalg.inv(Vd)
                Vib = sparse.block_diag(list(Vi), format='csr') if npt else sparse.csr_matrix((0, 0))
                WVi = W @ Vib
                Sc = Ud - (WVi @ W.T).toarray()
                b = -gc + WVi @ gp
                try:
                    dc = np.linalg.solve(Sc, b)
                except np.linalg.LinAlgError:
                    dc = np.linalg.lstsq(Sc, b, rcond=None)[0]
                dp = -(Vib @ (gp + W.T @ dc))
                dx = np.zeros(self.n)
                dx[ci], dx[pi] = dc, dp
                xn = x + dx
                rn = self.residuals(xn)
                cn = rho(rn).sum()
                if cn < cost:
                    rel = (cost - cn) / max(cost, 1e-12)
                    x, r, cost = xn, rn, cn
                    lam = max(lam / 4, 1e-9)
                    improved = True
                    break
                lam *= 8
            if verbose or os.environ.get('ADJ_VERBOSE'):
                print(f'      it {it}: cost {cost:.2f} lam {lam:.1e} |dx| {np.linalg.norm(dx):.3g}')
            if not improved:
                status = 'no-improvement'
                break
            if rel < 1e-9:
                status = 'converged'
                break
        J = sparse.csr_matrix(approx_derivative(self.residuals, x, method='2-point', f0=r, sparsity=(S, groups)))

        class Sol:
            pass
        sol = Sol()
        sol.x, sol.cost, sol.jac, sol.status, sol.nit = x, cost, J, status, it + 1
        return sol


GPS = {}


class Covariance:
    """(J^T J)^-1 blocks without forming the dense matrix: the camera / lens / scalar block by the Schur complement over
    the 3x3 point blocks, and any point block as V^-1 + V^-1 W^T S^-1 W V^-1."""
    def __init__(self, prob, J):
        from scipy import sparse
        J = sparse.csc_matrix(J)
        pt_cols = np.zeros(prob.n, bool)
        for p in prob.pt_ids:
            i = prob.idx[('pt', p)]
            pt_cols[i:i + 3] = True
        self.cidx = np.where(~pt_cols)[0]
        self.pos = {c: j for j, c in enumerate(self.cidx)}
        Jc, Jp = J[:, self.cidx], J[:, pt_cols]
        self.pidx = np.where(pt_cols)[0]
        self.ppos = {c: j for j, c in enumerate(self.pidx)}
        U = (Jc.T @ Jc).toarray()
        W = (Jc.T @ Jp).tocsc()
        V = (Jp.T @ Jp).tocsc()
        n3 = len(self.pidx) // 3
        Vinv = []
        for b in range(n3):
            blk = V[3 * b:3 * b + 3, 3 * b:3 * b + 3].toarray()
            try:
                Vinv.append(np.linalg.inv(blk))
            except np.linalg.LinAlgError:
                Vinv.append(np.linalg.pinv(blk))
        self.Vinv = Vinv
        Vi = sparse.block_diag(Vinv, format='csc')
        S = U - (W @ Vi @ W.T).toarray()
        self.Scc = np.linalg.pinv(S)
        self.W = W

    def param(self, i, n):
        j = [self.pos[i + k] for k in range(n)]
        return self.Scc[np.ix_(j, j)]

    def point(self, i):
        b = self.ppos[i] // 3
        Vi = self.Vinv[b]
        Wp = self.W[:, 3 * b:3 * b + 3].toarray()
        return Vi + Vi @ Wp.T @ self.Scc @ Wp @ Vi


def init_from_model(path, sim, cams_needed):
    """Cameras of an SfM model mapped to ENU by a similarity {yaw, scale, t, up (model gravity)}."""
    import pycolmap
    rec = pycolmap.Reconstruction(os.path.join(ROOT, path))
    if sim.get('auto'):
        # gravity = the mean image "up" of the upright portrait photos; yaw / scale / shift = a 2D Umeyama fit of the
        # centres to the GPS fixes (outliers excluded); height = the given eye height
        ups, Cs = {}, {}
        for im in rec.images.values():
            P = im.cam_from_world() if callable(im.cam_from_world) else im.cam_from_world
            R, t = P.rotation.matrix(), np.asarray(P.translation)
            k = slib.img_id(im.name)
            ups[k], Cs[k] = R.T @ np.array([0, -1.0, 0]), -R.T @ t
        up = np.mean(list(ups.values()), 0)
        Rg = slib.rot_between(up / np.linalg.norm(up), np.array([0, 1.0, 0]))
        ks = [k for k in Cs if k in GPS and k not in sim.get('gps_outliers', [])]
        src = np.array([(Rg @ Cs[k])[[0, 2]] for k in ks])
        dst = np.array([GPS[k] for k in ks])
        s2, R2, t2 = slib.umeyama2d(src, dst)
        s2 = sim.get('scale', s2)
        yaw = -np.degrees(np.arctan2(R2[1, 0], R2[0, 0]))
        Ry = Rotation.from_euler('y', yaw, degrees=True).as_matrix()
        Ce = {k: s2 * (Ry @ Rg @ C) for k, C in Cs.items()}
        off = np.mean([dst[i] - Ce[k][[0, 2]] for i, k in enumerate(ks)], 0)
        yoff = sim.get('eye_y', 0.0) - np.mean([c[1] for c in Ce.values()])
        sim = dict(sim, up=list(up), yaw=yaw, scale=s2, t=[off[0], yoff, off[1]])
        print(f'   init similarity: yaw {yaw:.1f} deg, scale {s2:.3f}, t {np.round(sim["t"], 1)}')
    up = np.asarray(sim['up'], float)
    up /= np.linalg.norm(up)
    Rg = slib.rot_between(up, np.array([0, 1.0, 0]))
    Ry = Rotation.from_euler('y', sim.get('yaw', 0.0), degrees=True).as_matrix()
    Rs = Ry @ Rg
    out = {}
    for im in rec.images.values():
        k = slib.img_id(im.name)
        if k not in cams_needed:
            continue
        P = im.cam_from_world() if callable(im.cam_from_world) else im.cam_from_world
        R, t = P.rotation.matrix(), np.asarray(P.translation)
        C = -R.T @ t
        Ce = sim['scale'] * (Rs @ C) + np.asarray(sim['t'], float)
        out[k] = (R @ Rs.T, Ce)
    return out


def camera_record(prob, x, k, cluster, cov_cam=None):
    R, C = prob.cam(x, k)
    L = prob.cams[k]['lens']
    f, k1, k2 = prob.lens(x, L)
    lw = prob.lenses[L]
    Rc2w = R.T
    R3 = Rc2w @ FLIP
    q = Rotation.from_matrix(R3).as_quat()
    yaw, pitch, roll = Rotation.from_matrix(R3).as_euler('YXZ', degrees=True)
    fwd = Rc2w @ np.array([0, 0, 1.0])
    meta = slib.photo_index().get(k, {})
    rec = dict(id=k, image=os.path.join('raw/survey/market/images', lw['dir'], k + '.jpg'), camera_model='OPENCV', lens=L,
               width=lw['w'], height=lw['h'], fx=float(f), fy=float(f), cx=lw['w'] / 2, cy=lw['h'] / 2, dist=[float(k1), float(k2), 0.0, 0.0],
               position=[round(float(v), 4) for v in C], quaternion=[float(v) for v in q], yaw=float(yaw), pitch=float(pitch), roll=float(roll),
               heading=round(float(bearing_deg(fwd[0], fwd[2])), 3), tilt=round(float(np.degrees(np.arcsin(fwd[1]))), 3),
               cluster=cluster, registered=True, method='survey adjustment (picks + hard references), initialised from SfM' if prob.cams[k].get('sfm') else 'survey adjustment (picks + hard references)',
               time=meta.get('time'), f35=meta.get('f35'), gps=[round(float(v), 2) for v in GPS[k]] if k in GPS else None, gps_alt=meta.get('alt'),
               R_w2c=[[float(v) for v in row] for row in R.tolist()])
    if cov_cam is not None:
        rec['sigma'] = dict(rot_deg=[round(float(np.degrees(np.sqrt(max(v, 0)))), 4) for v in np.diag(cov_cam)[:3]],
                            pos_m=[round(float(np.sqrt(max(v, 0))), 3) for v in np.diag(cov_cam)[3:6]])
    return rec


def load_ties(src, photos):
    """Automatic tie points from a COLMAP database: the verified (two-view geometry) inlier matches of every photo pair,
    chained into multi-view tracks (union-find on (photo, keypoint)); tracks that hit one photo twice are dropped.
    -> {name: {obs: {photo: [u, v]}, feature: False, px: sigma}}"""
    import sqlite3
    db = sqlite3.connect(os.path.join(ROOT, src['db']))
    names = {i: slib.img_id(n) for i, n in db.execute('select image_id, name from images')}
    want = {i for i, k in names.items() if k in photos}
    kps = {}
    for i in want:
        r, c, b = db.execute('select rows, cols, data from keypoints where image_id=?', (i,)).fetchone()
        kps[i] = np.frombuffer(b, np.float32).reshape(r, c)[:, :2]
    parent = {}

    def find(a):
        while parent.setdefault(a, a) != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    npairs = 0
    for pid, r, c, blob in db.execute('select pair_id, rows, cols, data from two_view_geometries where rows > 0'):
        i2 = pid % 2147483647
        i1 = (pid - i2) // 2147483647
        if src.get('photos') and not (names[i1] in src['photos'] and names[i2] in src['photos']):
            continue
        if i1 not in want or i2 not in want or r < src.get('min_inliers', 15):
            continue
        m = np.frombuffer(blob, np.uint32).reshape(r, c)
        if src.get('max_per_pair') and len(m) > src['max_per_pair']:
            m = m[np.linspace(0, len(m) - 1, src['max_per_pair']).astype(int)]
        npairs += 1
        for a, b in m:
            ra, rb = find((i1, int(a))), find((i2, int(b)))
            if ra != rb:
                parent[ra] = rb
    tracks = {}
    for node in list(parent):
        tracks.setdefault(find(node), []).append(node)
    out = {}
    tag = src.get('tag', os.path.basename(src['db']).split('.')[0])
    n = 0
    for root, nodes in tracks.items():
        imgs = [i for i, _ in nodes]
        if len(nodes) < 2 or len(set(imgs)) != len(imgs):
            continue
        # exclude: {photo: [[x0, y0, x1, y1], ...]} image boxes of moving things (boats, water, the truck, people):
        # a track with any observation inside one is dropped (movers bend the structure)
        ex = src.get('exclude', {})
        if any(x0 <= kps[i][j][0] <= x1 and y0 <= kps[i][j][1] <= y1 for i, j in nodes for (x0, y0, x1, y1) in ex.get(names[i], [])):
            continue
        out[f'tie:{tag}:{n}'] = dict(obs={names[i]: [float(kps[i][j][0]), float(kps[i][j][1])] for i, j in nodes}, feature=False, px=src.get('px', 1.5))
        n += 1
    print(f'   ties from {src["db"]}: {npairs} pairs -> {n} tracks (lengths: ' + ', '.join(f'{L}:{sum(1 for v in out.values() if len(v["obs"]) == L)}' for L in range(2, 8)) + ')')
    return out


def constrained_points(cl):
    """Names of points that carry a constraint (they stay even with a single observation)."""
    out = set()
    for c in cl.get('constraints', []):
        for key in ('p', 'a', 'b'):
            if key in c:
                out.add(c[key])
        out.update(c.get('points', []))
    return out


def pnp_init(prob, x, k, min_pts=8):
    """Pose of photo k from the points already placed by the other photos (RANSAC PnP through the lens model)."""
    L = prob.cams[k]['lens']
    f, k1, k2 = prob.lens(x, L)
    lw = prob.lenses[L]
    K = np.array([[f, 0, lw['w'] / 2], [0, f, lw['h'] / 2], [0, 0, 1.0]])
    obj, img = [], []
    for p in prob.pt_ids:
        obs = prob.points[p].get('obs', {})
        if k in obs and sum(1 for q in obs if q in prob.cams and q != k) >= 1:
            obj.append(prob.pt(x, p))
            img.append(obs[k])
    if len(obj) < min_pts:
        return None
    ok, rvec, tvec, inl = cv2.solvePnPRansac(np.array(obj, float), np.array(img, float), K, np.array([k1, k2, 0, 0.0]),
                                            reprojectionError=12.0, iterationsCount=5000, flags=cv2.SOLVEPNP_EPNP)
    if not ok or inl is None or len(inl) < min_pts:
        return None
    rvec, tvec = cv2.solvePnPRefineLM(np.array(obj, float)[inl.ravel()], np.array(img, float)[inl.ravel()], K, np.array([k1, k2, 0, 0.0]), rvec, tvec)
    R = cv2.Rodrigues(rvec)[0]
    print(f'   PnP {k}: {len(inl)} / {len(obj)} inliers')
    return R, -R.T @ tvec.ravel()


def run_cluster(name, cl, report=False):
    cl = dict(cl)
    if cl.get('from_cluster'):
        rp = json.load(open(os.path.join(ROOT, f"data/survey/market/adjust-{cl['from_cluster']}.json")))
        cl['lenses'] = {L: dict(v, f=rp['lenses'][L]['f'], k1=rp['lenses'][L]['k1'], k2=rp['lenses'][L]['k2'], refine=[]) for L, v in cl['lenses'].items()}
        cl['scalars'] = {s_: dict(v, init=rp['scalars'][s_]['value'], sigma=1e-4) if v.get('fixed') else v for s_, v in cl.get('scalars', {}).items()}
    cl['points'] = dict(cl.get('points', {}))
    late_ties = {}
    for src in cl.get('ties', []):
        # ties_late: the automatic ties join only after stage 1 (cameras solved from the picks and references), so they are
        # triangulated from solved cameras instead of being pruned against a guess (the quay frames' parallax is 100s of px)
        (late_ties if cl.get('ties_late') else cl['points']).update(load_ties(src, set(cl['cams'])))
    # region-selected tie points: {kind: on_y_sel | on_line_sel, select: [{img, poly}], ...} -> on_y / on_line over the ties
    # whose observation in img falls inside poly (the deck floor, a wall face)
    cons, sel_cons = [], []
    for c in cl.get('constraints', []):
        if c['kind'] in ('on_y_sel', 'on_line_sel'):
            names = []
            for sel in c['select']:
                cnt = np.asarray(sel['poly'], np.float32).reshape(-1, 1, 2)
                for pn, d in cl['points'].items():
                    uv = d.get('obs', {}).get(sel['img'])
                    if uv is not None and pn.startswith('tie:') and cv2.pointPolygonTest(cnt, (float(uv[0]), float(uv[1])), False) >= 0:
                        names.append(pn)
            names = sorted(set(names))
            c2 = {k: v for k, v in c.items() if k != 'select'}
            c2['kind'] = c['kind'][:-4]
            c2['points'] = names
            c2['deferred'] = True        # imposed after stage 1, on the RANSAC-plane inliers only
            print(f"   {c['kind']} {c.get('name', '')}: {len(names)} tie points")
            sel_cons.append(c2)
        else:
            cons.append(c)
    cl['constraints'] = cons
    keep = constrained_points(cl) - {p for c in cons if c['kind'] in ('on_y', 'on_line') for p in c.get('points', []) if p.startswith('tie:')}
    # 1. initial cameras: the SfM model (mapped by a rough similarity) or GPS + compass; PnP for photos without a model pose
    prob = Problem(cl, name)
    need = set(prob.cam_ids)
    init = {}
    if cl.get('init_model'):
        init.update(init_from_model(cl['init_model']['path'], cl['init_model'], need))
    late = []
    solved = {}
    sp = os.path.join(ROOT, 'data/survey/market/cameras.json')
    if os.path.exists(sp):
        solved = {c['id']: c for c in json.load(open(sp))['cameras']}
    for k in prob.cam_ids:
        if prob.cams[k].get('fixed'):
            c = solved[k]
            init[k] = (np.array(c['R_w2c']), np.array(c['position']))
    for k in prob.cam_ids:
        if k in init and not prob.cams[k].get('reinit'):
            if not prob.cams[k].get('fixed'):
                prob.cams[k]['sfm'] = True
            continue
        c = prob.cams[k]
        p = dict(c.get('init', {}))
        if c.get('rel_init'):
            ri = c['rel_init']
            Cr = init[ri['ref']][1] if ri['ref'] in init else np.array(solved[ri['ref']]['position'])
            b = np.radians(ri.get('bearing', 0.0))
            p.update(x=Cr[0] + ri.get('dist', 0.0) * np.sin(b), z=Cr[2] - ri.get('dist', 0.0) * np.cos(b))
        C = np.array([p['x'], p['y'], p['z']], float) if 'x' in p else np.array([GPS[k][0], p.get('y', 0.0), GPS[k][1]])
        init[k] = (look_R(p.get('heading', 0.0), p.get('pitch', 0.0), p.get('roll', 0.0)), C)
        if c.get('pnp', True):
            late.append(k)
    x = prob.initial(init)
    prob.x_fix = x.copy()

    def rebuild(points, x_old, prob_old):
        """A new Problem over `points`, carrying the values of x_old over by name."""
        cl2 = dict(cl, points=points)
        pr = Problem(cl2, name)
        for k in pr.cam_ids:
            if prob_old.cams[k].get('sfm'):
                pr.cams[k]['sfm'] = True
        xn = np.zeros(pr.n)
        for key, i in pr.idx.items():
            j = prob_old.idx.get(key)
            w = {'cam': 6, 'lens': 3, 'pt': 3, 'sc': 1}[key[0]]
            if j is not None:
                xn[i:i + w] = x_old[j:j + w]
        pr.x0 = xn
        pr.x_fix = None
        if getattr(prob_old, 'x_fix', None) is not None:
            pr.x_fix = np.zeros(pr.n)
            for key, i in pr.idx.items():
                j = prob_old.idx.get(key)
                if j is not None and key[0] == 'cam':
                    pr.x_fix[i:i + 6] = prob_old.x_fix[j:j + 6]
        return pr, xn

    def prune(pr, xx, thr_px, active=None):
        """Drop observations with a reprojection error above thr_px (and points left with < 2 views and no constraint)."""
        r = np.array(pr.obs_residuals(xx)).reshape(-1, 2) * pr.o_s[:, None]
        e = np.hypot(r[:, 0], r[:, 1])
        # only automatic ties are pruned: a manual pick with a large residual is reported, never deleted
        bad = {(p, k) for (p, k), v in zip(pr.obs_lab, e) if v > thr_px and p.startswith('tie:') and (active is None or k in active)}
        pts = {}
        for p, d in pr.points.items():
            obs = {k: v for k, v in d.get('obs', {}).items() if (p, k) not in bad}
            if len([k for k in obs if k in pr.cams]) >= 2 or p in keep:
                pts[p] = dict(d, obs=obs)
        return pts, len(bad)

    # 2. without the late photos: prune the gross outliers of the model photos (movers, mismatches), solve
    active = [k for k in prob.cam_ids if k not in late]
    pts, nb = prune(prob, x, 25.0, set(active))
    hold = {}
    for p, d in pts.items():          # the late photos' observations wait until those photos are placed
        lo = {k: v for k, v in d['obs'].items() if k in late}
        if lo:
            hold[p] = lo
            d['obs'] = {k: v for k, v in d['obs'].items() if k not in late}
    pts = {p: d for p, d in pts.items() if len(d['obs']) >= 2 or p in keep}
    prob, x = rebuild(pts, x, prob)
    print(f'== {name}: stage 1 (photos {active}): {len(prob.pt_ids)} points, dropped {nb} observations > 25 px')
    if cl.get('lens_first_fixed', True):
        saved = {L: list(prob.lenses[L].get('refine', [])) for L in prob.lens_ids}
        for L in prob.lens_ids:
            prob.lenses[L]['refine'] = []
        sol = prob.solve(x)
        x = sol.x
        print(f'   stage 1a (lenses fixed): cost {sol.cost:.1f}, {sol.status}')
        for L in prob.lens_ids:
            prob.lenses[L]['refine'] = saved[L]
    sol = prob.solve(x)
    x = sol.x
    print(f'   stage 1: cost {sol.cost:.1f}, {sol.status}')
    # 2b. the region-selected ties: keep the RANSAC-plane inliers of the stage-1 positions, then impose the constraint
    if sel_cons:
        Cs = np.array([prob.cam(x, k)[1] for k in active])
        for c in sel_cons:
            names = [p for p in c['points'] if p in prob.points]

            def tri_angle(pn):
                X = prob.pt(x, pn)
                ds = [X - prob.cam(x, k)[1] for k in prob.points[pn]['obs'] if k in prob.cams]
                ds = [d / np.linalg.norm(d) for d in ds]
                return max([np.degrees(np.arccos(np.clip(ds[i] @ ds[j], -1, 1))) for i in range(len(ds)) for j in range(i + 1, len(ds))] or [0])
            # a tie seen only from (nearly) one spot (IMG_0792 / 0793 were shot from the same place) has no depth: leave it out
            names = [p for p in names if tri_angle(p) >= c.get('min_angle', 2.0)]
            if len(names) < 8:
                print(f"   {c['kind']} {c.get('name', '')}: only {len(names)} well-triangulated ties, skipped")
                continue
            P = np.array([prob.pt(x, p) for p in names])
            med = np.median(np.min(np.linalg.norm(P[:, None, :] - Cs[None], axis=2), axis=1))
            thr = c.get('ransac', 0.006) * med
            n_, d_, inl = slib.ransac_plane(P, thresh=thr, iters=4000)
            c['points'] = [p for p, ok in zip(names, inl) if ok]
            print(f"   {c['kind']} {c.get('name', '')}: {len(c['points'])} / {len(names)} on the RANSAC plane (thr {thr:.3f} model units)")
            cl['constraints'].append(c)
            keep.update(c['points'])
        prob, x = rebuild(prob.points, x, prob)
        sol = prob.solve(x)
        x = sol.x
        print(f'   stage 1b with the selected planes: cost {sol.cost:.1f}')
    # 3. the late photos by PnP on the placed points, then everything together
    dropped = []
    for k in late:
        pts2 = {p: dict(d, obs=dict(d['obs'], **({k: hold[p][k]} if p in hold and k in hold[p] else {}))) for p, d in prob.points.items()}
        pr2, x2 = rebuild(pts2, x, prob)
        got = pnp_init(pr2, x2, k)
        if got is not None:
            i = prob.idx[('cam', k)]
            x[i:i + 3] = Rotation.from_matrix(got[0]).as_rotvec()
            x[i + 3:i + 6] = got[1]
        else:
            print(f'   {k}: too few placed points for PnP -> left out (unregistered)')
            dropped.append(k)
    if dropped:
        cl['cams'] = {k: v for k, v in cl['cams'].items() if k not in dropped}
        for c in cl['constraints']:
            if 'photos' in c:
                c['photos'] = [k for k in c['photos'] if k not in dropped]
        for d in cl['points'].values():
            d['obs'] = {k: v for k, v in d.get('obs', {}).items() if k not in dropped}
    allpts = {}
    for p, d in list(cl['points'].items()) + list(late_ties.items()):
        allpts[p] = dict(d)
    prob, x = rebuild({p: d for p, d in allpts.items() if p in prob.points or p in hold or p in keep or len(d.get('obs', {})) >= 2}, x, prob)
    # points that were not placed yet (held / new): triangulate from the current cameras
    xi = prob.initial({k: prob.cam(x, k) for k in prob.cam_ids})
    for p in prob.pt_ids:
        i = prob.idx[('pt', p)]
        if not np.any(x[i:i + 3]):
            x[i:i + 3] = xi[i:i + 3]
    for thr in (25.0, 8.0, 5.0):
        pts, nb = prune(prob, x, thr)
        prob, x = rebuild(pts, x, prob)
        sol = prob.solve(x)
        x = sol.x
        print(f'   pass (prune > {thr} px: {nb} observations): {len(prob.pt_ids)} points, cost {sol.cost:.1f}, status {sol.status}')
    r, lab = prob.residuals(x, labels=True)
    print(f'   final cost {sol.cost:.2f} (robust), chi2/n {r @ r / len(r):.3f}, status {sol.status}')
    # covariance (Gauss-Newton, residuals in sigma units) by the Schur complement on the points
    cov = Covariance(prob, sol.jac)
    # natural-unit residual report
    rep = dict(cluster=name, photos=prob.cam_ids, n_points=len(prob.pt_ids), cost=float(sol.cost), chi2_per_residual=float(r @ r / len(r)))
    obs_px = {}
    for v, l in zip(r, lab):
        if l[0] == 'obs':
            s = prob.points[l[1]].get('px', 1.5)
            obs_px.setdefault(l[2], []).append(v * s)
    rep['reproj_px'] = {k: dict(n=len(v) // 2, rms=round(float(np.sqrt(np.mean(np.square(v)))), 2),
                                mean=round(float(np.mean(np.hypot(np.array(v[0::2]), np.array(v[1::2])))), 2)) for k, v in obs_px.items()}
    allv = np.concatenate([np.array(v) for v in obs_px.values()]) if obs_px else np.zeros(2)
    rep['reproj_mean_px'] = round(float(np.mean(np.hypot(allv[0::2], allv[1::2]))), 3)
    worst = sorted(((abs(v), l) for v, l in zip(r, lab) if l[0] not in ('fix',)), key=lambda t: -t[0])[:25]
    rep['worst'] = [dict(sigma_units=round(float(v), 2), what=list(map(str, l))) for v, l in worst]
    cons = {}
    for v, l in zip(r, lab):
        if l[0] not in ('obs', 'fix'):
            cons.setdefault(l[0], []).append(round(float(v), 3))
    rep['constraints_sigma_units'] = cons
    rep['lenses'] = {L: dict(zip(('f', 'k1', 'k2'), [round(float(v), 6) for v in prob.lens(x, L)])) for L in prob.lens_ids}
    rep['scalars'] = {s: dict(value=round(float(prob.sc(x, s)), 4), sigma=round(float(np.sqrt(max(cov.param(prob.idx[('sc', s)], 1)[0, 0], 0))), 4)) for s in prob.sc_ids}
    cams = []
    for k in prob.cam_ids:
        if prob.cams[k].get('fixed'):
            continue
        i = prob.idx[('cam', k)]
        cams.append(camera_record(prob, x, k, name, cov.param(i, 6)))
    pts = {}
    for p in prob.pt_ids:
        if p.startswith('tie:'):
            continue
        i = prob.idx[('pt', p)]
        P = prob.pt(x, p)
        sg = np.sqrt(np.clip(np.diag(cov.point(i)), 0, None))
        res = {}
        for k, uv in prob.points[p].get('obs', {}).items():
            if k in prob.cams:
                q, _ = prob.project(x, k, P)
                res[k] = round(float(np.hypot(q[0] - uv[0], q[1] - uv[1])), 2)
        pts[p] = dict(enu=[round(float(v), 3) for v in P], sigma=[round(float(v), 3) for v in sg], res_px=res,
                      feature=prob.points[p].get('feature', True), note=prob.points[p].get('note'))
    rep['points'] = pts
    rep['cameras'] = {c['id']: dict(position=c['position'], heading=c['heading'], tilt=c['tilt'], roll=round(c['roll'], 3), sigma=c.get('sigma'), gps=c['gps']) for c in cams}
    return prob, x, cams, rep


def merge_ply():
    """raw/survey/market/points.ply = every cluster's points-<cluster>.ply (xyz float32 + rgb uint8, binary)."""
    import glob
    xyz, rgb = [], []
    for f in sorted(glob.glob(os.path.join(ROOT, 'raw/survey/market/points-*.ply'))):
        b = open(f, 'rb').read()
        i = b.index(b'end_header\n') + len(b'end_header\n')
        n = int([l for l in b[:i].decode().split('\n') if l.startswith('element vertex')][0].split()[-1])
        a = np.frombuffer(b[i:], dtype=[('x', 'f4'), ('y', 'f4'), ('z', 'f4'), ('r', 'u1'), ('g', 'u1'), ('b', 'u1')], count=n)
        xyz.append(np.stack([a['x'], a['y'], a['z']], 1))
        rgb.append(np.stack([a['r'], a['g'], a['b']], 1))
    if xyz:
        slib.write_ply(os.path.join(ROOT, 'raw/survey/market/points.ply'), np.concatenate(xyz), np.concatenate(rgb))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cfg', default='data/survey/market/adjust.json')
    ap.add_argument('--only', default=None)
    ap.add_argument('--dry', action='store_true')
    a = ap.parse_args()
    cfg = json.load(open(os.path.join(ROOT, a.cfg)))
    for k, v in slib.photo_index().items():
        if v.get('lat'):
            GPS[k] = slib.enu(v['lat'], v['lon'])
    cam_path = os.path.join(ROOT, 'data/survey/market/cameras.json')
    old = json.load(open(cam_path))['cameras'] if os.path.exists(cam_path) else []
    allcams = [c for c in old if a.only and c.get('cluster') != a.only] if a.only else []
    for name, cl in cfg['clusters'].items():
        if a.only and name != a.only:
            continue
        prob, x, cams, rep = run_cluster(name, cl)
        print(json.dumps({k: rep[k] for k in ('reproj_mean_px', 'reproj_px', 'lenses', 'scalars', 'chi2_per_residual')}, ensure_ascii=False))
        for c in rep['cameras'].items():
            print('  ', c)
        print('   worst:')
        for w in rep['worst'][:12]:
            print('     ', w)
        if a.dry:
            continue
        # sparse ENU points of this cluster (ties and picks) -> raw/survey/market/points-<cluster>.ply (points.ply = all)
        P = np.array([prob.pt(x, p_) for p_ in prob.pt_ids]).reshape(-1, 3)
        rgb = np.array([[0, 200, 255] if p_.startswith('tie:') else [255, 80, 0] for p_ in prob.pt_ids], np.uint8).reshape(-1, 3)
        slib.write_ply(os.path.join(ROOT, f'raw/survey/market/points-{name}.ply'), P, rgb)
        ids = {c['id'] for c in cams}
        allcams = [c for c in allcams if c['id'] not in ids] + cams
        json.dump(rep, open(os.path.join(ROOT, f'data/survey/market/adjust-{name}.json'), 'w'), indent=1, ensure_ascii=False)
    if not a.dry:
        doc = dict(note='Solved market cameras (tools/survey/market_adjust.py: a bundle adjustment of hand-picked tie points with the hard references, in ENU: '
                   'x east, y T.P. up, z south). quaternion = three.js camera -> ENU [x, y, z, w]; yaw / pitch / roll = three.js Euler YXZ (deg); '
                   'R_w2c = ENU -> COLMAP camera; heading / tilt of the optical axis. Intrinsics in the full-resolution upright JPEG pixels (COLMAP conventions, '
                   'principal point at the image centre, OPENCV k1 k2).', area='market', cameras=sorted(allcams, key=lambda c: c['id']))
        json.dump(doc, open(cam_path, 'w'), indent=1)
        print('wrote', cam_path)
        merge_ply()


if __name__ == '__main__':
    main()
