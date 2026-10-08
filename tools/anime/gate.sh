#!/bin/bash
# Machine gate (shared the build machine, M2 Max 32 GB) — raised caps were allowed until 2026-10-01 00:00Z.
#   tools/anime/gate.sh                 -> waits until safe to start a heavy step (exit 0), or exits 3 if unsafe for 10 min
#   tools/anime/gate.sh chrome <cmd...> -> same, then runs <cmd> while holding the single global headless-Chrome lock
#   tools/anime/gate.sh run <cmd...>    -> same as chrome but without the browser lock (builds, long tests)
# Safe = 5-min load <= 14, memory_pressure free >= 25%, swap used <= 4 GB. Hard stop if load > 18 during the step.
# [v3:fix] the lock directory holds the owner's PID (a SIGKILLed owner's stale lock is reclaimed), the command runs with
# KLC_GATE=1 exported (tools/anime/cdp.mjs launch() refuses to start Chrome without it), and a watchdog stops the step
# when the 5-minute load goes above 18 (V3-SPEC section 8).
LOCK=/tmp/klc-chrome.lock
# The caps can be raised for one step (a raised 14/18 expired 2026-10-01; the defaults stay): KLC_GATE_LOAD=16 KLC_GATE_STOP=22 tools/anime/gate.sh ...
MAXLOAD=${KLC_GATE_LOAD:-14}; STOPLOAD=${KLC_GATE_STOP:-18}
ok() {
  local load free swapmb
  load=$(sysctl -n vm.loadavg | awk '{print $3}')
  free=$(memory_pressure 2>/dev/null | awk -F': ' '/free percentage/{gsub("%","",$2); print $2}')
  swapmb=$(sysctl -n vm.swapusage | sed -E 's/.*used = ([0-9.]+)M.*/\1/')
  # swap is ignored while free >= 40% (frozen processes' pages don't page back in; allowed until 2026-10-01 00:00Z)
  awk -v l="$load" -v m="$MAXLOAD" -v f="${free:-100}" -v s="${swapmb:-0}" 'BEGIN{exit !(l<=m && f>=25 && (s<=4096 || f>=40))}'
}
for i in $(seq 1 60); do ok && break; sleep 10; done
ok || { echo "gate: machine busy (load/memory/swap) for 10 min; stop and report" >&2; exit 3; }
MODE="$1"
[ "$MODE" = "chrome" ] || [ "$MODE" = "run" ] || exit 0
shift
# [perf] `gate.sh chrome --fg <cmd>`: the command runs at normal priority. Under `taskpolicy -b` every child (Chrome too) is held to the
# efficiency cores: 4.3x slower CPU on the M3 Pro (130 vs 558 ms, a bun loop, 2026-10-07), so frame times measured there are not what a
# visitor sees (tools/perf/run.mjs). The lock, the load check and the watchdog stay the same.
FG=0; if [ "${1:-}" = "--fg" ]; then FG=1; shift; fi

if [ "$MODE" = "chrome" ]; then
  got=0
  for i in $(seq 1 180); do
    if mkdir "$LOCK" 2>/dev/null; then echo $$ > "$LOCK/pid"; got=1; break; fi
    owner=$(cat "$LOCK/pid" 2>/dev/null)
    # stale lock: the owner is gone (SIGKILL, power loss) -> reclaim it
    if [ -n "$owner" ] && ! kill -0 "$owner" 2>/dev/null; then echo "gate: reclaiming stale chrome lock of dead pid $owner" >&2; rm -rf "$LOCK"; continue; fi
    # a lock without a pid file older than 30 min (pre-PID gate versions) is stale too
    if [ -z "$owner" ] && [ -n "$(find "$LOCK" -maxdepth 0 -mmin +30 2>/dev/null)" ]; then echo "gate: reclaiming an old chrome lock without a pid" >&2; rm -rf "$LOCK"; continue; fi
    sleep 5
  done
  [ "$got" = 1 ] || { echo "gate: chrome lock busy for 15 min" >&2; exit 4; }
  trap 'rm -rf "$LOCK" 2>/dev/null' EXIT
fi

export KLC_GATE=1
if [ "$FG" = 1 ]; then "$@" & else nice -n 15 taskpolicy -b "$@" & fi
CHILD=$!
trap 'kill -TERM "$CHILD" 2>/dev/null; exit 130' INT TERM HUP
# watchdog: stop the step if the 5-minute load climbs above 18
(
  while kill -0 "$CHILD" 2>/dev/null; do
    sleep 15
    l5=$(sysctl -n vm.loadavg | awk '{print $3}')
    if awk -v l="$l5" -v m="$STOPLOAD" 'BEGIN{exit !(l>m)}'; then
      echo "gate: 5-minute load $l5 > $STOPLOAD during the step; stopping it (V3-SPEC 8)" >&2
      pkill -TERM -P "$CHILD" 2>/dev/null; kill -TERM "$CHILD" 2>/dev/null
      sleep 5; pkill -KILL -P "$CHILD" 2>/dev/null; kill -KILL "$CHILD" 2>/dev/null
      exit 0
    fi
  done
) &
WATCH=$!
wait "$CHILD"; rc=$?
kill "$WATCH" 2>/dev/null; wait "$WATCH" 2>/dev/null
exit $rc
