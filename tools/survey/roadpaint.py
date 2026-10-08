"""Survey step 5: road paint, orthorectified from the solved photos into ENU polygons.

  raw/survey/.venv/bin/python tools/survey/roadpaint.py --area minami --bbox x0,z0,x1,z1 --y 2.1 [--cell 0.06] IMG ...

Each photo (the undistorted 1080 x 1440 frame, the left half of docs/shots/v6_survey/<area>/pair_*.jpg) is back-projected
through its solved camera onto the road plane y = const; bright, unsaturated pixels (white paint on asphalt) vote into a
top-down grid inside the bbox, per-cell paint fraction over the views that see it. The grid is cleaned, vectorised and written
as ENU polygons to data/survey/<area>/road-paint.json (vector only: no photo content is stored). Dark / small blobs
(texture, cracks, cars) are dropped by area, the polygons simplified to 4 cm.
"""
import argparse, json, os, sys
import numpy as np, cv2
sys.path.insert(0, os.path.dirname(__file__))
from scipy.spatial.transform import Rotation

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ap = argparse.ArgumentParser()
ap.add_argument('imgs', nargs='+'); ap.add_argument('--area', default='minami'); ap.add_argument('--bbox', required=True)
ap.add_argument('--y', type=float, default=2.1); ap.add_argument('--cell', type=float, default=0.06)
ap.add_argument('--maxrange', type=float, default=18.0); ap.add_argument('--out', default=None)
ap.add_argument('--poly', default=None, help='optional ROI polygon x,z;x,z;... (ENU) outside which nothing is kept')
ap.add_argument('--thr', type=float, default=40.0, help='brightness above the local asphalt median')
a = ap.parse_args()
x0, z0, x1, z1 = [float(v) for v in a.bbox.split(',')]
D = json.load(open(os.path.join(ROOT, 'data/survey', a.area, 'cameras.json')))
CAMS = {c['id']: c for c in D['cameras'] if c.get('registered') is not False and c.get('position')}
nx, nz = int((x1 - x0) / a.cell), int((z1 - z0) / a.cell)
white = np.zeros((nz, nx), np.float32); seen = np.zeros((nz, nx), np.float32)
roi = None
if a.poly:
    pts = np.array([[(float(p.split(',')[0]) - x0) / a.cell, (float(p.split(',')[1]) - z0) / a.cell] for p in a.poly.split(';')], np.int32)
    roi = np.zeros((nz, nx), np.uint8); cv2.fillPoly(roi, [pts], 1)
for iid in a.imgs:
    iid = 'IMG_' + iid.replace('IMG_', '')
    c = CAMS[iid]; s = 1440.0 / c['height']
    R = Rotation.from_quat(c['quaternion']).as_matrix(); C = np.array(c['position'])
    pair = cv2.imread(os.path.join(ROOT, 'docs/shots/v6_survey', a.area, 'pair_%s.jpg' % iid))
    img = pair[:, :pair.shape[1] // 2]; H, W = img.shape[:2]
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV); V = hsv[:, :, 2].astype(np.float32); S = hsv[:, :, 1].astype(np.float32)
    vv, uu = np.mgrid[0:H:2, 0:W:2]; uu = uu.astype(np.float64) + 1; vv = vv.astype(np.float64) + 1
    d = np.stack([(uu / s - c['cx']) / c['fx'], -(vv / s - c['cy']) / c['fy'], -np.ones_like(uu)], -1) @ R.T
    d /= np.linalg.norm(d, axis=-1, keepdims=True)
    ok = d[..., 1] < -0.02
    k = np.where(ok, (a.y - C[1]) / np.where(ok, d[..., 1], -1), 0)
    ok &= (k > 1.5) & (k < a.maxrange)
    X = C[0] + k * d[..., 0]; Z = C[2] + k * d[..., 2]
    ix = ((X - x0) / a.cell).astype(int); iz = ((Z - z0) / a.cell).astype(int)
    ok &= (ix >= 0) & (ix < nx) & (iz >= 0) & (iz < nz)
    Vs = V[::2, ::2]; Ss = S[::2, ::2]
    med = np.median(Vs[ok]) if ok.any() else 100
    # local asphalt level: the median of the valid pixels of the same row band
    paint = (Vs > med + a.thr) & (Ss < 60)
    # the photo's own sampling is far coarser than the grid cell near the camera: splat each pixel over its footprint
    for (r, q) in zip(*np.nonzero(ok)):
        gx, gz = ix[r, q], iz[r, q]
        fp = max(1, int(round(k[r, q] * 2 / c['fx'] / s * 1.0 / a.cell)))   # 2 px at range k, in cells
        xa, xb, za, zb = max(0, gx - fp // 2), min(nx, gx + fp // 2 + 1), max(0, gz - fp // 2), min(nz, gz + fp // 2 + 1)
        seen[za:zb, xa:xb] += 1
        if paint[r, q]: white[za:zb, xa:xb] += 1
    print(iid, 'valid px', int(ok.sum()), 'median V', float(med), 'paint px', int((paint & ok).sum()))
frac = np.where(seen > 0, white / np.maximum(seen, 1), 0)
m = ((frac > 0.5) & (seen >= 2)).astype(np.uint8)
if roi is not None: m &= roi
m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8)); m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
cnts, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
polys = []
for cn in cnts:
    area = cv2.contourArea(cn) * a.cell * a.cell
    if area < 0.12: continue
    ap_ = cv2.approxPolyDP(cn, 0.04 / a.cell, True).reshape(-1, 2)
    if len(ap_) < 3: continue
    polys.append([[round(x0 + p[0] * a.cell, 2), round(z0 + p[1] * a.cell, 2)] for p in ap_])
out = a.out or os.path.join(ROOT, 'data/survey', a.area, 'road-paint.json')
json.dump({'note': 'White road paint orthorectified from the solved photos (tools/survey/roadpaint.py): ENU [x, z] polygons on the road plane; photos used: ' + ', '.join(a.imgs), 'y': a.y, 'cell': a.cell, 'bbox': [x0, z0, x1, z1], 'polys': polys}, open(out, 'w'))
vis = cv2.cvtColor((m * 255).astype(np.uint8), cv2.COLOR_GRAY2BGR)
if os.environ.get('ROADPAINT_PREVIEW'): cv2.imwrite(os.environ['ROADPAINT_PREVIEW'], cv2.resize(vis, None, fx=0.5, fy=0.5, interpolation=cv2.INTER_AREA))   # optional debug picture of the mask
print(len(polys), 'polygons ->', out)
