"""[v6:fix2] Vessel keypoints by rectified stereo: picks (u, v) in the rectified LEFT image (IMG_0855, scale 0.75) are matched along their row in the right image
(IMG_0860) by normalised cross-correlation (41 px patch, parabola sub-pixel), triangulated to the quay frame (a, d, y).
  raw/survey/.venv/bin/python tools/survey/vpick.py crop u0 v0 u1 v1 out.jpg          # a gridded crop of the rectified left image (grid 50 px)
  raw/survey/.venv/bin/python tools/survey/vpick.py pick name:u:v ...                  # NCC disparity + 3D for each pick
  raw/survey/.venv/bin/python tools/survey/vpick.py cropr u0 v0 u1 v1 out.jpg           # the same crop of the RIGHT image at the matched disparity (check)"""
import json, os, sys
import cv2, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import market_features as mf
A, B, s = 'IMG_0855', 'IMG_0860', 0.75
cams = mf.load_cams(); c1, c2 = cams[A], cams[B]
M = json.load(open(os.path.join(mf.ROOT, 'data/survey/market/model.json')))['hall']['quay']
Q0 = np.array(M['p0']); Q1 = np.array(M['p1']); L = np.linalg.norm(Q1 - Q0); QU = (Q1 - Q0) / L; QN = np.array([QU[1], -QU[0]])
W, H = int(c1['c']['width'] * s), int(c1['c']['height'] * s)
K1 = c1['K'].copy(); K2 = c2['K'].copy(); K1[:2] *= s; K2[:2] *= s
R = c2['Rcw'] @ c1['Rcw'].T; T = (c2['Rcw'] @ (c1['C'] - c2['C'])).reshape(3, 1)
R1, R2, P1, P2, Qm, *_ = cv2.stereoRectify(K1, c1['dist'], K2, c2['dist'], (W, H), R, T, flags=cv2.CALIB_ZERO_DISPARITY, alpha=0)
m1 = cv2.initUndistortRectifyMap(K1, c1['dist'], R1, P1, (W, H), cv2.CV_32FC1); m2 = cv2.initUndistortRectifyMap(K2, c2['dist'], R2, P2, (W, H), cv2.CV_32FC1)
cache = '/tmp/vpick_rect.npz'
if os.path.exists(cache): z = np.load(cache); i1, i2 = z['a'], z['b']
else:
    i1 = cv2.remap(cv2.resize(cv2.imread(c1['path']), (W, H), interpolation=cv2.INTER_AREA), *m1, cv2.INTER_LINEAR); i2 = cv2.remap(cv2.resize(cv2.imread(c2['path']), (W, H), interpolation=cv2.INTER_AREA), *m2, cv2.INTER_LINEAR)
    np.savez(cache, a=i1, b=i2)
_cl = cv2.createCLAHE(3.0, (8, 8))
g1 = _cl.apply(cv2.cvtColor(i1, cv2.COLOR_BGR2GRAY)).astype(np.float32); g2 = _cl.apply(cv2.cvtColor(i2, cv2.COLOR_BGR2GRAY)).astype(np.float32)
def grid(img, u0, v0, step=50):
    for x in range((u0 // step + 1) * step, u0 + img.shape[1], step): cv2.line(img, (x - u0, 0), (x - u0, img.shape[0]), (0, 255, 255), 1); cv2.putText(img, str(x), (x - u0 + 2, 12), 0, 0.45, (0, 255, 255), 1)
    for y in range((v0 // step + 1) * step, v0 + img.shape[0], step): cv2.line(img, (0, y - v0), (img.shape[1], y - v0), (255, 255, 0), 1); cv2.putText(img, str(y), (2, y - v0 - 2), 0, 0.45, (255, 255, 0), 1)
def match(u, v, half=14, d0=255, d1=305):
    p = g1[int(v) - half:int(v) + half + 1, int(u) - half:int(u) + half + 1]
    if p.shape != (2 * half + 1, 2 * half + 1): return None
    best = []
    for d in range(d0, d1):
        x = int(u) - d; q = g2[int(v) - half:int(v) + half + 1, x - half:x + half + 1]
        if x - half < 0 or q.shape != p.shape: best.append(-1); continue
        best.append(float(np.corrcoef(p.ravel(), q.ravel())[0, 1]))
    best = np.array(best); j = int(np.argmax(best))
    if 0 < j < len(best) - 1:
        den = best[j - 1] - 2 * best[j] + best[j + 1]; dj = 0.5 * (best[j - 1] - best[j + 1]) / den if den != 0 else 0
    else: dj = 0
    return d0 + j + dj, float(best[j]), float(np.sort(best)[-2] if len(best) > 1 else 0)
def to_quay(u, v, disp):
    X = cv2.perspectiveTransform(np.array([[[u, v, disp]]], np.float32), Qm).reshape(3); Pc = X @ R1; Pw = Pc @ c1['Rcw'] + c1['C']
    q = np.array([Pw[0], Pw[2]]) - Q0; return (float(q @ QU), float(q @ QN), float(Pw[1])), Pw
if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd in ('crop', 'cropr'):
        u0, v0, u1, v1 = map(int, sys.argv[2:6]); src = i1 if cmd == 'crop' else i2
        c = src[v0:v1, u0:u1].copy(); grid(c, u0, v0); cv2.imwrite(sys.argv[6], c)
    else:
        out = []
        for a in sys.argv[2:]:
            n, u, v = a.split(':'); r = match(float(u), float(v))
            if r is None: print(n, 'edge'); continue
            disp, sc, second = r; (qa, qd, qy), Pw = to_quay(float(u), float(v), disp)
            print(f'{n:14s} u {u:>6} v {v:>6} disp {disp:7.2f} ncc {sc:.2f} (2nd {second:.2f})  a {qa:6.2f} d {qd:6.2f} y {qy:5.2f}')
