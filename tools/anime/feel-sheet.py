#!/usr/bin/env python3
"""[feel] Before / after frames of the feel probe's scripted walk (tools/anime/feel-probe.mjs --clip), the same instants side by side.

  python3 tools/anime/feel-sheet.py before.mp4 after.mp4 out.jpg [--width 220] [--at 1.0,3.4,...] [--names 立つ,歩く,...]

A header row names each moment (Japanese, then English), then a row from the before clip and a row from the after clip. ffmpeg cuts
the frames (no filters); PIL lays them out with Hiragino (macOS). The default instants are the probe's script: standing, walking,
running, 0.1 s into the 180° turn, walking back toward the camera, stopped.
"""
import argparse, os, subprocess, tempfile
from PIL import Image, ImageDraw, ImageFont

ap = argparse.ArgumentParser()
ap.add_argument('before'); ap.add_argument('after'); ap.add_argument('out')
ap.add_argument('--width', type=int, default=220)
ap.add_argument('--at', default='1.0,3.4,5.4,6.1,6.6,8.2')
ap.add_argument('--names', default='立つ / stand,歩く / walk,走る / run,振り向く / 180°,戻る / back,止まる / stop')
a = ap.parse_args()
ts = [float(x) for x in a.at.split(',')]
names = a.names.split(',')
FONT = '/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc'
font = ImageFont.truetype(FONT, 15) if os.path.exists(FONT) else ImageFont.load_default()
small = ImageFont.truetype(FONT, 13) if os.path.exists(FONT) else ImageFont.load_default()
NAVY, PAPER = (34, 58, 112), (251, 250, 245)

def frames(src, tmp, tag):
    out = []
    for i, t in enumerate(ts):
        p = os.path.join(tmp, f'{tag}-{i}.png')
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-ss', str(t), '-i', src, '-frames:v', '1', p], check=True)
        im = Image.open(p).convert('RGB')
        h = round(im.height * a.width / im.width)
        out.append(im.resize((a.width, h), Image.LANCZOS))
    return out

with tempfile.TemporaryDirectory() as tmp:
    rows = [frames(a.before, tmp, 'b'), frames(a.after, tmp, 'a')]
    fh = rows[0][0].height
    gap, head, side = 4, 30, 64
    W = side + len(ts) * (a.width + gap)
    H = head + 2 * (fh + gap)
    sheet = Image.new('RGB', (W, H), PAPER)
    d = ImageDraw.Draw(sheet)
    for i, n in enumerate(names[:len(ts)]):
        d.text((side + i * (a.width + gap) + 6, 7), f'{n}  {ts[i]:.1f} s', fill=NAVY, font=small)
    for r, (label, row) in enumerate([('before', rows[0]), ('after', rows[1])]):
        y = head + r * (fh + gap)
        d.text((8, y + fh // 2 - 8), label, fill=NAVY, font=font)
        for i, im in enumerate(row):
            sheet.paste(im, (side + i * (a.width + gap), y))
    sheet.save(a.out, quality=86)
print(a.out)
