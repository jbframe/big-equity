import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApp } from "../app.js";
import { __test } from "../gateway/auth.js";

// A well-formed payload, shaped like what the batch simulators produce.
const payload = {
  source: "simulationTS",
  heroHand: ["ad", "5d", "4s", "ks", "10c"],
  villainHand: ["ah", "ac", "kd", "4c", "2h"],
  board: ["3s", "9d", "js"],
  simulations: 10_000,
  heroEquity: 48.226,
  high: { heroWins: 4102, villainWins: 5211, splits: 687 },
  low: { heroWins: 3007, villainWins: 2411, splits: 1592, noLow: 2990 },
  scoop: { hero: 2101, villain: 2854, none: 5045 },
  noScoop: {
    high: { heroWins: 2001, villainWins: 2357, splits: 687 },
    low: { heroWins: 1506, villainWins: 1011, splits: 1592, noLow: 936 },
  },
};

// The CRUD routes sit behind the gateway's session check, so every request
// here carries a session cookie minted the same way the gateway mints them.
const token = await __test.signSession({ sub: "user-1", email: "u1@b.com" });
const session = { cookies: { [__test.SESSION_COOKIE]: token } };

test("results routes refuse an anonymous request", async () => {
  const app = await buildApp();
  const calls: { method: "GET" | "POST" | "DELETE"; url: string }[] = [
    { method: "POST", url: "/results" },
    { method: "GET", url: "/results" },
    { method: "GET", url: "/results/1" },
    { method: "DELETE", url: "/results/1" },
  ];
  for (const { method, url } of calls) {
    const res = await app.inject({ method, url, payload });
    assert.equal(res.statusCode, 401, `${method} ${url} should 401`);
  }

  await app.close();
});

test("a spoofed x-user-sub header does not grant access", async () => {
  const app = await buildApp();
  const res = await app.inject({
    method: "GET",
    url: "/results",
    headers: { "x-user-sub": "user-1" },
  });

  assert.equal(res.statusCode, 401);

  await app.close();
});

// Validation failures reject in the zod layer before any handler (or the
// database) is touched, so these run without a database.

test("POST /results rejects a malformed card", async () => {
  const app = await buildApp();
  const res = await app.inject({
    method: "POST",
    url: "/results",
    payload: { ...payload, heroHand: ["ad", "5d", "4s", "ks", "11x"] },
    ...session,
  });

  assert.equal(res.statusCode, 400);

  await app.close();
});

test("POST /results rejects a short hand", async () => {
  const app = await buildApp();
  const res = await app.inject({
    method: "POST",
    url: "/results",
    payload: { ...payload, villainHand: ["ah", "ac"] },
    ...session,
  });

  assert.equal(res.statusCode, 400);

  await app.close();
});

test("POST /results rejects a missing tally", async () => {
  const app = await buildApp();
  const { scoop: _scoop, ...withoutScoop } = payload;
  const res = await app.inject({
    method: "POST",
    url: "/results",
    payload: withoutScoop,
    ...session,
  });

  assert.equal(res.statusCode, 400);

  await app.close();
});

test("GET /results/:id rejects a non-numeric id", async () => {
  const app = await buildApp();
  const res = await app.inject({ method: "GET", url: "/results/abc", ...session });

  assert.equal(res.statusCode, 400);

  await app.close();
});

// The full CRUD round trip needs a real Postgres. Point DATABASE_URL at a
// disposable one (e.g. `docker run --rm -e POSTGRES_PASSWORD=... -p 5432:5432
// postgres:18-alpine`) and this test migrates it and exercises every route.
test(
  "CRUD round trip",
  { skip: !process.env["DATABASE_URL"] && "DATABASE_URL not set" },
  async () => {
    const { runMigrations } = await import("./db/migrate.js");
    const app = await buildApp();
    await runMigrations(app.log);

    const created = await app.inject({
      method: "POST",
      url: "/results",
      payload,
      ...session,
    });
    assert.equal(created.statusCode, 201);
    const { id } = created.json();
    assert.ok(Number.isInteger(id));

    const fetched = await app.inject({
      method: "GET",
      url: `/results/${id}`,
      ...session,
    });
    assert.equal(fetched.statusCode, 200);
    assert.equal(fetched.json().heroEquity, payload.heroEquity);
    assert.deepEqual(fetched.json().noScoop, payload.noScoop);

    const listed = await app.inject({
      method: "GET",
      url: "/results?limit=5",
      ...session,
    });
    assert.equal(listed.statusCode, 200);
    assert.ok(listed.json().results.some((r: { id: number }) => r.id === id));

    const deleted = await app.inject({
      method: "DELETE",
      url: `/results/${id}`,
      ...session,
    });
    assert.equal(deleted.statusCode, 204);

    const gone = await app.inject({
      method: "GET",
      url: `/results/${id}`,
      ...session,
    });
    assert.equal(gone.statusCode, 404);

    await app.close();
  },
);
