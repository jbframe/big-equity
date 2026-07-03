# ADR-006: FusionAuth container

Date: 2026-07-03

Status: **Accepted**

## Requirements
- Add a self-hosted identity provider (FusionAuth) as another container on the box, deployed through the existing `deploy.yml` pipeline
- **Reuse the existing simulationDB Postgres** — do not run FusionAuth's bundled Postgres container. FusionAuth gets its own isolated database (a fresh namespace), not simulationDB's application tables
- **Do not run OpenSearch.** FusionAuth's stock deployment ships an OpenSearch container as its search backend; on this box a JVM search cluster is out of the memory budget
- Browser-reachable, since auth flows run in the browser — exposed over HTTPS on its own subdomain, following the ADR-001 nginx pattern
- Fit the box's memory: one always-on JVM alongside Postgres and the small web/API containers
- Secrets handled like simulationDB's — written into `.env` by the deploy pipeline, rotatable by updating a GitHub secret

## Options

Three decisions: the auth solution, its database, and its search engine.

### Auth solution
1. **FusionAuth, self-hosted container** — full IdP (OAuth2/OIDC, admin UI) as one upstream image; user data stays on our box and DB
2. **Better Auth (the tech-stack default)** — a TypeScript library embedded in simulationAPI; no new container, but no admin UI and it's a library, not a standalone IdP
3. **A SaaS provider (Auth0/WorkOS)** — managed, but standing spend and user data leaves the box; the tech-stack reserves these for enterprise SSO/SCIM needs we don't have

### Database
1. **Reuse simulationDB, FusionAuth creates its own `fusionauth` database** — one Postgres engine on the box; FusionAuth's silent mode bootstraps its db + role on first boot
2. **A second, FusionAuth-owned Postgres container** — the vendor default; simplest to copy, but doubles the Postgres footprint on a 2 GiB box

### Search engine
1. **Database search (`SEARCH_TYPE=database`)** — FusionAuth uses Postgres for user search, no search container
2. **OpenSearch (the default)** — a full search container; better for very large user counts, far heavier

## Decision
Auth **option 1**, database **option 1**, search **option 1**.

FusionAuth runs as a compose-only container (`containers/fusionAuth/`, upstream
`fusionauth/fusionauth-app` image, no Dockerfile — like simulationDB). It:

- connects to the existing **simulationDB** over `simulation-net`
  (`jdbc:postgresql://simulationdb:5432/fusionauth`); no bundled Postgres. On
  first boot, silent mode uses the simulationDB **superuser** (`simulation`, via
  the `SIMULATIONDB_PASSWORD` secret as `DATABASE_ROOT_*`) to create its own
  `fusionauth` database and runtime role, then migrates its schema. simulationDB
  stays the sole Postgres on the box
- sets **`SEARCH_TYPE=database`** — no OpenSearch container at all
- publishes loopback-only `127.0.0.1:9011`; nginx terminates TLS for
  **`id.makejohnacoffee.com`** and proxies to it (ADR-001 pattern)

The box moves **t3.micro → t3.small** (1 → 2 GiB) and the swapfile **512 MiB →
1 GiB** to hold the JVM alongside Postgres.

## Rationale
- **One database engine, isolated data.** FusionAuth's own `fusionauth`
  database sits on the Postgres already on the box — no second Postgres, and no
  mixing with simulationDB's application tables. The weekly `pg_dump` backup
  cron (ADR-003) dumps the `simulation` database; FusionAuth's own data is
  covered separately (see Tradeoffs).
- **OpenSearch off is the headline.** Database search is more than adequate at
  this user scale and saves an entire JVM search container; `SEARCH_TYPE=database`
  is a supported, first-class FusionAuth mode (its own GitHub Action compose
  runs exactly this way).
- **Self-hosted over the library/SaaS defaults.** The tech stack defaults to
  Better Auth, with a SaaS provider reserved for enterprise SSO/SCIM. FusionAuth
  is a deliberate step outside that: a standalone IdP with an admin console and
  OIDC out of the box, keeping user data on our infrastructure with no standing
  SaaS spend — chosen for this project's needs and recorded here as the
  exception to the steering default.
- **Consistent exposure.** Reusing the nginx-per-subdomain pattern means
  FusionAuth is one more `server` block and one more certbot cert; the container
  never listens on a public interface.

## Tradeoffs
- **A JVM on a small box.** FusionAuth's heap is `512M` (`FUSIONAUTH_APP_MEMORY`)
  and the container is capped at `mem_limit: 1024m`; the t3.small bump and the
  larger swapfile are what make room. If it gets OOM-killed under load, raise
  the instance size or the cap — this is the tightest tenant on the box.
- **Backups don't yet cover the `fusionauth` database.** ADR-003's cron dumps
  only the `simulation` database. Until that cron is widened (or a second dump
  added), FusionAuth's data survives restarts/redeploys via the simulationDB
  volume but **not** a box rebuild. Acceptable while there's no real auth data;
  revisit before it holds accounts worth keeping.
- **Two DB passwords now.** `SIMULATIONDB_PASSWORD` (also used as FusionAuth's DB
  root creds) and a new `FUSIONAUTH_DB_PASSWORD` for its runtime role.
- **Database search has a ceiling.** Fine here; a very large user base would
  eventually want OpenSearch back — at which point the box needs to grow first.
- **Deviates from the tech-stack auth default** (Better Auth) — a conscious
  call, see Rationale.

## Implementation
1. **Container** — `containers/fusionAuth/docker-compose.yml`: upstream
   `fusionauth/fusionauth-app:1.68.0`, `container_name: fusionauth`,
   `127.0.0.1:9011:9011`, `simulation-net` (external), `mem_limit: 1024m`,
   healthcheck on `/api/status`. No Dockerfile.
2. **Secrets / .env** — `deploy.yml` writes `containers/fusionAuth/.env` on every
   deploy from `SIMULATIONDB_PASSWORD` (as `DATABASE_ROOT_*`) and a new
   `FUSIONAUTH_DB_PASSWORD` (as `DATABASE_PASSWORD`), plus `SEARCH_TYPE=database`,
   `FUSIONAUTH_APP_MEMORY=512M`, `FUSIONAUTH_APP_RUNTIME_MODE=production`,
   `FUSIONAUTH_APP_URL=http://localhost:9011` (internal self-URL; the public URL
   is derived from proxied `Host` + `X-Forwarded-Proto`).
3. **Instance** — `instance_type` default `t3.micro → t3.small` (variables.tf).
4. **Nginx + TLS** — `user_data.sh.tftpl`: new `auth_perip` rate-limit zone, an
   `${auth_domain}` vhost proxying to `127.0.0.1:9011` (with
   `client_max_body_size 64m`), and `${auth_domain}` added to the certbot loop.
   New `auth_domain` variable (`id.makejohnacoffee.com`), threaded through the
   `templatefile()` call, plus an `auth_url` output.
5. **Swapfile** — `512 MiB → 1 GiB` in `user_data.sh.tftpl`.
6. **Box rebuild** — the `instance_type` and `user_data` changes both force an
   instance replacement (`user_data_replace_on_change = true`). Add the
   `id.makejohnacoffee.com` DNS A record → Elastic IP and set the
   `FUSIONAUTH_DB_PASSWORD` GitHub secret before rebuilding, then redeploy.
