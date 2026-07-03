#!/usr/bin/env bash
# Snapshot of container + node health on the EC2 instance: CPU, memory,
# disk, network, and healthcheck status. Read-only; safe to run any time.
#
# Usage:
#   scripts/monitor.sh            # one-shot snapshot
#   scripts/monitor.sh --live     # live view, net/disk as per-second rates (ctrl-c to exit)
#
# Host resolution: $EC2_HOST if set, otherwise `terraform output` from infra/.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSH_KEY="${EC2_SSH_KEY_PATH:-$HOME/.ssh/ec2_deploy_key}"

HOST="${EC2_HOST:-}"
if [[ -z "$HOST" ]]; then
  HOST="$(terraform -chdir="$REPO_ROOT/infra" output -raw public_ip 2>/dev/null)" ||
    { echo "error: set EC2_HOST or run terraform init in infra/ first" >&2; exit 1; }
fi

SSH=(ssh -i "$SSH_KEY" -o ConnectTimeout=8 "ec2-user@$HOST")

if [[ "${1:-}" == "--live" ]]; then
  # Refresh loop instead of plain `docker stats`: keeps a header on screen,
  # adds a NODE row, and shows NET/DISK as per-second rates instead of the
  # cumulative-since-start odometers docker reports. Rates come from diffing
  # raw kernel counters (container-netns /proc/<pid>/net/dev, cgroup io.stat,
  # /proc/diskstats) across each ~2s docker-stats sampling window. Ctrl-C exits.
  LIVE_SCRIPT="$(cat <<'EOF'
cpu_snap() { awk '/^cpu /{print $2+$3+$4+$6+$7+$8, $2+$3+$4+$5+$6+$7+$8; exit}' /proc/stat; }

# One "<name> <rx> <tx> <disk-read> <disk-written>" line (cumulative bytes)
# per container, then the same for the whole node.
io_snap() {
  while read -r name cid pid; do
    [[ -n "$pid" ]] || continue
    read -r rx tx <<<"$(awk '$1 == "eth0:" {print $2, $10; ok = 1} END {if (!ok) print 0, 0}' "/proc/$pid/net/dev" 2>/dev/null)"
    read -r rd wr <<<"$(awk '{for (i = 2; i <= NF; i++) {if ($i ~ /^rbytes=/) r += substr($i, 8); if ($i ~ /^wbytes=/) w += substr($i, 8)}} END {print r + 0, w + 0}' "/sys/fs/cgroup/system.slice/docker-$cid.scope/io.stat" 2>/dev/null)"
    echo "${name#/} ${rx:-0} ${tx:-0} ${rd:-0} ${wr:-0}"
  done <<<"$(docker ps -q | xargs -r docker inspect --format '{{.Name}} {{.Id}} {{.State.Pid}}')"
  awk '
    FILENAME ~ /net/       && $1 ~ /^(eth|ens|enp)/ {rx += $2; tx += $10}
    FILENAME ~ /diskstats/ && $3 ~ /^(nvme[0-9]+n[0-9]+|xvd[a-z]+)$/ {rd += $6 * 512; wr += $10 * 512}
    END {print "NODE", rx + 0, tx + 0, rd + 0, wr + 0}
  ' /proc/net/dev /proc/diskstats
}

