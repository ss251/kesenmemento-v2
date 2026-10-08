"""[v6:fix2] Dense stereo of the dawn frames' far side: IMG_0855 (stand A) against IMG_0860 / 0861 (stand B, 1.6 m along the quay), rectified with the SOLVED cameras
(data/survey/market/cameras.json), semi-global block matching, back-projected to ENU / the quay frame. For the moored vessel KD1-875 at 48-60 m the disparity is
f B / Z = 8969 x 1.6 / 50 ~ 290 px: a depth step of 0.3 m is 1.7 px.
  raw/survey/.venv/bin/python tools/survey/vessel_stereo.py [--a IMG_0855 --b IMG_0860 --scale 0.5]
Writes /tmp/stereo_<a>_<b>.npz (xyz in the quay frame (a, d, y), a mask, the left image coordinates) and a depth preview jpg."""
import argparse, json, os, sys
import cv2, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import market_features as mf
ap = argparse.ArgumentParser(); ap.add_argument('--a', default='IMG_0855'); ap.add_argument('--b', default='IMG_0860'); ap.add_argument('--scale', type=float, default=0.5)
ap.add_argument('--maxdisp', type=int, default=0); ap.add_argument('--mindisp', type=int, default=0)
a = ap.parse_args()
cams = mf.load_cams(); c1, c2 = cams[a.a], cams[a.b]
M = json.load(open(os.path.join(mf.ROOT, 'data/survey/market/model.json')))['hall']['quay']
Q0 = np.array(M['p0']); Q1 = np.array(M['p1']); L = np.linalg.norm(Q1 - Q0); QU = (Q1 - Q0) / L; QN = np.array([QU[1], -QU[0]])
s = a.scale
W, H = int(c1['c']['width'] * s), int(c1['c']['height'] * s)
K1 = c1['K'].copy(); K2 = c2['K'].copy(); K1[:2] *= s; K2[:2] *= s
D1, D2 = c1['dist'], c2['dist']
R = c2['Rcw'] @ c1['Rcw'].T; T = (c2['Rcw'] @ (c1['C'] - c2['C'])).reshape(3, 1)
R1, R2, P1, P2, Qm, *_ = cv2.stereoRectify(K1, D1, K2, D2, (W, H), R, T, flags=cv2.CALIB_ZERO_DISPARITY, alpha=0)
m1 = cv2.initUndistortRectifyMap(K1, D1, R1, P1, (W, H), cv2.CV_32FC1); m2 = cv2.initUndistortRectifyMap(K2, D2, R2, P2, (W, H), cv2.CV_32FC1)
i1 = cv2.resize(cv2.imread(c1['path']), (W, H), interpolation=cv2.INTER_AREA); i2 = cv2.resize(cv2.imread(c2['path']), (W, H), interpolation=cv2.INTER_AREA)
r1 = cv2.remap(i1, *m1, cv2.INTER_LINEAR); r2 = cv2.remap(i2, *m2, cv2.INTER_LINEAR)
print('rectified', r1.shape, 'baseline px*', P2[0, 3], 'f', P1[0, 0])
# the expected disparity range for 20..120 m
f = P1[0, 0]; B = float(np.linalg.norm(T))
dmin = int(f * B / 140); dmax = int(f * B / 14); dmin = a.mindisp or max(0, dmin - 8); dmax = a.maxdisp or dmax + 8
nd = ((dmax - dmin) // 16 + 1) * 16
print('disparity', dmin, dmin + nd)
g1 = cv2.cvtColor(r1, cv2.COLOR_BGR2GRAY); g2 = cv2.cvtColor(r2, cv2.COLOR_BGR2GRAY)
g1 = cv2.createCLAHE(2.0, (8, 8)).apply(g1); g2 = cv2.createCLAHE(2.0, (8, 8)).apply(g2)
sg = cv2.StereoSGBM_create(minDisparity=dmin, numDisparities=nd, blockSize=7, P1=8 * 49, P2=32 * 49, disp12MaxDiff=1, uniquenessRatio=12, speckleWindowSize=100, speckleRange=2, mode=cv2.STEREO_SGBM_MODE_HH)
disp = sg.compute(g1, g2).astype(np.float32) / 16.0
valid = disp > dmin + 1
xyz = cv2.reprojectImageTo3D(disp, Qm)             # rectified cam1 frame (x right, y down, z fwd)
Pc = xyz.reshape(-1, 3) @ R1                        # x_cam1 = R1^T x_rect  -> row vectors: (R1^T x)^T = x^T R1
Pw = (Pc @ c1['Rcw']) + c1['C']                     # X = Rcw^T x_cam + C
q = np.stack([(Pw[:, 0] - Q0[0]) * QU[0] + (Pw[:, 2] - Q0[1]) * QU[1], (Pw[:, 0] - Q0[0]) * QN[0] + (Pw[:, 2] - Q0[1]) * QN[1], Pw[:, 1]], 1).reshape(H, W, 3)
np.savez_compressed(f'/tmp/stereo_{a.a}_{a.b}.npz', q=q, valid=valid, disp=disp, left=r1, Pw=Pw.reshape(H, W, 3))
dd = np.clip((q[:, :, 1] + 10) / 30, 0, 1); pv = cv2.applyColorMap((dd * 255).astype(np.uint8), cv2.COLORMAP_TURBO); pv[~valid] = 0
cv2.imwrite(f'/tmp/stereo_{a.a}_{a.b}.jpg', np.hstack([r1, pv]))
print('valid px', int(valid.sum()))
