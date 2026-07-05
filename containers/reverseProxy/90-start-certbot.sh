#!/bin/sh
# Last entrypoint hook before nginx launches: background the issue/renew loop.
# It outlives this script (reparented to PID 1) and logs into the container's
# stdout/stderr stream alongside nginx.
certbot-loop.sh &
