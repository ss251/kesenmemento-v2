# South-shore feature constructions, exec'd by tools/survey/minami_features.py (helpers: tri, hdir, cut, drop, ground,
# add, dim, P, picks). One block per element; the names are documented in docs/anime/survey/minami.md.

# ---- the white mesh stair cage at 迎's SE end (IMG_0807, 0808 from the plaza station; IMG_0818 from 16 m north-east).
# The top-left box (over the concrete gate post) is triangulated from all three; the front face runs from it to the
# corner column (direction from the face's horizontal top edge in 0808 / 0807); the long side face runs from the corner
# column along its top rail (4 picks) to the last post; feet are dropped from the tops (columns are plumb).
tri('cage.box.tl', 'top-left corner of the cage (the box over the gate post, under the red beacon)')
tri('cage.box.bl', 'bottom-left corner of that box (it sits on the concrete gate post)')
pk = PK['picks']
d_front = hdir('0808', [pk['cage.box.tl']['0808'], pk['cage.corner.top_px']['0808']])
d_front7 = hdir('0807', [pk['cage.box.tl']['0807'], pk['cage.corner.top_px']['0807']])
if d_front @ d_front7 < 0:
    d_front7 = -d_front7
d_front = (d_front + d_front7) / np.linalg.norm(d_front + d_front7)
c8 = cut('cage.corner.top', '0808', pk['cage.corner.top_px']['0808'], P('cage.box.tl'), d_front, 0.05,
         'top of the corner column (front face / long side face), on the front-face plane through the box corner')
c7 = cam_of('0807')
X7 = None
d_side = hdir('0808', pk['cage.side.top_line']['0808'])
cut('cage.side.end_top', '0808', pk['cage.side.end_top_px']['0808'], P('cage.corner.top'), d_side, 0.08,
    'top of the last post of the long side face (beyond the bleachers)')
drop('cage.corner.foot', '0808', pk['cage.corner.foot_px']['0808'], P('cage.corner.top'), 'foot of the corner column on the paving')
gy = P('cage.corner.foot')[1]
add('cage.side.end_foot', [P('cage.side.end_top')[0], gy, P('cage.side.end_top')[2]], F['cage.side.end_top']['sigma'], 'drop',
    ['IMG_0808'], note='foot of the last post (hidden by the bleachers): the end top at the corner foot\'s ground level')
add('cage.box.foot', [P('cage.box.tl')[0], gy, P('cage.box.tl')[2]], F['cage.box.tl']['sigma'], 'drop', ['IMG_0808'],
    note='the ground under the top-left box (the gate post\'s foot), at the corner foot\'s level')
dim('cage.h', P('cage.corner.top')[1] - gy, 0.08, 'corner column top - foot')
dim('cage.front_w', np.hypot(*(P('cage.corner.top') - P('cage.box.tl'))[[0, 2]]), 0.15, 'box corner -> corner column, horizontal')
dim('cage.side_len', np.hypot(*(P('cage.side.end_top') - P('cage.corner.top'))[[0, 2]]), 0.3, 'corner column -> last post, horizontal')
dim('cage.front_azimuth_deg', np.degrees(np.arctan2(d_front[0], -d_front[2])) % 180, 0.5, 'compass bearing of the front face (mod 180)')
dim('cage.side_azimuth_deg', np.degrees(np.arctan2(d_side[0], -d_side[2])) % 180, 0.5, 'compass bearing of the side face (mod 180)')

