"""Survey step 1c/2: incremental, station-aware structure from motion directly in ENU, seeded by COLMAP.

  raw/survey/.venv/bin/python tools/survey/sfm_enu.py --area minami [--db raw/survey/minami/lg.db]
        [--seed raw/survey/minami/sparse_lg/0] [--refs data/survey/minami/refs.json] [--out raw/survey/minami/enu]

Why: the south shore was photographed from ~12 standing spots, turning on the spot (IMG_0803-0813 in 20 s, 0825-0832 in 14 s).
Shots from one spot share a centre (no baseline); COLMAP's incremental mapper cannot start from or triangulate such pairs
and splits the set into fragments. This solver:

  1. tracks: union-find over COLMAP's verified inlier matches (lg.db: ALIKED + LightGlue, geometric_verifier); a track
     holding two keypoints of one image keeps them only when they are the same point (<= 4 px, the two feature levels),
     otherwise the track is dropped.
  2. seed: the largest COLMAP model (or GPS + compass when none), moved into ENU by a robust similarity (Umeyama on the
     camera centres vs the GPS fixes, vertical from the DEM + a 1.45 m eye).
  3. grow: repeatedly
       - PnP (RANSAC, then refined) for every unregistered photo with >= 12 2D-3D inliers to triangulated points;
       - station registration: a photo shot <= 6 s from a registered photo of the same spot, with >= 30 matches to it,
         takes that photo's centre and the rotation that maps its rays onto the mate's (Kabsch, RANSAC): the panorama
         link, exact for a camera turned on the spot;
       - triangulation of every track seen by >= 2 registered photos (rays >= 1 deg apart, positive depth, <= 4 px);
       - a bundle adjustment.
  4. bundle adjustment (scipy least_squares, Huber 2 px, sparse finite-difference Jacobian): per photo rotation + centre,
     per lens f, k1, k2 (+ p1, p2 for OPENCV), per point x y z, with priors:
       - GPS: horizontal fix, sigma 6 m (robust: Huber at 2 sigma);
       - eye: centre height = DEM(x, z) + 1.45 m, sigma 0.4 m (people hold phones at 1.2-1.6 m; the plaza is flat);
       - station: shots <= 6 s apart within 3 m by GPS stand together, sigma 0.35 m;
       - points seen only from one spot (no parallax) get a weak depth prior (their initial depth, sigma 50 %) so they
         still fix the rotations without wandering;
       - optional hard references (--refs): ground patches at a known T.P., vertical facade points on a GSI / OSM
         footprint line, known lengths (tools/survey/refs: see data/survey/<area>/refs.json).
Writes <out>/{cameras,images,points3D}.txt (a COLMAP text model in ENU metres), <out>/solve.json (registration, per-photo
reprojection, priors' residuals) and <out>/tracks.npz (the tracks, for the feature picks).
"""
import argparse
import collections
import json
import os
import sqlite3
import sys
import time

import cv2
import numpy as np
from scipy.optimize import least_squares
from scipy.sparse import lil_matrix
from scipy.spatial.transform import Rotation

sys.path.insert(0, os.path.dirname(__file__))
import slib  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument('--area', default='minami')
ap.add_argument('--db', default=None)
ap.add_argument('--seed', default=None, help='COLMAP model dir to seed from (default: the largest under sparse_lg/)')
ap.add_argument('--refs', default=None)
ap.add_argument('--out', default=None)
ap.add_argument('--min-inliers', type=int, default=15)
ap.add_argument('--gps-sigma', type=float, default=6.0)
ap.add_argument('--eye', type=float, default=1.45)
ap.add_argument('--eye-sigma', type=float, default=0.4)
ap.add_argument('--station-gap', type=float, default=6.0)
ap.add_argument('--station-sigma', type=float, default=0.35)
ap.add_argument('--huber', type=float, default=2.0)
ap.add_argument('--max-err', type=float, default=4.0)
ap.add_argument('--min-angle', type=float, default=1.0)
ap.add_argument('--rounds', type=int, default=8)
ap.add_argument('--nfev', type=int, default=60)
ap.add_argument('--final-nfev', type=int, default=200)
ap.add_argument('--exclude', default='')
ap.add_argument('--global', dest='glob', type=int, default=1, help='rotation averaging + linear known-rotation SfM for the initial poses')
ap.add_argument('--rot-sigma', type=float, default=2.0, help='deg: prior on the rotation-averaging result in the BA')
ap.add_argument('--weak-pts', type=int, default=1)
ap.add_argument('--refine-pp', type=int, default=0, help='also refine the principal point of the lenses')
a = ap.parse_args()
A = a.area
RAW = os.path.join(slib.ROOT, 'raw/survey', A)
DB = a.db or os.path.join(RAW, 'lg.db')
OUT = a.out or os.path.join(RAW, 'enu')
os.makedirs(OUT, exist_ok=True)
T0 = time.time()
LOG = open(os.path.join(OUT, 'solve.log'), 'w')


def log(*s):
    msg = f'[{time.time() - T0:6.1f}s] ' + ' '.join(str(x) for x in s)
    print(msg, flush=True)
    LOG.write(msg + '\n')
    LOG.flush()


# ------------------------------------------------------------------------------------------------ data
con = sqlite3.connect(DB)
MODELS = {2: 'SIMPLE_RADIAL', 3: 'RADIAL', 4: 'OPENCV', 6: 'FULL_OPENCV', 0: 'SIMPLE_PINHOLE', 1: 'PINHOLE'}
cams = {}
for cid, model, w, h, params, _ in con.execute('select camera_id, model, width, height, params, prior_focal_length from cameras'):
    p = np.frombuffer(params, np.float64).copy()
    m = MODELS[model]
    if m == 'OPENCV':
        intr = np.array([0.5 * (p[0] + p[1]), p[4], p[5], p[6], p[7]])
        pp = p[2:4].copy()
    else:
        intr = np.array([p[0], p[3], p[4]])
        pp = p[1:3].copy()
    cams[cid] = dict(model=m, w=w, h=h, intr=intr, pp=pp, f0=float(intr[0]))
excl = {('IMG_' + s.strip().replace('IMG_', '')) for s in a.exclude.split(',') if s.strip()}
images = {}
for iid, name, cid in con.execute('select image_id, name, camera_id from images'):
    if slib.img_id(name) in excl:
        continue
    images[iid] = dict(name=name, id=slib.img_id(name), cam=cid)
kps = {}
for iid, rows, cols, data in con.execute('select image_id, rows, cols, data from keypoints'):
    if iid in images:
        kps[iid] = np.frombuffer(data, np.float32).reshape(rows, cols)[:, :2].astype(np.float64)
M = 2147483647
pairs = []
for pid, rows, cols, data, config in con.execute('select pair_id, rows, cols, data, config from two_view_geometries where rows >= ?', (a.min_inliers,)):
    j = pid % M
    i = (pid - j) // M
    if i in images and j in images:
        pairs.append((i, j, np.frombuffer(data, np.uint32).reshape(rows, 2).astype(np.int64), config))
log(f'{len(images)} images, {len(pairs)} verified pairs (>= {a.min_inliers} inliers) from {os.path.relpath(DB, slib.ROOT)}')
idx = slib.photo_index()
byid = {im['id']: iid for iid, im in images.items()}
meta = {iid: idx[im['id']] for iid, im in images.items()}


def secs(t):
    d, c = t.split(' ')
    hh, mm, ss = map(int, c.split(':'))
    return int(d.replace(':', '')) * 86400 + hh * 3600 + mm * 60 + ss


tsec = {iid: secs(meta[iid]['time']) for iid in images}
gps = {iid: slib.enu(meta[iid]['lat'], meta[iid]['lon']) for iid in images}
dem = slib.DEM()
# per-photo GPS sigma: the phone's own horizontal error estimate (EXIF GPSHPositioningError), >= 3 m; a repeated
# 4.7487 m value is the phone's stale-fix placeholder -> 7 m
_ex = {}
_exf = os.path.join(RAW, 'exif.json')
if os.path.exists(_exf):
    for r_ in json.load(open(_exf)):
        _ex[slib.img_id(r_['SourceFile'])] = r_.get('GPSHPositioningError')
