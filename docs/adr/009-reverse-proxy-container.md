# ADR-009: Move the reverse proxy and certbot into a container

Date: 2026-07-05

Status: **Accepted**

## Requirements
- Move the nginx reverse proxy and the Let's Encrypt (certbot) lifecycle off
  the host and into a container, deployed through the existing `deploy.yml`
  pipeline like every other deployable
- Keep the public behavior identical: same three hostnames, same TLS, same
  per-IP rate limits, same ADR-007 login wall semantics
- Keep the existing certificates — no reissue (and no Let's Encrypt rate-limit
  exposure) when migrating the current box
- A fresh box rebuild must still converge with no manual steps, including
  first-time certificate issuance and the Elastic-IP/DNS race ADR-001 handled
- Routing config changes (new subdomain, new backend) should be a normal
  container deploy, not a box rebuild

## Options

### Proxy placement
1. **One container: nginx + certbot in the same image** — certbot's deploy
   hook can `nginx -s reload` directly; one deployable, one log stream
2. **Two containers: nginx + a certbot sidecar** — the textbook compose
   pattern, but the sidecar can't reload nginx without a shared-volume
   touch-file hack or the docker socket, and the pipeline builds one image
   per container dir
3. **Status quo: host nginx + certbot from user_data (ADR-001)** — works, but
   proxy config changes are baked into first-boot, so every routing tweak is
   a box rebuild (`user_data_replace_on_change = true`)

### How the proxy reaches the backends
1. **Join `simulation-net`; drop the loopback host ports** — proxy targets
   stable container names (`simulationweb:80`, `simulationapi:3003`,
   `fusionauth:9011`); backends stop listening on host interfaces entirely
2. **`network_mode: host`** — keeps `127.0.0.1:*` targets unchanged, but the
   proxy container escapes network isolation and the backends keep host
   listeners they no longer need

### Certificate storage
1. **Bind-mount host `/etc/letsencrypt`** — certs survive container/image
   replacement and the current box's certs carry over untouched
2. **Named volume** — more docker-idiomatic, but orphans the existing certs
   and dies with `docker volume rm`

## Decision
Placement **option 1**, networking **option 1**, storage **option 1**.

`containers/reverseProxy/` builds one image from `nginx:alpine` with certbot
installed. It:

- publishes **80/443** — now the only container with host ports; every other
  container is Docker-network-only behind it
- renders the vhosts from an **envsubst template** at container start
  (`APP_DOMAIN`/`API_DOMAIN`/`AUTH_DOMAIN`/`CERTBOT_EMAIL` set in the compose
  file — domains move out of Terraform, which keeps its copies only for
  outputs)
- proxies over `simulation-net` to `simulationweb:80`, `simulationapi:3003`
  and `fusionauth:9011`; those compose files gain `container_name` +
  `simulation-net` and **drop their `127.0.0.1` port publishes**
- carries the per-IP limit zones unchanged. (As first written it also carried
  the ADR-007 `auth_request` login wall and an api-vhost `/auth/*` 404;
  [ADR-010](010-gateway-in-simulationapi.md) moved both into simulationAPI,
  leaving the edge auth-agnostic)
- breaks the fresh-box chicken-and-egg with a **1-day self-signed placeholder
  cert** per missing domain (entrypoint hook), then a background
  `certbot-loop.sh` issues real certs via **webroot HTTP-01** (retrying
  forever through the EIP/DNS race), renews twice daily, and hot-reloads
  nginx via deploy hook
- keeps `/etc/letsencrypt` as a **host bind-mount**; the loop skips any
  domain that already has a renewal config, so migrated certs are reused

`user_data.sh.tftpl` shrinks to: Docker, swapfile, `simulation-net`, backup
cron, SSH KEX, and `mkdir /etc/letsencrypt`. The nginx/certbot install, the
templated vhosts, and the issue/renew machinery are gone from first-boot.

## Rationale
- **Routing config now deploys like code.** Under ADR-001 every vhost change
  meant a box rebuild; now it's an edit to the template + push to main.
- **The whole stack is containers.** One deployment model, one place to look
  (`docker ps` shows the entire system); the host is reduced to Docker, a
  swapfile, cron, and a cert directory.
- **Same-container certbot dissolves the reload problem.** The sidecar
  pattern's ugliest part (getting nginx to notice a renewed cert) becomes a
  one-line `--deploy-hook "nginx -s reload"`.
- **Tighter network posture.** Backends no longer hold host listeners; the
  edge is the only ingress, and the api hostname stops exposing the ADR-007
  session routes.

## Tradeoffs
- **Two processes in one container** (nginx + the certbot loop) is not
  docker-idiomatic. Accepted: the alternative buys idiomatic purity with a
  cross-container reload hack, and the loop logs into the same stream where
  anyone debugging TLS will already be looking.
- **A broken proxy deploy takes down all three sites at once.** True of the
  host nginx too, but a bad container image is easier to ship than a bad
  hand-edit. Mitigation: `docker exec reverseproxy nginx -t` before rollout
  is testable locally, and rollback is redeploying the previous image tag.
- **user_data changed, so the next `terraform apply` replaces the instance**
  (`user_data_replace_on_change = true`). The DB named volume dies with the
  box — restore from the S3 dumps (ADR-004). Alternatively migrate the live
  box in place first (below) and let the rebuild happen whenever the box next
  needs one anyway.
- **Placeholder-cert window on a fresh box:** until first issuance succeeds
  (~a minute after DNS/EIP align), browsers see a self-signed warning instead
  of a connection refusal. Cosmetic, self-healing.

## Implementation

Cutover on the **existing** box (no rebuild — do this once, before or right
after merging):

1. `sudo systemctl disable --now nginx certbot-renew.timer` — frees 80/443;
   the existing certs stay in `/etc/letsencrypt`
2. Deploy (push to main, or re-run `deploy.yml`): the backends recreate
   without host ports and the proxy container comes up, reusing the certs via
   the bind-mount
3. Verify: all three URLs serve, `docker exec reverseproxy certbot
   certificates` shows the migrated certs, and a login round-trip works
4. Optionally `sudo dnf remove -y nginx certbot python3-certbot-nginx`

Downtime is the gap between step 1 and the proxy container starting —
seconds if you re-run the deploy workflow immediately after.

A **fresh box** needs nothing: user_data prepares Docker + `/etc/letsencrypt`,
the first deploy brings up the proxy, placeholders bridge until certbot wins
its retry loop. The `EC2_HOST` secret and DNS records are unchanged
(Elastic IP survives; on a rebuild it re-attaches).
