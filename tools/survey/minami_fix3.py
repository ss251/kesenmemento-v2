"""[v6:fix3] Camera corrections of the south-shore survey round 3 (applied to data/survey/minami/cameras.json, idempotent).

IMG_0840 / 0841 (a 2-photo island of the SfM, linked to nothing else): the SfM pitch of -7.8 / -8.0 deg is wrong. The photos' verticals
(the KNEWS board edges, the pergola posts, the nobori poles) run plumb to within 1 deg, which a camera pitched 8 deg down cannot do (its
verticals fan out), and the base of the KNEWS board (T.P. 1.9 over the paving, 9.8 m along a ray at bearing 190 from the standing spot of
IMG_0834-0839) lands at 931 / 990 px (of 1333, display) of the photo for a level camera / the photo: pitch +0.8 deg. The yaw (compass,
rotated +36 deg in fix 1) and the position (the 0834-0839 spot) stay. Chamfer 0841 21.5 -> see docs/anime/survey/minami.md.

    raw/survey/.venv/bin/python tools/survey/minami_fix3.py
"""
import json
import os

from scipy.spatial.transform import Rotation as R

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
P = os.path.join(ROOT, 'data/survey/minami/cameras.json')
d = json.load(open(P))
for c in d['cameras']:
    if c['id'] in ('IMG_0840', 'IMG_0841'):
        if 'fix3' in c:
            continue
        c['fix3'] = '[v6:fix3] pitch %.2f -> +0.80 deg (verticals plumb, KNEWS base row; see tools/survey/minami_fix3.py)' % c['pitch']
        c['pitch'] = 0.8
        q = R.from_euler('YXZ', [c['yaw'], c['pitch'], c['roll']], degrees=True).as_quat()
        if q[3] < 0:
            q = -q
        c['quaternion'] = [float(v) for v in q]
json.dump(d, open(P, 'w'), indent=1)
print('ok')
