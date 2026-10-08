"""[v6:fix2] Re-solve IMG_0797's pose from the licence plates of the parked row (the cactus, crown, mazda, swift, spacia plates).

IMG_0797's first pose rests on its GPS fix only (the fix is 8 m off the plates' geometry: a plate 0.33 m wide spans 63 px at f = 1594 px, so
the cactus stands 8.3 m from the camera, and the old pose put it 13.7 m away). The plates' corners are known in size (0.33 x 0.165 m), the
cactus plate is also picked in IMG_0794 and IMG_0796 (fixed cameras) which gives its 3D position; the other four plates are unknowns on the
row (s free, off 8.0 +- 0.6, one height 0.5 +- 0.1, a heading each +- 10 deg). Unknowns: the camera (6) and the plates.
  raw/survey/.venv/bin/python tools/survey/pose0797.py [--write]
"""
import json, os, sys
import cv2, numpy as np
from scipy.optimize import least_squares
sys.path.insert(0, os.path.dirname(__file__))
import cut, market_features as mf
cams = cut.cams; O, U, N, Y = cut.O, cut.U, cut.N, cut.Y
adj = json.load(open(os.path.join(mf.ROOT, 'data/survey/market/adjust.json')))['clusters']['deck']['points']
names = ['cactus', 'crown', 'mazda', 'swift', 'spacia']
corner = ['tl', 'tr', 'bl', 'br']
PW, PH = 0.33, 0.165
ANCHS = json.loads(os.environ['ANCHS']) if os.environ.get('ANCHS') else None; ANCH_SIG = float(os.environ.get('ANCH_SIG', 0.5))
ANCH = (float(os.environ['ANCH']), float(os.environ.get('ANCH_SIG', 0.5))) if os.environ.get('ANCH') else None
PLATE_SIG = float(os.environ.get('PLATE_SIG', 0.1)); EYE = (float(os.environ.get('EYE', 1.45)), float(os.environ.get('EYE_SIG', 0.12)))
# extra views of the cactus plate (raw px)
extra = {} if os.environ.get('NOEXTRA') else {'cactus': {'IMG_0796': [[1834, 2738], [1890, 2693], [1831, 2824], [1889, 2772]], 'IMG_0794': [[1035, 3266], [1062, 3243], [1028, 3351], [1058, 3327]]}}
obs797 = {n: [adj[f'car.{n}.plate_{c}']['obs']['IMG_0797'] for c in corner] for n in names}

PLATE_DIM = {'spacia': (0.23, 0.12)}
def plate_pts(s, off, h, psi, dim=None):
    """corners (tl, tr, bl, br) of a west-facing plate at wall-frame (s, off, height h above the deck), heading psi (deg from west toward +s)."""
    p = np.radians(psi); lat = np.array([np.cos(p), np.sin(p)])   # +lat = toward +s (the plate's right as seen from the front... see below)
    PW_, PH_ = dim or (PW, PH)
    out = []
    for sx, sy in [(-1, 1), (1, 1), (-1, -1), (1, -1)]:
        q = np.array([s, off]) + lat * sx * PW_ / 2
        e = O + U * q[0] + N * q[1]
        out.append([e[0], Y + h + sy * PH_ / 2, e[1]])
    return np.array(out)

def cam_from(x):
    rv, C = x[:3], x[3:6]
    return cv2.Rodrigues(rv)[0], C

def proj(R, C, P, cam):
    Xc = (R @ (P - C).T).T
    uv, _ = cv2.projectPoints(Xc.reshape(-1, 1, 3), np.zeros(3), np.zeros(3), cam['K'], cam['dist'])
    return uv.reshape(-1, 2), Xc[:, 2]

def unpack(x):
    k = 6; st = {}
    for n in names:
        st[n] = x[k:k + 3]; k += 3     # s, off, psi
    h = x[k]
    return st, h

