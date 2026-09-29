#!/usr/bin/env bash
# Step 4: clean + crop -> build-lod (.rad + .radc) -> data/splats/{model.rad, model-lod-*.radc, model_points.ply, splats.json}
# -> before/after preview renders. Env: PLY (default: latest export), YAW (deg, north alignment), CLEAN_ARGS (extra flags).
source "$(dirname "$0")/lib.sh"
F="$W/final"; OUT="$ROOT/data/splats"; PV="$W/preview"; mkdir -p "$F/lod" "$OUT" "$PV"
PLY="${PLY:-$(ls -t "$W"/brush/out/model_*.ply | head -1)}"
SRC=$(basename "$PLY"); STEPS=$(echo "$SRC" | sed -E 's/[^0-9]*([0-9]+)\.ply/\1/')
SPARSE="$W/undist/sparse/0"
TOTAL=$(ls "$W"/images/*/*.jpg | wc -l | tr -d ' ')
echo "[finish] $SRC steps=$STEPS images=$TOTAL"
cd "$ROOT"
env -u NODE_OPTIONS bun scripts/splat/clean.js --ply "$PLY" --sparse "$SPARSE" --out "$F/model.ply" --report "$F/clean_report.json" \
  --width 3.0 --yaw "${YAW:-0}" --fill ${CLEAN_ARGS:-}
rm -f "$F/lod/"*
ln -sf "$F/model.ply" "$F/lod/model.ply"
( cd "$F/lod" && heavy "$BUILDLOD" --quality --rad-chunked --cluster-sh model.ply > "$F/buildlod.log" 2>&1 )
rm -f "$OUT"/model.rad "$OUT"/model-lod-*.radc
cp "$F/lod/model-lod.rad" "$OUT/model.rad"
cp "$F/lod/"model-lod-*.radc "$OUT/"
env -u NODE_OPTIONS bun scripts/splat/splats-json.js --report "$F/clean_report.json" --rad "$OUT/model.rad" --ply "$F/model.ply" \
  --sparse "$SPARSE" --steps "$STEPS" --source "$SRC" --totalImages "$TOTAL" --extra "$W/splats_extra.json" --qa "$PV/qa.json"
