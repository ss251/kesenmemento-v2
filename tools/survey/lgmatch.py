"""Survey step 1a (v2): learned features and matching for the station photos: ALIKED keypoints + LightGlue, run straight
from COLMAP 4.1.1's own ONNX models (~/.cache/colmap/*aliked-n16rot.onnx, *aliked-lightglue.onnx) with onnxruntime.

  tools/anime/gate.sh && nice -n 10 raw/survey/.venv/bin/python tools/survey/lgmatch.py --area minami [--workers 2 --threads 2]
  (the gate's own `run` mode puts the step at background QoS, where its I/O stalled the workers at 0.4 % CPU)

Why: COLMAP's SIFT (GPU, clamped to 16k features) and CPU FLANN SIFT both left the plaza sweep IMG_0807-0812 with no match
to any other standing spot (dusk light, 3.2x focal changes between the 24 and 77 mm lenses). COLMAP's built-in
ALIKED/LightGlue on the CPU at the gate's background QoS took minutes per image. Here ALIKED runs through onnxruntime
on the CPU (~1-3 s per image) and LightGlue through PyTorch on the Apple GPU (MPS, ~1 s per pair; memory capped at 25 %).

Two feature levels per image (keypoints stored in full-resolution pixels, COLMAP convention: pixel centres at +0.5):
  hi:   long side 2400 px, up to 8192 keypoints (pairs of the same or similar lens)
  ang:  an angular-resolution-normalised level: the image is resized so its focal is ~1150 px (24 mm -> 1660 px long side,
        48 mm -> 830, 77 mm -> 520, 14 mm -> native 2400 cap), so a tele and a wide shot meet at the same pixels per degree.
Pairs whose focal ratio is <= 1.6 match on `hi`, the others on `ang` (and on `hi` too when it gives more inliers).
Matches are kept with LightGlue score >= 0.2 and a MAGSAC fundamental-matrix check (1.5 px at the level's scale).

Writes raw/survey/<area>/lg/feat_<IMG>_<level>.npz (kp [N,2] full-res px, desc, score, size) and
raw/survey/<area>/lg/matches.json (per pair: images, level, inlier keypoint index pairs, F inlier ratio).
"""
import argparse
import glob
import json
import os
import sys
import time
from multiprocessing import Pool

import numpy as np

os.environ.setdefault('PYTORCH_MPS_HIGH_WATERMARK_RATIO', '0.25')
os.environ.setdefault('PYTORCH_MPS_LOW_WATERMARK_RATIO', '0.2')
os.environ.setdefault('KMP_DUPLICATE_LIB_OK', 'TRUE')

sys.path.insert(0, os.path.dirname(__file__))
import slib  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument('--area', default='minami')
ap.add_argument('--workers', type=int, default=3)
ap.add_argument('--threads', type=int, default=3)
ap.add_argument('--hi', type=int, default=2400)
ap.add_argument('--fang', type=float, default=1150.0)
ap.add_argument('--kp', type=int, default=8192)
ap.add_argument('--min', type=int, default=12)
ap.add_argument('--only', default='', help='comma list of image ids: match only pairs that involve one of them')
ap.add_argument('--dry', type=int, default=0, help='print the candidate pairs and exit')
ap.add_argument('--pairs', default='frustum', help='all | a file of "IMG_a IMG_b" lines')
a = ap.parse_args()
RAW = os.path.join(slib.ROOT, 'raw/survey', a.area)
OUT = os.path.join(RAW, 'lg')
os.makedirs(OUT, exist_ok=True)
CACHE = os.path.expanduser('~/.cache/colmap/')
EXT = glob.glob(CACHE + '*aliked-n16rot.onnx')[0]
LG = glob.glob(CACHE + '*aliked-lightglue.onnx')[0]
F35 = {'uw14': 14, 'w24': 24, 'w48': 48, 't77': 77}

_s = {}


def sess(path):
    import onnxruntime as ort
    if path not in _s:
        so = ort.SessionOptions()
        so.intra_op_num_threads = a.threads
        so.log_severity_level = 3
        _s[path] = ort.InferenceSession(path, so, providers=['CPUExecutionProvider'])
    return _s[path]


def images():
    out = {}
    for p in sorted(glob.glob(os.path.join(RAW, 'images', '*', 'IMG_*.jpg'))):
        out[slib.img_id(p)] = dict(path=p, lens=os.path.basename(os.path.dirname(p)))
    return out


def native_focal(lens, long_side):
    """focal in px from the diagonal 35 mm equivalent (43.27 mm diagonal) for a 4:3 frame of this long side."""
    diag = long_side * 1.25
    return F35[lens] / 43.27 * diag


