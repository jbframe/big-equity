import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  createRemoteJWKSet,
  jwtVerify,
  SignJWT,
  type JWTPayload,
} from "jose";

// simulationAPI doubles as the OIDC relying party (a "BFF") that guards the
// simulationWeb SPA (ADR-007). FusionAuth (ADR-006) is the identity provider
// and the sole user store — this file only runs the authorization-code flow
// against it, validates the returned id_token, and mints a signed session
// cookie. No user tables here; that's FusionAuth's job.
//
// The public login wall is enforced by nginx `auth_request` calling GET
// /auth/verify on every hit to https://allin.makejohnacoffee.com; the browser
// never talks to these routes cross-origin, so they need no CORS.

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
// HS256 key for our own session + transaction cookies. The dev fallback keeps
// local `npm test` working; the deploy pipeline writes a real 32-byte secret.
const SESSION_SECRET = new TextEncoder().encode(
  process.env["SESSION_SECRET"] ?? "dev-insecure-session-secret-change-me",
);

// FusionAuth OAuth2/OIDC endpoints, all derived from the issuer.
const AUTHORIZE_ENDPOINT = `${ISSUER}/oauth2/authorize`;
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
  secure: true,
  sameSite: "lax" as const,
  path: "/",
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

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Begin login: stash state/nonce/return-path in a short-lived signed cookie
  // (no server-side session store needed) and bounce to FusionAuth.
  app.get("/auth/login", async (req, reply) => {
    const state = randomBytes(32).toString("base64url");
    const nonce = randomBytes(32).toString("base64url");
    const rd = safeReturnPath((req.query as Record<string, unknown>)["rd"]);

    const tx = await new SignJWT({ state, nonce, rd })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(TX_TTL)
      .sign(SESSION_SECRET);
    reply.setCookie(TX_COOKIE, tx, { ...cookieBase, maxAge: 600 });

    const authorizeUrl = new URL(AUTHORIZE_ENDPOINT);
    authorizeUrl.search = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: "code",
      redirect_uri: REDIRECT_URI,
      scope: "openid email profile",
      state,
      nonce,
    }).toString();
    return reply.redirect(authorizeUrl.toString());
  });

  // OIDC callback: verify state, swap the code for tokens, validate the
  // id_token, then set the session cookie and return the user where they were.
  app.get("/auth/callback", async (req, reply) => {
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

  // nginx `auth_request` target: 200 when the session cookie is valid, 401
  // otherwise. Body-less and dependency-free so it's cheap on every request.
  app.get("/auth/verify", async (req, reply) => {
    const session = await readSession(req);
    if (!session) return reply.code(401).send();
    return reply.code(200).send();
  });

  // Lets the SPA show who's signed in; same 200/401 contract as /verify.
  app.get("/auth/me", async (req, reply) => {
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
  app.get("/auth/logout", async (_req, reply: FastifyReply) => {
    reply.clearCookie(SESSION_COOKIE, cookieBase);
    const logoutUrl = new URL(LOGOUT_ENDPOINT);
    logoutUrl.search = new URLSearchParams({
      client_id: CLIENT_ID,
      post_logout_redirect_uri: APP_URL,
    }).toString();
    return reply.redirect(logoutUrl.toString());
  });
}

// Exported for tests: lets them mint a session cookie without a real OIDC flow.
export const __test = { signSession, SESSION_COOKIE };
