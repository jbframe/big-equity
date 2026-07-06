import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApp } from "../app.js";
import { __test } from "../gateway/auth.js";

// The settings routes sit behind the gateway's session check, so every
// authenticated request carries a session cookie minted the same way the
// gateway mints them.
const token = await __test.signSession({ sub: "user-1", email: "u1@b.com" });
const session = { cookies: { [__test.SESSION_COOKIE]: token } };

test("settings routes refuse an anonymous request", async () => {
  const app = await buildApp();
  const calls: { method: "GET" | "PUT"; url: string }[] = [
    { method: "GET", url: "/settings" },
    { method: "PUT", url: "/settings" },
  ];
  for (const { method, url } of calls) {
    const res = await app.inject({
      method,
      url,
      payload: { gameType: "holdem" },
    });
    assert.equal(res.statusCode, 401, `${method} ${url} should 401`);
  }

  await app.close();
});

test("a CORS preflight permits the PUT the SPA sends", async () => {
  const app = await buildApp();
  const res = await app.inject({
    method: "OPTIONS",
    url: "/settings",
    headers: {
      origin: "https://allin.makejohnacoffee.com",
      "access-control-request-method": "PUT",
      "access-control-request-headers": "content-type",
    },
  });

  assert.equal(res.statusCode, 204);
  assert.equal(
    res.headers["access-control-allow-origin"],
    "https://allin.makejohnacoffee.com",
  );
  const allowed = String(res.headers["access-control-allow-methods"]);
  assert.ok(allowed.includes("PUT"), `PUT missing from "${allowed}"`);
  assert.ok(allowed.includes("DELETE"), `DELETE missing from "${allowed}"`);

  await app.close();
});

test("a spoofed x-user-sub header does not grant access", async () => {
  const app = await buildApp();
  const res = await app.inject({
    method: "GET",
    url: "/settings",
    headers: { "x-user-sub": "user-1" },
  });

  assert.equal(res.statusCode, 401);

  await app.close();
});

// Validation failures reject in the zod layer before any handler (or the
// database) is touched, so these run without a database.

test("PUT /settings rejects an unknown game type", async () => {
  const app = await buildApp();
  const res = await app.inject({
    method: "PUT",
    url: "/settings",
    payload: { gameType: "razz" },
    ...session,
  });

  assert.equal(res.statusCode, 400);

  await app.close();
});

test("PUT /settings rejects a missing game type", async () => {
  const app = await buildApp();
  const res = await app.inject({
    method: "PUT",
    url: "/settings",
    payload: {},
    ...session,
  });

  assert.equal(res.statusCode, 400);

  await app.close();
});