def extract(job):
    from PIL import Image
    iid, path, lens, level = job
    fn = os.path.join(OUT, f'feat_{iid}_{level}.npz')
    if os.path.exists(fn):
        return fn
    im = Image.open(path).convert('RGB')
    W, H = im.size
    L = max(W, H)
    if level == 'hi':
        Ls = min(a.hi, L)
    else:
        Ls = min(a.hi, int(round(L * a.fang / native_focal(lens, L))))
    s = Ls / L
    w2, h2 = max(32, int(round(W * s / 32)) * 32), max(32, int(round(H * s / 32)) * 32)
    ims = im.resize((w2, h2), Image.LANCZOS)
    x = np.asarray(ims, np.float32)[None].transpose(0, 3, 1, 2) / 255.0
    k, d, sc = sess(EXT).run(None, {'image': x, 'max_keypoints': np.array(a.kp, np.int64), 'min_score': np.array(0.0, np.float32)})
    k = k[0]
    # ALIKED normalised [-1, 1] over (size - 1) -> resized pixel index -> full-res COLMAP pixel (centre of px 0 = 0.5)
    pxs = (k + 1) / 2 * (np.array([w2, h2]) - 1)
    full = (pxs + 0.5) * np.array([W / w2, H / h2])
    np.savez_compressed(fn, kp=full.astype(np.float32), kps=pxs.astype(np.float32), desc=d[0].astype(np.float32), score=sc[0].astype(np.float32),
                        size=np.array([W, H]), ssize=np.array([w2, h2]))
    return fn


_f = {}


def feat(iid, level):
    key = (iid, level)
    if key not in _f:
        z = np.load(os.path.join(OUT, f'feat_{iid}_{level}.npz'))
        _f[key] = {k: z[k] for k in z.files}
        if len(_f) > 16:
            _f.pop(next(iter(_f)))
    return _f[key]


_lg = {}


def lg_model():
    """The reference LightGlue (cvg/LightGlue, aliked weights) on the Apple GPU: ~1 s per 8192-keypoint pair, vs 15 s for
    the same network through onnxruntime on 3 CPU threads. Memory is capped by PYTORCH_MPS_HIGH_WATERMARK_RATIO (set
    below) so a mistake fails instead of swapping the shared machine."""
    if 'm' not in _lg:
        import torch
        from lightglue import LightGlue
        dev = torch.device('mps' if torch.backends.mps.is_available() else 'cpu')
        _lg['dev'] = dev
        _lg['m'] = LightGlue(features='aliked', depth_confidence=-1, width_confidence=-1, filter_threshold=0.2).eval().to(dev)
    return _lg['m'], _lg['dev']


def lg_match(i, j, level):
    import cv2
    import torch
    A, B = feat(i, level), feat(j, level)
    m_, dev = lg_model()
    T = lambda F: {'keypoints': torch.from_numpy(F['kps'])[None].to(dev), 'descriptors': torch.from_numpy(F['desc'])[None].to(dev),  # noqa: E731
                   'image_size': torch.from_numpy(F['ssize'].astype(np.float32))[None].to(dev)}
    with torch.inference_mode():
        r = m_({'image0': T(A), 'image1': T(B)})
    mm = r['matches'][0].cpu().numpy()
    if len(mm) < a.min:
        return None
    ia, ib = mm[:, 0], mm[:, 1]
    pa, pb = A['kps'][ia], B['kps'][ib]
    try:
        F, mask = cv2.findFundamentalMat(pa, pb, cv2.USAC_MAGSAC, 1.5, 0.9999, 10000)
    except cv2.error:
        return None
    if F is None or mask is None:
        return None
    inl = mask.ravel().astype(bool)
    if inl.sum() < a.min:
        return None
    return dict(i=i, j=j, level=level, m=np.stack([ia[inl], ib[inl]], 1).tolist(), raw=int(len(ia)), ratio=float(inl.mean()))


def frustum_pairs(ims, ids, tol_pos=10.0, tol_deg=35.0, rmax=160.0, cell=2.0, min_cells=6):
    """Candidate pairs: the two photos' ground footprints (GPS +- tol_pos, compass +- tol_deg, the portrait FOV, out to
    rmax metres) share >= min_cells grid cells, or the two shots are <= 30 s apart (one standing spot / walk)."""
    idx = slib.photo_index()
    xs = np.arange(-260, 300, cell)
    zs = np.arange(-120, 260, cell)
    X, Z = np.meshgrid(xs, zs)
    masks = {}
    for i in ids:
        m = idx[i]
        e = slib.enu(m['lat'], m['lon'])
        hfov = np.degrees(2 * np.arctan(18.0 / F35[ims[i]['lens']]))  # portrait: the short side (24 mm x 36 mm frame)
        dx, dz = X - e[0], Z - e[1]
        d = np.hypot(dx, dz)
        brg = np.degrees(np.arctan2(dx, -dz)) % 360
        dang = np.abs((brg - m['heading'] + 180) % 360 - 180)
        # the position tolerance widens the angle near the camera
        slack = np.degrees(np.arctan2(tol_pos, np.maximum(d, 1.0)))
        masks[i] = (d < rmax) & (dang < hfov / 2 + tol_deg + slack)
    tsec = {}
    for i in ids:
        dd, cc = idx[i]['time'].split(' ')
        h, mi, s = map(int, cc.split(':'))
        tsec[i] = int(dd.replace(':', '')) * 86400 + h * 3600 + mi * 60 + s
    out = []
    for p in range(len(ids)):
        for q in range(p + 1, len(ids)):
            i, j = ids[p], ids[q]
            if abs(tsec[i] - tsec[j]) <= 30 or (masks[i] & masks[j]).sum() >= min_cells:
                out.append((i, j))
    return out