# ---- the composite bleachers north-west of the plaza, against the cage's long side face (IMG_0808; one standing spot).
# [v6:rebuild] The left ends of tiers 1-5 (A-E) abut the cage face: their vertical end edges are cut against that face
# (well conditioned, the rays meet it at ~50 deg). The tier fronts' direction is NOT taken from the nosing picks of tiers
# 2-3 any more: those edges lie within 0.3-0.8 m of the camera's eye height, where a horizontal line's direction is
# ill-conditioned (the first survey's 19 deg). Instead: the stair's left edge (the tiers' right ends) is a vertical line in
# IMG_0808 at x 3164 from the paving to the top deck, i.e. it runs radially from the camera, and the tier fronts are
# perpendicular to it (32.5 deg); tier 1's right-end foot cut on the paving lands within 0.1 m of that line, and tier 5's
# top edge (1.9 m above the eye, well conditioned) gives 38 deg +- 5. Right ends: each front line meets the radial plane.
side_P0, side_d = P('cage.corner.top'), (P('cage.side.end_top') - P('cage.corner.top'))
side_d[1] = 0
side_d /= np.linalg.norm(side_d)
for t in (1, 2, 3, 4, 5):
    for e in ('top', 'bot'):
        cut(f'bleach.t{t}.left_{e}', '0808', pk[f'bleach.t{t}.left_{e}']['0808'], side_P0, side_d, 0.10,
            f'tier {t}: the {"front-top" if e == "top" else "front-bottom"} corner at its left end, against the cage face')
gy_pl = P('cage.corner.foot')[1]
c8_ = cam_of('0808')
r_st = ray(c8_, pk['bleach.stair.edge_px']['0808'])
w_dir = np.array([r_st[0], 0.0, r_st[2]]) / np.hypot(r_st[0], r_st[2])     # up-slope, radial from the camera
d_tier = np.cross(UP, w_dir)
d_tier /= np.linalg.norm(d_tier)
n_tier = np.cross(d_tier, UP)
C8 = c8_['C']
def radial_end(P_left):
    """the point where the front line through P_left (direction d_tier) meets the vertical plane of the stair-edge ray."""
    n_r = np.cross(w_dir, UP)
    lam = (n_r @ (C8 - P_left)) / (n_r @ d_tier)
    return P_left + lam * d_tier
for t in (1, 2, 3, 4, 5):
    for e in ('top', 'bot'):
        X = radial_end(P(f'bleach.t{t}.left_{e}'))
        add(f'bleach.t{t}.right_{e}', X, [0.35, 0.05, 0.35], 'radial', ['IMG_0808'],
            note=f'tier {t}: the {"front-top" if e == "top" else "front-bottom"} corner at its right end (the stair edge: its front line meets the radial plane of IMG_0808 x 3164)')
tr = [abs((P(f'bleach.t{t + 1}.left_top') - P(f'bleach.t{t}.left_top')) @ n_tier) for t in (1, 2, 3, 4)]
rise_s = (P('bleach.t5.left_top')[1] - gy_pl) / 16   # the stair: 16 risers from the paving to the top deck
for nm_, px_ in (('bot_l', pk['bleach.stair.edge_px']['0808']), ('bot_r', pk['bleach.stair.right_px']['0808'])):
    c_ = cam_of('0808')
    r_ = ray(c_, px_)
    P0_ = P('bleach.t1.left_bot')
    n_f = np.cross(d_tier, UP)
    lam = (n_f @ (P0_ - c_['C'])) / (n_f @ r_)
    X = c_['C'] + lam * r_
    add(f'bleach.stair.{nm_}', [X[0], gy_pl + rise_s, X[2]], [0.35, 0.05, 0.35], 'cut', ['IMG_0808'],
        note=f'central stair: {"left" if nm_ == "bot_l" else "right"} end of the first step nosing, on tier 1\'s front plane (one riser over the paving)')
dim('bleach.stair.rise', rise_s, 0.03, 'stair riser: (tier-5 top - paving) / 16')
dim('bleach.tiers', 5, 0, 'counted in IMG_0808 (left block; tier 1 at the paving to tier 5)')
dim('bleach.rise', (P('bleach.t5.left_top')[1] - gy_pl) / 5, 0.03, 'mean riser: (tier-5 top - paving) / 5')
dim('bleach.top_y', P('bleach.t5.left_top')[1], 0.06, 'T.P. of the tier-5 seat')
dim('bleach.tread', np.mean(tr), 0.15, 'mean tread perpendicular to the tier fronts (' + ', '.join(f'{v:.2f}' for v in tr) + ' m)')
dim('bleach.front_azimuth_deg', np.degrees(np.arctan2(d_tier[0], -d_tier[2])) % 180, 2.0, 'compass bearing of the tier fronts (mod 180): perpendicular to the radial stair edge')
dim('bleach.stair.risers', 16, 2, 'IMG_0808: the stair from the paving to the top deck (estimate)')

