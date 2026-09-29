#!/bin/sh
# Machine-load gate for heavy steps: waits (10 s sleeps, up to 10 min) while the 5-minute load average is > 20;
# exits 3 if the wait times out, exits 4 after 14:00 UTC (GPU cut-off). Usage: sh loadgate.sh && <heavy cmd>
now=$(date -u +%H%M)
if [ "$now" -ge 1400 ]; then echo "loadgate: past 14:00 UTC, GPU work not allowed" >&2; exit 4; fi
i=0
while :; do
  l5=$(uptime | sed -E 's/.*load averages?: *[0-9.]+,? +([0-9.]+).*/\1/')
  if awk "BEGIN{exit !($l5 <= 20)}"; then echo "loadgate: 5-min load $l5 ok" >&2; exit 0; fi
  i=$((i + 1)); if [ $i -gt 60 ]; then echo "loadgate: waited 10 min, load $l5" >&2; exit 3; fi
  sleep 10
done
