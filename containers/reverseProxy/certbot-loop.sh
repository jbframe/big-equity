#!/bin/sh
# Certificate lifecycle, replacing the host's `certbot --nginx` + systemd
# renew timer (ADR-009). Runs in the background of the proxy container:
#   1. wait for nginx to serve (webroot challenges need port 80 answering)
#   2. issue a real cert for any domain still on a bootstrap placeholder,
#      retrying forever — at first boot DNS may still point elsewhere until
#      the Elastic IP is attached (same race ADR-001 handled on the host)
#   3. `certbot renew` twice a day; a deploy hook hot-reloads nginx whenever
#      a certificate actually changes
# One certificate per subdomain, so each can be renewed/revoked independently.

until wget -q -O /dev/null http://127.0.0.1/healthz; do
  sleep 2
done

for domain in "$APP_DOMAIN" "$API_DOMAIN" "$AUTH_DOMAIN"; do
  # A renewal config means a real Let's Encrypt cert already exists (e.g. the
  # bind-mounted /etc/letsencrypt migrated from the pre-ADR-009 host setup).
  [ -f "/etc/letsencrypt/renewal/$domain.conf" ] && continue

  # Clear the self-signed placeholder so certbot can claim the live/ path.
  rm -rf "/etc/letsencrypt/live/$domain" "/etc/letsencrypt/archive/$domain"

  attempt=0
  until certbot certonly --webroot -w /var/www/certbot -d "$domain" \
        --non-interactive --agree-tos -m "$CERTBOT_EMAIL" \
        --deploy-hook "nginx -s reload"; do
    attempt=$((attempt + 1))
    echo "certbot-loop: attempt $attempt for $domain failed; retrying in 30s"
    sleep 30
  done
done

while :; do
  certbot renew --webroot -w /var/www/certbot --deploy-hook "nginx -s reload"
  sleep 43200 # 12h, matching the old certbot-renew.timer cadence
done
