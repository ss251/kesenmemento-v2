"""Survey step 1b (v2): a COLMAP database from the ALIKED keypoints and LightGlue matches of tools/survey/lgmatch.py.

  raw/survey/.venv/bin/python tools/survey/lgdb.py --area minami [--out raw/survey/minami/lg.db] [--min 15]
  colmap geometric_verifier --database_path raw/survey/minami/lg.db ...   (then the mapper)

The rigs, frames, cameras (one per lens) and images are copied from raw/survey/<area>/database.db (COLMAP 4.1.1's
feature_extractor wrote them: images/<lens>/IMG_*.jpg, OPENCV for 14 / 24 mm, RADIAL for 48 / 77 mm). The keypoints are
replaced by both ALIKED levels concatenated (hi, then ang; full-resolution pixels), and the LightGlue + MAGSAC inliers go
in as raw matches; two_view_geometries is left empty for COLMAP's geometric_verifier, which classifies each pair
(calibrated / panoramic / planar) for the mapper.
"""
import argparse
import json
import os
import shutil
import sqlite3
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import slib  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument('--area', default='minami')
ap.add_argument('--out', default=None)
ap.add_argument('--min', type=int, default=15)
ap.add_argument('--exclude', default='')
a = ap.parse_args()
RAW = os.path.join(slib.ROOT, 'raw/survey', a.area)
LG = os.path.join(RAW, 'lg')
OUT = a.out or os.path.join(RAW, 'lg.db')
M = 2147483647
excl = {('IMG_' + s.strip().replace('IMG_', '')) for s in a.exclude.split(',') if s.strip()}

src = sqlite3.connect(os.path.join(RAW, 'database.db'))
src.execute('PRAGMA wal_checkpoint(FULL)')
src.close()
for ext in ('', '-wal', '-shm'):
    if os.path.exists(OUT + ext):
        os.remove(OUT + ext)
shutil.copyfile(os.path.join(RAW, 'database.db'), OUT)
con = sqlite3.connect(OUT)
for t in ('keypoints', 'descriptors', 'matches', 'two_view_geometries'):
    con.execute(f'delete from {t}')
img_id, offset = {}, {}
for iid, name in con.execute('select image_id, name from images').fetchall():
    k = slib.img_id(name)
    if k in excl:
        continue
    zs = {lv: np.load(os.path.join(LG, f'feat_{k}_{lv}.npz')) for lv in ('hi', 'ang')}
    kp = np.concatenate([zs['hi']['kp'], zs['ang']['kp']]).astype(np.float32)
    offset[k] = {'hi': 0, 'ang': len(zs['hi']['kp'])}
    img_id[k] = iid
    con.execute('insert into keypoints values (?,?,?,?)', (iid, len(kp), 2, kp.tobytes()))
mj = json.load(open(os.path.join(LG, 'matches.json')))
n = 0
for r in mj['pairs']:
    if r['i'] not in img_id or r['j'] not in img_id or len(r['m']) < a.min:
        continue
    m = np.array(r['m'], np.int64)
    m[:, 0] += offset[r['i']][r['level']]
    m[:, 1] += offset[r['j']][r['level']]
    i, j = img_id[r['i']], img_id[r['j']]
    if i > j:
        i, j, m = j, i, m[:, ::-1]
    con.execute('insert or replace into matches values (?,?,?,?)', (i * M + j, len(m), 2, np.ascontiguousarray(m.astype(np.uint32)).tobytes()))
    n += 1
con.commit()
print(f'{os.path.relpath(OUT, slib.ROOT)}: {len(img_id)} images, {n} matched pairs (>= {a.min})')
