import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { after, test } from "node:test";
import { buildApp } from "../app.js";
import { __test } from "./auth.js";

// The OIDC round-trip (login/callback) needs a live FusionAuth, so it's
// covered by the integration path, not here. These unit tests pin the
// gateway contracts (ADR-010): the session wall in front of the SPA, the
// host constraint that keeps the auth routes off the api hostname, and the
// login redirect the SPA depends on.

// Every gateway route only exists on the app hostname.
const appHost = { host: __test.APP_HOST };

// Stub SPA upstream: echoes the path so tests can see the proxy passed
// through. WEB_UPSTREAM is read when authRoutes registers, so setting it
// before buildApp() is enough.
const upstream = http.createServer((req, res) => {
  res.end(`spa:${req.url}`);
});
await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
process.env["WEB_UPSTREAM"] =
  `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
after(() => upstream.close());

test("the wall redirects an anonymous request to /auth/login", async () => {
  const app = await buildApp();
  const res = await app.inject({
    method: "GET",
    url: "/some/page",
    headers: appHost,
  });
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers["location"], "/auth/login?rd=%2Fsome%2Fpage");
  await app.close();
});

test("the wall redirects a garbage session cookie like no session", async () => {
  const app = await buildApp();
  const res = await app.inject({
    method: "GET",
    url: "/",
    headers: appHost,
    cookies: { [__test.SESSION_COOKIE]: "not-a-jwt" },
  });
  assert.equal(res.statusCode, 302);
  assert.match(String(res.headers["location"]), /^\/auth\/login\?rd=/);
  await app.close();
});

test("the wall proxies to the SPA with a valid session cookie", async () => {
  const app = await buildApp();
  const token = await __test.signSession({ sub: "user-123", email: "a@b.com" });
  const res = await app.inject({
    method: "GET",
    url: "/index.html",
    headers: appHost,
    cookies: { [__test.SESSION_COOKIE]: token },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, "spa:/index.html");
  await app.close();
});

test("GET /auth/login redirects to the FusionAuth authorize endpoint", async () => {
  const app = await buildApp();
  const res = await app.inject({
    method: "GET",
    url: "/auth/login",
    headers: appHost,
  });
  assert.equal(res.statusCode, 302);
  const location = res.headers["location"] as string;
  assert.match(location, /\/oauth2\/authorize\?/);
  assert.match(location, /response_type=code/);
  // A login transaction cookie must be planted for the callback to verify.
  assert.match(String(res.headers["set-cookie"]), /be_auth_tx=/);
  await app.close();
});

test("gateway routes do not exist on other hostnames", async () => {
  const app = await buildApp();
  // The api hostname must expose neither the login flow nor the SPA proxy —
  // its API routes are the unconstrained ones.
  for (const url of ["/auth/login", "/some/page"]) {
    const res = await app.inject({
      method: "GET",
      url,
      headers: { host: "api.makejohnacoffee.com" },
    });
    assert.equal(res.statusCode, 404, `${url} should 404 on the api host`);
  }
  await app.close();
});

test("unconstrained routes still work regardless of hostname", async () => {
  const app = await buildApp();
  const res = await app.inject({
    method: "GET",
    url: "/health",
    headers: { host: "api.makejohnacoffee.com" },
  });
  assert.equal(res.statusCode, 200);
  await app.close();
});