while :; do
  t1=$EPOCHREALTIME; s1="$(io_snap)"; read -r b1 tt1 <<<"$(cpu_snap)"
  stats="$(docker stats --no-stream \
    --format '{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}')"
  read -r b2 tt2 <<<"$(cpu_snap)"; t2=$EPOCHREALTIME; s2="$(io_snap)"
  cpu="$(awk -v db=$((b2 - b1)) -v dt=$((tt2 - tt1)) \
    'BEGIN {printf "%.2f", (dt > 0 ? db * 100 / dt : 0)}')"
  read -r mu mt <<<"$(awk '/^MemTotal/ {t = $2} /^MemAvailable/ {a = $2} END {print (t - a) * 1024, t * 1024}' /proc/meminfo)"
  frame="$({
    printf 'NAME\tCPU %%\tMEM USAGE / LIMIT\tMEM %%\tNET RX/TX per s\tDISK R/W per s\n'
    printf '==S1==\n%s\n==S2==\n%s\n==ST==\n%s\n' "$s1" "$s2" "$stats" |
      awk -v dt="$(awk -v a="$t1" -v b="$t2" 'BEGIN {print (b - a > 0 ? b - a : 1)}')" \
          -v nodecpu="$cpu" -v mu="$mu" -v mt="$mt" '
        function si(x)  { return x >= 1e9 ? sprintf("%.3gGB", x / 1e9) : x >= 1e6 ? sprintf("%.3gMB", x / 1e6) : x >= 1e3 ? sprintf("%.3gkB", x / 1e3) : sprintf("%dB", x) }
        function iec(x) { return x >= 2^30 ? sprintf("%.4gGiB", x / 2^30) : sprintf("%.4gMiB", x / 2^20) }
        function rates(k) {
          if (!(k in rx1) || !(k in rx2)) return "-\t-"
          return sprintf("%s / %s\t%s / %s", si((rx2[k] - rx1[k]) / dt), si((tx2[k] - tx1[k]) / dt), \
                                             si((rd2[k] - rd1[k]) / dt), si((wr2[k] - wr1[k]) / dt))
        }
        /^==S1==$/ {sec = 1; next} /^==S2==$/ {sec = 2; next} /^==ST==$/ {sec = 3; next}
        sec == 1 {rx1[$1] = $2; tx1[$1] = $3; rd1[$1] = $4; wr1[$1] = $5; next}
        sec == 2 {rx2[$1] = $2; tx2[$1] = $3; rd2[$1] = $4; wr2[$1] = $5; next}
        sec == 3 {split($0, a, "\t"); printf "%s\t%s\t%s\t%s\t%s\n", a[1], a[2], a[3], a[4], rates(a[1])}
        END {printf "NODE\t%s%%\t%s / %s\t%.2f%%\t%s\n", nodecpu, iec(mu), iec(mt), mu * 100 / mt, rates("NODE")}
      '
  } | column -t -s "$(printf '\t')")"
  # Redraw in place (home cursor, overwrite each line, erase the remainder)
  # with no trailing newline — a full-screen clear plus final newline makes
  # short terminals scroll the header row off on every refresh.
  printf '\033[H'
  printf '%s' "$frame" | awk '{if (NR > 1) printf "\n"; printf "%s\033[K", $0} END {printf "\033[J"}'
  sleep 1
done
EOF
)"
  exec "${SSH[@]}" -t "bash -c $(printf '%q' "$LIVE_SCRIPT")"
fi

"${SSH[@]}" 'bash -s' <<'REMOTE'
section() { printf "\n=== %s ===\n" "$1"; }

section "CONTAINERS: health"
docker ps --format "table {{.Names}}\t{{.Status}}"

section "CONTAINERS: cpu / mem / net / disk io"
docker stats --no-stream \
  --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}"

section "NODE: cpu / load"
uptime
vmstat 1 2 | awk 'END {printf "cpu: %s%% user, %s%% system, %s%% idle, %s%% iowait (1s avg)\n", $13, $14, $15, $16}'

section "NODE: memory (MiB)"
free -m

section "NODE: disk"
df -h / /var/lib/docker 2>/dev/null | awk '!seen[$1]++'

section "NODE: network (since boot)"
awk -F: '
  NR > 2 {
    iface = $1; gsub(/ /, "", iface)
    if (iface ~ /^(lo|docker|br-|veth)/) next
    split($2, f, " ")
    printf "%-8s rx: %.1f MiB (%s pkts)   tx: %.1f MiB (%s pkts)\n", \
      iface, f[1] / 1048576, f[2], f[9] / 1048576, f[10]
  }' /proc/net/dev
REMOTE
