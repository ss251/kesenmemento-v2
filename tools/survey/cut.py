"""Cut raw-pixel picks of deck points onto the deck plane (T.P. 15.585 + h) -> wall frame (s, off).
  raw/survey/.venv/bin/python tools/survey/cut.py IMG_0793:650:3148[:h] ...   (u, v in the RAW photo pixels)"""
import sys, os, json
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import market_features as mf
M = json.load(open(os.path.join(mf.ROOT, 'data/survey/market/model.json')))
FR = M['frame']; O = np.array(FR['o']); U = np.array(FR['u']); N = np.array(FR['n']); Y = M['deck']['y']
cams = mf.load_cams()
def cut(pid, u, v, h=0.0):
    cam = cams[pid]; d = mf.ray(cam, (u, v)); t = (Y + h - cam['C'][1]) / d[1]
    P = cam['C'] + d * t; q = np.array([P[0], P[2]]) - O
    return q @ U, q @ N, t
if __name__ == '__main__':
    for a in sys.argv[1:]:
        p = a.split(':'); h = float(p[3]) if len(p) > 3 else 0.0
        s, o, t = cut(p[0], float(p[1]), float(p[2]), h); print(f'{a:28s} s {s:7.2f} off {o:6.2f} range {t:5.1f}')

def tri(cams_, obs):
    """two-view midpoint of picks [(photo, u, v), ...] -> (s, off, height above the deck, ray miss m)"""
    import numpy as np
    (pa, ua, va), (pb, ub, vb) = obs[:2]
    ca, cb = cams_[pa], cams_[pb]; da = mf.ray(ca, (ua, va)); db = mf.ray(cb, (ub, vb))
    A = np.array([[da @ da, -da @ db], [da @ db, -db @ db]]); r = np.array([(cb['C'] - ca['C']) @ da, (cb['C'] - ca['C']) @ db])
    t = np.linalg.solve(A, r); P1 = ca['C'] + da * t[0]; P2 = cb['C'] + db * t[1]; P = (P1 + P2) / 2; q = np.array([P[0], P[2]]) - O
    return q @ U, q @ N, P[1] - Y, np.linalg.norm(P1 - P2)