GPS_SIG = {}
for iid in images:
    e_ = _ex.get(images[iid]['id'])
    GPS_SIG[iid] = 7.0 if (e_ is None or abs(e_ - 4.748651529) < 1e-4) else max(3.0, float(e_))


def eye_y(x, z):
    return float(dem.h(x, z)) + a.eye


# ------------------------------------------------------------------------------------------------ camera model
def distort(cid, xn, yn, ip):
    m = cams[cid]['model']
    f, k1, k2 = ip[0], ip[1], ip[2]
    p1, p2 = (ip[3], ip[4]) if m == 'OPENCV' else (0.0, 0.0)
    r2 = xn * xn + yn * yn
    rad = 1 + k1 * r2 + k2 * r2 * r2
    xd = xn * rad + 2 * p1 * xn * yn + p2 * (r2 + 2 * xn * xn)
    yd = yn * rad + p1 * (r2 + 2 * yn * yn) + 2 * p2 * xn * yn
    return xd, yd


def K_of(cid, ip=None, pp=None):
    ip = cams[cid]['intr'] if ip is None else ip
    pp = cams[cid]['pp'] if pp is None else pp
    return np.array([[ip[0], 0, pp[0]], [0, ip[0], pp[1]], [0, 0, 1.0]])


def dist_of(cid, ip=None):
    ip = cams[cid]['intr'] if ip is None else ip
    return np.array([ip[1], ip[2], ip[3], ip[4]]) if cams[cid]['model'] == 'OPENCV' else np.array([ip[1], ip[2], 0.0, 0.0])


def undist(iid, uv):
    """distorted pixels -> normalised pinhole coordinates (N, 2): fixed-point inversion of distort() (30 iterations,
    converged to < 1e-9 for the radii in these frames)."""
    cid = images[iid]['cam']
    ip, pp = cams[cid]['intr'], cams[cid]['pp']
    uv = np.asarray(uv, np.float64).reshape(-1, 2)
    xd, yd = (uv[:, 0] - pp[0]) / ip[0], (uv[:, 1] - pp[1]) / ip[0]
    x, y = xd.copy(), yd.copy()
    for _ in range(30):
        ex, ey = distort(cid, x, y, ip)
        x, y = x - (ex - xd), y - (ey - yd)
    return np.stack([x, y], 1)


def rays_cam(iid, kidx):
    n = undist(iid, kps[iid][kidx])
    v = np.concatenate([n, np.ones((len(n), 1))], 1)
    return v / np.linalg.norm(v, axis=1, keepdims=True)


# ------------------------------------------------------------------------------------------------ 1. tracks
parent = {}


def find(x):
    r = x
    while parent.get(r, r) != r:
        r = parent[r]
    while parent.get(x, x) != r:
        parent[x], x = r, parent[x]
    return r


tracks = []
obs_by_img = collections.defaultdict(dict)  # iid -> {kp: track index}


def build_tracks(use_pairs, tag=''):
    """Union-find over the inlier matches of use_pairs -> tracks (dict image -> keypoint), obs_by_img."""
    parent.clear()
    for (i, j, m, _) in use_pairs:
        for ka, kb in m:
            parent.setdefault((i, int(ka)), (i, int(ka)))   # every node (roots included) must be a key
            parent.setdefault((j, int(kb)), (j, int(kb)))
            u, v = find((i, int(ka))), find((j, int(kb)))
            if u != v:
                parent[u] = v
    groups = collections.defaultdict(list)
    for node in list(parent.keys()):
        groups[find(node)].append(node)
    tracks.clear()
    obs_by_img.clear()
    n_conf = 0
    for g in groups.values():
        per = collections.defaultdict(list)
        for (iid, k) in g:
            per[iid].append(k)
        obs = {}
        bad = False
        for iid, ks in per.items():
            if len(ks) == 1:
                obs[iid] = ks[0]
                continue
            P = kps[iid][ks]
            if np.max(np.linalg.norm(P - P.mean(0), axis=1)) <= 4.0:
                obs[iid] = ks[0]
            else:
                bad = True
                break
        if bad:
            n_conf += 1
            continue
        if len(obs) >= 2:
            tracks.append(obs)
    for t, obs in enumerate(tracks):
        for iid, k in obs.items():
            obs_by_img[iid][k] = t
    log(f'tracks{tag}: {len(tracks)} (>= 2 views) from {len(use_pairs)} pairs, {n_conf} conflicting dropped; mean length {np.mean([len(t) for t in tracks]):.2f}')


build_tracks(pairs)
pair_n = collections.Counter()
for (i, j, m, _) in pairs:
    pair_n[(i, j)] = len(m)
    pair_n[(j, i)] = len(m)

# ------------------------------------------------------------------------------------------------ poses
R = {}   # iid -> R_cw (world ENU -> COLMAP camera)
RPRI = {}  # iid -> rotation prior (rotation averaging), sigma --rot-sigma
C = {}   # iid -> centre ENU


def umeyama(src, dst, w=None):
    w = np.ones(len(src)) if w is None else w
    w = w / w.sum()
    ms, md = (w[:, None] * src).sum(0), (w[:, None] * dst).sum(0)
    S, D = src - ms, dst - md
    cov = (w[:, None] * D).T @ S
    U, sv, Vt = np.linalg.svd(cov)
    E = np.eye(3)
    if np.linalg.det(U @ Vt) < 0:
        E[2, 2] = -1
    Rm = U @ E @ Vt
    var = (w * (S ** 2).sum(1)).sum()
    s = np.trace(np.diag(sv) @ E) / var
    return s, Rm, md - s * Rm @ ms


def gps3(iid):
    g = gps[iid]
    return np.array([g[0], eye_y(g[0], g[1]), g[1]])


def seed_from_model(path):
    import pycolmap
    rec = pycolmap.Reconstruction(path)
    name2iid = {im['name']: iid for iid, im in images.items()}
    src, dst, ids = [], [], []
    poses = {}
    for im in rec.images.values():
        if not im.has_pose or im.name not in name2iid:
            continue
        iid = name2iid[im.name]
        T = im.cam_from_world()
        Rcw = T.rotation.matrix()
        poses[iid] = (Rcw, im.projection_center())
        src.append(im.projection_center())
        dst.append(gps3(iid))
        ids.append(iid)
    src, dst = np.array(src), np.array(dst)
    # robust similarity: RANSAC over 3-camera samples, scored with a 6 m horizontal tolerance, then a weighted refit
    rng = np.random.default_rng(0)
    best = None
    for _ in range(2000):
        s3 = rng.choice(len(src), 3, replace=False)
        if np.linalg.norm(np.cross(src[s3[1]] - src[s3[0]], src[s3[2]] - src[s3[0]])) < 1e-6:
            continue
        s, Rm, t = umeyama(src[s3], dst[s3])
        r = np.linalg.norm(((s * (Rm @ src.T)).T + t - dst)[:, [0, 2]], axis=1)
        sc = np.sum(np.minimum(r, 12.0))
        if best is None or sc < best[0]:
            best = (sc, s, Rm, t)
    _, s, Rm, t = best
    for _ in range(5):
        r = np.linalg.norm((s * (Rm @ src.T)).T + t - dst, axis=1)
        w = 1.0 / np.maximum(r, 3.0)
        s, Rm, t = umeyama(src, dst, w)
    r = np.linalg.norm(((s * (Rm @ src.T)).T + t - dst)[:, [0, 2]], axis=1)
    log(f'seed {os.path.relpath(path, slib.ROOT)}: {len(ids)} photos -> ENU scale {s:.3f} m/unit, GPS residual median {np.median(r):.1f} m, max {r.max():.1f} m')
    # the model's lens calibration (same camera ids as the database) is better than the 35 mm prior
    for cid_, cam in rec.cameras.items():
        if cid_ in cams:
            p = np.array(cam.params)
            cams[cid_]['intr'] = np.array([0.5 * (p[0] + p[1]), p[4], p[5], p[6], p[7]]) if cams[cid_]['model'] == 'OPENCV' else np.array([p[0], p[3], p[4]])
            log(f'  lens {cid_} {cams[cid_]["model"]}: ' + ' '.join(f'{v:.4g}' for v in cams[cid_]['intr']))
    for iid, (Rcw, Cm) in poses.items():
        R[iid] = Rcw @ Rm.T
        C[iid] = s * Rm @ Cm + t


