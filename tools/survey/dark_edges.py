"""[v6:fix2] How much of a photo-align chamfer sits in photo regions that are black? For the --dump maps: the app-edge pixels whose 9x9 neighbourhood of the (resized, 77 mm = undistorted) photo has a mean luminance < LUM and a local contrast (max - min) < CON cannot have a photo edge to match (the dawn frames' under-roof is crushed to black): their mean distance, and the chamfer of the rest.
  raw/survey/.venv/bin/python tools/survey/dark_edges.py IMG_0853 IMG_0854 ... [--lum 28 --con 22]"""
import sys, os
import cv2, numpy as np
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
args = [a for a in sys.argv[1:] if not a.startswith('--')]
lum = float(sys.argv[sys.argv.index('--lum') + 1]) if '--lum' in sys.argv else 28.0
con = float(sys.argv[sys.argv.index('--con') + 1]) if '--con' in sys.argv else 22.0
args = [a for a in args if a.startswith('IMG_')]
tot_all = []
for pid in args:
    e = cv2.imread(os.path.join(ROOT, f'docs/shots/v6_survey/market/edges_{pid}.png'))[:, :, ::-1]; app = e[:, :, 0] > 0; d = e[:, :, 1] / 4.0
    im = cv2.resize(cv2.imread(os.path.join(ROOT, f'raw/survey/market/images/t77/{pid}.jpg')), (e.shape[1], e.shape[0]), interpolation=cv2.INTER_AREA)
    g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY).astype(np.float32)
    k = np.ones((9, 9), np.uint8)
    mean = cv2.blur(g, (9, 9)); cmax = cv2.dilate(g, k); cmin = cv2.erode(g, k)
    dark = (mean < lum) & ((cmax - cmin) < con)
    n = app.sum(); nd = (app & dark).sum()
    print(f'{pid}: {n} app edge px, mean {d[app].mean():.2f}; {nd} ({100 * nd / n:.1f} %) lie in black, flat photo regions (mean lum < {lum:.0f}, contrast < {con:.0f}), their mean distance {d[app & dark].mean():.1f}; the other {n - nd}: mean {d[app & ~dark].mean():.2f} px, p90 {np.quantile(d[app & ~dark], 0.9):.1f}')