_idx = {}


def tsec_of(i):
    if not _idx:
        _idx.update(slib.photo_index())
    dd, cc = _idx[i]['time'].split(' ')
    h, mi, s_ = map(int, cc.split(':'))
    return int(dd.replace(':', '')) * 86400 + h * 3600 + mi * 60 + s_


def match_job(p):
    i, j, li, lj = p
    fi = native_focal(li, 4032)
    fj = native_focal(lj, 4032)
    levels = ['hi'] if max(fi, fj) / min(fi, fj) <= 1.6 else ['ang', 'hi']
    best = None
    for lv in levels:
        r = lg_match(i, j, lv)
        if r is not None and (best is None or len(r['m']) > len(best['m'])):
            best = r
    return (i, j, best)


if __name__ == '__main__':
    t0 = time.time()
    ims = images()
    ids = sorted(ims)
    jobs = [(i, ims[i]['path'], ims[i]['lens'], lv) for i in ids for lv in ('hi', 'ang')]
    if a.dry:
        P = frustum_pairs(ims, ids) if a.pairs == 'frustum' else [(ids[p], ids[q]) for p in range(len(ids)) for q in range(p + 1, len(ids))]
        print(len(P), 'pairs of', len(ids) * (len(ids) - 1) // 2)
        for i in ids:
            print(i, sorted(j[4:] for p in P for j in p if i in p and j != i))
        raise SystemExit
    with Pool(a.workers) as pool:
        for k, _ in enumerate(pool.imap_unordered(extract, jobs)):
            if (k + 1) % 20 == 0:
                print(f'[{time.time() - t0:6.0f}s] features {k + 1}/{len(jobs)}', flush=True)
    if a.pairs == 'all':
        pairs = [(ids[p], ids[q]) for p in range(len(ids)) for q in range(p + 1, len(ids))]
    elif a.pairs == 'frustum':
        pairs = frustum_pairs(ims, ids)
    else:
        pairs = [tuple(l.split()[:2]) for l in open(a.pairs) if l.strip()]
    only = {('IMG_' + s.strip().replace('IMG_', '')) for s in a.only.split(',') if s.strip()}
    if only:
        pairs = [p for p in pairs if p[0] in only or p[1] in only]
    fn = os.path.join(OUT, 'matches.json')
    tried0 = set(tuple(x) for x in (json.load(open(fn)).get('tried', []) if os.path.exists(fn) else []))
    done = {}
    if os.path.exists(fn):
        for r in json.load(open(fn))['pairs']:
            done[(r['i'], r['j'])] = r
    todo = [(i, j, ims[i]['lens'], ims[j]['lens']) for i, j in pairs if (i, j) not in done and (i, j) not in tried0]
    print(f'[{time.time() - t0:6.0f}s] {len(todo)} pairs to match ({len(done)} cached)', flush=True)
    tried = set(tuple(x) for x in (json.load(open(fn)).get('tried', []) if os.path.exists(fn) else []))
    # matching runs in this process on the GPU, nearest pairs in time first (one standing spot, then neighbours)
    todo.sort(key=lambda p: abs(tsec_of(p[0]) - tsec_of(p[1])))
    if True:
        for k, (i, j, r) in enumerate(map(match_job, todo)):
            tried.add((i, j))
            if r is not None:
                done[(i, j)] = r
            if (k + 1) % 50 == 0 or k + 1 == len(todo):
                json.dump(dict(pairs=list(done.values()), tried=sorted(tried)), open(fn + '.tmp', 'w'))
                os.replace(fn + '.tmp', fn)
                print(f'[{time.time() - t0:6.0f}s] matched {k + 1}/{len(todo)}, {len(done)} verified', flush=True)
    json.dump(dict(pairs=list(done.values()), tried=sorted(tried)), open(fn + '.tmp', 'w'))
    os.replace(fn + '.tmp', fn)
    print(f'done in {time.time() - t0:.0f} s: {len(done)} verified pairs')