def level_pose(iid):
    h = np.radians(meta[iid]['heading'] or 0.0)
    fwd = np.array([np.sin(h), 0, -np.cos(h)])
    right = np.array([np.cos(h), 0, np.sin(h)])
    down = np.array([0, -1.0, 0])
    return np.stack([right, down, fwd])


# ------------------------------------------------------------------------------------------------ points
X = {}  # track -> ENU


def tri_track(t, max_err=None):
    obs = {iid: k for iid, k in tracks[t].items() if iid in R}
    if len(obs) < 2:
        return None
    ids = list(obs)
    dirs, cens = [], []
    for iid in ids:
        r = rays_cam(iid, [obs[iid]])[0]
        dirs.append(R[iid].T @ r)
        cens.append(C[iid])
    dirs, cens = np.array(dirs), np.array(cens)
    ang = 0.0
    for p in range(len(ids)):
        for q in range(p + 1, len(ids)):
            ang = max(ang, np.degrees(np.arccos(np.clip(dirs[p] @ dirs[q], -1, 1))))
    if ang < a.min_angle:
        # one standing spot (or a far point): keep it as a weak-depth point when all its views share a station, so the
        # bundle adjustment still ties the station's rotations together (depth: 30 m, weak prior, see bundle())
        if len(ids) >= 2 and all(is_station(ids[0], u) or u == ids[0] for u in ids) and a.weak_pts:
            Xt = cens[0] + 30.0 * dirs.mean(0) / np.linalg.norm(dirs.mean(0))
            return Xt
        return None
    Am = np.zeros((3, 3))
    b = np.zeros(3)
    for d, c in zip(dirs, cens):
        P = np.eye(3) - np.outer(d, d)
        Am += P
        b += P @ c
    try:
        Xt = np.linalg.solve(Am, b)
    except np.linalg.LinAlgError:
        return None
    me = max_err or a.max_err
    for iid in ids:
        xc = R[iid] @ (Xt - C[iid])
        if xc[2] <= 0.2:
            return None
        if me < 1e6:
            u = project(iid, Xt[None])[0]
            if np.linalg.norm(u - kps[iid][obs[iid]]) > me * 3:
                return None
    return Xt


def project(iid, Xw, Ri=None, Ci=None, ip=None):
    Ri = R[iid] if Ri is None else Ri
    Ci = C[iid] if Ci is None else Ci
    cid = images[iid]['cam']
    ip = cams[cid]['intr'] if ip is None else ip
    xc = (Ri @ (Xw - Ci).T).T
    z = np.maximum(xc[:, 2], 1e-6)
    xd, yd = distort(cid, xc[:, 0] / z, xc[:, 1] / z, ip)
    return np.stack([ip[0] * xd + cams[cid]['pp'][0], ip[0] * yd + cams[cid]['pp'][1]], 1)


# ------------------------------------------------------------------------------------------------ stations
stations = []  # (i, j) linked shots
for i in images:
    for j in images:
        if i < j and abs(tsec[i] - tsec[j]) <= a.station_gap and np.linalg.norm(gps[i] - gps[j]) <= 3.0:
            stations.append((i, j))
log(f'station links (<= {a.station_gap:.0f} s, <= 3 m by GPS): {len(stations)}')
STSET = {(min(i, j), max(i, j)) for i, j in stations}


def kabsch(a_, b_):
    H = a_.T @ b_
    U, S_, Vt = np.linalg.svd(H)
    d = np.sign(np.linalg.det(Vt.T @ U.T))
    return Vt.T @ np.diag([1, 1, d]) @ U.T


_pm = {}
for (i_, j_, m_, _) in pairs:
    _pm[(i_, j_)] = m_


def pair_matches(i, j):
    if (i, j) in _pm:
        return _pm[(i, j)]
    if (j, i) in _pm:
        return _pm[(j, i)][:, ::-1]
    return None


def is_station(i, j):
    return (min(i, j), max(i, j)) in STSET


def rel_rotation(iid, mate):
    """R_cw of iid from a registered mate and their matches: the pure-rotation model (Kabsch on rays, RANSAC) or the
    essential matrix's rotation, whichever explains more matches (a camera turned on the spot vs a real baseline)."""
    m = pair_matches(iid, mate)
    ra, rb = rays_cam(iid, m[:, 0]), rays_cam(mate, m[:, 1])
    f = cams[images[iid]['cam']]['intr'][0]
    th = 4.0 / f
    rng = np.random.default_rng(1)
    bi = None
    for _ in range(400):
        s_ = rng.choice(len(ra), 2, replace=False)
        Rr = kabsch(ra[s_], rb[s_])  # rb ~ Rr ra
        inl = np.arccos(np.clip(np.sum((ra @ Rr.T) * rb, 1), -1, 1)) < th
        if bi is None or inl.sum() > bi.sum():
            bi = inl
    Rrot = kabsch(ra[bi], rb[bi])
    n_rot = int(bi.sum())
    pa, pb = ra[:, :2] / ra[:, 2:], rb[:, :2] / rb[:, 2:]
    n_e, Re, te, par = 0, None, None, 0.0
    try:
        E, mask = cv2.findEssentialMat(pa, pb, np.eye(3), method=cv2.USAC_MAGSAC, prob=0.9999, threshold=1.5 / f)
        if E is not None and E.shape == (3, 3):
            n_e, Re, te, mk = cv2.recoverPose(E, pa, pb, np.eye(3), mask=mask.copy())
            g = mk.ravel() > 0
            par = float(np.degrees(np.median(np.arccos(np.clip(np.sum((ra[g] @ Re.T) * rb[g], 1), -1, 1))))) if g.any() else 0.0
    except cv2.error:
        pass
    apart = (not is_station(iid, mate)) and np.linalg.norm(gps[iid] - gps[mate]) > 3.0
    if Re is not None and (n_e > 1.3 * n_rot or (apart and n_e >= 0.7 * n_rot and n_e >= 15)):
        # recoverPose(E, p_iid, p_mate): X_mate = Re X_iid + te. With X = R (W - C): R_mate = Re R_iid, and
        # te = R_mate (C_iid - C_mate), so the baseline direction in ENU is R_mate^T te.
        cj_dir = R[mate].T @ te.ravel()
        return Re.T @ R[mate], 'E', int(n_e), len(m), cj_dir / np.linalg.norm(cj_dir), par
    # rays: rb ~ Rrot ra (mate from iid), so R_mate = Rrot R_iid
    return Rrot.T @ R[mate], 'rot', n_rot, len(m), None, 0.0


def link_strength(iid):
    best = (0, None)
    for mate in R:
        m = pair_matches(iid, mate)
        if m is not None and len(m) > best[0]:
            best = (len(m), mate)
    return best


