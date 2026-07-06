#!/usr/bin/env bash
# Both native dev servers: simulationAPI (npm run dev:local, :3003) and simulationWeb (npm run dev, :5173).
# Installs deps, prefixes each server's output ([api] / [web]), Ctrl-C stops both.
# The Docker pieces (Postgres/FusionAuth/edge) come from ./cmd local-stack — run that first,
# then open http://local.allin.makejohnacoffee.com.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# The repo pins Node in .nvmrc (Vite 8 refuses older versions); a
# non-interactive shell may have a stale default on PATH, so switch via nvm
# when it's installed. nvm.sh isn't clean under `set -u` — relax around it.
NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  set +u
  . "$NVM_DIR/nvm.sh"
  nvm use "$(cat "$REPO/.nvmrc")" >/dev/null
  set -u
fi

# dev:local points the API at the local stack's FusionAuth; warn up front
# instead of failing with a cryptic OIDC discovery error at first login.
if ! curl -fsS --max-time 2 "http://localhost:${LOCAL_FA_PORT:-9011}/api/status" >/dev/null 2>&1; then
  echo "warning: FusionAuth not answering on :${LOCAL_FA_PORT:-9011} — start the stack with ./cmd local-stack" >&2
fi

PIDS=()
run() { # run <label> <container-dir> <npm-script>
  local label=$1 dir=$2 script=$3
  (
    cd "$REPO/containers/$dir"
    npm install --no-fund --no-audit
    exec npm run "$script"
  ) 2>&1 | awk -v p="[$label] " '{ print p $0; fflush() }' &
  PIDS+=($!)
}

# Take down both servers (and their npm/tsx/vite children) when the script
# exits, whichever way. kill 0 signals the whole process group.
trap 'trap - INT TERM EXIT; kill 0 2>/dev/null' INT TERM EXIT

run api simulationAPI dev:local
run web simulationWeb dev

# No `wait -n` on macOS's bash 3.2 — poll instead, and exit (killing the
# survivor via the trap) as soon as either server dies.
while :; do
  for pid in "${PIDS[@]}"; do
    kill -0 "$pid" 2>/dev/null || exit 1
  done
  sleep 1
done
