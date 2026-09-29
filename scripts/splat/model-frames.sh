#!/usr/bin/env bash
# Step 1: sharp frames from the 4 MOVs + the 22 HEIC stills of the scale model.
# Output: $W/images/v0599 ... v0602 (1080x1920 JPEG) and $W/images/stills (1440x1920).
source "$(dirname "$0")/lib.sh"
mkdir -p "$W/images" "$W/sharp"
win() { case $1 in 0599) echo 100;; 0600) echo 90;; 0601) echo 66;; 0602) echo 90;; esac; }
VT='scale_vt=w=%W%:h=%H%:color_matrix=bt709:color_primaries=bt709:color_transfer=bt709,hwdownload,format=p010le'
for id in 0599 0600 0601 0602; do
  mov="$ROOT/raw/photos/IMG_$id.MOV"
  out="$W/images/v$id"
  if [ -d "$out" ] && [ "$(ls "$out" | wc -l)" -ge "$(win $id)" ]; then echo "skip v$id"; continue; fi
  f_small=${VT//%W%/960}; f_small=${f_small//%H%/540}
  f_big=${VT//%W%/1920}; f_big=${f_big//%H%/1080}
  heavy ffmpeg -v error -noautorotate -hwaccel videotoolbox -hwaccel_output_format videotoolbox_vld -i "$mov" \
    -vf "$f_small,format=gray,transpose=1" -fps_mode passthrough -f rawvideo - \
    | python3 "$ROOT/tools/sharp_frames.py" 540 960 "$(win $id)" "$W/sharp/v$id"
  heavy ffmpeg -v error -noautorotate -hwaccel videotoolbox -hwaccel_output_format videotoolbox_vld -i "$mov" \
    -vf "$f_big,format=rgb24,transpose=1" -fps_mode passthrough -f rawvideo - \
    | python3 "$ROOT/tools/dump_frames.py" 1080 1920 "$W/sharp/v$id/selected.txt" "$out" 95
  # prefix names with the clip id so the set sorts clip by clip
  for f in "$out"/frame_*.jpg; do mv "$f" "$out/v${id}_$(basename "$f")"; done
done
# HEIC stills: IMG_0577..IMG_0598 are the model (0603-0605 are posters, excluded).
mkdir -p "$W/images/stills" "$W/heic_jpg"
for n in $(seq 577 598); do
  src="$ROOT/raw/photos/IMG_0$n.HEIC"; tmp="$W/heic_jpg/IMG_0$n.jpg"
  [ -f "$W/images/stills/IMG_0$n.jpg" ] && continue
  sips -s format jpeg -s formatOptions 95 "$src" --out "$tmp" >/dev/null
  # bake EXIF orientation, downscale to 1920 long side, strip EXIF (COLMAP/Brush ignore orientation tags)
  python3 - "$tmp" "$W/images/stills/IMG_0$n.jpg" <<'PY'
import sys
from PIL import Image, ImageOps
im = ImageOps.exif_transpose(Image.open(sys.argv[1])).convert("RGB")
im.thumbnail((1920, 1920), Image.LANCZOS)
im.save(sys.argv[2], quality=95)
print(sys.argv[2], im.size)
PY
done
