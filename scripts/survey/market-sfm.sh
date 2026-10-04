#!/usr/bin/env bash
# Fish-market survey, step 1: COLMAP 4.1.1 structure-from-motion over the author's full-resolution market photos.
#   Images: raw/survey/market/images/{uw14,w24,t77}/IMG_*.jpg (HEIC -> JPEG q95 via heif-convert, EXIF kept, the
#   rotation applied so every frame is upright portrait, Orientation = 1).
#     w24  = 6.765 mm main lens, 4284 x 5712 (IMG_0792-0794, C棟 roof deck)                       -> OPENCV
#     uw14 = 2.22 mm ultra-wide, 3024 x 4032 (IMG_0795-0798, C棟 roof deck), strong distortion     -> OPENCV
#     t77  = 9 mm tele, 3024 x 4032 (IMG_0852-0861 under the north-block canopy, IMG_0870 C棟 hall) -> RADIAL
#   One camera per lens; focal priors from the diagonal 35 mm equivalent: f_px = f35 / 43.27 * diag_px.
#   CPU SIFT, plain DoG (the covariant affine + DSP detector crawled at ~1 % CPU under the gate's background QoS),
#   exhaustive matching with guided matching, then the incremental mapper with a low initial triangulation angle (the
#   tele frames were shot from a few metres apart) and multiple models (the roof deck and the canopy quay are 450 m
#   apart and cannot connect). Run under tools/anime/gate.sh run.
#   Output: raw/survey/market/sparse/<n>/ (one model per connected cluster), logs next to it.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
W="$ROOT/raw/survey/market"; I="$W/images"; DB="$W/database.db"; T="${THREADS:-6}"
mkdir -p "$W/sparse"
cd "$I"
extract() { # folder model params
  ls "$1"/*.jpg > "$W/list_$1.txt"
  colmap feature_extractor --database_path "$DB" --image_path "$I" --image_list_path "$W/list_$1.txt" \
    --ImageReader.single_camera 1 --ImageReader.camera_model "$2" --ImageReader.camera_params "$3" \
    --FeatureExtraction.use_gpu 0 --FeatureExtraction.num_threads "$T" --FeatureExtraction.max_image_size 4096 \
    --SiftExtraction.max_num_features 16384 \
    >> "$W/extract.log" 2>&1
}
if [ ! -f "$W/.features_done" ]; then
  rm -f "$DB" "$W/extract.log"
  extract uw14 OPENCV 1631,1631,1512,2016,0,0,0,0
  extract w24  OPENCV 3960,3960,2142,2856,0,0,0,0
  extract t77  RADIAL 8969,1512,2016,0,0
  touch "$W/.features_done"
fi
if [ ! -f "$W/.match_done" ]; then
  colmap exhaustive_matcher --database_path "$DB" --FeatureMatching.use_gpu 0 --FeatureMatching.num_threads "$T" \
    --FeatureMatching.guided_matching 1 --FeatureMatching.max_num_matches 32768 > "$W/match.log" 2>&1
  touch "$W/.match_done"
fi
if [ ! -d "$W/sparse/0" ]; then
  colmap mapper --database_path "$DB" --image_path "$I" --output_path "$W/sparse" \
    --Mapper.num_threads "$T" --Mapper.ba_refine_principal_point 0 --Mapper.init_min_num_inliers 50 \
    --Mapper.init_min_tri_angle 4 --Mapper.abs_pose_min_num_inliers 20 --Mapper.multiple_models 1 \
    --Mapper.min_model_size 3 > "$W/mapper.log" 2>&1
fi
for m in "$W"/sparse/*/; do echo "== $m"; colmap model_analyzer --path "$m" 2>&1 | grep -E "Cameras|Images|Registered|Points|Observations|Mean track|Mean obs|reprojection"; done
