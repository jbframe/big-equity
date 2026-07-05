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

## Roles

One Postgres, three roles
([ADR-008](../../docs/adr/008-separate-db-roles.md)), created at first boot
by [`initdb/01-roles.sh`](initdb/01-roles.sh) — the image runs it only when
initializing an **empty** data volume, so the model ships via box rebuild,
not in-place migration:

| Role | Privileges | Used by |
| --- | --- | --- |
| `dbadmin` | superuser (initdb's `POSTGRES_USER`) | backup cron, FusionAuth schema create/upgrade |
| `simulation` | owns database `simulation` | simulationAPI |
| `fusionauth` | owns database `fusionauth` | FusionAuth runtime |

`CONNECT` is revoked from `PUBLIC` on every database, so each manager role
can reach **only its own** database; only the superuser sees both.

## Configuration

Credentials live in `.env` next to the compose file on the box —
**written by the deploy pipeline on every deploy** from GitHub secrets
(rotation = update the secret + redeploy — but note the passwords Postgres
*checks* were set at first boot; rotating for real means `ALTER ROLE` or a
rebuild, ADR-008):

| Variable | Value |
| --- | --- |
| `POSTGRES_USER` | `dbadmin` — the cluster superuser (ADR-008) |
| `POSTGRES_PASSWORD` | from the `DBADMIN_PASSWORD` secret |
| `POSTGRES_DB` | `simulation` |
| `SIMULATION_ROLE_PASSWORD` | from `SIMULATIONDB_PASSWORD` — for `initdb/01-roles.sh` |
| `FUSIONAUTH_ROLE_PASSWORD` | from `FUSIONAUTHDB_PASSWORD` — for `initdb/01-roles.sh` |

The same deploy writes simulationAPI's `DATABASE_URL`
(`postgresql://simulation:…@simulationdb:5432/simulation`). Keep the secrets
URL-safe (alphanumeric) — `SIMULATIONDB_PASSWORD` is interpolated into that
URL unescaped.

## Memory guardrails

The box has 916 MiB of RAM (t3.micro), now shared with the FusionAuth JVM
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

No host port, so inspection means exec'ing into the container on the box
(local socket connections are trusted, so no password prompt):

```sh
docker exec -it simulationdb psql -U simulation simulation   # app data
docker exec -it simulationdb psql -U dbadmin simulation      # superuser
```

## Deployment

Ships through `deploy.yml` like everything else, minus the image build: the
pipeline creates `simulation-net` idempotently, syncs this compose file,
writes `.env` from the secret, and runs `docker compose up -d`. Liveness is
the compose healthcheck (`pg_isready`).
