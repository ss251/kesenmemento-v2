#!/usr/bin/env python3
"""[loader] The KesenMemento wordmark with its 落款-style seal, as outlines (no font is needed at first paint).

  python3 tools/anime/loader-wordmark.py [--font ShipporiMincho-Bold.ttf] [--out src/anime/assets/loader/wordmark.svg]

Takes the glyph outlines of "Kesen", "Memento" and the seal character 「気」 from Shippori Mincho Bold (SIL OFL 1.1, https://fonts.google.com/specimen/Shippori+Mincho; the OFL lets
outlines taken from the font be embedded in artwork) and writes ONE svg in a 0 0 W H box (1 unit = 1/1000 em, y down), laid out as a small book-title lockup:

      Kesen        [気]        the seal sits at the right end of the short first line
      Memento                  both lines are the same size, left aligned

Classes the page colours with CSS: .k (the lettering, 生成り), .sl (the seal's field, 茜), .sg (the carved character, 生成り), .sf (a hairline frame inside the seal).
Download the font once: https://raw.githubusercontent.com/google/fonts/main/ofl/shipporimincho/ShipporiMincho-Bold.ttf
"""
import argparse, sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

ap = argparse.ArgumentParser()
ap.add_argument('--font', default='ShipporiMincho-Bold.ttf')
ap.add_argument('--out', default='src/anime/assets/loader/wordmark.svg')
ap.add_argument('--track', type=float, default=14, help='letter spacing in 1/1000 em')
a = ap.parse_args()

font = TTFont(a.font)
gs = font.getGlyphSet(); cmap = font.getBestCmap(); scale = 1000.0 / font['head'].unitsPerEm
num = lambda v: ('%.1f' % v).rstrip('0').rstrip('.')

def adv(ch): return gs[cmap[ord(ch)]].width * scale
def width(text): return sum(adv(c) + a.track for c in text) - a.track
def bounds(text):
    lo, hi = 1e9, -1e9
    for ch in text:
        bp = BoundsPen(gs); gs[cmap[ord(ch)]].draw(bp)
        if bp.bounds: lo = min(lo, -bp.bounds[3] * scale); hi = max(hi, -bp.bounds[1] * scale)
    return lo, hi
def outline(text, x0, y0, k=1.0):
    pen = SVGPathPen(gs, ntos=num); x = x0
    for ch in text:
        gs[cmap[ord(ch)]].draw(TransformPen(pen, (scale * k, 0, 0, -scale * k, x, y0)))
        x += (adv(ch) + a.track) * k
    return pen.getCommands()

PAD = 24
w_m = width('Memento'); w_k = width('Kesen')
k_lo, k_hi = bounds('Kesen'); m_lo, m_hi = bounds('Memento')
LEAD = 880                                            # baseline to baseline
base1 = PAD - k_lo; base2 = base1 + LEAD
W = round(w_m + 2 * PAD); H = round(base2 + m_hi + PAD)
kesen = outline('Kesen', PAD, base1); memento = outline('Memento', PAD, base2)

# the seal: a square a little taller than the capitals, its right edge on the right edge of "Memento", hand-cut corners (a stamp is never perfectly square)
S = 700
sx = PAD + w_m - S; sy = base1 + k_lo - 10          # top level with the top of the capitals
r = 70
j = [(0, 0), (-3, 2), (2, -2), (-2, -3)]            # tiny irregularities at the four corners
x0, y0, x1, y1 = sx, sy, sx + S, sy + S
field = (f'M{num(x0 + r + j[0][0])} {num(y0 + j[0][1])}H{num(x1 - r + j[1][0])}Q{num(x1 + j[1][0])} {num(y0)} {num(x1)} {num(y0 + r)}V{num(y1 - r + j[2][1])}'
         f'Q{num(x1)} {num(y1 + j[2][1])} {num(x1 - r)} {num(y1)}H{num(x0 + r + j[3][0])}Q{num(x0)} {num(y1)} {num(x0)} {num(y1 - r + j[3][1])}V{num(y0 + r)}Q{num(x0)} {num(y0)} {num(x0 + r)} {num(y0)}Z')
g_lo, g_hi = bounds('気'); gw = adv('気')
gk = 0.74 * S / max(gw, g_hi - g_lo)                 # scale the character to ~74 % of the seal
gx = sx + (S - gw * gk) / 2; gy = sy + S / 2 + ((g_hi + g_lo) / 2) * -gk * -1 + 0   # baseline so the glyph's ink is centred
gy = sy + S / 2 - ((g_lo + g_hi) / 2) * gk
glyph = outline('気', gx, gy, gk)
f = 26                                              # a hairline frame inside the seal
frame = f'M{num(x0 + f)} {num(y0 + f)}H{num(x1 - f)}V{num(y1 - f)}H{num(x0 + f)}Z'
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}"><path class="k" d="{kesen}"/><path class="k" d="{memento}"/>'
       f'<path class="sl" d="{field}"/><path class="sf" d="{frame}" fill="none"/><path class="sg" d="{glyph}"/></svg>\n')
open(a.out, 'w').write(svg)
print(f'{a.out}: {W}x{H}, {len(svg)} bytes', file=sys.stderr)
