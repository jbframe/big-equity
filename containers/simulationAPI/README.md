# simulationAPI

Fastify HTTP service — a long-running container, unlike the batch simulators
— with **two roles**, one per hostname:

1. **API gateway** (`api.makejohnacoffee.com`) — the gateway for the API:
   the CRUD layer in front of the private simulationDB container. Every route is
   schema-first: request/response shapes are defined once in zod and give
   runtime validation plus inferred handler types via
   `fastify-type-provider-zod`. For the database routes those zod schemas are
   *derived from the Drizzle table definitions* (`drizzle-zod`), so table
   shape and API shape share one definition. The browser front end at
   `https://allin.makejohnacoffee.com` calls this API on a different
   subdomain, so CORS is enabled for that origin only.

2. **App gateway** (`allin.makejohnacoffee.com`) — the login wall that guards
   the simulationWeb front end: `src/gateway/auth.ts`
   runs the authorization-code flow against FusionAuth, validates the
   id_token, issues a stateless signed session cookie, and proxies the whole
   `allin.…` hostname to the static SPA container — but only when that cookie
   is valid, so no anonymous request reaches the SPA. FusionAuth stays the
   sole user store — there are no accounts here.

The two roles share this container but not code: each lives in its own
module (`src/gateway/`, `src/backend/`) that registers its own plugins —
the cookie support only the gateway uses, the CORS headers only the backend
needs — and they meet only in `src/app.ts`, the composition root. Splitting
them into separate containers later is a matter of giving each module its
own entry point.

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

Tables are defined in TypeScript (`src/backend/db/schema.ts`). To change the schema:
edit it, run `npx drizzle-kit generate`, and commit the SQL it emits under
`drizzle/` — the next deploy applies it at startup. Migrations are plain SQL:
reviewable in the PR, fixable by hand.

To poke at the production DB from your machine, `npm run db:enable` opens the
dev-only 5432 toggle for your current IP via the `db-access` workflow;
`npm run db:disable` closes it again.

## Routes

| Route                 | Response           | Purpose                                        |
| --------------------- | ------------------ | ---------------------------------------------- |
| `GET /health`         | `{"status":"ok"}`  | Liveness for the compose healthcheck           |
| `GET /auth/login` †   | `302` to FusionAuth | Start the OIDC login flow                      |
| `GET /auth/callback` † | `302` to the app    | Code exchange + id_token check, sets session   |
| `GET /auth/me` †      | identity or `401`   | Who's signed in (for the SPA)                  |
| `GET /auth/logout` †  | `302` to FusionAuth | Clear session, end the IdP session             |
| any other path †      | SPA proxy or `302`  | The login wall: valid session → proxied to `simulationweb:80`; anonymous → `/auth/login` |
| `POST /results`       | `201` created row  | Store a batch simulator run                    |
| `GET /results`        | `{results: [...]}` | List runs, newest first (`limit`/`offset`)     |
| `GET /results/:id`    | row or `404`       | Fetch one run                                  |
| `DELETE /results/:id` | `204` or `404`     | Remove a run                                   |

† Gateway routes: registered with a
Fastify `host` constraint for `allin.makejohnacoffee.com` — on the api
hostname they don't exist (404). They're same-origin with the SPA, so they
need no CORS; the results API stays CORS-restricted to the web origin.

Results are immutable records of a batch run, so there is deliberately no
update route.

## Layout

| File                        | Responsibility                                        |
| --------------------------- | ----------------------------------------------------- |
| `src/main.ts`               | Entry point: builds the app, migrates, listens (3003) |
| `src/app.ts`                | Composition root: zod compilers + registers the two role modules |
| `src/gateway/index.ts`      | Gateway module entry: cookie plugin + auth routes     |
| `src/gateway/auth.ts`       | App gateway: OIDC routes, session cookie, SPA login-wall proxy |
| `src/backend/index.ts`      | Backend module entry: CORS + health + results routes  |
| `src/backend/health.ts`     | `GET /health` route + zod schema                      |
| `src/backend/results.ts`    | CRUD routes; zod schemas derived from the table       |
| `src/backend/db/schema.ts`  | Drizzle table definitions + shared tally schemas      |
| `src/backend/db/client.ts`  | pg pool + drizzle instance (`DATABASE_URL`)           |
| `src/backend/db/migrate.ts` | Startup migration runner with bounded retry           |
| `drizzle.config.ts`         | drizzle-kit config (schema → `drizzle/` SQL)          |
| `drizzle/`                  | Generated SQL migrations, committed                   |
| `src/**/*.test.ts`          | Integration tests via `app.inject`, kept next to the module they pin; the CRUD round trip runs when `DATABASE_URL` points at a disposable Postgres |

## Component diagram (C4)

