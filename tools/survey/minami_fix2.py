"""Survey fix round 2 (south shore): measurements behind the fix2 rebuild, merged into data/survey/minami/{picks,features}.json.

  raw/survey/.venv/bin/python tools/survey/minami_fix2.py

Replaces / adds (every value cut with the solved cameras in data/survey/minami/cameras.json; picks are full-resolution distorted pixels):
  monument.plaque.tl   the 港町ブルース plaque's top-left corner, from IMG_0893 ALONE. The fix1 value (133.0, 3.09, 62.3) was a two-view triangulation
                       across stations 0891 / 0893, which are tied only by far hills and phone GPS (relative position good to ~1.5 m): it put the plaque
                       6.9 m from 0893 with its top 0.3 m under the eye, impossible for a plinth on the 1.9 m paving. Single station: eye 1.43 m over the
                       paving (camera y 3.34, ground 1.9), the plinth's front foot edge cut on y = 1.9 at v 3864 (3.9 m away), the face-plane cut of v 3196 gives
                       its top T.P. 2.36 (0.46 m), the frame's bottom (v 3099) stands 0.29 m behind that face on its top, top v 2008: TL (131.48, 3.17, 64.57).
  tree.bleacher#1/#2   the two slender street trees of IMG_0808 (base rays cut on the bleacher surface: tier 3-4 step (2.55, 4.0, 36.1), the stair's top landing (3.76, 5.05, 29.96))
  roof.bay (dims)      the bay-side roof edge of 迎 (IMG_0808 silhouette cut 0.5 m out from the bay face, 14 points, T.P. 8.4-13.0), cross-checked with the survey cloud's
                       eave line (T.P. 11.8-12.0 from s = 2.0 on) and IMG_0913's street-side silhouette (the roof rises 1.5-2.4 m toward the bay)
  pier7.roof_nw        the studio's bay-side roof: fascia top T.P. 9.0, 2.2 m beyond the glass (IMG_0814 cut: 9.25-9.45 at 1.5 m out, 8.65-8.85 at 3 m; cloud 8.7-9.1)
  pier7.seam_nw        the NW seam of the main block at s = 2.0 along the axis (was -0.5): the cloud's first main-eave point (18.9, 12.0, 77.2) and IMG_0814's rake edge
  pier7.stilt_pitch    3.5 m on one continuous line, first 1.2 m from the NW end: a fit of the seven columns of IMG_0817 (mean 0.1 m)
  east station B     IMG_0888 / 0890 / 0891 (the spot at ~(128, 64.5)) moved by (-0.7, 0, +2.6) m: from that spot IMG_0891 puts the 港町ブルース plaque 2.6 m north of where IMG_0893
                       (station A, four photos, 4.6 m away) does, and the two stations are tied only by far hills and phone GPS. Moving B by this vector makes both see the plaque at
                       (132.2, 64.9) AND puts the rail-top rays of IMG_0891 (T.P. 3.0) on GSI's quay line: (127.6, 66.2) -> (128.8, 65.0) -> (131.6, 62.5) against the quay edge through (131.9, 62.0).
                       The stations' pose priors (GPS sigma >= 3 m) allow it; A keeps its solve. Applied to data/survey/minami/cameras.json once (the 'adjust' field records it).
"""
import json, os
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
FJ = os.path.join(ROOT, 'data/survey/minami/features.json'); PJ = os.path.join(ROOT, 'data/survey/minami/picks.json')
F = json.load(open(FJ)); P = json.load(open(PJ))

def put(name, enu, sigma, method, views, note):
    F['features'] = [f for f in F['features'] if f['name'] != name]
    F['features'].append(dict(name=name, enu=enu, sigma=sigma, method=method, views=views, res_px={}, note=note))

def dim(name, value, sigma, how):
    F['dims'] = [d for d in F['dims'] if d['name'] != name]
    F['dims'].append(dict(name=name, value=value, sigma=sigma, how=how))

put('monument.plaque.tl', [131.483, 3.168, 64.573], [0.5, 0.15, 0.5], 'cut', ['IMG_0893'],
    'the 港町ブルース plaque frame (1.56 x 0.81 m) top-left corner from IMG_0893 alone (478, 2008): plane 0.29 m behind the plinth face, plinth foot on the 1.9 m paving (see tools/survey/minami_fix2.py)')
dim('monument.plaque_w', 1.56, 0.1, 'IMG_0893: frame 2110 px wide at 4.2 m (f 5622 px)')
dim('monument.plaque_h', 0.81, 0.06, 'IMG_0893: frame 1091 px tall at 4.2 m')
dim('monument.plinth_h', 0.46, 0.08, 'IMG_0893: front face (v 3196 -> 3864) on the 1.9 m paving')
put('tree.bleacher#1', [2.55, 4.0, 36.1], [1.2, 0.3, 1.2], 'cut', ['IMG_0808'], 'base of the 6.5 m tree in front of the cage: ray of IMG_0808 (frame 721, 848) cut on the bleacher surface at its tier 3-4 step')
put('tree.bleacher#2', [3.76, 5.05, 29.96], [1.5, 0.3, 1.5], 'cut', ['IMG_0808'], 'base of the 3.3 m tree on the stair top landing: ray of IMG_0808 (frame 910, 818) cut on the bleacher surface')
dim('pier7.stilt_pitch', 3.5, 0.15, 'IMG_0817: seven columns fitted on one continuous line along the deck edge (pitch 3.5 m, first 1.2 m from the NW end, mean 0.1 m)')
dim('pier7.seam_nw', 2.0, 0.6, 'along-axis seam NW pavilion / main block: survey cloud main-roof eave starts at s = 2.0')
dim('pier7.roof_nw_y', 9.0, 0.25, 'studio bay-side roof fascia top, IMG_0814 cuts + cloud')
CJ = os.path.join(ROOT, 'data/survey/minami/cameras.json'); C = json.load(open(CJ))
for c in C['cameras']:
    if c['id'] in ('IMG_0888', 'IMG_0890', 'IMG_0891') and not c.get('adjust_fix2'):
        c['position'] = [round(c['position'][0] - 0.7, 4), c['position'][1], round(c['position'][2] + 2.6, 4)]; c['adjust_fix2'] = [-0.7, 0, 2.6]
json.dump(C, open(CJ, 'w'), indent=1)
F['note'] = F.get('note', '') + ' [fix2] monument re-measured from IMG_0893 alone (tools/survey/minami_fix2.py).'
json.dump(F, open(FJ, 'w'), indent=1)
P['picks_fix2'] = {'monument.plaque.tl': {'0893': [478, 2008]}, 'monument.plaque.tr': {'0893': [2588, 2008]}, 'monument.plaque.bl': {'0893': [478, 3099]},
                   'tree.bleacher.base_0808': {'0808': [[2860, 3364], [3609, 3245]]}, 'monument.plinth.front_foot': {'0893': [[400, 3864], [1512, 3864], [2700, 3864]]}, 'monument.plinth.front_top': {'0893': [1512, 3196]}}
json.dump(P, open(PJ, 'w'), indent=1)
print('features', len(F['features']), 'dims', len(F['dims']))
