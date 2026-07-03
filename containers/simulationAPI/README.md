# simulationAPI

Fastify HTTP API backend for the equity simulator ([ADR-002](../../docs/adr/002-fastify-backend-container.md)).
A long-running service — unlike the batch simulators — that will become the
CRUD layer in front of a future private DB container. Every route is
schema-first: request/response shapes are defined once in zod and give runtime
validation plus inferred handler types via `fastify-type-provider-zod`.

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

## Routes

| Route         | Response           | Purpose                                          |
| ------------- | ------------------ | ------------------------------------------------ |
| `GET /health` | `{"status":"ok"}`  | Liveness for the compose healthcheck and nginx   |

## Layout

| File              | Responsibility                                        |
| ----------------- | ----------------------------------------------------- |
| `src/app.ts`      | App factory: zod compilers, CORS, route registration  |
| `src/health.ts`   | `GET /health` route + zod schema                      |
| `src/main.ts`     | Entry point: builds the app and listens (port 3003)   |
| `src/app.test.ts` | Integration tests via `app.inject`                    |

## Deployment

Ships through the standard pipeline: `deploy.yml` auto-discovers the
`Dockerfile`, builds a multi-stage image (digest-pinned `node:24-alpine`),
pushes to GHCR, and runs `docker compose up -d` on the box. The compose file
binds the container to `127.0.0.1:3003` — nginx (443) is the only public path
in, per the [ADR-001](../../docs/adr/001-expose-simulationweb.md) pattern.
Public exposure at `https://api.makejohnacoffee.com` is provisioned by
Terraform at instance boot (`infra/user_data.sh.tftpl`): its own Let's Encrypt
cert plus per-IP rate limiting at the proxy (10 r/s, burst 20, 429 on excess).
