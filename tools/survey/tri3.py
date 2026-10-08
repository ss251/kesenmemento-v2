"""[v6:fix3] Triangulate hand-read pixel picks and project wireframes into the solved photos.

  raw/survey/.venv/bin/python tools/survey/tri3.py tri  picks.txt [--area minami]
      picks.txt lines:  name  IMG_0907:2573:1966  IMG_0799:1834:2079 ...   (raw full-resolution, distorted pixels; # comments)
      -> ENU x y z, 1-sigma, residual px per view, max ray angle; also the NW-block frame (s along 150 deg, o along sn, from sa).
  raw/survey/.venv/bin/python tools/survey/tri3.py wire model.json IMG_0907 out.jpg [--crop x0,y0,x1,y1] [--height 1400] [--grid 250]
      model.json: { "name": {"c": [b,g,r], "pts": [[x,y,z], ...], "closed": false}, ... }  (ENU polylines)
      -> the photo (raw pixels, grid) with the polylines projected through the solved camera (OPENCV distortion applied).
  raw/survey/.venv/bin/python tools/survey/tri3.py proj -- IMG_0907 x,y,z ...    -> pixel of an ENU point
  raw/survey/.venv/bin/python tools/survey/tri3.py bear picks.txt   (vertical edges: a pick on the edge in >= 2 photos -> x, z)
  raw/survey/.venv/bin/python tools/survey/tri3.py ht   heights.txt (name x z IMG:u:v ...  -> y of the picked point above a known x, z)
"""
import argparse
import json
import os
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import pick  # noqa: E402


def read_picks(path):
    out = []
    for ln in open(path):
        ln = ln.split('#')[0].strip()
        if not ln:
            continue
        p = ln.split()
        obs = {}
        for t in p[1:]:
            i, u, v = t.split(':')
            obs['IMG_' + i if not i.startswith('IMG_') else i] = [float(u), float(v)]
        out.append((p[0], obs))
    return out


def cmd_tri(cams, a):
    for name, obs in read_picks(a.rest[0]):
        r = pick.triangulate(cams, obs)
        if r is None:
            print(f'{name:22s} (needs 2 views)')
            continue
        X, res, cov, ang = r
        sd = np.sqrt(np.clip(np.diag(cov), 0, None))
        print(f'{name:22s} {X[0]:8.2f} {X[1]:6.2f} {X[2]:8.2f}  sd {sd[0]:.2f} {sd[1]:.2f} {sd[2]:.2f}  ang {ang:4.1f}  res {res}')


def cmd_bear(cams, a):
    """Vertical edges: lines `name IMG:u:v IMG:u:v ...` (a pick anywhere on the edge) -> (x, z) by intersecting the vertical planes
    through each camera and its pick ray; prints the residual (m) to each plane and the plane-plane angle."""
    for name, obs in read_picks(a.rest[0]):
        rows, rhs, cs = [], [], []
        for iid, uv in obs.items():
            if iid not in cams:
                continue
            d = pick.ray(cams[iid], uv)
            h = np.array([d[0], d[2]]); h /= np.linalg.norm(h)
            n = np.array([-h[1], h[0]])
            C = cams[iid]['C']
            rows.append(n); rhs.append(n @ np.array([C[0], C[2]])); cs.append(iid)
        if len(rows) < 2:
            print(f'{name:22s} (needs 2 views)'); continue
        A, b = np.array(rows), np.array(rhs)
        xz = np.linalg.lstsq(A, b, rcond=None)[0]
        res = A @ xz - b
        ang = max(np.degrees(np.arccos(abs(np.clip(rows[i] @ rows[j], -1, 1)))) for i in range(len(rows)) for j in range(i + 1, len(rows)))
        print(f'{name:22s} x {xz[0]:8.2f} z {xz[1]:8.2f}  ang {ang:4.1f}  res_m {[round(float(r), 2) for r in res]}')


def cmd_ht(cams, a):
    """Height of a point above a known (x, z): lines `name x z IMG:u:v ...` -> y per view (the ray point nearest the vertical line)."""
    for ln in open(a.rest[0]):
        ln = ln.split('#')[0].strip()
        if not ln:
            continue
        p = ln.split()
        x, z = float(p[1]), float(p[2])
        ys = []
        for t in p[3:]:
            i, u, v = t.split(':')
            iid = 'IMG_' + i if not i.startswith('IMG_') else i
            d = pick.ray(cams[iid], [float(u), float(v)])
            C = cams[iid]['C']
            h = np.array([d[0], d[2]])
            s = ((x - C[0]) * h[0] + (z - C[2]) * h[1]) / (h @ h)
            ys.append((iid[-4:], round(float(C[1] + d[1] * s), 2)))
        print(f'{p[0]:22s} {ys}')


FRAME_K1 = np.array([-1.98, 71.37])   # NW block frame (fix3): origin = the 1F's NW / street corner, a inland (bearing 61 deg), b along the street (151 deg)
FRAME_EA = np.array([0.876, -0.482])
FRAME_EB = np.array([0.482, 0.876])