def rel_register(iid, mate):
    """Register iid from its strongest registered partner: its rotation from the pair, its centre from the same-spot
    partner (stations) or from its GPS fix and the DEM eye height. The bundle adjustment then moves the centre (GPS
    sigma 6 m) - a baseline length from an essential matrix with few inliers is never trusted."""
    Rj, kind, n_in, n, cdir, par = rel_rotation(iid, mate)
    if n_in < 15:
        return False
    st_mates = [u for u in R if is_station(iid, u)]
    if is_station(iid, mate):
        Cj = C[mate].copy()
        how = 'station centre'
    elif st_mates:
        Cj = C[st_mates[0]].copy()
        how = f'centre of {images[st_mates[0]]["id"]}'
    elif kind == 'E' and n_in >= 60 and par >= 2.0:
        lam = float(cdir[[0, 2]] @ (gps[iid] - C[mate][[0, 2]])) / max(1e-6, float(np.linalg.norm(cdir[[0, 2]])) ** 2)
        Cj = C[mate] + max(2.0, lam) * cdir
        Cj[1] = eye_y(Cj[0], Cj[2])
        how = f'E baseline {max(2.0, lam):.1f} m (GPS length), parallax {par:.1f} deg'
        if np.linalg.norm(Cj[[0, 2]] - gps[iid]) > 15:
            Cj = gps3(iid)
            how = 'GPS centre (E baseline disagreed with GPS)'
    else:
        Cj = gps3(iid)
        how = 'GPS centre'
    R[iid], C[iid] = Rj, Cj
    log(f'  {kind} {images[iid]["id"]} <- {images[mate]["id"]} ({n_in}/{n} inliers, {how})')
    return True


def plausible(iid):
    """The checks of tools/survey/audit.py: centre within 15 m of the GPS fix, eye 0.7-2.3 m over the DEM, roll < 15 deg."""
    Rwc = R[iid].T
    roll = np.degrees(np.arcsin(np.clip(-Rwc[:, 0][1], -1, 1)))
    off = np.linalg.norm((C[iid] - gps3(iid))[[0, 2]])
    eye = C[iid][1] - float(dem.h(C[iid][0], C[iid][2]))
    fwd = Rwc[:, 2]
    head = np.degrees(np.arctan2(fwd[0], -fwd[2])) % 360
    dh = abs((head - (meta[iid]['heading'] or head) + 180) % 360 - 180)
    return off <= 15 and 0.6 <= eye <= 3.0 and abs(roll) <= 15 and dh <= 45, (round(float(off), 1), round(float(eye), 2), round(float(roll), 1), round(float(dh), 1))


def pnp_register(iid, min_inl=12):
    o = [(k, t) for k, t in obs_by_img[iid].items() if t in X]
    if len(o) < min_inl:
        return False
    k_, t_ = zip(*o)
    P3 = np.array([X[t] for t in t_])
    n = undist(iid, kps[iid][list(k_)])
    ok, rvec, tvec, inl = cv2.solvePnPRansac(P3, n, np.eye(3), None, iterationsCount=5000,
                                             reprojectionError=4.0 / cams[images[iid]['cam']]['intr'][0], confidence=0.9999,
                                             flags=cv2.SOLVEPNP_SQPNP)
    if not ok or inl is None or len(inl) < min_inl:
        return False
    inl = inl.ravel()
    rvec, tvec = cv2.solvePnPRefineLM(P3[inl], n[inl], np.eye(3), None, rvec, tvec)
    Rcw = cv2.Rodrigues(rvec)[0]
    Cn = -Rcw.T @ tvec.ravel()
    # sanity: within 40 m of its GPS fix
    if np.linalg.norm((Cn - gps3(iid))[[0, 2]]) > 40:
        log(f'  PnP {images[iid]["id"]}: {len(inl)} inliers but {np.linalg.norm((Cn - gps3(iid))[[0, 2]]):.0f} m from GPS; rejected')
        return False
    R[iid], C[iid] = Rcw, Cn
    log(f'  PnP {images[iid]["id"]}: {len(inl)}/{len(o)} inliers')
    return True


# ------------------------------------------------------------------------------------------------ bundle adjustment
REFS = json.load(open(a.refs)) if a.refs and os.path.exists(a.refs) else {}


