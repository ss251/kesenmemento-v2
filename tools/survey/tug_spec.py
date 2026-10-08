"""[v6:fix3] The berthed tug 「KO1-875」 (IMG_0853 / 0855 / 0861): rectangles read off the photos (raw pixels, IMG_0861) cut onto the plane of
their face in the quay frame (a along the quay, d out to sea, y T.P.) -> data/survey/market/tug.json, which harbor/tug6.js builds.
The hull side plane d = 1.0 is fixed by: the life rings (0.76 m, 115 px tall at 59 m range), the hull foot at the curb (y 1.82 at the curb top 1.84),
the bitts' mooring lines; the faces set back from it are cut on their own planes (below).
  raw/survey/.venv/bin/python tools/survey/tug_spec.py"""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import vessel_cut as vc
P = 'IMG_0861'
# name: (d plane, u0, u1, v_bottom, v_top)
RECT = {
  'wallTall':  (1.0, 800, 1700, 1990, 1668),   # the tall quarter-deck side with the hull marking
  'wallLow':   (1.0, 1700, 2500, 1990, 1925),  # the low side deck wall forward
  'funnel':    (1.4, 1330, 1545, 1668, 1215),  # the white funnel casing (face)
  'aftBox':    (2.2, 1115, 1330, 1665, 1535),  # white box on the aft deck
  'house':     (1.9, 1950, 2225, 1915, 1560),  # the forward deckhouse (door, windows, window slot)
  'pilot':     (3.0, 1790, 1995, 1650, 1348),  # the pilothouse behind and above it
  'stair':     (1.0, 1700, 1960, 1900, 1590),  # the stair wedge between the tall deck and the house roof
  'drumR':     (2.6, 1555, 1690, 1570, 1500),  # blue drum right of the funnel
  'drumL':     (2.6, 1050, 1190, 1550, 1490),  # blue drum left of the aft box
  'text':      (1.0, 1442, 1665, 1797, 1755),  # hull marking
  'ring1':     (1.0, 1030, 1140, 1675, 1560),
  'ring2':     (1.0, 1490, 1605, 1680, 1565),
  'port':      (1.0, 1225, 1265, 1762, 1718),  # first porthole
  'ladder':    (1.0, 1355, 1400, 1800, 1535),
  'sheerFore': (1.0, 2300, 2500, 1925, 1925),
}
out = {}
for k, (d, u0, u1, vb, vt) in RECT.items():
    a0, _, y0 = vc.cut_d(P, u0, vb, d); a1, _, y1 = vc.cut_d(P, u1, vt, d)
    out[k] = dict(d=d, a=[round(a0, 2), round(a1, 2)], y=[round(y0, 2), round(y1, 2)])
    print(f'{k:10s} d {d}  a {a0:7.2f} .. {a1:7.2f}   y {y0:5.2f} .. {y1:5.2f}')
json.dump(out, open(os.path.join(vc.mf.ROOT, 'data/survey/market/tug.json'), 'w'), indent=1)

# ---- survey features for tools/anime/survey-diff.mjs (names registered by harbor/tug6.js): ENU, 1-sigma per axis (the cut plane's d is good to
# about +-1 m, which moves a point 0.7 m along the quay and 0.9 m across: 0.8 m horizontally, 0.15 m vertically)
def feat(name, a, d, y, note):
    P = vc.from_quay(a, d, y); return dict(name=name, enu=[round(float(P[0]), 3), round(float(P[1]), 3), round(float(P[2]), 3)], sigma=[0.8, 0.15, 0.8],
                                            method='ray x plane d = %.1f (IMG_0861)' % d, views=[P_], note=note)
P_ = P
feats = []
for i, k in enumerate(['ring1', 'ring2']):
    r = out[k]; feats.append(feat(f'canopy.tug.ring#{i + 1}', sum(r['a']) / 2, 1.0, sum(r['y']) / 2, 'life ring centre (0.76 m ring, its picked bbox)'))
t = out['text']; feats.append(feat('canopy.tug.mark', sum(t['a']) / 2, 1.0, sum(t['y']) / 2, 'hull marking KO1-875, centre of the lettering'))
w = out['wallTall']; feats.append(feat('canopy.tug.wall_top', (w['a'][0] + w['a'][1]) / 2, 1.0, w['y'][1], 'top edge of the tall hull side (the quarter-deck wall)'))
f = out['funnel']; feats.append(feat('canopy.tug.funnel_top', (f['a'][0] + f['a'][1]) / 2, 1.4, f['y'][1], 'top of the funnel casing (face)'))
h = out['house']; feats.append(feat('canopy.tug.house_roof', (h['a'][0] + h['a'][1]) / 2, 1.9, h['y'][1], 'roof edge of the forward house (face)'))
json.dump(dict(note='tools/survey/tug_spec.py: the berthed tug, rectangles read off IMG_0861 and cut onto the plane of their face', features=feats, dims=[
    dict(name='canopy.tug.hull_plane_d', value=1.0, sigma=0.8, note='hull side plane (d out to sea): life ring size 0.76 m at 59 m range, hull foot at the curb top T.P. 1.84'),
]), open(os.path.join(vc.mf.ROOT, 'data/survey/market/tug-features.json'), 'w'), indent=1)
print('features', [f['name'] for f in feats])
