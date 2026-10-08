"""[v6:fix3] Cut raw photo pixels of the berthed vessel onto planes of the quay frame (a along the quay line, d out to sea, y T.P.).
  raw/survey/.venv/bin/python tools/survey/vessel_cut.py d=2.0 IMG_0861:1480:1650 ...    # ray x plane d = 2.0  -> a, y
  raw/survey/.venv/bin/python tools/survey/vessel_cut.py r=57 IMG_0861:1480:1650 ...     # point at range r (depth along the optical axis) -> a, d, y
  raw/survey/.venv/bin/python tools/survey/vessel_cut.py proj IMG_0861 a,d,y ...         # project quay-frame points into a photo (raw px)
"""
import json, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import market_features as mf
M = json.load(open(os.path.join(mf.ROOT, 'data/survey/market/model.json')))['hall']['quay']
Q0 = np.array(M['p0']); Q1 = np.array(M['p1']); L = np.linalg.norm(Q1 - Q0); QU = (Q1 - Q0) / L; QN = np.array([QU[1], -QU[0]])
cams = mf.load_cams()
def to_quay(P): q = np.array([P[0], P[2]]) - Q0; return float(q @ QU), float(q @ QN), float(P[1])
def from_quay(a, d, y): q = Q0 + QU * a + QN * d; return np.array([q[0], y, q[1]])
def cut_d(pid, u, v, d):
    cam = cams[pid]; r = mf.ray(cam, (u, v)); C = cam['C']
    # plane: (x,z) . QN = Q0 . QN + d
    n = np.array([QN[0], 0, QN[1]]); off = Q0 @ QN + d
    t = (off - C @ n) / (r @ n); return to_quay(C + r * t)
def cut_y(pid, u, v, y):
    cam = cams[pid]; r = mf.ray(cam, (u, v)); t = (y - cam['C'][1]) / r[1]; return to_quay(cam['C'] + r * t)
def at_range(pid, u, v, rng):
    cam = cams[pid]; r = mf.ray(cam, (u, v)); axis = cam['Rcw'][2]; t = rng / (r @ axis); return to_quay(cam['C'] + r * t)
def proj(pid, a, d, y): uv, z = mf.project(cams[pid], from_quay(a, d, y)); return uv[0], z[0]
if __name__ == '__main__':
    mode = sys.argv[1]
    if mode == 'proj':
        for s in sys.argv[3:]:
            a, d, y = map(float, s.split(',')); uv, z = proj(sys.argv[2], a, d, y); print(f'{s:22s} -> u {uv[0]:8.1f} v {uv[1]:8.1f}  (depth {z:.1f})')
    else:
        k, val = mode.split('='); val = float(val)
        for s in sys.argv[2:]:
            p = s.split(':'); u, v = float(p[1]), float(p[2])
            if k == 'd': a, _, y = cut_d(p[0], u, v, val); print(f'{s:24s} a {a:7.2f} d {val:5.2f} y {y:6.2f}')
            elif k == 'y': a, d, yy = cut_y(p[0], u, v, val); print(f'{s:24s} a {a:7.2f} d {d:6.2f} y {yy:6.2f}')
            else: a, d, y = at_range(p[0], u, v, val); print(f'{s:24s} a {a:7.2f} d {d:6.2f} y {y:6.2f}')
