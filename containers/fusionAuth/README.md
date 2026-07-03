# fusionAuth

Self-hosted identity provider ([FusionAuth](https://fusionauth.io)) for
big-equity ([ADR-006](../../docs/adr/006-fusionauth-container.md)). Like
simulationDB, there is **no Dockerfile** — it runs the upstream, version-pinned
`fusionauth/fusionauth-app` image straight from a compose file, so the deploy
pipeline skips the build/GHCR steps and just syncs + `up -d`.

## Database — reuses simulationDB, no bundled Postgres

FusionAuth's stock deployment ships its *own* Postgres container. We don't run
it. Instead FusionAuth connects to the **existing** `simulationDB` Postgres over
the `simulation-net` docker network (`jdbc:postgresql://simulationdb:5432/…`) —
one database engine on the box, not two.

On first boot FusionAuth runs in **silent mode** and, using the root Postgres
credentials in `.env`, creates its **own `fusionauth` database and role** on
that server — a fresh namespace, fully isolated from the `simulation`
application data. It then migrates its schema automatically; there are no manual
migrations to run.

| Credential | Value | Purpose |
| --- | --- | --- |
| `DATABASE_ROOT_USERNAME` | `simulation` (the simulationDB superuser) | first-boot: create the `fusionauth` db + role |
| `DATABASE_ROOT_PASSWORD` | from `SIMULATIONDB_PASSWORD` | " |
| `DATABASE_USERNAME` | `fusionauth` | runtime app user |
| `DATABASE_PASSWORD` | from `FUSIONAUTHDB_PASSWORD` | runtime app password |

Both secrets are written into `.env` by the deploy pipeline on every deploy
(rotation = update the secret + redeploy), the same pattern simulationDB uses.

## Search engine — OpenSearch is off

FusionAuth's default deployment also runs an **OpenSearch** container as its
search backend. On this box that's out of the question — a JVM search cluster
would blow the memory budget. We set **`SEARCH_TYPE=database`**, so FusionAuth
uses the Postgres database for user search and runs **no search container at
all**. (Trade-off: database search is fine at this scale; very large user
counts would want a real search engine — ADR-006.)

## Exposure — public at id.makejohnacoffee.com

Auth flows need to be browser-reachable, so unlike simulationDB this is exposed.
The container publishes **loopback-only** `127.0.0.1:9011`; nginx on the box
terminates TLS for `https://id.makejohnacoffee.com` and proxies to it
(ADR-001 pattern). Port 9011 is never reachable from the internet directly.

Point the `id.makejohnacoffee.com` **DNS A record** at the Elastic IP before the
box rebuilds, or certbot can't issue the certificate (it retries for ~20 min).

## Data & backups

FusionAuth's data lives in the `fusionauth` database on simulationDB's named
volume — it survives restarts and redeploys, **not** a box rebuild. The weekly
backup cron on the box (ADR-003, widened in ADR-006) dumps it alongside the
`simulation` database, each to its own write-only prefix in the backup bucket
(`fusionauth/`, 30-day expiry). Until FusionAuth's first boot creates the
database, the cron skips it cleanly. Worst-case data loss is the weekly
cadence — tighten the cron before real accounts land.

## Memory

The `t3.micro` box has 916 MiB — this is deliberately the tightest tenant on
it (ADR-006: start small, grow if it hurts). FusionAuth's JVM heap is `512M`
(`FUSIONAUTH_APP_MEMORY`); the container is capped at `mem_limit: 640m`, below
heap+overhead, so overflow spills to the 1 GiB infra swapfile instead of
starving Postgres (capped at 256m), nginx, and the host. Expect it to lean on
swap in steady state. If login flows crawl or the container gets OOM-killed,
the fix is `instance_type = "t3.small"` in `infra/variables.tf` (a box
rebuild), not raising the cap.

## Poking at it

```sh
docker logs -f fusionauth                 # boot + migration progress
curl -fsS http://localhost:9011/api/status  # on the box: liveness JSON
```

The admin UI is at `https://id.makejohnacoffee.com/admin`. First visit walks
through creating the initial admin user (FusionAuth's Setup Wizard).

## Deployment

Ships through `deploy.yml` like everything else, minus the image build: the
pipeline creates `simulation-net` idempotently, syncs this compose file, writes
`.env` from the `SIMULATIONDB_PASSWORD` and `FUSIONAUTHDB_PASSWORD` secrets, and
runs `docker compose up -d`. Liveness is the compose healthcheck
(`/api/status`).