def bundle(nfev, fix_intr=False, final=False, thr=None):
    ids = sorted(R)
    po = {u: k for k, u in enumerate(ids)}
    pts = sorted(X)
    qo = {t: k for k, t in enumerate(pts)}
    cl = sorted({images[u]['cam'] for u in ids})
    co = {}
    o = 6 * len(ids) + 3 * len(pts)
    for c in cl:
        co[c] = o
        o += 0 if fix_intr else len(cams[c]['intr'])
    npar = o
    # observations
    oi, ot, ouv = [], [], []
    thr = thr or 3 * a.max_err
    for t in pts:
        for iid, k in tracks[t].items():
            if iid in po:
                if np.linalg.norm(project(iid, X[t][None])[0] - kps[iid][k]) > thr or (R[iid] @ (X[t] - C[iid]))[2] <= 0.1:
                    continue
                oi.append(po[iid])
                ot.append(qo[t])
                ouv.append(kps[iid][k])
    oi, ot, ouv = np.array(oi), np.array(ot), np.array(ouv)
    ocam = np.array([images[ids[i]]['cam'] for i in oi])
    # weak depth prior for points without parallax between distinct spots
    weak = []
    for t in pts:
        cs = [C[i] for i in tracks[t] if i in R]
        if len(cs) >= 1 and max(np.linalg.norm(c - cs[0]) for c in cs) < 1.0:
            i0 = next(i for i in tracks[t] if i in R)
            weak.append((qo[t], po[i0], np.linalg.norm(X[t] - C[i0])))
    st = [(po[i], po[j]) for (i, j) in stations if i in po and j in po]
    nobs = len(oi)
    rp = [(po[u], RPRI[u]) for u in ids if u in RPRI]
    nres = 2 * nobs + 3 * len(ids) + 3 * len(rp) + len(weak) + 3 * len(st) + n_ref_rows(pts, qo) + (0 if fix_intr else sum(len(cams[c]['intr']) for c in cl))
    x0 = np.zeros(npar)
    for u, k in po.items():
        x0[6 * k:6 * k + 3] = Rotation.from_matrix(R[u]).as_rotvec()
        x0[6 * k + 3:6 * k + 6] = C[u]
    b0 = 6 * len(ids)
    for t, k in qo.items():
        x0[b0 + 3 * k:b0 + 3 * k + 3] = X[t]
    if not fix_intr:
        for c in cl:
            x0[co[c]:co[c] + len(cams[c]['intr'])] = cams[c]['intr']
    gp = np.array([gps[u] for u in ids])
    sg, se, ss = a.gps_sigma, a.eye_sigma, a.station_sigma
    sgv = np.array([GPS_SIG[u] for u in ids])

    def fun(x):
        rv = x[:b0].reshape(-1, 6)
        Rm = Rotation.from_rotvec(rv[:, :3]).as_matrix()
        Cm = rv[:, 3:]
        Pm = x[b0:b0 + 3 * len(pts)].reshape(-1, 3)
        xc = np.einsum('nij,nj->ni', Rm[oi], Pm[ot] - Cm[oi])
        z = np.where(xc[:, 2] > 1e-3, xc[:, 2], 1e-3)
        xn, yn = xc[:, 0] / z, xc[:, 1] / z
        res = np.empty(nres)
        uv = np.empty((nobs, 2))
        for c in cl:
            sel = ocam == c
            ip = cams[c]['intr'] if fix_intr else x[co[c]:co[c] + len(cams[c]['intr'])]
            xd, yd = distort(c, xn[sel], yn[sel], ip)
            uv[sel, 0] = ip[0] * xd + cams[c]['pp'][0]
            uv[sel, 1] = ip[0] * yd + cams[c]['pp'][1]
        e = uv - ouv
        e[xc[:, 2] <= 1e-3] = 50.0
        res[:2 * nobs] = e.ravel()
        o2 = 2 * nobs
        # priors, expressed in "pixel-like" units so the Huber scale applies uniformly (1 sigma = huber px)
        k_ = a.huber
        res[o2:o2 + 3 * len(ids):3] = (Cm[:, 0] - gp[:, 0]) / sgv * k_
        res[o2 + 1:o2 + 3 * len(ids):3] = (Cm[:, 2] - gp[:, 1]) / sgv * k_
        res[o2 + 2:o2 + 3 * len(ids):3] = (Cm[:, 1] - (dem.h(Cm[:, 0], Cm[:, 2]) + a.eye)) / se * k_
        o2 += 3 * len(ids)
        for (k2, Rp) in rp:
            res[o2:o2 + 3] = Rotation.from_matrix(Rm[k2] @ Rp.T).as_rotvec() / np.radians(a.rot_sigma) * k_
            o2 += 3
        for (q, pi_, d0) in weak:
            res[o2] = (np.linalg.norm(Pm[q] - Cm[pi_]) - d0) / (0.5 * d0) * k_
            o2 += 1
        for (p, q) in st:
            res[o2:o2 + 3] = (Cm[p] - Cm[q]) / ss * k_
            o2 += 3
        o2 = ref_rows(res, o2, Pm, qo, k_)
        if not fix_intr:
            # lens priors: f within 1.5 % of the 35 mm-equivalent value, small distortion (Apple corrects it in the HEIC)
            for c in cl:
                ip = x[co[c]:co[c] + len(cams[c]['intr'])]
                sig = [0.015 * cams[c]['f0'], 0.08, 0.15] + ([0.004, 0.004] if cams[c]['model'] == 'OPENCV' else [])
                res[o2:o2 + len(ip)] = (ip - np.r_[cams[c]['f0'], np.zeros(len(ip) - 1)]) / np.array(sig) * k_
                o2 += len(ip)
        return res

    S = lil_matrix((nres, npar), dtype=np.int8)
    r2 = np.arange(nobs)
    for d in range(6):
        S[2 * r2, 6 * oi + d] = 1
        S[2 * r2 + 1, 6 * oi + d] = 1
    for d in range(3):
        S[2 * r2, b0 + 3 * ot + d] = 1
        S[2 * r2 + 1, b0 + 3 * ot + d] = 1
    if not fix_intr:
        for c in cl:
            rows = np.nonzero(ocam == c)[0]
            for d in range(len(cams[c]['intr'])):
                S[2 * rows, co[c] + d] = 1
                S[2 * rows + 1, co[c] + d] = 1
    o2 = 2 * nobs
    for k in range(len(ids)):
        for d in range(3):
            S[o2 + 3 * k + d, 6 * k + 3:6 * k + 6] = 1
    o2 += 3 * len(ids)
    for (k2, Rp) in rp:
        S[o2:o2 + 3, 6 * k2:6 * k2 + 3] = 1
        o2 += 3
    for (q, pi_, d0) in weak:
        S[o2, b0 + 3 * q:b0 + 3 * q + 3] = 1
        S[o2, 6 * pi_ + 3:6 * pi_ + 6] = 1
        o2 += 1
    for (p, q) in st:
        for d in range(3):
            S[o2 + d, 6 * p + 3 + d] = 1
            S[o2 + d, 6 * q + 3 + d] = 1
        o2 += 3
    o2 = ref_sparsity(S, o2, qo, b0)
    if not fix_intr:
        for c in cl:
            for d in range(len(cams[c]['intr'])):
                S[o2 + d, co[c] + d] = 1
            o2 += len(cams[c]['intr'])
    r0 = fun(x0)
    c2 = a.huber ** 2
    nrob = 2 * nobs

    def loss(z):
        # Huber (scale a.huber px) on the image observations only; the priors stay quadratic (Gaussian)
        out = np.empty((3, len(z)))
        out[0], out[1], out[2] = z, 1.0, 0.0
        zo = z[:nrob]
        big = zo > c2
        sq = np.sqrt(zo[big])
        out[0, :nrob][big] = 2 * a.huber * sq - c2
        out[1, :nrob][big] = a.huber / sq
        out[2, :nrob][big] = -a.huber / (2 * zo[big] * sq)
        return out
    sol = least_squares(fun, x0, jac_sparsity=S.tocsr(), loss=loss, f_scale=1.0, x_scale='jac', method='trf',
                        tr_solver='lsmr', max_nfev=nfev, xtol=1e-10, ftol=1e-9)
    x = sol.x
    for u, k in po.items():
        R[u] = Rotation.from_rotvec(x[6 * k:6 * k + 3]).as_matrix()
        C[u] = x[6 * k + 3:6 * k + 6].copy()
    for t, k in qo.items():
        X[t] = x[b0 + 3 * k:b0 + 3 * k + 3].copy()
    if not fix_intr:
        for c in cl:
            cams[c]['intr'] = x[co[c]:co[c] + len(cams[c]['intr'])].copy()
    r = fun(x)
    e = np.linalg.norm(r[:2 * nobs].reshape(-1, 2), axis=1)
    e0 = np.linalg.norm(r0[:2 * nobs].reshape(-1, 2), axis=1)
    log(f'  BA: {len(ids)} photos, {len(pts)} points, {nobs} obs, {len(weak)} one-spot points; reproj mean {e0.mean():.2f} -> {e.mean():.2f} px '
        f'(median {np.median(e):.2f}, p90 {np.percentile(e, 90):.2f}); nfev {sol.nfev}')
    # points left with < 2 views inside the threshold are dropped (re-triangulated later from the full tracks)
    cnt = collections.Counter(ot[e <= thr])
    for k, t in enumerate(pts):
        if cnt.get(k, 0) < 2:
            X.pop(t, None)
    return e, dict(ids=ids, oi=oi, e=e, thr=thr)


# references (hard constraints from refs.json), see the docstring
def n_ref_rows(pts, qo):
    n = 0
    for g in REFS.get('ground', []):
        n += sum(1 for t in g.get('tracks', []) if t in qo)
    for ln in REFS.get('lines', []):
        n += sum(1 for t in ln.get('tracks', []) if t in qo)
    return n


def ref_rows(res, o2, Pm, qo, k_):
    for g in REFS.get('ground', []):
        for t in g.get('tracks', []):
            if t in qo:
                res[o2] = (Pm[qo[t]][1] - g['y']) / g.get('sigma', 0.05) * k_
                o2 += 1
    for ln in REFS.get('lines', []):
        (x1, z1), (x2, z2) = ln['a'], ln['b']
        d = np.array([x2 - x1, z2 - z1])
        L = np.linalg.norm(d)
        nrm = np.array([-d[1], d[0]]) / L
        for t in ln.get('tracks', []):
            if t in qo:
                p = Pm[qo[t]]
                res[o2] = ((p[0] - x1) * nrm[0] + (p[2] - z1) * nrm[1] - ln.get('offset', 0.0)) / ln.get('sigma', 0.5) * k_
                o2 += 1
    return o2


def ref_sparsity(S, o2, qo, b0):
    for g in REFS.get('ground', []):
        for t in g.get('tracks', []):
            if t in qo:
                S[o2, b0 + 3 * qo[t] + 1] = 1
                o2 += 1
    for ln in REFS.get('lines', []):
        for t in ln.get('tracks', []):
            if t in qo:
                S[o2, b0 + 3 * qo[t]] = 1
                S[o2, b0 + 3 * qo[t] + 2] = 1
                o2 += 1
    return o2


# ------------------------------------------------------------------------------------------------ run
seed = a.seed
if seed is None:
    base = os.path.join(RAW, 'sparse_lg')
    best = None
    if os.path.isdir(base):
        import pycolmap
        for d in sorted(os.listdir(base)):
            p = os.path.join(base, d)
            if os.path.exists(os.path.join(p, 'images.bin')):
                n = pycolmap.Reconstruction(p).num_reg_images()
                if best is None or n > best[0]:
                    best = (n, p)
    seed = best[1] if best else None
if seed:
    seed_from_model(seed if os.path.isabs(seed) else os.path.join(slib.ROOT, seed))
else:
    raise SystemExit('no seed model')
def retri(max_err=None):
    for t in range(len(tracks)):
        if t not in X:
            p = tri_track(t, max_err)
            if p is not None:
                X[t] = p


def validate(tag):
    bad = []
    for u in list(R):
        ok, (off, eye, roll, dh) = plausible(u)
        if not ok:
            bad.append(u)
            log(f'  {tag}: {images[u]["id"]} implausible (GPS {off:.1f} m, eye {eye:.2f} m, roll {roll:.1f} deg, compass {dh:.0f} deg): de-registered')
            del R[u], C[u]
    return bad