# ---- the three white ring benches (C-shaped precast rings round a sunken lawn and a young tree). Single view each, near
# (8-13 m): the front foot is cut at the paving level, the vertical over it gives the rim height, the outer top edge picks
# are cut at that height and fitted with a circle (centre, outer radius). Ring B also from its tree trunk seen from both
# plaza stations (bearing intersection) as a check. Paving: T.P. 1.84 round the plaza station (SfM ground points).
def ring(nm, img, y_g):
    F_ = ground(f'{nm}.front_foot', img, pk[f'{nm}.front_foot'][img], y_g)
    top = drop_up(img, pk[f'{nm}.front_top'][img], F_)
    pts = []
    for uv in pk[f'{nm}.top_edge'][img]:
        c = cam_of(img)
        r = ray(c, uv)
        lam = (top - c['C'][1]) / r[1]
        pts.append((c['C'] + lam * r)[[0, 2]])
    pts = np.array(pts)
    # algebraic circle fit x^2 + z^2 + D x + E z + G = 0
    A_ = np.c_[pts, np.ones(len(pts))]
    b_ = -(pts ** 2).sum(1)
    Dd, Ee, Gg = np.linalg.lstsq(A_, b_, rcond=None)[0]
    cx, cz = -Dd / 2, -Ee / 2
    rad = np.sqrt(cx ** 2 + cz ** 2 - Gg)
    res = np.hypot(pts[:, 0] - cx, pts[:, 1] - cz) - rad
    rng_ = np.linalg.norm(np.array([cx, top, cz]) - cam_of(img)['C'])
    s_c = np.hypot(0.25, 0.04 * rng_ * 0.05 / 0.15)   # pick + paving-level error along the ray
    del F[f'{nm}.front_foot']
    add(nm, [cx, y_g, cz], [s_c, 0.05, s_c], 'ringfit', [cam_of(img)['c']['id']],
        note=f'ring bench centre at the paving (circle fit of {len(pts)} outer-top-edge picks, rms {np.sqrt(np.mean(res ** 2)):.2f} m)')
    return rad, top - y_g


def drop_up(img, uv, foot):
    """height of the pick uv on the vertical line through the point `foot`."""
    c = cam_of(img)
    r = ray(c, uv)
    ur = UP @ r
    A = np.array([[1.0, -ur], [-ur, 1.0]])
    bb = np.array([UP @ (c['C'] - foot), r @ (foot - c['C'])])
    t, s = np.linalg.solve(A, bb)
    return foot[1] + t


g_pl = 1.84
rr, hh = [], []
for nm, img in (('ringA', '0813'), ('ringB', '0805'), ('ringC', '0807')):
    rad_, h_ = ring(nm, img, g_pl)
    rr.append(rad_)
    hh.append(h_)
dim('ring.d_out', np.mean(rr[:2]) * 2, 0.4, 'outer diameter, mean of rings A and B (A ' + f'{2 * rr[0]:.2f}, B {2 * rr[1]:.2f}; C {2 * rr[2]:.2f} m from 3 picks, its left side out of frame)')
dim('ring.h', np.mean(hh), 0.04, 'rim height over the paving at the front (' + ', '.join(f'{v:.2f}' for v in hh) + ' m)')
# ring B's tree from both stations: horizontal bearings intersected
obs_ = picks('ringB.trunk')
A_ = np.zeros((2, 2))
b_ = np.zeros(2)
for k_, uv in obs_.items():
    d_ = ray(cams[k_], uv)[[0, 2]]
    d_ /= np.linalg.norm(d_)
    Pm = np.eye(2) - np.outer(d_, d_)
    A_ += Pm
    b_ += Pm @ cams[k_]['C'][[0, 2]]
