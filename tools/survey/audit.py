"""Survey check: per-photo plausibility of a solved ENU model (raw/survey/<area>/enu): GPS offset, eye height over the
DEM, solved vs compass heading, pitch / roll of the hand-held phone, observations, reprojection, and how many of the
photo's observations belong to points seen from another standing spot (> 1 m away: real parallax).

  raw/survey/.venv/bin/python tools/survey/audit.py --area minami [--model raw/survey/minami/enu]
"""
import argparse, json, os, sys
import numpy as np
from scipy.spatial.transform import Rotation
sys.path.insert(0, os.path.dirname(__file__))
import slib  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument('--area', default='minami')
ap.add_argument('--model', default=None)
a = ap.parse_args()
MOD = a.model or os.path.join(slib.ROOT, 'raw/survey', a.area, 'enu')
S = json.load(open(os.path.join(MOD, 'solve.json')))
idx = slib.photo_index()
dem = slib.DEM()
lines = [l for l in open(os.path.join(MOD, 'images.txt')) if not l.startswith('#')]
C, Rm, name = {}, {}, {}
for k in range(0, len(lines), 2):
    s = lines[k].split()
    q = [float(v) for v in s[1:5]]
    t = np.array([float(v) for v in s[5:8]])
    iid = int(s[0])
    Rm[iid] = Rotation.from_quat([q[1], q[2], q[3], q[0]]).as_matrix()
    C[iid] = -Rm[iid].T @ t
    name[iid] = slib.img_id(s[9])
pv = {}
for line in open(os.path.join(MOD, 'points3D.txt')):
    s = line.split()
    ims = [int(v) for v in s[8::2]]
    spread = max(np.linalg.norm(C[i] - C[ims[0]]) for i in ims)
    for i in ims:
        pv.setdefault(i, [0, 0])
        pv[i][0] += 1
        pv[i][1] += spread > 1.0
rows = []
for iid in sorted(C, key=lambda i: name[i]):
    n = name[iid]
    m = idx[n]
    g = slib.enu(m['lat'], m['lon'])
    Rwc = Rm[iid].T
    fwd, down = Rwc[:, 2], Rwc[:, 1]
    head = np.degrees(np.arctan2(fwd[0], -fwd[2])) % 360
    pitch = np.degrees(np.arcsin(np.clip(fwd[1], -1, 1)))
    right = Rwc[:, 0]
    roll = np.degrees(np.arcsin(np.clip(-right[1], -1, 1)))
    dh = (head - m['heading'] + 180) % 360 - 180
    off = np.linalg.norm(C[iid][[0, 2]] - g)
    eye = C[iid][1] - dem.h(C[iid][0], C[iid][2])
    pi = S['per_image'].get(n, {})
    flag = []
    if off > 12: flag.append('GPS')
    if abs(eye - 1.45) > 0.8: flag.append('EYE')
    if abs(dh) > 40: flag.append('COMPASS')
    if abs(roll) > 12: flag.append('ROLL')
    if abs(pitch) > 35: flag.append('PITCH')
    if pv.get(iid, [0, 0])[1] < 15: flag.append('WEAK')
    rows.append(n)
    print(f"{n} x {C[iid][0]:7.1f} z {C[iid][2]:6.1f} gps_off {off:5.1f} eye {eye:5.2f} head {head:5.1f} (compass {m['heading']:5.1f}, d {dh:+6.1f}) pitch {pitch:+5.1f} roll {roll:+5.1f} obs {pv.get(iid,[0,0])[0]:4d} parallax_obs {pv.get(iid,[0,0])[1]:4d} px {pi.get('mean_px')}  {' '.join(flag)}")
