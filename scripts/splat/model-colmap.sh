#!/usr/bin/env bash
# Step 2: COLMAP 4.1.1 SfM over all model frames + stills, then undistort to PINHOLE for Brush.
# GPU SIFT/matching by default (GPU=0 for CPU): proven 150 frames in 8.5 s vs ~6 frames/min on CPU
# at background QoS on a loaded machine.
# Cameras: one SIMPLE_RADIAL per folder with focal priors (iPhone 15 Pro ultra-wide, 14 mm equiv):
#   video 1080x1920 f=887 px (refined in raw/splat-test), stills 1440x1920 f=777 px (EXIF 14 mm).
source "$(dirname "$0")/lib.sh"
C="$W/colmap"; DB="$C/database.db"; mkdir -p "$C"
# thread cap keeps our own contribution to the load average small (machine is shared)
T="${THREADS:-4}"
cd "$W/images"
ls v0*/*.jpg > "$C/list_video.txt"; ls stills/*.jpg > "$C/list_stills.txt"
if [ ! -f "$C/.features_done" ]; then
  # feature_extractor skips images already in the DB, so an aborted run resumes
  heavy colmap feature_extractor --database_path "$DB" --image_path "$W/images" --image_list_path "$C/list_video.txt" \
    --ImageReader.single_camera_per_folder 1 --ImageReader.camera_model SIMPLE_RADIAL --ImageReader.camera_params 887,540,960,0 \
    --FeatureExtraction.max_image_size 2048 --FeatureExtraction.use_gpu ${GPU:-1} --FeatureExtraction.num_threads $T > "$C/features_video.log" 2>&1
  heavy colmap feature_extractor --database_path "$DB" --image_path "$W/images" --image_list_path "$C/list_stills.txt" \
    --ImageReader.single_camera_per_folder 1 --ImageReader.camera_model SIMPLE_RADIAL --ImageReader.camera_params 777,720,960,0 \
    --FeatureExtraction.max_image_size 2048 --FeatureExtraction.use_gpu ${GPU:-1} --FeatureExtraction.num_threads $T > "$C/features_stills.log" 2>&1
  touch "$C/.features_done"
fi
if [ ! -f "$C/.seq_done" ]; then
  heavy colmap sequential_matcher --database_path "$DB" --SequentialMatching.overlap 12 \
    --SequentialMatching.quadratic_overlap 0 --FeatureMatching.use_gpu ${GPU:-1} --FeatureMatching.num_threads $T > "$C/sequential.log" 2>&1
  touch "$C/.seq_done"
fi
if [ ! -f "$C/.vocab_done" ]; then
  # cross-clip + stills links (already-matched pairs are skipped)
  heavy colmap vocab_tree_matcher --database_path "$DB" --VocabTreeMatching.num_images 25 --VocabTreeMatching.max_num_features 4096 \
    --FeatureMatching.use_gpu ${GPU:-1} --FeatureMatching.num_threads $T > "$C/vocab.log" 2>&1
  touch "$C/.vocab_done"
fi
if [ ! -d "$C/sparse/0" ]; then
  mkdir -p "$C/sparse"
  heavy colmap global_mapper --database_path "$DB" --image_path "$W/images" --output_path "$C/sparse" --GlobalMapper.num_threads $T > "$C/global_mapper.log" 2>&1
fi
if [ ! -d "$W/undist/sparse" ]; then
  heavy colmap image_undistorter --image_path "$W/images" --input_path "$C/sparse/0" --output_path "$W/undist" \
    --output_type COLMAP --num_threads $T > "$C/undistort.log" 2>&1
  mkdir -p "$W/undist/sparse/0" && mv "$W/undist/sparse/"*.bin "$W/undist/sparse/0/" 2>/dev/null || true
fi
colmap model_analyzer --path "$W/undist/sparse/0" 2>&1 | tail -12
