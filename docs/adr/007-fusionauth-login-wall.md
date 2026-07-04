# ADR-007: FusionAuth login wall for the app (simulationAPI as OIDC relying party)

Date: 2026-07-04

Status: **Accepted**

## Requirements
- Put the public app at `https://allin.makejohnacoffee.com` (the simulationWeb
  SPA) behind a login page — no anonymous access to any of it.
- Use the FusionAuth IdP already on the box ([ADR-006](006-fusionauth-container.md))
  and its `poker_equity` OAuth application, which is configured as a
  **confidential** client (client secret, client authentication required,
  authorization-code + refresh grants).
- Don't stand up a second user store — FusionAuth *is* the user store.
- Fit the existing shape: containers behind the host nginx, secrets written to
  `.env` by `deploy.yml`, no new always-on JVM/process on the 916 MiB box.

## Options

Two decisions: what plays the OAuth **relying-party** role, and how the app is
gated in the request path.

### Relying party
1. **Reuse simulationAPI as a BFF** — the Fastify backend already on the box
   ([ADR-002](002-fastify-backend-container.md)) runs the authorization-code
   flow, validates the id_token, and issues a session cookie. No new container.
2. **A dedicated `oauth2-proxy` container** — a purpose-built, config-only OIDC
   proxy. One more upstream image, but auth code we don't own.
3. **OIDC in the SPA (public client)** — a browser-only PKCE flow. Rejected:
   the FusionAuth app is *confidential* (holds a secret), and a static SPA has
   nowhere safe to keep one or to hold a session.

### Gating mechanism
1. **nginx `auth_request`** — the app vhost asks simulationAPI (`GET
   /auth/verify`) on every hit; 200 serves the SPA, 401 bounces to login. nginx
   stays the reverse proxy and static path; the SPA's assets never route
   through Node.
2. **Full reverse-proxy through the BFF** — route the whole vhost through
   simulationAPI, which proxies authenticated requests on to the static SPA.
   More coupling and puts Node in the hot path for every asset.

## Decision
Relying party **option 1**, gating **option 2 → 1** (i.e. reuse simulationAPI,
gate with `auth_request`).

simulationAPI gains a small OIDC relying-party module (`src/auth.ts`) exposing:

| Route | Purpose |
| --- | --- |
| `GET /auth/login` | Start the flow: stash `state`/`nonce`/return-path in a short-lived signed cookie, redirect to FusionAuth `/oauth2/authorize` |
| `GET /auth/callback` | Verify `state`, exchange the code at `/oauth2/token` (confidential client), validate the id_token against FusionAuth's JWKS + `nonce`, set the session cookie |
| `GET /auth/verify` | The `auth_request` target: 200 if the session cookie is valid, else 401. Body-less, no network calls |
| `GET /auth/me` | Session identity for the SPA (email/name/sub) or 401 |
| `GET /auth/logout` | Clear the session cookie, hand off to FusionAuth `/oauth2/logout` |

The session is a **stateless HS256 JWT cookie** (`jose`), `httpOnly` + `secure`
+ `sameSite=lax`, 8 h TTL — no server-side session table. FusionAuth remains
the sole user store; simulationAPI holds no accounts.

The host nginx `allin` vhost ([ADR-001](001-expose-simulationweb.md)) gets an
`auth_request /auth/verify;` on `location /` (proxying the SPA on `:8080`) and a
never-gated `location /auth/` proxying to simulationAPI on `:3003`. A 401 from
the check redirects to `/auth/login?rd=$request_uri`.

## Rationale
- **No second user store.** FusionAuth already owns identities (ADR-006).
  Reusing simulationAPI as a thin relying party keeps it that way; a library
  like Better Auth (the tech-stack default) would want its own `user`/`session`
  tables — duplicating what FusionAuth is for. This is the same deliberate step
  outside the Better-Auth default that ADR-006 already took, and is recorded
  here as its continuation.
- **The confidential client fits a backend, not a SPA.** The `poker_equity` app
  requires client authentication and has a secret; the code exchange must
  happen server-side. simulationAPI is that server.
- **`auth_request` keeps concerns separate.** nginx stays the static/reverse
  proxy; simulationAPI only answers the auth subrequest and runs the OIDC dance.
  The SPA's assets don't flow through Node, and the gate is one directive.
- **`jose` over a heavier RP library.** `jose` does the cryptographically hard
  parts (JWKS fetch + id_token signature verification, session-cookie signing);
  the rest is a `state`/`nonce` check and one `fetch` to the token endpoint.
  Boring and minimal — the most boring stack that solves it.
- **No new process on the box.** Reusing simulationAPI adds zero containers and
  no memory pressure, which matters on the t3.micro (ADR-006).

## Tradeoffs
- **simulationAPI now has two jobs** — the results CRUD API *and* the app's
  front-door auth. A simulationAPI outage or bad deploy now also breaks login.
  Accepted: it's one small service on one box, and both jobs are lightweight.
- **The `api.makejohnacoffee.com` API stays unauthenticated for now.** This ADR
  gates the *SPA*, not the data API. The API is a different origin; sharing this
  host-only cookie cross-subdomain would leak it (e.g. to `id.`), so a follow-up
  should protect the API with a bearer token / access-token check rather than
  this cookie. Called out, not solved here.
- **Stateless sessions can't be revoked server-side.** Logout clears the cookie
  and ends the FusionAuth session, but an already-issued cookie stays valid
  until its 8 h expiry. A refresh-token rotation + short access window is future
  work; fine at this scale.
- **Two more secrets.** `FUSIONAUTH_CLIENT_SECRET` (the `poker_equity` client
  secret) and `SESSION_SECRET` (the cookie signing key), written into
  simulationAPI's `.env` by `deploy.yml` like the DB creds.
- **nginx change ⇒ box rebuild by default.** The vhost lives in
  `user_data.sh.tftpl`, which only runs at first boot, and a rebuild wipes the
  on-box Postgres volume (restore is the weekly S3 backup, ADR-006). Apply the
  vhost live over SSH and reload nginx to avoid the rebuild; the committed
  `user_data` change keeps a future rebuild reproducible either way.

## Implementation
1. **simulationAPI** — `src/auth.ts` (the routes above) using `jose` +
   `@fastify/cookie`; registered in `src/app.ts`. Config via env
   (`AUTH_ISSUER`, `AUTH_CLIENT_ID`, `AUTH_CLIENT_SECRET`, `AUTH_REDIRECT_URI`,
   `AUTH_APP_URL`, `SESSION_SECRET`) with dev fallbacks for everything but the
   two secrets. Unit tests cover the `/auth/verify` contract and the login
   redirect.
2. **Secrets / .env** — `deploy.yml` extends simulationAPI's `.env` with the
   `AUTH_*` config and requires the new `FUSIONAUTH_CLIENT_SECRET` and
   `SESSION_SECRET` GitHub secrets.
3. **Nginx** — `user_data.sh.tftpl`: the `${app_domain}` vhost gains
   `auth_request /auth/verify`, an `@signin` redirect, and a `/auth/` location
   proxying to `127.0.0.1:3003` (reusing the `auth_perip` rate-limit zone).
4. **FusionAuth** — add `https://allin.makejohnacoffee.com/auth/callback` to the
   `poker_equity` application's authorized redirect URLs (the bare root stays,
   for the post-logout redirect).
5. **Rollout** — set the two GitHub secrets, deploy simulationAPI, apply the
   nginx vhost (live SSH reload, or a box rebuild).