def proj_so3(Mx):
    U, _, Vt = np.linalg.svd(Mx)
    Rr = U @ Vt
    if np.linalg.det(Rr) < 0:
        U[:, -1] *= -1
        Rr = U @ Vt
    return Rr


def global_init():
    """Rotation averaging over every verified pair, then known-rotation linear SfM (centres + points) with GPS priors."""
    import heapq
    from scipy.sparse import coo_matrix
    from scipy.sparse.linalg import lsqr
    seedR = {u: R[u].copy() for u in R}
    seedC = {u: C[u].copy() for u in C}
    ids = sorted(images)
    # 1. relative rotations, R_i = Q R_j
    rel = []
    for (i, j, m, _) in pairs:
        R[j] = np.eye(3)  # rel_rotation composes with R[mate]; identity gives the bare relative rotation
        Q, kind, n_in, n, _, par = rel_rotation(i, j)
        rel.append((i, j, Q, n_in, kind))
    for u in list(R):
        if u not in seedR:
            del R[u]
    for u, Rs in seedR.items():
        R[u] = Rs
    adj = collections.defaultdict(list)
    for k, (i, j, Q, w, kind) in enumerate(rel):
        if w >= 15:
            adj[i].append(k)
            adj[j].append(k)
    root = max(seedR, key=lambda u: sum(rel[k][3] for k in adj[u]))
    Ra = {root: np.eye(3)}
    hq = [(-rel[k][3], k) for k in adj[root]]
    heapq.heapify(hq)
    while hq:
        _, k = heapq.heappop(hq)
        i, j, Q = rel[k][0], rel[k][1], rel[k][2]
        if i in Ra and j not in Ra:
            Ra[j] = Q.T @ Ra[i]
            new_ = j
        elif j in Ra and i not in Ra:
            Ra[i] = Q @ Ra[j]
            new_ = i
        else:
            continue
        for k2 in adj[new_]:
            heapq.heappush(hq, (-rel[k2][3], k2))
    active = [k for k in range(len(rel)) if rel[k][3] >= 15 and rel[k][0] in Ra and rel[k][1] in Ra]
    active_set = set(active)
    for rnd_ in range(3):
        for it in range(80):
            for u in Ra:
                if u == root:
                    continue
                acc = np.zeros((3, 3))
                for k in adj[u]:
                    if k not in active_set:
                        continue
                    i, j, Q, w = rel[k][0], rel[k][1], rel[k][2], rel[k][3]
                    est = Q @ Ra[j] if i == u else Q.T @ Ra[i]
                    e = np.degrees(np.linalg.norm(Rotation.from_matrix(est @ Ra[u].T).as_rotvec()))
                    acc += np.sqrt(w) / max(1.0, e / 1.0) * est
                if np.abs(acc).sum() > 0:
                    Ra[u] = proj_so3(acc)
        res = {k: np.degrees(np.linalg.norm(Rotation.from_matrix(rel[k][2] @ Ra[rel[k][1]] @ Ra[rel[k][0]].T).as_rotvec())) for k in active}
        bad = [k for k in active if res[k] > 3.0]
        log(f'rotation averaging round {rnd_ + 1}: {len(active)} pairs, residual median {np.median(list(res.values())):.2f} deg, '
            f'p90 {np.percentile(list(res.values()), 90):.2f}; {len(bad)} pairs > 3 deg dropped: '
            + ', '.join(f'{images[rel[k][0]]["id"][4:]}-{images[rel[k][1]]["id"][4:]}({res[k]:.0f})' for k in bad[:20]))
        if not bad:
            break
        active = [k for k in active if k not in bad]
        active_set = set(active)
    # rebuild the tracks from the rotation-consistent pairs only: a pair whose relative rotation disagrees with the
    # average by > 3 deg has wrong matches (repeated windows, far hills), and its tracks would poison the positions
    okp = {(rel[k][0], rel[k][1]) for k in active}
    dropped = [(images[i]['id'][4:], images[j]['id'][4:]) for (i, j, m, _) in pairs if (i, j) not in okp]
    build_tracks([p_ for p_ in pairs if (p_[0], p_[1]) in okp], ' (rotation-consistent pairs)')
    log(f'  pairs left out of the tracks: {len(dropped)}: ' + ', '.join(f'{x}-{y}' for x, y in dropped))
    # gauge: the seed's ENU rotations
    G = proj_so3(sum(Ra[u].T @ seedR[u] for u in seedR if u in Ra))
    gerr = [np.degrees(np.linalg.norm(Rotation.from_matrix((Ra[u] @ G) @ seedR[u].T).as_rotvec())) for u in seedR if u in Ra]
    log(f'rotations: {len(Ra)} photos; seed agreement median {np.median(gerr):.2f} deg, max {np.max(gerr):.2f}')
    for u in Ra:
        R[u] = Ra[u] @ G
        RPRI[u] = R[u].copy()
    # 2. positions: per-pair baseline directions with the rotations known (2-point RANSAC on the epipolar planes), then
    #    position averaging (|C_j - C_i - s_ij t_ij| with s_ij >= 0.5 m, IRLS) + GPS / eye / station priors.
    from scipy.sparse import coo_matrix
    from scipy.sparse.linalg import spsolve
    grp = {u: u for u in ids}

    def gfind(x):
        while grp[x] != x:
            grp[x] = grp[grp[x]]
            x = grp[x]
        return x
    for (i, j) in stations:
        grp[gfind(i)] = gfind(j)
    dirs_ = []
    rng = np.random.default_rng(5)
    for k in active:
        i, j = rel[k][0], rel[k][1]
        if gfind(i) == gfind(j) or i not in R or j not in R:
            continue
        m = pair_matches(i, j)
        ri = (R[i].T @ rays_cam(i, m[:, 0]).T).T
        rj = (R[j].T @ rays_cam(j, m[:, 1]).T).T
        n = np.cross(ri, rj)
        nn = np.linalg.norm(n, axis=1)
        ok = nn > np.sin(np.radians(0.3))     # rays crossing at > 0.3 deg carry the baseline direction
        if ok.sum() < 12:
            continue
        n = n[ok] / nn[ok, None]
        rio, rjo = ri[ok], rj[ok]
        f = cams[images[i]['cam']]['intr'][0]
        th = 3.0 / f
        best = None
        for _ in range(500):
            s_ = rng.choice(len(n), 2, replace=False)
            t = np.cross(n[s_[0]], n[s_[1]])
            if np.linalg.norm(t) < 1e-6:
                continue
            t /= np.linalg.norm(t)
            inl = np.abs(n @ t) < th * 3
            if best is None or inl.sum() > best[0].sum():
                best = (inl, t)
        inl, t = best
        if inl.sum() < 12:
            continue
        U, S_, Vt = np.linalg.svd(n[inl])
        t = Vt[-1]
        # sign: the points must lie in front of both cameras: X = C_i + a ri = C_j + b rj with a, b > 0, C_j - C_i = t
        A_ = np.stack([rio[inl], -rjo[inl]], 2)          # (m, 3, 2) [a, b] solves a ri - b rj = t
        sol_ = np.array([np.linalg.lstsq(A_[q], t, rcond=None)[0] for q in range(len(A_))])
        front = ((sol_[:, 0] > 0) & (sol_[:, 1] > 0)).mean()
        back = ((sol_[:, 0] < 0) & (sol_[:, 1] < 0)).mean()
        if back > front:
            t = -t
            front, back = back, front
        if front < 0.7:
            continue
        dirs_.append((i, j, t, int(inl.sum())))
    log(f'baseline directions: {len(dirs_)} pairs between standing spots')
    cams_ = sorted(R)
    co = {u: k for k, u in enumerate(cams_)}
    w_dir = {k: 1.0 for k in range(len(dirs_))}
    scale = {k: max(1.0, float(np.linalg.norm(gps[dirs_[k][1]] - gps[dirs_[k][0]]))) for k in range(len(dirs_))}
    for it in range(12):
        rows, cols, vals, rhs = [], [], [], []
        r = 0
        for k, (i, j, t, n_) in enumerate(dirs_):
            w = w_dir[k] * 2.0   # 1 / 0.5 m
            for a_ in range(3):
                rows += [r, r]
                cols += [3 * co[j] + a_, 3 * co[i] + a_]
                vals += [w, -w]
                rhs.append(w * scale[k] * t[a_])
                r += 1
        for u in cams_:
            g = gps[u]
            pri = [(seedC[u][0], 0.3), (seedC[u][1], 0.2), (seedC[u][2], 0.3)] if u in seedC else \
                [(g[0], GPS_SIG[u]), (eye_y(g[0], g[1]), a.eye_sigma), (g[1], GPS_SIG[u])]
            for a_, (val, sig) in enumerate(pri):
                rows.append(r)
                cols.append(3 * co[u] + a_)
                vals.append(1.0 / sig)
                rhs.append(val / sig)
                r += 1
        for (i, j) in stations:
            if i in co and j in co:
                for a_ in range(3):
                    rows += [r, r]
                    cols += [3 * co[i] + a_, 3 * co[j] + a_]
                    vals += [1.0 / a.station_sigma, -1.0 / a.station_sigma]
                    rhs.append(0.0)
                    r += 1
        A_ = coo_matrix((vals, (rows, cols)), shape=(r, 3 * len(cams_))).tocsr()
        Cs = spsolve((A_.T @ A_).tocsc(), A_.T @ np.array(rhs)).reshape(-1, 3)
        # update the per-pair scales (projection on the direction, >= 0.5 m) and robust weights
        res_ = []
        for k, (i, j, t, n_) in enumerate(dirs_):
            v = Cs[co[j]] - Cs[co[i]]
            scale[k] = max(0.5, float(v @ t))
            e = np.linalg.norm(v - scale[k] * t)
            ang = np.degrees(np.arctan2(e, max(scale[k], 1e-3)))
            res_.append(ang)
            w_dir[k] = 1.0 / max(1.0, ang / 3.0)
    res_ = np.array(res_)
    log(f'position averaging: direction residual median {np.median(res_):.1f} deg, p90 {np.percentile(res_, 90):.1f}; '
        f'{(res_ > 10).sum()} pairs > 10 deg: ' + ', '.join(f'{images[d[0]]["id"][4:]}-{images[d[1]]["id"][4:]}({r_:.0f})' for d, r_ in zip(dirs_, res_) if r_ > 10))
    for u in cams_:
        C[u] = Cs[co[u]].copy()
    gpsoff = {images[u]['id'][4:]: round(float(np.linalg.norm(C[u][[0, 2]] - gps[u])), 1) for u in cams_}
    log('  centre - GPS (m): ' + ' '.join(f'{k}:{v}' for k, v in sorted(gpsoff.items())))
    X.clear()
    for t in range(len(tracks)):
        p_ = tri_track(t, 20.0)
        if p_ is not None:
            X[t] = p_
    log(f'global init: {len(C)} photos, {len(X)} points')


