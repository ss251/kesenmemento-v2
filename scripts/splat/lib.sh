#!/usr/bin/env bash
# Shared helpers for the model-splat pipeline (P3). Source, don't run.
# Machine load rules: every heavy command goes through `heavy`, which checks
# the 5-min load average first (wait up to 10 min while > 20, refuse if > 22)
# and runs the command under `nice -n 15 taskpolicy -b`.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
W="${W:-$ROOT/raw/work/model}"
BRUSH="$ROOT/tools/brush-app-aarch64-apple-darwin/brush_app"
BUILDLOD="$ROOT/tools/bin/build-lod"
DEADLINE_UTC="${DEADLINE_UTC:-14:00}"

load5() { uptime | sed -E 's/.*load averages?: *//' | tr -s ', ' ' ' | awk '{print $2}'; }

wait_for_load() {
  local waited=0 l
  while :; do
    l=$(load5)
    echo "[load] 5-min load $l ($(date -u +%H:%M:%S) UTC)" >&2
    if awk "BEGIN{exit !($l > 22)}"; then echo "[load] > 22, refusing heavy step" >&2; return 3; fi
    if awk "BEGIN{exit !($l <= 20)}"; then return 0; fi
    if [ "$waited" -ge 600 ]; then echo "[load] still > 20 after 10 min" >&2; return 3; fi
    sleep 30; waited=$((waited + 30))
  done
}

check_clock() {
  local now; now=$(date -u +%H:%M)
  if [[ "$now" > "$DEADLINE_UTC" || "$now" == "$DEADLINE_UTC" ]]; then
    echo "[clock] past $DEADLINE_UTC UTC, no GPU work" >&2; return 4; fi
}

# Run a heavy command at background priority with a watchdog that polls the 5-min
# load every 10 s and kills the command if it passes 22 (exit code 75 = aborted on load).
heavy() {
  check_clock; wait_for_load
  nice -n 15 taskpolicy -b "$@" &
  local pid=$! l rc
  while kill -0 "$pid" 2>/dev/null; do
    sleep 10
    l=$(load5)
    if awk "BEGIN{exit !($l > 22)}"; then
      echo "[load] 5-min load $l > 22: aborting $1 (pid $pid)" >&2
      pkill -TERM -P "$pid" 2>/dev/null || true; kill -TERM "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true; return 75
    fi
  done
  wait "$pid"; rc=$?; return $rc
}
