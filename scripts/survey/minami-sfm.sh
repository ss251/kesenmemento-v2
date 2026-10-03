#!/usr/bin/env bash
# South-shore (minami) survey, step 1: structure from motion over Sailesh's full-resolution photos.
#   Images: raw/survey/minami/images/{uw14,w24,w48,t77}/IMG_*.jpg (HEIC -> JPEG q95, EXIF kept, rotation applied); one
#   COLMAP camera per lens / 35 mm focal: uw14 = 2.22 mm ultra-wide (OPENCV, strong distortion), w24 = 6.765 mm main
#   (OPENCV), w48 = 2x crop of the main sensor (RADIAL), t77 = 9 mm tele (RADIAL). Focal priors from the diagonal 35 mm
#   equivalent: f_px = f35 / 43.27 * diag_px. The camera / rig / frame rows come from COLMAP's feature_extractor
#   (raw/survey/minami/database.db, first pass; its GPU SIFT matches are not used any more).
#
#   v2 (this script):
#     1. tools/survey/lgmatch.py : ALIKED (COLMAP's ONNX model, CPU) at two scales + LightGlue (PyTorch, Apple GPU) over
#        the frustum-overlap pairs, MAGSAC F check            -> raw/survey/minami/lg/
#     2. tools/survey/lgdb.py    : COLMAP database with those keypoints / matches -> raw/survey/minami/lg.db
#     3. colmap geometric_verifier, colmap mapper (incremental, principal point fixed)  -> raw/survey/minami/sparse_lg/
#     4. tools/survey/sfm_enu.py : the station-aware bundle adjustment + georegistration in ENU (see that file)
#   Heavy steps wait on tools/anime/gate.sh (load / memory) and run at nice 10 with 2 CPU threads each; the gate's `run`
#   mode (background QoS) stalled the CPU workers in I/O (0.4 % CPU), so it is used only as the wait.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
W="$ROOT/raw/survey/minami"; PY="$ROOT/raw/survey/.venv/bin/python"; T="${THREADS:-2}"
cd "$ROOT"
tools/anime/gate.sh
nice -n 10 "$PY" -u tools/survey/lgmatch.py --area minami --workers 2 --threads "$T" > "$W/lg/lgmatch.log" 2>&1
"$PY" tools/survey/lgdb.py --area minami --min 15
nice -n 10 colmap geometric_verifier --database_path "$W/lg.db" --num_threads "$T" \
  --TwoViewGeometry.min_inlier_ratio 0.1 --TwoViewGeometry.max_error 4 > "$W/lg_verify.log" 2>&1
rm -rf "$W/sparse_lg"; mkdir -p "$W/sparse_lg"
nice -n 10 colmap mapper --database_path "$W/lg.db" --image_path "$W/images" --output_path "$W/sparse_lg" \
  --Mapper.num_threads "$T" --Mapper.ba_refine_principal_point 0 --Mapper.init_min_num_inliers 50 \
  --Mapper.init_min_tri_angle 6 --Mapper.abs_pose_min_num_inliers 15 --Mapper.abs_pose_min_inlier_ratio 0.1 \
  --Mapper.multiple_models 1 > "$W/lg_mapper.log" 2>&1
for m in "$W"/sparse_lg/*/; do echo "== $m"; colmap model_analyzer --path "$m" 2>&1 | grep -E "Registered images|Points:|reprojection" | sed 's/.*\] //'; done
