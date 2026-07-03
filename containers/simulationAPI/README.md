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
| `POST /results`       | `201` created row  | Store a batch simulator run                    |
| `GET /results`        | `{results: [...]}` | List runs, newest first (`limit`/`offset`)     |
| `GET /results/:id`    | row or `404`       | Fetch one run                                  |
| `DELETE /results/:id` | `204` or `404`     | Remove a run                                   |

Results are immutable records of a batch run, so there is deliberately no
update route.

## Layout

| File                | Responsibility                                        |
| ------------------- | ----------------------------------------------------- |
| `src/app.ts`        | App factory: zod compilers, CORS, route registration  |
| `src/health.ts`     | `GET /health` route + zod schema                      |
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
