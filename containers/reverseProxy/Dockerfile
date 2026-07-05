# The public edge of the box (ADR-009): nginx terminates TLS on 80/443 and
# routes by hostname, with certbot in the same image handling Let's Encrypt
# issuance and renewal. One container instead of an nginx+certbot sidecar
# pair: renewals can then reload nginx directly (`nginx -s reload`) with no
# shared-volume/docker-socket choreography.
FROM nginx:1.29-alpine

# certbot-nginx isn't used for new issuance (webroot is), but certs migrated
# from the pre-ADR-009 host were created with `certbot --nginx` and carry
# `authenticator/installer = nginx` in their renewal configs — renewing those
# needs the plugin present.
RUN apk add --no-cache certbot certbot-nginx openssl \
    # Webroot certbot publishes HTTP-01 challenge files into; the port-80
    # server blocks serve /.well-known/acme-challenge/ from here.
    && mkdir -p /var/www/certbot

# Hostname routing config. The stock entrypoint envsubsts
# /etc/nginx/templates/*.template into /etc/nginx/conf.d/ at start, replacing
# only variables that exist in the environment (APP_DOMAIN etc.) — nginx
# runtime vars like $host pass through untouched.
COPY templates/ /etc/nginx/templates/
COPY proxy_headers.conf /etc/nginx/proxy_headers.conf

# 15-: placeholder self-signed certs so nginx can start before first issuance.
# 90-: backgrounds the issue/renew loop just before nginx launches.
COPY 15-bootstrap-certs.sh 90-start-certbot.sh /docker-entrypoint.d/
COPY certbot-loop.sh /usr/local/bin/certbot-loop.sh
RUN chmod +x /docker-entrypoint.d/15-bootstrap-certs.sh \
             /docker-entrypoint.d/90-start-certbot.sh \
             /usr/local/bin/certbot-loop.sh
