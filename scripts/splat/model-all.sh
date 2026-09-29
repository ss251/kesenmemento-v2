#!/usr/bin/env bash
# Scale-model splat, end to end (P3 + ADDENDUM-model). Every step is idempotent / resumable and obeys the
# machine load rules through lib.sh (uptime gate <= 20, abort > 22, nice -n 15 taskpolicy -b, 14:00 UTC stop).
#   bash scripts/splat/model-all.sh            # frames -> COLMAP -> Brush 30k -> clean/LoD/json -> previews
# Individual steps:
#   bash scripts/splat/model-frames.sh         # 346 sharp video frames + 22 HEIC stills -> raw/work/model/images
#   bash scripts/splat/model-colmap.sh         # SIFT (GPU) + sequential + vocab-tree matching, global_mapper, undistort
#   bash scripts/splat/model-train.sh          # Brush SH3; RESUME=<ply> START=<iter> to continue from an export
#   YAW=0.74 bash scripts/splat/model-finish.sh   # crop/clean/fill -> build-lod -> data/splats/{model.rad,*.radc,splats.json}
#   env -u NODE_OPTIONS nice -n 15 taskpolicy -b bun scripts/splat/model-preview.js   # before/after renders + QA
set -euo pipefail
D="$(cd "$(dirname "$0")" && pwd)"
bash "$D/model-frames.sh"
bash "$D/model-colmap.sh"
[ -f "$D/../../raw/work/model/brush/out/model_30000.ply" ] || bash "$D/model-train.sh"
YAW="${YAW:-0.74}" bash "$D/model-finish.sh"
cd "$D/../.." && env -u NODE_OPTIONS nice -n 15 taskpolicy -b bun scripts/splat/model-preview.js