How the modules above fit together inside the container, and which
neighbouring containers each one talks to. The container-level view lives in
the [root README](../../README.md#container-diagram-c4):

```mermaid
%%{init: {'themeVariables': {'edgeLabelBackground': '#1f2937'}}}%%
graph TB
    Proxy["<b>reverseProxy</b><br/>[Container: nginx + certbot]<br/>Sends both vhosts here:<br/>api.… and allin.…"]
    Web["<b>simulationWeb</b><br/>[Container: React SPA on nginx]<br/>Static front-end"]
    Auth["<b>fusionAuth</b><br/>[Container: FusionAuth, JVM]<br/>Identity provider, sole user store"]
    DB[("<b>simulationDB</b><br/>[Container: PostgreSQL 18]<br/>simulation_results table")]

    subgraph API["simulationAPI · Node.js / Fastify · :3003"]
        Main["<b>main.ts</b><br/>[Component: entry point]<br/>Builds the app, migrates,<br/>then listens"]
        App["<b>app.ts</b><br/>[Component: composition root]<br/>Fastify + zod compilers;<br/>registers the two role modules —<br/>the only place they meet"]

        subgraph GWM["src/gateway — app-gateway role (cookie plugin lives here)"]
            Gateway["<b>gateway/auth.ts</b><br/>[Component: app gateway]<br/>OIDC relying party + login wall:<br/>/auth/* routes, signed session<br/>cookie, session-gated SPA proxy —<br/>host-constrained to allin.…"]
        end

        subgraph BEM["src/backend — API-gateway role (CORS lives here)"]
            Health["<b>backend/health.ts</b><br/>[Component: route]<br/>GET /health liveness for<br/>the compose healthcheck"]
            Results["<b>backend/results.ts</b><br/>[Component: routes]<br/>CRUD for simulation results;<br/>zod schemas derived from the table"]
            Schema["<b>backend/db/schema.ts</b><br/>[Component: Drizzle schema]<br/>Table definitions +<br/>shared tally schemas"]
            Client["<b>backend/db/client.ts</b><br/>[Component: DB client]<br/>pg pool + drizzle instance<br/>(DATABASE_URL)"]
            Migrate["<b>backend/db/migrate.ts</b><br/>[Component: migration runner]<br/>Applies drizzle/ SQL at startup;<br/>bounded connect-retry"]
        end
    end

    Proxy -- "HTTP :3003<br/>both hostnames" --> App
    Main -- "builds" --> App
    Main -- "runs before listen" --> Migrate
    App -- "registers" --> Health
    App -- "registers" --> Gateway
    App -- "registers" --> Results
    Gateway -. "OIDC: authorize/logout redirects;<br/>back-channel code→token, JWKS<br/>HTTP :9011" .-> Auth
    Gateway -- "Proxies every non-/auth path<br/>when the session is valid<br/>HTTP :80" --> Web
    Results -- "insert / select / delete" --> Client
    Results -- "derives zod schemas from" --> Schema
    Migrate -- "migrates via" --> Client
    Client -- "postgres :5432" --> DB

    classDef component fill:#85bbf0,stroke:#5d82a8,color:#000000
    classDef container fill:#438dd5,stroke:#2e6295,color:#ffffff
    class Main,App,Health,Gateway,Results,Schema,Client,Migrate component
    class Proxy,Web,Auth,DB container
    style API fill:transparent,stroke:#94a3b8,stroke-dasharray:6 4,color:#94a3b8
    style GWM fill:transparent,stroke:#64748b,stroke-dasharray:3 3,color:#94a3b8
    style BEM fill:transparent,stroke:#64748b,stroke-dasharray:3 3,color:#94a3b8

    linkStyle default stroke:#94a3b8,color:#ffffff
    linkStyle 0,7 stroke:#4fb477
    linkStyle 6 stroke:#38bdf8
    linkStyle 11 stroke:#e46e6e
```

## Deployment

Ships through the standard pipeline: `deploy.yml` auto-discovers the
`Dockerfile`, builds a multi-stage image (digest-pinned `node:24-alpine`),
pushes to GHCR, and runs `docker compose up -d` on the box. The container has
no host ports — the reverseProxy container is the only public path in,
reaching `simulationapi:3003` over `simulation-net`. Public exposure
at `https://api.makejohnacoffee.com` comes with its own Let's Encrypt cert
plus per-IP rate limiting at the proxy (10 r/s, burst 20, 429 on excess). The
`allin.…` vhost also lands here wholesale — this container is the app gateway
and forwards it to the SPA behind the session check.

The deploy pipeline also writes the OIDC config into `.env`: `AUTH_ISSUER`,
`AUTH_CLIENT_ID`, `AUTH_REDIRECT_URI`, `AUTH_APP_URL`, plus the two secrets
`FUSIONAUTH_CLIENT_SECRET` (the `poker_equity` client secret) and
`SESSION_SECRET` (the session-cookie signing key) from GitHub secrets. The
SPA upstream defaults to `http://simulationweb:80` in code (`WEB_UPSTREAM`
overrides it, which the tests use).
