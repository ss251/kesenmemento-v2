#!/usr/bin/env bash
# Step 3: Brush 0.3.0 training on the undistorted COLMAP model (PINHOLE), SH3.
# Exports every $EVERY steps so an interrupted run leaves a usable PLY. Resume from any export:
#   RESUME=raw/work/model/brush/out/model_10000.ply START=10000 bash scripts/splat/model-train.sh
# (Brush initialises from <dataset>/init.ply; Adam state restarts, the LR schedule follows --start-iter.)
# Eval is off by default: the first run panicked right after the 10k export+eval
# (gaussian_splats.rs:402 index out of bounds); EVAL=5000 turns it back on with a 1-in-30 split.
source "$(dirname "$0")/lib.sh"
STEPS="${STEPS:-30000}"; EVERY="${EVERY:-2500}"; START="${START:-0}"
B="$W/brush"; D="$B/data"; mkdir -p "$B/out"
if [ -n "${RESUME:-}" ]; then D="$B/data_resume"; fi
mkdir -p "$D"
ln -sfn "$W/undist/images" "$D/images"
ln -sfn "$W/undist/sparse" "$D/sparse"
if [ -n "${RESUME:-}" ]; then ln -sfn "$(cd "$(dirname "$RESUME")" && pwd)/$(basename "$RESUME")" "$D/init.ply"; fi
EVALARGS="--eval-every 1000000"
if [ -n "${EVAL:-}" ]; then EVALARGS="--eval-every $EVAL --eval-split-every 30"; fi
cd "$B"
set +e
heavy /usr/bin/time -l "$BRUSH" "$D" --total-steps "$STEPS" --start-iter "$START" --export-every "$EVERY" $EVALARGS \
  --sh-degree 3 --max-resolution 1920 --export-path "$B/out" --export-name 'model_{iter}.ply' \
  >> "$B/train.log" 2>&1
rc=$?
echo "exit=$rc start=$START $(date -u +%FT%TZ)" >> "$B/train.log"
ls -la "$B/out"
exit $rc
