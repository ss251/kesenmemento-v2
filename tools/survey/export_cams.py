"""Survey step 2c: export the solved ENU model to the shared camera schema (raw/survey/COORD.md) and a sparse point cloud.

  raw/survey/.venv/bin/python tools/survey/export_cams.py --area minami [--model raw/survey/minami/enu]

Writes data/survey/<area>/cameras.json:
  { area, frame, cameras: [{ id, image, lens, camera_model, width, height, fx, fy, cx, cy, dist: [k1, k2, p1, p2],
      position: [x, y, z] ENU, quaternion: [x, y, z, w] (three.js camera -> ENU; the camera looks down its -z),
      yaw, pitch, roll (deg, three.js Euler 'YXZ'), heading_deg (compass bearing of the view), reproj_px, obs, registered }] }
  (photos that did not register are listed with registered: false and their GPS / compass only)
and raw/survey/<area>/points.ply (sparse ENU points, x y z + the number of views; gitignored with raw/).
"""
import argparse
import json
import os
import sys

import numpy as np
from scipy.spatial.transform import Rotation

sys.path.insert(0, os.path.dirname(__file__))
import slib  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument('--area', default='minami')
ap.add_argument('--model', default=None)
a = ap.parse_args()
RAW = os.path.join(slib.ROOT, 'raw/survey', a.area)
MOD = a.model or os.path.join(RAW, 'enu')
OUTD = os.path.join(slib.ROOT, 'data/survey', a.area)
os.makedirs(OUTD, exist_ok=True)
solve = json.load(open(os.path.join(MOD, 'solve.json')))
cams = {}
for line in open(os.path.join(MOD, 'cameras.txt')):
    if line.startswith('#') or not line.strip():
        continue
    s = line.split()
    p = [float(v) for v in s[4:]]
    if s[1] == 'OPENCV':
        cams[int(s[0])] = dict(model='OPENCV', w=int(s[2]), h=int(s[3]), fx=p[0], fy=p[1], cx=p[2], cy=p[3], dist=p[4:8])
    else:
        cams[int(s[0])] = dict(model=s[1], w=int(s[2]), h=int(s[3]), fx=p[0], fy=p[0], cx=p[1], cy=p[2], dist=[p[3], p[4], 0.0, 0.0])
lines = [l for l in open(os.path.join(MOD, 'images.txt')) if not l.startswith('#')]
out = []
seen = set()
for k in range(0, len(lines), 2):
    s = lines[k].split()
    q = [float(v) for v in s[1:5]]
    t = np.array([float(v) for v in s[5:8]])
    cid, name = int(s[8]), s[9]
    Rcw = Rotation.from_quat([q[1], q[2], q[3], q[0]]).as_matrix()
    C = -Rcw.T @ t
    R3 = Rcw.T @ slib.FLIP  # three.js camera -> ENU
    yaw, pitch, roll = slib.three_euler_yxz(R3)
    fwd = Rcw.T @ np.array([0, 0, 1.0])
    heading = float(np.degrees(np.arctan2(fwd[0], -fwd[2])) % 360)
    c = cams[cid]
    iid = slib.img_id(name)
    seen.add(iid)
    pi = solve['per_image'].get(iid, {})
    out.append(dict(id=iid, image=os.path.relpath(os.path.join(RAW, 'images', name), slib.ROOT), lens=name.split('/')[0],
                    camera_model=c['model'], width=c['w'], height=c['h'], fx=round(c['fx'], 3), fy=round(c['fy'], 3),
                    cx=round(c['cx'], 3), cy=round(c['cy'], 3), dist=[round(v, 7) for v in c['dist']],
                    position=[round(float(v), 4) for v in C], quaternion=[round(float(v), 8) for v in Rotation.from_matrix(R3).as_quat()],
                    yaw=round(float(yaw), 4), pitch=round(float(pitch), 4), roll=round(float(roll), 4), heading_deg=round(heading, 3),
                    reproj_px=pi.get('mean_px'), obs=pi.get('obs'), gps_offset_m=pi.get('gps_offset_m'), eye_m=pi.get('eye_m'), registered=True))
idx = slib.photo_index()
for iid in solve.get('not_registered', []):
    m = idx[iid]
    e = slib.enu(m['lat'], m['lon'])
    out.append(dict(id=iid, registered=False, gps=[round(float(e[0]), 2), round(float(e[1]), 2)], heading_deg=m['heading'], f35=m['f35']))
out.sort(key=lambda c: c['id'])
doc = dict(area=a.area, frame='ENU: x = (lon - 141.5750) * 86744 east, y = T.P. metres up, z = -(lat - 38.9060) * 111014 south',
           note='solved by tools/survey/sfm_enu.py (station-aware SfM + georegistration); intrinsics in full-resolution pixels of the '
                'JPEGs in raw/survey/<area>/images (pixel centres at +0.5, COLMAP convention); quaternion = three.js camera -> ENU',
           registered=len(solve['registered']), total=solve['n_images'], reproj_mean_px=round(solve['reproj_mean_px'], 3),
           cameras=out)
json.dump(doc, open(os.path.join(OUTD, 'cameras.json'), 'w'), indent=1)
# points.ply
P, NV = [], []
for line in open(os.path.join(MOD, 'points3D.txt')):
    if line.startswith('#') or not line.strip():
        continue
    s = line.split()
    P.append([float(s[1]), float(s[2]), float(s[3])])
    NV.append(len(s[8:]) // 2)
P = np.array(P)
with open(os.path.join(RAW, 'points.ply'), 'w') as f:
    f.write(f'ply\nformat ascii 1.0\ncomment ENU metres (x east, y T.P. up, z south), {a.area} survey\nelement vertex {len(P)}\n'
            'property float x\nproperty float y\nproperty float z\nproperty uchar views\nend_header\n')
    for p, n in zip(P, NV):
        f.write(f'{p[0]:.4f} {p[1]:.4f} {p[2]:.4f} {min(n, 255)}\n')
print(f'cameras.json: {len(solve["registered"])}/{solve["n_images"]} registered; points.ply: {len(P)} points')
