import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApp, WEB_ORIGIN } from "./app.js";

test("GET /health returns ok", async () => {
  const app = await buildApp();
  const res = await app.inject({ method: "GET", url: "/health" });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { status: "ok" });

  await app.close();
});

test("CORS allows the web origin", async () => {
  const app = await buildApp();
  const res = await app.inject({
    method: "GET",
    url: "/health",
    headers: { origin: WEB_ORIGIN },
  });

  assert.equal(res.headers["access-control-allow-origin"], WEB_ORIGIN);

  await app.close();
});

test("CORS does not allow other origins", async () => {
  const app = await buildApp();
  const res = await app.inject({
    method: "GET",
    url: "/health",
    headers: { origin: "https://evil.example.com" },
  });

  assert.equal(res.headers["access-control-allow-origin"], undefined);

  await app.close();
});
