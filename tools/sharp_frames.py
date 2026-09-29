#!/usr/bin/env python3
"""Pick the sharpest frame in each of N equal time windows of a video.

Reads raw 8-bit grayscale frames (W x H) from stdin, scores each with the
variance of the Laplacian, then keeps the best-scoring frame per window.

Usage:
  ffmpeg -i in.MOV -vf scale=540:960,format=gray -fps_mode passthrough \
         -f rawvideo - | python3 sharp_frames.py 540 960 150 out_dir
Writes out_dir/scores.csv, out_dir/selected.txt (0-based decoder frame
indices) and out_dir/select_expr.txt (an ffmpeg select= expression).
"""
import sys
import os
import numpy as np


def lap_var(img: np.ndarray) -> float:
    f = img.astype(np.float32)
    lap = (f[1:-1, :-2] + f[1:-1, 2:] + f[:-2, 1:-1] + f[2:, 1:-1]
           - 4.0 * f[1:-1, 1:-1])
    return float(lap.var())


def main() -> None:
    w, h, n_target, out_dir = int(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
    os.makedirs(out_dir, exist_ok=True)
    frame_bytes = w * h
    scores = []
    stdin = sys.stdin.buffer
    while True:
        buf = stdin.read(frame_bytes)
        if len(buf) < frame_bytes:
            break
        img = np.frombuffer(buf, dtype=np.uint8).reshape(h, w)
        scores.append(lap_var(img))
    n = len(scores)
    s = np.array(scores)
    edges = np.linspace(0, n, n_target + 1).astype(int)
    picks = []
    for a, b in zip(edges[:-1], edges[1:]):
        if b > a:
            picks.append(int(a + np.argmax(s[a:b])))
    with open(os.path.join(out_dir, "scores.csv"), "w") as fh:
        fh.write("frame,lapvar,selected\n")
        sel = set(picks)
        for i, v in enumerate(scores):
            fh.write(f"{i},{v:.3f},{int(i in sel)}\n")
    with open(os.path.join(out_dir, "selected.txt"), "w") as fh:
        fh.write("\n".join(map(str, picks)) + "\n")
    expr = "+".join(f"eq(n\\,{i})" for i in picks)
    with open(os.path.join(out_dir, "select_expr.txt"), "w") as fh:
        fh.write(expr)
    chosen = s[picks]
    print(f"frames={n} selected={len(picks)} "
          f"lapvar_all: median={np.median(s):.1f} p10={np.percentile(s, 10):.1f} "
          f"p90={np.percentile(s, 90):.1f} | selected: median={np.median(chosen):.1f} "
          f"min={chosen.min():.1f}")


if __name__ == "__main__":
    main()
