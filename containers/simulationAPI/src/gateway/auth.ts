import { randomBytes } from "node:crypto";
import proxy from "@fastify/http-proxy";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  createRemoteJWKSet,
  jwtVerify,
  SignJWT,
  type JWTPayload,
} from "jose";

// simulationAPI is the app gateway for the simulationWeb SPA (ADR-010): the
// OIDC relying party (a "BFF", ADR-007) and the SPA proxy in one place.
// FusionAuth (ADR-006) is the identity provider and the sole user store —
// this file runs the authorization-code flow against it, validates the
// returned id_token, mints a signed session cookie, and proxies the app
// hostname to the static SPA container. Login is optional: the SPA is served
// to anonymous visitors too (the simulator runs client-side); only the data
// routes require a session (requireSession), so nothing is persisted for an
// anonymous user. No user tables here; that's FusionAuth's job.
//
// Everything in this file is host-constrained to the app hostname
// (allin.makejohnacoffee.com): the reverse proxy sends that whole vhost here,
// and requests on the api hostname 404 on these routes instead of exposing a
// second login surface. The browser never talks to these routes
// cross-origin, so they need no CORS.

// All config is env-driven and written into .env by the deploy pipeline. The
// fallbacks target the poker_equity FusionAuth application so a developer can
// read the flow without secrets; the two secrets (client secret, session key)
// have deliberately unusable dev defaults and MUST be set in production.
const ISSUER = process.env["AUTH_ISSUER"] ?? "https://id.makejohnacoffee.com";
const CLIENT_ID =
  process.env["AUTH_CLIENT_ID"] ?? "c37d57fd-f64d-42fc-bf27-048d658009ca";
const CLIENT_SECRET = process.env["AUTH_CLIENT_SECRET"] ?? "";
const REDIRECT_URI =
  process.env["AUTH_REDIRECT_URI"] ??
  "https://allin.makejohnacoffee.com/auth/callback";
const APP_URL = process.env["AUTH_APP_URL"] ?? "https://allin.makejohnacoffee.com";
// Host header the gateway routes belong to — the find-my-way `host`
// constraint matches it exactly.
const APP_HOST = new URL(APP_URL).host;
// The backend CRUD routes on the api hostname check the same session (see
// requireSession below), so the cookie is scoped to the parent domain
// (makejohnacoffee.com) instead of host-only — the browser then sends it to
// every subdomain, and SameSite=Lax keeps that to same-site requests.
const COOKIE_DOMAIN =
  process.env["AUTH_COOKIE_DOMAIN"] ??
  new URL(APP_URL).hostname.replace(/^[^.]+\./, "");
// HS256 key for our own session + transaction cookies. The dev fallback keeps
// local `npm test` working; the deploy pipeline writes a real 32-byte secret.
const SESSION_SECRET = new TextEncoder().encode(
  process.env["SESSION_SECRET"] ?? "dev-insecure-session-secret-change-me",
);

