#!/bin/sh
# Chicken-and-egg breaker: the 443 server blocks reference
# /etc/letsencrypt/live/<domain>/ certs, but a fresh box has none, and certbot
# can't answer an HTTP-01 challenge until nginx is up. So before nginx starts,
# drop a 1-day self-signed placeholder for any domain that has no cert yet;
# certbot-loop.sh replaces it minutes later and reloads nginx. On a box with
# real certs already in /etc/letsencrypt (bind-mounted), this is a no-op.
set -e

for domain in "$APP_DOMAIN" "$API_DOMAIN" "$AUTH_DOMAIN"; do
  live="/etc/letsencrypt/live/$domain"
  [ -f "$live/fullchain.pem" ] && continue
  mkdir -p "$live"
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout "$live/privkey.pem" -out "$live/fullchain.pem" \
    -subj "/CN=$domain" 2>/dev/null
  echo "bootstrap-certs: placeholder self-signed cert for $domain"
done
