# ADR-008: Separate Postgres roles — server admin vs per-database managers

Date: 2026-07-05

Status: **Accepted**

## Context

simulationDB (ADR-003) hosts two databases: `simulation` (the app data) and
`fusionauth` (ADR-006). The `simulation` role has been playing three parts at
once: it is the image's `POSTGRES_USER` and therefore the **cluster
superuser**, it is simulationAPI's app user, and it is FusionAuth's
`DATABASE_ROOT_USERNAME`. That means the app connection string carries
superuser credentials, and FusionAuth holds creds that could read or edit the
simulation data.

## Requirements

- Three distinct roles: a DB **server admin** (superuser), a **simulation
  manager**, and a **fusionauth manager**
- Each manager owns exactly its own database and cannot connect to the other's
- App containers never hold superuser credentials; the superuser is used only
  where it's genuinely needed (backups, FusionAuth schema create/upgrade)
- The weekly backup cron (ADR-003/006) keeps working for both databases
- The model survives a box rebuild without hand-run SQL

## Options

1. **Encode the roles in a first-boot init script and rebuild the infra** —
   `POSTGRES_USER=dbadmin` becomes the initdb superuser; a script in
   `/docker-entrypoint-initdb.d/` creates the two manager roles, their
   databases, and the connect fences on an empty volume
2. **In-place migration** — one-time SQL on the live box (`CREATE ROLE
   dbadmin SUPERUSER`, demote `simulation`, `REVOKE CONNECT ... FROM PUBLIC`),
   then point the pipelines at the new creds
3. **Separate Postgres per app** — full isolation by construction, but a
   second Postgres on a 916 MiB box contradicts ADR-006's whole premise

## Decision

Option 1 — recreate the AWS infra rather than migrate, and make the role
model a property of first boot:

| Role | Privileges | Used by |
| --- | --- | --- |
| `dbadmin` | superuser (initdb's `POSTGRES_USER`) | backup cron, FusionAuth `DATABASE_ROOT_*` (schema create/upgrade), admin poking |
| `simulation` | plain `LOGIN`, owns database `simulation` | simulationAPI's `DATABASE_URL` |
| `fusionauth` | plain `LOGIN`, owns database `fusionauth` | FusionAuth runtime (`DATABASE_USERNAME`) |

- `containers/simulationDB/initdb/01-roles.sh` (synced by the deploy
  pipeline, executed by the postgres image only when initializing an empty
  data volume) creates both manager roles and the `fusionauth` database, and
  revokes `CONNECT` from `PUBLIC` on every database so each manager can only
  reach its own
- The deploy pipeline writes the manager passwords into simulationDB's `.env`
  (`SIMULATION_ROLE_PASSWORD`, `FUSIONAUTH_ROLE_PASSWORD`) for the script,
  and points FusionAuth's `DATABASE_ROOT_*` at `dbadmin`
- New GitHub secret: `DBADMIN_PASSWORD`; `SIMULATIONDB_PASSWORD` and
  `FUSIONAUTHDB_PASSWORD` shrink to their single remaining meaning — the
  manager roles' passwords

## Rationale

- **Least privilege where it counts:** the credential FusionAuth holds at
  runtime can no longer touch the simulation data, and vice versa —
  `REVOKE CONNECT` blocks it at the connection layer, not just the table layer
- **Rebuild over migrate:** the box is cattle (ADR-003: the S3 dumps are the
  durability story, the volume is not). A live migration would leave the role
  model as tribal knowledge; the init script makes it reproducible on every
  future rebuild for free
- **Backups keep working unchanged:** the cron already dumps as
  `$POSTGRES_USER` from simulationDB's `.env` — that's now `dbadmin`, the one
  role that can reach both databases
- **FusionAuth is already built for this split:** `DATABASE_ROOT_*` vs
  `DATABASE_USERNAME` is its native two-credential model; we were just
  feeding both slots from the same superuser

## Tradeoffs

- **The rebuild is destructive:** the named volume dies with the box. The
  `simulation` data can be restored from the weekly dump (ADR-004), but the
  restore now happens as `dbadmin` with the `simulation` role pre-existing.
  FusionAuth must be reconfigured (Setup Wizard, `poker_equity` app, and a
  fresh `FUSIONAUTH_CLIENT_SECRET` — or restored from its own dump, which
  preserves the existing client id/secret)
- One more secret to manage and rotate (`DBADMIN_PASSWORD`)
- The init script only runs on an empty volume — a password rotation still
  needs `ALTER ROLE` by hand (or a redeploy-plus-rebuild); the `.env` rewrite
  alone updates what the *clients* send, not what Postgres checks
- Dev access via the ADR-005 toggle now requires choosing a role: `simulation`
  sees only the app database; use `dbadmin` for cross-database work
