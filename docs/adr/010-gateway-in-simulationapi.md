# ADR-010: Consolidate the app-gateway concerns in simulationAPI

Date: 2026-07-05

Status: **Accepted** — amends the gating mechanism of ADR-007 and simplifies
the ADR-009 edge

## Requirements
- The reverseProxy container (ADR-009) should handle **certificates and
  hostname routing only** — no application knowledge (login wall, per-app
  path rules) at the edge
- The ADR-007 requirement stands: no anonymous request may reach the SPA, and
  the `/auth/*` session routes must not be exposed on the api hostname
- No behavior change for the browser: same login round-trip, same cookies,
  same hostnames

## Options

### Where the login wall lives
1. **simulationAPI (in-process)** — it is already the OIDC relying party
   holding the session-cookie key; add a session-gated proxy to the SPA and
   the wall and the relying party become one component (the "API gateway +
   Lambda authorizer" roles, collapsed)
2. **The edge nginx (status quo, ADR-007/009)** — `auth_request` subrequests
   per hit; works, but smears app auth policy into the infrastructure layer
3. **simulationWeb's nginx** — keeps the wall in nginx config but adds a
   second config surface and leaves the auth knowledge split across
   containers

### How the api hostname is kept clean
1. **Host constraints in Fastify** — the gateway routes (auth + SPA proxy)
   are registered with a `host` route constraint for the app hostname and
   simply don't exist elsewhere
2. **A `location /auth/ { return 404; }` at the edge (status quo)** — works,
   but is app knowledge in the proxy, which this ADR is removing

## Decision
Wall **option 1**, hostname fencing **option 1**.

- The edge routes the **whole `allin.…` vhost to `simulationapi:3003`** and
  never talks to `simulationweb` at all. Its template is now three dumb
  `proxy_pass` server blocks + TLS + per-IP rate limits.
- `src/auth.ts` becomes the full app gateway: the OIDC routes plus a
  **session-gated `@fastify/http-proxy` wildcard** (upstream
  `http://simulationweb:80`, overridable via `WEB_UPSTREAM`) that redirects
  anonymous requests to `/auth/login?rd=<path>` — replacing nginx
  `auth_request` + `@signin`.
- Every gateway route carries a **`host` constraint** for the app hostname
  (find-my-way matches the Host header), so on `api.…` they 404 from Fastify
  itself; the edge's hand-written `/auth/` 404 block is gone.
- **`GET /auth/verify` is removed** — it existed solely as the `auth_request`
  target; the wall now calls the same session check in-process. `/auth/me`
  remains the SPA's session-introspection endpoint.

## Rationale
- **One owner for one concern.** Relying party, session cookie, wall, and
  host fencing are a single TypeScript module with unit tests
  (`auth.test.ts` pins the redirect, the proxy pass-through, and the 404 on
  the api host) — versus policy split between nginx config and app code.
- **The edge is now generic.** In the managed-AWS analogy the reverseProxy is
  a plain ALB+ACM; simulationAPI plays API Gateway (routing + authorizer +
  backend in one, at this scale a feature, not a smell).
- **Typed, testable gating.** The nginx wall was only testable by deploying;
  the Fastify wall runs in `npm test` with a stub upstream.

## Tradeoffs
- **SPA bytes now flow through node.** Static assets go edge → Fastify proxy
  → simulationweb nginx instead of edge → nginx. At this traffic level the
  overhead is noise; if it ever matters, the SPA is behind a login wall
  anyway — a CDN was never in the path.
- **simulationAPI is even more load-bearing**: it was already the login wall
  (ADR-007 accepted that); now it's also the SPA's serving path. An API
  outage takes the SPA down with it — same failure domain as before, one hop
  earlier.
- **Host-header dependence.** Route constraints trust the `Host` the edge
  forwards (`proxy_set_header Host $host`). Fine here — simulationAPI is
  unreachable except through the edge — but a future direct exposure would
  need to revisit it.

## Implementation
- `@fastify/http-proxy` added to simulationAPI; gateway registration at the
  end of `authRoutes` in `src/auth.ts`
- Edge template (`containers/reverseProxy/templates/default.conf.template`)
  reduced to routing + TLS + rate limits; `auth_request`, `@signin`, and the
  api `/auth/` 404 removed
- No deploy pipeline or secret changes; `WEB_UPSTREAM` defaults to
  `http://simulationweb:80` in code
- Ships with ADR-009's cutover — nothing extra to do on the box
