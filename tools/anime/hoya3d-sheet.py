#!/usr/bin/env python3
"""[hoya-accuracy] Side-by-side review sheets: the city's drawing | before | after, all at the same scale (px per U,
U = half the width of his head).

  python3 tools/anime/hoya3d-sheet.py SPEC.json OUT.png

The spec (JSON): {"refs": "<folder of the city's variation PNGs>", "u": 120, "rows": [{"label": "...",
  "ref": {"file": "x_manualvariation1-2/1-1.png", "box": [x0, y0, x1, y1], "pxu": 393}  (pxu: px per U; or "eyes": true
         to measure it from the eye dots, 45 px at 393 px/U in NO.1-1),
  "cols": [{"file": "<render.png>", "pxu": 260, "label": "before"}, ...]}]}

The city's drawings are reference only: a sheet that contains them is never committed (it is written outside this repository; not included). The renders are cropped to the figure on white.
"""
import json, sys
from collections import deque
import numpy as np
from PIL import Image, ImageDraw, ImageFont

FONT = '/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc'
EYE_D = 45 / 393   # the eye dot's diameter in U (NO.1-1: 45 px at 393 px per U)


def font(px):
    try:
        return ImageFont.truetype(FONT, px)
    except OSError:
        return ImageFont.load_default()


def on_white(path, box=None):
    im = Image.open(path).convert('RGBA')
    if box:
        im = im.crop(tuple(box))
    bg = Image.new('RGBA', im.size, 'white')
    bg.alpha_composite(im)
    return bg.convert('RGB')


def figure_box(im, pad=6):
    a = np.asarray(im).astype(int)
    m = a.sum(2) < 735
    ys, xs = np.where(m)
    if not len(xs):
        return (0, 0, im.width, im.height)
    return (max(0, xs.min() - pad), max(0, ys.min() - pad), min(im.width, xs.max() + pad + 1), min(im.height, ys.max() + pad + 1))


def eye_pxu(im):
    """px per U from the round, solid black eye dots (white all round them)."""
    f = max(1, max(im.size) // 1400)
    small = im.resize((im.width // f, im.height // f), Image.BOX) if f > 1 else im
    a = np.asarray(small).astype(int)
    k = a.sum(2) < 230
    H, W = k.shape
    seen = np.zeros_like(k)
    ds = []
    for y in range(H):
        for x in np.where(k[y] & ~seen[y])[0]:
            if seen[y, x]:
                continue
            q = deque([(y, x)]); seen[y, x] = 1; pts = []
            while q and len(pts) < 40000:
                cy, cx = q.popleft(); pts.append((cy, cx))
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < H and 0 <= nx < W and k[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = 1; q.append((ny, nx))
            n = len(pts)
            if n < 30 or n >= 40000:
                continue
            ys = [p[0] for p in pts]; xs = [p[1] for p in pts]
            h = max(ys) - min(ys) + 1; w = max(xs) - min(xs) + 1
            if not (0.75 < w / h < 1.33 and 0.70 < n / (h * w) < 0.86):
                continue
            r = max(w, h) / 2 * 1.45; cy, cx = np.mean(ys), np.mean(xs); tot = white = 0
            for t in np.linspace(0, 2 * np.pi, 24, endpoint=False):
                yy, xx = int(cy + r * np.sin(t)), int(cx + r * np.cos(t))
                if 0 <= yy < H and 0 <= xx < W:
                    tot += 1; white += a[yy, xx].min() > 235
            if tot and white / tot > 0.6:
                ds.append((w + h) / 2 * f)
    if not ds:
        raise SystemExit('no eye dots found: give pxu')
    return float(np.median(ds)) / EYE_D


def cell(path, box, pxu, u):
    im = on_white(path, box)
    s = u / pxu
    im = im.crop(figure_box(im))
    return im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)


def main():
    spec = json.load(open(sys.argv[1]))
    out = sys.argv[2]
    u = spec.get('u', 120)
    refs = spec.get('refs', '')
    rows = []
    for r in spec['rows']:
        cells = []
        ref = r.get('ref')
        if ref:
            path = f"{refs}/{ref['file']}"
            pxu = ref.get('pxu') or eye_pxu(on_white(path, ref.get('box')))
            cells.append((cell(path, ref.get('box'), pxu, u), ref.get('label', ref['file'].split('/')[-1]), f'{pxu:.0f} px/U'))
        for c in r['cols']:
            if c.get('ref'):   # another of the city's drawings in the same row
                path = f"{refs}/{c['file']}"
                pxu = c.get('pxu') or eye_pxu(on_white(path, c.get('box')))
                cells.append((cell(path, c.get('box'), pxu, u), c.get('label', c['file'].split('/')[-1]), f'{pxu:.0f} px/U'))
                continue
            cells.append((cell(c['file'], c.get('box'), c['pxu'], u), c.get('label', ''), c.get('note', '')))
        rows.append((r.get('label', ''), cells))
    pad, lab, head = 28, 58, 44
    cw = max(c[0].width for _, cs in rows for c in cs if c[0].width < 1400) if any(c[0].width < 1400 for _, cs in rows for c in cs) else 0
    colw = lambda im: max(cw, im.width)   # single figures share one column width; a wide strip takes its own
    W = max(pad + sum(colw(c[0]) + pad for c in cs) for _, cs in rows)
    H = 70 + sum(head + max(c[0].height for c in cs) + lab + pad for _, cs in rows) + 40
    sheet = Image.new('RGB', (W, H), 'white')
    d = ImageDraw.Draw(sheet)
    d.text((pad, 18), spec.get('title', ''), fill=(40, 40, 40), font=font(26))
    y = 70
    for label, cs in rows:
        d.text((pad, y + 6), label, fill=(60, 60, 60), font=font(22))
        y += head
        hh = max(c[0].height for c in cs)
        x = pad
        for im, l1, l2 in cs:
            w = colw(im)
            sheet.paste(im, (x + (w - im.width) // 2, y + hh - im.height))   # soles on one line
            d.line([(x, y + hh + 4), (x + w, y + hh + 4)], fill=(225, 225, 225), width=1)
            d.text((x + w // 2, y + hh + 22), l1, fill=(60, 60, 60), font=font(19), anchor='mm')
            d.text((x + w // 2, y + hh + 44), l2, fill=(140, 140, 140), font=font(15), anchor='mm')
            x += w + pad
        y += hh + lab + pad
    d.text((W // 2, H - 22), '気仙沼市観光キャラクター「海の子 ホヤぼーや」 (left: the city\'s drawing, reference only, never shipped)', fill=(138, 137, 136), font=font(16), anchor='mm')
    sheet.save(out)
    print(out, sheet.size)


if __name__ == '__main__':
    main()
