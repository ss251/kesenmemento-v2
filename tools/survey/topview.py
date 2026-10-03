"""A top-down check plot of the georegistered survey: sparse ENU points (shaded by height), the GSI/OSM footprints of
data/anime/layout.json, the solved cameras (with view direction) and their GPS fixes, and optional features.

  raw/survey/.venv/bin/python tools/survey/topview.py --area minami --bbox -60,20,60,110 --out raw/survey/minami/top.png [--px 12]
"""
import argparse
import json
import os
import struct
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import slib  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument('--area', default='minami')
ap.add_argument('--bbox', default='-60,20,60,110')
ap.add_argument('--px', type=float, default=10, help='pixels per metre')
ap.add_argument('--out', default=None)
ap.add_argument('--ymin', type=float, default=-99)
ap.add_argument('--ymax', type=float, default=99)
ap.add_argument('--features', type=int, default=1)
a = ap.parse_args()
x0, z0, x1, z1 = [float(v) for v in a.bbox.split(',')]
W, H = int((x1 - x0) * a.px), int((z1 - z0) * a.px)
img = np.full((H, W, 3), 255, np.uint8)
P = lambda x, z: (int((x - x0) * a.px), int((z - z0) * a.px))  # noqa: E731

# grid every 10 m
for gx in range(int(np.ceil(x0 / 10) * 10), int(x1) + 1, 10):
    cv2.line(img, P(gx, z0), P(gx, z1), (235, 235, 235), 1)
    cv2.putText(img, str(gx), (P(gx, z0)[0] + 2, 12), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (150, 150, 150), 1)
for gz in range(int(np.ceil(z0 / 10) * 10), int(z1) + 1, 10):
    cv2.line(img, P(x0, gz), P(x1, gz), (235, 235, 235), 1)
    cv2.putText(img, str(gz), (2, P(x0, gz)[1] - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (150, 150, 150), 1)

# points
ply = os.path.join(slib.ROOT, 'raw/survey', a.area, 'points.ply')
with open(ply, 'rb') as f:
    head = b''
    while not head.endswith(b'end_header\n'):
        head += f.readline()
    n = int([l for l in head.split(b'\n') if l.startswith(b'element vertex')][0].split()[-1])
    props = [l.split()[1:] for l in head.split(b'\n') if l.startswith(b'property')]
    dt = [(p[1].decode(), {b'float': '<f4', b'uchar': 'u1'}[p[0]]) for p in props]
    arr = np.frombuffer(f.read(), dtype=dt, count=n)
sel = (arr['y'] > a.ymin) & (arr['y'] < a.ymax) & (arr['error'] < 2)
for x, y, z in zip(arr['x'][sel], arr['y'][sel], arr['z'][sel]):
    if x0 <= x <= x1 and z0 <= z <= z1:
        t = np.clip((y - 1.5) / 10, 0, 1)
        col = (int(255 * t), 60, int(255 * (1 - t)))
        cv2.circle(img, P(x, z), 1, col, -1)

# footprints
L = json.load(open(os.path.join(slib.ROOT, 'data/anime/layout.json')))
for lot in L['lots']:
    poly = np.array(lot['poly'])
    if (poly[:, 0].max() < x0) or (poly[:, 0].min() > x1) or (poly[:, 1].max() < z0) or (poly[:, 1].min() > z1):
        continue
    pts = np.array([P(x, z) for x, z in poly], np.int32)
    cv2.polylines(img, [pts], True, (0, 140, 0), 1, cv2.LINE_AA)
for q in L['quays']:
    cv2.line(img, P(*q['a']), P(*q['b']), (200, 120, 0), 1, cv2.LINE_AA)

# cameras
cj = os.path.join(slib.ROOT, 'data/survey', a.area, 'cameras.json')
if os.path.exists(cj):
    for c in json.load(open(cj))['cameras']:
        x, y, z = c['position']
        f = c['forward']
        cv2.line(img, P(*c['gps']), P(x, z), (180, 180, 255), 1)
        cv2.circle(img, P(*c['gps']), 2, (120, 120, 255), -1)
        cv2.arrowedLine(img, P(x, z), P(x + f[0] * 4, z + f[2] * 4), (0, 0, 200), 1, tipLength=0.3)
        cv2.circle(img, P(x, z), 3, (0, 0, 200), -1)
        cv2.putText(img, c['id'][4:], (P(x, z)[0] + 4, P(x, z)[1] + 4), cv2.FONT_HERSHEY_SIMPLEX, 0.32, (0, 0, 160), 1)
fj = os.path.join(slib.ROOT, 'data/survey', a.area, 'features.json')
if a.features and os.path.exists(fj):
    for f in json.load(open(fj))['features']:
        x, y, z = f['enu']
        cv2.drawMarker(img, P(x, z), (200, 0, 200), cv2.MARKER_CROSS, 6, 1)
cv2.imwrite(a.out or os.path.join(slib.ROOT, 'raw/survey', a.area, 'top.png'), img)
print(a.out or os.path.join('raw/survey', a.area, 'top.png'), W, H)
