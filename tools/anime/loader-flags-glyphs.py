#!/usr/bin/env python3
"""[loader] Glyph outlines for the tairyoki flags (tools/anime/loader-flags.mjs reads the cache this writes).

  python3 tools/anime/loader-flags-glyphs.py [--font YujiBoku-Regular.ttf] [--out tools/anime/loader-flags-glyphs.json]

Takes the outlines of the characters on the flags (大漁 祝 福 満 気仙沼) from Yuji Boku (SIL OFL 1.1, (c) 2021 The Yuji Project Authors,
https://github.com/Kinutafontfactory/Yuji, served by https://fonts.google.com/specimen/Yuji+Boku). The OFL lets the outlines be embedded in artwork;
only the artwork (flags.json) is shipped, never the font, and the outlines are simplified, re-scaled and re-drawn by the generator.
The cache holds the raw TrueType contours in font units (1000 per em, y up): ["M",x,y] ["L",x,y] ["Q",cx,cy,x,y] ["Z"] (quadratics decomposed, so every Q is one segment).
Download the font once (about 8.5 MB, not committed):
  https://raw.githubusercontent.com/google/fonts/main/ofl/yujiboku/YujiBoku-Regular.ttf
If --font is missing the script downloads it to the system temp dir and uses it from there.
"""
import argparse, json, os, sys, tempfile, urllib.request
from fontTools.ttLib import TTFont
from fontTools.pens.basePen import BasePen

CHARS = '大漁祝福満気仙沼'
URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/yujiboku/YujiBoku-Regular.ttf'
HERE = os.path.dirname(os.path.abspath(__file__))

ap = argparse.ArgumentParser()
ap.add_argument('--font', default=None, help='path to YujiBoku-Regular.ttf (downloaded to the temp dir when omitted or missing)')
ap.add_argument('--out', default=os.path.join(HERE, 'loader-flags-glyphs.json'))
a = ap.parse_args()

font_path = a.font
if not font_path or not os.path.exists(font_path):
    font_path = os.path.join(tempfile.gettempdir(), 'YujiBoku-Regular.ttf')
    if not os.path.exists(font_path):
        print('downloading', URL, file=sys.stderr)
        urllib.request.urlretrieve(URL, font_path)

font = TTFont(font_path)
gs = font.getGlyphSet()
cmap = font.getBestCmap()
upm = font['head'].unitsPerEm


class Rec(BasePen):
    """Quadratic contours as explicit segments (BasePen splits the implied on-curve points of a TrueType qCurveTo for us)."""
    def __init__(self, gs):
        super().__init__(gs)
        self.contours, self.cur = [], None

    def _moveTo(self, p):
        self.cur = [['M', round(p[0]), round(p[1])]]

    def _lineTo(self, p):
        self.cur.append(['L', round(p[0]), round(p[1])])

    def _qCurveToOne(self, c, p):
        self.cur.append(['Q', round(c[0]), round(c[1]), round(p[0]), round(p[1])])

    def _curveToOne(self, c1, c2, p):
        raise SystemExit('cubic segment in a TrueType font?')

    def _closePath(self):
        self.cur.append(['Z'])
        self.contours.append(self.cur)
        self.cur = None

    _endPath = _closePath


glyphs = {}
for ch in CHARS:
    g = cmap[ord(ch)]
    pen = Rec(gs)
    gs[g].draw(pen)
    glyphs[ch] = {'adv': gs[g].width, 'c': pen.contours}

out = {'font': 'Yuji Boku', 'licence': 'SIL OFL 1.1 (c) 2021 The Yuji Project Authors', 'upm': upm, 'glyphs': glyphs}
with open(a.out, 'w') as f:
    json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    f.write('\n')
print(f'{a.out}: {len(glyphs)} glyphs, {os.path.getsize(a.out)} bytes', file=sys.stderr)
