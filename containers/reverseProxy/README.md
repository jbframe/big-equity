# reverseProxy

The public edge of the box ([ADR-009](../../docs/adr/009-reverse-proxy-container.md)):
nginx + certbot in one container, replacing the host-installed nginx and
certbot that `user_data` used to set up (ADR-001). It is the **only container
that publishes host ports** (80/443); everything else is Docker-network-only
behind it.

## What it does

- **TLS termination + hostname routing** for all three public hostnames, over
  the shared `simulation-net` network:

  | Hostname | Proxies to | Notes |
  | --- | --- | --- |
  | `allin.makejohnacoffee.com` | `simulationapi:3003` | the whole vhost — simulationAPI is the app gateway ([ADR-010](../../docs/adr/010-gateway-in-simulationapi.md)): it enforces the ADR-007 login wall in-process and proxies valid sessions on to `simulationweb:80` |
  | `api.makejohnacoffee.com` | `simulationapi:3003` | data API; the gateway routes are host-constrained inside the app and 404 here (ADR-010) |
  | `id.makejohnacoffee.com` | `fusionauth:9011` | `client_max_body_size 64m` for admin uploads |

  The edge is deliberately auth-agnostic — no `auth_request`, no app paths;
  routing, TLS, and rate limits only.

- **Per-client-IP rate limiting** at the edge (429 over the burst), same zones
  as the old host config.
- **Let's Encrypt lifecycle**: a background loop ([certbot-loop.sh](certbot-loop.sh))
  issues a certificate per subdomain via webroot HTTP-01, retries until DNS/the
  Elastic IP is in place, then renews twice daily and hot-reloads nginx when a
  cert actually changes.
- **Port 80** exists only for ACME challenges and the 301 to HTTPS. Unknown
  hostnames get connection-dropped (444); `GET /healthz` answers the compose
  healthcheck.

## Certificates

`/etc/letsencrypt` is a **host bind-mount**, so certs survive container and
image replacement — and a box migrated from the pre-ADR-009 setup keeps its
existing certs with no reissue (the loop skips any domain that already has a
renewal config).

On a fresh box there's a chicken-and-egg problem: the 443 config references
certs that don't exist yet, and certbot can't answer a challenge until nginx
is up. [15-bootstrap-certs.sh](15-bootstrap-certs.sh) breaks it by generating
a 1-day self-signed placeholder for any missing domain before nginx starts;
the loop replaces it minutes later. Until then browsers see a certificate
warning — that's the placeholder, not a problem, and it resolves itself.

Point each **DNS A record** at the Elastic IP; issuance retries every 30s
forever, so DNS being late costs time, not a rebuild.

## Config layout

nginx config is an envsubst template ([templates/default.conf.template](templates/default.conf.template)):
the stock nginx image entrypoint substitutes `APP_DOMAIN`/`API_DOMAIN`/`AUTH_DOMAIN`
from the compose environment at container start. Changing a domain is a
compose-file edit + redeploy — no Terraform involved (the same domains live in
`infra/variables.tf` only for its outputs).

## Poking at it

```sh
docker logs -f reverseproxy         # nginx + certbot-loop output, one stream
docker exec reverseproxy nginx -t   # validate rendered config
docker exec reverseproxy certbot certificates   # what's issued, expiry dates
curl -fsS http://localhost/healthz  # on the box: edge liveness
```

## Deployment

Ships through `deploy.yml` like everything else: the Dockerfile builds to
GHCR, the pipeline syncs the compose file and runs `docker compose up -d`. No
`.env` — the domains aren't secrets and live in the compose file.

**One-time cutover on a box running the old host nginx** (ADR-009): stop and
disable `nginx` and `certbot-renew.timer` on the host first, or the container
can't bind 80/443. See the ADR's migration section.
