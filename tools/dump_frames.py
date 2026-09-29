#!/usr/bin/env python3
"""Write only the listed frames of a raw rgb24 stream to JPEG.

Usage:
  ffmpeg ... -vf "...,format=rgb24" -fps_mode passthrough -f rawvideo - \
    | python3 dump_frames.py W H selected.txt out_dir [quality]
selected.txt holds 0-based decoder frame indices, one per line.
"""
import sys
import os
from PIL import Image


def main() -> None:
    w, h = int(sys.argv[1]), int(sys.argv[2])
    wanted = sorted({int(x) for x in open(sys.argv[3]).read().split()})
    out_dir = sys.argv[4]
    quality = int(sys.argv[5]) if len(sys.argv) > 5 else 95
    os.makedirs(out_dir, exist_ok=True)
    want = set(wanted)
    last = wanted[-1]
    size = w * h * 3
    stdin = sys.stdin.buffer
    i = written = 0
    while i <= last:
        buf = stdin.read(size)
        if len(buf) < size:
            break
        if i in want:
            written += 1
            Image.frombytes("RGB", (w, h), buf).save(
                os.path.join(out_dir, f"frame_{written:04d}_n{i:05d}.jpg"),
                quality=quality)
        i += 1
    # drain so ffmpeg exits cleanly
    while stdin.read(1 << 20):
        pass
    print(f"read={i} written={written} wanted={len(wanted)}")


if __name__ == "__main__":
    main()
