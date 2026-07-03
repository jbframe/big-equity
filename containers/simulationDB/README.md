# simulationDB

PostgreSQL database for the equity simulator
([ADR-003](../../docs/adr/003-simulationdb-container.md)). Unlike every other
container, there is **no Dockerfile** — it runs the upstream, digest-pinned
`postgres:18-alpine` image straight from a compose file, so the deploy
pipeline skips the build/GHCR steps and just syncs + `up -d`.

**Private by design:** the compose file has no `ports:` key at all. The only
way in is over the `simulation-net` docker network, and simulationAPI is the
only client — all reads and writes flow through its CRUD layer over HTTPS.
Temporary developer access is a manual, dev-only toggle
([ADR-005](../../docs/adr/005-simulationdb-dev-access-toggle.md)), not a
standing port.

## Configuration

Credentials live in `.env` next to the compose file on the box —
**written by the deploy pipeline on every deploy** from the
`SIMULATIONDB_PASSWORD` GitHub secret (rotation = update the secret +
redeploy):

| Variable | Value |
| --- | --- |
| `POSTGRES_USER` | `simulation` |
| `POSTGRES_PASSWORD` | from the `SIMULATIONDB_PASSWORD` secret |
| `POSTGRES_DB` | `simulation` |

The same deploy writes simulationAPI's `DATABASE_URL`
(`postgresql://simulation:…@simulationdb:5432/simulation`). Keep the secret
URL-safe (alphanumeric) — it's interpolated into that URL unescaped.

## Memory guardrails

The box has 2 GiB of RAM (t3.small), now shared with the FusionAuth JVM
([ADR-006](../../docs/adr/006-fusionauth-container.md)), so these guardrails
still earn their keep. The compose file caps the container at
`mem_limit: 256m` and shrinks `shared_buffers` to 64MB (default 128MB); a
1 GiB swapfile (provisioned by `infra/user_data.sh.tftpl`) is the second
layer of defense against the OOM killer.

## Data & backups

- Data lives on the named volume `simulationdb-data`, mounted at
  `/var/lib/postgresql` (PG 18 moved PGDATA to a version-specific subdir —
  the pre-18 `.../data` mount silently leaves data outside the volume).
  It survives restarts and redeploys, **not** a box rebuild.
- A weekly cron on the box (Sundays 03:10 UTC, installed by
  `infra/user_data.sh.tftpl`) pipes `pg_dump | gzip` to a private S3 bucket
  where dumps expire after 30 days. The restore drill is
  [ADR-004](../../docs/adr/004-simulationdb-restore-verification.md).

## Poking at it

No host port, so inspection means exec'ing into the container on the box:

```sh
docker exec -it simulationdb psql -U simulation simulation
```

## Deployment

Ships through `deploy.yml` like everything else, minus the image build: the
pipeline creates `simulation-net` idempotently, syncs this compose file,
writes `.env` from the secret, and runs `docker compose up -d`. Liveness is
the compose healthcheck (`pg_isready`).
