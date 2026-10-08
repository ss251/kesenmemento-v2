"""[v6:fix2] Break a photo-align --dump result down: which connected runs of app-edge pixels carry the chamfer.
  raw/survey/.venv/bin/python tools/survey/edge_report.py IMG_0855 [--top 25]
Reads docs/shots/v6_survey/market/edges_<id>.png (R = app edge, G = distance x 4, B = photo edge)."""
import sys, os
import cv2, numpy as np
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
pid = sys.argv[1]; top = int(sys.argv[sys.argv.index('--top') + 1]) if '--top' in sys.argv else 25
area = sys.argv[sys.argv.index('--area') + 1] if '--area' in sys.argv else 'market'
im = cv2.imread(os.path.join(ROOT, f'docs/shots/v6_survey/{area}/edges_{pid}.png'))[:, :, ::-1]
app = im[:, :, 0] > 0; d = im[:, :, 1].astype(np.float32) / 4.0
n = app.sum(); print(f'{pid}: {n} app edge px, mean {d[app].mean():.2f}, median {np.median(d[app]):.2f}; share of the total chamfer by distance bucket:')
tot = d[app].sum()
for lo, hi in [(0, 2), (2, 4), (4, 8), (8, 16), (16, 32), (32, 1e9)]:
    m = app & (d >= lo) & (d < hi); print(f'   {lo:>3}-{hi:<5} px: {m.sum():6d} edge px ({100 * m.sum() / n:4.1f} %), {100 * d[m].sum() / tot:4.1f} % of the sum')
print('rows (share of app edge px / of the chamfer sum):')
H, W = app.shape
for y0 in range(0, H, 120):
    m = app.copy(); m[:y0] = False; m[y0 + 120:] = False
    if m.sum(): print(f'   y {y0:4d}-{y0 + 119:4d}: {100 * m.sum() / n:5.1f} % of px, {100 * d[m].sum() / tot:5.1f} % of the sum, mean {d[m].mean():5.1f}')
cell = 90; cells = []
for y0 in range(0, H, cell):
    for x0 in range(0, W, cell):
        m = app[y0:y0 + cell, x0:x0 + cell]
        if m.sum() > 20: cells.append((d[y0:y0 + cell, x0:x0 + cell][m].sum(), int(m.sum()), d[y0:y0 + cell, x0:x0 + cell][m].mean(), x0, y0))
cells.sort(reverse=True); print('worst 90 px cells (share of the sum, px, mean, x, y):')
for sm, c, mu, x0, y0 in cells[:18]: print(f'   {100 * sm / tot:5.1f} %  {c:4d} px  mean {mu:5.1f}   cell ({x0}, {y0})')
lab_n, lab = cv2.connectedComponents(app.astype(np.uint8), connectivity=8)
rows = []
for i in range(1, lab_n):
    m = lab == i; c = int(m.sum())
    if c < 25: continue
    ys, xs = np.where(m); rows.append((d[m].sum(), c, d[m].mean(), xs.min(), ys.min(), xs.max(), ys.max()))
rows.sort(reverse=True)
print(f'top runs (sum of distance, px, mean, bbox x0 y0 x1 y1), {top} of {len(rows)}:')
for s, c, mu, x0, y0, x1, y1 in rows[:top]: print(f'   {100 * s / tot:5.1f} %  {c:5d} px  mean {mu:5.1f}  bbox {x0:4d},{y0:4d} - {x1:4d},{y1:4d}')
