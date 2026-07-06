# ADR-011: Split the gateway and backend roles into separate modules

Date: 2026-07-05

Status: **Accepted** — refines ADR-010's consolidation; no behavior change

## Requirements
- simulationAPI carries two roles (ADR-007, ADR-010): the app gateway for
  simulationWeb (the whole session-gated `allin.…` vhost) and the gateway
  for the API (`api.…` — the CRUD layer in front of simulationDB). Keep
  them in **one container** — one deploy, one DNS name, one image — but
  make the code boundary hard enough that splitting into two containers
  later is mechanical, not archaeology
- No behavior change: same routes, same hostnames, same cookies, same test
  contracts

## Options

### Where the boundary lives
1. **Role modules inside one container** — `src/gateway/` and
   `src/backend/`, each a Fastify plugin owning its own routes *and* its own
   infrastructure plugins; `src/app.ts` shrinks to a composition root that
   registers both
2. **Two containers now** — a real apiGW + simulationBE split: second
   Dockerfile, compose service, GHCR image, deploy branch, and DNS name for
   a service with one table and one user
3. **Status quo** — flat `src/` where `app.ts` registers cookie, CORS, and
   all routes side by side; the roles are separate files but share their
   plumbing

## Decision
Option 1.

- `src/gateway/` — `auth.ts` plus an `index.ts` that registers
  `@fastify/cookie` and the auth routes. Cookies are gateway plumbing;
  Fastify's plugin encapsulation now scopes them to this module.
- `src/backend/` — `health.ts`, `results.ts`, `db/` plus an `index.ts` that
  registers `@fastify/cors` (web origin only) and the routes. CORS is
  backend plumbing — the gateway is same-origin with the SPA — so it moves
  out of the root and into this module.
- `src/app.ts` becomes a composition root: Fastify instance, zod compilers,
  `register(gateway)`, `register(backend)`. It is the only file where the
  two roles meet; `main.ts` stays the single entry point.
- Tests move with their module (`gateway/auth.test.ts`,
  `backend/results.test.ts`); `app.test.ts` keeps the cross-cutting checks.

## Rationale
- **The seam already existed** — `auth.ts` never imported `results.ts` or
  `db/`; the only tangling was `app.ts` registering everyone's plugins in
  one place. This makes the implicit boundary explicit and lets Fastify's
  encapsulation enforce it: the backend cannot read cookies, the gateway
  answers no CORS preflight.
- **A future split is now mechanical**: each module already owns everything
  it needs, so promoting one to a container is a new `main.ts` + Dockerfile
  + compose service, with `app.ts` deleted rather than untangled.
- **The boring option** (tech-stack steering): two containers today would
  buy nothing but a second deploy pipeline for the same failure domain —
  the edge sends both hostnames to the same box either way.

## Tradeoffs
- **The split is convention, not isolation.** One process, one crash, one
  `package.json` — a runaway CRUD query still stalls SPA serving. That is
  ADR-010's accepted tradeoff, unchanged.
- **One layer more indirection**: two `index.ts` files exist only to pair a
  role with its plugins. Cheap, and it is exactly the file that becomes the
  future container's app factory.
- Deep-import paths got longer (`backend/db/migrate.ts` resolves
  `../../../drizzle`); path assumptions live in `drizzle.config.ts` and the
  migrate runner and were updated together.

## Implementation
- `git mv` preserved history: `auth*` → `src/gateway/`, `health.ts`,
  `results*`, `db/` → `src/backend/`
- Cookie registration moved `app.ts` → `gateway/index.ts`; CORS (and the
  `WEB_ORIGIN` export) moved `app.ts` → `backend/index.ts`
- Updated path literals: `drizzle.config.ts` schema path, `migrate.ts`
  migrations folder, `package.json` test glob (`src/**/*.test.ts`)
- No Dockerfile, compose, edge, or deploy changes — same image layout
  (`dist/main.js`), same `simulationapi:3003`