def colmap_ba(thr, n_iter=100, refine_intr=True):
    """Bundle adjustment with COLMAP's Ceres adjuster (Schur complement, Cauchy loss 1 px) and pose priors: the GPS fix
    horizontally (sigma = the phone's error estimate) and DEM + eye height vertically (sigma --eye-sigma). Observations
    beyond thr px of the current model are left out; the state (R, C, X, lens intrinsics) is updated in place."""
    import pycolmap
    rec = pycolmap.Reconstruction()
    used_cams = sorted({images[u]['cam'] for u in R})
    for cid in used_cams:
        cm = cams[cid]
        ip = cm['intr']
        if cm['model'] == 'OPENCV':
            prm = [ip[0], ip[0], cm['pp'][0], cm['pp'][1], ip[1], ip[2], ip[3], ip[4]]
        else:
            prm = [ip[0], cm['pp'][0], cm['pp'][1], ip[1], ip[2]]
        cam = pycolmap.Camera(model=cm['model'], width=cm['w'], height=cm['h'], params=prm, camera_id=cid)
        rec.add_camera_with_trivial_rig(cam)
    # observations inside the threshold
    obs_ok = collections.defaultdict(list)   # t -> [(u, k)]
    for t, Xt in X.items():
        for u, k in tracks[t].items():
            if u not in R:
                continue
            xc = R[u] @ (Xt - C[u])
            if xc[2] <= 0.1:
                continue
            if np.linalg.norm(project(u, Xt[None])[0] - kps[u][k]) <= thr:
                obs_ok[t].append((u, k))
    obs_ok = {t: v for t, v in obs_ok.items() if len(v) >= 2}
    p2d_index = {}
    for u in sorted(R):
        ks = sorted({k for t, v in obs_ok.items() for (uu, k) in v if uu == u})
        p2d_index[u] = {k: n for n, k in enumerate(ks)}
        pts2 = pycolmap.Point2DList([pycolmap.Point2D(kps[u][k]) for k in ks])
        im = pycolmap.Image(name=images[u]['name'], points2D=pts2, camera_id=images[u]['cam'], image_id=u)
        tv = -R[u] @ C[u]
        rec.add_image_with_trivial_frame(im, pycolmap.Rigid3d(pycolmap.Rotation3d(R[u]), tv))
    pid_of = {}
    for t, v in obs_ok.items():
        tr = pycolmap.Track()
        for (u, k) in v:
            tr.add_element(u, p2d_index[u][k])
        pid_of[t] = rec.add_point3D(X[t], tr)
    # priors
    priors = []
    for u in sorted(R):
        g = gps[u]
        pr = pycolmap.PosePrior()
        pr.corr_data_id = pycolmap.data_t(pycolmap.sensor_t(pycolmap.SensorType.CAMERA, images[u]['cam']), u)
        if u in STATION_PRI:
            pr.position = STATION_PRI[u]
            pr.position_covariance = np.diag([a.station_sigma ** 2] * 3)
        else:
            pr.position = np.array([g[0], eye_y(g[0], g[1]), g[1]])
            pr.position_covariance = np.diag([GPS_SIG[u] ** 2, a.eye_sigma ** 2, GPS_SIG[u] ** 2])
        pr.coordinate_system = pycolmap.PosePriorCoordinateSystem.CARTESIAN
        priors.append(pr)
    opt = pycolmap.BundleAdjustmentOptions()
    opt.refine_focal_length = refine_intr
    opt.refine_extra_params = refine_intr
    opt.refine_principal_point = False
    opt.print_summary = False
    opt.ceres.loss_function_type = pycolmap.LossFunctionType.CAUCHY
    opt.ceres.loss_function_scale = 1.0
    opt.ceres.solver_options.max_num_iterations = n_iter
    opt.ceres.solver_options.num_threads = 3
    popt = pycolmap.PosePriorBundleAdjustmentOptions()
    popt.alignment_ransac.max_error = 0.0   # no re-alignment: the model is already in ENU
    cfg = pycolmap.BundleAdjustmentConfig()
    for u in sorted(R):
        cfg.add_image(u)
    for t, pid in pid_of.items():
        cfg.add_variable_point(pid)
    e0 = rec.compute_mean_reprojection_error()
    ba = pycolmap.create_pose_prior_bundle_adjuster(opt, popt, cfg, priors, rec)
    summ = ba.solve()
    e1 = rec.compute_mean_reprojection_error()
    # read back
    for u in sorted(R):
        im = rec.images[u]
        T = im.cam_from_world()
        R[u] = T.rotation.matrix()
        C[u] = im.projection_center()
    for t, pid in pid_of.items():
        X[t] = np.array(rec.points3D[pid].xyz)
    for cid in used_cams:
        pr_ = np.array(rec.cameras[cid].params)
        cams[cid]['intr'] = np.array([0.5 * (pr_[0] + pr_[1]), pr_[4], pr_[5], pr_[6], pr_[7]]) if cams[cid]['model'] == 'OPENCV' else np.array([pr_[0], pr_[3], pr_[4]])
    for t in list(X):
        if t not in pid_of:
            X.pop(t)
    nobs = sum(len(v) for v in obs_ok.values())
    log(f'  Ceres BA (<= {thr:g} px): {len(R)} photos, {len(pid_of)} points, {nobs} obs; reprojection mean {e0:.2f} -> {e1:.2f} px')
    return rec


