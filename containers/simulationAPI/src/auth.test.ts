import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApp } from "./app.js";
import { __test } from "./auth.js";

// The OIDC round-trip (login/callback) needs a live FusionAuth, so it's
// covered by the integration path, not here. These unit tests pin the two
// contracts nginx and the SPA depend on: the auth_request gate and the
// session-cookie check.

test("GET /auth/verify is 401 without a session cookie", async () => {
  const app = await buildApp();
  const res = await app.inject({ method: "GET", url: "/auth/verify" });
  assert.equal(res.statusCode, 401);
  await app.close();
});

test("GET /auth/verify is 200 with a valid session cookie", async () => {
  const app = await buildApp();
  const token = await __test.signSession({ sub: "user-123", email: "a@b.com" });
  const res = await app.inject({
    method: "GET",
    url: "/auth/verify",
    cookies: { [__test.SESSION_COOKIE]: token },
  });
  assert.equal(res.statusCode, 200);
  await app.close();
});

test("GET /auth/verify is 401 with a garbage cookie", async () => {
  const app = await buildApp();
  const res = await app.inject({
    method: "GET",
    url: "/auth/verify",
    cookies: { [__test.SESSION_COOKIE]: "not-a-jwt" },
  });
  assert.equal(res.statusCode, 401);
  await app.close();
});

test("GET /auth/login redirects to the FusionAuth authorize endpoint", async () => {
  const app = await buildApp();
  const res = await app.inject({ method: "GET", url: "/auth/login" });
  assert.equal(res.statusCode, 302);
  const location = res.headers["location"] as string;
  assert.match(location, /\/oauth2\/authorize\?/);
  assert.match(location, /response_type=code/);
  // A login transaction cookie must be planted for the callback to verify.
  assert.match(String(res.headers["set-cookie"]), /be_auth_tx=/);
  await app.close();
});
