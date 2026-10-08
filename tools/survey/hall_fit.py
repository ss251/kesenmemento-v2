"""[v6:fix2] Fit the quay hall's ceiling members (long beams, edge beam, transverse beams, the slab level; data/survey/market/model.json hall) to the five dawn frames.
The longitudinal members run along the stands' baseline, so a photo line fixes only a one-parameter family (d, height): any member of the family projects onto the same
image line from both stands. The first build drew the structurally plausible member; here each member's (d, bottom) is moved along that valley, within +-2.5 m / +-0.45 m of it,
to where the frames' edges are: the mean clipped distance (px at the 1080 frame) of the member's edge lines to the photo's Canny edges, over the 5 frames.
  raw/survey/.venv/bin/python tools/survey/hall_fit.py [--write]"""
import argparse, json, os, sys
import cv2, numpy as np
from scipy.optimize import minimize
sys.path.insert(0, os.path.dirname(__file__))
import market_features as mf
ROOT = mf.ROOT
MP = os.path.join(ROOT, 'data/survey/market/model.json'); M = json.load(open(MP)); H = M['hall']; Qd = H['quay']
Q0 = np.array(Qd['p0']); Q1 = np.array(Qd['p1']); L = np.linalg.norm(Q1 - Q0); QU = (Q1 - Q0) / L; QN = np.array([QU[1], -QU[0]])
def enu(a, d, y): p = Q0 + QU * a + QN * d; return [p[0], y, p[1]]
cams = {k: v for k, v in mf.load_cams().items() if v['cluster'] == 'canopy'}
def canny_like(rgb, sigma=1.4, lowQ=0.8, highQ=0.92):
    """the edge map of tools/anime/photo-align.mjs canny(): Gaussian, 3x3 Sobel, NMS on 4 directions, hysteresis thresholds at gradient quantiles of the NMS survivors"""
    g = (0.299 * rgb[:, :, 2] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 0]).astype(np.float32)
    b = cv2.GaussianBlur(g, (0, 0), sigma)
    gx = cv2.Sobel(b, cv2.CV_32F, 1, 0, ksize=3); gy = cv2.Sobel(b, cv2.CV_32F, 0, 1, ksize=3); mag = np.hypot(gx, gy)
    ang = (np.degrees(np.arctan2(gy, gx)) + 180) % 180; d = np.where((ang < 22.5) | (ang >= 157.5), 0, np.where(ang < 67.5, 1, np.where(ang < 112.5, 2, 3)))
    nms = np.zeros_like(mag); OFF = [(1, 0), (1, 1), (0, 1), (-1, 1)]
    for k, (dx, dy) in enumerate(OFF):
        m = d == k; a = np.roll(mag, (-dy, -dx), (0, 1)); c = np.roll(mag, (dy, dx), (0, 1)); sel = m & (mag >= a) & (mag >= c); nms[sel] = mag[sel]
    v = nms[nms > 0][::7]; lo, hi = np.quantile(v, lowQ), np.quantile(v, highQ)
    e = (nms >= hi).astype(np.uint8); weak = (nms >= lo).astype(np.uint8)
    n, lab = cv2.connectedComponents(np.maximum(e, weak), connectivity=8)
    keep = np.unique(lab[e > 0]); out = np.isin(lab, keep[keep > 0]) & (weak > 0)
    return out
sc = 1080.0 / 3024.0; dts = {}
for k, c in cams.items():
    im = cv2.resize(cv2.imread(c['path']), (1080, 1440), interpolation=cv2.INTER_AREA)
    ed = canny_like(im); dts[k] = cv2.distanceTransform((~ed).astype(np.uint8), cv2.DIST_L2, 3)