// FusionAuth OAuth2/OIDC endpoints, all derived from the issuer.
const AUTHORIZE_ENDPOINT = `${ISSUER}/oauth2/authorize`;
// Self-service registration: FusionAuth's hosted signup form, an OAuth
// endpoint shaped exactly like /oauth2/authorize — same params, same code
// response — so /auth/callback handles the return unchanged. Requires
// self-service registration enabled on the poker_equity application in the
// FusionAuth admin UI; without it this endpoint refuses the request.
const REGISTER_ENDPOINT = `${ISSUER}/oauth2/register`;
const TOKEN_ENDPOINT = `${ISSUER}/oauth2/token`;
const LOGOUT_ENDPOINT = `${ISSUER}/oauth2/logout`;
const JWKS = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`));

const SESSION_COOKIE = "be_session";
const TX_COOKIE = "be_auth_tx";
// Session lifetime. Short enough to bound a stolen cookie, long enough not to
// nag; a refresh-token rotation is future work (ADR-007).
const SESSION_TTL = "8h";
const TX_TTL = "10m";

const cookieBase = {
  httpOnly: true,
  // Tracks the app scheme: https (prod default) keeps Secure; the plain-http
  // local.* aliases (scripts/local-stack.sh) would never see a Secure cookie.
  secure: APP_URL.startsWith("https:"),
  sameSite: "lax" as const,
  path: "/",
  domain: COOKIE_DOMAIN,
};

interface SessionClaims extends JWTPayload {
  sub: string;
  email?: string;
  name?: string;
}

// Guard the post-login redirect against open-redirect abuse: only accept a
// same-site absolute path (`/foo`), never a scheme/host or protocol-relative
// `//evil.com`. Anything else falls back to the app root.
function safeReturnPath(rd: unknown): string {
  if (typeof rd === "string" && rd.startsWith("/") && !rd.startsWith("//")) {
    return rd;
  }
  return "/";
}

// Begin an OIDC flow — login or self-service registration. Both stash
// state/nonce/return-path in a short-lived signed cookie (no server-side
// store) and bounce to FusionAuth; they differ only in the endpoint, since
// /oauth2/register and /oauth2/authorize take the same params and both come
// back through /auth/callback with an auth code. The SPA can't do this
// itself: the state/nonce and the tx cookie must be minted server-side.
async function beginOidcFlow(
  req: FastifyRequest,
  reply: FastifyReply,
  endpoint: string,
): Promise<FastifyReply> {
  const state = randomBytes(32).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");
  const rd = safeReturnPath((req.query as Record<string, unknown>)["rd"]);

  const tx = await new SignJWT({ state, nonce, rd })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TX_TTL)
    .sign(SESSION_SECRET);
  reply.setCookie(TX_COOKIE, tx, { ...cookieBase, maxAge: 600 });

  const url = new URL(endpoint);
  url.search = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: "openid email profile",
    state,
    nonce,
  }).toString();
  return reply.redirect(url.toString());
}

async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(SESSION_SECRET);
}

// Reads and verifies the session cookie. Returns the claims or null; never
// throws, so callers can treat "no/!valid session" uniformly.
async function readSession(
  req: FastifyRequest,
): Promise<SessionClaims | null> {
  const token = req.cookies[SESSION_COOKIE];
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SESSION_SECRET);
    return payload as SessionClaims;
  } catch {
    return null;
  }
}

