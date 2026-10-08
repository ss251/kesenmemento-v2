"""Survey fix round 1 (south shore): the measurements behind the fix1 rebuild, merged into data/survey/minami/{picks,features}.json.

  raw/survey/.venv/bin/python tools/survey/minami_fix1.py

Adds / replaces (every value cut with the solved cameras in data/survey/minami/cameras.json; photo pixels are in the undistorted
1080 x 1440 frame of tools/survey/probe-style cuts, scale = 1440 / image height):
  ring#3 / ringC.*       ring C refitted: foot + top-edge contours of IMG_0807 (x 120-700) and IMG_0808 (x 40-220), the gap end faces from
                         IMG_0807 (x 362 / 520 on the far wall) and IMG_0800 (end face at x 308), the near arc of IMG_0801
  gate.post              the 陸閘 gate pier (IMG_0807 front face + IMG_0819's right-edge ray)
  konbini.pole(+sign)    the pole sign, triangulated from IMG_0829 (552, 841) + IMG_0822 (721, 1193): rays 0.07 m apart
  totem.yuwaeru          the 結 totem's foot cut on the sidewalk in IMG_0830 (68, 932)
  sign.pole.0832         the road-sign pole foot in IMG_0832 (338, 1082)
  monument.plaque.tl     the 港町ブルース plaque's top-left corner, triangulated from IMG_0893 (176, 718) + IMG_0891 (599, 706): 0.02 m apart
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

# ---- ring C: open C-arc
put('ring#3', [22.1, 1.84, 54.1], [0.45, 0.07, 0.45], 'ringfit', ['IMG_0807', 'IMG_0808', 'IMG_0801'],
    'ring C bench centre: foot + top-edge circle fits IMG_0807 (22.12, 54.20, d 5.42, rms 0.09 m), IMG_0808 (21.80, 54.43, d 6.2, partial arc), IMG_0801 near arc (west edge x 20.2) and the IMG_0807 overlay (z -0.4): mean (22.1, 54.1) [ringC]')
put('ringC.gap#1', [19.75, 2.10, 55.62], [0.5, 0.07, 0.5], 'cut', ['IMG_0807', 'IMG_0800'],
    'ring C opening, south end face top (t 147 deg): the far wall ends at x 362 in IMG_0807 (ray x circle R 2.8), the end face at x 308 in IMG_0800 [ringC.gap.s]')
put('ringC.gap#2', [19.36, 2.10, 53.50], [0.5, 0.07, 0.5], 'cut', ['IMG_0807', 'IMG_0800'],
    'ring C opening, north end face top (t 192 deg): x 520 in IMG_0807, the near end in IMG_0800 [ringC.gap.n]')
dim('ringC.d_out', 5.6, 0.4, 'outer diameter, IMG_0807 foot arc 5.42 m, IMG_0808 6.2 m, IMG_0801 near edge')
dim('ringC.gap_deg', 45.0, 6.0, 'angular width of the opening in the outer wall (t 147-192 deg), 2.2 m chord')
dim('ring.crown_top#C', 5.35, 0.3, 'crown top T.P. of ring C\'s tree, IMG_0807 (crown 4.5 m wide, 2.6 m deep)')
dim('ring.crown_top#A', 4.70, 0.3, 'ring A tree crown top, IMG_0803 / 0813 (3.5 m wide)')
dim('ring.crown_top#B', 5.10, 0.3, 'ring B tree crown top, IMG_0803 / 0805 (3.5 m wide)')
# ---- the rest
put('gate.post', [4.7, 1.83, 66.4], [1.3, 0.07, 1.3], 'bearings', ['IMG_0807', 'IMG_0819'], 'the 陸閘 gate pier centre (2.2 x 1.3 m): IMG_0807 front face bearing 241 deg (74 px + 43 px side at 30 m), IMG_0819 right-edge ray bearing 235 deg; the walkway ends here (4.7, 66.0)')
put('konbini.pole', [-39.51, 2.38, 49.24], [0.2, 0.1, 0.2], 'tri', ['IMG_0829', 'IMG_0822'], 'the 7-Eleven pole sign foot: IMG_0829 (552, 841) x IMG_0822 (721, 1193), rays 0.07 m apart')
put('konbini.sign_bottom', [-39.51, 9.73, 49.24], [0.2, 0.2, 0.2], 'cut', ['IMG_0829', 'IMG_0822'], 'bottom of the sign panel on the pole (T.P. 9.73; top 12.3, 1.43 m wide)')
put('totem.yuwaeru', [-26.9, 2.4, 70.7], [2.5, 0.1, 2.5], 'bearings', ['IMG_0830', 'IMG_0831'], 'the 結 totem: bearing 214 deg from the IMG_0830 spot (x 68, far left of the frame) and 217 deg from IMG_0831 (x 823, at the slow-street mouth); range 17 m from its apparent size (54 px x 103 px at 24 mm for a 0.75 x 1.7 m tablet; the row-based cut at T.P. 2.4 said 10.5 m but the front yard is lower)')
put('sign.pole.0832', [-15.0, 2.1, 63.0], [0.6, 0.1, 0.6], 'cut', ['IMG_0832'], 'the road-sign pole foot (ahead-only disc over a school-crossing triangle, top T.P. 5.2), IMG_0832 (338, 1082)')
put('monument.plaque.tl', [133.0, 3.09, 62.3], [0.6, 0.9, 0.6], 'tri', ['IMG_0893', 'IMG_0891'], 'the 港町ブルース plaque (2.4 x 1.1 m) top-left corner, IMG_0893 (176, 718) x IMG_0891 (599, 706) 0.02 m apart; its y is 0.8 m under what the plinth + plaque heights give: treat y as +-0.9')
F['note'] = F.get('note', '') + ' [fix1] ring C refit, gate post, 7-Eleven pole, 結 totem, road-sign pole and the east monument added by tools/survey/minami_fix1.py.'
json.dump(F, open(FJ, 'w'), indent=1)
P['picks_fix1'] = {
    'ringC.foot_0807': {'0807': [[120, 1075], [160, 1087], [200, 1093], [260, 1100], [320, 1103], [400, 1105], [480, 1102], [560, 1096], [620, 1088], [680, 1076]]},
    'ringC.top_edge_0807': {'0807': [[120, 1039], [160, 1049], [200, 1055], [260, 1060], [320, 1063], [400, 1064], [480, 1062], [560, 1056], [620, 1049], [680, 1040]]},
    'ringC.foot_0808': {'0808': [[40, 1121], [85, 1111], [130, 1098], [175, 1085], [220, 1061]]},
    'ringC.top_edge_0808': {'0808': [[40, 1078], [85, 1069], [130, 1059], [175, 1048], [220, 1028]]},
    'ringC.near_arc_0801': {'0801': [[95, 1400], [165, 1327], [220, 1292], [280, 1252], [325, 1210], [352, 1165], [361, 1125]]},
    'ringC.gap_ends_0807': {'0807': [[362, 968], [520, 968]]},
    'ringC.end_face_0800': {'0800': [[308, 1180]]},
    'konbini.pole_foot': {'0829': [552, 841], '0822': [721, 1193]},
    'monument.plaque.tl': {'0893': [176, 718], '0891': [599, 706]},
    'totem.yuwaeru.foot': {'0830': [68, 932], '0831': [823, 902]},
}
json.dump(P, open(PJ, 'w'), indent=1)
print('features', len(F['features']), 'dims', len(F['dims']))