A0, A1 = 20.0, 150.0; Y1F = H['soffit']; DL = H['face'] - 34.5
def lines(x):
    """x = [d0, b0, d1, b1, d2, b2, Eb, T59, T81, T103, y1F]"""
    out = {}
    for i, key in enumerate(('long0', 'long1', 'long2')):
        Lg = H['long'][i]; d, b = x[2 * i], x[2 * i + 1]; w = Lg['w']
        out[key] = [((A0, d - w / 2, b), (A1, d - w / 2, b)), ((A0, d + w / 2, b), (A1, d + w / 2, b)), ((A0, d - w / 2, x[10]), (A1, d - w / 2, x[10]))]
    E = H['edge']; out['edge'] = [((A0, E['d'] - E['w'] / 2, x[6]), (A1, E['d'] - E['w'] / 2, x[6])), ((A0, E['d'] + E['w'] / 2, x[6]), (A1, E['d'] + E['w'] / 2, x[6]))]
    T = H['trans']; tl = {}
    for n, xi in ((0, 7), (1, 8), (2, 9)):
        a = T['a0'] + n * T['pitch']; tl[f'trans{n}'] = [((a + sd * T['w'] / 2, DL + 0.1, x[xi]), (a + sd * T['w'] / 2, H['face'], x[xi])) for sd in (-1, 1)]
    out.update(tl)
    out['slab'] = [((A0, H['face'], x[10]), (A1, H['face'], x[10]))]
    return out
def score(segs, k):
    cam = cams[k]; dt = dts[k]; Hh, Ww = dt.shape; tot = []
    for p, q in segs:
        p, q = np.array(p), np.array(q); n = max(8, int(np.linalg.norm(q - p) / 0.4)); t = np.linspace(0, 1, n)[:, None]; pts = p[None] + (q - p)[None] * t
        P = np.array([enu(*x) for x in pts]); uv, z = mf.project(cam, P)
        ok = (z > 1) & (uv[:, 0] * sc > 3) & (uv[:, 0] * sc < Ww - 3) & (uv[:, 1] * sc > 3) & (uv[:, 1] * sc < Hh - 3)
        if ok.sum() < 5: continue
        tot.append(np.minimum(dt[(uv[ok, 1] * sc).astype(int), (uv[ok, 0] * sc).astype(int)], 60.0))
    return float(np.mean(np.concatenate(tot))) if tot else None
X0 = np.array([H['long'][0]['d'], H['long'][0]['bottom'], H['long'][1]['d'], H['long'][1]['bottom'], H['long'][2]['d'], H['long'][2]['bottom'], H['edge']['bottom'], H['trans']['bottom'], H['trans']['bottom'], H['trans']['bottom'], H['soffit']])
def obj(x, report=False):
    Ls = lines(x); per = {}
    for key, segs in Ls.items():
        v = [score(segs, k) for k in cams]; v = [a for a in v if a is not None]; per[key] = float(np.mean(v)) if v else 60.0
    pri = 0.0
    for i in (0, 2, 4): pri += ((x[i] - X0[i]) / 2.5) ** 2
    for i in (1, 3, 5, 6, 7, 8, 9, 10): pri += ((x[i] - X0[i]) / 0.45) ** 2
    tot = sum(per.values()) + 0.4 * pri
    return (tot, per) if report else tot
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('--write', action='store_true'); a = ap.parse_args()
    c0, p0 = obj(X0, True); print('start', round(c0, 2), {k: round(v, 1) for k, v in p0.items()})
    FREE = [0, 1, 2, 3, 5, 6, 7, 8]       # d2 stays on the columns (d -21.4), y1F at the measured slab, T103 out of every frame
    FREE = [0, 1, 2, 3, 5, 6]            # the transverse beams stay at the SURVEYED 7.76 (canopy.beam_t1.y); y1F at the measured slab
    def f(z):
        x = X0.copy(); x[FREE] = z; return obj(x)
    r0 = minimize(f, X0[FREE], method='Powell', options=dict(xtol=0.01, ftol=1e-3, maxiter=80)); r = type('R', (), {})(); r.x = X0.copy(); r.x[FREE] = r0.x
    c1, p1 = obj(r.x, True); print('fit', round(c1, 2), {k: round(v, 1) for k, v in p1.items()})
    names = ['d0', 'b0', 'd1', 'b1', 'd2', 'b2', 'Eb', 'T59', 'T81', 'T103', 'y1F']
    for n, v0, v1 in zip(names, X0, r.x): print(f'  {n:4s} {v0:7.2f} -> {v1:7.2f}')
    json.dump(r.x.tolist(), open('/tmp/hall_fit.json', 'w'))