xz = np.linalg.solve(A_, b_)
add('ringB.tree', [xz[0], g_pl, xz[1]], [0.2, 0.05, 0.2], 'bearings', list(obs_), note='ring B\'s tree trunk from both plaza stations (check of the ring fit)')

# ---- the 陸閘 winch (IMG_0808, ~10 m): feet of its two pointed posts on the paving, tips on the posts' verticals
for s_ in ('l', 'r'):
    Ft = ground(f'winch.foot_{s_}', '0808', pk[f'winch.foot_{s_}']['0808'], g_pl, f'foot of the {"left" if s_ == "l" else "right"} post (seen from the plaza)')
    ty = drop_up('0808', pk[f'winch.tip_{s_}']['0808'], Ft)
    add(f'winch.tip_{s_}', [Ft[0], ty, Ft[2]], F[f'winch.foot_{s_}']['sigma'], 'drop', ['IMG_0808'], note='tip of the pointed post')
dim('winch.post_h', np.mean([P('winch.tip_l')[1], P('winch.tip_r')[1]]) - g_pl, 0.05, 'post tips over the paving')
dim('winch.span', np.hypot(*(P('winch.tip_l') - P('winch.tip_r'))[[0, 2]]), 0.15, 'between the two posts')

# ---- 迎: the grey ribbed 3F box (top corners of its SE face: from the plaza IMG_0808 and the street IMG_0824, 35 m apart)
tri('mukaeru.box.S_top', 'top (coping) of the 3F box\'s south corner (SE / street faces)')
tri('mukaeru.box.E_top', 'top (coping) of the 3F box\'s east corner (SE / bay faces)')
dim('mukaeru.box_top_y', 0.5 * (P('mukaeru.box.S_top')[1] + P('mukaeru.box.E_top')[1]), 0.06, 'T.P. of the box\'s coping')
dim('mukaeru.box_se_w', np.hypot(*(P('mukaeru.box.S_top') - P('mukaeru.box.E_top'))[[0, 2]]), 0.2, 'width of the SE face')
# ---- the ANCHOR café face (street side of 迎): the façade plane from 197 SfM points (rms 3 cm); picks cut onto it
pl = PK['planes']['anchor.face']
n_a = np.array(pl['n'])
P0_a = n_a * pl['d']
d_a = np.cross(UP, n_a)
# [v6:rebuild] the oval is cut on the façade plane: its two views (0826, 0912) see it only 3 deg apart, so their
# triangulation put it 1.6 m off the wall; the 0826 and 0911 cuts agree within 3 cm
cut('anchor.oval', '0826', pk['anchor.oval.c']['0826'], P0_a, d_a, 0.03, 'the HAVE A NICE COFFEE oval sign (its centre), on the ANCHOR face plane')
cut('anchor.P2.foot', '0826', pk['anchor.P2.foot']['0826'], P0_a, d_a, 0.03, 'SE end of the khaki face (where the glazed corner starts), at the sidewalk')
cut('anchor.P2.eave', '0826', pk['anchor.P2.eave']['0826'], P0_a, d_a, 0.03, 'eave (fascia underside) at the SE end of the face')
dim('anchor.floor', P('anchor.P2.foot')[1], 0.05, 'sidewalk T.P. at the face\'s SE end')

# ---- the NAIWAN totems: PIER7's rust 創 totem on its NW corner deck (IMG_0799, 0823, 0907) and 迎's purple WELCOME HOUSE
# totem on its SE deck (IMG_0824, 0820): the logo centre on the face, triangulated
tri('totem.pier7', 'PIER7 創 totem: centre of the oval logo')
tri('totem.mukaeru', '迎 totem: centre of the 迎 glyph')
