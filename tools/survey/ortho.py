"""Survey helper: orthorectify the ground from the solved photos into a top-down colour plan (ENU), for reading paving bands, kerbs and paint.

  raw/survey/.venv/bin/python tools/survey/ortho.py --bbox x0,z0,x1,z1 --y 1.85 --out plan.jpg [--cell 0.05] [--maxrange 14] IMG ...

Each photo (the undistorted 1080 x 1440 frame: the left half of docs/shots/v6_survey/<area>/pair_*.jpg) is back-projected through its solved
camera onto the plane y = const; the plan holds the mean colour over the views that see each cell, with a 5 m grid labelled in ENU. The plan embeds
the photos' pixels, so it stays in the scratchpad / gitignored folders; only measurements read off it enter data/ and src/.
"""
import argparse, json, os, sys
import numpy as np, cv2
from scipy.spatial.transform import Rotation
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ap = argparse.ArgumentParser()
ap.add_argument('imgs', nargs='+'); ap.add_argument('--area', default='minami'); ap.add_argument('--bbox', required=True)
ap.add_argument('--y', type=float, default=1.85); ap.add_argument('--cell', type=float, default=0.05); ap.add_argument('--maxrange', type=float, default=14.0)
ap.add_argument('--out', required=True); ap.add_argument('--minrange', type=float, default=1.5)
a = ap.parse_args()
x0, z0, x1, z1 = [float(v) for v in a.bbox.split(',')]
D = json.load(open(os.path.join(ROOT, 'data/survey', a.area, 'cameras.json')))
CAMS = {c['id']: c for c in D['cameras'] if c.get('registered') is not False and c.get('position')}
nx, nz = int((x1 - x0) / a.cell), int((z1 - z0) / a.cell)
acc = np.zeros((nz, nx, 3), np.float32); cnt = np.zeros((nz, nx), np.float32)
for iid in a.imgs:
    iid = 'IMG_' + iid.replace('IMG_', '')
    c = CAMS[iid]; s = 1440.0 / c['height']
    R = Rotation.from_quat(c['quaternion']).as_matrix(); C = np.array(c['position'])
    pair = cv2.imread(os.path.join(ROOT, 'docs/shots/v6_survey', a.area, 'pair_%s.jpg' % iid))
    img = pair[:, :pair.shape[1] // 2].astype(np.float32); H, W = img.shape[:2]
    vv, uu = np.mgrid[0:H, 0:W]; uu = uu.astype(np.float64) + 0.5; vv = vv.astype(np.float64) + 0.5
    d = np.stack([(uu / s - c['cx']) / c['fx'], -(vv / s - c['cy']) / c['fy'], -np.ones_like(uu)], -1) @ R.T
    d /= np.linalg.norm(d, axis=-1, keepdims=True)
    ok = d[..., 1] < -0.02
    k = np.where(ok, (a.y - C[1]) / np.where(ok, d[..., 1], -1), 0)
    ok &= (k > a.minrange) & (k < a.maxrange)
    X = C[0] + k * d[..., 0]; Z = C[2] + k * d[..., 2]
    ix = ((X - x0) / a.cell).astype(int); iz = ((Z - z0) / a.cell).astype(int)
    ok &= (ix >= 0) & (ix < nx) & (iz >= 0) & (iz < nz)
    r, q = np.nonzero(ok)
    w = 1.0 / np.maximum(k[r, q], 1) ** 2   # near pixels are sharper
    np.add.at(acc, (iz[r, q], ix[r, q]), img[r, q] * w[:, None]); np.add.at(cnt, (iz[r, q], ix[r, q]), w)
    print(iid, int(ok.sum()))
plan = np.where(cnt[..., None] > 0, acc / np.maximum(cnt[..., None], 1e-9), 255).astype(np.uint8)
# fill the splat gaps (far cells are sparse): a small dilation of the empty mask
empty = (cnt == 0).astype(np.uint8)
plan = cv2.inpaint(plan, cv2.dilate(empty, np.ones((3, 3), np.uint8)) & empty, 3, cv2.INPAINT_TELEA) if empty.any() else plan
for gx in range(int(np.ceil(x0 / 5) * 5), int(x1), 5):
    X = int((gx - x0) / a.cell); cv2.line(plan, (X, 0), (X, nz), (0, 255, 255), 1); cv2.putText(plan, str(gx), (X + 3, 16), 0, 0.6, (0, 255, 255), 2)
for gz in range(int(np.ceil(z0 / 5) * 5), int(z1), 5):
    Y = int((gz - z0) / a.cell); cv2.line(plan, (0, Y), (nx, Y), (255, 255, 0), 1); cv2.putText(plan, str(gz), (3, Y - 4), 0, 0.6, (255, 255, 0), 2)
cv2.imwrite(a.out, plan, [cv2.IMWRITE_JPEG_QUALITY, 90])
print('plan', plan.shape, '->', a.out)
