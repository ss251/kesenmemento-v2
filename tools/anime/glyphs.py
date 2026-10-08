"""Extract glyph outlines as SVG path data (y down, units = font units / upm * size).

usage: python3 glyphs.py <font.ttf> <text> <size> > out.json
Each glyph: {"ch", "d", "adv", "bb": [x0, y0, x1, y1]} in SVG space (y down),
origin on the baseline at the glyph's origin.
"""
import json, sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

font_path, text, size = sys.argv[1], sys.argv[2], float(sys.argv[3])
f = TTFont(font_path)
gs = f.getGlyphSet()
cmap = f.getBestCmap()
upm = f["head"].unitsPerEm
k = size / upm
fmt = lambda v: ("%.2f" % v).rstrip("0").rstrip(".")
out = []
for ch in text:
    name = cmap[ord(ch)]
    g = gs[name]
    pen = SVGPathPen(gs, ntos=fmt)
    g.draw(TransformPen(pen, (k, 0, 0, -k, 0, 0)))
    bp = BoundsPen(gs)
    g.draw(TransformPen(bp, (k, 0, 0, -k, 0, 0)))
    bb = [round(v, 2) for v in bp.bounds] if bp.bounds else [0, 0, 0, 0]
    out.append({"ch": ch, "d": pen.getCommands(), "adv": round(g.width * k, 2), "bb": bb})
print(json.dumps({"size": size, "glyphs": out}, ensure_ascii=False))
