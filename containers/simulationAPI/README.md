# simulationAPI

Fastify HTTP API backend for the equity simulator ([ADR-002](../../docs/adr/002-fastify-backend-container.md)).
A long-running service — unlike the batch simulators — that is the CRUD layer
in front of the private simulationDB container
([ADR-003](../../docs/adr/003-simulationdb-container.md)). Every route is
schema-first: request/response shapes are defined once in zod and give runtime
validation plus inferred handler types via `fastify-type-provider-zod`. For
the database routes those zod schemas are *derived from the Drizzle table
definitions* (`drizzle-zod`), so table shape and API shape share one
definition.

The browser front end at `https://allin.makejohnacoffee.com` calls this API on
a different subdomain, so CORS is enabled for that origin only.

It also doubles as the **OIDC relying party** that guards that front end
([ADR-007](../../docs/adr/007-fusionauth-login-wall.md)): a small `src/auth.ts`
module runs the authorization-code flow against FusionAuth
([ADR-006](../../docs/adr/006-fusionauth-container.md)), validates the id_token,
and issues a stateless signed session cookie. The host nginx `allin` vhost uses
`auth_request` to ask `GET /auth/verify` on every hit, so no anonymous request
reaches the SPA. FusionAuth stays the sole user store — there are no accounts
here.

## Prerequisites

- Node.js 24 (LTS — see `.nvmrc`)

## Setup

```sh
cd containers/simulationAPI
npm install
```

## Run

```sh
npm run dev      # tsx watch mode on src/main.ts
npm test         # integration tests (fastify inject, no port needed)
npm run typecheck
npm run build    # emit JS + .d.ts to dist/
npm start        # run the compiled server (node dist/main.js)
```

The server listens on `0.0.0.0:3003` (override with `PORT`).

At startup it applies any pending SQL migrations from `drizzle/` (with a
bounded connect-retry loop — the DB is a separate compose project, so
`depends_on` can't order them) before accepting traffic. `DATABASE_URL`
defaults to a local dev Postgres
(`postgresql://simulation:simulation@localhost:5432/simulation`); on the box
the deploy pipeline writes it into `.env`.

## Database workflow

Tables are defined in TypeScript (`src/db/schema.ts`). To change the schema:
edit it, run `npx drizzle-kit generate`, and commit the SQL it emits under
`drizzle/` — the next deploy applies it at startup. Migrations are plain SQL:
reviewable in the PR, fixable by hand.

To poke at the production DB from your machine, `npm run db:enable` opens the
dev-only 5432 toggle for your current IP via the `db-access` workflow
([ADR-005](../../docs/adr/005-simulationdb-dev-access-toggle.md));
`npm run db:disable` closes it again.

## Routes

| Route                 | Response           | Purpose                                        |
| --------------------- | ------------------ | ---------------------------------------------- |
| `GET /health`         | `{"status":"ok"}`  | Liveness for the compose healthcheck and nginx |
| `GET /auth/login`     | `302` to FusionAuth | Start the OIDC login flow                      |
| `GET /auth/callback`  | `302` to the app    | Code exchange + id_token check, sets session   |
| `GET /auth/verify`    | `200` / `401`       | nginx `auth_request` gate (session cookie)     |
| `GET /auth/me`        | identity or `401`   | Who's signed in (for the SPA)                  |
| `GET /auth/logout`    | `302` to FusionAuth | Clear session, end the IdP session             |
| `POST /results`       | `201` created row  | Store a batch simulator run                    |
| `GET /results`        | `{results: [...]}` | List runs, newest first (`limit`/`offset`)     |
| `GET /results/:id`    | row or `404`       | Fetch one run                                  |
| `DELETE /results/:id` | `204` or `404`     | Remove a run                                   |

Results are immutable records of a batch run, so there is deliberately no
update route. The `/auth/*` routes ([ADR-007](../../docs/adr/007-fusionauth-login-wall.md))
are same-origin with the SPA (reached via the `allin` vhost), so they need no
CORS; the results API stays CORS-restricted to the web origin.

## Layout

| File                | Responsibility                                        |
| ------------------- | ----------------------------------------------------- |
| `src/app.ts`        | App factory: zod compilers, CORS, cookie, route registration |
| `src/health.ts`     | `GET /health` route + zod schema                      |
| `src/auth.ts`       | OIDC relying-party routes + session cookie (ADR-007)  |
| `src/results.ts`    | CRUD routes; zod schemas derived from the table       |
| `src/db/schema.ts`  | Drizzle table definitions + shared tally schemas      |
| `src/db/client.ts`  | pg pool + drizzle instance (`DATABASE_URL`)           |
| `src/db/migrate.ts` | Startup migration runner with bounded retry           |
| `src/main.ts`       | Entry point: builds the app, migrates, listens (3003) |
| `drizzle.config.ts` | drizzle-kit config (schema → `drizzle/` SQL)          |
| `drizzle/`          | Generated SQL migrations, committed                   |
| `src/*.test.ts`     | Integration tests via `app.inject`; the CRUD round trip runs when `DATABASE_URL` points at a disposable Postgres |

## Deployment

Ships through the standard pipeline: `deploy.yml` auto-discovers the
`Dockerfile`, builds a multi-stage image (digest-pinned `node:24-alpine`),
pushes to GHCR, and runs `docker compose up -d` on the box. The compose file
binds the container to `127.0.0.1:3003` — nginx (443) is the only public path
in, per the [ADR-001](../../docs/adr/001-expose-simulationweb.md) pattern.
Public exposure at `https://api.makejohnacoffee.com` is provisioned by
Terraform at instance boot (`infra/user_data.sh.tftpl`): its own Let's Encrypt
cert plus per-IP rate limiting at the proxy (10 r/s, burst 20, 429 on excess).

The deploy pipeline also writes the OIDC config into `.env`: `AUTH_ISSUER`,
`AUTH_CLIENT_ID`, `AUTH_REDIRECT_URI`, `AUTH_APP_URL`, plus the two secrets
`FUSIONAUTH_CLIENT_SECRET` (the `poker_equity` client secret) and
`SESSION_SECRET` (the session-cookie signing key) from GitHub secrets. The
`allin` vhost's `auth_request` gate lives in `user_data.sh.tftpl` alongside the
`api` vhost ([ADR-007](../../docs/adr/007-fusionauth-login-wall.md)).
