"""[v6:fix2] Fit the berthed vessel's boxes (hull, lower deck, deckhouse, funnel fin; data/survey/market/model.json hall.vessel) to the five dawn frames: each component's edges
(sampled every 0.2 m) are projected through the SOLVED cameras and scored against the photo's Canny edges (distance, clipped at 40 px; the occluded part of an edge simply
scores badly and costs the same in every candidate); free per component: a shift along the quay (a), out to sea (d) and in height, with priors (2 m). The frames
come from two stands 1.6 m apart, so the depth of each component is fixed by its parallax between the stands.
  raw/survey/.venv/bin/python tools/survey/vessel_fit.py [--write]"""
import argparse, json, os, sys
import cv2, numpy as np
from scipy.optimize import minimize
sys.path.insert(0, os.path.dirname(__file__))
import market_features as mf
ROOT = mf.ROOT
MP = os.path.join(ROOT, 'data/survey/market/model.json'); M = json.load(open(MP)); V = M['hall']['vessel']; Qd = M['hall']['quay']
Q0 = np.array(Qd['p0']); Q1 = np.array(Qd['p1']); L = np.linalg.norm(Q1 - Q0); QU = (Q1 - Q0) / L; QN = np.array([QU[1], -QU[0]])
def enu(a, d, y): p = Q0 + QU * a + QN * d; return [p[0], y, p[1]]
cams = {k: v for k, v in mf.load_cams().items() if v['cluster'] == 'canopy'}
sc = 0.25; dts = {}
for k, c in cams.items():
    im = cv2.imread(c['path']); g = cv2.GaussianBlur(cv2.cvtColor(cv2.resize(im, None, fx=sc, fy=sc, interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY), (0, 0), 1.2)
    ed = cv2.Canny(g, 20, 60); dts[k] = cv2.distanceTransform((ed == 0).astype(np.uint8), cv2.DIST_L2, 3) / sc
def box_edges(a0, a1, d0, d1, y0, y1):
    P = lambda a, d, y: np.array([a, d, y])
    c = [P(a, d, y) for a in (a0, a1) for d in (d0, d1) for y in (y0, y1)]
    idx = [(0, 1), (2, 3), (4, 5), (6, 7), (0, 2), (1, 3), (4, 6), (5, 7), (0, 4), (1, 5), (2, 6), (3, 7)]
    return [(c[i], c[j]) for i, j in idx]
def comps(prm):
    """component name -> list of edges (a, d, y) given the shifts prm = {name: (da, dd, dy)}"""
    out = {}
    h = V['hull']; ha = [p[0] for p in h]; hd = [p[1] for p in h]
    da, dd, dy = prm['hull']; out['hull'] = box_edges(min(ha) + da, max(ha) + da, min(hd) + dd, max(hd) + dd, V['floor'], V['sheer'] + dy)
    for nm in ('lower', 'house'):
        c = V[nm]; da, dd, dy = prm[nm]; out[nm] = box_edges(c['a'][0] + da, c['a'][1] + da, c['d'][0] + dd, c['d'][1] + dd, V['sheer'] + (dy if nm == 'house' else 0), c['top'] + dy)
    f = V['fin']; da, dd, dy = prm['fin']; out['fin'] = box_edges(f['a'][0] + da, f['a'][1] + da, f['d'][0] + dd, f['d'][1] + dd, f['base'] - 0.5, f['top'] + dy)
    return out
def score(edges, k):
    cam = cams[k]; dt = dts[k]; H, W = dt.shape; tot = []; 
    for p, q in edges:
        n = max(3, int(np.linalg.norm(q - p) / 0.25)); t = np.linspace(0, 1, n)[:, None]; pts = p[None] + (q - p)[None] * t
        P = np.array([enu(*x) for x in pts]); uv, z = mf.project(cam, P)
        ok = (z > 1) & (uv[:, 0] * sc > 3) & (uv[:, 0] * sc < W - 3) & (uv[:, 1] * sc > 3) & (uv[:, 1] * sc < H - 3)
        if ok.sum() == 0: continue
        d = dt[(uv[ok, 1] * sc).astype(int), (uv[ok, 0] * sc).astype(int)]; tot.append(np.minimum(d, 40.0))
    return float(np.mean(np.concatenate(tot))) if tot else 40.0
NAMES = ['hull', 'lower', 'house', 'fin']
def unpack(x): return {n: tuple(x[3 * i:3 * i + 3]) for i, n in enumerate(NAMES)}
def obj(x, report=False):
    prm = unpack(x); E = comps(prm); tot = 0; per = {}
    for n in NAMES:
        s_ = np.mean([score(E[n], k) for k in cams]); per[n] = s_; tot += s_
    pri = sum((v / 2.0) ** 2 for v in x) * 0.05
    # physical limit: the hull's near face stays beyond the surveyed curb (d -0.5): its shift is at least -0.9 m and at most +1.5 m
    for i in range(4): pri += 30.0 * (max(0.0, -0.9 - x[3 * i + 1]) ** 2 + max(0.0, x[3 * i + 1] - 1.5) ** 2)
    return (tot + pri, per) if report else tot + pri
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('--write', action='store_true'); a = ap.parse_args()
    x0 = np.zeros(12); c0, p0 = obj(x0, True); print('start', round(c0, 2), {k: round(v, 1) for k, v in p0.items()})
    best = (c0, x0)
    # coarse grid for the dominant shifts (da, dd) of the whole vessel, then Powell
    for da in np.arange(-6, 6.1, 1.5):
        for dd in np.arange(-6, 6.1, 1.5):
            x = np.zeros(12); x[0::3] = da; x[1::3] = dd; c = obj(x)
            if c < best[0]: best = (c, x)
    print('grid best', round(best[0], 2), best[1][:2])
    r = minimize(obj, best[1], method='Powell', options=dict(xtol=0.05, ftol=1e-3, maxiter=60))
    c1, p1 = obj(r.x, True); print('fit', round(c1, 2), {k: round(v, 1) for k, v in p1.items()})
    for n, v in unpack(r.x).items(): print(f'  {n:6s} da {v[0]:6.2f} dd {v[1]:6.2f} dy {v[2]:5.2f}')
    json.dump(r.x.tolist(), open('/tmp/vessel_fit.json', 'w'))
