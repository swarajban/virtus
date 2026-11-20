#!/usr/bin/env bash
# Read-only look at production on Fly: health, the deployed release, the
# machine's state, and recent logs. Never deploys or changes anything.
#
#   scripts/fly-status.sh          health, releases, machines, last 40 log lines
#   scripts/fly-status.sh 200      same, with the last 200 log lines
#
# Needs flyctl and FLY_API_TOKEN. The app auto-stops when idle
# (min_machines_running = 0), so a "stopped" machine is normal; the health
# request below wakes it.
set -euo pipefail

: "${FLY_API_TOKEN:?FLY_API_TOKEN must be set}"
APP=virtus
LINES=${1:-40}

echo "== health"
curl -fsS --max-time 30 "https://$APP.fly.dev/api/health" && echo
echo "== releases"
flyctl releases -a "$APP" | sed -n '1,6p'
echo "== machines"
flyctl machines list -a "$APP"
echo "== logs (last $LINES lines)"
flyctl logs -a "$APP" --no-tail | tail -n "$LINES"
