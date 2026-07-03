#!/usr/bin/env bash
# Short-name launcher for the scripts in scripts/ — no shell config,
# no PATH changes, nothing to source:
#
#   ./cmd monitor --live      # runs scripts/monitor.sh --live
#   ./cmd                     # lists available commands
#
# Any executable <name>.sh in scripts/ is a command; adding a new script
# requires no changes here.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/scripts" && pwd)"

list_commands() {
  local f name desc
  echo "usage: ./cmd <command> [args...]"
  echo
  echo "commands:"
  for f in "$DIR"/*.sh; do
    [[ -x "$f" ]] || continue
    name="$(basename "${f%.sh}")"
    # First comment line after the shebang doubles as the description.
    desc="$(awk 'NR > 1 && /^# / {sub(/^# /, ""); print; exit}' "$f")"
    printf '  %-12s %s\n' "$name" "$desc"
  done
}

if [[ $# -eq 0 || "$1" == "-h" || "$1" == "--help" ]]; then
  list_commands
  exit 0
fi

TARGET="$DIR/${1%.sh}.sh"   # bare name or with .sh — both work
if [[ ! -x "$TARGET" ]]; then
  echo "cmd: unknown command '$1'" >&2
  echo >&2
  list_commands >&2
  exit 1
fi

shift
exec "$TARGET" "$@"
