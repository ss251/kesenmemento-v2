"""[v6:fix2] A sparse 3D cloud of the dawn frames' far side (the moored vessel KD1-875 and what stands behind it), from the SIFT ties of the five frames
(raw/survey/market/database.db), triangulated with the SOLVED cameras (data/survey/market/cameras.json, 1.0 px). Points are written in the quay frame
(a along the quay line, d out to sea, y T.P.) to /tmp/vessel_cloud.npy (and a text summary).
  raw/survey/.venv/bin/python tools/survey/vessel_cloud.py
"""
import json, os, sys, sqlite3
import numpy as np, cv2
sys.path.insert(0, os.path.dirname(__file__))
import market_features as mf
ROOT = mf.ROOT
cams = {k: v for k, v in mf.load_cams().items() if v['cluster'] == 'canopy'}
M = json.load(open(os.path.join(ROOT, 'data/survey/market/model.json')))['hall']['quay']
Q0 = np.array(M['p0']); Q1 = np.array(M['p1']); L = np.linalg.norm(Q1 - Q0); QU = (Q1 - Q0) / L; QN = np.array([QU[1], -QU[0]])
def quay(P): q = np.array([P[0], P[2]]) - Q0; return q @ QU, q @ QN, P[1]
db = sqlite3.connect(os.path.join(ROOT, 'raw/survey/market/database.db'))
names = {i: os.path.basename(n).split('.')[0] for i, n in db.execute('select image_id, name from images')}
want = {i for i, k in names.items() if k in cams}
kps = {}
for i in want:
    r, c, b = db.execute('select rows, cols, data from keypoints where image_id=?', (i,)).fetchone(); kps[i] = np.frombuffer(b, np.float32).reshape(r, c)[:, :2]
parent = {}
def find(a):
    while parent.setdefault(a, a) != a: parent[a] = parent[parent[a]]; a = parent[a]
    return a
for pid, r, c, blob in db.execute('select pair_id, rows, cols, data from two_view_geometries where rows > 0'):
    i2 = pid % 2147483647; i1 = (pid - i2) // 2147483647
    if i1 not in want or i2 not in want or r < 15: continue
    for a, b in np.frombuffer(blob, np.uint32).reshape(r, c):
        ra, rb = find((i1, int(a))), find((i2, int(b)))
        if ra != rb: parent[ra] = rb
tracks = {}
for node in list(parent): tracks.setdefault(find(node), []).append(node)
out = []
for nodes in tracks.values():
    imgs = [i for i, _ in nodes]
    if len(nodes) < 3 or len(set(imgs)) != len(imgs): continue
    obs = {names[i]: kps[i][j] for i, j in nodes}
    A, b = np.zeros((3, 3)), np.zeros(3); dirs = []
    for k, uv in obs.items():
        d = mf.ray(cams[k], uv); dirs.append(d); Mx = np.eye(3) - np.outer(d, d); A += Mx; b += Mx @ cams[k]['C']
    X = np.linalg.solve(A, b)
    ang = max(np.degrees(np.arccos(np.clip(dirs[i] @ dirs[j], -1, 1))) for i in range(len(dirs)) for j in range(i + 1, len(dirs)))
    if ang < 0.5: continue
    res = [np.hypot(*(mf.project(cams[k], X[None])[0][0] - uv)) for k, uv in obs.items()]
    if max(res) > 2.0: continue
    a, d, y = quay(X)
    out.append([a, d, y, ang, len(obs), max(res), *X])
out = np.array(out); np.save('/tmp/vessel_cloud.npy', out); print(len(out), 'points')
for lo, hi in [(-60, -30), (-30, -5), (-5, 0.5), (0.5, 10), (10, 60), (60, 400)]:
    s = out[(out[:, 1] >= lo) & (out[:, 1] < hi)]; print(f'd {lo}..{hi}: {len(s)} pts')