def cmd_cut(cams, a):
    """Cut picked rays against a plane: lines `plane IMG:u:v ...` with plane = y=5.3 | a=0 | b=4.48 | x=.. | z=.. -> (x, y, z) and (a, b)."""
    for ln in open(a.rest[0]):
        ln = ln.split('#')[0].strip()
        if not ln:
            continue
        p = ln.split()
        k, val = p[0].split('=')
        val = float(val)
        for t in p[1:]:
            i, u, v = t.split(':')
            iid = 'IMG_' + i if not i.startswith('IMG_') else i
            C = cams[iid]['C']
            d = pick.ray(cams[iid], [float(u), float(v)])
            if k == 'y':
                s = (val - C[1]) / d[1]
            elif k == 'x':
                s = (val - C[0]) / d[0]
            elif k == 'z':
                s = (val - C[2]) / d[2]
            else:
                ax = FRAME_EA if k == 'a' else FRAME_EB
                s = (val - ax @ (np.array([C[0], C[2]]) - FRAME_K1)) / (ax @ np.array([d[0], d[2]]))
            P = C + d * s
            q = np.array([P[0], P[2]]) - FRAME_K1
            print(f'{p[0]:8s} {iid[-4:]} {u:>6s},{v:>6s} -> x {P[0]:7.2f} y {P[1]:5.2f} z {P[2]:7.2f} | a {q @ FRAME_EA:6.2f} b {q @ FRAME_EB:6.2f}  range {s:5.1f}')


def cmd_proj(cams, a):
    cam = cams[a.rest[0] if a.rest[0].startswith('IMG_') else 'IMG_' + a.rest[0]]
    for s in a.rest[1:]:
        X = np.array([float(v) for v in s.split(',')])
        uv, z = pick.project(cam, X[None])
        print(f'{s}: u={uv[0][0]:.0f} v={uv[0][1]:.0f} depth {z[0]:.1f}')


def cmd_wire(cams, a):
    iid = a.rest[1] if a.rest[1].startswith('IMG_') else 'IMG_' + a.rest[1]
    cam = cams[iid]
    model = json.load(open(a.rest[0]))
    img = pick.image(cam).copy()
    H, W = img.shape[:2]
    for name, o in model.items():
        pts = np.array(o['pts'], float)
        if o.get('dense', True):   # subdivide so the distortion bends the lines
            seg = []
            for i in range(len(pts) if o.get('closed') else len(pts) - 1):
                A, B = pts[i], pts[(i + 1) % len(pts)]
                for t in np.linspace(0, 1, 24, endpoint=False):
                    seg.append(A + (B - A) * t)
            seg.append(pts[0] if o.get('closed') else pts[-1])
            pts = np.array(seg)
        uv, z = pick.project(cam, pts)
        ok = (z > 0.3) & np.all(np.isfinite(uv), axis=1) & (np.abs(uv).max(axis=1) < 30000)
        col = tuple(int(c) for c in o.get('c', [0, 255, 0]))
        for i in range(len(uv) - 1):
            if ok[i] and ok[i + 1]:
                cv2.line(img, (int(uv[i][0]), int(uv[i][1])), (int(uv[i + 1][0]), int(uv[i + 1][1])), col, o.get('w', 3), cv2.LINE_AA)
        if o.get('label', True) and ok[0]:
            cv2.putText(img, name, (int(uv[0][0]) + 6, int(uv[0][1]) - 6), cv2.FONT_HERSHEY_SIMPLEX, 1.0, col, 2, cv2.LINE_AA)
    x0, y0, x1, y1 = (0, 0, W, H) if not a.crop else [int(v) for v in a.crop.split(',')]
    img = img[y0:y1, x0:x1]
    h, w = img.shape[:2]
    k = a.height / h
    t = cv2.resize(img, (int(w * k), a.height), interpolation=cv2.INTER_AREA)
    g = a.grid
    for gx in range(((x0 // g) + 1) * g, x0 + w, g):
        X = int((gx - x0) * k)
        cv2.line(t, (X, 0), (X, a.height), (0, 255, 255), 1)
        cv2.putText(t, str(gx), (X + 2, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1, cv2.LINE_AA)
    for gy in range(((y0 // g) + 1) * g, y0 + h, g):
        Y = int((gy - y0) * k)
        cv2.line(t, (0, Y), (int(w * k), Y), (255, 255, 0), 1)
        cv2.putText(t, str(gy), (2, Y - 3), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 0), 1, cv2.LINE_AA)
    cv2.imwrite(a.rest[2], t, [cv2.IMWRITE_JPEG_QUALITY, 85])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd')
    ap.add_argument('rest', nargs='*')
    ap.add_argument('--area', default='minami')
    ap.add_argument('--crop', default=None)
    ap.add_argument('--height', type=int, default=1400)
    ap.add_argument('--grid', type=int, default=250)
    a = ap.parse_args()
    cams = pick.load_cams(a.area)
    {'tri': cmd_tri, 'wire': cmd_wire, 'proj': cmd_proj, 'bear': cmd_bear, 'ht': cmd_ht, 'cut': cmd_cut}[a.cmd](cams, a)


if __name__ == '__main__':
    main()