STATION_PRI = {}


def station_priors():
    """One standing spot = one centre. Station groups (shots <= --station-gap s apart, <= 3 m by GPS, chained); members
    with < 150 observations of points seen from another spot take a prior at the centroid of the members that have them
    (sigma --station-sigma); the others keep their GPS prior. COLMAP's adjuster has no station term, this stands in."""
    grp = {u: u for u in R}

    def gf(x):
        while grp[x] != x:
            grp[x] = grp[grp[x]]
            x = grp[x]
        return x
    for (i, j) in stations:
        if i in R and j in R:
            grp[gf(i)] = gf(j)
    par = collections.Counter()
    for t, Xt in X.items():
        us = [u for u in tracks[t] if u in R]
        if len(us) >= 2 and max(np.linalg.norm(C[u] - C[us[0]]) for u in us) > 1.5:
            for u in us:
                par[u] += 1
    STATION_PRI.clear()
    groups = collections.defaultdict(list)
    for u in R:
        groups[gf(u)].append(u)
    for g, mem in groups.items():
        if len(mem) < 2:
            continue
        # the centroid weighted by each member's evidence (observations of points seen from another spot + 10)
        wts = np.array([par[u] + 10.0 for u in mem])
        cen = np.sum([w_ * C[u] for w_, u in zip(wts, mem)], 0) / wts.sum()
        for u in mem:
            STATION_PRI[u] = cen.copy()
        log(f'  station {"/".join(images[u]["id"][4:] for u in sorted(mem, key=lambda u: images[u]["id"]))}: '
            f'spread {max(np.linalg.norm(C[u] - cen) for u in mem):.2f} m')


GROW = 120.0  # px: observation threshold while photos join from GPS-level centres (Huber keeps outliers harmless)
global_init()
log(f'global init: {len(R)} photos, {len(X)} points')
for thr in (60.0, 24.0, 12.0, 8.0):
    colmap_ba(thr, refine_intr=thr <= 12.0)
    retri(thr / 3)
bad = validate('after the 8 px stage')
# second chance for the de-registered photos: PnP against the converged points (then the same checks)
for u in bad:
    if pnp_register(u, min_inl=25):
        ok_, why = plausible(u)
        if ok_:
            log(f'  {images[u]["id"]}: re-registered by PnP {why}')
            continue
        log(f'  {images[u]["id"]}: PnP pose still implausible {why}')
        del R[u], C[u]
retri(4.0)
for thr in (6.0, 4.0, 4.0, 4.0, 4.0):
    station_priors()
    colmap_ba(thr)
    retri(thr / 2)
station_priors()
REC = colmap_ba(4.0)
station_priors()
# per-observation errors for the report
info_ids = sorted(R)
_oi, _e = [], []
for t, Xt in X.items():
    for u, k in tracks[t].items():
        if u in R and (R[u] @ (Xt - C[u]))[2] > 0.1:
            er = float(np.linalg.norm(project(u, Xt[None])[0] - kps[u][k]))
            if er <= a.max_err:
                _oi.append(info_ids.index(u))
                _e.append(er)
info = dict(ids=info_ids, oi=np.array(_oi), e=np.array(_e))

# ------------------------------------------------------------------------------------------------ outputs
per = collections.defaultdict(list)
for k, er in zip(info['oi'], info['e']):
    per[info['ids'][k]].append(er)
reg = sorted(images[u]['id'] for u in R)
notreg = sorted(images[u]['id'] for u in images if u not in R)
inl = info['e'] <= a.max_err
cand = {}
for u in R:
    errs_ = [float(np.linalg.norm(project(u, X[t][None])[0] - kps[u][k])) for k, t in obs_by_img[u].items() if t in X and (R[u] @ (X[t] - C[u]))[2] > 0]
    cand[u] = (len(obs_by_img[u]), len(errs_), float(np.median(errs_)) if errs_ else None)
summary = dict(
    area=A, db=os.path.relpath(DB, slib.ROOT), seed=os.path.relpath(seed, slib.ROOT) if os.path.isabs(seed) else seed,
    registered=reg, not_registered=notreg, n_images=len(images), n_points=len(X),
    reproj_mean_px=float(info['e'].mean()), reproj_median_px=float(np.median(info['e'])), reproj_p90_px=float(np.percentile(info['e'], 90)),
    reproj_inlier_mean_px=float(info['e'][inl].mean()),
    per_image={images[u]['id']: dict(obs=len(v), mean_px=round(float(np.mean(v)), 2), median_px=round(float(np.median(v)), 2),
                                     gps_offset_m=round(float(np.linalg.norm((C[u] - gps3(u))[[0, 2]])), 2),
                                     eye_m=round(float(C[u][1] - dem.h(C[u][0], C[u][2])), 2)) for u, v in per.items()},
    candidates={images[u]['id']: dict(track_obs=c[0], with_point=c[1], median_px=None if c[2] is None else round(c[2], 1)) for u, c in cand.items()},
    lenses={str(c): dict(model=cams[c]['model'], w=cams[c]['w'], h=cams[c]['h'], intr=[float(v) for v in cams[c]['intr']], pp=[float(v) for v in cams[c]['pp']]) for c in cams},
)
json.dump(summary, open(os.path.join(OUT, 'solve.json'), 'w'), indent=1)
with open(os.path.join(OUT, 'cameras.txt'), 'w') as f:
    for c, cm in cams.items():
        ip = cm['intr']
        if cm['model'] == 'OPENCV':
            p = [ip[0], ip[0], cm['pp'][0], cm['pp'][1], ip[1], ip[2], ip[3], ip[4]]
        else:
            p = [ip[0], cm['pp'][0], cm['pp'][1], ip[1], ip[2]]
        f.write(f"{c} {cm['model']} {cm['w']} {cm['h']} " + ' '.join(f'{v:.10g}' for v in p) + '\n')
with open(os.path.join(OUT, 'images.txt'), 'w') as f:
    for u in sorted(R):
        q = Rotation.from_matrix(R[u]).as_quat()  # x y z w
        tv = -R[u] @ C[u]
        f.write(f"{u} {q[3]:.12g} {q[0]:.12g} {q[1]:.12g} {q[2]:.12g} {tv[0]:.12g} {tv[1]:.12g} {tv[2]:.12g} {images[u]['cam']} {images[u]['name']}\n")
        pts2 = [(kps[u][k], t) for k, t in obs_by_img[u].items() if t in X]
        f.write(' '.join(f'{p[0]:.3f} {p[1]:.3f} {t}' for p, t in pts2) + '\n')
with open(os.path.join(OUT, 'points3D.txt'), 'w') as f:
    for t, p in X.items():
        f.write(f'{t} {p[0]:.6f} {p[1]:.6f} {p[2]:.6f} 128 128 128 0 ' + ' '.join(f'{u} 0' for u in tracks[t] if u in R) + '\n')
np.savez_compressed(os.path.join(OUT, 'tracks.npz'), t=np.array([t for t in X]), xyz=np.array([X[t] for t in X]))
json.dump({str(t): {images[u]['id']: [float(v) for v in kps[u][k]] for u, k in tracks[t].items() if u in R} for t in X},
          open(os.path.join(OUT, 'track_obs.json'), 'w'))
log(f'registered {len(reg)}/{len(images)} ({100 * len(reg) / len(images):.1f} %): not {notreg}')
log(f'reprojection: mean {info["e"].mean():.2f} px, median {np.median(info["e"]):.2f}, p90 {np.percentile(info["e"], 90):.2f} (inliers <= {a.max_err} px: {100 * inl.mean():.1f} %, mean {info["e"][inl].mean():.2f})')
