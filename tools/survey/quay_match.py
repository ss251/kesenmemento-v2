"""Quay-hall picks: carry a pick from one photo of the dawn cluster to the others by normalised cross-correlation.

  raw/survey/.venv/bin/python tools/survey/quay_match.py IMG_0855:u,v[:name] ... [--to 0853,0854,0860,0861] [--win 31]
      [--search 260] [--sheet out.jpg]

The five quay frames (IMG_0853-0861, 77 / 78 mm) were taken from nearly one spot within 74 s, so a pick moves between
them by the rotation (plus a little parallax). The predicted position comes from the cameras' rotations in
data/survey/market/cameras.json (a pure-rotation homography K_d R_d R_s^T K_s^-1); the match is the NCC peak of a
(2 win + 1)^2 template inside +- search px, refined to sub-pixel by a parabola. A match is kept only if its NCC >= 0.8
and the peak is unique (second peak < 0.92 x best outside 1.5 win). Prints JSON {name: {photo: [u, v, ncc]}} and optionally
writes a sheet of zoomed tiles (template | match) to check by eye.
"""
import argparse
import json
import os
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import slib  # noqa: E402

ROOT = slib.ROOT
CL = ['IMG_0853', 'IMG_0854', 'IMG_0855', 'IMG_0860', 'IMG_0861']
_img = {}


def image(k):
    if k not in _img:
        _img[k] = cv2.imread(os.path.join(ROOT, 'raw/survey/market/images/t77', k + '.jpg'), cv2.IMREAD_GRAYSCALE)
    return _img[k]


def cams():
    d = json.load(open(os.path.join(ROOT, 'data/survey/market/cameras.json')))
    return {c['id']: c for c in d['cameras'] if c['id'] in CL}


def predict(C, s, d, uv):
    cs, cd = C[s], C[d]
    Ks = np.array([[cs['fx'], 0, cs['cx']], [0, cs['fy'], cs['cy']], [0, 0, 1.0]])
    Kd = np.array([[cd['fx'], 0, cd['cx']], [0, cd['fy'], cd['cy']], [0, 0, 1.0]])
    Hm = Kd @ np.array(cd['R_w2c']) @ np.array(cs['R_w2c']).T @ np.linalg.inv(Ks)
    p = Hm @ np.array([uv[0], uv[1], 1.0])
    return p[:2] / p[2]


def match(s, uv, d, guess, win=31, search=260):
    A, B = image(s), image(d)
    x, y = int(round(uv[0])), int(round(uv[1]))
    if x - win < 0 or y - win < 0 or x + win >= A.shape[1] or y + win >= A.shape[0]:
        return None
    T = A[y - win:y + win + 1, x - win:x + win + 1]
    gx, gy = int(round(guess[0])), int(round(guess[1]))
    x0, y0 = max(0, gx - search - win), max(0, gy - search - win)
    x1, y1 = min(B.shape[1], gx + search + win + 1), min(B.shape[0], gy + search + win + 1)
    if x1 - x0 <= 2 * win + 2 or y1 - y0 <= 2 * win + 2:
        return None
    R = cv2.matchTemplate(B[y0:y1, x0:x1], T, cv2.TM_CCOEFF_NORMED)
    _, mx, _, ml = cv2.minMaxLoc(R)
    R2 = R.copy()
    cv2.rectangle(R2, (ml[0] - int(1.5 * win), ml[1] - int(1.5 * win)), (ml[0] + int(1.5 * win), ml[1] + int(1.5 * win)), -1, -1)
    second = R2.max()
    i, j = ml
    dx = dy = 0.0
    if 0 < i < R.shape[1] - 1:
        a, b, c = R[j, i - 1], R[j, i], R[j, i + 1]
        dx = 0.5 * (a - c) / (a - 2 * b + c) if (a - 2 * b + c) != 0 else 0
    if 0 < j < R.shape[0] - 1:
        a, b, c = R[j - 1, i], R[j, i], R[j + 1, i]
        dy = 0.5 * (a - c) / (a - 2 * b + c) if (a - 2 * b + c) != 0 else 0
    u2, v2 = x0 + i + win + dx + (uv[0] - x), y0 + j + win + dy + (uv[1] - y)
    return [round(float(u2), 1), round(float(v2), 1), round(float(mx), 3), round(float(second), 3)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('picks', nargs='+')
    ap.add_argument('--to', default='0853,0854,0855,0860,0861')
    ap.add_argument('--win', type=int, default=31)
    ap.add_argument('--search', type=int, default=260)
    ap.add_argument('--sheet', default=None)
    ap.add_argument('--min', type=float, default=0.8)
    a = ap.parse_args()
    C = cams()
    out, tiles = {}, []
    for n_, p in enumerate(a.picks):
        parts = p.split(':')
        s = parts[0] if parts[0].startswith('IMG_') else 'IMG_' + parts[0]
        uv = [float(v) for v in parts[1].split(',')]
        name = parts[2] if len(parts) > 2 else f'p{n_}'
        res = {s: [uv[0], uv[1], 1.0]}
        for d in a.to.split(','):
            d = 'IMG_' + d.replace('IMG_', '')
            if d == s:
                continue
            g = predict(C, s, d, uv)
            m = match(s, uv, d, g, a.win, a.search)
            if m and m[2] >= a.min and m[3] < 0.92 * m[2]:
                res[d] = m[:3]
        out[name] = res
        if a.sheet:
            row = []
            for d in CL:
                if d not in res:
                    row.append(np.full((160, 160, 3), 40, np.uint8))
                    continue
                u, v = res[d][0], res[d][1]
                I = cv2.cvtColor(image(d), cv2.COLOR_GRAY2BGR)
                r = 40
                x0, y0 = int(u) - r, int(v) - r
                crop = np.full((2 * r, 2 * r, 3), 0, np.uint8)
                sx0, sy0, sx1, sy1 = max(0, x0), max(0, y0), min(I.shape[1], x0 + 2 * r), min(I.shape[0], y0 + 2 * r)
                crop[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0] = I[sy0:sy1, sx0:sx1]
                crop = cv2.resize(crop, (160, 160), interpolation=cv2.INTER_NEAREST)
                cx_, cy_ = int((u - x0) * 2), int((v - y0) * 2)
                cv2.drawMarker(crop, (cx_, cy_), (0, 0, 255), cv2.MARKER_CROSS, 14, 1)
                cv2.putText(crop, f'{d[4:]} {res[d][2]:.2f}', (2, 12), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (0, 255, 255), 1)
                row.append(crop)
            lab = np.full((160, 110, 3), 0, np.uint8)
            cv2.putText(lab, name[:16], (2, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (255, 255, 255), 1)
            tiles.append(np.hstack([lab] + row))
    if a.sheet and tiles:
        cv2.imwrite(a.sheet, np.vstack(tiles))
    print(json.dumps(out))


if __name__ == '__main__':
    main()