// The auth funnel for the backend role: the gateway verifies the session
// cookie and forwards the caller's identity to the CRUD routes as x-user-*
// headers; an anonymous request is refused before any handler (or the
// database) is touched. The identity headers are deleted from the incoming
// request first so a caller can never spoof one — this function is their
// only writer. The composition root installs it in front of the backend
// routes; when the two roles split into separate containers (ADR-011) it
// becomes the gateway's proxy preHandler and the backend trusts the headers
// off the internal network.
export async function requireSession(req: FastifyRequest, reply: FastifyReply) {
  delete req.headers["x-user-sub"];
  delete req.headers["x-user-email"];
  const session = await readSession(req);
  if (!session) {
    return reply.code(401).send({ message: "not authenticated" });
  }
  req.headers["x-user-sub"] = session.sub;
  if (session.email) req.headers["x-user-email"] = session.email;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Only requests carrying the app hostname match these routes; on any other
  // Host (api.…, bare IP) they don't exist.
  const constraints = { host: APP_HOST };

  // Begin login: bounce to FusionAuth's hosted login page.
  app.get("/auth/login", { constraints }, (req, reply) =>
    beginOidcFlow(req, reply, AUTHORIZE_ENDPOINT),
  );

  // Begin self-service registration: bounce to FusionAuth's hosted signup
  // form. On success FusionAuth redirects back with an auth code and the new
  // user lands authenticated through /auth/callback, exactly like login — so
  // there's no user-creation code or user store here (ADR-006/007).
  app.get("/auth/register", { constraints }, (req, reply) =>
    beginOidcFlow(req, reply, REGISTER_ENDPOINT),
  );

  // OIDC callback: verify state, swap the code for tokens, validate the
  // id_token, then set the session cookie and return the user where they were.
  app.get("/auth/callback", { constraints }, async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;
    const txToken = req.cookies[TX_COOKIE];
    if (!txToken) return reply.code(400).send({ message: "missing login state" });

    let tx: { state: string; nonce: string; rd: string };
    try {
      const { payload } = await jwtVerify(txToken, SESSION_SECRET);
      tx = payload as unknown as { state: string; nonce: string; rd: string };
    } catch {
      return reply.code(400).send({ message: "invalid login state" });
    }
    reply.clearCookie(TX_COOKIE, cookieBase);

    if (!query["code"] || query["state"] !== tx.state) {
      return reply.code(400).send({ message: "state mismatch or missing code" });
    }

    const tokenRes = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: query["code"],
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    });
    if (!tokenRes.ok) {
      req.log.error({ status: tokenRes.status }, "token exchange failed");
      return reply.code(502).send({ message: "token exchange failed" });
    }
    const tokens = (await tokenRes.json()) as { id_token?: string };
    if (!tokens.id_token) {
      return reply.code(502).send({ message: "no id_token in token response" });
    }

    let idClaims: JWTPayload;
    try {
      const { payload } = await jwtVerify(tokens.id_token, JWKS, {
        issuer: ISSUER,
        audience: CLIENT_ID,
      });
      idClaims = payload;
    } catch (err) {
      req.log.error(err, "id_token validation failed");
      return reply.code(502).send({ message: "invalid id_token" });
    }
    if (idClaims["nonce"] !== tx.nonce) {
      return reply.code(400).send({ message: "nonce mismatch" });
    }

    const session = await signSession({
      sub: String(idClaims.sub),
      email: idClaims["email"] as string | undefined,
      name: idClaims["name"] as string | undefined,
    });
    reply.setCookie(SESSION_COOKIE, session, { ...cookieBase, maxAge: 28800 });
    return reply.redirect(APP_URL + tx.rd);
  });

  // Lets the SPA show who's signed in: 200 with the claims, 401 without a
  // valid session.
  app.get("/auth/me", { constraints }, async (req, reply) => {
    const session = await readSession(req);
    if (!session) return reply.code(401).send({ message: "not authenticated" });
    return reply.send({
      sub: session.sub,
      email: session.email ?? null,
      name: session.name ?? null,
    });
  });

  // Clear our session and hand off to FusionAuth's logout so the IdP session
  // ends too, returning to the app afterwards.
  app.get("/auth/logout", { constraints }, async (_req, reply: FastifyReply) => {
    reply.clearCookie(SESSION_COOKIE, cookieBase);
    const logoutUrl = new URL(LOGOUT_ENDPOINT);
    logoutUrl.search = new URLSearchParams({
      client_id: CLIENT_ID,
      post_logout_redirect_uri: APP_URL,
    }).toString();
    return reply.redirect(logoutUrl.toString());
  });

  // The SPA proxy: every other path on the app hostname is proxied to the
  // static SPA container, session or not — login is optional, and the
  // session-gated data routes are what keep anonymous users out of the
  // database. The /auth/* routes above win over this wildcard (path
  // specificity beats it). Read at registration time, not module load, so
  // tests can point it at a stub upstream.
  const webUpstream = process.env["WEB_UPSTREAM"] ?? "http://simulationweb:80";
  await app.register(proxy, {
    upstream: webUpstream,
    constraints,
  });
}

// Exported for tests: lets them mint a session cookie without a real OIDC
// flow, and target the host-constrained gateway routes.
export const __test = { signSession, SESSION_COOKIE, APP_HOST };