def resid(x, ret=False):
    R, C = cam_from(x); st, h = unpack(x); r = []
    c97 = cams['IMG_0797']
    for n in names:
        s, off, psi = st[n]
        P = plate_pts(s, off, h, psi, PLATE_DIM.get(n))
        uv, z = proj(R, C, P, c97)
        r += list(((uv - np.array(obs797[n])) / 2.0).ravel())
        if n in extra:
            for ph, pts in extra[n].items():
                uv2, z2 = proj(cams[ph]['Rcw'], cams[ph]['C'], P, cams[ph]); r += list(((uv2 - np.array(pts)) / 4.0).ravel())
        r += [(off - 8.0) / 0.6, psi / 10.0]
        if ANCHS and n in ANCHS: r += [(s - ANCHS[n]) / ANCH_SIG]
    r += [(h - 0.5) / PLATE_SIG, (C[1] - (Y + EYE[0])) / EYE[1]]
    # roll prior: camera x axis horizontal-ish (R's second row y-component of the right axis)
    right = R[0]; r += [np.degrees(np.arcsin(np.clip(right[1], -1, 1))) / 1.5]
    return np.array(r)

if __name__ == '__main__':
    c0 = cams['IMG_0797']
    rv0 = cv2.Rodrigues(c0['Rcw'])[0].ravel()
    x0 = list(rv0) + list(c0['C'])
    # plates start from the 0797 cuts but with the cactus moved to the 0796 plate
    for n, s0 in zip(names, [94.9, 96.7, 98.6, 100.3, 102.0]):
        x0 += [s0, 8.0, 0.0]
    x0 += [0.5]
    best = None
    for dc in [(0, 0), (-8, 0), (-8, -3), (-4, -2), (-10, 2)]:
        xs = np.array(x0, float)
        # shift the camera along the wall frame by dc (ds, doff) from the old pose
        sh = U * dc[0] + N * dc[1]; xs[3] += sh[0]; xs[5] += sh[1]
        f = least_squares(resid, xs, loss='soft_l1', f_scale=2.0, max_nfev=400)
        c = f.cost
        R, C = cam_from(f.x); q = np.array([C[0], C[2]]) - O
        print(f'start {dc}: cost {c:.1f} camera s {q @ U:.2f} off {q @ N:.2f} h {C[1] - Y:.2f}')
        if best is None or c < best.cost: best = f
    f = best; R, C = cam_from(f.x); st, h = unpack(f.x); q = np.array([C[0], C[2]]) - O
    print(f'best: camera s {q @ U:.2f} off {q @ N:.2f} height {C[1] - Y:.2f}; plate height {h:.2f}')
    for n in names: print(f'  {n:7s} s {st[n][0]:7.2f} off {st[n][1]:5.2f} psi {st[n][2]:6.1f}')
    r = resid(f.x); print('rms residual (sigma units)', np.sqrt(np.mean(r ** 2)).round(2))
    R0, _ = cam_from(np.array(x0)); fwd = R.T @ np.array([0, 0, 1.0]); print('forward (wall frame) ds', fwd[[0, 2]] @ U if False else (np.array([fwd[0], fwd[2]]) @ U).round(3), 'doff', (np.array([fwd[0], fwd[2]]) @ N).round(3), 'pitch', np.degrees(np.arcsin(fwd[1])).round(2))
    json.dump({'x': f.x.tolist()}, open('/tmp/pose0797.json', 'w'))

    if '--write' in sys.argv:
        from scipy.spatial.transform import Rotation
        import slib
        path = os.path.join(mf.ROOT, 'data/survey/market/cameras.json'); d = json.load(open(path))
        for c in d['cameras']:
            if c['id'] == 'IMG_0797':
                R3 = R.T @ mf.FLIP; yaw, pitch, roll = slib.three_euler_yxz(R3)
                c.update(position=[round(float(v), 4) for v in C], quaternion=[float(v) for v in Rotation.from_matrix(R3).as_quat()], R_w2c=R.tolist(),
                         yaw=float(yaw), pitch=float(pitch), roll=float(roll), heading=float((-yaw) % 360), tilt=float(pitch),
                         method='licence-plate PnP (tools/survey/pose0797.py): the cactus anchored at the row, plates 0.33 x 0.165 m at 0.5 m, 5 plates', sigma={'pos_m': [0.5, 0.2, 0.5], 'rot_deg': [0.3, 0.3, 0.3]})
        json.dump(d, open(path, 'w'), indent=1); print('wrote', path)
