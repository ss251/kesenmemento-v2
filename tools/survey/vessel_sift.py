"""[v6:fix2] Sparse stereo of the moored vessel from SIFT matches on the RECTIFIED pair (IMG_0855 stand A x IMG_0860 / 0861 stand B): after rectification a match lies on one
image row (+-1.5 px), which kills the mismatches; the disparity gives the depth (f B / Z ~ 290 px at 50 m), triangulated through the solved cameras back to ENU / the quay frame.
  raw/survey/.venv/bin/python tools/survey/vessel_sift.py --a IMG_0855 --b IMG_0860 --scale 0.75   -> /tmp/vsift_<a>_<b>.npy  [a, d, y, u, v (left raw px), disparity, row error]"""
import argparse, json, os, sys
import cv2, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import market_features as mf
ap = argparse.ArgumentParser(); ap.add_argument('--a', default='IMG_0855'); ap.add_argument('--b', default='IMG_0860'); ap.add_argument('--scale', type=float, default=0.75)
a = ap.parse_args()
cams = mf.load_cams(); c1, c2 = cams[a.a], cams[a.b]
M = json.load(open(os.path.join(mf.ROOT, 'data/survey/market/model.json')))['hall']['quay']
Q0 = np.array(M['p0']); Q1 = np.array(M['p1']); L = np.linalg.norm(Q1 - Q0); QU = (Q1 - Q0) / L; QN = np.array([QU[1], -QU[0]])
s = a.scale; W, H = int(c1['c']['width'] * s), int(c1['c']['height'] * s)
K1 = c1['K'].copy(); K2 = c2['K'].copy(); K1[:2] *= s; K2[:2] *= s
R = c2['Rcw'] @ c1['Rcw'].T; T = (c2['Rcw'] @ (c1['C'] - c2['C'])).reshape(3, 1)
R1, R2, P1, P2, Qm, *_ = cv2.stereoRectify(K1, c1['dist'], K2, c2['dist'], (W, H), R, T, flags=cv2.CALIB_ZERO_DISPARITY, alpha=0)
m1 = cv2.initUndistortRectifyMap(K1, c1['dist'], R1, P1, (W, H), cv2.CV_32FC1); m2 = cv2.initUndistortRectifyMap(K2, c2['dist'], R2, P2, (W, H), cv2.CV_32FC1)
g1 = cv2.cvtColor(cv2.remap(cv2.resize(cv2.imread(c1['path']), (W, H), interpolation=cv2.INTER_AREA), *m1, cv2.INTER_LINEAR), cv2.COLOR_BGR2GRAY)
g2 = cv2.cvtColor(cv2.remap(cv2.resize(cv2.imread(c2['path']), (W, H), interpolation=cv2.INTER_AREA), *m2, cv2.INTER_LINEAR), cv2.COLOR_BGR2GRAY)
cl = cv2.createCLAHE(2.0, (8, 8)); g1c, g2c = cl.apply(g1), cl.apply(g2)
sift = cv2.SIFT_create(nfeatures=60000, contrastThreshold=0.01, edgeThreshold=12)
k1, d1 = sift.detectAndCompute(g1c, None); k2, d2 = sift.detectAndCompute(g2c, None); print(len(k1), len(k2), 'keypoints')
# match only along rows: brute force with a row gate (each left kp against right kps within +-1.5 px rows)
p1 = np.array([k.pt for k in k1]); p2 = np.array([k.pt for k in k2])
order = np.argsort(p2[:, 1]); p2s = p2[order]
f = P1[0, 0]; Bm = float(np.linalg.norm(T)); out = []
import bisect
ys = p2s[:, 1]
for i, (x, y) in enumerate(p1):
    lo = np.searchsorted(ys, y - 1.5); hi = np.searchsorted(ys, y + 1.5)
    if hi - lo < 2: continue
    cand = order[lo:hi]; dx = x - p2[cand, 0]
    ok = (dx > f * Bm / 160) & (dx < f * Bm / 12)       # 12-160 m
    cand = cand[ok]
    if len(cand) < 2: continue
    dd = np.linalg.norm(d2[cand] - d1[i][None], axis=1); j = np.argsort(dd)
    if dd[j[0]] < 0.75 * dd[j[1]] and dd[j[0]] < 260:
        k = cand[j[0]]; out.append((x, y, p2[k, 0], p2[k, 1], x - p2[k, 0]))
out = np.array(out); print(len(out), 'row-gated matches')
# triangulate: rectified left pixel + disparity -> camera-1 rectified frame via Q
pts = np.stack([out[:, 0], out[:, 1], out[:, 4]], 1).astype(np.float32)
X = cv2.perspectiveTransform(pts.reshape(-1, 1, 3), Qm).reshape(-1, 3)     # x right, y down, z fwd in the rectified cam-1 frame
Pc = X @ R1                                                                 # back to the cam-1 frame (row vectors)
Pw = Pc @ c1['Rcw'] + c1['C']
q = np.stack([(Pw[:, 0] - Q0[0]) * QU[0] + (Pw[:, 2] - Q0[1]) * QU[1], (Pw[:, 0] - Q0[0]) * QN[0] + (Pw[:, 2] - Q0[1]) * QN[1], Pw[:, 1]], 1)
res = np.column_stack([q, out, Pw]); np.save(f'/tmp/vsift_{a.a}_{a.b}.npy', res); print('saved', res.shape)
for lo, hi in [(-60, -30), (-30, -5), (-5, 0.5), (0.5, 6), (6, 15), (15, 60), (60, 400)]:
    m = (q[:, 1] >= lo) & (q[:, 1] < hi); print(f'd {lo}..{hi}: {m.sum()}')
