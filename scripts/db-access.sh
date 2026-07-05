#!/usr/bin/env bash
# Toggle dev-only public access to simulationDB (ADR-005) via the db-access
# workflow. `enable` opens 5432 to your current public IP; `disable` closes
# it. The nightly failsafe in the workflow disables it regardless.
#
# Usage:
#   scripts/db-access.sh enable     # open 5432 to your current public IP
#   scripts/db-access.sh disable    # unpublish the port and revoke all rules
set -euo pipefail

usage() { echo "usage: $0 enable|disable" >&2; exit 2; }

case "${1:-}" in
  enable)
    IP="$(curl -fsS --max-time 10 https://checkip.amazonaws.com)"
    if ! [[ "$IP" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
      echo "error: could not determine public IP (got: $IP)" >&2; exit 1
    fi
    CIDR="$IP/32"
    echo "Opening 5432 to $CIDR"
    gh workflow run db-access.yml -f action=enable -f cidr="$CIDR"
    ;;
  disable)
    echo "Closing 5432"
    gh workflow run db-access.yml -f action=disable
    ;;
  *) usage ;;
esac

# workflow_dispatch is fire-and-forget; wait for the run to appear, then
# follow it to completion.
sleep 5
RUN_ID="$(gh run list --workflow=db-access.yml --limit 1 --json databaseId -q '.[0].databaseId')"
gh run watch "$RUN_ID" --exit-status

if [[ "$1" == enable ]]; then
  echo "Connect at db.makejohnacoffee.com:5432 (remember: $0 disable when done)"
fi
