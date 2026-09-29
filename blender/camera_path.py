"""Camera path sampler for the trailer (pure Python, no bpy; build_scene.py and the tests share it).

Keys in blender/camera.json are ENU (x east, y up, z south). Positions and look targets are
interpolated with cubic Hermite splines whose tangents are time-scaled finite differences
(non-uniform Catmull-Rom), with zero velocity at the last key so the shot settles.

CLI:  python3 blender/camera_path.py [camera.json]   -> JSON {frames:[{f,pos,look}]} on stdout
"""
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def load(path=None):
    with open(path or os.path.join(HERE, "camera.json")) as f:
        return json.load(f)


def _tangents(ts, ps, end_zero=True):
    n = len(ps)
    out = []
    for i in range(n):
        if i == 0:
            d = [(ps[1][k] - ps[0][k]) / (ts[1] - ts[0]) for k in range(3)]
        elif i == n - 1:
            d = [0.0, 0.0, 0.0] if end_zero else [(ps[i][k] - ps[i - 1][k]) / (ts[i] - ts[i - 1]) for k in range(3)]
        else:
            d = [(ps[i + 1][k] - ps[i - 1][k]) / (ts[i + 1] - ts[i - 1]) for k in range(3)]
        out.append(d)
    return out


def _hermite(p0, p1, m0, m1, h, s):
    s2, s3 = s * s, s * s * s
    h00 = 2 * s3 - 3 * s2 + 1
    h10 = s3 - 2 * s2 + s
    h01 = -2 * s3 + 3 * s2
    h11 = s3 - s2
    return [h00 * p0[k] + h10 * h * m0[k] + h01 * p1[k] + h11 * h * m1[k] for k in range(3)]


def sampler(cam):
    keys = cam["keys"]
    ts = [k["t"] for k in keys]
    P = [k["pos"] for k in keys]
    L = [k["look"] for k in keys]
    mP, mL = _tangents(ts, P), _tangents(ts, L)

    def at(t):
        t = min(max(t, ts[0]), ts[-1])
        i = 0
        while i < len(ts) - 2 and t > ts[i + 1]:
            i += 1
        h = ts[i + 1] - ts[i]
        s = (t - ts[i]) / h
        return _hermite(P[i], P[i + 1], mP[i], mP[i + 1], h, s), _hermite(L[i], L[i + 1], mL[i], mL[i + 1], h, s)

    return at


def frames(cam):
    at = sampler(cam)
    fps, n = cam["fps"], cam["frames"]
    out = []
    for f in range(n):
        p, l = at(f / fps)
        out.append({"f": f, "pos": [round(v, 3) for v in p], "look": [round(v, 3) for v in l]})
    return out


def night_factor(cam, f):
    a, b = cam["light"]["goldenUntil"], cam["light"]["nightFrom"]
    if f <= a:
        return 0.0
    if f >= b:
        return 1.0
    x = (f - a) / (b - a)
    return x * x * (3 - 2 * x)


if __name__ == "__main__":
    c = load(sys.argv[1] if len(sys.argv) > 1 else None)
    json.dump({"fps": c["fps"], "frames": frames(c), "night": [round(night_factor(c, f), 4) for f in range(c["frames"])]}, sys.stdout)
